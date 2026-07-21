import sql from "mssql";
import { syncConfig } from "./config.js";
import {
  getProductMasterRows,
  getSalesSummaryRows,
  getSalesDetailHeaderRows,
  getSalesDetailLineRows,
  getPurchaseSummaryRows,
  discoverTransferSchema,
  discoverPurchaseSchema,
  discoverProductMasterSchema,
  getTransferHeaderRows,
  getTransferLineRows,
  getPendingReceiptHeaderRows,
  getPendingReceiptLineRows,
  getApprovedReceiptHeaderRows,
  getApprovedReceiptLineRows,
  getBranchStockRows,
  getProductPriceDefaultRows,
  getBranchPriceOverrideRows,
} from "./queries.js";
import { postJson, getJson, setSyncRunId } from "./client.js";
import { postBatchesWithRetry } from "./batching.js";
import { completeSyncRun, finalizeRun, formatCp4Result, handoffBranchStock, startHybridRun, waitForApplied } from "./sync-v2.js";
import { toProductRecords, toSalesRecords, toSalesDetailPayload, chunkPayloadByDoc, toTransferPayload, toPendingReceiptPayload, toApprovedReceiptPayload, toBranchStockRecords, toStockSnapshotRecords, toProductPriceDefaultRecords, toProductBranchPriceOverrideRecords } from "./transform.js";

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
  const wantsSalesDetail = datasets.includes("sales_detail") || datasets.includes("sales");

  if (datasets.includes("schema_discovery")) {
    data.schema_discovery = await discoverTransferSchema(pool);
  }
  if (datasets.includes("purchase_schema")) {
    data.purchase_schema = await discoverPurchaseSchema(pool);
  }
  if (datasets.includes("product_master_schema")) {
    data.product_master_schema = await discoverProductMasterSchema(pool);
  }
  if (datasets.includes("products")) {
    data.products = await getProductMasterRows(pool);
  }
  if (datasets.includes("sales")) {
    data.sales = await getSalesSummaryRows(pool, branchCode, PERIOD_DAYS, dateCutoff);
  }
  if (wantsSalesDetail) {
    const salesDateOpts = {
      // Routine runs use a short self-healing window (default 7 days), not the
      // 30-day PERIOD_DAYS used by the sales-summary dataset — see
      // syncConfig.salesDetailLookbackDays. An explicit --date-from/--date-to
      // backfill still overrides this entirely (see applySalesDateWindow).
      periodDays: syncConfig.salesDetailLookbackDays,
      dateCutoff,
      fromDate: syncConfig.dateFrom,
      toDate: syncConfig.dateTo,
    };
    data.sales_detail_headers = await getSalesDetailHeaderRows(pool, branchCode, salesDateOpts);
    data.sales_detail_lines = await getSalesDetailLineRows(pool, branchCode, salesDateOpts);
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
    const dateOpts = {
      lookbackDays: syncConfig.approvedReceiptsLookbackDays,
      fromDate: syncConfig.dateFrom,
      toDate:   syncConfig.dateTo,
    };
    const rangeLabel = syncConfig.dateFrom
      ? `${syncConfig.dateFrom} → ${syncConfig.dateTo ?? "today"}`
      : `last ${syncConfig.approvedReceiptsLookbackDays} days`;
    console.log(`  approved_receipts date range: ${rangeLabel}`);
    data.approved_receipt_headers = await getApprovedReceiptHeaderRows(pool, branchCode, dateOpts);
    data.approved_receipt_lines   = await getApprovedReceiptLineRows(pool, branchCode, dateOpts);
  }
  if (datasets.includes("branch_stock") || datasets.includes("branch_stock_history")) {
    data.branch_stock = await getBranchStockRows(pool, branchCode);
  }
  // Price datasets are all-branch and read from the consolidated HQ/mother DB.
  // They are NOT scoped by branchCode — grouping per branch happens at post time.
  if (datasets.includes("price_defaults")) {
    data.price_defaults = await getProductPriceDefaultRows(pool);
  }
  if (datasets.includes("branch_price_overrides")) {
    data.branch_price_overrides = await getBranchPriceOverrideRows(pool);
  }

  return data;
}

// ── Batch poster ──────────────────────────────────────────────────────────────
async function postBatches(url, records, batchSize = 500, extraBody = {}) {
  return postBatchesWithRetry({ url, records, batchSize, extraBody, post: postJson });
}

