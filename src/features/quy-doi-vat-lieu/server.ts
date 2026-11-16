import { Router } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseMaterialConversion } from './validation';

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
  const errorText = (error: { code?: string; message: string }) =>
    error.code === 'PGRST205' || error.code === '42P01' || /column .* does not exist/i.test(error.message)
      ? 'Chưa có bảng/cột quy_doi_vat_lieu (ngay, ca, ma_may). Chạy supabase-quy-doi-vat-lieu.sql trên DB chính Supabase.'
      : error.message;

  router.get('/', async (req, res) => {
    try {
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      if (!Number.isSafeInteger(page) || page > 1000000) return res.status(400).json({ error: 'Trang không hợp lệ.' });
      const search = queryText(req.query.search, 500);
      const ca = queryText(req.query.ca);
      const maMay = queryText(req.query.ma_may ?? req.query.machineCode);
      const ngay = queryDate(req.query.ngay);
      const tuNgay = queryDate(req.query.tu_ngay ?? req.query.fromDate ?? req.query.dateFrom) || ngay;
      const denNgay = queryDate(req.query.den_ngay ?? req.query.toDate ?? req.query.dateTo) || ngay;

      let query = client!.from(TABLE).select('*', { count: 'exact' });
      if (tuNgay) query = query.gte('ngay', tuNgay);
      if (denNgay) query = query.lte('ngay', denNgay);
      if (ca && ca !== 'all') query = query.eq('ca', ca);
      if (maMay && maMay !== 'all') query = query.eq('ma_may', maMay);
      if (search) {
        // Loại ký tự cú pháp PostgREST trước khi tạo điều kiện OR.
        const safe = search.replace(/[,%_()."\\]/g, ' ').trim();
        if (safe) {
          query = query.or(
            `vat_tu_goc.ilike.%${safe}%,vat_tu_quy_doi.ilike.%${safe}%,ca.ilike.%${safe}%,ma_may.ilike.%${safe}%`
          );
        }
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

  for (const method of ['post', 'put'] as const) {
    router[method](method === 'post' ? '/' : '/:id', async (req, res) => {
      const record = parseMaterialConversion(req.body);
      if (!record) {
        return res.status(400).json({
          error: 'Nhập đủ Ngày · Ca · Máy, hai vật tư (tối đa 500 ký tự) và số lượng lớn hơn 0.'
        });
      }
      const id = 'id' in req.params ? String(req.params.id || '') : '';
      if (method === 'put' && !isId(id)) return res.status(400).json({ error: 'ID không hợp lệ.' });
      try {
        const query = method === 'post' ? client!.from(TABLE).insert(record)
          : client!.from(TABLE).update({ ...record, updated_at: new Date().toISOString() }).eq('id', id);
        const { data, error } = await query.select('*').maybeSingle();
        if (error) return res.status(500).json({ error: errorText(error) });
        if (!data) return res.status(404).json({ error: 'Không tìm thấy quy đổi vật liệu.' });
        return res.status(method === 'post' ? 201 : 200).json({ record: data });
      } catch {
        return res.status(500).json({ error: 'Không thể lưu quy đổi vật liệu.' });
      }
    });
  }
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
