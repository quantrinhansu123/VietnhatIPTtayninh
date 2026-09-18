import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import {
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableEmptyRow,
  TableToolbar,
  TableDateFilter
} from '../../components/shared/table';
import { normalizeMachines, resolveMachineDisplayValue, type MachineRow } from '../danh-sach-may';
import BieuDoThCharts, { compareShiftCa } from './BieuDoThCharts';

export type BaoCaoTongHopListRow = {
  id: string;
  khoa_on_dinh: string;
  ngay_tu: string;
  ngay_den: string;
  ca: string;
  may: string;
  nguon_san_luong: string;
  sl_yeu_cau: number | null;
  tl_nhua_yeu_cau_kg: number | null;
  tl_xuat_tong_kg: number | null;
  tl_xuat_nhua_kg: number | null;
  ton_dau_tong_kg: number | null;
  ton_cuoi_tong_kg: number | null;
  sl_san_luong: number | null;
  tl_mang_kg: number | null;
  tl_nhua_thanh_pham_kg: number | null;
  tl_nhua_dinh_muc_kg: number | null;
  loi_hong_tong_kg: number | null;
  xuat_thuc_dung_kg: number | null;
  chenh_lech_nhua_kg: number | null;
  updated_at: string;
};

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRows(data: unknown): BaoCaoTongHopListRow[] {
  const items =
    data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : Array.isArray(data)
        ? data
        : [];

  return items
    .map((item): BaoCaoTongHopListRow | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const khoa = String(row.khoa_on_dinh ?? '').trim();
      if (!khoa) return null;
      return {
        id: String(row.id ?? khoa),
        khoa_on_dinh: khoa,
        ngay_tu: String(row.ngay_tu ?? '').trim(),
        ngay_den: String(row.ngay_den ?? '').trim(),
        ca: String(row.ca ?? '').trim() || 'all',
        may: String(row.may ?? '').trim() || 'all',
        nguon_san_luong: String(row.nguon_san_luong ?? '').trim(),
        sl_yeu_cau: numOrNull(row.sl_yeu_cau),
        tl_nhua_yeu_cau_kg: numOrNull(row.tl_nhua_yeu_cau_kg),
        tl_xuat_tong_kg: numOrNull(row.tl_xuat_tong_kg),
        tl_xuat_nhua_kg: numOrNull(row.tl_xuat_nhua_kg),
        ton_dau_tong_kg: numOrNull(row.ton_dau_tong_kg),
        ton_cuoi_tong_kg: numOrNull(row.ton_cuoi_tong_kg),
        sl_san_luong: numOrNull(row.sl_san_luong),
        tl_mang_kg: numOrNull(row.tl_mang_kg),
        tl_nhua_thanh_pham_kg: numOrNull(row.tl_nhua_thanh_pham_kg),
        tl_nhua_dinh_muc_kg: numOrNull(row.tl_nhua_dinh_muc_kg),
        loi_hong_tong_kg: numOrNull(row.loi_hong_tong_kg),
        xuat_thuc_dung_kg: numOrNull(row.xuat_thuc_dung_kg),
        chenh_lech_nhua_kg: numOrNull(row.chenh_lech_nhua_kg),
        updated_at: String(row.updated_at ?? '')
      };
    })
    .filter((row): row is BaoCaoTongHopListRow => Boolean(row));
}

