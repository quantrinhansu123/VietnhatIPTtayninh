/**
 * Khớp đơn giá mua gần nhất từ Excel → kho_nvl.don_gia theo mã NPL.
 *
 * Mặc định: Danh_sach_hang_hoa_dich_vu . Giá gần nhất.xlsx
 * Cột: Mã | Đơn giá mua gần nhất
 *
 * Chạy:
 *   node scripts/apply-nvl-gia-from-xlsx.mjs
 *   node scripts/apply-nvl-gia-from-xlsx.mjs --apply
 *   node scripts/apply-nvl-gia-from-xlsx.mjs --file="..." --apply
 *
 * Cần cột don_gia (chạy supabase-kho-nvl-don-gia.sql trước).
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
  fileArg
    ? fileArg.slice('--file='.length)
    : 'Danh_sach_hang_hoa_dich_vu . Giá gần nhất.xlsx'
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
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function readPricesFromXlsx(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  const items = [];
  const seen = new Set();

  for (const row of rows) {
    const keys = Object.keys(row);
    const codeRaw =
      row['Mã'] ??
      row['Ma'] ??
      row['ma'] ??
      row['ma_npl'] ??
      row['Mã NPL'] ??
      row[keys[0]];
    const priceRaw =
      row['Đơn giá mua gần nhất'] ??
      row['Don gia mua gan nhat'] ??
      row['don_gia'] ??
      row['Giá'] ??
      row['gia'] ??
      row[keys[1]];
    const code = normalizeCode(codeRaw);
    if (!code) continue;
    const price = Number(String(priceRaw).replace(/,/g, '').replace(/\s/g, ''));
    if (!Number.isFinite(price) || price < 0) continue;
    if (seen.has(code)) {
      const existing = items.find(item => item.code === code);
      if (existing) existing.price = price;
      continue;
    }
    seen.add(code);
    items.push({ code, price, rawCode: String(codeRaw || '').trim() });
  }

  return { sheetName, items };
}

async function loadAllMaterials() {
  const pageSize = 1000;
  const materials = [];
  let hasDonGiaColumn = true;
  for (let from = 0; ; from += pageSize) {
    const select = hasDonGiaColumn
      ? 'id, ma_npl, ten_npl, don_vi, ten_kho, don_gia'
      : 'id, ma_npl, ten_npl, don_vi, ten_kho';
    const { data, error } = await supabase.from('kho_nvl').select(select).range(from, from + pageSize - 1);
    if (error) {
      if (hasDonGiaColumn && /don_gia/i.test(error.message || '')) {
        console.warn('Chưa có cột don_gia — sẽ ghi map JSON; chạy supabase-kho-nvl-don-gia.sql để lưu vào DB.');
        hasDonGiaColumn = false;
        from = -pageSize;
        materials.length = 0;
        continue;
      }
      throw new Error(`Đọc kho_nvl: ${error.message}`);
    }
    materials.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return { materials, hasDonGiaColumn };
}

async function updateMaterial(id, donGia) {
  const { error } = await supabase.from('kho_nvl').update({ don_gia: donGia }).eq('id', id);
  if (error) throw new Error(`Update ${id}: ${error.message}`);
}

function writePriceMap(matched) {
  const mapPath = path.join(process.cwd(), 'data', 'nvl-don-gia.json');
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  const byCode = {};
  for (const row of matched) {
    byCode[String(row.material.ma_npl || '').trim()] = row.item.price;
  }
  fs.writeFileSync(
    mapPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        source: path.basename(xlsxPath),
        prices: byCode
      },
      null,
      2
    ),
    'utf8'
  );
  return mapPath;
}

async function main() {
  console.log(`File: ${xlsxPath}`);
  console.log(`Chế độ: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const { sheetName, items } = readPricesFromXlsx(xlsxPath);
  console.log(`Sheet: ${sheetName} · ${items.length} mã có giá`);

  const { materials, hasDonGiaColumn } = await loadAllMaterials();
  console.log(`kho_nvl: ${materials.length} dòng · cột don_gia: ${hasDonGiaColumn ? 'có' : 'chưa'}`);

  const byCode = new Map();
  for (const material of materials) {
    const code = normalizeCode(material.ma_npl);
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(material);
  }

  const matched = [];
  const missingInKho = [];
  const ambiguous = [];

  for (const item of items) {
    const list = byCode.get(item.code) || [];
    if (list.length === 0) {
      missingInKho.push(item);
      continue;
    }
    if (list.length > 1) {
      ambiguous.push({ item, count: list.length });
    }
    for (const material of list) {
      matched.push({ item, material });
    }
  }

  const matchedCodes = new Set(matched.map(row => normalizeCode(row.material.ma_npl)));
  const khoWithoutPrice = materials.filter(m => {
    const code = normalizeCode(m.ma_npl);
    return code && !matchedCodes.has(code);
  });

  console.log(`\nKhớp: ${matched.length} dòng kho (${new Set(matched.map(r => r.item.code)).size} mã Excel)`);
  console.log(`Excel không có trong kho: ${missingInKho.length}`);
  console.log(`Trùng mã trong kho: ${ambiguous.length}`);
  console.log(`Kho không có trong Excel: ${khoWithoutPrice.length}`);

  if (missingInKho.length) {
    console.log('\nMã Excel không có trong kho_nvl:');
    for (const row of missingInKho) {
      console.log(`  ${row.rawCode || row.code} = ${row.price}`);
    }
  }

  console.log('\nMẫu cập nhật:');
  for (const row of matched.slice(0, 20)) {
    const old = Number(row.material.don_gia);
    console.log(
      `  ${row.material.ma_npl}: ${Number.isFinite(old) ? old : '—'} → ${row.item.price}  (${row.material.ten_npl || '-'})`
    );
  }

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để ghi.');
    return;
  }

  const mapPath = writePriceMap(matched);
  console.log(`Đã ghi map giá: ${mapPath}`);

  let updated = 0;
  let dbSkipped = !hasDonGiaColumn;
  if (hasDonGiaColumn) {
    console.log('\nĐang cập nhật kho_nvl.don_gia...');
    for (const row of matched) {
      try {
        await updateMaterial(row.material.id, row.item.price);
        updated += 1;
        if (updated % 20 === 0) process.stdout.write(`\r  ${updated}/${matched.length}`);
      } catch (err) {
        if (/don_gia|PGRST204/i.test(String(err?.message || err))) {
          dbSkipped = true;
          console.warn('\nCột don_gia không ghi được — giữ map JSON.');
          break;
        }
        throw err;
      }
    }
    if (!dbSkipped) console.log(`\nĐã cập nhật DB: ${updated}`);
  } else {
    console.log('Chưa có cột DB — app đọc giá từ data/nvl-don-gia.json.');
    console.log('Muốn lưu DB: chạy supabase-kho-nvl-don-gia.sql rồi chạy lại --apply.');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(process.cwd(), 'backups', `nvl-gia-apply-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        file: xlsxPath,
        sheetName,
        appliedAt: new Date().toISOString(),
        mapPath,
        dbUpdated: dbSkipped ? 0 : updated,
        matched: matched.map(row => ({
          ma_npl: row.material.ma_npl,
          ten_npl: row.material.ten_npl,
          ten_kho: row.material.ten_kho,
          old: row.material.don_gia ?? null,
          don_gia: row.item.price
        })),
        missingInKho,
        khoWithoutPrice: khoWithoutPrice.map(m => ({
          ma_npl: m.ma_npl,
          ten_npl: m.ten_npl,
          ten_kho: m.ten_kho
        }))
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
