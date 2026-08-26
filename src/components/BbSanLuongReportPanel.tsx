import React from 'react';
import { Loader2 } from 'lucide-react';
import { formatNumber } from '../utils';
import type { ProductionOrderLookupSetting } from '../features/ke-hoach-san-xuat';
import {
  getShiftTimeRange,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
import type {
  BbSanLuongGroup,
  BbSanLuongNvlLine,
  BbSanLuongProductGroup
} from '../utils/controlBoardBbMachineReport';

function formatKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatNumber(value, digits);
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
}

function formatNgayCompact(ngay: string) {
  const raw = String(ngay || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: iso[3], month: iso[2] };
  const vi = raw.match(/^(\d{1,2})\/(\d{1,2})/);
  if (vi) return { day: vi[1].padStart(2, '0'), month: vi[2].padStart(2, '0') };
  return { day: '—', month: '—' };
}

function resolveShiftTimeRange(
  shift: string,
  shiftLabel: string,
  settings: Array<ShiftSetting | ProductionOrderLookupSetting>
) {
  const label = String(shiftLabel || shift || '').trim();
  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) return parenMatch[1].replace(/–/g, ' - ').trim();

  const normalizedSettings = normalizeShiftSettings(settings);
  const matched = normalizedSettings.find(
    setting =>
      shiftNamesMatch(shift, setting.name) ||
      shiftNamesMatch(shift, setting.code) ||
      (label && (shiftNamesMatch(label, setting.name) || shiftNamesMatch(label, setting.code)))
  );
  if (matched) return getShiftTimeRange(matched);
  return '';
}

function resolveShiftName(shift: string, shiftLabel: string) {
  const label = String(shiftLabel || shift || '').trim();
  if (!label || label === '-') return shift || '—';
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || shift || '—';
}

function resolveNormStatus(group: BbSanLuongGroup) {
  const norm = group.totalNormWeightKg;
  const actual = group.totalActualWeightKg;
  if (!(norm > 0) || !(actual >= 0)) return null;
  const diffPct = Math.abs(actual - norm) / norm;
  if (diffPct <= 0.02) return { label: 'đúng định mức', tone: 'text-emerald-600' };
  if (actual > norm) return { label: 'vượt định mức', tone: 'text-amber-600' };
  return { label: 'dưới định mức', tone: 'text-rose-600' };
}

function formatUnitLabel(unit: string) {
  const trimmed = String(unit || '').trim();
  if (!trimmed) return 'cuộn';
  return trimmed.toLowerCase();
}

function resolveNvlQuantity(line: BbSanLuongNvlLine) {
  if (line.amountType === 'percent' && line.tiLeDinhMucPercent != null) {
    return formatPercent(line.tiLeDinhMucPercent, 0);
  }
  if (line.quantity != null && line.quantity > 0) {
    const unit = String(line.unit || '').trim();
    return unit ? `${formatNumber(line.quantity, 0)} ${unit}` : formatNumber(line.quantity, 0);
  }
  return '—';
}

function resolveNvlWeight(line: BbSanLuongNvlLine) {
  if (line.actualWeightKg > 0) return `${formatKg(line.actualWeightKg, 1)} kg`;
  if (line.normWeightKg > 0) return `${formatKg(line.normWeightKg, 1)} kg`;
  return '—';
}

