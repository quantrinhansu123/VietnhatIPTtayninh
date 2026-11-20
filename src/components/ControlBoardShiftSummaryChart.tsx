import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { AlertTriangle, BarChart3, CheckCircle2, TrendingUp, Wallet } from 'lucide-react';
import type { ControlBoardShiftSummaryRow, ShiftSummaryWarehouseMovement } from '../utils/controlBoardShiftSummary';
import {
  TI_LE_LOI_HONG_DINH_MUC_PERCENT,
  computeSoTienLoLaiNhua,
  resolveShiftSummaryGiaNhuaFromWarehouse
} from '../utils/controlBoardShiftSummary';
import type { ShiftSetting } from '../utils/shiftSettings';
import { formatMoney } from '../utils';

// Validated categorical palette (light mode) — see dataviz skill palette.md
const SERIES_1_BLUE = '#2a78d6';
const SERIES_2_AQUA = '#1baf7a';
const SERIES_3_YELLOW = '#eda100';
const SERIES_4_GREEN = '#008300';
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

const legendStyle: React.CSSProperties = { fontSize: '11px', paddingTop: '8px' };

function formatAxisNumber(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(ngay: string) {
  const parts = String(ngay || '').split('-');
  if (parts.length !== 3) return ngay || '-';
  return `${parts[2]}/${parts[1]}`;
}

function shortenShift(ca: string) {
  const trimmed = String(ca || '').trim();
  if (!trimmed) return '-';
  return trimmed.length > 10 ? `${trimmed.slice(0, 9)}…` : trimmed;
}

/** Tooltip dùng chung — value đứng trước (đậm), tên series phụ, key là gạch màu chứ không phải ô vuông. */
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
  title,
  trailing
}: {
  icon: React.ReactNode;
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">{icon}</span>
        <h4 className="text-xs font-bold text-slate-700">{title}</h4>
      </div>
      {trailing}
    </div>
  );
}

const cardClass = 'rounded-xl bg-white p-3 transition-shadow hover:shadow-sm';
const cardStyle: React.CSSProperties = { border: `1px solid ${BORDER_COLOR}` };

