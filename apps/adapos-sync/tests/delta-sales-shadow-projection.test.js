import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareDeltaProjectionToFullSync,
  projectFullSyncEffectiveState,
  canonicalizeDocumentContent,
} from "../src/delta/salesShadowProjection.js";
import { documentKey, scanSalesDocuments } from "../src/delta/salesFingerprint.js";

// DELTA_SYNC_DESIGN.md §8 Stage 1: "reconstruct a shadow projection and
// compare it with Full Sync." Pure-JS suite — no database/network. Real
// disposable-Postgres coverage of the same reconstruction, via genuine
// UPSERT-by-key semantics, is in
// delta-sales-shadow-projection-real-postgres.test.js.

function header(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"), FTShdDocTime: "10:00:00",
    FTCstCode: "CUST-1", FTShdStaPaid: "3", FTShdStaRefund: null, FTShdStaDoc: "1",
    FTUsrCode: "USR1", FTPosCode: "POS1", FTShdPosCN: null,
    FCShdTotal: 100, FCShdDis: 0, FCShdAftDisChg: 100, FCShdVat: 6.54, FCShdGrand: 100,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FNSdtSeqNo: 1, FTPdtCode: "PDT-1",
    FTPdtName: "สินค้า 1", FTSdtBarCode: "8850000000001", FTPunCode: "EA", FTSdtUnitName: "ชิ้น",
    FCSdtQty: 2, FCSdtStkFac: 1, FCSdtQtyAll: 2, FCSdtSetPrice: 50, FCSdtDis: 0, FCSdtNet: 100,
    FCSdtDisAvg: 0, FCSdtFootAvg: 0, FCSdtRePackAvg: 0,
    FTSdtLotNo: "LOT1", FDSdtExpired: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

// 1. identical two runs -> 0 mismatches, everything unchanged, all matched
test("1. two identical consecutive scans: 0 mismatches, all unchanged, matched == scanned", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line()],
    currentHeaderRows: [header()], currentLineRows: [line()],
  });
  assert.equal(result.scannedDocuments, 1);
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.newCount, 0);
  assert.equal(result.changedCount, 0);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.mismatchCount, 0);
  assert.deepEqual(result.mismatches, []);
});

// 2. new document in the current run
test("2. a document present only in the current run is classified new and matches (nothing to carry forward, resent as-is)", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [], baselineLineRows: [],
    currentHeaderRows: [header()], currentLineRows: [line()],
  });
  assert.equal(result.newCount, 1);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 3. header correction between runs
test("3. a header correction between runs is classified changed and matches (resent documents always carry current content)", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line()],
    currentHeaderRows: [header({ FCShdGrand: 90, FCShdAftDisChg: 90 })], currentLineRows: [line()],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 4. line change between runs
test("4. a line change between runs is classified changed and matches", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line()],
    currentHeaderRows: [header()], currentLineRows: [line({ FCSdtQty: 3, FCSdtNet: 150 })],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 5. reordered-but-identical lines: still genuinely unchanged, still matches
test("5. reordered but content-identical lines remain classified unchanged and still match", () => {
  const lineA = line({ FNSdtSeqNo: 1, FTPdtCode: "PDT-A" });
  const lineB = line({ FNSdtSeqNo: 2, FTPdtCode: "PDT-B" });
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [lineA, lineB],
    currentHeaderRows: [header()], currentLineRows: [lineB, lineA],
  });
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 6. disappeared document is reported as a count, not folded into mismatches
test("6. a document present only in the baseline (absent from current) is counted as disappeared, not a mismatch", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header(), header({ FTShdDocNo: "DOC-2" })],
    baselineLineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
    currentHeaderRows: [header()], currentLineRows: [line()],
  });
  assert.equal(result.disappearedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 7. duplicate header/line keys preserved and correctly compared
test("7. duplicate header rows and duplicate line seq_no are preserved through the projection and still match", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header(), header()], baselineLineRows: [line(), line({ FNSdtSeqNo: 1, FTPdtCode: "DUP" })],
    currentHeaderRows: [header(), header()], currentLineRows: [line(), line({ FNSdtSeqNo: 1, FTPdtCode: "DUP" })],
  });
  assert.equal(result.unchangedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 8. whitespace and fine-decimal differences classify as changed and match
test("8a. a whitespace-only lotNo difference is classified changed and matches", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line({ FTSdtLotNo: "LOT1" })],
    currentHeaderRows: [header()], currentLineRows: [line({ FTSdtLotNo: "LOT1 " })],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

test("8b. a fine-grained decimal difference is classified changed and matches", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line({ FCSdtSetPrice: 50.0000001 })],
    currentHeaderRows: [header()], currentLineRows: [line({ FCSdtSetPrice: 50.0000002 })],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 9. DocType 1 -> DocType 9 transition
test("9. a DocType 1 to DocType 9 transition is classified changed and matches", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header({ FTShdDocType: "1" })], baselineLineRows: [line()],
    currentHeaderRows: [header({ FTShdDocType: "9" })], currentLineRows: [line()],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 10. refund/paid status correction
test("10. a paid/refund status correction is classified changed and matches", () => {
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header({ FTShdStaRefund: null })], baselineLineRows: [line()],
    currentHeaderRows: [header({ FTShdStaRefund: "2" })], currentLineRows: [line()],
  });
  assert.equal(result.changedCount, 1);
  assert.equal(result.mismatchCount, 0);
});

