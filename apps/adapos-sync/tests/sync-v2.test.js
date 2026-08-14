import assert from "node:assert/strict";
import test from "node:test";

import {
  assertApprovedReceiptsComplete,
  completeSyncRun,
  createDeterministicBatches,
  finalizeRun,
  formatCp4Result,
  handoffBranchStock,
  isRetryableV2Error,
  parseV2Config,
  startHybridRun,
  uploadStagedBatches,
  waitForApplied,
} from "../src/sync-v2.js";

const enabledDatasets = ["products", "branch_stock", "branch_stock_history"];

test("v2 config defaults off and validates release gates", () => {
  const defaults = parseV2Config({}, enabledDatasets);
  assert.deepEqual(defaults, { datasets: [], batchSize: 100, waitForApply: true, pollIntervalMs: 2000, waitTimeoutMs: 1800000, enabled: false });
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "products" }, enabledDatasets), /Unknown/);
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "branch_stock" }, ["products"]), /must also be present/);
  for (const value of ["0", "101", "1.5", "abc"]) {
    assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_BATCH_SIZE: value }, enabledDatasets), /integer from 1 to 100/);
  }
  assert.throws(() => parseV2Config({ ADAPOS_SYNC_V2_DATASETS: "branch_stock", ADAPOS_SYNC_V2_WAIT_FOR_APPLY: "false" }, enabledDatasets), /must be true/);
});

test("deterministic batches preserve order and exact manifest counts", () => {
  const records = Array.from({ length: 5 }, (_, id) => ({ id }));
  const batches = createDeterministicBatches(records, 2);
  assert.deepEqual(batches.map((batch) => batch.batchSeq), [1, 2, 3]);
  assert.deepEqual(batches.flatMap((batch) => batch.records), records);
  assert.deepEqual(batches.map((batch) => batch.records.length), [2, 2, 1]);
  assert.throws(() => createDeterministicBatches([], 100), /zero records/);
});

test("hybrid run-start clears stale identity, sends contract body, and requires runId", async () => {
  const events = [];
  const runId = await startHybridRun({
    baseUrl: "https://api.test", branchCode: "005",
    setSyncRunId: (value) => events.push(["set", value]),
    postJson: async (url, body) => { events.push(["post", url, body]); return { runId: 77 }; },
  });
  assert.equal(runId, "77");
  assert.deepEqual(events, [
    ["set", null],
    ["post", "https://api.test/api/sync/run-start", { syncType: "adapos_branch_005", branchCode: "005", ingestionMode: "hybrid_v2", v2Datasets: ["branch_stock"] }],
    ["set", "77"],
  ]);
  await assert.rejects(startHybridRun({ baseUrl: "x", branchCode: "000", setSyncRunId: () => {}, postJson: async () => ({}) }), /no runId/);
  await assert.rejects(startHybridRun({ baseUrl: "x", branchCode: "000", setSyncRunId: () => {}, postJson: async () => { throw new Error("offline"); } }), /offline/);
});

test("feature off uses exact v1 endpoint/body and never calls v2", async () => {
  const calls = [];
  const result = await handoffBranchStock({
    v2Enabled: false, baseUrl: "https://api.test", branchCode: "000",
    records: [{ productCode: "P1", qty: 1, syncedAt: "2026-07-29T00:00:00Z" }],
    v1BatchSize: 100, postJson: async () => assert.fail("postJson is delegated, not called directly"),
    postV1Batches: async (options) => { calls.push(options); return 1; },
  });
  assert.equal(result.mode, "v1"); assert.equal(result.sent, 1);
  assert.equal(calls[0].url, "https://api.test/api/branch-stock/sync");
  assert.deepEqual(calls[0].extraBody, { branchCode: "000" });
  assert.equal(calls[0].batchSize, 100);
});

