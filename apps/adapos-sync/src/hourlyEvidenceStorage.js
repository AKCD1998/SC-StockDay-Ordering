import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { hourlyStage, emitHourlyDiagnostic, safeHourlyFailureCode } from "./hourlyAttemptDiagnostics.js";
import { safeStorageFailure } from './hourlyStatusStore.js';
import { buildHourlyEvidencePayload } from "./hourlyStockEvidenceClient.js";
import { buildHourlyIntradayPayload } from "./hourlyDerivedObservation.js";
import { HOURLY_COMPLETE_COHORT_MAX_BODY_BYTES } from "./hourlyCohortCoverage.js";

function directory(cacheDir, branchCode) {
  if (!cacheDir || !/^(000|001|003|004|005)$/.test(branchCode)) {
    throw Object.assign(new Error("Invalid hourly evidence storage configuration."), { code: "CONFIG_ERROR" });
  }
  return path.join(path.resolve(cacheDir), "hourly-evidence-outbox", branchCode);
}

// A live PID is never evicted by age. An incomplete/corrupt lock fails closed.
export function acquireHourlyEvidenceLock({ cacheDir, branchCode, purpose = "capture" }) {
  const dir = directory(cacheDir, branchCode);
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, purpose + ".lock");
  const owner = { pid: process.pid, nonce: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.mkdirSync(lockPath);
      const ownerPath = path.join(lockPath, owner.nonce + ".owner");
      const fd = fs.openSync(ownerPath, "wx", 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(owner)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      return () => {
        fs.unlinkSync(ownerPath);
        fs.rmdirSync(lockPath);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const owners = fs.readdirSync(lockPath);
        if (owners.length !== 1 || !/^[a-f0-9-]+\.owner$/.test(owners[0])) return null;
        const priorPath = path.join(lockPath, owners[0]);
        const prior = JSON.parse(fs.readFileSync(priorPath, "utf8"));
        if (!Number.isSafeInteger(prior.pid) || prior.pid <= 0) return null;
        try { process.kill(prior.pid, 0); return null; } catch (pidError) {
          if (pidError.code !== "ESRCH") return null;
        }
        // Unique owner filename + nonrecursive rmdir avoids stale-lock ABA.
        fs.unlinkSync(priorPath);
        fs.rmdirSync(lockPath);
      } catch { return null; }
    }
  }
  return null;
}

export async function withHourlyCaptureLock(options, callback) {
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + (options.waitMs ?? 0);
  let release;
  do {
    release = acquireHourlyEvidenceLock({ ...options, purpose: "capture" });
    if (release) break;
    if (Date.now() >= deadline) {
      throw Object.assign(new Error("Hourly/Full capture is already running."), { code: "HOURLY_EVIDENCE_BUSY" });
    }
    await wait(Math.min(250, deadline - Date.now()));
  } while (true);
  try { return await callback(); } finally { release(); }
}

function validateBody(body, branchCode) {
  if (Buffer.byteLength(body, "utf8") > HOURLY_COMPLETE_COHORT_MAX_BODY_BYTES) {
    throw Object.assign(new Error("Hourly outbox capture exceeds its size bound."), { code: "HOURLY_OUTBOX_CORRUPT" });
  }
  const payload = JSON.parse(body);
  const options = {
    ...payload,
    rows: payload.records.map((record) => ({
      product_code: record.productCode, qty: record.retailOnHand,
      latest_estimated_on_hand: record.latestEstimatedOnHand,
    })),
  };
  // Old bodies, including Full Sync morning anchors, keep their exact builder.
  const rebuilt = payload.derivedObservation == null ? buildHourlyEvidencePayload(options)
    : buildHourlyIntradayPayload(options, payload.derivedObservation);
  if (payload.branchCode !== branchCode || rebuilt.payload.idempotencyKey !== payload.idempotencyKey) {
    throw Object.assign(new Error("Hourly outbox integrity check failed."), { code: "HOURLY_OUTBOX_CORRUPT" });
  }
  return payload;
}

