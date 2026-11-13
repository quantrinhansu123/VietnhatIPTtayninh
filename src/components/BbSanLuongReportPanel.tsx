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
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';

function formatKg(value: number | null | undefined, digits = 4) {
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
  if (diffPct <= 0.02) return { label: 'đúng định mức', tone: 'text-zinc-700' };
  if (actual > norm) return { label: 'vượt định mức', tone: 'text-amber-700' };
  return { label: 'dưới định mức', tone: 'text-rose-700' };
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
  if (line.quantity != null && line.quantity >= 0) {
    const unit = resolveBbSanLuongNvlDisplayUnit(line).toLowerCase();
    const digits = unit === 'kg' || unit.startsWith('kg') ? 4 : 0;
    return formatNumber(line.quantity, digits);
  }
  return '—';
}

function resolveNvlWeight(line: BbSanLuongNvlLine) {
  if (line.actualWeightKg > 0) return `${formatKg(line.actualWeightKg)} kg`;
  if (line.normWeightKg > 0) return `${formatKg(line.normWeightKg)} kg`;
  return `${formatKg(0)} kg`;
}

function lineWeightKg(line: BbSanLuongNvlLine) {
  if (line.actualWeightKg > 0) return line.actualWeightKg;
  if (line.normWeightKg > 0) return line.normWeightKg;
  return 0;
}

/** Khóa so mã NVL — bỏ khoảng trắng/gạch để khớp «DAU BONG PA350» ↔ «DAU-BONG-PA350». */
function nvlKey(value: string | null | undefined) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function findProductRow(products: ProductRow[], code: string, name?: string) {
  const codeKey = normalizeProductCodeKey(code);
  if (codeKey) {
    const byCode = products.find(product => normalizeProductCodeKey(product.code) === codeKey);
    if (byCode) return byCode;
  }
  const nameKey = normalizeProductCodeKey(name || '');
  if (!nameKey) return null;
  return products.find(product => normalizeProductCodeKey(product.name) === nameKey) ?? null;
}

function findBomItem(
  product: ProductRow | null,
  line: Pick<BbSanLuongNvlLine, 'itemCode' | 'itemName'>
) {
  if (!product) return null;
  const codeKey = nvlKey(line.itemCode);
  const nameKey = nvlKey(line.itemName);
  return (
    (product.nplItems || []).find(item => {
      const itemCode = nvlKey(item.code);
      const itemName = nvlKey(item.name);
      return (
        (codeKey && (itemCode === codeKey || itemName === codeKey)) ||
        (nameKey && (itemCode === nameKey || itemName === nameKey))
      );
    }) ?? null
  );
}

function formatNormNumber(value: number) {
  if (Number.isInteger(value)) return formatNumber(value, 0);
  return formatNumber(value, Math.abs(value) < 1 ? 6 : 4);
}

/**
 * Định mức NVL trên 1 SP — đọc từ bảng kho thành phẩm (`san_pham.npl_phan_tram`).
 * Snapshot cũ không có `dinhMucRate` thì lấy SL NVL ÷ SL SP.
 */
function resolveLineNorm(
  line: BbSanLuongNvlLine,
  product: ProductRow | null,
  productQuantity: number
): string {
  const bomItem = findBomItem(product, line);
  if (line.amountType === 'percent') {
    const rate =
      bomItem?.percent != null && bomItem.percent > 0
        ? bomItem.percent
        : line.tiLeDinhMucPercent != null && line.tiLeDinhMucPercent > 0
          ? line.tiLeDinhMucPercent
          : null;
    return rate != null ? formatPercent(rate, 2) : '—';
  }
  const fromCatalog =
    bomItem?.quantity != null && bomItem.quantity > 0
      ? bomItem.quantity
      : bomItem?.weightKg != null && bomItem.weightKg >= 0
        ? 1
        : null;
  const fromSnapshot =
    line.dinhMucRate != null && Number.isFinite(line.dinhMucRate) && line.dinhMucRate > 0
      ? line.dinhMucRate
      : null;
  const fromQuantity =
    productQuantity > 0 && line.quantity != null && line.quantity > 0
      ? line.quantity / productQuantity
      : null;
  const rate = fromCatalog ?? fromSnapshot ?? fromQuantity;
  return rate != null && rate > 0 ? formatNormNumber(rate) : '—';
}

