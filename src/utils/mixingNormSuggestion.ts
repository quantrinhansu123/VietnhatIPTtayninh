import { shiftNamesMatch } from './shiftSettings';

/** Khớp MixingRoundItem trên form báo cáo phối trộn (tránh import vòng từ MixingReportForm). */
export type MixingNormRoundItemDraft = {
  ma_nvl: string;
  ten_vat_tu: string;
  don_vi?: string;
  so_luong: number | null;
  kl_thuc_te: number | null;
  ti_le_phan_tram: number | null;
};

export type MixingNormSuggestionProduct = {
  ma_sp: string;
  ten_sp: string;
  tong_trong_luong: number | null;
  nvl: MixingNormSuggestionLine[];
};

export type MixingNormSuggestionLine = {
  ma_nvl: string;
  ten_nvl: string;
  gia_tri: number | null;
  don_vi: '%' | 'kg';
  khoi_luong: number | null;
};

export type MixingNormSuggestion = {
  id: string;
  ngay: string;
  ca: string;
  ma_lenh_sx: string;
  ghi_chu: string;
  products: MixingNormSuggestionProduct[];
  nvlCount: number;
};

function parseNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim().replace(/\./g, '').replace(',', '.');
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function calcKhoiLuong(
  tongTrongLuong: number | null,
  giaTri: number | null,
  donVi: '%' | 'kg'
): number | null {
  if (giaTri === null) return null;
  if (donVi === '%') {
    if (tongTrongLuong === null || !Number.isFinite(tongTrongLuong)) return null;
    return (tongTrongLuong * giaTri) / 100;
  }
  return giaTri;
}

function normalizeLines(raw: unknown, tongTrongLuong: number | null): MixingNormSuggestionLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): MixingNormSuggestionLine | null => {
      if (!item || typeof item !== 'object') return null;
      const line = item as Record<string, unknown>;
      const ma_nvl = String(line.ma_nvl ?? '').trim();
      const ten_nvl = String(line.ten_nvl ?? '').trim();
      if (!ma_nvl && !ten_nvl) return null;
      const gia_tri = parseNumberOrNull(line.gia_tri ?? line.dinh_muc);
      const don_vi = String(line.don_vi ?? 'kg').trim() === '%' ? '%' : 'kg';
      const saved = parseNumberOrNull(line.khoi_luong ?? line.khoiLuong);
      return {
        ma_nvl,
        ten_nvl,
        gia_tri,
        don_vi,
        khoi_luong: saved ?? calcKhoiLuong(tongTrongLuong, gia_tri, don_vi)
      };
    })
    .filter((line): line is MixingNormSuggestionLine => Boolean(line));
}

function looksLikeProductBlock(item: Record<string, unknown>): boolean {
  if (Array.isArray(item.nvl)) return true;
  if (Array.isArray(item.chi_tiet) && (item.ma_sp || item.ten_sp)) return true;
  const maSp = String(item.ma_sp ?? '').trim();
  const maNvl = String(lineMaNvl(item));
  return Boolean(maSp) && !maNvl;
}

function lineMaNvl(item: Record<string, unknown>) {
  return String(item.ma_nvl ?? '').trim();
}

function normalizeProductBlock(item: Record<string, unknown>): MixingNormSuggestionProduct | null {
  const ma_sp = String(item.ma_sp ?? '').trim();
  const ten_sp = String(item.ten_sp ?? '').trim();
  const tong_trong_luong = parseNumberOrNull(item.tong_trong_luong);
  const nvl = normalizeLines(item.nvl ?? item.chi_tiet, tong_trong_luong);
  if (!ma_sp && !ten_sp && nvl.length === 0) return null;
  return { ma_sp, ten_sp, tong_trong_luong, nvl };
}

function materialKey(line: Pick<MixingNormSuggestionLine, 'ma_nvl' | 'ten_nvl'>) {
  return (line.ma_nvl || line.ten_nvl).trim().toLowerCase().replace(/\s+/g, '');
}

