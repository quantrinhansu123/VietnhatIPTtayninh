import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Plus, Save, ScanBarcode, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import ProductQrScanner from '../../components/ProductQrScanner';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import {
  MultiSelectFilter,
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
    TableEmptyRow,
    RowActionsMenu
} from '../../components/shared/table';

type CatalogProduct = {
  code: string;
  name: string;
  productType: string;
};

type KiemKhoLine = {
  key: string;
  maNvl: string;
  maSp: string;
  tenSp: string;
  loaiSp: string;
  rawQr: string;
};

type OpenBatch = {
  dot_kiem_kho: string;
  ngay_bat_dau: string | null;
};

type DotGroup = {
  dot_kiem_kho: string;
  ngay_bat_dau: string | null;
  thoi_gian_xac_nhan: string | null;
  da_xac_nhan: boolean;
  so_dong: number;
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
  id: number | string;
  dot_kiem_kho?: string | null;
  ma_nvl?: string | null;
  ten_sp?: string | null;
  loai_sp?: string | null;
  tong_so_luong?: number | null;
  chot_luc?: string | null;
  nguoi_chot?: string | null;
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

/** Nhãn hiển thị đợt: "T{tháng}/{năm 2 số} (dd/mm-dd/mm)"; chưa xác nhận thì phần cuối là "...". */
function formatDotLabel(startIso: string | null, confirmIso?: string | null) {
  const start = startIso ? new Date(startIso) : null;
  if (!start || Number.isNaN(start.getTime())) return startIso || '—';
  const startDay = `${start.getDate()}/${start.getMonth() + 1}`;
  const yy = String(start.getFullYear()).slice(-2);
  const confirm = confirmIso ? new Date(confirmIso) : null;
  const endDay = confirm && !Number.isNaN(confirm.getTime()) ? `${confirm.getDate()}/${confirm.getMonth() + 1}` : '...';
  return `T${start.getMonth() + 1}/${yy} (${startDay}-${endDay})`;
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
      : [];

  return rows
    .map((item): CatalogProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.ma_san_pham ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.ten_san_pham ?? record.name ?? '').trim();
      const productType = String(
        record.nhom_vthh ?? record.loai_sp ?? record.loai ?? record.nhom ?? ''
      ).trim();
      if (!code) return null;
      return { code, name, productType };
    })
    .filter((item): item is CatalogProduct => Boolean(item));
}

