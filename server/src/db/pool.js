import { Pool } from "pg";
import { config } from "../config.js";

let pool;

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required when DATA_MODE=postgres.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
