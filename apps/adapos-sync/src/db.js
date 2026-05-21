import sql from "mssql";
import { syncConfig } from "./config.js";

const poolConfig = {
  server: syncConfig.sqlServerHost,
  port: syncConfig.sqlServerPort,
  user: syncConfig.sqlServerUser,
  password: syncConfig.sqlServerPassword,
  database: syncConfig.sqlServerDatabase,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: syncConfig.sqlServerHost.includes("\\")
      ? syncConfig.sqlServerHost.split("\\")[1]
      : undefined,
  },
};

// Use plain host when instance name is specified (mssql resolves the port via browser service)
if (poolConfig.options.instanceName) {
  poolConfig.server = syncConfig.sqlServerHost.split("\\")[0];
  poolConfig.port = undefined;
}

let pool = null;

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(poolConfig);
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

export { sql };
