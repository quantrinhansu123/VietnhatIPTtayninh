import React from 'react';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  resolveShiftName,
  shiftNamesMatch,
  type ShiftOption
} from '../../utils/shiftSettings';
import {
  normalizeMachineNvlReports,
  type MachineNvlSavedReport
} from '../../utils/machineNvlReports';
import {
  normalizeWeighingRecords,
  getWeighingDataRows,
  slipKey,
  type WeighingRecord
} from '../../utils/weighingRecords';
import {
  normalizeMixingReport,
  groupMixingReportsForPrint,
  buildMixingReportPrintContext
} from '../../lib/mixingReportModel';
import type { MixingReport } from '../../components/MixingReportForm';
import {
  normalizeMachineDowntimeSlips,
  type MachineDowntimeSlip
} from '../../components/MachineDowntimeReportPanel';
import {
  normalizeAcceptanceReports,
  type AcceptanceReport
} from '../../components/AcceptanceReportForm';
import { findProductByCode, normalizeProductCodeKey } from '../san-pham';
import type { ProductRow } from '../san-pham/types';
import { MachineNvlPrintSheet, savedReportToMachineNvlPrintReport } from '../../components/MachineNvlPrintSheet';
import { MixingReportPrintSheet } from '../../components/MixingReportPrintSheet';
import { WeighingSlipPrintSheet, type WeighingSlipPrintData } from '../../components/WeighingSlipPrintSheet';
import { MachineDowntimePrintSheet, buildMachineDowntimePrintSlip } from '../../components/MachineDowntimePrintSheet';
import { AcceptanceReportPrintSheet, buildAcceptancePrintSlips, buildAcceptanceFilmKgByProductCode } from '../../components/AcceptanceReportPrintSheet';
import {
  buildCanTuDongPrintData,
  CanTuDongPrintSheet,
  type CanTuDongPrintData
} from '../../components/CanTuDongPrintSheet';
import type { CanTuDongWeightRow } from '../../utils/canTuDongWeights';
import {
  ShiftHandoverPrintSheetV2,
  slipToPrintSlip,
  type ShiftHandoverPrintSlip
} from '../../components/ShiftHandoverPrintSheetV2';
import {
  normalizeShiftHandoverSlips,
  type ShiftHandoverSlip
} from '../../lib/shiftHandoverModel';
import {
  WarehouseSlipPrintBatch,
  type WarehouseSlipPrintData
} from '../../components/WarehouseSlipPrintModal';
import {
  normalizeWarehouseMovements,
  type WarehouseMovementRow
} from '../phieu-xuat-nhap-kho';
import { normalizeMaterialsInventory } from '../kho-nvl';
import {
  convertWarehouseQuantityToKg,
  mapMaterialToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from '../../utils/warehouseWeight';
import type { OrderRow } from '../_shared/orderRecordHelpers';
import ControlBoardBbMachineReportPrintBatch from '../../components/ControlBoardBbMachineReportPrintSheet';
import {
  BbGiaiTrinhPrintSheet,
  buildBbGiaiTrinhPrintReport,
  type BbGiaiTrinhPrintReport
} from '../../components/BbGiaiTrinhPrintSheet';
import {
  buildBbBaoCaoTinhToanStableKey,
  isBbBaoCaoTinhToanPayload,
  type BbBaoCaoTinhToanPayload
} from '../../utils/bbBaoCaoTinhToan';
import { parseBbGiaiTrinhFields, type BbGiaiTrinhFields } from '../../utils/bbGiaiTrinh';
import {
  loadProductionOrderPrintMaterials,
  normalizeProductionOrders,
  normalizeProductionPlanHistory,
  normalizeProductionPlanHistoryLines,
  productionOrderToPlanLine,
  ProductionOrderPrintSheet,
  ProductionPlanPrintSheet,
  resolveProductionOrderMachineLabel,
  type PrintableProductionOrder,
  type ProductionPlanLine
} from './index';

function splitOrderRefCodes(value: string): string[] {
  return String(value || '')
    .split(/[,;+]/)
    .map(part => part.trim())
    .filter(part => part && part !== '-');
}

export function collectProductionPlanOrderRefs(orderRefs: Iterable<string>): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const raw of orderRefs) {
    for (const ref of splitOrderRefCodes(String(raw || ''))) {
      const normalized = ref.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      refs.push(normalized);
    }
  }
  return refs;
}

