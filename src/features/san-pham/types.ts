import { formatNumber, formatPercent, parsePercentInput } from '../../utils';
import type { BulkProductNplComponentsExcelRow, ProductNplComponentsExcelRow } from '../../utils/productNplComponentsExcel';

export function normalizeProductCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
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
}

export type ProductNplAmountType = 'percent' | 'quantity';

export interface ProductNplItem {
  code: string;
  name: string;
  amountType: ProductNplAmountType;
  percent: number | null;
  quantity: number | null;
  unit: string;
}

export interface MaterialOption {
  code: string;
  name: string;
  unit: string;
  /** Tổng khối lượng (kg/ĐVT) từ kho NVL — dùng để quy đổi số lượng sang kg khi ĐVT ≠ kg. */
  totalWeight?: string;
}

export function roundNplNumber(value: number) {
  return Math.round(value * 100) / 100;
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

export function formatProductNplAmount(item: ProductNplItem) {
  if (item.amountType === 'quantity') {
    const unitSuffix = item.unit && item.unit !== '-' ? ` ${item.unit}` : '';
    const quantityLabel = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(item.quantity ?? 0);
    return `${quantityLabel}${unitSuffix}`;
  }
  return `${formatPercent(item.percent ?? 0)}%`;
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

  return list
    .map((entry): ProductNplItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.code ?? record.ma ?? '').trim();
      const name = String(record.ten_npl ?? record.name ?? record.ten ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim() || '-';
      const amountType = resolveProductNplAmountType(record);

      if (!code) return null;

      if (amountType === 'quantity') {
        const quantity = Number(record.so_luong ?? record.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) return null;
        return {
          code,
          name,
          amountType: 'quantity',
          percent: null,
          quantity,
          unit
        };
      }

      const percent = Number(record.phan_tram ?? record.percent ?? record.ty_le);
      if (!Number.isFinite(percent)) return null;
      return {
        code,
        name,
        amountType: 'percent',
        percent: roundNplNumber(percent),
        quantity: null,
        unit
      };
    })
    .filter((item): item is ProductNplItem => Boolean(item));
}

export function formatProductNplSummary(items: ProductNplItem[]) {
  if (items.length === 0) return '-';
  return items.map(item => `${item.code} ${formatProductNplAmount(item)}`).join(' · ');
}

export function productNplItemsToJson(items: ProductNplItem[]) {
  return items.map(item => {
    const base = {
      ma_npl: item.code,
      ten_npl: item.name,
      loai: item.amountType === 'quantity' ? 'so_luong' : 'phan_tram',
      don_vi: item.unit && item.unit !== '-' ? item.unit : null
    };

    if (item.amountType === 'quantity') {
      return {
        ...base,
        so_luong: item.quantity,
        phan_tram: null
      };
    }

    return {
      ...base,
      phan_tram: item.percent,
      so_luong: null
    };
  });
}

export function excelRowsToProductNplItems(
  rows: ProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
): ProductNplItem[] {
  return rows.map(row => {
    const material = materialOptions.find(
      option => normalizeProductCodeKey(option.code) === normalizeProductCodeKey(row.code)
    );
    const name = row.name || material?.name || '';
    if (row.amountType === 'quantity') {
      return {
        code: row.code.trim(),
        name,
        amountType: 'quantity',
        percent: null,
        quantity: row.value,
        unit: row.unit || material?.unit || '-'
      };
    }

    return {
      code: row.code.trim(),
      name,
      amountType: 'percent',
      percent: row.value,
      quantity: null,
      unit: '-'
    };
  });
}

export function bulkExcelRowsToProductMap(
  rows: BulkProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
) {
  const grouped = new Map<string, ProductNplItem[]>();

  rows.forEach(row => {
    const material = materialOptions.find(
      option => normalizeProductCodeKey(option.name) === normalizeProductCodeKey(row.componentName)
    );
    const item: ProductNplItem =
      row.amountType === 'quantity'
        ? {
            code: material?.code || row.componentName.trim(),
            name: row.componentName || material?.name || '',
            amountType: 'quantity',
            percent: null,
            quantity: row.value,
            unit: row.unit || material?.unit || '-'
          }
        : {
            code: material?.code || row.componentName.trim(),
            name: row.componentName || material?.name || '',
            amountType: 'percent',
            percent: row.value,
            quantity: null,
            unit: '-'
          };

    const key = normalizeProductCodeKey(row.productCode);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  });

  return grouped;
}


