import type { CanTuDongRecord } from '../features/can-tu-dong';
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';
import { shiftIsoDateByDays } from './shiftSettings';
import {
  DEFAULT_CAN_TU_DONG_BI_KG,
  parseCanTuDongQrProductCode,
  resolveCanLoiKg,
  resolveCanSpKg,
  resolveCanTuDongNhuaDinhMucKgPerRoll,
  resolveInsulationFilmBomWeightPerUnit,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKgMinusFilm,
  type CanTuDongWeightRow
} from './canTuDongWeights';

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

type CanTuDongFormulaPart = {
  kgPerRoll: number;
  count: number;
  maSp?: string;
};

/** Dòng tổng hợp đầy đủ tiêu chí nhựa / lõi / bì (tab Dữ liệu cân thực tế). */
export type CanTuDongTongHopDetailRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  so_cuon: number;
  tong_trong_luong_kg: number;
  /** Trọng lượng Nhựa ĐM = Σ (trong_luong_nhua Kho hàng × 1 cuộn). */
  nhua_dm_kg: number;
  /** Khối lượng màng = Σ (BOM màng / cuộn). */
  khoi_luong_mang_kg: number;
  /** Trọng lượng Nhựa TT = SP − lõi − bì − màng. */
  nhua_tt_kg: number;
  /** Chênh lệch nhựa = TT − ĐM. */
  chenh_lech_nhua_kg: number;
  /** % chênh = CL ÷ Nhựa TT × 100. */
  phan_tram_chenh: number | null;
  /** Trọng lượng Lõi ĐM — san_pham.trong_luong_loi. */
  loi_dm_kg: number;
  /** Trọng lượng Lõi TT — cân lõi. */
  loi_tt_kg: number;
  /** Trọng lượng bì = Σ 0,16 kg / cuộn. */
  trong_luong_bi_kg: number;
  /** Công thức hiển thị dưới ô Nhựa ĐM. */
  nhua_dm_formula: string;
  /** Công thức hiển thị dưới ô Khối lượng màng. */
  mang_formula: string;
  /** Thành phần công thức (gom tổng). */
  nhua_dm_parts: CanTuDongFormulaPart[];
  mang_parts: CanTuDongFormulaPart[];
};

export function buildCanTuDongTongHopKey(ngay: string, ca: string, may: string) {
  return [String(ngay || '').trim(), String(ca || '').trim() || '-', String(may || '').trim() || '-'].join(
    '|'
  );
}

function parseProductMapNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatCanTuDongFormulaNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return String(rounded).replace('.', ',');
}

function mergeFormulaParts(
  target: Map<string, CanTuDongFormulaPart>,
  parts: CanTuDongFormulaPart[]
) {
  for (const part of parts) {
    if (!(part.kgPerRoll > 0) || !(part.count > 0)) continue;
    const key = `${part.kgPerRoll}|${part.maSp || ''}`;
    const existing = target.get(key);
    if (existing) existing.count += part.count;
    else target.set(key, { ...part });
  }
}

function mapToFormulaParts(map: Map<string, CanTuDongFormulaPart>): CanTuDongFormulaPart[] {
  return [...map.values()];
}

function bumpFormulaPart(
  map: Map<string, CanTuDongFormulaPart>,
  maSpKey: string,
  kgPerRoll: number
) {
  const existing = map.get(maSpKey);
  if (existing) {
    existing.count += 1;
    return;
  }
  map.set(maSpKey, { kgPerRoll, count: 1, maSp: maSpKey });
}

function buildKgTimesRollFormula(
  parts: Map<string, CanTuDongFormulaPart>,
  emptyLabel: string
): string {
  const entries = [...parts.values()].filter(part => part.kgPerRoll > 0 && part.count > 0);
  if (entries.length === 0) return emptyLabel;
  const fmt = formatCanTuDongFormulaNumber;
  if (entries.length === 1) {
    const part = entries[0]!;
    return `${fmt(part.kgPerRoll)} × ${part.count}`;
  }
  return entries.map(part => `${fmt(part.kgPerRoll)}×${part.count}`).join(' + ');
}

