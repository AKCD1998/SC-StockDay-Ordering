import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const TRANSFER_DELTA_CONTRACT_VERSION = "transfer-delta-v1";
const STORAGE_VERSION = "transfer-delta-delivery-state-v1";

export function transferDeliveryStatePath(cacheDir, branchCode) {
  const safeBranch = String(branchCode ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, `transfer-delivery-${safeBranch}.json`);
}

export function readTransferDeliveryState(cacheDir, branchCode) {
  const empty = (state, reason) => ({ state, reason, documents: new Map(), checkpointToken: null, checkpointSequence: 0, stateHash: null });
  const filePath = transferDeliveryStatePath(cacheDir, branchCode);
  if (!existsSync(filePath)) return empty("missing", "no-delivery-state");
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (parsed?.storageVersion !== STORAGE_VERSION
      || parsed?.contractVersion !== TRANSFER_DELTA_CONTRACT_VERSION
      || String(parsed?.branchCode ?? "") !== String(branchCode ?? "")
      || !parsed?.documents || typeof parsed.documents !== "object") {
      return empty("invalid", "delivery-state-contract-mismatch");
    }
    return {
      state: "loaded", reason: null,
      checkpointToken: parsed.checkpointToken ?? null,
      checkpointSequence: Number.isSafeInteger(parsed.checkpointSequence) ? parsed.checkpointSequence : 0,
      stateHash: typeof parsed.stateHash === "string" ? parsed.stateHash : null,
      documents: new Map(Object.entries(parsed.documents).map(([key, value]) => [key, {
        fingerprint: typeof value?.fingerprint === "string" ? value.fingerprint : "",
      }])),
    };
  } catch (error) {
    return empty("invalid", `delivery-state-read:${error.code || error.message}`);
  }
}

export function writeTransferDeliveryStateAtomic(cacheDir, branchCode, checkpointToken, checkpointSequence, stateHash, documents) {
  mkdirSync(cacheDir, { recursive: true });
  const filePath = transferDeliveryStatePath(cacheDir, branchCode);
  const temporaryPath = path.join(cacheDir, `.tmp-transfer-delivery-${randomUUID()}`);
  const payload = {
    storageVersion: STORAGE_VERSION,
    contractVersion: TRANSFER_DELTA_CONTRACT_VERSION,
    branchCode: String(branchCode), checkpointToken: checkpointToken ?? null, checkpointSequence, stateHash,
    updatedAt: new Date().toISOString(),
    // Managed fingerprint set only. It is append/replace until an explicit,
    // separately enabled hard-delete source exists; rolling-window absence
    // never removes an entry.
    documents: Object.fromEntries([...documents.entries()].map(([key, value]) => [key, { fingerprint: value.fingerprint }])),
  };
  try {
    writeFileSync(temporaryPath, JSON.stringify(payload), "utf8");
    renameSync(temporaryPath, filePath);
  } catch (error) {
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath); } catch { /* best effort */ }
    throw error;
  }
  return { ok: true, filePath };
}
