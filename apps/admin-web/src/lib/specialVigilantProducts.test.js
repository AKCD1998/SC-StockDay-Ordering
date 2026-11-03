import { describe, expect, it, vi } from "vitest";
import { SPECIAL_VIGILANT_INTERVAL_MS, SPECIAL_VIGILANT_PRODUCTS } from "../data/specialVigilantProducts.js";
import {
  buildVigilantRows, finiteQuantity, isVigilantPopupDue, loadVigilantSnapshot,
  readVigilantSchedule, vigilantStorageKey,
} from "./specialVigilantProducts.js";

const products = [{ productCode: "P1", name: "ยาทดสอบ" }, { productCode: "P2", name: "อีกตัว" }];
const json = data => ({ ok: true, json: async () => data });
const detail = (productCode, targetQty = 4) => ({
  branchCode: "005", productCode, meta: { reader: { servedReader: "normalized" } },
  recommendation: { branchCode: "005", productCode, targetQty, currentStock: 0, unit: "กล่อง" },
});

describe("special vigilant product rules", () => {
  it("contains the 80 workbook references plus exactly the six accepted additions", () => {
    expect(SPECIAL_VIGILANT_PRODUCTS).toHaveLength(86);
    expect(new Set(SPECIAL_VIGILANT_PRODUCTS.map(row => row.productCode)).size).toBe(86);
    expect(SPECIAL_VIGILANT_PRODUCTS.filter(row => row.source === "accepted-addition").map(row => row.productCode).sort())
      .toEqual(["630030021", "IC-000545", "IC-000560", "IC-000757", "IC-003101", "IC-005814"]);
  });

  it("alerts on zero, negative and strict below-target quantities, preserving unknown inputs", () => {
    const cases = [
      [0, 0, true, "out-of-stock"], [-2, 0, true, "negative"],
      [2, 2.1, true, "below-target"], [2, 2, false, "sufficient"],
      [3, 2, false, "sufficient"], [null, 4, false, "unknown-stock"],
      ["", 4, false, "unknown-stock"], [undefined, 4, false, "unknown-stock"],
      ["bad", 4, false, "unknown-stock"], [2, null, false, "unknown-target"],
      [0, null, true, "out-of-stock"], [2, -1, false, "unknown-target"],
    ];
    for (const [currentStock, targetQty, alert, status] of cases) {
      const row = buildVigilantRows([{ productCode: "P1", qtyBranch005: currentStock, qtyBranch004: 0 }],
        new Map([["P1", { targetQty }]]), products.slice(0, 1))[0];
      expect({ alert: row.alert, status: row.status }).toEqual({ alert, status });
    }
    for (const value of [false, true, [], {}, NaN, Infinity]) expect(finiteQuantity(value)).toBeNull();
  });

  it("does not compare quantities in mismatched units", () => {
    const [row] = buildVigilantRows([{ productCode: "P1", qtyBranch005: 1, unit: "แผง" }],
      new Map([["P1", { targetQty: 5, unit: "กล่อง" }]]), products.slice(0, 1));
    expect(row.targetQty).toBeNull();
    expect(row.alert).toBe(false);
  });

  it("reads current web stock independently of recommendation snapshot stock", async () => {
    const request = vi.fn(async path => path.startsWith("/api/branch-stock?")
      ? json({ records: products.map(p => ({ ...p, qtyBranch005: p.productCode === "P1" ? 8 : 1, unit: "กล่อง" })), pagination: { total: 2 } })
      : json(detail(path.split("/").at(-1), 4)));
    const result = await loadVigilantSnapshot({ request, products });
    expect(result.rows[0].currentStock).toBe(8);
    expect(result.alerts.map(row => row.productCode)).toEqual(["P2"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every(([path]) => !path.includes("/004/"))).toBe(true);
  });

  it("keeps stock-zero alerts when the recommendation reader is unavailable or legacy", async () => {
    for (const unavailable of [true, false]) {
      const request = vi.fn(async path => {
        if (path.startsWith("/api/branch-stock?")) return json({ records: [{ productCode: "P1", qtyBranch005: 0 }] });
        return unavailable ? { ok: false, status: 503 } : json({ ...detail("P1"), meta: { reader: { servedReader: "legacy" } } });
      });
      const result = await loadVigilantSnapshot({ request, products });
      expect(result.alerts.map(row => row.productCode)).toEqual(["P1"]);
      expect(result.unavailableCount).toBe(2);
      expect(request).toHaveBeenCalledTimes(2);
    }
  });

  it("follows stock pagination and rejects truncated pages without inventing zeros", async () => {
    const request = vi.fn(async path => {
      if (path.includes("offset=0")) return json({ records: [{ productCode: "P1", qtyBranch005: 1 }], pagination: { total: 2 } });
      if (path.includes("offset=1")) return json({ records: [{ productCode: "P2", qtyBranch005: 2 }], pagination: { total: 2 } });
      return json(detail(path.split("/").at(-1)));
    });
    const result = await loadVigilantSnapshot({ request, products });
    expect(result.rows.map(row => row.currentStock)).toEqual([1, 2]);
    request.mockImplementation(async () => json({ records: [], pagination: { total: 2 } }));
    await expect(loadVigilantSnapshot({ request, products })).rejects.toThrow("Incomplete");
  });

  it("rejects recommendation targets from a different branch or product", async () => {
    for (const bad of [{ branchCode: "004" }, { productCode: "OTHER" }]) {
      const request = vi.fn(async path => path.startsWith("/api/branch-stock?")
        ? json({ records: [{ productCode: "P1", qtyBranch005: 1 }] })
        : json({ ...detail("P1"), ...bad }));
      const result = await loadVigilantSnapshot({ request, products });
      expect(result.rows[0].targetQty).toBeNull();
      expect(result.alerts).toHaveLength(0);
    }
  });

  it("honors the exact two-hour boundary and tolerates corrupt storage and clock changes", () => {
    const now = 100_000_000;
    expect(isVigilantPopupDue(now, now + SPECIAL_VIGILANT_INTERVAL_MS - 1)).toBe(false);
    expect(isVigilantPopupDue(now, now + SPECIAL_VIGILANT_INTERVAL_MS)).toBe(true);
    expect(vigilantStorageKey("a")).not.toBe(vigilantStorageKey("b"));
    expect(readVigilantSchedule({ getItem: () => "bad" }, "x", now)).toEqual({ lastShownAt: 0, nextCheckAt: 0 });
    expect(readVigilantSchedule({ getItem: () => JSON.stringify({ lastShownAt: now + 1, nextCheckAt: now + 99_000_000 }) }, "x", now))
      .toEqual({ lastShownAt: 0, nextCheckAt: 0 });
  });
});
