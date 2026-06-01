import fs from "node:fs";
import path from "node:path";
import {
  loadBackendEvidence,
  loadLiveRecords,
  loadWorkbookRecords,
  reconcileRecords,
  writeJson,
} from "./taxonomyReconcile.js";

function parseArgs(argv) {
  const args = {
    workbookFile: "",
    workbookSheet: "001 PRINT",
    liveFile: "",
    reportFile: "",
    jsonFile: "",
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--workbook-file") {
      args.workbookFile = next || "";
      index += 1;
    } else if (arg === "--workbook-sheet") {
      args.workbookSheet = next || args.workbookSheet;
      index += 1;
    } else if (arg === "--live-file") {
      args.liveFile = next || "";
      index += 1;
    } else if (arg === "--report-file") {
      args.reportFile = next || "";
      index += 1;
    } else if (arg === "--json-file") {
      args.jsonFile = next || "";
      index += 1;
    }
  }

  if (!args.workbookFile || !args.liveFile) {
    throw new Error(
      "Usage: node src/reportTaxonomyMatches.js --workbook-file <xlsx> --live-file <xls/xlsx> " +
      "[--workbook-sheet \"001 PRINT\"] [--report-file <docs.md>] [--json-file <artifacts.json>]",
    );
  }

  return args;
}

function take(items, limit = 20) {
  return items.slice(0, limit);
}

function renderTable(headers, rows) {
  const normalizedRows = rows.length ? rows : [Object.fromEntries(headers.map((header) => [header.key, "-"]))];
  const lines = [
    `| ${headers.map((header) => header.label).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];

  for (const row of normalizedRows) {
    lines.push(`| ${headers.map((header) => String(row[header.key] ?? "-").replace(/\|/g, "\\|")).join(" | ")} |`);
  }

  return lines.join("\n");
}

function summarizeKeyStats(records, key) {
  const counts = new Map();
  for (const record of records) {
    const value = String(record[key] || "").trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let duplicateGroups = 0;
  let duplicateRows = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateGroups += 1;
      duplicateRows += count;
    }
  }

  return {
    uniqueValues: counts.size,
    duplicateGroups,
    duplicateRows,
  };
}

function summarizeConflicts(conflicts) {
  const counts = new Map();
  for (const conflict of conflicts) {
    counts.set(conflict.type, (counts.get(conflict.type) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => ({ type, count }));
}

function buildRecommendation(results, liveMeta, backendEvidence) {
  const summary = results.summary;
  const productionSourceUsable = backendEvidence.status === "ok" &&
    backendEvidence.productsRows > 0 &&
    backendEvidence.branchStockSnapshotRows > 0;

  const lines = [];
  if (!productionSourceUsable) {
    lines.push(
      "The configured backend source was not usable for this run, so this comparison used a file-backed live export. " +
      "Do not treat the counts as Render/Postgres-backed production truth until `products` or `branch_stock_snapshots` are populated.",
    );
  }

  lines.push(
    `Use workbook column C as the only code key. In this run, exact code matching produced ${summary.exactCodeMatches} matches ` +
    `against ${summary.totalLiveRowsExamined} live rows from \`${liveMeta.format}\`.`,
  );

  if (summary.conflictRows > 0) {
    lines.push(
      `Keep barcode matching secondary and gated behind conflict review. There are ${summary.conflictRows} conflict rows, so any ` +
      "barcode or name fallback should be excluded from automatic writes when the workbook code or live code is duplicated.",
    );
  } else {
    lines.push("Barcode matching can remain a secondary automatic fallback for rows with no exact code hit and a non-dummy barcode.");
  }

  lines.push(
    "Treat normalized Thai name matches as audit-only suggestions. They are useful for queueing manual review, not for automatic category writes.",
  );
  lines.push(
    "Do not add IC-to-630 or 630-to-IC translation logic. Native code identity should remain exact-string based.",
  );
  return lines;
}

