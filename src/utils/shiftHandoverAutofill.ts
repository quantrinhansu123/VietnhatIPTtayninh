import {
  emptyProductLine,
  emptyScrapLine,
  emptyClosingStockLine,
  formatQty,
  parseQty,
  type ClosingStockLine,
  type ProductLine,
  type ProductOption,
  type ScrapLine
} from '../lib/shiftHandoverModel';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  getProductionOrderProductLines,
  normalizeProductionOrders,
  type ProductionOrderRow
} from '../features/ke-hoach-san-xuat';
import { parseDateToIso } from './dateFormat';
import {
  filterCanTuDongRecordsForBoard,
  parseCanTuDongQrProductCode,
  resolveCanSpKg,
  type CanTuDongWeightRow
} from './canTuDongWeights';
import {
  normalizeMachineNvlReports,
  sumMachineNvlCuoiCaLineTotal,
  type MachineNvlSavedReport
} from './machineNvlReports';
import { shiftNamesMatch } from './shiftSettings';
import {
  damagedGoodsMaterialTypeLabel,
  inferDamagedGoodsFormFields,
  normalizeWeighingRecords
} from './weighingRecords';

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeMachineHay(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function machineTextMatches(candidate: string, code?: string, name?: string) {
  const needle = normalizeMachineHay(`${code || ''} ${name || ''}`);
  const hay = normalizeMachineHay(candidate);
  if (!needle) return true;
  if (!hay) return false;
  return hay.includes(needle) || needle.includes(hay);
}

/** Lọc lệnh SX theo Ngày + Ca (+ Máy). */
export function filterProductionOrdersForHandover(input: {
  orders: ProductionOrderRow[];
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
}): ProductionOrderRow[] {
  const dateIso = String(input.date || '').slice(0, 10);
  return input.orders.filter(order => {
    const orderDate = parseDateToIso(order.startDate);
    if (dateIso && orderDate && orderDate !== dateIso) return false;
    if (input.shift && order.shift && order.shift !== '-' && !shiftNamesMatch(order.shift, input.shift)) {
      return false;
    }
    if (input.machineCode || input.machineName) {
      const machineHay = `${order.machine || ''} ${order.position || ''}`;
      if (!machineTextMatches(machineHay, input.machineCode, input.machineName)) return false;
    }
    return true;
  });
}

/**
 * Thành phẩm: dòng từ lệnh SX; Số lượng (SL cuộn) = số lần cân tự động theo mã SP.
 * Dự kiến trả kho = SL trên lệnh SX (gộp theo mã).
 */
export function buildProductLinesFromOrdersAndCanTuDong(input: {
  orders: unknown;
  records: CanTuDongWeightRow[];
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
  products: ProductOption[];
}): ProductLine[] {
  const orders = filterProductionOrdersForHandover({
    orders: Array.isArray(input.orders)
      ? (input.orders as ProductionOrderRow[])
      : normalizeProductionOrders(input.orders),
    date: input.date,
    shift: input.shift,
    machineCode: input.machineCode,
    machineName: input.machineName
  });

  const catalogByCode = new Map(
    input.products.map(product => [normalizeProductCodeKey(product.code), product] as const)
  );

  const byCode = new Map<string, { code: string; name: string; plannedReturn: number }>();

  for (const order of orders) {
    for (const line of getProductionOrderProductLines(order)) {
      const code = String(line.productCode || '').trim();
      const key = normalizeProductCodeKey(code);
      if (!key) continue;
      const qty = parseQty(line.quantity) ?? 0;
      const catalog = catalogByCode.get(key);
      const existing = byCode.get(key);
      if (!existing) {
        byCode.set(key, {
          code: code || catalog?.code || key,
          name: String(line.productName || '').trim() || catalog?.name || '',
          plannedReturn: qty > 0 ? qty : 0
        });
        continue;
      }
      if (qty > 0) existing.plannedReturn += qty;
      if (!existing.name && (line.productName || catalog?.name)) {
        existing.name = String(line.productName || catalog?.name || '').trim();
      }
    }
  }

  const filteredWeighings = filterCanTuDongRecordsForBoard(input.records, {
    shiftFilter: input.shift || 'all',
    dateFrom: input.date,
    dateTo: input.date,
    machineFilter: input.machineCode || input.machineName ? 'selected' : 'all',
    selectedMachine:
      input.machineCode || input.machineName
        ? { code: input.machineCode || '', name: input.machineName || '' }
        : null,
    productCodeKeys: byCode.size > 0 ? byCode.keys() : null
  });

  const weighByCode = new Map<string, { quantity: number; weightSum: number; weightCount: number }>();
  for (const row of filteredWeighings) {
    const code = parseCanTuDongQrProductCode(row.qr_code);
    const key = normalizeProductCodeKey(code);
    if (!key) continue;
    // Chỉ đếm mã có trên lệnh SX khi đã có dòng lệnh; nếu không có lệnh thì gom hết mã cân.
    if (byCode.size > 0 && !byCode.has(key)) continue;
    const canSp = resolveCanSpKg(row);
    const existing = weighByCode.get(key);
    if (!existing) {
      weighByCode.set(key, {
        quantity: 1,
        weightSum: canSp != null && canSp > 0 ? canSp : 0,
        weightCount: canSp != null && canSp > 0 ? 1 : 0
      });
      continue;
    }
    existing.quantity += 1;
    if (canSp != null && canSp > 0) {
      existing.weightSum += canSp;
      existing.weightCount += 1;
    }
  }

  // Không có lệnh SX khớp → không tự tạo dòng từ cân (theo yêu cầu: dòng từ lệnh SX).
  if (byCode.size === 0) return [emptyProductLine()];

  const lines = [...byCode.values()]
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'))
    .map(item => {
      const key = normalizeProductCodeKey(item.code);
      const catalog = catalogByCode.get(key);
      const weigh = weighByCode.get(key);
      const avgWeight =
        weigh && weigh.weightCount > 0 ? round3(weigh.weightSum / weigh.weightCount) : null;
      const resinNorm = catalog?.totalWeightKg ?? avgWeight;
      return {
        ...emptyProductLine(),
        productCode: item.code,
        productName: item.name || catalog?.name || '',
        plannedReturn: item.plannedReturn > 0 ? formatQty(item.plannedReturn, 0) : '',
        quantity: weigh && weigh.quantity > 0 ? formatQty(weigh.quantity, 0) : '',
        rollWeight: avgWeight != null ? formatQty(avgWeight) : resinNorm != null ? formatQty(resinNorm) : '',
        resinNorm: resinNorm != null ? formatQty(resinNorm) : ''
      };
    });

  return lines.length > 0 ? lines : [emptyProductLine()];
}

/** @deprecated Dùng buildProductLinesFromOrdersAndCanTuDong */
export function buildProductLinesFromCanTuDong(input: {
  records: CanTuDongWeightRow[];
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
  products: ProductOption[];
}): ProductLine[] {
  return buildProductLinesFromOrdersAndCanTuDong({
    ...input,
    orders: []
  });
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value.trim().replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/** Hàng lỗi từ báo cáo hàng hỏng — gom theo trạng thái / mã VT. */
export function buildScrapLinesFromDamagedGoods(input: {
  records: unknown;
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
}): ScrapLine[] {
  const byKey = new Map<string, { name: string; quantity: number }>();
  const machineNeedle = `${input.machineCode || ''} ${input.machineName || ''}`
    .trim()
    .toLowerCase();
  const normalized = normalizeWeighingRecords(input.records);

  for (const row of normalized) {
    const ngay = String(row.productionDate || row.reportDate || '').slice(0, 10);
    if (input.date && ngay && ngay !== input.date) continue;
    const ca = String(row.shiftName || '').trim();
    if (input.shift && ca && !shiftNamesMatch(ca, input.shift)) continue;
    if (machineNeedle) {
      const may = String(row.machineName || '').trim().toLowerCase();
      if (may && !may.includes(machineNeedle) && !machineNeedle.includes(may)) continue;
    }

    const inferred = inferDamagedGoodsFormFields(row);
    const typeLabel = damagedGoodsMaterialTypeLabel(inferred.materialType);
    const name =
      (inferred.materialCode
        ? `${typeLabel}${typeLabel !== '—' ? ' · ' : ''}${inferred.materialCode}`.trim()
        : typeLabel) ||
      row.productName ||
      row.productCode ||
      'Hàng hỏng';
    const qty =
      asFiniteNumber(inferred.materialQuantity) ??
      asFiniteNumber(row.weight) ??
      0;
    if (!(qty > 0)) continue;

    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { name, quantity: qty });
    else existing.quantity += qty;
  }

  const lines = [...byKey.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    .map(item => ({
      ...emptyScrapLine(),
      name: item.name,
      quantity: formatQty(round3(item.quantity))
    }));

  return lines.length > 0 ? lines : [emptyScrapLine(), emptyScrapLine(), emptyScrapLine()];
}

function closingStockQty(line: MachineNvlSavedReport['lines'][number]) {
  if (Number.isFinite(line.soLuongTon) && line.soLuongTon > 0) return line.soLuongTon;
  return (
    (line.soLuongTrongMay ?? 0) +
    (line.soLuongTrongBonTron ?? 0) +
    (line.soLuongNlChuaTron ?? 0) +
    (line.soLuongTonNgoai ?? 0)
  );
}

/** Tồn cuối ca từ báo cáo máy NVL. */
export function buildClosingStockLinesFromMachineNvl(input: {
  reports: unknown;
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
}): ClosingStockLine[] {
  const reports = normalizeMachineNvlReports(input.reports).filter(report => {
    if (report.reportKind !== 'cuoi_ca') return false;
    const ngay = String(report.ngay || '').slice(0, 10);
    if (input.date && ngay && ngay !== input.date) return false;
    if (input.shift && report.ca && !shiftNamesMatch(report.ca, input.shift)) return false;
    if (input.machineCode || input.machineName) {
      const needle = `${input.machineCode || ''} ${input.machineName || ''}`.trim().toLowerCase();
      const may = `${report.maMay || ''} ${report.tenMay || ''}`.trim().toLowerCase();
      if (may && needle && !may.includes(needle) && !needle.includes(may)) return false;
    }
    return true;
  });

  const byKey = new Map<
    string,
    { itemCode: string; itemName: string; unit: string; quantity: number; weightKg: number }
  >();

  for (const report of reports) {
    for (const line of report.lines) {
      const itemCode = String(line.maNvl || '').trim();
      const itemName = String(line.tenNvl || '').trim();
      const unit = String(line.donVi || '').trim();
      const qty = closingStockQty(line);
      const weightKg = sumMachineNvlCuoiCaLineTotal(line);
      if (!itemCode && !itemName) continue;
      if (!(qty > 0) && !(weightKg > 0)) continue;
      const key = normalizeProductCodeKey(itemCode) || `name:${itemName.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          itemCode,
          itemName,
          unit,
          quantity: qty > 0 ? qty : 0,
          weightKg: weightKg > 0 ? weightKg : 0
        });
        continue;
      }
      existing.quantity += qty > 0 ? qty : 0;
      existing.weightKg += weightKg > 0 ? weightKg : 0;
      if (!existing.itemName && itemName) existing.itemName = itemName;
      if (!existing.unit && unit) existing.unit = unit;
    }
  }

  const lines = [...byKey.values()]
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode, 'vi') || a.itemName.localeCompare(b.itemName, 'vi'))
    .map(item => ({
      ...emptyClosingStockLine(),
      itemCode: item.itemCode,
      itemName: item.itemName,
      unit: item.unit,
      quantity: item.quantity > 0 ? formatQty(round3(item.quantity)) : '',
      weightKg: item.weightKg > 0 ? formatQty(round3(item.weightKg)) : ''
    }));

  return lines.length > 0 ? lines : [emptyClosingStockLine()];
}
