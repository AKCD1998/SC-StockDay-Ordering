const PRIORITY_GROUPS = Object.freeze({
  PURCHASE: { rank: 0, key: "purchase", rowClass: "priority-purchase" },
  TRANSFER_AND_PURCHASE: { rank: 0, key: "purchase", rowClass: "priority-purchase" },
  TRANSFER_IN: { rank: 1, key: "transfer", rowClass: "priority-transfer" },
  NO_ACTION: { rank: 2, key: "no-action", rowClass: "priority-no-action" },
  NO_PURCHASE_SLOW_MOVING: { rank: 2, key: "no-action", rowClass: "priority-no-action" },
});

const OTHER_PRIORITY = Object.freeze({ rank: 3, key: "other", rowClass: "" });

function normalizeProductCode(value) {
  return String(value || "").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function getRecommendationPriorityGroup(action) {
  return PRIORITY_GROUPS[String(action || "").trim().toUpperCase()] || OTHER_PRIORITY;
}

export function buildRecommendationPriorityMap(rows = []) {
  const index = new Map();
  for (const row of rows) {
    const productCode = normalizeProductCode(row?.productCode);
    if (!productCode) continue;
    index.set(productCode, {
      ...getRecommendationPriorityGroup(row.action),
      action: String(row.action || "").trim().toUpperCase(),
      neededQty: finiteNumber(row.neededQty),
      purchaseQty: finiteNumber(row.purchaseQty),
      transferPlanQty: finiteNumber(row.transferPlanQty),
    });
  }
  return index;
}

export function compareRowsByRecommendationPriority(left, right, priorityMap) {
  const leftPriority = priorityMap.get(normalizeProductCode(left?.productCode)) || OTHER_PRIORITY;
  const rightPriority = priorityMap.get(normalizeProductCode(right?.productCode)) || OTHER_PRIORITY;
  return leftPriority.rank - rightPriority.rank
    || finiteNumber(rightPriority.neededQty) - finiteNumber(leftPriority.neededQty)
    || normalizeProductCode(left?.productCode).localeCompare(
      normalizeProductCode(right?.productCode),
      "th",
      { numeric: true, sensitivity: "base" },
    );
}

export function getRecommendationPriorityRowClass(row, priorityMap) {
  return priorityMap.get(normalizeProductCode(row?.productCode))?.rowClass || "";
}