export function resolveCustomerOrdersForPrint(allOrders: OrderRow[], orderRefs: string[]): OrderRow[] {
  const byCode = new Map<string, OrderRow>();
  for (const order of allOrders) {
    const code = (order.orderCode || '').trim();
    if (!code) continue;
    byCode.set(code, order);
    byCode.set(code.toUpperCase(), order);
  }

  const seen = new Set<string>();
  const result: OrderRow[] = [];
  for (const ref of orderRefs) {
    const key = ref.trim();
    const order = byCode.get(key) ?? byCode.get(key.toUpperCase());
    if (!order || seen.has(order.id)) continue;
    seen.add(order.id);
    result.push(order);
  }
  return result;
}

export type ProductionPlanReportDiagnostic = {
  label: string;
  /** Số phiếu khớp Ngày + Ca (được in). */
  matched: number;
  /** Tổng số phiếu tìm được theo Ngày (trước khi lọc theo ca). */
  dayTotal: number;
};

export type ProductionPlanRelatedReports = {
  productCatalog: ProductRow[];
  materialCatalog: ReturnType<typeof normalizeMaterialsInventory>;
  productionPlans: Array<{ id: string; planDate: string; lines: ProductionPlanLine[]; note: string }>;
  productionOrders: PrintableProductionOrder[];
  machineNvl: MachineNvlSavedReport[];
  mixing: MixingReport[];
  weighing: WeighingRecord[];
  downtime: MachineDowntimeSlip[];
  damaged: WeighingRecord[];
  acceptance: AcceptanceReport[];
  acceptanceFilmKgByProductCode: Map<string, number>;
  shiftHandovers: ShiftHandoverSlip[];
  canTuDong: CanTuDongPrintData | null;
  warehouseExportSlips: WarehouseSlipPrintData[];
  warehouseInboundSlips: WarehouseSlipPrintData[];
  warehouseSlips: WarehouseSlipPrintData[];
  /** Nguồn phiếu kho thô để mẫu Báo cáo kết quả theo lệnh SX tính đúng cột chi tiết/đơn giá. */
  warehouseMovements: WarehouseMovementRow[];
  shiftOptions: ShiftOption[];
  totalReport: BbBaoCaoTinhToanPayload | null;
  totalReportGiaiTrinh: BbGiaiTrinhPrintReport | null;
  isEmpty: boolean;
  errors: string[];
  diagnostics: ProductionPlanReportDiagnostic[];
};

function addShiftToken(tokens: Set<string>, value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  tokens.add(lower);

  const withoutCa = lower.replace(/^ca\s+/i, '').trim();
  if (withoutCa) tokens.add(withoutCa);

  const hcMatch = lower.match(/\bhc\s*(\d+)\b/i);
  if (hcMatch) tokens.add(`hc${hcMatch[1]}`);

  const caNumberMatch = lower.match(/^ca\s*(\d+)$/i);
  if (caNumberMatch) {
    tokens.add(caNumberMatch[1]);
    tokens.add(`hc${caNumberMatch[1]}`);
  }
}

function normalizeMachineKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buildMachineMatchers(planMachines: string[]): Set<string> {
  const matchers = new Set<string>();
  planMachines.forEach(machine => {
    const key = normalizeMachineKey(machine);
    if (key && key !== '-') matchers.add(key);
  });
  return matchers;
}

function machineMatches(
  machineMatchers: Set<string>,
  ...candidates: Array<string | undefined | null>
): boolean {
  if (machineMatchers.size === 0) return false;
  const normalizedCandidates = candidates.map(value => normalizeMachineKey(String(value || ''))).filter(Boolean);
  if (normalizedCandidates.length === 0) return false;

  for (const candidate of normalizedCandidates) {
    for (const matcher of machineMatchers) {
      if (candidate === matcher || candidate.includes(matcher) || matcher.includes(candidate)) {
        return true;
      }
    }
  }
  return false;
}

function collectShiftTokens(rawShift: string, shiftOptions: ShiftOption[]): Set<string> {
  const tokens = new Set<string>();
  const trimmed = (rawShift || '').trim();
  if (!trimmed) return tokens;

  addShiftToken(tokens, trimmed);
  addShiftToken(tokens, resolveShiftName(trimmed, shiftOptions));

  shiftOptions.forEach(option => {
    if (shiftNamesMatch(trimmed, option.value) || shiftNamesMatch(trimmed, option.label)) {
      addShiftToken(tokens, option.value);
      addShiftToken(tokens, option.label);
    }
  });

  return tokens;
}

function buildShiftMatchers(shiftList: string[], shiftOptions: ShiftOption[]): Set<string> {
  const matchers = new Set<string>();
  shiftList.forEach(shift => {
    collectShiftTokens(shift, shiftOptions).forEach(token => matchers.add(token));
  });
  return matchers;
}

