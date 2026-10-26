import assert from 'node:assert/strict';
import test from 'node:test';
import type { MixingReportLine, MixingRoundItem } from '../components/MixingReportForm';
import { copyMixingRoundFromLines, getRoundBatchWeightFromLines, listMixingRoundCopySources, listRoundMaterialEntries } from './mixingReportModel';

const material = (code: string, overrides: Partial<MixingRoundItem> = {}): MixingRoundItem => ({
  ma_nvl: code, ten_vat_tu: `Vật tư ${code}`, don_vi: 'kg', ti_le_phan_tram: 30,
  so_luong: 30.123, kl_thuc_te: 29.987, ...overrides
});
const line = (item: MixingRoundItem, rounds: MixingReportLine['lan_su_dung']): MixingReportLine => ({
  stt: 1, ma_nvl: item.ma_nvl, ten_vat_tu: item.ten_vat_tu, lan_su_dung: rounds, tong_nhua_tron: null
});

test('sao chép thay NVL đích, giữ đủ thông tin và độ chính xác của nguồn, không đổi các lần khác', () => {
  const a = material('A');
  const b = material('B', { don_vi: 'bao', ti_le_phan_tram: null, so_luong: 0, kl_thuc_te: null });
  const source = [line(a, { lan_1: [a], khoi_luong_me: { lan_1: 100.123 } }), line(b, { lan_1: [b] })];
  const c = material('C');
  const target = [
    line(a, { lan_1: [a], lan_2: [material('A', { kl_thuc_te: 50 })], khoi_luong_me: { lan_1: 100.123, lan_2: 200 } }),
    line(c, { lan_2: [c], lan_3: [c], khoi_luong_me: { lan_2: 200, lan_3: 150 } })
  ];
  const originalSource = structuredClone(source);
  const originalTarget = structuredClone(target);
  const copied = copyMixingRoundFromLines(target, 'lan_2', source, 'lan_1');
  assert.deepEqual(listRoundMaterialEntries(copied, 'lan_2').map(entry => entry.item), [a, b]);
  assert.equal(getRoundBatchWeightFromLines(copied, 'lan_2'), 100.123);
  assert.deepEqual(listRoundMaterialEntries(copied, 'lan_1').map(entry => entry.item), [a]);
  assert.deepEqual(listRoundMaterialEntries(copied, 'lan_3').map(entry => entry.item), [c]);
  assert.deepEqual(source, originalSource);
  assert.deepEqual(target, originalTarget);
  listRoundMaterialEntries(copied, 'lan_2')[0].item.kl_thuc_te = 123;
  assert.deepEqual(source, originalSource);
});

test('lần nguồn rỗng không xóa dữ liệu; nguồn không có KL mẻ không giữ lại KL mẻ cũ', () => {
  const a = material('A');
  const target = [line(a, { lan_2: [a], khoi_luong_me: { lan_2: 200 } })];
  assert.equal(copyMixingRoundFromLines(target, 'lan_2', [], 'lan_1'), target);
  const copied = copyMixingRoundFromLines(target, 'lan_2', [line(a, { lan_1: [a] })], 'lan_1');
  assert.equal(getRoundBatchWeightFromLines(copied, 'lan_2'), null);
  assert.deepEqual(listRoundMaterialEntries(copied, 'lan_2')[0].item, a);
});

test('sổ sao chép chỉ chứa lần trước có NVL, đúng số lần của phiếu nhiều lần và xếp gần nhất trước', () => {
  const a = material('A');
  const reports = [
    { id: 'saved', lan_thu: 4, so_lan: 2, so_phieu: 'PT001', chi_tiet: [line(a, { lan_1: [a], lan_2: [a] })] },
    { id: 'draft', lan_thu: 6, so_lan: 2, so_phieu: 'Đang nhập', chi_tiet: [line(a, { lan_1: [a], lan_2: [a] })] },
    { id: 'empty', lan_thu: 1, so_lan: 1, so_phieu: '', chi_tiet: [] }
  ];
  const options = listMixingRoundCopySources(reports, 7);
  assert.deepEqual(options.map(option => option.session), [6, 5, 4]);
  assert.equal(options[1].roundKey, 'lan_2');
  assert.equal(options[1].label, 'Lần 5 · PT001');
  assert.deepEqual(listMixingRoundCopySources(reports, 4), []);
});
