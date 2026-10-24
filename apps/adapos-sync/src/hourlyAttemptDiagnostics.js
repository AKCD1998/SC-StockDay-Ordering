import { performance } from "node:perf_hooks";

const stages = new Set(["launch", "powershell-startup", "host-identity", "task-scheduler", "processes", "cpu-provider", "capture-lock", "sql-connect", "readonly-boundary", "sql-batch", "payload", "outbox-enqueue", "sql-close", "delivery-lock", "outbox-scan", "upload", "acknowledgement", "receipt-persist"]);
const codes = new Set(["HOURLY_SOURCE_GUARD_UNAVAILABLE", "HOURLY_SOURCE_TIMEOUT", "HOURLY_SOURCE_ACCESS_DENIED", "HOURLY_SOURCE_READ_FAILED", "HOURLY_SOURCE_READONLY_BOUNDARY_UNVERIFIED", "HOURLY_SOURCE_COHORT_INCOMPLETE", "HOURLY_SOURCE_COHORT_CHANGED", "HOURLY_COMPLETE_COHORT_WINDOW_EXCEEDED", "HOURLY_OBSERVER_CLOCK_STEP_DETECTED", "HOURLY_EVIDENCE_BUSY", "HOURLY_EVIDENCE_HTTP_ERROR", "HOURLY_EVIDENCE_TIMEOUT", "HOURLY_EVIDENCE_ACK_INVALID", "HOURLY_OUTBOX_CORRUPT", "HOURLY_OUTBOX_FULL", "HOURLY_DELIVERY_BUDGET_EXHAUSTED", "HOURLY_COMPLETE_CONFIG_INVALID", "HOST_CPU_AT_OR_ABOVE_70_PERCENT", "EXISTING_AGENT_OR_FULL_SYNC_WORK", "GUARD_PROCESS_IDENTITY_UNREADABLE", "SQL_READONLY_STATEMENT_REJECTED", "OWN_SQL_METRICS_UNAVAILABLE", "ETIMEOUT", "ELOGIN", "ESOCKET", "ECONNRESET", "ECONNCLOSED", "EACCES", "EPERM", "ENETUNREACH", "ENOTFOUND", "CHILD_STILL_RUNNING", "GUARD_LEASE_UNVERIFIED", "PLATFORM_UNAVAILABLE", "BUDGET_EXHAUSTED", "START_FAILED", "DEADLINE", "OUTPUT_LIMIT", "INVALID_OUTPUT", "CHILD_EXIT", "READY_UNVERIFIED", "HOST_UNVERIFIED", "FULL_SYNC_BUSY", "PROCESS_UNREADABLE", "CPU_UNREADABLE", "CPU_LIMIT", "PROVIDER_TIMEOUT", "ACCESS_DENIED", "TASKS_UNAVAILABLE", "PROCESSES_UNAVAILABLE", "CPU_UNAVAILABLE", "IDENTITY_UNVERIFIED"]);
for(const code of ['HOURLY_RECEIPT_PERSISTENCE_FAILED','HOURLY_RECEIPT_STATE_UNVERIFIED','HOURLY_RECEIPT_BUSY','HOURLY_OUTBOX_PERSISTENCE_FAILED'])codes.add(code);
export const safeHourlyFailureCode = error => codes.has(error?.code) ? error.code : "HOURLY_OPERATION_FAILED_DETAILS_WITHHELD";
const numeric = ["durationMs", "remainingMs", "budgetMs", "batchIndex", "batches", "requestedProducts", "observedProducts", "readProducts", "sentProducts", "acceptedProducts", "pending", "attempt", "retryCount", "cpuPercent", "startupMs", "providerMs", "httpStatus"];

// This is the sole diagnostic boundary. Never accept arbitrary strings, errors,
// payloads, SQL text, child output, paths, identities or command lines.
export function safeHourlyDiagnostic(event) {
  if (!event || !stages.has(event.stage) || !["start", "success", "failure", "progress", "retry"].includes(event.kind)) return null;
  const result = { stage: event.stage, kind: event.kind };
  if (event.code != null) result.code = safeHourlyFailureCode({ code: event.code });
  for (const key of numeric) if (Number.isFinite(event[key]) && event[key] >= 0 && event[key] <= Number.MAX_SAFE_INTEGER) result[key] = key === "cpuPercent" ? event[key] : Math.ceil(event[key]);
  if (typeof event.childTerminationConfirmed === "boolean") result.childTerminationConfirmed = event.childTerminationConfirmed;
  if (["system", "administrator", "other", "unknown"].includes(event.identityKind)) result.identityKind = event.identityKind;
  return result;
}
export function emitHourlyDiagnostic(observer, event) {
  const safe = safeHourlyDiagnostic(event);
  if (safe && typeof observer === "function") observer(safe);
}
export async function hourlyStage(observer, stage, action, fields = {}) {
  const start = performance.now();
  emitHourlyDiagnostic(observer, { ...fields, stage, kind: "start" });
  try {
    const result = await action();
    emitHourlyDiagnostic(observer, { ...fields, stage, kind: "success", durationMs: performance.now() - start });
    return result;
  } catch (error) {
    emitHourlyDiagnostic(observer, { ...fields, stage, kind: "failure", code: safeHourlyFailureCode(error), durationMs: performance.now() - start });
    throw error;
  }
}
export function createHourlyAttemptDiagnostics({ monotonic = () => performance.now(), budgetMs = 1_200_000, maxEvents = 768, checkpoint } = {}) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 1024 || !Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 1_200_000) throw new TypeError("Invalid diagnostic bounds.");
  const start = monotonic(), events = []; let droppedEvents = 0, persistenceFailed = false, everPersistenceFailed=false, checkpointFailures=0;
  const snapshot = () => ({ events: events.map(event => ({ ...event })), droppedEvents, persistenceFailed, everPersistenceFailed, checkpointFailures, elapsedMs: Math.max(0, Math.ceil(monotonic() - start)), budgetMs });
  const observe = event => {
    const safe = safeHourlyDiagnostic(event); if (!safe) return;
    const elapsedMs = Math.max(0, Math.ceil(monotonic() - start));
    if (events.length >= maxEvents) { events.shift(); droppedEvents++; }
    const taskRemainingMs = Math.max(0, budgetMs - elapsedMs);
    events.push({ ...safe, elapsedMs, taskRemainingMs, remainingMs: safe.remainingMs ?? taskRemainingMs });
    // Persist only bounded sanitized progress. The caller controls the existing
    // protected status location; no raw values are available to this callback.
    if (checkpoint) { const current = snapshot(); try { checkpoint({ ...current, events: current.events.slice(-12), retainedEvents: current.events.length });persistenceFailed=false; } catch { persistenceFailed=true;everPersistenceFailed=true;checkpointFailures++; } }
  };
  return { observe, snapshot };
}
