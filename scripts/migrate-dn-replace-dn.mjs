/**
 * Đổi mọi mã chứa «ĐN» → «DN» trên các bảng Supabase (text + jsonb).
 * Chạy: node scripts/migrate-dn-replace-dn.mjs
 * Dry-run: node scripts/migrate-dn-replace-dn.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const FROM = 'ĐN';
const TO = 'DN';

function replaceDn(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value.includes(FROM) ? value.split(FROM).join(TO) : value;
  if (Array.isArray(value)) return value.map(replaceDn);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceDn(v);
    return out;
  }
  return value;
}

function jsonHasDn(value) {
  try {
    return JSON.stringify(value).includes(FROM);
  } catch {
    return false;
  }
}

const mainUrl = process.env.SUPABASE_URL;
const mainKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const weighUrl = process.env.SUPABASE_WEIGHING_URL;
const weighKey =
  process.env.SUPABASE_WEIGHING_SERVICE_KEY ||
  process.env.SUPABASE_WEIGHING_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!mainUrl || !mainKey) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const main = createClient(mainUrl, mainKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const weigh =
  weighUrl && weighKey
    ? createClient(weighUrl, weighKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

/** Text code columns: table → { id?, cols[] } */
const TEXT_TARGETS = [
  { table: 'kho_nvl', id: 'id', cols: ['ma_npl'] },
  { table: 'import_sp', id: 'id', cols: ['ma_nvl'] },
  { table: 'phieu_xuat_nhap_kho', id: 'id', cols: ['ma_npl'] },
  { table: 'kiem_kho', id: 'id', cols: ['ma_nvl'] },
  { table: 'kiem_kho_tong_hop', id: 'id', cols: ['ma_nvl'] },
  { table: 'bao_cao_hang_hong', id: 'id', cols: ['ma_vat_tu'] },
  { table: 'ma_qr_nvl', id: 'id', cols: ['ma_npl_goc', 'ma_qr'] },
  { table: 'bao_cao_san_luong', id: 'id', cols: ['ma_nvl'] },
  { table: 'bao_cao_san_luong_nvl_dinh_muc', id: 'id', cols: ['ma_nvl'] },
  { table: 'bao_cao_tieu_hao_nguyen_vat_lieu', id: 'id', cols: ['ma_nvl'] },
  { table: 'bao_cao_du_lieu_ton_dau_ca', id: 'id', cols: ['ma_nvl'] },
  { table: 'du_lieu_xuat_kho', id: 'id', cols: ['ma_nvl'] },
  { table: 'du_lieu_trong_bao_cao_hang_loi_hong', id: 'id', cols: ['ma_nvl'] },
  { table: 'du_lieu_trong_bao_cao_kiem_ton_cuoi_ca', id: 'id', cols: ['ma_nvl'] },
  { table: 'bang_tron_vat_tu_dinh_muc', id: 'id', cols: ['ma_nvl'] },
  { table: 'bao_cao_thanh_pham_dat_nhap_kho', id: 'id', cols: ['ma_nvl'] }
];

/** JSONB columns that may embed ma_nvl / ma_npl */
const JSON_TARGETS = [
  { table: 'san_pham', id: 'id', cols: ['npl_phan_tram'] },
  { table: 'bao_cao_may_nvl_ton', id: 'id', cols: ['chi_tiet'] },
  { table: 'bao_cao_phoi_tron', id: 'id', cols: ['chi_tiet'] },
  { table: 'bang_tron_vat_tu_dinh_muc', id: 'id', cols: ['chi_tiet'] },
  { table: 'phieu_tron_thuc_te', id: 'id', cols: ['chi_tiet'] },
  { table: 'danh_sach_may', id: 'id', cols: ['ty_le_tron'] },
  { table: 'bc_lsx', id: 'id', cols: ['dinh_muc_nvl', 'chi_tiet', 'payload'] },
  { table: 'reports', id: 'id', cols: ['materials', 'payload', 'chi_tiet'] },
  { table: 'phieu_giao_ca', id: 'id', cols: ['chi_tiet'] },
  { table: 'bb_bao_cao_tinh_toan', id: 'id', cols: ['payload'] },
  { table: 'bao_cao_tong_hop', id: 'id', cols: ['payload', 'chi_tiet'] }
];

const WEIGH_TEXT_TARGETS = [
  { table: process.env.SUPABASE_CAN_TU_DONG_TABLE || 'can_tu_dong', id: 'id', cols: ['qr_code'] }
];

async function fetchAll(client, table, columns, filterCol) {
  const select = columns.join(',');
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = client.from(table).select(select).range(from, from + pageSize - 1);
    if (filterCol) q = q.like(filterCol, `%${FROM}%`);
    const { data, error } = await q;
    if (error) {
      if (/does not exist|PGRST205|Could not find/i.test(error.message)) {
        return { missing: true, rows: [] };
      }
      throw new Error(`${table}: ${error.message}`);
    }
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { missing: false, rows };
}

