import type { CanTuDongRecord } from '../features/can-tu-dong';
import { shiftIsoDateByDays } from './shiftSettings';

export type CanTuDongTongHopRow = {
  id?: string;
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  so_cuon: number;
  tong_trong_luong_kg: number;
  tong_trong_luong_nhua_kg: number;
  updated_at?: string;
};

export function buildCanTuDongTongHopKey(ngay: string, ca: string, may: string) {
  return [String(ngay || '').trim(), String(ca || '').trim() || '-', String(may || '').trim() || '-'].join(
    '|'
  );
}

export function sumCanTuDongTongHopRows(rows: CanTuDongTongHopRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.so_cuon += Number(row.so_cuon) || 0;
      acc.tong_trong_luong_kg += Number(row.tong_trong_luong_kg) || 0;
      acc.tong_trong_luong_nhua_kg += Number(row.tong_trong_luong_nhua_kg) || 0;
      return acc;
    },
    { so_cuon: 0, tong_trong_luong_kg: 0, tong_trong_luong_nhua_kg: 0 }
  );
}

/** Tải phiếu cân không ảnh — chỉ dùng khi Tính toán / in, không dùng lúc mở trang. */
export async function fetchCanTuDongSlimRecords(opts: {
  from?: string;
  to?: string;
}): Promise<CanTuDongRecord[]> {
  const from = String(opts.from || '').trim();
  const to = String(opts.to || '').trim();
  const params = new URLSearchParams();
  params.set('limit', '10000');
  params.set('images', '0');
  params.set('dateBy', 'ngay');
  if (from) params.set('from', shiftIsoDateByDays(from, -3) || from);
  if (to) params.set('to', shiftIsoDateByDays(to, 3) || to);
  const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || 'Không tải được cân tự động.'));
  return Array.isArray(data?.records) ? (data.records as CanTuDongRecord[]) : [];
}

export async function fetchCanTuDongTongHop(opts: {
  from?: string;
  to?: string;
}): Promise<CanTuDongTongHopRow[]> {
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const qs = params.toString();
  const res = await fetch(qs ? `/api/can-tu-dong-tong-hop?${qs}` : '/api/can-tu-dong-tong-hop');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || 'Không tải được tổng hợp cân thực tế.'));
  return Array.isArray(data?.items) ? (data.items as CanTuDongTongHopRow[]) : [];
}

export async function syncCanTuDongTongHop(opts: {
  from?: string;
  to?: string;
  rebuild?: boolean;
}): Promise<{ items: CanTuDongTongHopRow[]; total: number }> {
  const res = await fetch('/api/can-tu-dong-tong-hop/dong-bo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opts.from || '',
      to: opts.to || '',
      rebuild: opts.rebuild !== false
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error || 'Không đồng bộ được tổng hợp cân thực tế.'));
  return {
    items: Array.isArray(data?.items) ? (data.items as CanTuDongTongHopRow[]) : [],
    total: Number(data?.total) || 0
  };
}
