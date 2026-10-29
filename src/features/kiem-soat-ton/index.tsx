import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, RefreshCw, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import {
  FilterCombobox,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination
} from '../../components/shared/table';

type StockStatus = 'am' | 'duoi_toi_thieu' | 'sap_het' | 'on_dinh' | 'chua_dat_nguong';
type LoaiKho = 'nvl' | 'san_pham';

type ControlItem = {
  ma: string;
  ten: string;
  don_vi: string | null;
  ten_kho: string | null;
  ton_dau: number;
  nhap: number;
  xuat: number;
  ton: number;
  min: number | null;
  status: StockStatus;
};

type TreoSlip = { ma_phieu: string; loai: 'nhap' | 'xuat'; ngay: string; kho: string; so_ngay: number };

type ControlData = {
  items: ControlItem[];
  summary: Record<StockStatus | 'tong', number>;
  treo: TreoSlip[];
  thresholdColumnMissing?: boolean;
  ngay?: string;
};

type DetailLine = {
  id: string | number;
  ma_phieu: string;
  ngay: string;
  gio?: string;
  ngay_gio?: string;
  ca: string;
  may: string;
  kho: string;
  nguoi_lap: string;
  ly_do: string;
  ma_dong: string;
  ten_dong: string;
  don_vi: string;
  so_luong: number;
};

type DetailSlip = {
  ma_phieu: string;
  ngay?: string;
  gio?: string;
  ngay_gio?: string;
  ca: string;
  may: string;
  kho: string;
  nguoi_lap: string;
  ly_do: string;
  tong: number;
  so_dong: number;
  lines: DetailLine[];
};

type DetailDay = {
  ngay: string;
  tong: number;
  so_phieu: number;
  so_dong: number;
  phieu: DetailSlip[];
};

type DetailPayload = {
  ma: string;
  ten: string;
  loai: 'nhap' | 'xuat';
  tong: number;
  so_phieu: number;
  so_dong: number;
  den_ngay?: string;
  days: DetailDay[];
};

const EMPTY_SUMMARY = { am: 0, duoi_toi_thieu: 0, sap_het: 0, on_dinh: 0, chua_dat_nguong: 0, tong: 0 };
/** Phiếu treo quá số ngày này bị coi là để lâu. */
const TREO_STALE_DAYS = 3;

const STATUS_META: Record<StockStatus, { label: string; card: string; badge: string }> = {
  am: { label: 'Tồn âm', card: 'border-rose-200 bg-rose-50 text-rose-800', badge: 'bg-rose-100 text-rose-700' },
  duoi_toi_thieu: {
    label: 'Dưới tối thiểu',
    card: 'border-orange-200 bg-orange-50 text-orange-800',
    badge: 'bg-orange-100 text-orange-700'
  },
  sap_het: { label: 'Sắp hết', card: 'border-amber-200 bg-amber-50 text-amber-800', badge: 'bg-amber-100 text-amber-700' },
  chua_dat_nguong: {
    label: 'Chưa đặt ngưỡng',
    card: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    badge: 'bg-zinc-100 text-zinc-600'
  },
  on_dinh: { label: 'Ổn định', card: 'border-emerald-200 bg-emerald-50 text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' }
};
const STATUS_ORDER: StockStatus[] = ['am', 'duoi_toi_thieu', 'sap_het', 'chua_dat_nguong', 'on_dinh'];

