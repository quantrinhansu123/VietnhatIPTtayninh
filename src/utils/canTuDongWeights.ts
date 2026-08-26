import { normalizeProductCodeKey } from '../features/san-pham/types';
import { parseDateToIso } from './dateFormat';
import { shiftNamesMatch } from './shiftSettings';

/** Bản ghi tối thiểu để tính trọng lượng nhựa / lọc lần cân. */
export type CanTuDongWeightRow = {
  qr_code?: string | null;
  can_loi?: number | string | null;
  tare_weight?: number | string | null;
  can_san_pham?: number | string | null;
  weight?: number | string | null;
  /** Cột UI «Trọng lượng nhựa» ưu tiên tính SP − lõi − bì; các field này chỉ dự phòng. */
  khoi_luong_thuc?: number | string | null;
  net_weight?: number | string | null;
  ca?: string | null;
  lenh_sx?: string | null;
  ma_lenh_sx?: string | null;
  /** Máy từ metadata / API (SOURCE_MACHINE). */
  may?: string | null;
  machine?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  /** Cột Ngày (SOURCE_DATE / work_date) — không phải ngày cân. */
  ngay?: string | null;
  work_date?: string | null;
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
 * Trọng lượng nhựa / Nhựa thực tế (kg) = Cân SP − Cân lõi − Trọng lượng bì.
 * Trừ thẳng 0,16 — không làm tròn trung gian.
 */
export function resolveTrongLuongNhuaKg(row: CanTuDongWeightRow) {
  const sp = resolveCanSpKg(row);
  const loi = resolveCanLoiKg(row);
  if (sp === null || loi === null) return null;
  return sp - loi - resolveTrongLuongBiKg(row);
}

/**
 * Nhựa định mức (kg) theo Mã SP:
 * ưu tiên `san_pham.trong_luong_nhua`; không có thì TL tiêu chuẩn − lõi LT − bì.
 */
export function resolveNhuaDinhMucKg(
  standardKg: number | null | undefined,
  coreKg: number | null | undefined,
  plasticKgFromProduct?: number | null
) {
  if (plasticKgFromProduct != null && Number.isFinite(plasticKgFromProduct) && plasticKgFromProduct > 0) {
    return plasticKgFromProduct;
  }
  if (standardKg == null || !Number.isFinite(standardKg) || !(standardKg > 0)) return null;
  const core = coreKg != null && Number.isFinite(coreKg) && coreKg > 0 ? coreKg : 0;
  return standardKg - core - DEFAULT_CAN_TU_DONG_BI_KG;
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

function asCanTuDongMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

/** Cột Ngày: SOURCE_DATE / work_date. Không dùng captured_at (Ngày cân / Thời điểm). */
export function resolveCanTuDongBusinessDate(row: CanTuDongWeightRow): string | null {
  const fromRow = parseDateToIso(row.ngay ?? row.work_date ?? '');
  if (fromRow) return fromRow;

  const meta = asCanTuDongMetadata(row.metadata);
  if (!meta) return null;

  for (const key of ['SOURCE_DATE', 'source_date', 'work_date', 'ngay', 'date']) {
    const parsed = parseDateToIso(meta[key]);
    if (parsed) return parsed;
  }

  for (const value of Object.values(meta)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const match = value.match(
      /SOURCE_DATE\s*=\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})/i
    );
    if (match?.[1]) {
      const fromRaw = parseDateToIso(match[1]);
      if (fromRaw) return fromRaw;
    }
  }
  return null;
}

/** Lệnh SX: cột API `lenh_sx`, metadata.production_order / SOURCE_PRODUCTION_ORDER, hoặc phần sau `+` trên QR. */
export function resolveCanTuDongProductionOrder(row: CanTuDongWeightRow): string | null {
  const fromRow = String(row.lenh_sx ?? row.ma_lenh_sx ?? '').trim();
  if (fromRow) return fromRow;

  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    const direct = pickMetaText(meta, [
      'production_order',
      'SOURCE_PRODUCTION_ORDER',
      'source_production_order',
      'ma_lenh_sx',
      'lenh_sx',
      'lenhSx'
    ]);
    if (direct) return direct;

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_PRODUCTION_ORDER\s*=\s*([^\s;|,]+)/i);
      if (match?.[1]) return match[1].trim();
    }
  }

  const qr = String(row.qr_code || '').trim();
  const plusIdx = qr.indexOf('+');
  if (plusIdx > 0) {
    const after = qr.slice(plusIdx + 1).trim();
    if (after) return after;
  }
  return null;
}

