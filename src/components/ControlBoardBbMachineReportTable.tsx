import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Calculator, Loader2, Printer, RefreshCw, Save, X, Info, Package } from 'lucide-react';
import { formatMoney, formatNumber } from '../utils';
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';
import { findProductByCode, resolveProductMaterialBaseKg } from '../features/san-pham';
import type { MachineRow } from '../features/danh-sach-may';
import type { MaterialRow } from '../features/kho-nvl';
import type { ProductionOrderRow, ProductionOrderLookupSetting } from '../features/ke-hoach-san-xuat';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../features/cai-dat-thoi-gian';
import type { MixingReport } from './MixingReportForm';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { getProductionShiftOptions, shiftNamesMatch, type ShiftSetting } from '../utils/shiftSettings';
import type { ShiftSummaryWarehouseMovement } from '../utils/controlBoardShiftSummary';
import { computePercentRatio, machineValueMatchesFilter } from '../utils/controlBoardShiftSummary';
import type { WeighingRecord } from '../utils/weighingRecords';
import type { MachineNvlSavedReport } from '../utils/machineNvlReports';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../utils/printReady';
import ControlBoardBbMachineReportPrintBatch from './ControlBoardBbMachineReportPrintSheet';
import BbCanTuDongTongHopPanel from './BbCanTuDongTongHopPanel';
import BbSanLuongReportPanel from './BbSanLuongReportPanel';
import {
  BbGiaiTrinhPrintSheet,
  buildBbGiaiTrinhPrintReport,
  type BbGiaiTrinhPrintReport
} from './BbGiaiTrinhPrintSheet';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import {
  computeCanTuDongTongHopBannerTotals,
  explainCanTuDongTongHopRowFormulas,
  fetchCanTuDongSlimRecords,
  syncCanTuDongTongHop
} from '../utils/canTuDongTongHop';
import { filterCanTuDongRecordsForBoard } from '../utils/canTuDongWeights';
import { shiftIsoDateByDays } from '../utils/shiftSettings';
import {
  buildBbLyDoStableKey,
  printLyDoLineKey,
  type BbBaoCaoLyDoRow
} from '../utils/bbBaoCaoLyDo';
import { buildBbPhanTichStableKey } from '../utils/bbPhanTichDanhGia';
import {
  buildBbGiaiTrinhStableKey,
  emptyBbGiaiTrinhFields,
  parseBbGiaiTrinhFields,
  type BbGiaiTrinhFields
} from '../utils/bbGiaiTrinh';
import {
  buildBbBaoCaoTinhToanStableKey,
  buildBbMachineReportSnapshot,
  emptyBbBaoCaoTinhToanPayload,
  isBbBaoCaoTinhToanPayload,
  type BbBaoCaoTinhToanPayload
} from '../utils/bbBaoCaoTinhToan';
import { buildBcLsxDmNvl, buildBcLsxRowsFromOrderGroups } from '../utils/bcLsx';
import { buildDuLieuXuatKhoRowsFromExportGroups } from '../utils/duLieuXuatKho';
import { buildBaoCaoDuLieuTonDauCaRowsFromGroups } from '../utils/baoCaoDuLieuTonDauCa';
import { buildBaoCaoSanLuongRowsFromGroups } from '../utils/baoCaoSanLuong';
import { buildDuLieuTrongBaoCaoHangLoiHongRowsFromGroups } from '../utils/duLieuTrongBaoCaoHangLoiHong';
import { buildDuLieuTrongBaoCaoKiemTonCuoiCaRowsFromGroups } from '../utils/duLieuTrongBaoCaoKiemTonCuoiCa';
import { buildBaoCaoThanhPhamDatNhapKhoRowsFromGroups } from '../utils/baoCaoThanhPhamDatNhapKho';
import { buildBaoCaoTieuHaoNguyenVatLieuRowsFromGroups } from '../utils/baoCaoTieuHaoNguyenVatLieu';
import { buildBaoCaoTongHopRowFromSummary } from '../utils/baoCaoTongHop';
import {
  BB_MACHINE_REPORT_TABS,
  buildBbInboundBalanceMetricDetail,
  buildBbOrderCodeOptions,
  buildBbWarehouseExportLineRows,
  groupBbWarehouseExportLines,
  buildBbPlasticSummaryDetailView,
  buildBbThucDungMetricDetail,
  buildBbTongHopThucXuatMetricDetail,
  aggregateBbWarehouseExportByMaterial,
  enrichBbProductionOrderRowsFromSanLuong,
  enrichBbProductionOrderRowsPlasticNormFromProducts,
  formatProductCatalogPlasticWeight,
  groupBbProductionOrderLines,
  groupBbThucDungLines,
  splitBbDauCaMaterialLinesByMixing,
  splitBbLoiHongMaterialLinesByMixing,
  sumBbDauCaMaterialLinesTonKg,
  syncBbThucDungRowsXuatTrongNgayFromExportTab,
  syncBbThucDungRowsTonCuoiFromCuoiCaTab,
  sumBbCuoiCaWeightKg,
  sumBbCuoiCaWeightKgByKind,
  sumBbDamagedGoodsWeightKg,
  sumBbDamagedGoodsWeightKgByKind,
  sumBbDamagedFilmScrapKg,
  sumBbDamagedRowsLoiHongKgForHeaderByProductCodes,
  isInsulationMachineText,
  resolveBbDamagedPlasticLoiHongKg,
  resolveBbLoiHongFilmScrapMaterialForShift,
  sumBbDanhGiaMoney,
  sumBbDauCaWeightKg,
  sumBbDauCaWeightKgByKind,
  sumBbInboundReportTotals,
  sumBbProductionOrderPlasticRequiredKg,
  sumBbProductionOrderTotals,
  sumBbSanLuongTotals,
  sumBbThucDungWeightKg,
  sumBbTongChenhLech,
  sumBbTongTrongLuongNhapKho,
  sumBbWarehouseExportSlipQuantity,
  sumBbWarehouseExportWeightKg,
  sumBbWarehouseExportWeightKgByKind,
  allocateBbNhuaHaoHutByRatioPercent,
  allocateBbKgByWeightShare,
  resolveBbThucDungKlNhuaTtLoiKg,
  resolveBbThucDungChenhLechKg,
  resolveBbMaterialExportUnitPrice,
  mapAcceptanceNvlDinhMucRowsToNplItems,
  refreshAcceptanceNvlDinhMucFromProductBom,
  overlayProductNplOnBbSanLuongGroups,
  isAcceptanceThanhPhamKhoReport,
  type BbMaterialNormFormula,
  type BbWarehouseExportLineRow,
  type BbInboundMaterialBalanceDetail,
  type BbInboundBalanceDetailMetric,
  type BbInboundBalanceDetailBag,
  type BbExportWeightFormula,
  type BbPlasticSummaryDetailMetric,
  type BbPlasticSummaryDetailView,
  type BbMachineReportTabId,
  type BbDauCaTonDauFormula,
  type BbDauCaProductLine,
  type BbThucDungDetailMetric,
  type BbThucDungDetailView,
  type BbThucDungLineRow,
  type BbTongHopThucXuatDetailMetric,
  type BbTongHopThucXuatLineRow
} from '../utils/controlBoardBbMachineReport';
import { isWarehouseKgUnit } from '../utils/warehouseWeight';
import type { BbProductionOrderGroup } from '../utils/controlBoardBbMachineReport';

type BbPrintConfirmSelection = {
  staffMain: string;
  staffAssistant: string;
  staffSupport: string;
  ghiChu: string;
};

const BB_PHAN_TICH_STORAGE_KEY = 'control-board-bb-phan-tich-v1';

function mapBbGiaiTrinhItemsFromDb(items: unknown[]): Record<string, BbGiaiTrinhFields> {
  const next: Record<string, BbGiaiTrinhFields> = {};
  for (const raw of items) {
    const groupKey = String((raw as Record<string, unknown>)?.group_key || (raw as Record<string, unknown>)?.ma_lenh || '').trim();
    if (!groupKey) continue;
    next[groupKey] = parseBbGiaiTrinhFields(raw);
  }
  return next;
}

function loadBbPhanTichMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BB_PHAN_TICH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBbPhanTichMap(map: Record<string, string>) {
  try {
    localStorage.setItem(BB_PHAN_TICH_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function formatKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  // ≥4 chữ số thập phân: giữ đủ số, không cắt còn 2 số gây mất phần thập phân.
  if (digits >= 4) {
    return new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  }
  return formatNumber(value, digits);
}

function formatSignedKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatKg(Math.abs(value), digits)}`;
}

function formatPlasticSummaryCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return formatNumber(value, 2);
  }
  return String(value);
}

/** Làm tròn kg giống số đang hiện trên bảng (tránh tổng SP lệch 0,01 so với cộng tay các dòng). */
function roundDisplayKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
}

function formatVnd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '—';
  return `${formatMoney(value, 0)} đ`;
}

function formatThucDungDetailCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  return String(value);
}

/**
 * Trọng lượng định mức = Số lượng của SP × Khối lượng (kg) trong bảng Thành phần (mã NVL của dòng).
 * Nhân thêm allocationRatio vì 1 mã NVL của 1 SP có thể bị tách thành nhiều dòng phiếu xuất
 * (allocationRatio là tỉ lệ chia — cộng dồn các dòng con mới ra đúng tổng định mức của mã đó).
 */
function computeTrongLuongDinhMucKg(line: BbWarehouseExportLineRow): number | null {
  const productQuantity = line.materialNorm?.productQuantity;
  const kgPerUnit = line.materialNorm?.componentWeightKg;
  const ratio = line.materialNorm?.allocationRatio;
  if (productQuantity === undefined || productQuantity === null || !(productQuantity > 0)) return null;
  if (kgPerUnit === null || kgPerUnit === undefined || !(kgPerUnit > 0)) return null;
  if (ratio === undefined || ratio === null || !(ratio > 0)) return null;
  return productQuantity * kgPerUnit * ratio;
}

function materialRatioKey(code: string | null | undefined) {
  return String(code || '').trim().toUpperCase();
}

/** Tổng Trọng lượng định mức theo từng mã NVL, cộng dồn qua mọi SP trong cùng 1 Lệnh SX (group). */
function sumTrongLuongDinhMucKgByMaterial(lines: BbWarehouseExportLineRow[]): Map<string, number> {
  const map = new Map<string, number>();
  lines.forEach(line => {
    const kg = computeTrongLuongDinhMucKg(line);
    if (kg === null) return;
    const key = materialRatioKey(line.itemCode);
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + kg);
  });
  return map;
}

/**
 * Tỉ lệ % = Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức
 * của mã NVL đó cộng dồn qua mọi SP trong cùng Lệnh SX.
 */
function computeTrongLuongDinhMucPercent(
  line: BbWarehouseExportLineRow,
  groupTotalsByMaterial: Map<string, number>
): number | null {
  const ownKg = computeTrongLuongDinhMucKg(line);
  if (ownKg === null) return null;
  const total = groupTotalsByMaterial.get(materialRatioKey(line.itemCode));
  if (!total || total <= 0) return null;
  return (ownKg / total) * 100;
}

function sumTrongLuongDinhMucKg(lines: BbWarehouseExportLineRow[]) {
  return lines.reduce((sum, line) => sum + (computeTrongLuongDinhMucKg(line) || 0), 0);
}

type MaterialProductNormDetail = {
  key: string;
  orderCode: string;
  ngay: string;
  shiftLabel: string;
  machine: string;
  productCode: string;
  productName: string;
  productQuantity: number;
  productUnit: string;
  componentWeightKg: number | null;
  /** Trọng lượng định mức (kg) của NVL trên SP này. */
  normWeightKg: number;
  /** Tỉ lệ % = TL ĐM SP này ÷ tổng TL ĐM mã NVL trong lệnh. */
  percent: number | null;
};

type MaterialTotalDetail = {
  itemCode: string;
  itemName: string;
  unit: string;
  exportQuantity: number;
  exportWeightKg: number;
  lineCount: number;
  products: MaterialProductNormDetail[];
};

/** Gom định mức theo từng SP (+ tỉ lệ %) cho 1 mã NVL từ dòng đã phân bổ trong exportGroups. */
function buildMaterialTotalDetail(
  material: {
    itemCode: string;
    itemName: string;
    unit: string;
    quantity: number;
    weightKg: number;
    lineCount: number;
  },
  exportGroups: Array<{
    orderCode: string;
    ngay: string;
    shiftLabel: string;
    shift: string;
    machine: string;
    productGroups: Array<{ lines: BbWarehouseExportLineRow[] }>;
  }>
): MaterialTotalDetail {
  const codeKey = materialRatioKey(material.itemCode);
  const products: MaterialProductNormDetail[] = [];

  for (const group of exportGroups) {
    const groupLines = group.productGroups.flatMap(pg => pg.lines || []);
    const materialLines = groupLines.filter(line => materialRatioKey(line.itemCode) === codeKey);
    if (materialLines.length === 0) continue;

    const totalsByMaterial = sumTrongLuongDinhMucKgByMaterial(groupLines);
    const materialTotalKg = totalsByMaterial.get(codeKey) || 0;
    const byProduct = new Map<string, MaterialProductNormDetail>();

    for (const line of materialLines) {
      const productCode = String(line.materialNorm?.productCode || '').trim();
      const productName = String(line.materialNorm?.productName || '').trim();
      const productKey = `${group.orderCode}|${productCode || productName || line.key}`;
      const lineNormKg = computeTrongLuongDinhMucKg(line) || 0;
      const existing = byProduct.get(productKey);
      if (!existing) {
        byProduct.set(productKey, {
          key: productKey,
          orderCode: group.orderCode,
          ngay: group.ngay,
          shiftLabel: group.shiftLabel || group.shift,
          machine: group.machine,
          productCode,
          productName,
          productQuantity: Math.max(0, line.materialNorm?.productQuantity || 0),
          productUnit: String(line.materialNorm?.productUnit || '').trim(),
          componentWeightKg: line.materialNorm?.componentWeightKg ?? null,
          normWeightKg: lineNormKg,
          percent: null
        });
        continue;
      }
      existing.normWeightKg += lineNormKg;
      if (!(existing.productQuantity > 0) && (line.materialNorm?.productQuantity || 0) > 0) {
        existing.productQuantity = line.materialNorm?.productQuantity || 0;
      }
      if (existing.componentWeightKg === null && line.materialNorm?.componentWeightKg != null) {
        existing.componentWeightKg = line.materialNorm.componentWeightKg;
      }
    }

    for (const row of byProduct.values()) {
      row.percent =
        materialTotalKg > 0 && row.normWeightKg > 0
          ? (row.normWeightKg / materialTotalKg) * 100
          : null;
      products.push(row);
    }
  }

  products.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    return (b.percent || 0) - (a.percent || 0);
  });

  return {
    itemCode: material.itemCode,
    itemName: material.itemName,
    unit: material.unit,
    exportQuantity: material.quantity,
    exportWeightKg: material.weightKg,
    lineCount: material.lineCount,
    products
  };
}

function ThucDungMetricButton({
  label,
  className,
  onOpen,
  title = 'Bấm để xem dữ liệu nguồn'
}: {
  label: string;
  className: string;
  onOpen: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rounded-md px-1 py-0.5 underline decoration-dotted underline-offset-2 transition hover:bg-teal-100 ${className}`}
      title={title}
    >
      {label}
    </button>
  );
}

function BbDauCaMaterialRow({
  row,
  tonColumnLabel,
  onOpenTonFormula,
  showRatioColumns = true
}: {
  row: BbDauCaProductLine;
  tonColumnLabel: string;
  onOpenTonFormula: (formula: BbDauCaTonDauFormula) => void;
  showRatioColumns?: boolean;
}) {
  return (
    <tr className="border-b border-slate-50 bg-white font-semibold hover:bg-indigo-50/40">
      <td className="px-3 py-2 font-mono font-bold text-zinc-800">{row.itemCode || '—'}</td>
      <td className="px-3 py-2 text-zinc-700">{row.itemName || '—'}</td>
      <td className="px-3 py-2 text-zinc-600">{row.unit || '—'}</td>
      {showRatioColumns ? (
        <>
          <td className="px-3 py-2 text-right font-mono text-zinc-600">
            {formatPercent(row.tiLeDinhMucPercent, 2)}
          </td>
          <td className="px-3 py-2 text-right font-mono font-bold text-orange-800">
            {formatPercent(row.tiLeThucTeTbPercent, 2)}
          </td>
        </>
      ) : null}
      <td className="px-3 py-2 text-right font-mono text-zinc-700">
        {row.dinhMucRate === null || row.dinhMucRate === undefined
          ? '—'
          : `${formatNumber(row.dinhMucRate, row.amountType === 'percent' ? 2 : 3)}${
              row.dinhMucUnit ? ` ${row.dinhMucUnit}` : ''
            }`}
      </td>
      <td
        className="px-3 py-2 text-right font-mono font-bold text-indigo-700"
        title={tonColumnLabel}
      >
        {row.tonDauFormula ? (
          <ThucDungMetricButton
            label={formatKg(row.tonDauWeightKg, 4)}
            className="font-mono font-bold text-indigo-700"
            onOpen={() => {
              if (row.tonDauFormula) onOpenTonFormula(row.tonDauFormula);
            }}
          />
        ) : (
          formatKg(row.tonDauWeightKg, 4)
        )}
      </td>
    </tr>
  );
}

