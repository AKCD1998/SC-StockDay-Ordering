import test from "node:test";
import assert from "node:assert/strict";

import { PostgresRepository } from "../repositories/postgresRepository.js";
import {
  validateAndNormalizePriceDefaultsPayload,
  validateAndNormalizePriceOverridesPayload,
} from "../routes.js";

// ── In-memory doubles ─────────────────────────────────────────────────────────

// Simulates product_price_defaults, product_branch_price_overrides, and
// product_effective_branch_prices tables with the same upsert / purge /
// RETURNING semantics used by the real SQL.
function makeFakePricePool() {
  const defaults   = new Map(); // key: `${productCode}:${channel}:${unitSize}:${priceLevel}`
  const overrides  = new Map(); // key: `${productCode}:${branchCode}:${channel}:${unitSize}:${priceLevel}`
  const effective  = new Map(); // key: `${productCode}:${branchCode}:${channel}:${unitSize}:${priceLevel}`
  const productStore = new Map(); // set directly in tests for product lookup

  function defaultKey(r)  { return `${r.product_code}:${r.channel}:${r.unit_size}:${r.price_level}`; }
  function overrideKey(r) { return `${r.product_code}:${r.branch_code}:${r.channel}:${r.unit_size}:${r.price_level}`; }
  function effectiveKey(r){ return `${r.product_code}:${r.branch_code}:${r.channel}:${r.unit_size}:${r.price_level}`; }

  async function query(text, values) {
    // ── ingestProductPriceDefaults (9 params now: includes snapshot_id) ──
    if (/INSERT INTO product_price_defaults/.test(text)) {
      const [codes, channels, sizes, levels, amounts, unitNames, factors, snapshotIds, syncedAts] = values;
      for (let i = 0; i < codes.length; i++) {
        const row = {
          product_code: codes[i], channel: channels[i], unit_size: sizes[i],
          price_level: levels[i], price_amount: amounts[i],
          unit_name: unitNames[i], factor: factors[i],
          snapshot_id: snapshotIds[i], synced_at: syncedAts[i],
        };
        defaults.set(defaultKey(row), row);
      }
      return { rows: [], rowCount: codes.length };
    }

    // ── defaults purge (DELETE … RETURNING product_code) ──
    if (/DELETE FROM product_price_defaults/.test(text)) {
      const [snapshotId] = values;
      const purged = [];
      for (const [k, row] of defaults) {
        if (row.snapshot_id !== snapshotId) {
          purged.push({ product_code: row.product_code });
          defaults.delete(k);
        }
      }
      return { rows: purged, rowCount: purged.length };
    }

    // ── ingestProductBranchPriceOverrides (10 params) ──
    if (/INSERT INTO product_branch_price_overrides/.test(text)) {
      const [codes, branchCode, channels, sizes, levels, amounts, unitNames, factors, snapshotId, syncedAts] = values;
      for (let i = 0; i < codes.length; i++) {
        const row = {
          product_code: codes[i], branch_code: branchCode, channel: channels[i],
          unit_size: sizes[i], price_level: levels[i], price_amount: amounts[i],
          unit_name: unitNames[i], factor: factors[i],
          snapshot_id: snapshotId, synced_at: syncedAts[i],
        };
        overrides.set(overrideKey(row), row);
      }
      return { rows: [], rowCount: codes.length };
    }

    // ── overrides purge (DELETE … RETURNING product_code) ──
    if (/DELETE FROM product_branch_price_overrides/.test(text)) {
      const [branchCode, snapshotId] = values;
      const purged = [];
      for (const [k, row] of overrides) {
        if (row.branch_code === branchCode && row.snapshot_id !== snapshotId) {
          purged.push({ product_code: row.product_code });
          overrides.delete(k);
        }
      }
      return { rows: purged, rowCount: purged.length };
    }

    // ── refreshEffectiveBranchPrices ──
    if (/INSERT INTO product_effective_branch_prices/.test(text)) {
      const [branchCode, ...rest] = values;
      const filterCodes = rest.length > 0 ? rest[0] : null;

      for (const [, def] of defaults) {
        if (filterCodes && !filterCodes.includes(def.product_code)) continue;

        const oKey = `${def.product_code}:${branchCode}:${def.channel}:${def.unit_size}:${def.price_level}`;
        const override = overrides.get(oKey);
        const hasOverride = override && override.price_amount != null;

        const row = {
          product_code:    def.product_code,
          branch_code:     branchCode,
          channel:         def.channel,
          unit_size:       def.unit_size,
          price_level:     def.price_level,
          price_amount:    hasOverride ? override.price_amount : def.price_amount,
          source:          hasOverride ? "override" : "master",
          unit_name:       hasOverride ? (override.unit_name || def.unit_name) : def.unit_name,
          factor:          hasOverride ? (override.factor   ?? def.factor)    : def.factor,
          price_synced_at: hasOverride ? (override.synced_at || def.synced_at) : def.synced_at,
        };
        effective.set(effectiveKey(row), row);
      }
      return { rows: [], rowCount: 0 };
    }

    // ── getProductPricingForBranch: product lookup ──
    if (/FROM products\b/.test(text)) {
      const [lookup] = values;
      const product = productStore.get(lookup)
        || [...productStore.values()].find((p) => p.barcode_1 === lookup || p.barcode_2 === lookup)
        || null;
      return { rows: product ? [product] : [], rowCount: product ? 1 : 0 };
    }

    // ── getProductPricingForBranch: effective price lookup ──
    if (/FROM product_effective_branch_prices/.test(text)) {
      const [branchCode, productCode, channels] = values;
      const rows = [...effective.values()].filter(
        (r) => r.branch_code === branchCode
              && r.product_code === productCode
              && channels.includes(r.channel),
      );
      return { rows, rowCount: rows.length };
    }

    return { rows: [], rowCount: 0 };
  }

  return { query, defaults, overrides, effective, productStore };
}

