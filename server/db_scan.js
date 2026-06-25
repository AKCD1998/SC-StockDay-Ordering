"use strict";
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://sc_drug_db_user:7s8SrRnOLxpjUa4kSOv5QdA3m6VfIWjV@dpg-d6apu9i4d50c73c7sas0-a.virginia-postgres.render.com/sc_drug_db",
  ssl: { rejectUnauthorized: false },
});

async function scan() {
  const client = await pool.connect();
  try {
    // 1. Show all tables so we know the schema
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log("=== TABLES ===");
    tables.rows.forEach((r) => console.log(r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}
scan().catch(console.error);
