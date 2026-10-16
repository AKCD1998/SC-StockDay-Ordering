import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildHourlyEvidencePayload, HOURLY_EVIDENCE_MAX_BODY_BYTES } from "./hourlyStockEvidenceClient.js";

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
  if (Buffer.byteLength(body, "utf8") > HOURLY_EVIDENCE_MAX_BODY_BYTES) {
    throw Object.assign(new Error("Hourly outbox capture exceeds its size bound."), { code: "HOURLY_OUTBOX_CORRUPT" });
  }
  const payload = JSON.parse(body);
  const rebuilt = buildHourlyEvidencePayload({
    ...payload,
    rows: payload.records.map((record) => ({
      product_code: record.productCode, qty: record.retailOnHand,
      latest_estimated_on_hand: record.latestEstimatedOnHand,
    })),
  });
  if (payload.branchCode !== branchCode || rebuilt.payload.idempotencyKey !== payload.idempotencyKey) {
    throw Object.assign(new Error("Hourly outbox integrity check failed."), { code: "HOURLY_OUTBOX_CORRUPT" });
  }
  return payload;
}

export function enqueueHourlyEvidence({ cacheDir, branchCode, body, maxPending = 168 }) {
  const payload = validateBody(body, branchCode);
  const dir = directory(cacheDir, branchCode);
  fs.mkdirSync(dir, { recursive: true });
  const pendingPath = path.join(dir, payload.idempotencyKey + ".json");
  if (fs.existsSync(pendingPath)) {
    if (fs.readFileSync(pendingPath, "utf8") !== body) throw new Error("Hourly outbox identity conflict.");
    return;
  }
  if (fs.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json(?:\.[a-f0-9-]+\.tmp)?$/.test(name)).length >= maxPending) {
    throw Object.assign(new Error("Hourly outbox is full; no pending evidence was deleted."), { code: "HOURLY_OUTBOX_FULL" });
  }
  const temporaryPath = pendingPath + "." + randomUUID() + ".tmp";
  const fd = fs.openSync(temporaryPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, body, "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporaryPath, pendingPath); }
  finally { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); }
}

export function assertHourlyAcknowledgement(ack, payload) {
  if (ack?.accepted !== payload.records.length || String(ack?.branchCode) !== payload.branchCode
      || ack?.capturedAt !== payload.capturedAt || !/^[1-9][0-9]*$/.test(String(ack?.captureId))
      || typeof ack?.duplicate !== "boolean") {
    throw Object.assign(new Error("Hourly evidence acknowledgement does not match the capture."), { code: "HOURLY_EVIDENCE_ACK_INVALID" });
  }
}

export async function flushHourlyEvidenceOutbox({ cacheDir, branchCode, token, apiBaseUrl, uploadEvidence, maxUploads = 12 }) {
  const release = acquireHourlyEvidenceLock({ cacheDir, branchCode, purpose: "delivery" });
  if (!release) return { status: "busy", delivered: 0 };
  try {
    const dir = directory(cacheDir, branchCode);
    const pending = fs.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => {
      const file = path.join(dir, name);
      if (fs.statSync(file).size > HOURLY_EVIDENCE_MAX_BODY_BYTES) {
        throw Object.assign(new Error("Hourly outbox capture exceeds its size bound."), { code: "HOURLY_OUTBOX_CORRUPT" });
      }
      const body = fs.readFileSync(file, "utf8");
      return { file, body, payload: validateBody(body, branchCode) };
    }).sort((a, b) => a.payload.capturedAt.localeCompare(b.payload.capturedAt));
    let delivered = 0;
    for (const entry of pending.slice(0, maxUploads)) {
      try {
        const ack = await uploadEvidence({ apiBaseUrl, branchCode, token, body: entry.body });
        assertHourlyAcknowledgement(ack, entry.payload);
        fs.unlinkSync(entry.file);
        delivered++;
      } catch (error) {
        return { status: "pending", delivered, pending: pending.length - delivered, errorCode: error.code || "HOURLY_UPLOAD_FAILED" };
      }
    }
    return { status: "delivered", delivered, pending: pending.length - delivered };
  } finally { release(); }
}
