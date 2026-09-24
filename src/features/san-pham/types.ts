import { parsePercentInput } from '../../utils';
import type { BulkProductNplComponentsExcelRow, ProductNplComponentsExcelRow } from '../../utils/productNplComponentsExcel';
import {
  mergeBulkProductNplComponentRows,
  mergeProductNplComponentRows
} from '../../utils/productNplComponentsExcel';

/**
 * Khớp mã SP/NVL khi so Excel ↔ DB.
 * `MT- MN001` (có dấu cách) và `MT-MN001` (không cách) → cùng khóa `MT-MN001`.
 * Giữ nguyên mã gốc khi lưu/hiển thị (vd vẫn là `MT- MN001`).
 */
export function normalizeProductCodeKey(code: string) {
  return String(code ?? '')
    .trim()
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
    .toUpperCase();
}

/**
 * Chuẩn hóa mã NVL để khớp Excel ↔ kho:
 * - bỏ khoảng trắng, hoa
 * - dấu phẩy thập phân → chấm (T1,08 → T1.08)
 * - x/× giữa hai số → * (T1.08x2.2m → T1.08*2.2m)
 */
export function normalizeNvlMatchKey(code: string) {
  return normalizeProductCodeKey(code)
    .replace(/,/g, '.')
    .replace(/(\d)[X×](?=\d)/gi, '$1*');
}

export function findMaterialOptionByCode(
  materialOptions: MaterialOption[],
  rawCode: string
): MaterialOption | null {
  const raw = String(rawCode || '').trim();
  if (!raw) return null;

  const exactKey = normalizeProductCodeKey(raw);
  const matchKey = normalizeNvlMatchKey(raw);

  const byExact = materialOptions.find(option => normalizeProductCodeKey(option.code) === exactKey);
  if (byExact) return byExact;

  const byNorm = materialOptions.find(option => normalizeNvlMatchKey(option.code) === matchKey);
  if (byNorm) return byNorm;

  // Đ/đ ↔ D (ĐN ↔ DN) — chỉ khi đúng 1 ứng viên
  const folded = matchKey.replace(/Đ/g, 'D');
  const byFolded = materialOptions.filter(
    option => normalizeNvlMatchKey(option.code).replace(/Đ/g, 'D') === folded
  );
  if (byFolded.length === 1) return byFolded[0];

  // Khớp theo tên NVL (file ghi nhầm tên vào cột mã)
  const byName = materialOptions.find(
    option =>
      normalizeProductCodeKey(option.name) === exactKey || normalizeNvlMatchKey(option.name) === matchKey
  );
  if (byName) return byName;

  // Tiền tố duy nhất: BTT → BTT OB1
  const prefixHits = materialOptions.filter(option => {
    const optionKey = normalizeNvlMatchKey(option.code);
    return (
      optionKey.startsWith(matchKey) ||
      matchKey.startsWith(optionKey) ||
      optionKey.replace(/Đ/g, 'D').startsWith(folded) ||
      folded.startsWith(optionKey.replace(/Đ/g, 'D'))
    );
  });
  if (prefixHits.length === 1) return prefixHits[0];

  return null;
}

export interface ProductRow {
  id: string;
  code: string;
  newCode: string;
  amisCode: string;
  name: string;
  nature: string;
  group: string;
  unit: string;
  warehouse: string;
  totalWeight: string;
  rollWidth: string;
  rollLength: string;
  coreWeight: string;
  bagWeight: string;
  plasticWeight: string;
  openingStock: string;
  inbound: string;
  outbound: string;
  stock: string;
  minStock: string;
  origin: string;
  description: string;
  nplItems: ProductNplItem[];
  /** Dòng tồn phát sinh từ phiếu kho nhưng chưa có bản ghi riêng trong danh mục san_pham. */
  inventoryBalanceOnly?: boolean;
}

export type ProductNplAmountType = 'percent' | 'quantity';

export interface ProductNplItem {
  code: string;
  name: string;
  amountType: ProductNplAmountType;
  percent: number | null;
  quantity: number | null;
  unit: string;
  /** Khối lượng (kg) gắn kèm từ Excel (vd dòng Số lượng + Kg cạnh dòng Cái). */
  weightKg?: number | null;
}

export interface MaterialOption {
  code: string;
  name: string;
  unit: string;
  /** Tổng khối lượng (kg/ĐVT) từ kho NVL — dùng để quy đổi số lượng sang kg khi ĐVT ≠ kg. */
  totalWeight?: string;
}

export function roundNplNumber(value: number) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Dữ liệu cũ / Excel tỷ lệ 0–1: nếu các % có max ≤ 1 và tổng ≈ 1 thì ×100.
 * Vd 0,825 + 0,0917 + … ≈ 1 → 82,5% + 9,17% + …
 */
export function scaleProductNplItemPercentFractions(items: ProductNplItem[]): ProductNplItem[] {
  const percentValues = items
    .map(item => item.percent)
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (percentValues.length < 2) return items;
  const max = Math.max(...percentValues);
  const sum = percentValues.reduce((acc, value) => acc + value, 0);
  if (!(max <= 1 && sum >= 0.5 && sum <= 1.5)) return items;
  return items.map(item => ({
    ...item,
    percent:
      item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)
        ? item.percent * 100
        : item.percent
  }));
}