test("v1 registers reconciliation after all writes and registration failure remains shadow-only", async () => {
  const records = [{ productCode: "P1", qty: 2, syncedAt: "2026-07-29T00:00:00Z" }];
  const trace = [];
  const result = await handoffBranchStock({
    v2Enabled: false, baseUrl: "https://api.test", syncRunId: "7", branchCode: "000",
    records, v1BatchSize: 100,
    postV1Batches: async () => { trace.push("stock-committed"); return 1; },
    postJson: async (url, body) => { trace.push(url); assert.equal(body.reconciliation.recordCount, 1); },
  });
  assert.deepEqual(trace, [
    "stock-committed",
    "https://api.test/api/sync/v1/runs/7/reconcile-branch-stock",
  ]);
  assert.equal(result.reconciliationRegistered, true);

  const warnings = [];
  const nonBlocking = await handoffBranchStock({
    v2Enabled: false, baseUrl: "https://api.test", syncRunId: "8", branchCode: "000",
    records, v1BatchSize: 100, postV1Batches: async () => 1,
    postJson: async () => { throw new Error("offline"); },
    logger: { warn: (line) => warnings.push(line) },
  });
  assert.equal(nonBlocking.sent, 1);
  assert.equal(nonBlocking.reconciliationRegistered, false);
  assert.match(warnings[0], /REGISTRATION_FAILED runId=8 branch=000/);
});

test("feature on uses v2 only with deterministic payload and no v1 fallback", async () => {
  const posts = []; let v1Calls = 0;
  const records = [1, 2, 3].map((id) => ({ productCode: `P${id}`, qty: id, syncedAt: "2026-07-29T00:00:00Z" }));
  const result = await handoffBranchStock({
    v2Enabled: true, baseUrl: "https://api.test", syncRunId: "9", branchCode: "000", records,
    v2BatchSize: 2, postJson: async (url, body) => posts.push({ url, body }),
    postV1Batches: async () => { v1Calls += 1; },
  });
  assert.equal(v1Calls, 0);
  assert.deepEqual(
    { dataset: result.manifest.dataset, batchCount: result.manifest.batchCount, recordCount: result.manifest.recordCount },
    { dataset: "branch_stock", batchCount: 2, recordCount: 3 },
  );
  assert.equal(result.manifest.reconciliation.recordCount, 3);
  assert.deepEqual(posts.map((call) => call.body.batchSeq), [1, 2]);
  assert.deepEqual(posts.flatMap((call) => call.body.records), records);
});

test("v2 upload retries only transient failures with byte-equivalent payload and counts once", async () => {
  let calls = 0; const serialized = [];
  const manifest = await uploadStagedBatches({
    baseUrl: "x", syncRunId: "1", records: [{ productCode: "P1", qty: 1, syncedAt: "2026-07-29T00:00:00Z" }], batchSize: 100,
    sleep: async () => {}, random: () => 0, logger: { warn: () => {} },
    postJson: async (_url, body) => { calls += 1; serialized.push(JSON.stringify(body)); if (calls < 3) throw Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" }); },
  });
  assert.equal(calls, 3); assert.equal(new Set(serialized).size, 1);
  assert.deepEqual(
    { dataset: manifest.dataset, batchCount: manifest.batchCount, recordCount: manifest.recordCount },
    { dataset: "branch_stock", batchCount: 1, recordCount: 1 },
  );
  assert.equal(isRetryableV2Error(new TypeError("network")), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 429 })), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 503 })), true);
  assert.equal(isRetryableV2Error(Object.assign(new Error(), { status: 400 })), false);
  let badCalls = 0;
  await assert.rejects(uploadStagedBatches({ baseUrl: "x", syncRunId: "1", records: [{ productCode: "P1", qty: 1, syncedAt: "2026-07-29T00:00:00Z" }], batchSize: 100, sleep: async () => {}, postJson: async () => { badCalls += 1; throw Object.assign(new Error("bad"), { status: 422 }); } }), /bad/);
  assert.equal(badCalls, 1);
});

test("finalize sends the exact uploaded manifest once", async () => {
  const calls = []; const manifest = { dataset: "branch_stock", batchCount: 2, recordCount: 150 };
  await finalizeRun({ baseUrl: "https://api.test", syncRunId: "12", manifest, postJson: async (...args) => calls.push(args) });
  assert.deepEqual(calls, [["https://api.test/api/sync/v2/runs/12/finalize", manifest]]);
});