function SanLuongProductColumn({ product }: { product: BbSanLuongProductGroup }) {
  const unitLabel = formatUnitLabel(product.unit);
  const weightKg = product.weightKg > 0 ? product.weightKg : product.totalActualWeightKg;
  const kgPerUnit =
    product.quantity > 0 && weightKg > 0 ? weightKg / product.quantity : null;

  return (
    <div className="min-w-[280px] flex-1 border-l border-zinc-200 pl-4 first:border-l-0 first:pl-0">
      <div className="flex items-start justify-between gap-3">
        <span className="truncate font-semibold text-zinc-900">{product.productCode || product.productName}</span>
        <span className="shrink-0 font-semibold tabular-nums text-zinc-900">{formatKg(weightKg, 0)} kg</span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {formatNumber(product.quantity, 0)} {unitLabel}
        {kgPerUnit != null ? (
          <>
            {' · '}
            {formatKg(kgPerUnit, 2)} kg/{unitLabel}
          </>
        ) : null}
        {' · '}
        {formatPercent(product.productSharePercent, 1)} sản lượng ca
      </p>
      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-sky-500/70"
          style={{ width: `${Math.min(100, Math.max(0, product.productSharePercent))}%` }}
        />
      </div>

      {product.lines.length === 0 ? (
        <p className="mt-3 py-2 text-xs text-zinc-400">Chưa có NVL snapshot.</p>
      ) : (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-400">
              <th className="pb-1.5 pr-2 font-normal">Mã NVL</th>
              <th className="pb-1.5 pr-2 font-normal">Tên NVL</th>
              <th className="pb-1.5 pr-2 text-right font-normal">Số lượng</th>
              <th className="pb-1.5 text-right font-normal">Trọng lượng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {product.lines.map(line => (
              <tr key={line.key}>
                <td className="py-2 pr-2 font-mono text-zinc-500">{line.itemCode || '—'}</td>
                <td className="py-2 pr-2 text-zinc-700" title={line.itemName}>
                  {line.itemName || '—'}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums text-zinc-800">
                  {resolveNvlQuantity(line)}
                </td>
                <td className="py-2 text-right tabular-nums text-zinc-800">{resolveNvlWeight(line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SanLuongShiftSection({
  group,
  shiftSettings
}: {
  group: BbSanLuongGroup;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
}) {
  const { day, month } = formatNgayCompact(group.ngay);
  const shiftName = resolveShiftName(group.shift, group.shiftLabel);
  const timeRange = resolveShiftTimeRange(group.shift, group.shiftLabel, shiftSettings);
  const normStatus = resolveNormStatus(group);
  const productGroups = group.productGroups || [];
  const totalWeight =
    productGroups.reduce((sum, pg) => sum + (pg.weightKg > 0 ? pg.weightKg : pg.totalActualWeightKg), 0) ||
    group.totalActualWeightKg;

  return (
    <section className="border-b border-zinc-200 pb-6 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
            {day} · {month}
          </span>
          <span className="text-sm font-medium text-zinc-800">{shiftName}</span>
          {timeRange ? <span className="text-sm text-zinc-400">{timeRange}</span> : null}
          {group.orderCode ? (
            <span className="text-sm font-medium text-sky-700">{group.orderCode}</span>
          ) : null}
          {group.machine ? <span className="text-xs text-zinc-400">{group.machine}</span> : null}
        </div>
        <div className="text-right">
          <div className="text-sm text-zinc-500">{formatNumber(group.totalQuantity, 0)} cuộn</div>
          <div className="text-2xl font-semibold tabular-nums text-zinc-900">{formatKg(totalWeight, 0)} kg</div>
          {normStatus ? (
            <div className={`text-xs font-medium ${normStatus.tone}`}>{normStatus.label}</div>
          ) : null}
        </div>
      </div>

      {productGroups.length === 0 ? (
        <p className="py-6 text-sm text-zinc-400">
          Chưa có NVL snapshot trên phiếu. Vào danh sách phiếu → Xem → Đồng bộ, rồi bấm «Tính toán» lại.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
          {productGroups.map(product => (
            <SanLuongProductColumn key={product.key} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function BbSanLuongReportPanel({
  groups,
  isLoading,
  shiftSettings
}: {
  groups: BbSanLuongGroup[];
  isLoading?: boolean;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Đang tải báo cáo sản lượng...
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        Chưa có phiếu báo cáo sản lượng gắn ca/ngày lệnh máy BB.
      </div>
    );
  }

  const totalNorm = groups.reduce((sum, g) => sum + (g.totalNormWeightKg || 0), 0);
  const totalActual = groups.reduce((sum, g) => sum + (g.totalActualWeightKg || 0), 0);

  return (
    <div className="px-4 py-4">
      <div className="space-y-8">
        {groups.map(group => (
          <SanLuongShiftSection key={group.groupKey} group={group} shiftSettings={shiftSettings} />
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-6 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        <span>Tổng định mức NVL: {formatKg(totalNorm, 1)} kg</span>
        <span>Tổng thực tế: {formatKg(totalActual, 1)} kg</span>
      </div>
    </div>
  );
}
