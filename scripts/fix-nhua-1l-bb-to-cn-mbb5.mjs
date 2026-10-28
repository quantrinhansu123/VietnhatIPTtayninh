/**
 * Đổi NHUA-1L-BB → NHUA-1L-CN trên thông số báo cáo
 * Máy MBB_5 · ngày 2026-10-26 · ca 12C1.
 *
 * Chạy: node scripts/fix-nhua-1l-bb-to-cn-mbb5.mjs
 * Dry:  node scripts/fix-nhua-1l-bb-to-cn-mbb5.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const DATE = '2026-10-26';
const CA = '12C1';
const MAY_CODE = 'MBB_5';
const MAY_NAME = 'MÁY BAO BÌ 5';
const FROM = 'NHUA-1L-BB';
const TO = 'NHUA-1L-CN';
const FROM_NAME = 'Hạt nhựa LDPE (1L) Chạy Bao Bì';
const TO_NAME = 'Hạt nhựa LDPE (1L)';

function replaceDeep(value) {
  if (value == null) return { value, changed: false };
  if (typeof value === 'string') {
    let next = value;
    if (next.includes(FROM)) next = next.split(FROM).join(TO);
    if (next.includes(FROM_NAME)) next = next.split(FROM_NAME).join(TO_NAME);
    // Tên có thể lệch dấu tổ hợp Unicode từ kho_nvl
    if (/h[aạ]t\s*nh[uư]a\s*ldpe\s*\(1l\)\s*ch[aạ]y\s*bao\s*b[iì]/i.test(next) && !next.includes(TO)) {
      next = TO_NAME;
    }
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const r = replaceDeep(item);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: out, changed };
  }
  if (typeof value === 'object') {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = replaceDeep(v);
      out[k] = r.value;
      if (r.changed) changed = true;
    }
    // Nếu là dòng NVL đã đổi mã BB→CN mà còn loai_vat_tu = bao_bi (sai vì tên cũ)
    if (
      changed &&
      typeof out.ma_nvl === 'string' &&
      out.ma_nvl === TO &&
      String(out.loai_vat_tu || '').toLowerCase() === 'bao_bi'
    ) {
      out.loai_vat_tu = 'nvl';
    }
    if (changed && typeof out.ten_nvl === 'string' && out.ma_nvl === TO && out.ten_nvl.includes('Bao Bì')) {
      out.ten_nvl = TO_NAME;
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

function client(url, key) {
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const main = client(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);
const ton = client(
  process.env.SUPABASE_TON_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_TON_SERVICE_KEY ||
    process.env.SUPABASE_TON_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY
);

if (!main) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

function matchesMay(row) {
  const code = String(row.ma_may || row.may || '').trim();
  const name = String(row.ten_may || row.may || row.ma_may || '').trim();
  return (
    code === MAY_CODE ||
    name === MAY_NAME ||
    name.toUpperCase().includes('BAO BÌ 5') ||
    name.toUpperCase().includes('BAO BI 5') ||
    code.toUpperCase() === 'MBB_5'
  );
}

async function updateJsonRows(db, label, table, idCol, jsonCols, rowFilter) {
  let q = db.from(table).select(`*`);
  q = rowFilter(q);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|PGRST205|Could not find/i.test(error.message)) {
      console.log(`  [${label}/${table}] bỏ qua (không tồn tại)`);
      return 0;
    }
    console.warn(`  [${label}/${table}]`, error.message);
    return 0;
  }
  let touched = 0;
  for (const row of data || []) {
    if (!matchesMay(row) && table !== 'bb_bao_cao_tinh_toan') {
      // bb đã lọc theo may trên query
    }
    if (table !== 'bb_bao_cao_tinh_toan' && !matchesMay(row)) continue;

    const patch = {};
    let changed = false;
    for (const col of jsonCols) {
      if (!(col in row)) continue;
      const r = replaceDeep(row[col]);
      if (r.changed) {
        patch[col] = r.value;
        changed = true;
      }
    }
    // text columns on same row
    for (const col of ['ma_nvl', 'ten_nvl', 'ten_vat_tu', 'ma_npl']) {
      if (!(col in row) || typeof row[col] !== 'string') continue;
      const r = replaceDeep(row[col]);
      if (r.changed) {
        patch[col] = r.value;
        changed = true;
      }
    }
    if (!changed) continue;
    touched += 1;
    console.log(
      `  [${label}/${table}] id=${row[idCol]} ngay=${row.ngay || row.ngay_tu || ''} ca=${row.ca || ''} may=${row.ma_may || row.may || ''} cols=${Object.keys(patch).join(',')}`
    );
    if (dryRun) continue;
    const { error: upErr } = await db.from(table).update(patch).eq(idCol, row[idCol]);
    if (upErr) console.warn(`    FAIL: ${upErr.message}`);
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có dòng cần đổi`);
  return touched;
}

async function updateTextTable(db, label, table, idCol, extraFilter) {
  let q = db.from(table).select('*').eq('ngay', DATE).eq('ca', CA).eq('ma_nvl', FROM);
  if (extraFilter) q = extraFilter(q);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|PGRST205|Could not find/i.test(error.message)) {
      console.log(`  [${label}/${table}] bỏ qua (không tồn tại)`);
      return 0;
    }
    // thử lọc không eq ma_nvl nếu cột khác
    console.warn(`  [${label}/${table}]`, error.message);
    return 0;
  }
  let touched = 0;
  for (const row of data || []) {
    if (!matchesMay(row)) continue;
    const patch = { ma_nvl: TO };
    if (typeof row.ten_nvl === 'string') patch.ten_nvl = TO_NAME;
    if (typeof row.ten_vat_tu === 'string') patch.ten_vat_tu = TO_NAME;
    touched += 1;
    console.log(`  [${label}/${table}] id=${row[idCol]} ma_nvl ${FROM}→${TO}`);
    if (dryRun) continue;
    const { error: upErr } = await db.from(table).update(patch).eq(idCol, row[idCol]);
    if (upErr) console.warn(`    FAIL: ${upErr.message}`);
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có dòng ${FROM}`);
  return touched;
}

async function mainRun() {
  console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'} ${FROM} → ${TO} | ${DATE} ${CA} ${MAY_CODE}`);

  let total = 0;

  // Tồn máy-NVL (DB ton)
  total += await updateJsonRows(
    ton || main,
    'ton',
    process.env.SUPABASE_MACHINE_NVL_REPORTS_TABLE || 'bao_cao_may_nvl_ton',
    'id',
    ['chi_tiet'],
    (q) => q.eq('ngay', DATE).eq('ca', CA).eq('ma_may', MAY_CODE)
  );

  // Snapshot tính toán
  total += await updateJsonRows(main, 'main', 'bb_bao_cao_tinh_toan', 'id', ['payload'], (q) =>
    q.eq('ngay_tu', DATE).eq('ngay_den', DATE).eq('ca', CA).eq('may', MAY_CODE)
  );

  // Phối trộn (đã CN nhưng quét phòng hờ)
  total += await updateJsonRows(main, 'main', 'bao_cao_phoi_tron', 'id', ['chi_tiet'], (q) =>
    q.eq('ngay', DATE).eq('ca', CA).eq('ma_may', MAY_CODE)
  );

  const textTables = [
    'du_lieu_xuat_kho',
    'bao_cao_du_lieu_ton_dau_ca',
    'du_lieu_trong_bao_cao_kiem_ton_cuoi_ca',
    'bao_cao_tieu_hao_nguyen_vat_lieu',
    'bao_cao_san_luong_nvl_dinh_muc',
    'du_lieu_trong_bao_cao_hang_loi_hong',
    'bao_cao_thanh_pham_dat_nhap_kho',
    'bao_cao_san_luong'
  ];
  for (const table of textTables) {
    total += await updateTextTable(main, 'main', table, 'id');
  }

  // bc_lsx jsonb
  total += await updateJsonRows(main, 'main', 'bc_lsx', 'id', ['dinh_muc_nvl', 'chi_tiet', 'payload'], (q) =>
    q.eq('ngay', DATE).eq('ca', CA)
  );

  console.log(`Xong. ${touchedLabel(total)} dòng ${dryRun ? '(dry-run)' : 'đã cập nhật'}.`);
}

function touchedLabel(n) {
  return String(n);
}

mainRun().catch((err) => {
  console.error(err);
  process.exit(1);
});