function buildMarkdown(args, liveMeta, backendEvidence, results, stats) {
  const summary = results.summary;
  const recommendation = buildRecommendation(results, liveMeta, backendEvidence);

  return `# Workbook Taxonomy Reconciliation Report

## Scope

- Workbook taxonomy source: \`${args.workbookFile}\`
- Workbook sheet: \`${args.workbookSheet}\`
- Live dataset source used for this run: \`${args.liveFile}\`
- Live dataset detected format: \`${liveMeta.format}\`
- Live dataset sheet: \`${liveMeta.sheetName}\`

## Backend Source Check

- Render/Postgres \`taxonomy_map\` rows: ${backendEvidence.taxonomyMapRows ?? "unavailable"}
- Render/Postgres \`products\` rows: ${backendEvidence.productsRows ?? "unavailable"}
- Render/Postgres \`branch_stock_snapshots\` rows: ${backendEvidence.branchStockSnapshotRows ?? "unavailable"}
- Backend source status: ${backendEvidence.status}${backendEvidence.error ? ` (${backendEvidence.error})` : ""}

The configured backend could not be used as the authoritative live branch-stock dataset for this run because \`products\` and \`branch_stock_snapshots\` are empty. This report therefore uses the local live export file above instead of claiming a DB-backed full match.

## Summary

- Total live rows examined: ${summary.totalLiveRowsExamined}
- Unique live product codes: ${stats.liveCodeStats.uniqueValues}
- Duplicate live product-code groups: ${stats.liveCodeStats.duplicateGroups}
- Live rows participating in duplicate live product-code groups: ${stats.liveCodeStats.duplicateRows}
- Total workbook rows examined: ${summary.totalWorkbookRowsExamined}
- Unique workbook column C codes: ${stats.workbookCodeStats.uniqueValues}
- Duplicate workbook column C groups: ${stats.workbookCodeStats.duplicateGroups}
- Workbook rows participating in duplicate column C groups: ${stats.workbookCodeStats.duplicateRows}
- Exact column C code matches: ${summary.exactCodeMatches}
- Exact barcode matches: ${summary.barcodeMatches}
- Normalized-name-only matches: ${summary.normalizedNameOnlyMatches}
- Unmatched live rows: ${summary.unmatchedLiveRows}
- Unmatched workbook rows: ${summary.unmatchedWorkbookRows}
- Conflict / duplicate rows: ${summary.conflictRows}

${stats.liveCodeStats.uniqueValues !== summary.totalLiveRowsExamined
    ? `The live export contained ${summary.totalLiveRowsExamined - stats.liveCodeStats.uniqueValues} extra rows beyond the unique code count because the source export repeats some product codes. Those rows are listed as conflicts instead of being auto-matched.`
    : ""}

## Matching Rules Applied

- Ignored workbook column B completely.
- Treated workbook column C as the only workbook product code field.
- Used barcode only as a secondary exact match when the barcode is not a dummy \`99999...\`.
- Used normalized Thai name only as an audit fallback.
- Performed no IC-to-630 or 630-to-IC conversion.

## Commands Used

\`\`\`powershell
npm run taxonomy:reconcile -- --workbook-file \"${args.workbookFile}\" --workbook-sheet \"${args.workbookSheet}\" --live-file \"${args.liveFile}\" --report-file \"${args.reportFile}\" --json-file \"${args.jsonFile}\"
\`\`\`

## Conflict Breakdown

${renderTable(
    [
      { key: "type", label: "Conflict Type" },
      { key: "count", label: "Rows" },
    ],
    stats.conflictBreakdown,
  )}

## Examples: Exact Code Matches

${renderTable(
    [
      { key: "liveProductCode", label: "Live Code" },
      { key: "workbookProductCode", label: "Workbook C Code" },
      { key: "liveProductNameThai", label: "Live Name" },
      { key: "workbookProductNameThai", label: "Workbook Name" },
      { key: "workbookLabel", label: "Workbook Label" },
    ],
    take(results.exactCodeMatches),
  )}

## Examples: Barcode Matches

${renderTable(
    [
      { key: "liveProductCode", label: "Live Code" },
      { key: "liveBarcode", label: "Barcode" },
      { key: "workbookProductCode", label: "Workbook C Code" },
      { key: "liveProductNameThai", label: "Live Name" },
      { key: "workbookProductNameThai", label: "Workbook Name" },
    ],
    take(results.barcodeMatches),
  )}

## Examples: Unmatched Live Rows

${renderTable(
    [
      { key: "liveProductCode", label: "Live Code" },
      { key: "liveBarcode", label: "Barcode" },
      { key: "liveProductNameThai", label: "Live Name" },
      { key: "liveRowNumber", label: "Live Row" },
    ],
    take(results.unmatchedLiveRows),
  )}

## Examples: Unmatched Workbook Rows

${renderTable(
    [
      { key: "workbookProductCode", label: "Workbook C Code" },
      { key: "workbookBarcode", label: "Barcode" },
      { key: "workbookProductNameThai", label: "Workbook Name" },
      { key: "workbookLabel", label: "Workbook Label" },
      { key: "workbookRowNumber", label: "Workbook Row" },
    ],
    take(results.unmatchedWorkbookRows),
  )}

## Examples: Conflict / Duplicate Rows

${renderTable(
    [
      { key: "type", label: "Type" },
      { key: "value", label: "Value" },
      { key: "productCode", label: "Product Code" },
      { key: "barcode", label: "Barcode" },
      { key: "productNameThai", label: "Name" },
      { key: "sourceRowNumber", label: "Row" },
      { key: "details", label: "Details" },
    ],
    take(results.conflicts),
  )}

## Recommendation

${recommendation.map((line) => `- ${line}`).join("\n")}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const workbookRecords = loadWorkbookRecords(args.workbookFile, args.workbookSheet);
  const liveMeta = loadLiveRecords(args.liveFile);
  const backendEvidence = await loadBackendEvidence();
  const results = reconcileRecords(workbookRecords, liveMeta.records);
  const stats = {
    liveCodeStats: summarizeKeyStats(liveMeta.records, "productCode"),
    workbookCodeStats: summarizeKeyStats(workbookRecords, "productCode"),
    conflictBreakdown: summarizeConflicts(results.conflicts),
  };

  const reportFile = args.reportFile || path.resolve("docs", "taxonomy-match-report.md");
  const jsonFile = args.jsonFile || path.resolve("docs", "taxonomy-match-report.json");
  const markdown = buildMarkdown(
    {
      ...args,
      reportFile,
      jsonFile,
    },
    liveMeta,
    backendEvidence,
    results,
    stats,
  );

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, markdown);
  writeJson(jsonFile, {
    args,
    liveMeta: {
      format: liveMeta.format,
      sheetName: liveMeta.sheetName,
      records: liveMeta.records.length,
    },
    backendEvidence,
    stats,
    results,
  });

  console.log(JSON.stringify({
    reportFile,
    jsonFile,
    summary: results.summary,
    liveFormat: liveMeta.format,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
