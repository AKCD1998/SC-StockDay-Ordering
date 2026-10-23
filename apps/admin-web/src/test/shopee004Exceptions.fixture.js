// Synthetic contracts only. No production orders, quantities or identities.
export function exceptionFixture(overrides = {}) {
  return { exceptionId: "fixture-exception-a", revision: "fixture-revision-2", listingId: "fixture-listing", variationId: "fixture-variation",
    productName: "สินค้าแพ็กตัวอย่าง", variantName: "กล่อง 2 ชิ้น", reasonCode: "unit_conflict", issueClass: "unit",
    observedUnit: "ชิ้น", affectedOrders: 2, canApproveMapping: true, requiresLifecycleReview: false,
    ruleVersion: null,
    proposedMatches: [{ productCode: "SYNTHETIC-A", productName: "สินค้า POS ตัวอย่าง", unit: "กล่อง", quantityPerSale: 1, evidenceRefs: ["fixture-evidence", "fixture-catalog", "fixture-pos-unit"] }],
    evidence: [
      { kind: "seller_description", reference: "fixture-evidence", label: "คำอธิบายแพ็กจากหน้าสินค้าที่ตรวจแล้ว", verifiedAt: "2026-10-23T09:00:00Z" },
      { kind: "seller_catalog", reference: "fixture-catalog", label: "ทะเบียนรายการและตัวเลือกจาก Seller Centre", verifiedAt: "2026-10-23T09:00:00Z" },
      { kind: "pos_unit", reference: "fixture-pos-unit", label: "หน่วยจากทะเบียน POS ที่ตรวจแล้ว", verifiedAt: "2026-10-23T09:00:00Z" },
    ],
    ...overrides };
}

export function exceptionsFixture(records = [exceptionFixture()], overrides = {}) {
  return { schemaVersion: "shopee004-exceptions-v1", branchCode: "004", asOf: "2026-10-23T10:00:00Z", status: "available",
    records, pagination: { hasMore: false, nextCursor: null }, ...overrides };
}

export const reconciliationFixture = { asOf: "2026-10-23T10:00:00Z", openingBoundaryPreserved: true, cutoverAt: "2026-10-23T06:26:56Z", openingBasisQuality: "owner-accepted-estimate",
  physicalStockVerified: false, reservedOrders: 3, shippedUnpostedOrders: 2, reviewOrders: 1, requiresCountReconciliation: true };
