import dotenv from "dotenv";

dotenv.config();

// Parse "HOST\INSTANCE" into separate fields.
// mssql expects server (hostname only) + options.instanceName separately.
// If no backslash, instanceName is null and port is used directly.
function parseHost(raw) {
  const slash = raw.indexOf("\\");
  const normalizeLocalHost = (server) =>
    server === "." || server.toLowerCase() === "(local)" ? "localhost" : server;
  if (slash === -1) return { server: normalizeLocalHost(raw), instanceName: null };
  return { server: normalizeLocalHost(raw.slice(0, slash)), instanceName: raw.slice(slash + 1) };
}

function parsePositiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// CLI overrides: --dry-run, --execute, --branch=005, --datasets=...
// Backfill: --date-from=YYYY-MM-DD --date-to=YYYY-MM-DD --lookback-days=N
const args = process.argv.slice(2);
const cliDryRun     = args.includes("--dry-run") ? true : args.includes("--execute") ? false : null;
const cliBranch     = (args.find((a) => a.startsWith("--branch="))        ?? "").replace("--branch=",        "") || null;
const cliDatasets   = (args.find((a) => a.startsWith("--datasets="))      ?? "").replace("--datasets=",      "") || null;
const cliDateFrom   = (args.find((a) => a.startsWith("--date-from="))     ?? "").replace("--date-from=",     "") || null;
const cliDateTo     = (args.find((a) => a.startsWith("--date-to="))       ?? "").replace("--date-to=",       "") || null;
const cliLookback   = (args.find((a) => a.startsWith("--lookback-days=")) ?? "").replace("--lookback-days=", "") || null;
const cliSkipIfSyncedToday = args.includes("--skip-if-synced-today");

const { server, instanceName } = parseHost(process.env.ADAPOS_SQLSERVER_HOST ?? "");

