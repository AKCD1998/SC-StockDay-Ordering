import { describe, expect, it } from "vitest";
import {
  clearBranchStockColumnOrder,
  getBranchStockColumnStorageKey,
  loadBranchStockColumnOrder,
  moveBranchStockColumn,
  normalizeBranchStockColumnOrder,
  reorderBranchStockColumn,
  saveBranchStockColumnOrder,
} from "./branchStockColumnPreferences.js";

const columns = [
  { key: "thai" },
  { key: "code" },
  { key: "qty" },
  { key: "sync" },
];

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe("branch stock column preferences", () => {
  it("normalizes saved order and appends newly added columns", () => {
    expect(normalizeBranchStockColumnOrder(["qty", "thai", "unknown", "qty"], columns))
      .toEqual(["qty", "thai", "code", "sync"]);
  });

  it("moves columns by adjacent controls or drag target", () => {
    const order = ["thai", "code", "qty", "sync"];
    expect(moveBranchStockColumn(order, "qty", -1)).toEqual(["thai", "qty", "code", "sync"]);
    expect(moveBranchStockColumn(order, "thai", -1)).toEqual(order);
    expect(reorderBranchStockColumn(order, "sync", "code")).toEqual(["thai", "sync", "code", "qty"]);
  });

  it("stores preferences in an account-scoped key and clears back to default", () => {
    const storage = createMemoryStorage();
    const adminA = "Admin@Example.com";
    const adminB = "other-admin";

    expect(getBranchStockColumnStorageKey(adminA)).toMatch(/admin%40example\.com$/);
    expect(saveBranchStockColumnOrder(storage, adminA, ["qty", "code", "thai", "sync"], columns)).toBe(true);
    expect(loadBranchStockColumnOrder(storage, adminA, columns)).toEqual(["qty", "code", "thai", "sync"]);
    expect(loadBranchStockColumnOrder(storage, adminB, columns)).toEqual(["thai", "code", "qty", "sync"]);
    expect(clearBranchStockColumnOrder(storage, adminA)).toBe(true);
    expect(loadBranchStockColumnOrder(storage, adminA, columns)).toEqual(["thai", "code", "qty", "sync"]);
  });

  it("falls back safely when persisted JSON is invalid", () => {
    const storage = createMemoryStorage();
    storage.setItem(getBranchStockColumnStorageKey("admin"), "not-json");
    expect(loadBranchStockColumnOrder(storage, "admin", columns)).toEqual(["thai", "code", "qty", "sync"]);
  });
});
