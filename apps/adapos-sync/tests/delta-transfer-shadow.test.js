import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { toTransferPayload, chunkPayloadByDoc } from "../src/transform.js";
import {
  scanTransferDocuments,
  transferDocumentKey,
} from "../src/delta/transferFingerprint.js";
import { runTransferShadow } from "../src/delta/transferShadow.js";
import {
  readTransferShadowCache,
  transferShadowCachePath,
} from "../src/delta/transferShadowCache.js";
import {
  compareTransferDeltaProjectionToFullSync,
  projectTransferFullSyncState,
} from "../src/delta/transferShadowProjection.js";

function header(overrides = {}) {
  return {
    FTBchCode: "004",
    FTPthDocNo: "TR-DOC-1",
    FTPthDocType: "4",
    FDPthDocDate: "2026-08-28",
    FDPthTnfDate: "2026-08-28",
    FTPthBchFrm: "004",
    FTPthBchTo: "005",
    FTPthWhFrm: "W1",
    FTPthWhTo: "W2",
    FTPthType: "2",
    FCPthTotal: 100,
    FCPthVat: 7,
    FCPthGrand: 107,
    FTDptCode: "D1",
    FTUsrCode: "tester",
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004",
    FTPthDocNo: "TR-DOC-1",
    FTPthDocType: "4",
    FNPtdSeqNo: 1,
    FTPdtCode: "P1",
    FTPunCode: "EA",
    FTPtdUnitName: "piece",
    FCPtdFactor: 1,
    FCPtdQty: 2,
    FCPtdQtyAll: 2,
    FCPtdCost: 10,
    FCPtdCostIn: 10,
    FCPtdNet: 20,
    FCPtdVat: 1.4,
    FTPthBchFrm: "004",
    FTPthBchTo: "005",
    FTPthWhFrm: "W1",
    FTPthWhTo: "W2",
    FDPthDocDate: "2026-08-28",
    ...overrides,
  };
}

function transferPayload(headers, lines) {
  return toTransferPayload(headers, lines, { compositeIdentity: true });
}

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "transfer-delta-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("transfer payload retains branch and document type on both headers and lines", () => {
  const payload = transferPayload([header()], [line()]);
  assert.equal(payload.headers[0].branchCode, "004");
  assert.equal(payload.headers[0].docType, "4");
  assert.equal(payload.lines[0].branchCode, "004");
  assert.equal(payload.lines[0].docType, "4");
});

test("Full payload preserves branchFrm keys and uses FTBchCode only when branchFrm is blank", () => {
  const existingKey = transferPayload(
    [header({ FTBchCode: "099", FTPthBchFrm: "004" })],
    [line({ FTBchCode: "099", FTPthBchFrm: "004" })],
  );
  assert.equal(existingKey.headers[0].branchCode, "004");
  assert.equal(existingKey.lines[0].branchCode, "004");

  const missingOldKey = transferPayload(
    [header({ FTPthDocType: "2", FTPthBchFrm: "", FTPthBchTo: "" })],
    [line({ FTPthDocType: "2", FTPthBchFrm: "", FTPthBchTo: "" })],
  );
  assert.equal(missingOldKey.headers[0].branchCode, "004");
  assert.equal(missingOldKey.lines[0].branchCode, "004");
});

test("a sparse line inherits identity only when exactly one header is possible", () => {
  const payload = transferPayload([header()], [line({ FTBchCode: undefined, FTPthDocType: undefined })]);
  assert.equal(payload.lines[0].branchCode, "004");
  assert.equal(payload.lines[0].docType, "4");

  assert.throws(() => transferPayload([
    header({ FTPthDocType: "4" }),
    header({ FTPthDocType: "7" }),
  ], [line({ FTPthDocType: undefined })]), /unambiguous branch code and document type/);
});

test("a transfer line with a complete composite identity but no header fails loudly", () => {
  assert.throws(
    () => transferPayload([header()], [line({ FTPthDocNo: "TR-ORPHAN" })]),
    /no matching header for composite identity/,
  );

  const valid = transferPayload([header()], [line()]);
  assert.throws(
    () => chunkPayloadByDoc({
      headers: valid.headers,
      lines: [{ ...valid.lines[0], docNo: "TR-ORPHAN" }],
    }, 1, { requireMatchingHeaders: true }),
    /line without a matching composite header identity/,
  );
});

