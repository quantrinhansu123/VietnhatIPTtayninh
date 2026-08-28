import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { formatNumber } from '../utils';
import { machineValueMatchesFilter } from '../utils/controlBoardShiftSummary';
import { shiftNamesMatch } from '../utils/shiftSettings';
import {
  fetchCanTuDongTongHop,
  sumCanTuDongTongHopRows,
  syncCanTuDongTongHop,
  type CanTuDongTongHopRow
} from '../utils/canTuDongTongHop';

function formatIsoDateVi(iso?: string | null) {
  const raw = String(iso ?? '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatKg(value: number, digits = 2) {
  if (!Number.isFinite(value) || value === 0) return '—';
  return `${formatNumber(value, digits)} kg`;
}

export default function BbCanTuDongTongHopPanel({
  isLoading: parentLoading,
  shiftFilter = 'all',
  dateFrom = '',
  dateTo = '',
  machineFilter = 'all',
  selectedMachine = null
}: {
  isLoading?: boolean;
  shiftFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
}) {
  const [rows, setRows] = useState<CanTuDongTongHopRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'syncing' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const load = async (opts?: { syncIfEmpty?: boolean }) => {
    setStatus('loading');
    setMessage('');
    try {
      const items = await fetchCanTuDongTongHop({ from: dateFrom, to: dateTo });
      if (opts?.syncIfEmpty && items.length === 0 && (dateFrom || dateTo)) {
        setStatus('syncing');
        const synced = await syncCanTuDongTongHop({ from: dateFrom, to: dateTo, rebuild: true });
        setRows(synced.items);
        setStatus('ready');
        setMessage(
          synced.total > 0
            ? `Đã tổng hợp ${formatNumber(synced.total, 0)} nhóm Ngày · Ca · Máy.`
            : 'Chưa có lần cân trong khoảng ngày này.'
        );
        return;
      }
      setRows(items);
      setStatus('ready');
    } catch (error) {
      setRows([]);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Lỗi tải tổng hợp cân thực tế.');
    }
  };

  useEffect(() => {
    void load({ syncIfEmpty: true });
    // Chỉ tải lại khi khoảng ngày đã Áp dụng — ca/máy lọc trên client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const filtered = useMemo(
    () =>
      rows.filter(row => {
        if (shiftFilter && shiftFilter !== 'all' && !shiftNamesMatch(row.ca, shiftFilter)) return false;
        if (machineFilter && machineFilter !== 'all') {
          return machineValueMatchesFilter(machineFilter, selectedMachine, row.may);
        }
        return true;
      }),
    [rows, shiftFilter, machineFilter, selectedMachine]
  );

  const totals = useMemo(() => sumCanTuDongTongHopRows(filtered), [filtered]);
  const busy = status === 'loading' || status === 'syncing' || parentLoading;

  const handleSync = async () => {
    setStatus('syncing');
    setMessage('');
    try {
      const synced = await syncCanTuDongTongHop({ from: dateFrom, to: dateTo, rebuild: true });
      setRows(synced.items);
      setStatus('ready');
      setMessage(
        synced.total > 0
          ? `Đã tổng hợp ${formatNumber(synced.total, 0)} nhóm Ngày · Ca · Máy.`
          : 'Chưa có lần cân trong khoảng ngày này.'
      );
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Không đồng bộ được tổng hợp cân thực tế.');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wider text-red-800">
          Tổng hợp cân thực tế (DB)
        </p>
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-[11px] font-black text-red-700 shadow-xs transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'syncing' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {status === 'syncing' ? 'Đang tổng hợp...' : 'Đồng bộ từ cân AI'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-red-200/80 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-black uppercase tracking-tight text-red-700">Số cuộn thực tế</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-zinc-900">
            {busy ? '…' : totals.so_cuon > 0 ? formatNumber(totals.so_cuon, 0) : '—'}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">Số lần cân / số cuộn</p>
        </div>
        <div className="rounded-xl border border-red-200/80 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-black uppercase tracking-tight text-red-700">
            Tổng trọng lượng thực tế
          </p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-zinc-900">
            {busy ? '…' : formatKg(totals.tong_trong_luong_kg, 2)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">Σ Cân sản phẩm (kg)</p>
        </div>
      </div>

      {message ? (
        <p className={`text-xs font-semibold ${status === 'error' ? 'text-red-700' : 'text-zinc-500'}`}>
          {message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-[640px] w-full text-left text-sm font-semibold">
          <thead className="border-b-2 border-red-200 bg-red-50/80 text-xs uppercase tracking-wider text-red-950 font-black">
            <tr>
              <th className="px-3 py-3 font-black">Ngày</th>
              <th className="px-3 py-3 font-black">Ca</th>
              <th className="px-3 py-3 font-black">Máy</th>
              <th className="px-3 py-3 text-right font-black">Số cuộn thực tế</th>
              <th className="px-3 py-3 text-right font-black">Tổng trọng lượng thực tế</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {busy ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {status === 'syncing'
                    ? 'Đang tổng hợp từ cân AI (không tải từng phiếu)...'
                    : 'Đang tải tổng hợp cân thực tế...'}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Chưa có tổng hợp. Bấm «Đồng bộ từ cân AI» hoặc «Tính toán».
                </td>
              </tr>
            ) : (
              filtered.map(row => (
                <tr key={row.khoa_on_dinh || `${row.ngay}|${row.ca}|${row.may}`} className="hover:bg-red-50/40">
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-900">
                    {formatIsoDateVi(row.ngay)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-bold text-sky-900">{row.ca || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-800">
                    {row.may || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-black text-zinc-900">
                    {formatNumber(row.so_cuon, 0)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-black text-emerald-800">
                    {formatKg(Number(row.tong_trong_luong_kg) || 0, 2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!busy && filtered.length > 0 ? (
            <tfoot className="border-t-2 border-red-200 bg-red-50/70 text-xs font-black text-red-950">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right uppercase tracking-wider">
                  Tổng
                </td>
                <td className="px-3 py-3 text-right font-mono">{formatNumber(totals.so_cuon, 0)}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-800">
                  {formatKg(totals.tong_trong_luong_kg, 2)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
