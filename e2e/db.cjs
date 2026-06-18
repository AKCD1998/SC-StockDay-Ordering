"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Client } = require("pg");
const cfg = require("./config.cjs");

function pgExe(name) {
  return path.join(cfg.PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
}

// All external commands get a hard timeout so a wedged pg_ctl can never block the
// Node event loop (execFileSync is synchronous).
function run(exe, args, opts = {}) {
  return execFileSync(exe, args, { stdio: "pipe", encoding: "utf8", timeout: 30000, ...opts });
}

function portAccepting() {
  try {
    run(pgExe("pg_isready"), ["-p", String(cfg.PG_PORT), "-t", "3"]);
    return true;
  } catch (_error) {
    return false;
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait; only used briefly during cluster startup polling
  }
}

async function ensureCluster() {
  // Reuse an already-running cluster on the port (avoids racy stop/start churn).
  if (portAccepting()) {
    return;
  }

  if (!fs.existsSync(path.join(cfg.PG_DATA, "PG_VERSION"))) {
    fs.mkdirSync(cfg.PG_DATA, { recursive: true });
    run(pgExe("initdb"), ["-U", "postgres", "-A", "trust", "-D", cfg.PG_DATA, "--encoding=UTF8"]);
  }

  // Clear a stale pid left by an immediate/aborted shutdown.
  const pidFile = path.join(cfg.PG_DATA, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      fs.rmSync(pidFile);
    } catch (_error) {
      // ignore
    }
  }

  const logFile = path.join(cfg.PG_DATA, "startup.log");
  // Start without -w (which can block); poll readiness ourselves.
  run(pgExe("pg_ctl"), ["-D", cfg.PG_DATA, "-o", `-p ${cfg.PG_PORT}`, "-l", logFile, "start"]);

  for (let i = 0; i < 20; i += 1) {
    if (portAccepting()) {
      return;
    }
    sleepSync(500);
  }
  throw new Error(`[e2e:db] cluster did not accept connections on port ${cfg.PG_PORT}`);
}

function stopCluster() {
  if (!portAccepting()) {
    return;
  }
  try {
    run(pgExe("pg_ctl"), ["-D", cfg.PG_DATA, "-m", "fast", "-w", "-t", "20", "stop"]);
  } catch (_error) {
    // best effort
  }
}

async function withClient(connectionString, fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function recreateDatabase() {
  await withClient(cfg.PG_SUPERURL, async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [cfg.PG_DB],
    );
    await client.query(`DROP DATABASE IF EXISTS ${cfg.PG_DB}`);
    await client.query(`CREATE DATABASE ${cfg.PG_DB}`);
  });
}

async function applySchema() {
  await withClient(cfg.PG_DBURL, async (client) => {
    for (const relative of cfg.MIGRATION_FILES) {
      let sql = fs.readFileSync(path.join(cfg.PAASRTSM_REPO, relative), "utf8");
      if (sql.charCodeAt(0) === 0xfeff) {
        sql = sql.slice(1);
      }
      await client.query(sql);
    }
  });
}

async function seed() {
  await withClient(cfg.PG_DBURL, async (client) => {
    await client.query(`
      INSERT INTO core.branches (branch_code, branch_name, is_hq, is_active) VALUES
        ('000','สำนักงานใหญ่',true,true),
        ('001','สาขา 001',false,true),
        ('003','สาขา 003',false,true)
      ON CONFLICT (branch_code) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO public.items (item_id, generic_name, display_name) OVERRIDING SYSTEM VALUE VALUES
        (1,'Cetirizine','เซทิริซีน'),(2,'Loratadine','ลอราทาดีน'),(3,'Vitamin C','วิตามินซี')
      ON CONFLICT (item_id) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO public.skus (item_id, company_code, qty_in_base, enrichment_status, updated_at) VALUES
        (1,'630010001',1,'missing',now()),
        (2,'630010002',1,'missing',now()),
        (3,'630010003',1,'missing',now())
      ON CONFLICT (company_code) DO NOTHING;
    `);
    await client.query(`
      INSERT INTO ada.branch_stock_snapshots
        (product_code, product_name_thai, product_name_eng, barcode, unit,
         qty_branch_000, qty_branch_001, qty_branch_003, qty_total_all_branches, synced_at, source_synced_at) VALUES
        ('630010001','เซทิริซีน','Cetirizine','885000000001','ขวด',12,0,5,17,now(),now()),
        ('630010002','ลอราทาดีน','Loratadine','885000000002','กล่อง',6,1,3,10,now(),now()),
        ('630010003','วิตามินซี','Vitamin C','885000000003','ขวด',2,0,8,10,now(),now())
      ON CONFLICT (product_code) DO NOTHING;
    `);
  });
}

async function provisionDatabase() {
  console.log("[e2e:db] ensureCluster...");
  await ensureCluster();
  console.log("[e2e:db] recreateDatabase...");
  await recreateDatabase();
  console.log("[e2e:db] applySchema...");
  await applySchema();
  console.log("[e2e:db] seed...");
  await seed();
  console.log("[e2e:db] done");
}

// Truncate all workflow tables so each E2E scenario starts from a clean slate
// (the cluster/schema persist across tests for speed).
async function resetOrderingData() {
  await withClient(cfg.PG_DBURL, async (client) => {
    await client.query(`
      TRUNCATE
        ordering.stock_request_batches,
        ordering.stock_requests,
        ordering.stock_request_lines,
        ordering.stock_request_line_responses,
        ordering.stock_request_events,
        ordering.stock_request_notifications,
        ordering.stock_request_documents,
        ordering.stock_request_shipments,
        ordering.stock_request_shipment_lines,
        ordering.stock_request_receipts,
        ordering.stock_request_receipt_lines
      RESTART IDENTITY CASCADE;
    `);
  });
}

module.exports = { provisionDatabase, stopCluster, resetOrderingData };

