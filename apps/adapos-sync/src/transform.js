// Maps raw AdaAcc rows to the API payload shapes expected by the server.

/**
 * Format a SQL Server DATE value (JS Date object from mssql) as a plain
 * 'YYYY-MM-DD' string in Bangkok timezone, so that it is stored in the
 * PostgreSQL DATE column with the correct calendar date regardless of the
 * UTC offset of the mother PC or the Render server.
 */
function toBangkokDateString(value) {
  if (value == null) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

export function toProductRecords(rows) {
  return rows.map((r) => ({
    productCode:    r.FTPdtCode,
    productName:    r.FTPdtName,
    productNameEng: r.FTPdtNameOth || null,
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
    // LEGACY / APPROXIMATE: these come from the global product master (TCNMPdt)
    // on whichever machine ran the sync. They are NOT valid as branch-level
    // stock truth — use branch_stock_snapshots (/api/branch-stock) for that.
    stockCurrent:   r.FCPdtQtyNow    ?? 0,
    stockRetail:    r.FCPdtQtyRet    ?? 0,
    stockWarehouse: r.FCPdtQtyWhs    ?? 0,
    minStock:       r.FCPdtMin       ?? 0,
    maxStock:       r.FCPdtMax       ?? 0,
    leadTimeDays:   r.FCPdtLeadTime  ?? 0,
  }));
}

export function toTransferPayload(headerRows, lineRows) {
  return {
    headers: headerRows.map((h) => ({
      docNo:     h.FTPthDocNo,
      docType:   h.FTPthDocType   || null,
      docDate:   toBangkokDateString(h.FDPthDocDate),
      tnfDate:   toBangkokDateString(h.FDPthTnfDate),
      branchFrm: h.FTPthBchFrm,
      branchTo:  h.FTPthBchTo,
      whFrm:     h.FTPthWhFrm     || null,
      whTo:      h.FTPthWhTo      || null,
      type:      h.FTPthType      || null,
      total:     Number(h.FCPthTotal  || 0),
      vat:       Number(h.FCPthVat    || 0),
      grand:     Number(h.FCPthGrand  || 0),
      deptCode:  h.FTDptCode      || null,
      usrCode:   h.FTUsrCode      || null,
    })),
    lines: lineRows.map((l) => ({
      docNo:       l.FTPthDocNo,
      seqNo:       Number(l.FNPtdSeqNo),
      productCode: l.FTPdtCode      || null,
      unitCode:    l.FTPunCode      || null,
      unitName:    l.FTPtdUnitName  || null,
      factor:      Number(l.FCPtdFactor  ?? 1),
      qty:         Number(l.FCPtdQty     || 0),
      qtyBase:     Number(l.FCPtdQtyAll  || 0),
      cost:        Number(l.FCPtdCost    || 0),
      costIn:      Number(l.FCPtdCostIn  || 0),
      net:         Number(l.FCPtdNet     || 0),
      vat:         Number(l.FCPtdVat     || 0),
      branchFrm:   l.FTPthBchFrm    || null,
      branchTo:    l.FTPthBchTo     || null,
      whFrm:       l.FTPthWhFrm     || null,
      whTo:        l.FTPthWhTo      || null,
      docDate:     toBangkokDateString(l.FDPthDocDate),
    })),
  };
}

// ── Pending purchase receipts ──────────────────────────────────────────────────
export function toPendingReceiptPayload(hdRows, dtRows) {
  return {
    headers: hdRows.map((h) => ({
      docNo:         h.FTXihDocNo,
      docType:       h.FTXihDocType       || null,
      docDate:       toBangkokDateString(h.FDXihDocDate),
      docTime:       h.FTXihDocTime       || null,
      branchCode:    h.FTBchCode,
      supplierCode:  h.FTSplCode          || null,
      supplierName:  h.FTXihCstName       || null,
      refExt:        h.FTXihRefExt        || null,
      refExtDate:    toBangkokDateString(h.FDXihRefExtDate),
      warehouseCode: h.FTWahCode          || null,
      total:         Number(h.FCXihTotal  || 0),
      vat:           Number(h.FCXihVat    || 0),
      grand:         Number(h.FCXihGrand  || 0),
      usrCode:       h.FTUsrCode          || null,
      createdBy:     h.FTWhoIns           || null,
      createdAtAda:  h.FDDateIns          || null,
      staDoc:        h.FTXihStaDoc        || null,
    })),
    lines: dtRows.map((d) => ({
      docNo:         d.FTXihDocNo,
      seqNo:         Number(d.FNXidSeqNo),
      productCode:   d.FTPdtCode          || null,
      productName:   d.FTPdtName          || null,
      barcode:       d.FTXidBarCode       || null,
      unitCode:      d.FTPunCode          || null,
      unitName:      d.FTXidUnitName      || null,
      factor:        Number(d.FCXidFactor    ?? 1),
      qty:           Number(d.FCXidQty       || 0),
      qtyBase:       Number(d.FCXidQtyAll    || 0),
      stockFactor:   Number(d.FCXidStkFac    ?? 1),
      setPrice:      Number(d.FCXidSetPrice  || 0),
      net:           Number(d.FCXidNet       || 0),
      vat:           Number(d.FCXidVat       || 0),
      costIn:        Number(d.FCXidCostIn    || 0),
      lotNo:         d.FTXidLotNo         || null,
      expiredDate:   toBangkokDateString(d.FDXidExpired),
      warehouseCode: d.FTWahCode          || null,
    })),
  };
}

// ── Approved purchase receipts (today) ────────────────────────────────────────
export function toApprovedReceiptPayload(hdRows, dtRows) {
  return hdRows.map((h) => {
    const lines = dtRows
      .filter((d) => d.FTXihDocNo === h.FTXihDocNo)
      .map((d) => ({
        seqNo:         Number(d.FNXidSeqNo    ?? 0),
        productCode:   d.FTPdtCode            || null,
        productName:   d.FTPdtName            || null,
        barcode:       d.FTXidBarCode         || null,
        unitCode:      d.FTPunCode            || null,
        unitName:      d.FTXidUnitName        || null,
        factor:        Number(d.FCXidFactor   ?? 1),
        qty:           Number(d.FCXidQty      || 0),
        qtyBase:       Number(d.FCXidQtyAll   || 0),
        stockFactor:   Number(d.FCXidStkFac   ?? 1),
        setPrice:      Number(d.FCXidSetPrice || 0),
        net:           Number(d.FCXidNet      || 0),
        vat:           Number(d.FCXidVat      || 0),
        costIn:        Number(d.FCXidCostIn   || 0),
        lotNo:         d.FTXidLotNo           || null,
        expiredDate:   toBangkokDateString(d.FDXidExpired),
        warehouseCode: d.FTWahCode            || null,
      }));
    return {
      branchCode:    h.FTBchCode             || null,
      docNo:         h.FTXihDocNo            || null,
      docType:       h.FTXihDocType          || null,
      docDate:       toBangkokDateString(h.FDXihDocDate),
      docTime:       h.FTXihDocTime          || null,
      supplierCode:  h.FTSplCode             || null,
      supplierName:  h.FTXihCstName          || null,
      refExt:        h.FTXihRefExt           || null,
      refExtDate:    toBangkokDateString(h.FDXihRefExtDate),
      warehouseCode: h.FTWahCode             || null,
      total:         Number(h.FCXihTotal     || 0),
      vat:           Number(h.FCXihVat       || 0),
      grand:         Number(h.FCXihGrand     || 0),
      usrCode:       h.FTUsrCode             || null,
      createdBy:     h.FTWhoIns              || null,
      createdAtAda:  h.FDDateIns             || null,
      staDoc:        h.FTXihStaDoc           || null,
      staPrcDoc:     h.FTXihStaPrcDoc        || null,
      lines,
    };
  });
}

// Fixed whitelist of branch codes allowed to sync per-branch stock. Mirrors the
// server's BRANCH_STOCK_COLUMNS whitelist. Unknown codes are rejected so a
// misconfigured agent can never be routed to an arbitrary branch's column.
export const BRANCH_STOCK_SYNC_BRANCHES = new Set(["000", "001", "002", "003", "004", "005"]);

// Build branch-stock sync records for a SINGLE branch. Each record carries only
// that branch's qty/cost — never fake zeroes for the other branches — so the
// server can update just this branch's column and a sync from one branch can
// never overwrite another branch's stored quantity. The owning branch is sent
// explicitly at the top level of the request (see index.js), not embedded as a
// wide per-branch row.
export function toBranchStockRecords(rows, branchCode) {
  const normalizedBranch = String(branchCode || "").padStart(3, "0");
  if (!BRANCH_STOCK_SYNC_BRANCHES.has(normalizedBranch)) {
    throw new Error(`Refusing to build branch-stock records for unknown branch code: ${branchCode}`);
  }

  const syncedAt = new Date().toISOString();
  const snapshots = new Map();

  for (const row of rows) {
    const productCode = row.product_code;
    if (!productCode) continue;

    // getBranchStockRows returns one row per active product; last write wins.
    snapshots.set(productCode, {
      productCode,
      branchCode: normalizedBranch,
      productNameThai: row.product_name_thai || "",
      productNameEng: row.product_name_eng || "",
      barcode: row.barcode || "",
      unit: row.unit || "",
      qty: Number(row.qty ?? 0),
      costAvg: Number(row.cost_avg ?? 0),
      syncedAt,
    });
  }

  return [...snapshots.values()];
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
