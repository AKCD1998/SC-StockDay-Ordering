import { describe, expect, it } from "vitest";
import { stock004DisplayView } from "./stock004DisplayView.js";

const reference = { quantity: 7, observedAt: "2026-10-23T09:00:00Z", fetchedAt: "2026-10-23T09:01:00Z", stale: true, reasonCode: "projection-timeout" };
describe("stock004 current and last confirmed views", () => {
  it("keeps a stale reference separate from current quantity", () => {
    const row = { qtyBranch004: null, qtyTotalAllBranches: null, stock004: { viewStatus: "reference", lastConfirmed: reference } };
    expect(stock004DisplayView(row)).toEqual({ status: "reference", quantity: null, lastConfirmed: reference });
    expect(row.qtyBranch004).toBeNull(); expect(row.qtyTotalAllBranches).toBeNull();
  });
  it("never upgrades a known-only balance to confirmed", () => {
    expect(stock004DisplayView({ qtyBranch004: 7, stock004: { viewStatus: "confirmed", basis: "hourly-and-shopee-known-only" } }).status).toBe("known-only");
    expect(stock004DisplayView({ qtyBranch004: 7, stock004: { viewStatus: "unverified", basis: "hourly-and-shopee-known-only" } })).toMatchObject({ status: "known-only", quantity: 7 });
  });
  it("preserves legitimate current zero and negative stock", () => {
    for (const quantity of [0, -2]) expect(stock004DisplayView({ qtyBranch004: quantity, stock004: { viewStatus: "confirmed" } })).toMatchObject({ status: "confirmed", quantity });
  });
  it.each([null, undefined, "", "0", NaN])("does not turn unknown %j into zero", quantity => {
    expect(stock004DisplayView({ qtyBranch004: quantity, stock004: {} })).toMatchObject({ status: "unverified", quantity: null });
  });
  it.each([{ observedAt: null }, { fetchedAt: null }, { stale: false }, { quantity: "7" }])("rejects a reference without trustworthy quantity and timestamps", override => {
    expect(stock004DisplayView({ qtyBranch004: null, stock004: { viewStatus: "reference", lastConfirmed: { ...reference, ...override } } })).toEqual({ status: "unverified", quantity: null, lastConfirmed: null });
  });
});
