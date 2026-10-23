import { afterEach, describe, expect, it } from "vitest";
import {
  adminOnlyViews,
  adminViewKeys,
  buildAdminViewHash,
  defaultAdminView,
  getNavigationGroups,
  readAdminViewFromLocation,
} from "./adminNavigation.js";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("admin navigation model", () => {
  it("exposes Shopee exception approvals only in the admin quality group", () => {
    expect(getNavigationGroups(false).flatMap(group => group.items).map(item => item.view)).not.toContain("shopee004-exceptions");
    expect(getNavigationGroups(true).find(group => group.id === "data-quality").items.map(item => item.view)).toContain("shopee004-exceptions");
    expect(adminOnlyViews).toContain("shopee004-exceptions");
    expect(buildAdminViewHash("shopee004-exceptions")).toBe("#/shopee004-exceptions");
    window.history.replaceState({}, "", "/#/shopee004-exceptions");
    expect(readAdminViewFromLocation()).toBe("shopee004-exceptions");
  });
  it("exposes the POS admin page only to admin accounts", () => {
    expect(getNavigationGroups(false).flatMap(group => group.items).map(item => item.view)).not.toContain("pos-admin");
    expect(getNavigationGroups(true).find(group => group.id === "customer-relations").items.map(item => item.view)).toEqual(["preorder", "members", "pos-admin"]);
    expect(adminOnlyViews).toContain("pos-admin");
    expect(buildAdminViewHash("pos-admin")).toBe("#/pos-admin");
  });
  it("keeps the default and supported view contracts", () => {
    expect(defaultAdminView).toBe("receipts");
    expect(adminViewKeys).toEqual(expect.arrayContaining([
      "branch-stock",
      "stock-recommendations",
      "stock-requests",
      "sync-log",
    ]));
    expect(adminOnlyViews).toContain("stock-cost-audit");
  });

  it("hides admin-only navigation and stock cost audit from branch users", () => {
    const groups = getNavigationGroups(false);
    expect(groups.map((group) => group.id)).not.toContain("data-quality");
    expect(groups.flatMap((group) => group.items).map((item) => item.view)).not.toContain("stock-cost-audit");
  });

  it("shows admin-only navigation to admins and can hide the dashboard group", () => {
    const groups = getNavigationGroups(true, true);
    expect(groups.map((group) => group.id)).toEqual(["product-data", "data-quality", "customer-relations"]);
    expect(groups.flatMap((group) => group.items).map((item) => item.view)).toContain("stock-cost-audit");
  });

  it("builds the existing canonical hashes and leaves the default view hash empty", () => {
    expect(buildAdminViewHash("receipts")).toBe("");
    expect(buildAdminViewHash("branch-stock")).toBe("#/branch-stock");
    expect(buildAdminViewHash("product-taxonomy")).toBe("#/taxonomy");
    expect(buildAdminViewHash("unknown-view")).toBe("");
  });

  it("reads a supported hash before the pathname", () => {
    window.history.replaceState({}, "", "/receipts#/stock-requests");
    expect(readAdminViewFromLocation()).toBe("stock-requests");
  });

  it("falls back to a supported pathname and rejects unknown routes", () => {
    window.history.replaceState({}, "", "/taxonomy");
    expect(readAdminViewFromLocation()).toBe("product-taxonomy");
    window.history.replaceState({}, "", "/not-a-real-view");
    expect(readAdminViewFromLocation()).toBeNull();
  });
});
