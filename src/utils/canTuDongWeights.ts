import { normalizeProductCodeKey } from '../features/san-pham/types';
import { shiftNamesMatch } from './shiftSettings';

/** Bản ghi tối thiểu để tính trọng lượng nhựa / lọc lần cân. */
export type CanTuDongWeightRow = {
  qr_code?: string | null;
  can_loi?: number | string | null;
  tare_weight?: number | string | null;
  can_san_pham?: number | string | null;
  weight?: number | string | null;
  ca?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  device_id?: string | null;
  metadata?: unknown;
};

type CanTuDongProductAlias = {
  code?: string | null;
  newCode?: string | null;
  amisCode?: string | null;
  name?: string | null;
};

/** Trọng lượng bì mặc định (kg). */
export const DEFAULT_CAN_TU_DONG_BI_KG = 0.16;

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function resolveCanLoiKg(row: CanTuDongWeightRow) {
  return asFiniteNumber(row.can_loi ?? row.tare_weight);
}

export function resolveCanSpKg(row: CanTuDongWeightRow) {
  return asFiniteNumber(row.can_san_pham ?? row.weight);
}

/** Trọng lượng bì (kg) — mặc định 0,16; không làm tròn. */
export function resolveTrongLuongBiKg(_row?: CanTuDongWeightRow) {
  return DEFAULT_CAN_TU_DONG_BI_KG;
}

/**
 * Trọng lượng nhựa (kg) = Cân SP − Cân lõi − Trọng lượng bì.
 * Trừ thẳng 0,16 — không làm tròn trung gian.
 */
export function resolveTrongLuongNhuaKg(row: CanTuDongWeightRow) {
  const sp = resolveCanSpKg(row);
  const loi = resolveCanLoiKg(row);
  if (sp === null || loi === null) return null;
  return sp - loi - resolveTrongLuongBiKg(row);
}

/** Ngày lịch VN (YYYY-MM-DD) từ ISO timestamp. */
export function vietnamIsoDateFromTimestamp(iso?: string | null): string | null {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function pickMetaText(meta: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = meta[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

/** Ngày nghiệp vụ: SOURCE_DATE trong metadata, không thì ngày VN của captured_at. */
export function resolveCanTuDongBusinessDate(row: CanTuDongWeightRow): string | null {
  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    const direct = pickMetaText(meta, ['SOURCE_DATE', 'source_date', 'ngay', 'date']);
    const directMatch = direct.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch) return directMatch[1];

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_DATE\s*=\s*(\d{4}-\d{2}-\d{2})/i);
      if (match?.[1]) return match[1];
    }
  }
  return vietnamIsoDateFromTimestamp(row.captured_at || row.created_at);
}

/**
 * Tem QR: `MãSP_ddmmyy` + serial (vd MT-MN009_3107268472) hoặc `MãSP+LSX...`.
 * Trả về mã SP để khớp lệnh sản xuất.
 */
export function parseCanTuDongQrProductCode(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

function addProductMatchKey(keys: Set<string>, value?: string | null) {
  const key = normalizeProductCodeKey(String(value || ''));
  if (key && key !== '-') keys.add(key);
}

function findCatalogProductForCanTuDong(
  catalog: CanTuDongProductAlias[],
  productCode?: string | null,
  productName?: string | null
) {
  const codeKey = normalizeProductCodeKey(String(productCode || ''));
  const nameKey = normalizeProductCodeKey(String(productName || ''));
  return catalog.find(product => {
    const aliases = [product.code, product.newCode, product.amisCode, product.name].map(value =>
      normalizeProductCodeKey(String(value || ''))
    );
    if (codeKey && aliases.includes(codeKey)) return true;
    if (nameKey && aliases.includes(nameKey)) return true;
    return false;
  });
}

/** Tập mã SP (kèm mã mới / AMIS / tên) của lệnh SX đang lọc — dùng khớp QR cân tự động. */
export function collectCanTuDongProductMatchKeys(
  lines: Array<{ productCode?: string | null; productName?: string | null }>,
  catalog: CanTuDongProductAlias[] = []
): Set<string> {
  const keys = new Set<string>();
  for (const line of lines) {
    addProductMatchKey(keys, line.productCode);
    addProductMatchKey(keys, line.productName);
    const product = findCatalogProductForCanTuDong(catalog, line.productCode, line.productName);
    if (!product) continue;
    addProductMatchKey(keys, product.code);
    addProductMatchKey(keys, product.newCode);
    addProductMatchKey(keys, product.amisCode);
    addProductMatchKey(keys, product.name);
  }
  return keys;
}

export function canTuDongQrMatchesProductKeys(
  qrCode: string | null | undefined,
  productCodeKeys: Set<string>
): boolean {
  if (productCodeKeys.size === 0) return false;
  const parsedKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(qrCode));
  if (parsedKey && productCodeKeys.has(parsedKey)) return true;
  const fullKey = normalizeProductCodeKey(String(qrCode || ''));
  return Boolean(fullKey && productCodeKeys.has(fullKey));
}

