import React from 'react';
import { formatMoney, formatNumber } from '../utils';
import {
  computeMaterialUsageKg,
  isWarehousePlasticNvlLine,
  machineValueMatchesFilter
} from '../utils/controlBoardShiftSummary';
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';
import type { MaterialRow } from '../features/kho-nvl';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { parseProductionOrderFilterDate } from '../features/cai-dat-thoi-gian';
import { shiftNamesMatch } from '../utils/shiftSettings';
import {
  convertWarehouseQuantityToKg,
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem
} from '../utils/warehouseWeight';
import {
  buildBbMaterialKgMapsFromTabLines,
  isBbMachineText,
  isNnsTronMaterial,
  lookupBbMaterialKgByCodeOrName,
  lookupNnsTronTonDauKg,
  type BbCuoiCaGroup,
  type BbDamagedGoodsGroup,
  type BbDanhGiaHaoHutGroup,
  type BbDauCaGroup,
  type BbInboundReportRow,
  type BbMixingRatioGroup,
  type BbProductionOrderGroup,
  type BbWarehouseExportGroup
} from '../utils/controlBoardBbMachineReport';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import {
  collectCanTuDongProductMatchKeys,
  filterCanTuDongRecordsForBoard,
  sumCanTuDongSanLuongTotals,
  sumCanTuDongThucTeTotals
} from '../utils/canTuDongWeights';
import { printLyDoLineKey } from '../utils/bbBaoCaoLyDo';

type PrintProps = {
  orderGroups: BbProductionOrderGroup[];
  exportGroups: BbWarehouseExportGroup[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaGroups: BbCuoiCaGroup[];
  damagedGroups: BbDamagedGoodsGroup[];
  mixingGroups: BbMixingRatioGroup[];
  danhGiaGroups: BbDanhGiaHaoHutGroup[];
  inboundRows: BbInboundReportRow[];
  acceptanceReports: AcceptanceReport[];
  products: ProductRow[];
  materials: MaterialRow[];
  phanTichMap: Record<string, string>;
  noteByOrder?: Record<string, string>;
  /**
   * Lý do giải trình theo từng dòng SP.
   * Key: `${order.groupKey}::${line.key}`
   */
  lyDoByLine?: Record<string, string>;
  /** Cho phép gõ lý do trên màn xem trước (trước khi in). */
  editableLyDo?: boolean;
  onLyDoChange?: (lineKey: string, value: string) => void;
  /** Cùng nguồn thẻ Báo cáo sản lượng trên bảng điều khiển. */
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  canTuDongRecords?: CanTuDongRecord[];
};

type MaterialPrintRow = {
  key: string;
  code: string;
  name: string;
  unit: string;
  normPercents: number[];
  actualPercent: number | null;
  actualMixedKg: number;
  openingKg: number;
  exportKg: number;
  /** SL xuất từ phiếu xuất NVL (ĐVT gốc, dùng mục 3.2 Cái). */
  exportQty: number;
  /** SL thực tế = SL báo cáo sản lượng × định mức theo cái (mục 3.2). */
  actualQty: number;
  finishedKg: number;
  damagedKg: number;
  closingKg: number;
};

type MaterialPrintTotals = {
  openingKg: number;
  exportKg: number;
  finishedKg: number;
  damagedKg: number;
  closingKg: number;
  actualUsedKg: number;
  finishedAndDamagedKg: number;
  varianceKg: number;
};

/** Khớp footer phiếu xuất: nhựa = ĐVT kg; vật tư khác = ĐVT ≠ kg. */
function isPlasticMaterialPrintRow(row: Pick<MaterialPrintRow, 'unit'>) {
  const unit = String(row.unit || '').trim();
  return !unit || unit === '-' || isWarehouseKgUnit(unit);
}

function sumMaterialPrintTotals(
  rows: Array<{
    openingKg: number;
    exportKg: number;
    finishedKg: number;
    damagedKg: number;
    closingKg: number;
  }>
): MaterialPrintTotals {
  const totals: MaterialPrintTotals = {
    openingKg: 0,
    exportKg: 0,
    finishedKg: 0,
    damagedKg: 0,
    closingKg: 0,
    actualUsedKg: 0,
    finishedAndDamagedKg: 0,
    varianceKg: 0
  };
  for (const row of rows) {
    const actualUsedKg = computeMaterialUsageKg(row.exportKg, row.openingKg, row.closingKg);
    const finishedAndDamagedKg = row.finishedKg + row.damagedKg;
    totals.openingKg += row.openingKg;
    totals.exportKg += row.exportKg;
    totals.finishedKg += row.finishedKg;
    totals.damagedKg += row.damagedKg;
    totals.closingKg += row.closingKg;
    totals.actualUsedKg += actualUsedKg;
    totals.finishedAndDamagedKg += finishedAndDamagedKg;
    totals.varianceKg += actualUsedKg - finishedAndDamagedKg;
  }
  return totals;
}

function renderMaterialPrintTotalRow(label: string, totals: MaterialPrintTotals) {
  return (
    <tr className="shift-summary-print-total-row">
      <td colSpan={3} className="shift-summary-print-total-label">
        {label}
      </td>
      <td className="shift-summary-print-num">&nbsp;</td>
      <td className="shift-summary-print-num">&nbsp;</td>
      <td className="shift-summary-print-num">{printNumber(totals.openingKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.exportKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.finishedKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.damagedKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.closingKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.actualUsedKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.finishedAndDamagedKg, 2)}</td>
      <td className="shift-summary-print-num">{printNumber(totals.varianceKg, 2)}</td>
    </tr>
  );
}

function formatDate(value: string) {
  const iso = parseProductionOrderFilterDate(value) || value;
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value || '-';
}

function printNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return formatNumber(value, digits);
}

function printPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${formatNumber(value, 2)}%`;
}

function groupMatchesOrder(groupOrderCode: string, orderCode: string) {
  const target = orderCode.trim().toUpperCase();
  return groupOrderCode
    .split(',')
    .map(code => code.trim().toUpperCase())
    .some(code => code === target);
}

function findOrderGroup<T extends { orderCode: string; groupKey?: string }>(
  groups: T[],
  order: { orderCode: string; groupKey?: string } | string
) {
  if (typeof order === 'string') {
    return groups.find(group => groupMatchesOrder(group.orderCode, order));
  }
  if (order.groupKey) {
    const byKey = groups.find(group => group.groupKey === order.groupKey);
    if (byKey) return byKey;
  }
  return groups.find(group => groupMatchesOrder(group.orderCode, order.orderCode));
}

/** Gom mọi group khớp lệnh (ưu tiên cùng groupKey) — dùng cho tồn đầu/cuối ca. */
function findOrderGroups<T extends { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }>(
  groups: T[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
) {
  if (order.groupKey) {
    const byKey = groups.filter(group => group.groupKey === order.groupKey);
    if (byKey.length > 0) return byKey;
  }
  const byOrder = groups.filter(group => groupMatchesOrder(group.orderCode, order.orderCode));
  if (byOrder.length > 0) return byOrder;

  // Fallback: cùng ngày + ca (+ máy nếu có) khi báo cáo tồn chưa gắn đúng mã lệnh
  if (order.ngay && order.shift) {
    return groups.filter(group => {
      if (group.ngay && group.ngay !== order.ngay) return false;
      if (group.shift && !shiftNamesMatch(group.shift, order.shift)) return false;
      if (order.machine && group.machine) {
        const orderMachine = normalizeProductCodeKey(order.machine);
        const groupMachine = normalizeProductCodeKey(group.machine);
        if (
          orderMachine &&
          groupMachine &&
          orderMachine !== groupMachine &&
          !orderMachine.includes(groupMachine) &&
          !groupMachine.includes(orderMachine)
        ) {
          return false;
        }
      }
      return true;
    });
  }
  return [];
}

function findProduct(products: ProductRow[], code: string) {
  const key = normalizeProductCodeKey(code);
  return products.find(product => normalizeProductCodeKey(product.code) === key) ?? null;
}

function acceptanceReportMatchesProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  report: AcceptanceReport
) {
  const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
  if (reportDate !== order.ngay || !shiftNamesMatch(report.ca, order.shift)) return false;
  // Khớp máy BB với lệnh — tránh cộng nhầm sản lượng máy khác cùng ngày/ca.
  if (
    !machineValueMatchesFilter(order.machine, null, report.ma_may, report.ten_may) &&
    !(isBbMachineText(order.machine) && isBbMachineText(report.ma_may, report.ten_may))
  ) {
    return false;
  }
  const codeKey = normalizeProductCodeKey(productCode);
  const nameKey = normalizeProductCodeKey(productName);
  const itemKey = normalizeProductCodeKey(report.mat_hang);
  return (
    (Boolean(codeKey) && (itemKey === codeKey || itemKey.includes(codeKey) || codeKey.includes(itemKey))) ||
    (Boolean(nameKey) && (itemKey === nameKey || itemKey.includes(nameKey) || nameKey.includes(itemKey)))
  );
}

function acceptanceQuantityForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  reports: AcceptanceReport[]
) {
  return reports.reduce((sum, report) => {
    if (!acceptanceReportMatchesProduct(order, productCode, productName, report)) return sum;
    return sum + (Number.isFinite(report.so_luong) ? Number(report.so_luong) : 0);
  }, 0);
}

/** Tổng `trong_luong` (kg nhựa/TP) trên nghiệm thu — cùng hướng thẻ «Trọng lượng». */
function acceptanceWeightForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  reports: AcceptanceReport[]
) {
  return reports.reduce((sum, report) => {
    if (!acceptanceReportMatchesProduct(order, productCode, productName, report)) return sum;
    const weight = Number(report.trong_luong);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);
}

function canTuDongActualForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  records: CanTuDongRecord[],
  products: ProductRow[]
) {
  const productKeys = collectCanTuDongProductMatchKeys([{ productCode, productName }], products);
  const scoped = filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }],
    productCodeKeys: productKeys
  });
  return sumCanTuDongSanLuongTotals(scoped);
}

function canTuDongActualForOrder(order: BbProductionOrderGroup, records: CanTuDongRecord[]) {
  const scoped = filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
  });
  return sumCanTuDongSanLuongTotals(scoped);
}

/** «Trọng lượng thực tế» (Cân sản phẩm — chưa trừ lõi/bì), cùng nguồn cột «Trọng lượng TT» ở trang Cân tự động. */
function canTuDongThucTeForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  records: CanTuDongRecord[],
  products: ProductRow[]
) {
  const productKeys = collectCanTuDongProductMatchKeys([{ productCode, productName }], products);
  const scoped = filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }],
    productCodeKeys: productKeys
  });
  return sumCanTuDongThucTeTotals(scoped);
}

function canTuDongThucTeForOrder(order: BbProductionOrderGroup, records: CanTuDongRecord[]) {
  const scoped = filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
  });
  return sumCanTuDongThucTeTotals(scoped);
}

function resolveActualQuantityForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
) {
  if (props.sanLuongSource === 'can-tu-dong') {
    return canTuDongActualForProduct(
      order,
      productCode,
      productName,
      props.canTuDongRecords || [],
      props.products
    ).quantity;
  }
  return acceptanceQuantityForProduct(order, productCode, productName, props.acceptanceReports);
}

/** Cùng số «Trọng lượng nhựa / Trọng lượng» trên ô Báo cáo sản lượng (theo lệnh). */
function resolveOrderSanLuongPlasticKg(order: BbProductionOrderGroup, props: PrintProps): number {
  if (props.sanLuongSource === 'can-tu-dong') {
    const totals = canTuDongActualForOrder(order, props.canTuDongRecords || []);
    return totals.weightKg > 0 ? totals.weightKg : 0;
  }
  let total = 0;
  for (const line of order.lines) {
    total += acceptanceWeightForProduct(
      order,
      line.productCode,
      line.productName,
      props.acceptanceReports
    );
  }
  return total > 0 ? total : 0;
}

function buildMaterialRows(order: BbProductionOrderGroup, props: PrintProps) {
  const rows = new Map<string, MaterialPrintRow>();
  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  const ensure = (code: string, name: string, unit = 'kg') => {
    const key = normalizeProductCodeKey(code || name) || `${rows.size}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        code,
        name: name || code,
        unit: unit || 'kg',
        normPercents: [],
        actualPercent: null,
        actualMixedKg: 0,
        openingKg: 0,
        exportKg: 0,
        exportQty: 0,
        actualQty: 0,
        finishedKg: 0,
        damagedKg: 0,
        closingKg: 0
      };
      rows.set(key, row);
    }
    return row;
  };

  const materialsCatalog = props.materials.map(mapMaterialToWeightCatalogItem);
  for (const productLine of order.lines) {
    const product = findProduct(props.products, productLine.productCode);
    const actualProductQuantity = resolveActualQuantityForProduct(
      order,
      productLine.productCode,
      productLine.productName,
      props
    );
    for (const item of product?.nplItems || []) {
      const row = ensure(item.code, item.name, item.amountType === 'percent' ? 'kg' : item.unit);
      if (item.amountType === 'percent' && item.percent !== null) row.normPercents.push(item.percent);
      if (item.amountType === 'percent') {
        const unitNormKg = productLine.normKgPerUnit;
        if (unitNormKg !== null && unitNormKg > 0 && actualProductQuantity > 0) {
          row.finishedKg += unitNormKg * actualProductQuantity * (Math.max(0, item.percent ?? 0) / 100);
        }
      } else {
        const rawQuantity = Math.max(0, item.quantity ?? 0) * actualProductQuantity;
        const unit = String(item.unit || '').trim();
        if (rawQuantity > 0) {
          if (!unit || unit === '-' || isWarehouseKgUnit(unit)) {
            row.finishedKg += rawQuantity;
          } else {
            // Mục 3.2: SL thực tế = SL sản lượng × định mức theo cái (giữ ĐVT gốc).
            row.actualQty += rawQuantity;
            const converted = convertWarehouseQuantityToKg({
              quantity: rawQuantity,
              unit,
              itemCode: item.code,
              warehouseKind: 'nvl',
              materials: materialsCatalog
            });
            if (converted !== null && Number.isFinite(converted)) row.finishedKg += converted;
          }
        }
      }
    }
  }

  const exportGroup = findOrderGroup(props.exportGroups, order);
  // Mỗi dòng phiếu xuất chỉ cộng 1 lần (tránh nhân khi phân bổ nhiều SP).
  const seenExportSlipKeys = new Set<string>();
  for (const line of exportGroup?.lines || []) {
    const row = ensure(line.itemCode, line.itemName, line.unit);
    const slipId = String(line.slipLineKey || line.key || '').trim();
    const isFirstSlipHit = !slipId || !seenExportSlipKeys.has(slipId);
    if (slipId) seenExportSlipKeys.add(slipId);

    // KL xuất (kg): các phần phân bổ theo SP cộng lại = tổng phiếu → cộng mọi dòng.
    row.exportKg += line.weightKg || 0;
    // SL xuất (Cái…): dòng ≠ kg thường copy nguyên SL phiếu cho mỗi SP → chỉ cộng 1 lần / slipLineKey.
    if (isFirstSlipHit) {
      row.exportQty += line.quantity > 0 ? line.quantity : 0;
    }
  }
  const openingGroups = findOrderGroups(props.dauCaGroups, order);
  const openingLines = openingGroups.flatMap(group => group.lines);
  const tonDauMaps = buildBbMaterialKgMapsFromTabLines(openingLines);
  const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonDauMaps);
  for (const line of openingLines) {
    ensure(line.itemCode, line.itemName, line.unit).openingKg += line.weightKg > 0 ? line.weightKg : 0;
  }
  const closingGroups = findOrderGroups(props.cuoiCaGroups, order);
  const closingLines = closingGroups.flatMap(group => group.lines);
  const closingMaterialLines = closingGroups.flatMap(group => group.materialLines || []);
  const tonCuoiMaps = buildBbMaterialKgMapsFromTabLines(closingLines);
  const nnsTronTonCuoiKg = lookupNnsTronTonDauKg(tonCuoiMaps);
  const damagedGroup = findOrderGroup(props.damagedGroups, order);
  for (const line of damagedGroup?.lines || []) {
    ensure(line.materialCode, line.materialName, line.unit || 'kg').damagedKg += line.weightKg || 0;
  }
  const mixingGroup = findOrderGroup(props.mixingGroups, order);
  for (const line of mixingGroup?.lines || []) {
    const row = ensure(line.materialCode, line.materialName, 'kg');
    if (line.tiLeDinhMucPercent !== null) row.normPercents.push(line.tiLeDinhMucPercent);
    row.actualPercent = line.tiLeThucTeTbPercent;
    row.actualMixedKg += line.totalKlThucTe;
  }

  // Nếu có NNS-TRON tồn đầu ca (hỗn hợp chưa tách), phân bổ tồn đầu của NNS-TRON cho từng NVL
  // theo "Tỉ lệ trộn Thực tế" (phiếu trộn ca hiện tại) — khớp logic tab thực dùng.
  if (nnsTronTonDauKg > 0) {
    for (const row of rows.values()) {
      if (isNnsTronMaterial(row.code, row.name)) continue;
      const tiLeThucTe = row.actualPercent;
      if (tiLeThucTe !== null && Number.isFinite(tiLeThucTe) && tiLeThucTe > 0) {
        row.openingKg = round4(nnsTronTonDauKg * (tiLeThucTe / 100));
      }
    }
  }

  // TL cuối ca ← tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» / Báo cáo cuối ca.
  // Ưu tiên materialLines (đã phân bổ NNS-TRON × tỉ lệ ĐM giống UI tab).
  if (closingMaterialLines.length > 0) {
    for (const row of rows.values()) {
      row.closingKg = 0;
    }
    for (const line of closingMaterialLines) {
      const kg = line.tonDauWeightKg;
      if (!(kg > 0)) continue;
      ensure(line.itemCode, line.itemName, line.unit || 'kg').closingKg += kg;
    }
  } else {
    for (const row of rows.values()) {
      row.closingKg = lookupBbMaterialKgByCodeOrName(tonCuoiMaps, row.code, row.name);
    }
    for (const line of closingLines) {
      const row = ensure(line.itemCode, line.itemName, line.unit);
      row.closingKg = lookupBbMaterialKgByCodeOrName(tonCuoiMaps, line.itemCode, line.itemName);
    }
    // Báo cáo cuối ca thường ghi NNS-TRON tổng — phân bổ như tồn đầu.
    if (nnsTronTonCuoiKg > 0) {
      for (const row of rows.values()) {
        if (isNnsTronMaterial(row.code, row.name)) continue;
        const fromActual =
          row.actualPercent !== null && Number.isFinite(row.actualPercent) && row.actualPercent > 0
            ? row.actualPercent
            : null;
        const fromNorm =
          row.normPercents.length > 0
            ? row.normPercents.reduce((sum, value) => sum + value, 0) / row.normPercents.length
            : null;
        const tiLe = fromActual ?? fromNorm;
        if (tiLe !== null && Number.isFinite(tiLe) && tiLe > 0) {
          row.closingKg = round4(nnsTronTonCuoiKg * (tiLe / 100));
        }
      }
    }
  }

  const result = [...rows.values()]
    .filter(
      row =>
        !(
          isNnsTronMaterial(row.code, row.name) &&
          (nnsTronTonDauKg > 0 || nnsTronTonCuoiKg > 0 || closingMaterialLines.length > 0)
        )
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  // Căn cột «Trọng lượng vật tư nhập thành phẩm» (nhóm nhựa) theo ô Báo cáo sản lượng phía trên.
  const sanLuongPlasticKg = resolveOrderSanLuongPlasticKg(order, props);
  if (sanLuongPlasticKg > 0) {
    const plasticRows = result.filter(row =>
      isWarehousePlasticNvlLine({
        warehouseKind: 'nvl',
        itemCode: row.code,
        itemName: row.name,
        unit: row.unit
      })
    );
    const plasticSum = plasticRows.reduce(
      (sum, row) => sum + (row.finishedKg > 0 ? row.finishedKg : 0),
      0
    );
    if (plasticSum > 0) {
      const scale = sanLuongPlasticKg / plasticSum;
      for (const row of plasticRows) {
        if (row.finishedKg > 0) row.finishedKg = round4(row.finishedKg * scale);
      }
    } else {
      // Không có ĐM % để chia: gán toàn bộ TL nhựa sản lượng vào dòng nhựa đầu tiên (nếu có).
      const target = plasticRows[0];
      if (target) target.finishedKg = round4(sanLuongPlasticKg);
    }
  }

  return result;
}

