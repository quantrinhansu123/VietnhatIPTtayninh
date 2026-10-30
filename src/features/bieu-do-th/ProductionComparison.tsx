import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BaoCaoTongHopListRow } from './index';
import { comparisonRows, summarize } from './comparisonData';

const colors = ['#155e75', '#0891b2', '#4f46e5', '#059669', '#d97706', '#be123c'];
const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const groupLabel = (row: BaoCaoTongHopListRow) => /cách nhiệt|\bCN\b/i.test(row.may) ? 'Cách nhiệt' : /bao bì|\bBB\b/i.test(row.may) ? 'Bao bì' : /niêm phong|\bNP\b/i.test(row.may) ? 'Niêm phong' : 'Máy khác / chưa phân nhóm';
type Point = ReturnType<typeof summarize>[number];
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h3 className="mb-4 text-base font-bold text-slate-900">{title}</h3>{children}</section>;
}
function Combo({ data, loss = false }: { data: Point[]; loss?: boolean }) {
  return <div className="overflow-x-auto"><div style={{ minWidth: Math.max(320, data.length * 48), height: 300 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 30, left: 8 }} accessibilityLayer>
    <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 3" />
    <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={55} />
    <YAxis yAxisId="kg" tick={{ fontSize: 11 }} width={65} unit=" kg" />
    <YAxis yAxisId="percent" orientation="right" tick={{ fontSize: 11 }} unit="%" />
    <Tooltip formatter={(value, name) => [fmt(Number(value)), name]} /><Legend wrapperStyle={{ fontSize: 12 }} />
    <Bar yAxisId="kg" dataKey={loss ? 'chenh' : 'tp'} name={loss ? 'Chênh lệch (kg)' : 'Thành phẩm (kg nhựa)'} fill={colors[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
    {!loss && <Bar yAxisId="kg" dataKey="loi" name="Lỗi hỏng (kg)" fill="#fbbf24" radius={[3, 3, 0, 0]} isAnimationActive={false} />}
    <Line yAxisId="percent" dataKey={loss ? 'loss' : 'rate'} name={loss ? 'Hao hụt / định mức (%)' : 'Lỗi / thành phẩm (%)'} stroke="#be123c" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
    <ReferenceLine yAxisId="kg" y={0} stroke="#64748b" />
  </ComposedChart></ResponsiveContainer></div></div>;
}

export default function ProductionComparison({ rows, isLoading }: { rows: BaoCaoTongHopListRow[]; isLoading: boolean }) {
  const [machine, setMachine] = useState('all');
  const clean = useMemo(() => comparisonRows(rows), [rows]);
  const names = [...new Set(clean.map(r => r.may))].sort();
  const selected = clean.filter(r => machine === 'all' || r.may === machine);
  const byMachine = summarize(selected, r => r.may);
  const total = summarize(selected, () => 'Tổng')[0];
  const days = [...new Set(selected.map(r => r.ngay_tu))].sort();
  const cells = new Map(summarize(selected, r => `${r.ngay_tu}|${r.may}`).map(p => [p.label, p]));
  if (isLoading) return <p role="status" className="p-6 text-slate-600">Đang tải biểu đồ so sánh…</p>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Phân tích sản xuất</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Sản lượng & chất lượng</h2><p className="mt-2 text-sm text-slate-600">So sánh theo máy, ngày, ca và tháng trong khoảng thời gian đã chọn.</p></div>
      <label className="text-sm font-semibold text-slate-700">Máy so sánh<select className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-3 focus:ring-2 focus:ring-cyan-600" value={machine} onChange={e => setMachine(e.target.value)}><option value="all">Tất cả máy</option>{names.map(n => <option key={n}>{n}</option>)}</select></label></div>
    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Tỷ lệ lỗi = lỗi hỏng / thành phẩm; hao hụt = −chênh lệch nhựa / định mức. Tính từ tổng khối lượng, không lấy trung bình tỷ lệ. Chỉ dùng bản ghi từng ngày · ca · máy; bản ghi tổng và khoảng ngày được loại để tránh cộng trùng. Thiếu dữ liệu hiển thị —.</p>
    {!total ? <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">Chưa có dữ liệu chi tiết ngày · ca · máy phù hợp. Hãy tính toán và lưu báo cáo theo từng ca, từng máy.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Thành phẩm (kg nhựa)', fmt(total.tp)], ['Tỷ lệ lỗi / TP', `${fmt(total.rate)}${total.rate == null ? '' : '%'}`], ['Ngày có sản lượng', String(total.days)], ['Lỗi hỏng (kg)', fmt(total.loi)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums text-cyan-950">{value}</p></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-2"><Card title="Sản lượng và tỷ lệ lỗi theo máy"><Combo data={byMachine} /></Card><Card title="Tỷ trọng thành phẩm theo máy"><div className="h-[300px]"><ResponsiveContainer><PieChart accessibilityLayer><Pie data={byMachine.filter(p => (p.tp ?? 0) > 0)} dataKey="tp" nameKey="label" innerRadius={65} outerRadius={100} paddingAngle={3} isAnimationActive={false}>{byMachine.map((p, i) => <Cell key={p.label} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={value => `${fmt(Number(value))} kg`} /><Legend /></PieChart></ResponsiveContainer></div></Card>
      <Card title="Số ngày có sản lượng theo máy"><div className="h-[300px]"><ResponsiveContainer><BarChart data={byMachine} layout="vertical" accessibilityLayer><CartesianGrid horizontal={false} stroke="#e2e8f0" /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="days" name="Ngày có sản lượng" fill="#059669" isAnimationActive={false} /></BarChart></ResponsiveContainer></div></Card><Card title="So sánh theo tháng · thành phẩm, lỗi và tỷ lệ"><Combo data={summarize(selected, r => r.ngay_tu.slice(0, 7))} /></Card></div>
      <Card title="Bảng màu theo ngày và máy"><p className="mb-3 text-sm text-slate-600">Mỗi ô: thành phẩm (kg) / tỷ lệ lỗi (%). Màu đỏ đậm dần từ 0% đến 20% lỗi; số liệu hiển thị trực tiếp để đối chiếu.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left">Ngày</th>{byMachine.map(p => <th className="min-w-[140px] p-3" key={p.label}>{p.label}</th>)}</tr></thead><tbody>{days.map(day => <tr key={day}><th className="whitespace-nowrap p-3 text-left font-medium">{day}</th>{byMachine.map(m => { const p = cells.get(`${day}|${m.label}`); return <td key={m.label} className="border border-white p-3 text-center tabular-nums text-slate-900" style={{ background: p?.rate != null ? `rgba(244,63,94,${0.05 + Math.min(Math.max(p.rate, 0) / 20, 1) * 0.35})` : '#f8fafc' }}>{p ? `${fmt(p.tp)} / ${fmt(p.rate)}${p.rate == null ? '' : '%'}` : '—'}</td>; })}</tr>)}</tbody></table></div></Card>
      <div className="grid gap-5 xl:grid-cols-2"><Card title="Sản lượng và tỷ lệ lỗi theo nhóm máy"><p className="mb-3 text-sm text-slate-600">Phân nhóm theo tên máy: Bao bì, Cách nhiệt, Niêm phong.</p><Combo data={summarize(selected, groupLabel)} /></Card><Card title="Xu hướng toàn bộ máy theo ngày"><Combo data={summarize(selected, r => r.ngay_tu)} /></Card></div>
      {byMachine.map(m => { const records = selected.filter(r => r.may === m.label); return <div key={m.label}><Card title={`${m.label} · phân tích chi tiết`}><div className="mb-4 flex flex-wrap gap-5 text-sm text-slate-600"><span>Thành phẩm: <b>{fmt(m.tp)} kg</b></span><span>Lỗi / TP: <b>{fmt(m.rate)}%</b></span><span>Ngày có sản lượng: <b>{m.days}</b></span></div><div className="grid gap-5 xl:grid-cols-2"><div><h4 className="mb-3 font-semibold">Sản lượng và lỗi theo ngày</h4><Combo data={summarize(records, r => r.ngay_tu)} /></div><div><h4 className="mb-3 font-semibold">Hao hụt theo ngày · ca</h4><Combo loss data={summarize(records, r => `${r.ngay_tu} ${r.ca}`)} /></div><div className="xl:col-span-2"><h4 className="mb-3 font-semibold">Thành phẩm, phế và tỷ lệ lỗi theo tháng</h4><Combo data={summarize(records, r => r.ngay_tu.slice(0, 7))} /></div></div><details className="mt-4 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-semibold">Xem số liệu theo ca: sản lượng, lỗi và hao hụt</summary><div className="mt-3 overflow-auto"><table className="w-full whitespace-nowrap text-sm"><thead><tr>{['Ngày · Ca', 'TP (kg)', 'Lỗi (kg)', 'Lỗi / TP (%)', 'Chênh lệch (kg)', 'Hao hụt / ĐM (%)'].map(h => <th key={h} className="p-3 text-right">{h}</th>)}</tr></thead><tbody>{summarize(records, r => `${r.ngay_tu} ${r.ca}`).map(p => <tr key={p.label} className="border-t border-slate-200">{[p.label, fmt(p.tp), fmt(p.loi), fmt(p.rate), fmt(p.chenh), fmt(p.loss)].map((v, i) => <td key={i} className="p-3 text-right tabular-nums">{v}</td>)}</tr>)}</tbody></table></div></details></Card></div>; })}
    </>}
  </div>;
}
