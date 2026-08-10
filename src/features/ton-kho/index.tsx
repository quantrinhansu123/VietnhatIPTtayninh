import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ListChecks } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
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
  TableEmptyRow
} from '../../components/shared/table';

type TonKhoRow = {
  ma: string;
  ma_goc: string;
  ten: string;
  loai_sp: string | null;
  don_vi: string | null;
  ten_kho: string | null;
  ton_dau_ky: number;
  nhap_trong_ky: number;
  xuat_trong_ky: number;
  ton_cuoi_ky: number;
};

function normalizeTonKhoRows(data: unknown): TonKhoRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return records
    .map((item): TonKhoRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const ma = String(record.ma ?? '').trim();
      if (!ma) return null;
      const num = (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      };
      return {
        ma,
        // Mã gốc trên màn hình luôn là tiền tố của chính mã quét. Điều này giữ
        // các lô/serial cùng nhóm ngay cả khi dữ liệu cũ lưu ma_goc chưa đồng nhất.
        ma_goc: getBaseInventoryCode(ma),
        ten: String(record.ten ?? '').trim(),
        loai_sp: record.loai_sp ? String(record.loai_sp).trim() : null,
        don_vi: record.don_vi ? String(record.don_vi).trim() : null,
        ten_kho: record.ten_kho ? String(record.ten_kho).trim() : null,
        ton_dau_ky: num(record.ton_dau_ky),
        nhap_trong_ky: num(record.nhap_trong_ky),
        xuat_trong_ky: num(record.xuat_trong_ky),
        ton_cuoi_ky: num(record.ton_cuoi_ky)
      };
    })
    .filter((row): row is TonKhoRow => Boolean(row));
}

function formatQty(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function getBaseInventoryCode(value: string) {
  const code = String(value ?? '').trim();
  const suffixSeparatorIndex = code.indexOf('_');
  return suffixSeparatorIndex > 0 ? code.slice(0, suffixSeparatorIndex).trim() : code;
}

type WarehouseCatalogItem = { id: string | number; ten_kho: string };

function normalizeWarehouseCatalog(data: unknown): WarehouseCatalogItem[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return records
    .map((item): WarehouseCatalogItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const tenKho = String(record.ten_kho ?? '').trim();
      if (!tenKho) return null;
      return { id: (record.id as string | number) ?? tenKho, ten_kho: tenKho };
    })
    .filter((item): item is WarehouseCatalogItem => Boolean(item));
}

