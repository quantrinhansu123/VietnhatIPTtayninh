import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, ScanLine, Truck } from 'lucide-react';
import { canTuDongShiftMatches } from '../../utils/canTuDongWeights';
import { shiftNamesMatch } from '../../utils/shiftSettings';
import type { WarehouseMovementRow } from './index';

type Mode = 'nhap' | 'xuat';
type RowStatus = 'khop' | 'thieu' | 'thua';

type CompareRow = {
  ma: string;
  ten: string;
  /** Nhập: số cuộn Cân AI · Xuất: SL theo lệnh xuất hàng. */
  expected: number;
  /** Số thực tế đã nhập / xuất kho. */
  actual: number;
  status: RowStatus;
  /** Nhập: mã cuộn đã cân nhưng chưa nhập kho. Xuất: mã lệnh liên quan. */
  missingCodes: string[];
  /** Nhập: mã cuộn đã nhập kho nhưng không có bản cân AI. */
  extraCodes: string[];
  orderCodes: string[];
};

type AiRoll = { code: string; ma: string; day: string; ca: string; may: string };
type NhapWindowRoll = { key: string; ca: string; may: string };

const productCodeOf = (code: string) => String(code || '').split(/[_+]/)[0].trim().toUpperCase();
const rollKey = (code: string) => String(code || '').replace(/\s+/g, '').toUpperCase();
const fmt = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const shiftDay = (iso: string, days: number) => {
  const date = new Date(iso + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
};
/** Cuộn thường được nhập kho sau (hoặc vài ngày lệch) so với ngày cân — so theo mã cuộn trong cửa sổ này. */
const MATCH_WINDOW_DAYS = 3;
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const STATUS_META: Record<RowStatus, { label: string; badge: string }> = {
  khop: { label: 'Khớp', badge: 'bg-emerald-100 text-emerald-700' },
  thieu: { label: 'Thiếu', badge: 'bg-rose-100 text-rose-700' },
  thua: { label: 'Dôi', badge: 'bg-amber-100 text-amber-700' }
};

function statusOf(expected: number, actual: number): RowStatus {
  const diff = Math.round((actual - expected) * 100) / 100;
  return diff === 0 ? 'khop' : diff < 0 ? 'thieu' : 'thua';
}

/**
 * Khớp ca khi đang lọc lịch sử.
 * Khác `canTuDongShiftMatches`: thiếu ca → không khớp (tránh cộng nhầm mọi lần cân trống ca vào bộ đếm).
 */
function scopedShiftMatches(rowCa: string, shiftFilter: string): boolean {
  if (!shiftFilter) return true;
  const raw = String(rowCa || '').trim();
  if (!raw) return false;
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .some(part => shiftNamesMatch(part, shiftFilter) || canTuDongShiftMatches(part, shiftFilter));
}

function machineLooseMatch(rowMachine: string, machineFilter: string): boolean {
  if (!machineFilter) return true;
  const a = String(rowMachine || '').trim().toLowerCase();
  const b = String(machineFilter || '').trim().toLowerCase();
  if (!a) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

/**
 * Đối chiếu trên trang Lịch sử xuất nhập kho (kho thành phẩm):
 * - Tab Nhập kho: so với số cuộn Cân AI (`can_tu_dong`), tìm cuộn đã cân chưa nhập / nhập mà không có cân.
 * - Tab Xuất kho: so với Lệnh xuất hàng (`lenh_xuat_hang`), tìm mặt hàng xuất thiếu / vượt / ngoài lệnh.
 */
export function ReconciliationPanel({
  mode,
  movements,
  fromDate,
  toDate,
  filterShift = '',
  filterMachine = ''
}: {
  mode: Mode;
  movements: WarehouseMovementRow[];
  fromDate: string;
  toDate: string;
  /** Ca đang chọn trên bộ lọc lịch sử — đối chiếu Cân AI / trạng thái theo cùng ca. */
  filterShift?: string;
  /** Máy đang chọn trên bộ lọc lịch sử. */
  filterMachine?: string;
}) {
  const from = (fromDate || toDate || todayIso()).slice(0, 10);
  const to = (toDate || fromDate || todayIso()).slice(0, 10);
  const shiftFilter = String(filterShift || '').trim();
  const machineFilter = String(filterMachine || '').trim();
  const [isOpen, setIsOpen] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [expandedMa, setExpandedMa] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiRolls, setAiRolls] = useState<AiRoll[]>([]);
  const [nhapWindowRolls, setNhapWindowRolls] = useState<NhapWindowRoll[]>([]);
  /** Lần cân không đọc được QR — giữ ca/máy để bộ đếm lọc đúng. */
  const [aiUnreadableRows, setAiUnreadableRows] = useState<Array<{ ca: string; may: string }>>([]);
  const [orderLines, setOrderLines] = useState<Array<{ maLenh: string; ma: string; ten: string; soLuong: number }>>([]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    setExpandedMa('');
    void (async () => {
      try {
        if (mode === 'nhap') {
          const params = new URLSearchParams({ from: shiftDay(from, -MATCH_WINDOW_DAYS), to, dateBy: 'ngay', images: '0', all: '1' });
          const nhapParams = new URLSearchParams({
            loai_kho: 'san_pham',
            loai: 'nhap',
            from: shiftDay(from, -MATCH_WINDOW_DAYS),
            to: shiftDay(to, MATCH_WINDOW_DAYS)
          });
          const [res, nhapRes] = await Promise.all([
            fetch(`/api/can-tu-dong?${params.toString()}`, { signal: controller.signal }),
            fetch(`/api/kho/lich-su?${nhapParams.toString()}`, { signal: controller.signal })
          ]);
          const data = await res.json().catch(() => ({}));
          const nhapData = await nhapRes.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không tải được dữ liệu Cân AI.');
          if (!nhapRes.ok) throw new Error(nhapData.error || 'Không tải được phiếu nhập kho.');
          const nhapList: Array<Record<string, unknown>> = Array.isArray(nhapData?.movements) ? nhapData.movements : [];
          setNhapWindowRolls(
            nhapList
              .map(row => ({
                key: rollKey(String(row.ma_sp_quet || row.ma_sp || '')),
                ca: String(row.ca ?? row.shift ?? row.ca_san_xuat ?? '').trim(),
                may: String(row.may ?? row.ma_may ?? row.ten_may ?? row.machine ?? '').trim()
              }))
              .filter(row => row.key)
          );
          const records: Array<Record<string, unknown>> = Array.isArray(data?.records) ? data.records : [];
          const rolls: AiRoll[] = [];
          const unreadableRows: Array<{ ca: string; may: string }> = [];
          for (const record of records) {
            if (!(Number(record.weight) > 0)) continue;
            const code = String(record.qr_code ?? '').trim();
            const ma = productCodeOf(code);
            const ca = String(record.ca ?? '').trim();
            const may = String(record.may ?? record.machine ?? '').trim();
            if (!code || !/^[A-Z0-9-]+$/.test(ma)) unreadableRows.push({ ca, may });
            else {
              const meta = (record.metadata && typeof record.metadata === 'object' ? record.metadata : {}) as Record<string, unknown>;
              rolls.push({
                code,
                ma,
                day: String(record.ngay ?? meta.work_date ?? meta.SOURCE_DATE ?? '').slice(0, 10),
                ca,
                may
              });
            }
          }
          setAiRolls(rolls);
          setAiUnreadableRows(unreadableRows);
        } else {
          const params = new URLSearchParams({ tu_ngay: from, den_ngay: to });
          const res = await fetch(`/api/lenh-xuat-hang?${params.toString()}`, { signal: controller.signal });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không tải được Lệnh xuất hàng.');
          const orders: Array<Record<string, unknown>> = Array.isArray(data?.orders) ? data.orders : [];
          const lines: typeof orderLines = [];
          for (const order of orders) {
            if (/h[uủ]y/i.test(String(order.trang_thai ?? ''))) continue;
            const details = Array.isArray(order.chi_tiet) ? (order.chi_tiet as Array<Record<string, unknown>>) : [];
            for (const line of details) {
              const ma = String(line.ma_sp ?? '').trim().toUpperCase();
              const soLuong = Number(line.so_luong) || 0;
              if (ma && soLuong > 0) {
                lines.push({ maLenh: String(order.ma_lenh ?? ''), ma, ten: String(line.ten_sp ?? ''), soLuong });
              }
            }
          }
          setOrderLines(lines);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Không tải được dữ liệu đối chiếu.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [mode, from, to]);

  // Chỉ lấy phiếu trong khoảng ngày đang đối chiếu (movements có thể chứa nhiều ngày hơn).
  const scopedMovements = useMemo(
    () => movements.filter(row => {
      const day = (row.slipDate || '').slice(0, 10);
      return day >= from && day <= to;
    }),
    [movements, from, to]
  );

  const rows = useMemo<CompareRow[]>(() => {
    const names = new Map<string, string>();
    const actualByMa = new Map<string, number>();
    const actualRolls = new Map<string, Map<string, string>>();
    for (const row of scopedMovements) {
      const rollCode = (row.scannedCode?.trim() || row.itemCode || '').trim();
      const ma = productCodeOf(rollCode);
      if (!ma) continue;
      if (row.itemName && !names.has(ma)) names.set(ma, row.itemName);
      actualByMa.set(ma, (actualByMa.get(ma) || 0) + (Number(row.quantity) || 0));
      const rolls = actualRolls.get(ma) || new Map<string, string>();
      rolls.set(rollKey(rollCode), rollCode);
      actualRolls.set(ma, rolls);
    }

    const result: CompareRow[] = [];
    if (mode === 'nhap') {
      const aiRollsScoped = aiRolls.filter(roll => {
        if (shiftFilter && !scopedShiftMatches(roll.ca, shiftFilter)) return false;
        if (machineFilter && !machineLooseMatch(roll.may, machineFilter)) return false;
        return true;
      });
      // Cửa sổ ±3 ngày: khi đang lọc ca/máy thì chỉ tính phiếu nhập cùng bộ lọc
      // (tránh «Khớp» vì cuộn đã nhập ở ca khác).
      const nhapWindowKeys = new Set(
        nhapWindowRolls
          .filter(row => {
            if (shiftFilter && !scopedShiftMatches(row.ca, shiftFilter)) return false;
            if (machineFilter && !machineLooseMatch(row.may, machineFilter)) return false;
            return true;
          })
          .map(row => row.key)
      );
      const aiWindow = new Set(aiRollsScoped.map(roll => rollKey(roll.code)));
      const aiByMa = new Map<string, Map<string, string>>();
      for (const roll of aiRollsScoped) {
        if (roll.day && (roll.day < from || roll.day > to)) continue;
        const rolls = aiByMa.get(roll.ma) || new Map<string, string>();
        rolls.set(rollKey(roll.code), roll.code);
        aiByMa.set(roll.ma, rolls);
      }
      for (const ma of new Set([...aiByMa.keys(), ...actualByMa.keys()])) {
        const ai = aiByMa.get(ma) || new Map<string, string>();
        const nhap = actualRolls.get(ma) || new Map<string, string>();
        const expected = ai.size;
        const actual = actualByMa.get(ma) || 0;
        result.push({
          ma,
          ten: names.get(ma) || '',
          expected,
          actual,
          status: 'khop',
          missingCodes: [...ai].filter(([key]) => !nhapWindowKeys.has(key)).map(([, code]) => code),
          extraCodes: [...nhap].filter(([key]) => !aiWindow.has(key)).map(([, code]) => code),
          orderCodes: []
        });
        const last = result[result.length - 1];
        // Có lọc ca/máy: trạng thái theo số đang hiện (Cân AI ↔ Nhập kho đã lọc).
        // Không lọc: giữ đối chiếu theo mã cuộn trong cửa sổ ±3 ngày.
        last.status =
          shiftFilter || machineFilter
            ? statusOf(expected, actual)
            : last.missingCodes.length > 0
              ? 'thieu'
              : last.extraCodes.length > 0
                ? 'thua'
                : 'khop';
      }
    } else {
      const orderByMa = new Map<string, { ten: string; soLuong: number; codes: Set<string> }>();
      for (const line of orderLines) {
        const entry = orderByMa.get(line.ma) || { ten: line.ten, soLuong: 0, codes: new Set<string>() };
        entry.soLuong += line.soLuong;
        entry.codes.add(line.maLenh);
        orderByMa.set(line.ma, entry);
      }
      for (const ma of new Set([...orderByMa.keys(), ...actualByMa.keys()])) {
        const order = orderByMa.get(ma);
        const expected = order?.soLuong || 0;
        const actual = actualByMa.get(ma) || 0;
        result.push({
          ma,
          ten: order?.ten || names.get(ma) || '',
          expected,
          actual,
          status: statusOf(expected, actual),
          missingCodes: [],
          extraCodes: [],
          orderCodes: [...(order?.codes || [])]
        });
      }
    }
    // Dòng lệch lên đầu (lệch nhiều nhất trước), rồi theo mã.
    return result.sort((a, b) => {
      const da = Math.abs(a.actual - a.expected);
      const db = Math.abs(b.actual - b.expected);
      return (b.status !== "khop" ? 1 : 0) - (a.status !== "khop" ? 1 : 0) || db - da || a.ma.localeCompare(b.ma, 'vi', { numeric: true });
    });
  }, [mode, scopedMovements, aiRolls, orderLines, nhapWindowRolls, from, to, shiftFilter, machineFilter]);

  const hasScopeFilter = Boolean(shiftFilter || machineFilter);

  const totals = useMemo(() => {
    const expected = rows.reduce((sum, row) => sum + row.expected, 0);
    const actual = rows.reduce((sum, row) => sum + row.actual, 0);
    // Có lọc ca/máy: badge theo chênh số đang hiện. Không lọc: theo mã cuộn cửa sổ ±3 ngày.
    const missingRolls = hasScopeFilter
      ? rows.reduce((sum, row) => sum + Math.max(0, row.expected - row.actual), 0)
      : rows.reduce((sum, row) => sum + row.missingCodes.length, 0);
    const extraRolls = hasScopeFilter
      ? rows.reduce((sum, row) => sum + Math.max(0, row.actual - row.expected), 0)
      : rows.reduce((sum, row) => sum + row.extraCodes.length, 0);
    return {
      expected,
      actual,
      diffRows: rows.filter(row => row.status !== 'khop').length,
      missingRolls,
      extraRolls,
      percent: expected > 0 ? Math.min(100, Math.round((Math.min(actual, expected) / expected) * 100)) : actual > 0 ? 0 : 100
    };
  }, [rows, hasScopeFilter]);

  const aiUnreadable = useMemo(
    () =>
      aiUnreadableRows.filter(row => {
        if (shiftFilter && !scopedShiftMatches(row.ca, shiftFilter)) return false;
        if (machineFilter && !machineLooseMatch(row.may, machineFilter)) return false;
        return true;
      }).length,
    [aiUnreadableRows, shiftFilter, machineFilter]
  );

  const isNhap = mode === 'nhap';
  const Icon = isNhap ? ScanLine : Truck;
  const visibleRows = onlyDiff ? rows.filter(row => row.status !== 'khop') : rows;
  const label = isNhap
    ? { source: 'Cân AI', expected: 'Cân AI (cuộn)', actual: 'Nhập kho', missing: 'Đã cân chưa nhập', extra: 'Nhập không có cân AI' }
    : { source: 'Lệnh xuất hàng', expected: 'Theo lệnh', actual: 'Xuất kho', missing: '', extra: '' };

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left"
      >
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isNhap ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-zinc-950">
            Đối chiếu {isNhap ? 'Nhập kho' : 'Xuất kho'} với {label.source}
          </span>
          <span className="block text-[11px] font-semibold text-zinc-500">
            {from === to ? from.split('-').reverse().join('/') : `${from.split('-').reverse().join('/')} → ${to.split('-').reverse().join('/')}`}
            {shiftFilter ? ` · ${shiftFilter}` : ''}
            {machineFilter ? ` · máy ${machineFilter}` : ''}
            {isLoading ? ' · đang đối chiếu…' : ` · ${rows.length} mã`}
          </span>
        </span>
        {!isLoading && !error ? (
          totals.diffRows === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Khớp toàn bộ
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {totals.diffRows} mã lệch
            </span>
          )
        ) : null}
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div className="space-y-3 border-t border-zinc-100 px-4 py-3">
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label.expected}</p>
              <p className="font-mono text-xl font-black tabular-nums text-zinc-950">{isLoading ? '…' : fmt(totals.expected)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label.actual}</p>
              <p className="font-mono text-xl font-black tabular-nums text-zinc-950">{isLoading ? '…' : fmt(totals.actual)}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Chênh lệch</p>
              <p className={`font-mono text-xl font-black tabular-nums ${totals.actual === totals.expected ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isLoading ? '…' : `${totals.actual - totals.expected > 0 ? '+' : ''}${fmt(totals.actual - totals.expected)}`}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">
                {isNhap ? 'Đã nhập / đã cân' : 'Hoàn thành lệnh'}
              </p>
              <p className="font-mono text-xl font-black tabular-nums text-zinc-950">{isLoading ? '…' : `${totals.percent}%`}</p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className={`h-full rounded-full ${totals.percent >= 100 ? 'bg-emerald-500' : 'bg-[#ef1b2d]'}`}
                  style={{ width: `${totals.percent}%` }}
                />
              </div>
            </div>
          </div>

          {isNhap && !isLoading && (totals.missingRolls > 0 || totals.extraRolls > 0 || aiUnreadable > 0) ? (
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              {totals.missingRolls > 0 ? (
                <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-200">
                  {totals.missingRolls} cuộn đã cân chưa nhập kho
                </span>
              ) : null}
              {totals.extraRolls > 0 ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 ring-1 ring-amber-200">
                  {totals.extraRolls} cuộn nhập kho không có bản cân AI
                </span>
              ) : null}
              {aiUnreadable > 0 ? (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-600 ring-1 ring-zinc-200">
                  {aiUnreadable} lần cân chưa có mã QR (không đối chiếu được)
                </span>
              ) : null}
            </div>
          ) : null}

          <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-bold text-zinc-700">
            <input
              type="checkbox"
              checked={onlyDiff}
              onChange={event => setOnlyDiff(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#ef1b2d]"
            />
            Chỉ hiện mã lệch
          </label>

          <div className="max-h-[46vh] overflow-auto rounded-lg border border-zinc-200">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-[#e8f0ed] text-[11px] font-semibold text-zinc-700">
                <tr>
                  <th className="px-3 py-2 font-black">Mã SP</th>
                  <th className="px-3 py-2 font-black">Tên SP</th>
                  <th className="px-3 py-2 text-right font-black">{label.expected}</th>
                  <th className="px-3 py-2 text-right font-black">{label.actual}</th>
                  <th className="px-3 py-2 text-right font-black">Chênh lệch</th>
                  <th className="px-3 py-2 text-center font-black">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleRows.map(row => {
                  const diff = Math.round((row.actual - row.expected) * 100) / 100;
                  const meta = STATUS_META[row.status];
                  const hasDetail = row.missingCodes.length > 0 || row.extraCodes.length > 0 || row.orderCodes.length > 0;
                  const isExpanded = expandedMa === row.ma;
                  // Xuất kho: có xuất nhưng không có lệnh → hiện rõ là "ngoài lệnh".
                  const outsideOrder = !isNhap && row.expected === 0 && row.actual > 0;
                  return (
                    <React.Fragment key={row.ma}>
                      <tr
                        onClick={hasDetail ? () => setExpandedMa(isExpanded ? '' : row.ma) : undefined}
                        className={`${hasDetail ? 'cursor-pointer hover:bg-zinc-50' : ''} ${row.status !== 'khop' ? 'bg-rose-50/30' : ''}`}
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-black text-zinc-900">{row.ma}</td>
                        <td className="px-3 py-2 text-zinc-700">{row.ten || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">{fmt(row.expected)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">{fmt(row.actual)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-black tabular-nums ${diff === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {diff > 0 ? '+' : ''}{fmt(diff)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ${meta.badge}`}>
                            {outsideOrder ? 'Ngoài lệnh' : !isNhap && row.status === 'thieu' ? 'Chưa xuất đủ' : !isNhap && row.status === 'thua' ? 'Xuất vượt' : isNhap && row.status === 'thieu' ? 'Chưa nhập đủ' : isNhap && row.status === 'thua' ? 'Nhập dôi' : meta.label}
                          </span>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="bg-zinc-50">
                          <td colSpan={6} className="space-y-2 px-4 py-2.5">
                            {row.orderCodes.length > 0 ? (
                              <p className="text-[11px] font-bold text-zinc-600">
                                Lệnh xuất:{' '}
                                {row.orderCodes.map(code => (
                                  <span key={code} className="mr-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 font-mono text-violet-800">{code}</span>
                                ))}
                              </p>
                            ) : null}
                            {row.missingCodes.length > 0 ? (
                              <div>
                                <p className="mb-1 text-[11px] font-black text-rose-700">{label.missing} ({row.missingCodes.length})</p>
                                <div className="flex flex-wrap gap-1">
                                  {row.missingCodes.slice(0, 60).map(code => (
                                    <span key={code} className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[11px] text-rose-800">{code}</span>
                                  ))}
                                  {row.missingCodes.length > 60 ? <span className="text-[11px] font-bold text-rose-700">+{row.missingCodes.length - 60}</span> : null}
                                </div>
                              </div>
                            ) : null}
                            {row.extraCodes.length > 0 ? (
                              <div>
                                <p className="mb-1 text-[11px] font-black text-amber-700">{label.extra} ({row.extraCodes.length})</p>
                                <div className="flex flex-wrap gap-1">
                                  {row.extraCodes.slice(0, 60).map(code => (
                                    <span key={code} className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[11px] text-amber-800">{code}</span>
                                  ))}
                                  {row.extraCodes.length > 60 ? <span className="text-[11px] font-bold text-amber-700">+{row.extraCodes.length - 60}</span> : null}
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Đang đối chiếu…
                    </td>
                  </tr>
                ) : null}
                {!isLoading && visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                      {onlyDiff ? 'Không có mã lệch.' : 'Không có dữ liệu để đối chiếu trong khoảng ngày này.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
