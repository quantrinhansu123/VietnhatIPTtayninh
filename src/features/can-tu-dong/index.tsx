import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Scale, Trash2 } from 'lucide-react';
import { BackButton } from '../../components/layout/NavButtons';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from '../../components/WeighingImagePreviewModal';
import { formatNumber } from '../../utils';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import {
  DEFAULT_CAN_TU_DONG_BI_KG,
  filterCanTuDongRecordsForBoard,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  sumCanTuDongSanLuongTotals
} from '../../utils/canTuDongWeights';
import {
  TableToolbar,
  TableSearchInput,
  FilterCombobox,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow
} from '../../components/shared/table';

/**
 * Ý nghĩa cột DB / hiển thị:
 * - tare_weight      = Cân lõi
 * - weight           = Cân sản phẩm (còn lõi)
 * - Trọng lượng bì   = mặc định 0,16 kg
 * - Trọng lượng nhựa = SP − lõi − bì
 * - core_image_*     = Ảnh cân lõi
 * - product_image_*  = Ảnh cân sản phẩm
 */
export type CanTuDongRecord = {
  id: number | string;
  event_id?: string | null;
  qr_code?: string | null;
  /** Ca sản xuất (SOURCE_SHIFT metadata hoặc suy từ giờ captured_at). */
  ca?: string | null;
  /** Cân sản phẩm (còn lõi) */
  weight?: number | string | null;
  /** Cân lõi */
  tare_weight?: number | string | null;
  /** Khối lượng thực */
  net_weight?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  product_image_path?: string | null;
  product_image_url?: string | null;
  product_image_public_id?: string | null;
  product_preview_url?: string | null;
  preview_url?: string | null;
  core_image_path?: string | null;
  core_image_url?: string | null;
  core_image_public_id?: string | null;
  core_preview_url?: string | null;
  can_loi?: number | string | null;
  can_san_pham?: number | string | null;
  khoi_luong_thuc?: number | string | null;
  device_id?: string | null;
  weight_source?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultFromDate(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, days - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatWeight(
  value?: number | string | null,
  unit?: string | null,
  fractionDigits: number = 1
) {
  if (value == null || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return String(value);
  const unitLabel = String(unit ?? 'kg').trim() || 'kg';
  return `${formatNumber(num, fractionDigits)} ${unitLabel}`;
}

function statusClass(status?: string | null) {
  const key = String(status ?? '')
    .trim()
    .toLowerCase();
  if (key === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (key === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key === 'rejected' || key === 'error') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

function resolveProductImageUrl(row: CanTuDongRecord) {
  return String(row.product_preview_url || row.preview_url || row.product_image_url || '').trim();
}

function resolveCoreImageUrl(row: CanTuDongRecord) {
  return String(row.core_preview_url || row.core_image_url || '').trim();
}

function ImageCell({
  url,
  title,
  emptyLabel,
  onView
}: {
  url: string;
  title: string;
  emptyLabel: string;
  onView: () => void;
}) {
  if (!url) {
    return (
      <span className="inline-flex h-12 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-[10px] font-bold text-zinc-400">
        {emptyLabel}
      </span>
    );
  }
  return <WeighingImageThumbnail url={url} alt={title} title={title} onView={onView} />;
}

function rowIdKey(id: number | string) {
  return String(id);
}

export function CanTuDongPanel({
  onBack,
  initialFilters
}: {
  onBack: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const [records, setRecords] = useState<CanTuDongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromDate, setFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || defaultFromDate(14)
  );
  const [toDate, setToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [deviceFilter, setDeviceFilter] = useState('');
  const [qrFilter, setQrFilter] = useState('');
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedCa, setSelectedCa] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? 'all' : shift;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '2000' });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (deviceFilter.trim()) params.set('deviceId', deviceFilter.trim());
      if (qrFilter.trim()) params.set('qrCode', qrFilter.trim());

      const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(res, errorData, 'Không tải được cân tự động.'));
      }
      const payload = await res.json();
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setSelectedIds(new Set());
    } catch (err: any) {
      const message = err?.message || 'Không tải được cân tự động.';
      setError(message);
      setRecords([]);
      setSelectedIds(new Set());
      showAppToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load lần đầu; lọc bằng nút Tải lại
  }, []);

  const deviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of records) {
      const id = String(row.device_id ?? '').trim();
      if (id) set.add(id);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of records) {
      const status = String(row.status ?? '').trim();
      if (status) set.add(status);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const caOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of records) {
      const ca = String(row.ca ?? '').trim();
      if (ca) set.add(ca);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const hasActiveFilters =
    Boolean(searchText.trim()) || selectedStatus !== 'all' || selectedCa !== 'all';

  const resetFilters = () => {
    setSearchText('');
    setSelectedStatus('all');
    setSelectedCa('all');
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRecords = useMemo(() => {
    const byDateAndCa = filterCanTuDongRecordsForBoard(records, {
      shiftFilter: selectedCa,
      dateFrom: fromDate,
      dateTo: toDate
    });
    return byDateAndCa.filter(row => {
      const matchesStatus = selectedStatus === 'all' || String(row.status ?? '').trim() === selectedStatus;
      const matchesSearch =
        !normalizedSearch ||
        `${row.qr_code ?? ''} ${row.event_id ?? ''} ${row.device_id ?? ''} ${row.weight_source ?? ''} ${row.ca ?? ''}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [records, normalizedSearch, selectedStatus, selectedCa, fromDate, toDate]);

  const visibleIds = useMemo(
    () => filteredRecords.map(row => rowIdKey(row.id)).filter(Boolean),
    [filteredRecords]
  );

  const trongLuongNhuaTotals = useMemo(
    () => sumCanTuDongSanLuongTotals(filteredRecords),
    [filteredRecords]
  );

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    if (!id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    if (
      !window.confirm(
        `Xóa ${ids.length} dòng cân tự động đã chọn?\n\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/can-tu-dong/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa các dòng đã chọn.');
      }
      const deleted = Number(data.deleted) || ids.length;
      showAppToast(`Đã xóa ${deleted} dòng cân tự động.`);
      await loadRecords();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể xóa các dòng đã chọn.';
      showAppToast(message, 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackButton onClick={onBack} />
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ef1b2d]/10 text-[#ef1b2d]">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-black text-zinc-900 sm:text-xl">Cân tự động</h1>
              <p className="text-xs font-semibold text-zinc-500">
                Cân lõi · Cân sản phẩm · Trọng lượng bì (0,16) · Trọng lượng nhựa (= SP − lõi − bì)
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadRecords()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ef1b2d] px-3 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Tải lại
        </button>
      </div>

      <div className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Từ ngày
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
        </label>
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Đến ngày
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
        </label>
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
          Thiết bị
          <input
            list="can-tu-dong-devices"
            value={deviceFilter}
            onChange={e => setDeviceFilter(e.target.value)}
            placeholder="station-01"
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
          <datalist id="can-tu-dong-devices">
            {deviceOptions.map(id => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </label>
        <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:col-span-2 lg:col-span-1">
          Mã QR
          <input
            value={qrFilter}
            onChange={e => setQrFilter(e.target.value)}
            placeholder="ROLL-..."
            className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
          />
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-1">
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
          >
            Áp dụng lọc
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <TableToolbar isLoading={loading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm QR, thiết bị..."
          disabled={loading}
        />
        <FilterCombobox
          label="Ca"
          options={caOptions}
          value={selectedCa}
          onChange={setSelectedCa}
          searchPlaceholder="Tìm ca..."
          compact
        />
        <FilterCombobox
          label="Trạng thái"
          options={statusOptions}
          value={selectedStatus}
          onChange={setSelectedStatus}
          searchPlaceholder="Tìm trạng thái..."
          compact
        />
      </TableToolbar>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
          <p className="mr-auto text-xs font-bold text-rose-800">Đã chọn {selectedCount} dòng</p>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkDeleting}
            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={isBulkDeleting}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {isBulkDeleting ? 'Đang xóa...' : `Xóa đã chọn (${selectedCount})`}
          </button>
        </div>
      ) : null}

      <TableShell
        minWidthClassName="min-w-[1280px]"
        footer={
          !loading && filteredRecords.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-950">
              <span className="uppercase tracking-wider">
                Tổng ({trongLuongNhuaTotals.quantity} lần cân) · Trọng lượng nhựa
              </span>
              <span className="font-mono text-sm text-emerald-800">
                {formatNumber(trongLuongNhuaTotals.weightKg, 2)} kg
              </span>
            </div>
          ) : undefined
        }
      >
        <TableHead>
          <TableHeadCell className="w-10 text-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={loading || visibleIds.length === 0 || isBulkDeleting}
              aria-label="Chọn tất cả dòng đang xem"
              className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
            />
          </TableHeadCell>
          <TableHeadCell>Ảnh lõi</TableHeadCell>
          <TableHeadCell>Ảnh sản phẩm</TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Thời điểm</TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Ca</TableHeadCell>
          <TableHeadCell>QR</TableHeadCell>
          <TableHeadCell title="tare_weight">Cân lõi</TableHeadCell>
          <TableHeadCell title="weight — còn lõi">Cân sản phẩm</TableHeadCell>
          <TableHeadCell title={`Mặc định ${DEFAULT_CAN_TU_DONG_BI_KG} kg`}>
            Trọng lượng bì
          </TableHeadCell>
          <TableHeadCell title="Cân SP − Cân lõi − Trọng lượng bì">Trọng lượng nhựa</TableHeadCell>
          <TableHeadCell>Thiết bị</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={12}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải cân tự động…
              </span>
            </TableEmptyRow>
          ) : filteredRecords.length === 0 ? (
            <TableEmptyRow colSpan={12}>Không có bản ghi trong khoảng lọc.</TableEmptyRow>
          ) : (
            filteredRecords.map(row => {
              const idKey = rowIdKey(row.id);
              const coreUrl = resolveCoreImageUrl(row);
              const productUrl = resolveProductImageUrl(row);
              const coreTitle = `Ảnh cân lõi · ${row.qr_code || row.event_id || row.id}`;
              const productTitle = `Ảnh cân sản phẩm · ${row.qr_code || row.event_id || row.id}`;
              const canLoi = row.can_loi ?? row.tare_weight;
              const canSp = row.can_san_pham ?? row.weight;
              const trongLuongBi = resolveTrongLuongBiKg(row);
              const trongLuongNhua = resolveTrongLuongNhuaKg(row);
              return (
                <TableRow key={idKey}>
                  <td className="px-4 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(idKey)}
                      onChange={() => toggleSelected(idKey)}
                      disabled={isBulkDeleting}
                      aria-label={`Chọn dòng ${idKey}`}
                      className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={coreUrl}
                      title={coreTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: coreUrl, title: coreTitle })}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={productUrl}
                      title={productTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: productUrl, title: productTitle })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateTime(row.captured_at || row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-sky-900">
                    {row.ca || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-zinc-900">
                    {row.qr_code || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-sky-800">
                    {formatWeight(canLoi, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-800">
                    {formatWeight(canSp, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatWeight(trongLuongBi, row.unit, 2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-black text-emerald-800">
                    {trongLuongNhua !== null ? formatWeight(trongLuongNhua, row.unit, 2) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {row.device_id || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {row.status || '—'}
                    </span>
                  </td>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableShell>

      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />
    </div>
  );
}

export default CanTuDongPanel;
