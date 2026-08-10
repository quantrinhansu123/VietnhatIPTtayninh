import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Printer, X } from 'lucide-react';
import { formatMoney, formatNumber } from '../utils';
import type { ProductRow } from '../features/san-pham/types';
import type { MachineRow } from '../features/danh-sach-may';
import type { MaterialRow } from '../features/kho-nvl';
import type { ProductionOrderRow, ProductionOrderLookupSetting } from '../features/ke-hoach-san-xuat';
import { splitProductionOrderStaffNames } from '../features/cai-dat-thoi-gian';
import type { MixingReport } from './MixingReportForm';
import type { AcceptanceReport } from './AcceptanceReportForm';
import type { ShiftSetting } from '../utils/shiftSettings';
import type { ShiftSummaryWarehouseMovement } from '../utils/controlBoardShiftSummary';
import type { WeighingRecord } from '../utils/weighingRecords';
import type { MachineNvlSavedReport } from '../utils/machineNvlReports';
import { waitForPrintImagesReady } from '../utils/printReady';
import ControlBoardBbMachineReportPrintBatch from './ControlBoardBbMachineReportPrintSheet';
import BbCanTuDongSanLuongPanel from './BbCanTuDongSanLuongPanel';
import {
  filterCanTuDongRecordsForBoard,
  sumCanTuDongSanLuongTotals
} from '../utils/canTuDongWeights';
import type { CanTuDongRecord } from '../features/can-tu-dong';
import {
  BB_MACHINE_REPORT_TABS,
  buildBbCuoiCaLineRows,
  buildBbDamagedGoodsLineRows,
  buildBbDanhGiaHaoHutGroups,
  buildBbDauCaLineRows,
  buildBbInboundReportRows,
  buildBbInboundMaterialNormGroups,
  buildBbInboundBalanceMetricDetail,
  buildBbMixingMaterialLinesForShift,
  buildBbMixingRatioGroups,
  buildBbOrderCodeOptions,
  buildBbProductionOrderLineRows,
  buildBbSanLuongGroups,
  buildBbThucDungLineRows,
  buildBbThucDungMetricDetail,
  buildBbTongGroups,
  buildBbTongHopThucXuatMetricDetail,
  buildBbTongHopVatTuThucXuatDungGroups,
  buildBbWarehouseExportLineRows,
  aggregateBbWarehouseExportByMaterial,
  sumBbInboundTheoreticalNormKgForProductGroup,
  groupBbCuoiCaLines,
  groupBbDamagedGoodsLines,
  groupBbDauCaLines,
  groupBbProductionOrderLines,
  groupBbThucDungLines,
  groupBbWarehouseExportLines,
  sumBbCuoiCaWeightKg,
  sumBbCuoiCaWeightKgByKind,
  sumBbDamagedGoodsWeightKg,
  sumBbDamagedGoodsTotals,
  sumBbDanhGiaMoney,
  sumBbDauCaWeightKg,
  sumBbDauCaWeightKgByKind,
  sumBbInboundReportTotals,
  sumBbProductionOrderTotals,
  sumBbSanLuongTotals,
  sumBbThucDungWeightKg,
  sumBbTongChenhLech,
  sumBbTongTrongLuongNhapKho,
  sumBbWarehouseExportSlipQuantity,
  sumBbWarehouseExportWeightKg,
  sumBbWarehouseExportWeightKgByKind,
  type BbMaterialNormFormula,
  type BbWarehouseExportLineRow,
  type BbInboundMaterialBalanceDetail,
  type BbInboundBalanceDetailMetric,
  type BbInboundBalanceDetailBag,
  type BbExportWeightFormula,
  type BbMachineReportTabId,
  type BbDauCaTonDauFormula,
  type BbThucDungDetailMetric,
  type BbThucDungDetailView,
  type BbThucDungLineRow,
  type BbTongHopThucXuatDetailMetric,
  type BbTongHopThucXuatLineRow
} from '../utils/controlBoardBbMachineReport';
import { computePercentRatio } from '../utils/controlBoardShiftSummary';
import { isWarehouseKgUnit } from '../utils/warehouseWeight';
import type { BbProductionOrderGroup } from '../utils/controlBoardBbMachineReport';

type BbPrintConfirmSelection = {
  staffMain: string;
  staffAssistant: string;
  staffSupport: string;
  ghiChu: string;
};

const BB_PHAN_TICH_STORAGE_KEY = 'control-board-bb-phan-tich-v1';

function loadBbPhanTichMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BB_PHAN_TICH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistBbPhanTichMap(map: Record<string, string>) {
  try {
    localStorage.setItem(BB_PHAN_TICH_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function formatKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatNumber(value, digits);
}

/** Làm tròn kg giống số đang hiện trên bảng (tránh tổng SP lệch 0,01 so với cộng tay các dòng). */
function roundDisplayKg(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, digits)}%`;
}

function formatVnd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '—';
  return `${formatMoney(value, 0)} đ`;
}

function formatThucDungDetailCell(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  return String(value);
}

/**
 * Trọng lượng định mức = Số lượng của SP × Khối lượng (kg) trong bảng Thành phần (mã NVL của dòng).
 * Nhân thêm allocationRatio vì 1 mã NVL của 1 SP có thể bị tách thành nhiều dòng phiếu xuất
 * (allocationRatio là tỉ lệ chia — cộng dồn các dòng con mới ra đúng tổng định mức của mã đó).
 */
function computeTrongLuongDinhMucKg(line: BbWarehouseExportLineRow): number | null {
  const productQuantity = line.materialNorm?.productQuantity;
  const kgPerUnit = line.materialNorm?.componentWeightKg;
  const ratio = line.materialNorm?.allocationRatio;
  if (productQuantity === undefined || productQuantity === null || !(productQuantity > 0)) return null;
  if (kgPerUnit === null || kgPerUnit === undefined || !(kgPerUnit > 0)) return null;
  if (ratio === undefined || ratio === null || !(ratio > 0)) return null;
  return productQuantity * kgPerUnit * ratio;
}

function materialRatioKey(code: string | null | undefined) {
  return String(code || '').trim().toUpperCase();
}

/** Tổng Trọng lượng định mức theo từng mã NVL, cộng dồn qua mọi SP trong cùng 1 Lệnh SX (group). */
function sumTrongLuongDinhMucKgByMaterial(lines: BbWarehouseExportLineRow[]): Map<string, number> {
  const map = new Map<string, number>();
  lines.forEach(line => {
    const kg = computeTrongLuongDinhMucKg(line);
    if (kg === null) return;
    const key = materialRatioKey(line.itemCode);
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + kg);
  });
  return map;
}

/**
 * Tỉ lệ % = Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức
 * của mã NVL đó cộng dồn qua mọi SP trong cùng Lệnh SX.
 */
function computeTrongLuongDinhMucPercent(
  line: BbWarehouseExportLineRow,
  groupTotalsByMaterial: Map<string, number>
): number | null {
  const ownKg = computeTrongLuongDinhMucKg(line);
  if (ownKg === null) return null;
  const total = groupTotalsByMaterial.get(materialRatioKey(line.itemCode));
  if (!total || total <= 0) return null;
  return (ownKg / total) * 100;
}

function sumTrongLuongDinhMucKg(lines: BbWarehouseExportLineRow[]) {
  return lines.reduce((sum, line) => sum + (computeTrongLuongDinhMucKg(line) || 0), 0);
}

type MaterialProductNormDetail = {
  key: string;
  orderCode: string;
  ngay: string;
  shiftLabel: string;
  machine: string;
  productCode: string;
  productName: string;
  productQuantity: number;
  productUnit: string;
  componentWeightKg: number | null;
  /** Trọng lượng định mức (kg) của NVL trên SP này. */
  normWeightKg: number;
  /** Tỉ lệ % = TL ĐM SP này ÷ tổng TL ĐM mã NVL trong lệnh. */
  percent: number | null;
};

type MaterialTotalDetail = {
  itemCode: string;
  itemName: string;
  unit: string;
  exportQuantity: number;
  exportWeightKg: number;
  lineCount: number;
  products: MaterialProductNormDetail[];
};

/** Gom định mức theo từng SP (+ tỉ lệ %) cho 1 mã NVL từ dòng đã phân bổ trong exportGroups. */
function buildMaterialTotalDetail(
  material: {
    itemCode: string;
    itemName: string;
    unit: string;
    quantity: number;
    weightKg: number;
    lineCount: number;
  },
  exportGroups: Array<{
    orderCode: string;
    ngay: string;
    shiftLabel: string;
    shift: string;
    machine: string;
    productGroups: Array<{ lines: BbWarehouseExportLineRow[] }>;
  }>
): MaterialTotalDetail {
  const codeKey = materialRatioKey(material.itemCode);
  const products: MaterialProductNormDetail[] = [];

  for (const group of exportGroups) {
    const groupLines = group.productGroups.flatMap(pg => pg.lines || []);
    const materialLines = groupLines.filter(line => materialRatioKey(line.itemCode) === codeKey);
    if (materialLines.length === 0) continue;

    const totalsByMaterial = sumTrongLuongDinhMucKgByMaterial(groupLines);
    const materialTotalKg = totalsByMaterial.get(codeKey) || 0;
    const byProduct = new Map<string, MaterialProductNormDetail>();

    for (const line of materialLines) {
      const productCode = String(line.materialNorm?.productCode || '').trim();
      const productName = String(line.materialNorm?.productName || '').trim();
      const productKey = `${group.orderCode}|${productCode || productName || line.key}`;
      const lineNormKg = computeTrongLuongDinhMucKg(line) || 0;
      const existing = byProduct.get(productKey);
      if (!existing) {
        byProduct.set(productKey, {
          key: productKey,
          orderCode: group.orderCode,
          ngay: group.ngay,
          shiftLabel: group.shiftLabel || group.shift,
          machine: group.machine,
          productCode,
          productName,
          productQuantity: Math.max(0, line.materialNorm?.productQuantity || 0),
          productUnit: String(line.materialNorm?.productUnit || '').trim(),
          componentWeightKg: line.materialNorm?.componentWeightKg ?? null,
          normWeightKg: lineNormKg,
          percent: null
        });
        continue;
      }
      existing.normWeightKg += lineNormKg;
      if (!(existing.productQuantity > 0) && (line.materialNorm?.productQuantity || 0) > 0) {
        existing.productQuantity = line.materialNorm?.productQuantity || 0;
      }
      if (existing.componentWeightKg === null && line.materialNorm?.componentWeightKg != null) {
        existing.componentWeightKg = line.materialNorm.componentWeightKg;
      }
    }

    for (const row of byProduct.values()) {
      row.percent =
        materialTotalKg > 0 && row.normWeightKg > 0
          ? (row.normWeightKg / materialTotalKg) * 100
          : null;
      products.push(row);
    }
  }

  products.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    return (b.percent || 0) - (a.percent || 0);
  });

  return {
    itemCode: material.itemCode,
    itemName: material.itemName,
    unit: material.unit,
    exportQuantity: material.quantity,
    exportWeightKg: material.weightKg,
    lineCount: material.lineCount,
    products
  };
}

function ThucDungMetricButton({
  label,
  className,
  onOpen,
  title = 'Bấm để xem dữ liệu nguồn'
}: {
  label: string;
  className: string;
  onOpen: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`rounded-md px-1 py-0.5 underline decoration-dotted underline-offset-2 transition hover:bg-teal-100 ${className}`}
      title={title}
    >
      {label}
    </button>
  );
}

export default function ControlBoardBbMachineReportTable({
  productionOrders,
  products,
  materials,
  machines,
  warehouseMovements,
  damagedRecords = [],
  machineNvlReports = [],
  mixingReports = [],
  acceptanceReports = [],
  canTuDongRecords = [],
  sanLuongSource = 'acceptance',
  shiftSettings,
  isLoading,
  dateFrom,
  dateTo,
  shiftFilter = 'all',
  machineFilter = 'all',
  selectedMachine = null
}: {
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines: MachineRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  damagedRecords?: WeighingRecord[];
  machineNvlReports?: MachineNvlSavedReport[];
  mixingReports?: MixingReport[];
  acceptanceReports?: AcceptanceReport[];
  canTuDongRecords?: CanTuDongRecord[];
  /** `/phan-tich-tu-dong`: tab sản lượng lấy từ can_tu_dong theo ngày/ca. */
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  shiftSettings: Array<ShiftSetting | ProductionOrderLookupSetting>;
  isLoading?: boolean;
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
}) {
  const [activeTab, setActiveTab] = useState<BbMachineReportTabId>('lenh_sx');
  /** Đánh dấu tab đã rà soát xong (chỉ tạm trong phiên làm việc, không lưu lại). */
  const [checkedTabs, setCheckedTabs] = useState<Set<BbMachineReportTabId>>(() => new Set());
  const toggleTabChecked = (tabId: BbMachineReportTabId, event: React.MouseEvent) => {
    event.stopPropagation();
    setCheckedTabs(prev => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };
  const [phanTichMap, setPhanTichMap] = useState<Record<string, string>>(() =>
    typeof window !== 'undefined' ? loadBbPhanTichMap() : {}
  );
  const [orderCodeFilter, setOrderCodeFilter] = useState<string[]>([]);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [printConfirmOpen, setPrintConfirmOpen] = useState(false);
  const [printStaffByOrder, setPrintStaffByOrder] = useState<Record<string, BbPrintConfirmSelection>>({});
  const [printOrderGroups, setPrintOrderGroups] = useState<BbProductionOrderGroup[]>([]);
  const [printNoteByOrder, setPrintNoteByOrder] = useState<Record<string, string>>({});
  const [hrStaffNames, setHrStaffNames] = useState<string[]>([]);
  const [selectedMaterialNorm, setSelectedMaterialNorm] = useState<BbMaterialNormFormula | null>(null);
  const [selectedTrongLuongDinhMuc, setSelectedTrongLuongDinhMuc] = useState<BbWarehouseExportLineRow | null>(null);
  const [selectedExportSummary, setSelectedExportSummary] = useState<{
    title: string;
    subtitle: string;
    lines: BbWarehouseExportLineRow[];
  } | null>(null);
  const [selectedMaterialTotalDetail, setSelectedMaterialTotalDetail] = useState<MaterialTotalDetail | null>(
    null
  );
  const [selectedTonDauFormula, setSelectedTonDauFormula] = useState<BbDauCaTonDauFormula | null>(null);
  const [selectedExportWeight, setSelectedExportWeight] = useState<BbExportWeightFormula | null>(null);
  const [thucDungDetail, setThucDungDetail] = useState<{
    line: BbThucDungLineRow;
    metric: BbThucDungDetailMetric;
  } | null>(null);
  const [tongHopDetail, setTongHopDetail] = useState<{
    line: BbTongHopThucXuatLineRow;
    metric: BbTongHopThucXuatDetailMetric;
  } | null>(null);
  const [normDetail, setNormDetail] = useState<{
    orderCode: string;
    ngay: string;
    shiftLabel: string;
    machine: string;
    itemCode: string;
    itemName: string;
    unit: string;
    metric: 'weight' | 'quantity';
    totalKg: number;
    totalQty: number;
    balanceDetail: BbInboundMaterialBalanceDetail | null;
    lines: BbWarehouseExportLineRow[];
  } | null>(null);
  const [inboundBalanceDetail, setInboundBalanceDetail] = useState<{
    metric: BbInboundBalanceDetailMetric;
    itemCode: string;
    itemName: string;
    ngay: string;
    shift: string;
    shiftLabel: string;
    orderCode: string;
    machine: string;
    balanceDetail: BbInboundMaterialBalanceDetail | null;
  } | null>(null);

  const scopedGroupKey = (tabId: BbMachineReportTabId, groupKey: string) => `${tabId}:${groupKey}`;
  const isGroupExpanded = (tabId: BbMachineReportTabId, groupKey: string) =>
    !collapsedGroupKeys.has(scopedGroupKey(tabId, groupKey));
  const toggleGroup = (tabId: BbMachineReportTabId, groupKey: string) => {
    const key = scopedGroupKey(tabId, groupKey);
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const orderOptions = useMemo(
    () =>
      buildBbOrderCodeOptions({
        productionOrders,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [productionOrders, machines, shiftSettings, dateFrom, dateTo, shiftFilter, machineFilter, selectedMachine]
  );

  const orderOptionCodes = useMemo(() => new Set(orderOptions.map(option => option.code)), [orderOptions]);

  useEffect(() => {
    setOrderCodeFilter(prev => prev.filter(code => orderOptionCodes.has(code)));
  }, [orderOptionCodes]);

  const scopedProductionOrders = useMemo(
    () =>
      orderCodeFilter.length === 0
        ? productionOrders
        : productionOrders.filter(order => orderCodeFilter.includes(order.code)),
    [productionOrders, orderCodeFilter]
  );

  const orderRows = useMemo(
    () =>
      buildBbProductionOrderLineRows({
        productionOrders: scopedProductionOrders,
        products,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      products,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );

  const exportRows = useMemo(
    () =>
      buildBbWarehouseExportLineRows({
        productionOrders: scopedProductionOrders,
        warehouseMovements,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      warehouseMovements,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );

  const orderGroups = useMemo(() => groupBbProductionOrderLines(orderRows), [orderRows]);
  const exportGroups = useMemo(
    () => groupBbWarehouseExportLines(exportRows, scopedProductionOrders, products, materials),
    [exportRows, scopedProductionOrders, products, materials]
  );
  const exportLinkStats = useMemo(() => {
    let matchedLines = 0;
    let fallbackLines = 0;
    for (const row of exportRows) {
      if (row.matchedByOrder) matchedLines += 1;
      else fallbackLines += 1;
    }
    return { matchedLines, fallbackLines, totalLines: exportRows.length };
  }, [exportRows]);
  const inboundNormGroups = useMemo(
    () =>
      buildBbInboundMaterialNormGroups({
        productionOrders: scopedProductionOrders,
        acceptanceReports,
        products,
        materials,
        machines,
        machineNvlReports,
        warehouseMovements,
        damagedRecords,
        mixingReports,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      acceptanceReports,
      products,
      materials,
      machines,
      machineNvlReports,
      warehouseMovements,
      damagedRecords,
      mixingReports,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const damagedRows = useMemo(
    () =>
      buildBbDamagedGoodsLineRows({
        productionOrders: scopedProductionOrders,
        damagedRecords,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      damagedRecords,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const damagedGroups = useMemo(() => groupBbDamagedGoodsLines(damagedRows), [damagedRows]);
  const damagedGroupsWithMixing = useMemo(() => {
    return damagedGroups.map(group => {
      const mixingLines = buildBbMixingMaterialLinesForShift({
        mixingReports,
        ngay: group.ngay,
        shift: group.shift,
        machine: group.machine,
        shiftSettings
      });
      return {
        ...group,
        mixingLines,
        mixingLineCount: mixingLines.length
      };
    });
  }, [damagedGroups, mixingReports, shiftSettings]);
  const cuoiCaRows = useMemo(
    () =>
      buildBbCuoiCaLineRows({
        productionOrders: scopedProductionOrders,
        machineNvlReports,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      machineNvlReports,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const cuoiCaGroups = useMemo(() => groupBbCuoiCaLines(cuoiCaRows), [cuoiCaRows]);
  const dauCaRows = useMemo(
    () =>
      buildBbDauCaLineRows({
        productionOrders: scopedProductionOrders,
        machineNvlReports,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      machineNvlReports,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const dauCaGroups = useMemo(
    () =>
      groupBbDauCaLines(dauCaRows, scopedProductionOrders, products, materials, {
        machines,
        mixingReports,
        shiftSettings
      }),
    [dauCaRows, scopedProductionOrders, products, materials, machines, mixingReports, shiftSettings]
  );
  const sanLuongGroups = useMemo(
    () =>
      buildBbSanLuongGroups({
        productionOrders: scopedProductionOrders,
        acceptanceReports,
        products,
        materials,
        machines,
        machineNvlReports,
        warehouseMovements,
        damagedRecords,
        mixingReports,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      acceptanceReports,
      products,
      materials,
      machines,
      machineNvlReports,
      warehouseMovements,
      damagedRecords,
      mixingReports,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const inboundRows = useMemo(
    () =>
      buildBbInboundReportRows({
        productionOrders: scopedProductionOrders,
        warehouseMovements,
        machineNvlReports,
        damagedRecords,
        acceptanceReports,
        mixingReports,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      warehouseMovements,
      machineNvlReports,
      damagedRecords,
      acceptanceReports,
      mixingReports,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const thucDungRows = useMemo(
    () =>
      buildBbThucDungLineRows({
        productionOrders: scopedProductionOrders,
        mixingReports,
        warehouseMovements,
        machineNvlReports,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      mixingReports,
      warehouseMovements,
      machineNvlReports,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const thucDungGroups = useMemo(() => groupBbThucDungLines(thucDungRows), [thucDungRows]);
  const tongHopThucXuatGroups = useMemo(
    () =>
      buildBbTongHopVatTuThucXuatDungGroups({
        productionOrders: scopedProductionOrders,
        mixingReports,
        warehouseMovements,
        machineNvlReports,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      mixingReports,
      warehouseMovements,
      machineNvlReports,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  // Tab thực xuất dùng: dòng NVL lấy từ báo cáo trộn (đã gộp tỉ lệ).
  const thucDungDetailView = useMemo<BbThucDungDetailView | null>(() => {
    if (tongHopDetail) {
      return buildBbTongHopThucXuatMetricDetail({
        line: tongHopDetail.line,
        metric: tongHopDetail.metric,
        machineNvlReports,
        warehouseMovements,
        materials,
        shiftSettings
      });
    }
    if (!thucDungDetail) return null;
    return buildBbThucDungMetricDetail({
      line: thucDungDetail.line,
      metric: thucDungDetail.metric,
      mixingReports,
      machineNvlReports,
      warehouseMovements,
      materials,
      shiftSettings
    });
  }, [
    tongHopDetail,
    thucDungDetail,
    mixingReports,
    machineNvlReports,
    warehouseMovements,
    materials,
    shiftSettings
  ]);
  const closeMetricDetail = () => {
    setThucDungDetail(null);
    setTongHopDetail(null);
  };
  const inboundBalanceDetailView = useMemo<BbInboundBalanceDetailBag | null>(() => {
    if (!inboundBalanceDetail) return null;
    return buildBbInboundBalanceMetricDetail({
      metric: inboundBalanceDetail.metric,
      itemCode: inboundBalanceDetail.itemCode,
      itemName: inboundBalanceDetail.itemName,
      ngay: inboundBalanceDetail.ngay,
      shift: inboundBalanceDetail.shift,
      shiftLabel: inboundBalanceDetail.shiftLabel,
      orderCode: inboundBalanceDetail.orderCode,
      machine: inboundBalanceDetail.machine,
      balanceDetail: inboundBalanceDetail.balanceDetail,
      machineNvlReports,
      warehouseMovements,
      damagedRecords,
      materials,
      shiftSettings
    });
  }, [inboundBalanceDetail, machineNvlReports, warehouseMovements, damagedRecords, materials, shiftSettings]);
  const tongGroups = useMemo(
    () =>
      buildBbTongGroups({
        productionOrders: scopedProductionOrders,
        warehouseMovements,
        machineNvlReports,
        damagedRecords,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      warehouseMovements,
      machineNvlReports,
      damagedRecords,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const orderTotals = useMemo(() => sumBbProductionOrderTotals(orderRows), [orderRows]);
  const exportTotalKg = useMemo(() => sumBbWarehouseExportWeightKg(exportRows), [exportRows]);
  const exportWeightByKind = useMemo(
    () => sumBbWarehouseExportWeightKgByKind(exportRows),
    [exportRows]
  );
  /** Trọng lượng nhựa yêu cầu = tổng cột «Tổng (kg)» ở tab Dữ liệu trong lệnh sản xuất. */
  const plasticRequiredWeightKg = orderTotals.totalNormKg;
  const exportMaterialTotals = useMemo(
    () => aggregateBbWarehouseExportByMaterial(exportRows),
    [exportRows]
  );
  const exportMaterialTotalKg = useMemo(
    () => exportMaterialTotals.reduce((sum, row) => sum + (row.weightKg > 0 ? row.weightKg : 0), 0),
    [exportMaterialTotals]
  );
  const exportTotalNormKg = useMemo(
    () => exportGroups.reduce((sum, group) => sum + group.totalNormWeightKg, 0),
    [exportGroups]
  );
  const exportTotalTrongLuongDinhMucKg = useMemo(
    () =>
      exportGroups.reduce(
        (sum, group) => sum + sumTrongLuongDinhMucKg(group.productGroups.flatMap(pg => pg.lines || [])),
        0
      ),
    [exportGroups]
  );
  const inboundNormTotalKg = useMemo(
    () => inboundNormGroups.reduce((sum, group) => sum + group.totalNormWeightKg, 0),
    [inboundNormGroups]
  );
  const damagedTotalKg = useMemo(() => sumBbDamagedGoodsWeightKg(damagedRows), [damagedRows]);
  const damagedTotals = useMemo(() => sumBbDamagedGoodsTotals(damagedRows), [damagedRows]);
  const cuoiCaTotalKg = useMemo(() => sumBbCuoiCaWeightKg(cuoiCaRows), [cuoiCaRows]);
  const cuoiCaWeightByKind = useMemo(() => sumBbCuoiCaWeightKgByKind(cuoiCaRows), [cuoiCaRows]);
  const dauCaTotalKg = useMemo(() => sumBbDauCaWeightKg(dauCaRows), [dauCaRows]);
  const dauCaWeightByKind = useMemo(() => sumBbDauCaWeightKgByKind(dauCaRows), [dauCaRows]);
  const sanLuongTotals = useMemo(() => sumBbSanLuongTotals(sanLuongGroups), [sanLuongGroups]);
  /** Cùng tập dòng với `/can-tu-dong` theo ngày + ca (không lọc máy — trang cân cũng vậy). */
  const scopedCanTuDongRecords = useMemo(
    () =>
      filterCanTuDongRecordsForBoard(canTuDongRecords, {
        shiftFilter,
        dateFrom,
        dateTo
      }),
    [canTuDongRecords, shiftFilter, dateFrom, dateTo]
  );
  const canTuDongSanLuongTotals = useMemo(
    () => sumCanTuDongSanLuongTotals(scopedCanTuDongRecords),
    [scopedCanTuDongRecords]
  );
  const displaySanLuongTotals =
    sanLuongSource === 'can-tu-dong' ? canTuDongSanLuongTotals : sanLuongTotals;
  const plasticDamagedWeightKg = useMemo(
    () =>
      damagedRows.reduce((sum, row) => {
        const code = String(row.materialCode || '').toUpperCase();
        if (!code.startsWith('NHUA-')) return sum;
        return sum + (row.weightKg > 0 ? row.weightKg : 0);
      }, 0),
    [damagedRows]
  );
  /** Nhựa nhận = tồn đầu nhựa + xuất nhựa. */
  const plasticStockInWeightKg = dauCaWeightByKind.plasticKg + exportWeightByKind.plasticKg;
  /**
   * Chênh lệch nhựa =
   * (Xuất + Tồn đầu) − Thành phẩm − Lỗi nhựa − Tồn cuối
   */
  const plasticDifferenceWeightKg =
    plasticStockInWeightKg -
    displaySanLuongTotals.weightKg -
    plasticDamagedWeightKg -
    cuoiCaWeightByKind.plasticKg;
  /** Tồn nhựa (đầu − cuối) — phần rút từ tồn ca. */
  const plasticStockNetKg = dauCaWeightByKind.plasticKg - cuoiCaWeightByKind.plasticKg;
  const plasticSummaryRow = {
    requiredKg: plasticRequiredWeightKg,
    exportKg: exportWeightByKind.plasticKg,
    /** `/phan-tich-tu-dong`: = tổng cột «Trọng lượng nhựa» (SP − lõi − bì 0,16). */
    finishedKg: displaySanLuongTotals.weightKg,
    stockNetKg: plasticStockNetKg,
    damagedKg: plasticDamagedWeightKg,
    differenceKg: plasticDifferenceWeightKg
  };
  const inboundTotals = useMemo(() => sumBbInboundReportTotals(inboundRows), [inboundRows]);
  const thucDungTotalKg = useMemo(() => sumBbThucDungWeightKg(thucDungRows), [thucDungRows]);
  const tongNhapKhoTotalKg = useMemo(() => sumBbTongTrongLuongNhapKho(tongGroups), [tongGroups]);
  const tongChenhLechTotalKg = useMemo(() => sumBbTongChenhLech(tongGroups), [tongGroups]);
  const tongTiLeChenhLech = useMemo(
    () => computePercentRatio(tongChenhLechTotalKg, tongNhapKhoTotalKg),
    [tongChenhLechTotalKg, tongNhapKhoTotalKg]
  );
  const mixingGroups = useMemo(
    () =>
      buildBbMixingRatioGroups({
        productionOrders: scopedProductionOrders,
        mixingReports,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      mixingReports,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const danhGiaGroups = useMemo(
    () =>
      buildBbDanhGiaHaoHutGroups({
        productionOrders: scopedProductionOrders,
        products,
        warehouseMovements,
        machineNvlReports,
        damagedRecords,
        materials,
        machines,
        shiftSettings,
        dateFrom,
        dateTo,
        shiftFilter,
        machineFilter,
        selectedMachine
      }),
    [
      scopedProductionOrders,
      products,
      warehouseMovements,
      machineNvlReports,
      damagedRecords,
      materials,
      machines,
      shiftSettings,
      dateFrom,
      dateTo,
      shiftFilter,
      machineFilter,
      selectedMachine
    ]
  );
  const tongGiaTriHaoHutLoiHong = useMemo(
    () => sumBbDanhGiaMoney(danhGiaGroups, 'tongGiaTriHaoHutLoiHong'),
    [danhGiaGroups]
  );

  const activeGroupKeys = useMemo(() => {
    switch (activeTab) {
      case 'lenh_sx':
        return orderGroups.map(group => group.groupKey);
      case 'phieu_xuat_kho':
        return exportGroups.map(group => group.groupKey);
      case 'ton_dau_ca':
        return dauCaGroups.map(group => group.groupKey);
      case 'bao_cao_san_luong':
        return sanLuongGroups.map(group => group.groupKey);
      case 'bao_cao_loi_hong':
        return damagedGroupsWithMixing.map(group => group.groupKey);
      case 'kiem_ton_cuoi_ca':
        return cuoiCaGroups.map(group => group.groupKey);
      case 'tong_vat_tu_thuc_dung':
        return thucDungGroups.map(group => group.groupKey);
      case 'tong_hop_vat_tu_thuc_xuat_dung':
        return tongHopThucXuatGroups.map(group => group.groupKey);
      case 'tong_dinh_muc_nvl_nhap_kho':
        return inboundNormGroups.map(group => group.groupKey);
      case 'tong':
        return tongGroups.map(group => group.groupKey);
      default:
        return [];
    }
  }, [
    activeTab,
    orderGroups,
    exportGroups,
    dauCaGroups,
    sanLuongGroups,
    damagedGroupsWithMixing,
    cuoiCaGroups,
    thucDungGroups,
    tongHopThucXuatGroups,
    inboundNormGroups,
    tongGroups
  ]);

  const allActiveGroupsExpanded =
    activeGroupKeys.length > 0 && activeGroupKeys.every(groupKey => isGroupExpanded(activeTab, groupKey));
  const setAllActiveGroupsExpanded = (expanded: boolean) => {
    setCollapsedGroupKeys(prev => {
      const next = new Set(prev);
      activeGroupKeys.forEach(groupKey => {
        const key = scopedGroupKey(activeTab, groupKey);
        if (expanded) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  };

  const updatePhanTich = (rowKey: string, value: string) => {
    setPhanTichMap(prev => {
      const next = { ...prev, [rowKey]: value };
      persistBbPhanTichMap(next);
      return next;
    });
  };

  const handlePrint = () => {
    if (orderGroups.length === 0) return;
    const initialStaff: Record<string, BbPrintConfirmSelection> = {};
    orderGroups.forEach(group => {
      initialStaff[group.groupKey] = {
        staffMain: group.staffMain || '',
        staffAssistant: group.staffAssistant || '',
        staffSupport: group.staffSupport || '',
        ghiChu: printNoteByOrder[group.groupKey] || ''
      };
    });
    setPrintStaffByOrder(initialStaff);
    setPrintConfirmOpen(true);
    void (async () => {
      try {
        const res = await fetch('/api/nhan-su');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const rows = Array.isArray(data?.staff)
          ? data.staff
          : Array.isArray(data)
            ? data
            : [];
        const names = [
          ...new Set(
            rows
              .map((row: Record<string, unknown>) =>
                String(row.name ?? row.nhan_su ?? row.ho_ten ?? row.ten ?? '').trim()
              )
              .filter(Boolean)
          )
        ].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
        setHrStaffNames(names);
      } catch {
        /* giữ danh sách từ lệnh SX */
      }
    })();
  };

  const printStaffOptions = useMemo(() => {
    const names = new Set<string>(hrStaffNames);
    productionOrders.forEach(order => {
      splitProductionOrderStaffNames(order.staff || '').forEach(name => {
        if (name.trim()) names.add(name.trim());
      });
    });
    orderGroups.forEach(group => {
      [group.staffMain, group.staffAssistant, group.staffSupport].forEach(name => {
        String(name || '')
          .split(',')
          .map(part => part.trim())
          .filter(Boolean)
          .forEach(part => names.add(part));
      });
    });
    Object.values(printStaffByOrder).forEach((selection: BbPrintConfirmSelection) => {
      [selection.staffMain, selection.staffAssistant, selection.staffSupport].forEach(name => {
        if (name.trim()) names.add(name.trim());
      });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [hrStaffNames, productionOrders, orderGroups, printStaffByOrder]);

  const updatePrintStaff = (
    groupKey: string,
    field: keyof BbPrintConfirmSelection,
    value: string
  ) => {
    setPrintStaffByOrder(prev => ({
      ...prev,
      [groupKey]: {
        staffMain: prev[groupKey]?.staffMain || '',
        staffAssistant: prev[groupKey]?.staffAssistant || '',
        staffSupport: prev[groupKey]?.staffSupport || '',
        ghiChu: prev[groupKey]?.ghiChu || '',
        [field]: value
      }
    }));
  };

  const confirmPrint = () => {
    const nextGroups = orderGroups.map(group => {
      const selected = printStaffByOrder[group.groupKey];
      if (!selected) return group;
      return {
        ...group,
        staffMain: selected.staffMain.trim(),
        staffAssistant: selected.staffAssistant.trim(),
        staffSupport: selected.staffSupport.trim()
      };
    });
    const nextNotes: Record<string, string> = {};
    orderGroups.forEach(group => {
      const note = printStaffByOrder[group.groupKey]?.ghiChu?.trim() || '';
      if (note) nextNotes[group.groupKey] = note;
    });
    setPrintNoteByOrder(nextNotes);
    setPrintOrderGroups(nextGroups);
    setPrintConfirmOpen(false);
    setShowPrintSheet(true);
    setPendingPrint(true);
  };

  const closePrintConfirm = () => {
    if (pendingPrint) return;
    setPrintConfirmOpen(false);
  };

  useEffect(() => {
    if (!pendingPrint || !showPrintSheet) return;
    let cancelled = false;
    document.body.classList.add('shift-summary-print-active');
    document.body.classList.add('bb-machine-report-print-active');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
    };
  }, [pendingPrint, showPrintSheet]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
      setPendingPrint(false);
      setShowPrintSheet(false);
      setPrintOrderGroups([]);
      setPrintNoteByOrder({});
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return (
    <>
    <section className="control-board-report-theme overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-red-800 bg-gradient-to-r from-[#b30d1c] to-[#ef1b2d] px-3 py-3 text-white">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200/90">Báo cáo máy BB</p>
            <h3 className="text-sm font-black sm:text-base">Báo cáo tổng hợp máy BB</h3>
          </div>
          <button
            type="button"
            id="bb-machine-report-print-btn"
            onClick={handlePrint}
            disabled={isLoading || orderGroups.length === 0 || pendingPrint}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/80 bg-white px-3 text-xs font-black text-sky-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="In báo cáo tổng hợp máy BB"
          >
            {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {pendingPrint ? 'Đang chuẩn bị...' : 'In báo cáo'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title="Tổng SL và Tổng (kg) trong tab Dữ liệu trong lệnh sản xuất (theo bộ lọc)"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
              Trọng lượng nhựa yêu cầu
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div title="Tổng cột «SL» lệnh sản xuất">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Số lượng</p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : orderTotals.quantity > 0
                      ? formatNumber(orderTotals.quantity, 2)
                      : '—'}
                </p>
              </div>
              <div title="Tổng cột «Tổng (kg)» lệnh sản xuất">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Trọng lượng</p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : plasticRequiredWeightKg > 0
                      ? `${formatKg(plasticRequiredWeightKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title="Trọng lượng xuất = nhựa (ĐVT kg) + vật tư khác (ĐVT ≠ kg, cột Tổng kg)"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">Trọng lượng xuất</p>
            <p className="mt-0.5 font-mono text-sm font-black tabular-nums">
              {isLoading
                ? '…'
                : exportWeightByKind.totalKg > 0
                  ? `${formatKg(exportWeightByKind.totalKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div title="Dòng NVL nhựa, ĐVT = kg">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Trọng lượng nhựa</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : exportWeightByKind.plasticKg > 0
                      ? `${formatKg(exportWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div title="Dòng ĐVT ≠ kg — lấy cột Tổng (kg)">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Vật tư khác</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : exportWeightByKind.otherKg > 0
                      ? `${formatKg(exportWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title="Trọng lượng tồn đầu ca = nhựa (ĐVT kg) + vật tư khác (ĐVT ≠ kg) trên phiếu tồn đầu"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
              Trọng lượng tồn Đầu ca
            </p>
            <p className="mt-0.5 font-mono text-sm font-black tabular-nums">
              {isLoading
                ? '…'
                : dauCaWeightByKind.totalKg > 0
                  ? `${formatKg(dauCaWeightByKind.totalKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div title="Dòng NVL nhựa, ĐVT = kg">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Trọng lượng nhựa</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : dauCaWeightByKind.plasticKg > 0
                      ? `${formatKg(dauCaWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div title="Dòng ĐVT ≠ kg trên phiếu tồn đầu">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Vật tư khác</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : dauCaWeightByKind.otherKg > 0
                      ? `${formatKg(dauCaWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title="Trọng lượng tồn cuối ca = nhựa (ĐVT kg) + vật tư khác (ĐVT ≠ kg) trên phiếu tồn cuối"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
              Trọng lượng tồn Cuối ca
            </p>
            <p className="mt-0.5 font-mono text-sm font-black tabular-nums">
              {isLoading
                ? '…'
                : cuoiCaWeightByKind.totalKg > 0
                  ? `${formatKg(cuoiCaWeightByKind.totalKg, 2)} kg`
                  : '—'}
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div title="Dòng NVL nhựa, ĐVT = kg">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Trọng lượng nhựa</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : cuoiCaWeightByKind.plasticKg > 0
                      ? `${formatKg(cuoiCaWeightByKind.plasticKg, 2)} kg`
                      : '—'}
                </p>
              </div>
              <div title="Dòng ĐVT ≠ kg trên phiếu tồn cuối">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Vật tư khác</p>
                <p className="font-mono text-[11px] font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : cuoiCaWeightByKind.otherKg > 0
                      ? `${formatKg(cuoiCaWeightByKind.otherKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title={
              sanLuongSource === 'can-tu-dong'
                ? 'Số lần cân trên /can-tu-dong và tổng trọng lượng nhựa (SP − lõi − bì) theo bộ lọc ngày/ca'
                : 'Tổng SL sản lượng và trọng lượng thực tế (kg) trên tab Dữ liệu trong báo cáo sản lượng'
            }
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
              Báo cáo sản lượng
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div
                title={
                  sanLuongSource === 'can-tu-dong'
                    ? 'Số lần cân = số dòng trên /can-tu-dong theo cùng ngày/ca'
                    : 'Tổng cột «SL sản lượng»'
                }
              >
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">
                  {sanLuongSource === 'can-tu-dong' ? 'Lần cân' : 'Số lượng'}
                </p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : displaySanLuongTotals.quantity > 0
                      ? formatNumber(displaySanLuongTotals.quantity, sanLuongSource === 'can-tu-dong' ? 0 : 2)
                      : '—'}
                </p>
              </div>
              <div
                title={
                  sanLuongSource === 'can-tu-dong'
                    ? 'Tổng trọng lượng nhựa = SP − lõi − bì (bì mặc định 0,16 kg)'
                    : 'Tổng cột «Trọng lượng thực tế (kg)»'
                }
              >
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">
                  {sanLuongSource === 'can-tu-dong' ? 'Trọng lượng nhựa' : 'Trọng lượng'}
                </p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : displaySanLuongTotals.quantity > 0
                      ? `${formatKg(displaySanLuongTotals.weightKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>

          <div
            className="flex h-full min-h-[92px] flex-col rounded-lg border border-white/40 bg-white/15 px-2.5 py-1.5 shadow-sm backdrop-blur-[1px]"
            title="Tổng số phiếu và trọng lượng lỗi hỏng (kg) trên tab Dữ liệu trong báo cáo hàng lỗi hỏng"
          >
            <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
              Báo cáo lỗi hỏng
            </p>
            <div className="mt-auto grid grid-cols-2 gap-1.5 border-t border-white/25 pt-1.5">
              <div title="Số phiếu hàng lỗi hỏng (theo bộ lọc)">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Số lượng</p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : damagedTotals.quantity > 0
                      ? formatNumber(damagedTotals.quantity, 0)
                      : '—'}
                </p>
              </div>
              <div title="Tổng cột «Lỗi hỏng (kg)»">
                <p className="text-[8px] font-black uppercase tracking-wider text-white/75">Trọng lượng</p>
                <p className="font-mono text-sm font-black tabular-nums">
                  {isLoading
                    ? '…'
                    : damagedTotals.weightKg > 0
                      ? `${formatKg(damagedTotals.weightKg, 2)} kg`
                      : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-3 rounded-lg border border-white/40 bg-white/15 px-2.5 py-2 shadow-sm backdrop-blur-[1px]"
          title="Chênh lệch = (Xuất + Tồn đầu) − Thành phẩm − Lỗi nhựa − Tồn cuối"
        >
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-white/85">
            Tổng hợp nhựa
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                {
                  label: 'Tổng nhựa yêu cầu',
                  title: 'Tổng (kg) lệnh sản xuất',
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.requiredKg > 0
                      ? `${formatKg(plasticSummaryRow.requiredKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa xuất',
                  title: 'Xuất nhựa (ĐVT kg)',
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.exportKg > 0
                      ? `${formatKg(plasticSummaryRow.exportKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa thành phẩm',
                  title:
                    sanLuongSource === 'can-tu-dong'
                      ? 'Σ cột «Trọng lượng nhựa» trên /can-tu-dong (và tab sản lượng) theo cùng ngày/ca — SP − lõi − bì 0,16'
                      : 'Trọng lượng thực tế tab sản lượng',
                  display: isLoading
                    ? '…'
                    : sanLuongSource === 'can-tu-dong'
                      ? displaySanLuongTotals.quantity > 0
                        ? `${formatKg(plasticSummaryRow.finishedKg, 2)} kg`
                        : '—'
                      : plasticSummaryRow.finishedKg > 0
                        ? `${formatKg(plasticSummaryRow.finishedKg, 2)} kg`
                        : '—'
                },
                {
                  label: 'Tổng nhựa tồn',
                  title: 'Tồn đầu ca − Tồn cuối ca (nhựa)',
                  display: isLoading
                    ? '…'
                    : dauCaWeightByKind.plasticKg > 0 || cuoiCaWeightByKind.plasticKg > 0
                      ? `${formatKg(plasticSummaryRow.stockNetKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Tổng nhựa lỗi',
                  title: 'Chỉ NVL mã NHUA-*',
                  display: isLoading
                    ? '…'
                    : plasticSummaryRow.damagedKg > 0
                      ? `${formatKg(plasticSummaryRow.damagedKg, 2)} kg`
                      : '—'
                },
                {
                  label: 'Chênh lệch',
                  title: '(Xuất + Tồn đầu) − Thành phẩm − Lỗi nhựa − Tồn cuối',
                  display: isLoading
                    ? '…'
                    : Number.isFinite(plasticSummaryRow.differenceKg)
                      ? `${formatKg(plasticSummaryRow.differenceKg, 2)} kg`
                      : '—'
                }
              ] as const
            ).map(item => (
              <div
                key={item.label}
                className="rounded-md border border-white/30 bg-white/10 px-2 py-1.5"
                title={item.title}
              >
                <p className="text-[9px] font-black uppercase tracking-wider text-white/85">
                  {item.label}
                </p>
                <p className="mt-1 font-mono text-sm font-black tabular-nums text-white">
                  {item.display}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative border-b border-zinc-100 bg-zinc-50/80">
        <div className="bb-tab-scroller gap-1.5 px-2 py-2">
          {BB_MACHINE_REPORT_TABS.map(tab => {
            const isChecked = checkedTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg py-1.5 pl-1.5 pr-3 text-[11px] font-extrabold uppercase tracking-wide transition ${
                  activeTab === tab.id
                    ? 'bg-[#ef1b2d] text-white shadow-sm'
                    : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <span
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={
                    isChecked ? `Bỏ đánh dấu ${tab.label}` : `Đánh dấu đã rà soát ${tab.label}`
                  }
                  onClick={event => toggleTabChecked(tab.id, event)}
                  title={
                    isChecked ? 'Đã rà soát — bấm để bỏ đánh dấu' : 'Bấm để đánh dấu đã rà soát'
                  }
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                    isChecked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : activeTab === tab.id
                        ? 'border-white/60 bg-white/10 text-transparent hover:bg-white/20'
                        : 'border-zinc-300 bg-white text-transparent hover:border-emerald-400'
                  }`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-50 to-transparent" />
      </div>

      {activeGroupKeys.length > 0 ? (
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setAllActiveGroupsExpanded(true)}
              disabled={allActiveGroupsExpanded}
              className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-black text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:cursor-default disabled:opacity-40"
            >
              Mở tất cả
            </button>
            <button
              type="button"
              onClick={() => setAllActiveGroupsExpanded(false)}
              disabled={
                !allActiveGroupsExpanded &&
                activeGroupKeys.every(groupKey => !isGroupExpanded(activeTab, groupKey))
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
            >
              Đóng tất cả
            </button>
          </div>
        </div>
      ) : null}

      <div className="bb-table-scroll">
        {activeTab === 'lenh_sx' ? (
          <table className="min-w-[1280px] w-full table-fixed text-left text-sm font-semibold">
            <colgroup>
              <col className="w-10" />
              <col className="w-[6.75rem]" />
              <col className="w-[7rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[5.5rem]" />
              <col className="w-[6.5rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[6.75rem]" />
            </colgroup>
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-1.5 py-2 font-black" />
                <th className="px-2 py-2 font-black">Ngày</th>
                <th className="px-2 py-2 font-black">Lệnh SX</th>
                <th className="px-2 py-2 font-black">Ca</th>
                <th className="px-2 py-2 font-black">Thợ chính</th>
                <th className="px-2 py-2 font-black">Phụ máy</th>
                <th className="px-2 py-2 font-black">Hỗ trợ</th>
                <th className="px-2 py-2 text-right font-black">Dòng</th>
                <th className="px-2 py-2 text-right font-black">SL</th>
                <th className="px-2 py-2 text-right font-black">Tổng TL (kg)</th>
                <th className="px-2 py-2 text-right font-black">% KL nhựa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo máy BB...
                  </td>
                </tr>
              ) : orderGroups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có lệnh SX máy BB theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                orderGroups.map(group => {
                  const expanded = isGroupExpanded('lenh_sx', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-sky-200 bg-sky-50/60 font-bold hover:bg-sky-100/50 transition">
                        <td className="px-1.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('lenh_sx', group.groupKey)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-2 py-1.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-2 py-1.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-2 py-1.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffMain || '—'}</td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffAssistant || '—'}</td>
                        <td className="px-2 py-1.5 text-zinc-700 text-sm">{group.staffSupport || '—'}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-zinc-600">{group.lineCount}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-zinc-800">
                          {formatNumber(group.quantity, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                          {formatKg(group.totalNormKg, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold text-teal-700">
                          {group.totalNormKg > 0 ? '100%' : '—'}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="bg-sky-50/30">
                          <td colSpan={11} className="p-0">
                            <div className="overflow-x-auto border-y border-sky-200 bg-white">
                              <table className="min-w-[1100px] w-full table-fixed text-left text-sm font-semibold">
                                <colgroup>
                                  <col className="w-[9rem]" />
                                  <col />
                                  <col className="w-[5.5rem]" />
                                  <col className="w-[8rem]" />
                                  <col className="w-[6.5rem]" />
                                  <col className="w-[8rem]" />
                                  <col className="w-[7rem]" />
                                </colgroup>
                                <thead>
                                  <tr className="bg-sky-100/70 text-xs font-black uppercase tracking-wider text-sky-900">
                                    <th className="px-3 py-2 font-black">Mã hàng</th>
                                    <th className="px-3 py-2 font-black">Tên hàng</th>
                                    <th className="px-3 py-2 font-black">ĐVT</th>
                                    <th className="px-3 py-2 text-right font-black">Định mức (kg)</th>
                                    <th className="px-3 py-2 text-right font-black">SL</th>
                                    <th className="px-3 py-2 text-right font-black">Tổng (kg)</th>
                                    <th className="px-3 py-2 text-right font-black">% KL nhựa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.lines.map(row => {
                                    const plasticPercent =
                                      group.totalNormKg > 0 && row.totalNormKg && row.totalNormKg > 0
                                        ? (row.totalNormKg / group.totalNormKg) * 100
                                        : null;
                                    return (
                                      <tr
                                        key={row.key}
                                        className="border-b border-slate-100 bg-white font-semibold hover:bg-sky-50/40"
                                      >
                                        <td className="px-3 py-2 font-mono font-bold text-zinc-800">
                                          {row.productCode || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-zinc-700">{row.productName || '—'}</td>
                                        <td className="px-3 py-2 text-zinc-600">{row.unit || '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                                          {formatKg(row.normKgPerUnit, 2)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-zinc-800">
                                          {formatNumber(row.quantity, 2)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                          {formatKg(row.totalNormKg, 2)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-teal-700">
                                          {plasticPercent === null
                                            ? '—'
                                            : `${formatNumber(plasticPercent, 2)}%`}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && orderGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={8} className="px-2 py-2 text-right uppercase tracking-wider">
                    Tổng cộng ({orderGroups.length} lệnh)
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{formatNumber(orderTotals.quantity, 2)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">
                    {formatKg(orderTotals.totalNormKg, 2)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-teal-700">
                    {orderTotals.totalNormKg > 0 ? '100%' : '—'}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'phieu_xuat_kho' ? (
          <div className="space-y-4">
          {!isLoading && exportLinkStats.totalLines > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <span>
                Liên thông lệnh SX:{' '}
                <span className="font-black text-emerald-700">{exportLinkStats.matchedLines}</span> dòng khớp mã
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <span className="font-black text-amber-700">{exportLinkStats.fallbackLines}</span> dòng chỉ theo ngày+ca
              </span>
              {exportLinkStats.fallbackLines > 0 ? (
                <span className="w-full text-[11px] font-medium text-amber-800/90">
                  Phiếu XK chưa gắn mã lệnh trong lý do sẽ gán theo ngày+ca. Sửa phiếu và chọn lệnh SX rồi lưu lại để liên thông đúng.
                </span>
              ) : null}
            </div>
          ) : null}
          <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900">
                Tổng NVL đã xuất
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm font-semibold">
                <thead className="bg-emerald-50/80 text-xs uppercase tracking-wider text-emerald-900">
                  <tr>
                    <th className="px-4 py-2.5 font-black">STT</th>
                    <th className="px-4 py-2.5 font-black">Mã NVL</th>
                    <th className="px-4 py-2.5 font-black">Tên nguyên vật liệu</th>
                    <th className="px-4 py-2.5 text-right font-black">ĐVT</th>
                    <th className="px-4 py-2.5 text-right font-black">SL xuất</th>
                    <th className="px-4 py-2.5 text-right font-black">Tổng (kg)</th>
                    <th className="px-4 py-2.5 text-right font-black">Số dòng phiếu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center font-bold text-zinc-400">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Đang tải tổng NVL xuất kho...
                      </td>
                    </tr>
                  ) : exportMaterialTotals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center font-bold text-zinc-400">
                        Chưa có NVL xuất kho trong khoảng lọc.
                      </td>
                    </tr>
                  ) : (
                    exportMaterialTotals.map((row, index) => (
                      <tr
                        key={row.key}
                        className="cursor-pointer hover:bg-emerald-100/60"
                        title="Bấm để xem định mức từng sản phẩm theo tỉ lệ %"
                        onClick={() =>
                          setSelectedMaterialTotalDetail(buildMaterialTotalDetail(row, exportGroups))
                        }
                      >
                        <td className="px-4 py-2 font-mono font-bold text-emerald-700">{index + 1}</td>
                        <td className="px-4 py-2 font-mono font-black text-emerald-900 underline decoration-dotted underline-offset-2">
                          {row.itemCode || '—'}
                        </td>
                        <td className="px-4 py-2 font-semibold text-zinc-800 underline decoration-dotted underline-offset-2">
                          {row.itemName || '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-600">{row.unit || '—'}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                          {row.quantity > 0 ? formatNumber(row.quantity, 3) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-black text-amber-800">
                          {row.weightKg > 0 ? formatKg(row.weightKg, 2) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-zinc-500">{row.lineCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!isLoading && exportMaterialTotals.length > 0 ? (
                  <tfoot className="border-t-2 border-emerald-300 bg-emerald-50 text-xs font-black text-emerald-950">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider">
                        Tổng cộng
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-800">
                        {formatKg(exportMaterialTotalKg, 2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-zinc-600">
                        {exportMaterialTotals.reduce((sum, row) => sum + row.lineCount, 0)}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </section>

          <table className="min-w-[1180px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng NVL</th>
                <th className="px-4 py-3.5 text-right font-black">Định mức (kg)</th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần"
                >
                  Trọng lượng định mức
                </th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức mã NVL đó trong cả Lệnh SX"
                >
                  Tỉ lệ %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải phiếu xuất kho...
                  </td>
                </tr>
              ) : exportGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có phiếu xuất kho NVL gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                exportGroups.map(group => {
                  const expanded = isGroupExpanded('phieu_xuat_kho', group.groupKey);
                  const groupLines = group.productGroups.flatMap(pg => pg.lines || []);
                  const groupMaterialTotals = sumTrongLuongDinhMucKgByMaterial(groupLines);
                  const openGroupSummary = () =>
                    setSelectedExportSummary({
                      title: `Lệnh SX ${group.orderCode || '—'}`,
                      subtitle: `${group.ngay || '—'} · ${group.shiftLabel || group.shift || '—'} · ${group.machine || '—'}`,
                      lines: groupLines
                    });
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-amber-200 bg-amber-50/60 font-bold hover:bg-amber-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('phieu_xuat_kho', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-800 shadow-sm transition hover:bg-amber-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {group.orderCode || '—'}
                            {group.unmatchedCount > 0 ? (
                              <span
                                className="rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-900"
                                title={`${group.unmatchedCount} dòng chỉ khớp ngày+ca, chưa gắn mã lệnh trên phiếu XK`}
                              >
                                {group.unmatchedCount}/{group.lineCount} ngày+ca
                              </span>
                            ) : group.lineCount > 0 ? (
                              <span
                                className="rounded-md border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-900"
                                title="Mọi dòng phiếu XK đã khớp mã lệnh SX"
                              >
                                khớp lệnh
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600">{group.lineCount}</td>
                        <td
                          className="px-4 py-2.5 text-right font-mono font-black text-emerald-700"
                          title="Tổng số lượng sản phẩm × định mức kg/đơn vị trong bảng Sản phẩm"
                        >
                          <ThucDungMetricButton
                            label={formatKg(group.totalNormWeightKg, 2)}
                            className="font-mono font-black text-emerald-700"
                            onOpen={openGroupSummary}
                            title="Bấm để xem nguồn và công thức định mức"
                          />
                        </td>
                        <td
                          className="px-4 py-2.5 text-right font-mono font-black text-lime-700"
                          title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần — cộng dồn cả phiếu"
                        >
                          <ThucDungMetricButton
                            label={formatKg(sumTrongLuongDinhMucKg(groupLines), 2)}
                            className="font-mono font-black text-lime-700"
                            onOpen={openGroupSummary}
                            title="Bấm để xem công thức Trọng lượng định mức"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-zinc-400">—</td>
                      </tr>
                      {expanded ? (
                        <>
                          {group.productGroups.map(productGroup => {
                            const productGroupKey = `${group.groupKey}|product:${productGroup.productKey}`;
                            const productExpanded = isGroupExpanded('phieu_xuat_kho', productGroupKey);
                            const productLines = productGroup.lines || [];
                            const openProductSummary = () =>
                              setSelectedExportSummary({
                                title: productGroup.productName || productGroup.productCode || 'Sản phẩm',
                                subtitle: `${productGroup.productCode || '—'} · Lệnh SX ${group.orderCode || '—'}`,
                                lines: productLines
                              });
                            return (
                              <React.Fragment key={productGroupKey}>
                                <tr className="border-y border-sky-200 bg-sky-50 font-bold text-sky-950 hover:bg-sky-100/80">
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => toggleGroup('phieu_xuat_kho', productGroupKey)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                                      title={productExpanded ? 'Đóng NVL của sản phẩm' : 'Mở NVL của sản phẩm'}
                                      aria-expanded={productExpanded}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${productExpanded ? '' : '-rotate-90'}`}
                                      />
                                    </button>
                                  </td>
                                  <td colSpan={4} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">
                                        Sản phẩm
                                      </span>
                                      {productGroup.productCode ? (
                                        <span className="font-mono font-black text-sky-900">{productGroup.productCode}</span>
                                      ) : null}
                                      <span className="font-black text-zinc-900">{productGroup.productName || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-sky-800">
                                    {productGroup.lineCount} dòng
                                  </td>
                                  <td
                                    className="px-3 py-2 text-right font-mono font-black text-emerald-700"
                                    title={`${formatNumber(productGroup.orderQuantity, 3)} × ${formatKg(productGroup.normKgPerUnit, 2)}`}
                                  >
                                    {productGroup.normKgPerUnit === null ? '—' : (
                                      <ThucDungMetricButton
                                        label={formatKg(productGroup.normWeightKg, 2)}
                                        className="font-mono font-black text-emerald-700"
                                        onOpen={openProductSummary}
                                        title="Bấm để xem nguồn và công thức định mức"
                                      />
                                    )}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-right font-mono font-black text-lime-700"
                                    title="Số lượng của SP × Khối lượng (kg) mã NVL đó trong bảng Thành phần — cộng dồn theo SP"
                                  >
                                    <ThucDungMetricButton
                                      label={formatKg(sumTrongLuongDinhMucKg(productLines), 2)}
                                      className="font-mono font-black text-lime-700"
                                      onOpen={openProductSummary}
                                      title="Bấm để xem công thức Trọng lượng định mức"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-zinc-400">—</td>
                                </tr>
                                {productExpanded ? (
                                  <>
                                    <tr className="border-y border-amber-100 bg-amber-50 text-xs font-black uppercase tracking-wider text-amber-900">
                                      <td />
                                      <td className="px-3 py-1.5 font-black">Ngày</td>
                                      <td className="px-3 py-1.5 font-black">Mã NPL</td>
                                      <td colSpan={2} className="px-3 py-1.5 font-black">
                                        Tên NPL
                                      </td>
                                      <td className="px-3 py-1.5 font-black">ĐVT</td>
                                      <td className="px-3 py-1.5 text-right font-black">SL định mức</td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Số lượng của SP × Khối lượng (kg) mã NVL này trong bảng Thành phần"
                                      >
                                        Trọng lượng định mức
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Trọng lượng định mức của mã NVL đó trong SP đó ÷ tổng Trọng lượng định mức mã NVL đó trong cả Lệnh SX"
                                      >
                                        Tỉ lệ %
                                      </td>
                                    </tr>
                                    {productGroup.lines.length === 0 ? (
                                      <tr className="bg-white">
                                        <td />
                                        <td colSpan={8} className="px-3 py-3 text-center text-xs font-bold text-zinc-400">
                                          Chưa có NVL xuất kho khớp với thành phần của sản phẩm này.
                                        </td>
                                      </tr>
                                    ) : (
                                      productGroup.lines.map(row => (
                                        <tr key={row.key} className="bg-white font-semibold hover:bg-amber-50/60">
                                          <td className="px-2 py-1.5" />
                                          <td className="px-3 py-1.5 font-mono text-zinc-700">{row.ngay || '—'}</td>
                                          <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                            {row.itemCode || '—'}
                                          </td>
                                          <td colSpan={2} className="px-3 py-1.5 text-zinc-700">
                                            {row.itemName || '—'}
                                          </td>
                                          <td className="px-3 py-1.5 text-zinc-600">{row.unit || '—'}</td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-violet-800">
                                            {isWarehouseKgUnit(row.unit) ||
                                            row.normQuantity === null ||
                                            row.normQuantity <= 0
                                              ? '—'
                                              : row.materialNorm
                                                ? (
                                                    <button
                                                      type="button"
                                                      onClick={() => setSelectedMaterialNorm(row.materialNorm)}
                                                      className="rounded-md px-1.5 py-0.5 font-mono font-black text-violet-800 underline decoration-dotted underline-offset-2 transition hover:bg-violet-100 hover:text-violet-950"
                                                      title="Bấm để xem công thức tính định mức"
                                                    >
                                                      {formatNumber(row.normQuantity, 3)}
                                                    </button>
                                                  )
                                                : formatNumber(row.normQuantity, 3)}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-lime-700">
                                            {computeTrongLuongDinhMucKg(row) === null ? (
                                              '—'
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setSelectedTrongLuongDinhMuc(row)}
                                                className="rounded-md px-1.5 py-0.5 font-mono font-black text-lime-700 underline decoration-dotted underline-offset-2 transition hover:bg-lime-100 hover:text-lime-950"
                                                title="Bấm để xem công thức Trọng lượng định mức"
                                              >
                                                {formatKg(computeTrongLuongDinhMucKg(row), 2)}
                                              </button>
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                            {formatPercent(computeTrongLuongDinhMucPercent(row, groupMaterialTotals), 2)}
                                          </td>
                                        </tr>
                                      ))
                                    )}
                                  </>
                                ) : null}
                              </React.Fragment>
                            );
                          })}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && exportGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">
                    {formatKg(exportTotalNormKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-lime-700">
                    {formatKg(exportTotalTrongLuongDinhMucKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-zinc-400">—</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          </div>
        ) : activeTab === 'ton_dau_ca' ? (
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th colSpan={3} className="px-4 py-3.5 text-right font-black">
                  SP / NVL
                </th>
                <th className="px-4 py-3.5 text-right font-black">Tồn đầu ca (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo tồn đầu ca...
                  </td>
                </tr>
              ) : dauCaGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có báo cáo tồn đầu ca gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                dauCaGroups.map(group => {
                  const expanded = isGroupExpanded('ton_dau_ca', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-indigo-200 bg-indigo-50/60 font-bold hover:bg-indigo-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('ton_dau_ca', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-indigo-300 bg-white text-indigo-800 shadow-sm transition hover:bg-indigo-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td colSpan={3} className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600">
                          {group.productCount}/{group.lineCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-800">
                          {formatKg(group.totalWeightKg, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-indigo-100 bg-indigo-100/40 text-xs font-black uppercase tracking-wider text-indigo-900">
                            <td />
                            <td className="px-4 py-2 font-black">Mã NVL</td>
                            <td className="px-4 py-2 font-black">Tên nguyên phụ liệu</td>
                            <td className="px-4 py-2 font-black">ĐVT</td>
                            <td className="px-4 py-2 text-right font-black" title="Từ thành phần % SP hoặc tỉ lệ trộn máy">
                              Tỉ lệ ĐM (%)
                            </td>
                            <td
                              className="px-4 py-2 text-right font-black"
                              title="Ưu tiên phiếu trộn ca liền trước (KL NVL ÷ tổng trộn × 100); không có thì lấy tỉ lệ ĐM"
                            >
                              Tỉ lệ thực tế (%)
                            </td>
                            <td className="px-4 py-2 text-right font-black">Thành phần</td>
                            <td className="px-4 py-2 text-right font-black">SL tồn</td>
                            <td
                              className="px-4 py-2 text-right font-black"
                              title="Có NNS-TRON: NNS-TRON × Tỉ lệ thực tế (%); không thì lấy tồn đầu theo mã NVL"
                            >
                              Tồn đầu (kg)
                            </td>
                          </tr>
                          {(group.materialLines || []).map(row => (
                            <tr
                              key={row.key}
                              className="bg-white font-semibold hover:bg-indigo-50/40 border-b border-slate-50"
                            >
                              <td className="px-3 py-2" />
                              <td className="px-4 py-2 font-mono font-bold text-zinc-800">
                                {row.itemCode || '—'}
                              </td>
                              <td className="px-4 py-2 text-zinc-700">{row.itemName || '—'}</td>
                              <td className="px-4 py-2 text-zinc-600">{row.unit || '—'}</td>
                              <td className="px-4 py-2 text-right font-mono text-zinc-600">
                                {formatPercent(row.tiLeDinhMucPercent, 2)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-orange-800">
                                {formatPercent(row.tiLeThucTeTbPercent, 2)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-zinc-700">
                                {row.dinhMucRate === null || row.dinhMucRate === undefined
                                  ? '—'
                                  : `${formatNumber(row.dinhMucRate, row.amountType === 'percent' ? 2 : 3)}${
                                      row.dinhMucUnit ? ` ${row.dinhMucUnit}` : ''
                                    }`}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                                {row.tonDauQuantity > 0 ? formatNumber(row.tonDauQuantity, 3) : '—'}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-indigo-700">
                                {row.tonDauFormula ? (
                                  <ThucDungMetricButton
                                    label={formatKg(row.tonDauWeightKg, 2)}
                                    className="font-mono font-bold text-indigo-700"
                                    onOpen={() => {
                                      if (row.tonDauFormula) setSelectedTonDauFormula(row.tonDauFormula);
                                    }}
                                  />
                                ) : (
                                  formatKg(row.tonDauWeightKg, 2)
                                )}
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && dauCaGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={8} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-indigo-800">{formatKg(dauCaTotalKg, 2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'bao_cao_san_luong' ? (
          sanLuongSource === 'can-tu-dong' ? (
            <BbCanTuDongSanLuongPanel
              records={canTuDongRecords}
              isLoading={isLoading}
              shiftFilter={shiftFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : (
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-violet-100 to-fuchsia-50 border-b-2 border-violet-300 text-xs uppercase tracking-wider text-violet-900">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Số NVL</th>
                <th className="px-4 py-3.5 text-right font-black">SL sản lượng</th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="SL mặt hàng ÷ tổng SL mọi SP trên phiếu báo cáo sản lượng cùng nhóm"
                >
                  % mặt hàng
                </th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Tổng định mức NVL từ công thức SP × SL trên phiếu báo cáo sản lượng"
                >
                  Định mức NVL (kg)
                </th>
                <th
                  className="px-4 py-3.5 text-right font-black"
                  title="Tổng trọng lượng thực tế theo từng NVL"
                >
                  Trọng lượng thực tế (kg)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo sản lượng...
                  </td>
                </tr>
              ) : sanLuongGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có phiếu báo cáo sản lượng gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                sanLuongGroups.map(group => {
                  const expanded = isGroupExpanded('bao_cao_san_luong', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-violet-200 bg-violet-50/70 font-bold hover:bg-violet-100/60 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('bao_cao_san_luong', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm transition hover:bg-violet-50"
                            title={expanded ? 'Đóng các dòng NVL' : 'Mở các dòng NVL'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600">
                          {group.lineCount}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-800">
                          {formatNumber(group.totalQuantity, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-800">
                          100%
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-700">
                          {formatKg(group.totalNormWeightKg, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-amber-800">
                          {group.balanceSummary ? (
                            <ThucDungMetricButton
                              label={formatKg(group.totalActualWeightKg, 2)}
                              className="font-mono font-black text-amber-800"
                              title="Tồn đầu (tab Tồn đầu ca) + Xuất − Lỗi hỏng − Tồn cuối"
                              onOpen={() =>
                                setInboundBalanceDetail({
                                  metric: 'thuc_te',
                                  itemCode: '',
                                  itemName: 'Tất cả NVL',
                                  ngay: group.ngay,
                                  shift: group.shift,
                                  shiftLabel: group.shiftLabel,
                                  orderCode: group.orderCode,
                                  machine: group.machine,
                                  balanceDetail: group.balanceSummary
                                })
                              }
                            />
                          ) : (
                            formatKg(group.totalActualWeightKg, 2)
                          )}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-violet-100 bg-violet-100/50 text-xs font-black uppercase tracking-wider text-violet-900">
                            <td />
                            <td className="px-4 py-2 font-black">Mã NVL</td>
                            <td colSpan={3} className="px-4 py-2 font-black">
                              Tên nguyên vật liệu
                            </td>
                            <td className="px-4 py-2 text-right font-black">ĐVT</td>
                            <td className="px-4 py-2 text-right font-mono text-violet-700/70">—</td>
                            <td className="px-4 py-2 text-right font-mono text-violet-700/70">—</td>
                            <td className="px-4 py-2 text-right font-black">Định mức (kg)</td>
                            <td className="px-4 py-2 text-right font-black">Trọng lượng thực tế (kg)</td>
                          </tr>
                          {(group.nvlTotals || []).length === 0 ? (
                            <tr className="bg-white">
                              <td />
                              <td colSpan={9} className="px-4 py-2 text-sm font-semibold text-zinc-400">
                                Chưa có nguyên vật liệu trong công thức sản phẩm.
                              </td>
                            </tr>
                          ) : (
                            (group.nvlTotals || []).map(row => {
                              const openBalanceDetail = () =>
                                setInboundBalanceDetail({
                                  metric: 'thuc_te',
                                  itemCode: row.itemCode,
                                  itemName: row.itemName,
                                  ngay: group.ngay,
                                  shift: group.shift,
                                  shiftLabel: group.shiftLabel,
                                  orderCode: group.orderCode,
                                  machine: group.machine,
                                  balanceDetail: row.balanceDetail
                                });
                              return (
                                <tr
                                  key={row.key}
                                  className="bg-white font-semibold hover:bg-violet-50/50 border-b border-slate-50"
                                >
                                  <td className="px-3 py-2" />
                                  <td className="px-4 py-2 font-mono font-bold text-zinc-800">
                                    {row.itemCode || '—'}
                                  </td>
                                  <td colSpan={3} className="px-4 py-2 text-zinc-700">
                                    {row.itemName || '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-zinc-600">
                                    {row.unit || '—'}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-zinc-400">—</td>
                                  <td className="px-4 py-2 text-right font-mono text-zinc-400">—</td>
                                  <td className="px-4 py-2 text-right font-mono font-black text-emerald-700">
                                    {formatKg(row.normWeightKg, 2)}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono font-black text-amber-800">
                                    {row.balanceDetail ? (
                                      <ThucDungMetricButton
                                        label={formatKg(row.actualWeightKg, 2)}
                                        className="font-mono font-black text-amber-800"
                                        title={`(Tồn đầu tab ${formatKg(row.balanceDetail.tonDauKg, 2)}) + (Xuất ${formatKg(row.balanceDetail.xuatThucTeKg, 2)}) − (Lỗi ${formatKg(row.balanceDetail.loiHongKg, 2)}) − (Tồn cuối ${formatKg(row.balanceDetail.tonCuoiKg, 2)})`}
                                        onOpen={openBalanceDetail}
                                      />
                                    ) : (
                                      formatKg(row.actualWeightKg, 2)
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && sanLuongGroups.length > 0 ? (
              <tfoot className="border-t-2 border-violet-300 bg-violet-50 text-xs font-black text-violet-950">
                <tr>
                  <td colSpan={8} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-800">
                    {formatKg(
                      sanLuongGroups.reduce((sum, g) => sum + (g.totalNormWeightKg || 0), 0),
                      3
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-800">
                    {formatKg(
                      sanLuongGroups.reduce((sum, g) => sum + (g.totalActualWeightKg || 0), 0),
                      2
                    )}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          )
        ) : activeTab === 'bao_cao_loi_hong' ? (
          <>
            {damagedGroupsWithMixing.length > 0 ? (
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(true)}
                    disabled={damagedGroupsWithMixing.every(g => isGroupExpanded('bao_cao_loi_hong', g.groupKey))}
                    className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-black text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:cursor-default disabled:opacity-40"
                  >
                    Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(false)}
                    disabled={damagedGroupsWithMixing.every(g => !isGroupExpanded('bao_cao_loi_hong', g.groupKey))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
                  >
                    Đóng tất cả
                  </button>
                </div>
              </div>
            ) : null}

            <div className="bb-table-scroll">
          <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng NVL trộn</th>
                <th className="px-4 py-3.5 text-right font-black">Lỗi hỏng (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo hàng lỗi hỏng...
                  </td>
                </tr>
              ) : damagedGroupsWithMixing.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có báo cáo hàng lỗi hỏng gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                damagedGroupsWithMixing.map(group => {
                  const expanded = isGroupExpanded('bao_cao_loi_hong', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-rose-200 bg-rose-50/60 font-bold hover:bg-rose-100/50 transition">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup('bao_cao_loi_hong', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-300 bg-white text-rose-800 shadow-sm transition hover:bg-rose-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-600">
                          {group.mixingLineCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-rose-800">
                          {formatKg(group.totalWeightKg, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-rose-100 bg-rose-100/40 text-xs font-black uppercase tracking-wider text-rose-900">
                            <td />
                            <td className="px-4 py-2.5 font-black">Mã NVL</td>
                            <td colSpan={2} className="px-4 py-2.5 font-black">
                              Tên nguyên phụ liệu (báo cáo phối trộn)
                            </td>
                            <td className="px-4 py-2.5 font-black">ĐVT</td>
                            <td className="px-4 py-2.5 text-right font-black">Tỉ lệ trộn (%)</td>
                            <td
                              className="px-4 py-2.5 text-right font-black"
                              title="Tổng lỗi hỏng × Tỉ lệ trộn (%)"
                            >
                              Trọng lượng lỗi
                            </td>
                          </tr>
                          {group.mixingLines.length === 0 ? (
                            <tr className="bg-white">
                              <td />
                              <td colSpan={6} className="px-4 py-2.5 text-sm font-semibold text-zinc-400">
                                Chưa có NVL trong báo cáo phối trộn của ngày/ca này.
                              </td>
                            </tr>
                          ) : (
                            group.mixingLines.map(row => {
                              const trongLuongLoiKg =
                                row.tiLeTronPercent !== null &&
                                Number.isFinite(row.tiLeTronPercent) &&
                                Number.isFinite(group.totalWeightKg)
                                  ? Math.round(((group.totalWeightKg * row.tiLeTronPercent) / 100) * 100) / 100
                                  : null;
                              return (
                              <tr
                                key={row.key}
                                className="bg-white font-semibold hover:bg-rose-50/40 border-b border-slate-50"
                              >
                                <td className="px-3 py-2.5" />
                                <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">
                                  {row.materialCode || '—'}
                                </td>
                                <td colSpan={2} className="px-4 py-2.5 text-zinc-700">
                                  {row.materialName || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-600">{row.unit || 'kg'}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-800">
                                  {formatPercent(row.tiLeTronPercent, 2)}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-rose-700">
                                  {trongLuongLoiKg === null ? '—' : formatKg(trongLuongLoiKg, 2)}
                                </td>
                              </tr>
                              );
                            })
                          )}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && damagedGroupsWithMixing.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng hàng lỗi hỏng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-rose-800">{formatKg(damagedTotalKg, 2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
            </div>
          </>
        ) : activeTab === 'kiem_ton_cuoi_ca' ? (
          <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng NVL</th>
                <th className="px-4 py-3.5 text-right font-black">Tồn cuối ca (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải kiểm tồn cuối ca...
                  </td>
                </tr>
              ) : cuoiCaGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có báo cáo kiểm tồn cuối ca gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                cuoiCaGroups.map(group => {
                  const expanded = isGroupExpanded('kiem_ton_cuoi_ca', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-violet-200 bg-violet-50/60 font-bold hover:bg-violet-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('kiem_ton_cuoi_ca', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm transition hover:bg-violet-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-600">{group.lineCount}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-800">
                          {formatKg(group.totalWeightKg, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-violet-100 bg-violet-100/40 text-xs font-black uppercase tracking-wider text-violet-900">
                            <td />
                            <td className="px-4 py-2 font-black">Mã NVL</td>
                            <td colSpan={2} className="px-4 py-2 font-black">
                              Tên NVL
                            </td>
                            <td className="px-4 py-2 font-black">ĐVT</td>
                            <td className="px-4 py-2 text-right font-black">SL</td>
                            <td className="px-4 py-2 text-right font-black">Tổng (kg)</td>
                          </tr>
                          {group.lines.map(row => (
                            <tr key={row.key} className="bg-white font-semibold hover:bg-violet-50/40 border-b border-slate-50">
                              <td className="px-3 py-2" />
                              <td className="px-4 py-2 font-mono font-bold text-zinc-800">{row.itemCode || '—'}</td>
                              <td colSpan={2} className="px-4 py-2 text-zinc-700">
                                {row.itemName || '—'}
                              </td>
                              <td className="px-4 py-2 text-zinc-600">{row.unit || '—'}</td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                                {formatNumber(row.quantity, 3)}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-violet-700">
                                {formatKg(row.weightKg, 2)}
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && cuoiCaGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng tồn cuối ca
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-violet-800">{formatKg(cuoiCaTotalKg, 2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'phieu_nhap_kho' ? (
          <table className="min-w-[1100px] w-full text-left text-sm font-semibold">
            <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="px-3 py-2.5 text-right font-black">Số Lượng Đạt thực tế (Cuộn)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng nhựa đã trộn (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng TP nhập kho (Kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải báo cáo phiếu nhập kho...
                  </td>
                </tr>
              ) : inboundRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu phiếu nhập kho gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                inboundRows.map(row => (
                  <tr key={row.key} className="hover:bg-cyan-50/40">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-800">{row.ngay || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700">{row.shiftLabel || row.shift || '—'}</td>
                    <td className="px-3 py-2 font-mono font-black text-sky-800">{row.orderCode || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700">{row.machine || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-sky-700">
                      {formatNumber(row.acceptedRolls, 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                      {formatKg(row.mixedPlasticKg, 2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                      {formatKg(row.finishedGoodsInboundKg, 2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && inboundRows.length > 0 ? (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-700">
                    {formatNumber(inboundTotals.acceptedRolls, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">
                    {formatKg(inboundTotals.mixedPlasticKg, 2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {formatKg(inboundTotals.finishedGoodsInboundKg, 2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'tong_vat_tu_thuc_dung' ? (
          <table className="min-w-[1700px] w-full whitespace-nowrap text-left text-sm font-semibold">
            <colgroup>
              <col className="w-14" />
              <col className="w-[130px]" />
              <col className="w-[320px]" />
              <col className="w-[150px]" />
              <col className="w-[180px]" />
              <col className="w-[210px]" />
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[260px]" />
            </colgroup>
            <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-2 py-2.5 font-black" />
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng xuất trong ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng vật tư thực xuất dùng (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải vật tư thực dùng &amp; tỉ lệ trộn...
                  </td>
                </tr>
              ) : thucDungGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu thực xuất dùng / tỉ lệ trộn gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                thucDungGroups.map(group => {
                  const expanded = isGroupExpanded('tong_vat_tu_thuc_dung', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-teal-200 bg-teal-100/80 font-bold hover:bg-teal-100">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong_vat_tu_thuc_dung', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-teal-300 bg-white text-teal-800 shadow-sm transition hover:bg-teal-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.xuatCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonDauCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonCuoiCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-teal-800">
                          {formatKg(group.totalWeightKg, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-teal-100 bg-teal-50 text-xs font-black uppercase tracking-wider text-teal-900">
                            <td />
                            <td className="px-3 py-1.5 font-black">Mã NVL</td>
                            <td className="px-3 py-1.5 font-black">Tên NVL</td>
                            <td className="px-3 py-1.5 text-right font-black">Tỉ lệ ĐM (%)</td>
                            <td
                              className="px-3 py-1.5 text-right font-black"
                              title="Ưu tiên phiếu trộn ca liền trước; không có thì lấy cùng ca lệnh (KL NVL ÷ tổng trộn × 100); không có phiếu thì dùng tỉ lệ ĐM máy"
                            >
                              Tỉ lệ TB thực tế (%)
                            </td>
                            <td
                              className="px-3 py-1.5 text-right font-black"
                              title="Từ phiếu xuất kho NVL của ca hiện tại"
                            >
                              Xuất trong ca
                            </td>
                            <td className="px-3 py-1.5 text-right font-black">Tồn đầu</td>
                            <td className="px-3 py-1.5 text-right font-black">Tồn cuối</td>
                            <td className="px-3 py-1.5 text-right font-black" title="Xuất trong ca + Tồn đầu − Tồn cuối">
                              Thực dùng (kg)
                            </td>
                          </tr>
                          {group.lines.length === 0 ? (
                            <tr className="bg-white">
                              <td />
                              <td colSpan={8} className="px-3 py-2 text-sm font-semibold text-zinc-400">
                                Chưa có dòng NVL từ báo cáo trộn.
                              </td>
                            </tr>
                          ) : (
                            group.lines.map(row => (
                              <tr key={row.key} className="bg-white font-semibold hover:bg-teal-50/60">
                                <td className="px-2 py-1.5" />
                                <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                  {row.materialCode || '—'}
                                </td>
                                <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                  <ThucDungMetricButton
                                    label={formatPercent(row.tiLeDinhMucPercent, 2)}
                                    className="font-mono text-zinc-600"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'ti_le_dinh_muc' })}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono font-bold text-orange-800">
                                  <ThucDungMetricButton
                                    label={formatPercent(row.tiLeThucTeTbPercent, 2)}
                                    className="font-mono font-bold text-orange-800"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'ti_le_thuc_te' })}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                  <ThucDungMetricButton
                                    label={formatKg(row.xuatTrongCaKg, 2)}
                                    className="font-mono text-amber-700"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'trong_luong_da_tron' })}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                  <ThucDungMetricButton
                                    label={formatKg(row.tonDauKg, 2)}
                                    className="font-mono text-zinc-600"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'ton_dau' })}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                  <ThucDungMetricButton
                                    label={formatKg(row.tonCuoiKg, 2)}
                                    className="font-mono text-zinc-600"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'ton_cuoi' })}
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono font-bold text-teal-700">
                                  <ThucDungMetricButton
                                    label={formatKg(row.weightKg, 2)}
                                    className="font-mono font-bold text-teal-700"
                                    onOpen={() => setThucDungDetail({ line: row, metric: 'thuc_dung' })}
                                  />
                                </td>
                              </tr>
                            ))
                          )}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && thucDungGroups.length > 0 ? (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">
                    {formatKg(thucDungGroups.reduce((sum, g) => sum + (g.xuatCaTotal || 0), 0), 3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">
                    {formatKg(thucDungGroups.reduce((sum, g) => sum + (g.tonDauCaTotal || 0), 0), 3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">
                    {formatKg(thucDungGroups.reduce((sum, g) => sum + (g.tonCuoiCaTotal || 0), 0), 3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-teal-800">{formatKg(thucDungTotalKg, 2)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'tong_hop_vat_tu_thuc_xuat_dung' ? (
          <table className="min-w-[1500px] w-full whitespace-nowrap text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-emerald-100 to-teal-50 border-b-2 border-emerald-300 text-xs uppercase tracking-wider text-emerald-900">
              <tr>
                <th className="w-10 px-2 py-2.5 font-black" />
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                <th className="px-3 py-2.5 font-black">Máy</th>
                <th className="px-3 py-2.5 text-right font-black">SP / NVL</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Xuất thực tế (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th
                  className="px-3 py-2.5 text-right font-black"
                  title="Thực dùng (kg) = Tồn đầu ca + Xuất thực tế − Tồn cuối ca"
                >
                  Thực dùng (kg)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải tổng hợp vật tư thực xuất dùng...
                  </td>
                </tr>
              ) : tongHopThucXuatGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có NVL từ báo cáo phối trộn gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                tongHopThucXuatGroups.map(group => {
                  const expanded = isGroupExpanded('tong_hop_vat_tu_thuc_xuat_dung', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-emerald-200 bg-emerald-50/80 font-bold hover:bg-emerald-100/70">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong_hop_vat_tu_thuc_xuat_dung', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-zinc-600">
                          {group.productCount}/{group.lineCount}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonDauCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.xuatCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tonCuoiCaTotal, 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                          {formatKg(group.totalThucDungKg, 2)}
                        </td>
                      </tr>
                      {expanded
                        ? (group.productGroups || []).map(productGroup => {
                            const productGroupKey = `${group.groupKey}|product:${productGroup.key}`;
                            const productExpanded = isGroupExpanded(
                              'tong_hop_vat_tu_thuc_xuat_dung',
                              productGroupKey
                            );
                            return (
                              <React.Fragment key={productGroupKey}>
                                <tr className="border-y border-sky-200 bg-sky-50 font-bold text-sky-950 hover:bg-sky-100/80">
                                  <td className="px-2 py-1.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleGroup('tong_hop_vat_tu_thuc_xuat_dung', productGroupKey)
                                      }
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-800 shadow-sm transition hover:bg-sky-50"
                                      title={
                                        productExpanded ? 'Đóng NVL của sản phẩm' : 'Mở NVL của sản phẩm'
                                      }
                                      aria-expanded={productExpanded}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${productExpanded ? '' : '-rotate-90'}`}
                                      />
                                    </button>
                                  </td>
                                  <td colSpan={4} className="px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">
                                        Sản phẩm
                                      </span>
                                      {productGroup.productCode ? (
                                        <span className="font-mono font-black text-sky-900">
                                          {productGroup.productCode}
                                        </span>
                                      ) : null}
                                      <span className="font-black text-zinc-900">
                                        {productGroup.productName || '—'}
                                      </span>
                                      {productGroup.quantity > 0 ? (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-600 ring-1 ring-sky-200">
                                          SL: {formatNumber(productGroup.quantity, 3)}
                                          {productGroup.unit ? ` ${productGroup.unit}` : ''}
                                        </span>
                                      ) : null}
                                      {productGroup.share > 0 && productGroup.share < 1 ? (
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                          Phân bổ {(productGroup.share * 100).toFixed(1)}%
                                        </span>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-zinc-600">
                                    {productGroup.lineCount}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.tonDauTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.xuatTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                                    {formatKg(productGroup.tonCuoiTotal, 2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                                    {formatKg(productGroup.thucDungTotal, 2)}
                                  </td>
                                </tr>
                                {productExpanded ? (
                                  <>
                                    <tr className="border-y border-emerald-100 bg-emerald-50 text-xs font-black uppercase tracking-wider text-emerald-900">
                                      <td />
                                      <td className="px-3 py-1.5 font-black">Mã NVL</td>
                                      <td className="px-3 py-1.5 font-black">Tên NVL (báo cáo phối trộn)</td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Báo cáo dữ liệu tồn đầu ca — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Tồn đầu ca
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Dữ liệu trong phiếu xuất kho vật tư — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Xuất thực tế
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Lấy từ tab Dữ liệu trong báo cáo kiểm tồn cuối ca — phân bổ theo SP nếu nhiều SP"
                                      >
                                        Tồn cuối ca
                                      </td>
                                      <td
                                        className="px-3 py-1.5 text-right font-black"
                                        title="Thực dùng (kg) = Tồn đầu ca + Xuất thực tế − Tồn cuối ca"
                                      >
                                        Thực dùng (kg)
                                      </td>
                                    </tr>
                                    {productGroup.lines.map(row => (
                                      <tr key={row.key} className="bg-white font-semibold hover:bg-emerald-50/60">
                                        <td className="px-2 py-1.5" />
                                        <td className="px-3 py-1.5 font-mono font-bold text-zinc-800">
                                          {row.materialCode || '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-zinc-700">{row.materialName || '—'}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                          <ThucDungMetricButton
                                            label={formatKg(row.tonDauKg, 2)}
                                            className="font-mono text-zinc-600"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'ton_dau' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-amber-700">
                                          <ThucDungMetricButton
                                            label={formatKg(row.xuatTrongCaKg, 2)}
                                            className="font-mono text-amber-700"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'xuat_thuc_te' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono text-zinc-600">
                                          <ThucDungMetricButton
                                            label={formatKg(row.tonCuoiKg, 2)}
                                            className="font-mono text-zinc-600"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'ton_cuoi' })}
                                          />
                                        </td>
                                        <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-700">
                                          <ThucDungMetricButton
                                            label={formatKg(row.thucDungKg, 2)}
                                            className="font-mono font-bold text-emerald-700"
                                            onOpen={() => setTongHopDetail({ line: row, metric: 'thuc_dung' })}
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </>
                                ) : null}
                              </React.Fragment>
                            );
                          })
                        : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && tongHopThucXuatGroups.length > 0 ? (
              <tfoot className="border-t-2 border-emerald-300 bg-emerald-50 text-xs font-black text-emerald-950">
                <tr>
                  <td colSpan={9} className="px-3 py-2.5 text-right uppercase tracking-wider">
                    Tổng thực dùng
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">
                    {formatKg(
                      tongHopThucXuatGroups.reduce((sum, g) => sum + (g.totalThucDungKg || 0), 0),
                      3
                    )}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : activeTab === 'tong_dinh_muc_nvl_nhap_kho' ? (
          <>
            {inboundNormGroups.length > 0 ? (
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(true)}
                    disabled={inboundNormGroups.every(g => isGroupExpanded('tong_dinh_muc_nvl_nhap_kho', g.groupKey))}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-800 shadow-sm transition hover:bg-amber-50 disabled:cursor-default disabled:opacity-40"
                  >
                    Mở tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllActiveGroupsExpanded(false)}
                    disabled={inboundNormGroups.every(g => !isGroupExpanded('tong_dinh_muc_nvl_nhap_kho', g.groupKey))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-40"
                  >
                    Đóng tất cả
                  </button>
                </div>
              </div>
            ) : null}

            <div className="bb-table-scroll">
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Dòng SP</th>
                <th className="px-4 py-3.5 text-right font-black">Tổng định mức (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">SL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải định mức từ phiếu báo cáo sản lượng...
                  </td>
                </tr>
              ) : inboundNormGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có phiếu báo cáo sản lượng theo ngày/ca đã chọn.
                  </td>
                </tr>
              ) : (
                inboundNormGroups.map(group => {
                  const expanded = isGroupExpanded('tong_dinh_muc_nvl_nhap_kho', group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-amber-200 bg-amber-50/60 font-bold hover:bg-amber-100/50 transition">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong_dinh_muc_nvl_nhap_kho', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-800 shadow-sm transition hover:bg-amber-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-zinc-700">{group.ngay || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">
                          {group.shiftLabel || group.shift || '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">{group.machine || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-600">{group.productGroups.length}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-800">
                          {formatKg(group.totalNormWeightKg, 2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-zinc-600">
                          {formatNumber(group.quantity, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          {group.productGroups.map((productGroup, pgIdx) => {
                            const allLines = (productGroup.lines || []).map(row => ({ ...row }));
                            const groupedByCode = new Map<
                              string,
                              {
                                itemCode: string;
                                itemName: string;
                                unit: string;
                                productQuantity: number;
                                productUnit: string;
                                componentNormWeightKg: number | null;
                                balanceDetail: BbInboundMaterialBalanceDetail | null;
                                sourceLines: BbWarehouseExportLineRow[];
                              }
                            >();
                            allLines.forEach(row => {
                              const key = row.itemCode || '—';
                              if (!groupedByCode.has(key)) {
                                groupedByCode.set(key, {
                                  itemCode: row.itemCode,
                                  itemName: row.itemName,
                                  unit: row.unit,
                                  productQuantity: 0,
                                  productUnit: row.materialNorm?.productUnit || productGroup.unit || '',
                                  componentNormWeightKg: row.materialNorm?.componentWeightKg ?? null,
                                  balanceDetail: row.balanceDetail,
                                  sourceLines: []
                                });
                              }
                              const existing = groupedByCode.get(key)!;
                              const lineQty = row.materialNorm?.productQuantity || 0;
                              if (lineQty > existing.productQuantity) existing.productQuantity = lineQty;
                              existing.sourceLines.push(row);
                              if (existing.componentNormWeightKg === null && row.materialNorm?.componentWeightKg != null) {
                                existing.componentNormWeightKg = row.materialNorm.componentWeightKg;
                              }
                              if (!existing.balanceDetail && row.balanceDetail) {
                                existing.balanceDetail = row.balanceDetail;
                              }
                            });
                            const productQty =
                              productGroup.quantity > 0
                                ? productGroup.quantity
                                : [...groupedByCode.values()].reduce(
                                    (max, row) => Math.max(max, row.productQuantity),
                                    0
                                  );
                            const productNvlRows = Array.from(groupedByCode.values()).map(row => {
                              const componentPerUnit =
                                row.componentNormWeightKg !== null && row.componentNormWeightKg > 0
                                  ? row.componentNormWeightKg
                                  : 0;
                              const qty = row.productQuantity > 0 ? row.productQuantity : productQty;
                              const displayComponentKg = roundDisplayKg(
                                componentPerUnit > 0 && qty > 0 ? componentPerUnit * qty : 0,
                                2
                              );
                              return {
                                ...row,
                                componentPerUnit,
                                displayComponentKg
                              };
                            });
                            const sumComponentNormKg = sumBbInboundTheoreticalNormKgForProductGroup(productGroup);
                            return (
                              <React.Fragment key={`${group.groupKey}-pg-${pgIdx}`}>
                                <tr className="border-y border-amber-300 bg-amber-200/60 text-sm font-black text-amber-900">
                                  <td className="px-3 py-2" />
                                  <td colSpan={4} className="px-4 py-2">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700/80">
                                      Thành phẩm
                                    </p>
                                    <p className="mt-0.5">
                                      🏷 {productGroup.productName || productGroup.productCode || '—'}
                                      {productGroup.productCode ? (
                                        <span className="ml-1 font-mono text-xs text-amber-700">
                                          ({productGroup.productCode})
                                        </span>
                                      ) : null}
                                    </p>
                                  </td>
                                  <td className="px-4 py-2 text-right" title="Định mức kg / 1 đơn vị thành phẩm">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700/80">
                                      ĐM SP (kg/1)
                                    </p>
                                    <p className="mt-0.5 font-mono text-amber-900">
                                      {productGroup.normKgPerUnit === null
                                        ? '—'
                                        : formatKg(productGroup.normKgPerUnit, 2)}
                                    </p>
                                  </td>
                                  <td className="px-4 py-2 text-right" title="Số lượng thành phẩm nhập kho">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-700/80">
                                      SL thành phẩm
                                    </p>
                                    <p className="mt-0.5 font-mono text-amber-900">
                                      {formatNumber(productQty, 0)}
                                      {productGroup.unit ? ` ${productGroup.unit}` : ''}
                                    </p>
                                  </td>
                                  <td
                                    className="px-4 py-2 text-right"
                                    title="Tổng trọng lượng định mức NVL = Σ (kg Thành phần/1 SP × SL thành phẩm)"
                                  >
                                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800/80">
                                      Tổng TL định mức NVL
                                    </p>
                                    <p className="mt-0.5 font-mono text-emerald-900">
                                      {formatKg(roundDisplayKg(sumComponentNormKg, 2), 2)}
                                    </p>
                                  </td>
                                </tr>
                                <tr className="border-y border-amber-100 bg-amber-100/40 text-xs font-black uppercase tracking-wider text-amber-900">
                                  <td />
                                  <td className="px-4 py-2.5 font-black">Mã NVL</td>
                                  <td colSpan={2} className="px-4 py-2.5 font-black">
                                    Tên NVL
                                  </td>
                                  <td className="px-4 py-2.5 font-black">ĐVT</td>
                                  <td
                                    className="px-4 py-2.5 text-right font-black"
                                    title="kg NVL trên 1 đơn vị thành phẩm (tab Thành phần)"
                                  >
                                    ĐM NVL
                                  </td>
                                  <td
                                    className="px-4 py-2.5 text-right font-black"
                                    title="Số lượng thành phẩm dùng để nhân định mức"
                                  >
                                    SL thành phẩm
                                  </td>
                                  <td
                                    className="px-4 py-2.5 text-right font-black"
                                    title="= ĐM NVL (kg/1 SP) × SL thành phẩm"
                                  >
                                    TL định mức
                                  </td>
                                </tr>
                                {productNvlRows.length === 0 ? (
                                  <tr className="bg-white">
                                    <td />
                                    <td colSpan={7} className="px-4 py-2.5 text-sm font-semibold text-zinc-400">
                                      Thành phẩm chưa có công thức NVL.
                                    </td>
                                  </tr>
                                ) : null}
                                {productNvlRows.map((row, idx) => {
                              const openNormDetail = () =>
                                setNormDetail({
                                  orderCode: group.orderCode,
                                  ngay: group.ngay,
                                  shiftLabel: group.shiftLabel || group.shift,
                                  machine: `${productGroup.productName || productGroup.productCode || ''} · ${group.machine}`,
                                  itemCode: row.itemCode,
                                  itemName: row.itemName,
                                  unit: row.unit,
                                  metric: 'quantity',
                                  totalKg: row.displayComponentKg,
                                  totalQty: row.productQuantity || productQty,
                                  balanceDetail: row.balanceDetail,
                                  lines: row.sourceLines
                                });
                              return (
                              <tr key={`${group.groupKey}-pg-${pgIdx}-nvl-${idx}`} className="bg-white font-semibold hover:bg-amber-50/40 border-b border-slate-50">
                                <td className="px-3 py-2.5" />
                                <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">
                                  {row.itemCode || '—'}
                                </td>
                                <td colSpan={2} className="px-4 py-2.5 text-zinc-700">
                                  {row.itemName || '—'}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-600">{row.unit || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-700">
                                  {row.componentPerUnit > 0 ? formatKg(roundDisplayKg(row.componentPerUnit, 2), 2) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-zinc-700">
                                  {formatNumber(row.productQuantity || productQty, 2)}
                                  {row.productUnit ? ` ${row.productUnit}` : productGroup.unit ? ` ${productGroup.unit}` : ''}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                                  {row.displayComponentKg > 0 ? (
                                    <ThucDungMetricButton
                                      label={formatKg(row.displayComponentKg, 2)}
                                      className="font-mono font-bold text-emerald-700"
                                      onOpen={openNormDetail}
                                    />
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                              );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && inboundNormGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={6} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng định mức
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-800">
                    {formatKg(inboundNormTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-zinc-700">
                    {formatNumber(inboundNormGroups.reduce((sum, g) => sum + (g.quantity || 0), 0), 2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
            </div>
          </>
        ) : activeTab === 'tong' ? (
          <table className="min-w-[1400px] w-full text-left text-sm font-semibold">
            <thead className="bg-gradient-to-r from-slate-100 to-slate-50 border-b-2 border-slate-300 text-xs uppercase tracking-wider text-slate-700">
              <tr>
                <th className="w-10 px-3 py-3.5 font-black" />
                <th className="px-4 py-3.5 font-black">Ngày</th>
                <th className="px-4 py-3.5 font-black">Ca</th>
                <th className="px-4 py-3.5 font-black">Lệnh SX</th>
                <th className="px-4 py-3.5 font-black">Máy</th>
                <th className="px-4 py-3.5 text-right font-black">Tồn đầu ca (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Xuất trong ca (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Tồn cuối ca (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Thực dùng (kg)</th>
                <th className="px-4 py-3.5 text-right font-black">Nhập kho (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải tổng hợp...
                  </td>
                </tr>
              ) : tongGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu tổng hợp gắn ca/ngày lệnh máy BB.
                  </td>
                </tr>
              ) : (
                tongGroups.map(group => {
                  const expanded = isGroupExpanded('tong', group.groupKey);
                  // Lấy dữ liệu tồn từ các group khác dựa trên groupKey
                  const dauCaGroup = dauCaGroups.find(g => g.groupKey === group.groupKey);
                  const cuoiCaGroup = cuoiCaGroups.find(g => g.groupKey === group.groupKey);
                  const thucDungGroup = thucDungGroups.find(g => g.groupKey === group.groupKey);
                  return (
                    <React.Fragment key={group.groupKey}>
                      <tr className="border-y border-emerald-200 bg-emerald-50/60 font-bold hover:bg-emerald-100/50 transition">
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup('tong', group.groupKey)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-800 shadow-sm transition hover:bg-emerald-50"
                            title={expanded ? 'Đóng các dòng con' : 'Mở các dòng con'}
                            aria-expanded={expanded}
                          >
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-zinc-800">{group.ngay || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-700">{group.shiftLabel || group.shift || '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-black text-sky-900">{group.orderCode || '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-zinc-700">{group.machine || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-700">
                          {formatKg(dauCaGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-700">
                          {formatKg(group.tongTrongLuongXuatRa, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-700">
                          {formatKg(cuoiCaGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-cyan-700">
                          {formatKg(thucDungGroup?.totalWeightKg || 0, 2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                          {formatKg(group.tongTrongLuongNhapKho, 2)}
                        </td>
                      </tr>
                      {expanded ? (
                        <>
                          <tr className="border-y border-emerald-100 bg-emerald-100/40 text-xs font-black uppercase tracking-wider text-emerald-900">
                            <td className="px-3 py-2" />
                            <td colSpan={5} className="px-4 py-2 font-black">
                              Thành phần
                            </td>
                            <td colSpan={4} className="px-4 py-2 text-right font-black">Giá trị (kg)</td>
                          </tr>
                          {group.lines.map(line => (
                            <tr key={line.key} className="bg-white font-semibold hover:bg-emerald-50/40 border-b border-slate-50">
                              <td className="px-3 py-2" />
                              <td colSpan={5} className="px-4 py-2 text-zinc-700">
                                {line.label}
                              </td>
                              <td colSpan={4} className="px-4 py-2 text-right font-mono font-bold text-zinc-800">
                                {formatKg(line.valueKg, 2)}
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {!isLoading && tongGroups.length > 0 ? (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900">
                <tr>
                  <td colSpan={5} className="px-4 py-3.5 text-right uppercase tracking-wider">
                    Tổng cộng
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-indigo-700">
                    {formatKg(dauCaTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-amber-700">
                    {formatKg(exportTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-violet-700">
                    {formatKg(cuoiCaTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-cyan-700">
                    {formatKg(thucDungTotalKg, 2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-emerald-700">
                    {formatKg(tongNhapKhoTotalKg, 2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : (
          <div className="bb-table-scroll">
            <table className="min-w-[2200px] w-full text-left text-sm font-semibold">
              <thead className="bg-slate-200 text-xs uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="px-3 py-2.5 font-black">Ngày</th>
                  <th className="px-3 py-2.5 font-black">Ca</th>
                  <th className="px-3 py-2.5 font-black">Số lệnh SX</th>
                  <th className="px-3 py-2.5 font-black">Máy</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng nhựa thực xuất / Tổng ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">Giá trị hao hụt nhựa</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng màng thực xuất / Tổng màng ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">Giá trị hao hụt màng</th>
                  <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng định mức</th>
                  <th className="px-3 py-2.5 text-right font-black">Lệch lỗi hỏng so với ĐM</th>
                  <th className="px-3 py-2.5 text-right font-black">SL nhựa lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">GT nhựa lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">SL màng lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">GT màng lỗi hỏng</th>
                  <th className="px-3 py-2.5 text-right font-black">SL lõi lỗi hỏng/hao hụt</th>
                  <th className="px-3 py-2.5 text-right font-black">GT lõi lỗi hỏng/hao hụt</th>
                  <th className="px-3 py-2.5 text-right font-black">Tổng GT hao hụt + lỗi hỏng</th>
                  <th className="px-3 py-2.5 font-black">Phân tích đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={19} className="px-3 py-10 text-center font-bold text-zinc-400">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Đang tải đánh giá hiệu quả...
                    </td>
                  </tr>
                ) : danhGiaGroups.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="px-3 py-10 text-center font-bold text-zinc-400">
                      Chưa có dữ liệu đánh giá hao hụt/lỗi hỏng gắn lệnh máy BB.
                    </td>
                  </tr>
                ) : (
                  danhGiaGroups.map(group => (
                    <tr key={group.groupKey} className="hover:bg-rose-50/30">
                      <td className="px-3 py-2 font-mono font-bold text-zinc-800">{group.ngay || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">
                        {group.shiftLabel || group.shift || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-black text-sky-800">{group.orderCode || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-zinc-700">{group.machine || '—'}</td>
                      <td
                        className="px-3 py-2 text-right font-mono font-bold text-amber-800"
                        title={`${formatKg(group.tongNhuaThucXuat, 2)} / ${formatKg(group.tongNhuaDinhMuc, 2)} kg`}
                      >
                        {formatPercent(group.tiLeNhuaThucXuatVsDinhMuc, 2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-bold ${
                          group.giaTriHaoHutNhua < 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                        title={`${formatKg(group.giaTriHaoHutNhuaKg, 2)} kg`}
                      >
                        {formatVnd(group.giaTriHaoHutNhua)}
                      </td>
                      <td
                        className="px-3 py-2 text-right font-mono font-bold text-fuchsia-800"
                        title={`${formatKg(group.tongMangThucXuat, 2)} / ${formatKg(group.tongMangDinhMuc, 2)} kg`}
                      >
                        {formatPercent(group.tiLeMangThucXuatVsDinhMuc, 2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-bold ${
                          group.giaTriHaoHutMang < 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                        title={`${formatKg(group.giaTriHaoHutMangKg, 2)} kg`}
                      >
                        {formatVnd(group.giaTriHaoHutMang)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">
                        {formatPercent(group.tiLeLoiHong, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-zinc-700">
                        {formatPercent(group.tiLeLoiHongDinhMuc, 2)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-bold ${
                          group.lechLoiHongVsDinhMuc > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatPercent(group.lechLoiHongVsDinhMuc, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-amber-800">
                        {formatKg(group.soLuongNhuaLoiHong, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                        {formatVnd(group.giaTriNhuaLoiHong)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fuchsia-800">
                        {formatKg(group.soLuongMangLoiHong, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-fuchsia-800">
                        {formatVnd(group.giaTriMangLoiHong)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-stone-700">
                        {formatKg(group.soLuongLoiLoiHong, 2)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-stone-800">
                        {formatVnd(group.giaTriLoiLoiHong)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-black text-rose-800">
                        {formatVnd(group.tongGiaTriHaoHutLoiHong)}
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <textarea
                          value={phanTichMap[group.groupKey] || ''}
                          onChange={event => updatePhanTich(group.groupKey, event.target.value)}
                          rows={2}
                          placeholder="Gõ tay phân tích đánh giá..."
                          className="w-full min-w-[160px] resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {!isLoading && danhGiaGroups.length > 0 ? (
                <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                  <tr>
                    <td colSpan={17} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Tổng giá trị hao hụt + lỗi hỏng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-800">
                      {formatVnd(tongGiaTriHaoHutLoiHong)}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </div>

    </section>
    {selectedExportSummary ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết nguồn số liệu phiếu xuất kho"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedExportSummary(null);
        }}
      >
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-100">
                Nguồn số liệu và công thức
              </p>
              <h4 className="mt-1 text-base font-black">{selectedExportSummary.title}</h4>
              <p className="mt-1 text-xs font-semibold text-sky-100">{selectedExportSummary.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExportSummary(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="overflow-auto p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Định mức (kg)</p>
                <p className="mt-1 font-mono text-lg font-black text-emerald-800">
                  {formatKg(
                    selectedExportSummary.lines.reduce(
                      (sum, line) => sum + Math.max(0, line.materialNorm?.allocatedNormKg || 0),
                      0
                    ),
                    2
                  )}
                </p>
                <p className="text-xs font-bold text-emerald-600">Từ công thức Thành phần SP</p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">Trọng lượng định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(sumTrongLuongDinhMucKg(selectedExportSummary.lines), 2)}
                </p>
                <p className="text-xs font-bold text-lime-600">SL SP × kg NVL/SP × tỉ lệ phân bổ</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số dòng NVL</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedExportSummary.lines.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-slate-100 font-black uppercase tracking-wider text-slate-700">
                  <tr>
                    <th className="px-3 py-2.5">Sản phẩm / NVL</th>
                    <th className="px-3 py-2.5 text-right">SL SP</th>
                    <th className="px-3 py-2.5 text-right">kg NVL/SP</th>
                    <th className="px-3 py-2.5 text-right">Tỉ lệ phân bổ</th>
                    <th className="px-3 py-2.5 text-right">TL định mức</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedExportSummary.lines.map(line => (
                    <tr key={line.key} className="bg-white hover:bg-sky-50/50">
                      <td className="px-3 py-2.5">
                        <p className="font-black text-slate-900">
                          {line.materialNorm?.productCode || '—'} · {line.materialNorm?.productName || '—'}
                        </p>
                        <p className="mt-0.5 font-mono font-bold text-slate-600">
                          {line.itemCode || '—'} · {line.itemName || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatNumber(line.materialNorm?.productQuantity ?? null, 3)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatKg(line.materialNorm?.componentWeightKg ?? null, 4)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        {formatPercent(
                          line.materialNorm?.allocationRatio === undefined
                            ? null
                            : line.materialNorm.allocationRatio * 100,
                          2
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-lime-700">
                        {formatKg(computeTrongLuongDinhMucKg(line), 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              Trọng lượng định mức từng dòng = Số lượng sản phẩm × Khối lượng NVL trong Thành phần × Tỉ lệ phân bổ.
              Các ô tổng phía trên là phép cộng của các dòng nguồn bên dưới.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedMaterialTotalDetail ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Định mức NVL theo sản phẩm"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedMaterialTotalDetail(null);
        }}
      >
        <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-900 to-emerald-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">
                Định mức theo sản phẩm
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedMaterialTotalDetail.itemCode || '—'} · {selectedMaterialTotalDetail.itemName || '—'}
              </h4>
              <p className="mt-1 text-xs font-semibold text-emerald-100">
                Xuất kho {formatKg(selectedMaterialTotalDetail.exportWeightKg, 2)} kg ·{' '}
                {selectedMaterialTotalDetail.lineCount} dòng phiếu · ĐVT{' '}
                {selectedMaterialTotalDetail.unit || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMaterialTotalDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="overflow-auto p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Tổng xuất (kg)</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-800">
                  {formatKg(selectedMaterialTotalDetail.exportWeightKg, 2)}
                </p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">
                  Tổng TL định mức
                </p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(
                    selectedMaterialTotalDetail.products.reduce((sum, row) => sum + row.normWeightKg, 0),
                    2
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-teal-700">Số sản phẩm</p>
                <p className="mt-1 font-mono text-lg font-black text-teal-800">
                  {selectedMaterialTotalDetail.products.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[980px] w-full text-left text-xs">
                <thead className="bg-emerald-50 font-black uppercase tracking-wider text-emerald-900">
                  <tr>
                    <th className="px-3 py-2.5">Lệnh SX</th>
                    <th className="px-3 py-2.5">Sản phẩm</th>
                    <th className="px-3 py-2.5 text-right">SL SP</th>
                    <th className="px-3 py-2.5 text-right">kg NVL/SP</th>
                    <th className="px-3 py-2.5 text-right">TL định mức</th>
                    <th className="px-3 py-2.5 text-right">Tỉ lệ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedMaterialTotalDetail.products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center font-bold text-zinc-400">
                        Chưa gắn được định mức sản phẩm cho mã NVL này.
                      </td>
                    </tr>
                  ) : (
                    selectedMaterialTotalDetail.products.map(row => (
                      <tr key={row.key} className="bg-white hover:bg-emerald-50/50">
                        <td className="px-3 py-2.5">
                          <p className="font-mono font-black text-sky-900">{row.orderCode || '—'}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {row.ngay || '—'} · {row.shiftLabel || '—'} · {row.machine || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-black text-slate-900">
                            {row.productCode || '—'} · {row.productName || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {row.productQuantity > 0 ? formatNumber(row.productQuantity, 3) : '—'}
                          {row.productUnit ? (
                            <span className="ml-1 font-semibold text-slate-500">{row.productUnit}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {formatKg(row.componentWeightKg, 4)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-lime-700">
                          {row.normWeightKg > 0 ? formatKg(row.normWeightKg, 2) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-teal-700">
                          {formatPercent(row.percent, 2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {selectedMaterialTotalDetail.products.length > 0 ? (
                  <tfoot className="border-t-2 border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-950">
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-right uppercase tracking-wider">
                        Tổng
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-lime-700">
                        {formatKg(
                          selectedMaterialTotalDetail.products.reduce((sum, row) => sum + row.normWeightKg, 0),
                          2
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-teal-700">
                        {formatPercent(
                          selectedMaterialTotalDetail.products.reduce((sum, row) => sum + (row.percent || 0), 0),
                          2
                        )}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-500">
              Tỉ lệ % = Trọng lượng định mức của SP đó ÷ tổng Trọng lượng định mức mã NVL trong cùng lệnh SX.
              TL định mức = SL SP × kg NVL/SP (Thành phần) × tỉ lệ phân bổ dòng phiếu.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedMaterialNorm ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức khối lượng định mức"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedMaterialNorm(null);
        }}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-emerald-800 to-emerald-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Công thức định mức NVL</p>
              <h4 className="mt-1 text-base font-black">
                {selectedMaterialNorm.materialCode} · {selectedMaterialNorm.materialName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-emerald-50">
                Sản phẩm: {selectedMaterialNorm.productCode} · {selectedMaterialNorm.productName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMaterialNorm(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL lệnh SX</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedMaterialNorm.productQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedMaterialNorm.productUnit}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'TL định mức/SP' : 'Định mức NVL/SP'}
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? formatKg(selectedMaterialNorm.productNormKgPerUnit, 2)
                    : formatNumber(selectedMaterialNorm.rate, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? `kg/${selectedMaterialNorm.productUnit}`
                    : `${selectedMaterialNorm.rateUnit}/${selectedMaterialNorm.productUnit}`}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'Tỷ lệ NVL' : 'SL NVL tính được'}
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedMaterialNorm.amountType === 'percent'
                    ? `${formatNumber(selectedMaterialNorm.rate, 3)}%`
                    : formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedMaterialNorm.amountType === 'percent' ? 'Thành phần sản phẩm' : selectedMaterialNorm.rawExpectedUnit}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">KL định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-emerald-800">
                  {formatKg(selectedMaterialNorm.allocatedNormKg, 2)}
                </p>
                <p className="text-xs font-bold text-emerald-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Phép tính cụ thể</p>
              {selectedMaterialNorm.amountType === 'percent' ? (
                <p className="mt-2 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                  {formatNumber(selectedMaterialNorm.productQuantity, 3)} {selectedMaterialNorm.productUnit}
                  {' × '}{formatKg(selectedMaterialNorm.productNormKgPerUnit, 2)} kg/{selectedMaterialNorm.productUnit}
                  {' × '}{formatNumber(selectedMaterialNorm.rate, 3)}%
                  {' = '}{formatKg(selectedMaterialNorm.totalNormKg, 2)} kg
                </p>
              ) : (
                <div className="mt-2 space-y-1 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                  <p>
                    {formatNumber(selectedMaterialNorm.productQuantity, 3)} {selectedMaterialNorm.productUnit}
                    {' × '}{formatNumber(selectedMaterialNorm.rate, 3)} {selectedMaterialNorm.rateUnit}/{selectedMaterialNorm.productUnit}
                    {' = '}{formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)} {selectedMaterialNorm.rawExpectedUnit}
                  </p>
                  {selectedMaterialNorm.rawExpectedUnit.toLowerCase() !== 'kg' ? (
                    selectedMaterialNorm.catalogKgPerUnit !== null && selectedMaterialNorm.catalogKgPerUnit > 0 ? (
                      <p>
                        Quy đổi theo cột Tổng kg kho NVL ({formatNumber(selectedMaterialNorm.catalogKgPerUnit, 6)} kg/
                        {selectedMaterialNorm.rawExpectedUnit}):{' '}
                        {formatNumber(selectedMaterialNorm.rawExpectedQuantity, 3)} {selectedMaterialNorm.rawExpectedUnit}
                        {' × '}{formatNumber(selectedMaterialNorm.catalogKgPerUnit, 6)}
                        {' = '}{formatKg(selectedMaterialNorm.totalNormKg, 2)} kg
                      </p>
                    ) : (
                      <p className="text-rose-700">
                        Chưa có cột Tổng kg trong kho NVL cho mã {selectedMaterialNorm.materialCode || '—'} — không quy đổi được sang kg.
                      </p>
                    )
                  ) : null}
                </div>
              )}
              {selectedMaterialNorm.allocationRatio < 0.999999 ? (
                <p className="mt-2 border-t border-emerald-200 pt-2 text-xs font-bold text-emerald-800">
                  Phân bổ theo tỉ lệ SL sản phẩm trên phiếu xuất: dòng này nhận{' '}
                  {formatNumber(selectedMaterialNorm.allocationRatio * 100, 2)}% tổng NVL xuất
                  {' '}→ KL định mức phân bổ = {formatKg(selectedMaterialNorm.totalNormKg, 2)} ×{' '}
                  {formatNumber(selectedMaterialNorm.allocationRatio * 100, 2)}% ={' '}
                  {formatKg(selectedMaterialNorm.allocatedNormKg, 2)} kg.
                </p>
              ) : null}
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              ĐVT kg: SL thực xuất = % × SL phiếu. ĐVT ≠ kg: SL thực xuất = SL định mức (để nguyên).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedTrongLuongDinhMuc ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức trọng lượng định mức"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedTrongLuongDinhMuc(null);
        }}
      >
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-lime-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-lime-800 to-lime-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-lime-100">
                Công thức Trọng lượng định mức
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedTrongLuongDinhMuc.itemCode} · {selectedTrongLuongDinhMuc.itemName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-lime-50">
                Sản phẩm: {selectedTrongLuongDinhMuc.materialNorm?.productCode} ·{' '}
                {selectedTrongLuongDinhMuc.materialNorm?.productName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTrongLuongDinhMuc(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số lượng của SP</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? null, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedTrongLuongDinhMuc.materialNorm?.productUnit || ''}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Khối lượng (kg) trong Thành phần
                </p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatKg(selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? null, 4)}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  kg/{selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                </p>
              </div>
              <div className="rounded-xl border border-lime-200 bg-lime-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-lime-700">Trọng lượng định mức</p>
                <p className="mt-1 font-mono text-lg font-black text-lime-800">
                  {formatKg(computeTrongLuongDinhMucKg(selectedTrongLuongDinhMuc), 2)}
                </p>
                <p className="text-xs font-bold text-lime-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-lime-200 bg-lime-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-lime-700">Phép tính cụ thể</p>
              <p className="mt-2 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                {formatNumber(selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? null, 3)}{' '}
                {selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                {' × '}
                {formatKg(selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? null, 4)} kg/
                {selectedTrongLuongDinhMuc.materialNorm?.productUnit || 'SP'}
                {' = '}
                {formatKg(
                  (selectedTrongLuongDinhMuc.materialNorm?.productQuantity ?? 0) *
                    (selectedTrongLuongDinhMuc.materialNorm?.componentWeightKg ?? 0),
                  2
                )}{' '}
                kg
              </p>
              {selectedTrongLuongDinhMuc.materialNorm && selectedTrongLuongDinhMuc.materialNorm.allocationRatio < 0.999999 ? (
                <p className="mt-2 border-t border-lime-200 pt-2 text-xs font-bold text-lime-800">
                  Mã NVL này bị tách thành nhiều dòng trên phiếu xuất: dòng này nhận{' '}
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm.allocationRatio * 100, 2)}% →{' '}
                  {formatKg(
                    (selectedTrongLuongDinhMuc.materialNorm.productQuantity ?? 0) *
                      (selectedTrongLuongDinhMuc.materialNorm.componentWeightKg ?? 0),
                    2
                  )}{' '}
                  ×{' '}
                  {formatNumber(selectedTrongLuongDinhMuc.materialNorm.allocationRatio * 100, 2)}% ={' '}
                  {formatKg(computeTrongLuongDinhMucKg(selectedTrongLuongDinhMuc), 2)} kg.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {selectedTonDauFormula ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức tồn đầu ca"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedTonDauFormula(null);
        }}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-indigo-800 to-indigo-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-100">Công thức tồn đầu (kg)</p>
              <h4 className="mt-1 text-base font-black">
                {selectedTonDauFormula.itemCode || '—'} · {selectedTonDauFormula.itemName || '—'}
              </h4>
              <p className="mt-1 text-xs font-semibold text-indigo-50">
                {selectedTonDauFormula.orderCode || '—'} · {selectedTonDauFormula.ngay || '—'} ·{' '}
                {selectedTonDauFormula.shiftLabel || '—'} · {selectedTonDauFormula.machine || '—'}
              </p>
              {selectedTonDauFormula.productCode || selectedTonDauFormula.productName ? (
                <p className="mt-1 text-xs font-semibold text-indigo-100">
                  Sản phẩm: {selectedTonDauFormula.productCode || '—'} · {selectedTonDauFormula.productName || '—'}
                </p>
              ) : null}
              <p className="mt-2 font-mono text-lg font-black text-white">
                {formatKg(selectedTonDauFormula.tonDauWeightKg, 2)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTonDauFormula(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-950">
              {selectedTonDauFormula.fromNnsTron &&
              selectedTonDauFormula.tiLeThucTeTbPercent !== null ? (
                <>
                  Tồn đầu = NNS-TRON ({formatKg(selectedTonDauFormula.nnsTronTonDauKg, 2)})
                  {' × '}Tỉ lệ thực tế ({formatNumber(selectedTonDauFormula.tiLeThucTeTbPercent, 2)}%)
                  {' = '}
                  {formatKg(selectedTonDauFormula.tonDauWeightKg, 2)}
                </>
              ) : (
                <>
                  Tồn đầu = Tồn ghi nhận theo mã NVL trên báo cáo tồn đầu ca ={' '}
                  {formatKg(selectedTonDauFormula.tonDauWeightKg, 2)}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">NNS-TRON</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatKg(selectedTonDauFormula.nnsTronTonDauKg, 2)}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tỉ lệ thực tế</p>
                <p className="mt-1 font-mono text-lg font-black text-orange-800">
                  {selectedTonDauFormula.tiLeThucTeTbPercent === null
                    ? '—'
                    : `${formatNumber(selectedTonDauFormula.tiLeThucTeTbPercent, 2)}%`}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tồn theo mã NVL</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatKg(selectedTonDauFormula.directTonDauKg, 2)}
                </p>
              </div>
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              Khi có NNS-TRON: phân bổ về từng NVL bằng Tỉ lệ thực tế (phiếu trộn ca liền trước; không có thì dùng
              tỉ lệ ĐM). Khi không có NNS-TRON: lấy nguyên tồn ghi nhận theo mã NVL (dùng chung cho mọi sản phẩm
              cùng mã NVL đó trong lệnh).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {selectedExportWeight ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết công thức SL/KL thực xuất"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setSelectedExportWeight(null);
        }}
      >
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-800 to-amber-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                Công thức SL / KL thực xuất
              </p>
              <h4 className="mt-1 text-base font-black">
                {selectedExportWeight.itemCode} · {selectedExportWeight.itemName}
              </h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">
                ĐVT phiếu: {selectedExportWeight.unit || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExportWeight(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL phiếu xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedExportWeight.sourceQuantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedExportWeight.unit || '—'}</p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL định mức (Thành phần)</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {selectedExportWeight.demandQuantity !== null
                    ? formatNumber(selectedExportWeight.demandQuantity, 3)
                    : '—'}
                </p>
                <p className="text-xs font-bold text-zinc-500">
                  {selectedExportWeight.bomAmountType === 'percent'
                    ? 'Nhu cầu (kg ĐM)'
                    : selectedExportWeight.bomAmountType === 'quantity'
                      ? selectedExportWeight.bomRateUnit || selectedExportWeight.unit || 'NVL'
                      : 'Đối chiếu định mức'}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">SL thực xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-zinc-900">
                  {formatNumber(selectedExportWeight.quantity, 3)}
                </p>
                <p className="text-xs font-bold text-zinc-500">{selectedExportWeight.unit || '—'}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Trọng lượng thực xuất</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-800">
                  {formatKg(selectedExportWeight.weightKg, 2)}
                </p>
                <p className="text-xs font-bold text-amber-600">kg</p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">Phép tính cụ thể</p>
              <div className="mt-2 space-y-1 font-mono text-sm font-black leading-7 text-zinc-900 sm:text-base">
                {selectedExportWeight.productQuantity !== null &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.bomAmountType === 'quantity' ? (
                  <p>
                    Nhu cầu SP = {formatNumber(selectedExportWeight.productQuantity, 3)}{' '}
                    {selectedExportWeight.productUnit || 'SP'}
                    {' × '}
                    {formatNumber(selectedExportWeight.bomRate, 3)} {selectedExportWeight.bomRateUnit || ''}
                    {' (Số lượng Thành phần) = '}
                    {formatNumber(selectedExportWeight.demandQuantity, 3)}{' '}
                    {selectedExportWeight.bomRateUnit || selectedExportWeight.unit || ''}
                  </p>
                ) : selectedExportWeight.productQuantity !== null &&
                  selectedExportWeight.bomRate !== null &&
                  selectedExportWeight.bomAmountType === 'percent' ? (
                  <p>
                    Nhu cầu SP = KL ĐM từ Thành phần {formatNumber(selectedExportWeight.bomRate, 3)}%
                    {' (SL SP '}
                    {formatNumber(selectedExportWeight.productQuantity, 3)}{' '}
                    {selectedExportWeight.productUnit || 'SP'}
                    {') = '}
                    {formatNumber(selectedExportWeight.demandQuantity, 3)} kg
                  </p>
                ) : null}
                {selectedExportWeight.convertMode === 'kg_as_is' ? (
                  <p>
                    ĐVT kg → KL phiếu = SL phiếu = {formatNumber(selectedExportWeight.sourceQuantity, 3)}{' '}
                    {selectedExportWeight.unit || 'kg'} ={' '}
                    {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'ton_to_kg' ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 't'}
                    {' × '}1000 = {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'gram_to_kg' ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 'g'}
                    {' ÷ '}1000 = {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.convertMode === 'multiply_tong_kg' &&
                  selectedExportWeight.catalogKgPerUnit !== null ? (
                  <p>
                    {formatNumber(selectedExportWeight.sourceQuantity, 3)} {selectedExportWeight.unit || 'đvt'}
                    {' × '}
                    {formatNumber(selectedExportWeight.catalogKgPerUnit, 6)} kg/{selectedExportWeight.unit || 'đvt'}
                    {' (cột Tổng kg kho NVL) = '}
                    {formatKg(selectedExportWeight.sourceWeightKg, 2)} kg
                  </p>
                ) : selectedExportWeight.weightKg === null ? null : (
                  <p className="text-rose-700">
                    Chưa quy đổi được KL phiếu xuất cho mã {selectedExportWeight.itemCode || '—'}.
                  </p>
                )}
              </div>
              {(!isWarehouseKgUnit(selectedExportWeight.unit) &&
                selectedExportWeight.bomAmountType === 'quantity' &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.productQuantity !== null) ||
              selectedExportWeight.allocationRatio < 0.999999 ||
              Math.abs(selectedExportWeight.quantity - selectedExportWeight.sourceQuantity) > 1e-9 ||
              (selectedExportWeight.sourceWeightKg !== null &&
                selectedExportWeight.weightKg !== null &&
                Math.abs(selectedExportWeight.weightKg - selectedExportWeight.sourceWeightKg) > 1e-9) ? (
                !isWarehouseKgUnit(selectedExportWeight.unit) &&
                selectedExportWeight.bomAmountType === 'quantity' &&
                selectedExportWeight.bomRate !== null &&
                selectedExportWeight.productQuantity !== null ? (
                  <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                    ĐVT ≠ kg → SL thực xuất = SL định mức (SL đặt × Định mức Thành phần) ={' '}
                    {formatNumber(selectedExportWeight.productQuantity, 3)}
                    {' × '}
                    {formatNumber(selectedExportWeight.bomRate, 3)}
                    {' = '}
                    {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    {selectedExportWeight.weightKg !== null ? (
                      <>
                        {'; KL = '}
                        {formatKg(selectedExportWeight.weightKg, 2)} kg
                      </>
                    ) : null}
                    . Không chia % phiếu xuất.
                  </p>
                ) : (
                  <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                    {selectedExportWeight.allocWeightTotal !== null &&
                    selectedExportWeight.allocWeightBase !== null ? (
                      <>
                        ĐVT kg → % phân bổ = KL định mức SP (
                        {formatKg(selectedExportWeight.allocWeightBase, 2)} kg){' ÷ tổng KL định mức các SP cùng NVL ('}
                        {formatKg(selectedExportWeight.allocWeightTotal, 2)} kg) ={' '}
                        {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}%
                      </>
                    ) : (
                      <>
                        ĐVT kg → % phân bổ = SL SP
                        {selectedExportWeight.productQuantity !== null
                          ? ` (${formatNumber(selectedExportWeight.productQuantity, 3)} ${selectedExportWeight.productUnit || ''})`
                          : ''}
                        {' ÷ tổng SL các SP cùng NVL = '}
                        {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}%
                      </>
                    )}
                    {' → '}SL thực xuất = {formatNumber(selectedExportWeight.sourceQuantity, 3)} ×{' '}
                    {formatNumber(selectedExportWeight.allocationRatio * 100, 2)}% ={' '}
                    {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    {selectedExportWeight.weightKg !== null ? (
                      <>
                        {'; KL thực xuất = '}
                        {formatKg(selectedExportWeight.weightKg, 2)} kg
                      </>
                    ) : null}
                    {' '}(phần cuối nhận dư làm tròn).
                  </p>
                )
              ) : (
                <p className="mt-2 border-t border-amber-200 pt-2 text-xs font-bold text-amber-900">
                  {isWarehouseKgUnit(selectedExportWeight.unit) ? (
                    <>
                      Một SP (hoặc không chia) → SL thực xuất = SL phiếu ={' '}
                      {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                    </>
                  ) : (
                    <>
                      ĐVT ≠ kg → SL thực xuất = SL định mức ={' '}
                      {formatNumber(selectedExportWeight.quantity, 3)} {selectedExportWeight.unit || ''}
                      . Không chia % phiếu xuất.
                    </>
                  )}
                  {selectedExportWeight.weightKg !== null ? (
                    <>
                      {'; KL thực xuất = '}
                      {formatKg(selectedExportWeight.weightKg, 2)} kg
                    </>
                  ) : null}
                  .
                </p>
              )}
            </div>

            <p className="text-xs font-semibold text-zinc-500">
              ĐVT kg: SL thực xuất = % (KL định mức SP ÷ tổng KL định mức) × SL phiếu. ĐVT ≠ kg: SL thực xuất = SL định mức (để nguyên, không chia %).
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {thucDungDetailView ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết dữ liệu thực xuất dùng"
        onMouseDown={event => {
          if (event.target === event.currentTarget) closeMetricDetail();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-teal-800 to-teal-600 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-100">
                {thucDungDetailView.valueLabel}
              </p>
              <h4 className="mt-1 text-base font-black">{thucDungDetailView.title}</h4>
              <p className="mt-1 text-xs font-semibold text-teal-50">{thucDungDetailView.subtitle}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{thucDungDetailView.valueText}</p>
            </div>
            <button
              type="button"
              onClick={closeMetricDetail}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            {thucDungDetailView.formula ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
                {thucDungDetailView.formula}
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    {thucDungDetailView.columns.map(column => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-black ${column.align === 'right' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {thucDungDetailView.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={thucDungDetailView.columns.length}
                        className="px-3 py-8 text-center font-bold text-zinc-400"
                      >
                        Không tìm thấy dòng nguồn tương ứng.
                      </td>
                    </tr>
                  ) : (
                    thucDungDetailView.rows.map((row, index) => (
                      <tr key={`${String(row.reportId || row.lan || row.ngay || 'row')}-${index}`} className="hover:bg-teal-50/50">
                        {thucDungDetailView.columns.map(column => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 font-semibold text-zinc-800 ${
                              column.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {formatThucDungDetailCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Nguồn: tab Tồn đầu ca / Phiếu xuất kho / Kiểm tồn cuối ca (cùng số liệu các tab đó). Thực dùng =
              Tồn đầu ca + Xuất thực tế − Tồn cuối ca.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {normDetail ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Công thức định mức NVL"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setNormDetail(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-700 to-amber-500 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                {normDetail.metric === 'weight' ? 'Trọng lượng (kg)' : 'SL thực nhập'}
              </p>
              <h4 className="mt-1 text-base font-black">
                {normDetail.itemCode || '—'} · {normDetail.itemName || '—'}
              </h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">
                {normDetail.orderCode || '—'} · {normDetail.ngay || '—'} · {normDetail.shiftLabel || '—'} · {normDetail.machine || '—'}
              </p>
              <p className="mt-2 font-mono text-lg font-black text-white">
                {normDetail.metric === 'weight'
                  ? `${formatKg(normDetail.totalKg, 2)} kg`
                  : `${formatNumber(normDetail.totalQty, 2)} ${normDetail.unit || ''}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNormDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            <div className="bb-table-scroll rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    <th className="px-3 py-2.5 font-black">Thành phẩm</th>
                    <th className="px-3 py-2.5 text-right font-black">SL SP</th>
                    <th className="px-3 py-2.5 font-black">Định mức</th>
                    <th className="px-3 py-2.5 font-black">Công thức</th>
                    <th className="px-3 py-2.5 text-right font-black">
                      {normDetail.metric === 'weight' ? 'KL (kg)' : 'SL'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {normDetail.lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center font-bold text-zinc-400">
                        Không có dòng nguồn (thành phẩm chưa có công thức NVL).
                      </td>
                    </tr>
                  ) : (
                    normDetail.lines.map((line, index) => {
                      const mn = line.materialNorm;
                      const typeLabel = mn
                        ? mn.amountType === 'percent'
                          ? `${formatNumber(mn.rate, 2)}%`
                          : `${formatNumber(mn.rate, 3)} ${mn.rateUnit}`
                        : '—';
                      return (
                        <tr key={`${line.key}-${index}`} className="hover:bg-amber-50/40">
                          <td className="px-3 py-2 font-semibold text-zinc-800">
                            {mn?.productName || '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-zinc-700">
                            {mn && mn.productQuantity > 0
                              ? `${formatNumber(mn.productQuantity, 0)} ${mn.productUnit || ''}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 font-semibold text-zinc-700">{typeLabel}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-zinc-700">
                            {mn?.componentWeightKg === null || mn?.componentWeightKg === undefined
                              ? '—'
                              : formatKg(mn.componentWeightKg, 2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-700">
                            {normDetail.metric === 'weight'
                              ? formatKg(line.normWeightKg, 2)
                              : mn?.amountType === 'quantity'
                                ? formatNumber(line.quantity, 2)
                                : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-right uppercase tracking-wider">
                      Tổng
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-800">
                      {normDetail.metric === 'weight'
                        ? formatKg(normDetail.totalKg, 2)
                        : formatNumber(normDetail.totalQty, 2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {inboundBalanceDetailView ? (
      <div
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết logic hiển thị cân bằng vật tư thực tế"
        onMouseDown={event => {
          if (event.target === event.currentTarget) setInboundBalanceDetail(null);
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-amber-700 to-amber-500 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                {inboundBalanceDetailView.valueLabel}
              </p>
              <h4 className="mt-1 text-base font-black">{inboundBalanceDetailView.title}</h4>
              <p className="mt-1 text-xs font-semibold text-amber-50">{inboundBalanceDetailView.subtitle}</p>
              <p className="mt-2 font-mono text-lg font-black text-white">{inboundBalanceDetailView.valueText}</p>
            </div>
            <button
              type="button"
              onClick={() => setInboundBalanceDetail(null)}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="space-y-3 overflow-auto p-5">
            {inboundBalanceDetailView.formula ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                {inboundBalanceDetailView.formula}
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600">
                  <tr>
                    {inboundBalanceDetailView.columns.map(column => (
                      <th
                        key={column.key}
                        className={`px-3 py-2.5 font-black ${column.align === 'right' ? 'text-right' : ''}`}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inboundBalanceDetailView.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={inboundBalanceDetailView.columns.length}
                        className="px-3 py-8 text-center font-bold text-zinc-400"
                      >
                        Không tìm thấy dòng nguồn tương ứng.
                      </td>
                    </tr>
                  ) : (
                    inboundBalanceDetailView.rows.map((row, index) => (
                      <tr
                        key={`${String(row.reportId || row.soPhieu || row.documentNo || row.ngay || 'row')}-${index}`}
                        className="hover:bg-amber-50/50"
                      >
                        {inboundBalanceDetailView.columns.map(column => (
                          <td
                            key={column.key}
                            className={`px-3 py-2 font-semibold text-zinc-800 ${
                              column.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {formatThucDungDetailCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs font-semibold text-zinc-500">
              Nguồn: báo cáo tồn đầu/cuối ca, phiếu xuất kho NVL, báo cáo hàng lỗi hỏng — khớp theo đúng mã NVL, ngày + ca.
            </p>
          </div>
        </div>
      </div>
    ) : null}
    {printConfirmOpen ? (
      <div
        className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Xác nhận in báo cáo máy BB"
        onMouseDown={event => {
          if (event.target === event.currentTarget) closePrintConfirm();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-sky-900 to-sky-700 px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-100">Xác nhận trước khi in</p>
              <h4 className="mt-1 text-base font-black">Báo cáo tổng hợp máy BB</h4>
              <p className="mt-1 text-xs font-semibold text-sky-50">
                Kiểm tra thông tin lệnh SX. Chỉ nhân sự được chọn lại trước khi in.
              </p>
            </div>
            <button
              type="button"
              onClick={closePrintConfirm}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-black hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            {orderGroups.map(group => {
              const selection = printStaffByOrder[group.groupKey] || {
                staffMain: group.staffMain || '',
                staffAssistant: group.staffAssistant || '',
                staffSupport: group.staffSupport || '',
                ghiChu: ''
              };
              const staffSelectClass =
                'h-10 w-full rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15';
              const ensureOption = (value: string) => {
                const trimmed = value.trim();
                if (!trimmed) return printStaffOptions;
                return printStaffOptions.includes(trimmed)
                  ? printStaffOptions
                  : [trimmed, ...printStaffOptions];
              };
              return (
                <div
                  key={group.groupKey}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm"
                >
                  <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Số lệnh</span>
                      <span className="mt-0.5 block font-mono font-black text-sky-900">{group.orderCode || '—'}</span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">{group.ngay || '—'}</span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ca</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">
                        {group.shiftLabel || group.shift || '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Máy</span>
                      <span className="mt-0.5 block font-semibold text-zinc-800">{group.machine || '—'}</span>
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN chính máy *
                      </span>
                      <select
                        value={selection.staffMain}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffMain', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffMain).map(name => (
                          <option key={`main-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN phụ máy
                      </span>
                      <select
                        value={selection.staffAssistant}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffAssistant', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffAssistant).map(name => (
                          <option key={`assistant-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                        CN hỗ trợ việc
                      </span>
                      <select
                        value={selection.staffSupport}
                        onChange={event => updatePrintStaff(group.groupKey, 'staffSupport', event.target.value)}
                        className={staffSelectClass}
                      >
                        <option value="">Chọn nhân sự...</option>
                        {ensureOption(selection.staffSupport).map(name => (
                          <option key={`support-${group.groupKey}-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mt-3 block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                      Ghi chú
                    </span>
                    <textarea
                      value={selection.ghiChu}
                      onChange={event => updatePrintStaff(group.groupKey, 'ghiChu', event.target.value)}
                      rows={3}
                      placeholder="Nhập ghi chú hiển thị trên phiếu in..."
                      className="min-h-[72px] w-full resize-y rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15"
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button
              type="button"
              onClick={closePrintConfirm}
              className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-black text-slate-700"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={confirmPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sky-700 px-4 text-xs font-extrabold text-white hover:bg-sky-800"
            >
              <Printer className="h-4 w-4" />
              Xác nhận &amp; In
            </button>
          </div>
        </div>
      </div>
    ) : null}
    {showPrintSheet
      ? createPortal(
          <ControlBoardBbMachineReportPrintBatch
            orderGroups={printOrderGroups.length > 0 ? printOrderGroups : orderGroups}
            exportGroups={exportGroups}
            dauCaGroups={dauCaGroups}
            cuoiCaGroups={cuoiCaGroups}
            damagedGroups={damagedGroups}
            mixingGroups={mixingGroups}
            danhGiaGroups={danhGiaGroups}
            inboundRows={inboundRows}
            acceptanceReports={acceptanceReports}
            products={products}
            materials={materials}
            phanTichMap={phanTichMap}
            noteByOrder={printNoteByOrder}
          />,
          document.body
        )
      : null}
    </>
  );
}
