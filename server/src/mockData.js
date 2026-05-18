const now = new Date().toISOString();

export const branches = [
  { branchCode: "000", branchName: "สำนักงานใหญ่", isHq: true },
  { branchCode: "001", branchName: "สาขา 1", isHq: false },
  { branchCode: "002", branchName: "สาขา 2", isHq: false },
  { branchCode: "003", branchName: "สาขา 3", isHq: false },
];

export const products = [
  {
    productCode: "IC-000833",
    productName: "กาวิสคอน 250 มก 16 เม็ด",
    barcode: "5000158066991",
    supplier: "Reckitt",
    unit: "กล่อง",
    stockCurrent: 18,
    stockRetail: 12,
    stockWarehouse: 6,
    minStock: 10,
    maxStock: 50,
    leadTimeDays: 5,
    soldQtyPeriod: 24,
    purchasedQtyPeriod: 12,
  },
  {
    productCode: "630020166",
    productName: "คอน คอน 15 มล",
    barcode: "8852914200807",
    supplier: "Thai Pharma",
    unit: "ขวด",
    stockCurrent: 240,
    stockRetail: 160,
    stockWarehouse: 80,
    minStock: 48,
    maxStock: 180,
    leadTimeDays: 7,
    soldQtyPeriod: 12,
    purchasedQtyPeriod: 144,
  },
  {
    productCode: "IC-004648",
    productName: "แคลเทรต ซิลเวอร์ 50+ 120 เม็ด",
    barcode: "8851005400034",
    supplier: "Pfizer",
    unit: "ขวด",
    stockCurrent: 9,
    stockRetail: 9,
    stockWarehouse: 0,
    minStock: 12,
    maxStock: 36,
    leadTimeDays: 10,
    soldQtyPeriod: 30,
    purchasedQtyPeriod: 0,
  },
  {
    productCode: "IC-001446",
    productName: "แคลเทรท พลัส 120 เม็ด",
    barcode: "8851005163199",
    supplier: "Pfizer",
    unit: "ขวด",
    stockCurrent: 80,
    stockRetail: 60,
    stockWarehouse: 20,
    minStock: 10,
    maxStock: 60,
    leadTimeDays: 8,
    soldQtyPeriod: 0,
    purchasedQtyPeriod: 24,
  },
];

export const staffAccounts = [
  { id: "staff-001", fullName: "Boss Admin", email: "admin@example.local", role: "admin", branchCode: "000" },
  { id: "staff-002", fullName: "Branch Operator", email: "branch1@example.local", role: "branch_staff", branchCode: "001" },
];

export const syncRuns = [
  {
    id: "sync-001",
    syncType: "full-dry-run",
    startedAt: now,
    finishedAt: now,
    status: "success",
    recordsRead: 42,
    recordsSent: 42,
    message: "Mock sync completed.",
  },
];

export const syncErrors = [];

export const orderRequests = [
  {
    id: "req-001",
    branchCode: "001",
    branchName: "สาขา 1",
    requestedBy: "Branch Operator",
    requestedAt: now,
    status: "submitted",
    note: "Need refill before weekend.",
    items: [
      {
        id: "req-item-001",
        productCode: "IC-004648",
        productName: "แคลเทรต ซิลเวอร์ 50+ 120 เม็ด",
        requestedQty: 6,
        requestedUnit: "ขวด",
        lineNote: "Fast moving this week.",
      },
    ],
  },
];
