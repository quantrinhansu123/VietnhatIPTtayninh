import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const sqlFile = process.argv[2] || 'supabase-ma-san-pham-chi-tiet-delete.sql';
const sqlPath = path.join(process.cwd(), sqlFile);
const sql = fs.readFileSync(sqlPath, 'utf8');

function projectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || '';
}

function connectionCandidates(password) {
  const ref = projectRef();
  const custom = process.env.SUPABASE_DB_URL?.trim();
  if (custom) return [custom];
  if (!ref || !password) return [];

  return [
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
  ];
}

async function run() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password && !process.env.SUPABASE_DB_URL?.trim()) {
    console.error('Thiếu SUPABASE_DB_PASSWORD (hoặc SUPABASE_DB_URL) trong .env');
    console.error('Lấy mật khẩu: Supabase → Project Settings → Database → Database password');
    process.exit(1);
  }

  const candidates = connectionCandidates(password || '');
  let lastError = null;

  for (const connectionString of candidates) {
    const host = connectionString.replace(/:[^:@/]+@/, ':****@');
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      console.log(`Kết nối ${host} ...`);
      await client.connect();
      console.log(`Đang chạy ${sqlFile} ...`);
      await client.query(sql);
      console.log(`OK: ${sqlFile}`);
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`  Fail: ${error.message}`);
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  console.error('Không chạy được SQL:', lastError?.message || lastError);
  process.exit(1);
}

run();
