export const BRANCH_STOCK_SCOPE_OPTIONS = [
  {
    id: "branch-000",
    label: "สาขา 000",
    ariaLabel: "แสดงสต็อกเฉพาะสาขา 000",
    branchCodes: ["000"],
  },
  {
    id: "samut-songkhram",
    label: "สมุทรสงคราม",
    ariaLabel: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004",
    branchCodes: ["000", "001", "003", "004"],
  },
  {
    id: "all",
    label: "ทุกสาขา",
    ariaLabel: "แสดงสต็อกทุกสาขา",
    branchCodes: ["000", "001", "003", "004", "005"],
  },
];

export const DEFAULT_ONLINE_MARKETING_STOCK_SCOPE = "branch-000";

const BRANCH_QTY_COLUMN_PATTERN = /^qtyBranch(\d{3})$/;

export function getBranchStockScope(scopeId) {
  return BRANCH_STOCK_SCOPE_OPTIONS.find((option) => option.id === scopeId)
    || BRANCH_STOCK_SCOPE_OPTIONS[0];
}

export function isBranchQtyColumn(column) {
  return BRANCH_QTY_COLUMN_PATTERN.test(String(column?.key || ""));
}

export function getVisibleBranchStockColumns(columns, {
  isOnlineMarketingStaff = false,
  scopeId = DEFAULT_ONLINE_MARKETING_STOCK_SCOPE,
} = {}) {
  if (!isOnlineMarketingStaff) return columns;

  const visibleBranchCodes = new Set(getBranchStockScope(scopeId).branchCodes);
  return columns.filter((column) => {
    const match = String(column?.key || "").match(BRANCH_QTY_COLUMN_PATTERN);
    return !match || visibleBranchCodes.has(match[1]);
  });
}

export function getSafeBranchStockQty(row, branchCode) {
  const value = Number(row?.[`qtyBranch${branchCode}`]);
  return Number.isFinite(value) ? value : 0;
}

export function calculateBranchStockScopeTotal(row, scopeId) {
  return getBranchStockScope(scopeId).branchCodes.reduce(
    (total, branchCode) => total + getSafeBranchStockQty(row, branchCode),
    0,
  );
}

export function projectBranchStockRows(records, {
  isOnlineMarketingStaff = false,
  scopeId = DEFAULT_ONLINE_MARKETING_STOCK_SCOPE,
} = {}) {
  if (!isOnlineMarketingStaff) return records;
  const scope = getBranchStockScope(scopeId);
  return records.map((row) => {
    const projectedRow = {
      ...row,
      qtyTotalAllBranches: calculateBranchStockScopeTotal(row, scopeId),
    };
    scope.branchCodes.forEach((branchCode) => {
      projectedRow[`qtyBranch${branchCode}`] = getSafeBranchStockQty(row, branchCode);
    });
    return projectedRow;
  });
}

export function buildBranchStockExportMatrix(records, columns, getColumnValue = (row, key) => row?.[key]) {
  return [
    columns.map((column) => column.label),
    ...records.map((row) => columns.map((column) => {
      const value = getColumnValue(row, column.key);
      if (column.type !== "number") return value ?? "";
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : 0;
    })),
  ];
}

export async function createBranchStockScopeWorkbook({
  records,
  columns,
  scopeId,
  getColumnValue,
  dateStamp = new Date().toISOString().slice(0, 10),
}) {
  const xlsx = await import("xlsx");
  const scope = getBranchStockScope(scopeId);
  const matrix = buildBranchStockExportMatrix(records, columns, getColumnValue);
  const worksheet = xlsx.utils.aoa_to_sheet(matrix);
  worksheet["!cols"] = columns.map((column) => ({
    wch: column.type === "number" ? 14 : Math.min(48, Math.max(14, String(column.label || "").length + 6)),
  }));
  worksheet["!autofilter"] = { ref: `A1:${xlsx.utils.encode_col(Math.max(0, columns.length - 1))}1` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, scope.label.slice(0, 31));
  const data = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    blob: new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `branch-stock-${scope.id}-${dateStamp}.xlsx`,
    matrix,
  };
}
