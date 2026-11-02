import React from 'react';
import { ResponsiveContainer } from 'recharts';

export const CHART = {
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  grid: '#e2e8f0',
  border: '#e2e8f0',
  surface: '#ffffff',
  wash: 'rgba(15, 23, 42, 0.04)',
  cyan: '#0e7490',
  cyanSoft: '#22d3ee',
  teal: '#0f766e',
  rose: '#e11d48',
  roseSoft: '#fb7185',
  amber: '#d97706',
  slate: '#334155'
} as const;

export const PIE_COLORS = ['#0e7490', '#0891b2', '#0369a1', '#0f766e', '#155e75', '#1d4ed8', '#be123c', '#b45309'];

export const fmtKg = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export const fmtAxis = (n: number) =>
  new Intl.NumberFormat('vi-VN', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(n);

export const axisTick = { fill: CHART.ink, fontSize: 13, fontWeight: 700 as const };
export const legendStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: CHART.ink,
  paddingTop: 12
};

export function ChartCard({
  title,
  subtitle,
  accent = 'cyan',
  children
}: {
  title: string;
  subtitle?: string;
  accent?: 'cyan' | 'rose' | 'slate';
  children: React.ReactNode;
}) {
  const accentClass =
    accent === 'rose' ? 'from-rose-500/90 to-rose-400/40' : accent === 'slate' ? 'from-slate-500/80 to-slate-300/40' : 'from-cyan-600/90 to-cyan-400/40';
  return (
    <section className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accentClass}`} />
      <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-4 py-3.5 sm:px-5">
        <h3 className="text-base font-bold tracking-tight text-slate-950 sm:text-[17px]">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm font-semibold text-slate-600">{subtitle}</p> : null}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  accent = 'cyan'
}: {
  label: string;
  value: string;
  accent?: 'cyan' | 'rose' | 'slate';
}) {
  const bar =
    accent === 'rose' ? 'bg-rose-500' : accent === 'slate' ? 'bg-slate-500' : 'bg-cyan-600';
  const valueColor =
    accent === 'rose' ? 'text-rose-950' : accent === 'slate' ? 'text-slate-950' : 'text-cyan-950';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${bar}`} />
      <p className="pl-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-600">{label}</p>
      <p className={`mt-2 pl-2 text-3xl font-bold tabular-nums tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}

export function ChartFrame({
  points,
  height = 300,
  children
}: {
  points: number;
  height?: number;
  children: React.ReactElement;
}) {
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: Math.max(280, points * 56), height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChartTooltipBox({
  active,
  label,
  payload,
  formatValue = fmtKg
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur-sm">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-600">{label}</p>
      <div className="mt-1.5 space-y-1">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-sm font-semibold">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: entry.color || CHART.cyan }}
            />
            <span className="text-slate-700">{entry.name}</span>
            <span className="ml-auto font-bold tabular-nums text-slate-950">
              {formatValue(Number(entry.value) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarGradientDefs({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={from} stopOpacity={1} />
        <stop offset="100%" stopColor={to} stopOpacity={0.85} />
      </linearGradient>
    </defs>
  );
}
