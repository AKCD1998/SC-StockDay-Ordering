import { postJson } from "./client.js";
import { syncConfig } from "./config.js";

const BATCH_SIZE = 500;

async function postInBatches(url, records) {
  let accepted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = await postJson(url, { records: batch });
    accepted += result.accepted || 0;
  }
  return { accepted };
}
import { getPool, closePool } from "./db.js";
import { getProductMasterSql, getPurchaseSummarySql, getSalesSummarySql } from "./queries.js";

const periodDays = 30;

async function fetchFromAdaPos() {
  const pool = await getPool();

  const [productsResult, salesResult, purchaseResult] = await Promise.all([
    pool.request().query(getProductMasterSql()),
    pool.request().query(getSalesSummarySql(periodDays, syncConfig.dateCutoff)),
    pool.request().query(getPurchaseSummarySql(periodDays)),
  ]);

  const productsPayload = {
    records: productsResult.recordset.map((r) => ({
      productCode: r.FTPdtCode,
      productName: r.FTPdtName,
      barcode1: r.FTPdtBarCode1,
      barcode2: r.FTPdtBarCode2,
      barcode3: r.FTPdtBarCode3,
      stockCurrent: r.FCPdtQtyNow,
      stockRetail: r.FCPdtQtyRet,
      stockWarehouse: r.FCPdtQtyWhs,
      minStock: r.FCPdtMin,
      maxStock: r.FCPdtMax,
      leadTimeDays: r.FCPdtLeadTime,
      supplierCode: r.FTSplCode,
      unitSmall: r.FTPdtSUnit,
      factorSmall: r.FCPdtSFactor,
      unitMedium: r.FTPdtMUnit,
      factorMedium: r.FCPdtMFactor,
      unitLarge: r.FTPdtLUnit,
      factorLarge: r.FCPdtLFactor,
    })),
  };

  const salesMap = new Map(
    salesResult.recordset.map((r) => [r.FTPdtCode, r.sold_qty_base])
  );

  const salesPayload = {
    records: salesResult.recordset.map((r) => ({
      productCode: r.FTPdtCode,
      periodDays,
      soldQtyBase: r.sold_qty_base,
      avgDailyUsage: r.sold_qty_base / periodDays,
    })),
  };

  const purchasePayload = {
    records: purchaseResult.recordset.map((r) => ({
      productCode: r.FTPdtCode,
      periodDays,
      purchasedQtyBase: r.purchased_qty_base,
    })),
  };

  return { productsPayload, salesPayload, purchasePayload };
}

async function runOnce() {
  const startedAt = new Date().toISOString();
  try {
    console.log("Connecting to AdaPOS SQL Server...");
    const { productsPayload, salesPayload, purchasePayload } = await fetchFromAdaPos();

    console.log(`Products: ${productsPayload.records.length} records`);
    console.log(`Sales:    ${salesPayload.records.length} records`);
    console.log(`Purchases:${purchasePayload.records.length} records`);

    if (syncConfig.dryRun) {
      console.log("\nDry run — not posting. Sample product:");
      console.log(JSON.stringify(productsPayload.records[0] ?? null, null, 2));
      return;
    }

    console.log(`\nPosting to ${syncConfig.apiBaseUrl}...`);
    const productsResult = await postInBatches(`${syncConfig.apiBaseUrl}/api/sync/products`, productsPayload.records);
    console.log(`Products accepted: ${productsResult.accepted}`);
    const salesResult = await postInBatches(`${syncConfig.apiBaseUrl}/api/sync/sales-summary`, salesPayload.records);
    console.log(`Sales accepted: ${salesResult.accepted}`);
    const purchaseResult = await postInBatches(`${syncConfig.apiBaseUrl}/api/sync/purchase-summary`, purchasePayload.records);
    console.log(`Purchases accepted: ${purchaseResult.accepted}`);

    await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
      syncType: "scheduled-sync",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead:
        productsPayload.records.length +
        salesPayload.records.length +
        purchasePayload.records.length,
      recordsSent:
        (productsResult.accepted || 0) +
        (salesResult.accepted || 0) +
        (purchaseResult.accepted || 0),
      message: "Sync completed.",
    });

    console.log("Sync completed successfully.");
  } catch (error) {
    console.error("Sync failed:", error.message);
    try {
      await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
        syncType: "scheduled-sync",
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "failed",
        recordsRead: 0,
        recordsSent: 0,
        message: error.message,
      });
    } catch (logError) {
      console.error("Could not post run log:", logError.message);
    }
  } finally {
    await closePool();
  }
}

runOnce();

if (!syncConfig.dryRun) {
  const intervalMs = syncConfig.intervalMinutes * 60 * 1000;
  setInterval(runOnce, intervalMs);
}
