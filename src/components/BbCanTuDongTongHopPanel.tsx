import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { formatNumber } from '../utils';
import type { ProductRow } from '../features/san-pham/types';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import { filterCanTuDongRecordsForBoard } from '../utils/canTuDongWeights';
import {
  buildCanTuDongTongHopDetailRows,
  explainCanTuDongTongHopRowFormulas,
  fetchCanTuDongSlimRecords,
  sumCanTuDongTongHopDetailRows,
  syncCanTuDongTongHop,
  type CanTuDongTongHopDetailRow
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

function formatSignedKg(value: number, digits = 2) {
  if (!Number.isFinite(value) || value === 0) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, digits)} kg`;
}

function formatPct(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, digits)}%`;
}

function signedClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return 'text-zinc-700';
  return value > 0 ? 'text-amber-800' : 'text-rose-800';
}

type CanTuDongFormulaDetail = {
  title: string;
  value: string;
  formula: string;
  hint?: string;
};

function MetricCell({
  value,
  formula,
  formulaTitle,
  label,
  className,
  onOpenFormula
}: {
  value: string;
  formula: string;
  formulaTitle?: string;
  label: string;
  className: string;
  onOpenFormula: (detail: CanTuDongFormulaDetail) => void;
}) {
  const canOpen = Boolean(formula);
  return (
    <td className={`whitespace-nowrap px-2 py-2 text-right align-top ${className}`}>
      {canOpen ? (
        <button
          type="button"
          onClick={() =>
            onOpenFormula({
              title: label,
              value,
              formula,
              hint: formulaTitle
            })
          }
          className="font-mono font-bold underline decoration-dotted underline-offset-2 transition hover:opacity-80"
          title="Bấm để xem công thức"
        >
          {value}
        </button>
      ) : (
        <div className="font-mono font-bold">{value}</div>
      )}
    </td>
  );
}

const COL_COUNT = 13;

