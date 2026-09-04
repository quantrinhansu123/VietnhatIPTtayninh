import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import type { MixingReport } from '../components/MixingReportForm';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import type { MachineRow } from '../features/danh-sach-may';
import type { MaterialRow } from '../features/kho-nvl';
import type { ProductionOrderLookupSetting, ProductionOrderRow } from '../features/ke-hoach-san-xuat';
import type { ProductRow } from '../features/san-pham/types';
import type { BbAcceptanceNvlDinhMucItem } from './controlBoardBbMachineReport';
import {
  filterCanTuDongRecordsForBoard,
  sumCanTuDongSanLuongTotals,
  computeInsulationFilmWeightKg,
  computeInsulationPlasticNorm
} from './canTuDongWeights';
import {
  computeCanTuDongTongHopBannerTotals,
  explainCanTuDongTongHopRowFormulas,
  sumCanTuDongTongHopDetailRows
} from './canTuDongTongHop';
import {
  buildBbCuoiCaLineRows,
  buildBbDamagedGoodsLineRows,
  buildBbDanhGiaHaoHutGroups,
  buildBbDauCaLineRows,
  buildBbInboundMaterialNormGroups,
  buildBbInboundReportRows,
  buildBbLoiHongMaterialLinesForShift,
  ensureBbDamagedGroupsForOrderHeaders,
  resolveBbLoiHongFilmScrapMaterialForShift,
  resolveBbLoiHongNnkmNcTotalKg,
  isInsulationMachineText,
  buildBbMixingRatioGroups,
  buildBbProductionOrderLineRows,
  buildBbSanLuongGroups,
  buildBbTongGroups,
  buildBbTongHopVatTuThucXuatDungGroups,
  buildBbWarehouseExportLineRows,
  enrichBbDanhGiaGroupsWithPrintSummary,
  enrichBbProductionOrderRowsFromSanLuong,
  groupBbCuoiCaLines,
  groupBbDamagedGoodsLines,
  groupBbDauCaLines,
  groupBbProductionOrderLines,
  groupBbThucDungLines,
  groupBbWarehouseExportLines,
  sumBbCuoiCaWeightKg,
  sumBbCuoiCaWeightKgByKind,
  resolveBbLoiHongCardWeightByKind,
  sumBbDanhGiaMoney,
  sumBbDauCaWeightKg,
  sumBbDauCaWeightKgByKind,
  sumBbInboundReportTotals,
  sumBbProductionOrderPlasticRequiredKg,
  sumBbProductionOrderTotals,
  sumBbSanLuongTotals,
  sumBbThucDungWeightKg,
  sumBbTongChenhLech,
  sumBbTongTrongLuongNhapKho,
  sumBbWarehouseExportWeightKgByKind,
  type BbCuoiCaGroup,
  type BbCuoiCaLineRow,
  type BbDamagedGoodsGroup,
  type BbDamagedGoodsLineRow,
  type BbDanhGiaHaoHutGroup,
  type BbDauCaGroup,
  type BbDauCaLineRow,
  type BbInboundReportRow,
  type BbMixingRatioGroup,
  type BbProductionOrderGroup,
  type BbProductionOrderLineRow,
  type BbSanLuongGroup,
  type BbThucDungGroup,
  type BbThucDungLineRow,
  type BbTongGroup,
  type BbTongHopThucXuatGroup,
  type BbWarehouseExportGroup,
  type BbWarehouseExportLineRow
} from './controlBoardBbMachineReport';
import { buildBbTieuHaoNvlThucDungRows } from './bbTieuHaoNvlPrintRows';
import type { ShiftSummaryWarehouseMovement } from './controlBoardShiftSummary';
import type { MachineNvlSavedReport } from './machineNvlReports';
import { type ShiftSetting } from './shiftSettings';
import type { WeighingRecord } from './weighingRecords';
import { normalizeBbLyDoToken } from './bbBaoCaoLyDo';

