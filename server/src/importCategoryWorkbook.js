import path from "node:path";
import xlsx from "xlsx";
import { getPool, closePool } from "./db/pool.js";
import { parseCategoryLabel } from "./categoryUtils.js";

function parseArgs(argv) {
  const result = {
    file: "",
    sheet: "001 PRINT",
    sourceName: "historical_excel",
    refresh: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--file") {
      result.file = next || "";
      index += 1;
    } else if (arg === "--sheet") {
      result.sheet = next || result.sheet;
      index += 1;
    } else if (arg === "--source-name") {
      result.sourceName = next || result.sourceName;
      index += 1;
    } else if (arg === "--refresh") {
      result.refresh = true;
    }
  }

  return result;
}

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
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

function readRows(worksheet) {
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
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
  const alternateCodeIndex = codeIndex > 0 ? codeIndex - 1 : -1;

  if ([codeIndex, thaiNameIndex, barcodeIndex, categoryIndex].some((index) => index < 0)) {
    throw new Error("Worksheet must include รหัส, ชื่อสินค้า, BARCODE, และ ประเภท columns.");
  }

  return rows.slice(headerRowIndex + 1).map((row, rowOffset) => {
    const preferredCode = String(row[codeIndex] || "").trim();
    const alternateCode = alternateCodeIndex >= 0 ? String(row[alternateCodeIndex] || "").trim() : "";
    const productCode = preferredCode || alternateCode;

    return {
      sourceRowNumber: headerRowIndex + rowOffset + 2,
      productCode,
      alternateProductCode: alternateCode,
      productNameThai: String(row[thaiNameIndex] || "").trim(),
      barcode: String(row[barcodeIndex] || "").trim(),
      rawLabel: String(row[categoryIndex] || "").trim(),
    };
  }).filter((row) => row.rawLabel && (row.productCode || row.barcode));
}

async function refreshCategories(pool, productCodes) {
  const { PostgresRepository } = await import("./repositories/postgresRepository.js");
  const repository = new PostgresRepository();
  repository.pool = pool;
  return repository.refreshProductCategories(productCodes);
}

async function insertTaxonomyBatch(client, rows, args) {
  if (!rows.length) return;

  const sourceNames = [];
  const sourceSheets = [];
  const sourceRowNumbers = [];
  const productCodes = [];
  const barcodes = [];
  const rawLabels = [];
  const cleanCategories = [];
  const shelfNos = [];
  const pharmacistZones = [];
  const statuses = [];
  const notes = [];

  for (const row of rows) {
    const parsed = parseCategoryLabel(row.rawLabel);
    sourceNames.push(args.sourceName);
    sourceSheets.push(args.sheet);
    sourceRowNumbers.push(row.sourceRowNumber);
    productCodes.push(row.productCode || null);
    barcodes.push(row.barcode || null);
    rawLabels.push(row.rawLabel);
    cleanCategories.push(parsed.cleanCategory || null);
    shelfNos.push(parsed.shelfNo);
    pharmacistZones.push(parsed.pharmacistZone);
    statuses.push("active");
    notes.push(row.productNameThai || null);
  }

  await client.query(
    `
    INSERT INTO taxonomy_map (
      source_name,
      source_sheet,
      source_row_number,
      product_code,
      barcode,
      raw_label,
      clean_category,
      shelf_no,
      pharmacist_zone,
      status,
      notes
    )
    SELECT
      unnest($1::text[]),
      unnest($2::text[]),
      unnest($3::int[]),
      unnest($4::text[]),
      unnest($5::text[]),
      unnest($6::text[]),
      unnest($7::text[]),
      unnest($8::int[]),
      unnest($9::boolean[]),
      unnest($10::text[]),
      unnest($11::text[])
    `,
    [
      sourceNames,
      sourceSheets,
      sourceRowNumbers,
      productCodes,
      barcodes,
      rawLabels,
      cleanCategories,
      shelfNos,
      pharmacistZones,
      statuses,
      notes,
    ],
  );
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    throw new Error("Usage: node src/importCategoryWorkbook.js --file <xlsx-path> [--sheet \"001 PRINT\"] [--refresh]");
  }

  const workbook = xlsx.readFile(args.file);
  const worksheet = workbook.Sheets[args.sheet];
  if (!worksheet) {
    throw new Error(`Worksheet not found: ${args.sheet}`);
  }

  const parsedRows = readRows(worksheet);
  if (!parsedRows.length) {
    throw new Error("No category rows found in the worksheet.");
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM taxonomy_map WHERE source_name = $1 AND source_sheet = $2",
      [args.sourceName, args.sheet],
    );

    const affectedCodes = new Set();
    const batchSize = 500;
    for (let index = 0; index < parsedRows.length; index += batchSize) {
      const batch = parsedRows.slice(index, index + batchSize);
      await insertTaxonomyBatch(client, batch, args);
      for (const row of batch) {
        if (row.productCode) {
          affectedCodes.add(row.productCode);
        }
      }
    }

    for (const row of parsedRows) {
      if (row.productCode) {
        affectedCodes.add(row.productCode);
      }
    }

    await client.query("COMMIT");

    let refreshResult = null;
    if (args.refresh && affectedCodes.size > 0) {
      refreshResult = await refreshCategories(pool, [...affectedCodes]);
    }

    console.log(
      JSON.stringify(
        {
          imported: parsedRows.length,
          sourceFile: path.basename(args.file),
          sheet: args.sheet,
          refreshResult,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

run().catch(async (error) => {
  console.error(error.message);
  await closePool();
  process.exit(1);
});
