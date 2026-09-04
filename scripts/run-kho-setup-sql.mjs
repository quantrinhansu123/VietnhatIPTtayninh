import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const files = [
  'supabase-bo-sung-kho-hang-hoa-cong-cu-gia-cong.sql',
  'supabase-bao-cao-hang-hong-cho-thu-kho-duyet.sql',
  'supabase-bao-cao-san-luong-cho-nhap-kho.sql'
];

function projectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || '';
}

function connectionCandidates(password) {
  const ref = projectRef();
  if (!ref || !password) return [];

  const custom = process.env.SUPABASE_DB_URL?.trim();
  if (custom) return [custom];

  return [
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
  ];
}

async function connect(password) {
  const candidates = connectionCandidates(password);
  let lastError = null;

  for (const connectionString of candidates) {
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  throw lastError || new Error('Không thể kết nối Supabase.');
}

async function run() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) {
    console.error('Thiếu SUPABASE_DB_PASSWORD trong .env');
    console.error('Lấy mật khẩu tại Supabase → Project Settings → Database → Database password');
    console.error('Hoặc chạy thủ công từng file .sql sau trong Supabase SQL Editor:');
    files.forEach(file => console.error(`  - ${file}`));
    process.exit(1);
  }

  const client = await connect(password);

  try {
    for (const file of files) {
      const sqlPath = path.join(process.cwd(), file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      console.log(`Đang chạy ${file} ...`);
      await client.query(sql);
      console.log(`  OK: ${file}`);
    }
    console.log('Đã chạy xong toàn bộ SQL setup kho.');
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error('Lỗi khi chạy migration:', error?.message || error);
  process.exit(1);
});
