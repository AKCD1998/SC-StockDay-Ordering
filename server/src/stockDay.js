import { round2, safeDivide } from "./utils.js";

export function computeStatus(product, periodDays) {
  const avgDailyUsage = safeDivide(product.soldQtyPeriod, periodDays);
  if (!product.soldQtyPeriod || avgDailyUsage === 0) {
    return "No sales";
  }

  const stockDay = safeDivide(product.currentStock, avgDailyUsage);
  if (product.currentStock <= product.minStock || stockDay <= Math.max(product.leadTimeDays, 7)) {
    return "Reorder soon";
  }

  if (product.currentStock >= product.maxStock || stockDay > 45) {
    return "Overstock / slow moving";
  }

  return "Normal";
}

export function buildStockDayRow(product, periodDays) {
  const avgDailyUsage = safeDivide(product.soldQtyPeriod, periodDays);
  const stockDay = avgDailyUsage > 0 ? safeDivide(product.currentStock, avgDailyUsage) : null;
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