function formatQty(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

/** Hiển thị ngày giờ rõ: `2026-10-29 03:45:28`. */
function formatNgayGio(value?: string, fallbackDay?: string) {
  const raw = String(value ?? '').trim();
  if (raw) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
    const date = new Date(raw);
    if (Number.isFinite(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    return raw;
  }
  return fallbackDay || '—';
}

function formatNgayLabel(day: string) {
  const raw = String(day ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

export function KiemSoatTonPanel({ onBack }: { onBack: () => void }) {
  const { canEdit } = useTabAccess('kiem-soat-ton');
  const [loaiKho, setLoaiKho] = useState<LoaiKho>('nvl');
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [tenKho, setTenKho] = useState('');
  const [data, setData] = useState<ControlData>({ items: [], summary: EMPTY_SUMMARY, treo: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('');
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [editingMa, setEditingMa] = useState('');
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [detailTarget, setDetailTarget] = useState<{ item: ControlItem; loai: 'nhap' | 'xuat' } | null>(null);
  const [detailData, setDetailData] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [expandedDay, setExpandedDay] = useState('');
  const [expandedSlip, setExpandedSlip] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/quan-ly-kho');
        const json = await response.json().catch(() => ({}));
        const records: Array<{ ten_kho?: string }> = response.ok && Array.isArray(json?.records) ? json.records : [];
        setWarehouses(Array.from(new Set(records.map(r => String(r.ten_kho ?? '').trim()).filter(Boolean))));
      } catch {
        setWarehouses([]);
      }
    })();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    const params = new URLSearchParams({ loai_kho: loaiKho });
    if (tenKho) params.set('ten_kho', tenKho);
    void (async () => {
      try {
        const response = await fetch(`/api/kiem-soat-ton?${params.toString()}`, { signal: controller.signal });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Không thể tải dữ liệu kiểm soát tồn.');
        setData({
          items: Array.isArray(json.items) ? json.items : [],
          summary: { ...EMPTY_SUMMARY, ...(json.summary || {}) },
          treo: Array.isArray(json.treo) ? json.treo : [],
          thresholdColumnMissing: Boolean(json.thresholdColumnMissing),
          ngay: json.ngay
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setData({ items: [], summary: EMPTY_SUMMARY, treo: [] });
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu kiểm soát tồn.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [loaiKho, tenKho, reloadNonce]);

  const normalizedSearch = searchText.trim().toLowerCase();
  // Mặt hàng cần xử lý lên đầu: tồn âm → dưới tối thiểu → sắp hết, rồi theo mã.
  const sortedItems = useMemo(() => {
    const rank = (status: StockStatus) => STATUS_ORDER.indexOf(status);
    return data.items
      .filter(item => {
        if (statusFilter && item.status !== statusFilter) return false;
        if (!normalizedSearch) return true;
        return `${item.ma} ${item.ten}`.toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => rank(a.status) - rank(b.status));
  }, [data.items, statusFilter, normalizedSearch]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, normalizedSearch, loaiKho, tenKho, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = useMemo(
    () => sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedItems, currentPage, pageSize]
  );

  const staleTreo = useMemo(() => data.treo.filter(slip => slip.so_ngay >= TREO_STALE_DAYS), [data.treo]);

  const startEdit = (item: ControlItem) => {
    setEditingMa(item.ma);
    setEditValue(item.min === null ? '' : String(item.min));
  };

  const saveThreshold = async (item: ControlItem) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/kiem-soat-ton/nguong', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loai_kho: loaiKho, ma: item.ma, min: editValue.trim() === '' ? null : Number(editValue) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiErrorMessage(response, result, 'Không thể lưu tồn tối thiểu.'));
      setEditingMa('');
      setReloadNonce(value => value + 1);
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể lưu tồn tối thiểu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openMovementDetail = (item: ControlItem, loai: 'nhap' | 'xuat') => {
    setDetailTarget({ item, loai });
    setDetailData(null);
    setDetailError('');
    setExpandedDay('');
    setExpandedSlip('');
  };

  const closeMovementDetail = () => {
    setDetailTarget(null);
    setDetailData(null);
    setDetailError('');
    setExpandedDay('');
    setExpandedSlip('');
  };

  useEffect(() => {
    if (!detailTarget) return;
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError('');
    const params = new URLSearchParams({
      loai_kho: loaiKho,
      ma: detailTarget.item.ma,
      loai: detailTarget.loai,
      ten: detailTarget.item.ten || ''
    });
    if (tenKho) params.set('ten_kho', tenKho);
    else if (detailTarget.item.ten_kho) params.set('ten_kho', detailTarget.item.ten_kho);
    void (async () => {
      try {
        const response = await fetch(`/api/kiem-soat-ton/chi-tiet?${params.toString()}`, {
          signal: controller.signal
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || 'Không thể tải chi tiết phiếu.');
        const payload: DetailPayload = {
          ma: String(json.ma ?? detailTarget.item.ma),
          ten: String(json.ten ?? detailTarget.item.ten ?? ''),
          loai: detailTarget.loai,
          tong: Number(json.tong) || 0,
          so_phieu: Number(json.so_phieu) || 0,
          so_dong: Number(json.so_dong) || 0,
          den_ngay: json.den_ngay,
          days: Array.isArray(json.days) ? json.days : []
        };
        setDetailData(payload);
        if (payload.days.length === 1) setExpandedDay(payload.days[0].ngay);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDetailData(null);
        setDetailError(err instanceof Error ? err.message : 'Không thể tải chi tiết phiếu.');
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();
    return () => controller.abort();
  }, [detailTarget, loaiKho, tenKho]);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            ← Quay lại
          </button>
          <div className="flex rounded-lg border border-zinc-200 p-0.5">
            {([['nvl', 'Nguyên vật liệu'], ['san_pham', 'Thành phẩm']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setLoaiKho(key);
                  setStatusFilter('');
                }}
                className={`h-8 rounded-md px-3 text-xs font-black transition ${
                  loaiKho === key ? 'bg-[#ef1b2d] text-white' : 'text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-w-[200px]">
            <FilterCombobox
              label="Kho"
              options={warehouses}
              value={tenKho || 'all'}
              onChange={value => setTenKho(value === 'all' ? '' : value)}
              searchPlaceholder="Tìm kho..."
            />
          </div>
          <TableSearchInput value={searchText} onChange={setSearchText} placeholder="Tìm mã, tên hàng..." />
          <button
            type="button"
            onClick={() => setReloadNonce(value => value + 1)}
            disabled={isLoading}
            title="Tải lại"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {data.ngay ? <span className="text-xs font-semibold text-zinc-500">Tồn đến hết ngày {data.ngay}</span> : null}
        </div>
        {error ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700">{error}</p>
        ) : null}
        {data.thresholdColumnMissing ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-800">
            Chưa có cột tồn tối thiểu. Hãy chạy supabase-kho-nvl-ton-toi-thieu.sql trên Supabase.
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {STATUS_ORDER.map(status => {
          const meta = STATUS_META[status];
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(active ? '' : status)}
              className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${meta.card} ${
                active ? 'ring-2 ring-[#ef1b2d]' : ''
              }`}
            >
              <p className="text-[11px] font-black uppercase tracking-wide">{meta.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{isLoading ? '…' : data.summary[status]}</p>
            </button>
          );
        })}
      </section>

      {staleTreo.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-black text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            {staleTreo.length} phiếu treo từ {TREO_STALE_DAYS} ngày trở lên chưa tính vào tồn
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {staleTreo.slice(0, 30).map(slip => (
              <span
                key={`${slip.loai}-${slip.ma_phieu}`}
                className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-amber-900 ring-1 ring-amber-200"
                title={`${slip.loai === 'nhap' ? 'Phiếu nhập' : 'Phiếu xuất'} · ${slip.kho || 'chưa gán kho'}`}
              >
                {slip.ma_phieu} · {slip.so_ngay} ngày
              </span>
            ))}
            {staleTreo.length > 30 ? (
              <span className="text-[11px] font-bold text-amber-800">+{staleTreo.length - 30} phiếu</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <TableShell minWidthClassName="min-w-[1100px]" maxHeightClassName="">
        <TableHead>
          <TableHeadCell align="center">STT</TableHeadCell>
          <TableHeadCell>Mã</TableHeadCell>
          <TableHeadCell>Tên</TableHeadCell>
          <TableHeadCell>Kho</TableHeadCell>
          <TableHeadCell align="center">ĐVT</TableHeadCell>
          <TableHeadCell align="center">Tồn đầu</TableHeadCell>
          <TableHeadCell align="center">Nhập</TableHeadCell>
          <TableHeadCell align="center">Xuất</TableHeadCell>
          <TableHeadCell align="center">Tồn hiện tại</TableHeadCell>
          <TableHeadCell align="center">Tồn tối thiểu</TableHeadCell>
          <TableHeadCell align="center">Trạng thái</TableHeadCell>
        </TableHead>
        <TableBody>
          {pagedItems.map((item, index) => {
            const meta = STATUS_META[item.status];
            const isEditing = editingMa === item.ma;
            return (
              <TableRow key={`${item.ma}-${item.ten_kho ?? ''}`}>
                <td className="px-3 py-2.5 text-center font-bold text-zinc-500">{(currentPage - 1) * pageSize + index + 1}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-black text-zinc-950">{item.ma}</td>
                <td className="px-3 py-2.5 text-zinc-700">{item.ten || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">{item.ten_kho || '—'}</td>
                <td className="px-3 py-2.5 text-center text-zinc-600">{item.don_vi || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-zinc-700">
                  {formatQty(item.ton_dau ?? 0)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                  <button
                    type="button"
                    onClick={() => openMovementDetail(item, 'nhap')}
                    title="Xem chi tiết phiếu nhập theo ngày"
                    className="rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-emerald-50 hover:text-emerald-900"
                  >
                    {formatQty(item.nhap ?? 0)}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-rose-700">
                  <button
                    type="button"
                    onClick={() => openMovementDetail(item, 'xuat')}
                    title="Xem chi tiết phiếu xuất theo ngày"
                    className="rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-rose-50 hover:text-rose-900"
                  >
                    {formatQty(item.xuat ?? 0)}
                  </button>
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right font-mono font-black tabular-nums ${
                    item.ton < 0 ? 'text-rose-600' : 'text-zinc-950'
                  }`}
                >
                  {formatQty(item.ton)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-zinc-700">
                  {isEditing ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        value={editValue}
                        onChange={event => setEditValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void saveThreshold(item);
                          if (event.key === 'Escape') setEditingMa('');
                        }}
                        className="h-8 w-24 rounded-md border border-zinc-300 px-2 text-right text-xs outline-none focus:border-[#ef1b2d]"
                      />
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void saveThreshold(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white disabled:opacity-50"
                        title="Lưu"
                      >
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMa('')}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500"
                        title="Hủy"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {formatQty(item.min)}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="text-zinc-400 hover:text-[#ef1b2d]"
                          title="Đặt tồn tối thiểu"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ${meta.badge}`}>
                    {meta.label}
                  </span>
                </td>
              </TableRow>
            );
          })}
          {isLoading ? <TableEmptyRow colSpan={11}>Đang tính tồn…</TableEmptyRow> : null}
          {!isLoading && sortedItems.length === 0 ? (
            <TableEmptyRow colSpan={11}>Không có mặt hàng phù hợp bộ lọc.</TableEmptyRow>
          ) : null}
        </TableBody>
      </TableShell>
      {sortedItems.length > 0 ? (
        <TablePagination
          totalRecords={sortedItems.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      {detailTarget ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/50 p-3 backdrop-blur-sm"
          onClick={closeMovementDetail}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div>
                <p className="text-sm font-black text-zinc-950">
                  Chi tiết {detailTarget.loai === 'nhap' ? 'nhập' : 'xuất'} kho · {detailTarget.item.ma}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {detailTarget.item.ten || '—'}
                  {detailData
                    ? ` · ${detailData.so_phieu} phiếu · ${detailData.so_dong} dòng · Tổng ${formatQty(detailData.tong)}`
                    : ''}
                  {detailData?.den_ngay ? ` · đến ${detailData.den_ngay}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMovementDetail}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
              {detailLoading ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải phiếu…
                </p>
              ) : null}
              {detailError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {detailError}
                </p>
              ) : null}

              {!detailLoading && detailData ? (
                <>
                  <TableShell minWidthClassName="min-w-[520px]" maxHeightClassName="">
                    <TableHead>
                      <TableHeadCell>STT</TableHeadCell>
                      <TableHeadCell>Ngày</TableHeadCell>
                      <TableHeadCell align="center">Số phiếu</TableHeadCell>
                      <TableHeadCell align="center">Số dòng</TableHeadCell>
                      <TableHeadCell align="center">Tổng SL</TableHeadCell>
                    </TableHead>
                    <TableBody>
                      {detailData.days.map((day, index) => {
                        const isOpen = expandedDay === day.ngay;
                        return (
                          <TableRow key={day.ngay}>
                            <td className="px-3 py-2.5 text-center font-bold text-zinc-500">{index + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-zinc-800" title={day.ngay}>
                              {formatNgayLabel(day.ngay)}
                            </td>
                            {[day.so_phieu, day.so_dong, formatQty(day.tong)].map((value, cellIndex) => (
                              <td key={cellIndex} className="px-3 py-2.5 text-right font-mono font-bold text-zinc-900">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedDay(prev => (prev === day.ngay ? '' : day.ngay));
                                    setExpandedSlip('');
                                  }}
                                  title="Xem phiếu trong ngày"
                                  className={`rounded px-1.5 underline decoration-dotted underline-offset-2 hover:bg-sky-50 hover:text-sky-800 ${
                                    isOpen ? 'bg-sky-100 text-sky-900' : ''
                                  }`}
                                >
                                  {value}
                                </button>
                              </td>
                            ))}
                          </TableRow>
                        );
                      })}
                      {detailData.days.length > 0 ? (
                        <TableRow>
                          <td colSpan={2} className="px-3 py-2.5 text-right text-xs font-black uppercase text-zinc-600">
                            Tổng
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-zinc-950">
                            {detailData.so_phieu}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-zinc-950">
                            {detailData.so_dong}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-zinc-950">
                            {formatQty(detailData.tong)}
                          </td>
                        </TableRow>
                      ) : null}
                      {detailData.days.length === 0 ? (
                        <TableEmptyRow colSpan={5}>Chưa có phiếu {detailTarget.loai === 'nhap' ? 'nhập' : 'xuất'}.</TableEmptyRow>
                      ) : null}
                    </TableBody>
                  </TableShell>

                  {expandedDay
                    ? detailData.days
                        .filter(day => day.ngay === expandedDay)
                        .map(day => (
                          <div key={day.ngay} className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                            <p className="text-xs font-black text-zinc-800">
                              Phiếu ngày {formatNgayLabel(day.ngay)} · {day.so_phieu} phiếu · Tổng {formatQty(day.tong)}
                            </p>
                            <TableShell minWidthClassName="min-w-[860px]" maxHeightClassName="">
                              <TableHead>
                                <TableHeadCell>STT</TableHeadCell>
                                <TableHeadCell>Ngày giờ</TableHeadCell>
                                <TableHeadCell>Mã phiếu</TableHeadCell>
                                <TableHeadCell>Kho</TableHeadCell>
                                <TableHeadCell>Ca</TableHeadCell>
                                <TableHeadCell>Máy</TableHeadCell>
                                <TableHeadCell>Người lập</TableHeadCell>
                                <TableHeadCell align="center">Dòng</TableHeadCell>
                                <TableHeadCell align="center">Tổng SL</TableHeadCell>
                              </TableHead>
                              <TableBody>
                                {day.phieu.map((slip, index) => {
                                  const slipKey = `${day.ngay}::${slip.ma_phieu}`;
                                  const isSlipOpen = expandedSlip === slipKey;
                                  return (
                                    <React.Fragment key={slipKey}>
                                      <TableRow>
                                        <td className="px-3 py-2.5 text-center font-bold text-zinc-500">{index + 1}</td>
                                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-black tabular-nums text-zinc-950">
                                          {formatNgayGio(slip.ngay_gio, day.ngay)}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono font-black text-zinc-950">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedSlip(prev => (prev === slipKey ? '' : slipKey))}
                                            title="Xem dòng trong phiếu"
                                            className={`rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-sky-50 ${
                                              isSlipOpen ? 'bg-sky-100 text-sky-900' : ''
                                            }`}
                                          >
                                            {slip.ma_phieu}
                                          </button>
                                        </td>
                                        <td className="px-3 py-2.5 text-zinc-700">{slip.kho || '—'}</td>
                                        <td className="px-3 py-2.5 text-zinc-700">{slip.ca || '—'}</td>
                                        <td className="px-3 py-2.5 text-zinc-700">{slip.may || '—'}</td>
                                        <td className="px-3 py-2.5 text-zinc-700">{slip.nguoi_lap || '—'}</td>
                                        <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-800">
                                          {slip.so_dong}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-black text-zinc-950">
                                          {formatQty(slip.tong)}
                                        </td>
                                      </TableRow>
                                      {isSlipOpen ? (
                                        <tr>
                                          <td colSpan={9} className="bg-white px-3 py-2">
                                            <table className="w-full min-w-[640px] text-left text-xs">
                                              <thead>
                                                <tr className="border-b border-zinc-200 text-[11px] uppercase text-zinc-500">
                                                  <th className="px-2 py-1.5 font-black">Ngày giờ</th>
                                                  <th className="px-2 py-1.5 font-black">Mã dòng</th>
                                                  <th className="px-2 py-1.5 font-black">Tên</th>
                                                  <th className="px-2 py-1.5 font-black">ĐVT</th>
                                                  <th className="px-2 py-1.5 text-right font-black">SL</th>
                                                  <th className="px-2 py-1.5 font-black">Lý do</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {slip.lines.map((line, lineIndex) => (
                                                  <tr
                                                    key={String(line.id || `${slip.ma_phieu}-${lineIndex}`)}
                                                    className="border-b border-zinc-100"
                                                  >
                                                    <td className="whitespace-nowrap px-2 py-1.5 font-mono font-bold tabular-nums text-zinc-800">
                                                      {formatNgayGio(line.ngay_gio, slip.ngay_gio || day.ngay)}
                                                    </td>
                                                    <td className="px-2 py-1.5 font-mono font-bold text-zinc-800">
                                                      {line.ma_dong || '—'}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-zinc-700">{line.ten_dong || '—'}</td>
                                                    <td className="px-2 py-1.5 text-zinc-600">{line.don_vi || '—'}</td>
                                                    <td className="px-2 py-1.5 text-right font-mono font-black text-zinc-950">
                                                      {formatQty(line.so_luong)}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-zinc-600">{line.ly_do || '—'}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </React.Fragment>
                                  );
                                })}
                              </TableBody>
                            </TableShell>
                          </div>
                        ))
                    : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
