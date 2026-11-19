import React, { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Eye, Loader2, Pencil, Trash2 } from 'lucide-react';
import {
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
  RowActionsMenu
} from './shared/table';

type NamedReport = AcceptanceReport & { ten_sp?: string };

export type NvlWeightGroupTotals = {
  tronKg: number | null;
  khongTronKg: number | null;
  /** Σ NVL túi (VT-TUI…). */
  tuiKg: number | null;
  /** Σ NVL ống giấy (ONG-…). */
  ongKg: number | null;
  /** Σ NVL băng keo / băng dính (BDT…). */
  bangKeoKg: number | null;
  /** Σ NVL tem nhãn (TEM…). */
  temKg: number | null;
  /** Cân có bì/lõi nhưng Thành phần SP thiếu mã túi/ống — không tự cộng, chỉ cảnh báo. */
  missingBomWarnings?: string[];
};

type Props = {
  reports: NamedReport[];
  /** TL vật tư trộn / không trộn theo Thành phần SP (khớp modal NVL). */
  nvlWeightByReportId?: Map<string, NvlWeightGroupTotals>;
  onViewNvl: (report: AcceptanceReport) => void;
  renderSlipActions?: (report: AcceptanceReport) => ReactNode;
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

function formatNvlGroupKg(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, 2)} Kg`;
}

/** Bảng tổng hợp phẳng: một dòng mỗi mặt hàng, ngày và ca là các cột riêng. */
export default function AcceptanceReportFlatTable({
  reports,
  nvlWeightByReportId,
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
    let tronKg = 0;
    let khongTronKg = 0;
    let tuiKg = 0;
    let ongKg = 0;
    let bangKeoKg = 0;
    let temKg = 0;
    let hasTron = false;
    let hasKhongTron = false;
    let hasTui = false;
    let hasOng = false;
    let hasBangKeo = false;
    let hasTem = false;
    for (const row of rows) {
      const film = row.trong_luong_mang;
      if (film != null && film > 0) filmKg += film;
      const nvl = nvlWeightByReportId?.get(String(row.id || ''));
      if (nvl?.tronKg != null) {
        hasTron = true;
        tronKg += nvl.tronKg;
      }
      if (nvl?.khongTronKg != null) {
        hasKhongTron = true;
        khongTronKg += nvl.khongTronKg;
      }
      if (nvl?.tuiKg != null) {
        hasTui = true;
        tuiKg += nvl.tuiKg;
      }
      if (nvl?.ongKg != null) {
        hasOng = true;
        ongKg += nvl.ongKg;
      }
      if (nvl?.bangKeoKg != null) {
        hasBangKeo = true;
        bangKeoKg += nvl.bangKeoKg;
      }
      if (nvl?.temKg != null) {
        hasTem = true;
        temKg += nvl.temKg;
      }
    }
    return {
      filmKg,
      weightKg: sumTrongLuongKg(rows),
      tronKg: hasTron ? tronKg : null,
      khongTronKg: hasKhongTron ? khongTronKg : null,
      tuiKg: hasTui ? tuiKg : null,
      ongKg: hasOng ? ongKg : null,
      bangKeoKg: hasBangKeo ? bangKeoKg : null,
      temKg: hasTem ? temKg : null
    };
  }, [nvlWeightByReportId, rows]);

  const bomWarnings = useMemo(() => {
    const list: Array<{ matHang: string; messages: string[] }> = [];
    for (const row of rows) {
      const nvl = nvlWeightByReportId?.get(String(row.id || ''));
      const messages = nvl?.missingBomWarnings || [];
      if (messages.length === 0) continue;
      list.push({ matHang: row.mat_hang || row.ten_sp || '—', messages });
    }
    return list;
  }, [nvlWeightByReportId, rows]);

  return (
    <>
      {bomWarnings.length > 0 ? (
        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              <p className="font-bold">
                Cân có bì/lõi nhưng Thành phần SP thiếu mã túi/ống — không tự cộng vào TL VT không
                trộn. Hãy thêm mã vào Kho sản phẩm → Thành phần.
              </p>
              <ul className="list-disc space-y-0.5 pl-4 font-semibold">
                {bomWarnings.slice(0, 8).map(item => (
                  <li key={item.matHang}>
                    <span className="font-mono font-black">{item.matHang}</span>
                    {': '}
                    {item.messages.join(' · ')}
                  </li>
                ))}
                {bomWarnings.length > 8 ? (
                  <li>… và {bomWarnings.length - 8} mã khác</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    <TableShell
      minWidthClassName="min-w-[1620px]"
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
        <TableHeadCell align="right">
          <span title="Σ NVL % (nhựa trộn) = Nhựa thực tế × % định mức Thành phần">
            TL vật tư trộn
          </span>
        </TableHeadCell>
        <TableHeadCell align="right">
          <span title="Σ NVL Cái/Cuộn (túi · ống · băng keo…) theo định mức Thành phần × SL">
            TL VT không trộn
          </span>
        </TableHeadCell>
        <TableHeadCell align="right">TL màng</TableHeadCell>
        <TableHeadCell align="right">
          <span title="Σ NVL túi (VT-TUI…) theo định mức Thành phần × SL">TL Túi</span>
        </TableHeadCell>
        <TableHeadCell align="right">
          <span title="Σ NVL băng keo / băng dính (BDT…) theo định mức Thành phần × SL">
            TL Băng keo
          </span>
        </TableHeadCell>
        <TableHeadCell align="right">
          <span title="Σ NVL lõi (ống giấy ONG-…) — ưu tiên Cân lõi trạm cân AI, không có thì theo định mức Thành phần × SL">TL Lõi</span>
        </TableHeadCell>
        <TableHeadCell align="center">Thao tác</TableHeadCell>
      </TableHead>
      <TableBody>
        {pageRows.length === 0 ? (
          <TableEmptyRow colSpan={17}>Chưa có báo cáo phù hợp với bộ lọc.</TableEmptyRow>
        ) : (
          pageRows.map((report, index) => {
            const filmKg = report.trong_luong_mang;
            const nvl = nvlWeightByReportId?.get(String(report.id || ''));
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
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-emerald-800 last:border-r-0">
                  {formatNvlGroupKg(nvl?.tronKg)}
                </td>
                <td
                  className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-sky-800 last:border-r-0"
                  title={nvl?.missingBomWarnings?.join('\n') || undefined}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {nvl?.missingBomWarnings?.length ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Thiếu mã túi/ống trên Thành phần" />
                    ) : null}
                    {formatNvlGroupKg(nvl?.khongTronKg)}
                  </span>
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-cyan-800 last:border-r-0">
                  {filmKg != null ? `${formatNumber(filmKg, 2)} Kg` : '—'}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-rose-800 last:border-r-0">
                  {formatNvlGroupKg(nvl?.tuiKg)}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-violet-800 last:border-r-0">
                  {formatNvlGroupKg(nvl?.bangKeoKg)}
                </td>
                <td className="whitespace-nowrap border-r border-zinc-200 px-2 py-1.5 text-right font-mono text-[12px] font-bold tabular-nums text-fuchsia-800 last:border-r-0">
                  {formatNvlGroupKg(nvl?.ongKg)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-center">
                  <RowActionsMenu label={`Thao tác báo cáo ${report.mat_hang || ''}`} colorful>
                    <button
                      type="button"
                      onClick={() => onViewNvl(report)}
                      title="Xem NVL định mức"
                    >
                      <Eye className="h-4 w-4 text-violet-600" />
                      <span>Xem NVL định mức</span>
                    </button>
                    {canEdit && !report.da_in ? (
                      <button type="button" onClick={() => onEditLine(report)} title="Sửa">
                        <Pencil className="h-4 w-4 text-amber-600" />
                        <span>Sửa</span>
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => onDeleteLine(report.id)}
                        disabled={deletingId === report.id}
                        title="Xóa"
                      >
                        {deletingId === report.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        )}
                        <span>Xóa</span>
                      </button>
                    ) : null}
                  </RowActionsMenu>
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
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-emerald-800">
              {formatNvlGroupKg(totals.tronKg)}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-sky-800">
              {formatNvlGroupKg(totals.khongTronKg)}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-cyan-800">
              {rows.every(row => row.trong_luong_mang != null)
                ? `${formatNumber(totals.filmKg, 2)} Kg`
                : '—'}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-rose-800">
              {formatNvlGroupKg(totals.tuiKg)}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-violet-800">
              {formatNvlGroupKg(totals.bangKeoKg)}
            </td>
            <td className="whitespace-nowrap border-r border-zinc-300 px-2 py-2 text-right font-mono tabular-nums text-fuchsia-800">
              {formatNvlGroupKg(totals.ongKg)}
            </td>
            <td />
          </tr>
        </tfoot>
      ) : null}
    </TableShell>
    </>
  );
}
