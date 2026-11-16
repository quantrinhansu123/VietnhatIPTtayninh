import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateAcceptanceWeightSnapshot, parseAcceptanceWeightSnapshot, emptyAcceptanceWeights } from './acceptanceWeightSnapshot';

const report = { ngay: '2026-11-15', ca: '12C1', ma_may: 'MBB_16', mat_hang: 'MN-BB408' };
const row = { ngay: report.ngay, ca: report.ca, may: report.ma_may, qr_code: report.mat_hang, can_san_pham: 5.7, can_loi: 0.5 };

test('snapshot: subtract core, bag and film; preserve zero film', () => {
  const snapshot = calculateAcceptanceWeightSnapshot([row, row], report, new Map());
  assert.deepEqual(snapshot, { trong_luong_loi: 1, trong_luong_bi: 0.32, trong_luong_mang: 0, trong_luong_nhua: 10.08, so_lan_can: 2 });
  const withFilm = calculateAcceptanceWeightSnapshot([row], report, new Map([['MN-BB408', 0.2]]));
  assert.equal(withFilm.trong_luong_nhua, 4.84);
  assert.equal(withFilm.trong_luong_mang, 0.2);
});

test('snapshot: exact day, shift, machine and product scope; missing core is not zero', () => {
  const wrongRows = [
    { ...row, ngay: '2026-11-14' }, { ...row, ca: '12C2' },
    { ...row, may: 'MBB_17' }, { ...row, qr_code: 'MN-BB455' }
  ];
  assert.equal(calculateAcceptanceWeightSnapshot([row, ...wrongRows], report, new Map()).so_lan_can, 1);
  assert.deepEqual(calculateAcceptanceWeightSnapshot([{ ...row, can_loi: null }], report, new Map()), emptyAcceptanceWeights);
  assert.deepEqual(calculateAcceptanceWeightSnapshot([], report, new Map()), emptyAcceptanceWeights);
});

test('snapshot: respects bag weight saved in weighing data and validates writes', () => {
  const snapshot = calculateAcceptanceWeightSnapshot([{ ...row, trong_luong_bi: 0.2 }], report, new Map());
  assert.equal(snapshot.trong_luong_nhua, 5);
  assert.deepEqual(parseAcceptanceWeightSnapshot(snapshot), snapshot);
  assert.equal(parseAcceptanceWeightSnapshot(emptyAcceptanceWeights), null);
  assert.equal(parseAcceptanceWeightSnapshot({ ...snapshot, trong_luong_mang: Infinity }), null);
  assert.equal(parseAcceptanceWeightSnapshot({ ...snapshot, so_lan_can: 0 }), null);
});
