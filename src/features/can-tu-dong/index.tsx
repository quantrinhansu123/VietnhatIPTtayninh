import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Copy,
  FileSpreadsheet,
  Link2,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Scale,
  Sparkles,
  Trash2,
  Warehouse,
  X
} from 'lucide-react';
import {
  buildCanTuDongPrintData,
  CanTuDongPrintBatch,
  type CanTuDongPrintData
} from '../../components/CanTuDongPrintSheet';
import { formatNumber } from '../../utils';
import { machineSlipCodeToken } from '../../utils/warehouseSlipCode';
import { waitForPrintImagesReady } from '../../utils/printReady';
import { downloadCanTuDongExcel } from '../../utils/canTuDongExcel';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import { normalizeProductCodeKey } from '../san-pham/types';
import { normalizeProducts } from '../san-pham/index';
import {
  buildCanTuDongFilmKgByProductCode,
  canTuDongShiftMatches,
  DEFAULT_CAN_TU_DONG_BI_KG,
  parseCanTuDongQrProductCode,
  replaceCanTuDongQrProductCode,
  resolveCanSpKg,
  resolveCanTuDongBusinessDate,
  resolveCanTuDongMachine,
  resolveCanTuDongProductionOrder,
  buildLsxQtyByLenhAndSp,
  lookupLsxQty,
  resolveTrongLuongBiKg,
  resolveCanTuDongNhuaThucTeKg,
  resolveNhuaDinhMucKg,
  sumCanTuDongNhuaTieuChuanKg,
  sumCanTuDongNhuaDinhMucKg,
  sumCanTuDongCanSanPhamKg,
  sumCanTuDongLoiTieuChuanKg,
  sumCanTuDongCanLoiKg,
  sumCanTuDongFilmKg,
  sumCanTuDongSanLuongTotals
} from '../../utils/canTuDongWeights';
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
  TableEmptyRow
} from '../../components/shared/table';

const CAN_TU_DONG_PORTRAIT_STYLE_ID = 'can-tu-dong-print-page-portrait';

function enableCanTuDongPortraitPrintPage() {
  document.getElementById(CAN_TU_DONG_PORTRAIT_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = CAN_TU_DONG_PORTRAIT_STYLE_ID;
  style.media = 'print';
  style.textContent = '@page { size: 210mm 297mm; margin: 8mm; }';
  document.head.appendChild(style);
}

function disableCanTuDongPortraitPrintPage() {
  document.getElementById(CAN_TU_DONG_PORTRAIT_STYLE_ID)?.remove();
}

/**
 * Ý nghĩa cột DB / hiển thị:
 * - tare_weight      = Cân lõi
 * - weight           = Cân sản phẩm (còn lõi)
 * - Trọng lượng bì   = mặc định 0,16 kg
 * - Nhựa thực tế = SP − lõi − bì − màng (BOM / cuộn)
 * - Nhựa định mức = san_pham.trong_luong_nhua (hoặc TL − lõi − bì)
 * - core_image_*     = Ảnh cân lõi
 * - product_image_*  = Ảnh cân sản phẩm
 */
export type CanTuDongRecord = {
  id: number | string;
  event_id?: string | null;
  qr_code?: string | null;
  /** Ca sản xuất (SOURCE_SHIFT metadata hoặc suy từ giờ captured_at). */
  ca?: string | null;
  /** Cột Ngày (SOURCE_DATE / work_date) — không phải ngày cân. */
  ngay?: string | null;
  /** Lệnh SX (metadata.production_order / SOURCE_PRODUCTION_ORDER). */
  lenh_sx?: string | null;
  ma_lenh_sx?: string | null;
  /** Máy (metadata.machine / SOURCE_MACHINE). */
  may?: string | null;
  machine?: string | null;
  /** Cân sản phẩm (còn lõi) */
  weight?: number | string | null;
  /** Cân lõi */
  tare_weight?: number | string | null;
  /** Khối lượng thực */
  net_weight?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  product_image_path?: string | null;
  product_image_url?: string | null;
  product_image_public_id?: string | null;
  product_preview_url?: string | null;
  preview_url?: string | null;
  core_image_path?: string | null;
  core_image_url?: string | null;
  core_image_public_id?: string | null;
  core_preview_url?: string | null;
  can_loi?: number | string | null;
  can_san_pham?: number | string | null;
  khoi_luong_thuc?: number | string | null;
  device_id?: string | null;
  weight_source?: string | null;
  status?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

/** Giá trị nút «Tự động điền». */
const AUTO_FILL_NGAY = '2026-08-20';
const AUTO_FILL_LENH_SX = 'LSX-DH056';
const AUTO_FILL_CA = '12C2';
const AUTO_FILL_MAY = 'Máy Bao Bì';
const AUTO_FILL_CHUNK = 80;

async function postCanTuDongBulkAutofill(
  ids: Array<string | number>,
  payload: { ngay: string; ca: string; may: string; lenh_sx?: string; all?: boolean }
) {
  if (payload.all) {
    const res = await fetch('/api/can-tu-dong/bulk-autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        all: true,
        ngay: payload.ngay,
        ca: payload.ca,
        may: payload.may,
        ...(payload.lenh_sx ? { lenh_sx: payload.lenh_sx } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể tự động điền các dòng cân tự động.');
    }
    return Number(data.updated) || 0;
  }

  let updated = 0;
  for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
    const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
    const res = await fetch('/api/can-tu-dong/bulk-autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk, ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể tự động điền các dòng cân tự động.');
    }
    updated += Number(data.updated) || chunk.length;
  }
  return updated;
}

async function postCanTuDongBulkSetNgay(ids: Array<string | number>, ngay: string) {
  let updated = 0;
  for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
    const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
    const res = await fetch('/api/can-tu-dong/bulk-set-ngay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk, ngay })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể đổi Ngày các dòng cân tự động.');
    }
    updated += Number(data.updated) || chunk.length;
  }
  return updated;
}

async function postCanTuDongBulkSetMaSp(ids: Array<string | number>, maSp: string) {
  let updated = 0;
  for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
    const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
    const res = await fetch('/api/can-tu-dong/bulk-set-ma-sp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk, ma_sp: maSp })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể đồng bộ Mã SP các dòng cân tự động.');
    }
    updated += Number(data.updated) || chunk.length;
  }
  return updated;
}

