import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
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
  legendStyle,
  PIE_COLORS
} from './chartUi';
import {
  comparisonRows,
  LOI_HONG_RATE_THRESHOLD_PERCENT,
  percentAxisDomain,
  summarize
} from './comparisonData';

const fmt = fmtKg;
const groupLabel = (row: BaoCaoTongHopListRow) =>
  /cách nhiệt|\bCN\b/i.test(row.may)
    ? 'Cách nhiệt'
    : /bao bì|\bBB\b/i.test(row.may)
      ? 'Bao bì'
      : /niêm phong|\bNP\b/i.test(row.may)
        ? 'Niêm phong'
        : 'Máy khác / chưa phân nhóm';
const staffLabel = (row: BaoCaoTongHopListRow) =>
  String(row.cong_nhan_phu_trach || '').trim() || 'Chưa gán';

type Point = ReturnType<typeof summarize>[number];

/** Biểu đồ sản lượng: thành phẩm (kg). */
function SanLuongChart({ data }: { data: Point[] }) {
  return (
    <ChartFrame points={data.length}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
        <BarGradientDefs id="cmpSanLuongBar" from={CHART.cyanSoft} to={CHART.cyan} />
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
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={56} tickFormatter={fmtAxis} unit=" kg" />
        <Tooltip
          cursor={{ fill: CHART.wash }}
          content={({ active, label, payload }) => (
            <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
          )}
        />
        <Bar
          dataKey="tp"
          name="Thành phẩm (kg nhựa)"
          fill="url(#cmpSanLuongBar)"
          radius={[6, 6, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Biểu đồ lỗi hỏng: khối lượng lỗi + tỷ lệ lỗi / TP. */
function LoiHongChart({ data }: { data: Point[] }) {
  return (
    <ChartFrame points={data.length}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
        <BarGradientDefs id="cmpLoiHongBar" from={CHART.roseSoft} to={CHART.rose} />
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
          fill="url(#cmpLoiHongBar)"
          radius={[6, 6, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
        />
        <Line
          yAxisId="percent"
          dataKey="rate"
          name="Lỗi / thành phẩm (%)"
          stroke={CHART.ink}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: CHART.ink, strokeWidth: 0 }}
          isAnimationActive={false}
        />
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
      </ComposedChart>
    </ChartFrame>
  );
}

function HaoHutChart({ data }: { data: Point[] }) {
  return (
    <ChartFrame points={data.length}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 28, left: 0 }} accessibilityLayer>
        <BarGradientDefs id="cmpHaoHutBar" from="#67e8f9" to={CHART.cyan} />
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
        <YAxis yAxisId="percent" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={44} unit="%" />
        <Tooltip
          cursor={{ fill: CHART.wash }}
          content={({ active, label, payload }) => (
            <ChartTooltipBox active={active} label={String(label || '')} payload={payload as never} />
          )}
        />
        <Legend wrapperStyle={legendStyle} iconType="circle" />
        <Bar
          yAxisId="kg"
          dataKey="chenh"
          name="Chênh lệch (kg)"
          fill="url(#cmpHaoHutBar)"
          radius={[6, 6, 0, 0]}
          maxBarSize={44}
          isAnimationActive={false}
        />
        <Line
          yAxisId="percent"
          dataKey="loss"
          name="Hao hụt / định mức (%)"
          stroke={CHART.rose}
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: CHART.rose, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <ReferenceLine yAxisId="kg" y={0} stroke={CHART.muted} />
      </ComposedChart>
    </ChartFrame>
  );
}

function Pair({
  leftTitle,
  rightTitle,
  leftAccent = 'cyan',
  rightAccent = 'rose',
  left,
  right
}: {
  leftTitle: string;
  rightTitle: string;
  leftAccent?: 'cyan' | 'rose' | 'slate';
  rightAccent?: 'cyan' | 'rose' | 'slate';
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title={leftTitle} accent={leftAccent}>
        {left}
      </ChartCard>
      <ChartCard title={rightTitle} accent={rightAccent}>
        {right}
      </ChartCard>
    </div>
  );
}

export default function ProductionComparison({
  rows,
  isLoading
}: {
  rows: BaoCaoTongHopListRow[];
  isLoading: boolean;
}) {
  const [machine, setMachine] = useState('all');
  const clean = useMemo(() => comparisonRows(rows), [rows]);
  const names = [...new Set(clean.map(r => r.may))].sort();
  const selected = clean.filter(r => machine === 'all' || r.may === machine);
  const byMachine = summarize(selected, r => r.may);
  const byGroup = summarize(selected, groupLabel);
  const byDay = summarize(selected, r => r.ngay_tu);
  const byStaff = summarize(selected, staffLabel);
  const total = summarize(selected, () => 'Tổng')[0];

  if (isLoading) {
    return <p role="status" className="p-6 text-slate-600">Đang tải biểu đồ so sánh…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Phân tích sản xuất</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">Sản lượng & lỗi hỏng</h2>
          <p className="mt-2 text-sm text-slate-600">
            Biểu đồ sản lượng và lỗi hỏng tách riêng, đặt cạnh nhau theo máy · ngày · trưởng ca.
          </p>
        </div>
        <label className="text-sm font-semibold text-slate-700">
          Máy so sánh
          <select
            className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-3 focus:ring-2 focus:ring-cyan-600"
            value={machine}
            onChange={e => setMachine(e.target.value)}
          >
            <option value="all">Tất cả máy</option>
            {names.map(n => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        Tỷ lệ lỗi = lỗi hỏng / thành phẩm; hao hụt = −chênh lệch nhựa / định mức. Đường đỏ đứt nét = ngưỡng lỗi cho
        phép {LOI_HONG_RATE_THRESHOLD_PERCENT}%. Chỉ dùng bản ghi từng ngày · ca · máy.
      </p>

      {!total ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">
          Chưa có dữ liệu chi tiết ngày · ca · máy phù hợp. Hãy tính toán và lưu báo cáo theo từng ca, từng máy.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard label="Thành phẩm (kg nhựa)" value={fmt(total.tp)} />
            <KpiCard label="Lỗi hỏng (kg)" value={fmt(total.loi)} accent="rose" />
            <KpiCard
              label="Tỷ lệ lỗi / TP"
              value={`${fmt(total.rate)}${total.rate == null ? '' : '%'}`}
              accent="rose"
            />
          </div>

          <Pair
            leftTitle="Sản lượng theo máy"
            rightTitle="Lỗi hỏng theo máy"
            left={<SanLuongChart data={byMachine} />}
            right={<LoiHongChart data={byMachine} />}
          />

          <Pair
            leftTitle="Sản lượng theo nhóm máy"
            rightTitle="Lỗi hỏng theo nhóm máy"
            left={<SanLuongChart data={byGroup} />}
            right={<LoiHongChart data={byGroup} />}
          />

          <Pair
            leftTitle="Tỷ trọng thành phẩm theo máy"
            rightTitle="Tỷ trọng lỗi hỏng theo máy"
            left={
              <ChartFrame points={8} height={300}>
                <PieChart accessibilityLayer>
                  <Pie
                    data={byMachine.filter(p => (p.tp ?? 0) > 0)}
                    dataKey="tp"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={2}
                    cornerRadius={4}
                    isAnimationActive={false}
                  >
                    {byMachine.map((p, i) => (
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
                            color: CHART.cyan
                          })) as never
                        }
                      />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                </PieChart>
              </ChartFrame>
            }
            right={
              <ChartFrame points={8} height={300}>
                <PieChart accessibilityLayer>
                  <Pie
                    data={byMachine.filter(p => (p.loi ?? 0) > 0)}
                    dataKey="loi"
                    nameKey="label"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={2}
                    cornerRadius={4}
                    isAnimationActive={false}
                  >
                    {byMachine.map((p, i) => (
                      <Cell
                        key={p.label}
                        fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (
                      <ChartTooltipBox
                        active={active}
                        label={String(payload?.[0]?.name || '')}
                        payload={
                          payload?.map(item => ({
                            name: 'Lỗi hỏng',
                            value: Number(item.value) || 0,
                            color: CHART.rose
                          })) as never
                        }
                      />
                    )}
                  />
                  <Legend wrapperStyle={legendStyle} iconType="circle" />
                </PieChart>
              </ChartFrame>
            }
          />

          <Pair
            leftTitle="Sản lượng theo ngày"
            rightTitle="Lỗi hỏng theo ngày"
            left={<SanLuongChart data={byDay} />}
            right={<LoiHongChart data={byDay} />}
          />

          <Pair
            leftTitle="Sản lượng theo trưởng ca"
            rightTitle="Lỗi hỏng theo trưởng ca"
            left={<SanLuongChart data={byStaff} />}
            right={<LoiHongChart data={byStaff} />}
          />

          {byMachine.map(m => {
            const records = selected.filter(r => r.may === m.label);
            const byMayDay = summarize(records, r => r.ngay_tu);
            const byMayCa = summarize(records, r => `${r.ngay_tu} ${r.ca}`);
            return (
              <div key={m.label} className="space-y-4">
                <ChartCard
                  title={`${m.label} · phân tích chi tiết`}
                  subtitle={`TP ${fmt(m.tp)} kg · Lỗi ${fmt(m.loi)} kg · Lỗi/TP ${fmt(m.rate)}%`}
                  accent="slate"
                >
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-slate-700">Sản lượng theo ngày</h4>
                      <SanLuongChart data={byMayDay} />
                    </div>
                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-slate-700">Lỗi hỏng theo ngày</h4>
                      <LoiHongChart data={byMayDay} />
                    </div>
                    <div className="xl:col-span-2">
                      <h4 className="mb-3 text-sm font-semibold text-slate-700">Hao hụt theo ngày · ca</h4>
                      <HaoHutChart data={byMayCa} />
                    </div>
                  </div>
                  <details className="mt-4 rounded-lg bg-slate-50 p-3">
                    <summary className="cursor-pointer font-semibold">
                      Xem số liệu theo ca: sản lượng, lỗi và hao hụt
                    </summary>
                    <div className="mt-3 overflow-auto">
                      <table className="w-full whitespace-nowrap text-sm">
                        <thead>
                          <tr>
                            {['Ngày · Ca', 'TP (kg)', 'Lỗi (kg)', 'Lỗi / TP (%)', 'Chênh lệch (kg)', 'Hao hụt / ĐM (%)'].map(
                              h => (
                                <th key={h} className="p-3 text-right">
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {byMayCa.map(p => (
                            <tr key={p.label} className="border-t border-slate-200">
                              {[p.label, fmt(p.tp), fmt(p.loi), fmt(p.rate), fmt(p.chenh), fmt(p.loss)].map(
                                (v, i) => (
                                  <td key={i} className="p-3 text-right tabular-nums">
                                    {v}
                                  </td>
                                )
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </ChartCard>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
