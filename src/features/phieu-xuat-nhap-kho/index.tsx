import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  Eye,
  History,
  Loader2,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2
} from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
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
import { STORAGE_WAREHOUSE_SLIP_DRAFT_KEY } from '../_shared/storageKeys';
import { getProductionShiftOptions, normalizeShiftSettings, shiftNamesMatch } from '../../utils/shiftSettings';
import { normalizeProducts } from '../san-pham';
import { normalizeMaterialsInventory } from '../kho-nvl';
import type { ShiftSummaryWarehouseMovement } from '../../utils/controlBoardShiftSummary';
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
export type WarehouseKind = 'nvl' | 'san_pham';

export interface WarehouseMovementRow {
  id: string;
  slipCode: string;
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
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

  return {
    slipType: header.slipType,
    warehouseKind: header.warehouseKind,
    slipDate: header.slipDate,
    reason: header.reason || '',
    note: header.note || '',
    createdBy: header.createdBy || '',
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

export function warehouseKindLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Kho Sản phẩm' : 'Kho NVL';
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
  options?: { allowMissingUnitPrice?: boolean; requireInboundLot?: boolean }
): { error: string } | { items: WarehouseSlipPayloadItem[] } {
  const itemLabel = warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL';
  const codeLabel = warehouseItemCodeLabel(warehouseKind);
  const allowMissingUnitPrice = options?.allowMissingUnitPrice ?? false;
  const requireInboundLot = options?.requireInboundLot ?? false;

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
          Number.isFinite(documentQuantity) && documentQuantity > 0 ? documentQuantity : undefined,
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
  }
): WarehouseSlipPrintData {
  const printLines = items.map(item => ({
    code: item.code,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    documentQuantity: item.documentQuantity ?? item.suggestedQuantity ?? null,
    unitPrice: item.unitPrice,
    lineAmount: Math.round(item.quantity * item.unitPrice * 100) / 100,
    quotaQuantity: item.quotaQuantity ?? null,
    suggestedQuantity: item.suggestedQuantity ?? null,
    lineNote: item.lineNote,
    sourceInboundSlipCode: item.sourceInboundSlipCode
  }));

  return {
    slipCode: options.slipCode,
    slipType: options.slipType,
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
    totalAmount: printLines.reduce((sum, line) => sum + line.lineAmount, 0),
    lines: printLines
  };
}

export function formatWarehouseMoney(value: number) {
  return formatMoney(value, 0);
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
      const slipTypeRaw = String(record.loai_phieu ?? record.slipType ?? '').trim().toLowerCase();
      const slipType: WarehouseSlipType = slipTypeRaw === 'xuat' ? 'xuat' : 'nhap';
      const maSp = String(record.ma_sp ?? record.productCode ?? '').trim();
      const maNpl = String(record.ma_npl ?? record.materialCode ?? '').trim();
      const tenSp = String(record.ten_sp ?? record.productName ?? '').trim();
      const tenNpl = String(record.ten_npl ?? record.materialName ?? '').trim();
      const warehouseKindRaw = String(record.loai_kho ?? record.warehouseKind ?? '').trim().toLowerCase();
      // Có mã SP (không có mã NPL) → thành phẩm, kể cả bản ghi cũ thiếu/sai loai_kho
      const warehouseKind: WarehouseKind =
        warehouseKindRaw === 'san_pham' || (Boolean(maSp) && !maNpl) ? 'san_pham' : 'nvl';
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
    reason: row.reason || ''
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
        startDate: pickText(record, ['ngay_gio_bat_dau', 'ngay_bat_dau', 'ngay_san_xuat', 'start_date'], '').slice(0, 10),
        lines: parseWarehouseProductionOrderLines(record)
      };
    })
    .filter((order): order is WarehouseProductionOrderOption => Boolean(order));
}

