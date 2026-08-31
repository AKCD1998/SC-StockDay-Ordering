import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TRANSFER_FINGERPRINT_CONTRACT_VERSION } from "./transferFingerprint.js";

export const TRANSFER_SHADOW_CACHE_STORAGE_VERSION = "delta-shadow-transfer-cache-v1";

export function transferShadowCachePath(cacheDir, branchCode) {
  const safeBranch = String(branchCode ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, `transfer-shadow-${safeBranch}.json`);
}

export function readTransferShadowCache(cacheDir, branchCode) {
  const filePath = transferShadowCachePath(cacheDir, branchCode);
  const empty = (reason) => ({ documents: new Map(), state: "rebuilt", reason, filePath });
  if (!existsSync(filePath)) return empty("no-previous-cache");

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    return empty(err instanceof SyntaxError ? "corrupt-json" : `read-error:${err.code || err.message}`);
  }

  if (!parsed || typeof parsed !== "object" || !parsed.documents || typeof parsed.documents !== "object") {
    return empty("corrupt-shape");
  }
  if (parsed.contractVersion !== TRANSFER_FINGERPRINT_CONTRACT_VERSION
      || parsed.cacheStorageVersion !== TRANSFER_SHADOW_CACHE_STORAGE_VERSION) {
    return empty("version-mismatch");
  }
  if (String(parsed.branchCode ?? "") !== String(branchCode ?? "")) return empty("branch-mismatch");

  return {
    documents: new Map(Object.entries(parsed.documents).map(([key, value]) => [key, {
      fingerprint: typeof value?.fingerprint === "string" ? value.fingerprint : "",
      content: value?.content ?? null,
    }])),
    state: "loaded",
    reason: null,
    filePath,
  };
}

export function writeTransferShadowCacheAtomic(cacheDir, branchCode, documents) {
  const filePath = transferShadowCachePath(cacheDir, branchCode);
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `mkdir-failed:${err.code || err.message}` };
  }

  const tmpPath = path.join(cacheDir, `.tmp-transfer-shadow-${randomUUID()}`);
  const payload = {
    contractVersion: TRANSFER_FINGERPRINT_CONTRACT_VERSION,
    cacheStorageVersion: TRANSFER_SHADOW_CACHE_STORAGE_VERSION,
    branchCode,
    updatedAt: new Date().toISOString(),
    documents: Object.fromEntries(documents),
  };
  try {
    writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
    renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup only.
    }
    return { ok: false, error: `write-failed:${err.code || err.message}` };
  }
}