/** Chuẩn hóa 1 phiếu định mức QC (có thể nhiều SP). */
export function normalizeMixingNormSuggestion(row: Record<string, unknown>): MixingNormSuggestion | null {
  const id = String(row.id ?? '').trim();
  if (!id) return null;

  const rawChiTiet = row.chi_tiet;
  let products: MixingNormSuggestionProduct[] = [];

  if (Array.isArray(rawChiTiet) && rawChiTiet.length > 0) {
    const first = rawChiTiet[0];
    const isNewFormat =
      first && typeof first === 'object' && looksLikeProductBlock(first as Record<string, unknown>);

    if (isNewFormat) {
      products = rawChiTiet
        .map(entry =>
          entry && typeof entry === 'object'
            ? normalizeProductBlock(entry as Record<string, unknown>)
            : null
        )
        .filter((p): p is MixingNormSuggestionProduct => Boolean(p));
    } else {
      const tong_trong_luong = parseNumberOrNull(row.tong_trong_luong);
      let nvl = normalizeLines(rawChiTiet, tong_trong_luong);
      if (nvl.length === 0) {
        const ma = String(row.ma_nvl ?? '').trim();
        const ten = String(row.ten_nvl ?? '').trim();
        if (ma || ten) {
          const gia_tri = parseNumberOrNull(row.dinh_muc ?? row.gia_tri);
          const don_vi = String(row.don_vi_dinh_muc ?? row.don_vi ?? 'kg').trim() === '%' ? '%' : 'kg';
          nvl = [
            {
              ma_nvl: ma,
              ten_nvl: ten,
              gia_tri,
              don_vi,
              khoi_luong: calcKhoiLuong(tong_trong_luong, gia_tri, don_vi)
            }
          ];
        }
      }
      if (nvl.length > 0) {
        products = [
          {
            ma_sp: String(row.ma_sp ?? '').trim(),
            ten_sp: String(row.ten_sp ?? '').trim(),
            tong_trong_luong,
            nvl
          }
        ];
      }
    }
  }

  const nvlCount = products.reduce((sum, product) => sum + product.nvl.length, 0);
  return {
    id,
    ngay: String(row.ngay ?? '').slice(0, 10),
    ca: String(row.ca ?? '').trim(),
    ma_lenh_sx: String(row.ma_lenh_sx ?? '').trim(),
    ghi_chu: String(row.ghi_chu ?? '').trim(),
    products,
    nvlCount
  };
}

export function normalizeMixingNormSuggestions(data: unknown): MixingNormSuggestion[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return rows
    .map(row => (row && typeof row === 'object' ? normalizeMixingNormSuggestion(row as Record<string, unknown>) : null))
    .filter((row): row is MixingNormSuggestion => Boolean(row));
}

export function filterMixingNormSuggestionsByDateShift(
  norms: MixingNormSuggestion[],
  ngay: string,
  ca: string
): MixingNormSuggestion[] {
  const date = String(ngay || '').slice(0, 10);
  const shift = String(ca || '').trim();
  if (!date || !shift) return [];
  return norms.filter(row => row.ngay === date && shiftNamesMatch(row.ca, shift));
}

/** Gộp NVL trùng mã từ mọi SP → dòng lần trộn trên form báo cáo phối trộn. */
export function mixingNormToRoundItems(norm: MixingNormSuggestion): MixingNormRoundItemDraft[] {
  const merged = new Map<string, MixingNormRoundItemDraft>();

  for (const product of norm.products) {
    for (const line of product.nvl) {
      const key = materialKey(line) || `${line.ma_nvl}|${line.ten_nvl}`;
      if (!key) continue;

      const ti_le_phan_tram = line.don_vi === '%' ? line.gia_tri : null;
      const so_luong =
        line.khoi_luong !== null && Number.isFinite(line.khoi_luong)
          ? Math.round(line.khoi_luong * 1000) / 1000
          : line.don_vi === 'kg'
            ? line.gia_tri
            : null;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ma_nvl: line.ma_nvl,
          ten_vat_tu: line.ten_nvl,
          don_vi: 'kg',
          so_luong,
          kl_thuc_te: null,
          ti_le_phan_tram
        });
        continue;
      }

      const nextSoLuong =
        existing.so_luong === null && so_luong === null
          ? null
          : (existing.so_luong ?? 0) + (so_luong ?? 0);
      const nextPct =
        existing.ti_le_phan_tram === null && ti_le_phan_tram === null
          ? null
          : (existing.ti_le_phan_tram ?? 0) + (ti_le_phan_tram ?? 0);

      merged.set(key, {
        ...existing,
        ten_vat_tu: existing.ten_vat_tu || line.ten_nvl,
        ma_nvl: existing.ma_nvl || line.ma_nvl,
        so_luong: nextSoLuong === null ? null : Math.round(nextSoLuong * 1000) / 1000,
        ti_le_phan_tram: nextPct === null ? null : Math.round(nextPct * 1000) / 1000
      });
    }
  }

  return [...merged.values()].filter(
    item => item.ma_nvl.trim() || item.ten_vat_tu.trim() || item.so_luong !== null
  );
}
