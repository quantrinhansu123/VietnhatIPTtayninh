/**
 * Mục 3.2 — Nhập TP túi / ống lấy thẳng từ phiếu Báo cáo sản lượng (cân theo Mã SP):
 * - Túi (VT-TUI…) = Σ `trong_luong_bi` (bì từng cuộn)
 * - Ống (ONG-…) = Σ `trong_luong_loi` (cân lõi từng cuộn)
 * Một cuộn / phiếu có nhiều lõi (hoặc nhiều túi) → chia kg theo **định mức** Thành phần SP
 * (ưu tiên `quantity`, rồi `weightKg`; thiếu thì chia đều).
 */
import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import { isNvlOngItem, isNvlTuiItem, resolveReportProductCode } from '../components/AcceptanceReportListView';
import { findProductByCode } from '../features/san-pham';
import { normalizeProductCodeKey, type ProductNplItem, type ProductRow } from '../features/san-pham/types';
import { aggregateKhongTronKgByMaterialFromAcceptanceReports } from './acceptanceKhongTronWeights';
import { matchesNgayCaMay } from './bbMaterialConversion';
import type { BbThucDungLineRow } from './controlBoardBbMachineReport';
import { mapMaterialToWeightCatalogItem, normalizeWarehouseCodeKey } from './warehouseWeight';
import type { MaterialRow } from '../features/kho-nvl';

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
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

