import { findProductByCode, resolveProductNplItemWeightKg } from '../features/san-pham';
import { normalizeProductCodeKey, type ProductRow, type ProductNplItem } from '../features/san-pham/types';
import { findMachineByRef, type MachineRow } from '../features/danh-sach-may';
import type { MaterialRow } from '../features/kho-nvl';
import {
  getProductionOrderProductLines,
  parseProductionOrderQuantity,
  resolveProductUnitNormKg,
  resolveProductionOrderMachine,
  formatProductionOrderShiftLabel,
  type ProductionOrderRow,
  type ProductionOrderLookupSetting
} from '../features/ke-hoach-san-xuat';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../features/cai-dat-thoi-gian';
import type { ShiftSummaryWarehouseMovement } from './controlBoardShiftSummary';
import {
  computeKhoiLuongNhuaTp,
  computeMaterialUsageKg,
  computePercentRatio,
  computeShiftSummarySanLuongMetrics,
  computeSoTienLoLaiNhua,
  computeTlMangTpNhapKhoFromShiftSummary,
  computeTlNhuaTpNhapKhoFromShiftSummary,
  isWarehouseBagExportItem,
  isWarehouseCoreExportItem,
  isWarehouseFilmItem,
  isWarehousePlasticNvlLine,
  KHOI_LUONG_MANG_KG_PER_UNIT,
  machineValueMatchesFilter,
  matchesControlBoardDateRange,
  matchesShiftSummaryBucket,
  movementHasLinkedProductionOrderCodes,
  movementLinksProductionOrderCode,
  resolveMachineNvlLineMaterialType,
  resolveShiftSummaryGiaNhuaFromWarehouse,
  resolveWarehouseMovementMachineCandidates,
  TI_LE_LOI_HONG_DINH_MUC_PERCENT
} from './controlBoardShiftSummary';
import type { MixingReport } from '../components/MixingReportForm';
import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import {
  MIXING_ROUND_KEYS,
  getRoundBatchWeight,
  getRoundItems,
  resolveLineKlThucTe,
  roundNormWeight,
  sumReportNormTotal
} from '../lib/mixingReportModel';
import type { ShiftSetting } from './shiftSettings';
import { getProductionShiftOptions, resolvePreviousProductionShift, shiftNamesMatch } from './shiftSettings';
import {
  convertWarehouseQuantityToKg,
  findMaterialTongKgPerUnit,
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from './warehouseWeight';
import {
  getWeighingDataRows,
  isDamagedOtherMaterial,
  resolveDamagedOtherMaterialKg,
  splitDamagedGoodsDefectWeights,
  type WeighingRecord
} from './weighingRecords';
import {
  resolveMachineNvlLineKgFactor,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal,
  type MachineNvlSavedLine,
  type MachineNvlSavedReport
} from './machineNvlReports';

/**
 * Vật tư tham gia chia tỉ lệ trộn / phân bổ NNS-TRON: chỉ ĐVT kg.
 * Thành phần SP kiểu % lưu unit="%" — vẫn tính là nhựa/kg.
 * Cái / m2 / đơn vị khác: không chia tỉ lệ.
 */
function isBbMixingRatioKgUnit(unit: string, amountType?: 'percent' | 'quantity' | null) {
  if (amountType === 'percent') return true;
  const normalized = String(unit || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === '-' || normalized === '%') return true;
  return isWarehouseKgUnit(unit);
}

/** ĐVT hiển thị trên tab tồn đầu: thành phần % → kg (không hiện "%"). */
function resolveBbDauCaDisplayUnit(
  unit: string,
  amountType?: 'percent' | 'quantity' | null
) {
  if (amountType === 'percent') return 'kg';
  const trimmed = String(unit || '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '%') return 'kg';
  return trimmed;
}
export type BbMachineReportTabId =
  | 'lenh_sx'
  | 'phieu_xuat_kho'
  | 'ton_dau_ca'
  | 'bao_cao_san_luong'
  | 'bao_cao_loi_hong'
  | 'kiem_ton_cuoi_ca'
  | 'phieu_nhap_kho'
  | 'tong_vat_tu_thuc_dung'
  | 'tong_hop_vat_tu_thuc_xuat_dung'
  | 'tong_dinh_muc_nvl_nhap_kho'
  | 'tong'
  | 'danh_gia_hao_hut';

export const BB_MACHINE_REPORT_TABS: Array<{ id: BbMachineReportTabId; label: string }> = [
  { id: 'lenh_sx', label: 'Dữ liệu trong lệnh sản xuất' },
  { id: 'phieu_xuat_kho', label: 'Dữ liệu trong phiếu xuất kho vật tư' },
  { id: 'ton_dau_ca', label: 'Báo cáo dữ liệu tồn đầu ca' },
  { id: 'bao_cao_san_luong', label: 'Dữ liệu trong báo cáo sản lượng' },
  { id: 'bao_cao_loi_hong', label: 'Dữ liệu trong báo cáo hàng lỗi hỏng' },
  { id: 'kiem_ton_cuoi_ca', label: 'Dữ liệu trong báo cáo kiểm tồn cuối ca' },
  { id: 'tong_vat_tu_thuc_dung', label: 'Tổng vật tư thực xuất dùng & tỉ lệ trộn' },
  { id: 'tong_dinh_muc_nvl_nhap_kho', label: 'Tổng định mức vật tư của thành phẩm nhập kho' },
  { id: 'danh_gia_hao_hut', label: 'Đánh giá hiệu quả lỗi hỏng & hao hụt NVL' }
];

export type BbProductionOrderLineRow = {
  key: string;
  ngay: string;
  orderCode: string;
  machine: string;
  startDate: string;
  shift: string;
  shiftLabel: string;
  staffMain: string;
  staffAssistant: string;
  staffSupport: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  normKgPerUnit: number | null;
  totalNormKg: number | null;
};

export type BbWarehouseExportLineRow = {
  key: string;
  /** Khóa dòng phiếu gốc — dùng để không cộng trùng SL khi phân bổ nhiều SP. */
  slipLineKey: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  slipCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  /** SL thực xuất (kg: phân bổ % theo SL SP; ≠ kg: = SL định mức). */
  quantity: number;
  /** SL định mức theo ĐVT NVL (Thành phần × SL từng SP; ĐVT ≠ kg đã làm tròn nguyên). */
  normQuantity: number | null;
  /** KL định mức = SL định mức quy đổi sang kg. */
  normWeightKg: number | null;
  materialNorm: BbMaterialNormFormula | null;
  weightKg: number | null;
  /** Công thức KL thực xuất (click ô KL để xem). */
  weightFormula: BbExportWeightFormula | null;
  matchedByOrder: boolean;
  /** Chi tiết cân bằng vật tư thực tế cả ca của mã NVL này (dùng cho tab Định mức nhập kho). */
  balanceDetail: BbInboundMaterialBalanceDetail | null;
};

/** Chi tiết công thức cân bằng vật tư thực tế = Tồn đầu + Xuất thực tế − Lỗi hỏng − Tồn cuối. */
export type BbInboundMaterialBalanceDetail = {
  tonDauKg: number;
  /** true nếu Tồn đầu được phân bổ từ NNS-TRON (hỗn hợp chưa tách) thay vì ghi nhận trực tiếp theo mã. */
  tonDauFromNnsTron: boolean;
  /** Tồn đầu (đã trộn+chưa trộn) ghi nhận trực tiếp theo mã NVL này, trước khi xét phân bổ NNS-TRON. */
  tonDauDirectKg: number;
  /** Tồn đầu (đã trộn+chưa trộn) của mã NNS-TRON trong ca (0 nếu không có). */
  nnsTronTonDauKg: number;
  /** Tỉ lệ TB thực tế (%) dùng để chia NNS-TRON về mã này (null nếu không áp dụng). */
  tiLeThucTeTbPercent: number | null;
  xuatThucTeKg: number;
  loiHongKg: number;
  /** Nhóm NVL (nhựa/lõi/túi) — giữ để hiển thị; lỗi hỏng lấy theo tab báo cáo lỗi hỏng. */
  loiHongGroup: BbMaterialGroup;
  /**
   * Tổng KL lỗi hỏng cả ca đúng tab «Dữ liệu trong báo cáo lỗi hỏng»
   * (cộng mọi dòng NHUA/MÀNG/LÕI của phiếu khớp ngày+ca+máy).
   */
  loiHongGroupTotalKg: number;
  /** @deprecated Giữ tương thích — không còn dùng chia theo base. */
  loiHongBaseKg: number;
  /** @deprecated Giữ tương thích — không còn dùng chia theo base. */
  loiHongGroupBaseSumKg: number;
  /** Tỉ lệ trộn (%) từ báo cáo phối trộn — dùng với tổng lỗi hỏng tab để ra loiHongKg. */
  loiHongTiLeTronPercent: number | null;
  tonCuoiKg: number;
  realKg: number;
};

export type BbMaterialNormFormula = {
  productCode: string;
  productName: string;
  productQuantity: number;
  productUnit: string;
  productNormKgPerUnit: number | null;
  materialCode: string;
  materialName: string;
  amountType: 'percent' | 'quantity';
  rate: number;
  rateUnit: string;
  rawExpectedQuantity: number;
  rawExpectedUnit: string;
  /** Hệ số kg/đvt lấy từ cột Tổng kg kho NVL */
  catalogKgPerUnit: number | null;
  /** Giá trị lấy trực tiếp từ cột Khối lượng (kg) của dòng NVL trong Thành phần sản phẩm. */
  componentWeightKg?: number | null;
  totalNormKg: number;
  allocationRatio: number;
  allocatedNormKg: number;
};

export type BbExportWeightConvertMode =
  | 'kg_as_is'
  | 'multiply_tong_kg'
  | 'ton_to_kg'
  | 'gram_to_kg'
  | 'unknown';

/** Công thức SL/KL thực xuất (kg: % SL_SP × phiếu; ≠ kg: = định mức). */
export type BbExportWeightFormula = {
  itemCode: string;
  itemName: string;
  unit: string;
  /** SL thực xuất trên dòng này (đã phân bổ theo SP nếu có). */
  quantity: number;
  /** KL thực xuất trên dòng này (kg). */
  weightKg: number | null;
  convertMode: BbExportWeightConvertMode;
  /** Hệ số từ cột Tổng kg kho NVL (null nếu ĐVT kg / tấn / g). */
  catalogKgPerUnit: number | null;
  /** SL trên phiếu xuất gốc (trước phân bổ SP). */
  sourceQuantity: number;
  /** KL phiếu xuất gốc (trước phân bổ SP). */
  sourceWeightKg: number | null;
  /** Tỉ lệ phân bổ từ phiếu → SP (1 = không chia). */
  allocationRatio: number;
  /** SL sản phẩm (lệnh SX) dùng để tính nhu cầu Thành phần. */
  productQuantity: number | null;
  productUnit: string;
  /** Loại Thành phần: % hoặc số lượng. */
  bomAmountType: 'percent' | 'quantity' | null;
  /** Giá trị Thành phần (% hoặc SL NVL / 1 SP). */
  bomRate: number | null;
  bomRateUnit: string;
  /** Nhu cầu SP = SL SP × Thành phần (hoặc KL ĐM nếu loại %). */
  demandQuantity: number | null;
  /** Tổng nhu cầu các SP cùng NVL (mẫu số tỉ lệ %). */
  totalDemand: number | null;
  /** KL định mức của SP này (SL đặt × ĐM kg) — dùng làm tử số % phân bổ. */
  allocWeightBase: number | null;
  /** Tổng KL định mức các SP cùng NVL — mẫu số % phân bổ theo khối lượng. */
  allocWeightTotal: number | null;
};

function roundQty(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * ĐVT ≠ kg: làm tròn SL về số nguyên.
 * Phần thập phân &lt; 0.5 → xuống; &gt; 0.5 → lên; đúng 0.5 → làm tròn xuống.
 */
function roundNonKgQuantityToInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value === 0) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  // Dùng epsilon để nhận đúng 0.5 do lỗi float
  if (frac < 0.5 - 1e-9) return sign * whole;
  if (frac > 0.5 + 1e-9) return sign * (whole + 1);
  return sign * whole; // đúng .5 → xuống
}

function roundQuantityByUnit(value: number, unit: string): number {
  if (isWarehouseKgUnit(unit)) return roundQty(value, 4);
  return roundNonKgQuantityToInt(value);
}

/** Máy BB: mã/tên có "BB" hoặc "bao bì" (không phân biệt hoa thường / dấu). */
export function isBbMachineText(...candidates: Array<string | undefined | null>) {
  return candidates.some(value => {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return false;
    if (/bb/i.test(raw)) return true;
    const compact = raw
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    return compact.includes('baobi');
  });
}

export function isBbMachineRow(machine: Pick<MachineRow, 'code' | 'name' | 'type'> | null | undefined) {
  if (!machine) return false;
  return isBbMachineText(machine.code, machine.name, machine.type);
}

export function splitBbProductionOrderStaff(staff: string) {
  const names = splitProductionOrderStaffNames(staff);
  return {
    staffMain: names[0] || '',
    staffAssistant: names[1] || '',
    staffSupport: names.slice(2).join(', ')
  };
}

function findMachineForOrder(order: ProductionOrderRow, machines: MachineRow[]) {
  const candidates = [order.machine, order.position].map(value => String(value || '').trim()).filter(Boolean);
  if (candidates.length === 0) return null;
  return (
    machines.find(machine =>
      candidates.some(candidate => {
        const token = candidate.replace(/\s+/g, '').toUpperCase();
        const code = machine.code.replace(/\s+/g, '').toUpperCase();
        const name = machine.name.replace(/\s+/g, '').toUpperCase();
        return token === code || token === name || token.includes(code) || code.includes(token) || name.includes(token);
      })
    ) ?? null
  );
}

/** Tìm máy theo nhãn hiển thị (mã / tên / "mã · tên") — khớp mờ, bỏ khoảng trắng & phân biệt hoa thường. */
function findBbMachineByLabel(machines: MachineRow[], label: string): MachineRow | null {
  const exact = findMachineByRef(machines, label);
  if (exact) return exact;
  const token = String(label || '').replace(/\s+/g, '').toUpperCase();
  if (!token) return null;
  return (
    machines.find(machine => {
      const code = machine.code.replace(/\s+/g, '').toUpperCase();
      const name = machine.name.replace(/\s+/g, '').toUpperCase();
      return (
        (code && (token === code || token.includes(code) || code.includes(token))) ||
        (name && (token === name || token.includes(name) || name.includes(token)))
      );
    }) ?? null
  );
}

export function isBbProductionOrder(
  order: ProductionOrderRow,
  machines: MachineRow[],
  includeAllMachines = false
) {
  if (includeAllMachines) return true;
  const resolved = resolveProductionOrderMachine(order, machines);
  const matched = findMachineForOrder(order, machines);
  return isBbMachineText(order.machine, order.position, resolved, matched?.code, matched?.name, matched?.type);
}

export function buildBbProductionOrderLineRows(input: {
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbProductionOrderLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const rows: BbProductionOrderLineRow[] = [];

  for (const order of input.productionOrders) {
    if (!isBbProductionOrder(order, input.machines, input.includeAllMachines)) continue;

    const ngay = parseProductionOrderFilterDate(order.startDate);
    if (!matchesControlBoardDateRange(ngay || order.startDate, input.dateFrom, input.dateTo)) continue;

    const machineLabel = resolveProductionOrderMachine(order, input.machines);
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        order.machine,
        order.position,
        machineLabel
      )
    ) {
      continue;
    }

    if (input.shiftFilter && input.shiftFilter !== 'all') {
      if (!shiftNamesMatch(order.shift, input.shiftFilter)) continue;
    }

    const staff = splitBbProductionOrderStaff(order.staff);
    const shiftLabel = formatProductionOrderShiftLabel(order.shift, shiftSettings);
    const productLines = getProductionOrderProductLines(order);

    productLines.forEach((line, index) => {
      const quantity = parseProductionOrderQuantity(line.quantity);
      const product = findProductByCode(input.products, line.productCode);
      const normKgPerUnit = resolveProductUnitNormKg(product);
      const totalNormKg =
        normKgPerUnit !== null && quantity > 0 ? roundQty(normKgPerUnit * quantity, 4) : null;

      rows.push({
        key: `${order.id || order.code}|${line.productCode || index}|${index}`,
        ngay: ngay || parseProductionOrderFilterDate(order.startDate) || '',
        orderCode: order.code,
        machine: machineLabel,
        startDate: order.startDate,
        shift: order.shift,
        shiftLabel,
        staffMain: staff.staffMain,
        staffAssistant: staff.staffAssistant,
        staffSupport: staff.staffSupport,
        productCode: line.productCode || '',
        productName: line.productName || '',
        unit: line.unit || '',
        quantity,
        normKgPerUnit,
        totalNormKg
      });
    });
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp = a.shiftLabel.localeCompare(b.shiftLabel, 'vi');
    if (shiftCmp !== 0) return shiftCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

function resolveExportWeightConvertMode(
  unit: string,
  catalogKgPerUnit: number | null
): BbExportWeightConvertMode {
  if (isWarehouseKgUnit(unit)) return 'kg_as_is';
  const normalized = String(unit || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    normalized === 't' ||
    normalized === 'tan' ||
    normalized === 'ton' ||
    normalized === 'tonne' ||
    normalized === 'mt'
  ) {
    return 'ton_to_kg';
  }
  if (normalized === 'g' || normalized === 'gr' || normalized === 'gram' || normalized === 'gam') {
    return 'gram_to_kg';
  }
  if (catalogKgPerUnit !== null && catalogKgPerUnit > 0) return 'multiply_tong_kg';
  return 'unknown';
}

function buildExportWeightFormula(input: {
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  weightKg: number | null;
  materialsCatalog: WarehouseWeightCatalogItem[];
  sourceQuantity?: number;
  sourceWeightKg?: number | null;
  allocationRatio?: number;
  productQuantity?: number | null;
  productUnit?: string;
  bomAmountType?: 'percent' | 'quantity' | null;
  bomRate?: number | null;
  bomRateUnit?: string;
  demandQuantity?: number | null;
  totalDemand?: number | null;
  allocWeightBase?: number | null;
  allocWeightTotal?: number | null;
}): BbExportWeightFormula | null {
  const hasQty = input.quantity > 0;
  const hasKg = input.weightKg !== null && input.weightKg > 0;
  if (!hasQty && !hasKg) return null;
  const catalogKgPerUnit = findMaterialTongKgPerUnit(input.itemCode, input.materialsCatalog);
  return {
    itemCode: input.itemCode,
    itemName: input.itemName,
    unit: input.unit || '',
    quantity: hasQty ? input.quantity : 0,
    weightKg: hasKg ? input.weightKg : null,
    convertMode: resolveExportWeightConvertMode(input.unit || '', catalogKgPerUnit),
    catalogKgPerUnit,
    sourceQuantity:
      input.sourceQuantity !== undefined && input.sourceQuantity > 0
        ? input.sourceQuantity
        : hasQty
          ? input.quantity
          : 0,
    sourceWeightKg:
      input.sourceWeightKg !== undefined ? input.sourceWeightKg : input.weightKg,
    allocationRatio:
      input.allocationRatio !== undefined && Number.isFinite(input.allocationRatio)
        ? input.allocationRatio
        : 1,
    productQuantity:
      input.productQuantity !== undefined && input.productQuantity !== null && input.productQuantity > 0
        ? input.productQuantity
        : null,
    productUnit: input.productUnit || '',
    bomAmountType: input.bomAmountType ?? null,
    bomRate:
      input.bomRate !== undefined && input.bomRate !== null && Number.isFinite(input.bomRate)
        ? input.bomRate
        : null,
    bomRateUnit: input.bomRateUnit || '',
    demandQuantity:
      input.demandQuantity !== undefined && input.demandQuantity !== null && input.demandQuantity > 0
        ? input.demandQuantity
        : null,
    totalDemand:
      input.totalDemand !== undefined && input.totalDemand !== null && input.totalDemand > 0
        ? input.totalDemand
        : null,
    allocWeightBase:
      input.allocWeightBase !== undefined && input.allocWeightBase !== null && input.allocWeightBase > 0
        ? input.allocWeightBase
        : null,
    allocWeightTotal:
      input.allocWeightTotal !== undefined && input.allocWeightTotal !== null && input.allocWeightTotal > 0
        ? input.allocWeightTotal
        : null
  };
}

type ExportAllocationBomShare = {
  productQuantity: number;
  productUnit: string;
  bomAmountType: 'percent' | 'quantity' | null;
  bomRate: number | null;
  bomRateUnit: string;
  demandQuantity: number;
  totalDemand: number;
  allocWeightBase: number;
  allocWeightTotal: number;
};

function allocateExportWeightFormula(
  base: BbExportWeightFormula | null,
  allocatedQuantity: number,
  allocatedWeightKg: number | null,
  allocationRatio: number,
  bomShare?: ExportAllocationBomShare | null
): BbExportWeightFormula | null {
  const hasQty = allocatedQuantity > 0;
  const hasKg = allocatedWeightKg !== null && allocatedWeightKg > 0;
  if (!base || (!hasQty && !hasKg)) return null;
  return {
    ...base,
    quantity: hasQty ? allocatedQuantity : 0,
    weightKg: hasKg ? allocatedWeightKg : null,
    allocationRatio: Number.isFinite(allocationRatio) ? allocationRatio : 1,
    productQuantity: bomShare?.productQuantity ?? base.productQuantity,
    productUnit: bomShare?.productUnit || base.productUnit,
    bomAmountType: bomShare?.bomAmountType ?? base.bomAmountType,
    bomRate: bomShare?.bomRate ?? base.bomRate,
    bomRateUnit: bomShare?.bomRateUnit || base.bomRateUnit,
    demandQuantity: bomShare?.demandQuantity ?? base.demandQuantity,
    totalDemand: bomShare?.totalDemand ?? base.totalDemand,
    allocWeightBase: bomShare?.allocWeightBase ?? base.allocWeightBase,
    allocWeightTotal: bomShare?.allocWeightTotal ?? base.allocWeightTotal
  };
}

function resolveExportWeightKg(
  movement: ShiftSummaryWarehouseMovement,
  materials: MaterialRow[]
): number | null {
  const qty = Number(movement.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const catalog = materials.map(mapMaterialToWeightCatalogItem);
  const converted = convertWarehouseQuantityToKg({
    quantity: qty,
    unit: movement.unit,
    itemCode: movement.itemCode,
    warehouseKind: 'nvl',
    materials: catalog
  });
  if (converted === null || !Number.isFinite(converted) || converted <= 0) return null;
  return roundQty(converted, 4);
}

function movementMatchesOrderCode(movement: ShiftSummaryWarehouseMovement, orderCode: string) {
  return movementLinksProductionOrderCode(movement, orderCode);
}

/** Phiếu XK khớp ngày+ca header; máy nếu có; nếu phiếu có mã lệnh thì phải khớp mã. */
function movementAppliesToBbOrderHeader(
  movement: ShiftSummaryWarehouseMovement,
  header: { ngay: string; shift: string; orderCode?: string; machine?: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
): boolean {
  if (!matchesShiftSummaryBucket(header.ngay, header.shift, movement.slipDate, movement.shift, shiftOptions)) {
    return false;
  }

  const machineCandidates = resolveWarehouseMovementMachineCandidates(movement, []);
  const headerMachine = String(header.machine || '').trim();
  if (machineCandidates.length > 0 && headerMachine) {
    if (
      !machineValueMatchesFilter(
        headerMachine,
        { code: headerMachine, name: headerMachine },
        ...machineCandidates
      )
    ) {
      return false;
    }
  }

  if (!movementHasLinkedProductionOrderCodes(movement)) return true;
  const orderCode = String(header.orderCode || '').trim();
  if (!orderCode) return false;
  return movementMatchesOrderCode(movement, orderCode);
}

function orderIncludesProduct(order: ProductionOrderRow, productCode: string, productName: string) {
  const codeKey = normalizeProductCodeKey(productCode);
  const nameKey = normalizeProductCodeKey(productName);
  return getProductionOrderProductLines(order).some(line => {
    const lineCode = normalizeProductCodeKey(line.productCode);
    const lineName = normalizeProductCodeKey(line.productName);
    return (codeKey && lineCode === codeKey) || (nameKey && lineName === nameKey);
  });
}

export function buildBbWarehouseExportLineRows(input: {
  productionOrders: ProductionOrderRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  /** `/phan-tich-tu-dong`: lấy phiếu xuất của mọi máy, không giới hạn nhóm máy BB. */
  includeAllMachines?: boolean;
}): BbWarehouseExportLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];

  const headers: Array<{
    ngay: string;
    shift: string;
    orderCode: string;
    machine: string;
  }> = [];
  const seenOrderKeys = new Set<string>();

  for (const order of input.productionOrders) {
    if (!input.includeAllMachines && !isBbProductionOrder(order, input.machines)) continue;
    const ngay = parseProductionOrderFilterDate(order.startDate);
    if (!matchesControlBoardDateRange(ngay || order.startDate, input.dateFrom, input.dateTo)) continue;
    const machineLabel = resolveProductionOrderMachine(order, input.machines);
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        order.machine,
        order.position,
        machineLabel
      )
    ) {
      continue;
    }
    if (input.shiftFilter && input.shiftFilter !== 'all') {
      if (!shiftNamesMatch(order.shift, input.shiftFilter)) continue;
    }
    const key = `${order.code}|${ngay}|${order.shift}`;
    if (seenOrderKeys.has(key)) continue;
    seenOrderKeys.add(key);
    headers.push({
      ngay: ngay || '',
      shift: order.shift,
      orderCode: order.code,
      machine: machineLabel
    });
  }

  if (headers.length === 0) return [];

  const materialsCatalog = input.materials.map(mapMaterialToWeightCatalogItem);
  const rows: BbWarehouseExportLineRow[] = [];

  for (const movement of input.warehouseMovements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!matchesControlBoardDateRange(movement.slipDate, input.dateFrom, input.dateTo)) continue;
    if (input.shiftFilter && input.shiftFilter !== 'all') {
      if (!shiftNamesMatch(movement.shift, input.shiftFilter)) continue;
    }

    const relatedOrders = headers.filter(order => {
      if (!matchesShiftSummaryBucket(order.ngay, order.shift, movement.slipDate, movement.shift, shiftOptions)) {
        return false;
      }
      const machineCandidates = resolveWarehouseMovementMachineCandidates(
        movement,
        input.productionOrders,
        linked => resolveProductionOrderMachine(linked as ProductionOrderRow, input.machines)
      );
      if (machineCandidates.length === 0) return true;
      return machineValueMatchesFilter(
        order.machine || 'all',
        { code: order.machine, name: order.machine },
        ...machineCandidates
      );
    });
    if (relatedOrders.length === 0) continue;

    const explicitMatches = relatedOrders.filter(order => movementMatchesOrderCode(movement, order.orderCode));
    const hasLinkedCodes = movementHasLinkedProductionOrderCodes(movement);
    // Có mã lệnh trên phiếu nhưng không khớp lệnh BB trong ca → bỏ (không gán nhầm).
    if (hasLinkedCodes && explicitMatches.length === 0) continue;
    const matchedOrders = explicitMatches.length > 0 ? explicitMatches : relatedOrders;
    const matchedByOrder = explicitMatches.length > 0;
    const orderCode = [...new Set(matchedOrders.map(order => order.orderCode).filter(Boolean))].join(', ');
    const machine =
      [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))].join(', ') ||
      resolveWarehouseMovementMachineCandidates(
        movement,
        input.productionOrders,
        linked => resolveProductionOrderMachine(linked as ProductionOrderRow, input.machines)
      ).join(', ');

    const slipLineKey = `${movement.id || movement.slipCode}|${movement.itemCode}|${movement.slipDate}`;
    const quantity = Number.isFinite(movement.quantity) ? movement.quantity : 0;
    const weightKg = resolveExportWeightKg(movement, input.materials);
    rows.push({
      key: slipLineKey,
      slipLineKey,
      ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
      shift: movement.shift,
      shiftLabel: formatProductionOrderShiftLabel(movement.shift, lookupSettings),
      orderCode,
      machine,
      slipCode: movement.slipCode,
      itemCode: movement.itemCode,
      itemName: movement.itemName,
      unit: movement.unit,
      quantity,
      normQuantity: null,
      normWeightKg: null,
      materialNorm: null,
      weightKg,
      weightFormula: buildExportWeightFormula({
        itemCode: movement.itemCode,
        itemName: movement.itemName,
        unit: movement.unit,
        quantity,
        weightKg,
        materialsCatalog
      }),
      matchedByOrder,
      balanceDetail: null
    });
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp = a.shiftLabel.localeCompare(b.shiftLabel, 'vi');
    if (shiftCmp !== 0) return shiftCmp;
    return a.slipCode.localeCompare(b.slipCode, 'vi');
  });
}

export function sumBbProductionOrderTotals(rows: BbProductionOrderLineRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity > 0 ? row.quantity : 0;
      acc.totalNormKg += row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0;
      return acc;
    },
    { quantity: 0, totalNormKg: 0 }
  );
}

export function sumBbWarehouseExportWeightKg(rows: BbWarehouseExportLineRow[]) {
  return rows.reduce((sum, row) => sum + (row.weightKg && row.weightKg > 0 ? row.weightKg : 0), 0);
}

/**
 * Tổng trọng lượng xuất — khớp footer phiếu xuất kho NVL:
 * - Trọng lượng nhựa = Σ «Quy về kg» mọi dòng ĐVT = kg (kể cả túi/bột/dầu)
 * - Vật tư khác = Σ «Quy về kg» dòng ĐVT ≠ kg (lõi cái…)
 * - Dòng không quy được kg (vd. cuộn băng dính) không cộng
 */
export function sumBbWarehouseExportWeightKgByKind(rows: BbWarehouseExportLineRow[]) {
  const seen = new Set<string>();
  let plasticKg = 0;
  let otherKg = 0;
  for (const row of rows) {
    const slipId = row.slipLineKey || row.key;
    if (seen.has(slipId)) continue;
    seen.add(slipId);
    const kg = row.weightKg && row.weightKg > 0 ? row.weightKg : 0;
    if (!(kg > 0)) continue;

    if (isWarehouseKgUnit(row.unit || '')) plasticKg += kg;
    else otherKg += kg;
  }
  return {
    plasticKg,
    otherKg,
    totalKg: plasticKg + otherKg
  };
}

/** @deprecated Dùng sumBbWarehouseExportWeightKgByKind — giữ tương thích chỗ gọi cũ. */
export function sumBbWarehousePlasticExportWeightKg(rows: BbWarehouseExportLineRow[]) {
  return sumBbWarehouseExportWeightKgByKind(rows).totalKg;
}

/**
 * Tổng trọng lượng nhựa yêu cầu (kg) = Σ cột «Tổng (kg)» trên dòng lệnh SX đã lọc.
 */
export function sumBbProductionOrderPlasticRequiredKg(rows: BbProductionOrderLineRow[]) {
  return rows.reduce((sum, row) => sum + (row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0), 0);
}

/** Tổng SL đúng cột phiếu xuất kho — mỗi dòng phiếu chỉ cộng một lần. */
export function sumBbWarehouseExportSlipQuantity(rows: BbWarehouseExportLineRow[]) {
  const seen = new Set<string>();
  let sum = 0;
  for (const row of rows) {
    const id = row.slipLineKey || row.key;
    if (seen.has(id)) continue;
    seen.add(id);
    if (row.quantity > 0) sum += row.quantity;
  }
  return sum;
}

/** Dòng tổng NVL lấy thẳng từ phiếu xuất kho (không phân bổ theo SP). */
export type BbWarehouseExportMaterialTotal = {
  key: string;
  itemCode: string;
  itemName: string;
  unit: string;
  /** Tổng SL trên phiếu xuất (sau khi khử trùng slipLineKey). */
  quantity: number;
  /** Tổng KL (kg) quy đổi từ phiếu xuất. */
  weightKg: number;
  /** Số dòng phiếu xuất góp vào tổng. */
  lineCount: number;
};

