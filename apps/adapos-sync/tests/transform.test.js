import assert from "node:assert/strict";
import test from "node:test";

import { toSalesDetailPayload } from "../src/transform.js";

function transformedQtyBase({ qty, qtyAll, stockFactor = 1 }) {
  const payload = toSalesDetailPayload([], [{
    FTBchCode: "001",
    FTShdDocNo: "TEST",
    FNSdtSeqNo: 1,
    FCSdtQty: qty,
    FCSdtQtyAll: qtyAll,
    FCSdtStkFac: stockFactor,
  }]);
  return payload.lines[0].qtyBase;
}

test("sales detail keeps a normal sale quantity positive", () => {
  assert.equal(transformedQtyBase({ qty: 1, qtyAll: 1 }), 1);
});

test("sales detail gives a positive qtyAll the negative sign of a Void row", () => {
  assert.equal(transformedQtyBase({ qty: -1, qtyAll: 1 }), -1);
});

test("sales detail preserves the base-unit magnitude for multi-unit sales", () => {
  assert.equal(transformedQtyBase({ qty: 2, qtyAll: 20, stockFactor: 10 }), 20);
});

test("sales detail falls back to signed quantity times stock factor", () => {
  assert.equal(transformedQtyBase({ qty: -2, qtyAll: null, stockFactor: 10 }), -20);
});

// ── DocType 9 returns + bill-level gross/discount (branch 005, 2026-07-23) ──────
function headerPayload(overrides = {}) {
  const [header] = toSalesDetailPayload([{
    FTBchCode: "005",
    FTShdDocNo: "R2607005001-0000013",
    FDShdDocDate: "2026-07-15",
    FTShdDocTime: "1200",
    FTShdStaPaid: "3",
    FTShdDocType: "9",
    FTShdStaRefund: "1",
    FTShdPosCN: "S2607005001-0001534",
    FCShdTotal: 25,
    FCShdDis: 0,
    FCShdAftDisChg: 25,
    FCShdGrand: 25,
    FCShdVat: 1.64,
    ...overrides,
  }], []).headers;
  return header;
}

test("sales detail preserves a DocType 9 return header so the backend can subtract it", () => {
  const h = headerPayload();
  assert.equal(h.FTShdDocType, "9");
  assert.equal(h.grandAmount, 25);
  assert.equal(h.referenceDocNo, "S2607005001-0001534"); // FTShdPosCN → original doc
});

test("sales detail carries bill-level gross (FCShdTotal) and discount (FCShdDis)", () => {
  const h = headerPayload({ FTShdDocType: "1", FCShdTotal: 182, FCShdDis: 12, FCShdGrand: 170 });
  assert.equal(h.FCShdTotal, 182);
  assert.equal(h.FCShdDis, 12);
  assert.equal(h.grandAmount, 170);
  // gross − net = discount
  assert.equal(h.FCShdTotal - h.grandAmount, 12);
});

test("sales detail keeps a refunded-original (Refund=2) rather than dropping it", () => {
  const h = headerPayload({ FTShdDocType: "1", FTShdStaRefund: "2", FCShdGrand: 182 });
  assert.equal(h.FTShdDocType, "1");
  assert.equal(h.FTShdStaRefund, "2");
  assert.equal(h.grandAmount, 182);
});

test("sales detail preserves Crystal hourly-report allocation fields", () => {
  const payload = toSalesDetailPayload([], [{
    FTBchCode: "004",
    FTShdDocNo: "S2607004002-0014534",
    FNSdtSeqNo: 1,
    FCSdtNet: 120,
    FCSdtDisAvg: 20,
    FCSdtFootAvg: 3,
    FCSdtRePackAvg: 1,
  }]);
  assert.equal(payload.lines[0].lineAmount, 120);
  assert.equal(payload.lines[0].FCSdtDisAvg, 20);
  assert.equal(payload.lines[0].FCSdtFootAvg, 3);
  assert.equal(payload.lines[0].FCSdtRePackAvg, 1);
});
