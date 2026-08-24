import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'apply';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv(join(root, '.env'));
const sql = readFileSync(join(root, 'supabase-import-sp.sql'), 'utf8');

const dbUrl =
  env.DATABASE_URL ||
  env.SUPABASE_DB_URL ||
  env.SUPABASE_DATABASE_URL ||
  env.DIRECT_URL ||
  env.POSTGRES_URL ||
  env.POSTGRES_CONNECTION_STRING;

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

async function probe() {
  if (!url || !key) {
    console.error('MISSING_CREDS');
    process.exit(2);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('import_sp')
    .select('id,ma_sp,ma_nvl,loai,gia_tri,dvt,khoi_luong_kg,batch_id,trang_thai')
    .limit(3);
  if (error) {
    console.log('TABLE_MISSING_OR_COLS', error.message);
    process.exit(3);
  }
  console.log('TABLE_OK', JSON.stringify(data));
  process.exit(0);
}

if (mode === 'probe') {
  await probe();
}

if (mode === 'smoke') {
  if (!url || !key) {
    console.error('MISSING_CREDS');
    process.exit(2);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const row = {
    ma_sp: 'MT- MN002',
    ma_nvl: 'BDT',
    loai: 'Số lượng',
    gia_tri: 0.0085,
    dvt: 'Kg',
    khoi_luong_kg: 0.0085,
    so_luong: 0,
    file_name: 'smoke-test',
    trang_thai: 'moi'
  };
  const { data, error } = await supabase.from('import_sp').insert(row).select('id,ma_sp,ma_nvl,gia_tri,khoi_luong_kg').single();
  if (error) {
    console.log('INSERT_FAIL', error.message);
    process.exit(4);
  }
  console.log('INSERT_OK', JSON.stringify(data));
  const { error: delErr } = await supabase.from('import_sp').delete().eq('id', data.id);
  if (delErr) {
    console.log('DELETE_FAIL', delErr.message);
    process.exit(5);
  }
  console.log('DELETE_OK');
  process.exit(0);
}

if (dbUrl) {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('PG_OK created/ensured public.import_sp');
  } finally {
    await client.end();
  }
  await probe();
}

console.error(
  'NO_DB_URL: thêm DATABASE_URL (connection string Postgres) vào .env rồi chạy lại,\n' +
    'hoặc mở Supabase → SQL Editor → paste file supabase-import-sp.sql → Run.'
);
await probe();
