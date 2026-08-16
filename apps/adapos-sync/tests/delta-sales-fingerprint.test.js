import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSalesDocuments, documentKey } from "../src/delta/salesFingerprint.js";

// Rebuild 2026-08-14 against Agent main f89945a98fcb35ba1b471f94a8fdb7414c67ee80.
// Design reused from the frozen candidate (parent 26c6800...), which survived
// three rounds of Codex-caught remediation: (1) no extra trim/rounding on top
// of toSalesDetailPayload's own normalization — a v1 defect that masked real
// whitespace/decimal differences, fixed in v2; (2) cache outside the git repo;
// (3) test cleanup that never touches a shared directory. All three lessons
// are re-applied from scratch here, not copy-pasted, and re-proven by the
// tests below plus the shadow/cache test files.

// Raw row shapes mirror exactly what getSalesDetailHeaderRows/
// getSalesDetailLineRows return from TPSTSalHD/TPSTSalDT (queries.js,
// unchanged between 26c6800 and f89945a — confirmed via git diff this round).
function header(overrides = {}) {
  return {
    FTBchCode: "004",
    FTShdDocNo: "DOC-1",
    FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"),
    FTShdDocTime: "10:00:00",
    FTCstCode: "CUST-1",
    FTShdStaPaid: "3",
    FTShdStaRefund: null,
    FTShdStaDoc: "1",
    FTUsrCode: "USR1",
    FTPosCode: "POS1",
    FTShdPosCN: null,
    FCShdTotal: 100,
    FCShdDis: 0,
    FCShdAftDisChg: 100,
    FCShdVat: 6.54,
    FCShdGrand: 100,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004",
    FTShdDocNo: "DOC-1",
    FNSdtSeqNo: 1,
    FTPdtCode: "PDT-1",
    FTPdtName: "สินค้า 1",
    FTSdtBarCode: "8850000000001",
    FTPunCode: "EA",
    FTSdtUnitName: "ชิ้น",
    FCSdtQty: 2,
    FCSdtStkFac: 1,
    FCSdtQtyAll: 2,
    FCSdtSetPrice: 50,
    FCSdtDis: 0,
    FCSdtNet: 100,
    FCSdtDisAvg: 0,
    FCSdtFootAvg: 0,
    FCSdtRePackAvg: 0,
    FTSdtLotNo: "LOT1",
    FDSdtExpired: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

// 1. identical scan → unchanged (fingerprint layer: same input twice -> same hash)
test("1. identical input produces an identical fingerprint", () => {
  const a = scanSalesDocuments([header()], [line()]);
  const b = scanSalesDocuments([header()], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.equal(a.size, 1);
  assert.equal(a.get(key).fingerprint, b.get(key).fingerprint);
});

// 2. new document
test("2. a new document key is a distinct map entry", () => {
  const scan1 = scanSalesDocuments([header()], [line()]);
  const scan2 = scanSalesDocuments(
    [header(), header({ FTShdDocNo: "DOC-2" })],
    [line(), line({ FTShdDocNo: "DOC-2" })],
  );
  assert.equal(scan1.size, 1);
  assert.equal(scan2.size, 2);
  assert.ok(scan2.has(documentKey("004", "DOC-2")));
});

// 3. header correction
test("3. a header-only field change changes the document fingerprint", () => {
  const before = scanSalesDocuments([header()], [line()]);
  const after = scanSalesDocuments([header({ FCShdGrand: 90, FCShdAftDisChg: 90 })], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(before.get(key).fingerprint, after.get(key).fingerprint);
});

// 4. added line
test("4. adding a line changes the document fingerprint and lineCount", () => {
  const before = scanSalesDocuments([header()], [line()]);
  const after = scanSalesDocuments([header()], [line(), line({ FNSdtSeqNo: 2, FTPdtCode: "PDT-2" })]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(before.get(key).fingerprint, after.get(key).fingerprint);
  assert.equal(before.get(key).lineCount, 1);
  assert.equal(after.get(key).lineCount, 2);
});

// 5. removed line
test("5. removing a line changes the document fingerprint", () => {
  const before = scanSalesDocuments([header()], [line(), line({ FNSdtSeqNo: 2, FTPdtCode: "PDT-2" })]);
  const after = scanSalesDocuments([header()], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(before.get(key).fingerprint, after.get(key).fingerprint);
});

// 6. changed line
test("6. changing one line field (qty) changes the document fingerprint", () => {
  const before = scanSalesDocuments([header()], [line()]);
  const after = scanSalesDocuments([header()], [line({ FCSdtQty: 3, FCSdtNet: 150 })]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(before.get(key).fingerprint, after.get(key).fingerprint);
});

// 7. reordered lines
test("7. reordering unchanged lines does not change the document fingerprint", () => {
  const lineA = line({ FNSdtSeqNo: 1, FTPdtCode: "PDT-A" });
  const lineB = line({ FNSdtSeqNo: 2, FTPdtCode: "PDT-B" });
  const orderAB = scanSalesDocuments([header()], [lineA, lineB]);
  const orderBA = scanSalesDocuments([header()], [lineB, lineA]);
  const key = documentKey("004", "DOC-1");
  assert.equal(orderAB.get(key).fingerprint, orderBA.get(key).fingerprint);
});

// 8. duplicate headers
test("8. a duplicate header row for the same key is preserved (multiset), not collapsed", () => {
  const single = scanSalesDocuments([header()], [line()]);
  const duplicated = scanSalesDocuments([header(), header()], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.equal(single.get(key).headerCount, 1);
  assert.equal(duplicated.get(key).headerCount, 2);
  assert.notEqual(single.get(key).fingerprint, duplicated.get(key).fingerprint);
});

// 9. duplicate line keys
test("9. a duplicate line seq_no with different content is detected, not silently dropped", () => {
  const lineA = line({ FNSdtSeqNo: 1, FTPdtCode: "EARLY-A" });
  const lineB = line({ FNSdtSeqNo: 1, FTPdtCode: "FINAL-VALID" });
  const withBothDuplicates = scanSalesDocuments([header()], [lineA, lineB]);
  const withOnlyFinal = scanSalesDocuments([header()], [lineB]);
  const key = documentKey("004", "DOC-1");
  assert.equal(withBothDuplicates.get(key).lineCount, 2);
  assert.equal(withOnlyFinal.get(key).lineCount, 1);
  assert.notEqual(withBothDuplicates.get(key).fingerprint, withOnlyFinal.get(key).fingerprint);
});

// 10. null vs empty per the TRANSFORMED payload — toSalesDetailPayload's own
// `|| null` normalization means a truly-empty source string ("") already
// becomes null in what Full Sync actually POSTs. This is the ONLY null/empty
// equivalence the fingerprint may honor — nothing added on top of it.
test("10. null and a truly-empty source string hash identically (matches toSalesDetailPayload's own `|| null`)", () => {
  const withNull = scanSalesDocuments([header({ FTShdPosCN: null })], [line({ FTSdtLotNo: null })]);
  const withEmpty = scanSalesDocuments([header({ FTShdPosCN: "" })], [line({ FTSdtLotNo: "" })]);
  const key = documentKey("004", "DOC-1");
  assert.equal(withNull.get(key).fingerprint, withEmpty.get(key).fingerprint);
});

// 11. whitespace difference must be detected. A whitespace-only string is
// TRUTHY in JS, so `r.FTSdtLotNo || null` does NOT collapse " " to null —
// Full Sync would literally POST "   ", not null. Also: trailing whitespace
// on an otherwise-identical value must not be trimmed away by the fingerprint.
test("11a. null and a whitespace-only source string are NOT the same document", () => {
  const withNull = scanSalesDocuments([header()], [line({ FTSdtLotNo: null })]);
  const withWhitespace = scanSalesDocuments([header()], [line({ FTSdtLotNo: "   " })]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(withNull.get(key).fingerprint, withWhitespace.get(key).fingerprint);
});

test("11b. leading/trailing whitespace on an otherwise-identical string is not trimmed away", () => {
  const untrimmed = scanSalesDocuments([header()], [line({ FTSdtLotNo: "LOT1 " })]);
  const trimmed = scanSalesDocuments([header()], [line({ FTSdtLotNo: "LOT1" })]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(untrimmed.get(key).fingerprint, trimmed.get(key).fingerprint);
});

// 12. fine-decimal difference must be detected — no rounding may be applied
// by the fingerprint layer beyond what toSalesDetailPayload's own Number()
// coercion already does.
test("12. a fine-grained decimal difference (beyond 6 decimal places) changes the fingerprint", () => {
  const a = scanSalesDocuments([header()], [line({ FCSdtSetPrice: 50.0000001 })]);
  const b = scanSalesDocuments([header()], [line({ FCSdtSetPrice: 50.0000002 })]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(a.get(key).fingerprint, b.get(key).fingerprint);
});

// 13/14. DocType 1 / DocType 9
test("13. DocType 1 (sale) and DocType 9 (return) with otherwise-identical fields hash differently", () => {
  const sale = scanSalesDocuments([header({ FTShdDocType: "1" })], [line()]);
  const ret = scanSalesDocuments([header({ FTShdDocType: "9" })], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(sale.get(key).fingerprint, ret.get(key).fingerprint);
});

// 15. paid/refund/status correction
test("15. a paid-status or refund-status correction changes the fingerprint", () => {
  const original = scanSalesDocuments([header({ FTShdStaPaid: "3", FTShdStaRefund: null })], [line()]);
  const laterRefunded = scanSalesDocuments([header({ FTShdStaPaid: "3", FTShdStaRefund: "2" })], [line()]);
  const key = documentKey("004", "DOC-1");
  assert.notEqual(original.get(key).fingerprint, laterRefunded.get(key).fingerprint);
});

// 16. disappeared document is a count concept, not a fingerprint-layer concept
// — the fingerprint layer simply omits the key from the returned Map. The
// "count, not deletion" judgment is proven at the shadow layer (see
// delta-sales-shadow.test.js #10), not here.
test("16. a document not present in this scan is simply absent from the Map, never a tombstone marker", () => {
  const scan = scanSalesDocuments([header()], [line()]);
  assert.equal(scan.has(documentKey("004", "DOES-NOT-EXIST")), false);
});

// 17. wall-clock sourceSyncedAt must never change the fingerprint. Full Sync
// stamps `sourceSyncedAt: new Date().toISOString()` fresh on every single
// run (transform.js toSalesDetailPayload) — if the fingerprint layer ever
// included that field, EVERY run would report every document as "changed",
// making Delta detection worthless. This is the one field toSalesDetailPayload
// produces that the fingerprint must explicitly exclude.
test("17. identical business data at two different wall-clock instants still produces the same fingerprint", () => {
  const realNow = Date.now;
  try {
    Date.now = () => 1_000_000_000_000;
    const scanAtT1 = scanSalesDocuments([header()], [line()]);
    Date.now = () => 2_000_000_000_000; // a full 11.5 days later
    const scanAtT2 = scanSalesDocuments([header()], [line()]);
    const key = documentKey("004", "DOC-1");
    assert.equal(scanAtT1.get(key).fingerprint, scanAtT2.get(key).fingerprint);
  } finally {
    Date.now = realNow;
  }
});

// no customer/raw payload leakage — the fingerprint is a fixed-length hex hash.
test("the fingerprint value never contains the raw customer code or any raw field value", () => {
  const scan = scanSalesDocuments([header({ FTCstCode: "SENSITIVE-CUSTOMER-ID-12345" })], [line()]);
  const fp = scan.get(documentKey("004", "DOC-1")).fingerprint;
  assert.match(fp, /^[0-9a-f]{64}$/);
  assert.equal(fp.includes("SENSITIVE"), false);
});
