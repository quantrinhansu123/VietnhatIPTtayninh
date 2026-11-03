/**
 * Đổi mã NVL trong các phiếu đã lưu: TUI KHI 65*215 → VT-TUI03.
 * Dry:   node scripts/rename-nvl-code.mjs --dry-run
 * Apply: node scripts/rename-nvl-code.mjs
 * Chỉ thay chuỗi mã (giữ tên/ĐVT/số liệu). Quét các bảng + cột JSON liệt kê bên dưới.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();
const dryRun = process.argv.includes('--dry-run');
const FROM = 'TUI KHI 65*215';
const TO = 'VT-TUI03';

const mk = (url, key) =>
  url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const main = mk(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const ton = mk(
  process.env.SUPABASE_TON_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_TON_SERVICE_KEY || process.env.SUPABASE_TON_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);
if (!main) { console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

function replaceDeep(v) {
  if (typeof v === 'string') return v === FROM || v.includes(FROM) ? { v: v.split(FROM).join(TO), c: true } : { v, c: false };
  if (Array.isArray(v)) { let c = false; const o = v.map(x => { const r = replaceDeep(x); c ||= r.c; return r.v; }); return { v: o, c }; }
  if (v && typeof v === 'object') { let c = false; const o = {}; for (const [k, x] of Object.entries(v)) { const r = replaceDeep(x); o[k] = r.v; c ||= r.c; } return { v: o, c }; }
  return { v, c: false };
}

// db, bảng, cột (text hoặc json) có thể chứa mã
const TARGETS = [
  [ton || main, process.env.SUPABASE_MACHINE_NVL_REPORTS_TABLE || 'bao_cao_may_nvl_ton', ['chi_tiet']],
  [main, 'bao_cao_phoi_tron', ['chi_tiet']],
  [main, 'bb_bao_cao_tinh_toan', ['payload']],
  [main, 'bc_lsx', ['dinh_muc_nvl', 'chi_tiet', 'payload']],
  [main, 'yeu_cau_xuat_kho', ['chi_tiet', 'items']],
  ...['du_lieu_xuat_kho', 'bao_cao_du_lieu_ton_dau_ca', 'du_lieu_trong_bao_cao_kiem_ton_cuoi_ca',
    'bao_cao_tieu_hao_nguyen_vat_lieu', 'bao_cao_san_luong_nvl_dinh_muc'].map(t => [main, t, ['ma_nvl']])
];

let total = 0;
for (const [db, table, cols] of TARGETS) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) { console.log(`[${table}] bỏ qua: ${error.message}`); break; }
    for (const row of data || []) {
      const patch = {};
      for (const col of cols) {
        if (!(col in row) || row[col] == null) continue;
        const r = replaceDeep(row[col]);
        if (r.c) patch[col] = r.v;
      }
      if (!Object.keys(patch).length) continue;
      total++;
      console.log(`[${table}] id=${row.id} cols=${Object.keys(patch).join(',')}`);
      if (dryRun) continue;
      const { error: e } = await db.from(table).update(patch).eq('id', row.id);
      if (e) console.warn(`  FAIL: ${e.message}`);
    }
    if (!data || data.length < 1000) break;
  }
}
console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'}: ${total} dòng`);
