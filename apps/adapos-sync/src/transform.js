// Maps raw AdaAcc rows to the API payload shapes expected by the server.

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
      docDate:   h.FDPthDocDate,
      tnfDate:   h.FDPthTnfDate   || null,
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
      docDate:     l.FDPthDocDate   || null,
    })),
  };
}

// ── Pending purchase receipts ──────────────────────────────────────────────────
export function toPendingReceiptPayload(hdRows, dtRows) {
  return {
    headers: hdRows.map((h) => ({
      docNo:         h.FTXihDocNo,
      docType:       h.FTXihDocType       || null,
      docDate:       h.FDXihDocDate       || null,
      docTime:       h.FTXihDocTime       || null,
      branchCode:    h.FTBchCode,
      supplierCode:  h.FTSplCode          || null,
      supplierName:  h.FTXihCstName       || null,
      refExt:        h.FTXihRefExt        || null,
      refExtDate:    h.FDXihRefExtDate    || null,
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
      expiredDate:   d.FDXidExpired       || null,
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
        expiredDate:   d.FDXidExpired         || null,
        warehouseCode: d.FTWahCode            || null,
      }));
    return {
      branchCode:    h.FTBchCode             || null,
      docNo:         h.FTXihDocNo            || null,
      docType:       h.FTXihDocType          || null,
      docDate:       h.FDXihDocDate          || null,
      docTime:       h.FTXihDocTime          || null,
      supplierCode:  h.FTSplCode             || null,
      supplierName:  h.FTXihCstName          || null,
      refExt:        h.FTXihRefExt           || null,
      refExtDate:    h.FDXihRefExtDate       || null,
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

export function toBranchStockRecords(rows) {
  const snapshots = new Map();

  for (const row of rows) {
    const productCode = row.product_code;
    if (!productCode) continue;

    const branchCode = String(row.branch_code || "").padStart(3, "0");
    const qty = Number(row.qty ?? 0);
    const snapshot = snapshots.get(productCode) || {
      product_code: productCode,
      product_name_thai: row.product_name_thai || "",
      product_name_eng: row.product_name_eng || "",
      barcode: row.barcode || "",
      unit: row.unit || "",
      qty_branch_000: 0,
      qty_branch_001: 0,
      qty_branch_002: 0,
      qty_branch_003: 0,
      qty_branch_004: 0,
      qty_branch_005: 0,
      qty_total_all_branches: 0,
      synced_at: new Date().toISOString(),
    };

    if (branchCode === "000") snapshot.qty_branch_000 = qty;
    if (branchCode === "001") snapshot.qty_branch_001 = qty;
    if (branchCode === "002") snapshot.qty_branch_002 = qty;
    if (branchCode === "003") snapshot.qty_branch_003 = qty;
    if (branchCode === "004") snapshot.qty_branch_004 = qty;
    if (branchCode === "005") snapshot.qty_branch_005 = qty;

    snapshots.set(productCode, snapshot);
  }

  return [...snapshots.values()].map((snapshot) => ({
    ...snapshot,
    qty_total_all_branches:
      Number(snapshot.qty_branch_000 || 0) +
      Number(snapshot.qty_branch_001 || 0) +
      Number(snapshot.qty_branch_002 || 0) +
      Number(snapshot.qty_branch_003 || 0) +
      Number(snapshot.qty_branch_004 || 0) +
      Number(snapshot.qty_branch_005 || 0),
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