test("an orphan transfer line cannot be counted by Shadow or create its cache", () => withTempDir((cacheDir) => {
  assert.throws(
    () => runTransferShadow({
      branchCode: "004",
      headerRows: [header()],
      lineRows: [line({ FTPthDocNo: "TR-ORPHAN" })],
      cacheDir,
    }),
    /no matching header for composite identity/,
  );
  assert.equal(existsSync(transferShadowCachePath(cacheDir, "004")), false);
}));

test("fingerprints are stable when inconsequential header and line ordering changes", () => {
  const headers = [header(), header({ FTPthDocNo: "TR-DOC-2" })];
  const lines = [line(), line({ FTPthDocNo: "TR-DOC-2", FTPdtCode: "P2" })];
  const sortedEntries = (documents) => [...documents].sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(
    sortedEntries(scanTransferDocuments(headers, lines)),
    sortedEntries(scanTransferDocuments([...headers].reverse(), [...lines].reverse())),
  );
});

test("same document number in different branches remains two documents", () => {
  const documents = scanTransferDocuments(
    [header(), header({ FTBchCode: "005", FTPthBchFrm: "005" })],
    [line(), line({ FTBchCode: "005", FTPthBchFrm: "005", FTPdtCode: "P5" })],
  );
  assert.equal(documents.size, 2);
  assert.equal(documents.get(transferDocumentKey("004", "4", "TR-DOC-1")).lineCount, 1);
  assert.equal(documents.get(transferDocumentKey("005", "4", "TR-DOC-1")).lineCount, 1);
});

test("same branch and document number in different document types remains two documents", () => {
  const documents = scanTransferDocuments(
    [header(), header({ FTPthDocType: "7" })],
    [line(), line({ FTPthDocType: "7", FTPdtCode: "P7" })],
  );
  assert.equal(documents.size, 2);
  assert.equal(documents.get(transferDocumentKey("004", "4", "TR-DOC-1")).lineCount, 1);
  assert.equal(documents.get(transferDocumentKey("004", "7", "TR-DOC-1")).lineCount, 1);
});

test("headers and lines never pair across branch or type, including chunking", () => {
  const headers = [
    header(),
    header({ FTBchCode: "005", FTPthBchFrm: "005" }),
    header({ FTPthDocType: "7" }),
  ];
  const lines = [
    line({ FTPdtCode: "P-004-T4" }),
    line({ FTBchCode: "005", FTPthBchFrm: "005", FTPdtCode: "P-005-T4" }),
    line({ FTPthDocType: "7", FTPdtCode: "P-004-T7" }),
  ];
  const state = projectTransferFullSyncState(headers, lines);
  assert.deepEqual(state.get(transferDocumentKey("004", "4", "TR-DOC-1")).lines.map((row) => row.productCode), ["P-004-T4"]);
  assert.deepEqual(state.get(transferDocumentKey("005", "4", "TR-DOC-1")).lines.map((row) => row.productCode), ["P-005-T4"]);
  assert.deepEqual(state.get(transferDocumentKey("004", "7", "TR-DOC-1")).lines.map((row) => row.productCode), ["P-004-T7"]);

  const chunks = chunkPayloadByDoc(
    transferPayload(headers, lines),
    1,
    { requireMatchingHeaders: true },
  );
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.headers.length === 1 && chunk.lines.length === 1));
  for (const chunk of chunks) {
    assert.equal(chunk.lines[0].branchCode, chunk.headers[0].branchCode);
    assert.equal(chunk.lines[0].docType, chunk.headers[0].docType);
  }
});

test("missing cache bootstraps safely and a second identical scan is unchanged", () => withTempDir((cacheDir) => {
  const first = runTransferShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
  assert.equal(first.cacheState, "rebuilt");
  assert.equal(first.cacheRebuildReason, "no-previous-cache");
  assert.equal(first.newCount, 1);
  assert.equal(first.cacheWriteOk, true);

  const second = runTransferShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
  assert.equal(second.cacheState, "loaded");
  assert.equal(second.unchangedCount, 1);
  assert.equal(second.wouldSendCount, 0);
}));

