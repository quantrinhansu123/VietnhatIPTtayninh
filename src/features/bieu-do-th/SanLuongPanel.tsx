import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
  legendStyle,
  PIE_COLORS
} from './chartUi';
import { comparisonRows, summarize } from './comparisonData';
import TongHopTreeTable from './TongHopTreeTable';

function sumField(rows: BaoCaoTongHopListRow[], field: keyof BaoCaoTongHopListRow) {
  if (rows.length === 0) return null;
  if (!rows.every(r => r[field] != null)) return null;
  return rows.reduce((total, r) => total + Number(r[field]), 0);
}

function DetailTable({ rows }: { rows: BaoCaoTongHopListRow[] }) {
  return (
    <ChartCard
      title="Chi tiết theo ngày · ca · máy"
      subtitle="Gộp như bảng tổng · công nhân = trưởng ca"
      accent="cyan"
    >
      <TongHopTreeTable
        rows={rows}
        variant="san-luong"
        showGrandTotal
        emptyMessage="Chưa có số liệu sản lượng phù hợp bộ lọc."
      />
    </ChartCard>
  );
}

export default function SanLuongPanel({
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
  const total = summarize(selected, () => 'Tổng')[0];
  const slSanLuong = sumField(selected, 'sl_san_luong');
  const slYeuCau = sumField(selected, 'sl_yeu_cau');
  const pieData = byMachine.filter(p => (p.tp ?? 0) > 0);

  if (isLoading) {
    return <p role="status" className="p-6 text-slate-600">Đang tải dữ liệu sản lượng…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">Sản xuất</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Sản lượng</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            SL sản phẩm và trọng lượng nhựa thành phẩm theo ngày · ca · máy (trưởng ca).
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="SL thực tế" value={fmtKg(slSanLuong)} />
            <KpiCard label="SL yêu cầu" value={fmtKg(slYeuCau)} accent="slate" />
            <KpiCard label="Thành phẩm (kg nhựa)" value={fmtKg(total.tp)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Thành phẩm theo máy" subtitle="Kg nhựa thành phẩm">
              <ChartFrame points={byMachine.length}>
                <BarChart data={byMachine} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
                  <BarGradientDefs id="sanLuongBar" from={CHART.cyanSoft} to={CHART.cyan} />
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
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Bar
                    dataKey="tp"
                    name="Thành phẩm (kg)"
                    fill="url(#sanLuongBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard title="Tỷ trọng thành phẩm theo máy" subtitle="Cơ cấu kg nhựa">
              <ChartFrame points={8} height={300}>
                <PieChart accessibilityLayer>
                  <Pie
                    data={pieData}
                    dataKey="tp"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={2}
                    cornerRadius={4}
                    isAnimationActive={false}
                  >
                    {pieData.map((p, i) => (
                      <Cell key={p.label} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltipBox
                        active={active}
                        label={String(payload?.[0]?.name || '')}
                        payload={
                          payload?.map(item => ({
                            name: 'Thành phẩm',
                            value: Number(item.value) || 0,
                            color: String((item.payload as { fill?: string } | undefined)?.fill || CHART.cyan)
                          })) as never
                        }
                      />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                </PieChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard title="Xu hướng thành phẩm theo ngày" subtitle="Tổng kg nhựa theo ngày">
              <ChartFrame points={byDay.length}>
                <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
                  <BarGradientDefs id="sanLuongDayBar" from="#67e8f9" to={CHART.teal} />
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
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Bar
                    dataKey="tp"
                    name="Thành phẩm (kg)"
                    fill="url(#sanLuongDayBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartFrame>
            </ChartCard>

            <ChartCard title="Thành phẩm theo trưởng ca" subtitle="Kg nhựa theo trưởng ca lệnh SX">
              <ChartFrame points={byStaff.length}>
                <BarChart data={byStaff} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
                  <BarGradientDefs id="sanLuongStaffBar" from="#5eead4" to={CHART.teal} />
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
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickFormatter={fmtAxis}
                    unit=" kg"
                  />
                  <Tooltip
                    cursor={{ fill: CHART.wash }}
                    content={({ active, label, payload }) => (
                      <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
                    )}
                  />
                  <Bar
                    dataKey="tp"
                    name="Thành phẩm (kg)"
                    fill="url(#sanLuongStaffBar)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ChartFrame>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
