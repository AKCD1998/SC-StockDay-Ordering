// ── Delta Sync Slice 1 — local isolated shadow cache for sales headers/lines ──
//
// This is NOT a Backend durable checkpoint. It is a local, per-agent,
// per-branch file used only so the shadow comparison has a "previous scan"
// to diff against. If it is missing, corrupt, from a different contract
// version, or belongs to a different branch, we rebuild from scratch (treat
// as empty) — this must never fail or block Full Sync.
//
// Writes are atomic: write to a uniquely-named temp file in the same
// directory, then rename() over the real path. rename() on the same
// filesystem is atomic, so a crash/interruption before the rename leaves the
// previous cache file (if any) completely untouched.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FINGERPRINT_CONTRACT_VERSION } from "./salesFingerprint.js";

export function shadowCachePath(cacheDir, branchCode) {
  const safeBranch = String(branchCode ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(cacheDir, `sales-shadow-${safeBranch}.json`);
}

// Never throws. Returns { documents: Map<key, fingerprint>, state, reason }
// where state is "loaded" or "rebuilt".
export function readShadowCache(cacheDir, branchCode) {
  const filePath = shadowCachePath(cacheDir, branchCode);
  const empty = (reason) => ({ documents: new Map(), state: "rebuilt", reason, filePath });

  if (!existsSync(filePath)) return empty("no-previous-cache");

  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    return empty(`read-error:${err.code || err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty("corrupt-json");
  }

  if (!parsed || typeof parsed !== "object") return empty("corrupt-shape");
  if (parsed.contractVersion !== FINGERPRINT_CONTRACT_VERSION) return empty("version-mismatch");
  if (String(parsed.branchCode ?? "") !== String(branchCode ?? "")) return empty("branch-mismatch");
  if (!parsed.documents || typeof parsed.documents !== "object") return empty("corrupt-shape");

  const documents = new Map(Object.entries(parsed.documents));
  return { documents, state: "loaded", reason: null, filePath };
}

// Never throws (caller decides whether a write failure is worth logging);
// atomic via write-temp-then-rename. Returns { ok, error? }.
export function writeShadowCacheAtomic(cacheDir, branchCode, documentsMap) {
  const filePath = shadowCachePath(cacheDir, branchCode);
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `mkdir-failed:${err.code || err.message}` };
  }

  const tmpPath = path.join(cacheDir, `.tmp-sales-shadow-${randomUUID()}`);
  const payload = {
    contractVersion: FINGERPRINT_CONTRACT_VERSION,
    branchCode,
    updatedAt: new Date().toISOString(),
    documents: Object.fromEntries(documentsMap),
  };

  try {
    writeFileSync(tmpPath, JSON.stringify(payload), "utf8");
    renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (err) {
    // Best-effort cleanup of the temp file; a leftover .tmp-* file never
    // shadows the real cache file, so it cannot corrupt the next read.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    return { ok: false, error: `write-failed:${err.code || err.message}` };
  }
}
