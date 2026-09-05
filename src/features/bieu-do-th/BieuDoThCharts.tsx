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
import { BarChart3, TrendingUp } from 'lucide-react';

export type BieuDoThChartSourceRow = {
  ngay_tu: string;
  ngay_den: string;
  ca: string;
  sl_yeu_cau: number | null;
  sl_san_luong: number | null;
  tl_xuat_nhua_kg: number | null;
  tl_xuat_tong_kg: number | null;
  tl_nhua_thanh_pham_kg: number | null;
  tl_nhua_dinh_muc_kg: number | null;
  xuat_thuc_dung_kg: number | null;
  chenh_lech_nhua_kg: number | null;
  ton_dau_tong_kg: number | null;
  ton_cuoi_tong_kg: number | null;
  loi_hong_tong_kg: number | null;
};

const SERIES_BLUE = '#2a78d6';
const SERIES_AQUA = '#1baf7a';
const SERIES_AMBER = '#eda100';
const SERIES_VIOLET = '#7c3aed';
const SERIES_ROSE = '#d03b3b';
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

function formatShortDate(iso: string) {
  const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '—';
  return `${m[3]}/${m[2]}`;
}

/** 12C1 trước 12C2; HC1 trước HC2; số sau chữ C tăng dần. */
export function compareShiftCa(a: string, b: string) {
  const norm = (value: string) => String(value || '').trim().toUpperCase();
  const parse = (value: string) => {
    const raw = norm(value);
    const match = raw.match(/^(\d*)C(\d+)/i);
    if (match) {
      return {
        family: Number(match[1] || 0),
        index: Number(match[2] || 0),
        raw
      };
    }
    return { family: 9999, index: 9999, raw };
  };
  const left = parse(a);
  const right = parse(b);
  if (left.family !== right.family) return left.family - right.family;
  if (left.index !== right.index) return left.index - right.index;
  return left.raw.localeCompare(right.raw, 'vi', { numeric: true });
}

function addMetric(acc: number, value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return acc;
  return acc + value;
}

