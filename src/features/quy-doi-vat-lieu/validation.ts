export type MaterialConversionInput = {
  ngay: string;
  ca: string;
  ma_may: string;
  vat_tu_goc: string;
  so_luong_goc: number;
  khoi_luong_goc: number | null;
  chieu_dai_goc: number | null;
  trong_luong_tren_cai_goc: number | null;
  ghi_chu_goc: string | null;
  /** Nguồn lấy (vật tư gốc) — tùy chọn. */
  nguon_lay: string | null;
  vat_tu_quy_doi: string;
  so_luong_quy_doi: number;
  khoi_luong_quy_doi: number | null;
  chieu_dai_quy_doi: number | null;
  dinh_muc: number | null;
  kich_thuoc_tong: number | null;
  trong_luong_tren_cai_quy_doi: number | null;
  ghi_chu_quy_doi: string | null;
  /** Nguồn tới (vật tư quy đổi) — tùy chọn. */
  nguon_toi: string | null;
  nhom_id?: string | null;
};

export type MaterialConversionDestinationInput = {
  id?: string;
  vat_tu_quy_doi: string;
  so_luong_quy_doi: number;
  khoi_luong_quy_doi: number | null;
  chieu_dai_quy_doi: number | null;
  dinh_muc: number | null;
  kich_thuoc_tong: number | null;
  trong_luong_tren_cai_quy_doi: number | null;
  ghi_chu_quy_doi: string | null;
  nguon_toi: string | null;
};

/** 1 nguồn → nhiều đích (cùng Ngày · Ca · Máy · vật tư gốc). */
export type MaterialConversionBatchInput = {
  ngay: string;
  ca: string;
  ma_may: string;
  vat_tu_goc: string;
  so_luong_goc: number;
  khoi_luong_goc: number | null;
  chieu_dai_goc: number | null;
  trong_luong_tren_cai_goc: number | null;
  ghi_chu_goc: string | null;
  nguon_lay: string | null;
  nhom_id?: string | null;
  destinations: MaterialConversionDestinationInput[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Số ≥ 0 — null nếu bỏ trống; NaN nếu không hợp lệ. */
function nonNegNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = quantity(value);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return Math.round(n * 1e6) / 1e6;
}

/** Định mức > 0 — null nếu bỏ trống; NaN nếu không hợp lệ. */
function positiveOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = quantity(value);
  if (!Number.isFinite(n) || n <= 0) return Number.NaN;
  return Math.round(n * 1e6) / 1e6;
}

function parseIsoDate(value: unknown) {
  const raw = text(value, 32);
  if (!ISO_DATE.test(raw)) return '';
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return raw;
}

/** undefined = không gửi; null = gửi rỗng; string = UUID hợp lệ. */
function parseOptionalUuid(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const raw = text(value, 36);
  if (!UUID.test(raw)) return undefined;
  return raw;
}

/** Chuỗi tùy chọn: '' → null; quá dài / không phải string → không hợp lệ (undefined). */
function optionalLabel(value: unknown, maxLen = 500): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) return undefined;
  return trimmed;
}

function parseDestination(value: unknown): MaterialConversionDestinationInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const khoiLuong = nonNegNumber(row.khoi_luong_quy_doi);
  const chieuDai = nonNegNumber(row.chieu_dai_quy_doi);
  const dinhMuc = positiveOrNull(row.dinh_muc);
  const kichThuocTong = nonNegNumber(row.kich_thuoc_tong);
  const tlTrenCai = nonNegNumber(row.trong_luong_tren_cai_quy_doi);
  if (
    Number.isNaN(khoiLuong) ||
    Number.isNaN(chieuDai) ||
    Number.isNaN(dinhMuc) ||
    Number.isNaN(kichThuocTong) ||
    Number.isNaN(tlTrenCai)
  ) {
    return null;
  }
  const nguonToi = optionalLabel(row.nguon_toi, 200);
  const ghiChu = optionalLabel(row.ghi_chu_quy_doi);
  if (nguonToi === undefined || ghiChu === undefined) return null;
  const idRaw = row.id == null || row.id === '' ? undefined : text(row.id, 36);
  if (idRaw !== undefined && !UUID.test(idRaw)) return null;
  const destination: MaterialConversionDestinationInput = {
    vat_tu_quy_doi: text(row.vat_tu_quy_doi, 500),
    so_luong_quy_doi: quantity(row.so_luong_quy_doi),
    khoi_luong_quy_doi: khoiLuong,
    chieu_dai_quy_doi: chieuDai,
    dinh_muc: dinhMuc,
    kich_thuoc_tong: kichThuocTong,
    trong_luong_tren_cai_quy_doi: tlTrenCai,
    ghi_chu_quy_doi: ghiChu,
    nguon_toi: nguonToi
  };
  if (idRaw) destination.id = idRaw;
  if (
    !destination.vat_tu_quy_doi ||
    !Number.isFinite(destination.so_luong_quy_doi) ||
    destination.so_luong_quy_doi <= 0
  ) {
    return null;
  }
  return destination;
}

