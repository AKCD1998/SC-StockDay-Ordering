import { describe, expect, it } from "vitest";
import {
  buildRecommendationPriorityMap,
  compareRowsByRecommendationPriority,
  getRecommendationPriorityGroup,
  getRecommendationPriorityRowClass,
} from "./branchStockRecommendationPriority.js";

describe("branch stock recommendation priority", () => {
  it("maps purchase, transfer and no-action recommendations to the requested visual groups", () => {
    expect(getRecommendationPriorityGroup("PURCHASE")).toMatchObject({ rank: 0, rowClass: "priority-purchase" });
    expect(getRecommendationPriorityGroup("TRANSFER_AND_PURCHASE")).toMatchObject({ rank: 0, rowClass: "priority-purchase" });
    expect(getRecommendationPriorityGroup("TRANSFER_IN")).toMatchObject({ rank: 1, rowClass: "priority-transfer" });
    expect(getRecommendationPriorityGroup("NO_ACTION")).toMatchObject({ rank: 2, rowClass: "priority-no-action" });
    expect(getRecommendationPriorityGroup("NO_PURCHASE_SLOW_MOVING")).toMatchObject({ rank: 2, rowClass: "priority-no-action" });
    expect(getRecommendationPriorityGroup("UNKNOWN")).toMatchObject({ rank: 3, rowClass: "" });
  });

  it("sorts by group first and needed quantity descending inside each group", () => {
    const priorityMap = buildRecommendationPriorityMap([
      { productCode: "P-PURCHASE-LOW", action: "PURCHASE", neededQty: 4 },
      { productCode: "P-PURCHASE-HIGH", action: "TRANSFER_AND_PURCHASE", neededQty: 12 },
      { productCode: "P-TRANSFER", action: "TRANSFER_IN", neededQty: 30 },
      { productCode: "P-NONE", action: "NO_ACTION", neededQty: 0 },
    ]);
    const rows = [
      { productCode: "P-OTHER" },
      { productCode: "P-NONE" },
      { productCode: "P-TRANSFER" },
      { productCode: "P-PURCHASE-LOW" },
      { productCode: "P-PURCHASE-HIGH" },
    ];

    expect([...rows].sort((left, right) => (
      compareRowsByRecommendationPriority(left, right, priorityMap)
    )).map((row) => row.productCode)).toEqual([
      "P-PURCHASE-HIGH",
      "P-PURCHASE-LOW",
      "P-TRANSFER",
      "P-NONE",
      "P-OTHER",
    ]);
    expect(getRecommendationPriorityRowClass(rows[2], priorityMap)).toBe("priority-transfer");
    expect(getRecommendationPriorityRowClass(rows[0], priorityMap)).toBe("");
  });
});
