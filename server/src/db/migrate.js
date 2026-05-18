import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const pool = getPool();
  const migrationsDir = path.resolve(__dirname, "../../db/migrations");
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Running migration ${file}`);
    await pool.query(sql);
  }
}

run()
  .then(async () => {
    console.log("Migrations completed.");
    await closePool();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error.message);
    await closePool();
    process.exit(1);
  });
