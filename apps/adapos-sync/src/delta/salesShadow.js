// ── Delta Sync Slice 1 — sales headers/lines shadow candidate ───────────────
//
// SHADOW-ONLY. Computes what a Delta run would have reported, compares it to
// the previous local scan, and returns safe aggregate metrics only. It never
// sends anything to the Backend, never advances any durable checkpoint, never
// tombstones/deletes anything, and a failure here must never fail Full Sync.
//
// The caller (index.js) is responsible for wrapping the call in try/catch —
// this module also defends itself internally so a broken cache or a bad row
// shape degrades to "treat as empty / rebuild" rather than throwing.

import { FINGERPRINT_CONTRACT_VERSION, scanSalesDocuments } from "./salesFingerprint.js";
import { readShadowCache, writeShadowCacheAtomic } from "./salesShadowCache.js";

export const SHADOW_DATASET_TAG = "sales_headers_lines";

function round1(n) {
  return Math.round(n * 10) / 10;
}

// headerRows/lineRows: the exact rows Full Sync already fetched this run —
// no additional source query is issued. cacheDir: local isolated directory
// for this agent's shadow state (never the same path as any Backend/Agent
// durable checkpoint file).
export function runSalesShadow({ branchCode, headerRows, lineRows, cacheDir }) {
  const current = scanSalesDocuments(headerRows ?? [], lineRows ?? []);

  let previous;
  try {
    previous = readShadowCache(cacheDir, branchCode);
  } catch (err) {
    // readShadowCache already swallows its own errors, but stay defensive:
    // any unexpected throw still degrades to "no previous cache" rather than
    // propagating.
    previous = { documents: new Map(), state: "rebuilt", reason: `unexpected:${err.message}` };
  }

  let unchangedCount = 0;
  let changedCount = 0;
  let newCount = 0;

  for (const [key, entry] of current) {
    const prevFingerprint = previous.documents.get(key);
    if (prevFingerprint === undefined) {
      newCount++;
    } else if (prevFingerprint === entry.fingerprint) {
      unchangedCount++;
    } else {
      changedCount++;
    }
  }

  // Reported only — never interpreted as a deletion. A document can be
  // absent from one 7-day scan window and legitimately reappear (e.g. a
  // branch offline, or a scan-window edge); no tombstone is ever written.
  let disappearedCount = 0;
  for (const key of previous.documents.keys()) {
    if (!current.has(key)) disappearedCount++;
  }

  const scannedDocuments = current.size;
  const wouldSendCount = newCount + changedCount;
  const estimatedRecordReductionPct =
    scannedDocuments === 0 ? 0 : round1((unchangedCount / scannedDocuments) * 100);

  const currentFingerprintsOnly = new Map();
  for (const [key, entry] of current) currentFingerprintsOnly.set(key, entry.fingerprint);

  const writeResult = writeShadowCacheAtomic(cacheDir, branchCode, currentFingerprintsOnly);

  return {
    contractVersion: FINGERPRINT_CONTRACT_VERSION,
    datasetTag: SHADOW_DATASET_TAG,
    branchCode,
    scannedDocuments,
    unchangedCount,
    changedCount,
    newCount,
    disappearedCount,
    wouldSendCount,
    estimatedRecordReductionPct,
    cacheState: previous.state, // "loaded" or "rebuilt"
    cacheRebuildReason: previous.reason ?? null,
    cacheWriteOk: writeResult.ok,
  };
}