export function WarehouseSlipPanel({
  onBack,
  onOpenHistory
}: {
  onBack: () => void;
  onOpenHistory: () => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('warehouse-slip');
  const [warehouseKind, setWarehouseKind] = useState<WarehouseKind>('nvl');
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
  const [warehouseLocation, setWarehouseLocation] = useState('Phú Thọ');
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
  const [editSlipCode, setEditSlipCode] = useState<string | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ReturnType<typeof normalizeShiftSettings>>([]);
  const [productionOrders, setProductionOrders] = useState<WarehouseProductionOrderOption[]>([]);
  const [isLoadingProductionOrders, setIsLoadingProductionOrders] = useState(true);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

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

      setWarehouseKind(draft.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl');
      setSlipType(draft.slipType === 'nhap' ? 'nhap' : 'xuat');
      if (draft.slipDate) setSlipDate(draft.slipDate);
      setReason(draft.reason || '');
      setNote(draft.note || '');
      setCreatedBy(draft.createdBy || '');
      setProductionOrderCodes(parseWarehouseProductionOrderSelection(draft.productionOrderRef));
      setProductionOrderSearch('');
      setMachine(draft.machine || '');
      setSelectedShifts(parseWarehouseShiftSelection(draft.shift));
      setRecipient(draft.recipient || '');
      setDeliverer(draft.deliverer || draft.recipient || '');
      setWarehouseLocation(draft.warehouseLocation || 'Phú Thọ');
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

  const handleWarehouseKindChange = (kind: WarehouseKind) => {
    setWarehouseKind(kind);
    setLines([createWarehouseLineDraft()]);
    setAvgInboundPriceByKey({});
    setFormError('');
    setActionMessage('');
  };

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

  const pickItem = (key: string, code: string) => {
    const item = itemOptions.find(option => option.code === code);
    const isExportNvl = warehouseKind === 'nvl' && slipType === 'xuat';
    const materialCode = code.trim();
    const cachedAvg =
      isExportNvl && materialCode
        ? avgInboundPriceByKey[avgPriceCacheKey(materialCode, slipDate)]
        : undefined;
    const immediatePrice =
      typeof cachedAvg === 'number' && cachedAvg > 0 ? formatSuggestedUnitPrice(cachedAvg) : '';

    updateLine(key, {
      code,
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
    });
    if (isExportNvl && materialCode) {
      void loadNvlAvgInboundPrice(materialCode, slipDate, {
        lineKey: key,
        applySuggestion: true,
        forceOverwrite: true
      });
    }
  };

  const isNvlExport = warehouseKind === 'nvl' && slipType === 'xuat';

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
    if (matchedShifts.size > 0) setSelectedShifts([...matchedShifts]);

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

  const toggleProductionOrder = (orderCode: string) => {
    applyProductionOrderSelection(toggleWarehouseProductionOrderSelection(productionOrderCodes, orderCode));
  };

  const filteredProductionOrders = useMemo(() => {
    const query = productionOrderSearch.trim().toLowerCase();
    if (!query) return productionOrders;
    return productionOrders.filter(order => {
      const hay = `${order.orderCode} ${order.shift} ${order.machine} ${order.startDate}`.toLowerCase();
      return hay.includes(query);
    });
  }, [productionOrders, productionOrderSearch]);

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
      warehouseKind,
      materials: warehouseKind === 'nvl' ? weightCatalog : [],
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
        warehouseKind,
        materials: warehouseKind === 'nvl' ? weightCatalog : [],
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
  const isNvlInbound = warehouseKind === 'nvl' && slipType === 'nhap';

  const handlePrintPreview = () => {
    void handleSave();
  };

  const handleSave = async () => {
    const linesForSave = isNvlExport
      ? lines.map(line => ({ ...line, sourceInboundLineId: '', sourceInboundSlipCode: '' }))
      : lines;
    const parsed = parseWarehouseSlipPayloadItems(linesForSave, warehouseKind, {
      allowMissingUnitPrice: false,
      requireInboundLot: false
    });
    if ('error' in parsed) {
      setFormError(showSaveFailure(parsed.error));
      return;
    }

    const payloadItems = parsed.items;
    setIsSaving(true);
    setFormError('');
    setActionMessage('');

    const isEditing = Boolean(editSlipCode);
    const slipPayload = {
      loaiPhieu: slipType,
      loaiKho: warehouseKind,
      ngayPhieu: slipDate,
      lyDo: reason.trim(),
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

      setPrintSlip(
        buildWarehouseSlipPrintData(payloadItems, {
          slipCode: savedSlipCode,
          slipType,
          warehouseKind,
          slipDate,
          reason: reason.trim(),
          note: note.trim(),
          createdBy: createdBy.trim(),
          productionOrderRef: productionOrderLabel,
          machine: machine.trim(),
          shift: shiftLabel,
          recipient: recipient.trim(),
          deliverer: deliverer.trim(),
          warehouseLocation: warehouseLocation.trim()
        })
      );
      setPrintAutoTrigger(false);
      setPrintModalOpen(true);
      const okMsg = isEditing
        ? `Đã cập nhật phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}). Xem tại Lịch sử xuất nhập kho.`
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

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm space-y-4">
        <div>
          <p className="text-sm font-black text-zinc-950">Loại kho</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">Chọn kho NVL hoặc kho Sản phẩm trước khi lập phiếu</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            ['nvl', 'Kho NVL', Boxes],
            ['san_pham', 'Kho Sản phẩm', Package]
          ] as const).map(([kind, label, Icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => handleWarehouseKindChange(kind)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition ${
                warehouseKind === kind
                  ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">Tổng tiền phiếu</p>
              <p className="mt-1 text-2xl font-black text-zinc-950">{formatWarehouseMoney(slipTotal)} đ</p>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Tự động cộng thành tiền các dòng (Giá × Số lượng)
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Quy đổi khối lượng</p>
              <p className="mt-1 text-2xl font-black text-zinc-950">{formatWarehouseWeightKg(slipTotalWeightKg)}</p>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Tự động quy đổi SL × định mức kg (kg, tấn, g hoặc theo danh mục {warehouseKind === 'san_pham' ? 'SP' : 'NVL'})
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-black text-zinc-950">Thông tin phiếu</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            {warehouseSlipTypeLabel(slipType)} · {warehouseKindLabel(warehouseKind)}
          </p>
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
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition ${
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày phiếu *</span>
            <input type="date" value={slipDate} onChange={event => setSlipDate(event.target.value)} className={warehouseFieldClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người lập</span>
            <input value={createdBy} onChange={event => setCreatedBy(event.target.value)} className={warehouseFieldClass} placeholder="Tên người lập phiếu" />
          </label>
          {slipType === 'nhap' ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người giao hàng</span>
                <input
                  value={deliverer}
                  onChange={event => setDeliverer(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="Họ tên người giao hàng"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Địa điểm</span>
                <input
                  value={warehouseLocation}
                  onChange={event => setWarehouseLocation(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="VD: Phú Thọ"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
                <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Xuất sản xuất..." />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Ghi chú thêm (tuỳ chọn)" />
              </label>
            </>
          )}
          <div className="block space-y-1.5 sm:col-span-2 lg:col-span-4">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              {isNvlInbound ? (
                <>
                  Ca{' '}
                  <span className="font-semibold normal-case tracking-normal text-zinc-400">
                    (không bắt buộc)
                  </span>
                </>
              ) : (
                'Ca'
              )}
            </span>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
              {shiftOptions.length === 0 ? (
                <p className="text-xs font-semibold text-zinc-400">Chưa có ca trong cài đặt.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {shiftOptions.map(option => {
                    const checked = selectedShifts.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                          checked
                            ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedShifts(current => toggleWarehouseShiftSelection(current, option.value))
                          }
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedShifts.length > 0 ? (
                <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                  Đã chọn: {shiftLabel}
                </p>
              ) : isNvlInbound ? (
                <p className="mt-1.5 text-[11px] font-semibold text-zinc-400">
                  Có thể bỏ trống ca khi nhập kho NVL.
                </p>
              ) : null}
            </div>
          </div>
          {slipType === 'nhap' ? (
            <>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
                <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Nhập mua ngoài, xuất sản xuất..." />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder="Số chứng từ gốc kèm theo..." />
              </label>
            </>
          ) : null}
          <div className="relative block space-y-1.5 sm:col-span-2 lg:col-span-4">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Mã đơn hàng / Lệnh SX{' '}
              <span className="font-semibold normal-case tracking-normal text-zinc-400">
                (chọn nhiều)
              </span>
            </span>
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
              <button
                type="button"
                onClick={() => setLines(current => [...current, createWarehouseLineDraft()])}
                className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm dòng
              </button>
            ) : null}
          </div>

          <div
            className={
              slipType === 'nhap'
                ? 'hidden xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_5.5rem_6.5rem_7.5rem_2.5rem] xl:gap-3 xl:border-b xl:border-zinc-200/80 xl:pb-1.5'
                : 'hidden xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6rem_6rem_6.5rem_7.5rem_2.5rem] xl:gap-3 xl:border-b xl:border-zinc-200/80 xl:pb-1.5'
            }
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {warehouseItemCodeLabel(warehouseKind)} *
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {warehouseItemNameLabel(warehouseKind)}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đơn vị</span>
            {slipType === 'nhap' ? (
              <>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Theo chứng từ</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Thực nhập *</span>
              </>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số lượng *</span>
            )}
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Quy đổi kg</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Giá</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Thành tiền</span>
            <span />
          </div>

          <div className="divide-y divide-zinc-200/80">
            {lines.map(line => (
              <div
                key={line.key}
                className={
                  slipType === 'nhap'
                    ? 'grid grid-cols-1 gap-3 py-2 first:pt-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_5.5rem_6.5rem_7.5rem_2.5rem] xl:items-center xl:gap-3'
                    : 'grid grid-cols-1 gap-3 py-2 first:pt-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6rem_6rem_6.5rem_7.5rem_2.5rem] xl:items-center xl:gap-3'
                }
              >
                <div className="sm:col-span-2 xl:col-span-1">
                  <SearchableSelect
                    value={line.code}
                    onChange={code => pickItem(line.key, code)}
                    options={itemOptions}
                    placeholder={warehouseKind === 'san_pham' ? 'Gõ để tìm mã SP' : 'Gõ để tìm mã NPL'}
                    isLoading={isLoadingItems}
                    disabled={isLoadingItems}
                    inputClassName={warehouseFieldClass}
                    desktopAutoFlip
                    getLabel={item => {
                      const option = item as MaterialOption;
                      return `${option.code} · ${option.name}`;
                    }}
                    getValue={item => (item as MaterialOption).code}
                  />
                </div>
                <div>
                  <input
                    value={line.name}
                    onChange={event => updateLine(line.key, { name: event.target.value })}
                    className={warehouseFieldClass}
                  />
                </div>
                <div>
                  <input
                    value={line.unit}
                    onChange={event => updateLine(line.key, { unit: event.target.value })}
                    className={warehouseFieldClass}
                  />
                </div>
                {slipType === 'nhap' ? (
                  <>
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                        Theo chứng từ
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.documentQuantity || ''}
                        onChange={event => updateLine(line.key, { documentQuantity: event.target.value })}
                        className={warehouseFieldClass}
                        placeholder="SL CT"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                        Thực nhập *
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={event => updateLine(line.key, { quantity: event.target.value })}
                        className={warehouseFieldClass}
                        placeholder="SL thực"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={event => updateLine(line.key, { quantity: event.target.value })}
                      className={warehouseFieldClass}
                      placeholder="VD: 100,00"
                    />
                  </div>
                )}
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                    Quy đổi kg
                  </span>
                  <div className={`${warehouseFieldClass} flex items-center whitespace-nowrap bg-emerald-50/60 font-mono font-bold text-emerald-800`}>
                    {formatWarehouseWeightKg(resolveLineWeightKg(line))}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                    Giá
                  </span>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={line.unitPrice}
                      onChange={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                      onBlur={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                      className={`${warehouseFieldClass} ${
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
                            ? 'Đang lấy giá BQ...'
                            : (() => {
                                const avg = avgInboundPriceByKey[avgPriceCacheKey(line.code, slipDate)];
                                return avg && avg > 0
                                  ? `Gợi ý BQ: ${formatWarehouseMoney(avg)}`
                                  : 'VD: 25.000';
                              })()
                          : 'VD: 25.000'
                      }
                    />
                    {isNvlExport && avgPriceLoadingCode === line.code.trim() ? (
                      <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber-600" />
                    ) : null}
                  </div>
                </div>
                <div>
                  <div
                    className={`${warehouseFieldClass} flex items-center justify-end whitespace-nowrap bg-white font-mono font-bold tabular-nums text-zinc-900`}
                  >
                    {formatWarehouseMoney(computeWarehouseLineAmount(line.quantity, line.unitPrice))}
                  </div>
                </div>
                {lines.length > 1 && canDelete ? (
                  <button
                    type="button"
                    onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    title="Xóa dòng"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] font-semibold text-zinc-500">
            Phiếu chỉ xuất hiện trong lịch sử sau khi bấm <strong>Lưu &amp; in</strong> hoặc <strong>In phiếu</strong>.
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
        }}
      />
    </div>
  );
}

export function WarehouseHistoryPanel({
  onBack,
  onOpenSlip
}: {
  onBack: () => void;
  onOpenSlip: () => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('warehouse-slip');
  const [warehouseTab, setWarehouseTab] = useState<WarehouseKind>('nvl');
  const [movements, setMovements] = useState<WarehouseMovementRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | WarehouseSlipType>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
      warehouseKind: row.warehouseKind,
      materials: weightCatalogMaterials,
      products: weightCatalogProducts
    });

  useEffect(() => {
    void loadWeightCatalog();
  }, []);

  const loadMovements = async () => {
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

      setMovements(normalizeWarehouseMovements(data));
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
        totalAmount: rows.reduce((sum, row) => sum + row.lineAmount, 0)
      }))
      .sort((a, b) => {
        const byDate = (b.header.slipDate || '').localeCompare(a.header.slipDate || '');
        if (byDate !== 0) return byDate;
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
        const byDate = (b.slipDate || '').localeCompare(a.slipDate || '');
        if (byDate !== 0) return byDate;
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
      slipType: header.slipType,
      warehouseKind: header.warehouseKind,
      slipDate: header.slipDate,
      shift: header.shift,
      reason: header.reason,
      note: header.note,
      createdBy: header.createdBy,
      totalAmount,
      lines: rows.map(row => ({
        code: row.itemCode,
        name: row.itemName,
        unit: row.unit,
        quantity: row.quantity,
        documentQuantity: row.documentQuantity ?? null,
        unitPrice: row.unitPrice,
        lineAmount: row.lineAmount,
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

  const handleEditSlip = (slipCode: string) => {
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const draft = buildWarehouseSlipDraftFromHistoryRows(rows, slipCode);
    if (!draft) return;

    localStorage.setItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY, JSON.stringify({ ...draft, createdAt: Date.now() }));
    setViewingSlipCode(null);
    onOpenSlip();
  };

  const handleDeleteSlip = async (slipCode: string, lineCount: number) => {
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
        <div className="flex gap-1 border-b border-zinc-200 px-4">
          {([
            ['nvl', 'Kho NVL', Boxes],
            ['san_pham', 'Kho Sản phẩm', Package]
          ] as const).map(([tab, label, Icon]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWarehouseTab(tab)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
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
          placeholder={warehouseTab === 'san_pham' ? 'Tìm mã phiếu, SP, lý do...' : 'Tìm mã phiếu, NPL, lý do...'}
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
              Cuộn để xem {warehouseTab === 'san_pham' ? 'từng dòng SP' : 'từng dòng NVL'} · {sortedMovementLines.length} dòng
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
                Chưa có dòng {warehouseTab === 'san_pham' ? 'sản phẩm' : 'NVL'}.
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
                  {viewingSlipCode} · {viewingRows.length} dòng {warehouseTab === 'san_pham' ? 'SP' : 'NVL'}
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
                <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
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
              <p className="text-sm font-black text-zinc-950">
                Tổng tiền: <span className="text-[#ef1b2d]">{formatWarehouseMoney(viewingSlipTotal)} đ</span>
              </p>
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
    </div>
  );
}

