// ── Delta Sync Slice 1 — Stage 1 shadow projection vs. Full Sync comparison ──
//
// DELTA_SYNC_DESIGN.md §8 Stage 1 requires: "reconstruct a shadow projection
// and compare it with Full Sync." The merged Slice 1 code (salesFingerprint.js
// + salesShadow.js) only compares one machine's own fingerprint scan against
// its OWN previous run's cache (run-over-run drift detection) — it never
// checks that a "changed" vs "unchanged" classification actually agrees with
// the real per-document CONTENT. This module is that missing check.
//
// LIBRARY + TESTS ONLY. Nothing here is wired into the live sync runtime
// (index.js / salesShadow.js) — it is not called during any real sync, does
// not touch the network, and does not read/write the local shadow cache.
// This is deliberate: the comparison is evidence/tooling to validate the
// fingerprint mechanism itself, not a new runtime code path.
//
// Method:
//   Full Sync always sends every document in its scan window, every run —
//   so a run's own scan IS, by definition, the true post-run state for every
//   document present in it. A hypothetical Delta run instead would only
//   resend documents the fingerprint layer classifies as new/changed, and
//   would rely on carrying forward the PREVIOUS run's content for anything
//   classified unchanged. This module reconstructs that hypothetical
//   Delta-projected state and compares it, document-by-document, against
//   the real Full Sync content for the same (current) run. Any mismatch
//   means the fingerprint layer's "unchanged" classification disagreed with
//   the documents' actual content — exactly the class of bug Stage 1 exists
//   to catch before any production Delta write is ever considered.

import { documentKey, scanSalesDocuments } from "./salesFingerprint.js";
import { toSalesDetailPayload } from "../transform.js";

// Groups the transformed (toSalesDetailPayload-normalized) header/line
// records by document key, returning the actual per-document CONTENT — not
// just its fingerprint. Reuses the exact same documentKey()/
// toSalesDetailPayload() the fingerprint layer uses, so grouping here is
// guaranteed consistent with scanSalesDocuments's own keying.
export function projectFullSyncEffectiveState(headerRows, lineRows) {
  const { headers, lines } = toSalesDetailPayload(headerRows ?? [], lineRows ?? []);

  const headersByKey = new Map();
  for (const h of headers) {
    const key = documentKey(h.branchCode, h.docNo);
    if (!headersByKey.has(key)) headersByKey.set(key, []);
    headersByKey.get(key).push(h);
  }

  const linesByKey = new Map();
  for (const l of lines) {
    const key = documentKey(l.branchCode, l.docNo);
    if (!linesByKey.has(key)) linesByKey.set(key, []);
    linesByKey.get(key).push(l);
  }

  const allKeys = new Set([...headersByKey.keys(), ...linesByKey.keys()]);
  const state = new Map();
  for (const key of allKeys) {
    state.set(key, {
      headers: headersByKey.get(key) ?? [],
      lines: linesByKey.get(key) ?? [],
    });
  }
  return state;
}

// Deterministic content serialization for equality comparison only. Sorts
// header/line arrays by their own canonical JSON so array order never
// affects equality (matching the fingerprint layer's own order-independence
// for lines), and sorts object keys within each record. This function is
// used ONLY to compare two in-memory JS objects for equality inside this
// module/its tests — its output is never persisted, logged, or returned by
// compareDeltaProjectionToFullSync's safe result object.
export function canonicalizeDocumentContent(entry) {
  const canon = (record) => {
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(record[k] ?? null)}`).join(",")}}`;
  };
  const headers = (entry?.headers ?? []).map(canon).sort();
  const lines = (entry?.lines ?? []).map(canon).sort();
  return `H[${headers.join(",")}]L[${lines.join(",")}]`;
}

// Given two consecutive scan windows (a BASELINE run — the previous sync's
// scan — and the CURRENT run — this sync's scan) for the same branch,
// reconstructs what a Delta-mode current run would have produced as its
// effective per-document state, and compares it against Full Sync's real
// current-run content.
//
// scanFn is injectable (defaults to the real scanSalesDocuments) purely so
// this module's OWN defect-catching behavior can be tested independently of
// whether the fingerprint layer itself has a bug — see the "adversarial"
// tests in the paired test file, which inject a deliberately-lying scanFn
// to prove the comparison does not just trust the fingerprint diff blindly.
export function compareDeltaProjectionToFullSync({
  baselineHeaderRows, baselineLineRows, currentHeaderRows, currentLineRows,
  scanFn = scanSalesDocuments,
}) {
  const baselineFingerprints = scanFn(baselineHeaderRows ?? [], baselineLineRows ?? []);
  const currentFingerprints = scanFn(currentHeaderRows ?? [], currentLineRows ?? []);
  const baselineState = projectFullSyncEffectiveState(baselineHeaderRows, baselineLineRows);
  const currentState = projectFullSyncEffectiveState(currentHeaderRows, currentLineRows);

  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let matchedCount = 0;
  const mismatches = [];

  for (const [key, currentEntry] of currentFingerprints) {
    const baselineEntry = baselineFingerprints.get(key);
    const isNew = baselineEntry === undefined;
    const isChanged = !isNew && baselineEntry.fingerprint !== currentEntry.fingerprint;
    const isUnchanged = !isNew && !isChanged;

    if (isNew) newCount++;
    else if (isChanged) changedCount++;
    else unchangedCount++;

    // A Delta run resends new/changed documents (their projected content is
    // simply the current content, identical to what Full Sync has). An
    // unchanged document is NOT resent — its projected content is whatever
    // the baseline run already established.
    const projectedContent = isUnchanged ? baselineState.get(key) : currentState.get(key);
    const actualFullSyncContent = currentState.get(key); // ground truth

    if (canonicalizeDocumentContent(projectedContent) === canonicalizeDocumentContent(actualFullSyncContent)) {
      matchedCount++;
    } else {
      // Safe: only a hashed document key and a classification reason are
      // recorded — never raw header/line content, never a customer/product
      // identifier.
      mismatches.push({ key, reason: isUnchanged ? "unchanged-but-content-differs" : "resent-content-mismatch" });
    }
  }

  let disappearedCount = 0;
  for (const key of baselineFingerprints.keys()) {
    if (!currentFingerprints.has(key)) disappearedCount++;
  }

  return {
    scannedDocuments: currentFingerprints.size,
    newCount,
    changedCount,
    unchangedCount,
    disappearedCount,
    matchedCount,
    mismatchCount: mismatches.length,
    mismatches,
  };
}
