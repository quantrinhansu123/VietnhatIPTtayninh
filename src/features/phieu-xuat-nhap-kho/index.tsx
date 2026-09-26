import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Factory,
  FilePlus2,
  History,
  ImagePlus,
  Loader2,
  ListChecks,
  Package,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Recycle,
  RefreshCw,
  Save,
  ScanBarcode,
  Search,
  Scale,
  TriangleAlert,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import type { AuthUser } from '../../app/authUser';
import { BackButton } from '../../components/layout/NavButtons';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import ProductQrScanner from '../../components/ProductQrScanner';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TableShell,
  TablePagination,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  RowActionsMenu
} from '../../components/shared/table';
import { pickText, fileToDataUrl, fileToOptimizedImageDataUrl, uploadImage } from '../_shared/recordHelpers';
import { CAMERA_IMAGE_INPUT_PROPS } from '../../utils/cameraCapture';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from '../../components/WeighingImagePreviewModal';
import WarehouseSlipPrintModal, {
  mergeWarehousePrintLines,
  mergeWarehousePrintSlips,
  type WarehouseSlipPrintData
} from '../../components/WarehouseSlipPrintModal';
import ProductQrPrintModal, { type ProductQrPrintLabel } from '../../components/ProductQrPrintModal';
import {
  STORAGE_WAREHOUSE_SLIP_DRAFT_KEY
} from '../_shared/storageKeys';
import { getProductionShiftOptions, normalizeShiftSettings, shiftNamesMatch } from '../../utils/shiftSettings';
import { findProductByCode, normalizeProducts } from '../san-pham';
import { normalizeProductCodeKey } from '../san-pham/types';
import {
  buildProductionOrderMaterialProposal,
  buildProductionOrderMaterialProposalFromActualWeighing,
  loadProductionOrderProductCatalog
} from '../ke-hoach-san-xuat';
import { normalizeMaterialsInventory } from '../kho-nvl';
import {
  composeReasonWithProductionOrderCodes,
  extractLinkedProductionOrderCodes,
  stripProductionOrderCodesFromReason,
  type ShiftSummaryWarehouseMovement
} from '../../utils/controlBoardShiftSummary';
import {
  canTuDongShiftMatches,
  parseCanTuDongQrProductCode,
  resolveCanTuDongMachine,
  resolveTrongLuongNhuaKg,
  type CanTuDongWeightRow
} from '../../utils/canTuDongWeights';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import type { MaterialOption } from '../san-pham/types';
import {
  convertWarehouseQuantityToKg,
  findMaterialTongKgPerUnit,
  formatWarehouseWeightKg,
  isWarehouseKgUnit as isWarehouseWeightKgUnit,
  mapMaterialToWeightCatalogItem,
  mapProductToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from '../../utils/warehouseWeight';
import { isCuonUnit } from '../../utils/controlBoardShiftSummary';

export type WarehouseSlipType = 'nhap' | 'xuat';
export type WarehouseKind =
  | 'nvl'
  | 'san_pham'
  | 'tai_che'
  | 'hang_hong'
  | 'hang_hoa'
  | 'cong_cu_dung_cu'
  | 'gia_cong';

const WAREHOUSE_HISTORY_TABS = [
  ['nvl', 'Kho NVL', Boxes],
  ['san_pham', 'Kho thành phẩm', Package],
  ['hang_hong', 'Kho hàng hỏng', TriangleAlert],
  ['hang_hoa', 'Kho hàng hóa', Package],
  ['cong_cu_dung_cu', 'Kho công cụ dụng cụ', Wrench],
  ['gia_cong', 'Kho gia công', Factory],
  ['tai_che', 'Kho tái chế', Recycle]
] as const satisfies ReadonlyArray<readonly [WarehouseKind, string, React.ComponentType<{ className?: string }>]>;

type WarehouseHistoryOption = { name: string; kind: WarehouseKind };

const WAREHOUSE_HISTORY_SLIP_TYPE_TABS = [
  { key: 'xuat' as const, label: 'Xuất kho', hint: 'Phiếu xuất kho đã lưu', Icon: ArrowUpFromLine },
  { key: 'nhap' as const, label: 'Nhập kho', hint: 'Phiếu nhập kho đã lưu', Icon: ArrowDownToLine }
];

export interface WarehouseMovementRow {
  id: string;
  slipCode: string;
  status: 'chua_chot' | 'da_chot';
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
  warehouseName: string;
  slipDate: string;
  shift: string;
  machine: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  documentQuantity?: number;
  unitPrice: number;
  lineAmount: number;
  reason: string;
  note: string;
  createdBy: string;
  createdAt: string;
  slipCreatedAt?: string;
  sourceInboundLineId?: string;
  sourceInboundSlipCode?: string;
  damagedReportRowId?: string;
  acceptanceReportRowId?: string;
  treo?: boolean;
  actualWeightImageUrl?: string;
  daIn?: boolean;
}

export interface WarehouseSlipLineDraft {
  key: string;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  documentQuantity?: string;
  unitPrice: string;
  quotaQuantity?: string;
  suggestedQuantity?: string;
  lineNote?: string;
  sourceInboundLineId?: string;
  sourceInboundSlipCode?: string;
  damagedReportRowId?: string;
  /** ID dòng bao_cao_nghiem_thu nguồn (gợi ý nhập kho từ Báo cáo sản lượng). */
  acceptanceReportRowId?: string;
  actualWeightImageUrl?: string;
  actualWeightImagePublicId?: string;
  /** Dòng được tạo/cập nhật bằng quét mã, không cần chụp ảnh số cân. */
  isScanned?: boolean;
}

type PendingDamagedReportItem = {
  reportRowId: string;
  materialType: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
};

type PendingDamagedReport = {
  key: string;
  documentNo: string;
  reportDate: string;
  productionDate: string;
  shift: string;
  weigher: string;
  machine: string;
  note: string;
  createdAt: string;
  items: PendingDamagedReportItem[];
};

type WarehouseMachineOption = {
  id: string;
  code: string;
  name: string;
};

type WarehouseMachineSelectOption = WarehouseMachineOption & {
  label: string;
};

export type NvlInboundLotOption = {
  id: string;
  ma_phieu: string;
  ngay_phieu: string;
  ma_npl: string;
  ten_npl: string;
  don_vi: string;
  don_gia: number;
  so_luong_nhap: number;
  so_luong_da_xuat: number;
  so_luong_con: number;
};

export type WarehouseSlipPrefillDraft = {
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
  warehouseName?: string;
  slipDate?: string;
  reason: string;
  note: string;
  createdBy: string;
  productionOrderRef?: string;
  machine?: string;
  shift?: string;
  recipient?: string;
  deliverer?: string;
  warehouseLocation?: string;
  editSlipCode?: string;
  actualWeightImageUrl?: string;
  actualWeightImagePublicId?: string;
  /** Thời điểm tạo draft (Date.now()) — dùng để bỏ qua draft cũ còn sót lại trong localStorage. */
  createdAt?: number;
  lines: Array<
    Pick<
      WarehouseSlipLineDraft,
      | 'code'
      | 'name'
      | 'unit'
      | 'quantity'
      | 'documentQuantity'
      | 'unitPrice'
      | 'quotaQuantity'
      | 'suggestedQuantity'
      | 'lineNote'
      | 'sourceInboundLineId'
      | 'sourceInboundSlipCode'
      | 'damagedReportRowId'
      | 'acceptanceReportRowId'
      | 'actualWeightImageUrl'
      | 'actualWeightImagePublicId'
      | 'isScanned'
    >
  >;
};

type SavedProductScanRow = {
  id: string | number;
  ma_sp: string;
  ma_sp_quet?: string | null;
  ten_sp?: string | null;
  don_vi?: string | null;
  so_luong?: number | null;
  created_at?: string | null;
};

type SavedProductSummaryRow = {
  ma_sp: string;
  ten_sp: string;
  so_luong: number;
};

type OpenProductSlip = {
  ma_phieu: string;
  ngay?: string | null;
  nhan_su?: string | null;
  ghi_chu?: string | null;
  status: 'chua_chot';
  created_at?: string | null;
};

function formatWarehouseSavedAt(value: string) {
  if (!value) return 'Đang lưu…';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

/** Draft quá thời gian này (ms) coi như đã cũ/bỏ dở, không tự điền vào phiếu mới nữa. */
const WAREHOUSE_SLIP_DRAFT_MAX_AGE_MS = 5 * 60 * 1000;

export function buildWarehouseSlipDraftFromHistoryRows(
  rows: WarehouseMovementRow[],
  slipCode: string
): WarehouseSlipPrefillDraft | null {
  const header = rows[0];
  if (!header) return null;

  const linkedOrderCodes = extractLinkedProductionOrderCodes(header.reason, header.note);
  const isProductInbound = header.slipType === 'nhap' && header.warehouseKind === 'san_pham';
  const productLines = new Map<string, { code: string; name: string; unit: string; quantity: number; weightedPrice: number }>();
  if (isProductInbound) {
    for (const row of rows) {
      const code = warehouseCodePrefix(String(row.itemCode || '').trim());
      const key = normalizeMaterialCodeKey(code);
      if (!key) continue;
      const quantity = Number(row.quantity) || 0;
      const line = productLines.get(key) || { code, name: '', unit: '', quantity: 0, weightedPrice: 0 };
      line.name ||= String(row.itemName || '').trim();
      line.unit ||= String(row.unit || '').trim();
      line.quantity += quantity;
      line.weightedPrice += (Number(row.unitPrice) || 0) * quantity;
      productLines.set(key, line);
    }
  }
  const draftLines = isProductInbound && productLines.size
    ? [...productLines.values()].map(line => ({
        code: line.code,
        name: line.name,
        unit: line.unit,
        quantity: formatNumber(line.quantity, 2),
        documentQuantity: '',
        unitPrice: line.quantity > 0 && line.weightedPrice > 0 ? String(line.weightedPrice / line.quantity) : ''
      }))
    : rows.map(row => ({
        code: row.itemCode,
        name: row.itemName,
        unit: row.unit,
        quantity: formatNumber(row.quantity, 2),
        documentQuantity:
          row.documentQuantity != null && Number.isFinite(row.documentQuantity)
            ? formatNumber(row.documentQuantity, 2)
            : '',
        unitPrice: row.unitPrice > 0 ? String(row.unitPrice) : '',
        sourceInboundLineId: row.sourceInboundLineId || '',
        sourceInboundSlipCode: row.sourceInboundSlipCode || '',
        damagedReportRowId: row.damagedReportRowId || '',
        acceptanceReportRowId: row.acceptanceReportRowId || '',
        actualWeightImageUrl: row.actualWeightImageUrl || '',
        actualWeightImagePublicId: ''
      }));

  return {
    slipType: header.slipType,
    warehouseKind: header.warehouseKind,
    warehouseName: header.warehouseName,
    slipDate: header.slipDate,
    reason: stripProductionOrderCodesFromReason(header.reason || ''),
    note: header.note || '',
    createdBy: header.createdBy || '',
    productionOrderRef: formatWarehouseProductionOrderSelection(linkedOrderCodes),
    machine: header.machine || '',
    shift: header.shift || '',
    editSlipCode: slipCode,
    lines: draftLines
  };
}

const warehouseFieldClass =
  'h-9 w-full rounded-lg border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const warehouseLineFieldClass =
  'h-9 w-full rounded-md border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const warehouseLineHeaderClass =
  'px-0.5 text-[10px] font-black uppercase tracking-wide text-white whitespace-nowrap';

// Mobile: Mã SP, Tên SP, Số lượng, Trọng lượng — min-w cố định để cuộn ngang thay vì bị bóp chữ.
const warehouseMobileLineColsClass =
  'min-w-[26rem] grid-cols-[minmax(5.5rem,1fr)_minmax(5.5rem,1.1fr)_minmax(3.5rem,0.65fr)_minmax(4rem,0.85fr)]';

const warehouseNhapLineGridClass =
  `grid ${warehouseMobileLineColsClass} items-center gap-1.5 border-b border-zinc-200/80 py-1.5 md:min-w-[50rem] md:grid-cols-[2.25rem_minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_5.5rem_5.5rem_4.5rem_5.75rem_2rem]`;

const warehouseXuatLineGridClass =
  `grid ${warehouseMobileLineColsClass} items-center gap-1.5 border-b border-zinc-200/80 py-1.5 md:min-w-[56rem] md:grid-cols-[2.25rem_minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_4.5rem_6.25rem_5.5rem_4.5rem_5.75rem_2rem]`;

const warehouseNhapHeaderGridClass =
  `mb-1 grid ${warehouseMobileLineColsClass} items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-2 py-2 md:min-w-[50rem] md:grid-cols-[2.25rem_minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_5.5rem_5.5rem_4.5rem_5.75rem_2rem]`;

const warehouseXuatHeaderGridClass =
  `mb-1 grid ${warehouseMobileLineColsClass} items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-2 py-2 md:min-w-[56rem] md:grid-cols-[2.25rem_minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_4.5rem_6.25rem_5.5rem_4.5rem_5.75rem_2rem]`;

const warehouseLineMobileHiddenClass = 'hidden md:block';

export function parseWarehouseShiftSelection(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(item => item.trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,;+]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function formatWarehouseShiftSelection(shifts: string[]): string {
  return shifts.join(', ');
}

/** ĐVT kg (không phân biệt hoa thường) → ưu tiên xếp đầu danh sách xuất kho. */
export function isWarehouseKgUnit(unit?: string | null) {
  return isWarehouseWeightKgUnit(String(unit || ''));
}

/** Xuất kho: ĐVT kg lên đầu, trong mỗi nhóm xếp khối lượng quy đổi giảm dần, rồi theo mã. */
export function sortWarehouseLinesKgFirst<T extends { unit?: string; code?: string; itemCode?: string }>(
  lines: T[],
  options?: { getWeightKg?: (line: T) => number | null }
): T[] {
  return [...lines].sort((a, b) => {
    const aKg = isWarehouseKgUnit(a.unit);
    const bKg = isWarehouseKgUnit(b.unit);
    if (aKg !== bKg) return aKg ? -1 : 1;

    if (options?.getWeightKg) {
      const aWeight = options.getWeightKg(a);
      const bWeight = options.getWeightKg(b);
      const aVal = aWeight !== null && Number.isFinite(aWeight) && aWeight > 0 ? aWeight : -1;
      const bVal = bWeight !== null && Number.isFinite(bWeight) && bWeight > 0 ? bWeight : -1;
      if (aVal !== bVal) return bVal - aVal;
    }

    const aCode = String(a.code || a.itemCode || '');
    const bCode = String(b.code || b.itemCode || '');
    return aCode.localeCompare(bCode, 'vi');
  });
}

export function toggleWarehouseShiftSelection(current: string[], shiftValue: string): string[] {
  return current.includes(shiftValue)
    ? current.filter(item => item !== shiftValue)
    : [...current, shiftValue];
}

export function parseWarehouseProductionOrderSelection(value: string | undefined | null): string[] {
  return String(value || '')
    .split(/[,;|/]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function formatWarehouseProductionOrderSelection(codes: string[]): string {
  return codes.join(', ');
}

export function toggleWarehouseProductionOrderSelection(current: string[], orderCode: string): string[] {
  return current.includes(orderCode)
    ? current.filter(item => item !== orderCode)
    : [...current, orderCode];
}

export function warehouseSlipTypeLabel(type: WarehouseSlipType) {
  return type === 'nhap' ? 'Nhập kho' : 'Xuất kho';
}

function sumWarehouseRollQuantity(rows: Array<{ quantity: number; unit?: string }>): number {
  let total = 0;
  for (const row of rows) {
    const unit = String(row.unit || '').trim();
    if (!isCuonUnit(unit)) continue;
    const qty = Number(row.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    total += qty;
  }
  return total;
}

function formatWarehouseRollTotal(total: number): string {
  if (!(total > 0)) return '0 cuộn';
  const rounded = Math.round(total * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return `${formatNumber(rounded, digits)} cuộn`;
}

function normalizeWarehouseNameKey(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function isRecycleWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  if (!key) return false;
  return key.includes('tai che') || key.includes('recycle') || key.includes('tai_che') || key.includes('tai-che');
}

/** Kho rác (chứa SP rác từ Báo cáo sản lượng). "trac" (trách) không tính. */
export function isTrashWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  if (!key) return false;
  return key.includes('trash') || (key.includes('rac') && !key.includes('trac'));
}

export function isDamagedGoodsWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  if (!key) return false;
  return key.includes('hang hong') || key.includes('hang_hong') || key.includes('hang-hong') || key.includes('damaged');
}

export function isGoodsWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  return key.includes('hang hoa') || key.includes('hang_hoa') || key.includes('hang-hoa') || key.includes('goods');
}

export function isToolsWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  return key.includes('cong cu dung cu') || key.includes('cong_cu_dung_cu') || key.includes('cong-cu-dung-cu') || key.includes('tools');
}

export function isProcessingWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  return key.includes('gia cong') || key.includes('gia_cong') || key.includes('gia-cong') || key.includes('processing');
}

export function isFinishedGoodsWarehouseName(value?: string | null) {
  const key = normalizeWarehouseNameKey(value);
  if (!key) return false;
  return (
    key.includes('thanh pham') ||
    key.includes('san pham') ||
    key.includes('finished') ||
    key.includes('kho sp')
  );
}

/** Suy loại kho từ tên kho trong Quản lý kho. */
export function inferWarehouseKindFromName(value?: string | null): WarehouseKind {
  if (isFinishedGoodsWarehouseName(value)) return 'san_pham';
  if (isDamagedGoodsWarehouseName(value)) return 'hang_hong';
  if (isGoodsWarehouseName(value)) return 'hang_hoa';
  if (isToolsWarehouseName(value)) return 'cong_cu_dung_cu';
  if (isProcessingWarehouseName(value)) return 'gia_cong';
  if (isRecycleWarehouseName(value)) return 'tai_che';
  return 'nvl';
}

/**
 * Kho vật tư (NVL, tái chế, hàng hỏng, hàng hóa, công cụ dụng cụ, gia công) và Kho thành phẩm
 * do 2 người phụ trách khác nhau theo luồng nghiệp vụ → tách quyền Thêm/Sửa/Xóa theo loại kho.
 */
export function warehouseKindPermissionTab(kind: WarehouseKind): 'warehouse-slip-vat-tu' | 'warehouse-slip-thanh-pham' {
  return kind === 'san_pham' ? 'warehouse-slip-thanh-pham' : 'warehouse-slip-vat-tu';
}

/** Quyền Thêm/Sửa/Xóa của người phụ trách Vật tư và người phụ trách Thành phẩm. */
export function useWarehouseSlipAccess() {
  return {
    vatTu: useTabAccess('warehouse-slip-vat-tu'),
    thanhPham: useTabAccess('warehouse-slip-thanh-pham')
  };
}

/** Chọn bộ quyền tương ứng với loại kho đang thao tác. */
export function pickWarehouseSlipAccess(
  access: ReturnType<typeof useWarehouseSlipAccess>,
  kind: WarehouseKind
) {
  return warehouseKindPermissionTab(kind) === 'warehouse-slip-thanh-pham' ? access.thanhPham : access.vatTu;
}

export function warehouseKindLabel(kind: WarehouseKind) {
  if (kind === 'san_pham') return 'Kho thành phẩm';
  if (kind === 'hang_hong') return 'Kho hàng hỏng';
  if (kind === 'hang_hoa') return 'Kho hàng hóa';
  if (kind === 'cong_cu_dung_cu') return 'Kho công cụ dụng cụ';
  if (kind === 'gia_cong') return 'Kho gia công';
  if (kind === 'tai_che') return 'Kho tái chế';
  return 'Kho NVL';
}

export function warehouseItemCodeLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Mã TP' : 'Mã NVL';
}

export function warehouseItemNameLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Tên TP' : 'Tên NVL';
}

