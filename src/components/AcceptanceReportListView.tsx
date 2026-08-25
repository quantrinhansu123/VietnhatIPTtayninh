import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { vietNhatLogoUrl } from './layout/constants';
import { waitForPrintImagesReady } from '../utils/printReady';
import {
  AcceptanceReportPrintBatch,
  buildAcceptancePrintSlips,
  buildAcceptanceScreenSlips,
  AcceptanceReportSlipStack
} from './AcceptanceReportPrintSheet';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { normalizeReportFromApi } from './AcceptanceReportForm';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter
} from './shared/table';

type ProductNameOption = {
  code: string;
  name: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProductKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
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

export default function AcceptanceReportListView({
  onBack,
  onCreate,
  onEdit,
  initialFilters
}: {
  onBack: () => void;
  onCreate: (prefill?: { ngay: string; ca: string }) => void;
  onEdit: (report: AcceptanceReport) => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('acceptance-report-list');
  const [filterFromDate, setFilterFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || todayIso()
  );
  const [filterToDate, setFilterToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [filterShift, setFilterShift] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [searchText, setSearchText] = useState('');
  const [reports, setReports] = useState<AcceptanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const [activePrintSlips, setActivePrintSlips] = useState<ReturnType<typeof buildAcceptancePrintSlips>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());

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

  const reportsWithNames = useMemo(
    () =>
      filteredReports.map(report => ({
        ...report,
        ten_sp: productNameByCode.get(normalizeProductKey(report.mat_hang)) || ''
      })),
    [filteredReports, productNameByCode]
  );

  const screenSlips = useMemo(
    () => buildAcceptanceScreenSlips(reportsWithNames),
    [reportsWithNames]
  );

  const printSlipCount = useMemo(
    () => buildAcceptancePrintSlips(reportsWithNames).length,
    [reportsWithNames]
  );

  useEffect(() => {
    if (!pendingPrint || activePrintSlips.length === 0) return;
    let cancelled = false;
    document.body.classList.add('acceptance-report-print-active');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('acceptance-report-print-active');
          setActivePrintSlips([]);
          setPendingPrint(false);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('acceptance-report-print-active');
    };
  }, [pendingPrint, activePrintSlips]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('acceptance-report-print-active');
      setActivePrintSlips([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('acceptance-report-print-active');
    };
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

  const handlePrint = () => {
    const slips = buildAcceptancePrintSlips(reportsWithNames);
    if (slips.length === 0) {
      setError('Chưa có báo cáo sản lượng để in.');
      return;
    }
    setError('');
    setActivePrintSlips(slips);
    setPendingPrint(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa dòng báo cáo sản lượng này?')) return;
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch(`/api/bao-cao-nghiem-thu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      setMessage('Đã xóa dòng báo cáo sản lượng.');
      await loadReports(filterFromDate, filterToDate);
    } catch (err: any) {
      setError(err.message || 'Không thể xóa báo cáo.');
    } finally {
      setDeletingId(null);
    }
  };

  const reportById = useMemo(() => {
    const map = new Map<string, AcceptanceReport>();
    for (const report of filteredReports) map.set(report.id, report);
    return map;
  }, [filteredReports]);

  const renderLineActions = (line: { id: string }) => {
    const report = reportById.get(line.id);
    if (!report) return null;
    return (
      <div className="inline-flex items-center justify-center gap-1">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(report)}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50"
            title="Sửa"
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
            onClick={() => void handleDelete(report.id)}
            disabled={deletingId === report.id}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Xóa"
          >
            {deletingId === report.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img
                src={vietNhatLogoUrl}
                alt="Viet Nhat IPT"
                className="h-14 w-auto max-w-[190px] object-contain"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">
                  Báo cáo sản lượng
                </p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Mỗi phiếu một bảng — vuốt xuống xem, không cần chọn
                </p>
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
              {screenSlips.length} phiếu · {filteredReports.length} dòng
            </span>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={printSlipCount === 0 || pendingPrint || isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            {pendingPrint ? 'Đang in...' : `In tất cả (${printSlipCount})`}
          </button>
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

        <div className="p-3 sm:p-4">
          {isLoading ? (
            <div className="px-3 py-8 text-center font-bold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : (
            <AcceptanceReportSlipStack
              slips={screenSlips}
              emptyText="Chưa có báo cáo phù hợp với bộ lọc."
              renderLineActions={canEdit || canDelete ? renderLineActions : undefined}
            />
          )}
        </div>
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

      {pendingPrint &&
        activePrintSlips.length > 0 &&
        createPortal(<AcceptanceReportPrintBatch slips={activePrintSlips} />, document.body)}
    </div>
  );
}
