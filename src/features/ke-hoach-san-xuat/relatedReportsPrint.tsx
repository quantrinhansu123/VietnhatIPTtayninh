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
import { AcceptanceReportPrintSheet, buildAcceptancePrintSlips } from '../../components/AcceptanceReportPrintSheet';
import {
  WarehouseSlipPrintSheet,
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
  machineNvl: MachineNvlSavedReport[];
  mixing: MixingReport[];
  weighing: WeighingRecord[];
  downtime: MachineDowntimeSlip[];
  damaged: WeighingRecord[];
  acceptance: AcceptanceReport[];
  warehouseSlips: WarehouseSlipPrintData[];
  isEmpty: boolean;
  errors: string[];
  diagnostics: ProductionPlanReportDiagnostic[];
};

function addShiftToken(tokens: Set<string>, value: string) {
  const trimmed = value.trim();
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

function normalizeProductKey(value: string) {
  return normalizeProductCodeKey(value || '');
}

function addAcceptanceProductNamesForPrint(reports: AcceptanceReport[], productCatalog: ProductRow[]) {
  const productNameByCode = new Map<string, string>();
  productCatalog.forEach(product => {
    const key = normalizeProductKey(product.code);
    if (!key) return;
    if (!productNameByCode.has(key)) productNameByCode.set(key, product.name || '');
  });

  return reports.map(report => {
    const product = findProductByCode(productCatalog, report.mat_hang || '');
    const fallbackName = product?.name || '';
    return {
      ...report,
      ten_sp: report.ten_sp || productNameByCode.get(normalizeProductKey(report.mat_hang)) || fallbackName
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

  const [nvlRes, mixingRes, weighingRes, downtimeRes, damagedRes, acceptanceRes, warehouseRes, materialCatalogRes] =
    await Promise.all([
      fetchJson(`/api/bao-cao-may-nvl-ton?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-phoi-tron?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-can-dinh-ki?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-bao-dung-may?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-hang-hong?ngay=${encodedDate}`),
      fetchJson(`/api/bao-cao-nghiem-thu?ngay=${encodedDate}`),
      fetchJson(`/api/phieu-xuat-nhap-kho?loai=xuat&loai_kho=nvl&from=${encodedDate}&to=${encodedDate}`),
      fetchJson('/api/kho-nvl')
    ]);

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
  const acceptanceAll = productCatalog.length > 0 ? addAcceptanceProductNamesForPrint(acceptanceAllRaw, productCatalog) : acceptanceAllRaw;
  const acceptance = acceptanceAll.filter(report =>
    shouldIncludeRelatedReport(report.ca, shifts, shiftOptions)
  );
  if (!acceptanceRes.ok) errors.push('Báo cáo sản lượng');

  const warehouseMovementsAll = warehouseRes.ok ? normalizeWarehouseMovements(warehouseRes.data) : [];
  const warehouseMovements = warehouseMovementsAll.filter(row =>
    shouldIncludeRelatedReport(row.shift, shifts, shiftOptions)
  );
  if (!warehouseRes.ok) errors.push('Phiếu xuất vật tư');
  const materialWeightCatalog = materialCatalogRes.ok
    ? normalizeMaterialsInventory(materialCatalogRes.data).map(mapMaterialToWeightCatalogItem)
    : [];
  const warehouseSlips = buildWarehouseExportSlips(warehouseMovements, materialWeightCatalog);

  const isEmpty =
    machineNvl.length === 0 &&
    mixing.length === 0 &&
    getWeighingDataRows(weighing).length === 0 &&
    downtime.length === 0 &&
    getWeighingDataRows(damaged).length === 0 &&
    acceptance.length === 0 &&
    warehouseSlips.length === 0;

  const diagnostics: ProductionPlanReportDiagnostic[] = [
    { label: 'Báo cáo tồn NVL', matched: machineNvl.length, dayTotal: machineNvlAll.length },
    { label: 'Trộn nguyên vật liệu', matched: mixing.length, dayTotal: mixingAll.length },
    { label: 'Phiếu cân', matched: getWeighingDataRows(weighing).length, dayTotal: getWeighingDataRows(weighingAll).length },
    { label: 'Phiếu báo dừng máy', matched: downtime.length, dayTotal: downtimeAll.length },
    { label: 'Báo cáo hàng hỏng', matched: getWeighingDataRows(damaged).length, dayTotal: getWeighingDataRows(damagedAll).length },
    { label: 'Báo cáo sản lượng', matched: acceptance.length, dayTotal: acceptanceAll.length },
    { label: 'Phiếu xuất vật tư', matched: warehouseMovements.length, dayTotal: warehouseMovementsAll.length }
  ];

  return { machineNvl, mixing, weighing, downtime, damaged, acceptance, warehouseSlips, isEmpty, errors, diagnostics };
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
  const damagedSlips = buildWeighingSlips(data.damaged);
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

  return (
    <>
      {/* 4. Phiếu xuất kho vật tư */}
      {data.warehouseSlips.map((slip, index) => (
        <div key={`warehouse-${slip.slipCode || index}`} className="production-order-print-page">
          <WarehouseSlipPrintSheet data={slip} />
        </div>
      ))}

      {/* 5. Bảng kiểm kê vật tư tồn đầu ca */}
      {nvlDauCaReports.map((report, index) => (
        <div key={`nvl-dauca-${index}`} className="production-order-print-page">
          <MachineNvlPrintSheet report={report} />
        </div>
      ))}

      {/* 6. Nhật kí trộn nguyên liệu */}
      {mixingGroups.map((group, index) => (
        <div key={`mixing-${index}`} className="production-order-print-page">
          <MixingReportPrintSheet reports={group} context={buildMixingReportPrintContext(group)} />
        </div>
      ))}

      {/* 7. Phiếu cân kiểm tra */}
      {weighingSlips.map((slip, index) => (
        <div key={`weighing-${index}`} className="production-order-print-page">
          <WeighingSlipPrintSheet slip={slip} title="PHIẾU CÂN CA" />
        </div>
      ))}

      {/* 8. Báo cáo sản lượng */}
      {acceptanceSlips.map((slip, index) => (
        <div key={`acceptance-${index}`} className="production-order-print-page">
          <AcceptanceReportPrintSheet slip={slip} />
        </div>
      ))}

      {/* 10. Phiếu báo dừng máy */}
      {downtimeSlips.map((slip, index) => (
        <div key={`downtime-${index}`} className="production-order-print-page">
          <MachineDowntimePrintSheet slip={slip} />
        </div>
      ))}

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
      {nvlCuoiCaReports.map((report, index) => (
        <div key={`nvl-cuoica-${index}`} className="production-order-print-page">
          <MachineNvlPrintSheet report={report} />
        </div>
      ))}
    </>
  );
}
