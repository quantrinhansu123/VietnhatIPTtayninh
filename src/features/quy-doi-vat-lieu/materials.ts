export type ConversionMaterialOption = {
  code: string;
  name: string;
  unit: string;
  /** Trọng lượng định mức (kg) / 1 ĐVT — từ `tong_trong_luong` Kho NVL. */
  unitWeight: number | null;
  /** Chiều dài đơn vị (cm) — từ `chieu_dai_don_vi` Kho NVL. */
  unitLength: number | null;
};

function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Suy chiều dài (cm) từ mã/tên khi Kho NVL chưa có `chieu_dai_don_vi`.
 * VD: ONG-1.38M → 138; ONG-30CM → 30; "1,38m" → 138.
 */
export function inferUnitLengthCm(...parts: Array<string | null | undefined>): number | null {
  const text = parts.filter(Boolean).join(' ');
  if (!text) return null;
  const meter = text.match(/(\d+(?:[.,]\d+)?)\s*m(?![a-z])/i);
  if (meter) {
    const meters = Number(meter[1].replace(',', '.'));
    if (Number.isFinite(meters) && meters > 0) return Math.round(meters * 100 * 1e6) / 1e6;
  }
  const cm = text.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (cm) {
    const value = Number(cm[1].replace(',', '.'));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/** Thông số chiều dài / TL/cái lấy từ Kho NVL (có fallback suy từ mã·tên). */
export function materialSpecs(option: ConversionMaterialOption | undefined): {
  unitLength: number | null;
  unitWeight: number | null;
} {
  if (!option) return { unitLength: null, unitWeight: null };
  return {
    unitLength: option.unitLength ?? inferUnitLengthCm(option.code, option.name),
    unitWeight: option.unitWeight
  };
}

/** Danh mục Kho NVL, gộp cùng mã để không lặp lựa chọn giữa các kho. */
export function buildConversionMaterialOptions(data: unknown): ConversionMaterialOption[] {
  if (!data || typeof data !== 'object') return [];
  const materials = (data as { materials?: unknown }).materials;
  if (!Array.isArray(materials)) return [];
  const byCode = new Map<string, ConversionMaterialOption>();
  for (const item of materials) {
    if (!item || typeof item !== 'object') continue;
    const code = String((item as { ma_npl?: unknown }).ma_npl ?? '').trim();
    if (!code || byCode.has(code)) continue;
    const row = item as {
      ten_npl?: unknown;
      don_vi?: unknown;
      tong_trong_luong?: unknown;
      totalWeight?: unknown;
      chieu_dai_don_vi?: unknown;
      unitLength?: unknown;
    };
    const name = String(row.ten_npl ?? '').trim();
    const fromDb = parseDecimal(row.chieu_dai_don_vi ?? row.unitLength);
    byCode.set(code, {
      code,
      name,
      unit: String(row.don_vi ?? '').trim(),
      unitWeight: parseDecimal(row.tong_trong_luong ?? row.totalWeight),
      unitLength: fromDb ?? inferUnitLengthCm(code, name)
    });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }));
}

export function formatConversionMaterial(option: ConversionMaterialOption): string {
  return [option.code, option.name, option.unit].filter(Boolean).join(' · ');
}

export function parseDraftQuantity(value: string): number | null {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}

/** Trọng lượng = SL × trọng lượng / cái. */
export function calcConversionWeight(unitWeight: number | null | undefined, quantity: number | null): number | null {
  if (unitWeight == null || quantity == null || !(unitWeight >= 0) || !(quantity >= 0)) return null;
  return round6(unitWeight * quantity);
}

/** Kích thước tổng sau cắt (cm) = chiều dài × định mức. */
export function calcKichThuocTong(lengthCm: number | null | undefined, dinhMuc: number | null | undefined): number | null {
  if (lengthCm == null || dinhMuc == null || !(lengthCm >= 0) || !(dinhMuc > 0)) return null;
  return round6(lengthCm * dinhMuc);
}

/** SL đích = SL gốc × định mức (SL trên 1 cái gốc). */
export function calcDestQuantity(sourceQty: number | null | undefined, dinhMuc: number | null | undefined): number | null {
  if (sourceQty == null || dinhMuc == null || !(sourceQty > 0) || !(dinhMuc > 0)) return null;
  return round6(sourceQty * dinhMuc);
}

/**
 * TL/cái đích: ưu tiên Kho NVL; không có thì tỷ lệ theo chiều dài
 * (TL gốc / dài gốc × dài đích) — giống phiếu cắt lõi.
 */
export function resolveDestUnitWeight(input: {
  catalogWeight?: number | null;
  sourceWeight?: number | null;
  sourceLength?: number | null;
  destLength?: number | null;
}): number | null {
  if (input.catalogWeight != null && Number.isFinite(input.catalogWeight) && input.catalogWeight >= 0) {
    return input.catalogWeight;
  }
  const { sourceWeight, sourceLength, destLength } = input;
  if (
    sourceWeight == null ||
    sourceLength == null ||
    destLength == null ||
    !(sourceWeight >= 0) ||
    !(sourceLength > 0) ||
    !(destLength >= 0)
  ) {
    return null;
  }
  return round6((sourceWeight / sourceLength) * destLength);
}

export function formatDraftNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}
