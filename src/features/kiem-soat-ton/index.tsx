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

      <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="">
        <TableHead>
          <TableHeadCell align="center">STT</TableHeadCell>
          <TableHeadCell>Mã</TableHeadCell>
          <TableHeadCell>Tên</TableHeadCell>
          <TableHeadCell>Kho</TableHeadCell>
          <TableHeadCell align="center">ĐVT</TableHeadCell>
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
          {isLoading ? <TableEmptyRow colSpan={8}>Đang tính tồn…</TableEmptyRow> : null}
          {!isLoading && sortedItems.length === 0 ? (
            <TableEmptyRow colSpan={8}>Không có mặt hàng phù hợp bộ lọc.</TableEmptyRow>
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
    </div>
  );
}
