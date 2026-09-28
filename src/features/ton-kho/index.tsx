import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, BarChart3, ClipboardCheck, ListChecks } from 'lucide-react';
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

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type TonKhoRow = {
  ma: string;
  ten: string;
  don_vi: string | null;
  ton_dau_ky: number;
  nhap_trong_ky: number;
  xuat_trong_ky: number;
  dieu_chinh_trong_ky: number;
  ton_cuoi_ky: number;
};

type TonKhoDetailRow = {
  ma_sp_goc: string;
  ma_sp_qr: string;
  ten: string;
  loai_sp: string;
  don_vi: string | null;
  ten_kho: string;
  so_luong: number;
};

type TonKhoMovementRow = {
  id: string;
  ma_sp_goc: string;
  ma_sp_qr: string;
  ten: string;
  don_vi: string | null;
  ma_phieu: string | null;
  ngay_phieu: string;
  kho: string;
  ca: string | null;
  la_dieu_chinh: boolean;
  so_luong: number;
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
        ten: String(record.ten ?? '').trim(),
        don_vi: record.don_vi ? String(record.don_vi).trim() : null,
        ton_dau_ky: num(record.ton_dau_ky),
        nhap_trong_ky: num(record.nhap_trong_ky),
        xuat_trong_ky: num(record.xuat_trong_ky),
        dieu_chinh_trong_ky: num(record.dieu_chinh_trong_ky),
        ton_cuoi_ky: num(record.ton_cuoi_ky)
      };
    })
    .filter((row): row is TonKhoRow => Boolean(row));
}

function normalizeTonKhoDetailRows(data: unknown): TonKhoDetailRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return records
    .map((item): TonKhoDetailRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const maSp = String(record.ma_sp_goc ?? '').trim();
      const maQr = String(record.ma_sp_qr ?? '').trim();
      if (!maSp || !maQr) return null;
      const quantity = Number(record.so_luong);
      return {
        ma_sp_goc: maSp,
        ma_sp_qr: maQr,
        ten: String(record.ten ?? '').trim(),
        loai_sp: String(record.loai_sp ?? 'Thành phẩm').trim(),
        don_vi: record.don_vi ? String(record.don_vi).trim() : null,
        ten_kho: String(record.ten_kho ?? '').trim(),
        so_luong: Number.isFinite(quantity) ? quantity : 0
      };
    })
    .filter((row): row is TonKhoDetailRow => Boolean(row));
}

function normalizeTonKhoMovementRows(data: unknown): TonKhoMovementRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return records
    .map((item): TonKhoMovementRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const maSp = String(record.ma_sp_goc ?? '').trim();
      const maQr = String(record.ma_sp_qr ?? '').trim();
      const ngay = String(record.ngay_phieu ?? '').slice(0, 10);
      if (!maSp || !maQr || !ngay) return null;
      const quantity = Number(record.so_luong);
      return {
        id: String(record.id ?? `${maQr}-${ngay}`),
        ma_sp_goc: maSp,
        ma_sp_qr: maQr,
        ten: String(record.ten ?? '').trim() || maSp,
        don_vi: record.don_vi ? String(record.don_vi).trim() : null,
        ma_phieu: record.ma_phieu ? String(record.ma_phieu).trim() : null,
        ngay_phieu: ngay,
        kho: String(record.kho ?? '').trim(),
        ca: record.ca ? String(record.ca).trim() : null,
        la_dieu_chinh: record.la_dieu_chinh === true,
        so_luong: Number.isFinite(quantity) ? quantity : 1
      };
    })
    .filter((row): row is TonKhoMovementRow => Boolean(row));
}

