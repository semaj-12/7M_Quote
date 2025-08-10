// backend/services/db.ts
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";

// Load backend/.env here so env exists at import-time
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATABASE_URL: string | undefined = process.env.DATABASE_URL || undefined;

// Export a simple flag other modules can check
export const hasDb = !!DATABASE_URL;

// Export a nullable pool so imports don’t crash in no‑DB mode
export let pool: Pool | null = null;

if (hasDb) {
  pool = new Pool({ connectionString: DATABASE_URL });
}

// Helper for modules that require a DB (and should fail fast if missing)
export function requireDb() {
  if (!hasDb || !pool) {
    throw new Error("Database is not configured (DATABASE_URL not set).");
  }
  return { pool };
}
