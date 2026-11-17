import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMaterialConversion, parseMaterialConversionBatch } from './validation';
import { materialConversionRouter } from './server';
import {
  buildConversionMaterialOptions,
  calcDestQuantity,
  calcKichThuocTong,
  formatConversionMaterial,
  inferUnitLengthCm,
  resolveDestUnitWeight
} from './materials';

const input = {
  ngay: '2026-11-15',
  ca: '12C1',
  ma_may: 'MBB_16',
  vat_tu_goc: 'NVL-A',
  so_luong_goc: 2,
  khoi_luong_goc: null as number | null,
  chieu_dai_goc: null as number | null,
  trong_luong_tren_cai_goc: null as number | null,
  ghi_chu_goc: null as string | null,
  nguon_lay: null as string | null,
  vat_tu_quy_doi: 'NVL-B',
  so_luong_quy_doi: 3,
  khoi_luong_quy_doi: null as number | null,
  chieu_dai_quy_doi: null as number | null,
  dinh_muc: null as number | null,
  kich_thuoc_tong: null as number | null,
  trong_luong_tren_cai_quy_doi: null as number | null,
  ghi_chu_quy_doi: null as string | null,
  nguon_toi: null as string | null
};

test('Kho NVL options: normalize, deduplicate codes, preserve names, units, weight and length', () => {
  const options = buildConversionMaterialOptions({ materials: [
    { ma_npl: ' B ', ten_npl: 'Nhựa B', don_vi: 'Kg', tong_trong_luong: '1,25', chieu_dai_don_vi: 30 },
    { ma_npl: 'A', ten_npl: 'Lõi A', don_vi: 'Cái', tong_trong_luong: 0.08, chieu_dai_don_vi: '138' },
    { ma_npl: 'B', ten_npl: 'Duplicate' }, { ten_npl: 'Không có mã' }, null
  ] });
  assert.deepEqual(options.map(item => item.code), ['A', 'B']);
  assert.equal(options[0].unitWeight, 0.08);
  assert.equal(options[0].unitLength, 138);
  assert.equal(options[1].unitWeight, 1.25);
  assert.equal(options[1].unitLength, 30);
  assert.equal(formatConversionMaterial(options[1]), 'B · Nhựa B · Kg');
  assert.deepEqual(buildConversionMaterialOptions(null), []);
  assert.deepEqual(buildConversionMaterialOptions({ materials: 'invalid' }), []);
});

test('cắt lõi helpers: ĐM → SL đích, KT tổng, TL/cái tỷ lệ chiều dài', () => {
  assert.equal(inferUnitLengthCm('ONG-1.38M'), 138);
  assert.equal(inferUnitLengthCm('ONG-30CM', 'Ống giấy 30cm'), 30);
  assert.equal(calcDestQuantity(133, 4), 532);
  assert.equal(calcKichThuocTong(30, 4), 120);
  assert.equal(
    resolveDestUnitWeight({ catalogWeight: 0.082, sourceWeight: 0.38, sourceLength: 138, destLength: 30 }),
    0.082
  );
  const proportional = resolveDestUnitWeight({
    catalogWeight: null,
    sourceWeight: 0.38,
    sourceLength: 138,
    destLength: 30
  });
  // round6: 0.38/138*30 ≈ 0.082609
  assert.equal(proportional, Math.round((0.38 / 138) * 30 * 1e6) / 1e6);
});