/**
 * Khớp ca: bằng nhau (không phân biệt hoa thường), hoặc token đầy đủ.
 * Tránh `includes` kiểu "C1" khớp nhầm "HC1"/"12C1".
 */
export function canTuDongShiftMatches(rowCa: string, shiftFilter: string): boolean {
  const a = String(rowCa || '').trim().toLowerCase();
  const b = String(shiftFilter || '').trim().toLowerCase();
  if (!a || !b || b === 'all') return true;
  if (a === b) return true;
  const aTokens = a.split(/[\s/_-]+/).filter(Boolean);
  const bTokens = b.split(/[\s/_-]+/).filter(Boolean);
  if (aTokens.includes(b) || bTokens.includes(a)) return true;
  // Nhãn dài ("Ca HC1") — chỉ khi mã ca ≥ 3 ký tự để tránh khớp nhầm
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  return shiftNamesMatch(rowCa, shiftFilter) && Math.min(a.length, b.length) >= 3;
}

export function filterCanTuDongRecordsForBoard<T extends CanTuDongWeightRow>(
  records: T[],
  opts: {
    shiftFilter?: string;
    dateFrom?: string;
    dateTo?: string;
    /** Khi truyền: chỉ giữ lần cân có ngày+ca trùng một lệnh SX đang lọc. */
    orderShiftBuckets?: Array<{ ngay?: string | null; shift?: string | null }> | null;
    /** Khi truyền (kể cả Set rỗng): chỉ giữ lần cân có QR khớp mã SP lệnh SX. */
    productCodeKeys?: Iterable<string> | null;
  } = {}
): T[] {
  const shiftFilter = String(opts.shiftFilter || '').trim();
  const dateFrom = String(opts.dateFrom || '').trim();
  const dateTo = String(opts.dateTo || '').trim();
  const buckets = Array.isArray(opts.orderShiftBuckets)
    ? opts.orderShiftBuckets
        .map(bucket => ({
          ngay: String(bucket.ngay || '').trim(),
          shift: String(bucket.shift || '').trim()
        }))
        .filter(bucket => bucket.ngay || bucket.shift)
    : null;
  const productKeys =
    opts.productCodeKeys == null
      ? null
      : new Set(
          [...opts.productCodeKeys]
            .map(value => normalizeProductCodeKey(String(value || '')))
            .filter(key => key && key !== '-')
        );

  return records.filter(row => {
    if (shiftFilter && shiftFilter !== 'all' && !canTuDongShiftMatches(String(row.ca || ''), shiftFilter)) {
      return false;
    }

    const businessDate = dateFrom || dateTo || buckets ? resolveCanTuDongBusinessDate(row) : null;

    if (dateFrom || dateTo) {
      if (!businessDate) return false;
      if (dateFrom && businessDate < dateFrom) return false;
      if (dateTo && businessDate > dateTo) return false;
    }

    if (buckets) {
      if (buckets.length === 0) return false;
      const rowCa = String(row.ca || '');
      const matched = buckets.some(bucket => {
        if (bucket.ngay && businessDate !== bucket.ngay) return false;
        if (bucket.shift && !canTuDongShiftMatches(rowCa, bucket.shift)) return false;
        return true;
      });
      if (!matched) return false;
    }

    if (productKeys && !canTuDongQrMatchesProductKeys(row.qr_code, productKeys)) {
      return false;
    }

    return true;
  });
}

/** Tổng cột «Trọng lượng nhựa» + số lần cân (= số dòng đã lọc). */
export function sumCanTuDongSanLuongTotals(records: CanTuDongWeightRow[]) {
  let weightKg = 0;
  for (const row of records) {
    const nhua = resolveTrongLuongNhuaKg(row);
    if (nhua !== null) weightKg += nhua;
  }
  return {
    /** Số lần cân = số bản ghi can_tu_dong trong bộ lọc. */
    quantity: records.length,
    weightKg
  };
}
