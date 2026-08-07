import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Save, ScanBarcode, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import ProductQrScanner from '../../components/ProductQrScanner';
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

type KiemKhoRecord = {
  id: number | string;
  ten_kho?: string | null;
  dot_kiem_kho?: string | null;
  ma_nvl?: string | null;
  ma_sp?: string | null;
  ten_sp?: string | null;
  loai_sp?: string | null;
  ngay_gio_kiem_kho?: string | null;
  nguoi_kiem_kho?: string | null;
  created_at?: string | null;
};

const KIEM_KHO_PERIODS = ['Đợt kiểm kho 1', 'Đợt kiểm kho 2', 'Đợt kiểm kho 3', 'Đợt kiểm kho 4'];

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
  const [dotKiemKho, setDotKiemKho] = useState('');
  const [nguoiKiemKho, setNguoiKiemKho] = useState(loginName);
  const [ngayGioKiemKho, setNgayGioKiemKho] = useState(nowLocalDateTimeValue);

  useEffect(() => {
    if (loginName) setNguoiKiemKho(loginName);
  }, [loginName]);
  const [lines, setLines] = useState<KiemKhoLine[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [recent, setRecent] = useState<KiemKhoRecord[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
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

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fetch('/api/kiem-kho?limit=80');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được lịch sử kiểm kho.'));
      setRecent(Array.isArray(data?.records) ? data.records : []);
    } catch (err: any) {
      setRecent([]);
      showAppToast(err?.message || 'Không tải được lịch sử kiểm kho.', 'error');
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadRecent();
  }, [loadProducts, loadRecent]);

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
    if (!dotKiemKho.trim()) {
      setError('Chọn đợt kiểm kho.');
      return;
    }
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
      setNgayGioKiemKho(thoiDiemLuu);
      const res = await fetch('/api/kiem-kho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dot_kiem_kho: dotKiemKho.trim(),
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
      setMessage(`Đã lưu ${savedCount} dòng kiểm kho.`);
      showAppToast('Đã lưu báo cáo kiểm kho.', 'success');
      await loadRecent();
    } catch (err: any) {
      const text = err?.message || 'Không lưu được báo cáo kiểm kho.';
      setError(text);
      showSaveFailure(err, text);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecent = async (id: number | string) => {
    if (!window.confirm('Xóa dòng kiểm kho này?')) return;
    try {
      const res = await fetch(`/api/kiem-kho/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được.'));
      showAppToast('Đã xóa dòng kiểm kho.', 'success');
      await loadRecent();
    } catch (err: any) {
      showAppToast(err?.message || 'Không xóa được.', 'error');
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
        {canCreate ? (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu phiếu
          </button>
        ) : null}
      </div>

      <nav
        aria-label="Chức năng kiểm kho"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm md:grid-cols-3"
      >
        <button
          type="button"
          aria-current="page"
          className="min-h-[76px] rounded-xl border-2 border-[#ef1b2d] bg-red-50 px-4 py-3 text-left"
        >
          <span className="block text-sm font-black text-zinc-900">Thực hiện kiểm kho</span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Tạo phiếu và quét mã sản phẩm
          </span>
        </button>

        <button
          type="button"
          disabled
          className="min-h-[76px] cursor-not-allowed rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left opacity-70"
          title="Chức năng sẽ được triển khai sau"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-zinc-900">Danh sách đợt kiểm kho</span>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-500">
              Sắp triển khai
            </span>
          </span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Xem và quản lý các đợt kiểm kho
          </span>
        </button>

        <button
          type="button"
          disabled
          className="min-h-[76px] cursor-not-allowed rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left opacity-70"
          title="Chức năng sẽ được triển khai sau"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-zinc-900">Tổng hợp đợt kiểm kho</span>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-zinc-500">
              Sắp triển khai
            </span>
          </span>
          <span className="mt-1 block text-xs font-semibold text-zinc-500">
            Tổng hợp kết quả theo từng đợt
          </span>
        </button>
      </nav>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Thông tin phiếu</h2>
        <div className="grid grid-cols-1 gap-3">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho *
            <select
              value={dotKiemKho}
              onChange={e => setDotKiemKho(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Chọn đợt kiểm kho</option>
              {KIEM_KHO_PERIODS.map(period => (
                <option key={period} value={period}>{period}</option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Ngày giờ kiểm kho (tự động)
            <input
              type="datetime-local"
              value={ngayGioKiemKho}
              readOnly
              className={`mt-1 ${inputClass} cursor-default bg-zinc-50 text-zinc-700`}
              title="Tự động lấy thời gian khi lưu phiếu"
            />
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
                  onClick={openManualModal}
                  className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-extrabold text-zinc-800 transition hover:bg-zinc-50"
                  title="Nhập mã SP thủ công"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm
                </button>
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

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5 sm:px-4">
          <h2 className="text-sm font-black text-zinc-900">Đã lưu gần đây</h2>
          <button
            type="button"
            onClick={() => void loadRecent()}
            disabled={loadingRecent}
            className="text-[11px] font-bold text-[#ef1b2d] hover:underline disabled:opacity-50"
          >
            {loadingRecent ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>

        <TableShell minWidthClassName="min-w-[1080px]" maxHeightClassName="max-h-[480px]">
          <TableHead>
            <TableHeadCell>Thời điểm</TableHeadCell>
            <TableHeadCell>Kho</TableHeadCell>
            <TableHeadCell>Đợt</TableHeadCell>
            <TableHeadCell>Mã NVL</TableHeadCell>
            <TableHeadCell>Mã quét</TableHeadCell>
            <TableHeadCell>Tên SP</TableHeadCell>
            <TableHeadCell>Loại</TableHeadCell>
            <TableHeadCell>Người kiểm</TableHeadCell>
            <TableHeadCell align="center">Thao tác</TableHeadCell>
          </TableHead>
          <TableBody>
            {recent.map(row => (
              <React.Fragment key={String(row.id)}>
                <TableRow>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateTime(row.ngay_gio_kiem_kho || row.created_at)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-800">{row.ten_kho || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-800">{row.dot_kiem_kho || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-800">{row.ma_nvl || '—'}</td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-900">{row.ma_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.loai_sp || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.nguoi_kiem_kho || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <RowActionsMenu label={`Thao tác bản ghi ${row.id}`}>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteRecent(row.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        title="Xóa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    </RowActionsMenu>
                  </td>
                </TableRow>
              </React.Fragment>
            ))}

            {recent.length === 0 && (
              <TableEmptyRow colSpan={9}>
                {loadingRecent ? 'Đang tải dữ liệu kiểm kho...' : 'Chưa có dữ liệu kiểm kho.'}
              </TableEmptyRow>
            )}
          </TableBody>
        </TableShell>
      </section>

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
                      {dotKiemKho.trim() || '—'}
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
