/**
 * Đổi NHUA-1L-BB → NHUA-1L-CN trên toàn bộ DB (main + ton + kho).
 *
 * Chạy: node scripts/fix-nhua-1l-bb-to-cn-all.mjs
 * Dry:  node scripts/fix-nhua-1l-bb-to-cn-all.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const dryRun = process.argv.includes('--dry-run');
const FROM = 'NHUA-1L-BB';
const TO = 'NHUA-1L-CN';
const FROM_NAME = 'Hạt nhựa LDPE (1L) Chạy Bao Bì';
const TO_NAME = 'Hạt nhựa LDPE (1L)';
const PAGE = 1000;

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

function replaceDeep(value) {
  if (value == null) return { value, changed: false };
  if (typeof value === 'string') {
    let next = value;
    if (next.includes(FROM)) next = next.split(FROM).join(TO);
    if (next.includes(FROM_NAME)) next = next.split(FROM_NAME).join(TO_NAME);
    if (/h[aạ]t\s*nh[uư]a\s*ldpe\s*\(1l\)\s*ch[aạ]y\s*bao\s*b[iì]/i.test(next) && next.includes(TO) === false) {
      // Chỉ đổi tên khi chuỗi vẫn gắn mã BB cũ / tên BB
      if (value.includes(FROM) || /ch[aạ]y\s*bao\s*b[iì]/i.test(value)) next = TO_NAME;
    }
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(item => {
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
    if (
      changed &&
      typeof out.ma_nvl === 'string' &&
      out.ma_nvl === TO &&
      String(out.loai_vat_tu || '').toLowerCase() === 'bao_bi'
    ) {
      out.loai_vat_tu = 'nvl';
    }
    if (changed && typeof out.ten_nvl === 'string' && out.ma_nvl === TO && /bao\s*b[iì]/i.test(out.ten_nvl)) {
      out.ten_nvl = TO_NAME;
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

function rowHasFrom(row) {
  try {
    return JSON.stringify(row).includes(FROM) || JSON.stringify(row).includes(FROM_NAME);
  } catch {
    return false;
  }
}

const TEXT_COLS = [
  'ma_nvl',
  'ma_npl',
  'ma_vat_tu',
  'ma_hang',
  'code',
  'ma',
  'ten_nvl',
  'ten_npl',
  'ten_vat_tu',
  'ten_hang',
  'name',
  'ten',
  'ghi_chu',
  'note',
  'mo_ta'
];

const JSON_COLS = [
  'chi_tiet',
  'payload',
  'dinh_muc_nvl',
  'dinh_muc',
  'npl',
  'thanh_phan',
  'vat_tu',
  'lines',
  'items',
  'data',
  'detail',
  'details',
  'du_lieu'
];

async function fetchAll(db, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function updateTable(db, label, table, idCol = 'id') {
  let rows;
  try {
    rows = await fetchAll(db, table);
  } catch (error) {
    const msg = error?.message || String(error);
    if (/does not exist|PGRST205|Could not find|permission|schema cache/i.test(msg)) {
      console.log(`  [${label}/${table}] bỏ qua (${msg.slice(0, 80)})`);
      return 0;
    }
    console.warn(`  [${label}/${table}]`, msg);
    return 0;
  }

  let touched = 0;
  for (const row of rows) {
    if (!rowHasFrom(row)) continue;
    const patch = {};
    let changed = false;

    for (const col of JSON_COLS) {
      if (!(col in row) || row[col] == null) continue;
      const r = replaceDeep(row[col]);
      if (r.changed) {
        patch[col] = r.value;
        changed = true;
      }
    }
    for (const col of TEXT_COLS) {
      if (!(col in row) || typeof row[col] !== 'string') continue;
      const r = replaceDeep(row[col]);
      if (r.changed) {
        patch[col] = r.value;
        changed = true;
      }
    }
    // Quét mọi cột string/json còn lại
    for (const [col, val] of Object.entries(row)) {
      if (col === idCol || col in patch) continue;
      if (typeof val === 'string' && (val.includes(FROM) || val.includes(FROM_NAME))) {
        const r = replaceDeep(val);
        if (r.changed) {
          patch[col] = r.value;
          changed = true;
        }
      } else if (val && typeof val === 'object') {
        const r = replaceDeep(val);
        if (r.changed) {
          patch[col] = r.value;
          changed = true;
        }
      }
    }

    if (!changed) continue;
    touched += 1;
    console.log(
      `  [${label}/${table}] id=${row[idCol] ?? '?'} cols=${Object.keys(patch).join(',')}`
    );
    if (dryRun) continue;
    const { error: upErr } = await db.from(table).update(patch).eq(idCol, row[idCol]);
    if (upErr) console.warn(`    FAIL: ${upErr.message}`);
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có dòng ${FROM}`);
  return touched;
}

async function fixMasterCodeTable(db, label, table, codeCols, nameCols) {
  let rows;
  try {
    rows = (await fetchAll(db, table)).filter(r => rowHasFrom(r));
  } catch (error) {
    console.warn(`  [${label}/${table}]`, error.message || error);
    return 0;
  }

  let cnExists = false;
  try {
    const all = await fetchAll(db, table);
    cnExists = all.some(r =>
      codeCols.some(col => typeof r[col] === 'string' && r[col].trim() === TO)
    );
  } catch {
    /* ignore */
  }

  let touched = 0;
  for (const row of rows) {
    const id = row.id;
    const isExactBb = codeCols.some(col => typeof row[col] === 'string' && row[col].trim() === FROM);

    if (isExactBb && cnExists) {
      console.log(`  [${label}/${table}] id=${id} đã có ${TO} — xóa bản ghi trùng ${FROM}`);
      touched += 1;
      if (dryRun) continue;
      const { error: delErr } = await db.from(table).delete().eq('id', id);
      if (delErr) console.warn(`    FAIL delete: ${delErr.message}`);
      continue;
    }

    const patch = {};
    for (const col of codeCols) {
      if (typeof row[col] === 'string' && row[col].includes(FROM)) {
        patch[col] = row[col].split(FROM).join(TO);
      }
    }
    for (const col of nameCols) {
      if (typeof row[col] === 'string') {
        const r = replaceDeep(row[col]);
        if (r.changed) patch[col] = r.value;
      }
    }
    if (Object.keys(patch).length === 0) continue;
    touched += 1;
    console.log(`  [${label}/${table}] id=${id} ${JSON.stringify(patch)}`);
    if (dryRun) continue;
    const { error: upErr } = await db.from(table).update(patch).eq('id', id);
    if (upErr) console.warn(`    FAIL: ${upErr.message}`);
  }
  if (touched === 0) console.log(`  [${label}/${table}] không có mã ${FROM}`);
  return touched;
}

