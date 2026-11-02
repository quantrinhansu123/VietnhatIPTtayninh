import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableEmptyRow
} from '../../components/shared/table';
import { splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import type { BaoCaoTongHopListRow } from './index';
import { compareShiftCa } from './BieuDoThCharts';

export type TongHopTreeVariant = 'full' | 'loi-hong' | 'san-luong';

type MetricTotals = {
  slYeuCau: number;
  slThucTe: number;
  tlNhuaThanhPham: number;
  tlNhuaDinhMuc: number;
  xuatThucDung: number;
  loiHong: number;
};

type DayGroup = {
  key: string;
  ngayTu: string;
  ngayDen: string;
  label: string;
  staff: string;
  totals: MetricTotals;
  caGroups: CaGroup[];
};

type CaGroup = {
  key: string;
  ca: string;
  staff: string;
  totals: MetricTotals;
  rows: BaoCaoTongHopListRow[];
};

function emptyTotals(): MetricTotals {
  return {
    slYeuCau: 0,
    slThucTe: 0,
    tlNhuaThanhPham: 0,
    tlNhuaDinhMuc: 0,
    xuatThucDung: 0,
    loiHong: 0
  };
}

function addRow(totals: MetricTotals, row: BaoCaoTongHopListRow): MetricTotals {
  return {
    slYeuCau: totals.slYeuCau + (row.sl_yeu_cau ?? 0),
    slThucTe: totals.slThucTe + (row.sl_san_luong ?? 0),
    tlNhuaThanhPham: totals.tlNhuaThanhPham + (row.tl_nhua_thanh_pham_kg ?? 0),
    tlNhuaDinhMuc: totals.tlNhuaDinhMuc + (row.tl_nhua_dinh_muc_kg ?? 0),
    xuatThucDung: totals.xuatThucDung + (row.xuat_thuc_dung_kg ?? 0),
    loiHong: totals.loiHong + (row.loi_hong_tong_kg ?? 0)
  };
}

function formatKg(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatNum(value: number) {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatRate(loi: number, tp: number) {
  if (!(tp > 0) || !Number.isFinite(loi)) return '—';
  return formatKg((loi / tp) * 100);
}

function formatDateLabel(iso: string) {
  const raw = String(iso || '').trim();
  if (!raw) return 'Chưa có ngày';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

function staffLabel(rows: BaoCaoTongHopListRow[]) {
  const names = new Set<string>();
  for (const row of rows) {
    splitProductionOrderStaffNames(row.cong_nhan_phu_trach).forEach(name => names.add(name));
  }
  if (names.size === 0) return '—';
  if (names.size <= 2) return [...names].sort((a, b) => a.localeCompare(b, 'vi')).join(', ');
  return `${names.size} trưởng ca`;
}

function buildDayGroups(rows: BaoCaoTongHopListRow[]): DayGroup[] {
  const dayMap = new Map<string, BaoCaoTongHopListRow[]>();
  for (const row of rows) {
    const dayKey = String(row.ngay_tu || '').trim() || '—';
    dayMap.set(dayKey, [...(dayMap.get(dayKey) ?? []), row]);
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ngayTu, dayRows]) => {
      const caMap = new Map<string, BaoCaoTongHopListRow[]>();
      for (const row of dayRows) {
        const ca = String(row.ca || '').trim() || '—';
        caMap.set(ca, [...(caMap.get(ca) ?? []), row]);
      }

      const caGroups: CaGroup[] = [...caMap.entries()]
        .sort(([a], [b]) => compareShiftCa(a, b))
        .map(([ca, caRows]) => {
          const sortedMachines = caRows
            .slice()
            .sort((a, b) =>
              String(a.may || '').localeCompare(String(b.may || ''), 'vi', { numeric: true })
            );
          return {
            key: `${ngayTu}|${ca}`,
            ca,
            staff: staffLabel(sortedMachines),
            totals: sortedMachines.reduce(addRow, emptyTotals()),
            rows: sortedMachines
          };
        });

      const ngayDen = dayRows.find(row => row.ngay_den && row.ngay_den !== row.ngay_tu)?.ngay_den || ngayTu;
      const label =
        ngayDen && ngayDen !== ngayTu
          ? `${formatDateLabel(ngayTu)} → ${formatDateLabel(ngayDen)}`
          : formatDateLabel(ngayTu);

      return {
        key: ngayTu,
        ngayTu,
        ngayDen,
        label,
        staff: staffLabel(dayRows),
        totals: dayRows.reduce(addRow, emptyTotals()),
        caGroups
      };
    });
}

function MetricCells({
  totals,
  variant
}: {
  totals: MetricTotals;
  variant: TongHopTreeVariant;
}) {
  if (variant === 'loi-hong') {
    return (
      <>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
          {formatKg(totals.tlNhuaThanhPham)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-rose-700">
          {formatKg(totals.loiHong)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
          {formatRate(totals.loiHong, totals.tlNhuaThanhPham)}
        </td>
      </>
    );
  }
  if (variant === 'san-luong') {
    return (
      <>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNum(totals.slYeuCau)}</td>
        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-cyan-800">
          {formatNum(totals.slThucTe)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
          {formatKg(totals.tlNhuaThanhPham)}
        </td>
        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
          {formatKg(totals.tlNhuaDinhMuc)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNum(totals.slYeuCau)}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatNum(totals.slThucTe)}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(totals.tlNhuaThanhPham)}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(totals.tlNhuaDinhMuc)}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(totals.xuatThucDung)}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatKg(totals.loiHong)}</td>
    </>
  );
}

