import { normalizeBbLyDoToken } from './bbBaoCaoLyDo';

/** Khoa DB: ngay|ca|may|ma_lenh — khớp 1 dòng đánh giá theo lệnh. */
export function buildBbPhanTichStableKey(input: {
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  maLenh?: string | null;
}) {
  return [
    String(input.ngay || '').trim(),
    normalizeBbLyDoToken(input.ca),
    normalizeBbLyDoToken(input.may),
    normalizeBbLyDoToken(input.maLenh)
  ].join('|');
}

export type BbPhanTichDanhGiaRow = {
  id?: string;
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  ma_lenh: string;
  group_key?: string | null;
  noi_dung: string;
  nguoi_lap?: string | null;
};
