/**
 * Backup rồi purge bảng kho (nhap_kho / xuat_kho), giữ lại ngày + ca chỉ định.
 *
 * Giữ nguyên: ngay ∈ KEEP_DATES AND ca ∈ KEEP_SHIFTS
 *
 * Chạy:
 *   node scripts/backup-and-purge-nhap-kho.mjs
 *   node scripts/backup-and-purge-nhap-kho.mjs --apply
 *   $env:TABLE="xuat_kho"; $env:KEEP_DATES="2026-10-29"; node scripts/backup-and-purge-nhap-kho.mjs --apply
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ override: true });
dotenv.config({ path: '.env.local', override: false });

const APPLY = process.argv.includes('--apply');
const PAGE = 1000;
const TABLE = String(process.env.TABLE || 'nhap_kho').trim() || 'nhap_kho';
if (!['nhap_kho', 'xuat_kho'].includes(TABLE)) {
  console.error(`TABLE không hợp lệ: ${TABLE} (chỉ nhap_kho | xuat_kho)`);
  process.exit(1);
}

const khoUrl = process.env.SUPABASE_KHO_URL || process.env.NEXT_PUBLIC_SUPABASE_KHO_URL || '';
const khoKey =
  process.env.SUPABASE_KHO_SERVICE_KEY ||
  process.env.SUPABASE_KHO_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KHO_KEY ||
  '';

if (!khoUrl || !khoKey) {
  console.error('Thiếu SUPABASE_KHO_URL / SUPABASE_KHO_SERVICE_KEY (hoặc SUPABASE_KHO_KEY).');
  process.exit(1);
}

const supabase = createClient(khoUrl, khoKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function vietnamTodayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day') };
}

const today = vietnamTodayParts();
const KEEP_DATES = (process.env.KEEP_DATES || `${today.year}-${today.month}-28,${today.year}-${today.month}-29`)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const KEEP_SHIFTS = (process.env.KEEP_SHIFTS || '12C1,12C2')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function shouldKeep(row) {
  const ngay = String(row.ngay || '').slice(0, 10);
  const ca = String(row.ca || '').trim();
  return KEEP_DATES.includes(ngay) && KEEP_SHIFTS.includes(ca);
}

async function fetchAllRows() {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Đọc ${TABLE} thất bại: ${error.message}`);
    const batch = data || [];
    rows.push(...batch);
    console.log(`  Đã đọc ${rows.length} dòng...`);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function summarize(rows) {
  const byNgayCa = new Map();
  let keep = 0;
  let purge = 0;
  for (const row of rows) {
    const ngay = String(row.ngay || '').slice(0, 10) || '(null)';
    const ca = String(row.ca || '').trim() || '(null)';
    const key = `${ngay} | ${ca}`;
    byNgayCa.set(key, (byNgayCa.get(key) || 0) + 1);
    if (shouldKeep(row)) keep += 1;
    else purge += 1;
  }
  return { byNgayCa, keep, purge };
}

async function deleteByIds(ids) {
  // URL .in(id,...) dễ vượt giới hạn PostgREST nếu chunk lớn → xóa từng 80 id.
  const CHUNK = 80;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .in('id', chunk);
    if (error) throw new Error(`Xóa thất bại: ${error.message}`);
    deleted += count ?? chunk.length;
    console.log(`  Đã xóa ${deleted}/${ids.length} dòng...`);
  }
  return deleted;
}

/** Xóa theo điều kiện ngày/ca (ít request hơn, tránh URL quá dài). */
async function purgeByFilters() {
  let total = 0;

  const runDelete = async (label, build) => {
    // Lặp tới khi hết dòng khớp (Supabase có thể giới hạn số row/lần).
    for (let round = 1; round <= 50; round += 1) {
      let query = supabase.from(TABLE).delete({ count: 'exact' }).select('id');
      query = build(query);
      const { data, error, count } = await query;
      if (error) throw new Error(`${label}: ${error.message}`);
      const n = count ?? (data?.length || 0);
      if (n === 0) {
        console.log(`  ${label}: hết (round ${round - 1})`);
        break;
      }
      total += n;
      console.log(`  ${label}: +${n} (tổng ${total})`);
      if (n < PAGE) break;
    }
  };

  // 1) Không có ngày
  await runDelete('ngay IS NULL', q => q.is('ngay', null));

  // 2) Ngày trước khoảng KEEP
  const minKeep = [...KEEP_DATES].sort()[0];
  await runDelete(`ngay < ${minKeep}`, q => q.lt('ngay', minKeep));

  // 3) Ngày sau khoảng KEEP
  const maxKeep = [...KEEP_DATES].sort().at(-1);
  await runDelete(`ngay > ${maxKeep}`, q => q.gt('ngay', maxKeep));

  // 4) Trong ngày KEEP nhưng ca không thuộc KEEP (gồm ca null)
  for (const ngay of KEEP_DATES) {
    await runDelete(`${ngay} ca IS NULL`, q => q.eq('ngay', ngay).is('ca', null));
    // Xóa ca khác: lấy distinct rồi xóa từng ca, hoặc dùng not.in
    await runDelete(`${ngay} ca NOT IN KEEP`, q => q.eq('ngay', ngay).not('ca', 'in', `(${KEEP_SHIFTS.join(',')})`));
  }

  return total;
}