export function computeWarehouseLineAmount(quantityText: string, unitPriceText: string): number {
  const quantity = parsePercentInput(quantityText);
  const unitPrice = parseMoneyInput(unitPriceText);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return 0;
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function generateWarehouseSlipPreviewCode(slipType: WarehouseSlipType) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${slipType === 'nhap' ? 'PN' : 'PX'}-${date}-${time}`;
}

export type WarehouseSlipPayloadItem = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  documentQuantity?: number;
  unitPrice: number;
  quotaQuantity?: number;
  suggestedQuantity?: number;
  lineNote?: string;
  sourceInboundLineId?: string;
  sourceInboundSlipCode?: string;
  damagedReportRowId?: string;
  acceptanceReportRowId?: string;
  actualWeightImageUrl?: string;
  actualWeightImagePublicId?: string;
  isScanned?: boolean;
};

export function parseWarehouseSlipPayloadItems(
  lines: WarehouseSlipLineDraft[],
  warehouseKind: WarehouseKind,
  options?: {
    allowMissingUnitPrice?: boolean;
    requireInboundLot?: boolean;
    includeDocumentQuantity?: boolean;
  }
): { error: string } | { items: WarehouseSlipPayloadItem[] } {
  const itemLabel = warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL';
  const codeLabel = warehouseItemCodeLabel(warehouseKind);
  const allowMissingUnitPrice = options?.allowMissingUnitPrice ?? false;
  const requireInboundLot = options?.requireInboundLot ?? false;
  const includeDocumentQuantity = options?.includeDocumentQuantity ?? false;

  const payloadItems = lines
    .map(line => {
      const quantity = parsePercentInput(line.quantity);
      const documentQuantity = parsePercentInput(line.documentQuantity ?? line.suggestedQuantity ?? '');
      const unitPrice = parseMoneyInput(line.unitPrice);
      const quotaQuantity = parsePercentInput(line.quotaQuantity ?? '');
      const suggestedQuantity = parsePercentInput(line.suggestedQuantity ?? '');
      const sourceInboundLineId = String(line.sourceInboundLineId || '').trim();
      const sourceInboundSlipCode = String(line.sourceInboundSlipCode || '').trim();
      const damagedReportRowId = String(line.damagedReportRowId || '').trim();
      const acceptanceReportRowId = String(line.acceptanceReportRowId || '').trim();
      const actualWeightImageUrl = String(line.actualWeightImageUrl || '').trim();
      const actualWeightImagePublicId = String(line.actualWeightImagePublicId || '').trim();
      return {
        code: line.code.trim(),
        name: line.name.trim(),
        unit: line.unit.trim(),
        quantity,
        documentQuantity:
          includeDocumentQuantity && Number.isFinite(documentQuantity) && documentQuantity > 0
            ? documentQuantity
            : undefined,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        quotaQuantity: Number.isFinite(quotaQuantity) && quotaQuantity > 0 ? quotaQuantity : undefined,
        suggestedQuantity:
          Number.isFinite(suggestedQuantity) && suggestedQuantity > 0 ? suggestedQuantity : undefined,
        lineNote: line.lineNote?.trim() || undefined,
        sourceInboundLineId: sourceInboundLineId || undefined,
        sourceInboundSlipCode: sourceInboundSlipCode || undefined,
        damagedReportRowId: damagedReportRowId || undefined,
        acceptanceReportRowId: acceptanceReportRowId || undefined,
        actualWeightImageUrl: actualWeightImageUrl || undefined,
        actualWeightImagePublicId: actualWeightImagePublicId || undefined,
        isScanned: line.isScanned === true,
      };
    })
    .filter(line => line.code || line.quantity);

  if (payloadItems.length === 0) {
    return { error: `Vui lòng thêm ít nhất một dòng ${itemLabel}.` };
  }

  for (const item of payloadItems) {
    if (!item.code) {
      return { error: `Mỗi dòng cần chọn ${codeLabel}.` };
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: `Số lượng của ${item.code} phải lớn hơn 0.` };
    }
    if (!allowMissingUnitPrice && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      return { error: `Giá của ${item.code} không hợp lệ.` };
    }
    if (requireInboundLot && !item.sourceInboundLineId) {
      return { error: `Dòng ${item.code} cần chọn lô nhập (giá) khi xuất NVL.` };
    }
  }

  return { items: payloadItems };
}

export function buildWarehouseSlipPrintData(
  items: WarehouseSlipPayloadItem[],
  options: {
    slipCode: string;
    slipType: WarehouseSlipType;
    warehouseKind: WarehouseKind;
    slipDate: string;
    reason: string;
    note: string;
    createdBy: string;
    productionOrderRef?: string;
    machine?: string;
    shift?: string;
    recipient?: string;
    deliverer?: string;
    warehouseLocation?: string;
    warehouseName?: string;
    materials?: WarehouseWeightCatalogItem[];
    products?: WarehouseWeightCatalogItem[];
  }
): WarehouseSlipPrintData {
  const weightKind = options.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl';
  const printLines = items.map(item => {
    const weightKg = convertWarehouseQuantityToKg({
      quantity: item.quantity,
      unit: item.unit,
      itemCode: item.code,
      warehouseKind: weightKind,
      materials: options.materials ?? [],
      products: options.products ?? [],
      preferTongKgOnly: true
    });
    return {
      code: item.code,
      name: item.name,
      unit: item.unit,
      quantity: item.quantity,
      documentQuantity: item.documentQuantity ?? null,
      unitPrice: item.unitPrice,
      lineAmount: Math.round(item.quantity * item.unitPrice * 100) / 100,
      weightKg,
      quotaQuantity: item.quotaQuantity ?? item.quantity ?? null,
      suggestedQuantity: item.suggestedQuantity ?? null,
      lineNote: item.lineNote,
      sourceInboundSlipCode: item.sourceInboundSlipCode
    };
  });

  const mergedLines =
    options.slipType === 'xuat' && options.warehouseKind !== 'san_pham'
      ? mergeWarehousePrintLines(printLines)
      : printLines;

  return {
    slipCode: options.slipCode,
    slipType: options.slipType === 'xuat' ? 'xuat' : 'nhap',
    warehouseKind: options.warehouseKind,
    slipDate: options.slipDate,
    reason: options.reason,
    note: options.note,
    createdBy: options.createdBy,
    productionOrderRef: options.productionOrderRef,
    machine: options.machine,
    shift: options.shift,
    recipient: options.recipient,
    deliverer: options.deliverer,
    warehouseLocation: options.warehouseLocation,
    warehouseName: options.warehouseName,
    totalAmount: mergedLines.reduce((sum, line) => sum + line.lineAmount, 0),
    lines: mergedLines
  };
}

export function formatWarehouseMoney(value: number) {
  return formatMoney(value, 0);
}

/** So khớp mã bỏ qua khoảng trắng/hoa-thường — mã trong kho_nvl đôi khi bị nhập thiếu dấu cách so với mã gốc bên danh mục sản phẩm (VD "MT-MN043" vs "MT- MN043"). */
function normalizeMaterialCodeKey(raw: string) {
  return String(raw ?? '').replace(/\s+/g, '').toUpperCase();
}

function materialWarehouseNameKey(material: { warehouse?: string }) {
  return normalizeWarehouseNameKey(material.warehouse === '-' ? '' : material.warehouse);
}

function materialHasCatalogTotalWeight(material: { totalWeight?: string }) {
  const value = String(material.totalWeight || '').trim();
  return Boolean(value && value !== '-');
}

/** Gộp mã NVL trùng — ưu tiên bản ghi đúng kho phiếu và có cột Tổng kg (quy đổi kg). */
export function dedupeWarehouseSlipMaterials<T extends { code: string; warehouse?: string; totalWeight?: string }>(
  materials: T[],
  selectedWarehouseName: string
): T[] {
  const selectedWarehouseKey = normalizeWarehouseNameKey(selectedWarehouseName);
  const byCode = new Map<string, T>();

  const score = (item: T) => {
    const warehouseKey = materialWarehouseNameKey(item);
    let value = 0;
    if (selectedWarehouseKey && warehouseKey === selectedWarehouseKey) value += 4;
    if (materialHasCatalogTotalWeight(item)) value += 2;
    if (warehouseKey) value += 1;
    return value;
  };

  for (const material of materials) {
    const codeKey = normalizeMaterialCodeKey(material.code);
    if (!codeKey) continue;
    const existing = byCode.get(codeKey);
    if (!existing || score(material) > score(existing)) {
      byCode.set(codeKey, material);
    }
  }

  return [...byCode.values()];
}

function warehouseExportLineDraftMergeKey(line: Pick<WarehouseSlipLineDraft, 'code' | 'unit'>) {
  return `${normalizeMaterialCodeKey(line.code)}|${String(line.unit || '').trim().toLowerCase()}`;
}

function sumWarehouseLineQtyText(left: string, right: string) {
  const total = (parsePercentInput(left) || 0) + (parsePercentInput(right) || 0);
  if (total <= 0) return '';
  const formatted = formatNumber(total, 3);
  return formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted;
}

/** Gộp dòng xuất NVL trùng mã + ĐVT trước khi lưu/in. */
function mergeWarehouseExportLineDrafts(lines: WarehouseSlipLineDraft[]): WarehouseSlipLineDraft[] {
  const map = new Map<string, WarehouseSlipLineDraft>();
  const order: string[] = [];

  for (const line of lines) {
    const code = line.code.trim();
    if (!code) {
      const emptyKey = `__empty__${line.key}`;
      map.set(emptyKey, line);
      order.push(emptyKey);
      continue;
    }
    const key = warehouseExportLineDraftMergeKey(line);
    const existing = map.get(key);
    if (existing) {
      existing.quantity = sumWarehouseLineQtyText(existing.quantity, line.quantity);
      existing.documentQuantity = sumWarehouseLineQtyText(existing.documentQuantity, line.documentQuantity);
      existing.quotaQuantity = sumWarehouseLineQtyText(existing.quotaQuantity || '', line.quotaQuantity || '');
      existing.suggestedQuantity = sumWarehouseLineQtyText(
        existing.suggestedQuantity || '',
        line.suggestedQuantity || ''
      );
      if (!existing.name && line.name) existing.name = line.name;
      if (line.lineNote) {
        existing.lineNote = existing.lineNote
          ? [...new Set([existing.lineNote, line.lineNote].filter(Boolean))].join('; ')
          : line.lineNote;
      }
    } else {
      map.set(key, { ...line });
      order.push(key);
    }
  }

  return order.map(key => map.get(key)!);
}

/**
 * Tiền tố trước hậu tố lô/serial — dùng để tra tên/ĐVT trong danh mục khi mã quét có hậu tố.
 * Tem thực tế dùng dấu "_" làm ranh giới (VD "MN-BB332_CXIxxxx" → "MN-BB332"); bản thân mã gốc
 * có thể chứa dấu "-" nên KHÔNG được tách theo "-", chỉ tách theo "_".
 */
function warehouseCodePrefix(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  const underscoreIdx = trimmed.indexOf('_');
  return underscoreIdx > 0 ? trimmed.slice(0, underscoreIdx).trim() : trimmed;
}

export function createWarehouseLineDraft(): WarehouseSlipLineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: '',
    name: '',
    unit: '',
    quantity: '',
    documentQuantity: '',
    unitPrice: '',
    sourceInboundLineId: '',
    sourceInboundSlipCode: '',
    damagedReportRowId: '',
    acceptanceReportRowId: '',
    actualWeightImageUrl: '',
    actualWeightImagePublicId: '',
    isScanned: false
  };
}

export function createWarehouseLineDraftFromPrefill(
  line: Pick<
    WarehouseSlipLineDraft,
    | 'code'
    | 'name'
    | 'unit'
    | 'quantity'
    | 'documentQuantity'
    | 'unitPrice'
    | 'quotaQuantity'
    | 'suggestedQuantity'
    | 'lineNote'
    | 'sourceInboundLineId'
    | 'sourceInboundSlipCode'
    | 'damagedReportRowId'
    | 'acceptanceReportRowId'
    | 'actualWeightImageUrl'
    | 'actualWeightImagePublicId'
    | 'isScanned'
  >
): WarehouseSlipLineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: line.code || '',
    name: line.name || '',
    unit: line.unit || '',
    quantity: line.quantity || '',
    documentQuantity: line.documentQuantity || line.suggestedQuantity || '',
    unitPrice: line.unitPrice || '',
    quotaQuantity: line.quotaQuantity || '',
    suggestedQuantity: line.suggestedQuantity || '',
    lineNote: line.lineNote || '',
    sourceInboundLineId: line.sourceInboundLineId || '',
    sourceInboundSlipCode: line.sourceInboundSlipCode || '',
    damagedReportRowId: line.damagedReportRowId || '',
    acceptanceReportRowId: line.acceptanceReportRowId || '',
    actualWeightImageUrl: line.actualWeightImageUrl || '',
    actualWeightImagePublicId: line.actualWeightImagePublicId || '',
    isScanned: line.isScanned === true
  };
}

const warehouseHistoryTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function formatWarehouseSlipSavedTime(value: string) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? warehouseHistoryTimeFormatter.format(date) : '—';
}

export function normalizeWarehouseMovements(data: unknown): WarehouseMovementRow[] {
  const list = data && typeof data === 'object' && Array.isArray((data as { movements?: unknown }).movements)
    ? (data as { movements: unknown[] }).movements
    : Array.isArray(data)
      ? data
      : [];

  return list
    .map((entry): WarehouseMovementRow | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const slipTypeRaw = String(record.loai_phieu ?? record.slipType ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const slipType: WarehouseSlipType =
        slipTypeRaw === 'xuat' ||
        slipTypeRaw === 'export' ||
        slipTypeRaw === 'out' ||
        slipTypeRaw.includes('xuat')
          ? 'xuat'
          : 'nhap';
      const maSp = String(record.ma_sp ?? record.productCode ?? '').trim();
      const maNpl = String(record.ma_npl ?? record.materialCode ?? '').trim();
      const tenSp = String(record.ten_sp ?? record.productName ?? '').trim();
      const tenNpl = String(record.ten_npl ?? record.materialName ?? '').trim();
      const warehouseKindRaw = String(record.loai_kho ?? record.warehouseKind ?? '').trim().toLowerCase();
      const warehouseName = String(record.ten_kho ?? record.warehouseName ?? '').trim();
      // Có mã SP (không có mã NPL) → thành phẩm, kể cả bản ghi cũ thiếu/sai loai_kho
      // Kho tái chế: loai_kho=tai_che hoặc tên kho chứa "tái chế"
      const warehouseKind: WarehouseKind =
        warehouseKindRaw === 'san_pham' || (Boolean(maSp) && !maNpl)
          ? 'san_pham'
          : warehouseKindRaw === 'hang_hong' ||
              warehouseKindRaw === 'hang-hong' ||
              warehouseKindRaw === 'damaged' ||
              isDamagedGoodsWarehouseName(warehouseName)
            ? 'hang_hong'
          : warehouseKindRaw === 'hang_hoa' || isGoodsWarehouseName(warehouseName)
            ? 'hang_hoa'
          : warehouseKindRaw === 'cong_cu_dung_cu' || isToolsWarehouseName(warehouseName)
            ? 'cong_cu_dung_cu'
          : warehouseKindRaw === 'gia_cong' || isProcessingWarehouseName(warehouseName)
            ? 'gia_cong'
          : warehouseKindRaw === 'tai_che' ||
              warehouseKindRaw === 'tai-che' ||
              warehouseKindRaw === 'recycle' ||
              isRecycleWarehouseName(warehouseName)
            ? 'tai_che'
            : 'nvl';
      const quantity = Number(record.so_luong ?? record.quantity);
      const documentQuantity = Number(record.so_luong_chung_tu ?? record.documentQuantity);
      const unitPrice = Number(record.don_gia ?? record.unitPrice ?? record.price ?? 0);
      const lineAmountRaw = Number(record.thanh_tien ?? record.lineAmount ?? record.amount);
      const lineAmount = Number.isFinite(lineAmountRaw)
        ? lineAmountRaw
        : Number.isFinite(quantity) && Number.isFinite(unitPrice)
          ? Math.round(quantity * unitPrice * 100) / 100
          : 0;
      const itemCode =
        warehouseKind === 'san_pham'
          ? maSp || String(record.itemCode ?? '').trim()
          : maNpl || String(record.itemCode ?? '').trim();
      const itemName =
        warehouseKind === 'san_pham'
          ? tenSp || String(record.itemName ?? '').trim()
          : tenNpl || String(record.itemName ?? '').trim();

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.ma_phieu ?? record.slipCode ?? '').trim(),
        status: String(record.status ?? '').trim() === 'chua_chot' ? 'chua_chot' : 'da_chot',
        slipType,
        warehouseKind,
        warehouseName,
        slipDate: String(record.ngay_phieu ?? record.slipDate ?? '').trim(),
        shift: String(record.ca ?? record.shift ?? record.ca_san_xuat ?? '').trim(),
        machine: String(record.may ?? record.ma_may ?? record.ten_may ?? record.machine ?? '').trim(),
        itemCode,
        itemName,
        unit: String(record.don_vi ?? record.unit ?? '').trim() || '-',
        quantity: Number.isFinite(quantity) ? quantity : 0,
        documentQuantity: Number.isFinite(documentQuantity) && documentQuantity > 0 ? documentQuantity : undefined,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lineAmount: Number.isFinite(lineAmount) ? lineAmount : 0,
        reason: String(record.ly_do ?? record.reason ?? '').trim(),
        note: String(record.ghi_chu ?? record.note ?? '').trim(),
        createdBy: String(record.nguoi_lap ?? record.nhan_su ?? record.createdBy ?? '').trim(),
        createdAt: String(record.created_at ?? record.createdAt ?? '').trim(),
        slipCreatedAt: String(record.created_at_phieu ?? record.slipCreatedAt ?? '').trim() || undefined,
        sourceInboundLineId: String(record.id_dong_nhap_nguon ?? record.sourceInboundLineId ?? '').trim() || undefined,
        sourceInboundSlipCode:
          String(record.ma_phieu_nhap_nguon ?? record.sourceInboundSlipCode ?? '').trim() || undefined,
        damagedReportRowId:
          String(record.id_bao_cao_hang_hong ?? record.damagedReportRowId ?? '').trim() || undefined,
        acceptanceReportRowId:
          String(record.id_bao_cao_nghiem_thu ?? record.acceptanceReportRowId ?? '').trim() || undefined,
        treo: record.treo === true,
        actualWeightImageUrl: String(record.link_anh_can_thuc_te ?? record.actualWeightImageUrl ?? '').trim() || undefined,
        daIn: record.da_in === true
      };
    })
    .filter((row): row is WarehouseMovementRow => Boolean(row.id || row.slipCode));
}

export function mapWarehouseMovementsForShiftSummary(rows: WarehouseMovementRow[]): ShiftSummaryWarehouseMovement[] {
  return rows.map(row => ({
    id: row.id,
    slipCode: row.slipCode,
    slipDate: row.slipDate,
    shift: row.shift,
    machine: row.machine || '',
    slipType: row.slipType,
    warehouseKind: row.warehouseKind,
    itemCode: row.itemCode,
    itemName: row.itemName,
    unit: row.unit,
    quantity: row.quantity,
    unitPrice: Number.isFinite(row.unitPrice) ? row.unitPrice : 0,
    createdBy: row.createdBy,
    reason: row.reason || '',
    note: row.note || ''
  }));
}

export type WarehouseProductionOrderOption = {
  id: string;
  orderCode: string;
  shift: string;
  machine: string;
  startDate: string;
  lines: Array<{ code: string; name: string; unit: string; quantity: number | null }>;
};

/** Chuẩn hóa ngày lệnh SX về YYYY-MM-DD (ưu tiên cột `ngay`, không cắt chuỗi datetime thô). */
export function resolveWarehouseProductionOrderDate(record: Record<string, unknown>): string {
  const candidates = [
    pickText(record, ['ngay', 'ngay_san_xuat'], ''),
    pickText(record, ['ngay_bat_dau'], ''),
    pickText(record, ['ngay_gio_bat_dau', 'start_date'], '')
  ];

  for (const raw of candidates) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;

    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      // Dùng UTC date cho chuỗi có offset Z/+00 — tránh lệch ngày local.
      if (/[zZ]|[+\-]\d{2}:\d{2}$/.test(trimmed)) {
        return parsed.toISOString().slice(0, 10);
      }
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return '';
}

function parseWarehouseProductionOrderLines(record: Record<string, unknown>) {
  let raw: unknown = record.san_pham ?? record.products;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested = (raw as { items?: unknown }).items ?? (raw as { products?: unknown }).products;
    if (Array.isArray(nested)) raw = nested;
  }

  const list = Array.isArray(raw) ? raw : [];
  const lines = list
    .map((item): { code: string; name: string; unit: string; quantity: number | null } | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = pickText(row, ['ma_sp', 'ma_hang', 'product_code', 'code'], '');
      const name = pickText(row, ['ten_sp', 'ten_hang', 'product_name', 'name'], '');
      if (!code && !name) return null;
      const quantity = Number(row.so_luong ?? row.quantity);
      return {
        code,
        name,
        unit: pickText(row, ['don_vi', 'unit'], ''),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null
      };
    })
    .filter((line): line is { code: string; name: string; unit: string; quantity: number | null } => Boolean(line));

  if (lines.length > 0) return lines;

  const code = pickText(record, ['ma_hang', 'ma_sp'], '');
  const name = pickText(record, ['ten_hang', 'ten_sp'], '');
  if (!code && !name) return [];
  const quantity = Number(record.so_luong);
  return [
    {
      code,
      name,
      unit: pickText(record, ['don_vi'], ''),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null
    }
  ];
}

export function normalizeWarehouseProductionOrders(data: unknown): WarehouseProductionOrderOption[] {
  if (!data || typeof data !== 'object') return [];
  const orders = (data as { productionOrders?: unknown }).productionOrders;
  if (!Array.isArray(orders)) return [];

  return orders
    .map((item): WarehouseProductionOrderOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const orderCode = pickText(record, ['ma_lenh_sx', 'code', 'so_lenh'], '');
      if (!orderCode) return null;
      return {
        id: String(record.id ?? '').trim() || orderCode,
        orderCode,
        shift: pickText(record, ['ca', 'shift'], ''),
        machine: pickText(record, ['may', 'ma_may', 'ten_may', 'machine'], ''),
        startDate: resolveWarehouseProductionOrderDate(record),
        lines: parseWarehouseProductionOrderLines(record)
      };
    })
    .filter((order): order is WarehouseProductionOrderOption => Boolean(order));
}

export function filterWarehouseProductionOrdersByDateShift(
  orders: WarehouseProductionOrderOption[],
  dateIso: string,
  shifts: string[]
) {
  const ngay = String(dateIso || '').trim().slice(0, 10);
  return orders.filter(order => {
    if (ngay && order.startDate && order.startDate !== ngay) return false;
    if (shifts.length === 0) return true;
    return shifts.some(
      shift => shiftNamesMatch(shift, order.shift) || shift === order.shift || !order.shift
    );
  });
}

function mergeWarehouseProductLinesFromOrders(orders: WarehouseProductionOrderOption[]) {
  const merged = new Map<string, { code: string; name: string; unit: string; quantity: number }>();
  for (const order of orders) {
    for (const line of order.lines) {
      const code = line.code.trim();
      if (!code) continue;
      const key = code.toLowerCase();
      const qty = Number(line.quantity);
      const existing = merged.get(key);
      if (existing) {
        if (Number.isFinite(qty) && qty > 0) existing.quantity += qty;
        if (!existing.name && line.name) existing.name = line.name;
        if (!existing.unit && line.unit) existing.unit = line.unit;
      } else {
        merged.set(key, {
          code,
          name: line.name || code,
          unit: line.unit || '',
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 0
        });
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

export function WarehouseSlipPanel({
  onBack,
  onOpenHistory,
  currentUser
}: {
  onBack: () => void;
  onOpenHistory: () => void;
  currentUser?: AuthUser | null;
}) {
  const loginName = String(currentUser?.name ?? '').trim();
  const [warehouseKind, setWarehouseKind] = useState<WarehouseKind>('nvl');
  const warehouseAccess = useWarehouseSlipAccess();
  const { canCreate, canEdit, canDelete } = pickWarehouseSlipAccess(warehouseAccess, warehouseKind);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [slipType, setSlipType] = useState<WarehouseSlipType>('nhap');
  const [newSlipCode, setNewSlipCode] = useState(() => generateWarehouseSlipPreviewCode(slipType));
  const [openProductSlips, setOpenProductSlips] = useState<OpenProductSlip[]>([]);
  const [selectedProductSlipCode, setSelectedProductSlipCode] = useState('');
  const [isLoadingProductSlips, setIsLoadingProductSlips] = useState(false);
  const [isDeletingProductSlip, setIsDeletingProductSlip] = useState(false);
  /** true = đang ở tab "Xuất kho treo" — form chờ nhận dữ liệu báo cáo hàng hỏng; bấm Lưu sẽ tạo phiếu xuất chính thức. */
  const [isXuatTreoMode, setIsXuatTreoMode] = useState(false);
  const [slipDate, setSlipDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [productionOrderCodes, setProductionOrderCodes] = useState<string[]>([]);
  const [productionOrderSearch, setProductionOrderSearch] = useState('');
  const [productionOrderPickerOpen, setProductionOrderPickerOpen] = useState(false);
  const [productionOrderMenuStyle, setProductionOrderMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const productionOrderTriggerRef = useRef<HTMLButtonElement>(null);
  const productionOrderPanelRef = useRef<HTMLDivElement>(null);
  const [machine, setMachine] = useState('');
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [deliverer, setDeliverer] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('HCM');
  const [lines, setLines] = useState<WarehouseSlipLineDraft[]>(() => [createWarehouseLineDraft()]);
  const [productLineView, setProductLineView] = useState<'detail' | 'summary'>('detail');
  const [productExportView, setProductExportView] = useState<'thuc-hien' | 'chi-tiet' | 'lap-phieu'>('thuc-hien');
  const [itemOptions, setItemOptions] = useState<MaterialOption[]>([]);
  const [weightCatalog, setWeightCatalog] = useState<WarehouseWeightCatalogItem[]>([]);
  const [avgInboundPriceByKey, setAvgInboundPriceByKey] = useState<Record<string, number>>({});
  const [avgPriceLoadingCode, setAvgPriceLoadingCode] = useState<string | null>(null);
  const avgPriceRequestSeqRef = useRef(0);
  const avgPriceAbortRef = useRef<AbortController | null>(null);

  const resolveAvgPriceMonthKey = (dateIso: string) => {
    const match = String(dateIso || '').trim().match(/^(\d{4})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;
    return new Date().toISOString().slice(0, 7);
  };

  const avgPriceCacheKey = (code: string, dateIso: string) =>
    `${code.trim()}|${resolveAvgPriceMonthKey(dateIso)}`;

  const formatAvgPriceMonthLabel = (dateIso: string) => {
    const [year, month] = resolveAvgPriceMonthKey(dateIso).split('-');
    return `${month}/${year}`;
  };
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [printSlip, setPrintSlip] = useState<WarehouseSlipPrintData | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printAutoTrigger, setPrintAutoTrigger] = useState(false);
  const [pendingQrLabels, setPendingQrLabels] = useState<ProductQrPrintLabel[]>([]);
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [qrPrintAutoTrigger, setQrPrintAutoTrigger] = useState(false);
  const [editSlipCode, setEditSlipCode] = useState<string | null>(null);
  const [uploadingLineImageKey, setUploadingLineImageKey] = useState<string | null>(null);
  const [viewingSlipImage, setViewingSlipImage] = useState<WeighingPreviewImage | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ReturnType<typeof normalizeShiftSettings>>([]);
  const [machineOptions, setMachineOptions] = useState<WarehouseMachineOption[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [productionOrders, setProductionOrders] = useState<WarehouseProductionOrderOption[]>([]);
  const [isAutofillingFromOrders, setIsAutofillingFromOrders] = useState(false);
  const [isAutofillingFromCanTuDong, setIsAutofillingFromCanTuDong] = useState(false);
  const [isLoadingProductionOrders, setIsLoadingProductionOrders] = useState(true);
  const [pendingDamagedReports, setPendingDamagedReports] = useState<PendingDamagedReport[]>([]);
  const [isLoadingDamagedReports, setIsLoadingDamagedReports] = useState(false);
  const [damagedReportsError, setDamagedReportsError] = useState('');
  const [reviewingDamagedReportKey, setReviewingDamagedReportKey] = useState('');
  const damagedReportsRequestSeqRef = useRef(0);

  const clearSavedPrint = () => {
    setPrintSlip(null);
    setPrintAutoTrigger(false);
    setPendingQrLabels([]);
  };

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const machineSelectOptions = useMemo<WarehouseMachineSelectOption[]>(() => {
    const options = machineOptions
      .map(machineOption => ({
        ...machineOption,
        label: [machineOption.code, machineOption.name].filter(Boolean).join(' - ')
      }))
      .sort((first, second) =>
        first.code.localeCompare(second.code, undefined, { numeric: true, sensitivity: 'base' })
      );
    const currentValue = machine.trim();
    if (
      currentValue &&
      !options.some(option =>
        [option.label, option.code, option.name].some(value => value.trim().toLowerCase() === currentValue.toLowerCase())
      )
    ) {
      options.unshift({ id: `current-${currentValue}`, code: '', name: currentValue, label: currentValue });
    }
    return options;
  }, [machine, machineOptions]);
  const selectedWarehouseName = warehouseName.trim();
  const showNvlShiftAndMachine = Boolean(selectedWarehouseName) && warehouseKind === 'nvl' && slipType === 'xuat';
  const showWarehouseShiftAndMachine =
    showNvlShiftAndMachine || (Boolean(selectedWarehouseName) && warehouseKind === 'san_pham' && slipType === 'nhap');
  const showFullWarehouseSlipFields = slipType === 'nhap' || warehouseKind === 'san_pham';
  const productionReportLoai: 'thanh_pham' | 'gia_cong' | 'sp_loi' | 'sp_rac' | null = !selectedWarehouseName
    ? null
    : isFinishedGoodsWarehouseName(warehouseName)
      ? 'thanh_pham'
      : isProcessingWarehouseName(warehouseName)
        ? 'gia_cong'
        : isDamagedGoodsWarehouseName(warehouseName)
          ? 'sp_loi'
          : isTrashWarehouseName(warehouseName)
            ? 'sp_rac'
            : null;
  const productionReportLoaiLabel =
    productionReportLoai === 'thanh_pham'
      ? 'Thành phẩm'
      : productionReportLoai === 'gia_cong'
        ? 'Gia công'
        : productionReportLoai === 'sp_loi'
          ? 'SP lỗi'
          : productionReportLoai === 'sp_rac'
            ? 'SP rác'
            : '';
  const showPendingProductionReports =
    Boolean(productionReportLoai) && slipType === 'nhap' && !isXuatTreoMode && !editSlipCode;

  useEffect(() => {
    if (editSlipCode) return;
    if (!loginName) return;
    setCreatedBy(prev => (prev.trim() ? prev : loginName));
  }, [editSlipCode, loginName]);

  const loadPendingDamagedReports = async () => {
    const requestSeq = ++damagedReportsRequestSeqRef.current;
    if (!productionReportLoai || !slipDate) {
      setPendingDamagedReports([]);
      setDamagedReportsError('');
      setIsLoadingDamagedReports(false);
      return;
    }
    setIsLoadingDamagedReports(true);
    setDamagedReportsError('');
    try {
      const params = new URLSearchParams({ loai: productionReportLoai, ngay: slipDate });
      const res = await fetch(`/api/bao-cao-san-luong/cho-nhap-kho?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
          throw new Error(readApiErrorMessage(res, data, 'Không thể tải báo cáo sản lượng chờ nhập kho.'));
      }
      if (requestSeq !== damagedReportsRequestSeqRef.current) return;
      setPendingDamagedReports(Array.isArray(data?.records) ? data.records : []);
    } catch (error: any) {
      if (requestSeq !== damagedReportsRequestSeqRef.current) return;
      setPendingDamagedReports([]);
      setDamagedReportsError(error?.message || 'Không thể tải báo cáo sản lượng chờ nhập kho.');
    } finally {
      if (requestSeq === damagedReportsRequestSeqRef.current) {
        setIsLoadingDamagedReports(false);
      }
    }
  };

  const handleReviewDamagedReport = (report: PendingDamagedReport) => {
    clearSavedPrint();
    setSlipType('nhap');
    setIsXuatTreoMode(false);
    // Giữ nguyên kho thủ kho đang chọn; chỉ suy lại loại kho cho chắc.
    setWarehouseKind(inferWarehouseKindFromName(warehouseName));
    setSlipDate(report.productionDate || report.reportDate || slipDate || new Date().toISOString().slice(0, 10));
    setSelectedShifts(report.shift ? [report.shift] : []);
    setReason(`Nhập kho từ báo cáo sản lượng ${report.documentNo}`);
    setNote([report.machine, report.note].filter(Boolean).join(' · '));
    setMachine(report.machine || '');
    setDeliverer(report.weigher || '');
    setLines(
      report.items.map(item => ({
        ...createWarehouseLineDraft(),
        code: item.code,
        name: item.name,
        unit: item.unit || (productionReportLoai === 'sp_loi' || productionReportLoai === 'sp_rac' ? 'kg' : ''),
        quantity: String(item.quantity),
        unitPrice: '',
        acceptanceReportRowId: item.reportRowId
      }))
    );
    setReviewingDamagedReportKey(report.key);
    setEditSlipCode(null);
    setFormError('');
    setActionMessage(
      `Đã nạp báo cáo ${report.documentNo}. Kiểm tra dữ liệu rồi bấm Lưu phiếu nhập kho.`
    );
    window.setTimeout(() => {
      document.querySelector('[data-warehouse-slip-form]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  useEffect(() => {
    if (!showPendingProductionReports || !slipDate) {
      damagedReportsRequestSeqRef.current += 1;
      setPendingDamagedReports([]);
      setDamagedReportsError('');
      setIsLoadingDamagedReports(false);
      return;
    }
    void loadPendingDamagedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPendingProductionReports, productionReportLoai, slipDate]);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/quan-ly-kho');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const records: Array<{ ten_kho?: string }> = Array.isArray(data?.records) ? data.records : [];
        setWarehouseOptions(
          Array.from(new Set(records.map(record => String(record.ten_kho ?? '').trim()).filter(Boolean))).sort((a, b) =>
            a.localeCompare(b, 'vi')
          )
        );
      } catch {
        setWarehouseOptions([]);
      }
    };
    void loadWarehouses();
  }, []);

  useEffect(() => {
    const loadProductionOrders = async () => {
      setIsLoadingProductionOrders(true);
      try {
        const res = await fetch('/api/lenh-sx');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error();
        setProductionOrders(normalizeWarehouseProductionOrders(data));
      } catch {
        setProductionOrders([]);
      } finally {
        setIsLoadingProductionOrders(false);
      }
    };
    void loadProductionOrders();
  }, []);

  useEffect(() => {
    const loadShiftSettings = async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setShiftSettings(normalizeShiftSettings(data));
        }
      } catch {
        setShiftSettings([]);
      }
    };
    void loadShiftSettings();
  }, []);

  useEffect(() => {
    const loadMachines = async () => {
      setIsLoadingMachines(true);
      try {
        const res = await fetch('/api/danh-sach-may');
        const data = await res.json().catch(() => ({}));
        const records = Array.isArray(data?.machines) ? data.machines : [];
        if (!res.ok) throw new Error();
        setMachineOptions(
          records
            .map((record: unknown, index: number) => {
              if (!record || typeof record !== 'object') return null;
              const source = record as Record<string, unknown>;
              const code = String(source.ma_may ?? source.code ?? '').trim();
              const name = String(source.ten_may ?? source.name ?? '').trim();
              if (!code && !name) return null;
              return { id: String(source.id ?? code ?? name ?? index), code, name };
            })
            .filter((item): item is WarehouseMachineOption => Boolean(item))
        );
      } catch {
        setMachineOptions([]);
      } finally {
        setIsLoadingMachines(false);
      }
    };
    void loadMachines();
  }, []);

  useEffect(() => {
    const rawDraft = localStorage.getItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<WarehouseSlipPrefillDraft>;
      if (!draft || !Array.isArray(draft.lines) || draft.lines.length === 0) return;
      if (!draft.createdAt || Date.now() - draft.createdAt > WAREHOUSE_SLIP_DRAFT_MAX_AGE_MS) return;
      const editingCode = String(draft.editSlipCode || '').trim();
      const draftSlipType = draft.slipType === 'nhap' ? 'nhap' : 'xuat';
      if (editingCode && draftSlipType === 'xuat') {
        setFormError('Phiếu xuất kho không thể sửa.');
        return;
      }

      const draftName = String(draft.warehouseName || '').trim();
      const draftKind: WarehouseKind =
        draft.warehouseKind === 'san_pham' ||
        draft.warehouseKind === 'tai_che' ||
        draft.warehouseKind === 'hang_hong' ||
        draft.warehouseKind === 'hang_hoa' ||
        draft.warehouseKind === 'cong_cu_dung_cu' ||
        draft.warehouseKind === 'gia_cong'
          ? draft.warehouseKind
          : draft.warehouseKind === 'nvl'
            ? 'nvl'
            : inferWarehouseKindFromName(draftName);
      const resolvedKind = draftName ? inferWarehouseKindFromName(draftName) : draftKind;
      const draftAccess = pickWarehouseSlipAccess(warehouseAccess, resolvedKind);
      if (!(editingCode ? draftAccess.canEdit : draftAccess.canCreate)) {
        setFormError(
          editingCode
            ? 'Bạn không có quyền sửa phiếu thuộc kho này.'
            : 'Bạn không có quyền lập phiếu thuộc kho này.'
        );
        return;
      }
      setWarehouseName(draftName);
      setWarehouseKind(resolvedKind);
      if (editingCode && draftSlipType === 'nhap' && resolvedKind === 'san_pham') {
        setProductExportView('lap-phieu');
        setProductLineView('summary');
      }
      clearSavedPrint();
      setSlipType(draftSlipType);
      setIsXuatTreoMode(false);
      if (draft.slipDate) setSlipDate(draft.slipDate);
      setReason(stripProductionOrderCodesFromReason(draft.reason || ''));
      setNote(draft.note || '');
      setCreatedBy(draft.createdBy?.trim() || loginName);
      {
        const fromRef = parseWarehouseProductionOrderSelection(draft.productionOrderRef);
        const fromText = extractLinkedProductionOrderCodes(draft.reason, draft.note);
        setProductionOrderCodes(fromRef.length > 0 ? fromRef : fromText);
      }
      setProductionOrderSearch('');
      setMachine(draft.machine || '');
      setSelectedShifts(parseWarehouseShiftSelection(draft.shift));
      setRecipient(draft.recipient || '');
      setDeliverer(draft.deliverer || draft.recipient || '');
      setWarehouseLocation(draft.warehouseLocation || 'HCM');
      const draftLines = draft.lines.map(createWarehouseLineDraftFromPrefill);
      setLines(draftSlipType === 'nhap' ? draftLines : sortWarehouseLinesKgFirst(draftLines));
      // Catalog Tổng kg có thể chưa kịp load — xếp lại theo khối lượng khi weightCatalog sẵn sàng.
      if (editingCode) {
        setEditSlipCode(editingCode);
        setActionMessage(`Đang sửa phiếu ${editingCode}. Chỉnh sửa và bấm cập nhật để lưu.`);
      } else {
        setActionMessage('Đã điền sẵn phiếu xuất kho từ hạch toán định mức NVL.');
      }
      setFormError('');
    } catch {
      setFormError('Không thể đọc dữ liệu phiếu xuất kho đã chuyển sang.');
    } finally {
      localStorage.removeItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY);
    }
  }, []);

  const reloadWarehouseCatalogRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const loadItems = async () => {
      setIsLoadingItems(true);
      try {
        // Kho hàng hóa cũng dùng danh mục sản phẩm làm mã chuẩn để QR sinh ra
        // luôn giữ đúng `san_pham.ma_sp` (không lấy mã biến thể từ kho NVL).
        if (warehouseKind === 'san_pham' || warehouseKind === 'hang_hoa') {
          const res = await fetch('/api/san-pham?format=table');
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
          const products = normalizeProducts(data);
          // Chỉ hiển thị sản phẩm đúng nhóm của kho đang chọn.
          const selectableProducts =
            warehouseKind === 'hang_hoa'
              ? products.filter(
                  product => isGoodsWarehouseName(product.warehouse) || isGoodsWarehouseName(product.nature)
                )
              : products.filter(
                  product =>
                    !isGoodsWarehouseName(product.warehouse) &&
                    (isFinishedGoodsWarehouseName(product.nature) ||
                      isFinishedGoodsWarehouseName(product.warehouse))
                );
          setItemOptions(
            selectableProducts.map(product => ({
              code: product.code,
              name: product.name,
              unit: product.unit && product.unit !== '-' ? product.unit : ''
            }))
          );
          setWeightCatalog(selectableProducts.map(mapProductToWeightCatalogItem));
        } else {
          const [khoRes, spRes] = await Promise.all([
            fetch('/api/kho-nvl'),
            fetch('/api/san-pham?format=table')
          ]);
          const data = await khoRes.json().catch(() => ({}));
          if (!khoRes.ok) throw new Error(data.error || 'Không thể tải kho NVL.');
          const materials = normalizeMaterialsInventory(data);

          // Mã trong kho_nvl đôi khi bị nhập thiếu dấu cách so với mã gốc bên danh mục sản
          // phẩm (VD "MT-MN043" vs "MT- MN043") — quy về đúng mã gốc để khớp giữa các kho.
          const productData = await spRes.json().catch(() => ({}));
          const products = spRes.ok ? normalizeProducts(productData) : [];
          const canonicalCodeByKey = new Map<string, string>();
          for (const product of products) {
            const key = normalizeMaterialCodeKey(product.code);
            if (key) canonicalCodeByKey.set(key, product.code);
          }

          // kho_nvl hiện có thể chưa được seed; khi đó dùng BOM sản phẩm để vẫn gợi ý mã NVL.
          const bomMaterials = products.flatMap(product =>
            product.nplItems.map(item => ({
              code: item.code,
              name: item.name || item.code,
              unit: item.unit || '-',
              warehouse: '',
              totalWeight: ''
            }))
          );
          const catalogMaterials = materials.length > 0 ? materials : bomMaterials;

          const selectedWarehouseKey = normalizeWarehouseNameKey(warehouseName);
          // Các kho vật tư gợi ý theo tên kho đã chọn trong Quản lý kho; NVL chưa được gán kho
          // (phần lớn danh mục hiện nay) vẫn hiển thị để không chặn việc chọn mã.
          const filteredMaterials = selectedWarehouseKey
            ? catalogMaterials.filter(material => {
                const materialWarehouseKey = normalizeWarehouseNameKey(
                  material.warehouse === '-' ? '' : material.warehouse
                );
                return !materialWarehouseKey || materialWarehouseKey === selectedWarehouseKey;
              })
            : catalogMaterials;
          const selectableMaterials = dedupeWarehouseSlipMaterials(filteredMaterials, warehouseName);
          setItemOptions(
            selectableMaterials.map(material => ({
              code: canonicalCodeByKey.get(normalizeMaterialCodeKey(material.code)) || material.code,
              name: material.name,
              unit: material.unit && material.unit !== '-' ? material.unit : ''
            }))
          );
          setWeightCatalog(selectableMaterials.map(mapMaterialToWeightCatalogItem));
        }
      } catch {
        setItemOptions([]);
        setWeightCatalog([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    reloadWarehouseCatalogRef.current = loadItems;
    void loadItems();
  }, [warehouseKind, warehouseName]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void reloadWarehouseCatalogRef.current?.();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const handleRefreshWeightCatalog = () => {
    void reloadWarehouseCatalogRef.current?.();
    showAppToast('Đã tải lại Tổng kg từ kho NVL — cột Quy đổi kg cập nhật theo dữ liệu mới.');
  };

  const handleWarehouseNameChange = (name: string) => {
    const nextName = name.trim();
    const nextKind = nextName ? inferWarehouseKindFromName(nextName) : warehouseKind;
    const kindChanged = nextKind !== warehouseKind;
    setWarehouseName(nextName);
    if (kindChanged) {
      setWarehouseKind(nextKind);
      setLines([createWarehouseLineDraft()]);
      setAvgInboundPriceByKey({});
    }
    const showShiftAndMachineForNextWarehouse =
      Boolean(nextName) &&
      ((nextKind === 'nvl' && slipType === 'xuat') || (nextKind === 'san_pham' && slipType === 'nhap'));
    if (!showShiftAndMachineForNextWarehouse) {
      setSelectedShifts([]);
      setMachine('');
    }
    setFormError('');
    setActionMessage('');
  };

  const warehouseSelectOptions = useMemo(() => {
    // Chỉ gợi ý những kho người dùng có quyền lập phiếu (Vật tư / Thành phẩm đúng người phụ trách).
    const names = warehouseOptions.filter(
      name => {
        const access = pickWarehouseSlipAccess(warehouseAccess, inferWarehouseKindFromName(name));
        return editSlipCode ? access.canEdit : access.canCreate;
      }
    );
    return names;
  }, [
    warehouseOptions,
    editSlipCode,
    warehouseAccess.vatTu.canCreate,
    warehouseAccess.vatTu.canEdit,
    warehouseAccess.thanhPham.canCreate,
    warehouseAccess.thanhPham.canEdit
  ]);

  const updateLine = (key: string, patch: Partial<WarehouseSlipLineDraft>) => {
    setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const formatSuggestedUnitPrice = (avg: number) =>
    avg > 0 ? sanitizeMoneyInput(String(Math.round(avg))) : '';

  const loadNvlAvgInboundPrice = async (
    code: string,
    dateIso: string,
    options?: { lineKey?: string; applySuggestion?: boolean; forceOverwrite?: boolean }
  ) => {
    const materialCode = code.trim();
    if (!materialCode) return 0;
    const cacheKey = avgPriceCacheKey(materialCode, dateIso);
    const lineKey = options?.lineKey;
    const applySuggestion = options?.applySuggestion ?? Boolean(lineKey);
    const forceOverwrite = options?.forceOverwrite ?? Boolean(lineKey);
    const requestSeq = ++avgPriceRequestSeqRef.current;

    avgPriceAbortRef.current?.abort();
    const abortController = new AbortController();
    avgPriceAbortRef.current = abortController;

    setAvgPriceLoadingCode(materialCode);
    try {
      const params = new URLSearchParams({
        ma_npl: materialCode,
        ngay: String(dateIso || new Date().toISOString().slice(0, 10)).slice(0, 10)
      });
      const res = await fetch(`/api/phieu-xuat-nhap-kho/gia-tb-nhap?${params.toString()}`, {
        signal: abortController.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể tải giá nhập trung bình.');
      if (requestSeq !== avgPriceRequestSeqRef.current) return 0;

      const donGia = Number(data.don_gia);
      const avg = Number.isFinite(donGia) && donGia > 0 ? donGia : 0;
      const priceText = formatSuggestedUnitPrice(avg);
      setAvgInboundPriceByKey(current => ({ ...current, [cacheKey]: avg }));
      if (applySuggestion && priceText) {
        setLines(current =>
          current.map(line => {
            if (lineKey) {
              if (line.key !== lineKey) return line;
              if (!forceOverwrite && line.unitPrice.trim()) return line;
              return { ...line, unitPrice: priceText };
            }
            if (line.code.trim() !== materialCode) return line;
            if (!forceOverwrite && line.unitPrice.trim()) return line;
            return { ...line, unitPrice: priceText };
          })
        );
      }
      return avg;
    } catch (error: any) {
      if (error?.name === 'AbortError') return 0;
      setAvgInboundPriceByKey(current => ({ ...current, [cacheKey]: 0 }));
      // Không chặn form bằng lỗi gợi ý giá — chỉ báo nhẹ qua console.
      console.warn('[gia-tb-nhap]', error?.message || error);
      return 0;
    } finally {
      setAvgPriceLoadingCode(current => (current === materialCode ? null : current));
    }
  };

  /**
   * Mã có thể mang hậu tố lô/serial (quét QR, VD "L30cm_3701190208G") không khớp đúng danh mục
   * — tra tên/ĐVT theo tiền tố trước "_", nhưng vẫn lưu nguyên mã đầy đủ vào dòng phiếu.
   */
  const resolveLinePatchForCode = (fullCode: string) => {
    const prefixKey = normalizeMaterialCodeKey(warehouseCodePrefix(fullCode));
    const item = itemOptions.find(option => normalizeMaterialCodeKey(option.code) === prefixKey);
    // Mã quét mang hậu tố lô/serial chỉ dùng để tra danh mục và chống trùng khi quét — dòng
    // phiếu (ô Mã NPL/SP) chỉ lưu đúng mã gốc/tiền tố, không mang hậu tố.
    const canonicalCode = item?.code || warehouseCodePrefix(fullCode);
    const isExportNvl = (warehouseKind === 'nvl' || warehouseKind === 'tai_che') && slipType === 'xuat';
    const cachedAvg =
      isExportNvl && canonicalCode ? avgInboundPriceByKey[avgPriceCacheKey(canonicalCode, slipDate)] : undefined;
    const immediatePrice =
      typeof cachedAvg === 'number' && cachedAvg > 0 ? formatSuggestedUnitPrice(cachedAvg) : '';

    return {
      code: canonicalCode,
      name: item?.name || '',
      unit: item?.unit || '',
      ...(isExportNvl
        ? {
            sourceInboundLineId: '',
            sourceInboundSlipCode: '',
            // Điền cache ngay (nếu có); trống thì chờ API — không để trống sau khi đã có BQ.
            unitPrice: immediatePrice
          }
        : {})
    };
  };

  const pickItem = (key: string, code: string) => {
    const materialCode = code.trim();
    const isExportNvl = (warehouseKind === 'nvl' || warehouseKind === 'tai_che') && slipType === 'xuat';
    updateLine(key, resolveLinePatchForCode(materialCode));
    if (isExportNvl && materialCode) {
      void loadNvlAvgInboundPrice(materialCode, slipDate, {
        lineKey: key,
        applySuggestion: true,
        forceOverwrite: true
      });
    }
  };

  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'hardware-v2' | 'camera'>('camera');
  // Theo dõi `lines` bằng ref để quét liên tiếp (nhiều mã trong 1 nhịp camera) không bị đọc dữ
  // liệu cũ khi state React chưa kịp render lại giữa hai lần quét.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // Giữ mã QR đầy đủ trong phiếu nháp và chặn quét trùng tuyệt đối.
  const scannedFullCodesByPrefixRef = useRef<Map<string, Map<string, string>>>(new Map());
  const [scannedSavedAtByCode, setScannedSavedAtByCode] = useState<Record<string, string>>({});
  const [savedProductScanRows, setSavedProductScanRows] = useState<SavedProductScanRow[] | null>(null);
  const [savedProductScanTotal, setSavedProductScanTotal] = useState(0);
  const [isLoadingExistingProductScans, setIsLoadingExistingProductScans] = useState(false);
  const [savedProductScanPage, setSavedProductScanPage] = useState(1);
  const [savedProductScanPageSize, setSavedProductScanPageSize] = useState(50);
  const [loadingSavedProductScans, setLoadingSavedProductScans] = useState(false);
  const [savedProductScanError, setSavedProductScanError] = useState('');
  const [savedProductSummary, setSavedProductSummary] = useState<SavedProductSummaryRow[]>([]);
  const [loadingProductSummary, setLoadingProductSummary] = useState(false);
  const [productSummaryError, setProductSummaryError] = useState('');
  const [savedProductBatchCodes, setSavedProductBatchCodes] = useState<Set<string>>(() => new Set());
  const isEditingProductInbound = Boolean(editSlipCode) && warehouseKind === 'san_pham' && slipType === 'nhap';
  const scannedProductDetails = lines.flatMap(line => {
    const prefixKey = normalizeMaterialCodeKey(line.code);
    const codes = scannedFullCodesByPrefixRef.current.get(prefixKey);
    if (codes?.size) {
      return [...codes.values()].map(fullCode => ({
        key: `${prefixKey}:${fullCode}`,
        baseCode: warehouseCodePrefix(fullCode),
        fullCode,
        name: line.name,
        unit: line.unit,
        savedAt: scannedSavedAtByCode[fullCode] || '',
        quantity: '1'
      })).filter(detail => !isEditingProductInbound || !savedProductBatchCodes.has(normalizeMaterialCodeKey(detail.fullCode)));
    }
    return !isEditingProductInbound && line.code.trim()
      ? [{ key: line.key, baseCode: line.code, fullCode: line.code, name: line.name, unit: line.unit, savedAt: scannedSavedAtByCode[line.code] || '', quantity: line.quantity }]
      : [];
  });
  const pendingScannedProductDetails = scannedProductDetails.filter(
    detail => !savedProductBatchCodes.has(normalizeMaterialCodeKey(detail.fullCode))
  );
  const khoScanMaPhieuRef = useRef<string>('');
  const khoScanQueueRef = useRef<Promise<void>>(Promise.resolve());

  const ensureKhoScanMaPhieu = () => {
    const editing = String(editSlipCode || '').trim();
    if (editing) {
      khoScanMaPhieuRef.current = editing;
      return editing;
    }
    if (!khoScanMaPhieuRef.current) khoScanMaPhieuRef.current = newSlipCode || generateWarehouseSlipPreviewCode(slipType);
    return khoScanMaPhieuRef.current;
  };

  const createNewProductSlip = useCallback(() => {
    const code = generateWarehouseSlipPreviewCode(slipType);
    setProductExportView('thuc-hien');
    setSelectedProductSlipCode('');
    setNewSlipCode(code);
    khoScanMaPhieuRef.current = '';
    scannedFullCodesByPrefixRef.current.clear();
    setSavedProductBatchCodes(new Set());
    setScannedSavedAtByCode({});
    setSavedProductScanRows(null);
    setSavedProductScanTotal(0);
    const emptyLines = [createWarehouseLineDraft()];
    linesRef.current = emptyLines;
    setLines(emptyLines);
    setSlipDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setCreatedBy(loginName);
    setActionMessage('');
    setFormError('');
  }, [loginName, slipType]);

  const loadOpenProductSlip = useCallback(async (slip: OpenProductSlip) => {
    const slipCode = String(slip.ma_phieu || '').trim();
    const records: SavedProductScanRow[] = [];
    for (let offset = 0; ; offset += 100) {
      const params = new URLSearchParams({
        loai_phieu: slipType,
        ma_phieu: slipCode,
        limit: '100',
        offset: String(offset)
      });
      const response = await fetch(`/api/kho/chi-tiet?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiErrorMessage(response, data, 'Không tải được mã đã lưu của phiếu.'));
      const page = Array.isArray(data?.records) ? data.records as SavedProductScanRow[] : [];
      records.push(...page);
      if (offset + page.length >= (Number(data?.total) || 0) || !page.length) break;
    }

    const grouped = new Map<string, WarehouseSlipLineDraft>();
    const codesByPrefix = new Map<string, Map<string, string>>();
    const savedAtByCode: Record<string, string> = {};
    for (const row of records) {
      const fullCode = String(row.ma_sp_quet || row.ma_sp || '').trim();
      const baseCode = warehouseCodePrefix(String(row.ma_sp || fullCode));
      const prefixKey = normalizeMaterialCodeKey(baseCode);
      if (!fullCode || !prefixKey) continue;
      const fullCodeKey = normalizeMaterialCodeKey(fullCode);
      let codes = codesByPrefix.get(prefixKey);
      if (!codes) codesByPrefix.set(prefixKey, (codes = new Map()));
      codes.set(fullCodeKey, fullCode);
      savedAtByCode[fullCode] = String(row.created_at || new Date().toISOString());
      const item = itemOptions.find(option => normalizeMaterialCodeKey(option.code) === prefixKey);
      const line = grouped.get(prefixKey);
      if (line) line.quantity = String((Number(line.quantity) || 0) + (Number(row.so_luong) || 1));
      else {
        grouped.set(prefixKey, {
          ...createWarehouseLineDraft(),
          code: baseCode,
          name: String(row.ten_sp || item?.name || ''),
          unit: item?.unit || '',
          quantity: String(Number(row.so_luong) || 1),
          isScanned: true
        });
      }
    }

    scannedFullCodesByPrefixRef.current.clear();
    codesByPrefix.forEach((codes, key) => scannedFullCodesByPrefixRef.current.set(key, codes));
    const loadedLines = [...grouped.values()];
    const nextLines = loadedLines.length ? loadedLines : [createWarehouseLineDraft()];
    linesRef.current = nextLines;
    setLines(nextLines);
    setSavedProductBatchCodes(new Set([...codesByPrefix.values()].flatMap(codes => [...codes.values()]).map(normalizeMaterialCodeKey)));
    setScannedSavedAtByCode(savedAtByCode);
    setSavedProductScanRows(null);
    setSavedProductScanTotal(0);
    setProductExportView('lap-phieu');
    setSelectedProductSlipCode(slipCode);
    setNewSlipCode(slipCode);
    khoScanMaPhieuRef.current = slipCode;
    setSlipDate(String(slip.ngay || new Date().toISOString().slice(0, 10)).slice(0, 10));
    setCreatedBy(String(slip.nhan_su || loginName));
    setNote(String(slip.ghi_chu || ''));
    setActionMessage('');
    setFormError('');
  }, [itemOptions, loginName, slipType]);

  const handleProductSlipSelection = (code: string) => {
    if (code === selectedProductSlipCode) return;
    if (pendingScannedProductDetails.length && !window.confirm('Các mã mới quét chưa lưu đợt. Đổi phiếu sẽ xóa chúng khỏi danh sách hiện tại. Tiếp tục?')) return;
    if (!code) {
      createNewProductSlip();
      return;
    }
    const selected = openProductSlips.find(slip => slip.ma_phieu === code);
    if (!selected) return;
    setIsLoadingProductSlips(true);
    void loadOpenProductSlip(selected)
      .catch((error: any) => setFormError(showSaveFailure(error, 'Không tải được phiếu chưa chốt.')))
      .finally(() => setIsLoadingProductSlips(false));
  };

  const handleDeleteSelectedProductSlip = async () => {
    const slipCode = selectedProductSlipCode.trim();
    const slip = openProductSlips.find(item => item.ma_phieu === slipCode);
    if (!slipCode || slip?.status !== 'chua_chot' || !canDelete) return;
    if (!window.confirm(`Xóa phiếu tạm ${slipCode} cùng toàn bộ mã QR đã lưu và thông tin liên quan? Các mã đang quét chưa lưu cũng sẽ bị xóa khỏi màn hình. Thao tác này không thể hoàn tác.`)) return;

    setIsDeletingProductSlip(true);
    setFormError('');
    try {
      const response = await fetch(`/api/kho/phieu/${encodeURIComponent(slipCode)}?draft=true`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiErrorMessage(response, data, 'Không thể xóa phiếu tạm.'));

      setOpenProductSlips(current => current.filter(item => item.ma_phieu !== slipCode));
      createNewProductSlip();
      setReason('');
      setProductionOrderCodes([]);
      setMachine('');
      setSelectedShifts([]);
      setRecipient('');
      setDeliverer('');
      setWarehouseLocation('HCM');
      setProductExportView('lap-phieu');
      showAppToast(`Đã xóa phiếu tạm ${slipCode}.`, 'success');
    } catch (error: any) {
      setFormError(showSaveFailure(error, 'Không thể xóa phiếu tạm.'));
    } finally {
      setIsDeletingProductSlip(false);
    }
  };

  /**
   * Xếp hàng tuần tự POST /api/kho/quet — UI không await.
   * Mỗi job chờ job trước xong (kể cả lỗi) rồi mới gửi, tránh race tồn `kho`.
   */
  const syncScanToKhoDb = (payload: {
    fullCode: string;
    name: string;
    unit: string;
    maPhieu: string;
    loaiPhieu: 'nhap' | 'xuat';
    loai: string;
    nhanSu: string;
    ngay: string;
  }) => {
    khoScanQueueRef.current = khoScanQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const res = await fetch('/api/kho/quet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              loai_phieu: payload.loaiPhieu,
              ma_sp: payload.fullCode,
              ma_phieu: payload.maPhieu || khoScanMaPhieuRef.current,
              loai: payload.loai,
              ten_sp: payload.name || '',
              don_vi: payload.unit || '',
              nhan_su: payload.nhanSu,
              ngay: payload.ngay,
              so_luong: 1
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            console.warn('[kho/quet]', data?.error || res.statusText);
            return;
          }
          if (data?.ma_phieu) {
            khoScanMaPhieuRef.current = String(data.ma_phieu);
          }
          if (data?.line?.created_at) {
            setScannedSavedAtByCode(current => ({ ...current, [payload.fullCode]: String(data.line.created_at) }));
          }
        } catch (err: any) {
          console.warn('[kho/quet]', err?.message || err);
        }
      });
  };

  /**
   * Nhập kho và Xuất kho là hai phiếu độc lập. Không giữ các dòng của form
   * trước khi người dùng đổi loại phiếu, vì điều này làm NVL vừa tự điền cho
   * phiếu xuất xuất hiện nhầm trong phiếu nhập (và ngược lại).
   */
  const handleSlipModeChange = (nextSlipType: WarehouseSlipType, nextIsXuatTreoMode: boolean) => {
    const modeChanged = slipType !== nextSlipType || isXuatTreoMode !== nextIsXuatTreoMode;
    if (!modeChanged) return;

    clearSavedPrint();
    setSlipType(nextSlipType);
    setIsXuatTreoMode(nextIsXuatTreoMode);
    setProductExportView('thuc-hien');
    if (!editSlipCode) {
      const nextSlipCode = generateWarehouseSlipPreviewCode(nextSlipType);
      setNewSlipCode(nextSlipCode);
      khoScanMaPhieuRef.current = nextSlipCode;
    }
    setReason('');
    setNote('');
    setProductionOrderCodes([]);
    setProductionOrderSearch('');
    setProductionOrderPickerOpen(false);
    setMachine('');
    setSelectedShifts([]);
    setRecipient('');
    setDeliverer('');
    setAvgInboundPriceByKey({});
    setFormError('');
    setActionMessage('');
    const emptyLines = [createWarehouseLineDraft()];
    linesRef.current = emptyLines;
    setLines(emptyLines);
    scannedFullCodesByPrefixRef.current.clear();
    setSavedProductBatchCodes(new Set());
    setScannedSavedAtByCode({});
  };

  // Tổng SL trên modal: tổng số lượng đã quét trong phiên — mã cùng gốc khác hậu tố lô/serial
  // cộng dồn vào 1 dòng nên đếm theo SL từng dòng, không phải số dòng.
  const scannedItemCount = isEditingProductInbound
    ? scannedProductDetails.length
    : lines.reduce((total, line) => {
        if (!line.isScanned || !line.code.trim()) return total;
        const qty = parsePercentInput(line.quantity);
        return total + (Number.isFinite(qty) && qty > 0 ? qty : 1);
      }, 0);

  /** Quét chỉ cập nhật phiếu nháp; mã QR sẽ được ghi vào DB kho khi bấm Lưu đợt. */
  const addLineFromScan = async (raw: string): Promise<boolean | 'duplicate'> => {
    if (editSlipCode && warehouseKind === 'san_pham' && slipType === 'nhap' && isLoadingExistingProductScans) {
      setFormError('Đang tải mã QR cũ của phiếu, vui lòng đợi rồi quét tiếp.');
      return false;
    }
    const fullCode = String(raw ?? '').trim();
    if (!fullCode) return false;
    const current = linesRef.current;
    const prefix = warehouseCodePrefix(fullCode);
    const prefixKey = normalizeMaterialCodeKey(prefix);
    const fullCodeKey = normalizeMaterialCodeKey(fullCode);

    const scannedForPrefix = scannedFullCodesByPrefixRef.current.get(prefixKey);
    if (scannedForPrefix?.has(fullCodeKey)) {
      return 'duplicate';
    }

    const patch = { ...resolveLinePatchForCode(fullCode), quantity: '1', isScanned: true };
    if (scannedForPrefix) {
      scannedForPrefix.set(fullCodeKey, fullCode);
    } else {
      scannedFullCodesByPrefixRef.current.set(prefixKey, new Map([[fullCodeKey, fullCode]]));
    }

    const canonicalCodeKey = normalizeMaterialCodeKey(patch.code);
    const existingIndex = canonicalCodeKey
      ? current.findIndex(line => line.code.trim() && normalizeMaterialCodeKey(line.code) === canonicalCodeKey)
      : -1;
    const draft = createWarehouseLineDraft();
    const emptyIndex = current.findIndex(line => !line.code.trim());
    let targetKey: string;
    let nextLines: WarehouseSlipLineDraft[];
    if (existingIndex >= 0) {
      targetKey = current[existingIndex].key;
      nextLines = current.map((line, idx) => {
        if (idx !== existingIndex) return line;
        const nextQuantity = (parsePercentInput(line.quantity) || 0) + 1;
        return { ...line, ...patch, quantity: String(nextQuantity), isScanned: true };
      });
    } else if (emptyIndex >= 0) {
      targetKey = current[emptyIndex].key;
      nextLines = current.map((line, idx) => (idx === emptyIndex ? { ...line, ...patch } : line));
    } else {
      targetKey = draft.key;
      nextLines = [...current, { ...draft, ...patch }];
    }
    linesRef.current = nextLines;
    setLines(nextLines);
    setFormError('');

    if (warehouseKind !== 'san_pham') {
      syncScanToKhoDb({
        fullCode,
        name: patch.name || '',
        unit: patch.unit || '',
        maPhieu: ensureKhoScanMaPhieu(),
        loaiPhieu: slipType === 'xuat' ? 'xuat' : 'nhap',
        loai: warehouseKind,
        nhanSu: createdBy.trim() || loginName,
        ngay: slipDate
      });
    }

    if ((warehouseKind === 'nvl' || warehouseKind === 'tai_che') && slipType === 'xuat') {
      void loadNvlAvgInboundPrice(patch.code, slipDate, {
        lineKey: targetKey,
        applySuggestion: true,
        forceOverwrite: true
      });
    }
    return true;
  };

  const removeScannedProduct = async (fullCode: string) => {
    const prefixKey = normalizeMaterialCodeKey(warehouseCodePrefix(fullCode));
    const codes = scannedFullCodesByPrefixRef.current.get(prefixKey);
    if (!codes) return;
    const fullCodeKey = normalizeMaterialCodeKey(fullCode);
    if (!codes.has(fullCodeKey)) return;

    if (scannedSavedAtByCode[fullCode]) {
      setIsSaving(true);
      try {
        const params = new URLSearchParams({ loai_phieu: slipType, ma_phieu: ensureKhoScanMaPhieu(), ma_sp_quet: fullCode });
        const res = await fetch(`/api/kho/chi-tiet?${params.toString()}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readApiErrorMessage(res, data, `Không thể xóa mã ${fullCode} khỏi đợt.`));
      } catch (error: any) {
        setFormError(showSaveFailure(error, 'Không thể xóa mã khỏi đợt.'));
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }

    codes.delete(fullCodeKey);
    if (!codes.size) scannedFullCodesByPrefixRef.current.delete(prefixKey);
    setScannedSavedAtByCode(current => {
      const next = { ...current };
      delete next[fullCode];
      return next;
    });

    const current = linesRef.current;
    const lineIndex = current.findIndex(line => normalizeMaterialCodeKey(line.code) === prefixKey && line.isScanned);
    if (lineIndex < 0) return;
    const line = current[lineIndex];
    const quantity = parsePercentInput(line.quantity) || 0;
    const nextLines = quantity > 1
      ? current.map((item, index) => index === lineIndex ? { ...item, quantity: String(quantity - 1) } : item)
      : current.filter((_, index) => index !== lineIndex);
    const withBlankLine = nextLines.length ? nextLines : [createWarehouseLineDraft()];
    linesRef.current = withBlankLine;
    setLines(withBlankLine);
  };

  const isMaterialWarehouse = warehouseKind === 'nvl' || warehouseKind === 'tai_che';
  const isNvlExport = isMaterialWarehouse && slipType === 'xuat';
  const isNvlInbound = isMaterialWarehouse && slipType === 'nhap';
  // Phiếu xuất kho NVL dùng lệnh SX để tự lập các dòng theo định mức BOM.
  // Các loại phiếu xuất khác không có luồng này.
  const showOrderFields = isNvlExport;
  const showProductExportTabs = warehouseKind === 'san_pham' && !isXuatTreoMode;
  const productDetailSlipCode = String(editSlipCode || newSlipCode || '').trim();

  useEffect(() => {
    if (!isEditingProductInbound || !editSlipCode) {
      setIsLoadingExistingProductScans(false);
      return;
    }
    let cancelled = false;
    const loadExistingScans = async () => {
      setIsLoadingExistingProductScans(true);
      setSavedProductBatchCodes(new Set());
      setScannedSavedAtByCode({});
      scannedFullCodesByPrefixRef.current.clear();
      try {
        const records: SavedProductScanRow[] = [];
        for (let offset = 0; ; offset += 100) {
          const params = new URLSearchParams({
            loai_phieu: 'nhap',
            ma_phieu: editSlipCode,
            limit: '100',
            offset: String(offset)
          });
          const response = await fetch(`/api/kho/chi-tiet?${params.toString()}`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(readApiErrorMessage(response, data, 'Không tải được mã QR đã quét.'));
          const page = Array.isArray(data?.records) ? data.records as SavedProductScanRow[] : [];
          records.push(...page);
          if (offset + page.length >= (Number(data?.total) || 0) || !page.length) break;
        }

        if (cancelled) return;
        const codesByPrefix = new Map<string, Map<string, string>>();
        const savedAtByCode: Record<string, string> = {};
        for (const row of records) {
          const fullCode = String(row.ma_sp_quet || row.ma_sp || '').trim();
          const prefixKey = normalizeMaterialCodeKey(warehouseCodePrefix(String(row.ma_sp || fullCode)));
          const fullCodeKey = normalizeMaterialCodeKey(fullCode);
          if (!fullCode || !prefixKey || !fullCodeKey) continue;
          let codes = codesByPrefix.get(prefixKey);
          if (!codes) codesByPrefix.set(prefixKey, (codes = new Map()));
          codes.set(fullCodeKey, fullCode);
          savedAtByCode[fullCode] = String(row.created_at || '');
        }
        scannedFullCodesByPrefixRef.current = codesByPrefix;
        setSavedProductBatchCodes(new Set([...codesByPrefix.values()].flatMap(codes => [...codes.keys()])));
        setScannedSavedAtByCode(savedAtByCode);
      } catch (error: unknown) {
        if (!cancelled) setFormError(error instanceof Error ? error.message : 'Không tải được mã QR đã quét.');
      } finally {
        if (!cancelled) setIsLoadingExistingProductScans(false);
      }
    };
    void loadExistingScans();
    return () => { cancelled = true; };
  }, [isEditingProductInbound, editSlipCode]);

  useEffect(() => {
    if (!showProductExportTabs || !warehouseName || editSlipCode) return;
    let cancelled = false;
    const loadOpenSlips = async () => {
      setIsLoadingProductSlips(true);
      const params = new URLSearchParams({ loai_phieu: slipType, kho: warehouseName });
      try {
        const response = await fetch(`/api/kho/phieu?${params.toString()}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(readApiErrorMessage(response, data, 'Không tải được phiếu chưa chốt.'));
        if (cancelled) return;
        const slips = Array.isArray(data?.records) ? data.records as OpenProductSlip[] : [];
        setOpenProductSlips(slips);
        if (slips[0]) await loadOpenProductSlip(slips[0]);
        else createNewProductSlip();
      } catch (error: any) {
        if (cancelled) return;
        setOpenProductSlips([]);
        createNewProductSlip();
        setFormError(showSaveFailure(error, 'Không tải được phiếu chưa chốt.'));
      } finally {
        if (!cancelled) setIsLoadingProductSlips(false);
      }
    };
    void loadOpenSlips();
    return () => { cancelled = true; };
  }, [showProductExportTabs, warehouseName, slipType, editSlipCode, loadOpenProductSlip, createNewProductSlip]);

  useEffect(() => {
    setSavedProductScanPage(1);
  }, [productDetailSlipCode]);

  useEffect(() => {
    if (!showProductExportTabs || productExportView !== 'chi-tiet' || !productDetailSlipCode) return;
    let cancelled = false;
    const offset = (savedProductScanPage - 1) * savedProductScanPageSize;
    setLoadingSavedProductScans(true);
    setSavedProductScanError('');
    setSavedProductScanRows(null);
    setSavedProductScanTotal(0);
    fetch(`/api/kho/chi-tiet?loai_phieu=${slipType}&ma_phieu=${encodeURIComponent(productDetailSlipCode)}&limit=${savedProductScanPageSize}&offset=${offset}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Không tải được chi tiết phiếu.');
        if (cancelled) return;
        setSavedProductScanRows(Array.isArray(data?.records) ? data.records : []);
        setSavedProductScanTotal(Number(data?.total) || 0);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setSavedProductScanRows(null);
        setSavedProductScanTotal(0);
        setSavedProductScanError(err?.message || 'Không tải được chi tiết phiếu.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSavedProductScans(false);
      });
    return () => { cancelled = true; };
  }, [showProductExportTabs, productExportView, slipType, productDetailSlipCode, savedProductScanPage, savedProductScanPageSize, scannedSavedAtByCode]);

  useEffect(() => {
    if (!showProductExportTabs || productExportView !== 'lap-phieu' || !productDetailSlipCode || isEditingProductInbound) return;
    let cancelled = false;
    setLoadingProductSummary(true);
    setProductSummaryError('');
    setLines([]);
    fetch(`/api/kho/chi-tiet?loai_phieu=${slipType}&ma_phieu=${encodeURIComponent(productDetailSlipCode)}&summary=true`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Không tải được danh sách tổng hợp sản phẩm.');
        if (!cancelled) setSavedProductSummary(Array.isArray(data?.records) ? data.records : []);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setSavedProductSummary([]);
        setProductSummaryError(err?.message || 'Không tải được danh sách tổng hợp sản phẩm.');
      })
      .finally(() => { if (!cancelled) setLoadingProductSummary(false); });
    return () => { cancelled = true; };
  }, [showProductExportTabs, productExportView, slipType, productDetailSlipCode, scannedSavedAtByCode, isEditingProductInbound]);

  useEffect(() => {
    if (!showProductExportTabs || productExportView !== 'lap-phieu' || isEditingProductInbound || loadingProductSummary || productSummaryError) return;
    setLines(savedProductSummary.map(row => {
      const code = String(row.ma_sp || '').trim();
      const item = itemOptions.find(option => normalizeMaterialCodeKey(option.code) === normalizeMaterialCodeKey(code));
      return {
        ...createWarehouseLineDraft(),
        code,
        name: String(row.ten_sp || item?.name || ''),
        unit: item?.unit || '',
        quantity: String(row.so_luong || 0),
        documentQuantity: String(row.so_luong || 0)
      };
    }));
  }, [showProductExportTabs, productExportView, isEditingProductInbound, loadingProductSummary, productSummaryError, savedProductSummary, itemOptions]);

  const savedProductDetails = savedProductScanRows?.map(row => {
    const fullCode = String(row.ma_sp_quet || row.ma_sp || '').trim();
    const baseCode = warehouseCodePrefix(String(row.ma_sp || fullCode));
    const codeKey = normalizeMaterialCodeKey(baseCode);
    const item = itemOptions.find(option => normalizeMaterialCodeKey(option.code) === codeKey);
    const line = lines.find(candidate => normalizeMaterialCodeKey(candidate.code) === codeKey);
    return {
      key: String(row.id),
      baseCode,
      fullCode,
      name: String(row.ten_sp || item?.name || line?.name || ''),
      unit: String(row.don_vi || item?.unit || line?.unit || ''),
      savedAt: String(row.created_at || '')
    };
  }) ?? null;
  const productDetailRows = savedProductDetails ?? scannedProductDetails.slice(
    (savedProductScanPage - 1) * savedProductScanPageSize,
    savedProductScanPage * savedProductScanPageSize
  );
  const productDetailTotal = savedProductDetails ? savedProductScanTotal : scannedProductDetails.length;

  useEffect(() => {
    if (!isNvlExport) return;
    const codes = [...new Set(lines.map(line => String(line.code ?? '').trim()).filter(Boolean))] as string[];
    for (const code of codes) {
      const cacheKey = avgPriceCacheKey(code, slipDate);
      if (avgInboundPriceByKey[cacheKey] === undefined) {
        // Tự điền dòng đang trống giá khi vừa chọn mã / đổi tháng.
        void loadNvlAvgInboundPrice(code, slipDate, { applySuggestion: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNvlExport, editSlipCode, slipDate, lines.map(line => line.code).join('|')]);

  // Khi đã có BQ trong cache mà ô Giá còn trống → điền luôn.
  useEffect(() => {
    if (!isNvlExport) return;
    setLines(current => {
      let changed = false;
      const next = current.map(line => {
        if (!line.code.trim() || line.unitPrice.trim()) return line;
        const cached = avgInboundPriceByKey[avgPriceCacheKey(line.code, slipDate)];
        if (!cached || cached <= 0) return line;
        changed = true;
        return { ...line, unitPrice: formatSuggestedUnitPrice(cached) };
      });
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNvlExport, slipDate, avgInboundPriceByKey]);

  const applyProductionOrderSelection = (orderCodes: string[]) => {
    setProductionOrderCodes(orderCodes);
    const selectedOrders = productionOrders.filter(item => orderCodes.includes(item.orderCode));
    if (selectedOrders.length === 0) return;

    const machines = [...new Set(selectedOrders.map(order => order.machine).filter(Boolean))];
    if (machines.length > 0) setMachine(machines.join(', '));

    const matchedShifts = new Set<string>();
    for (const order of selectedOrders) {
      if (!order.shift) continue;
      const matched = shiftOptions
        .filter(option => shiftNamesMatch(option.value, order.shift) || shiftNamesMatch(option.label, order.shift))
        .map(option => option.value);
      if (matched.length > 0) matched.forEach(value => matchedShifts.add(value));
      else matchedShifts.add(order.shift);
    }
    if (matchedShifts.size > 0) {
      const preferred =
        [...matchedShifts].find(value => shiftOptions.some(option => option.value === value)) ||
        [...matchedShifts][0];
      setSelectedShifts(preferred ? [preferred] : []);
    }

    if (warehouseKind === 'san_pham') {
      const mergedLines = selectedOrders.flatMap(order => order.lines);
      if (mergedLines.length > 0) {
        setLines(
          mergedLines.map(line =>
            createWarehouseLineDraftFromPrefill({
              code: line.code,
              name: line.name,
              unit: line.unit,
              quantity: line.quantity != null ? formatNumber(line.quantity, 2) : '',
              documentQuantity: line.quantity != null ? formatNumber(line.quantity, 2) : '',
              unitPrice: ''
            })
          )
        );
      }
    }
  };

  const fillLinesFromMatchedOrders = async (matchedOrders: WarehouseProductionOrderOption[]) => {
    if (warehouseKind === 'san_pham') {
      const productLines = mergeWarehouseProductLinesFromOrders(matchedOrders);
      if (productLines.length === 0) {
        throw new Error('Các lệnh SX khớp ngày/ca chưa có sản phẩm để điền.');
      }
      setLines(
        productLines.map(line =>
          createWarehouseLineDraftFromPrefill({
            code: line.code,
            name: line.name,
            unit: line.unit,
            quantity: line.quantity > 0 ? formatNumber(line.quantity, 2) : '',
            documentQuantity: line.quantity > 0 ? formatNumber(line.quantity, 2) : '',
            unitPrice: ''
          })
        )
      );
      return productLines.length;
    }

    const catalog = await loadProductionOrderProductCatalog();
    const materialMap = new Map<
      string,
      { code: string; name: string; unit: string; quantity: number; quotaQuantity: number }
    >();

    for (const order of matchedOrders) {
      for (const line of order.lines) {
        const productCode = line.code.trim();
        if (!productCode) continue;
        const product = findProductByCode(catalog, productCode);
        if (!product || product.nplItems.length === 0) continue;
        const orderQty = Number(line.quantity);
        const qty = Number.isFinite(orderQty) && orderQty > 0 ? orderQty : 0;
        const materials = buildProductionOrderMaterialProposal(qty, product.nplItems, product);
        for (const material of materials) {
          const key = material.code.trim().toLowerCase();
          if (!key) continue;
          const existing = materialMap.get(key);
          if (existing) {
            existing.quantity += material.proposedQuantity;
            existing.quotaQuantity += material.proposedQuantity;
            if (!existing.name && material.name) existing.name = material.name;
            if (!existing.unit && material.unit) existing.unit = material.unit;
          } else {
            materialMap.set(key, {
              code: material.code,
              name: material.name || material.code,
              unit: material.unit || 'kg',
              quantity: material.proposedQuantity,
              quotaQuantity: material.proposedQuantity
            });
          }
        }
      }
    }

    const materialLines = sortWarehouseLinesKgFirst(
      [...materialMap.values()].filter(line => line.quantity > 0)
    );

    if (materialLines.length === 0) {
      const productCodes = [
        ...new Set(
          matchedOrders.flatMap(order => order.lines.map(line => line.code.trim()).filter(Boolean))
        )
      ];
      throw new Error(
        productCodes.length > 0
          ? `Không tìm được NVL định mức từ SP: ${productCodes.slice(0, 6).join(', ')}${productCodes.length > 6 ? '…' : ''}. Kiểm tra BOM (npl) trong danh mục sản phẩm.`
          : 'Không tìm được NVL định mức từ sản phẩm trong lệnh SX khớp ngày/ca.'
      );
    }

    setLines(
      reorderExportLinesKgFirst(
        materialLines.map(line =>
          createWarehouseLineDraftFromPrefill({
            code: line.code,
            name: line.name,
            unit: line.unit,
            quantity: String(line.quantity),
            documentQuantity: String(line.quantity),
            quotaQuantity: String(line.quotaQuantity),
            suggestedQuantity: String(line.quantity),
            unitPrice: ''
          })
        )
      )
    );
    return materialLines.length;
  };

  const fillLinesFromCanTuDongActual = async (
    matchedOrders: WarehouseProductionOrderOption[],
    shiftValues: string[]
  ) => {
    if (warehouseKind === 'san_pham') {
      throw new Error('Điền từ cân thực tế chỉ dùng cho phiếu xuất kho NVL.');
    }

    const ngay = slipDate.trim().slice(0, 10);
    const params = new URLSearchParams({ from: ngay, to: ngay, limit: '10000', dateBy: 'ngay' });
    const response = await fetch(`/api/can-tu-dong?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(readApiErrorMessage(response, data, 'Không thể tải phiếu cân thực tế (cân tự động).'));
    }

    const records = (Array.isArray(data.records) ? data.records : []) as CanTuDongWeightRow[];
    const machineFilter = machine.trim();
    const shiftFilters = shiftValues.map(value => String(value || '').trim()).filter(Boolean);

    const matchedRecords = records.filter(record => {
      if (shiftFilters.length > 0) {
        const rowCa = String(record.ca ?? '').trim();
        if (!shiftFilters.some(shift => canTuDongShiftMatches(rowCa, shift))) return false;
      }
      if (machineFilter) {
        const rowMachine = resolveCanTuDongMachine(record) || '';
        if (rowMachine) {
          const a = normalizeProductCodeKey(rowMachine);
          const b = normalizeProductCodeKey(machineFilter);
          if (
            a &&
            b &&
            a !== b &&
            !a.includes(b) &&
            !b.includes(a)
          ) {
            return false;
          }
        }
      }
      return true;
    });

    if (matchedRecords.length === 0) {
      throw new Error(
        `Không có phiếu cân thực tế khớp ngày ${ngay}${
          shiftFilters.length > 0 ? ` · ca ${shiftFilters.join(', ')}` : ''
        }${machineFilter ? ` · máy ${machineFilter}` : ''}.`
      );
    }

    const byProduct = new Map<string, { code: string; quantity: number; plasticKg: number }>();
    for (const record of matchedRecords) {
      const maSp = parseCanTuDongQrProductCode(String(record.qr_code ?? ''));
      if (!maSp) continue;
      const key = normalizeProductCodeKey(maSp);
      if (!key) continue;
      const current = byProduct.get(key);
      const plasticKg = resolveTrongLuongNhuaKg(record) ?? 0;
      byProduct.set(key, {
        code: maSp,
        quantity: (current?.quantity ?? 0) + 1,
        plasticKg: (current?.plasticKg ?? 0) + (Number.isFinite(plasticKg) ? plasticKg : 0)
      });
    }

    if (byProduct.size === 0) {
      throw new Error('Phiếu cân thực tế không có mã SP hợp lệ trong QR.');
    }

    const catalog = await loadProductionOrderProductCatalog();
    const materialMap = new Map<
      string,
      { code: string; name: string; unit: string; quantity: number; quotaQuantity: number }
    >();

    const productCodesFromOrders = new Set(
      matchedOrders.flatMap(order =>
        order.lines.map(line => normalizeProductCodeKey(line.code)).filter(Boolean)
      )
    );

    for (const [productKey, actual] of byProduct.entries()) {
      if (productCodesFromOrders.size > 0 && !productCodesFromOrders.has(productKey)) continue;
      const product = findProductByCode(catalog, actual.code);
      if (!product || product.nplItems.length === 0) continue;
      const materials = buildProductionOrderMaterialProposalFromActualWeighing(
        actual.quantity,
        actual.plasticKg,
        product.nplItems,
        product
      );
      for (const material of materials) {
        const key = material.code.trim().toLowerCase();
        if (!key || !(material.proposedQuantity > 0)) continue;
        const existing = materialMap.get(key);
        if (existing) {
          existing.quantity += material.proposedQuantity;
          existing.quotaQuantity += material.proposedQuantity;
          if (!existing.name && material.name) existing.name = material.name;
          if (!existing.unit && material.unit) existing.unit = material.unit;
        } else {
          materialMap.set(key, {
            code: material.code,
            name: material.name || material.code,
            unit: material.unit || 'kg',
            quantity: material.proposedQuantity,
            quotaQuantity: material.proposedQuantity
          });
        }
      }
    }

    // Fallback: lệnh có SP nhưng cân không khớp mã → thử điền theo SP lệnh với qty/kg cân gộp theo ca.
    if (materialMap.size === 0 && productCodesFromOrders.size > 0) {
      for (const order of matchedOrders) {
        for (const line of order.lines) {
          const productCode = line.code.trim();
          if (!productCode) continue;
          const product = findProductByCode(catalog, productCode);
          if (!product || product.nplItems.length === 0) continue;
          const key = normalizeProductCodeKey(productCode);
          const actual = key ? byProduct.get(key) : undefined;
          if (!actual) continue;
          const materials = buildProductionOrderMaterialProposalFromActualWeighing(
            actual.quantity,
            actual.plasticKg,
            product.nplItems,
            product
          );
          for (const material of materials) {
            const mKey = material.code.trim().toLowerCase();
            if (!mKey || !(material.proposedQuantity > 0)) continue;
            const existing = materialMap.get(mKey);
            if (existing) {
              existing.quantity += material.proposedQuantity;
              existing.quotaQuantity += material.proposedQuantity;
            } else {
              materialMap.set(mKey, {
                code: material.code,
                name: material.name || material.code,
                unit: material.unit || 'kg',
                quantity: material.proposedQuantity,
                quotaQuantity: material.proposedQuantity
              });
            }
          }
        }
      }
    }

    const materialLines = sortWarehouseLinesKgFirst(
      [...materialMap.values()].filter(line => line.quantity > 0)
    );

    if (materialLines.length === 0) {
      throw new Error(
        'Không ghép được NVL định mức với phiếu cân thực tế. Kiểm tra BOM sản phẩm và mã SP trên QR cân.'
      );
    }

    setLines(
      reorderExportLinesKgFirst(
        materialLines.map(line =>
          createWarehouseLineDraftFromPrefill({
            code: line.code,
            name: line.name,
            unit: line.unit,
            quantity: String(line.quantity),
            documentQuantity: String(line.quantity),
            quotaQuantity: String(line.quotaQuantity),
            suggestedQuantity: String(line.quantity),
            unitPrice: ''
          })
        )
      )
    );
    return { lineCount: materialLines.length, weighingCount: matchedRecords.length };
  };

  const handleAutofillFromProductionOrders = async () => {
    if (!slipDate.trim()) {
      setFormError('Vui lòng chọn Ngày phiếu trước khi tự động điền.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (showNvlShiftAndMachine && !isNvlInbound && selectedShifts.length === 0) {
      setFormError('Vui lòng chọn ca trước khi tự động điền theo lệnh SX.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!warehouseName.trim()) {
      setFormError('Vui lòng chọn tên kho trước khi tự động điền.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const matchedOrders = filterWarehouseProductionOrdersByDateShift(
      productionOrders,
      slipDate,
      selectedShifts
    );
    if (matchedOrders.length === 0) {
      const sameDate = productionOrders.filter(order => order.startDate === slipDate.trim().slice(0, 10));
      setFormError(
        selectedShifts.length > 0
          ? sameDate.length > 0
            ? `Có ${sameDate.length} lệnh SX ngày ${slipDate} nhưng không khớp ca đã chọn.`
            : `Không có lệnh SX khớp ngày ${slipDate} và ca đã chọn.`
          : `Không có lệnh SX khớp ngày ${slipDate}.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const hasExistingLines = lines.some(line => line.code.trim() || line.name.trim() || line.quantity.trim());
    if (hasExistingLines) {
      const ok = window.confirm(
        `Tìm thấy ${matchedOrders.length} lệnh SX theo ngày/ca.\nĐiền lại sẽ thay danh sách dòng hiện tại. Tiếp tục?`
      );
      if (!ok) return;
    }

    setIsAutofillingFromOrders(true);
    setFormError('');
    setActionMessage('');
    try {
      const orderCodes = matchedOrders.map(order => order.orderCode);
      setProductionOrderCodes(orderCodes);

      const machines = [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))];
      if (machines.length > 0) setMachine(machines.join(', '));

      const resolvedShift =
        selectedShifts[0] ||
        (() => {
          for (const order of matchedOrders) {
            if (!order.shift) continue;
            const matched = shiftOptions.find(
              option =>
                shiftNamesMatch(option.value, order.shift) || shiftNamesMatch(option.label, order.shift)
            );
            if (matched) return matched.value;
          }
          return matchedOrders.find(order => order.shift)?.shift || '';
        })();
      if (resolvedShift) setSelectedShifts([resolvedShift]);

      setReason(
        stripProductionOrderCodesFromReason(
          reason.trim() ||
            (resolvedShift
              ? `Xuất theo lệnh SX · ${slipDate} · ${resolvedShift}`
              : `Theo lệnh SX · ${slipDate}`)
        )
      );
      if (!note.trim()) {
        setNote(`Tự động điền từ ${matchedOrders.length} lệnh SX (${orderCodes.join(', ')}).`);
      }

      const lineCount = await fillLinesFromMatchedOrders(matchedOrders);
      const msg = `Đã tự động điền ${lineCount} dòng từ ${matchedOrders.length} lệnh SX theo ngày/ca.`;
      setActionMessage(msg);
      showAppToast(msg);
    } catch (error: any) {
      setFormError(error?.message || 'Không thể tự động điền từ lệnh SX.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsAutofillingFromOrders(false);
    }
  };

  const handleAutofillFromCanTuDong = async () => {
    if (!isNvlExport) {
      setFormError('Nút này chỉ dùng cho phiếu xuất kho NVL.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!slipDate.trim()) {
      setFormError('Vui lòng chọn Ngày phiếu trước khi điền từ cân thực tế.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (showNvlShiftAndMachine && selectedShifts.length === 0) {
      setFormError('Vui lòng chọn ca trước khi điền NVL từ cân thực tế.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!warehouseName.trim()) {
      setFormError('Vui lòng chọn tên kho trước khi tự động điền.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const matchedOrders = filterWarehouseProductionOrdersByDateShift(
      productionOrders,
      slipDate,
      selectedShifts
    );
    if (matchedOrders.length === 0) {
      setFormError(
        `Không có lệnh SX khớp ngày ${slipDate}${
          selectedShifts.length > 0 ? ` và ca đã chọn` : ''
        } — cần lệnh SX để lấy danh sách NVL định mức.`
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const hasExistingLines = lines.some(line => line.code.trim() || line.name.trim() || line.quantity.trim());
    if (hasExistingLines) {
      const ok = window.confirm(
        `Điền NVL theo định mức BOM, khối lượng lấy từ phiếu cân thực tế (cân tự động).\n` +
          `Tìm thấy ${matchedOrders.length} lệnh SX. Thay danh sách dòng hiện tại?`
      );
      if (!ok) return;
    }

    setIsAutofillingFromCanTuDong(true);
    setFormError('');
    setActionMessage('');
    try {
      const orderCodes = matchedOrders.map(order => order.orderCode);
      setProductionOrderCodes(orderCodes);

      const machines = [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))];
      if (machines.length > 0 && !machine.trim()) setMachine(machines.join(', '));

      const resolvedShift =
        selectedShifts[0] ||
        matchedOrders.find(order => order.shift)?.shift ||
        '';
      if (resolvedShift) setSelectedShifts([resolvedShift]);

      setReason(
        stripProductionOrderCodesFromReason(
          reason.trim() ||
            (resolvedShift
              ? `Xuất theo cân thực tế · ${slipDate} · ${resolvedShift}`
              : `Xuất theo cân thực tế · ${slipDate}`)
        )
      );
      if (!note.trim()) {
        setNote(
          `Tự động điền NVL theo ĐM · KG từ cân thực tế (${matchedOrders.length} lệnh: ${orderCodes.join(', ')}).`
        );
      }

      const { lineCount, weighingCount } = await fillLinesFromCanTuDongActual(
        matchedOrders,
        resolvedShift ? [resolvedShift] : selectedShifts
      );
      const msg = `Đã điền ${lineCount} NVL theo định mức, kg lấy từ ${weighingCount} phiếu cân thực tế.`;
      setActionMessage(msg);
      showAppToast(msg);
    } catch (error: any) {
      setFormError(error?.message || 'Không thể điền NVL từ cân thực tế.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsAutofillingFromCanTuDong(false);
    }
  };

  const toggleProductionOrder = (orderCode: string) => {
    applyProductionOrderSelection(toggleWarehouseProductionOrderSelection(productionOrderCodes, orderCode));
  };

  const filteredProductionOrders = useMemo(() => {
    const byDateShift = filterWarehouseProductionOrdersByDateShift(
      productionOrders,
      slipDate,
      selectedShifts
    );
    const query = productionOrderSearch.trim().toLowerCase();
    if (!query) return byDateShift;
    return byDateShift.filter(order => {
      const hay = `${order.orderCode} ${order.shift} ${order.machine} ${order.startDate}`.toLowerCase();
      return hay.includes(query);
    });
  }, [productionOrders, productionOrderSearch, slipDate, selectedShifts]);

  const productionOrderLabel = formatWarehouseProductionOrderSelection(productionOrderCodes);

  useEffect(() => {
    if (!productionOrderPickerOpen) {
      setProductionOrderMenuStyle(null);
      return;
    }
    const updatePosition = () => {
      const el = productionOrderTriggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setProductionOrderMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [productionOrderPickerOpen]);

  useEffect(() => {
    if (!productionOrderPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (productionOrderTriggerRef.current?.contains(target)) return;
      if (productionOrderPanelRef.current?.contains(target)) return;
      setProductionOrderPickerOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [productionOrderPickerOpen]);

  const resolveLineWeightKg = (line: WarehouseSlipLineDraft) =>
    convertWarehouseQuantityToKg({
      quantity: parsePercentInput(line.quantity),
      unit: line.unit,
      itemCode: line.code,
      warehouseKind: warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
      materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
      products: warehouseKind === 'san_pham' ? weightCatalog : [],
      // ĐVT ≠ kg: chỉ nhân Tổng kg trong danh mục kho NVL (không suy từ tên).
      preferTongKgOnly: true
    });

  /** Xếp xuất kho: ĐVT kg lên đầu, rồi theo quy đổi kg giảm dần. */
  const reorderExportLinesKgFirst = (list: WarehouseSlipLineDraft[]) =>
    sortWarehouseLinesKgFirst(list, { getWeightKg: resolveLineWeightKg });

  const applyExportLineOrder = () => {
    setLines(current => reorderExportLinesKgFirst(current));
    setActionMessage('Đã xếp lại: ĐVT kg lên đầu, các ĐVT khác theo khối lượng quy đổi.');
  };

  // Phiếu xuất: khi đã có catalog Tổng kg thì xếp lại (draft/autofill thường tới trước lúc load catalog).
  useEffect(() => {
    if (slipType !== 'xuat') return;
    if (weightCatalog.length === 0) return;
    if (lines.length === 0) return;
    setLines(current => {
      const next = sortWarehouseLinesKgFirst<WarehouseSlipLineDraft>(current, {
        getWeightKg: line =>
          convertWarehouseQuantityToKg({
            quantity: parsePercentInput(line.quantity),
            unit: line.unit,
            itemCode: line.code,
            warehouseKind: warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
            materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
            products: warehouseKind === 'san_pham' ? weightCatalog : [],
            preferTongKgOnly: true
          })
      });
      const unchanged =
        next.length === current.length && next.every((line, index) => line.key === current[index]?.key);
      return unchanged ? current : next;
    });
    // Chỉ chạy lại khi catalog/load loại kho đổi — không sort theo từng lần sửa SL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slipType, warehouseKind, weightCatalog]);


  const resolveLineWeightHint = (line: WarehouseSlipLineDraft) => {
    const quantity = parsePercentInput(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
    const unit = String(line.unit || '').trim();
    if (!unit || unit === '-') return undefined;
    if (isWarehouseWeightKgUnit(unit)) {
      return `ĐVT kg → quy đổi = SL thực (${formatNumber(quantity, 3)} kg)`;
    }
    const tongKg = findMaterialTongKgPerUnit(line.code, weightCatalog);
    if (tongKg === null) {
      return `ĐVT ${unit}: chưa có Tổng kg trong kho NVL cho mã ${line.code || '—'} → không quy đổi`;
    }
    return `ĐVT ${unit} → SL × Tổng kg kho = ${formatNumber(quantity, 3)} × ${formatNumber(tongKg, 6)} = ${formatWarehouseWeightKg(quantity * tongKg)}`;
  };

  const shiftLabel = formatWarehouseShiftSelection(selectedShifts);
  const productionOrderCodesForSave = showOrderFields ? productionOrderCodes : [];
  const shiftLabelForSave = showWarehouseShiftAndMachine ? shiftLabel : '';
  const productionOrderLabelForSave = showOrderFields ? productionOrderLabel : '';
  const savedReason = composeReasonWithProductionOrderCodes(reason, productionOrderCodesForSave);

  const handlePrintSavedSlip = () => {
    if (!printSlip) {
      setFormError(showSaveFailure('Vui lòng lưu phiếu trước khi in.'));
      return;
    }
    setFormError('');
    setPrintAutoTrigger(true);
    setPrintModalOpen(true);
  };

  const handleLineActualImageUpload = async (
    lineKey: string,
    file?: File | null
  ) => {
    if (!file) return;

    setUploadingLineImageKey(`${lineKey}-weight`);
    setFormError('');

    try {
      const dataUrl = await fileToOptimizedImageDataUrl(file);
      const uploaded = await uploadImage(dataUrl, 'phieu_xuat_nhap_kho');
      updateLine(
        lineKey,
        { actualWeightImageUrl: uploaded.imageUrl, actualWeightImagePublicId: uploaded.imagePublicId }
      );
      showAppToast('Đã upload ảnh số cân thực tế.');
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Không thể upload ảnh số cân thực tế.';
      setFormError(message);
      showAppToast(message, 'error');
    } finally {
      setUploadingLineImageKey(null);
    }
  };

  const discardDuplicateScannedProducts = (fullCodes: string[]) => {
    const duplicateKeys = new Set(fullCodes.map(normalizeMaterialCodeKey));
    const removedByPrefix = new Map<string, number>();
    for (const [prefixKey, codes] of scannedFullCodesByPrefixRef.current) {
      for (const [codeKey] of codes) {
        if (!duplicateKeys.has(codeKey)) continue;
        codes.delete(codeKey);
        removedByPrefix.set(prefixKey, (removedByPrefix.get(prefixKey) || 0) + 1);
      }
      if (!codes.size) scannedFullCodesByPrefixRef.current.delete(prefixKey);
    }
    if (!removedByPrefix.size) return;
    const nextLines = linesRef.current.flatMap(line => {
      const removed = removedByPrefix.get(normalizeMaterialCodeKey(line.code)) || 0;
      if (!removed || !line.isScanned) return [line];
      const quantity = Math.max(0, (Number(line.quantity) || 0) - removed);
      return quantity > 0 ? [{ ...line, quantity: String(quantity) }] : [];
    });
    const withBlankLine = nextLines.length ? nextLines : [createWarehouseLineDraft()];
    linesRef.current = withBlankLine;
    setLines(withBlankLine);
  };

  const handleSaveScannedProductBatch = async () => {
    if (!(editSlipCode ? canEdit : canCreate)) {
      setFormError('Bạn không có quyền lưu mã quét vào kho này.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    setActionMessage('');
    try {
      const candidates = [...new Map(
        pendingScannedProductDetails.map(detail => [
          normalizeMaterialCodeKey(detail.fullCode),
          { fullCode: detail.fullCode, name: detail.name, unit: detail.unit }
        ] as const)
      ).values()];
      if (!candidates.length) return;
      const maPhieu = ensureKhoScanMaPhieu();
      const response = await fetch('/api/kho/quet-dot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loai_phieu: slipType,
          ma_phieu: maPhieu,
          ngay: slipDate,
          nhan_su: createdBy.trim() || loginName,
          kho: warehouseName.trim(),
          ghi_chu: note.trim(),
          items: candidates.map(item => ({ ma_sp_quet: item.fullCode, ten_sp: item.name, don_vi: item.unit }))
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiErrorMessage(response, data, 'Không thể lưu đợt mã đã quét.'));
      }
      const savedRows = Array.isArray(data?.saved) ? data.saved : [];
      const savedCodes = savedRows.map((row: { ma_sp_quet?: unknown }) => String(row.ma_sp_quet || '').trim()).filter(Boolean);
      const duplicateCodes = Array.isArray(data?.duplicateCodes)
        ? data.duplicateCodes.map((code: unknown) => String(code || '').trim()).filter(Boolean)
        : [];
      if (duplicateCodes.length) {
        discardDuplicateScannedProducts(duplicateCodes);
        showAppToast(`Bỏ qua ${duplicateCodes.length} mã QR đã tồn tại trong phiếu ${slipType}.`, 'error');
      }
      if (data?.header?.ma_phieu) {
        setSelectedProductSlipCode(maPhieu);
        setOpenProductSlips(current => [
          data.header as OpenProductSlip,
          ...current.filter(slip => slip.ma_phieu !== maPhieu)
        ]);
      }
      if (savedCodes.length) {
        const savedAt = new Date().toISOString();
        setScannedSavedAtByCode(current => ({
          ...current,
          ...Object.fromEntries(savedRows
            .map((row: { ma_sp_quet?: unknown; created_at?: unknown }): [string, string] => [
              String(row.ma_sp_quet || '').trim(),
              String(row.created_at || savedAt)
            ])
            .filter(([code]) => Boolean(code)))
        }));
        setSavedProductBatchCodes(current => new Set([...current, ...savedCodes.map(normalizeMaterialCodeKey)]));
        setActionMessage(`Đã lưu ${savedCodes.length} sản phẩm${duplicateCodes.length ? `; bỏ qua ${duplicateCodes.length} mã đã tồn tại` : ''}.`);
      }
    } catch (error: any) {
      setFormError(showSaveFailure(error, 'Không thể lưu đợt mã đã quét.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (autoPrint = false) => {
    if (editSlipCode && slipType === 'xuat') {
      setFormError(showSaveFailure('Phiếu xuất kho không thể sửa.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!(editSlipCode ? canEdit : canCreate)) {
      setFormError(
        showSaveFailure(
          editSlipCode
            ? 'Bạn không có quyền sửa phiếu thuộc kho này.'
            : 'Bạn không có quyền lập phiếu thuộc kho này.'
        )
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (reviewingDamagedReportKey) {
      if (isXuatTreoMode || slipType !== 'nhap' || !productionReportLoai) {
        setFormError(
          showSaveFailure('Báo cáo sản lượng chỉ được nạp bằng phiếu Nhập kho vào đúng kho tương ứng.')
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
    if (!warehouseName.trim()) {
      setFormError(showSaveFailure('Vui lòng chọn tên kho từ danh sách Quản lý kho.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const scannedCodeKeys = new Set(
      [...scannedFullCodesByPrefixRef.current.values()]
        .flatMap(codes => [...codes.values()])
        .map(normalizeMaterialCodeKey)
    );
    if (showProductExportTabs && scannedProductDetails.some(detail =>
      scannedCodeKeys.has(normalizeMaterialCodeKey(detail.fullCode)) && !detail.savedAt
    )) {
      setFormError('Bấm Lưu đợt để lưu toàn bộ mã đã quét trước khi lập phiếu.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const currentLines = linesRef.current;
    const orderedLines = slipType === 'xuat' ? reorderExportLinesKgFirst(currentLines) : currentLines;
    const mergedLines = isNvlExport ? mergeWarehouseExportLineDrafts(orderedLines) : orderedLines;
    if (slipType === 'xuat') setLines(mergedLines);
    const linesForSave = isNvlExport
      ? mergedLines.map(line => ({ ...line, sourceInboundLineId: '', sourceInboundSlipCode: '' }))
      : orderedLines;
    const parsed = parseWarehouseSlipPayloadItems(linesForSave, warehouseKind, {
      allowMissingUnitPrice: isNvlExport,
      requireInboundLot: false,
      includeDocumentQuantity: slipType === 'xuat'
    });
    if ('error' in parsed) {
      setFormError(showSaveFailure(parsed.error));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const payloadItems = parsed.items;
    setIsSaving(true);
    setFormError('');
    setActionMessage('');
    setPendingQrLabels([]);
    setQrPrintOpen(false);
    setQrPrintAutoTrigger(false);

    const isEditing = Boolean(editSlipCode);
    const printSlipType: WarehouseSlipType = slipType === 'xuat' ? 'xuat' : 'nhap';
    const isXuatTreoFlow = isXuatTreoMode && slipType === 'xuat';
    const slipPayload = {
      maPhieu: isEditing ? undefined : newSlipCode,
      loaiPhieu: printSlipType,
      loaiKho: warehouseKind,
      tenKho: warehouseName.trim(),
      ngayPhieu: slipDate,
      lyDo: savedReason,
      ghiChu: note.trim(),
      nguoiLap: createdBy.trim(),
      ca: shiftLabelForSave || null,
      may: showWarehouseShiftAndMachine ? machine.trim() || null : null,
      // "Xuất kho treo" là form chờ lấy dữ liệu báo cáo hàng hỏng; khi lưu phải thành phiếu xuất chính thức.
      treo: false,
      items: payloadItems
    };

    try {
      if (showProductExportTabs || (scannedItemCount > 0 && !isXuatTreoFlow)) {
        const headerRes = await fetch('/api/kho/phieu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loai_phieu: printSlipType,
            ma_phieu: editSlipCode || khoScanMaPhieuRef.current || newSlipCode,
            ngay: slipDate,
            nhan_su: createdBy.trim() || loginName,
            kho: warehouseName.trim(),
            ca: shiftLabelForSave,
            may: showWarehouseShiftAndMachine ? machine.trim() : '',
            ghi_chu: note.trim(),
            status: editSlipCode ? 'da_chot' : 'chua_chot'
          })
        });
        const headerData = await headerRes.json().catch(() => ({}));
        if (!headerRes.ok) {
          throw new Error(readApiErrorMessage(headerRes, headerData, 'Không thể lưu thông tin phiếu vào DB kho.'));
        }
      }
      const res = await fetch(
        isEditing ? `/api/phieu-xuat-nhap-kho/${encodeURIComponent(editSlipCode!)}` : '/api/phieu-xuat-nhap-kho',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slipPayload)
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          readApiErrorMessage(
            res,
            data,
            isEditing ? 'Không thể cập nhật phiếu xuất nhập kho.' : 'Không thể lưu phiếu xuất nhập kho.'
          )
        );
      }

      const savedSlipCode = String(data.slipCode || editSlipCode || '').trim();
      if (!savedSlipCode) {
        throw new Error('Máy chủ chưa xác nhận mã phiếu đã lưu. Phiếu sẽ không được in.');
      }
      if (showProductExportTabs) {
        const statusResponse = await fetch('/api/kho/phieu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loai_phieu: printSlipType,
            ma_phieu: savedSlipCode,
            ngay: slipDate,
            nhan_su: createdBy.trim() || loginName,
            kho: warehouseName.trim(),
            ca: shiftLabelForSave,
            may: showWarehouseShiftAndMachine ? machine.trim() : '',
            ghi_chu: note.trim(),
            status: 'da_chot'
          })
        });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
          throw new Error(readApiErrorMessage(statusResponse, statusData, 'Không thể chốt trạng thái phiếu.'));
        }
      }
      const savedProductQrLabels: ProductQrPrintLabel[] = Array.isArray(data.qrCodes)
        ? data.qrCodes
            .map((record: Record<string, unknown>, index: number) => {
              const payload = String(record.code ?? record.ma_sp_day_du ?? '').trim();
              const productCode = String(record.baseCode ?? record.ma_sp_goc ?? '').trim();
              return {
                key: `${savedSlipCode}-${index}-${payload}`,
                payload,
                productCode,
                productName: String(record.name ?? record.ten_npl ?? record.ten_sp ?? '').trim(),
                itemLabel: warehouseKind === 'nvl' ? 'Tên NVL' : undefined
              };
            })
            .filter((label: ProductQrPrintLabel) => Boolean(label.payload))
        : [];
      const savedQrLabels = savedProductQrLabels;
      setPendingQrLabels(savedQrLabels);

      setPrintSlip(
        buildWarehouseSlipPrintData(payloadItems, {
            slipCode: savedSlipCode,
            slipType: printSlipType,
            warehouseKind,
            slipDate,
            reason: savedReason,
            note: note.trim(),
            createdBy: createdBy.trim(),
            productionOrderRef: productionOrderLabelForSave,
            machine: machine.trim(),
            shift: shiftLabelForSave,
            recipient: recipient.trim(),
            deliverer: deliverer.trim(),
            warehouseLocation: warehouseLocation.trim(),
            warehouseName: warehouseName.trim(),
            materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
            products: warehouseKind === 'san_pham' ? weightCatalog : []
        })
      );
      setPrintAutoTrigger(autoPrint);
      if (autoPrint) setPrintModalOpen(true);
      const savedMessage = autoPrint
        ? savedQrLabels.length > 0
          ? `Đã lưu phiếu ${savedSlipCode} và chuẩn bị ${savedQrLabels.length} mã QR. Hệ thống sẽ lần lượt mở phiếu nhập và file tem QR.`
          : `Đã lưu phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}) vào lịch sử.`
        : `Đã lưu phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}) vào lịch sử. Bấm “In phiếu” để mở bản in.`;
      const okMsg = isEditing
        ? autoPrint
          ? `Đã cập nhật phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}). Xem tại Lịch sử xuất nhập kho.`
          : `Đã cập nhật phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}). Bấm “In phiếu” để mở bản in.`
        : isXuatTreoFlow
          ? autoPrint
            ? `Đã lưu phiếu xuất ${savedSlipCode} từ báo cáo hàng hỏng và cập nhật tồn kho.`
            : `Đã lưu phiếu xuất ${savedSlipCode} từ báo cáo hàng hỏng và cập nhật tồn kho. Bấm “In phiếu” để mở bản in.`
          : savedMessage;
      setActionMessage(okMsg);
      showAppToast(okMsg);
      if (reviewingDamagedReportKey) {
        setPendingDamagedReports(current => current.filter(report => report.key !== reviewingDamagedReportKey));
        setReviewingDamagedReportKey('');
        void loadPendingDamagedReports();
      }
      setEditSlipCode(null);
      setReason('');
      setNote('');
      setDeliverer('');
      setCreatedBy(loginName);
      setProductionOrderCodes([]);
      setProductionOrderSearch('');
      scannedFullCodesByPrefixRef.current.clear();
      setScannedSavedAtByCode({});
      const nextSlipCode = generateWarehouseSlipPreviewCode(printSlipType);
      setNewSlipCode(nextSlipCode);
      setSelectedProductSlipCode('');
      setOpenProductSlips(current => current.filter(slip => slip.ma_phieu !== savedSlipCode));
      khoScanMaPhieuRef.current = nextSlipCode;
      const emptyLines = [createWarehouseLineDraft()];
      linesRef.current = emptyLines;
      setLines(emptyLines);
      setSavedProductBatchCodes(new Set());
    } catch (error: any) {
      setFormError(showSaveFailure(error, 'Không thể lưu phiếu xuất nhập kho.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSaving(false);
    }
  };

  const pendingReportsCardConfig = showPendingProductionReports
    ? {
        title: `Báo cáo sản lượng (${productionReportLoaiLabel}) chờ nhập ${selectedWarehouseName}`,
        subtitle:
          'Chọn đúng kho và Ngày phiếu để xem báo cáo sản lượng của ngày đó. Bấm Kiểm tra để nạp xuống phiếu; lưu phiếu nhập rồi thì báo cáo không hiện lại nữa.',
        emptyText: `Không có phiếu ${productionReportLoaiLabel} nào của ngày ${slipDate || '—'} đang chờ nhập kho.`
      }
    : null;
  const showInlineFormError = !(showProductExportTabs && productExportView === 'thuc-hien');

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      {pendingReportsCardConfig && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-200 bg-white p-4 text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-[#ef1b2d]" />
                  <h2 className="text-base font-black text-slate-900">{pendingReportsCardConfig.title}</h2>
                  {!isLoadingDamagedReports && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">
                      {pendingDamagedReports.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">{pendingReportsCardConfig.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadPendingDamagedReports()}
                  disabled={isLoadingDamagedReports}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
                >
                  <Loader2 className={`h-3.5 w-3.5 ${isLoadingDamagedReports ? 'animate-spin' : ''}`} />
                  Tải lại
                </button>
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
                >
                  <History className="h-4 w-4" />
                  Lịch sử
                </button>
              </div>
            </div>

            <div className="mt-3">
              {isLoadingDamagedReports ? (
                <div className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách báo cáo...
                </div>
              ) : damagedReportsError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-bold text-rose-700">
                  {damagedReportsError}
                </p>
              ) : pendingDamagedReports.length === 0 ? (
                <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700">
                  {pendingReportsCardConfig.emptyText}
                </div>
              ) : (
                <div className="scrollbar-hidden grid max-h-72 gap-2 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-3">
                  {pendingDamagedReports.map(report => {
                    const isReviewing = reviewingDamagedReportKey === report.key;
                    return (
                      <div
                        key={report.key}
                        className={`rounded-xl border p-3 transition ${
                          isReviewing ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{report.documentNo}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {report.productionDate || report.reportDate || 'Chưa có ngày'}
                              {report.shift ? ` · ${report.shift}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleReviewDamagedReport(report)}
                            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black transition ${
                              isReviewing
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#ef1b2d] text-white hover:bg-[#d91526]'
                            }`}
                          >
                            {isReviewing ? 'Đang kiểm tra' : 'Kiểm tra'}
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <span className="truncate text-slate-600">Người báo: <b>{report.weigher || '—'}</b></span>
                          <span className="truncate text-slate-600">Máy: <b>{report.machine || '—'}</b></span>
                          <span className="col-span-2 text-slate-600">
                            {report.items.length} dòng vật tư · {report.items.map(item => `${item.name}: ${formatNumber(item.quantity)} ${item.unit}`).join('; ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {((formError && showInlineFormError) || actionMessage) && (
        <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
          {formError && showInlineFormError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{formError}</p>
          )}
          {actionMessage && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-bold text-emerald-700">{actionMessage}</p>
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 text-[11px] font-black text-emerald-800 transition hover:bg-emerald-100"
              >
                <History className="h-3.5 w-3.5" />
                Xem lịch sử
              </button>
            </div>
          )}
        </section>
      )}

      <section data-warehouse-slip-form className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-zinc-700">Loại phiếu</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'nhap', label: 'Nhập kho', Icon: ArrowDownToLine, slipType: 'nhap' as const, treoMode: false },
                { key: 'xuat_treo', label: 'Xuất kho treo', Icon: Clock, slipType: 'xuat' as const, treoMode: true },
                { key: 'xuat', label: 'Xuất kho', Icon: ArrowUpFromLine, slipType: 'xuat' as const, treoMode: false }
              ] as const).map(option => {
                const isActive = slipType === option.slipType && isXuatTreoMode === option.treoMode;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleSlipModeChange(option.slipType, option.treoMode)}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-extrabold transition ${
                      isActive
                        ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    <option.Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-black uppercase tracking-wide text-zinc-700">Tên kho *</span>
              <SearchableSelect
                value={warehouseName}
                onChange={handleWarehouseNameChange}
                options={warehouseSelectOptions}
                getLabel={item => String(item)}
                getValue={item => String(item)}
                placeholder="-- Chọn tên kho --"
                inputClassName={warehouseFieldClass}
                comboboxMode
                comboboxSearchable={false}
                matchDropdownWidth
                autoFlip
              />
              {warehouseName ? (
                <p className="text-[11px] font-semibold text-zinc-500">
                  Loại: {warehouseKindLabel(warehouseKind)}
                </p>
              ) : warehouseOptions.length === 0 ? (
                <p className="text-[11px] font-semibold text-amber-700">
                  Chưa có tên kho — thêm tại mục Quản lý kho.
                </p>
              ) : warehouseSelectOptions.length === 0 ? (
                <p className="text-[11px] font-semibold text-amber-700">
                  Bạn chưa được phân quyền lập phiếu cho kho vật tư hoặc kho thành phẩm nào.
                </p>
              ) : null}
            </label>
            {showProductExportTabs && !editSlipCode && warehouseName ? (
              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-wide text-zinc-700">
                  Chọn phiếu {slipType === 'nhap' ? 'nhập' : 'xuất'} chưa chốt
                </span>
                <SearchableSelect
                  value={selectedProductSlipCode}
                  onChange={handleProductSlipSelection}
                  options={openProductSlips}
                  getValue={item => (item as OpenProductSlip).ma_phieu}
                  getLabel={item => `${(item as OpenProductSlip).ma_phieu} · Chưa chốt`}
                  placeholder={`+ Tạo phiếu ${slipType === 'nhap' ? 'nhập' : 'xuất'}`}
                  disabled={isLoadingProductSlips}
                  inputClassName={warehouseFieldClass}
                  comboboxMode
                  comboboxSearchable={false}
                  matchDropdownWidth
                  autoFlip
                />
              </label>
            ) : null}
          </div>
        </div>
      </section>

      {showProductExportTabs ? (
        <nav aria-label="Chức năng xuất kho thành phẩm" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2">
          {([
            { key: 'thuc-hien', label: 'Thực hiện', Icon: ClipboardCheck },
            { key: 'chi-tiet', label: 'Chi tiết', Icon: ListChecks },
            { key: 'lap-phieu', label: 'Lập phiếu', Icon: FilePlus2 }
          ] as const).map(tab => (
            <button
              key={tab.key}
              type="button"
              aria-current={productExportView === tab.key ? 'page' : undefined}
              onClick={() => {
                setProductExportView(tab.key);
                if (tab.key === 'lap-phieu') setProductLineView('summary');
              }}
              className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[84px] sm:flex-row sm:justify-center sm:gap-3 sm:px-3 ${
                productExportView === tab.key
                  ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl ${productExportView === tab.key ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                <tab.Icon className="h-4 w-4 sm:h-6 sm:w-6" />
              </span>
              <span className="text-[11px] font-black leading-tight text-zinc-900 sm:text-base">{tab.label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {selectedWarehouseName ? (
        <>
      {!showProductExportTabs || productExportView === 'lap-phieu' ? (
        <>
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 border-b border-zinc-100 pb-2">
          <p className="text-sm font-black text-zinc-950">Thông tin phiếu</p>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-400">
            {slipType === 'xuat' && isXuatTreoMode ? 'Xuất kho treo' : warehouseSlipTypeLabel(slipType)} ·{' '}
            {warehouseName || warehouseKindLabel(warehouseKind)}
          </p>
          {!editSlipCode && canDelete && openProductSlips.some(slip =>
            slip.ma_phieu === selectedProductSlipCode && slip.status === 'chua_chot'
          ) ? (
            <button
              type="button"
              onClick={() => void handleDeleteSelectedProductSlip()}
              disabled={isDeletingProductSlip || isSaving}
              aria-label={`Xóa phiếu tạm ${selectedProductSlipCode}`}
              title={`Xóa phiếu tạm ${selectedProductSlipCode}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-[#ef1b2d] transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeletingProductSlip ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </button>
          ) : null}
        </div>

        <div
          className="grid gap-x-2 gap-y-1.5"
          style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <label className="block min-w-0 w-full max-w-full space-y-1 overflow-hidden">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày phiếu *</span>
            <div className="relative min-w-0 w-full max-w-full overflow-hidden">
              <input
                type="date"
                value={slipDate}
                onChange={event => setSlipDate(event.target.value)}
                className={`${warehouseFieldClass} block min-w-0 max-w-full w-full overflow-hidden`}
                style={{
                  minWidth: 0,
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
              />
              <span
                className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs font-semibold text-zinc-800"
                aria-hidden="true"
              >
                {slipDate
                  ? (() => {
                      const [y, m, d] = slipDate.split('-');
                      return y && m && d ? `${d}/${m}/${y}` : slipDate;
                    })()
                  : ''}
              </span>
            </div>
          </label>
          {showWarehouseShiftAndMachine ? (
          <label className="block min-w-0 space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Ca
            </span>
            <SearchableSelect
              value={selectedShifts[0] ?? ''}
              onChange={value => {
                const nextValue = value.trim();
                setSelectedShifts(nextValue ? [nextValue] : []);
              }}
              options={shiftOptions}
              getLabel={item => (item as { label: string }).label}
              getValue={item => (item as { value: string }).value}
  placeholder={shiftOptions.length === 0 ? 'Chưa có ca trong cài đặt' : '-- Chọn ca --'}
  inputClassName={warehouseFieldClass}
              disabled={shiftOptions.length === 0}
              comboboxMode
              comboboxSearchable={false}
              desktopAutoFlip
              matchDropdownWidth
            />
          </label>
          ) : null}
          {showWarehouseShiftAndMachine ? (
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Máy</span>
              <SearchableSelect
                value={machine}
                onChange={setMachine}
                options={machineSelectOptions}
                getLabel={item => (item as WarehouseMachineSelectOption).label}
                getValue={item => (item as WarehouseMachineSelectOption).label}
                getSearchText={item => {
                  const option = item as WarehouseMachineSelectOption;
                  return `${option.code} ${option.name} ${option.label}`;
                }}
                resolveSelectedItem={(options, value) => {
                  const normalized = value.trim().toLowerCase();
                  return (
                    options.find(item => {
                      const option = item as WarehouseMachineSelectOption;
                      return [option.label, option.code, option.name].some(
                        candidate => candidate.trim().toLowerCase() === normalized
                      );
                    }) ?? null
                  );
                }}
                placeholder="Chọn máy..."
                searchPlaceholder="Tìm máy..."
                inputClassName={warehouseFieldClass}
                isLoading={isLoadingMachines}
                comboboxMode
                comboboxSearchable={false}
                desktopAutoFlip
                matchDropdownWidth
              />
            </label>
          ) : null}

          <label className="block min-w-0 space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người lập</span>
            <input
              value={createdBy}
              onChange={event => setCreatedBy(event.target.value)}
              className={warehouseFieldClass}
              placeholder={loginName || 'Tên người lập phiếu'}
              readOnly={Boolean(loginName) && !editSlipCode}
              title={loginName ? `Theo tài khoản đăng nhập: ${loginName}` : undefined}
            />
          </label>
          {showFullWarehouseSlipFields ? (
            <label className="block min-w-0 space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người giao hàng</span>
              <input
                value={deliverer}
                onChange={event => setDeliverer(event.target.value)}
                className={warehouseFieldClass}
                placeholder="Họ tên người giao hàng"
              />
            </label>
          ) : (
            <label className="block min-w-0 space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
              <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Xuất sản xuất..." />
            </label>
          )}

          {showFullWarehouseSlipFields ? (
            <>
              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Địa điểm</span>
                <input
                  value={warehouseLocation}
                  onChange={event => setWarehouseLocation(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="VD: HCM"
                />
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
                <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Nhập mua ngoài..." />
              </label>
              <label className="block min-w-0 space-y-1">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Số chứng từ gốc kèm theo..." />
              </label>
            </>
          ) : (
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
              <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Ghi chú thêm (tuỳ chọn)" />
            </label>
          )}

          {showOrderFields ? (
            <div className="relative col-span-2 block min-w-0 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Mã đơn hàng / Lệnh SX{' '}
                <span className="font-semibold normal-case tracking-normal text-zinc-400">
                  (chọn nhiều)
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleAutofillFromProductionOrders()}
                  disabled={isAutofillingFromOrders || isLoadingProductionOrders}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/25 bg-red-50 px-2.5 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Điền máy, lệnh SX và dòng NVL theo định mức BOM × SL lệnh SX"
                >
                  {isAutofillingFromOrders ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  )}
                  Tự động điền theo lệnh SX
                </button>
              </div>
            </div>
            <button
              type="button"
              ref={productionOrderTriggerRef}
              onClick={() => setProductionOrderPickerOpen(prev => !prev)}
              className={`${warehouseFieldClass} flex items-center justify-between gap-2 text-left`}
            >
              <span className={`truncate ${productionOrderCodes.length > 0 ? 'text-zinc-800' : 'text-zinc-400'}`}>
                {productionOrderCodes.length > 0
                  ? `Đã chọn (${productionOrderCodes.length}): ${productionOrderLabel}`
                  : 'Chọn mã lệnh SX...'}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                  productionOrderPickerOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {(editSlipCode ? canEdit : canCreate) ? (
              <button
                type="button"
                onClick={() => {
                  setScannerMode('hardware-v2');
                  setQrScannerOpen(true);
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#ef1b2d] bg-[#ef1b2d] px-5 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#b30d1c] sm:h-14 sm:text-base"
                title="Quét máy: mã trùng sẽ không được thêm"
              >
                <ScanBarcode className="h-5 w-5 sm:h-6 sm:w-6" />
                Quét máy
              </button>
            ) : null}
            {productionOrderPickerOpen && productionOrderMenuStyle
              ? createPortal(
                  <div
                    ref={productionOrderPanelRef}
                    className="fixed z-[200] space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5 shadow-lg"
                    style={productionOrderMenuStyle}
                  >
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      <input
                        autoFocus
                        value={productionOrderSearch}
                        onChange={event => setProductionOrderSearch(event.target.value)}
                        className={`${warehouseFieldClass} pl-8`}
                        placeholder="Gõ để lọc mã lệnh SX..."
                      />
                    </div>
                    {isLoadingProductionOrders ? (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang tải lệnh SX...
                      </p>
                    ) : filteredProductionOrders.length === 0 ? (
                      <p className="text-xs font-semibold text-zinc-400">
                        {productionOrders.length === 0 ? 'Chưa có lệnh SX.' : 'Không khớp bộ lọc.'}
                      </p>
                    ) : (
                      <div className="scrollbar-hidden max-h-52 overflow-y-auto">
                        <div className="flex flex-wrap gap-1.5">
                          {filteredProductionOrders.map(order => {
                            const checked = productionOrderCodes.includes(order.orderCode);
                            const extras = [order.startDate, order.shift, order.machine].filter(Boolean).join(' · ');
                            return (
                              <label
                                key={order.id || order.orderCode}
                                className={`inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                                  checked
                                    ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                                }`}
                                title={extras || order.orderCode}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleProductionOrder(order.orderCode)}
                                  className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                                />
                                <span className="truncate">
                                  {order.orderCode}
                                  {extras ? <span className="font-semibold text-zinc-400"> · {extras}</span> : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                      <p className="text-[11px] font-semibold text-zinc-500">
                        {productionOrderCodes.length > 0
                          ? `Đã chọn ${productionOrderCodes.length} lệnh SX`
                          : slipDate
                            ? `Lọc theo ngày ${slipDate}${selectedShifts.length > 0 ? ` · ${selectedShifts.length} ca` : ''}`
                            : `Tick nhiều mã lệnh SX${warehouseKind === 'san_pham' ? ' — sẽ gộp dòng sản phẩm' : ''}.`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setProductionOrderPickerOpen(false)}
                        className="h-7 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-50"
                      >
                        Xong
                      </button>
                    </div>
                  </div>,
                  document.body
                )
              : null}
            </div>
          ) : (editSlipCode ? canEdit : canCreate) && !(showProductExportTabs && productExportView === 'lap-phieu') ? (
            <div className="relative col-span-2 block min-w-0">
              <button
                type="button"
                onClick={() => {
                  setScannerMode('hardware-v2');
                  setQrScannerOpen(true);
                }}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#ef1b2d] bg-[#ef1b2d] px-5 text-sm font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#b30d1c] sm:h-14 sm:text-base"
                title="Quét máy: mã trùng sẽ không được thêm"
              >
                <ScanBarcode className="h-5 w-5 sm:h-6 sm:w-6" />
                Quét máy
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                {isEditingProductInbound
                  ? 'Chỉnh sửa sản phẩm trong phiếu nhập'
                  : showProductExportTabs && productExportView === 'lap-phieu'
                    ? 'Tổng hợp sản phẩm đã quét'
                    : `Chi tiết ${warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL'}`}
              </p>
            </div>
            {warehouseKind === 'san_pham' && !(showProductExportTabs && productExportView === 'lap-phieu') ? (
              <div role="tablist" aria-label="Cách xem chi tiết sản phẩm" className="flex rounded-lg bg-zinc-200/70 p-1">
                {(['detail', 'summary'] as const).map(view => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={productLineView === view}
                    onClick={() => setProductLineView(view)}
                    className={`rounded-md px-3 py-1.5 text-[11px] font-extrabold transition ${
                      productLineView === view ? 'bg-white text-[#ef1b2d] shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {view === 'detail' ? 'Chi tiết' : 'Tổng hợp'}
                  </button>
                ))}
              </div>
            ) : null}
            {(editSlipCode ? canEdit : canCreate) && !(showProductExportTabs && productExportView === 'lap-phieu') ? (
              <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('camera');
                    setQrScannerOpen(true);
                  }}
                  className="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
                  title="Quét ĐT: mã trùng sẽ không được thêm"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét ĐT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProductLineView('summary');
                    setLines(current => [...current, createWarehouseLineDraft()]);
                  }}
                  className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm dòng
                </button>
                {slipType === 'xuat' && warehouseKind !== 'san_pham' ? (
                  <button
                    type="button"
                    onClick={handleRefreshWeightCatalog}
                    disabled={isLoadingItems}
                    className="flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Tải lại cột Tổng kg từ kho NVL sau khi sửa định lượng"
                  >
                    {isLoadingItems ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Làm mới Tổng kg
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {showProductExportTabs && productExportView === 'lap-phieu' && !isEditingProductInbound ? (
            <div className="scrollbar-hidden -mx-0.5 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
                <thead>
                  <tr className="bg-[#ef1b2d] text-white">
                    {['STT', 'Mã TP', 'Tên TP', 'Số lượng', 'Trọng lượng'].map(label => (
                      <th key={label} className="px-3 py-2 font-black first:rounded-tl-lg last:rounded-tr-lg">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {savedProductSummary.map((row, index) => {
                    const item = itemOptions.find(option => normalizeMaterialCodeKey(option.code) === normalizeMaterialCodeKey(row.ma_sp));
                    const weightKg = convertWarehouseQuantityToKg({
                      quantity: Number(row.so_luong),
                      unit: item?.unit || '',
                      itemCode: row.ma_sp,
                      warehouseKind: 'san_pham',
                      products: weightCatalog
                    });
                    return (
                      <tr key={row.ma_sp} className="border-b border-zinc-100 even:bg-zinc-50/70">
                        <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                        <td className="px-3 py-2 font-bold text-zinc-800">{row.ma_sp}</td>
                        <td className="px-3 py-2">{row.ten_sp || item?.name || '—'}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{formatNumber(Number(row.so_luong) || 0)}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{formatWarehouseWeightKg(weightKg)}</td>
                      </tr>
                    );
                  })}
                  {!savedProductSummary.length ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">{loadingProductSummary ? 'Đang tải danh sách…' : productSummaryError || 'Chưa có sản phẩm đã quét cho phiếu này.'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : warehouseKind === 'san_pham' && productLineView === 'detail' ? (
            <div className="scrollbar-hidden -mx-0.5 overflow-x-auto">
              <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
                <thead>
                  <tr className="bg-[#ef1b2d] text-white">
                    {['STT', 'Mã gốc', 'Mã chi tiết', 'Tên sản phẩm', 'ĐVT', 'Số lượng'].map(label => (
                      <th key={label} className="px-3 py-2 font-black first:rounded-tl-lg last:rounded-tr-lg">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scannedProductDetails.map((detail, index) => (
                    <tr key={detail.key} className="border-b border-zinc-100 even:bg-zinc-50/70">
                      <td className="px-3 py-2 text-zinc-500">{index + 1}</td>
                      <td className="px-3 py-2 font-bold text-zinc-800">{detail.baseCode}</td>
                      <td className="px-3 py-2 font-mono font-bold text-[#ef1b2d]">{detail.fullCode}</td>
                      <td className="px-3 py-2">{detail.name || '—'}</td>
                      <td className="px-3 py-2">{detail.unit || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{detail.quantity}</td>
                    </tr>
                  ))}
                  {!scannedProductDetails.length ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">Quét mã QR để hiện từng mã chi tiết tại đây.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
          <div className="scrollbar-hidden -mx-0.5 overflow-x-auto">
            <div
              className={slipType === 'xuat' ? warehouseXuatHeaderGridClass : warehouseNhapHeaderGridClass}
            >
              <span className={`${warehouseLineHeaderClass} ${warehouseLineMobileHiddenClass} text-center`}>STT</span>
              <span className={warehouseLineHeaderClass}>
                <span className="md:hidden">{warehouseKind === 'san_pham' ? 'Mã TP *' : 'Mã NVL *'}</span>
                <span className="hidden md:inline">{warehouseItemCodeLabel(warehouseKind)} *</span>
              </span>
              <span className={warehouseLineHeaderClass}>{warehouseItemNameLabel(warehouseKind)}</span>
              <span className={`${warehouseLineHeaderClass} ${warehouseLineMobileHiddenClass}`}>ĐVT</span>
              {slipType === 'xuat' ? (
                <>
                  <span className={`${warehouseLineHeaderClass} ${warehouseLineMobileHiddenClass}`}>SL CT</span>
                  <span className={warehouseLineHeaderClass}>
                    <span className="md:hidden">Số lượng *</span>
                    <span className="hidden md:inline">SL THỰC *</span>
                  </span>
                </>
              ) : (
                <span className={warehouseLineHeaderClass}>Số lượng *</span>
              )}
              <span className={warehouseLineHeaderClass}>
                <span className="md:hidden">Trọng lượng</span>
                <span className="hidden md:inline">Quy đổi kg</span>
              </span>
              <span className={`${warehouseLineHeaderClass} ${warehouseLineMobileHiddenClass}`}>Giá</span>
              <span className={`${warehouseLineHeaderClass} ${warehouseLineMobileHiddenClass} text-right`}>Thành tiền</span>
              <span className={warehouseLineMobileHiddenClass} />
            </div>

            <div>
              {lines.map((line, index) => (
                <React.Fragment key={line.key}>
                  <div className={slipType === 'xuat' ? warehouseXuatLineGridClass : warehouseNhapLineGridClass}>
                  <div className={`hidden min-w-0 items-center justify-center text-xs font-bold text-zinc-500 md:flex`}>
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <SearchableSelect
                      value={line.code}
                      onChange={code => pickItem(line.key, code)}
                      options={itemOptions}
                      placeholder=""
                      emptyInputText=""
                      isLoading={isLoadingItems}
                      disabled={isLoadingItems}
                      inputClassName={warehouseLineFieldClass}
                      desktopAutoFlip
                      getLabel={item => {
                        const option = item as MaterialOption;
                        return `${option.code} · ${option.name}`;
                      }}
                      getValue={item => (item as MaterialOption).code}
                    />
                  </div>
                  <div className="min-w-0">
                    <input
                      value={line.name}
                      onChange={event => updateLine(line.key, { name: event.target.value })}
                      className={warehouseLineFieldClass}
                    />
                  </div>
                  <div className={`min-w-0 ${warehouseLineMobileHiddenClass}`}>
                    <input
                      value={line.unit}
                      onChange={event => updateLine(line.key, { unit: event.target.value })}
                      className={warehouseLineFieldClass}
                    />
                  </div>
                  {slipType === 'xuat' ? (
                    <>
                      <div className={`min-w-0 ${warehouseLineMobileHiddenClass}`}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.documentQuantity || ''}
                          onChange={event => updateLine(line.key, { documentQuantity: event.target.value })}
                          className={warehouseLineFieldClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={event => updateLine(line.key, { quantity: event.target.value })}
                          className={warehouseLineFieldClass}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={event => updateLine(line.key, { quantity: event.target.value })}
                        className={warehouseLineFieldClass}
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div
                      className={`${warehouseLineFieldClass} flex items-center whitespace-nowrap bg-emerald-50/60 font-mono font-bold text-emerald-800`}
                      title={resolveLineWeightHint(line)}
                    >
                      {(() => {
                        const weightKg = resolveLineWeightKg(line);
                        return weightKg === null ? '' : formatWarehouseWeightKg(weightKg);
                      })()}
                    </div>
                  </div>
                  <div className={`min-w-0 ${warehouseLineMobileHiddenClass}`}>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={line.unitPrice}
                        onChange={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                        onBlur={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                        className={`${warehouseLineFieldClass} pr-6 ${
                          isNvlExport && avgPriceLoadingCode === line.code.trim()
                            ? 'border-amber-300 bg-amber-50/70'
                            : isNvlExport && line.unitPrice.trim()
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : ''
                        }`}
                        title={
                          isNvlExport
                            ? `Gợi ý BQ nhập tháng ${formatAvgPriceMonthLabel(slipDate)} — có thể sửa`
                            : undefined
                        }
                      />
                      {isNvlExport && avgPriceLoadingCode === line.code.trim() ? (
                        <Loader2 className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-amber-600" />
                      ) : null}
                    </div>
                  </div>
                  <div className={`min-w-0 ${warehouseLineMobileHiddenClass}`}>
                    <div
                      className={`${warehouseLineFieldClass} flex items-center justify-end whitespace-nowrap bg-zinc-50 font-mono font-bold tabular-nums text-zinc-900`}
                    >
                      {formatWarehouseMoney(computeWarehouseLineAmount(line.quantity, line.unitPrice))}
                    </div>
                  </div>
                  {lines.length > 1 && canDelete ? (
                    <button
                      type="button"
                      onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                      className={`hidden h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 md:flex`}
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className={warehouseLineMobileHiddenClass} />
                  )}
                  </div>
                  {isNvlExport && !line.isScanned ? (
                    <div className="mb-2 grid grid-cols-1 justify-items-center gap-2 rounded-lg border border-red-100 bg-red-50/40 p-2 md:justify-items-start">
                      {([
                        {
                          type: 'weight' as const,
                          label: 'Ảnh số cân thực tế',
                          url: line.actualWeightImageUrl,
                          title: 'Ảnh số cân thực tế'
                        }
                      ]).map(image => {
                        const inputId = `warehouse-${image.type}-image-${line.key}`;
                        const isUploading = uploadingLineImageKey === `${line.key}-${image.type}`;
                        return (
                          <div key={image.type} className="w-full max-w-2xl min-w-0 space-y-1.5 md:max-w-none">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-zinc-600">
                                <ImagePlus className="h-3.5 w-3.5 text-[#ef1b2d]" />
                                {image.label} <span className="text-[#ef1b2d]">*</span>
                              </span>
                              {image.url ? (
                                <button
                                  type="button"
                                  onClick={() => setViewingSlipImage({ url: image.url!, title: `${image.title} · ${line.code}` })}
                                  className="text-[10px] font-bold text-[#ef1b2d] underline"
                                >
                                  Xem ảnh
                                </button>
                              ) : null}
                            </div>
                            <input
                              id={inputId}
                              {...CAMERA_IMAGE_INPUT_PROPS}
                              disabled={isUploading || isSaving}
                              className="hidden"
                              onChange={event => {
                                const file = event.target.files?.[0] || null;
                                event.target.value = '';
                                if (file) void handleLineActualImageUpload(line.key, file);
                              }}
                            />
                            <label
                              htmlFor={inputId}
                              className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-[#ef1b2d] hover:bg-red-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                            >
                              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                              {isUploading ? 'Đang tải ảnh...' : image.url ? 'Chụp lại' : 'Chụp ảnh'}
                            </label>
                            {image.url ? (
                              <WeighingImageThumbnail
                                url={image.url}
                                alt={`${image.title} của ${line.code}`}
                                title={`${image.title} · ${line.code}`}
                                onView={() => setViewingSlipImage({ url: image.url!, title: `${image.title} · ${line.code}` })}
                                className="block h-20 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                              />
                            ) : (
                              <p className="text-[10px] font-semibold text-zinc-500">Bắt buộc chụp trước khi lưu phiếu.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] font-semibold text-zinc-500">
            Phiếu chỉ cập nhật tồn kho sau khi bấm nút lưu.
          </p>
          <>
            {(editSlipCode ? canEdit : canCreate) ? (
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={isSaving}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-5 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? (editSlipCode ? 'Đang cập nhật...' : 'Đang lưu...') : editSlipCode ? 'Cập nhật phiếu' : 'Lưu phiếu'}
            </button>
            ) : null}
            <button
              type="button"
              onClick={handlePrintSavedSlip}
              disabled={isSaving || !printSlip}
              className="hidden h-11 items-center gap-1.5 rounded-xl border border-[#ef1b2d] bg-white px-5 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
            >
              <Printer className="h-4 w-4" />
              In phiếu
            </button>
          </>
        </div>
      </section>
        </>
      ) : null}

      {showProductExportTabs && productExportView === 'thuc-hien' ? (
        <>
          {actionMessage ? (
            <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <ClipboardCheck className="h-4 w-4 shrink-0" />
              {actionMessage}
            </div>
          ) : null}
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-black text-zinc-900">Thông tin phiếu {slipType === 'nhap' ? 'nhập' : 'xuất'}</h2>
              {(editSlipCode ? canEdit : canCreate) ? (
                <button
                  type="button"
                  onClick={() => void handleSaveScannedProductBatch()}
                  disabled={isSaving || pendingScannedProductDetails.length === 0}
                  className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-sm font-bold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-auto sm:text-xs"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Đang lưu...' : 'Lưu đợt'}
                </button>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-zinc-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-2.5">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-zinc-900">Danh sách mã sản phẩm</h2>
                <p className="mt-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-lg font-black leading-tight text-black sm:w-fit">
                  SL mã QR đã quét: {scannedItemCount}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => { setScannerMode('hardware-v2'); setQrScannerOpen(true); }}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <ScanBarcode className="h-4 w-4" /> Quét máy
                </button>
                <button
                  type="button"
                  onClick={() => { setScannerMode('camera'); setQrScannerOpen(true); }}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-white px-3 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-50"
                >
                  <ScanBarcode className="h-4 w-4" /> Quét ĐT
                </button>
              </div>
            </div>
            {pendingScannedProductDetails.length ? (
              <div className="space-y-3 p-3">
                {pendingScannedProductDetails.map((detail, index) => {
                  const weightKg = convertWarehouseQuantityToKg({
                    quantity: 1,
                    unit: detail.unit,
                    itemCode: detail.baseCode,
                    warehouseKind: 'san_pham',
                    products: weightCatalog
                  });
                  const fieldClass = 'min-h-11 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800';
                  return (
                    <article key={detail.key} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Mã quét #{index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeScannedProduct(detail.fullCode)}
                          disabled={isSaving}
                          aria-label={`Xóa mã quét ${detail.fullCode}`}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className={`${fieldClass} break-all font-mono text-base font-black`} title={detail.fullCode}>{detail.fullCode}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          Mã TP gốc<div className={fieldClass}>{detail.baseCode}</div>
                        </label>
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          ĐV<div className={fieldClass}>{detail.unit || '—'}</div>
                        </label>
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          Số lượng<div className={fieldClass}>{detail.quantity}</div>
                        </label>
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          Trọng lượng<div className={fieldClass}>{weightKg == null ? '—' : formatWarehouseWeightKg(weightKg)}</div>
                        </label>
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          Kho<div className={`${fieldClass} truncate`}>{warehouseName}</div>
                        </label>
                        <label className="min-w-0 space-y-1 text-[11px] font-bold text-zinc-500">
                          Tên TP<div className={`${fieldClass} truncate`}>{detail.name || '—'}</div>
                        </label>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-xs font-semibold text-zinc-500">
                {scannedProductDetails.length
                  ? 'Các mã trong đợt đã được lưu. Quét tiếp mã mới nếu cần.'
                  : isEditingProductInbound
                    ? 'Quét thêm mã mới tại đây. Các mã QR đã lưu xem trong tab Chi tiết.'
                    : 'Quét mã QR để xem danh sách sản phẩm trong đợt. Mã chỉ được lưu vào kho khi bấm Lưu đợt.'}
              </div>
            )}
          </section>
        </>
      ) : null}

      {showProductExportTabs && productExportView === 'chi-tiet' ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 p-3 text-sm font-black text-zinc-900">
              Danh sách sản phẩm đã quét <span className="ml-1 rounded-full bg-zinc-100 px-2 py-1 text-xs">{productDetailTotal} mã</span>
            </div>
            <div className="scrollbar-hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain touch-pan-x">
              <table className="w-max min-w-full table-auto whitespace-nowrap text-left text-xs sm:text-sm">
                <thead className="bg-[#ef1b2d] text-white">
                  <tr>
                    <th className="px-3 py-2">STT</th>
                    <th className="px-3 py-2">Mã TP gốc</th>
                    <th className="px-3 py-2">Mã quét</th>
                    <th className="px-3 py-2">Tên TP</th>
                    <th className="px-3 py-2">ĐV</th>
                    <th className="px-3 py-2">Kho</th>
                    <th className="px-3 py-2">Thời điểm lưu</th>
                  </tr>
                </thead>
                <tbody>
                  {productDetailRows.map((detail, index) => (
                    <tr key={detail.key} className="border-b border-zinc-100 even:bg-zinc-50">
                      <td className="px-3 py-2 text-black">{(savedProductScanPage - 1) * savedProductScanPageSize + index + 1}</td>
                      <td className="px-3 py-2 font-extrabold text-black">{detail.baseCode}</td>
                      <td className="px-3 py-2 font-mono font-extrabold text-black">{detail.fullCode}</td>
                      <td className="px-3 py-2 text-black">{detail.name || '—'}</td>
                      <td className="px-3 py-2 text-black">{detail.unit || '—'}</td>
                      <td className="px-3 py-2 text-black">{warehouseName || '—'}</td>
                      <td className="px-3 py-2 text-black">{formatWarehouseSavedAt(detail.savedAt)}</td>
                    </tr>
                  ))}
                  {!productDetailRows.length ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center font-semibold text-black">{loadingSavedProductScans ? 'Đang tải danh sách…' : savedProductScanError || 'Chưa có mã QR nào được quét.'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {productDetailTotal > 0 ? (
              <TablePagination
                totalRecords={productDetailTotal}
                currentPage={savedProductScanPage}
                totalPages={Math.max(1, Math.ceil(productDetailTotal / savedProductScanPageSize))}
                pageSize={savedProductScanPageSize}
                onPageChange={setSavedProductScanPage}
                onPageSizeChange={size => { setSavedProductScanPageSize(size); setSavedProductScanPage(1); }}
              />
            ) : null}
          </section>
        </>
      ) : null}
        </>
      ) : null}

      <WarehouseSlipPrintModal
        open={printModalOpen}
        data={printSlip}
        autoPrint={printAutoTrigger}
        onClose={() => {
          setPrintModalOpen(false);
          setPrintSlip(null);
          setPrintAutoTrigger(false);
          if (pendingQrLabels.length > 0) {
            setQrPrintOpen(true);
            setQrPrintAutoTrigger(true);
          }
        }}
        onAfterPrint={pendingQrLabels.length > 0 ? () => {
          setPrintModalOpen(false);
          setPrintSlip(null);
          setPrintAutoTrigger(false);
          setQrPrintOpen(true);
          setQrPrintAutoTrigger(true);
        } : undefined}
      />

      <ProductQrPrintModal
        open={qrPrintOpen}
        labels={pendingQrLabels}
        autoPrint={qrPrintAutoTrigger}
        trackProductPrint={warehouseKind === 'san_pham'}
        trackMaterialPrint={warehouseKind === 'nvl'}
        showPayload={false}
        title={warehouseKind === 'nvl' ? 'Mã QR NVL nhập kho' : warehouseKind === 'hang_hoa' ? 'Mã QR hàng hóa nhập kho' : undefined}
        description={
          warehouseKind === 'nvl'
            ? `${pendingQrLabels.length} tem · mỗi tem là một đơn vị NVL đã lưu trong CSDL`
            : warehouseKind === 'hang_hoa'
              ? `${pendingQrLabels.length} tem · mỗi tem là một đơn vị hàng hóa`
              : undefined
        }
        onClose={() => {
          setQrPrintOpen(false);
          setQrPrintAutoTrigger(false);
          setPendingQrLabels([]);
        }}
      />

      <ProductQrScanner
        open={qrScannerOpen}
        onClose={() => setQrScannerOpen(false)}
        onScan={addLineFromScan}
        hardwareOnly={scannerMode !== 'camera'}
        hardwareV2={scannerMode === 'hardware-v2'}
        closeAfterScan={false}
        requireConfirm={false}
        scannedCount={scannedItemCount}
      />

      <WeighingImagePreviewModal image={viewingSlipImage} onClose={() => setViewingSlipImage(null)} />
    </div>
  );
}

export function WarehouseHistoryPanel({
  onBack,
  onOpenSlip,
  initialFilters,
  initialWarehouseTab = 'nvl',
  standaloneSlipCode
}: {
  onBack: () => void;
  onOpenSlip: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
  initialWarehouseTab?: WarehouseKind;
  /** Khi có: chỉ hiển thị chi tiết đúng 1 phiếu (trang mở ở tab mới), ẩn bộ lọc & danh sách. */
  standaloneSlipCode?: string;
}) {
  const isStandalone = Boolean(standaloneSlipCode);
  const warehouseAccess = useWarehouseSlipAccess();
  const accessibleWarehouseTabs = WAREHOUSE_HISTORY_TABS.filter(([kind]) =>
    pickWarehouseSlipAccess(warehouseAccess, kind).canView
  );
  const [warehouseTab, setWarehouseTab] = useState<WarehouseKind>(() =>
    accessibleWarehouseTabs.some(([kind]) => kind === initialWarehouseTab)
      ? initialWarehouseTab
      : accessibleWarehouseTabs[0]?.[0] ?? initialWarehouseTab
  );
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseHistoryOption[]>([]);
  const [selectedWarehouseName, setSelectedWarehouseName] = useState('');
  const { canView, canCreate, canEdit, canDelete } = pickWarehouseSlipAccess(warehouseAccess, warehouseTab);
  const [movements, setMovements] = useState<WarehouseMovementRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<WarehouseSlipType>('xuat');
  const [fromDate, setFromDate] = useState(() => initialFilters?.dateFrom?.trim() || '');
  const [toDate, setToDate] = useState(() => initialFilters?.dateTo?.trim() || '');
  const [filterShift, setFilterShift] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewingSlipCode, setViewingSlipCode] = useState<string | null>(null);
  const [deletingSlipCode, setDeletingSlipCode] = useState<string | null>(null);
  const [selectedSlipCodes, setSelectedSlipCodes] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [historyPrintSlips, setHistoryPrintSlips] = useState<WarehouseSlipPrintData[]>([]);
  const [historyPrintOpen, setHistoryPrintOpen] = useState(false);
  const [historyPrintAutoTrigger, setHistoryPrintAutoTrigger] = useState(false);
  const [historyQrLabels, setHistoryQrLabels] = useState<ProductQrPrintLabel[]>([]);
  const [historyQrPrintOpen, setHistoryQrPrintOpen] = useState(false);
  const [historyQrTrackMaterial, setHistoryQrTrackMaterial] = useState(false);
  const [isLoadingHistoryQr, setIsLoadingHistoryQr] = useState(false);
  const [historyQrError, setHistoryQrError] = useState('');
  const [viewingHistoryImage, setViewingHistoryImage] = useState<WeighingPreviewImage | null>(null);
  const [weightCatalogMaterials, setWeightCatalogMaterials] = useState<WarehouseWeightCatalogItem[]>([]);
  const [weightCatalogProducts, setWeightCatalogProducts] = useState<WarehouseWeightCatalogItem[]>([]);

  const loadWeightCatalog = async () => {
    try {
      const [materialRes, productRes] = await Promise.all([fetch('/api/kho-nvl'), fetch('/api/san-pham?format=table')]);
      const materialData = await materialRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));

      if (materialRes.ok) {
        setWeightCatalogMaterials(normalizeMaterialsInventory(materialData).map(mapMaterialToWeightCatalogItem));
      } else {
        setWeightCatalogMaterials([]);
      }

      if (productRes.ok) {
        setWeightCatalogProducts(normalizeProducts(productData).map(mapProductToWeightCatalogItem));
      } else {
        setWeightCatalogProducts([]);
      }
    } catch {
      setWeightCatalogMaterials([]);
      setWeightCatalogProducts([]);
    }
  };

  const resolveWarehouseRowWeightKg = (row: WarehouseMovementRow) =>
    convertWarehouseQuantityToKg({
      quantity: row.quantity,
      unit: row.unit,
      itemCode: row.itemCode,
      warehouseKind: row.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
      materials: weightCatalogMaterials,
      products: weightCatalogProducts,
      preferTongKgOnly: true
    });

  useEffect(() => {
    void loadWeightCatalog();
  }, []);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/quan-ly-kho');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const records: Array<{ ten_kho?: string }> = Array.isArray(data?.records) ? data.records : [];
        const allowedKinds = new Set(accessibleWarehouseTabs.map(([kind]) => kind));
        const options = Array.from(
          new Set(records.map(record => String(record.ten_kho ?? '').trim()).filter(Boolean))
        )
          .map(name => ({ name, kind: inferWarehouseKindFromName(name) }))
          .filter(option => allowedKinds.has(option.kind))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        setWarehouseOptions(options);
        const initialOption = options.find(option => option.kind === initialWarehouseTab) || options[0];
        if (initialOption) {
          setSelectedWarehouseName(initialOption.name);
          setWarehouseTab(initialOption.kind);
        }
      } catch {
        setWarehouseOptions([]);
      }
    };
    void loadWarehouses();
  }, [warehouseAccess.vatTu.canView, warehouseAccess.thanhPham.canView]);

  useEffect(() => {
    if (canView) return;
    const firstAllowed = accessibleWarehouseTabs[0]?.[0];
    if (firstAllowed && firstAllowed !== warehouseTab) setWarehouseTab(firstAllowed);
  }, [canView, warehouseTab, warehouseAccess.vatTu.canView, warehouseAccess.thanhPham.canView]);

  const loadMovements = async () => {
    if (!canView) {
      setMovements([]);
      setIsLoading(false);
      setError('Bạn không có quyền xem dữ liệu kho này.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (standaloneSlipCode) {
        params.set('ma_phieu', standaloneSlipCode);
        params.set('treo', 'all');
      } else {
        params.set('loai_kho', warehouseTab);
        params.set('loai', selectedType);
        if (selectedWarehouseName) params.set('ten_kho', selectedWarehouseName);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      }

      const [res, orderRes] = await Promise.all([
        fetch(`/api/kho/lich-su?${params.toString()}`),
        fetch('/api/lenh-sx')
      ]);
      const [data, orderData] = await Promise.all([
        res.json().catch(() => ({})),
        orderRes.json().catch(() => ({}))
      ]);

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải lịch sử xuất nhập kho.');
      }

      const orderMachineByCode = new Map(
        (orderRes.ok ? normalizeWarehouseProductionOrders(orderData) : [])
          .map(order => [order.orderCode.trim().toUpperCase(), order.machine] as const)
      );
      const rows = normalizeWarehouseMovements(data)
        .filter(row => (
          standaloneSlipCode
            ? row.slipCode === standaloneSlipCode
            : row.warehouseKind === warehouseTab && (!selectedWarehouseName || row.warehouseName === selectedWarehouseName)
        ))
        .map(row => {
          if (row.machine) return row;
          const linkedCodes = extractLinkedProductionOrderCodes(row.reason, row.note);
          const machines = [...new Set(
            linkedCodes.map(code => orderMachineByCode.get(code.trim().toUpperCase()) || '').filter(Boolean)
          )];
          return machines.length > 0 ? { ...row, machine: machines.join(', ') } : row;
        });
      setMovements(rows);
      if (standaloneSlipCode && rows[0]) {
        setViewingSlipCode(standaloneSlipCode);
        if (rows[0].warehouseKind !== warehouseTab) setWarehouseTab(rows[0].warehouseKind);
        if (rows[0].slipType !== selectedType) setSelectedType(rows[0].slipType);
      }
    } catch (loadError: any) {
      setMovements([]);
      setError(loadError.message || 'Không thể tải lịch sử xuất nhập kho.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setViewingSlipCode(null);
    setSelectedSlipCodes(new Set());
    loadMovements();
  }, [warehouseTab, selectedWarehouseName, selectedType, fromDate, toDate]);

  const isFinishedGoodsHistory = warehouseTab === 'san_pham';
  const hasActiveFilters = Boolean(fromDate) || Boolean(toDate) || Boolean(filterShift) || Boolean(searchText);

  const resetFilters = () => {
    setFromDate('');
    setToDate('');
    setFilterShift('');
    setSearchText('');
  };

  const shiftOptions = useMemo(() => {
    const shifts = new Set<string>();
    for (const row of movements) {
      const raw = String(row.shift || '').trim();
      if (!raw) continue;
      raw.split(',').forEach(part => {
        const shift = part.trim();
        if (shift) shifts.add(shift);
      });
    }
    return [...shifts].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [movements]);

  const movementMatchesShiftFilter = (rowShift: string | undefined, shiftFilter: string) => {
    if (!shiftFilter) return true;
    const raw = String(rowShift || '').trim();
    if (!raw) return false;
    return raw
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .some(part => shiftNamesMatch(part, shiftFilter));
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMovements = useMemo(() => {
    return movements.filter(row => {
      if (!movementMatchesShiftFilter(row.shift, filterShift)) return false;
      if (!normalizedSearch) return true;
      return `${row.slipCode} ${row.shift} ${row.machine} ${row.itemCode} ${row.itemName} ${row.reason} ${row.createdBy}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [movements, filterShift, normalizedSearch]);

  useEffect(() => {
    setSelectedSlipCodes(new Set());
  }, [normalizedSearch, filterShift]);

  const slipGroups = useMemo(() => {
    const map = new Map<string, WarehouseMovementRow[]>();
    filteredMovements.forEach(row => {
      const key = row.slipCode || row.id;
      const current = map.get(key) || [];
      current.push(row);
      map.set(key, current);
    });
    return [...map.entries()]
      .map(([slipCode, rows]) => ({
        slipCode,
        rows,
        header: rows[0],
        createdAt: rows.find(row => row.slipCreatedAt)?.slipCreatedAt || rows.reduce(
          (latest, row) => row.createdAt.localeCompare(latest) > 0 ? row.createdAt : latest,
          ''
        ),
        totalAmount: rows.reduce((sum, row) => sum + row.lineAmount, 0)
      }))
      .sort((a, b) => {
        const byCreated = b.createdAt.localeCompare(a.createdAt);
        if (byCreated !== 0) return byCreated;
        return (b.slipCode || '').localeCompare(a.slipCode || '', 'vi');
      });
  }, [filteredMovements]);

  const slipDateGroups = useMemo(() => {
    const map = new Map<string, typeof slipGroups>();
    slipGroups.forEach(group => {
      const key = group.header.slipDate || '—';
      const current = map.get(key) || [];
      current.push(group);
      map.set(key, current);
    });
    return [...map.entries()]
      .map(([slipDate, groups]) => ({
        slipDate,
        groups,
        totalAmount: groups.reduce((sum, group) => sum + group.totalAmount, 0)
      }))
      .sort((a, b) => b.slipDate.localeCompare(a.slipDate));
  }, [slipGroups]);

  const selectableSlips = useMemo(
    () => slipGroups.filter(group => group.slipCode && group.rows.some(row => row.id)),
    [slipGroups]
  );
  const allSelected =
    selectableSlips.length > 0 && selectableSlips.every(group => selectedSlipCodes.has(group.slipCode));
  const selectedCount = selectedSlipCodes.size;

  const toggleSlipSelection = (slipCode: string) => {
    setSelectedSlipCodes(prev => {
      const next = new Set(prev);
      if (next.has(slipCode)) next.delete(slipCode);
      else next.add(slipCode);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedSlipCodes(
      allSelected ? new Set() : new Set(selectableSlips.map(group => group.slipCode))
    );
  };

  const viewingRows = useMemo(() => {
    if (!viewingSlipCode) return [];
    const rows = filteredMovements.filter(row => row.slipCode === viewingSlipCode);
    if (rows[0]?.warehouseKind === 'san_pham') {
      const byProduct = new Map<string, WarehouseMovementRow>();
      const productUnitByCode = new Map(
        weightCatalogProducts.map(product => [normalizeMaterialCodeKey(product.code), product.unit] as const)
      );
      const groupedRows: WarehouseMovementRow[] = [];
      for (const row of rows) {
        const itemCode = warehouseCodePrefix(row.itemCode);
        const key = normalizeMaterialCodeKey(itemCode);
        const catalogUnit = productUnitByCode.get(key);
        const unit = row.unit && row.unit !== '-' ? row.unit : catalogUnit || '-';
        const existing = key ? byProduct.get(key) : undefined;
        if (existing) {
          if ((!existing.unit || existing.unit === '-') && unit !== '-') existing.unit = unit;
          existing.quantity += row.quantity;
          existing.lineAmount += row.lineAmount;
          if (existing.documentQuantity !== undefined || row.documentQuantity !== undefined) {
            existing.documentQuantity = (existing.documentQuantity || 0) + (row.documentQuantity || 0);
          }
          if (existing.quantity > 0) existing.unitPrice = existing.lineAmount / existing.quantity;
          continue;
        }

        const grouped = { ...row, itemCode, unit };
        groupedRows.push(grouped);
        if (key) byProduct.set(key, grouped);
      }
      return sortWarehouseLinesKgFirst(groupedRows, { getWeightKg: resolveWarehouseRowWeightKg });
    }
    return sortWarehouseLinesKgFirst(
      rows,
      { getWeightKg: resolveWarehouseRowWeightKg }
    );
  }, [viewingSlipCode, filteredMovements, weightCatalogMaterials, weightCatalogProducts]);

  const viewingSlipTotal = useMemo(
    () => viewingRows.reduce((sum, row) => sum + row.lineAmount, 0),
    [viewingRows]
  );

  const viewingSlipTotalWeightKg = useMemo(() => {
    let total = 0;
    let hasWeight = false;
    for (const row of viewingRows) {
      const weight = convertWarehouseQuantityToKg({
        quantity: row.quantity,
        unit: row.unit,
        itemCode: row.itemCode,
        warehouseKind: row.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
        materials: weightCatalogMaterials,
        products: weightCatalogProducts,
        preferTongKgOnly: true
      });
      if (weight !== null) {
        total += weight;
        hasWeight = true;
      }
    }
    return hasWeight ? total : 0;
  }, [viewingRows, weightCatalogMaterials, weightCatalogProducts]);

  const viewingSlipTotalRolls = useMemo(
    () => sumWarehouseRollQuantity(viewingRows),
    [viewingRows]
  );

  const buildHistoryPrintSlip = (slipCode: string): WarehouseSlipPrintData | null => {
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const header = rows[0];
    if (!header) return null;

    const totalAmount = rows.reduce((sum, row) => sum + row.lineAmount, 0);
    const rawLines = rows.map(row => ({
      code: row.itemCode,
      name: row.itemName,
      unit: row.unit,
      quantity: row.quantity,
      documentQuantity: row.documentQuantity ?? null,
      unitPrice: row.unitPrice,
      lineAmount: row.lineAmount,
      weightKg: resolveWarehouseRowWeightKg(row),
      sourceInboundSlipCode: row.sourceInboundSlipCode
    }));
    const lines =
      header.slipType === 'xuat' && header.warehouseKind !== 'san_pham'
        ? sortWarehouseLinesKgFirst(mergeWarehousePrintLines(rawLines), {
            getWeightKg: line => line.weightKg ?? null
          })
        : sortWarehouseLinesKgFirst(rawLines, {
            getWeightKg: line => line.weightKg ?? null
          });
    return {
      slipCode,
      slipType: header.slipType === 'xuat' ? 'xuat' : 'nhap',
      warehouseKind: header.warehouseKind,
      slipDate: header.slipDate,
      shift: header.shift,
      machine: header.machine,
      reason: header.reason,
      note: header.note,
      createdBy: header.createdBy,
      warehouseName: header.warehouseName,
      totalAmount: lines.reduce((sum, line) => sum + line.lineAmount, 0),
      lines
    };
  };

  const markSlipsPrinted = (slipCodes: string[]) => {
    const codes = [...new Set(slipCodes.filter(Boolean))];
    if (codes.length === 0) return;
    setMovements(prev => prev.map(row => (codes.includes(row.slipCode) ? { ...row, daIn: true } : row)));
    codes.forEach(code => {
      fetch(`/api/phieu-xuat-nhap-kho/${encodeURIComponent(code)}/danh-dau-da-in`, { method: 'POST' }).catch(() => {});
    });
  };

  const handlePrintSlipByCode = (slipCode: string, autoPrint = false) => {
    if (autoPrint) {
      const alreadyPrinted = movements.some(row => row.slipCode === slipCode && row.daIn);
      if (!alreadyPrinted) {
        if (!window.confirm('In phiếu sẽ khóa việc sửa phiếu này. Bạn có chắc chắn muốn in?')) {
          return;
        }
        markSlipsPrinted([slipCode]);
      }
    }
    const slip = buildHistoryPrintSlip(slipCode);
    if (!slip) return;
    setHistoryPrintSlips([slip]);
    setHistoryPrintAutoTrigger(autoPrint);
    setHistoryPrintOpen(true);
  };

  const handlePrintSelectedSlips = (autoPrint = true) => {
    const slips = slipGroups
      .filter(group => selectedSlipCodes.has(group.slipCode))
      .map(group => buildHistoryPrintSlip(group.slipCode))
      .filter((slip): slip is WarehouseSlipPrintData => Boolean(slip));
    if (slips.length === 0) {
      setError('Vui lòng tích chọn ít nhất một phiếu để in gộp.');
      return;
    }

    if (autoPrint) {
      const unprintedCodes = slips
        .map(slip => slip.slipCode)
        .filter(code => !movements.some(row => row.slipCode === code && row.daIn));
      if (unprintedCodes.length > 0) {
        if (!window.confirm('In phiếu sẽ khóa việc sửa các phiếu này. Bạn có chắc chắn muốn in?')) {
          return;
        }
        markSlipsPrinted(unprintedCodes);
      }
    }

    // Mọi phiếu xuất/nhập khi in gộp → 1 bảng; trùng mã (+ ĐVT) thì cộng SL.
    const printSlips = slips.length > 1 ? [mergeWarehousePrintSlips(slips)] : slips;

    setError('');
    setHistoryPrintSlips(printSlips);
    setHistoryPrintAutoTrigger(autoPrint);
    setHistoryPrintOpen(true);
  };

  const handlePrintViewingSlip = (autoPrint = false) => {
    if (!viewingSlipCode) return;
    handlePrintSlipByCode(viewingSlipCode, autoPrint);
  };

  const handlePrintViewingQrCodes = async () => {
    if (!viewingSlipCode || !viewingRows[0]) return;
    setIsLoadingHistoryQr(true);
    setHistoryQrError('');
    try {
      const response = await fetch(
        `/api/phieu-xuat-nhap-kho/${encodeURIComponent(viewingSlipCode)}/ma-qr`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể tải mã QR của phiếu nhập.');
      const records: Array<Record<string, unknown>> = Array.isArray(data.records) ? data.records : [];
      const labels = records.map((record, index) => {
        const payload = String(record.ma_qr ?? record.ma_sp_day_du ?? '').trim();
        const productCode = String(record.ma_npl_goc ?? record.ma_sp_goc ?? '').trim();
        const movement = viewingRows.find(row => row.itemCode === payload)
          || viewingRows.find(row => row.itemCode.startsWith(`${productCode}_`));
        return {
          key: `${viewingSlipCode}-${index}-${payload}`,
          payload,
          productCode,
          productName: movement?.itemName || String(record.ten_npl ?? record.ten_sp ?? '').trim(),
          itemLabel: viewingRows[0].warehouseKind === 'nvl' ? 'Tên NVL' : undefined,
          unit: movement?.unit && movement.unit !== '-' ? movement.unit : undefined
        };
      }).filter(label => Boolean(label.payload));
      if (labels.length === 0) throw new Error('Phiếu nhập này chưa có mã QR chi tiết để in.');
      setHistoryQrLabels(labels);
      setHistoryQrTrackMaterial(viewingRows[0].warehouseKind === 'nvl');
      setHistoryQrPrintOpen(true);
    } catch (reason: unknown) {
      setHistoryQrError(reason instanceof Error ? reason.message : 'Không thể tải mã QR của phiếu nhập.');
    } finally {
      setIsLoadingHistoryQr(false);
    }
  };

  const openSlipDetail = (slipCode: string) => {
    if (!slipCode) return;
    // Điện thoại: mở popup như cũ. Máy tính: mở trang chi tiết ở tab mới.
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      setViewingSlipCode(slipCode);
      return;
    }
    window.open(
      `/lich-su-xuat-nhap-kho/phieu?ma_phieu=${encodeURIComponent(slipCode)}`,
      '_blank',
      'noopener'
    );
  };

  const handleEditSlip = (slipCode: string) => {
    if (!canEdit) {
      setError('Bạn không có quyền sửa phiếu thuộc kho này.');
      return;
    }
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    if (rows.some(row => row.slipType === 'xuat')) {
      setError('Phiếu xuất kho không thể sửa.');
      return;
    }
    if (rows.some(row => row.daIn)) {
      setError('Phiếu đã in, không thể sửa nữa.');
      return;
    }
    const productUnitByCode = new Map(
      weightCatalogProducts.map(product => [normalizeMaterialCodeKey(product.code), product.unit] as const)
    );
    const rowsWithCatalogUnits = rows[0]?.warehouseKind === 'san_pham'
      ? rows.map(row => ({
          ...row,
          unit: row.unit && row.unit !== '-'
            ? row.unit
            : productUnitByCode.get(normalizeMaterialCodeKey(warehouseCodePrefix(row.itemCode))) || row.unit
        }))
      : rows;
    const draft = buildWarehouseSlipDraftFromHistoryRows(rowsWithCatalogUnits, slipCode);
    if (!draft) return;

    localStorage.setItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY, JSON.stringify({ ...draft, createdAt: Date.now() }));
    setViewingSlipCode(null);
    onOpenSlip();
  };

  const handleDeleteSlip = async (slipCode: string, lineCount: number) => {
    if (!canDelete) {
      setError('Bạn không có quyền xóa phiếu thuộc kho này.');
      return;
    }
    if (!slipCode) return;
    if (!window.confirm(`Xóa toàn bộ phiếu ${slipCode} (${lineCount} dòng)?`)) return;

    setDeletingSlipCode(slipCode);
    setError('');
    try {
      const res = await fetch(`/api/kho/phieu/${encodeURIComponent(slipCode)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa phiếu.');
      setSelectedSlipCodes(prev => {
        const next = new Set(prev);
        next.delete(slipCode);
        return next;
      });
      if (viewingSlipCode === slipCode) setViewingSlipCode(null);
      await loadMovements();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa phiếu.');
    } finally {
      setDeletingSlipCode(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!canDelete) {
      setError('Bạn không có quyền xóa phiếu thuộc kho này.');
      return;
    }
    if (selectedCount === 0) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedCount} phiếu đã chọn?`)) return;

    setIsBulkDeleting(true);
    setError('');
    try {
      for (const slipCode of selectedSlipCodes) {
        const res = await fetch(`/api/kho/phieu/${encodeURIComponent(slipCode)}`, {
          method: 'DELETE'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể xóa phiếu.');
      }
      if (viewingSlipCode && selectedSlipCodes.has(viewingSlipCode)) {
        setViewingSlipCode(null);
      }
      setSelectedSlipCodes(new Set());
      await loadMovements();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa các phiếu đã chọn.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      {!isStandalone && (
      <>
      <nav
        aria-label="Loại phiếu xuất nhập kho"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2"
      >
        {WAREHOUSE_HISTORY_SLIP_TYPE_TABS.map(tab => {
          const isActive = selectedType === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setSelectedType(tab.key)}
              className={`group flex min-h-[56px] min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-left transition sm:min-h-[64px] sm:justify-start sm:gap-3 sm:px-4 ${
                isActive
                  ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
                  isActive ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                <tab.Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black leading-tight text-zinc-900">{tab.label}</span>
                <span className="mt-0.5 hidden text-xs font-semibold text-zinc-500 sm:block">{tab.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <FilterCombobox
            label="Chọn kho"
            options={warehouseOptions.map(option => option.name)}
            value={selectedWarehouseName || 'all'}
            onChange={value => {
              const option = warehouseOptions.find(item => item.name === value);
              if (!option) return;
              setSelectedWarehouseName(option.name);
              setWarehouseTab(option.kind);
            }}
            searchPlaceholder="Tìm kho..."
            includeAll={false}
            matchButtonWidth
            dropdownWidth="min-w-0 max-w-none"
          />
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={onOpenSlip}
            className="flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Lập phiếu
          </button>
        ) : null}
      </div>

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={error}
        actionMessage={message}
      >
        <div className="flex w-full min-w-0 items-center gap-3 lg:contents">
          <TableSearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder={
              warehouseTab === 'san_pham'
                ? 'Tìm mã phiếu, SP, lý do...'
                : warehouseTab === 'hang_hong'
                  ? 'Tìm mã phiếu, hàng hỏng, máy...'
                : warehouseTab === 'hang_hoa'
                  ? 'Tìm mã phiếu, hàng hóa, lý do...'
                : warehouseTab === 'cong_cu_dung_cu'
                  ? 'Tìm mã phiếu, công cụ dụng cụ...'
                : warehouseTab === 'gia_cong'
                  ? 'Tìm mã phiếu, hàng gia công...'
                : warehouseTab === 'tai_che'
                  ? 'Tìm mã phiếu, NPL tái chế, lý do...'
                  : 'Tìm mã phiếu, NPL, lý do...'
            }
            disabled={isLoading}
            fullWidthOnMobile={false}
          />
          <FilterCombobox
            label="Ca"
            options={shiftOptions}
            value={filterShift || 'all'}
            onChange={value => setFilterShift(value === 'all' ? '' : value)}
            searchPlaceholder="Tìm ca..."
            compact
          />
        </div>

        <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} className="w-full shrink-0 sm:w-auto" />
        <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} className="w-full shrink-0 sm:w-auto" />
      </TableToolbar>

      {selectableSlips.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-zinc-900/10 bg-zinc-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-zinc-600">
            {selectedCount > 0
              ? `Đã chọn ${selectedCount} phiếu`
              : 'Tích chọn phiếu để in gộp' + (canDelete ? ' hoặc xóa nhiều' : '')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
              onClick={() => handlePrintSelectedSlips(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#ef1b2d]/30 bg-red-50 px-3 py-1.5 text-xs font-black text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              In gộp{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
            {canDelete ? (
              <button
                type="button"
                disabled={selectedCount === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
                onClick={() => void handleBulkDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Xóa đã chọn{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            ) : null}
          </div>
        </section>
      )}

      {isLoading ? (
        <TableShell minWidthClassName={isFinishedGoodsHistory ? 'min-w-[700px]' : 'min-w-[900px]'}>
          <TableHead>
            <TableHeadCell className="w-10" align="center">
              {' '}
            </TableHeadCell>
            <TableHeadCell>Mã phiếu</TableHeadCell>
            <TableHeadCell>{selectedType === 'xuat' ? 'Giờ xuất' : 'Giờ nhập'}</TableHeadCell>
            {!isFinishedGoodsHistory ? <TableHeadCell>Ca</TableHeadCell> : null}
            {!isFinishedGoodsHistory ? <TableHeadCell>Máy</TableHeadCell> : null}
            <TableHeadCell>Người lập</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            <TableEmptyRow colSpan={isFinishedGoodsHistory ? 5 : 7}>Đang tải Supabase...</TableEmptyRow>
          </TableBody>
        </TableShell>
      ) : slipDateGroups.length === 0 ? (
        <TableShell minWidthClassName={isFinishedGoodsHistory ? 'min-w-[700px]' : 'min-w-[900px]'}>
          <TableHead>
            <TableHeadCell className="w-10" align="center">
              {' '}
            </TableHeadCell>
            <TableHeadCell>Mã phiếu</TableHeadCell>
            <TableHeadCell>{selectedType === 'xuat' ? 'Giờ xuất' : 'Giờ nhập'}</TableHeadCell>
            {!isFinishedGoodsHistory ? <TableHeadCell>Ca</TableHeadCell> : null}
            {!isFinishedGoodsHistory ? <TableHeadCell>Máy</TableHeadCell> : null}
            <TableHeadCell>Người lập</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            <TableEmptyRow colSpan={isFinishedGoodsHistory ? 5 : 7}>
              Chưa có phiếu {warehouseSlipTypeLabel(selectedType).toLowerCase()} tại {warehouseKindLabel(warehouseTab)}.
            </TableEmptyRow>
          </TableBody>
        </TableShell>
      ) : (
        <div className="space-y-3">
          {slipDateGroups.map(dateGroup => (
            <div key={dateGroup.slipDate} className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 sm:px-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</span>
                  <span className="font-mono text-sm font-black text-zinc-900">
                    {(() => {
                      const [y, m, d] = dateGroup.slipDate.split('-');
                      return y && m && d ? `${d}/${m}/${y}` : dateGroup.slipDate;
                    })()}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 ring-1 ring-zinc-200">
                    {dateGroup.groups.length} phiếu
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng ngày</p>
                  <p className="font-mono text-sm font-black text-emerald-800">
                    {formatWarehouseMoney(dateGroup.totalAmount)} đ
                  </p>
                </div>
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {dateGroup.groups.map(group => {
                  const header = group.header;
                  const lineCount = group.rows.length;
                  const isSelected = selectedSlipCodes.has(group.slipCode);
                  const isDeleting = deletingSlipCode === group.slipCode;
                  return (
                    <article
                      key={group.slipCode}
                      className={`rounded-xl border border-zinc-200 bg-white p-3 shadow-sm ${isSelected ? 'bg-red-50/40' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!group.slipCode || isBulkDeleting || isDeleting}
                          onChange={() => toggleSlipSelection(group.slipCode)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20 disabled:opacity-40"
                          title="Chọn phiếu"
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => openSlipDetail(group.slipCode)}
                            disabled={!group.slipCode}
                            className="break-words text-left text-sm font-black text-[#ef1b2d] transition hover:text-[#b30d1c] disabled:text-zinc-950"
                          >
                            {group.slipCode || '-'}
                          </button>
                          <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                            {!isFinishedGoodsHistory ? <>Ca: {header.shift || '-'} · </> : null}
                            {lineCount} dòng · {formatWarehouseMoney(group.totalAmount)} đ
                          </p>
                          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <div><dt className="font-bold text-zinc-400">{selectedType === 'xuat' ? 'Giờ xuất' : 'Giờ nhập'}</dt><dd className="mt-0.5 font-mono font-bold tabular-nums text-zinc-700" title="Thời điểm lưu phiếu theo giờ Việt Nam">{formatWarehouseSlipSavedTime(group.createdAt)}</dd></div>
                            {!isFinishedGoodsHistory ? <div><dt className="font-bold text-zinc-400">Máy</dt><dd className="mt-0.5 break-words font-semibold text-zinc-700">{header.machine || '-'}</dd></div> : null}
                            <div><dt className="font-bold text-zinc-400">Người lập</dt><dd className="mt-0.5 break-words font-semibold text-zinc-700">{header.createdBy || '-'}</dd></div>
                          </dl>
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                            {canEdit && header.slipType !== 'xuat' && !header.daIn ? (
                              <button type="button" onClick={() => handleEditSlip(group.slipCode)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 px-2 text-xs font-bold text-amber-800"><Pencil className="h-3.5 w-3.5" />Sửa</button>
                            ) : null}
                            <button type="button" onClick={() => handlePrintSlipByCode(group.slipCode, true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-bold text-[#ef1b2d]"><Printer className="h-3.5 w-3.5" />In</button>
                            {canDelete ? (
                              <button type="button" onClick={() => void handleDeleteSlip(group.slipCode, lineCount)} disabled={isDeleting || isBulkDeleting} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 px-2 text-xs font-bold text-rose-700 disabled:opacity-50">
                                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Xóa
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden md:block">
              <TableShell minWidthClassName={isFinishedGoodsHistory ? 'min-w-[700px]' : 'min-w-[900px]'}>
                <TableHead>
                  <TableHeadCell className="w-10" align="center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableSlips.length === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                      title="Chọn tất cả"
                    />
                  </TableHeadCell>
                  <TableHeadCell>Mã phiếu</TableHeadCell>
                  <TableHeadCell title="Thời điểm lưu phiếu theo giờ Việt Nam">{selectedType === 'xuat' ? 'Giờ xuất' : 'Giờ nhập'}</TableHeadCell>
                  {!isFinishedGoodsHistory ? <TableHeadCell>Ca</TableHeadCell> : null}
                  {!isFinishedGoodsHistory ? <TableHeadCell>Máy</TableHeadCell> : null}
                  <TableHeadCell>Người lập</TableHeadCell>
                  <TableHeadCell align="center">Thao tác</TableHeadCell>
                </TableHead>
                <TableBody>
                  {dateGroup.groups.map(group => {
                    const header = group.header;
                    const lineCount = group.rows.length;
                    const isSelected = selectedSlipCodes.has(group.slipCode);
                    const isDeleting = deletingSlipCode === group.slipCode;

                    return (
                      <React.Fragment key={group.slipCode}>
                        <TableRow className={isSelected ? 'bg-red-50/30' : ''}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!group.slipCode || isBulkDeleting || isDeleting}
                              onChange={() => toggleSlipSelection(group.slipCode)}
                              className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Chọn phiếu"
                            />
                          </td>
                          <td className="px-4 py-3 font-black text-zinc-950">
                            <button
                              type="button"
                              onClick={() => openSlipDetail(group.slipCode)}
                              disabled={!group.slipCode}
                              className="text-left text-[#ef1b2d] transition hover:text-[#b30d1c] disabled:text-zinc-950"
                            >
                              {group.slipCode || '-'}
                            </button>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                              {lineCount} dòng · {formatWarehouseMoney(group.totalAmount)} đ
                            </p>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold tabular-nums text-zinc-700" title="Thời điểm lưu phiếu theo giờ Việt Nam">
                            {formatWarehouseSlipSavedTime(group.createdAt)}
                          </td>
                          {!isFinishedGoodsHistory ? <td className="px-4 py-3 font-semibold text-zinc-700">{header.shift || '-'}</td> : null}
                          {!isFinishedGoodsHistory ? <td className="px-4 py-3 font-semibold text-zinc-700">{header.machine || '-'}</td> : null}
                          <td className="px-4 py-3 font-semibold text-zinc-600">{header.createdBy || '-'}</td>
                          <td className="px-4 py-3">
                            <RowActionsMenu label={`Thao tác phiếu ${group.slipCode}`}>
                            <div className="flex items-center justify-center gap-1">
                              {canEdit && header.slipType !== 'xuat' && !header.daIn ? (
                                <button
                                  type="button"
                                  onClick={() => handleEditSlip(group.slipCode)}
                                  title="Sửa phiếu"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-amber-700 transition hover:bg-amber-50"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handlePrintSlipByCode(group.slipCode, true)}
                                title="In phiếu"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                              {canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteSlip(group.slipCode, lineCount)}
                                  disabled={isDeleting || isBulkDeleting}
                                  title="Xóa phiếu"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              ) : null}
                            </div>
                            </RowActionsMenu>
                          </td>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </TableShell>
              </div>
            </div>
          ))}
        </div>
      )}

      </>
      )}

      {isStandalone && !(viewingSlipCode && viewingRows[0]) && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm font-bold text-zinc-500">
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải phiếu…
            </span>
          ) : error ? (
            <span className="text-rose-700">{error}</span>
          ) : (
            <span>Không tìm thấy phiếu {standaloneSlipCode}.</span>
          )}
        </div>
      )}

      {viewingSlipCode && viewingRows[0] && (
        <div className={isStandalone ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-2 backdrop-blur-sm sm:p-4'}>
          <div className={isStandalone
            ? 'flex w-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-card'
            : 'flex h-[90dvh] max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:h-[85vh] sm:max-h-[85vh]'}>
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết phiếu</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {viewingSlipCode} · {viewingRows.length} dòng{' '}
                  {warehouseTab === 'san_pham' ? 'SP' : warehouseTab === 'hang_hong' ? 'hàng hỏng' : warehouseTab === 'tai_che' ? 'NVL tái chế' : 'NVL'}
                </p>
              </div>
              {isStandalone ? (
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && viewingRows[0]?.slipType !== 'xuat' && !viewingRows[0]?.daIn ? (
                    <button
                      type="button"
                      onClick={() => handleEditSlip(viewingSlipCode!)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-extrabold text-amber-800 transition hover:bg-amber-100"
                    >
                      <Pencil className="h-4 w-4" />
                      Sửa phiếu
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handlePrintViewingSlip(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                  >
                    <Printer className="h-4 w-4" />
                    In phiếu
                  </button>
                  {viewingRows[0].warehouseKind === 'san_pham' && viewingRows[0].slipType === 'nhap' ? (
                    <button
                      type="button"
                      onClick={() => void handlePrintViewingQrCodes()}
                      disabled={isLoadingHistoryQr}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-white px-3 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-50 disabled:opacity-60"
                    >
                      {isLoadingHistoryQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      {isLoadingHistoryQr ? 'Đang tải QR...' : 'In mã QR'}
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewingSlipCode(null)}
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  Đóng
                </button>
              )}
            </div>
            <div className={isStandalone ? '' : 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain touch-pan-y'}>
              <div className="grid shrink-0 grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                {[
                  ['Kho', warehouseKindLabel(viewingRows[0].warehouseKind)],
                  ['Loại', warehouseSlipTypeLabel(viewingRows[0].slipType)],
                  ['Ngày', viewingRows[0].slipDate || '-'],
                  ['Ca', viewingRows[0].shift || '-'],
                  ['Máy', viewingRows[0].machine || '-'],
                  ['Tổng tiền', `${formatWarehouseMoney(viewingSlipTotal)} đ`],
                  ['Tổng cuộn', formatWarehouseRollTotal(viewingSlipTotalRolls)],
                  ['Tổng trọng lượng', formatWarehouseWeightKg(viewingSlipTotalWeightKg > 0 ? viewingSlipTotalWeightKg : null)],
                  ['Lý do', viewingRows[0].reason || '-'],
                  ['Ghi chú', viewingRows[0].note || '-'],
                  ['Người lập', viewingRows[0].createdBy || '-']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                    <p className="mt-0.5 text-sm font-bold text-zinc-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className={`border-t border-zinc-200 px-4 py-3 ${isStandalone ? 'overflow-x-auto' : 'shrink-0 overflow-x-auto'}`}>
              <table className={`text-left text-sm ${isStandalone ? 'w-full' : 'min-w-[640px]'}`}>
                <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                  <tr>
                    <th className="py-2 pr-3 text-center font-black">STT</th>
                    <th className="py-2 pr-3 font-black">{warehouseItemCodeLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">{warehouseItemNameLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">SL</th>
                    <th className="py-2 pr-3 font-black">ĐVT</th>
                    <th className="py-2 pr-3 text-right font-black">Trọng lượng</th>
                    {viewingRows[0].slipType === 'xuat' && viewingRows[0].warehouseKind === 'nvl' ? (
                      <th className="py-2 pr-3 font-black">PN nhập</th>
                    ) : null}
                    {viewingRows[0].slipType === 'xuat' && viewingRows[0].warehouseKind === 'nvl' ? (
                      <th className="py-2 pr-3 font-black">Ảnh thực tế</th>
                    ) : null}
                    <th className="py-2 pr-3 font-black">Giá</th>
                    <th className="py-2 font-black">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {viewingRows.map((row, index) => (
                    <tr key={row.id || `${row.itemCode}-${row.quantity}`}>
                      <td className="py-2 pr-3 text-center font-bold text-zinc-500">{index + 1}</td>
                      <td className="py-2 pr-3 font-bold text-zinc-900">{row.itemCode}</td>
                      <td className="py-2 pr-3 text-zinc-700">{row.itemName || '-'}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-zinc-800">{formatNumber(row.quantity, 2)}</td>
                      <td className="py-2 pr-3 text-zinc-700">{row.unit}</td>
                      <td className="py-2 pr-3 text-right font-mono font-bold text-emerald-800">
                        {formatWarehouseWeightKg(resolveWarehouseRowWeightKg(row))}
                      </td>
                      {viewingRows[0].slipType === 'xuat' && viewingRows[0].warehouseKind === 'nvl' ? (
                        <td className="py-2 pr-3 font-mono text-xs font-bold text-indigo-700">
                          {row.sourceInboundSlipCode || '—'}
                        </td>
                      ) : null}
                      {viewingRows[0].slipType === 'xuat' && viewingRows[0].warehouseKind === 'nvl' ? (
                        <td className="py-2 pr-3">
                          <div className="flex flex-wrap gap-1">
                            {row.actualWeightImageUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewingHistoryImage({ url: row.actualWeightImageUrl!, title: `Ảnh số cân · ${row.itemCode}` })}
                                className="rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[10px] font-bold text-[#ef1b2d] hover:bg-red-100"
                              >
                                Cân
                              </button>
                            ) : null}
                            {!row.actualWeightImageUrl ? <span className="text-zinc-400">—</span> : null}
                          </div>
                        </td>
                      ) : null}
                      <td className="py-2 pr-3 font-mono font-bold text-zinc-800">{formatWarehouseMoney(row.unitPrice)} đ</td>
                      <td className="py-2 font-mono font-bold text-zinc-900">{formatWarehouseMoney(row.lineAmount)} đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#ef1b2d]/20 bg-red-50 px-4 py-3">
              <div>
                <p className="text-sm font-black text-zinc-950">
                  Tổng cuộn:{' '}
                  <span className="text-[#ef1b2d]">{formatWarehouseRollTotal(viewingSlipTotalRolls)}</span>
                  <span className="mx-2 font-normal text-zinc-400">·</span>
                  Tổng tiền: <span className="text-[#ef1b2d]">{formatWarehouseMoney(viewingSlipTotal)} đ</span>
                </p>
                {historyQrError ? <p className="mt-1 text-xs font-semibold text-rose-700">{historyQrError}</p> : null}
              </div>
              <div className={`flex-wrap items-center gap-2 ${isStandalone ? 'hidden' : 'flex'}`}>
                {canEdit && viewingRows[0]?.slipType !== 'xuat' && !viewingRows[0]?.daIn ? (
                  <button
                    type="button"
                    onClick={() => handleEditSlip(viewingSlipCode!)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-800 transition hover:bg-amber-100"
                  >
                    <Pencil className="h-4 w-4" />
                    Sửa phiếu
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handlePrintViewingSlip(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Printer className="h-4 w-4" />
                  In phiếu
                </button>
                {(viewingRows[0].warehouseKind === 'san_pham' || viewingRows[0].warehouseKind === 'nvl') && viewingRows[0].slipType === 'nhap' ? (
                  <button
                    type="button"
                    onClick={() => void handlePrintViewingQrCodes()}
                    disabled={isLoadingHistoryQr}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-white px-3 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {isLoadingHistoryQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {isLoadingHistoryQr ? 'Đang tải QR...' : 'In mã QR'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <WarehouseSlipPrintModal
        open={historyPrintOpen}
        slips={historyPrintSlips}
        autoPrint={historyPrintAutoTrigger}
        onClose={() => {
          setHistoryPrintOpen(false);
          setHistoryPrintSlips([]);
          setHistoryPrintAutoTrigger(false);
        }}
      />

      <ProductQrPrintModal
        open={historyQrPrintOpen}
        labels={historyQrLabels}
        trackProductPrint={!historyQrTrackMaterial}
        trackMaterialPrint={historyQrTrackMaterial}
        showPayload={false}
        title={historyQrTrackMaterial ? 'Mã QR NVL' : undefined}
        onClose={() => {
          setHistoryQrPrintOpen(false);
          setHistoryQrTrackMaterial(false);
          setHistoryQrLabels([]);
        }}
      />

      <WeighingImagePreviewModal image={viewingHistoryImage} onClose={() => setViewingHistoryImage(null)} />
    </div>
  );
}
