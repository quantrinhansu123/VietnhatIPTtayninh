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
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem,
  normalizeWarehouseCodeKey,
  type WarehouseWeightCatalogItem
} from '../utils/warehouseWeight';
import { resolveProductMaterialBaseKg, resolveProductNplItemWeightKg } from '../features/san-pham';
import {
  allocateBbKgByWeightShare,
  buildBbMaterialKgMapsFromTabLines,
  isBbMachineText,
  isNnsTronMaterial,
  lookupBbMaterialKgByCodeOrName,
  lookupNnsTronTonDauKg,
  isInsulationMachineText,
  resolveBbDamagedPlasticLoiHongKg,
  resolveBbDamagedOtherLoiHongKg,
  buildBbWarehouseExportMaterialTotalsForOrderFromExportTab,
  buildOrderBomMaterialMatchKeys,
  isMaterialInProductBom,
  type BbCuoiCaGroup,
  type BbDamagedGoodsGroup,
  type BbDanhGiaHaoHutGroup,
  type BbDauCaGroup,
  type BbInboundReportRow,
  type BbMixingRatioGroup,
  type BbProductionOrderGroup,
  type BbSanLuongGroup,
  type BbSanLuongProductGroup,
  type BbThucDungGroup,
  type BbWarehouseExportGroup,
  type BbWarehouseExportLineRow,
  splitBbDanhGiaSummaryRowsBySection,
  splitBbDanhGiaSummaryRowsRatioVsDetail,
} from '../utils/controlBoardBbMachineReport';
import { isBbTieuHaoPlasticRow } from '../utils/bbTieuHaoNvlPrintRows';
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
  /** Dòng tab «Phiếu xuất kho» (đã lọc ca khi Tính toán). */
  exportRows?: BbWarehouseExportLineRow[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaGroups: BbCuoiCaGroup[];
  damagedGroups: BbDamagedGoodsGroup[];
  mixingGroups: BbMixingRatioGroup[];
  danhGiaGroups: BbDanhGiaHaoHutGroup[];
  /** Tab tiêu hao NVL — mục 3.1/3.2 chỉ mirror, không tính lại. */
  thucDungGroups?: BbThucDungGroup[];
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
  /** Phiếu xuất/nhập kho — lấy đơn giá NVL theo ngày lệnh (mọi ca). */
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  /** Xuất kho mục 3.1/3.2: gom theo ngày (mọi ca), không lọc ca hiện tại. */
  warehouseMovementsByDate?: ShiftSummaryWarehouseMovement[];
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
   * Số lượng thành phẩm mục 3.2 (ĐVT gốc) =
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

/** 3.1 NVL nhựa và phụ gia trộn: ĐVT kg và không phải lõi/túi/băng dính. */
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

/** Cùng công thức tab «Báo cáo lỗi hỏng»: ưu tiên tỉ lệ trộn thực tế, không có thì định mức. */
function resolveLoiHongMixingTiLePercent(line: {
  tiLeTronPercent: number | null;
  tiLeDinhMucPercent: number | null;
}) {
  if (line.tiLeTronPercent != null && line.tiLeTronPercent > 0) return line.tiLeTronPercent;
  if (line.tiLeDinhMucPercent != null && line.tiLeDinhMucPercent > 0) return line.tiLeDinhMucPercent;
  return null;
}

/** Xuất thực dùng = Tồn đầu ca + Xuất kho − Tồn cuối ca. */
function computeVatTuXuatThucDungKg(exportKg: number, openingKg: number, closingKg: number) {
  return computeMaterialUsageKg(exportKg, openingKg, closingKg);
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

/** TL nhựa thành phẩm theo SP — chỉ `trong_luong_nhua` × SL (không lấy cân / TL cuộn). */
function resolveProductSanLuongPlasticKg(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  props: PrintProps
): number | null {
  const sl = resolveProductSanLuongQuantity(order, productCode, productName, props);
  const catalog =
    findCatalogProduct(props.products, productCode, productName) ||
    findProduct(props.products, productCode);
  if (catalog && sl > 0) {
    const perUnit = resolveProductMaterialBaseKg(catalog);
    if (perUnit > 0) return Math.round(perUnit * sl * 10000) / 10000;
  }
  return null;
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

/** Tổng nhựa thành phẩm theo lệnh = Σ (trong_luong_nhua × SL) từng SP. */
function resolveOrderSanLuongPlasticKg(order: BbProductionOrderGroup, props: PrintProps): number {
  let total = 0;
  for (const line of order.lines) {
    const kg = resolveProductSanLuongPlasticKg(
      order,
      line.productCode,
      line.productName,
      props
    );
    if (kg != null && kg > 0) total += kg;
  }
  return total > 0 ? Math.round(total * 10000) / 10000 : 0;
}

/** Banner «Tổng nhựa thành phẩm» đã gắn trên dòng tiêu hao nhựa lúc Tính toán. */
function resolveTongNhuaThanhPhamFromThucDung(group: BbThucDungGroup | undefined): number {
  for (const line of group?.lines || []) {
    const kg = line.nhuaThanhPhamHeaderKg;
    if (kg != null && Number.isFinite(kg) && kg > 0) return kg;
  }
  return 0;
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

function buildMaterialRows(order: BbProductionOrderGroup, props: PrintProps) {
  const rows = new Map<string, MaterialPrintRow>();
  const orderBomKeys = buildOrderBomMaterialMatchKeys(order, props.products);
  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  const isInOrderBom = (code: string, name: string) =>
    isMaterialInProductBom(code, name, orderBomKeys);
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

  // Seed danh sách NVL / % định mức từ BOM — finishedKg lấy sau từ tab Báo cáo sản lượng.
  // Số lượng thành phẩm (3.2) = Σ (SL sản lượng từng mã SP × định mức thành phần NVL của SP đó).
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

  const exportMaterialTotals = buildBbWarehouseExportMaterialTotalsForOrderFromExportTab(
    props.exportGroups || [],
    {
      orderCode: order.orderCode,
      groupKey: order.groupKey,
      ngay: parseProductionOrderFilterDate(order.ngay) || order.ngay,
      shift: order.shift,
      machine: order.machine
    },
    props.exportRows || [],
    props.materials
  );
  for (const entry of exportMaterialTotals) {
    const row = ensure(entry.itemCode, entry.itemName, entry.unit);
    if (entry.quantity > 0) row.exportQty = round4(row.exportQty + entry.quantity);
    if (entry.weightKg > 0) row.exportKg = round4(row.exportKg + entry.weightKg);
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
  const groupIsInsulation = isInsulationMachineText(order.machine, props.machineReportLabel);
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

  // NNS-TRON tồn đầu: phân bổ theo tỉ lệ + cộng tồn trực tiếp theo mã (chưa trộn…).
  if (nnsTronTonDauKg > 0) {
    for (const row of rows.values()) {
      if (isNnsTronMaterial(row.code, row.name)) {
        row.openingKg = 0;
        continue;
      }
      const directKg = lookupBbMaterialKgByCodeOrName(tonDauMaps, row.code, row.name);
      const tiLeThucTe = row.actualPercent;
      if (tiLeThucTe !== null && Number.isFinite(tiLeThucTe) && tiLeThucTe > 0) {
        row.openingKg = round4(directKg + nnsTronTonDauKg * (tiLeThucTe / 100));
      } else {
        row.openingKg = round4(directKg);
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
    // Báo cáo cuối ca: NNS-TRON × tỉ lệ + tồn trực tiếp theo mã.
    if (nnsTronTonCuoiKg > 0) {
      for (const row of rows.values()) {
        if (isNnsTronMaterial(row.code, row.name)) {
          row.closingKg = 0;
          continue;
        }
        const directKg = lookupBbMaterialKgByCodeOrName(tonCuoiMaps, row.code, row.name);
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
          row.closingKg = round4(directKg + nnsTronTonCuoiKg * (tiLe / 100));
        } else {
          row.closingKg = round4(directKg);
        }
      }
    }
  }

  // Cột «Trọng lượng vật tư nhập thành phẩm»:
  // Tổng thẳng TL NVL theo từng mã SP trên lệnh (= cột TL NVL Báo cáo sản lượng từng SP).
  for (const row of rows.values()) {
    row.finishedKg = 0;
  }

  const seenSanLuongProductKeys = new Set<string>();
  for (const productLine of order.lines) {
    const productGroup = findSanLuongProductGroup(
      order,
      productLine.productCode,
      productLine.productName,
      props.sanLuongGroups || []
    );
    if (!productGroup) continue;
    const spKey =
      normalizeProductCodeKey(productGroup.productCode) ||
      normalizeProductCodeKey(productGroup.productName) ||
      productGroup.key;
    if (spKey && seenSanLuongProductKeys.has(spKey)) continue;
    if (spKey) seenSanLuongProductKeys.add(spKey);
    for (const line of productGroup.lines || []) {
      if (!isInOrderBom(line.itemCode, line.itemName)) continue;
      const weight =
        line.actualWeightKg > 0
          ? line.actualWeightKg
          : line.normWeightKg > 0
            ? line.normWeightKg
            : 0;
      if (!(weight > 0)) continue;
      const unit =
        line.amountType === 'percent' ? 'kg' : String(line.unit || '').trim() || 'Cái';
      const row = ensure(line.itemCode, line.itemName, unit);
      row.finishedKg = round4(row.finishedKg + weight);
    }
  }

  // Số lượng thành phẩm 3.2 + bổ sung finishedKg khi báo cáo sản lượng thiếu dòng NVL.
  const materialsCatalog = props.materials.map(mapMaterialToWeightCatalogItem);
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
      // Đã có TL NVL từ Báo cáo sản lượng → không ghi đè.
      if (row.finishedKg > 0) continue;
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
    .filter(row => {
      if (
        isNnsTronMaterial(row.code, row.name) &&
        (nnsTronTonDauKg > 0 || nnsTronTonCuoiKg > 0 || closingMaterialLines.length > 0)
      ) {
        return false;
      }
      if (isInOrderBom(row.code, row.name)) return true;
      // Giữ tồn đầu/cuối ca thực tế (quét máy) và NVL đã xuất kho thực tế, bỏ mã đã gỡ khỏi BOM.
      return row.openingKg > 0 || row.closingKg > 0 || row.exportKg > 0;
    })
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
    isInsulationMachine: isInsulationMachineText(order.machine, props.machineReportLabel)
  });
  const hangLoiOtherKg = resolveBbDamagedOtherLoiHongKg(damaged?.lines || [], {
    isInsulationMachine: isInsulationMachineText(order.machine, props.machineReportLabel)
  });
  const ghiChu = (props.noteByOrder?.[order.groupKey] || '').trim();
  /** Mục 3: chỉ lấy từ tab tiêu hao (`thucDungGroups`) — không gọi buildMaterialRows. */
  const thucDungGroup =
    findOrderGroup(props.thucDungGroups || [], order) ||
    (props.thucDungGroups || []).find(g => g.orderCode === order.orderCode);
  const materialRowsFromTab = (thucDungGroup?.lines || []).map(line => ({
    key: line.key,
    code: line.materialCode,
    name: line.materialName,
    unit: line.unit || 'kg',
    normPercents:
      line.tiLeDinhMucPercent != null && Number.isFinite(line.tiLeDinhMucPercent)
        ? [line.tiLeDinhMucPercent]
        : [],
    actualPercent: line.tiLeThucTeTbPercent,
    actualMixedKg: line.mixingShiftMaterialKg ?? 0,
    openingKg: line.tonDauKg,
    exportKg: line.xuatTrongCaKg,
    exportQty: line.exportQty ?? 0,
    actualQty: line.finishedQty ?? 0,
    finishedKg: line.klThucTeKg,
    damagedKg: line.loiHongKg,
    closingKg: line.tonCuoiKg,
    actualUsedKg: line.weightKg,
    finishedAndDamagedKg: line.klThucTePlusLoiKg,
    varianceKg: line.chenhLechKg,
    isPlastic: isBbTieuHaoPlasticRow(line)
  }));
  const sortByUnitThenName = (
    a: (typeof materialRowsFromTab)[number],
    b: (typeof materialRowsFromTab)[number]
  ) => {
    const unitA = String(a.unit || 'kg').trim();
    const unitB = String(b.unit || 'kg').trim();
    const unitCmp = unitA.localeCompare(unitB, 'vi', { sensitivity: 'base' });
    if (unitCmp !== 0) return unitCmp;
    const nameCmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi');
    if (nameCmp !== 0) return nameCmp;
    return String(a.code || '').localeCompare(String(b.code || ''), 'vi');
  };
  const plasticMaterialRows = materialRowsFromTab.filter(row => row.isPlastic).sort(sortByUnitThenName);
  const otherMaterialRows = materialRowsFromTab.filter(row => !row.isPlastic).sort(sortByUnitThenName);
  const sumFromTab = (rows: typeof materialRowsFromTab) => {
    const totals = {
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
      totals.openingKg += row.openingKg;
      totals.exportKg += row.exportKg;
      totals.finishedKg += row.finishedKg;
      totals.damagedKg += row.damagedKg;
      totals.closingKg += row.closingKg;
      totals.actualUsedKg += row.actualUsedKg;
      totals.finishedAndDamagedKg += row.finishedAndDamagedKg;
      totals.varianceKg += row.varianceKg;
    }
    return totals;
  };
  /** Nhựa · Nhập TP / tổng: lấy riêng banner «Tổng nhựa thành phẩm», không cộng phân bổ từng NVL. */
  const tongNhuaThanhPhamBannerKg = resolveTongNhuaThanhPhamFromThucDung(thucDungGroup);
  const tongNhuaLoiBannerKg = (() => {
    for (const line of thucDungGroup?.lines || []) {
      const kg = line.nhuaLoiHeaderKg;
      if (kg != null && Number.isFinite(kg) && kg > 0) return kg;
    }
    return 0;
  })();
  const plasticMaterialTotalsBase = sumFromTab(plasticMaterialRows);
  const plasticFinishedKg =
    tongNhuaThanhPhamBannerKg > 0 ? tongNhuaThanhPhamBannerKg : plasticMaterialTotalsBase.finishedKg;
  const plasticDamagedKg =
    tongNhuaLoiBannerKg > 0 ? tongNhuaLoiBannerKg : plasticMaterialTotalsBase.damagedKg;
  const plasticMaterialTotals =
    tongNhuaThanhPhamBannerKg > 0 || tongNhuaLoiBannerKg > 0
      ? {
          ...plasticMaterialTotalsBase,
          finishedKg: plasticFinishedKg,
          damagedKg: plasticDamagedKg,
          finishedAndDamagedKg: plasticFinishedKg + plasticDamagedKg
        }
      : plasticMaterialTotalsBase;
  const otherMaterialTotals = sumFromTab(otherMaterialRows);
  const useCanTuDong = props.sanLuongSource === 'can-tu-dong';
  const qtyDigits = useCanTuDong ? 0 : 2;
  const editableLyDo = Boolean(props.editableLyDo && props.onLyDoChange);
  const editableNote = Boolean(props.editableNote && props.onNoteChange);
  const showInsulationWeightCols = isInsulationMachineReport(props, order);
  const productRows = order.lines.map(line => {
    const actualQuantity =
      line.actualQuantity > 0
        ? line.actualQuantity
        : resolveActualQuantityForProduct(order, line.productCode, line.productName, props);
    const actualPlasticWeight =
      line.actualPlasticWeightKg != null && line.actualPlasticWeightKg > 0
        ? line.actualPlasticWeightKg
        : resolveProductSanLuongPlasticKg(order, line.productCode, line.productName, props);
    const actualFilmWeight = showInsulationWeightCols
      ? line.actualFilmWeightKg != null && line.actualFilmWeightKg > 0
        ? line.actualFilmWeightKg
        : resolveProductSanLuongFilmKg(order, line.productCode, line.productName, props)
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
  const tongNhuaThanhPhamCatalogKg = resolveOrderSanLuongPlasticKg(order, props);
  const tongMangThanhPhamKg = resolveOrderSanLuongFilmKg(order, props);
  const tongCuonThanhPhamKg = showInsulationWeightCols ? resolveOrderSanLuongRollKg(order, props) : 0;
  const lineActualPlasticTotal = productRows.reduce(
    (sum, row) => sum + (row.actualPlasticWeight || 0),
    0
  );
  const lineActualFilmTotal = productRows.reduce((sum, row) => sum + (row.actualFilmWeight || 0), 0);
  /** Phần nhựa: chỉ «Tổng nhựa thành phẩm» (banner tiêu hao → catalog × SL → Σ dòng SP). */
  const tongNhuaThanhPhamKg =
    tongNhuaThanhPhamBannerKg > 0
      ? tongNhuaThanhPhamBannerKg
      : tongNhuaThanhPhamCatalogKg > 0
        ? tongNhuaThanhPhamCatalogKg
        : lineActualPlasticTotal;
  const actualWeightTotal = tongNhuaThanhPhamKg;
  const productActualWeightTotal = showInsulationWeightCols
    ? tongCuonThanhPhamKg > 0
      ? tongCuonThanhPhamKg
      : lineActualWeightTotal
    : actualWeightTotal;
  const productPlasticWeightTotal = tongNhuaThanhPhamKg;
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
  /** 4.1 dòng 3–4: tỉ lệ hao hụt thực tế = Hàng lỗi ÷ Thành phẩm (cùng cột trên dòng đó). */
  const tiLeHaoHutNhuaThucTe = computePercentRatio(
    hangLoiKg > 0 ? hangLoiKg : 0,
    actualWeightTotal > 0 ? actualWeightTotal : 0
  );
  const tiLeHaoHutMangThucTe = computePercentRatio(
    hangLoiOtherKg > 0 ? hangLoiOtherKg : 0,
    tongMangThanhPhamKg > 0 ? tongMangThanhPhamKg : 0
  );
  /**
   * 4.1 «Dữ liệu định mức» · Hao hụt nhựa = «Tổng nhựa thành phẩm»
   * (không lấy Trọng lượng nhựa + phụ gia × SL).
   */
  const duLieuDinhMucLenhTongKg = order.lines.reduce((sum, line) => {
    const kg = line.totalNormKg;
    return sum + (kg != null && Number.isFinite(kg) && kg > 0 ? kg : 0);
  }, 0);
  const duLieuDinhMucTongKg =
    order.totalNormKg > 0 ? order.totalNormKg : duLieuDinhMucLenhTongKg;

  const duLieuDinhMucNhuaKg = tongNhuaThanhPhamKg;

  const chenhLechXuatNhapNhuaKg = plasticMaterialTotals.varianceKg;
  const tiLeChenhLechNhua = computePercentRatio(chenhLechXuatNhapNhuaKg, duLieuDinhMucNhuaKg);
  const filmMaterialTotals = sumFromTab(materialRowsFromTab.filter(isFilmMaterialPrintRow));
  const duLieuDinhMucMangKg = filmMaterialTotals.finishedKg;
  const chenhLechXuatNhapMangKg = filmMaterialTotals.varianceKg;
  const tiLeChenhLechMang = computePercentRatio(chenhLechXuatNhapMangKg, duLieuDinhMucMangKg);
  const chenhLechXuatNhapTongKg = chenhLechXuatNhapNhuaKg;
  const tiLeChenhLechTong = computePercentRatio(chenhLechXuatNhapTongKg, duLieuDinhMucTongKg);

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
                      title="Trọng lượng màng = trọng lượng màng trong BOM × 2 × số lượng"
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
          <h3 className="production-order-print-section-subtitle">3.1. NVL nhựa và phụ gia trộn</h3>
          <table className="shift-summary-print-table shift-summary-print-table-wide bb-machine-report-print-material-table">
            <thead><tr>
              <th className="bb-machine-report-print-stt">STT</th>
              <th>Mã NVL</th>
              <th>Tên NVL</th>
              <th>ĐVT</th>
              <th>Tỉ lệ trộn<br />Định mức</th>
              <th>Tỉ lệ trộn<br />Thực tế</th>
              <th>Trọng lượng<br />tồn đầu ca</th>
              <th title="Tab «Dữ liệu xuất kho» · cột Tổng (kg) / trọng lượng xuất — lấy thẳng, không tính lại">
                Trọng lượng<br />vật tư xuất kho
              </th>
              <th title="Tab «Báo cáo sản lượng» · TL thực tế NVL — lấy thẳng, không tính lại từ BOM">
                Trọng lượng<br />vật tư nhập<br />thành phẩm
              </th>
              <th title="Tab «Dữ liệu trong báo cáo hàng lỗi hỏng» · Trọng lượng lỗi — lấy thẳng">
                Trọng lượng<br />vật tư lỗi hỏng
              </th>
              <th title="Tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» — lấy thẳng">
                Trọng lượng<br />vật tư tồn<br />cuối ca
              </th>
              <th title="Xuất thực dùng = Tồn đầu ca + Xuất kho − Tồn cuối ca">
                Trọng lượng<br />Vật tư xuất<br />thực dùng
              </th>
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
                  const actualUsedKg = row.actualUsedKg;
                  const finishedAndDamagedKg = row.finishedAndDamagedKg;
                  const varianceKg = row.varianceKg;
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
              <th>Số lượng<br />thành phẩm</th>
              <th>Trọng lượng<br />tồn đầu ca</th>
              <th title="Tab «Dữ liệu xuất kho» · cột Tổng (kg) / trọng lượng xuất — lấy thẳng, không tính lại">
                Trọng lượng<br />vật tư xuất kho
              </th>
              <th title="Tab «Báo cáo sản lượng» · TL thực tế NVL — lấy thẳng, không tính lại từ BOM">
                Trọng lượng<br />vật tư nhập<br />thành phẩm
              </th>
              <th title="Tab «Dữ liệu trong báo cáo hàng lỗi hỏng» · Trọng lượng lỗi — lấy thẳng">
                Trọng lượng<br />vật tư lỗi hỏng
              </th>
              <th title="Tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» — lấy thẳng">
                Trọng lượng<br />vật tư tồn<br />cuối ca
              </th>
              <th title="Xuất thực dùng = Tồn đầu ca + Xuất kho − Tồn cuối ca">
                Trọng lượng<br />Vật tư xuất<br />thực dùng
              </th>
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
                  const actualUsedKg = row.actualUsedKg;
                  const finishedAndDamagedKg = row.finishedAndDamagedKg;
                  const varianceKg = row.varianceKg;
                  /** Số lượng thành phẩm = từ tab tiêu hao (finishedQty). */
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

          <h3 className="production-order-print-section-subtitle">Báo cáo tổng hợp</h3>
          {(() => {
            const { mixingRows, otherRows } = splitBbDanhGiaSummaryRowsBySection(
              evaluation?.summaryRows
            );
            const { ratioRows, detailRows: mixingDetailRows } =
              splitBbDanhGiaSummaryRowsRatioVsDetail(mixingRows);
            const fmtQty = (value: number | null | undefined) =>
              value != null && Number.isFinite(value) ? printNumber(value, 1) : '—';
            const fmtThucXuatKg = (value: number | null | undefined) =>
              value != null && Number.isFinite(value) ? printNumber(value, 2) : '—';
            const fmtMoneyCell = (value: number | null | undefined) =>
              value != null && Number.isFinite(value) && value !== 0
                ? formatMoney(value, 0)
                : '—';
            const fmtDonGia = (value: number | null | undefined) =>
              value != null && Number.isFinite(value) && value > 0 ? formatMoney(value, 0) : '—';
            const renderRatioSection = (sectionRows: typeof ratioRows) => {
              if (sectionRows.length === 0) return null;
              return (
                <React.Fragment key="ti-le-loi-hong">
                  <h4 className="production-order-print-section-subtitle">Tỉ lệ hàng lỗi hỏng</h4>
                  <table className="shift-summary-print-table bb-machine-report-print-evaluation-table bb-machine-report-print-evaluation-summary-table">
                    <thead>
                      <tr>
                        <th>Chỉ số</th>
                        <th className="shift-summary-print-num">
                          Tỉ lệ hao hụt
                          <br />
                          Định mức
                        </th>
                        <th className="shift-summary-print-num">
                          Tỉ lệ hao hụt
                          <br />
                          thực tế
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionRows.map((row, index) => (
                        <tr key={`ratio|${row.id}|${index}`}>
                          <td>{row.label}</td>
                          <td className="shift-summary-print-num">
                            {printPercent(row.tiLeHaoHutDinhMucPercent)}
                          </td>
                          <td className="shift-summary-print-num">
                            {printPercent(row.tiLeHaoHutThucTe)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </React.Fragment>
              );
            };
            const renderSummarySection = (
              title: string,
              sectionRows: typeof mixingRows
            ) => (
              <React.Fragment key={title}>
                <h4 className="production-order-print-section-subtitle">{title}</h4>
                <table className="shift-summary-print-table bb-machine-report-print-evaluation-table bb-machine-report-print-evaluation-summary-table">
                  <colgroup>
                    <col className="bb-eval-sum-col-stt" />
                    <col className="bb-eval-sum-col-label" />
                    <col className="bb-eval-sum-col-num" />
                    <col className="bb-eval-sum-col-num" />
                    <col className="bb-eval-sum-col-num" />
                    <col className="bb-eval-sum-col-money" />
                    <col className="bb-eval-sum-col-money" />
                    <col className="bb-eval-sum-col-note" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Giá trị phân tích dữ liệu</th>
                      <th
                        className="shift-summary-print-num"
                        title="Vật tư trộn: Tổng nhựa định mức (banner) × tỉ lệ % — chỉ nhựa ĐM"
                      >
                        ĐM vật tư
                        <br />
                        nhập TP (kg)
                      </th>
                      <th className="shift-summary-print-num">
                        Thực xuất
                        <br />
                        dùng (kg)
                      </th>
                      <th
                        className="shift-summary-print-num"
                        title="Chênh lệch = Thực xuất dùng − Định mức nhập TP"
                      >
                        Chênh lệch
                        <br />
                        (TX − ĐM)
                      </th>
                      <th className="shift-summary-print-num">Đơn giá</th>
                      <th className="shift-summary-print-num">Thành tiền</th>
                      <th>Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionRows.length > 0 ? (
                      sectionRows.map((row, index) => {
                        const isTong = row.id === 'tong';
                        return (
                          <tr
                            key={`${row.section || 'tron'}|${row.id}|${row.sttCode || row.materialCode || ''}|${index}`}
                            className={isTong ? 'bb-machine-report-print-eval-total-line' : undefined}
                          >
                            <td className="shift-summary-print-center">
                              {row.sttCode || (isTong ? '' : '—')}
                            </td>
                            <td>{row.label}</td>
                            <td className="shift-summary-print-num">{fmtQty(row.dinhMucVatTuKg)}</td>
                            <td className="shift-summary-print-num">{fmtThucXuatKg(row.thucXuatKg)}</td>
                            <td className="shift-summary-print-num">{fmtQty(row.chenhLechKg)}</td>
                            <td className="shift-summary-print-num">{fmtDonGia(row.donGia)}</td>
                            <td className="shift-summary-print-num">{fmtMoneyCell(row.thanhTien)}</td>
                            <td>{row.danhGia || ''}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="shift-summary-print-center">
                          Chưa có dòng {title.toLowerCase()}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </React.Fragment>
            );
            if ((evaluation?.summaryRows || []).length === 0) {
              return (
                <table className="shift-summary-print-table bb-machine-report-print-evaluation-table bb-machine-report-print-evaluation-summary-table">
                  <tbody>
                    <tr>
                      <td colSpan={8} className="shift-summary-print-center">
                        Chưa có bảng báo cáo tổng hợp — bấm Tính toán trên báo cáo.
                      </td>
                    </tr>
                  </tbody>
                </table>
              );
            }
            return (
              <>
                {renderRatioSection(ratioRows)}
                {renderSummarySection('Vật tư trộn', mixingDetailRows)}
                {renderSummarySection('Các vật tư còn lại', otherRows)}
              </>
            );
          })()}
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