function positiveKg(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function reportMatchesHeader(report: AcceptanceReport, ngay: string, shift: string, machine: string) {
  const candidates = [report.ma_may, report.ten_may]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const targetMachine = String(machine || '').trim();
  if (targetMachine && targetMachine !== 'all' && candidates.length === 0) {
    return false;
  }
  const machineCodes = candidates.length > 0 ? candidates : [''];
  return machineCodes.some(maMay =>
    matchesNgayCaMay(
      {
        ngay: report.ngay,
        ca: report.ca,
        ma_may: maMay,
        vat_tu_goc: '',
        vat_tu_quy_doi: ''
      },
      ngay,
      shift,
      targetMachine
    )
  );
}

/** Hệ số định mức để chia kg cân khi 1 cuộn có nhiều lõi/túi trong Thành phần. */
export function resolveBomShareWeight(item: ProductNplItem): number {
  const qty = Number(item.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const weight = Number(item.weightKg);
  if (Number.isFinite(weight) && weight > 0) return weight;
  return 1;
}

/**
 * Chia `totalKg` theo định mức các dòng BOM (tỷ lệ quantity/weightKg).
 * Dòng cuối nhận phần dư để tổng khớp kg cân.
 */
export function shareKgByBomDinhMuc(
  items: ProductNplItem[],
  totalKg: number
): Map<string, number> {
  const map = new Map<string, number>();
  if (!(totalKg > 0) || items.length === 0) return map;
  const weights = items.map(item => ({
    key: materialKey(item.code, item.name),
    weight: resolveBomShareWeight(item)
  }));
  const usable = weights.filter(row => row.key);
  if (usable.length === 0) return map;
  const sumWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  if (!(sumWeight > 0)) return map;

  let allocated = 0;
  usable.forEach((row, index) => {
    const share =
      index === usable.length - 1
        ? round4(totalKg - allocated)
        : round4((totalKg * row.weight) / sumWeight);
    allocated = round4(allocated + share);
    map.set(row.key, round4((map.get(row.key) || 0) + share));
  });
  return map;
}

/** Cộng kg cân vào từng mã NVL theo BOM phiếu sản lượng (chia theo ĐM khi nhiều lõi/túi). */
function accumulateKgByMaterialCode(input: {
  reports: AcceptanceReport[];
  products: ProductRow[];
  ngay: string;
  shift: string;
  machine: string;
  pickKg: (report: AcceptanceReport) => number;
  matchItem: (item: ProductNplItem) => boolean;
}): Map<string, number> {
  const map = new Map<string, number>();
  for (const report of input.reports || []) {
    if (!reportMatchesHeader(report, input.ngay, input.shift, input.machine)) continue;
    const kg = input.pickKg(report);
    if (!(kg > 0)) continue;
    const productCode = resolveReportProductCode(report.mat_hang || '');
    const product =
      findProductByCode(input.products, productCode) ||
      findProductByCode(input.products, report.mat_hang || '') ||
      findProductByCode(input.products, report.ten_sp || '');
    const items = (product?.nplItems || []).filter(
      item => item.amountType !== 'percent' && input.matchItem(item)
    );
    if (items.length === 0) continue;
    const shares = shareKgByBomDinhMuc(items, kg);
    for (const [key, shareKg] of shares.entries()) {
      if (!(shareKg > 0)) continue;
      map.set(key, round4((map.get(key) || 0) + shareKg));
    }
  }
  return map;
}

function applyFinishedKgByMaterial(
  rows: BbThucDungLineRow[],
  byMaterial: Map<string, number>,
  isTarget: (row: BbThucDungLineRow) => boolean
) {
  if (byMaterial.size === 0) return rows;
  return rows.map(row => {
    if (!isTarget(row)) return row;
    const key = materialKey(row.materialCode, row.materialName);
    const kg = key ? byMaterial.get(key) : undefined;
    if (kg == null || !(kg > 0)) return row;
    const damagedKg = Number.isFinite(row.loiHongKg) ? row.loiHongKg : 0;
    const weightKg = Number.isFinite(row.weightKg) ? row.weightKg : 0;
    return {
      ...row,
      klThucTeKg: kg,
      klThucTePlusLoiKg: round4(kg + damagedKg),
      chenhLechKg: round4(weightKg - kg - damagedKg)
    };
  });
}

/** Túi: Nhập TP = Σ trọng lượng bì phiếu sản lượng (theo BOM từng phiếu). */
export function syncBbThucDungRowsTuiFromAcceptanceReports(input: {
  rows: BbThucDungLineRow[];
  acceptanceReports: AcceptanceReport[];
  products?: ProductRow[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0 || !input.acceptanceReports?.length) return input.rows;
  const products = input.products || [];
  const isBagRow = (row: BbThucDungLineRow) =>
    !row.inMixingRatioTable &&
    !row.isPlasticNvl &&
    isNvlTuiItem({ code: row.materialCode, name: row.materialName } as ProductNplItem);

  const headers = new Set<string>();
  for (const row of input.rows) {
    if (!isBagRow(row)) continue;
    headers.add(`${row.ngay}|${row.shift}|${row.machine}`);
  }
  if (headers.size === 0) return input.rows;

  let next = input.rows;
  for (const header of headers) {
    const [ngay, shift, machine] = header.split('|');
    const byMaterial = accumulateKgByMaterialCode({
      reports: input.acceptanceReports,
      products,
      ngay,
      shift,
      machine,
      pickKg: report => positiveKg(report.trong_luong_bi),
      matchItem: isNvlTuiItem
    });
    // Không có BOM túi: fallback chia đều Σ bì cho mọi dòng túi cùng ngày·ca·máy.
    if (byMaterial.size === 0) {
      let total = 0;
      for (const report of input.acceptanceReports) {
        if (!reportMatchesHeader(report, ngay, shift, machine)) continue;
        total += positiveKg(report.trong_luong_bi);
      }
      total = round4(total);
      if (!(total > 0)) continue;
      const bagRows = next.filter(
        row => isBagRow(row) && row.ngay === ngay && row.shift === shift && row.machine === machine
      );
      if (bagRows.length === 0) continue;
      const each = round4(total / bagRows.length);
      const assigned = new Map<BbThucDungLineRow, number>();
      bagRows.forEach((row, index) => {
        assigned.set(
          row,
          index === bagRows.length - 1 ? round4(total - each * (bagRows.length - 1)) : each
        );
      });
      next = next.map(row => {
        const kg = assigned.get(row);
        if (kg == null) return row;
        const damagedKg = Number.isFinite(row.loiHongKg) ? row.loiHongKg : 0;
        const weightKg = Number.isFinite(row.weightKg) ? row.weightKg : 0;
        return {
          ...row,
          klThucTeKg: kg,
          klThucTePlusLoiKg: round4(kg + damagedKg),
          chenhLechKg: round4(weightKg - kg - damagedKg)
        };
      });
      continue;
    }
    next = applyFinishedKgByMaterial(next, byMaterial, row =>
      Boolean(isBagRow(row) && row.ngay === ngay && row.shift === shift && row.machine === machine)
    );
  }
  return next;
}

/** Ống: Nhập TP = Σ cân lõi phiếu sản lượng (theo BOM từng phiếu). */
export function syncBbThucDungRowsOngFromAcceptanceReports(input: {
  rows: BbThucDungLineRow[];
  acceptanceReports: AcceptanceReport[];
  products?: ProductRow[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0 || !input.acceptanceReports?.length) return input.rows;
  const products = input.products || [];
  const isOngRow = (row: BbThucDungLineRow) =>
    !row.inMixingRatioTable &&
    !row.isPlasticNvl &&
    isNvlOngItem({ code: row.materialCode, name: row.materialName } as ProductNplItem);

  const headers = new Set<string>();
  for (const row of input.rows) {
    if (!isOngRow(row)) continue;
    headers.add(`${row.ngay}|${row.shift}|${row.machine}`);
  }
  if (headers.size === 0) return input.rows;

  let next = input.rows;
  for (const header of headers) {
    const [ngay, shift, machine] = header.split('|');
    const byMaterial = accumulateKgByMaterialCode({
      reports: input.acceptanceReports,
      products,
      ngay,
      shift,
      machine,
      pickKg: report => positiveKg(report.trong_luong_loi),
      matchItem: isNvlOngItem
    });
    if (byMaterial.size === 0) continue;
    next = applyFinishedKgByMaterial(next, byMaterial, row =>
      Boolean(isOngRow(row) && row.ngay === ngay && row.shift === shift && row.machine === machine)
    );
  }
  return next;
}

/**
 * 3.2 Nhập TP NVL khác = y hệt TL VT không trộn trên Báo cáo sản lượng
 * (túi/lõi cân + băng·tem ĐM×SL theo từng phiếu).
 */
export function syncBbThucDungRowsKhongTronFromAcceptanceReports(input: {
  rows: BbThucDungLineRow[];
  acceptanceReports: AcceptanceReport[];
  products?: ProductRow[];
  materials?: MaterialRow[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0 || !input.acceptanceReports?.length) return input.rows;
  const products = input.products || [];
  const materialsCatalog = (input.materials || []).map(mapMaterialToWeightCatalogItem);

  const isOtherRow = (row: BbThucDungLineRow) =>
    !row.inMixingRatioTable && !row.isPlasticNvl;

  const headers = new Set<string>();
  for (const row of input.rows) {
    if (!isOtherRow(row)) continue;
    headers.add(`${row.ngay}|${row.shift}|${row.machine}`);
  }
  if (headers.size === 0) return input.rows;

  let next = input.rows;
  for (const header of headers) {
    const [ngay, shift, machine] = header.split('|');
    const byMaterial = aggregateKhongTronKgByMaterialFromAcceptanceReports({
      reports: input.acceptanceReports,
      products,
      materials: materialsCatalog,
      matchReport: report => reportMatchesHeader(report, ngay, shift, machine)
    });
    if (byMaterial.size === 0) continue;
    next = applyFinishedKgByMaterial(next, byMaterial, row =>
      Boolean(isOtherRow(row) && row.ngay === ngay && row.shift === shift && row.machine === machine)
    );
  }
  return next;
}
