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
  if (branchCode === "004" && (row?.stock004?.basis === "shopee-availability-unknown"
    || row?.stock004?.viewStatus === "reference" || row?.stock004?.viewStatus === "unverified" && row?.stock004?.basis !== "hourly-and-shopee-known-only")) return null;
  if (branchCode === "004" && row?.stock004?.basis === "hourly-and-shopee-known-only"
    && !Number.isFinite(row.qtyBranch004)) return null;
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
  const hasQualified004 = columns.some(column => column.key === "qtyBranch004") && records.some(row =>
    ["hourly-and-shopee-known-only", "shopee-availability-unknown"].includes(row.stock004?.basis)
    || ["reference", "unverified"].includes(row.stock004?.viewStatus));
  const status004 = row => {
    if (row.stock004?.viewStatus === "reference") return "ยอดอ้างอิงเดิม · ยอดพร้อมใช้ปัจจุบันไม่ทราบ";
    if (row.stock004?.basis === "hourly-and-shopee-known-only") return Number.isFinite(row.qtyBranch004)
      ? "ยอดชั่วคราว · POS และยอดจองที่ทราบ · ยังไม่ยืนยันยอดพร้อมขาย" : "ยังยืนยันยอดพร้อมใช้ไม่ได้";
    if (row.stock004?.viewStatus === "unverified" || row.stock004?.basis === "shopee-availability-unknown") return "ยังยืนยันยอดพร้อมใช้ไม่ได้";
    return row.stock004?.basis === "hourly-and-shopee" ? "ยอดพร้อมใช้ที่ตรวจยืนยันแล้ว" : "ยอด POS ก่อนหัก Shopee";
  };
  return [
    [...columns.map((column) => column.label), ...(hasQualified004 ? ["สถานะยอด 004"] : [])],
    ...records.map((row) => [...columns.map((column) => {
      const value = getColumnValue(row, column.key);
      if (column.type !== "number") return value ?? "";
      if ((row.stock004?.basis === "shopee-availability-unknown" || row.stock004?.viewStatus === "reference"
        || row.stock004?.viewStatus === "unverified" && row.stock004?.basis !== "hourly-and-shopee-known-only")
        && ["qtyBranch004", "qtyTotalAllBranches"].includes(column.key)) return "ไม่ทราบ";
      if (row.stock004?.basis === "hourly-and-shopee-known-only" && ["qtyBranch004", "qtyTotalAllBranches"].includes(column.key)
        && (value == null || value === "")) return "ไม่ทราบ";
      const numericValue = Number(value);
      if(row.stock004?.basis==='hourly-and-shopee-known-only'&&Number.isFinite(numericValue)
        &&(column.key==='qtyBranch004'||column.key==='qtyTotalAllBranches'&&columns.some(c=>c.key==='qtyBranch004')))
        return `${numericValue} (ยังไม่รวมออเดอร์ค้างจับคู่)`;
      return Number.isFinite(numericValue) ? numericValue : 0;
    }), ...(hasQualified004 ? [status004(row)] : [])]),
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
  if (matrix[0].length > columns.length) worksheet["!cols"].push({ wch: 62 });
  worksheet["!autofilter"] = { ref: `A1:${xlsx.utils.encode_col(Math.max(0, matrix[0].length - 1))}1` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, scope.label.slice(0, 31));
  if (columns.some(column => column.key === "qtyBranch004") && records.some(row => row.stock004)) {
    const hasShopee = records.some(row => row.stock004?.shopee);
    const hasReference = records.some(row => row.stock004?.lastConfirmed);
    const sources = [["รหัสสินค้า", "แหล่งยอด 004", "ยอด Full Sync 004", "อ่าน Hourly เมื่อ", "Full Sync เมื่อ", "เหตุที่ใช้ Full Sync",
      ...(hasShopee ? ["ยอด POS", "จอง Shopee", "ส่งแล้วไม่ลง POS", "บัญชีจองเมื่อ"] : []),
      ...(hasReference ? ["สถานะยอดปัจจุบัน", "ยอดอ้างอิงเดิม ไม่ใช่ยอดพร้อมใช้", "เวลาอ้างอิง", "อ่านอ้างอิงสำเร็จเมื่อ"] : [])],
      ...records.map(row => [row.productCode, row.stock004?.basis || "full-sync", row.fullSyncQtyBranch004 ?? row.qtyBranch004,
        row.stock004?.capturedAt || "", row.stock004?.fullSyncAt || "", row.stock004?.reason || "",
        ...(hasShopee ? [row.posQtyBranch004 ?? "", row.stock004?.shopee?.reservedQuantity ?? "",
          row.stock004?.shopee?.shippedUnpostedQuantity ?? "", row.stock004?.shopee?.asOf || ""] : []),
        ...(hasReference ? [row.stock004?.viewStatus || "", row.stock004?.lastConfirmed?.quantity ?? "", row.stock004?.lastConfirmed?.observedAt || "", row.stock004?.lastConfirmed?.fetchedAt || ""] : [])])];
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
