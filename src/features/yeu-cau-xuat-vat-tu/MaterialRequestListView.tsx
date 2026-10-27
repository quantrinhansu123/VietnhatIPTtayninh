import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Eye, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { formatNumber } from '../../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { useTabAccess } from '../../app/useTabAccess';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../../utils/shiftSettings';
import { FilterCombobox, TableToolbar, TableDateFilter } from '../../components/shared/table';

export type MaterialRequestLine = {
  ma_nvl?: string;
  ten_nvl?: string;
  don_vi?: string;
  so_luong?: number | null;
};

export type MaterialRequestRow = {
  ma_yeu_cau: string;
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  nguoi_yc?: string | null;
  trang_thai?: string | null;
  ma_phieu_xuat?: string | null;
  created_at?: string | null;
  lines?: MaterialRequestLine[];
};

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function rowDateKey(ngay: string | null | undefined) {
  const match = String(ngay || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDisplayDate(iso: string) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function statusLabel(status: string | null | undefined) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'da_xuat') return 'Đã xuất';
  if (raw === 'cho_xu_ly' || !raw) return 'Chờ xử lý';
  return status || '—';
}

function statusClass(status: string | null | undefined) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'da_xuat') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
}

function MaterialRequestDetailModal({
  row,
  onClose,
  onEdit,
  canEdit = false
}: {
  row: MaterialRequestRow;
  onClose: () => void;
  onEdit?: (row: MaterialRequestRow) => void;
  canEdit?: boolean;
}) {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const locked = String(row.trang_thai || '').toLowerCase() === 'da_xuat';
  const showEdit = Boolean(onEdit && canEdit && !locked);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const modal = (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/45 p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">Chi tiết phiếu nhận NVL</p>
            <h3 className="mt-0.5 truncate font-mono text-base font-black text-zinc-900 sm:text-lg">
              {row.ma_yeu_cau || '—'}
            </h3>
            <p className="mt-1 text-[11px] font-semibold text-zinc-500">
              {formatDisplayDate(String(row.ngay || ''))} · {row.ca || '—'} · {row.may || '—'}
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

        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2.5 sm:px-5">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${statusClass(row.trang_thai)}`}
          >
            {statusLabel(row.trang_thai)}
          </span>
          <span className="text-[11px] font-semibold text-zinc-500">
            Người YC: <span className="font-bold text-zinc-800">{row.nguoi_yc || '—'}</span>
          </span>
          {row.ma_phieu_xuat ? (
            <span className="text-[11px] font-semibold text-zinc-500">
              Phiếu xuất: <span className="font-mono font-bold text-zinc-800">{row.ma_phieu_xuat}</span>
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {showEdit ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit?.(row);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-bold text-sky-800 transition hover:bg-sky-100"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              Đóng
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Mã NVL</th>
                  <th className="px-3 py-2.5">Tên NVL</th>
                  <th className="px-3 py-2.5">ĐVT</th>
                  <th className="px-3 py-2.5 text-right">SL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center font-semibold text-zinc-400">
                      Không có dòng NVL.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => (
                    <tr key={`${row.ma_yeu_cau}-${line.ma_nvl}-${index}`}>
                      <td className="px-3 py-2 font-mono font-bold text-[#ef1b2d]">{index + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-zinc-800">{line.ma_nvl || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">{line.ten_nvl || '—'}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.don_vi || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-zinc-800">
                        {line.so_luong != null && Number.isFinite(Number(line.so_luong))
                          ? formatNumber(Number(line.so_luong), 3)
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}

export function MaterialRequestListView({
  onBack,
  onCreate,
  onEdit,
  initialFilters
}: {
  onBack?: () => void;
  onCreate?: () => void;
  onEdit?: (row: MaterialRequestRow) => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    machineCode?: string;
  };
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('machine-nvl-report-list');
  const [rows, setRows] = useState<MaterialRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'cho_xu_ly' | 'da_xuat'>('all');
  const [filterFromDate, setFilterFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || todayIso()
  );
  const [filterToDate, setFilterToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [filterCa, setFilterCa] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [filterMachine, setFilterMachine] = useState(() => {
    const machine = initialFilters?.machineCode?.trim() || '';
    return !machine || machine === 'all' ? '' : machine;
  });
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewingRow, setViewingRow] = useState<MaterialRequestRow | null>(null);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const load = useCallback(async (tuNgay = filterFromDate, denNgay = filterToDate) => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (tuNgay) params.set('tu_ngay', tuNgay);
      if (denNgay) params.set('den_ngay', denNgay);
      const query = params.toString();
      const res = await fetch(`/api/yeu-cau-xuat-kho${query ? `?${query}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được phiếu nhận NVL.'));
      const list = Array.isArray(data?.requests) ? data.requests : Array.isArray(data) ? data : [];
      setRows(list as MaterialRequestRow[]);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Không tải được phiếu nhận NVL.');
    } finally {
      setIsLoading(false);
    }
  }, [filterFromDate, filterToDate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settingsRes = await fetch('/api/cai-dat');
        const settingsData = await settingsRes.json().catch(() => ({}));
        if (!cancelled && settingsRes.ok) {
          setShiftSettings(normalizeShiftSettings(settingsData));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void load(filterFromDate, filterToDate);
  }, [load, filterFromDate, filterToDate]);

  const machineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const may = String(row.may || '').trim();
      if (may) set.add(may);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [rows]);

  const caOptions = useMemo(() => {
    if (shiftOptions.length > 0) return shiftOptions.map(option => option.value);
    const set = new Set<string>();
    for (const row of rows) {
      const ca = String(row.ca || '').trim();
      if (ca) set.add(ca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [rows, shiftOptions]);

  const filtered = useMemo(() => {
    return rows.filter(row => {
      const date = rowDateKey(row.ngay);
      if (filterFromDate && date && date < filterFromDate) return false;
      if (filterToDate && date && date > filterToDate) return false;
      if (filterCa && !shiftNamesMatch(filterCa, String(row.ca || ''), shiftOptions)) {
        const ca = String(row.ca || '').trim();
        if (ca !== filterCa) return false;
      }
      if (filterMachine) {
        const key = filterMachine.trim().toLowerCase();
        const may = String(row.may || '').trim().toLowerCase();
        if (may !== key && !may.includes(key)) return false;
      }
      if (statusFilter !== 'all') {
        const status = String(row.trang_thai || 'cho_xu_ly').toLowerCase();
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, filterFromDate, filterToDate, filterCa, filterMachine, statusFilter, shiftOptions]);

  const hasActiveFilters = Boolean(filterCa || filterMachine || statusFilter !== 'all');

  const resetFilters = () => {
    setFilterCa('');
    setFilterMachine('');
    setStatusFilter('all');
  };

  const handleDelete = async (code: string) => {
    if (!canDelete) return;
    const ok = window.confirm(`Xóa phiếu nhận NVL ${code}?`);
    if (!ok) return;
    setDeletingCode(code);
    try {
      const res = await fetch(`/api/yeu-cau-xuat-kho/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được phiếu.'));
      showAppToast(`Đã xóa ${code}.`);
      setRows(prev => prev.filter(row => row.ma_yeu_cau !== code));
      if (expanded === code) setExpanded(null);
    } catch (err: unknown) {
      showSaveFailure(err, 'Không xóa được phiếu.');
    } finally {
      setDeletingCode(null);
    }
  };

  return (
    <div className="space-y-3">
      {viewingRow ? (
        <MaterialRequestDetailModal
          row={viewingRow}
          onClose={() => setViewingRow(null)}
          onEdit={onEdit}
          canEdit={canEdit}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">Danh sách</p>
          <h2 className="text-base font-black text-zinc-900">Phiếu nhận NVL về máy</h2>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            Yêu cầu xuất vật tư (`yeu_cau_xuat_kho`) · {filtered.length}/{rows.length} phiếu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Làm mới
          </button>
          {onCreate && canCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm mới
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Quay lại
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <TableToolbar isLoading={isLoading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
          <TableDateFilter label="Từ ngày" value={filterFromDate} onChange={setFilterFromDate} />
          <TableDateFilter label="Đến ngày" value={filterToDate} onChange={setFilterToDate} />
          <FilterCombobox
            label="Ca"
            options={caOptions}
            value={filterCa || 'all'}
            onChange={value => setFilterCa(value === 'all' ? '' : value)}
            formatOption={value => shiftOptions.find(option => option.value === value)?.label || value}
            searchPlaceholder="Tìm ca..."
            compact
          />
          <FilterCombobox
            label="Máy"
            options={machineOptions}
            value={filterMachine || 'all'}
            onChange={value => setFilterMachine(value === 'all' ? '' : value)}
            searchPlaceholder="Tìm máy..."
            compact
          />
          <label className="flex min-w-[8.5rem] flex-col gap-0.5 text-[9px] font-black uppercase tracking-wider text-zinc-500">
            Trạng thái
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-zinc-700 outline-none focus:border-[#ef1b2d]"
            >
              <option value="all">Tất cả</option>
              <option value="cho_xu_ly">Chờ xử lý</option>
              <option value="da_xuat">Đã xuất</option>
            </select>
          </label>
        </TableToolbar>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2.5">Mã phiếu</th>
                <th className="px-3 py-2.5">Ngày</th>
                <th className="px-3 py-2.5">Ca</th>
                <th className="px-3 py-2.5">Máy</th>
                <th className="px-3 py-2.5">Người YC</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5 text-right">Số dòng</th>
                <th className="px-3 py-2.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-semibold text-zinc-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang tải...
                    </span>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-semibold text-zinc-400">
                    Không có phiếu nhận NVL theo bộ lọc.
                  </td>
                </tr>
              ) : (
                filtered.map(row => {
                  const code = String(row.ma_yeu_cau || '');
                  const lines = Array.isArray(row.lines) ? row.lines : [];
                  const open = expanded === code;
                  return (
                    <React.Fragment key={code}>
                      <tr
                        className="cursor-pointer hover:bg-zinc-50/80"
                        onClick={() => setExpanded(open ? null : code)}
                      >
                        <td className="px-3 py-2.5 font-mono font-bold text-[#ef1b2d]">{code || '—'}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-zinc-800">
                          {formatDisplayDate(String(row.ngay || ''))}
                        </td>
                        <td className="px-3 py-2.5 font-bold text-zinc-800">{row.ca || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-700">{row.may || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-zinc-700">{row.nguoi_yc || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${statusClass(row.trang_thai)}`}
                          >
                            {statusLabel(row.trang_thai)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-800">{lines.length}</td>
                        <td className="px-3 py-2.5 text-right" onClick={event => event.stopPropagation()}>
                          {(() => {
                            const locked = String(row.trang_thai || '').toLowerCase() === 'da_xuat';
                            const showEdit = Boolean(onEdit && canEdit && !locked);
                            const showDelete = Boolean(canDelete && !locked);
                            return (
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setViewingRow(row)}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50"
                                  title="Xem chi tiết"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Xem
                                </button>
                                {showEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => onEdit?.(row)}
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[11px] font-bold text-sky-800 transition hover:bg-sky-100"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Sửa
                                  </button>
                                ) : null}
                                {showDelete ? (
                                  <button
                                    type="button"
                                    disabled={deletingCode === code}
                                    onClick={() => void handleDelete(code)}
                                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                                  >
                                    {deletingCode === code ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                    Xóa
                                  </button>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-zinc-50/70">
                          <td colSpan={8} className="px-3 py-3">
                            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                              <table className="min-w-full text-left text-[11px]">
                                <thead className="bg-zinc-100 text-[9px] font-black uppercase tracking-wider text-zinc-500">
                                  <tr>
                                    <th className="px-2.5 py-2">STT</th>
                                    <th className="px-2.5 py-2">Mã NVL</th>
                                    <th className="px-2.5 py-2">Tên NVL</th>
                                    <th className="px-2.5 py-2">ĐVT</th>
                                    <th className="px-2.5 py-2 text-right">SL</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                  {lines.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-2.5 py-4 text-center font-semibold text-zinc-400">
                                        Không có dòng NVL.
                                      </td>
                                    </tr>
                                  ) : (
                                    lines.map((line, index) => (
                                      <tr key={`${code}-${line.ma_nvl}-${index}`}>
                                        <td className="px-2.5 py-1.5 font-mono font-bold text-[#ef1b2d]">
                                          {index + 1}
                                        </td>
                                        <td className="px-2.5 py-1.5 font-mono font-semibold text-zinc-800">
                                          {line.ma_nvl || '—'}
                                        </td>
                                        <td className="px-2.5 py-1.5 font-semibold text-zinc-700">
                                          {line.ten_nvl || '—'}
                                        </td>
                                        <td className="px-2.5 py-1.5 text-zinc-600">{line.don_vi || '—'}</td>
                                        <td className="px-2.5 py-1.5 text-right font-mono font-bold text-zinc-800">
                                          {line.so_luong != null && Number.isFinite(Number(line.so_luong))
                                            ? formatNumber(Number(line.so_luong), 3)
                                            : '—'}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {row.ma_phieu_xuat ? (
                              <p className="mt-2 text-[11px] font-semibold text-zinc-500">
                                Phiếu xuất kho:{' '}
                                <span className="font-mono font-bold text-zinc-800">{row.ma_phieu_xuat}</span>
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MaterialRequestListView;
