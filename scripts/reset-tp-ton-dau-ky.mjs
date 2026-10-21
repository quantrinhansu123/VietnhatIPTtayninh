/**
 * 1) Xóa trắng tồn kho thành phẩm (phiếu nhap/xuat + cột tồn trên san_pham)
 * 2) Điền Tồn đầu kỳ theo danh sách kiểm kê (mã BB* → MN-BB*)
 *
 * Chạy: node scripts/reset-tp-ton-dau-ky.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const mainUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const mainKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY;
const khoUrl = process.env.SUPABASE_KHO_URL || process.env.NEXT_PUBLIC_SUPABASE_KHO_URL;
const khoKey =
  process.env.SUPABASE_KHO_SERVICE_KEY || process.env.SUPABASE_KHO_KEY || process.env.SUPABASE_KHO_SERVICE_KEY;

if (!mainUrl || !mainKey) {
  console.error('Thieu SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}
if (!khoUrl || !khoKey) {
  console.error('Thieu SUPABASE_KHO_URL / SUPABASE_KHO_KEY');
  process.exit(1);
}

const supabase = createClient(mainUrl, mainKey);
const supabaseKho = createClient(khoUrl, khoKey);

/** @type {Array<{ code?: string, qty?: number, nameHint?: string }>} */
const INVENTORY = [
  { code: 'BB327', qty: 7 },
  { code: 'BB329', qty: 2 },
  { code: 'BB345', qty: 83 },
  { code: 'BB330', qty: 52 },
  { code: 'BB457', qty: 2 },
  { code: 'BB521', qty: 1.5 },
  { code: 'BB435', qty: 1 },
  { code: 'BB514', qty: 1 },
  { code: 'BB467', qty: 5 },
  { code: 'BB408', qty: 20 },
  { code: 'BB508', qty: 50 },
  { code: 'BB509', qty: 1 },
  { code: 'BB338', qty: 20 },
  { code: 'BB507', qty: 10 }, // 1.4x100m-7kg - 10*14
  { code: 'BB308', qty: 50 }, // 1.4x100m-7kg - 20*7
  { code: 'BB341', qty: 11 },
  { code: 'BB346', qty: 10 },
  { code: 'BB309', qty: 27 }, // 1.4x100m-7kg - 35*4
  { code: 'BB311', qty: 1 },
  { code: 'BB326', qty: 26 },
  { code: 'BB325', qty: 34 },
  { code: 'BB310', qty: 6 },
  { code: 'BB337', qty: 5 },
  { code: 'BB421', qty: 4 },
  { code: 'BB332', qty: 1 },
  { code: 'BB333', qty: 3 },
  { code: 'BB498', qty: 2 },
  { code: 'BB474', qty: 73 }, // 1.4x100m-6.62kg-KL - 23*5+25
  { code: 'BB453', qty: 3 },
  { code: 'BB454', qty: 1 },
  { code: 'BB359', qty: 25 },
  { code: 'BB478', qty: 9 },
  { code: 'BB476', qty: 19 },
  { code: 'BB402', qty: 1 },
  { code: 'BB357', qty: 8 },
  { code: 'BB456', qty: 1 },
  { code: 'BB386', qty: 40 },
  { code: 'BB488', qty: 4 },
  { code: 'BB487', qty: 10 },
  { code: 'BB530', qty: 2 }, // 1.5x100m-7.5KG - 40*2+70
  { code: 'BB320', qty: 45 },
  { code: 'BB319', qty: 58 },
  { code: 'BB411', qty: 1 },
  { code: 'BB404', qty: 1 },
  { code: 'BB414', qty: 1 },
  { code: 'BB430', qty: 15 },
  { code: 'BB323', qty: 29 },
  { code: 'BB523', qty: 2 },
  { code: 'BB505', qty: 1 },
  { code: 'BB431', qty: 7 },
  { code: 'BB364', qty: 1 }
];

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

function normalizeName(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.*+x]/g, '')
    .replace(/x/g, '*');
}

async function deleteAllRows(client, table, filter) {
  let deleted = 0;
  for (;;) {
    let query = client.from(table).select('id').limit(500);
    if (filter?.column && filter?.value != null) {
      query = query.eq(filter.column, filter.value);
    }
    const { data, error } = await query;
    if (error) throw new Error(`${table} select: ${error.message}`);
    if (!data?.length) break;
    const ids = data.map(row => row.id);
    const { error: delError } = await client.from(table).delete().in('id', ids);
    if (delError) throw new Error(`${table} delete: ${delError.message}`);
    deleted += ids.length;
    process.stdout.write(`\r${table}: da xoa ${deleted}`);
  }
  console.log(`\n${table}: tong xoa ${deleted}`);
  return deleted;
}