export default function BbCanTuDongTongHopPanel({
  isLoading: parentLoading,
  products = [],
  shiftFilter = 'all',
  dateFrom = '',
  dateTo = '',
  machineFilter = 'all',
  selectedMachine = null
}: {
  isLoading?: boolean;
  products?: ProductRow[];
  shiftFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
}) {
  const [records, setRecords] = useState<CanTuDongRecord[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'syncing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [formulaDetail, setFormulaDetail] = useState<CanTuDongFormulaDetail | null>(null);

  const load = async (opts?: { sync?: boolean }) => {
    setStatus(opts?.sync ? 'syncing' : 'loading');
    setMessage('');
    try {
      if (opts?.sync) {
        await syncCanTuDongTongHop({ from: dateFrom, to: dateTo, rebuild: true });
      }
      const slim = await fetchCanTuDongSlimRecords({ from: dateFrom, to: dateTo });
      setRecords(slim);
      setStatus('ready');
      setMessage(
        slim.length > 0
          ? `Đã tải ${formatNumber(slim.length, 0)} lần cân (đủ tiêu chí nhựa / lõi / bì).`
          : 'Chưa có lần cân trong khoảng ngày này.'
      );
    } catch (error) {
      setRecords([]);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Lỗi tải tổng hợp cân thực tế.');
    }
  };

  useEffect(() => {
    void load();
    // Chỉ tải lại khi khoảng ngày đã Áp dụng — ca/máy lọc trên client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const filteredRecords = useMemo(
    () =>
      filterCanTuDongRecordsForBoard(records, {
        shiftFilter,
        dateFrom,
        dateTo,
        machineFilter,
        selectedMachine
      }),
    [records, shiftFilter, dateFrom, dateTo, machineFilter, selectedMachine]
  );

  const detailRows = useMemo(
    () => buildCanTuDongTongHopDetailRows(filteredRecords, products),
    [filteredRecords, products]
  );

  const totals = useMemo(() => sumCanTuDongTongHopDetailRows(detailRows), [detailRows]);
  const totalFormulas = useMemo(() => explainCanTuDongTongHopRowFormulas(totals), [totals]);
  const busy = status === 'loading' || status === 'syncing' || parentLoading;

  const handleSync = async () => {
    await load({ sync: true });
  };

  const renderMetricCells = (row: CanTuDongTongHopDetailRow | ReturnType<typeof sumCanTuDongTongHopDetailRows>) => {
    const formulas = explainCanTuDongTongHopRowFormulas(row);
    return (
      <>
        <MetricCell
          value={formatKg(row.nhua_dm_kg, 2)}
          formula={formulas.nhuaDm}
          formulaTitle={`${formulas.nhuaDmShort} · Cột «Trọng lượng nhựa + phụ gia (kg)» Kho hàng × số cuộn`}
          label="Trọng lượng Nhựa ĐM"
          className="text-teal-900"
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatKg(row.khoi_luong_mang_kg, 2)}
          formula={formulas.mang}
          formulaTitle={`${formulas.mangShort} · Khối lượng màng BOM Thành phần SP × số cuộn`}
          label="Khối lượng màng"
          className="text-indigo-900"
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatKg(row.nhua_tt_kg, 2)}
          formula={formulas.nhuaTt}
          formulaTitle={`${formulas.nhuaTtShort} · ${formulas.nhuaTt}`}
          label="Trọng lượng Nhựa TT"
          className="text-emerald-800"
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatSignedKg(row.chenh_lech_nhua_kg, 2)}
          formula={formulas.chenhLech}
          formulaTitle={`${formulas.chenhLechShort} · ${formulas.chenhLech}`}
          label="Chênh lệch nhựa"
          className={signedClass(row.chenh_lech_nhua_kg)}
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatPct(row.phan_tram_chenh, 2)}
          formula={formulas.phanTramChenh}
          formulaTitle={`${formulas.phanTramChenhShort} · ${formulas.phanTramChenh}`}
          label="Phần trăm chênh"
          className={signedClass(row.phan_tram_chenh)}
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatKg(row.loi_dm_kg, 2)}
          formula={formulas.loiDm}
          formulaTitle="Tổng trong_luong_loi trên Kho hàng theo Mã SP"
          label="Trọng lượng Lõi ĐM"
          className="text-sky-900"
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatKg(row.loi_tt_kg, 2)}
          formula={formulas.loiTt}
          formulaTitle="Tổng cân lõi (can_loi / tare_weight)"
          label="Trọng lượng Lõi TT"
          className="text-violet-900"
          onOpenFormula={setFormulaDetail}
        />
        <MetricCell
          value={formatKg(row.trong_luong_bi_kg, 2)}
          formula={formulas.trongLuongBi}
          formulaTitle="Số cuộn × 0,16 kg"
          label="Trọng lượng bì"
          className="text-zinc-700"
          onOpenFormula={setFormulaDetail}
        />
      </>
    );
  };

  return (
    <div className="bb-report-sheet-scroll flex flex-col gap-3 p-3">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="rounded-xl border border-emerald-200/80 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-black uppercase tracking-tight text-emerald-700">Nhựa TT</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-zinc-900">
            {busy ? '…' : formatKg(totals.nhua_tt_kg, 2)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500" title={totalFormulas.nhuaTtShort}>
            {busy ? 'SP − lõi − bì − màng' : totalFormulas.nhuaTt}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-white p-4 shadow-xs">
          <p className="text-[11px] font-black uppercase tracking-tight text-amber-800">Chênh lệch nhựa</p>
          <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${signedClass(totals.chenh_lech_nhua_kg)}`}>
            {busy ? '…' : formatSignedKg(totals.chenh_lech_nhua_kg, 2)}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500" title={totalFormulas.chenhLechShort}>
            {busy ? 'TT − ĐM' : `${totalFormulas.chenhLech} · ${formatPct(totals.phan_tram_chenh, 2)}`}
          </p>
        </div>
      </div>

      {message ? (
        <p className={`text-xs font-semibold ${status === 'error' ? 'text-red-700' : 'text-zinc-500'}`}>
          {message}
        </p>
      ) : null}

      <div className="bb-table-scroll bb-report-sheet-scroll">
        <table className="bb-sheet-table min-w-[1620px] w-full text-left">
          <thead>
            <tr>
              <th className="font-semibold">Ngày</th>
              <th className="font-semibold">Ca</th>
              <th className="font-semibold">Máy</th>
              <th className="text-right font-semibold">Số cuộn</th>
              <th className="text-right font-semibold">
                <div>Tổng TL thực tế</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-zinc-500">
                  Σ Cân SP
                </div>
              </th>
              <th
                className="text-right font-semibold"
                title="Σ (Trọng lượng nhựa + phụ gia (kg) trên Kho hàng × 1 cuộn) theo Mã SP từ QR"
              >
                <div>Trọng lượng Nhựa ĐM</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-teal-700">
                  KL nhựa+phụ gia × cuộn
                </div>
              </th>
              <th
                className="text-right font-semibold"
                title="Σ (Khối lượng màng BOM Thành phần SP × 1 cuộn) theo Mã SP từ QR"
              >
                <div>Khối lượng màng</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-indigo-700">
                  BOM màng × cuộn
                </div>
              </th>
              <th className="text-right font-semibold" title="Nhựa thực tế = Cân SP − Cân lõi − bì 0,16 − màng BOM">
                <div>Trọng lượng Nhựa TT</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-emerald-700">
                  SP − lõi − bì − màng
                </div>
              </th>
              <th className="text-right font-semibold" title="Nhựa TT − Nhựa ĐM">
                <div>Chênh lệch nhựa</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-amber-700">
                  TT − ĐM
                </div>
              </th>
              <th className="text-right font-semibold" title="(Chênh lệch nhựa ÷ Nhựa TT) × 100">
                <div>Phần trăm chênh</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-amber-700">
                  CL ÷ TT × 100
                </div>
              </th>
              <th className="text-right font-semibold" title="Lõi lý thuyết từ Kho hàng (trong_luong_loi)">
                <div>Trọng lượng Lõi ĐM</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-sky-700">
                  Σ TL lõi KH
                </div>
              </th>
              <th className="text-right font-semibold" title="Σ Cân lõi (tare_weight)">
                <div>Trọng lượng Lõi TT</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-violet-700">
                  Σ Cân lõi
                </div>
              </th>
              <th className="text-right font-semibold" title="Σ 0,16 kg / cuộn">
                <div>Trọng lượng bì</div>
                <div className="mt-0.5 text-[9px] font-semibold normal-case tracking-normal text-zinc-500">
                  cuộn × 0,16
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-zinc-500">
                  {status === 'syncing'
                    ? 'Đang đồng bộ và tính tiêu chí từ cân AI...'
                    : 'Đang tải tổng hợp cân thực tế...'}
                </td>
              </tr>
            ) : detailRows.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="px-4 py-8 text-center text-zinc-500">
                  Chưa có tổng hợp. Bấm «Đồng bộ từ cân AI» hoặc kiểm tra bộ lọc Ngày / Ca / Máy.
                </td>
              </tr>
            ) : (
              detailRows.map(row => (
                <tr key={row.khoa_on_dinh} className="hover:bg-red-50/40">
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
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono font-black text-emerald-800">
                    <button
                      type="button"
                      onClick={() =>
                        setFormulaDetail({
                          title: 'Tổng TL thực tế',
                          value: formatKg(row.tong_trong_luong_kg, 2),
                          formula: explainCanTuDongTongHopRowFormulas(row).tongTrongLuong,
                          hint: 'Tổng cân sản phẩm (weight / can_san_pham)'
                        })
                      }
                      className="font-mono font-black underline decoration-dotted underline-offset-2 transition hover:opacity-80"
                      title="Bấm để xem công thức"
                    >
                      {formatKg(row.tong_trong_luong_kg, 2)}
                    </button>
                  </td>
                  {renderMetricCells(row)}
                </tr>
              ))
            )}
          </tbody>
          {!busy && detailRows.length > 0 ? (
            <tfoot className="border-t-2 border-red-200 bg-red-50/70 text-xs font-black text-red-950">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right uppercase tracking-wider">
                  Tổng
                </td>
                <td className="px-3 py-3 text-right font-mono">{formatNumber(totals.so_cuon, 0)}</td>
                <td className="px-3 py-3 text-right align-top font-mono text-emerald-800">
                  <button
                    type="button"
                    onClick={() =>
                      setFormulaDetail({
                        title: 'Tổng TL thực tế',
                        value: formatKg(totals.tong_trong_luong_kg, 2),
                        formula: totalFormulas.tongTrongLuong,
                        hint: 'Tổng cân sản phẩm (weight / can_san_pham)'
                      })
                    }
                    className="font-mono font-black underline decoration-dotted underline-offset-2 transition hover:opacity-80"
                    title="Bấm để xem công thức"
                  >
                    {formatKg(totals.tong_trong_luong_kg, 2)}
                  </button>
                </td>
                {renderMetricCells(totals)}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {formulaDetail && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
              onClick={event => {
                if (event.target === event.currentTarget) setFormulaDetail(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-lg rounded-xl border border-red-200 bg-white shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-red-700">Công thức</p>
                    <h4 className="mt-0.5 text-base font-black text-zinc-900">{formulaDetail.title}</h4>
                    <p className="mt-1 font-mono text-sm font-black text-emerald-800">{formulaDetail.value}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormulaDetail(null)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50"
                    aria-label="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 px-4 py-4 text-sm font-semibold text-zinc-800">
                  <p className="font-mono text-[15px] leading-relaxed text-zinc-900">{formulaDetail.formula}</p>
                  {formulaDetail.hint ? (
                    <p className="text-xs font-semibold text-zinc-500">{formulaDetail.hint}</p>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