export function enqueueHourlyEvidence({ cacheDir, branchCode, body, maxPending = 168, maxPendingBytes = 64 * 1024 * 1024, durableReceiptRequired = false, io = fs }) {
  let stage = 'outbox-directory';
  try {
  const payload = validateBody(body, branchCode);
  const dir = directory(cacheDir, branchCode);
  io.mkdirSync(dir, { recursive: true });
  const pendingPath = path.join(dir, payload.idempotencyKey + ".json");
  stage = 'outbox-read';
  if (io.existsSync(pendingPath)) {
    if (io.readFileSync(pendingPath, "utf8") !== body) throw new Error("Hourly outbox identity conflict.");
    return;
  }
  stage = 'outbox-scan';
  const pendingFiles = io.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json(?:\.[a-f0-9-]+\.tmp)?$/.test(name));
  if (!Number.isSafeInteger(maxPending) || maxPending < 1 || !Number.isSafeInteger(maxPendingBytes) || maxPendingBytes < 1
      || pendingFiles.length >= maxPending || pendingFiles.reduce((sum, name) => sum + io.statSync(path.join(dir, name)).size, 0) + Buffer.byteLength(body, "utf8") > maxPendingBytes) {
    throw Object.assign(new Error("Hourly outbox is full; no pending evidence was deleted."), { code: "HOURLY_OUTBOX_FULL" });
  }
  const temporaryPath = pendingPath + "." + randomUUID() + ".tmp";
  stage = 'outbox-open';
  const fd = io.openSync(temporaryPath, "wx", 0o600);
  let writeFailure;
  try {
    stage = 'outbox-write';io.writeFileSync(fd, body, "utf8");
    stage = 'outbox-sync';io.fsyncSync(fd);
  } catch(error) {writeFailure=error;throw error;}
  finally {
    if(!durableReceiptRequired)io.closeSync(fd);
    else try {io.closeSync(fd);}catch(error){if(!writeFailure){stage='outbox-close';throw error;}}
  }
  stage = 'outbox-rename';
  let renameFailure;
  try { io.renameSync(temporaryPath, pendingPath); }
  catch(error){renameFailure=error;throw error;}
  finally {
    if(!durableReceiptRequired){if(io.existsSync(temporaryPath))io.unlinkSync(temporaryPath);}
    else try {if(io.existsSync(temporaryPath))io.unlinkSync(temporaryPath);}catch(error){if(!renameFailure){stage='outbox-unlink';throw error;}}
  }
  } catch(error) {
    if (!durableReceiptRequired || ['HOURLY_OUTBOX_FULL','HOURLY_OUTBOX_CORRUPT'].includes(error.code)) throw error;
    throw Object.assign(new Error('Critical Hourly outbox unavailable; details withheld.'), {code:'HOURLY_OUTBOX_PERSISTENCE_FAILED', storageFailure:safeStorageFailure(error,stage)});
  }
}

export function assertHourlyAcknowledgement(ack, payload) {
  if (ack?.accepted !== payload.records.length || String(ack?.branchCode) !== payload.branchCode
      || ack?.capturedAt !== payload.capturedAt || !/^[1-9][0-9]*$/.test(String(ack?.captureId))
      || typeof ack?.duplicate !== "boolean") {
    throw Object.assign(new Error("Hourly evidence acknowledgement does not match the capture."), { code: "HOURLY_EVIDENCE_ACK_INVALID" });
  }
}

export function hourlyEvidenceDeliveryBounds(evidence) {
  return evidence?.completeCohortEnabled === true ? { maxUploads: 24, maxDurationMs: 60_000 } : {};
}