function MachineMetricCells({
  row,
  variant
}: {
  row: BaoCaoTongHopListRow;
  variant: TongHopTreeVariant;
}) {
  if (variant === 'loi-hong') {
    const tp = row.tl_nhua_thanh_pham_kg ?? 0;
    const loi = row.loi_hong_tong_kg ?? 0;
    return (
      <>
        <td className="px-4 py-2 text-right font-mono tabular-nums">{formatKg(tp)}</td>
        <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-rose-700">
          {formatKg(loi)}
        </td>
        <td className="px-4 py-2 text-right font-mono tabular-nums">{formatRate(loi, tp)}</td>
      </>
    );
  }
  if (variant === 'san-luong') {
    return (
      <>
        <td className="px-4 py-2 text-right font-mono tabular-nums">{formatNum(row.sl_yeu_cau ?? 0)}</td>
        <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums text-cyan-800">
          {formatNum(row.sl_san_luong ?? 0)}
        </td>
        <td className="px-4 py-2 text-right font-mono tabular-nums">
          {formatKg(row.tl_nhua_thanh_pham_kg ?? 0)}
        </td>
        <td className="px-4 py-2 text-right font-mono tabular-nums">
          {formatKg(row.tl_nhua_dinh_muc_kg ?? 0)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-2 text-right font-mono tabular-nums">{formatNum(row.sl_yeu_cau ?? 0)}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">{formatNum(row.sl_san_luong ?? 0)}</td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">
        {formatKg(row.tl_nhua_thanh_pham_kg ?? 0)}
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">
        {formatKg(row.tl_nhua_dinh_muc_kg ?? 0)}
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">
        {formatKg(row.xuat_thuc_dung_kg ?? 0)}
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">
        {formatKg(row.loi_hong_tong_kg ?? 0)}
      </td>
    </>
  );
}

function ExpandIcon({ open, tone = 'zinc' }: { open: boolean; tone?: 'amber' | 'sky' | 'zinc' }) {
  const Icon = open ? ChevronDown : ChevronRight;
  const toneClass =
    tone === 'amber' ? 'text-amber-700' : tone === 'sky' ? 'text-sky-700' : 'text-emerald-700';
  return <Icon className={`h-4 w-4 shrink-0 ${toneClass}`} />;
}

/** 3 cấp cây: Ngày (amber) · Ca (sky) · Máy (emerald) — nền + gạch trái riêng. */
const LEVEL_DAY_ROW =
  'cursor-pointer border-b border-amber-200/80 bg-amber-50 font-semibold text-amber-950 transition hover:bg-amber-100/90';
const LEVEL_CA_ROW =
  'cursor-pointer border-b border-sky-200/80 bg-sky-50 font-semibold text-sky-950 transition hover:bg-sky-100/90';
const LEVEL_MAY_ROW =
  'cursor-pointer border-b border-emerald-100 bg-emerald-50/70 text-emerald-950 transition hover:bg-emerald-100/80';

function headerCells(variant: TongHopTreeVariant) {
  if (variant === 'loi-hong') {
    return (
      <>
        <TableHeadCell className="text-right">TP (kg)</TableHeadCell>
        <TableHeadCell className="text-right">Lỗi (kg)</TableHeadCell>
        <TableHeadCell className="text-right">Lỗi / TP (%)</TableHeadCell>
      </>
    );
  }
  if (variant === 'san-luong') {
    return (
      <>
        <TableHeadCell className="text-right">SL YC</TableHeadCell>
        <TableHeadCell className="text-right">SL thực tế</TableHeadCell>
        <TableHeadCell className="text-right">TL nhựa TP</TableHeadCell>
        <TableHeadCell className="text-right">TL ĐM</TableHeadCell>
      </>
    );
  }
  return (
    <>
      <TableHeadCell className="text-right">SL YC</TableHeadCell>
      <TableHeadCell className="text-right">SL thực tế</TableHeadCell>
      <TableHeadCell className="text-right">TL nhựa TP</TableHeadCell>
      <TableHeadCell className="text-right">TL nhựa ĐM</TableHeadCell>
      <TableHeadCell className="text-right">Xuất TD</TableHeadCell>
      <TableHeadCell className="text-right">Lỗi</TableHeadCell>
    </>
  );
}

function colSpanFor(variant: TongHopTreeVariant) {
  if (variant === 'loi-hong') return 6;
  if (variant === 'san-luong') return 7;
  return 9;
}

export default function TongHopTreeTable({
  rows,
  isLoading,
  onOpenDetail,
  variant = 'full',
  showGrandTotal = true,
  emptyMessage
}: {
  rows: BaoCaoTongHopListRow[];
  isLoading?: boolean;
  onOpenDetail?: (row: BaoCaoTongHopListRow) => void;
  variant?: TongHopTreeVariant;
  showGrandTotal?: boolean;
  emptyMessage?: string;
}) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const [expandedCas, setExpandedCas] = useState<Set<string>>(() => new Set());

  const dayGroups = useMemo(() => buildDayGroups(rows), [rows]);
  const grandTotals = useMemo(
    () =>
      dayGroups.reduce(
        (total, day) => ({
          slYeuCau: total.slYeuCau + day.totals.slYeuCau,
          slThucTe: total.slThucTe + day.totals.slThucTe,
          tlNhuaThanhPham: total.tlNhuaThanhPham + day.totals.tlNhuaThanhPham,
          tlNhuaDinhMuc: total.tlNhuaDinhMuc + day.totals.tlNhuaDinhMuc,
          xuatThucDung: total.xuatThucDung + day.totals.xuatThucDung,
          loiHong: total.loiHong + day.totals.loiHong
        }),
        emptyTotals()
      ),
    [dayGroups]
  );

  const colSpan = colSpanFor(variant);

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setExpandedCas(cas => {
          const filtered = new Set<string>();
          for (const caKey of cas) {
            if (!caKey.startsWith(`${key}|`)) filtered.add(caKey);
          }
          return filtered;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleCa = (key: string) => {
    setExpandedCas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <TableShell minWidthClassName={variant === 'full' ? 'min-w-[1000px]' : 'min-w-[720px]'}>
      <TableHead>
        <TableHeadCell>Ngày</TableHeadCell>
        <TableHeadCell>Ca / Máy</TableHeadCell>
        <TableHeadCell>Trưởng ca</TableHeadCell>
        {headerCells(variant)}
      </TableHead>
      <TableBody>
        {isLoading ? (
          <TableEmptyRow colSpan={colSpan}>
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Đang tải…
          </TableEmptyRow>
        ) : dayGroups.length === 0 ? (
          <TableEmptyRow colSpan={colSpan}>
            {emptyMessage ||
              'Chưa có dữ liệu. Vào Phân tích tự động → Tính toán để ghi bao_cao_tong_hop.'}
          </TableEmptyRow>
        ) : (
          <>
            {showGrandTotal ? (
              <tr className="border-b border-red-200 bg-red-50 font-black text-zinc-900">
                <td colSpan={3} className="px-4 py-2.5 uppercase">
                  TỔNG CỘNG
                </td>
                <MetricCells totals={grandTotals} variant={variant} />
              </tr>
            ) : null}

            {dayGroups.map(day => {
              const dayOpen = expandedDays.has(day.key);
              return (
                <React.Fragment key={day.key}>
                  <tr
                    onClick={() => toggleDay(day.key)}
                    title={dayOpen ? 'Thu gọn ca' : 'Mở tổng theo ca'}
                    className={`${LEVEL_DAY_ROW} border-l-4 border-l-amber-500`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-amber-950">
                        <ExpandIcon open={dayOpen} tone="amber" />
                        {day.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-amber-800/80">
                      {day.caGroups.length} ca
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-amber-900">{day.staff}</td>
                    <MetricCells totals={day.totals} variant={variant} />
                  </tr>

                  {dayOpen
                    ? day.caGroups.map(ca => {
                        const caOpen = expandedCas.has(ca.key);
                        return (
                          <React.Fragment key={ca.key}>
                            <tr
                              onClick={() => toggleCa(ca.key)}
                              title={caOpen ? 'Thu gọn máy' : 'Mở từng máy'}
                              className={`${LEVEL_CA_ROW} border-l-4 border-l-sky-500`}
                            >
                              <td className="px-4 py-2" />
                              <td className="px-4 py-2">
                                <span className="inline-flex items-center gap-1.5 pl-2 font-bold text-sky-950">
                                  <ExpandIcon open={caOpen} tone="sky" />
                                  {ca.ca}
                                  <span className="ml-1 font-semibold text-sky-700/80">
                                    ({ca.rows.length} máy)
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-2 font-semibold text-sky-900">{ca.staff}</td>
                              <MetricCells totals={ca.totals} variant={variant} />
                            </tr>

                            {caOpen
                              ? ca.rows.map(row => (
                                  <tr
                                    key={row.id || row.khoa_on_dinh}
                                    onClick={() => onOpenDetail?.(row)}
                                    title={
                                      onOpenDetail
                                        ? 'Mở báo cáo chi tiết ngày/ca/máy này'
                                        : undefined
                                    }
                                    className={`${LEVEL_MAY_ROW} border-l-4 border-l-emerald-500 ${
                                      onOpenDetail ? 'cursor-pointer' : ''
                                    }`}
                                  >
                                    <td className="px-4 py-2" />
                                    <td className="px-4 py-2 pl-10 font-bold text-emerald-950">
                                      {row.may === 'all' ? 'Tất cả' : row.may}
                                    </td>
                                    <td className="px-4 py-2 font-semibold text-emerald-900">
                                      {row.cong_nhan_phu_trach || '—'}
                                    </td>
                                    <MachineMetricCells row={row} variant={variant} />
                                  </tr>
                                ))
                              : null}
                          </React.Fragment>
                        );
                      })
                    : null}
                </React.Fragment>
              );
            })}
          </>
        )}
      </TableBody>
    </TableShell>
  );
}
