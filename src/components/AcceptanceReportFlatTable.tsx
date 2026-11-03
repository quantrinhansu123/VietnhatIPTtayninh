import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  resolveAcceptanceLineFilmKg,
  resolveAcceptanceLineNhuaKg,
  sumByUnit,
  sumTrongLuongKg
} from './AcceptanceReportPrintSheet';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { formatNumber } from '../utils';
import { formatDateDdMmYyyy } from '../utils/dateFormat';
import { useTabAccess } from '../app/useTabAccess';
import {
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination
} from './shared/table';

type NamedReport = AcceptanceReport & { ten_sp?: string };

type Props = {
  reports: NamedReport[];
  filmKgByProductCode: Map<string, number>;
  onViewNvl: (report: AcceptanceReport) => void;
  renderSlipActions: (report: AcceptanceReport) => ReactNode;
  onEditLine: (report: AcceptanceReport) => void;
  onDeleteLine: (id: string) => void;
  deletingId: string | null;
  /** Danh mục SP đang tải — hiện «Đang tải…» thay vì «—» ở cột Tên SP. */
  isLoadingNames?: boolean;
};

function machineLabel(report: NamedReport) {
  return report.ten_may && report.ma_may && report.ten_may !== report.ma_may
    ? `${report.ma_may} · ${report.ten_may}`
    : report.ten_may || report.ma_may || '-';
}