function formatKg(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatNum(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatDateLabel(iso: string) {
  const raw = String(iso || '').trim();
  if (!raw) return 'Chưa có ngày';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

function signedClass(value: number | null) {
  if (value === null || !Number.isFinite(value) || value === 0) return 'text-zinc-900';
  return value > 0 ? 'text-emerald-700' : 'text-rose-700';
}

function formatMayLabel(may: string, machines: MachineRow[]) {
  const raw = String(may || '').trim();
  if (!raw || raw === 'all') return raw === 'all' ? 'Tất cả' : '—';
  return resolveMachineDisplayValue(raw, machines) || raw;
}

function buildBieuDoThDetailUrl(row: BaoCaoTongHopListRow): string {
  const params = new URLSearchParams();
  if (row.ngay_tu) params.set('ngay', row.ngay_tu);
  if (row.ca && row.ca !== 'all') params.set('ca', row.ca);
  if (row.may && row.may !== 'all') params.set('may', row.may);
  const qs = params.toString();
  return qs ? `/bieu-do-th?${qs}` : '/bieu-do-th';
}

export function BieuDoThPanel({ onBack }: { onBack?: () => void }) {
  const [rows, setRows] = useState<BaoCaoTongHopListRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [caFilter, setCaFilter] = useState('all');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '1000');
      if (dateFrom) params.set('ngay_tu', dateFrom);
      if (dateTo) params.set('ngay_den', dateTo);
      const [tongHopRes, machineRes] = await Promise.all([
        fetch(`/api/bao-cao-tong-hop?${params.toString()}`),
        fetch('/api/danh-sach-may')
      ]);
      const tongHopData = await tongHopRes.json().catch(() => ({}));
      const machineData = await machineRes.json().catch(() => ({}));
      if (!tongHopRes.ok) {
        throw new Error(String(tongHopData?.error || 'Không tải được bao_cao_tong_hop.'));
      }
      setRows(normalizeRows(tongHopData));
      if (machineRes.ok) setMachines(normalizeMachines(machineData));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Lỗi tải Biểu đồ TH.');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const caOptions = useMemo(
    () => [...new Set(rows.map(row => row.ca).filter(Boolean))].sort(compareShiftCa),
    [rows]
  );

  const sortedRows = useMemo(() => {
    return rows
      .filter(row => caFilter === 'all' || row.ca === caFilter)
      .sort((a, b) => {
        const d = String(b.ngay_tu || '').localeCompare(String(a.ngay_tu || ''));
        if (d !== 0) return d;
        const caCmp = compareShiftCa(a.ca, b.ca);
        if (caCmp !== 0) return caCmp;
        return formatMayLabel(a.may, machines).localeCompare(formatMayLabel(b.may, machines), 'vi');
      });
  }, [rows, machines, caFilter]);

  const hasActiveFilters = Boolean(dateFrom) || Boolean(dateTo) || caFilter !== 'all';

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-red-600">Quản trị</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black text-zinc-950">
            <BarChart3 className="h-5 w-5 text-red-600" />
            Biểu đồ TH
          </h2>
          <p className="mt-1 text-sm font-semibold text-zinc-600">
            Bảng theo ngày từ snapshot <span className="font-mono text-xs">bao_cao_tong_hop</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50"
            >
              Quay lại
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={isLoading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-900 hover:bg-sky-100 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tải lại
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <TableToolbar
          isLoading={isLoading}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={() => {
            setDateFrom('');
            setDateTo('');
            setCaFilter('all');
          }}
          loadError={error}
        >
          <TableDateFilter
            label="Từ ngày"
            value={dateFrom}
            onChange={setDateFrom}
            className="w-full sm:w-auto sm:min-w-[20rem] sm:shrink-0"
            inputMinWidthClassName="min-w-[8.5rem] sm:min-w-[17rem]"
          />
          <TableDateFilter
            label="Đến ngày"
            value={dateTo}
            onChange={setDateTo}
            className="w-full sm:w-auto sm:min-w-[20rem] sm:shrink-0"
            inputMinWidthClassName="min-w-[8.5rem] sm:min-w-[17rem]"
          />
          <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 sm:w-auto sm:shrink-0">
            <span className="shrink-0 text-xs font-bold uppercase text-zinc-400">Ca</span>
            <select
              value={caFilter}
              onChange={event => setCaFilter(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold text-zinc-900 focus:outline-none sm:min-w-[7rem]"
            >
              <option value="all">Tất cả</option>
              {caOptions.map(ca => (
                <option key={ca} value={ca}>
                  {ca}
                </option>
              ))}
            </select>
          </label>
        </TableToolbar>
      </section>

      <TableShell minWidthClassName="min-w-[1100px]">
        <TableHead>
          <TableHeadCell>Ngày</TableHeadCell>
          <TableHeadCell>Ca</TableHeadCell>
          <TableHeadCell>Máy</TableHeadCell>
          <TableHeadCell className="text-right">SL YC</TableHeadCell>
          <TableHeadCell className="text-right">TL nhựa YC</TableHeadCell>
          <TableHeadCell className="text-right">TL xuất</TableHeadCell>
          <TableHeadCell className="text-right">SL SP</TableHeadCell>
          <TableHeadCell className="text-right">TL màng</TableHeadCell>
          <TableHeadCell className="text-right">TL nhựa TP</TableHeadCell>
          <TableHeadCell className="text-right">TL nhựa ĐM</TableHeadCell>
          <TableHeadCell className="text-right">Lỗi</TableHeadCell>
          <TableHeadCell className="text-right">Xuất TD</TableHeadCell>
          <TableHeadCell className="text-right">Chênh lệch</TableHeadCell>
        </TableHead>
        <TableBody>
          {isLoading ? (
            <TableEmptyRow colSpan={13}>
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải…
            </TableEmptyRow>
          ) : sortedRows.length === 0 ? (
            <TableEmptyRow colSpan={13}>
              Chưa có dữ liệu. Vào Phân tích tự động → Tính toán để ghi bao_cao_tong_hop.
            </TableEmptyRow>
          ) : (
            sortedRows.map(row => (
              <tr
                key={row.id || row.khoa_on_dinh}
                onClick={() => window.open(buildBieuDoThDetailUrl(row), '_blank', 'noopener')}
                title="Mở báo cáo chi tiết ngày/ca này"
                className="cursor-pointer border-b border-zinc-200 bg-white transition hover:bg-zinc-50"
              >
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-semibold text-zinc-700">
                  {formatDateLabel(row.ngay_tu)}
                  {row.ngay_den && row.ngay_den !== row.ngay_tu
                    ? ` → ${formatDateLabel(row.ngay_den)}`
                    : ''}
                </td>
                <td className="px-4 py-2.5 font-semibold text-zinc-800">{row.ca}</td>
                <td className="px-4 py-2.5 font-semibold text-zinc-800">
                  {formatMayLabel(row.may, machines)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNum(row.sl_yeu_cau)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.tl_nhua_yeu_cau_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.tl_xuat_tong_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNum(row.sl_san_luong)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.tl_mang_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.tl_nhua_thanh_pham_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.tl_nhua_dinh_muc_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.loi_hong_tong_kg)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(row.xuat_thuc_dung_kg)}</td>
                <td
                  className={`px-4 py-2.5 text-right font-mono font-black tabular-nums ${signedClass(row.chenh_lech_nhua_kg)}`}
                >
                  {formatKg(row.chenh_lech_nhua_kg)}
                </td>
              </tr>
            ))
          )}
        </TableBody>
      </TableShell>

      <BieuDoThCharts rows={sortedRows} isLoading={isLoading} />
    </div>
  );
}

export default BieuDoThPanel;
