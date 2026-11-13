import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BbSanLuongReportPanel from './BbSanLuongReportPanel';
import type { BbSanLuongGroup } from '../utils/controlBoardBbMachineReport';
import type { ProductRow } from '../features/san-pham/types';

function fixture() {
  return {
    groupKey: 'LSX070', orderCode: 'LSX070', ngay: '2026-11-10', shift: '12C1',
    machine: 'MÁY BAO BÌ 16', totalQuantity: 153, totalNormWeightKg: 107,
    totalActualWeightKg: 107, productCount: 1,
    productGroups: [{
      key: 'SP1', productCode: 'MN-BB114', productName: 'Bao bì', quantity: 153,
      unit: 'Cuộn', weightKg: 100, totalActualWeightKg: 107,
      lines: [
        { key: 'NHUA', itemCode: 'NHUA', itemName: 'Nhựa trộn', unit: 'kg', amountType: 'percent',
          quantity: 100, tiLeDinhMucPercent: 100, actualWeightKg: 100, normWeightKg: 100 },
        { key: 'TUI', itemCode: 'VT-TUI03', itemName: 'Túi đựng hàng', unit: 'Cái', amountType: 'quantity',
          quantity: 153, actualWeightKg: 5, normWeightKg: 5 },
        { key: 'LOI', itemCode: 'ONG-19.5CM', itemName: 'Ống giấy', unit: 'Cái', amountType: 'quantity',
          quantity: 153, actualWeightKg: 2, normWeightKg: 2 }
      ]
    }]
  } as unknown as BbSanLuongGroup;
}

test('chi tiết sản lượng tách NVL trộn và vật tư khác, giữ nguyên snapshot', () => {
  const group = fixture();
  const before = JSON.stringify(group);
  const html = renderToStaticMarkup(React.createElement(BbSanLuongReportPanel, { groups: [group], shiftSettings: [] }));
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map(match => match[0]);
  assert.equal(tables.length, 3, 'Giữ bảng tổng và hai bảng chi tiết');
  const mixing = tables.find(table => /<caption[^>]*>Bảng NVL trộn/.test(table))!;
  const other = tables.find(table => /<caption[^>]*>Bảng vật tư khác/.test(table))!;
  assert.ok(mixing && other);
  assert.match(mixing, /Nhựa trộn/);
  assert.doesNotMatch(mixing, /VT-TUI03|ONG-19.5CM/);
  assert.match(other, /VT-TUI03/);
  assert.match(other, /ONG-19.5CM/);
  assert.doesNotMatch(other, /Nhựa trộn/);
  assert.match(mixing, /<tfoot>[\s\S]*100 kg/);
  assert.match(other, /<tfoot>[\s\S]*7 kg/);
  assert.match(other, /rowSpan="2"/i);
  assert.equal(JSON.stringify(group), before);
});

test('cột Định mức lấy từ bảng kho thành phẩm (Thành phần SP)', () => {
  const group = fixture();
  const products = [
    {
      code: 'MN-BB114',
      name: 'Bao bì',
      nplItems: [
        { code: 'NHUA', name: 'Nhựa trộn', amountType: 'percent', percent: 100, quantity: null, unit: 'kg', weightKg: null },
        { code: 'VT-TUI03', name: 'Túi đựng hàng', amountType: 'quantity', quantity: 1, unit: 'Cái', percent: null, weightKg: 0.14 },
        { code: 'ONG-19.5CM', name: 'Ống giấy', amountType: 'quantity', quantity: 7, unit: 'Cái', percent: null, weightKg: 0.053 }
      ]
    }
  ] as unknown as ProductRow[];
  const html = renderToStaticMarkup(
    React.createElement(BbSanLuongReportPanel, { groups: [group], shiftSettings: [], products })
  );
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map(match => match[0]);
  const mixing = tables.find(table => /<caption[^>]*>Bảng NVL trộn/.test(table))!;
  const other = tables.find(table => /<caption[^>]*>Bảng vật tư khác/.test(table))!;
  assert.match(mixing, /Định mức<\/th>/);
  assert.match(mixing, /text-zinc-800">100%<\/td>/);
  assert.match(other, /Cái<\/td><td class="bb-sheet-num font-semibold text-zinc-800">1<\/td>/);
  assert.match(other, /Cái<\/td><td class="bb-sheet-num font-semibold text-zinc-800">7<\/td>/);
});

test('thiếu bảng kho thành phẩm: Định mức lùi về SL NVL ÷ SL SP, không bịa số', () => {
  const group = fixture();
  group.productGroups[0].quantity = 153;
  const html = renderToStaticMarkup(React.createElement(BbSanLuongReportPanel, { groups: [group], shiftSettings: [] }));
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map(match => match[0]);
  const other = tables.find(table => /<caption[^>]*>Bảng vật tư khác/.test(table))!;
  assert.match(other, /Cái<\/td><td class="bb-sheet-num font-semibold text-zinc-800">1<\/td>/);
});

test('bảng vật tư khác rỗng vẫn có tiêu đề và thông báo riêng', () => {
  const group = fixture();
  group.productGroups[0].lines = group.productGroups[0].lines.filter(line => line.amountType === 'percent');
  const html = renderToStaticMarkup(React.createElement(BbSanLuongReportPanel, { groups: [group], shiftSettings: [] }));
  assert.match(html, /Bảng vật tư khác/);
  assert.match(html, /Chưa có vật tư khác/);
});

test('không ẩn 3 SP thiếu vật tư phụ: vẫn đủ 5 SP / 153 cuộn, cảnh báo 94 cuộn thiếu', () => {
  const group = fixture();
  const base = group.productGroups[0];
  const specs = [
    { code: 'MN-BB114', qty: 42, hasAux: false },
    { code: 'MN-BB361', qty: 27, hasAux: false },
    { code: 'MN-BB308', qty: 7, hasAux: true },
    { code: 'MN-BB510', qty: 25, hasAux: false },
    { code: 'MN-BB414', qty: 52, hasAux: true }
  ];
  group.productGroups = specs.map(product => ({
    ...base, key: product.code, productCode: product.code, quantity: product.qty,
    lines: base.lines.filter(line => product.hasAux || line.amountType === 'percent')
      .map(line => ({ ...line, key: `${product.code}|${line.key}` }))
  }));
  group.productCount = 5;
  const before = JSON.stringify(group);
  const html = renderToStaticMarkup(React.createElement(BbSanLuongReportPanel, { groups: [group], shiftSettings: [] }));
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)].map(match => match[0]);
  const other = tables.find(table => /<caption[^>]*>Bảng vật tư khác/.test(table))!;
  for (const product of specs) assert.ok(other.includes(product.code), `Phải hiện ${product.code}`);
  assert.match(html, /3 sản phẩm \(94 cuộn\)/);
  assert.equal((other.match(/Chưa có vật tư khác/g) || []).length, 3);
  assert.match(other, /<tfoot>[\s\S]*>153<\/td>/);
  assert.equal(JSON.stringify(group), before, 'Không thêm/sửa NVL để che dữ liệu thiếu');
});