export const syncConfig = {
  sqlServerHost:         server,
  sqlServerInstanceName: instanceName,
  sqlServerPort:         Number(process.env.ADAPOS_SQLSERVER_PORT ?? 1433),
  sqlServerUser:     process.env.ADAPOS_SQLSERVER_USER_READONLY
                       ?? process.env.ADAPOS_SQLSERVER_USER ?? "",
  sqlServerPassword: process.env.ADAPOS_SQLSERVER_PASSWORD_READONLY
                       ?? process.env.ADAPOS_SQLSERVER_PASSWORD ?? "",
  sqlServerDatabase:     process.env.ADAPOS_SQLSERVER_DATABASE ?? "AdaAcc",
  intervalMinutes:       Number(process.env.ADAPOS_SYNC_INTERVAL_MINUTES ?? 10),
  dryRun:  cliDryRun !== null
             ? cliDryRun
             : String(process.env.ADAPOS_SYNC_DRY_RUN ?? "true") === "true",
  apiBaseUrl:       process.env.ADAPOS_SYNC_API_BASE_URL ?? "http://localhost:4000",
  syncSharedToken:
    process.env.ADAPOS_SYNC_SHARED_TOKEN
    ?? process.env.BRANCH_STOCK_SYNC_TOKEN
    ?? "",
  dateCutoff:  process.env.ADAPOS_SYNC_DATE_CUTOFF  ?? new Date().toISOString().slice(0, 10),
  branchCode: cliBranch || process.env.ADAPOS_SYNC_BRANCH_CODE || "",
  // price_defaults / branch_price_overrides are HQ-only (consolidated all-branch DB).
  // They are recognised here so a bare run can include them; the scheduled HQ run
  // enables them via ADAPOS_SYNC_DATASETS in .env.
  datasets: ((cliDatasets || process.env.ADAPOS_SYNC_DATASETS || "products,sales,transfers,transfer_lines,price_defaults,branch_price_overrides"))
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean),
  // Approved receipts window — default 14 days so missed-day syncs self-heal.
  // Override with --lookback-days=N or env APPROVED_RECEIPTS_LOOKBACK_DAYS.
  approvedReceiptsLookbackDays: Number(cliLookback || process.env.APPROVED_RECEIPTS_LOOKBACK_DAYS || 14),
  // sales_detail routine window — deliberately small. This dataset runs every
  // ADAPOS_SYNC_INTERVAL_MINUTES (default every 10 min), so re-scanning a full
  // 30-day window (like the sales-summary dataset does) on every run would
  // re-post the same historical bills over and over for no reason. 7 days is
  // enough to self-heal a missed run (e.g. laptop off over a weekend) without
  // the routine cost of a full month. Historical backfill for older ranges
  // (e.g. a specific past month) uses --date-from/--date-to instead, as a
  // one-off run — not this rolling window.
  salesDetailLookbackDays: Number(process.env.SALES_DETAIL_LOOKBACK_DAYS || 7),
  productBatchSize: parsePositiveInteger(process.env.ADAPOS_SYNC_PRODUCT_BATCH_SIZE, 100),
  // /api/sync/ada/sales has the same one-transaction-per-request shape as
  // products, but the client never chunked it — a busy branch's whole day of
  // sales_detail goes in a single request. Bound it by document count (a
  // header + its lines always stay together) so one branch's big sales day
  // can't build a request that outruns the client timeout before the backend
  // transaction commits.
  salesDetailChunkDocs: parsePositiveInteger(process.env.ADAPOS_SYNC_SALES_DETAIL_CHUNK_DOCS, 150),
  // /api/sync/ada/transfers has the identical one-transaction-per-request
  // shape (found 2026-07-15 after sales_detail's chunking fix let branch 003
  // progress further and hit this as the next bottleneck). Transfer docs
  // run far more lines/header than sales (observed ~10.5 vs ~2), so this
  // gets its own, smaller default rather than reusing salesDetailChunkDocs —
  // 150 transfer headers can still mean 1500+ lines in one transaction.
  transferChunkDocs: parsePositiveInteger(process.env.ADAPOS_SYNC_TRANSFER_CHUNK_DOCS, 30),
  // Explicit backfill date range (overrides lookback when both are set).
  // Pass --date-from=YYYY-MM-DD --date-to=YYYY-MM-DD to backfill a specific window.
  dateFrom: cliDateFrom || process.env.SYNC_DATE_FROM || null,
  dateTo:   cliDateTo   || process.env.SYNC_DATE_TO   || null,
  // Evening health-check mode: pass --skip-if-synced-today (or env
  // ADAPOS_SYNC_SKIP_IF_SYNCED_TODAY=true) on the 19:20 Task Scheduler entry only,
  // not the 08:20 one. Before touching AdaAcc, the agent asks the backend whether
  // a branch_stock_history run already succeeded today; if so it sends a
  // heartbeat and exits without a full resync (today's stock numbers won't have
  // changed anyway — see docs on why AdaPos only recomputes them once/morning).
  // If the check fails or says "not yet", it falls through to a normal full run,
  // which self-heals a missed morning sync.
  skipIfSyncedToday: cliSkipIfSyncedToday || String(process.env.ADAPOS_SYNC_SKIP_IF_SYNCED_TODAY ?? "false") === "true",
};

// ── Safety guards ─────────────────────────────────────────────────────────────

if (!syncConfig.branchCode) {
  console.error("ERROR: Branch code required. Set ADAPOS_SYNC_BRANCH_CODE in .env or pass --branch=XXX");
  process.exit(1);
}

// Block ALL SQL connections when user=sa — including dry-run.
// Create readonly_pilot in SSMS first, then update .env.
if (syncConfig.sqlServerUser.toLowerCase() === "sa") {
  console.error("ERROR: Connections using 'sa' are blocked for all modes.");
  console.error("       Create readonly_pilot in SSMS, update .env, then retry.");
  process.exit(1);
}
