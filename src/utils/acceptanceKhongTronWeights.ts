/**
 * Trọng lượng NVL không trộn — cùng rule bảng phẳng Báo cáo sản lượng:
 * - Túi = Σ `trong_luong_bi` (chia ĐM khi nhiều túi)
 * - Ống = Σ `trong_luong_loi` (chia ĐM khi nhiều lõi)
 * - Băng keo / tem / NVL khác = Thành phần × SL (resolveNvlTrongLuongKg)
 */
import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import {
  isNvlOngItem,
  isNvlTuiItem,
  resolveNvlTrongLuongKg,
  resolveReportProductCode
} from '../components/AcceptanceReportListView';
import { findProductByCode } from '../features/san-pham';
import {
  normalizeProductCodeKey,
  type ProductNplItem,
  type ProductRow
} from '../features/san-pham/types';
import { isWarehouseTapeExportItem } from './controlBoardShiftSummary';
import {
  normalizeWarehouseCodeKey,
  type WarehouseWeightCatalogItem
} from './warehouseWeight';

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function positiveKg(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return round4(n);
}

function materialKey(code: string, name = '') {
  return (
    normalizeWarehouseCodeKey(code) ||
    normalizeProductCodeKey(name) ||
    String(code || name || '')
      .trim()
      .toUpperCase()
  );
}

function resolveBomShareWeight(item: ProductNplItem): number {
  const qty = Number(item.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const weight = Number(item.weightKg);
  if (Number.isFinite(weight) && weight > 0) return weight;
  return 1;
}

function shareCanKgAcrossIndices(
  indices: number[],
  totalKg: number | null,
  items: ProductNplItem[]
): Map<number, number> {
  const map = new Map<number, number>();
  if (!(indices.length > 0) || totalKg == null || !(totalKg > 0)) return map;
  const weights = indices.map(index => {
    const item = items[index];
    return item ? resolveBomShareWeight(item) : 1;
  });
  const sumWeight = weights.reduce((sum, w) => sum + w, 0);
  if (!(sumWeight > 0)) return map;
  let allocated = 0;
  indices.forEach((index, i) => {
    const share =
      i === indices.length - 1
        ? round4(totalKg - allocated)
        : round4((totalKg * weights[i]) / sumWeight);
    allocated = round4(allocated + share);
    map.set(index, share);
  });
  return map;
}

function isBangKeoItem(item: ProductNplItem) {
  if (isWarehouseTapeExportItem(item.code || '', item.name || '')) return true;
  const hay = `${item.code || ''} ${item.name || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return hay.includes('bang keo') || hay.includes('bang dinh');
}

function isTemItem(item: ProductNplItem) {
  const codeKey = String(item.code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '');
  if (codeKey === 'TEM' || codeKey.startsWith('TEM')) return true;
  const hay = `${item.code || ''} ${item.name || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    hay.includes('tem ') ||
    hay.startsWith('tem') ||
    hay.includes(' tem') ||
    hay.includes('nhan tem')
  );
}

function toNplProbe(item: ProductNplItem): ProductNplItem {
  return item;
}

/**
 * Map mã NVL → kg không trộn trên 1 phiếu (cùng rule danh sách SL).
 * Không gồm NVL %.
 */
export function computeAcceptanceReportKhongTronByMaterial(input: {
  report: AcceptanceReport;
  nplItems: ProductNplItem[];
  materials: WarehouseWeightCatalogItem[];
  nhuaThucTeKg?: number | null;
}): Map<string, number> {
  const map = new Map<string, number>();
  const items = (input.nplItems || []).filter(item => item.amountType !== 'percent');
  if (items.length === 0) return map;

  const qtyRaw = Number(input.report.so_luong);
  const productQty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
  const biKg = positiveKg(input.report.trong_luong_bi);
  const loiKg = positiveKg(input.report.trong_luong_loi);

  const tuiIndices: number[] = [];
  const ongIndices: number[] = [];
  items.forEach((item, index) => {
    if (isNvlTuiItem(toNplProbe(item))) tuiIndices.push(index);
    else if (isNvlOngItem(toNplProbe(item))) ongIndices.push(index);
  });
  const tuiShare = shareCanKgAcrossIndices(tuiIndices, biKg, items);
  const ongShare = shareCanKgAcrossIndices(ongIndices, loiKg, items);

  items.forEach((item, index) => {
    const key = materialKey(item.code, item.name);
    if (!key) return;
    let kg: number | null = null;
    if (isNvlTuiItem(toNplProbe(item))) {
      kg = tuiShare.get(index) ?? null;
    } else if (isNvlOngItem(toNplProbe(item))) {
      kg = ongShare.get(index) ?? null;
    } else {
      kg = resolveNvlTrongLuongKg(
        item,
        productQty,
        null,
        input.materials,
        input.nhuaThucTeKg
      );
    }
    if (kg == null || !(kg > 0)) return;
    map.set(key, round4((map.get(key) || 0) + kg));
  });
  return map;
}

/** Cộng dồn kg không trộn theo mã NVL từ nhiều phiếu sản lượng. */
export function aggregateKhongTronKgByMaterialFromAcceptanceReports(input: {
  reports: AcceptanceReport[];
  products: ProductRow[];
  materials: WarehouseWeightCatalogItem[];
  matchReport?: (report: AcceptanceReport) => boolean;
}): Map<string, number> {
  const map = new Map<string, number>();
  for (const report of input.reports || []) {
    if (input.matchReport && !input.matchReport(report)) continue;
    const productCode = resolveReportProductCode(report.mat_hang || '');
    const product =
      findProductByCode(input.products, productCode) ||
      findProductByCode(input.products, report.mat_hang || '') ||
      findProductByCode(input.products, report.ten_sp || '');
    const items = product?.nplItems || [];
    if (items.length === 0) continue;
    const nhuaRaw = Number(report.trong_luong_nhua);
    const nhuaThucTeKg = Number.isFinite(nhuaRaw) && nhuaRaw > 0 ? nhuaRaw : null;
    const perReport = computeAcceptanceReportKhongTronByMaterial({
      report,
      nplItems: items,
      materials: input.materials,
      nhuaThucTeKg
    });
    for (const [key, kg] of perReport.entries()) {
      map.set(key, round4((map.get(key) || 0) + kg));
    }
  }
  return map;
}

export function isAcceptanceKhongTronBangKeoOrTem(item: ProductNplItem) {
  return isBangKeoItem(item) || isTemItem(item);
}
