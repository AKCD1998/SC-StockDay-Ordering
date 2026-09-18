import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION } from "./hourlyStockEvidence.js";

export const HOURLY_STOCK_CACHE_STORAGE_VERSION = "hourly-dual-stock-shadow-cache-v1";

export function hourlyStockShadowCachePath(cacheDir, branchCode) {
  const safeBranch = String(branchCode ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, `hourly-stock-shadow-${safeBranch}.json`);
}
export function readHourlyStockShadowCache(cacheDir, branchCode) {
  const filePath = hourlyStockShadowCachePath(cacheDir, branchCode);
  const empty = (reason) => ({
    documents: new Map(),
    windows: {},
    state: "rebuilt",
    reason,
    filePath,
  });
  if (!existsSync(filePath)) return empty("no-previous-cache");

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    return empty(error instanceof SyntaxError ? "corrupt-json" : `read-error:${error.code || error.message}`);
  }
  if (!parsed || typeof parsed !== "object"
      || !parsed.documents || typeof parsed.documents !== "object"
      || !parsed.windows || typeof parsed.windows !== "object" || Array.isArray(parsed.windows)) {
    return empty("corrupt-shape");
  }
  if (parsed.contractVersion !== HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION
      || parsed.cacheStorageVersion !== HOURLY_STOCK_CACHE_STORAGE_VERSION) {
    return empty("version-mismatch");
  }
  if (String(parsed.branchCode ?? "") !== String(branchCode ?? "")) return empty("branch-mismatch");

  return {
    documents: new Map(Object.entries(parsed.documents).map(([key, value]) => [key, {
      fingerprint: typeof value?.fingerprint === "string" ? value.fingerprint : "",
      content: typeof value?.content === "string" ? value.content : null,
    }])),
    windows: parsed.windows,
    state: "loaded",
    reason: null,
    filePath,
  };
}

export function writeHourlyStockShadowCacheAtomic(cacheDir, branchCode, documents, windows) {
  const filePath = hourlyStockShadowCachePath(cacheDir, branchCode);
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: `mkdir-failed:${error.code || error.message}` };
  }

  const tmpPath = path.join(cacheDir, `.tmp-hourly-stock-shadow-${randomUUID()}`);
  const payload = {
    contractVersion: HOURLY_STOCK_EVIDENCE_CONTRACT_VERSION,
    cacheStorageVersion: HOURLY_STOCK_CACHE_STORAGE_VERSION,
    branchCode,
    updatedAt: new Date().toISOString(),
    documents: Object.fromEntries(documents),
    windows,
  };
  try {
    writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
    renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup only.
    }
    return { ok: false, error: `write-failed:${error.code || error.message}` };
  }
}