function BbMachineOrderPrintSheet({ order, props }: { order: BbProductionOrderGroup; props: PrintProps }) {
  const inbound = findOrderGroup(props.inboundRows, order);
  const evaluation = findOrderGroup(props.danhGiaGroups, order);
  const ghiChu = (props.noteByOrder?.[order.groupKey] || '').trim();
  const materialRows = buildMaterialRows(order, props);
  const sortByUnitThenName = (
    a: (typeof materialRows)[number],
    b: (typeof materialRows)[number]
  ) => {
    const unitA = String(a.unit || 'kg').trim();
    const unitB = String(b.unit || 'kg').trim();
    const unitCmp = unitA.localeCompare(unitB, 'vi', { sensitivity: 'base' });
    if (unitCmp !== 0) return unitCmp;
    const nameCmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    if (nameCmp !== 0) return nameCmp;
    return String(a.code || '').localeCompare(String(b.code || ''), 'vi');
  };
  /** 3.1: ĐVT kg lên đầu; 3.2: các ĐVT khác (Cái…), cùng đơn vị cạnh nhau. */
  const plasticMaterialRows = materialRows.filter(isPlasticMaterialPrintRow).sort(sortByUnitThenName);
  const otherMaterialRows = materialRows.filter(row => !isPlasticMaterialPrintRow(row)).sort(sortByUnitThenName);
  const plasticMaterialTotals = sumMaterialPrintTotals(plasticMaterialRows);
  const useCanTuDong = props.sanLuongSource === 'can-tu-dong';
  const qtyDigits = useCanTuDong ? 0 : 2;
  const editableLyDo = Boolean(props.editableLyDo && props.onLyDoChange);
  const productRows = order.lines.map(line => {
    if (useCanTuDong) {
      const actual = canTuDongActualForProduct(
        order,
        line.productCode,
        line.productName,
        props.canTuDongRecords || [],
        props.products
      );
      const thucTe = canTuDongThucTeForProduct(
        order,
        line.productCode,
        line.productName,
        props.canTuDongRecords || [],
        props.products
      );
      return {
        ...line,
        actualQuantity: actual.quantity,
        actualWeight: thucTe.weightKg > 0 ? thucTe.weightKg : null,
        requiredWeight: line.totalNormKg
      };
    }
    const actualQuantity = acceptanceQuantityForProduct(
      order,
      line.productCode,
      line.productName,
      props.acceptanceReports
    );
    const weightFromReports = acceptanceWeightForProduct(
      order,
      line.productCode,
      line.productName,
      props.acceptanceReports
    );
    const actualWeight =
      weightFromReports > 0
        ? weightFromReports
        : line.normKgPerUnit !== null
          ? actualQuantity * line.normKgPerUnit
          : null;
    return { ...line, actualQuantity, actualWeight, requiredWeight: line.totalNormKg };
  });
  const requiredQtyTotal = productRows.reduce((sum, row) => sum + row.quantity, 0);
  const requiredWeightTotal = productRows.reduce((sum, row) => sum + (row.requiredWeight || 0), 0);
  const lineActualQtyTotal = productRows.reduce((sum, row) => sum + row.actualQuantity, 0);
  const lineActualWeightTotal = productRows.reduce((sum, row) => sum + (row.actualWeight || 0), 0);
  // Cân tự động: tổng = mọi lần cân ngày/ca/máy lệnh (cùng thẻ SỐ SP / TL nhựa khi 1 lệnh khớp bộ lọc).
  const orderCanTuDongTotals = useCanTuDong
    ? canTuDongActualForOrder(order, props.canTuDongRecords || [])
    : null;
  // Trọng lượng thực tế = cột «Trọng lượng TT» (Cân sản phẩm) ở trang Cân tự động, không phải TL nhựa.
  const orderCanTuDongThucTeTotals = useCanTuDong
    ? canTuDongThucTeForOrder(order, props.canTuDongRecords || [])
    : null;
  const actualQtyTotal =
    orderCanTuDongTotals?.quantity ??
    (lineActualQtyTotal || inbound?.acceptedRolls || 0);
  const actualWeightTotal = useCanTuDong
    ? orderCanTuDongThucTeTotals && orderCanTuDongThucTeTotals.weightKg > 0
      ? orderCanTuDongThucTeTotals.weightKg
      : lineActualWeightTotal
    : inbound?.finishedGoodsInboundKg && inbound.finishedGoodsInboundKg > 0
      ? inbound.finishedGoodsInboundKg
      : lineActualWeightTotal;
  const damagedQuantity = evaluation
    ? evaluation.soLuongNhuaLoiHong + evaluation.soLuongMangLoiHong + evaluation.soLuongLoiLoiHong
    : 0;
  const damagedMoney = evaluation
    ? evaluation.giaTriNhuaLoiHong + evaluation.giaTriMangLoiHong + evaluation.giaTriLoiLoiHong
    : 0;
  const unitPrice = (money: number | undefined, quantity: number | undefined) =>
    money !== undefined && quantity !== undefined && quantity !== 0
      ? Math.abs(money / quantity)
      : null;

  return (
    <div className="production-order-print-sheet shift-summary-print-sheet bb-machine-report-print-sheet">
      <div className="production-order-print-doc shift-summary-print-doc bb-machine-report-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
          <span className="bb-machine-report-print-header-spacer" aria-hidden="true" />
        </header>

        <h1 className="production-order-print-title">BÁO CÁO KẾT QUẢ THEO TỪNG LỆNH SẢN XUẤT</h1>
        <p className="bb-machine-report-print-subtitle">(Báo cáo tổng hợp máy BB)</p>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">1. THÔNG TIN CHUNG</h2>
          <table className="shift-summary-print-table bb-machine-report-print-info">
            <tbody>
              <tr>
                <th>Số lệnh</th><td>{order.orderCode || '-'}</td>
                <th>Ngày làm việc</th><td>{formatDate(order.ngay)}</td>
                <th>Máy sản xuất</th><td>{order.machine || '-'}</td>
              </tr>
              <tr>
                <th>Ca</th><td>{order.shiftLabel || order.shift || '-'}</td>
                <th>CN chính máy</th><td>{order.staffMain || '-'}</td>
                <th>CN phụ máy</th><td>{order.staffAssistant || '-'}</td>
              </tr>
              <tr>
                <th>CN hỗ trợ việc</th><td colSpan={5}>{order.staffSupport || '-'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">2. BÁO CÁO THÀNH PHẨM ĐẠT NHẬP KHO</h2>
          <table className="shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-product-table bb-finished-goods-print-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>ĐVT</th>
                <th>Số lượng yêu cầu</th>
                <th>Trọng lượng yêu cầu</th>
                <th>Số lượng đạt</th>
                <th>Trọng lượng thực tế</th>
                <th>Tỉ lệ SL đạt/SL kế hoạch</th>
                <th>Máy sản xuất BB</th>
                <th>Lý do sản phát sinh thêm hoặc không đạt kế hoạch</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map(row => {
                const ratio =
                  row.quantity > 0 ? (row.actualQuantity / row.quantity) * 100 : null;
                const lineLyDoKey = printLyDoLineKey(order.groupKey, row.key);
                const lineLyDo = props.lyDoByLine?.[lineLyDoKey] ?? '';
                return (
                  <tr key={row.key}>
                    <td>{row.productCode || ''}</td>
                    <td>{row.productName || ''}</td>
                    <td className="shift-summary-print-center">{row.unit || ''}</td>
                    <td className="shift-summary-print-num">{printNumber(row.quantity, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.requiredWeight, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.actualQuantity, qtyDigits)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.actualWeight, 2)}</td>
                    <td className="shift-summary-print-num">
                      {ratio === null || !Number.isFinite(ratio)
                        ? ''
                        : `${formatNumber(Math.round(ratio), 0)}%`}
                    </td>
                    <td className="shift-summary-print-center">{row.machine || order.machine || ''}</td>
                    <td className="bb-machine-report-print-ly-do">
                      {editableLyDo ? (
                        <textarea
                          className="bb-print-ly-do-input"
                          value={lineLyDo}
                          onChange={event => props.onLyDoChange?.(lineLyDoKey, event.target.value)}
                          rows={2}
                          placeholder="Gõ lý do dòng này..."
                          aria-label={`Lý do giải trình ${row.productCode || row.productName || ''}`}
                        />
                      ) : (
                        lineLyDo || ''
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="shift-summary-print-total-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td className="shift-summary-print-center shift-summary-print-total-label">Tổng</td>
                <td className="shift-summary-print-num">{printNumber(requiredQtyTotal, 2)}</td>
                <td className="shift-summary-print-num">{printNumber(requiredWeightTotal, 2)}</td>
                <td className="shift-summary-print-num">{printNumber(actualQtyTotal, qtyDigits)}</td>
                <td className="shift-summary-print-num">
                  {printNumber(actualWeightTotal, 2)}
                </td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">3. BÁO CÁO TIÊU HAO NGUYÊN VẬT LIỆU</h2>
          <h3 className="production-order-print-section-subtitle">3.1. NVL tính theo Kg</h3>
          <table className="shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-material-table">
            <thead><tr>
              <th>Mã NVL</th>
              <th>Tên NVL</th>
              <th>ĐVT</th>
              <th>Tỉ lệ trộn<br />Định mức</th>
              <th>Tỉ lệ trộn<br />Thực tế</th>
              <th>Trọng lượng<br />tồn đầu ca</th>
              <th>Trọng lượng<br />vật tư xuất kho</th>
              <th>Trọng lượng<br />vật tư nhập<br />thành phẩm</th>
              <th>Trọng lượng<br />vật tư lỗi hỏng</th>
              <th>Trọng lượng<br />vật tư tồn<br />cuối ca</th>
              <th>Trọng lượng<br />Vật tư xuất<br />thực dùng</th>
              <th>Trọng lượng<br />thành phẩm +<br />Lỗi Hỏng<br />thực tế</th>
              <th>Chênh lệch<br />(Xuất − Nhập)<br />(Kg)</th>
            </tr></thead>
            <tbody>
              {plasticMaterialRows.length === 0 ? (
                <tr><td colSpan={13} className="shift-summary-print-center">Không có dữ liệu NVL.</td></tr>
              ) : (
                plasticMaterialRows.map(row => {
                  const norm = row.normPercents.length > 0
                    ? row.normPercents.reduce((sum, value) => sum + value, 0) / row.normPercents.length
                    : null;
                  const actualUsedKg = computeMaterialUsageKg(row.exportKg, row.openingKg, row.closingKg);
                  const finishedAndDamagedKg = row.finishedKg + row.damagedKg;
                  const varianceKg = actualUsedKg - finishedAndDamagedKg;
                  return <tr key={row.key}>
                    <td>{row.code || '-'}</td>
                    <td>{row.name || '-'}</td>
                    <td className="shift-summary-print-center">{row.unit || 'kg'}</td>
                    <td className="shift-summary-print-num">{printPercent(norm)}</td>
                    <td className="shift-summary-print-num">{printPercent(row.actualPercent)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.openingKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.exportKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.finishedKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.damagedKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.closingKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(actualUsedKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(finishedAndDamagedKg, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(varianceKg, 2)}</td>
                  </tr>;
                })
              )}
              {renderMaterialPrintTotalRow('Tổng nhựa', plasticMaterialTotals)}
            </tbody>
          </table>

          <h3 className="production-order-print-section-subtitle">3.2. NVL tính theo Cái</h3>
          <table className="shift-summary-print-table bb-machine-report-print-material-table-unit">
            <thead><tr>
              <th>Mã NVL</th>
              <th>Tên NVL</th>
              <th>ĐVT</th>
              <th>Trọng lượng<br />tồn đầu ca</th>
              <th>Số lượng</th>
              <th>Số lượng<br />thực tế</th>
              <th>Trọng lượng<br />vật tư tồn<br />cuối ca</th>
            </tr></thead>
            <tbody>
              {otherMaterialRows.length === 0 ? (
                <tr><td colSpan={7} className="shift-summary-print-center">Không có dữ liệu NVL.</td></tr>
              ) : (
                otherMaterialRows.map(row => (
                  <tr key={row.key}>
                    <td>{row.code || '-'}</td>
                    <td>{row.name || '-'}</td>
                    <td className="shift-summary-print-center">{row.unit || '-'}</td>
                    <td className="shift-summary-print-num">{printNumber(row.openingKg, 2)}</td>
                    <td
                      className="shift-summary-print-num"
                      title="SL từ phiếu xuất kho NVL (bảng xuất NVL)"
                    >
                      {printNumber(row.exportQty, 2)}
                    </td>
                    <td
                      className="shift-summary-print-num"
                      title="SL báo cáo sản lượng × định mức theo cái trên công thức SP"
                    >
                      {printNumber(row.actualQty, 2)}
                    </td>
                    <td className="shift-summary-print-num">{printNumber(row.closingKg, 2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">4. ĐÁNH GIÁ HIỆU QUẢ CA SẢN XUẤT</h2>
          <table className="shift-summary-print-table bb-machine-report-print-evaluation-table">
            <thead><tr><th>STT</th><th>Giá trị phân tích</th><th>Tỉ lệ ĐM</th><th>Tỉ lệ TT</th><th>SL thực tế</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
            <tbody>
              <tr><td className="shift-summary-print-center">1</td><td>Tỉ lệ hàng lỗi / thành phẩm</td>
                <td className="shift-summary-print-num">{printPercent(evaluation?.tiLeLoiHongDinhMuc)}</td>
                <td className="shift-summary-print-num">{printPercent(evaluation?.tiLeLoiHong)}</td>
                <td className="shift-summary-print-num">{printNumber(damagedQuantity, 2)} kg</td>
                <td className="shift-summary-print-num">{printNumber(unitPrice(damagedMoney, damagedQuantity), 0)} đ/kg</td>
                <td className="shift-summary-print-num">{evaluation ? `${formatMoney(damagedMoney, 0)} đ` : '-'}</td></tr>
              <tr><td className="shift-summary-print-center">2</td><td>Hao hụt nhựa</td>
                <td className="shift-summary-print-num">100%</td>
                <td className="shift-summary-print-num">{printPercent(evaluation?.tiLeNhuaThucXuatVsDinhMuc)}</td>
                <td className="shift-summary-print-num">{printNumber(evaluation?.giaTriHaoHutNhuaKg, 2)} kg</td>
                <td className="shift-summary-print-num">{printNumber(unitPrice(evaluation?.giaTriHaoHutNhua, evaluation?.giaTriHaoHutNhuaKg), 0)} đ/kg</td>
                <td className="shift-summary-print-num">{evaluation ? `${formatMoney(evaluation.giaTriHaoHutNhua, 0)} đ` : '-'}</td></tr>
              <tr><td className="shift-summary-print-center">3</td><td>Hao hụt màng</td>
                <td className="shift-summary-print-num">100%</td>
                <td className="shift-summary-print-num">{printPercent(evaluation?.tiLeMangThucXuatVsDinhMuc)}</td>
                <td className="shift-summary-print-num">{printNumber(evaluation?.giaTriHaoHutMangKg, 2)} kg</td>
                <td className="shift-summary-print-num">{printNumber(unitPrice(evaluation?.giaTriHaoHutMang, evaluation?.giaTriHaoHutMangKg), 0)} đ/kg</td>
                <td className="shift-summary-print-num">{evaluation ? `${formatMoney(evaluation.giaTriHaoHutMang, 0)} đ` : '-'}</td></tr>
              <tr className="shift-summary-print-total-row"><td colSpan={6} className="shift-summary-print-total-label">Tổng giá trị hao hụt &amp; lỗi hỏng</td>
                <td className="shift-summary-print-num">{evaluation ? `${formatMoney(evaluation.tongGiaTriHaoHutLoiHong, 0)} đ` : '-'}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">5. GHI CHÚ</h2>
          <div className="bb-machine-report-print-note">
            {ghiChu || '—'}
          </div>
        </section>

        <div className="bb-machine-report-print-signatures">
          <div><p>Quản đốc sản xuất</p><span>(Ký và ghi rõ họ tên)</span></div>
          <div><p>Sản xuất phụ máy</p><span>(Ký và ghi rõ họ tên)</span></div>
          <div><p>Sản xuất chính máy</p><span>(Ký và ghi rõ họ tên)</span></div>
        </div>
      </div>
    </div>
  );
}

export default function ControlBoardBbMachineReportPrintBatch(props: PrintProps) {
  return (
    <div className="production-order-print-batch shift-summary-print-batch bb-machine-report-print-batch">
      {props.orderGroups.map(order => (
        <div key={order.groupKey} className="bb-machine-report-print-page">
          <BbMachineOrderPrintSheet order={order} props={props} />
        </div>
      ))}
    </div>
  );
}