function tokensMatch(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;
  for (const a of left) {
    for (const b of right) {
      if (a === b || a.includes(b) || b.includes(a)) return true;
    }
  }
  return false;
}

function matchShift(rowShift: string, shiftList: string[], shiftOptions: ShiftOption[]): boolean {
  if (shiftList.length === 0) return true;
  const trimmed = (rowShift || '').trim();
  // Khi đã lọc ca, phiếu không có ca coi như không thuộc ca nào -> loại bỏ.
  if (!trimmed) return false;

  const matchers = buildShiftMatchers(shiftList, shiftOptions);
  const rowTokens = collectShiftTokens(trimmed, shiftOptions);
  return tokensMatch(matchers, rowTokens);
}

function shouldIncludeRelatedReport(rowShift: string, shiftList: string[], shiftOptions: ShiftOption[]): boolean {
  return matchShift(rowShift, shiftList, shiftOptions);
}

function matchesIsoPrintDate(value: string, isoDate: string) {
  const text = String(value || '').trim();
  if (!text || !isoDate) return false;
  if (text.slice(0, 10) === isoDate) return true;
  const [year, month, day] = isoDate.split('-');
  return Boolean(year && month && day && text === `${day}/${month}/${year}`);
}

function normalizeProductKey(value: string) {
  return normalizeProductCodeKey(value || '');
}

function addAcceptanceProductNamesForPrint(
  reports: AcceptanceReport[],
  productCatalog: ProductRow[],
  materialCatalog?: unknown
) {
  const productNameByCode = new Map<string, string>();
  productCatalog.forEach(product => {
    const key = normalizeProductKey(product.code);
    if (!key) return;
    if (!productNameByCode.has(key)) productNameByCode.set(key, product.name || '');
  });

  const materialRows = Array.isArray(materialCatalog)
    ? materialCatalog
    : materialCatalog &&
        typeof materialCatalog === 'object' &&
        Array.isArray((materialCatalog as { materials?: unknown }).materials)
      ? (materialCatalog as { materials: unknown[] }).materials
      : [];
  for (const item of materialRows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const code = String(record.ma_npl ?? record.ma_sp ?? record.code ?? '').trim();
    const name = String(record.ten_npl ?? record.ten_sp ?? record.name ?? '').trim();
    const key = normalizeProductKey(code);
    if (key && name && !productNameByCode.has(key)) productNameByCode.set(key, name);
  }

  return reports.map(report => {
    const product = findProductByCode(productCatalog, report.mat_hang || '');
    const fallbackName = product?.name || '';
    const matHang = String(report.mat_hang || '').trim();
    const plusIdx = matHang.indexOf('+');
    const codePrefix = (plusIdx > 0 ? matHang.slice(0, plusIdx) : matHang).trim();
    return {
      ...report,
      ten_sp:
        report.ten_sp ||
        productNameByCode.get(normalizeProductKey(report.mat_hang)) ||
        productNameByCode.get(normalizeProductKey(codePrefix)) ||
        fallbackName
    };
  });
}

async function loadShiftOptions(): Promise<ShiftOption[]> {
  try {
    const res = await fetch('/api/cai-dat');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return getProductionShiftOptions(normalizeShiftSettings(data));
  } catch {
    return [];
  }
}

async function fetchJson(url: string): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: null };
  }
}