test("polling succeeds only after applied, survives transient GET, and is bounded", async () => {
  let time = 0; let calls = 0; const warnings = [];
  const result = await waitForApplied({
    baseUrl: "x", syncRunId: "1", pollIntervalMs: 10, waitTimeoutMs: 100,
    now: () => time, sleep: async (ms) => { time += ms; }, logger: { warn: (message) => warnings.push(message) },
    getJson: async () => { calls += 1; if (calls === 1) throw new TypeError("network"); if (calls === 2) return { overallStatus: "running", applyStatus: "pending" }; return { overallStatus: "success", applyStatus: "applied" }; },
  });
  assert.equal(result.applyStatus, "applied"); assert.equal(warnings.length, 1);

  await assert.rejects(waitForApplied({ baseUrl: "x", syncRunId: "2", pollIntervalMs: 10, waitTimeoutMs: 20, now: () => time, sleep: async (ms) => { time += ms; }, getJson: async () => ({ overallStatus: "failed", applyStatus: "failed" }) }), (error) => error.code === "CP4_APPLY_FAILED");
  time = 0;
  await assert.rejects(waitForApplied({ baseUrl: "x", syncRunId: "3", pollIntervalMs: 10, waitTimeoutMs: 25, now: () => time, sleep: async (ms) => { time += ms; }, logger: { warn: () => {} }, getJson: async () => ({ overallStatus: "running", applyStatus: "pending" }) }), (error) => error.code === "CP4_WAIT_TIMEOUT");
  assert.equal(time, 25);
});

test("terminal result formatting contains no payload or secret material", () => {
  const line = formatCp4Result("FAILED", { runId: "7", records: 100, batches: 1 });
  assert.equal(line, "CP4: RESULT=FAILED runId=7 dataset=branch_stock batches=1 records=100");
  assert.doesNotMatch(line, /token|api.?key|password|payload|postgresql:\/\//i);
});

test("finalize retries response-lost timeout with the exact URL and manifest", async () => {
  const calls = [];
  const manifest = { dataset: "branch_stock", batchCount: 2, recordCount: 101 };
  await finalizeRun({
    baseUrl: "https://api.test", syncRunId: "run/7", manifest,
    sleep: async () => {}, random: () => 0, logger: { warn: () => {} },
    postJson: async (url, body) => {
      calls.push([url, JSON.stringify(body)]);
      if (calls.length === 1) throw Object.assign(new Error("response lost"), { code: "REQUEST_TIMEOUT" });
    },
  });
  assert.deepEqual(calls, [
    ["https://api.test/api/sync/v2/runs/run%2F7/finalize", JSON.stringify(manifest)],
    ["https://api.test/api/sync/v2/runs/run%2F7/finalize", JSON.stringify(manifest)],
  ]);
});

test("finalize retries 429 and 503 but never retries non-idempotent 4xx", async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    await finalizeRun({
      baseUrl: "x", syncRunId: "1", manifest: {}, sleep: async () => {}, random: () => 0,
      logger: { warn: () => {} },
      postJson: async () => { calls += 1; if (calls === 1) throw Object.assign(new Error("transient"), { status }); },
    });
    assert.equal(calls, 2, `HTTP ${status} should retry once then succeed`);
  }
  for (const status of [400, 401, 409]) {
    let calls = 0;
    await assert.rejects(finalizeRun({
      baseUrl: "x", syncRunId: "1", manifest: {}, sleep: async () => {},
      postJson: async () => { calls += 1; throw Object.assign(new Error("permanent"), { status }); },
    }), /permanent/);
    assert.equal(calls, 1, `HTTP ${status} must not retry`);
  }
  let boundedCalls = 0;
  await assert.rejects(finalizeRun({
    baseUrl: "x", syncRunId: "1", manifest: {}, sleep: async () => {}, random: () => 0,
    logger: { warn: () => {} },
    postJson: async () => { boundedCalls += 1; throw Object.assign(new Error("still down"), { status: 503 }); },
  }), /still down/);
  assert.equal(boundedCalls, 3);
});

test("poll retries timeout, network, 429, and 5xx then recovers", async () => {
  const failures = [
    Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" }),
    new TypeError("network"),
    Object.assign(new Error("busy"), { status: 429 }),
    Object.assign(new Error("down"), { status: 503 }),
  ];
  let time = 0; let calls = 0; let sleeps = 0;
  const result = await waitForApplied({
    baseUrl: "x", syncRunId: "1", pollIntervalMs: 10, waitTimeoutMs: 100,
    now: () => time, sleep: async (ms) => { time += ms; sleeps += 1; }, logger: { warn: () => {} },
    getJson: async () => { const failure = failures[calls++]; if (failure) throw failure; return { overallStatus: "success", applyStatus: "applied" }; },
  });
  assert.equal(result.applyStatus, "applied");
  assert.equal(sleeps, 4);
});

