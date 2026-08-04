import test from "node:test";
import assert from "node:assert/strict";
import { buildBranchStockReconciliationManifest } from "../src/branch-stock-reconciliation.js";

const at = "2026-07-29T01:00:00.000Z";

test("canonical manifest is order-independent and quantity-scale stable", () => {
  const first = buildBranchStockReconciliationManifest([
    { productCode: "B", qty: 2, syncedAt: at },
    { productCode: "A", qty: 1.25, syncedAt: at },
  ]);
  const second = buildBranchStockReconciliationManifest([
    { productCode: "A", qty: 1.2500, syncedAt: at },
    { productCode: "B", qty: 2.0000, syncedAt: at },
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.quantitySumScaled, "32500");
  assert.equal(first.digest, "62ea399424b94e3ca0a36c14d5a9fb041282562d777bc2da102090607ee4da09");
});

test("manifest exposes duplicates, negative stock, and source-time range", () => {
  const manifest = buildBranchStockReconciliationManifest([
    { productCode: "A", qty: -1, syncedAt: "2026-07-29T01:00:02Z" },
    { productCode: "A", qty: 3, syncedAt: "2026-07-29T01:00:01Z" },
  ]);
  assert.equal(manifest.recordCount, 2);
  assert.equal(manifest.uniqueProductCount, 1);
  assert.equal(manifest.duplicateProductCount, 1);
  assert.equal(manifest.negativeQuantityCount, 1);
  assert.equal(manifest.sourceSnapshotMinAt, "2026-07-29T01:00:01.000Z");
  assert.equal(manifest.sourceSnapshotMaxAt, "2026-07-29T01:00:02.000Z");
});

test("empty, missing-code, invalid-quantity, and invalid-time snapshots are rejected", () => {
  assert.throws(() => buildBranchStockReconciliationManifest([]), /empty snapshot/);
  assert.throws(() => buildBranchStockReconciliationManifest([{ qty: 1, syncedAt: at }]), /productCode/);
  assert.throws(() => buildBranchStockReconciliationManifest([{ productCode: "A", qty: "x", syncedAt: at }]), /quantity/);
  assert.throws(() => buildBranchStockReconciliationManifest([{ productCode: "A", qty: 1, syncedAt: "x" }]), /timestamp/);
});
