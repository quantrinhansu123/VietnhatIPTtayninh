import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Loader2,
  Plus,
  Printer,
  Save,
  ScanBarcode,
  Trash2,
  X
} from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import ProductQrScanner from '../../components/ProductQrScanner';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { waitForPrintImagesReady } from '../../utils/printReady';
import { KiemKhoPrintSheet, type KiemKhoPrintReport } from './KiemKhoPrintSheet';
import {
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination
} from '../../components/shared/table';

type CatalogProduct = {
  code: string;
  name: string;
  productType: string;
  unit: string;
  totalWeight: string;
  warehouse: string;
};

type WarehouseCatalogItem = { id: string | number; ten_kho: string };

/** Viết tắt tên kho dùng cho tiêu đề cột động ("Mã TP gốc", "Tên NVL"...). */
const KHO_ABBREVIATION_MAP: Record<string, string> = {
  'Kho thành phẩm': 'TP',
  'Kho NVL': 'NVL',
  'Kho hàng hóa': 'HH',
  'Kho gia công': 'GC',
  'Kho công cụ dụng cụ': 'CCDC',
  'Kho hàng hỏng': 'HHỎNG',
  'Kho hàng rác': 'HR',
  'Kho tái chế': 'TC'
};

function khoAbbreviation(tenKho: string) {
  const key = tenKho.trim();
  if (!key) return 'SP';
  if (KHO_ABBREVIATION_MAP[key]) return KHO_ABBREVIATION_MAP[key];
  const rest = key.replace(/^Kho\s+/i, '').trim();
  return (rest || key).toUpperCase();
}

/** Kho NVL nhập tay, không quét QR — ẩn cột "Mã quét". */
function isNvlKho(tenKho: string) {
  return khoAbbreviation(tenKho) === 'NVL';
}

type KiemKhoLine = {
  key: string;
  maNvl: string;
  maSp: string;
  tenSp: string;
  loaiSp: string;
  donVi: string;
  soLuong: string;
  trongLuong: string;
  rawQr: string;
};

type OpenBatch = {
  dot_kiem_kho: string;
  ten_kho: string | null;
  ngay_bat_dau: string | null;
  thu_tu_trong_ngay: number;
  tong_dot_trong_ngay: number;
};

type DotGroup = {
  dot_kiem_kho: string;
  ten_kho: string | null;
  ngay_bat_dau: string | null;
  thoi_gian_xac_nhan: string | null;
  da_xac_nhan: boolean;
  so_dong: number;
  thu_tu_trong_ngay: number;
  tong_dot_trong_ngay: number;
};

type KiemKhoDetailRow = {
  id: number | string;
  ma_nvl?: string | null;
  ma_sp?: string | null;
  ten_sp?: string | null;
  loai_sp?: string | null;
  ngay_gio_kiem_kho?: string | null;
  nguoi_kiem_kho?: string | null;
  thoi_gian_xac_nhan?: string | null;
};

type KiemKhoTongHopRow = {
  id?: number | string;
  dot_kiem_kho?: string | null;
  ma_nvl?: string | null;
  ten_sp?: string | null;
  loai_sp?: string | null;
  tong_so_luong?: number | null;
  chot_luc?: string | null;
  nguoi_chot?: string | null;
  /** false = tính "live" từ đợt chưa chốt (không có id/chot_luc/nguoi_chot thật). */
  da_chot?: boolean;
};

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function normalizeKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseQrProductCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

/** Tiền tố trước `_` chỉ để tra tên/loại SP trong danh mục — không dùng để xét trùng. */
function productPrefixBeforeUnderscore(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const us = trimmed.indexOf('_');
  if (us > 0) return trimmed.slice(0, us).trim();
  return parseQrProductCode(trimmed);
}

function newLineKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowLocalDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toIsoFromLocalDateTime(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

/** Nhãn hiển thị đợt; nếu một ngày có nhiều đợt thì thêm "- 1", "- 2"... ở cuối. */
function formatDotLabel(
  startIso: string | null,
  confirmIso?: string | null,
  dayOrdinal?: number,
  sameDayCount?: number
) {
  const start = startIso ? new Date(startIso) : null;
  if (!start || Number.isNaN(start.getTime())) return startIso || '—';
  const startDay = `${start.getDate()}/${start.getMonth() + 1}`;
  const yy = String(start.getFullYear()).slice(-2);
  const confirm = confirmIso ? new Date(confirmIso) : null;
  const endDay = confirm && !Number.isNaN(confirm.getTime()) ? `${confirm.getDate()}/${confirm.getMonth() + 1}` : '...';
  const ordinalSuffix = Number(sameDayCount) > 1 ? ` - ${Math.max(1, Number(dayOrdinal) || 1)}` : '';
  return `T${start.getMonth() + 1}/${yy} (${startDay}-${endDay})${ordinalSuffix}`;
}

function newDotKiemKhoKey() {
  return new Date().toISOString();
}

function formatDateTime(value?: string | null) {
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
    second: '2-digit'
  });
}

function normalizeCatalogProducts(data: unknown): CatalogProduct[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
        ? (data as { materials: unknown[] }).materials
      : [];

  return rows
    .map((item): CatalogProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.ma_npl ?? record.ma_san_pham ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.ten_npl ?? record.ten_san_pham ?? record.name ?? '').trim();
      const productType = String(
        record.nhom_vthh ?? record.loai_sp ?? record.loai ?? record.nhom ?? ''
      ).trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim();
      const totalWeight = String(record.tong_trong_luong ?? record.totalWeight ?? '').trim();
      const warehouse = String(record.ten_kho ?? record.warehouse ?? '').trim();
      if (!code) return null;
      return { code, name, productType, unit, totalWeight, warehouse };
    })
    .filter((item): item is CatalogProduct => Boolean(item));
}

function normalizeWarehouseCatalog(data: unknown): WarehouseCatalogItem[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return records
    .map((item): WarehouseCatalogItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const tenKho = String(record.ten_kho ?? '').trim();
      if (!tenKho) return null;
      return { id: (record.id as string | number) ?? tenKho, ten_kho: tenKho };
    })
    .filter((item): item is WarehouseCatalogItem => Boolean(item));
}

function findCatalogProduct(code: string, products: CatalogProduct[], warehouse = '') {
  const key = normalizeKey(code);
  if (!key) return null;
  const matches = products.filter(item => normalizeKey(item.code) === key);
  const warehouseKey = normalizeKey(warehouse);
  return matches.find(item => warehouseKey && normalizeKey(item.warehouse) === warehouseKey) ?? matches[0] ?? null;
}

/** Trùng mã = trùng cả chuỗi (tiền tố + hậu tố). */
function isSameFullCode(a: string, b: string) {
  return normalizeKey(a) === normalizeKey(b);
}