/** YYYY-MM-DD theo lịch máy (hôm nay). */
function localIsoDateToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Hiển thị YYYY-MM-DD → dd/MM/yyyy. */
function formatIsoDateVi(iso?: string | null) {
  const raw = String(iso ?? '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Ngày giờ cân (`captured_at`) — theo dõi thời điểm ghi nhận. */
function formatCapturedAtVi(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function formatWeight(
  value?: number | string | null,
  unit?: string | null,
  fractionDigits: number = 1
) {
  if (value == null || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return String(value);
  const unitLabel = String(unit ?? 'kg').trim() || 'kg';
  return `${formatNumber(num, fractionDigits)} ${unitLabel}`;
}

/** Hiển thị kg đúng giá trị BOM — không làm tròn. */
function formatWeightExact(value?: number | string | null, unit?: string | null) {
  if (value == null || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return String(value);
  const unitLabel = String(unit ?? 'kg').trim() || 'kg';
  const text = String(num).replace('.', ',');
  return `${text} ${unitLabel}`;
}

function asWeightNumber(value?: number | string | null): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

/** Chênh lệch nhựa = Nhựa thực tế − Nhựa định mức; % = chênh lệch ÷ Nhựa thực tế × 100. */
function resolveNhuaChenhLechVaPhanTram(
  nhuaThucTe: number | null,
  nhuaDinhMuc: number | null
) {
  if (nhuaThucTe === null || nhuaDinhMuc === null) {
    return { chenhLech: null as number | null, phanTram: null as number | null };
  }
  const chenhLech = nhuaThucTe - nhuaDinhMuc;
  const phanTram = nhuaThucTe !== 0 ? (chenhLech / nhuaThucTe) * 100 : null;
  return { chenhLech, phanTram };
}

function formatSignedPercent(value: number | null, fractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, fractionDigits)}%`;
}

function statusClass(status?: string | null) {
  const key = String(status ?? '')
    .trim()
    .toLowerCase();
  if (key === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (key === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key === 'rejected' || key === 'error') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

const NHAP_KHO_CHO = 'Chờ nhập kho';
const NHAP_KHO_DA = 'Đã nhập kho';

function isFinishedGoodsWarehouseName(value: string) {
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
  return key.includes('thanh pham') || key.includes('san pham') || key.includes('finished') || key.includes('kho sp');
}

function newPhieuNhapCode(machineName: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const token = machineSlipCodeToken(machineName);
  return token ? `PN-${token}-${date}-${time}` : `PN-${date}-${time}`;
}

function nhapKhoQrKey(qr: string) {
  return qr.trim().toUpperCase();
}

/** Mỗi dòng cân có mã QR đều được đẩy, kể cả mã lặp trong danh sách hoặc đã có trong nhap_kho. */
function queueNhapKhoRows(rows: CanTuDongRecord[]) {
  const eligible = rows.filter(row => nhapKhoQrKey(String(row.qr_code || '')));
  return { eligible };
}

function readNhapKho(row: CanTuDongRecord) {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const status = String(meta.nhap_kho_trang_thai || '').trim() || NHAP_KHO_CHO;
  return {
    status,
    at: String(meta.nhap_kho_luc || '').trim(),
    by: String(meta.nhap_kho_boi || '').trim(),
    waiting: status !== NHAP_KHO_DA
  };
}

function formatNhapKhoTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
}

function rowIdKey(id: number | string) {
  return String(id);
}

function resolveRowMaSp(row: CanTuDongRecord): string {
  return parseCanTuDongQrProductCode(row.qr_code);
}

function resolveRowLenhSx(row: CanTuDongRecord): string {
  return String(resolveCanTuDongProductionOrder(row) ?? '').trim();
}

function lenhSxMatches(rowLenh: string, filter: string): boolean {
  if (filter === 'all') return true;
  return rowLenh.trim().toUpperCase() === filter.trim().toUpperCase();
}

function resolveRowMay(row: CanTuDongRecord): string {
  return String(resolveCanTuDongMachine(row) ?? '').trim();
}

function mayMatches(rowMay: string, filter: string): boolean {
  if (filter === 'all') return true;
  return rowMay.trim().toLocaleLowerCase('vi') === filter.trim().toLocaleLowerCase('vi');
}

function normalizeQrKey(qr?: string | null): string {
  return String(qr ?? '').trim();
}

export function CanTuDongPanel({
  onBack,
  currentUser,
  initialFilters
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const [records, setRecords] = useState<CanTuDongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSettingNgay, setIsSettingNgay] = useState(false);
  const [isSettingMaSp, setIsSettingMaSp] = useState(false);
  const [showBulkNgayModal, setShowBulkNgayModal] = useState(false);
  const [bulkNgayValue, setBulkNgayValue] = useState(() => localIsoDateToday());
  const [bulkNgayScope, setBulkNgayScope] = useState<'visible' | 'selected'>('selected');
  const [showBulkMaSpModal, setShowBulkMaSpModal] = useState(false);
  /** `prefix` = đồng bộ từng dòng theo tiền tố QR; `pick` = điền một Mã SP đã chọn. */
  const [bulkMaSpMode, setBulkMaSpMode] = useState<'prefix' | 'pick'>('prefix');
  const [bulkMaSpValue, setBulkMaSpValue] = useState('');
  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  /** Dropdown chọn đúng 1 mã (`all` = không chọn). */
  const [maSpFilter, setMaSpFilter] = useState('all');
  /** Ô tìm — lọc chứa chuỗi trong Mã SP / QR / tên SP. */
  const [maSpQuery, setMaSpQuery] = useState('');
  /** Lọc cột Ngày (SOURCE_DATE / work_date) — mặc định hôm nay để không tải cả bảng. */
  const [fromDate, setFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || localIsoDateToday()
  );
  const [toDate, setToDate] = useState(() => initialFilters?.dateTo?.trim() || localIsoDateToday());
  /** Lọc cột Ca (`all` = tất cả). */
  const [caFilter, setCaFilter] = useState(() => initialFilters?.shift?.trim() || 'all');
  /** Lọc cột Máy (`all` = tất cả). */
  const [mayFilter, setMayFilter] = useState('all');
  /** Lọc Lệnh SX (`all` = tất cả). */
  const [lenhSxFilter, setLenhSxFilter] = useState('all');
  /** Chỉ hiện dòng có mã QR trùng trong phạm vi bộ lọc ngày/ca/Mã SP. */
  const [onlyDuplicateQr, setOnlyDuplicateQr] = useState(false);
  const [dayKhoFilter, setDayKhoFilter] = useState<'all' | typeof NHAP_KHO_CHO | typeof NHAP_KHO_DA>('all');
  const [editingRecord, setEditingRecord] = useState<CanTuDongRecord | null>(null);
  const [editForm, setEditForm] = useState({ qr_code: '', ca: '', tare_weight: '', weight: '', unit: 'kg', device_id: '', status: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [productUnitByCode, setProductUnitByCode] = useState<Map<string, string>>(() => new Map());
  const [productStandardWeightByCode, setProductStandardWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [productCoreWeightByCode, setProductCoreWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [productPlasticWeightByCode, setProductPlasticWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [productFilmWeightByCode, setProductFilmWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  /** `MA_LENH|MA_SP` → so_luong dòng trên lệnh SX. */
  const [lsxQtyByLenhAndSp, setLsxQtyByLenhAndSp] = useState<Map<string, number>>(() => new Map());
  /** Mã SP gốc trong danh mục (hiển thị combobox đồng bộ). */
  const [productCatalogCodes, setProductCatalogCodes] = useState<string[]>([]);
  const [printData, setPrintData] = useState<CanTuDongPrintData | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [showNhapKhoModal, setShowNhapKhoModal] = useState(false);
  const [nhapKhoSoCuon, setNhapKhoSoCuon] = useState('');
  const [isNhapKho, setIsNhapKho] = useState(false);
  const [isResettingNhapKho, setIsResettingNhapKho] = useState(false);
  const [togglingNhapKhoId, setTogglingNhapKhoId] = useState('');
  const [isCheckingNhapKho, setIsCheckingNhapKho] = useState(false);
  /** Mã QR (in hoa) → các mã phiếu nhập đã có trong bảng nhap_kho. */
  const [nhapKhoHits, setNhapKhoHits] = useState<Map<string, string[]>>(new Map());
  const [nhapKhoChecked, setNhapKhoChecked] = useState(false);
  const [nhapKhoWarehouses, setNhapKhoWarehouses] = useState<string[]>([]);
  const [nhapKhoKho, setNhapKhoKho] = useState('');
  const [nhapKhoSlipDate, setNhapKhoSlipDate] = useState(() => localIsoDateToday());
  const [nhapKhoCa, setNhapKhoCa] = useState('');
  const [nhapKhoMay, setNhapKhoMay] = useState('');
  const [nhapKhoMaSp, setNhapKhoMaSp] = useState('');
  const [loadingNhapKhoKho, setLoadingNhapKhoKho] = useState(false);

  const loadSeqRef = useRef(0);
  const loadRecords = async (range?: { from?: string; to?: string }) => {
    const seq = ++loadSeqRef.current;
    let from = String(range?.from ?? fromDate).trim();
    let to = String(range?.to ?? toDate).trim();
    if (!from && !to) {
      from = localIsoDateToday();
      to = from;
    }
    setLoading(true);
    setError('');
    try {
      // dateBy=ngay: chỉ lấy cột Ngày trong khoảng, không kéo cả bảng. images=0: không ký từng ảnh.
      const params = new URLSearchParams({ all: '1', images: '0', dateBy: 'ngay' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(res, errorData, 'Không tải được cân tự động.'));
      }
      const payload = await res.json();
      if (seq !== loadSeqRef.current) return;
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setSelectedIds(new Set());
    } catch (err: any) {
      if (seq !== loadSeqRef.current) return;
      const message = err?.message || 'Không tải được cân tự động.';
      setError(message);
      setRecords([]);
      setSelectedIds(new Set());
      showAppToast(message, 'error');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords({ from: fromDate, to: toDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tải lại khi đổi khoảng Ngày
  }, [fromDate, toDate]);

  const applyProductCatalog = (products: ReturnType<typeof normalizeProducts>) => {
    const nameMap = new Map<string, string>();
    const unitMap = new Map<string, string>();
    const weightMap = new Map<string, number>();
    const coreMap = new Map<string, number>();
    const plasticMap = new Map<string, number>();
    const catalogCodes = new Set<string>();
    for (const product of products) {
      const standard = Number(String(product.totalWeight ?? '').replace(',', '.'));
      const core = Number(String(product.coreWeight ?? '').replace(',', '.'));
      const plastic = Number(String(product.plasticWeight ?? '').replace(',', '.'));
      for (const c of [product.code, product.newCode, product.amisCode]) {
        const raw = String(c ?? '').trim();
        if (raw) catalogCodes.add(raw);
        const key = normalizeProductCodeKey(c);
        if (!key) continue;
        if (product.name) nameMap.set(key, product.name);
        const unit = String(product.unit ?? '').trim();
        if (unit && unit !== '-') unitMap.set(key, unit);
        if (Number.isFinite(standard) && standard > 0) weightMap.set(key, standard);
        if (Number.isFinite(core) && core > 0) coreMap.set(key, core);
        if (Number.isFinite(plastic) && plastic > 0) plasticMap.set(key, plastic);
      }
    }
    const filmMap = buildCanTuDongFilmKgByProductCode(products);
    setProductNameByCode(nameMap);
    setProductUnitByCode(unitMap);
    setProductStandardWeightByCode(weightMap);
    setProductCoreWeightByCode(coreMap);
    setProductPlasticWeightByCode(plasticMap);
    setProductFilmWeightByCode(filmMap);
    setProductCatalogCodes(
      [...catalogCodes].sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }))
    );
    return { nameMap, weightMap, coreMap, plasticMap, filmMap };
  };

  const loadProductCatalog = async () => {
    const res = await fetch('/api/san-pham?format=table');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(readApiErrorMessage(res, data, 'Không thể tải danh mục sản phẩm.'));
    }
    return applyProductCatalog(normalizeProducts(data));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        if (!cancelled) applyProductCatalog(normalizeProducts(data));
      } catch {
        if (!cancelled) {
          setProductNameByCode(new Map());
          setProductUnitByCode(new Map());
          setProductStandardWeightByCode(new Map());
          setProductCoreWeightByCode(new Map());
          setProductPlasticWeightByCode(new Map());
          setProductFilmWeightByCode(new Map());
          setProductCatalogCodes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/lenh-sx');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const orders = Array.isArray(data?.productionOrders) ? data.productionOrders : [];
        if (!cancelled) setLsxQtyByLenhAndSp(buildLsxQtyByLenhAndSp(orders));
      } catch {
        if (!cancelled) setLsxQtyByLenhAndSp(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingPrint || !printData) return;
    let cancelled = false;
    document.body.classList.add('can-tu-dong-print-active');
    enableCanTuDongPortraitPrintPage();
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady()
        .then(() => {
          if (cancelled) return;
          return new Promise<void>(resolve => {
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => resolve());
            });
          });
        })
        .then(() => {
          if (cancelled) return;
          window.print();
        })
        .catch(() => {
          showAppToast('Không thể mở hộp thoại in.', 'error');
        })
        .finally(() => {
          if (!cancelled) setPendingPrint(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printData]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('can-tu-dong-print-active');
      disableCanTuDongPortraitPrintPage();
      setPrintData(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('can-tu-dong-print-active');
      disableCanTuDongPortraitPrintPage();
    };
  }, []);

  const recordsByDate = useMemo(() => {
    if (!fromDate && !toDate) return records;
    return records.filter(row => {
      const ngay = resolveCanTuDongBusinessDate(row);
      if (!ngay) return false;
      if (fromDate && ngay < fromDate) return false;
      if (toDate && ngay > toDate) return false;
      return true;
    });
  }, [records, fromDate, toDate]);

  const caOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of recordsByDate) {
      const ca = String(row.ca ?? '').trim();
      if (ca) set.add(ca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByDate]);

  const recordsByCa = useMemo(() => {
    if (caFilter === 'all') return recordsByDate;
    return recordsByDate.filter(row => canTuDongShiftMatches(String(row.ca ?? ''), caFilter));
  }, [recordsByDate, caFilter]);

  const mayOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of recordsByCa) {
      const may = resolveRowMay(row);
      if (may) set.add(may);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByCa]);

  const recordsByMay = useMemo(() => {
    if (mayFilter === 'all') return recordsByCa;
    return recordsByCa.filter(row => mayMatches(resolveRowMay(row), mayFilter));
  }, [recordsByCa, mayFilter]);

  const lenhSxOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of recordsByMay) {
      const lenhSx = resolveRowLenhSx(row);
      if (lenhSx) set.add(lenhSx);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByMay]);

  const recordsByLenhSx = useMemo(() => {
    if (lenhSxFilter === 'all') return recordsByMay;
    return recordsByMay.filter(row => lenhSxMatches(resolveRowLenhSx(row), lenhSxFilter));
  }, [recordsByMay, lenhSxFilter]);

  const maSpOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of recordsByLenhSx) {
      const maSp = resolveRowMaSp(row);
      const key = normalizeProductCodeKey(maSp);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, maSp);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByLenhSx]);

  const bulkMaSpOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const code of productCatalogCodes) {
      const key = normalizeProductCodeKey(code);
      if (key && !byKey.has(key)) byKey.set(key, code);
    }
    for (const code of maSpOptions) {
      const key = normalizeProductCodeKey(code);
      if (key && !byKey.has(key)) byKey.set(key, code);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [productCatalogCodes, maSpOptions]);

  const recordsByMaSp = useMemo(() => {
    const queryKey = normalizeProductCodeKey(maSpQuery);
    const pickKey = maSpFilter === 'all' ? '' : normalizeProductCodeKey(maSpFilter);
    if (!queryKey && !pickKey) return recordsByLenhSx;
    return recordsByLenhSx.filter(row => {
      const maSp = resolveRowMaSp(row);
      const maSpKey = normalizeProductCodeKey(maSp);
      if (pickKey && maSpKey !== pickKey) return false;
      if (!queryKey) return true;
      if (maSpKey.includes(queryKey)) return true;
      const qrKey = normalizeProductCodeKey(String(row.qr_code || ''));
      if (qrKey.includes(queryKey)) return true;
      const name = maSpKey ? productNameByCode.get(maSpKey) : '';
      if (name && normalizeProductCodeKey(name).includes(queryKey)) return true;
      return false;
    });
  }, [recordsByLenhSx, maSpFilter, maSpQuery, productNameByCode]);

  const qrDuplicateInfo = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of recordsByMaSp) {
      const key = normalizeQrKey(row.qr_code);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const duplicateKeys = new Set<string>();
    const duplicateList: Array<{ qr: string; count: number }> = [];
    let duplicateRowCount = 0;
    for (const [qr, count] of counts) {
      if (count <= 1) continue;
      duplicateKeys.add(qr);
      duplicateList.push({ qr, count });
      duplicateRowCount += count;
    }
    duplicateList.sort((a, b) => b.count - a.count || a.qr.localeCompare(b.qr, 'vi'));
    return { duplicateKeys, duplicateList, duplicateRowCount };
  }, [recordsByMaSp]);

  const visibleRecords = useMemo(() => {
    let rows = recordsByMaSp;
    if (onlyDuplicateQr) {
      rows = rows.filter(row => {
        const key = normalizeQrKey(row.qr_code);
        return Boolean(key && qrDuplicateInfo.duplicateKeys.has(key));
      });
    }
    if (dayKhoFilter !== 'all') {
      rows = rows.filter(row => readNhapKho(row).status === dayKhoFilter);
    }
    return rows;
  }, [recordsByMaSp, onlyDuplicateQr, qrDuplicateInfo.duplicateKeys, dayKhoFilter]);

  const visibleIds = useMemo(
    () => visibleRecords.map(row => rowIdKey(row.id)).filter(Boolean),
    [visibleRecords]
  );

  const trongLuongNhuaTotals = useMemo(
    () => sumCanTuDongSanLuongTotals(visibleRecords, productFilmWeightByCode),
    [visibleRecords, productFilmWeightByCode]
  );
  const nhuaTieuChuanTotals = useMemo(
    () => sumCanTuDongNhuaTieuChuanKg(visibleRecords, productStandardWeightByCode),
    [visibleRecords, productStandardWeightByCode]
  );
  const nhuaDinhMucTotals = useMemo(
    () =>
      sumCanTuDongNhuaDinhMucKg(
        visibleRecords,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      ),
    [visibleRecords, productStandardWeightByCode, productCoreWeightByCode, productPlasticWeightByCode]
  );
  const trongLuongTtTotals = useMemo(
    () => sumCanTuDongCanSanPhamKg(visibleRecords),
    [visibleRecords]
  );
  const loiTieuChuanTotals = useMemo(
    () => sumCanTuDongLoiTieuChuanKg(visibleRecords, productCoreWeightByCode),
    [visibleRecords, productCoreWeightByCode]
  );
  const tongTrongLuongLoiTotals = useMemo(
    () => sumCanTuDongCanLoiKg(visibleRecords),
    [visibleRecords]
  );
  const trongLuongMangTotals = useMemo(
    () => sumCanTuDongFilmKg(visibleRecords, productFilmWeightByCode),
    [visibleRecords, productFilmWeightByCode]
  );
  /** Cộng SL lệnh theo từng cặp Lệnh SX + Mã SP (không nhân theo số lần cân). */
  const lsxQtyTotals = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of visibleRecords) {
      const lenhSx = resolveRowLenhSx(row);
      const maSp = resolveRowMaSp(row);
      const qty = lookupLsxQty(lsxQtyByLenhAndSp, lenhSx, maSp);
      if (qty == null) continue;
      const key = `${String(lenhSx).trim().toUpperCase()}|${normalizeProductCodeKey(maSp)}`;
      if (!key || key === '|' || seen.has(key)) continue;
      seen.set(key, qty);
    }
    let total = 0;
    for (const qty of seen.values()) total += qty;
    return { quantity: total, pairCount: seen.size };
  }, [visibleRecords, lsxQtyByLenhAndSp]);

  /** Theo Mã SP trong bộ lọc: SL · SL LSX · KL TT · KL ĐM. */
  const summaryByMaSp = useMemo(() => {
    type Acc = {
      maSp: string;
      actual: number;
      klTt: number;
      klDm: number;
      klDmCounted: number;
      lsxSeen: Map<string, number>;
    };
    const byKey = new Map<string, Acc>();
    for (const row of visibleRecords) {
      const maSp = resolveRowMaSp(row);
      const key = normalizeProductCodeKey(maSp);
      if (!key) continue;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { maSp, actual: 0, klTt: 0, klDm: 0, klDmCounted: 0, lsxSeen: new Map() };
        byKey.set(key, acc);
      }
      acc.actual += 1;
      const canSp = resolveCanSpKg(row);
      if (canSp !== null) acc.klTt += canSp;
      const standardKg = productStandardWeightByCode.get(key);
      if (standardKg != null && Number.isFinite(standardKg) && standardKg > 0) {
        acc.klDm += standardKg;
        acc.klDmCounted += 1;
      }
      const lenhSx = resolveRowLenhSx(row);
      const qty = lookupLsxQty(lsxQtyByLenhAndSp, lenhSx, maSp);
      if (qty == null) continue;
      const pairKey = `${String(lenhSx).trim().toUpperCase()}|${key}`;
      if (!pairKey.startsWith('|') && !acc.lsxSeen.has(pairKey)) acc.lsxSeen.set(pairKey, qty);
    }
    return [...byKey.values()]
      .map(acc => {
        let lsx: number | null = null;
        if (acc.lsxSeen.size > 0) {
          lsx = 0;
          for (const qty of acc.lsxSeen.values()) lsx += qty;
        }
        const diff = lsx != null ? acc.actual - lsx : null;
        return {
          key: normalizeProductCodeKey(acc.maSp),
          maSp: acc.maSp,
          name: productNameByCode.get(normalizeProductCodeKey(acc.maSp)) || '',
          actual: acc.actual,
          lsx,
          diff,
          klTt: acc.klTt,
          klDm: acc.klDmCounted > 0 ? acc.klDm : null
        };
      })
      .sort((a, b) => b.actual - a.actual || a.maSp.localeCompare(b.maSp, 'vi', { numeric: true }));
  }, [visibleRecords, lsxQtyByLenhAndSp, productNameByCode, productStandardWeightByCode]);

  const summaryMetricGroups = useMemo(() => {
    /** Chênh lệch = đúng số đang hiện ở dòng trên − dòng dưới; % = chênh / dòng trên. */
    const buildPair = (opts: {
      key: string;
      title: string;
      topLabel: string;
      midLabel: string;
      top: number | null;
      mid: number | null;
      digits: number;
      unit: string;
    }) => {
      const { key, title, topLabel, midLabel, top, mid, digits, unit } = opts;
      const hasTop = top != null && Number.isFinite(top);
      const hasMid = mid != null && Number.isFinite(mid);
      const diff = hasTop && hasMid ? (top as number) - (mid as number) : null;
      const pct =
        diff != null && hasTop && (top as number) !== 0 ? (diff / (top as number)) * 100 : null;
      const fmt = (value: number) =>
        unit ? `${formatNumber(value, digits)} ${unit}` : formatNumber(value, digits);
      return {
        key,
        title,
        topLabel,
        topValue: hasTop ? fmt(top as number) : '—',
        midLabel,
        midValue: hasMid ? fmt(mid as number) : '—',
        diff,
        diffText:
          diff == null
            ? '—'
            : `${diff > 0 ? '+' : ''}${unit ? `${formatNumber(diff, digits)} ${unit}` : formatNumber(diff, digits)}`,
        pct,
        unit
      };
    };

    const qtyActual = trongLuongNhuaTotals.quantity;
    const qtyLsx = lsxQtyTotals.pairCount > 0 ? lsxQtyTotals.quantity : null;

    return [
      buildPair({
        key: 'so-luong',
        title: 'Số lượng',
        topLabel: 'Số lượng',
        midLabel: 'Số lượng LSX',
        top: qtyActual,
        mid: qtyLsx,
        digits: 0,
        unit: ''
      }),
      buildPair({
        key: 'nhua',
        title: 'Nhựa',
        topLabel: 'Nhựa thực tế',
        midLabel: 'Nhựa định mức',
        top: trongLuongNhuaTotals.weightKg,
        mid: nhuaDinhMucTotals.weightKg,
        digits: 2,
        unit: 'kg'
      }),
      buildPair({
        key: 'trong-luong',
        title: 'Trọng lượng',
        topLabel: 'Trọng lượng TT',
        midLabel: 'Trọng lượng tiêu chuẩn',
        top: trongLuongTtTotals.weightKg,
        mid: nhuaTieuChuanTotals.weightKg,
        digits: 2,
        unit: 'kg'
      }),
      buildPair({
        key: 'loi',
        title: 'Lõi',
        topLabel: 'Tổng trọng lượng lõi',
        midLabel: 'Lõi lý thuyết',
        top: tongTrongLuongLoiTotals.weightKg,
        mid: loiTieuChuanTotals.weightKg,
        digits: 2,
        unit: 'kg'
      }),
      buildPair({
        key: 'mang',
        title: 'Màng',
        topLabel: 'Trọng lượng màng',
        midLabel: '—',
        top: trongLuongMangTotals.weightKg,
        mid: null,
        digits: 3,
        unit: 'kg'
      })
    ];
  }, [
    trongLuongNhuaTotals,
    lsxQtyTotals,
    nhuaDinhMucTotals,
    trongLuongTtTotals,
    nhuaTieuChuanTotals,
    tongTrongLuongLoiTotals,
    loiTieuChuanTotals,
    trongLuongMangTotals
  ]);

  const hasDateFilters = Boolean(fromDate || toDate);
  const hasCaFilter = caFilter !== 'all';
  const hasMayFilter = mayFilter !== 'all';
  const hasLenhSxFilter = lenhSxFilter !== 'all';
  const hasMaSpFilters = maSpFilter !== 'all' || Boolean(maSpQuery.trim());
  const hasDayKhoFilter = dayKhoFilter !== 'all';
  const hasActiveFilters =
    hasDateFilters || hasCaFilter || hasMayFilter || hasLenhSxFilter || hasMaSpFilters || onlyDuplicateQr || hasDayKhoFilter;

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    if (!id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    if (
      !window.confirm(
        `Xóa ${ids.length} dòng cân tự động đã chọn?\n\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/can-tu-dong/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa các dòng đã chọn.');
      }
      const deleted = Number(data.deleted) || ids.length;
      showAppToast(`Đã xóa ${deleted} dòng cân tự động.`);
      await loadRecords();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể xóa các dòng đã chọn.';
      showAppToast(message, 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openAutoFillModal = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      showAppToast('Hãy tick chọn các dòng cần tự động điền.', 'error');
      return;
    }
    setShowAutoFillModal(true);
  };

  const handleAutoFillSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      showAppToast('Hãy tick chọn các dòng cần tự động điền.', 'error');
      return;
    }

    setIsAutoFilling(true);
    try {
      const updated = await postCanTuDongBulkAutofill(ids, {
        ngay: AUTO_FILL_NGAY,
        lenh_sx: AUTO_FILL_LENH_SX,
        ca: AUTO_FILL_CA,
        may: AUTO_FILL_MAY
      });
      showAppToast(`Đã điền Ngày + Ca + Lệnh SX + Máy cho ${updated} dòng.`);
      setShowAutoFillModal(false);
      await loadRecords();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Không thể tự động điền các dòng đã chọn.';
      showAppToast(message, 'error');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const openBulkNgayModalForSelected = () => {
    if (selectedIds.size === 0) {
      showAppToast('Hãy tick chọn các dòng cần sửa ngày.', 'error');
      return;
    }
    setBulkNgayScope('selected');
    setBulkNgayValue(localIsoDateToday());
    setShowBulkNgayModal(true);
  };

  const handleBulkSetNgay = async () => {
    const ids =
      bulkNgayScope === 'selected'
        ? [...selectedIds]
        : visibleRecords.map(row => row.id).filter(id => id != null && String(id).trim() !== '');
    if (ids.length === 0) {
      showAppToast(
        bulkNgayScope === 'selected'
          ? 'Hãy tick chọn các dòng cần sửa ngày.'
          : 'Không có dòng nào trong bộ lọc hiện tại.',
        'error'
      );
      return;
    }
    const ngay = bulkNgayValue.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
      showAppToast('Chọn ngày hợp lệ.', 'error');
      return;
    }
    const ngayLabel = formatIsoDateVi(ngay);

    setIsSettingNgay(true);
    try {
      const updated = await postCanTuDongBulkSetNgay(ids, ngay);
      if (bulkNgayScope === 'selected') {
        setFromDate(ngay);
        setToDate(ngay);
        clearSelection();
        showAppToast(`Đã sửa Ngày ${ngayLabel} cho ${formatNumber(updated, 0)} dòng đã chọn.`);
      } else {
        setFromDate(ngay);
        setToDate(ngay);
        showAppToast(`Đã điền Ngày ${ngayLabel} cho ${formatNumber(updated, 0)} dòng (theo bộ lọc).`);
      }
      setShowBulkNgayModal(false);
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(
        err instanceof Error
          ? err.message
          : bulkNgayScope === 'selected'
            ? 'Không thể sửa Ngày các dòng đã chọn.'
            : 'Không thể điền Ngày các dòng đang lọc.',
        'error'
      );
    } finally {
      setIsSettingNgay(false);
    }
  };

  const openBulkMaSpModal = () => {
    if (visibleRecords.length === 0) {
      showAppToast('Không có dòng nào trong bộ lọc hiện tại.', 'error');
      return;
    }
    const counts = new Map<string, number>();
    for (const row of visibleRecords) {
      const prefix = parseCanTuDongQrProductCode(row.qr_code);
      if (!prefix) continue;
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
    }
    let topPrefix = '';
    let topCount = 0;
    for (const [code, count] of counts) {
      if (count > topCount) {
        topPrefix = code;
        topCount = count;
      }
    }
    const preferred =
      (maSpFilter !== 'all' && maSpFilter.trim() ? maSpFilter.trim() : '') ||
      topPrefix ||
      productCatalogCodes[0] ||
      '';
    setBulkMaSpValue(preferred);
    setBulkMaSpMode('prefix');
    setShowBulkMaSpModal(true);
  };

  const handleBulkSyncMaSpForVisible = async () => {
    const rows = visibleRecords.filter(row => row.id != null && String(row.id).trim() !== '');
    if (rows.length === 0) {
      showAppToast('Không có dòng nào trong bộ lọc hiện tại.', 'error');
      return;
    }
    if (bulkMaSpMode === 'pick' && !bulkMaSpValue.trim()) {
      showAppToast('Chọn Mã SP hợp lệ trong danh mục.', 'error');
      return;
    }

    setIsSettingMaSp(true);
    try {
      const catalog = await loadProductCatalog();
      let updated = 0;

      if (bulkMaSpMode === 'pick') {
        const maSp = bulkMaSpValue.trim();
        const ids = rows.map(row => row.id);
        updated = await postCanTuDongBulkSetMaSp(ids, maSp);
        setMaSpFilter(maSp);
        await loadRecords();
        const key = normalizeProductCodeKey(maSp);
        const matched = key && catalog.weightMap.has(key) ? rows.length : 0;
        showAppToast(
          `Đã đồng bộ Mã SP ${maSp} cho ${formatNumber(updated, 0)} dòng · ${formatNumber(matched, 0)}/${formatNumber(rows.length, 0)} dòng có TL tiêu chuẩn.`
        );
      } else {
        const byPrefix = new Map<string, Array<string | number>>();
        for (const row of rows) {
          const prefix = parseCanTuDongQrProductCode(row.qr_code);
          if (!prefix) continue;
          const nextQr = replaceCanTuDongQrProductCode(row.qr_code, prefix);
          if (nextQr === String(row.qr_code ?? '').trim()) continue;
          const list = byPrefix.get(prefix) || [];
          list.push(row.id);
          byPrefix.set(prefix, list);
        }
        for (const [prefix, ids] of byPrefix) {
          updated += await postCanTuDongBulkSetMaSp(ids, prefix);
        }
        if (updated > 0) await loadRecords();
        const matched = rows.filter(row => {
          const key = normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code));
          return Boolean(key && catalog.weightMap.has(key));
        }).length;
        if (updated > 0) {
          showAppToast(
            `Đã chuẩn hóa tiền tố QR cho ${formatNumber(updated, 0)} dòng · ${formatNumber(matched, 0)}/${formatNumber(rows.length, 0)} dòng có TL tiêu chuẩn.`
          );
        } else {
          showAppToast(
            `Đã tải lại danh mục SP · ${formatNumber(matched, 0)}/${formatNumber(rows.length, 0)} dòng có TL tiêu chuẩn (Mã SP = tiền tố QR).`
          );
        }
      }
      setShowBulkMaSpModal(false);
    } catch (err: unknown) {
      showAppToast(
        err instanceof Error ? err.message : 'Không thể đồng bộ Mã SP các dòng đang lọc.',
        'error'
      );
    } finally {
      setIsSettingMaSp(false);
    }
  };

  const openEdit = (row: CanTuDongRecord) => {
    setEditingRecord(row);
    setEditForm({
      qr_code: String(row.qr_code ?? ''),
      ca: String(row.ca ?? ''),
      tare_weight: String(row.tare_weight ?? row.can_loi ?? ''),
      weight: String(row.weight ?? row.can_san_pham ?? ''),
      unit: String(row.unit ?? 'kg'),
      device_id: String(row.device_id ?? ''),
      status: String(row.status ?? '')
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/can-tu-dong/${encodeURIComponent(String(editingRecord.id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật dòng cân tự động.');
      showAppToast('Đã cập nhật dòng cân tự động.');
      setEditingRecord(null);
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể cập nhật dòng cân tự động.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRow = async (row: CanTuDongRecord) => {
    if (!window.confirm(`Xóa dòng ${row.qr_code || row.id}?\n\nHành động này không thể hoàn tác.`)) return;
    try {
      const res = await fetch('/api/can-tu-dong/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa dòng cân tự động.');
      showAppToast('Đã xóa dòng cân tự động.');
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể xóa dòng cân tự động.', 'error');
    }
  };

  const handlePrintAll = () => {
    if (visibleRecords.length === 0) {
      showAppToast('Không có dữ liệu để in theo bộ lọc hiện tại.', 'error');
      return;
    }
    try {
      setPrintData(
        buildCanTuDongPrintData(visibleRecords, {
          fromDate,
          toDate,
          ca: caFilter,
          productNameByCode,
          productStandardWeightByCode,
          productCoreWeightByCode,
          productPlasticWeightByCode,
          productFilmWeightByCode
        })
      );
      setPendingPrint(true);
    } catch (err: unknown) {
      setPrintData(null);
      setPendingPrint(false);
      showAppToast(err instanceof Error ? err.message : 'Không thể tạo mẫu in.', 'error');
    }
  };

  const handleDownloadExcel = () => {
    if (visibleRecords.length === 0) {
      showAppToast('Không có dữ liệu để tải Excel theo bộ lọc hiện tại.', 'error');
      return;
    }
    try {
      downloadCanTuDongExcel(visibleRecords, {
        fromDate,
        toDate,
        productNameByCode,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode,
        productFilmWeightByCode
      });
      showAppToast(`Đã tải Excel (${visibleRecords.length} dòng).`);
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể tải Excel.', 'error');
    }
  };

  const clearFilters = () => {
    setMaSpFilter('all');
    setMaSpQuery('');
    setFromDate(localIsoDateToday());
    setToDate(localIsoDateToday());
    setCaFilter('all');
    setMayFilter('all');
    setLenhSxFilter('all');
    setOnlyDuplicateQr(false);
    setDayKhoFilter('all');
  };

  const handleToggleDuplicateQrFilter = () => {
    if (onlyDuplicateQr) {
      setOnlyDuplicateQr(false);
      return;
    }
    if (qrDuplicateInfo.duplicateList.length === 0) {
      showAppToast('Không có mã QR trùng trong bộ lọc hiện tại.', 'error');
      return;
    }
    setOnlyDuplicateQr(true);
    showAppToast(
      `Có ${formatNumber(qrDuplicateInfo.duplicateList.length, 0)} mã QR trùng (${formatNumber(qrDuplicateInfo.duplicateRowCount, 0)} dòng).`
    );
  };

  const handleCopyDuplicateQrCodes = async () => {
    const text = qrDuplicateInfo.duplicateList.map(item => item.qr).join('\n');
    if (!text) {
      showAppToast('Không có mã QR trùng để sao chép.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showAppToast(`Đã sao chép ${qrDuplicateInfo.duplicateList.length} mã QR trùng.`);
    } catch {
      showAppToast('Không sao chép được. Hãy bôi đen mã rồi Ctrl+C.', 'error');
    }
  };

  /** Ưu tiên dòng đúng Ngày phiếu; nếu trống thì lấy mọi dòng đã tải (tránh dropdown ca/máy rỗng). */
  const nhapKhoSourceRows = useMemo(() => {
    const onDate = records.filter(row => resolveCanTuDongBusinessDate(row) === nhapKhoSlipDate);
    return onDate.length > 0 ? onDate : records;
  }, [records, nhapKhoSlipDate]);

  const nhapKhoCaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of nhapKhoSourceRows) {
      const ca = String(row.ca ?? '').trim();
      if (ca) set.add(ca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [nhapKhoSourceRows]);

  const nhapKhoMayOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of nhapKhoSourceRows) {
      if (nhapKhoCa && !canTuDongShiftMatches(String(row.ca ?? ''), nhapKhoCa)) continue;
      const may = resolveRowMay(row);
      if (may) set.add(may);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [nhapKhoSourceRows, nhapKhoCa]);

  /** Mã SP theo ca·máy (có QR). Ưu tiên mã còn chờ; vẫn liệt kê mã đã nhập để chọn / đưa về chờ. */
  const nhapKhoMaSpStats = useMemo(() => {
    const empty = {
      options: [] as string[],
      waitingByKey: new Map<string, number>(),
      doneByKey: new Map<string, number>(),
      waitingTotal: 0,
      doneTotal: 0
    };
    if (!nhapKhoCa.trim() || !nhapKhoMay.trim()) return empty;
    const labelByKey = new Map<string, string>();
    const waitingByKey = new Map<string, number>();
    const doneByKey = new Map<string, number>();
    let waitingTotal = 0;
    let doneTotal = 0;
    for (const row of nhapKhoSourceRows) {
      if (!String(row.qr_code || '').trim()) continue;
      if (!canTuDongShiftMatches(String(row.ca ?? ''), nhapKhoCa)) continue;
      if (!mayMatches(resolveRowMay(row), nhapKhoMay)) continue;
      const maSp = resolveRowMaSp(row);
      const key = normalizeProductCodeKey(maSp);
      if (!key) continue;
      if (!labelByKey.has(key)) labelByKey.set(key, maSp);
      if (readNhapKho(row).waiting) {
        waitingByKey.set(key, (waitingByKey.get(key) || 0) + 1);
        waitingTotal += 1;
      } else {
        doneByKey.set(key, (doneByKey.get(key) || 0) + 1);
        doneTotal += 1;
      }
    }
    const options = [...labelByKey.entries()]
      .sort((a, b) => {
        const aw = waitingByKey.get(a[0]) || 0;
        const bw = waitingByKey.get(b[0]) || 0;
        if (bw !== aw) return bw - aw;
        return a[1].localeCompare(b[1], 'vi', { numeric: true });
      })
      .map(([, label]) => label);
    return { options, waitingByKey, doneByKey, waitingTotal, doneTotal };
  }, [nhapKhoSourceRows, nhapKhoCa, nhapKhoMay]);

  const nhapKhoMaSpOptions = nhapKhoMaSpStats.options;

  // Giữ ca/máy/Mã SP khớp option đang có (tránh <select> kẹt giá trị không tồn tại).
  useEffect(() => {
    if (!showNhapKhoModal) return;
    if (nhapKhoCa && !nhapKhoCaOptions.some(ca => canTuDongShiftMatches(ca, nhapKhoCa))) {
      setNhapKhoCa(nhapKhoCaOptions.length === 1 ? nhapKhoCaOptions[0] : '');
      setNhapKhoMay('');
      setNhapKhoMaSp('');
      return;
    }
    if (nhapKhoMay && !nhapKhoMayOptions.some(may => mayMatches(may, nhapKhoMay))) {
      setNhapKhoMay(nhapKhoMayOptions.length === 1 ? nhapKhoMayOptions[0] : '');
      setNhapKhoMaSp('');
      return;
    }
    if (nhapKhoMaSp && !nhapKhoMaSpOptions.some(code => normalizeProductCodeKey(code) === normalizeProductCodeKey(nhapKhoMaSp))) {
      setNhapKhoMaSp(nhapKhoMaSpOptions.length === 1 ? nhapKhoMaSpOptions[0] : '');
    }
  }, [
    showNhapKhoModal,
    nhapKhoCa,
    nhapKhoMay,
    nhapKhoMaSp,
    nhapKhoCaOptions,
    nhapKhoMayOptions,
    nhapKhoMaSpOptions
  ]);

  const waitingNhapKho = useMemo(() => {
    const maSpKey = normalizeProductCodeKey(nhapKhoMaSp);
    if (!nhapKhoCa.trim() || !nhapKhoMay.trim() || !maSpKey) return [];
    return nhapKhoSourceRows
      .filter(row => {
        if (!readNhapKho(row).waiting || !String(row.qr_code || '').trim()) return false;
        if (!canTuDongShiftMatches(String(row.ca ?? ''), nhapKhoCa)) return false;
        if (!mayMatches(resolveRowMay(row), nhapKhoMay)) return false;
        return normalizeProductCodeKey(resolveRowMaSp(row)) === maSpKey;
      })
      .sort((a, b) => {
        const ta = Date.parse(String(a.captured_at || '')) || 0;
        const tb = Date.parse(String(b.captured_at || '')) || 0;
        if (tb !== ta) return tb - ta;
        return String(b.id).localeCompare(String(a.id), 'en', { numeric: true });
      });
  }, [nhapKhoSourceRows, nhapKhoCa, nhapKhoMay, nhapKhoMaSp]);
  const nhapKhoCount = Math.max(0, Math.floor(Number(nhapKhoSoCuon) || 0));
  const nhapKhoQueue = useMemo(() => queueNhapKhoRows(waitingNhapKho), [waitingNhapKho]);
  const nhapKhoPreview = nhapKhoCount > 0 ? nhapKhoQueue.eligible.slice(0, nhapKhoCount) : [];

  useEffect(() => {
    if (!showNhapKhoModal) return;
    let cancelled = false;
    void (async () => {
      setLoadingNhapKhoKho(true);
      try {
        const res = await fetch('/api/quan-ly-kho');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách kho.'));
        const names = [
          ...new Set(
            (Array.isArray(data?.records) ? data.records : [])
              .map((row: { ten_kho?: unknown }) => String(row.ten_kho || '').trim())
              .filter((name: string) => name && isFinishedGoodsWarehouseName(name))
          )
        ].sort((a, b) => a.localeCompare(b, 'vi'));
        if (cancelled) return;
        setNhapKhoWarehouses(names);
        setNhapKhoKho(current => (names.includes(current) ? current : names[0] || ''));
      } catch (err: unknown) {
        if (cancelled) return;
        setNhapKhoWarehouses([]);
        setNhapKhoKho('');
        showAppToast(err instanceof Error ? err.message : 'Không tải được danh sách kho.', 'error');
      } finally {
        if (!cancelled) setLoadingNhapKhoKho(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showNhapKhoModal]);

  const handleCheckNhapKho = async () => {
    const rows = nhapKhoPreview.length > 0 ? nhapKhoPreview : waitingNhapKho;
    const codes = rows.map(row => String(row.qr_code || '').trim()).filter(Boolean);
    if (codes.length === 0) {
      showAppToast('Chưa có mã QR trong bộ lọc hiện tại để kiểm tra.', 'error');
      return;
    }
    setIsCheckingNhapKho(true);
    try {
      const res = await fetch('/api/kho/kiem-tra-ma-quet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loai_phieu: 'nhap', ma_sp_quet: codes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không kiểm tra được mã QR trong nhập kho.'));
      const hits = new Map<string, string[]>();
      const matches = Array.isArray(data?.matches) ? data.matches : [];
      for (const row of matches) {
        const code = String(row?.ma_sp_quet || '').trim().toUpperCase();
        const phieu = String(row?.ma_phieu || '').trim();
        if (!code) continue;
        const current = hits.get(code) || [];
        if (phieu && !current.includes(phieu)) current.push(phieu);
        hits.set(code, current);
      }
      setNhapKhoHits(hits);
      setNhapKhoChecked(true);
      showAppToast(
        hits.size
          ? `${formatNumber(hits.size, 0)} / ${formatNumber(codes.length, 0)} mã đã có trong nhap_kho.`
          : `${formatNumber(codes.length, 0)} mã chưa có trong nhap_kho.`
      );
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không kiểm tra được mã QR.', 'error');
    } finally {
      setIsCheckingNhapKho(false);
    }
  };

  const handleConfirmNhapKho = async () => {
    if (nhapKhoCount <= 0) {
      showAppToast('Nhập số cuộn để hiện mã QR chờ nhập kho.', 'error');
      return;
    }
    if (waitingNhapKho.length === 0) {
      showAppToast('Không còn mã QR chờ nhập kho cho Mã SP này.', 'error');
      return;
    }
    const kho = nhapKhoKho.trim();
    if (!kho) {
      showAppToast('Chưa có kho thành phẩm để lập phiếu nhập.', 'error');
      return;
    }
    if (!nhapKhoCa.trim() || !nhapKhoMay.trim() || !nhapKhoMaSp.trim()) {
      showAppToast('Chọn ca, máy và Mã SP để lọc mã QR nhập kho.', 'error');
      return;
    }
    const nguoi = String(currentUser?.name || '').trim() || 'Không rõ';
    const maPhieu = newPhieuNhapCode(nhapKhoMay);
    const toWarehouseItems = (rows: CanTuDongRecord[]) =>
      rows.map(row => {
        const fullCode = String(row.qr_code || '').trim();
        const key = normalizeProductCodeKey(parseCanTuDongQrProductCode(fullCode));
        const unit = key ? productUnitByCode.get(key) || '' : '';
        return {
          ma_sp_quet: fullCode,
          ten_sp: key ? productNameByCode.get(key) || '' : '',
          don_vi: unit,
          can_tu_dong_id: row.id
        };
      });
    setIsNhapKho(true);
    try {
      const queue = nhapKhoPreview;
      if (queue.length === 0) {
        throw new Error('Không có mã QR chờ nhập kho.');
      }
      const batchRes = await fetch('/api/kho/quet-dot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loai_phieu: 'nhap',
          ma_phieu: maPhieu,
          ngay: nhapKhoSlipDate,
          nhan_su: nguoi,
          nguoi_lap: nhapKhoMay.trim(),
          kho,
          ca: nhapKhoCa.trim(),
          may: nhapKhoMay.trim(),
          cho_phep_trung: true,
          items: toWarehouseItems(queue).map(item => ({
            ma_sp_quet: item.ma_sp_quet,
            ten_sp: item.ten_sp,
            don_vi: item.don_vi
          }))
        })
      });
      const batchData = await batchRes.json().catch(() => ({}));
      if (!batchRes.ok) throw new Error(readApiErrorMessage(batchRes, batchData, 'Không ghi được mã QR vào nhap_kho.'));
      const savedRows = queue;
      if (!Array.isArray(batchData?.saved) || batchData.saved.length === 0) {
        throw new Error('Không ghi được mã QR vào nhap_kho.');
      }

      const res = await fetch('/api/can-tu-dong/nhap-kho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: savedRows.map(row => row.id),
          nguoi,
          ma_phieu: maPhieu
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Đã ghi nhap_kho nhưng chưa đổi trạng thái cân.'));
      const luc = String(data.nhap_kho_luc || new Date().toISOString());
      const boi = String(data.nhap_kho_boi || nguoi);
      const idSet = new Set(savedRows.map(row => rowIdKey(row.id)));
      setRecords(prev =>
        prev.map(row => {
          if (!idSet.has(rowIdKey(row.id))) return row;
          const meta =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? { ...(row.metadata as Record<string, unknown>) }
              : {};
          return {
            ...row,
            metadata: {
              ...meta,
              nhap_kho_trang_thai: NHAP_KHO_DA,
              nhap_kho_luc: luc,
              nhap_kho_boi: boi,
              nhap_kho_ma_phieu: maPhieu
            }
          };
        })
      );
      const savedCount = formatNumber(Number(data.updated) || savedRows.length, 0);
      showAppToast(`Đã tạo phiếu chưa chốt ${maPhieu}, ghi ${savedCount} mã vào nhap_kho và lịch sử Kho thành phẩm.`);
      setShowNhapKhoModal(false);
      setNhapKhoSoCuon('');
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không nhập kho được.', 'error');
    } finally {
      setIsNhapKho(false);
    }
  };

  const handleToggleNhapKhoRow = async (row: CanTuDongRecord) => {
    const current = readNhapKho(row);
    const next = current.waiting ? NHAP_KHO_DA : NHAP_KHO_CHO;
    const key = rowIdKey(row.id);
    setTogglingNhapKhoId(key);
    try {
      const nguoi = String(currentUser?.name || '').trim() || 'Không rõ';
      const res = await fetch('/api/can-tu-dong/nhap-kho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id], nguoi, trang_thai: next })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không đổi được trạng thái nhập kho.'));
      const luc = String(data.nhap_kho_luc || new Date().toISOString());
      const boi = String(data.nhap_kho_boi || nguoi);
      setRecords(prev =>
        prev.map(item => {
          if (rowIdKey(item.id) !== key) return item;
          const meta =
            item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
              ? { ...(item.metadata as Record<string, unknown>) }
              : {};
          const nextMeta: Record<string, unknown> = {
            ...meta,
            nhap_kho_trang_thai: next
          };
          if (next === NHAP_KHO_DA) {
            nextMeta.nhap_kho_luc = luc;
            nextMeta.nhap_kho_boi = boi;
          } else {
            delete nextMeta.nhap_kho_luc;
            delete nextMeta.nhap_kho_boi;
            delete nextMeta.nhap_kho_ma_phieu;
          }
          return { ...item, metadata: nextMeta };
        })
      );
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không đổi được trạng thái nhập kho.', 'error');
    } finally {
      setTogglingNhapKhoId('');
    }
  };

  const applyNhapKhoChoToRows = async (targets: CanTuDongRecord[], confirmLabel: string) => {
    if (targets.length === 0) {
      showAppToast('Không có dòng «Đã nhập kho» để đưa về chờ.', 'error');
      return false;
    }
    if (
      !window.confirm(
        `Đưa ${formatNumber(targets.length, 0)} dòng «Đã nhập kho» (${confirmLabel}) về «${NHAP_KHO_CHO}»?\n\nKhông xóa phiếu trong nhap_kho — chỉ đổi trạng thái trên cân tự động.`
      )
    ) {
      return false;
    }

    const nguoi = String(currentUser?.name || '').trim() || 'Không rõ';
    const ids = targets.map(row => row.id);
    setIsResettingNhapKho(true);
    try {
      let updated = 0;
      for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
        const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
        const res = await fetch('/api/can-tu-dong/nhap-kho', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: chunk, nguoi, trang_thai: NHAP_KHO_CHO })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(readApiErrorMessage(res, data, 'Không đưa được trạng thái nhập kho về ban đầu.'));
        }
        updated += Number(data.updated) || 0;
      }
      const idSet = new Set(ids.map(id => rowIdKey(id)));
      setRecords(prev =>
        prev.map(row => {
          if (!idSet.has(rowIdKey(row.id))) return row;
          const meta =
            row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
              ? { ...(row.metadata as Record<string, unknown>) }
              : {};
          delete meta.nhap_kho_luc;
          delete meta.nhap_kho_boi;
          delete meta.nhap_kho_ma_phieu;
          return {
            ...row,
            metadata: {
              ...meta,
              nhap_kho_trang_thai: NHAP_KHO_CHO
            }
          };
        })
      );
      showAppToast(`Đã đưa ${formatNumber(updated || targets.length, 0)} dòng về «${NHAP_KHO_CHO}».`);
      setNhapKhoChecked(false);
      return true;
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không đưa được trạng thái nhập kho về ban đầu.', 'error');
      return false;
    } finally {
      setIsResettingNhapKho(false);
    }
  };

  /** Đưa trạng thái nhập kho về «Chờ nhập kho» cho các dòng đang hiện theo bộ lọc. */
  const handleResetNhapKhoByFilter = async () => {
    await applyNhapKhoChoToRows(
      visibleRecords.filter(row => !readNhapKho(row).waiting),
      'theo bộ lọc đang xem'
    );
  };

  /** Trong modal Nhập kho: đưa về chờ theo ca · máy (± Mã SP đang chọn). */
  const handleResetNhapKhoInModal = async () => {
    if (!nhapKhoCa.trim() || !nhapKhoMay.trim()) {
      showAppToast('Chọn ca và máy trước.', 'error');
      return;
    }
    const maSpKey = normalizeProductCodeKey(nhapKhoMaSp);
    const targets = nhapKhoSourceRows.filter(row => {
      if (readNhapKho(row).waiting || !String(row.qr_code || '').trim()) return false;
      if (!canTuDongShiftMatches(String(row.ca ?? ''), nhapKhoCa)) return false;
      if (!mayMatches(resolveRowMay(row), nhapKhoMay)) return false;
      if (maSpKey && normalizeProductCodeKey(resolveRowMaSp(row)) !== maSpKey) return false;
      return true;
    });
    const scope = maSpKey
      ? `ca ${nhapKhoCa} · máy ${nhapKhoMay} · ${nhapKhoMaSp}`
      : `ca ${nhapKhoCa} · máy ${nhapKhoMay}`;
    await applyNhapKhoChoToRows(targets, scope);
  };

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ef1b2d]/10 text-[#ef1b2d]">
              <Scale className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-black text-zinc-900 sm:text-xl">Cân tự động</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNhapKhoSlipDate(toDate || fromDate || localIsoDateToday());
              setNhapKhoCa(caFilter !== 'all' ? caFilter : '');
              setNhapKhoMay(mayFilter !== 'all' ? mayFilter : '');
              setNhapKhoMaSp(maSpFilter !== 'all' ? maSpFilter : '');
              setNhapKhoSoCuon('');
              setNhapKhoHits(new Map());
              setNhapKhoChecked(false);
              setShowNhapKhoModal(true);
            }}
            disabled={loading || records.length === 0 || isResettingNhapKho}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-bold text-sky-800 transition hover:bg-sky-100 disabled:opacity-60"
            title="Chọn ca · máy · Mã SP · số cuộn → ghi QR vào nhap_kho (phiếu chưa chốt)"
          >
            <Warehouse className="h-4 w-4" />
            Nhập kho
          </button>
          <button
            type="button"
            onClick={() => void handleResetNhapKhoByFilter()}
            disabled={loading || isResettingNhapKho || isNhapKho || visibleRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
            title={`Đưa các dòng «Đã nhập kho» trong bộ lọc đang xem về «${NHAP_KHO_CHO}»`}
          >
            {isResettingNhapKho ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {isResettingNhapKho ? 'Đang đưa về chờ...' : 'Về chờ nhập kho'}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={loading || visibleRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            title="Tải Excel toàn bộ danh sách"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Tải Excel
          </button>
          <button
            type="button"
            onClick={handlePrintAll}
            disabled={loading || pendingPrint || visibleRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ef1b2d]/30 bg-red-50 px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-100 disabled:opacity-60"
            title="In bảng tổng hợp toàn bộ danh sách"
          >
            {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            In
          </button>
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ef1b2d] px-3 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tải lại
          </button>
        </div>
      </div>

      <TableToolbar
        isLoading={loading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={clearFilters}
      >
        <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} />
        <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
        <FilterCombobox
          label="Ca"
          options={caOptions}
          value={caFilter}
          onChange={setCaFilter}
          searchPlaceholder="Tìm ca..."
          compact
        />
        <FilterCombobox
          label="Máy"
          options={mayOptions}
          value={mayFilter}
          onChange={setMayFilter}
          searchPlaceholder="Tìm máy..."
          compact
        />
        <FilterCombobox
          label="Lệnh SX"
          options={lenhSxOptions}
          value={lenhSxFilter}
          onChange={setLenhSxFilter}
          searchPlaceholder="Tìm lệnh SX..."
          compact
        />
        <TableSearchInput
          value={maSpQuery}
          onChange={value => {
            setMaSpQuery(value);
            if (value.trim()) setMaSpFilter('all');
          }}
          placeholder="Lọc theo Mã SP, QR hoặc tên SP..."
          disabled={loading}
        />
        <FilterCombobox
          label="Mã SP"
          options={maSpOptions}
          value={maSpFilter}
          onChange={value => {
            setMaSpFilter(value);
            if (value !== 'all') setMaSpQuery('');
          }}
          searchPlaceholder="Tìm mã SP..."
          formatOption={code => {
            const name = productNameByCode.get(normalizeProductCodeKey(code));
            return name ? `${code} · ${name}` : code;
          }}
          dropdownWidth="w-max min-w-[16rem] max-w-[min(28rem,calc(100vw-1rem))]"
        />
        <FilterCombobox
          label="Đẩy kho"
          options={[NHAP_KHO_CHO, NHAP_KHO_DA]}
          value={dayKhoFilter}
          onChange={value => setDayKhoFilter(value === NHAP_KHO_CHO || value === NHAP_KHO_DA ? value : 'all')}
          searchPlaceholder="Tìm trạng thái..."
          searchable={false}
          compact
        />
        <button
          type="button"
          onClick={handleToggleDuplicateQrFilter}
          disabled={loading}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-60 ${
            onlyDuplicateQr
              ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600'
              : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
          }`}
          title={
            qrDuplicateInfo.duplicateList.length > 0
              ? `Có ${qrDuplicateInfo.duplicateList.length} mã QR trùng · ${qrDuplicateInfo.duplicateRowCount} dòng`
              : 'Lọc các dòng có mã QR trùng trong bộ lọc hiện tại'
          }
        >
          {onlyDuplicateQr ? 'Đang lọc QR trùng' : 'Lọc QR trùng'}
          {!loading && qrDuplicateInfo.duplicateList.length > 0 ? (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                onlyDuplicateQr ? 'bg-white/25 text-white' : 'bg-amber-200/80 text-amber-950'
              }`}
            >
              {formatNumber(qrDuplicateInfo.duplicateList.length, 0)}
            </span>
          ) : null}
        </button>
        <span className="text-[11px] font-semibold text-zinc-500">
          {loading
            ? '…'
            : hasActiveFilters
              ? `${formatNumber(visibleRecords.length, 0)} / ${formatNumber(records.length, 0)} dòng`
              : `${formatNumber(records.length, 0)} dòng`}
        </span>
      </TableToolbar>

      {onlyDuplicateQr && qrDuplicateInfo.duplicateList.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 px-3 py-3 shadow-sm sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-amber-950">
                Mã QR trùng · {formatNumber(qrDuplicateInfo.duplicateList.length, 0)} mã ·{' '}
                {formatNumber(qrDuplicateInfo.duplicateRowCount, 0)} dòng
              </p>
              <p className="text-[11px] font-semibold text-amber-800/80">
                Bôi đen mã bên dưới rồi Ctrl+C, hoặc bấm Sao chép tất cả.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyDuplicateQrCodes()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-100"
            >
              <Copy className="h-3.5 w-3.5" />
              Sao chép tất cả
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-white px-2 py-1.5">
            <ul className="space-y-1">
              {qrDuplicateInfo.duplicateList.map(item => (
                <li
                  key={item.qr}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-amber-50 py-1 last:border-0"
                >
                  <code
                    className="select-all break-all font-mono text-xs font-bold text-amber-950"
                    title="Click để bôi đen cả mã, rồi Ctrl+C"
                  >
                    {item.qr}
                  </code>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    ×{item.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-sm">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-emerald-200 bg-emerald-100/80 text-[10px] font-black uppercase tracking-wider text-emerald-900">
                <th className="w-28 whitespace-nowrap px-3 py-2.5 text-zinc-600"> </th>
                {summaryMetricGroups.map(group => (
                  <th key={group.key} className="whitespace-nowrap px-3 py-2.5">
                    {group.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-sm font-black text-emerald-950">
              <tr className="border-b border-emerald-100/80">
                <td className="whitespace-nowrap px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Thực tế
                </td>
                {summaryMetricGroups.map(group => (
                  <td key={`${group.key}-top`} className="whitespace-nowrap px-3 py-2.5 align-top">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      {group.topLabel}
                    </div>
                    <div className="mt-0.5 tabular-nums">{loading ? '…' : group.topValue}</div>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-emerald-100/80">
                <td className="whitespace-nowrap px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                  LSX / ĐM
                </td>
                {summaryMetricGroups.map(group => (
                  <td
                    key={`${group.key}-mid`}
                    className="whitespace-nowrap px-3 py-2.5 align-top text-indigo-900"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-600/80">
                      {group.midLabel}
                    </div>
                    <div className="mt-0.5 tabular-nums">{loading ? '…' : group.midValue}</div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="whitespace-nowrap px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-rose-700">
                  Chênh lệch
                </td>
                {summaryMetricGroups.map(group => {
                  const diffClass =
                    group.diff == null
                      ? 'text-zinc-400'
                      : group.diff > 0
                        ? 'text-emerald-800'
                        : group.diff < 0
                          ? 'text-rose-700'
                          : 'text-zinc-800';
                  const pctClass =
                    group.pct == null
                      ? 'text-zinc-400'
                      : group.pct > 0
                        ? 'text-emerald-800'
                        : group.pct < 0
                          ? 'text-rose-700'
                          : 'text-zinc-800';
                  return (
                    <td key={`${group.key}-diff`} className="whitespace-nowrap px-3 py-2.5 align-top">
                      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                            Chênh lệch
                          </div>
                          <div className={`mt-0.5 tabular-nums ${diffClass}`}>
                            {loading ? '…' : group.diffText}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                            Phần trăm
                          </div>
                          <div className={`mt-0.5 tabular-nums ${pctClass}`}>
                            {loading ? '…' : formatSignedPercent(group.pct)}
                          </div>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="w-full shrink-0 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm xl:w-[30rem]">
          <div className="border-b border-emerald-100 bg-emerald-100/80 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-900">
            Mã SP · Số lượng
          </div>
          <div className="max-h-[13.5rem] overflow-y-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-emerald-50/95">
                <tr className="border-b border-emerald-100 text-[10px] font-black uppercase tracking-wider text-emerald-900">
                  <th className="w-[5.5rem] max-w-[5.5rem] px-2 py-2">Mã SP</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">SL LSX</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">SL</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right" title="Σ Trọng lượng tiêu chuẩn">
                    KL ĐM
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right" title="Σ Trọng lượng TT">
                    KL TT
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">CL</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm font-black text-emerald-950">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-zinc-400">
                      …
                    </td>
                  </tr>
                ) : summaryByMaSp.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-[11px] font-semibold text-zinc-400">
                      Chưa có Mã SP trong bộ lọc
                    </td>
                  </tr>
                ) : (
                  summaryByMaSp.map(row => {
                    const diffClass =
                      row.diff == null
                        ? 'text-zinc-400'
                        : row.diff > 0
                          ? 'text-emerald-800'
                          : row.diff < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800';
                    const nameTitle = row.name ? `${row.maSp} · ${row.name}` : row.maSp;
                    return (
                      <tr key={row.key} className="border-t border-emerald-50 hover:bg-emerald-50/50">
                        <td className="w-[5.5rem] max-w-[5.5rem] px-2 py-2 align-top">
                          <div
                            className="truncate font-mono text-[11px] font-black text-zinc-900"
                            title={nameTitle}
                          >
                            {row.maSp}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums align-top text-indigo-900">
                          {row.lsx == null ? '—' : formatNumber(row.lsx, 0)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums align-top">
                          {formatNumber(row.actual, 0)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2 text-right tabular-nums align-top text-teal-900"
                          title="KL ĐM = Σ Trọng lượng tiêu chuẩn"
                        >
                          {row.klDm == null ? '—' : formatNumber(row.klDm, 2)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2 text-right tabular-nums align-top text-violet-900"
                          title="KL TT = Σ Trọng lượng TT"
                        >
                          {formatNumber(row.klTt, 2)}
                        </td>
                        <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums align-top ${diffClass}`}>
                          {row.diff == null
                            ? '—'
                            : `${row.diff > 0 ? '+' : ''}${formatNumber(row.diff, 0)}`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
          <p className="mr-auto text-xs font-bold text-rose-800">Đã chọn {selectedCount} dòng</p>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkDeleting || isAutoFilling || isSettingNgay || isSettingMaSp}
            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={openBulkNgayModalForSelected}
            disabled={isBulkDeleting || isAutoFilling || isSettingNgay || isSettingMaSp}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-bold text-sky-900 transition hover:bg-sky-100 disabled:opacity-60"
            title="Sửa cột Ngày (SOURCE_DATE) cho các dòng đã tick"
          >
            {isSettingNgay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
            {isSettingNgay ? 'Đang sửa ngày...' : `Sửa ngày (${selectedCount})`}
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={isBulkDeleting || isAutoFilling || isSettingNgay || isSettingMaSp}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {isBulkDeleting ? 'Đang xóa...' : `Xóa đã chọn (${selectedCount})`}
          </button>
        </div>
      ) : null}

      <TableShell minWidthClassName="min-w-[2680px]">
        <TableHead>
          <TableHeadCell className="w-10 text-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={loading || visibleIds.length === 0 || isBulkDeleting}
              aria-label="Chọn tất cả dòng đang xem"
              className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
            />
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Ngày nghiệp vụ (SOURCE_DATE / work_date), không dùng ngày cân"
          >
            Ngày
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Thời điểm cân thực tế (captured_at) — dùng để theo dõi"
          >
            Ngày giờ
          </TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Ca</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="metadata.machine / SOURCE_MACHINE"
          >
            Máy
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Mã sản phẩm lấy từ QR"
          >
            Mã SP
          </TableHeadCell>
          <TableHeadCell>QR</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.tong_trong_luong (Tổng TL / Khối lượng) theo Mã SP từ QR"
          >
            Trọng lượng tiêu chuẩn
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Trọng lượng TT = weight / can_san_pham"
          >
            Trọng lượng TT
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Nhựa thực tế = Cân SP − Cân lõi − Trọng lượng bì − Trọng lượng màng"
          >
            Nhựa thực tế
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.trong_luong_nhua; không có thì TL tiêu chuẩn − lõi LT − bì"
          >
            Nhựa định mức
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Chênh lệch nhựa (TT−ĐM) = Nhựa thực tế − Nhựa định mức"
          >
            Chênh lệch nhựa ( TT-ĐM)
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Phần trăm = (Chênh lệch nhựa ÷ Nhựa thực tế) × 100%"
          >
            Phần trăm
          </TableHeadCell>
          <TableHeadCell title="tare_weight">Cân lõi</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.trong_luong_loi (Trọng lượng lõi lý thuyết) theo Mã SP từ QR"
          >
            Lõi lý thuyết
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Chênh lệch lõi = Cân lõi − Lõi lý thuyết (thực tế − LT)"
          >
            Chênh lệch lõi
          </TableHeadCell>
          <TableHeadCell title={`Mặc định ${DEFAULT_CAN_TU_DONG_BI_KG} kg`}>
            Trọng lượng bì
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="BOM màng Thành phần SP / cuộn (kg) — không ×2, không làm tròn"
          >
            Trọng lượng màng
          </TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell className="whitespace-nowrap" title="Chờ nhập kho / Đã nhập kho">
            Nhập kho
          </TableHeadCell>
          <TableHeadCell>Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={21}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải cân tự động…
              </span>
            </TableEmptyRow>
          ) : visibleRecords.length === 0 ? (
            <TableEmptyRow colSpan={21}>
              {records.length === 0
                ? 'Không có bản ghi cân tự động.'
                : hasDateFilters && recordsByDate.length === 0
                  ? `Không có dòng nào trong khoảng ngày${fromDate ? ` từ ${formatIsoDateVi(fromDate)}` : ''}${toDate ? ` đến ${formatIsoDateVi(toDate)}` : ''}.`
                  : hasCaFilter && recordsByCa.length === 0
                    ? `Không có dòng nào với Ca ${caFilter}.`
                    : hasMayFilter && recordsByMay.length === 0
                      ? `Không có dòng nào với máy ${mayFilter}.`
                    : hasDayKhoFilter
                      ? `Không có dòng nào ${dayKhoFilter.toLocaleLowerCase('vi')}.`
                    : onlyDuplicateQr
                      ? 'Không có mã QR trùng trong bộ lọc hiện tại.'
                      : hasMaSpFilters && recordsByMaSp.length === 0
                        ? maSpFilter !== 'all'
                          ? `Không có dòng nào với Mã SP ${maSpFilter}.`
                          : `Không có dòng khớp «${maSpQuery.trim()}».`
                        : 'Không có bản ghi cân tự động.'}
            </TableEmptyRow>
          ) : (
            visibleRecords.map(row => {
              const idKey = rowIdKey(row.id);
              const canLoi = row.can_loi ?? row.tare_weight;
              const canSp = row.can_san_pham ?? row.weight;
              const trongLuongBi = resolveTrongLuongBiKg(row);
              const ngay = resolveCanTuDongBusinessDate(row);
              const may =
                String(row.may ?? row.machine ?? '').trim() || resolveCanTuDongMachine(row) || '';
              const maSp = parseCanTuDongQrProductCode(row.qr_code);
              const maSpKey = normalizeProductCodeKey(maSp);
              const filmKgPerRoll = maSpKey ? productFilmWeightByCode.get(maSpKey) : undefined;
              const trongLuongMang =
                filmKgPerRoll != null && Number.isFinite(filmKgPerRoll) && filmKgPerRoll > 0
                  ? filmKgPerRoll
                  : null;
              const trongLuongNhua = resolveCanTuDongNhuaThucTeKg(row, productFilmWeightByCode);
              const qrKey = normalizeQrKey(row.qr_code);
              const isDuplicateQr = Boolean(qrKey && qrDuplicateInfo.duplicateKeys.has(qrKey));
              const trongLuongTieuChuan =
                (maSpKey && productStandardWeightByCode.get(maSpKey)) || null;
              const loiTieuChuan =
                (maSpKey && productCoreWeightByCode.get(maSpKey)) || null;
              const nhuaDinhMuc = resolveNhuaDinhMucKg(
                trongLuongTieuChuan,
                loiTieuChuan,
                maSpKey ? productPlasticWeightByCode.get(maSpKey) : null
              );
              const chenhLechNhua =
                trongLuongNhua !== null && nhuaDinhMuc != null ? trongLuongNhua - nhuaDinhMuc : null;
              const { phanTram } = resolveNhuaChenhLechVaPhanTram(trongLuongNhua, nhuaDinhMuc);
              const canLoiNum = asWeightNumber(canLoi);
              const chenhLechLoi =
                canLoiNum != null && loiTieuChuan != null ? canLoiNum - loiTieuChuan : null;
              return (
                <TableRow key={idKey}>
                  <td className="px-4 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(idKey)}
                      onChange={() => toggleSelected(idKey)}
                      disabled={isBulkDeleting}
                      aria-label={`Chọn dòng ${idKey}`}
                      className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-900">
                    {formatIsoDateVi(ngay)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold text-zinc-700"
                    title={String(row.captured_at || '').trim() || undefined}
                  >
                    {formatCapturedAtVi(row.captured_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-sky-900">
                    {row.ca || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-amber-900">
                    {may || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-sky-950">
                    {maSp || '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-mono font-bold ${
                      isDuplicateQr
                        ? 'bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-300'
                        : 'text-zinc-900'
                    }`}
                    title={isDuplicateQr ? 'Mã QR trùng — click để bôi đen, Ctrl+C để copy' : undefined}
                  >
                    {qrKey ? (
                      <code className="select-all break-all">{row.qr_code}</code>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-indigo-900"
                    title={maSp ? `Mã SP: ${maSp}` : undefined}
                  >
                    {trongLuongTieuChuan != null
                      ? formatWeight(trongLuongTieuChuan, 'kg', 3)
                      : '—'}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-violet-900"
                    title="Trọng lượng TT = weight / can_san_pham"
                  >
                    {formatWeight(canSp, row.unit, 6)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-black text-emerald-800"
                    title="Nhựa thực tế = Cân SP − Cân lõi − Bì − Trọng lượng màng"
                  >
                    {trongLuongNhua !== null ? formatWeight(trongLuongNhua, row.unit, 2) : '—'}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-teal-900"
                    title={maSp ? `Nhựa định mức · Mã SP: ${maSp}` : 'Nhựa định mức từ sản phẩm'}
                  >
                    {nhuaDinhMuc != null ? formatWeight(nhuaDinhMuc, 'kg', 3) : '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      chenhLechNhua == null
                        ? 'text-zinc-400'
                        : chenhLechNhua > 0
                          ? 'text-emerald-800'
                          : chenhLechNhua < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Chênh lệch nhựa (TT−ĐM) = Nhựa thực tế − Nhựa định mức"
                  >
                    {chenhLechNhua == null
                      ? '—'
                      : `${chenhLechNhua > 0 ? '+' : ''}${formatWeight(chenhLechNhua, row.unit, 3)}`}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      phanTram == null
                        ? 'text-zinc-400'
                        : phanTram > 0
                          ? 'text-emerald-800'
                          : phanTram < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Phần trăm = (Chênh lệch nhựa ÷ Nhựa thực tế) × 100%"
                  >
                    {formatSignedPercent(phanTram)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-sky-800">
                    {formatWeight(canLoi, row.unit, 6)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-amber-900"
                    title={maSp ? `Lõi lý thuyết · Mã SP: ${maSp}` : 'Lõi lý thuyết từ sản phẩm'}
                  >
                    {loiTieuChuan != null ? formatWeight(loiTieuChuan, 'kg', 3) : '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      chenhLechLoi == null
                        ? 'text-zinc-400'
                        : chenhLechLoi > 0
                          ? 'text-emerald-800'
                          : chenhLechLoi < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Chênh lệch lõi = Cân lõi − Lõi lý thuyết"
                  >
                    {chenhLechLoi == null
                      ? '—'
                      : `${chenhLechLoi > 0 ? '+' : ''}${formatWeight(chenhLechLoi, row.unit, 3)}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatWeight(trongLuongBi, row.unit, 2)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-cyan-900"
                    title={
                      maSp && trongLuongMang != null
                        ? `BOM màng · Mã SP: ${maSp}`
                        : 'Chưa có BOM màng trên Thành phần SP'
                    }
                  >
                    {trongLuongMang != null ? formatWeightExact(trongLuongMang, 'kg') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {row.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const nhap = readNhapKho(row);
                      return (
                        <div className="min-w-[9rem]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${
                                nhap.waiting
                                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              }`}
                            >
                              {nhap.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleToggleNhapKhoRow(row)}
                              disabled={togglingNhapKhoId === rowIdKey(row.id)}
                              title={nhap.waiting ? 'Chuyển sang Đã nhập kho' : 'Chuyển sang Chờ nhập kho'}
                              className="inline-flex h-7 items-center rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              {togglingNhapKhoId === rowIdKey(row.id) ? '...' : 'Đổi'}
                            </button>
                          </div>
                          {!nhap.waiting ? (
                            <div className="mt-1 text-[10px] font-semibold leading-4 text-zinc-500">
                              {formatNhapKhoTime(nhap.at)}
                              {nhap.by ? ` · ${nhap.by}` : ''}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRow(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xóa
                      </button>
                    </div>
                  </td>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableShell>

      {showNhapKhoModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="can-tu-dong-nhap-kho-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h3 id="can-tu-dong-nhap-kho-title" className="text-base font-black text-zinc-950">
                Nhập kho
              </h3>
              <button
                type="button"
                onClick={() => setShowNhapKhoModal(false)}
                disabled={isNhapKho}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
              {nhapKhoWarehouses.length > 1 ? (
                <label className="block space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Kho thành phẩm</span>
                  <select
                    value={nhapKhoKho}
                    disabled={isNhapKho || loadingNhapKhoKho}
                    onChange={event => setNhapKhoKho(event.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-sky-400"
                  >
                    {nhapKhoWarehouses.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs font-semibold text-zinc-600">
                  Kho: <span className="font-black text-zinc-900">{nhapKhoKho || 'Chưa có kho thành phẩm'}</span>
                </p>
              )}
              <TableDateFilter
                label="Ngày phiếu"
                value={nhapKhoSlipDate}
                onChange={value => {
                  setNhapKhoSlipDate(value || localIsoDateToday());
                  setNhapKhoCa('');
                  setNhapKhoMay('');
                  setNhapKhoMaSp('');
                  setNhapKhoChecked(false);
                }}
                className="w-full"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
                  <FilterCombobox
                    label={nhapKhoCaOptions.length ? 'Chọn ca' : 'Không có ca'}
                    options={nhapKhoCaOptions}
                    value={nhapKhoCa || 'all'}
                    includeAll={false}
                    compact
                    matchButtonWidth
                    searchable={nhapKhoCaOptions.length > 6}
                    searchPlaceholder="Tìm ca..."
                    className="w-full"
                    buttonClassName="h-10 w-full justify-between"
                    onChange={value => {
                      if (isNhapKho) return;
                      setNhapKhoCa(value === 'all' ? '' : value);
                      setNhapKhoMay('');
                      setNhapKhoMaSp('');
                      setNhapKhoChecked(false);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
                  <FilterCombobox
                    label={
                      !nhapKhoCa
                        ? 'Chọn ca trước'
                        : nhapKhoMayOptions.length
                          ? 'Chọn máy'
                          : 'Không có máy'
                    }
                    options={nhapKhoCa ? nhapKhoMayOptions : []}
                    value={nhapKhoMay || 'all'}
                    includeAll={false}
                    compact
                    matchButtonWidth
                    searchable={nhapKhoMayOptions.length > 6}
                    searchPlaceholder="Tìm máy..."
                    className="w-full"
                    buttonClassName={`h-10 w-full justify-between ${!nhapKhoCa || isNhapKho ? 'opacity-60' : ''}`}
                    onChange={value => {
                      if (isNhapKho || !nhapKhoCa) return;
                      setNhapKhoMay(value === 'all' ? '' : value);
                      setNhapKhoMaSp('');
                      setNhapKhoChecked(false);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Mã SP</span>
                <FilterCombobox
                  label={
                    !nhapKhoCa || !nhapKhoMay
                      ? 'Chọn ca và máy trước'
                      : nhapKhoMaSpOptions.length
                        ? 'Chọn Mã SP'
                        : 'Không có Mã SP (QR) cho ca · máy này'
                  }
                  options={nhapKhoCa && nhapKhoMay ? nhapKhoMaSpOptions : []}
                  value={nhapKhoMaSp || 'all'}
                  includeAll={false}
                  compact
                  matchButtonWidth
                  searchable
                  searchPlaceholder="Tìm mã SP..."
                  className="w-full"
                  buttonClassName={`h-10 w-full justify-between ${!nhapKhoCa || !nhapKhoMay || isNhapKho ? 'opacity-60' : ''}`}
                  formatOption={code => {
                    const key = normalizeProductCodeKey(code);
                    const name = productNameByCode.get(key);
                    const cho = nhapKhoMaSpStats.waitingByKey.get(key) || 0;
                    const da = nhapKhoMaSpStats.doneByKey.get(key) || 0;
                    const counts =
                      cho > 0
                        ? `${formatNumber(cho, 0)} chờ`
                        : da > 0
                          ? `${formatNumber(da, 0)} đã nhập`
                          : '';
                    const base = name ? `${code} · ${name}` : code;
                    return counts ? `${base} · ${counts}` : base;
                  }}
                  dropdownWidth="w-max min-w-[16rem] max-w-[min(28rem,calc(100vw-1rem))]"
                  onChange={value => {
                    if (isNhapKho || !nhapKhoCa || !nhapKhoMay) return;
                    setNhapKhoMaSp(value === 'all' ? '' : value);
                    setNhapKhoChecked(false);
                  }}
                />
              </div>
              {nhapKhoCaOptions.length === 0 ? (
                <p className="text-xs font-semibold text-amber-700">
                  Chưa có ca trong dữ liệu đã tải. Kiểm tra bộ lọc ngày trên trang rồi Tải lại.
                </p>
              ) : null}
              {nhapKhoCa && nhapKhoMay && nhapKhoMaSpStats.waitingTotal === 0 && nhapKhoMaSpStats.doneTotal > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="min-w-0 flex-1 text-xs font-semibold text-amber-900">
                    Ca · máy này có {formatNumber(nhapKhoMaSpStats.doneTotal, 0)} cuộn «Đã nhập kho», chưa còn cuộn chờ.
                  </p>
                  <button
                    type="button"
                    disabled={isNhapKho || isResettingNhapKho}
                    onClick={() => void handleResetNhapKhoInModal()}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11px] font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
                  >
                    {isResettingNhapKho ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Về chờ ({formatNumber(nhapKhoMaSpStats.doneTotal, 0)})
                  </button>
                </div>
              ) : null}
              {nhapKhoCa &&
              nhapKhoMay &&
              nhapKhoMaSp &&
              nhapKhoMaSpStats.waitingTotal > 0 &&
              (nhapKhoMaSpStats.waitingByKey.get(normalizeProductCodeKey(nhapKhoMaSp)) || 0) === 0 ? (
                <p className="text-xs font-semibold text-amber-700">
                  Mã SP này không còn cuộn chờ nhập kho
                  {(nhapKhoMaSpStats.doneByKey.get(normalizeProductCodeKey(nhapKhoMaSp)) || 0) > 0
                    ? ` (có ${formatNumber(nhapKhoMaSpStats.doneByKey.get(normalizeProductCodeKey(nhapKhoMaSp)) || 0, 0)} cuộn đã nhập).`
                    : '.'}
                </p>
              ) : null}
              <p className="text-[11px] font-semibold text-zinc-500">
                Danh sách bên dưới chỉ gồm mã QR của Mã SP đã chọn. Mỗi lần xác nhận tạo phiếu nhập mới, trạng thái chưa chốt.
              </p>
              <label className="block space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Số cuộn</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={nhapKhoSoCuon}
                  onChange={event => setNhapKhoSoCuon(event.target.value)}
                  placeholder="Nhập số cuộn cần nhập kho"
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-900 outline-none focus:border-sky-400"
                />
              </label>
              {nhapKhoCount > nhapKhoQueue.eligible.length ? (
                <p className="text-xs font-semibold text-amber-700">
                  Chỉ còn {formatNumber(nhapKhoQueue.eligible.length, 0)} cuộn chờ nhập kho.
                </p>
              ) : null}
              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-[11px] font-black uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">TT</th>
                      <th className="px-3 py-2">Mã QR</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nhapKhoPreview.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center font-semibold text-zinc-400">
                          {!nhapKhoCa || !nhapKhoMay
                            ? 'Chọn cả ca và máy để lọc mã QR.'
                            : !nhapKhoMaSp
                              ? 'Chọn Mã SP để hiện mã QR chờ nhập kho.'
                              : nhapKhoCount > 0
                                ? waitingNhapKho.length === 0
                                  ? 'Không còn mã QR chờ nhập kho cho Mã SP này.'
                                  : 'Không có mã QR hợp lệ để nhập kho.'
                                : 'Nhập số cuộn để hiện danh sách mã QR.'}
                        </td>
                      </tr>
                    ) : (
                      nhapKhoPreview.map((row, index) => {
                        const hitKey = String(row.qr_code || '').trim().toUpperCase();
                        const phieus = nhapKhoHits.get(hitKey) || [];
                        return (
                          <tr key={rowIdKey(row.id)} className="border-t border-zinc-100">
                            <td className="px-3 py-2 font-bold text-zinc-500">{index + 1}</td>
                            <td className="px-3 py-2 font-mono font-bold text-zinc-900">{row.qr_code}</td>
                            <td className="px-3 py-2 font-bold">
                              {!nhapKhoChecked ? (
                                <span className="text-amber-800">{NHAP_KHO_CHO}</span>
                              ) : phieus.length > 0 ? (
                                <span className="text-rose-700">Đã có trong nhap_kho · {phieus.join(', ')}</span>
                              ) : (
                                <span className="text-emerald-700">Chưa có trong nhap_kho</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] font-semibold text-zinc-500">
                Người bấm: {currentUser?.name || 'Không rõ'} · thời điểm được ghi khi xác nhận.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowNhapKhoModal(false)}
                disabled={isNhapKho}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleCheckNhapKho()}
                disabled={isNhapKho || isCheckingNhapKho || (nhapKhoPreview.length === 0 && waitingNhapKho.length === 0)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-extrabold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {isCheckingNhapKho ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kiểm tra
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmNhapKho()}
                disabled={isNhapKho || loadingNhapKhoKho || !nhapKhoCa || !nhapKhoMay || !nhapKhoMaSp || nhapKhoPreview.length === 0 || !nhapKhoKho}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-extrabold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {isNhapKho ? <Loader2 className="h-4 w-4 animate-spin" /> : <Warehouse className="h-4 w-4" />}
                Nhập kho ({formatNumber(nhapKhoPreview.length, 0)})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkNgayModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="can-tu-dong-bulk-ngay-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 id="can-tu-dong-bulk-ngay-title" className="text-base font-black text-zinc-950">
                  {bulkNgayScope === 'selected' ? 'Sửa Ngày đã chọn' : 'Điền Ngày hàng loạt'}
                </h3>
                <p className="text-xs font-semibold text-zinc-500">
                  {bulkNgayScope === 'selected'
                    ? `Áp dụng cho ${formatNumber(selectedCount, 0)} dòng đã tick`
                    : `Áp dụng cho ${formatNumber(visibleRecords.length, 0)} dòng đang hiện (theo bộ lọc)`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkNgayModal(false)}
                disabled={isSettingNgay}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <TableDateFilter label="Ngày điền" value={bulkNgayValue} onChange={setBulkNgayValue} />
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
                <p>Chỉ đổi cột <strong>Ngày</strong> (SOURCE_DATE / work_date).</p>
                <p className="mt-1 text-sky-800">Không đổi ngày cân · Ca · Lệnh SX · Máy.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowBulkNgayModal(false)}
                disabled={isSettingNgay}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleBulkSetNgay()}
                disabled={isSettingNgay}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-extrabold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {isSettingNgay ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                {isSettingNgay
                  ? 'Đang sửa...'
                  : bulkNgayScope === 'selected'
                    ? `Sửa ${formatNumber(selectedCount, 0)} dòng`
                    : `Điền ${formatNumber(visibleRecords.length, 0)} dòng`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkMaSpModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="can-tu-dong-bulk-ma-sp-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 id="can-tu-dong-bulk-ma-sp-title" className="text-base font-black text-zinc-950">
                  Đồng bộ theo Mã SP
                </h3>
                <p className="text-xs font-semibold text-zinc-500">
                  Áp dụng cho {formatNumber(visibleRecords.length, 0)} dòng đang hiện (theo bộ lọc)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkMaSpModal(false)}
                disabled={isSettingMaSp}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-2">
                <label className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-xs font-semibold text-teal-950">
                  <input
                    type="radio"
                    name="bulk-ma-sp-mode"
                    className="mt-0.5"
                    checked={bulkMaSpMode === 'prefix'}
                    onChange={() => setBulkMaSpMode('prefix')}
                    disabled={isSettingMaSp}
                  />
                  <span>
                    <span className="font-extrabold">Theo tiền tố QR</span>
                    <span className="mt-0.5 block font-semibold text-teal-800">
                      Mã SP = phần trước `_` hoặc `+` · tải lại TL tiêu chuẩn từ danh mục SP
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800">
                  <input
                    type="radio"
                    name="bulk-ma-sp-mode"
                    className="mt-0.5"
                    checked={bulkMaSpMode === 'pick'}
                    onChange={() => setBulkMaSpMode('pick')}
                    disabled={isSettingMaSp}
                  />
                  <span>
                    <span className="font-extrabold">Chọn một Mã SP</span>
                    <span className="mt-0.5 block font-semibold text-zinc-600">
                      Ghi đè phần mã trong QR cho mọi dòng đang lọc
                    </span>
                  </span>
                </label>
              </div>
              {bulkMaSpMode === 'pick' ? (
                <FilterCombobox
                  label="Mã SP đồng bộ"
                  options={bulkMaSpOptions}
                  value={bulkMaSpValue}
                  onChange={setBulkMaSpValue}
                  searchPlaceholder="Tìm mã SP..."
                  includeAll={false}
                  formatOption={code => {
                    const name = productNameByCode.get(normalizeProductCodeKey(code));
                    const hasTl = productStandardWeightByCode.has(normalizeProductCodeKey(code));
                    if (name && hasTl) return `${code} · ${name} · có TL`;
                    if (name) return `${code} · ${name}`;
                    return hasTl ? `${code} · có TL` : code;
                  }}
                  dropdownWidth="w-max min-w-[16rem] max-w-[min(28rem,calc(100vw-1rem))]"
                />
              ) : null}
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900">
                <p>
                  Cột <strong>Mã SP</strong> chỉ lấy <strong>tiền tố</strong> của QR (trước `_` / trước `+`).
                </p>
                <p className="mt-1 text-teal-800">
                  Trọng lượng tiêu chuẩn / lõi LT / nhựa ĐM lấy từ `san_pham` theo mã đó.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowBulkMaSpModal(false)}
                disabled={isSettingMaSp}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleBulkSyncMaSpForVisible()}
                disabled={isSettingMaSp || (bulkMaSpMode === 'pick' && !bulkMaSpValue.trim())}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-extrabold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {isSettingMaSp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {isSettingMaSp
                  ? 'Đang đồng bộ...'
                  : bulkMaSpMode === 'pick'
                    ? `Đồng bộ ${formatNumber(visibleRecords.length, 0)} dòng`
                    : 'Đồng bộ tiền tố + TL'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAutoFillModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="can-tu-dong-autofill-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 id="can-tu-dong-autofill-title" className="text-base font-black text-zinc-950">
                  Tự động điền
                </h3>
                <p className="text-xs font-semibold text-zinc-500">
                  Điền cho {selectedCount} dòng đã chọn
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoFillModal(false)}
                disabled={isAutoFilling}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                <p>• Ngày = 20/08/2026</p>
                <p>• Ca = {AUTO_FILL_CA}</p>
                <p>• Lệnh SX = {AUTO_FILL_LENH_SX}</p>
                <p>• Máy = {AUTO_FILL_MAY}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAutoFillModal(false)}
                disabled={isAutoFilling}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleAutoFillSelected()}
                disabled={isAutoFilling}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-extrabold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isAutoFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isAutoFilling ? 'Đang điền...' : 'Điền tất cả đã chọn'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingRecord ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 className="text-base font-black text-zinc-950">Sửa dòng cân tự động</h3>
                <p className="text-xs font-semibold text-zinc-500">ID: {editingRecord.id}</p>
              </div>
              <button type="button" onClick={() => setEditingRecord(null)} disabled={isSavingEdit} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {([
                ['qr_code', 'Mã QR'], ['ca', 'Ca'], ['tare_weight', 'Cân lõi'],
                ['weight', 'Cân sản phẩm'], ['unit', 'Đơn vị'], ['device_id', 'Thiết bị'], ['status', 'Trạng thái']
              ] as const).map(([key, label]) => (
                <label key={key} className={key === 'qr_code' ? 'sm:col-span-2' : ''}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</span>
                  <input
                    value={editForm[key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    inputMode={key === 'tare_weight' || key === 'weight' ? 'decimal' : undefined}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold outline-none focus:border-[#ef1b2d]"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button type="button" onClick={() => setEditingRecord(null)} disabled={isSavingEdit} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700">Hủy</button>
              <button type="button" onClick={() => void handleSaveEdit()} disabled={isSavingEdit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white disabled:opacity-60">
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printData && typeof document !== 'undefined'
        ? createPortal(<CanTuDongPrintBatch data={printData} />, document.body)
        : null}
    </div>
  );
}

export default CanTuDongPanel;
