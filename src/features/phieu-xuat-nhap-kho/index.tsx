import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Eye,
  Factory,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  QrCode,
  Recycle,
  Save,
  ScanBarcode,
  Search,
  TriangleAlert,
  Trash2,
  Wrench
} from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import ProductQrScanner from '../../components/ProductQrScanner';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge,
  RowActionsMenu
} from '../../components/shared/table';
import { pickText, fileToDataUrl, uploadImage } from '../_shared/recordHelpers';
import WarehouseSlipPrintModal, { type WarehouseSlipPrintData } from '../../components/WarehouseSlipPrintModal';
import ProductQrPrintModal, { type ProductQrPrintLabel } from '../../components/ProductQrPrintModal';
import { STORAGE_WAREHOUSE_SLIP_DRAFT_KEY } from '../_shared/storageKeys';
import { getProductionShiftOptions, normalizeShiftSettings, shiftNamesMatch } from '../../utils/shiftSettings';
import { findProductByCode, normalizeProducts } from '../san-pham';
import { buildProductionOrderMaterialProposal, loadProductionOrderProductCatalog } from '../ke-hoach-san-xuat';
import { normalizeMaterialsInventory } from '../kho-nvl';
import {
  composeReasonWithProductionOrderCodes,
  extractLinkedProductionOrderCodes,
  stripProductionOrderCodesFromReason,
  type ShiftSummaryWarehouseMovement
} from '../../utils/controlBoardShiftSummary';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import type { MaterialOption } from '../san-pham/types';
import {
  convertWarehouseQuantityToKg,
  formatWarehouseWeightKg,
  mapMaterialToWeightCatalogItem,
  mapProductToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from '../../utils/warehouseWeight';

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
  ['san_pham', 'Kho Sản phẩm', Package],
  ['hang_hong', 'Kho hàng hỏng', TriangleAlert],
  ['hang_hoa', 'Kho hàng hóa', Package],
  ['cong_cu_dung_cu', 'Kho công cụ dụng cụ', Wrench],
  ['gia_cong', 'Kho gia công', Factory],
  ['tai_che', 'Kho tái chế', Recycle]
] as const satisfies ReadonlyArray<readonly [WarehouseKind, string, React.ComponentType<{ className?: string }>]>;

export interface WarehouseMovementRow {
  id: string;
  slipCode: string;
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
  warehouseName: string;
  slipDate: string;
  shift: string;
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
  sourceInboundLineId?: string;
  sourceInboundSlipCode?: string;
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
}

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
    >
  >;
};

/** Draft quá thời gian này (ms) coi như đã cũ/bỏ dở, không tự điền vào phiếu mới nữa. */
const WAREHOUSE_SLIP_DRAFT_MAX_AGE_MS = 5 * 60 * 1000;

export function buildWarehouseSlipDraftFromHistoryRows(
  rows: WarehouseMovementRow[],
  slipCode: string
): WarehouseSlipPrefillDraft | null {
  const header = rows[0];
  if (!header) return null;

  const linkedOrderCodes = extractLinkedProductionOrderCodes(header.reason, header.note);

  return {
    slipType: header.slipType,
    warehouseKind: header.warehouseKind,
    warehouseName: header.warehouseName,
    slipDate: header.slipDate,
    reason: stripProductionOrderCodesFromReason(header.reason || ''),
    note: header.note || '',
    createdBy: header.createdBy || '',
    productionOrderRef: formatWarehouseProductionOrderSelection(linkedOrderCodes),
    shift: header.shift || '',
    editSlipCode: slipCode,
    lines: rows.map(row => ({
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
      sourceInboundSlipCode: row.sourceInboundSlipCode || ''
    }))
  };
}

const warehouseFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const warehouseLineFieldClass =
  'h-9 w-full rounded-md border border-zinc-200 px-2.5 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const warehouseLineLabelClass =
  'mb-0.5 block text-[10px] font-black uppercase tracking-wider text-zinc-500 lg:hidden';

const warehouseLineHeaderClass =
  'px-0.5 text-[10px] font-black uppercase tracking-wide text-white whitespace-nowrap';

const warehouseNhapLineGridClass =
  'grid grid-cols-3 gap-1.5 rounded-lg border border-zinc-200/90 bg-white p-2 lg:grid-cols-[minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_5.5rem_5.5rem_4.5rem_5.75rem_2rem] lg:items-center lg:gap-1.5 lg:rounded-none lg:border-0 lg:border-b lg:border-zinc-200/80 lg:bg-transparent lg:p-0 lg:py-1.5';

const warehouseXuatLineGridClass =
  'grid grid-cols-3 gap-1.5 rounded-lg border border-zinc-200/90 bg-white p-2 lg:grid-cols-[minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_4.5rem_6.25rem_5.5rem_4.5rem_5.75rem_2rem] lg:items-center lg:gap-1.5 lg:rounded-none lg:border-0 lg:border-b lg:border-zinc-200/80 lg:bg-transparent lg:p-0 lg:py-1.5';

const warehouseNhapHeaderGridClass =
  'hidden min-w-[48rem] lg:mb-1 lg:grid lg:grid-cols-[minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_5.5rem_5.5rem_4.5rem_5.75rem_2rem] lg:items-center lg:gap-1.5 lg:rounded-lg lg:bg-[#ef1b2d] lg:px-2 lg:py-2';

const warehouseXuatHeaderGridClass =
  'hidden min-w-[54rem] lg:mb-1 lg:grid lg:grid-cols-[minmax(7rem,0.95fr)_minmax(7rem,1.15fr)_3.25rem_4.5rem_6.25rem_5.5rem_4.5rem_5.75rem_2rem] lg:items-center lg:gap-1.5 lg:rounded-lg lg:bg-[#ef1b2d] lg:px-2 lg:py-2';

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
  if (kind === 'san_pham') return 'Kho Sản phẩm';
  if (kind === 'hang_hong') return 'Kho hàng hỏng';
  if (kind === 'hang_hoa') return 'Kho hàng hóa';
  if (kind === 'cong_cu_dung_cu') return 'Kho công cụ dụng cụ';
  if (kind === 'gia_cong') return 'Kho gia công';
  if (kind === 'tai_che') return 'Kho tái chế';
  return 'Kho NVL';
}

