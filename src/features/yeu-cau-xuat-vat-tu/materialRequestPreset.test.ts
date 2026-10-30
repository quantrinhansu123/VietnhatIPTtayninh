import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMaterialRequestPresetLines, hasEnteredQuantity, mergeMaterialPreset, resolveMaterialPresetKind, MATERIAL_REQUEST_PRESET_BB } from './materialRequestPreset';
import { applyMixingMaterialPreset, listRoundMaterialEntries, prepareMixingChiTietForSave } from '../../lib/mixingReportModel';

test('machine determines BB/CN; unknown machine has no automatic template', () => {
  for (const machine of ['Máy bao bì 5', 'MBB05', 'Bao bi 11']) assert.equal(resolveMaterialPresetKind(machine), 'bb');
  for (const machine of ['Máy cách nhiệt 1', 'MCN02', 'CN 3']) assert.equal(resolveMaterialPresetKind(machine), 'cn');
  assert.equal(resolveMaterialPresetKind(''), null);
  assert.equal(resolveMaterialPresetKind('Máy cắt 1'), null);
});

test('catalog names and units follow the pictured BB order, quantities start blank', () => {
  const catalog = [{ code: 'ong-20cm', name: 'Ống giấy 20cm', unit: 'Cái' }];
  const lines = buildMaterialRequestPresetLines(catalog, () => 'key', 'bb');
  assert.deepEqual(lines.map(line => line.code.toLowerCase()), MATERIAL_REQUEST_PRESET_BB.map(item => item.code.toLowerCase()));
  assert.equal(lines[11].name, catalog[0].name);
  assert.equal(lines[11].unit, 'Cái');
  assert.ok(lines.every(line => line.qty === ''));
});

test('both machine presets end with one existing mixed-plastic material', () => {
  const material = { code: 'NHUA-TRON', name: 'Nhựa trộn Nguyên Sinh + Tái Chế', unit: 'kg' };
  for (const kind of ['bb', 'cn'] as const) {
    const lines = buildMaterialRequestPresetLines([material], () => 'key', kind);
    assert.equal(lines.length, kind === 'bb' ? 19 : 13);
    assert.equal(lines.filter(line => line.code === material.code).length, 1);
    assert.deepEqual(lines.at(-1), { ...material, key: 'key', qty: '' });
  }
});

test('switching template preserves entered quantities including zero, drops unused old defaults', () => {
  const bb = buildMaterialRequestPresetLines([], () => 'bb', 'bb');
  bb[1].qty = '20';
  bb[5].qty = '0';
  const cn = buildMaterialRequestPresetLines([], () => 'cn', 'cn');
  const result = mergeMaterialPreset(bb, cn, line => line.code, line => line.qty !== '');
  assert.equal(result.find(line => line.code === 'NHUA-2L')?.qty, '20');
  assert.equal(result.find(line => line.code === 'BK-BKT2cm')?.qty, '0');
  assert.ok(!result.some(line => line.code === 'TUI KHI 65*215'));
  assert.equal(bb[1].qty, '20');
});

test('mixing fills every round in preset order and preserves entered values when adding rounds', () => {
  const first = applyMixingMaterialPreset([], [], 'bb', 1);
  first[1].lan_su_dung.lan_1![0].kl_thuc_te = 12;
  const next = applyMixingMaterialPreset(first, [], 'bb', 2);
  assert.deepEqual(listRoundMaterialEntries(next, 'lan_2').map(entry => entry.item.ma_nvl), MATERIAL_REQUEST_PRESET_BB.map(item => item.code));
  assert.equal(next[1].lan_su_dung.lan_1![0].kl_thuc_te, 12);
  assert.ok(listRoundMaterialEntries(next, 'lan_2').every(entry => entry.item.kl_thuc_te === null));
  assert.equal(first[0].lan_su_dung.lan_2, undefined);
  const saved = prepareMixingChiTietForSave(next);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].ma_nvl, 'NHUA-2L');
  assert.equal(saved[0].lan_su_dung.lan_1![0].don_vi, 'kg');
  assert.equal(saved[0].lan_su_dung.lan_2, undefined);
  const cn = applyMixingMaterialPreset(next, [], 'cn', 2);
  assert.equal(cn.find(line => line.ma_nvl === 'NHUA-2L')?.lan_su_dung.lan_1![0].kl_thuc_te, 12);
  assert.ok(!cn.some(line => line.ma_nvl === 'TUI KHI 65*215'));
});

test('blank quantities are omitted; explicitly entered zero is retained', () => {
  assert.equal(hasEnteredQuantity('', '  ', null, undefined), false);
  assert.equal(hasEnteredQuantity('', '0'), true);
  assert.equal(hasEnteredQuantity(null, 0), true);
  assert.equal(hasEnteredQuantity('', '2.5'), true);
  const lines = applyMixingMaterialPreset([], [], 'bb', 2);
  assert.deepEqual(prepareMixingChiTietForSave(lines), []);
  lines[5].lan_su_dung.lan_1![0].kl_thuc_te = 0;
  lines[5].lan_su_dung.khoi_luong_me = { lan_1: 100, lan_2: 200 };
  lines[6].lan_su_dung.lan_2![0].so_luong = 5;
  const saved = prepareMixingChiTietForSave(lines);
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map(line => line.stt), [1, 2]);
  assert.equal(saved[0].ma_nvl, 'BK-BKT2cm');
  assert.equal(saved[0].lan_su_dung.lan_1![0].kl_thuc_te, 0);
  assert.equal(saved[0].lan_su_dung.lan_1![0].don_vi, 'Cuộn');
  assert.equal(saved[0].lan_su_dung.lan_2, undefined);
  assert.deepEqual(saved[0].lan_su_dung.khoi_luong_me, { lan_1: 100 });
  assert.equal(lines[5].lan_su_dung.lan_2!.length, 1);
});
