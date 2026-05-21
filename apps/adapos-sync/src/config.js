import dotenv from "dotenv";

dotenv.config();

// Parse "HOST\INSTANCE" into separate fields.
// mssql expects server (hostname only) + options.instanceName separately.
// If no backslash, instanceName is null and port is used directly.
function parseHost(raw) {
  const slash = raw.indexOf("\\");
  if (slash === -1) return { server: raw, instanceName: null };
  return { server: raw.slice(0, slash), instanceName: raw.slice(slash + 1) };
}

// CLI overrides: --dry-run, --execute, --branch=005, --datasets=transfers,transfer_lines
const args = process.argv.slice(2);
const cliDryRun   = args.includes("--dry-run") ? true : args.includes("--execute") ? false : null;
const cliBranch   = (args.find((a) => a.startsWith("--branch="))   ?? "").replace("--branch=",   "") || null;
const cliDatasets = (args.find((a) => a.startsWith("--datasets=")) ?? "").replace("--datasets=", "") || null;

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
  apiBaseUrl:  process.env.ADAPOS_SYNC_API_BASE_URL ?? "http://localhost:4000",
  dateCutoff:  process.env.ADAPOS_SYNC_DATE_CUTOFF  ?? new Date().toISOString().slice(0, 10),
  branchCode: cliBranch || process.env.ADAPOS_SYNC_BRANCH_CODE || "",
  datasets: ((cliDatasets || process.env.ADAPOS_SYNC_DATASETS || "products,sales,transfers,transfer_lines"))
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean),
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
