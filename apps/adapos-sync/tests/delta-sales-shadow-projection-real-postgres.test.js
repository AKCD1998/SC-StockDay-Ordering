import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { scanSalesDocuments, documentKey } from "../src/delta/salesFingerprint.js";
import { projectFullSyncEffectiveState, canonicalizeDocumentContent } from "../src/delta/salesShadowProjection.js";

// DELTA_SYNC_DESIGN.md §8 Stage 1's "reconstruct a shadow projection and
// compare it with Full Sync" is proven here through a REAL disposable
// PostgreSQL instance using genuine UPSERT-by-key SQL semantics, not just JS
// object equality — this is the "touching database state" leg of Stage 1
// evidence, complementary to the pure-JS suite
// (delta-sales-shadow-projection.test.js), which already covers the
// document-content edge cases (whitespace, decimals, duplicates, DocType,
// refund status, etc.). This file re-proves the reconstruction mechanism
// itself through real SQL, using a small representative scenario set plus
// the same non-vacuous adversarial (lying-fingerprint) case.
//
// The Postgres instance created here is entirely local/disposable/test-owned
// (a fresh mkdtempSync data directory, a random high port, `initdb`/`pg_ctl`
// from a local install) — it is NEVER the Backend's real schema/migrations
// (Session D does not own the Backend repo) and NEVER any shared/production
// database. It is created, used, and destroyed within this one test file.

function header(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FTShdDocType: "1",
    FDShdDocDate: new Date("2026-08-01T00:00:00Z"), FTShdDocTime: "10:00:00",
    FTCstCode: "CUST-1", FTShdStaPaid: "3", FTShdStaRefund: null, FTShdStaDoc: "1",
    FTUsrCode: "USR1", FTPosCode: "POS1", FTShdPosCN: null,
    FCShdTotal: 100, FCShdDis: 0, FCShdAftDisChg: 100, FCShdVat: 6.54, FCShdGrand: 100,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    FTBchCode: "004", FTShdDocNo: "DOC-1", FNSdtSeqNo: 1, FTPdtCode: "PDT-1",
    FCSdtQty: 2, FCSdtStkFac: 1, FCSdtQtyAll: 2, FCSdtSetPrice: 50, FCSdtDis: 0, FCSdtNet: 100,
    FCSdtDisAvg: 0, FCSdtFootAvg: 0, FCSdtRePackAvg: 0,
    FTSdtLotNo: "LOT1", FDSdtExpired: new Date("2027-01-01T00:00:00Z"),
    ...overrides,
  };
}

function findPgBinDir() {
  const candidates = [
    process.env.DELTA_TEST_PG_BIN_DIR,
    "C:\\Program Files\\PostgreSQL\\18\\bin",
    "C:\\Program Files\\PostgreSQL\\17\\bin",
    "C:\\Program Files\\PostgreSQL\\16\\bin",
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "pg_ctl.exe")) || existsSync(path.join(dir, "pg_ctl"))) return dir;
  }
  // Fall back to PATH — let the caller's spawnSync surface a real error if absent.
  return null;
}

const PG_BIN_DIR = findPgBinDir();
const HAS_PG = PG_BIN_DIR !== null;

function pgBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return PG_BIN_DIR ? path.join(PG_BIN_DIR, exe) : exe;
}

// stdio: "ignore" on every spawnSync call below is deliberate, not
// cosmetic. `pg_ctl start -w` on Windows launches `postgres.exe` as a
// long-lived background process that inherits the parent's stdout/stderr
// PIPE handles; because postgres.exe never exits, it never closes its end
// of that pipe, so Node's spawnSync (which reads the pipe to EOF whenever
// `encoding`/captured stdio is requested) blocks forever waiting for a
// close that never comes -- even though pg_ctl itself already exited
// successfully and the server is genuinely up and accepting connections.
// This reproduced as an indefinite hang (not a crash) on this machine,
// confirmed via a minimal isolated repro outside this file. Diagnostics on
// failure come from the real server log (`-l server.log`) instead of
// captured stdout/stderr, which is unavailable with ignored stdio.
function readLogTail(dataDir) {
  try {
    return readFileSync(path.join(dataDir, "server.log"), "utf8").split("\n").slice(-20).join("\n");
  } catch {
    return "(no server.log available)";
  }
}