type ChartPoint = {
  key: string;
  label: string;
  ngay: string;
  ca: string;
  slYeuCau: number;
  slSanLuong: number;
  tlXuatNhua: number;
  tlNhuaTp: number;
  tlNhuaDm: number;
  xuatThucDung: number;
  chenhLech: number;
  tonDau: number;
  tonCuoi: number;
  loiHong: number;
};

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
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER_COLOR}`,
        boxShadow: '0 4px 16px rgba(11,11,11,0.10)'
      }}
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
              {formatValue(Number(entry.value) || 0)}
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
  subtitle
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 pb-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">
          {icon}
        </span>
        <div>
          <h4 className="text-xs font-bold text-slate-700">{title}</h4>
          {subtitle ? <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

const cardClass = 'rounded-xl bg-white p-3 transition-shadow hover:shadow-sm';
const cardStyle: React.CSSProperties = { border: `1px solid ${BORDER_COLOR}` };

export function buildBieuDoThChartPoints(rows: BieuDoThChartSourceRow[]): ChartPoint[] {
  const buckets = new Map<string, ChartPoint>();

  for (const row of rows) {
    const ngay = String(row.ngay_tu || row.ngay_den || '').trim();
    if (!ngay) continue;
    const ca = String(row.ca || '').trim() || 'all';
    const key = `${ngay}|${ca}`;
    const current = buckets.get(key) || {
      key,
      label: `${formatShortDate(ngay)} · ${ca}`,
      ngay,
      ca,
      slYeuCau: 0,
      slSanLuong: 0,
      tlXuatNhua: 0,
      tlNhuaTp: 0,
      tlNhuaDm: 0,
      xuatThucDung: 0,
      chenhLech: 0,
      tonDau: 0,
      tonCuoi: 0,
      loiHong: 0
    };

    current.slYeuCau = addMetric(current.slYeuCau, row.sl_yeu_cau);
    current.slSanLuong = addMetric(current.slSanLuong, row.sl_san_luong);
    current.tlXuatNhua = addMetric(current.tlXuatNhua, row.tl_xuat_nhua_kg ?? row.tl_xuat_tong_kg);
    current.tlNhuaTp = addMetric(current.tlNhuaTp, row.tl_nhua_thanh_pham_kg);
    current.tlNhuaDm = addMetric(current.tlNhuaDm, row.tl_nhua_dinh_muc_kg);
    current.xuatThucDung = addMetric(current.xuatThucDung, row.xuat_thuc_dung_kg);
    current.chenhLech = addMetric(current.chenhLech, row.chenh_lech_nhua_kg);
    current.tonDau = addMetric(current.tonDau, row.ton_dau_tong_kg);
    current.tonCuoi = addMetric(current.tonCuoi, row.ton_cuoi_tong_kg);
    current.loiHong = addMetric(current.loiHong, row.loi_hong_tong_kg);
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .sort((a, b) => {
      const dateCmp = a.ngay.localeCompare(b.ngay);
      if (dateCmp !== 0) return dateCmp;
      return compareShiftCa(a.ca, b.ca);
    })
    .map(point => ({
      ...point,
      slYeuCau: Number(point.slYeuCau.toFixed(2)),
      slSanLuong: Number(point.slSanLuong.toFixed(2)),
      tlXuatNhua: Number(point.tlXuatNhua.toFixed(2)),
      tlNhuaTp: Number(point.tlNhuaTp.toFixed(2)),
      tlNhuaDm: Number(point.tlNhuaDm.toFixed(2)),
      xuatThucDung: Number(point.xuatThucDung.toFixed(2)),
      chenhLech: Number(point.chenhLech.toFixed(2)),
      tonDau: Number(point.tonDau.toFixed(2)),
      tonCuoi: Number(point.tonCuoi.toFixed(2)),
      loiHong: Number(point.loiHong.toFixed(2))
    }));
}

export default function BieuDoThCharts({
  rows,
  isLoading
}: {
  rows: BieuDoThChartSourceRow[];
  isLoading?: boolean;
}) {
  const chartData = useMemo(() => buildBieuDoThChartPoints(rows), [rows]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs font-semibold text-slate-400 shadow-sm">
        Đang tải dữ liệu để vẽ biểu đồ…
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-semibold text-slate-400">
        Chưa có dữ liệu theo ngày · ca để vẽ biểu đồ.
      </div>
    );
  }

  const xAxisProps = {
    dataKey: 'label' as const,
    tick: { fill: AXIS_COLOR, fontSize: 10 },
    axisLine: { stroke: GRID_COLOR },
    tickLine: { stroke: GRID_COLOR },
    interval: 0 as const,
    angle: chartData.length > 6 ? -28 : 0,
    textAnchor: (chartData.length > 6 ? 'end' : 'middle') as 'end' | 'middle',
    height: chartData.length > 6 ? 58 : 28
  };

  const yAxisProps = {
    tick: { fill: AXIS_COLOR, fontSize: 10 },
    axisLine: { stroke: GRID_COLOR },
    tickLine: { stroke: GRID_COLOR },
    width: 52,
    tickFormatter: formatAxisNumber
  };

  const kgTooltip = (value: number) =>
    `${value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`;
  const qtyTooltip = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-red-600">Biểu đồ theo ca</p>
        <p className="mt-1 text-sm font-semibold text-zinc-600">
          Trục ngang = Ngày · Ca (12C1 trước 12C2). Cộng gộp theo máy cùng ngày+ca.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<TrendingUp className="h-3.5 w-3.5 text-slate-500" />}
            title="Nhựa theo ca"
            subtitle="Chênh lệch · Lỗi hỏng theo Ngày · Ca"
          />
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip content={<ChartTooltip formatValue={kgTooltip} />} />
                <Legend wrapperStyle={legendStyle} />
                <ReferenceLine y={0} stroke={GRID_COLOR} />
                <Line
                  type="monotone"
                  dataKey="chenhLech"
                  name="Chênh lệch"
                  stroke={SERIES_ROSE}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="loiHong"
                  name="Lỗi"
                  stroke={SERIES_AMBER}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={cardClass} style={cardStyle}>
          <ChartCardHeader
            icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />}
            title="Sản lượng theo ca"
            subtitle="SL yêu cầu · SL SP · Lỗi hỏng (kg)"
          />
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip cursor={{ fill: CURSOR_WASH }} content={<ChartTooltip formatValue={qtyTooltip} />} />
                <Legend wrapperStyle={legendStyle} />
                <Bar dataKey="slYeuCau" name="SL yêu cầu" fill={SERIES_VIOLET} radius={[4, 4, 0, 0]} />
                <Bar dataKey="slSanLuong" name="SL SP" fill={SERIES_BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="loiHong" name="Lỗi (kg)" fill={SERIES_ROSE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${cardClass} lg:col-span-2`} style={cardStyle}>
          <ChartCardHeader
            icon={<BarChart3 className="h-3.5 w-3.5 text-slate-500" />}
            title="Chênh lệch nhựa theo ca"
            subtitle="Dương = lãi · Âm = lỗ (kg)"
          />
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <Tooltip cursor={{ fill: CURSOR_WASH }} content={<ChartTooltip formatValue={kgTooltip} />} />
                <Legend wrapperStyle={legendStyle} />
                <ReferenceLine y={0} stroke={GRID_COLOR} />
                <Bar dataKey="chenhLech" name="Chênh lệch nhựa" radius={[4, 4, 0, 0]}>
                  {chartData.map(point => (
                    <Cell
                      key={point.key}
                      fill={point.chenhLech >= 0 ? SERIES_AQUA : SERIES_ROSE}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
