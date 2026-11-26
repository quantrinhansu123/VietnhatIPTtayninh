import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { formatMoney, formatNumber } from '../../utils';
import { normalizeShiftSettings } from '../../utils/shiftSettings';
import type { ReportListsHubFilters } from '../report-lists/ReportListsSharedFilters';
import {
  extractCpRowsFromSnapshotPayload,
  extractProductivityRows,
  type CpProductivityRow,
  formatCpKg,
  matchesCpHubFilters,
  sortCpRowsByNgayCaMay,
  type CpCostRow
} from './extractCpRows';

type Props = {
  filters: Pick<ReportListsHubFilters, 'search' | 'shift' | 'machineCode' | 'dateFrom' | 'dateTo'>;
};

type SnapshotItem = {
  khoa_on_dinh?: string;
  ngay_tu?: string;
  ngay_den?: string;
  ca?: string;
  may?: string;
  payload?: unknown;
};

function fmtMoney(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  return formatMoney(value, 0);
}

function fmtDonGia(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return formatMoney(value, 0);
}

function moneyClass(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) return 'text-slate-500';
  return value > 0 ? 'text-red-700' : 'text-emerald-700';
}

function CpTable({
  title,
  subtitle,
  rows,
  moneyField,
  kgField,
  kgHeader,
  moneyHeader,
  moneyTitle
}: {
  title: string;
  subtitle: string;
  rows: CpCostRow[];
  moneyField: 'tienLoHangLoi' | 'tienLoVanHanh';
  kgField: 'loiKg' | 'chenhLechKg';
  kgHeader: string;
  moneyHeader: string;
  moneyTitle: string;
}) {
  const totalMoney = rows.reduce((sum, row) => sum + (row[moneyField] || 0), 0);
  const totalKg = rows.reduce((sum, row) => sum + (row[kgField] || 0), 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right text-[11px] font-semibold text-slate-700">
          <div>
            {rows.length} dòng · Σ {kgHeader}{' '}
            <span className="tabular-nums">{formatCpKg(totalKg)}</span>
          </div>
          <div className={moneyClass(totalMoney)}>
            Σ {moneyHeader}: <span className="tabular-nums">{fmtMoney(totalMoney)}</span>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          Không có dòng trong khoảng lọc.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-black text-left text-white">
                <th className="px-2 py-2 font-bold">Ngày</th>
                <th className="px-2 py-2 font-bold">Ca</th>
                <th className="px-2 py-2 font-bold">Máy</th>
                <th className="px-2 py-2 font-bold">LSX</th>
                <th className="px-2 py-2 font-bold">Mã NVL</th>
                <th className="px-2 py-2 font-bold">Tên NVL</th>
                <th className="px-2 py-2 text-right font-bold">{kgHeader}</th>
                <th className="px-2 py-2 text-right font-bold">Đơn giá</th>
                <th className="px-2 py-2 text-right font-bold" title={moneyTitle}>
                  {moneyHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const kg = row[kgField];
                const money = row[moneyField];
                const highlight = Math.abs(money) >= 0.5;
                return (
                  <tr
                    key={`${title}|${row.rowKey}`}
                    className={`border-t border-slate-100 ${
                      highlight ? 'bg-rose-50/60' : 'bg-white'
                    } hover:bg-slate-50`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-700">
                      {row.ngay || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                      {row.shiftLabel || row.shift || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-800">
                      {row.machineCode || row.machine || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                      {row.orderCode || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] font-bold text-slate-800">
                      {row.materialCode}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-2 py-1.5 text-slate-600"
                      title={row.materialName}
                    >
                      {row.materialName || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {kgField === 'chenhLechKg' && kg > 0 ? '+' : ''}
                      {formatCpKg(kg)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {fmtDonGia(row.donGia)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right font-bold tabular-nums ${moneyClass(
                        money
                      )}`}
                    >
                      {fmtMoney(money)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-100 font-bold text-slate-900">
                <td colSpan={6} className="px-2 py-2 text-right uppercase tracking-wide">
                  Tổng
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {formatCpKg(totalKg)}
                </td>
                <td className="px-2 py-2" />
                <td className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${moneyClass(totalMoney)}`}>
                  {fmtMoney(totalMoney)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

export function BaoCaoCpPanel({ filters }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<CpCostRow[]>([]);
  const [onlyNonZero, setOnlyNonZero] = useState(true);
  const [productivityRows, setProductivityRows] = useState<CpProductivityRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', '100');

      const res = await fetch(`/api/bb-bao-cao-tinh-toan?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json && typeof json.error === 'string' && json.error) ||
            'Không tải được bản tính toán BB.'
        );
      }

      const items: SnapshotItem[] = Array.isArray(json.items)
        ? json.items
        : json.item
          ? [json.item]
          : [];

      const settingsRes = await fetch('/api/cai-dat');
      if (!settingsRes.ok) throw new Error('Không tải được khung giờ ca để tính năng suất.');
      const settings = normalizeShiftSettings(await settingsRes.json());
      const productivity = new Map<string, CpProductivityRow>();
      const extracted: CpCostRow[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const key = String(item.khoa_on_dinh || '');
        for (const row of extractProductivityRows(item.payload, {
          snapshotKey: key, may: item.may, ca: item.ca, ngayTu: item.ngay_tu
        }, settings)) {
          if (!productivity.has(row.rowKey)) productivity.set(row.rowKey, row);
        }
        const part = extractCpRowsFromSnapshotPayload(item.payload, {
          snapshotKey: key,
          may: String(item.may || ''),
          ca: String(item.ca || ''),
          ngayTu: String(item.ngay_tu || '')
        });
        for (const row of part) {
          if (seen.has(row.rowKey)) continue;
          seen.add(row.rowKey);
          extracted.push(row);
        }
      }
      setRows(sortCpRowsByNgayCaMay(extracted));
      setProductivityRows([...productivity.values()]);
    } catch (err) {
      setProductivityRows([]);
      setRows([]);
      setError(err instanceof Error ? err.message : 'Lỗi tải báo cáo CP.');
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return sortCpRowsByNgayCaMay(
      rows.filter(row => {
        if (!matchesCpHubFilters(row, filters)) return false;
        return true;
      })
    );
  }, [rows, filters]);

  const hangLoiRows = useMemo(() => {
    return filtered.filter(row => {
      if (!onlyNonZero) return true;
      return Math.abs(row.tienLoHangLoi) >= 0.5 || Math.abs(row.loiKg) >= 0.0005;
    });
  }, [filtered, onlyNonZero]);

  const vanHanhRows = useMemo(() => {
    return filtered.filter(row => {
      if (!onlyNonZero) return true;
      return Math.abs(row.tienLoVanHanh) >= 0.5 || Math.abs(row.chenhLechKg) >= 0.0005;
    });
  }, [filtered, onlyNonZero]);

  const tongLoHangLoi = hangLoiRows.reduce((s, r) => s + r.tienLoHangLoi, 0);
  const tongLoVanHanh = vanHanhRows.reduce((s, r) => s + r.tienLoVanHanh, 0);

  return (
    <div className="space-y-3 px-0.5 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800">
            Báo cáo chi phí (CP) · lỗ hàng lỗi hỏng + lỗ vận hành
          </p>
          <p className="text-[10px] text-slate-500">
            Nguồn snapshot BB (bảng tổng hợp) · đơn giá từ Bảng giá NVL · cần{' '}
            <strong>Tính toán</strong> trên Báo cáo theo LSX trước.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={onlyNonZero}
              onChange={e => setOnlyNonZero(e.target.checked)}
              className="rounded border-slate-300"
            />
            Chỉ dòng có lỗ ≠ 0
          </label>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            1. Lỗ hàng lỗi hỏng
          </p>
          <p className={`mt-0.5 text-base font-bold tabular-nums ${moneyClass(tongLoHangLoi)}`}>
            {fmtMoney(tongLoHangLoi)}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            2. Lỗ vận hành
          </p>
          <p className={`mt-0.5 text-base font-bold tabular-nums ${moneyClass(tongLoVanHanh)}`}>
            {fmtMoney(tongLoVanHanh)}
          </p>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[28vh] items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải báo cáo CP...
        </div>
      ) : (
        <div className="space-y-3">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">
              <h3 className="text-sm font-bold text-slate-900">3. Lỗ năng suất công nhân</h3>
              <p className="mt-1 text-xs text-slate-500">TG tiêu chuẩn/cuộn = thời gian ca ÷ SL LSX. Lãi/lỗ = (SL thực tế − SL LSX) × TG tiêu chuẩn/cuộn. Âm: lỗ · Dương: lãi.</p>
              <p className="mt-1 text-xs text-slate-500">Gộp theo ngày · ca · máy; thời gian lấy từ Cài đặt ca, không nhân theo số công nhân, chưa trừ giờ nghỉ. SL lấy từ bản tính toán BB đã lưu.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-xs">
                <thead className="bg-black text-white"><tr>
                  {['Ngày', 'Ca', 'Máy', 'LSX', 'Công nhân', 'TG ca (phút)', 'SL LSX', 'SL thực tế', 'CL cuộn', 'TG chuẩn (phút/cuộn)', 'Lãi/lỗ (phút)'].map(label => <th key={label} className="whitespace-nowrap px-3 py-2 text-left">{label}</th>)}
                </tr></thead>
                <tbody>
                  {productivityRows.filter(row => matchesCpHubFilters(row, { ...filters, search: '' }) &&
                    (!filters.search || `${row.staff} ${row.orderCode} ${row.machine} ${row.shiftLabel} ${row.ngay}`.toLowerCase().includes(filters.search.toLowerCase())) &&
                    (!onlyNonZero || row.balanceMinutes === null || Math.abs(row.balanceMinutes) > 0.0005)).map(row => (
                    <tr key={row.rowKey} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-3 py-2">{row.ngay}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.shiftLabel}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.machine}</td>
                      <td className="px-3 py-2">{row.orderCode}</td>
                      <td className="px-3 py-2">{row.staff || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{row.shiftMinutes === null ? '—' : formatNumber(row.shiftMinutes, 2)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatNumber(row.planned, 0)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatNumber(row.actual, 0)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.actual > row.planned ? '+' : ''}{formatNumber(row.actual - row.planned, 0)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.standardMinutes === null ? '—' : formatNumber(row.standardMinutes, 3)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 font-bold tabular-nums ${row.balanceMinutes === null ? 'text-slate-500' : row.balanceMinutes < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {row.balanceMinutes === null ? 'Thiếu giờ ca / SL LSX' : `${row.balanceMinutes > 0 ? '+' : ''}${formatNumber(row.balanceMinutes, 2)} (${row.balanceMinutes < 0 ? 'Lỗ' : row.balanceMinutes > 0 ? 'Lãi' : 'Đạt'})`}
                      </td>
                    </tr>
                  ))}
                  {productivityRows.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-slate-500">Chưa có dữ liệu LSX trong bản tính toán đã lưu.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <CpTable
            title="1. Lỗ hàng lỗi hỏng"
            subtitle="Tiền lỗ = Lỗi hỏng (kg) × Đơn giá — từ cột «Tiền lỗ do hàng lỗi» báo cáo BB"
            rows={hangLoiRows}
            moneyField="tienLoHangLoi"
            kgField="loiKg"
            kgHeader="Lỗi hỏng (kg)"
            moneyHeader="Tiền lỗ"
            moneyTitle="Tiền lỗ do hàng lỗi = Lỗi hỏng (kg) × Đơn giá"
          />
          <CpTable
            title="2. Lỗ vận hành"
            subtitle="Thành tiền = Chênh lệch (TX − ĐM) × Đơn giá — hao/lãi vận hành theo NVL"
            rows={vanHanhRows}
            moneyField="tienLoVanHanh"
            kgField="chenhLechKg"
            kgHeader="Chênh lệch (kg)"
            moneyHeader="Thành tiền"
            moneyTitle="Lỗ vận hành = Chênh lệch (kg) × Đơn giá"
          />
        </div>
      )}
    </div>
  );
}

export default BaoCaoCpPanel;