// 11. ADVERSARIAL — non-vacuous proof that this module independently verifies
// content, rather than blindly trusting the fingerprint layer's classification.
test("11. adversarial: a fingerprint scanner that WRONGLY reports a genuinely-changed document as unchanged is caught as a mismatch", () => {
  const baselineHeaders = [header()];
  const baselineLines = [line()];
  const currentHeaders = [header({ FCShdGrand: 999, FCShdAftDisChg: 999 })]; // genuinely different
  const currentLines = [line()];

  let callCount = 0;
  const lyingScanFn = (h, l) => {
    callCount++;
    const real = scanSalesDocuments(h, l);
    if (callCount === 2) {
      // 2nd call = the CURRENT scan. Force its fingerprint to equal the
      // baseline's, simulating a fingerprint-layer bug that misses a real
      // content change — the exact failure mode Stage 1 must catch.
      const baselineReal = scanSalesDocuments(baselineHeaders, baselineLines);
      const key = documentKey("004", "DOC-1");
      const forced = new Map(real);
      forced.set(key, { ...forced.get(key), fingerprint: baselineReal.get(key).fingerprint });
      return forced;
    }
    return real;
  };

  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: baselineHeaders, baselineLineRows: baselineLines,
    currentHeaderRows: currentHeaders, currentLineRows: currentLines,
    scanFn: lyingScanFn,
  });

  assert.equal(result.unchangedCount, 1); // the injected lie
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.mismatches[0].reason, "unchanged-but-content-differs");
  // Safe output: only a hashed key + reason string, never raw content.
  assert.match(result.mismatches[0].key, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(result.mismatches).includes("999"), false);
});

// 12. safe output — no customer/product/lot identifiers anywhere in the result
test("12. the comparison result never contains raw customer/product/lot content, even with a real mismatch present", () => {
  let callCount = 0;
  const lyingScanFn = (h, l) => {
    callCount++;
    const real = scanSalesDocuments(h, l);
    if (callCount === 2) {
      const baselineReal = scanSalesDocuments([header()], [line()]);
      const key = documentKey("004", "DOC-1");
      const forced = new Map(real);
      forced.set(key, { ...forced.get(key), fingerprint: baselineReal.get(key).fingerprint });
      return forced;
    }
    return real;
  };
  const result = compareDeltaProjectionToFullSync({
    baselineHeaderRows: [header()], baselineLineRows: [line()],
    currentHeaderRows: [header({ FTCstCode: "SECRET-CUSTOMER-ID" })],
    currentLineRows: [line({ FTSdtLotNo: "SECRET-LOT", FTPdtCode: "SECRET-PRODUCT" })],
    scanFn: lyingScanFn,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("SECRET"), false);
  assert.equal(serialized.includes("DOC-1"), false);
});

// projectFullSyncEffectiveState / canonicalizeDocumentContent direct sanity
test("projectFullSyncEffectiveState groups by the same documentKey the fingerprint layer uses", () => {
  const state = projectFullSyncEffectiveState([header()], [line()]);
  assert.equal(state.size, 1);
  assert.ok(state.has(documentKey("004", "DOC-1")));
});

test("canonicalizeDocumentContent is order-independent for lines but sensitive to actual content", () => {
  const lineA = line({ FNSdtSeqNo: 1, FTPdtCode: "PDT-A" });
  const lineB = line({ FNSdtSeqNo: 2, FTPdtCode: "PDT-B" });
  const entry1 = { headers: [header()], lines: [lineA, lineB] };
  const entry2 = { headers: [header()], lines: [lineB, lineA] };
  const entry3 = { headers: [header()], lines: [lineA, line({ FNSdtSeqNo: 2, FTPdtCode: "DIFFERENT" })] };
  assert.equal(canonicalizeDocumentContent(entry1), canonicalizeDocumentContent(entry2));
  assert.notEqual(canonicalizeDocumentContent(entry1), canonicalizeDocumentContent(entry3));
});