/** Map trọng lượng SP theo mã (chuẩn / lõi / nhựa / màng BOM) từ danh mục /kho-hang. */
export function buildCanTuDongProductWeightMaps(products: ProductRow[]) {
  const standardKgByProductCode = new Map<string, number>();
  const coreKgByProductCode = new Map<string, number>();
  const plasticKgByProductCode = new Map<string, number>();
  const filmKgByProductCode = new Map<string, number>();
  for (const product of products) {
    const standard = parseProductMapNumber(product.totalWeight);
    const core = parseProductMapNumber(product.coreWeight);
    const plastic = parseProductMapNumber(product.plasticWeight);
    const filmKg = resolveInsulationFilmBomWeightPerUnit(product);
    for (const raw of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(String(raw || ''));
      if (!key) continue;
      if (standard != null) standardKgByProductCode.set(key, standard);
      if (core != null) coreKgByProductCode.set(key, core);
      if (plastic != null) plasticKgByProductCode.set(key, plastic);
      if (filmKg != null && filmKg > 0) filmKgByProductCode.set(key, filmKg);
    }
  }
  return { standardKgByProductCode, coreKgByProductCode, plasticKgByProductCode, filmKgByProductCode };
}

/**
 * Gom phiếu cân theo Ngày · Ca · Máy kèm đủ tiêu chí nhựa/lõi/bì
 * (cùng công thức trang /can-tu-dong).
 */
export function buildCanTuDongTongHopDetailRows(
  records: CanTuDongWeightRow[],
  products: ProductRow[]
): CanTuDongTongHopDetailRow[] {
  const { coreKgByProductCode, plasticKgByProductCode, filmKgByProductCode } =
    buildCanTuDongProductWeightMaps(products);
  const buckets = new Map<
    string,
    {
      khoa_on_dinh: string;
      ngay: string;
      ca: string;
      may: string;
      so_cuon: number;
      tong_trong_luong_kg: number;
      nhua_dm_kg: number;
      khoi_luong_mang_kg: number;
      nhua_tt_kg: number;
      chenh_lech_nhua_kg: number;
      loi_dm_kg: number;
      loi_tt_kg: number;
      trong_luong_bi_kg: number;
      nhuaCompared: number;
      nhuaDmParts: Map<string, CanTuDongFormulaPart>;
      mangParts: Map<string, CanTuDongFormulaPart>;
    }
  >();

  for (const row of records) {
    const ngay = String(row.ngay || row.work_date || '').trim();
    if (!ngay) continue;
    const ca = String(row.ca || '').trim();
    const may = String(row.may || row.machine || '').trim();
    const key = buildCanTuDongTongHopKey(ngay, ca, may);
    const current = buckets.get(key) || {
      khoa_on_dinh: key,
      ngay,
      ca,
      may,
      so_cuon: 0,
      tong_trong_luong_kg: 0,
      nhua_dm_kg: 0,
      khoi_luong_mang_kg: 0,
      nhua_tt_kg: 0,
      chenh_lech_nhua_kg: 0,
      loi_dm_kg: 0,
      loi_tt_kg: 0,
      trong_luong_bi_kg: 0,
      nhuaCompared: 0,
      nhuaDmParts: new Map<string, CanTuDongFormulaPart>(),
      mangParts: new Map<string, CanTuDongFormulaPart>()
    };

    current.so_cuon += 1;
    const sp = resolveCanSpKg(row);
    if (sp != null) current.tong_trong_luong_kg += sp;
    const loiTt = resolveCanLoiKg(row);
    if (loiTt != null) current.loi_tt_kg += loiTt;
    current.trong_luong_bi_kg += resolveTrongLuongBiKg(row);

    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const filmKgPerRoll = maSpKey ? filmKgByProductCode.get(maSpKey) : undefined;

    const nhuaTt = resolveTrongLuongNhuaKgMinusFilm(row, filmKgPerRoll);
    if (nhuaTt != null) current.nhua_tt_kg += nhuaTt;

    const plasticKg = maSpKey ? plasticKgByProductCode.get(maSpKey) : undefined;
    const nhuaDmPerRoll = resolveCanTuDongNhuaDinhMucKgPerRoll(plasticKg);
    if (nhuaDmPerRoll != null && maSpKey) {
      current.nhua_dm_kg += nhuaDmPerRoll;
      bumpFormulaPart(current.nhuaDmParts, maSpKey, nhuaDmPerRoll);
    }

    if (filmKgPerRoll != null && filmKgPerRoll > 0 && maSpKey) {
      current.khoi_luong_mang_kg += filmKgPerRoll;
      bumpFormulaPart(current.mangParts, maSpKey, filmKgPerRoll);
    }

    const coreKg = maSpKey ? coreKgByProductCode.get(maSpKey) : undefined;
    if (coreKg != null) current.loi_dm_kg += coreKg;

    if (nhuaTt != null && nhuaDmPerRoll != null) {
      current.chenh_lech_nhua_kg += nhuaTt - nhuaDmPerRoll;
      current.nhuaCompared += 1;
    }

    buckets.set(key, current);
  }

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return [...buckets.values()]
    .map(item => {
      const phan_tram_chenh =
        item.nhua_tt_kg !== 0 && item.nhuaCompared > 0
          ? (item.chenh_lech_nhua_kg / item.nhua_tt_kg) * 100
          : null;
      const nhua_dm_formula = buildKgTimesRollFormula(
        item.nhuaDmParts,
        'KL nhựa+phụ gia × cuộn'
      );
      const mang_formula = buildKgTimesRollFormula(item.mangParts, 'BOM màng × cuộn');
      return {
        khoa_on_dinh: item.khoa_on_dinh,
        ngay: item.ngay,
        ca: item.ca,
        may: item.may,
        so_cuon: item.so_cuon,
        tong_trong_luong_kg: round3(item.tong_trong_luong_kg),
        nhua_dm_kg: round3(item.nhua_dm_kg),
        khoi_luong_mang_kg: round3(item.khoi_luong_mang_kg),
        nhua_tt_kg: round3(item.nhua_tt_kg),
        chenh_lech_nhua_kg: round3(item.chenh_lech_nhua_kg),
        phan_tram_chenh: phan_tram_chenh == null ? null : Math.round(phan_tram_chenh * 100) / 100,
        loi_dm_kg: round3(item.loi_dm_kg),
        loi_tt_kg: round3(item.loi_tt_kg),
        trong_luong_bi_kg: round3(item.trong_luong_bi_kg),
        nhua_dm_formula,
        mang_formula,
        nhua_dm_parts: mapToFormulaParts(item.nhuaDmParts),
        mang_parts: mapToFormulaParts(item.mangParts)
      };
    })
    .sort((a, b) => {
      const d = b.ngay.localeCompare(a.ngay);
      if (d !== 0) return d;
      const c = a.ca.localeCompare(b.ca, 'vi');
      if (c !== 0) return c;
      return a.may.localeCompare(b.may, 'vi');
    });
}