/** Hiển thị Thành phần: giữ nguyên số liệu (tối đa 10 chữ số thập phân, bỏ 0 thừa). */
export function formatNplDecimal(value: number) {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(10).replace(/\.?0+$/, '');
  return fixed.replace('.', ',');
}

/** Trọng lượng từ Excel / định mức: giữ nguyên số (không làm tròn), bỏ 0 thừa. */
export function formatNplWeightKg(value: number) {
  return formatNplDecimal(value);
}

export function resolveProductNplAmountType(record: Record<string, unknown>): ProductNplAmountType {
  const loai = String(record.loai ?? record.amountType ?? record.dinh_luong_loai ?? '').trim().toLowerCase();
  if (loai === 'so_luong' || loai === 'quantity') return 'quantity';
  if (loai === 'phan_tram' || loai === 'percent') return 'percent';

  const quantityRaw = record.so_luong ?? record.quantity;
  const percentRaw = record.phan_tram ?? record.percent ?? record.ty_le;
  const quantity = parsePercentInput(String(quantityRaw ?? ''));
  const percent = parsePercentInput(String(percentRaw ?? ''));

  if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== '' && (percentRaw === undefined || percentRaw === null || percentRaw === '')) {
    return 'quantity';
  }

  if (Number.isFinite(quantity) && !Number.isFinite(percent)) return 'quantity';
  return 'percent';
}

export function productNplAmountTypeLabel(type: ProductNplAmountType) {
  return type === 'quantity' ? 'Số lượng' : 'Phần trăm';
}

function isKgUnitLabel(unit: string) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'kg' || normalized === 'kgs' || normalized === 'kilogram';
}

/** Một dòng đủ: % · số lượng ĐVT · kg (vd 9,17% · 0,54 kg hoặc 1 Cái · 0,1333 kg). */
export function formatProductNplAmount(
  item: ProductNplItem,
  options?: { resolvedWeightKg?: number | null }
) {
  const parts: string[] = [];
  const resolvedWeight =
    options?.resolvedWeightKg !== undefined ? options.resolvedWeightKg : item.weightKg;

  if (item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)) {
    parts.push(`${formatNplDecimal(item.percent)}%`);
  }

  if (item.quantity !== null && item.quantity !== undefined && Number.isFinite(item.quantity)) {
    const unit = String(item.unit ?? '').trim();
    const unitIsKg = isKgUnitLabel(unit);
    const weightMatchesQuantity =
      resolvedWeight !== null &&
      resolvedWeight !== undefined &&
      Number.isFinite(resolvedWeight) &&
      Math.abs(resolvedWeight - item.quantity) < 1e-9;

    // Tránh lặp "0,54 kg · 0,54 kg" khi quantity chính là kg.
    if (!(unitIsKg && weightMatchesQuantity)) {
      const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
      parts.push(`${formatNplDecimal(item.quantity)}${unitSuffix}`);
    }
  }

  if (resolvedWeight !== null && resolvedWeight !== undefined && Number.isFinite(resolvedWeight)) {
    parts.push(`${formatNplWeightKg(resolvedWeight)} kg`);
  }

  if (parts.length > 0) return parts.join(' · ');

  if (item.amountType === 'quantity') {
    const unitSuffix = item.unit && item.unit !== '-' ? ` ${item.unit}` : '';
    return `${formatNplDecimal(item.quantity ?? 0)}${unitSuffix}`;
  }
  return `${formatNplDecimal(item.percent ?? 0)}%`;
}

export function parseProductNplItems(raw: unknown): ProductNplItem[] {
  let source = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(source)
    ? source
    : source && typeof source === 'object' && Array.isArray((source as { items?: unknown }).items)
      ? (source as { items: unknown[] }).items
      : [];

  const parsed = list
    .map((entry): ProductNplItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.code ?? record.ma ?? '').trim();
      const name = String(record.ten_npl ?? record.name ?? record.ten ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim() || '-';
      const amountType = resolveProductNplAmountType(record);

      if (!code) return null;

      if (amountType === 'quantity') {
        const quantityRaw = record.so_luong ?? record.quantity;
        const quantity = Number(quantityRaw);
        const weightRaw = Number(record.khoi_luong_kg ?? record.weightKg ?? record.weight_kg);
        const hasWeight = Number.isFinite(weightRaw) && weightRaw >= 0;
        const quantityMissing =
          quantityRaw === undefined || quantityRaw === null || quantityRaw === '';
        // 0 hợp lệ; chỉ có Kg (vd BDT) → quantity null.
        if (quantityMissing && hasWeight) {
          // ok
        } else if (!Number.isFinite(quantity) || quantity < 0) {
          return null;
        }
        const percentRaw = Number(record.phan_tram ?? record.percent ?? record.ty_le);
        return {
          code,
          name,
          amountType: 'quantity',
          percent: Number.isFinite(percentRaw) && percentRaw >= 0 ? percentRaw : null,
          quantity: quantityMissing && hasWeight ? null : quantity,
          unit,
          weightKg: hasWeight ? weightRaw : null
        };
      }

      const percent = Number(record.phan_tram ?? record.percent ?? record.ty_le);
      if (!Number.isFinite(percent)) return null;
      const weightRaw = Number(record.khoi_luong_kg ?? record.weightKg ?? record.weight_kg);
      return {
        code,
        name,
        amountType: 'percent',
        percent,
        quantity: null,
        unit: unit === '-' ? '%' : unit,
        weightKg: Number.isFinite(weightRaw) && weightRaw >= 0 ? weightRaw : null
      };
    })
    .filter((item): item is ProductNplItem => Boolean(item));

  return scaleProductNplItemPercentFractions(parsed);
}