/**
 * Gom tổng NVL đã xuất lấy thẳng từ dòng phiếu xuất kho.
 * Mỗi `slipLineKey` chỉ cộng một lần — không dùng dòng đã phân bổ theo SP.
 */
export function aggregateBbWarehouseExportByMaterial(
  rows: BbWarehouseExportLineRow[]
): BbWarehouseExportMaterialTotal[] {
  const seen = new Set<string>();
  const map = new Map<string, BbWarehouseExportMaterialTotal>();

  for (const row of rows) {
    const slipId = row.slipLineKey || row.key;
    if (seen.has(slipId)) continue;
    seen.add(slipId);

    const code = String(row.itemCode || '').trim();
    const name = String(row.itemName || '').trim();
    const unit = String(row.unit || '').trim();
    const materialKey =
      normalizeMaterialCodeKey(code) ||
      (name ? `name:${name.toUpperCase()}` : '') ||
      slipId;

    const qty = row.quantity > 0 ? row.quantity : 0;
    const kg = row.weightKg && row.weightKg > 0 ? row.weightKg : 0;
    const existing = map.get(materialKey);
    if (!existing) {
      map.set(materialKey, {
        key: materialKey,
        itemCode: code,
        itemName: name,
        unit,
        quantity: qty,
        weightKg: kg,
        lineCount: 1
      });
      continue;
    }
    existing.quantity += qty;
    existing.weightKg += kg;
    existing.lineCount += 1;
    if (!existing.itemName && name) existing.itemName = name;
    if (!existing.itemCode && code) existing.itemCode = code;
    if (!existing.unit && unit) existing.unit = unit;
  }

  return [...map.values()].sort((a, b) => {
    const aIsKg = isWarehouseKgUnit(a.unit || '');
    const bIsKg = isWarehouseKgUnit(b.unit || '');
    if (aIsKg !== bIsKg) return aIsKg ? -1 : 1;

    const unitCmp = String(a.unit || '')
      .trim()
      .localeCompare(String(b.unit || '').trim(), 'vi', { sensitivity: 'base' });
    if (unitCmp !== 0) return unitCmp;

    const codeCmp = a.itemCode.localeCompare(b.itemCode, 'vi');
    if (codeCmp !== 0) return codeCmp;
    return a.itemName.localeCompare(b.itemName, 'vi');
  });
}

export type BbProductionOrderGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  startDate: string;
  machine: string;
  shift: string;
  shiftLabel: string;
  staffMain: string;
  staffAssistant: string;
  staffSupport: string;
  lineCount: number;
  quantity: number;
  totalNormKg: number;
  /** ĐVT của SP — chỉ có giá trị khi mọi dòng trong lệnh cùng một ĐVT, ngược lại rỗng. */
  unit: string;
  /** Định mức (kg/ĐVT) lấy từ SP tương ứng — chỉ có giá trị khi mọi dòng trong lệnh cùng một SP. */
  normKgPerUnit: number | null;
  lines: BbProductionOrderLineRow[];
};

export type BbWarehouseExportGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  quantity: number;
  totalNormWeightKg: number;
  totalWeightKg: number;
  unmatchedCount: number;
  lines: BbWarehouseExportLineRow[];
  productGroups: BbWarehouseExportProductGroup[];
};

export type BbWarehouseExportProductGroup = {
  productKey: string;
  productCode: string;
  productName: string;
  unit: string;
  orderQuantity: number;
  normKgPerUnit: number | null;
  normWeightKg: number;
  lineCount: number;
  quantity: number;
  totalWeightKg: number;
  allocationMode: 'direct' | 'quota' | 'unassigned';
  lines: BbWarehouseExportLineRow[];
};

function roundInboundDisplayKg(value: number, digits = 2): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Σ TL định mức NVL theo BOM (kg thành phần/1 SP × SL) — khớp cột «TL định mức» trên UI. */
export function sumBbInboundTheoreticalNormKgForProductGroup(
  productGroup: BbWarehouseExportProductGroup
): number {
  const productQty = productGroup.quantity > 0 ? productGroup.quantity : 0;
  const groupedByCode = new Map<string, { componentPerUnit: number; productQuantity: number }>();
  for (const line of productGroup.lines || []) {
    const key = line.itemCode || '—';
    const componentWeightKg = line.materialNorm?.componentWeightKg ?? null;
    const lineQty = line.materialNorm?.productQuantity || 0;
    let existing = groupedByCode.get(key);
    if (!existing) {
      existing = {
        componentPerUnit:
          componentWeightKg !== null && componentWeightKg > 0 ? componentWeightKg : 0,
        productQuantity: lineQty
      };
      groupedByCode.set(key, existing);
    } else {
      if (lineQty > existing.productQuantity) existing.productQuantity = lineQty;
      if (existing.componentPerUnit <= 0 && componentWeightKg !== null && componentWeightKg > 0) {
        existing.componentPerUnit = componentWeightKg;
      }
    }
  }
  let total = 0;
  for (const row of groupedByCode.values()) {
    const qty = row.productQuantity > 0 ? row.productQuantity : productQty;
    total += roundInboundDisplayKg(
      row.componentPerUnit > 0 && qty > 0 ? row.componentPerUnit * qty : 0,
      2
    );
  }
  return roundInboundDisplayKg(total, 2);
}

export function sumBbInboundTheoreticalNormKgForGroup(group: BbWarehouseExportGroup): number {
  return roundInboundDisplayKg(
    group.productGroups.reduce(
      (sum, productGroup) => sum + sumBbInboundTheoreticalNormKgForProductGroup(productGroup),
      0
    ),
    2
  );
}

/** Gom dòng hàng theo số lệnh SX (giữ thứ tự ngày desc). */
export function groupBbProductionOrderLines(rows: BbProductionOrderLineRow[]): BbProductionOrderGroup[] {
  const map = new Map<string, BbProductionOrderGroup>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || row.key;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        startDate: row.startDate,
        machine: row.machine,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        staffMain: row.staffMain,
        staffAssistant: row.staffAssistant,
        staffSupport: row.staffSupport,
        lineCount: 1,
        quantity: row.quantity > 0 ? row.quantity : 0,
        totalNormKg: row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0,
        unit: row.unit || '',
        normKgPerUnit: row.normKgPerUnit,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.quantity += row.quantity > 0 ? row.quantity : 0;
    existing.totalNormKg += row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0;
    existing.lines.push(row);
  }

  return [...map.values()]
    .map(group => {
      const firstProductCode = normalizeProductCodeKey(group.lines[0]?.productCode || '');
      const sameProduct =
        firstProductCode !== '' &&
        group.lines.every(line => normalizeProductCodeKey(line.productCode || '') === firstProductCode);
      return {
        ...group,
        unit: sameProduct ? group.unit : '',
        normKgPerUnit: sameProduct ? group.normKgPerUnit : null
      };
    })
    .sort((a, b) => {
      const dateCmp = b.ngay.localeCompare(a.ngay);
      if (dateCmp !== 0) return dateCmp;
      return a.orderCode.localeCompare(b.orderCode, 'vi');
    });
}

/** SL SP × Giá trị Thành phần → kg (ĐVT kg giữ nguyên; ĐVT khác: SL làm tròn nguyên rồi × Tổng kg). */
function resolveBomExpectedKg(
  item: ProductNplItem,
  orderQuantity: number,
  unitWeightKg: number | null,
  materialsCatalog: WarehouseWeightCatalogItem[]
): number | null {
  if (item.amountType === 'percent') {
    if (unitWeightKg === null || unitWeightKg <= 0) return null;
    const kg = unitWeightKg * orderQuantity * (Math.max(0, item.percent ?? 0) / 100);
    return kg > 0 ? kg : null;
  }

  const rawQty = Math.max(0, item.quantity ?? 0) * orderQuantity;
  if (rawQty <= 0) return null;

  const unit = String(item.unit || '').trim();
  // ĐVT kg (hoặc trống): KL = SL, không nhân thêm hệ số Tổng kg
  if (!unit || unit === '-' || isWarehouseKgUnit(unit)) {
    return rawQty > 0 ? rawQty : null;
  }

  // ĐVT ≠ kg: làm tròn SL về số nguyên (.5 làm tròn xuống) rồi mới quy đổi kg
  const qty = roundNonKgQuantityToInt(rawQty);
  if (qty <= 0) return null;

  const converted = convertWarehouseQuantityToKg({
    quantity: qty,
    unit,
    itemCode: item.code,
    warehouseKind: 'nvl',
    materials: materialsCatalog
  });
  return converted !== null && Number.isFinite(converted) && converted > 0 ? converted : null;
}

/**
 * SL sản phẩm theo ngày/ca/máy BB từ báo cáo nghiệm thu (dùng khi cần đối chiếu sản lượng).
 */
export function acceptanceQuantityForBbProduct(input: {
  ngay: string;
  shift: string;
  machine: string;
  productCode: string;
  productName: string;
  reports: AcceptanceReport[];
}): number {
  const codeKey = normalizeProductCodeKey(input.productCode);
  const nameKey = normalizeProductCodeKey(input.productName);
  if (!codeKey && !nameKey) return 0;

  return input.reports.reduce((sum, report) => {
    if (!isBbMachineText(report.ma_may, report.ten_may)) return sum;
    const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (reportDate !== input.ngay || !shiftNamesMatch(report.ca, input.shift)) return sum;
    if (
      !machineValueMatchesFilter(input.machine, null, report.ma_may, report.ten_may) &&
      !(isBbMachineText(input.machine) && isBbMachineText(report.ma_may, report.ten_may))
    ) {
      return sum;
    }
    const itemKey = normalizeProductCodeKey(report.mat_hang);
    const productMatched =
      (codeKey && (itemKey === codeKey || itemKey.includes(codeKey) || codeKey.includes(itemKey))) ||
      (nameKey && (itemKey === nameKey || itemKey.includes(nameKey) || nameKey.includes(itemKey)));
    if (!productMatched) return sum;
    const qty = Number(report.so_luong);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
}

/** Gom dòng xuất kho theo số lệnh SX (nhiều lệnh ghép → tách theo chuỗi orderCode). */
export function groupBbWarehouseExportLines(
  rows: BbWarehouseExportLineRow[],
  productionOrders: ProductionOrderRow[] = [],
  products: ProductRow[] = [],
  materials: MaterialRow[] = []
): BbWarehouseExportGroup[] {
  const map = new Map<string, BbWarehouseExportGroup>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        machine: row.machine,
        lineCount: 1,
        quantity: row.quantity > 0 ? row.quantity : 0,
        totalNormWeightKg: 0,
        totalWeightKg: row.weightKg && row.weightKg > 0 ? row.weightKg : 0,
        unmatchedCount: row.matchedByOrder ? 0 : 1,
        lines: [row],
        productGroups: []
      });
      continue;
    }
    existing.lineCount += 1;
    existing.quantity += row.quantity > 0 ? row.quantity : 0;
    existing.totalWeightKg += row.weightKg && row.weightKg > 0 ? row.weightKg : 0;
    if (!row.matchedByOrder) existing.unmatchedCount += 1;
    existing.lines.push(row);
  }

  const groups = [...map.values()];
  groups.forEach(group => {
    group.productGroups = buildBbWarehouseExportProductGroups(group, productionOrders, products, materials);
    group.totalNormWeightKg = group.productGroups.reduce(
      (sum, productGroup) => sum + productGroup.normWeightKg,
      0
    );
  });

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

/** Định mức NVL theo SL thành phẩm nhập kho (phiếu nhập kho TP), gom theo lệnh SX. */
/**
 * Tổng định mức NVL của thành phẩm — SL SP lấy từ phiếu báo cáo sản lượng (bao_cao_nghiem_thu)
 * theo đúng ngày + ca (+ máy BB) của lệnh.
 */
