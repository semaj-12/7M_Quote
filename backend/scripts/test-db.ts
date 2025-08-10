import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { Pool } from 'pg';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  try {
    const cs = process.env.DATABASE_URL;
    if (!cs) {
      throw new Error("DATABASE_URL is missing (expected in backend/.env).");
    }

    const pool = new Pool({
      connectionString: cs,
      ...(cs.includes('sslmode=require') ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    const r = await pool.query('select current_database() as db, version() as v');
    console.log('✅ Connected to:', r.rows[0].db);
    console.log('🛠  Postgres version:', r.rows[0].v.split(' on ')[0]);

    await pool.end();
  } catch (e) {
    console.error('❌ DB test failed:', e);
    process.exit(1);
  }
})();
