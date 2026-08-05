"use strict";

const path = require("path");

// Repo layout: e2e/ lives in SC-StockDay-Ordering; PaaSRTSM-project is a sibling.
const ORDER_WEB_REPO = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ORDER_WEB_REPO, "..");
// Repair-round override (candidate-only, never persisted): lets this test
// command point at a release-candidate backend worktree instead of the
// original sibling repo, without changing the default anyone else relies on.
const PAASRTSM_REPO = process.env.E2E_PAASRTSM_REPO || path.join(WORKSPACE_ROOT, "PaaSRTSM-project");

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
//
// UPDATED 2026-07-29 (see _ledger/claude.md CLAIM-C-033-update, PARTIAL, conceded):
// this list had silently stopped advancing at 035 while the real chain grew to
// 065 — `stockRequests.js`'s insertRequest needs `stock_requests.request_mode`
// from migration 037, so every stock-request submission in this harness 500'd.
// Added 036-040 (the stock-request-workflow cluster these specs actually
// exercise: response documents, request_mode, drafts — none depend on pgvector
// or out-of-band seed data, verified before adding). Fixing that surfaced a
// SECOND, previously-masked gap (exactly Codex's caution that the schema error
// could be hiding a downstream failure): stockRequests.js also reads/writes
// `ordering.stock_request_line_recommendations`, added by migration 048 — added
// 048+049 too (049 just drops legacy tables 048 superseded; harmless/required
// for a clean final schema). Everything else from 041 onward is explicitly
// deferred below, not silently omitted — see MIGRATION_CHAIN_INTENTIONALLY_EXCLUDED
// and migrationChainGuard.cjs, which now fails loudly (via
// migration-chain-guard.test.cjs) if a future migration falls into an
// undocumented gap the way 037 did.
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
  "migrations/036_expand_stock_request_response_documents.sql",
  "migrations/037_add_stock_request_mode.sql",
  "migrations/038_add_mobile_enrollment.sql",
  "migrations/039_add_ada_branch_prices.sql",
  "migrations/040_add_stock_request_drafts.sql",
  "migrations/048_add_stock_recommendation_metadata.sql",
  "migrations/049_drop_legacy_stock_recommendation_workflow.sql",
];

// Every migration NOT in MIGRATION_FILES, up to the real chain's current max,
// must be listed here with a reason — this is what migrationChainGuard.cjs
// checks (see migration-chain-guard.test.cjs's "REAL REPO" test). Add to
// MIGRATION_FILES instead of here whenever a spec starts needing one of these.
const MIGRATION_CHAIN_INTENTIONALLY_EXCLUDED = [
  12, 13, // pgvector/embeddings — no pgvector extension modeled in this harness
  25, // pgvector (product category embeddings)
  26, 27, 28, 29, 30, 31, // category/member/movement/supplier/ingredient data migrations needing out-of-band seed data
  41, 42, // sku taxonomy fields — not exercised by any current spec
  43, // video content studio — unrelated feature
  44, // taxonomy review status — not exercised by any current spec
  45, 46, // focus products — not exercised by any current spec
  47, // legacy stock-recommendation-workflow tables, superseded by 048's sidecar approach and
      // dropped again by 049 (which IS included) — 048 has no FK dependency on 047's tables
      // (verified 2026-07-29), so creating-then-dropping 047's tables would be pure waste.
  50, // stock_recommendation_snapshots — needed for future stock-recommendations E2E coverage (Phase C), not yet added
  51, // focus products branch targets — not exercised by any current spec
  52, 53, // ada.sales_headers indexes — perf-only, no schema the specs read
  54, 55, // focus product publication/branch-staff link — not exercised by any current spec
  56, // branch sales targets — not exercised by any current spec
  57, // product current stock — not exercised by any current spec
  58, // snapshot retention — not exercised by any current spec
  59, 60, // sync run datasets / CP4 async ingestion queue — needed if this harness ever tests CP4 sync, not yet
  61, 62, 63, 64, // focus products / customer preorders extensions — not exercised by any current spec
  65, // branch staff hire date — not exercised by any current spec
  66, // ada.branch_stock_current (WP3 Phase 1, dual-write only — see PaaSRTSM-project
      // migrations/066_add_ada_branch_stock_current.sql) — nothing reads from this table
      // yet, in this repo or any spec here; add it once a reader migrates to it.
  67, // branch-stock reconciliation evidence/worker queue — current browser specs do
      // not execute CP4 or reconciliation; its real-Postgres contract is covered in
      // PaaSRTSM-project's gated integration suite instead.
  68, // full-snapshot generation tracking columns (branch_stock_generation round,
      // _ledger/claude.md CLAIM-C-046/C-047/C-048) — same reason as 66/67: no browser
      // spec here reads generation/retirement state; covered by PaaSRTSM-project's
      // real-Postgres reconciliation suite.
  69, // ingest.branch_stock_retirements durable queue (generation remediation round,
      // _ledger/claude.md CLAIM-X-046/X-047, C-051/C-052/C-053) — same reason as 66-68.
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
  MIGRATION_CHAIN_INTENTIONALLY_EXCLUDED,
  USERS,
  RUNTIME_FILE,
};