function repoWithFakePool() {
  const repo = new PostgresRepository();
  const fake = makeFakePricePool();
  repo.pool = { ...fake, connect: async () => ({ query: fake.query, release: () => {} }) };
  return { repo, ...fake };
}

// ── Validator tests ───────────────────────────────────────────────────────────

test("validateAndNormalizePriceDefaultsPayload rejects missing records", () => {
  assert.match(validateAndNormalizePriceDefaultsPayload({}).error, /records array/);
});

test("validateAndNormalizePriceDefaultsPayload rejects invalid channel", () => {
  const result = validateAndNormalizePriceDefaultsPayload({
    records: [{ productCode: "A", channel: "membership", unitSize: "S", priceLevel: 1, priceAmount: 10 }],
  });
  assert.match(result.error, /channel/);
});

test("validateAndNormalizePriceOverridesPayload rejects unknown branchCode", () => {
  const result = validateAndNormalizePriceOverridesPayload({ branchCode: "999", records: [] });
  assert.match(result.error, /Unknown branchCode/);
});

test("validateAndNormalizePriceDefaultsPayload normalizes a valid record", () => {
  const result = validateAndNormalizePriceDefaultsPayload({
    records: [{ productCode: "SKU-1", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });
  assert.equal(result.error, null);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].channel, "retail");
  assert.equal(result.records[0].unitSize, "S");
  assert.equal(result.records[0].priceLevel, 1);
  assert.equal(result.records[0].priceAmount, 20);
});

test("validateAndNormalizePriceOverridesPayload silently drops null-priceAmount records", () => {
  const result = validateAndNormalizePriceOverridesPayload({
    branchCode: "001",
    records: [
      { productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: null },
      { productCode: "B", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 25 },
    ],
  });
  assert.equal(result.error, null);
  assert.equal(result.records.length, 1, "null-priceAmount record must be dropped");
  assert.equal(result.records[0].productCode, "B");
});

// Fix 2: wholesale price_level 4 and 5 must now be accepted.
test("validator accepts wholesale price_level 4 and 5", () => {
  for (const level of [4, 5]) {
    const result = validateAndNormalizePriceDefaultsPayload({
      records: [{ productCode: "W", channel: "wholesale", unitSize: "M", priceLevel: level, priceAmount: 100 }],
    });
    assert.equal(result.error, null, `priceLevel ${level} must be accepted`);
    assert.equal(result.records[0].priceLevel, level);
  }
});

test("validator rejects price_level 0 and 10", () => {
  for (const level of [0, 10]) {
    const result = validateAndNormalizePriceDefaultsPayload({
      records: [{ productCode: "X", channel: "retail", unitSize: "S", priceLevel: level, priceAmount: 10 }],
    });
    assert.match(result.error, /priceLevel/, `priceLevel ${level} must be rejected`);
  }
});

