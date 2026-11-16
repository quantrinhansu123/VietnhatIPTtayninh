import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMaterialConversion } from './validation';
import { materialConversionRouter } from './server';
import { buildConversionMaterialOptions, formatConversionMaterial } from './materials';

const input = {
  ngay: '2026-11-15',
  ca: '12C1',
  ma_may: 'MBB_16',
  vat_tu_goc: 'NVL-A',
  so_luong_goc: 2,
  vat_tu_quy_doi: 'NVL-B',
  so_luong_quy_doi: 3
};

test('Kho NVL options: normalize, deduplicate codes, preserve names and units', () => {
  const options = buildConversionMaterialOptions({ materials: [
    { ma_npl: ' B ', ten_npl: 'Nhựa B', don_vi: 'Kg' },
    { ma_npl: 'A', ten_npl: 'Lõi A', don_vi: 'Cái' },
    { ma_npl: 'B', ten_npl: 'Duplicate' }, { ten_npl: 'Không có mã' }, null
  ] });
  assert.deepEqual(options.map(item => item.code), ['A', 'B']);
  assert.equal(formatConversionMaterial(options[1]), 'B · Nhựa B · Kg');
  assert.deepEqual(buildConversionMaterialOptions(null), []);
  assert.deepEqual(buildConversionMaterialOptions({ materials: 'invalid' }), []);
});

test('validation: requires ngay/ca/may, trims materials, accepts decimal comma', () => {
  assert.deepEqual(
    parseMaterialConversion({ ...input, vat_tu_goc: ' NVL-A ', so_luong_goc: '2,5' }),
    { ...input, so_luong_goc: 2.5 }
  );
  for (const value of [0, -1, '', null, true, [], {}, Infinity, NaN, 'abc']) {
    assert.equal(parseMaterialConversion({ ...input, so_luong_goc: value }), null);
    assert.equal(parseMaterialConversion({ ...input, so_luong_quy_doi: value }), null);
  }
  assert.equal(parseMaterialConversion({ ...input, vat_tu_goc: ' ' }), null);
  assert.equal(parseMaterialConversion({ ...input, vat_tu_quy_doi: 'x'.repeat(501) }), null);
  assert.equal(parseMaterialConversion({ ...input, ngay: '15/11/2026' }), null);
  assert.equal(parseMaterialConversion({ ...input, ca: '' }), null);
  assert.equal(parseMaterialConversion({ ...input, ma_may: ' ' }), null);
});

test('API: CRUD, pagination, date/shift/machine filters and missing records', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  let saved: Record<string, unknown> | null = null;
  let operation = 'read';
  let requestedId: string | undefined;
  const filters: Record<string, string> = {};
  const query = {
    select() { return this; },
    order() { return this; },
    or() { return this; },
    gte(key: string, value: string) { filters[`${key}_gte`] = value; return this; },
    lte(key: string, value: string) { filters[`${key}_lte`] = value; return this; },
    eq(key: string, value: string) {
      if (key === 'id') requestedId = value;
      else filters[key] = value;
      return this;
    },
    insert(value: Record<string, unknown>) { operation = 'insert'; saved = { ...value, id }; return this; },
    update(value: Record<string, unknown>) { operation = 'update'; if (saved) saved = { ...saved, ...value }; return this; },
    delete() { operation = 'delete'; return this; },
    async range(from: number, to: number) {
      assert.equal(from, 0); assert.equal(to, 49);
      return { data: saved ? [saved] : [], count: saved ? 1 : 0, error: null };
    },
    async maybeSingle() {
      const data = operation === 'insert' || requestedId === id ? saved : null;
      if (operation === 'delete') saved = null;
      return { data, error: null };
    }
  };
  const client = { from(table: string) { assert.equal(table, 'quy_doi_vat_lieu'); operation = 'read'; requestedId = undefined; return query; } } as unknown as SupabaseClient;
  const app = express();
  app.use(express.json());
  app.use('/api/quy-doi-vat-lieu', materialConversionRouter(client));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/quy-doi-vat-lieu`;
  const request = (path: string, method: string, body?: unknown) => fetch(url + path, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
  });
  try {
    assert.equal((await request('', 'POST', { ...input, so_luong_goc: -1 })).status, 400);
    assert.equal((await request('', 'POST', { ...input, ngay: '' })).status, 400);
    const created = await request('', 'POST', input);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).record.id, id);
    Object.keys(filters).forEach(key => { delete filters[key]; });
    const list = await request('?search=NVL&tu_ngay=2026-11-15&den_ngay=2026-11-15&ca=12C1&ma_may=MBB_16', 'GET');
    assert.equal((await list.json()).total, 1);
    assert.equal(filters.ngay_gte, '2026-11-15');
    assert.equal(filters.ngay_lte, '2026-11-15');
    assert.equal(filters.ca, '12C1');
    assert.equal(filters.ma_may, 'MBB_16');
    const updated = await request(`/${id}`, 'PUT', { ...input, so_luong_quy_doi: 8 });
    assert.equal((await updated.json()).record.so_luong_quy_doi, 8);
    assert.equal((await request('/bad-id', 'PUT', input)).status, 400);
    assert.equal((await request('/22222222-2222-4222-8222-222222222222', 'PUT', input)).status, 404);
    assert.equal((await request(`/${id}`, 'DELETE')).status, 200);
    assert.equal((await request(`/${id}`, 'DELETE')).status, 404);
    assert.equal((await (await request('', 'GET')).json()).total, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
