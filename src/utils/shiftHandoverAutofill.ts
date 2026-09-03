import {
  emptyProductLine,
  emptyScrapLine,
  emptyClosingStockLine,
  emptyMixingMaterialLine,
  formatQty,
  parseQty,
  type ClosingStockLine,
  type MixingMaterialLine,
  type ProductLine,
  type ProductOption,
  type ScrapLine
} from '../lib/shiftHandoverModel';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  MIXING_ROUND_KEYS,
  getRoundBatchWeight,
  getRoundItems,
  normalizeMixingReport
} from '../lib/mixingReportModel';
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
import { splitProductionOrderStaffNames } from '../features/cai-dat-thoi-gian';
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

function resolveMachineCodeFromOrder(
  order: ProductionOrderRow,
  machines: Array<{ code: string; name: string }>
) {
  const ref = `${order.machine || ''} ${order.position || ''}`.trim();
  if (!ref || ref === '-') return '';
  const found = machines.find(machine => machineTextMatches(ref, machine.code, machine.name));
  return found?.code || '';
}

function staffNamesFromOrder(order: ProductionOrderRow) {
  const fromStaff = splitProductionOrderStaffNames(order.staff);
  if (fromStaff.length > 0) return fromStaff;
  return [
    ...splitProductionOrderStaffNames(order.mainStaff),
    ...splitProductionOrderStaffNames(order.shiftLead),
    ...splitProductionOrderStaffNames(order.assistantStaff),
    ...splitProductionOrderStaffNames(order.traineeStaff)
  ];
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Máy + Người thực hiện từ lệnh SX theo Ngày + Ca (+ Máy nếu đã chọn). */
export function pickHandoverMachineAndOperators(input: {
  orders: ProductionOrderRow[];
  date: string;
  shift: string;
  machines: Array<{ code: string; name: string }>;
  machineCode?: string;
}): { machineCode: string; operators: string } {
  const all = filterProductionOrdersForHandover({
    orders: input.orders,
    date: input.date,
    shift: input.shift
  });
  if (all.length === 0) return { machineCode: '', operators: '' };

  const codes = all
    .map(order => resolveMachineCodeFromOrder(order, input.machines))
    .filter(Boolean);
  const requested = String(input.machineCode || '').trim();
  const machineCode = requested || mostFrequent(codes) || codes[0] || '';
  const machineName = input.machines.find(machine => machine.code === machineCode)?.name || '';

  const scoped = machineCode
    ? filterProductionOrdersForHandover({
        orders: all,
        date: input.date,
        shift: input.shift,
        machineCode,
        machineName
      })
    : all;

  const names: string[] = [];
  const seen = new Set<string>();
  for (const order of scoped) {
    for (const name of staffNamesFromOrder(order)) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return { machineCode, operators: names.join(', ') };
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

function reportMachineMatches(
  report: { maMay?: string; tenMay?: string },
  machineCode?: string,
  machineName?: string
) {
  if (!machineCode && !machineName) return true;
  const hay = `${report.maMay || ''} ${report.tenMay || ''}`;
  return machineTextMatches(hay, machineCode, machineName);
}

/** Tồn cuối ca từ báo cáo máy NVL — ưu tiên Máy đã chọn, không có thì lấy mọi máy cùng Ngày + Ca. */
export function buildClosingStockLinesFromMachineNvl(input: {
  reports: unknown;
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
}): ClosingStockLine[] {
  const forDateShift = normalizeMachineNvlReports(input.reports).filter(report => {
    if (report.reportKind !== 'cuoi_ca') return false;
    const ngay = String(report.ngay || '').slice(0, 10);
    if (input.date && ngay && ngay !== input.date) return false;
    if (input.shift && report.ca && !shiftNamesMatch(report.ca, input.shift)) return false;
    return true;
  });

  const forMachine = forDateShift.filter(report =>
    reportMachineMatches(report, input.machineCode, input.machineName)
  );
  const reports = forMachine.length > 0 ? forMachine : forDateShift;

  const byKey = new Map<
    string,
    { itemCode: string; itemName: string; unit: string; quantity: number; weightKg: number }
  >();

  for (const report of reports) {
    for (const line of report.lines) {
      const itemCode = String(line.maNvl || '').trim();
      const itemName = String(line.tenNvl || '').trim();
      const unit = String(line.donVi || '').trim() || 'kg';
      const fromParts = closingStockQty(line);
      const qty = fromParts > 0 ? fromParts : Number(line.soLuongTon) > 0 ? Number(line.soLuongTon) : 0;
      const weightKg = sumMachineNvlCuoiCaLineTotal(line);
      if (!itemCode && !itemName) continue;
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

function materialMergeKey(code: string, name: string) {
  return normalizeProductCodeKey(code) || `name:${name.trim().toLowerCase()}`;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return round3((a ?? 0) + (b ?? 0));
}

function roundItemQty(items: Array<{ so_luong: number | null; kl_thuc_te: number | null }>): number | null {
  if (items.length === 0) return null;
  const hasActual = items.some(item => item.kl_thuc_te != null && Number.isFinite(item.kl_thuc_te));
  const sum = items.reduce((total, item) => {
    const value = hasActual ? item.kl_thuc_te : item.so_luong;
    return total + (value != null && Number.isFinite(value) ? value : 0);
  }, 0);
  return sum !== 0 || hasActual ? round3(sum) : null;
}

function parseRatioPercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const num = Number(
    String(raw)
      .trim()
      .replace('%', '')
      .replace(/\s/g, '')
      .replace(',', '.')
  );
  return Number.isFinite(num) ? num : null;
}

function roundItemPercent(
  items: Array<{ ti_le_phan_tram?: number | null; don_vi?: string; so_luong?: number | null }>
): number | null {
  const values: number[] = [];
  for (const item of items) {
    const fromField = parseRatioPercent(item.ti_le_phan_tram);
    if (fromField !== null) {
      values.push(fromField);
      continue;
    }
    if (String(item.don_vi || '').trim() === '%') {
      const fromQty = parseRatioPercent(item.so_luong);
      if (fromQty !== null) values.push(fromQty);
    }
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseMachineMixingRatios(value: unknown): Array<{
  materialCode: string;
  materialName: string;
  percent: number;
}> {
  let source: unknown = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const materialCode = String(record.ma_nvl ?? record.materialCode ?? record.code ?? '').trim();
      const materialName = String(record.ten_nvl ?? record.materialName ?? record.name ?? '').trim();
      const percent = parseRatioPercent(record.phan_tram ?? record.percent);
      if ((!materialCode && !materialName) || percent === null) return null;
      return { materialCode, materialName, percent };
    })
    .filter((item): item is { materialCode: string; materialName: string; percent: number } => Boolean(item));
}

export function lookupMachineMixingPercent(
  ratios: Array<{ materialCode: string; materialName: string; percent: number }>,
  code: string,
  name: string
): number | null {
  const codeKey = normalizeProductCodeKey(code);
  if (codeKey) {
    const exact = ratios.find(item => normalizeProductCodeKey(item.materialCode) === codeKey);
    if (exact) return exact.percent;
  }
  const nameKey = name.trim().toLowerCase();
  if (nameKey) {
    const exactName = ratios.find(item => item.materialName.trim().toLowerCase() === nameKey);
    if (exactName) return exactName.percent;
  }
  const hayName = normalizeMachineHay(name);
  if (hayName) {
    const accent = ratios.find(item => normalizeMachineHay(item.materialName) === hayName);
    if (accent) return accent.percent;
  }
  return null;
}

/** Bảng trộn phiếu giao ca ← phiếu trộn (`bao_cao_phoi_tron`); Tỉ lệ ĐM ← `ty_le_tron` máy. */
export function buildMixingMaterialLinesFromPhoiTron(input: {
  reports: unknown;
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
  mixingRatios?: unknown;
}): MixingMaterialLine[] {
  const dateIso = String(input.date || '').slice(0, 10);
  const raw = Array.isArray(input.reports)
    ? input.reports
    : input.reports && typeof input.reports === 'object' && Array.isArray((input.reports as { reports?: unknown }).reports)
      ? (input.reports as { reports: unknown[] }).reports
      : [];

  const reports = raw
    .map(row => (row && typeof row === 'object' ? normalizeMixingReport(row as Record<string, unknown>) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter(report => {
      if (dateIso && report.ngay && report.ngay !== dateIso) return false;
      if (input.shift && report.ca && !shiftNamesMatch(report.ca, input.shift)) return false;
      if (input.machineCode || input.machineName) {
        const reportCode = String(report.ma_may || '').trim();
        const reportName = String(report.ten_may || '').trim();
        const codeMatch =
          input.machineCode &&
          reportCode &&
          reportCode.replace(/\s+/g, '').toLowerCase() === input.machineCode.replace(/\s+/g, '').toLowerCase();
        if (!codeMatch && !machineTextMatches(`${reportCode} ${reportName}`, input.machineCode, input.machineName)) {
          return false;
        }
      } else {
        return false;
      }
      return true;
    });

  type Acc = {
    materialCode: string;
    materialName: string;
    unit: string;
    uses: Array<number | null>;
    percentSum: number;
    percentCount: number;
  };
  const byKey = new Map<string, Acc>();
  const machineRatios = parseMachineMixingRatios(input.mixingRatios);

  for (const report of reports) {
    const offset = report.lan_thu && report.lan_thu > 1 ? report.lan_thu - 1 : 0;
    for (const line of report.chi_tiet) {
      const code = String(line.ma_nvl || '').trim();
      const name = String(line.ten_vat_tu || '').trim();
      if (!code && !name) continue;
      const key = materialMergeKey(code, name);
      const existing = byKey.get(key) ?? {
        materialCode: code,
        materialName: name,
        unit: String(line.don_vi || 'kg').trim() || 'kg',
        uses: [null, null, null, null, null],
        percentSum: 0,
        percentCount: 0
      };
      if (!existing.materialCode && code) existing.materialCode = code;
      if (!existing.materialName && name) existing.materialName = name;
      if (!existing.unit && line.don_vi) existing.unit = String(line.don_vi).trim();

      MIXING_ROUND_KEYS.forEach((roundKey, index) => {
        const items = getRoundItems(line.lan_su_dung, roundKey);
        let roundPct = roundItemPercent(items);
        if (roundPct === null) {
          const batchWeight = getRoundBatchWeight(line.lan_su_dung, roundKey);
          const normKg = items.reduce((sum, item) => sum + (item.so_luong ?? 0), 0);
          if (batchWeight && batchWeight > 0 && normKg > 0) {
            roundPct = (normKg / batchWeight) * 100;
          }
        }
        if (roundPct !== null) {
          existing.percentSum += roundPct;
          existing.percentCount += 1;
        }
        const qty = roundItemQty(items);
        if (qty === null) return;
        const col = Math.min(4, offset + index);
        existing.uses[col] = addNullable(existing.uses[col], qty);
      });

      byKey.set(key, existing);
    }
  }

  return [...byKey.values()]
    .filter(item => item.materialCode || item.materialName || item.uses.some(value => value != null))
    .sort((a, b) =>
      (a.materialCode || a.materialName).localeCompare(b.materialCode || b.materialName, 'vi')
    )
    .map(item => {
      const fromMachine = lookupMachineMixingPercent(machineRatios, item.materialCode, item.materialName);
      const fromSlip = item.percentCount > 0 ? item.percentSum / item.percentCount : null;
      return {
        ...emptyMixingMaterialLine(item.materialName, item.unit || 'kg'),
        materialCode: item.materialCode,
        materialName: item.materialName || item.materialCode,
        unit: item.unit || 'kg',
        percent: formatQty(fromMachine ?? fromSlip),
        use1: formatQty(item.uses[0]),
        use2: formatQty(item.uses[1]),
        use3: formatQty(item.uses[2]),
        use4: formatQty(item.uses[3]),
        use5: formatQty(item.uses[4])
      };
    });
}