// ── Repository: idempotent upsert ─────────────────────────────────────────────

test("ingestProductPriceDefaults is idempotent — second call wins", async () => {
  const { repo, defaults } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });
  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 22 }],
  });

  const row = defaults.get("A:retail:S:1");
  assert.equal(Number(row.price_amount), 22, "second write must overwrite first");
});

// ── Repository: fallback override → master ────────────────────────────────────

test("refreshEffectiveBranchPrices uses override when present", async () => {
  const { repo, effective } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });
  await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "snap-1", isFinal: false,
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 18 }],
  });
  await repo.refreshEffectiveBranchPrices({ branchCode: "001" });

  const eff = effective.get("A:001:retail:S:1");
  assert.equal(Number(eff.price_amount), 18, "override price should win");
  assert.equal(eff.source, "override");
});

test("refreshEffectiveBranchPrices falls back to master when no override exists", async () => {
  const { repo, effective } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });
  await repo.refreshEffectiveBranchPrices({ branchCode: "003" });

  const eff = effective.get("A:003:retail:S:1");
  assert.equal(Number(eff.price_amount), 20, "master price should be used");
  assert.equal(eff.source, "master");
});

// ── Repository: null override must NOT overwrite master ───────────────────────

test("null-priceAmount override is not stored and master price is preserved", async () => {
  const { repo, overrides, effective } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });

  const validation = validateAndNormalizePriceOverridesPayload({
    branchCode: "001", snapshotId: "snap-null", isFinal: false,
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: null }],
  });
  assert.equal(validation.records.length, 0, "validator must drop null-price record");

  await repo.ingestProductBranchPriceOverrides(validation);
  await repo.refreshEffectiveBranchPrices({ branchCode: "001" });

  assert.equal(overrides.size, 0, "null override must not be stored");
  const eff = effective.get("A:001:retail:S:1");
  assert.equal(Number(eff.price_amount), 20, "master price must be preserved");
  assert.equal(eff.source, "master");
});

// ── Repository: branch isolation ──────────────────────────────────────────────

test("branch price isolation — branch 001 override does not affect branch 005", async () => {
  const { repo, effective } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });
  await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "s1", isFinal: false,
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 15 }],
  });
  await repo.refreshEffectiveBranchPrices({});

  const eff001 = effective.get("A:001:retail:S:1");
  const eff005 = effective.get("A:005:retail:S:1");

  assert.equal(Number(eff001.price_amount), 15, "branch 001 should use override");
  assert.equal(eff001.source, "override");
  assert.equal(Number(eff005.price_amount), 20, "branch 005 should use master");
  assert.equal(eff005.source, "master");
});

// ── Fix 3: purge overrides → effective must fall back to master ───────────────

test("after isFinal override purge, effective price falls back to master for removed SKU", async () => {
  const { repo, effective } = repoWithFakePool();

  await repo.ingestProductPriceDefaults({
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 20 }],
  });

  // snap-1: override A at 15.
  await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "snap-1", isFinal: false,
    records: [{ productCode: "A", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 15 }],
  });
  await repo.refreshEffectiveBranchPrices({ branchCode: "001" });
  assert.equal(effective.get("A:001:retail:S:1").source, "override", "pre-condition");

  // snap-2: only B is overridden — A's override is purged.
  const ingestResult = await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "snap-2", isFinal: true,
    records: [{ productCode: "B", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 25 }],
  });

  assert.ok(ingestResult.orphanProductCodes.includes("A"), "A must appear in orphanProductCodes");

  // Simulate what the route does: refresh union of new + orphan codes.
  const allCodes = [...new Set(["B", ...ingestResult.orphanProductCodes])];
  await repo.refreshEffectiveBranchPrices({ branchCode: "001", productCodes: allCodes });

  const effA = effective.get("A:001:retail:S:1");
  assert.equal(effA.source, "master", "A must fall back to master after override purge");
  assert.equal(Number(effA.price_amount), 20, "master price must be restored");
});

// ── Fix 4: defaults snapshot purge ───────────────────────────────────────────

