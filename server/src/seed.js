import { createRepository } from "./repositories/index.js";
import { config } from "./config.js";
import { makeId } from "./utils.js";

async function seedPostgres(repository) {
  await repository.pool.query(`
    TRUNCATE TABLE
      sync_errors,
      sync_runs,
      ada_transfer_lines,
      ada_transfer_headers,
      branch_order_request_items,
      branch_order_requests,
      product_purchase_summary,
      product_sales_summary,
      product_stock_snapshots,
      products
    RESTART IDENTITY CASCADE
  `);

  await repository.ingestProducts({
    records: [
      {
        productCode: "IC-000833",
        productName: "กาวิสคอน 250 มก 16 เม็ด",
        barcode1: "5000158066991",
        supplierCode: "SUP-001",
        supplierName: "Reckitt",
        unitSmall: "กล่อง",
        factorSmall: 1,
        stockCurrent: 18,
        stockRetail: 12,
        stockWarehouse: 6,
        minStock: 10,
        maxStock: 50,
        leadTimeDays: 5,
      },
      {
        productCode: "630020166",
        productName: "คอน คอน 15 มล",
        barcode1: "8852914200807",
        supplierCode: "SUP-002",
        supplierName: "Thai Pharma",
        unitSmall: "ขวด",
        factorSmall: 1,
        stockCurrent: 240,
        stockRetail: 160,
        stockWarehouse: 80,
        minStock: 48,
        maxStock: 180,
        leadTimeDays: 7,
      },
      {
        productCode: "IC-004648",
        productName: "แคลเทรต ซิลเวอร์ 50+ 120 เม็ด",
        barcode1: "8851005400034",
        supplierCode: "SUP-003",
        supplierName: "Pfizer",
        unitSmall: "ขวด",
        factorSmall: 1,
        stockCurrent: 9,
        stockRetail: 9,
        stockWarehouse: 0,
        minStock: 12,
        maxStock: 36,
        leadTimeDays: 10,
      },
      {
        productCode: "IC-001446",
        productName: "แคลเทรท พลัส 120 เม็ด",
        barcode1: "8851005163199",
        supplierCode: "SUP-003",
        supplierName: "Pfizer",
        unitSmall: "ขวด",
        factorSmall: 1,
        stockCurrent: 80,
        stockRetail: 60,
        stockWarehouse: 20,
        minStock: 10,
        maxStock: 60,
        leadTimeDays: 8,
      },
    ],
  });

  await repository.ingestSalesSummary({
    records: [
      { productCode: "IC-000833", periodDays: 30, soldQtyBase: 24, avgDailyUsage: 0.8 },
      { productCode: "630020166", periodDays: 30, soldQtyBase: 12, avgDailyUsage: 0.4 },
      { productCode: "IC-004648", periodDays: 30, soldQtyBase: 30, avgDailyUsage: 1.0 },
      { productCode: "IC-001446", periodDays: 30, soldQtyBase: 0, avgDailyUsage: 0.0 },
    ],
  });

  await repository.ingestPurchaseSummary({
    records: [
      { productCode: "IC-000833", periodDays: 30, purchasedQtyBase: 12 },
      { productCode: "630020166", periodDays: 30, purchasedQtyBase: 144 },
      { productCode: "IC-004648", periodDays: 30, purchasedQtyBase: 0 },
      { productCode: "IC-001446", periodDays: 30, purchasedQtyBase: 24 },
    ],
  });

  const branches = await repository.getBranches();
  if (!branches.length) {
    throw new Error("Seed requires branches to exist. Run db:migrate first and insert branches.");
  }

  await repository.createOrderRequest({
    branchCode: "001",
    requestedBy: "Branch Operator",
    note: "Need refill before weekend.",
    items: [
      {
        productCode: "IC-004648",
        requestedQty: 6,
        requestedUnit: "ขวด",
        lineNote: "Fast moving this week.",
      },
    ],
  });

  await repository.ingestRunLog({
    id: makeId("sync"),
    syncType: "seed",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    status: "success",
    recordsRead: 12,
    recordsSent: 12,
    message: "Postgres seed completed.",
  });
}

async function ensureCoreRows(repository) {
  if (config.dataMode !== "postgres") {
    console.log("Mock mode seed preview only.");
    console.log(await repository.getBranches());
    console.log(await repository.getStockDay(30));
    return;
  }

  const pgRepo = repository;
  const pool = pgRepo.pool;

  await pool.query(`
    INSERT INTO branches (branch_code, branch_name, is_hq)
    VALUES
      ('000', 'สำนักงานใหญ่', TRUE),
      ('001', 'สาขา 1', FALSE),
      ('002', 'สาขา 2', FALSE),
      ('003', 'สาขา 3', FALSE)
    ON CONFLICT (branch_code) DO UPDATE SET
      branch_name = EXCLUDED.branch_name,
      is_hq = EXCLUDED.is_hq
  `);

  await pool.query(`
    INSERT INTO staff_accounts (id, email, full_name, role, branch_code)
    VALUES
      ('staff_admin', 'admin@example.local', 'Boss Admin', 'admin', '000'),
      ('staff_branch_001', 'branch1@example.local', 'Branch Operator', 'branch_staff', '001')
    ON CONFLICT (email) DO NOTHING
  `);

  await seedPostgres(repository);
}

const repository = await createRepository();

ensureCoreRows(repository)
  .then(async () => {
    console.log(`Seed completed using DATA_MODE=${config.dataMode}.`);
    await repository.close();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error.message);
    await repository.close();
    process.exit(1);
  });