export function buildBbInboundMaterialNormGroups(input: {
  productionOrders: ProductionOrderRow[];
  acceptanceReports: AcceptanceReport[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines: MachineRow[];
  machineNvlReports: MachineNvlSavedReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  damagedRecords: WeighingRecord[];
  mixingReports: MixingReport[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbWarehouseExportGroup[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  // Khớp theo ngày + ca → gộp các lệnh SX cùng ngày/ca thành 1 dòng để không đếm trùng SL.
  const headers = mergeBbHeadersByShift(collectBbOrderHeaders(input));
  if (headers.length === 0) return [];

  const materialsCatalog = input.materials.map(mapMaterialToWeightCatalogItem);
  const acceptanceReports = input.acceptanceReports.filter(report => {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (!matchesControlBoardDateRange(ngay, input.dateFrom, input.dateTo)) return false;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(report.ca, input.shiftFilter)) {
      return false;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        report.ma_may,
        report.ten_may
      )
    ) {
      return false;
    }
    if (input.includeAllMachines) return true;
    return isBbMachineText(report.ma_may, report.ten_may);
  });
  if (acceptanceReports.length === 0) return [];

  const resolveAcceptanceProductCode = (matHang: string) => {
    const trimmed = String(matHang || '').trim();
    if (!trimmed) return '';
    const plusIdx = trimmed.indexOf('+');
    return (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
  };

  const groups: BbWarehouseExportGroup[] = [];

  for (const header of headers) {
    // Chỉ khớp phiếu Báo cáo sản lượng theo ngày + ca (máy BB đã lọc sẵn ở bước acceptanceReports).
    const matchedReports = acceptanceReports.filter(report => {
      const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
      return matchesShiftSummaryBucket(header.ngay, header.shift, reportDate, report.ca, shiftOptions);
    });
    if (matchedReports.length === 0) continue;

    const productMap = new Map<string, BbWarehouseExportProductGroup>();

    for (const report of matchedReports) {
      const productCode = resolveAcceptanceProductCode(report.mat_hang);
      if (!productCode) continue;
      const qty = Number(report.so_luong);
      const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (inboundQty <= 0) continue;

      const catalogProduct =
        findProductByCode(input.products, productCode) ||
        input.products.find(
          product =>
            normalizeProductCodeKey(product.name) === normalizeProductCodeKey(productCode) ||
            normalizeProductCodeKey(product.name).includes(normalizeProductCodeKey(productCode))
        );
      const resolvedCode = catalogProduct?.code || productCode;
      const productKey = normalizeProductCodeKey(resolvedCode) || normalizeProductCodeKey(productCode);
      if (!productKey) continue;

      let productGroup = productMap.get(productKey);
      if (!productGroup) {
        productGroup = {
          productKey,
          productCode: resolvedCode,
          productName: catalogProduct?.name || productCode,
          unit: String(report.don_vi || catalogProduct?.unit || '').trim(),
          orderQuantity: 0,
          normKgPerUnit: resolveProductUnitNormKg(catalogProduct),
          normWeightKg: 0,
          lineCount: 0,
          quantity: 0,
          totalWeightKg: 0,
          allocationMode: 'direct',
          lines: []
        };
        productMap.set(productKey, productGroup);
      }

      productGroup.quantity += inboundQty;
      productGroup.orderQuantity += inboundQty;
      productGroup.lineCount += 1;
      if (!productGroup.unit && report.don_vi) {
        productGroup.unit = String(report.don_vi).trim();
      }

      const unitNorm = productGroup.normKgPerUnit;
      const productWeightKg = unitNorm !== null && unitNorm > 0 ? roundQty(unitNorm * inboundQty, 4) : 0;
      productGroup.totalWeightKg += productWeightKg;

      const movementPrefix = `${report.id}|${resolvedCode}|`;
      for (const item of catalogProduct?.nplItems || []) {
        const materialKey = normalizeProductCodeKey(item.code);
        if (!materialKey) continue;
        const componentWeightKg = catalogProduct
          ? resolveProductNplItemWeightKg(catalogProduct, item, input.materials)
          : null;
        const expectedKg =
          componentWeightKg !== null && componentWeightKg > 0
            ? roundQty(componentWeightKg * inboundQty, 4)
            : null;
        if (expectedKg === null || expectedKg <= 0) continue;

        const rate =
          item.amountType === 'quantity'
            ? Math.max(0, item.quantity ?? 0)
            : Math.max(0, item.percent ?? 0);
        const rawExpectedQuantity =
          item.amountType === 'quantity'
            ? roundQuantityByUnit(rate * inboundQty, item.unit || '')
            : expectedKg;
        const catalogKgPerUnit =
          item.amountType === 'quantity' && !isWarehouseKgUnit(item.unit || '')
            ? findMaterialTongKgPerUnit(item.code, materialsCatalog)
            : null;
        // Công thức định mức để hiển thị khi bấm vào ô (SL thành phẩm từ báo cáo sản lượng).
        const materialNorm: BbMaterialNormFormula = {
          productCode: productGroup.productCode,
          productName: productGroup.productName,
          productQuantity: inboundQty,
          productUnit: productGroup.unit || 'SP',
          productNormKgPerUnit: unitNorm,
          materialCode: item.code,
          materialName: item.name || item.code,
          amountType: item.amountType,
          rate,
          rateUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : '%',
          rawExpectedQuantity,
          rawExpectedUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : 'kg',
          catalogKgPerUnit,
          componentWeightKg,
          totalNormKg: expectedKg,
          allocationRatio: 1,
          allocatedNormKg: expectedKg
        };

        const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
        productGroup.lines.push({
          key: `${movementPrefix}${materialKey}|${report.id}`,
          slipLineKey: `${movementPrefix}${materialKey}`,
          ngay: reportDate,
          shift: report.ca,
          shiftLabel: formatProductionOrderShiftLabel(report.ca, lookupSettings),
          orderCode: header.orderCode,
          machine: header.machine,
          slipCode: report.id || 'bao-cao-san-luong',
          itemCode: item.code,
          itemName: item.name || item.code,
          unit: item.unit || 'kg',
          // SL "cái" chỉ có nghĩa với định mức loại số lượng; loại % chỉ tính vào trọng lượng.
          quantity:
            item.amountType === 'quantity'
              ? roundQuantityByUnit(Math.max(0, item.quantity ?? 0) * inboundQty, item.unit || '')
              : 0,
          normQuantity:
            item.amountType === 'quantity'
              ? roundQuantityByUnit(Math.max(0, item.quantity ?? 0) * inboundQty, item.unit || '')
              : 0,
          normWeightKg: expectedKg,
          materialNorm,
          weightKg: expectedKg,
          weightFormula: null,
          matchedByOrder: true,
          balanceDetail: null
        });
      }
    }

    // ==== Hiệu chỉnh theo cân bằng vật tư thực tế của cả ca ====
    // Trọng lượng thực nhập (kg) = [Tồn đầu đã trộn + chưa trộn] + [Xuất thực tế]
    //   − [Xuất thực tế hàng lỗi hỏng, phân bổ theo nhóm nhựa/lõi] − [Tồn cuối ca]
    // Mỗi mã NVL hiển thị đúng bằng số cân bằng thực tế cả ca đó (không nhân/chia theo % định mức
    // BOM); nếu 1 mã NVL dùng chung cho nhiều thành phẩm trong cùng lệnh thì mỗi thành phẩm hiển
    // thị lại đúng số đó (không bị chia nhỏ theo tỉ lệ định mức).
    {
      const daTronChuaTronMaps = sumMachineNvlDaTronChuaTronKgByCodeForHeader(
        input.machineNvlReports,
        header,
        shiftOptions
      );
      const tonCuoiMaps = sumMachineNvlKgByCodeForHeader(input.machineNvlReports, header, shiftOptions, 'cuoi_ca');
      const xuatThucTeMaps = sumWarehouseExportKgByCodeForHeader(
        input.warehouseMovements,
        header,
        shiftOptions,
        input.materials
      );
      const damagedTabTotalKg = sumBbDamagedGoodsTabTotalKgForHeader(
        input.damagedRecords,
        header,
        shiftOptions
      );
      const mixingTiLeMaps = buildMixingTiLeTronMapsForHeader(
        input.mixingReports,
        header,
        input.shiftSettings
      );
      // Tồn đầu thường được ghi nhận gộp dưới mã NNS-TRON (hỗn hợp chưa tách) thay vì từng NVL
      // riêng lẻ — phải phân bổ ngược về từng mã theo tỉ lệ TB thực tế của ca hiện tại,
      // giống hệt cách tab "Tổng vật tư thực xuất dùng" đang làm, để không bị thiếu tồn đầu.
      const nnsTronTonDauKg = lookupNnsTronTonDauKg(daTronChuaTronMaps);
      const tonDauAllocation = buildBbTonDauAllocationContext({
        header,
        machines: input.machines,
        mixingReports: input.mixingReports,
        shiftOptions,
        nnsTronTonDauKg
      });

      const materialAgg = new Map<
        string,
        { lines: BbWarehouseExportLineRow[]; theoreticalKg: number; code: string; name: string }
      >();
      for (const productGroup of productMap.values()) {
        for (const line of productGroup.lines) {
          const key = normalizeProductCodeKey(line.itemCode) || normalizeProductCodeKey(line.itemName);
          if (!key) continue;
          let agg = materialAgg.get(key);
          if (!agg) {
            agg = { lines: [], theoreticalKg: 0, code: line.itemCode, name: line.itemName };
            materialAgg.set(key, agg);
          }
          agg.lines.push(line);
          agg.theoreticalKg += line.normWeightKg || 0;
        }
      }

      const realKg = new Map<string, number>();
      const balanceDetailByMaterial = new Map<string, BbInboundMaterialBalanceDetail>();
      for (const [key, agg] of materialAgg.entries()) {
        const directDaTron = lookupMachineNvlKgByMaterial(daTronChuaTronMaps, agg.code, agg.name);
        const tonDauResolved = tonDauAllocation.resolveTonDau(agg.code, agg.name, directDaTron);
        const daTron = tonDauResolved.tonDauKg;
        const xuat = lookupMachineNvlKgByMaterial(xuatThucTeMaps, agg.code, agg.name);
        const tonCuoi = lookupMachineNvlKgByMaterial(tonCuoiMaps, agg.code, agg.name);
        // Giống tab «Dữ liệu trong báo cáo lỗi hỏng»: Tổng lỗi hỏng × Tỉ lệ trộn (%).
        const tiLeTronPercent = lookupMixingTiLeTronPercent(mixingTiLeMaps, agg.code, agg.name);
        const deduction =
          tiLeTronPercent !== null && tiLeTronPercent > 0 && damagedTabTotalKg > 0
            ? damagedTabTotalKg * (tiLeTronPercent / 100)
            : 0;
        const base = daTron + xuat - tonCuoi;
        const real = Math.max(0, base - deduction);
        realKg.set(key, real);
        const grp = classifyBbMaterialGroup(agg.code, agg.name);
        balanceDetailByMaterial.set(key, {
          tonDauKg: roundQty(daTron, 4),
          tonDauFromNnsTron: tonDauResolved.fromNnsTron,
          tonDauDirectKg: roundQty(directDaTron, 4),
          nnsTronTonDauKg: roundQty(tonDauAllocation.nnsTronTonDauKg, 4),
          tiLeThucTeTbPercent: tonDauResolved.tiLeThucTeTbPercent,
          xuatThucTeKg: roundQty(xuat, 4),
          loiHongKg: roundQty(deduction, 4),
          loiHongGroup: grp,
          loiHongGroupTotalKg: damagedTabTotalKg,
          loiHongBaseKg: roundQty(Math.max(0, base), 3),
          loiHongGroupBaseSumKg: 0,
          loiHongTiLeTronPercent: tiLeTronPercent,
          tonCuoiKg: roundQty(tonCuoi, 4),
          realKg: roundQty(real, 4)
        });
      }

      // Không chia nhỏ theo tỉ lệ định mức BOM giữa các thành phẩm nữa: mỗi mã NVL hiển thị đúng
      // bằng tổng cân bằng vật tư thực tế cả ca của nó (real). Nếu 1 mã NVL dùng chung cho nhiều
      // thành phẩm trong cùng lệnh, mỗi thành phẩm hiển thị lại đúng số real đó (không bị chia nhỏ);
      // riêng nhiều dòng của CÙNG 1 thành phẩm (VD nhiều phiếu báo cáo sản lượng cùng ngày/ca) vẫn
      // được prorate theo tỉ lệ định mức riêng của các dòng đó để cộng lại đúng bằng real.
      for (const productGroup of productMap.values()) {
        const productMaterialAgg = new Map<string, { lines: BbWarehouseExportLineRow[]; theoreticalKg: number }>();
        for (const line of productGroup.lines) {
          const key = normalizeProductCodeKey(line.itemCode) || normalizeProductCodeKey(line.itemName);
          if (!key) continue;
          let agg = productMaterialAgg.get(key);
          if (!agg) {
            agg = { lines: [], theoreticalKg: 0 };
            productMaterialAgg.set(key, agg);
          }
          agg.lines.push(line);
          agg.theoreticalKg += line.normWeightKg || 0;
        }
        for (const [key, agg] of productMaterialAgg.entries()) {
          const real = realKg.get(key) ?? 0;
          const theoretical = agg.theoreticalKg;
          const balanceDetail = balanceDetailByMaterial.get(key) ?? null;
          if (theoretical <= 0) {
            for (const line of agg.lines) line.balanceDetail = balanceDetail;
            continue;
          }
          const ratio = real / theoretical;
          for (const line of agg.lines) {
            const scaledWeight = roundQty((line.normWeightKg || 0) * ratio, 4);
            line.weightKg = scaledWeight;
            line.normWeightKg = scaledWeight;
            line.balanceDetail = balanceDetail;
            if (line.materialNorm) {
              line.materialNorm = { ...line.materialNorm, allocationRatio: ratio, allocatedNormKg: scaledWeight };
            }
          }
        }
      }
    }

    const productGroups = [...productMap.values()]
      .map(productGroup => {
        productGroup.normWeightKg = productGroup.lines.reduce(
          (sum, line) => sum + (line.normWeightKg || 0),
          0
        );
        return productGroup;
      })
      .filter(productGroup => productGroup.quantity > 0 || productGroup.lines.length > 0);
    if (productGroups.length === 0) continue;

    const groupKey = header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`;
    groups.push({
      groupKey,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel: formatProductionOrderShiftLabel(header.shift, lookupSettings),
      machine: header.machine,
      lineCount: productGroups.reduce((sum, productGroup) => sum + productGroup.lineCount, 0),
      quantity: productGroups.reduce((sum, productGroup) => sum + productGroup.quantity, 0),
      totalNormWeightKg: roundInboundDisplayKg(
        productGroups.reduce(
          (sum, productGroup) => sum + sumBbInboundTheoreticalNormKgForProductGroup(productGroup),
          0
        ),
        2
      ),
      totalWeightKg: productGroups.reduce((sum, productGroup) => sum + productGroup.totalWeightKg, 0),
      unmatchedCount: 0,
      lines: productGroups.flatMap(productGroup => productGroup.lines),
      productGroups
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

type WarehouseProductAllocation = BbWarehouseExportProductGroup & {
  /** KL định mức (kg) theo mã NVL — đã quy đổi từ kho NVL nếu ĐVT ≠ kg. */
  materialWeights: Map<string, number>;
  /** Chi tiết phép tính định mức để hiển thị khi người dùng bấm vào số. */
  materialFormulas: Map<string, BbMaterialNormFormula>;
  /** Mã NVL có trong Thành phần (kể cả khi chưa quy đổi được kg). */
  materialKeys: Set<string>;
  usedQuotaAllocation: boolean;
};

/**
 * Chia dòng NVL xuất kho về từng sản phẩm trong lệnh.
 * ĐVT kg: %_i = SL_SP_i / Σ SL_SP → SL/KL thực xuất = % × phiếu xuất (phần cuối nhận dư).
 * ĐVT ≠ kg: SL thực xuất = SL định mức (SL đặt × Thành phần), không chia % phiếu.
 * Định mức (KL) vẫn tính theo Thành phần × SL từng SP.
 */
function buildBbWarehouseExportProductGroups(
  group: BbWarehouseExportGroup,
  productionOrders: ProductionOrderRow[],
  products: ProductRow[],
  materials: MaterialRow[] = []
): BbWarehouseExportProductGroup[] {
  const materialsCatalog = materials.map(mapMaterialToWeightCatalogItem);
  const orderCodes = group.orderCode
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const codeSet = new Set(orderCodes.map(code => code.toUpperCase()));
  const relatedOrders = productionOrders.filter(order => {
    if (codeSet.size > 0 && !codeSet.has(String(order.code || '').trim().toUpperCase())) return false;
    const ngay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (group.ngay && ngay && ngay !== group.ngay) return false;
    return shiftNamesMatch(order.shift, group.shift);
  });

  type ProductDraft = WarehouseProductAllocation & {
    catalogProduct: ProductRow | null | undefined;
  };
  const productMap = new Map<string, ProductDraft>();
  relatedOrders.forEach(order => {
    getProductionOrderProductLines(order).forEach((line, lineIndex) => {
      const productCode = String(line.productCode || '').trim();
      const productName = String(line.productName || '').trim();
      const productKey = normalizeProductCodeKey(productCode) || `__product_${lineIndex}`;
      const orderQuantity = Math.max(0, parseProductionOrderQuantity(line.quantity));
      const catalogProduct = findProductByCode(products, productCode);
      let productGroup = productMap.get(productKey);
      if (!productGroup) {
        productGroup = {
          productKey,
          productCode,
          productName: productName || catalogProduct?.name || productCode,
          unit: String(line.unit || catalogProduct?.unit || '').trim(),
          orderQuantity: 0,
          catalogProduct,
          normKgPerUnit: resolveProductUnitNormKg(catalogProduct),
          normWeightKg: 0,
          lineCount: 0,
          quantity: 0,
          totalWeightKg: 0,
          allocationMode: 'direct',
          lines: [],
          materialWeights: new Map<string, number>(),
          materialFormulas: new Map<string, BbMaterialNormFormula>(),
          materialKeys: new Set<string>(),
          usedQuotaAllocation: false
        };
        productMap.set(productKey, productGroup);
      }
      productGroup.orderQuantity += orderQuantity;
      if (!productGroup.unit) {
        productGroup.unit = String(line.unit || catalogProduct?.unit || '').trim();
      }
      if (catalogProduct) productGroup.catalogProduct = catalogProduct;
    });
  });

  for (const productGroup of productMap.values()) {
    const orderQuantity = Math.max(0, productGroup.orderQuantity);
    const catalogProduct = productGroup.catalogProduct;
    const resolvedNormKg = resolveProductUnitNormKg(catalogProduct);
    if (resolvedNormKg !== null && resolvedNormKg > 0) {
      productGroup.normKgPerUnit = resolvedNormKg;
      productGroup.normWeightKg = resolvedNormKg * orderQuantity;
    }
    for (const item of catalogProduct?.nplItems || []) {
      const materialKey = normalizeProductCodeKey(item.code);
      if (!materialKey) continue;
      productGroup.materialKeys.add(materialKey);
      // Khối lượng (kg) đúng cột "Khối lượng (kg)" trong bảng Thành phần (per 1 SP).
      const componentWeightKg = catalogProduct
        ? resolveProductNplItemWeightKg(catalogProduct, item, materials)
        : null;
      const expectedKg = resolveBomExpectedKg(item, orderQuantity, resolvedNormKg, materialsCatalog);
      if (expectedKg === null) continue;
      const rate =
        item.amountType === 'quantity'
          ? Math.max(0, item.quantity ?? 0)
          : Math.max(0, item.percent ?? 0);
      const rawExpectedQuantity =
        item.amountType === 'quantity'
          ? roundQuantityByUnit(rate * orderQuantity, item.unit || '')
          : expectedKg;
      const catalogKgPerUnit =
        item.amountType === 'quantity' && !isWarehouseKgUnit(item.unit || '')
          ? findMaterialTongKgPerUnit(item.code, materialsCatalog)
          : null;
      // KL định mức: ưu tiên quy đổi từ SL đã làm tròn (ĐVT ≠ kg)
      const totalNormKg =
        item.amountType === 'quantity' &&
        !isWarehouseKgUnit(item.unit || '') &&
        catalogKgPerUnit !== null &&
        catalogKgPerUnit > 0
          ? roundQty(rawExpectedQuantity * catalogKgPerUnit, 4)
          : expectedKg;
      productGroup.materialWeights.set(
        materialKey,
        (productGroup.materialWeights.get(materialKey) ?? 0) + totalNormKg
      );
      productGroup.materialFormulas.set(materialKey, {
        productCode: productGroup.productCode,
        productName: productGroup.productName,
        productQuantity: orderQuantity,
        productUnit: productGroup.unit || 'SP',
        productNormKgPerUnit: resolvedNormKg,
        materialCode: item.code,
        materialName: item.name || item.code,
        amountType: item.amountType,
        rate,
        rateUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : '%',
        rawExpectedQuantity,
        rawExpectedUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : 'kg',
        catalogKgPerUnit,
        componentWeightKg,
        totalNormKg,
        allocationRatio: 1,
        allocatedNormKg: totalNormKg
      });
    }
  }

  const productGroups = [...productMap.values()];
  const unassigned: WarehouseProductAllocation = {
    productKey: '__unassigned__',
    productCode: '',
    productName: 'Chưa xác định sản phẩm',
    unit: '',
    orderQuantity: 0,
    normKgPerUnit: null,
    normWeightKg: 0,
    lineCount: 0,
    quantity: 0,
    totalWeightKg: 0,
    allocationMode: 'unassigned',
    lines: [],
    materialWeights: new Map<string, number>(),
    materialFormulas: new Map<string, BbMaterialNormFormula>(),
    materialKeys: new Set<string>(),
    usedQuotaAllocation: false
  };

  const addAllocatedLine = (
    target: WarehouseProductAllocation,
    row: BbWarehouseExportLineRow,
    allocatedQuantity: number,
    allocatedWeightKg: number | null,
    suffix: string,
    allocationRatio = 1,
    bomShare: ExportAllocationBomShare | null = null
  ) => {
    const qty = allocatedQuantity > 0 ? allocatedQuantity : 0;
    const weightKg =
      allocatedWeightKg === null ? null : allocatedWeightKg > 0 ? allocatedWeightKg : 0;
    target.lines.push({
      ...row,
      key: `${row.slipLineKey}|${suffix}`,
      slipLineKey: row.slipLineKey,
      quantity: qty,
      weightKg,
      normQuantity: null,
      normWeightKg: null,
      materialNorm: null,
      weightFormula: allocateExportWeightFormula(
        row.weightFormula,
        qty,
        weightKg,
        allocationRatio,
        bomShare
      )
    });
    target.quantity += qty;
    target.totalWeightKg += weightKg && weightKg > 0 ? weightKg : 0;
    target.lineCount += 1;
  };

  /** Nhu cầu phân bổ = SL SP × Thành phần (số lượng) hoặc KL ĐM (loại %). */
  const resolveAllocationDemand = (
    product: WarehouseProductAllocation,
    materialKey: string
  ): ExportAllocationBomShare => {
    const formula = materialKey ? product.materialFormulas.get(materialKey) ?? null : null;
    if (formula) {
      const demand =
        formula.amountType === 'quantity'
          ? Math.max(0, formula.rawExpectedQuantity)
          : Math.max(0, formula.totalNormKg);
      return {
        productQuantity: Math.max(0, formula.productQuantity),
        productUnit: formula.productUnit || product.unit || '',
        bomAmountType: formula.amountType,
        bomRate: Number.isFinite(formula.rate) ? formula.rate : null,
        bomRateUnit: formula.rateUnit || '',
        demandQuantity: demand,
        totalDemand: demand,
        allocWeightBase: 0,
        allocWeightTotal: 0
      };
    }
    const fallback = Math.max(0, product.orderQuantity);
    return {
      productQuantity: fallback,
      productUnit: product.unit || '',
      bomAmountType: null,
      bomRate: null,
      bomRateUnit: '',
      demandQuantity: fallback,
      totalDemand: fallback,
      allocWeightBase: 0,
      allocWeightTotal: 0
    };
  };

  /**
   * ĐVT kg: % = SL_SP / Σ SL_SP; SL/KL thực xuất = % × phiếu (phần cuối nhận dư).
   * ĐVT ≠ kg: tạm gắn dòng theo phiếu; sau đó syncNonKgActualQuantityToNorm ghi đè = định mức.
   */
  const allocateExportByProductShare = (
    targets: WarehouseProductAllocation[],
    row: BbWarehouseExportLineRow
  ) => {
    if (targets.length === 0) return;
    const materialKey = normalizeProductCodeKey(row.itemCode);
    const bomShares = targets.map(product => resolveAllocationDemand(product, materialKey));
    const totalOrderQty = targets.reduce((sum, product) => sum + Math.max(0, product.orderQuantity), 0);
    // % phân bổ lấy theo KL định mức (SL đặt × ĐM kg) của từng SP; thiếu ĐM thì lùi về SL đặt.
    const totalNormWeight = targets.reduce((sum, product) => sum + Math.max(0, product.normWeightKg || 0), 0);
    const useNormWeight = totalNormWeight > 0;
    const sharesWithTotal = bomShares.map((share, index) => ({
      ...share,
      productQuantity: Math.max(0, targets[index]?.orderQuantity ?? share.productQuantity),
      totalDemand: totalOrderQty > 0 ? totalOrderQty : share.totalDemand,
      allocWeightBase: Math.max(0, targets[index]?.normWeightKg || 0),
      allocWeightTotal: totalNormWeight
    }));

    if (targets.length === 1) {
      targets[0].usedQuotaAllocation = false;
      addAllocatedLine(
        targets[0],
        row,
        row.quantity,
        row.weightKg,
        targets[0].productKey,
        1,
        sharesWithTotal[0] || null
      );
      return;
    }

    let assignedQty = 0;
    let assignedKg = 0;
    const rowQty = Math.max(0, row.quantity);
    const rowKg = row.weightKg !== null && row.weightKg > 0 ? row.weightKg : 0;
    const qtyIsNonKg = !isWarehouseKgUnit(row.unit || '');

    targets.forEach((product, index) => {
      const isLast = index === targets.length - 1;
      const orderQty = Math.max(0, product.orderQuantity);
      const normWeight = Math.max(0, product.normWeightKg || 0);
      // % phân bổ = KL định mức SP ÷ tổng KL định mức; thiếu ĐM thì dùng SL đặt.
      const ratio = useNormWeight
        ? normWeight / totalNormWeight
        : totalOrderQty > 0
          ? orderQty / totalOrderQty
          : 1 / targets.length;
      // ĐVT ≠ kg: SL phân bổ tạm (sẽ ghi đè = định mức); kg giữ thập phân theo % KL định mức
      const qtyShare = isLast
        ? qtyIsNonKg
          ? roundNonKgQuantityToInt(rowQty - assignedQty)
          : roundQty(rowQty - assignedQty)
        : qtyIsNonKg
          ? roundNonKgQuantityToInt(rowQty * ratio)
          : roundQty(rowQty * ratio);
      const kgShare =
        row.weightKg === null
          ? null
          : isLast
            ? roundQty(rowKg - assignedKg)
            : roundQty(rowKg * ratio);
      if (qtyShare > 0) assignedQty += qtyShare;
      if (kgShare !== null && kgShare > 0) assignedKg += kgShare;
      product.usedQuotaAllocation = true;
      addAllocatedLine(
        product,
        row,
        qtyShare,
        kgShare,
        product.productKey,
        ratio,
        sharesWithTotal[index] || null
      );
    });
  };

  for (const row of group.lines) {
    if (productGroups.length === 1) {
      allocateExportByProductShare(productGroups, row);
      continue;
    }

    const materialKey = normalizeProductCodeKey(row.itemCode);
    const matchedProducts = productGroups.filter(product => product.materialKeys.has(materialKey));
    if (matchedProducts.length === 0) {
      if (productGroups.length > 0) {
        allocateExportByProductShare(productGroups, row);
      } else {
        addAllocatedLine(unassigned, row, row.quantity, row.weightKg, 'unassigned');
      }
      continue;
    }

    // Nhiều SP cùng NVL: ĐVT kg → % theo SL_SP; ĐVT ≠ kg → sau đó = định mức
    allocateExportByProductShare(matchedProducts, row);
  }

  /** Gán KL định mức (kg) từng dòng NVL từ Thành phần (đã quy đổi ĐVT qua kho NVL). */
  const applyLineNormWeights = (target: WarehouseProductAllocation) => {
    const linesByMaterial = new Map<string, BbWarehouseExportLineRow[]>();
    for (const line of target.lines) {
      const materialKey = normalizeProductCodeKey(line.itemCode);
      if (!materialKey || !target.materialKeys.has(materialKey)) {
        line.normWeightKg = null;
        line.materialNorm = null;
        continue;
      }
      const bucket = linesByMaterial.get(materialKey);
      if (bucket) bucket.push(line);
      else linesByMaterial.set(materialKey, [line]);
    }

    for (const [materialKey, lines] of linesByMaterial) {
      const expected = Math.max(0, target.materialWeights.get(materialKey) ?? 0);
      const baseFormula = target.materialFormulas.get(materialKey) ?? null;
      const expectedNormQty =
        baseFormula && baseFormula.amountType === 'quantity'
          ? Math.max(0, baseFormula.rawExpectedQuantity)
          : null;
      const normQtyUnit = baseFormula?.rawExpectedUnit || lines[0]?.unit || '';

      const assignNorm = (
        line: BbWarehouseExportLineRow,
        value: number | null,
        normQty: number | null,
        ratio: number
      ) => {
        line.normWeightKg = value;
        line.normQuantity = normQty;
        line.materialNorm =
          baseFormula && value !== null
            ? { ...baseFormula, allocationRatio: ratio, allocatedNormKg: value }
            : null;
      };

      if (expected <= 0) {
        lines.forEach(line => {
          assignNorm(line, null, null, 0);
        });
        continue;
      }

      // NVL ĐVT = kg (thường khai báo dạng %): SL định mức = KL định mức (kg).
      const normQtyFromKg = (line: BbWarehouseExportLineRow, kgShare: number): number | null =>
        expectedNormQty === null && isWarehouseKgUnit(line.unit || '') ? kgShare : null;

      const totalQty = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
      if (totalQty <= 0) {
        const kgShare = roundQty(expected);
        assignNorm(lines[0], kgShare, expectedNormQty ?? normQtyFromKg(lines[0], kgShare), 1);
        lines.slice(1).forEach(line => {
          assignNorm(line, null, null, 0);
        });
        continue;
      }

      let assignedKg = 0;
      let assignedNormQty = 0;
      lines.forEach((line, index) => {
        const ratio = Math.max(0, line.quantity) / totalQty;
        const isLast = index === lines.length - 1;
        const kgShare = isLast ? roundQty(expected - assignedKg) : roundQty(expected * ratio);
        let qtyShare: number | null = null;
        if (expectedNormQty !== null) {
          qtyShare = isLast
            ? roundQuantityByUnit(expectedNormQty - assignedNormQty, normQtyUnit)
            : roundQuantityByUnit(expectedNormQty * ratio, normQtyUnit);
          if (qtyShare > 0) assignedNormQty += qtyShare;
        } else {
          qtyShare = normQtyFromKg(line, kgShare);
        }
        if (kgShare > 0) assignedKg += kgShare;
        assignNorm(line, kgShare, qtyShare, ratio);
      });
    }
  };

  /** ĐVT ≠ kg: SL thực xuất = đúng SL định mức; KL theo định mức (hoặc × Tổng kg kho NVL). */
  const syncNonKgActualQuantityToNorm = (target: WarehouseProductAllocation) => {
    for (const line of target.lines) {
      if (isWarehouseKgUnit(line.unit || '')) continue;
      if (line.normQuantity === null || !(line.normQuantity >= 0)) continue;
      const newQty = Math.max(0, line.normQuantity);
      let newKg =
        line.normWeightKg !== null && line.normWeightKg > 0 ? line.normWeightKg : null;
      if (newKg === null && newQty > 0) {
        const catalogKg = findMaterialTongKgPerUnit(line.itemCode, materialsCatalog);
        if (catalogKg !== null && catalogKg > 0) {
          newKg = roundQty(newQty * catalogKg, 4);
        }
      }
      line.quantity = newQty;
      line.weightKg = newKg;
      if (line.weightFormula) {
        const bom = line.materialNorm;
        line.weightFormula = {
          ...line.weightFormula,
          quantity: newQty,
          weightKg: newKg,
          allocationRatio: 1,
          productQuantity: bom?.productQuantity ?? line.weightFormula.productQuantity,
          productUnit: bom?.productUnit || line.weightFormula.productUnit,
          bomAmountType: bom?.amountType ?? line.weightFormula.bomAmountType,
          bomRate: bom?.rate ?? line.weightFormula.bomRate,
          bomRateUnit: bom?.rateUnit || line.weightFormula.bomRateUnit,
          demandQuantity: newQty,
          totalDemand: newQty
        };
      }
    }
    target.quantity = target.lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
    target.totalWeightKg = target.lines.reduce(
      (sum, line) => sum + (line.weightKg && line.weightKg > 0 ? line.weightKg : 0),
      0
    );
  };

  applyLineNormWeights(unassigned);
  productGroups.forEach(applyLineNormWeights);
  syncNonKgActualQuantityToNorm(unassigned);
  productGroups.forEach(syncNonKgActualQuantityToNorm);

  if (unassigned.lines.length > 0) {
    productGroups.push({
      ...unassigned,
      catalogProduct: null
    });
  }
  return productGroups.map(product => {
    const {
      materialWeights: _materialWeights,
      materialFormulas: _materialFormulas,
      materialKeys: _materialKeys,
      usedQuotaAllocation,
      catalogProduct: _catalogProduct,
      ...rest
    } = product;
    return {
      ...rest,
      allocationMode:
        rest.allocationMode === 'unassigned' ? 'unassigned' : usedQuotaAllocation ? 'quota' : 'direct'
    };
  });
}

export type BbDamagedGoodsLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  documentNo: string;
  productCode: string;
  productName: string;
  materialCode: string;
  materialName: string;
  unit: string;
  /** Tổng trọng lượng NVL lỗi hỏng (kg) */
  weightKg: number;
  matchedByOrder: boolean;
};

export type BbDamagedGoodsGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  totalWeightKg: number;
  lines: BbDamagedGoodsLineRow[];
};

const DAMAGED_NVL_LABELS = [
  { code: 'NHUA-KM', name: 'Nhựa không mảng lỗi hỏng', field: 'nhuaKhongMang' as const },
  { code: 'NHUA-DN', name: 'Nhựa cục đầu nòng lỗi hỏng', field: 'nhuaCucDauNong' as const },
  { code: 'NHUA-DM', name: 'Nhựa lỗi dính màng', field: 'nhuaDinhMang' as const },
  { code: 'MANG-LH', name: 'Màng lỗi hỏng', field: 'mang' as const },
  { code: 'LOI-LH', name: 'Lõi dính trong hàng hỏng', field: 'loi' as const }
];

function matchBbNvlReportToOrderHeaders(
  report: Pick<MachineNvlSavedReport, 'ngay' | 'ca' | 'maMay' | 'tenMay'>,
  headers: Array<{ ngay: string; shift: string; orderCode: string; machine: string }>,
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
  const ngay = parseProductionOrderFilterDate(report.ngay);
  const relatedOrders = headers.filter(order =>
    matchesShiftSummaryBucket(order.ngay, order.shift, ngay || report.ngay, report.ca, shiftOptions)
  );
  if (relatedOrders.length === 0) return [];

  const machineMatched = relatedOrders.filter(
    order =>
      machineValueMatchesFilter(order.machine, null, report.maMay, report.tenMay) ||
      (isBbMachineText(report.maMay, report.tenMay) && isBbMachineText(order.machine))
  );
  if (machineMatched.length > 0) return machineMatched;

  // Phiếu tồn ca thường ghi "Máy Bao Bì" — vẫn gắn theo ngày + ca lệnh BB.
  if (isBbMachineText(report.maMay, report.tenMay) || relatedOrders.some(order => isBbMachineText(order.machine))) {
    return relatedOrders;
  }
  return relatedOrders;
}

function collectBbOrderHeaders(input: {
  productionOrders: ProductionOrderRow[];
  machines: MachineRow[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}) {
  const headers: Array<{
    ngay: string;
    shift: string;
    orderCode: string;
    machine: string;
  }> = [];
  const seen = new Set<string>();

  for (const order of input.productionOrders) {
    if (!isBbProductionOrder(order, input.machines, input.includeAllMachines)) continue;
    const ngay = parseProductionOrderFilterDate(order.startDate);
    if (!matchesControlBoardDateRange(ngay || order.startDate, input.dateFrom, input.dateTo)) continue;
    const machineLabel = resolveProductionOrderMachine(order, input.machines);
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        order.machine,
        order.position,
        machineLabel
      )
    ) {
      continue;
    }
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(order.shift, input.shiftFilter)) {
      continue;
    }
    const key = `${order.code}|${ngay}|${order.shift}`;
    if (seen.has(key)) continue;
    seen.add(key);
    headers.push({
      ngay: ngay || '',
      shift: order.shift,
      orderCode: order.code,
      machine: machineLabel
    });
  }

  return headers;
}

type BbOrderHeader = {
  ngay: string;
  shift: string;
  orderCode: string;
  machine: string;
};

/** Gộp các header cùng ngày + ca thành 1 (nối số lệnh & máy) — dùng khi khớp phiếu theo ngày/ca. */
function mergeBbHeadersByShift(headers: BbOrderHeader[]): BbOrderHeader[] {
  const map = new Map<string, BbOrderHeader & { orderCodes: string[]; machines: string[] }>();
  for (const header of headers) {
    const key = `${header.ngay}|${header.shift}`;
    let merged = map.get(key);
    if (!merged) {
      merged = { ...header, orderCodes: [], machines: [] };
      map.set(key, merged);
    }
    if (header.orderCode && !merged.orderCodes.includes(header.orderCode)) {
      merged.orderCodes.push(header.orderCode);
    }
    if (header.machine && !merged.machines.includes(header.machine)) {
      merged.machines.push(header.machine);
    }
  }
  return [...map.values()].map(merged => ({
    ngay: merged.ngay,
    shift: merged.shift,
    orderCode: merged.orderCodes.join(', '),
    machine: merged.machines.join(', ')
  }));
}

export type BbOrderCodeOption = {
  code: string;
  ngay: string;
  shiftLabel: string;
  machine: string;
  label: string;
};

/** DS số lệnh SX máy BB (theo bộ lọc ngày/ca/máy hiện tại) để chọn tickbox nhiều lệnh. */
export function buildBbOrderCodeOptions(input: {
  productionOrders: ProductionOrderRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbOrderCodeOption[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const seen = new Set<string>();
  const options: BbOrderCodeOption[] = [];

  for (const order of input.productionOrders) {
    if (!isBbProductionOrder(order, input.machines, input.includeAllMachines)) continue;
    const code = String(order.code || '').trim();
    if (!code || seen.has(code)) continue;
    const ngay = parseProductionOrderFilterDate(order.startDate);
    if (!matchesControlBoardDateRange(ngay || order.startDate, input.dateFrom, input.dateTo)) continue;
    const machineLabel = resolveProductionOrderMachine(order, input.machines);
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        order.machine,
        order.position,
        machineLabel
      )
    ) {
      continue;
    }
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(order.shift, input.shiftFilter)) {
      continue;
    }
    seen.add(code);
    const shiftLabel = formatProductionOrderShiftLabel(order.shift, lookupSettings);
    options.push({
      code,
      ngay: ngay || '',
      shiftLabel,
      machine: machineLabel,
      label: ngay ? `${code} · ${ngay}` : code
    });
  }

  return options.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.code.localeCompare(b.code, 'vi');
  });
}

/** Dòng NVL từ báo cáo lỗi hỏng gắn lệnh BB (ngày + ca + máy BB). */
export function buildBbDamagedGoodsLineRows(input: {
  productionOrders: ProductionOrderRow[];
  damagedRecords: WeighingRecord[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbDamagedGoodsLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const rows: BbDamagedGoodsLineRow[] = [];

  for (const record of getWeighingDataRows(input.damagedRecords)) {
    const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
    if (!matchesControlBoardDateRange(ngay || record.productionDate, input.dateFrom, input.dateTo)) continue;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(record.shiftName, input.shiftFilter)) {
      continue;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        record.machineName
      )
    ) {
      continue;
    }

    const relatedOrders = headers.filter(order =>
      matchesShiftSummaryBucket(order.ngay, order.shift, ngay || record.productionDate, record.shiftName, shiftOptions)
    );
    if (relatedOrders.length === 0) continue;

    const machineMatched = relatedOrders.filter(
      order =>
        machineValueMatchesFilter(order.machine, null, record.machineName) ||
        (isBbMachineText(record.machineName) && isBbMachineText(order.machine))
    );
    const matchedOrders =
      machineMatched.length > 0
        ? machineMatched
        : isBbMachineText(record.machineName)
          ? relatedOrders
          : [];
    if (matchedOrders.length === 0) continue;

    const orderCode = [...new Set(matchedOrders.map(order => order.orderCode).filter(Boolean))].join(', ');
    const machine =
      String(record.machineName || '').trim() ||
      [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))].join(', ');
    const shiftLabel = formatProductionOrderShiftLabel(record.shiftName, lookupSettings);

    if (isDamagedOtherMaterial(record)) {
      const materialCode = String(record.materialCode || '').trim();
      const weightKg = resolveDamagedOtherMaterialKg(record);
      if (!materialCode && !(Number.isFinite(weightKg) && weightKg > 0)) continue;
      rows.push({
        key: `${record.id || record.documentNo}|other|${materialCode}|${ngay}|${record.shiftName}`,
        ngay: ngay || '',
        shift: record.shiftName,
        shiftLabel,
        orderCode,
        machine,
        documentNo: record.documentNo || '',
        productCode: record.productCode || '',
        productName: record.productName || '',
        materialCode,
        materialName: materialCode || 'Vật tư khác',
        unit: 'kg',
        weightKg: roundQty(weightKg > 0 ? weightKg : 0, 4),
        matchedByOrder: true
      });
      continue;
    }

    const split = splitDamagedGoodsDefectWeights(record);
    if (!Number.isFinite(split.tong) || split.tong <= 0) continue;

    for (const item of DAMAGED_NVL_LABELS) {
      const weightKg = split[item.field];
      if (!Number.isFinite(weightKg) || weightKg <= 0) continue;
      rows.push({
        key: `${record.id || record.documentNo}|${item.code}|${ngay}|${record.shiftName}`,
        ngay: ngay || '',
        shift: record.shiftName,
        shiftLabel,
        orderCode,
        machine,
        documentNo: record.documentNo || '',
        productCode: record.productCode || '',
        productName: record.productName || '',
        materialCode: item.code,
        materialName: item.name,
        unit: 'kg',
        weightKg: roundQty(weightKg, 4),
        matchedByOrder: true
      });
    }
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    const docCmp = (a.documentNo || '').localeCompare(b.documentNo || '', 'vi');
    if (docCmp !== 0) return docCmp;
    return a.materialName.localeCompare(b.materialName, 'vi');
  });
}

export function sumBbDamagedGoodsWeightKg(rows: BbDamagedGoodsLineRow[]) {
  return rows.reduce((sum, row) => sum + (row.weightKg > 0 ? row.weightKg : 0), 0);
}

/** Chuẩn hóa `loai_vat_tu` trên phiếu báo cáo sản lượng (`bao_cao_nghiem_thu`). */
function normalizeAcceptanceLoaiVatTuKey(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** SP lỗi (Hàng hỏng) trên Báo cáo sản lượng. */
export function isAcceptanceSpLoiLoai(loaiVatTu?: string | null): boolean {
  const key = normalizeAcceptanceLoaiVatTuKey(loaiVatTu);
  if (!key) return false;
  if (key.includes('sp rac') || key === 'rac') return false;
  return (
    key === 'sp loi' ||
    key.includes('sp loi') ||
    key.includes('hang loi') ||
    key.includes('loi hong') ||
    key.includes('hang hong')
  );
}

/** SP rác (Kho rác) trên Báo cáo sản lượng. */
export function isAcceptanceSpRacLoai(loaiVatTu?: string | null): boolean {
  const key = normalizeAcceptanceLoaiVatTuKey(loaiVatTu);
  if (!key) return false;
  return key === 'sp rac' || key.includes('sp rac') || key.includes('kho rac') || key.includes('hang rac');
}

function acceptanceReportWeightKg(report: AcceptanceReport): number {
  const raw = report.trong_luong;
  const num = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return 0;
  const unit = String(report.don_vi_trong_luong || '').trim().toLowerCase();
  // Phiếu báo cáo sản lượng lưu trọng lượng theo kg.
  if (!unit || unit === 'kg' || unit === 'kgs' || unit === 'kilogram') return num;
  return num;
}

/**
 * Ô «Báo cáo lỗi hỏng» trên báo cáo máy BB:
 * lấy từ Báo cáo sản lượng — mục SP lỗi (hàng lỗi hỏng) + SP rác.
 * - Trọng lượng nhựa = Σ trọng lượng phiếu SP lỗi
 * - Vật tư khác = Σ trọng lượng phiếu SP rác
 */
export function sumBbSanLuongLoiHongVaRacWeightByKind(input: {
  acceptanceReports: AcceptanceReport[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): { plasticKg: number; otherKg: number } {
  let plasticKg = 0;
  let otherKg = 0;
  for (const report of input.acceptanceReports || []) {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (!matchesControlBoardDateRange(ngay, input.dateFrom, input.dateTo)) continue;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(report.ca, input.shiftFilter)) {
      continue;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        report.ma_may,
        report.ten_may
      )
    ) {
      continue;
    }
    if (!input.includeAllMachines && !isBbMachineText(report.ma_may, report.ten_may)) continue;

    const kg = acceptanceReportWeightKg(report);
    if (kg <= 0) continue;
    if (isAcceptanceSpLoiLoai(report.loai_vat_tu)) plasticKg += kg;
    else if (isAcceptanceSpRacLoai(report.loai_vat_tu)) otherKg += kg;
  }
  return {
    plasticKg: roundQty(plasticKg, 4),
    otherKg: roundQty(otherKg, 4)
  };
}

/** Tổng số phiếu lỗi hỏng + trọng lượng (kg) trên tab báo cáo hàng lỗi hỏng. */
export function sumBbDamagedGoodsTotals(rows: BbDamagedGoodsLineRow[]) {
  const slips = new Set<string>();
  let weightKg = 0;
  for (const row of rows) {
    weightKg += row.weightKg > 0 ? row.weightKg : 0;
    slips.add(
      [String(row.documentNo || '').trim() || row.key, row.ngay, row.shift, row.orderCode].join('|')
    );
  }
  return { quantity: slips.size, weightKg };
}

export function groupBbDamagedGoodsLines(rows: BbDamagedGoodsLineRow[]): BbDamagedGoodsGroup[] {
  const map = new Map<string, BbDamagedGoodsGroup>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        machine: row.machine,
        lineCount: 1,
        totalWeightKg: row.weightKg > 0 ? row.weightKg : 0,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.totalWeightKg += row.weightKg > 0 ? row.weightKg : 0;
    existing.lines.push(row);
  }

  return [...map.values()].sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

/** Dòng NVL con từ báo cáo phối trộn cùng ngày + ca (kèm tỉ lệ trộn). */
export type BbDamagedMixingChildRow = {
  key: string;
  materialCode: string;
  materialName: string;
  unit: string;
  /** Tỉ lệ trộn (%) = KL NVL ca đó ÷ tổng KL mọi NVL ca đó × 100. */
  tiLeTronPercent: number | null;
  totalKlThucTe: number;
  batchCount: number;
};

export function buildBbMixingMaterialLinesForShift(input: {
  mixingReports: MixingReport[];
  ngay: string;
  shift: string;
  machine: string;
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): BbDamagedMixingChildRow[] {
  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  const stats = buildBbMixingShiftStats({
    mixingReports: input.mixingReports,
    headerMachine: input.machine,
    mixingNgay: input.ngay,
    mixingShift: input.shift,
    shiftOptions
  });

  return [...stats.byMaterial.entries()]
    .map(([materialKey, stat]) => ({
      key: `${input.ngay}|${input.shift}|${materialKey}`,
      materialCode: stat.materialCode,
      materialName: stat.materialName,
      unit: stat.unit || 'kg',
      tiLeTronPercent: resolveBbMixingShiftTiLeThucTeTbPercent(stat.klSum, stats.totalMixKg),
      totalKlThucTe: roundQty(stat.klSum, 4),
      batchCount: stat.batchCount
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName, 'vi'));
}

/** Dòng NVL tổng hợp thực xuất dùng — NVL từ báo cáo phối trộn ca đó + chỉ số thực dùng. */
export type BbTongHopThucXuatLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  materialCode: string;
  materialName: string;
  unit: string;
  tiLeTronPercent: number | null;
  tiLeDinhMucPercent: number | null;
  xuatTrongCaKg: number;
  tonDauKg: number;
  tonCuoiKg: number;
  thucDungKg: number;
  totalKlThucTe: number;
  /** Tỉ lệ phân bổ theo SP (1 = toàn ca / chưa phân SP). */
  share: number;
  productCode: string;
  productName: string;
  /** Giá trị trước phân bổ SP (toàn ca). */
  baseXuatTrongCaKg: number;
  baseTonDauKg: number;
  baseTonCuoiKg: number;
  baseThucDungKg: number;
  tonDauFromNnsTron: boolean;
  nnsTronTonDauKg: number | null;
  tiLeThucTeTbPercent: number | null;
};

export type BbTongHopThucXuatProductGroup = {
  key: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  /** Tỉ lệ phân bổ theo SL sản phẩm trên lệnh (0–1). */
  share: number;
  lineCount: number;
  tonDauTotal: number;
  xuatTotal: number;
  tonCuoiTotal: number;
  thucDungTotal: number;
  lines: BbTongHopThucXuatLineRow[];
};

export type BbTongHopThucXuatGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  productCount: number;
  xuatCaTotal: number;
  tonDauCaTotal: number;
  tonCuoiCaTotal: number;
  totalThucDungKg: number;
  productGroups: BbTongHopThucXuatProductGroup[];
  /** Flat NVL (không phân SP) — tổng ca trước khi phân bổ theo SP. */
  lines: BbTongHopThucXuatLineRow[];
};

function bbTabRowMatchesOrderHeader(
  row: { ngay: string; shift: string; orderCode: string },
  header: { ngay: string; shift: string; orderCode: string }
) {
  const rowNgay = parseProductionOrderFilterDate(row.ngay) || row.ngay;
  if (rowNgay !== header.ngay) return false;
  if (!shiftNamesMatch(row.shift, header.shift)) return false;
  const target = String(header.orderCode || '').trim();
  if (!target) return true;
  const codes = String(row.orderCode || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (codes.length === 0) return true;
  return codes.includes(target);
}

/** Gom kg từ dòng tab nguồn (tồn đầu / xuất kho / tồn cuối) theo lệnh + mã NVL. */
function buildKgMapsFromBbTabRowsForHeader(
  rows: Array<{
    ngay: string;
    shift: string;
    orderCode: string;
    itemCode?: string;
    itemName?: string;
    weightKg?: number | null;
  }>,
  header: { ngay: string; shift: string; orderCode: string }
) {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const row of rows) {
    if (!bbTabRowMatchesOrderHeader(row, header)) continue;
    const kg = Number(row.weightKg);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    const code = normalizeMaterialCodeKey(row.itemCode || '');
    const name = String(row.itemName || '')
      .trim()
      .toUpperCase();
    if (code) byCode.set(code, (byCode.get(code) || 0) + kg);
    else if (name) byName.set(name, (byName.get(name) || 0) + kg);
  }
  return { byCode, byName };
}

/** Tab Tổng hợp vật tư thực xuất dùng: NVL từ báo cáo phối trộn đúng ngày/ca.
 * Thực dùng (kg) = [Tồn đầu ca] + [Xuất thực tế] − [Tồn cuối ca]
 * Ba cột tồn/xuất lấy đúng số từ các tab đã có:
 * - Tồn đầu ca ← tab «Báo cáo dữ liệu tồn đầu ca»
 * - Xuất thực tế ← tab «Dữ liệu trong phiếu xuất kho vật tư»
 * - Tồn cuối ca ← tab «Dữ liệu trong báo cáo kiểm tồn cuối ca»
 */
export function buildBbTongHopVatTuThucXuatDungGroups(input: {
  productionOrders: ProductionOrderRow[];
  mixingReports: MixingReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbTongHopThucXuatGroup[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  const groups: BbTongHopThucXuatGroup[] = [];

  const tabFilter = {
    productionOrders: input.productionOrders,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter,
    selectedMachine: input.selectedMachine,
    includeAllMachines: input.includeAllMachines
  };
  const dauCaTabRows = buildBbDauCaLineRows({
    ...tabFilter,
    machineNvlReports: input.machineNvlReports
  });
  const cuoiCaTabRows = buildBbCuoiCaLineRows({
    ...tabFilter,
    machineNvlReports: input.machineNvlReports
  });
  const xuatKhoTabRows = buildBbWarehouseExportLineRows({
    ...tabFilter,
    warehouseMovements: input.warehouseMovements,
    materials: input.materials
  });

  for (const header of headers) {
    const mixingLines = buildBbMixingMaterialLinesForShift({
      mixingReports: input.mixingReports,
      ngay: header.ngay,
      shift: header.shift,
      machine: header.machine,
      shiftSettings: input.shiftSettings
    });
    if (mixingLines.length === 0) continue;

    const tonDauMaps = buildKgMapsFromBbTabRowsForHeader(dauCaTabRows, header);
    const tonCuoiMaps = buildKgMapsFromBbTabRowsForHeader(cuoiCaTabRows, header);
    const xuatThucTeMaps = buildKgMapsFromBbTabRowsForHeader(xuatKhoTabRows, header);

    const machineRow = findBbMachineByLabel(input.machines, header.machine);
    const machineRatioByCode = new Map<string, number>();
    const machineRatioByName = new Map<string, number>();
    if (machineRow) {
      for (const ratio of machineRow.mixingRatios) {
        const pct = Number(String(ratio.percent ?? '').trim().replace(',', '.'));
        if (!Number.isFinite(pct)) continue;
        const codeKey = normalizeProductCodeKey(ratio.materialCode);
        if (codeKey) machineRatioByCode.set(codeKey, pct);
        const nameKey = (ratio.materialName || '').trim().toLowerCase();
        if (nameKey) machineRatioByName.set(nameKey, pct);
      }
    }
    const resolveMachineDinhMuc = (code: string, name: string): number | null => {
      const codeKey = normalizeProductCodeKey(code);
      if (codeKey && machineRatioByCode.has(codeKey)) return machineRatioByCode.get(codeKey)!;
      const nameKey = (name || '').trim().toLowerCase();
      if (nameKey && machineRatioByName.has(nameKey)) return machineRatioByName.get(nameKey)!;
      return null;
    };

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    const groupKey = header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`;
    const baseLines: BbTongHopThucXuatLineRow[] = mixingLines.map(mix => {
      const materialKey = materialIdentityKey(mix.materialCode, mix.materialName);
      const tonDauRounded = roundQty(
        lookupMachineNvlKgByMaterial(tonDauMaps, mix.materialCode, mix.materialName),
        3
      );
      const xuatTrongCaKg = roundQty(
        lookupMachineNvlKgByMaterial(xuatThucTeMaps, mix.materialCode, mix.materialName),
        3
      );
      const tonCuoiKg = roundQty(
        lookupMachineNvlKgByMaterial(tonCuoiMaps, mix.materialCode, mix.materialName),
        3
      );
      // Thực dùng (kg) = Tồn đầu ca + Xuất thực tế − Tồn cuối ca
      const thucDungKg = roundQty(
        computeMaterialUsageKg(xuatTrongCaKg, tonDauRounded, tonCuoiKg),
        3
      );
      const fromMachine = resolveMachineDinhMuc(mix.materialCode, mix.materialName);
      return {
        key: `${groupKey}|${materialKey}`,
        ngay: header.ngay,
        shift: header.shift,
        shiftLabel,
        orderCode: header.orderCode,
        machine: header.machine,
        materialCode: mix.materialCode,
        materialName: mix.materialName,
        unit: mix.unit || 'kg',
        tiLeTronPercent: mix.tiLeTronPercent,
        tiLeDinhMucPercent: fromMachine === null ? null : roundQty(fromMachine, 4),
        xuatTrongCaKg,
        tonDauKg: tonDauRounded,
        tonCuoiKg,
        thucDungKg,
        totalKlThucTe: mix.totalKlThucTe,
        share: 1,
        productCode: '',
        productName: '',
        baseXuatTrongCaKg: xuatTrongCaKg,
        baseTonDauKg: tonDauRounded,
        baseTonCuoiKg: tonCuoiKg,
        baseThucDungKg: thucDungKg,
        tonDauFromNnsTron: false,
        nnsTronTonDauKg: null,
        tiLeThucTeTbPercent: null
      };
    });

    // Nhóm theo sản phẩm trên lệnh SX; phân bổ chỉ số theo tỉ lệ SL từng SP.
    const matchedOrders = input.productionOrders.filter(order => {
      if (!isBbProductionOrder(order, input.machines)) return false;
      if (String(order.code || '').trim() !== header.orderCode) return false;
      const ngay = parseProductionOrderFilterDate(order.startDate) || '';
      if (ngay !== header.ngay) return false;
      return shiftNamesMatch(order.shift, header.shift);
    });
    const productAgg = new Map<
      string,
      { productCode: string; productName: string; unit: string; quantity: number }
    >();
    for (const order of matchedOrders) {
      for (const line of getProductionOrderProductLines(order)) {
        const code = String(line.productCode || '').trim();
        const name = String(line.productName || '').trim();
        const key = normalizeProductCodeKey(code) || name.toUpperCase();
        if (!key) continue;
        const qty = parseProductionOrderQuantity(line.quantity);
        const existing = productAgg.get(key);
        if (!existing) {
          productAgg.set(key, {
            productCode: code,
            productName: name,
            unit: String(line.unit || '').trim(),
            quantity: qty > 0 ? qty : 0
          });
        } else {
          existing.quantity += qty > 0 ? qty : 0;
          if (!existing.productName && name) existing.productName = name;
          if (!existing.unit && line.unit) existing.unit = String(line.unit).trim();
        }
      }
    }
    const productList = [...productAgg.values()];
    const qtyTotal = productList.reduce((sum, p) => sum + (p.quantity > 0 ? p.quantity : 0), 0);
    const productGroups: BbTongHopThucXuatProductGroup[] =
      productList.length > 0
        ? productList.map(product => {
            const share =
              qtyTotal > 0 && product.quantity > 0
                ? product.quantity / qtyTotal
                : productList.length > 0
                  ? 1 / productList.length
                  : 1;
            const productKey =
              normalizeProductCodeKey(product.productCode) ||
              product.productName.toUpperCase() ||
              'sp';
            const lines = baseLines.map(line => {
              const tonDauKg = roundQty(line.baseTonDauKg * share, 4);
              const xuatTrongCaKg = roundQty(line.baseXuatTrongCaKg * share, 4);
              const tonCuoiKg = roundQty(line.baseTonCuoiKg * share, 4);
              const thucDungKg = roundQty(
                computeMaterialUsageKg(xuatTrongCaKg, tonDauKg, tonCuoiKg),
                3
              );
              return {
                ...line,
                key: `${groupKey}|${productKey}|${materialIdentityKey(line.materialCode, line.materialName)}`,
                share,
                productCode: product.productCode,
                productName: product.productName,
                tonDauKg,
                xuatTrongCaKg,
                tonCuoiKg,
                thucDungKg
              };
            });
            return {
              key: `${groupKey}|${productKey}`,
              productCode: product.productCode,
              productName: product.productName,
              unit: product.unit,
              quantity: product.quantity,
              share,
              lineCount: lines.length,
              tonDauTotal: lines.reduce((sum, l) => sum + l.tonDauKg, 0),
              xuatTotal: lines.reduce((sum, l) => sum + l.xuatTrongCaKg, 0),
              tonCuoiTotal: lines.reduce((sum, l) => sum + l.tonCuoiKg, 0),
              thucDungTotal: lines.reduce((sum, l) => sum + l.thucDungKg, 0),
              lines
            };
          })
        : [
            {
              key: `${groupKey}|unassigned`,
              productCode: '',
              productName: 'Chưa gắn sản phẩm',
              unit: '',
              quantity: 0,
              share: 1,
              lineCount: baseLines.length,
              tonDauTotal: baseLines.reduce((sum, l) => sum + l.tonDauKg, 0),
              xuatTotal: baseLines.reduce((sum, l) => sum + l.xuatTrongCaKg, 0),
              tonCuoiTotal: baseLines.reduce((sum, l) => sum + l.tonCuoiKg, 0),
              thucDungTotal: baseLines.reduce((sum, l) => sum + l.thucDungKg, 0),
              lines: baseLines
            }
          ];

    groups.push({
      groupKey,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel,
      machine: header.machine,
      lineCount: baseLines.length,
      productCount: productGroups.length,
      xuatCaTotal: baseLines.reduce(
        (sum, line) => sum + (Number.isFinite(line.xuatTrongCaKg) ? line.xuatTrongCaKg : 0),
        0
      ),
      tonDauCaTotal: baseLines.reduce(
        (sum, line) => sum + (Number.isFinite(line.tonDauKg) ? line.tonDauKg : 0),
        0
      ),
      tonCuoiCaTotal: baseLines.reduce(
        (sum, line) => sum + (Number.isFinite(line.tonCuoiKg) ? line.tonCuoiKg : 0),
        0
      ),
      totalThucDungKg: baseLines.reduce(
        (sum, line) => sum + (Number.isFinite(line.thucDungKg) ? line.thucDungKg : 0),
        0
      ),
      productGroups,
      lines: baseLines
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export type BbCuoiCaLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  reportId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  weightKg: number;
};

export type BbCuoiCaGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  productCount: number;
  totalWeightKg: number;
  /** Phân tích từng NVL (cùng cấu trúc tab Tồn đầu ca). */
  materialLines: BbDauCaProductLine[];
  lines: BbCuoiCaLineRow[];
};

/** Dòng NVL từ báo cáo kiểm tồn cuối ca gắn lệnh BB (ngày + ca + máy BB). */
export function buildBbCuoiCaLineRows(input: {
  productionOrders: ProductionOrderRow[];
  machineNvlReports: MachineNvlSavedReport[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbCuoiCaLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const rows: BbCuoiCaLineRow[] = [];

  for (const report of input.machineNvlReports) {
    if (report.reportKind !== 'cuoi_ca') continue;
    const ngay = parseProductionOrderFilterDate(report.ngay);
    if (!matchesControlBoardDateRange(ngay || report.ngay, input.dateFrom, input.dateTo)) continue;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(report.ca, input.shiftFilter)) {
      continue;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        report.maMay,
        report.tenMay
      )
    ) {
      continue;
    }

    const matchedOrders = matchBbNvlReportToOrderHeaders(report, headers, shiftOptions);
    if (matchedOrders.length === 0) continue;

    const orderCode = [...new Set(matchedOrders.map(order => order.orderCode).filter(Boolean))].join(', ');
    const machine =
      String(report.tenMay || report.maMay || '').trim() ||
      [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))].join(', ');
    const shiftLabel = formatProductionOrderShiftLabel(report.ca, lookupSettings);

    report.lines.forEach((line, index) => {
      const weightKg = sumMachineNvlCuoiCaLineTotal(line);
      const quantity =
        Number.isFinite(line.soLuongTon) && line.soLuongTon > 0
          ? line.soLuongTon
          : (line.soLuongTrongMay ?? 0) +
            (line.soLuongTrongBonTron ?? 0) +
            (line.soLuongNlChuaTron ?? 0) +
            (line.soLuongTonNgoai ?? 0);
      if ((!Number.isFinite(weightKg) || weightKg <= 0) && (!Number.isFinite(quantity) || quantity <= 0)) {
        return;
      }
      rows.push({
        key: `${report.id}|${line.maNvl || index}|${index}`,
        ngay: ngay || report.ngay,
        shift: report.ca,
        shiftLabel,
        orderCode,
        machine,
        reportId: report.id,
        itemCode: line.maNvl || '',
        itemName: line.tenNvl || '',
        unit: line.donVi || '',
        quantity: Number.isFinite(quantity) ? quantity : 0,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? roundQty(weightKg, 4) : 0
      });
    });
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    return a.itemCode.localeCompare(b.itemCode, 'vi');
  });
}

export function sumBbCuoiCaWeightKg(rows: BbCuoiCaLineRow[]) {
  return rows.reduce((sum, row) => sum + (row.weightKg > 0 ? row.weightKg : 0), 0);
}

/**
 * Tổng trọng lượng tồn cuối ca tách nhựa / vật tư khác (cùng logic tồn đầu ca).
 * - Nhựa: dòng hạt nhựa, ĐVT = kg (không gồm lõi/túi)
 * - Vật tư khác: lõi, túi, màng, ĐVT ≠ kg
 */
export function sumBbCuoiCaWeightKgByKind(rows: BbCuoiCaLineRow[]) {
  let plasticKg = 0;
  let otherKg = 0;
  for (const row of rows) {
    const kg = row.weightKg && row.weightKg > 0 ? row.weightKg : 0;
    if (!(kg > 0)) continue;

    const isPlasticKg =
      isWarehouseKgUnit(row.unit || '') &&
      isWarehousePlasticNvlLine({
        warehouseKind: 'nvl',
        itemCode: row.itemCode,
        itemName: row.itemName,
        unit: row.unit
      });
    if (isPlasticKg) plasticKg += kg;
    else otherKg += kg;
  }
  return {
    plasticKg,
    otherKg,
    totalKg: plasticKg + otherKg
  };
}

export function groupBbCuoiCaLines(
  rows: BbCuoiCaLineRow[],
  productionOrders: ProductionOrderRow[] = [],
  products: ProductRow[] = [],
  materials: MaterialRow[] = [],
  options?: {
    machines?: MachineRow[];
    mixingReports?: MixingReport[];
    shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
    mixingRatioNgay?: string | null;
    mixingRatioShift?: string | null;
  }
): BbCuoiCaGroup[] {
  const map = new Map<
    string,
    Omit<BbCuoiCaGroup, 'materialLines' | 'productCount'>
  >();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        machine: row.machine,
        lineCount: 1,
        totalWeightKg: row.weightKg > 0 ? row.weightKg : 0,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.totalWeightKg += row.weightKg > 0 ? row.weightKg : 0;
    existing.lines.push(row);
  }

  return [...map.values()]
    .map(group => {
      const built = buildBbDauCaMaterialLinesForOrder({
        group: {
          groupKey: group.groupKey,
          orderCode: group.orderCode,
          ngay: group.ngay,
          shift: group.shift,
          shiftLabel: group.shiftLabel,
          machine: group.machine,
          lineCount: group.lineCount,
          totalWeightKg: group.totalWeightKg,
          lines: group.lines
        },
        productionOrders,
        products,
        materials,
        machines: options?.machines,
        mixingReports: options?.mixingReports,
        shiftSettings: options?.shiftSettings,
        mixingRatioNgay: options?.mixingRatioNgay,
        mixingRatioShift: options?.mixingRatioShift
      });
      return {
        ...group,
        productCount: built.productCount,
        materialLines: built.lines,
        lineCount: built.lines.length > 0 ? built.lines.length : group.lineCount
      };
    })
    .sort((a, b) => {
      const dateCmp = b.ngay.localeCompare(a.ngay);
      if (dateCmp !== 0) return dateCmp;
      return a.orderCode.localeCompare(b.orderCode, 'vi');
    });
}

export type BbDauCaLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  reportId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  weightKg: number;
};

