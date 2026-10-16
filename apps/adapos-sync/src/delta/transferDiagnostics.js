import { readFileSync } from "node:fs";

// Exact, static backend messages only. Never retain response bodies or document
// identifiers: the generic TRANSFER_DELTA_INVALID code cannot distinguish 400s.
const validationReasons = new Map([
  ["Payload must include headers and lines arrays.", "payload-arrays-required"],
  ["Each transfer header requires docNo, docType, and branchFrm/branchCode (or AdaAcc aliases).", "header-identity-required"],
  ["Each transfer line requires docNo, docType, branchFrm/branchCode, seqNo/lineNo, and productCode (or AdaAcc aliases).", "line-fields-required"],
  ["Transfer Delta branchCode must be three digits.", "branch-format-invalid"],
  ["Transfer Delta payload requires tombstones[].", "tombstones-array-required"],
  ["Transfer Delta idempotencyKey must be SHA-256 hex.", "idempotency-format-invalid"],
  ["Transfer Delta contentHash must be SHA-256 hex.", "content-hash-format-invalid"],
  ["Transfer Delta requires SHA-256 baseStateHash and nextStateHash.", "state-hash-format-invalid"],
  ["Transfer Delta cannot mix branch codes.", "mixed-branch-codes"],
  ["Transfer Delta contains a duplicate document header.", "duplicate-document-header"],
  ["Every Transfer Delta line requires its complete document header.", "line-header-required"],
  ["Hard tombstones require branch/doc identity and explicit source-hard-delete evidence.", "tombstone-evidence-required"],
  ["A document cannot be replaced and tombstoned in one Delta request.", "replace-tombstone-conflict"],
]);
const safeValidationReasons = new Set([...validationReasons.values(), "unknown-validation-error"]);
const safeFailureReasons = new Set([...safeValidationReasons, "http-error", "request-timeout", "network-error"]);
const safeCount = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const safeStatus = (value) => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
const safeBranch = (value) => typeof value === "string" && /^\d{3}$/.test(value) ? value : null;
const diagnosticVersion = "transfer-delta-diagnostics-v1";
const packageVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const agentVersion = /^\d+\.\d+\.\d+$/.test(packageVersion) ? packageVersion : "unknown";

export function transferHttpFailureReason(status, text) {
  if (status !== 400) return "http-error";
  if (typeof text === "string" && text.length <= 4096) {
    try {
      const body = JSON.parse(text);
      if (body && !Array.isArray(body) && typeof body.message === "string") {
        return validationReasons.get(body.message) ?? "unknown-validation-error";
      }
    } catch { /* HTML, malformed JSON, and unknown messages stay opaque. */ }
  }
  return "unknown-validation-error";
}

export function transferFailureDiagnostic(error, payload = {}) {
  const httpStatus = safeStatus(error?.status);
  const failureReason = httpStatus === 400
    ? (safeValidationReasons.has(error?.transferDeltaReason) ? error.transferDeltaReason : "unknown-validation-error")
    : httpStatus ? "http-error" : error?.code === "REQUEST_TIMEOUT" ? "request-timeout" : "network-error";
  const headerBranchCounts = { "000": 0, "001": 0, "002": 0, "003": 0, "004": 0, "005": 0, other: 0 };
  for (const header of payload.headers ?? []) {
    const branch = safeBranch(header.branchCode);
    headerBranchCounts[branch && Object.hasOwn(headerBranchCounts, branch) ? branch : "other"] += 1;
  }
  return {
    httpStatus, failureReason,
    submittedHeaders: Array.isArray(payload.headers) ? payload.headers.length : null,
    submittedLines: Array.isArray(payload.lines) ? payload.lines.length : null,
    submittedTombstones: Array.isArray(payload.tombstones) ? payload.tombstones.length : null,
    headerBranchCounts,
  };
}

function safeFallbackReason(reason) {
  const fixed = new Set([
    "baseline-no-delivery-state", "baseline-delivery-state-contract-mismatch",
    "delivery-checkpoint-diverged", "changed-document-limit", "capability-disabled-or-unsupported",
    "delta-acknowledgement-invalid", "rebaseline-capability-disabled", "rebaseline-acknowledgement-invalid",
  ]);
  if (fixed.has(reason)) return reason;
  if (typeof reason === "string") {
    const match = /^(capability-unavailable|delta-request-failed|rebaseline-failed|candidate-invalid|delivery-state-write-failed):(.+)$/.exec(reason);
    if (match) {
      const suffix = /^\d{3}$/.test(match[2]) && safeStatus(Number(match[2])) !== null
        || ["REQUEST_TIMEOUT", "ENOSPC", "EACCES", "ENOENT", "error"].includes(match[2]) ? match[2] : "error";
      return `${match[1]}:${suffix}`;
    }
  }
  return "unknown-fallback-reason";
}

// Explicit output projection also protects against injected dependencies and
// future acknowledgement fields. Tokens/hashes/idempotency never enter logs.
export function transferLogMetadata(result, { branchCode, syncRunId, operation }) {
  const runId = typeof syncRunId === "string" && /^\d{1,15}$/.test(syncRunId) ? Number(syncRunId) : syncRunId;
  const metadata = {
    diagnosticVersion, agentVersion, contractVersion: "transfer-delta-v1",
    observedAt: new Date().toISOString(), branchCode: safeBranch(branchCode),
    syncRunId: safeCount(runId), operation: operation === "rebaseline" ? "rebaseline" : "apply",
    mode: ["delta", "noop", "fallback"].includes(result.mode) ? result.mode : null,
  };
  if (typeof result.ok === "boolean") metadata.ok = result.ok;
  if (result.reason !== undefined) metadata.reason = safeFallbackReason(result.reason);
  for (const key of ["changedDocumentCount", "acceptedHeaders", "acceptedLines", "acceptedTombstones", "checkpointSequence"]) {
    if (result[key] !== undefined) metadata[key] = safeCount(result[key]);
  }
  if (typeof result.replayed === "boolean") metadata.replayed = result.replayed;
  if (result.diagnostic) {
    const diagnostic = result.diagnostic;
    metadata.httpStatus = safeStatus(diagnostic.httpStatus);
    metadata.failureReason = safeFailureReasons.has(diagnostic.failureReason) ? diagnostic.failureReason : "unknown-validation-error";
    for (const key of ["submittedHeaders", "submittedLines", "submittedTombstones"]) metadata[key] = safeCount(diagnostic[key]);
    if (diagnostic.headerBranchCounts) {
      metadata.headerBranchCounts = Object.fromEntries(["000", "001", "002", "003", "004", "005", "other"]
        .map((key) => [key, safeCount(diagnostic.headerBranchCounts[key])]));
    }
  }
  return metadata;
}
