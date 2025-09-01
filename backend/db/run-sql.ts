// backend/db/run-sql.ts
import "dotenv/config";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

function ensureDbUrl() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is not set. Add it to your .env (Neon connection string).");
    process.exit(1);
  }
}
ensureDbUrl();

const isNeon = (process.env.DATABASE_URL || "").includes("neon.tech");

async function main() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error("Usage: tsx backend/db/run-sql.ts <path-to-sql>");
    process.exit(1);
  }
  const sqlPath = path.resolve(sqlFile);
  const sql = fs.readFileSync(sqlPath, "utf8");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Ran SQL:", sqlPath);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to run SQL:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
