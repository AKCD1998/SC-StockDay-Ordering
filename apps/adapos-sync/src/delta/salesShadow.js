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
//
// ── Content-capture mode (temporary, branch-scoped, opt-in only) ───────────
// By default this module only ever caches a fingerprint HASH per document
// (unchanged from the original Slice 1 design) — see test 30/31 in
// delta-sales-shadow.test.js, which assert no raw content ever reaches disk
// or the logged result when content capture is not explicitly requested.
//
// A caller MAY pass `contentCaptureBranches` (a Set of branch codes) to
// additionally cache real per-document content (canonicalized via
// salesShadowProjection.js) for branches in that set, and use it to compute
// `contentMismatchCount`: whether a document the fingerprint layer classifies
// "unchanged" actually still has identical real content to what was cached
// last run. This is the ONLY way to catch a fingerprint-algorithm bug live
// against real production data (the pure-JS/real-Postgres tests already
// prove the algorithm correct against synthetic fixtures — see
// salesShadowProjection.js's own header comment — but cannot observe real
// AdaPOS data shapes this repo's authors have never seen).
//
// This trades a small, deliberate, LOCAL-ONLY (never sent to Backend, never
// logged) privacy exposure — real customer/product/lot content cached on
// the branch PC's disk, bounded to the single most recent run's snapshot —
// for stronger correctness evidence while Delta Sync is still small-scale
// and unproven. Decided explicitly 2026-08-16 (open question #9 in
// DELTA_SYNC_DESIGN.md §10), recorded in _ledger/claude.md, NOT something
// this module decides on its own: `contentCaptureBranches` defaults to an
// empty Set, so by default NOTHING changes from the original behavior.
//
// GRADUATION CRITERIA (revert to hash-only, recorded here so it isn't lost):
// once a content-capture branch has accumulated at least 10 consecutive
// Full Sync cycles with contentMismatchCount === 0 (reviewable via the
// historical sync-*.log files, same method as the self-update consistency
// audit), remove that branch from the `ADAPOS_DELTA_SHADOW_CONTENT_CAPTURE_BRANCHES`
// config value. This is a manual, ledger-recorded operational decision, not
// automatic — this module does not revert itself.

import { FINGERPRINT_CONTRACT_VERSION, scanSalesDocuments } from "./salesFingerprint.js";
import { readShadowCache, writeShadowCacheAtomic } from "./salesShadowCache.js";
import { canonicalizeDocumentContent, projectFullSyncEffectiveState } from "./salesShadowProjection.js";

export const SHADOW_DATASET_TAG = "sales_headers_lines";

function round1(n) {
  return Math.round(n * 10) / 10;
}

// headerRows/lineRows: the exact rows Full Sync already fetched this run —
// no additional source query is issued. cacheDir: local isolated directory
// for this agent's shadow state (never the same path as any Backend/Agent
// durable checkpoint file). contentCaptureBranches: optional Set<string>,
// defaults to empty (see module header comment above) — only branches in
// this set get real-content caching/comparison; every other branch behaves
// exactly as before this change.
export function runSalesShadow({ branchCode, headerRows, lineRows, cacheDir, contentCaptureBranches }) {
  const current = scanSalesDocuments(headerRows ?? [], lineRows ?? []);
  const captureContent = (contentCaptureBranches ?? new Set()).has(String(branchCode ?? ""));

  let previous;
  try {
    previous = readShadowCache(cacheDir, branchCode);
  } catch (err) {
    // readShadowCache already swallows its own errors, but stay defensive:
    // any unexpected throw still degrades to "no previous cache" rather than
    // propagating.
    previous = { documents: new Map(), state: "rebuilt", reason: `unexpected:${err.message}` };
  }

  // Only computed when this branch has opted into content capture — a
  // failure here (e.g. an unexpected row shape) must degrade to "comparison
  // skipped", never throw and never fail the enclosing sync run.
  let currentEffectiveState = null;
  let contentComparisonSkippedReason = null;
  if (captureContent) {
    try {
      currentEffectiveState = projectFullSyncEffectiveState(headerRows, lineRows);
    } catch (err) {
      contentComparisonSkippedReason = `projection-failed:${err.message}`;
    }
  }

  let unchangedCount = 0;
  let changedCount = 0;
  let newCount = 0;
  let contentMismatchCount = captureContent ? 0 : null;

  for (const [key, entry] of current) {
    const prevEntry = previous.documents.get(key);
    const prevFingerprint = prevEntry?.fingerprint;
    const isNew = prevFingerprint === undefined;
    const isUnchanged = !isNew && prevFingerprint === entry.fingerprint;

    if (isNew) newCount++;
    else if (isUnchanged) unchangedCount++;
    else changedCount++;

    // The interesting check is specifically the "unchanged" case: a Delta
    // run would NOT resend this document, instead carrying forward the
    // content cached from the previous run. If that cached content no
    // longer matches this run's real content, the fingerprint layer's
    // "unchanged" classification was wrong — exactly the class of bug no
    // synthetic fixture can guarantee never occurs on real AdaPOS data.
    // New/changed documents are always resent by a real Delta run, so their
    // projected content trivially equals current content — nothing to check.
    if (captureContent && isUnchanged && currentEffectiveState && !contentComparisonSkippedReason) {
      const projectedContent = prevEntry.content;
      const actualContent = canonicalizeDocumentContent(currentEffectiveState.get(key));
      if (projectedContent !== actualContent) contentMismatchCount++;
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

  const currentDocumentsForCache = new Map();
  for (const [key, entry] of current) {
    const content = captureContent && currentEffectiveState
      ? canonicalizeDocumentContent(currentEffectiveState.get(key))
      : null;
    currentDocumentsForCache.set(key, { fingerprint: entry.fingerprint, content });
  }

  const writeResult = writeShadowCacheAtomic(cacheDir, branchCode, currentDocumentsForCache);

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
    // Always present (not conditionally omitted) so downstream log parsing
    // never has to special-case a sometimes-missing key. contentMismatchCount
    // is null (not 0) whenever content capture is inactive for this branch,
    // so "0" always means "compared and found zero mismatches", never
    // "didn't check."
    contentCaptureActive: captureContent,
    contentMismatchCount,
    contentComparisonSkippedReason,
  };
}
