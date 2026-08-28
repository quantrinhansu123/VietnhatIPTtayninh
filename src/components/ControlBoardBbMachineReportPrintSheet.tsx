import React from 'react';
import { formatMoney, formatNumber } from '../utils';
import {
  computeMaterialUsageKg,
  computePercentRatio,
  isWarehouseBagExportItem,
  isWarehouseCoreExportItem,
  isWarehouseFilmItem,
  isWarehousePlasticNvlLine,
  isWarehouseTapeExportItem,
  machineValueMatchesFilter
} from '../utils/controlBoardShiftSummary';
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';
import type { MaterialRow } from '../features/kho-nvl';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { parseProductionOrderFilterDate } from '../features/cai-dat-thoi-gian';
import { shiftNamesMatch, type ShiftSetting } from '../utils/shiftSettings';
import type { ShiftSummaryWarehouseMovement } from '../utils/controlBoardShiftSummary';
import {
  convertWarehouseQuantityToKg,
  findMaterialTongKgPerUnit,
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem,
  normalizeWarehouseCodeKey,
  resolveMaterialTongKgPerUnit,
  type WarehouseWeightCatalogItem
} from '../utils/warehouseWeight';
import { resolveProductNplItemWeightKg } from '../features/san-pham';
import { resolveProductUnitNormKg } from '../features/ke-hoach-san-xuat';
import {
  allocateBbKgByWeightShare,
  allocateBbNhuaHaoHutByRatioPercent,
  buildBbMaterialKgMapsFromTabLines,
  isBbMachineText,
  isNnsTronMaterial,
  lookupBbMaterialKgByCodeOrName,
  lookupNnsTronTonDauKg,
  isInsulationMachineText,
  resolveBbDamagedPlasticLoiHongKg,
  resolveBbDamagedOtherLoiHongKg,
  resolveBbMaterialExportUnitPrice,
  type BbCuoiCaGroup,
  type BbDamagedGoodsGroup,
  type BbDanhGiaHaoHutGroup,
  type BbDauCaGroup,
  type BbInboundReportRow,
  type BbMixingRatioGroup,
  type BbProductionOrderGroup,
  type BbSanLuongGroup,
  type BbSanLuongProductGroup,
  type BbSanLuongNvlTotal,
  type BbWarehouseExportGroup
} from '../utils/controlBoardBbMachineReport';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import {
  collectCanTuDongProductMatchKeys,
  computeInsulationFilmWeightKg,
  filterCanTuDongRecordsForBoard,
  resolveInsulationFilmKgPerRoll,
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
  /** Cho phép sửa ghi chú trên màn xem trước (trước khi in). */
  editableNote?: boolean;
  onNoteChange?: (orderGroupKey: string, value: string) => void;
  /** Cùng nguồn thẻ Báo cáo sản lượng trên bảng điều khiển. */
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  /** Snapshot tab Báo cáo sản lượng (NVL từ `bao_cao_san_luong_nvl_dinh_muc`). */
  sanLuongGroups?: BbSanLuongGroup[];
  canTuDongRecords?: CanTuDongRecord[];
  /** Nhãn máy đang lọc, vd: "máy cách nhiệt". */
  machineReportLabel?: string;
  /** Phiếu xuất/nhập kho — lấy đơn giá NVL theo ngày + ca lệnh. */
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  shiftSettings?: Array<ShiftSetting | { name?: string; label?: string }>;
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
  /** SL xuất từ phiếu xuất NVL (ĐVT gốc). */
  exportQty: number;
  /**
   * Số lượng mục 3.2 (ĐVT gốc) =
   * Σ theo từng mã SP: (SL sản lượng SP × định mức thành phần NVL / 1 SP).
   */
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

/** 3.1 NVL nhựa: ĐVT kg và không phải lõi/túi/băng dính. */
function isPlasticMaterialPrintRow(row: Pick<MaterialPrintRow, 'code' | 'name' | 'unit'>) {
  return isWarehousePlasticNvlLine({
    warehouseKind: 'nvl',
    itemCode: row.code,
    itemName: row.name,
    unit: row.unit
  });
}

/** Túi / lõi / tem — không nhận phân bổ «Trọng lượng vật tư lỗi hỏng». */
function isExcludedFromDamagedOtherPrintRow(row: Pick<MaterialPrintRow, 'code' | 'name' | 'unit'>) {
  if (isWarehouseBagExportItem(row.code, row.name)) return true;
  if (isWarehouseCoreExportItem(row.code, row.name)) return true;
  if (isWarehouseTapeExportItem(row.code, row.name)) return true;
  const text = `${row.code} ${row.name}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return text.includes('tem ') || text.startsWith('tem') || text.includes(' tem');
}

function isFilmMaterialPrintRow(row: Pick<MaterialPrintRow, 'code' | 'name' | 'unit'>) {
  if (isWarehouseFilmItem(row.code, row.name, row.unit)) return true;
  const text = `${row.code} ${row.name}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return text.includes('mang') || text.includes('film');
}

function lookupCatalogMaterialUnit(
  catalog: WarehouseWeightCatalogItem[],
  code: string,
  name: string
) {
  const codeKey = normalizeWarehouseCodeKey(code);
  if (codeKey) {
    const byCode = catalog.find(item => normalizeWarehouseCodeKey(item.code) === codeKey);
    const unit = String(byCode?.unit || '').trim();
    if (unit && unit !== '-') return unit;
  }
  const nameKey = normalizeWarehouseCodeKey(name);
  if (!nameKey) return '';
  const byName = catalog.find(item => normalizeWarehouseCodeKey(item.name || '') === nameKey);
  return String(byName?.unit || '').trim();
}

function resolvePrintMaterialUnit(
  code: string,
  name: string,
  current: string,
  catalog: WarehouseWeightCatalogItem[]
) {
  const catalogUnit = lookupCatalogMaterialUnit(catalog, code, name);
  const currentUnit = String(current || '').trim();
  const preferNonKg = (unit: string) => unit && unit !== '-' && !isWarehouseKgUnit(unit);

  if (isWarehouseTapeExportItem(code, name)) {
    if (preferNonKg(catalogUnit)) return catalogUnit;
    if (preferNonKg(currentUnit)) return currentUnit;
    return 'Cuộn';
  }
  if (preferNonKg(catalogUnit) && (!currentUnit || currentUnit === '-' || isWarehouseKgUnit(currentUnit))) {
    return catalogUnit;
  }
  return currentUnit || catalogUnit || 'kg';
}

function sumMaterialPrintTotals(
  rows: Array<{
    openingKg: number;
    exportKg: number;
    finishedKg: number;
    damagedKg: number;
    closingKg: number;
  }>,
  options?: { addDamagedToUsage?: boolean }
): MaterialPrintTotals {
  const addDamagedToUsage = options?.addDamagedToUsage === true;
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
    const baseUsedKg = computeMaterialUsageKg(row.exportKg, row.openingKg, row.closingKg);
    const actualUsedKg = addDamagedToUsage ? baseUsedKg + (row.damagedKg > 0 ? row.damagedKg : 0) : baseUsedKg;
    const finishedAndDamagedKg = row.finishedKg + row.damagedKg;
    totals.openingKg += row.openingKg;
    totals.exportKg += row.exportKg;
    totals.finishedKg += row.finishedKg;
    totals.damagedKg += row.damagedKg;
    totals.closingKg += row.closingKg;
    totals.actualUsedKg += actualUsedKg;
    totals.finishedAndDamagedKg += finishedAndDamagedKg;
    totals.varianceKg += computeChenhLechXuatNhapKg(
      row.exportKg,
      row.openingKg,
      row.closingKg,
      row.finishedKg,
      row.damagedKg
    );
  }
  return totals;
}