function startDisposablePostgres() {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "delta-projection-pg-"));
  const port = 56000 + Math.floor(Math.random() * 900);

  const initdb = spawnSync(pgBin("initdb"), [
    "-D", dataDir,
    "-U", "postgres",
    "--auth=trust",
    "--no-instructions",
  ], { stdio: "ignore" });
  if (initdb.status !== 0) {
    throw new Error(`initdb failed (exit ${initdb.status}, signal ${initdb.signal})`);
  }

  const start = spawnSync(pgBin("pg_ctl"), [
    "start",
    "-D", dataDir,
    "-w", // wait for startup
    // autovacuum=off/fsync=off/full_page_writes=off: safe for a disposable,
    // short-lived instance that is destroyed well before autovacuum would
    // ever run and is never expected to survive a crash; reduces test time.
    "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c autovacuum=off -c fsync=off -c full_page_writes=off`,
    "-l", path.join(dataDir, "server.log"),
  ], { stdio: "ignore" });
  if (start.status !== 0) {
    throw new Error(`pg_ctl start failed (exit ${start.status}, signal ${start.signal}). Log tail:\n${readLogTail(dataDir)}`);
  }

  return { dataDir, port };
}

function stopDisposablePostgres({ dataDir }) {
  spawnSync(pgBin("pg_ctl"), ["stop", "-D", dataDir, "-m", "fast", "-w"], { stdio: "ignore" });
  rmSync(dataDir, { recursive: true, force: true });
}

// Each test() call below is individually skipped via its options object
// when HAS_PG is false, so this helper only ever runs when a real local
// PostgreSQL install was found — it does not need its own skip branch.
async function withDisposablePostgres(fn) {
  const instance = startDisposablePostgres();
  const pool = new pg.Pool({
    host: "127.0.0.1", port: instance.port, user: "postgres", database: "postgres",
    max: 3,
  });
  try {
    await pool.query(`
      CREATE TABLE full_sync_state (document_key text PRIMARY KEY, content text NOT NULL);
      CREATE TABLE delta_state (document_key text PRIMARY KEY, content text NOT NULL);
    `);
    return await fn(pool);
  } finally {
    await pool.end().catch(() => {});
    stopDisposablePostgres(instance);
  }
}

// Applies the real Full Sync ground truth (every document in the current
// scan) into full_sync_state, and applies the Delta-projected state (seed
// delta_state with baseline content, then UPSERT only new/changed documents)
// into delta_state — both via real SQL UPSERT (ON CONFLICT DO UPDATE), not
// JS object assignment.
async function applyBothPaths(pool, { baselineHeaderRows, baselineLineRows, currentHeaderRows, currentLineRows, scanFn = scanSalesDocuments }) {
  const baselineFingerprints = scanFn(baselineHeaderRows ?? [], baselineLineRows ?? []);
  const currentFingerprints = scanFn(currentHeaderRows ?? [], currentLineRows ?? []);
  const baselineState = projectFullSyncEffectiveState(baselineHeaderRows, baselineLineRows);
  const currentState = projectFullSyncEffectiveState(currentHeaderRows, currentLineRows);

  // Seed delta_state with the baseline's real content (what a prior Full
  // Sync run already established, and what Delta would carry forward for
  // anything it decides not to resend).
  for (const [key, entry] of baselineState) {
    await pool.query(
      "INSERT INTO delta_state (document_key, content) VALUES ($1, $2) ON CONFLICT (document_key) DO UPDATE SET content = EXCLUDED.content",
      [key, canonicalizeDocumentContent(entry)],
    );
  }

  for (const [key, currentEntry] of currentFingerprints) {
    const baselineEntry = baselineFingerprints.get(key);
    const isUnchanged = baselineEntry !== undefined && baselineEntry.fingerprint === currentEntry.fingerprint;

    // PATH A — Full Sync ground truth: every current-run document, always.
    await pool.query(
      "INSERT INTO full_sync_state (document_key, content) VALUES ($1, $2) ON CONFLICT (document_key) DO UPDATE SET content = EXCLUDED.content",
      [key, canonicalizeDocumentContent(currentState.get(key))],
    );

    // PATH B — Delta projected: only resend (UPSERT) new/changed documents.
    // Unchanged documents are deliberately NOT written here — delta_state
    // keeps whatever the baseline seed already put there.
    if (!isUnchanged) {
      await pool.query(
        "INSERT INTO delta_state (document_key, content) VALUES ($1, $2) ON CONFLICT (document_key) DO UPDATE SET content = EXCLUDED.content",
        [key, canonicalizeDocumentContent(currentState.get(key))],
      );
    }
  }

  return { scannedKeys: [...currentFingerprints.keys()] };
}

