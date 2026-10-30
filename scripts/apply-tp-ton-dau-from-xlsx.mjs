/**
 * Khớp tồn đầu kỳ kho thành phẩm từ file Excel (Mã hàng | Số lượng).
 *
 * Mặc định: TP-T10 (1).xlsx
 * - Cập nhật san_pham.ton_dau_ky + sl_ton theo mã
 * - SP thuộc kho thành phẩm / sản phẩm / hàng hóa không có trong file → ton_dau_ky = 0
 *
 * Chạy:
 *   node scripts/apply-tp-ton-dau-from-xlsx.mjs
 *   node scripts/apply-tp-ton-dau-from-xlsx.mjs --apply
 *   node scripts/apply-tp-ton-dau-from-xlsx.mjs --file="TP-T10 (1).xlsx" --apply
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

dotenv.config({ override: true });
dotenv.config({ path: '.env.local', override: false });

const APPLY = process.argv.includes('--apply');
const fileArg = process.argv.find(arg => arg.startsWith('--file='));
const xlsxPath = path.resolve(
  process.cwd(),
  fileArg ? fileArg.slice('--file='.length) : 'TP-T10 (1).xlsx'
);

const mainUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const mainKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  '';

if (!mainUrl || !mainKey) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Không thấy file: ${xlsxPath}`);
  process.exit(1);
}

const supabase = createClient(mainUrl, mainKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function normalizeCode(raw) {
  const text = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!text) return '';
  if (text.startsWith('MN-')) return text;
  if (text.startsWith('BB')) return `MN-${text}`;
  return text;
}

function normalizeWarehouseName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function isFinishedGoodsWarehouse(name) {
  const n = normalizeWarehouseName(name);
  return (
    n.includes('thanh pham') ||
    n.includes('san pham') ||
    n.includes('hang hoa') ||
    n === 'kho tp' ||
    n === 'tp'
  );
}

function readInventoryFromXlsx(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const items = [];
  const seen = new Set();

  for (const row of rows) {
    const codeRaw =
      row['Mã hàng'] ??
      row['Ma hang'] ??
      row['ma_hang'] ??
      row['Mã SP'] ??
      row['ma_sp'] ??
      row[Object.keys(row)[0]];
    const qtyRaw =
      row['Số lượng'] ??
      row['So luong'] ??
      row['so_luong'] ??
      row['Tồn'] ??
      row['ton'] ??
      row[Object.keys(row)[1]];
    const code = normalizeCode(codeRaw);
    if (!code) continue;
    const qty = Number(String(qtyRaw).replace(',', '.'));
    if (!Number.isFinite(qty)) continue;
    if (seen.has(code)) {
      // Cộng dồn nếu trùng mã
      const existing = items.find(item => item.code === code);
      if (existing) existing.qty += qty;
      continue;
    }
    seen.add(code);
    items.push({ code, qty, rawCode: String(codeRaw || '').trim() });
  }

  return { sheetName, items };
}

async function loadAllProducts() {
  const pageSize = 1000;
  const products = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('san_pham')
      .select('id, ma_sp, ten_sp, ten_kho, ton_dau_ky, nhap_trong_ky, xuat_trong_ky, sl_ton')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Đọc san_pham: ${error.message}`);
    products.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return products;
}

async function updateProduct(id, patch) {
  const { error } = await supabase.from('san_pham').update(patch).eq('id', id);
  if (error) throw new Error(`Update ${id}: ${error.message}`);
}

async function main() {
  console.log(`File: ${xlsxPath}`);
  console.log(`Chế độ: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const { sheetName, items } = readInventoryFromXlsx(xlsxPath);
  console.log(`Sheet: ${sheetName} · ${items.length} mã · Σ SL = ${items.reduce((s, i) => s + i.qty, 0)}`);

  const products = await loadAllProducts();
  console.log(`san_pham: ${products.length} dòng`);

  const byCode = new Map();
  for (const product of products) {
    const code = normalizeCode(product.ma_sp);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(product);
  }

  const matched = [];
  const missing = [];
  const ambiguous = [];

  for (const item of items) {
    const list = byCode.get(item.code) || [];
    if (list.length === 0) {
      missing.push(item);
      continue;
    }
    if (list.length > 1) {
      // Ưu tiên kho thành phẩm nếu có nhiều dòng cùng mã
      const preferred =
        list.find(p => isFinishedGoodsWarehouse(p.ten_kho)) ||
        list.find(p => !String(p.ten_kho || '').trim()) ||
        list[0];
      ambiguous.push({ item, count: list.length, pick: preferred.ma_sp, kho: preferred.ten_kho });
      matched.push({ item, product: preferred });
      continue;
    }
    matched.push({ item, product: list[0] });
  }

  const matchedIds = new Set(matched.map(row => row.product.id));
  const zeroTargets = products.filter(
    product =>
      isFinishedGoodsWarehouse(product.ten_kho) &&
      !matchedIds.has(product.id) &&
      Number(product.ton_dau_ky || 0) !== 0
  );

  console.log(`\nKhớp: ${matched.length}`);
  console.log(`Thiếu trong danh mục: ${missing.length}`);
  console.log(`Trùng mã (đã chọn 1): ${ambiguous.length}`);
  console.log(`SP kho TP có tồn đầu ≠ 0 nhưng không có trong file → về 0: ${zeroTargets.length}`);

  if (missing.length) {
    console.log('\nMã Excel không có trong san_pham:');
    for (const row of missing.slice(0, 40)) {
      console.log(`  ${row.rawCode || row.code} = ${row.qty}`);
    }
    if (missing.length > 40) console.log(`  ... +${missing.length - 40}`);
  }

  const sample = matched.slice(0, 15);
  console.log('\nMẫu cập nhật:');
  for (const row of sample) {
    const old = Number(row.product.ton_dau_ky);
    console.log(
      `  ${row.product.ma_sp}: ${Number.isFinite(old) ? old : 0} → ${row.item.qty}  [${row.product.ten_kho || '-'}]`
    );
  }

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để ghi DB.');
    return;
  }

  console.log('\nĐang cập nhật tồn đầu...');
  let updated = 0;
  for (const row of matched) {
    await updateProduct(row.product.id, {
      ton_dau_ky: row.item.qty,
      sl_ton: row.item.qty
    });
    updated += 1;
    if (updated % 50 === 0) process.stdout.write(`\r  ${updated}/${matched.length}`);
  }
  console.log(`\nĐã set từ Excel: ${updated}`);

  let zeroed = 0;
  for (const product of zeroTargets) {
    await updateProduct(product.id, {
      ton_dau_ky: 0,
      sl_ton: 0
    });
    zeroed += 1;
  }
  console.log(`Đã về 0 (không có trong file): ${zeroed}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), 'backups', `tp-ton-dau-apply-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        file: xlsxPath,
        sheetName,
        appliedAt: new Date().toISOString(),
        matched: matched.map(row => ({
          ma_sp: row.product.ma_sp,
          ten_kho: row.product.ten_kho,
          old: row.product.ton_dau_ky,
          qty: row.item.qty
        })),
        missing,
        ambiguous,
        zeroed: zeroTargets.map(p => ({ ma_sp: p.ma_sp, ten_kho: p.ten_kho, old: p.ton_dau_ky }))
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`Báo cáo: ${reportPath}`);
  console.log('Xong.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
