import xlsx from "xlsx";

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function cellToText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  return String(value).trim();
}

function findHeaderRowIndex(rows) {
  return rows.findIndex((row) => {
    const headers = row.map((cell) => normalizeHeader(cell));
    return headers.includes("รหัส") &&
      headers.includes("ชื่อสินค้า") &&
      headers.includes("barcode") &&
      headers.includes("ประเภท");
  });
}

function findHeaderIndex(headers, candidates) {
  const normalizedCandidates = candidates.map((item) => normalizeHeader(item));
  return headers.findIndex((header) =>
    normalizedCandidates.some((candidate) => normalizeHeader(header).includes(candidate)),
  );
}

export function readTaxonomyWorkbookRows(worksheet) {
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: "" });
  if (!rows.length) {
    throw new Error("Worksheet is empty.");
  }

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    throw new Error("Worksheet must include รหัส, ชื่อสินค้า, BARCODE, และ ประเภท columns.");
  }

  const headers = rows[headerRowIndex];
  const codeIndex = findHeaderIndex(headers, ["รหัส"]);
  const thaiNameIndex = findHeaderIndex(headers, ["ชื่อสินค้า"]);
  const barcodeIndex = findHeaderIndex(headers, ["barcode", "bar code"]);
  const categoryIndex = findHeaderIndex(headers, ["ประเภท"]);

  if ([codeIndex, thaiNameIndex, barcodeIndex, categoryIndex].some((index) => index < 0)) {
    throw new Error("Worksheet must include รหัส, ชื่อสินค้า, BARCODE, และ ประเภท columns.");
  }

  return rows.slice(headerRowIndex + 1).map((row, rowOffset) => ({
    sourceRowNumber: headerRowIndex + rowOffset + 2,
    productCode: cellToText(row[codeIndex]),
    productNameThai: cellToText(row[thaiNameIndex]),
    barcode: cellToText(row[barcodeIndex]),
    rawLabel: cellToText(row[categoryIndex]),
  })).filter((row) => row.rawLabel && (row.productCode || row.barcode));
}