export function sumCanTuDongTongHopDetailRows(rows: CanTuDongTongHopDetailRow[]) {
  const nhuaDmParts = new Map<string, CanTuDongFormulaPart>();
  const mangParts = new Map<string, CanTuDongFormulaPart>();

  const totals = rows.reduce(
    (acc, row) => {
      acc.so_cuon += Number(row.so_cuon) || 0;
      acc.tong_trong_luong_kg += Number(row.tong_trong_luong_kg) || 0;
      acc.nhua_dm_kg += Number(row.nhua_dm_kg) || 0;
      acc.khoi_luong_mang_kg += Number(row.khoi_luong_mang_kg) || 0;
      acc.nhua_tt_kg += Number(row.nhua_tt_kg) || 0;
      acc.chenh_lech_nhua_kg += Number(row.chenh_lech_nhua_kg) || 0;
      acc.loi_dm_kg += Number(row.loi_dm_kg) || 0;
      acc.loi_tt_kg += Number(row.loi_tt_kg) || 0;
      acc.trong_luong_bi_kg += Number(row.trong_luong_bi_kg) || 0;
      return acc;
    },
    {
      so_cuon: 0,
      tong_trong_luong_kg: 0,
      nhua_dm_kg: 0,
      khoi_luong_mang_kg: 0,
      nhua_tt_kg: 0,
      chenh_lech_nhua_kg: 0,
      phan_tram_chenh: null as number | null,
      loi_dm_kg: 0,
      loi_tt_kg: 0,
      trong_luong_bi_kg: 0,
      nhua_dm_formula: '',
      mang_formula: '',
      nhua_dm_parts: [] as CanTuDongFormulaPart[],
      mang_parts: [] as CanTuDongFormulaPart[]
    }
  );

  for (const row of rows) {
    mergeFormulaParts(nhuaDmParts, row.nhua_dm_parts);
    mergeFormulaParts(mangParts, row.mang_parts);
  }
  totals.nhua_dm_formula = buildKgTimesRollFormula(nhuaDmParts, 'KL nhựa+phụ gia × cuộn');
  totals.mang_formula = buildKgTimesRollFormula(mangParts, 'BOM màng × cuộn');
  totals.nhua_dm_parts = mapToFormulaParts(nhuaDmParts);
  totals.mang_parts = mapToFormulaParts(mangParts);

  totals.phan_tram_chenh =
    totals.nhua_tt_kg !== 0
      ? Math.round((totals.chenh_lech_nhua_kg / totals.nhua_tt_kg) * 10000) / 100
      : null;
  return totals;
}

