import { describe, expect, it } from "vitest";
import { countCartUnits, groupCartLines, mergeCartLines } from "./requestCart";

describe("mergeCartLines", () => {
  it("merges the same product from the same source branch", () => {
    const merged = mergeCartLines(
      [
        {
          productCode: "SKU-001",
          sourceBranchCode: "000",
          unit: "ขวด",
          requestedQty: 2,
        },
      ],
      [
        {
          productCode: "SKU-001",
          sourceBranchCode: "000",
          unit: "ขวด",
          requestedQty: 3,
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].requestedQty).toBe(5);
  });

  it("keeps separate lines when the source branch changes", () => {
    const merged = mergeCartLines([], [
      {
        productCode: "SKU-001",
        sourceBranchCode: "000",
        unit: "ขวด",
        requestedQty: 1,
      },
      {
        productCode: "SKU-001",
        sourceBranchCode: "003",
        unit: "ขวด",
        requestedQty: 1,
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(groupCartLines(merged)).toHaveLength(2);
  });

  it("counts total units after merge", () => {
    const merged = mergeCartLines([], [
      {
        productCode: "SKU-001",
        sourceBranchCode: "000",
        unit: "ขวด",
        requestedQty: 1,
      },
      {
        productCode: "SKU-002",
        sourceBranchCode: "000",
        unit: "กล่อง",
        requestedQty: 4,
      },
    ]);

    expect(countCartUnits(merged)).toBe(5);
  });
});
