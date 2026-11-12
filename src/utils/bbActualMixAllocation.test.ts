import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  overlayProductNplOnBbSanLuongGroups,
  allocateBbNhuaHaoHutByRatioPercent,
  groupBbDauCaLines,
  groupBbCuoiCaLines,
  type BbSanLuongGroup
} from './controlBoardBbMachineReport';
import type { ProductRow } from '../features/san-pham/types';
import type { MixingReport } from '../components/MixingReportForm';
import type { MaterialRow } from '../features/kho-nvl';

test('reverse allocation uses actual mix for the exact date, shift and machine', () => {
  const group = {
    groupKey: 'LSX', ngay: '2026-11-10', shift: '12C1', machine: 'MÁY BAO BÌ 16',
    productGroups: [{
      key: 'P', productCode: 'P', quantity: 10, weightKg: 100,
      lines: ['A', 'B'].map((code, index) => ({
        key: code, itemCode: code, itemName: code, amountType: 'percent', unit: '%',
        quantity: index ? 70 : 30, tiLeDinhMucPercent: index ? 70 : 30,
        normWeightKg: index ? 70 : 30, actualWeightKg: index ? 70 : 30
      }))
    }]
  } as unknown as BbSanLuongGroup;
  const report = {
    ngay: group.ngay, ca: group.shift, ten_may: group.machine,
    chi_tiet: ['A', 'B'].map((code, index) => ({
      ma_nvl: code, ten_vat_tu: code, don_vi: 'kg', lan_su_dung: {},
      kl_thuc_te: index ? 80 : 20, ti_le_phan_tram: index ? 70 : 30
    }))
  } as unknown as MixingReport;
  const products = [{ code: 'P', name: 'P', nplItems: [] }] as unknown as ProductRow[];
  const calculate = (mixingReports: MixingReport[]) =>
    overlayProductNplOnBbSanLuongGroups([group], products, [], { mixingReports })[0];
  const result = calculate([report]);
  assert.deepEqual(result.productGroups[0].lines.map(line => line.actualWeightKg).sort((a, b) => a - b), [20, 80]);
  assert.deepEqual(result.productGroups[0].lines.map(line => line.tiLeDinhMucPercent), [30, 70]);
  assert.equal(result.nvlTotals.reduce((sum, line) => sum + line.actualWeightKg, 0), 100);
  for (const wrongScope of [
    { ...report, ngay: '2026-11-09' },
    { ...report, ca: '12C2' },
    { ...report, ten_may: 'MÁY BAO BÌ 5' }
  ]) {
    assert.equal(calculate([wrongScope]).nvlTotals.reduce((sum, line) => sum + line.actualWeightKg, 0), 0);
  }
});

test('loss allocation never substitutes BOM percentages for missing actual ratios', () => {
  assert.deepEqual(allocateBbNhuaHaoHutByRatioPercent(10, [
    { tiLeDinhMucPercent: 30, tiLeThucTeTbPercent: 20 },
    { tiLeDinhMucPercent: 70, tiLeThucTeTbPercent: 80 }
  ]), [2, 8]);
  assert.deepEqual(allocateBbNhuaHaoHutByRatioPercent(10, [
    { tiLeDinhMucPercent: 100, tiLeThucTeTbPercent: null }
  ]), [null]);
});

function stockAllocationFixture() {
  const ngay = '2026-11-11';
  const shift = '12C1';
  const machine = 'MÁY BAO BÌ 16';
  const materials = [
    { code: 'NVLK-BOT TANG TRANG', unit: 'kg', mixed: 0.08, opening: 0, closing: 0 },
    { code: 'NHUA-1L-CN', unit: 'kg', mixed: 200, opening: 200, closing: 1000 },
    { code: 'NHUA-TC-VN', unit: 'kg', mixed: 80, opening: 0, closing: 420 },
    { code: 'NHUA A1', unit: 'kg', mixed: 1, opening: 11.25, closing: 10.25 },
    { code: 'NVLK-PPA', unit: 'kg', mixed: 7, opening: 19.5, closing: 12.5 },
    { code: 'NHUA-TCMN 25kg', unit: 'kg', mixed: 550, opening: 1275, closing: 1725 },
    { code: 'DAU BONG PA350', unit: 'Lít', mixed: 1.46, opening: 1.46, closing: 5 },
    { code: 'NHUA-TRON', unit: 'kg', mixed: 0, opening: 622, closing: 436 }
  ];
  const rows = (kind: 'opening' | 'closing') => materials.filter(material => material[kind] > 0).map(material => ({
    key: `${kind}|${material.code}`, reportId: kind, ngay, shift, shiftLabel: shift, machine, orderCode: 'LSX076',
    itemCode: material.code, itemName: material.code, unit: material.unit, quantity: material[kind],
    weightKg: material[kind], daTronKg: material[kind], tonNgoaiKg: 0
  }));
  const mixingReports = [{ ngay, ca: shift, ten_may: machine, chi_tiet: materials.filter(material => material.mixed > 0)
    .map(material => ({ ma_nvl: material.code, ten_vat_tu: material.code, don_vi: material.unit,
      kl_thuc_te: material.mixed, lan_su_dung: {} })) }] as unknown as MixingReport[];
  const catalog = materials.map(material => ({ code: material.code, name: material.code, unit: material.unit })) as MaterialRow[];
  const openingRows = rows('opening') as Parameters<typeof groupBbDauCaLines>[0];
  const closingRows = rows('closing') as Parameters<typeof groupBbCuoiCaLines>[0];
  return { materials, openingRows, closingRows, mixingReports, catalog };
}