export default function ControlBoardShiftSummaryChart({
  rows,
  isLoading,
  warehouseMovements,
  shiftSettings
}: {
  rows: ControlBoardShiftSummaryRow[];
  isLoading?: boolean;
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  shiftSettings?: ShiftSetting[];
}) {
  const [defectUnit, setDefectUnit] = useState<'kg' | 'percent'>('percent');

  const chartData = useMemo(() => {
    return [...rows]
      .reverse()
      .map(row => {
        const giaNhua = resolveShiftSummaryGiaNhuaFromWarehouse(row.ngay, row.ca, warehouseMovements, shiftSettings ?? []);
        return {
          key: row.key,
          label: `${formatShortDate(row.ngay)} · ${shortenShift(row.ca)}`,
          khoiLuongHangThucTe: Number(row.khoiLuongHangThucTe.toFixed(1)),
          tongThucDung: Number(row.tongThucDung.toFixed(1)),
          tongTpNhapKho: Number(row.tongTpNhapKho.toFixed(1)),
          hangHong: Number(row.hangHong.toFixed(1)),
          tiLeLoiHong: Number(row.tiLeLoiHong.toFixed(2)),
          tongNhuaThucDung: Number(Math.max(row.tongNhuaThucDung, 0).toFixed(1)),
          tongMangThucDung: Number(Math.max(row.tongMangThucDung, 0).toFixed(1)),
          loiThucDung: Number(Math.max(row.loiThucDung, 0).toFixed(1)),
          tuiThucDung: Number(Math.max(row.tuiThucDung, 0).toFixed(1)),
          soTienLoLaiNhua: computeSoTienLoLaiNhua(row.giaTriLoLaiNhua, giaNhua)
        };
      });
  }, [rows, warehouseMovements, shiftSettings]);

  const breachCount = useMemo(
    () => chartData.filter(row => row.tiLeLoiHong > TI_LE_LOI_HONG_DINH_MUC_PERCENT).length,
    [chartData]
  );

  const hasData = chartData.length > 0;

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs font-semibold text-slate-400 shadow-sm">
        Đang tải dữ liệu để vẽ biểu đồ...
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-semibold text-slate-400">
        Chưa có dữ liệu trong khoảng thời gian đã chọn để vẽ biểu đồ trực quan.
      </div>
    );
  }

  const xAxisProps = {
    dataKey: 'label',
    stroke: AXIS_COLOR,
    tick: { fontSize: 10, fill: AXIS_COLOR },
    angle: -35 as const,
    textAnchor: 'end' as const,
    height: 56,
    interval: 'preserveStartEnd' as const
  };

  const yAxisProps = {
    stroke: AXIS_COLOR,
    tick: { fontSize: 10, fill: AXIS_COLOR },
    tickFormatter: formatAxisNumber,
    width: 52
  };

  const kgTooltipFormat = (value: number) => `${formatAxisNumber(value)} kg`;

  const defectDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (typeof cx !== 'number' || typeof cy !== 'number') return <React.Fragment key={`dot-${index}`} />;
    const isBreach = defectUnit === 'percent' ? payload.tiLeLoiHong > TI_LE_LOI_HONG_DINH_MUC_PERCENT : payload.hangHong > 0;
    const color = defectUnit === 'percent' ? (isBreach ? STATUS_CRITICAL_RED : STATUS_GOOD_GREEN) : STATUS_CRITICAL_RED;
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={color} stroke={SURFACE} strokeWidth={2} />;
  };

  const defectActiveDot = (props: any) => {
    const { cx, cy, payload, index } = props;
    if (typeof cx !== 'number' || typeof cy !== 'number') return <React.Fragment key={`active-dot-${index}`} />;
    const isBreach = defectUnit === 'percent' ? payload.tiLeLoiHong > TI_LE_LOI_HONG_DINH_MUC_PERCENT : payload.hangHong > 0;
    const color = defectUnit === 'percent' ? (isBreach ? STATUS_CRITICAL_RED : STATUS_GOOD_GREEN) : STATUS_CRITICAL_RED;
    return <circle key={`active-dot-${index}`} cx={cx} cy={cy} r={6} fill={color} stroke={SURFACE} strokeWidth={2} />;
  };

  return (
    <div className="space-y-3 rounded-xl bg-white p-3 shadow-sm" style={{ border: `1px solid ${BORDER_COLOR}` }}>
      <div>
        <h3 className="text-sm font-extrabold text-slate-800">Biểu đồ trực quan — Bảng tổng hợp theo ca</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {chartData.length} ca sản xuất trong khoảng thời gian đã lọc · số liệu chi tiết có ở bảng bên dưới
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Chart 1: Sản lượng & vật tư nhập kho theo ca */}
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<BarChart3 className="w-3.5 h-3.5 text-slate-500" />}
            title="Sản lượng & vật tư nhập kho theo ca (kg)"
          />
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip
                  cursor={{ fill: CURSOR_WASH }}
                  content={<ChartTooltip formatValue={kgTooltipFormat} />}
                />
                <Legend iconSize={10} iconType="circle" wrapperStyle={legendStyle} />
                <Bar
                  name="Khối lượng hàng TT"
                  dataKey="khoiLuongHangThucTe"
                  fill={SERIES_1_BLUE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  name="Tổng thực dùng"
                  dataKey="tongThucDung"
                  fill={SERIES_2_AQUA}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  name="Tổng TP nhập kho"
                  dataKey="tongTpNhapKho"
                  fill={SERIES_3_YELLOW}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Tỉ lệ / khối lượng lỗi hỏng theo ca */}
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<TrendingUp className="w-3.5 h-3.5 text-slate-500" />}
            title="Lỗi hỏng theo ca"
            trailing={
              <div className="flex items-center gap-2">
                {defectUnit === 'percent' && breachCount > 0 && (
                  <span
                    className="hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline-flex"
                    style={{ backgroundColor: 'rgba(208,59,59,0.08)', color: STATUS_CRITICAL_RED }}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {breachCount} ca vượt định mức
                  </span>
                )}
                <div className="flex rounded-lg overflow-hidden text-[10px] font-bold" style={{ border: `1px solid ${BORDER_COLOR}` }}>
                  <button
                    type="button"
                    onClick={() => setDefectUnit('percent')}
                    className={`px-2 py-1 ${defectUnit === 'percent' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefectUnit('kg')}
                    className={`px-2 py-1 ${defectUnit === 'kg' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500'}`}
                  >
                    kg
                  </button>
                </div>
              </div>
            }
          />
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis
                  {...yAxisProps}
                  tickFormatter={value => (defectUnit === 'percent' ? `${formatAxisNumber(value)}%` : formatAxisNumber(value))}
                />
                <Tooltip
                  cursor={{ stroke: AXIS_COLOR, strokeWidth: 1 }}
                  content={
                    <ChartTooltip
                      formatValue={value => (defectUnit === 'percent' ? `${value}%` : `${formatAxisNumber(value)} kg`)}
                    />
                  }
                />
                {defectUnit === 'percent' && (
                  <ReferenceLine
                    y={TI_LE_LOI_HONG_DINH_MUC_PERCENT}
                    stroke={AXIS_COLOR}
                    strokeDasharray="4 4"
                    label={{ value: `Định mức ${TI_LE_LOI_HONG_DINH_MUC_PERCENT}%`, position: 'insideTopLeft', fontSize: 10, fill: AXIS_COLOR }}
                  />
                )}
                <Line
                  name={defectUnit === 'percent' ? 'Tỉ lệ lỗi hỏng (%)' : 'Hàng hỏng (kg)'}
                  dataKey={defectUnit === 'percent' ? 'tiLeLoiHong' : 'hangHong'}
                  stroke={INK_MUTED}
                  strokeWidth={2}
                  dot={defectDot}
                  activeDot={defectActiveDot}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {defectUnit === 'percent' && (
            <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: INK_SECONDARY }}>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" style={{ color: STATUS_GOOD_GREEN }} />
                Trong định mức
              </span>
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" style={{ color: STATUS_CRITICAL_RED }} />
                Vượt định mức {TI_LE_LOI_HONG_DINH_MUC_PERCENT}%
              </span>
            </div>
          )}
        </div>

        {/* Chart 3: Vật tư thực dùng theo ca (stacked) */}
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<BarChart3 className="w-3.5 h-3.5 text-slate-500" />}
            title="Vật tư thực dùng theo ca (kg)"
          />
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip cursor={{ fill: CURSOR_WASH }} content={<ChartTooltip formatValue={kgTooltipFormat} />} />
                <Legend iconSize={10} iconType="circle" wrapperStyle={legendStyle} />
                <Bar name="Nhựa" dataKey="tongNhuaThucDung" stackId="vt" fill={SERIES_1_BLUE} stroke={SURFACE} strokeWidth={2} maxBarSize={22} />
                <Bar name="Màng" dataKey="tongMangThucDung" stackId="vt" fill={SERIES_2_AQUA} stroke={SURFACE} strokeWidth={2} maxBarSize={22} />
                <Bar name="Lõi" dataKey="loiThucDung" stackId="vt" fill={SERIES_3_YELLOW} stroke={SURFACE} strokeWidth={2} maxBarSize={22} />
                <Bar
                  name="Túi"
                  dataKey="tuiThucDung"
                  stackId="vt"
                  fill={SERIES_4_GREEN}
                  stroke={SURFACE}
                  strokeWidth={2}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Tiền chênh lệch lãi lỗ nhựa theo ca */}
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<Wallet className="w-3.5 h-3.5 text-slate-500" />}
            title="Tiền chênh lệch lãi lỗ (đ)"
          />
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} tickFormatter={value => formatMoney(value, 0)} />
                <ReferenceLine y={0} stroke="#c3c2b7" strokeWidth={1} />
                <Tooltip
                  cursor={{ fill: CURSOR_WASH }}
                  content={<ChartTooltip formatValue={value => `${value >= 0 ? '+' : ''}${formatMoney(value, 0)} đ`} />}
                />
                <Bar
                  name="Tiền lãi/lỗ"
                  dataKey="soTienLoLaiNhua"
                  maxBarSize={22}
                  shape={({ x, y, width, height, value }) => {
                    const nonNegative = (Array.isArray(value) ? value[1] : value) >= 0;
                    return (
                      <Rectangle
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={nonNegative ? STATUS_GOOD_GREEN : STATUS_CRITICAL_RED}
                        radius={nonNegative ? [4, 4, 0, 0] : [0, 0, 4, 4]}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px]" style={{ color: INK_SECONDARY }}>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" style={{ color: STATUS_GOOD_GREEN }} />
              Lãi (dương)
            </span>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" style={{ color: STATUS_CRITICAL_RED }} />
              Lỗ (âm)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