test("isFinal defaults purge removes stale master prices and returns orphanProductCodes", async () => {
  const { repo, defaults, effective } = repoWithFakePool();

  // snap-1: two products.
  await repo.ingestProductPriceDefaults({
    snapshotId: "snap-1", isFinal: false,
    records: [
      { productCode: "OLD", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 30 },
      { productCode: "NEW", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 25 },
    ],
  });
  assert.equal(defaults.size, 2);

  // snap-2: only "NEW" — "OLD" removed from HQ catalog.
  const result = await repo.ingestProductPriceDefaults({
    snapshotId: "snap-2", isFinal: true,
    records: [{ productCode: "NEW", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 25 }],
  });

  assert.equal(result.orphansPurged, 1, "OLD must be purged");
  assert.ok(result.orphanProductCodes.includes("OLD"), "orphanProductCodes must include OLD");
  assert.equal(defaults.has("OLD:retail:S:1"), false, "OLD must be gone from defaults");
  assert.equal(defaults.has("NEW:retail:S:1"), true,  "NEW must remain");

  // After refresh, effective table for OLD must have no entry (no master = no row).
  const allCodes = [...new Set(["NEW", ...result.orphanProductCodes])];
  await repo.refreshEffectiveBranchPrices({ branchCode: "001", productCodes: allCodes });

  // "NEW" must still be present; "OLD" was filtered out by productCodes scope
  // and has no master row so it should not appear in effective.
  assert.equal(effective.has("OLD:001:retail:S:1"), false, "OLD must not appear in effective");
  assert.equal(effective.has("NEW:001:retail:S:1"), true,  "NEW must still be in effective");
});

// ── Repository: snapshot orphan purge (overrides) ────────────────────────────

test("override isFinal purges old-snapshot rows for the branch", async () => {
  const { repo, overrides } = repoWithFakePool();

  await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "snap-old", isFinal: false,
    records: [{ productCode: "OLD", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 30 }],
  });
  assert.equal(overrides.size, 1);

  await repo.ingestProductBranchPriceOverrides({
    branchCode: "001", snapshotId: "snap-new", isFinal: true,
    records: [{ productCode: "NEW", channel: "retail", unitSize: "S", priceLevel: 1, priceAmount: 25 }],
  });

  assert.equal(overrides.has("OLD:001:retail:S:1"), false, "old-snapshot row must be purged");
  assert.equal(overrides.has("NEW:001:retail:S:1"), true,  "new-snapshot row must be kept");
});

// ── Repository: scan by barcode ───────────────────────────────────────────────

test("getProductPricingForBranch resolves by barcode and returns effective prices", async () => {
  const { repo, effective, productStore } = repoWithFakePool();

  productStore.set("8858850301707", {
    product_code: "SKU-XYZ",
    product_name: "Test Product",
    product_name_eng: null,
    barcode_1: "8858850301707",
    barcode_2: null,
    barcode_3: null,
    unit_small: "ชิ้น",
    unit_medium: "แพ็ค",
    unit_large: null,
    factor_small: 1,
    factor_medium: 12,
    factor_large: null,
  });

  effective.set("SKU-XYZ:005:retail:S:1", {
    product_code: "SKU-XYZ", branch_code: "005",
    channel: "retail", unit_size: "S", price_level: 1,
    price_amount: 20.00, source: "override",
    unit_name: "ชิ้น", factor: 1,
    price_synced_at: new Date().toISOString(),
  });

  const result = await repo.getProductPricingForBranch({
    branchCode: "005",
    barcode: "8858850301707",
    scopes: ["price:retail"],
  });

  assert.ok(result, "result must not be null");
  assert.equal(result.productCode, "SKU-XYZ");
  assert.equal(result.matchedBarcode, "8858850301707");
  assert.equal(result.branchCode, "005");
  assert.equal(result.prices.length, 1);
  assert.equal(result.prices[0].price, 20);
  assert.equal(result.prices[0].source, "override");
});

test("getProductPricingForBranch returns null when product not found", async () => {
  const { repo } = repoWithFakePool();
  const result = await repo.getProductPricingForBranch({
    branchCode: "001",
    barcode: "0000000000000",
    scopes: ["price:retail"],
  });
  assert.equal(result, null);
});

test("ingestProductBranchPriceOverrides rejects unknown branchCode", async () => {
  const { repo } = repoWithFakePool();
  await assert.rejects(
    () => repo.ingestProductBranchPriceOverrides({ branchCode: "999", records: [] }),
    /Unknown branchCode/,
  );
});