test("changed, new, and disappeared documents are classified independently", () => withTempDir((cacheDir) => {
  runTransferShadow({
    branchCode: "004",
    headerRows: [header(), header({ FTPthDocNo: "TR-DOC-GONE" })],
    lineRows: [line(), line({ FTPthDocNo: "TR-DOC-GONE", FTPdtCode: "PG" })],
    cacheDir,
  });
  const result = runTransferShadow({
    branchCode: "004",
    headerRows: [header({ FCPthGrand: 999 }), header({ FTPthDocNo: "TR-DOC-NEW" })],
    lineRows: [line(), line({ FTPthDocNo: "TR-DOC-NEW", FTPdtCode: "PN" })],
    cacheDir,
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.newCount, 1);
  assert.equal(result.disappearedCount, 1);
  assert.equal(result.unchangedCount, 0);
}));

test("corrupt or unreadable cache falls back to a safe rebuild", () => withTempDir((cacheDir) => {
  const cachePath = transferShadowCachePath(cacheDir, "004");
  writeFileSync(cachePath, "{broken", "utf8");
  assert.equal(readTransferShadowCache(cacheDir, "004").reason, "corrupt-json");

  rmSync(cachePath, { force: true });
  mkdirSync(cachePath);
  assert.match(readTransferShadowCache(cacheDir, "004").reason, /^read-error:/);
}));

test("Full and Delta projections match for unchanged, changed, and new header/line content", () => {
  const result = compareTransferDeltaProjectionToFullSync({
    baselineHeaderRows: [header(), header({ FTPthDocNo: "TR-DOC-2" })],
    baselineLineRows: [line(), line({ FTPthDocNo: "TR-DOC-2", FTPdtCode: "P2" })],
    currentHeaderRows: [header(), header({ FTPthDocNo: "TR-DOC-2", FCPthGrand: 222 }), header({ FTPthDocNo: "TR-DOC-3" })],
    currentLineRows: [line(), line({ FTPthDocNo: "TR-DOC-2", FTPdtCode: "P2", FCPtdQty: 9 }), line({ FTPthDocNo: "TR-DOC-3", FTPdtCode: "P3" })],
  });
  assert.deepEqual({
    unchanged: result.unchangedCount,
    changed: result.changedCount,
    new: result.newCount,
    mismatches: result.mismatchCount,
  }, { unchanged: 1, changed: 1, new: 1, mismatches: 0 });
  assert.equal(result.matchedCount, 3);
});

test("adversarial unchanged fingerprint is caught by Full-vs-Delta content comparison", () => {
  const baselineHeaders = [header()];
  const baselineLines = [line()];
  const forgedUnchanged = scanTransferDocuments(baselineHeaders, baselineLines);
  const result = compareTransferDeltaProjectionToFullSync({
    baselineHeaderRows: baselineHeaders,
    baselineLineRows: baselineLines,
    currentHeaderRows: [header({ FCPthGrand: 999 })],
    currentLineRows: [line({ FCPtdQty: 99 })],
    scanFn: () => forgedUnchanged,
  });

  assert.equal(result.unchangedCount, 1);
  assert.equal(result.changedCount, 0);
  assert.equal(result.matchedCount, 0);
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.mismatches[0].reason, "unchanged-but-content-differs");
  assert.equal(JSON.stringify(result).includes("TR-DOC-1"), false);
  assert.equal(JSON.stringify(result).includes("P1"), false);
});

test("content capture compares both header and line content without logging it", () => withTempDir((cacheDir) => {
  const first = runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  const second = runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  assert.equal(first.contentCaptureActive, true);
  assert.equal(second.contentMismatchCount, 0);
  assert.equal(JSON.stringify(second).includes("P1"), false);
}));

test("enabling content capture after hash-only establishes a baseline without a false mismatch", () => withTempDir((cacheDir) => {
  runTransferShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
  const firstCapture = runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  assert.equal(firstCapture.contentMismatchCount, 0);
  assert.equal(firstCapture.contentBaselineMissingCount, 1);

  const nextCapture = runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  assert.equal(nextCapture.contentMismatchCount, 0);
  assert.equal(nextCapture.contentBaselineMissingCount, 0);
}));

test("content capture reports a cached Full-vs-Delta content mismatch", () => withTempDir((cacheDir) => {
  runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  const cachePath = transferShadowCachePath(cacheDir, "004");
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  const [documentKey] = Object.keys(cache.documents);
  cache.documents[documentKey].content = "tampered-projection";
  writeFileSync(cachePath, JSON.stringify(cache), "utf8");

  const result = runTransferShadow({
    branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir,
    contentCaptureBranches: new Set(["004"]),
  });
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.contentMismatchCount, 1);
}));

test("hash-only mode keeps transfer content and document numbers out of its separate cache", () => withTempDir((cacheDir) => {
  runTransferShadow({ branchCode: "004", headerRows: [header()], lineRows: [line()], cacheDir });
  const cachePath = transferShadowCachePath(cacheDir, "004");
  const raw = readFileSync(cachePath, "utf8");
  assert.equal(path.basename(cachePath), "transfer-shadow-004.json");
  assert.equal(raw.includes("TR-DOC-1"), false);
  assert.equal(raw.includes("P1"), false);
}));