export function TonKhoPanel({ onBack }: { onBack: () => void }) {
  useTabAccess('ton-kho');

  const [view, setView] = useState<'chi-tiet' | 'tong-hop'>('chi-tiet');
  const [tenKho, setTenKho] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchText, setSearchText] = useState('');

  const [warehouses, setWarehouses] = useState<WarehouseCatalogItem[]>([]);
  const [chiTietRows, setChiTietRows] = useState<TonKhoRow[]>([]);
  const [tongHopRows, setTongHopRows] = useState<TonKhoRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const hasDateRange = Boolean(fromDate && toDate);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/quan-ly-kho');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh mục kho.'));
        setWarehouses(normalizeWarehouseCatalog(data));
      } catch (err: any) {
        setWarehouses([]);
        showAppToast(err?.message || 'Không tải được danh mục kho.', 'error');
      }
    };
    void loadWarehouses();
  }, []);

  useEffect(() => {
    if (!hasDateRange) {
      setChiTietRows([]);
      setTongHopRows([]);
      setLoadError('');
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams();
        // Trang tồn kho này chỉ dùng để đối chiếu thành phẩm đã kiểm kê.
        params.set('loai_kho', 'san_pham');
        if (tenKho !== 'all') params.set('ten_kho', tenKho);
        params.set('from', fromDate);
        params.set('to', toDate);

        const query = params.toString();
        const [chiTietRes, tongHopRes] = await Promise.all([
          fetch(`/api/ton-kho/chi-tiet?${query}`, { signal: controller.signal }),
          fetch(`/api/ton-kho/tong-hop?${query}`, { signal: controller.signal })
        ]);
        const [chiTietData, tongHopData] = await Promise.all([
          chiTietRes.json().catch(() => ({})),
          tongHopRes.json().catch(() => ({}))
        ]);
        if (!chiTietRes.ok) {
          throw new Error(readApiErrorMessage(chiTietRes, chiTietData, 'Không tải được danh sách sản phẩm tồn kho.'));
        }
        if (!tongHopRes.ok) {
          throw new Error(readApiErrorMessage(tongHopRes, tongHopData, 'Không tải được dữ liệu tồn kho.'));
        }
        setChiTietRows(normalizeTonKhoRows(chiTietData));
        setTongHopRows(normalizeTonKhoRows(tongHopData));
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        const message = err?.message || 'Không tải được dữ liệu tồn kho.';
        setLoadError(message);
        setChiTietRows([]);
        setTongHopRows([]);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [tenKho, fromDate, toDate, hasDateRange]);

  const warehouseOptions = useMemo(() => warehouses.map(w => w.ten_kho), [warehouses]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredChiTiet = useMemo(() => {
    if (!normalizedSearch) return chiTietRows;
    return chiTietRows.filter(row =>
      `${row.ma_goc} ${row.ma} ${row.ten} ${row.ten_kho ?? ''}`.toLowerCase().includes(normalizedSearch)
    );
  }, [chiTietRows, normalizedSearch]);

  const filteredTongHop = useMemo(() => {
    if (!normalizedSearch) return tongHopRows;
    return tongHopRows.filter(row => `${row.ma} ${row.ten}`.toLowerCase().includes(normalizedSearch));
  }, [tongHopRows, normalizedSearch]);

  const tongHopTotals = useMemo(
    () =>
      filteredTongHop.reduce(
        (acc, row) => ({
          ton_dau_ky: acc.ton_dau_ky + row.ton_dau_ky,
          nhap_trong_ky: acc.nhap_trong_ky + row.nhap_trong_ky,
          xuat_trong_ky: acc.xuat_trong_ky + row.xuat_trong_ky,
          ton_cuoi_ky: acc.ton_cuoi_ky + row.ton_cuoi_ky
        }),
        { ton_dau_ky: 0, nhap_trong_ky: 0, xuat_trong_ky: 0, ton_cuoi_ky: 0 }
      ),
    [filteredTongHop]
  );

  const hasActiveFilters = tenKho !== 'all' || Boolean(fromDate) || Boolean(toDate) || Boolean(searchText);
  const resetFilters = () => {
    setTenKho('all');
    setFromDate('');
    setToDate('');
    setSearchText('');
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-3 py-4 sm:px-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <TableToolbar
          isLoading={isLoading}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={resetFilters}
          loadError={loadError}
        >
          <TableSearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Tìm mã sản phẩm, tên, kho..."
            disabled={isLoading}
          />
          <FilterCombobox
            label="Kho"
            options={warehouseOptions}
            value={tenKho}
            onChange={setTenKho}
            searchPlaceholder="Tìm kho..."
            compact
          />
          <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} />
          <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
        </TableToolbar>
      </section>

      <nav
        aria-label="Chức năng tồn kho"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2 lg:p-3"
      >
        <button
          type="button"
          aria-current={view === 'chi-tiet' ? 'page' : undefined}
          onClick={() => setView('chi-tiet')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'chi-tiet'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'chi-tiet' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Chi tiết</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Danh sách chi tiết</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Mỗi mã phát sinh trên sổ kho trong khoảng ngày là một dòng
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'tong-hop' ? 'page' : undefined}
          onClick={() => setView('tong-hop')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'tong-hop'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'tong-hop' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Tổng hợp</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Bảng tổng hợp</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Tồn đầu, nhập, xuất, tồn cuối kỳ
            </span>
          </span>
        </button>
      </nav>

      {view === 'chi-tiet' ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <div>
              <h2 className="text-sm font-black text-zinc-900">Danh sách sản phẩm trên sổ kho</h2>
              <p className="text-[11px] font-semibold text-zinc-500">{filteredChiTiet.length} mã sản phẩm</p>
            </div>
          </div>

          <TableShell minWidthClassName="min-w-[820px]" maxHeightClassName="max-h-[560px]">
            <TableHead>
              <TableHeadCell>Mã SP</TableHeadCell>
              <TableHeadCell align="center">Số lượng</TableHeadCell>
              <TableHeadCell>Tên sản phẩm</TableHeadCell>
              <TableHeadCell>Loại sản phẩm</TableHeadCell>
              <TableHeadCell>Kho</TableHeadCell>
            </TableHead>
            <TableBody>
              {filteredChiTiet.map((row, index) => (
                <React.Fragment key={`${row.ma}-${index}`}>
                  <TableRow>
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-base font-black text-zinc-900">{row.ma}</td>
                    <td className="px-5 py-4 text-right font-mono text-base font-black text-zinc-900">
                      {formatQty(row.ton_cuoi_ky)}
                    </td>
                    <td className="px-5 py-4 text-base font-bold text-zinc-700">{row.ten || '—'}</td>
                    <td className="px-5 py-4 font-semibold text-zinc-600">
                      {row.loai_sp || 'Thành phẩm'}
                    </td>
                    <td className="px-5 py-4 font-semibold text-zinc-600">{row.ten_kho || '—'}</td>
                  </TableRow>
                </React.Fragment>
              ))}
              {!isLoading && filteredChiTiet.length === 0 && (
                <TableEmptyRow colSpan={5}>
                  {hasDateRange ? 'Không có dữ liệu phù hợp bộ lọc.' : 'Vui lòng chọn đủ Từ ngày và Đến ngày.'}
                </TableEmptyRow>
              )}
            </TableBody>
          </TableShell>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <div>
              <h2 className="text-sm font-black text-zinc-900">Bảng tổng hợp</h2>
              <p className="text-[11px] font-semibold text-zinc-500">{filteredTongHop.length} mã</p>
            </div>
          </div>

          <TableShell minWidthClassName="min-w-[820px]" maxHeightClassName="max-h-[560px]">
            <TableHead>
              <TableHeadCell>Mã</TableHeadCell>
              <TableHeadCell>Tên</TableHeadCell>
              <TableHeadCell>ĐV</TableHeadCell>
              <TableHeadCell align="center">Tồn đầu kỳ</TableHeadCell>
              <TableHeadCell align="center">Nhập trong kỳ</TableHeadCell>
              <TableHeadCell align="center">Xuất trong kỳ</TableHeadCell>
              <TableHeadCell align="center">Tồn cuối kỳ</TableHeadCell>
            </TableHead>
            <TableBody>
              {filteredTongHop.map(row => (
                <React.Fragment key={row.ma}>
                  <TableRow>
                    <td className="px-4 py-3 font-mono font-black text-zinc-900">{row.ma}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten || '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">{row.don_vi || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatQty(row.ton_dau_ky)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatQty(row.nhap_trong_ky)}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatQty(row.xuat_trong_ky)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">{formatQty(row.ton_cuoi_ky)}</td>
                  </TableRow>
                </React.Fragment>
              ))}
              {!isLoading && filteredTongHop.length === 0 && (
                <TableEmptyRow colSpan={7}>
                  {hasDateRange ? 'Không có dữ liệu phù hợp bộ lọc.' : 'Vui lòng chọn đủ Từ ngày và Đến ngày.'}
                </TableEmptyRow>
              )}
              {filteredTongHop.length > 0 && (
                <TableRow className="bg-zinc-50">
                  <td className="px-4 py-3 font-black text-zinc-900" colSpan={3}>
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">
                    {formatQty(tongHopTotals.ton_dau_ky)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
                    {formatQty(tongHopTotals.nhap_trong_ky)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-amber-700">
                    {formatQty(tongHopTotals.xuat_trong_ky)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">
                    {formatQty(tongHopTotals.ton_cuoi_ky)}
                  </td>
                </TableRow>
              )}
            </TableBody>
          </TableShell>
        </section>
      )}
    </div>
  );
}

export default TonKhoPanel;
