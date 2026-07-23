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