/** NVL trong công thức sản phẩm trên lệnh — kèm KL định mức và tồn đầu thực tế (nếu có). */
export type BbDauCaTonDauFormula = {
  itemCode: string;
  itemName: string;
  productCode: string;
  productName: string;
  orderCode: string;
  ngay: string;
  shiftLabel: string;
  machine: string;
  /** true khi phân bổ từ NNS-TRON × tỉ lệ thực tế. */
  fromNnsTron: boolean;
  nnsTronTonDauKg: number;
  directTonDauKg: number;
  tiLeThucTeTbPercent: number | null;
  /** Tỉ lệ SL sản phẩm / tổng SL các SP trên lệnh (chỉ tham chiếu, không nhân vào tồn đầu). */
  share: number;
  productQuantity: number;
  orderQuantityTotal: number;
  tonDauWeightKg: number;
};

export type BbDauCaProductLine = {
  key: string;
  itemCode: string;
  itemName: string;
  unit: string;
  dinhMucRate: number | null;
  dinhMucUnit: string;
  amountType: 'percent' | 'quantity' | null;
  /** Tỉ lệ định mức (%) — từ thành phần % SP hoặc tỉ lệ trộn máy. */
  tiLeDinhMucPercent: number | null;
  /** Tỉ lệ TB thực tế (%) — từ phiếu phối trộn ca hiện tại (hoặc = ĐM ngày 01/07 ca 12C1). */
  tiLeThucTeTbPercent: number | null;
  tonDauQuantity: number;
  tonDauWeightKg: number;
  /** Chi tiết công thức cột Tồn đầu (kg) — bấm số để xem. */
  tonDauFormula: BbDauCaTonDauFormula | null;
};

export type BbDauCaGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  productCount: number;
  totalWeightKg: number;
  /** Dòng NVL gộp theo mã NVL cho cả lệnh SX (không tách theo từng sản phẩm). */
  materialLines: BbDauCaProductLine[];
  lines: BbDauCaLineRow[];
};

/** Dòng NVL từ báo cáo tồn đầu ca gắn lệnh BB (ngày + ca + máy BB). */
export function buildBbDauCaLineRows(input: {
  productionOrders: ProductionOrderRow[];
  machineNvlReports: MachineNvlSavedReport[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbDauCaLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const rows: BbDauCaLineRow[] = [];

  for (const report of input.machineNvlReports) {
    if (report.reportKind !== 'dau_ca') continue;
    const ngay = parseProductionOrderFilterDate(report.ngay);
    if (!matchesControlBoardDateRange(ngay || report.ngay, input.dateFrom, input.dateTo)) continue;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(report.ca, input.shiftFilter)) {
      continue;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        report.maMay,
        report.tenMay
      )
    ) {
      continue;
    }

    const matchedOrders = matchBbNvlReportToOrderHeaders(report, headers, shiftOptions);
    if (matchedOrders.length === 0) continue;

    const orderCode = [...new Set(matchedOrders.map(order => order.orderCode).filter(Boolean))].join(', ');
    const machine =
      String(report.tenMay || report.maMay || '').trim() ||
      [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))].join(', ');
    const shiftLabel = formatProductionOrderShiftLabel(report.ca, lookupSettings);

    report.lines.forEach((line, index) => {
      const weightKg = sumMachineNvlDauCaLineTotal(line);
      const quantity =
        Number.isFinite(line.soLuongTon) && line.soLuongTon > 0
          ? line.soLuongTon
          : (line.soLuongTrongMay ?? 0) +
            (line.soLuongTrongBonTron ?? 0) +
            (line.soLuongNlChuaTron ?? 0) +
            (line.soLuongTonNgoai ?? 0);
      if ((!Number.isFinite(weightKg) || weightKg <= 0) && (!Number.isFinite(quantity) || quantity <= 0)) {
        return;
      }
      rows.push({
        key: `${report.id}|${line.maNvl || index}|${index}`,
        ngay: ngay || report.ngay,
        shift: report.ca,
        shiftLabel,
        orderCode,
        machine,
        reportId: report.id,
        itemCode: line.maNvl || '',
        itemName: line.tenNvl || '',
        unit: line.donVi || '',
        quantity: Number.isFinite(quantity) ? quantity : 0,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? roundQty(weightKg, 4) : 0
      });
    });
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    return a.itemCode.localeCompare(b.itemCode, 'vi');
  });
}

export function sumBbDauCaWeightKg(rows: BbDauCaLineRow[]) {
  return rows.reduce((sum, row) => sum + (row.weightKg > 0 ? row.weightKg : 0), 0);
}

/**
 * Tổng trọng lượng tồn đầu ca tách nhựa / vật tư khác (khớp logic Trọng lượng xuất).
 * - Nhựa: dòng hạt nhựa, ĐVT = kg (không gồm lõi/túi)
 * - Vật tư khác: lõi, túi, màng, ĐVT ≠ kg
 */
export function sumBbDauCaWeightKgByKind(rows: BbDauCaLineRow[]) {
  let plasticKg = 0;
  let otherKg = 0;
  for (const row of rows) {
    const kg = row.weightKg && row.weightKg > 0 ? row.weightKg : 0;
    if (!(kg > 0)) continue;

    const isPlasticKg =
      isWarehouseKgUnit(row.unit || '') &&
      isWarehousePlasticNvlLine({
        warehouseKind: 'nvl',
        itemCode: row.itemCode,
        itemName: row.itemName,
        unit: row.unit
      });
    if (isPlasticKg) plasticKg += kg;
    else otherKg += kg;
  }
  return {
    plasticKg,
    otherKg,
    totalKg: plasticKg + otherKg
  };
}

function buildBbDauCaMaterialLinesForOrder(input: {
  group: {
    groupKey: string;
    orderCode: string;
    ngay: string;
    shift: string;
    shiftLabel: string;
    machine: string;
    lineCount: number;
    totalWeightKg: number;
    lines: Array<{
      key: string;
      itemCode: string;
      itemName: string;
      unit: string;
      quantity: number;
      weightKg: number;
    }>;
  };
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines?: MachineRow[];
  mixingReports?: MixingReport[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  /** Ngày/ca phiếu trộn dùng làm tỉ lệ thực tế (thường = ca liền trước). */
  mixingRatioNgay?: string | null;
  mixingRatioShift?: string | null;
}): { lines: BbDauCaProductLine[]; productCount: number } {
  const { group, productionOrders, products } = input;
  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  const machineRow = findBbMachineByLabel(input.machines || [], group.machine);
  const machineRatioByCode = new Map<string, number>();
  const machineRatioByName = new Map<string, number>();
  if (machineRow) {
    for (const ratio of machineRow.mixingRatios) {
      const pct = Number(String(ratio.percent ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(pct)) continue;
      const codeKey = normalizeProductCodeKey(ratio.materialCode);
      if (codeKey) machineRatioByCode.set(codeKey, pct);
      const nameKey = (ratio.materialName || '').trim().toLowerCase();
      if (nameKey) machineRatioByName.set(nameKey, pct);
    }
  }
  const resolveMachineDinhMuc = (code: string, name: string): number | null => {
    const codeKey = normalizeProductCodeKey(code);
    if (codeKey && machineRatioByCode.has(codeKey)) return machineRatioByCode.get(codeKey)!;
    const nameKey = (name || '').trim().toLowerCase();
    if (nameKey && machineRatioByName.has(nameKey)) return machineRatioByName.get(nameKey)!;
    return null;
  };
  // Tab tồn đầu: tỉ lệ thực tế + phân bổ NNS-TRON đều theo định mức (không lấy phiếu trộn).
  const resolveTiLeThucTe = (_code: string, _name: string, tiLeDinhMucPercent: number | null) => {
    if (tiLeDinhMucPercent !== null && Number.isFinite(tiLeDinhMucPercent) && tiLeDinhMucPercent > 0) {
      return tiLeDinhMucPercent;
    }
    return null;
  };
  const orderCodes = group.orderCode
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const codeSet = new Set(orderCodes.map(code => code.toUpperCase()));
  const relatedOrders = productionOrders.filter(order => {
    if (codeSet.size > 0 && !codeSet.has(String(order.code || '').trim().toUpperCase())) return false;
    const ngay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (group.ngay && ngay && ngay !== group.ngay) return false;
    return shiftNamesMatch(order.shift, group.shift);
  });

  type ProductAgg = {
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    catalog: ProductRow | null | undefined;
  };
  const productAgg = new Map<string, ProductAgg>();
  for (const order of relatedOrders) {
    for (const line of getProductionOrderProductLines(order)) {
      const productCode = String(line.productCode || '').trim();
      const productName = String(line.productName || '').trim();
      const key = normalizeProductCodeKey(productCode) || productName.toUpperCase();
      if (!key) continue;
      const qty = parseProductionOrderQuantity(line.quantity);
      const catalog = findProductByCode(products, productCode);
      const existing = productAgg.get(key);
      if (!existing) {
        productAgg.set(key, {
          productCode,
          productName: productName || catalog?.name || productCode,
          unit: String(line.unit || catalog?.unit || '').trim(),
          quantity: qty > 0 ? qty : 0,
          catalog
        });
      } else {
        existing.quantity += qty > 0 ? qty : 0;
        if (!existing.productName && productName) existing.productName = productName;
        if (!existing.unit && line.unit) existing.unit = String(line.unit).trim();
        if (catalog) existing.catalog = catalog;
      }
    }
  }

  const productList = [...productAgg.entries()];

  const tonMaps = {
    byCode: new Map<string, number>(),
    byName: new Map<string, number>(),
    qtyByCode: new Map<string, number>(),
    qtyByName: new Map<string, number>()
  };
  for (const row of group.lines) {
    const code = normalizeMaterialCodeKey(row.itemCode || '');
    const name = String(row.itemName || '')
      .trim()
      .toUpperCase();
    const kg = row.weightKg > 0 ? row.weightKg : 0;
    const qty = row.quantity > 0 ? row.quantity : 0;
    if (code) {
      tonMaps.byCode.set(code, (tonMaps.byCode.get(code) || 0) + kg);
      tonMaps.qtyByCode.set(code, (tonMaps.qtyByCode.get(code) || 0) + qty);
    } else if (name) {
      tonMaps.byName.set(name, (tonMaps.byName.get(name) || 0) + kg);
      tonMaps.qtyByName.set(name, (tonMaps.qtyByName.get(name) || 0) + qty);
    }
  }
  const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonMaps);

  // Gom NVL theo mã (không tách theo sản phẩm) — chỉ lấy thông tin định mức đại diện (ĐVT/Tỉ lệ ĐM/Thành phần)
  // từ lần xuất hiện đầu tiên trong công thức SP nào có mã NVL đó.
  type MaterialMeta = {
    itemCode: string;
    itemName: string;
    unit: string;
    dinhMucRate: number | null;
    dinhMucUnit: string;
    amountType: 'percent' | 'quantity' | null;
    tiLeDinhMucPercent: number | null;
  };
  const materialMeta = new Map<string, MaterialMeta>();
  for (const [, product] of productList) {
    for (const item of product.catalog?.nplItems || []) {
      const materialKey = normalizeProductCodeKey(item.code) || String(item.name || '').trim().toUpperCase();
      if (!materialKey || materialMeta.has(materialKey)) continue;
      const rate =
        item.amountType === 'quantity' ? Math.max(0, item.quantity ?? 0) : Math.max(0, item.percent ?? 0);
      const tiLeDinhMucPercent =
        item.amountType === 'percent' && rate > 0
          ? roundQty(rate, 4)
          : (() => {
              const fromMachine = resolveMachineDinhMuc(item.code, item.name || '');
              return fromMachine === null ? null : roundQty(fromMachine, 4);
            })();
      materialMeta.set(materialKey, {
        itemCode: item.code || '',
        itemName: item.name || item.code || '',
        unit: resolveBbDauCaDisplayUnit(item.unit || '', item.amountType),
        dinhMucRate: rate > 0 ? roundQty(rate, 4) : null,
        dinhMucUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : '%',
        amountType: item.amountType,
        tiLeDinhMucPercent
      });
    }
  }
  const usedMaterialKeys = new Set(materialMeta.keys());

  const materialLines: BbDauCaProductLine[] = [...materialMeta.entries()].map(([materialKey, meta]) => {
    const unitIsKg = isBbMixingRatioKgUnit(meta.unit, meta.amountType);
    // Tỉ lệ thực tế = định mức (theo yêu cầu tính hết theo ĐM).
    const tiLeThucTeTbPercent = unitIsKg
      ? resolveTiLeThucTe(meta.itemCode, meta.itemName, meta.tiLeDinhMucPercent)
      : null;
    const directTon = lookupMachineNvlKgByMaterial(tonMaps, meta.itemCode, meta.itemName);
    const directQty = (() => {
      const code = normalizeMaterialCodeKey(meta.itemCode);
      const name = meta.itemName.trim().toUpperCase();
      if (code && tonMaps.qtyByCode.has(code)) return tonMaps.qtyByCode.get(code) || 0;
      if (name && tonMaps.qtyByName.has(name)) return tonMaps.qtyByName.get(name) || 0;
      return 0;
    })();
    // Chỉ chia NNS-TRON × tỉ lệ ĐM cho vật tư ĐVT kg (nhựa / thành phần %).
    const useNns =
      unitIsKg &&
      nnsTronTonDauKg > 0 &&
      tiLeThucTeTbPercent !== null &&
      Number.isFinite(tiLeThucTeTbPercent) &&
      tiLeThucTeTbPercent > 0 &&
      !isNnsTronMaterial(meta.itemCode, meta.itemName);
    const tonDauWeightKg = roundQty(
      useNns ? nnsTronTonDauKg * (tiLeThucTeTbPercent / 100) : directTon,
      4
    );
    // ĐVT kg: SL tồn = tồn đầu (kg). ĐVT khác (Cái…): SL trên phiếu tồn đầu theo mã (không chia NNS-TRON).
    const tonDauQuantity = roundQty(
      unitIsKg ? (tonDauWeightKg > 0 ? tonDauWeightKg : directQty) : directQty,
      4
    );
    const tonDauFormula: BbDauCaTonDauFormula = {
      itemCode: meta.itemCode,
      itemName: meta.itemName,
      productCode: '',
      productName: '',
      orderCode: group.orderCode,
      ngay: group.ngay,
      shiftLabel: group.shiftLabel || group.shift,
      machine: group.machine,
      fromNnsTron: useNns,
      nnsTronTonDauKg: roundQty(nnsTronTonDauKg, 4),
      directTonDauKg: roundQty(directTon, 4),
      tiLeThucTeTbPercent,
      share: 1,
      productQuantity: 0,
      orderQuantityTotal: 0,
      tonDauWeightKg
    };

    return {
      key: `${group.groupKey}|${materialKey}`,
      itemCode: meta.itemCode,
      itemName: meta.itemName,
      unit: meta.unit,
      dinhMucRate: meta.dinhMucRate,
      dinhMucUnit: meta.dinhMucUnit,
      amountType: meta.amountType,
      tiLeDinhMucPercent: meta.tiLeDinhMucPercent,
      tiLeThucTeTbPercent,
      tonDauQuantity,
      tonDauWeightKg,
      tonDauFormula
    };
  });

  // NVL có trên báo cáo tồn đầu nhưng không nằm trong công thức SP nào.
  for (const row of group.lines) {
    const materialKey =
      normalizeProductCodeKey(row.itemCode) || String(row.itemName || '').trim().toUpperCase();
    if (!materialKey || usedMaterialKeys.has(materialKey)) continue;
    if (isNnsTronMaterial(row.itemCode, row.itemName) && materialLines.length > 0) continue;
    usedMaterialKeys.add(materialKey);
    materialLines.push({
      key: `${group.groupKey}|orphan|${materialKey}|${row.key}`,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit || 'kg',
      dinhMucRate: null,
      dinhMucUnit: '',
      amountType: null,
      tiLeDinhMucPercent: (() => {
        const fromMachine = resolveMachineDinhMuc(row.itemCode, row.itemName);
        return fromMachine === null ? null : roundQty(fromMachine, 4);
      })(),
      tiLeThucTeTbPercent: resolveTiLeThucTe(
        row.itemCode,
        row.itemName,
        (() => {
          const fromMachine = resolveMachineDinhMuc(row.itemCode, row.itemName);
          return fromMachine === null ? null : roundQty(fromMachine, 4);
        })()
      ),
      tonDauQuantity: row.quantity,
      tonDauWeightKg: row.weightKg,
      tonDauFormula: {
        itemCode: row.itemCode,
        itemName: row.itemName,
        productCode: '',
        productName: '',
        orderCode: group.orderCode,
        ngay: group.ngay,
        shiftLabel: group.shiftLabel || group.shift,
        machine: group.machine,
        fromNnsTron: false,
        nnsTronTonDauKg: roundQty(nnsTronTonDauKg, 4),
        directTonDauKg: roundQty(row.weightKg, 4),
        tiLeThucTeTbPercent: resolveTiLeThucTe(
          row.itemCode,
          row.itemName,
          (() => {
            const fromMachine = resolveMachineDinhMuc(row.itemCode, row.itemName);
            return fromMachine === null ? null : roundQty(fromMachine, 4);
          })()
        ),
        share: 1,
        productQuantity: 0,
        orderQuantityTotal: 0,
        tonDauWeightKg: roundQty(row.weightKg, 4)
      }
    });
  }

  materialLines.sort((a, b) => {
    const aIsKg = isWarehouseKgUnit(a.unit || '');
    const bIsKg = isWarehouseKgUnit(b.unit || '');
    if (aIsKg !== bIsKg) return aIsKg ? -1 : 1;
    const unitCmp = String(a.unit || '')
      .trim()
      .localeCompare(String(b.unit || '').trim(), 'vi', { sensitivity: 'base' });
    if (unitCmp !== 0) return unitCmp;
    return a.itemName.localeCompare(b.itemName, 'vi');
  });

  return { lines: materialLines, productCount: productList.length };
}

/** Gom tồn đầu ca theo lệnh; dưới mỗi lệnh nhóm theo sản phẩm → từng NVL × định mức. */
export function groupBbDauCaLines(
  rows: BbDauCaLineRow[],
  productionOrders: ProductionOrderRow[] = [],
  products: ProductRow[] = [],
  materials: MaterialRow[] = [],
  options?: {
    machines?: MachineRow[];
    mixingReports?: MixingReport[];
    shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
    mixingRatioNgay?: string | null;
    mixingRatioShift?: string | null;
  }
): BbDauCaGroup[] {
  const map = new Map<string, Omit<BbDauCaGroup, 'materialLines' | 'productCount'>>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        machine: row.machine,
        lineCount: 1,
        totalWeightKg: row.weightKg > 0 ? row.weightKg : 0,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.totalWeightKg += row.weightKg > 0 ? row.weightKg : 0;
    existing.lines.push(row);
  }

  return [...map.values()]
    .map(group => {
      const built = buildBbDauCaMaterialLinesForOrder({
        group,
        productionOrders,
        products,
        materials,
        machines: options?.machines,
        mixingReports: options?.mixingReports,
        shiftSettings: options?.shiftSettings,
        mixingRatioNgay: options?.mixingRatioNgay,
        mixingRatioShift: options?.mixingRatioShift
      });
      return {
        ...group,
        productCount: built.productCount,
        materialLines: built.lines,
        lineCount: built.lines.length > 0 ? built.lines.length : group.lineCount
      };
    })
    .sort((a, b) => {
      const dateCmp = b.ngay.localeCompare(a.ngay);
      if (dateCmp !== 0) return dateCmp;
      return a.orderCode.localeCompare(b.orderCode, 'vi');
    });
}

