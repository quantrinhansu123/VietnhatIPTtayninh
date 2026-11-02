import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { BaoCaoTongHopListRow } from './index';
import {
  axisTick,
  BarGradientDefs,
  CHART,
  ChartCard,
  ChartFrame,
  ChartTooltipBox,
  fmtAxis,
  fmtKg,
  KpiCard,
  legendStyle
} from './chartUi';
import {
  comparisonRows,
  LOI_HONG_RATE_THRESHOLD_PERCENT,
  percentAxisDomain,
  summarize
} from './comparisonData';
import { compareShiftCa } from './BieuDoThCharts';
import TongHopTreeTable from './TongHopTreeTable';

const rateThresholdLine = (
  <ReferenceLine
    yAxisId="percent"
    y={LOI_HONG_RATE_THRESHOLD_PERCENT}
    stroke={CHART.rose}
    strokeDasharray="6 4"
    strokeWidth={2}
    label={{
      value: `Ngưỡng ${LOI_HONG_RATE_THRESHOLD_PERCENT}%`,
      position: 'insideTopRight',
      fill: CHART.rose,
      fontSize: 13,
      fontWeight: 700
    }}
  />
);

function DetailTable({ rows }: { rows: BaoCaoTongHopListRow[] }) {
  return (
    <ChartCard
      title="Chi tiết theo ngày · ca · máy"
      subtitle="Gộp như bảng tổng · công nhân = trưởng ca"
      accent="rose"
    >
      <TongHopTreeTable
        rows={rows}
        variant="loi-hong"
        showGrandTotal
        emptyMessage="Chưa có số liệu lỗi hỏng phù hợp bộ lọc."
      />
    </ChartCard>
  );
}