test('LSX076: phân bổ tồn nhựa trộn cho NVL không có dòng tồn rời và ĐVT Lít', () => {
  const fixture = stockAllocationFixture();
  const before = JSON.stringify(fixture);
  const opening = groupBbDauCaLines(fixture.openingRows, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0];
  const closing = groupBbCuoiCaLines(fixture.closingRows, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0];
  const find = (lines: typeof opening.materialLines, code: string) => lines.find(line => line.itemCode === code)!;
  const vnOpening = find(opening.materialLines, 'NHUA-TC-VN');
  assert.ok(vnOpening, 'Tồn VN rời bằng 0 vẫn phải có phần trong 622 kg NHUA-TRON');
  assert.equal(vnOpening.tonNgoaiKg, 0);
  assert.equal(vnOpening.daTronKg, 59.2704);
  assert.equal(vnOpening.tonDauWeightKg, 59.2704);
  assert.equal(find(closing.materialLines, 'NHUA-TC-VN').tonDauWeightKg, 461.5464);
  assert.equal(find(opening.materialLines, 'NVLK-BOT TANG TRANG').daTronKg, 0.0591);
  assert.equal(find(closing.materialLines, 'NVLK-BOT TANG TRANG').daTronKg, 0.0414);
  const oilOpening = find(opening.materialLines, 'DAU BONG PA350');
  assert.equal(oilOpening.unit, 'Lít');
  assert.equal(oilOpening.tiLeThucTeTbPercent, 0.1739);
  assert.equal(oilOpening.tonNgoaiKg, 1.46);
  assert.equal(oilOpening.daTronKg, 1.0817);
  assert.equal(find(closing.materialLines, 'DAU BONG PA350').daTronKg, 0.7582);
  assert.equal(JSON.stringify(fixture), before, 'Không thay số kiểm kê hoặc phiếu trộn nguồn');
});

test('LSX076: bảo toàn tổng tồn đầu/cuối; thực dùng 1.025,54 kg, không ép chênh lệch về 0', () => {
  const fixture = stockAllocationFixture();
  const opening = groupBbDauCaLines(fixture.openingRows, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0];
  const closing = groupBbCuoiCaLines(fixture.closingRows, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0];
  const openingKg = opening.materialLines.reduce((sum, row) => sum + row.tonDauWeightKg, 0);
  const closingKg = closing.materialLines.reduce((sum, row) => sum + row.tonDauWeightKg, 0);
  assert.ok(Math.abs(openingKg - 2129.21) < 0.001);
  assert.ok(Math.abs(closingKg - 3608.75) < 0.001);
  const used = openingKg + 2505.08 - closingKg;
  assert.ok(Math.abs(used - 1025.54) < 0.001);
  assert.ok(Math.abs(used - 1006.26 - 11.76 - 7.52) < 0.001);
  assert.equal(opening.materialLines.filter(row => row.itemCode === 'NHUA-TC-VN').length, 1);
  assert.equal(closing.materialLines.filter(row => row.itemCode === 'NHUA-TC-VN').length, 1);
});

test('không tự seed/áp định mức khi thiếu trộn thực tế hoặc không có tồn NHUA-TRON', () => {
  const fixture = stockAllocationFixture();
  const missingMixing = groupBbDauCaLines(fixture.openingRows, [], [], fixture.catalog, { mixingReports: [] })[0];
  assert.equal(missingMixing.materialLines.some(row => row.itemCode === 'NHUA-TC-VN'), false);
  const withoutPool = fixture.openingRows.filter(row => row.itemCode !== 'NHUA-TRON');
  const noPool = groupBbDauCaLines(withoutPool, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0];
  assert.equal(noPool.materialLines.some(row => row.itemCode === 'NHUA-TC-VN'), false);
  const vn = groupBbCuoiCaLines(fixture.closingRows, [], [], fixture.catalog, { mixingReports: fixture.mixingReports })[0]
    .materialLines.find(row => row.itemCode === 'NHUA-TC-VN')!;
  assert.equal(vn.tonNgoaiKg, 420, 'Không seed đè hoặc cộng đôi tồn rời đã có');
});
