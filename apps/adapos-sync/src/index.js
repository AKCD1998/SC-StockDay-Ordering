import { postJson } from "./client.js";
import { syncConfig } from "./config.js";
import { getMockProductsPayload, getMockPurchasePayload, getMockSalesPayload } from "./mockPayloads.js";
import { getProductMasterSql, getPurchaseSummarySql, getSalesSummarySql } from "./queries.js";

const periodDays = 30;

async function fetchFromAdaPosDryOrPlaceholder() {
  console.log("adaPOS sync configuration");
  console.log({
    host: syncConfig.sqlServerHost,
    port: syncConfig.sqlServerPort,
    database: syncConfig.sqlServerDatabase,
    dryRun: syncConfig.dryRun,
    intervalMinutes: syncConfig.intervalMinutes,
  });

  console.log("\nProduct SQL preview:\n", getProductMasterSql());
  console.log("\nSales SQL preview:\n", getSalesSummarySql(periodDays, syncConfig.dateCutoff));
  console.log("\nPurchase SQL preview:\n", getPurchaseSummarySql(periodDays));

  // Real implementation note:
  // Add a SQL Server client here on the mother PC later, using read-only credentials.
  // Example flow:
  // 1. connect to AdaAcc
  // 2. run the SQL above
  // 3. map result rows to payload format
  // 4. POST the payloads to our app API
  // Never write to adaPOS.

  return {
    productsPayload: getMockProductsPayload(),
    salesPayload: getMockSalesPayload(periodDays),
    purchasePayload: getMockPurchasePayload(periodDays),
  };
}

async function runOnce() {
  const startedAt = new Date().toISOString();
  try {
    const { productsPayload, salesPayload, purchasePayload } = await fetchFromAdaPosDryOrPlaceholder();

    if (syncConfig.dryRun) {
      console.log("\nDry run payload preview");
      console.log(JSON.stringify({ productsPayload, salesPayload, purchasePayload }, null, 2));
      return;
    }

    const [productsResult, salesResult, purchaseResult] = await Promise.all([
      postJson(`${syncConfig.apiBaseUrl}/api/sync/products`, productsPayload),
      postJson(`${syncConfig.apiBaseUrl}/api/sync/sales-summary`, salesPayload),
      postJson(`${syncConfig.apiBaseUrl}/api/sync/purchase-summary`, purchasePayload),
    ]);

    await postJson(`${syncConfig.apiBaseUrl}/api/sync/run-log`, {
      syncType: "scheduled-sync",
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "success",
      recordsRead:
        (productsPayload.records?.length || 0) +
        (salesPayload.records?.length || 0) +
        (purchasePayload.records?.length || 0),
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
  }
}

runOnce();

if (!syncConfig.dryRun) {
  const intervalMs = syncConfig.intervalMinutes * 60 * 1000;
  setInterval(runOnce, intervalMs);
}
