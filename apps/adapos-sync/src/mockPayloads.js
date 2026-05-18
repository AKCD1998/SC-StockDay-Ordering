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
