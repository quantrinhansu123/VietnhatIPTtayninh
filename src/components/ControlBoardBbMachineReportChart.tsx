import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { AlertTriangle, BarChart3, CheckCircle2, TrendingUp, Wallet } from 'lucide-react';
import { formatMoney } from '../utils';
import type { BbDanhGiaHaoHutGroup } from '../utils/controlBoardBbMachineReport';
import { TI_LE_LOI_HONG_DINH_MUC_PERCENT } from '../utils/controlBoardShiftSummary';

const SERIES_1_BLUE = '#2a78d6';
const SERIES_2_AQUA = '#1baf7a';
const SERIES_3_YELLOW = '#eda100';
const STATUS_CRITICAL_RED = '#d03b3b';
const STATUS_GOOD_GREEN = '#0ca30c';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#898781';
const BORDER_COLOR = '#e1e0d9';
const SURFACE = '#fcfcfb';
const INK_PRIMARY = '#0b0b0b';
const INK_SECONDARY = '#52514e';
const INK_MUTED = '#898781';
const CURSOR_WASH = 'rgba(11,11,11,0.04)';

function formatAxisNumber(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(ngay: string) {
  const parts = String(ngay || '').split('-');
  if (parts.length !== 3) return ngay || '—';
  return `${parts[2]}/${parts[1]}`;
}

function shortenShift(label: string) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return '—';
  return trimmed.length > 12 ? `${trimmed.slice(0, 11)}…` : trimmed;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; name: string; value: number; color: string }>;
  label?: string;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: SURFACE, border: `1px solid ${BORDER_COLOR}`, boxShadow: '0 4px 16px rgba(11,11,11,0.10)' }}
    >
      <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: INK_MUTED }}>
        {label}
      </p>
      <div className="mt-1 space-y-1">
        {payload.map(entry => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-[11px]">
            <span className="inline-block h-[2px] w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span style={{ color: INK_SECONDARY }}>{entry.name}</span>
            <span className="ml-auto font-black tabular-nums" style={{ color: INK_PRIMARY }}>
              {formatValue(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartCardHeader({
  icon,
  title
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">{icon}</span>
      <h4 className="text-xs font-bold text-slate-700">{title}</h4>
    </div>
  );
}

const cardClass = 'rounded-xl bg-white p-3 transition-shadow hover:shadow-sm';
const cardStyle: React.CSSProperties = { border: `1px solid ${BORDER_COLOR}` };

export default function ControlBoardBbMachineReportChart({
  groups,
  isLoading
}: {
  groups: BbDanhGiaHaoHutGroup[];
  isLoading?: boolean;
}) {
  const chartData = useMemo(
    () =>
      [...groups]
        .sort((a, b) => {
          const dateCmp = String(a.ngay || '').localeCompare(String(b.ngay || ''));
          if (dateCmp !== 0) return dateCmp;
          return String(a.orderCode || '').localeCompare(String(b.orderCode || ''), 'vi');
        })
        .map(group => ({
          key: group.groupKey,
          label: `${formatShortDate(group.ngay)} · ${shortenShift(group.shiftLabel || group.shift)} · ${group.orderCode || '—'}`,
          orderCode: group.orderCode,
          nhuaThuc: Number(group.tongNhuaThucXuat.toFixed(1)),
          nhuaDm: Number(group.tongNhuaDinhMuc.toFixed(1)),
          mangThuc: Number(group.tongMangThucXuat.toFixed(1)),
          mangDm: Number(group.tongMangDinhMuc.toFixed(1)),
          tiLeLoiHong: Number(group.tiLeLoiHong.toFixed(2)),
          tiLeLoiHongDm: Number(group.tiLeLoiHongDinhMuc.toFixed(2)),
          giaTriHaoHutNhua: Number(group.giaTriHaoHutNhua.toFixed(0)),
          giaTriHaoHutMang: Number(group.giaTriHaoHutMang.toFixed(0)),
          tongGiaTriHaoHut: Number(group.tongGiaTriHaoHutLoiHong.toFixed(0))
        })),
    [groups]
  );

  const breachCount = useMemo(
    () => chartData.filter(row => row.tiLeLoiHong > TI_LE_LOI_HONG_DINH_MUC_PERCENT).length,
    [chartData]
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-400">
        Đang tải dữ liệu biểu đồ...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400">
        Chưa có dữ liệu đánh giá theo bộ lọc. Bấm «Tính toán» để tạo snapshot rồi mở lại tab biểu đồ.
      </div>
    );
  }

  const xAxisProps = {
    dataKey: 'label',
    stroke: AXIS_COLOR,
    tick: { fontSize: 9, fill: AXIS_COLOR },
    angle: -30 as const,
    textAnchor: 'end' as const,
    height: 72,
    interval: 0 as const
  };

  const yAxisProps = {
    stroke: AXIS_COLOR,
    tick: { fontSize: 10, fill: AXIS_COLOR },
    tickFormatter: formatAxisNumber,
    width: 52
  };

  const kgTooltipFormat = (value: number) => `${formatAxisNumber(value)} kg`;

  return (
    <div className="space-y-3 p-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-800">Biểu đồ so sánh theo lệnh SX</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {chartData.length} lệnh · so sánh thực tế vs định mức (tab Đánh giá hiệu quả ca)
          {breachCount > 0 ? ` · ${breachCount} lệnh vượt tỉ lệ lỗi hỏng định mức` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />} title="Nhựa: thực xuất vs định mức (kg)" />
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip cursor={{ fill: CURSOR_WASH }} content={<ChartTooltip formatValue={kgTooltipFormat} />} />
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar name="Thực xuất" dataKey="nhuaThuc" fill={SERIES_1_BLUE} radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar name="Định mức" dataKey="nhuaDm" fill={SERIES_2_AQUA} radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />} title="Màng: thực xuất vs định mức (kg)" />
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip cursor={{ fill: CURSOR_WASH }} content={<ChartTooltip formatValue={kgTooltipFormat} />} />
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar name="Thực xuất" dataKey="mangThuc" fill={SERIES_3_YELLOW} radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar name="Định mức" dataKey="mangDm" fill={SERIES_2_AQUA} radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader icon={<TrendingUp className="h-3.5 w-3.5 text-slate-500" />} title="Tỉ lệ lỗi hỏng: thực tế vs định mức (%)" />
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={value => `${formatAxisNumber(value)}%`} />
                <Tooltip
                  cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
                  content={<ChartTooltip formatValue={value => `${value}%`} />}
                />
                <ReferenceLine
                  y={TI_LE_LOI_HONG_DINH_MUC_PERCENT}
                  stroke={AXIS_COLOR}
                  strokeDasharray="4 4"
                  label={{
                    value: `ĐM ${TI_LE_LOI_HONG_DINH_MUC_PERCENT}%`,
                    position: 'insideTopLeft',
                    fontSize: 10,
                    fill: AXIS_COLOR
                  }}
                />
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line
                  name="Thực tế"
                  dataKey="tiLeLoiHong"
                  stroke={SERIES_1_BLUE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: SERIES_1_BLUE }}
                />
                <Line
                  name="Định mức"
                  dataKey="tiLeLoiHongDm"
                  stroke={SERIES_2_AQUA}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Trong định mức
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-rose-600" />
              Vượt {TI_LE_LOI_HONG_DINH_MUC_PERCENT}%
            </span>
          </div>
        </div>

        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader icon={<Wallet className="h-3.5 w-3.5 text-slate-500" />} title="Giá trị hao hụt + lỗi hỏng (đ)" />
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={value => formatMoney(value, 0)} />
                <ReferenceLine y={0} stroke="#c3c2b7" strokeWidth={1} />
                <Tooltip
                  cursor={{ fill: CURSOR_WASH }}
                  content={<ChartTooltip formatValue={value => formatMoney(value, 0)} />}
                />
                <Bar name="Tổng GT hao hụt + lỗi" dataKey="tongGiaTriHaoHut" maxBarSize={24}>
                  {chartData.map(entry => (
                    <Cell
                      key={entry.key}
                      fill={entry.tongGiaTriHaoHut >= 0 ? STATUS_CRITICAL_RED : STATUS_GOOD_GREEN}
                      radius={entry.tongGiaTriHaoHut >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
