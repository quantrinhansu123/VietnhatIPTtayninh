import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Printer, RefreshCw, Scale, Trash2, X } from 'lucide-react';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from '../../components/WeighingImagePreviewModal';
import {
  buildCanTuDongPrintData,
  CanTuDongPrintBatch,
  type CanTuDongPrintData
} from '../../components/CanTuDongPrintSheet';
import { formatNumber } from '../../utils';
import { waitForPrintImagesReady } from '../../utils/printReady';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import { normalizeProductCodeKey } from '../san-pham/types';
import {
  DEFAULT_CAN_TU_DONG_BI_KG,
  filterCanTuDongRecordsForBoard,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  sumCanTuDongSanLuongTotals,
  vietnamIsoDateFromTimestamp
} from '../../utils/canTuDongWeights';
import {
  TableToolbar,
  TableSearchInput,
  FilterCombobox,
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
 * - Trọng lượng nhựa = SP − lõi − bì
 * - core_image_*     = Ảnh cân lõi
 * - product_image_*  = Ảnh cân sản phẩm
 */
export type CanTuDongRecord = {
  id: number | string;
  event_id?: string | null;
  qr_code?: string | null;
  /** Ca sản xuất (SOURCE_SHIFT metadata hoặc suy từ giờ captured_at). */
  ca?: string | null;
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
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFromDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function statusClass(status?: string | null) {
  const key = String(status ?? '')
    .trim()
    .toLowerCase();
  if (key === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (key === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key === 'rejected' || key === 'error') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

function resolveProductImageUrl(row: CanTuDongRecord) {
  return String(row.product_preview_url || row.preview_url || row.product_image_url || '').trim();
}

function resolveCoreImageUrl(row: CanTuDongRecord) {
  return String(row.core_preview_url || row.core_image_url || '').trim();
}

function ImageCell({
  url,
  title,
  emptyLabel,
  onView
}: {
  url: string;
  title: string;
  emptyLabel: string;
  onView: () => void;
}) {
  if (!url) {
    return (
      <span className="inline-flex h-12 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-[10px] font-bold text-zinc-400">
        {emptyLabel}
      </span>
    );
  }
  return <WeighingImageThumbnail url={url} alt={title} title={title} onView={onView} />;
}

function rowIdKey(id: number | string) {
  return String(id);
}

export function CanTuDongPanel({
  onBack,
  initialFilters
}: {
  onBack: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const [records, setRecords] = useState<CanTuDongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || defaultFromDate(14)
  );
  const [toDate, setToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCa, setSelectedCa] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? 'all' : shift;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CanTuDongRecord | null>(null);
  const [editForm, setEditForm] = useState({ qr_code: '', ca: '', tare_weight: '', weight: '', unit: 'kg', device_id: '', status: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [printData, setPrintData] = useState<CanTuDongPrintData | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '2000' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(res, errorData, 'Không tải được cân tự động.'));
      }
      const payload = await res.json();
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setSelectedIds(new Set());
    } catch (err: any) {
      const message = err?.message || 'Không tải được cân tự động.';
      setError(message);
      setRecords([]);
      setSelectedIds(new Set());
      showAppToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load lần đầu; lọc bằng nút Tải lại
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const rows: Array<Record<string, unknown>> = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
            ? data
            : [];
        const map = new Map<string, string>();
        for (const row of rows) {
          const code = String(row.ma_sp ?? row.code ?? '').trim();
          const name = String(row.ten_sp ?? row.name ?? '').trim();
          const key = normalizeProductCodeKey(code);
          if (key && name) map.set(key, name);
        }
        if (!cancelled) setProductNameByCode(map);
      } catch {
        if (!cancelled) setProductNameByCode(new Map());
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
      void waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('can-tu-dong-print-active');
          disableCanTuDongPortraitPrintPage();
          setPendingPrint(false);
          setPrintData(null);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('can-tu-dong-print-active');
      disableCanTuDongPortraitPrintPage();
    };
  }, [pendingPrint, printData]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of records) {
      const status = String(row.status ?? '').trim();
      if (status) set.add(status);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const caOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of records) {
      const ca = String(row.ca ?? '').trim();
      if (ca) set.add(ca);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const hasActiveFilters =
    Boolean(searchText.trim()) || selectedStatus !== 'all' || selectedCa !== 'all';

  const resetFilters = () => {
    setSearchText('');
    setSelectedStatus('all');
    setSelectedCa('all');
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRecords = useMemo(() => {
    // Chỉ lọc ca ở client. Ngày khớp cột THỜI ĐIỂM (captured_at), không dùng SOURCE_DATE
    // trong metadata (ngày sản xuất) — tránh lệch với API / cột hiển thị.
    const byCa = filterCanTuDongRecordsForBoard(records, {
      shiftFilter: selectedCa
    });
    return byCa.filter(row => {
      if (fromDate || toDate) {
        const day = vietnamIsoDateFromTimestamp(row.captured_at || row.created_at);
        if (!day) return false;
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
      }
      const matchesStatus = selectedStatus === 'all' || String(row.status ?? '').trim() === selectedStatus;
      const matchesSearch =
        !normalizedSearch ||
        `${row.qr_code ?? ''} ${row.event_id ?? ''} ${row.device_id ?? ''} ${row.weight_source ?? ''} ${row.ca ?? ''}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [records, normalizedSearch, selectedStatus, selectedCa, fromDate, toDate]);

  const visibleIds = useMemo(
    () => filteredRecords.map(row => rowIdKey(row.id)).filter(Boolean),
    [filteredRecords]
  );

  const trongLuongNhuaTotals = useMemo(
    () => sumCanTuDongSanLuongTotals(filteredRecords),
    [filteredRecords]
  );

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

  const handlePrintFiltered = () => {
    if (filteredRecords.length === 0) {
      showAppToast('Không có dữ liệu theo bộ lọc để in.', 'error');
      return;
    }
    setPrintData(
      buildCanTuDongPrintData(filteredRecords, {
        fromDate,
        toDate,
        ca: selectedCa,
        productNameByCode
      })
    );
    setPendingPrint(true);
  };

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ef1b2d]/10 text-[#ef1b2d]">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-black text-zinc-900 sm:text-xl">Cân tự động</h1>
              <p className="text-xs font-semibold text-zinc-500">
                Cân lõi · Cân sản phẩm · Trọng lượng bì (0,16) · Trọng lượng nhựa (= SP − lõi − bì)
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrintFiltered}
            disabled={loading || pendingPrint || filteredRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ef1b2d]/30 bg-red-50 px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-100 disabled:opacity-60"
            title="In bảng tổng hợp theo bộ lọc đang chọn"
          >
            {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            In theo bộ lọc
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-950">
        <div className="flex flex-wrap items-center gap-4">
          <span title="Số dòng đang lọc = số lần cân">
            <span className="uppercase tracking-wider text-emerald-800/80">Số lượng</span>{' '}
            <span className="font-mono text-sm">
              {loading ? '…' : formatNumber(trongLuongNhuaTotals.quantity, 0)}
            </span>
          </span>
          <span title="Tổng cột «Trọng lượng nhựa» = SP − lõi − bì 0,16">
            <span className="uppercase tracking-wider text-emerald-800/80">Trọng lượng</span>{' '}
            <span className="font-mono text-sm text-emerald-800">
              {loading ? '…' : `${formatNumber(trongLuongNhuaTotals.weightKg, 2)} kg`}
            </span>
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">
          Tổng cột Trọng lượng nhựa
        </span>
      </div>

      <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Từ ngày
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
        </label>
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Đến ngày
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <TableToolbar isLoading={loading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm QR..."
          disabled={loading}
        />
        <FilterCombobox
          label="Ca"
          options={caOptions}
          value={selectedCa}
          onChange={setSelectedCa}
          searchPlaceholder="Tìm ca..."
          compact
        />
        <FilterCombobox
          label="Trạng thái"
          options={statusOptions}
          value={selectedStatus}
          onChange={setSelectedStatus}
          searchPlaceholder="Tìm trạng thái..."
          compact
        />
      </TableToolbar>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
          <p className="mr-auto text-xs font-bold text-rose-800">Đã chọn {selectedCount} dòng</p>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkDeleting}
            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={isBulkDeleting}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {isBulkDeleting ? 'Đang xóa...' : `Xóa đã chọn (${selectedCount})`}
          </button>
        </div>
      ) : null}

      <TableShell minWidthClassName="min-w-[1280px]">
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
          <TableHeadCell>Ảnh lõi</TableHeadCell>
          <TableHeadCell>Ảnh sản phẩm</TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Thời điểm</TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Ca</TableHeadCell>
          <TableHeadCell>QR</TableHeadCell>
          <TableHeadCell title="tare_weight">Cân lõi</TableHeadCell>
          <TableHeadCell title="weight — còn lõi">Cân sản phẩm</TableHeadCell>
          <TableHeadCell title={`Mặc định ${DEFAULT_CAN_TU_DONG_BI_KG} kg`}>
            Trọng lượng bì
          </TableHeadCell>
          <TableHeadCell title="Cân SP − Cân lõi − Trọng lượng bì">Trọng lượng nhựa</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell>Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={12}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải cân tự động…
              </span>
            </TableEmptyRow>
          ) : filteredRecords.length === 0 ? (
            <TableEmptyRow colSpan={12}>Không có bản ghi trong khoảng lọc.</TableEmptyRow>
          ) : (
            filteredRecords.map(row => {
              const idKey = rowIdKey(row.id);
              const coreUrl = resolveCoreImageUrl(row);
              const productUrl = resolveProductImageUrl(row);
              const coreTitle = `Ảnh cân lõi · ${row.qr_code || row.event_id || row.id}`;
              const productTitle = `Ảnh cân sản phẩm · ${row.qr_code || row.event_id || row.id}`;
              const canLoi = row.can_loi ?? row.tare_weight;
              const canSp = row.can_san_pham ?? row.weight;
              const trongLuongBi = resolveTrongLuongBiKg(row);
              const trongLuongNhua = resolveTrongLuongNhuaKg(row);
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
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={coreUrl}
                      title={coreTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: coreUrl, title: coreTitle })}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={productUrl}
                      title={productTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: productUrl, title: productTitle })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateTime(row.captured_at || row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-sky-900">
                    {row.ca || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-zinc-900">
                    {row.qr_code || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-sky-800">
                    {formatWeight(canLoi, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-800">
                    {formatWeight(canSp, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatWeight(trongLuongBi, row.unit, 2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-emerald-800">
                    {trongLuongNhua !== null ? formatWeight(trongLuongNhua, row.unit, 2) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {row.status || '—'}
                    </span>
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

      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />

      {pendingPrint && printData
        ? createPortal(<CanTuDongPrintBatch data={printData} />, document.body)
        : null}
    </div>
  );
}

export default CanTuDongPanel;
