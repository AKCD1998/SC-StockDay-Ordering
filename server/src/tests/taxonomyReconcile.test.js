import test from "node:test";
import assert from "node:assert/strict";
import xlsx from "xlsx";
import { detectLiveFileFormat, normalizeProductName, reconcileRecords } from "../taxonomyReconcile.js";
import { readTaxonomyWorkbookRows } from "../taxonomyWorkbook.js";

test("readTaxonomyWorkbookRows uses workbook column C and ignores column B fallback", () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ["", "", "รหัส", "ชื่อสินค้า", "BARCODE", "หน่วย", "จำนวน", "ประเภท"],
    [1, "IC-B-IGNORE", "IC-C-KEEP", "ชื่อสินค้า", "8851234567890", "กล่อง", 1, "1ยาตัวอย่าง"],
  ]);

  const rows = readTaxonomyWorkbookRows(worksheet);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].productCode, "IC-C-KEEP");
});

test("detectLiveFileFormat recognizes grouped AdaAcc product report", () => {
  const format = detectLiveFileFormat([
    ["", "รายงาน - รายละเอียดสินค้า"],
    ["630010001", "สามัญ ทดสอบ"],
    ["8851743003658", "หลอด", 255],
  ]);

  assert.equal(format, "grouped_product_report");
});

test("normalizeProductName collapses punctuation and whitespace for audit fallback", () => {
  assert.equal(
    normalizeProductName(" เภสัช  พาราเซตามอล (เด็ก) "),
    "เภสัช พาราเซตามอล เด็ก",
  );
});

test("reconcileRecords prioritizes exact code over barcode and name", () => {
  const workbookRecords = [
    {
      id: "workbook:1",
      sourceRowNumber: 1,
      productCode: "IC-000001",
      barcode: "8851234567890",
      productNameThai: "ยาทดสอบ",
      normalizedName: "ยาทดสอบ",
      rawLabel: "1ตัวอย่าง",
    },
  ];
  const liveRecords = [
    {
      id: "live:1",
      sourceRowNumber: 1,
      productCode: "IC-000001",
      barcode: "8851234567890",
      barcodes: ["8851234567890"],
      productNameThai: "ยาทดสอบ",
      normalizedName: "ยาทดสอบ",
    },
  ];

  const result = reconcileRecords(workbookRecords, liveRecords);

  assert.equal(result.summary.exactCodeMatches, 1);
  assert.equal(result.summary.barcodeMatches, 0);
  assert.equal(result.summary.normalizedNameOnlyMatches, 0);
});
