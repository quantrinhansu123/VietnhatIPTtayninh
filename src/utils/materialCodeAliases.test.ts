import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeMaterialCodePayload } from './materialCodeAliases';
import { canonicalWarehouseMaterialCode, normalizeWarehouseCodeKey } from './warehouseWeight';

test('old pipe code is canonical across nested input and warehouse matching, without changing quantities', () => {
  const input = { items: [{ ma_nvl: 'ONG-20cm', so_luong: 70 }, { ma_nvl: 'ONG-19.5CM', so_luong: 19 }], key: 'LSX079|ONG-20CM' };
  assert.deepEqual(canonicalizeMaterialCodePayload(input), {
    items: [{ ma_nvl: 'ONG-19.5CM', so_luong: 70 }, { ma_nvl: 'ONG-19.5CM', so_luong: 19 }], key: 'LSX079|ONG-19.5CM'
  });
  assert.equal(input.items[0].ma_nvl, 'ONG-20cm');
  assert.equal(normalizeWarehouseCodeKey(' ong-20cm '), 'ONG-19.5CM');
  assert.equal(canonicalWarehouseMaterialCode('ONG-20cm'), 'ONG-19.5CM');
  assert.equal(canonicalWarehouseMaterialCode('ONGGIAY20'), 'ONG-19.5CM');
  assert.equal(canonicalizeMaterialCodePayload('ONG-20CM2'), 'ONG-20CM2');
});