/** Bảng tổng hợp phẳng: một dòng mỗi mặt hàng, ngày và ca là các cột riêng. */
export default function AcceptanceReportFlatTable({
  reports,
  filmKgByProductCode,
  onViewNvl,
  renderSlipActions,
  onEditLine,
  onDeleteLine,
  deletingId,
  isLoadingNames = false
}: Props) {
  const { canEdit, canDelete } = useTabAccess('acceptance-report-list');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const rows = useMemo(
    () =>
      [...reports].sort((a, b) => {
        const byDate = String(b.ngay || '').localeCompare(String(a.ngay || ''), 'vi');
        if (byDate !== 0) return byDate;
        const byShift = String(a.ca || '').localeCompare(String(b.ca || ''), 'vi', { numeric: true });
        if (byShift !== 0) return byShift;
        const byMachine = machineLabel(a).localeCompare(machineLabel(b), 'vi');
        if (byMachine !== 0) return byMachine;
        return String(a.lan || '').localeCompare(String(b.lan || ''), 'vi', { numeric: true });
      }),
    [reports]
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [reports]);

  const totals = useMemo(() => {
    let filmKg = 0;
    let plasticKg = 0;
    for (const row of rows) {
      const film = resolveAcceptanceLineFilmKg(row.mat_hang, row.so_luong, filmKgByProductCode);
      const plastic = resolveAcceptanceLineNhuaKg(row.trong_luong, film);
      if (film != null && film > 0) filmKg += film;
      if (plastic != null && plastic > 0) plasticKg += plastic;
    }
    return { filmKg, plasticKg, weightKg: sumTrongLuongKg(rows) };
  }, [rows, filmKgByProductCode]);

  return (
    <TableShell
      minWidthClassName="min-w-[1360px]"
      maxHeightClassName="max-h-[70vh]"
      className="!rounded-md !shadow-none"
      footer={
        rows.length > 0 ? (
          <TablePagination
            totalRecords={rows.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPageSize(size);
              setPage(1);
            }}
          />
        ) : null
      }
    >
      <TableHead>
        <TableHeadCell className="text-center">STT</TableHeadCell>
        <TableHeadCell className="text-center">Ngày</TableHeadCell>
        <TableHeadCell className="text-center">Ca</TableHeadCell>
        <TableHeadCell className="text-center">Lần · Giờ</TableHeadCell>
        <TableHeadCell className="text-center">Máy</TableHeadCell>
        <TableHeadCell className="text-center">Mặt hàng</TableHeadCell>
        <TableHeadCell>Tên SP</TableHeadCell>
        <TableHeadCell align="center">ĐVT</TableHeadCell>
        <TableHeadCell align="right">Số lượng</TableHeadCell>
        <TableHeadCell align="right">Trọng lượng</TableHeadCell>
        <TableHeadCell align="right">TL màng</TableHeadCell>
        <TableHeadCell align="right">TL nhựa</TableHeadCell>
        <TableHeadCell align="center">Thao tác</TableHeadCell>
      </TableHead>
      <TableBody>
        {pageRows.length === 0 ? (
          <TableEmptyRow colSpan={13}>Chưa có báo cáo phù hợp với bộ lọc.</TableEmptyRow>
        ) : (
          pageRows.map((report, index) => {
            const filmKg = resolveAcceptanceLineFilmKg(
              report.mat_hang,
              report.so_luong,
              filmKgByProductCode
            );
            const plasticKg = resolveAcceptanceLineNhuaKg(report.trong_luong, filmKg);
            const timeLabel = report.gio && report.gio !== '-' ? ` · ${report.gio}` : '';

            return (
              <TableRow key={report.id || `flat-${index}`} className="border-b border-zinc-200">
                <td className="border-r border-zinc-200 px-2 py-1.5 text-center font-mono text-[12px] text-zinc-500 last:border-r-0">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center font-mono text-[12px] text-zinc-800 last:border-r-0">
                  {formatDateDdMmYyyy(report.ngay)}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center text-[12px] font-semibold text-zinc-800 last:border-r-0">
                  {report.ca || '-'}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center text-[12px] text-zinc-600 last:border-r-0">
                  {`${report.lan || '-'}${timeLabel}`}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center text-[12px] text-zinc-700 last:border-r-0">
                  {machineLabel(report)}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center font-mono text-[12px] font-semibold text-zinc-800 last:border-r-0">
                  {report.mat_hang || '—'}
                </td>
                <td className="border-r border-zinc-200 px-2 py-1.5 text-[12px] text-zinc-700 last:border-r-0">
                  {report.ten_sp || (isLoadingNames ? <span className="text-zinc-400">Đang tải…</span> : '—')}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-center text-[12px] font-semibold text-zinc-600 last:border-r-0">
                  {report.don_vi || '—'}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-emerald-700 last:border-r-0">
                  {report.so_luong == null ? '—' : formatNumber(report.so_luong, 2)}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-amber-800 last:border-r-0">
                  {report.trong_luong == null || !(Number(report.trong_luong) > 0)
                    ? '—'
                    : `${formatNumber(Number(report.trong_luong), 2)} ${report.don_vi_trong_luong || 'Kg'}`}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-cyan-800 last:border-r-0">
                  {filmKg != null && filmKg > 0 ? `${formatNumber(filmKg, 2)} Kg` : '—'}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-violet-800 last:border-r-0">
                  {plasticKg != null && plasticKg > 0 ? `${formatNumber(plasticKg, 2)} Kg` : '—'}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-center">
                  <div className="inline-flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewNvl(report)}
                      className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50"
                      title="Xem NVL định mức"
                    >
                      <Eye className="h-3 w-3" />
                      Xem
                    </button>
                    {canEdit && !report.da_in ? (
                      <button
                        type="button"
                        onClick={() => onEditLine(report)}
                        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50"
                        title="Sửa"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Sửa</span>
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDeleteLine(report.id)}
                        disabled={deletingId === report.id}
                        className="inline-flex h-6 w-6 items-center justify-center rounded border border-rose-300 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Xóa"
                      >
                        {deletingId === report.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ) : null}
                    {renderSlipActions(report)}
                  </div>
                </td>
              </TableRow>
            );
          })
        )}
      </TableBody>
      {rows.length > 0 ? (
        <tfoot className="border-t-2 border-zinc-300 bg-[#e8f0ed]/70 text-[12px] font-bold text-zinc-900">
          <tr>
            <td colSpan={8} className="border-r border-zinc-300 px-2 py-2 text-right">
              Tổng cộng ({rows.length} dòng)
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-emerald-800">
              {sumByUnit(rows)
                .map(([unit, total]) => `${formatNumber(total, 2)} ${unit}`)
                .join(' · ')}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-amber-800">
              {totals.weightKg > 0 ? `${formatNumber(totals.weightKg, 2)} Kg` : '—'}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-cyan-800">
              {totals.filmKg > 0 ? `${formatNumber(totals.filmKg, 2)} Kg` : '—'}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-violet-800">
              {totals.plasticKg > 0 ? `${formatNumber(totals.plasticKg, 2)} Kg` : '—'}
            </td>
            <td />
          </tr>
        </tfoot>
      ) : null}
    </TableShell>
  );
}
