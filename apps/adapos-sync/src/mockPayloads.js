export function getMockProductsPayload() {
  return {
    records: [
      {
        productCode: "IC-000833",
        productName: "กาวิสคอน 250 มก 16 เม็ด",
        barcode1: "5000158066991",
        stockCurrent: 18,
        stockRetail: 12,
        stockWarehouse: 6,
        minStock: 10,
        maxStock: 50,
        leadTimeDays: 5,
        supplierCode: "SUP-001",
      },
    ],
  };
}

export function getMockSalesPayload(periodDays) {
  return {
    records: [
      {
        productCode: "IC-000833",
        periodDays,
        soldQtyBase: 24,
        avgDailyUsage: 24 / periodDays,
      },
    ],
  };
}

export function getMockPurchasePayload(periodDays) {
  return {
    records: [
      {
        productCode: "IC-000833",
        periodDays,
        purchasedQtyBase: 12,
      },
    ],
  };
}

export function getMockTransferPayload() {
  return {
    headers: [
      {
        docNo: "TB00026-000986",
        docType: "4",
        docDate: "2026-05-19",
        tnfDate: "2026-05-19",
        branchFrm: "000",
        branchTo: "001",
        whFrm: "WA0001",
        whTo: "WA0002",
        type: "transfer",
        total: 1250,
        vat: 87.5,
        grand: 1337.5,
        deptCode: "D001",
        usrCode: "dao1",
      },
    ],
    lines: [
      {
        docNo: "TB00026-000986",
        seqNo: 1,
        productCode: "IC-000833",
        unitCode: "BOX",
        unitName: "กล่อง",
        factor: 1,
        qty: 12,
        qtyBase: 12,
        cost: 100,
        costIn: 100,
        net: 1200,
        vat: 84,
        branchFrm: "000",
        branchTo: "001",
        whFrm: "WA0001",
        whTo: "WA0002",
        docDate: "2026-05-19",
      },
    ],
  };
}
