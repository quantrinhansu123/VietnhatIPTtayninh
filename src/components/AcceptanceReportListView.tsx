import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Eye, Loader2, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import { waitForPrintImagesReady } from '../utils/printReady';
import { AcceptanceReportPrintBatch, buildAcceptancePrintSlips, sumByUnit } from './AcceptanceReportPrintSheet';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { normalizeReportFromApi } from './AcceptanceReportForm';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
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
  RowActionsMenu
} from './shared/table';

type AcceptanceDateGroup = {
  ngay: string;
  reports: AcceptanceReport[];
};

type ProductNameOption = {
  code: string;
  name: string;
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function AcceptanceReportDetailModal({
  report,
  productName,
  onClose,
  onEdit,
  onViewImage,
  canEdit = false
}: {
  report: AcceptanceReport;
  productName: string;
  onClose: () => void;
  onEdit: (report: AcceptanceReport) => void;
  onViewImage: (url: string) => void;
  canEdit?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const machineLabel =
    report.ten_may && report.ma_may && report.ten_may !== report.ma_may
      ? `${report.ma_may} · ${report.ten_may}`
      : report.ten_may || report.ma_may || '—';

  const modal = (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">Chi tiết báo cáo sản lượng</p>
            <h3 className="mt-0.5 truncate text-base font-black text-zinc-900 sm:text-lg">
              {report.mat_hang || 'Mặt hàng'} · {report.ca || '—'}
            </h3>
            <p className="mt-1 font-mono text-[11px] font-semibold text-zinc-500">
              {formatPrintDate(report.ngay)}
              {report.gio ? ` · ${report.gio}` : ''}
              {report.lan ? ` · Lần ${report.lan}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
            title="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-zinc-800">{formatPrintDate(report.ngay)}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ca</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{report.ca || '—'}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Lần</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{report.lan || '—'}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Giờ</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-zinc-800">{report.gio || '—'}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 sm:col-span-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Tổ / Máy</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{machineLabel}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 sm:col-span-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Mặt hàng</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{report.mat_hang || '—'}</p>
              {productName ? <p className="mt-0.5 text-xs font-semibold text-zinc-500">{productName}</p> : null}
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">ĐVT</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{report.don_vi || '—'}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Số lượng</p>
              <p className="mt-0.5 font-mono text-sm font-black text-emerald-800">
                {report.so_luong === null ? '—' : formatNumber(report.so_luong, 2)}
              </p>
            </div>
          </div>

          {report.hinh_anh ? (
            <div className="mt-4">
              <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-zinc-400">Ảnh sản lượng</p>
              <button
                type="button"
                onClick={() => onViewImage(report.hinh_anh)}
                className="block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                title="Xem ảnh lớn"
              >
                <img src={report.hinh_anh} alt="Ảnh sản lượng" className="max-h-64 w-full object-contain" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                onEdit(report);
                onClose();
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 transition hover:bg-amber-100"
            >
              <Pencil className="h-3.5 w-3.5" />
              Sửa
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-900 px-3 text-xs font-bold text-white transition hover:bg-zinc-800"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function compareAcceptanceReports(a: AcceptanceReport, b: AcceptanceReport) {
  const machineA = a.ten_may || a.ma_may || '';
  const machineB = b.ten_may || b.ma_may || '';
  const byMachine = machineA.localeCompare(machineB, 'vi');
  if (byMachine !== 0) return byMachine;
  const byLan = String(a.lan).localeCompare(String(b.lan), 'vi', { numeric: true });
  if (byLan !== 0) return byLan;
  const byTime = String(a.gio).localeCompare(String(b.gio));
  if (byTime !== 0) return byTime;
  return String(a.mat_hang).localeCompare(String(b.mat_hang), 'vi');
}

function normalizeProductKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
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

function buildDateGroups(reports: AcceptanceReport[]): AcceptanceDateGroup[] {
  const grouped = new Map<string, AcceptanceReport[]>();

  for (const report of reports) {
    const ngay = report.ngay || '-';
    const list = grouped.get(ngay) ?? [];
    list.push(report);
    grouped.set(ngay, list);
  }

  return [...grouped.entries()]
    .map(([ngay, groupReports]) => ({
      ngay,
      reports: [...groupReports].sort((a, b) => {
        const byCa = String(a.ca).localeCompare(String(b.ca), 'vi');
        if (byCa !== 0) return byCa;
        return compareAcceptanceReports(a, b);
      })
    }))
    .sort((a, b) => b.ngay.localeCompare(a.ngay));
}

export default function AcceptanceReportListView({
  onBack,
  onCreate,
  onEdit
}: {
  onBack: () => void;
  onCreate: (prefill?: { ngay: string; ca: string }) => void;
  onEdit: (report: AcceptanceReport) => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('acceptance-report-list');
  const [filterFromDate, setFilterFromDate] = useState(todayIso());
  const [filterToDate, setFilterToDate] = useState(todayIso());
  const [filterShift, setFilterShift] = useState('');
  const [searchText, setSearchText] = useState('');
  const [reports, setReports] = useState<AcceptanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const [activePrintSlips, setActivePrintSlips] = useState<ReturnType<typeof buildAcceptancePrintSlips>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [viewingReport, setViewingReport] = useState<AcceptanceReport | null>(null);

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
      const matchesShift = !filterShift || report.ca?.trim() === filterShift;
      const matchesSearch =
        !normalizedSearch ||
        `${report.mat_hang} ${report.ten_may} ${report.ma_may} ${report.ca} ${report.don_vi}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesShift && matchesSearch;
    });
  }, [filterShift, normalizedSearch, reports]);
  const hasActiveFilters = Boolean(filterShift) || Boolean(searchText);
  const resetFilters = () => {
    setFilterShift('');
    setSearchText('');
  };
  const dateGroups = useMemo(() => buildDateGroups(filteredReports), [filteredReports]);
  const allReportIds = useMemo(() => filteredReports.map(report => report.id).filter(Boolean), [filteredReports]);
  const selectedCount = selectedIds.size;
  const allSelected = allReportIds.length > 0 && selectedIds.size === allReportIds.length;

  const addProductNamesForPrint = (sourceReports: AcceptanceReport[]) =>
    sourceReports.map(report => ({
      ...report,
      ten_sp: productNameByCode.get(normalizeProductKey(report.mat_hang)) || ''
    }));

  useEffect(() => {
    if (!pendingPrint || activePrintSlips.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, activePrintSlips]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setActivePrintSlips([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const next = new Map<string, string>();
        normalizeProductNames(data).forEach(product => {
          const key = normalizeProductKey(product.code);
          if (key) next.set(key, product.name);
        });
        setProductNameByCode(next);
      } catch {
        if (!cancelled) setProductNameByCode(new Map());
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
        setSelectedIds(new Set());
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

  const startPrint = (slips: ReturnType<typeof buildAcceptancePrintSlips>) => {
    if (slips.length === 0) {
      setError('Chưa có báo cáo sản lượng để in.');
      return;
    }
    setError('');
    setActivePrintSlips(slips);
    setPendingPrint(true);
  };

  const handlePrint = () => {
    startPrint(buildAcceptancePrintSlips(addProductNamesForPrint(filteredReports)));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa báo cáo sản lượng này?')) return;
    setError('');
    setMessage('');
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bao-cao-nghiem-thu/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      setMessage('Đã xóa báo cáo sản lượng.');
      await loadReports(filterFromDate, filterToDate);
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Không thể xóa báo cáo.');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(() => (allSelected ? new Set() : new Set(allReportIds)));
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Xóa ${ids.length} báo cáo sản lượng đã chọn?`)) return;
    setError('');
    setMessage('');
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/bao-cao-nghiem-thu/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa nhiều báo cáo.');
      const deleted = Number(data.deleted ?? ids.length);
      setMessage(deleted > 0 ? `Đã xóa ${deleted} báo cáo sản lượng.` : 'Không có báo cáo nào được xóa.');
      setSelectedIds(new Set());
      await loadReports(filterFromDate, filterToDate);
    } catch (err: any) {
      setError(err.message || 'Không thể xóa nhiều báo cáo.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const renderReportActions = (report: AcceptanceReport) => (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => setViewingReport(report)}
        className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700 transition hover:bg-sky-100"
        title="Xem chi tiết"
      >
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" />
          Xem
        </span>
      </button>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onEdit(report)}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50"
          title="Sửa báo cáo"
        >
          <span className="inline-flex items-center gap-1">
            <Pencil className="h-3.5 w-3.5" />
            Sửa
          </span>
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={() => handleDelete(report.id)}
          disabled={deletingId === report.id}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Xóa báo cáo"
        >
          {deletingId === report.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img src={vietNhatLogoUrl} alt="Viet Nhat IPT" className="h-14 w-auto max-w-[190px] object-contain" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">Báo cáo sản lượng</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCreate ? (
                <button
                  type="button"
                  onClick={onCreate}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-emerald-700" />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">
              {dateGroups.length} ngày · {filteredReports.length} dòng
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canDelete ? (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={selectedCount === 0 || bulkDeleting || isLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Xóa các dòng đã chọn"
              >
                {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xoá đã chọn ({selectedCount})
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={selectedCount === 0 || bulkDeleting || isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bỏ chọn
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredReports.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              In phiếu
            </button>
          </div>
        </div>

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

        {isLoading ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            Chưa có báo cáo phù hợp với bộ lọc.
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            {dateGroups.map(group => {
              const totalsByUnit = sumByUnit(
                group.reports.map(report => ({
                  mat_hang: report.mat_hang,
                  don_vi: report.don_vi,
                  so_luong: report.so_luong
                }))
              );
              return (
                <div key={group.ngay} className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="flex items-baseline justify-between gap-1.5 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                      <span className="font-mono text-xs font-black text-zinc-900">{group.ngay}</span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-800">{group.reports.length} dòng</span>
                  </div>
                  <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-[520px]">
                    <TableHead>
                      <TableHeadCell align="center" className="w-10">
                        {canDelete ? (
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            aria-label="Chọn tất cả"
                            className="h-4 w-4 accent-[#ef1b2d]"
                          />
                        ) : null}
                      </TableHeadCell>
                      <TableHeadCell align="center" className="w-12">STT</TableHeadCell>
                      <TableHeadCell>Ảnh</TableHeadCell>
                      <TableHeadCell>Ca</TableHeadCell>
                      <TableHeadCell>Tổ</TableHeadCell>
                      <TableHeadCell>Lần</TableHeadCell>
                      <TableHeadCell>Giờ</TableHeadCell>
                      <TableHeadCell>Mặt hàng</TableHeadCell>
                      <TableHeadCell>ĐVT</TableHeadCell>
                      <TableHeadCell align="center">SL</TableHeadCell>
                      <TableHeadCell align="center">Thao tác</TableHeadCell>
                    </TableHead>
                    <TableBody>
                      {group.reports.map((report, reportIndex) => (
                        <React.Fragment key={report.id}>
                          <TableRow>
                            <td className="px-3 py-2 text-center">
                              {canDelete ? (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(report.id)}
                                  onChange={() => toggleSelected(report.id)}
                                  aria-label="Chọn dòng"
                                  className="h-4 w-4 accent-[#ef1b2d]"
                                />
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-zinc-600">
                              {reportIndex + 1}
                            </td>
                            <td className="px-3 py-2">
                              {report.hinh_anh ? (
                                <WeighingImageThumbnail
                                  url={report.hinh_anh}
                                  alt="Sản lượng"
                                  title="Xem ảnh sản lượng"
                                  onView={() =>
                                    setViewingImage({ url: report.hinh_anh, title: 'Ảnh báo cáo sản lượng' })
                                  }
                                  className="block h-10 w-10 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                                />
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-3 py-2 font-semibold text-zinc-800">{report.ca || '-'}</td>
                            <td className="px-3 py-2 text-zinc-700">{report.ten_may || report.ma_may || '-'}</td>
                            <td className="px-3 py-2 font-bold text-zinc-700">{report.lan || '-'}</td>
                            <td className="px-3 py-2 font-mono text-zinc-600">{report.gio || '-'}</td>
                            <td className="px-3 py-2 text-zinc-700">{report.mat_hang || '-'}</td>
                            <td className="px-3 py-2 font-semibold text-zinc-600">{report.don_vi || '-'}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                              {report.so_luong === null ? '-' : formatNumber(report.so_luong, 2)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <RowActionsMenu label="Thao tác báo cáo nghiệm thu">
                                {renderReportActions(report)}
                              </RowActionsMenu>
                            </td>
                          </TableRow>
                        </React.Fragment>
                      ))}
                      {totalsByUnit.map(([unit, total]) => (
                        <React.Fragment key={unit}>
                          <TableRow className="bg-zinc-50">
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td colSpan={7} className="px-3 py-2 text-right font-black text-zinc-800">
                              Tổng cộng ({unit})
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-black text-emerald-700">
                              {formatNumber(total, 2)}
                            </td>
                            <td />
                          </TableRow>
                        </React.Fragment>
                      ))}
                      {group.reports.length === 0 && (
                        <TableEmptyRow colSpan={11}>Chưa có dữ liệu.</TableEmptyRow>
                      )}
                    </TableBody>
                  </TableShell>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {pendingPrint &&
        activePrintSlips.length > 0 &&
        createPortal(<AcceptanceReportPrintBatch slips={activePrintSlips} />, document.body)}
      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />
      {viewingReport ? (
        <AcceptanceReportDetailModal
          report={viewingReport}
          productName={productNameByCode.get(normalizeProductKey(viewingReport.mat_hang)) || ''}
          onClose={() => setViewingReport(null)}
          onEdit={onEdit}
          onViewImage={url => setViewingImage({ url, title: 'Ảnh báo cáo sản lượng' })}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}