export function parseMaterialConversion(body: unknown): MaterialConversionInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const khoiLuongGoc = nonNegNumber(value.khoi_luong_goc);
  const khoiLuongQuyDoi = nonNegNumber(value.khoi_luong_quy_doi);
  const chieuDaiGoc = nonNegNumber(value.chieu_dai_goc);
  const tlTrenCaiGoc = nonNegNumber(value.trong_luong_tren_cai_goc);
  const chieuDaiQuyDoi = nonNegNumber(value.chieu_dai_quy_doi);
  const dinhMuc = positiveOrNull(value.dinh_muc);
  const kichThuocTong = nonNegNumber(value.kich_thuoc_tong);
  const tlTrenCaiQuyDoi = nonNegNumber(value.trong_luong_tren_cai_quy_doi);
  if (
    Number.isNaN(khoiLuongGoc) ||
    Number.isNaN(khoiLuongQuyDoi) ||
    Number.isNaN(chieuDaiGoc) ||
    Number.isNaN(tlTrenCaiGoc) ||
    Number.isNaN(chieuDaiQuyDoi) ||
    Number.isNaN(dinhMuc) ||
    Number.isNaN(kichThuocTong) ||
    Number.isNaN(tlTrenCaiQuyDoi)
  ) {
    return null;
  }
  const nguonLay = optionalLabel(value.nguon_lay, 200);
  const nguonToi = optionalLabel(value.nguon_toi, 200);
  const ghiChuGoc = optionalLabel(value.ghi_chu_goc);
  const ghiChuQuyDoi = optionalLabel(value.ghi_chu_quy_doi);
  if (
    nguonLay === undefined ||
    nguonToi === undefined ||
    ghiChuGoc === undefined ||
    ghiChuQuyDoi === undefined
  ) {
    return null;
  }
  const nhomId = parseOptionalUuid(value.nhom_id);
  if (nhomId === undefined && value.nhom_id != null && value.nhom_id !== '') return null;
  const record: MaterialConversionInput = {
    ngay: parseIsoDate(value.ngay),
    ca: text(value.ca, 100),
    ma_may: text(value.ma_may, 100),
    vat_tu_goc: text(value.vat_tu_goc, 500),
    so_luong_goc: quantity(value.so_luong_goc),
    khoi_luong_goc: khoiLuongGoc,
    chieu_dai_goc: chieuDaiGoc,
    trong_luong_tren_cai_goc: tlTrenCaiGoc,
    ghi_chu_goc: ghiChuGoc,
    nguon_lay: nguonLay,
    vat_tu_quy_doi: text(value.vat_tu_quy_doi, 500),
    so_luong_quy_doi: quantity(value.so_luong_quy_doi),
    khoi_luong_quy_doi: khoiLuongQuyDoi,
    chieu_dai_quy_doi: chieuDaiQuyDoi,
    dinh_muc: dinhMuc,
    kich_thuoc_tong: kichThuocTong,
    trong_luong_tren_cai_quy_doi: tlTrenCaiQuyDoi,
    ghi_chu_quy_doi: ghiChuQuyDoi,
    nguon_toi: nguonToi
  };
  if (nhomId) record.nhom_id = nhomId;
  else if (nhomId === null) record.nhom_id = null;
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

