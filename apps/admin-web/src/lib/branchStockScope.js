export const BRANCH_STOCK_SCOPE_BRANCH_CODES = ["000", "001", "003", "004", "005"];

const SAMUT_SONGKHRAM_SCOPE = {
  id: "samut-songkhram",
  label: "สมุทรสงคราม",
  ariaLabel: "แสดงสต็อกสมุทรสงคราม สาขา 000 001 003 และ 004",
  branchCodes: ["000", "001", "003", "004"],
};

const ALL_BRANCHES_SCOPE = {
  id: "all",
  label: "ทุกสาขา",
  ariaLabel: "แสดงสต็อกทุกสาขา",
  branchCodes: BRANCH_STOCK_SCOPE_BRANCH_CODES,
};

const BRANCH_QTY_COLUMN_PATTERN = /^qtyBranch(\d{3})$/;

export function normalizeBranchStockScopeBranchCode(branchCode) {
  const normalized = String(branchCode || "").trim();
  return BRANCH_STOCK_SCOPE_BRANCH_CODES.includes(normalized) ? normalized : "";
}

export function getDefaultBranchStockScopeId(branchCode) {
  const normalized = normalizeBranchStockScopeBranchCode(branchCode);
  return normalized ? `branch-${normalized}` : "";
}

export function getBranchStockScopeOptions(branchCode) {
  const normalized = normalizeBranchStockScopeBranchCode(branchCode);
  if (!normalized) return [];
  return [
    {
      id: `branch-${normalized}`,
      label: `สาขา ${normalized}`,
      ariaLabel: `แสดงสต็อกเฉพาะสาขา ${normalized}`,
      branchCodes: [normalized],
    },
    SAMUT_SONGKHRAM_SCOPE,
    ALL_BRANCHES_SCOPE,
  ];
}

export function getBranchStockScope(scopeId, branchCode) {
  const options = getBranchStockScopeOptions(branchCode);
  return options.find((option) => option.id === scopeId) || options[0] || null;
}

export function isBranchQtyColumn(column) {
  return BRANCH_QTY_COLUMN_PATTERN.test(String(column?.key || ""));
}

export function getVisibleBranchStockColumns(columns, {
  isBranchStockScopeUser = false,
  scopeId = "",
  branchCode = "",
} = {}) {
  if (!isBranchStockScopeUser) return columns;

  const scope = getBranchStockScope(scopeId, branchCode);
  if (!scope) return columns;
  const visibleBranchCodes = new Set(scope.branchCodes);
  const isOwnBranchScope = scope.id === getDefaultBranchStockScopeId(branchCode);
  return columns.filter((column) => {
    if (isOwnBranchScope && column?.key === "qtyTotalAllBranches") return false;
    const match = String(column?.key || "").match(BRANCH_QTY_COLUMN_PATTERN);
    return !match || visibleBranchCodes.has(match[1]);
  });
}

export function getSafeBranchStockQty(row, branchCode) {
  if (branchCode === "004" && row?.stock004?.basis === "shopee-availability-unknown") return null;
  const value = Number(row?.[`qtyBranch${branchCode}`]);
  return Number.isFinite(value) ? value : 0;
}

export function calculateBranchStockScopeTotal(row, scopeId, branchCode) {
  const scope = getBranchStockScope(scopeId, branchCode);
  if (!scope) return 0;
  if (scope.branchCodes.some(code => getSafeBranchStockQty(row, code) === null)) return null;
  return scope.branchCodes.reduce(
    (total, branchCode) => total + getSafeBranchStockQty(row, branchCode),
    0,
  );
}

export function projectBranchStockRows(records, {
  isBranchStockScopeUser = false,
  scopeId = "",
  branchCode = "",
} = {}) {
  if (!isBranchStockScopeUser) return records;
  const scope = getBranchStockScope(scopeId, branchCode);
  if (!scope) return records;
  return records.map((row) => {
    const projectedRow = {
      ...row,
      qtyTotalAllBranches: calculateBranchStockScopeTotal(row, scopeId, branchCode),
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
      if (row.stock004?.basis === "shopee-availability-unknown"
        && ["qtyBranch004", "qtyTotalAllBranches"].includes(column.key)) return "ไม่ทราบ";
      const numericValue = Number(value);
      if(row.stock004?.basis==='hourly-and-shopee-known-only'&&Number.isFinite(numericValue)
        &&(column.key==='qtyBranch004'||column.key==='qtyTotalAllBranches'&&columns.some(c=>c.key==='qtyBranch004')))
        return `${numericValue} (ยังไม่รวมออเดอร์ค้างจับคู่)`;
      return Number.isFinite(numericValue) ? numericValue : 0;
    })),
  ];
}

export async function createBranchStockScopeWorkbook({
  records,
  columns,
  scopeId,
  branchCode,
  getColumnValue,
  dateStamp = new Date().toISOString().slice(0, 10),
}) {
  const xlsx = await import("xlsx");
  const scope = getBranchStockScope(scopeId, branchCode);
  if (!scope) {
    throw new Error("ไม่พบขอบเขตสต็อกสำหรับบัญชีนี้");
  }
  const matrix = buildBranchStockExportMatrix(records, columns, getColumnValue);
  const worksheet = xlsx.utils.aoa_to_sheet(matrix);
  worksheet["!cols"] = columns.map((column) => ({
    wch: column.type === "number" ? 14 : Math.min(48, Math.max(14, String(column.label || "").length + 6)),
  }));
  worksheet["!autofilter"] = { ref: `A1:${xlsx.utils.encode_col(Math.max(0, columns.length - 1))}1` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, scope.label.slice(0, 31));
  if (columns.some(column => column.key === "qtyBranch004") && records.some(row => row.stock004)) {
    const hasShopee = records.some(row => row.stock004?.shopee);
    const sources = [["รหัสสินค้า", "แหล่งยอด 004", "ยอด Full Sync 004", "อ่าน Hourly เมื่อ", "Full Sync เมื่อ", "เหตุที่ใช้ Full Sync",
      ...(hasShopee ? ["ยอด POS", "จอง Shopee", "ส่งแล้วไม่ลง POS", "บัญชีจองเมื่อ"] : [])],
      ...records.map(row => [row.productCode, row.stock004?.basis || "full-sync", row.fullSyncQtyBranch004 ?? row.qtyBranch004,
        row.stock004?.capturedAt || "", row.stock004?.fullSyncAt || "", row.stock004?.reason || "",
        ...(hasShopee ? [row.posQtyBranch004 ?? "", row.stock004?.shopee?.reservedQuantity ?? "",
          row.stock004?.shopee?.shippedUnpostedQuantity ?? "", row.stock004?.shopee?.asOf || ""] : [])])];
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(sources), "ที่มาสต็อก004");
  }
  const data = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
  return {
    blob: new Blob([data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `branch-stock-${scope.id}-${dateStamp}.xlsx`,
    matrix,
  };
}
