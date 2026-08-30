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
import {
  isBbSanLuongNvlKgLine,
  orderBbSanLuongNvlLinesByKg,
  resolveBbSanLuongNvlDisplayUnit,
  type BbSanLuongGroup,
  type BbSanLuongNvlLine
} from '../utils/controlBoardBbMachineReport';

function formatKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatNumber(value, digits);
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
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
    return formatNumber(line.quantity, 0);
  }
  return '—';
}

function resolveNvlWeight(line: BbSanLuongNvlLine) {
  if (line.actualWeightKg > 0) return `${formatKg(line.actualWeightKg, 1)} kg`;
  if (line.normWeightKg > 0) return `${formatKg(line.normWeightKg, 1)} kg`;
  return '—';
}

function SanLuongShiftSection({
  group,
  shiftSettings
}: {
  group: BbSanLuongGroup;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
}) {
  const shiftName = resolveShiftName(group.shift, group.shiftLabel);
  const timeRange = resolveShiftTimeRange(group.shift, group.shiftLabel, shiftSettings);
  const normStatus = resolveNormStatus(group);
  const productGroups = group.productGroups || [];
  const totalWeight =
    productGroups.reduce((sum, pg) => sum + (pg.weightKg > 0 ? pg.weightKg : pg.totalActualWeightKg), 0) ||
    group.totalActualWeightKg;
  const captionParts = [
    group.ngay || '—',
    shiftName,
    timeRange || null,
    group.orderCode ? `Lệnh ${group.orderCode}` : null,
    group.machine || null,
    `${formatNumber(group.totalQuantity, 0)} cuộn · ${formatKg(totalWeight, 0)} kg`,
    normStatus ? normStatus.label : null
  ].filter(Boolean);

  const productRows = productGroups.map(product => {
    const weightKg = product.weightKg > 0 ? product.weightKg : product.totalActualWeightKg;
    const unitLabel = formatUnitLabel(product.unit);
    const lines = (
      product.lines.length > 0
        ? orderBbSanLuongNvlLinesByKg([...product.lines])
        : [
            {
              key: `${product.key}|empty`,
              itemCode: '—',
              itemName: '—',
              amountType: 'quantity' as const,
              tiLeDinhMucPercent: null,
              quantity: null,
              unit: '',
              actualWeightKg: 0,
              normWeightKg: 0
            }
          ]
    ) as BbSanLuongNvlLine[];
    return {
      key: product.key,
      productCode: product.productCode,
      productName: product.productName,
      productQty: `${formatNumber(product.quantity, 0)} ${unitLabel}`,
      productWeight: formatKg(weightKg, 1),
      rowSpan: lines.length,
      lines
    };
  });

  return (
    <section>
      {productGroups.length === 0 ? (
        <table className="bb-sheet-table">
          <caption>{captionParts.join(' · ')}</caption>
          <tbody>
            <tr>
              <td colSpan={9} className="py-6 text-center text-slate-400">
                Chưa có NVL snapshot trên phiếu. Vào danh sách phiếu → Xem → Đồng bộ, rồi bấm «Tính toán» lại.
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="bb-sheet-table bb-san-luong-sheet min-w-[960px]">
          <caption className="font-bold text-zinc-900">{captionParts.join(' · ')}</caption>
          <thead>
            <tr className="text-zinc-900">
              <th className="font-black">Mã SP</th>
              <th className="font-black">Tên SP</th>
              <th className="text-right font-black">SL SP</th>
              <th className="text-right font-black">TL SP (kg)</th>
              <th className="font-black">Mã NVL</th>
              <th className="font-black">Tên NVL</th>
              <th className="font-black">ĐVT</th>
              <th className="text-right font-black">SL NVL</th>
              <th className="text-right font-black">TL NVL</th>
            </tr>
          </thead>
          <tbody>
            {productRows.flatMap(product => {
              const kgLineCount = product.lines.filter(line => isBbSanLuongNvlKgLine(line)).length;
              return product.lines.map((line, lineIndex) => {
                const isKgLine = isBbSanLuongNvlKgLine(line);
                const isFirstOtherLine = !isKgLine && lineIndex === kgLineCount && kgLineCount > 0;
                return (
                <tr
                  key={line.key}
                  className={`text-zinc-900 ${isKgLine ? 'bb-san-luong-nvl-kg' : ''} ${isFirstOtherLine ? 'bb-san-luong-nvl-other-start' : ''}`}
                >
                  {lineIndex === 0 ? (
                    <>
                      <td rowSpan={product.rowSpan} className="align-middle font-mono font-bold text-zinc-900">
                        {product.productCode || '—'}
                      </td>
                      <td
                        rowSpan={product.rowSpan}
                        className="max-w-[180px] truncate align-middle font-semibold text-zinc-900"
                        title={product.productName || undefined}
                      >
                        {product.productName || '—'}
                      </td>
                      <td rowSpan={product.rowSpan} className="bb-sheet-num align-middle font-bold text-zinc-900">
                        {product.productQty}
                      </td>
                      <td rowSpan={product.rowSpan} className="bb-sheet-num align-middle font-bold text-emerald-800">
                        {product.productWeight}
                      </td>
                    </>
                  ) : null}
                  <td className="font-mono font-bold text-zinc-900">{line.itemCode || '—'}</td>
                  <td
                    className="max-w-[160px] truncate font-semibold text-zinc-900"
                    title={line.itemName && line.itemName !== '—' ? line.itemName : undefined}
                  >
                    {line.itemName || '—'}
                  </td>
                  <td className="text-center font-bold text-zinc-800">
                    {line.itemName === '—' ? '—' : resolveBbSanLuongNvlDisplayUnit(line)}
                  </td>
                  <td className="bb-sheet-num font-bold text-zinc-900">{resolveNvlQuantity(line)}</td>
                  <td className="bb-sheet-num font-bold text-emerald-800">{resolveNvlWeight(line)}</td>
                </tr>
                );
              });
            })}
          </tbody>
        </table>
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
        Chưa có phiếu Báo cáo sản lượng (Thành phẩm · Kho thành phẩm) gắn ca/ngày lệnh.
      </div>
    );
  }

  const totalNorm = groups.reduce((sum, g) => sum + (g.totalNormWeightKg || 0), 0);
  const totalActual = groups.reduce((sum, g) => sum + (g.totalActualWeightKg || 0), 0);

  return (
    <div className="bb-report-sheet-scroll px-2 py-3">
      <div className="space-y-6">
        {groups.map(group => (
          <SanLuongShiftSection key={group.groupKey} group={group} shiftSettings={shiftSettings} />
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-6 border-t border-zinc-200 pt-3 text-xs font-bold text-zinc-800">
        <span>Tổng định mức NVL: {formatKg(totalNorm, 1)} kg</span>
        <span>Tổng thực tế: {formatKg(totalActual, 1)} kg</span>
      </div>
    </div>
  );
}