async function fetchRow(pool, table, key) {
  const result = await pool.query(`SELECT content FROM ${table} WHERE document_key = $1`, [key]);
  return result.rows[0]?.content ?? null;
}

test("1. real Postgres: identical two runs — full_sync_state and delta_state agree for the unchanged document via real UPSERT", { skip: !HAS_PG && "PostgreSQL binaries not found" }, async () => {
  await withDisposablePostgres(async (pool) => {
    const { scannedKeys } = await applyBothPaths(pool, {
      baselineHeaderRows: [header()], baselineLineRows: [line()],
      currentHeaderRows: [header()], currentLineRows: [line()],
    });
    for (const key of scannedKeys) {
      const full = await fetchRow(pool, "full_sync_state", key);
      const delta = await fetchRow(pool, "delta_state", key);
      assert.equal(delta, full, `document ${key} must agree between full_sync_state and delta_state`);
    }
  });
});

test("2. real Postgres: header correction + line change across runs — Delta's real-SQL reconstruction still agrees with Full Sync", { skip: !HAS_PG && "PostgreSQL binaries not found" }, async () => {
  await withDisposablePostgres(async (pool) => {
    const { scannedKeys } = await applyBothPaths(pool, {
      baselineHeaderRows: [header(), header({ FTShdDocNo: "DOC-2" })],
      baselineLineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
      currentHeaderRows: [header({ FCShdGrand: 90, FCShdAftDisChg: 90 }), header({ FTShdDocNo: "DOC-2" })], // DOC-1 changed, DOC-2 unchanged
      currentLineRows: [line(), line({ FTShdDocNo: "DOC-2" })],
    });
    assert.equal(scannedKeys.length, 2);
    for (const key of scannedKeys) {
      const full = await fetchRow(pool, "full_sync_state", key);
      const delta = await fetchRow(pool, "delta_state", key);
      assert.equal(delta, full, `document ${key} must agree between full_sync_state and delta_state`);
    }
  });
});

test("3. real Postgres adversarial: a lying fingerprint scanner produces a real, detectable SQL-level mismatch between full_sync_state and delta_state", { skip: !HAS_PG && "PostgreSQL binaries not found" }, async () => {
  await withDisposablePostgres(async (pool) => {
    const baselineHeaders = [header()];
    const baselineLines = [line()];
    const currentHeaders = [header({ FCShdGrand: 999, FCShdAftDisChg: 999 })]; // genuinely different
    const currentLines = [line()];

    let callCount = 0;
    const lyingScanFn = (h, l) => {
      callCount++;
      const real = scanSalesDocuments(h, l);
      if (callCount === 2) {
        const baselineReal = scanSalesDocuments(baselineHeaders, baselineLines);
        const key = documentKey("004", "DOC-1");
        const forced = new Map(real);
        forced.set(key, { ...forced.get(key), fingerprint: baselineReal.get(key).fingerprint });
        return forced;
      }
      return real;
    };

    const { scannedKeys } = await applyBothPaths(pool, {
      baselineHeaderRows: baselineHeaders, baselineLineRows: baselineLines,
      currentHeaderRows: currentHeaders, currentLineRows: currentLines,
      scanFn: lyingScanFn,
    });

    const key = scannedKeys[0];
    const full = await fetchRow(pool, "full_sync_state", key);
    const delta = await fetchRow(pool, "delta_state", key);
    // Because the scanner lied and classified this as "unchanged", the
    // Delta path never resent it — delta_state still holds the STALE
    // baseline content, while full_sync_state holds the real, changed
    // content. A real SQL-level mismatch, not a hypothetical one.
    assert.notEqual(delta, full, "the lying-fingerprint scenario must produce a real, SQL-fetched mismatch");
  });
});