function formatQty(value: number) {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatAdjustment(value: number) {
  return value > 0 ? `+${formatQty(value)}` : formatQty(value);
}

function formatIsoToVi(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
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

type TonKhoMainTab = 'kiem-ton' | 'xuat-kho' | 'nhap-kho';
type TonKhoKiemTonView = 'chi-tiet' | 'tong-hop';

export function TonKhoPanel({ onBack }: { onBack: () => void }) {
  useTabAccess('ton-kho');

  const [mainTab, setMainTab] = useState<TonKhoMainTab>('kiem-ton');
  const [kiemTonView, setKiemTonView] = useState<TonKhoKiemTonView>('tong-hop');
  const [tenKho, setTenKho] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(() => todayIsoDate());
  const [searchText, setSearchText] = useState('');

  const [warehouses, setWarehouses] = useState<WarehouseCatalogItem[]>([]);
  const [chiTietRows, setChiTietRows] = useState<TonKhoDetailRow[]>([]);
  const [tongHopRows, setTongHopRows] = useState<TonKhoRow[]>([]);
  const [nhapRows, setNhapRows] = useState<TonKhoMovementRow[]>([]);
  const [xuatRows, setXuatRows] = useState<TonKhoMovementRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

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
    const start = fromDate.trim();
    const end = toDate.trim();
    if (!end || end < start) {
      setIsLoading(false);
      setLoadError(!end ? 'Chọn ngày kết thúc kỳ.' : 'Đến ngày phải từ ngày đầu kỳ trở đi.');
      setChiTietRows([]);
      setTongHopRows([]);
      setNhapRows([]);
      setXuatRows([]);
      return;
    }

    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const params = new URLSearchParams();
        if (tenKho !== 'all') params.set('ten_kho', tenKho);
        if (start) params.set('from', start);
        params.set('to', end);

        const res = await fetch(`/api/ton-kho-qr-data?${params.toString()}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được dữ liệu tồn kho QR.'));
        setChiTietRows(normalizeTonKhoDetailRows({ records: data.chi_tiet_records }));
        setTongHopRows(normalizeTonKhoRows({ records: data.tong_hop_records }));
        setNhapRows(normalizeTonKhoMovementRows({ records: data.nhap_records }));
        setXuatRows(normalizeTonKhoMovementRows({ records: data.xuat_records }));
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        const message = err?.message || 'Không tải được dữ liệu tồn kho QR.';
        setLoadError(message);
        setChiTietRows([]);
        setTongHopRows([]);
        setNhapRows([]);
        setXuatRows([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [tenKho, fromDate, toDate]);

  const warehouseOptions = useMemo(() => warehouses.map(w => w.ten_kho), [warehouses]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredChiTiet = useMemo(() => {
    if (!normalizedSearch) return chiTietRows;
    return chiTietRows.filter(row =>
      `${row.ma_sp_goc} ${row.ma_sp_qr} ${row.ten} ${row.ten_kho}`.toLowerCase().includes(normalizedSearch)
    );
  }, [chiTietRows, normalizedSearch]);

  const filteredTongHop = useMemo(() => {
    if (!normalizedSearch) return tongHopRows;
    return tongHopRows.filter(row => `${row.ma} ${row.ten}`.toLowerCase().includes(normalizedSearch));
  }, [tongHopRows, normalizedSearch]);

  const filteredNhap = useMemo(() => {
    if (!normalizedSearch) return nhapRows;
    return nhapRows.filter(row =>
      `${row.ma_sp_goc} ${row.ma_sp_qr} ${row.ten} ${row.ma_phieu ?? ''} ${row.kho}`.toLowerCase().includes(normalizedSearch)
    );
  }, [nhapRows, normalizedSearch]);

  const filteredXuat = useMemo(() => {
    if (!normalizedSearch) return xuatRows;
    return xuatRows.filter(row =>
      `${row.ma_sp_goc} ${row.ma_sp_qr} ${row.ten} ${row.ma_phieu ?? ''} ${row.kho}`.toLowerCase().includes(normalizedSearch)
    );
  }, [xuatRows, normalizedSearch]);

  const sumTonRows = (rows: TonKhoRow[]) =>
    rows.reduce(
      (acc, row) => ({
        ton_dau_ky: acc.ton_dau_ky + row.ton_dau_ky,
        nhap_trong_ky: acc.nhap_trong_ky + row.nhap_trong_ky,
        xuat_trong_ky: acc.xuat_trong_ky + row.xuat_trong_ky,
        dieu_chinh_trong_ky: acc.dieu_chinh_trong_ky + row.dieu_chinh_trong_ky,
        ton_cuoi_ky: acc.ton_cuoi_ky + row.ton_cuoi_ky
      }),
      { ton_dau_ky: 0, nhap_trong_ky: 0, xuat_trong_ky: 0, dieu_chinh_trong_ky: 0, ton_cuoi_ky: 0 }
    );

  const tongHopTotals = useMemo(() => sumTonRows(filteredTongHop), [filteredTongHop]);

  const hasActiveFilters =
    tenKho !== 'all' ||
    Boolean(fromDate) ||
    toDate !== todayIsoDate() ||
    Boolean(searchText);
  const resetFilters = () => {
    setTenKho('all');
    setFromDate('');
    setToDate(todayIsoDate());
    setSearchText('');
  };

  const renderTongHopTable = (
    rows: TonKhoRow[],
    totals: ReturnType<typeof sumTonRows>,
    emptyText: string,
    loading: boolean
  ) => (
    <TableShell minWidthClassName="min-w-[920px]" maxHeightClassName="max-h-[560px]">
      <TableHead>
        <TableHeadCell>Mã</TableHeadCell>
        <TableHeadCell>Tên</TableHeadCell>
        <TableHeadCell>ĐV</TableHeadCell>
        <TableHeadCell align="center">Tồn đầu kỳ</TableHeadCell>
        <TableHeadCell align="center">Nhập trong kỳ</TableHeadCell>
        <TableHeadCell align="center">Xuất trong kỳ</TableHeadCell>
        <TableHeadCell align="center">Điều chỉnh</TableHeadCell>
        <TableHeadCell align="center">Tồn cuối kỳ</TableHeadCell>
      </TableHead>
      <TableBody>
        {rows.map(row => (
          <React.Fragment key={row.ma}>
            <TableRow>
              <td className="px-4 py-3 font-mono font-black text-zinc-900">{row.ma}</td>
              <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten || '—'}</td>
              <td className="px-4 py-3 text-zinc-700">{row.don_vi || '—'}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatQty(row.ton_dau_ky)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatQty(row.nhap_trong_ky)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{formatQty(row.xuat_trong_ky)}</td>
              <td className="px-4 py-3 text-right font-mono font-bold text-sky-700">{formatAdjustment(row.dieu_chinh_trong_ky)}</td>
              <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">{formatQty(row.ton_cuoi_ky)}</td>
            </TableRow>
          </React.Fragment>
        ))}
        {!loading && rows.length === 0 && <TableEmptyRow colSpan={8}>{emptyText}</TableEmptyRow>}
        {rows.length > 0 && (
          <TableRow className="bg-zinc-50">
            <td className="px-4 py-3 font-black text-zinc-900" colSpan={3}>
              Tổng cộng
            </td>
            <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">{formatQty(totals.ton_dau_ky)}</td>
            <td className="px-4 py-3 text-right font-mono font-black text-emerald-700">
              {formatQty(totals.nhap_trong_ky)}
            </td>
            <td className="px-4 py-3 text-right font-mono font-black text-amber-700">
              {formatQty(totals.xuat_trong_ky)}
            </td>
            <td className="px-4 py-3 text-right font-mono font-black text-sky-700">
              {formatAdjustment(totals.dieu_chinh_trong_ky)}
            </td>
            <td className="px-4 py-3 text-right font-mono font-black text-zinc-900">{formatQty(totals.ton_cuoi_ky)}</td>
          </TableRow>
        )}
      </TableBody>
    </TableShell>
  );

  const renderMovementTable = (
    rows: TonKhoMovementRow[],
    emptyText: string,
    accentClass: string
  ) => (
    <TableShell minWidthClassName="min-w-[980px]" maxHeightClassName="max-h-[560px]">
      <TableHead>
        <TableHeadCell>Ngày</TableHeadCell>
        <TableHeadCell>Phiếu</TableHeadCell>
        <TableHeadCell>Mã SP</TableHeadCell>
        <TableHeadCell>Mã QR</TableHeadCell>
        <TableHeadCell>Tên sản phẩm</TableHeadCell>
        <TableHeadCell>Kho</TableHeadCell>
        <TableHeadCell>Ca</TableHeadCell>
        <TableHeadCell align="center">SL</TableHeadCell>
        <TableHeadCell>Loại</TableHeadCell>
      </TableHead>
      <TableBody>
        {rows.map(row => (
          <React.Fragment key={row.id}>
            <TableRow>
              <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{formatIsoToVi(row.ngay_phieu)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-zinc-900">{row.ma_phieu || '—'}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-zinc-900">{row.ma_sp_goc}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold text-zinc-700">{row.ma_sp_qr}</td>
              <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten || '—'}</td>
              <td className="px-4 py-3 font-semibold text-zinc-600">{row.kho || '—'}</td>
              <td className="px-4 py-3 font-semibold text-zinc-600">{row.ca || '—'}</td>
              <td className={`px-4 py-3 text-right font-mono font-black ${accentClass}`}>{formatQty(row.so_luong)}</td>
              <td className="px-4 py-3 font-semibold text-zinc-600">
                {row.la_dieu_chinh ? 'Điều chỉnh' : 'Thường'}
              </td>
            </TableRow>
          </React.Fragment>
        ))}
        {!isLoading && rows.length === 0 && <TableEmptyRow colSpan={9}>{emptyText}</TableEmptyRow>}
      </TableBody>
    </TableShell>
  );

  const mainTabs: Array<{
    key: TonKhoMainTab;
    label: string;
    shortLabel: string;
    hint: string;
    Icon: typeof ClipboardCheck;
  }> = [
    {
      key: 'kiem-ton',
      label: 'Kiểm tồn',
      shortLabel: 'Kiểm tồn',
      hint: 'Chi tiết QR đang trong kho và bảng tổng hợp kỳ',
      Icon: ClipboardCheck
    },
    {
      key: 'xuat-kho',
      label: 'Xuất kho',
      shortLabel: 'Xuất kho',
      hint: 'Các mã QR xuất trong kỳ đã chọn',
      Icon: ArrowUpFromLine
    },
    {
      key: 'nhap-kho',
      label: 'Nhập kho',
      shortLabel: 'Nhập kho',
      hint: 'Các mã QR nhập trong kỳ đã chọn',
      Icon: ArrowDownToLine
    }
  ];

  const showPeriodFilters = mainTab !== 'kiem-ton' || kiemTonView === 'tong-hop';

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
            placeholder="Tìm mã sản phẩm, tên, kho, phiếu..."
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
          {showPeriodFilters ? (
            <>
              <TableDateFilter label="Ngày đầu kỳ" value={fromDate} onChange={setFromDate} />
              <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
            </>
          ) : null}
        </TableToolbar>
      </section>

      <nav
        aria-label="Chức năng tồn kho"
        className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2 lg:p-3"
      >
        {mainTabs.map(tab => {
          const active = mainTab === tab.key;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setMainTab(tab.key)}
              className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
                active
                  ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
                  active ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'
                }`}
              >
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">{tab.shortLabel}</span>
                <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">{tab.label}</span>
                <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">{tab.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {mainTab === 'kiem-ton' ? (
        <>
          <nav
            aria-label="Kiểm tồn"
            className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2"
          >
            <button
              type="button"
              aria-current={kiemTonView === 'chi-tiet' ? 'page' : undefined}
              onClick={() => setKiemTonView('chi-tiet')}
              className={`group flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left ${
                kiemTonView === 'chi-tiet'
                  ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${kiemTonView === 'chi-tiet' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                <ListChecks className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Chi tiết</span>
                <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Danh sách chi tiết</span>
              </span>
            </button>
            <button
              type="button"
              aria-current={kiemTonView === 'tong-hop' ? 'page' : undefined}
              onClick={() => setKiemTonView('tong-hop')}
              className={`group flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left ${
                kiemTonView === 'tong-hop'
                  ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${kiemTonView === 'tong-hop' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                <BarChart3 className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Tổng hợp</span>
                <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Bảng tổng hợp</span>
              </span>
            </button>
          </nav>

          {kiemTonView === 'chi-tiet' ? (
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
                <div>
                  <h2 className="text-sm font-black text-zinc-900">Danh sách chi tiết sản phẩm trong kho</h2>
                  <p className="text-[11px] font-semibold text-zinc-500">{filteredChiTiet.length} mã QR</p>
                </div>
              </div>

              <TableShell minWidthClassName="min-w-[820px]" maxHeightClassName="max-h-[560px]">
                <TableHead>
                  <TableHeadCell>Mã SP</TableHeadCell>
                  <TableHeadCell>Mã SP chi tiết</TableHeadCell>
                  <TableHeadCell>Tên sản phẩm</TableHeadCell>
                  <TableHeadCell>Loại sản phẩm</TableHeadCell>
                  <TableHeadCell>Kho</TableHeadCell>
                  <TableHeadCell align="center">Số lượng</TableHeadCell>
                </TableHead>
                <TableBody>
                  {filteredChiTiet.map(row => (
                    <React.Fragment key={row.ma_sp_qr}>
                      <TableRow>
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-base font-black text-zinc-900">{row.ma_sp_goc}</td>
                        <td className="whitespace-nowrap px-5 py-4 font-mono text-base font-semibold text-zinc-700">{row.ma_sp_qr}</td>
                        <td className="px-5 py-4 text-base font-bold text-zinc-700">{row.ten || '—'}</td>
                        <td className="px-5 py-4 font-semibold text-zinc-600">
                          {row.loai_sp || 'Thành phẩm'}
                        </td>
                        <td className="px-5 py-4 font-semibold text-zinc-600">{row.ten_kho || '—'}</td>
                        <td className="px-5 py-4 text-right font-mono text-base font-black text-zinc-900">
                          {formatQty(row.so_luong)}
                        </td>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {!isLoading && filteredChiTiet.length === 0 && (
                    <TableEmptyRow colSpan={6}>Không có mã QR thành phẩm đang trong kho.</TableEmptyRow>
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
              {renderTongHopTable(
                filteredTongHop,
                tongHopTotals,
                'Không có dữ liệu phù hợp bộ lọc.',
                isLoading
              )}
            </section>
          )}
        </>
      ) : null}

      {mainTab === 'xuat-kho' ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <div>
              <h2 className="text-sm font-black text-zinc-900">Xuất kho trong kỳ</h2>
              <p className="text-[11px] font-semibold text-zinc-500">{filteredXuat.length} dòng QR</p>
            </div>
          </div>
          {renderMovementTable(filteredXuat, 'Không có phiếu xuất trong kỳ đã chọn.', 'text-amber-700')}
        </section>
      ) : null}

      {mainTab === 'nhap-kho' ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <div>
              <h2 className="text-sm font-black text-zinc-900">Nhập kho trong kỳ</h2>
              <p className="text-[11px] font-semibold text-zinc-500">{filteredNhap.length} dòng QR</p>
            </div>
          </div>
          {renderMovementTable(filteredNhap, 'Không có phiếu nhập trong kỳ đã chọn.', 'text-emerald-700')}
        </section>
      ) : null}
    </div>
  );
}

export default TonKhoPanel;
