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

export function toSalesRecords(rows, branchCode, periodDays) {
  return rows.map((r) => ({
    productCode:   r.FTPdtCode,
    branchCode,
    periodDays,
    soldQtyBase:   Number(r.sold_qty_base ?? 0),
    avgDailyUsage: Number(r.sold_qty_base ?? 0) / periodDays,
  }));
}
