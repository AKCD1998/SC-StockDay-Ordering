import sql from "mssql";
import { syncConfig } from "./config.js";
import {
  getProductMasterRows,
  getSalesSummaryRows,
  getPurchaseSummaryRows,
  discoverTransferSchema,
  discoverPurchaseSchema,
  getTransferHeaderRows,
  getTransferLineRows,
  getPendingReceiptHeaderRows,
  getPendingReceiptLineRows,
  getTodayApprovedReceiptHeaderRows,
  getTodayApprovedReceiptLineRows,
  getBranchStockRows,
} from "./queries.js";
import { postJson } from "./client.js";
import { toProductRecords, toSalesRecords, toTransferPayload, toPendingReceiptPayload, toApprovedReceiptPayload, toBranchStockRecords } from "./transform.js";

const PERIOD_DAYS = 30;

// ── SQL Server connection config ───────────────────────────────────────────────
// Named instance (SERVER\SQLEXPRESS): pass instanceName separately.
// mssql + tedious use SQL Server Browser (UDP 1434) to resolve the actual port.
// Do NOT set port when instanceName is present — it will be ignored or cause errors.
const sqlServerConfig = {
  server:   syncConfig.sqlServerHost,
  user:     syncConfig.sqlServerUser,
  password: syncConfig.sqlServerPassword,
  database: syncConfig.sqlServerDatabase,
  options: {
    encrypt:                false,  // SQL Server 2008 R2 does not support modern TLS
    trustServerCertificate: true,
    enableArithAbort:       true,
    ...(syncConfig.sqlServerInstanceName
      ? { instanceName: syncConfig.sqlServerInstanceName }
      : {}),
  },
  // Only include port when NOT using a named instance
  ...(syncConfig.sqlServerInstanceName ? {} : { port: syncConfig.sqlServerPort }),
};

// ── Dataset routing ────────────────────────────────────────────────────────────
async function fetchDatasets(pool) {
  const data = {};
  const { datasets, branchCode, dateCutoff } = syncConfig;

  if (datasets.includes("schema_discovery")) {
    data.schema_discovery = await discoverTransferSchema(pool);
  }
  if (datasets.includes("purchase_schema")) {
    data.purchase_schema = await discoverPurchaseSchema(pool);
  }
  if (datasets.includes("products")) {
    data.products = await getProductMasterRows(pool);
  }
  if (datasets.includes("sales")) {
    data.sales = await getSalesSummaryRows(pool, branchCode, PERIOD_DAYS, dateCutoff);
  }
  if (datasets.includes("purchases")) {
    data.purchases = await getPurchaseSummaryRows(pool, branchCode, PERIOD_DAYS);
  }
  if (datasets.includes("transfers")) {
    data.transfers = await getTransferHeaderRows(pool, branchCode, PERIOD_DAYS);
  }
  if (datasets.includes("transfer_lines")) {
    data.transfer_lines = await getTransferLineRows(pool, branchCode, PERIOD_DAYS);
  }
  if (datasets.includes("pending_receipts")) {
    data.pending_receipt_headers = await getPendingReceiptHeaderRows(pool, branchCode);
    data.pending_receipt_lines   = await getPendingReceiptLineRows(pool, branchCode);
  }
  if (datasets.includes("approved_receipts")) {
    data.approved_receipt_headers = await getTodayApprovedReceiptHeaderRows(pool, branchCode);
    data.approved_receipt_lines   = await getTodayApprovedReceiptLineRows(pool, branchCode);
  }
  if (datasets.includes("branch_stock")) {
    data.branch_stock = await getBranchStockRows(pool);
  }

  return data;
}

