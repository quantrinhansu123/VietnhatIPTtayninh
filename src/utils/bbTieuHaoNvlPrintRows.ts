/**
 * Builder tiêu hao NVL khớp phiếu in BB (mục 3.1 / 3.2).
 * Nguồn sự thật cho tab `bao_cao_tieu_hao_nvl` và phiếu in (chỉ mirror).
 */
import { normalizeProductCodeKey, type ProductRow } from '../features/san-pham/types';
import type { MaterialRow } from '../features/kho-nvl';
import { formatProductionOrderShiftLabel, type ProductionOrderLookupSetting } from '../features/ke-hoach-san-xuat';
import { parseProductionOrderFilterDate } from '../features/cai-dat-thoi-gian';
import {
  computeMaterialUsageKg,
  isWarehousePlasticNvlLine,
  isWarehouseTapeExportItem
} from './controlBoardShiftSummary';
import {
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem,
  normalizeWarehouseCodeKey,
  type WarehouseWeightCatalogItem
} from './warehouseWeight';
import {
  buildBbMaterialKgMapsFromTabLines,
  buildBbWarehouseExportMaterialTotalsForOrderFromExportTab,
  buildOrderBomMaterialMatchKeys,
  isInsulationMachineText,
  isMaterialInProductBom,
  isNnsTronMaterial,
  lookupBbMaterialKgByCodeOrName,
  lookupNnsTronTonDauKg,
  resolveBbLoiHongMixingLineWeightKg,
  resolveBbLoiHongNnkmNcTotalKg,
  sumBbDamagedFilmScrapKg,
  type BbCuoiCaGroup,
  type BbDamagedGoodsGroup,
  type BbDauCaGroup,
  type BbMixingRatioGroup,
  type BbProductionOrderGroup,
  type BbSanLuongGroup,
  type BbSanLuongProductGroup,
  type BbThucDungLineRow,
  type BbWarehouseExportGroup,
  type BbWarehouseExportLineRow
} from './controlBoardBbMachineReport';
import { shiftNamesMatch, type ShiftSetting } from './shiftSettings';

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function isPlasticNvl(row: { code: string; name: string; unit: string }) {
  return isWarehousePlasticNvlLine({
    warehouseKind: 'nvl',
    itemCode: row.code,
    itemName: row.name,
    unit: row.unit
  });
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

function resolveMaterialUnit(
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

function groupMatchesOrder(groupOrderCode: string, orderCode: string) {
  const target = orderCode.trim().toUpperCase();
  return groupOrderCode
    .split(',')
    .map(code => code.trim().toUpperCase())
    .some(code => code === target);
}

function findOrderGroup<T extends { orderCode: string; groupKey?: string }>(
  groups: T[],
  order: { orderCode: string; groupKey?: string }
) {
  if (order.groupKey) {
    const byKey = groups.find(group => group.groupKey === order.groupKey);
    if (byKey) return byKey;
  }
  return groups.find(group => groupMatchesOrder(group.orderCode, order.orderCode));
}

function findOrderGroups<
  T extends { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
>(
  groups: T[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
) {
  if (order.groupKey) {
    const byKey = groups.filter(group => group.groupKey === order.groupKey);
    if (byKey.length > 0) return byKey;
  }
  const byOrder = groups.filter(group => groupMatchesOrder(group.orderCode, order.orderCode));
  if (byOrder.length > 0) return byOrder;
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

function resolveProductSanLuongQuantity(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  sanLuongGroups: BbSanLuongGroup[]
) {
  const productGroup = findSanLuongProductGroup(order, productCode, productName, sanLuongGroups);
  if (productGroup && productGroup.quantity > 0) return productGroup.quantity;
  const line = order.lines.find(
    row =>
      normalizeProductCodeKey(row.productCode) === normalizeProductCodeKey(productCode) ||
      normalizeProductCodeKey(row.productName) === normalizeProductCodeKey(productName)
  );
  return line && line.actualQuantity > 0 ? line.actualQuantity : 0;
}

type MaterialBuildRow = {
  key: string;
  code: string;
  name: string;
  unit: string;
  normPercents: number[];
  actualPercent: number | null;
  actualMixedKg: number;
  openingKg: number;
  exportKg: number;
  exportQty: number;
  actualQty: number;
  finishedKg: number;
  damagedKg: number;
  closingKg: number;
};

function buildMaterialRowsForOrder(input: {
  order: BbProductionOrderGroup;
  products: ProductRow[];
  materials: MaterialRow[];
  exportGroups: BbWarehouseExportGroup[];
  exportRows: BbWarehouseExportLineRow[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaGroups: BbCuoiCaGroup[];
  damagedGroups: BbDamagedGoodsGroup[];
  mixingGroups: BbMixingRatioGroup[];
  sanLuongGroups: BbSanLuongGroup[];
  selectedMachineName?: string | null;
}): MaterialBuildRow[] {
  const {
    order,
    products,
    materials,
    exportGroups,
    exportRows,
    dauCaGroups,
    cuoiCaGroups,
    damagedGroups,
    mixingGroups,
    sanLuongGroups,
    selectedMachineName
  } = input;
  const rows = new Map<string, MaterialBuildRow>();
  const orderBomKeys = buildOrderBomMaterialMatchKeys(order, products);
  const isInOrderBom = (code: string, name: string) => isMaterialInProductBom(code, name, orderBomKeys);
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

  for (const productLine of order.lines) {
    const product = findProduct(products, productLine.productCode);
    const actualProductQuantity = resolveProductSanLuongQuantity(
      order,
      productLine.productCode,
      productLine.productName,
      sanLuongGroups
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
    exportGroups || [],
    {
      orderCode: order.orderCode,
      groupKey: order.groupKey,
      ngay: parseProductionOrderFilterDate(order.ngay) || order.ngay,
      shift: order.shift,
      machine: order.machine
    },
    exportRows || []
  );
  for (const entry of exportMaterialTotals) {
    const row = ensure(entry.itemCode, entry.itemName, entry.unit);
    if (entry.quantity > 0) row.exportQty = round4(row.exportQty + entry.quantity);
    if (entry.weightKg > 0) row.exportKg = round4(row.exportKg + entry.weightKg);
  }

  const openingGroups = findOrderGroups(dauCaGroups, order);
  const openingLines = openingGroups.flatMap(group => group.lines);
  const tonDauMaps = buildBbMaterialKgMapsFromTabLines(openingLines);
  const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonDauMaps);
  for (const line of openingLines) {
    ensure(line.itemCode, line.itemName, line.unit).openingKg += line.weightKg > 0 ? line.weightKg : 0;
  }

  const closingGroups = findOrderGroups(cuoiCaGroups, order);
  const closingLines = closingGroups.flatMap(group => group.lines);
  const closingMaterialLines = closingGroups.flatMap(group => group.materialLines || []);
  const nnsTronTonCuoiKg = lookupNnsTronTonDauKg(buildBbMaterialKgMapsFromTabLines(closingLines));

  const damagedGroup = findOrderGroup(damagedGroups, order);
  const damagedLines = damagedGroup?.lines || [];
  const groupIsInsulation = isInsulationMachineText(order.machine, selectedMachineName);

  const mixingGroup = findOrderGroup(mixingGroups, order);
  for (const line of mixingGroup?.lines || []) {
    const row = ensure(line.materialCode, line.materialName, 'kg');
    if (line.tiLeDinhMucPercent !== null) row.normPercents.push(line.tiLeDinhMucPercent);
    row.actualPercent = line.tiLeThucTeTbPercent;
    row.actualMixedKg += line.totalKlThucTe;
  }

  // Lỗi hỏng = cột «Trọng lượng lỗi» tab «Dữ liệu trong báo cáo hàng lỗi hỏng» — không phân bổ lại.
  for (const row of rows.values()) row.damagedKg = 0;
  const plasticLoiHongKg = resolveBbLoiHongNnkmNcTotalKg({
    damagedLines,
    ngay: order.ngay,
    shift: order.shift,
    machine: order.machine
  });
  for (const line of damagedGroup?.mixingLines || []) {
    const kg = resolveBbLoiHongMixingLineWeightKg(line, plasticLoiHongKg);
    if (kg == null || !(kg > 0)) continue;
    const row = ensure(line.materialCode, line.materialName, line.unit || 'kg');
    row.damagedKg = round4(row.damagedKg + kg);
  }
  if (groupIsInsulation) {
    const racMangKg = sumBbDamagedFilmScrapKg(damagedLines);
    const filmMat = damagedGroup?.filmScrapMaterial;
    if (racMangKg > 0 && filmMat) {
      const row = ensure(filmMat.materialCode, filmMat.materialName, filmMat.unit || 'kg');
      row.damagedKg = round4(row.damagedKg + racMangKg);
    }
  }

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

  // Tồn cuối = cột TL trên tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» — không phân bổ NNS-TRON lại.
  for (const row of rows.values()) row.closingKg = 0;
  if (closingMaterialLines.length > 0) {
    for (const line of closingMaterialLines) {
      const kg = line.tonDauWeightKg;
      if (!(kg > 0)) continue;
      ensure(line.itemCode, line.itemName, line.unit || 'kg').closingKg += kg;
    }
  } else {
    for (const line of closingLines) {
      const kg = line.weightKg;
      if (!(kg > 0)) continue;
      ensure(line.itemCode, line.itemName, line.unit || 'kg').closingKg += kg;
    }
  }

  // Nhập thành phẩm = cột TL thực tế NVL trên tab «Báo cáo sản lượng» — không tính lại từ BOM.
  for (const row of rows.values()) row.finishedKg = 0;
  const seenSanLuongProductKeys = new Set<string>();
  for (const productLine of order.lines) {
    const productGroup = findSanLuongProductGroup(
      order,
      productLine.productCode,
      productLine.productName,
      sanLuongGroups
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
      const weight = line.actualWeightKg > 0 ? line.actualWeightKg : 0;
      if (!(weight > 0)) continue;
      const unit = line.amountType === 'percent' ? 'kg' : String(line.unit || '').trim() || 'Cái';
      const row = ensure(line.itemCode, line.itemName, unit);
      row.finishedKg = round4(row.finishedKg + weight);
    }
  }

  for (const row of rows.values()) {
    if (!isPlasticNvl(row)) row.actualQty = 0;
  }
  for (const productLine of order.lines) {
    const product = findProduct(products, productLine.productCode);
    const sl = resolveProductSanLuongQuantity(
      order,
      productLine.productCode,
      productLine.productName,
      sanLuongGroups
    );
    if (!(sl > 0)) continue;
    for (const item of product?.nplItems || []) {
      if (item.amountType !== 'quantity') continue;
      const qtyPerSp =
        item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0
          ? item.quantity
          : null;
      if (qtyPerSp == null) continue;
      const unit = String(item.unit || '').trim();
      const row = ensure(item.code, item.name, unit || 'Cái');
      if (isPlasticNvl(row)) continue;
      if (unit && unit !== '-' && !isWarehouseKgUnit(unit)) {
        row.actualQty = round4(row.actualQty + qtyPerSp * sl);
      }
    }
  }

  const materialsCatalog = materials.map(mapMaterialToWeightCatalogItem);
  return [...rows.values()]
    .filter(row => {
      if (
        isNnsTronMaterial(row.code, row.name) &&
        (nnsTronTonDauKg > 0 || nnsTronTonCuoiKg > 0 || closingMaterialLines.length > 0)
      ) {
        return false;
      }
      if (isInOrderBom(row.code, row.name)) return true;
      return row.openingKg > 0 || row.closingKg > 0 || row.exportKg > 0 || row.damagedKg > 0 || row.finishedKg > 0;
    })
    .map(row => ({
      ...row,
      unit: resolveMaterialUnit(row.code, row.name, row.unit, materialsCatalog)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function toThucDungRow(
  order: BbProductionOrderGroup,
  row: MaterialBuildRow,
  shiftLabel: string
): BbThucDungLineRow {
  const plastic = isPlasticNvl(row);
  const weightKg = round4(computeMaterialUsageKg(row.exportKg, row.openingKg, row.closingKg));
  const finishedKg = round4(row.finishedKg);
  const damagedKg = round4(row.damagedKg);
  const finishedAndDamaged = round4(finishedKg + damagedKg);
  const avgNorm =
    row.normPercents.length > 0
      ? round4(row.normPercents.reduce((sum, value) => sum + value, 0) / row.normPercents.length)
      : null;
  return {
    key: `${order.orderCode}|${order.ngay}|${order.shift}|${row.key}`,
    ngay: order.ngay,
    shift: order.shift,
    shiftLabel,
    orderCode: order.orderCode,
    machine: order.machine,
    materialCode: row.code,
    materialName: row.name,
    unit: row.unit,
    tiLeDinhMucPercent: avgNorm,
    tiLeThucTeTbPercent: row.actualPercent,
    batchCount: 0,
    xuatTrongCaKg: round4(row.exportKg),
    trongLuongDaTronKg: round4(row.exportKg),
    tonDauKg: round4(row.openingKg),
    directTonDauKg: round4(row.openingKg),
    tonDauFromNnsTron: false,
    nnsTronTonDauKg: null,
    tonCuoiKg: round4(row.closingKg),
    directTonCuoiKg: round4(row.closingKg),
    tonCuoiFromNnsTron: false,
    nnsTronTonCuoiKg: null,
    tiLeThucTeSourceNgay: order.ngay,
    tiLeThucTeSourceShift: order.shift,
    mixingShiftMaterialKg: row.actualMixedKg > 0 ? round4(row.actualMixedKg) : null,
    mixingShiftTotalKg: null,
    weightKg,
    /** Nhập thành phẩm (kg) — cột phiếu in. */
    klThucTeKg: finishedKg,
    loiHongKg: damagedKg,
    klThucTePlusLoiKg: finishedAndDamaged,
    /** Chênh lệch = xuất thực dùng − nhập TP − lỗi hỏng. */
    chenhLechKg: round4(weightKg - finishedKg - damagedKg),
    nhuaThanhPhamHeaderKg: null,
    nhuaLoiHeaderKg: null,
    nhuaPhanBoTiLePercent: null,
    nhuaPhanBoTiLeSumPercent: null,
    nhuaPhanBoTiLeSource: null,
    /** Nhựa (3.1) — dùng tách section tab/in. */
    inMixingRatioTable: plastic,
    isPlasticNvl: plastic,
    finishedQty: round4(row.actualQty),
    exportQty: round4(row.exportQty)
  };
}

/** Build dòng tiêu hao NVL (công thức phiếu in) cho snapshot / tab / in. */
export function buildBbTieuHaoNvlThucDungRows(input: {
  orderGroups: BbProductionOrderGroup[];
  products: ProductRow[];
  materials: MaterialRow[];
  exportGroups: BbWarehouseExportGroup[];
  exportRows: BbWarehouseExportLineRow[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaGroups: BbCuoiCaGroup[];
  damagedGroups: BbDamagedGoodsGroup[];
  mixingGroups: BbMixingRatioGroup[];
  sanLuongGroups: BbSanLuongGroup[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  selectedMachine?: { code?: string; name?: string } | null;
}): BbThucDungLineRow[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const rows: BbThucDungLineRow[] = [];
  for (const order of input.orderGroups) {
    const shiftLabel = formatProductionOrderShiftLabel(order.shift, lookupSettings);
    const materialRows = buildMaterialRowsForOrder({
      order,
      products: input.products,
      materials: input.materials,
      exportGroups: input.exportGroups,
      exportRows: input.exportRows,
      dauCaGroups: input.dauCaGroups,
      cuoiCaGroups: input.cuoiCaGroups,
      damagedGroups: input.damagedGroups,
      mixingGroups: input.mixingGroups,
      sanLuongGroups: input.sanLuongGroups,
      selectedMachineName: input.selectedMachine?.name
    });
    for (const row of materialRows) {
      rows.push(toThucDungRow(order, row, shiftLabel || order.shiftLabel || order.shift));
    }
  }
  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    if (Boolean(a.isPlasticNvl ?? a.inMixingRatioTable) !== Boolean(b.isPlasticNvl ?? b.inMixingRatioTable)) {
      return a.isPlasticNvl ?? a.inMixingRatioTable ? -1 : 1;
    }
    return a.materialName.localeCompare(b.materialName, 'vi');
  });
}

/** Nhập TP / lỗi / TP+lỗi — luôn lấy số đã lưu (không tính lại banner). */
export function resolveBbTieuHaoStoredKg(line: BbThucDungLineRow): {
  klThucTeKg: number;
  loiHongKg: number;
  klThucTePlusLoiKg: number;
} {
  const klThucTeKg = Number.isFinite(line.klThucTeKg) ? line.klThucTeKg : 0;
  const loiHongKg = Number.isFinite(line.loiHongKg) ? line.loiHongKg : 0;
  const klThucTePlusLoiKg =
    Number.isFinite(line.klThucTePlusLoiKg) && line.klThucTePlusLoiKg > 0
      ? line.klThucTePlusLoiKg
      : round4(klThucTeKg + loiHongKg);
  return { klThucTeKg, loiHongKg, klThucTePlusLoiKg };
}

/** Chênh lệch phiếu in = thực dùng − nhập TP − lỗi. */
export function resolveBbTieuHaoChenhLechKg(line: BbThucDungLineRow): number {
  if (Number.isFinite(line.chenhLechKg)) return line.chenhLechKg;
  const { klThucTeKg, loiHongKg } = resolveBbTieuHaoStoredKg(line);
  const weightKg = Number.isFinite(line.weightKg) ? line.weightKg : 0;
  return round4(weightKg - klThucTeKg - loiHongKg);
}

export function isBbTieuHaoPlasticRow(line: Pick<BbThucDungLineRow, 'isPlasticNvl' | 'inMixingRatioTable' | 'materialCode' | 'materialName' | 'unit'>) {
  if (typeof line.isPlasticNvl === 'boolean') return line.isPlasticNvl;
  if (typeof line.inMixingRatioTable === 'boolean' && line.isPlasticNvl === undefined) {
    // Snapshot mới: inMixingRatioTable = isPlasticNvl.
    return line.inMixingRatioTable;
  }
  return isPlasticNvl({
    code: line.materialCode,
    name: line.materialName,
    unit: line.unit || 'kg'
  });
}
