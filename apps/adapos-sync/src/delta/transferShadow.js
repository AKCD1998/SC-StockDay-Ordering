import { scanTransferDocuments, TRANSFER_FINGERPRINT_CONTRACT_VERSION } from "./transferFingerprint.js";
import { readTransferShadowCache, writeTransferShadowCacheAtomic } from "./transferShadowCache.js";
import {
  canonicalizeTransferDocumentContent,
  projectTransferFullSyncState,
} from "./transferShadowProjection.js";

export const TRANSFER_SHADOW_DATASET_TAG = "transfer_headers_lines";

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function runTransferShadow({ branchCode, headerRows, lineRows, cacheDir, contentCaptureBranches }) {
  const current = scanTransferDocuments(headerRows ?? [], lineRows ?? []);
  const captureContent = (contentCaptureBranches ?? new Set()).has(String(branchCode ?? ""));
  let previous;
  try {
    previous = readTransferShadowCache(cacheDir, branchCode);
  } catch (err) {
    previous = { documents: new Map(), state: "rebuilt", reason: `unexpected:${err.message}` };
  }

  let currentState = null;
  let contentComparisonSkippedReason = null;
  if (captureContent) {
    try {
      currentState = projectTransferFullSyncState(headerRows, lineRows);
    } catch (err) {
      contentComparisonSkippedReason = `projection-failed:${err.message}`;
    }
  }

  let unchangedCount = 0;
  let changedCount = 0;
  let newCount = 0;
  let contentMismatchCount = captureContent ? 0 : null;
  let contentBaselineMissingCount = captureContent ? 0 : null;
  for (const [key, entry] of current) {
    const previousEntry = previous.documents.get(key);
    const isNew = previousEntry?.fingerprint === undefined;
    const isUnchanged = !isNew && previousEntry.fingerprint === entry.fingerprint;
    if (isNew) newCount++;
    else if (isUnchanged) unchangedCount++;
    else changedCount++;

    if (captureContent && isUnchanged && currentState && !contentComparisonSkippedReason) {
      if (previousEntry.content == null) {
        // A branch may enable content capture after first running hash-only.
        // That first capture cycle establishes content; absence is not a
        // mismatch and the next cycle can compare normally.
        contentBaselineMissingCount++;
      } else if (previousEntry.content !== canonicalizeTransferDocumentContent(currentState.get(key))) {
        contentMismatchCount++;
      }
    }
  }

  let disappearedCount = 0;
  for (const key of previous.documents.keys()) {
    if (!current.has(key)) disappearedCount++;
  }

  const documentsForCache = new Map();
  for (const [key, entry] of current) {
    documentsForCache.set(key, {
      fingerprint: entry.fingerprint,
      content: captureContent && currentState
        ? canonicalizeTransferDocumentContent(currentState.get(key))
        : null,
    });
  }
  const writeResult = writeTransferShadowCacheAtomic(cacheDir, branchCode, documentsForCache);
  const scannedDocuments = current.size;

  return {
    contractVersion: TRANSFER_FINGERPRINT_CONTRACT_VERSION,
    datasetTag: TRANSFER_SHADOW_DATASET_TAG,
    branchCode,
    scannedDocuments,
    unchangedCount,
    changedCount,
    newCount,
    disappearedCount,
    wouldSendCount: newCount + changedCount,
    estimatedRecordReductionPct: scannedDocuments === 0 ? 0 : round1((unchangedCount / scannedDocuments) * 100),
    cacheState: previous.state,
    cacheRebuildReason: previous.reason ?? null,
    cacheWriteOk: writeResult.ok,
    contentCaptureActive: captureContent,
    contentMismatchCount,
    contentBaselineMissingCount,
    contentComparisonSkippedReason,
  };
}