export function KiemKhoPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { name?: string | null } | null;
}) {
  const { canCreate, canDelete } = useTabAccess('kiem-kho');
  const loginName = String(currentUser?.name ?? '').trim();
  const [view, setView] = useState<'thuc-hien' | 'danh-sach' | 'tong-hop'>('thuc-hien');
  const [warehouses, setWarehouses] = useState<WarehouseCatalogItem[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [selectedKho, setSelectedKho] = useState('');
  const [dotKiemKho, setDotKiemKho] = useState('');
  const [openBatches, setOpenBatches] = useState<OpenBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [nguoiKiemKho, setNguoiKiemKho] = useState(loginName);
  const performBatchOptions = useMemo<OpenBatch[]>(
    () =>
      openBatches.length > 0
        ? openBatches
        : [
            {
              dot_kiem_kho: '',
              ten_kho: null,
              ngay_bat_dau: null,
              thu_tu_trong_ngay: 1,
              tong_dot_trong_ngay: 1
            }
          ],
    [openBatches]
  );

  // Tab "Danh sách chi tiết"
  const [allBatches, setAllBatches] = useState<DotGroup[]>([]);
  const [loadingAllBatches, setLoadingAllBatches] = useState(false);
  const [selectedDot, setSelectedDot] = useState('');
  const [dotDetailLines, setDotDetailLines] = useState<KiemKhoDetailRow[]>([]);
  const [dotDetailTotal, setDotDetailTotal] = useState(0);
  const [dotDetailPage, setDotDetailPage] = useState(1);
  const [dotDetailPageSize, setDotDetailPageSize] = useState(50);
  const [loadingDotDetail, setLoadingDotDetail] = useState(false);
  const [confirmingDot, setConfirmingDot] = useState(false);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  // Tab "Bảng tổng hợp"
  const [summaryRows, setSummaryRows] = useState<KiemKhoTongHopRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [selectedSummaryDot, setSelectedSummaryDot] = useState('');
  const [summaryDotTouched, setSummaryDotTouched] = useState(false);
  const [printReport, setPrintReport] = useState<KiemKhoPrintReport | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  useEffect(() => {
    if (loginName) setNguoiKiemKho(loginName);
  }, [loginName]);
  const [lines, setLines] = useState<KiemKhoLine[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'hardware' | 'hardware-v2' | 'camera'>('hardware-v2');
  const [manualCode, setManualCode] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const manualAutoAddTimerRef = useRef<number | null>(null);

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const clearManualAutoAddTimer = () => {
    if (manualAutoAddTimerRef.current !== null) {
      window.clearTimeout(manualAutoAddTimerRef.current);
      manualAutoAddTimerRef.current = null;
    }
  };

  useEffect(() => () => clearManualAutoAddTimer(), []);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const [productRes, materialRes] = await Promise.all([
        fetch('/api/san-pham?format=table'),
        fetch('/api/kho-nvl')
      ]);
      const [productData, materialData] = await Promise.all([
        productRes.json().catch(() => ({})),
        materialRes.json().catch(() => ({}))
      ]);
      if (!productRes.ok && !materialRes.ok) {
        throw new Error(readApiErrorMessage(productRes, productData, 'Không tải được danh mục kho.'));
      }
      setProducts([
        ...(productRes.ok ? normalizeCatalogProducts(productData) : []),
        ...(materialRes.ok ? normalizeCatalogProducts(materialData) : [])
      ]);
    } catch (err: any) {
      setProducts([]);
      showAppToast(err?.message || 'Không tải được danh mục SP.', 'error');
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true);
    try {
      const res = await fetch('/api/quan-ly-kho');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh mục kho.'));
      setWarehouses(normalizeWarehouseCatalog(data));
    } catch (err: any) {
      setWarehouses([]);
      showAppToast(err?.message || 'Không tải được danh mục kho.', 'error');
    } finally {
      setLoadingWarehouses(false);
    }
  }, []);

  const loadOpenBatches = useCallback(async (kho: string) => {
    if (!kho) {
      setOpenBatches([]);
      setDotKiemKho('');
      return;
    }
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/kiem-kho/dot-mo?tenKho=${encodeURIComponent(kho)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt kiểm kho.'));
      const records: OpenBatch[] = Array.isArray(data?.records) ? data.records : [];
      setOpenBatches(records);
      // Còn đợt chưa xác nhận → bắt buộc tiếp tục đợt đó, không cho tạo đợt mới.
      setDotKiemKho(prev => {
        if (prev && records.some(b => b.dot_kiem_kho === prev)) return prev;
        return records.length > 0 ? records[0].dot_kiem_kho : '';
      });
    } catch (err: any) {
      setOpenBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt kiểm kho.', 'error');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadWarehouses();
  }, [loadProducts, loadWarehouses]);

  useEffect(() => {
    void loadOpenBatches(selectedKho);
  }, [selectedKho, loadOpenBatches]);

  const loadAllBatches = useCallback(async (kho: string) => {
    if (!kho) {
      setAllBatches([]);
      return;
    }
    setLoadingAllBatches(true);
    try {
      const res = await fetch(`/api/kiem-kho/dot?tenKho=${encodeURIComponent(kho)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt kiểm kho.'));
      const records: DotGroup[] = Array.isArray(data?.records) ? data.records : [];
      setAllBatches(records);
      // Mới chọn kho → mặc định chọn đợt gần nhất của kho đó.
      setSelectedDot(prev => (prev && records.some(b => b.dot_kiem_kho === prev) ? prev : records[0]?.dot_kiem_kho ?? ''));
    } catch (err: any) {
      setAllBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt kiểm kho.', 'error');
    } finally {
      setLoadingAllBatches(false);
    }
  }, []);

  const loadDotDetail = useCallback(async (dot: string, page = dotDetailPage, pageSize = dotDetailPageSize) => {
    if (!dot) {
      setDotDetailLines([]);
      setDotDetailTotal(0);
      return;
    }
    setLoadingDotDetail(true);
    try {
      const offset = (page - 1) * pageSize;
      const res = await fetch(`/api/kiem-kho?dotKiemKho=${encodeURIComponent(dot)}&limit=${pageSize}&offset=${offset}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách sản phẩm của đợt.'));
      setDotDetailLines(Array.isArray(data?.records) ? data.records : []);
      setDotDetailTotal(Number(data?.total) || 0);
    } catch (err: any) {
      setDotDetailLines([]);
      setDotDetailTotal(0);
      showAppToast(err?.message || 'Không tải được danh sách sản phẩm của đợt.', 'error');
    } finally {
      setLoadingDotDetail(false);
    }
  }, [dotDetailPage, dotDetailPageSize]);

  useEffect(() => {
    if (view === 'danh-sach' || view === 'tong-hop') {
      void loadAllBatches(selectedKho);
    }
  }, [view, selectedKho, loadAllBatches]);

  // Đổi kho → bỏ chọn đợt/đợt tổng hợp cũ, tránh giữ dữ liệu của kho trước.
  useEffect(() => {
    setSelectedDot('');
    setSelectedSummaryDot('');
    setSummaryDotTouched(false);
  }, [selectedKho]);

  useEffect(() => {
    setDotDetailPage(1);
  }, [selectedDot]);

  useEffect(() => {
    if (view === 'danh-sach') void loadDotDetail(selectedDot);
  }, [view, selectedDot, dotDetailPage, dotDetailPageSize, loadDotDetail]);

  const selectedDotGroup = useMemo(
    () => allBatches.find(b => b.dot_kiem_kho === selectedDot) ?? null,
    [allBatches, selectedDot]
  );

  const handleDeleteDetailLine = async (line: KiemKhoDetailRow) => {
    if (!canDelete || !selectedDotGroup || selectedDotGroup.da_xac_nhan) return;
    const id = String(line.id ?? '').trim();
    if (!id) return;

    const productCode = String(line.ma_sp || line.ma_nvl || '').trim() || 'sản phẩm này';
    if (!window.confirm(`Xóa mã "${productCode}" khỏi đợt kiểm kho này?`)) return;

    setDeletingDetailId(id);
    try {
      const res = await fetch(`/api/kiem-kho/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được sản phẩm khỏi đợt kiểm kho.'));

      const nextTotal = Math.max(0, dotDetailTotal - 1);
      const nextPage = Math.min(dotDetailPage, Math.max(1, Math.ceil(nextTotal / dotDetailPageSize)));
      setDotDetailPage(nextPage);
      showAppToast(`Đã xóa mã "${productCode}" khỏi đợt kiểm kho.`, 'success');
      await Promise.all([
        loadDotDetail(selectedDot, nextPage, dotDetailPageSize),
        loadAllBatches(selectedKho),
        loadOpenBatches(selectedKho)
      ]);
    } catch (err: any) {
      showAppToast(err?.message || 'Không xóa được sản phẩm khỏi đợt kiểm kho.', 'error');
    } finally {
      setDeletingDetailId(null);
    }
  };

  const handleConfirmDot = async () => {
    if (!selectedDot) return;
    setConfirmingDot(true);
    try {
      const res = await fetch('/api/kiem-kho/dot-xac-nhan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dot_kiem_kho: selectedDot,
          nguoi_xac_nhan: (nguoiKiemKho || loginName).trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xác nhận được kiểm kê.'));
      showAppToast('Đã xác nhận kiểm kê đợt này.', 'success');
      if (data?.warning) showAppToast(String(data.warning), 'error');
      await Promise.all([loadAllBatches(selectedKho), loadDotDetail(selectedDot), loadOpenBatches(selectedKho)]);
    } catch (err: any) {
      showAppToast(err?.message || 'Không xác nhận được kiểm kê.', 'error');
    } finally {
      setConfirmingDot(false);
    }
  };

  // Tải tổng hợp CHỈ của 1 đợt (không tải cả lịch sử về rồi lọc client) — đợt đã
  // chốt đọc bảng kiem_kho_tong_hop có sẵn, đợt chưa chốt gộp "live" từ kiem_kho
  // (GROUP BY chạy trong Postgres qua RPC, xem docs/de-xuat-tong-hop-hien-thi-dot-chua-chot.md).
  const loadSummary = useCallback(async (dot: string, daXacNhan: boolean) => {
    if (!dot) {
      setSummaryRows([]);
      return;
    }
    setLoadingSummary(true);
    setSummaryError('');
    try {
      const url = daXacNhan
        ? `/api/kiem-kho-tong-hop?dotKiemKho=${encodeURIComponent(dot)}&limit=1000`
        : `/api/kiem-kho/dot-tong-hop-live?dotKiemKho=${encodeURIComponent(dot)}`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được bảng tổng hợp.'));
      const records: KiemKhoTongHopRow[] = Array.isArray(data?.records) ? data.records : [];
      setSummaryRows(daXacNhan ? records.map(row => ({ ...row, da_chot: true })) : records);
    } catch (err: any) {
      setSummaryRows([]);
      const text = err?.message || 'Không tải được bảng tổng hợp.';
      setSummaryError(text);
      showAppToast(text, 'error');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // Liệt kê mọi đợt (đã chốt lẫn chưa chốt) — mới nhất trước, theo thứ tự allBatches trả về.
  const summaryDotOptions = useMemo(() => allBatches.map(b => b.dot_kiem_kho), [allBatches]);

  // Mới vào tab → mặc định chỉ hiện đợt gần nhất.
  useEffect(() => {
    if (view !== 'tong-hop' || summaryDotTouched || summaryDotOptions.length === 0) return;
    setSelectedSummaryDot(summaryDotOptions[0]);
  }, [view, summaryDotOptions, summaryDotTouched]);

  const selectedSummaryDotGroup = useMemo(
    () => allBatches.find(b => b.dot_kiem_kho === selectedSummaryDot) ?? null,
    [allBatches, selectedSummaryDot]
  );

  useEffect(() => {
    if (view !== 'tong-hop') return;
    void loadSummary(selectedSummaryDot, !!selectedSummaryDotGroup?.da_xac_nhan);
  }, [view, selectedSummaryDot, selectedSummaryDotGroup, loadSummary]);

  const handlePrintSummary = () => {
    if (!selectedSummaryDotGroup || !selectedSummaryDot) {
      showAppToast('Chọn đợt kiểm kho trước khi in phiếu.', 'error');
      return;
    }

    setPrintReport({
      dotLabel: formatDotLabel(
        selectedSummaryDotGroup.ngay_bat_dau,
        selectedSummaryDotGroup.thoi_gian_xac_nhan,
        selectedSummaryDotGroup.thu_tu_trong_ngay,
        selectedSummaryDotGroup.tong_dot_trong_ngay
      ),
      dotKiemKho: selectedSummaryDot,
      ngayBatDau: selectedSummaryDotGroup.ngay_bat_dau,
      thoiGianXacNhan: selectedSummaryDotGroup.thoi_gian_xac_nhan,
      nguoiChot: String(summaryRows.find(row => row.nguoi_chot)?.nguoi_chot ?? '').trim(),
      daXacNhan: selectedSummaryDotGroup.da_xac_nhan,
      rows: summaryRows.map(row => ({
        maNvl: String(row.ma_nvl ?? '').trim(),
        tenSp: String(row.ten_sp ?? '').trim(),
        loaiSp: String(row.loai_sp ?? '').trim(),
        tongSoLuong: Number(row.tong_so_luong) || 0
      }))
    });
    setPendingPrint(true);
  };

  useEffect(() => {
    if (!pendingPrint || !printReport) return;
    let cancelled = false;
    const pageStyle = document.createElement('style');
    pageStyle.dataset.printPage = 'kiem-kho';
    pageStyle.textContent = `
      @page { size: A4 portrait; margin: 5mm; }
      @media print {
        html, body { height: auto !important; min-height: 0 !important; margin: 0 !important; }
        body.kiem-kho-summary-print-active .kiem-kho-print-sheet {
          page: auto !important;
          height: auto !important;
          min-height: 0 !important;
          break-after: auto !important;
          page-break-after: auto !important;
        }
      }
    `;
    document.head.appendChild(pageStyle);
    document.body.classList.add('kiem-kho-summary-print-active');
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
      });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      pageStyle.remove();
      document.body.classList.remove('kiem-kho-summary-print-active');
    };
  }, [pendingPrint, printReport]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('kiem-kho-summary-print-active');
      setPrintReport(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('kiem-kho-summary-print-active');
    };
  }, []);

  const addLineFromCode = useCallback(
    (raw: string, showFeedback = true): boolean | 'duplicate' => {
      if (showFeedback) setMessage('');
      const fullCode = String(raw ?? '').trim();
      if (!fullCode) {
        setError('Nhập hoặc quét mã SP.');
        return false;
      }

      if (isLoadingProducts) {
        setError('Danh mục sản phẩm đang tải. Vui lòng thử lại sau ít giây.');
        return false;
      }

      // Một mã SP = tiền tố + hậu tố (nguyên chuỗi). Chỉ bỏ qua khi trùng đúng cả mã.
      // ma_nvl = tiền tố trước `_` (auto). ma_sp = nguyên mã vừa quét.
      const exists = linesRef.current.some(
        line => isSameFullCode(line.maSp, fullCode) || isSameFullCode(line.rawQr, fullCode)
      );
      if (exists) {
        setError(`Mã "${fullCode}" đã có trên form — không thêm dòng trùng.`);
        return 'duplicate';
      }

      const maNvl = productPrefixBeforeUnderscore(fullCode) || fullCode;
      const matched = findCatalogProduct(maNvl, products, selectedKho);

      const nextLine: KiemKhoLine = {
        key: newLineKey(),
        maNvl,
        maSp: fullCode,
        tenSp: matched?.name || '',
        loaiSp: matched?.productType || '',
        donVi: matched?.unit || '',
        // Mỗi mã QR đại diện đúng một đơn vị kiểm kho.
        soLuong: '1',
        trongLuong: matched?.totalWeight || '',
        rawQr: fullCode
      };
      const nextLines = [...linesRef.current, nextLine];
      linesRef.current = nextLines;
      setLines(nextLines);
      setError('');
      if (showFeedback) {
        setMessage(
          matched
            ? `Đã thêm: ${fullCode}`
            : `Đã thêm: ${fullCode} (chưa khớp danh mục — kiểm tra tên/loại)`
        );
      }
      return true;
    },
    [isLoadingProducts, products, selectedKho]
  );

  const handleQrScan = useCallback(
    (raw: string): boolean | 'duplicate' => addLineFromCode(raw),
    [addLineFromCode]
  );

  const closeManualModal = () => {
    clearManualAutoAddTimer();
    setShowManualModal(false);
    setManualCode('');
  };

  const openManualModal = () => {
    clearManualAutoAddTimer();
    const nextLine: KiemKhoLine = {
      key: newLineKey(),
      maNvl: '',
      maSp: '',
      tenSp: '',
      loaiSp: '',
      donVi: '',
      soLuong: '',
      trongLuong: '',
      rawQr: ''
    };
    const nextLines = [...linesRef.current, nextLine];
    linesRef.current = nextLines;
    setLines(nextLines);
  };

  useEffect(() => {
    if (!showManualModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeManualModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showManualModal]);

  const handleManualAdd = useCallback(
    (overrideValue?: string) => {
      clearManualAutoAddTimer();
      const value = (overrideValue ?? manualCode).trim();
      const result = addLineFromCode(value, false);
      if (result === true) {
        setManualCode('');
      }
      return result;
    },
    [addLineFromCode, manualCode]
  );

  /** Dòng thêm thủ công: chọn mã từ gợi ý sẽ tự điền các thông tin danh mục. */
  const handleManualCodeChange = (value: string) => {
    setManualCode(value);
    clearManualAutoAddTimer();
  };

  const manualProductOptions = useMemo(() => {
    const warehouseKey = normalizeKey(selectedKho);
    if (!warehouseKey) return [];
    return products.filter(product => normalizeKey(product.warehouse) === warehouseKey);
  }, [products, selectedKho]);

  const manualCatalogProduct = useMemo(
    () => findCatalogProduct(manualCode, manualProductOptions, selectedKho),
    [manualCode, manualProductOptions, selectedKho]
  );

  const handleManualProductSelected = useCallback(
    (item: unknown | null) => {
      if (!item) return;
      const result = handleManualAdd((item as CatalogProduct).code);
      if (result === true) setShowManualModal(false);
    },
    [handleManualAdd]
  );

  const updateLine = useCallback((key: string, patch: Partial<KiemKhoLine>) => {
    setLines(previous => {
      const next = previous.map(line => (line.key === key ? { ...line, ...patch } : line));
      linesRef.current = next;
      return next;
    });
  }, []);

  const updateLineCode = useCallback(
    (key: string, value: string) => {
      const matched = findCatalogProduct(value, manualProductOptions, selectedKho);
      const isMaterialLine = isNvlKho(selectedKho);
      updateLine(key, {
        maNvl: value,
        ...(isMaterialLine ? { maSp: value, rawQr: value } : {}),
        ...(matched
          ? {
              tenSp: matched.name,
              loaiSp: matched.productType,
              donVi: matched.unit,
              trongLuong: matched.totalWeight
            }
          : {})
      });
    },
    [manualProductOptions, selectedKho, updateLine]
  );

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(line => line.key !== key));
  };

  const handleSave = async () => {
    setError('');
    setMessage('');
    const savableLines = lines.filter(line => line.maSp.trim());
    if (!selectedKho.trim()) {
      setError('Chọn kho trước khi lưu phiếu.');
      return;
    }
    if (!nguoiKiemKho.trim()) {
      setError('Nhập người kiểm kho.');
      return;
    }
    if (!savableLines.length) {
      setError('Nhập hoặc quét ít nhất một mã sản phẩm.');
      return;
    }

    setSaving(true);
    try {
      const thoiDiemLuu = nowLocalDateTimeValue();
      // Chọn sẵn đợt chưa chốt thì tiếp tục đợt đó; không chọn thì tạo đợt mới, bắt đầu từ lúc lưu.
      const finalDotKiemKho = dotKiemKho.trim() || newDotKiemKhoKey();
      const res = await fetch('/api/kiem-kho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ten_kho: selectedKho.trim(),
          dot_kiem_kho: finalDotKiemKho,
          nguoi_kiem_kho: nguoiKiemKho.trim(),
          ngay_gio_kiem_kho: toIsoFromLocalDateTime(thoiDiemLuu),
          lines: savableLines.map(line => ({
            ma_nvl: line.maNvl,
            ma_sp: line.maSp,
            ten_sp: line.tenSp,
            loai_sp: line.loaiSp
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không lưu được báo cáo kiểm kho.'));
      }
      const savedCount = Number(data?.saved_count ?? data?.total ?? 0);
      const skippedCount = Number(data?.skipped_count ?? 0);
      const resultMessage =
        skippedCount > 0
          ? `Đã lưu ${savedCount} sản phẩm. ${skippedCount} sản phẩm đã có trong đợt nên không lưu lại.`
          : `Đã lưu ${savedCount} sản phẩm.`;
      setLines([]);
      linesRef.current = [];
      setDotKiemKho(finalDotKiemKho);
      setSelectedDot(finalDotKiemKho);
      setSelectedSummaryDot(finalDotKiemKho);
      setSummaryDotTouched(true);
      setMessage(resultMessage);
      showAppToast(resultMessage, 'success');
      await loadOpenBatches(selectedKho);
    } catch (err: any) {
      const text = err?.message || 'Không lưu được báo cáo kiểm kho.';
      setError(text);
      showSaveFailure(err, text);
    } finally {
      setSaving(false);
    }
  };

  const scannedQrCount = lines.filter(line => line.maSp.trim()).length;
  const khoAbbr = khoAbbreviation(selectedKho);
  const hideMaQuet = isNvlKho(selectedKho);

  return (
    <div className="mx-auto w-full max-w-none space-y-4 py-2 md:py-3">
      <nav
        aria-label="Chức năng kiểm kho"
        className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2 lg:p-3"
      >
        <button
          type="button"
          aria-current={view === 'thuc-hien' ? 'page' : undefined}
          onClick={() => setView('thuc-hien')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'thuc-hien'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'thuc-hien' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <ClipboardCheck className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Thực hiện</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Thực hiện kiểm kho</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Tạo phiếu và quét mã sản phẩm
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'danh-sach' ? 'page' : undefined}
          onClick={() => setView('danh-sach')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'danh-sach'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'danh-sach' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Chi tiết</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Danh sách chi tiết</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Xem và xác nhận kiểm kê từng đợt
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'tong-hop' ? 'page' : undefined}
          onClick={() => setView('tong-hop')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'tong-hop'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'tong-hop' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Tổng hợp</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Bảng tổng hợp</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Tổng hợp kết quả theo từng đợt
            </span>
          </span>
        </button>
      </nav>

      {view === 'thuc-hien' ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-black text-zinc-900">Thông tin phiếu</h2>
          {canCreate ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-sm font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60 sm:h-10 sm:w-auto sm:text-xs"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu phiếu
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedKho}
                onChange={setSelectedKho}
                options={warehouses}
                getValue={item => (item as WarehouseCatalogItem).ten_kho}
                getLabel={item => (item as WarehouseCatalogItem).ten_kho}
                placeholder="Chọn kho..."
                isLoading={loadingWarehouses}
                allowEmpty={false}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho
            <div className="mt-1">
              <SearchableSelect
                value={dotKiemKho}
                onChange={setDotKiemKho}
                options={performBatchOptions}
                getValue={item => (item as OpenBatch).dot_kiem_kho}
                getLabel={item => {
                  const batch = item as OpenBatch;
                  return batch.dot_kiem_kho
                    ? formatDotLabel(
                        batch.ngay_bat_dau,
                        null,
                        batch.thu_tu_trong_ngay,
                        batch.tong_dot_trong_ngay
                      )
                    : '+ Tạo đợt mới';
                }}
                placeholder="+ Tạo đợt mới"
                isLoading={loadingBatches}
                allowEmpty={false}
                disabled={!selectedKho}
                inputClassName={inputClass}
                comboboxMode
                comboboxSearchable={false}
              />
            </div>
            <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-zinc-400">
              {!selectedKho
                ? 'Chọn kho trước để xem đợt kiểm kho.'
                : loadingBatches
                  ? 'Đang tải danh sách đợt...'
                  : openBatches.length === 0
                    ? 'Không có đợt chưa chốt. Khi lưu, hệ thống sẽ tự tạo đợt mới với ngày bắt đầu là hôm nay.'
                    : 'Đang có đợt chưa xác nhận kiểm kê — vào "Danh sách chi tiết" để xác nhận trước khi tạo đợt mới.'}
            </span>
          </label>
        </div>
      </section>

      {!selectedKho ? (
      <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
        Chọn kho ở trên để bắt đầu quét mã sản phẩm.
      </section>
      ) : (
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-sm font-black text-zinc-900">Danh sách mã SP</h2>
              <p className="w-full rounded-lg bg-zinc-100 px-2.5 py-1.5 text-lg font-black leading-tight text-black sm:w-auto sm:bg-transparent sm:px-0 sm:py-0">
                SL mã QR đã quét: {scannedQrCount}
              </p>
            </div>
            <p className="text-[11px] font-semibold text-zinc-500">
              Quét máy dùng cho tem cũ không có hậu tố; mã trùng sẽ không được thêm.
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-1.5 sm:flex sm:w-auto sm:items-center">
            {canCreate ? (
              <>
                {false && <button
                  type="button"
                  onClick={() => {
                    setScannerMode('hardware');
                    setIsQrScannerOpen(true);
                  }}
                  className="flex h-11 items-center justify-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-1 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] sm:h-9 sm:px-3"
                  title="Bật đầu đọc laser BT-A700"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét máy
                </button>}
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('hardware-v2');
                    setIsQrScannerOpen(true);
                  }}
                  className="flex h-11 items-center justify-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-1 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] sm:h-9 sm:px-3"
                  title="Quét máy: tem không có hậu tố, mã trùng không được thêm"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét máy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('camera');
                    setIsQrScannerOpen(true);
                  }}
                  className="flex h-11 items-center justify-center gap-1 rounded-lg border border-[#ef1b2d] bg-red-50 px-1 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 sm:h-9 sm:px-3"
                  title="Quét QR bằng camera ĐT"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét ĐT
                </button>
                <button
                  type="button"
                  onClick={openManualModal}
                  onMouseDown={event => event.preventDefault()}
                  className="flex h-11 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-1 text-[11px] font-extrabold text-zinc-800 transition-none hover:bg-white active:bg-white focus:bg-white focus:outline-none sm:h-9 sm:px-3"
                  title="Nhập mã SP thủ công"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-2 sm:hidden">
          {showManualModal ? (
            <article className="order-last rounded-xl border border-[#ef1b2d]/30 bg-red-50/40 p-3 shadow-sm">
              <p className="text-xs font-black uppercase text-[#ef1b2d]">Dòng nhập mới</p>
              <div className="mt-2 space-y-2">
                <SearchableSelect
                  value={manualCode}
                  onChange={handleManualCodeChange}
                  options={manualProductOptions}
                  placeholder={`Mã ${khoAbbr}`}
                  isLoading={isLoadingProducts}
                  disabled={!selectedKho || isLoadingProducts}
                  inputClassName={inputClass}
                  displaySelectedAsValue
                  desktopAutoFlip
                  onSelectOption={handleManualProductSelected}
                  getLabel={item => {
                    const product = item as CatalogProduct;
                    return `${product.code} · ${product.name}`;
                  }}
                  getOptionLabel={item => {
                    const product = item as CatalogProduct;
                    return `${product.code} · ${product.name}`;
                  }}
                  getSearchText={item => {
                    const product = item as CatalogProduct;
                    return `${product.code} ${product.name}`;
                  }}
                  getValue={item => (item as CatalogProduct).code}
                />
                <input readOnly value={manualCatalogProduct?.name || ''} className={inputClass} placeholder="Tên" />
                <div className="grid grid-cols-2 gap-2">
                  <input readOnly value={manualCatalogProduct?.unit || ''} className={inputClass} placeholder="ĐVT" />
                  <input readOnly value="1" className={inputClass} aria-label="Số lượng" />
                  <input readOnly value={manualCatalogProduct?.totalWeight || ''} className={`${inputClass} bg-emerald-50/70 text-emerald-800`} placeholder="Trọng lượng" />
                  <input readOnly value={selectedKho} className={inputClass} placeholder="Kho" />
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={closeManualModal} className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-zinc-500" title="Hủy">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </article>
          ) : null}
          {lines.map((line, index) => {
            const highlightClass = 'border-zinc-200 bg-white';
            return (
              <article key={line.key} className={`rounded-xl border p-3 shadow-sm ${highlightClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      {hideMaQuet ? `Mã ${khoAbbr} gốc #${index + 1}` : `Mã quét #${index + 1}`}
                    </p>
                    {hideMaQuet ? (
                      <div className="mt-1">
                        <SearchableSelect
                          value={line.maNvl}
                          onChange={value => updateLineCode(line.key, value)}
                          options={manualProductOptions}
                          placeholder={`Mã ${khoAbbr}`}
                          inputClassName="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-sm font-black text-zinc-950 outline-none focus:border-[#ef1b2d]"
                          displaySelectedAsValue
                          allowCustomValue
                          getLabel={item => {
                            const product = item as CatalogProduct;
                            return `${product.code} · ${product.name}`;
                          }}
                          getOptionLabel={item => {
                            const product = item as CatalogProduct;
                            return `${product.code} · ${product.name}`;
                          }}
                          getSearchText={item => {
                            const product = item as CatalogProduct;
                            return `${product.code} ${product.name}`;
                          }}
                          getValue={item => (item as CatalogProduct).code}
                        />
                      </div>
                    ) : (
                      <input
                        value={line.maSp}
                        onChange={event => updateLine(line.key, { maSp: event.target.value, rawQr: event.target.value })}
                        className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-sm font-black text-zinc-950 outline-none focus:border-[#ef1b2d]"
                        placeholder="Mã"
                      />
                    )}
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      title="Xóa dòng"
                      aria-label={`Xóa mã ${line.maSp}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  {!hideMaQuet ? (
                    <label>
                      <p className="font-bold text-zinc-400">Mã {khoAbbr} gốc</p>
                      <div className="mt-1">
                        <SearchableSelect
                          value={line.maNvl}
                          onChange={value => updateLineCode(line.key, value)}
                          options={manualProductOptions}
                          placeholder={`Mã ${khoAbbr}`}
                          inputClassName="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-sm font-bold text-zinc-800 outline-none focus:border-[#ef1b2d]"
                          displaySelectedAsValue
                          allowCustomValue
                          getLabel={item => `${(item as CatalogProduct).code} · ${(item as CatalogProduct).name}`}
                          getOptionLabel={item => `${(item as CatalogProduct).code} · ${(item as CatalogProduct).name}`}
                          getSearchText={item => `${(item as CatalogProduct).code} ${(item as CatalogProduct).name}`}
                          getValue={item => (item as CatalogProduct).code}
                        />
                      </div>
                    </label>
                  ) : null}
                  <label><p className="font-bold text-zinc-400">ĐV</p><input value={line.donVi} onChange={event => updateLine(line.key, { donVi: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d]" placeholder="ĐVT" /></label>
                  <label><p className="font-bold text-zinc-400">Số lượng</p><input type="text" inputMode="decimal" value={line.soLuong} onChange={event => updateLine(line.key, { soLuong: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d]" placeholder="SL" /></label>
                  <label>
                    <p className="font-bold text-zinc-400">Trọng lượng</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.trongLuong}
                      onChange={event => updateLine(line.key, { trongLuong: event.target.value })}
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d]"
                      placeholder="—"
                    />
                  </label>
                  <div><p className="font-bold text-zinc-400">Kho</p><p className="mt-0.5 font-semibold text-zinc-700">{selectedKho || '—'}</p></div>
                  <label className="col-span-2"><p className="font-bold text-zinc-400">Tên {khoAbbr}</p><input value={line.tenSp} onChange={event => updateLine(line.key, { tenSp: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d]" placeholder="Tên" /></label>
                </div>
              </article>
            );
          })}
          {lines.length === 0 && !showManualModal ? (
            <p className="rounded-xl bg-zinc-50 px-3 py-6 text-center text-sm font-semibold text-zinc-500">
              Chưa có mã. Bấm <span className="text-[#ef1b2d]">Thêm</span> để nhập, hoặc <span className="text-[#ef1b2d]">Quét máy</span>.
            </p>
          ) : null}
        </div>

        <div className="hidden sm:block">
        <TableShell minWidthClassName="min-w-[1080px]" maxHeightClassName="max-h-[420px]">
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã {khoAbbr} gốc</TableHeadCell>
            {!hideMaQuet ? <TableHeadCell>Mã quét</TableHeadCell> : null}
            <TableHeadCell>Tên {khoAbbr}</TableHeadCell>
            <TableHeadCell>ĐV</TableHeadCell>
            <TableHeadCell align="center">Số lượng</TableHeadCell>
            <TableHeadCell align="center">Trọng lượng</TableHeadCell>
            <TableHeadCell>Kho</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => {
              const highlightClass = '';
              return (
                <React.Fragment key={line.key}>
                  <TableRow className="transition-none hover:!bg-transparent">
                    <td className={`px-4 py-3 font-bold text-zinc-500 ${highlightClass}`}>
                      {index + 1}
                    </td>
                    <td className={`min-w-56 px-1 py-2 ${highlightClass}`}>
                      <SearchableSelect
                        value={line.maNvl}
                        onChange={value => updateLineCode(line.key, value)}
                        options={manualProductOptions}
                        placeholder={`Mã ${khoAbbr}`}
                        inputClassName="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-sm font-bold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        displaySelectedAsValue
                        desktopAutoFlip
                        allowCustomValue
                        getLabel={item => {
                          const product = item as CatalogProduct;
                          return `${product.code} · ${product.name}`;
                        }}
                        getOptionLabel={item => {
                          const product = item as CatalogProduct;
                          return `${product.code} · ${product.name}`;
                        }}
                        getSearchText={item => {
                          const product = item as CatalogProduct;
                          return `${product.code} ${product.name}`;
                        }}
                        getValue={item => (item as CatalogProduct).code}
                      />
                    </td>
                    {!hideMaQuet ? (
                      <td className={`min-w-56 px-1 py-2 ${highlightClass}`}>
                        <input
                          value={line.maSp}
                          onChange={event => updateLine(line.key, { maSp: event.target.value, rawQr: event.target.value })}
                          className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-sm font-bold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                          placeholder="Mã quét"
                        />
                      </td>
                    ) : null}
                    <td className={`min-w-64 px-1 py-2 ${highlightClass}`}>
                      <input
                        value={line.tenSp}
                        onChange={event => updateLine(line.key, { tenSp: event.target.value })}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        placeholder="Tên"
                      />
                    </td>
                    <td className={`w-24 px-1 py-2 ${highlightClass}`}>
                      <input
                        value={line.donVi}
                        onChange={event => updateLine(line.key, { donVi: event.target.value })}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        placeholder="ĐVT"
                      />
                    </td>
                    <td className={`w-24 px-1 py-2 ${highlightClass}`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.soLuong}
                        onChange={event => updateLine(line.key, { soLuong: event.target.value })}
                        className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        placeholder="SL"
                      />
                    </td>
                    <td className={`px-2 py-2 text-center ${highlightClass}`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.trongLuong}
                        onChange={event => updateLine(line.key, { trongLuong: event.target.value })}
                        className="h-9 w-28 rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm font-semibold text-zinc-700 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        placeholder="—"
                        aria-label={`Trọng lượng ${line.maNvl || line.maSp}`}
                      />
                    </td>
                    <td className={`px-4 py-3 font-semibold text-zinc-600 ${highlightClass}`}>{selectedKho || '—'}</td>
                    <td className={`px-4 py-3 text-center ${highlightClass}`}>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title={`Xóa ${line.maSp}`}
                          aria-label={`Xóa ${line.maSp}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </td>
                  </TableRow>
                </React.Fragment>
              );
            })}

            {showManualModal ? (
              <TableRow className="bg-zinc-50/60 transition-none hover:!bg-zinc-50/60">
                <td className="px-4 py-3 font-bold text-zinc-500">{lines.length + 1}</td>
                <td className="min-w-56 px-1 py-2">
                  <SearchableSelect
                    value={manualCode}
                    onChange={handleManualCodeChange}
                    options={manualProductOptions}
                    placeholder={`Mã ${khoAbbr}`}
                    isLoading={isLoadingProducts}
                    disabled={!selectedKho || isLoadingProducts}
                    inputClassName="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                    displaySelectedAsValue
                    desktopAutoFlip
                    onSelectOption={handleManualProductSelected}
                    getLabel={item => {
                      const product = item as CatalogProduct;
                      return `${product.code} · ${product.name}`;
                    }}
                    getOptionLabel={item => {
                      const product = item as CatalogProduct;
                      return `${product.code} · ${product.name}`;
                    }}
                    getSearchText={item => {
                      const product = item as CatalogProduct;
                      return `${product.code} ${product.name}`;
                    }}
                    getValue={item => (item as CatalogProduct).code}
                  />
                </td>
                {!hideMaQuet ? (
                  <td className="px-1 py-2">
                    <input readOnly value={manualCode} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm text-zinc-600" placeholder="Mã quét" />
                  </td>
                ) : null}
                <td className="min-w-64 px-1 py-2">
                  <input readOnly value={manualCatalogProduct?.name || ''} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800" placeholder="Tên" />
                </td>
                <td className="w-24 px-1 py-2">
                  <input readOnly value={manualCatalogProduct?.unit || ''} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700" placeholder="ĐVT" />
                </td>
                <td className="w-24 px-1 py-2">
                  <input readOnly value="1" className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-center text-sm font-semibold text-zinc-700" aria-label="Số lượng" />
                </td>
                <td className="w-32 px-1 py-2">
                  <input readOnly value={manualCatalogProduct?.totalWeight || ''} className="h-10 w-full rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 text-center text-sm font-bold text-emerald-800" placeholder="—" />
                </td>
                <td className="min-w-36 px-1 py-2">
                  <input readOnly value={selectedKho} className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700" placeholder="Kho" />
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={closeManualModal}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      title="Xóa dòng nhập"
                      aria-label="Xóa dòng nhập"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </TableRow>
            ) : null}

            {lines.length === 0 && !showManualModal && (
              <TableEmptyRow colSpan={hideMaQuet ? 8 : 9}>
                Chưa có mã. Bấm <span className="text-[#ef1b2d]">Thêm</span> để nhập, hoặc{' '}
                <span className="text-[#ef1b2d]">Quét máy</span>.
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
        </div>
      </section>
      )}

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
      </>
      ) : view === 'danh-sach' ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Chọn kho và đợt kiểm kho</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedKho}
                onChange={setSelectedKho}
                options={warehouses}
                getValue={item => (item as WarehouseCatalogItem).ten_kho}
                getLabel={item => (item as WarehouseCatalogItem).ten_kho}
                placeholder="Chọn kho..."
                isLoading={loadingWarehouses}
                allowEmpty={false}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedDot}
                onChange={setSelectedDot}
                options={allBatches}
                getValue={item => (item as DotGroup).dot_kiem_kho}
                getLabel={item => {
                  const b = item as DotGroup;
                  const status = b.da_xac_nhan ? 'Đã xác nhận' : 'Chưa xác nhận';
                  return `${formatDotLabel(
                    b.ngay_bat_dau,
                    b.thoi_gian_xac_nhan,
                    b.thu_tu_trong_ngay,
                    b.tong_dot_trong_ngay
                  )} · ${b.so_dong} mã · ${status}`;
                }}
                placeholder={selectedKho ? 'Tìm đợt kiểm kho...' : 'Chọn kho trước'}
                isLoading={loadingAllBatches}
                allowEmpty={false}
                disabled={!selectedKho}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>
          {canCreate && selectedDotGroup && !selectedDotGroup.da_xac_nhan ? (
            <button
              type="button"
              onClick={() => void handleConfirmDot()}
              disabled={confirmingDot}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
            >
              {confirmingDot ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Chốt kiểm kê
            </button>
          ) : null}
        </div>

        {selectedDotGroup ? (
          <p className="mt-3 text-[11px] font-semibold text-zinc-500">
            Bắt đầu: {formatDateTime(selectedDotGroup.ngay_bat_dau)} ·{' '}
            {selectedDotGroup.da_xac_nhan ? (
              <span className="text-emerald-600">
                Đã xác nhận kiểm kê lúc {formatDateTime(selectedDotGroup.thoi_gian_xac_nhan)}
              </span>
            ) : (
              <span className="text-amber-600">Chưa xác nhận kiểm kê</span>
            )}
          </p>
        ) : null}
      </section>

      {!selectedKho ? (
      <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
        Chọn kho ở trên để xem đợt kiểm kho.
      </section>
      ) : !selectedDot ? (
      <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
        Chọn đợt kiểm kho ở trên để xem danh sách sản phẩm đã quét.
      </section>
      ) : (
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-black text-zinc-900">Danh sách sản phẩm đã quét</h2>
            <p className="text-[11px] font-semibold text-zinc-500">{dotDetailTotal} mã SP</p>
          </div>
        </div>

        <TableShell
          minWidthClassName="min-w-[900px]"
          maxHeightClassName="max-h-[480px]"
          footer={dotDetailTotal > 0 ? (
            <TablePagination
              totalRecords={dotDetailTotal}
              currentPage={dotDetailPage}
              totalPages={Math.max(1, Math.ceil(dotDetailTotal / dotDetailPageSize))}
              pageSize={dotDetailPageSize}
              onPageChange={setDotDetailPage}
              onPageSizeChange={size => { setDotDetailPageSize(size); setDotDetailPage(1); }}
            />
          ) : null}
        >
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã {khoAbbr} gốc</TableHeadCell>
            {!hideMaQuet ? <TableHeadCell>Mã quét</TableHeadCell> : null}
            <TableHeadCell>Tên {khoAbbr}</TableHeadCell>
            <TableHeadCell>ĐV</TableHeadCell>
            <TableHeadCell>Kho</TableHeadCell>
            <TableHeadCell>Người kiểm</TableHeadCell>
            <TableHeadCell>Thời điểm lưu</TableHeadCell>
            {canDelete && selectedDotGroup && !selectedDotGroup.da_xac_nhan ? (
              <TableHeadCell align="center">Thao tác</TableHeadCell>
            ) : null}
          </TableHead>
          <TableBody>
            {dotDetailLines.map((line, index) => {
              const matched = findCatalogProduct(String(line.ma_nvl ?? ''), products, selectedKho);
              return (
                <React.Fragment key={String(line.id)}>
                  <TableRow>
                    <td className="px-4 py-3 font-bold text-zinc-500">{(dotDetailPage - 1) * dotDetailPageSize + index + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-800">{line.ma_nvl || '—'}</td>
                    {!hideMaQuet ? (
                      <td className="px-4 py-3 font-mono font-bold text-zinc-900">{line.ma_sp || '—'}</td>
                    ) : null}
                    <td className="px-4 py-3 font-semibold text-zinc-700">{line.ten_sp || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">{matched?.unit || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">{selectedDotGroup?.ten_kho || selectedKho || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-700">{line.nguoi_kiem_kho || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                      {formatDateTime(line.ngay_gio_kiem_kho)}
                    </td>
                    {canDelete && selectedDotGroup && !selectedDotGroup.da_xac_nhan ? (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => void handleDeleteDetailLine(line)}
                          disabled={deletingDetailId !== null}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Xóa ${line.ma_sp || line.ma_nvl || ''}`}
                          aria-label={`Xóa ${line.ma_sp || line.ma_nvl || ''}`}
                        >
                          {deletingDetailId === String(line.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    ) : null}
                  </TableRow>
                </React.Fragment>
              );
            })}

            {dotDetailLines.length === 0 && (
              <TableEmptyRow colSpan={(hideMaQuet ? 7 : 8) + (canDelete && selectedDotGroup && !selectedDotGroup.da_xac_nhan ? 1 : 0)}>
                {loadingDotDetail
                  ? 'Đang tải dữ liệu...'
                  : 'Đợt này chưa có sản phẩm nào được quét.'}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
      </section>
      )}
      </>
      ) : (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Chọn kho và đợt kiểm kho</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedKho}
                onChange={setSelectedKho}
                options={warehouses}
                getValue={item => (item as WarehouseCatalogItem).ten_kho}
                getLabel={item => (item as WarehouseCatalogItem).ten_kho}
                placeholder="Chọn kho..."
                isLoading={loadingWarehouses}
                allowEmpty={false}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedSummaryDot}
                onChange={value => {
                  setSelectedSummaryDot(value);
                  setSummaryDotTouched(true);
                }}
                options={allBatches}
                getValue={item => (item as DotGroup).dot_kiem_kho}
                getLabel={item => {
                  const b = item as DotGroup;
                  return `${formatDotLabel(
                    b.ngay_bat_dau,
                    b.thoi_gian_xac_nhan,
                    b.thu_tu_trong_ngay,
                    b.tong_dot_trong_ngay
                  )} · ${b.so_dong} mã · ${b.da_xac_nhan ? 'Đã xác nhận' : 'Chưa xác nhận'}`;
                }}
                placeholder={selectedKho ? 'Tìm đợt kiểm kho...' : 'Chọn kho trước'}
                isLoading={loadingAllBatches}
                allowEmpty={false}
                disabled={!selectedKho}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>
        </div>

        {selectedSummaryDotGroup ? (
          <p className="mt-3 text-[11px] font-semibold text-zinc-500">
            Bắt đầu: {formatDateTime(selectedSummaryDotGroup.ngay_bat_dau)} ·{' '}
            {selectedSummaryDotGroup.da_xac_nhan ? (
              <span className="text-emerald-600">
                Đã xác nhận kiểm kê lúc {formatDateTime(selectedSummaryDotGroup.thoi_gian_xac_nhan)}
              </span>
            ) : (
              <span className="text-amber-600">Chưa xác nhận kiểm kê — số liệu tính theo thời điểm hiện tại</span>
            )}
          </p>
        ) : null}
      </section>

      {!selectedKho ? (
      <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
        Chọn kho ở trên để xem đợt kiểm kho.
      </section>
      ) : !selectedSummaryDot ? (
      <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
        Chọn đợt kiểm kho ở trên để xem danh sách sản phẩm đã kiểm.
      </section>
      ) : (
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-black text-zinc-900">Danh sách sản phẩm</h2>
            <p className="text-[11px] font-semibold text-zinc-500">
              {summaryRows.length} mã SP · gộp theo mã SP gốc của đợt đang chọn
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintSummary}
              disabled={!selectedSummaryDot || loadingSummary || pendingPrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-white px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
              title="In phiếu tổng hợp kiểm kho"
            >
              {pendingPrint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              In phiếu
            </button>
            <button
              type="button"
              onClick={() => void loadSummary(selectedSummaryDot, !!selectedSummaryDotGroup?.da_xac_nhan)}
              disabled={loadingSummary}
              className="text-[11px] font-bold text-[#ef1b2d] hover:underline disabled:opacity-50"
            >
              {loadingSummary ? 'Đang tải…' : 'Tải lại'}
            </button>
          </div>
        </div>

        {summaryError ? (
          <div className="border-b border-zinc-100 bg-rose-50 px-4 py-2.5 text-[11px] font-semibold text-rose-700">
            {summaryError}
          </div>
        ) : null}

        <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[560px]">
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã SP gốc</TableHeadCell>
            <TableHeadCell>Tên SP</TableHeadCell>
            <TableHeadCell>Loại SP</TableHeadCell>
            <TableHeadCell align="center">Tổng số lượng</TableHeadCell>
            <TableHeadCell>Chốt lúc</TableHeadCell>
            <TableHeadCell>Người chốt</TableHeadCell>
          </TableHead>
          <TableBody>
            {summaryRows.map((row, index) => (
              <React.Fragment key={row.da_chot ? String(row.id) : `live-${row.ma_nvl}`}>
                <TableRow>
                  <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-800">{row.ma_nvl || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.loai_sp || '—'}</td>
                  <td className="px-4 py-3 text-center font-black text-zinc-900">{row.tong_so_luong ?? 0}</td>
                  {row.da_chot ? (
                    <>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                        {formatDateTime(row.chot_luc)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-700">{row.nguoi_chot || '—'}</td>
                    </>
                  ) : (
                    <td className="px-4 py-3" colSpan={2}>
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        Chưa chốt
                      </span>
                    </td>
                  )}
                </TableRow>
              </React.Fragment>
            ))}

            {summaryRows.length === 0 && (
              <TableEmptyRow colSpan={7}>
                {loadingSummary ? 'Đang tải dữ liệu...' : 'Đợt này chưa có sản phẩm nào được quét.'}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
      </section>
      )}
      </>
      )}

      {printReport && typeof document !== 'undefined'
        ? createPortal(<KiemKhoPrintSheet report={printReport} />, document.body)
        : null}

      <ProductQrScanner
        open={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScan}
        hardwareOnly={scannerMode !== 'camera'}
        hardwareV2={scannerMode === 'hardware-v2'}
        requireConfirm={false}
        scannedCount={scannedQrCount}
      />

      {false && showManualModal
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Đóng"
                onClick={closeManualModal}
              />
              <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">Kiểm kho</p>
                    <h3 className="mt-0.5 text-base font-black text-zinc-900">Form nhập kiểm kho</h3>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                      Điền thông tin phiếu rồi nhập / quét mã SP
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeManualModal}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50"
                    title="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto px-4 py-4">
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-[11px] font-semibold text-zinc-600">
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Đợt </span>
                      {dotKiemKho.trim()
                        ? (() => {
                            const batch = openBatches.find(b => b.dot_kiem_kho === dotKiemKho);
                            return formatDotLabel(
                              batch?.ngay_bat_dau ?? null,
                              null,
                              batch?.thu_tu_trong_ngay,
                              batch?.tong_dot_trong_ngay
                            );
                          })()
                        : 'Đợt mới (bắt đầu hôm nay)'}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-zinc-400">
                      Sửa thông tin phiếu ở form phía trên trang
                    </p>
                  </div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Mã SP / mã quét
                    <input
                      ref={manualInputRef}
                      value={manualCode}
                      onChange={e => handleManualCodeChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleManualAdd(e.currentTarget.value);
                        }
                      }}
                      className={`mt-1 ${inputClass}`}
                      placeholder="VD: MT-MN009_3107263087"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                    />
                  </label>
                  {error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      {error}
                    </div>
                  ) : null}
                  {message ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      {message}
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-2 border-t border-zinc-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={closeManualModal}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={() => handleManualAdd()}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] text-xs font-bold text-white transition hover:bg-[#b30d1c]"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm dòng
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default KiemKhoPanel;
