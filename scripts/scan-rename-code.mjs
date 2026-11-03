/**
 * Quét MỌI bảng ở mọi Supabase đã cấu hình, đổi mã FROM → TO ở mọi cột (text/json).
 * Dry:   node scripts/scan-rename-code.mjs --dry-run
 * Apply: node scripts/scan-rename-code.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const dryRun = process.argv.includes('--dry-run');
const FROM = 'TUI KHI 65*215';
const RX = /TUI[\s_-]*KHI[\s_-]*65\s*[*xX×]\s*215/gi; // chịu lệch khoảng trắng/hoa thường
const FALLBACK_TABLES = ['kho', 'nhap_kho', 'xuat_kho', 'phieu_nhap', 'phieu_xuat', 'yeu_cau_xuat_kho', 'nvl_yeu_cau', 'san_pham'];
const TO = 'VT-TUI03';

const dbs = [
  ['main', process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY],
  ['kho', process.env.SUPABASE_KHO_URL, process.env.SUPABASE_KHO_SERVICE_KEY || process.env.SUPABASE_KHO_KEY],
  ['kiem_kho', process.env.SUPABASE_KIEM_KHO_URL, process.env.SUPABASE_KIEM_KHO_SERVICE_KEY || process.env.SUPABASE_KIEM_KHO_KEY],
  ['kho_cho', process.env.SUPABASE_KHO_CHO_URL, process.env.SUPABASE_KHO_CHO_SERVICE_KEY || process.env.SUPABASE_KHO_CHO_KEY],
  ['ton', process.env.SUPABASE_TON_URL, process.env.SUPABASE_TON_SERVICE_KEY || process.env.SUPABASE_TON_KEY],
  ['weighing', process.env.SUPABASE_WEIGHING_URL, process.env.SUPABASE_WEIGHING_SERVICE_KEY || process.env.SUPABASE_WEIGHING_KEY]
].filter(([, u, k]) => u && k);

function replaceDeep(v) {
  if (typeof v === 'string') return RX.test((RX.lastIndex = 0, v)) ? { v: v.replace(RX, TO), c: true } : { v, c: false };
  if (Array.isArray(v)) { let c = false; const o = v.map(x => { const r = replaceDeep(x); c ||= r.c; return r.v; }); return { v: o, c }; }
  if (v && typeof v === 'object') { let c = false; const o = {}; for (const [k, x] of Object.entries(v)) { const r = replaceDeep(x); o[k] = r.v; c ||= r.c; } return { v: o, c }; }
  return { v, c: false };
}

let total = 0;
const seenUrl = new Set();
for (const [label, url, key] of dbs) {
  if (seenUrl.has(url)) continue; // tránh quét trùng khi nhiều prefix cùng 1 project
  seenUrl.add(url);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const spec = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then(r => r.json()).catch(() => null);
  let tables = Object.keys(spec?.definitions || {});
  if (!tables.length) tables = FALLBACK_TABLES;
  console.log(`== ${label}: ${tables.length} bảng`);
  for (const table of tables) {
    const pk = Object.entries(spec?.definitions?.[table]?.properties || {}).find(([, p]) => /Primary Key/i.test(p.description || ''))?.[0] || 'id';
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select('*').range(from, from + 999);
      if (error) { console.log(`  [${table}] bỏ qua: ${error.message}`); break; }
      for (const row of data || []) {
        if (!(RX.lastIndex = 0, RX.test(JSON.stringify(row)))) continue;
        const patch = {};
        for (const [col, val] of Object.entries(row)) {
          if (val == null || col === pk) continue;
          const r = replaceDeep(val);
          if (r.c) patch[col] = r.v;
        }
        if (!Object.keys(patch).length) continue;
        total++;
        console.log(`  [${table}] ${pk}=${row[pk]} cols=${Object.keys(patch).join(',')}`);
        if (dryRun) continue;
        if (!pk) { console.warn('    không có khóa chính, bỏ qua'); continue; }
        const { error: e } = await db.from(table).update(patch).eq(pk, row[pk]);
        if (e) console.warn(`    FAIL: ${e.message}`);
      }
      if (!data || data.length < 1000) break;
    }
  }
}
console.log(`${dryRun ? 'DRY-RUN' : 'APPLY'}: ${total} dòng`);
