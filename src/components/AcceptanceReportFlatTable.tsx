import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
  isAcceptanceHangLoiHongLoai,
  isAcceptanceThanhPhamLoai,
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
  TablePagination,
  StatusBadge
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
  deletingId
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
      minWidthClassName="min-w-[1280px]"
      maxHeightClassName="max-h-[70vh]"
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
        <TableHeadCell>Ngày</TableHeadCell>
        <TableHeadCell>Ca</TableHeadCell>
        <TableHeadCell>Lần · Giờ</TableHeadCell>
        <TableHeadCell>Máy</TableHeadCell>
        <TableHeadCell align="center">Loại</TableHeadCell>
        <TableHeadCell>Mặt hàng</TableHeadCell>
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
          <TableEmptyRow colSpan={14}>Chưa có báo cáo phù hợp với bộ lọc.</TableEmptyRow>
        ) : (
          pageRows.map((report, index) => {
            const filmKg = resolveAcceptanceLineFilmKg(
              report.mat_hang,
              report.so_luong,
              filmKgByProductCode
            );
            const plasticKg = resolveAcceptanceLineNhuaKg(report.trong_luong, filmKg);
            const isFinishedGoods = isAcceptanceThanhPhamLoai(report.loai_vat_tu);
            const isDefective = isAcceptanceHangLoiHongLoai(report.loai_vat_tu);
            const typeLabel = report.loai_vat_tu?.trim() || 'Thành phẩm';
            const timeLabel = report.gio && report.gio !== '-' ? ` · ${report.gio}` : '';

            return (
              <TableRow key={report.id || `flat-${index}`}>
                <td className="px-3 py-2 text-center font-mono font-bold text-zinc-500">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-zinc-800">
                  {formatDateDdMmYyyy(report.ngay)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-800">
                  {report.ca || '-'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  {`${report.lan || '-'}${timeLabel}`}
                </td>
                <td className="px-3 py-2 text-zinc-700">{machineLabel(report)}</td>
                <td className="px-3 py-2 text-center">
                  <StatusBadge
                    label={typeLabel}
                    color={isFinishedGoods ? 'emerald' : isDefective ? 'rose' : 'zinc'}
                  />
                </td>
                <td className="px-3 py-2 font-semibold text-zinc-800">{report.mat_hang || '—'}</td>
                <td className="px-3 py-2 text-zinc-600">{report.ten_sp || '—'}</td>
                <td className="px-3 py-2 text-center font-semibold text-zinc-600">
                  {report.don_vi || '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                  {report.so_luong == null ? '—' : formatNumber(report.so_luong, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                  {report.trong_luong == null || !(Number(report.trong_luong) > 0)
                    ? '—'
                    : `${formatNumber(Number(report.trong_luong), 2)} ${report.don_vi_trong_luong || 'Kg'}`}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-cyan-800">
                  {filmKg != null && filmKg > 0 ? `${formatNumber(filmKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">
                  {plasticKg != null && plasticKg > 0 ? `${formatNumber(plasticKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="inline-flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewNvl(report)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800 transition hover:bg-violet-100"
                      title="Xem NVL định mức"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Xem
                    </button>
                    {canEdit && !report.da_in ? (
                      <button
                        type="button"
                        onClick={() => onEditLine(report)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50"
                        title="Sửa"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Sửa</span>
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDeleteLine(report.id)}
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
                    {renderSlipActions(report)}
                  </div>
                </td>
              </TableRow>
            );
          })
        )}
      </TableBody>
      {rows.length > 0 ? (
        <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
          <tr>
            <td colSpan={9} className="px-3 py-2 text-right">
              Tổng cộng ({rows.length} dòng)
            </td>
            <td className="px-3 py-2 text-right font-mono text-emerald-800">
              {sumByUnit(rows)
                .map(([unit, total]) => `${formatNumber(total, 2)} ${unit}`)
                .join(' · ')}
            </td>
            <td className="px-3 py-2 text-right font-mono text-amber-800">
              {totals.weightKg > 0 ? `${formatNumber(totals.weightKg, 2)} Kg` : '—'}
            </td>
            <td className="px-3 py-2 text-right font-mono text-cyan-800">
              {totals.filmKg > 0 ? `${formatNumber(totals.filmKg, 2)} Kg` : '—'}
            </td>
            <td className="px-3 py-2 text-right font-mono text-violet-800">
              {totals.plasticKg > 0 ? `${formatNumber(totals.plasticKg, 2)} Kg` : '—'}
            </td>
            <td />
          </tr>
        </tfoot>
      ) : null}
    </TableShell>
  );
}