test("poll fails immediately with CP4_POLL_FAILED for permanent HTTP 4xx", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let sleeps = 0; let calls = 0;
    await assert.rejects(waitForApplied({
      baseUrl: "x", syncRunId: "1", pollIntervalMs: 10, waitTimeoutMs: 1_800_000,
      now: () => 0, sleep: async () => { sleeps += 1; },
      getJson: async () => { calls += 1; throw Object.assign(new Error("bad request"), { status }); },
    }), (error) => error.code === "CP4_POLL_FAILED" && error.status === status);
    assert.equal(calls, 1);
    assert.equal(sleeps, 0);
  }
});

// Track C next-slice (2026-08-14): this test used to assert v2Enabled=false
// ("v1 preserves legacy success") reached writeSuccessRunLog() despite
// approvedFailed=2. That was the bug -- a v1 branch could report a green run
// with silently dropped approved-receipt documents. Split into explicit
// per-mode tests (matrix D/E for v2, B/C-adjacent for v1) so each mode's
// contract is unambiguous and the v2 branch is provably byte-for-byte
// unchanged (same error code/message/order as before).

// D: v2 + approvedFailed>0 -- unchanged CP4 behavior: blocks finalize/poll/success.
test("v2 + approved-receipts failure blocks finalize/poll/success with unchanged CP4 error", async () => {
  const trace = [];
  const operation = completeSyncRun({
    v2Enabled: true, approvedFailed: 2,
    finalize: async () => trace.push("finalize"),
    poll: async () => trace.push("poll"),
    writeSuccessRunLog: async () => trace.push("success-run-log"),
  });
  await assert.rejects(operation, (error) => error.code === "CP4_V1_DATASET_FAILED" && /dataset=approved_receipts failedDocuments=2/.test(error.message));
  assert.deepEqual(trace, []);
});

// E: v2 + approvedFailed=0 -- unchanged order: finalize -> poll -> success.
test("v2 + no approved-receipts failure runs finalize, poll, success in order", async () => {
  const trace = [];
  await completeSyncRun({
    v2Enabled: true, approvedFailed: 0,
    finalize: async () => trace.push("finalize"),
    poll: async () => trace.push("poll"),
    writeSuccessRunLog: async () => trace.push("success-run-log"),
  });
  assert.deepEqual(trace, ["finalize", "poll", "success-run-log"]);
});

// B: v1 + approvedFailed>0 -- NEW behavior: reject, never call success run-log.
test("v1 + approved-receipts failure now rejects and never writes success run-log", async () => {
  const trace = [];
  const operation = completeSyncRun({
    v2Enabled: false, approvedFailed: 2,
    finalize: async () => trace.push("finalize"),
    poll: async () => trace.push("poll"),
    writeSuccessRunLog: async () => trace.push("success-run-log"),
  });
  await assert.rejects(operation, (error) => error.code === "V1_APPROVED_RECEIPTS_FAILED"
    && /dataset=approved_receipts failedDocuments=2/.test(error.message)
    && !/CP4/.test(error.message));
  assert.deepEqual(trace, []);
});

// A: v1 + approvedFailed=0 -- unchanged: success run-log still written.
test("v1 + no approved-receipts failure still writes success run-log", async () => {
  const trace = [];
  await completeSyncRun({
    v2Enabled: false, approvedFailed: 0,
    finalize: async () => trace.push("finalize"),
    poll: async () => trace.push("poll"),
    writeSuccessRunLog: async () => trace.push("success-run-log"),
  });
  assert.deepEqual(trace, ["success-run-log"]);
});