function resolveAcceptanceReportProductCode(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  return (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
}

/** Dòng NVL từ công thức SP trên phiếu báo cáo sản lượng. */
export type BbSanLuongNvlLine = {
  key: string;
  itemCode: string;
  itemName: string;
  unit: string;
  tiLeDinhMucPercent: number | null;
  dinhMucRate: number | null;
  dinhMucUnit: string;
  amountType: 'percent' | 'quantity' | null;
  normWeightKg: number;
  materialNorm: BbMaterialNormFormula | null;
  /** Tổng NVL cả ca (trước khi × % mặt hàng). */
  baseActualWeightKg: number;
  /** % mặt hàng = SL SP ÷ tổng SL mọi SP trên phiếu báo cáo sản lượng (0–100). */
  productSharePercent: number;
  /**
   * Trọng lượng thực tế (kg) = baseActualWeightKg × (productSharePercent / 100)
   */
  actualWeightKg: number;
  balanceDetail: BbInboundMaterialBalanceDetail | null;
};

export type BbSanLuongProductGroup = {
  key: string;
  productCode: string;
  productName: string;
  unit: string;
  /** SL mặt hàng từ báo cáo sản lượng. */
  quantity: number;
  /** % mặt hàng = quantity ÷ tổng SL mọi SP cùng nhóm phiếu sản lượng. */
  productSharePercent: number;
  reportCount: number;
  lineCount: number;
  totalNormWeightKg: number;
  totalActualWeightKg: number;
  lines: BbSanLuongNvlLine[];
};

export type BbSanLuongNvlTotal = {
  key: string;
  itemCode: string;
  itemName: string;
  unit: string;
  /** Tổng KL định mức của NVL này trên mọi SP. */
  normWeightKg: number;
  /** Tổng trọng lượng thực tế = cộng các phần đã phân bổ theo SP (= cân bằng cả ca). */
  actualWeightKg: number;
  baseActualWeightKg: number;
  balanceDetail: BbInboundMaterialBalanceDetail | null;
};

export type BbSanLuongGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  productCount: number;
  lineCount: number;
  totalQuantity: number;
  totalNormWeightKg: number;
  /**
   * Trọng lượng thực tế cả lệnh = cộng TL thực tế từng NVL
   * (đã trộn+chưa trộn + xuất − lỗi hỏng − tồn cuối).
   */
  totalActualWeightKg: number;
  /** Tổng 4 thành phần cân bằng của các NVL trên lệnh. */
  balanceSummary: BbInboundMaterialBalanceDetail;
  productGroups: BbSanLuongProductGroup[];
  /** Dòng con: tổng theo từng NVL. */
  nvlTotals: BbSanLuongNvlTotal[];
};

/**
 * Tab Dữ liệu trong báo cáo sản lượng:
 * phiếu báo cáo sản lượng → định mức NVL (công thức × SL)
 * + trọng lượng thực tế từng NVL =
 *   [Tồn đầu ca theo mã NVL (tab Tồn đầu ca)] + [Xuất thực tế] − [Lỗi hỏng] − [Tồn cuối ca]
 */