export type BbBaoCaoTinhToanPayload = {
  version: 1;
  orderRows: BbProductionOrderLineRow[];
  orderGroups: BbProductionOrderGroup[];
  exportRows: BbWarehouseExportLineRow[];
  exportGroups: BbWarehouseExportGroup[];
  dauCaRows: BbDauCaLineRow[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaRows: BbCuoiCaLineRow[];
  cuoiCaGroups: BbCuoiCaGroup[];
  damagedRows: BbDamagedGoodsLineRow[];
  damagedGroups: BbDamagedGoodsGroup[];
  sanLuongGroups: BbSanLuongGroup[];
  inboundRows: BbInboundReportRow[];
  thucDungRows: BbThucDungLineRow[];
  thucDungGroups: BbThucDungGroup[];
  tongHopThucXuatGroups: BbTongHopThucXuatGroup[];
  inboundNormGroups: BbWarehouseExportGroup[];
  tongGroups: BbTongGroup[];
  mixingGroups: BbMixingRatioGroup[];
  danhGiaGroups: BbDanhGiaHaoHutGroup[];
  summary: {
    orderTotals: ReturnType<typeof sumBbProductionOrderTotals>;
    plasticRequiredWeightKg: number;
    exportTotalKg: number;
    exportWeightByKind: ReturnType<typeof sumBbWarehouseExportWeightKgByKind>;
    dauCaTotalKg: number;
    dauCaWeightByKind: ReturnType<typeof sumBbDauCaWeightKgByKind>;
    cuoiCaTotalKg: number;
    cuoiCaWeightByKind: ReturnType<typeof sumBbCuoiCaWeightKgByKind>;
    damagedTotalKg: number;
    damagedWeightByKind?: { plasticKg: number; otherKg: number };
    sanLuongTotals: ReturnType<typeof sumBbSanLuongTotals>;
    canTuDongSanLuongTotals: ReturnType<typeof sumCanTuDongSanLuongTotals>;
    displaySanLuongTotals: ReturnType<typeof sumBbSanLuongTotals>;
    insulationFilmWeightKg?: number;
    insulationPlasticNorm?: { weightKg: number; counted: number };
    /** Tổng banner «Tổng hợp nhựa» — lưu khi Tính toán để xem snapshot không cần tải lại can_tu_dong. */
    canTuDongTongHopTotals?: ReturnType<typeof sumCanTuDongTongHopDetailRows>;
    canTuDongTongHopFormulas?: ReturnType<typeof explainCanTuDongTongHopRowFormulas>;
    inboundTotals: ReturnType<typeof sumBbInboundReportTotals>;
    thucDungTotalKg: number;
    tongNhapKhoTotalKg: number;
    tongChenhLechTotalKg: number;
    tongGiaTriHaoHutLoiHong: number;
  };
};

export type BbBaoCaoTinhToanRow = {
  id?: string;
  khoa_on_dinh: string;
  ngay_tu: string;
  ngay_den: string;
  ca: string;
  may: string;
  nguon_san_luong: string;
  include_all_machines: boolean;
  ma_lenh_filter?: string[];
  payload: BbBaoCaoTinhToanPayload;
  calculated_at?: string;
  calculated_by?: string | null;
};

export function buildBbBaoCaoTinhToanStableKey(input: {
  dateFrom?: string | null;
  dateTo?: string | null;
  shiftFilter?: string | null;
  machineFilter?: string | null;
  sanLuongSource?: string | null;
  includeAllMachines?: boolean;
  orderCodes?: string[] | null;
}) {
  const orders = [...new Set((input.orderCodes || []).map(code => normalizeBbLyDoToken(code)).filter(Boolean))]
    .sort()
    .join(',');
  return [
    String(input.dateFrom || '').trim(),
    String(input.dateTo || '').trim(),
    normalizeBbLyDoToken(input.shiftFilter || 'all') || 'ALL',
    normalizeBbLyDoToken(input.machineFilter || 'all') || 'ALL',
    String(input.sanLuongSource || 'acceptance').trim().toLowerCase(),
    input.includeAllMachines ? '1' : '0',
    orders || '*'
  ].join('|');
}

export function buildBbMachineReportSnapshot(input: {
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines: MachineRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  /** Phiếu xuất NVL cùng ngày lệnh (mọi ca) — cột «Xuất trong ngày». */
  warehouseMovementsByDate?: ShiftSummaryWarehouseMovement[];
  damagedRecords: WeighingRecord[];
  machineNvlReports: MachineNvlSavedReport[];
  mixingReports: MixingReport[];
  acceptanceReports: AcceptanceReport[];
  /** Snapshot NVL định mức theo id phiếu báo cáo sản lượng. */
  acceptanceNvlDinhMucByReportId?: Map<string, BbAcceptanceNvlDinhMucItem[]>;
  canTuDongRecords: CanTuDongRecord[];
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
}): BbBaoCaoTinhToanPayload {
  const filter = {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter,
    selectedMachine: input.selectedMachine,
    includeAllMachines: input.includeAllMachines
  };
  const sanLuongSource = input.sanLuongSource || 'acceptance';

  const orderRowsBase = buildBbProductionOrderLineRows({
    productionOrders: input.productionOrders,
    products: input.products,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const exportRows = buildBbWarehouseExportLineRows({
    productionOrders: input.productionOrders,
    warehouseMovements: input.warehouseMovements,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    exportMatchScope: 'shift',
    ...filter
  });
  const exportGroups = groupBbWarehouseExportLines(
    exportRows,
    input.productionOrders,
    input.products,
    input.materials,
    input.shiftSettings
  );

  const dauCaRows = buildBbDauCaLineRows({
    productionOrders: input.productionOrders,
    machineNvlReports: input.machineNvlReports,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });
  const dauCaGroups = groupBbDauCaLines(dauCaRows, input.productionOrders, input.products, input.materials, {
    machines: input.machines,
    mixingReports: input.mixingReports,
    shiftSettings: input.shiftSettings
  });

  const cuoiCaRows = buildBbCuoiCaLineRows({
    productionOrders: input.productionOrders,
    machineNvlReports: input.machineNvlReports,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });
  const cuoiCaGroups = groupBbCuoiCaLines(
    cuoiCaRows,
    input.productionOrders,
    input.products,
    input.materials,
    {
      machines: input.machines,
      mixingReports: input.mixingReports,
      shiftSettings: input.shiftSettings
    }
  );

  const damagedRows = buildBbDamagedGoodsLineRows({
    productionOrders: input.productionOrders,
    acceptanceReports: input.acceptanceReports,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });
  /** Bao bì giống Cách nhiệt: luôn có nhóm theo lệnh SX để gắn NNKM/NC + rác màng. */
  const damagedGroups = ensureBbDamagedGroupsForOrderHeaders({
    damagedGroups: groupBbDamagedGoodsLines(damagedRows),
    orderGroups: groupBbProductionOrderLines(orderRowsBase)
  }).map(group => {
    const plasticLoiHongKg = resolveBbLoiHongNnkmNcTotalKg({
      damagedRecords: input.damagedRecords,
      damagedLines: group.lines || [],
      ngay: group.ngay,
      shift: group.shift,
      machine: group.machine,
      shiftSettings: input.shiftSettings
    });
    const mixingLines = buildBbLoiHongMaterialLinesForShift({
      productionOrders: input.productionOrders,
      products: input.products,
      materials: input.materials,
      mixingReports: input.mixingReports,
      damagedRecords: input.damagedRecords,
      damagedLines: group.lines || [],
      plasticLoiHongKg,
      ngay: group.ngay,
      shift: group.shift,
      orderCode: group.orderCode,
      machine: group.machine,
      shiftSettings: input.shiftSettings
    });
    const filmScrapMaterial = resolveBbLoiHongFilmScrapMaterialForShift({
      productionOrders: input.productionOrders,
      products: input.products,
      materials: input.materials,
      warehouseMovements: input.warehouseMovements,
      shiftSettings: input.shiftSettings,
      ngay: group.ngay,
      shift: group.shift,
      orderCode: group.orderCode,
      damagedLines: group.lines
    });
    return {
      ...group,
      mixingLines,
      mixingLineCount: mixingLines.length,
      filmScrapMaterial: filmScrapMaterial ?? undefined
    };
  });

  const sanLuongGroups = buildBbSanLuongGroups({
    productionOrders: input.productionOrders,
    acceptanceReports: input.acceptanceReports,
    acceptanceNvlDinhMucByReportId: input.acceptanceNvlDinhMucByReportId,
    products: input.products,
    materials: input.materials,
    machines: input.machines,
    machineNvlReports: input.machineNvlReports,
    warehouseMovements: input.warehouseMovements,
    damagedRecords: input.damagedRecords,
    mixingReports: input.mixingReports,
    canTuDongRecords: input.canTuDongRecords,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const orderRows = enrichBbProductionOrderRowsFromSanLuong(
    orderRowsBase,
    sanLuongGroups,
    input.products
  );
  const orderGroups = groupBbProductionOrderLines(orderRows);

  const inboundRows = buildBbInboundReportRows({
    productionOrders: input.productionOrders,
    warehouseMovements: input.warehouseMovements,
    machineNvlReports: input.machineNvlReports,
    damagedRecords: input.damagedRecords,
    acceptanceReports: input.acceptanceReports,
    mixingReports: input.mixingReports,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const mixingGroups = buildBbMixingRatioGroups({
    productionOrders: input.productionOrders,
    mixingReports: input.mixingReports,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  /** Tiêu hao NVL = công thức phiếu in (nhập TP + lỗi + chênh lệch) — tab + in cùng số. */
  const thucDungRows = buildBbTieuHaoNvlThucDungRows({
    orderGroups,
    products: input.products,
    materials: input.materials,
    exportGroups,
    exportRows,
    dauCaGroups,
    cuoiCaGroups,
    damagedGroups,
    mixingGroups,
    sanLuongGroups,
    shiftSettings: input.shiftSettings,
    selectedMachine: input.selectedMachine
  });
  const thucDungGroups = groupBbThucDungLines(thucDungRows);

  const tongHopThucXuatGroups = buildBbTongHopVatTuThucXuatDungGroups({
    productionOrders: input.productionOrders,
    mixingReports: input.mixingReports,
    warehouseMovements: input.warehouseMovements,
    warehouseMovementsByDate: input.warehouseMovementsByDate,
    machineNvlReports: input.machineNvlReports,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const inboundNormGroups = buildBbInboundMaterialNormGroups({
    productionOrders: input.productionOrders,
    acceptanceReports: input.acceptanceReports,
    products: input.products,
    materials: input.materials,
    machines: input.machines,
    machineNvlReports: input.machineNvlReports,
    warehouseMovements: input.warehouseMovements,
    damagedRecords: input.damagedRecords,
    mixingReports: input.mixingReports,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const tongGroups = buildBbTongGroups({
    productionOrders: input.productionOrders,
    warehouseMovements: input.warehouseMovements,
    machineNvlReports: input.machineNvlReports,
    acceptanceReports: input.acceptanceReports,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    ...filter
  });

  const scopedCanTuDong =
    sanLuongSource === 'can-tu-dong'
      ? filterCanTuDongRecordsForBoard(input.canTuDongRecords, {
          shiftFilter: input.shiftFilter,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          machineFilter: input.machineFilter,
          selectedMachine: input.selectedMachine
        })
      : [];
  const sanLuongTotals = sumBbSanLuongTotals(sanLuongGroups);
  const canTuDongSanLuongTotals = sumCanTuDongSanLuongTotals(scopedCanTuDong);
  const displaySanLuongTotals = sanLuongSource === 'can-tu-dong' ? canTuDongSanLuongTotals : sanLuongTotals;
  const isInsulationMachine = isInsulationMachineText(input.selectedMachine?.name, input.selectedMachine?.code);
  let insulationFilmWeightKg =
    isInsulationMachine && sanLuongSource === 'can-tu-dong'
      ? computeInsulationFilmWeightKg(input.products, scopedCanTuDong)
      : 0;
  let insulationPlasticNorm =
    isInsulationMachine && sanLuongSource === 'can-tu-dong'
      ? computeInsulationPlasticNorm(input.products, scopedCanTuDong)
      : { weightKg: 0, counted: 0 };
  let canTuDongTongHopTotals: ReturnType<typeof sumCanTuDongTongHopDetailRows> | undefined;
  let canTuDongTongHopFormulas: ReturnType<typeof explainCanTuDongTongHopRowFormulas> | undefined;
  if (sanLuongSource === 'can-tu-dong' && scopedCanTuDong.length > 0 && input.products.length > 0) {
    const banner = computeCanTuDongTongHopBannerTotals(scopedCanTuDong, input.products);
    canTuDongTongHopTotals = banner.totals;
    canTuDongTongHopFormulas = banner.formulas;
    if (isInsulationMachine) {
      insulationFilmWeightKg = banner.totals.khoi_luong_mang_kg;
      insulationPlasticNorm = {
        weightKg: banner.totals.nhua_dm_kg,
        counted: banner.totals.so_cuon
      };
    }
  }

  const danhGiaGroups = enrichBbDanhGiaGroupsWithPrintSummary({
    danhGiaGroups: buildBbDanhGiaHaoHutGroups({
      productionOrders: input.productionOrders,
      products: input.products,
      warehouseMovements: input.warehouseMovements,
      machineNvlReports: input.machineNvlReports,
      acceptanceReports: input.acceptanceReports,
      materials: input.materials,
      machines: input.machines,
      shiftSettings: input.shiftSettings,
      ...filter
    }),
    thucDungGroups,
    damagedGroups,
    orderGroups,
    sanLuongGroups,
    products: input.products,
    materials: input.materials,
    warehouseMovements: input.warehouseMovements,
    shiftSettings: input.shiftSettings,
    selectedMachine: input.selectedMachine,
    // Banner «Tổng nhựa định mức» (chỉ nhựa ĐM, vd. 10,86×32 + 8,86×50).
    tongNhuaDinhMucKg:
      insulationPlasticNorm.weightKg > 0 ? insulationPlasticNorm.weightKg : undefined
  });

  const damagedWeightByKind = resolveBbLoiHongCardWeightByKind({
    damagedGroups,
    damagedRows,
    damagedRecords: input.damagedRecords,
    acceptanceReports: input.acceptanceReports,
    materials: input.materials,
    shiftSettings: input.shiftSettings,
    isInsulationMachine
  });
  const exportWeightByKind = sumBbWarehouseExportWeightKgByKind(exportRows);

  return {
    version: 1,
    orderRows,
    orderGroups,
    exportRows,
    exportGroups,
    dauCaRows,
    dauCaGroups,
    cuoiCaRows,
    cuoiCaGroups,
    damagedRows,
    damagedGroups,
    sanLuongGroups,
    inboundRows,
    thucDungRows,
    thucDungGroups,
    tongHopThucXuatGroups,
    inboundNormGroups,
    tongGroups,
    mixingGroups,
    danhGiaGroups,
    summary: {
      orderTotals: sumBbProductionOrderTotals(orderRows),
      plasticRequiredWeightKg: sumBbProductionOrderPlasticRequiredKg(orderRows),
      exportTotalKg: exportWeightByKind.totalKg,
      exportWeightByKind,
      dauCaTotalKg: sumBbDauCaWeightKg(dauCaRows),
      dauCaWeightByKind: sumBbDauCaWeightKgByKind(dauCaRows),
      cuoiCaTotalKg: sumBbCuoiCaWeightKg(cuoiCaRows),
      cuoiCaWeightByKind: sumBbCuoiCaWeightKgByKind(cuoiCaRows),
      damagedTotalKg: damagedWeightByKind.totalKg,
      damagedWeightByKind: {
        plasticKg: damagedWeightByKind.plasticKg,
        otherKg: damagedWeightByKind.otherKg
      },
      sanLuongTotals,
      canTuDongSanLuongTotals,
      displaySanLuongTotals,
      insulationFilmWeightKg,
      insulationPlasticNorm,
      canTuDongTongHopTotals,
      canTuDongTongHopFormulas,
      inboundTotals: sumBbInboundReportTotals(inboundRows),
      thucDungTotalKg: sumBbThucDungWeightKg(thucDungRows),
      tongNhapKhoTotalKg: sumBbTongTrongLuongNhapKho(tongGroups),
      tongChenhLechTotalKg: sumBbTongChenhLech(tongGroups),
      tongGiaTriHaoHutLoiHong: sumBbDanhGiaMoney(danhGiaGroups, 'tongGiaTriHaoHutLoiHong')
    }
  };
}

/** Kiểm tra payload snapshot tối thiểu hợp lệ. */
export function isBbBaoCaoTinhToanPayload(value: unknown): value is BbBaoCaoTinhToanPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.version === 1 && Array.isArray(row.orderGroups) && row.summary != null && typeof row.summary === 'object';
}

export function emptyBbBaoCaoTinhToanPayload(): BbBaoCaoTinhToanPayload {
  return {
    version: 1,
    orderRows: [],
    orderGroups: [],
    exportRows: [],
    exportGroups: [],
    dauCaRows: [],
    dauCaGroups: [],
    cuoiCaRows: [],
    cuoiCaGroups: [],
    damagedRows: [],
    damagedGroups: [],
    sanLuongGroups: [],
    inboundRows: [],
    thucDungRows: [],
    thucDungGroups: [],
    tongHopThucXuatGroups: [],
    inboundNormGroups: [],
    tongGroups: [],
    mixingGroups: [],
    danhGiaGroups: [],
    summary: {
      orderTotals: { quantity: 0, totalNormKg: 0 },
      plasticRequiredWeightKg: 0,
      exportTotalKg: 0,
      exportWeightByKind: { plasticKg: 0, otherKg: 0, totalKg: 0 },
      dauCaTotalKg: 0,
      dauCaWeightByKind: { plasticKg: 0, otherKg: 0, totalKg: 0 },
      cuoiCaTotalKg: 0,
      cuoiCaWeightByKind: { plasticKg: 0, otherKg: 0, totalKg: 0 },
      damagedTotalKg: 0,
      damagedWeightByKind: { plasticKg: 0, otherKg: 0 },
      sanLuongTotals: { quantity: 0, weightKg: 0 },
      canTuDongSanLuongTotals: { quantity: 0, weightKg: 0 },
      displaySanLuongTotals: { quantity: 0, weightKg: 0 },
      insulationFilmWeightKg: 0,
      insulationPlasticNorm: { weightKg: 0, counted: 0 },
      inboundTotals: { acceptedRolls: 0, mixedPlasticKg: 0, finishedGoodsInboundKg: 0 },
      thucDungTotalKg: 0,
      tongNhapKhoTotalKg: 0,
      tongChenhLechTotalKg: 0,
      tongGiaTriHaoHutLoiHong: 0
    }
  };
}