function renderMaterialPrintTotalRow(
  label: string,
  totals: MaterialPrintTotals,
  options?: { includeMixingRatioCols?: boolean; includeQtyCol?: boolean }
) {
  const includeMixingRatioCols = options?.includeMixingRatioCols !== false;
  const includeQtyCol = options?.includeQtyCol === true;
  return (
    <tr className="shift-summary-print-total-row">
      <td className="shift-summary-print-center bb-machine-report-print-stt">&nbsp;</td>
      <td colSpan={3} className="shift-summary-print-total-label">
        {label}
      </td>
      {includeQtyCol ? <td className="shift-summary-print-num">—</td> : null}
      {includeMixingRatioCols ? (
        <>
          <td className="shift-summary-print-num">&nbsp;</td>
          <td className="shift-summary-print-num">&nbsp;</td>
        </>
      ) : null}
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

/** Quy kg → SL theo ĐVT gốc (Tổng kg kho NVL); ĐVT kg giữ nguyên. */
function resolveUsageQtyFromKg(
  kg: number | null | undefined,
  unit: string,
  code: string,
  name: string,
  catalog: WarehouseWeightCatalogItem[]
): number | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return null;
  const unitRaw = String(unit || '').trim();
  if (!unitRaw || unitRaw === '-' || isWarehouseKgUnit(unitRaw)) return kg;

  const codeKey = normalizeWarehouseCodeKey(code);
  const nameKey = normalizeWarehouseCodeKey(name);
  const item =
    (codeKey
      ? catalog.find(row => normalizeWarehouseCodeKey(row.code) === codeKey)
      : undefined) ||
    (nameKey
      ? catalog.find(row => normalizeWarehouseCodeKey(row.name || '') === nameKey)
      : undefined);
  const perUnit = resolveMaterialTongKgPerUnit(item);
  if (perUnit === null || !(perUnit > 0)) return null;
  return Math.round((kg / perUnit) * 10000) / 10000;
}

function printQtyWithUnit(qty: number | null | undefined, unit: string) {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return '—';
  const unitLabel = String(unit || '').trim();
  if (!unitLabel || unitLabel === '-') return printNumber(qty, 2);
  return `${printNumber(qty, 2)} ${unitLabel}`;
}

/** Cùng công thức tab «Báo cáo lỗi hỏng»: ưu tiên tỉ lệ trộn thực tế, không có thì định mức. */
function resolveLoiHongMixingTiLePercent(line: {
  tiLeTronPercent: number | null;
  tiLeDinhMucPercent: number | null;
}) {
  if (line.tiLeTronPercent != null && line.tiLeTronPercent > 0) return line.tiLeTronPercent;
  if (line.tiLeDinhMucPercent != null && line.tiLeDinhMucPercent > 0) return line.tiLeDinhMucPercent;
  return null;
}

/** Xuất thực dùng = Xuất kho + Tồn đầu − Tồn cuối + Lỗi hỏng. */
function computeVatTuXuatThucDungKg(
  exportKg: number,
  openingKg: number,
  closingKg: number,
  damagedKg: number
) {
  const base = computeMaterialUsageKg(exportKg, openingKg, closingKg);
  return base + (damagedKg > 0 ? damagedKg : 0);
}

/**
 * Chênh lệch (Xuất − Nhập) =
 * tồn đầu ca + xuất kho − tồn cuối ca − nhập thành phẩm − lỗi hỏng.
 */
function computeChenhLechXuatNhapKg(
  exportKg: number,
  openingKg: number,
  closingKg: number,
  finishedKg: number,
  damagedKg: number
) {
  const usageKg = computeMaterialUsageKg(exportKg, openingKg, closingKg);
  const damaged = damagedKg > 0 ? damagedKg : 0;
  return usageKg - finishedKg - damaged;
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
  return sumCanTuDongSanLuongTotals(
    scopedCanTuDongForProduct(order, productCode, productName, records, products)
  );
}

function canTuDongActualForOrder(order: BbProductionOrderGroup, records: CanTuDongRecord[]) {
  const scoped = filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
  });
  return sumCanTuDongSanLuongTotals(scoped);
}

function scopedCanTuDongForProduct(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  records: CanTuDongRecord[],
  products: ProductRow[]
) {
  const productKeys = collectCanTuDongProductMatchKeys([{ productCode, productName }], products);
  return filterCanTuDongRecordsForBoard(records, {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }],
    productCodeKeys: productKeys
  });
}

function findCatalogProduct(products: ProductRow[], productCode: string, productName: string) {
  const codeKey = normalizeProductCodeKey(productCode);
  const nameKey = normalizeProductCodeKey(productName);
  return (
    products.find(product => {
      const aliases = [product.code, product.newCode, product.amisCode, product.name].map(value =>
        normalizeProductCodeKey(String(value || ''))
      );
      if (codeKey && aliases.includes(codeKey)) return true;
      if (nameKey && aliases.includes(nameKey)) return true;
      return false;
    }) ?? null
  );
}