async function main() {
  console.log(`DB kho: ${khoUrl}`);
  console.log(`Bảng: ${TABLE}`);
  console.log(`Giữ nguyên: ngay ∈ [${KEEP_DATES.join(', ')}] AND ca ∈ [${KEEP_SHIFTS.join(', ')}]`);
  console.log(`Chế độ: ${APPLY ? 'APPLY (backup + xóa)' : 'DRY-RUN (thống kê + backup, không xóa)'}`);

  console.log(`\n1) Đọc toàn bộ ${TABLE}...`);
  const rows = await fetchAllRows();
  console.log(`Tổng dòng: ${rows.length}`);

  const { byNgayCa, keep, purge } = summarize(rows);
  console.log('\nThống kê theo Ngày | Ca:');
  [...byNgayCa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
    .forEach(([key, count]) => {
      const [ngay, ca] = key.split(' | ');
      const mark =
        KEEP_DATES.includes(ngay) && KEEP_SHIFTS.includes(ca) ? ' KEEP' : ' DELETE';
      console.log(`  ${key}: ${count}${mark}`);
    });
  console.log(`\nGiữ: ${keep} · Xóa: ${purge}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${TABLE}-full-${stamp}.json`);
  const metaPath = path.join(backupDir, `${TABLE}-full-${stamp}.meta.json`);

  console.log(`\n2) Ghi backup → ${backupPath}`);
  fs.writeFileSync(backupPath, JSON.stringify(rows, null, 0), 'utf8');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        source: khoUrl,
        table: TABLE,
        total: rows.length,
        keepDates: KEEP_DATES,
        keepShifts: KEEP_SHIFTS,
        keepCount: keep,
        purgeCount: purge,
        apply: APPLY
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`   Meta → ${metaPath}`);
  console.log(`   Kích thước backup: ${(fs.statSync(backupPath).size / 1024 / 1024).toFixed(2)} MB`);

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để xóa sau khi đã kiểm tra thống kê.');
    return;
  }

  console.log(`\n3) Xóa theo bộ lọc ngày/ca (ước lượng ${purge} dòng)...`);
  try {
    await purgeByFilters();
  } catch (filterErr) {
    console.warn(`Xóa theo filter lỗi (${filterErr.message}) — fallback xóa theo id nhỏ lô.`);
    const purgeIds = rows.filter(row => !shouldKeep(row)).map(row => row.id).filter(Boolean);
    await deleteByIds(purgeIds);
  }

  console.log('\n4) Kiểm tra lại...');
  const after = await fetchAllRows();
  const afterSummary = summarize(after);
  console.log(`Còn lại: ${after.length} (expect keep ≈ ${keep})`);
  console.log(`Trong đó khớp KEEP: ${afterSummary.keep}`);
  if (after.length !== keep || afterSummary.purge > 0) {
    console.warn('Còn dòng ngoài bộ KEEP — kiểm tra tay.');
  } else {
    console.log(`OK: chỉ còn dòng ${TABLE} khớp KEEP_DATES + KEEP_SHIFTS.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