export function parseMaterialConversionBatch(body: unknown): MaterialConversionBatchInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const khoiLuongGoc = nonNegNumber(value.khoi_luong_goc);
  const chieuDaiGoc = nonNegNumber(value.chieu_dai_goc);
  const tlTrenCaiGoc = nonNegNumber(value.trong_luong_tren_cai_goc);
  if (Number.isNaN(khoiLuongGoc) || Number.isNaN(chieuDaiGoc) || Number.isNaN(tlTrenCaiGoc)) return null;
  const nguonLay = optionalLabel(value.nguon_lay, 200);
  const ghiChuGoc = optionalLabel(value.ghi_chu_goc);
  if (nguonLay === undefined || ghiChuGoc === undefined) return null;
  const nhomId = parseOptionalUuid(value.nhom_id);
  if (nhomId === undefined && value.nhom_id != null && value.nhom_id !== '') return null;
  const rawDestinations = Array.isArray(value.destinations) ? value.destinations : null;
  if (!rawDestinations || rawDestinations.length === 0) return null;
  const destinations: MaterialConversionDestinationInput[] = [];
  const seenCodes = new Set<string>();
  for (const item of rawDestinations) {
    const destination = parseDestination(item);
    if (!destination) return null;
    const codeKey = destination.vat_tu_quy_doi.toLowerCase();
    if (seenCodes.has(codeKey)) return null;
    seenCodes.add(codeKey);
    destinations.push(destination);
  }
  const batch: MaterialConversionBatchInput = {
    ngay: parseIsoDate(value.ngay),
    ca: text(value.ca, 100),
    ma_may: text(value.ma_may, 100),
    vat_tu_goc: text(value.vat_tu_goc, 500),
    so_luong_goc: quantity(value.so_luong_goc),
    khoi_luong_goc: khoiLuongGoc,
    chieu_dai_goc: chieuDaiGoc,
    trong_luong_tren_cai_goc: tlTrenCaiGoc,
    ghi_chu_goc: ghiChuGoc,
    nguon_lay: nguonLay,
    destinations
  };
  if (nhomId) batch.nhom_id = nhomId;
  else if (nhomId === null) batch.nhom_id = null;
  if (
    !batch.ngay ||
    !batch.ca ||
    batch.ca === '-' ||
    !batch.ma_may ||
    !batch.vat_tu_goc ||
    !Number.isFinite(batch.so_luong_goc) ||
    batch.so_luong_goc <= 0
  ) {
    return null;
  }
  return batch;
}

export function batchToRecords(
  batch: MaterialConversionBatchInput,
  nhomId: string
): MaterialConversionInput[] {
  return batch.destinations.map(destination => ({
    ngay: batch.ngay,
    ca: batch.ca,
    ma_may: batch.ma_may,
    vat_tu_goc: batch.vat_tu_goc,
    so_luong_goc: batch.so_luong_goc,
    khoi_luong_goc: batch.khoi_luong_goc,
    chieu_dai_goc: batch.chieu_dai_goc,
    trong_luong_tren_cai_goc: batch.trong_luong_tren_cai_goc,
    ghi_chu_goc: batch.ghi_chu_goc,
    nguon_lay: batch.nguon_lay,
    vat_tu_quy_doi: destination.vat_tu_quy_doi,
    so_luong_quy_doi: destination.so_luong_quy_doi,
    khoi_luong_quy_doi: destination.khoi_luong_quy_doi,
    chieu_dai_quy_doi: destination.chieu_dai_quy_doi,
    dinh_muc: destination.dinh_muc,
    kich_thuoc_tong: destination.kich_thuoc_tong,
    trong_luong_tren_cai_quy_doi: destination.trong_luong_tren_cai_quy_doi,
    ghi_chu_quy_doi: destination.ghi_chu_quy_doi,
    nguon_toi: destination.nguon_toi,
    nhom_id: nhomId
  }));
}