function parsePositiveKg(value: string | null | undefined) {
  const number = Number(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sanLuongProductMatchesLine(
  productGroup: BbSanLuongProductGroup,
  productCode: string,
  productName: string
) {
  const codeKey = normalizeProductCodeKey(productCode);
  const nameKey = normalizeProductCodeKey(productName);
  const groupCode = normalizeProductCodeKey(productGroup.productCode);
  const groupName = normalizeProductCodeKey(productGroup.productName);
  return (
    (Boolean(codeKey) &&
      (groupCode === codeKey || groupCode.includes(codeKey) || codeKey.includes(groupCode))) ||
    (Boolean(nameKey) &&
      (groupName === nameKey || groupName.includes(nameKey) || nameKey.includes(groupName)))
  );
}

function findSanLuongProductGroup(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  sanLuongGroups: BbSanLuongGroup[]
) {
  const group = findOrderGroup(sanLuongGroups, order);
  if (!group) return undefined;
  return group.productGroups.find(productGroup =>
    sanLuongProductMatchesLine(productGroup, productCode, productName)
  );
}

function resolveSanLuongProductWeightKg(productGroup: BbSanLuongProductGroup | undefined) {
  if (!productGroup) return 0;
  return productGroup.weightKg > 0 ? productGroup.weightKg : productGroup.totalActualWeightKg;
}

/** TL nhựa thành phẩm theo SP — cùng nguồn ô «Tổng nhựa thành phẩm» trên bảng điều khiển. */
function resolveProductSanLuongPlasticKg(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
): number | null {
  if (props.sanLuongSource === 'can-tu-dong') {
    const productKeys = collectCanTuDongProductMatchKeys([{ productCode, productName }], props.products);
    const scoped = filterCanTuDongRecordsForBoard(props.canTuDongRecords || [], {
      orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }],
      productCodeKeys: productKeys
    });
    const totals = sumCanTuDongSanLuongTotals(scoped);
    let plasticKg = totals.weightKg > 0 ? totals.weightKg : 0;
    if (isInsulationMachineReport(props, order) && plasticKg > 0) {
      const filmKg = computeInsulationFilmWeightKg(props.products, scoped);
      plasticKg = Math.max(0, plasticKg - filmKg);
    }
    return plasticKg > 0 ? plasticKg : null;
  }
  const productGroup = findSanLuongProductGroup(
    order,
    productCode,
    productName,
    props.sanLuongGroups || []
  );
  const fromSanLuong = resolveSanLuongProductWeightKg(productGroup);
  if (fromSanLuong > 0) return fromSanLuong;
  const fromAcceptance = acceptanceWeightForProduct(
    order,
    productCode,
    productName,
    props.acceptanceReports
  );
  return fromAcceptance > 0 ? fromAcceptance : null;
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

/** SL sản lượng theo mã SP — ưu tiên tab Báo cáo sản lượng, không thì nguồn cân/nghiệm thu. */
function resolveProductSanLuongQuantity(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
) {
  const productGroup = findSanLuongProductGroup(
    order,
    productCode,
    productName,
    props.sanLuongGroups || []
  );
  if (productGroup && productGroup.quantity > 0) return productGroup.quantity;
  return resolveActualQuantityForProduct(order, productCode, productName, props);
}

function isInsulationMachineReport(props: PrintProps, order?: BbProductionOrderGroup) {
  return isInsulationMachineText(props.machineReportLabel, order?.machine);
}

/** Tổng trọng lượng cuộn (Cân SP) theo mã SP — cột «Trọng lượng thực tế» máy cách nhiệt. */
function resolveProductSanLuongRollKg(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
): number | null {
  if (props.sanLuongSource === 'can-tu-dong') {
    const scoped = scopedCanTuDongForProduct(
      order,
      productCode,
      productName,
      props.canTuDongRecords || [],
      props.products
    );
    const totals = sumCanTuDongThucTeTotals(scoped);
    return totals.weightKg > 0 ? totals.weightKg : null;
  }
  const product = findCatalogProduct(props.products, productCode, productName);
  const perRollKg = parsePositiveKg(product?.totalWeight);
  const qty = resolveActualQuantityForProduct(order, productCode, productName, props);
  if (perRollKg != null && qty > 0) return perRollKg * qty;
  return null;
}

/** TL màng thực tế theo mã SP (máy cách nhiệt). */
function resolveProductSanLuongFilmKg(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
): number {
  if (!isInsulationMachineReport(props, order)) return 0;
  if (props.sanLuongSource === 'can-tu-dong') {
    const scoped = scopedCanTuDongForProduct(
      order,
      productCode,
      productName,
      props.canTuDongRecords || [],
      props.products
    );
    const filmKg = computeInsulationFilmWeightKg(props.products, scoped);
    return filmKg > 0 ? filmKg : 0;
  }
  const product = findCatalogProduct(props.products, productCode, productName);
  const filmPerRoll = product ? resolveInsulationFilmKgPerRoll(product) : null;
  const qty = resolveActualQuantityForProduct(order, productCode, productName, props);
  if (filmPerRoll != null && qty > 0) return filmPerRoll * qty;
  return 0;
}

/** Tổng TL cuộn theo lệnh (Σ Cân SP). */
function resolveOrderSanLuongRollKg(order: BbProductionOrderGroup, props: PrintProps): number {
  if (props.sanLuongSource !== 'can-tu-dong') return 0;
  const scoped = filterCanTuDongRecordsForBoard(props.canTuDongRecords || [], {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
  });
  const totals = sumCanTuDongThucTeTotals(scoped);
  return totals.weightKg > 0 ? totals.weightKg : 0;
}

/** Gom NVL snapshot báo cáo sản lượng theo lệnh (ngày/ca/máy). */
function collectSanLuongNvlTotalsForOrder(
  order: BbProductionOrderGroup,
  groups: BbSanLuongGroup[]
): BbSanLuongNvlTotal[] {
  const matched = findOrderGroups(groups, order);
  const agg = new Map<string, BbSanLuongNvlTotal>();
  for (const group of matched) {
    for (const nvl of group.nvlTotals || []) {
      const key =
        normalizeProductCodeKey(nvl.itemCode) ||
        normalizeProductCodeKey(nvl.itemName) ||
        String(nvl.itemName || nvl.itemCode || '').trim().toUpperCase();
      if (!key) continue;
      const existing = agg.get(key);
      if (!existing) {
        agg.set(key, { ...nvl });
        continue;
      }
      existing.actualWeightKg += nvl.actualWeightKg > 0 ? nvl.actualWeightKg : 0;
      existing.normWeightKg += nvl.normWeightKg > 0 ? nvl.normWeightKg : 0;
      if (nvl.amountType === 'percent' && nvl.rate != null && nvl.rate > 0) {
        existing.quantity = nvl.rate;
        existing.rate = nvl.rate;
      } else if (nvl.quantity != null && nvl.quantity > 0) {
        existing.quantity = (existing.quantity || 0) + nvl.quantity;
      }
    }
  }
  return [...agg.values()];
}

/** Cùng số «Trọng lượng nhựa / Trọng lượng» trên ô Báo cáo sản lượng (theo lệnh). */
function resolveOrderSanLuongPlasticKg(order: BbProductionOrderGroup, props: PrintProps): number {
  if (props.sanLuongSource === 'can-tu-dong') {
    const scoped = filterCanTuDongRecordsForBoard(props.canTuDongRecords || [], {
      orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
    });
    const totals = sumCanTuDongSanLuongTotals(scoped);
    let plasticKg = totals.weightKg > 0 ? totals.weightKg : 0;
    if (isInsulationMachineReport(props, order) && plasticKg > 0) {
      const filmKg = computeInsulationFilmWeightKg(props.products, scoped);
      plasticKg = Math.max(0, plasticKg - filmKg);
    }
    return plasticKg;
  }
  const sanLuongGroup = findOrderGroup(props.sanLuongGroups || [], order);
  if (sanLuongGroup && sanLuongGroup.totalActualWeightKg > 0) {
    return sanLuongGroup.totalActualWeightKg;
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

/** TL màng thành phẩm theo lệnh (máy cách nhiệt + cân tự động). */
function resolveOrderSanLuongFilmKg(order: BbProductionOrderGroup, props: PrintProps): number {
  if (props.sanLuongSource !== 'can-tu-dong' || !isInsulationMachineReport(props, order)) return 0;
  const scoped = filterCanTuDongRecordsForBoard(props.canTuDongRecords || [], {
    orderShiftBuckets: [{ ngay: order.ngay, shift: order.shift, machine: order.machine }]
  });
  const filmKg = computeInsulationFilmWeightKg(props.products, scoped);
  return filmKg > 0 ? filmKg : 0;
}

/**
 * Định mức NVL (kg) theo lệnh = Σ (SL thực tế SP × định mức BOM / 1 SP).
 * Dùng cột «Định mức Vật tư của Số lượng nhập TP» mục 4.2.
 */
function buildBomDinhMucKgByMaterial(order: BbProductionOrderGroup, props: PrintProps): Map<string, number> {
  const materialsCatalog = props.materials.map(mapMaterialToWeightCatalogItem);
  const byKey = new Map<string, number>();
  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  const add = (code: string, name: string, kg: number) => {
    if (!(kg > 0)) return;
    const key =
      normalizeProductCodeKey(code) ||
      normalizeProductCodeKey(name) ||
      String(code || name || '').trim().toUpperCase();
    if (!key) return;
    byKey.set(key, round4((byKey.get(key) || 0) + kg));
  };

  for (const productLine of order.lines) {
    const product = findProduct(props.products, productLine.productCode);
    if (!product) continue;
    const actualQty = resolveProductSanLuongQuantity(
      order,
      productLine.productCode,
      productLine.productName,
      props
    );
    if (!(actualQty > 0)) continue;

    const unitNormKg =
      productLine.normKgPerUnit != null && productLine.normKgPerUnit > 0
        ? productLine.normKgPerUnit
        : resolveProductUnitNormKg(product);

    for (const item of product.nplItems || []) {
      // Ưu tiên kg/SP đã khai trên BOM (Khối lượng kg).
      const perSpKg = resolveProductNplItemWeightKg(product, item, props.materials);
      if (perSpKg != null && Number.isFinite(perSpKg) && perSpKg > 0) {
        add(item.code, item.name, perSpKg * actualQty);
        continue;
      }

      if (item.amountType === 'percent') {
        if (unitNormKg != null && unitNormKg > 0) {
          add(item.code, item.name, unitNormKg * actualQty * (Math.max(0, item.percent ?? 0) / 100));
        }
        continue;
      }

      const qtyPerSp =
        item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : null;
      if (qtyPerSp == null) continue;
      const rawQty = qtyPerSp * actualQty;
      const unit = String(item.unit || '').trim();
      if (!unit || unit === '-' || isWarehouseKgUnit(unit)) {
        add(item.code, item.name, rawQty);
        continue;
      }
      const converted = convertWarehouseQuantityToKg({
        quantity: rawQty,
        unit,
        itemCode: item.code,
        warehouseKind: 'nvl',
        materials: materialsCatalog
      });
      if (converted != null && Number.isFinite(converted) && converted > 0) {
        add(item.code, item.name, converted);
      }
    }
  }

  return byKey;
}

function lookupBomDinhMucKg(
  map: Map<string, number>,
  code?: string | null,
  name?: string | null
): number {
  const codeKey = normalizeProductCodeKey(code || '');
  if (codeKey && map.has(codeKey)) return map.get(codeKey) || 0;
  const nameKey = normalizeProductCodeKey(name || '');
  if (nameKey && map.has(nameKey)) return map.get(nameKey) || 0;
  return 0;
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

  // Seed danh sách NVL / % định mức từ BOM — không ghi finishedKg (cột nhập TP chỉ từ snapshot).
  // Số lượng (3.2) = Σ (SL sản lượng từng mã SP × định mức thành phần NVL của SP đó).
  for (const productLine of order.lines) {
    const product = findProduct(props.products, productLine.productCode);
    const actualProductQuantity = resolveProductSanLuongQuantity(
      order,
      productLine.productCode,
      productLine.productName,
      props
    );
    for (const item of product?.nplItems || []) {
      const row = ensure(item.code, item.name, item.amountType === 'percent' ? 'kg' : item.unit);
      if (item.amountType === 'percent' && item.percent !== null) row.normPercents.push(item.percent);
      if (item.amountType === 'quantity') {
        const unit = String(item.unit || '').trim();
        const qtyPerSp =
          item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : null;
        if (
          qtyPerSp != null &&
          actualProductQuantity > 0 &&
          unit &&
          unit !== '-' &&
          !isWarehouseKgUnit(unit)
        ) {
          row.actualQty += qtyPerSp * actualProductQuantity;
        }
      }
    }
  }

  const exportGroup = findOrderGroup(props.exportGroups, order);
  const materialsCatalog = props.materials.map(mapMaterialToWeightCatalogItem);
  // Mỗi dòng phiếu xuất chỉ cộng 1 lần (tránh nhân khi phân bổ nhiều SP).
  const seenExportSlipKeys = new Set<string>();
  for (const line of exportGroup?.lines || []) {
    const row = ensure(line.itemCode, line.itemName, line.unit);
    const slipId = String(line.slipLineKey || line.key || '').trim();
    const isFirstSlipHit = !slipId || !seenExportSlipKeys.has(slipId);
    if (slipId) seenExportSlipKeys.add(slipId);

    // SL xuất: chỉ cộng 1 lần / slipLineKey.
    if (isFirstSlipHit) {
      row.exportQty += line.quantity > 0 ? line.quantity : 0;
    }
  }
  // Trọng lượng xuất kho = Số lượng xuất × Số Kg (Tổng kg) của NVL.
  for (const row of rows.values()) {
    if (!(row.exportQty > 0)) {
      row.exportKg = 0;
      continue;
    }
    const tongKg =
      findMaterialTongKgPerUnit(row.code, materialsCatalog) ??
      resolveMaterialTongKgPerUnit(
        materialsCatalog.find(
          item =>
            normalizeWarehouseCodeKey(item.code) === normalizeWarehouseCodeKey(row.code) ||
            normalizeWarehouseCodeKey(item.name || '') === normalizeWarehouseCodeKey(row.name)
        )
      );
    if (tongKg != null && tongKg > 0) {
      row.exportKg = round4(row.exportQty * tongKg);
    } else if (isWarehouseKgUnit(row.unit)) {
      // ĐVT kg mà chưa có Tổng kg → coi SL đã là kg.
      row.exportKg = round4(row.exportQty);
    } else {
      row.exportKg = 0;
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
  const damagedLines = damagedGroup?.lines || [];
  const groupIsInsulation = isInsulationMachineText(order.machine, props.selectedMachine?.name);
  const damagedPlasticKg = resolveBbDamagedPlasticLoiHongKg(damagedLines, {
    isInsulationMachine: groupIsInsulation
  });
  const damagedOtherKg = resolveBbDamagedOtherLoiHongKg(damagedLines, {
    isInsulationMachine: groupIsInsulation
  });
  const mixingGroup = findOrderGroup(props.mixingGroups, order);
  for (const line of mixingGroup?.lines || []) {
    const row = ensure(line.materialCode, line.materialName, 'kg');
    if (line.tiLeDinhMucPercent !== null) row.normPercents.push(line.tiLeDinhMucPercent);
    row.actualPercent = line.tiLeThucTeTbPercent;
    row.actualMixedKg += line.totalKlThucTe;
  }
  // Lỗi hỏng nhựa: chỉ SP lỗi, phân bổ theo tab «Báo cáo lỗi hỏng» (mixingLines snapshot).
  if (damagedPlasticKg > 0) {
    for (const line of damagedGroup?.mixingLines || []) {
      if (isExcludedFromDamagedOtherPrintRow({
        code: line.materialCode,
        name: line.materialName,
        unit: line.unit || 'kg'
      })) {
        continue;
      }
      const tiLe = resolveLoiHongMixingTiLePercent(line);
      if (tiLe == null || !Number.isFinite(tiLe) || !(tiLe > 0)) continue;
      ensure(line.materialCode, line.materialName, line.unit || 'kg').damagedKg += round4(
        (damagedPlasticKg * tiLe) / 100
      );
    }
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

  // Cột «Trọng lượng vật tư nhập thành phẩm»:
  // % = Khối lượng phiếu thành phẩm × % (snapshot actualWeightKg).
  // Cái = định lượng Thành phần × SL, quy kg (không lấy SL làm kg).
  for (const row of rows.values()) {
    row.finishedKg = 0;
  }
  const sanLuongNvls = collectSanLuongNvlTotalsForOrder(order, props.sanLuongGroups || []);
  if (sanLuongNvls.length > 0) {
    for (const nvl of sanLuongNvls) {
      const unit = nvl.unit || (nvl.amountType === 'percent' ? 'kg' : 'Cái');
      const row = ensure(nvl.itemCode, nvl.itemName, unit);
      if (nvl.amountType === 'percent' && nvl.actualWeightKg > 0) {
        row.finishedKg = round4(nvl.actualWeightKg);
      }
    }
  }

  // Tính lại Số lượng 3.2 sau khi gom đủ mã NVL (kể cả chỉ có trên snapshot/xuất).
  for (const row of rows.values()) {
    if (!isPlasticMaterialPrintRow(row)) row.actualQty = 0;
  }
  for (const productLine of order.lines) {
    const product = findProduct(props.products, productLine.productCode);
    const sl = resolveProductSanLuongQuantity(
      order,
      productLine.productCode,
      productLine.productName,
      props
    );
    if (!(sl > 0)) continue;
    for (const item of product?.nplItems || []) {
      if (item.amountType !== 'quantity') continue;
      const qtyPerSp =
        item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : null;
      if (qtyPerSp == null && !(item.weightKg != null && item.weightKg >= 0)) continue;
      const unit = String(item.unit || '').trim();
      const row = ensure(item.code, item.name, unit || 'Cái');
      if (isPlasticMaterialPrintRow(row)) continue;
      if (qtyPerSp != null && unit && unit !== '-' && !isWarehouseKgUnit(unit)) {
        row.actualQty = round4(row.actualQty + qtyPerSp * sl);
      }
      const perSpKg = resolveProductNplItemWeightKg(product, item, props.materials);
      if (perSpKg != null && Number.isFinite(perSpKg) && perSpKg > 0) {
        row.finishedKg = round4(row.finishedKg + perSpKg * sl);
        continue;
      }
      if (qtyPerSp == null) continue;
      const totalQty = qtyPerSp * sl;
      if (isWarehouseKgUnit(unit)) {
        row.finishedKg = round4(row.finishedKg + totalQty);
        continue;
      }
      const converted = convertWarehouseQuantityToKg({
        quantity: totalQty,
        unit: unit || 'Cái',
        itemCode: item.code,
        warehouseKind: 'nvl',
        materials: materialsCatalog,
        preferTongKgOnly: false
      });
      if (converted != null && Number.isFinite(converted) && converted > 0) {
        row.finishedKg = round4(row.finishedKg + converted);
      }
    }
  }

  // Lỗi hỏng NVL khác: máy cách nhiệt = rác màng; máy khác = SP rác trừ rác màng.
  // Không phân bổ vào túi / lõi / tem.
  if (damagedOtherKg > 0) {
    const candidates = [...rows.values()].filter(row => {
      if (isPlasticMaterialPrintRow(row)) return false;
      if (isExcludedFromDamagedOtherPrintRow(row)) return false;
      return true;
    });
    const filmOnly = groupIsInsulation
      ? candidates.filter(row => isFilmMaterialPrintRow(row))
      : [];
    const otherRows = filmOnly.length > 0 ? filmOnly : candidates;
    const shareWeights = otherRows.map(row => Math.max(row.finishedKg, row.exportKg, 0));
    const allocated = allocateBbKgByWeightShare(
      damagedOtherKg,
      shareWeights.map(weightKg => ({ weightKg }))
    );
    otherRows.forEach((row, index) => {
      const kg = allocated[index];
      if (kg != null && kg > 0) row.damagedKg += round4(kg);
    });
  }

  const materialsCatalogForUnit = props.materials.map(mapMaterialToWeightCatalogItem);
  const result = [...rows.values()]
    .filter(
      row =>
        !(
          isNnsTronMaterial(row.code, row.name) &&
          (nnsTronTonDauKg > 0 || nnsTronTonCuoiKg > 0 || closingMaterialLines.length > 0)
        )
    )
    .map(row => ({
      ...row,
      unit: resolvePrintMaterialUnit(row.code, row.name, row.unit, materialsCatalogForUnit)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  return result;
}

function BbMachineOrderPrintSheet({
  order,
  props
}: {
  order: BbProductionOrderGroup;
  props: PrintProps;
}) {
  const inbound = findOrderGroup(props.inboundRows, order);
  const evaluation = findOrderGroup(props.danhGiaGroups, order);
  const damaged = findOrderGroup(props.damagedGroups, order);
  const hangLoiKg = resolveBbDamagedPlasticLoiHongKg(damaged?.lines || [], {
    isInsulationMachine: isInsulationMachineText(order.machine, props.selectedMachine?.name)
  });
  const hangLoiOtherKg = resolveBbDamagedOtherLoiHongKg(damaged?.lines || [], {
    isInsulationMachine: isInsulationMachineText(order.machine, props.selectedMachine?.name)
  });
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
  const plasticMaterialTotals = sumMaterialPrintTotals(plasticMaterialRows, { addDamagedToUsage: true });
  const otherMaterialTotals = sumMaterialPrintTotals(otherMaterialRows, { addDamagedToUsage: true });
  const useCanTuDong = props.sanLuongSource === 'can-tu-dong';
  const qtyDigits = useCanTuDong ? 0 : 2;
  const editableLyDo = Boolean(props.editableLyDo && props.onLyDoChange);
  const editableNote = Boolean(props.editableNote && props.onNoteChange);
  const showInsulationWeightCols = isInsulationMachineReport(props, order);
  const productRows = order.lines.map(line => {
    const actualQuantity = resolveActualQuantityForProduct(
      order,
      line.productCode,
      line.productName,
      props
    );
    const actualPlasticWeight = resolveProductSanLuongPlasticKg(
      order,
      line.productCode,
      line.productName,
      props
    );
    const actualFilmWeight = showInsulationWeightCols
      ? resolveProductSanLuongFilmKg(order, line.productCode, line.productName, props)
      : 0;
    const rollWeight = showInsulationWeightCols
      ? resolveProductSanLuongRollKg(order, line.productCode, line.productName, props)
      : null;
    const actualWeight = showInsulationWeightCols
      ? rollWeight ??
        (actualPlasticWeight != null || actualFilmWeight > 0
          ? (actualPlasticWeight || 0) + actualFilmWeight
          : null)
      : actualPlasticWeight;
    return {
      ...line,
      actualQuantity,
      actualWeight,
      actualPlasticWeight,
      actualFilmWeight,
      requiredWeight: line.totalNormKg
    };
  });
  const productPlanRatios = productRows
    .map(row => (row.quantity > 0 ? (row.actualQuantity / row.quantity) * 100 : null))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const avgProductPlanRatio =
    productPlanRatios.length > 0
      ? productPlanRatios.reduce((sum, value) => sum + value, 0) / productPlanRatios.length
      : null;
  const requiredQtyTotal = productRows.reduce((sum, row) => sum + row.quantity, 0);
  const requiredWeightTotal = productRows.reduce((sum, row) => sum + (row.requiredWeight || 0), 0);
  const lineActualQtyTotal = productRows.reduce((sum, row) => sum + row.actualQuantity, 0);
  const lineActualWeightTotal = productRows.reduce((sum, row) => sum + (row.actualWeight || 0), 0);
  // Cân tự động: tổng = mọi lần cân ngày/ca/máy lệnh (cùng thẻ SỐ SP / TL nhựa khi 1 lệnh khớp bộ lọc).
  const orderCanTuDongTotals = useCanTuDong
    ? canTuDongActualForOrder(order, props.canTuDongRecords || [])
    : null;
  const actualQtyTotal =
    orderCanTuDongTotals?.quantity ??
    (lineActualQtyTotal || inbound?.acceptedRolls || 0);
  const tongNhuaThanhPhamKg = resolveOrderSanLuongPlasticKg(order, props);
  const tongMangThanhPhamKg = resolveOrderSanLuongFilmKg(order, props);
  const tongCuonThanhPhamKg = showInsulationWeightCols ? resolveOrderSanLuongRollKg(order, props) : 0;
  const lineActualPlasticTotal = productRows.reduce(
    (sum, row) => sum + (row.actualPlasticWeight || 0),
    0
  );
  const lineActualFilmTotal = productRows.reduce((sum, row) => sum + (row.actualFilmWeight || 0), 0);
  /** Tổng nhựa thành phẩm — cùng nguồn ô «Tổng nhựa thành phẩm» / cột TL nhựa trên Báo cáo sản lượng. */
  const actualWeightTotal =
    tongNhuaThanhPhamKg > 0 ? tongNhuaThanhPhamKg : lineActualPlasticTotal;
  const productActualWeightTotal = showInsulationWeightCols
    ? tongCuonThanhPhamKg > 0
      ? tongCuonThanhPhamKg
      : lineActualWeightTotal
    : actualWeightTotal;
  const productPlasticWeightTotal =
    tongNhuaThanhPhamKg > 0 ? tongNhuaThanhPhamKg : lineActualPlasticTotal;
  const productFilmWeightTotal = tongMangThanhPhamKg > 0 ? tongMangThanhPhamKg : lineActualFilmTotal;
  /** 4.1 dòng 1–2: Hàng lỗi / Thành phẩm = tổng 2 dòng hao hụt nhựa + màng. */
  const hangLoiTongKg = (hangLoiKg > 0 ? hangLoiKg : 0) + (hangLoiOtherKg > 0 ? hangLoiOtherKg : 0);
  const thanhPhamTongKg =
    (actualWeightTotal > 0 ? actualWeightTotal : 0) + (tongMangThanhPhamKg > 0 ? tongMangThanhPhamKg : 0);
  const tiLeLoiHongTrenThanhPhamVaLoi = computePercentRatio(
    hangLoiTongKg,
    thanhPhamTongKg + hangLoiTongKg
  );
  const tiLeLoiHongTrenThanhPham = computePercentRatio(hangLoiTongKg, thanhPhamTongKg);
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

  /** Hao hụt nhựa: tách theo từng loại trong phiếu trộn; dòng «Hao hụt nhựa» chỉ còn tổng. */
  const mixingGroup = findOrderGroup(props.mixingGroups, order);
  const materialsCatalog = props.materials.map(mapMaterialToWeightCatalogItem);
  const plasticLossTotalKg = evaluation?.giaTriHaoHutNhuaKg ?? 0;
  const plasticThucXuatKg = evaluation?.tongNhuaThucXuat ?? 0;
  const danhGiaText = String(props.phanTichMap?.[order.groupKey] || '').trim();
  /** 4.2 Định mức = SL thực tế × định mức BOM. */
  const bomDinhMucByMaterial = buildBomDinhMucKgByMaterial(order, props);
  const mixingPlasticLines = (mixingGroup?.lines || []).filter(line => {
    const hasName = Boolean(String(line.materialCode || '').trim() || String(line.materialName || '').trim());
    if (!hasName) return false;
    return !isNnsTronMaterial(line.materialCode, line.materialName);
  });
  const plasticLossKgByLine = allocateBbNhuaHaoHutByRatioPercent(plasticLossTotalKg, mixingPlasticLines);
  const plasticThucXuatByLine = allocateBbNhuaHaoHutByRatioPercent(plasticThucXuatKg, mixingPlasticLines);
  const shiftSettingsTyped = (props.shiftSettings || []) as ShiftSetting[];
  const warehouseMovements = props.warehouseMovements || [];
  const plasticLossDetailRows = mixingPlasticLines.map((line, index) => {
    const kg = plasticLossKgByLine[index];
    const tiLeDm =
      line.tiLeDinhMucPercent !== null && Number.isFinite(line.tiLeDinhMucPercent)
        ? line.tiLeDinhMucPercent
        : null;
    const tiLeTt =
      line.tiLeThucTeTbPercent !== null && Number.isFinite(line.tiLeThucTeTbPercent)
        ? line.tiLeThucTeTbPercent
        : null;
    const bomDinhMucKg = lookupBomDinhMucKg(bomDinhMucByMaterial, line.materialCode, line.materialName);
    const dinhMucKg = bomDinhMucKg > 0 ? bomDinhMucKg : null;
    const thucXuatKg = plasticThucXuatByLine[index];
    const chenhLechKg =
      dinhMucKg !== null &&
      thucXuatKg !== null &&
      Number.isFinite(dinhMucKg) &&
      Number.isFinite(thucXuatKg)
        ? thucXuatKg - dinhMucKg
        : null;
    /** Đơn giá từ phiếu xuất NVL cùng ngày + ca lệnh. */
    const exportUnitPrice = resolveBbMaterialExportUnitPrice(
      order.ngay,
      order.shift,
      warehouseMovements,
      shiftSettingsTyped,
      line.materialCode,
      line.materialName
    );
    const lineUnitPrice = exportUnitPrice > 0 ? exportUnitPrice : null;
    const money =
      chenhLechKg !== null && lineUnitPrice !== null
        ? Math.round(chenhLechKg * lineUnitPrice)
        : 0;
    const thucXuatKgResolved =
      thucXuatKg !== null && Number.isFinite(thucXuatKg) ? thucXuatKg : null;
    const label = [line.materialCode, line.materialName].filter(Boolean).join(' — ') || '—';
    return {
      key: line.key,
      label,
      unit: 'kg',
      tiLeDm,
      tiLeTt,
      dinhMucKg,
      thucXuatKg: thucXuatKgResolved,
      thucXuatQty: thucXuatKgResolved,
      chenhLechKg,
      kg: kg !== null && Number.isFinite(kg) ? kg : null,
      unitPrice: lineUnitPrice,
      money
    };
  });

  /** Vật tư khác: định mức = SL thực tế × BOM; thực xuất = xuất kho + tồn đầu − tồn cuối + lỗi hỏng. */
  const otherLossDetailRows = otherMaterialRows.map(row => {
    const thucXuatKg = computeVatTuXuatThucDungKg(
      row.exportKg,
      row.openingKg,
      row.closingKg,
      row.damagedKg
    );
    const bomDinhMucKg = lookupBomDinhMucKg(bomDinhMucByMaterial, row.code, row.name);
    const dinhMucKg = bomDinhMucKg > 0 ? bomDinhMucKg : row.finishedKg;
    const chenhLechKg = thucXuatKg - dinhMucKg;
    const unit = row.unit || '-';
    const thucXuatQty =
      resolveUsageQtyFromKg(thucXuatKg, unit, row.code, row.name, materialsCatalog) ??
      (row.exportQty > 0 ? row.exportQty : null);
    const exportUnitPrice = resolveBbMaterialExportUnitPrice(
      order.ngay,
      order.shift,
      warehouseMovements,
      shiftSettingsTyped,
      row.code,
      row.name
    );
    const lineUnitPrice = exportUnitPrice > 0 ? exportUnitPrice : null;
    const money =
      Number.isFinite(chenhLechKg) && lineUnitPrice !== null
        ? Math.round(chenhLechKg * lineUnitPrice)
        : 0;
    const label = [row.code, row.name].filter(Boolean).join(' — ') || '—';
    return {
      key: row.key,
      label,
      dinhMucKg,
      thucXuatKg,
      thucXuatQty,
      chenhLechKg,
      unitPrice: lineUnitPrice,
      money,
      unit
    };
  });
  const otherLossTotalDinhMuc = otherLossDetailRows.reduce((sum, row) => sum + row.dinhMucKg, 0);
  const otherLossTotalThucXuat = otherLossDetailRows.reduce((sum, row) => sum + row.thucXuatKg, 0);
  const otherLossTotalChenhLech = otherLossTotalThucXuat - otherLossTotalDinhMuc;
  const otherLossDetailTotalMoney = otherLossDetailRows.reduce((sum, row) => sum + row.money, 0);
  const otherLossTotalUnitPrice = unitPrice(otherLossDetailTotalMoney, otherLossTotalChenhLech);
  const plasticLossTotalDinhMuc = plasticLossDetailRows.reduce(
    (sum, row) => sum + (row.dinhMucKg ?? 0),
    0
  );
  const plasticLossTotalThucXuat = plasticLossDetailRows.reduce(
    (sum, row) => sum + (row.thucXuatKg ?? 0),
    0
  );
  const plasticLossTotalChenhLech = plasticLossDetailRows.reduce(
    (sum, row) => sum + (row.chenhLechKg ?? 0),
    0
  );
  const plasticLossDetailTotalMoney = plasticLossDetailRows.reduce((sum, row) => sum + row.money, 0);
  const plasticLossTotalUnitPrice = unitPrice(plasticLossDetailTotalMoney, plasticLossTotalChenhLech);
  const hasEvalDetailRows = plasticLossDetailRows.length > 0 || otherLossDetailRows.length > 0;

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
        <p className="bb-machine-report-print-subtitle">(Báo cáo tổng hợp {props.machineReportLabel || 'máy BB'})</p>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">1. THÔNG TIN CHUNG</h2>
          <p className="bb-machine-report-print-info-note">
            ( Mỗi lệnh sản xuất tương ứng với 1 ca làm việc và 1 máy sản xuất )
          </p>
          <table className="shift-summary-print-table bb-machine-report-print-info">
            <tbody>
              <tr>
                <th>Số Lệnh</th>
                <td>{order.orderCode || '-'}</td>
                <th>CN Chính máy</th>
                <td>{order.staffMain || '-'}</td>
                <td className="bb-machine-report-print-info-shift">{order.shift || order.shiftLabel || '-'}</td>
              </tr>
              <tr>
                <th>Ngày làm việc</th>
                <td>{formatDate(order.ngay)}</td>
                <th>CN Phụ máy</th>
                <td>{order.staffAssistant || '-'}</td>
                <td className="bb-machine-report-print-info-shift">{order.shift || order.shiftLabel || '-'}</td>
              </tr>
              <tr>
                <th>Máy sản xuất</th>
                <td>{order.machine || '-'}</td>
                <th>CN Hỗ trợ/ học việc</th>
                <td>{order.staffSupport || '-'}</td>
                <td className="bb-machine-report-print-info-shift">{order.shift || order.shiftLabel || '-'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">2. BÁO CÁO THÀNH PHẨM ĐẠT NHẬP KHO</h2>
          <table className={`shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-product-table bb-finished-goods-print-table${showInsulationWeightCols ? ' bb-finished-goods-print-table-insulation' : ''}`}>
            <colgroup>
              <col className="bb-fg-col-stt" />
              <col className="bb-fg-col-code" />
              <col className="bb-fg-col-name" />
              <col className="bb-fg-col-unit" />
              <col className="bb-fg-col-qty-req" />
              <col className="bb-fg-col-w-req" />
              <col className="bb-fg-col-qty-ok" />
              <col className="bb-fg-col-w-actual" />
              {showInsulationWeightCols ? (
                <>
                  <col className="bb-fg-col-w-plastic" />
                  <col className="bb-fg-col-w-film" />
                </>
              ) : null}
              <col className="bb-fg-col-ratio" />
              <col className="bb-fg-col-lydo" />
            </colgroup>
            <thead>
              <tr>
                <th className="bb-machine-report-print-stt">STT</th>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>ĐVT</th>
                <th>Số lượng yêu cầu</th>
                <th>Trọng lượng yêu cầu</th>
                <th>Số lượng đạt</th>
                <th title={showInsulationWeightCols ? 'Tổng trọng lượng cuộn = Σ Cân sản phẩm' : undefined}>
                  Trọng lượng<br />thực tế
                </th>
                {showInsulationWeightCols ? (
                  <>
                    <th title="Trọng lượng nhựa = Cân SP − lõi − bì − màng">
                      Trọng lượng nhựa<br />thực tế
                    </th>
                    <th
                      className="bb-fg-film"
                      title="Trọng lượng màng = Khổ × chiều dài × 2 lớp × 0,02324 kg/m²"
                    >
                      TL màng
                    </th>
                  </>
                ) : null}
                <th
                  className="bb-fg-ratio"
                  title="Tỉ lệ số lượng đạt / số lượng kế hoạch"
                >
                  {showInsulationWeightCols ? 'Tỉ lệ' : <>Tỉ lệ SL đạt<br />/SL kế hoạch</>}
                </th>
                <th>Lý do sản phát sinh thêm hoặc không đạt kế hoạch</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((row, index) => {
                const ratio =
                  row.quantity > 0 ? (row.actualQuantity / row.quantity) * 100 : null;
                const lineLyDoKey = printLyDoLineKey(order.groupKey, row.key);
                const lineLyDo = props.lyDoByLine?.[lineLyDoKey] ?? '';
                return (
                  <tr key={row.key}>
                    <td className="shift-summary-print-center bb-machine-report-print-stt">{index + 1}</td>
                    <td className="bb-machine-report-print-product-code">{row.productCode || ''}</td>
                    <td>{row.productName || ''}</td>
                    <td className="shift-summary-print-center">{row.unit || ''}</td>
                    <td className="shift-summary-print-num">{printNumber(row.quantity, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.requiredWeight, 2)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.actualQuantity, qtyDigits)}</td>
                    <td className="shift-summary-print-num">{printNumber(row.actualWeight, 2)}</td>
                    {showInsulationWeightCols ? (
                      <>
                        <td className="shift-summary-print-num">
                          {printNumber(row.actualPlasticWeight, 2)}
                        </td>
                        <td className="shift-summary-print-num bb-fg-film">
                          {printNumber(row.actualFilmWeight > 0 ? row.actualFilmWeight : null, 2)}
                        </td>
                      </>
                    ) : null}
                    <td className="shift-summary-print-center bb-fg-ratio">
                      {ratio === null || !Number.isFinite(ratio)
                        ? ''
                        : `${formatNumber(Math.round(ratio), 0)}%`}
                    </td>
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
                <td
                  colSpan={4}
                  className="shift-summary-print-center shift-summary-print-total-label bb-finished-goods-print-total-label"
                >
                  Tổng
                </td>
                <td className="shift-summary-print-num">{printNumber(requiredQtyTotal, 2)}</td>
                <td className="shift-summary-print-num">{printNumber(requiredWeightTotal, 2)}</td>
                <td className="shift-summary-print-num">{printNumber(actualQtyTotal, qtyDigits)}</td>
                <td className="shift-summary-print-num">
                  {printNumber(productActualWeightTotal, 2)}
                </td>
                {showInsulationWeightCols ? (
                  <>
                    <td className="shift-summary-print-num">
                      {printNumber(productPlasticWeightTotal, 2)}
                    </td>
                    <td className="shift-summary-print-num bb-fg-film">
                      {printNumber(productFilmWeightTotal > 0 ? productFilmWeightTotal : null, 2)}
                    </td>
                  </>
                ) : null}
                <td className="shift-summary-print-center bb-fg-ratio">
                  {avgProductPlanRatio === null || !Number.isFinite(avgProductPlanRatio)
                    ? ''
                    : `${formatNumber(Math.round(avgProductPlanRatio), 0)}%`}
                </td>
                <td className="bb-machine-report-print-ly-do">&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">3. BÁO CÁO TIÊU HAO NGUYÊN VẬT LIỆU</h2>
          <h3 className="production-order-print-section-subtitle">3.1. NVL nhựa</h3>
          <table className="shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-material-table">
            <thead><tr>
              <th className="bb-machine-report-print-stt">STT</th>
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
              <th title="Chênh lệch = Tồn đầu + Xuất kho − Tồn cuối − Nhập thành phẩm − Lỗi hỏng">
                Chênh lệch<br />(Xuất − Nhập)<br />(Kg)
              </th>
            </tr></thead>
            <tbody>
              {plasticMaterialRows.length === 0 ? (
                <tr><td colSpan={14} className="shift-summary-print-center">Không có dữ liệu NVL.</td></tr>
              ) : (
                plasticMaterialRows.map((row, index) => {
                  const norm = row.normPercents.length > 0
                    ? row.normPercents.reduce((sum, value) => sum + value, 0) / row.normPercents.length
                    : null;
                  const actualUsedKg = computeVatTuXuatThucDungKg(
                    row.exportKg,
                    row.openingKg,
                    row.closingKg,
                    row.damagedKg
                  );
                  const finishedAndDamagedKg = row.finishedKg + row.damagedKg;
                  const varianceKg = computeChenhLechXuatNhapKg(
                    row.exportKg,
                    row.openingKg,
                    row.closingKg,
                    row.finishedKg,
                    row.damagedKg
                  );
                  return <tr key={row.key}>
                    <td className="shift-summary-print-center bb-machine-report-print-stt">{index + 1}</td>
                    <td>{row.code || '-'}</td>
                    <td className="bb-machine-report-print-material-name">{row.name || '-'}</td>
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

          <h3 className="production-order-print-section-subtitle">3.2. NVL khác</h3>
          <table className="shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-material-table bb-machine-report-print-material-table-other">
            <thead><tr>
              <th className="bb-machine-report-print-stt">STT</th>
              <th>Mã NVL</th>
              <th>Tên NVL</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Trọng lượng<br />tồn đầu ca</th>
              <th>Trọng lượng<br />vật tư xuất kho</th>
              <th>Trọng lượng<br />vật tư nhập<br />thành phẩm</th>
              <th>Trọng lượng<br />vật tư lỗi hỏng</th>
              <th>Trọng lượng<br />vật tư tồn<br />cuối ca</th>
              <th>Trọng lượng<br />Vật tư xuất<br />thực dùng</th>
              <th>Trọng lượng<br />thành phẩm +<br />Lỗi Hỏng<br />thực tế</th>
              <th title="Chênh lệch = Tồn đầu + Xuất kho − Tồn cuối − Nhập thành phẩm − Lỗi hỏng">
                Chênh lệch<br />(Xuất − Nhập)<br />(Kg)
              </th>
            </tr></thead>
            <tbody>
              {otherMaterialRows.length === 0 ? (
                <tr><td colSpan={13} className="shift-summary-print-center">Không có dữ liệu NVL.</td></tr>
              ) : (
                otherMaterialRows.map((row, index) => {
                  const actualUsedKg = computeVatTuXuatThucDungKg(
                    row.exportKg,
                    row.openingKg,
                    row.closingKg,
                    row.damagedKg
                  );
                  const finishedAndDamagedKg = row.finishedKg + row.damagedKg;
                  const varianceKg = computeChenhLechXuatNhapKg(
                    row.exportKg,
                    row.openingKg,
                    row.closingKg,
                    row.finishedKg,
                    row.damagedKg
                  );
                  /** Số lượng = Σ (SL sản lượng SP × ĐM thành phần NVL) — ĐVT gốc. */
                  const soLuong = row.actualQty > 0 ? row.actualQty : null;
                  return (
                    <tr key={row.key}>
                      <td className="shift-summary-print-center bb-machine-report-print-stt">{index + 1}</td>
                      <td>{row.code || '-'}</td>
                      <td className="bb-machine-report-print-material-name">{row.name || '-'}</td>
                      <td className="shift-summary-print-center">{row.unit || '-'}</td>
                      <td className="shift-summary-print-num">{printNumber(soLuong, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(row.openingKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(row.exportKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(row.finishedKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(row.damagedKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(row.closingKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(actualUsedKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(finishedAndDamagedKg, 2)}</td>
                      <td className="shift-summary-print-num">{printNumber(varianceKg, 2)}</td>
                    </tr>
                  );
                })
              )}
              {renderMaterialPrintTotalRow('Tổng vật tư khác', otherMaterialTotals, {
                includeMixingRatioCols: false,
                includeQtyCol: true
              })}
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">4. ĐÁNH GIÁ HIỆU QUẢ CA SẢN XUẤT</h2>

          <h3 className="production-order-print-section-subtitle">4.1. Tổng hợp</h3>
          <table className="shift-summary-print-table bb-machine-report-print-evaluation-table bb-machine-report-print-evaluation-summary-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Giá trị phân tích dữ liệu</th>
                <th className="shift-summary-print-num">Hàng lỗi</th>
                <th className="shift-summary-print-num">Thành phẩm</th>
                <th>Tỉ lệ hao hụt<br />Định mức</th>
                <th>Tỉ lệ hao hụt<br />thực tế</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="shift-summary-print-center">1</td>
                <td>Tỉ lệ hàng lỗi / thành phẩm</td>
                <td className="shift-summary-print-num">
                  {hangLoiTongKg > 0 ? printNumber(hangLoiTongKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">
                  {thanhPhamTongKg > 0 ? printNumber(thanhPhamTongKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">2%</td>
                <td className="shift-summary-print-num">
                  {printPercent(
                    thanhPhamTongKg > 0 ? tiLeLoiHongTrenThanhPham : evaluation?.tiLeLoiHong
                  )}
                </td>
              </tr>
              <tr>
                <td className="shift-summary-print-center">2</td>
                <td>Tỉ lệ hàng lỗi hỏng/ (Thành phẩm + Hàng lỗi)</td>
                <td className="shift-summary-print-num">
                  {hangLoiTongKg > 0 ? printNumber(hangLoiTongKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">
                  {thanhPhamTongKg > 0 ? printNumber(thanhPhamTongKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">2%</td>
                <td className="shift-summary-print-num">{printPercent(tiLeLoiHongTrenThanhPhamVaLoi)}</td>
              </tr>
              <tr className="bb-machine-report-print-eval-total-line">
                <td className="shift-summary-print-center">3</td>
                <td>Hao hụt nhựa</td>
                <td className="shift-summary-print-num">
                  {hangLoiKg > 0 ? printNumber(hangLoiKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">
                  {actualWeightTotal > 0 ? printNumber(actualWeightTotal, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">100%</td>
                <td className="shift-summary-print-num">
                  {printPercent(evaluation?.tiLeNhuaThucXuatVsDinhMuc)}
                </td>
              </tr>
              <tr>
                <td className="shift-summary-print-center">4</td>
                <td>Hao hụt màng</td>
                <td className="shift-summary-print-num">
                  {hangLoiOtherKg > 0 ? printNumber(hangLoiOtherKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">
                  {tongMangThanhPhamKg > 0 ? printNumber(tongMangThanhPhamKg, 3) : '—'}
                </td>
                <td className="shift-summary-print-num">100%</td>
                <td className="shift-summary-print-num">
                  {printPercent(evaluation?.tiLeMangThucXuatVsDinhMuc)}
                </td>
              </tr>
            </tbody>
          </table>

          <h3 className="production-order-print-section-subtitle">4.2. Chi tiết</h3>
          <table className="shift-summary-print-table bb-machine-report-print-evaluation-table bb-machine-report-print-evaluation-detail-table">
            <thead>
              <tr>
                <th className="bb-machine-report-print-stt">STT</th>
                <th>Giá trị phân tích dữ liệu</th>
                <th>Định mức Vật tư<br />của Số lượng nhập TP</th>
                <th>Trọng lượng thực<br />xuất dùng (kg)</th>
                <th>Số lượng thực<br />xuất dùng</th>
                <th>Chênh lệch<br />(Thực xuất Trừ Đ mức)</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {!hasEvalDetailRows ? (
                <tr>
                  <td colSpan={8} className="shift-summary-print-center bb-machine-report-print-eval-detail-empty">
                    Không có dòng chi tiết.
                  </td>
                </tr>
              ) : (
                <>
                  {plasticLossDetailRows.length > 0 ? (
                    <>
                      <tr className="bb-machine-report-print-eval-detail-group">
                        <td className="shift-summary-print-center bb-machine-report-print-stt">&nbsp;</td>
                        <td className="bb-machine-report-print-eval-detail-group-label">Hao hụt nhựa</td>
                        <td className="shift-summary-print-num">{printNumber(plasticLossTotalDinhMuc, 2)} kg</td>
                        <td className="shift-summary-print-num">{printNumber(plasticLossTotalThucXuat, 2)} kg</td>
                        <td className="shift-summary-print-num">{printNumber(plasticLossTotalThucXuat, 2)} kg</td>
                        <td className="shift-summary-print-num">{printNumber(plasticLossTotalChenhLech, 2)} kg</td>
                        <td className="shift-summary-print-num">
                          {plasticLossTotalUnitPrice !== null && plasticLossTotalUnitPrice > 0
                            ? `${printNumber(plasticLossTotalUnitPrice, 0)} đ/kg`
                            : '—'}
                        </td>
                        <td className="shift-summary-print-num">
                          {plasticLossDetailTotalMoney !== 0
                            ? `${formatMoney(plasticLossDetailTotalMoney, 0)} đ`
                            : '—'}
                        </td>
                      </tr>
                      {plasticLossDetailRows.map((row, index) => (
                        <tr key={row.key} className="bb-machine-report-print-eval-detail-line">
                          <td className="shift-summary-print-center bb-machine-report-print-stt bb-machine-report-print-stt-narrow">{index + 1}</td>
                          <td className="bb-machine-report-print-eval-detail-label">{row.label}</td>
                          <td className="shift-summary-print-num">{printNumber(row.dinhMucKg, 2)} kg</td>
                          <td className="shift-summary-print-num">{printNumber(row.thucXuatKg, 2)} kg</td>
                          <td className="shift-summary-print-num">{printQtyWithUnit(row.thucXuatQty, row.unit)}</td>
                          <td className="shift-summary-print-num">{printNumber(row.chenhLechKg, 2)} kg</td>
                          <td className="shift-summary-print-num">
                            {row.unitPrice !== null && row.unitPrice > 0
                              ? `${printNumber(row.unitPrice, 0)} đ/kg`
                              : '—'}
                          </td>
                          <td className="shift-summary-print-num">
                            {row.money !== 0 ? `${formatMoney(row.money, 0)} đ` : '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : null}
                  {otherLossDetailRows.length > 0 ? (
                    <>
                      <tr className="bb-machine-report-print-eval-detail-group">
                        <td className="shift-summary-print-center bb-machine-report-print-stt">&nbsp;</td>
                        <td className="bb-machine-report-print-eval-detail-group-label">Vật tư khác</td>
                        <td className="shift-summary-print-num">{printNumber(otherLossTotalDinhMuc, 2)} kg</td>
                        <td className="shift-summary-print-num">{printNumber(otherLossTotalThucXuat, 2)} kg</td>
                        <td className="shift-summary-print-num">—</td>
                        <td className="shift-summary-print-num">{printNumber(otherLossTotalChenhLech, 2)} kg</td>
                        <td className="shift-summary-print-num">
                          {otherLossTotalUnitPrice !== null && otherLossTotalUnitPrice > 0
                            ? `${printNumber(otherLossTotalUnitPrice, 0)} đ/kg`
                            : '—'}
                        </td>
                        <td className="shift-summary-print-num">
                          {otherLossDetailTotalMoney !== 0
                            ? `${formatMoney(otherLossDetailTotalMoney, 0)} đ`
                            : '—'}
                        </td>
                      </tr>
                      {otherLossDetailRows.map((row, index) => (
                        <tr key={row.key} className="bb-machine-report-print-eval-detail-line">
                          <td className="shift-summary-print-center bb-machine-report-print-stt bb-machine-report-print-stt-narrow">
                            {plasticLossDetailRows.length + index + 1}
                          </td>
                          <td className="bb-machine-report-print-eval-detail-label">{row.label}</td>
                          <td className="shift-summary-print-num">{printNumber(row.dinhMucKg, 2)} kg</td>
                          <td className="shift-summary-print-num">{printNumber(row.thucXuatKg, 2)} kg</td>
                          <td className="shift-summary-print-num">{printQtyWithUnit(row.thucXuatQty, row.unit)}</td>
                          <td className="shift-summary-print-num">{printNumber(row.chenhLechKg, 2)} kg</td>
                          <td className="shift-summary-print-num">
                            {row.unitPrice !== null && row.unitPrice > 0
                              ? `${printNumber(row.unitPrice, 0)} đ/kg`
                              : '—'}
                          </td>
                          <td className="shift-summary-print-num">
                            {row.money !== 0 ? `${formatMoney(row.money, 0)} đ` : '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </section>

        <section className="shift-summary-print-section">
          <h2 className="production-order-print-section-title">5. GHI CHÚ</h2>
          {editableNote ? (
            <textarea
              className="bb-machine-report-print-note bb-print-ly-do-input"
              value={ghiChu}
              onChange={event => props.onNoteChange?.(order.groupKey, event.target.value)}
              rows={4}
              placeholder="Nhập ghi chú hiển thị trên phiếu in..."
              aria-label="Ghi chú"
            />
          ) : (
            <div className="bb-machine-report-print-note">{ghiChu || '—'}</div>
          )}
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
