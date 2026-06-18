import { describe, expect, it } from "vitest";
import {
  buildSubmitPayload,
  countSubmitGroups,
  generateIdempotencyKey,
  validateSubmitPayload,
} from "./requestSubmission";

const sampleLines = [
  {
    productCode: "SKU-001",
    sourceBranchCode: "000",
    unit: "ขวด",
    requestedQty: 2,
    snapshotQty: 10,
    snapshotSyncedAt: "2026-06-18T00:00:00.000Z",
  },
  {
    productCode: "SKU-002",
    sourceBranchCode: "000",
    unit: "กล่อง",
    requestedQty: 1,
    snapshotQty: 5,
    snapshotSyncedAt: "2026-06-18T00:00:00.000Z",
  },
  {
    productCode: "SKU-003",
    sourceBranchCode: "003",
    unit: "ขวด",
    requestedQty: 4,
    snapshotQty: 8,
    snapshotSyncedAt: null,
  },
];

describe("buildSubmitPayload", () => {
  it("groups flat cart lines by source branch", () => {
    const payload = buildSubmitPayload(sampleLines, { idempotencyKey: "key-1", note: " hi " });

    expect(payload.idempotencyKey).toBe("key-1");
    expect(payload.note).toBe("hi");
    expect(payload.groups).toHaveLength(2);

    const branch000 = payload.groups.find((group) => group.sourceBranchCode === "000");
    expect(branch000.lines).toHaveLength(2);
    expect(branch000.lines[0]).toEqual({
      productCode: "SKU-001",
      requestedQty: 2,
      unit: "ขวด",
      snapshotQty: 10,
      snapshotSyncedAt: "2026-06-18T00:00:00.000Z",
    });
  });

  it("requires an idempotency key", () => {
    expect(() => buildSubmitPayload(sampleLines, {})).toThrow();
  });

  it("drops invalid lines and empty groups", () => {
    const payload = buildSubmitPayload(
      [
        { productCode: "", sourceBranchCode: "000", unit: "ขวด", requestedQty: 1 },
        { productCode: "SKU-009", sourceBranchCode: "004", unit: "", requestedQty: 1 },
      ],
      { idempotencyKey: "key-2" },
    );
    expect(payload.groups).toHaveLength(0);
  });

  it("accepts already-grouped input without regrouping", () => {
    const grouped = [
      { sourceBranchCode: "000", lines: [{ productCode: "SKU-001", unit: "ขวด", requestedQty: 3 }] },
    ];
    const payload = buildSubmitPayload(grouped, { idempotencyKey: "key-3" });
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0].lines[0].requestedQty).toBe(3);
  });
});

describe("validateSubmitPayload", () => {
  it("returns no errors for a valid payload", () => {
    const payload = buildSubmitPayload(sampleLines, { idempotencyKey: "key-1" });
    expect(validateSubmitPayload(payload)).toEqual([]);
  });

  it("flags an empty payload", () => {
    const errors = validateSubmitPayload({ groups: [] });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("countSubmitGroups", () => {
  it("counts the number of source branches", () => {
    const payload = buildSubmitPayload(sampleLines, { idempotencyKey: "key-1" });
    expect(countSubmitGroups(payload)).toBe(2);
  });
});

describe("generateIdempotencyKey", () => {
  it("produces unique prefixed keys", () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    expect(a).toMatch(/^srq-/);
    expect(a).not.toBe(b);
  });
});