/** Máy: metadata.machine / SOURCE_MACHINE, hoặc cột may/machine. */
export function resolveCanTuDongMachine(row: CanTuDongWeightRow): string | null {
  const direct = String(row.may ?? row.machine ?? '').trim();
  if (direct) return direct;

  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    const fromMeta = pickMetaText(meta, [
      'machine',
      'SOURCE_MACHINE',
      'source_machine',
      'may',
      'ten_may',
      'ma_may',
      'machine_name'
    ]);
    if (fromMeta) return fromMeta;

    for (const value of Object.values(meta)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const match = value.match(/SOURCE_MACHINE\s*=\s*([^;|,]+)/i);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

/** kg/m² màng cách nhiệt (2 lớp trên một cuộn). */
export const INSULATION_FILM_KG_PER_M2 = 0.02324;
export const INSULATION_FILM_LAYERS = 2;

function parsePositiveDecimal(value: string | null | undefined): number | null {
  const number = Number(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export type InsulationProductAlias = {
  code?: string | null;
  newCode?: string | null;
  amisCode?: string | null;
  rollWidth?: string | null;
  rollLength?: string | null;
  totalWeight?: string | null;
};

function buildInsulationFilmKgByProductCode(products: InsulationProductAlias[]): Map<string, number> {
  const filmKgByProductCode = new Map<string, number>();
  for (const product of products) {
    const rollWidthM = parsePositiveDecimal(product.rollWidth);
    const rollLengthM = parsePositiveDecimal(product.rollLength);
    if (rollWidthM === null || rollLengthM === null) continue;
    const filmKg = rollWidthM * rollLengthM * INSULATION_FILM_LAYERS * INSULATION_FILM_KG_PER_M2;
    for (const productCode of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(productCode);
      if (key && key !== '-') filmKgByProductCode.set(key, filmKg);
    }
  }
  return filmKgByProductCode;
}

/**
 * TL màng máy cách nhiệt = Σ (khổ cuộn × chiều dài cuộn × 2 lớp × 0,02324 kg/m²)
 * theo mã SP khớp QR cân tự động.
 */
export function computeInsulationFilmWeightKg(
  products: InsulationProductAlias[],
  records: CanTuDongWeightRow[]
): number {
  const filmKgByProductCode = buildInsulationFilmKgByProductCode(products);
  return records.reduce((total, record) => {
    const productCode = normalizeProductCodeKey(parseCanTuDongQrProductCode(record.qr_code));
    return total + (filmKgByProductCode.get(productCode) || 0);
  }, 0);
}

/** Nhựa định mức máy cách nhiệt = TL tiêu chuẩn − lõi − bì − TL màng, theo từng phiếu cân. */
export function computeInsulationPlasticNorm(
  products: InsulationProductAlias[],
  records: CanTuDongWeightRow[]
): { weightKg: number; counted: number } {
  const standardKgByProductCode = new Map<string, number>();
  for (const product of products) {
    const standardKg = parsePositiveDecimal(product.totalWeight);
    if (standardKg === null) continue;
    for (const productCode of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(productCode);
      if (key && key !== '-') standardKgByProductCode.set(key, standardKg);
    }
  }
  const filmKgByProductCode = buildInsulationFilmKgByProductCode(products);
  return records.reduce(
    (total, record) => {
      const productCode = normalizeProductCodeKey(parseCanTuDongQrProductCode(record.qr_code));
      const standardKg = standardKgByProductCode.get(productCode);
      const coreKg = resolveCanLoiKg(record);
      if (standardKg === undefined || coreKg === null) return total;
      const filmKg = filmKgByProductCode.get(productCode) || 0;
      return {
        weightKg: total.weightKg + standardKg - coreKg - resolveTrongLuongBiKg(record) - filmKg,
        counted: total.counted + 1
      };
    },
    { weightKg: 0, counted: 0 }
  );
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

/** Đổi phần mã SP trong QR, giữ serial / phần sau `+` nếu có. */
export function replaceCanTuDongQrProductCode(
  raw: string | null | undefined,
  newProductCode: string
): string {
  const next = String(newProductCode || '').trim();
  if (!next) return String(raw || '').trim();
  const trimmed = String(raw || '').trim();
  if (!trimmed) return next;
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return `${next}${trimmed.slice(plusIdx)}`;
  const serialMatch = trimmed.match(/^(.+?)([_-]\d{6}[0-9A-Za-z]{2,})$/);
  if (serialMatch?.[2]) return `${next}${serialMatch[2]}`;
  return next;
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
    machineFilter?: string;
    selectedMachine?: { code?: string; name?: string } | null;
    /** Khi truyền: chỉ giữ lần cân có ngày+ca(+máy) trùng một lệnh SX đang lọc. */
    orderShiftBuckets?: Array<{
      ngay?: string | null;
      shift?: string | null;
      machine?: string | null;
    }> | null;
    /** Khi truyền (kể cả Set rỗng): chỉ giữ lần cân có QR khớp mã SP lệnh SX. */
    productCodeKeys?: Iterable<string> | null;
  } = {}
): T[] {
  const shiftFilter = String(opts.shiftFilter || '').trim();
  const dateFrom = String(opts.dateFrom || '').trim();
  const dateTo = String(opts.dateTo || '').trim();
  const machineFilter = String(opts.machineFilter || '').trim();
  const selectedMachine = opts.selectedMachine ?? null;
  const buckets = Array.isArray(opts.orderShiftBuckets)
    ? opts.orderShiftBuckets
        .map(bucket => ({
          ngay: String(bucket.ngay || '').trim(),
          shift: String(bucket.shift || '').trim(),
          machine: String(bucket.machine || '').trim()
        }))
        .filter(bucket => bucket.ngay || bucket.shift || bucket.machine)
    : null;
  const productKeys =
    opts.productCodeKeys == null
      ? null
      : new Set(
          [...opts.productCodeKeys]
            .map(value => normalizeProductCodeKey(String(value || '')))
            .filter(key => key && key !== '-')
        );

  const normalizeMachineToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const machineMatches = (candidate: string, filter: string, selected?: { code?: string; name?: string } | null) => {
    if (!filter || filter === 'all') return true;
    const tokens = new Set<string>();
    const add = (v?: string | null) => {
      const t = normalizeMachineToken(String(v || ''));
      if (t) tokens.add(t);
    };
    add(filter);
    add(selected?.code);
    add(selected?.name);
    const cand = normalizeMachineToken(candidate);
    if (!cand || tokens.size === 0) return false;
    for (const token of tokens) {
      if (cand === token || cand.includes(token) || token.includes(cand)) return true;
    }
    return false;
  };

  return records.filter(row => {
    if (shiftFilter && shiftFilter !== 'all' && !canTuDongShiftMatches(String(row.ca || ''), shiftFilter)) {
      return false;
    }

    const businessDate = dateFrom || dateTo || buckets ? resolveCanTuDongBusinessDate(row) : null;
    const rowMachine = resolveCanTuDongMachine(row) || '';

    if (dateFrom || dateTo) {
      if (!businessDate) return false;
      if (dateFrom && businessDate < dateFrom) return false;
      if (dateTo && businessDate > dateTo) return false;
    }
    // Không có từ/đến ngày (Ngày = Tất cả): giữ mọi dòng, kể cả trống Ngày / không chênh lệch.

    if (machineFilter && machineFilter !== 'all' && !machineMatches(rowMachine, machineFilter, selectedMachine)) {
      return false;
    }

    if (buckets) {
      if (buckets.length === 0) return false;
      const rowCa = String(row.ca || '');
      const matched = buckets.some(bucket => {
        if (bucket.ngay && businessDate !== bucket.ngay) return false;
        if (bucket.shift && !canTuDongShiftMatches(rowCa, bucket.shift)) return false;
        if (bucket.machine && !machineMatches(rowMachine, bucket.machine, null)) return false;
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

/** Tổng cột «Trọng lượng TT» (Cân sản phẩm — chưa trừ lõi/bì) + số lần cân (= số dòng đã lọc). */
export function sumCanTuDongThucTeTotals(records: CanTuDongWeightRow[]) {
  let weightKg = 0;
  for (const row of records) {
    const canSp = resolveCanSpKg(row);
    if (canSp !== null) weightKg += canSp;
  }
  return {
    /** Số lần cân = số bản ghi can_tu_dong trong bộ lọc. */
    quantity: records.length,
    weightKg
  };
}

/** Tổng cột «Nhựa định mức» theo Mã SP (`trong_luong_nhua` hoặc TL − lõi − bì). */
export function sumCanTuDongNhuaDinhMucKg(
  records: CanTuDongWeightRow[],
  standardKgByProductCode: Map<string, number>,
  coreKgByProductCode: Map<string, number>,
  plasticKgByProductCode?: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const standardKg = maSpKey ? standardKgByProductCode.get(maSpKey) : undefined;
    const coreKg = maSpKey ? coreKgByProductCode.get(maSpKey) : undefined;
    const plasticKg = maSpKey && plasticKgByProductCode ? plasticKgByProductCode.get(maSpKey) : undefined;
    const nhua = resolveNhuaDinhMucKg(standardKg, coreKg, plasticKg);
    if (nhua == null || !Number.isFinite(nhua)) continue;
    weightKg += nhua;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng Nhựa chênh lệch = Σ (Nhựa thực tế − Nhựa định mức) khi đủ cả hai. */
export function sumCanTuDongChenhLechNhuaKg(
  records: CanTuDongWeightRow[],
  standardKgByProductCode: Map<string, number>,
  coreKgByProductCode: Map<string, number>,
  plasticKgByProductCode?: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const thucTe = resolveTrongLuongNhuaKg(row);
    if (thucTe === null) continue;
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const standardKg = maSpKey ? standardKgByProductCode.get(maSpKey) : undefined;
    const coreKg = maSpKey ? coreKgByProductCode.get(maSpKey) : undefined;
    const plasticKg = maSpKey && plasticKgByProductCode ? plasticKgByProductCode.get(maSpKey) : undefined;
    const dinhMuc = resolveNhuaDinhMucKg(standardKg, coreKg, plasticKg);
    if (dinhMuc == null || !Number.isFinite(dinhMuc)) continue;
    weightKg += thucTe - dinhMuc;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng cột «Trọng lượng tiêu chuẩn» (`san_pham.tong_trong_luong` theo Mã SP từ QR). */
export function sumCanTuDongNhuaTieuChuanKg(
  records: CanTuDongWeightRow[],
  standardKgByProductCode: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const standardKg = maSpKey ? standardKgByProductCode.get(maSpKey) : undefined;
    if (standardKg == null || !(standardKg > 0) || !Number.isFinite(standardKg)) continue;
    weightKg += standardKg;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng cột «Cân sản phẩm» / Trọng lượng TT (`weight` / `can_san_pham`). */
export function sumCanTuDongCanSanPhamKg(records: CanTuDongWeightRow[]) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const sp = resolveCanSpKg(row);
    if (sp === null) continue;
    weightKg += sp;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng chênh lệch TT − LT = Σ (Cân sản phẩm − Trọng lượng tiêu chuẩn) khi đủ cả hai. */
export function sumCanTuDongChenhLechTtLtKg(
  records: CanTuDongWeightRow[],
  standardKgByProductCode: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const sp = resolveCanSpKg(row);
    if (sp === null) continue;
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const standardKg = maSpKey ? standardKgByProductCode.get(maSpKey) : undefined;
    if (standardKg == null || !(standardKg > 0) || !Number.isFinite(standardKg)) continue;
    weightKg += sp - standardKg;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng cột «Lõi tiêu chuẩn / lõi lý thuyết» (`san_pham.trong_luong_loi` theo Mã SP từ QR). */
export function sumCanTuDongLoiTieuChuanKg(
  records: CanTuDongWeightRow[],
  coreKgByProductCode: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const coreKg = maSpKey ? coreKgByProductCode.get(maSpKey) : undefined;
    if (coreKg == null || !(coreKg > 0) || !Number.isFinite(coreKg)) continue;
    weightKg += coreKg;
    counted += 1;
  }
  return { weightKg, counted };
}

/** Tổng cột «Cân lõi» (`tare_weight` / `can_loi`). */
export function sumCanTuDongCanLoiKg(records: CanTuDongWeightRow[]) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const loi = resolveCanLoiKg(row);
    if (loi === null) continue;
    weightKg += loi;
    counted += 1;
  }
  return { weightKg, counted };
}

/**
 * Tổng chênh lệch lõi = Σ (Cân lõi − Lõi lý thuyết) khi đủ cả hai.
 * Cùng công thức kiểu Chênh lệch TT−LT: thực tế − lý thuyết.
 */
export function sumCanTuDongChenhLechLoiKg(
  records: CanTuDongWeightRow[],
  coreKgByProductCode: Map<string, number>
) {
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const loi = resolveCanLoiKg(row);
    if (loi === null) continue;
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const lyThuyetKg = maSpKey ? coreKgByProductCode.get(maSpKey) : undefined;
    if (lyThuyetKg == null || !(lyThuyetKg > 0) || !Number.isFinite(lyThuyetKg)) continue;
    weightKg += loi - lyThuyetKg;
    counted += 1;
  }
  return { weightKg, counted };
}