export function formatProductNplSummary(items: ProductNplItem[]) {
  if (items.length === 0) return '-';
  return items.map(item => `${item.code} ${formatProductNplAmount(item)}`).join(' · ');
}

export function productNplItemsToJson(items: ProductNplItem[]) {
  return items.map(item => {
    // Giữ nguyên số Excel (kể cả 0) — không làm tròn khi đẩy lên API.
    const weightKg =
      item.weightKg !== null && item.weightKg !== undefined && Number.isFinite(item.weightKg)
        ? item.weightKg
        : null;

    if (item.amountType === 'quantity') {
      const hasQty =
        item.quantity !== null && item.quantity !== undefined && Number.isFinite(item.quantity);
      return {
        ma_npl: item.code,
        ten_npl: item.name,
        loai: 'so_luong',
        don_vi: item.unit && item.unit !== '-' ? item.unit : weightKg !== null ? 'kg' : null,
        // Dòng chỉ có Kg (vd BDT 0.0085): so_luong = 0 (không null) để qua validate >= 0.
        so_luong: hasQty ? item.quantity : 0,
        phan_tram:
          item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)
            ? item.percent
            : null,
        khoi_luong_kg: weightKg
      };
    }

    return {
      ma_npl: item.code,
      ten_npl: item.name,
      loai: 'phan_tram',
      don_vi: '%',
      phan_tram: item.percent,
      so_luong: null,
      khoi_luong_kg: weightKg
    };
  });
}

export function excelRowsToProductNplItems(
  rows: ProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
): ProductNplItem[] {
  const items = mergeProductNplComponentRows(rows).map(row => {
    const material = findMaterialOptionByCode(materialOptions, row.code);
    const name = row.name || material?.name || '';
    const code = (material?.code || row.code).trim();
    const weightKg = row.weightKg ?? null;
    const companionPercent =
      row.percent !== undefined && Number.isFinite(row.percent) ? row.percent : null;

    if (row.amountType === 'quantity') {
      const unit = row.unit || material?.unit || '-';
      return {
        code,
        name,
        amountType: 'quantity' as const,
        percent: companionPercent,
        quantity: row.value,
        unit,
        weightKg:
          weightKg ??
          (isKgUnitLabel(unit) ? row.value : null)
      };
    }

    return {
      code,
      name,
      amountType: 'percent' as const,
      percent: row.value,
      quantity: null,
      unit: '%',
      weightKg
    };
  });

  return scaleProductNplItemPercentFractions(items);
}

export function bulkExcelRowsToProductMap(
  rows: BulkProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
) {
  const grouped = new Map<string, ProductNplItem[]>();

  mergeBulkProductNplComponentRows(rows).forEach(row => {
    const material = findMaterialOptionByCode(materialOptions, row.componentCode);
    const code = (material?.code || row.componentCode).trim();
    const name = material?.name || row.componentName || '';
    const unitRaw = String(row.unit || '').trim();
    const unitIsKg = unitRaw.toLowerCase().replace(/[^a-z]/g, '').startsWith('kg');
    const companionPercent =
      row.percent !== undefined && Number.isFinite(row.percent) ? row.percent : null;
    const excelWeight =
      row.weightKg !== null && row.weightKg !== undefined && Number.isFinite(row.weightKg)
        ? row.weightKg
        : unitIsKg && Number.isFinite(row.value)
          ? row.value
          : null;

    let item: ProductNplItem;

    if (row.amountType === 'percent') {
      item = {
        code,
        name,
        amountType: 'percent',
        percent: row.value,
        quantity: null,
        unit: '%',
        weightKg: excelWeight
      };
    } else if (unitIsKg) {
      item = {
        code,
        name,
        amountType: companionPercent !== null ? 'percent' : 'quantity',
        percent: companionPercent,
        quantity: null,
        unit: companionPercent !== null ? '%' : 'kg',
        weightKg: excelWeight
      };
    } else {
      item = {
        code,
        name,
        amountType: companionPercent !== null ? 'percent' : 'quantity',
        percent: companionPercent,
        quantity: row.value,
        unit: unitRaw || material?.unit || '-',
        weightKg: excelWeight
      };
    }

    const key = normalizeProductCodeKey(row.productCode);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  });

  const scaled = new Map<string, ProductNplItem[]>();
  grouped.forEach((items, key) => {
    scaled.set(key, scaleProductNplItemPercentFractions(items));
  });
  return scaled;
}


