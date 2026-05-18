import path from "node:path";
import process from "node:process";
import xlsx from "xlsx";
import { createRepository } from "./repositories/index.js";

function parseArgs(argv) {
  const result = {
    file: "",
    sheet: "สั่งสินค้า",
    branchCode: "",
    requestedBy: "Workbook Import",
    note: "",
    apiBaseUrl: "",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--file") {
      result.file = next || "";
      index += 1;
    } else if (arg === "--sheet") {
      result.sheet = next || result.sheet;
      index += 1;
    } else if (arg === "--branch-code") {
      result.branchCode = next || "";
      index += 1;
    } else if (arg === "--requested-by") {
      result.requestedBy = next || result.requestedBy;
      index += 1;
    } else if (arg === "--note") {
      result.note = next || "";
      index += 1;
    } else if (arg === "--api-base-url") {
      result.apiBaseUrl = next || "";
      index += 1;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    }
  }

  return result;
}

function normalizeCell(value) {
  return value == null ? "" : String(value).trim();
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildItemsFromSheet(worksheet) {
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
  if (!rows.length) {
    return [];
  }

  const headerRow = rows[0].map((cell) => normalizeCell(cell));
  const productCodeIndex = headerRow.indexOf("รหัสสินค้า");
  const qtyIndex = headerRow.indexOf("จำนวน");
  const unitIndex = headerRow.indexOf("หน่วย");
  const noteIndex = headerRow.indexOf("หมายเหตุ");

  if (productCodeIndex === -1 || qtyIndex === -1 || unitIndex === -1) {
    throw new Error("Worksheet must include รหัสสินค้า, จำนวน, และ หน่วย columns.");
  }

  const grouped = new Map();

  for (const row of rows.slice(1)) {
    const productCode = normalizeCell(row[productCodeIndex]);
    const requestedQty = toPositiveNumber(row[qtyIndex]);
    const requestedUnit = normalizeCell(row[unitIndex]);
    const lineNote = normalizeCell(noteIndex === -1 ? "" : row[noteIndex]);

    if (!productCode || !requestedQty || !requestedUnit) {
      continue;
    }

    const key = `${productCode}__${requestedUnit}`;
    const current = grouped.get(key) || {
      productCode,
      requestedQty: 0,
      requestedUnit,
      lineNotes: [],
    };

    current.requestedQty += requestedQty;
    if (lineNote && !current.lineNotes.includes(lineNote)) {
      current.lineNotes.push(lineNote);
    }
    grouped.set(key, current);
  }

  return [...grouped.values()].map((item) => ({
    productCode: item.productCode,
    requestedQty: item.requestedQty,
    requestedUnit: item.requestedUnit,
    lineNote: item.lineNotes.join(" | "),
  }));
}

function resolveBranchCode(branches, requestedBranchCode) {
  if (requestedBranchCode) {
    return requestedBranchCode;
  }

  if (branches.some((branch) => branch.branchCode === "000")) {
    return "000";
  }

  if (branches[0]?.branchCode) {
    return branches[0].branchCode;
  }

  throw new Error("No branches are available. Seed branches before importing workbook data.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error(
      "Usage: node src/importOrderWorkbook.js --file <xlsx-path> [--sheet สั่งสินค้า] [--branch-code 000] [--requested-by \"Workbook Import\"] [--dry-run]",
    );
  }

  const workbook = xlsx.readFile(args.file);
  const worksheet = workbook.Sheets[args.sheet];
  if (!worksheet) {
    throw new Error(`Worksheet not found: ${args.sheet}`);
  }

  const items = buildItemsFromSheet(worksheet);
  if (!items.length) {
    throw new Error("No valid order rows were found in the worksheet.");
  }

  const summaryBase = {
    file: path.basename(args.file),
    sheet: args.sheet,
    requestedBy: args.requestedBy,
    itemCount: items.length,
    totalRequestedQty: items.reduce((sum, item) => sum + Number(item.requestedQty || 0), 0),
    preview: items.slice(0, 10),
  };

  if (args.apiBaseUrl) {
    const branchesResponse = await fetch(`${args.apiBaseUrl.replace(/\/+$/g, "")}/api/branches`);
    if (!branchesResponse.ok) {
      throw new Error(`Failed to load branches from API: ${branchesResponse.status}`);
    }
    const branches = await branchesResponse.json();
    const branchCode = resolveBranchCode(branches, args.branchCode);
    const summary = { ...summaryBase, branchCode, apiBaseUrl: args.apiBaseUrl };

    if (args.dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", target: "api", ...summary }, null, 2));
      return;
    }

    const createResponse = await fetch(`${args.apiBaseUrl.replace(/\/+$/g, "")}/api/order-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branchCode,
        requestedBy: args.requestedBy,
        note: args.note || `Imported from workbook ${path.basename(args.file)} / ${args.sheet}`,
        items,
      }),
    });
    const payload = await createResponse.json();
    if (!createResponse.ok) {
      throw new Error(payload.message || `API import failed: ${createResponse.status}`);
    }

    console.log(JSON.stringify({ mode: "imported", target: "api", ...summary, orderRequestId: payload.id }, null, 2));
    return;
  }

  const repository = await createRepository();
  try {
    const branches = await repository.getBranches();
    const branchCode = resolveBranchCode(branches, args.branchCode);
    const summary = { ...summaryBase, branchCode };

    if (args.dryRun) {
      console.log(JSON.stringify({ mode: "dry-run", target: "repository", ...summary }, null, 2));
      return;
    }

    const request = await repository.createOrderRequest({
      branchCode,
      requestedBy: args.requestedBy,
      note: args.note || `Imported from workbook ${path.basename(args.file)} / ${args.sheet}`,
      items,
    });

    console.log(JSON.stringify({ mode: "imported", target: "repository", ...summary, orderRequestId: request.id }, null, 2));
  } finally {
    if (repository?.close) {
      await repository.close();
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