export function warehouseItemCodeLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Mã SP' : 'Mã NPL';
}

export function warehouseItemNameLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Tên SP' : 'Tên NVL';
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
};

export function parseWarehouseSlipPayloadItems(
  lines: WarehouseSlipLineDraft[],
  warehouseKind: WarehouseKind,
  options?: { allowMissingUnitPrice?: boolean; requireInboundLot?: boolean; includeDocumentQuantity?: boolean }
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
        sourceInboundSlipCode: sourceInboundSlipCode || undefined
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
      products: options.products ?? []
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
    totalAmount: printLines.reduce((sum, line) => sum + line.lineAmount, 0),
    lines: printLines
  };
}

export function formatWarehouseMoney(value: number) {
  return formatMoney(value, 0);
}

/** Tiền tố trước dấu "_" — dùng để tra tên/ĐVT trong danh mục khi mã quét có hậu tố lô/serial (VD "L30cm_3701190208G" → "L30cm"). */
function warehouseCodePrefix(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
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
    sourceInboundSlipCode: ''
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
    sourceInboundSlipCode: line.sourceInboundSlipCode || ''
  };
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
        slipType,
        warehouseKind,
        warehouseName,
        slipDate: String(record.ngay_phieu ?? record.slipDate ?? '').trim(),
        shift: String(record.ca ?? record.shift ?? record.ca_san_xuat ?? '').trim(),
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
        sourceInboundLineId: String(record.id_dong_nhap_nguon ?? record.sourceInboundLineId ?? '').trim() || undefined,
        sourceInboundSlipCode:
          String(record.ma_phieu_nhap_nguon ?? record.sourceInboundSlipCode ?? '').trim() || undefined
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
  onOpenHistory
}: {
  onBack: () => void;
  onOpenHistory: () => void;
}) {
  const [warehouseKind, setWarehouseKind] = useState<WarehouseKind>('nvl');
  const warehouseAccess = useWarehouseSlipAccess();
  const { canCreate, canEdit, canDelete } = pickWarehouseSlipAccess(warehouseAccess, warehouseKind);
  const [warehouseName, setWarehouseName] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [slipType, setSlipType] = useState<WarehouseSlipType>('nhap');
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
  const [warehouseLocation, setWarehouseLocation] = useState('Đà Nẵng');
  const [lines, setLines] = useState<WarehouseSlipLineDraft[]>(() => [createWarehouseLineDraft()]);
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
  const [shiftSettings, setShiftSettings] = useState<ReturnType<typeof normalizeShiftSettings>>([]);
  const [productionOrders, setProductionOrders] = useState<WarehouseProductionOrderOption[]>([]);
  const [isAutofillingFromOrders, setIsAutofillingFromOrders] = useState(false);
  const [isLoadingProductionOrders, setIsLoadingProductionOrders] = useState(true);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

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
    const rawDraft = localStorage.getItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<WarehouseSlipPrefillDraft>;
      if (!draft || !Array.isArray(draft.lines) || draft.lines.length === 0) return;
      if (!draft.createdAt || Date.now() - draft.createdAt > WAREHOUSE_SLIP_DRAFT_MAX_AGE_MS) return;

      {
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
        const editingCode = String(draft.editSlipCode || '').trim();
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
      }
      setSlipType(draft.slipType === 'nhap' ? 'nhap' : 'xuat');
      if (draft.slipDate) setSlipDate(draft.slipDate);
      setReason(stripProductionOrderCodesFromReason(draft.reason || ''));
      setNote(draft.note || '');
      setCreatedBy(draft.createdBy || '');
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
      setWarehouseLocation(draft.warehouseLocation || 'Đà Nẵng');
      setLines(draft.lines.map(createWarehouseLineDraftFromPrefill));
      const editingCode = String(draft.editSlipCode || '').trim();
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

  useEffect(() => {
    const loadItems = async () => {
      setIsLoadingItems(true);
      try {
        if (warehouseKind === 'san_pham') {
          const res = await fetch('/api/san-pham?format=table');
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
          const products = normalizeProducts(data);
          setItemOptions(
            products.map(product => ({
              code: product.code,
              name: product.name,
              unit: product.unit && product.unit !== '-' ? product.unit : ''
            }))
          );
          setWeightCatalog(products.map(mapProductToWeightCatalogItem));
        } else {
          const res = await fetch('/api/kho-nvl');
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không thể tải kho NVL.');
          const materials = normalizeMaterialsInventory(data);
          setItemOptions(
            materials.map(material => ({
              code: material.code,
              name: material.name,
              unit: material.unit && material.unit !== '-' ? material.unit : ''
            }))
          );
          setWeightCatalog(materials.map(mapMaterialToWeightCatalogItem));
        }
      } catch {
        setItemOptions([]);
        setWeightCatalog([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadItems();
  }, [warehouseKind]);

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
    const item = itemOptions.find(option => option.code === warehouseCodePrefix(fullCode));
    const isExportNvl = (warehouseKind === 'nvl' || warehouseKind === 'tai_che') && slipType === 'xuat';
    const cachedAvg =
      isExportNvl && fullCode ? avgInboundPriceByKey[avgPriceCacheKey(fullCode, slipDate)] : undefined;
    const immediatePrice =
      typeof cachedAvg === 'number' && cachedAvg > 0 ? formatSuggestedUnitPrice(cachedAvg) : '';

    return {
      code: fullCode,
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
  // Theo dõi `lines` bằng ref để quét liên tiếp (nhiều mã trong 1 nhịp camera) không bị đọc dữ
  // liệu cũ khi state React chưa kịp render lại giữa hai lần quét.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  /** Quét/nhận một mã (có thể mang hậu tố lô/serial) — điền vào dòng trống đầu tiên, hoặc thêm dòng mới. */
  const addLineFromScan = (raw: string): boolean | 'duplicate' => {
    const fullCode = String(raw ?? '').trim();
    if (!fullCode) return false;
    const current = linesRef.current;
    if (current.some(line => line.code.trim() === fullCode)) return 'duplicate';

    const patch = resolveLinePatchForCode(fullCode);
    const emptyIndex = current.findIndex(line => !line.code.trim());
    let targetKey: string;
    let nextLines: WarehouseSlipLineDraft[];
    if (emptyIndex >= 0) {
      targetKey = current[emptyIndex].key;
      nextLines = current.map((line, idx) => (idx === emptyIndex ? { ...line, ...patch } : line));
    } else {
      const draft = createWarehouseLineDraft();
      targetKey = draft.key;
      nextLines = [...current, { ...draft, ...patch }];
    }
    linesRef.current = nextLines;
    setLines(nextLines);

    if ((warehouseKind === 'nvl' || warehouseKind === 'tai_che') && slipType === 'xuat') {
      void loadNvlAvgInboundPrice(fullCode, slipDate, {
        lineKey: targetKey,
        applySuggestion: true,
        forceOverwrite: true
      });
    }
    return true;
  };

  const isMaterialWarehouse = warehouseKind === 'nvl' || warehouseKind === 'tai_che';
  const isNvlExport = isMaterialWarehouse && slipType === 'xuat';
  const isNvlInbound = isMaterialWarehouse && slipType === 'nhap';

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

    const materialLines = [...materialMap.values()]
      .filter(line => line.quantity > 0)
      .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

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
      materialLines.map(line =>
        createWarehouseLineDraftFromPrefill({
          code: line.code,
          name: line.name,
          unit: line.unit,
          quantity: formatNumber(line.quantity, 2),
          documentQuantity: formatNumber(line.quantity, 2),
          quotaQuantity: formatNumber(line.quotaQuantity, 2),
          suggestedQuantity: formatNumber(line.quantity, 2),
          unitPrice: ''
        })
      )
    );
    return materialLines.length;
  };

  const handleAutofillFromProductionOrders = async () => {
    if (!slipDate.trim()) {
      setFormError('Vui lòng chọn Ngày phiếu trước khi tự động điền.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!isNvlInbound && selectedShifts.length === 0) {
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

  const slipTotal = useMemo(
    () => lines.reduce((sum, line) => sum + computeWarehouseLineAmount(line.quantity, line.unitPrice), 0),
    [lines]
  );

  const resolveLineWeightKg = (line: WarehouseSlipLineDraft) =>
    convertWarehouseQuantityToKg({
      quantity: parsePercentInput(line.quantity),
      unit: line.unit,
      itemCode: line.code,
      warehouseKind: warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
      materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
      products: warehouseKind === 'san_pham' ? weightCatalog : []
    });

  const slipTotalWeightKg = useMemo(() => {
    let total = 0;
    let hasWeight = false;
    for (const line of lines) {
      const weight = convertWarehouseQuantityToKg({
        quantity: parsePercentInput(line.quantity),
        unit: line.unit,
        itemCode: line.code,
        warehouseKind: warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
        materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
        products: warehouseKind === 'san_pham' ? weightCatalog : []
      });
      if (weight !== null) {
        total += weight;
        hasWeight = true;
      }
    }
    return hasWeight ? total : null;
  }, [lines, warehouseKind, weightCatalog]);

  const shiftLabel = formatWarehouseShiftSelection(selectedShifts);

  const openPrintPreviewFromForm = (autoPrint: boolean) => {
    if (!warehouseName.trim()) {
      setFormError(showSaveFailure('Vui lòng chọn tên kho từ danh sách Quản lý kho.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }

    const linesForPrint = isNvlExport
      ? lines.map(line => ({ ...line, sourceInboundLineId: '', sourceInboundSlipCode: '' }))
      : lines;
    const parsed = parseWarehouseSlipPayloadItems(linesForPrint, warehouseKind, {
      allowMissingUnitPrice: true,
      requireInboundLot: false,
      includeDocumentQuantity: slipType === 'xuat'
    });
    if ('error' in parsed) {
      setFormError(showSaveFailure(parsed.error));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }

    const printSlipType: WarehouseSlipType = slipType === 'xuat' ? 'xuat' : 'nhap';
    const previewCode =
      editSlipCode?.trim() ||
      `XEM-${printSlipType === 'nhap' ? 'NH' : 'XH'}-${String(slipDate || '').replace(/-/g, '') || 'TAM'}`;

    setPrintSlip(
      buildWarehouseSlipPrintData(parsed.items, {
        slipCode: previewCode,
        slipType: printSlipType,
        warehouseKind,
        slipDate,
        reason: composeReasonWithProductionOrderCodes(reason, productionOrderCodes),
        note: note.trim(),
        createdBy: createdBy.trim(),
        productionOrderRef: productionOrderLabel,
        machine: machine.trim(),
        shift: shiftLabel,
        recipient: recipient.trim(),
        deliverer: deliverer.trim(),
        warehouseLocation: warehouseLocation.trim(),
        warehouseName: warehouseName.trim(),
        materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
        products: warehouseKind === 'san_pham' ? weightCatalog : []
      })
    );
    setPrintAutoTrigger(autoPrint);
    setPrintModalOpen(true);
    return true;
  };

  const handlePrintPreview = () => {
    openPrintPreviewFromForm(true);
  };

  const handleSave = async () => {
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
    if (!warehouseName.trim()) {
      setFormError(showSaveFailure('Vui lòng chọn tên kho từ danh sách Quản lý kho.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const linesForSave = isNvlExport
      ? lines.map(line => ({ ...line, sourceInboundLineId: '', sourceInboundSlipCode: '' }))
      : lines;
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
    const slipPayload = {
      loaiPhieu: printSlipType,
      loaiKho: warehouseKind,
      tenKho: warehouseName.trim(),
      ngayPhieu: slipDate,
      lyDo: composeReasonWithProductionOrderCodes(reason, productionOrderCodes),
      ghiChu: note.trim(),
      nguoiLap: createdBy.trim(),
      ca: shiftLabel || null,
      items: payloadItems
    };

    try {
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
      const savedReason = composeReasonWithProductionOrderCodes(reason, productionOrderCodes);
      const savedQrLabels: ProductQrPrintLabel[] = Array.isArray(data.qrCodes)
        ? data.qrCodes
            .map((record: Record<string, unknown>, index: number) => {
              const payload = String(record.code ?? record.ma_sp_day_du ?? '').trim();
              const productCode = String(record.baseCode ?? record.ma_sp_goc ?? '').trim();
              return {
                key: `${savedSlipCode}-${index}-${payload}`,
                payload,
                productCode,
                productName: String(record.name ?? record.ten_sp ?? '').trim()
              };
            })
            .filter((label: ProductQrPrintLabel) => Boolean(label.payload))
        : [];
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
          productionOrderRef: productionOrderLabel,
          machine: machine.trim(),
          shift: shiftLabel,
          recipient: recipient.trim(),
          deliverer: deliverer.trim(),
          warehouseLocation: warehouseLocation.trim(),
          warehouseName: warehouseName.trim(),
          materials: warehouseKind === 'san_pham' ? [] : weightCatalog,
          products: warehouseKind === 'san_pham' ? weightCatalog : []
        })
      );
      setPrintAutoTrigger(true);
      setPrintModalOpen(true);
      const okMsg = isEditing
        ? `Đã cập nhật phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}). Xem tại Lịch sử xuất nhập kho.`
        : savedQrLabels.length > 0
          ? `Đã lưu phiếu ${savedSlipCode} và sinh ${savedQrLabels.length} mã QR. Hệ thống sẽ lần lượt mở phiếu nhập và file tem QR.`
          : `Đã lưu phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}) vào lịch sử.`;
      setActionMessage(okMsg);
      showAppToast(okMsg);
      setEditSlipCode(null);
      setReason('');
      setNote('');
      setDeliverer('');
      setProductionOrderCodes([]);
      setProductionOrderSearch('');
      setLines([createWarehouseLineDraft()]);
    } catch (error: any) {
      setFormError(showSaveFailure(error, 'Không thể lưu phiếu xuất nhập kho.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý kho</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Phiếu xuất nhập kho</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Lập phiếu nhập hoặc xuất cho kho NVL hoặc kho Sản phẩm.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-bold text-white transition hover:border-[#ef1b2d] hover:bg-[#ef1b2d]"
              >
                <History className="h-4 w-4" />
                Lịch sử
              </button>
            </div>
          </div>
        </div>
      </section>

      {(formError || actionMessage) && (
        <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
          {formError && (
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

      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-zinc-700">Loại phiếu</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['nhap', 'Nhập kho', ArrowDownToLine],
                ['xuat', 'Xuất kho', ArrowUpFromLine]
              ] as const).map(([type, label, Icon]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSlipType(type)}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-extrabold transition ${
                    slipType === type
                      ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-xs font-black uppercase tracking-wide text-zinc-700">Tên kho *</span>
              <select
                value={warehouseName}
                onChange={event => handleWarehouseNameChange(event.target.value)}
                className={warehouseFieldClass}
              >
                <option value="">-- Chọn tên kho --</option>
                {warehouseSelectOptions.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
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
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-3 py-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">Tổng tiền</p>
              <p className="text-lg font-black leading-tight text-zinc-950">{formatWarehouseMoney(slipTotal)} đ</p>
            </div>
            <p className="text-[10px] font-semibold text-zinc-400">Giá × SL</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-600/20 bg-emerald-50 px-3 py-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Khối lượng</p>
              <p className="text-lg font-black leading-tight text-zinc-950">{formatWarehouseWeightKg(slipTotalWeightKg)}</p>
            </div>
            <p className="text-[10px] font-semibold text-zinc-400">SL × định mức kg</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
          <p className="text-sm font-black text-zinc-950">Thông tin phiếu</p>
          <p className="text-xs font-semibold text-zinc-400">
            {warehouseSlipTypeLabel(slipType)} · {warehouseName || warehouseKindLabel(warehouseKind)}
          </p>
        </div>

        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày phiếu *</span>
            <input type="date" value={slipDate} onChange={event => setSlipDate(event.target.value)} className={warehouseFieldClass} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              {isNvlInbound ? (
                <>
                  Ca{' '}
                  <span className="font-semibold normal-case tracking-normal text-zinc-400">(không bắt buộc)</span>
                </>
              ) : (
                'Ca'
              )}
            </span>
            <select
              value={selectedShifts[0] ?? ''}
              onChange={event => {
                const value = event.target.value.trim();
                setSelectedShifts(value ? [value] : []);
              }}
              className={warehouseFieldClass}
              disabled={shiftOptions.length === 0}
            >
              <option value="">
                {shiftOptions.length === 0 ? 'Chưa có ca trong cài đặt' : '-- Chọn ca --'}
              </option>
              {shiftOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {isNvlInbound && selectedShifts.length === 0 ? (
              <p className="text-[11px] font-semibold text-zinc-400">
                Có thể bỏ trống ca khi nhập kho NVL.
              </p>
            ) : null}
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người lập</span>
            <input value={createdBy} onChange={event => setCreatedBy(event.target.value)} className={warehouseFieldClass} placeholder="Tên người lập phiếu" />
          </label>
          {slipType === 'nhap' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người giao hàng</span>
              <input
                value={deliverer}
                onChange={event => setDeliverer(event.target.value)}
                className={warehouseFieldClass}
                placeholder="Họ tên người giao hàng"
              />
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
              <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Xuất sản xuất..." />
            </label>
          )}

          {slipType === 'nhap' ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Địa điểm</span>
                <input
                  value={warehouseLocation}
                  onChange={event => setWarehouseLocation(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="VD: Đà Nẵng"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
                <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Nhập mua ngoài..." />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Số chứng từ gốc kèm theo..." />
              </label>
            </>
          ) : (
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
              <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Ghi chú thêm (tuỳ chọn)" />
            </label>
          )}

          <div className="relative block space-y-1.5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Mã đơn hàng / Lệnh SX{' '}
                <span className="font-semibold normal-case tracking-normal text-zinc-400">
                  (chọn nhiều)
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleAutofillFromProductionOrders()}
                disabled={isAutofillingFromOrders || isLoadingProductionOrders}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/25 bg-red-50 px-2.5 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Điền máy, lệnh SX và dòng hàng theo Ngày phiếu + Ca"
              >
                {isAutofillingFromOrders ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                )}
                Tự động điền theo lệnh SX
              </button>
            </div>
            <p className="text-[11px] font-semibold text-zinc-500">
              Chọn Ngày phiếu + Ca rồi bấm nút để lấy lệnh SX khớp và điền{' '}
              {warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL định mức'}.
            </p>
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
                      <div className="max-h-52 overflow-y-auto">
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
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Chi tiết {warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL'}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                {isNvlExport
                  ? 'Giá tự gợi ý theo BQ nhập trong tháng của ngày phiếu — có thể sửa tay.'
                  : `Mỗi dòng là một ${warehouseKind === 'san_pham' ? 'mã SP' : 'mã NPL'} trong phiếu`}
              </p>
            </div>
            {(editSlipCode ? canEdit : canCreate) ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQrScannerOpen(true)}
                  className="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d]/30 bg-red-50 px-2.5 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100"
                  title="Quét mã QR/tem có hậu tố lô/serial — mỗi lần quét là một dòng riêng"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét QR
                </button>
                <button
                  type="button"
                  onClick={() => setLines(current => [...current, createWarehouseLineDraft()])}
                  className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm dòng
                </button>
              </div>
            ) : null}
          </div>

          <div className="-mx-0.5 overflow-x-auto">
            <div
              className={slipType === 'xuat' ? warehouseXuatHeaderGridClass : warehouseNhapHeaderGridClass}
            >
              <span className={warehouseLineHeaderClass}>{warehouseItemCodeLabel(warehouseKind)} *</span>
              <span className={warehouseLineHeaderClass}>{warehouseItemNameLabel(warehouseKind)}</span>
              <span className={warehouseLineHeaderClass}>ĐVT</span>
              {slipType === 'xuat' ? (
                <>
                  <span className={warehouseLineHeaderClass}>SL CT</span>
                  <span className={warehouseLineHeaderClass}>SL THỰC *</span>
                </>
              ) : (
                <span className={warehouseLineHeaderClass}>Số lượng *</span>
              )}
              <span className={warehouseLineHeaderClass}>Quy đổi kg</span>
              <span className={warehouseLineHeaderClass}>Giá</span>
              <span className={`${warehouseLineHeaderClass} text-right`}>Thành tiền</span>
              <span />
            </div>

            <div className={`space-y-2 ${slipType === 'xuat' ? 'lg:min-w-[54rem]' : 'lg:min-w-[48rem]'} lg:space-y-0`}>
              {lines.map((line, lineIndex) => (
                <div
                  key={line.key}
                  className={slipType === 'xuat' ? warehouseXuatLineGridClass : warehouseNhapLineGridClass}
                >
                  <div className="-mx-2 -mt-2 mb-1.5 col-span-3 flex items-center justify-between gap-2 rounded-t-lg bg-[#ef1b2d] px-2.5 py-1.5 lg:hidden">
                    <span className="text-[10px] font-black uppercase tracking-wider text-white">
                      Dòng {lineIndex + 1}
                    </span>
                    {lines.length > 1 && canDelete ? (
                      <button
                        type="button"
                        onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-white/30 bg-white/15 px-2 text-[10px] font-bold text-white transition hover:bg-white/25"
                        title="Xóa dòng"
                      >
                        <Trash2 className="h-3 w-3" />
                        Xóa
                      </button>
                    ) : null}
                  </div>

                  <div className="min-w-0 col-span-1">
                    <span className={warehouseLineLabelClass}>{warehouseItemCodeLabel(warehouseKind)} *</span>
                    <SearchableSelect
                      value={line.code}
                      onChange={code => pickItem(line.key, code)}
                      options={itemOptions}
                      placeholder={warehouseKind === 'san_pham' ? 'Mã SP' : 'Mã NPL'}
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
                    <span className={warehouseLineLabelClass}>{warehouseItemNameLabel(warehouseKind)}</span>
                    <input
                      value={line.name}
                      onChange={event => updateLine(line.key, { name: event.target.value })}
                      className={warehouseLineFieldClass}
                      placeholder="Tên"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className={warehouseLineLabelClass}>Đơn vị</span>
                    <input
                      value={line.unit}
                      onChange={event => updateLine(line.key, { unit: event.target.value })}
                      className={warehouseLineFieldClass}
                      placeholder="ĐVT"
                    />
                  </div>
                  {slipType === 'xuat' ? (
                    <>
                      <div className="min-w-0">
                        <span className={warehouseLineLabelClass}>SL CT</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.documentQuantity || ''}
                          onChange={event => updateLine(line.key, { documentQuantity: event.target.value })}
                          className={warehouseLineFieldClass}
                          placeholder="SL CT"
                        />
                      </div>
                      <div className="min-w-0">
                        <span className={warehouseLineLabelClass}>SL THỰC *</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={event => updateLine(line.key, { quantity: event.target.value })}
                          className={warehouseLineFieldClass}
                          placeholder="SL thực"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="min-w-0">
                      <span className={warehouseLineLabelClass}>Số lượng *</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={event => updateLine(line.key, { quantity: event.target.value })}
                        className={warehouseLineFieldClass}
                        placeholder="SL"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className={warehouseLineLabelClass}>Quy đổi kg</span>
                    <div
                      className={`${warehouseLineFieldClass} flex items-center whitespace-nowrap bg-emerald-50/60 font-mono font-bold text-emerald-800`}
                    >
                      {formatWarehouseWeightKg(resolveLineWeightKg(line))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className={warehouseLineLabelClass}>Giá</span>
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
                        placeholder={
                          isNvlExport
                            ? avgPriceLoadingCode === line.code.trim()
                              ? '...'
                              : (() => {
                                  const avg = avgInboundPriceByKey[avgPriceCacheKey(line.code, slipDate)];
                                  return avg && avg > 0
                                    ? formatWarehouseMoney(avg)
                                    : 'Giá';
                                })()
                            : 'Giá'
                        }
                      />
                      {isNvlExport && avgPriceLoadingCode === line.code.trim() ? (
                        <Loader2 className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-amber-600" />
                      ) : null}
                    </div>
                  </div>
                  <div className={`min-w-0 ${slipType === 'xuat' ? 'col-span-2 lg:col-span-1' : ''}`}>
                    <span className={warehouseLineLabelClass}>Thành tiền</span>
                    <div
                      className={`${warehouseLineFieldClass} flex items-center justify-end whitespace-nowrap bg-zinc-50 font-mono font-bold tabular-nums text-zinc-900 lg:bg-white`}
                    >
                      {formatWarehouseMoney(computeWarehouseLineAmount(line.quantity, line.unitPrice))}
                    </div>
                  </div>
                  {lines.length > 1 && canDelete ? (
                    <button
                      type="button"
                      onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                      className="hidden h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 lg:flex"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="hidden lg:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] font-semibold text-zinc-500">
            <strong>In phiếu</strong> xem/in mẫu từ form (chưa lưu).{' '}
            <strong>Lưu &amp; in</strong> mới ghi vào lịch sử rồi in.
            {warehouseKind === 'san_pham' && slipType === 'nhap' ? ' Phiếu nhập thành phẩm sẽ sinh từng serial và mở thêm file tem QR.' : ''}
          </p>
          <button
            type="button"
            onClick={handlePrintPreview}
            disabled={isSaving}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-5 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            In phiếu
          </button>
          {(editSlipCode ? canEdit : canCreate) ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-5 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving
                ? editSlipCode
                  ? 'Đang cập nhật...'
                  : 'Đang lưu...'
                : editSlipCode
                  ? `Cập nhật phiếu ${editSlipCode}`
                  : `Lưu & in phiếu ${warehouseSlipTypeLabel(slipType).toLowerCase()}`}
            </button>
          ) : null}
        </div>
      </section>

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
        closeAfterScan={false}
        requireConfirm={false}
      />
    </div>
  );
}

export function WarehouseHistoryPanel({
  onBack,
  onOpenSlip,
  initialFilters,
  initialWarehouseTab = 'nvl'
}: {
  onBack: () => void;
  onOpenSlip: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
  };
  initialWarehouseTab?: WarehouseKind;
}) {
  const warehouseAccess = useWarehouseSlipAccess();
  const accessibleWarehouseTabs = WAREHOUSE_HISTORY_TABS.filter(([kind]) =>
    pickWarehouseSlipAccess(warehouseAccess, kind).canView
  );
  const [warehouseTab, setWarehouseTab] = useState<WarehouseKind>(() =>
    accessibleWarehouseTabs.some(([kind]) => kind === initialWarehouseTab)
      ? initialWarehouseTab
      : accessibleWarehouseTabs[0]?.[0] ?? initialWarehouseTab
  );
  const { canView, canCreate, canEdit, canDelete } = pickWarehouseSlipAccess(warehouseAccess, warehouseTab);
  const [movements, setMovements] = useState<WarehouseMovementRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | WarehouseSlipType>('all');
  const [fromDate, setFromDate] = useState(() => initialFilters?.dateFrom?.trim() || '');
  const [toDate, setToDate] = useState(() => initialFilters?.dateTo?.trim() || '');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewingSlipCode, setViewingSlipCode] = useState<string | null>(null);
  const [deletingSlipCode, setDeletingSlipCode] = useState<string | null>(null);
  const [selectedSlipCodes, setSelectedSlipCodes] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [historyPrintSlip, setHistoryPrintSlip] = useState<WarehouseSlipPrintData | null>(null);
  const [historyPrintOpen, setHistoryPrintOpen] = useState(false);
  const [historyPrintAutoTrigger, setHistoryPrintAutoTrigger] = useState(false);
  const [historyQrLabels, setHistoryQrLabels] = useState<ProductQrPrintLabel[]>([]);
  const [historyQrPrintOpen, setHistoryQrPrintOpen] = useState(false);
  const [isLoadingHistoryQr, setIsLoadingHistoryQr] = useState(false);
  const [historyQrError, setHistoryQrError] = useState('');
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
      products: weightCatalogProducts
    });

  useEffect(() => {
    void loadWeightCatalog();
  }, []);

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
      params.set('loai_kho', warehouseTab);
      if (selectedType !== 'all') params.set('loai', selectedType);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/phieu-xuat-nhap-kho?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải lịch sử xuất nhập kho.');
      }

      const rows = normalizeWarehouseMovements(data).filter(row => row.warehouseKind === warehouseTab);
      setMovements(rows);
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
  }, [warehouseTab, selectedType, fromDate, toDate]);

  const hasActiveFilters = selectedType !== 'all' || Boolean(fromDate) || Boolean(toDate) || Boolean(searchText);

  const resetFilters = () => {
    setSelectedType('all');
    setFromDate('');
    setToDate('');
    setSearchText('');
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMovements = useMemo(() => {
    return movements.filter(row => {
      if (!normalizedSearch) return true;
      return `${row.slipCode} ${row.shift} ${row.itemCode} ${row.itemName} ${row.reason} ${row.createdBy}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [movements, normalizedSearch]);

  useEffect(() => {
    setSelectedSlipCodes(new Set());
  }, [normalizedSearch]);

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
        createdAt: rows.reduce(
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
    return [...map.entries()].map(([slipDate, groups]) => ({
      slipDate,
      groups,
      totalAmount: groups.reduce((sum, group) => sum + group.totalAmount, 0)
    }));
  }, [slipGroups]);

  const sortedMovementLines = useMemo(
    () =>
      [...filteredMovements].sort((a, b) => {
        const byCreated = b.createdAt.localeCompare(a.createdAt);
        if (byCreated !== 0) return byCreated;
        const bySlip = (b.slipCode || '').localeCompare(a.slipCode || '', 'vi');
        if (bySlip !== 0) return bySlip;
        return (a.itemCode || '').localeCompare(b.itemCode || '', 'vi');
      }),
    [filteredMovements]
  );

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

  const viewingRows = viewingSlipCode
    ? filteredMovements.filter(row => row.slipCode === viewingSlipCode)
    : [];

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
        warehouseKind: row.warehouseKind,
        materials: weightCatalogMaterials,
        products: weightCatalogProducts
      });
      if (weight !== null) {
        total += weight;
        hasWeight = true;
      }
    }
    return hasWeight ? total : 0;
  }, [viewingRows, weightCatalogMaterials, weightCatalogProducts]);

  const handlePrintSlipByCode = (slipCode: string, autoPrint = false) => {
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const header = rows[0];
    if (!header) return;

    const totalAmount = rows.reduce((sum, row) => sum + row.lineAmount, 0);
    setHistoryPrintSlip({
      slipCode,
      slipType: header.slipType === 'xuat' ? 'xuat' : 'nhap',
      warehouseKind: header.warehouseKind,
      slipDate: header.slipDate,
      shift: header.shift,
      reason: header.reason,
      note: header.note,
      createdBy: header.createdBy,
      warehouseName: header.warehouseName,
      totalAmount,
      lines: rows.map(row => ({
        code: row.itemCode,
        name: row.itemName,
        unit: row.unit,
        quantity: row.quantity,
        documentQuantity: row.documentQuantity ?? null,
        unitPrice: row.unitPrice,
        lineAmount: row.lineAmount,
        weightKg: resolveWarehouseRowWeightKg(row),
        sourceInboundSlipCode: row.sourceInboundSlipCode
      }))
    });
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
        const payload = String(record.ma_sp_day_du ?? '').trim();
        const productCode = String(record.ma_sp_goc ?? '').trim();
        const movement = viewingRows.find(row => row.itemCode === payload)
          || viewingRows.find(row => row.itemCode.startsWith(`${productCode}_`));
        return {
          key: `${viewingSlipCode}-${index}-${payload}`,
          payload,
          productCode,
          productName: movement?.itemName || ''
        };
      }).filter(label => Boolean(label.payload));
      if (labels.length === 0) throw new Error('Phiếu nhập này chưa có mã QR chi tiết để in.');
      setHistoryQrLabels(labels);
      setHistoryQrPrintOpen(true);
    } catch (reason: unknown) {
      setHistoryQrError(reason instanceof Error ? reason.message : 'Không thể tải mã QR của phiếu nhập.');
    } finally {
      setIsLoadingHistoryQr(false);
    }
  };

  const handleEditSlip = (slipCode: string) => {
    if (!canEdit) {
      setError('Bạn không có quyền sửa phiếu thuộc kho này.');
      return;
    }
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const draft = buildWarehouseSlipDraftFromHistoryRows(rows, slipCode);
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
      const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, {
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
        const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, {
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
      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 px-4">
          {accessibleWarehouseTabs.map(([tab, label, Icon]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWarehouseTab(tab)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
                warehouseTab === tab ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex justify-end p-3">
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
      </section>

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={error}
        actionMessage={message}
      >
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
        />

        <FilterCombobox
          label="Loại"
          options={['nhap', 'xuat']}
          value={selectedType}
          onChange={value => setSelectedType(value as 'all' | WarehouseSlipType)}
          formatOption={value => warehouseSlipTypeLabel(value as WarehouseSlipType)}
          searchable={false}
          compact
        />

        <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} />
        <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
      </TableToolbar>

      {canDelete && selectableSlips.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-zinc-900/10 bg-zinc-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-zinc-600">
            {selectedCount > 0 ? `Đã chọn ${selectedCount} phiếu` : 'Chọn phiếu để xóa nhiều'}
          </p>
          <button
            type="button"
            disabled={selectedCount === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
            onClick={() => void handleBulkDelete()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Xóa đã chọn{selectedCount > 0 ? ` (${selectedCount})` : ''}
          </button>
        </section>
      )}

      {isLoading ? (
        <TableShell minWidthClassName="min-w-[900px]">
          <TableHead>
            <TableHeadCell className="w-10" align="center">
              {' '}
            </TableHeadCell>
            <TableHeadCell>Mã phiếu</TableHeadCell>
            <TableHeadCell>Loại</TableHeadCell>
            <TableHeadCell>Ca</TableHeadCell>
            <TableHeadCell>Người lập</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            <TableEmptyRow colSpan={6}>Đang tải Supabase...</TableEmptyRow>
          </TableBody>
        </TableShell>
      ) : slipDateGroups.length === 0 ? (
        <TableShell minWidthClassName="min-w-[900px]">
          <TableHead>
            <TableHeadCell className="w-10" align="center">
              {' '}
            </TableHeadCell>
            <TableHeadCell>Mã phiếu</TableHeadCell>
            <TableHeadCell>Loại</TableHeadCell>
            <TableHeadCell>Ca</TableHeadCell>
            <TableHeadCell>Người lập</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            <TableEmptyRow colSpan={6}>
              Chưa có lịch sử {warehouseKindLabel(warehouseTab).toLowerCase()}.
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
                  <span className="font-mono text-sm font-black text-zinc-900">{dateGroup.slipDate}</span>
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
              <TableShell minWidthClassName="min-w-[820px]">
                <TableHead>
                  <TableHeadCell className="w-10" align="center">
                    {canDelete ? (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={selectableSlips.length === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        title="Chọn tất cả"
                      />
                    ) : null}
                  </TableHeadCell>
                  <TableHeadCell>Mã phiếu</TableHeadCell>
                  <TableHeadCell>Loại</TableHeadCell>
                  <TableHeadCell>Ca</TableHeadCell>
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
                            {canDelete ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!group.slipCode || isBulkDeleting || isDeleting}
                                onChange={() => toggleSlipSelection(group.slipCode)}
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Chọn phiếu"
                              />
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-black text-zinc-950">
                            <div>{group.slipCode || '-'}</div>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                              {lineCount} dòng · {formatWarehouseMoney(group.totalAmount)} đ
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              label={warehouseSlipTypeLabel(header.slipType)}
                              color={header.slipType === 'nhap' ? 'emerald' : 'amber'}
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-zinc-700">{header.shift || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-600">{header.createdBy || '-'}</td>
                          <td className="px-4 py-3">
                            <RowActionsMenu label={`Thao tác phiếu ${group.slipCode}`}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setViewingSlipCode(group.slipCode)}
                                title="Xem chi tiết NVL"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              {canEdit ? (
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
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết từng dòng</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Cuộn để xem{' '}
              {warehouseTab === 'san_pham'
                ? 'từng dòng SP'
                : warehouseTab === 'hang_hong'
                  ? 'từng dòng hàng hỏng'
                : warehouseTab === 'hang_hoa'
                  ? 'từng dòng hàng hóa'
                : warehouseTab === 'cong_cu_dung_cu'
                  ? 'từng dòng công cụ dụng cụ'
                : warehouseTab === 'gia_cong'
                  ? 'từng dòng hàng gia công'
                : warehouseTab === 'tai_che'
                  ? 'từng dòng NVL tái chế'
                  : 'từng dòng NVL'}{' '}
              · {sortedMovementLines.length} dòng
            </p>
          </div>
        </div>

        <TableShell minWidthClassName="min-w-[1080px]" maxHeightClassName="max-h-[min(70vh,720px)]">
          <TableHead>
            <TableHeadCell>Mã phiếu</TableHeadCell>
            <TableHeadCell>Loại</TableHeadCell>
            <TableHeadCell>Ngày</TableHeadCell>
            <TableHeadCell>Ca</TableHeadCell>
            <TableHeadCell>{warehouseItemCodeLabel(warehouseTab)}</TableHeadCell>
            <TableHeadCell>{warehouseItemNameLabel(warehouseTab)}</TableHeadCell>
            <TableHeadCell className="text-right">SL</TableHeadCell>
            <TableHeadCell>ĐVT</TableHeadCell>
            <TableHeadCell className="text-right">Trọng lượng</TableHeadCell>
            <TableHeadCell className="text-right">Thành tiền</TableHeadCell>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableEmptyRow colSpan={10}>Đang tải dữ liệu...</TableEmptyRow>
            ) : sortedMovementLines.length === 0 ? (
              <TableEmptyRow colSpan={10}>
                Chưa có dòng{' '}
                {warehouseTab === 'san_pham'
                  ? 'sản phẩm'
                  : warehouseTab === 'hang_hong'
                    ? 'hàng hỏng'
                  : warehouseTab === 'hang_hoa'
                    ? 'hàng hóa'
                  : warehouseTab === 'cong_cu_dung_cu'
                    ? 'công cụ dụng cụ'
                  : warehouseTab === 'gia_cong'
                    ? 'hàng gia công'
                  : warehouseTab === 'tai_che'
                    ? 'NVL tái chế'
                    : 'NVL'}
                .
              </TableEmptyRow>
            ) : (
              sortedMovementLines.map((row, index) => (
                <React.Fragment key={row.id || `${row.slipCode}-${row.itemCode}-${index}`}>
                  <TableRow>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setViewingSlipCode(row.slipCode)}
                        className="font-black text-[#ef1b2d] underline-offset-2 hover:underline"
                        title="Xem phiếu"
                      >
                        {row.slipCode || '—'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        label={warehouseSlipTypeLabel(row.slipType)}
                        color={row.slipType === 'nhap' ? 'emerald' : 'amber'}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-700">
                      {row.slipDate || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-600">{row.shift || '—'}</td>
                    <td className="px-3 py-2.5 font-bold text-zinc-900">{row.itemCode || '—'}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5 font-semibold text-zinc-700" title={row.itemName || undefined}>
                      {row.itemName || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-800">
                      {formatNumber(row.quantity, 2)}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-zinc-600">{row.unit || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800">
                      {formatWarehouseWeightKg(resolveWarehouseRowWeightKg(row))}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-900">
                      {formatWarehouseMoney(row.lineAmount)} đ
                    </td>
                  </TableRow>
                </React.Fragment>
              ))
            )}
          </TableBody>
        </TableShell>
      </div>

      {viewingSlipCode && viewingRows[0] && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết phiếu</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {viewingSlipCode} · {viewingRows.length} dòng{' '}
                  {warehouseTab === 'san_pham' ? 'SP' : warehouseTab === 'hang_hong' ? 'hàng hỏng' : warehouseTab === 'tai_che' ? 'NVL tái chế' : 'NVL'}
                </p>
              </div>
              <BackButton onClick={() => setViewingSlipCode(null)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                {[
                  ['Kho', warehouseKindLabel(viewingRows[0].warehouseKind)],
                  ['Loại', warehouseSlipTypeLabel(viewingRows[0].slipType)],
                  ['Ngày', viewingRows[0].slipDate || '-'],
                  ['Ca', viewingRows[0].shift || '-'],
                  ['Tổng tiền', `${formatWarehouseMoney(viewingSlipTotal)} đ`],
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
              <div className="border-t border-zinc-200 px-4 py-3">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                  <tr>
                    <th className="py-2 pr-3 font-black">{warehouseItemCodeLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">{warehouseItemNameLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">SL</th>
                    <th className="py-2 pr-3 font-black">ĐVT</th>
                    <th className="py-2 pr-3 text-right font-black">Trọng lượng</th>
                    {viewingRows[0].slipType === 'xuat' && viewingRows[0].warehouseKind === 'nvl' ? (
                      <th className="py-2 pr-3 font-black">PN nhập</th>
                    ) : null}
                    <th className="py-2 pr-3 font-black">Giá</th>
                    <th className="py-2 font-black">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {viewingRows.map(row => (
                    <tr key={row.id || `${row.itemCode}-${row.quantity}`}>
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
                  Tổng tiền: <span className="text-[#ef1b2d]">{formatWarehouseMoney(viewingSlipTotal)} đ</span>
                </p>
                {historyQrError ? <p className="mt-1 text-xs font-semibold text-rose-700">{historyQrError}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit ? (
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
            </div>
          </div>
        </div>
      )}

      <WarehouseSlipPrintModal
        open={historyPrintOpen}
        data={historyPrintSlip}
        autoPrint={historyPrintAutoTrigger}
        onClose={() => {
          setHistoryPrintOpen(false);
          setHistoryPrintSlip(null);
          setHistoryPrintAutoTrigger(false);
        }}
      />

      <ProductQrPrintModal
        open={historyQrPrintOpen}
        labels={historyQrLabels}
        onClose={() => {
          setHistoryQrPrintOpen(false);
          setHistoryQrLabels([]);
        }}
      />
    </div>
  );
}