const MAIN_TABLES = [
  process.env.SUPABASE_MACHINE_NVL_REPORTS_TABLE || 'bao_cao_may_nvl_ton',
  'bb_bao_cao_tinh_toan',
  'bao_cao_phoi_tron',
  'du_lieu_xuat_kho',
  'bao_cao_du_lieu_ton_dau_ca',
  'du_lieu_trong_bao_cao_kiem_ton_cuoi_ca',
  'bao_cao_tieu_hao_nguyen_vat_lieu',
  'bao_cao_san_luong_nvl_dinh_muc',
  'du_lieu_trong_bao_cao_hang_loi_hong',
  'bao_cao_thanh_pham_dat_nhap_kho',
  'bao_cao_san_luong',
  'bc_lsx',
  'yeu_cau_xuat_kho',
  'nvl_yeu_cau',
  'yeu_cau_xuat_kho_dong',
  'xuat_kho',
  'xuat_kho_dong',
  'nhap_kho',
  'nhap_kho_dong',
  'tra_kho_nvl',
  'tra_kho_nvl_dong',
  'bao_cao_hang_hong',
  'bao_cao_nghiem_thu',
  'phieu_tron_thuc_te',
  'bang_tron_vat_tu_dinh_muc',
  process.env.SUPABASE_WAREHOUSE_MOVEMENTS_TABLE || 'phieu_xuat_nhap_kho',
  'ma_qr_nvl',
  'kiem_kho',
  'kiem_kho_tong_hop'
];

const TON_TABLES = [
  process.env.SUPABASE_MACHINE_NVL_REPORTS_TABLE || 'bao_cao_may_nvl_ton',
  'bao_cao_phoi_tron'
];

async function mainRun() {
  console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'} toàn bộ ${FROM} → ${TO}`);
  let total = 0;

  console.log('\n== DB main (báo cáo / phiếu) ==');
  const seen = new Set();
  for (const table of MAIN_TABLES) {
    if (seen.has(table)) continue;
    seen.add(table);
    total += await updateTable(main, 'main', table);
  }

  const tonUrl = process.env.SUPABASE_TON_URL || '';
  const mainUrl = process.env.SUPABASE_URL || '';
  if (ton && tonUrl && tonUrl !== mainUrl) {
    console.log('\n== DB ton ==');
    for (const table of TON_TABLES) {
      total += await updateTable(ton, 'ton', table);
    }
  } else {
    console.log('\n== DB ton == (trùng main, bỏ qua)');
  }

  const khoUrl = process.env.SUPABASE_KHO_URL || '';
  if (khoUrl && khoUrl !== mainUrl) {
    const khoDb = client(
      khoUrl,
      process.env.SUPABASE_KHO_SERVICE_KEY ||
        process.env.SUPABASE_KHO_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_KEY
    );
    if (khoDb) {
      console.log('\n== DB kho ==');
      for (const table of ['nvl_yeu_cau', 'yeu_cau_xuat_kho', 'xuat_kho', 'nhap_kho', 'phieu_xuat', 'phieu_nhap', 'kho']) {
        total += await updateTable(khoDb, 'kho', table);
      }
    }
  }

  // Master data sau cùng — đã có CN thì xóa BB
  console.log('\n== Master kho_nvl / san_pham ==');
  total += await fixMasterCodeTable(main, 'main', process.env.SUPABASE_MATERIALS_TABLE || 'kho_nvl', ['ma_npl'], [
    'ten_npl'
  ]);
  total += await fixMasterCodeTable(main, 'main', process.env.SUPABASE_PRODUCTS_TABLE || 'san_pham', ['ma_sp', 'ma_sp_moi', 'ma_amis'], [
    'ten_sp'
  ]);
  total += await updateTable(main, 'main', 'phieu_giao_ca');

  console.log(`\nXong. ${total} dòng ${dryRun ? '(dry-run)' : 'đã xử lý'}.`);
}

mainRun().catch(err => {
  console.error(err);
  process.exit(1);
});