const BRANCH_STOCK_RETRY_OPTIONS = Object.freeze({
  operationName: "branch_stock",
  maxAttempts: 3,
  retryBaseDelayMs: 1_000,
  retryMaxDelayMs: 5_000,
});

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
  if (syncConfig.datasets.includes("approved_receipts")) {
    if (syncConfig.dateFrom) {
      console.log(`Backfill:      approved_receipts ${syncConfig.dateFrom} → ${syncConfig.dateTo ?? "today"}`);
    } else {
      console.log(`Approved lookback: last ${syncConfig.approvedReceiptsLookbackDays} days`);
    }
  }
  if (syncConfig.datasets.includes("sales") || syncConfig.datasets.includes("sales_detail")) {
    if (syncConfig.dateFrom) {
      console.log(`Sales detail:  ${syncConfig.dateFrom} → ${syncConfig.dateTo ?? syncConfig.dateFrom}`);
    } else {
      console.log(`Sales detail:  last ${syncConfig.salesDetailLookbackDays} days (self-healing window, capped at ${syncConfig.dateCutoff})`);
    }
  }
  console.log("");

  if (syncConfig.skipIfSyncedToday && !syncConfig.dryRun) {
    try {
      const status = await getJson(
        `${syncConfig.apiBaseUrl}/api/sync/today-status?branchCode=${encodeURIComponent(syncConfig.branchCode)}&datasetTag=branch_stock_history`,
      );
      if (status.hasSuccessToday) {
        console.log("branch_stock_history already synced successfully today — sending heartbeat only, skipping full run.");
        await postJson(`${syncConfig.apiBaseUrl}/api/sync/heartbeat`, {
          branchCode: syncConfig.branchCode,
          event: "evening-check-skip",
        });
        return;
      }
      console.log("No successful branch_stock_history run yet today — proceeding with full sync.");
    } catch (checkErr) {
      console.warn(`WARN: today-status check failed (${checkErr.message}); proceeding with full sync as a safe fallback.`);
    }
  }

  let pool;
  try {
    pool = await sql.connect(sqlServerConfig);
    console.log("SQL Server: connected OK\n");

    const data = await fetchDatasets(pool);

    // schema_discovery / purchase_schema print columns + sample, then exit
    if (data.schema_discovery || data.purchase_schema || data.product_master_schema) {
      const discoveryKeys = ["schema_discovery", "purchase_schema", "product_master_schema"];
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
    const branchStockRecords = syncConfig.datasets.includes("branch_stock")
      ? toBranchStockRecords(data.branch_stock ?? [], syncConfig.branchCode)
      : null;

    if (syncConfig.dryRun) {
      console.log("\n--- Dry-run: no data sent to API ---");
      if (syncConfig.syncV2.enabled) {
        const recordCount = branchStockRecords?.length ?? 0;
        const batchCount = recordCount === 0 ? 0 : Math.ceil(recordCount / syncConfig.syncV2.batchSize);
        console.log(`Would use CP4 hybrid_v2 for branch_stock: ${recordCount} records in ${batchCount} batch(es).`);
        console.log("No API request or payload is emitted in dry-run mode.");
      } else {
        console.log("Sample row per dataset:");
        for (const [name, rows] of Object.entries(data)) {
          if (Array.isArray(rows) && rows.length > 0) {
            console.log(`\n[${name}]`);
            console.log(JSON.stringify(rows[0], null, 2));
          }
        }
        // Price datasets ship a normalized shape, not the raw row.
        if (data.price_defaults) {
          const recs = toProductPriceDefaultRecords(data.price_defaults);
          console.log(`\n[price_defaults] ${data.price_defaults.length} rows -> ${recs.length} normalized records`);
          if (recs.length) console.log(JSON.stringify(recs[0], null, 2));
        }
        if (data.branch_price_overrides) {
          const recs = toProductBranchPriceOverrideRecords(data.branch_price_overrides);
          console.log(`\n[branch_price_overrides] ${data.branch_price_overrides.length} rows -> ${recs.length} normalized records`);
          if (recs.length) console.log(JSON.stringify(recs[0], null, 2));
        }
      }

      console.log("\nDone. Verify output, then run with --execute to post to API.");
      return;
    }

    // Live execute — post each dataset to the API.
    const runId = `sync-${Date.now()}`;
    // One snapshot id per run, shared by both price datasets, so the backend can
    // apply snapshot-purge semantics (drop stale slots not present in this run).
    const snapshotId = `price-snap-${Date.now()}`;
    const startedAt = new Date().toISOString();
    let totalSent = 0;
    let approvedFailed = 0;
    let branchStockV2Manifest = null;
    const branchStockV2Enabled = syncConfig.syncV2.datasets.includes("branch_stock");

    // CP2 (observability): ask the backend to open a run row immediately
    // (status='running') so a mid-run crash leaves visible evidence instead
    // of nothing. Best-effort — an older/unreachable backend simply means no
    // correlation ID gets attached to this run's requests; the sync itself
    // must never be blocked by this.
    let syncRunId = null;
    setSyncRunId(null);
    try {
      if (branchStockV2Enabled) {
        syncRunId = await startHybridRun({
          baseUrl: syncConfig.apiBaseUrl,
          branchCode: syncConfig.branchCode,
          postJson,
          setSyncRunId,
        });
      } else {
        const startResult = await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-start`, {
          syncType: `adapos_branch_${syncConfig.branchCode}`,
          branchCode: syncConfig.branchCode,
        });
        syncRunId = startResult?.runId || null;
        if (syncRunId) setSyncRunId(syncRunId);
      }
    } catch (runStartErr) {
      if (branchStockV2Enabled) throw new Error(`CP4 hybrid run-start failed: ${runStartErr.message}`);
      console.warn(`  WARN: /run-start failed, continuing without a correlation ID: ${runStartErr.message}`);
    }

    try {
      // Register branch before posting branch-scoped data.
      await postJson(`${syncConfig.apiBaseUrl}/api/sync/ada/branches`, {
        records: [{ branchCode: syncConfig.branchCode, isHq: false }],
      });

      if (data.products?.length) {
        console.log(`Posting ${data.products.length} products (${syncConfig.productBatchSize}/batch)...`);
        const sent = await postBatches(
          `${syncConfig.apiBaseUrl}/api/sync/products`,
          toProductRecords(data.products),
          syncConfig.productBatchSize,
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

      if (data.sales_detail_headers?.length || data.sales_detail_lines?.length) {
        const hCount = data.sales_detail_headers?.length ?? 0;
        const lCount = data.sales_detail_lines?.length ?? 0;
        const payload = toSalesDetailPayload(data.sales_detail_headers ?? [], data.sales_detail_lines ?? []);
        const chunks = chunkPayloadByDoc(payload, syncConfig.salesDetailChunkDocs);
        console.log(`Posting ${hCount} detailed sales headers, ${lCount} lines in ${chunks.length} chunk(s) of up to ${syncConfig.salesDetailChunkDocs} docs...`);
        let hAccepted = 0;
        let lAccepted = 0;
        for (const [chunkIndex, chunk] of chunks.entries()) {
          // eslint-disable-next-line no-await-in-loop
          const result = await postJson(`${syncConfig.apiBaseUrl}/api/sync/ada/sales`, chunk);
          hAccepted += result.acceptedHeaders ?? 0;
          lAccepted += result.acceptedLines ?? 0;
          console.log(`  chunk ${chunkIndex + 1}/${chunks.length}: ${result.acceptedHeaders ?? 0} headers, ${result.acceptedLines ?? 0} lines accepted`);
        }
        console.log(`  sales_detail: ${hAccepted} headers, ${lAccepted} lines accepted`);
        totalSent += hAccepted + lAccepted;
      }

      if (data.transfers?.length || data.transfer_lines?.length) {
        const hCount = data.transfers?.length ?? 0;
        const lCount = data.transfer_lines?.length ?? 0;
        const transferPayload = toTransferPayload(data.transfers ?? [], data.transfer_lines ?? []);
        const transferChunks = chunkPayloadByDoc(transferPayload, syncConfig.transferChunkDocs);
        console.log(`Posting ${hCount} transfer headers, ${lCount} lines in ${transferChunks.length} chunk(s) of up to ${syncConfig.transferChunkDocs} docs...`);
        let hAccepted = 0;
        let lAccepted = 0;
        for (const [chunkIndex, chunk] of transferChunks.entries()) {
          // eslint-disable-next-line no-await-in-loop
          const result = await postJson(`${syncConfig.apiBaseUrl}/api/sync/ada/transfers`, chunk);
          const chunkHAccepted = result.acceptedHeaders ?? result.headersAccepted ?? 0;
          const chunkLAccepted = result.acceptedLines   ?? result.linesAccepted   ?? 0;
          hAccepted += chunkHAccepted;
          lAccepted += chunkLAccepted;
          console.log(`  chunk ${chunkIndex + 1}/${transferChunks.length}: ${chunkHAccepted} headers, ${chunkLAccepted} lines accepted`);
        }
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

      if (branchStockRecords) {
        const handoff = await handoffBranchStock({
          v2Enabled: branchStockV2Enabled,
          baseUrl: syncConfig.apiBaseUrl,
          syncRunId,
          branchCode: syncConfig.branchCode,
          records: branchStockRecords,
          v2BatchSize: syncConfig.syncV2.batchSize,
          v1BatchSize: syncConfig.branchStockBatchSize,
          postJson,
          postV1Batches: postBatchesWithRetry,
          retryOptions: BRANCH_STOCK_RETRY_OPTIONS,
        });
        branchStockV2Manifest = handoff.manifest;
        if (branchStockV2Enabled) {
          console.log(`  branch_stock: ${handoff.manifest.recordCount} records staged in ${handoff.manifest.batchCount} batch(es)`);
        } else if (handoff.sent > 0) {
          const sent = handoff.sent;
          console.log(`  branch_stock: ${sent} snapshots sent`);
          totalSent += sent;
        }
      }

      // Accumulate-mode history — additive to branch_stock above, which stays the
      // overwrite-mode "current" sync untouched. Only runs when explicitly enabled
      // via ADAPOS_SYNC_DATASETS, since it writes a NEW row every run instead of
      // updating one row per product (unbounded growth if run every 10 minutes —
      // intended for the twice-daily 08:20/19:20 schedule, not the routine loop).
      if (syncConfig.datasets.includes("branch_stock_history") && data.branch_stock?.length) {
        console.log(`Posting ${data.branch_stock.length} stock-history snapshot rows (${syncConfig.branchStockBatchSize}/batch, up to ${BRANCH_STOCK_RETRY_OPTIONS.maxAttempts} attempts)...`);
        const sent = await postBatchesWithRetry({
          url: `${syncConfig.apiBaseUrl}/api/sync/ada/stock-snapshots`,
          records: toStockSnapshotRecords(data.branch_stock, syncConfig.branchCode),
          batchSize: syncConfig.branchStockBatchSize,
          extraBody: { sourceSyncedAt: startedAt },
          post: postJson,
          ...BRANCH_STOCK_RETRY_OPTIONS,
          operationName: "branch_stock_history",
        });
        console.log(`  branch_stock_history: ${sent} snapshot rows sent`);
        totalSent += sent;
      }

      if (data.approved_receipt_headers?.length || data.approved_receipt_lines?.length) {
        const hCount = data.approved_receipt_headers?.length ?? 0;
        const lCount = data.approved_receipt_lines?.length   ?? 0;
        const rangeLabel = syncConfig.dateFrom
          ? `${syncConfig.dateFrom} → ${syncConfig.dateTo ?? "today"}`
          : `last ${syncConfig.approvedReceiptsLookbackDays} days`;
        console.log(`Posting ${hCount} approved receipt headers, ${lCount} lines (${rangeLabel})...`);

        const records = toApprovedReceiptPayload(
          data.approved_receipt_headers ?? [],
          data.approved_receipt_lines   ?? [],
        );

        const docNosToPost = records.map((r) => r.docNo).filter(Boolean);
        console.log(`  Doc nos: ${docNosToPost.join(", ") || "(none)"}`);

        let approvedUpserted = 0;
        const failedDocNos = [];

        for (const record of records) {
          try {
            const result = await postJson(
              `${syncConfig.apiBaseUrl}/api/sync/ada/approved-receipts`,
              { branchCode: syncConfig.branchCode, records: [record] },
            );
            approvedUpserted += result.upserted ?? 1;
          } catch (postDocErr) {
            approvedFailed++;
            failedDocNos.push(record.docNo ?? "?");
            console.warn(`  WARN: failed to post ${record.docNo}: ${postDocErr.message}`);
          }
        }

        console.log(`  approved-receipts: ${approvedUpserted} upserted, ${approvedFailed} failed`);
        if (failedDocNos.length) {
          console.log(`  Failed doc nos: ${failedDocNos.join(", ")}`);
        }
        totalSent += approvedUpserted;
      }

      // ── Price defaults (master) ───────────────────────────────────────────────
      // Sent as { snapshotId, records } in batches of 500.
      if (data.price_defaults?.length) {
        const records = toProductPriceDefaultRecords(data.price_defaults);
        console.log(`Posting price defaults: ${data.price_defaults.length} rows -> ${records.length} records...`);
        const sent = await postBatches(
          `${syncConfig.apiBaseUrl}/api/sync/ada/prices/defaults`,
          records,
          500,
          { snapshotId },
        );
        console.log(`  price_defaults: ${sent} sent`);
        totalSent += sent;
      }

      // ── Per-branch price overrides ────────────────────────────────────────────
      // Grouped by branchCode so the server applies per-branch snapshot purge.
      // Each branch's batches carry { snapshotId, branchCode, batchSeq, isLastBatch,
      // records }; isLastBatch=true on the final batch signals "snapshot complete".
      if (data.branch_price_overrides?.length) {
        const records = toProductBranchPriceOverrideRecords(data.branch_price_overrides);
        console.log(`Posting branch price overrides: ${data.branch_price_overrides.length} rows -> ${records.length} records...`);

        const byBranch = new Map();
        for (const rec of records) {
          if (!byBranch.has(rec.branchCode)) byBranch.set(rec.branchCode, []);
          byBranch.get(rec.branchCode).push(rec);
        }

        const batchSize = 500;
        let overridesSent = 0;
        for (const [bch, branchRecords] of byBranch) {
          const totalBatches = Math.max(1, Math.ceil(branchRecords.length / batchSize));
          for (let b = 0; b < totalBatches; b++) {
            const batchSeq = b + 1;
            await postJson(`${syncConfig.apiBaseUrl}/api/sync/ada/prices/branch-overrides`, {
              snapshotId,
              branchCode: bch,
              batchSeq,
              isLastBatch: batchSeq === totalBatches,
              records: branchRecords.slice(b * batchSize, (b + 1) * batchSize),
            });
          }
          console.log(`  branch ${bch}: ${branchRecords.length} override records in ${totalBatches} batch(es)`);
          overridesSent += branchRecords.length;
        }
        console.log(`  branch_price_overrides: ${overridesSent} sent across ${byBranch.size} branch(es)`);
        totalSent += overridesSent;
      }

      // The coordinator gates finalize and the success run-log on all known v1
      // outcomes and a terminal APPLIED result.
      await completeSyncRun({
        v2Enabled: branchStockV2Enabled,
        approvedFailed,
        finalize: async () => {
          if (!branchStockV2Manifest) throw new Error("CP4 branch_stock handoff was not staged.");
          await finalizeRun({ baseUrl: syncConfig.apiBaseUrl, syncRunId, manifest: branchStockV2Manifest, postJson });
          console.log(formatCp4Result("QUEUED", {
            runId: syncRunId,
            batches: branchStockV2Manifest.batchCount,
            records: branchStockV2Manifest.recordCount,
          }));
          totalSent += branchStockV2Manifest.recordCount;
        },
        poll: async () => {
          await waitForApplied({
            baseUrl: syncConfig.apiBaseUrl,
            syncRunId,
            getJson,
            pollIntervalMs: syncConfig.syncV2.pollIntervalMs,
            waitTimeoutMs: syncConfig.syncV2.waitTimeoutMs,
          });
          console.log(formatCp4Result("APPLIED", { runId: syncRunId, records: branchStockV2Manifest.recordCount }));
        },
        writeSuccessRunLog: async () => postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
          id: runId,
          runId: syncRunId,
          syncType: `adapos_branch_${syncConfig.branchCode}`,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: "success",
          recordsRead: totalRead,
          recordsSent: totalSent,
          message: `datasets=${syncConfig.datasets.join(",")} posted for branch ${syncConfig.branchCode}.`,
        }),
      });

      console.log(`\nDone. ${totalSent} records sent to API.`);
    } catch (postErr) {
      if (branchStockV2Enabled) {
        const result = postErr.code === "CP4_WAIT_TIMEOUT" ? "WAIT_TIMEOUT" : "FAILED";
        console.error(formatCp4Result(result, { runId: syncRunId }));
      }
      const failedAt = new Date().toISOString();
      await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
        id: runId,
        runId: syncRunId,
        syncType: `adapos_branch_${syncConfig.branchCode}`,
        startedAt,
        finishedAt: failedAt,
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
