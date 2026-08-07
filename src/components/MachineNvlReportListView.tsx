import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, ChevronLeft, Eye, Loader2, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTabAccess } from '../app/useTabAccess';
import { formatNumber } from '../utils';
import { waitForPrintImagesReady } from '../utils/printReady';
import {
  buildMachineNvlReportGroups,
  MACHINE_NVL_MATERIAL_TYPE_OPTIONS,
  normalizeMachineNvlReports,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlCuoiCaReportTotal,
  sumMachineNvlDauCaLineTotal,
  sumMachineNvlDauCaReportTotal,
  type MachineNvlReportDateGroup,
  type MachineNvlReportKind,
  type MachineNvlSavedLine,
  type MachineNvlSavedReport
} from '../utils/machineNvlReports';
import {
  MachineNvlPrintBatch,
  savedReportToMachineNvlPrintReport,
  type MachineNvlPrintReport
} from './MachineNvlPrintSheet';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
import { formatWeighingWeightField } from '../utils/weighingRecords';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  RowActionsMenu
} from './shared/table';

const MACHINE_NVL_SECTIONS: { id: MachineNvlReportKind; title: string; emptyLabel: string }[] = [
  { id: 'dau_ca', title: 'Báo cáo tồn đầu ca', emptyLabel: 'báo cáo tồn đầu ca' },
  { id: 'cuoi_ca', title: 'Báo cáo tồn cuối ca', emptyLabel: 'báo cáo tồn cuối ca' }
];

const inputClass =
  'h-8 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 sm:h-9 sm:text-xs';

const actionBtnClass =
  'inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function reportTotal(report: MachineNvlSavedReport) {
  return report.reportKind === 'dau_ca'
    ? sumMachineNvlDauCaReportTotal(report)
    : sumMachineNvlCuoiCaReportTotal(report);
}

function lineQtyTotal(line: MachineNvlSavedLine, isDauCa: boolean) {
  return isDauCa ? sumMachineNvlDauCaLineTotal(line) : sumMachineNvlCuoiCaLineTotal(line);
}

function materialTypeLabel(value: MachineNvlSavedLine['loaiVatTu']) {
  if (!value) return '—';
  return MACHINE_NVL_MATERIAL_TYPE_OPTIONS.find(option => option.value === value)?.label ?? value;
}

function formatQty(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatNumber(value, 3);
}

