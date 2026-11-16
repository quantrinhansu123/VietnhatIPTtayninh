export type MaterialConversionInput = {
  ngay: string;
  ca: string;
  ma_may: string;
  vat_tu_goc: string;
  so_luong_goc: number;
  vat_tu_quy_doi: string;
  so_luong_quy_doi: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, maxLen: number) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return '';
  return trimmed;
}

function quantity(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN;
  return Number(String(value).trim().replace(',', '.'));
}

function parseIsoDate(value: unknown) {
  const raw = text(value, 32);
  if (!ISO_DATE.test(raw)) return '';
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return raw;
}

export function parseMaterialConversion(body: unknown): MaterialConversionInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const record: MaterialConversionInput = {
    ngay: parseIsoDate(value.ngay),
    ca: text(value.ca, 100),
    ma_may: text(value.ma_may, 100),
    vat_tu_goc: text(value.vat_tu_goc, 500),
    so_luong_goc: quantity(value.so_luong_goc),
    vat_tu_quy_doi: text(value.vat_tu_quy_doi, 500),
    so_luong_quy_doi: quantity(value.so_luong_quy_doi)
  };
  if (
    !record.ngay ||
    !record.ca ||
    record.ca === '-' ||
    !record.ma_may ||
    !record.vat_tu_goc ||
    !record.vat_tu_quy_doi ||
    !Number.isFinite(record.so_luong_goc) ||
    record.so_luong_goc <= 0 ||
    !Number.isFinite(record.so_luong_quy_doi) ||
    record.so_luong_quy_doi <= 0
  ) {
    return null;
  }
  return record;
}
