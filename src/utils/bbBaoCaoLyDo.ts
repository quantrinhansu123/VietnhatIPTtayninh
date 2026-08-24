import { normalizeProductCodeKey } from '../features/san-pham/types';

/** Chuẩn hóa token trong khóa ổn định lý do BB. */
export function normalizeBbLyDoToken(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Khoa DB: ngay|ca|may|ma_lenh|ma_sp */
export function buildBbLyDoStableKey(input: {
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  maLenh?: string | null;
  maSp?: string | null;
}) {
  return [
    String(input.ngay || '').trim(),
    normalizeBbLyDoToken(input.ca),
    normalizeBbLyDoToken(input.may),
    normalizeBbLyDoToken(input.maLenh),
    normalizeProductCodeKey(String(input.maSp || ''))
  ].join('|');
}

export function printLyDoLineKey(orderGroupKey: string, lineKey: string) {
  return `${orderGroupKey}::${lineKey}`;
}

export type BbBaoCaoLyDoRow = {
  id?: string;
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  ma_lenh: string;
  ma_sp: string;
  ten_sp?: string | null;
  group_key?: string | null;
  line_key?: string | null;
  ly_do: string;
  ghi_chu: string;
};