function BbDauCaMaterialSplitTables({
  materialLines,
  tonColumnLabel,
  onOpenTonFormula
}: {
  materialLines: BbDauCaProductLine[];
  tonColumnLabel: string;
  onOpenTonFormula: (formula: BbDauCaTonDauFormula) => void;
}) {
  const { mixingLines, otherLines } = splitBbDauCaMaterialLinesByMixing(materialLines);
  const mixingTotalKg = sumBbDauCaMaterialLinesTonKg(mixingLines);
  const otherTotalKg = sumBbDauCaMaterialLinesTonKg(otherLines);

  const renderTable = (
    title: string,
    titleClass: string,
    headerClass: string,
    rows: BbDauCaProductLine[],
    totalKg: number,
    emptyText: string,
    showRatioColumns = true
  ) => {
    const columnCount = showRatioColumns ? 7 : 5;
    const totalLabelColSpan = showRatioColumns ? 6 : 4;
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className={`border-b px-3 py-2 text-xs font-black uppercase tracking-wider ${titleClass}`}>
          {title}
          {rows.length > 0 ? ` (${rows.length})` : ''}
        </div>
        <table className="min-w-full text-left text-sm font-semibold">
          <thead className={`text-xs uppercase tracking-wider ${headerClass}`}>
            <tr>
              <th className="px-3 py-2 font-black">Mã NVL</th>
              <th className="px-3 py-2 font-black">Tên nguyên phụ liệu</th>
              <th className="px-3 py-2 font-black">ĐVT</th>
              {showRatioColumns ? (
                <>
                  <th
                    className="px-3 py-2 text-right font-black"
                    title="Từ thành phần % SP hoặc tỉ lệ trộn máy"
                  >
                    Tỉ lệ ĐM (%)
                  </th>
                  <th
                    className="px-3 py-2 text-right font-black"
                    title="Bằng Tỉ lệ ĐM (%): thành phần SP hoặc tỉ lệ trộn máy"
                  >
                    Tỉ lệ thực tế (%)
                  </th>
                </>
              ) : null}
              <th className="px-3 py-2 text-right font-black">Thành phần</th>
              <th className="px-3 py-2 text-right font-black">{tonColumnLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-4 text-center text-sm font-semibold text-zinc-400">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <BbDauCaMaterialRow
                  key={row.key}
                  row={row}
                  tonColumnLabel={tonColumnLabel}
                  onOpenTonFormula={onOpenTonFormula}
                  showRatioColumns={showRatioColumns}
                />
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-black text-slate-800">
              <tr>
                <td colSpan={totalLabelColSpan} className="px-3 py-2 text-right uppercase tracking-wider">
                  Tổng
                </td>
                <td className="px-3 py-2 text-right font-mono text-indigo-800">{formatKg(totalKg, 4)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 p-2 xl:grid-cols-2">
      {renderTable(
        'NVL trộn',
        'text-violet-900 bg-violet-100 border-violet-200',
        'bg-violet-50 text-violet-900',
        mixingLines,
        mixingTotalKg,
        'Không có NVL trộn (nhựa có tỉ lệ ĐM).'
      )}
      {renderTable(
        'NVL còn lại',
        'text-slate-800 bg-slate-100 border-slate-200',
        'bg-slate-50 text-slate-800',
        otherLines,
        otherTotalKg,
        'Không có NVL còn lại.',
        false
      )}
    </div>
  );
}

export default function ControlBoardBbMachineReportTable({
  productionOrders,
  products,
  materials,
  machines,
  warehouseMovements,
  warehouseMovementsByDate,
  damagedRecords = [],
  machineNvlReports = [],
  mixingReports = [],
  acceptanceReports = [],
  canTuDongRecords = [],
  sanLuongSource = 'acceptance',
  includeAllMachines = false,
  shiftSettings,
  isLoading,
  dateFrom,
  dateTo,
  shiftFilter = 'all',
  machineFilter = 'all',
  selectedMachine = null,
  onApplyCalcScope,
  onReloadSourceData,
  onReloadWarehouseData
}: {
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines: MachineRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  /** Xuất kho mục 3.1/3.2 trên phiếu in: cùng ngày lệnh, mọi ca. */
  warehouseMovementsByDate?: ShiftSummaryWarehouseMovement[];
  damagedRecords?: WeighingRecord[];
  machineNvlReports?: MachineNvlSavedReport[];
  mixingReports?: MixingReport[];
  acceptanceReports?: AcceptanceReport[];
  canTuDongRecords?: CanTuDongRecord[];
  /** Nguồn tab/bộ đếm Báo cáo sản lượng — mặc định phiếu `bao_cao_nghiem_thu`. */
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  /** `/phan-tich-tu-dong`: lấy lệnh/xuất kho mọi máy, không giới hạn nhóm BB. */
  includeAllMachines?: boolean;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
  isLoading?: boolean;
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  /** Sau Tính toán: đồng bộ bộ lọc Ngày/Ca/Máy của trang với phạm vi vừa tính (mọi tab cùng scope). */
  onApplyCalcScope?: (scope: {
    dateFrom: string;
    dateTo: string;
    shiftFilter: string;
    machineFilter: string;
  }) => void;
  /** Tải lại phiếu XK, lệnh SX, báo cáo máy… từ API (sau khi sửa phiếu trên /phieu-xuat-nhap-kho). */
  onReloadSourceData?: () => Promise<Partial<{
    products: ProductRow[];
    materials: MaterialRow[];
    acceptanceReports: AcceptanceReport[];
    productionOrders: ProductionOrderRow[];
    warehouseMovements: ShiftSummaryWarehouseMovement[];
    warehouseMovementsByDate: ShiftSummaryWarehouseMovement[];
    mixingReports: MixingReport[];
    damagedRecords: WeighingRecord[];
    machineNvlReports: MachineNvlSavedReport[];
  }> | void>;
  /** Tải lại kho NVL (Tổng kg), Thành phần SP + phiếu xuất — nhẹ, dùng trên màn xem trước in. */
  onReloadWarehouseData?: () => Promise<Partial<{
    products: ProductRow[];
    materials: MaterialRow[];
    warehouseMovements: ShiftSummaryWarehouseMovement[];
  }> | void>;
}) {
  const machineReportLabel = useMemo(() => {
    const name = String(selectedMachine?.name || '').trim();
    if (name && name !== '-') return `máy ${name.replace(/^máy\s*/i, '').trim()}`;

    const code = String(selectedMachine?.code || machineFilter || '').trim();
    return code && code !== 'all' ? `máy ${code}` : 'máy BB';
  }, [machineFilter, selectedMachine]);
  const machineReportTitle = `Báo cáo tổng hợp ${machineReportLabel}`;
  const [activeTab, setActiveTab] = useState<BbMachineReportTabId>(() =>
    sanLuongSource === 'can-tu-dong' ? 'bao_cao_san_luong' : 'lenh_sx'
  );

  useEffect(() => {
    if (sanLuongSource === 'can-tu-dong') {
      setActiveTab('bao_cao_san_luong');
    }
  }, [sanLuongSource]);
  useEffect(() => {
    if (
      activeTab === 'tong_vat_tu_thuc_dung' ||
      String(activeTab) === 'tong_dinh_muc_nvl_nhap_kho' ||
      String(activeTab) === 'bieu_do_so_sanh'
    ) {
      setActiveTab('lenh_sx');
    }
  }, [activeTab]);
  /** Đánh dấu tab đã rà soát xong (chỉ tạm trong phiên làm việc, không lưu lại). */
  const [checkedTabs, setCheckedTabs] = useState<Set<BbMachineReportTabId>>(() => new Set());
  const toggleTabChecked = (tabId: BbMachineReportTabId, event: React.MouseEvent) => {
    event.stopPropagation();
    setCheckedTabs(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };
  const [phanTichMap, setPhanTichMap] = useState<Record<string, string>>(() =>
    typeof window !== 'undefined' ? loadBbPhanTichMap() : {}
  );
  const [giaiTrinhMap, setGiaiTrinhMap] = useState<Record<string, BbGiaiTrinhFields>>({});
  const [orderCodeFilter, setOrderCodeFilter] = useState<string[]>([]);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [printConfirmOpen, setPrintConfirmOpen] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printPreviewSyncing, setPrintPreviewSyncing] = useState(false);
  const [printPreviewSyncMessage, setPrintPreviewSyncMessage] = useState('');
  const [printPreviewDataKey, setPrintPreviewDataKey] = useState(0);
  const pendingPrintSyncBumpRef = useRef(false);
  const [printStaffByOrder, setPrintStaffByOrder] = useState<Record<string, BbPrintConfirmSelection>>({});
  const [printOrderGroups, setPrintOrderGroups] = useState<BbProductionOrderGroup[]>([]);
  const [printNoteByOrder, setPrintNoteByOrder] = useState<Record<string, string>>({});
  const [printLyDoByLine, setPrintLyDoByLine] = useState<Record<string, string>>({});
  const [dbLyDoByStableKey, setDbLyDoByStableKey] = useState<Record<string, BbBaoCaoLyDoRow>>({});
  const [savingLyDo, setSavingLyDo] = useState(false);
  const [lyDoSaveMessage, setLyDoSaveMessage] = useState('');
  const [savingPhanTich, setSavingPhanTich] = useState(false);
  const [phanTichSaveMessage, setPhanTichSaveMessage] = useState('');
  const [savingGiaiTrinh, setSavingGiaiTrinh] = useState(false);
  const [loadingGiaiTrinh, setLoadingGiaiTrinh] = useState(false);
  const [giaiTrinhSaveMessage, setGiaiTrinhSaveMessage] = useState('');
  const [giaiTrinhDbError, setGiaiTrinhDbError] = useState('');
  const [giaiTrinhPrintReport, setGiaiTrinhPrintReport] = useState<BbGiaiTrinhPrintReport | null>(null);
  const [pendingGiaiTrinhPrint, setPendingGiaiTrinhPrint] = useState(false);
  const [reportSnapshot, setReportSnapshot] = useState<BbBaoCaoTinhToanPayload | null>(null);
  const [snapshotCalculatedAt, setSnapshotCalculatedAt] = useState('');
  const [snapshotStatus, setSnapshotStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const [calculatingReport, setCalculatingReport] = useState(false);
  const [awaitingSyncReload, setAwaitingSyncReload] = useState(false);
  /** Luôn trỏ dữ liệu mới nhất sau loadBoard — tránh tính lại báo cáo sản lượng với BOM cũ. */
  const reportSourceRef = useRef({
    products,
    materials,
    acceptanceReports,
    productionOrders,
    warehouseMovements,
    warehouseMovementsByDate,
    damagedRecords,
    machineNvlReports,
    mixingReports,
    canTuDongRecords
  });
  reportSourceRef.current = {
    products,
    materials,
    acceptanceReports,
    productionOrders,
    warehouseMovements,
    warehouseMovementsByDate,
    damagedRecords,
    machineNvlReports,
    mixingReports,
    canTuDongRecords
  };
  const applyFreshToReportSource = (
    fresh?: Partial<{
      products: ProductRow[];
      materials: MaterialRow[];
      acceptanceReports: AcceptanceReport[];
      productionOrders: ProductionOrderRow[];
      warehouseMovements: ShiftSummaryWarehouseMovement[];
      warehouseMovementsByDate: ShiftSummaryWarehouseMovement[];
      mixingReports: MixingReport[];
      damagedRecords: WeighingRecord[];
      machineNvlReports: MachineNvlSavedReport[];
    }> | null
  ) => {
    if (!fresh) return;
    reportSourceRef.current = {
      ...reportSourceRef.current,
      ...(fresh.products ? { products: fresh.products } : {}),
      ...(fresh.materials ? { materials: fresh.materials } : {}),
      ...(fresh.acceptanceReports ? { acceptanceReports: fresh.acceptanceReports } : {}),
      ...(fresh.productionOrders ? { productionOrders: fresh.productionOrders } : {}),
      ...(fresh.warehouseMovements ? { warehouseMovements: fresh.warehouseMovements } : {}),
      ...(fresh.warehouseMovementsByDate
        ? { warehouseMovementsByDate: fresh.warehouseMovementsByDate }
        : fresh.warehouseMovements
          ? { warehouseMovementsByDate: fresh.warehouseMovements }
          : {}),
      ...(fresh.mixingReports ? { mixingReports: fresh.mixingReports } : {}),
      ...(fresh.damagedRecords ? { damagedRecords: fresh.damagedRecords } : {}),
      ...(fresh.machineNvlReports ? { machineNvlReports: fresh.machineNvlReports } : {})
    };
  };
  const [calcCanTuDongRecords, setCalcCanTuDongRecords] = useState<CanTuDongRecord[]>([]);
  const [calcDialogOpen, setCalcDialogOpen] = useState(false);
  const [calcNgay, setCalcNgay] = useState('');
  const [calcCa, setCalcCa] = useState('');
  const [calcMay, setCalcMay] = useState('');
  const [calcDialogError, setCalcDialogError] = useState('');
  const [hrStaffNames, setHrStaffNames] = useState<string[]>([]);
  const [selectedMaterialNorm, setSelectedMaterialNorm] = useState<BbMaterialNormFormula | null>(null);
  const [selectedTrongLuongDinhMuc, setSelectedTrongLuongDinhMuc] = useState<BbWarehouseExportLineRow | null>(null);
  const [selectedExportSummary, setSelectedExportSummary] = useState<{
    title: string;
    subtitle: string;
    lines: BbWarehouseExportLineRow[];
  } | null>(null);
  const [selectedMaterialTotalDetail, setSelectedMaterialTotalDetail] = useState<MaterialTotalDetail | null>(
    null
  );
  const [selectedTonDauFormula, setSelectedTonDauFormula] = useState<BbDauCaTonDauFormula | null>(null);
  const [selectedExportWeight, setSelectedExportWeight] = useState<BbExportWeightFormula | null>(null);
  const [thucDungDetail, setThucDungDetail] = useState<{
    line: BbThucDungLineRow;
    metric: BbThucDungDetailMetric;
  } | null>(null);
  const [tongHopDetail, setTongHopDetail] = useState<{
    line: BbTongHopThucXuatLineRow;
    metric: BbTongHopThucXuatDetailMetric;
  } | null>(null);
  const [normDetail, setNormDetail] = useState<{
    orderCode: string;
    ngay: string;
    shiftLabel: string;
    machine: string;
    itemCode: string;
    itemName: string;
    unit: string;
    metric: 'weight' | 'quantity';
    totalKg: number;
    totalQty: number;
    balanceDetail: BbInboundMaterialBalanceDetail | null;
    lines: BbWarehouseExportLineRow[];
  } | null>(null);
  const [inboundBalanceDetail, setInboundBalanceDetail] = useState<{
    metric: BbInboundBalanceDetailMetric;
    itemCode: string;
    itemName: string;
    ngay: string;
    shift: string;
    shiftLabel: string;
    orderCode: string;
    machine: string;
    balanceDetail: BbInboundMaterialBalanceDetail | null;
  } | null>(null);
  const [plasticSummaryDetail, setPlasticSummaryDetail] = useState<BbPlasticSummaryDetailMetric | null>(null);

  const productionShiftOptions = useMemo(
    () => getProductionShiftOptions(shiftSettings as ShiftSetting[]),
    [shiftSettings]
  );

  const scopedGroupKey = (tabId: BbMachineReportTabId, groupKey: string) => `${tabId}:${groupKey}`;
  const isGroupExpanded = (tabId: BbMachineReportTabId, groupKey: string) =>
    !collapsedGroupKeys.has(scopedGroupKey(tabId, groupKey));
  const toggleGroup = (tabId: BbMachineReportTabId, groupKey: string) => {
    const key = scopedGroupKey(tabId, groupKey);
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const orderOptions = useMemo(
    () =>
      buildBbOrderCodeOptions({
        productionOrders,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine,
        includeAllMachines
      }),
    [
      productionOrders,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine,
      includeAllMachines
    ]
  );

  const orderOptionCodes = useMemo(() => new Set(orderOptions.map(option => option.code)), [orderOptions]);

  useEffect(() => {
    setOrderCodeFilter(prev => prev.filter(code => orderOptionCodes.has(code)));
  }, [orderOptionCodes]);

  const scopedProductionOrders = useMemo(
    () =>
      orderCodeFilter.length === 0
        ? productionOrders
        : productionOrders.filter(order => orderCodeFilter.includes(order.code)),
    [productionOrders, orderCodeFilter]
  );

  const reportSnapshotKey = useMemo(
    () =>
      buildBbBaoCaoTinhToanStableKey({
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        sanLuongSource,
        includeAllMachines,
        orderCodes: orderCodeFilter
      }),
    [dateFrom, dateTo, shiftFilter, machineFilter, sanLuongSource, includeAllMachines, orderCodeFilter]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSnapshot = async () => {
      setSnapshotStatus('loading');
      setSnapshotMessage('');
      setReportSnapshot(null);
      setSnapshotCalculatedAt('');
      try {
        const params = new URLSearchParams();
        params.set('khoa_on_dinh', reportSnapshotKey);
        const res = await fetch(`/api/bb-bao-cao-tinh-toan?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const errText = String(data?.error || 'Không tải được bản tính toán đã lưu.');
          const tableMissing = /chưa tồn tại|PGRST205|bb_bao_cao_tinh_toan/i.test(errText);
          setSnapshotStatus(tableMissing ? 'missing' : 'error');
          setSnapshotMessage(
            tableMissing
              ? 'Bảng bb_bao_cao_tinh_toan chưa có trên Supabase. Chạy supabase-bb-bao-cao-tinh-toan.sql rồi bấm «Tính toán».'
              : errText
          );
          return;
        }
        const item = data?.item;
        const payload = item?.payload;
        if (item && isBbBaoCaoTinhToanPayload(payload)) {
          setReportSnapshot(payload);
          setSnapshotCalculatedAt(String(item.calculated_at || item.updated_at || ''));
          setSnapshotStatus('ready');
          return;
        }
        setSnapshotStatus('missing');
        setSnapshotMessage('Chưa có bản tính toán cho bộ lọc này. Bấm «Tính toán» để tạo và lưu DB.');
      } catch (error) {
        if (cancelled) return;
        setSnapshotStatus('error');
        setSnapshotMessage(error instanceof Error ? error.message : 'Lỗi tải bản tính toán.');
      }
    };
    void loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [reportSnapshotKey]);

  /** Tải phiếu cân khi xem snapshot cân tự động (banner live + tab cân thực tế). */
  useEffect(() => {
    if (sanLuongSource !== 'can-tu-dong') return;
    if (!dateFrom && !dateTo) return;
    let cancelled = false;
    void fetchCanTuDongSlimRecords({ from: dateFrom, to: dateTo })
      .then(records => {
        if (!cancelled) setCalcCanTuDongRecords(records);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sanLuongSource, dateFrom, dateTo, reportSnapshotKey]);

  const openCalcDialog = () => {
    if (calculatingReport || isLoading || snapshotStatus === 'loading') return;
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    setCalcNgay(String(dateFrom || dateTo || todayIso).trim());
    setCalcCa(shiftFilter && shiftFilter !== 'all' ? String(shiftFilter).trim() : '');
    setCalcMay(machineFilter && machineFilter !== 'all' ? String(machineFilter).trim() : '');
    setCalcDialogError('');
    setCalcDialogOpen(true);
  };

  const calculateAndSaveReport = async (scope: {
    dateFrom: string;
    dateTo: string;
    shiftFilter: string;
    machineFilter: string;
    selectedMachine: { code?: string; name?: string } | null;
  }) => {
    if (calculatingReport) return;
    const source = reportSourceRef.current;
    const liveProducts = source.products;
    const liveMaterials = source.materials;
    const liveAcceptanceReports = source.acceptanceReports;
    const liveWarehouseMovements = source.warehouseMovements;
    const liveWarehouseMovementsByDate = source.warehouseMovementsByDate ?? source.warehouseMovements;
    const liveProductionOrders =
      orderCodeFilter.length === 0
        ? source.productionOrders
        : source.productionOrders.filter(order => orderCodeFilter.includes(order.code));
    setCalculatingReport(true);
    setSnapshotMessage('');
    try {
      let scopedCanTuDongRecords = source.canTuDongRecords;
      if (sanLuongSource === 'can-tu-dong') {
        scopedCanTuDongRecords = await fetchCanTuDongSlimRecords({
          from: scope.dateFrom,
          to: scope.dateTo
        });
        setCalcCanTuDongRecords(scopedCanTuDongRecords);
        void syncCanTuDongTongHop({
          from: scope.dateFrom,
          to: scope.dateTo,
          rebuild: true
        }).catch(() => undefined);
      }

      let acceptanceNvlDinhMucByReportId = new Map<
        string,
        ReturnType<typeof mapAcceptanceNvlDinhMucRowsToNplItems>
      >();

      const scopedAcceptanceReports = liveAcceptanceReports.filter(report => {
        if (!isAcceptanceThanhPhamKhoReport(report, liveProducts)) return false;
        const ngay = parseProductionOrderFilterDate(report.ngay) || String(report.ngay || '').trim();
        if (ngay < scope.dateFrom || ngay > scope.dateTo) return false;
        if (!shiftNamesMatch(report.ca, scope.shiftFilter)) return false;
        return machineValueMatchesFilter(
          scope.machineFilter,
          scope.selectedMachine,
          report.ma_may,
          report.ten_may
        );
      });

      const reportIds = [
        ...new Set(scopedAcceptanceReports.map(report => String(report.id || '').trim()).filter(Boolean))
      ];

      if (reportIds.length > 0) {
        const nvlRes = await fetch(
          `/api/bao-cao-san-luong-nvl-dinh-muc?ids=${encodeURIComponent(reportIds.join(','))}`
        );
        const nvlData = await nvlRes.json().catch(() => ({}));
        if (nvlRes.ok) {
          const byId =
            nvlData.by_id && typeof nvlData.by_id === 'object'
              ? (nvlData.by_id as Record<string, unknown[]>)
              : null;
          if (byId) {
            for (const [id, rows] of Object.entries(byId)) {
              const items = mapAcceptanceNvlDinhMucRowsToNplItems(Array.isArray(rows) ? rows : []);
              if (items.length > 0) acceptanceNvlDinhMucByReportId.set(id, items);
            }
          } else if (reportIds.length === 1 && Array.isArray(nvlData.items)) {
            const items = mapAcceptanceNvlDinhMucRowsToNplItems(nvlData.items);
            if (items.length > 0) acceptanceNvlDinhMucByReportId.set(reportIds[0], items);
          }
        }
      }

      // Danh sách hiển thị luôn đủ theo npl_phan_tram; NVL không có trong
      // snapshot/BOM phiếu chỉ được bổ sung với SL/TL = 0.
      acceptanceNvlDinhMucByReportId = refreshAcceptanceNvlDinhMucFromProductBom({
        reports: scopedAcceptanceReports,
        products: liveProducts,
        existingByReportId: acceptanceNvlDinhMucByReportId
      });

      const snapshotKey = buildBbBaoCaoTinhToanStableKey({
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        shiftFilter: scope.shiftFilter,
        machineFilter: scope.machineFilter,
        sanLuongSource,
        includeAllMachines,
        orderCodes: orderCodeFilter
      });

      const payload = buildBbMachineReportSnapshot({
        productionOrders: liveProductionOrders,
        products: liveProducts,
        materials: liveMaterials,
        machines,
        warehouseMovements: liveWarehouseMovements,
        warehouseMovementsByDate: liveWarehouseMovementsByDate,
        damagedRecords: source.damagedRecords,
        machineNvlReports: source.machineNvlReports,
        mixingReports: source.mixingReports,
        acceptanceReports: liveAcceptanceReports,
        acceptanceNvlDinhMucByReportId,
        canTuDongRecords: scopedCanTuDongRecords,
        shiftSettings,
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        shiftFilter: scope.shiftFilter,
        machineFilter: scope.machineFilter,
        selectedMachine: scope.selectedMachine,
        includeAllMachines,
        sanLuongSource
      });
      const body = {
        khoa_on_dinh: snapshotKey,
        ngay_tu: scope.dateFrom || '',
        ngay_den: scope.dateTo || '',
        ca: scope.shiftFilter || 'all',
        may: scope.machineFilter || 'all',
        nguon_san_luong: sanLuongSource || 'acceptance',
        include_all_machines: Boolean(includeAllMachines),
        ma_lenh_filter: orderCodeFilter,
        payload
      };
      const res = await fetch('/api/bb-bao-cao-tinh-toan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      const snapshotOk = res.ok;
      const snapshotError = snapshotOk
        ? ''
        : String(data?.error || 'Không lưu được bb_bao_cao_tinh_toan.');

      // Tab «Dữ liệu trong lệnh SX» → bc_lsx — ghi độc lập (không phụ thuộc snapshot JSON).
      const bcLsxItems = buildBcLsxRowsFromOrderGroups({
        khoaOnDinh: snapshotKey,
        orderGroups: payload.orderGroups || [],
        products: liveProducts,
        materials: liveMaterials
      });
      let bcLsxOk = false;
      let bcLsxError = '';
      let bcLsxSavedCount = 0;
      try {
        const bcLsxRes = await fetch('/api/bc-lsx', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: bcLsxItems })
        });
        const bcLsxData = await bcLsxRes.json().catch(() => ({}));
        bcLsxOk = bcLsxRes.ok;
        bcLsxSavedCount = Number(bcLsxData?.total ?? bcLsxItems.length) || 0;
        if (!bcLsxOk) {
          bcLsxError = String(
            bcLsxData?.error || 'Không ghi được bc_lsx. Chạy supabase-bc-lsx.sql trên Supabase.'
          );
        }
      } catch (bcErr) {
        bcLsxError =
          bcErr instanceof Error ? bcErr.message : 'Lỗi gọi /api/bc-lsx (server có thể chưa restart).';
      }

      // Tab «Dữ liệu xuất kho» → du_lieu_xuat_kho — ghi độc lập từ phiếu XK live.
      const exportGroupsForSave = groupBbWarehouseExportLines(
        buildBbWarehouseExportLineRows({
          productionOrders: liveProductionOrders,
          warehouseMovements: liveWarehouseMovements,
          materials: liveMaterials,
          machines,
          shiftSettings,
          dateFrom: scope.dateFrom,
          dateTo: scope.dateTo,
          shiftFilter: scope.shiftFilter,
          machineFilter: scope.machineFilter,
          selectedMachine: scope.selectedMachine,
          includeAllMachines,
          exportMatchScope: 'shift'
        }),
        liveProductionOrders,
        liveProducts,
        liveMaterials,
        shiftSettings
      );
      const duLieuXuatKhoItems = buildDuLieuXuatKhoRowsFromExportGroups({
        khoaOnDinh: snapshotKey,
        exportGroups: exportGroupsForSave
      });
      let xkOk = false;
      let xkError = '';
      let xkSavedCount = 0;
      try {
        const xkRes = await fetch('/api/du-lieu-xuat-kho', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: duLieuXuatKhoItems })
        });
        const xkData = await xkRes.json().catch(() => ({}));
        xkOk = xkRes.ok;
        xkSavedCount = Number(xkData?.total ?? duLieuXuatKhoItems.length) || 0;
        if (!xkOk) {
          xkError = String(
            xkData?.error ||
              'Không ghi được du_lieu_xuat_kho. Chạy supabase-du-lieu-xuat-kho.sql trên Supabase.'
          );
        }
      } catch (xkErr) {
        xkError =
          xkErr instanceof Error
            ? xkErr.message
            : 'Lỗi gọi /api/du-lieu-xuat-kho (server có thể chưa restart).';
      }

      // Tab «Báo cáo dữ liệu tồn đầu ca» → bao_cao_du_lieu_ton_dau_ca (≠ bao_cao_may_nvl_ton).
      const tonDauCaItems = buildBaoCaoDuLieuTonDauCaRowsFromGroups({
        khoaOnDinh: snapshotKey,
        dauCaGroups: payload.dauCaGroups || []
      });
      let tonDauOk = false;
      let tonDauError = '';
      let tonDauSavedCount = 0;
      try {
        const tonDauRes = await fetch('/api/bao-cao-du-lieu-ton-dau-ca', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: tonDauCaItems })
        });
        const tonDauData = await tonDauRes.json().catch(() => ({}));
        tonDauOk = tonDauRes.ok;
        tonDauSavedCount = Number(tonDauData?.total ?? tonDauCaItems.length) || 0;
        if (!tonDauOk) {
          tonDauError = String(
            tonDauData?.error ||
              'Không ghi được bao_cao_du_lieu_ton_dau_ca. Chạy supabase-bao-cao-du-lieu-ton-dau-ca.sql.'
          );
        }
      } catch (tonErr) {
        tonDauError =
          tonErr instanceof Error
            ? tonErr.message
            : 'Lỗi gọi /api/bao-cao-du-lieu-ton-dau-ca (server có thể chưa restart).';
      }

      // Tab «Báo cáo sản lượng» → bao_cao_san_luong (≠ bao_cao_nghiem_thu).
      const sanLuongGroupsForSave = overlayProductNplOnBbSanLuongGroups(
        payload.sanLuongGroups || [],
        liveProducts,
        liveMaterials
      );
      const baoCaoSanLuongItems = buildBaoCaoSanLuongRowsFromGroups({
        khoaOnDinh: snapshotKey,
        sanLuongGroups: sanLuongGroupsForSave
      });
      let slOk = false;
      let slError = '';
      let slSavedCount = 0;
      try {
        const slRes = await fetch('/api/bao-cao-san-luong', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: baoCaoSanLuongItems })
        });
        const slData = await slRes.json().catch(() => ({}));
        slOk = slRes.ok;
        slSavedCount = Number(slData?.total ?? baoCaoSanLuongItems.length) || 0;
        if (!slOk) {
          slError = String(
            slData?.error ||
              'Không ghi được bao_cao_san_luong. Chạy supabase-bao-cao-san-luong.sql trên Supabase.'
          );
        }
      } catch (slErr) {
        slError =
          slErr instanceof Error
            ? slErr.message
            : 'Lỗi gọi /api/bao-cao-san-luong (server có thể chưa restart).';
      }

      // Tab «Dữ liệu trong báo cáo hàng lỗi hỏng» → du_lieu_trong_bao_cao_hang_loi_hong.
      const loiHongItems = buildDuLieuTrongBaoCaoHangLoiHongRowsFromGroups({
        khoaOnDinh: snapshotKey,
        damagedGroups: payload.damagedGroups || [],
        isInsulationMachine: isInsulationMachineText(
          scope.selectedMachine?.name || scope.machineFilter || ''
        )
      });
      let lhOk = false;
      let lhError = '';
      let lhSavedCount = 0;
      try {
        const lhRes = await fetch('/api/du-lieu-trong-bao-cao-hang-loi-hong', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: loiHongItems })
        });
        const lhData = await lhRes.json().catch(() => ({}));
        lhOk = lhRes.ok;
        lhSavedCount = Number(lhData?.total ?? loiHongItems.length) || 0;
        if (!lhOk) {
          lhError = String(
            lhData?.error ||
              'Không ghi được du_lieu_trong_bao_cao_hang_loi_hong. Chạy supabase-du-lieu-trong-bao-cao-hang-loi-hong.sql.'
          );
        }
      } catch (lhErr) {
        lhError =
          lhErr instanceof Error
            ? lhErr.message
            : 'Lỗi gọi /api/du-lieu-trong-bao-cao-hang-loi-hong (server có thể chưa restart).';
      }

      // Tab «Kiểm tồn cuối ca» → du_lieu_trong_bao_cao_kiem_ton_cuoi_ca (≠ bao_cao_may_nvl_ton).
      const kiemTonCuoiItems = buildDuLieuTrongBaoCaoKiemTonCuoiCaRowsFromGroups({
        khoaOnDinh: snapshotKey,
        cuoiCaGroups: payload.cuoiCaGroups || []
      });
      let ktOk = false;
      let ktError = '';
      let ktSavedCount = 0;
      try {
        const ktRes = await fetch('/api/du-lieu-trong-bao-cao-kiem-ton-cuoi-ca', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: kiemTonCuoiItems })
        });
        const ktData = await ktRes.json().catch(() => ({}));
        ktOk = ktRes.ok;
        ktSavedCount = Number(ktData?.total ?? kiemTonCuoiItems.length) || 0;
        if (!ktOk) {
          ktError = String(
            ktData?.error ||
              'Không ghi được du_lieu_trong_bao_cao_kiem_ton_cuoi_ca. Chạy supabase-du-lieu-trong-bao-cao-kiem-ton-cuoi-ca.sql.'
          );
        }
      } catch (ktErr) {
        ktError =
          ktErr instanceof Error
            ? ktErr.message
            : 'Lỗi gọi /api/du-lieu-trong-bao-cao-kiem-ton-cuoi-ca (server có thể chưa restart).';
      }

      // Tab «Thành phẩm đạt nhập kho» → bao_cao_thanh_pham_dat_nhap_kho.
      const thanhPhamItems = buildBaoCaoThanhPhamDatNhapKhoRowsFromGroups({
        khoaOnDinh: snapshotKey,
        orderGroups: payload.orderGroups || []
      });
      let tpOk = false;
      let tpError = '';
      let tpSavedCount = 0;
      try {
        const tpRes = await fetch('/api/bao-cao-thanh-pham-dat-nhap-kho', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: thanhPhamItems })
        });
        const tpData = await tpRes.json().catch(() => ({}));
        tpOk = tpRes.ok;
        tpSavedCount = Number(tpData?.total ?? thanhPhamItems.length) || 0;
        if (!tpOk) {
          tpError = String(
            tpData?.error ||
              'Không ghi được bao_cao_thanh_pham_dat_nhap_kho. Chạy supabase-bao-cao-thanh-pham-dat-nhap-kho.sql.'
          );
        }
      } catch (tpErr) {
        tpError =
          tpErr instanceof Error
            ? tpErr.message
            : 'Lỗi gọi /api/bao-cao-thanh-pham-dat-nhap-kho (server có thể chưa restart).';
      }

      // Tab «Tiêu hao NVL» → bao_cao_tieu_hao_nguyen_vat_lieu.
      const tieuHaoItems = buildBaoCaoTieuHaoNguyenVatLieuRowsFromGroups({
        khoaOnDinh: snapshotKey,
        thucDungGroups: payload.thucDungGroups || []
      });
      let thOk = false;
      let thError = '';
      let thSavedCount = 0;
      try {
        const thRes = await fetch('/api/bao-cao-tieu-hao-nguyen-vat-lieu', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ khoa_on_dinh: snapshotKey, items: tieuHaoItems })
        });
        const thData = await thRes.json().catch(() => ({}));
        thOk = thRes.ok;
        thSavedCount = Number(thData?.total ?? tieuHaoItems.length) || 0;
        if (!thOk) {
          thError = String(
            thData?.error ||
              'Không ghi được bao_cao_tieu_hao_nguyen_vat_lieu. Chạy supabase-bao-cao-tieu-hao-nguyen-vat-lieu.sql.'
          );
        }
      } catch (thErr) {
        thError =
          thErr instanceof Error
            ? thErr.message
            : 'Lỗi gọi /api/bao-cao-tieu-hao-nguyen-vat-lieu (server có thể chưa restart).';
      }

      // Khối KPI «Báo cáo tổng hợp» + «Tổng hợp nhựa» → bao_cao_tong_hop (1 dòng / khóa).
      const tongHopRow = buildBaoCaoTongHopRowFromSummary({
        khoaOnDinh: snapshotKey,
        ngayTu: scope.dateFrom,
        ngayDen: scope.dateTo,
        ca: scope.shiftFilter || 'all',
        may: scope.machineFilter || 'all',
        nguonSanLuong: sanLuongSource || 'acceptance',
        isInsulationMachine: isInsulationMachineText(
          scope.selectedMachine?.name || scope.machineFilter || ''
        ),
        summary: payload.summary
      });
      let thopOk = false;
      let thopError = '';
      try {
        const thopRes = await fetch('/api/bao-cao-tong-hop', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            khoa_on_dinh: snapshotKey,
            items: tongHopRow ? [tongHopRow] : []
          })
        });
        const thopData = await thopRes.json().catch(() => ({}));
        thopOk = thopRes.ok;
        if (!thopOk) {
          thopError = String(
            thopData?.error ||
              'Không ghi được bao_cao_tong_hop. Chạy supabase-bao-cao-tong-hop.sql trên Supabase.'
          );
        }
      } catch (thopErr) {
        thopError =
          thopErr instanceof Error
            ? thopErr.message
            : 'Lỗi gọi /api/bao-cao-tong-hop (server có thể chưa restart).';
      }

      if (
        !snapshotOk &&
        !bcLsxOk &&
        !xkOk &&
        !tonDauOk &&
        !slOk &&
        !lhOk &&
        !ktOk &&
        !tpOk &&
        !thOk &&
        !thopOk
      ) {
        setSnapshotStatus('error');
        setSnapshotMessage(
          [snapshotError, bcLsxError, xkError, tonDauError, slError, lhError, ktError, tpError, thError, thopError]
            .filter(Boolean)
            .join(' · ') || 'Không ghi được bản tính.'
        );
        return;
      }

      const savedPayload = data?.item?.payload;
      setReportSnapshot(
        snapshotOk && isBbBaoCaoTinhToanPayload(savedPayload) ? savedPayload : payload
      );
      setSnapshotCalculatedAt(
        String(data?.item?.calculated_at || new Date().toISOString())
      );
      const allOk =
        snapshotOk && bcLsxOk && xkOk && tonDauOk && slOk && lhOk && ktOk && tpOk && thOk && thopOk;
      setSnapshotStatus(allOk ? 'ready' : 'error');
      setSnapshotMessage(
        allOk
          ? ''
          : [snapshotError, bcLsxError, xkError, tonDauError, slError, lhError, ktError, tpError, thError, thopError]
              .filter(Boolean)
              .join(' · ')
      );
      onApplyCalcScope?.({
        dateFrom: scope.dateFrom,
        dateTo: scope.dateTo,
        shiftFilter: scope.shiftFilter,
        machineFilter: scope.machineFilter
      });
    } catch (error) {
      setSnapshotStatus('error');
      setSnapshotMessage(error instanceof Error ? error.message : 'Lỗi khi tính toán.');
    } finally {
      setCalculatingReport(false);
    }
  };

  const confirmCalcDialog = () => {
    const ngay = String(calcNgay || '').trim();
    const ca = String(calcCa || '').trim();
    const may = String(calcMay || '').trim();
    if (!ngay) {
      setCalcDialogError('Vui lòng chọn Ngày.');
      return;
    }
    if (!ca || ca === 'all') {
      setCalcDialogError('Vui lòng chọn Ca.');
      return;
    }
    if (!may || may === 'all') {
      setCalcDialogError('Vui lòng chọn Máy.');
      return;
    }
    const machineRow = machines.find(machine => machine.code === may) || null;
    setCalcDialogOpen(false);
    setCalcDialogError('');
    void calculateAndSaveReport({
      dateFrom: ngay,
      dateTo: ngay,
      shiftFilter: ca,
      machineFilter: may,
      selectedMachine: machineRow
        ? { code: machineRow.code, name: machineRow.name }
        : { code: may, name: may }
    });
  };

  const buildCurrentSyncScope = () => {
    const ngay = String(dateFrom || dateTo || '').trim();
    const denNgay = String(dateTo || dateFrom || ngay).trim();
    const ca = String(shiftFilter || '').trim();
    const may = String(machineFilter || '').trim();
    const machineRow = machines.find(machine => machine.code === may) || null;
    return {
      dateFrom: ngay,
      dateTo: denNgay,
      shiftFilter: ca,
      machineFilter: may,
      selectedMachine: machineRow
        ? { code: machineRow.code, name: machineRow.name }
        : may && may !== 'all'
          ? { code: may, name: may }
          : selectedMachine
    };
  };

  const syncLatestReport = async () => {
    if (calculatingReport || isLoading || awaitingSyncReload) return;
    const scope = buildCurrentSyncScope();
    if (!scope.dateFrom) {
      setSnapshotMessage('Chọn Ngày trên bộ lọc trước khi đồng bộ.');
      return;
    }
    if (!scope.shiftFilter || scope.shiftFilter === 'all') {
      setSnapshotMessage('Chọn Ca trên bộ lọc trước khi đồng bộ.');
      return;
    }
    if (!scope.machineFilter || scope.machineFilter === 'all') {
      setSnapshotMessage('Chọn Máy trên bộ lọc trước khi đồng bộ.');
      return;
    }

    setAwaitingSyncReload(true);
    setSnapshotMessage('Đang tải phiếu xuất kho, Thành phần SP, Tổng kg kho NVL...');
    try {
      if (onReloadSourceData) {
        const fresh = await onReloadSourceData();
        applyFreshToReportSource(fresh);
      }
      await calculateAndSaveReport(scope);
    } catch (error) {
      setSnapshotMessage(error instanceof Error ? error.message : 'Không đồng bộ được dữ liệu.');
    } finally {
      setAwaitingSyncReload(false);
    }
  };

  /** Xem trước in: tải lại phiếu XK + Tổng kg + tính lại tab Báo cáo sản lượng. */
  const syncPrintPreviewData = async () => {
    if (printPreviewSyncing || isLoading || calculatingReport) return;
    setPrintPreviewSyncing(true);
    setPrintPreviewSyncMessage('Đang tải phiếu xuất kho, Thành phần SP và Tổng kg mới nhất...');
    try {
      pendingPrintSyncBumpRef.current = true;
      if (onReloadSourceData) {
        const fresh = await onReloadSourceData();
        applyFreshToReportSource(fresh);
      } else if (onReloadWarehouseData) {
        const fresh = await onReloadWarehouseData();
        applyFreshToReportSource(fresh);
      } else {
        pendingPrintSyncBumpRef.current = false;
      }
      const scope = buildCurrentSyncScope();
      if (
        scope.dateFrom &&
        scope.shiftFilter &&
        scope.shiftFilter !== 'all' &&
        scope.machineFilter &&
        scope.machineFilter !== 'all'
      ) {
        await calculateAndSaveReport(scope);
      }
      if (!pendingPrintSyncBumpRef.current) {
        setPrintPreviewDataKey(key => key + 1);
      }
      setPrintPreviewSyncMessage(
        'Đã đồng bộ — xuất kho, Báo cáo sản lượng và mục 3.1/3.2 dùng dữ liệu mới nhất.'
      );
      window.setTimeout(() => setPrintPreviewSyncMessage(''), 5000);
    } catch (error) {
      pendingPrintSyncBumpRef.current = false;
      setPrintPreviewSyncMessage(
        error instanceof Error ? error.message : 'Không đồng bộ được dữ liệu xuất kho.'
      );
    } finally {
      setPrintPreviewSyncing(false);
    }
  };

  const emptySnapshot = useMemo(() => emptyBbBaoCaoTinhToanPayload(), []);
  const activeSnapshot = reportSnapshot || emptySnapshot;

  // Không tự tính khi vào trang — chỉ hiển thị bản đã lưu (hoặc rỗng).
  const orderRows = activeSnapshot.orderRows;
  const orderGroups = activeSnapshot.orderGroups;
  /** Tab xuất kho: luôn đọc phiếu XK mới nhất từ API (không dùng snapshot cũ). */
  const exportRows = useMemo(
    () =>
      buildBbWarehouseExportLineRows({
        productionOrders,
        warehouseMovements,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine,
        includeAllMachines,
        exportMatchScope: 'shift'
      }),
    [
      productionOrders,
      warehouseMovements,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine,
      includeAllMachines
    ]
  );
  const exportGroups = useMemo(
    () => groupBbWarehouseExportLines(exportRows, productionOrders, products, materials, shiftSettings),
    [exportRows, productionOrders, products, materials, shiftSettings]
  );

  useEffect(() => {
    if (!pendingPrintSyncBumpRef.current) return;
    pendingPrintSyncBumpRef.current = false;
    setPrintPreviewDataKey(key => key + 1);
  }, [exportRows, materials, warehouseMovements]);

  const damagedRows = activeSnapshot.damagedRows;
  const damagedGroups = activeSnapshot.damagedGroups;
  const cuoiCaRows = activeSnapshot.cuoiCaRows;
  const cuoiCaGroups = activeSnapshot.cuoiCaGroups;
  const dauCaRows = activeSnapshot.dauCaRows;
  const dauCaGroups = activeSnapshot.dauCaGroups;
  /** Snapshot cũ vẫn phủ đủ npl_phan_tram ngay sau khi bấm Áp dụng. */
  const sanLuongGroups = useMemo(
    () => overlayProductNplOnBbSanLuongGroups(activeSnapshot.sanLuongGroups, products, materials),
    [activeSnapshot.sanLuongGroups, products, materials]
  );
  /** Gộp mã SP trùng + gắn SL/TL thực tế + KL nhựa+phụ gia từ /kho-hang (cả snapshot cũ). */
  const orderGroupsMerged = useMemo(() => {
    const lines = orderGroups.flatMap(group => group.lines);
    if (lines.length === 0) return orderGroups;
    return groupBbProductionOrderLines(
      enrichBbProductionOrderRowsPlasticNormFromProducts(
        enrichBbProductionOrderRowsFromSanLuong(lines, sanLuongGroups),
        products
      )
    );
  }, [orderGroups, products, sanLuongGroups]);
  /** SL/TL thực tế tab thành phẩm nhập kho — luôn đồng bộ tab Báo cáo sản lượng. */
  const thanhPhamNhapKhoOrderGroups = orderGroupsMerged;
  const inboundRows = activeSnapshot.inboundRows;
  const thucDungRows = activeSnapshot.thucDungRows;
  const thucDungRowsLive = useMemo(() => {
    const withXuat = syncBbThucDungRowsXuatTrongNgayFromExportTab({
      rows: thucDungRows,
      productionOrders,
      warehouseMovements,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine,
      includeAllMachines
    });
    return syncBbThucDungRowsTonCuoiFromCuoiCaTab({
      rows: withXuat,
      machineNvlReports,
      cuoiCaGroups,
      shiftSettings
    });
  }, [
    thucDungRows,
    productionOrders,
    warehouseMovements,
    materials,
    machines,
    machineNvlReports,
    cuoiCaGroups,
    shiftSettings,
    dateFrom,
    dateTo,
    shiftFilter,
    machineFilter,
    selectedMachine,
    includeAllMachines
  ]);
  const thucDungGroups = useMemo(
    () => groupBbThucDungLines(thucDungRowsLive),
    [thucDungRowsLive]
  );
  const tongHopThucXuatGroups = activeSnapshot.tongHopThucXuatGroups;
  const tongGroups = activeSnapshot.tongGroups;
  const mixingGroups = activeSnapshot.mixingGroups;
  const danhGiaGroups = activeSnapshot.danhGiaGroups;

  useEffect(() => {
    let cancelled = false;
    const loadLyDo = async () => {
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await fetch(`/api/bb-bao-cao-ly-do?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          console.warn('Không tải được lý do BB:', data?.error || res.statusText);
          return;
        }
        const items = Array.isArray(data?.items) ? data.items : [];
        const next: Record<string, BbBaoCaoLyDoRow> = {};
        for (const raw of items) {
          const khoa = String(raw?.khoa_on_dinh || '').trim();
          if (!khoa) continue;
          next[khoa] = {
            id: raw.id,
            khoa_on_dinh: khoa,
            ngay: String(raw.ngay || ''),
            ca: String(raw.ca || ''),
            may: String(raw.may || ''),
            ma_lenh: String(raw.ma_lenh || ''),
            ma_sp: String(raw.ma_sp || ''),
            ten_sp: raw.ten_sp,
            group_key: raw.group_key,
            line_key: raw.line_key,
            ly_do: String(raw.ly_do || ''),
            ghi_chu: String(raw.ghi_chu || '')
          };
        }
        setDbLyDoByStableKey(next);
      } catch (error) {
        if (!cancelled) console.warn('Lỗi tải lý do BB:', error);
      }
    };
    const loadPhanTich = async () => {
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await fetch(`/api/bb-phan-tich-danh-gia?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          console.warn('Không tải được phân tích đánh giá:', data?.error || res.statusText);
          return;
        }
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length === 0) return;
        setPhanTichMap(prev => {
          const next = { ...prev };
          for (const raw of items) {
            const groupKey = String(raw?.group_key || raw?.ma_lenh || '').trim();
            const noiDung = String(raw?.noi_dung || '').trim();
            if (!groupKey || !noiDung) continue;
            // DB ưu tiên hơn localStorage khi có nội dung đã lưu.
            next[groupKey] = noiDung;
          }
          persistBbPhanTichMap(next);
          return next;
        });
      } catch (error) {
        if (!cancelled) console.warn('Lỗi tải phân tích đánh giá:', error);
      }
    };
    const loadGiaiTrinh = async () => {
      setLoadingGiaiTrinh(true);
      setGiaiTrinhDbError('');
      try {
        const params = new URLSearchParams();
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await fetch(`/api/bb-giai-trinh?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const message = String(data?.error || 'Không tải được giải trình từ DB.');
          setGiaiTrinhDbError(message);
          setGiaiTrinhMap({});
          console.warn('Không tải được giải trình:', message);
          return;
        }
        const items = Array.isArray(data?.items) ? data.items : [];
        setGiaiTrinhMap(mapBbGiaiTrinhItemsFromDb(items));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Lỗi tải giải trình từ DB.';
          setGiaiTrinhDbError(message);
          setGiaiTrinhMap({});
          console.warn('Lỗi tải giải trình:', error);
        }
      } finally {
        if (!cancelled) setLoadingGiaiTrinh(false);
      }
    };
    void loadLyDo();
    void loadPhanTich();
    void loadGiaiTrinh();
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);
  const exportLinkStats = useMemo(() => {
    let matchedLines = 0;
    let fallbackLines = 0;
    for (const row of exportRows) {
      if (row.matchedByOrder) matchedLines += 1;
      else fallbackLines += 1;
    }
    return { matchedLines, fallbackLines, totalLines: exportRows.length };
  }, [exportRows]);
  const damagedGroupsWithMixing = useMemo(() => {
    return damagedGroups.map(group => {
      const mixingLines = group.mixingLines || [];
      return {
        ...group,
        mixingLines,
        mixingLineCount: group.mixingLineCount ?? mixingLines.length
      };
    });
  }, [damagedGroups]);
  // Tab thực xuất dùng: dòng NVL lấy từ báo cáo trộn (đã gộp tỉ lệ).
  const warehouseMovementsForXuatDetail = warehouseMovements;

  const closeMetricDetail = () => {
    setThucDungDetail(null);
    setTongHopDetail(null);
  };
  const inboundBalanceDetailView = useMemo<BbInboundBalanceDetailBag | null>(() => {
    if (!inboundBalanceDetail) return null;
    return buildBbInboundBalanceMetricDetail({
      metric: inboundBalanceDetail.metric,
      itemCode: inboundBalanceDetail.itemCode,
      itemName: inboundBalanceDetail.itemName,
      ngay: inboundBalanceDetail.ngay,
      shift: inboundBalanceDetail.shift,
      shiftLabel: inboundBalanceDetail.shiftLabel,
      orderCode: inboundBalanceDetail.orderCode,
      machine: inboundBalanceDetail.machine,
      balanceDetail: inboundBalanceDetail.balanceDetail,
      machineNvlReports,
      warehouseMovements,
      acceptanceReports,
      materials,
      shiftSettings
    });
  }, [inboundBalanceDetail, machineNvlReports, warehouseMovements, acceptanceReports, materials, shiftSettings]);
  const orderTotals = useMemo(() => {
    if (reportSnapshot?.summary?.orderTotals) return reportSnapshot.summary.orderTotals;
    return sumBbProductionOrderTotals(orderRows);
  }, [reportSnapshot, orderRows]);
  const exportTotalKg = useMemo(() => {
    if (reportSnapshot?.summary && Number.isFinite(reportSnapshot.summary.exportTotalKg)) {
      return reportSnapshot.summary.exportTotalKg;
    }
    return sumBbWarehouseExportWeightKg(exportRows);
  }, [reportSnapshot, exportRows]);
  const exportWeightByKind = useMemo(() => {
    if (reportSnapshot?.summary?.exportWeightByKind) return reportSnapshot.summary.exportWeightByKind;
    return sumBbWarehouseExportWeightKgByKind(exportRows);
  }, [reportSnapshot, exportRows]);
  /** Banner «Tổng hợp nhựa»: ưu tiên số đã lưu trong snapshot (không cộng live phiếu XK). */
  const exportRowsForPlasticBanner = exportRows;
  const exportWeightByKindForPlasticBanner = exportWeightByKind;
  /** Lấy toàn bộ KG: tổng tất cả dòng cột «Tổng (kg)» trong Lệnh sản xuất theo bộ lọc. */
  const plasticRequiredWeightKg = useMemo(() => {
    if (reportSnapshot?.summary && Number.isFinite(reportSnapshot.summary.plasticRequiredWeightKg)) {
      return reportSnapshot.summary.plasticRequiredWeightKg;
    }
    return sumBbProductionOrderPlasticRequiredKg(orderRows);
  }, [reportSnapshot, orderRows]);
  const exportMaterialTotals = useMemo(
    () => aggregateBbWarehouseExportByMaterial(exportRows, materials),
    [exportRows, materials]
  );
  const exportMaterialTotalKg = useMemo(
    () => exportMaterialTotals.reduce((sum, row) => sum + (row.weightKg > 0 ? row.weightKg : 0), 0),
    [exportMaterialTotals]
  );
  /** Tổng NVL đã xuất — khớp phiếu: nhựa = ĐVT kg (cột Quy về kg); khác = ĐVT ≠ kg. */
  const exportMaterialTotalsByUnit = useMemo(() => {
    let kgWeight = 0;
    let otherWeight = 0;
    for (const row of exportMaterialTotals) {
      const weight = row.weightKg > 0 ? row.weightKg : 0;
      if (isWarehouseKgUnit(row.unit || '')) {
        kgWeight += weight;
      } else if (weight > 0) {
        otherWeight += weight;
      }
    }
    return {
      kgWeight,
      otherWeight,
      totalWeight: kgWeight + otherWeight
    };
  }, [exportMaterialTotals]);
  const exportTotalNormKg = useMemo(
    () => exportGroups.reduce((sum, group) => sum + group.totalNormWeightKg, 0),
    [exportGroups]
  );
  const exportTotalTrongLuongDinhMucKg = useMemo(
    () =>
      exportGroups.reduce(
        (sum, group) => sum + sumTrongLuongDinhMucKg(group.productGroups.flatMap(pg => pg.lines || [])),
        0
      ),
    [exportGroups]
  );
  const exportFlatSheetRows = useMemo(
    () =>
      exportGroups.flatMap(group => {
        const groupLines = group.productGroups.flatMap(pg => pg.lines || []);
        const groupMaterialTotals = sumTrongLuongDinhMucKgByMaterial(groupLines);
        return group.productGroups.flatMap(productGroup =>
          (productGroup.lines || []).map(row => ({
            key: row.key,
            ngay: group.ngay,
            shiftLabel: group.shiftLabel || group.shift,
            orderCode: group.orderCode,
            machine: group.machine,
            unmatchedCount: group.unmatchedCount,
            lineCount: group.lineCount,
            productCode: productGroup.productCode,
            productName: productGroup.productName,
            row,
            groupMaterialTotals
          }))
        );
      }),
    [exportGroups]
  );
  const damagedTotalKg = useMemo(() => sumBbDamagedGoodsWeightKg(damagedRows), [damagedRows]);
  const isInsulationMachine = isInsulationMachineText(
    selectedMachine?.name,
    selectedMachine?.code,
    machineFilter !== 'all' ? machineFilter : undefined
  );
  /** Ô «Báo cáo lỗi hỏng»: TL nhựa = SP lỗi trừ rác màng (ưu tiên snapshot.summary). */
  const damagedWeightByKind = useMemo(() => {
    if (reportSnapshot?.summary?.damagedWeightByKind) {
      return reportSnapshot.summary.damagedWeightByKind;
    }
    return sumBbDamagedGoodsWeightKgByKind(damagedRows, { isInsulationMachine });
  }, [reportSnapshot, damagedRows, isInsulationMachine]);
  const cuoiCaTotalKg = useMemo(() => {
    if (reportSnapshot?.summary && Number.isFinite(reportSnapshot.summary.cuoiCaTotalKg)) {
      return reportSnapshot.summary.cuoiCaTotalKg;
    }
    return sumBbCuoiCaWeightKg(cuoiCaRows);
  }, [reportSnapshot, cuoiCaRows]);
  const cuoiCaWeightByKind = useMemo(() => {
    if (reportSnapshot?.summary?.cuoiCaWeightByKind) return reportSnapshot.summary.cuoiCaWeightByKind;
    return sumBbCuoiCaWeightKgByKind(cuoiCaRows);
  }, [reportSnapshot, cuoiCaRows]);
  const dauCaTotalKg = useMemo(() => {
    if (reportSnapshot?.summary && Number.isFinite(reportSnapshot.summary.dauCaTotalKg)) {
      return reportSnapshot.summary.dauCaTotalKg;
    }
    return sumBbDauCaWeightKg(dauCaRows);
  }, [reportSnapshot, dauCaRows]);
  const dauCaWeightByKind = useMemo(() => {
    if (reportSnapshot?.summary?.dauCaWeightByKind) return reportSnapshot.summary.dauCaWeightByKind;
    return sumBbDauCaWeightKgByKind(dauCaRows);
  }, [reportSnapshot, dauCaRows]);
  const sanLuongTotals = useMemo(() => sumBbSanLuongTotals(sanLuongGroups), [sanLuongGroups]);
  const scopedCanTuDongRecords = useMemo(() => {
    if (sanLuongSource !== 'can-tu-dong') return [];
    const sourceRecords = calcCanTuDongRecords.length > 0 ? calcCanTuDongRecords : canTuDongRecords;
    const canTuDongDateTo = dateTo ? shiftIsoDateByDays(dateTo, 1) || dateTo : dateTo;
    return filterCanTuDongRecordsForBoard(sourceRecords, {
      shiftFilter,
      dateFrom,
      dateTo: canTuDongDateTo,
      machineFilter,
      selectedMachine
    });
  }, [
    sanLuongSource,
    calcCanTuDongRecords,
    canTuDongRecords,
    dateFrom,
    dateTo,
    shiftFilter,
    machineFilter,
    selectedMachine
  ]);
  const canTuDongTongHopBannerLive = useMemo(() => {
    if (sanLuongSource !== 'can-tu-dong') return null;
    return computeCanTuDongTongHopBannerTotals(scopedCanTuDongRecords, products);
  }, [sanLuongSource, scopedCanTuDongRecords, products]);
  const canTuDongTongHopBanner = useMemo(() => {
    if (sanLuongSource !== 'can-tu-dong') return null;
    if ((canTuDongTongHopBannerLive?.totals.so_cuon ?? 0) > 0) return canTuDongTongHopBannerLive;
    const savedTotals = activeSnapshot.summary.canTuDongTongHopTotals;
    if (savedTotals && savedTotals.so_cuon > 0) {
      const savedFormulas = activeSnapshot.summary.canTuDongTongHopFormulas;
      return {
        detailRows: [],
        totals: savedTotals,
        formulas: savedFormulas ?? explainCanTuDongTongHopRowFormulas(savedTotals)
      };
    }
    return canTuDongTongHopBannerLive;
  }, [
    sanLuongSource,
    canTuDongTongHopBannerLive,
    activeSnapshot.summary.canTuDongTongHopTotals,
    activeSnapshot.summary.canTuDongTongHopFormulas
  ]);
  /**
   * Tổng sản lượng trên banner KPI.
   * Chỉ dùng summary đã lưu khi có `reportSnapshot` thật (không dùng emptySnapshot {0,0}
   * vì object rỗng vẫn truthy và chặn số live từ cân tự động).
   */
  const displaySanLuongTotals = useMemo(() => {
    if (reportSnapshot?.summary) {
      const saved =
        reportSnapshot.summary.displaySanLuongTotals ??
        (sanLuongSource === 'can-tu-dong'
          ? reportSnapshot.summary.canTuDongSanLuongTotals
          : undefined);
      if (saved && ((saved.quantity ?? 0) > 0 || (saved.weightKg ?? 0) > 0)) {
        return saved;
      }
    }
    if (
      sanLuongSource === 'can-tu-dong' &&
      canTuDongTongHopBanner &&
      (canTuDongTongHopBanner.totals.so_cuon ?? 0) > 0
    ) {
      return {
        quantity: canTuDongTongHopBanner.totals.so_cuon,
        weightKg:
          (canTuDongTongHopBanner.totals.nhua_tt_kg || 0) +
          (canTuDongTongHopBanner.totals.khoi_luong_mang_kg || 0)
      };
    }
    return sanLuongTotals;
  }, [reportSnapshot, sanLuongSource, canTuDongTongHopBanner, sanLuongTotals]);
  const insulationFilmWeightKg = canTuDongTongHopBanner
    ? canTuDongTongHopBanner.totals.khoi_luong_mang_kg
    : reportSnapshot?.summary?.insulationFilmWeightKg ?? 0;
  const insulationPlasticNorm = canTuDongTongHopBanner
    ? {
        weightKg: canTuDongTongHopBanner.totals.nhua_dm_kg,
        counted: canTuDongTongHopBanner.totals.so_cuon
      }
    : reportSnapshot?.summary?.insulationPlasticNorm ?? {
        weightKg: 0,
        counted: 0
      };
  const displayedPlasticWeightKg = canTuDongTongHopBanner
    ? canTuDongTongHopBanner.totals.nhua_tt_kg
    : isInsulationMachine
      ? displaySanLuongTotals.weightKg - insulationFilmWeightKg
      : displaySanLuongTotals.weightKg;
  const canTuDongBannerNhuaTtFormula = canTuDongTongHopBanner?.formulas.nhuaTt ?? '';
  const canTuDongBannerNhuaDmFormula = canTuDongTongHopBanner?.formulas.nhuaDm ?? '';
  const plasticDamagedWeightKg = damagedWeightByKind.plasticKg;
  /** Xuất thực dùng = Tồn đầu ca + Xuất nhựa (ca) − Tồn cuối ca. */
  const plasticUsedLtKg =
    exportWeightByKindForPlasticBanner.plasticKg +
    dauCaWeightByKind.plasticKg -
    cuoiCaWeightByKind.plasticKg;
  /** Chênh lệch = TL nhựa TP (trừ màng nếu cách nhiệt) − Xuất thực dùng + Lỗi. */
  const plasticDifferenceWeightKg = displayedPlasticWeightKg - plasticUsedLtKg + plasticDamagedWeightKg;
  const plasticSummaryRow = {
    requiredKg: plasticRequiredWeightKg,
    exportKg: exportWeightByKindForPlasticBanner.plasticKg,
    /** TL nhựa thành phẩm = cột TL nhựa (máy cách nhiệt: đã trừ màng). */
    finishedKg: displayedPlasticWeightKg,
    stockNetKg: plasticUsedLtKg,
    damagedKg: plasticDamagedWeightKg,
    differenceKg: plasticDifferenceWeightKg
  };
  const plasticBannerForNhua = {
    tongNhuaThanhPhamKg: plasticSummaryRow.finishedKg,
    tongNhuaLoiKg: plasticSummaryRow.damagedKg
  };
  const resolveKlNhuaTtLoiKg = (row: BbThucDungLineRow) =>
    resolveBbThucDungKlNhuaTtLoiKg(row, plasticBannerForNhua).klThucTePlusLoiKg;
  const resolveChenhLechKg = (row: BbThucDungLineRow) =>
    resolveBbThucDungChenhLechKg(row, plasticBannerForNhua);
  const thucDungDetailView = useMemo<BbThucDungDetailView | null>(() => {
    if (tongHopDetail) {
      return buildBbTongHopThucXuatMetricDetail({
        line: tongHopDetail.line,
        metric: tongHopDetail.metric,
        machineNvlReports,
        warehouseMovements: warehouseMovementsForXuatDetail,
        materials,
        shiftSettings
      });
    }
    if (!thucDungDetail) return null;
    return buildBbThucDungMetricDetail({
      line: thucDungDetail.line,
      metric: thucDungDetail.metric,
      mixingReports,
      machineNvlReports,
      warehouseMovements: warehouseMovementsForXuatDetail,
      materials,
      shiftSettings,
      plasticBanner: {
        tongNhuaThanhPhamKg: plasticSummaryRow.finishedKg,
        tongNhuaLoiKg: plasticSummaryRow.damagedKg
      }
    });
  }, [
    tongHopDetail,
    thucDungDetail,
    mixingReports,
    machineNvlReports,
    warehouseMovementsForXuatDetail,
    materials,
    shiftSettings,
    plasticSummaryRow.finishedKg,
    plasticSummaryRow.damagedKg
  ]);
  /** Chênh lệch nhựa theo định mức của máy cách nhiệt = Định mức − Thành phẩm. */
  const insulationPlasticNormDifferenceKg = insulationPlasticNorm.weightKg - plasticSummaryRow.finishedKg;
  const plasticSummaryDetailView = useMemo<BbPlasticSummaryDetailView | null>(() => {
    if (!plasticSummaryDetail) return null;
    return buildBbPlasticSummaryDetailView({
      metric: plasticSummaryDetail,
      orderRows,
      exportRows: exportRowsForPlasticBanner,
      damagedRows,
      sanLuongGroups,
      dauCaPlasticKg: dauCaWeightByKind.plasticKg,
      cuoiCaPlasticKg: cuoiCaWeightByKind.plasticKg,
      exportPlasticKg: exportWeightByKindForPlasticBanner.plasticKg,
      requiredKg: plasticSummaryRow.requiredKg,
      finishedKg: plasticSummaryRow.finishedKg,
      stockNetKg: plasticSummaryRow.stockNetKg,
      damagedKg: plasticSummaryRow.damagedKg,
      differenceKg: plasticSummaryRow.differenceKg,
      normKg: insulationPlasticNorm.weightKg,
      normDiffKg: insulationPlasticNormDifferenceKg,
      insulationFilmWeightKg,
      displaySanLuongWeightKg: displaySanLuongTotals.weightKg,
      displaySanLuongQuantity: displaySanLuongTotals.quantity,
      isInsulationMachine,
      sanLuongSource: sanLuongSource || 'acceptance',
      products,
      canTuDongRecords: scopedCanTuDongRecords,
      canTuDongNhuaTtFormula: canTuDongBannerNhuaTtFormula,
      canTuDongNhuaDmFormula: canTuDongBannerNhuaDmFormula
    });
  }, [
    plasticSummaryDetail,
    orderRows,
    exportRowsForPlasticBanner,
    damagedRows,
    sanLuongGroups,
    dauCaWeightByKind.plasticKg,
    cuoiCaWeightByKind.plasticKg,
    exportWeightByKindForPlasticBanner.plasticKg,
    plasticSummaryRow,
    insulationPlasticNorm.weightKg,
    insulationPlasticNormDifferenceKg,
    insulationFilmWeightKg,
    displaySanLuongTotals.weightKg,
    displaySanLuongTotals.quantity,
    isInsulationMachine,
    sanLuongSource,
    products,
    scopedCanTuDongRecords,
    canTuDongBannerNhuaTtFormula,
    canTuDongBannerNhuaDmFormula
  ]);
  const renderPlasticSummaryValue = (
    display: string,
    metric: BbPlasticSummaryDetailMetric | undefined
  ) => {
    if (!metric || display === '—' || display === '…') {
      return <p className="mt-1 font-mono text-base font-black tabular-nums text-zinc-900">{display}</p>;
    }
    return (
      <button
        type="button"
        onClick={() => setPlasticSummaryDetail(metric)}
        className="mt-1 font-mono text-base font-black tabular-nums text-zinc-900 underline decoration-dotted decoration-red-300 underline-offset-2 transition hover:text-red-700 hover:decoration-red-500"
        title="Xem công thức / nguồn số liệu"
      >
        {display}
      </button>
    );
  };
  const inboundTotals = useMemo(() => sumBbInboundReportTotals(inboundRows), [inboundRows]);
  const thucDungTotalKg = useMemo(() => sumBbThucDungWeightKg(thucDungRowsLive), [thucDungRowsLive]);
  const tongNhapKhoTotalKg = useMemo(() => sumBbTongTrongLuongNhapKho(tongGroups), [tongGroups]);
  const tongChenhLechTotalKg = useMemo(() => sumBbTongChenhLech(tongGroups), [tongGroups]);
  const tongTiLeChenhLech = useMemo(
    () => computePercentRatio(tongChenhLechTotalKg, tongNhapKhoTotalKg),
    [tongChenhLechTotalKg, tongNhapKhoTotalKg]
  );
  const tongGiaTriHaoHutLoiHong = useMemo(
    () => sumBbDanhGiaMoney(danhGiaGroups, 'tongGiaTriHaoHutLoiHong'),
    [danhGiaGroups]
  );

  const activeGroupKeys = useMemo(() => {
    switch (activeTab) {
      case 'lenh_sx':
        return orderGroupsMerged.map(group => group.groupKey);
      case 'phieu_xuat_kho':
        return exportGroups.map(group => group.groupKey);
      case 'ton_dau_ca':
        return dauCaGroups.map(group => group.groupKey);
      case 'bao_cao_san_luong':
      case 'bao_cao_san_luong_phieu':
        return sanLuongGroups.map(group => group.groupKey);
      case 'bao_cao_loi_hong':
        return damagedGroupsWithMixing.map(group => group.groupKey);
      case 'kiem_ton_cuoi_ca':
        return cuoiCaGroups.map(group => group.groupKey);
      case 'tong_hop_vat_tu_thuc_xuat_dung':
        return tongHopThucXuatGroups.map(group => group.groupKey);
      case 'bao_cao_thanh_pham_nhap_kho':
        return orderGroupsMerged.map(group => group.groupKey);
      case 'bao_cao_tieu_hao_nvl':
        return thucDungGroups.map(group => group.groupKey);
      case 'tong':
        return tongGroups.map(group => group.groupKey);
      case 'danh_gia_tong_hop':
      case 'danh_gia_hao_hut':
        return danhGiaGroups.map(group => group.groupKey);
      case 'giai_trinh':
        return orderGroupsMerged.map(group => group.groupKey);
      default:
        return [];
    }
  }, [
    activeTab,
    orderGroupsMerged,
    exportGroups,
    dauCaGroups,
    sanLuongGroups,
    damagedGroupsWithMixing,
    cuoiCaGroups,
    thucDungGroups,
    tongHopThucXuatGroups,
    tongGroups,
    danhGiaGroups
  ]);

  const allActiveGroupsExpanded =
    activeGroupKeys.length > 0 && activeGroupKeys.every(groupKey => isGroupExpanded(activeTab, groupKey));
  const setAllActiveGroupsExpanded = (expanded: boolean) => {
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      activeGroupKeys.forEach(groupKey => {
        const key = scopedGroupKey(activeTab, groupKey);
        if (expanded) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  };

  const updatePhanTich = (rowKey: string, value: string) => {
    setPhanTichMap(prev => {
      const next = { ...prev, [rowKey]: value };
      persistBbPhanTichMap(next);
      return next;
    });
    setPhanTichSaveMessage('');
  };

  const resolveGiaiTrinhFields = (groupKey: string): BbGiaiTrinhFields =>
    giaiTrinhMap[groupKey] || emptyBbGiaiTrinhFields();

  const updateGiaiTrinhField = (
    groupKey: string,
    field: keyof BbGiaiTrinhFields,
    value: string
  ) => {
    setGiaiTrinhMap(prev => {
      const current = prev[groupKey] || emptyBbGiaiTrinhFields();
      return {
        ...prev,
        [groupKey]: {
          ...current,
          [field]: value
        }
      };
    });
    setGiaiTrinhSaveMessage('');
  };

  const saveGiaiTrinhToDb = async () => {
    if (orderGroupsMerged.length === 0 || savingGiaiTrinh) return;
    setSavingGiaiTrinh(true);
    setGiaiTrinhSaveMessage('');
    try {
      const items = orderGroupsMerged.map(group => {
        const fields = resolveGiaiTrinhFields(group.groupKey);
        return {
          ngay: group.ngay,
          ca: group.shift,
          may: group.machine,
          ma_lenh: group.orderCode,
          group_key: group.groupKey,
          ...fields,
          khoa_on_dinh: buildBbGiaiTrinhStableKey({
            ngay: group.ngay,
            ca: group.shift,
            may: group.machine,
            maLenh: group.orderCode
          })
        };
      });
      const res = await fetch('/api/bb-giai-trinh', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = String(data?.error || 'Lưu giải trình thất bại.');
        setGiaiTrinhSaveMessage(message);
        setGiaiTrinhDbError(message);
        return;
      }
      const savedItems = Array.isArray(data?.items) ? data.items : [];
      setGiaiTrinhMap(mapBbGiaiTrinhItemsFromDb(savedItems));
      setGiaiTrinhDbError('');
      setGiaiTrinhSaveMessage('Đã lưu giải trình vào DB.');
    } catch (error) {
      setGiaiTrinhSaveMessage(error instanceof Error ? error.message : 'Lỗi lưu giải trình.');
    } finally {
      setSavingGiaiTrinh(false);
    }
  };

  const handleGiaiTrinhPrint = () => {
    if (orderGroupsMerged.length === 0 || pendingGiaiTrinhPrint) return;
    setGiaiTrinhPrintReport(
      buildBbGiaiTrinhPrintReport({
        orderGroups: orderGroupsMerged,
        giaiTrinhMap,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter
      })
    );
    setPendingGiaiTrinhPrint(true);
  };

  const savePhanTichToDb = async () => {
    if (danhGiaGroups.length === 0 || savingPhanTich) return;
    setSavingPhanTich(true);
    setPhanTichSaveMessage('');
    try {
      const items = danhGiaGroups.map(group => ({
        ngay: group.ngay,
        ca: group.shift,
        may: group.machine,
        ma_lenh: group.orderCode,
        group_key: group.groupKey,
        noi_dung: phanTichMap[group.groupKey] || '',
        khoa_on_dinh: buildBbPhanTichStableKey({
          ngay: group.ngay,
          ca: group.shift,
          may: group.machine,
          maLenh: group.orderCode
        })
      }));
      const res = await fetch('/api/bb-phan-tich-danh-gia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không thể lưu phân tích đánh giá.');
      }
      setPhanTichSaveMessage(`Đã lưu ${items.length} dòng phân tích lên Supabase.`);
    } catch (error: any) {
      setPhanTichSaveMessage(error?.message || 'Không thể lưu phân tích đánh giá.');
    } finally {
      setSavingPhanTich(false);
    }
  };

  const handlePrint = () => {
    if (orderGroups.length === 0) return;
    const initialStaff: Record<string, BbPrintConfirmSelection> = {};
    orderGroups.forEach(group => {
      initialStaff[group.groupKey] = {
        staffMain: group.staffMain || '',
        staffAssistant: group.staffAssistant || '',
        staffSupport: group.staffSupport || '',
        ghiChu: printNoteByOrder[group.groupKey] || ''
      };
    });
    setPrintStaffByOrder(initialStaff);
    setPrintConfirmOpen(true);
    void (async () => {
      try {
        const res = await fetch('/api/nhan-su');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const rows = Array.isArray(data?.staff)
          ? data.staff
          : Array.isArray(data)
            ? data
            : [];
        const names = [
          ...new Set(
            rows
              .map((row: Record<string, unknown>) =>
                String(row.name ?? row.nhan_su ?? row.ho_ten ?? row.ten ?? '').trim()
              )
              .filter(Boolean)
          )
        ].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        setHrStaffNames(names);
      } catch {
        /* giữ danh sách từ lệnh SX */
      }
    })();
  };

  const printStaffOptions = useMemo(() => {
    const names = new Set<string>(hrStaffNames);
    productionOrders.forEach(order => {
      splitProductionOrderStaffNames(order.staff || '').forEach(name => {
        if (name.trim()) names.add(name.trim());
      });
    });
    orderGroups.forEach(group => {
      [group.staffMain, group.staffAssistant, group.staffSupport].forEach(name => {
        String(name || '')
          .split(',')
          .map(part => part.trim())
          .filter(Boolean)
          .forEach(part => names.add(part));
      });
    });
    Object.values(printStaffByOrder).forEach((selection: BbPrintConfirmSelection) => {
      [selection.staffMain, selection.staffAssistant, selection.staffSupport].forEach(name => {
        if (name.trim()) names.add(name.trim());
      });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [hrStaffNames, productionOrders, orderGroups, printStaffByOrder]);

  const updatePrintStaff = (
    groupKey: string,
    field: keyof BbPrintConfirmSelection,
    value: string
  ) => {
    setPrintStaffByOrder(prev => ({
      ...prev,
      [groupKey]: {
        staffMain: prev[groupKey]?.staffMain || '',
        staffAssistant: prev[groupKey]?.staffAssistant || '',
        staffSupport: prev[groupKey]?.staffSupport || '',
        ghiChu: prev[groupKey]?.ghiChu || '',
        [field]: value
      }
    }));
  };

  const confirmPrint = () => {
    const nextGroups = orderGroupsMerged.map(group => {
      const selected = printStaffByOrder[group.groupKey];
      if (!selected) return group;
      return {
        ...group,
        staffMain: selected.staffMain.trim(),
        staffAssistant: selected.staffAssistant.trim(),
        staffSupport: selected.staffSupport.trim()
      };
    });
    const nextNotes: Record<string, string> = {};
    const nextLyDo: Record<string, string> = {};
    orderGroupsMerged.forEach(group => {
      const selected = printStaffByOrder[group.groupKey];
      const note = selected?.ghiChu?.trim() || '';
      const dbNote =
        group.lines
          .map(line => {
            const stable = buildBbLyDoStableKey({
              ngay: group.ngay,
              ca: group.shift,
              may: group.machine,
              maLenh: group.orderCode,
              maSp: line.productCode
            });
            return dbLyDoByStableKey[stable]?.ghi_chu || '';
          })
          .find(value => value.trim()) || '';
      if (note) nextNotes[group.groupKey] = note;
      else if (dbNote) nextNotes[group.groupKey] = dbNote;

      group.lines.forEach(line => {
        const lineKey = printLyDoLineKey(group.groupKey, line.key);
        const stable = buildBbLyDoStableKey({
          ngay: group.ngay,
          ca: group.shift,
          may: group.machine,
          maLenh: group.orderCode,
          maSp: line.productCode
        });
        const fromDb = dbLyDoByStableKey[stable]?.ly_do || '';
        nextLyDo[lineKey] = printLyDoByLine[lineKey] ?? fromDb;
      });
    });
    setPrintNoteByOrder(nextNotes);
    setPrintLyDoByLine(nextLyDo);
    setPrintOrderGroups(nextGroups);
    setPrintConfirmOpen(false);
    setShowPrintSheet(true);
    setPrintPreviewOpen(true);
  };

  const printFromPreview = () => {
    setPrintPreviewOpen(false);
    setPendingPrint(true);
  };

  const savePrintLyDoToDb = async () => {
    const groups = printOrderGroups.length > 0 ? printOrderGroups : orderGroups;
    if (groups.length === 0 || savingLyDo) return;
    setSavingLyDo(true);
    setLyDoSaveMessage('');
    try {
      const items = groups.flatMap(group =>
        group.lines.map(line => {
          const lineKey = printLyDoLineKey(group.groupKey, line.key);
          return {
            ngay: group.ngay,
            ca: group.shift,
            may: group.machine,
            ma_lenh: group.orderCode,
            ma_sp: line.productCode,
            ten_sp: line.productName,
            group_key: group.groupKey,
            line_key: line.key,
            ly_do: printLyDoByLine[lineKey] || '',
            ghi_chu: printNoteByOrder[group.groupKey] || '',
            khoa_on_dinh: buildBbLyDoStableKey({
              ngay: group.ngay,
              ca: group.shift,
              may: group.machine,
              maLenh: group.orderCode,
              maSp: line.productCode
            })
          };
        })
      );
      const res = await fetch('/api/bb-bao-cao-ly-do', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Không lưu được lý do vào DB.');
      }
      const savedItems = Array.isArray(data?.items) ? data.items : items;
      setDbLyDoByStableKey(prev => {
        const next = { ...prev };
        for (const raw of savedItems) {
          const khoa = String(raw?.khoa_on_dinh || '').trim();
          if (!khoa) continue;
          next[khoa] = {
            id: raw.id,
            khoa_on_dinh: khoa,
            ngay: String(raw.ngay || ''),
            ca: String(raw.ca || ''),
            may: String(raw.may || ''),
            ma_lenh: String(raw.ma_lenh || ''),
            ma_sp: String(raw.ma_sp || ''),
            ten_sp: raw.ten_sp,
            group_key: raw.group_key,
            line_key: raw.line_key,
            ly_do: String(raw.ly_do || ''),
            ghi_chu: String(raw.ghi_chu || '')
          };
        }
        return next;
      });
      setLyDoSaveMessage(`Đã lưu ${items.length} dòng lý do vào DB.`);
    } catch (error: any) {
      setLyDoSaveMessage(error?.message || 'Lỗi khi lưu lý do vào DB.');
    } finally {
      setSavingLyDo(false);
    }
  };

  const closePrintPreview = () => {
    if (pendingPrint) return;
    setPrintPreviewOpen(false);
    setShowPrintSheet(false);
    setPrintOrderGroups([]);
    setPrintNoteByOrder({});
    setPrintLyDoByLine({});
    setLyDoSaveMessage('');
  };

  const editPrintDetails = () => {
    setPrintStaffByOrder(prev => {
      const next = { ...prev };
      (printOrderGroups.length > 0 ? printOrderGroups : orderGroups).forEach(group => {
        const current = next[group.groupKey];
        next[group.groupKey] = {
          staffMain: current?.staffMain || group.staffMain || '',
          staffAssistant: current?.staffAssistant || group.staffAssistant || '',
          staffSupport: current?.staffSupport || group.staffSupport || '',
          ghiChu: printNoteByOrder[group.groupKey] || current?.ghiChu || ''
        };
      });
      return next;
    });
    setPrintPreviewOpen(false);
    setShowPrintSheet(false);
    setPrintConfirmOpen(true);
  };

  const closePrintConfirm = () => {
    if (pendingPrint) return;
    setPrintConfirmOpen(false);
  };

  useEffect(() => {
    if (!pendingPrint || !showPrintSheet) return;
    let cancelled = false;
    document.body.classList.add('shift-summary-print-active');
    document.body.classList.add('bb-machine-report-print-active');
    enablePortraitPrintPage('bb-machine-report-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('bb-machine-report-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
      disablePortraitPrintPage('bb-machine-report-page-portrait');
    };
  }, [pendingPrint, showPrintSheet]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
      setPendingPrint(false);
      setShowPrintSheet(false);
      setPrintOrderGroups([]);
      setPrintNoteByOrder({});
      setPrintLyDoByLine({});
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    if (!pendingGiaiTrinhPrint || !giaiTrinhPrintReport) return;
    let cancelled = false;
    document.body.classList.add('bb-giai-trinh-print-active');
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('bb-giai-trinh-print-active');
    };
  }, [pendingGiaiTrinhPrint, giaiTrinhPrintReport]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('bb-giai-trinh-print-active');
      setGiaiTrinhPrintReport(null);
      setPendingGiaiTrinhPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('bb-giai-trinh-print-active');
    };
  }, []);

  return (
    <>
    <section className="control-board-report-theme overflow-hidden rounded-2xl border-2 border-red-200/90 bg-white shadow-sm">
      <div className="border-b border-red-100 bg-gradient-to-b from-red-50/60 via-red-50/20 to-white px-4 py-3.5 text-zinc-900 shadow-xs">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-red-600">Báo cáo {machineReportLabel}</p>
            <h3 className="text-base font-black text-zinc-900 sm:text-lg">{machineReportTitle}</h3>
            {snapshotStatus === 'ready' && snapshotCalculatedAt ? (
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                Đã tính:{' '}
                {new Date(snapshotCalculatedAt).toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            ) : null}
            {snapshotStatus === 'missing' ? (
              <p className="mt-0.5 text-xs font-semibold text-amber-700">
                Chưa có bản tính cho bộ lọc này (gồm lệnh SX nếu đang chọn). Bấm «Tính toán» để ghi DB.
              </p>
            ) : null}
            {snapshotStatus === 'error' ? (
              <p className="mt-0.5 text-xs font-semibold text-red-700">
                {snapshotMessage || 'Lỗi tải/ghi bản tính. Kiểm tra bảng Supabase rồi bấm «Tính toán» lại.'}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void syncLatestReport()}
              disabled={isLoading || calculatingReport || awaitingSyncReload || snapshotStatus === 'loading'}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3.5 text-xs font-black text-sky-950 shadow-xs transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
              title="Tải lại phiếu xuất kho, Thành phần SP, Tổng kg kho NVL — tính lại mọi tab (gồm Báo cáo sản lượng)"
            >
              {awaitingSyncReload || calculatingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {awaitingSyncReload ? 'Đang tải...' : calculatingReport ? 'Đang tính...' : 'Đồng bộ'}
            </button>
            <button
              type="button"
              onClick={openCalcDialog}
              disabled={isLoading || calculatingReport || snapshotStatus === 'loading'}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-400 px-3.5 text-xs font-black text-zinc-950 shadow-xs transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
              title="Chọn Ngày · Ca · Máy — tính và đồng bộ tất cả tab, lưu DB"
            >
              {calculatingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              {calculatingReport ? 'Đang tính...' : 'Tính toán'}
            </button>
            <button
              type="button"
              id="bb-machine-report-print-btn"
              onClick={handlePrint}
              disabled={isLoading || orderGroups.length === 0 || pendingPrint}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 text-xs font-black text-zinc-700 shadow-xs transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px]"
              title="In báo cáo tổng hợp máy BB"
            >
              {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {pendingPrint ? 'Đang chuẩn bị...' : 'In báo cáo'}
            </button>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 ${
            isInsulationMachine && sanLuongSource === 'can-tu-dong'
              ? 'xl:grid-cols-[1fr_1.05fr_1.05fr_1.05fr_1.45fr_1fr]'
              : 'xl:grid-cols-6'
          }`}
        >
          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
            title="Lấy toàn bộ KG: tổng cột «Tổng (kg)» của tất cả dòng trong Lệnh sản xuất theo bộ lọc"
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">
              TL nhựa yêu cầu
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-red-100/80 pt-1.5">
              <div className="min-w-0" title="Tổng cột «SL» lệnh sản xuất">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">Số lượng</p>
                <p className="font-mono text-[15px] font-black tabular-nums text-zinc-900">
                  {isLoading
                    ? '…'
                    : orderTotals.quantity > 0
                      ? formatNumber(orderTotals.quantity, 2)
                      : '—'}
                </p>
              </div>
              <div className="min-w-0" title="Lấy hết KG từ cột «Tổng (kg)» trong Lệnh sản xuất">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL</p>
                <p className="font-mono text-[15px] font-black tabular-nums text-zinc-900">
                  {isLoading
                    ? '…'
                    : plasticRequiredWeightKg > 0
                      ? `${formatKg(plasticRequiredWeightKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
            title="Khớp phiếu xuất kho: Tổng nhựa = Σ Quy về kg dòng ĐVT kg; vật tư khác = Σ Quy về kg dòng ĐVT ≠ kg"
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">TL xuất</p>
            <p className="mt-0.5 font-mono text-base font-black tabular-nums text-zinc-900">
              {isLoading
                ? '…'
                : exportWeightByKind.totalKg > 0
                  ? `${formatKg(exportWeightByKind.totalKg, 2)} Kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-red-100/80 pt-1.5">
              <div className="min-w-0" title="Σ cột Quy về kg mọi dòng ĐVT = kg trên phiếu xuất (kể cả túi)">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL nhựa</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : exportWeightByKind.plasticKg > 0
                      ? `${formatKg(exportWeightByKind.plasticKg, 2)} Kg`
                      : '—'}
                </p>
              </div>
              <div className="min-w-0" title="Σ cột Quy về kg dòng ĐVT ≠ kg (lõi cái…)">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">Vật tư khác</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : exportWeightByKind.otherKg > 0
                      ? `${formatKg(exportWeightByKind.otherKg, 2)} Kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
            title="Trọng lượng tồn đầu ca = nhựa (ĐVT kg) + vật tư khác (lõi/túi/ĐVT ≠ kg) trên phiếu tồn đầu"
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">
              TL tồn Đầu ca
            </p>
            <p className="mt-0.5 font-mono text-base font-black tabular-nums text-zinc-900">
              {isLoading
                ? '…'
                : dauCaWeightByKind.totalKg > 0
                  ? `${formatKg(dauCaWeightByKind.totalKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-red-100/80 pt-1.5">
              <div className="min-w-0" title="Dòng NVL nhựa, ĐVT = kg">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL nhựa</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : dauCaWeightByKind.plasticKg > 0
                      ? `${formatKg(dauCaWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div className="min-w-0" title="Lõi, túi, màng và ĐVT ≠ kg trên phiếu tồn đầu">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">Vật tư khác</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : dauCaWeightByKind.otherKg > 0
                      ? `${formatKg(dauCaWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
            title="Trọng lượng tồn cuối ca = nhựa (ĐVT kg) + vật tư khác (lõi/túi/ĐVT ≠ kg) trên phiếu tồn cuối"
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">
              TL tồn Cuối ca
            </p>
            <p className="mt-0.5 font-mono text-base font-black tabular-nums text-zinc-900">
              {isLoading
                ? '…'
                : cuoiCaWeightByKind.totalKg > 0
                  ? `${formatKg(cuoiCaWeightByKind.totalKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-red-100/80 pt-1.5">
              <div className="min-w-0" title="Dòng NVL nhựa, ĐVT = kg">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL nhựa</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : cuoiCaWeightByKind.plasticKg > 0
                      ? `${formatKg(cuoiCaWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div className="min-w-0" title="Lõi, túi, màng và ĐVT ≠ kg trên phiếu tồn cuối">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">Vật tư khác</p>
                <p className="font-mono text-[13px] font-black tabular-nums text-zinc-800">
                  {isLoading
                    ? '…'
                    : cuoiCaWeightByKind.otherKg > 0
                      ? `${formatKg(cuoiCaWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
            title={
              sanLuongSource === 'can-tu-dong'
                ? 'Tổng cột «Trọng lượng nhựa» trên /can-tu-dong (SP − lõi − bì 0,16), cột Ngày từ Từ ngày đến Đến ngày+1 (gồm SP cân ngày hôm sau)'
                : 'Tổng SL sản lượng và trọng lượng thực tế (kg) trên tab Dữ liệu trong báo cáo sản lượng'
            }
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">
              Báo cáo sản lượng
            </p>
            <div
              className={`mt-auto grid gap-1.5 border-t border-red-100/80 pt-1.5 ${
                isInsulationMachine && sanLuongSource === 'can-tu-dong'
                  ? 'grid-cols-[0.7fr_1.1fr_1.1fr] gap-2'
                  : 'grid-cols-2'
              }`}
            >
              <div
                className="min-w-0"
                title={
                  sanLuongSource === 'can-tu-dong'
                    ? 'Số SP = số dòng /can-tu-dong cột Ngày trong khoảng lọc (gồm ngày kế tiếp)'
                    : 'Tổng cột «SL sản lượng»'
                }
              >
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                  {sanLuongSource === 'can-tu-dong' ? 'Số SP' : 'Số lượng'}
                </p>
                <p className="font-mono text-[14px] font-black tabular-nums text-zinc-900">
                  {isLoading
                    ? '…'
                    : displaySanLuongTotals.quantity > 0
                      ? formatNumber(displaySanLuongTotals.quantity, sanLuongSource === 'can-tu-dong' ? 0 : 2)
                      : '—'}
                </p>
              </div>
              {isInsulationMachine && sanLuongSource === 'can-tu-dong' ? (
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL màng</p>
                  {renderPlasticSummaryValue(
                    isLoading
                      ? '…'
                      : displaySanLuongTotals.quantity > 0
                        ? `${formatKg(insulationFilmWeightKg, 2)} kg`
                        : '—',
                    'film'
                  )}
                  <p className="mt-0.5 text-[9px] font-semibold leading-tight text-zinc-400">
                    BOM màng × cuộn
                  </p>
                </div>
              ) : null}
              <div className="min-w-0">
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">
                  {sanLuongSource === 'can-tu-dong' ? 'TL nhựa' : 'TL'}
                </p>
                {renderPlasticSummaryValue(
                  isLoading
                    ? '…'
                    : displaySanLuongTotals.quantity > 0
                      ? `${formatKg(displayedPlasticWeightKg, 2)} kg`
                      : '—',
                  'finished'
                )}
                {isInsulationMachine && sanLuongSource === 'can-tu-dong' ? (
                  <p className="mt-0.5 text-[9px] font-semibold leading-tight text-zinc-400">
                    TL nhựa − TL màng
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[102px] flex-col rounded-xl border border-red-200/80 bg-white p-2.5 shadow-xs transition hover:border-red-300 hover:bg-red-50/20"
                title={
                  isInsulationMachine
                    ? 'TL nhựa = Σ SP lỗi (Hàng hỏng), không gồm rác màng; Vật tư khác = rác màng'
                    : 'Lấy từ Báo cáo sản lượng: SP lỗi (hàng lỗi hỏng) + SP rác trừ rác màng'
                }
          >
            <p className="whitespace-nowrap text-[11px] font-black uppercase tracking-tight text-red-700">
              Báo cáo lỗi hỏng
            </p>
            <p className="mt-0.5 font-mono text-base font-black tabular-nums text-zinc-900">
              {isLoading
                ? '…'
                : damagedWeightByKind.plasticKg + damagedWeightByKind.otherKg > 0
                  ? `${formatKg(damagedWeightByKind.plasticKg + damagedWeightByKind.otherKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-red-100/80 pt-1.5">
              <div
                className="min-w-0"
                title={
                  isInsulationMachine
                    ? 'Σ SP lỗi (Hàng hỏng), không gồm rác màng'
                    : 'Σ trọng lượng phiếu Báo cáo sản lượng · loại SP lỗi (Hàng hỏng)'
                }
              >
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">TL nhựa</p>
                <p className="font-mono text-[15px] font-black tabular-nums text-zinc-900">
                  {isLoading
                    ? '…'
                    : damagedWeightByKind.plasticKg > 0
                      ? `${formatKg(damagedWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div
                className="min-w-0"
                title={
                  isInsulationMachine
                    ? 'Σ trọng lượng rác màng xi (SP rác) trên Báo cáo sản lượng'
                    : 'Σ trọng lượng phiếu Báo cáo sản lượng · loại SP rác (Kho rác), trừ rác màng'
                }
              >
                <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-tight text-zinc-500">Vật tư khác</p>
                <p className="font-mono text-[15px] font-black tabular-nums text-zinc-900">
                  {isLoading
                    ? '…'
                    : damagedWeightByKind.otherKg > 0
                      ? `${formatKg(damagedWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-3 rounded-xl border border-red-200/70 bg-gradient-to-r from-red-50/40 via-red-50/20 to-white p-3 shadow-xs"
          title={
            isInsulationMachine
              ? 'Chênh lệch = Trọng lượng nhựa (đã trừ màng) − Xuất thực dùng + Lỗi'
              : 'Chênh lệch = Tổng nhựa thành phẩm − Xuất thực dùng + Lỗi'
          }
        >
          <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-red-800">
            Tổng hợp nhựa
          </p>
          <div
            className={`grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 ${
              isInsulationMachine && sanLuongSource === 'can-tu-dong'
                ? 'xl:grid-cols-[0.85fr_0.85fr_2.9fr_1.1fr_0.8fr_0.8fr]'
                : 'xl:grid-cols-6'
            }`}
          >
            {(
              [
                {
                  label: 'Tổng nhựa yêu cầu',
                  title: 'Tổng (kg) lệnh sản xuất',
                  metric: 'required' as const,
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.requiredKg > 0
                      ? `${formatKg(plasticSummaryRow.requiredKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa xuất',
                  title: 'Tổng nhựa phiếu xuất ca đang chọn = Σ Quy về kg dòng ĐVT kg',
                  metric: 'export' as const,
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.exportKg > 0
                      ? `${formatKg(plasticSummaryRow.exportKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa thành phẩm',
                  metric: 'finished' as const,
                  title:
                    sanLuongSource === 'can-tu-dong'
                      ? isInsulationMachine
                        ? 'Cùng cột «Trọng lượng Nhựa TT» tab Dữ liệu cân thực tế = SP − lõi − bì − màng'
                        : 'Tổng cột «Trọng lượng Nhựa TT» tab Dữ liệu cân thực tế'
                      : 'Trọng lượng thực tế tab sản lượng',
                  display: isLoading
                    ? '…'
                    : sanLuongSource === 'can-tu-dong'
                      ? (canTuDongTongHopBanner?.totals.so_cuon ?? 0) > 0 ||
                        plasticSummaryRow.finishedKg > 0
                        ? `${formatKg(plasticSummaryRow.finishedKg, 2)} kg`
                        : '—'
                      : plasticSummaryRow.finishedKg > 0
                        ? `${formatKg(plasticSummaryRow.finishedKg, 2)} kg`
                        : '—',
                  secondaryLabel:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong'
                      ? 'Tổng nhựa định mức'
                      : '',
                  secondaryMetric:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong' ? ('norm' as const) : undefined,
                  secondaryTitle:
                    'Σ (Trọng lượng nhựa + phụ gia Kho hàng × 1 cuộn) — cột «Trọng lượng Nhựa ĐM» tab cân thực tế',
                  secondaryDisplay:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong'
                      ? isLoading
                        ? '…'
                        : (canTuDongTongHopBanner?.totals.so_cuon ?? 0) > 0 ||
                          insulationPlasticNorm.weightKg > 0
                          ? `${formatKg(insulationPlasticNorm.weightKg, 2)} kg`
                          : '—'
                      : '',
                  tertiaryLabel:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong'
                      ? 'Chênh lệch'
                      : '',
                  tertiaryMetric:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong' ? ('norm_diff' as const) : undefined,
                  tertiaryTitle: 'Chênh lệch = Tổng nhựa định mức − Tổng nhựa thành phẩm.',
                  tertiaryDisplay:
                    isInsulationMachine && sanLuongSource === 'can-tu-dong'
                      ? isLoading
                        ? '…'
                        : (canTuDongTongHopBanner?.totals.so_cuon ?? 0) > 0 ||
                          plasticSummaryRow.finishedKg > 0 ||
                          insulationPlasticNorm.weightKg > 0
                          ? `${formatSignedKg(insulationPlasticNormDifferenceKg, 2)} kg`
                          : '—'
                      : ''
                },
                {
                  label: 'Xuất thực dùng',
                  title: 'Tồn đầu ca + Xuất nhựa (ca) − Tồn cuối ca',
                  metric: 'stock_net' as const,
                  display: isLoading
                    ? '…'
                    : exportWeightByKindForPlasticBanner.plasticKg > 0 ||
                        dauCaWeightByKind.plasticKg > 0 ||
                        cuoiCaWeightByKind.plasticKg > 0
                      ? `${formatKg(plasticSummaryRow.stockNetKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa lỗi',
                  title: 'Σ trọng lượng phiếu Báo cáo sản lượng · SP lỗi (Hàng hỏng)',
                  metric: 'damaged' as const,
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.damagedKg > 0
                      ? `${formatKg(plasticSummaryRow.damagedKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Chênh lệch',
                  title: isInsulationMachine
                    ? 'Trọng lượng nhựa (đã trừ màng) − Xuất thực dùng + Lỗi'
                    : 'Tổng nhựa thành phẩm − Xuất thực dùng + Lỗi',
                  metric: 'difference' as const,
                  display: isLoading
                    ? '…'
                    : Number.isFinite(plasticSummaryRow.differenceKg)
                      ? `${formatSignedKg(plasticSummaryRow.differenceKg, 2)} kg`
                      : '—'
                }
              ] as const
            ).map(item => (
              <div
                key={item.label}
                className="rounded-lg border border-red-200/70 bg-white p-2.5 shadow-xs transition hover:border-red-300"
                title={item.title}
              >
                {'secondaryDisplay' in item && item.secondaryDisplay ? (
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                    <div className="min-w-0">
                      <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-tight text-red-700">{item.label}</p>
                      {renderPlasticSummaryValue(item.display, item.metric)}
                      {'secondaryDisplay' in item &&
                      item.secondaryDisplay &&
                      canTuDongBannerNhuaTtFormula ? (
                        <p
                          className="mt-0.5 text-[9px] font-semibold leading-tight text-zinc-500"
                          title={canTuDongBannerNhuaTtFormula}
                        >
                          {canTuDongBannerNhuaTtFormula}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0 border-l border-red-100 pl-2" title={item.secondaryTitle}>
                      <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-tight text-red-700">{item.secondaryLabel}</p>
                      {renderPlasticSummaryValue(
                        item.secondaryDisplay,
                        'secondaryMetric' in item ? item.secondaryMetric : undefined
                      )}
                      {canTuDongBannerNhuaDmFormula ? (
                        <p
                          className="mt-0.5 text-[9px] font-semibold leading-tight text-zinc-500"
                          title={canTuDongBannerNhuaDmFormula}
                        >
                          {canTuDongBannerNhuaDmFormula}
                        </p>
                      ) : null}
                    </div>
                    {'tertiaryDisplay' in item && item.tertiaryDisplay ? (
                      <div className="min-w-0 border-l border-red-100 pl-2" title={item.tertiaryTitle}>
                        <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-tight text-red-700">{item.tertiaryLabel}</p>
                        {renderPlasticSummaryValue(
                          item.tertiaryDisplay,
                          'tertiaryMetric' in item ? item.tertiaryMetric : undefined
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-tight text-red-700 sm:text-[10.5px]">{item.label}</p>
                    {renderPlasticSummaryValue(item.display, item.metric)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative border-b border-zinc-200 bg-zinc-50/80">
        <div className="bb-tab-scroller gap-1.5 px-2 py-2">
          {BB_MACHINE_REPORT_TABS.map(tab => {
            const isChecked = checkedTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg py-2 pl-2 pr-3.5 text-xs font-black uppercase tracking-wide transition ${
                  activeTab === tab.id
                    ? 'border border-red-200 bg-red-50 text-[#ef1b2d] shadow-xs'
                    : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <span
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={
                    isChecked ? `Bỏ đánh dấu ${tab.label}` : `Đánh dấu đã rà soát ${tab.label}`
                  }
                  onClick={event => toggleTabChecked(tab.id, event)}
                  title={
                    isChecked ? 'Đã rà soát — bấm để bỏ đánh dấu' : 'Bấm để đánh dấu đã rà soát'
                  }
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                    isChecked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : activeTab === tab.id
                        ? 'border-red-300 bg-white text-transparent hover:border-emerald-500'
                        : 'border-zinc-300 bg-white text-transparent hover:border-emerald-500'
                  }`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-50 to-transparent" />
      </div>

      {activeGroupKeys.length > 0 ||
      activeTab === 'ton_dau_ca' ||
      activeTab === 'danh_gia_tong_hop' ||
      activeTab === 'danh_gia_hao_hut' ||
      activeTab === 'giai_trinh' ? (
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {activeTab === 'ton_dau_ca' ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                Tỉ lệ theo định mức
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Cột Tỉ lệ thực tế và phân bổ NNS-TRON đều lấy tỉ lệ ĐM máy / thành phần SP
              </p>
            </div>
          ) : activeTab === 'danh_gia_tong_hop' ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                4.1. Tổng hợp
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Cùng bảng trên phiếu in — bấm «Tính toán» để cập nhật từ tiêu hao NVL + lỗi + lệnh.
              </p>
            </div>
          ) : activeTab === 'danh_gia_hao_hut' ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                Phân tích đánh giá
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Gõ nội dung từng lệnh → Lưu DB (Supabase) để dùng chung giữa các máy.
                {phanTichSaveMessage ? (
                  <span className="ml-1 font-bold text-rose-700">{phanTichSaveMessage}</span>
                ) : null}
              </p>
            </div>
          ) : activeTab === 'giai_trinh' ? (
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                Giải trình
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Chỉ lưu Supabase — gõ xong bấm «Lưu giải trình DB». Chưa chạy migration →{' '}
                <code className="rounded bg-zinc-100 px-1">supabase-bb-giai-trinh.sql</code>
                {giaiTrinhSaveMessage ? (
                  <span className="ml-1 font-bold text-indigo-700">{giaiTrinhSaveMessage}</span>
                ) : null}
                {giaiTrinhDbError ? (
                  <span className="mt-1 block font-bold text-rose-700">{giaiTrinhDbError}</span>
                ) : null}
              </p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex shrink-0 flex-wrap gap-2">
            {activeTab === 'danh_gia_hao_hut' ? (
              <button
                type="button"
                onClick={() => void savePhanTichToDb()}
                disabled={savingPhanTich || danhGiaGroups.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-black text-[#ef1b2d] shadow-xs transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPhanTich ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {savingPhanTich ? 'Đang lưu...' : 'Lưu phân tích DB'}
              </button>
            ) : null}
            {activeTab === 'giai_trinh' ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveGiaiTrinhToDb()}
                  disabled={savingGiaiTrinh || loadingGiaiTrinh || orderGroupsMerged.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-800 shadow-xs transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingGiaiTrinh ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingGiaiTrinh ? 'Đang lưu...' : 'Lưu giải trình DB'}
                </button>
                <button
                  type="button"
                  onClick={handleGiaiTrinhPrint}
                  disabled={
                    pendingGiaiTrinhPrint ||
                    loadingGiaiTrinh ||
                    isLoading ||
                    orderGroupsMerged.length === 0
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-700 shadow-xs transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
                  title="In bảng giải trình (PDF qua hộp thoại in)"
                >
                  {pendingGiaiTrinhPrint ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                  {pendingGiaiTrinhPrint ? 'Đang chuẩn bị...' : 'In PDF'}
                </button>
              </>
            ) : null}
            {activeGroupKeys.length > 0 ? (
              <>
              <button
                type="button"
                onClick={() => setAllActiveGroupsExpanded(true)}
                disabled={allActiveGroupsExpanded}
                className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-black text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:cursor-default disabled:opacity-40"
              >
                Mở tất cả
              </button>
              <button
                type="button"
                onClick={() => setAllActiveGroupsExpanded(false)}
                disabled={
                  !allActiveGroupsExpanded &&
                  activeGroupKeys.every(groupKey => !isGroupExpanded(activeTab, groupKey))
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
              >
                Đóng tất cả
              </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="bb-table-scroll bb-report-sheet-scroll">
        {activeTab === 'lenh_sx' ? (
          <table className="min-w-[1280px] w-full table-fixed text-left text-sm font-semibold">
            <colgroup>
              <col className="w-10" />
              <col className="w-[6.75rem]" />
              <col className="w-[7rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[6.75rem]" />
            </colgroup>
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-1.5 py-2 font-black" />
                <th className="px-2 py-2 font-black">Ngày</th>
                <th className="px-2 py-2 font-black">Lệnh SX</th>
                <th className="px-2 py-2 font-black">Ca</th>
                <th className="px-2 py-2 font-black">Thợ chính</th>
                <th className="px-2 py-2 font-black">Phụ máy</th>
                <th className="px-2 py-2 font-black">Hỗ trợ</th>
                <th className="px-2 py-2 text-right font-black">Dòng</th>
                <th className="px-2 py-2 text-right font-black">SL</th>
                <th className="px-2 py-2 text-right font-black">Tổng TL (kg)</th>
                <th className="px-2 py-2 text-right font-black">% KL nhựa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo máy BB...
                  </td>
                </tr>
              ) : orderGroupsMerged.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có lệnh SX máy BB theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                orderGroupsMerged.map(group => {
                  const expanded = isGroupExpanded('lenh_sx', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-sky-200 bg-sky-50/60 font-bold hover:bg-sky-100/50 transition">
                        <td className="px-1.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('lenh_sx', group.groupKey)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-2 py-1.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-2 py-1.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-2 py-1.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffMain || '—'}</td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffAssistant || '—'}</td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffSupport || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-zinc-600">{group.lineCount}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-zinc-800">
                          {formatNumber(group.quantity, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                          {formatKg(group.totalNormKg, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-teal-700">
                          {group.totalNormKg > 0 ? '100%' : '—'}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-sky-50/30">
                          <td colSpan={11} className="p-0">
                            <div className="overflow-x-auto border-y border-sky-200 bg-white">
                              <table className="min-w-[1240px] w-full table-fixed text-left text-sm font-semibold">
                                <colgroup>
                                  <col className="w-10" />
                                  <col className="w-[9rem]" />
                                  <col />
                                  <col className="w-[5.5rem]" />
                                  <col className="w-[7.5rem]" />
                                  <col className="w-[9rem]" />
                                  <col className="w-[6.5rem]" />
                                  <col className="w-[8rem]" />
                                  <col className="w-[7rem]" />
                                </colgroup>
                                <thead>
                                  <tr className="bg-sky-100/70 text-xs font-black uppercase tracking-wider text-sky-900">
                                    <th className="px-1.5 py-2 font-black" />
                                    <th className="px-3 py-2 font-black">Mã hàng</th>
                                    <th className="px-3 py-2 font-black">Tên hàng</th>
                                    <th className="px-3 py-2 font-black">ĐVT</th>
                                    <th className="px-3 py-2 text-right font-black">Định mức (kg)</th>
                                    <th
                                      className="px-3 py-2 text-right font-black"
                                      title="Lấy thẳng cột Trọng lượng nhựa + phụ gia (kg) trên Kho hàng"
                                    >
                                      Trọng lượng nhựa + phụ gia (kg)
                                    </th>
                                    <th className="px-3 py-2 text-right font-black">SL</th>
                                    <th className="px-3 py-2 text-right font-black">Tổng (kg)</th>
                                    <th className="px-3 py-2 text-right font-black">% KL nhựa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.lines.map(row => {
                                    const plasticPercent =
                                      group.totalNormKg > 0 && row.totalNormKg && row.totalNormKg > 0
                                        ? (row.totalNormKg / group.totalNormKg) * 100
                                        : null;
                                    const catalogProduct = findProductByCode(products, row.productCode);
                                    const plasticFromCatalog = resolveProductMaterialBaseKg(catalogProduct);
                                    const plasticNormKg =
                                      row.plasticNormKgPerUnit != null && row.plasticNormKgPerUnit > 0
                                        ? row.plasticNormKgPerUnit
                                        : plasticFromCatalog > 0
                                          ? plasticFromCatalog
                                          : null;
                                    const lineNvlToggleKey = `nvl|${group.groupKey}|line:${row.key}`;
                                    // Mặc định đóng: dùng collapsed set làm cờ «đã mở NVL».
                                    const nvlExpanded = collapsedGroupKeys.has(
                                      scopedGroupKey('lenh_sx', lineNvlToggleKey)
                                    );
                                    const dmNvl = buildBcLsxDmNvl({
                                      productCode: row.productCode,
                                      plasticNormKgPerUnit: plasticNormKg,
                                      quantity: row.quantity > 0 ? row.quantity : null,
                                      products,
                                      materials
                                    });
                                    const nvlItems = dmNvl?.nvl || [];
                                    return (
                                      <React.Fragment key={row.key}>
                                        <tr className="border-b border-slate-100 bg-white font-semibold hover:bg-sky-50/40">
                                          <td className="px-1.5 py-2">
                                            <button
                                              type="button"
                                              onClick={() => toggleGroup('lenh_sx', lineNvlToggleKey)}
                                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm transition hover:bg-violet-50"
                                              title={
                                                nvlExpanded
                                                  ? 'Đóng định mức NVL'
                                                  : 'Mở định mức NVL (Thành phần)'
                                              }
                                              aria-expanded={nvlExpanded}
                                            >
                                              <ChevronDown
                                                className={`h-4 w-4 transition-transform ${
                                                  nvlExpanded ? '' : '-rotate-90'
                                                }`}
                                              />
                                            </button>
                                          </td>
                                          <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                                            {row.productCode || '—'}
                                          </td>
                                          <td className="px-3 py-2 text-zinc-700">
                                            {row.productName || '—'}
                                          </td>
                                          <td className="px-3 py-2 text-zinc-600">{row.unit || '—'}</td>
                                          <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                                            {formatKg(row.normKgPerUnit, 2)}
                                          </td>
                                          <td
                                            className="px-3 py-2 text-right font-mono font-bold text-violet-700"
                                            title="Cột Trọng lượng nhựa + phụ gia (kg) · Kho hàng (= trọng lượng trộn)"
                                          >
                                            {formatProductCatalogPlasticWeight(catalogProduct)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-800">
                                            {formatNumber(row.quantity, 2)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                            {formatKg(row.totalNormKg, 2)}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-bold text-teal-700">
                                            {plasticPercent === null
                                              ? '—'
                                              : `${formatNumber(plasticPercent, 2)}%`}
                                          </td>
                                        </tr>
                                        {nvlExpanded ? (
                                          <tr className="bg-violet-50/40">
                                            <td colSpan={9} className="p-0">
                                              <div className="border-y border-violet-200 bg-white/90 px-2 py-2">
                                                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[11px] font-bold text-violet-900">
                                                  <span className="uppercase tracking-wider">
                                                    Định mức NVL
                                                  </span>
                                                  <span className="font-mono text-violet-700">
                                                    TL trộn:{' '}
                                                    {dmNvl?.trong_luong_tron_kg != null
                                                      ? formatKg(dmNvl.trong_luong_tron_kg, 2)
                                                      : '—'}{' '}
                                                    kg / 1 {row.unit || 'ĐVT'}
                                                  </span>
                                                  {dmNvl?.tong_trong_luong_tron_kg != null ? (
                                                    <span className="font-mono text-violet-600">
                                                      × SL = {formatKg(dmNvl.tong_trong_luong_tron_kg, 2)} kg
                                                    </span>
                                                  ) : null}
                                                </div>
                                                <table className="min-w-full w-full table-fixed text-left text-xs font-semibold">
                                                  <colgroup>
                                                    <col className="w-[9rem]" />
                                                    <col />
                                                    <col className="w-[4.5rem]" />
                                                    <col className="w-[5.5rem]" />
                                                    <col className="w-[5.5rem]" />
                                                    <col className="w-[7rem]" />
                                                    <col className="w-[7.5rem]" />
                                                  </colgroup>
                                                  <thead>
                                                    <tr className="bg-violet-100/80 text-[10px] font-black uppercase tracking-wider text-violet-950">
                                                      <th className="px-3 py-1.5 font-black">Mã NVL</th>
                                                      <th className="px-3 py-1.5 font-black">Tên NVL</th>
                                                      <th className="px-3 py-1.5 font-black">ĐVT</th>
                                                      <th className="px-3 py-1.5 text-right font-black">%</th>
                                                      <th className="px-3 py-1.5 text-right font-black">SL TP</th>
                                                      <th
                                                        className="px-3 py-1.5 text-right font-black"
                                                        title="Định lượng kg / 1 ĐVT SP"
                                                      >
                                                        Định lượng (kg)
                                                      </th>
                                                      <th
                                                        className="px-3 py-1.5 text-right font-black"
                                                        title="Định lượng × SL dòng lệnh"
                                                      >
                                                        Tổng (kg)
                                                      </th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {nvlItems.length === 0 ? (
                                                      <tr>
                                                        <td
                                                          colSpan={7}
                                                          className="px-3 py-3 text-center font-bold text-zinc-400"
                                                        >
                                                          SP chưa có thành phần NVL trên danh mục hàng.
                                                        </td>
                                                      </tr>
                                                    ) : (
                                                      nvlItems.map((item, nvlIndex) => (
                                                        <tr
                                                          key={`${row.key}|nvl:${item.ma_nvl || nvlIndex}`}
                                                          className="border-t border-violet-100 bg-white hover:bg-violet-50/50"
                                                        >
                                                          <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                                            {item.ma_nvl || '—'}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-zinc-700">
                                                            {item.ten_nvl || '—'}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-zinc-600">
                                                            {item.don_vi || (item.loai === 'percent' ? '%' : '—')}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-violet-800">
                                                            {item.phan_tram != null
                                                              ? `${formatNumber(item.phan_tram, 2)}%`
                                                              : '—'}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right font-mono text-zinc-700">
                                                            {item.so_luong != null
                                                              ? formatNumber(item.so_luong, 3)
                                                              : '—'}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-indigo-700">
                                                            {formatKg(item.dinh_luong_kg, 4)}
                                                          </td>
                                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">
                                                            {formatKg(item.tong_dinh_luong_kg, 2)}
                                                          </td>
                                                        </tr>
                                                      ))
                                                    )}
                                                  </tbody>
                                                </table>
                                              </div>
                                            </td>
                                          </tr>
                                        ) : null}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && orderGroupsMerged.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-right uppercase tracking-wider">
                    Tổng cộng ({orderGroupsMerged.length} lệnh)
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{formatNumber(orderTotals.quantity, 2)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">
                    {formatKg(orderTotals.totalNormKg, 2)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-teal-700">
                    {orderTotals.totalNormKg > 0 ? '100%' : '—'}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'phieu_xuat_kho' ? (
          <div className="space-y-4">
          {!isLoading && exportLinkStats.totalLines > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <span>
                Liên thông lệnh SX:{' '}
                <span className="font-black text-emerald-700">{exportLinkStats.matchedLines}</span> dòng khớp mã
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <span className="font-black text-amber-700">{exportLinkStats.fallbackLines}</span> dòng chỉ theo ngày+ca
              </span>
              {exportLinkStats.fallbackLines > 0 ? (
                <span className="w-full text-[11px] font-medium text-amber-800/90">
                  Phiếu XK chưa gắn mã lệnh trong lý do sẽ gán theo ngày+ca. Sửa phiếu và chọn lệnh SX rồi lưu lại để liên thông đúng.
                </span>
              ) : null}
            </div>
          ) : null}
          <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900">
                Tổng NVL đã xuất
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm font-semibold">
                <thead className="bg-emerald-50/80 text-xs uppercase tracking-wider text-emerald-900">
                  <tr>
                    <th className="px-4 py-2.5 font-black">STT</th>
                    <th className="px-4 py-2.5 font-black">Mã NVL</th>
                    <th className="px-4 py-2.5 font-black">Tên nguyên vật liệu</th>
                    <th className="px-4 py-2.5 text-right font-black">ĐVT</th>
                    <th className="px-4 py-2.5 text-right font-black">SL xuất</th>
                    <th className="px-4 py-2.5 text-right font-black">Tổng (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-bold text-zinc-400">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Đang tải tổng NVL xuất kho...
                      </td>
                    </tr>
                  ) : exportMaterialTotals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-bold text-zinc-400">
                        Chưa có NVL xuất kho trong khoảng lọc.
                      </td>
                    </tr>
                  ) : (
                    exportMaterialTotals.map((row, index) => (
                      <tr
                        key={row.key}
                        className="cursor-pointer hover:bg-emerald-100/60"
                        title="Bấm để xem định mức từng sản phẩm theo tỉ lệ %"
                        onClick={() =>
                          setSelectedMaterialTotalDetail(buildMaterialTotalDetail(row, exportGroups))
                        }
                      >
                        <td className="px-4 py-2 font-mono font-bold text-emerald-700">{index + 1}</td>
                        <td className="px-4 py-2 font-mono font-black text-emerald-900 underline decoration-dotted underline-offset-2">
                          {row.itemCode || '—'}
                        </td>
                        <td className="px-4 py-2 font-semibold text-zinc-800 underline decoration-dotted underline-offset-2">
                          {row.itemName || '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-600">{row.unit || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                          {row.quantity > 0 ? formatNumber(row.quantity, 3) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-black text-amber-800">
                          {row.weightKg > 0 ? formatKg(row.weightKg, 2) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && exportMaterialTotals.length > 0 ? (
                  <tfoot className="border-t-2 border-emerald-300 bg-emerald-50 text-xs font-black text-emerald-950">
                    <tr>
                      <td colSpan={5} className="px-4 py-2.5 text-right uppercase tracking-wider">
                        Tổng lượng nhựa
                        <span className="ml-1 font-semibold normal-case tracking-normal text-emerald-700/80">
                          (ĐVT kg, cột Quy về kg)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-800">
                        {exportMaterialTotalsByUnit.kgWeight > 0
                          ? formatKg(exportMaterialTotalsByUnit.kgWeight, 2)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-4 py-2.5 text-right uppercase tracking-wider">
                        Tổng vật tư khác
                        <span className="ml-1 font-semibold normal-case tracking-normal text-emerald-700/80">
                          (ĐVT ≠ kg, cột Quy về kg)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-800">
                        {exportMaterialTotalsByUnit.otherWeight > 0
                          ? formatKg(exportMaterialTotalsByUnit.otherWeight, 2)
                          : '—'}
                      </td>
                    </tr>
                    <tr className="border-t border-emerald-400/80 bg-emerald-100/80">
                      <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider">
                        Tổng cộng
                        <span className="ml-1 font-semibold normal-case tracking-normal text-emerald-800/80">
                          = nhựa + vật tư khác
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-900">
                        {formatKg(exportMaterialTotalsByUnit.totalWeight || exportMaterialTotalKg, 2)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </section>

          <table className="min-w-[1180px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng NVL</th>
                <th className="px-4 py-3.5 text-right font-black">Định mức (kg)</th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần"
                >
                  Trọng lượng định mức
                </th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức mã NVL đó trong cả Lệnh SX"
                >
                  Tỉ lệ %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải phiếu xuất kho...
                  </td>
                </tr>
              ) : exportGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có phiếu xuất kho NVL gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                exportGroups.map(group => {
                  const expanded = isGroupExpanded('phieu_xuat_kho', group.groupKey);
                  const groupLines = group.productGroups.flatMap(pg => pg.lines || []);
                  const groupMaterialTotals = sumTrongLuongDinhMucKgByMaterial(groupLines);
                  const openGroupSummary = () =>
                    setSelectedExportSummary({
                      title: `Lệnh SX ${group.orderCode || '—'}`,
                      subtitle: `${group.ngay || '—'} · ${group.shiftLabel || group.shift || '—'} · ${group.machine || '—'}`,
                      lines: groupLines
                    });
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-amber-200 bg-amber-50/60 font-bold hover:bg-amber-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('phieu_xuat_kho', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-800 shadow-sm transition hover:bg-amber-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {group.orderCode || '—'}
                            {group.unmatchedCount > 0 ? (
                              <span
                                className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900"
                                title={`${group.unmatchedCount} dòng chỉ khớp ngày+ca, chưa gắn mã lệnh trên phiếu XK`}
                              >
                                {group.unmatchedCount}/{group.lineCount} ngày+ca
                              </span>
                            ) : group.lineCount > 0 ? (
                              <span
                                className="rounded-md border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-900"
                                title="Mọi dòng phiếu XK đã khớp mã lệnh SX"
                              >
                                khớp lệnh
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600">{group.lineCount}</td>
                        <td
                          className="px-4 py-2.5 text-right font-mono font-black text-emerald-700"
                          title="Tổng số lượng sản phẩm × định mức kg/đơn vị trong bảng Sản phẩm"
                        >
                          <ThucDungMetricButton
                            label={formatKg(group.totalNormWeightKg, 2)}
                            className="font-mono font-black text-emerald-700"
                            onOpen={openGroupSummary}
                            title="Bấm để xem nguồn và công thức định mức"
                          />
                        </td>
                        <td
                          className="px-4 py-2.5 text-right font-mono font-black text-lime-700"
                          title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần — cộng dồn cả phiếu"
                        >
                          <ThucDungMetricButton
                            label={formatKg(sumTrongLuongDinhMucKg(groupLines), 2)}
                            className="font-mono font-black text-lime-700"
                            onOpen={openGroupSummary}
                            title="Bấm để xem công thức Trọng lượng định mức"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-400">—</td>
                      </tr>
                      {expanded ? (
                        <>
                          {group.productGroups.map(productGroup => {
                            const productGroupKey = `${group.groupKey}|product:${productGroup.productKey}`;
                            const productExpanded = isGroupExpanded('phieu_xuat_kho', productGroupKey);
                            const productLines = productGroup.lines || [];
                            const openProductSummary = () =>
                              setSelectedExportSummary({
                                title: productGroup.productName || productGroup.productCode || 'Sản phẩm',
                                subtitle: `${productGroup.productCode || '—'} · Lệnh SX ${group.orderCode || '—'}`,
                                lines: productLines
                              });
                            return (
                              <React.Fragment key={productGroupKey}>
                                <tr className="border-y border-sky-200 bg-sky-50 font-bold text-sky-950 hover:bg-sky-100/80">
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => toggleGroup('phieu_xuat_kho', productGroupKey)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                                      title={productExpanded ? 'Đóng NVL của sản phẩm' : 'Mở NVL của sản phẩm'}
                                      aria-expanded={productExpanded}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${productExpanded ? '' : '-rotate-90'}`}
                                      />
                                    </button>
                                  </td>
                                  <td colSpan={4} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">
                                        Sản phẩm
                                      </span>
                                      {productGroup.productCode ? (
                                        <span className="font-mono font-black text-sky-900">{productGroup.productCode}</span>
                                      ) : null}
                                      <span className="font-black text-zinc-900">{productGroup.productName || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-sky-800">
                                    {productGroup.lineCount} dòng
                                  </td>
                                  <td
                                    className="px-3 py-2 text-right font-mono font-black text-emerald-700"
                                    title={`${formatNumber(productGroup.orderQuantity, 3)} × ${formatKg(productGroup.normKgPerUnit, 2)}`}
                                  >
                                    {productGroup.normKgPerUnit === null ? '—' : (
                                      <ThucDungMetricButton
                                        label={formatKg(productGroup.normWeightKg, 2)}
                                        className="font-mono font-black text-emerald-700"
                                        onOpen={openProductSummary}
                                        title="Bấm để xem nguồn và công thức định mức"
                                      />
                                    )}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-right font-mono font-black text-lime-700"
                                    title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần — cộng dồn theo SP"
                                  >
                                    <ThucDungMetricButton
                                      label={formatKg(sumTrongLuongDinhMucKg(productLines), 2)}
                                      className="font-mono font-black text-lime-700"
                                      onOpen={openProductSummary}
                                      title="Bấm để xem công thức Trọng lượng định mức"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-zinc-400">—</td>
                                </tr>
                                {productExpanded ? (
                                  <>
                                    <tr className="border-y border-amber-100 bg-amber-50 text-xs font-black uppercase tracking-wider text-amber-900">
                                      <td />
                                      <td className="px-3 py-1.5 font-black">Ngày</td>
                                      <td className="px-3 py-1.5 font-black">Mã NPL</td>
                                      <td colSpan={2} className="px-3 py-1.5 font-black">
                                        Tên NPL
                                      </td>
                                      <td className="px-3 py-1.5 font-black">ĐVT</td>
                                      <td className="px-3 py-1.5 text-right font-black">SL định mức</td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Số lượng của SP × Khối lượng (kg) mã NVL này trong bảng Thành phần"
                                      >
                                        Trọng lượng định mức
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức mã NVL đó trong cả Lệnh SX"
                                      >
                                        Tỉ lệ %
                                      </td>
                                    </tr>
                                    {productGroup.lines.length === 0 ? (
                                      <tr className="bg-white">
                                        <td />
                                        <td colSpan={8} className="px-3 py-3 text-center text-xs font-bold text-zinc-400">
                                          Chưa có NVL xuất kho khớp với thành phần của sản phẩm này.
                                        </td>
                                      </tr>
                                    ) : (
                                      productGroup.lines.map(row => (
                                        <tr key={row.key} className="bg-white font-semibold hover:bg-amber-50/60">
                                          <td className="px-2 py-1.5" />
                                          <td className="px-3 py-1.5 font-mono text-zinc-700">{row.ngay || '—'}</td>
                                          <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                            {row.itemCode || '—'}
                                          </td>
                                          <td colSpan={2} className="px-3 py-1.5 text-zinc-700">
                                            {row.itemName || '—'}
                                          </td>
                                          <td className="px-3 py-1.5 text-zinc-600">{row.unit || '—'}</td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-violet-800">
                                            {isWarehouseKgUnit(row.unit) ||
                                            row.normQuantity === null ||
                                            row.normQuantity <= 0
                                              ? '—'
                                              : row.materialNorm
                                                ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => setSelectedMaterialNorm(row.materialNorm)}
                                                      className="rounded-md px-1.5 py-0.5 font-mono font-black text-violet-800 underline decoration-dotted underline-offset-2 transition hover:bg-violet-100 hover:text-violet-950"
                                                      title="Bấm để xem công thức tính định mức"
                                                    >
                                                      {formatNumber(row.normQuantity, 3)}
                                                    </button>
                                                  )
                                                : formatNumber(row.normQuantity, 3)}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-lime-700">
                                            {computeTrongLuongDinhMucKg(row) === null ? (
                                              '—'
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setSelectedTrongLuongDinhMuc(row)}
                                                className="rounded-md px-1.5 py-0.5 font-mono font-black text-lime-700 underline decoration-dotted underline-offset-2 transition hover:bg-lime-100 hover:text-lime-950"
                                                title="Bấm để xem công thức Trọng lượng định mức"
                                              >
                                                {formatKg(computeTrongLuongDinhMucKg(row), 2)}
                                              </button>
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                            {formatPercent(computeTrongLuongDinhMucPercent(row, groupMaterialTotals), 2)}
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && exportGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">
                    {formatKg(exportTotalNormKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-lime-700">
                    {formatKg(exportTotalTrongLuongDinhMucKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-zinc-400">—</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          </div>
        ) : activeTab === 'ton_dau_ca' ? (
          <table className="min-w-[1280px] w-full table-fixed text-left text-sm font-semibold">
            <colgroup>
              <col className="w-10" />
              <col className="w-[7.5rem]" />
              <col />
              <col className="w-[5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
            </colgroup>
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-2 py-3.5 font-black" />
                <th className="px-3 py-3.5 font-black">Ngày</th>
                <th className="px-3 py-3.5 font-black">Ca</th>
                <th className="px-3 py-3.5 font-black">Lệnh SX</th>
                <th className="px-3 py-3.5 font-black">Máy</th>
                <th colSpan={2} className="px-3 py-3.5 text-right font-black">
                  SP / NVL
                </th>
                <th className="px-3 py-3.5 text-right font-black">Tồn đầu ca (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo tồn đầu ca...
                  </td>
                </tr>
              ) : dauCaGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có báo cáo tồn đầu ca gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                dauCaGroups.map(group => {
                  const expanded = isGroupExpanded('ton_dau_ca', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-indigo-200 bg-indigo-50/60 font-bold hover:bg-indigo-100/50 transition">
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('ton_dau_ca', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-300 bg-white text-indigo-800 shadow-sm transition hover:bg-indigo-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td colSpan={2} className="px-3 py-2.5 text-right font-mono font-bold text-zinc-600">
                          {group.productCount}/{group.lineCount}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-800">
                          {formatKg(group.totalWeightKg, 4)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-indigo-50/30">
                          <td colSpan={8} className="p-0">
                            <BbDauCaMaterialSplitTables
                              materialLines={group.materialLines || []}
                              tonColumnLabel="Tồn đầu (kg)"
                              onOpenTonFormula={setSelectedTonDauFormula}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && dauCaGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={7} className="px-3 py-3.5 text-right uppercase tracking-wider">
                    Tổng
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-indigo-800">{formatKg(dauCaTotalKg, 4)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'bao_cao_san_luong' && sanLuongSource === 'can-tu-dong' ? (
          <BbCanTuDongTongHopPanel
            isLoading={isLoading}
            products={products}
            shiftFilter={shiftFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            machineFilter={machineFilter}
            selectedMachine={selectedMachine}
          />
        ) : activeTab === 'bao_cao_san_luong' || activeTab === 'bao_cao_san_luong_phieu' ? (
          <BbSanLuongReportPanel
            groups={sanLuongGroups}
            isLoading={isLoading}
            shiftSettings={shiftSettings}
          />
        ) : activeTab === 'bao_cao_loi_hong' ? (
          <>
            {damagedGroupsWithMixing.length > 0 ? (
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(true)}
                    disabled={damagedGroupsWithMixing.every(g => isGroupExpanded('bao_cao_loi_hong', g.groupKey))}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-black text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:cursor-default disabled:opacity-40"
                  >
                    Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(false)}
                    disabled={damagedGroupsWithMixing.every(g => !isGroupExpanded('bao_cao_loi_hong', g.groupKey))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
                  >
                    Đóng tất cả
                  </button>
                </div>
              </div>
            ) : null}

            <div className="bb-table-scroll bb-report-sheet-scroll">
          <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng NVL</th>
                <th className="px-4 py-3.5 text-right font-black">Lỗi hỏng (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu lỗi hỏng từ Báo cáo sản lượng...
                  </td>
                </tr>
              ) : damagedGroupsWithMixing.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có phiếu Báo cáo sản lượng loại Hàng hỏng / Hàng rác gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                damagedGroupsWithMixing.map(group => {
                  const expanded = isGroupExpanded('bao_cao_loi_hong', group.groupKey);
                  const groupIsInsulation = isInsulationMachine || isInsulationMachineText(group.machine);
                  const filmScrapKg = groupIsInsulation ? sumBbDamagedFilmScrapKg(group.lines) : 0;
                  const filmScrapMaterial =
                    group.filmScrapMaterial ||
                    (groupIsInsulation && filmScrapKg > 0
                      ? resolveBbLoiHongFilmScrapMaterialForShift({
                          productionOrders: scopedProductionOrders,
                          products,
                          materials,
                          warehouseMovements,
                          shiftSettings,
                          ngay: group.ngay,
                          shift: group.shift,
                          orderCode: group.orderCode,
                          damagedLines: group.lines
                        })
                      : null);
                  const plasticLoiHongKg = resolveBbDamagedPlasticLoiHongKg(group.lines, {
                    isInsulationMachine: groupIsInsulation
                  });
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-rose-200 bg-rose-50/60 font-bold hover:bg-rose-100/50 transition">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup('bao_cao_loi_hong', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-800 shadow-sm transition hover:bg-rose-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-600">
                          {group.mixingLineCount}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-mono font-bold text-rose-800"
                          title={
                            groupIsInsulation && filmScrapKg > 0
                              ? `Nhựa ${formatKg(plasticLoiHongKg, 2)} kg · Rác màng xi ${formatKg(filmScrapKg, 2)} kg`
                              : undefined
                          }
                        >
                          {formatKg(plasticLoiHongKg, 2)}
                          {groupIsInsulation && filmScrapKg > 0 ? (
                            <span className="mt-0.5 block text-[10px] font-semibold text-orange-700">
                              + VT khác {formatKg(filmScrapKg, 2)} kg
                            </span>
                          ) : null}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-rose-50/20">
                          <td colSpan={7} className="px-2 py-3">
                            {(() => {
                              const { mixingKgLines, otherMaterialLines } = splitBbLoiHongMaterialLinesByMixing(
                                group.mixingLines
                              );
                              const resolveLoiHongTiLe = (row: (typeof mixingKgLines)[number]) =>
                                row.tiLeTronPercent != null && row.tiLeTronPercent > 0
                                  ? row.tiLeTronPercent
                                  : row.tiLeDinhMucPercent;
                              const resolveLoiHongWeightKg = (tiLe: number | null) =>
                                tiLe !== null &&
                                Number.isFinite(tiLe) &&
                                tiLe > 0 &&
                                Number.isFinite(plasticLoiHongKg)
                                  ? Math.round(((plasticLoiHongKg * tiLe) / 100) * 100) / 100
                                  : null;
                              const mixingLoiHongTotalKg = mixingKgLines.reduce((sum, row) => {
                                const weight = resolveLoiHongWeightKg(resolveLoiHongTiLe(row));
                                return sum + (weight != null && weight > 0 ? weight : 0);
                              }, 0);
                              return (
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
                                  <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-6">
                                    <div className="border-b border-rose-200 bg-rose-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-rose-900">
                                      NVL trộn · ĐVT kg
                                      {mixingKgLines.length > 0 ? ` (${mixingKgLines.length})` : ''}
                                    </div>
                                    <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                      <thead className="bg-rose-50 text-xs uppercase tracking-wider text-rose-900">
                                        <tr>
                                          <th className="px-3 py-2 font-black">Mã NVL</th>
                                          <th className="px-3 py-2 font-black">Tên nguyên phụ liệu</th>
                                          <th className="px-3 py-2 font-black">ĐVT</th>
                                          <th className="px-3 py-2 text-right font-black">Tỉ lệ trộn (%)</th>
                                          <th
                                            className="px-3 py-2 text-right font-black"
                                            title={
                                              groupIsInsulation
                                                ? 'Tổng nhựa lỗi hỏng (đã trừ rác màng xi) × Tỉ lệ BOM (%)'
                                                : 'Tổng lỗi hỏng × Tỉ lệ trộn (%)'
                                            }
                                          >
                                            Trọng lượng lỗi
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-rose-50">
                                        {mixingKgLines.length === 0 ? (
                                          <tr>
                                            <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                              Chưa có NVL trộn ĐVT kg trên BOM lệnh SX.
                                            </td>
                                          </tr>
                                        ) : (
                                          mixingKgLines.map(row => {
                                            const tiLe = resolveLoiHongTiLe(row);
                                            const trongLuongLoiKg = resolveLoiHongWeightKg(tiLe);
                                            return (
                                              <tr key={row.key} className="hover:bg-rose-50/40">
                                                <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-2 text-zinc-600">{row.unit || 'kg'}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-orange-800">
                                                  {formatPercent(tiLe, 2)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">
                                                  {trongLuongLoiKg === null ? '—' : formatKg(trongLuongLoiKg, 2)}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      {mixingKgLines.length > 0 ? (
                                        <tfoot className="border-t border-rose-200 bg-rose-50 text-xs font-black text-rose-900">
                                          <tr>
                                            <td colSpan={4} className="px-3 py-2 text-right uppercase tracking-wider">
                                              Tổng nhựa lỗi hỏng
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(mixingLoiHongTotalKg, 2)}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      ) : null}
                                    </table>
                                  </div>

                                  <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-4">
                                    <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
                                      NVL còn lại
                                      {otherMaterialLines.length > 0 ||
                                      (groupIsInsulation && filmScrapKg > 0)
                                        ? ` (${otherMaterialLines.length + (groupIsInsulation && filmScrapKg > 0 ? 1 : 0)})`
                                        : ''}
                                    </div>
                                    <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-700">
                                        <tr>
                                          <th className="px-3 py-2 font-black">Mã NVL</th>
                                          <th className="px-3 py-2 font-black">Tên nguyên phụ liệu</th>
                                          <th className="px-3 py-2 font-black">ĐVT</th>
                                          <th className="px-3 py-2 text-right font-black">Tỉ lệ trộn (%)</th>
                                          <th className="px-3 py-2 text-right font-black">Trọng lượng lỗi</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {otherMaterialLines.length === 0 &&
                                        !(groupIsInsulation && filmScrapKg > 0) ? (
                                          <tr>
                                            <td colSpan={5} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                              Không có NVL khác trên BOM lệnh SX.
                                            </td>
                                          </tr>
                                        ) : (
                                          <>
                                            {otherMaterialLines.map(row => (
                                              <tr key={row.key} className="hover:bg-slate-50/80">
                                                <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-2 text-zinc-600">{row.unit || '—'}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-zinc-400">
                                                  —
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-zinc-400">
                                                  —
                                                </td>
                                              </tr>
                                            ))}
                                            {groupIsInsulation && filmScrapKg > 0 ? (
                                              <tr className="bg-orange-50/50 font-semibold">
                                                <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                                                  {filmScrapMaterial?.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-orange-900">Rác màng xi (Vật tư khác)</td>
                                                <td className="px-3 py-2 text-zinc-600">
                                                  {filmScrapMaterial?.unit || 'kg'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-zinc-400">
                                                  —
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-orange-800">
                                                  {formatKg(filmScrapKg, 2)}
                                                </td>
                                              </tr>
                                            ) : null}
                                          </>
                                        )}
                                      </tbody>
                                      {groupIsInsulation && filmScrapKg > 0 ? (
                                        <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-black text-slate-800">
                                          <tr>
                                            <td colSpan={4} className="px-3 py-2 text-right uppercase tracking-wider">
                                              VT khác
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-orange-800">
                                              {formatKg(filmScrapKg, 2)}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      ) : null}
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && damagedGroupsWithMixing.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng hàng lỗi hỏng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-rose-800">{formatKg(damagedTotalKg, 2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
            </div>
          </>
        ) : activeTab === 'kiem_ton_cuoi_ca' ? (
          <table className="min-w-[1280px] w-full table-fixed text-left text-sm font-semibold">
            <colgroup>
              <col className="w-10" />
              <col className="w-[7.5rem]" />
              <col />
              <col className="w-[5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
            </colgroup>
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-2 py-3.5 font-black" />
                <th className="px-3 py-3.5 font-black">Ngày</th>
                <th className="px-3 py-3.5 font-black">Ca</th>
                <th className="px-3 py-3.5 font-black">Lệnh SX</th>
                <th className="px-3 py-3.5 font-black">Máy</th>
                <th colSpan={2} className="px-3 py-3.5 text-right font-black">
                  SP / NVL
                </th>
                <th className="px-3 py-3.5 text-right font-black">Tồn cuối ca (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải kiểm tồn cuối ca...
                  </td>
                </tr>
              ) : cuoiCaGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có báo cáo kiểm tồn cuối ca gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                cuoiCaGroups.map(group => {
                  const expanded = isGroupExpanded('kiem_ton_cuoi_ca', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-violet-200 bg-violet-50/60 font-bold hover:bg-violet-100/50 transition">
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('kiem_ton_cuoi_ca', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm transition hover:bg-violet-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td colSpan={2} className="px-3 py-2.5 text-right font-mono font-bold text-zinc-600">
                          {group.productCount}/{group.lineCount}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-violet-800">
                          {formatKg(group.totalWeightKg, 4)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-violet-50/30">
                          <td colSpan={8} className="p-0">
                            <BbDauCaMaterialSplitTables
                              materialLines={group.materialLines || []}
                              tonColumnLabel="Tồn cuối (kg)"
                              onOpenTonFormula={setSelectedTonDauFormula}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && cuoiCaGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={7} className="px-3 py-3.5 text-right uppercase tracking-wider">
                    Tổng tồn cuối ca
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-violet-800">
                    {formatKg(cuoiCaTotalKg, 4)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'phieu_nhap_kho' ? (
          <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
            <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="px-3 py-2.5 text-right font-black">Số Lượng Đạt thực tế (Cuộn)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng nhựa đã trộn (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng TP nhập kho (Kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo phiếu nhập kho...
                  </td>
                </tr>
              ) : inboundRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu phiếu nhập kho gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                inboundRows.map(row => (
                  <tr key={row.key} className="hover:bg-cyan-50/40">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-800">{row.ngay || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700">{row.shiftLabel || row.shift || '—'}</td>
                    <td className="px-3 py-2 font-mono font-black text-sky-800">{row.orderCode || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700">{row.machine || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-sky-700">
                      {formatNumber(row.acceptedRolls, 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                      {formatKg(row.mixedPlasticKg, 2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                      {formatKg(row.finishedGoodsInboundKg, 2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && inboundRows.length > 0 ? (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-700">
                    {formatNumber(inboundTotals.acceptedRolls, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">
                    {formatKg(inboundTotals.mixedPlasticKg, 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {formatKg(inboundTotals.finishedGoodsInboundKg, 2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'bao_cao_tieu_hao_nvl' ? (
          <table className="min-w-[1860px] w-full whitespace-nowrap text-left text-sm font-semibold">
            <colgroup>
              <col className="w-14" />
              <col className="w-[130px]" />
              <col className="w-[320px]" />
              <col className="w-[150px]" />
              <col className="w-[180px]" />
              <col className="w-[160px]" />
              <col className="w-[210px]" />
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[260px]" />
            </colgroup>
            <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-2 py-2.5 font-black" />
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th
                  className="px-3 py-2.5 text-right font-black"
                  title="Tổng KL thực tế trên danh sách báo cáo phối trộn (ngày+ca+máy)"
                >
                  Tổng thực trộn (kg)
                </th>
                <th className="px-3 py-2.5 text-right font-black">Tổng xuất trong ngày (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng vật tư thực xuất dùng (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải vật tư thực dùng &amp; tỉ lệ trộn...
                  </td>
                </tr>
              ) : thucDungGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu thực xuất dùng / tỉ lệ trộn gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                thucDungGroups.map(group => {
                  const expanded = isGroupExpanded(activeTab, group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-teal-200 bg-teal-100/80 font-bold hover:bg-teal-100">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup(activeTab, group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-teal-300 bg-white text-teal-800 shadow-sm transition hover:bg-teal-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">
                          {formatKg(group.thucTronTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.xuatCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonDauCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonCuoiCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-teal-800">
                          {formatKg(group.totalWeightKg, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-zinc-50/80">
                          <td colSpan={10} className="px-2 py-3">
                            {group.lines.length === 0 ? (
                              <p className="px-2 py-4 text-center text-sm font-semibold text-zinc-400">
                                Chưa có dòng NVL từ báo cáo trộn.
                              </p>
                            ) : (
                              (() => {
                                const mixingLines = group.lines.filter(
                                  row => row.isPlasticNvl ?? row.inMixingRatioTable
                                );
                                const otherLines = group.lines.filter(
                                  row => !(row.isPlasticNvl ?? row.inMixingRatioTable)
                                );
                                const mixingTotals = group.mixingRatioTotals;
                                const otherTotals = group.otherTotals;
                                /** Tổng nhựa · Nhập TP = banner «Tổng nhựa thành phẩm», không cộng phân bổ từng NVL. */
                                const tongNhuaThanhPhamKg =
                                  mixingLines
                                    .map(row => row.nhuaThanhPhamHeaderKg)
                                    .find(kg => kg != null && Number.isFinite(kg) && kg > 0) ??
                                  mixingTotals?.finishedTotal ??
                                  0;
                                const tongNhuaLoiKg =
                                  mixingLines
                                    .map(row => row.nhuaLoiHeaderKg)
                                    .find(kg => kg != null && Number.isFinite(kg) && kg > 0) ??
                                  mixingTotals?.damagedTotal ??
                                  0;
                                const tongNhuaTpPlusLoiKg = tongNhuaThanhPhamKg + tongNhuaLoiKg;
                                return (
                                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
                                    <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-6">
                                      <div className="border-b border-violet-200 bg-violet-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-violet-900">
                                        3.1. NVL nhựa và phụ gia trộn
                                        {mixingLines.length > 0 ? ` (${mixingLines.length})` : ''}
                                      </div>
                                      <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                        <thead className="bg-violet-50 text-xs uppercase tracking-wider text-violet-900">
                                          <tr>
                                            <th className="px-3 py-1.5 font-black">Mã NVL</th>
                                            <th className="px-3 py-1.5 font-black">Tên NVL</th>
                                            <th className="px-3 py-1.5 text-right font-black" title="Tỉ lệ trộn cấu hình trên Danh sách máy">
                                              Tỉ lệ ĐM (%)
                                            </th>
                                            <th className="px-3 py-1.5 text-right font-black" title="KL NVL ÷ tổng KL trộn ca × 100">
                                              Tỉ lệ TB thực tế (%)
                                            </th>
                                            <th className="px-3 py-1.5 text-right font-black">Thực trộn (kg)</th>
                                            <th className="px-3 py-1.5 text-right font-black">Xuất kho</th>
                                            <th className="px-3 py-1.5 text-right font-black">Tồn đầu</th>
                                            <th className="px-3 py-1.5 text-right font-black">Nhập thành phẩm</th>
                                            <th className="px-3 py-1.5 text-right font-black">Lỗi hỏng</th>
                                            <th className="px-3 py-1.5 text-right font-black">Tồn cuối</th>
                                            <th className="px-3 py-1.5 text-right font-black" title="Xuất thực dùng = Tồn đầu + Xuất − Tồn cuối">
                                              Xuất thực dùng
                                            </th>
                                            <th
                                              className="px-3 py-1.5 text-right font-black"
                                              title="TP + Lỗi hỏng = Nhập thành phẩm + Lỗi hỏng"
                                            >
                                              TP + Lỗi hỏng
                                            </th>
                                            <th
                                              className="px-3 py-1.5 text-right font-black"
                                              title="Chênh lệch = Xuất thực dùng − Nhập thành phẩm − Lỗi hỏng"
                                            >
                                              Chênh lệch
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-violet-50">
                                          {mixingLines.length === 0 ? (
                                            <tr>
                                              <td colSpan={11} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                                Không có NVL khớp tỉ lệ trộn máy.
                                              </td>
                                            </tr>
                                          ) : (
                                            mixingLines.map(row => (
                                              <tr key={row.key} className="hover:bg-violet-50/60">
                                                <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                                  <ThucDungMetricButton
                                                    label={formatPercent(row.tiLeDinhMucPercent, 2)}
                                                    className="font-mono text-zinc-600"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'ti_le_dinh_muc' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-orange-800">
                                                  <ThucDungMetricButton
                                                    label={formatPercent(row.tiLeThucTeTbPercent, 2)}
                                                    className="font-mono font-bold text-orange-800"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'ti_le_thuc_te' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-violet-800">
                                                  <ThucDungMetricButton
                                                    label={formatKg(row.mixingShiftMaterialKg, 2)}
                                                    className="font-mono font-bold text-violet-800"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'thuc_tron' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                                  <ThucDungMetricButton
                                                    label={formatKg(row.xuatTrongCaKg, 2)}
                                                    className="font-mono text-amber-700"
                                                    onOpen={() =>
                                                      setThucDungDetail({
                                                        line: row,
                                                        metric: 'trong_luong_da_tron'
                                                      })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                                  <ThucDungMetricButton
                                                    label={formatKg(row.tonDauKg, 2)}
                                                    className="font-mono text-zinc-600"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'ton_dau' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-sky-800">
                                                  {formatKg(row.klThucTeKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-rose-700">
                                                  {formatKg(row.loiHongKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                                  <ThucDungMetricButton
                                                    label={formatKg(row.tonCuoiKg, 2)}
                                                    className="font-mono text-zinc-600"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'ton_cuoi' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                                  <ThucDungMetricButton
                                                    label={formatKg(row.weightKg, 2)}
                                                    className="font-mono font-bold text-teal-700"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'thuc_dung' })
                                                    }
                                                  />
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-indigo-800">
                                                  <ThucDungMetricButton
                                                    label={formatKg(resolveKlNhuaTtLoiKg(row), 2)}
                                                    className="font-mono font-bold text-indigo-800"
                                                    onOpen={() =>
                                                      setThucDungDetail({ line: row, metric: 'kl_nhua_tt_loi' })
                                                    }
                                                  />
                                                </td>
                                                <td
                                                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                                                    resolveChenhLechKg(row) < 0
                                                      ? 'text-rose-700'
                                                      : resolveChenhLechKg(row) > 0
                                                        ? 'text-emerald-700'
                                                        : 'text-zinc-600'
                                                  }`}
                                                >
                                                  {formatSignedKg(resolveChenhLechKg(row), 2)}
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                          {mixingTotals && mixingLines.length > 0 ? (
                                          <tfoot className="border-t border-violet-200 bg-violet-50 text-xs font-black text-violet-900">
                                            <tr>
                                              <td colSpan={4} className="px-3 py-2 text-right uppercase tracking-wider">
                                                Tổng nhựa
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(mixingTotals.thucTronTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(mixingTotals.xuatCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(mixingTotals.tonDauCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(tongNhuaThanhPhamKg, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(tongNhuaLoiKg, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(mixingTotals.tonCuoiCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(mixingTotals.totalWeightKg, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(tongNhuaTpPlusLoiKg, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatSignedKg(mixingTotals.chenhLechTotal, 2)}
                                              </td>
                                            </tr>
                                          </tfoot>
                                        ) : null}
                                      </table>
                                    </div>

                                    <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-4">
                                      <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
                                        3.2. NVL khác
                                        {otherLines.length > 0 ? ` (${otherLines.length})` : ''}
                                      </div>
                                      <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-700">
                                          <tr>
                                            <th className="px-3 py-1.5 font-black">Mã NVL</th>
                                            <th className="px-3 py-1.5 font-black">Tên NVL</th>
                                            <th className="px-3 py-1.5 text-center font-black">ĐVT</th>
                                            <th className="px-3 py-1.5 text-right font-black">SL TP</th>
                                            <th className="px-3 py-1.5 text-right font-black">Xuất kho</th>
                                            <th className="px-3 py-1.5 text-right font-black">Tồn đầu</th>
                                            <th className="px-3 py-1.5 text-right font-black">Nhập TP</th>
                                            <th className="px-3 py-1.5 text-right font-black">Lỗi hỏng</th>
                                            <th className="px-3 py-1.5 text-right font-black">Tồn cuối</th>
                                            <th className="px-3 py-1.5 text-right font-black">Xuất thực dùng</th>
                                            <th className="px-3 py-1.5 text-right font-black" title="Nhập TP + Lỗi hỏng">
                                              TP + Lỗi
                                            </th>
                                            <th
                                              className="px-3 py-1.5 text-right font-black"
                                              title="Xuất thực dùng − Nhập TP − Lỗi hỏng"
                                            >
                                              Chênh lệch
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {otherLines.length === 0 ? (
                                            <tr>
                                              <td colSpan={12} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                                Không có NVL khác.
                                              </td>
                                            </tr>
                                          ) : (
                                            otherLines.map(row => (
                                              <tr key={row.key} className="hover:bg-slate-50/80">
                                                <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-1.5 text-center font-mono text-zinc-600">
                                                  {row.unit || '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-700">
                                                  {formatKg(row.finishedQty ?? 0, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                                  {formatKg(row.xuatTrongCaKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                                  {formatKg(row.tonDauKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-sky-800">
                                                  {formatKg(row.klThucTeKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-rose-700">
                                                  {formatKg(row.loiHongKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                                  {formatKg(row.tonCuoiKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                                  {formatKg(row.weightKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-indigo-800">
                                                  {formatKg(resolveKlNhuaTtLoiKg(row), 2)}
                                                </td>
                                                <td
                                                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                                                    resolveChenhLechKg(row) < 0
                                                      ? 'text-rose-700'
                                                      : resolveChenhLechKg(row) > 0
                                                        ? 'text-emerald-700'
                                                        : 'text-zinc-600'
                                                  }`}
                                                >
                                                  {formatSignedKg(resolveChenhLechKg(row), 2)}
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                        {otherTotals && otherLines.length > 0 ? (
                                          <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-black text-slate-800">
                                            <tr>
                                              <td colSpan={4} className="px-3 py-2 text-right uppercase tracking-wider">
                                                Tổng vật tư khác
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.xuatCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.tonDauCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.finishedTotal ?? 0, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.damagedTotal ?? 0, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.tonCuoiCaTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.totalWeightKg, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatKg(otherTotals.klThucTePlusLoiTotal, 2)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-mono">
                                                {formatSignedKg(otherTotals.chenhLechTotal, 2)}
                                              </td>
                                            </tr>
                                          </tfoot>
                                        ) : null}
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        ) : activeTab === 'tong_hop_vat_tu_thuc_xuat_dung' ? (
          <table className="min-w-[1500px] w-full whitespace-nowrap text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-emerald-100 to-teal-50 border-b-2 border-emerald-300 text-xs uppercase tracking-wider text-emerald-900">
              <tr>
                <th className="w-10 px-2 py-2.5 font-black" />
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="px-3 py-2.5 text-right font-black">SP / NVL</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Xuất thực tế (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th
                  className="px-3 py-2.5 text-right font-black"
                  title="Thực dùng (kg) = Tồn đầu ca + Xuất thực tế − Tồn cuối ca"
                >
                  Thực dùng (kg)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải tổng hợp vật tư thực xuất dùng...
                  </td>
                </tr>
              ) : tongHopThucXuatGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có NVL từ báo cáo phối trộn gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                tongHopThucXuatGroups.map(group => {
                  const expanded = isGroupExpanded('tong_hop_vat_tu_thuc_xuat_dung', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-emerald-200 bg-emerald-50/80 font-bold hover:bg-emerald-100/70">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong_hop_vat_tu_thuc_xuat_dung', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-zinc-600">
                          {group.productCount}/{group.lineCount}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonDauCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.xuatCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonCuoiCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                          {formatKg(group.totalThucDungKg, 2)}
                        </td>
                      </tr>
                      {expanded
                        ? (group.productGroups || []).map(productGroup => {
                            const productGroupKey = `${group.groupKey}|product:${productGroup.key}`;
                            const productExpanded = isGroupExpanded(
                              'tong_hop_vat_tu_thuc_xuat_dung',
                              productGroupKey
                            );
                            return (
                              <React.Fragment key={productGroupKey}>
                                <tr className="border-y border-sky-200 bg-sky-50 font-bold text-sky-950 hover:bg-sky-100/80">
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleGroup('tong_hop_vat_tu_thuc_xuat_dung', productGroupKey)
                                      }
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                                      title={
                                        productExpanded ? 'Đóng NVL của sản phẩm' : 'Mở NVL của sản phẩm'
                                      }
                                      aria-expanded={productExpanded}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${productExpanded ? '' : '-rotate-90'}`}
                                      />
                                    </button>
                                  </td>
                                  <td colSpan={4} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">
                                        Sản phẩm
                                      </span>
                                      {productGroup.productCode ? (
                                        <span className="font-mono font-black text-sky-900">
                                          {productGroup.productCode}
                                        </span>
                                      ) : null}
                                      <span className="font-black text-zinc-900">
                                        {productGroup.productName || '—'}
                                      </span>
                                      {productGroup.quantity > 0 ? (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-600 ring-1 ring-sky-200">
                                          SL: {formatNumber(productGroup.quantity, 3)}
                                          {productGroup.unit ? ` ${productGroup.unit}` : ''}
                                        </span>
                                      ) : null}
                                      {productGroup.share > 0 && productGroup.share < 1 ? (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                          Phân bổ {(productGroup.share * 100).toFixed(1)}%
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-zinc-600">
                                    {productGroup.lineCount}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.tonDauTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.xuatTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.tonCuoiTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                                    {formatKg(productGroup.thucDungTotal, 2)}
                                  </td>
                                </tr>
                                {productExpanded ? (
                                  <>
                                    <tr className="border-y border-emerald-100 bg-emerald-50 text-xs font-black uppercase tracking-wider text-emerald-900">
                                      <td />
                                      <td className="px-3 py-1.5 font-black">Mã NVL</td>
                                      <td className="px-3 py-1.5 font-black">Tên NVL (báo cáo phối trộn)</td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Báo cáo dữ liệu tồn đầu ca — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Tồn đầu ca
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Dữ liệu trong phiếu xuất kho vật tư — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Xuất thực tế
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Dữ liệu trong báo cáo kiểm tồn cuối ca — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Tồn cuối ca
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Thực dùng (kg) = Tồn đầu ca + Xuất thực tế − Tồn cuối ca"
                                      >
                                        Thực dùng (kg)
                                      </td>
                                    </tr>
                                    {productGroup.lines.map(row => (
                                      <tr key={row.key} className="bg-white font-semibold hover:bg-emerald-50/60">
                                        <td className="px-2 py-1.5" />
                                        <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                          {row.materialCode || '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                          <ThucDungMetricButton
                                            label={formatKg(row.tonDauKg, 2)}
                                            className="font-mono text-zinc-600"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'ton_dau' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                          <ThucDungMetricButton
                                            label={formatKg(row.xuatTrongCaKg, 2)}
                                            className="font-mono text-amber-700"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'xuat_thuc_te' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                          <ThucDungMetricButton
                                            label={formatKg(row.tonCuoiKg, 2)}
                                            className="font-mono text-zinc-600"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'ton_cuoi' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">
                                          <ThucDungMetricButton
                                            label={formatKg(row.thucDungKg, 2)}
                                            className="font-mono font-bold text-emerald-700"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'thuc_dung' })}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </>
                                ) : null}
                              </React.Fragment>
                            );
                          })
                        : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && tongHopThucXuatGroups.length > 0 ? (
              <tfoot className="border-t-2 border-emerald-300 bg-emerald-50 text-xs font-black text-emerald-950">
                <tr>
                  <td colSpan={9} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Tổng thực dùng
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {formatKg(
                      tongHopThucXuatGroups.reduce((sum, g) => sum + (g.totalThucDungKg || 0), 0),
                      3
                    )}
                  </td>
                </tr>
              </tfoot>
) : null}
          </table>
        ) : activeTab === 'tong' ? (
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Xuất trong ngày (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Thực dùng (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Nhập kho (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải tổng hợp...
                  </td>
                </tr>
              ) : tongGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu tổng hợp gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                tongGroups.map(group => {
                  const expanded = isGroupExpanded('tong', group.groupKey);
                  // Lấy dữ liệu tồn từ các group khác dựa trên groupKey
                  const dauCaGroup = dauCaGroups.find(g => g.groupKey === group.groupKey);
                  const cuoiCaGroup = cuoiCaGroups.find(g => g.groupKey === group.groupKey);
                  const thucDungGroup = thucDungGroups.find(g => g.groupKey === group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-emerald-200 bg-emerald-50/60 font-bold hover:bg-emerald-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-700">{group.shiftLabel || group.shift || '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-700">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-700">
                          {formatKg(dauCaGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tongTrongLuongXuatRa, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-700">
                          {formatKg(cuoiCaGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-700">
                          {formatKg(thucDungGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatKg(group.tongTrongLuongNhapKho, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-emerald-100 bg-emerald-100/40 text-xs font-black uppercase tracking-wider text-emerald-900">
                            <td className="px-3 py-2" />
                            <td colSpan={5} className="px-4 py-2 font-black">
                              Thành phần
                            </td>
                            <td colSpan={4} className="px-4 py-2 text-right font-black">Giá trị (kg)</td>
                          </tr>
                          {group.lines.map(line => (
                            <tr key={line.key} className="bg-white font-semibold hover:bg-emerald-50/40 border-b border-slate-50">
                              <td className="px-3 py-2" />
                              <td colSpan={5} className="px-4 py-2 text-zinc-700">
                                {line.label}
                              </td>
                              <td colSpan={4} className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                                {formatKg(line.valueKg, 2)}
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && tongGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={5} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-indigo-700">
                    {formatKg(dauCaTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-700">
                    {formatKg(exportTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-violet-700">
                    {formatKg(cuoiCaTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-cyan-700">
                    {formatKg(thucDungTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">
                    {formatKg(tongNhapKhoTotalKg, 2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'bao_cao_thanh_pham_nhap_kho' ? (
          <table className="bb-sheet-table min-w-[1480px]">
            <caption>Báo cáo thành phẩm đạt nhập kho</caption>
            <thead>
              <tr>
                <th className="w-10 text-center" />
                <th>Ngày</th>
                <th>Ca</th>
                <th>Lệnh SX</th>
                <th>Máy</th>
                <th className="text-right">Dòng SP</th>
                <th className="text-right">SL yêu cầu</th>
                <th className="text-right">TL yêu cầu (kg)</th>
                <th className="text-right" title="Từ tab Báo cáo sản lượng (SL SP trên phiếu)">
                  SL thực tế
                </th>
                <th className="text-right" title="Từ tab Báo cáo sản lượng (trọng lượng SP trên phiếu)">
                  Trọng lượng thực tế (kg)
                </th>
                <th className="text-right">TL nhựa (kg)</th>
                <th className="text-right">TL màng (kg)</th>
                <th className="text-right">% SL đạt/KH</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải thành phẩm nhập kho...
                  </td>
                </tr>
              ) : thanhPhamNhapKhoOrderGroups.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-zinc-400">
                    Chưa có lệnh SX máy BB theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                thanhPhamNhapKhoOrderGroups.map(group => {
                  const expanded = isGroupExpanded('bao_cao_thanh_pham_nhap_kho', group.groupKey);
                  const groupActualQty =
                    group.actualQuantity ??
                    group.lines.reduce((sum, line) => sum + (line.actualQuantity ?? 0), 0);
                  const groupActualKg =
                    group.actualWeightKg ??
                    group.lines.reduce((sum, line) => sum + (line.actualWeightKg ?? 0), 0);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => toggleGroup('bao_cao_thanh_pham_nhap_kho', group.groupKey)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            title={expanded ? 'Đóng các dòng SP' : 'Mở các dòng SP'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="font-mono">{group.ngay || '—'}</td>
                        <td>{group.shiftLabel || group.shift || '—'}</td>
                        <td className="font-mono font-semibold">{group.orderCode || '—'}</td>
                        <td>{group.machine || '—'}</td>
                        <td className="bb-sheet-num text-slate-600">{group.lineCount}</td>
                        <td className="bb-sheet-num font-semibold">{formatNumber(group.quantity, 2)}</td>
                        <td className="bb-sheet-num font-semibold text-emerald-700">
                          {formatKg(group.totalNormKg, 2)}
                        </td>
                        <td className="bb-sheet-num font-semibold text-sky-800">
                          {groupActualQty > 0 ? formatNumber(groupActualQty, 2) : '—'}
                        </td>
                        <td className="bb-sheet-num font-semibold text-lime-800">
                          {groupActualKg > 0 ? formatKg(groupActualKg, 2) : '—'}
                        </td>
                        <td className="bb-sheet-num font-semibold text-amber-800">
                          {formatKg(
                            group.lines.reduce((sum, line) => sum + (line.actualPlasticWeightKg ?? 0), 0),
                            2
                          )}
                        </td>
                        <td className="bb-sheet-num font-semibold text-fuchsia-800">
                          {formatKg(
                            group.lines.reduce((sum, line) => sum + (line.actualFilmWeightKg ?? 0), 0),
                            2
                          )}
                        </td>
                        <td className="bb-sheet-num font-semibold text-sky-700">
                          {group.quantity > 0 && groupActualQty > 0
                            ? `${formatNumber((groupActualQty / group.quantity) * 100, 1)}%`
                            : '—'}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="text-[11px] font-semibold text-slate-600">
                            <td />
                            <td>Mã SP</td>
                            <td colSpan={2}>Tên SP</td>
                            <td>ĐVT</td>
                            <td className="text-right">SL yêu cầu</td>
                            <td className="text-right">TL yêu cầu (kg)</td>
                            <td className="text-right">SL thực tế</td>
                            <td className="text-right">Trọng lượng thực tế (kg)</td>
                            <td className="text-right">TL nhựa</td>
                            <td className="text-right">TL màng</td>
                            <td className="text-right">% SL đạt/KH</td>
                            <td className="text-right">% KL nhựa</td>
                          </tr>
                          {group.lines.map(line => {
                            const lineActualQty = line.actualQuantity ?? 0;
                            const lineActualKg = line.actualWeightKg ?? 0;
                            return (
                            <tr key={line.key}>
                              <td />
                              <td className="font-mono font-semibold whitespace-nowrap">
                                {line.productCode || '—'}
                              </td>
                              <td colSpan={2}>{line.productName || '—'}</td>
                              <td className="text-center">{line.unit || '—'}</td>
                              <td className="bb-sheet-num">{formatNumber(line.quantity, 2)}</td>
                              <td className="bb-sheet-num font-semibold text-emerald-700">
                                {formatKg(line.totalNormKg, 2)}
                              </td>
                              <td className="bb-sheet-num font-semibold text-sky-800">
                                {lineActualQty > 0 ? formatNumber(lineActualQty, 2) : '—'}
                              </td>
                              <td className="bb-sheet-num font-semibold text-lime-800">
                                {lineActualKg > 0 ? formatKg(lineActualKg, 2) : '—'}
                              </td>
                              <td className="bb-sheet-num text-amber-800">
                                {line.actualPlasticWeightKg != null && line.actualPlasticWeightKg > 0
                                  ? formatKg(line.actualPlasticWeightKg, 2)
                                  : '—'}
                              </td>
                              <td className="bb-sheet-num text-fuchsia-800">
                                {line.actualFilmWeightKg != null && line.actualFilmWeightKg > 0
                                  ? formatKg(line.actualFilmWeightKg, 2)
                                  : '—'}
                              </td>
                              <td className="bb-sheet-num text-sky-700">
                                {line.planQtyRatioPercent != null
                                  ? `${formatNumber(line.planQtyRatioPercent, 1)}%`
                                  : line.quantity > 0 && lineActualQty > 0
                                    ? `${formatNumber((lineActualQty / line.quantity) * 100, 1)}%`
                                    : '—'}
                              </td>
                              <td className="bb-sheet-num text-teal-700">
                                {group.totalNormKg > 0 && line.totalNormKg != null && line.totalNormKg > 0
                                  ? `${formatNumber((line.totalNormKg / group.totalNormKg) * 100, 1)}%`
                                  : '—'}
                              </td>
                            </tr>
                            );
                          })}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        ) : activeTab === 'giai_trinh' ? (
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="min-w-[220px] px-3 py-2.5 font-black">Vấn đề</th>
                <th className="min-w-[220px] px-3 py-2.5 font-black">Giải quyết</th>
                <th className="min-w-[160px] px-3 py-2.5 font-black">Lần lặp lại</th>
                <th className="min-w-[180px] px-3 py-2.5 font-black">Người chịu trách nhiệm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading || loadingGiaiTrinh ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải giải trình từ DB...
                  </td>
                </tr>
              ) : giaiTrinhDbError ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-rose-600">
                    {giaiTrinhDbError}
                  </td>
                </tr>
              ) : orderGroupsMerged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có lệnh SX theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                orderGroupsMerged.map(group => {
                  const fields = resolveGiaiTrinhFields(group.groupKey);
                  const giaiTrinhInputClass =
                    'w-full min-w-[140px] resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-800 outline-none focus:border-indigo-400';
                  return (
                    <tr key={group.groupKey} className="align-top hover:bg-indigo-50/30">
                      <td className="px-3 py-2 font-mono font-bold text-zinc-800">{group.ngay || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">
                        {group.shiftLabel || group.shift || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">{group.machine || '—'}</td>
                      <td className="px-3 py-2">
                        <textarea
                          value={fields.van_de}
                          onChange={event => updateGiaiTrinhField(group.groupKey, 'van_de', event.target.value)}
                          rows={2}
                          placeholder="Mô tả vấn đề..."
                          className={giaiTrinhInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <textarea
                          value={fields.giai_quyet}
                          onChange={event =>
                            updateGiaiTrinhField(group.groupKey, 'giai_quyet', event.target.value)
                          }
                          rows={2}
                          placeholder="Cách giải quyết..."
                          className={giaiTrinhInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={fields.lan_lap_lai}
                          onChange={event =>
                            updateGiaiTrinhField(group.groupKey, 'lan_lap_lai', event.target.value)
                          }
                          placeholder="VD: Lần 1, Lần 2..."
                          className={giaiTrinhInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={fields.nguoi_chiu_trach_nhiem}
                          onChange={event =>
                            updateGiaiTrinhField(
                              group.groupKey,
                              'nguoi_chiu_trach_nhiem',
                              event.target.value
                            )
                          }
                          placeholder="Họ tên người phụ trách..."
                          className={giaiTrinhInputClass}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : activeTab === 'danh_gia_tong_hop' ? (
          <div className="space-y-4 p-3">
            {isLoading ? (
              <p className="px-3 py-10 text-center font-bold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải bảng tổng hợp đánh giá...
              </p>
            ) : danhGiaGroups.length === 0 ? (
              <p className="px-3 py-10 text-center font-bold text-zinc-400">
                Chưa có dữ liệu 4.1 — bấm «Tính toán» để tạo bảng tổng hợp.
              </p>
            ) : (
              danhGiaGroups.map(group => {
                const rows = group.summaryRows || [];
                return (
                  <div
                    key={group.groupKey}
                    className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-xs"
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rose-200 bg-rose-50 px-3 py-2.5">
                      <p className="text-xs font-black uppercase tracking-wider text-rose-900">
                        4.1. Tổng hợp
                      </p>
                      <p className="font-mono text-sm font-bold text-zinc-800">{group.ngay || '—'}</p>
                      <p className="text-sm font-semibold text-zinc-700">
                        {group.shiftLabel || group.shift || '—'}
                      </p>
                      <p className="font-mono text-sm font-black text-sky-800">
                        {group.orderCode || '—'}
                      </p>
                      <p className="text-sm font-semibold text-zinc-700">{group.machine || '—'}</p>
                    </div>
                    {rows.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm font-semibold text-zinc-400">
                        Chưa có dòng tổng hợp cho lệnh này. Bấm «Tính toán» lại.
                      </p>
                    ) : (
                      <div className="bb-table-scroll overflow-x-auto">
                        <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
                          <thead className="bg-slate-100 text-xs uppercase tracking-wider text-slate-700">
                            <tr>
                              <th className="px-3 py-2.5 text-center font-black">STT</th>
                              <th className="px-3 py-2.5 font-black">Giá trị phân tích dữ liệu</th>
                              <th className="px-3 py-2.5 text-right font-black">Hàng lỗi</th>
                              <th className="px-3 py-2.5 text-right font-black">Thành phẩm</th>
                              <th
                                className="px-3 py-2.5 text-right font-black"
                                title="Hao hụt nhựa: Dữ liệu định mức = Tổng nhựa thành phẩm"
                              >
                                Dữ liệu định mức
                              </th>
                              <th
                                className="px-3 py-2.5 text-right font-black"
                                title="Cùng cột Chênh lệch (Xuất − Nhập) mục tiêu hao NVL"
                              >
                                Chênh lệch
                                <br />
                                (Xuất − Nhập)
                              </th>
                              <th className="px-3 py-2.5 text-right font-black">
                                Tỉ lệ
                                <br />
                                Chênh lệch
                              </th>
                              <th className="px-3 py-2.5 text-right font-black">
                                Tỉ lệ hao hụt
                                <br />
                                Định mức
                              </th>
                              <th className="px-3 py-2.5 text-right font-black">
                                Tỉ lệ hao hụt
                                <br />
                                thực tế
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {rows.map((row, index) => (
                              <tr
                                key={row.id}
                                className={
                                  row.id === 'hao_hut_nhua'
                                    ? 'bg-rose-50/50 font-bold'
                                    : 'hover:bg-rose-50/20'
                                }
                              >
                                <td className="px-3 py-2 text-center">{index + 1}</td>
                                <td className="px-3 py-2">{row.label}</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {row.hangLoiKg > 0 ? formatKg(row.hangLoiKg, 3) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {row.thanhPhamKg > 0 ? formatKg(row.thanhPhamKg, 3) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {row.dinhMucKg !== 0 ? formatKg(row.dinhMucKg, 3) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {row.chenhLechKg !== 0 ? formatSignedKg(row.chenhLechKg, 3) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {formatPercent(row.tiLeChenhLech, 2)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {formatPercent(row.tiLeHaoHutDinhMucPercent, 0)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {formatPercent(row.tiLeHaoHutThucTe, 2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'danh_gia_hao_hut' ? (
          <div className="bb-table-scroll bb-report-sheet-scroll">
            <table className="min-w-[2300px] w-full text-left text-sm font-semibold">
              <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="w-10 px-2 py-2.5 font-black" />
                  <th className="px-3 py-2.5 font-black">Ngày</th>
                  <th className="px-3 py-2.5 font-black">Ca</th>
                  <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                  <th className="px-3 py-2.5 font-black">Máy</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng nhựa thực xuất / Tổng ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">Giá trị hao hụt nhựa</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng màng thực xuất / Tổng màng ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">Giá trị hao hụt màng</th>
                  <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng định mức</th>
                  <th className="px-3 py-2.5 text-right font-black">Lệch lỗi hỏng so với ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">SL nhựa lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">GT nhựa lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">SL màng lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">GT màng lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">SL lõi lỗi hỏng/hao hụt</th>
                  <th className="px-3 py-2.5 text-right font-black">GT lõi lỗi hỏng/hao hụt</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng GT hao hụt + lỗi hỏng</th>
                  <th className="px-3 py-2.5 font-black">Phân tích đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={20} className="px-3 py-10 text-center font-bold text-zinc-400">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Đang tải đánh giá hiệu quả...
                    </td>
                  </tr>
                ) : danhGiaGroups.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-3 py-10 text-center font-bold text-zinc-400">
                      Chưa có dữ liệu đánh giá hao hụt/lỗi hỏng gắn lệnh máy BB.
                    </td>
                  </tr>
                ) : (
                  danhGiaGroups.map(group => {
                    const expanded = isGroupExpanded('danh_gia_hao_hut', group.groupKey);
                    const thucDungGroup = thucDungGroups.find(g => g.groupKey === group.groupKey);
                    const mixingLines = (thucDungGroup?.lines || []).filter(row => row.inMixingRatioTable);
                    const otherLines = (thucDungGroup?.lines || []).filter(row => !row.inMixingRatioTable);
                    const mixingTotals = thucDungGroup?.mixingRatioTotals;
                    const otherTotals = thucDungGroup?.otherTotals;
                    /** Chênh lệch (banner) = Tổng nhựa TP − Xuất thực dùng + Lỗi. */
                    const groupUsedLtKg = group.tongNhuaThucXuat;
                    const groupChenhLechKg =
                      danhGiaGroups.length <= 1
                        ? plasticDifferenceWeightKg
                        : plasticUsedLtKg > 0 && Number.isFinite(groupUsedLtKg)
                          ? plasticDifferenceWeightKg * (groupUsedLtKg / plasticUsedLtKg)
                          : plasticDifferenceWeightKg;
                    const nhuaHaoHutByLine = allocateBbNhuaHaoHutByRatioPercent(
                      groupChenhLechKg,
                      mixingLines
                    );
                    const sanLuongGroup =
                      sanLuongGroups.find(g => g.groupKey === group.groupKey) ||
                      sanLuongGroups.find(g => g.orderCode === group.orderCode);
                    const sanLuongProductKeys = (sanLuongGroup?.productGroups || [])
                      .map(pg => normalizeProductCodeKey(pg.productCode))
                      .filter(Boolean);
                    const hangLoiMixingTotalKg = sumBbDamagedRowsLoiHongKgForHeaderByProductCodes({
                      damagedRows,
                      header: {
                        ngay: group.ngay,
                        shift: group.shift,
                        machine: group.machine,
                        orderCode: group.orderCode
                      },
                      productCodeKeys: sanLuongProductKeys,
                      kind: 'sp_loi',
                      isInsulationMachine
                    });
                    const hangLoiOtherTotalKg = sumBbDamagedRowsLoiHongKgForHeaderByProductCodes({
                      damagedRows,
                      header: {
                        ngay: group.ngay,
                        shift: group.shift,
                        machine: group.machine,
                        orderCode: group.orderCode
                      },
                      productCodeKeys: sanLuongProductKeys,
                      kind: 'sp_rac',
                      isInsulationMachine
                    });
                    const hangLoiByLine = allocateBbNhuaHaoHutByRatioPercent(
                      hangLoiMixingTotalKg,
                      mixingLines
                    );
                    const hangLoiOtherByLine = allocateBbKgByWeightShare(
                      hangLoiOtherTotalKg,
                      otherLines
                    );
                    const shiftSettingsTyped = shiftSettings as ShiftSetting[];
                    const resolveLineGia = (row: BbThucDungLineRow) =>
                      resolveBbMaterialExportUnitPrice(
                        group.ngay,
                        group.shift,
                        warehouseMovements,
                        shiftSettingsTyped,
                        row.materialCode,
                        row.materialName
                      );
                    const lineCost = (kg: number | null, gia: number) =>
                      kg !== null && Number.isFinite(kg) && gia > 0 ? kg * gia : null;
                    return (
                      <React.Fragment key={group.groupKey}>
                        <tr className="hover:bg-rose-50/30">
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggleGroup('danh_gia_hao_hut', group.groupKey)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300 bg-white text-rose-800 shadow-sm transition hover:bg-rose-50"
                              title={expanded ? 'Đóng chi tiết vật tư' : 'Mở chi tiết vật tư (tỉ lệ trộn)'}
                              aria-expanded={expanded}
                            >
                              <ChevronDown
                                className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`}
                              />
                            </button>
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-zinc-800">{group.ngay || '—'}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-700">
                            {group.shiftLabel || group.shift || '—'}
                          </td>
                          <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-700">{group.machine || '—'}</td>
                          <td
                            className="px-3 py-2 text-right font-mono font-bold text-amber-800"
                            title={`${formatKg(group.tongNhuaThucXuat, 2)} / ${formatKg(group.tongNhuaDinhMuc, 2)} kg`}
                          >
                            {formatPercent(group.tiLeNhuaThucXuatVsDinhMuc, 2)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono font-bold ${
                              group.giaTriHaoHutNhua < 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                            title={`${formatKg(group.giaTriHaoHutNhuaKg, 2)} kg`}
                          >
                            {formatVnd(group.giaTriHaoHutNhua)}
                          </td>
                          <td
                            className="px-3 py-2 text-right font-mono font-bold text-fuchsia-800"
                            title={`${formatKg(group.tongMangThucXuat, 2)} / ${formatKg(group.tongMangDinhMuc, 2)} kg`}
                          >
                            {formatPercent(group.tiLeMangThucXuatVsDinhMuc, 2)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono font-bold ${
                              group.giaTriHaoHutMang < 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                            title={`${formatKg(group.giaTriHaoHutMangKg, 2)} kg`}
                          >
                            {formatVnd(group.giaTriHaoHutMang)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">
                            {formatPercent(group.tiLeLoiHong, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-700">
                            {formatPercent(group.tiLeLoiHongDinhMuc, 2)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono font-bold ${
                              group.lechLoiHongVsDinhMuc > 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatPercent(group.lechLoiHongVsDinhMuc, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-amber-800">
                            {formatKg(group.soLuongNhuaLoiHong, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                            {formatVnd(group.giaTriNhuaLoiHong)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-fuchsia-800">
                            {formatKg(group.soLuongMangLoiHong, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-fuchsia-800">
                            {formatVnd(group.giaTriMangLoiHong)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-stone-700">
                            {formatKg(group.soLuongLoiLoiHong, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-stone-800">
                            {formatVnd(group.giaTriLoiLoiHong)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-black text-rose-800">
                            {formatVnd(group.tongGiaTriHaoHutLoiHong)}
                          </td>
                          <td className="px-3 py-2 min-w-[180px]">
                            <textarea
                              value={phanTichMap[group.groupKey] || ''}
                              onChange={event => updatePhanTich(group.groupKey, event.target.value)}
                              rows={2}
                              placeholder="Gõ tay phân tích đánh giá..."
                              className="w-full min-w-[160px] resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
                            />
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-rose-50/40">
                            <td colSpan={20} className="px-2 py-3">
                              {!thucDungGroup || thucDungGroup.lines.length === 0 ? (
                                <p className="px-2 py-4 text-center text-sm font-semibold text-zinc-400">
                                  Chưa có chi tiết vật tư tỉ lệ trộn cho lệnh này. Bấm «Tính toán» ở tab thực dùng /
                                  tỉ lệ trộn nếu cần. Bảng 4.1 xem tại tab «4.1. Tổng hợp».
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-10">
                                  <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-6">
                                    <div className="border-b border-violet-200 bg-violet-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-violet-900">
                                      Vật tư trong bảng tỉ lệ trộn máy
                                      {mixingLines.length > 0 ? ` (${mixingLines.length})` : ''}
                                    </div>
                                    <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                      <thead className="bg-violet-50 text-xs uppercase tracking-wider text-violet-900">
                                        <tr>
                                          <th className="px-3 py-1.5 font-black">Mã NVL</th>
                                          <th className="px-3 py-1.5 font-black">Tên NVL</th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="KL NVL ÷ tổng KL trộn ca × 100"
                                          >
                                            Tỉ lệ TB thực tế (%)
                                          </th>
                                          <th className="px-3 py-1.5 text-right font-black">Thực trộn (kg)</th>
                                          <th className="px-3 py-1.5 text-right font-black">Xuất trong ngày</th>
                                          <th className="px-3 py-1.5 text-right font-black">Thực dùng (kg)</th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Giá bình quân từ phiếu xuất kho NVL cùng ngày (mọi ca)"
                                          >
                                            Giá
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="SP lỗi (Báo cáo sản lượng) lọc theo mã SP trên bảng Sản lượng · phân bổ theo tỉ lệ %"
                                          >
                                            Hàng lỗi (kg)
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Chênh lệch (Tổng nhựa TP − Xuất thực dùng + Lỗi) × tỉ lệ % NVL / tổng %"
                                          >
                                            Nhựa hao hụt (kg)
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Chi phí nhựa hao hụt = Nhựa hao hụt × Giá"
                                          >
                                            Chi phí nhựa hao hụt
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Chi phí hàng lỗi = Hàng lỗi × Giá"
                                          >
                                            Chi phí Hàng lỗi
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-violet-50">
                                        {mixingLines.length === 0 ? (
                                          <tr>
                                            <td colSpan={11} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                              Không có NVL khớp tỉ lệ trộn máy.
                                            </td>
                                          </tr>
                                        ) : (
                                          mixingLines.map((row, index) => {
                                            const gia = resolveLineGia(row);
                                            const hangLoiKg = hangLoiByLine[index] ?? null;
                                            const nhuaHaoHutKg = nhuaHaoHutByLine[index] ?? null;
                                            const chiPhiHaoHut = lineCost(nhuaHaoHutKg, gia);
                                            const chiPhiHangLoi = lineCost(hangLoiKg, gia);
                                            return (
                                              <tr key={row.key} className="hover:bg-violet-50/60">
                                                <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-orange-800">
                                                  {formatPercent(row.tiLeThucTeTbPercent, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-violet-800">
                                                  {formatKg(row.mixingShiftMaterialKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                                  {formatKg(row.xuatTrongCaKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                                  {formatKg(row.weightKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-700">
                                                  {gia > 0 ? formatVnd(gia) : '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-800">
                                                  {formatKg(hangLoiKg, 2)}
                                                </td>
                                                <td
                                                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                                                    nhuaHaoHutKg !== null && nhuaHaoHutKg < 0
                                                      ? 'text-emerald-700'
                                                      : 'text-rose-700'
                                                  }`}
                                                >
                                                  {formatKg(nhuaHaoHutKg, 2)}
                                                </td>
                                                <td
                                                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                                                    chiPhiHaoHut !== null && chiPhiHaoHut < 0
                                                      ? 'text-emerald-700'
                                                      : 'text-rose-700'
                                                  }`}
                                                >
                                                  {chiPhiHaoHut !== null ? formatVnd(chiPhiHaoHut) : '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-900">
                                                  {chiPhiHangLoi !== null ? formatVnd(chiPhiHangLoi) : '—'}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      {mixingTotals && mixingLines.length > 0 ? (
                                        <tfoot className="border-t border-violet-200 bg-violet-50 text-xs font-black text-violet-900">
                                          <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-wider">
                                              Tổng tỉ lệ trộn
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(mixingTotals.thucTronTotal, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(mixingTotals.xuatCaTotal, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(mixingTotals.totalWeightKg, 2)}
                                            </td>
                                            <td className="px-3 py-2" />
                                            <td className="px-3 py-2 text-right font-mono text-amber-800">
                                              {formatKg(hangLoiMixingTotalKg, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-rose-800">
                                              {formatKg(groupChenhLechKg, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-rose-800">
                                              {formatVnd(
                                                mixingLines.reduce((sum, row, index) => {
                                                  const cost = lineCost(
                                                    nhuaHaoHutByLine[index] ?? null,
                                                    resolveLineGia(row)
                                                  );
                                                  return sum + (cost ?? 0);
                                                }, 0)
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-amber-900">
                                              {formatVnd(
                                                mixingLines.reduce((sum, row, index) => {
                                                  const cost = lineCost(
                                                    hangLoiByLine[index] ?? null,
                                                    resolveLineGia(row)
                                                  );
                                                  return sum + (cost ?? 0);
                                                }, 0)
                                              )}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      ) : null}
                                    </table>
                                  </div>

                                  <div className="bb-table-scroll bb-report-sheet-scroll xl:col-span-4">
                                    <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700">
                                      Vật tư khác
                                      {otherLines.length > 0 ? ` (${otherLines.length})` : ''}
                                    </div>
                                    <table className="min-w-full whitespace-nowrap text-left text-sm font-semibold">
                                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-700">
                                        <tr>
                                          <th className="px-3 py-1.5 font-black">Mã NVL</th>
                                          <th className="px-3 py-1.5 font-black">Tên NVL</th>
                                          <th className="px-3 py-1.5 text-right font-black">Xuất trong ngày</th>
                                          <th className="px-3 py-1.5 text-right font-black">Thực dùng (kg)</th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Giá bình quân từ phiếu xuất kho NVL cùng ngày (mọi ca)"
                                          >
                                            Giá
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="SP rác (Báo cáo sản lượng) lọc theo mã SP trên bảng Sản lượng · phân bổ theo thực dùng"
                                          >
                                            Hàng lỗi (kg)
                                          </th>
                                          <th
                                            className="px-3 py-1.5 text-right font-black"
                                            title="Chi phí hàng lỗi = Hàng lỗi × Giá"
                                          >
                                            Chi phí Hàng lỗi
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {otherLines.length === 0 ? (
                                          <tr>
                                            <td colSpan={7} className="px-3 py-3 text-sm font-semibold text-zinc-400">
                                              Không có vật tư khác ngoài tỉ lệ trộn máy.
                                            </td>
                                          </tr>
                                        ) : (
                                          otherLines.map((row, index) => {
                                            const gia = resolveLineGia(row);
                                            const hangLoiKg = hangLoiOtherByLine[index] ?? null;
                                            const chiPhiHangLoi = lineCost(hangLoiKg, gia);
                                            return (
                                              <tr key={row.key} className="hover:bg-slate-50/80">
                                                <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                                  {row.materialCode || '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                                  {formatKg(row.xuatTrongCaKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                                  {formatKg(row.weightKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono text-zinc-700">
                                                  {gia > 0 ? formatVnd(gia) : '—'}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-800">
                                                  {formatKg(hangLoiKg, 2)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-mono font-bold text-amber-900">
                                                  {chiPhiHangLoi !== null ? formatVnd(chiPhiHangLoi) : '—'}
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                      {otherTotals && otherLines.length > 0 ? (
                                        <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-black text-slate-800">
                                          <tr>
                                            <td colSpan={2} className="px-3 py-2 text-right uppercase tracking-wider">
                                              Tổng vật tư khác
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(otherTotals.xuatCaTotal, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">
                                              {formatKg(otherTotals.totalWeightKg, 2)}
                                            </td>
                                            <td className="px-3 py-2" />
                                            <td className="px-3 py-2 text-right font-mono text-amber-800">
                                              {formatKg(hangLoiOtherTotalKg, 2)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-amber-900">
                                              {formatVnd(
                                                otherLines.reduce((sum, row, index) => {
                                                  const cost = lineCost(
                                                    hangLoiOtherByLine[index] ?? null,
                                                    resolveLineGia(row)
                                                  );
                                                  return sum + (cost ?? 0);
                                                }, 0)
                                              )}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      ) : null}
                                    </table>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              {!isLoading && danhGiaGroups.length > 0 ? (
                <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                  <tr>
                    <td colSpan={18} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Tổng giá trị hao hụt + lỗi hỏng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-800">
                      {formatVnd(tongGiaTriHaoHutLoiHong)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        ) : null}
      </div>

    </section>
    {calcDialogOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Chọn Ngày Ca Máy để tính toán"
            onMouseDown={event => {
              if (event.target === event.currentTarget && !calculatingReport) setCalcDialogOpen(false);
            }}
          >
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-500 to-amber-400 px-5 py-4 text-zinc-950">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-950/70">
                    Tính toán báo cáo
                  </p>
                  <h4 className="mt-1 text-base font-black">Chọn Ngày · Ca · Máy</h4>
                  <p className="mt-1 text-xs font-semibold text-amber-950/80">
                    Đồng bộ tất cả tab (lệnh SX, xuất kho, tồn đầu, cân, sản lượng, lỗi hỏng…) theo đúng phạm
                    vi này rồi lưu DB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCalcDialogOpen(false)}
                  disabled={calculatingReport}
                  className="rounded-lg border border-zinc-900/15 bg-white/40 px-3 py-1.5 text-xs font-black hover:bg-white/70 disabled:opacity-50"
                >
                  Đóng
                </button>
              </div>

              <div className="space-y-3 p-5">
                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                  <input
                    type="date"
                    value={calcNgay}
                    onChange={event => {
                      setCalcNgay(event.target.value);
                      setCalcDialogError('');
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none ring-amber-300 focus:ring-2"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
                  <select
                    value={calcCa}
                    onChange={event => {
                      setCalcCa(event.target.value);
                      setCalcDialogError('');
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none ring-amber-300 focus:ring-2"
                  >
                    <option value="">— Chọn ca —</option>
                    {productionShiftOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label || option.value}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
                  <select
                    value={calcMay}
                    onChange={event => {
                      setCalcMay(event.target.value);
                      setCalcDialogError('');
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none ring-amber-300 focus:ring-2"
                  >
                    <option value="">— Chọn máy —</option>
                    {machines.map(machine => (
                      <option key={machine.id || machine.code} value={machine.code}>
                        {machine.name && machine.name !== machine.code
                          ? `${machine.code} · ${machine.name}`
                          : machine.code || machine.name}
                      </option>
                    ))}
                  </select>
                </label>

                {calcDialogError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    {calcDialogError}
                  </p>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCalcDialogOpen(false)}
                    disabled={calculatingReport}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={confirmCalcDialog}
                    disabled={calculatingReport}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-400 px-4 text-xs font-black text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                  >
                    {calculatingReport ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Calculator className="h-4 w-4" />
                    )}
                    Tính toán
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      : null}
    {selectedExportSummary ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết nguồn số liệu phiếu xuất kho"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedExportSummary(null);
        }}
      >
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-100">
                Nguồn số liệu và công thức
              </p>
              <h4 className="mt-1 text-base font-black">{selectedExportSummary.title}</h4>
              <p className="mt-1 text-xs font-semibold text-sky-100">{selectedExportSummary.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExportSummary(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="overflow-auto p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Định mức (kg)</p>
                <p className="mt-1 font-mono text-lg font-black text-emerald-800">
                  {formatKg(
                    selectedExportSummary.lines.reduce(
                      (sum, line) => sum + Math.max(0, line.materialNorm?.allocatedNormKg || 0),
                      0
                    ),
                    2
                  )}
                </p>
                <p className="text-xs font-bold text-emerald-600">Từ công thức Thành phần SP</p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">Trọng lượng định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(sumTrongLuongDinhMucKg(selectedExportSummary.lines), 2)}
                </p>
                <p className="text-xs font-bold text-lime-600">SL SP × kg NVL/SP × tỉ lệ phân bổ</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số dòng NVL</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedExportSummary.lines.length}
                </p>
              </div>
            </div>

            <div className="bb-table-scroll bb-report-sheet-scroll">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-slate-100 font-black uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-3 py-2.5">Sản phẩm / NVL</th>
                    <th className="px-3 py-2.5 text-right">SL SP</th>
                    <th className="px-3 py-2.5 text-right">kg NVL/SP</th>
                    <th className="px-3 py-2.5 text-right">Tỉ lệ phân bổ</th>
                    <th className="px-3 py-2.5 text-right">TL định mức</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedExportSummary.lines.map(line => (
                    <tr key={line.key} className="bg-white hover:bg-sky-50/50">
                      <td className="px-3 py-2.5">
                        <p className="font-black text-slate-900">
                          {line.materialNorm?.productCode || '—'} · {line.materialNorm?.productName || '—'}
                        </p>
                        <p className="mt-0.5 font-mono font-bold text-slate-600">
                          {line.itemCode || '—'} · {line.itemName || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatNumber(line.materialNorm?.productQuantity ?? null, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatKg(line.materialNorm?.componentWeightKg ?? null, 4)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatPercent(
                          line.materialNorm?.allocationRatio === undefined
                            ? null
                            : line.materialNorm.allocationRatio * 100,
                          2
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-lime-700">
                        {formatKg(computeTrongLuongDinhMucKg(line), 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              Trọng lượng định mức từng dòng = Số lượng sản phẩm × Khối lượng NVL trong Thành phần × Tỉ lệ phân bổ.
              Các ô tổng phía trên là phép cộng của các dòng nguồn bên dưới.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedMaterialTotalDetail ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Định mức NVL theo sản phẩm"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedMaterialTotalDetail(null);
        }}
      >
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-900 to-emerald-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">
                Định mức theo sản phẩm
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedMaterialTotalDetail.itemCode || '—'} · {selectedMaterialTotalDetail.itemName || '—'}
              </h4>
              <p className="mt-1 text-xs font-semibold text-emerald-100">
                Xuất kho {formatKg(selectedMaterialTotalDetail.exportWeightKg, 2)} kg ·{' '}
                {selectedMaterialTotalDetail.lineCount} dòng phiếu · ĐVT{' '}
                {selectedMaterialTotalDetail.unit || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMaterialTotalDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="overflow-auto p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Tổng xuất (kg)</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-800">
                  {formatKg(selectedMaterialTotalDetail.exportWeightKg, 2)}
                </p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">
                  Tổng TL định mức
                </p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(
                    selectedMaterialTotalDetail.products.reduce((sum, row) => sum + row.normWeightKg, 0),
                    2
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">Số sản phẩm</p>
                <p className="mt-1 font-mono text-lg font-black text-teal-800">
                  {selectedMaterialTotalDetail.products.length}
                </p>
              </div>
            </div>

            <div className="bb-table-scroll bb-report-sheet-scroll">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-emerald-50 font-black uppercase tracking-wider text-emerald-900">
                  <tr>
                    <th className="px-3 py-2.5">Lệnh SX</th>
                    <th className="px-3 py-2.5">Sản phẩm</th>
                    <th className="px-3 py-2.5 text-right">SL SP</th>
                    <th className="px-3 py-2.5 text-right">kg NVL/SP</th>
                    <th className="px-3 py-2.5 text-right">TL định mức</th>
                    <th className="px-3 py-2.5 text-right">Tỉ lệ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedMaterialTotalDetail.products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center font-bold text-zinc-400">
                        Chưa gắn được định mức sản phẩm cho mã NVL này.
                      </td>
                    </tr>
                  ) : (
                    selectedMaterialTotalDetail.products.map(row => (
                      <tr key={row.key} className="bg-white hover:bg-emerald-50/50">
                        <td className="px-3 py-2.5">
                          <p className="font-mono font-black text-sky-900">{row.orderCode || '—'}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {row.ngay || '—'} · {row.shiftLabel || '—'} · {row.machine || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-black text-slate-900">
                            {row.productCode || '—'} · {row.productName || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {row.productQuantity > 0 ? formatNumber(row.productQuantity, 3) : '—'}
                          {row.productUnit ? (
                            <span className="ml-1 font-semibold text-slate-500">{row.productUnit}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {formatKg(row.componentWeightKg, 4)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-lime-700">
                          {row.normWeightKg > 0 ? formatKg(row.normWeightKg, 2) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-teal-700">
                          {formatPercent(row.percent, 2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {selectedMaterialTotalDetail.products.length > 0 ? (
                  <tfoot className="border-t-2 border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-950">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider">
                        Tổng
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-lime-700">
                        {formatKg(
                          selectedMaterialTotalDetail.products.reduce((sum, row) => sum + row.normWeightKg, 0),
                          2
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-teal-700">
                        {formatPercent(
                          selectedMaterialTotalDetail.products.reduce((sum, row) => sum + (row.percent || 0), 0),
                          2
                        )}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              Tỉ lệ % = Trọng lượng định mức của SP đó ÷ tổng Trọng lượng định mức mã NVL trong cùng lệnh SX.
              TL định mức = SL SP × kg NVL/SP (Thành phần) × tỉ lệ phân bổ dòng phiếu.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedMaterialNorm ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức khối lượng định mức"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedMaterialNorm(null);
        }}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-800 to-emerald-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Công thức định mức NVL</p>
              <h4 className="mt-1 text-base font-black">
                {selectedMaterialNorm.materialCode} · {selectedMaterialNorm.materialName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-emerald-50">
                Sản phẩm: {selectedMaterialNorm.productCode} · {selectedMaterialNorm.productName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMaterialNorm(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL lệnh SX</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedMaterialNorm.productQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedMaterialNorm.productUnit}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'TL định mức/SP' : 'Định mức NVL/SP'}
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? formatKg(selectedMaterialNorm.productNormKgPerUnit, 2)
                    : formatNumber(selectedMaterialNorm.rate, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? `kg/${selectedMaterialNorm.productUnit}`
                    : `${selectedMaterialNorm.rateUnit}/${selectedMaterialNorm.productUnit}`}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'Tỷ lệ NVL' : 'SL NVL tính được'}
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? `${formatNumber(selectedMaterialNorm.rate, 3)}%`
                    : formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'Thành phần sản phẩm' : selectedMaterialNorm.rawExpectedUnit}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">KL định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-emerald-800">
                  {formatKg(selectedMaterialNorm.allocatedNormKg, 2)}
                </p>
                <p className="text-xs font-bold text-emerald-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Phép tính cụ thể</p>
              {selectedMaterialNorm.amountType === 'percent' ? (
                <p className="mt-2 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                  {formatNumber(selectedMaterialNorm.productQuantity, 3)} {selectedMaterialNorm.productUnit}
                  {' × '}{formatKg(selectedMaterialNorm.productNormKgPerUnit, 2)} kg/{selectedMaterialNorm.productUnit}
                  {' × '}{formatNumber(selectedMaterialNorm.rate, 3)}%
                  {' = '}{formatKg(selectedMaterialNorm.totalNormKg, 2)} kg
                </p>
              ) : (
                <div className="mt-2 space-y-1 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                  <p>
                    {formatNumber(selectedMaterialNorm.productQuantity, 3)} {selectedMaterialNorm.productUnit}
                    {' × '}{formatNumber(selectedMaterialNorm.rate, 3)} {selectedMaterialNorm.rateUnit}/{selectedMaterialNorm.productUnit}
                    {' = '}{formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)} {selectedMaterialNorm.rawExpectedUnit}
                  </p>
                  {selectedMaterialNorm.rawExpectedUnit.toLowerCase() !== 'kg' ? (
                    selectedMaterialNorm.catalogKgPerUnit !== null && selectedMaterialNorm.catalogKgPerUnit > 0 ? (
                      <p>
                        Quy đổi theo cột Tổng kg kho NVL ({formatNumber(selectedMaterialNorm.catalogKgPerUnit, 6)} kg/
                        {selectedMaterialNorm.rawExpectedUnit}):{' '}
                        {formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)} {selectedMaterialNorm.rawExpectedUnit}
                        {' × '}{formatNumber(selectedMaterialNorm.catalogKgPerUnit, 6)}
                        {' = '}{formatKg(selectedMaterialNorm.totalNormKg, 2)} kg
                      </p>
                    ) : (
                      <p className="text-rose-700">
                        Chưa có cột Tổng kg trong kho NVL cho mã {selectedMaterialNorm.materialCode || '—'} — không quy đổi được sang kg.
                      </p>
                    )
                  ) : null}
                </div>
              )}
              {selectedMaterialNorm.allocationRatio < 0.999999 ? (
                <p className="mt-2 border-t border-emerald-200 pt-2 text-xs font-bold text-emerald-800">
                  Phân bổ theo tỉ lệ SL sản phẩm trên phiếu xuất: dòng này nhận{' '}
                  {formatNumber(selectedMaterialNorm.allocationRatio * 100, 2)}% tổng NVL xuất
                  {' '}→ KL định mức phân bổ = {formatKg(selectedMaterialNorm.totalNormKg, 2)} ×{' '}
                  {formatNumber(selectedMaterialNorm.allocationRatio * 100, 2)}% ={' '}
                  {formatKg(selectedMaterialNorm.allocatedNormKg, 2)} kg.
                </p>
              ) : null}
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              ĐVT kg: SL thực xuất = % × SL phiếu. ĐVT ≠ kg: SL thực xuất = SL định mức (để nguyên).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedTrongLuongDinhMuc ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức trọng lượng định mức"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedTrongLuongDinhMuc(null);
        }}
      >
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-lime-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-lime-800 to-lime-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-100">
                Công thức Trọng lượng định mức
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedTrongLuongDinhMuc.itemCode} · {selectedTrongLuongDinhMuc.itemName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-lime-50">
                Sản phẩm: {selectedTrongLuongDinhMuc.materialNorm?.productCode} ·{' '}
                {selectedTrongLuongDinhMuc.materialNorm?.productName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTrongLuongDinhMuc(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số lượng của SP</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? null, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedTrongLuongDinhMuc.materialNorm?.productUnit || ''}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Khối lượng (kg) trong Thành phần
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatKg(selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? null, 4)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  kg/{selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                </p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">Trọng lượng định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(computeTrongLuongDinhMucKg(selectedTrongLuongDinhMuc), 2)}
                </p>
                <p className="text-xs font-bold text-lime-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-lime-200 bg-lime-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-lime-700">Phép tính cụ thể</p>
              <p className="mt-2 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                {formatNumber(selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? null, 3)}{' '}
                {selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                {' × '}
                {formatKg(selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? null, 4)} kg/
                {selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                {' = '}
                {formatKg(
                  (selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? 0) *
                    (selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? 0),
                  2
                )}{' '}
                kg
              </p>
              {selectedTrongLuongDinhMuc.materialNorm && selectedTrongLuongDinhMuc.materialNorm.allocationRatio < 0.999999 ? (
                <p className="mt-2 border-t border-lime-200 pt-2 text-xs font-bold text-lime-800">
                  Mã NVL này bị tách thành nhiều dòng trên phiếu xuất: dòng này nhận{' '}
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm.allocationRatio * 100, 2)}% →{' '}
                  {formatKg(
                    (selectedTrongLuongDinhMuc.materialNorm.productQuantity ?? 0) *
                      (selectedTrongLuongDinhMuc.materialNorm.componentWeightKg ?? 0),
                    2
                  )}{' '}
                  ×{' '}
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm.allocationRatio * 100, 2)}% ={' '}
                  {formatKg(computeTrongLuongDinhMucKg(selectedTrongLuongDinhMuc), 2)} kg.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {plasticSummaryDetailView ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết tổng hợp nhựa"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setPlasticSummaryDetail(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-red-800 to-red-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-100">Tổng hợp nhựa</p>
              <h4 className="mt-1 text-base font-black">{plasticSummaryDetailView.title}</h4>
              <p className="mt-1 text-xs font-semibold text-red-50">{plasticSummaryDetailView.subtitle}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{plasticSummaryDetailView.valueText}</p>
            </div>
            <button
              type="button"
              onClick={() => setPlasticSummaryDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            <div className="overflow-hidden rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm font-bold text-red-950">
              <p>{plasticSummaryDetailView.formula}</p>
              <p className="mt-1 text-xs font-semibold text-red-800">Nguồn: {plasticSummaryDetailView.source}</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-white sm:text-[11px]">
                  <tr>
                    {plasticSummaryDetailView.columns.map(column => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-black ${column.align === 'right' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {plasticSummaryDetailView.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={plasticSummaryDetailView.columns.length}
                        className="px-3 py-8 text-center font-bold text-zinc-400"
                      >
                        Không có dòng chi tiết.
                      </td>
                    </tr>
                  ) : (
                    plasticSummaryDetailView.rows.map((row, index) => (
                      <tr key={`${plasticSummaryDetailView.metric}-${index}`} className="hover:bg-red-50/30">
                        {plasticSummaryDetailView.columns.map(column => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 font-semibold text-zinc-800 ${
                              column.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {formatPlasticSummaryCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {plasticSummaryDetailView.totalCells ? (
                  <tfoot className="border-t-2 border-zinc-300 bg-zinc-50">
                    <tr>
                      {plasticSummaryDetailView.columns.map(column => (
                        <td
                          key={column.key}
                          className={`px-3 py-2.5 font-black text-zinc-800 ${
                            column.align === 'right' ? 'text-right font-mono text-red-800' : 'uppercase tracking-wider text-zinc-600'
                          }`}
                        >
                          {formatPlasticSummaryCell(plasticSummaryDetailView.totalCells?.[column.key])}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {selectedTonDauFormula ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức tồn NVL"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedTonDauFormula(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-800 to-indigo-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-100">Công thức tồn (kg)</p>
              <h4 className="mt-1 text-base font-black">
                {selectedTonDauFormula.itemCode || '—'} · {selectedTonDauFormula.itemName || '—'}
              </h4>
              <p className="mt-2 font-mono text-lg font-black text-white">
                {formatKg(selectedTonDauFormula.tonDauWeightKg, 4)} kg
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTonDauFormula(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-white sm:text-[11px]">
                  <tr>
                    <th className="px-3 py-2.5 font-black">Chỉ tiêu</th>
                    <th className="px-3 py-2.5 font-black">Công thức</th>
                    <th className="px-3 py-2.5 text-right font-black">Giá trị</th>
                    <th className="w-16 px-3 py-2.5 font-black">ĐVT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  <tr className="bg-zinc-50/80">
                    <td className="px-3 py-2 font-black text-zinc-500">Mã NVL</td>
                    <td className="px-3 py-2 font-mono font-bold text-zinc-800" colSpan={3}>
                      {selectedTonDauFormula.itemCode || '—'}
                    </td>
                  </tr>
                  <tr className="bg-zinc-50/80">
                    <td className="px-3 py-2 font-black text-zinc-500">Tên NVL</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800" colSpan={3}>
                      {selectedTonDauFormula.itemName || '—'}
                    </td>
                  </tr>
                  <tr className="bg-zinc-50/80">
                    <td className="px-3 py-2 font-black text-zinc-500">Lệnh / Ca / Máy</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700" colSpan={3}>
                      {selectedTonDauFormula.orderCode || '—'} · {selectedTonDauFormula.ngay || '—'} ·{' '}
                      {selectedTonDauFormula.shiftLabel || '—'} · {selectedTonDauFormula.machine || '—'}
                    </td>
                  </tr>
                  {selectedTonDauFormula.fromNnsTron &&
                  selectedTonDauFormula.tiLeThucTeTbPercent !== null ? (
                    <>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-zinc-800">NNS-TRON</td>
                        <td className="px-3 py-2 text-zinc-600">Tồn hỗn hợp trên báo cáo</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                          {formatKg(selectedTonDauFormula.nnsTronTonDauKg, 4)}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">kg</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-semibold text-zinc-800">Tỉ lệ ĐM</td>
                        <td className="px-3 py-2 text-zinc-600">Thành phần SP / tỉ lệ trộn máy</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-orange-800">
                          {formatNumber(selectedTonDauFormula.tiLeThucTeTbPercent, 4)}%
                        </td>
                        <td className="px-3 py-2 text-zinc-600">%</td>
                      </tr>
                      <tr className="hover:bg-indigo-50/40">
                        <td className="px-3 py-2 font-semibold text-zinc-800">Phân bổ từ NNS-TRON</td>
                        <td className="px-3 py-2 font-mono text-[11px] font-bold text-indigo-900 sm:text-xs">
                          NNS-TRON × Tỉ lệ ĐM
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-indigo-900">
                          {formatKg(
                            selectedTonDauFormula.nnsTronTonDauKg *
                              (selectedTonDauFormula.tiLeThucTeTbPercent / 100),
                            4
                          )}
                        </td>
                        <td className="px-3 py-2 text-zinc-600">kg</td>
                      </tr>
                      {selectedTonDauFormula.directTonDauKg > 0 ? (
                        <tr>
                          <td className="px-3 py-2 font-semibold text-zinc-800">Tồn trực tiếp</td>
                          <td className="px-3 py-2 text-zinc-600">Tồn ghi nhận theo mã NVL (chưa trộn…)</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                            {formatKg(selectedTonDauFormula.directTonDauKg, 4)}
                          </td>
                          <td className="px-3 py-2 text-zinc-600">kg</td>
                        </tr>
                      ) : null}
                    </>
                  ) : (
                    <tr>
                      <td className="px-3 py-2 font-semibold text-zinc-800">Tồn theo mã NVL</td>
                      <td className="px-3 py-2 text-zinc-600">Tồn ghi nhận trên báo cáo</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                        {formatKg(selectedTonDauFormula.directTonDauKg, 4)}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">kg</td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="border-t-2 border-zinc-300 bg-zinc-50">
                  <tr>
                    <td className="px-3 py-2.5 font-black uppercase tracking-wider text-zinc-600">Tổng tồn</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-zinc-700 sm:text-xs">
                      {selectedTonDauFormula.fromNnsTron &&
                      selectedTonDauFormula.tiLeThucTeTbPercent !== null ? (
                        selectedTonDauFormula.directTonDauKg > 0 ? (
                          <>
                            Phân bổ NNS-TRON + Tồn trực tiếp ={' '}
                            {formatKg(
                              selectedTonDauFormula.nnsTronTonDauKg *
                                (selectedTonDauFormula.tiLeThucTeTbPercent / 100),
                              4
                            )}{' '}
                            + {formatKg(selectedTonDauFormula.directTonDauKg, 4)}
                          </>
                        ) : (
                          <>NNS-TRON × Tỉ lệ ĐM</>
                        )
                      ) : (
                        <>Tồn ghi nhận theo mã NVL</>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-base font-black text-indigo-900">
                      {formatKg(selectedTonDauFormula.tonDauWeightKg, 4)}
                    </td>
                    <td className="px-3 py-2.5 font-black text-zinc-600">kg</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              Khi có NNS-TRON: phân bổ về từng NVL nhựa bằng Tỉ lệ ĐM (%) và cộng thêm tồn trực tiếp theo mã. Khi không có NNS-TRON: lấy nguyên tồn
              ghi nhận theo mã NVL (dùng chung cho mọi sản phẩm cùng mã NVL đó trong lệnh).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedExportWeight ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức SL/KL thực xuất"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedExportWeight(null);
        }}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-800 to-amber-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                Công thức SL / KL thực xuất
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedExportWeight.itemCode} · {selectedExportWeight.itemName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">
                ĐVT phiếu: {selectedExportWeight.unit || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExportWeight(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL phiếu xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedExportWeight.sourceQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedExportWeight.unit || '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL định mức (Thành phần)</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedExportWeight.demandQuantity !== null
                    ? formatNumber(selectedExportWeight.demandQuantity, 3)
                    : '—'}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedExportWeight.bomAmountType === 'percent'
                    ? 'Nhu cầu (kg ĐM)'
                    : selectedExportWeight.bomAmountType === 'quantity'
                      ? selectedExportWeight.bomRateUnit || selectedExportWeight.unit || 'NVL'
                      : 'Đối chiếu định mức'}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL thực xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedExportWeight.quantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedExportWeight.unit || '—'}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Trọng lượng thực xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-800">
                  {formatKg(selectedExportWeight.weightKg, 2)}
                </p>
                <p className="text-xs font-bold text-amber-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">Phép tính cụ thể</p>
              <div className="mt-2 space-y-1 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                {selectedExportWeight.productQuantity !== null &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.bomAmountType === 'quantity' ? (
                  <p>
                    Nhu cầu SP = {formatNumber(selectedExportWeight.productQuantity, 3)}{' '}
                    {selectedExportWeight.productUnit || 'SP'}
                    {' × '}
                    {formatNumber(selectedExportWeight.bomRate, 3)} {selectedExportWeight.bomRateUnit || ''}
                    {' (Số lượng Thành phần) = '}
                    {formatNumber(selectedExportWeight.demandQuantity, 3)}{' '}
                    {selectedExportWeight.bomRateUnit || selectedExportWeight.unit || ''}
                  </p>
                ) : selectedExportWeight.productQuantity !== null &&
                  selectedExportWeight.bomRate !== null &&
                  selectedExportWeight.bomAmountType === 'percent' ? (
                  <p>
                    Nhu cầu SP = KL ĐM từ Thành phần {formatNumber(selectedExportWeight.bomRate, 3)}%
                    {' (SL SP '}
                    {formatNumber(selectedExportWeight.productQuantity, 3)}{' '}
                    {selectedExportWeight.productUnit || 'SP'}
                    {') = '}
                    {formatNumber(selectedExportWeight.demandQuantity, 3)} kg
                  </p>
                ) : null}
                {selectedExportWeight.convertMode === 'kg_as_is' ? (
                  <p>
                    ĐVT kg → KL phiếu = SL phiếu = {formatNumber(selectedExportWeight.sourceQuantity, 3)}{' '}
                    {selectedExportWeight.unit || 'kg'} ={' '}
                    {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'ton_to_kg' ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 't'}
                    {' × '}1000 = {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'gram_to_kg' ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 'g'}
                    {' ÷ '}1000 = {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'multiply_tong_kg' &&
                  selectedExportWeight.catalogKgPerUnit !== null ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 'đvt'}
                    {' × '}
                    {formatNumber(selectedExportWeight.catalogKgPerUnit, 6)} kg/{selectedExportWeight.unit || 'đvt'}
                    {' (cột Tổng kg kho NVL) = '}
                    {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.weightKg === null ? null : (
                  <p className="text-rose-700">
                    Chưa quy đổi được KL phiếu xuất cho mã {selectedExportWeight.itemCode || '—'}.
                  </p>
                )}
              </div>
              {(!isWarehouseKgUnit(selectedExportWeight.unit) &&
                selectedExportWeight.bomAmountType === 'quantity' &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.productQuantity !== null) ||
              selectedExportWeight.allocationRatio < 0.999999 ||
              Math.abs(selectedExportWeight.quantity - selectedExportWeight.sourceQuantity) > 1e-9 ||
              (selectedExportWeight.sourceWeightKg !== null &&
                selectedExportWeight.weightKg !== null &&
                Math.abs(selectedExportWeight.weightKg - selectedExportWeight.sourceWeightKg) > 1e-9) ? (
                !isWarehouseKgUnit(selectedExportWeight.unit) &&
                selectedExportWeight.bomAmountType === 'quantity' &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.productQuantity !== null ? (
                  <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                    ĐVT ≠ kg → SL thực xuất = SL định mức (SL đặt × Định mức Thành phần) ={' '}
                    {formatNumber(selectedExportWeight.productQuantity, 3)}
                    {' × '}
                    {formatNumber(selectedExportWeight.bomRate, 3)}
                    {' = '}
                    {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    {selectedExportWeight.weightKg !== null ? (
                      <>
                        {'; KL = '}
                        {formatKg(selectedExportWeight.weightKg, 2)} kg
                      </>
                    ) : null}
                    . Không chia % phiếu xuất.
                  </p>
                ) : (
                  <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                    {selectedExportWeight.allocWeightTotal !== null &&
                    selectedExportWeight.allocWeightBase !== null ? (
                      <>
                        ĐVT kg → % phân bổ = KL định mức SP (
                        {formatKg(selectedExportWeight.allocWeightBase, 2)} kg){' ÷ tổng KL định mức các SP cùng NVL ('}
                        {formatKg(selectedExportWeight.allocWeightTotal, 2)} kg) ={' '}
                        {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}%
                      </>
                    ) : (
                      <>
                        ĐVT kg → % phân bổ = SL SP
                        {selectedExportWeight.productQuantity !== null
                          ? ` (${formatNumber(selectedExportWeight.productQuantity, 3)} ${selectedExportWeight.productUnit || ''})`
                          : ''}
                        {' ÷ tổng SL các SP cùng NVL = '}
                        {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}%
                      </>
                    )}
                    {' → '}SL thực xuất = {formatNumber(selectedExportWeight.sourceQuantity, 3)} ×{' '}
                    {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}% ={' '}
                    {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    {selectedExportWeight.weightKg !== null ? (
                      <>
                        {'; KL thực xuất = '}
                        {formatKg(selectedExportWeight.weightKg, 2)} kg
                      </>
                    ) : null}
                    {' '}(phần cuối nhận dư làm tròn).
                  </p>
                )
              ) : (
                <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                  {isWarehouseKgUnit(selectedExportWeight.unit) ? (
                    <>
                      Một SP (hoặc không chia) → SL thực xuất = SL phiếu ={' '}
                      {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    </>
                  ) : (
                    <>
                      ĐVT ≠ kg → SL thực xuất = SL định mức ={' '}
                      {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                      . Không chia % phiếu xuất.
                    </>
                  )}
                  {selectedExportWeight.weightKg !== null ? (
                    <>
                      {'; KL thực xuất = '}
                      {formatKg(selectedExportWeight.weightKg, 2)} kg
                    </>
                  ) : null}
                  .
                </p>
              )}
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              ĐVT kg: SL thực xuất = % (KL định mức SP ÷ tổng KL định mức) × SL phiếu. ĐVT ≠ kg: SL thực xuất = SL định mức (để nguyên, không chia %).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {thucDungDetailView ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết dữ liệu thực xuất dùng"
        onMouseDown={event => {
          if (event.target === event.currentTarget) closeMetricDetail();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-teal-800 to-teal-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-100">
                {thucDungDetailView.valueLabel}
              </p>
              <h4 className="mt-1 text-base font-black">{thucDungDetailView.title}</h4>
              <p className="mt-1 text-xs font-semibold text-teal-50">{thucDungDetailView.subtitle}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{thucDungDetailView.valueText}</p>
            </div>
            <button
              type="button"
              onClick={closeMetricDetail}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            {thucDungDetailView.formula ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
                {thucDungDetailView.formula}
              </div>
            ) : null}
            <div className="bb-table-scroll bb-report-sheet-scroll">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    {thucDungDetailView.columns.map(column => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-black ${column.align === 'right' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {thucDungDetailView.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={thucDungDetailView.columns.length}
                        className="px-3 py-8 text-center font-bold text-zinc-400"
                      >
                        Không tìm thấy dòng nguồn tương ứng.
                      </td>
                    </tr>
                  ) : (
                    thucDungDetailView.rows.map((row, index) => (
                      <tr key={`${String(row.reportId || row.lan || row.ngay || 'row')}-${index}`} className="hover:bg-teal-50/50">
                        {thucDungDetailView.columns.map(column => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 font-semibold text-zinc-800 ${
                              column.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {formatThucDungDetailCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Nguồn: tab Tồn đầu ca / Phiếu xuất kho / Kiểm tồn cuối ca (cùng số liệu các tab đó). Thực dùng =
              Tồn đầu ca + Xuất thực tế − Tồn cuối ca.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {normDetail ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Công thức định mức NVL"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setNormDetail(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-700 to-amber-500 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                {normDetail.metric === 'weight' ? 'Trọng lượng (kg)' : 'SL thực nhập'}
              </p>
              <h4 className="mt-1 text-base font-black">
                {normDetail.itemCode || '—'} · {normDetail.itemName || '—'}
              </h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">
                {normDetail.orderCode || '—'} · {normDetail.ngay || '—'} · {normDetail.shiftLabel || '—'} · {normDetail.machine || '—'}
              </p>
              <p className="mt-2 font-mono text-lg font-black text-white">
                {normDetail.metric === 'weight'
                  ? `${formatKg(normDetail.totalKg, 2)} kg`
                  : `${formatNumber(normDetail.totalQty, 2)} ${normDetail.unit || ''}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNormDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            <div className="bb-table-scroll bb-report-sheet-scroll rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-3 py-2.5 font-black">Thành phẩm</th>
                    <th className="px-3 py-2.5 text-right font-black">SL SP</th>
                    <th className="px-3 py-2.5 font-black">Định mức</th>
                    <th className="px-3 py-2.5 font-black">Công thức</th>
                    <th className="px-3 py-2.5 text-right font-black">
                      {normDetail.metric === 'weight' ? 'KL (kg)' : 'SL'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {normDetail.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center font-bold text-zinc-400">
                        Không có dòng nguồn (thành phẩm chưa có công thức NVL).
                      </td>
                    </tr>
                  ) : (
                    normDetail.lines.map((line, index) => {
                      const mn = line.materialNorm;
                      const typeLabel = mn
                        ? mn.amountType === 'percent'
                          ? `${formatNumber(mn.rate, 2)}%`
                          : `${formatNumber(mn.rate, 3)} ${mn.rateUnit}`
                        : '—';
                      return (
                        <tr key={`${line.key}-${index}`} className="hover:bg-amber-50/40">
                          <td className="px-3 py-2 font-semibold text-zinc-800">
                            {mn?.productName || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-700">
                            {mn && mn.productQuantity > 0
                              ? `${formatNumber(mn.productQuantity, 0)} ${mn.productUnit || ''}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 font-semibold text-zinc-700">{typeLabel}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-700">
                            {mn?.componentWeightKg === null || mn?.componentWeightKg === undefined
                              ? '—'
                              : formatKg(mn.componentWeightKg, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                            {normDetail.metric === 'weight'
                              ? formatKg(line.normWeightKg, 2)
                              : mn?.amountType === 'quantity'
                                ? formatNumber(line.quantity, 2)
                                : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Tổng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-800">
                      {normDetail.metric === 'weight'
                        ? formatKg(normDetail.totalKg, 2)
                        : formatNumber(normDetail.totalQty, 2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {inboundBalanceDetailView ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết logic hiển thị cân bằng vật tư thực tế"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setInboundBalanceDetail(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-700 to-amber-500 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                {inboundBalanceDetailView.valueLabel}
              </p>
              <h4 className="mt-1 text-base font-black">{inboundBalanceDetailView.title}</h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">{inboundBalanceDetailView.subtitle}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{inboundBalanceDetailView.valueText}</p>
            </div>
            <button
              type="button"
              onClick={() => setInboundBalanceDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            {inboundBalanceDetailView.formula ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                {inboundBalanceDetailView.formula}
              </div>
            ) : null}
            <div className="bb-table-scroll bb-report-sheet-scroll">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    {inboundBalanceDetailView.columns.map(column => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-black ${column.align === 'right' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inboundBalanceDetailView.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={inboundBalanceDetailView.columns.length}
                        className="px-3 py-8 text-center font-bold text-zinc-400"
                      >
                        Không tìm thấy dòng nguồn tương ứng.
                      </td>
                    </tr>
                  ) : (
                    inboundBalanceDetailView.rows.map((row, index) => (
                      <tr
                        key={`${String(row.reportId || row.soPhieu || row.documentNo || row.ngay || 'row')}-${index}`}
                        className="hover:bg-amber-50/50"
                      >
                        {inboundBalanceDetailView.columns.map(column => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 font-semibold text-zinc-800 ${
                              column.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {formatThucDungDetailCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Nguồn: báo cáo tồn đầu/cuối ca, phiếu xuất kho NVL (theo ngày, mọi ca), báo cáo hàng lỗi hỏng — khớp theo đúng mã NVL.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {printConfirmOpen ? (
      <div
        className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={`Xác nhận in ${machineReportTitle}`}
        onMouseDown={event => {
          if (event.target === event.currentTarget) closePrintConfirm();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-100">Xác nhận trước khi in</p>
              <h4 className="mt-1 text-base font-black">{machineReportTitle}</h4>
              <p className="mt-1 text-xs font-semibold text-sky-50">
                Chọn nhân sự, ghi chú — rồi xem trước trước khi in.
              </p>
            </div>
            <button
              type="button"
              onClick={closePrintConfirm}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {orderGroups.map(group => {
              const selection = printStaffByOrder[group.groupKey] || {
                staffMain: group.staffMain || '',
                staffAssistant: group.staffAssistant || '',
                staffSupport: group.staffSupport || '',
                ghiChu: ''
              };
              const staffSelectClass =
                'h-10 w-full rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15';
              const ensureOption = (value: string) => {
                const trimmed = String(value ?? '').trim();
                if (!trimmed) return printStaffOptions;
                return printStaffOptions.includes(trimmed)
                  ? printStaffOptions
                  : [trimmed, ...printStaffOptions];
              };
              return (
                <div
                  key={group.groupKey}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm"
                >
                  <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Số lệnh</span>
                      <span className="mt-0.5 block font-mono font-black text-sky-900">{group.orderCode || '—'}</span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">{group.ngay || '—'}</span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ca</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">
                        {group.shiftLabel || group.shift || '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Máy</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">{group.machine || '—'}</span>
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN chính máy *
                      </span>
                      <select
                        value={selection.staffMain}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffMain', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffMain).map(name => (
                          <option key={`main-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN phụ máy
                      </span>
                      <select
                        value={selection.staffAssistant}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffAssistant', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffAssistant).map(name => (
                          <option key={`assistant-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN hỗ trợ việc
                      </span>
                      <select
                        value={selection.staffSupport}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffSupport', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffSupport).map(name => (
                          <option key={`support-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                      Ghi chú
                    </span>
                    <textarea
                      value={selection.ghiChu}
                      onChange={event => updatePrintStaff(group.groupKey, 'ghiChu', event.target.value)}
                      rows={3}
                      placeholder="Nhập ghi chú hiển thị trên phiếu in..."
                      className="min-h-[72px] w-full resize-y rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={closePrintConfirm}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-700"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={confirmPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-4 text-xs font-extrabold text-white hover:bg-sky-800"
            >
              <Printer className="h-4 w-4" />
              Xem trước
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {printPreviewOpen ? createPortal(
      <div
        className="fixed inset-0 z-[10050] flex flex-col bg-slate-950/70 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Xem trước báo cáo máy BB"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-slate-900 px-4 py-3 text-white shadow-lg">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Xem trước khi in</p>
            <h4 className="text-sm font-black sm:text-base">Báo cáo kết quả theo từng lệnh sản xuất</h4>
            <p className="mt-0.5 text-xs font-semibold text-slate-300">
              Sau khi sửa phiếu xuất kho / Tổng kg kho NVL → bấm Đồng bộ. Gõ lý do SP, ghi chú mục 5 → Lưu lý do DB → In.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {printPreviewSyncMessage ? (
              <span
                className="max-w-[320px] truncate text-xs font-semibold text-amber-200"
                title={printPreviewSyncMessage}
              >
                {printPreviewSyncMessage}
              </span>
            ) : null}
            {lyDoSaveMessage ? (
              <span className="max-w-[280px] truncate text-xs font-semibold text-sky-200" title={lyDoSaveMessage}>
                {lyDoSaveMessage}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void syncPrintPreviewData()}
              disabled={printPreviewSyncing || pendingPrint || isLoading}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-600/90 px-4 text-xs font-black hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
              title="Tải lại phiếu xuất kho, Thành phần SP, Tổng kg — cập nhật Báo cáo sản lượng và mục 3.1/3.2"
            >
              {printPreviewSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {printPreviewSyncing ? 'Đang đồng bộ...' : 'Đồng bộ'}
            </button>
            <button
              type="button"
              onClick={() => void savePrintLyDoToDb()}
              disabled={savingLyDo || pendingPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-400/60 bg-emerald-600/90 px-4 text-xs font-black hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingLyDo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingLyDo ? 'Đang lưu...' : 'Lưu lý do DB'}
            </button>
            <button type="button" onClick={editPrintDetails} className="h-10 rounded-lg border border-slate-500 bg-white/10 px-4 text-xs font-black hover:bg-white/20">
              Quay lại chỉnh sửa
            </button>
            <button type="button" onClick={closePrintPreview} className="h-10 rounded-lg border border-slate-500 bg-white/10 px-4 text-xs font-black hover:bg-white/20">
              Đóng
            </button>
            <button type="button" onClick={printFromPreview} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-xs font-black hover:bg-sky-500">
              <Printer className="h-4 w-4" /> In báo cáo
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-6">
          <div className="bb-machine-report-preview mx-auto w-fit bg-white shadow-2xl">
            <ControlBoardBbMachineReportPrintBatch
              key={printPreviewDataKey}
              orderGroups={printOrderGroups.length > 0 ? printOrderGroups : orderGroupsMerged}
              exportGroups={exportGroups}
              exportRows={exportRows}
              dauCaGroups={dauCaGroups}
              cuoiCaGroups={cuoiCaGroups}
              damagedGroups={damagedGroups}
              mixingGroups={mixingGroups}
              danhGiaGroups={danhGiaGroups}
              thucDungGroups={thucDungGroups}
              inboundRows={inboundRows}
              acceptanceReports={acceptanceReports}
              products={products}
              materials={materials}
              phanTichMap={phanTichMap}
              noteByOrder={printNoteByOrder}
              lyDoByLine={printLyDoByLine}
              editableLyDo={!pendingPrint}
              onLyDoChange={(lineKey, value) =>
                setPrintLyDoByLine(prev => ({ ...prev, [lineKey]: value }))
              }
              editableNote={!pendingPrint}
              onNoteChange={(groupKey, value) =>
                setPrintNoteByOrder(prev => ({ ...prev, [groupKey]: value }))
              }
              sanLuongSource={sanLuongSource}
              sanLuongGroups={sanLuongGroups}
              canTuDongRecords={calcCanTuDongRecords.length > 0 ? calcCanTuDongRecords : canTuDongRecords}
              machineReportLabel={machineReportLabel}
              warehouseMovements={warehouseMovements}
              warehouseMovementsByDate={warehouseMovementsByDate ?? warehouseMovements}
              shiftSettings={shiftSettings}
            />
          </div>
        </div>
      </div>,
      document.body
    ) : null}
    {showPrintSheet
      ? createPortal(
          <ControlBoardBbMachineReportPrintBatch
            orderGroups={printOrderGroups.length > 0 ? printOrderGroups : orderGroupsMerged}
            exportGroups={exportGroups}
            exportRows={exportRows}
            dauCaGroups={dauCaGroups}
            cuoiCaGroups={cuoiCaGroups}
            damagedGroups={damagedGroups}
            mixingGroups={mixingGroups}
            danhGiaGroups={danhGiaGroups}
            thucDungGroups={thucDungGroups}
            inboundRows={inboundRows}
            acceptanceReports={acceptanceReports}
            products={products}
            materials={materials}
            phanTichMap={phanTichMap}
            noteByOrder={printNoteByOrder}
            lyDoByLine={printLyDoByLine}
            sanLuongSource={sanLuongSource}
            sanLuongGroups={sanLuongGroups}
            canTuDongRecords={calcCanTuDongRecords.length > 0 ? calcCanTuDongRecords : canTuDongRecords}
            machineReportLabel={machineReportLabel}
            warehouseMovements={warehouseMovements}
            warehouseMovementsByDate={warehouseMovementsByDate ?? warehouseMovements}
            shiftSettings={shiftSettings}
          />,
          document.body
        )
      : null}
    {giaiTrinhPrintReport
      ? createPortal(<BbGiaiTrinhPrintSheet report={giaiTrinhPrintReport} />, document.body)
      : null}
    </>
  );
}
