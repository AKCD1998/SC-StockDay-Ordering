const RELEASE_V2_DATASETS = new Set(["branch_stock"]);

function parseCsv(raw) {
  return String(raw || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function parseStrictInteger(raw, fallback, name, min, max) {
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function parseBoolean(raw, fallback, name) {
  if (raw == null || raw === "") return fallback;
  if (String(raw).toLowerCase() === "true") return true;
  if (String(raw).toLowerCase() === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

export function parseV2Config(env, enabledDatasets) {
  const datasets = parseCsv(env.ADAPOS_SYNC_V2_DATASETS);
  for (const dataset of datasets) {
    if (!RELEASE_V2_DATASETS.has(dataset)) throw new Error(`Unknown CP4 v2 dataset: ${dataset}.`);
    if (!enabledDatasets.includes(dataset)) {
      throw new Error(`CP4 v2 dataset ${dataset} must also be present in ADAPOS_SYNC_DATASETS.`);
    }
  }
  if (new Set(datasets).size !== datasets.length) throw new Error("ADAPOS_SYNC_V2_DATASETS contains duplicates.");

  const batchSize = parseStrictInteger(env.ADAPOS_SYNC_V2_BATCH_SIZE, 100, "ADAPOS_SYNC_V2_BATCH_SIZE", 1, 100);
  const waitForApply = parseBoolean(env.ADAPOS_SYNC_V2_WAIT_FOR_APPLY, true, "ADAPOS_SYNC_V2_WAIT_FOR_APPLY");
  const pollIntervalMs = parseStrictInteger(env.ADAPOS_SYNC_V2_POLL_INTERVAL_MS, 2_000, "ADAPOS_SYNC_V2_POLL_INTERVAL_MS", 1, Number.MAX_SAFE_INTEGER);
  const waitTimeoutMs = parseStrictInteger(env.ADAPOS_SYNC_V2_WAIT_TIMEOUT_MS, 1_800_000, "ADAPOS_SYNC_V2_WAIT_TIMEOUT_MS", 1, Number.MAX_SAFE_INTEGER);
  if (datasets.length > 0 && !waitForApply) {
    throw new Error("ADAPOS_SYNC_V2_WAIT_FOR_APPLY must be true when CP4 v2 is enabled.");
  }
  return { datasets, batchSize, waitForApply, pollIntervalMs, waitTimeoutMs, enabled: datasets.length > 0 };
}

export function createDeterministicBatches(records, batchSize) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("CP4 branch_stock snapshot has zero records; refusing empty finalize.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("CP4 batch size must be an integer from 1 to 100.");
  const batches = [];
  for (let offset = 0; offset < records.length; offset += batchSize) {
    batches.push({ batchSeq: batches.length + 1, records: records.slice(offset, offset + batchSize) });
  }
  return batches;
}

export function isRetryableV2Error(error) {
  if (error?.code === "REQUEST_TIMEOUT") return true;
  const status = Number(error?.status);
  if (Number.isFinite(status)) return status === 429 || (status >= 500 && status <= 599);
  return true;
}

export async function startHybridRun({ baseUrl, branchCode, postJson, setSyncRunId }) {
  setSyncRunId(null);
  const result = await postJson(`${baseUrl}/api/sync/run-start`, {
    syncType: `adapos_branch_${branchCode}`,
    branchCode,
    ingestionMode: "hybrid_v2",
    v2Datasets: ["branch_stock"],
  });
  const syncRunId = result?.runId;
  if (syncRunId == null || String(syncRunId).trim() === "") throw new Error("CP4 hybrid run-start returned no runId.");
  setSyncRunId(String(syncRunId));
  return String(syncRunId);
}

const defaultSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

export async function uploadStagedBatches({
  baseUrl, syncRunId, records, batchSize, postJson, sleep = defaultSleep,
  random = Math.random, logger = console, maxAttempts = 3,
}) {
  const batches = createDeterministicBatches(records, batchSize);
  for (const batch of batches) {
    const payload = { syncRunId: String(syncRunId), dataset: "branch_stock", batchSeq: batch.batchSeq, records: batch.records };
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await postJson(`${baseUrl}/api/sync/v2/batches`, payload);
        break;
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryableV2Error(error)) throw error;
        const delayMs = Math.min(5_000, 1_000 * 2 ** (attempt - 1) + Math.floor(random() * 250));
        logger.warn(`CP4: upload retry batchSeq=${batch.batchSeq} attempt=${attempt}/${maxAttempts}`);
        await sleep(delayMs);
      }
    }
  }
  return { dataset: "branch_stock", batchCount: batches.length, recordCount: records.length };
}

export async function handoffBranchStock({
  v2Enabled, baseUrl, syncRunId, branchCode, records, v2BatchSize,
  v1BatchSize, postJson, postV1Batches, retryOptions = {}, dependencies = {},
}) {
  if (v2Enabled) {
    const manifest = await uploadStagedBatches({
      baseUrl, syncRunId, records, batchSize: v2BatchSize, postJson, ...dependencies,
    });
    return { mode: "hybrid_v2", manifest, sent: 0 };
  }
  if (records.length === 0) return { mode: "v1", manifest: null, sent: 0 };
  const sent = await postV1Batches({
    url: `${baseUrl}/api/branch-stock/sync`, records, batchSize: v1BatchSize,
    extraBody: { branchCode }, post: postJson, ...retryOptions,
  });
  return { mode: "v1", manifest: null, sent };
}

export async function finalizeRun({
  baseUrl, syncRunId, manifest, postJson, sleep = defaultSleep,
  random = Math.random, logger = console, maxAttempts = 3,
}) {
  const url = `${baseUrl}/api/sync/v2/runs/${encodeURIComponent(syncRunId)}/finalize`;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await postJson(url, manifest);
      return manifest;
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableV2Error(error)) throw error;
      const delayMs = Math.min(5_000, 1_000 * 2 ** (attempt - 1) + Math.floor(random() * 250));
      logger.warn(`CP4: finalize retry attempt=${attempt}/${maxAttempts}`);
      await sleep(delayMs);
    }
  }
  return manifest;
}