async function deleteAllByMaPhieu(client, table) {
  let deleted = 0;
  for (;;) {
    const { data, error } = await client.from(table).select('ma_phieu').limit(200);
    if (error) throw new Error(`${table} select: ${error.message}`);
    if (!data?.length) break;
    const codes = [...new Set(data.map(row => row.ma_phieu).filter(Boolean))];
    if (!codes.length) break;
    const { error: delError } = await client.from(table).delete().in('ma_phieu', codes);
    if (delError) throw new Error(`${table} delete: ${delError.message}`);
    deleted += codes.length;
    process.stdout.write(`\r${table}: da xoa ${deleted} phieu`);
  }
  console.log(`\n${table}: tong xoa ${deleted} phieu`);
  return deleted;
}

async function loadAllProducts() {
  const pageSize = 1000;
  const products = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('san_pham')
      .select('id, ma_sp, ten_sp, ton_dau_ky, nhap_trong_ky, xuat_trong_ky, sl_ton')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`san_pham: ${error.message}`);
    products.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return products;
}

async function clearCatalogStock(products) {
  let updated = 0;
  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100);
    await Promise.all(
      batch.map(async product => {
        const { error } = await supabase
          .from('san_pham')
          .update({
            ton_dau_ky: 0,
            nhap_trong_ky: 0,
            xuat_trong_ky: 0,
            sl_ton: 0
          })
          .eq('id', product.id);
        if (error) throw new Error(`clear ${product.ma_sp}: ${error.message}`);
        updated += 1;
      })
    );
    process.stdout.write(`\rsan_pham clear: ${updated}/${products.length}`);
  }
  console.log(`\nsan_pham: da xoa trang ton ${updated} dong`);
}

function findByNameHint(products, hint) {
  const want = normalizeName(hint);
  if (!want) return null;
  const tokens = want
    .split(/[^a-z0-9.+]+/)
    .filter(Boolean)
    .filter(t => t.length >= 2);
  const scored = products
    .map(product => {
      const hay = normalizeName(`${product.ma_sp} ${product.ten_sp}`);
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += 1;
      }
      // ưu tiên khớp cụm cắt kiểu 10*14 / 23*5+25
      const cutMatch = hint.match(/(\d+(?:\*\d+)+(?:\+\d+(?:\*\d+)*)*)/i);
      if (cutMatch) {
        const cut = normalizeName(cutMatch[1]);
        if (hay.includes(cut)) score += 5;
      }
      return { product, score };
    })
    .filter(row => row.score >= Math.max(3, Math.ceil(tokens.length * 0.6)))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.product || null;
}

async function applyOpeningStocks(products) {
  const byCode = new Map(
    products.map(product => [normalizeCode(product.ma_sp), product]).filter(([code]) => Boolean(code))
  );

  const results = { ok: [], missing: [], ambiguous: [] };

  for (const item of INVENTORY) {
    if (item.qty == null || !Number.isFinite(item.qty)) continue;
    let product = null;
    if (item.code) {
      product = byCode.get(normalizeCode(item.code)) || null;
    } else if (item.nameHint) {
      product = findByNameHint(products, item.nameHint);
    }
    if (!product) {
      results.missing.push(item);
      continue;
    }
    const { error } = await supabase
      .from('san_pham')
      .update({
        ton_dau_ky: item.qty,
        nhap_trong_ky: 0,
        xuat_trong_ky: 0,
        sl_ton: item.qty
      })
      .eq('id', product.id);
    if (error) throw new Error(`set ${product.ma_sp}: ${error.message}`);
    results.ok.push({
      code: product.ma_sp,
      ten: product.ten_sp,
      qty: item.qty,
      from: item.code || item.nameHint
    });
  }

  return results;
}

async function clearKhoAggregateSanPham() {
  return deleteAllRows(supabaseKho, 'kho', { column: 'loai', value: 'san_pham' });
}

try {
  console.log('=== 1. Xoa trang phieu kho thanh pham ===');
  await deleteAllRows(supabaseKho, 'xuat_kho');
  await deleteAllRows(supabaseKho, 'nhap_kho');
  await deleteAllByMaPhieu(supabaseKho, 'phieu_xuat');
  await deleteAllByMaPhieu(supabaseKho, 'phieu_nhap');
  await clearKhoAggregateSanPham();

  console.log('=== 2. Xoa trang cot ton tren san_pham ===');
  const products = await loadAllProducts();
  console.log(`san_pham: ${products.length} dong`);
  await clearCatalogStock(products);

  console.log('=== 3. Dien Ton dau ky ===');
  const refreshed = await loadAllProducts();
  const results = await applyOpeningStocks(refreshed);

  console.log(`Da set ton_dau_ky: ${results.ok.length}`);
  for (const row of results.ok) {
    console.log(`  ${row.code} = ${row.qty}  (${row.from})`);
  }
  if (results.missing.length) {
    console.log(`Khong match: ${results.missing.length}`);
    for (const row of results.missing) {
      console.log(`  ? ${row.code || row.nameHint} = ${row.qty}`);
    }
  }
  console.log('Xong.');
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
