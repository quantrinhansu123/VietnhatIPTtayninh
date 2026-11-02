import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Loader2, Package, RefreshCw } from 'lucide-react';
import { TableToolbar, TableDateFilter } from '../../components/shared/table';
import { normalizeMachines, resolveMachineDisplayValue, type MachineRow } from '../danh-sach-may';
import { splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import BieuDoThCharts, { compareShiftCa } from './BieuDoThCharts';
import LoiHongPanel from './LoiHongPanel';
import ProductionComparison from './ProductionComparison';
import SanLuongPanel from './SanLuongPanel';
import {
  loadProductionOrdersFromApi,
  resolveCongNhanPhuTrach,
  staffNamesInclude
} from './staffEnrichment';
import TongHopTreeTable from './TongHopTreeTable';

type BieuDoThViewTab = 'loi-hong' | 'san-luong' | 'bieu-do';

const VIEW_TABS: { id: BieuDoThViewTab; label: string; icon: React.ReactNode }[] = [
  { id: 'loi-hong', label: 'Lỗi hỏng', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: 'san-luong', label: 'Sản lượng', icon: <Package className="h-3.5 w-3.5" /> },
  { id: 'bieu-do', label: 'Biểu đồ', icon: <BarChart3 className="h-3.5 w-3.5" /> }
];

export type BaoCaoTongHopListRow = {
  id: string;
  khoa_on_dinh: string;
  ngay_tu: string;
  ngay_den: string;
  ca: string;
  may: string;
  cong_nhan_phu_trach: string;
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
        cong_nhan_phu_trach: String(row.cong_nhan_phu_trach ?? '').trim(),
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
  const [mayFilter, setMayFilter] = useState('all');
  const [congNhanFilter, setCongNhanFilter] = useState('all');
  const [viewTab, setViewTab] = useState<BieuDoThViewTab>('bieu-do');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '1000');
      if (dateFrom) params.set('ngay_tu', dateFrom);
      if (dateTo) params.set('ngay_den', dateTo);
      const [tongHopRes, machineRes, orderRes] = await Promise.all([
        fetch(`/api/bao-cao-tong-hop?${params.toString()}`),
        fetch('/api/danh-sach-may'),
        fetch('/api/lenh-sx')
      ]);
      const tongHopData = await tongHopRes.json().catch(() => ({}));
      const machineData = await machineRes.json().catch(() => ({}));
      const orderData = await orderRes.json().catch(() => ({}));
      if (!tongHopRes.ok) {
        throw new Error(String(tongHopData?.error || 'Không tải được bao_cao_tong_hop.'));
      }
      const nextMachines = machineRes.ok ? normalizeMachines(machineData) : [];
      const orders = orderRes.ok ? loadProductionOrdersFromApi(orderData) : [];
      // Luôn gắn trưởng ca từ LSX theo Ngày·Ca·Máy (không dùng thợ chính đã lưu).
      const normalized = normalizeRows(tongHopData).map(row => {
        const truongCa = resolveCongNhanPhuTrach({
          ngayTu: row.ngay_tu,
          ngayDen: row.ngay_den,
          ca: row.ca,
          may: row.may,
          orders,
          machines: nextMachines
        });
        return {
          ...row,
          cong_nhan_phu_trach: truongCa || row.cong_nhan_phu_trach
        };
      });
      setMachines(nextMachines);
      setRows(normalized);
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

  const displayRows = useMemo(
    () =>
      rows.map(row => ({
        ...row,
        may: formatMayLabel(row.may, machines) === 'Tất cả' ? 'all' : formatMayLabel(row.may, machines)
      })),
    [rows, machines]
  );

  const mayOptions = useMemo(
    () =>
      [...new Set(displayRows.map(row => row.may).filter(may => may && may !== 'all'))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      ),
    [displayRows]
  );

  const congNhanOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of displayRows) {
      splitProductionOrderStaffNames(row.cong_nhan_phu_trach).forEach(name => names.add(name));
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [displayRows]);

  const sortedRows = useMemo(() => {
    return displayRows
      .filter(row => caFilter === 'all' || row.ca === caFilter)
      .filter(row => mayFilter === 'all' || row.may === mayFilter)
      .filter(row => congNhanFilter === 'all' || staffNamesInclude(row.cong_nhan_phu_trach, congNhanFilter))
      .sort((a, b) => {
        const d = String(b.ngay_tu || '').localeCompare(String(a.ngay_tu || ''));
        if (d !== 0) return d;
        const caCmp = compareShiftCa(a.ca, b.ca);
        if (caCmp !== 0) return caCmp;
        const mayCmp = String(a.may || '').localeCompare(String(b.may || ''), 'vi');
        if (mayCmp !== 0) return mayCmp;
        return String(a.cong_nhan_phu_trach || '').localeCompare(String(b.cong_nhan_phu_trach || ''), 'vi');
      });
  }, [displayRows, caFilter, mayFilter, congNhanFilter]);

  const hasActiveFilters =
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    caFilter !== 'all' ||
    mayFilter !== 'all' ||
    congNhanFilter !== 'all';

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
            Bảng tổng theo ngày → bấm dòng để xem ca → bấm ca để xem từng máy.
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
            setMayFilter('all');
            setCongNhanFilter('all');
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
          <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 sm:w-auto sm:shrink-0">
            <span className="shrink-0 text-xs font-bold uppercase text-zinc-400">Máy</span>
            <select
              value={mayFilter}
              onChange={event => setMayFilter(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold text-zinc-900 focus:outline-none sm:min-w-[9rem]"
            >
              <option value="all">Tất cả</option>
              {mayOptions.map(label => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 sm:w-auto sm:shrink-0">
            <span className="shrink-0 text-xs font-bold uppercase text-zinc-400">Trưởng ca</span>
            <select
              value={congNhanFilter}
              onChange={event => setCongNhanFilter(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-semibold text-zinc-900 focus:outline-none sm:min-w-[10rem]"
            >
              <option value="all">Tất cả</option>
              {congNhanOptions.map(name => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </TableToolbar>
      </section>

      {rows.length >= 1000 && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Đã tải tới giới hạn 1.000 bản ghi. Hãy thu hẹp khoảng ngày để so sánh đầy đủ.
        </p>
      )}

      <TongHopTreeTable
        rows={sortedRows}
        isLoading={isLoading}
        onOpenDetail={row => window.open(buildBieuDoThDetailUrl(row), '_blank', 'noopener')}
      />

      <div
        role="tablist"
        aria-label="Chế độ xem Biểu đồ TH"
        className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1"
      >
        {VIEW_TABS.map(tab => {
          const isActive = viewTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setViewTab(tab.id)}
              className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold transition sm:flex-none sm:min-w-[8.5rem] ${
                isActive
                  ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                  : 'text-zinc-600 hover:bg-white/70 hover:text-zinc-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {viewTab === 'loi-hong' ? <LoiHongPanel rows={sortedRows} isLoading={isLoading} /> : null}

      {viewTab === 'san-luong' ? <SanLuongPanel rows={sortedRows} isLoading={isLoading} /> : null}

      {viewTab === 'bieu-do' ? (
        <>
          <ProductionComparison rows={sortedRows} isLoading={isLoading} />
          <BieuDoThCharts rows={sortedRows} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}

export default BieuDoThPanel;
