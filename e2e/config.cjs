"use strict";

const path = require("path");

// Repo layout: e2e/ lives in SC-StockDay-Ordering; PaaSRTSM-project is a sibling.
const ORDER_WEB_REPO = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ORDER_WEB_REPO, "..");
const PAASRTSM_REPO = path.join(WORKSPACE_ROOT, "PaaSRTSM-project");

const PG_BIN = process.env.E2E_PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const PG_PORT = Number(process.env.E2E_PG_PORT || 55432);
const PG_DATA = process.env.E2E_PG_DATA || path.join(require("os").tmpdir(), "sc_e2e_pgdata");
const PG_DB = "stockday_e2e";
const PG_SUPERURL = `postgresql://postgres@localhost:${PG_PORT}/postgres`;
const PG_DBURL = `postgresql://postgres@localhost:${PG_PORT}/${PG_DB}`;

const API_PORT = Number(process.env.E2E_API_PORT || 3001);
const API_BASE = `http://localhost:${API_PORT}`;
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 4174);
const WEB_BASE = `http://localhost:${WEB_PORT}`;

// Migrations to apply against the throwaway cluster: the real chain up to what the
// stock-request flows need, skipping pgvector migrations (012/013/025) and the
// category/data migrations (026-031) that depend on out-of-band seed data.
const MIGRATION_FILES = [
  "001_inventory_schema.sql", // lives at repo root, not migrations/
  "migrations/002_add_sku_price_tiers.sql",
  "migrations/003_add_product_fields.sql",
  "migrations/004_add_enrichment_workflow.sql",
  "migrations/005_add_sales_daily.sql",
  "migrations/010_add_audit_logs.sql",
  "migrations/011_add_sku_unit_prices.sql",
  "migrations/014_add_shared_ordering_and_sync.sql",
  "migrations/015_add_ada_raw_ingestion.sql",
  "migrations/016_add_ada_foundation_derivations.sql",
  "migrations/017_add_ada_analytics_derivations.sql",
  "migrations/018_add_ada_standard_analytics_windows.sql",
  "migrations/019_add_transfer_reconciliation_foundation.sql",
  "migrations/020_add_admin_receipt_staging.sql",
  "migrations/020_add_product_category_states.sql",
  "migrations/021_seed_core_branches_from_ada.sql",
  "migrations/022_add_ada_branch_stock_snapshots.sql",
  "migrations/023_add_ada_branch_stock_uploads.sql",
  "migrations/024_add_branch_sync_log.sql",
  "migrations/032_add_branch_stock_cost_columns.sql",
  "migrations/033_add_stock_request_workflow.sql",
  "migrations/034_add_stock_request_fulfillment.sql",
  "migrations/035_allow_branch_audit_role.sql",
];

// Branch users exercised by the scenarios (config-backed auth, WP-00).
const USERS = {
  admin: { username: "admin@example.com", password: "admin-pass-123" },
  branch000: { username: "branch000@example.com", password: "branch-pass-000", branch: "000" },
  branch001: { username: "branch001@example.com", password: "branch-pass-001", branch: "001" },
  branch003: { username: "branch003@example.com", password: "branch-pass-003", branch: "003" },
};

const RUNTIME_FILE = path.join(__dirname, ".runtime.json");

module.exports = {
  ORDER_WEB_REPO,
  PAASRTSM_REPO,
  PG_BIN,
  PG_PORT,
  PG_DATA,
  PG_DB,
  PG_SUPERURL,
  PG_DBURL,
  API_PORT,
  API_BASE,
  WEB_PORT,
  WEB_BASE,
  MIGRATION_FILES,
  USERS,
  RUNTIME_FILE,
};