function findCatalogProduct(code: string, products: CatalogProduct[]) {
  const key = normalizeKey(code);
  if (!key) return null;
  return products.find(item => normalizeKey(item.code) === key) ?? null;
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
  const [dotKiemKho, setDotKiemKho] = useState('');
  const [openBatches, setOpenBatches] = useState<OpenBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [nguoiKiemKho, setNguoiKiemKho] = useState(loginName);

  // Tab "Danh sách chi tiết"
  const [allBatches, setAllBatches] = useState<DotGroup[]>([]);
  const [loadingAllBatches, setLoadingAllBatches] = useState(false);
  const [allBatchesLoaded, setAllBatchesLoaded] = useState(false);
  const [selectedDot, setSelectedDot] = useState('');
  const [dotDetailLines, setDotDetailLines] = useState<KiemKhoDetailRow[]>([]);
  const [loadingDotDetail, setLoadingDotDetail] = useState(false);
  const [confirmingDot, setConfirmingDot] = useState(false);
  const [detailSearchText, setDetailSearchText] = useState('');
  const [detailTypeFilter, setDetailTypeFilter] = useState<string[]>([]);

  // Tab "Bảng tổng hợp"
  const [summaryRows, setSummaryRows] = useState<KiemKhoTongHopRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [selectedSummaryDot, setSelectedSummaryDot] = useState('');
  const [summaryDotTouched, setSummaryDotTouched] = useState(false);

  useEffect(() => {
    if (loginName) setNguoiKiemKho(loginName);
  }, [loginName]);
  const [lines, setLines] = useState<KiemKhoLine[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [highlightKey, setHighlightKey] = useState('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'hardware' | 'camera'>('hardware');
  const [manualCode, setManualCode] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const manualAutoAddTimerRef = useRef<number | null>(null);

  // Bảng "Danh sách mã SP" (đang nhập trong phiên hiện tại)
  const [lineSearchText, setLineSearchText] = useState('');
  const [lineTypeFilter, setLineTypeFilter] = useState<string[]>([]);

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
      const res = await fetch('/api/san-pham?format=table');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh mục SP.'));
      setProducts(normalizeCatalogProducts(data));
    } catch (err: any) {
      setProducts([]);
      showAppToast(err?.message || 'Không tải được danh mục SP.', 'error');
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadOpenBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch('/api/kiem-kho/dot-mo');
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
    void loadOpenBatches();
  }, [loadProducts, loadOpenBatches]);

  const loadAllBatches = useCallback(async () => {
    setLoadingAllBatches(true);
    try {
      const res = await fetch('/api/kiem-kho/dot');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt kiểm kho.'));
      const records: DotGroup[] = Array.isArray(data?.records) ? data.records : [];
      setAllBatches(records);
      setAllBatchesLoaded(true);
      // Mới vào trang → mặc định chọn đợt gần nhất.
      setSelectedDot(prev => (prev && records.some(b => b.dot_kiem_kho === prev) ? prev : records[0]?.dot_kiem_kho ?? ''));
    } catch (err: any) {
      setAllBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt kiểm kho.', 'error');
    } finally {
      setLoadingAllBatches(false);
    }
  }, []);

  const loadDotDetail = useCallback(async (dot: string) => {
    if (!dot) {
      setDotDetailLines([]);
      return;
    }
    setLoadingDotDetail(true);
    try {
      const res = await fetch(`/api/kiem-kho?dotKiemKho=${encodeURIComponent(dot)}&limit=2000`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách sản phẩm của đợt.'));
      setDotDetailLines(Array.isArray(data?.records) ? data.records : []);
    } catch (err: any) {
      setDotDetailLines([]);
      showAppToast(err?.message || 'Không tải được danh sách sản phẩm của đợt.', 'error');
    } finally {
      setLoadingDotDetail(false);
    }
  }, []);

  useEffect(() => {
    if ((view === 'danh-sach' || view === 'tong-hop') && !allBatchesLoaded) {
      void loadAllBatches();
    }
  }, [view, allBatchesLoaded, loadAllBatches]);

  useEffect(() => {
    if (view === 'danh-sach') void loadDotDetail(selectedDot);
  }, [view, selectedDot, loadDotDetail]);

  const selectedDotGroup = useMemo(
    () => allBatches.find(b => b.dot_kiem_kho === selectedDot) ?? null,
    [allBatches, selectedDot]
  );

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
      await Promise.all([loadAllBatches(), loadDotDetail(selectedDot), loadOpenBatches()]);
    } catch (err: any) {
      showAppToast(err?.message || 'Không xác nhận được kiểm kê.', 'error');
    } finally {
      setConfirmingDot(false);
    }
  };

  const detailTypeOptions = useMemo(() => {
    const values = dotDetailLines.map(line => line.loai_sp).filter((v): v is string => Boolean(v));
    return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  }, [dotDetailLines]);

  const normalizedDetailSearch = normalizeKey(detailSearchText);
  const filteredDetailLines = useMemo(() => {
    return dotDetailLines.filter(line => {
      const matchesType = detailTypeFilter.length === 0 || (line.loai_sp ? detailTypeFilter.includes(line.loai_sp) : false);
      const matchesSearch =
        !normalizedDetailSearch ||
        normalizeKey(`${line.ma_nvl ?? ''} ${line.ma_sp ?? ''} ${line.ten_sp ?? ''} ${line.loai_sp ?? ''}`).includes(
          normalizedDetailSearch
        );
      return matchesType && matchesSearch;
    });
  }, [dotDetailLines, detailTypeFilter, normalizedDetailSearch]);

  const hasActiveDetailFilters = Boolean(detailSearchText) || detailTypeFilter.length > 0;
  const resetDetailFilters = () => {
    setDetailSearchText('');
    setDetailTypeFilter([]);
  };

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError('');
    try {
      const res = await fetch('/api/kiem-kho-tong-hop?limit=5000');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được bảng tổng hợp.'));
      setSummaryRows(Array.isArray(data?.records) ? data.records : []);
      setSummaryLoaded(true);
    } catch (err: any) {
      setSummaryRows([]);
      setSummaryLoaded(true);
      const text = err?.message || 'Không tải được bảng tổng hợp.';
      setSummaryError(text);
      showAppToast(text, 'error');
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'tong-hop' && !summaryLoaded) {
      void loadSummary();
    }
  }, [view, summaryLoaded, loadSummary]);

  // Chỉ đợt đã xác nhận mới có trong bảng tổng hợp — dùng làm lựa chọn "Đợt".
  const confirmedBatches = useMemo(() => allBatches.filter(b => b.da_xac_nhan), [allBatches]);
  // Liệt kê mọi đợt đã xác nhận — mới nhất trước — kể cả đợt tổng hợp đang rỗng, để còn chọn được mà kiểm tra.
  const summaryDotOptions = useMemo(
    () =>
      [...confirmedBatches]
        .sort((a, b) => (b.thoi_gian_xac_nhan || '').localeCompare(a.thoi_gian_xac_nhan || ''))
        .map(b => b.dot_kiem_kho),
    [confirmedBatches]
  );

  // Mới vào tab → mặc định chỉ hiện đợt chốt gần nhất (theo thoi_gian_xac_nhan mới nhất).
  useEffect(() => {
    if (view !== 'tong-hop' || summaryDotTouched || summaryDotOptions.length === 0) return;
    setSelectedSummaryDot(summaryDotOptions[0]);
  }, [view, summaryDotOptions, summaryDotTouched]);

  const selectedSummaryDotGroup = useMemo(
    () => confirmedBatches.find(b => b.dot_kiem_kho === selectedSummaryDot) ?? null,
    [confirmedBatches, selectedSummaryDot]
  );

  const filteredSummaryRows = useMemo(() => {
    return summaryRows.filter(row => !selectedSummaryDot || row.dot_kiem_kho === selectedSummaryDot);
  }, [summaryRows, selectedSummaryDot]);

  const addLineFromCode = useCallback(
    (raw: string): boolean | 'duplicate' => {
      setMessage('');
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
      const matched = findCatalogProduct(maNvl, products);

      const nextLine: KiemKhoLine = {
        key: newLineKey(),
        maNvl,
        maSp: fullCode,
        tenSp: matched?.name || '',
        loaiSp: matched?.productType || '',
        rawQr: fullCode
      };
      const nextLines = [...linesRef.current, nextLine];
      linesRef.current = nextLines;
      setLines(nextLines);
      setHighlightKey(nextLine.key);
      setError('');
      setMessage(
        matched
          ? `Đã thêm: ${fullCode}`
          : `Đã thêm: ${fullCode} (chưa khớp danh mục — kiểm tra tên/loại)`
      );
      return true;
    },
    [isLoadingProducts, products]
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
    setManualCode('');
    setShowManualModal(true);
    setError('');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => manualInputRef.current?.focus());
    });
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
      const result = addLineFromCode(value);
      if (result === true) {
        setManualCode('');
        window.requestAnimationFrame(() => manualInputRef.current?.focus());
      }
    },
    [addLineFromCode, manualCode]
  );

  /** Trong modal: máy quét bắn chuỗi nhanh → debounce tự thêm; gõ tay dùng Enter / nút Thêm. */
  const handleManualCodeChange = (value: string) => {
    setManualCode(value);
    clearManualAutoAddTimer();
    if (value.trim().length < 3) return;
    manualAutoAddTimerRef.current = window.setTimeout(() => {
      manualAutoAddTimerRef.current = null;
      handleManualAdd(value);
    }, 150);
  };

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(line => line.key !== key));
  };

  const handleSave = async () => {
    setError('');
    setMessage('');
    if (!nguoiKiemKho.trim()) {
      setError('Nhập người kiểm kho.');
      return;
    }
    if (!lines.length) {
      setError('Quét ít nhất một mã SP bằng máy quét hoặc camera.');
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
          dot_kiem_kho: finalDotKiemKho,
          nguoi_kiem_kho: nguoiKiemKho.trim(),
          ngay_gio_kiem_kho: toIsoFromLocalDateTime(thoiDiemLuu),
          lines: lines.map(line => ({
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
      const savedCount = lines.length;
      setLines([]);
      linesRef.current = [];
      setDotKiemKho(finalDotKiemKho);
      setMessage(`Đã lưu ${savedCount} dòng kiểm kho.`);
      showAppToast('Đã lưu báo cáo kiểm kho.', 'success');
      await loadOpenBatches();
    } catch (err: any) {
      const text = err?.message || 'Không lưu được báo cáo kiểm kho.';
      setError(text);
      showSaveFailure(err, text);
    } finally {
      setSaving(false);
    }
  };

  const lineCountLabel = useMemo(() => `${lines.length} mã SP`, [lines.length]);

  const lineTypeOptions = useMemo(() => {
    const values = lines.map(line => line.loaiSp).filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  }, [lines]);

  const normalizedLineSearch = normalizeKey(lineSearchText);
  const filteredLines = useMemo(() => {
    return lines.filter(line => {
      const matchesType = lineTypeFilter.length === 0 || lineTypeFilter.includes(line.loaiSp);
      const matchesSearch =
        !normalizedLineSearch ||
        normalizeKey(`${line.maNvl} ${line.maSp} ${line.tenSp} ${line.loaiSp}`).includes(normalizedLineSearch);
      return matchesType && matchesSearch;
    });
  }, [lines, lineTypeFilter, normalizedLineSearch]);

  const hasActiveLineFilters = Boolean(lineSearchText) || lineTypeFilter.length > 0;
  const resetLineFilters = () => {
    setLineSearchText('');
    setLineTypeFilter([]);
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackButton onClick={onBack} />
        </div>
      </div>

      <nav
        aria-label="Chức năng kiểm kho"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:grid-cols-3"
      >
        <button
          type="button"
          aria-current={view === 'thuc-hien' ? 'page' : undefined}
          onClick={() => setView('thuc-hien')}
          className={`min-h-[76px] rounded-xl border-2 px-4 py-3 text-left transition ${
            view === 'thuc-hien' ? 'border-[#ef1b2d] bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
          }`}
        >
          <span className="block text-sm font-black text-zinc-900">Thực hiện kiểm kho</span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Tạo phiếu và quét mã sản phẩm
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'danh-sach' ? 'page' : undefined}
          onClick={() => setView('danh-sach')}
          className={`min-h-[76px] rounded-xl border-2 px-4 py-3 text-left transition ${
            view === 'danh-sach' ? 'border-[#ef1b2d] bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
          }`}
        >
          <span className="text-sm font-black text-zinc-900">Danh sách chi tiết</span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Xem và xác nhận kiểm kê từng đợt
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'tong-hop' ? 'page' : undefined}
          onClick={() => setView('tong-hop')}
          className={`min-h-[76px] rounded-xl border-2 px-4 py-3 text-left transition ${
            view === 'tong-hop' ? 'border-[#ef1b2d] bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
          }`}
        >
          <span className="text-sm font-black text-zinc-900">Bảng tổng hợp</span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Tổng hợp kết quả theo từng đợt
          </span>
        </button>
      </nav>

      {view === 'thuc-hien' ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-zinc-900">Thông tin phiếu</h2>
          {canCreate ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu phiếu
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho
            <select
              value={dotKiemKho}
              onChange={e => setDotKiemKho(e.target.value)}
              disabled={loadingBatches}
              className={`mt-1 ${inputClass}`}
            >
              {openBatches.length === 0 ? (
                <option value="">+ Tạo đợt mới (bắt đầu hôm nay)</option>
              ) : null}
              {openBatches.map(batch => (
                <option key={batch.dot_kiem_kho} value={batch.dot_kiem_kho}>
                  {formatDotLabel(batch.ngay_bat_dau)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-medium normal-case tracking-normal text-zinc-400">
              {loadingBatches
                ? 'Đang tải danh sách đợt...'
                : openBatches.length === 0
                  ? 'Không có đợt chưa chốt. Khi lưu, hệ thống sẽ tự tạo đợt mới với ngày bắt đầu là hôm nay.'
                  : 'Đang có đợt chưa xác nhận kiểm kê — vào "Danh sách chi tiết" để xác nhận trước khi tạo đợt mới.'}
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-black text-zinc-900">Danh sách mã SP</h2>
            <p className="text-[11px] font-semibold text-zinc-500">
              {lineCountLabel} · 1 mã = tiền tố+hậu tố; trùng cả mã thì bỏ qua, mã khác thì tự thêm
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {canCreate ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('hardware');
                    setIsQrScannerOpen(true);
                  }}
                  className="flex h-9 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
                  title="Bật đầu đọc laser BT-A700"
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
                  className="flex h-9 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-red-50 px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100"
                  title="Quét QR bằng camera ĐT"
                >
                  <ScanBarcode className="h-3.5 w-3.5" />
                  Quét ĐT
                </button>
                <button
                  type="button"
                  onClick={openManualModal}
                  className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-extrabold text-zinc-800 transition hover:bg-zinc-50"
                  title="Nhập mã SP thủ công"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm
                </button>
              </>
            ) : null}
          </div>
        </div>

        {lines.length > 0 ? (
          <div className="border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <TableToolbar
              hasActiveFilters={hasActiveLineFilters}
              onResetFilters={resetLineFilters}
            >
              <TableSearchInput
                value={lineSearchText}
                onChange={setLineSearchText}
                placeholder="Tìm mã NVL, mã quét, tên SP..."
              />
              {lineTypeOptions.length > 0 && (
                <MultiSelectFilter
                  label="Loại SP"
                  allLabel="Tất cả loại SP"
                  searchPlaceholder="Tìm loại SP..."
                  emptyLabel="Không tìm thấy loại SP"
                  options={lineTypeOptions}
                  values={lineTypeFilter}
                  onChange={setLineTypeFilter}
                />
              )}
            </TableToolbar>
          </div>
        ) : null}

        <TableShell minWidthClassName="min-w-[720px]" maxHeightClassName="max-h-[420px]">
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã NVL</TableHeadCell>
            <TableHeadCell>Mã quét</TableHeadCell>
            <TableHeadCell>Tên SP</TableHeadCell>
            <TableHeadCell>Loại SP</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            {filteredLines.map((line, index) => {
              const highlightClass = line.key === highlightKey ? 'bg-emerald-50/70' : '';
              return (
                <React.Fragment key={line.key}>
                  <TableRow>
                    <td className={`px-4 py-3 font-bold text-zinc-500 ${highlightClass}`}>
                      {index + 1}
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold text-zinc-800 ${highlightClass}`}>{line.maNvl || '—'}</td>
                    <td className={`px-4 py-3 font-mono font-bold text-zinc-900 ${highlightClass}`}>{line.maSp}</td>
                    <td className={`px-4 py-3 font-semibold text-zinc-700 ${highlightClass}`}>{line.tenSp || '—'}</td>
                    <td className={`px-4 py-3 font-semibold text-zinc-600 ${highlightClass}`}>{line.loaiSp || '—'}</td>
                    <td className={`px-4 py-3 text-center ${highlightClass}`}>
                      <RowActionsMenu label={`Thao tác ${line.maSp}`}>
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa dòng"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      </RowActionsMenu>
                    </td>
                  </TableRow>
                </React.Fragment>
              );
            })}

            {filteredLines.length === 0 && (
              <TableEmptyRow colSpan={6}>
                {lines.length === 0 ? (
                  <>
                    Chưa có mã. Bấm <span className="text-[#ef1b2d]">Thêm</span> để nhập, hoặc{' '}
                    <span className="text-[#ef1b2d]">Quét máy</span>.
                  </>
                ) : (
                  'Không có mã nào phù hợp bộ lọc.'
                )}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
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
      </>
      ) : view === 'danh-sach' ? (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Chọn đợt kiểm kho</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
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
                  return `${formatDotLabel(b.ngay_bat_dau, b.thoi_gian_xac_nhan)} · ${b.so_dong} mã · ${status}`;
                }}
                placeholder="Tìm đợt kiểm kho..."
                isLoading={loadingAllBatches}
                allowEmpty={false}
                inputClassName={inputClass}
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

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-black text-zinc-900">Danh sách sản phẩm đã quét</h2>
            <p className="text-[11px] font-semibold text-zinc-500">{dotDetailLines.length} mã SP</p>
          </div>
        </div>

        {dotDetailLines.length > 0 ? (
          <div className="border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <TableToolbar hasActiveFilters={hasActiveDetailFilters} onResetFilters={resetDetailFilters}>
              <TableSearchInput
                value={detailSearchText}
                onChange={setDetailSearchText}
                placeholder="Tìm mã NVL, mã quét, tên SP..."
              />
              {detailTypeOptions.length > 0 && (
                <MultiSelectFilter
                  label="Loại SP"
                  allLabel="Tất cả loại SP"
                  searchPlaceholder="Tìm loại SP..."
                  emptyLabel="Không tìm thấy loại SP"
                  options={detailTypeOptions}
                  values={detailTypeFilter}
                  onChange={setDetailTypeFilter}
                />
              )}
            </TableToolbar>
          </div>
        ) : null}

        <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[480px]">
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã NVL</TableHeadCell>
            <TableHeadCell>Mã quét</TableHeadCell>
            <TableHeadCell>Tên SP</TableHeadCell>
            <TableHeadCell>Loại SP</TableHeadCell>
            <TableHeadCell>Người kiểm</TableHeadCell>
            <TableHeadCell>Thời điểm lưu</TableHeadCell>
          </TableHead>
          <TableBody>
            {filteredDetailLines.map((line, index) => (
              <React.Fragment key={String(line.id)}>
                <TableRow>
                  <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-800">{line.ma_nvl || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-900">{line.ma_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{line.ten_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{line.loai_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{line.nguoi_kiem_kho || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateTime(line.ngay_gio_kiem_kho)}
                  </td>
                </TableRow>
              </React.Fragment>
            ))}

            {filteredDetailLines.length === 0 && (
              <TableEmptyRow colSpan={7}>
                {loadingDotDetail
                  ? 'Đang tải dữ liệu...'
                  : dotDetailLines.length === 0
                    ? 'Đợt này chưa có sản phẩm nào được quét.'
                    : 'Không có mã nào phù hợp bộ lọc.'}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
      </section>
      </>
      ) : (
      <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Chọn đợt kiểm kho</h2>
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Đợt kiểm kho đã chốt
          <div className="mt-1">
            <SearchableSelect
              value={selectedSummaryDot}
              onChange={value => {
                setSelectedSummaryDot(value);
                setSummaryDotTouched(true);
              }}
              options={confirmedBatches}
              getValue={item => (item as DotGroup).dot_kiem_kho}
              getLabel={item => {
                const b = item as DotGroup;
                return `${formatDotLabel(b.ngay_bat_dau, b.thoi_gian_xac_nhan)} · ${b.so_dong} mã · Đã xác nhận`;
              }}
              placeholder="Tìm đợt kiểm kho..."
              isLoading={loadingAllBatches}
              allowEmpty={false}
              inputClassName={inputClass}
            />
          </div>
        </label>

        {selectedSummaryDotGroup ? (
          <p className="mt-3 text-[11px] font-semibold text-zinc-500">
            Bắt đầu: {formatDateTime(selectedSummaryDotGroup.ngay_bat_dau)} ·{' '}
            <span className="text-emerald-600">
              Đã xác nhận kiểm kê lúc {formatDateTime(selectedSummaryDotGroup.thoi_gian_xac_nhan)}
            </span>
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <div>
            <h2 className="text-sm font-black text-zinc-900">Danh sách các sản phẩm đã chốt</h2>
            <p className="text-[11px] font-semibold text-zinc-500">
              {filteredSummaryRows.length} / {summaryRows.length} mã SP · gộp theo mã NVL của các đợt đã xác nhận kiểm kê
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loadingSummary}
            className="text-[11px] font-bold text-[#ef1b2d] hover:underline disabled:opacity-50"
          >
            {loadingSummary ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>

        {summaryError ? (
          <div className="border-b border-zinc-100 bg-rose-50 px-4 py-2.5 text-[11px] font-semibold text-rose-700">
            {summaryError}
          </div>
        ) : null}

        <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[560px]">
          <TableHead>
            <TableHeadCell>STT</TableHeadCell>
            <TableHeadCell>Mã NVL</TableHeadCell>
            <TableHeadCell>Tên SP</TableHeadCell>
            <TableHeadCell>Loại SP</TableHeadCell>
            <TableHeadCell align="center">Tổng số lượng</TableHeadCell>
            <TableHeadCell>Chốt lúc</TableHeadCell>
            <TableHeadCell>Người chốt</TableHeadCell>
          </TableHead>
          <TableBody>
            {filteredSummaryRows.map((row, index) => (
              <React.Fragment key={String(row.id)}>
                <TableRow>
                  <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-800">{row.ma_nvl || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.loai_sp || '—'}</td>
                  <td className="px-4 py-3 text-center font-black text-zinc-900">{row.tong_so_luong ?? 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateTime(row.chot_luc)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.nguoi_chot || '—'}</td>
                </TableRow>
              </React.Fragment>
            ))}

            {filteredSummaryRows.length === 0 && (
              <TableEmptyRow colSpan={7}>
                {loadingSummary
                  ? 'Đang tải dữ liệu...'
                  : summaryRows.length === 0
                    ? 'Chưa có đợt nào được xác nhận kiểm kê.'
                    : 'Không có mã nào phù hợp bộ lọc.'}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
      </section>
      </>
      )}

      <ProductQrScanner
        open={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScan}
        hardwareOnly={scannerMode === 'hardware'}
        requireConfirm={false}
      />

      {showManualModal
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
                        ? formatDotLabel(
                            openBatches.find(b => b.dot_kiem_kho === dotKiemKho)?.ngay_bat_dau ?? null
                          )
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
