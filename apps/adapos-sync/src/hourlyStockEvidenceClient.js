import { createHash } from "node:crypto";

export const HOURLY_EVIDENCE_CONTRACT_VERSION = "hourly-dual-stock-evidence-v1";
export const HOURLY_EVIDENCE_DATASET_TAG = "hourly_dual_stock_evidence";
export const HOURLY_EVIDENCE_MAX_RECORDS = 500;
export const HOURLY_EVIDENCE_MAX_BODY_BYTES = 256 * 1024;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildHourlyEvidencePayload({
  branchCode,
  observationKind,
  plannedSlot,
  capturedAt,
  sourceEventAt = null,
  rows,
  clientMeta = {},
}) {
  const activeBranches = new Set(["000", "001", "003", "004", "005"]);
  const intradaySlots = new Set(Array.from({ length: 11 }, (_, i) => String(i + 9).padStart(2, "0") + ":00"));
  if (!activeBranches.has(branchCode) || !["intraday", "morning_anchor"].includes(observationKind)
      || (observationKind === "morning_anchor" ? plannedSlot !== "08:20" : !intradaySlots.has(plannedSlot))) {
    throw Object.assign(new Error("Invalid hourly evidence identity or slot."), { code: "CONFIG_ERROR" });
  }
  const captureTime = new Date(capturedAt);
  if (!Number.isFinite(captureTime.getTime()) || captureTime.toISOString() !== capturedAt) {
    throw Object.assign(new Error("Invalid hourly capture timestamp."), { code: "CONFIG_ERROR" });
  }
  const date = new Date(captureTime.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const plannedTime = new Date(date + "T" + plannedSlot + ":00+07:00").getTime();
  if (captureTime.getTime() < plannedTime || (observationKind === "morning_anchor" && captureTime.getTime() >= plannedTime + 40 * 60_000)) {
    throw Object.assign(new Error("Capture is outside its permitted slot window."), { code: "HOURLY_EVIDENCE_INVALID_TIME" });
  }
  if (observationKind === "morning_anchor" && !/^[1-9][0-9]{0,17}$/.test(String(clientMeta.authoritativeSyncRunId))) {
    throw Object.assign(new Error("Morning anchor requires an authoritative Full Sync receipt."), { code: "HOURLY_EVIDENCE_ANCHOR_RECEIPT_REQUIRED" });
  }
  const records = [...(rows ?? [])].map((row, index) => {
    const productCode = String(row.product_code ?? "").trim();
    const retailOnHand = Number(row.qty);
    const latestEstimatedOnHand = row.latest_estimated_on_hand == null
      ? null
      : Number(row.latest_estimated_on_hand);
    if (!productCode || productCode.length > 80) {
      throw Object.assign(new Error(`Hourly evidence row ${index} has invalid product identity.`), {
        code: "HOURLY_EVIDENCE_INVALID_ROW",
      });
    }
    if (row.qty == null || row.qty === "" || !Number.isFinite(retailOnHand) || Math.abs(retailOnHand) > 1e12
        || (latestEstimatedOnHand != null && (!Number.isFinite(latestEstimatedOnHand) || Math.abs(latestEstimatedOnHand) > 1e12))) {
      throw Object.assign(new Error(`Hourly evidence row ${index} has non-finite quantity.`), {
        code: "HOURLY_EVIDENCE_INVALID_ROW",
      });
    }
    return { productCode, retailOnHand, latestEstimatedOnHand };
  }).sort((left, right) => left.productCode.localeCompare(right.productCode));
  if (records.length < 1 || records.length > HOURLY_EVIDENCE_MAX_RECORDS) {
    throw Object.assign(new Error(`Hourly evidence requires 1-${HOURLY_EVIDENCE_MAX_RECORDS} selected products.`), {
      code: "HOURLY_EVIDENCE_RECORD_LIMIT",
    });
  }
  if (new Set(records.map((record) => record.productCode)).size !== records.length) {
    throw Object.assign(new Error("Hourly evidence contains duplicate product identities."), {
      code: "HOURLY_EVIDENCE_INVALID_ROW",
    });
  }
  const identity = {
    contractVersion: HOURLY_EVIDENCE_CONTRACT_VERSION,
    datasetTag: HOURLY_EVIDENCE_DATASET_TAG,
    branchCode,
    observationKind,
    plannedSlot,
    capturedAt,
    sourceEventAt,
    records,
    ...(observationKind === "morning_anchor" ? { authoritativeSyncRunId: String(clientMeta.authoritativeSyncRunId) } : {}),
  };
  const payload = {
    ...identity,
    idempotencyKey: sha256(canonicalJson(identity)),
    clientMeta,
  };
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > HOURLY_EVIDENCE_MAX_BODY_BYTES) {
    throw Object.assign(new Error("Hourly evidence payload exceeds 256 KiB."), {
      code: "HOURLY_EVIDENCE_BODY_LIMIT",
    });
  }
  return { payload, body };
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export async function uploadHourlyEvidence({
  apiBaseUrl,
  branchCode,
  token,
  body,
  fetchImpl = globalThis.fetch,
  maxAttempts = 3,
  timeoutMs = 30_000,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}) {
  if (!token) throw Object.assign(new Error("Hourly evidence branch token is required."), { code: "CONFIG_ERROR" });
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const url = `${String(apiBaseUrl || "").replace(/\/+$/, "")}/api/hourly-stock-evidence/captures`;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-branch-code": branchCode,
          "x-hourly-evidence-token": token,
        },
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.ok) {
        const ack = JSON.parse(text);
        return {
          accepted: ack.accepted, branchCode: ack.branchCode, captureId: ack.captureId,
          duplicate: ack.duplicate, capturedAt: ack.capturedAt, receivedAt: ack.receivedAt, attempts: attempt,
        };
      }
      const error = Object.assign(new Error(`Hourly evidence upload failed with HTTP ${response.status}.`), {
        code: "HOURLY_EVIDENCE_HTTP_ERROR",
        status: response.status,
      });
      if (!isRetryableStatus(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (error.status && !isRetryableStatus(error.status)) throw error;
      lastError = error.name === "AbortError"
        ? Object.assign(new Error("Hourly evidence upload timed out."), { code: "HOURLY_EVIDENCE_TIMEOUT" })
        : error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) await wait(Math.min(5_000, 500 * (2 ** (attempt - 1))));
  }
  throw lastError;
}