function MachineNvlReportDetailModal({
  report,
  onClose,
  onEdit,
  onPrint,
  canEdit = false
}: {
  report: MachineNvlSavedReport;
  onClose: () => void;
  onEdit: (report: MachineNvlSavedReport) => void;
  onPrint: (report: MachineNvlSavedReport) => void;
  canEdit?: boolean;
}) {
  const isDauCa = report.reportKind === 'dau_ca';
  const totalKg = reportTotal(report);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const modal = (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">
              {isDauCa ? 'Chi tiết tồn đầu ca' : 'Chi tiết tồn cuối ca'}
            </p>
            <h3 className="mt-0.5 truncate text-base font-black text-zinc-900 sm:text-lg">
              {report.tenMay || report.maMay || 'Máy'} · {report.ca || '—'}
            </h3>
            <p className="mt-1 font-mono text-[11px] font-semibold text-zinc-500">
              {report.ngay}
              {report.gio ? ` · ${report.gio}` : ''}
              {report.nhanSu ? ` · ${report.nhanSu}` : ''}
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

        <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 bg-white px-4 py-3 sm:grid-cols-4 sm:px-5">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-zinc-800">{report.ngay || '—'}</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ca</p>
            <p className="mt-0.5 text-sm font-bold text-zinc-800">{report.ca || '—'}</p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Số dòng NVL</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-zinc-800">{report.lines.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng (kg)</p>
            <p className="mt-0.5 font-mono text-sm font-black text-emerald-800">{formatNumber(totalKg, 3)}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-5">
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11px] sm:text-xs">
              <thead className="sticky top-0 bg-zinc-900 text-[9px] uppercase tracking-wider text-white sm:text-[10px]">
                <tr>
                  <th className="px-2.5 py-2.5 font-black">STT</th>
                  <th className="px-2.5 py-2.5 font-black">Mã NVL</th>
                  <th className="px-2.5 py-2.5 font-black">Tên NVL</th>
                  <th className="px-2.5 py-2.5 font-black">ĐVT</th>
                  <th className="px-2.5 py-2.5 font-black">Loại</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Tồn máy</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Tồn bồn</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Chưa trộn</th>
                  <th className="px-2.5 py-2.5 text-right font-black">Tồn ngoài</th>
                  <th className="px-2.5 py-2.5 text-right font-black">SL tồn</th>
                  <th className="px-2.5 py-2.5 text-right font-black">KL (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {report.lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center font-semibold text-zinc-400">
                      Không có dòng NVL.
                    </td>
                  </tr>
                ) : (
                  report.lines.map((line, index) => (
                    <tr key={`${line.stt}-${line.maNvl}-${index}`} className="hover:bg-zinc-50/80">
                      <td className="px-2.5 py-2 font-mono font-bold text-[#ef1b2d]">{line.stt || index + 1}</td>
                      <td className="px-2.5 py-2 font-mono font-semibold text-zinc-800">{line.maNvl || '—'}</td>
                      <td className="px-2.5 py-2 font-semibold text-zinc-700">{line.tenNvl || '—'}</td>
                      <td className="px-2.5 py-2 text-zinc-600">{line.donVi || '—'}</td>
                      <td className="px-2.5 py-2 text-zinc-600">{materialTypeLabel(line.loaiVatTu)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-zinc-700">{formatQty(line.soLuongTrongMay)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-zinc-700">{formatQty(line.soLuongTrongBonTron)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-zinc-700">{formatQty(line.soLuongNlChuaTron)}</td>
                      <td className="px-2.5 py-2 text-right font-mono text-zinc-700">{formatQty(line.soLuongTonNgoai)}</td>
                      <td className="px-2.5 py-2 text-right font-mono font-bold text-zinc-800">{formatQty(line.soLuongTon)}</td>
                      <td className="px-2.5 py-2 text-right font-mono font-black text-emerald-800">
                        {formatNumber(lineQtyTotal(line, isDauCa), 3)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {report.lines.length > 0 ? (
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td colSpan={10} className="px-2.5 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      Tổng khối lượng
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-sm font-black text-emerald-800">
                      {formatNumber(totalKg, 3)} kg
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {report.note ? (
            <p className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
              <span className="font-black uppercase tracking-wider text-zinc-400">Ghi chú: </span>
              {report.note}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => onPrint(report)}
            className={`${actionBtnClass} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100`}
          >
            <Printer className="h-3.5 w-3.5" />
            In phiếu
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                onEdit(report);
                onClose();
              }}
              className={`${actionBtnClass} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
            >
              <Pencil className="h-3.5 w-3.5" />
              Sửa
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`${actionBtnClass} border-zinc-300 bg-zinc-900 text-white hover:bg-zinc-800`}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}

function MachineNvlSection({
  kind,
  title,
  emptyLabel,
  groups,
  isLoading,
  onView,
  onEdit,
  onPrint,
  onDelete,
  deletingId,
  selectedIds,
  onToggleSelected,
  onToggleSelectAll,
  onBulkDelete,
  onClearSelection,
  bulkDeleting,
  canEdit = false,
  canDelete = false
}: {
  kind: MachineNvlReportKind;
  title: string;
  emptyLabel: string;
  groups: MachineNvlReportDateGroup[];
  isLoading: boolean;
  onView: (report: MachineNvlSavedReport) => void;
  onEdit: (report: MachineNvlSavedReport) => void;
  onPrint: (report: MachineNvlSavedReport) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  onClearSelection: () => void;
  bulkDeleting: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const reportIds = useMemo(
    () =>
      groups.flatMap(dateGroup =>
        dateGroup.shifts.flatMap(shiftGroup =>
          shiftGroup.machines.flatMap(machineGroup => machineGroup.reports.map(report => report.id).filter(Boolean))
        )
      ),
    [groups]
  );
  const allSelected = reportIds.length > 0 && selectedIds.size === reportIds.length;
  const selectedOnPage = reportIds.filter(id => selectedIds.has(id)).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-50 via-white to-white px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">{title}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              {reportIds.length} phiếu · đã chọn {selectedOnPage}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {canDelete ? (
              <button
                type="button"
                onClick={() => onBulkDelete([...selectedIds])}
                disabled={selectedIds.size === 0 || bulkDeleting || isLoading}
                className={`${actionBtnClass} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
              >
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Xoá đã chọn ({selectedIds.size})
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClearSelection}
              disabled={selectedIds.size === 0 || bulkDeleting || isLoading}
              className={`${actionBtnClass} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`}
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      </div>
      <div className="p-2 sm:p-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-[#ef1b2d]" />
            Đang tải danh sách {emptyLabel}...
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center">
            <Boxes className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-2 text-sm font-black text-zinc-700">Chưa có {emptyLabel}</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">Chọn khoảng ngày khác hoặc tạo báo cáo mới.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(dateGroup => {
              const dateRows = dateGroup.shifts.flatMap(shiftGroup =>
                shiftGroup.machines.flatMap(machineGroup =>
                  machineGroup.reports.map(report => ({ shiftGroup, machineGroup, report }))
                )
              );
              const dateTotal = dateRows.reduce((sum, { report }) => sum + reportTotal(report), 0);

              return (
                <div key={dateGroup.ngay} className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 sm:px-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</span>
                      <span className="font-mono text-sm font-black text-zinc-900">{dateGroup.ngay}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 ring-1 ring-zinc-200">
                        {dateRows.length} phiếu
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng ngày</p>
                      <p className="font-mono text-sm font-black text-emerald-800">{formatNumber(dateTotal, 3)} kg</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] border-collapse text-left text-[11px] sm:text-xs">
                      <thead className="bg-zinc-950 text-[9px] uppercase tracking-wider text-white sm:text-[10px]">
                        <tr className="border-b border-zinc-200">
                          <th className="w-11 px-3 py-2.5 text-center font-black">
                            {canDelete ? (
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => onToggleSelectAll(reportIds)}
                                aria-label="Chọn tất cả"
                                className="h-4 w-4 accent-[#ef1b2d]"
                              />
                            ) : null}
                          </th>
                          <th className="px-3 py-2.5 font-black">Ca</th>
                          <th className="px-3 py-2.5 font-black">Máy</th>
                          <th className="px-3 py-2.5 font-black">Nhân sự</th>
                          <th className="px-3 py-2.5 font-black">Giờ</th>
                          <th className="px-3 py-2.5 text-right font-black">Số NVL</th>
                          <th className="px-3 py-2.5 text-right font-black">Tổng (kg)</th>
                          <th className="px-3 py-2.5 font-black">Ghi chú</th>
                          <th className="px-3 py-2.5 text-center font-black">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {dateRows.map(({ shiftGroup, machineGroup, report }) => (
                          <tr
                            key={report.id || `${report.ngay}-${report.maMay}-${report.ca}`}
                            className="align-middle transition hover:bg-red-50/20"
                          >
                            <td className="px-3 py-2.5 text-center">
                              {canDelete ? (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(report.id)}
                                  onChange={() => onToggleSelected(report.id)}
                                  aria-label="Chọn dòng"
                                  className="h-4 w-4 accent-[#ef1b2d]"
                                />
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-black text-zinc-800">
                                {shiftGroup.ca || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-bold text-zinc-800">{machineGroup.tenMay || machineGroup.maMay || '—'}</p>
                              {machineGroup.maMay && machineGroup.tenMay ? (
                                <p className="mt-0.5 font-mono text-[10px] text-zinc-400">{machineGroup.maMay}</p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-zinc-600">{report.nhanSu || '—'}</td>
                            <td className="px-3 py-2.5 font-mono text-zinc-500">{report.gio || '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-700">{report.lines.length}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-emerald-800">
                              {formatNumber(reportTotal(report), 3)}
                            </td>
                            <td className="max-w-[180px] px-3 py-2.5">
                              <span className="block truncate text-zinc-500" title={report.note || undefined}>
                                {report.note || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <RowActionsMenu label={`Thao tác báo cáo ${report.maMay || report.tenMay}`}>
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onView(report)}
                                  className={`${actionBtnClass} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}
                                  title="Xem chi tiết"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Xem
                                </button>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => onEdit(report)}
                                    className={`${actionBtnClass} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
                                    title="Sửa báo cáo"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Sửa
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => onPrint(report)}
                                  className={`${actionBtnClass} border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`}
                                  title="In phiếu"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  In
                                </button>
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => onDelete(report.id)}
                                    disabled={deletingId === report.id}
                                    className={`${actionBtnClass} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                                    title="Xóa báo cáo"
                                  >
                                    {deletingId === report.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                    Xoá
                                  </button>
                                ) : null}
                              </div>
                              </RowActionsMenu>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export default function MachineNvlReportListView({
  onBack,
  onCreate,
  onEdit
}: {
  onBack: () => void;
  onCreate: () => void;
  onEdit: (report: MachineNvlSavedReport) => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('machine-nvl-report-list');
  const [filterFromDate, setFilterFromDate] = useState(todayIso());
  const [filterToDate, setFilterToDate] = useState(todayIso());
  const [filterCa, setFilterCa] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [searchText, setSearchText] = useState('');
  const [dauCaReports, setDauCaReports] = useState<MachineNvlSavedReport[]>([]);
  const [cuoiCaReports, setCuoiCaReports] = useState<MachineNvlSavedReport[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedDauCaIds, setSelectedDauCaIds] = useState<Set<string>>(() => new Set());
  const [selectedCuoiCaIds, setSelectedCuoiCaIds] = useState<Set<string>>(() => new Set());
  const [printReport, setPrintReport] = useState<MachineNvlPrintReport | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [viewingReport, setViewingReport] = useState<MachineNvlSavedReport | null>(null);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const shiftOrder = (ca: string) => {
    const index = shiftOptions.findIndex(
      option => option.value === ca || shiftNamesMatch(option.value, ca) || shiftNamesMatch(option.label, ca)
    );
    return index >= 0 ? index : 999;
  };

  const filterMachineNvlReports = (reports: MachineNvlSavedReport[]) =>
    reports.filter(report => {
      if (filterCa && !shiftNamesMatch(filterCa, report.ca)) return false;
      if (filterMachine) {
        const key = filterMachine.trim().toLowerCase();
        const maMay = report.maMay.trim().toLowerCase();
        const tenMay = report.tenMay.trim().toLowerCase();
        if (maMay !== key && tenMay !== key && !tenMay.includes(key) && !maMay.includes(key)) return false;
      }
      const query = searchText.trim().toLowerCase();
      if (query) {
        const haystack = `${report.maMay} ${report.tenMay} ${report.ca} ${report.nhanSu} ${report.note} ${report.lines
          .map(line => `${line.maNvl} ${line.tenNvl}`)
          .join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

  const filteredDauCaReports = useMemo(
    () => filterMachineNvlReports(dauCaReports),
    [dauCaReports, filterCa, filterMachine, searchText]
  );
  const filteredCuoiCaReports = useMemo(
    () => filterMachineNvlReports(cuoiCaReports),
    [cuoiCaReports, filterCa, filterMachine, searchText]
  );

  const dauCaGroups = useMemo(
    () => buildMachineNvlReportGroups(filteredDauCaReports, shiftOrder),
    [filteredDauCaReports, shiftOptions]
  );
  const cuoiCaGroups = useMemo(
    () => buildMachineNvlReportGroups(filteredCuoiCaReports, shiftOrder),
    [filteredCuoiCaReports, shiftOptions]
  );

  const machineOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const report of [...dauCaReports, ...cuoiCaReports]) {
      const key = report.maMay.trim() || report.tenMay.trim();
      if (!key) continue;
      map.set(key, report.tenMay || report.maMay);
    }
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1], 'vi'));
  }, [dauCaReports, cuoiCaReports]);

  const loadReports = async (tuNgay = filterFromDate, denNgay = filterToDate) => {
    const params = new URLSearchParams();
    params.set('limit', '300');
    if (tuNgay) params.set('tu_ngay', tuNgay);
    if (denNgay) params.set('den_ngay', denNgay);

    const [dauCaRes, cuoiCaRes] = await Promise.all([
      fetch(`/api/bao-cao-may-nvl-ton?${params.toString()}&loai_bao_cao=dau_ca`),
      fetch(`/api/bao-cao-may-nvl-ton?${params.toString()}&loai_bao_cao=cuoi_ca`)
    ]);
    const [dauCaData, cuoiCaData] = await Promise.all([
      dauCaRes.json().catch(() => ({})),
      cuoiCaRes.json().catch(() => ({}))
    ]);

    if (!dauCaRes.ok || !cuoiCaRes.ok) {
      throw new Error(
        (dauCaData as { error?: string }).error ||
          (cuoiCaData as { error?: string }).error ||
          'Không thể tải danh sách báo cáo NVL tồn.'
      );
    }

    setDauCaReports(normalizeMachineNvlReports(dauCaData));
    setCuoiCaReports(normalizeMachineNvlReports(cuoiCaData));
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const [settingsRes] = await Promise.all([fetch('/api/cai-dat')]);
        const settingsData = await settingsRes.json().catch(() => ({}));
        if (!cancelled && settingsRes.ok) {
          setShiftSettings(normalizeShiftSettings(settingsData));
        }
        await loadReports(filterFromDate, filterToDate);
        setSelectedDauCaIds(new Set());
        setSelectedCuoiCaIds(new Set());
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải danh sách báo cáo.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filterFromDate, filterToDate]);

  useEffect(() => {
    if (!pendingPrint || !printReport) return;
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
  }, [pendingPrint, printReport]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintReport(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa báo cáo NVL tồn này?')) return;
    setError('');
    setMessage('');
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bao-cao-may-nvl-ton/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      setMessage('Đã xóa báo cáo NVL tồn.');
      await loadReports();
      setSelectedDauCaIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSelectedCuoiCaIds(prev => {
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

  const toggleSelected = (kind: MachineNvlReportKind, id: string) => {
    const setter = kind === 'dau_ca' ? setSelectedDauCaIds : setSelectedCuoiCaIds;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (kind: MachineNvlReportKind, ids: string[]) => {
    const setter = kind === 'dau_ca' ? setSelectedDauCaIds : setSelectedCuoiCaIds;
    setter(prev => (prev.size === ids.length ? new Set() : new Set(ids)));
  };

  const clearSelection = (kind: MachineNvlReportKind) => {
    (kind === 'dau_ca' ? setSelectedDauCaIds : setSelectedCuoiCaIds)(new Set());
  };

  const handleBulkDelete = async (kind: MachineNvlReportKind, ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`Xóa ${ids.length} báo cáo NVL tồn đã chọn?`)) return;
    setError('');
    setMessage('');
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/bao-cao-may-nvl-ton/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa nhiều báo cáo.');
      const deleted = Number(data.deleted ?? ids.length);
      setMessage(deleted > 0 ? `Đã xóa ${deleted} báo cáo NVL tồn.` : 'Không có báo cáo nào được xóa.');
      clearSelection(kind);
      await loadReports();
    } catch (err: any) {
      setError(err.message || 'Không thể xóa nhiều báo cáo.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handlePrint = (report: MachineNvlSavedReport) => {
    setPrintReport(savedReportToMachineNvlPrintReport(report));
    setPendingPrint(true);
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">
                Báo cáo tồn máy
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canCreate ? (
                <button
                  type="button"
                  onClick={onCreate}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm mới
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Quay lại
              </button>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-4">
          <TableToolbar
            isLoading={isLoading}
            hasActiveFilters={Boolean(searchText || filterCa || filterMachine)}
            onResetFilters={() => {
              setSearchText('');
              setFilterCa('');
              setFilterMachine('');
            }}
          >
            <TableSearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Tìm mã NVL, tên NVL, máy, nhân sự..."
              disabled={isLoading}
            />
            <FilterCombobox
              label="Ca"
              options={shiftOptions.map(option => option.value)}
              value={filterCa || 'all'}
              onChange={value => setFilterCa(value === 'all' ? '' : value)}
              formatOption={value => shiftOptions.find(option => option.value === value)?.label || value}
              compact
            />
            <FilterCombobox
              label="Máy"
              options={machineOptions.map(([key]) => key)}
              value={filterMachine || 'all'}
              onChange={value => setFilterMachine(value === 'all' ? '' : value)}
              formatOption={value => machineOptions.find(([key]) => key === value)?.[1] || value}
              compact
            />
            <TableDateFilter label="Từ ngày" value={filterFromDate} onChange={setFilterFromDate} />
            <TableDateFilter label="Đến ngày" value={filterToDate} onChange={setFilterToDate} />
          </TableToolbar>
          <div className="hidden grid-cols-2 gap-1.5 sm:gap-2">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              Từ ngày
              <input
                type="date"
                value={filterFromDate}
                max={filterToDate || undefined}
                onChange={event => setFilterFromDate(event.target.value)}
                className={`${inputClass} mt-0.5`}
              />
            </label>
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              Đến ngày
              <input
                type="date"
                value={filterToDate}
                min={filterFromDate || undefined}
                onChange={event => setFilterToDate(event.target.value)}
                className={`${inputClass} mt-0.5`}
              />
            </label>
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              Ca
              <select value={filterCa} onChange={event => setFilterCa(event.target.value)} className={`${inputClass} mt-0.5`}>
                <option value="">Tất cả ca</option>
                {shiftOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              Máy
              <select
                value={filterMachine}
                onChange={event => setFilterMachine(event.target.value)}
                className={`${inputClass} mt-0.5`}
              >
                <option value="">Tất cả máy</option>
                {machineOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {message}
            </p>
          ) : null}
        </div>
      </section>

      <MachineNvlSection
        kind="dau_ca"
        title={MACHINE_NVL_SECTIONS[0].title}
        emptyLabel={MACHINE_NVL_SECTIONS[0].emptyLabel}
        groups={dauCaGroups}
        isLoading={isLoading}
        onView={setViewingReport}
        onEdit={onEdit}
        onPrint={handlePrint}
        onDelete={handleDelete}
        deletingId={deletingId}
        selectedIds={selectedDauCaIds}
        onToggleSelected={id => toggleSelected('dau_ca', id)}
        onToggleSelectAll={ids => toggleSelectAll('dau_ca', ids)}
        onBulkDelete={ids => void handleBulkDelete('dau_ca', ids)}
        onClearSelection={() => clearSelection('dau_ca')}
        bulkDeleting={bulkDeleting}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <MachineNvlSection
        kind="cuoi_ca"
        title={MACHINE_NVL_SECTIONS[1].title}
        emptyLabel={MACHINE_NVL_SECTIONS[1].emptyLabel}
        groups={cuoiCaGroups}
        isLoading={isLoading}
        onView={setViewingReport}
        onEdit={onEdit}
        onPrint={handlePrint}
        onDelete={handleDelete}
        deletingId={deletingId}
        selectedIds={selectedCuoiCaIds}
        onToggleSelected={id => toggleSelected('cuoi_ca', id)}
        onToggleSelectAll={ids => toggleSelectAll('cuoi_ca', ids)}
        onBulkDelete={ids => void handleBulkDelete('cuoi_ca', ids)}
        onClearSelection={() => clearSelection('cuoi_ca')}
        bulkDeleting={bulkDeleting}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {viewingReport ? (
        <MachineNvlReportDetailModal
          report={viewingReport}
          onClose={() => setViewingReport(null)}
          onEdit={onEdit}
          onPrint={handlePrint}
          canEdit={canEdit}
        />
      ) : null}

      {printReport ? (
        <div className="production-order-print-root hidden print:block">
          <MachineNvlPrintBatch reports={[printReport]} />
        </div>
      ) : null}
    </div>
  );
}
