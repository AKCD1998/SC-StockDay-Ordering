import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { isRealBarcode } from "./categoryUtils.js";
import { readTaxonomyWorkbookRows } from "./taxonomyWorkbook.js";

const PRODUCT_CODE_PATTERN = /^(IC-\d+|630\d+)$/i;
const BARCODE_PATTERN = /^\d{6,}$/;

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  return String(value).trim();
}

export function normalizeProductName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()\[\]{}'"`~!@#$%^&*_=+|\\/:;,.?-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createWorkbookRecord(row) {
  return {
    id: `workbook:${row.sourceRowNumber}`,
    sourceRowNumber: row.sourceRowNumber,
    productCode: cellToText(row.productCode),
    barcode: cellToText(row.barcode),
    productNameThai: cellToText(row.productNameThai),
    rawLabel: cellToText(row.rawLabel),
    normalizedName: normalizeProductName(row.productNameThai),
  };
}

function buildHeaderMap(row) {
  return new Map(row.map((cell, index) => [String(cell || "").trim(), index]));
}

function findFlatExportHeaderRow(rows) {
  return rows.findIndex((row) => {
    const headerMap = buildHeaderMap(row);
    return headerMap.has("รหัส") && headerMap.has("บาร์โค้ด") && (
      headerMap.has("ชื่อการค้า") || headerMap.has("ชื่อสินค้า")
    );
  });
}

function parseFlatLiveExportRows(rows, sourceName) {
  const headerRowIndex = findFlatExportHeaderRow(rows);
  if (headerRowIndex < 0) {
    throw new Error(`Flat live export header not found in ${sourceName}.`);
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex]);
  const codeIndex = headerMap.get("รหัส");
  const barcodeIndex = headerMap.get("บาร์โค้ด");
  const productNameIndex = headerMap.get("ชื่อการค้า") ?? headerMap.get("ชื่อสินค้า");

  return rows.slice(headerRowIndex + 1).map((row, index) => ({
    id: `live:${headerRowIndex + index + 2}`,
    sourceRowNumber: headerRowIndex + index + 2,
    productCode: cellToText(row[codeIndex]),
    barcode: cellToText(row[barcodeIndex]),
    barcodes: [cellToText(row[barcodeIndex])].filter(Boolean),
    productNameThai: cellToText(row[productNameIndex]),
    normalizedName: normalizeProductName(row[productNameIndex]),
    sourceName,
  })).filter((row) => row.productCode || row.barcode || row.productNameThai);
}

function isProductCode(value) {
  return PRODUCT_CODE_PATTERN.test(cellToText(value));
}

function isBarcodeCell(value) {
  return BARCODE_PATTERN.test(cellToText(value));
}

function parseGroupedLiveExportRows(rows, sourceName) {
  const records = [];
  let current = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const first = cellToText(row[0]);
    const second = cellToText(row[1]);

    if (isProductCode(first) && second) {
      current = {
        id: `live:${index + 1}`,
        sourceRowNumber: index + 1,
        productCode: first,
        barcode: "",
        barcodes: [],
        productNameThai: second,
        normalizedName: normalizeProductName(second),
        sourceName,
      };
      records.push(current);
      continue;
    }

    if (current && isBarcodeCell(first)) {
      current.barcodes.push(first);
      if (!current.barcode && isRealBarcode(first)) {
        current.barcode = first;
      } else if (!current.barcode) {
        current.barcode = first;
      }
    }
  }

  return records;
}

export function detectLiveFileFormat(rows) {
  if (findFlatExportHeaderRow(rows) >= 0) {
    return "flat_live_export";
  }

  if (rows.some((row) => String(row[1] || "").includes("รายงาน - รายละเอียดสินค้า"))) {
    return "grouped_product_report";
  }

  throw new Error("Unsupported live file format. Provide a flat branch-stock/product export or the grouped AdaAcc product report.");
}

