import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  overlayProductNplOnBbSanLuongGroups,
  allocateBbNhuaHaoHutByRatioPercent,
  type BbSanLuongGroup
} from './controlBoardBbMachineReport';
import type { ProductRow } from '../features/san-pham/types';
import type { MixingReport } from '../components/MixingReportForm';

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