export function assertApprovedReceiptsComplete({ v2Enabled, approvedFailed }) {
  if (v2Enabled && approvedFailed > 0) {
    const error = new Error(`CP4 finalize blocked: dataset=approved_receipts failedDocuments=${approvedFailed}.`);
    error.code = "CP4_V1_DATASET_FAILED";
    throw error;
  }
}

export async function completeSyncRun({
  v2Enabled, approvedFailed = 0, finalize, poll, writeSuccessRunLog,
}) {
  assertApprovedReceiptsComplete({ v2Enabled, approvedFailed });
  if (v2Enabled) {
    await finalize();
    await poll();
  }
  return writeSuccessRunLog();
}

export async function waitForApplied({
  baseUrl, syncRunId, getJson, pollIntervalMs, waitTimeoutMs,
  sleep = defaultSleep, now = Date.now, logger = console,
}) {
  const deadline = now() + waitTimeoutMs;
  while (now() < deadline) {
    try {
      const status = await getJson(`${baseUrl}/api/sync/v2/runs/${encodeURIComponent(syncRunId)}`);
      if (status.overallStatus === "success" && status.applyStatus === "applied") return status;
      if (status.overallStatus === "failed" || status.applyStatus === "failed") {
        const error = new Error(`CP4 apply failed for run ${syncRunId}.`);
        error.code = "CP4_APPLY_FAILED";
        throw error;
      }
    } catch (error) {
      if (error?.code === "CP4_APPLY_FAILED") throw error;
      if (!isRetryableV2Error(error)) {
        const pollError = new Error(`CP4 poll failed for run ${syncRunId}${error?.status ? ` (HTTP ${error.status})` : ""}.`);
        pollError.code = "CP4_POLL_FAILED";
        pollError.status = error?.status;
        pollError.cause = error;
        throw pollError;
      }
      logger.warn(`CP4: poll warning runId=${syncRunId}`);
    }
    const remainingMs = deadline - now();
    if (remainingMs > 0) await sleep(Math.min(pollIntervalMs, remainingMs));
  }
  const timeoutError = new Error(`CP4 apply wait timed out for run ${syncRunId}.`);
  timeoutError.code = "CP4_WAIT_TIMEOUT";
  throw timeoutError;
}

export function formatCp4Result(result, { runId, records, batches } = {}) {
  const fields = [`CP4: RESULT=${result}`];
  if (runId != null) fields.push(`runId=${runId}`);
  fields.push("dataset=branch_stock");
  if (batches != null) fields.push(`batches=${batches}`);
  if (records != null) fields.push(`records=${records}`);
  return fields.join(" ");
}
