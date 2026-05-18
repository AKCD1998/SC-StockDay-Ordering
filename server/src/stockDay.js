import { round2, safeDivide } from "./utils.js";

export function computeStatus(product, periodDays) {
  const avgDailyUsage = safeDivide(product.soldQtyPeriod, periodDays);
  if (!product.soldQtyPeriod || avgDailyUsage === 0) {
    return "No sales";
  }

  const pendingRequestedQty = Number(product.pendingRequestedQty || 0);
  const projectedStockAfterRequests = product.currentStock - pendingRequestedQty;
  const effectiveStockDay = safeDivide(projectedStockAfterRequests, avgDailyUsage);

  if (
    projectedStockAfterRequests <= product.minStock ||
    effectiveStockDay <= Math.max(product.leadTimeDays, 7)
  ) {
    return "Reorder soon";
  }

  const stockDay = safeDivide(product.currentStock, avgDailyUsage);
  if (projectedStockAfterRequests >= product.maxStock || stockDay > 45) {
    return "Overstock / slow moving";
  }

  return "Normal";
}

export function buildStockDayRow(product, periodDays) {
  const avgDailyUsage = safeDivide(product.soldQtyPeriod, periodDays);
  const stockDay = avgDailyUsage > 0 ? safeDivide(product.currentStock, avgDailyUsage) : null;
  const pendingRequestedQty = Number(product.pendingRequestedQty || 0);
  const pendingRequestLines = Number(product.pendingRequestLines || 0);
  const pendingRequestBranches = Number(product.pendingRequestBranches || 0);
  const projectedStockAfterRequests = product.currentStock - pendingRequestedQty;
  const projectedStockDay =
    avgDailyUsage > 0 ? safeDivide(projectedStockAfterRequests, avgDailyUsage) : null;
  const requestedVsSoldRatio = product.soldQtyPeriod > 0
    ? safeDivide(pendingRequestedQty, product.soldQtyPeriod)
    : 0;
  const startingStock = product.currentStock - product.purchasedQtyPeriod + product.soldQtyPeriod;
  const endingStock = startingStock + product.purchasedQtyPeriod - product.soldQtyPeriod;
  const averageInventory = (startingStock + endingStock) / 2;
  const turnoverRate = averageInventory > 0 ? safeDivide(product.soldQtyPeriod, averageInventory) : 0;

  return {
    productCode: product.productCode,
    productName: product.productName,
    barcode: product.barcode,
    unit: product.unit,
    currentStock: round2(product.currentStock),
    soldQtyPeriod: round2(product.soldQtyPeriod),
    averageDailyUsage: round2(avgDailyUsage),
    stockDay: stockDay === null ? null : round2(stockDay),
    pendingRequestedQty: round2(pendingRequestedQty),
    pendingRequestLines,
    pendingRequestBranches,
    projectedStockAfterRequests: round2(projectedStockAfterRequests),
    projectedStockDay: projectedStockDay === null ? null : round2(projectedStockDay),
    requestedVsSoldRatio: round2(requestedVsSoldRatio),
    purchasedQtyPeriod: round2(product.purchasedQtyPeriod),
    minStock: round2(product.minStock),
    maxStock: round2(product.maxStock),
    leadTimeDays: round2(product.leadTimeDays),
    supplier: product.supplier,
    endingStock: round2(endingStock),
    averageInventory: round2(averageInventory),
    turnoverRate: round2(turnoverRate),
    status: computeStatus(product, periodDays),
  };
}