// ── Batch poster ──────────────────────────────────────────────────────────────
async function postBatches(url, records, batchSize = 500) {
  let sent = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    await postJson(url, { records: records.slice(i, i + batchSize) });
    sent += Math.min(batchSize, records.length - i);
  }
  return sent;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function runOnce() {
  console.log("=== AdaPos Sync Agent ===");
  console.log(`Host:          ${syncConfig.sqlServerHost}`);
  if (syncConfig.sqlServerInstanceName) {
    console.log(`Instance:      ${syncConfig.sqlServerInstanceName}`);
  }
  console.log(`Database:      ${syncConfig.sqlServerDatabase}`);
  console.log(`User:          ${syncConfig.sqlServerUser}`);
  console.log(`Branch filter: ${syncConfig.branchCode}`);
  console.log(`Datasets:      ${syncConfig.datasets.join(", ")}`);
  console.log(`Dry-run:       ${syncConfig.dryRun}`);
  console.log(`Date cutoff:   ${syncConfig.dateCutoff}`);
  console.log("");

  let pool;
  try {
    pool = await sql.connect(sqlServerConfig);
    console.log("SQL Server: connected OK\n");

    const data = await fetchDatasets(pool);

    // schema_discovery / purchase_schema print columns + sample, then exit
    if (data.schema_discovery || data.purchase_schema) {
      const discoveryKeys = ["schema_discovery", "purchase_schema"];
      for (const key of discoveryKeys) {
        if (!data[key]) continue;
        console.log(`\n=== ${key} ===`);
        for (const [table, info] of Object.entries(data[key])) {
          console.log(`\n[${table}] — ${info.columns.length} columns:`);
          console.log(info.columns.join(", "));
          if (info.sample) {
            console.log("\nSample row:");
            console.log(JSON.stringify(info.sample, null, 2));
          }
        }
      }
      console.log("\n── Review column names above before implementing queries. ──");
      return;
    }

    // Normal datasets: print counts
    let totalRead = 0;
    for (const [name, rows] of Object.entries(data)) {
      const count = Array.isArray(rows) ? rows.length : 0;
      totalRead += count;
      console.log(`  ${name}: ${count} rows`);
    }
    console.log(`\nTotal records read: ${totalRead}`);

    if (syncConfig.dryRun) {
      console.log("\n--- Dry-run: no data sent to API ---");
      console.log("Sample row per dataset:");
      for (const [name, rows] of Object.entries(data)) {
        if (Array.isArray(rows) && rows.length > 0) {
          console.log(`\n[${name}]`);
          console.log(JSON.stringify(rows[0], null, 2));
        }
      }
      console.log("\nDone. Verify output, then run with --execute to post to API.");
      return;
    }

    // Live execute — post each dataset to the API.
    const runId = `sync-${Date.now()}`;
    const startedAt = new Date().toISOString();
    let totalSent = 0;

    try {
      // Register branch before posting branch-scoped data.
      await postJson(`${syncConfig.apiBaseUrl}/api/sync/ada/branches`, {
        records: [{ branchCode: syncConfig.branchCode, isHq: false }],
      });

      if (data.products?.length) {
        console.log(`Posting ${data.products.length} products...`);
        const sent = await postBatches(
          `${syncConfig.apiBaseUrl}/api/sync/products`,
          toProductRecords(data.products),
        );
        console.log(`  products: ${sent} sent`);
        totalSent += sent;
      }

      if (data.sales?.length) {
        console.log(`Posting ${data.sales.length} sales records...`);
        const sent = await postBatches(
          `${syncConfig.apiBaseUrl}/api/sync/sales-summary`,
          toSalesRecords(data.sales, syncConfig.branchCode, PERIOD_DAYS),
        );
        console.log(`  sales: ${sent} sent`);
        totalSent += sent;
      }

      if (data.transfers?.length || data.transfer_lines?.length) {
        const hCount = data.transfers?.length ?? 0;
        const lCount = data.transfer_lines?.length ?? 0;
        console.log(`Posting ${hCount} transfer headers, ${lCount} lines...`);
        const result = await postJson(
          `${syncConfig.apiBaseUrl}/api/sync/ada/transfers`,
          toTransferPayload(data.transfers ?? [], data.transfer_lines ?? []),
        );
        const hAccepted = result.acceptedHeaders ?? result.headersAccepted ?? 0;
        const lAccepted = result.acceptedLines   ?? result.linesAccepted   ?? 0;
        console.log(`  transfers: ${hAccepted} headers, ${lAccepted} lines accepted`);
        totalSent += hAccepted + lAccepted;
      }

      if (data.pending_receipt_headers?.length || data.pending_receipt_lines?.length) {
        const hCount = data.pending_receipt_headers?.length ?? 0;
        const lCount = data.pending_receipt_lines?.length   ?? 0;
        console.log(`Posting ${hCount} pending receipt headers, ${lCount} lines...`);
        const result = await postJson(
          `${syncConfig.apiBaseUrl}/api/sync/ada/pending-receipts`,
          toPendingReceiptPayload(
            data.pending_receipt_headers ?? [],
            data.pending_receipt_lines   ?? [],
          ),
        );
        console.log(`  pending receipts: ${result.headersAccepted} headers, ${result.linesAccepted} lines accepted`);
        totalSent += result.headersAccepted + result.linesAccepted;
      }

      if (data.branch_stock?.length) {
        console.log(`Posting ${data.branch_stock.length} branch-stock rows...`);
        const branchStockRecords = toBranchStockRecords(data.branch_stock);
        const sent = await postBatches(
          `${syncConfig.apiBaseUrl}/api/branch-stock/sync`,
          branchStockRecords,
        );
        console.log(`  branch_stock: ${sent} snapshots sent`);
        totalSent += sent;
      }

      if (data.approved_receipt_headers?.length || data.approved_receipt_lines?.length) {
        const hCount = data.approved_receipt_headers?.length ?? 0;
        const lCount = data.approved_receipt_lines?.length   ?? 0;
        console.log(`Posting ${hCount} approved receipt headers, ${lCount} lines...`);
        const result = await postJson(
          `${syncConfig.apiBaseUrl}/api/sync/ada/approved-receipts`,
          {
            branchCode: syncConfig.branchCode,
            records: toApprovedReceiptPayload(
              data.approved_receipt_headers ?? [],
              data.approved_receipt_lines   ?? [],
            ),
          },
        );
        console.log(`  approved-receipts synced: ${result.upserted ?? 0} upserted`);
        totalSent += result.upserted ?? 0;
      }

      await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
        id: runId,
        syncType: `adapos_branch_${syncConfig.branchCode}`,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "success",
        recordsRead: totalRead,
        recordsSent: totalSent,
        message: `products+sales+transfers posted for branch ${syncConfig.branchCode}.`,
      });

      console.log(`\nDone. ${totalSent} records sent to API.`);
    } catch (postErr) {
      await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
        id: runId,
        syncType: `adapos_branch_${syncConfig.branchCode}`,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        recordsRead: totalRead,
        recordsSent: totalSent,
        message: postErr.message,
      }).catch(() => {});
      throw postErr;
    }

  } catch (err) {
    console.error("\nSync failed:", err.message);
    if (err.code)           console.error("Code:",   err.code);
    if (err.originalError)  console.error("Detail:", err.originalError.message);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

runOnce();