/** Tải toàn bộ phiếu liên quan tới NGÀY + CA (+ máy) của kế hoạch để in gộp. */
export async function loadProductionPlanRelatedReports(
  planDate: string,
  shiftList: string[],
  productCatalog: ProductRow[] = []
): Promise<ProductionPlanRelatedReports> {
  if (!planDate) {
    throw new Error('Chưa có ngày kế hoạch để in các phiếu liên quan.');
  }

  const shifts = Array.from(new Set((shiftList ?? []).map(s => s.trim()).filter(Boolean)));
  const errors: string[] = [];
  const encodedDate = encodeURIComponent(planDate);
  const shiftOptions = await loadShiftOptions();
  const totalReportKey = buildBbBaoCaoTinhToanStableKey({
    dateFrom: planDate,
    dateTo: planDate,
    shiftFilter: shifts[0] || 'all',
    machineFilter: 'all',
    sanLuongSource: 'can-tu-dong',
    includeAllMachines: true
  });

  const [planRes, productionOrderRes, nvlRes, mixingRes, weighingRes, downtimeRes, damagedRes, acceptanceRes, shiftHandoverRes, canTuDongRes, warehouseRes, finishedGoodsInboundRes, materialCatalogRes, totalReportRes, giaiTrinhRes] =
    await Promise.all([
      fetchJson(`/api/ke-hoach-sx?ngay=${encodedDate}&limit=100`),
      fetchJson('/api/lenh-sx'),
      fetchJson(`/api/bao-cao-may-nvl-ton?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-phoi-tron?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-can-dinh-ki?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-bao-dung-may?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-hang-hong?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-nghiem-thu?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-giao-ca?ngay=${encodedDate}&limit=300`),
      fetchJson(`/api/can-tu-dong?from=${encodedDate}&to=${encodedDate}&dateBy=ngay&images=0&limit=10000`),
      fetchJson(`/api/phieu-xuat-nhap-kho?loai=xuat&loai_kho=nvl&from=${encodedDate}&to=${encodedDate}`),
      fetchJson(`/api/phieu-xuat-nhap-kho?loai=nhap&loai_kho=san_pham&from=${encodedDate}&to=${encodedDate}`),
      fetchJson('/api/kho-nvl'),
      fetchJson(`/api/bb-bao-cao-tinh-toan?khoa_on_dinh=${encodeURIComponent(totalReportKey)}`),
      fetchJson(`/api/bb-giai-trinh?dateFrom=${encodedDate}&dateTo=${encodedDate}`)
    ]);

  const productionOrdersAll = productionOrderRes.ok ? normalizeProductionOrders(productionOrderRes.data) : [];
  const productionOrdersForPrint = productionOrdersAll.filter(order =>
    matchesIsoPrintDate(order.startDate, planDate) && shouldIncludeRelatedReport(order.shift, shifts, shiftOptions)
  );
  const productionOrders = (
    await Promise.all(
      productionOrdersForPrint.map(async order => {
        const [{ materials, product }, machineLabel] = await Promise.all([
          loadProductionOrderPrintMaterials(order),
          resolveProductionOrderMachineLabel(order.machine)
        ]);
        return { order, materials, product, machineLabel } as PrintableProductionOrder;
      })
    )
  );
  if (!productionOrderRes.ok) errors.push('Lệnh sản xuất');

  const planSummaries = planRes.ok ? normalizeProductionPlanHistory(planRes.data) : [];
  const planDetails = await Promise.all(
    planSummaries
      .filter(plan => matchesIsoPrintDate(plan.planDate, planDate))
      .map(async plan => ({ plan, detail: await fetchJson(`/api/ke-hoach-sx?id=${encodeURIComponent(plan.id)}`) }))
  );
  const productionPlans = planDetails
    .filter(({ detail }) => detail.ok)
    .map(({ plan, detail }) => {
      const lines = normalizeProductionPlanHistoryLines(detail.data)
        .filter(line => shouldIncludeRelatedReport(line.shift, shifts, shiftOptions))
        .map(line => {
          const source = productionOrdersAll.find(order =>
            (line.productionOrderId && order.id === line.productionOrderId) ||
            (line.orderCode && order.code === line.orderCode)
          );
          if (source) return productionOrderToPlanLine(source, line.priority);
          const firstProduct = line.products[0];
          return {
            id: line.productionOrderId || line.id,
            code: line.orderCode,
            name: line.orderCode,
            productCode: firstProduct?.productCode || '',
            productName: firstProduct?.productName || '',
            quantity: firstProduct?.quantity || '',
            unit: firstProduct?.unit || '',
            products: line.products,
            status: '',
            orderRef: line.orderRef,
            position: line.machine !== '-' ? line.machine : line.position,
            staff: line.staff,
            shiftLead: line.shiftLead,
            mainStaff: line.mainStaff,
            assistantStaff: line.assistantStaff,
            traineeStaff: line.traineeStaff,
            shift: line.shift,
            priority: line.priority,
            note: line.note
          } as ProductionPlanLine;
        });
      return { id: plan.id, planDate, lines, note: plan.note };
    })
    .filter(plan => plan.lines.length > 0);
  if (!planRes.ok) errors.push('Kế hoạch sản xuất');

  const machineNvlAll = nvlRes.ok ? normalizeMachineNvlReports(nvlRes.data) : [];
  const machineNvl = machineNvlAll.filter(report =>
    shouldIncludeRelatedReport(report.ca, shifts, shiftOptions)
  );
  if (!nvlRes.ok) errors.push('Báo cáo tồn NVL');

  const mixingReportsRaw = (mixingRes.data as { reports?: unknown })?.reports;
  const mixingAll =
    mixingRes.ok && Array.isArray(mixingReportsRaw)
      ? mixingReportsRaw.map((item: Record<string, unknown>) => normalizeMixingReport(item))
      : [];
  const mixing = mixingAll.filter(report =>
    shouldIncludeRelatedReport(report.ca, shifts, shiftOptions)
  );
  if (!mixingRes.ok) errors.push('Trộn nguyên vật liệu');

  const weighingAll = weighingRes.ok ? normalizeWeighingRecords(weighingRes.data) : [];
  const weighing = weighingAll.filter(record =>
    shouldIncludeRelatedReport(record.shiftName, shifts, shiftOptions)
  );
  if (!weighingRes.ok) errors.push('Phiếu cân');

  const downtimeAll = downtimeRes.ok ? normalizeMachineDowntimeSlips(downtimeRes.data) : [];
  const downtime = downtimeAll.filter(slip =>
    shouldIncludeRelatedReport(slip.shift, shifts, shiftOptions)
  );
  if (!downtimeRes.ok) errors.push('Phiếu báo dừng máy');

  const damagedAll = damagedRes.ok ? normalizeWeighingRecords(damagedRes.data) : [];
  const damaged = damagedAll.filter(record =>
    shouldIncludeRelatedReport(record.shiftName, shifts, shiftOptions)
  );
  if (!damagedRes.ok) errors.push('Báo cáo hàng hỏng');

  const acceptanceAllRaw = acceptanceRes.ok ? normalizeAcceptanceReports(acceptanceRes.data) : [];
  const acceptanceAll =
    productCatalog.length > 0 || materialCatalogRes.ok
      ? addAcceptanceProductNamesForPrint(
          acceptanceAllRaw,
          productCatalog,
          materialCatalogRes.ok ? materialCatalogRes.data : undefined
        )
      : acceptanceAllRaw;
  const acceptance = acceptanceAll.filter(report =>
    shouldIncludeRelatedReport(report.ca, shifts, shiftOptions)
  );
  if (!acceptanceRes.ok) errors.push('Báo cáo sản lượng');

  const shiftHandoversAll = shiftHandoverRes.ok ? normalizeShiftHandoverSlips(shiftHandoverRes.data) : [];
  const shiftHandovers = shiftHandoversAll.filter(slip =>
    shouldIncludeRelatedReport(slip.shift, shifts, shiftOptions)
  );
  if (!shiftHandoverRes.ok) errors.push('Phiếu giao ca');

  const canTuDongAll = canTuDongRes.ok && Array.isArray((canTuDongRes.data as { records?: unknown })?.records)
    ? (canTuDongRes.data as { records: CanTuDongWeightRow[] }).records
    : [];
  const canTuDongRecords = canTuDongAll.filter(row =>
    shouldIncludeRelatedReport(String(row.ca ?? ''), shifts, shiftOptions)
  );
  if (!canTuDongRes.ok) errors.push('Phiếu cân tự động');
  const productNameByCode = new Map<string, string>();
  const productStandardWeightByCode = new Map<string, number>();
  const productCoreWeightByCode = new Map<string, number>();
  const productPlasticWeightByCode = new Map<string, number>();
  const asPositiveNumber = (value: string) => {
    const parsed = Number(String(value ?? '').trim().replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  productCatalog.forEach(product => {
    const name = product.name || '';
    const totalWeight = asPositiveNumber(product.totalWeight);
    const coreWeight = asPositiveNumber(product.coreWeight);
    const plasticWeight = asPositiveNumber(product.plasticWeight);
    [product.code, product.newCode].forEach(code => {
      const key = normalizeProductKey(code);
      if (!key) return;
      if (name) productNameByCode.set(key, name);
      if (totalWeight !== null) productStandardWeightByCode.set(key, totalWeight);
      if (coreWeight !== null) productCoreWeightByCode.set(key, coreWeight);
      if (plasticWeight !== null) productPlasticWeightByCode.set(key, plasticWeight);
    });
  });
  const canTuDong = canTuDongRecords.length > 0
    ? buildCanTuDongPrintData(canTuDongRecords, {
        fromDate: planDate,
        toDate: planDate,
        ca: shifts.length === 1 ? shifts[0] : 'all',
        productNameByCode,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      })
    : null;

  const warehouseMovementsAll = [
    ...(warehouseRes.ok ? normalizeWarehouseMovements(warehouseRes.data) : []),
    ...(finishedGoodsInboundRes.ok ? normalizeWarehouseMovements(finishedGoodsInboundRes.data) : [])
  ];
  // Cả phiếu xuất lẫn phiếu nhập trong batch phải khớp đúng ca người dùng chọn.
  // Không lấy tất cả phiếu xuất của cùng ngày, vì sẽ lẫn vật tư của ca khác.
  const warehouseMovements = warehouseMovementsAll.filter(row =>
    shouldIncludeRelatedReport(row.shift, shifts, shiftOptions)
  );
  if (!warehouseRes.ok) errors.push('Phiếu xuất vật tư');
  if (!finishedGoodsInboundRes.ok) errors.push('Phiếu nhập kho thành phẩm');
  const materialCatalog = materialCatalogRes.ok ? normalizeMaterialsInventory(materialCatalogRes.data) : [];
  const materialWeightCatalog = materialCatalog.map(mapMaterialToWeightCatalogItem);
  const warehouseSlips = buildWarehouseExportSlips(warehouseMovements, materialWeightCatalog);
  const warehouseExportSlips = warehouseSlips.filter(slip => slip.slipType === 'xuat');
  const warehouseInboundSlips = warehouseSlips.filter(slip => slip.slipType === 'nhap');

  const rawTotalReport = (totalReportRes.data as { item?: { payload?: unknown } } | null)?.item?.payload;
  const totalReport = isBbBaoCaoTinhToanPayload(rawTotalReport) ? rawTotalReport : null;
  const giaiTrinhMap: Record<string, BbGiaiTrinhFields> = {};
  const giaiTrinhItems = Array.isArray((giaiTrinhRes.data as { items?: unknown } | null)?.items)
    ? ((giaiTrinhRes.data as { items: unknown[] }).items)
    : [];
  for (const raw of giaiTrinhItems) {
    const row = raw as Record<string, unknown>;
    const key = String(row.group_key || row.ma_lenh || '').trim();
    if (key) giaiTrinhMap[key] = parseBbGiaiTrinhFields(row);
  }
  const totalReportGiaiTrinh = totalReport
    ? buildBbGiaiTrinhPrintReport({
        orderGroups: totalReport.orderGroups,
        giaiTrinhMap,
        dateFrom: planDate,
        dateTo: planDate,
        shiftFilter: shifts[0] || 'all',
        machineFilter: 'all'
      })
    : null;

  const acceptanceFilmKgByProductCode = buildAcceptanceFilmKgByProductCode(productCatalog);

  const isEmpty =
    productionPlans.length === 0 &&
    productionOrders.length === 0 &&
    machineNvl.length === 0 &&
    mixing.length === 0 &&
    getWeighingDataRows(weighing).length === 0 &&
    downtime.length === 0 &&
    getWeighingDataRows(damaged).length === 0 &&
    acceptance.length === 0 &&
    shiftHandovers.length === 0 &&
    canTuDong === null &&
    warehouseSlips.length === 0;

  const diagnostics: ProductionPlanReportDiagnostic[] = [
    { label: 'Kế hoạch sản xuất', matched: productionPlans.length, dayTotal: planSummaries.length },
    { label: 'Lệnh sản xuất', matched: productionOrders.length, dayTotal: productionOrdersAll.length },
    { label: 'Báo cáo tồn NVL', matched: machineNvl.length, dayTotal: machineNvlAll.length },
    { label: 'Trộn nguyên vật liệu', matched: mixing.length, dayTotal: mixingAll.length },
    { label: 'Phiếu cân', matched: getWeighingDataRows(weighing).length, dayTotal: getWeighingDataRows(weighingAll).length },
    { label: 'Phiếu báo dừng máy', matched: downtime.length, dayTotal: downtimeAll.length },
    { label: 'Báo cáo hàng hỏng', matched: getWeighingDataRows(damaged).length, dayTotal: getWeighingDataRows(damagedAll).length },
    { label: 'Báo cáo sản lượng', matched: acceptance.length, dayTotal: acceptanceAll.length },
    { label: 'Phiếu giao ca', matched: shiftHandovers.length, dayTotal: shiftHandoversAll.length },
    { label: 'Phiếu cân tự động', matched: canTuDongRecords.length, dayTotal: canTuDongAll.length },
    { label: 'Phiếu xuất vật tư', matched: warehouseMovements.length, dayTotal: warehouseMovementsAll.length }
  ];

  return {
    productCatalog,
    materialCatalog,
    productionPlans,
    productionOrders,
    machineNvl,
    mixing,
    weighing,
    downtime,
    damaged,
    acceptance,
    acceptanceFilmKgByProductCode,
    shiftHandovers,
    canTuDong,
    warehouseExportSlips,
    warehouseInboundSlips,
    warehouseSlips,
    warehouseMovements,
    shiftOptions,
    totalReport,
    totalReportGiaiTrinh,
    isEmpty,
    errors,
    diagnostics
  };
}

function buildWarehouseExportSlips(
  rows: WarehouseMovementRow[],
  materials: WarehouseWeightCatalogItem[] = []
): WarehouseSlipPrintData[] {
  const map = new Map<string, WarehouseMovementRow[]>();
  const order: string[] = [];

  rows.forEach(row => {
    const key = row.slipCode || row.id;
    if (!key) return;
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
      order.push(key);
    }
    group.push(row);
  });

  return order
    .map(key => map.get(key)!)
    .filter(group => group.length > 0)
    .map(group => {
      const header = group[0];
      return {
        slipCode: header.slipCode,
        slipType: header.slipType === 'xuat' ? 'xuat' : 'nhap',
        warehouseKind: header.warehouseKind,
        slipDate: header.slipDate,
        reason: header.reason,
        note: header.note,
        createdBy: header.createdBy,
        shift: header.shift,
        warehouseName: header.warehouseName,
        totalAmount: group.reduce((sum, row) => sum + row.lineAmount, 0),
        lines: group.map(row => ({
          code: row.itemCode,
          name: row.itemName,
          unit: row.unit,
          quantity: row.quantity,
          documentQuantity: row.documentQuantity ?? null,
          unitPrice: row.unitPrice,
          lineAmount: row.lineAmount,
          weightKg: convertWarehouseQuantityToKg({
            quantity: row.quantity,
            unit: row.unit,
            itemCode: row.itemCode,
            warehouseKind: row.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl',
            materials,
            products: []
          })
        }))
      };
    });
}

function buildWeighingSlips(records: WeighingRecord[]): WeighingSlipPrintData[] {
  const dataRows = getWeighingDataRows(records);
  const map = new Map<string, WeighingSlipPrintData>();
  const order: string[] = [];

  dataRows.forEach(record => {
    const key = slipKey(record);
    let slip = map.get(key);
    if (!slip) {
      slip = {
        documentNo: record.documentNo,
        reportDate: record.reportDate,
        productionDate: record.productionDate,
        shiftName: record.shiftName,
        worker1: record.worker1,
        worker2: record.worker2,
        machineName: record.machineName,
        rows: []
      };
      map.set(key, slip);
      order.push(key);
    }
    slip.rows.push(record);
  });

  return order.map(key => map.get(key)!);
}

/**
 * Nội dung các phiếu liên quan (không bọc batch — parent gom chung với Lệnh SX).
 */
export function ProductionPlanRelatedPrintContent({ data }: { data: ProductionPlanRelatedReports }) {

  const nvlReports = data.machineNvl.map(savedReportToMachineNvlPrintReport);
  const nvlDauCaReports = nvlReports.filter(report => report.reportKind === 'dau_ca');
  const nvlCuoiCaReports = nvlReports.filter(report => report.reportKind === 'cuoi_ca');
  const mixingGroups = groupMixingReportsForPrint(data.mixing);
  const weighingSlips = buildWeighingSlips(data.weighing);
  // Hàng hỏng không nằm trong bộ phiếu Danh sách báo cáo đã chốt.
  const damagedSlips: WeighingSlipPrintData[] = [];
  const downtimeSlips = data.downtime.map(slip =>
    buildMachineDowntimePrintSlip({
      slipCode: slip.slipCode,
      date: slip.date,
      shift: slip.shift,
      machineCode: slip.machineCode,
      machineName: slip.machineName,
      preparedBy: slip.preparedBy,
      productionOrder: slip.productionOrder,
      note: slip.note,
      lines: slip.lines.map(line => ({
        startTime: line.startTime,
        restartTime: line.restartTime,
        reason: line.reason,
        rollsAffected: line.rollsAffected,
        confirmedBy: line.confirmedBy,
        note: line.note
      }))
    })
  );
  const acceptanceSlips = buildAcceptancePrintSlips(data.acceptance);
  const shiftHandoverSlips: ShiftHandoverPrintSlip[] = data.shiftHandovers.map(slipToPrintSlip);

  return (
    <>
      {data.productionPlans.map(plan => (
        <div key={`production-plan-${plan.id}`} className="production-order-print-page">
          <ProductionPlanPrintSheet
            lines={plan.lines}
            materialsByLine={{}}
            planDate={plan.planDate}
            planNote={plan.note}
          />
        </div>
      ))}

      {data.productionOrders.map(item => (
        <div key={`production-order-${item.order.id}`} className="production-order-print-page">
          <ProductionOrderPrintSheet
            order={item.order}
            materials={item.materials}
            machineLabel={item.machineLabel}
            product={item.product}
            productCatalog={data.productCatalog}
            showActualQuantity
            portal={false}
          />
        </div>
      ))}
      {/* 4. Phiếu xuất kho vật tư */}
      {data.warehouseExportSlips.length > 0 ? (
        <div className="production-order-print-page">
          <WarehouseSlipPrintBatch slips={data.warehouseExportSlips} />
        </div>
      ) : null}

      {/* 5. Bảng kiểm kê vật tư tồn đầu ca — mẫu gốc /bao-cao-may-nvl-ton */}
      {nvlDauCaReports.map((report, index) => (
        <div key={`nvl-dauca-${index}`} className="production-order-print-page">
          <MachineNvlPrintSheet report={report} />
        </div>
      ))}

      {/* 6. Bảng kiểm kê vật tư tồn cuối ca — mẫu gốc /bao-cao-may-nvl-ton */}

      {/* 6. Nhật kí trộn nguyên liệu */}
      {mixingGroups.map((group, index) => (
        <div key={`mixing-${index}`} className="production-order-print-page">
          <MixingReportPrintSheet reports={group} context={buildMixingReportPrintContext(group)} />
        </div>
      ))}

      {nvlCuoiCaReports.map((report, index) => (
        <div key={`nvl-cuoica-${index}`} className="production-order-print-page">
          <MachineNvlPrintSheet report={report} />
        </div>
      ))}

      {acceptanceSlips.map((slip, index) => (
        <div key={`acceptance-ordered-${index}`} className="production-order-print-page">
          <AcceptanceReportPrintSheet
            slip={slip}
            filmKgByProductCode={data.acceptanceFilmKgByProductCode}
          />
        </div>
      ))}

      {/* 7. Phiếu cân kiểm tra */}
      {weighingSlips.map((slip, index) => (
        <div key={`weighing-${index}`} className="production-order-print-page">
          <WeighingSlipPrintSheet slip={slip} title="PHIẾU CÂN CA" />
        </div>
      ))}

      {/* Phiếu cân tự động — tái dùng đúng mẫu in của /can-tu-dong */}
      {data.canTuDong ? (
        <div className="production-order-print-page">
          <CanTuDongPrintSheet data={data.canTuDong} />
        </div>
      ) : null}

      {data.warehouseInboundSlips.length > 0 ? (
        <div className="production-order-print-page">
          <WarehouseSlipPrintBatch slips={data.warehouseInboundSlips} />
        </div>
      ) : null}

      {/* 9. Nhật ký sản xuất kiêm phiếu giao ca */}
      {shiftHandoverSlips.map((slip, index) => (
        <div key={`shift-handover-${slip.slipCode}-${index}`} className="production-order-print-page shift-print-v2-page">
          <ShiftHandoverPrintSheetV2 slip={slip} />
        </div>
      ))}

      {data.totalReport ? (
        <ControlBoardBbMachineReportPrintBatch
          orderGroups={data.totalReport.orderGroups}
          exportGroups={data.totalReport.exportGroups}
          dauCaGroups={data.totalReport.dauCaGroups}
          cuoiCaGroups={data.totalReport.cuoiCaGroups}
          damagedGroups={data.totalReport.damagedGroups}
          mixingGroups={data.totalReport.mixingGroups}
          danhGiaGroups={data.totalReport.danhGiaGroups}
          inboundRows={data.totalReport.inboundRows}
          acceptanceReports={data.acceptance}
          products={data.productCatalog}
          materials={data.materialCatalog}
          phanTichMap={{}}
          sanLuongSource="can-tu-dong"
          sanLuongGroups={data.totalReport.sanLuongGroups}
          machineReportLabel={data.totalReport.orderGroups[0]?.machine || 'máy BB'}
          warehouseMovements={data.warehouseMovements}
          warehouseMovementsByDate={data.warehouseMovements}
          shiftSettings={data.shiftOptions}
        />
      ) : null}

      {data.totalReportGiaiTrinh ? (
        <div className="production-order-print-page">
          <BbGiaiTrinhPrintSheet report={data.totalReportGiaiTrinh} />
        </div>
      ) : null}

      {/* 10. Phiếu báo dừng máy */}
      {/* 12. Báo cáo hàng hỏng */}
      {damagedSlips.map((slip, index) => (
        <div key={`damaged-${index}`} className="production-order-print-page">
          <WeighingSlipPrintSheet
            slip={slip}
            title="BÁO CÁO HÀNG HỎNG"
            layout={{ hideProductFields: true, splitPlasticFilmWeights: true }}
          />
        </div>
      ))}

      {/* 13. Bảng kiểm kê vật tư cuối ca */}
    </>
  );
}