export function loadWorkbookRecords(filePath, sheetName) {
  const workbook = xlsx.readFile(filePath, { raw: true, cellDates: false });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Worksheet not found: ${sheetName}`);
  }
  return readTaxonomyWorkbookRows(worksheet).map(createWorkbookRecord);
}

export function loadLiveRecords(filePath) {
  const workbook = xlsx.readFile(filePath, { raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: "" });
  const sourceName = path.basename(filePath);
  const format = detectLiveFileFormat(rows);

  const records = format === "flat_live_export"
    ? parseFlatLiveExportRows(rows, sourceName)
    : parseGroupedLiveExportRows(rows, sourceName);

  return { format, sheetName, records };
}

function addToIndex(map, key, value) {
  if (!key) return;
  const list = map.get(key) || [];
  list.push(value);
  map.set(key, list);
}

function buildIndexes(records, type) {
  const byCode = new Map();
  const byBarcode = new Map();
  const byName = new Map();

  for (const record of records) {
    addToIndex(byCode, record.productCode, record);

    const barcodes = type === "live"
      ? (record.barcodes?.length ? record.barcodes : [record.barcode])
      : [record.barcode];
    for (const barcode of [...new Set(barcodes.filter(isRealBarcode))]) {
      addToIndex(byBarcode, barcode, record);
    }

    addToIndex(byName, record.normalizedName, record);
  }

  return { byCode, byBarcode, byName };
}

function buildDuplicateConflicts(records, index, key, conflictType, mapper) {
  const conflicts = [];
  for (const [value, rows] of index.entries()) {
    if (!value || rows.length < 2) continue;
    for (const row of rows) {
      conflicts.push({
        type: conflictType,
        key,
        value,
        rowId: row.id,
        sourceRowNumber: row.sourceRowNumber,
        productCode: row.productCode,
        barcode: row.barcode || "",
        productNameThai: row.productNameThai,
        details: mapper ? mapper(rows) : `${rows.length} rows share ${key}=${value}`,
      });
    }
  }
  return conflicts;
}

function makeMatchRecord(level, liveRecord, workbookRecord, reason) {
  return {
    level,
    reason,
    liveRowNumber: liveRecord.sourceRowNumber,
    workbookRowNumber: workbookRecord.sourceRowNumber,
    liveProductCode: liveRecord.productCode,
    workbookProductCode: workbookRecord.productCode,
    liveBarcode: liveRecord.barcode || "",
    workbookBarcode: workbookRecord.barcode || "",
    liveProductNameThai: liveRecord.productNameThai,
    workbookProductNameThai: workbookRecord.productNameThai,
    workbookLabel: workbookRecord.rawLabel,
  };
}

export function reconcileRecords(workbookRecords, liveRecords) {
  const workbookIndexes = buildIndexes(workbookRecords, "workbook");
  const liveIndexes = buildIndexes(liveRecords, "live");

  const conflicts = [
    ...buildDuplicateConflicts(
      workbookRecords,
      workbookIndexes.byCode,
      "workbook_column_c_code",
      "duplicate_workbook_code",
    ),
    ...buildDuplicateConflicts(
      liveRecords,
      liveIndexes.byCode,
      "live_product_code",
      "duplicate_live_code",
    ),
    ...buildDuplicateConflicts(
      workbookRecords,
      workbookIndexes.byName,
      "workbook_normalized_name",
      "duplicate_workbook_name",
    ),
    ...buildDuplicateConflicts(
      liveRecords,
      liveIndexes.byName,
      "live_normalized_name",
      "duplicate_live_name",
    ),
  ];

  const conflictRowIds = new Set(conflicts.map((row) => row.rowId));
  const matchedWorkbookIds = new Set();
  const exactCodeMatches = [];
  const barcodeMatches = [];
  const normalizedNameMatches = [];
  const unmatchedLiveRows = [];

  for (const liveRecord of liveRecords) {
    if (conflictRowIds.has(liveRecord.id)) {
      continue;
    }

    const codeCandidates = workbookIndexes.byCode.get(liveRecord.productCode) || [];
    if (codeCandidates.length === 1 && !conflictRowIds.has(codeCandidates[0].id)) {
      matchedWorkbookIds.add(codeCandidates[0].id);
      exactCodeMatches.push(makeMatchRecord(
        "exact_code",
        liveRecord,
        codeCandidates[0],
        "live.product_code == workbook.column_c",
      ));
      continue;
    }

    const barcodeCandidates = [];
    for (const barcode of [...new Set((liveRecord.barcodes || []).filter(isRealBarcode))]) {
      const workbookBarcodeCandidates = (workbookIndexes.byBarcode.get(barcode) || [])
        .filter((row) => !conflictRowIds.has(row.id));
      for (const candidate of workbookBarcodeCandidates) {
        barcodeCandidates.push(candidate);
      }
    }
    const uniqueBarcodeCandidates = [...new Map(barcodeCandidates.map((row) => [row.id, row])).values()];
    if (uniqueBarcodeCandidates.length === 1) {
      matchedWorkbookIds.add(uniqueBarcodeCandidates[0].id);
      barcodeMatches.push(makeMatchRecord(
        "exact_barcode",
        liveRecord,
        uniqueBarcodeCandidates[0],
        "live.barcode == workbook.barcode (dummy 99999... excluded)",
      ));
      continue;
    }
    if (uniqueBarcodeCandidates.length > 1) {
      conflicts.push({
        type: "ambiguous_barcode_match",
        key: "barcode",
        value: [...new Set((liveRecord.barcodes || []).filter(isRealBarcode))].join(", "),
        rowId: liveRecord.id,
        sourceRowNumber: liveRecord.sourceRowNumber,
        productCode: liveRecord.productCode,
        barcode: liveRecord.barcode || "",
        productNameThai: liveRecord.productNameThai,
        details: `${uniqueBarcodeCandidates.length} workbook rows matched barcode(s).`,
      });
      conflictRowIds.add(liveRecord.id);
      continue;
    }

    const nameCandidates = (workbookIndexes.byName.get(liveRecord.normalizedName) || [])
      .filter((row) => !conflictRowIds.has(row.id));
    if (nameCandidates.length === 1) {
      matchedWorkbookIds.add(nameCandidates[0].id);
      normalizedNameMatches.push(makeMatchRecord(
        "normalized_name",
        liveRecord,
        nameCandidates[0],
        "normalized Thai name exact match (audit only)",
      ));
      continue;
    }
    if (nameCandidates.length > 1) {
      conflicts.push({
        type: "ambiguous_name_match",
        key: "normalized_name",
        value: liveRecord.normalizedName,
        rowId: liveRecord.id,
        sourceRowNumber: liveRecord.sourceRowNumber,
        productCode: liveRecord.productCode,
        barcode: liveRecord.barcode || "",
        productNameThai: liveRecord.productNameThai,
        details: `${nameCandidates.length} workbook rows matched normalized name.`,
      });
      conflictRowIds.add(liveRecord.id);
      continue;
    }

    unmatchedLiveRows.push({
      liveRowNumber: liveRecord.sourceRowNumber,
      liveProductCode: liveRecord.productCode,
      liveBarcode: liveRecord.barcode || "",
      liveProductNameThai: liveRecord.productNameThai,
    });
  }

  const unmatchedWorkbookRows = workbookRecords
    .filter((row) => !matchedWorkbookIds.has(row.id) && !conflictRowIds.has(row.id))
    .map((row) => ({
      workbookRowNumber: row.sourceRowNumber,
      workbookProductCode: row.productCode,
      workbookBarcode: row.barcode || "",
      workbookProductNameThai: row.productNameThai,
      workbookLabel: row.rawLabel,
    }));

  return {
    summary: {
      totalLiveRowsExamined: liveRecords.length,
      totalWorkbookRowsExamined: workbookRecords.length,
      exactCodeMatches: exactCodeMatches.length,
      barcodeMatches: barcodeMatches.length,
      normalizedNameOnlyMatches: normalizedNameMatches.length,
      unmatchedLiveRows: unmatchedLiveRows.length,
      unmatchedWorkbookRows: unmatchedWorkbookRows.length,
      conflictRows: conflicts.length,
    },
    exactCodeMatches,
    barcodeMatches,
    normalizedNameMatches,
    unmatchedLiveRows,
    unmatchedWorkbookRows,
    conflicts,
  };
}

export async function loadBackendEvidence() {
  try {
    const { getPool, closePool } = await import("./db/pool.js");
    const pool = getPool();
    const [taxonomyResult, productsResult, branchStockResult] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM taxonomy_map"),
      pool.query("SELECT COUNT(*)::int AS count FROM products"),
      pool.query("SELECT COUNT(*)::int AS count FROM branch_stock_snapshots"),
    ]);
    await closePool();
    return {
      taxonomyMapRows: Number(taxonomyResult.rows[0]?.count || 0),
      productsRows: Number(productsResult.rows[0]?.count || 0),
      branchStockSnapshotRows: Number(branchStockResult.rows[0]?.count || 0),
      status: "ok",
    };
  } catch (error) {
    return {
      taxonomyMapRows: null,
      productsRows: null,
      branchStockSnapshotRows: null,
      status: "error",
      error: error.message,
    };
  }
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

