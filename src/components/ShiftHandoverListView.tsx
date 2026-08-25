import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, ChevronLeft, Eye, Loader2, Plus, Printer, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { vietNhatLogoUrl } from './layout/constants';
import {
  waitForPrintImagesReady,
  enableLandscapePrintPage,
  disableLandscapePrintPage
} from '../utils/printReady';
import { formatNumber } from '../utils';
import { ShiftHandoverPrintBatch, slipToPrintSlip, type ShiftHandoverPrintSlip } from './ShiftHandoverPrintSheet';
import { normalizeShiftHandoverSlips, sumProductTotals, type ShiftHandoverSlip } from '../lib/shiftHandoverModel';
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string) {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function displayNum(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatNumber(value, digits);
}

function machineLabel(slip: ShiftHandoverSlip) {
  if (slip.machineCode && slip.machineName && slip.machineCode !== slip.machineName) {
    return `${slip.machineCode} · ${slip.machineName}`;
  }
  return slip.machineName || slip.machineCode || 'Chung';
}

function shiftLabel(slip: ShiftHandoverSlip) {
  const range = [slip.timeFrom, slip.timeTo].filter(Boolean).join('–');
  if (slip.shift && range) return `${slip.shift} (${range})`;
  return slip.shift || range || '—';
}

type DateGroup = { ngay: string; slips: ShiftHandoverSlip[] };

function ShiftHandoverDetailModal({
  slip,
  onClose,
  onPrint
}: {
  slip: ShiftHandoverSlip;
  onClose: () => void;
  onPrint: (slip: ShiftHandoverSlip) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const totals = sumProductTotals(slip.products);

  const modal = (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">
              Chi tiết phiếu giao ca
            </p>
            <h3 className="mt-0.5 truncate text-base font-black text-zinc-900 sm:text-lg">
              {slip.slipCode || machineLabel(slip)}
            </h3>
            <p className="mt-1 font-mono text-[11px] font-semibold text-zinc-500">
              {formatDisplayDate(slip.date)} · {shiftLabel(slip)} · {machineLabel(slip)}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2 sm:col-span-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Người thực hiện</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{slip.operators || '—'}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">SL cuộn</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{displayNum(totals.quantity)}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Tổng TL ĐM</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-800">{displayNum(totals.totalNormWeight)}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">II. Thành phẩm</p>
            <TableShell minWidthClassName="min-w-[820px]" maxHeightClassName="max-h-[280px]">
              <TableHead>
                <TableHeadCell>Mã hàng</TableHeadCell>
                <TableHeadCell>Thành phẩm</TableHeadCell>
                <TableHeadCell align="center">DK trả kho</TableHeadCell>
                <TableHeadCell align="center">SL cuộn</TableHeadCell>
                <TableHeadCell align="center">TL cuộn</TableHeadCell>
                <TableHeadCell align="center">ĐM nhựa</TableHeadCell>
                <TableHeadCell align="center">Tổng TL ĐM</TableHeadCell>
                <TableHeadCell align="center">Lõi 20cm</TableHeadCell>
                <TableHeadCell align="center">Lõi 30cm</TableHeadCell>
              </TableHead>
              <TableBody>
                {slip.products.map(line => (
                  <React.Fragment key={`${slip.id}-p-${line.stt}`}>
                    <TableRow>
                      <td className="px-3 py-2 font-black text-zinc-900">{line.productCode || '—'}</td>
                      <td className="px-3 py-2 text-zinc-800">{line.productName || '—'}</td>
                      <td className="px-3 py-2 text-center">{displayNum(line.plannedReturn)}</td>
                      <td className="px-3 py-2 text-center">{displayNum(line.quantity)}</td>
                      <td className="px-3 py-2 text-center">{displayNum(line.rollWeight)}</td>
                      <td className="px-3 py-2 text-center">{displayNum(line.resinNorm)}</td>
                      <td className="px-3 py-2 text-center font-bold">{displayNum(line.totalNormWeight)}</td>
                      <td className="px-3 py-2 text-center">{line.defect20 || '—'}</td>
                      <td className="px-3 py-2 text-center">{line.defect30 || '—'}</td>
                    </TableRow>
                  </React.Fragment>
                ))}
                {slip.products.length === 0 && <TableEmptyRow colSpan={9}>Chưa có thành phẩm.</TableEmptyRow>}
              </TableBody>
            </TableShell>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                III. Hàng lỗi / phế / sự cố
              </p>
              <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-[220px]">
                <TableHead>
                  <TableHeadCell>Tên lỗi / sự cố</TableHeadCell>
                  <TableHeadCell align="center">SL (kg)</TableHeadCell>
                </TableHead>
                <TableBody>
                  {slip.scraps.map(line => (
                    <React.Fragment key={`${slip.id}-s-${line.stt}`}>
                      <TableRow>
                        <td className="px-3 py-2 text-zinc-800">{line.name || '—'}</td>
                        <td className="px-3 py-2 text-center">{displayNum(line.quantity)}</td>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {slip.scraps.length === 0 && <TableEmptyRow colSpan={2}>Không có hàng lỗi.</TableEmptyRow>}
                </TableBody>
              </TableShell>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                III. Báo cáo SX cuối ca
              </p>
              <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-[220px]">
                <TableHead>
                  <TableHeadCell>Chỉ tiêu</TableHeadCell>
                  <TableHeadCell align="center">SL ĐM</TableHeadCell>
                  <TableHeadCell align="center">Thực tế</TableHeadCell>
                  <TableHeadCell align="center">Chênh lệch mức</TableHeadCell>
                </TableHead>
                <TableBody>
                  {slip.kpis.map(line => (
                    <React.Fragment key={`${slip.id}-k-${line.stt}`}>
                      <TableRow>
                        <td className="px-3 py-2 text-zinc-800">{line.criteria || '—'}</td>
                        <td className="px-3 py-2 text-center">{displayNum(line.norm)}</td>
                        <td className="px-3 py-2 text-center">{displayNum(line.actual)}</td>
                        <td className="px-3 py-2 text-center font-bold">{displayNum(line.variance)}</td>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {slip.kpis.length === 0 && <TableEmptyRow colSpan={4}>Chưa có chỉ tiêu.</TableEmptyRow>}
                </TableBody>
              </TableShell>
            </div>
          </div>

          {slip.note ? (
            <p className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
              Ghi chú: {slip.note}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={() => onPrint(slip)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
          >
            <Printer className="h-4 w-4" />
            In phiếu
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default function ShiftHandoverListView({
  onBack,
  onCreate,
  initialFilters
}: {
  onBack: () => void;
  onCreate?: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const { canCreate, canDelete } = useTabAccess('shift-handover-list');
  const [slips, setSlips] = useState<ShiftHandoverSlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterFromDate, setFilterFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || defaultFromDate()
  );
  const [filterToDate, setFilterToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [searchText, setSearchText] = useState('');
  const [filterShift, setFilterShift] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [deletingId, setDeletingId] = useState('');
  const [viewingSlip, setViewingSlip] = useState<ShiftHandoverSlip | null>(null);
  const [printSlips, setPrintSlips] = useState<ShiftHandoverPrintSlip[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (printSlips.length === 0) return;
    document.body.classList.add('shift-handover-print-active');
    return () => document.body.classList.remove('shift-handover-print-active');
  }, [printSlips]);

  const shiftOptions = useMemo<string[]>(() => {
    const shifts = slips.reduce<string[]>((result, slip) => {
      const shift = (slip.shift || '').trim();
      if (shift) result.push(shift);
      return result;
    }, []);
    return Array.from(new Set<string>(shifts)).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [slips]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredSlips = useMemo(() => {
    return slips.filter(slip => {
      const date = slip.date || '';
      if (filterFromDate && date && date < filterFromDate) return false;
      if (filterToDate && date && date > filterToDate) return false;
      if (filterShift && slip.shift?.trim() !== filterShift) return false;
      if (normalizedSearch) {
        const productText = slip.products.map(line => `${line.productCode} ${line.productName}`).join(' ');
        const haystack = `${slip.slipCode} ${slip.shift} ${machineLabel(slip)} ${slip.operators} ${productText}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }, [slips, filterFromDate, filterToDate, filterShift, normalizedSearch]);

  const hasActiveFilters = Boolean(filterShift) || Boolean(searchText);
  const resetFilters = () => {
    setFilterShift('');
    setSearchText('');
  };

  const dateGroups = useMemo((): DateGroup[] => {
    const map = new Map<string, ShiftHandoverSlip[]>();
    for (const slip of filteredSlips) {
      const key = slip.date || '-';
      const list = map.get(key) ?? [];
      list.push(slip);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([ngay, groupSlips]) => ({
        ngay,
        slips: [...groupSlips].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      }))
      .sort((a, b) => b.slips[0]?.createdAt.localeCompare(a.slips[0]?.createdAt ?? '') ?? 0);
  }, [filteredSlips]);

  const totalRolls = useMemo(
    () => filteredSlips.reduce((sum, slip) => sum + sumProductTotals(slip.products).quantity, 0),
    [filteredSlips]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await fetch('/api/phieu-giao-ca?limit=300');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải phiếu giao ca.');
        if (!cancelled) setSlips(normalizeShiftHandoverSlips(data));
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải phiếu giao ca.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  useEffect(() => {
    if (!pendingPrint || printSlips.length === 0) return;
    let cancelled = false;
    enableLandscapePrintPage('shift-handover-page-landscape');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disableLandscapePrintPage('shift-handover-page-landscape');
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disableLandscapePrintPage('shift-handover-page-landscape');
    };
  }, [pendingPrint, printSlips]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintSlips([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrintSlip = (slip: ShiftHandoverSlip) => {
    setError('');
    setMessage('');
    setPrintSlips([slipToPrintSlip(slip)]);
    setPendingPrint(true);
  };

  const handlePrintFiltered = () => {
    if (filteredSlips.length === 0) {
      setError('Không có phiếu nào để in.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setPrintSlips(filteredSlips.map(slipToPrintSlip));
    setPendingPrint(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa phiếu giao ca này?')) return;
    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/phieu-giao-ca/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa phiếu.');
      setSlips(prev => prev.filter(slip => slip.id !== id));
      if (viewingSlip?.id === id) setViewingSlip(null);
      setMessage('Đã xóa phiếu.');
    } catch (err: any) {
      setError(err.message || 'Không thể xóa phiếu.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {printSlips.length > 0 && typeof document !== 'undefined'
        ? createPortal(<ShiftHandoverPrintBatch slips={printSlips} />, document.body)
        : null}
      {viewingSlip ? (
        <ShiftHandoverDetailModal slip={viewingSlip} onClose={() => setViewingSlip(null)} onPrint={handlePrintSlip} />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img src={vietNhatLogoUrl} alt="Viet Nhat IPT" className="h-14 w-auto max-w-[190px] object-contain" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">Phiếu giao ca</p>
                <p className="mt-1 text-sm font-semibold text-zinc-500">
                  Nhật ký sản xuất kiêm phiếu giao ca (QT-16-BM02)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onCreate && canCreate ? (
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
            <ClipboardList className="h-4 w-4 text-[#ef1b2d]" />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">
              {dateGroups.length} ngày · {filteredSlips.length} phiếu · {displayNum(totalRolls)} cuộn
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setReloadTick(tick => tick + 1)}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Tải lại
            </button>
            <button
              type="button"
              onClick={handlePrintFiltered}
              disabled={filteredSlips.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              In danh sách
            </button>
          </div>
        </div>

        <div className="border-b border-zinc-100 bg-white px-4 py-3">
          <TableToolbar isLoading={isLoading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
            <TableSearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Tìm số phiếu, máy, người thực hiện, mã hàng..."
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

        {error ? (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="mx-4 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            {message}
          </div>
        ) : null}

        {isLoading ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            Chưa có phiếu giao ca trong khoảng ngày đã chọn.
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            {dateGroups.map(group => (
              <div key={group.ngay} className="overflow-hidden rounded-xl border border-zinc-200">
                <div className="flex items-baseline justify-between gap-1.5 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                    <span className="font-mono text-xs font-black text-zinc-900">{group.ngay}</span>
                  </div>
                  <span className="text-[11px] font-black text-zinc-600">{group.slips.length} phiếu</span>
                </div>
                <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-[520px]">
                  <TableHead>
                    <TableHeadCell>Số phiếu</TableHeadCell>
                    <TableHeadCell>Ca sản xuất</TableHeadCell>
                    <TableHeadCell>Máy</TableHeadCell>
                    <TableHeadCell>Người thực hiện</TableHeadCell>
                    <TableHeadCell align="center">Mã hàng</TableHeadCell>
                    <TableHeadCell align="center">SL cuộn</TableHeadCell>
                    <TableHeadCell align="center">Tổng TL ĐM</TableHeadCell>
                    <TableHeadCell align="center">Thao tác</TableHeadCell>
                  </TableHead>
                  <TableBody>
                    {group.slips.map(slip => {
                      const totals = sumProductTotals(slip.products);
                      return (
                        <React.Fragment key={slip.id}>
                          <TableRow>
                            <td className="px-3 py-2 font-black text-zinc-900">{slip.slipCode || '—'}</td>
                            <td className="px-3 py-2 font-semibold text-zinc-800">{shiftLabel(slip)}</td>
                            <td className="px-3 py-2 text-zinc-700">{machineLabel(slip)}</td>
                            <td className="px-3 py-2 text-zinc-700">{slip.operators || '—'}</td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-zinc-700">
                              {slip.products.length}
                            </td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-zinc-700">
                              {displayNum(totals.quantity)}
                            </td>
                            <td className="px-3 py-2 text-center font-mono font-bold text-zinc-700">
                              {displayNum(totals.totalNormWeight)}
                            </td>
                            <td className="px-3 py-2">
                              <RowActionsMenu label={`Thao tác phiếu ${slip.slipCode}`}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setViewingSlip(slip)}
                                    className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700 transition hover:bg-sky-100"
                                    title="Xem chi tiết"
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <Eye className="h-3.5 w-3.5" />
                                      Xem
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePrintSlip(slip)}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800 transition hover:bg-emerald-100"
                                    title="In phiếu"
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      <Printer className="h-3.5 w-3.5" />
                                      In
                                    </span>
                                  </button>
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(slip.id)}
                                      disabled={deletingId === slip.id}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      title="Xóa phiếu"
                                    >
                                      {deletingId === slip.id ? (
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
                    {group.slips.length === 0 && <TableEmptyRow colSpan={8}>Chưa có dữ liệu.</TableEmptyRow>}
                  </TableBody>
                </TableShell>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
