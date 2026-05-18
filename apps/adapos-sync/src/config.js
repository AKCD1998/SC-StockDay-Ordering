import dotenv from "dotenv";

dotenv.config();

export const syncConfig = {
  sqlServerHost: process.env.ADAPOS_SQLSERVER_HOST || "",
  sqlServerPort: Number(process.env.ADAPOS_SQLSERVER_PORT || 1433),
  sqlServerUser: process.env.ADAPOS_SQLSERVER_USER || "",
  sqlServerPassword: process.env.ADAPOS_SQLSERVER_PASSWORD || "",
  sqlServerDatabase: process.env.ADAPOS_SQLSERVER_DATABASE || "AdaAcc",
  intervalMinutes: Number(process.env.ADAPOS_SYNC_INTERVAL_MINUTES || 10),
  dryRun: String(process.env.ADAPOS_SYNC_DRY_RUN || "true") === "true",
  apiBaseUrl: process.env.ADAPOS_SYNC_API_BASE_URL || "http://localhost:4000",
  dateCutoff: process.env.ADAPOS_SYNC_DATE_CUTOFF || new Date().toISOString().slice(0, 10),
};
