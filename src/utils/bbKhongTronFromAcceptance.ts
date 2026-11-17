/**
 * Mục 3.2 — Nhập TP túi / ống lấy thẳng từ phiếu Báo cáo sản lượng:
 * - Túi (VT-TUI…) = Σ `trong_luong_bi`
 * - Ống (ONG-…) = Σ `trong_luong_loi`
 * Gán theo Thành phần SP của từng phiếu (không chia đều mọi mã ống trên máy).
 */
import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import { isNvlOngItem, isNvlTuiItem, resolveReportProductCode } from '../components/AcceptanceReportListView';
import { findProductByCode } from '../features/san-pham';
import { normalizeProductCodeKey, type ProductNplItem, type ProductRow } from '../features/san-pham/types';
import { matchesNgayCaMay } from './bbMaterialConversion';
import type { BbThucDungLineRow } from './controlBoardBbMachineReport';
import { normalizeWarehouseCodeKey } from './warehouseWeight';

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
  return matchesNgayCaMay(
    {
      ngay: report.ngay,
      ca: report.ca,
      ma_may: report.ma_may || report.ten_may || '',
      vat_tu_goc: '',
      vat_tu_quy_doi: ''
    },
    ngay,
    shift,
    machine
  );
}

/** Cộng kg cân vào từng mã NVL theo BOM phiếu sản lượng. */
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
    const each = kg / items.length;
    for (const item of items) {
      const key = materialKey(item.code, item.name);
      if (!key) continue;
      map.set(key, round4((map.get(key) || 0) + each));
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
