import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  batchToRecords,
  parseMaterialConversion,
  parseMaterialConversionBatch,
  type MaterialConversionInput
} from './validation';

const TABLE = 'quy_doi_vat_lieu';
const isId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function queryText(value: unknown, maxLen = 100) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function queryDate(value: unknown) {
  const raw = queryText(value, 32);
  return ISO_DATE.test(raw) ? raw : '';
}

export function materialConversionRouter(client: SupabaseClient | null) {
  const router = Router();
  router.use((_req, res, next) => {
    if (!client) return res.status(503).json({ error: 'Supabase chưa được cấu hình.' });
    next();
  });
  const errorText = (error: { code?: string; message: string }) => {
    const msg = error.message || '';
    const schemaMiss =
      error.code === 'PGRST204' ||
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      error.code === '42703' ||
      /column .* does not exist/i.test(msg) ||
      /schema cache/i.test(msg);
    if (!schemaMiss) return msg;
    if (/chieu_dai_|dinh_muc|kich_thuoc_tong|trong_luong_tren_cai_|ghi_chu_/i.test(msg)) {
      return 'Chưa có cột cắt lõi (hoặc schema cache chưa reload). Chạy lại supabase-quy-doi-vat-lieu-cat-loi.sql rồi Settings → API → Reload schema.';
    }
    if (/nguon_lay|nguon_toi/i.test(msg)) {
      return 'Chưa có cột nguon_lay / nguon_toi. Chạy supabase-quy-doi-vat-lieu-nguon.sql trên DB chính.';
    }
    if (/khoi_luong/i.test(msg)) {
      return 'Chưa có cột khoi_luong_goc / khoi_luong_quy_doi. Chạy supabase-quy-doi-vat-lieu-khoi-luong.sql trên DB chính.';
    }
    if (/nhom_id/i.test(msg)) {
      return 'Chưa có cột nhom_id. Chạy supabase-quy-doi-vat-lieu-nhom.sql trên DB chính Supabase.';
    }
    return 'Chưa có bảng/cột quy_doi_vat_lieu. Chạy supabase-quy-doi-vat-lieu.sql trên DB chính Supabase.';
  };

  /** Không fallback strip cột — bắt buộc đủ schema. */
  async function insertRows(records: MaterialConversionInput[]) {
    return client!.from(TABLE).insert(records).select('*');
  }

  async function updateRow(id: string, record: MaterialConversionInput) {
    const payload = { ...record, updated_at: new Date().toISOString() };
    return client!.from(TABLE).update(payload).eq('id', id).select('*').maybeSingle();
  }

  router.get('/', async (req, res) => {
    try {
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      if (!Number.isSafeInteger(page) || page > 1000000) return res.status(400).json({ error: 'Trang không hợp lệ.' });
      const search = queryText(req.query.search, 500);
      const ca = queryText(req.query.ca);
      const maMay = queryText(req.query.ma_may ?? req.query.machineCode);
      const nhomId = queryText(req.query.nhom_id, 36);
      const ngay = queryDate(req.query.ngay);
      const tuNgay = queryDate(req.query.tu_ngay ?? req.query.fromDate ?? req.query.dateFrom) || ngay;
      const denNgay = queryDate(req.query.den_ngay ?? req.query.toDate ?? req.query.dateTo) || ngay;

      let query = client!.from(TABLE).select('*', { count: 'exact' });
      if (tuNgay) query = query.gte('ngay', tuNgay);
      if (denNgay) query = query.lte('ngay', denNgay);
      if (ca && ca !== 'all') query = query.eq('ca', ca);
      if (maMay && maMay !== 'all') query = query.eq('ma_may', maMay);
      if (nhomId && isId(nhomId)) query = query.eq('nhom_id', nhomId);
      if (search) {
        // Loại ký tự cú pháp PostgREST trước khi tạo điều kiện OR.
        const safe = search.replace(/[,%_()."\\]/g, ' ').trim();
        if (safe) {
          query = query.or(
            `vat_tu_goc.ilike.%${safe}%,vat_tu_quy_doi.ilike.%${safe}%,ca.ilike.%${safe}%,ma_may.ilike.%${safe}%`
          );
        }
      }
      const fetchAll =
        req.query.all === '1' ||
        req.query.all === 'true' ||
        String(req.query.all || '').toLowerCase() === 'yes';

      if (fetchAll) {
        // BB / báo cáo cần đủ phiếu trong khoảng ngày (không phân trang 50).
        const PAGE = 1000;
        const MAX = 10000;
        const records: unknown[] = [];
        let from = 0;
        let total = 0;
        while (from < MAX) {
          const pageQuery = client!
            .from(TABLE)
            .select('*', { count: from === 0 ? 'exact' : undefined });
          let q = pageQuery;
          if (tuNgay) q = q.gte('ngay', tuNgay);
          if (denNgay) q = q.lte('ngay', denNgay);
          if (ca && ca !== 'all') q = q.eq('ca', ca);
          if (maMay && maMay !== 'all') q = q.eq('ma_may', maMay);
          if (nhomId && isId(nhomId)) q = q.eq('nhom_id', nhomId);
          if (search) {
            const safe = search.replace(/[,%_()."\\]/g, ' ').trim();
            if (safe) {
              q = q.or(
                `vat_tu_goc.ilike.%${safe}%,vat_tu_quy_doi.ilike.%${safe}%,ca.ilike.%${safe}%,ma_may.ilike.%${safe}%`
              );
            }
          }
          const { data, count, error } = await q
            .order('ngay', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, from + PAGE - 1);
          if (error) return res.status(500).json({ error: errorText(error) });
          if (from === 0) total = count ?? 0;
          const batch = data ?? [];
          records.push(...batch);
          if (batch.length < PAGE) break;
          from += PAGE;
        }
        return res.json({ records, total: total || records.length });
      }

      const { data, count, error } = await query.order('ngay', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range((page - 1) * 50, page * 50 - 1);
      if (error) return res.status(500).json({ error: errorText(error) });
      return res.json({ records: data ?? [], total: count ?? 0 });
    } catch {
      return res.status(500).json({ error: 'Không thể tải quy đổi vật liệu.' });
    }
  });

  router.post('/', async (req, res) => {
    const batch = parseMaterialConversionBatch(req.body);
    if (batch) {
      const nhomId = batch.nhom_id && isId(batch.nhom_id) ? batch.nhom_id : randomUUID();
      const records = batchToRecords(batch, nhomId);
      try {
        const { data, error } = await insertRows(records);
        if (error) return res.status(500).json({ error: errorText(error) });
        return res.status(201).json({ records: data ?? [], nhom_id: nhomId });
      } catch {
        return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
      }
    }

    const record = parseMaterialConversion(req.body);
    if (!record) {
      return res.status(400).json({
        error: 'Nhập đủ Ngày · Ca · Máy, vật tư gốc và ít nhất một vật tư quy đổi (số lượng > 0).'
      });
    }
    const withNhom: MaterialConversionInput = {
      ...record,
      nhom_id: record.nhom_id && isId(record.nhom_id) ? record.nhom_id : randomUUID()
    };
    try {
      const { data, error } = await insertRows([withNhom]);
      if (error) return res.status(500).json({ error: errorText(error) });
      const row = data?.[0] ?? null;
      if (!row) return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
      return res.status(201).json({ record: row });
    } catch {
      return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
    }
  });

  router.put('/nhom/:nhomId', async (req, res) => {
    const nhomId = String(req.params.nhomId || '');
    if (!isId(nhomId)) return res.status(400).json({ error: 'ID nhóm không hợp lệ.' });
    const batch = parseMaterialConversionBatch({ ...req.body, nhom_id: nhomId });
    if (!batch) {
      return res.status(400).json({
        error: 'Nhập đủ Ngày · Ca · Máy, vật tư gốc và ít nhất một vật tư quy đổi (số lượng > 0).'
      });
    }
    try {
      const existing = await client!.from(TABLE).select('id').eq('nhom_id', nhomId);
      if (existing.error) return res.status(500).json({ error: errorText(existing.error) });
      const existingIds = new Set((existing.data ?? []).map(row => String(row.id)));
      if (existingIds.size === 0) return res.status(404).json({ error: 'Không tìm thấy nhóm quy đổi.' });

      const keepIds = new Set<string>();
      const updatedRecords: Record<string, unknown>[] = [];
      const toInsert: MaterialConversionInput[] = [];

      for (const destination of batch.destinations) {
        const record = batchToRecords(
          { ...batch, destinations: [destination] },
          nhomId
        )[0];
        if (destination.id && existingIds.has(destination.id)) {
          keepIds.add(destination.id);
          const { data, error } = await updateRow(destination.id, record);
          if (error) return res.status(500).json({ error: errorText(error) });
          if (data) updatedRecords.push(data);
        } else {
          toInsert.push(record);
        }
      }

      const deleteIds = [...existingIds].filter(id => !keepIds.has(id));
      if (deleteIds.length > 0) {
        const { error } = await client!.from(TABLE).delete().in('id', deleteIds);
        if (error) return res.status(500).json({ error: errorText(error) });
      }

      if (toInsert.length > 0) {
        const { data, error } = await insertRows(toInsert);
        if (error) return res.status(500).json({ error: errorText(error) });
        updatedRecords.push(...(data ?? []));
      }

      return res.json({ records: updatedRecords, nhom_id: nhomId });
    } catch {
      return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
    }
  });

  router.put('/:id', async (req, res) => {
    const record = parseMaterialConversion(req.body);
    if (!record) {
      return res.status(400).json({
        error: 'Nhập đủ Ngày · Ca · Máy, hai vật tư (tối đa 500 ký tự) và số lượng lớn hơn 0.'
      });
    }
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'ID không hợp lệ.' });
    try {
      const { data, error } = await updateRow(id, record);
      if (error) return res.status(500).json({ error: errorText(error) });
      if (!data) return res.status(404).json({ error: 'Không tìm thấy quy đổi vật liệu.' });
      return res.json({ record: data });
    } catch {
      return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
    }
  });

  router.delete('/nhom/:nhomId', async (req, res) => {
    const nhomId = String(req.params.nhomId || '');
    if (!isId(nhomId)) return res.status(400).json({ error: 'ID nhóm không hợp lệ.' });
    try {
      const { data, error } = await client!.from(TABLE).delete().eq('nhom_id', nhomId).select('id');
      if (error) return res.status(500).json({ error: errorText(error) });
      if (!data || data.length === 0) return res.status(404).json({ error: 'Không tìm thấy nhóm quy đổi.' });
      return res.json({ success: true, deleted: data.length });
    } catch {
      return res.status(500).json({ error: 'Không thể xóa quy đổi vật liệu.' });
    }
  });

  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id || '');
    if (!isId(id)) return res.status(400).json({ error: 'ID không hợp lệ.' });
    try {
      const { data, error } = await client!.from(TABLE).delete().eq('id', id).select('id').maybeSingle();
      if (error) return res.status(500).json({ error: errorText(error) });
      if (!data) return res.status(404).json({ error: 'Không tìm thấy quy đổi vật liệu.' });
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Không thể xóa quy đổi vật liệu.' });
    }
  });
  return router;
}
