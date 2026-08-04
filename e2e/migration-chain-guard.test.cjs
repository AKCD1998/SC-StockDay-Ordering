"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseMigrationNumber,
  checkMigrationChainCoverage,
  formatGuardFailureMessage,
} = require("./migrationChainGuard.cjs");
const cfg = require("./config.cjs");

function makeTempMigrationsDir(filenames) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-guard-test-"));
  for (const filename of filenames) {
    fs.writeFileSync(path.join(dir, filename), "-- test fixture\n");
  }
  return dir;
}

test("parseMigrationNumber extracts the leading three-digit number", () => {
  assert.equal(parseMigrationNumber("037_add_stock_request_mode.sql"), 37);
  assert.equal(parseMigrationNumber("001_inventory_schema.sql"), 1);
  assert.equal(parseMigrationNumber("not_a_migration.sql"), null);
  assert.equal(parseMigrationNumber("readme.md"), null);
});

test("checkMigrationChainCoverage: fully covered range reports ok with no gaps", () => {
  const dir = makeTempMigrationsDir(["001_a.sql", "002_b.sql", "003_c.sql"]);
  const result = checkMigrationChainCoverage({
    migrationsDir: dir,
    curatedMigrationFiles: ["migrations/001_a.sql", "migrations/002_b.sql", "migrations/003_c.sql"],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.gaps, []);
  assert.equal(result.curatedMax, 3);
  assert.equal(result.realMax, 3);
});

test("checkMigrationChainCoverage: THIS IS TODAY'S BUG — a migration inside the claimed range but omitted is a gap", () => {
  const dir = makeTempMigrationsDir(["001_a.sql", "002_b.sql", "003_c.sql"]);
  // Curated list jumps straight from 001 to 003 (its own max), silently
  // omitting 002 — exactly the shape of the real bug (035 -> 037 gap).
  const result = checkMigrationChainCoverage({
    migrationsDir: dir,
    curatedMigrationFiles: ["migrations/001_a.sql", "migrations/003_c.sql"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.gaps, [2]);
  assert.match(formatGuardFailureMessage(result), /002_b|\b2\b/);
});

test("checkMigrationChainCoverage: an explicitly excluded migration does not count as a gap", () => {
  const dir = makeTempMigrationsDir(["001_a.sql", "002_pgvector_thing.sql", "003_c.sql"]);
  const result = checkMigrationChainCoverage({
    migrationsDir: dir,
    curatedMigrationFiles: ["migrations/001_a.sql", "migrations/003_c.sql"],
    intentionallyExcluded: [2],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.gaps, []);
});

test("checkMigrationChainCoverage: THIS IS CLAIM-X-036 — a migration ABOVE the curated ceiling is ALSO a gap unless explicitly excluded", () => {
  const dir = makeTempMigrationsDir(["001_a.sql", "002_b.sql", "003_c.sql", "004_d.sql", "005_e.sql"]);
  const result = checkMigrationChainCoverage({
    migrationsDir: dir,
    curatedMigrationFiles: ["migrations/001_a.sql", "migrations/002_b.sql", "migrations/003_c.sql"],
  });
  assert.equal(result.ok, false, "004 and 005 are unaccounted for — 'lagging behind on purpose' must be DECLARED, not assumed");
  assert.deepEqual(result.gaps, [4, 5]);
  assert.equal(result.curatedMax, 3);
  assert.equal(result.realMax, 5);
});

test("checkMigrationChainCoverage: a migration above the curated ceiling that IS explicitly excluded is fine", () => {
  const dir = makeTempMigrationsDir(["001_a.sql", "002_b.sql", "003_c.sql", "004_not_yet_needed.sql"]);
  const result = checkMigrationChainCoverage({
    migrationsDir: dir,
    curatedMigrationFiles: ["migrations/001_a.sql", "migrations/002_b.sql", "migrations/003_c.sql"],
    intentionallyExcluded: [4],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.gaps, []);
});

// The integration-style check: run the guard against the ACTUAL repo layout
// this e2e harness uses, so a future migration added without updating
// config.cjs fails THIS test immediately, without needing to run the full
// (expensive) Playwright suite first.
test("REAL REPO: e2e/config.cjs's curated migration list has no undocumented gaps against PaaSRTSM-project/migrations", () => {
  const migrationsDir = path.join(cfg.PAASRTSM_REPO, "migrations");
  const result = checkMigrationChainCoverage({
    migrationsDir,
    curatedMigrationFiles: cfg.MIGRATION_FILES,
    intentionallyExcluded: cfg.MIGRATION_CHAIN_INTENTIONALLY_EXCLUDED || [],
  });
  assert.ok(result.ok, formatGuardFailureMessage(result));
});