/**
 * Tổng Nhựa ĐM banner «Tổng hợp nhựa» — cùng logic cột «Trọng lượng Nhựa ĐM» tab cân thực tế.
 * Σ (trong_luong_nhua Kho hàng × 1 cuộn) theo Mã SP từ QR.
 */
export function computeCanTuDongNhuaDinhMucTotals(
  records: CanTuDongWeightRow[],
  products: ProductRow[]
): { weightKg: number; counted: number; formula: string } {
  const { plasticKgByProductCode } = buildCanTuDongProductWeightMaps(products);
  const parts = new Map<string, CanTuDongFormulaPart>();
  let weightKg = 0;
  let counted = 0;
  for (const row of records) {
    const maSpKey = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
    const nhuaDm = resolveCanTuDongNhuaDinhMucKgPerRoll(
      maSpKey ? plasticKgByProductCode.get(maSpKey) : undefined
    );
    if (nhuaDm == null || !maSpKey) continue;
    weightKg += nhuaDm;
    counted += 1;
    bumpFormulaPart(parts, maSpKey, nhuaDm);
  }
  return {
    weightKg: Math.round(weightKg * 1000) / 1000,
    counted,
    formula: buildKgTimesRollFormula(parts, 'KL nhựa+phụ gia × cuộn')
  };
}

/** KPI banner «Tổng hợp nhựa» — cùng tổng cột tab Dữ liệu cân thực tế. */
export function computeCanTuDongTongHopBannerTotals(
  records: CanTuDongWeightRow[],
  products: ProductRow[]
) {
  const detailRows = buildCanTuDongTongHopDetailRows(records, products);
  const totals = sumCanTuDongTongHopDetailRows(detailRows);
  const formulas = explainCanTuDongTongHopRowFormulas(totals);
  return { detailRows, totals, formulas };
}

/** Dòng công thức hiển thị dưới số trên tab Dữ liệu cân thực tế. */
export function explainCanTuDongTongHopRowFormulas(row: {
  so_cuon: number;
  tong_trong_luong_kg: number;
  nhua_dm_kg: number;
  khoi_luong_mang_kg: number;
  nhua_tt_kg: number;
  chenh_lech_nhua_kg: number;
  phan_tram_chenh: number | null;
  loi_dm_kg: number;
  loi_tt_kg: number;
  trong_luong_bi_kg: number;
  nhua_dm_formula?: string;
  mang_formula?: string;
}) {
  const biLabel = String(DEFAULT_CAN_TU_DONG_BI_KG).replace('.', ',');
  const fmt = formatCanTuDongFormulaNumber;
  const hasNhuaTtParts =
    row.tong_trong_luong_kg > 0 || row.loi_tt_kg > 0 || row.trong_luong_bi_kg > 0;

  return {
    tongTrongLuong: 'Σ Cân sản phẩm',
    nhuaDmShort: 'KL nhựa+phụ gia × cuộn',
    nhuaDm: row.nhua_dm_formula || 'KL nhựa+phụ gia × cuộn',
    mangShort: 'BOM màng × cuộn',
    mang: row.mang_formula || 'BOM màng × cuộn',
    nhuaTtShort: 'SP − lõi − bì − màng',
    nhuaTt:
      hasNhuaTtParts
        ? `${fmt(row.tong_trong_luong_kg)} − ${fmt(row.loi_tt_kg)} − ${fmt(row.trong_luong_bi_kg)} − ${fmt(row.khoi_luong_mang_kg)}`
        : 'SP − lõi − bì − màng',
    chenhLechShort: 'TT − ĐM',
    chenhLech:
      row.nhua_tt_kg !== 0 || row.nhua_dm_kg !== 0
        ? `${fmt(row.nhua_tt_kg)} − ${fmt(row.nhua_dm_kg)}`
        : 'TT − ĐM',
    phanTramChenhShort: 'CL ÷ TT × 100',
    phanTramChenh:
      row.phan_tram_chenh != null && row.nhua_tt_kg !== 0
        ? `${fmt(row.chenh_lech_nhua_kg)} ÷ ${fmt(row.nhua_tt_kg)} × 100`
        : 'CL ÷ TT × 100',
    loiDm: 'Σ TL lõi (Kho hàng)',
    loiTt: 'Σ Cân lõi',
    trongLuongBi:
      row.so_cuon > 0 ? `${row.so_cuon} × ${biLabel}` : `${biLabel} / cuộn`
  };
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

/** Tải phiếu cân không ảnh — chỉ dùng khi Tính toán / in / tab cân thực tế đủ tiêu chí. */
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

export { DEFAULT_CAN_TU_DONG_BI_KG };