export function buildBbSanLuongGroups(input: {
  productionOrders: ProductionOrderRow[];
  acceptanceReports: AcceptanceReport[];
  products: ProductRow[];
  materials: MaterialRow[];
  machines: MachineRow[];
  machineNvlReports?: MachineNvlSavedReport[];
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  damagedRecords?: WeighingRecord[];
  mixingReports?: MixingReport[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbSanLuongGroup[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const materialsCatalog = input.materials.map(mapMaterialToWeightCatalogItem);
  const acceptanceReports = input.acceptanceReports.filter(report => {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (!matchesControlBoardDateRange(ngay, input.dateFrom, input.dateTo)) return false;
    if (input.shiftFilter && input.shiftFilter !== 'all' && !shiftNamesMatch(report.ca, input.shiftFilter)) {
      return false;
    }
    if (
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        report.ma_may,
        report.ten_may
      )
    ) {
      return false;
    }
    if (input.includeAllMachines) return true;
    return isBbMachineText(report.ma_may, report.ten_may);
  });
  if (acceptanceReports.length === 0) return [];

  // Cùng nguồn / công thức cột «Tồn đầu (kg)» ở tab Tồn đầu ca — tra theo mã NVL.
  const dauCaTabRows = buildBbDauCaLineRows({
    productionOrders: input.productionOrders,
    machineNvlReports: input.machineNvlReports || [],
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter,
    selectedMachine: input.selectedMachine
  });
  const dauCaTabGroups = groupBbDauCaLines(
    dauCaTabRows,
    input.productionOrders,
    input.products,
    input.materials,
    {
      machines: input.machines,
      mixingReports: input.mixingReports || [],
      shiftSettings: input.shiftSettings
    }
  );

  const groups: BbSanLuongGroup[] = [];

  for (const header of headers) {
    const matchedReports = acceptanceReports.filter(report => {
      const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
      if (!matchesShiftSummaryBucket(header.ngay, header.shift, reportDate, report.ca, shiftOptions)) {
        return false;
      }
      return (
        machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) ||
        (!input.includeAllMachines &&
          isBbMachineText(header.machine) &&
          isBbMachineText(report.ma_may, report.ten_may))
      );
    });
    if (matchedReports.length === 0) continue;

    const productMap = new Map<
      string,
      {
        productCode: string;
        productName: string;
        unit: string;
        quantity: number;
        reportCount: number;
        catalog: ProductRow | null | undefined;
        nvlAgg: Map<
          string,
          {
            itemCode: string;
            itemName: string;
            unit: string;
            amountType: 'percent' | 'quantity';
            rate: number;
            rateUnit: string;
            tiLeDinhMucPercent: number | null;
            normWeightKg: number;
            materialNorm: BbMaterialNormFormula | null;
          }
        >;
      }
    >();

    for (const report of matchedReports) {
      const productCodeRaw = resolveAcceptanceReportProductCode(report.mat_hang);
      if (!productCodeRaw) continue;
      const qty = Number(report.so_luong);
      const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (inboundQty <= 0) continue;

      const catalogProduct =
        findProductByCode(input.products, productCodeRaw) ||
        input.products.find(
          product =>
            normalizeProductCodeKey(product.name) === normalizeProductCodeKey(productCodeRaw) ||
            normalizeProductCodeKey(product.name).includes(normalizeProductCodeKey(productCodeRaw))
        );
      const resolvedCode = catalogProduct?.code || productCodeRaw;
      const productKey = normalizeProductCodeKey(resolvedCode) || normalizeProductCodeKey(productCodeRaw);
      if (!productKey) continue;

      let product = productMap.get(productKey);
      if (!product) {
        product = {
          productCode: resolvedCode,
          productName: catalogProduct?.name || productCodeRaw,
          unit: String(report.don_vi || catalogProduct?.unit || '').trim(),
          quantity: 0,
          reportCount: 0,
          catalog: catalogProduct,
          nvlAgg: new Map()
        };
        productMap.set(productKey, product);
      }
      product.quantity += inboundQty;
      product.reportCount += 1;
      if (!product.unit && report.don_vi) product.unit = String(report.don_vi).trim();
      if (catalogProduct) product.catalog = catalogProduct;

      const unitNorm = resolveProductUnitNormKg(product.catalog);
      for (const item of product.catalog?.nplItems || []) {
        const materialKey = normalizeProductCodeKey(item.code) || String(item.name || '').trim().toUpperCase();
        if (!materialKey) continue;
        const expectedKg = resolveBomExpectedKg(item, inboundQty, unitNorm, materialsCatalog);
        if (expectedKg === null || expectedKg <= 0) continue;
        const rate =
          item.amountType === 'quantity'
            ? Math.max(0, item.quantity ?? 0)
            : Math.max(0, item.percent ?? 0);
        const rawExpectedQuantity =
          item.amountType === 'quantity'
            ? roundQuantityByUnit(rate * inboundQty, item.unit || '')
            : expectedKg;
        const catalogKgPerUnit =
          item.amountType === 'quantity' && !isWarehouseKgUnit(item.unit || '')
            ? findMaterialTongKgPerUnit(item.code, materialsCatalog)
            : null;
        const normWeightKg =
          item.amountType === 'quantity' &&
          !isWarehouseKgUnit(item.unit || '') &&
          catalogKgPerUnit !== null &&
          catalogKgPerUnit > 0
            ? roundQty(rawExpectedQuantity * catalogKgPerUnit, 4)
            : roundQty(expectedKg, 4);
        const tiLeDinhMucPercent =
          item.amountType === 'percent' && rate > 0 ? roundQty(rate, 4) : null;
        const materialNorm: BbMaterialNormFormula = {
          productCode: product.productCode,
          productName: product.productName,
          productQuantity: inboundQty,
          productUnit: product.unit || 'SP',
          productNormKgPerUnit: unitNorm,
          materialCode: item.code,
          materialName: item.name || item.code,
          amountType: item.amountType,
          rate,
          rateUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : '%',
          rawExpectedQuantity,
          rawExpectedUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : 'kg',
          catalogKgPerUnit,
          totalNormKg: normWeightKg,
          allocationRatio: 1,
          allocatedNormKg: normWeightKg
        };

        const existingNvl = product.nvlAgg.get(materialKey);
        if (!existingNvl) {
          product.nvlAgg.set(materialKey, {
            itemCode: item.code || '',
            itemName: item.name || item.code || '',
            unit: String(item.unit || '').trim() || 'kg',
            amountType: item.amountType,
            rate,
            rateUnit: item.amountType === 'quantity' ? item.unit || 'đơn vị' : '%',
            tiLeDinhMucPercent,
            normWeightKg,
            materialNorm
          });
        } else {
          existingNvl.normWeightKg = roundQty(existingNvl.normWeightKg + normWeightKg, 4);
          if (existingNvl.materialNorm) {
            existingNvl.materialNorm = {
              ...existingNvl.materialNorm,
              productQuantity: product.quantity,
              totalNormKg: existingNvl.normWeightKg,
              allocatedNormKg: existingNvl.normWeightKg,
              rawExpectedQuantity:
                item.amountType === 'quantity'
                  ? roundQuantityByUnit(rate * product.quantity, item.unit || '')
                  : existingNvl.normWeightKg
            };
          }
        }
      }
    }

    if (productMap.size === 0) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    const groupKey = header.orderCode.trim() || `san-luong|${header.ngay}|${header.shift}`;

    // Trọng lượng thực tế theo từng NVL:
    //   [Tồn đầu ca — đúng cột Tồn đầu (kg) tab Tồn đầu ca theo mã NVL]
    // + [Xuất thực tế]
    // − [Hàng lỗi hỏng (= tổng lỗi tab × tỉ lệ trộn)]
    // − [Tồn cuối ca]
    const matchedDauCaGroup =
      dauCaTabGroups.find(
        g =>
          g.ngay === header.ngay &&
          shiftNamesMatch(g.shift, header.shift) &&
          String(g.orderCode || '')
            .split(',')
            .map(c => c.trim().toUpperCase())
            .filter(Boolean)
            .includes(String(header.orderCode || '').trim().toUpperCase())
      ) ||
      dauCaTabGroups.find(
        g =>
          g.ngay === header.ngay &&
          shiftNamesMatch(g.shift, header.shift) &&
          machineValueMatchesFilter(header.machine, null, g.machine)
      );

    const dauCaTonByMaterial = new Map<
      string,
      {
        tonDauKg: number;
        fromNnsTron: boolean;
        directTonDauKg: number;
        nnsTronTonDauKg: number;
        tiLeThucTeTbPercent: number | null;
      }
    >();
    for (const line of matchedDauCaGroup?.materialLines || []) {
      const materialKey =
        normalizeProductCodeKey(line.itemCode) ||
        String(line.itemName || '').trim().toUpperCase();
      if (!materialKey) continue;
      dauCaTonByMaterial.set(materialKey, {
        tonDauKg: roundQty(line.tonDauWeightKg || 0, 4),
        fromNnsTron: Boolean(line.tonDauFormula?.fromNnsTron),
        directTonDauKg: roundQty(line.tonDauFormula?.directTonDauKg || 0, 4),
        nnsTronTonDauKg: roundQty(line.tonDauFormula?.nnsTronTonDauKg || 0, 4),
        tiLeThucTeTbPercent: line.tonDauFormula?.tiLeThucTeTbPercent ?? line.tiLeThucTeTbPercent
      });
    }

    const tonCuoiMaps = sumMachineNvlKgByCodeForHeader(
      input.machineNvlReports || [],
      header,
      shiftOptions,
      'cuoi_ca'
    );
    const xuatThucTeMaps = sumWarehouseExportKgByCodeForHeader(
      input.warehouseMovements || [],
      header,
      shiftOptions,
      input.materials
    );
    const damagedTabTotalKg = sumBbDamagedGoodsTabTotalKgForHeader(
      input.damagedRecords || [],
      header,
      shiftOptions
    );
    const mixingTiLeMaps = buildMixingTiLeTronMapsForHeader(
      input.mixingReports || [],
      header,
      input.shiftSettings
    );
    // Fallback khi mã chưa có trên tab Tồn đầu ca: cùng công thức NNS-TRON × tỉ lệ.
    const tonDauFallbackMaps = sumMachineNvlKgByCodeForHeader(
      input.machineNvlReports || [],
      header,
      shiftOptions,
      'dau_ca'
    );
    const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonDauFallbackMaps);
    const tonDauAllocation = buildBbTonDauAllocationContext({
      header,
      machines: input.machines,
      mixingReports: input.mixingReports || [],
      shiftOptions,
      nnsTronTonDauKg
    });

    const materialKeys = new Map<
      string,
      { code: string; name: string; tiLeDinhMucPercent: number | null }
    >();
    for (const product of productMap.values()) {
      for (const [key, nvl] of product.nvlAgg.entries()) {
        if (!materialKeys.has(key)) {
          materialKeys.set(key, {
            code: nvl.itemCode,
            name: nvl.itemName,
            tiLeDinhMucPercent: nvl.tiLeDinhMucPercent
          });
        }
      }
    }

    /** Cân bằng cả ca theo mã NVL (chưa tách theo SP). */
    const baseActualByMaterial = new Map<string, number>();
    const baseBalanceByMaterial = new Map<string, BbInboundMaterialBalanceDetail>();
    {
      for (const [key, mat] of materialKeys.entries()) {
        const fromDauCaTab = dauCaTonByMaterial.get(key);
        let tonDauKg = 0;
        let useNnsTonDau = false;
        let directTonDau = 0;
        let tiLeThucTeTbPercent: number | null = null;
        let nnsForDetail = nnsTronTonDauKg;

        if (fromDauCaTab) {
          // Khớp đúng số «Tồn đầu (kg)» theo mã NVL trên tab Tồn đầu ca.
          tonDauKg = fromDauCaTab.tonDauKg;
          useNnsTonDau = fromDauCaTab.fromNnsTron;
          directTonDau = fromDauCaTab.directTonDauKg;
          tiLeThucTeTbPercent = fromDauCaTab.tiLeThucTeTbPercent;
          nnsForDetail = fromDauCaTab.nnsTronTonDauKg;
        } else {
          const direct = roundQty(
            lookupMachineNvlKgByMaterial(tonDauFallbackMaps, mat.code, mat.name),
            2
          );
          directTonDau = direct;
          // Tính hết theo định mức máy.
          const resolved = tonDauAllocation.resolveTonDau(mat.code, mat.name, direct);
          tonDauKg = roundQty(resolved.tonDauKg, 4);
          useNnsTonDau = resolved.fromNnsTron;
          tiLeThucTeTbPercent =
            resolved.tiLeThucTeTbPercent ??
            mat.tiLeDinhMucPercent ??
            tonDauAllocation.resolveTiLeThucTeTbPercent(mat.code, mat.name);
        }

        const xuat = roundQty(lookupMachineNvlKgByMaterial(xuatThucTeMaps, mat.code, mat.name), 2);
        const tonCuoi = roundQty(lookupMachineNvlKgByMaterial(tonCuoiMaps, mat.code, mat.name), 2);
        const tiLeTronPercent = lookupMixingTiLeTronPercent(mixingTiLeMaps, mat.code, mat.name);
        const deduction = roundQty(
          tiLeTronPercent !== null && tiLeTronPercent > 0 && damagedTabTotalKg > 0
            ? damagedTabTotalKg * (tiLeTronPercent / 100)
            : 0,
          2
        );
        const real = roundQty(Math.max(0, tonDauKg + xuat - deduction - tonCuoi), 2);
        baseActualByMaterial.set(key, real);
        const grp = classifyBbMaterialGroup(mat.code, mat.name);
        baseBalanceByMaterial.set(key, {
          tonDauKg,
          tonDauFromNnsTron: useNnsTonDau,
          tonDauDirectKg: directTonDau,
          nnsTronTonDauKg: roundQty(nnsForDetail, 4),
          tiLeThucTeTbPercent,
          xuatThucTeKg: xuat,
          loiHongKg: deduction,
          loiHongGroup: grp,
          loiHongGroupTotalKg: roundQty(damagedTabTotalKg, 4),
          loiHongBaseKg: roundQty(Math.max(0, tonDauKg + xuat - tonCuoi), 2),
          loiHongGroupBaseSumKg: 0,
          loiHongTiLeTronPercent: tiLeTronPercent,
          tonCuoiKg: tonCuoi,
          realKg: real
        });
      }
    }

    /** Tổng SL mọi SP trên phiếu báo cáo sản lượng (mẫu số % mặt hàng). */
    const reportedProductQtyTotal = [...productMap.values()].reduce(
      (sum, product) => sum + (product.quantity > 0 ? product.quantity : 0),
      0
    );

    const productGroups: BbSanLuongProductGroup[] = [...productMap.entries()]
      .map(([productKey, product]) => {
        const productQty = product.quantity > 0 ? product.quantity : 0;
        // % mặt hàng = SL SP ÷ tổng SL mọi SP cùng nhóm phiếu sản lượng (không dùng SL kế hoạch lệnh SX).
        const productShare =
          reportedProductQtyTotal > 0 && productQty > 0
            ? productQty / reportedProductQtyTotal
            : 1;
        const productSharePercent = roundQty(productShare * 100, 4);
        const lines: BbSanLuongNvlLine[] = [...product.nvlAgg.entries()]
          .map(([materialKey, nvl]) => {
            // 1) Tổng NVL cả ca → 2) × % mặt hàng = KL NVL con của SP này.
            const baseActual = baseActualByMaterial.get(materialKey) ?? 0;
            const baseBalance = baseBalanceByMaterial.get(materialKey) ?? null;
            return {
              key: `${groupKey}|${productKey}|${materialKey}`,
              itemCode: nvl.itemCode,
              itemName: nvl.itemName,
              unit: nvl.unit,
              tiLeDinhMucPercent: nvl.tiLeDinhMucPercent,
              dinhMucRate: nvl.rate > 0 ? roundQty(nvl.rate, 4) : null,
              dinhMucUnit: nvl.rateUnit,
              amountType: nvl.amountType,
              normWeightKg: roundQty(nvl.normWeightKg, 4),
              materialNorm: nvl.materialNorm
                ? { ...nvl.materialNorm, productQuantity: product.quantity }
                : null,
              baseActualWeightKg: roundQty(baseActual, 4),
              productSharePercent,
              actualWeightKg: roundQty(baseActual * productShare, 4),
              // Giữ số cân bằng cả ca (chưa × %) để modal hiện đúng công thức 2 bước.
              balanceDetail: baseBalance
            };
          })
          .sort((a, b) => a.itemName.localeCompare(b.itemName, 'vi'));
        const totalNormWeightKg = roundQty(
          lines.reduce((sum, line) => sum + line.normWeightKg, 0),
          3
        );
        const totalActualWeightKg = roundQty(
          lines.reduce((sum, line) => sum + line.actualWeightKg, 0),
          2
        );
        return {
          key: `${groupKey}|${productKey}`,
          productCode: product.productCode,
          productName: product.productName,
          unit: product.unit,
          quantity: product.quantity,
          productSharePercent,
          reportCount: product.reportCount,
          lineCount: lines.length,
          totalNormWeightKg,
          totalActualWeightKg,
          lines
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, 'vi'));

    // Tổng theo NVL (cộng mọi SP) — TL thực tế = cân bằng cả ca của mã (không chia % SP).
    const nvlAggMap = new Map<string, BbSanLuongNvlTotal>();
    for (const productGroup of productGroups) {
      for (const line of productGroup.lines) {
        const materialKey =
          normalizeProductCodeKey(line.itemCode) ||
          String(line.itemName || '').trim().toUpperCase();
        if (!materialKey) continue;
        const existing = nvlAggMap.get(materialKey);
        if (!existing) {
          nvlAggMap.set(materialKey, {
            key: `${groupKey}|nvl:${materialKey}`,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unit: line.unit,
            normWeightKg: line.normWeightKg,
            // Hiện đúng công thức cả ca (vd: 28,51+50−4,40−17,57 = 56,54).
            actualWeightKg: line.baseActualWeightKg,
            baseActualWeightKg: line.baseActualWeightKg,
            balanceDetail: line.balanceDetail
          });
        } else {
          existing.normWeightKg = roundQty(existing.normWeightKg + line.normWeightKg, 4);
          if (!existing.itemCode && line.itemCode) existing.itemCode = line.itemCode;
          if (!existing.itemName && line.itemName) existing.itemName = line.itemName;
          if (!existing.unit && line.unit) existing.unit = line.unit;
          if (!existing.balanceDetail && line.balanceDetail) {
            existing.balanceDetail = line.balanceDetail;
            existing.baseActualWeightKg = line.baseActualWeightKg;
            existing.actualWeightKg = line.baseActualWeightKg;
          }
        }
      }
    }
    const nvlTotals = [...nvlAggMap.values()].sort((a, b) =>
      a.itemName.localeCompare(b.itemName, 'vi')
    );

    // Tổng định mức = cộng NVL BOM; TL thực tế = cộng cân bằng từng NVL
    // (AF đã+chưa + P xuất − BS lỗi − CH tồn cuối).
    const totalNormWeightKg = roundQty(
      nvlTotals.reduce((sum, row) => sum + row.normWeightKg, 0),
      3
    );
    const sumTonDau = roundQty(
      nvlTotals.reduce((sum, row) => sum + (row.balanceDetail?.tonDauKg || 0), 0),
      2
    );
    const sumXuat = roundQty(
      nvlTotals.reduce((sum, row) => sum + (row.balanceDetail?.xuatThucTeKg || 0), 0),
      2
    );
    const sumLoi = roundQty(
      nvlTotals.reduce((sum, row) => sum + (row.balanceDetail?.loiHongKg || 0), 0),
      2
    );
    const sumTonCuoi = roundQty(
      nvlTotals.reduce((sum, row) => sum + (row.balanceDetail?.tonCuoiKg || 0), 0),
      2
    );
    const totalActualWeightKg = roundQty(
      nvlTotals.reduce((sum, row) => sum + (row.actualWeightKg || 0), 0),
      2
    );
    const balanceSummary: BbInboundMaterialBalanceDetail = {
      tonDauKg: sumTonDau,
      tonDauFromNnsTron: false,
      tonDauDirectKg: sumTonDau,
      nnsTronTonDauKg: roundQty(nnsTronTonDauKg, 4),
      tiLeThucTeTbPercent: null,
      xuatThucTeKg: sumXuat,
      loiHongKg: sumLoi,
      loiHongGroup: 'nhua',
      loiHongGroupTotalKg: roundQty(damagedTabTotalKg, 4),
      loiHongBaseKg: roundQty(Math.max(0, sumTonDau + sumXuat - sumTonCuoi), 2),
      loiHongGroupBaseSumKg: 0,
      loiHongTiLeTronPercent: null,
      tonCuoiKg: sumTonCuoi,
      realKg: totalActualWeightKg
    };

    groups.push({
      groupKey,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel,
      machine: header.machine,
      productCount: productGroups.length,
      lineCount: nvlTotals.length,
      totalQuantity: productGroups.reduce((sum, pg) => sum + pg.quantity, 0),
      totalNormWeightKg,
      totalActualWeightKg,
      balanceSummary,
      productGroups,
      nvlTotals
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

/** Tổng SL sản lượng + trọng lượng thực tế (kg) trên tab báo cáo sản lượng. */
export function sumBbSanLuongTotals(groups: BbSanLuongGroup[]) {
  return groups.reduce(
    (acc, group) => {
      acc.quantity += group.totalQuantity > 0 ? group.totalQuantity : 0;
      acc.weightKg += group.totalActualWeightKg > 0 ? group.totalActualWeightKg : 0;
      return acc;
    },
    { quantity: 0, weightKg: 0 }
  );
}

export type BbThucDungLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  materialCode: string;
  materialName: string;
  unit: string;
  tiLeDinhMucPercent: number | null;
  tiLeThucTeTbPercent: number | null;
  batchCount: number;
  /** Xuất kho NVL của đúng mã này trong ca (kg) — từ phiếu xuất kho. */
  xuatTrongCaKg: number;
  /** @deprecated Giữ tương thích — bằng xuatTrongCaKg (đã bỏ công thức TL đã trộn). */
  trongLuongDaTronKg: number;
  tonDauKg: number;
  /** true khi tồn đầu lấy từ NNS-TRON × tỉ lệ TB thực tế. */
  tonDauFromNnsTron: boolean;
  /** KL NNS-TRON tồn đầu ca dùng để phân bổ (nếu có). */
  nnsTronTonDauKg: number | null;
  /** Ca nguồn của tỉ lệ TB thực tế (ca trước). */
  tiLeThucTeSourceNgay: string | null;
  tiLeThucTeSourceShift: string | null;
  /** KL NVL trong ca trộn nguồn (ca trước) — dùng công thức ÷ tổng trộn. */
  mixingShiftMaterialKg: number | null;
  /** Tổng KL trộn (cộng KL mẻ) ca nguồn. */
  mixingShiftTotalKg: number | null;
  tonCuoiKg: number;
  weightKg: number;
};

export type BbThucDungGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  totalWeightKg: number;
  tonDauCaTotal: number;
  tonCuoiCaTotal: number;
  xuatCaTotal: number;
  lines: BbThucDungLineRow[];
};

type MaterialBucket = { nhua: number; mang: number; loi: number; tui: number };

function emptyMaterialBucket(): MaterialBucket {
  return { nhua: 0, mang: 0, loi: 0, tui: 0 };
}

function addMaterialBucket(target: MaterialBucket, source: MaterialBucket) {
  target.nhua += source.nhua;
  target.mang += source.mang;
  target.loi += source.loi;
  target.tui += source.tui;
}

function resolveMovementExportKg(
  movement: ShiftSummaryWarehouseMovement,
  materials: MaterialRow[]
): number {
  const qty = Number(movement.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const catalog = materials.map(mapMaterialToWeightCatalogItem);
  const converted = convertWarehouseQuantityToKg({
    quantity: qty,
    unit: movement.unit,
    itemCode: movement.itemCode,
    warehouseKind: 'nvl',
    materials: catalog
  });
  if (converted !== null && Number.isFinite(converted) && converted > 0) return converted;
  return 0;
}

function classifyExportMovementKg(
  movement: ShiftSummaryWarehouseMovement,
  materials: MaterialRow[]
): MaterialBucket {
  const zero = emptyMaterialBucket();
  if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') return zero;
  const kg = resolveMovementExportKg(movement, materials);
  if (kg <= 0) return zero;
  if (isWarehouseCoreExportItem(movement.itemCode || '', movement.itemName || '')) {
    return { ...zero, loi: kg };
  }
  if (isWarehouseBagExportItem(movement.itemCode || '', movement.itemName || '')) {
    return { ...zero, tui: kg };
  }
  if (isWarehouseFilmItem(movement.itemCode || '', movement.itemName || '', movement.unit || '')) {
    return { ...zero, mang: kg };
  }
  if (isWarehousePlasticNvlLine(movement)) {
    return { ...zero, nhua: kg };
  }
  const unit = String(movement.unit || '').toLowerCase();
  if (unit.includes('m2') || unit.includes('m²')) return { ...zero, mang: kg };
  return { ...zero, nhua: kg };
}

function classifyMachineNvlLineKg(
  report: MachineNvlSavedReport,
  line: MachineNvlSavedReport['lines'][number]
): MaterialBucket {
  const zero = emptyMaterialBucket();
  const kg =
    report.reportKind === 'dau_ca'
      ? sumMachineNvlDauCaLineTotal(line)
      : sumMachineNvlCuoiCaLineTotal(line);
  if (!Number.isFinite(kg) || kg <= 0) return zero;
  const materialType = resolveMachineNvlLineMaterialType(line);
  if (materialType === 'loi') return { ...zero, loi: kg };
  if (materialType === 'bao_bi') return { ...zero, tui: kg };
  if (materialType === 'mang') return { ...zero, mang: kg };
  return { ...zero, nhua: kg };
}

function materialIdentityKey(code: string, name: string) {
  return (String(code || '').trim() || String(name || '').trim()).toUpperCase();
}

function normalizeMaterialCodeKey(code: string) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Gom kg tồn đầu/cuối theo mã NVL — cùng cách gắn phiếu tồn với lệnh như tab Tồn đầu ca.
 * Ưu tiên index theo maNvl; dòng không có mã thì fallback theo tên.
 */
function sumMachineNvlKgByCodeForHeader(
  reports: MachineNvlSavedReport[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>,
  reportKind: 'dau_ca' | 'cuoi_ca'
) {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const report of reports) {
    if (report.reportKind !== reportKind) continue;
    const reportDate = parseProductionOrderFilterDate(report.ngay);
    if (
      !matchesShiftSummaryBucket(
        header.ngay,
        header.shift,
        reportDate || report.ngay,
        report.ca,
        shiftOptions
      )
    ) {
      continue;
    }

    for (const line of report.lines) {
      const code = normalizeMaterialCodeKey(line.maNvl || '');
      const name = String(line.tenNvl || '')
        .trim()
        .toUpperCase();
      const kg =
        reportKind === 'dau_ca' ? sumMachineNvlDauCaLineTotal(line) : sumMachineNvlCuoiCaLineTotal(line);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      if (code) {
        byCode.set(code, (byCode.get(code) || 0) + kg);
      } else if (name) {
        byName.set(name, (byName.get(name) || 0) + kg);
      }
    }
  }

  return { byCode, byName };
}

function lookupMachineNvlKgByMaterial(
  maps: { byCode: Map<string, number>; byName: Map<string, number> },
  materialCode: string,
  materialName: string
) {
  const code = normalizeMaterialCodeKey(materialCode);
  if (code && maps.byCode.has(code)) return maps.byCode.get(code) || 0;
  const name = String(materialName || '')
    .trim()
    .toUpperCase();
  if (name && maps.byName.has(name)) return maps.byName.get(name) || 0;
  return 0;
}

export type BbMaterialKgMaps = {
  byCode: Map<string, number>;
  byName: Map<string, number>;
};

/** Gom cột Tổng (kg) tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» theo mã/tên NVL. */
export function buildBbMaterialKgMapsFromTabLines(
  lines: ReadonlyArray<{ itemCode?: string; itemName?: string; weightKg?: number | null }> | null | undefined
): BbMaterialKgMaps {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const row of lines || []) {
    const kg = Number(row.weightKg);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    const code = normalizeMaterialCodeKey(row.itemCode || '');
    const name = String(row.itemName || '')
      .trim()
      .toUpperCase();
    if (code) byCode.set(code, (byCode.get(code) || 0) + kg);
    else if (name) byName.set(name, (byName.get(name) || 0) + kg);
  }
  return { byCode, byName };
}

export function buildBbCuoiCaKgMapsFromGroup(group: BbCuoiCaGroup | null | undefined): BbMaterialKgMaps {
  return buildBbMaterialKgMapsFromTabLines(group?.lines);
}

export function lookupBbMaterialKgByCodeOrName(
  maps: BbMaterialKgMaps,
  materialCode: string,
  materialName: string
): number {
  return lookupMachineNvlKgByMaterial(maps, materialCode, materialName);
}

/** KL 1 dòng tồn đầu ca CHỈ tính phần "đã trộn" (trong bồn trộn) + "chưa trộn" — không gồm trong máy/tồn ngoài. */
function sumMachineNvlDaTronChuaTronLineKg(line: MachineNvlSavedLine): number {
  let factor = resolveMachineNvlLineKgFactor(line);
  const hay = `${line.maNvl || ''} ${line.tenNvl || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const isLoi = line.loaiVatTu === 'loi' || hay.includes('loi') || /\bloi\b/.test(hay) || hay.startsWith('loi');
  const isBaoBi =
    line.loaiVatTu === 'bao_bi' ||
    hay.includes('tui') ||
    hay.includes('bao bi') ||
    hay.includes('tai nilon') ||
    hay.includes('bi nilon');
  if ((factor === null || factor <= 0) && (isLoi || isBaoBi)) factor = 1;
  const base = (line.soLuongTrongBonTron ?? 0) + (line.soLuongNlChuaTron ?? 0);
  if (!(base > 0)) return 0;
  if (factor === null || factor <= 0) return base;
  return base * factor;
}

/** Gom KL "đã trộn + chưa trộn" đầu ca theo mã NVL — dùng cho công thức cân bằng vật tư thực tế. */
function sumMachineNvlDaTronChuaTronKgByCodeForHeader(
  reports: MachineNvlSavedReport[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const report of reports) {
    if (report.reportKind !== 'dau_ca') continue;
    const reportDate = parseProductionOrderFilterDate(report.ngay);
    if (
      !matchesShiftSummaryBucket(header.ngay, header.shift, reportDate || report.ngay, report.ca, shiftOptions)
    ) {
      continue;
    }
    for (const line of report.lines) {
      const code = normalizeMaterialCodeKey(line.maNvl || '');
      const name = String(line.tenNvl || '').trim().toUpperCase();
      const kg = sumMachineNvlDaTronChuaTronLineKg(line);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      if (code) byCode.set(code, (byCode.get(code) || 0) + kg);
      else if (name) byName.set(name, (byName.get(name) || 0) + kg);
    }
  }

  return { byCode, byName };
}

/** Gom KL xuất kho thực tế theo mã NVL (khớp đúng itemCode/itemName, không qua tỉ lệ ước tính). */
function sumWarehouseExportKgByCodeForHeader(
  movements: ShiftSummaryWarehouseMovement[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>,
  materials: MaterialRow[]
) {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const movement of movements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) continue;
    const kg = resolveMovementExportKg(movement, materials);
    if (kg <= 0) continue;
    const code = normalizeMaterialCodeKey(movement.itemCode || '');
    const name = String(movement.itemName || '').trim().toUpperCase();
    if (code) byCode.set(code, (byCode.get(code) || 0) + kg);
    else if (name) byName.set(name, (byName.get(name) || 0) + kg);
  }

  return { byCode, byName };
}

/** Tổng KL lỗi hỏng đúng như tab «Dữ liệu trong báo cáo lỗi hỏng» cho 1 lệnh (ngày+ca+máy). */
function sumBbDamagedGoodsTabTotalKgForHeader(
  damagedRecords: WeighingRecord[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
  let total = 0;
  for (const record of getWeighingDataRows(damagedRecords)) {
    const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
    if (
      !matchesShiftSummaryBucket(
        header.ngay,
        header.shift,
        ngay || record.productionDate,
        record.shiftName,
        shiftOptions
      )
    ) {
      continue;
    }
    const machineMatched =
      machineValueMatchesFilter(header.machine, null, record.machineName) ||
      (isBbMachineText(record.machineName) && isBbMachineText(header.machine));
    if (!machineMatched) {
      // Giống tab: phiếu máy BB không khớp tên máy vẫn gắn các lệnh cùng ngày+ca.
      if (!isBbMachineText(record.machineName)) continue;
    }
    if (isDamagedOtherMaterial(record)) {
      const otherKg = resolveDamagedOtherMaterialKg(record);
      if (Number.isFinite(otherKg) && otherKg > 0) total += otherKg;
      continue;
    }
    const split = splitDamagedGoodsDefectWeights(record);
    if (!Number.isFinite(split.tong) || split.tong <= 0) continue;
    total += split.tong;
  }
  return roundQty(total, 4);
}

/** Map tỉ lệ trộn (%) theo mã/tên NVL — cùng nguồn tab lỗi hỏng (báo cáo phối trộn). */
function buildMixingTiLeTronMapsForHeader(
  mixingReports: MixingReport[],
  header: { ngay: string; shift: string; machine: string },
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[]
) {
  const lines = buildBbMixingMaterialLinesForShift({
    mixingReports,
    ngay: header.ngay,
    shift: header.shift,
    machine: header.machine,
    shiftSettings
  });
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const line of lines) {
    if (line.tiLeTronPercent === null || !Number.isFinite(line.tiLeTronPercent)) continue;
    const code = normalizeMaterialCodeKey(line.materialCode || '');
    const name = String(line.materialName || '')
      .trim()
      .toUpperCase();
    if (code) byCode.set(code, line.tiLeTronPercent);
    else if (name) byName.set(name, line.tiLeTronPercent);
  }
  return { byCode, byName };
}

function lookupMixingTiLeTronPercent(
  maps: { byCode: Map<string, number>; byName: Map<string, number> },
  materialCode: string,
  materialName: string
): number | null {
  const code = normalizeMaterialCodeKey(materialCode || '');
  if (code && maps.byCode.has(code)) return maps.byCode.get(code) ?? null;
  const name = String(materialName || '')
    .trim()
    .toUpperCase();
  if (name && maps.byName.has(name)) return maps.byName.get(name) ?? null;
  return null;
}

/** Tổng KL hàng lỗi hỏng (nhựa / lõi) khớp theo ngày + ca — dùng legacy (inbound cũ). */
function sumBbDamagedDefectKgForHeader(
  damagedRecords: WeighingRecord[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
  let nhuaLoiHongKg = 0;
  let loiLoiHongKg = 0;
  for (const record of getWeighingDataRows(damagedRecords)) {
    const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
    if (
      !matchesShiftSummaryBucket(
        header.ngay,
        header.shift,
        ngay || record.productionDate,
        record.shiftName,
        shiftOptions
      )
    ) {
      continue;
    }
    if (!isBbMachineText(record.machineName)) continue;
    const split = splitDamagedGoodsDefectWeights(record);
    if (!Number.isFinite(split.tong) || split.tong <= 0) continue;
    nhuaLoiHongKg += (split.nhuaKhongMang || 0) + (split.nhuaCucDauNong || 0) + (split.nhuaDinhMang || 0);
    loiLoiHongKg += split.loi || 0;
  }
  return { nhuaLoiHongKg, loiLoiHongKg };
}

type BbMaterialGroup = 'nhua' | 'loi' | 'tui' | 'other';

/** Phân nhóm NVL để phân bổ hàng lỗi hỏng đúng nhóm (nhựa lỗi hỏng → NVL nhựa; lõi lỗi hỏng → NVL lõi). */
function classifyBbMaterialGroup(code: string, name: string): BbMaterialGroup {
  if (isWarehouseCoreExportItem(code, name)) return 'loi';
  if (isWarehouseBagExportItem(code, name)) return 'tui';
  return 'nhua';
}

/** Mã tồn hỗn hợp dùng để phân bổ tồn đầu theo tỉ lệ TB thực tế cho các NVL khác. */
const NNS_TRON_MATERIAL_CODE = 'NNS-TRON';

export function isNnsTronMaterial(code: string, name = '') {
  if (isNnsTronMaterialCode(code)) return true;
  const nameKey = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    nameKey.includes('nns-tron') ||
    nameKey.includes('nnstron') ||
    (nameKey.includes('nhua nguyen sinh') && nameKey.includes('tai che'))
  );
}

function isNnsTronMaterialCode(code: string) {
  const key = normalizeMaterialCodeKey(code).replace(/[\s_]+/g, '-');
  return key === NNS_TRON_MATERIAL_CODE || key === 'NNSTRON';
}

export function lookupNnsTronTonDauKg(maps: BbMaterialKgMaps) {
  for (const [code, kg] of maps.byCode.entries()) {
    if (isNnsTronMaterialCode(code) && Number.isFinite(kg) && kg > 0) return kg;
  }
  for (const [name, kg] of maps.byName.entries()) {
    if (isNnsTronMaterial('', name) && Number.isFinite(kg) && kg > 0) return kg;
  }
  return 0;
}

type BbMixingShiftMaterialStat = {
  materialCode: string;
  materialName: string;
  unit: string;
  klSum: number;
  batchCount: number;
  tiLeDinhMucSum: number;
  tiLeDinhMucCount: number;
};

/** Gom KL NVL từ báo cáo trộn một ca.
 * Tổng trộn ca = tổng KL thực tế các NVL ĐVT = kg (không cộng Cái/m2…).
 * Tỉ lệ = KL NVL ÷ tổng trộn ca × 100.
 */
function buildBbMixingShiftStats(input: {
  mixingReports: MixingReport[];
  headerMachine: string;
  mixingNgay: string;
  mixingShift: string;
  shiftOptions: ReturnType<typeof getProductionShiftOptions>;
}): { byMaterial: Map<string, BbMixingShiftMaterialStat>; totalMixKg: number } {
  const byMaterial = new Map<string, BbMixingShiftMaterialStat>();

  for (const report of input.mixingReports) {
    if (
      !matchesShiftSummaryBucket(
        input.mixingNgay,
        input.mixingShift,
        report.ngay,
        report.ca,
        input.shiftOptions
      )
    ) {
      continue;
    }
    if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
    if (
      !machineValueMatchesFilter(input.headerMachine, null, report.ma_may, report.ten_may) &&
      !(isBbMachineText(input.headerMachine) && isBbMachineText(report.ma_may, report.ten_may))
    ) {
      continue;
    }

    const chiTiet = report.chi_tiet || [];
    for (let lineIdx = 0; lineIdx < chiTiet.length; lineIdx += 1) {
      const line = chiTiet[lineIdx];
      const lineCode = String(line.ma_nvl || '').trim();
      const lineName = String(line.ten_vat_tu || '').trim();
      let countedItemWeight = false;

      for (const roundKey of MIXING_ROUND_KEYS) {
        const items = getRoundItems(line.lan_su_dung, roundKey);
        if (items.length === 0) continue;

        const materialsInBatch = new Set<string>();

        for (const item of items) {
          const code = String(item.ma_nvl || lineCode || '').trim();
          const name = String(item.ten_vat_tu || lineName || '').trim();
          const key = materialIdentityKey(code, name);
          if (!key) continue;
          const unit = String(item.don_vi || line.don_vi || 'kg').trim() || 'kg';
          const countsForRatio = isBbMixingRatioKgUnit(unit);

          let stat = byMaterial.get(key);
          if (!stat) {
            stat = {
              materialCode: code,
              materialName: name,
              unit,
              klSum: 0,
              batchCount: 0,
              tiLeDinhMucSum: 0,
              tiLeDinhMucCount: 0
            };
            byMaterial.set(key, stat);
          } else {
            if (!stat.materialCode && code) stat.materialCode = code;
            if (!stat.materialName && name) stat.materialName = name;
            if (!stat.unit && unit) stat.unit = unit;
          }

          const dinhMuc = item.ti_le_phan_tram;
          if (dinhMuc !== null && dinhMuc !== undefined && Number.isFinite(dinhMuc)) {
            stat.tiLeDinhMucSum += dinhMuc;
            stat.tiLeDinhMucCount += 1;
          }

          if (!countsForRatio) continue;

          const klThucTe = item.kl_thuc_te;
          if (klThucTe !== null && klThucTe !== undefined && Number.isFinite(klThucTe) && klThucTe > 0) {
            countedItemWeight = true;
            stat.klSum += klThucTe;
            materialsInBatch.add(key);
          }
        }

        for (const key of materialsInBatch) {
          const stat = byMaterial.get(key);
          if (stat) stat.batchCount += 1;
        }
      }

      if (countedItemWeight) continue;
      const lineUnit = String(line.don_vi || 'kg').trim() || 'kg';
      if (!isBbMixingRatioKgUnit(lineUnit)) continue;
      const lineKl = resolveLineKlThucTe(line);
      if (lineKl === null || lineKl <= 0) continue;
      const key = materialIdentityKey(lineCode, lineName);
      if (!key) continue;
      let stat = byMaterial.get(key);
      if (!stat) {
        stat = {
          materialCode: lineCode,
          materialName: lineName,
          unit: lineUnit,
          klSum: 0,
          batchCount: 0,
          tiLeDinhMucSum: 0,
          tiLeDinhMucCount: 0
        };
        byMaterial.set(key, stat);
      }
      stat.klSum += lineKl;
    }
  }

  let totalMixKg = 0;
  for (const stat of byMaterial.values()) {
    if (!isBbMixingRatioKgUnit(stat.unit)) continue;
    if (Number.isFinite(stat.klSum) && stat.klSum > 0) totalMixKg += stat.klSum;
  }

  return { byMaterial, totalMixKg: roundQty(totalMixKg, 4) };
}

function resolveBbMixingShiftTiLeThucTeTbPercent(klSum: number, totalMixKg: number): number | null {
  if (!Number.isFinite(klSum) || klSum <= 0 || !Number.isFinite(totalMixKg) || totalMixKg <= 0) {
    return null;
  }
  return roundQty((klSum / totalMixKg) * 100, 4);
}

function lookupBbMixingShiftMaterialStat(
  byMaterial: Map<string, BbMixingShiftMaterialStat>,
  code: string,
  name: string
): BbMixingShiftMaterialStat | undefined {
  const key = materialIdentityKey(code, name);
  if (key && byMaterial.has(key)) return byMaterial.get(key);
  const codeKey = normalizeMaterialCodeKey(code);
  if (codeKey) {
    for (const [statKey, stat] of byMaterial.entries()) {
      if (statKey === codeKey || normalizeMaterialCodeKey(stat.materialCode) === codeKey) return stat;
    }
  }
  const nameKey = String(name || '').trim().toUpperCase();
  if (nameKey) {
    for (const stat of byMaterial.values()) {
      if (String(stat.materialName || '').trim().toUpperCase() === nameKey) return stat;
    }
  }
  return undefined;
}

/**
 * Lấy thống kê phiếu trộn theo nguồn tỉ lệ.
 * - Có `mixingRatioNgay` + `mixingRatioShift`: dùng đúng ngày/ca đó (vd chọn tay trên tab Tồn đầu ca).
 * - `mixingRatioMode: 'previous'`: ca liền trước của lệnh.
 * - Mặc định `'current'`: đúng ca hiện tại của lệnh SX.
 */
function resolveBbMixingShiftStatsForOrderHeader(input: {
  mixingReports: MixingReport[];
  headerMachine: string;
  headerNgay: string;
  headerShift: string;
  shiftOptions: ReturnType<typeof getProductionShiftOptions>;
  mixingRatioNgay?: string | null;
  mixingRatioShift?: string | null;
  mixingRatioMode?: 'current' | 'previous';
}): {
  stats: { byMaterial: Map<string, BbMixingShiftMaterialStat>; totalMixKg: number };
  mixingNgay: string | null;
  mixingShift: string | null;
  fromPreviousShift: boolean;
} {
  const empty = {
    byMaterial: new Map<string, BbMixingShiftMaterialStat>(),
    totalMixKg: 0
  };

  const overrideNgay = String(input.mixingRatioNgay || '').trim();
  const overrideShift = String(input.mixingRatioShift || '').trim();
  if (overrideNgay && overrideShift) {
    const overrideStats = buildBbMixingShiftStats({
      mixingReports: input.mixingReports,
      headerMachine: input.headerMachine,
      mixingNgay: overrideNgay,
      mixingShift: overrideShift,
      shiftOptions: input.shiftOptions
    });
    return {
      stats: overrideStats,
      mixingNgay: overrideNgay,
      mixingShift: overrideShift,
      fromPreviousShift: true
    };
  }

  if (input.mixingRatioMode === 'previous') {
    const previousShift = resolvePreviousProductionShift(
      input.headerNgay,
      input.headerShift,
      input.shiftOptions
    );
    if (previousShift) {
      const previousStats = buildBbMixingShiftStats({
        mixingReports: input.mixingReports,
        headerMachine: input.headerMachine,
        mixingNgay: previousShift.ngay,
        mixingShift: previousShift.shift,
        shiftOptions: input.shiftOptions
      });
      return {
        stats: previousStats,
        mixingNgay: previousShift.ngay,
        mixingShift: previousShift.shift,
        fromPreviousShift: true
      };
    }
  }

  const currentStats = buildBbMixingShiftStats({
    mixingReports: input.mixingReports,
    headerMachine: input.headerMachine,
    mixingNgay: input.headerNgay,
    mixingShift: input.headerShift,
    shiftOptions: input.shiftOptions
  });
  if (currentStats.byMaterial.size > 0) {
    return {
      stats: currentStats,
      mixingNgay: input.headerNgay,
      mixingShift: input.headerShift,
      fromPreviousShift: false
    };
  }

  return {
    stats: empty,
    mixingNgay: input.headerNgay,
    mixingShift: input.headerShift,
    fromPreviousShift: false
  };
}

/**
 * Bộ phân bổ "Tồn đầu ca" theo NVL cho 1 header (ngày+ca+máy), dùng chung công thức với tab
 * "Tổng vật tư thực xuất dùng": khi tồn đầu chỉ được ghi nhận gộp dưới mã NNS-TRON (hỗn hợp
 * chưa tách nguyên liệu), chia ngược NNS-TRON về từng NVL theo tỉ lệ định mức máy.
 */
function buildBbTonDauAllocationContext(params: {
  header: { ngay: string; shift: string; orderCode: string; machine: string };
  machines: MachineRow[];
  mixingReports: MixingReport[];
  shiftOptions: ReturnType<typeof getProductionShiftOptions>;
  nnsTronTonDauKg: number;
}): {
  nnsTronTonDauKg: number;
  resolveTiLeThucTeTbPercent: (code: string, name: string) => number | null;
  resolveTonDau: (
    code: string,
    name: string,
    directTonDauKg: number
  ) => { tonDauKg: number; fromNnsTron: boolean; tiLeThucTeTbPercent: number | null };
} {
  const { header, machines, nnsTronTonDauKg } = params;

  const machineRow = findBbMachineByLabel(machines, header.machine);
  const machineRatioByCode = new Map<string, number>();
  const machineRatioByName = new Map<string, number>();
  if (machineRow) {
    for (const ratio of machineRow.mixingRatios) {
      const pct = Number(String(ratio.percent ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(pct)) continue;
      const codeKey = normalizeProductCodeKey(ratio.materialCode);
      if (codeKey) machineRatioByCode.set(codeKey, pct);
      const nameKey = (ratio.materialName || '').trim().toLowerCase();
      if (nameKey) machineRatioByName.set(nameKey, pct);
    }
  }
  const resolveMachineDinhMuc = (code: string, name: string): number | null => {
    const codeKey = normalizeProductCodeKey(code);
    if (codeKey && machineRatioByCode.has(codeKey)) return machineRatioByCode.get(codeKey)!;
    const nameKey = (name || '').trim().toLowerCase();
    if (nameKey && machineRatioByName.has(nameKey)) return machineRatioByName.get(nameKey)!;
    return null;
  };

  // Phân bổ tồn đầu / tỉ lệ: luôn theo định mức máy (không lấy phiếu trộn).
  const resolveTiLeThucTeTbPercent = (code: string, name: string): number | null => {
    const fromMachine = resolveMachineDinhMuc(code, name);
    return fromMachine === null ? null : roundQty(fromMachine, 4);
  };

  return {
    nnsTronTonDauKg,
    resolveTiLeThucTeTbPercent,
    resolveTonDau: (code, name, directTonDauKg) => {
      if (isNnsTronMaterial(code, name) || nnsTronTonDauKg <= 0) {
        return { tonDauKg: directTonDauKg, fromNnsTron: false, tiLeThucTeTbPercent: null };
      }
      const tiLeThucTeTbPercent = resolveTiLeThucTeTbPercent(code, name);
      const useNnsTronTonDau =
        tiLeThucTeTbPercent !== null && Number.isFinite(tiLeThucTeTbPercent) && tiLeThucTeTbPercent > 0;
      return useNnsTronTonDau
        ? {
            tonDauKg: roundQty(nnsTronTonDauKg * (tiLeThucTeTbPercent / 100), 4),
            fromNnsTron: true,
            tiLeThucTeTbPercent
          }
        : { tonDauKg: directTonDauKg, fromNnsTron: false, tiLeThucTeTbPercent };
    }
  };
}

export type BbInboundBalanceDetailMetric =
  | 'ton_dau'
  | 'xuat_thuc_te'
  | 'loi_hong'
  | 'ton_cuoi'
  | 'thuc_te';

export const BB_INBOUND_BALANCE_METRIC_LABEL: Record<BbInboundBalanceDetailMetric, string> = {
  ton_dau: 'Tồn đầu ca (kg)',
  xuat_thuc_te: 'Xuất thực tế (kg)',
  loi_hong: 'Hàng lỗi hỏng (kg)',
  ton_cuoi: 'Tồn cuối ca (kg)',
  thuc_te: 'Trọng lượng thực tế (kg)'
};

export type BbInboundBalanceDetailColumn = { key: string; label: string; align?: 'left' | 'right' };
export type BbInboundBalanceDetailBag = {
  metric: BbInboundBalanceDetailMetric;
  title: string;
  subtitle: string;
  valueLabel: string;
  valueText: string;
  formula?: string;
  columns: BbInboundBalanceDetailColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
};

/**
 * Chi tiết nguồn số liệu khi bấm vào 1 trong 4 cột thành phần của công thức cân bằng vật tư thực tế
 * (tab "Tổng định mức vật tư của thành phẩm nhập kho"): Tồn đầu ca, Xuất thực tế, Hàng lỗi hỏng, Tồn cuối ca.
 */
export function buildBbInboundBalanceMetricDetail(input: {
  metric: BbInboundBalanceDetailMetric;
  itemCode: string;
  itemName: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  balanceDetail: BbInboundMaterialBalanceDetail | null;
  machineNvlReports: MachineNvlSavedReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  damagedRecords: WeighingRecord[];
  materials: MaterialRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): BbInboundBalanceDetailBag {
  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  const header = { ngay: input.ngay, shift: input.shift, orderCode: input.orderCode, machine: input.machine };
  const valueLabel = BB_INBOUND_BALANCE_METRIC_LABEL[input.metric];
  const subtitle = `${input.orderCode || '—'} · ${input.ngay || '—'} · ${input.shiftLabel || input.shift || '—'} · ${
    input.machine || '—'
  }`;
  const title = String(input.itemCode || '').trim()
    ? `${input.itemCode} · ${input.itemName || '—'}`
    : String(input.itemName || '').trim() || 'Tất cả NVL';
  const bd = input.balanceDetail;
  const target = { materialCode: input.itemCode, materialName: input.itemName };

  if (input.metric === 'thuc_te') {
    const tonDau = roundQty(bd?.tonDauKg ?? 0, 4);
    const xuat = roundQty(bd?.xuatThucTeKg ?? 0, 4);
    const loi = roundQty(bd?.loiHongKg ?? 0, 4);
    const tonCuoi = roundQty(bd?.tonCuoiKg ?? 0, 4);
    const baseReal = roundQty(bd?.realKg ?? Math.max(0, tonDau + xuat - loi - tonCuoi), 2);
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: `${baseReal} kg`,
      formula: `Trọng lượng thực tế = [Tồn đầu ca theo mã NVL (tab Tồn đầu ca)] (${tonDau}) + [Xuất thực tế] (${xuat}) − [Hàng lỗi hỏng] (${loi}) − [Tồn cuối ca] (${tonCuoi}) = ${baseReal} kg.`,
      columns: [
        { key: 'thanhPhan', label: 'Thành phần' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows: [
        { thanhPhan: 'Tồn đầu ca (theo mã NVL tab Tồn đầu ca)', weightKg: tonDau },
        { thanhPhan: 'Xuất thực tế', weightKg: xuat },
        { thanhPhan: 'Hàng lỗi hỏng (−)', weightKg: loi },
        { thanhPhan: 'Tồn cuối ca (−)', weightKg: tonCuoi },
        { thanhPhan: 'Trọng lượng thực tế', weightKg: baseReal }
      ]
    };
  }

  if (input.metric === 'ton_dau') {
    const rows: Array<Record<string, string | number | null | undefined>> = [];
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== 'dau_ca') continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(header.ngay, header.shift, reportDate || report.ngay, report.ca, shiftOptions)
      ) {
        continue;
      }
      report.lines.forEach((line, index) => {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        const isNns = isNnsTronMaterial(code, name);
        const matches = bd?.tonDauFromNnsTron ? isNns : materialMatchesLine(code, name, target);
        if (!matches) return;
        const kg = sumMachineNvlDaTronChuaTronLineKg(line);
        if (!Number.isFinite(kg) || kg <= 0) return;
        rows.push({
          ngay: report.ngay,
          ca: report.ca,
          may: report.tenMay || report.maMay || '',
          maNvl: code,
          tenNvl: name,
          donVi: line.donVi || '',
          bonTron: line.soLuongTrongBonTron,
          chuaTron: line.soLuongNlChuaTron,
          weightKg: roundQty(kg, 4),
          reportId: report.id || `dau_ca-${index}`
        });
      });
    }
    const formula = bd?.tonDauFromNnsTron
      ? `Chưa ghi nhận tồn đầu trực tiếp cho mã này (= ${roundQty(bd.tonDauDirectKg, 4)} kg) → phân bổ từ NNS-TRON: ${roundQty(
          bd.nnsTronTonDauKg, 4
        )} kg × Tỉ lệ TB thực tế ${
          bd.tiLeThucTeTbPercent !== null ? `${roundQty(bd.tiLeThucTeTbPercent, 4)}%` : '—'
        } = ${roundQty(bd.tonDauKg, 4)} kg.`
      : `Tồn đầu ghi nhận trực tiếp theo mã NVL (đã trộn trong bồn + chưa trộn) = ${roundQty(bd?.tonDauKg ?? 0, 4)} kg.`;
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: `${roundQty(bd?.tonDauKg ?? 0, 4)} kg`,
      formula,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'bonTron', label: 'SL bồn trộn', align: 'right' },
        { key: 'chuaTron', label: 'SL chưa trộn', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows
    };
  }

  if (input.metric === 'xuat_thuc_te') {
    const rows: Array<Record<string, string | number | null | undefined>> = [];
    for (const movement of input.warehouseMovements) {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
      if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) continue;
      const code = String(movement.itemCode || '').trim();
      const name = String(movement.itemName || '').trim();
      if (!materialMatchesLine(code, name, target)) continue;
      const kg = resolveMovementExportKg(movement, input.materials);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      rows.push({
        ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
        ca: movement.shift,
        soPhieu: movement.slipCode,
        maNvl: code,
        tenNvl: name,
        donVi: movement.unit,
        soLuong: movement.quantity,
        weightKg: roundQty(kg, 4)
      });
    }
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: `${roundQty(bd?.xuatThucTeKg ?? 0, 4)} kg`,
      formula: `Xuất thực tế = tổng KL các phiếu xuất kho NVL loại "xuất" khớp mã NVL, đúng ngày + ca = ${roundQty(
        bd?.xuatThucTeKg ?? 0, 4
      )} kg.`,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'soPhieu', label: 'Số phiếu' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuong', label: 'SL', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows
    };
  }

  if (input.metric === 'ton_cuoi') {
    const rows: Array<Record<string, string | number | null | undefined>> = [];
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== 'cuoi_ca') continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(header.ngay, header.shift, reportDate || report.ngay, report.ca, shiftOptions)
      ) {
        continue;
      }
      report.lines.forEach((line, index) => {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        if (!materialMatchesLine(code, name, target)) return;
        const kg = sumMachineNvlCuoiCaLineTotal(line);
        if (!Number.isFinite(kg) || kg <= 0) return;
        rows.push({
          ngay: report.ngay,
          ca: report.ca,
          may: report.tenMay || report.maMay || '',
          maNvl: code,
          tenNvl: name,
          donVi: line.donVi || '',
          soLuongTon: line.soLuongTon,
          weightKg: roundQty(kg, 4),
          reportId: report.id || `cuoi_ca-${index}`
        });
      });
    }
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: `${roundQty(bd?.tonCuoiKg ?? 0, 4)} kg`,
      formula: `Tồn cuối ca = tổng KL theo báo cáo kiểm tồn cuối ca khớp mã NVL, đúng ngày + ca = ${roundQty(
        bd?.tonCuoiKg ?? 0, 4
      )} kg.`,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuongTon', label: 'SL tồn', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows
    };
  }

  // loi_hong — cùng công thức tab «Dữ liệu trong báo cáo lỗi hỏng»
  const rows: Array<Record<string, string | number | null | undefined>> = [];
  for (const record of getWeighingDataRows(input.damagedRecords)) {
    const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
    if (
      !matchesShiftSummaryBucket(
        header.ngay,
        header.shift,
        ngay || record.productionDate,
        record.shiftName,
        shiftOptions
      )
    ) {
      continue;
    }
    const machineMatched =
      machineValueMatchesFilter(header.machine, null, record.machineName) ||
      (isBbMachineText(record.machineName) && isBbMachineText(header.machine));
    if (!machineMatched && !isBbMachineText(record.machineName)) continue;
    if (isDamagedOtherMaterial(record)) {
      const otherKg = resolveDamagedOtherMaterialKg(record);
      if (!(Number.isFinite(otherKg) && otherKg > 0) && !String(record.materialCode || '').trim()) continue;
      rows.push({
        ngay: record.productionDate || record.reportDate,
        ca: record.shiftName,
        documentNo: record.documentNo || '',
        productCode: record.materialCode || record.productCode || '',
        weightKg: roundQty(otherKg > 0 ? otherKg : 0, 4)
      });
      continue;
    }
    const split = splitDamagedGoodsDefectWeights(record);
    if (!Number.isFinite(split.tong) || split.tong <= 0) continue;
    rows.push({
      ngay: record.productionDate || record.reportDate,
      ca: record.shiftName,
      documentNo: record.documentNo || '',
      productCode: record.productCode || '',
      weightKg: roundQty(split.tong, 4)
    });
  }
  const formula =
    bd &&
    bd.loiHongTiLeTronPercent !== null &&
    bd.loiHongTiLeTronPercent !== undefined &&
    bd.loiHongGroupTotalKg > 0
      ? `Hàng lỗi hỏng = Tổng lỗi hỏng tab báo cáo lỗi hỏng (${roundQty(
          bd.loiHongGroupTotalKg, 4
        )} kg) × Tỉ lệ trộn (${roundQty(bd.loiHongTiLeTronPercent, 4)}%) = ${roundQty(bd.loiHongKg, 4)} kg.`
      : bd && bd.loiHongGroupTotalKg > 0
        ? `Có tổng lỗi hỏng tab ${roundQty(bd.loiHongGroupTotalKg, 4)} kg nhưng NVL này chưa có tỉ lệ trộn trong báo cáo phối trộn → không trừ.`
        : `Không có hàng lỗi hỏng trong tab báo cáo lỗi hỏng (ngày+ca+máy) → không trừ.`;
  return {
    metric: input.metric,
    title,
    subtitle,
    valueLabel,
    valueText: `${roundQty(bd?.loiHongKg ?? 0, 4)} kg`,
    formula,
    columns: [
      { key: 'ngay', label: 'Ngày' },
      { key: 'ca', label: 'Ca' },
      { key: 'documentNo', label: 'Phiếu' },
      { key: 'productCode', label: 'Mã SP' },
      { key: 'weightKg', label: 'TL lỗi hỏng phiếu (kg)', align: 'right' }
    ],
    rows
  };
}

type MixingThucDungAgg = {
  materialCode: string;
  materialName: string;
  unit: string;
  tiLeDinhMucSum: number;
  tiLeDinhMucCount: number;
  tiLeThucTeSum: number;
  tiLeThucTeCount: number;
  totalKlThucTe: number;
};

/** Thực dùng theo từng NVL: Xuất trong ca + tồn đầu − tồn cuối.
 * Tỉ lệ TB thực tế / phân bổ NNS-TRON: luôn theo định mức máy.
 */
export function buildBbThucDungLineRows(input: {
  productionOrders: ProductionOrderRow[];
  mixingReports: MixingReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbThucDungLineRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const rows: BbThucDungLineRow[] = [];

  for (const header of headers) {
    const byMaterial = new Map<string, MixingThucDungAgg>();
    // Tỉ lệ ĐM (%) lấy từ cấu hình "tỉ lệ trộn" của máy (Danh sách máy) theo từng NVL.
    const machineRow = findBbMachineByLabel(input.machines, header.machine);
    const machineRatioByCode = new Map<string, number>();
    const machineRatioByName = new Map<string, number>();
    if (machineRow) {
      for (const ratio of machineRow.mixingRatios) {
        const pct = Number(String(ratio.percent ?? '').trim().replace(',', '.'));
        if (!Number.isFinite(pct)) continue;
        const codeKey = normalizeProductCodeKey(ratio.materialCode);
        if (codeKey) machineRatioByCode.set(codeKey, pct);
        const nameKey = (ratio.materialName || '').trim().toLowerCase();
        if (nameKey) machineRatioByName.set(nameKey, pct);
      }
    }
    /** Tỉ lệ ĐM lấy thẳng từ Tỷ lệ trộn của máy theo NVL; không có thì để trống (—). */
    const resolveMachineDinhMuc = (code: string, name: string): number | null => {
      const codeKey = normalizeProductCodeKey(code);
      if (codeKey && machineRatioByCode.has(codeKey)) return machineRatioByCode.get(codeKey)!;
      const nameKey = (name || '').trim().toLowerCase();
      if (nameKey && machineRatioByName.has(nameKey)) return machineRatioByName.get(nameKey)!;
      return null;
    };
    const tonDauMaps = sumMachineNvlKgByCodeForHeader(
      input.machineNvlReports,
      header,
      shiftOptions,
      'dau_ca'
    );
    const tonCuoiMaps = sumMachineNvlKgByCodeForHeader(
      input.machineNvlReports,
      header,
      shiftOptions,
      'cuoi_ca'
    );
    const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonDauMaps);

    // Báº£ng thá»±c dÃ¹ng pháº£i hiá»ƒn thá»‹ Ä‘á»§ NVL cá»§a bÃ¡o cÃ¡o tá»“n cÃ¹ng ngÃ y + ca,
    // ká»ƒ cáº£ khi NVL Ä‘Ã³ khÃ´ng xuáº¥t hiá»‡n trong bÃ¡o cÃ¡o trá»™n.
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== 'dau_ca' && report.reportKind !== 'cuoi_ca') continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          reportDate || report.ngay,
          report.ca,
          shiftOptions
        )
      ) {
        continue;
      }
      for (const line of report.lines) {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        const key = materialIdentityKey(code, name);
        if (!key || byMaterial.has(key)) continue;
        byMaterial.set(key, {
          materialCode: code,
          materialName: name,
          unit: String(line.donVi || 'kg').trim() || 'kg',
          tiLeDinhMucSum: 0,
          tiLeDinhMucCount: 0,
          tiLeThucTeSum: 0,
          tiLeThucTeCount: 0,
          totalKlThucTe: 0
        });
      }
    }

    const xuatByMaterial = new Map<string, number>();
    for (const movement of input.warehouseMovements) {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
      if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) continue;
      const code = String(movement.itemCode || '').trim();
      const name = String(movement.itemName || '').trim();
      const key = materialIdentityKey(code, name);
      if (!key) continue;
      const kg = resolveMovementExportKg(movement, input.materials);
      if (!Number.isFinite(kg) || kg <= 0) continue;
      xuatByMaterial.set(key, (xuatByMaterial.get(key) || 0) + kg);
      if (!byMaterial.has(key)) {
        byMaterial.set(key, {
          materialCode: code,
          materialName: name,
          unit: String(movement.unit || 'kg').trim() || 'kg',
          tiLeDinhMucSum: 0,
          tiLeDinhMucCount: 0,
          tiLeThucTeSum: 0,
          tiLeThucTeCount: 0,
          totalKlThucTe: 0
        });
      }
    }
    for (const [key, kg] of xuatByMaterial.entries()) {
      xuatByMaterial.set(key, roundQty(kg, 4));
    }

    // Bổ sung mã NVL có trên phiếu trộn ca (để hiện đủ dòng); tỉ lệ vẫn lấy ĐM máy.
    const mixingResolved = resolveBbMixingShiftStatsForOrderHeader({
      mixingReports: input.mixingReports,
      headerMachine: header.machine,
      headerNgay: header.ngay,
      headerShift: header.shift,
      shiftOptions
    });
    const mixingShiftStats = mixingResolved.stats;

    for (const [key, stat] of mixingShiftStats.byMaterial.entries()) {
      if (byMaterial.has(key)) continue;
      byMaterial.set(key, {
        materialCode: stat.materialCode,
        materialName: stat.materialName,
        unit: stat.unit,
        tiLeDinhMucSum: stat.tiLeDinhMucSum,
        tiLeDinhMucCount: stat.tiLeDinhMucCount,
        tiLeThucTeSum: 0,
        tiLeThucTeCount: 0,
        totalKlThucTe: stat.klSum
      });
    }

    if (byMaterial.size === 0) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    for (const [materialKey, agg] of byMaterial.entries()) {
      // Đã phân bổ NNS-TRON xuống NVL khác → ẩn dòng NNS-TRON, không tính vào báo cáo.
      if (isNnsTronMaterial(agg.materialCode, agg.materialName) && nnsTronTonDauKg > 0) {
        continue;
      }
      const tiLeDinhMucPercent = (() => {
        const fromMachine = resolveMachineDinhMuc(agg.materialCode, agg.materialName);
        return fromMachine === null ? null : roundQty(fromMachine, 4);
      })();
      // Tính hết theo định mức: tỉ lệ TB thực tế = ĐM (không lấy phiếu trộn).
      const tiLeThucTeTbPercent = tiLeDinhMucPercent;
      const mixingShiftMaterialKg = null;
      const mixingShiftTotalKg = null;
      // Xuất trong ca = KL phiếu xuất kho NVL của mã này trong ca hiện tại.
      const xuatTrongCaKg = xuatByMaterial.get(materialKey) || 0;
      const trongLuongDaTronKg = xuatTrongCaKg;
      const directTonDauKg = roundQty(
        lookupMachineNvlKgByMaterial(tonDauMaps, agg.materialCode, agg.materialName),
        3
      );
      // Có NNS-TRON tồn đầu → điền tồn đầu các NVL khác = NNS-TRON × tỉ lệ TB thực tế.
      const useNnsTronTonDau =
        !isNnsTronMaterial(agg.materialCode, agg.materialName) &&
        nnsTronTonDauKg > 0 &&
        tiLeThucTeTbPercent !== null &&
        Number.isFinite(tiLeThucTeTbPercent) &&
        tiLeThucTeTbPercent > 0;
      const tonDauKg = useNnsTronTonDau
        ? roundQty(nnsTronTonDauKg * (tiLeThucTeTbPercent / 100), 4)
        : directTonDauKg;
      const tonCuoiKg = roundQty(
        lookupMachineNvlKgByMaterial(tonCuoiMaps, agg.materialCode, agg.materialName),
        3
      );
      // Thực dùng (kg) = Xuất trong ca + Tồn đầu − Tồn cuối
      const weightKg = computeMaterialUsageKg(xuatTrongCaKg, tonDauKg, tonCuoiKg);
      if (
        (!Number.isFinite(weightKg) || weightKg === 0) &&
        xuatTrongCaKg <= 0 &&
        tonDauKg <= 0 &&
        tonCuoiKg <= 0
      ) {
        continue;
      }
      rows.push({
        key: `${header.orderCode}|${header.ngay}|${header.shift}|${materialKey}`,
        ngay: header.ngay,
        shift: header.shift,
        shiftLabel,
        orderCode: header.orderCode,
        machine: header.machine,
        materialCode: agg.materialCode,
        materialName: agg.materialName,
        unit: agg.unit,
        tiLeDinhMucPercent,
        tiLeThucTeTbPercent,
        batchCount: 0,
        xuatTrongCaKg,
        trongLuongDaTronKg,
        tonDauKg,
        tonDauFromNnsTron: useNnsTronTonDau,
        nnsTronTonDauKg: useNnsTronTonDau ? nnsTronTonDauKg : null,
        tiLeThucTeSourceNgay: header.ngay,
        tiLeThucTeSourceShift: header.shift,
        mixingShiftMaterialKg,
        mixingShiftTotalKg,
        tonCuoiKg,
        weightKg: roundQty(weightKg, 4)
      });
    }
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    return a.materialName.localeCompare(b.materialName, 'vi');
  });
}

export function sumBbThucDungWeightKg(rows: BbThucDungLineRow[]) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.weightKg) ? row.weightKg : 0), 0);
}

export type BbThucDungDetailMetric =
  | 'ti_le_dinh_muc'
  | 'ti_le_thuc_te'
  | 'trong_luong_da_tron'
  | 'ton_dau'
  | 'ton_cuoi'
  | 'thuc_dung'
  | 'so_me';

export const BB_THUC_DUNG_DETAIL_METRIC_LABEL: Record<BbThucDungDetailMetric, string> = {
  ti_le_dinh_muc: 'Tỉ lệ định mức (%)',
  ti_le_thuc_te: 'Tỉ lệ TB thực tế (%)',
  trong_luong_da_tron: 'Xuất trong ca (kg)',
  ton_dau: 'Tồn đầu (kg)',
  ton_cuoi: 'Tồn cuối (kg)',
  thuc_dung: 'Thực dùng (kg)',
  so_me: 'Số mẻ có KL thực tế'
};

export type BbThucDungDetailColumn = { key: string; label: string; align?: 'left' | 'right' };
export type BbThucDungDetailRow = {
  metric: BbThucDungDetailMetric;
  title: string;
  subtitle: string;
  valueLabel: string;
  valueText: string;
  formula?: string;
  columns: BbThucDungDetailColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
};

export type BbThucDungDetailView = BbThucDungDetailRow;

function materialCodeMatches(left: string, right: string) {
  const a = normalizeMaterialCodeKey(left);
  const b = normalizeMaterialCodeKey(right);
  return Boolean(a && b && a === b);
}

function materialNameMatches(left: string, right: string) {
  const a = String(left || '')
    .trim()
    .toUpperCase();
  const b = String(right || '')
    .trim()
    .toUpperCase();
  return Boolean(a && b && a === b);
}

function materialMatchesLine(
  code: string,
  name: string,
  target: Pick<BbThucDungLineRow, 'materialCode' | 'materialName'>
) {
  if (target.materialCode && code) return materialCodeMatches(code, target.materialCode);
  if (target.materialCode && !code) return materialNameMatches(name, target.materialName);
  if (!target.materialCode) return materialNameMatches(name, target.materialName) || materialCodeMatches(code, name);
  return materialCodeMatches(code, target.materialCode) || materialNameMatches(name, target.materialName);
}

/** Chi tiết nguồn số liệu khi bấm vào ô số tab thực xuất dùng & tỉ lệ trộn. */
export function buildBbThucDungMetricDetail(input: {
  line: BbThucDungLineRow;
  metric: BbThucDungDetailMetric;
  mixingReports: MixingReport[];
  machineNvlReports: MachineNvlSavedReport[];
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  materials?: MaterialRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): BbThucDungDetailRow {
  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  const header = {
    ngay: input.line.ngay,
    shift: input.line.shift,
    orderCode: input.line.orderCode,
    machine: input.line.machine
  };
  const valueLabel = BB_THUC_DUNG_DETAIL_METRIC_LABEL[input.metric];
  const subtitle = `${input.line.orderCode || '—'} · ${input.line.ngay || '—'} · ${
    input.line.shiftLabel || input.line.shift || '—'
  } · ${input.line.machine || '—'}`;
  const title = `${input.line.materialCode || '—'} · ${input.line.materialName || '—'}`;

  const formatValue = () => {
    switch (input.metric) {
      case 'ti_le_dinh_muc':
        return input.line.tiLeDinhMucPercent === null || input.line.tiLeDinhMucPercent === undefined
          ? '—'
          : `${roundQty(input.line.tiLeDinhMucPercent, 4)}%`;
      case 'ti_le_thuc_te':
        return input.line.tiLeThucTeTbPercent === null || input.line.tiLeThucTeTbPercent === undefined
          ? '—'
          : `${roundQty(input.line.tiLeThucTeTbPercent, 4)}%`;
      case 'so_me':
        return String(input.line.batchCount || 0);
      case 'trong_luong_da_tron':
        return `${roundQty(input.line.xuatTrongCaKg, 4)} kg`;
      case 'ton_dau':
        return `${roundQty(input.line.tonDauKg, 4)} kg`;
      case 'ton_cuoi':
        return `${roundQty(input.line.tonCuoiKg, 4)} kg`;
      case 'thuc_dung':
        return `${roundQty(input.line.weightKg, 4)} kg`;
      default:
        return '—';
    }
  };

  const previousShiftNote = 'Tỉ lệ TB thực tế = Tỉ lệ ĐM máy (%)';

  const xuatTrongCaFormula = `Xuất trong ca = tổng KL phiếu xuất kho NVL của mã này trong ca hiện tại = ${roundQty(
    input.line.xuatTrongCaKg, 4
  )} kg`;

  const tiLeThucTePercentFormula = `${previousShiftNote} (${
    input.line.tiLeThucTeTbPercent !== null && input.line.tiLeThucTeTbPercent !== undefined
      ? `${roundQty(input.line.tiLeThucTeTbPercent, 4)}%`
      : input.line.tiLeDinhMucPercent !== null && input.line.tiLeDinhMucPercent !== undefined
        ? `${roundQty(input.line.tiLeDinhMucPercent, 4)}%`
        : '—'
  }).`;

  const isMixingMetric = input.metric === 'ti_le_dinh_muc';
  const isXuatMetric = input.metric === 'trong_luong_da_tron' || input.metric === 'thuc_dung';
  const isTonDauMetric = input.metric === 'ton_dau' || input.metric === 'thuc_dung';
  const isTonCuoiMetric = input.metric === 'ton_cuoi' || input.metric === 'thuc_dung';

  const xuatRows: Array<Record<string, string | number | null | undefined>> = [];
  if (isXuatMetric && Array.isArray(input.warehouseMovements)) {
    const materials = input.materials || [];
    for (const movement of input.warehouseMovements) {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
      if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) continue;
      const code = String(movement.itemCode || '').trim();
      const name = String(movement.itemName || '').trim();
      if (!materialMatchesLine(code, name, input.line)) continue;
      const kg = resolveMovementExportKg(movement, materials);
      xuatRows.push({
        ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
        ca: movement.shift,
        soPhieu: movement.slipCode,
        maNvl: code,
        tenNvl: name,
        donVi: movement.unit,
        soLuong: movement.quantity,
        weightKg: Number.isFinite(kg) ? roundQty(kg, 4) : 0
      });
    }
  }

  const mixingRows: Array<Record<string, string | number | null | undefined>> = [];
  if (isMixingMetric) {
    for (const report of input.mixingReports) {
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          report.ngay,
          report.ca,
          shiftOptions
        )
      ) {
        continue;
      }
      if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
      if (
        !machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) &&
        !(isBbMachineText(header.machine) && isBbMachineText(report.ma_may, report.ten_may))
      ) {
        continue;
      }

      for (const line of report.chi_tiet || []) {
        for (const roundKey of MIXING_ROUND_KEYS) {
          const items = getRoundItems(line.lan_su_dung, roundKey);
          if (items.length === 0) continue;
          const batchWeight =
            getRoundBatchWeight(line.lan_su_dung, roundKey) ??
            roundNormWeight(items.reduce((sum, item) => sum + (item.so_luong ?? item.kl_thuc_te ?? 0), 0));
          const roundLabel = roundKey.replace('lan_', 'Lần ');

          for (const item of items) {
            const code = String(item.ma_nvl || line.ma_nvl || '').trim();
            const name = String(item.ten_vat_tu || line.ten_vat_tu || '').trim();
            if (!materialMatchesLine(code, name, input.line)) continue;
            const kl = item.kl_thuc_te;
            const tiLeTt =
              kl !== null &&
              kl !== undefined &&
              Number.isFinite(kl) &&
              batchWeight &&
              batchWeight > 0
                ? roundQty((kl / batchWeight) * 100, 4)
                : null;
            mixingRows.push({
              ngay: report.ngay,
              ca: report.ca,
              may: report.ten_may || report.ma_may || '',
              lan: roundLabel,
              maNvl: code,
              tenNvl: name,
              tiLeDm: item.ti_le_phan_tram,
              klThucTe: kl,
              tiLeTt,
              batchWeight: batchWeight ?? null
            });
          }
        }
      }
    }
  }

  const tonRows: Array<Record<string, string | number | null | undefined>> = [];
  const pushTonRows = (reportKind: 'dau_ca' | 'cuoi_ca') => {
    const useNnsTonDauSource = reportKind === 'dau_ca' && Boolean(input.line.tonDauFromNnsTron);
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== reportKind) continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          reportDate || report.ngay,
          report.ca,
          shiftOptions
        )
      ) {
        continue;
      }
      report.lines.forEach((line, index) => {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        if (useNnsTonDauSource) {
          if (!isNnsTronMaterial(code, name)) return;
        } else if (!materialMatchesLine(code, name, input.line)) {
          return;
        }
        const kg =
          reportKind === 'dau_ca'
            ? sumMachineNvlDauCaLineTotal(line)
            : sumMachineNvlCuoiCaLineTotal(line);
        tonRows.push({
          loai:
            reportKind === 'dau_ca'
              ? useNnsTonDauSource
                ? 'Nguồn NNS-TRON (tồn đầu)'
                : 'Tồn đầu ca'
              : 'Tồn cuối ca',
          ngay: report.ngay,
          ca: report.ca,
          may: report.tenMay || report.maMay || '',
          maNvl: code,
          tenNvl: name,
          donVi: line.donVi || '',
          soLuongTon: line.soLuongTon,
          trongMay: line.soLuongTrongMay,
          bonTron: line.soLuongTrongBonTron,
          chuaTron: line.soLuongNlChuaTron,
          tonNgoai: line.soLuongTonNgoai,
          weightKg: Number.isFinite(kg) ? roundQty(kg, 4) : 0,
          reportId: report.id || `${reportKind}-${index}`
        });
      });
    }
    if (
      useNnsTonDauSource &&
      input.line.nnsTronTonDauKg !== null &&
      input.line.tiLeThucTeTbPercent !== null
    ) {
      tonRows.push({
        loai: 'Phân bổ về NVL đang xem',
        ngay: header.ngay,
        ca: header.shift,
        may: header.machine,
        maNvl: input.line.materialCode,
        tenNvl: input.line.materialName,
        donVi: input.line.unit || 'kg',
        soLuongTon: null,
        trongMay: null,
        bonTron: `NNS-TRON × ${roundQty(input.line.tiLeThucTeTbPercent, 4)}%`,
        chuaTron: null,
        tonNgoai: null,
        weightKg: roundQty(input.line.tonDauKg, 4),
        reportId: 'nns-tron-allocated'
      });
    }
  };
  if (isTonDauMetric) pushTonRows('dau_ca');
  if (isTonCuoiMetric) pushTonRows('cuoi_ca');

  if (input.metric === 'ton_dau' || input.metric === 'ton_cuoi') {
    const tonDauFormula =
      input.metric === 'ton_dau' &&
      input.line.tonDauFromNnsTron &&
      input.line.nnsTronTonDauKg !== null &&
      input.line.tiLeThucTeTbPercent !== null
        ? `Tồn đầu = NNS-TRON (${roundQty(input.line.nnsTronTonDauKg, 4)} kg) × Tỉ lệ ĐM (${roundQty(
            input.line.tiLeThucTeTbPercent, 4
          )}%) = ${roundQty(input.line.tonDauKg, 4)} kg`
        : undefined;
    const fromNns = input.metric === 'ton_dau' && Boolean(input.line.tonDauFromNnsTron);
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: tonDauFormula,
      columns: fromNns
        ? [
            { key: 'loai', label: 'Nguồn' },
            { key: 'ngay', label: 'Ngày' },
            { key: 'ca', label: 'Ca' },
            { key: 'may', label: 'Máy' },
            { key: 'maNvl', label: 'Mã NVL' },
            { key: 'tenNvl', label: 'Tên NVL' },
            { key: 'donVi', label: 'ĐVT' },
            { key: 'bonTron', label: 'Bồn trộn / ghi chú', align: 'right' },
            { key: 'chuaTron', label: 'Chưa trộn', align: 'right' },
            { key: 'weightKg', label: 'TL (kg)', align: 'right' }
          ]
        : [
            { key: 'ngay', label: 'Ngày' },
            { key: 'ca', label: 'Ca' },
            { key: 'may', label: 'Máy' },
            { key: 'maNvl', label: 'Mã NVL' },
            { key: 'tenNvl', label: 'Tên NVL' },
            { key: 'donVi', label: 'ĐVT' },
            { key: 'soLuongTon', label: 'SL tồn', align: 'right' },
            { key: 'weightKg', label: 'TL (kg)', align: 'right' }
          ],
      rows: tonRows
    };
  }

  if (input.metric === 'thuc_dung') {
    const tonDauPart =
      input.line.tonDauFromNnsTron &&
      input.line.nnsTronTonDauKg !== null &&
      input.line.tiLeThucTeTbPercent !== null
        ? `Tồn đầu (${roundQty(input.line.tonDauKg, 4)} = NNS-TRON ${roundQty(
            input.line.nnsTronTonDauKg, 4
          )} × ${roundQty(input.line.tiLeThucTeTbPercent, 4)}%)`
        : `Tồn đầu (${roundQty(input.line.tonDauKg, 4)})`;
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: `${xuatTrongCaFormula}. Thực dùng (kg) = Xuất trong ca (${roundQty(
        input.line.xuatTrongCaKg, 4
      )}) + ${tonDauPart} − Tồn cuối (${roundQty(input.line.tonCuoiKg, 4)}) = ${roundQty(
        input.line.weightKg, 4
      )} kg`,
      columns: [
        { key: 'nguon', label: 'Nguồn' },
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'chiTiet', label: 'Chi tiết' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows: [
        ...xuatRows.map(row => ({
          nguon: 'Phiếu xuất NVL',
          ngay: row.ngay,
          ca: row.ca,
          may: row.soPhieu,
          maNvl: row.maNvl,
          tenNvl: row.tenNvl,
          chiTiet: row.donVi || '',
          weightKg: row.weightKg
        })),
        ...tonRows.map(row => ({
          nguon: row.loai,
          ngay: row.ngay,
          ca: row.ca,
          may: row.may,
          maNvl: row.maNvl,
          tenNvl: row.tenNvl,
          chiTiet: row.donVi || '',
          weightKg: row.weightKg
        }))
      ]
    };
  }

  if (input.metric === 'trong_luong_da_tron') {
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: xuatTrongCaFormula,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'soPhieu', label: 'Số phiếu' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuong', label: 'SL', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows: xuatRows
    };
  }

  return {
    metric: input.metric,
    title,
    subtitle,
    valueLabel,
    valueText: formatValue(),
    formula: input.metric === 'ti_le_thuc_te' ? tiLeThucTePercentFormula : undefined,
    columns: [
      { key: 'ngay', label: 'Ngày' },
      { key: 'ca', label: 'Ca' },
      { key: 'may', label: 'Máy' },
      { key: 'lan', label: 'Mẻ/Lần' },
      { key: 'maNvl', label: 'Mã NVL' },
      { key: 'tenNvl', label: 'Tên NVL' },
      { key: 'tiLeDm', label: 'Tỉ lệ ĐM (%)', align: 'right' },
      { key: 'klThucTe', label: 'KL thực tế (kg)', align: 'right' },
      { key: 'tiLeTt', label: 'Tỉ lệ TT (%)', align: 'right' },
      { key: 'batchWeight', label: 'KL mẻ (kg)', align: 'right' }
    ],
    rows: mixingRows
  };
}

export type BbTongHopThucXuatDetailMetric = 'ton_dau' | 'xuat_thuc_te' | 'ton_cuoi' | 'thuc_dung';

const BB_TONG_HOP_THUC_XUAT_DETAIL_LABEL: Record<BbTongHopThucXuatDetailMetric, string> = {
  ton_dau: 'Tồn đầu ca (kg)',
  xuat_thuc_te: 'Xuất thực tế (kg)',
  ton_cuoi: 'Tồn cuối ca (kg)',
  thuc_dung: 'Thực dùng (kg)'
};

/** Chi tiết công thức / nguồn khi bấm số trên tab Tổng hợp vật tư thực xuất dùng. */
export function buildBbTongHopThucXuatMetricDetail(input: {
  line: BbTongHopThucXuatLineRow;
  metric: BbTongHopThucXuatDetailMetric;
  machineNvlReports: MachineNvlSavedReport[];
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  materials?: MaterialRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): BbThucDungDetailView {
  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  const header = {
    ngay: input.line.ngay,
    shift: input.line.shift,
    orderCode: input.line.orderCode,
    machine: input.line.machine
  };
  const materialTarget = {
    materialCode: input.line.materialCode,
    materialName: input.line.materialName
  };
  const valueLabel = BB_TONG_HOP_THUC_XUAT_DETAIL_LABEL[input.metric];
  const productNote = input.line.productCode || input.line.productName
    ? ` · SP ${input.line.productCode || '—'} ${input.line.productName || ''}`.trim()
    : '';
  const subtitle = `${input.line.orderCode || '—'} · ${input.line.ngay || '—'} · ${
    input.line.shiftLabel || input.line.shift || '—'
  } · ${input.line.machine || '—'}${productNote}`;
  const title = `${input.line.materialCode || '—'} · ${input.line.materialName || '—'}`;
  const share = Number.isFinite(input.line.share) && input.line.share > 0 ? input.line.share : 1;
  const shareNote =
    share > 0 && share < 1
      ? ` Phân bổ theo SP: × ${(share * 100).toFixed(2)}% (toàn ca ${roundQty(
          input.metric === 'ton_dau'
            ? input.line.baseTonDauKg
            : input.metric === 'xuat_thuc_te'
              ? input.line.baseXuatTrongCaKg
              : input.metric === 'ton_cuoi'
                ? input.line.baseTonCuoiKg
                : input.line.baseThucDungKg, 4
        )} kg → ${roundQty(
          input.metric === 'ton_dau'
            ? input.line.tonDauKg
            : input.metric === 'xuat_thuc_te'
              ? input.line.xuatTrongCaKg
              : input.metric === 'ton_cuoi'
                ? input.line.tonCuoiKg
                : input.line.thucDungKg, 4
        )} kg).`
      : '';

  const formatValue = () => {
    switch (input.metric) {
      case 'ton_dau':
        return `${roundQty(input.line.tonDauKg, 4)} kg`;
      case 'xuat_thuc_te':
        return `${roundQty(input.line.xuatTrongCaKg, 4)} kg`;
      case 'ton_cuoi':
        return `${roundQty(input.line.tonCuoiKg, 4)} kg`;
      case 'thuc_dung':
        return `${roundQty(input.line.thucDungKg, 4)} kg`;
      default:
        return '—';
    }
  };

  const mappedMetric: BbThucDungDetailMetric =
    input.metric === 'xuat_thuc_te' ? 'trong_luong_da_tron' : input.metric;

  const xuatRows: Array<Record<string, string | number | null | undefined>> = [];
  if (
    (input.metric === 'xuat_thuc_te' || input.metric === 'thuc_dung') &&
    Array.isArray(input.warehouseMovements)
  ) {
    const materials = input.materials || [];
    for (const movement of input.warehouseMovements) {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
      if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) continue;
      const code = String(movement.itemCode || '').trim();
      const name = String(movement.itemName || '').trim();
      if (!materialMatchesLine(code, name, materialTarget)) continue;
      const kg = resolveMovementExportKg(movement, materials);
      xuatRows.push({
        ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
        ca: movement.shift,
        soPhieu: movement.slipCode,
        maNvl: code,
        tenNvl: name,
        donVi: movement.unit,
        soLuong: movement.quantity,
        weightKg: Number.isFinite(kg) ? roundQty(kg, 4) : 0
      });
    }
  }

  const tonDauRows: Array<Record<string, string | number | null | undefined>> = [];
  if (input.metric === 'ton_dau' || input.metric === 'thuc_dung') {
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== 'dau_ca') continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          reportDate || report.ngay,
          report.ca,
          shiftOptions
        )
      ) {
        continue;
      }
      report.lines.forEach((line, index) => {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        if (!materialMatchesLine(code, name, materialTarget)) return;
        // Cùng công thức tab «Tồn đầu ca».
        const kg = sumMachineNvlDauCaLineTotal(line);
        const quantity =
          Number.isFinite(line.soLuongTon) && line.soLuongTon > 0
            ? line.soLuongTon
            : (line.soLuongTrongMay ?? 0) +
              (line.soLuongTrongBonTron ?? 0) +
              (line.soLuongNlChuaTron ?? 0) +
              (line.soLuongTonNgoai ?? 0);
        tonDauRows.push({
          loai: 'Tồn đầu ca',
          ngay: report.ngay,
          ca: report.ca,
          may: report.tenMay || report.maMay || '',
          maNvl: code,
          tenNvl: name,
          donVi: line.donVi || '',
          soLuongTon: Number.isFinite(quantity) ? quantity : 0,
          trongMay: line.soLuongTrongMay,
          bonTron: line.soLuongTrongBonTron,
          chuaTron: line.soLuongNlChuaTron,
          tonNgoai: line.soLuongTonNgoai,
          weightKg: Number.isFinite(kg) ? roundQty(kg, 4) : 0,
          reportId: report.id || `dau-${index}`
        });
      });
    }
  }

  const tonCuoiRows: Array<Record<string, string | number | null | undefined>> = [];
  if (input.metric === 'ton_cuoi' || input.metric === 'thuc_dung') {
    for (const report of input.machineNvlReports) {
      if (report.reportKind !== 'cuoi_ca') continue;
      const reportDate = parseProductionOrderFilterDate(report.ngay);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          reportDate || report.ngay,
          report.ca,
          shiftOptions
        )
      ) {
        continue;
      }
      report.lines.forEach((line, index) => {
        const code = String(line.maNvl || '').trim();
        const name = String(line.tenNvl || '').trim();
        if (!materialMatchesLine(code, name, materialTarget)) return;
        const kg = sumMachineNvlCuoiCaLineTotal(line);
        tonCuoiRows.push({
          loai: 'Tồn cuối ca',
          ngay: report.ngay,
          ca: report.ca,
          may: report.tenMay || report.maMay || '',
          maNvl: code,
          tenNvl: name,
          donVi: line.donVi || '',
          soLuongTon: line.soLuongTon,
          weightKg: Number.isFinite(kg) ? roundQty(kg, 4) : 0,
          reportId: report.id || `cuoi-${index}`
        });
      });
    }
  }

  if (input.metric === 'ton_dau') {
    return {
      metric: mappedMetric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: `Tồn đầu ca lấy từ tab «Báo cáo dữ liệu tồn đầu ca» = ${roundQty(
        input.line.baseTonDauKg, 4
      )} kg (toàn ca).${shareNote}`,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuongTon', label: 'SL', align: 'right' },
        { key: 'trongMay', label: 'Trong máy', align: 'right' },
        { key: 'bonTron', label: 'Bồn trộn', align: 'right' },
        { key: 'chuaTron', label: 'Chưa trộn', align: 'right' },
        { key: 'tonNgoai', label: 'Tồn ngoài', align: 'right' },
        { key: 'weightKg', label: 'Tổng (kg)', align: 'right' }
      ],
      rows: tonDauRows
    };
  }

  if (input.metric === 'ton_cuoi') {
    return {
      metric: mappedMetric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: `Tồn cuối ca lấy từ tab «Dữ liệu trong báo cáo kiểm tồn cuối ca» = ${roundQty(
        input.line.baseTonCuoiKg, 4
      )} kg (toàn ca).${shareNote}`,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuongTon', label: 'SL tồn', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows: tonCuoiRows
    };
  }

  if (input.metric === 'xuat_thuc_te') {
    return {
      metric: mappedMetric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: `Xuất thực tế lấy từ tab «Dữ liệu trong phiếu xuất kho vật tư» = ${roundQty(
        input.line.baseXuatTrongCaKg, 4
      )} kg (toàn ca).${shareNote}`,
      columns: [
        { key: 'ngay', label: 'Ngày' },
        { key: 'ca', label: 'Ca' },
        { key: 'soPhieu', label: 'Số phiếu' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'donVi', label: 'ĐVT' },
        { key: 'soLuong', label: 'SL', align: 'right' },
        { key: 'weightKg', label: 'TL (kg)', align: 'right' }
      ],
      rows: xuatRows
    };
  }

  const tonDauPart = `Tồn đầu ca (${roundQty(input.line.tonDauKg, 4)})`;

  return {
    metric: mappedMetric,
    title,
    subtitle,
    valueLabel,
    valueText: formatValue(),
    formula: `Thực dùng (kg) = ${tonDauPart} + Xuất thực tế (${roundQty(
      input.line.xuatTrongCaKg, 4
    )}) − Tồn cuối ca (${roundQty(input.line.tonCuoiKg, 4)}) = ${roundQty(
      input.line.thucDungKg, 4
    )} kg.${shareNote}`,
    columns: [
      { key: 'nguon', label: 'Nguồn' },
      { key: 'ngay', label: 'Ngày' },
      { key: 'ca', label: 'Ca' },
      { key: 'may', label: 'Máy / Phiếu' },
      { key: 'maNvl', label: 'Mã NVL' },
      { key: 'tenNvl', label: 'Tên NVL' },
      { key: 'chiTiet', label: 'Chi tiết' },
      { key: 'weightKg', label: 'TL (kg)', align: 'right' }
    ],
    rows: [
      ...xuatRows.map(row => ({
        nguon: 'Xuất thực tế',
        ngay: row.ngay,
        ca: row.ca,
        may: row.soPhieu,
        maNvl: row.maNvl,
        tenNvl: row.tenNvl,
        chiTiet: row.donVi || '',
        weightKg: row.weightKg
      })),
      ...tonDauRows.map(row => ({
        nguon: row.loai,
        ngay: row.ngay,
        ca: row.ca,
        may: row.may,
        maNvl: row.maNvl,
        tenNvl: row.tenNvl,
        chiTiet: row.donVi || '',
        weightKg: row.weightKg
      })),
      ...tonCuoiRows.map(row => ({
        nguon: row.loai,
        ngay: row.ngay,
        ca: row.ca,
        may: row.may,
        maNvl: row.maNvl,
        tenNvl: row.tenNvl,
        chiTiet: row.donVi || '',
        weightKg: row.weightKg
      }))
    ]
  };
}

export function groupBbThucDungLines(rows: BbThucDungLineRow[]): BbThucDungGroup[] {
  const map = new Map<string, BbThucDungGroup>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      map.set(groupKey, {
        groupKey,
        orderCode: row.orderCode,
        ngay: row.ngay,
        shift: row.shift,
        shiftLabel: row.shiftLabel,
        machine: row.machine,
        lineCount: 1,
        totalWeightKg: Number.isFinite(row.weightKg) ? row.weightKg : 0,
        tonDauCaTotal: Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0,
        tonCuoiCaTotal: Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0,
        xuatCaTotal: Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.totalWeightKg += Number.isFinite(row.weightKg) ? row.weightKg : 0;
    existing.tonDauCaTotal += Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0;
    existing.tonCuoiCaTotal += Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0;
    existing.xuatCaTotal += Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0;
    existing.lines.push(row);
  }

  return [...map.values()].sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export type BbTongDetailLine = {
  key: string;
  label: string;
  valueKg: number;
};

export type BbTongGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  tongTpNhapKho: number;
  tongTrongLuongLoiHong: number;
  tongThucDung: number;
  tongTrongLuongNhapKho: number;
  chenhLechTrongLuongNhapXuat: number;
  tiLeChenhLechTrongLuong: number;
  lines: BbTongDetailLine[];
};

/**
 * Tab Tổng — cùng công thức sản lượng bảng tổng hợp ca:
 * TL nhập kho = TP nhập (nhựa/màng/lõi/túi) + lỗi hỏng
 * Chênh lệch = TL nhập kho − thực dùng
 * Tỉ lệ = chênh lệch / TL nhập kho × 100
 */
export function buildBbTongGroups(input: {
  productionOrders: ProductionOrderRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  damagedRecords: WeighingRecord[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbTongGroup[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const groups: BbTongGroup[] = [];

  for (const header of headers) {
    const xuat = emptyMaterialBucket();
    const tonDau = emptyMaterialBucket();
    const tonCuoi = emptyMaterialBucket();
    let tlNhuaKhongMangLoiHong = 0;
    let tlNhuaCucDauNongLoiHong = 0;
    let tlNhuaDinhMangLoiHong = 0;
    let tlMangLoiHong = 0;
    let tongTrongLuongLoiHong = 0;

    for (const movement of input.warehouseMovements) {
      if (
        !movementAppliesToBbOrderHeader(movement, header, shiftOptions)
      ) {
        continue;
      }
      addMaterialBucket(xuat, classifyExportMovementKg(movement, input.materials));
    }

    for (const report of input.machineNvlReports) {
      if (
        !matchesShiftSummaryBucket(header.ngay, header.shift, report.ngay, report.ca, shiftOptions)
      ) {
        continue;
      }
      if (!isBbMachineText(report.maMay, report.tenMay)) continue;
      if (
        !machineValueMatchesFilter(header.machine, null, report.maMay, report.tenMay) &&
        !(isBbMachineText(header.machine) && isBbMachineText(report.maMay, report.tenMay))
      ) {
        continue;
      }
      for (const line of report.lines) {
        const split = classifyMachineNvlLineKg(report, line);
        if (report.reportKind === 'dau_ca') addMaterialBucket(tonDau, split);
        else if (report.reportKind === 'cuoi_ca') addMaterialBucket(tonCuoi, split);
      }
    }

    for (const record of getWeighingDataRows(input.damagedRecords)) {
      const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          ngay || record.productionDate,
          record.shiftName,
          shiftOptions
        )
      ) {
        continue;
      }
      const machineOk =
        machineValueMatchesFilter(header.machine, null, record.machineName) ||
        (isBbMachineText(record.machineName) && isBbMachineText(header.machine));
      if (!machineOk && !isBbMachineText(record.machineName)) continue;
      if (isDamagedOtherMaterial(record)) {
        tongTrongLuongLoiHong += resolveDamagedOtherMaterialKg(record);
        continue;
      }
      const split = splitDamagedGoodsDefectWeights(record);
      tlNhuaKhongMangLoiHong += split.nhuaKhongMang;
      tlNhuaCucDauNongLoiHong += split.nhuaCucDauNong;
      tlNhuaDinhMangLoiHong += split.nhuaDinhMang;
      tlMangLoiHong += split.mang;
      tongTrongLuongLoiHong += split.tong;
    }

    const nhuaThucDung = computeMaterialUsageKg(xuat.nhua, tonDau.nhua, tonCuoi.nhua);
    const mangThucDung = computeMaterialUsageKg(xuat.mang, tonDau.mang, tonCuoi.mang);
    const loiThucDung = computeMaterialUsageKg(xuat.loi, tonDau.loi, tonCuoi.loi);
    const tuiThucDung = computeMaterialUsageKg(xuat.tui, tonDau.tui, tonCuoi.tui);
    const tongThucDung = roundQty(nhuaThucDung + mangThucDung + loiThucDung + tuiThucDung, 4);

    const tlNhuaTpNhapKho = computeTlNhuaTpNhapKhoFromShiftSummary({
      khoiLuongNpl: xuat.nhua,
      tonDauCaNhua: tonDau.nhua,
      tonCuoiCaNhua: tonCuoi.nhua,
      tlNhuaKhongMangLoiHong,
      tlNhuaCucDauNongLoiHong,
      tlNhuaDinhMangLoiHong
    });
    const tlMangTpNhapKho = computeTlMangTpNhapKhoFromShiftSummary({
      khoiLuongMangXuat: xuat.mang,
      tonDauCaMang: tonDau.mang,
      tonCuoiCaMang: tonCuoi.mang,
      tlMangLoiHong
    });
    const tlLoiTpNhapKho = roundQty(loiThucDung, 4);
    const tlTuiBaoBiNhapKho = roundQty(tuiThucDung, 4);
    const tongTpNhapKho = roundQty(
      tlNhuaTpNhapKho + tlMangTpNhapKho + tlLoiTpNhapKho + tlTuiBaoBiNhapKho, 4
    );
    const tongLoiHong = roundQty(tongTrongLuongLoiHong, 4);

    const metrics = computeShiftSummarySanLuongMetrics({
      tongTpNhapKho,
      tongTrongLuongLoiHong: tongLoiHong,
      tongThucDung,
      chenhLechNhua: 0,
      tongMangThucDung: mangThucDung,
      tlMangTpNhapKho,
      hangHongMang: tlMangLoiHong
    });

    const hasAny =
      metrics.tongTrongLuongNhapKho !== 0 ||
      metrics.chenhLechTrongLuongNhapXuat !== 0 ||
      tongThucDung !== 0 ||
      tongLoiHong !== 0 ||
      tongTpNhapKho !== 0;
    if (!hasAny) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    const groupKey = header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`;

    groups.push({
      groupKey,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel,
      machine: header.machine,
      tongTpNhapKho,
      tongTrongLuongLoiHong: tongLoiHong,
      tongThucDung,
      tongTrongLuongNhapKho: metrics.tongTrongLuongNhapKho,
      chenhLechTrongLuongNhapXuat: metrics.chenhLechTrongLuongNhapXuat,
      tiLeChenhLechTrongLuong: metrics.tiLeChenhLechTrongLuong,
      lines: [
        { key: `${groupKey}|tl-nhua-tp`, label: 'TL nhựa TP nhập kho', valueKg: tlNhuaTpNhapKho },
        { key: `${groupKey}|tl-mang-tp`, label: 'TL màng TP nhập kho', valueKg: tlMangTpNhapKho },
        { key: `${groupKey}|tl-loi-tp`, label: 'TL lõi TP nhập kho', valueKg: tlLoiTpNhapKho },
        { key: `${groupKey}|tl-tui-tp`, label: 'TL túi bao bì nhập kho', valueKg: tlTuiBaoBiNhapKho },
        { key: `${groupKey}|tong-tp`, label: 'Tổng TP nhập kho', valueKg: tongTpNhapKho },
        { key: `${groupKey}|loi-hong`, label: 'Tổng trọng lượng lỗi hỏng', valueKg: tongLoiHong },
        { key: `${groupKey}|thuc-dung`, label: 'Tổng trọng lượng thực dùng', valueKg: tongThucDung }
      ]
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export function sumBbTongTrongLuongNhapKho(groups: BbTongGroup[]) {
  return groups.reduce((sum, g) => sum + g.tongTrongLuongNhapKho, 0);
}

export function sumBbTongChenhLech(groups: BbTongGroup[]) {
  return groups.reduce((sum, g) => sum + g.chenhLechTrongLuongNhapXuat, 0);
}

function resolveBbAvgExportUnitPrice(
  ngay: string,
  ca: string,
  movements: ShiftSummaryWarehouseMovement[],
  shiftSettings: ShiftSetting[],
  matchItem: (movement: ShiftSummaryWarehouseMovement) => boolean
) {
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  let amount = 0;
  let qty = 0;
  for (const movement of movements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!matchItem(movement)) continue;
    if (!matchesShiftSummaryBucket(ngay, ca, movement.slipDate, movement.shift, shiftOptions)) continue;
    const unitPrice = Number(movement.unitPrice);
    const quantity = Number(movement.quantity);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    amount += quantity * unitPrice;
    qty += quantity;
  }
  if (qty <= 0) return 0;
  return Math.round(amount / qty);
}

export type BbMixingRatioLineRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  materialCode: string;
  materialName: string;
  tiLeDinhMucPercent: number | null;
  tiLeThucTeTbPercent: number | null;
  batchCount: number;
  totalKlThucTe: number;
};

export type BbMixingRatioGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  lineCount: number;
  lines: BbMixingRatioLineRow[];
};

/** TB tỉ lệ thực tế từng NVL — lấy từ báo cáo trộn của ca trước (vd 12C1 → 12C2). */
export function buildBbMixingRatioGroups(input: {
  productionOrders: ProductionOrderRow[];
  mixingReports: MixingReport[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbMixingRatioGroup[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const groups: BbMixingRatioGroup[] = [];

  for (const header of headers) {
    // Tỉ lệ trộn: bắt buộc lấy phiếu trộn đúng ca hiện tại của lệnh.
    const mixingResolved = resolveBbMixingShiftStatsForOrderHeader({
      mixingReports: input.mixingReports,
      headerMachine: header.machine,
      headerNgay: header.ngay,
      headerShift: header.shift,
      shiftOptions
    });
    const mixingShiftStats = mixingResolved.stats;

    if (mixingShiftStats.byMaterial.size === 0) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    const groupKey = header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`;
    const lines: BbMixingRatioLineRow[] = [...mixingShiftStats.byMaterial.entries()]
      .map(([materialKey, stat]) => ({
        key: `${groupKey}|${materialKey}`,
        ngay: header.ngay,
        shift: header.shift,
        shiftLabel,
        orderCode: header.orderCode,
        machine: header.machine,
        materialCode: stat.materialCode,
        materialName: stat.materialName,
        tiLeDinhMucPercent:
          stat.tiLeDinhMucCount > 0 ? roundQty(stat.tiLeDinhMucSum / stat.tiLeDinhMucCount, 4) : null,
        tiLeThucTeTbPercent: resolveBbMixingShiftTiLeThucTeTbPercent(
          stat.klSum,
          mixingShiftStats.totalMixKg
        ),
        batchCount: stat.batchCount,
        totalKlThucTe: roundQty(stat.klSum, 4)
      }))
      .sort((a, b) => a.materialName.localeCompare(b.materialName, 'vi'));

    groups.push({
      groupKey,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel,
      machine: header.machine,
      lineCount: lines.length,
      lines
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export type BbDanhGiaHaoHutGroup = {
  groupKey: string;
  orderCode: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machine: string;
  tongNhuaThucXuat: number;
  tongNhuaDinhMuc: number;
  tiLeNhuaThucXuatVsDinhMuc: number;
  giaTriHaoHutNhuaKg: number;
  giaTriHaoHutNhua: number;
  tongMangThucXuat: number;
  tongMangDinhMuc: number;
  tiLeMangThucXuatVsDinhMuc: number;
  giaTriHaoHutMangKg: number;
  giaTriHaoHutMang: number;
  tiLeLoiHong: number;
  tiLeLoiHongDinhMuc: number;
  lechLoiHongVsDinhMuc: number;
  soLuongNhuaLoiHong: number;
  giaTriNhuaLoiHong: number;
  soLuongMangLoiHong: number;
  giaTriMangLoiHong: number;
  soLuongLoiLoiHong: number;
  giaTriLoiLoiHong: number;
  tongGiaTriHaoHutLoiHong: number;
};

/** Đánh giá hiệu quả lỗi hỏng & hao hụt NVL theo lệnh BB. */
export function buildBbDanhGiaHaoHutGroups(input: {
  productionOrders: ProductionOrderRow[];
  products: ProductRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  damagedRecords: WeighingRecord[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbDanhGiaHaoHutGroup[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const groups: BbDanhGiaHaoHutGroup[] = [];

  for (const header of headers) {
    const xuat = emptyMaterialBucket();
    const tonDau = emptyMaterialBucket();
    const tonCuoi = emptyMaterialBucket();
    let hangHongNhua = 0;
    let hangHongMang = 0;
    let soCuonLoiHong = 0;
    let tongTrongLuongLoiHong = 0;
    let tlNhuaKhongMangLoiHong = 0;
    let tlNhuaCucDauNongLoiHong = 0;
    let tlNhuaDinhMangLoiHong = 0;
    let tlMangLoiHong = 0;
    let slHang = 0;
    let khoiLuongHang = 0;

    for (const order of input.productionOrders) {
      if (!isBbProductionOrder(order, input.machines)) continue;
      if (order.code !== header.orderCode) continue;
      const ngay = parseProductionOrderFilterDate(order.startDate);
      if (ngay !== header.ngay) continue;
      if (!shiftNamesMatch(order.shift, header.shift)) continue;
      for (const line of getProductionOrderProductLines(order)) {
        const qty = parseProductionOrderQuantity(line.quantity);
        if (qty <= 0) continue;
        slHang += qty;
        const product = findProductByCode(input.products, line.productCode);
        const unitWeight = resolveProductUnitNormKg(product);
        if (unitWeight !== null && unitWeight > 0) khoiLuongHang += unitWeight * qty;
      }
    }

    for (const movement of input.warehouseMovements) {
      if (!movementAppliesToBbOrderHeader(movement, header, shiftOptions)) {
        continue;
      }
      addMaterialBucket(xuat, classifyExportMovementKg(movement, input.materials));
    }

    for (const report of input.machineNvlReports) {
      if (
        !matchesShiftSummaryBucket(header.ngay, header.shift, report.ngay, report.ca, shiftOptions)
      ) {
        continue;
      }
      if (!isBbMachineText(report.maMay, report.tenMay)) continue;
      if (
        !machineValueMatchesFilter(header.machine, null, report.maMay, report.tenMay) &&
        !(isBbMachineText(header.machine) && isBbMachineText(report.maMay, report.tenMay))
      ) {
        continue;
      }
      for (const line of report.lines) {
        const split = classifyMachineNvlLineKg(report, line);
        if (report.reportKind === 'dau_ca') addMaterialBucket(tonDau, split);
        else if (report.reportKind === 'cuoi_ca') addMaterialBucket(tonCuoi, split);
      }
    }

    for (const record of getWeighingDataRows(input.damagedRecords)) {
      const ngay = parseProductionOrderFilterDate(record.productionDate || record.reportDate);
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          ngay || record.productionDate,
          record.shiftName,
          shiftOptions
        )
      ) {
        continue;
      }
      const machineOk =
        machineValueMatchesFilter(header.machine, null, record.machineName) ||
        (isBbMachineText(record.machineName) && isBbMachineText(header.machine));
      if (!machineOk && !isBbMachineText(record.machineName)) continue;
      const split = splitDamagedGoodsDefectWeights(record);
      hangHongNhua += split.nhuaKhongMang + split.nhuaCucDauNong + split.nhuaDinhMang;
      hangHongMang += split.mang;
      soCuonLoiHong += split.loi;
      tongTrongLuongLoiHong += split.tong;
      tlNhuaKhongMangLoiHong += split.nhuaKhongMang;
      tlNhuaCucDauNongLoiHong += split.nhuaCucDauNong;
      tlNhuaDinhMangLoiHong += split.nhuaDinhMang;
      tlMangLoiHong += split.mang;
    }

    const tongNhuaThucXuat = computeMaterialUsageKg(xuat.nhua, tonDau.nhua, tonCuoi.nhua);
    const tongMangThucXuat = computeMaterialUsageKg(xuat.mang, tonDau.mang, tonCuoi.mang);
    const loiThucDung = computeMaterialUsageKg(xuat.loi, tonDau.loi, tonCuoi.loi);
    const tuiThucDung = computeMaterialUsageKg(xuat.tui, tonDau.tui, tonCuoi.tui);
    const tongThucDung = roundQty(tongNhuaThucXuat + tongMangThucXuat + loiThucDung + tuiThucDung, 4);

    const khoiLuongLoi = roundQty(slHang, 4);
    const khoiLuongMang = roundQty(slHang * KHOI_LUONG_MANG_KG_PER_UNIT, 4);
    const tongNhuaDinhMuc = computeKhoiLuongNhuaTp(khoiLuongHang, khoiLuongLoi, khoiLuongMang);
    const tongMangDinhMuc = khoiLuongMang;

    const tlNhuaTpNhapKho = computeTlNhuaTpNhapKhoFromShiftSummary({
      khoiLuongNpl: xuat.nhua,
      tonDauCaNhua: tonDau.nhua,
      tonCuoiCaNhua: tonCuoi.nhua,
      tlNhuaKhongMangLoiHong,
      tlNhuaCucDauNongLoiHong,
      tlNhuaDinhMangLoiHong
    });
    const tlMangTpNhapKho = computeTlMangTpNhapKhoFromShiftSummary({
      khoiLuongMangXuat: xuat.mang,
      tonDauCaMang: tonDau.mang,
      tonCuoiCaMang: tonCuoi.mang,
      tlMangLoiHong
    });
    const tongTpNhapKho = roundQty(
      tlNhuaTpNhapKho + tlMangTpNhapKho + loiThucDung + tuiThucDung, 4
    );

    const sanLuong = computeShiftSummarySanLuongMetrics({
      tongTpNhapKho,
      tongTrongLuongLoiHong,
      tongThucDung,
      chenhLechNhua: roundQty(tongNhuaThucXuat - tongNhuaDinhMuc - hangHongNhua, 4),
      tongMangThucDung: tongMangThucXuat,
      tlMangTpNhapKho,
      hangHongMang
    });

    const giaTriHaoHutNhuaKg = sanLuong.giaTriLoLaiNhua;
    const giaTriHaoHutMangKg = sanLuong.giaTriLoLaiMang;
    const tiLeNhuaThucXuatVsDinhMuc = computePercentRatio(tongNhuaThucXuat, tongNhuaDinhMuc);
    const tiLeMangThucXuatVsDinhMuc = computePercentRatio(tongMangThucXuat, tongMangDinhMuc);

    const giaNhua = resolveShiftSummaryGiaNhuaFromWarehouse(
      header.ngay,
      header.shift,
      input.warehouseMovements,
      shiftSettings
    );
    const giaMang = resolveBbAvgExportUnitPrice(
      header.ngay,
      header.shift,
      input.warehouseMovements,
      shiftSettings,
      m => isWarehouseFilmItem(m.itemCode || '', m.itemName || '', m.unit || '')
    );
    const giaLoi = resolveBbAvgExportUnitPrice(
      header.ngay,
      header.shift,
      input.warehouseMovements,
      shiftSettings,
      m => isWarehouseCoreExportItem(m.itemCode || '', m.itemName || '')
    );

    const giaTriHaoHutNhua = computeSoTienLoLaiNhua(giaTriHaoHutNhuaKg, giaNhua);
    const giaTriHaoHutMang = computeSoTienLoLaiNhua(giaTriHaoHutMangKg, giaMang);
    const soLuongNhuaLoiHong = roundQty(hangHongNhua, 4);
    const soLuongMangLoiHong = roundQty(hangHongMang, 4);
    const soLuongLoiLoiHong = roundQty(soCuonLoiHong, 4);
    const giaTriNhuaLoiHong = computeSoTienLoLaiNhua(soLuongNhuaLoiHong, giaNhua);
    const giaTriMangLoiHong = computeSoTienLoLaiNhua(soLuongMangLoiHong, giaMang);
    const giaTriLoiLoiHong = computeSoTienLoLaiNhua(soLuongLoiLoiHong, giaLoi);
    const tongGiaTriHaoHutLoiHong =
      giaTriHaoHutNhua +
      giaTriHaoHutMang +
      giaTriNhuaLoiHong +
      giaTriMangLoiHong +
      giaTriLoiLoiHong;

    const hasAny =
      tongNhuaThucXuat !== 0 ||
      tongNhuaDinhMuc !== 0 ||
      tongMangThucXuat !== 0 ||
      tongMangDinhMuc !== 0 ||
      tongTrongLuongLoiHong !== 0 ||
      tongGiaTriHaoHutLoiHong !== 0;
    if (!hasAny) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    groups.push({
      groupKey: header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`,
      orderCode: header.orderCode,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel,
      machine: header.machine,
      tongNhuaThucXuat: roundQty(tongNhuaThucXuat, 4),
      tongNhuaDinhMuc: roundQty(tongNhuaDinhMuc, 4),
      tiLeNhuaThucXuatVsDinhMuc,
      giaTriHaoHutNhuaKg,
      giaTriHaoHutNhua,
      tongMangThucXuat: roundQty(tongMangThucXuat, 4),
      tongMangDinhMuc: roundQty(tongMangDinhMuc, 4),
      tiLeMangThucXuatVsDinhMuc,
      giaTriHaoHutMangKg,
      giaTriHaoHutMang,
      tiLeLoiHong: sanLuong.tiLeLoiHong,
      tiLeLoiHongDinhMuc: sanLuong.tiLeLoiHongDinhMuc ?? TI_LE_LOI_HONG_DINH_MUC_PERCENT,
      lechLoiHongVsDinhMuc: sanLuong.lechLoiHongVsDinhMuc,
      soLuongNhuaLoiHong,
      giaTriNhuaLoiHong,
      soLuongMangLoiHong,
      giaTriMangLoiHong,
      soLuongLoiLoiHong,
      giaTriLoiLoiHong,
      tongGiaTriHaoHutLoiHong
    });
  }

  return groups.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export function sumBbDanhGiaMoney(groups: BbDanhGiaHaoHutGroup[], key: keyof BbDanhGiaHaoHutGroup) {
  return groups.reduce((sum, g) => sum + Number(g[key] || 0), 0);
}

export type BbInboundReportRow = {
  key: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  orderCode: string;
  machine: string;
  acceptedRolls: number;
  mixedPlasticKg: number;
  finishedGoodsInboundKg: number;
};

function isCuonUnitText(unit: unknown) {
  return (
    String(unit ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') === 'cuon'
  );
}

/**
 * Tab Dữ liệu trong báo cáo phiếu nhập kho — theo lệnh SX máy BB:
 * SL Đạt thực tế (cuộn) từ báo cáo sản lượng, TL nhựa đã trộn (kg) từ báo cáo phối trộn,
 * Tổng TP nhập kho (kg) dùng lại đúng công thức của tab Tổng.
 */
export function buildBbInboundReportRows(input: {
  productionOrders: ProductionOrderRow[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  damagedRecords: WeighingRecord[];
  acceptanceReports: AcceptanceReport[];
  mixingReports: MixingReport[];
  materials: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbInboundReportRow[] {
  const shiftSettings = (input.shiftSettings || []) as ShiftSetting[];
  const shiftOptions = getProductionShiftOptions(shiftSettings);
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const headers = collectBbOrderHeaders(input);
  if (headers.length === 0) return [];

  const tongTpByGroupKey = new Map<string, number>();
  for (const group of buildBbTongGroups(input)) {
    tongTpByGroupKey.set(group.groupKey, group.tongTpNhapKho);
  }

  const rows = headers.map(header => {
    let acceptedRolls = 0;
    for (const report of input.acceptanceReports) {
      if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
      if (!isCuonUnitText(report.don_vi)) continue;
      if (!matchesShiftSummaryBucket(header.ngay, header.shift, report.ngay, report.ca, shiftOptions)) continue;
      if (
        !machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) &&
        !(isBbMachineText(header.machine) && isBbMachineText(report.ma_may, report.ten_may))
      ) {
        continue;
      }
      acceptedRolls += report.so_luong ?? 0;
    }

    let mixedPlasticKg = 0;
    for (const report of input.mixingReports) {
      if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
      if (!matchesShiftSummaryBucket(header.ngay, header.shift, report.ngay, report.ca, shiftOptions)) continue;
      if (
        !machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) &&
        !(isBbMachineText(header.machine) && isBbMachineText(report.ma_may, report.ten_may))
      ) {
        continue;
      }
      mixedPlasticKg += sumReportNormTotal(report.chi_tiet || []);
    }

    const groupKey = header.orderCode.trim() || `unlinked|${header.ngay}|${header.shift}`;

    return {
      key: groupKey,
      ngay: header.ngay,
      shift: header.shift,
      shiftLabel: formatProductionOrderShiftLabel(header.shift, lookupSettings),
      orderCode: header.orderCode,
      machine: header.machine,
      acceptedRolls: Math.round(acceptedRolls),
      mixedPlasticKg: roundQty(mixedPlasticKg, 4),
      finishedGoodsInboundKg: roundQty(tongTpByGroupKey.get(groupKey) ?? 0, 4)
    };
  });

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

export function sumBbInboundReportTotals(rows: BbInboundReportRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.acceptedRolls += row.acceptedRolls > 0 ? row.acceptedRolls : 0;
      acc.mixedPlasticKg += row.mixedPlasticKg > 0 ? row.mixedPlasticKg : 0;
      acc.finishedGoodsInboundKg += row.finishedGoodsInboundKg > 0 ? row.finishedGoodsInboundKg : 0;
      return acc;
    },
    { acceptedRolls: 0, mixedPlasticKg: 0, finishedGoodsInboundKg: 0 }
  );
}
