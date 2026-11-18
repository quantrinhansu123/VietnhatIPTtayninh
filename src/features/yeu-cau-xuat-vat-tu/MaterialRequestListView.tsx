import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Eye, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { formatNumber } from '../../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { useTabAccess } from '../../app/useTabAccess';
import { normalizeMachines, type MachineRow } from '../danh-sach-may';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../../utils/shiftSettings';
import { FilterCombobox, TableToolbar, TableDateFilter } from '../../components/shared/table';
import type { MixingReport } from '../../components/MixingReportForm';
import { normalizeMixingReport } from '../../lib/mixingReportModel';
import {
  buildMaterialRequestUpdateLinesKeepTron,
  splitMaterialRequestLinesByTron
} from './materialRequestTronSplit';

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
  onSaved,
  canEdit = false,
  shiftSettings = [],
  machines = []
}: {
  row: MaterialRequestRow;
  onClose: () => void;
  onEdit?: (row: MaterialRequestRow) => void;
  onSaved?: (row: MaterialRequestRow) => void;
  canEdit?: boolean;
  shiftSettings?: ShiftSetting[];
  machines?: MachineRow[];
}) {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  const locked = String(row.trang_thai || '').toLowerCase() === 'da_xuat';
  const showEdit = Boolean(onEdit && canEdit && !locked);
  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const [mixNgay, setMixNgay] = useState(() => String(row.ngay || '').trim().slice(0, 10));
  const [mixCa, setMixCa] = useState(() => String(row.ca || '').trim());
  const [mixMay, setMixMay] = useState(() => String(row.may || '').trim());
  const [mixingReports, setMixingReports] = useState<MixingReport[]>([]);
  const [mixingLoading, setMixingLoading] = useState(false);
  const [savingTable2, setSavingTable2] = useState(false);

  const machineSelectOptions = useMemo(() => {
    const set = new Set<string>();
    const rowMay = String(row.may || '').trim();
    if (rowMay) set.add(rowMay);
    if (mixMay) set.add(mixMay);
    for (const machine of machines) {
      const code = String(machine.code || '').trim();
      const name = String(machine.name || '').trim();
      if (code) set.add(code);
      else if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [machines, mixMay, row.may]);

  const caSelectOptions = useMemo(() => {
    const set = new Set<string>();
    if (mixCa) set.add(mixCa);
    const rowCa = String(row.ca || '').trim();
    if (rowCa) set.add(rowCa);
    for (const option of shiftOptions) {
      if (option.value) set.add(option.value);
    }
    return [...set];
  }, [mixCa, row.ca, shiftOptions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const ngay = String(mixNgay || '').trim().slice(0, 10);
    if (!ngay) {
      setMixingReports([]);
      return;
    }
    let cancelled = false;
    setMixingLoading(true);
    const params = new URLSearchParams({ dateFrom: ngay, dateTo: ngay });
    if (mixCa) params.set('ca', mixCa);
    void fetch(`/api/bao-cao-phoi-tron?${params.toString()}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error('Không tải được báo cáo phối trộn.');
        const reports = Array.isArray(data?.reports)
          ? data.reports.map((item: Record<string, unknown>) => normalizeMixingReport(item))
          : [];
        if (!cancelled) setMixingReports(reports);
      })
      .catch(() => {
        if (!cancelled) setMixingReports([]);
      })
      .finally(() => {
        if (!cancelled) setMixingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mixNgay, mixCa]);

  const split = useMemo(
    () =>
      splitMaterialRequestLinesByTron({
        lines,
        mixingReports,
        ngay: mixNgay,
        ca: mixCa,
        may: mixMay,
        shiftSettings
      }),
    [lines, mixingReports, mixNgay, mixCa, mixMay, shiftSettings]
  );

  const canUpdateChildQty =
    canEdit &&
    split.tronKg > 0 &&
    split.allocatedFromTron &&
    !split.alreadyApplied &&
    split.otherRows.some(row => row.daTronKg > 0);

  const handleUpdateChildQty = async () => {
    if (!canUpdateChildQty || savingTable2) return;
    const saveLines = buildMaterialRequestUpdateLinesKeepTron({
      tronSource: split.tronSource,
      otherRows: split.otherRows
    });
    if (!saveLines.length) {
      showSaveFailure(new Error('Không có dòng để cập nhật.'));
      return;
    }
    const ngay = String(mixNgay || row.ngay || '').trim().slice(0, 10) || String(row.ngay || '').trim().slice(0, 10);
    const ca = String(mixCa || row.ca || '').trim();
    const may = String(mixMay || row.may || '').trim();
    const nguoiYc = String(row.nguoi_yc || '').trim() || '—';
    if (!ngay || !ca || !may) {
      showSaveFailure(new Error('Chọn đủ ngày · ca · máy trước khi cập nhật.'));
      return;
    }
    const added = split.otherRows.reduce((sum, row) => sum + (row.daTronKg > 0 ? row.daTronKg : 0), 0);
    const ok = window.confirm(
      `Cập nhật khối lượng NVL con trên ${row.ma_yeu_cau}?\n` +
        `· Giữ NHUA-TRON ${formatNumber(split.tronKg, 3)} kg\n` +
        `· Cộng thêm ${formatNumber(added, 3)} kg vào các NVL tương ứng\n` +
        (locked ? '· Phiếu đã xuất — chỉ cập nhật số lượng dòng NVL\n' : '')
    );
    if (!ok) return;

    setSavingTable2(true);
    try {
      const res = await fetch(`/api/yeu-cau-xuat-kho/${encodeURIComponent(row.ma_yeu_cau)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay,
          ca,
          may,
          nguoi_yc: nguoiYc === '—' ? row.nguoi_yc || 'Hệ thống' : nguoiYc,
          lines: saveLines,
          cap_nhat_phan_bo_tron: true
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không cập nhật được khối lượng.'));
      const nextRow: MaterialRequestRow = {
        ...row,
        ngay,
        ca,
        may,
        lines: saveLines
      };
      showAppToast(`Đã cập nhật khối lượng NVL con · ${row.ma_yeu_cau}.`);
      onSaved?.(nextRow);
      onClose();
    } catch (err: unknown) {
      showSaveFailure(err, 'Không cập nhật được khối lượng.');
    } finally {
      setSavingTable2(false);
    }
  };

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
              Phiếu: {formatDisplayDate(String(row.ngay || ''))} · {row.ca || '—'} · {row.may || '—'}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-5">
          {split.tronKg > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-950">
                NHUA-TRON:{' '}
                <span className="font-mono font-black">{formatNumber(split.tronKg, 3)} kg</span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-amber-900/80">
                Chọn ngày · ca · máy để lấy tỉ lệ phối trộn, rồi chia {formatNumber(split.tronKg, 3)} kg xuống từng NVL.
              </p>
              <div className="mt-2.5 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900/70">
                  Ngày
                  <input
                    type="date"
                    value={mixNgay}
                    onChange={e => setMixNgay(e.target.value)}
                    className="h-8 rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900/70">
                  Ca
                  <select
                    value={mixCa}
                    onChange={e => setMixCa(e.target.value)}
                    className="h-8 min-w-[7rem] rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                  >
                    <option value="">— Ca —</option>
                    {caSelectOptions.map(ca => (
                      <option key={ca} value={ca}>
                        {ca}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900/70">
                  Máy
                  <select
                    value={mixMay}
                    onChange={e => setMixMay(e.target.value)}
                    className="h-8 min-w-[7rem] rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                  >
                    <option value="">— Máy —</option>
                    {machineSelectOptions.map(may => (
                      <option key={may} value={may}>
                        {may}
                      </option>
                    ))}
                  </select>
                </label>
                {mixingLoading ? (
                  <span className="pb-1.5 text-[11px] font-semibold text-zinc-500">
                    <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                    Đang tải tỉ lệ…
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {split.tronKg > 0 ? (
            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <div className="border-b border-zinc-200 bg-[#e8f0ed] px-3 py-2.5">
                <p className="text-xs font-bold text-zinc-900">
                  Bảng 1 · Ảo — phân bổ TRON theo tỉ lệ
                  {split.mixingRows.length > 0 ? (
                    <span className="ml-1.5 text-[11px] font-semibold text-zinc-500">
                      ({split.mixingRows.length})
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-zinc-600">
                  {split.allocatedFromTron
                    ? `Chỉ xem · Kg = ${formatNumber(split.tronKg, 3)} × % · sẽ cộng vào Bảng 2`
                    : 'Chưa có tỉ lệ khớp ngày · ca · máy đã chọn.'}
                </p>
              </div>
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2.5">STT</th>
                    <th className="px-3 py-2.5">Mã NVL</th>
                    <th className="px-3 py-2.5">Tên NVL</th>
                    <th className="px-3 py-2.5 text-right">Tỉ lệ %</th>
                    <th className="px-3 py-2.5 text-right">Kg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {split.mixingRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center font-semibold text-zinc-400">
                        Chưa phân bổ được — chọn lại ngày · ca · máy.
                      </td>
                    </tr>
                  ) : (
                    split.mixingRows.map((line, index) => (
                      <tr key={line.key}>
                        <td className="px-3 py-2 font-mono font-bold text-[#ef1b2d]">{index + 1}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-zinc-800">
                          {line.ma_nvl || '—'}
                        </td>
                        <td className="px-3 py-2 font-semibold text-zinc-700">{line.ten_nvl || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-700">
                          {line.tiLePercent != null ? formatNumber(line.tiLePercent, 2) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                          {formatNumber(line.daTronKg, 3)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {split.mixingRows.length > 0 ? (
                  <tfoot className="border-t border-zinc-200 bg-zinc-50">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-[11px] font-bold text-zinc-600">
                        Tổng phân bổ
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-black text-zinc-900">
                        {formatNumber(
                          split.mixingRows.reduce((sum, r) => sum + r.daTronKg, 0),
                          3
                        )}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 bg-[#e8f0ed] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-900">
                  Bảng 2 · Thật — phiếu + cộng phân bổ TRON
                  {split.otherRows.length > 0 ? (
                    <span className="ml-1.5 text-[11px] font-semibold text-zinc-500">
                      ({split.otherRows.length})
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-zinc-600">
                  {split.alreadyApplied
                    ? 'Đã cộng TRON vào NVL con trên DB · giữ nguyên dòng NHUA-TRON'
                    : 'SL lưu = SL phiếu + kg Bảng 1 · Giữ NHUA-TRON · Bấm Cập nhật để ghi DB'}
                </p>
              </div>
              {canUpdateChildQty ? (
                <button
                  type="button"
                  onClick={() => void handleUpdateChildQty()}
                  disabled={savingTable2}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  {savingTable2 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Cập nhật khối lượng NVL con
                </button>
              ) : split.alreadyApplied ? (
                <span className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-[11px] font-bold text-zinc-600">
                  Đã cập nhật khối lượng
                </span>
              ) : null}
            </div>
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5">STT</th>
                  <th className="px-3 py-2.5">Mã NVL</th>
                  <th className="px-3 py-2.5">Tên NVL</th>
                  <th className="px-3 py-2.5">ĐVT</th>
                  <th className="px-3 py-2.5 text-right">SL phiếu</th>
                  <th className="px-3 py-2.5 text-right">+ TRON</th>
                  <th className="px-3 py-2.5 text-right">SL lưu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {split.otherRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center font-semibold text-zinc-400">
                      Không có NVL.
                    </td>
                  </tr>
                ) : (
                  split.otherRows.map((line, index) => (
                    <tr key={line.key}>
                      <td className="px-3 py-2 font-mono font-bold text-[#ef1b2d]">{index + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-zinc-800">
                        {line.ma_nvl || '—'}
                      </td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">{line.ten_nvl || '—'}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.don_vi || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-600">
                        {line.so_luongPhieu > 0 ? formatNumber(line.so_luongPhieu, 3) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-amber-800">
                        {line.daTronKg > 0 ? `+${formatNumber(line.daTronKg, 3)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-zinc-900">
                        {formatNumber(line.so_luong, 3)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {split.otherRows.length > 0 ? (
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right text-[11px] font-bold text-zinc-600">
                      Tổng SL lưu
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-black text-zinc-900">
                      {formatNumber(
                        split.otherRows.reduce((sum, r) => sum + r.so_luong, 0),
                        3
                      )}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {lines.length === 0 ? (
            <p className="text-center text-sm font-semibold text-zinc-400">Không có dòng NVL.</p>
          ) : null}
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
  initialFilters,
  hideLocalFilters = false
}: {
  onBack?: () => void;
  onCreate?: () => void;
  onEdit?: (row: MaterialRequestRow) => void;
  initialFilters?: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    machineCode?: string;
  };
  hideLocalFilters?: boolean;
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
  const [machines, setMachines] = useState<MachineRow[]>([]);
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
    void fetch('/api/danh-sach-may')
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMachines(normalizeMachines(data));
      })
      .catch(() => { /* Keep exact matching available if the catalog cannot load. */ });
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
        const selected = machines.find(machine => machine.code.trim().toLowerCase() === key);
        const name = selected?.name.trim().toLowerCase();
        if (may !== key && (!name || may !== name)) return false;
      }
      if (statusFilter !== 'all') {
        const status = String(row.trang_thai || 'cho_xu_ly').toLowerCase();
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [rows, filterFromDate, filterToDate, filterCa, filterMachine, statusFilter, shiftOptions, machines]);

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
          onSaved={next => {
            setRows(prev =>
              prev.map(item => (item.ma_yeu_cau === next.ma_yeu_cau ? { ...item, ...next } : item))
            );
            setViewingRow(null);
          }}
          canEdit={canEdit}
          shiftSettings={shiftSettings}
          machines={machines}
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

      {!hideLocalFilters ? (
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
      ) : null}

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