test('validation: requires ngay/ca/may, trims materials, accepts decimal comma', () => {
  assert.deepEqual(
    parseMaterialConversion({ ...input, vat_tu_goc: ' NVL-A ', so_luong_goc: '2,5' }),
    { ...input, so_luong_goc: 2.5 }
  );
  assert.deepEqual(
    parseMaterialConversion({
      ...input,
      khoi_luong_goc: '1,25',
      khoi_luong_quy_doi: 3,
      chieu_dai_goc: '138',
      dinh_muc: '4',
      kich_thuoc_tong: 120,
      nguon_lay: ' Tồn máy ',
      nguon_toi: 'Kho NVL',
      ghi_chu_goc: ' Ống nguyên ',
      ghi_chu_quy_doi: 'Lõi tận dụng'
    }),
    {
      ...input,
      khoi_luong_goc: 1.25,
      khoi_luong_quy_doi: 3,
      chieu_dai_goc: 138,
      dinh_muc: 4,
      kich_thuoc_tong: 120,
      nguon_lay: 'Tồn máy',
      nguon_toi: 'Kho NVL',
      ghi_chu_goc: 'Ống nguyên',
      ghi_chu_quy_doi: 'Lõi tận dụng'
    }
  );
  assert.equal(parseMaterialConversion({ ...input, khoi_luong_goc: -1 }), null);
  assert.equal(parseMaterialConversion({ ...input, dinh_muc: 0 }), null);
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

test('validation batch: 1 nguồn → nhiều đích, không trùng mã đích', () => {
  const batch = parseMaterialConversionBatch({
    ngay: '2026-11-15',
    ca: '12C1',
    ma_may: 'MBB_16',
    vat_tu_goc: 'NVL-A',
    so_luong_goc: '133',
    khoi_luong_goc: '50,54',
    chieu_dai_goc: 138,
    trong_luong_tren_cai_goc: 0.38,
    ghi_chu_goc: 'Ống nguyên',
    nguon_lay: 'Tồn máy',
    destinations: [
      {
        vat_tu_quy_doi: 'NVL-B',
        so_luong_quy_doi: '532',
        khoi_luong_quy_doi: 43.62,
        chieu_dai_quy_doi: 30,
        dinh_muc: 4,
        kich_thuoc_tong: 120,
        trong_luong_tren_cai_quy_doi: 0.082,
        ghi_chu_quy_doi: null,
        nguon_toi: 'Tồn bồn'
      },
      {
        vat_tu_quy_doi: 'NVL-C',
        so_luong_quy_doi: 133,
        khoi_luong_quy_doi: null,
        chieu_dai_quy_doi: 18,
        dinh_muc: 1,
        kich_thuoc_tong: 18,
        trong_luong_tren_cai_quy_doi: null,
        ghi_chu_quy_doi: 'Lõi tận dụng'
      }
    ]
  });
  assert.equal(batch?.destinations.length, 2);
  assert.equal(batch?.chieu_dai_goc, 138);
  assert.equal(batch?.destinations[0].dinh_muc, 4);
  assert.equal(batch?.destinations[0].kich_thuoc_tong, 120);
  assert.equal(batch?.destinations[1].ghi_chu_quy_doi, 'Lõi tận dụng');
  assert.equal(
    parseMaterialConversionBatch({
      ...input,
      destinations: [
        { vat_tu_quy_doi: 'NVL-B', so_luong_quy_doi: 1 },
        { vat_tu_quy_doi: 'nvl-b', so_luong_quy_doi: 2 }
      ]
    }),
    null
  );
  assert.equal(parseMaterialConversionBatch({ ...input, destinations: [] }), null);
});

test('API: CRUD, batch 1→N, pagination, date/shift/machine filters and missing records', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';
  let saved: Record<string, unknown>[] = [];
  let operation = 'read';
  let requestedId: string | undefined;
  let requestedNhomId: string | undefined;
  let deleteIds: string[] = [];
  const filters: Record<string, string> = {};
  const query = {
    select() { return this; },
    order() { return this; },
    or() { return this; },
    gte(key: string, value: string) { filters[`${key}_gte`] = value; return this; },
    lte(key: string, value: string) { filters[`${key}_lte`] = value; return this; },
    eq(key: string, value: string) {
      if (key === 'id') requestedId = value;
      else if (key === 'nhom_id') requestedNhomId = value;
      else filters[key] = value;
      return this;
    },
    in(key: string, values: string[]) {
      if (key === 'id') deleteIds = values;
      return this;
    },
    insert(value: Record<string, unknown> | Record<string, unknown>[]) {
      operation = 'insert';
      const rows = Array.isArray(value) ? value : [value];
      saved = rows.map((row, index) => ({
        ...row,
        id: index === 0 ? id : id2
      }));
      return this;
    },
    update(value: Record<string, unknown>) {
      operation = 'update';
      (query as { _pendingUpdate?: Record<string, unknown> })._pendingUpdate = value;
      return this;
    },
    delete() { operation = 'delete'; return this; },
    then(resolve: (value: { data: Record<string, unknown>[] | null; count: number | null; error: null }) => void) {
      if (operation === 'delete') {
        if (requestedNhomId) {
          const before = saved.length;
          saved = saved.filter(row => row.nhom_id !== requestedNhomId);
          return resolve({ data: before === saved.length ? [] : [{ id }], count: null, error: null });
        }
        if (deleteIds.length > 0) {
          saved = saved.filter(row => !deleteIds.includes(String(row.id)));
          return resolve({ data: deleteIds.map(item => ({ id: item })), count: null, error: null });
        }
        const found = saved.find(row => row.id === requestedId);
        saved = saved.filter(row => row.id !== requestedId);
        return resolve({ data: found ? [found] : [], count: null, error: null });
      }
      if (requestedNhomId) {
        return resolve({
          data: saved.filter(row => row.nhom_id === requestedNhomId).map(row => ({ id: row.id })),
          count: null,
          error: null
        });
      }
      return resolve({ data: saved, count: saved.length, error: null });
    },
    async range(from: number, to: number) {
      assert.equal(from, 0); assert.equal(to, 49);
      return { data: saved, count: saved.length, error: null };
    },
    async maybeSingle() {
      if (operation === 'delete') {
        const found = saved.find(row => row.id === requestedId) || null;
        saved = saved.filter(row => row.id !== requestedId);
        return { data: found ? { id: found.id } : null, error: null };
      }
      if (operation === 'update') {
        const pending = (query as { _pendingUpdate?: Record<string, unknown> })._pendingUpdate || {};
        const index = saved.findIndex(row => row.id === requestedId);
        if (index < 0) return { data: null, error: null };
        saved[index] = { ...saved[index], ...pending };
        return { data: saved[index], error: null };
      }
      const data =
        operation === 'insert'
          ? saved[0] || null
          : saved.find(row => row.id === requestedId) || null;
      return { data, error: null };
    }
  };
  const client = {
    from(table: string) {
      assert.equal(table, 'quy_doi_vat_lieu');
      operation = 'read';
      requestedId = undefined;
      requestedNhomId = undefined;
      deleteIds = [];
      return query;
    }
  } as unknown as SupabaseClient;
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

    const batch = await request('', 'POST', {
      ngay: '2026-11-15',
      ca: '12C1',
      ma_may: 'MBB_16',
      vat_tu_goc: 'NVL-A',
      so_luong_goc: 133,
      khoi_luong_goc: 50.54,
      chieu_dai_goc: 138,
      trong_luong_tren_cai_goc: 0.38,
      ghi_chu_goc: 'Ống nguyên',
      destinations: [
        {
          vat_tu_quy_doi: 'NVL-B',
          so_luong_quy_doi: 532,
          khoi_luong_quy_doi: 43.62,
          chieu_dai_quy_doi: 30,
          dinh_muc: 4,
          kich_thuoc_tong: 120,
          trong_luong_tren_cai_quy_doi: 0.082
        },
        {
          vat_tu_quy_doi: 'NVL-C',
          so_luong_quy_doi: 133,
          khoi_luong_quy_doi: 6.916,
          chieu_dai_quy_doi: 18,
          dinh_muc: 1,
          kich_thuoc_tong: 18,
          trong_luong_tren_cai_quy_doi: 0.052
        }
      ]
    });
    assert.equal(batch.status, 201);
    const batchData = await batch.json();
    assert.equal(batchData.records.length, 2);
    assert.ok(batchData.nhom_id);
    assert.equal(batchData.records[0].dinh_muc, 4);
    assert.equal(batchData.records[0].chieu_dai_goc, 138);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