export async function flushHourlyEvidenceOutbox({ cacheDir, branchCode, token, apiBaseUrl, uploadEvidence, maxUploads = 12,
  maxDurationMs = null, monotonic = () => performance.now(), onDiagnostic, persistAcknowledgement }) {
  if (!Number.isSafeInteger(maxUploads) || maxUploads < 1 || maxUploads > 24
      || (maxDurationMs != null && (!Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 60_000))) {
    throw Object.assign(new Error("Invalid Hourly delivery bounds."), { code: "CONFIG_ERROR" });
  }
  const deadline = maxDurationMs == null ? Infinity : monotonic() + maxDurationMs;
  const release = await hourlyStage(onDiagnostic, "delivery-lock", () => acquireHourlyEvidenceLock({ cacheDir, branchCode, purpose: "delivery" }));
  if (!release) { emitHourlyDiagnostic(onDiagnostic, { stage: "delivery-lock", kind: "failure", code: "HOURLY_EVIDENCE_BUSY" }); return { status: "busy", delivered: 0 }; }
  try {
    const dir = directory(cacheDir, branchCode);
    const pending = fs.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => {
      const file = path.join(dir, name);
      if (fs.statSync(file).size > HOURLY_COMPLETE_COHORT_MAX_BODY_BYTES) {
        throw Object.assign(new Error("Hourly outbox capture exceeds its size bound."), { code: "HOURLY_OUTBOX_CORRUPT" });
      }
      const body = fs.readFileSync(file, "utf8");
      return { file, body, payload: validateBody(body, branchCode) };
    }).sort((a, b) => a.payload.capturedAt.localeCompare(b.payload.capturedAt));
    emitHourlyDiagnostic(onDiagnostic, { stage: "outbox-scan", kind: "success", pending: pending.length });
    let delivered = 0;
    for (const entry of pending.slice(0, maxUploads)) {
      const remainingMs = Math.floor(deadline - monotonic());
      if (remainingMs < 1) return { status: "pending", delivered, pending: pending.length - delivered, errorCode: "HOURLY_DELIVERY_BUDGET_EXHAUSTED" };
      try {
        const ack = await hourlyStage(onDiagnostic, "upload", () => uploadEvidence({ apiBaseUrl, branchCode, token, body: entry.body,
          ...(maxDurationMs == null ? {} : { timeoutMs: Math.min(30_000, remainingMs), maxAttempts: 1 }) }), { sentProducts: entry.payload.records.length });
        await hourlyStage(onDiagnostic, "acknowledgement", () => assertHourlyAcknowledgement(ack, entry.payload));
        emitHourlyDiagnostic(onDiagnostic, { stage: "acknowledgement", kind: "progress", acceptedProducts: ack.accepted });
        if(persistAcknowledgement){
          const receiptRemaining=Math.floor(deadline-monotonic());
          if(receiptRemaining<1)throw Object.assign(new Error('Receipt budget unavailable.'),{code:'HOURLY_DELIVERY_BUDGET_EXHAUSTED'});
          await hourlyStage(onDiagnostic,'receipt-persist',()=>persistAcknowledgement({ack,payload:entry.payload,remainingMs:receiptRemaining}));
          if(monotonic()>=deadline)throw Object.assign(new Error('Receipt budget unavailable.'),{code:'HOURLY_DELIVERY_BUDGET_EXHAUSTED'});
        }
        try { fs.unlinkSync(entry.file); }
        catch(error) {
          if(!persistAcknowledgement)throw error;
          throw Object.assign(new Error('Acknowledged outbox removal unavailable; details withheld.'),{code:'HOURLY_OUTBOX_PERSISTENCE_FAILED',storageFailure:safeStorageFailure(error,'outbox-unlink')});
        }
        delivered++;
      } catch (error) {
        emitHourlyDiagnostic(onDiagnostic, { stage: "upload", kind: "failure", code: safeHourlyFailureCode(error), pending: pending.length - delivered });
        return { status: "pending", delivered, pending: pending.length - delivered, errorCode: persistAcknowledgement?safeHourlyFailureCode(error):(error.code || 'HOURLY_UPLOAD_FAILED'), ...(persistAcknowledgement&&error.storageFailure?{storageFailure:safeStorageFailure({code:error.storageFailure.code},error.storageFailure.stage)}:{}) };
      }
    }
    return { status: "delivered", delivered, pending: pending.length - delivered };
  } finally { release(); }
}
