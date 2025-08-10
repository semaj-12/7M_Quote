import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { Pool } from 'pg';

// ESM-safe __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend/.env
config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL is missing (expected in backend/.env)');

  const pool = new Pool({
    connectionString: cs,
    ...(cs.includes('sslmode=require') ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  const sql = `
  -- Ensure table exists (start minimal to avoid conflicts)
  create table if not exists public.drawings (
    id bigserial primary key
  );

  -- Add all columns your createDrawing() inserts into
  alter table public.drawings add column if not exists user_id bigint;
  alter table public.drawings add column if not exists name text;
  alter table public.drawings add column if not exists original_name text;
  alter table public.drawings add column if not exists file_path text;
  alter table public.drawings add column if not exists file_size bigint;
  alter table public.drawings add column if not exists status text default 'uploaded';
  alter table public.drawings add column if not exists s3_key text;
  alter table public.drawings add column if not exists s3_url text;
  alter table public.drawings add column if not exists storage_type text;
  alter table public.drawings add column if not exists created_at timestamptz not null default now();
  alter table public.drawings add column if not exists updated_at timestamptz;

  create index if not exists idx_drawings_s3_key on public.drawings (s3_key);
`;


  await pool.query(sql);
  console.log('✅ DB initialized: drawings table ready.');
  await pool.end();
}

main().catch((e) => {
  console.error('❌ Init failed:', e);
  process.exit(1);
});