function SanLuongShiftSection({
  group,
  shiftSettings,
  materialSection,
  products
}: {
  group: BbSanLuongGroup;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
  materialSection: 'mixing' | 'other';
  products: ProductRow[];
}) {
  const isMixingSection = materialSection === 'mixing';
  const sectionTitle = isMixingSection ? 'Bảng NVL trộn' : 'Bảng vật tư khác';
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
    const unitLabel = formatUnitLabel(product.unit);
    const lines = orderBbSanLuongNvlLinesByKg([...product.lines]).filter(
      line => isBbSanLuongNvlKgLine(line) === isMixingSection
    );
    const tronLines = lines.filter(line => isBbSanLuongNvlKgLine(line));
    const conLaiLines = lines.filter(line => !isBbSanLuongNvlKgLine(line));
    // «Tổng vật tư trộn» = Σ TL NVL nhựa trộn (không ưu tiên weightKg đã làm tròn).
    const tongVatTuTronFromLines = tronLines.reduce((sum, line) => sum + lineWeightKg(line), 0);
    const tongVatTuTronKg =
      tongVatTuTronFromLines > 0
        ? tongVatTuTronFromLines
        : product.weightKg > 0
          ? product.weightKg
          : 0;
    const tongVatTuConLaiKg = conLaiLines.reduce((sum, line) => sum + lineWeightKg(line), 0);
    const catalogProduct = findProductRow(products, product.productCode, product.productName);
    return {
      key: product.key,
      productCode: product.productCode,
      productName: product.productName,
      quantity: product.quantity,
      catalogProduct,
      productQty: `${formatNumber(product.quantity, 0)} ${unitLabel}`,
      rowSpan: lines.length,
      tronRowSpan: tronLines.length,
      conLaiRowSpan: conLaiLines.length,
      tongVatTuTronKg,
      tongVatTuConLaiKg,
      lines
    };
  });
  const missingProducts = productRows.filter(product => product.lines.length === 0);
  const missingRolls = missingProducts.reduce((sum, product) => sum + product.quantity, 0);
  const totalProductQty = productRows.reduce((sum, product) => sum + product.quantity, 0);
  const sectionTotalKg = productRows.reduce((sum, product) =>
    sum + (product.lines.length > 0 ? isMixingSection ? product.tongVatTuTronKg : product.tongVatTuConLaiKg : 0), 0);

  return (
    <section>
      {missingProducts.length > 0 && (
        <p role="alert" className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          {missingProducts.length} sản phẩm ({formatNumber(missingRolls, 0)} cuộn) chưa có {isMixingSection ? 'NVL trộn' : 'vật tư khác'} trong bản tính.
          {' '}Kiểm tra Thành phần SP và tính lại; không tự gán mã vật tư.
        </p>
      )}
      {productRows.length === 0 ? (
        <table className="bb-sheet-table w-full">
          <caption>{sectionTitle} · {captionParts.join(' · ')}</caption>
          <tbody>
            <tr>
              <td colSpan={10} className="py-6 text-center text-slate-400">
                Chưa có {isMixingSection ? 'NVL trộn' : 'vật tư khác'} trong dữ liệu phiếu này.
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <table className="bb-sheet-table bb-san-luong-sheet w-full min-w-[960px]">
          <caption className="font-bold text-zinc-900">{sectionTitle} · {captionParts.join(' · ')}</caption>
          <thead>
            <tr className="text-zinc-900">
              <th className="font-black">Mã SP</th>
              <th className="font-black">Tên SP</th>
              <th className="text-right font-black">SL SP</th>
              <th className="text-right font-black">{isMixingSection ? 'Tổng NVL trộn (kg)' : 'Tổng vật tư khác (kg)'}</th>
              <th className="font-black">Mã NVL</th>
              <th className="font-black">Tên NVL</th>
              <th className="font-black">ĐVT</th>
              <th
                className="text-right font-black"
                title="Định mức NVL trên 1 thành phẩm — lấy từ bảng kho thành phẩm (Thành phần SP)"
              >
                Định mức
              </th>
              <th className="text-right font-black">SL NVL</th>
              <th className="text-right font-black">TL NVL</th>
            </tr>
          </thead>
          <tbody>
            {productRows.flatMap(product => {
              if (product.lines.length === 0) {
                return (
                  <tr key={`${product.key}|missing-${materialSection}`} className="text-zinc-900">
                    <td className="align-middle font-mono font-bold">{product.productCode || '—'}</td>
                    <td className="max-w-[180px] truncate align-middle font-semibold" title={product.productName || undefined}>
                      {product.productName || '—'}
                    </td>
                    <td className="bb-sheet-num align-middle font-bold">{product.productQty}</td>
                    <td className="bb-sheet-num text-zinc-400">—</td>
                    <td colSpan={6} className="text-sm text-amber-800">
                      Chưa có {isMixingSection ? 'NVL trộn' : 'vật tư khác'} trong bản tính của sản phẩm này.
                    </td>
                  </tr>
                );
              }
              const kgLineCount = product.tronRowSpan;
              return product.lines.map((line, lineIndex) => {
                const isKgLine = isBbSanLuongNvlKgLine(line);
                const isFirstOtherLine = !isKgLine && lineIndex === kgLineCount && kgLineCount > 0;
                const showTronCell = kgLineCount > 0 && lineIndex === 0;
                const showConLaiCell =
                  product.conLaiRowSpan > 0 &&
                  ((kgLineCount > 0 && lineIndex === kgLineCount) ||
                    (kgLineCount === 0 && lineIndex === 0));
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
                    </>
                  ) : null}
                  {showTronCell ? (
                    <td
                      rowSpan={product.tronRowSpan}
                      className="bb-sheet-num align-middle font-semibold text-zinc-800"
                      title="Tổng nhựa thành phẩm = trong_luong_nhua × SL (cơ sở nhân % vật tư trộn)"
                    >
                      <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-zinc-500">
                        Tổng vật tư trộn
                      </div>
                      <div className="mt-0.5">{formatKg(product.tongVatTuTronKg)}</div>
                    </td>
                  ) : null}
                  {showConLaiCell ? (
                    <td
                      rowSpan={product.conLaiRowSpan}
                      className="bb-sheet-num align-middle font-semibold text-zinc-800"
                      title="Tổng TL NVL vật tư còn lại"
                    >
                      <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-zinc-500">
                        Tổng vật tư còn lại
                      </div>
                      <div className="mt-0.5">{formatKg(product.tongVatTuConLaiKg)}</div>
                    </td>
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
                  <td className="bb-sheet-num font-semibold text-zinc-800">
                    {resolveLineNorm(line, product.catalogProduct, product.quantity)}
                  </td>
                  <td className="bb-sheet-num font-bold text-zinc-900">{resolveNvlQuantity(line)}</td>
                  <td className="bb-sheet-num font-semibold text-zinc-900">{resolveNvlWeight(line)}</td>
                </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-zinc-900">
              <td colSpan={2} className="text-right">{isMixingSection ? 'Tổng NVL trộn' : 'Tổng vật tư khác'}</td>
              <td className="bb-sheet-num">{formatNumber(totalProductQty, 0)}</td>
              <td className="bb-sheet-num">{formatKg(sectionTotalKg)}</td>
              <td colSpan={5} />
              <td className="bb-sheet-num">{formatKg(sectionTotalKg)} kg</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

function resolveGroupSpWeightKg(group: BbSanLuongGroup) {
  const fromProducts = (group.productGroups || []).reduce(
    (sum, pg) => sum + (pg.weightKg > 0 ? pg.weightKg : pg.totalActualWeightKg > 0 ? pg.totalActualWeightKg : 0),
    0
  );
  return fromProducts > 0 ? fromProducts : group.totalActualWeightKg > 0 ? group.totalActualWeightKg : 0;
}

function SanLuongSummaryTable({
  groups,
  shiftSettings
}: {
  groups: BbSanLuongGroup[];
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
}) {
  const totalQty = groups.reduce((sum, g) => sum + (g.totalQuantity > 0 ? g.totalQuantity : 0), 0);
  const totalSpKg = groups.reduce((sum, g) => sum + resolveGroupSpWeightKg(g), 0);
  const totalNorm = groups.reduce((sum, g) => sum + (g.totalNormWeightKg > 0 ? g.totalNormWeightKg : 0), 0);
  const totalActual = groups.reduce(
    (sum, g) => sum + (g.totalActualWeightKg > 0 ? g.totalActualWeightKg : 0),
    0
  );
  const totalProducts = groups.reduce((sum, g) => sum + (g.productCount > 0 ? g.productCount : 0), 0);

  return (
    <section>
      <table className="bb-sheet-table min-w-[920px]">
        <caption className="font-semibold text-zinc-900">
          Bảng tổng · Báo cáo sản lượng ({groups.length} phiếu)
        </caption>
        <thead>
          <tr>
            <th className="font-semibold">Ngày</th>
            <th className="font-semibold">Ca</th>
            <th className="font-semibold">Lệnh SX</th>
            <th className="font-semibold">Máy</th>
            <th className="text-right font-semibold">SP</th>
            <th className="text-right font-semibold">SL SP</th>
            <th className="text-right font-semibold">TL SP (kg)</th>
            <th className="text-right font-semibold">TL ĐM NVL</th>
            <th className="text-right font-semibold">TL thực tế</th>
            <th className="font-semibold">Định mức</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => {
            const shiftName = resolveShiftName(group.shift, group.shiftLabel);
            const timeRange = resolveShiftTimeRange(group.shift, group.shiftLabel, shiftSettings);
            const spKg = resolveGroupSpWeightKg(group);
            const normStatus = resolveNormStatus(group);
            return (
              <tr key={group.groupKey} className="bb-row-parent text-zinc-900">
                <td className="font-mono font-semibold">{group.ngay || '—'}</td>
                <td className="font-semibold">
                  {shiftName}
                  {timeRange ? (
                    <span className="mt-0.5 block text-[12px] font-medium text-zinc-500">
                      {timeRange}
                    </span>
                  ) : null}
                </td>
                <td className="font-mono font-semibold text-zinc-900">{group.orderCode || '—'}</td>
                <td className="font-medium">{group.machine || '—'}</td>
                <td className="bb-sheet-num font-semibold">{group.productCount || 0}</td>
                <td className="bb-sheet-num font-semibold">
                  {group.totalQuantity > 0 ? formatNumber(group.totalQuantity, 0) : '—'}
                </td>
                <td className="bb-sheet-num font-semibold text-zinc-900">
                  {spKg > 0 ? formatKg(spKg, 2) : '—'}
                </td>
                <td className="bb-sheet-num font-semibold text-zinc-800">
                  {group.totalNormWeightKg > 0 ? formatKg(group.totalNormWeightKg, 2) : '—'}
                </td>
                <td className="bb-sheet-num font-semibold text-zinc-900">
                  {group.totalActualWeightKg > 0 ? formatKg(group.totalActualWeightKg, 2) : '—'}
                </td>
                <td className={`font-semibold ${normStatus?.tone || 'text-zinc-400'}`}>
                  {normStatus?.label || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-right font-semibold uppercase tracking-wide text-zinc-600">
              Tổng cộng
            </td>
            <td className="bb-sheet-num font-semibold">{totalProducts}</td>
            <td className="bb-sheet-num font-semibold">{totalQty > 0 ? formatNumber(totalQty, 0) : '—'}</td>
            <td className="bb-sheet-num font-semibold text-zinc-900">
              {totalSpKg > 0 ? formatKg(totalSpKg, 2) : '—'}
            </td>
            <td className="bb-sheet-num font-semibold text-zinc-800">
              {totalNorm > 0 ? formatKg(totalNorm, 2) : '—'}
            </td>
            <td className="bb-sheet-num font-semibold text-zinc-900">
              {totalActual > 0 ? formatKg(totalActual, 2) : '—'}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

export default function BbSanLuongReportPanel({
  groups,
  isLoading,
  shiftSettings,
  products
}: {
  groups: BbSanLuongGroup[];
  isLoading?: boolean;
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
  /** Bảng kho thành phẩm — nguồn cột «Định mức» (Thành phần SP). */
  products?: ProductRow[];
}) {
  const catalogProducts = products || [];
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

  return (
    <div className="bb-report-sheet-scroll px-2 py-3">
      <div className="space-y-6">
        <SanLuongSummaryTable groups={groups} shiftSettings={shiftSettings} />
        <div className="bb-child-panel space-y-6 p-2 sm:p-3">
          <p className="bb-nvl-panel-title border-b border-zinc-200 bg-[#e8f0ed] text-zinc-800">
            Chi tiết theo phiếu
          </p>
          {groups.map(group => (
            <div key={group.groupKey} className="space-y-5">
              <div className="overflow-x-auto">
                <SanLuongShiftSection
                  group={group}
                  shiftSettings={shiftSettings}
                  materialSection="mixing"
                  products={catalogProducts}
                />
              </div>
              <div className="overflow-x-auto">
                <SanLuongShiftSection
                  group={group}
                  shiftSettings={shiftSettings}
                  materialSection="other"
                  products={catalogProducts}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