async function resolveKhoNvlConflict(client) {
  const { data, error } = await client.from('kho_nvl').select('id, ma_npl').or(`ma_npl.ilike.%${FROM}%,ma_npl.eq.DN`);
  if (error) {
    console.warn('  [kho_nvl] audit skip:', error.message);
    return;
  }
  const list = data || [];
  const dnRows = list.filter(r => String(r.ma_npl || '').toUpperCase() === 'DN');
  const dnAccentRows = list.filter(r => String(r.ma_npl || '').includes(FROM));
  if (dnAccentRows.length === 0) return;
  if (dnRows.length > 0 && dnAccentRows.some(r => String(r.ma_npl) === FROM || String(r.ma_npl).toUpperCase() === FROM)) {
    console.log(
      `  [kho_nvl] Đã có mã DN — sẽ đổi ĐN* → DN* ; nếu trùng khóa UNIQUE sẽ ghi log (dryRun=${dryRun})`
    );
  }
}

async function migrateTextTable(client, target, label) {
  const { table, id, cols } = target;
  let touched = 0;
  for (const col of cols) {
    let result;
    try {
      result = await fetchAll(client, table, [id, col], col);
    } catch (err) {
      console.warn(`  [${label}/${table}.${col}]`, err.message);
      continue;
    }
    if (result.missing) {
      console.log(`  [${label}/${table}] bỏ qua (không tồn tại)`);
      return;
    }
    for (const row of result.rows) {
      const oldVal = row[col];
      if (typeof oldVal !== 'string' || !oldVal.includes(FROM)) continue;
      const newVal = replaceDn(oldVal);
      if (newVal === oldVal) continue;
      touched += 1;
      console.log(`  [${label}/${table}] ${col}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
      if (dryRun) continue;
      const { error } = await client
        .from(table)
        .update({ [col]: newVal })
        .eq(id, row[id]);
      if (error) {
        console.warn(`    FAIL id=${row[id]}: ${error.message}`);
      }
    }
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có ${FROM} trong cột text`);
  return touched;
}

async function migrateJsonTable(client, target, label) {
  const { table, id, cols } = target;
  // Load all rows that might contain ĐN — filter via or on cast is hard; page all and check
  const selectCols = [id, ...cols];
  let result;
  try {
    // Prefer text search via filter on first jsonb as string isn't supported; fetch pages
    const pageSize = 500;
    let from = 0;
    const rows = [];
    for (;;) {
      const { data, error } = await client
        .from(table)
        .select(selectCols.join(','))
        .range(from, from + pageSize - 1);
      if (error) {
        if (/does not exist|PGRST205|Could not find/i.test(error.message)) {
          console.log(`  [${label}/${table}] bỏ qua (không tồn tại)`);
          return 0;
        }
        // Some cols may not exist — try id only + known cols one by one later
        throw new Error(error.message);
      }
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    result = rows;
  } catch (err) {
    console.warn(`  [${label}/${table}]`, err.message);
    return 0;
  }

  let touched = 0;
  for (const row of result) {
    const patch = {};
    for (const col of cols) {
      if (!(col in row) || row[col] == null) continue;
      if (!jsonHasDn(row[col])) continue;
      patch[col] = replaceDn(row[col]);
    }
    if (Object.keys(patch).length === 0) continue;
    touched += 1;
    console.log(`  [${label}/${table}] id=${row[id]} jsonb cols: ${Object.keys(patch).join(', ')}`);
    if (dryRun) continue;
    const { error } = await client.from(table).update(patch).eq(id, row[id]);
    if (error) console.warn(`    FAIL id=${row[id]}: ${error.message}`);
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có ${FROM} trong jsonb`);
  return touched;
}

async function run() {
  console.log(dryRun ? '=== DRY RUN (không ghi DB) ===' : '=== MIGRATE ĐN → DN ===');

  console.log('\n[main] kho_nvl conflict check');
  await resolveKhoNvlConflict(main);

  let total = 0;
  console.log('\n[main] text columns');
  for (const t of TEXT_TARGETS) {
    total += (await migrateTextTable(main, t, 'main')) || 0;
  }

  console.log('\n[main] jsonb columns');
  for (const t of JSON_TARGETS) {
    total += (await migrateJsonTable(main, t, 'main')) || 0;
  }

  if (weigh) {
    console.log('\n[weighing] text columns');
    for (const t of WEIGH_TEXT_TARGETS) {
      total += (await migrateTextTable(weigh, t, 'weigh')) || 0;
    }
  } else {
    console.log('\n[weighing] bỏ qua (thiếu URL/key)');
  }

  console.log(`\nXong. Số dòng/ô chạm: ${total}${dryRun ? ' (dry-run)' : ''}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
