import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptanceMixedKgByProduct } from './acceptanceMixedWeight';

test('phiếu giao nhận chia tổng Nhập TP 3.1 theo trọng lượng từng SP, giữ đúng tổng', () => {
  const slip = {
    id: 'test', ngay: '2026-11-23', ca: '2', ma_may: 'MBB_5', ten_may: 'Máy Bao Bì 5',
    lan: '', gio: '', machineLabel: '',
    thanhPhamLines: [], hangLoiHongLines: []
  };
  const payload = {
    thucDungGroups: [{
      groupKey: 'LSX133', orderCode: 'LSX133', ngay: slip.ngay, shift: 'Ca 2',
      machine: 'Máy Bao Bì 5',
      lines: [
        { isPlasticNvl: true, klThucTeKg: 0.07 },
        { isPlasticNvl: true, klThucTeKg: 183.41 },
        { isPlasticNvl: true, klThucTeKg: 73.36 },
        { isPlasticNvl: true, klThucTeKg: 0.92 },
        { isPlasticNvl: true, klThucTeKg: 7.34 },
        { isPlasticNvl: true, klThucTeKg: 504.38 },
        { isPlasticNvl: true, klThucTeKg: 1.34 },
        { isPlasticNvl: false, klThucTeKg: 10 }
      ]
    }],
    sanLuongGroups: [{
      groupKey: 'LSX133', orderCode: 'LSX133', ngay: slip.ngay, shift: '2',
      machine: 'Máy Bao Bì 5',
      productGroups: [
        { productCode: 'MN-BB309', weightKg: 139.67 },
        { productCode: 'MN-BB308', weightKg: 138.31 },
        { productCode: 'MN-BB541', weightKg: 527.76 }
      ]
    }]
  };
  const weights = acceptanceMixedKgByProduct(payload as any, slip);
  assert.ok(weights);
  assert.equal(Math.round([...weights.values()].reduce((sum, value) => sum + value, 0) * 100) / 100, 770.82);
  assert.equal(weights.get('MN-BB309'), 133.62);
  assert.equal(weights.get('MN-BB308'), 132.32);
  assert.equal(weights.get('MN-BB541'), 504.88);
  assert.equal(acceptanceMixedKgByProduct(payload as any, { ...slip, ngay: '2026-11-24' }), null);
});
