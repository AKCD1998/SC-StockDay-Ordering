import test from "node:test";
import assert from "node:assert/strict";

import {
  PostgresRepository,
  BRANCH_STOCK_COLUMNS,
} from "../repositories/postgresRepository.js";
import { validateAndNormalizeBranchStockRecords } from "../routes.js";

const ALL_QTY_COLS = Object.values(BRANCH_STOCK_COLUMNS).map((c) => c.qty);
const ALL_COST_COLS = Object.values(BRANCH_STOCK_COLUMNS).map((c) => c.cost);

function emptyRow(productCode) {
  const row = { product_code: productCode, qty_total_all_branches: 0 };
  for (const col of ALL_QTY_COLS) row[col] = 0;
  for (const col of ALL_COST_COLS) row[col] = null;
  return row;
}

// In-memory double for the branch_stock_snapshots table that faithfully mimics
// the INSERT ... ON CONFLICT semantics used by ingestBranchStockSnapshots.
//
// It applies EXACTLY the columns named in the generated SQL: it parses the
// INSERT column list to learn which single branch column is being written, and
// parses the DO UPDATE SET clause to learn which columns are overwritten. For
// any qty column the SET overwrites, EXCLUDED carries the synced value for the
// inserted branch and the INSERT default (0) for every other branch — so if the
// SQL ever regressed to overwriting all branch columns, this double would zero
// the others and the scenario assertions below would fail (catching the bug).
function makeFakeBranchStockPool() {
  const store = new Map();

  async function query(text, values) {
    if (!/INSERT INTO branch_stock_snapshots/.test(text)) {
      return { rows: [], rowCount: 0 };
    }

    const insertCols = text
      .match(/INSERT INTO branch_stock_snapshots\s*\(([\s\S]*?)\)/)[1]
      .split(",")
      .map((c) => c.trim());
    const insertedQtyCol = insertCols.find((c) => /^qty_branch_00\d$/.test(c));
    const insertedCostCol = insertCols.find((c) => /^cost_avg_branch_00\d$/.test(c));

    const setClause = text.slice(text.indexOf("DO UPDATE SET"));
    const updatedQtyCols = [
      ...setClause.matchAll(/(qty_branch_00\d)\s*=\s*EXCLUDED\.\1/g),
    ].map((m) => m[1]);
    const updatedCostCols = [
      ...setClause.matchAll(/(cost_avg_branch_00\d)\s*=\s*COALESCE\(EXCLUDED\.\1/g),
    ].map((m) => m[1]);

    const [codes, namesThai, namesEng, barcodes, units, qtys, costs, syncedAts] = values;

    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      const row = store.get(code) || emptyRow(code);
      row.product_name_thai = namesThai[i];
      row.product_name_eng = namesEng[i];
      row.barcode = barcodes[i];
      row.unit = units[i];

      // EXCLUDED.qty_branch_XXX = synced qty for the inserted branch, else 0.
      for (const col of updatedQtyCols) {
        row[col] = col === insertedQtyCol ? Number(qtys[i]) : 0;
      }
      // COALESCE(EXCLUDED.cost, existing): only the inserted branch carries a value.
      for (const col of updatedCostCols) {
        const incoming = col === insertedCostCol ? costs[i] : null;
        row[col] = incoming ?? row[col];
      }

      row.qty_total_all_branches = ALL_QTY_COLS.reduce(
        (sum, col) => sum + Number(row[col] || 0),
        0,
      );
      row.synced_at = syncedAts[i];
      store.set(code, row);
    }

    return { rows: [], rowCount: codes.length };
  }

  return { store, query };
}

function repoWithFakePool() {
  const repo = new PostgresRepository();
  const fake = makeFakeBranchStockPool();
  repo.pool = fake;
  return { repo, store: fake.store };
}

const NOW = new Date().toISOString();

test("single-branch sync updates only its own column (does not wipe others)", async () => {
  const { repo, store } = repoWithFakePool();

  // Initial DB state: SKU A has stock at branches 001 and 003.
  const initial = emptyRow("A");
  initial.qty_branch_001 = 10;
  initial.qty_branch_003 = 20;
  initial.qty_total_all_branches = 30;
  store.set("A", initial);

  // Scenario 1: branch 001 syncs SKU A = 7.
  await repo.ingestBranchStockSnapshots("001", [
    { productCode: "A", qty: 7, costAvg: null, syncedAt: NOW },
  ]);
  let row = store.get("A");
  assert.equal(Number(row.qty_branch_001), 7, "branch 001 should be updated to 7");
  assert.equal(Number(row.qty_branch_003), 20, "branch 003 must be preserved");
  assert.equal(Number(row.qty_total_all_branches), 27, "total recomputed");

  // Scenario 2: branch 003 syncs SKU A = 15.
  await repo.ingestBranchStockSnapshots("003", [
    { productCode: "A", qty: 15, costAvg: null, syncedAt: NOW },
  ]);
  row = store.get("A");
  assert.equal(Number(row.qty_branch_001), 7, "branch 001 must be preserved");
  assert.equal(Number(row.qty_branch_003), 15, "branch 003 should be updated to 15");
  assert.equal(Number(row.qty_total_all_branches), 22, "total recomputed");
});

test("sync inserts a brand-new product with only the synced branch populated", async () => {
  const { repo, store } = repoWithFakePool();

  await repo.ingestBranchStockSnapshots("004", [
    { productCode: "NEW", qty: 5, costAvg: 12.5, syncedAt: NOW },
  ]);

  const row = store.get("NEW");
  assert.equal(Number(row.qty_branch_004), 5);
  assert.equal(Number(row.qty_branch_001), 0);
  assert.equal(Number(row.qty_branch_005), 0);
  assert.equal(Number(row.qty_total_all_branches), 5);
});

test("ingestBranchStockSnapshots rejects an unknown branch code", async () => {
  const { repo } = repoWithFakePool();
  await assert.rejects(
    () => repo.ingestBranchStockSnapshots("999", [{ productCode: "A", qty: 1, syncedAt: NOW }]),
    /Unknown branchCode/,
  );
});

test("validator requires an explicit, whitelisted top-level branchCode", () => {
  assert.match(
    validateAndNormalizeBranchStockRecords({ records: [{ productCode: "A", syncedAt: NOW }] }).error,
    /top-level branchCode/,
  );
  assert.match(
    validateAndNormalizeBranchStockRecords({
      branchCode: "999",
      records: [{ productCode: "A", syncedAt: NOW }],
    }).error,
    /Unknown branchCode/,
  );
});

test("validator rejects a payload that mixes branch identities", () => {
  const result = validateAndNormalizeBranchStockRecords({
    branchCode: "001",
    records: [{ productCode: "A", branchCode: "003", qty: 1, syncedAt: NOW }],
  });
  assert.match(result.error, /does not match payload branchCode/);
});

test("validator normalizes a valid single-branch payload", () => {
  const result = validateAndNormalizeBranchStockRecords({
    branchCode: "001",
    records: [
      { productCode: "A", qty: 7, costAvg: 3.5, syncedAt: NOW, productNameThai: "ชื่อ" },
    ],
  });
  assert.equal(result.error, null);
  assert.equal(result.branchCode, "001");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].qty, 7);
  assert.equal(result.records[0].costAvg, 3.5);
});
