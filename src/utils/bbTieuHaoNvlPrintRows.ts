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
  findMaterialTongKgPerUnit,
  isWarehouseKgUnit,
  isWarehouseRollUnit,
  mapMaterialToWeightCatalogItem,
  normalizeWarehouseCodeKey,
  type WarehouseWeightCatalogItem
} from './warehouseWeight';
import {
  buildBbWarehouseExportMaterialTotalsForOrderFromExportTab,
  buildOrderBomMaterialMatchKeys,
  isInsulationMachineText,
  isMaterialInProductBom,
  isBbExcludedTronAggregateMaterial,
  buildBbMixingMaterialLinesForShift,
  enrichLoiHongMixingExtraWeights,
  filterBbDamagedLinesForShiftBucket,
  isLoiHongMixingKgExtraCode,
  resolveBbLoiHongMixingLineWeightKg,
  resolveBbLoiHongNhuakmNcTotalKg,
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
import type { MixingReport } from '../components/MixingReportForm';
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

function machineTextsMatch(left?: string, right?: string) {
  if (!left || !right) return true;
  const a = normalizeProductCodeKey(left);
  const b = normalizeProductCodeKey(right);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function findOrderGroups<
  T extends { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
>(
  groups: T[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
) {
  const seen = new Set<T>();
  const pushAll = (list: T[]) => {
    for (const group of list) {
      if (!seen.has(group)) seen.add(group);
    }
  };

  if (order.groupKey) {
    pushAll(groups.filter(group => group.groupKey === order.groupKey));
  }
  // Luôn gom thêm đúng ngày·ca·máy — phiếu sản lượng có thể khác groupKey / chưa gắn LSX
  // nhưng cùng bucket (tránh thiếu SP/NVL chỉ có trên báo cáo sản lượng).
  if (order.ngay && order.shift) {
    const byBucket = groups.filter(group => {
      if (group.ngay && group.ngay !== order.ngay) return false;
      if (group.shift && !shiftNamesMatch(group.shift, order.shift)) return false;
      if (!machineTextsMatch(order.machine, group.machine)) return false;
      return true;
    });
    const byOrderInBucket = byBucket.filter(group =>
      groupMatchesOrder(group.orderCode, order.orderCode)
    );
    // Có mã LSX trong bucket → lấy các nhóm khớp LSX + nhóm chưa gắn lệnh cùng bucket.
    if (byOrderInBucket.length > 0) {
      pushAll(byOrderInBucket);
      pushAll(
        byBucket.filter(group => {
          const code = String(group.orderCode || '').trim();
          return !code || code.toLowerCase().startsWith('san-luong') || code.toLowerCase().startsWith('unlinked');
        })
      );
    } else {
      pushAll(byBucket);
    }
  }
  if (seen.size > 0) return [...seen];
  const byOrder = groups.filter(group => groupMatchesOrder(group.orderCode, order.orderCode));
  if (byOrder.length > 0) return byOrder;
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

/** Mọi SP thực tế trên tab Báo cáo sản lượng khớp lệnh/ngày·ca·máy (không giới hạn mã trên LSX). */
function listSanLuongProductGroupsForOrder(
  order: BbProductionOrderGroup,
  sanLuongGroups: BbSanLuongGroup[]
): BbSanLuongProductGroup[] {
  const groups = findOrderGroups(sanLuongGroups, order);
  const out: BbSanLuongProductGroup[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const productGroup of group.productGroups || []) {
      if (!(productGroup.quantity > 0) && !(productGroup.weightKg > 0) && !(productGroup.lines?.length > 0)) {
        continue;
      }
      const spKey =
        normalizeProductCodeKey(productGroup.productCode) ||
        normalizeProductCodeKey(productGroup.productName) ||
        productGroup.key;
      if (spKey && seen.has(spKey)) continue;
      if (spKey) seen.add(spKey);
      out.push(productGroup);
    }
  }
  return out;
}

function resolveProductSanLuongQuantity(
  order: BbProductionOrderGroup,
  productCode: string,
  productName: string,
  sanLuongGroups: BbSanLuongGroup[]
) {
  const productGroup = findSanLuongProductGroup(order, productCode, productName, sanLuongGroups);
  if (productGroup && productGroup.quantity > 0) return productGroup.quantity;
  // Fallback: SP có trên báo cáo sản lượng cùng ca·máy nhưng không khớp từng dòng LSX.
  for (const pg of listSanLuongProductGroupsForOrder(order, sanLuongGroups)) {
    if (sanLuongProductMatchesLine(pg, productCode, productName) && pg.quantity > 0) return pg.quantity;
  }
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
  /**
   * Cột «Tỉ lệ trộn Thực tế» `/danh-sach-bao-cao-phoi-tron`
   * (KL ÷ tổng KL × 100, gộp ngày·ca·máy) — chia nhập TP + lỗi.
   */
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

/** % chia nhựa từ bảng trộn: chỉ KL thực tế — không ĐM/BOM/form. */
function resolveBangTronTiLePercent(row: MaterialBuildRow): number | null {
  if (row.actualPercent != null && Number.isFinite(row.actualPercent) && row.actualPercent > 0) {
    return row.actualPercent;
  }
  return null;
}

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
  mixingReports?: MixingReport[];
  sanLuongGroups: BbSanLuongGroup[];
  selectedMachineName?: string | null;
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
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
    mixingReports,
    sanLuongGroups,
    selectedMachineName,
    shiftSettings
  } = input;
  const rows = new Map<string, MaterialBuildRow>();
  const orderBomKeys = buildOrderBomMaterialMatchKeys(order, products);
  const isInOrderBom = (code: string, name: string) => isMaterialInProductBom(code, name, orderBomKeys);
  const ensure = (code: string, name: string, unit = 'kg') => {
    if (isBbExcludedTronAggregateMaterial(code, name)) return null;
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

  // Seed NVL từ SP thực tế trên Báo cáo sản lượng (kể cả SP/NVL không có trên LSX).
  const sanLuongGroupsForOrder = findOrderGroups(sanLuongGroups, order);
  const sanLuongProductGroups = listSanLuongProductGroupsForOrder(order, sanLuongGroups);
  const seedProductRefs: Array<{ productCode: string; productName: string; quantity: number }> = [
    ...sanLuongProductGroups.map(pg => ({
      productCode: pg.productCode,
      productName: pg.productName,
      quantity: pg.quantity > 0 ? pg.quantity : 0
    }))
  ];
  const seededSpKeys = new Set(
    seedProductRefs
      .map(ref => normalizeProductCodeKey(ref.productCode) || normalizeProductCodeKey(ref.productName))
      .filter(Boolean)
  );
  for (const productLine of order.lines) {
    const spKey =
      normalizeProductCodeKey(productLine.productCode) ||
      normalizeProductCodeKey(productLine.productName);
    if (spKey && seededSpKeys.has(spKey)) continue;
    seedProductRefs.push({
      productCode: productLine.productCode,
      productName: productLine.productName,
      quantity: resolveProductSanLuongQuantity(
        order,
        productLine.productCode,
        productLine.productName,
        sanLuongGroups
      )
    });
    if (spKey) seededSpKeys.add(spKey);
  }
  // 1) Seed thẳng từ dòng NVL trên tab sản lượng (không phụ thuộc BOM LSX).
  for (const productGroup of sanLuongProductGroups) {
    for (const line of productGroup.lines || []) {
      const unit = line.amountType === 'percent' ? 'kg' : String(line.unit || '').trim() || 'kg';
      const row = ensure(line.itemCode, line.itemName, unit);
      if (!row) continue;
      if (line.tiLeDinhMucPercent != null && line.tiLeDinhMucPercent > 0) {
        row.normPercents.push(line.tiLeDinhMucPercent);
      }
    }
  }
  for (const group of sanLuongGroupsForOrder) {
    for (const total of group.nvlTotals || []) {
      const unit = total.amountType === 'percent' ? 'kg' : String(total.unit || '').trim() || 'kg';
      const row = ensure(total.itemCode, total.itemName, unit);
      if (!row) continue;
      if (total.rate != null && total.rate > 0 && total.amountType === 'percent') {
        row.normPercents.push(total.rate);
      }
    }
  }
  // 2) Bổ sung BOM catalog của SP sản lượng (NVL chưa có trên dòng phiếu).
  for (const ref of seedProductRefs) {
    const product = findProduct(products, ref.productCode);
    const actualProductQuantity = ref.quantity > 0 ? ref.quantity : 0;
    for (const item of product?.nplItems || []) {
      const row = ensure(item.code, item.name, item.amountType === 'percent' ? 'kg' : item.unit);
      if (!row) continue;
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
    if (!row) continue;
    if (entry.quantity > 0) row.exportQty = round4(row.exportQty + entry.quantity);
    if (entry.weightKg > 0) row.exportKg = round4(row.exportKg + entry.weightKg);
  }

  // Tồn đầu / cuối = đúng số tab Tồn đầu ca / Tồn cuối ca (`materialLines.tonDauWeightKg`).
  const openingGroups = findOrderGroups(dauCaGroups, order);
  const openingMaterialLines = openingGroups.flatMap(group => group.materialLines || []);
  const openingLines = openingGroups.flatMap(group => group.lines);
  for (const row of rows.values()) row.openingKg = 0;
  if (openingMaterialLines.length > 0) {
    for (const line of openingMaterialLines) {
      const kg = line.tonDauWeightKg;
      if (!(kg > 0)) continue;
      const row = ensure(line.itemCode, line.itemName, line.unit || 'kg');
      if (row) row.openingKg += kg;
    }
  } else {
    for (const line of openingLines) {
      const row = ensure(line.itemCode, line.itemName, line.unit);
      if (!row) continue;
      row.openingKg += line.weightKg > 0 ? line.weightKg : 0;
    }
  }

  const closingGroups = findOrderGroups(cuoiCaGroups, order);
  const closingLines = closingGroups.flatMap(group => group.lines);
  const closingMaterialLines = closingGroups.flatMap(group => group.materialLines || []);

  const damagedGroup = findOrderGroup(damagedGroups, order);
  // Mọi phiếu SP lỗi cùng ngày·ca·máy (kể cả chưa gắn mã lệnh) — khớp tab lỗi hỏng.
  const damagedLines = filterBbDamagedLinesForShiftBucket(
    damagedGroups.flatMap(group => group.lines || []),
    { ngay: order.ngay, shift: order.shift, machine: order.machine },
    shiftSettings
  );
  const groupIsInsulation = isInsulationMachineText(order.machine, selectedMachineName);

  const mixingGroup = findOrderGroup(mixingGroups, order);
  for (const line of mixingGroup?.lines || []) {
    const row = ensure(line.materialCode, line.materialName, 'kg');
    if (!row) continue;
    if (line.tiLeDinhMucPercent !== null) row.normPercents.push(line.tiLeDinhMucPercent);
    // Fallback nếu chưa có mixingReports — cùng cột Tỉ lệ trộn Thực tế.
    if (row.actualPercent == null && line.tiLeThucTeTbPercent != null && line.tiLeThucTeTbPercent > 0) {
      row.actualPercent = line.tiLeThucTeTbPercent;
    }
    row.actualMixedKg += line.totalKlThucTe;
  }
  // Nguồn chuẩn: cùng công thức cột «Tỉ lệ trộn Thực tế» trên danh sách phối trộn
  // (KL ÷ tổng KL × 100), gộp phiếu đúng ngày · ca · máy.
  if (mixingReports && mixingReports.length > 0) {
    const mixLines = buildBbMixingMaterialLinesForShift({
      mixingReports,
      ngay: order.ngay,
      shift: order.shift,
      machine: order.machine,
      shiftSettings
    });
    for (const mix of mixLines) {
      const row = ensure(mix.materialCode, mix.materialName, mix.unit || 'kg');
      if (!row) continue;
      if (mix.tiLeDinhMucPercent != null) row.normPercents.push(mix.tiLeDinhMucPercent);
      if (mix.tiLeTronPercent != null && mix.tiLeTronPercent > 0) {
        row.actualPercent = mix.tiLeTronPercent;
      }
      if (mix.totalKlThucTe > 0) {
        row.actualMixedKg = Math.max(row.actualMixedKg, mix.totalKlThucTe);
      }
    }
  }

  // Lỗi hỏng nhựa: sẽ chia theo % bảng trộn (KL thực tế) bên dưới — cùng công thức nhập TP.
  for (const row of rows.values()) row.damagedKg = 0;
  const plasticLoiHongKg = resolveBbLoiHongNhuakmNcTotalKg({
    damagedLines,
    ngay: order.ngay,
    shift: order.shift,
    machine: order.machine,
    shiftSettings
  });
  // NHUAKM / NC / RMN (và rác màng) — KL tuyệt đối, không chia %.
  const mixingLines = enrichLoiHongMixingExtraWeights({
    lines: damagedGroup?.mixingLines || [],
    damagedLines,
    plasticLoiHongKg,
    ngay: order.ngay,
    shift: order.shift,
    machine: order.machine,
    shiftSettings
  });
  for (const line of mixingLines) {
    if (!isLoiHongMixingKgExtraCode(line.materialCode)) continue;
    const kg = resolveBbLoiHongMixingLineWeightKg(line, plasticLoiHongKg);
    if (kg == null || !(kg > 0)) continue;
    const row = ensure(line.materialCode, line.materialName, line.unit || 'kg');
    if (!row) continue;
    row.damagedKg = round4(row.damagedKg + kg);
  }
  if (groupIsInsulation) {
    const racMangKg = sumBbDamagedFilmScrapKg(damagedLines);
    const filmMat = damagedGroup?.filmScrapMaterial;
    if (racMangKg > 0 && filmMat) {
      const row = ensure(filmMat.materialCode, filmMat.materialName, filmMat.unit || 'kg');
      if (row) row.damagedKg = round4(row.damagedKg + racMangKg);
    }
  }

  // Tồn cuối = Tổng cuối trên tab «Kiểm tồn cuối ca» (Đã trộn + Tồn ngoài phiếu) — không × NNS/NHUA-TRON.
  for (const row of rows.values()) row.closingKg = 0;
  if (closingMaterialLines.length > 0) {
    for (const line of closingMaterialLines) {
      const kg = line.tonDauWeightKg;
      if (!(kg > 0)) continue;
      const row = ensure(line.itemCode, line.itemName, line.unit || 'kg');
      if (row) row.closingKg += kg;
    }
  } else {
    for (const line of closingLines) {
      const kg = line.weightKg;
      if (!(kg > 0)) continue;
      const row = ensure(line.itemCode, line.itemName, line.unit || 'kg');
      if (row) row.closingKg += kg;
    }
  }

  // Nhập thành phẩm = y đúc cột TL «Tổng vật tư trộn» / NVL trên tab Báo cáo sản lượng.
  // Không nhân lại × tỉ lệ trộn (đã có sẵn trên từng mã ở sản lượng).
  for (const row of rows.values()) row.finishedKg = 0;
  const finishedFromNvlTotals = new Set<string>();
  for (const group of sanLuongGroupsForOrder) {
    for (const total of group.nvlTotals || []) {
      const weight =
        total.actualWeightKg > 0
          ? total.actualWeightKg
          : total.normWeightKg > 0
            ? total.normWeightKg
            : 0;
      if (!(weight > 0)) continue;
      const unit = total.amountType === 'percent' ? 'kg' : String(total.unit || '').trim() || 'Cái';
      const row = ensure(total.itemCode, total.itemName, unit);
      if (!row) continue;
      row.finishedKg = round4(row.finishedKg + weight);
      finishedFromNvlTotals.add(row.key);
    }
  }
  // Fallback: dòng NVL theo từng SP nếu chưa có trong nvlTotals.
  for (const productGroup of sanLuongProductGroups) {
    for (const line of productGroup.lines || []) {
      const weight =
        line.actualWeightKg > 0
          ? line.actualWeightKg
          : line.normWeightKg > 0
            ? line.normWeightKg
            : 0;
      if (!(weight > 0)) continue;
      const unit = line.amountType === 'percent' ? 'kg' : String(line.unit || '').trim() || 'Cái';
      const row = ensure(line.itemCode, line.itemName, unit);
      if (!row || finishedFromNvlTotals.has(row.key)) continue;
      row.finishedKg = round4(row.finishedKg + weight);
    }
  }

  for (const row of rows.values()) {
    if (!isPlasticNvl(row)) row.actualQty = 0;
  }
  for (const productGroup of sanLuongProductGroups) {
    const product = findProduct(products, productGroup.productCode);
    const sl = productGroup.quantity > 0 ? productGroup.quantity : 0;
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
      if (!row || isPlasticNvl(row)) continue;
      if (unit && unit !== '-' && !isWarehouseKgUnit(unit)) {
        row.actualQty = round4(row.actualQty + qtyPerSp * sl);
      }
    }
  }

  const materialsCatalog = materials.map(mapMaterialToWeightCatalogItem);

  // Băng keo: khoi_luong_kg là kg trên 1 thành phẩm. Số cuộn = làm tròn (tổng kg / Tổng kg 1 cuộn).
  for (const row of rows.values()) {
    if (isPlasticNvl(row)) continue;
    const catalogKg = findMaterialTongKgPerUnit(row.code, materialsCatalog);
    if (!(catalogKg != null && catalogKg > 0)) continue;
    let rawKg = 0;
    let matched = false;
    for (const productGroup of sanLuongProductGroups) {
      const sl = productGroup.quantity > 0 ? productGroup.quantity : 0;
      if (!(sl > 0)) continue;
      const product = findProduct(products, productGroup.productCode);
      for (const item of product?.nplItems || []) {
        if (item.amountType !== 'quantity' || !isWarehouseRollUnit(item.unit || '')) continue;
        const codeKey = normalizeWarehouseCodeKey(item.code || '');
        const rowKey = normalizeWarehouseCodeKey(row.code || '');
        if (!codeKey || codeKey !== rowKey) continue;
        const bomKg = item.weightKg;
        if (!(bomKg != null && bomKg > 0 && bomKg < catalogKg * 0.5)) continue;
        matched = true;
        rawKg += bomKg * sl;
      }
    }
    if (!matched || !(rawKg > 0)) continue;
    const rolls = Math.round(rawKg / catalogKg);
    row.actualQty = rolls;
    row.finishedKg = round4(rolls * catalogKg);
  }

  // NVL Cái: Nhập TP = số cái thành phẩm × Tổng kg danh mục (không lấy số cái làm kg).
  for (const row of rows.values()) {
    if (isPlasticNvl(row)) continue;
    if (isWarehouseRollUnit(row.unit)) continue;
    if (!(row.actualQty > 0)) continue;
    const catalogKg = findMaterialTongKgPerUnit(row.code, materialsCatalog);
    if (catalogKg != null && catalogKg > 0) {
      row.finishedKg = round4(row.actualQty * catalogKg);
      continue;
    }
    if (!(row.finishedKg > 0)) row.finishedKg = round4(row.actualQty);
  }

  // Lỗi hỏng nhựa: vẫn chia theo «Tỉ lệ trộn Thực tế» (không đổi cột Nhập TP).
  const tongNhuaLoiPlastic = plasticLoiHongKg > 0 ? plasticLoiHongKg : 0;
  for (const row of rows.values()) {
    if (!isPlasticNvl(row)) continue;
    const tiLe = resolveBangTronTiLePercent(row);
    if (tiLe == null) {
      row.damagedKg = 0;
      continue;
    }
    row.damagedKg = tongNhuaLoiPlastic > 0 ? round4(tongNhuaLoiPlastic * (tiLe / 100)) : 0;
  }

  return [...rows.values()]
    .filter(row => {
      // NHUA-TRON / NNS-TRON không vào bảng tiêu hao.
      if (isBbExcludedTronAggregateMaterial(row.code, row.name)) return false;
      // NVL nhựa: giữ nếu có trên bảng trộn / tồn / xuất / hoặc đã có Nhập TP từ sản lượng.
      if (isPlasticNvl(row)) {
        const onBangTron =
          resolveBangTronTiLePercent(row) != null || row.actualMixedKg > 0;
        if (
          !onBangTron &&
          !(row.openingKg > 0 || row.closingKg > 0 || row.exportKg > 0 || row.finishedKg > 0)
        ) {
          return false;
        }
      }
      // Không lọc theo BOM LSX — mã chỉ có trên sản lượng vẫn hiện khi có số liệu.
      return (
        row.openingKg > 0 ||
        row.closingKg > 0 ||
        row.exportKg > 0 ||
        row.damagedKg > 0 ||
        row.finishedKg > 0 ||
        row.actualMixedKg > 0 ||
        resolveBangTronTiLePercent(row) != null ||
        isInOrderBom(row.code, row.name)
      );
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
  /** Phiếu `bao_cao_phoi_tron` — nguồn cột «Tỉ lệ trộn Thực tế». */
  mixingReports?: MixingReport[];
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
      mixingReports: input.mixingReports,
      sanLuongGroups: input.sanLuongGroups,
      selectedMachineName: input.selectedMachine?.name,
      shiftSettings: input.shiftSettings
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

/** Chênh lệch phiếu in = xuất thực dùng − nhập TP − lỗi (luôn tính lại từ 3 cột). */
export function resolveBbTieuHaoChenhLechKg(line: BbThucDungLineRow): number {
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
