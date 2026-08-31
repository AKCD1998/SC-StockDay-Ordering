import { toTransferPayload } from "../transform.js";
import { scanTransferDocuments, transferDocumentKey } from "./transferFingerprint.js";

export function projectTransferFullSyncState(headerRows, lineRows) {
  const { headers, lines } = toTransferPayload(
    headerRows ?? [],
    lineRows ?? [],
    { compositeIdentity: true },
  );
  const state = new Map();

  for (const header of headers) {
    const key = transferDocumentKey(header.branchCode, header.docType, header.docNo);
    if (!state.has(key)) state.set(key, { headers: [], lines: [] });
    state.get(key).headers.push(header);
  }
  for (const line of lines) {
    const key = transferDocumentKey(line.branchCode, line.docType, line.docNo);
    if (!state.has(key)) state.set(key, { headers: [], lines: [] });
    state.get(key).lines.push(line);
  }
  return state;
}

export function canonicalizeTransferDocumentContent(entry) {
  const canon = (record) => {
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key] ?? null)}`).join(",")}}`;
  };
  const headers = (entry?.headers ?? []).map(canon).sort();
  const lines = (entry?.lines ?? []).map(canon).sort();
  return `H[${headers.join(",")}]L[${lines.join(",")}]`;
}

export function compareTransferDeltaProjectionToFullSync({
  baselineHeaderRows,
  baselineLineRows,
  currentHeaderRows,
  currentLineRows,
  scanFn = scanTransferDocuments,
}) {
  const baselineFingerprints = scanFn(baselineHeaderRows ?? [], baselineLineRows ?? []);
  const currentFingerprints = scanFn(currentHeaderRows ?? [], currentLineRows ?? []);
  const baselineState = projectTransferFullSyncState(baselineHeaderRows, baselineLineRows);
  const currentState = projectTransferFullSyncState(currentHeaderRows, currentLineRows);
  const mismatches = [];
  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let matchedCount = 0;

  for (const [key, currentEntry] of currentFingerprints) {
    const baselineEntry = baselineFingerprints.get(key);
    const isNew = baselineEntry === undefined;
    const isChanged = !isNew && baselineEntry.fingerprint !== currentEntry.fingerprint;
    if (isNew) newCount++;
    else if (isChanged) changedCount++;
    else unchangedCount++;

    const projected = isNew || isChanged ? currentState.get(key) : baselineState.get(key);
    if (canonicalizeTransferDocumentContent(projected) === canonicalizeTransferDocumentContent(currentState.get(key))) {
      matchedCount++;
    } else {
      mismatches.push({ key, reason: "unchanged-but-content-differs" });
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
