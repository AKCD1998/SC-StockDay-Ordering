// Maps raw AdaAcc rows to the API payload shapes expected by the server.

export function toProductRecords(rows) {
  return rows.map((r) => ({
    productCode:    r.FTPdtCode,
    productName:    r.FTPdtName,
    barcode1:       r.FTPdtBarCode1  || null,
    barcode2:       r.FTPdtBarCode2  || null,
    barcode3:       r.FTPdtBarCode3  || null,
    supplierCode:   r.FTSplCode      || null,
    unitSmall:      r.FTPdtSUnit     || null,
    factorSmall:    r.FCPdtSFactor   ?? 1,
    unitMedium:     r.FTPdtMUnit     || null,
    factorMedium:   r.FCPdtMFactor   ?? null,
    unitLarge:      r.FTPdtLUnit     || null,
    factorLarge:    r.FCPdtLFactor   ?? null,
    stockCurrent:   r.FCPdtQtyNow    ?? 0,
    stockRetail:    r.FCPdtQtyRet    ?? 0,
    stockWarehouse: r.FCPdtQtyWhs    ?? 0,
    minStock:       r.FCPdtMin       ?? 0,
    maxStock:       r.FCPdtMax       ?? 0,
    leadTimeDays:   r.FCPdtLeadTime  ?? 0,
  }));
}

export function toSalesRecords(rows, branchCode, periodDays) {
  return rows.map((r) => ({
    productCode:   r.FTPdtCode,
    branchCode,
    periodDays,
    soldQtyBase:   Number(r.sold_qty_base ?? 0),
    avgDailyUsage: Number(r.sold_qty_base ?? 0) / periodDays,
  }));
}
