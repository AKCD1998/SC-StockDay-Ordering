import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCategoryDecision,
  buildDisplayCategory,
  inferKeywordCategory,
  isRealBarcode,
  parseCategoryLabel,
} from "../categoryUtils.js";

test("parseCategoryLabel splits shelf prefix and canonicalizes typo aliases", () => {
  const parsed = parseCategoryLabel("3ยาฆ่าเชิ้อ");

  assert.equal(parsed.shelfNo, 3);
  assert.equal(parsed.cleanCategory, "ยาฆ่าเชื้อ");
  assert.equal(parsed.pharmacistZone, true);
});

test("isRealBarcode rejects dummy 99999 house barcodes", () => {
  assert.equal(isRealBarcode("999991234567"), false);
  assert.equal(isRealBarcode("88501743003658"), true);
});

test("inferKeywordCategory uses Thai and English names for deterministic matches", () => {
  const match = inferKeywordCategory({
    productNameThai: "สามัญ สำลีก้อนโรงพยาบาล 40 กรัม",
    productNameEng: "AMBULANCE COTTON BALL 40 G.",
    barcode: "8850185002571",
  });

  assert.equal(match.cleanCategory, "สำลี");
  assert.equal(match.shelfNo, null);
});

test("buildCategoryDecision flags shelf-3 antibiotic history for reverification", () => {
  const decision = buildCategoryDecision({
    product: {
      productCode: "630010001",
      productNameThai: "ยาฆ่าเชื้อ ตัวอย่าง",
      productNameEng: "",
      barcode: "8850000000001",
    },
    exactMatch: {
      product_code: "630010001",
      barcode: "8850000000001",
      raw_label: "3ยาฆ่าเชื้อ",
      clean_category: "ยาฆ่าเชื้อ",
      shelf_no: 3,
      pharmacist_zone: true,
      status: "active",
    },
  });

  assert.equal(decision.reviewStatus, "reverify");
  assert.equal(decision.displayCategory, "3ยาฆ่าเชื้อ");
});

test("buildDisplayCategory preserves prefix formatting for pharmacist items", () => {
  assert.equal(buildDisplayCategory("ยาครีม", 5), "5ยาครีม");
  assert.equal(buildDisplayCategory("สำลี", null), "สำลี");
});
