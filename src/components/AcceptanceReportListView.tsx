import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Loader2, Pencil, Plus, Printer, RefreshCw, X } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { vietNhatLogoUrl } from './layout/constants';
import { waitForPrintImagesReady } from '../utils/printReady';
import { loadAcceptanceMixedWeight } from '../utils/acceptanceMixedWeight';
import {
  AcceptanceReportPrintBatch,
  buildAcceptancePrintSlips,
  buildAcceptanceFilmKgByProductCode,
  buildAcceptanceProductNormByCode,
  isAcceptanceThanhPhamLoai
} from './AcceptanceReportPrintSheet';
import AcceptanceReportFlatTable, {
  type NvlWeightGroupTotals
} from './AcceptanceReportFlatTable';
import { normalizeShiftSettings, type ShiftSetting } from '../utils/shiftSettings';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { normalizeReportFromApi } from './AcceptanceReportForm';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TABLE_HEAD_CLASS
} from './shared/table';
import {
  formatNplDecimal,
  formatNplWeightKg,
  formatProductNplAmount,
  normalizeNvlMatchKey,
  normalizeProductCodeKey,
  parseProductNplItems,
  type ProductNplItem
} from '../features/san-pham/types';
import { normalizeMaterialsInventory } from '../features/kho-nvl';
import { attachShiftLeads } from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import {
  convertWarehouseQuantityToKg,
  findMaterialTongKgPerUnit,
  isWarehouseKgUnit,
  isWarehouseRollUnit,
  mapMaterialToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from '../utils/warehouseWeight';
import {
  isWarehouseBagExportItem,
  isWarehouseTapeExportItem,
  machineValueMatchesFilter
} from '../utils/controlBoardShiftSummary';
import {
  filterCanTuDongRecordsForBoard,
  sumCanTuDongCanSanPhamKg,
  type CanTuDongWeightRow
} from '../utils/canTuDongWeights';
import { calculateAcceptanceWeightSnapshot } from '../utils/acceptanceWeightSnapshot';
import { normalizeMixingReport } from '../lib/mixingReportModel';
import { buildMachineNvlMixingRatioRows } from '../utils/machineNvlMixingRatio';

type ProductNameOption = {
  code: string;
  name: string;
};

type ProductCatalogEntry = {
  code: string;
  name: string;
  unit: string;
  amisCode: string;
  newCode: string;
  totalWeightKg: number | null;
  plasticWeightKg: number | null;
  coreWeightKg: number | null;
  bagWeightKg: number | null;
  nplItems: ProductNplItem[];
};

type NvlViewState = {
  report: AcceptanceReport;
  productCode: string;
  productName: string;
  productUnit: string;
  quantity: number;
  items: ProductNplItem[];
  /** true = đang hiển thị snapshot đã lưu DB. */
  fromDb: boolean;
  savedAt?: string;
  /** Tổng Cân sản phẩm từ phiếu cân AI khớp ngày·ca·máy·mã SP. */
  actualWeightKg: number | null;
  /** Nhựa thực tế (Cân SP − lõi − bì − màng) — ô đầu modal + cơ sở NVL %. */
  actualNhuaKg: number | null;
  /** Σ Cân lõi từ cân AI — TL dòng ống. */
  actualLoiKg: number | null;
  /** Σ Trọng lượng bì từ cân AI — TL dòng túi. */
  actualBiKg: number | null;
  actualWeightCount: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProductKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Mã SP từ mặt hàng phiếu (bỏ phần sau dấu + nếu có). */
export function resolveReportProductCode(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  return (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
}

/** Mã SP không được hiện trên tab Sản lượng (chỉ dùng ở SP lỗi / SP rác). */
const SAN_LUONG_EXCLUDED_CODES = new Set(['RAC', 'RAC MANG', 'MT-HANG RAC', 'NHUAKM']);

function isSanLuongExcludedCode(matHang: string) {
  const code = resolveReportProductCode(matHang).replace(/\s+/g, ' ').trim().toUpperCase();
  return SAN_LUONG_EXCLUDED_CODES.has(code);
}

function isKgUnit(value: string) {
  return ['kg', 'kilogram', 'kilograms'].includes(String(value || '').trim().toLowerCase());
}

function parseWeightKgFromLabel(label: string): number | null {
  const text = String(label || '').trim();
  const withParens = text.match(/\((\d+(?:[.,]\d+)?)\s*kg\)/i);
  const anyKg = withParens || text.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!anyKg) return null;
  const value = Number(String(anyKg[1]).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mergeNplItemsWithCatalog(
  items: ProductNplItem[],
  catalogItems: ProductNplItem[]
): ProductNplItem[] {
  if (catalogItems.length === 0) return items;
  return items.map(item => {
    const key = normalizeProductCodeKey(item.code);
    if (!key) return item;
    const match = catalogItems.find(row => normalizeProductCodeKey(row.code) === key);
    if (!match) return item;
    return {
      ...item,
      name: item.name || match.name,
      unit: item.unit && item.unit !== '-' ? item.unit : match.unit,
      weightKg:
        item.weightKg != null && Number.isFinite(item.weightKg)
          ? item.weightKg
          : match.weightKg ?? null
    };
  });
}

/**
 * Trọng lượng tổng (Cân SP) — chỉ nguồn chính:
 * 1) Tổng Cân sản phẩm từ cân AI
 * 2) `trong_luong` đã lưu trên phiếu (sau Đồng bộ)
 * Không ước từ định mức danh mục.
 */
function resolveSlipKhoiLuongKg(
  report: Pick<AcceptanceReport, 'trong_luong'>,
  actualCanSpKg?: number | null
): number | null {
  if (actualCanSpKg != null && Number.isFinite(actualCanSpKg) && actualCanSpKg > 0) {
    return Math.round(actualCanSpKg * 1000) / 1000;
  }
  const fromReport = Number(report.trong_luong);
  if (Number.isFinite(fromReport) && fromReport > 0) return Math.round(fromReport * 1000) / 1000;
  return null;
}

/**
 * Nhựa thực tế — chỉ nguồn chính:
 * 1) Snapshot cân AI (Cân SP − lõi − bì − màng)
 * 2) `trong_luong_nhua` đã lưu trên phiếu
 * Không ước từ ĐM / danh mục.
 */
function resolveNhuaThucTeKg(
  report: Pick<AcceptanceReport, 'trong_luong_nhua'>,
  actualNhuaKg?: number | null
): number | null {
  if (actualNhuaKg != null && Number.isFinite(actualNhuaKg) && actualNhuaKg > 0) {
    return Math.round(actualNhuaKg * 1000) / 1000;
  }
  const stored = Number(report.trong_luong_nhua);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.round(stored * 1000) / 1000;
  }
  return null;
}

function positiveCanKg(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return Math.round(n * 10000) / 10000;
}

/** Hệ số ĐM khi 1 cuộn có nhiều lõi/túi trong Thành phần. */
function resolveNvlBomShareWeight(item: ProductNplItem): number {
  const qty = Number(item.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  const weight = Number(item.weightKg);
  if (Number.isFinite(weight) && weight > 0) return weight;
  return 1;
}

/**
 * Chia kg cân (bì / lõi) cho các dòng cùng nhóm theo định mức Thành phần.
 * 1 cuộn nhiều lõi → tỷ lệ quantity (hoặc weightKg); thiếu ĐM thì chia đều.
 */
function shareCanKgAcrossIndices(
  indices: number[],
  totalKg: number | null,
  items: ProductNplItem[] = []
): Map<number, number> {
  const map = new Map<number, number>();
  if (!(indices.length > 0) || totalKg == null || !(totalKg > 0)) return map;
  const weights = indices.map(index => {
    const item = items[index];
    return item ? resolveNvlBomShareWeight(item) : 1;
  });
  const sumWeight = weights.reduce((sum, w) => sum + w, 0);
  if (!(sumWeight > 0)) return map;
  let allocated = 0;
  indices.forEach((index, i) => {
    const share =
      i === indices.length - 1
        ? Math.round((totalKg - allocated) * 10000) / 10000
        : Math.round(((totalKg * weights[i]) / sumWeight) * 10000) / 10000;
    allocated = Math.round((allocated + share) * 10000) / 10000;
    map.set(index, share);
  });
  return map;
}

/**
 * Trọng lượng NVL:
 * - % (vật tư trộn): chỉ **nhựa thực tế** × % (không fallback Cân SP)
 * - Túi / ống: lấy thẳng Σ bì / Σ lõi từ cân (xem `nvlLineWeightsKg`)
 * - Cái/ĐVT khác (băng keo, tem…): định lượng Thành phần × SL sản lượng, quy kg
 */
export function resolveNvlTrongLuongKg(
  item: ProductNplItem,
  productQty: number,
  _slipKhoiLuongKg: number | null,
  materials: WarehouseWeightCatalogItem[],
  nhuaThucTeKg?: number | null
): number | null {
  if (item.amountType === 'percent') {
    if (
      item.percent == null ||
      !Number.isFinite(item.percent) ||
      nhuaThucTeKg == null ||
      !Number.isFinite(nhuaThucTeKg) ||
      !(nhuaThucTeKg > 0)
    ) {
      return null;
    }
    return Math.round(nhuaThucTeKg * (item.percent / 100) * 10000) / 10000;
  }

  if (!(productQty > 0)) return null;
  const unit = String(item.unit || '').trim();
  const piecesPerSp =
    item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0
      ? item.quantity
      : null;
  const bomKg =
    item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg >= 0
      ? item.weightKg
      : null;

  // ĐVT kg: so_luong đã là kg trên 1 SP (hoặc tổng kg).
  if (isKgUnit(unit) || isWarehouseKgUnit(unit)) {
    if (piecesPerSp == null) return null;
    return Math.round(piecesPerSp * productQty * 10000) / 10000;
  }

  const catalogKg = findMaterialTongKgPerUnit(item.code, materials);

  // Cuộn (băng keo): nếu khoi_luong_kg << Tổng kg/cuộn → kg trên 1 SP thành phẩm.
  if (isWarehouseRollUnit(unit)) {
    const kgIsPerFinishedProduct =
      bomKg != null && catalogKg != null && catalogKg > 0 && bomKg < catalogKg * 0.5;
    if (kgIsPerFinishedProduct) {
      return Math.round(productQty * bomKg * 10000) / 10000;
    }
    const pieces = piecesPerSp ?? 1;
    const totalQty = productQty * pieces;
    const kgEach = catalogKg ?? bomKg;
    if (kgEach == null || !(kgEach > 0)) return null;
    return Math.round(totalQty * kgEach * 10000) / 10000;
  }

  // Cái / ống / túi: TL = SL NVL × kg/cái (khoi_luong_kg hoặc Tổng kg kho NVL).
  const pieces = piecesPerSp ?? 1;
  const totalQty = productQty * pieces;
  const kgEach = bomKg ?? catalogKg;
  if (kgEach != null && kgEach >= 0) {
    return Math.round(totalQty * kgEach * 10000) / 10000;
  }

  const converted = convertWarehouseQuantityToKg({
    quantity: totalQty,
    unit: unit || 'Cái',
    itemCode: item.code,
    warehouseKind: 'nvl',
    materials,
    preferTongKgOnly: true
  });
  if (converted != null && Number.isFinite(converted) && converted > 0) {
    return Math.round(converted * 10000) / 10000;
  }

  const fromName = parseWeightKgFromLabel(item.name || item.code || '');
  if (fromName != null) return Math.round(totalQty * fromName * 10000) / 10000;
  return null;
}

function formatNvlTrongLuongKg(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  return `${formatNplWeightKg(value)} kg`;
}

/** % / nhựa → vật tư trộn; Cái·Cuộn·… → vật tư không trộn. */
function isNvlVatTuTron(item: ProductNplItem) {
  return item.amountType === 'percent';
}

export function isNvlTuiItem(item: ProductNplItem) {
  const code = String(item.code || '').trim();
  if (/^VT-?TUI/i.test(code) || /^TUI/i.test(code)) return true;
  return isWarehouseBagExportItem(code, item.name || '');
}

export function isNvlOngItem(item: ProductNplItem) {
  const codeKey = String(item.code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '');
  if (codeKey.startsWith('ONG') || codeKey.startsWith('ONGGIAY')) return true;
  const hay = `${item.code || ''} ${item.name || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return hay.includes('ong giay') || (/\bong\b/.test(hay) && hay.includes('giay'));
}

function normalizeNvlItemHay(item: ProductNplItem) {
  return `${item.code || ''} ${item.name || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Băng keo / băng dính (BDT…). */
function isNvlBangKeoItem(item: ProductNplItem) {
  if (isWarehouseTapeExportItem(item.code || '', item.name || '')) return true;
  const hay = normalizeNvlItemHay(item);
  return hay.includes('bang keo') || hay.includes('bang dinh');
}

/** Tem nhãn (TEM…). */
function isNvlTemItem(item: ProductNplItem) {
  const codeKey = String(item.code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '');
  if (codeKey === 'TEM' || codeKey.startsWith('TEM')) return true;
  const hay = normalizeNvlItemHay(item);
  return (
    hay.includes('tem ') ||
    hay.startsWith('tem') ||
    hay.includes(' tem') ||
    hay.includes('nhan tem')
  );
}

function sumNvlWeightsKg(weights: Array<number | null | undefined>) {
  return weights.reduce((sum, value) => sum + (value != null && value > 0 ? value : 0), 0);
}

function buildActualMixPercentMap(
  rows: Array<{ maNvl: string; tenNvl: string; tiLeThucTePercent: number | null }>
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const pct = row.tiLeThucTePercent;
    if (pct == null || !Number.isFinite(pct) || !(pct > 0)) continue;
    for (const raw of [row.maNvl, row.tenNvl]) {
      const key = normalizeNvlMatchKey(raw);
      if (key && !map.has(key)) map.set(key, pct);
      const codeKey = normalizeProductCodeKey(raw);
      if (codeKey && !map.has(codeKey)) map.set(codeKey, pct);
    }
  }
  return map;
}

function resolveActualMixPercent(
  item: ProductNplItem,
  actualPercentByKey: Map<string, number> | null | undefined
): number | null {
  if (!actualPercentByKey || actualPercentByKey.size === 0) return null;
  for (const raw of [item.code, item.name]) {
    const key = normalizeNvlMatchKey(String(raw || ''));
    if (key && actualPercentByKey.has(key)) return actualPercentByKey.get(key) ?? null;
    const codeKey = normalizeProductCodeKey(String(raw || ''));
    if (codeKey && actualPercentByKey.has(codeKey)) return actualPercentByKey.get(codeKey) ?? null;
  }
  return null;
}

function formatMixPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatNplDecimal(value)}%`;
}

function computeNvlWeightGroupTotals(
  items: ProductNplItem[],
  productQty: number,
  slipKhoiLuongKg: number | null,
  materials: WarehouseWeightCatalogItem[],
  nhuaThucTeKg?: number | null,
  canWeights?: { biKg?: number | null; loiKg?: number | null }
): NvlWeightGroupTotals {
  if (items.length === 0) {
    const emptyWarnings: string[] = [];
    const biEmpty = positiveCanKg(canWeights?.biKg);
    const loiEmpty = positiveCanKg(canWeights?.loiKg);
    if (biEmpty != null && biEmpty > 0) {
      emptyWarnings.push(
        `Cân có bì ${biEmpty} kg nhưng Thành phần SP chưa có mã túi — hãy thêm túi vào Thành phần.`
      );
    }
    if (loiEmpty != null && loiEmpty > 0) {
      emptyWarnings.push(
        `Cân có lõi ${loiEmpty} kg nhưng Thành phần SP chưa có mã ống — hãy thêm ống vào Thành phần.`
      );
    }
    return {
      tronKg: null,
      khongTronKg: null,
      tuiKg: null,
      ongKg: null,
      bangKeoKg: null,
      temKg: null,
      missingBomWarnings: emptyWarnings.length > 0 ? emptyWarnings : undefined
    };
  }
  const tuiIndices: number[] = [];
  const ongIndices: number[] = [];
  items.forEach((item, index) => {
    if (isNvlVatTuTron(item)) return;
    if (isNvlTuiItem(item)) tuiIndices.push(index);
    else if (isNvlOngItem(item)) ongIndices.push(index);
  });
  const biFromCan = positiveCanKg(canWeights?.biKg);
  const loiFromCan = positiveCanKg(canWeights?.loiKg);
  const tuiShare = shareCanKgAcrossIndices(tuiIndices, biFromCan, items);
  const ongShare = shareCanKgAcrossIndices(ongIndices, loiFromCan, items);

  let tronKg = 0;
  let khongTronKg = 0;
  let tuiKg = 0;
  let ongKg = 0;
  let bangKeoKg = 0;
  let temKg = 0;
  let hasTron = false;
  let hasKhongTron = false;
  let hasTui = false;
  let hasOng = false;
  let hasBangKeo = false;
  let hasTem = false;
  items.forEach((item, index) => {
    let kg: number | null = null;
    if (isNvlVatTuTron(item)) {
      kg = resolveNvlTrongLuongKg(item, productQty, slipKhoiLuongKg, materials, nhuaThucTeKg);
      hasTron = true;
      if (kg != null && kg > 0) tronKg += kg;
      return;
    }
    hasKhongTron = true;
    if (isNvlTuiItem(item)) {
      hasTui = true;
      // Túi: chỉ Σ bì cân — không nhân ĐM.
      kg = tuiShare.get(index) ?? null;
      if (kg != null && kg > 0) {
        tuiKg += kg;
        khongTronKg += kg;
      }
      return;
    }
    if (isNvlOngItem(item)) {
      hasOng = true;
      // Ống: chỉ Σ cân lõi — không nhân ĐM.
      kg = ongShare.get(index) ?? null;
      if (kg != null && kg > 0) {
        ongKg += kg;
        khongTronKg += kg;
      }
      return;
    }
    kg = resolveNvlTrongLuongKg(item, productQty, slipKhoiLuongKg, materials, nhuaThucTeKg);
    if (kg != null && kg > 0) khongTronKg += kg;
    if (isNvlBangKeoItem(item)) {
      hasBangKeo = true;
      if (kg != null && kg > 0) bangKeoKg += kg;
    } else if (isNvlTemItem(item)) {
      hasTem = true;
      if (kg != null && kg > 0) temKg += kg;
    }
  });
  // Không fallback cộng kg cân khi thiếu mã túi/ống trên Thành phần —
  // chỉ cảnh báo để người dùng tự thêm vào Kho sản phẩm.
  const missingBomWarnings: string[] = [];
  if (biFromCan != null && biFromCan > 0 && tuiIndices.length === 0) {
    missingBomWarnings.push(
      `Cân có bì ${biFromCan} kg nhưng Thành phần SP chưa có mã túi — hãy thêm túi vào Thành phần.`
    );
  }
  if (loiFromCan != null && loiFromCan > 0 && ongIndices.length === 0) {
    missingBomWarnings.push(
      `Cân có lõi ${loiFromCan} kg nhưng Thành phần SP chưa có mã ống — hãy thêm ống vào Thành phần.`
    );
  }
  return {
    tronKg: hasTron ? Math.round(tronKg * 10000) / 10000 : null,
    khongTronKg: hasKhongTron ? Math.round(khongTronKg * 10000) / 10000 : null,
    tuiKg: hasTui ? Math.round(tuiKg * 10000) / 10000 : null,
    ongKg: hasOng ? Math.round(ongKg * 10000) / 10000 : null,
    bangKeoKg: hasBangKeo ? Math.round(bangKeoKg * 10000) / 10000 : null,
    temKg: hasTem ? Math.round(temKg * 10000) / 10000 : null,
    missingBomWarnings: missingBomWarnings.length > 0 ? missingBomWarnings : undefined
  };
}

type NvlDinhMucTabId = 'tong' | 'tron' | 'khong-tron';

function NvlDinhMucGroupTable({
  title,
  emptyLabel,
  rows,
  productQty,
  weightsByIndex,
  showHeader = false,
  accentClass = 'border-zinc-100 bg-zinc-50 text-zinc-800',
  useActualMixPercent = false,
  actualPercentByKey
}: {
  title: string;
  emptyLabel: string;
  rows: Array<{ item: ProductNplItem; index: number }>;
  productQty: number;
  weightsByIndex: Array<number | null>;
  showHeader?: boolean;
  accentClass?: string;
  /** Tab vật tư trộn: cột % lấy từ phiếu phối trộn thực tế. */
  useActualMixPercent?: boolean;
  actualPercentByKey?: Map<string, number> | null;
}) {
  const totalKg = sumNvlWeightsKg(rows.map(row => weightsByIndex[row.index]));
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {showHeader ? (
        <div className={`border-b px-4 py-2.5 text-sm font-black ${accentClass}`}>{title}</div>
      ) : null}
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm font-semibold text-zinc-400">{emptyLabel}</p>
      ) : (
        <table className="min-w-full text-left text-base">
          <thead className={`${TABLE_HEAD_CLASS} text-xs`}>
            <tr>
              <th className="px-4 py-3">Mã NVL</th>
              <th className="px-4 py-3">Tên NVL</th>
              <th className="px-4 py-3 text-right">ĐVT</th>
              <th
                className="px-4 py-3 text-right"
                title={
                  useActualMixPercent
                    ? 'Phần trăm trộn thực tế từ phiếu phối trộn (ngày · ca · máy)'
                    : 'Định mức trên 1 SP'
                }
              >
                {useActualMixPercent ? '% trộn thực tế' : 'ĐM / 1 SP'}
              </th>
              <th
                className="px-4 py-3 text-right"
                title={
                  useActualMixPercent
                    ? 'Định mức Thành phần SP (BOM) để đối chiếu'
                    : 'Số lượng: ĐM × SL sản lượng. %: giữ tỉ lệ định mức'
                }
              >
                {useActualMixPercent ? 'ĐM BOM' : 'Theo SL'}
              </th>
              <th
                className="px-4 py-3 text-right"
                title={
                  useActualMixPercent
                    ? 'Nhựa thực tế × % trộn thực tế'
                    : 'Túi = Σ bì cân · Ống = Σ cân lõi · Băng keo/tem = ĐM × SL × kg/đơn vị'
                }
              >
                Trọng lượng
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(({ item, index }) => {
              const actualPct = useActualMixPercent
                ? resolveActualMixPercent(item, actualPercentByKey)
                : null;
              return (
                <tr key={`${title}|${item.code}|${index}`} className="hover:bg-violet-50/40">
                  <td className="px-4 py-3 font-mono text-sm font-bold text-zinc-800">
                    {item.code || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-zinc-700">{item.name || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-zinc-600">
                    {item.amountType === 'percent' ? '%' : item.unit || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-bold text-violet-800">
                    {useActualMixPercent
                      ? formatMixPercent(actualPct)
                      : formatDinhMucPerUnit(item)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-emerald-700">
                    {useActualMixPercent
                      ? formatDinhMucPerUnit(item)
                      : formatNvlTheoSanLuong(item, productQty)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-black text-amber-800">
                    {formatNvlTrongLuongKg(weightsByIndex[index] ?? null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-zinc-50/80">
              <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-black text-zinc-600">
                Tổng {title.toLowerCase()}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-sm font-black text-amber-900">
                {totalKg > 0 ? formatNvlTrongLuongKg(totalKg) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function resolveProductTotalWeightKg(unit: string, totalWeightRaw: unknown, name: string): number | null {
  const totalWeightText = String(totalWeightRaw ?? '').trim();
  const totalWeightNumber = Number(totalWeightText.replace(',', '.'));
  if (totalWeightText && Number.isFinite(totalWeightNumber) && totalWeightNumber > 0) {
    return totalWeightNumber;
  }
  const fromName = parseWeightKgFromLabel(name);
  if (fromName != null) return fromName;
  if (isKgUnit(unit)) return 1;
  return null;
}

function normalizeProductNames(data: unknown): ProductNameOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  return rows
    .map((item): ProductNameOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(
        record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
      ).trim();
      const name = String(
        record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
      ).trim();
      if (!code || !name) return null;
      return { code, name };
    })
    .filter((item): item is ProductNameOption => Boolean(item));
}

/** Tên mặt hàng SP lỗi / SP rác trong `kho_nvl` (vd. NC, RMN). */
function normalizeMaterialNames(data: unknown): ProductNameOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
      ? (data as { materials: unknown[] }).materials
      : [];

  const byCode = new Map<string, ProductNameOption>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const code = String(record.ma_npl ?? record.ma_sp ?? record.code ?? '').trim();
    const name = String(record.ten_npl ?? record.ten_sp ?? record.name ?? '').trim();
    if (!code || !name) continue;
    const key = normalizeProductKey(code);
    if (!key || byCode.has(key)) continue;
    byCode.set(key, { code, name });
  }
  return [...byCode.values()];
}

function resolveReportProductName(report: AcceptanceReport, nameByCode: Map<string, string>) {
  const candidates = [
    report.ten_sp,
    nameByCode.get(normalizeProductKey(report.mat_hang)),
    nameByCode.get(normalizeProductKey(resolveReportProductCode(report.mat_hang)))
  ];
  for (const name of candidates) {
    const trimmed = String(name || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function normalizeProductCatalog(data: unknown): Map<string, ProductCatalogEntry> {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  const map = new Map<string, ProductCatalogEntry>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const code = String(
      record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
    ).trim();
    if (!code) continue;
    const unit = String(record.don_vi ?? record.unit ?? '').trim();
    const name = String(
      record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
    ).trim();
    const nplItems = parseProductNplItems(
      record.npl_phan_tram ?? record.nplPhanTram ?? record.nplItems ?? record.thanh_phan ?? record.dinh_muc
    );
    const totalWeightKg = resolveProductTotalWeightKg(
      unit,
      record.tong_trong_luong ?? record.totalWeight,
      name
    );
    const coreWeightKg = (() => {
      const n = Number(String(record.trong_luong_loi ?? record.coreWeight ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    const bagWeightKg = (() => {
      const n = Number(String(record.trong_luong_tui ?? record.bagWeight ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    let plasticWeightKg = (() => {
      const n = Number(String(record.trong_luong_nhua ?? record.plasticWeight ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    if (plasticWeightKg == null && totalWeightKg != null) {
      const derived = totalWeightKg - (coreWeightKg ?? 0) - (bagWeightKg ?? 0);
      if (derived > 0) plasticWeightKg = Math.round(derived * 100) / 100;
    }
    const entry: ProductCatalogEntry = {
      code,
      name: name || code,
      unit,
      amisCode: String(record.ma_amis ?? record.amisCode ?? '').trim(),
      newCode: String(record.ma_sp_moi ?? record.newCode ?? '').trim(),
      totalWeightKg,
      plasticWeightKg,
      coreWeightKg,
      bagWeightKg,
      nplItems
    };
    const key = normalizeProductKey(code);
    if (key) map.set(key, entry);
    const nameKey = normalizeProductKey(name);
    if (nameKey && !map.has(nameKey)) map.set(nameKey, entry);
    for (const alt of [entry.amisCode, entry.newCode]) {
      const altKey = normalizeProductKey(alt);
      if (altKey && !map.has(altKey)) map.set(altKey, entry);
    }
  }
  return map;
}

function formatDinhMucPerUnit(item: ProductNplItem) {
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return `${formatNplDecimal(item.percent)}%`;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    const unit = String(item.unit || '').trim();
    const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
    return `${formatNplDecimal(item.quantity)}${unitSuffix}`;
  }
  return formatProductNplAmount(item);
}

function formatNvlTheoSanLuong(item: ProductNplItem, productQty: number) {
  if (!(productQty > 0)) return '—';
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return `${formatNplDecimal(item.percent)}%`;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    const total = item.quantity * productQty;
    const unit = String(item.unit || '').trim();
    const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
    return `${formatNplDecimal(total)}${unitSuffix}`;
  }
  return '—';
}

function formatActualCanWeightKg(weightKg: number | null) {
  if (weightKg == null || !Number.isFinite(weightKg) || !(weightKg > 0)) return '—';
  return `${formatNplDecimal(weightKg)} Kg`;
}

async function fetchCanTuDongByNgay(ngay: string): Promise<CanTuDongWeightRow[]> {
  const day = String(ngay || '').trim();
  if (!day) return [];
  const params = new URLSearchParams({
    all: '1',
    images: '0',
    from: day,
    to: day,
    limit: '5000',
    dateBy: 'ngay'
  });
  const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || 'Không thể tải phiếu cân AI.'));
  }
  return Array.isArray(data.records) ? (data.records as CanTuDongWeightRow[]) : [];
}

/** Tổng Cân sản phẩm (trọng lượng thực tế) khớp ngày · ca · máy · mã SP. */
function filterCanTuDongForReport(
  records: CanTuDongWeightRow[],
  report: AcceptanceReport,
  productCode: string,
  productName: string
) {
  const machineToken = String(report.ma_may || report.ten_may || '').trim();
  const productKeys = [productCode, productName, report.mat_hang, resolveReportProductCode(report.mat_hang)]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const filtered = filterCanTuDongRecordsForBoard(records, {
    shiftFilter: report.ca || 'all',
    dateFrom: report.ngay,
    dateTo: report.ngay,
    machineFilter: machineToken || 'all',
    selectedMachine: {
      code: report.ma_may,
      name: report.ten_may
    },
    productCodeKeys: productKeys
  });
  return filtered;
}

function sumTrongLuongCanThucTeForReport(
  records: CanTuDongWeightRow[],
  report: AcceptanceReport,
  productCode: string,
  productName: string
) {
  return sumCanTuDongCanSanPhamKg(filterCanTuDongForReport(records, report, productCode, productName));
}

function resolveNvlRate(item: ProductNplItem): number | null {
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return item.percent;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    return item.quantity;
  }
  return null;
}

function resolveNvlTheoSl(item: ProductNplItem, productQty: number): number | null {
  const rate = resolveNvlRate(item);
  if (rate == null) return null;
  if (item.amountType === 'percent') return rate;
  if (!(productQty > 0)) return null;
  return Math.round(rate * productQty * 10000) / 10000;
}

function nplItemsToDbPayload(items: ProductNplItem[], productQty: number) {
  return items.map((item, index) => ({
    stt: index,
    ma_nvl: item.code || '',
    ten_nvl: item.name || item.code || '',
    don_vi: item.amountType === 'percent' ? '%' : item.unit || '',
    loai_dinh_muc: item.amountType,
    dinh_muc: resolveNvlRate(item),
    so_luong_theo_sl: resolveNvlTheoSl(item, productQty)
  }));
}

function dbRowsToNplItems(rows: unknown[]): ProductNplItem[] {
  return rows
    .map((raw): ProductNplItem | null => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      const loai = String(row.loai_dinh_muc ?? '').trim().toLowerCase();
      const amountType: ProductNplItem['amountType'] =
        loai === 'percent' || loai === 'phan_tram' || loai === '%' ? 'percent' : 'quantity';
      const dinhMuc = Number(row.dinh_muc);
      const rate = Number.isFinite(dinhMuc) ? dinhMuc : null;
      return {
        code: String(row.ma_nvl ?? '').trim(),
        name: String(row.ten_nvl ?? '').trim(),
        amountType,
        percent: amountType === 'percent' ? rate : null,
        quantity: amountType === 'quantity' ? rate : null,
        unit: String(row.don_vi ?? (amountType === 'percent' ? '%' : '')).trim()
      };
    })
    .filter((item): item is ProductNplItem => Boolean(item && (item.code || item.name)));
}

export default function AcceptanceReportListView({
  onBack,
  onCreate,
  onEdit,
  onEditGroup,
  initialFilters,
  hideLocalFilters = false
}: {
  onBack: () => void;
  onCreate: (prefill?: { ngay: string; ca: string }) => void;
  onEdit: (report: AcceptanceReport) => void;
  onEditGroup?: (reports: AcceptanceReport[]) => void;
  initialFilters?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    machineCode?: string;
  };
  hideLocalFilters?: boolean;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('acceptance-report-list');
  const [filterFromDate, setFilterFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || todayIso()
  );
  const [filterToDate, setFilterToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [filterShift, setFilterShift] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [filterMachine, setFilterMachine] = useState(() => {
    const machine = initialFilters?.machineCode?.trim() || '';
    return !machine || machine === 'all' ? '' : machine;
  });
  const [searchText, setSearchText] = useState(() => initialFilters?.search?.trim() || '');
  const [reports, setReports] = useState<AcceptanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const [activePrintSlips, setActivePrintSlips] = useState<ReturnType<typeof buildAcceptancePrintSlips>>([]);
  const [mixedKgBySlipId, setMixedKgBySlipId] = useState<Map<string, Map<string, number>>>(new Map());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncingWeight, setIsSyncingWeight] = useState(false);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [productCatalogByKey, setProductCatalogByKey] = useState<Map<string, ProductCatalogEntry>>(
    () => new Map()
  );
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [materialWeightCatalog, setMaterialWeightCatalog] = useState<WarehouseWeightCatalogItem[]>([]);
  const [nvlView, setNvlView] = useState<NvlViewState | null>(null);
  const [nvlTab, setNvlTab] = useState<NvlDinhMucTabId>('tong');
  const [isSyncingNvl, setIsSyncingNvl] = useState(false);
  const [nvlSyncMessage, setNvlSyncMessage] = useState('');
  /** % trộn thực tế từ phiếu phối trộn (ngày · ca · máy) — dùng tab Vật tư trộn. */
  const [nvlMixActualPercentByKey, setNvlMixActualPercentByKey] = useState<Map<string, number>>(
    () => new Map()
  );
  const [isProductNamesLoading, setIsProductNamesLoading] = useState(true);

  const shiftOptions = useMemo<string[]>(() => {
    const shifts = reports.reduce<string[]>((result, report) => {
      const shift = report.ca.trim();
      if (shift) result.push(shift);
      return result;
    }, []);
    return Array.from(new Set<string>(shifts)).sort((a, b) =>
      a.localeCompare(b, 'vi', { numeric: true })
    );
  }, [reports]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // Quy định tab Sản lượng: chỉ hiện Thành phẩm / Gia công; không hiện SP lỗi, SP rác,
      // và không hiện RAC / RAC MANG / MT-HANG RAC / NHUAKM.
      if (!isAcceptanceThanhPhamLoai(report.loai_vat_tu)) return false;
      if (isSanLuongExcludedCode(report.mat_hang)) return false;
      const matchesShift = !filterShift || report.ca?.trim() === filterShift;
      const matchesMachine = machineValueMatchesFilter(
        filterMachine || 'all',
        null,
        report.ma_may,
        report.ten_may
      );
      const matchesSearch =
        !normalizedSearch ||
        `${report.mat_hang} ${report.ten_may} ${report.ma_may} ${report.ca} ${report.don_vi}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesShift && matchesMachine && matchesSearch;
    });
  }, [filterMachine, filterShift, normalizedSearch, reports]);

  const hasActiveFilters = Boolean(filterShift) || Boolean(filterMachine) || Boolean(searchText);
  const resetFilters = () => {
    setFilterShift('');
    setFilterMachine('');
    setSearchText('');
  };

  const reportsWithNames = useMemo(
    () =>
      filteredReports.map(report => {
        const productCode = resolveReportProductCode(report.mat_hang);
        const catalogEntry =
          productCatalogByKey.get(normalizeProductKey(productCode)) ||
          productCatalogByKey.get(normalizeProductKey(report.mat_hang)) ||
          null;
        const savedUnit = String(report.don_vi || '').trim();
        const catalogUnit = String(catalogEntry?.unit || '').trim();
        // Phiếu cũ / tự điền thiếu don_vi → lấy ĐVT từ danh mục SP (cùng cách đã làm với ten_sp).
        const donVi =
          savedUnit && savedUnit !== '-'
            ? savedUnit
            : catalogUnit && catalogUnit !== '-'
              ? catalogUnit
              : savedUnit;
        return {
          ...report,
          ten_sp: resolveReportProductName(report, productNameByCode),
          don_vi: donVi
        };
      }),
    [filteredReports, productCatalogByKey, productNameByCode]
  );

  const filmKgByProductCode = useMemo(
    () =>
      buildAcceptanceFilmKgByProductCode(
        [...productCatalogByKey.values()].map(entry => ({
          code: entry.code,
          newCode: entry.newCode,
          amisCode: entry.amisCode,
          nplItems: entry.nplItems
        }))
      ),
    [productCatalogByKey]
  );

  const productNormByCode = useMemo(
    () =>
      buildAcceptanceProductNormByCode(
        [...productCatalogByKey.values()].map(entry => ({
          code: entry.code,
          newCode: entry.newCode,
          amisCode: entry.amisCode,
          name: entry.name,
          totalWeightKg: entry.totalWeightKg,
          plasticWeightKg: entry.plasticWeightKg,
          coreWeight: entry.coreWeightKg,
          bagWeight: entry.bagWeightKg
        }))
      ),
    [productCatalogByKey]
  );

  const printSlipCount = useMemo(
    () => buildAcceptancePrintSlips(reportsWithNames).length,
    [reportsWithNames]
  );

  useEffect(() => {
    if (!pendingPrint || activePrintSlips.length === 0) return;
    let cancelled = false;
    document.body.classList.add('acceptance-report-print-active');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('acceptance-report-print-active');
          setActivePrintSlips([]);
          setPendingPrint(false);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('acceptance-report-print-active');
    };
  }, [pendingPrint, activePrintSlips]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('acceptance-report-print-active');
      setActivePrintSlips([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('acceptance-report-print-active');
    };
  }, []);

  const applyProductCatalogData = (productData: unknown, materialData?: unknown) => {
    const nextNames = new Map<string, string>();
    normalizeProductNames(productData).forEach(product => {
      const key = normalizeProductKey(product.code);
      if (key) nextNames.set(key, product.name);
    });
    normalizeMaterialNames(materialData).forEach(material => {
      const key = normalizeProductKey(material.code);
      if (key && !nextNames.has(key)) nextNames.set(key, material.name);
    });
    const nextCatalog = normalizeProductCatalog(productData);
    setProductNameByCode(nextNames);
    setProductCatalogByKey(nextCatalog);
    return nextCatalog;
  };

  const resolveCatalogEntry = (
    catalog: Map<string, ProductCatalogEntry>,
    matHang: string,
    names?: Map<string, string>
  ) => {
    const productCode = resolveReportProductCode(matHang);
    return (
      catalog.get(normalizeProductKey(productCode)) ||
      catalog.get(normalizeProductKey(matHang)) ||
      (names
        ? catalog.get(normalizeProductKey(names.get(normalizeProductKey(productCode)) || ''))
        : null) ||
      null
    );
  };

  /**
   * Bảng phẳng:
   * - TL vật tư trộn = nhựa thực tế (`trong_luong_nhua`) — nguồn chính
   * - Túi / ống = Σ bì / Σ lõi cân trên phiếu
   * - Băng keo / tem = Thành phần × SL (kg/cái hoặc kg/SP)
   */
  const nvlWeightByReportId = useMemo(() => {
    const map = new Map<string, NvlWeightGroupTotals>();
    for (const report of reportsWithNames) {
      const id = String(report.id || '').trim();
      if (!id) continue;
      const entry = resolveCatalogEntry(productCatalogByKey, report.mat_hang, productNameByCode);
      const items = mergeNplItemsWithCatalog(entry?.nplItems ?? [], entry?.nplItems ?? []);
      const qtyRaw = Number(report.so_luong);
      const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
      const nhuaKg = resolveNhuaThucTeKg(report);
      const groups = computeNvlWeightGroupTotals(
        items,
        quantity,
        null,
        materialWeightCatalog,
        nhuaKg,
        {
          biKg: report.trong_luong_bi,
          loiKg: report.trong_luong_loi
        }
      );
      map.set(id, {
        ...groups,
        // Tổng NVL % = nhựa thực tế (không nhân ĐM BOM trên bảng phẳng).
        tronKg: nhuaKg
      });
    }
    return map;
  }, [materialWeightCatalog, productCatalogByKey, productNameByCode, reportsWithNames]);

  const buildNvlViewState = (
    report: AcceptanceReport,
    catalog: Map<string, ProductCatalogEntry>,
    names: Map<string, string>,
    options?: {
      items?: ProductNplItem[];
      fromDb?: boolean;
      savedAt?: string;
      actualWeightKg?: number | null;
      actualNhuaKg?: number | null;
      actualLoiKg?: number | null;
      actualBiKg?: number | null;
      actualWeightCount?: number;
    }
  ): NvlViewState => {
    const productCode = resolveReportProductCode(report.mat_hang);
    const entry = resolveCatalogEntry(catalog, report.mat_hang, names);
    const qtyRaw = Number(report.so_luong);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
    const actualNhuaKg =
      options?.actualNhuaKg !== undefined
        ? options.actualNhuaKg
        : resolveNhuaThucTeKg(report);
    const actualLoiKg =
      options?.actualLoiKg !== undefined
        ? options.actualLoiKg
        : positiveCanKg(report.trong_luong_loi);
    const actualBiKg =
      options?.actualBiKg !== undefined
        ? options.actualBiKg
        : positiveCanKg(report.trong_luong_bi);
    return {
      report,
      productCode: entry?.code || productCode || report.mat_hang,
      productName:
        entry?.name ||
        report.ten_sp ||
        names.get(normalizeProductKey(productCode)) ||
        productCode ||
        '—',
      productUnit: entry?.unit || report.don_vi || '',
      quantity,
      items: mergeNplItemsWithCatalog(
        options?.items ?? entry?.nplItems ?? [],
        entry?.nplItems ?? []
      ),
      fromDb: Boolean(options?.fromDb),
      savedAt: options?.savedAt,
      actualWeightKg:
        options?.actualWeightKg !== undefined ? options.actualWeightKg : null,
      actualNhuaKg,
      actualLoiKg,
      actualBiKg,
      actualWeightCount:
        options?.actualWeightCount !== undefined ? options.actualWeightCount : 0
    };
  };

  const nvlLineWeightsKg = useMemo(() => {
    if (!nvlView) return [] as Array<number | null>;
    const slipKg = resolveSlipKhoiLuongKg(nvlView.report, nvlView.actualWeightKg);
    const nhuaKg = resolveNhuaThucTeKg(nvlView.report, nvlView.actualNhuaKg);
    const tuiIndices: number[] = [];
    const ongIndices: number[] = [];
    nvlView.items.forEach((item, index) => {
      if (item.amountType === 'percent') return;
      if (isNvlTuiItem(item)) tuiIndices.push(index);
      else if (isNvlOngItem(item)) ongIndices.push(index);
    });
    const tuiShare = shareCanKgAcrossIndices(
      tuiIndices,
      positiveCanKg(nvlView.actualBiKg ?? nvlView.report.trong_luong_bi),
      nvlView.items
    );
    const ongShare = shareCanKgAcrossIndices(
      ongIndices,
      positiveCanKg(nvlView.actualLoiKg ?? nvlView.report.trong_luong_loi),
      nvlView.items
    );
    return nvlView.items.map((item, index) => {
      // Vật tư trộn: chỉ % trộn thực tế × nhựa thực tế — không fallback ĐM BOM.
      if (item.amountType === 'percent') {
        const actualPct = resolveActualMixPercent(item, nvlMixActualPercentByKey);
        if (actualPct == null) return null;
        return resolveNvlTrongLuongKg(
          { ...item, percent: actualPct },
          nvlView.quantity,
          slipKg,
          materialWeightCatalog,
          nhuaKg
        );
      }
      // Túi / ống: lấy thẳng Σ bì / Σ lõi cân — không nhân ĐM × SL.
      if (isNvlTuiItem(item)) return tuiShare.get(index) ?? null;
      if (isNvlOngItem(item)) return ongShare.get(index) ?? null;
      return resolveNvlTrongLuongKg(
        item,
        nvlView.quantity,
        slipKg,
        materialWeightCatalog,
        nhuaKg
      );
    });
  }, [materialWeightCatalog, nvlMixActualPercentByKey, nvlView]);

  const nvlTrongLuongTotalKg = useMemo(() => sumNvlWeightsKg(nvlLineWeightsKg), [nvlLineWeightsKg]);

  const nvlGroupedRows = useMemo(() => {
    const vatTuTron: Array<{ item: ProductNplItem; index: number }> = [];
    const vatTuKhongTron: Array<{ item: ProductNplItem; index: number }> = [];
    if (!nvlView) return { vatTuTron, vatTuKhongTron };
    nvlView.items.forEach((item, index) => {
      if (isNvlVatTuTron(item)) vatTuTron.push({ item, index });
      else vatTuKhongTron.push({ item, index });
    });
    return { vatTuTron, vatTuKhongTron };
  }, [nvlView]);

  const nvlTrongLuongTronKg = useMemo(
    () => sumNvlWeightsKg(nvlGroupedRows.vatTuTron.map(row => nvlLineWeightsKg[row.index])),
    [nvlGroupedRows.vatTuTron, nvlLineWeightsKg]
  );

  const nvlTrongLuongKhongTronKg = useMemo(
    () => sumNvlWeightsKg(nvlGroupedRows.vatTuKhongTron.map(row => nvlLineWeightsKg[row.index])),
    [nvlGroupedRows.vatTuKhongTron, nvlLineWeightsKg]
  );

  const loadProductCatalog = async (materialData?: unknown) => {
    const res = await fetch('/api/san-pham?format=table');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không thể tải danh mục sản phẩm.');
    return applyProductCatalogData(data, materialData);
  };

  useEffect(() => {
    let cancelled = false;
    // Nạp danh mục SP riêng: lỗi /api/kho-nvl hay /api/cai-dat không được xoá tên SP đã nạp.
    (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table');
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || 'Không thể tải danh mục sản phẩm.');
        if (!cancelled) applyProductCatalogData(data);
      } catch {
        // Giữ nguyên danh mục cũ (nếu có) — không xoá trắng để tránh cột Tên SP trống.
      } finally {
        if (!cancelled) setIsProductNamesLoading(false);
      }
    })();
    (async () => {
      try {
        const [materialRes, settingRes] = await Promise.all([fetch('/api/kho-nvl'), fetch('/api/cai-dat')]);
        if (cancelled) return;
        const materialData = await materialRes.json().catch(() => ({}));
        const settingData = await settingRes.json().catch(() => ({}));
        if (materialRes.ok) {
          setMaterialWeightCatalog(
            normalizeMaterialsInventory(materialData).map(mapMaterialToWeightCatalogItem)
          );
        }
        if (settingRes.ok) setShiftSettings(normalizeShiftSettings(settingData));
      } catch {
        // Không ảnh hưởng danh mục SP.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReports = async (tuNgay = filterFromDate, denNgay = filterToDate) => {
    const params = new URLSearchParams();
    if (tuNgay) params.set('tu_ngay', tuNgay);
    if (denNgay) params.set('den_ngay', denNgay);
    const res = await fetch(`/api/bao-cao-nghiem-thu?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không thể tải báo cáo sản lượng.');
    const list = Array.isArray(data.reports) ? data.reports : [];
    setReports(list.map((item: Record<string, unknown>) => normalizeReportFromApi(item)));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        await loadReports(filterFromDate, filterToDate);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải báo cáo.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterFromDate, filterToDate]);

  const handlePrint = async () => {
    const slips = await attachShiftLeads(buildAcceptancePrintSlips(reportsWithNames));
    if (slips.length === 0) {
      setError('Chưa có báo cáo sản lượng để in.');
      return;
    }
    const weights = new Map<string, Map<string, number>>();
    try {
      for (const slip of slips) {
        if (!slip.thanhPhamLines.length) continue;
        const byProduct = await loadAcceptanceMixedWeight(slip);
        if (!byProduct) {
          setError(`Chưa có bản Tính toán BB mục 3.1 cho ngày ${slip.ngay}, ca ${slip.ca}, máy ${slip.machineLabel}.`);
          return;
        }
        weights.set(slip.id, byProduct);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được trọng lượng nhập thành phẩm từ BB 3.1.');
      return;
    }
    const ids = reportsWithNames.filter(report => !report.da_in).map(report => report.id);
    if (ids.length > 0) {
      if (!window.confirm('Phiếu sau khi in cần xác nhận riêng nếu muốn sửa và phải in lại sau khi lưu. Bạn có chắc chắn muốn in?')) {
        return;
      }
      setReports(prev => prev.map(report => (ids.includes(report.id) ? { ...report, da_in: true } : report)));
      fetch('/api/bao-cao-nghiem-thu/danh-dau-da-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      }).catch(() => {});
    }
    setError('');
    setMixedKgBySlipId(weights);
    setActivePrintSlips(slips);
    setPendingPrint(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa dòng báo cáo sản lượng này?')) return;
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch(`/api/bao-cao-nghiem-thu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      setMessage('Đã xóa dòng báo cáo sản lượng.');
      await loadReports(filterFromDate, filterToDate);
    } catch (err: any) {
      setError(err.message || 'Không thể xóa báo cáo.');
    } finally {
      setDeletingId(null);
    }
  };

  const findCatalogForReport = (report: AcceptanceReport) => {
    const productCode = resolveReportProductCode(report.mat_hang);
    return (
      productCatalogByKey.get(normalizeProductKey(productCode)) ||
      productCatalogByKey.get(normalizeProductKey(report.mat_hang)) ||
      null
    );
  };

  /** Lưu snapshot lõi/bì/màng/nhựa từ cân AI; không đổi trọng lượng tổng. */
  const handleSyncTrongLuong = async () => {
    if (filteredReports.length === 0) {
      setError('Không có dòng nào trong bộ lọc để đồng bộ.');
      return;
    }
    if (
      !window.confirm(
        `Lưu TL lõi/bì/màng/nhựa từ cân AI cho ${filteredReports.length} dòng đang lọc? Giữ nguyên trọng lượng tổng và số lượng.`
      )
    ) {
      return;
    }

    setIsSyncingWeight(true);
    setError('');
    setMessage('');
    let updated = 0;
    let skipped = 0;
    const failures: string[] = [];

    try {
      const recordsByNgay = new Map<string, CanTuDongWeightRow[]>();
      for (const report of filteredReports) {
        const ngay = String(report.ngay || '').trim();
        if (!ngay || recordsByNgay.has(ngay)) continue;
        try {
          recordsByNgay.set(ngay, await fetchCanTuDongByNgay(ngay));
        } catch (err: any) {
          failures.push(`${ngay}: ${err.message || 'không tải được cân AI'}`);
          recordsByNgay.set(ngay, []);
        }
      }

      for (const report of filteredReports) {
        const catalog = findCatalogForReport(report);
        const sameProductReports = reports.filter(other => other.ngay === report.ngay && other.ca === report.ca &&
          (other.ma_may || other.ten_may) === (report.ma_may || report.ten_may) &&
          normalizeProductCodeKey(other.mat_hang) === normalizeProductCodeKey(report.mat_hang) &&
          isAcceptanceThanhPhamLoai(other.loai_vat_tu));
        if (sameProductReports.length > 1) {
          failures.push(`${report.mat_hang}: có nhiều phiếu cùng ngày/ca/máy/SP, cần đối chiếu để tránh cộng trùng.`);
          continue;
        }
        const productCode =
          catalog?.code || resolveReportProductCode(report.mat_hang) || report.mat_hang;
        const productName = catalog?.name || report.ten_sp || productCode;
        const canRows = recordsByNgay.get(String(report.ngay || '').trim()) || [];
        if (!catalog) {
          failures.push(`${report.mat_hang}: không có danh mục SP để xác định màng.`);
          continue;
        }
        const snapshot = calculateAcceptanceWeightSnapshot(canRows, report, filmKgByProductCode, [productCode, productName, report.mat_hang]);
        if (!snapshot.so_lan_can) {
          skipped += 1;
          continue;
        }
        const res = await fetch(`/api/bao-cao-nghiem-thu/${encodeURIComponent(report.id)}/trong-luong`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`${report.mat_hang}: ${data.error || 'lỗi cập nhật'}`);
          continue;
        }
        updated += 1;
      }

      await loadReports(filterFromDate, filterToDate);
      if (failures.length > 0) {
        setError(
          `Đồng bộ xong: ${updated} cập nhật, ${skipped} bỏ qua. Lỗi: ${failures.slice(0, 3).join('; ')}${
            failures.length > 3 ? '…' : ''
          }`
        );
      } else {
        setMessage(
          `Đã lưu trọng lượng lõi/bì/màng/nhựa: ${updated} dòng; ${skipped} dòng thiếu dữ liệu cân. Trọng lượng tổng giữ nguyên.`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Không thể đồng bộ trọng lượng.');
    } finally {
      setIsSyncingWeight(false);
    }
  };

  const openNvlView = async (report: AcceptanceReport) => {
    setNvlSyncMessage('');
    setNvlTab('tong');
    setNvlMixActualPercentByKey(new Map());
    const fallback = buildNvlViewState(report, productCatalogByKey, productNameByCode, {
      fromDb: false
    });
    setNvlView(fallback);

    const loadActualWeight = async (): Promise<{
      actualWeightKg: number | null;
      actualNhuaKg: number | null;
      actualLoiKg: number | null;
      actualBiKg: number | null;
      actualWeightCount: number;
    }> => {
      try {
        const canRows = await fetchCanTuDongByNgay(report.ngay);
        const { weightKg, counted } = sumTrongLuongCanThucTeForReport(
          canRows,
          report,
          fallback.productCode,
          fallback.productName
        );
        const snapshot = calculateAcceptanceWeightSnapshot(
          canRows,
          report,
          filmKgByProductCode,
          [fallback.productCode, fallback.productName, report.mat_hang]
        );
        const nhuaFromCan =
          snapshot.so_lan_can > 0 &&
          snapshot.trong_luong_nhua != null &&
          Number.isFinite(snapshot.trong_luong_nhua)
            ? Math.round(snapshot.trong_luong_nhua * 1000) / 1000
            : null;
        const loiFromCan =
          snapshot.so_lan_can > 0 ? positiveCanKg(snapshot.trong_luong_loi) : null;
        const biFromCan =
          snapshot.so_lan_can > 0 ? positiveCanKg(snapshot.trong_luong_bi) : null;
        return {
          actualWeightKg: counted > 0 && weightKg > 0 ? Math.round(weightKg * 1000) / 1000 : null,
          actualNhuaKg: nhuaFromCan,
          actualLoiKg: loiFromCan,
          actualBiKg: biFromCan,
          actualWeightCount: counted
        };
      } catch {
        return {
          actualWeightKg: null,
          actualNhuaKg: null,
          actualLoiKg: null,
          actualBiKg: null,
          actualWeightCount: 0
        };
      }
    };

    const loadMixActualPercents = async () => {
      try {
        const params = new URLSearchParams({
          tu_ngay: report.ngay,
          den_ngay: report.ngay
        });
        const mixingRes = await fetch(`/api/bao-cao-phoi-tron?${params.toString()}`);
        const mixingData = await mixingRes.json().catch(() => ({}));
        if (!mixingRes.ok) return new Map<string, number>();
        const list = Array.isArray((mixingData as { reports?: unknown }).reports)
          ? ((mixingData as { reports: Record<string, unknown>[] }).reports)
          : [];
        const mixingReports = list.map(row => normalizeMixingReport(row));
        const ratioRows = buildMachineNvlMixingRatioRows(mixingReports, {
          ngay: report.ngay,
          ca: report.ca,
          maMay: report.ma_may || '',
          tenMay: report.ten_may || ''
        });
        return buildActualMixPercentMap(ratioRows);
      } catch {
        return new Map<string, number>();
      }
    };

    try {
      const [weightResult, mixPercents, res] = await Promise.all([
        loadActualWeight(),
        loadMixActualPercents(),
        fetch(`/api/bao-cao-san-luong-nvl-dinh-muc?id_bao_cao=${encodeURIComponent(report.id)}`)
      ]);
      setNvlMixActualPercentByKey(mixPercents);
      const data = await res.json().catch(() => ({}));

      const applyWeight = <T extends NvlViewState>(state: T): T => ({
        ...state,
        actualWeightKg:
          weightResult.actualWeightKg ?? resolveSlipKhoiLuongKg(state.report),
        actualNhuaKg:
          weightResult.actualNhuaKg ?? resolveNhuaThucTeKg(state.report),
        actualLoiKg:
          weightResult.actualLoiKg ?? positiveCanKg(state.report.trong_luong_loi),
        actualBiKg:
          weightResult.actualBiKg ?? positiveCanKg(state.report.trong_luong_bi),
        actualWeightCount: weightResult.actualWeightCount
      });

      if (!res.ok) {
        const err = String(data.error || '').trim();
        if (err) {
          setNvlSyncMessage(
            err.includes('chưa tồn tại') || /PGRST205|schema cache/i.test(err)
              ? 'Bảng snapshot chưa tạo — đang hiện Thành phần Kho sản phẩm. Chạy supabase-bao-cao-san-luong-nvl-dinh-muc.sql rồi Đồng bộ.'
              : `Không đọc snapshot DB: ${err}`
          );
        }
        setNvlView(applyWeight(fallback));
        return;
      }
      const rows = Array.isArray(data.items) ? data.items : [];
      if (rows.length === 0) {
        setNvlView(applyWeight(fallback));
        setNvlSyncMessage(
          fallback.items.length > 0
            ? `Đã có ${fallback.items.length} NVL từ Thành phần — chưa lưu snapshot phiếu. Bấm Đồng bộ & lưu DB.`
            : 'Phiếu chưa có snapshot và sản phẩm chưa có Thành phần NVL.'
        );
        return;
      }
      const items = dbRowsToNplItems(rows);
      const savedAt = String(rows[0]?.updated_at || rows[0]?.created_at || '').trim();
      setNvlView(
        applyWeight(
          buildNvlViewState(report, productCatalogByKey, productNameByCode, {
            items,
            fromDb: true,
            savedAt: savedAt || undefined
          })
        )
      );
      setNvlSyncMessage(`Đã tải ${items.length} NVL từ DB (snapshot đã lưu).`);
    } catch {
      setNvlView(fallback);
      setNvlSyncMessage('Không kết nối được API snapshot — đang hiện Thành phần Kho sản phẩm.');
    }
  };

  /** Đồng bộ từ Thành phần Kho sản phẩm → lưu snapshot DB. */
  const handleSyncNvlFromProduct = async () => {
    if (!nvlView) return;
    setIsSyncingNvl(true);
    setNvlSyncMessage('');
    try {
      const catalog = await loadProductCatalog();
      const names = new Map<string, string>();
      for (const entry of catalog.values()) {
        const key = normalizeProductKey(entry.code);
        if (key && entry.name) names.set(key, entry.name);
      }
      setProductNameByCode(names);
      const withNames = buildNvlViewState(nvlView.report, catalog, names, {
        fromDb: false,
        actualWeightKg: nvlView.actualWeightKg,
        actualNhuaKg: nvlView.actualNhuaKg,
        actualLoiKg: nvlView.actualLoiKg,
        actualBiKg: nvlView.actualBiKg,
        actualWeightCount: nvlView.actualWeightCount
      });
      setNvlView(withNames);

      const saveRes = await fetch('/api/bao-cao-san-luong-nvl-dinh-muc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_bao_cao: nvlView.report.id,
          ma_sp: withNames.productCode,
          ten_sp: withNames.productName,
          so_luong_sp: withNames.quantity,
          don_vi_sp: withNames.productUnit,
          items: nplItemsToDbPayload(withNames.items, withNames.quantity)
        })
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Không thể lưu NVL định mức vào DB.');
      }
      const savedItems = dbRowsToNplItems(Array.isArray(saveData.items) ? saveData.items : []);
      setNvlView({
        ...withNames,
        items: savedItems.length > 0 ? savedItems : withNames.items,
        fromDb: true,
        savedAt: new Date().toISOString()
      });
      setNvlSyncMessage(
        withNames.items.length > 0
          ? `Đã đồng bộ và lưu ${withNames.items.length} NVL vào DB.`
          : 'Đã đồng bộ — sản phẩm chưa có Thành phần; snapshot DB trống.'
      );
    } catch (err: any) {
      setNvlSyncMessage(err.message || 'Không thể đồng bộ / lưu Thành phần vào DB.');
    } finally {
      setIsSyncingNvl(false);
    }
  };

  

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img
                src={vietNhatLogoUrl}
                alt="Viet Nhat IPT"
                className="h-14 w-auto max-w-[190px] object-contain"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">
                  Báo cáo sản lượng
                </p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Bảng tổng hợp theo dòng — cột Ngày · Ca · Máy, lọc và phân trang
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => onCreate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#d91628]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-600">
            <ClipboardList className="h-4 w-4 text-zinc-400" />
            <span>
              {filteredReports.length} dòng
              {hasActiveFilters ? ' (đã lọc)' : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => void handleSyncTrongLuong()}
                disabled={filteredReports.length === 0 || isSyncingWeight || isLoading || isProductNamesLoading || productCatalogByKey.size === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Lưu TL lõi/bì/màng/nhựa từ cân AI vào DB; giữ nguyên trọng lượng tổng và số lượng"
              >
                {isSyncingWeight ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isSyncingWeight ? 'Đang đồng bộ...' : 'Đồng bộ trọng lượng'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handlePrint}
              disabled={printSlipCount === 0 || pendingPrint || isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {pendingPrint ? 'Đang in...' : `In tất cả (${printSlipCount})`}
            </button>
          </div>
        </div>

        {!hideLocalFilters ? (
        <div className="border-b border-zinc-100 bg-white px-4 py-3">
          <TableToolbar isLoading={isLoading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
            <TableSearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Tìm mặt hàng, tổ/máy, ca..."
              disabled={isLoading}
            />
            <FilterCombobox
              label="Ca"
              options={shiftOptions}
              value={filterShift || 'all'}
              onChange={value => setFilterShift(value === 'all' ? '' : value)}
              searchPlaceholder="Tìm ca..."
              compact
            />
            <TableDateFilter label="Từ ngày" value={filterFromDate} onChange={setFilterFromDate} />
            <TableDateFilter label="Đến ngày" value={filterToDate} onChange={setFilterToDate} />
          </TableToolbar>
        </div>
        ) : null}

        <div className="p-3 sm:p-4">
          {isLoading ? (
            <div className="px-3 py-8 text-center font-bold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : (
            <AcceptanceReportFlatTable
              reports={reportsWithNames}
              nvlWeightByReportId={nvlWeightByReportId}
              onViewNvl={report => void openNvlView(report)}
              onEditLine={onEdit}
              onDeleteLine={id => void handleDelete(id)}
              deletingId={deletingId}
              isLoadingNames={isProductNamesLoading}
            />
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {nvlView
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4"
              onClick={() => setNvlView(null)}
            >
              <div
                className="flex h-[92vh] max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-violet-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">
                      NVL theo định mức
                    </p>
                    <p className="mt-1 font-mono text-sm font-black text-zinc-900">
                      {nvlView.productCode}
                    </p>
                    <p className="text-xs font-semibold text-zinc-600">{nvlView.productName}</p>
                    <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
                      <div
                        className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5"
                        title="Nhựa thực tế = Cân SP − Cân lõi − Bì − Màng (phiếu cân AI hoặc snapshot phiếu)"
                      >
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                          Trọng lượng thực tế
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">
                          {formatActualCanWeightKg(nvlView.actualNhuaKg)}
                        </p>
                        <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">
                          {nvlView.actualWeightCount > 0
                            ? `Nhựa · ${nvlView.actualWeightCount} lần cân AI`
                            : nvlView.actualNhuaKg != null
                              ? 'Nhựa thực tế (DB phiếu)'
                              : 'Chưa có nhựa thực tế — bấm Đồng bộ trọng lượng'}
                        </p>
                      </div>
                      <div
                        className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5"
                        title="Cân sản phẩm từ cân AI hoặc trọng lượng đã lưu trên phiếu"
                      >
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                          Trọng lượng tổng
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-black text-amber-800">
                          {formatActualCanWeightKg(
                            resolveSlipKhoiLuongKg(nvlView.report, nvlView.actualWeightKg)
                          )}
                        </p>
                        <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">
                          {nvlView.actualWeightCount > 0
                            ? `Cân SP · ${nvlView.actualWeightCount} lần cân AI`
                            : resolveSlipKhoiLuongKg(nvlView.report) != null
                              ? 'Trọng lượng trên phiếu'
                              : 'Chưa có cân SP'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                          Số lượng
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">
                          {nvlView.quantity > 0
                            ? `${formatNplDecimal(nvlView.quantity)}${
                                nvlView.productUnit ? ` ${nvlView.productUnit}` : ''
                              }`
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                      {nvlView.report.ngay} · {nvlView.report.ca}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-violet-600/80">
                      {nvlView.fromDb
                        ? 'Nguồn: snapshot đã lưu DB · Đồng bộ để cập nhật từ Thành phần Kho sản phẩm'
                        : 'Nguồn: bảng Thành phần · Kho sản phẩm (chưa lưu DB — bấm Đồng bộ để lưu)'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSyncNvlFromProduct()}
                      disabled={isSyncingNvl}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-[11px] font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Đồng bộ từ Thành phần Kho sản phẩm và lưu vào DB"
                    >
                      {isSyncingNvl ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {isSyncingNvl ? 'Đang đồng bộ...' : 'Đồng bộ & lưu DB'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNvlView(null);
                        setNvlSyncMessage('');
                        setNvlTab('tong');
                        setNvlMixActualPercentByKey(new Map());
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50"
                      title="Đóng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {nvlSyncMessage ? (
                  <div
                    className={`border-b px-4 py-2 text-[11px] font-semibold ${
                      nvlSyncMessage.includes('Không thể')
                        ? 'border-rose-100 bg-rose-50 text-rose-700'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    {nvlSyncMessage}
                  </div>
                ) : null}
                <div className="flex shrink-0 gap-1 border-b border-zinc-200 bg-white px-3 pt-2">
                  {(
                    [
                      { id: 'tong' as const, label: 'Tổng', count: nvlView.items.length },
                      {
                        id: 'tron' as const,
                        label: 'Vật tư trộn',
                        count: nvlGroupedRows.vatTuTron.length
                      },
                      {
                        id: 'khong-tron' as const,
                        label: 'Vật tư không trộn',
                        count: nvlGroupedRows.vatTuKhongTron.length
                      }
                    ] as const
                  ).map(tab => {
                    const active = nvlTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setNvlTab(tab.id)}
                        className={`inline-flex items-center gap-2 rounded-t-xl border px-3 py-2 text-xs font-black transition ${
                          active
                            ? 'border-violet-300 border-b-white bg-white text-violet-900'
                            : 'border-transparent bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                            active ? 'bg-violet-100 text-violet-800' : 'bg-zinc-200/80 text-zinc-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  {isSyncingNvl ? (
                    <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Đang lấy Thành phần từ Kho sản phẩm...
                    </p>
                  ) : nvlView.items.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                      Sản phẩm chưa có thành phần / định mức NVL trên Kho sản phẩm.
                      <br />
                      <span className="mt-2 inline-block text-[11px] font-bold text-violet-700">
                        Bấm Đồng bộ sau khi cập nhật bảng Thành phần.
                      </span>
                    </p>
                  ) : (
                    <div className="p-4">
                      {nvlTab === 'tong' ? (
                        <NvlDinhMucGroupTable
                          title="Tổng"
                          emptyLabel="Không có NVL định mức."
                          rows={[...nvlGroupedRows.vatTuTron, ...nvlGroupedRows.vatTuKhongTron]}
                          productQty={nvlView.quantity}
                          weightsByIndex={nvlLineWeightsKg}
                        />
                      ) : null}
                      {nvlTab === 'tron' ? (
                        <NvlDinhMucGroupTable
                          title="Vật tư trộn"
                          emptyLabel="Không có vật tư trộn (NVL % / nhựa)."
                          rows={nvlGroupedRows.vatTuTron}
                          productQty={nvlView.quantity}
                          weightsByIndex={nvlLineWeightsKg}
                          useActualMixPercent
                          actualPercentByKey={nvlMixActualPercentByKey}
                        />
                      ) : null}
                      {nvlTab === 'khong-tron' ? (
                        <NvlDinhMucGroupTable
                          title="Vật tư không trộn"
                          emptyLabel="Không có vật tư không trộn (túi / ống / băng keo / …)."
                          rows={nvlGroupedRows.vatTuKhongTron}
                          productQty={nvlView.quantity}
                          weightsByIndex={nvlLineWeightsKg}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold text-zinc-500">
                  <span>
                    {nvlTab === 'tong'
                      ? `${nvlView.items.length} NVL`
                      : nvlTab === 'tron'
                        ? `${nvlGroupedRows.vatTuTron.length} vật tư trộn`
                        : `${nvlGroupedRows.vatTuKhongTron.length} vật tư không trộn`}
                  </span>
                  <span className="font-mono font-black text-amber-800">
                    {nvlTab === 'tong'
                      ? `Tổng: ${nvlTrongLuongTotalKg > 0 ? formatNvlTrongLuongKg(nvlTrongLuongTotalKg) : '—'}`
                      : nvlTab === 'tron'
                        ? `Trộn: ${nvlTrongLuongTronKg > 0 ? formatNvlTrongLuongKg(nvlTrongLuongTronKg) : '—'}`
                        : `Không trộn: ${
                            nvlTrongLuongKhongTronKg > 0
                              ? formatNvlTrongLuongKg(nvlTrongLuongKhongTronKg)
                              : '—'
                          }`}
                  </span>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingPrint &&
        activePrintSlips.length > 0 &&
        createPortal(
          <AcceptanceReportPrintBatch
            slips={activePrintSlips}
            filmKgByProductCode={filmKgByProductCode}
            productNormByCode={productNormByCode}
            mixedKgBySlipId={mixedKgBySlipId}
            shiftSettings={shiftSettings}
          />,
          document.body
        )}
    </div>
  );
}
