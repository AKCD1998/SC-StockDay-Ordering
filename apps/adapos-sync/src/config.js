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

// CLI overrides: --dry-run, --execute, --branch=005, --datasets=...
// Backfill: --date-from=YYYY-MM-DD --date-to=YYYY-MM-DD --lookback-days=N
const args = process.argv.slice(2);
const cliDryRun     = args.includes("--dry-run") ? true : args.includes("--execute") ? false : null;
const cliBranch     = (args.find((a) => a.startsWith("--branch="))        ?? "").replace("--branch=",        "") || null;
const cliDatasets   = (args.find((a) => a.startsWith("--datasets="))      ?? "").replace("--datasets=",      "") || null;
const cliDateFrom   = (args.find((a) => a.startsWith("--date-from="))     ?? "").replace("--date-from=",     "") || null;
const cliDateTo     = (args.find((a) => a.startsWith("--date-to="))       ?? "").replace("--date-to=",       "") || null;
const cliLookback   = (args.find((a) => a.startsWith("--lookback-days=")) ?? "").replace("--lookback-days=", "") || null;

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
  // Explicit backfill date range (overrides lookback when both are set).
  // Pass --date-from=YYYY-MM-DD --date-to=YYYY-MM-DD to backfill a specific window.
  dateFrom: cliDateFrom || process.env.SYNC_DATE_FROM || null,
  dateTo:   cliDateTo   || process.env.SYNC_DATE_TO   || null,
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