export default function LoiHongPanel({
  rows,
  isLoading
}: {
  rows: BaoCaoTongHopListRow[];
  isLoading: boolean;
}) {
  const [machine, setMachine] = useState('all');
  const clean = useMemo(() => comparisonRows(rows), [rows]);
  const names = [...new Set(clean.map(r => r.may))].sort((a, b) => a.localeCompare(b, 'vi'));
  const selected = clean.filter(r => machine === 'all' || r.may === machine);
  const byMachine = summarize(selected, r => r.may);
  const byDay = summarize(selected, r => r.ngay_tu);
  const byStaff = summarize(selected, r => String(r.cong_nhan_phu_trach || '').trim() || 'Chưa gán');
  const byCa = summarize(selected, r => String(r.ca || '').trim() || '—').sort((a, b) =>
    compareShiftCa(a.label, b.label)
  );
  const total = summarize(selected, () => 'Tổng')[0];
  const daysWithDefect = selected.filter(r => (r.loi_hong_tong_kg ?? 0) > 0).length;

  if (isLoading) {
    return <p role="status" className="p-6 text-slate-600">Đang tải dữ liệu lỗi hỏng…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose-700">Chất lượng</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Lỗi hỏng</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Khối lượng lỗi và tỷ lệ lỗi / thành phẩm theo máy, ngày, ca. Ngưỡng cho phép{' '}
            {LOI_HONG_RATE_THRESHOLD_PERCENT}%.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Máy</span>
          <select
            className="min-w-[10rem] bg-transparent font-semibold text-slate-900 focus:outline-none"
            value={machine}
            onChange={e => setMachine(e.target.value)}
          >
            <option value="all">Tất cả máy</option>
            {names.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!total ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Chưa có dữ liệu chi tiết ngày · ca · máy phù hợp.
        </p>
      ) : (
        <>
          <DetailTable rows={selected} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Lỗi hỏng (kg)" value={fmtKg(total.loi)} accent="rose" />
            <KpiCard
              label="Tỷ lệ lỗi / TP"
              value={`${fmtKg(total.rate)}${total.rate == null ? '' : '%'}`}
              accent="rose"
            />
            <KpiCard label="Thành phẩm (kg)" value={fmtKg(total.tp)} accent="slate" />
            <KpiCard label="Dòng có lỗi" value={String(daysWithDefect)} accent="slate" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Lỗi hỏng và tỷ lệ theo máy" subtitle="Kg lỗi · % so với thành phẩm" accent="rose">
              <ChartFrame points={byMachine.length}>
                <ComposedChart
                  data={byMachine}
                  margin={{ top: 8, right: 8, bottom: 28, left: 0 }}
                  accessibilityLayer
                >
                  <BarGradientDefs id="loiHongBar" from={CHART.roseSoft} to={CHART.rose} />
                  <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={{ stroke: CHART.grid }}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    height={52}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="kg"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <YAxis
                    yAxisId="percent"
                    orientation="right"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    unit="%"
                    domain={[...percentAxisDomain]}
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                  <Bar
                    yAxisId="kg"
                    dataKey="loi"
                    name="Lỗi hỏng (kg)"
                    fill="url(#loiHongBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="percent"
                    dataKey="rate"
                    name="Lỗi / TP (%)"
                    stroke={CHART.ink}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: CHART.ink, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  {rateThresholdLine}
                </ComposedChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard
              title="Xu hướng lỗi theo ngày"
              subtitle="Kg lỗi · % so với thành phẩm · ngưỡng 2%"
              accent="rose"
            >
              <ChartFrame points={byDay.length}>
                <ComposedChart
                  data={byDay}
                  margin={{ top: 8, right: 8, bottom: 28, left: 0 }}
                  accessibilityLayer
                >
                  <BarGradientDefs id="loiHongDayBar" from="#fda4af" to={CHART.rose} />
                  <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={{ stroke: CHART.grid }}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    height={52}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="kg"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <YAxis
                    yAxisId="percent"
                    orientation="right"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    unit="%"
                    domain={[...percentAxisDomain]}
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                  <Bar
                    yAxisId="kg"
                    dataKey="loi"
                    name="Lỗi hỏng (kg)"
                    fill="url(#loiHongDayBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="percent"
                    dataKey="rate"
                    name="Lỗi / TP (%)"
                    stroke={CHART.ink}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: CHART.ink, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  {rateThresholdLine}
                </ComposedChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard
              title="Lỗi hỏng theo trưởng ca"
              subtitle="Kg lỗi · % so với thành phẩm"
              accent="rose"
            >
              <ChartFrame points={byStaff.length}>
                <ComposedChart
                  data={byStaff}
                  margin={{ top: 8, right: 8, bottom: 28, left: 0 }}
                  accessibilityLayer
                >
                  <BarGradientDefs id="loiHongStaffBar" from={CHART.roseSoft} to={CHART.rose} />
                  <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={{ stroke: CHART.grid }}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    height={52}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="kg"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <YAxis
                    yAxisId="percent"
                    orientation="right"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    unit="%"
                    domain={[...percentAxisDomain]}
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                  <Bar
                    yAxisId="kg"
                    dataKey="loi"
                    name="Lỗi hỏng (kg)"
                    fill="url(#loiHongStaffBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="percent"
                    dataKey="rate"
                    name="Lỗi / TP (%)"
                    stroke={CHART.ink}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: CHART.ink, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  {rateThresholdLine}
                </ComposedChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard
              title="Lỗi hỏng theo ca"
              subtitle="Kg lỗi · % so với thành phẩm · theo ca sản xuất"
              accent="rose"
            >
              <ChartFrame points={byCa.length}>
                <ComposedChart
                  data={byCa}
                  margin={{ top: 8, right: 8, bottom: 28, left: 0 }}
                  accessibilityLayer
                >
                  <BarGradientDefs id="loiHongCaBar" from="#fda4af" to={CHART.rose} />
                  <CartesianGrid stroke={CHART.grid} vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    axisLine={{ stroke: CHART.grid }}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    height={52}
                    interval={0}
                  />
                  <YAxis
                    yAxisId="kg"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <YAxis
                    yAxisId="percent"
                    orientation="right"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    unit="%"
                    domain={[...percentAxisDomain]}
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                  <Bar
                    yAxisId="kg"
                    dataKey="loi"
                    name="Lỗi hỏng (kg)"
                    fill="url(#loiHongCaBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="percent"
                    dataKey="rate"
                    name="Lỗi / TP (%)"
                    stroke={CHART.ink}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: CHART.ink, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  {rateThresholdLine}
                </ComposedChart>
              </ChartFrame>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