// G: no approved-receipts dataset at all -- default approvedFailed=0, unaffected.
test("completeSyncRun default approvedFailed=0 leaves both modes unaffected", async () => {
  for (const v2Enabled of [true, false]) {
    const trace = [];
    await completeSyncRun({
      v2Enabled,
      finalize: async () => trace.push("finalize"),
      poll: async () => trace.push("poll"),
      writeSuccessRunLog: async () => trace.push("success-run-log"),
    });
    assert.deepEqual(trace, v2Enabled ? ["finalize", "poll", "success-run-log"] : ["success-run-log"]);
  }
});

test("assertApprovedReceiptsComplete: v2 error code/message exactly match the pre-existing CP4 contract", () => {
  assert.throws(
    () => assertApprovedReceiptsComplete({ v2Enabled: true, approvedFailed: 3 }),
    (error) => error.code === "CP4_V1_DATASET_FAILED" && error.message === "CP4 finalize blocked: dataset=approved_receipts failedDocuments=3.",
  );
});

test("assertApprovedReceiptsComplete: v1 error is a distinct code and does not claim CP4", () => {
  assert.throws(
    () => assertApprovedReceiptsComplete({ v2Enabled: false, approvedFailed: 1 }),
    (error) => error.code === "V1_APPROVED_RECEIPTS_FAILED"
      && error.message === "Sync run cannot report success: dataset=approved_receipts failedDocuments=1."
      && !/CP4/.test(error.message),
  );
});

test("executable hybrid sequence gates finalize and success on remaining v1 and APPLIED", async () => {
  const trace = [];
  const runId = await startHybridRun({
    baseUrl: "x", branchCode: "005", setSyncRunId: () => {},
    postJson: async () => { trace.push("run-start"); return { runId: "9" }; },
  });
  await handoffBranchStock({
    v2Enabled: true, baseUrl: "x", syncRunId: runId, branchCode: "005",
    records: [{ productCode: "P1", qty: 1, syncedAt: "2026-07-29T00:00:00Z" }], v2BatchSize: 100,
    postJson: async () => trace.push("stage"), postV1Batches: async () => assert.fail("no v1 branch_stock"),
  });
  trace.push("remaining-v1");
  await completeSyncRun({
    v2Enabled: true,
    finalize: async () => trace.push("finalize"),
    poll: async () => trace.push("APPLIED"),
    writeSuccessRunLog: async () => trace.push("success-run-log"),
  });
  assert.deepEqual(trace, ["run-start", "stage", "remaining-v1", "finalize", "APPLIED", "success-run-log"]);

  const failedTrace = ["stage"];
  await assert.rejects((async () => {
    failedTrace.push("remaining-v1");
    throw new Error("later v1 failed");
  })().then(() => completeSyncRun({
    v2Enabled: true, finalize: async () => failedTrace.push("finalize"),
    poll: async () => {}, writeSuccessRunLog: async () => failedTrace.push("success-run-log"),
  })), /later v1 failed/);
  assert.deepEqual(failedTrace, ["stage", "remaining-v1"]);
});

test("poll failure or timeout prevents success log and feature-off trace has no v2 endpoint", async () => {
  for (const code of ["CP4_APPLY_FAILED", "CP4_WAIT_TIMEOUT"]) {
    const trace = [];
    await assert.rejects(completeSyncRun({
      v2Enabled: true, finalize: async () => trace.push("/api/sync/v2/finalize"),
      poll: async () => { throw Object.assign(new Error(code), { code }); },
      writeSuccessRunLog: async () => trace.push("success-run-log"),
    }), (error) => error.code === code);
    assert.deepEqual(trace, ["/api/sync/v2/finalize"]);
  }

  const urls = [];
  await handoffBranchStock({
    v2Enabled: false, baseUrl: "https://api.test", branchCode: "005",
    records: [{ productCode: "P1", qty: 1, syncedAt: "2026-07-29T00:00:00Z" }], v1BatchSize: 100,
    postJson: async () => {}, postV1Batches: async ({ url }) => { urls.push(url); return 1; },
  });
  await completeSyncRun({
    v2Enabled: false, finalize: async () => urls.push("/api/sync/v2/finalize"), poll: async () => {},
    writeSuccessRunLog: async () => urls.push("/api/sync/run-log"),
  });
  assert.deepEqual(urls, ["https://api.test/api/branch-stock/sync", "/api/sync/run-log"]);
  assert.equal(urls.some((url) => url.includes("/api/sync/v2/")), false);
});
