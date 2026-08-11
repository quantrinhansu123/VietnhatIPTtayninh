import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatNumber } from '../utils';
import {
  DEFAULT_CAN_TU_DONG_BI_KG,
  filterCanTuDongRecordsForBoard,
  resolveCanLoiKg,
  resolveCanSpKg,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  sumCanTuDongSanLuongTotals
} from '../utils/canTuDongWeights';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
import type { CanTuDongRecord } from '../features/can-tu-dong';

export {
  DEFAULT_CAN_TU_DONG_BI_KG,
  filterCanTuDongRecordsForBoard,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  sumCanTuDongSanLuongTotals
} from '../utils/canTuDongWeights';

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
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
  const num = asFiniteNumber(value);
  if (num === null) return String(value);
  const unitLabel = String(unit ?? 'kg').trim() || 'kg';
  return `${formatNumber(num, fractionDigits)} ${unitLabel}`;
}

function resolveProductImageUrl(row: CanTuDongRecord) {
  return String(row.product_preview_url || row.preview_url || row.product_image_url || '').trim();
}

function resolveCoreImageUrl(row: CanTuDongRecord) {
  return String(row.core_preview_url || row.core_image_url || '').trim();
}

export default function BbCanTuDongSanLuongPanel({
  records,
  isLoading,
  shiftFilter = 'all',
  dateFrom = '',
  dateTo = ''
}: {
  records: CanTuDongRecord[];
  isLoading?: boolean;
  shiftFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const filtered = useMemo(
    () =>
      filterCanTuDongRecordsForBoard(records, {
        shiftFilter,
        dateFrom,
        dateTo
      }),
    [records, shiftFilter, dateFrom, dateTo]
  );
  const totals = useMemo(() => sumCanTuDongSanLuongTotals(filtered), [filtered]);

  return (
    <>
      <table className="min-w-[1180px] w-full text-left text-sm font-semibold">
        <thead className="bg-[#ef1b2d] border-b border-red-700 text-xs uppercase tracking-wider text-white">
          <tr>
            <th className="px-3 py-3.5 font-black">Ảnh lõi</th>
            <th className="px-3 py-3.5 font-black">Ảnh SP</th>
            <th className="px-3 py-3.5 font-black">Thời điểm</th>
            <th className="px-3 py-3.5 font-black">Ca</th>
            <th className="px-3 py-3.5 font-black">QR</th>
            <th className="px-3 py-3.5 text-right font-black" title="tare_weight">
              Cân lõi
            </th>
            <th className="px-3 py-3.5 text-right font-black" title="weight — còn lõi">
              Cân sản phẩm
            </th>
            <th
              className="px-3 py-3.5 text-right font-black"
              title={`Mặc định ${formatNumber(DEFAULT_CAN_TU_DONG_BI_KG, 2)} kg`}
            >
              Trọng lượng bì
            </th>
            <th
              className="px-3 py-3.5 text-right font-black"
              title="Cân SP − Cân lõi − Trọng lượng bì"
            >
              Trọng lượng nhựa
            </th>
            <th className="px-3 py-3.5 font-black">Thiết bị</th>
            <th className="px-3 py-3.5 font-black">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-violet-100">
          {isLoading ? (
            <tr>
              <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải cân tự động...
              </td>
            </tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                Chưa có dữ liệu cân tự động theo ngày/ca đã lọc.
              </td>
            </tr>
          ) : (
            filtered.map(row => {
              const coreUrl = resolveCoreImageUrl(row);
              const productUrl = resolveProductImageUrl(row);
              const canLoi = resolveCanLoiKg(row);
              const canSp = resolveCanSpKg(row);
              const trongLuongBi = resolveTrongLuongBiKg(row);
              const trongLuongNhua = resolveTrongLuongNhuaKg(row);
              const coreTitle = `Ảnh cân lõi · ${row.qr_code || row.event_id || row.id}`;
              const productTitle = `Ảnh cân sản phẩm · ${row.qr_code || row.event_id || row.id}`;
              return (
                <tr key={String(row.id)} className="transition hover:bg-violet-50/50">
                  <td className="px-3 py-2">
                    {coreUrl ? (
                      <WeighingImageThumbnail
                        url={coreUrl}
                        alt={coreTitle}
                        title={coreTitle}
                        onClick={() => setViewingImage({ url: coreUrl, title: coreTitle })}
                      />
                    ) : (
                      <span className="text-xs font-bold text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {productUrl ? (
                      <WeighingImageThumbnail
                        url={productUrl}
                        alt={productTitle}
                        title={productTitle}
                        onClick={() => setViewingImage({ url: productUrl, title: productTitle })}
                      />
                    ) : (
                      <span className="text-xs font-bold text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                    {formatDateTime(row.captured_at || row.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-800">
                    {row.ca || '—'}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 font-mono text-xs text-zinc-700">
                    {row.qr_code || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-zinc-700">
                    {formatWeight(canLoi, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-zinc-700">
                    {formatWeight(canSp, row.unit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-zinc-600">
                    {formatWeight(trongLuongBi, row.unit, 2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-black text-amber-800">
                    {trongLuongNhua !== null ? formatWeight(trongLuongNhua, row.unit, 2) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{row.device_id || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-bold text-zinc-600">
                    {row.status || '—'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {!isLoading && filtered.length > 0 ? (
          <tfoot className="border-t-2 border-violet-300 bg-violet-50 text-xs font-black text-violet-950">
            <tr>
              <td colSpan={8} className="px-3 py-3 text-right uppercase tracking-wider">
                Tổng ({totals.quantity} lần cân) · Trọng lượng nhựa
              </td>
              <td className="px-3 py-3 text-right font-mono text-amber-800">
                {formatNumber(totals.weightKg, 2)} kg
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        ) : null}
      </table>
      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />
    </>
  );
}
