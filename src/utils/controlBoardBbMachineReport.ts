import {
  findProductByCode,
  mergeProductNplItemsByUnitKinds,
  resolveProductNplItemWeightKg,
  parseProductSpecNumber
} from '../features/san-pham';
import {
  normalizeNvlMatchKey,
  normalizeProductCodeKey,
  type ProductRow,
  type ProductNplItem
} from '../features/san-pham/types';
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
  isWarehouseTapeExportItem,
  KHOI_LUONG_MANG_KG_PER_UNIT,
  machineValueMatchesFilter,
  matchesControlBoardDateRange,
  matchesShiftSummaryBucket,
  matchesWarehouseExportDate,
  extractLinkedProductionOrderCodes,
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
import {
  getProductionShiftOptions,
  resolvePreviousProductionShift,
  shiftIsoDateByDays,
  shiftNamesMatch
} from './shiftSettings';
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
  computeInsulationFilmWeightKg,
  filterCanTuDongRecordsForBoard,
  listInsulationFilmBomLines,
  parseCanTuDongQrProductCode,
  resolveInsulationFilmBomWeightPerUnit,
  resolveInsulationFilmKgPerRoll,
  sumCanTuDongSanLuongTotals,
  type CanTuDongWeightRow
} from './canTuDongWeights';
import { computeCanTuDongTongHopBannerTotals } from './canTuDongTongHop';
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
  | 'bao_cao_san_luong_phieu'
  | 'bao_cao_loi_hong'
  | 'kiem_ton_cuoi_ca'
  | 'phieu_nhap_kho'
  | 'tong_vat_tu_thuc_dung'
  | 'tong_hop_vat_tu_thuc_xuat_dung'
  | 'bao_cao_thanh_pham_nhap_kho'
  | 'bao_cao_tieu_hao_nvl'
  | 'tong'
  | 'danh_gia_hao_hut'
  | 'giai_trinh'
  | 'bieu_do_so_sanh';

export const BB_MACHINE_REPORT_TABS: Array<{ id: BbMachineReportTabId; label: string }> = [
  { id: 'lenh_sx', label: 'Dữ liệu trong lệnh sản xuất' },
  { id: 'phieu_xuat_kho', label: 'Dữ liệu xuất kho' },
  { id: 'ton_dau_ca', label: 'Báo cáo dữ liệu tồn đầu ca' },
  { id: 'bao_cao_san_luong', label: 'Dữ liệu cân thực tế' },
  { id: 'bao_cao_san_luong_phieu', label: 'Báo cáo sản lượng' },
  { id: 'bao_cao_loi_hong', label: 'Dữ liệu trong báo cáo hàng lỗi hỏng' },
  { id: 'kiem_ton_cuoi_ca', label: 'Dữ liệu trong báo cáo kiểm tồn cuối ca' },
  { id: 'bao_cao_thanh_pham_nhap_kho', label: 'Báo cáo thành phẩm đạt nhập kho' },
  { id: 'bao_cao_tieu_hao_nvl', label: 'Báo cáo tiêu hao nguyên vật liệu' },
  { id: 'danh_gia_hao_hut', label: 'Đánh giá hiệu quả ca sản xuất' },
  { id: 'giai_trinh', label: 'Giải trình' },
  { id: 'bieu_do_so_sanh', label: 'Biểu đồ so sánh' }
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
  /** Trọng lượng nhựa + phụ gia (kg) / 1 ĐVT — thẳng từ Kho hàng (`trong_luong_nhua`). Snapshot cũ có thể thiếu. */
  plasticNormKgPerUnit?: number | null;
  /** Tổng KL nhựa+phụ gia = cột trên × SL. Snapshot cũ có thể thiếu. */
  totalPlasticNormKg?: number | null;
  /** SL thực tế từ tab Báo cáo sản lượng (sau Tính toán). */
  actualQuantity: number;
  /** Trọng lượng thực tế (kg) SP từ tab Báo cáo sản lượng. */
  actualWeightKg: number | null;
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
  tonCuoiFromNnsTron: boolean;
  tonCuoiDirectKg: number;
  nnsTronTonCuoiKg: number;
  tiLeTonCuoiPercent: number | null;
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

/** Máy cách nhiệt: tách màng / rác màng xi khỏi cột nhựa lỗi hỏng. */
export function isInsulationMachineText(...candidates: Array<string | undefined | null>) {
  return candidates.some(value => /cách\s*nhiệt/i.test(String(value || '').trim()));
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

/** Loại máy trên `/phan-tich-tu-dong` — bao bì (BB) hoặc cách nhiệt. */
export type BbMachineReportKind = 'packaging' | 'insulation';

export function resolveMachineReportKind(
  machine: Pick<MachineRow, 'code' | 'name' | 'type'> | null | undefined
): BbMachineReportKind | null {
  if (!machine) return null;
  if (isInsulationMachineText(machine.code, machine.name, machine.type)) return 'insulation';
  if (isBbMachineText(machine.code, machine.name, machine.type)) return 'packaging';
  return null;
}

export function machineMatchesReportKind(
  machine: Pick<MachineRow, 'code' | 'name' | 'type'>,
  kind: BbMachineReportKind
): boolean {
  const resolved = resolveMachineReportKind(machine);
  if (resolved) return resolved === kind;
  return kind === 'insulation'
    ? isInsulationMachineText(machine.code, machine.name, machine.type)
    : isBbMachineText(machine.code, machine.name, machine.type);
}

export function filterMachinesByReportKind(machines: MachineRow[], kind: BbMachineReportKind): MachineRow[] {
  return machines.filter(machine => machineMatchesReportKind(machine, kind));
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

/**
 * Cột «Trọng lượng nhựa + phụ gia (kg)» trên tab lệnh SX —
 * lấy thẳng `san_pham.trong_luong_nhua` (Kho hàng), không tính thêm.
 */
export function resolveBbProductionOrderPlasticNormKgPerUnit(product?: ProductRow | null): number | null {
  if (!product) return null;
  const stored = parseProductSpecNumber(product.plasticWeight);
  return stored !== null && stored > 0 ? stored : null;
}

/** Hiển thị đúng text cột Kho hàng «Trọng lượng nhựa + phụ gia (kg)». */
export function formatProductCatalogPlasticWeight(
  product?: Pick<ProductRow, 'plasticWeight'> | null
): string {
  const text = String(product?.plasticWeight ?? '').trim();
  if (!text || text === '-') return '—';
  return text.replace('.', ',');
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
      // Trọng lượng nhựa + phụ gia (kg) — thẳng từ Kho hàng.
      const plasticNormKgPerUnit = resolveBbProductionOrderPlasticNormKgPerUnit(product);
      const totalPlasticNormKg =
        plasticNormKgPerUnit !== null && quantity > 0 ? plasticNormKgPerUnit * quantity : null;

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
        totalNormKg,
        plasticNormKgPerUnit,
        totalPlasticNormKg,
        actualQuantity: 0,
        actualWeightKg: null
      });
    });
  }

  // Cùng lệnh + cùng mã SP → gộp 1 dòng (cộng SL / TL yêu cầu).
  return mergeBbProductionOrderLineRowsByProduct(rows).sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const shiftCmp = a.shiftLabel.localeCompare(b.shiftLabel, 'vi');
    if (shiftCmp !== 0) return shiftCmp;
    return a.orderCode.localeCompare(b.orderCode, 'vi');
  });
}

/**
 * Gộp dòng lệnh SX trùng mã SP trong cùng số lệnh.
 * - SL / TL yêu cầu: cộng
 * - SL / TL thực tế (đã enrich từ sản lượng): lấy max — tránh nhân đôi khi snapshot cũ còn dòng trùng
 */
export function mergeBbProductionOrderLineRowsByProduct(
  rows: BbProductionOrderLineRow[]
): BbProductionOrderLineRow[] {
  const map = new Map<string, BbProductionOrderLineRow>();
  const orderKeys: string[] = [];

  for (const row of rows) {
    const productKey =
      normalizeProductCodeKey(row.productCode) ||
      normalizeProductCodeKey(row.productName) ||
      row.key;
    const mergeKey = `${String(row.orderCode || '').trim()}|${productKey}`;
    const existing = map.get(mergeKey);
    if (!existing) {
      map.set(mergeKey, { ...row });
      orderKeys.push(mergeKey);
      continue;
    }

    const quantity =
      (existing.quantity > 0 ? existing.quantity : 0) + (row.quantity > 0 ? row.quantity : 0);
    const totalNormKg =
      (existing.totalNormKg && existing.totalNormKg > 0 ? existing.totalNormKg : 0) +
      (row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0);
    const totalPlasticNormKg =
      (existing.totalPlasticNormKg && existing.totalPlasticNormKg > 0 ? existing.totalPlasticNormKg : 0) +
      (row.totalPlasticNormKg && row.totalPlasticNormKg > 0 ? row.totalPlasticNormKg : 0);
    const actualQuantity = Math.max(
      existing.actualQuantity > 0 ? existing.actualQuantity : 0,
      row.actualQuantity > 0 ? row.actualQuantity : 0
    );
    const actualWeightKg = Math.max(
      existing.actualWeightKg && existing.actualWeightKg > 0 ? existing.actualWeightKg : 0,
      row.actualWeightKg && row.actualWeightKg > 0 ? row.actualWeightKg : 0
    );

    let productName = existing.productName;
    if (!productName || productName === existing.productCode) {
      const ten = String(row.productName || '').trim();
      if (ten) productName = ten;
    }

    map.set(mergeKey, {
      ...existing,
      key: existing.key,
      productCode: existing.productCode || row.productCode,
      productName,
      unit: existing.unit || row.unit,
      quantity,
      totalNormKg: totalNormKg > 0 ? roundQty(totalNormKg, 4) : null,
      normKgPerUnit:
        quantity > 0 && totalNormKg > 0
          ? roundQty(totalNormKg / quantity, 4)
          : existing.normKgPerUnit ?? row.normKgPerUnit,
      totalPlasticNormKg: totalPlasticNormKg != null && totalPlasticNormKg > 0 ? totalPlasticNormKg : null,
      plasticNormKgPerUnit:
        quantity > 0 && totalPlasticNormKg != null && totalPlasticNormKg > 0
          ? totalPlasticNormKg / quantity
          : existing.plasticNormKgPerUnit ?? row.plasticNormKgPerUnit,
      actualQuantity,
      actualWeightKg: actualWeightKg > 0 ? roundQty(actualWeightKg, 4) : null
    });
  }

  return orderKeys.map(key => map.get(key)!);
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

/** Quy về kg từ SL xuất × Tổng kg kho NVL — dùng catalog mới nhất, không snapshot cũ. */
export function resolveBbWarehouseExportLineWeightKg(
  line: Pick<BbWarehouseExportLineRow, 'itemCode' | 'unit' | 'quantity'>,
  materials: MaterialRow[]
): number | null {
  const qty = Number(line.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const catalog = materials.map(mapMaterialToWeightCatalogItem);
  /** Ưu tiên: Số lượng xuất × Số Kg (Tổng kg) của NVL trên kho. */
  const tongKg = findMaterialTongKgPerUnit(line.itemCode, catalog);
  if (tongKg !== null && tongKg > 0) {
    return roundQty(qty * tongKg, 4);
  }

  const converted = convertWarehouseQuantityToKg({
    quantity: qty,
    unit: line.unit,
    itemCode: line.itemCode,
    warehouseKind: 'nvl',
    materials: catalog
  });
  if (converted === null || !Number.isFinite(converted) || converted <= 0) return null;
  return roundQty(converted, 4);
}

function resolveExportWeightKg(
  movement: ShiftSummaryWarehouseMovement,
  materials: MaterialRow[]
): number | null {
  return resolveBbWarehouseExportLineWeightKg(
    {
      itemCode: movement.itemCode,
      unit: movement.unit,
      quantity: movement.quantity
    },
    materials
  );
}

function movementMatchesOrderCode(movement: ShiftSummaryWarehouseMovement, orderCode: string) {
  return movementLinksProductionOrderCode(movement, orderCode);
}

/** Khớp mã lệnh SX: ưu tiên mã parse từ lý do/ghi chú; không gán phiếu không gắn lệnh cho mọi LSX cùng ngày. */
function movementMatchesBbOrderHeaderCode(
  movement: ShiftSummaryWarehouseMovement,
  orderCode: string
): boolean {
  const code = String(orderCode || '').trim();
  if (!code) return false;
  if (movementHasLinkedProductionOrderCodes(movement)) {
    return movementMatchesOrderCode(movement, code);
  }
  return movementLinksProductionOrderCode(movement, code);
}

/** Phiếu XK khớp ngày header (bộ lọc ngày); máy nếu có; nếu phiếu có mã lệnh thì phải khớp mã. Không lọc ca. */
function movementAppliesToBbOrderHeader(
  movement: ShiftSummaryWarehouseMovement,
  header: { ngay: string; shift: string; orderCode?: string; machine?: string },
  _shiftOptions: ReturnType<typeof getProductionShiftOptions>
): boolean {
  if (!matchesWarehouseExportDate(header.ngay, movement.slipDate)) {
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

  const orderCode = String(header.orderCode || '').trim();
  if (!orderCode) return !movementHasLinkedProductionOrderCodes(movement);
  return movementMatchesBbOrderHeaderCode(movement, orderCode);
}

/** Phiếu XK khớp ngày (+ máy, mã lệnh nếu có) — cột «Trọng lượng vật tư xuất kho» mục 3.1/3.2. */
export function movementAppliesToBbOrderHeaderByDate(
  movement: ShiftSummaryWarehouseMovement,
  header: { ngay: string; orderCode?: string; machine?: string; shift?: string },
  productionOrders: Array<{ code: string; machine?: string; position?: string }> = [],
  resolveOrderMachineLabel?: (order: { code: string; machine?: string; position?: string }) => string,
  options?: { exportMatchScope?: 'shift' | 'day' }
): boolean {
  const movementNgay = parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate;
  if (header.ngay && movementNgay !== header.ngay) return false;

  const exportMatchScope = options?.exportMatchScope ?? (header.shift ? 'shift' : 'day');
  const headerShift = String(header.shift || '').trim();
  const movementShift = String(movement.shift || '').trim();
  if (exportMatchScope === 'shift' && headerShift && movementShift) {
    if (!shiftNamesMatch(movementShift, headerShift)) return false;
  }

  const machineCandidates = resolveWarehouseMovementMachineCandidates(
    movement,
    productionOrders,
    resolveOrderMachineLabel
  );
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

  const orderCode = String(header.orderCode || '').trim();
  if (!orderCode) return !movementHasLinkedProductionOrderCodes(movement);
  return movementMatchesBbOrderHeaderCode(movement, orderCode);
}

export type BbWarehouseExportMaterialTotals = {
  materialCode: string;
  materialName: string;
  unit: string;
  quantity: number;
  weightKg: number;
};

/** Gom SL + kg xuất kho NVL theo mã — khớp lệnh/ca; mỗi dòng phiếu chỉ cộng một lần. */
export function buildBbWarehouseExportTotalsByMaterialForOrder(input: {
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  productionOrders?: Array<{ code: string; machine?: string; position?: string }>;
  resolveOrderMachineLabel?: (order: { code: string; machine?: string; position?: string }) => string;
  materials: MaterialRow[];
  order: { ngay: string; orderCode: string; machine?: string; shift?: string };
  exportMatchScope?: 'shift' | 'day';
}): Map<string, BbWarehouseExportMaterialTotals> {
  const byKey = new Map<string, BbWarehouseExportMaterialTotals>();
  const seenSlipLine = new Set<string>();
  const productionOrders = input.productionOrders || [];
  const exportMatchScope =
    input.exportMatchScope ?? (input.order.shift ? 'shift' : 'day');

  for (const movement of input.warehouseMovements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (
      !movementAppliesToBbOrderHeaderByDate(
        movement,
        input.order,
        productionOrders,
        input.resolveOrderMachineLabel,
        { exportMatchScope }
      )
    ) {
      continue;
    }

    const slipLineKey = `${movement.id || movement.slipCode}|${movement.itemCode}|${movement.slipDate}`;
    if (seenSlipLine.has(slipLineKey)) continue;
    seenSlipLine.add(slipLineKey);

    const code = String(movement.itemCode || '').trim();
    const name = String(movement.itemName || '').trim();
    const key = normalizeMaterialCodeKey(code) || normalizeProductCodeKey(name) || String(byKey.size);
    const qty = Number.isFinite(movement.quantity) ? movement.quantity : 0;
    const weightKg = resolveExportWeightKg(movement, input.materials) ?? 0;
    if (!(qty > 0) && !(weightKg > 0)) continue;

    const existing = byKey.get(key);
    if (existing) {
      if (qty > 0) existing.quantity += qty;
      if (weightKg > 0) existing.weightKg = roundQty(existing.weightKg + weightKg, 4);
    } else {
      byKey.set(key, {
        materialCode: code,
        materialName: name,
        unit: movement.unit || 'kg',
        quantity: qty > 0 ? qty : 0,
        weightKg: weightKg > 0 ? roundQty(weightKg, 4) : 0
      });
    }
  }

  return byKey;
}

/** @deprecated Dùng buildBbWarehouseExportTotalsByMaterialForOrder — giữ SL cho chỗ gọi cũ. */
export function buildBbWarehouseExportQtyByMaterialForOrderDate(input: {
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  productionOrders?: Array<{ code: string; machine?: string; position?: string }>;
  resolveOrderMachineLabel?: (order: { code: string; machine?: string; position?: string }) => string;
  order: { ngay: string; orderCode: string; machine?: string; shift?: string };
  materials?: MaterialRow[];
  exportMatchScope?: 'shift' | 'day';
}): Map<string, { materialCode: string; materialName: string; unit: string; quantity: number }> {
  const totals = buildBbWarehouseExportTotalsByMaterialForOrder({
    warehouseMovements: input.warehouseMovements,
    productionOrders: input.productionOrders,
    resolveOrderMachineLabel: input.resolveOrderMachineLabel,
    materials: input.materials || [],
    order: input.order,
    exportMatchScope: input.exportMatchScope
  });
  const byQty = new Map<string, { materialCode: string; materialName: string; unit: string; quantity: number }>();
  for (const [key, entry] of totals.entries()) {
    byQty.set(key, {
      materialCode: entry.materialCode,
      materialName: entry.materialName,
      unit: entry.unit,
      quantity: entry.quantity
    });
  }
  return byQty;
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
  /** `day`: gom phiếu xuất cùng ngày (cột Xuất trong ngày). `shift`: khớp ca đang lọc (tab xuất kho / banner). */
  exportMatchScope?: 'shift' | 'day';
}): BbWarehouseExportLineRow[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const shiftOptions = getProductionShiftOptions(
    (input.shiftSettings || []).filter(
      (setting): setting is ShiftSetting =>
        Boolean(setting && typeof setting === 'object' && 'loaiCaiDat' in setting)
    )
  );
  const exportMatchScope = input.exportMatchScope ?? 'shift';
  const activeShiftFilter =
    input.shiftFilter && input.shiftFilter !== 'all' ? String(input.shiftFilter).trim() : '';

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
      if (!shiftNamesMatch(order.shift, input.shiftFilter, shiftOptions)) continue;
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

  const materialsCatalog = input.materials.map(mapMaterialToWeightCatalogItem);
  const rows: BbWarehouseExportLineRow[] = [];

  const pushExportRow = (row: Omit<BbWarehouseExportLineRow, 'key' | 'slipLineKey'> & { slipLineKey?: string }) => {
    const slipLineKey =
      row.slipLineKey ||
      `${row.slipCode}|${row.itemCode}|${row.ngay}`;
    rows.push({
      ...row,
      key: slipLineKey,
      slipLineKey
    });
  };

  for (const movement of input.warehouseMovements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!matchesControlBoardDateRange(movement.slipDate, input.dateFrom, input.dateTo)) continue;

    const movementShift = String(movement.shift || '').trim();
    // Tab / banner theo ca: phiếu có ca thì phải khớp ca đang lọc.
    if (exportMatchScope === 'shift' && activeShiftFilter) {
      if (movementShift) {
        if (!shiftNamesMatch(movementShift, activeShiftFilter, shiftOptions)) continue;
      }
    }

    const movementMachineCandidates = resolveWarehouseMovementMachineCandidates(
      movement,
      input.productionOrders,
      linked => resolveProductionOrderMachine(linked as ProductionOrderRow, input.machines)
    );
    // Chỉ lọc máy khi phiếu ghi rõ cột Máy — không loại vì mã LSX sai trên lý do.
    const explicitSlipMachine = String(movement.machine || '').trim();
    if (
      explicitSlipMachine &&
      !machineValueMatchesFilter(
        input.machineFilter || 'all',
        input.selectedMachine ?? null,
        explicitSlipMachine
      )
    ) {
      continue;
    }

    const relatedOrders = headers.filter(order => {
      if (!matchesWarehouseExportDate(order.ngay, movement.slipDate)) {
        return false;
      }
      if (exportMatchScope === 'shift') {
        if (activeShiftFilter) {
          if (!shiftNamesMatch(order.shift, activeShiftFilter, shiftOptions)) return false;
        } else if (movementShift) {
          if (!shiftNamesMatch(movementShift, order.shift, shiftOptions)) return false;
        }
      }
      return true;
    });

    if (relatedOrders.length === 0) {
      // Phiếu xuất đúng ngày+ca lọc nhưng chưa có / không khớp lệnh SX — vẫn hiện trên tab xuất kho.
      if (exportMatchScope === 'shift' && activeShiftFilter) {
        if (movementShift && !shiftNamesMatch(movementShift, activeShiftFilter, shiftOptions)) continue;
      }
      const linkedCodes = extractLinkedProductionOrderCodes(movement.reason, movement.note);
      const quantity = Number.isFinite(movement.quantity) ? movement.quantity : 0;
      const weightKg = resolveExportWeightKg(movement, input.materials);
      pushExportRow({
        ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
        shift: movementShift || activeShiftFilter || '',
        shiftLabel: formatProductionOrderShiftLabel(
          movementShift || activeShiftFilter || '',
          lookupSettings
        ),
        orderCode: linkedCodes.join(', '),
        machine: explicitSlipMachine || movementMachineCandidates.join(', '),
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
        matchedByOrder: false,
        balanceDetail: null
      });
      continue;
    }

    const explicitMatches = relatedOrders.filter(order => movementMatchesOrderCode(movement, order.orderCode));
    // Phiếu ghi mã LSX không khớp lệnh đang lọc → vẫn gán theo ngày+ca (không bỏ sót xuất thực tế).
    // Theo ca + phiếu chưa gắn mã lệnh: không gán chéo sang lệnh ca khác — chỉ giữ lệnh cùng ca phiếu.
    const matchedOrders =
      explicitMatches.length > 0
        ? explicitMatches
        : exportMatchScope === 'shift' && activeShiftFilter
          ? relatedOrders.filter(order => shiftNamesMatch(order.shift, activeShiftFilter, shiftOptions))
          : exportMatchScope === 'shift' && movementShift
            ? relatedOrders.filter(order => shiftNamesMatch(movementShift, order.shift, shiftOptions))
            : relatedOrders;
    if (matchedOrders.length === 0) continue;
    const matchedByOrder = explicitMatches.length > 0;
    const orderShift = matchedOrders.map(order => order.shift).find(Boolean) || '';
    // Ca hiển thị = ca lệnh SX đang lọc, không lấy nhãn ca sai trên phiếu XK.
    let resolvedShift = orderShift || movementShift || activeShiftFilter || '';
    if (exportMatchScope === 'shift' && activeShiftFilter) {
      if (shiftNamesMatch(activeShiftFilter, orderShift, shiftOptions)) {
        resolvedShift = orderShift || activeShiftFilter;
      } else if (shiftNamesMatch(activeShiftFilter, movementShift, shiftOptions)) {
        resolvedShift = movementShift || activeShiftFilter;
      } else if (!movementShift) {
        resolvedShift = orderShift || activeShiftFilter;
      }
    }
    const orderCode = [...new Set(matchedOrders.map(order => order.orderCode).filter(Boolean))].join(', ');
    const machine =
      [...new Set(matchedOrders.map(order => order.machine).filter(Boolean))].join(', ') ||
      movementMachineCandidates.join(', ');

    const slipLineKey = `${movement.id || movement.slipCode}|${movement.itemCode}|${movement.slipDate}`;
    const quantity = Number.isFinite(movement.quantity) ? movement.quantity : 0;
    const weightKg = resolveExportWeightKg(movement, input.materials);
    pushExportRow({
      ngay: parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate,
      shift: resolvedShift,
      shiftLabel: formatProductionOrderShiftLabel(resolvedShift, lookupSettings),
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
      balanceDetail: null,
      slipLineKey
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

/** Banner «Tổng nhựa xuất»: dựng lại dòng xuất khớp ca (phiếu thiếu ca → suy từ lệnh SX). */
export function buildBbWarehouseExportLineRowsForShiftBanner(
  input: Omit<Parameters<typeof buildBbWarehouseExportLineRows>[0], 'exportMatchScope'>
): BbWarehouseExportLineRow[] {
  return buildBbWarehouseExportLineRows({ ...input, exportMatchScope: 'shift' });
}

export function sumBbProductionOrderTotals(rows: BbProductionOrderLineRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.quantity += row.quantity > 0 ? row.quantity : 0;
      acc.totalNormKg += row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0;
      acc.totalPlasticNormKg +=
        row.totalPlasticNormKg && row.totalPlasticNormKg > 0 ? row.totalPlasticNormKg : 0;
      return acc;
    },
    { quantity: 0, totalNormKg: 0, totalPlasticNormKg: 0 }
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

export type BbPlasticSummaryDetailMetric =
  | 'required'
  | 'export'
  | 'finished'
  | 'film'
  | 'norm'
  | 'norm_diff'
  | 'stock_net'
  | 'damaged'
  | 'difference';

export type BbPlasticSummaryDetailColumn = { key: string; label: string; align?: 'left' | 'right' };
export type BbPlasticSummaryDetailView = {
  metric: BbPlasticSummaryDetailMetric;
  title: string;
  subtitle: string;
  valueText: string;
  formula: string;
  source: string;
  columns: BbPlasticSummaryDetailColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
  totalCells?: Record<string, string | number | null | undefined>;
};

function isBbDamagedPlasticContributorRow(
  row: BbDamagedGoodsLineRow,
  options?: { isInsulationMachine?: boolean }
): boolean {
  if (isBbDamagedFilmScrapRow(row)) return false;
  if (row.key.includes('|sp_loi|')) return true;
  return String(row.materialName || '').startsWith('Hàng hỏng');
}

/** Popup công thức / nguồn cho banner «Tổng hợp nhựa». */
export function buildBbPlasticSummaryDetailView(input: {
  metric: BbPlasticSummaryDetailMetric;
  orderRows: BbProductionOrderLineRow[];
  exportRows: BbWarehouseExportLineRow[];
  damagedRows: BbDamagedGoodsLineRow[];
  sanLuongGroups: BbSanLuongGroup[];
  dauCaPlasticKg: number;
  cuoiCaPlasticKg: number;
  exportPlasticKg: number;
  requiredKg: number;
  finishedKg: number;
  stockNetKg: number;
  damagedKg: number;
  differenceKg: number;
  normKg: number;
  normDiffKg: number;
  insulationFilmWeightKg: number;
  displaySanLuongWeightKg: number;
  displaySanLuongQuantity: number;
  isInsulationMachine: boolean;
  sanLuongSource: 'acceptance' | 'can-tu-dong';
  /** Kho sản phẩm — định lượng NVL màng trên Thành phần SP. */
  products?: ProductRow[];
  /** Phiếu cân đã lọc ngày·ca·máy — để đếm SL cuộn theo mã SP. */
  canTuDongRecords?: CanTuDongWeightRow[];
  /** Công thức Nhựa TT / ĐM từ tab cân thực tế (nếu có). */
  canTuDongNhuaTtFormula?: string;
  canTuDongNhuaDmFormula?: string;
}): BbPlasticSummaryDetailView {
  const fmt = (value: number | null | undefined, digits = 2) =>
    value !== null && value !== undefined && Number.isFinite(value) ? roundQty(value, digits) : null;

  switch (input.metric) {
    case 'required': {
      const rows = input.orderRows
        .filter(row => (row.totalNormKg ?? 0) > 0)
        .map(row => ({
          ngay: row.ngay || '—',
          orderCode: row.orderCode || '—',
          product: `${row.productCode || '—'} · ${row.productName || '—'}`,
          quantity: fmt(row.quantity, 2),
          totalNormKg: fmt(row.totalNormKg, 2)
        }));
      return {
        metric: input.metric,
        title: 'Tổng nhựa yêu cầu',
        subtitle: 'Σ cột «Tổng (kg)» trên tab Lệnh sản xuất',
        valueText: `${fmt(input.requiredKg, 2) ?? 0} kg`,
        formula: 'Tổng nhựa yêu cầu = Σ Tổng (kg) từng dòng lệnh SX',
        source: 'Tab «Lệnh sản xuất» · cột «Tổng (kg)»',
        columns: [
          { key: 'ngay', label: 'Ngày' },
          { key: 'orderCode', label: 'Lệnh SX' },
          { key: 'product', label: 'Sản phẩm' },
          { key: 'quantity', label: 'SL', align: 'right' },
          { key: 'totalNormKg', label: 'Tổng (kg)', align: 'right' }
        ],
        rows,
        totalCells: { ngay: 'Tổng', orderCode: '', product: '', quantity: null, totalNormKg: fmt(input.requiredKg, 2) }
      };
    }
    case 'export': {
      const rows = aggregateBbWarehouseExportByMaterial(input.exportRows)
        .filter(row => isWarehouseKgUnit(row.unit || '') && row.weightKg > 0)
        .map(row => ({
          itemCode: row.itemCode || '—',
          itemName: row.itemName || '—',
          unit: row.unit || 'kg',
          lineCount: row.lineCount,
          weightKg: fmt(row.weightKg, 2)
        }));
      return {
        metric: input.metric,
        title: 'Tổng nhựa xuất',
        subtitle: 'Σ «Quy về kg» dòng ĐVT = kg · phiếu xuất ca đang chọn',
        valueText: `${fmt(input.exportPlasticKg, 2) ?? 0} kg`,
        formula: 'Tổng nhựa xuất = Σ Quy về kg (chỉ dòng ĐVT = kg, theo ca)',
        source: 'Tab «Phiếu xuất kho» · cột «Quy về kg» · lọc theo ca',
        columns: [
          { key: 'itemCode', label: 'Mã NVL' },
          { key: 'itemName', label: 'Tên NVL' },
          { key: 'unit', label: 'ĐVT' },
          { key: 'lineCount', label: 'Dòng', align: 'right' },
          { key: 'weightKg', label: 'Quy về kg', align: 'right' }
        ],
        rows,
        totalCells: { itemCode: 'Tổng', itemName: '', unit: '', lineCount: null, weightKg: fmt(input.exportPlasticKg, 2) }
      };
    }
    case 'film': {
      const products = input.products || [];
      const records = input.canTuDongRecords || [];
      const rollCountByProduct = new Map<string, number>();
      for (const record of records) {
        const key = normalizeProductCodeKey(parseCanTuDongQrProductCode(record.qr_code));
        if (!key) continue;
        rollCountByProduct.set(key, (rollCountByProduct.get(key) || 0) + 1);
      }

      const rows: Array<Record<string, string | number | null | undefined>> = [];
      const seenProduct = new Set<string>();
      for (const [productKey, rollCount] of rollCountByProduct.entries()) {
        const product =
          findProductByCode(products, productKey) ||
          products.find(row => {
            const aliases = [row.code, row.newCode, row.amisCode].map(code => normalizeProductCodeKey(code));
            return aliases.includes(productKey);
          });
        if (!product) continue;
        const identity = normalizeProductCodeKey(product.code) || productKey;
        if (seenProduct.has(identity)) continue;
        seenProduct.add(identity);

        const filmLines = listInsulationFilmBomLines(product);
        const filmPerRoll = resolveInsulationFilmKgPerRoll(product);
        if (filmLines.length === 0) {
          rows.push({
            productCode: product.code || productKey,
            productName: product.name || '—',
            nvlCode: '—',
            nvlName: 'Chưa có NVL màng trên Thành phần SP',
            dinhLuong: '—',
            unit: '—',
            rollCount,
            filmKg: filmPerRoll != null && rollCount > 0 ? fmt(filmPerRoll * rollCount, 2) : '—'
          });
          continue;
        }
        for (const line of filmLines) {
          const lineFilmKg = line.dinhLuong * 2 * rollCount;
          rows.push({
            productCode: product.code || productKey,
            productName: product.name || '—',
            nvlCode: line.code || '—',
            nvlName: line.name || '—',
            dinhLuong: fmt(line.dinhLuong, 4),
            unit: 'kg',
            rollCount,
            filmKg: fmt(lineFilmKg, 2)
          });
        }
      }

      rows.sort((a, b) =>
        String(a.productCode || '').localeCompare(String(b.productCode || ''), 'vi')
      );

      const rowsFilmTotal = rows.reduce((sum, row) => {
        const value = typeof row.filmKg === 'number' ? row.filmKg : Number(row.filmKg);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      const filmTotalKg =
        rowsFilmTotal > 0 ? roundQty(rowsFilmTotal, 2) : fmt(input.insulationFilmWeightKg, 2);

      return {
        metric: input.metric,
        title: 'Trọng lượng màng (TL màng)',
        subtitle: `${input.displaySanLuongQuantity} SP · máy cách nhiệt · nguồn /can-tu-dong`,
        valueText: `${filmTotalKg ?? 0} kg`,
        formula: 'TL màng = định lượng NVL màng (kg, Kho sản phẩm) × 2 × số lượng cuộn',
        source: 'Thành phần SP trên Kho sản phẩm · dòng màng · ĐVT kg · × 2 lớp × số phiếu cân',
        columns: [
          { key: 'productCode', label: 'Mã SP' },
          { key: 'nvlCode', label: 'Mã NVL màng' },
          { key: 'nvlName', label: 'Tên NVL' },
          { key: 'dinhLuong', label: 'Định lượng (kg)', align: 'right' },
          { key: 'unit', label: 'ĐVT' },
          { key: 'rollCount', label: 'SL cuộn', align: 'right' },
          { key: 'filmKg', label: 'TL màng (kg)', align: 'right' }
        ],
        rows:
          rows.length > 0
            ? rows
            : [
                {
                  productCode: '—',
                  nvlCode: '—',
                  nvlName: 'Chưa có định lượng màng trên Kho sản phẩm / phiếu cân',
                  dinhLuong: '—',
                  unit: 'kg',
                  rollCount: null,
                  filmKg: fmt(input.insulationFilmWeightKg, 2)
                }
              ],
        totalCells: {
          productCode: 'Tổng',
          nvlCode: '',
          nvlName: 'Định lượng (kg) × 2 × SL',
          dinhLuong: '',
          unit: 'kg',
          rollCount: input.displaySanLuongQuantity,
          filmKg: filmTotalKg
        }
      };
    }
    case 'finished': {
      if (input.sanLuongSource === 'can-tu-dong') {
        const nhuaTtFormula =
          input.canTuDongNhuaTtFormula ||
          (input.isInsulationMachine
            ? 'SP − lõi − bì − màng'
            : 'SP − lõi − bì − màng');
        const rows = [
          {
            chiTieu: 'TL nhựa thành phẩm',
            congThuc: nhuaTtFormula,
            giaTri: fmt(input.finishedKg, 2)
          }
        ];
        return {
          metric: input.metric,
          title: 'Tổng nhựa thành phẩm',
          subtitle: `${input.displaySanLuongQuantity} cuộn · tab Dữ liệu cân thực tế`,
          valueText: `${fmt(input.finishedKg, 2) ?? 0} kg`,
          formula: nhuaTtFormula,
          source: 'Tab «Dữ liệu cân thực tế» · cột Trọng lượng Nhựa TT',
          columns: [
            { key: 'chiTieu', label: 'Chỉ tiêu' },
            { key: 'congThuc', label: 'Công thức' },
            { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
          ],
          rows,
          totalCells: { chiTieu: 'Tổng', congThuc: '', giaTri: fmt(input.finishedKg, 2) }
        };
      }
      const rows = input.sanLuongGroups.flatMap(group =>
        (group.productGroups || []).map(product => ({
          ngay: group.ngay || '—',
          orderCode: group.orderCode || '—',
          product: `${product.productCode || '—'} · ${product.productName || '—'}`,
          quantity: fmt(product.quantity, 2),
          actualWeightKg: fmt(product.totalActualWeightKg, 2)
        }))
      );
      return {
        metric: input.metric,
        title: 'Tổng nhựa thành phẩm',
        subtitle: 'Σ trọng lượng thực tế tab Báo cáo sản lượng',
        valueText: `${fmt(input.finishedKg, 2) ?? 0} kg`,
        formula: 'Tổng nhựa TP = Σ «Trọng lượng thực tế (kg)» từng SP',
        source: 'Tab «Báo cáo sản lượng» · phiếu nghiệm thu',
        columns: [
          { key: 'ngay', label: 'Ngày' },
          { key: 'orderCode', label: 'Lệnh SX' },
          { key: 'product', label: 'Sản phẩm' },
          { key: 'quantity', label: 'SL SP', align: 'right' },
          { key: 'actualWeightKg', label: 'TL thực tế (kg)', align: 'right' }
        ],
        rows,
        totalCells: {
          ngay: 'Tổng',
          orderCode: '',
          product: '',
          quantity: fmt(input.displaySanLuongQuantity, 2),
          actualWeightKg: fmt(input.finishedKg, 2)
        }
      };
    }
    case 'norm': {
      const nhuaDmFormula =
        input.canTuDongNhuaDmFormula || 'KL nhựa+phụ gia (Kho hàng) × cuộn';
      return {
        metric: input.metric,
        title: 'Tổng nhựa định mức',
        subtitle: `${input.displaySanLuongQuantity} cuộn có KL nhựa+phụ gia trên Kho hàng`,
        valueText: `${fmt(input.normKg, 2) ?? 0} kg`,
        formula: nhuaDmFormula,
        source: 'Tab «Dữ liệu cân thực tế» · cột Trọng lượng Nhựa ĐM',
        columns: [
          { key: 'chiTieu', label: 'Chỉ tiêu' },
          { key: 'congThuc', label: 'Công thức' },
          { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
        ],
        rows: [
          {
            chiTieu: 'Nhựa định mức',
            congThuc: nhuaDmFormula,
            giaTri: fmt(input.normKg, 2)
          }
        ],
        totalCells: { chiTieu: 'Tổng', congThuc: '', giaTri: fmt(input.normKg, 2) }
      };
    }
    case 'norm_diff':
      return {
        metric: input.metric,
        title: 'Chênh lệch định mức',
        subtitle: 'So sánh nhựa định mức với nhựa thành phẩm',
        valueText: `${fmt(input.normDiffKg, 2) ?? 0} kg`,
        formula: 'Chênh lệch = Tổng nhựa định mức − Tổng nhựa thành phẩm',
        source: 'Banner «Tổng hợp nhựa» · cột giữa (máy cách nhiệt)',
        columns: [
          { key: 'chiTieu', label: 'Chỉ tiêu' },
          { key: 'congThuc', label: 'Công thức' },
          { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
        ],
        rows: [
          { chiTieu: 'Tổng nhựa định mức', congThuc: input.canTuDongNhuaDmFormula || 'KL nhựa+phụ gia × cuộn', giaTri: fmt(input.normKg, 2) },
          { chiTieu: 'Tổng nhựa thành phẩm', congThuc: input.canTuDongNhuaTtFormula || 'SP − lõi − bì − màng', giaTri: fmt(-input.finishedKg, 2) },
          { chiTieu: 'Chênh lệch', congThuc: 'ĐM − TP', giaTri: fmt(input.normDiffKg, 2) }
        ],
        totalCells: { chiTieu: 'Tổng', congThuc: '', giaTri: fmt(input.normDiffKg, 2) }
      };
    case 'stock_net':
      return {
        metric: input.metric,
        title: 'Xuất thực dùng',
        subtitle: 'Tồn đầu ca + Xuất nhựa (ca) − Tồn cuối ca',
        valueText: `${fmt(input.stockNetKg, 2) ?? 0} kg`,
        formula: `${fmt(input.dauCaPlasticKg, 2) ?? 0} + ${fmt(input.exportPlasticKg, 2) ?? 0} − ${fmt(input.cuoiCaPlasticKg, 2) ?? 0} = ${fmt(input.stockNetKg, 2) ?? 0} kg`,
        source: 'Tab «Tồn đầu ca» + «Phiếu xuất kho» (theo ca) − «Kiểm tồn cuối ca» (chỉ nhựa ĐVT kg)',
        columns: [
          { key: 'chiTieu', label: 'Chỉ tiêu' },
          { key: 'congThuc', label: 'Công thức' },
          { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
        ],
        rows: [
          { chiTieu: 'Tồn đầu ca (nhựa)', congThuc: 'Σ nhựa ĐVT kg', giaTri: fmt(input.dauCaPlasticKg, 2) },
          { chiTieu: 'Xuất nhựa', congThuc: 'Σ Quy về kg (ĐVT kg)', giaTri: fmt(input.exportPlasticKg, 2) },
          { chiTieu: 'Tồn cuối ca (nhựa)', congThuc: 'Σ nhựa ĐVT kg', giaTri: fmt(-input.cuoiCaPlasticKg, 2) },
          { chiTieu: 'Xuất thực dùng', congThuc: 'Tồn đầu + Xuất − Tồn cuối', giaTri: fmt(input.stockNetKg, 2) }
        ],
        totalCells: { chiTieu: 'Tổng', congThuc: '', giaTri: fmt(input.stockNetKg, 2) }
      };
    case 'damaged': {
      const rows = input.damagedRows
        .filter(row => isBbDamagedPlasticContributorRow(row, { isInsulationMachine: input.isInsulationMachine }))
        .filter(row => (row.weightKg ?? 0) > 0)
        .map(row => ({
          ngay: row.ngay || '—',
          orderCode: row.orderCode || '—',
          material: row.materialName || row.materialCode || '—',
          weightKg: fmt(row.weightKg, 2)
        }));
      return {
        metric: input.metric,
        title: 'Tổng nhựa lỗi',
        subtitle: 'Σ SP lỗi (Hàng hỏng), không gồm rác màng',
        valueText: `${fmt(input.damagedKg, 2) ?? 0} kg`,
        formula: 'Tổng nhựa lỗi = Σ trọng lượng SP lỗi trên tab Báo cáo lỗi hỏng',
        source: 'Tab «Báo cáo lỗi hỏng» · loại SP lỗi (Hàng hỏng)',
        columns: [
          { key: 'ngay', label: 'Ngày' },
          { key: 'orderCode', label: 'Lệnh SX' },
          { key: 'material', label: 'Dòng lỗi hỏng' },
          { key: 'weightKg', label: 'KL (kg)', align: 'right' }
        ],
        rows,
        totalCells: { ngay: 'Tổng', orderCode: '', material: '', weightKg: fmt(input.damagedKg, 2) }
      };
    }
    case 'difference':
    default:
      return {
        metric: 'difference',
        title: 'Chênh lệch',
        subtitle: input.isInsulationMachine
          ? 'Trọng lượng nhựa (đã trừ màng) − Xuất thực dùng + Lỗi'
          : 'Tổng nhựa thành phẩm − Xuất thực dùng + Lỗi',
        valueText: `${fmt(input.differenceKg, 2) ?? 0} kg`,
        formula: `${fmt(input.finishedKg, 2) ?? 0} − ${fmt(input.stockNetKg, 2) ?? 0} + ${fmt(input.damagedKg, 2) ?? 0} = ${fmt(input.differenceKg, 2) ?? 0} kg`,
        source: 'Banner «Tổng hợp nhựa» · cột cuối',
        columns: [
          { key: 'chiTieu', label: 'Chỉ tiêu' },
          { key: 'congThuc', label: 'Công thức' },
          { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
        ],
        rows: [
          {
            chiTieu: input.isInsulationMachine ? 'TL nhựa (đã trừ màng)' : 'Tổng nhựa thành phẩm',
            congThuc: input.isInsulationMachine ? 'TL nhựa − TL màng' : 'Tab sản lượng',
            giaTri: fmt(input.finishedKg, 2)
          },
          {
            chiTieu: 'Xuất thực dùng',
            congThuc: 'Tồn đầu + Xuất − Tồn cuối',
            giaTri: fmt(-input.stockNetKg, 2)
          },
          {
            chiTieu: 'Tổng nhựa lỗi',
            congThuc: 'Σ SP lỗi (Hàng hỏng)',
            giaTri: fmt(input.damagedKg, 2)
          },
          { chiTieu: 'Chênh lệch', congThuc: 'TP − Xuất thực dùng + Lỗi', giaTri: fmt(input.differenceKg, 2) }
        ],
        totalCells: { chiTieu: 'Tổng', congThuc: '', giaTri: fmt(input.differenceKg, 2) }
      };
  }
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
  rows: BbWarehouseExportLineRow[],
  materials?: MaterialRow[]
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
    const freshKg =
      materials && materials.length > 0 ? resolveBbWarehouseExportLineWeightKg(row, materials) : null;
    const kg =
      freshKg !== null && freshKg > 0
        ? freshKg
        : row.weightKg && row.weightKg > 0
          ? row.weightKg
          : 0;
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

function bbWarehouseExportGroupMatchesOrder(
  group: BbWarehouseExportGroup,
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
) {
  const orderNgay = order.ngay ? parseProductionOrderFilterDate(order.ngay) || order.ngay : '';
  if (orderNgay && group.ngay && group.ngay !== orderNgay) return false;
  if (order.shift && group.shift && !shiftNamesMatch(group.shift, order.shift)) return false;
  if (order.machine && group.machine) {
    const machineCandidates = String(group.machine)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (
      machineCandidates.length > 0 &&
      !machineCandidates.some(machine =>
        machineValueMatchesFilter(
          order.machine!,
          { code: order.machine!, name: order.machine! },
          machine
        )
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Tab «Phiếu xuất kho» (lọc ca) — nhóm xuất khớp lệnh/ngày+ca.
 * Cùng logic gắn phiếu như `buildBbWarehouseExportLineRows` + `groupBbWarehouseExportLines`.
 */
export function findBbWarehouseExportGroupsForOrder(
  exportGroups: BbWarehouseExportGroup[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
): BbWarehouseExportGroup[] {
  if (order.groupKey) {
    const byKey = exportGroups.filter(
      group => group.groupKey === order.groupKey && bbWarehouseExportGroupMatchesOrder(group, order)
    );
    if (byKey.length > 0) return byKey;
  }
  const byOrder = exportGroups.filter(
    group =>
      bbOrderCodesMatch(group.orderCode, order.orderCode) && bbWarehouseExportGroupMatchesOrder(group, order)
  );
  if (byOrder.length > 0) return byOrder;

  if (order.ngay && order.shift) {
    return exportGroups.filter(group => bbWarehouseExportGroupMatchesOrder(group, order));
  }
  return [];
}

/** Dòng tab xuất kho khớp một lệnh in (mã LSX + ngày + ca + máy). */
export function filterBbWarehouseExportLinesForOrder(
  exportRows: BbWarehouseExportLineRow[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string }
): BbWarehouseExportLineRow[] {
  const orderNgay = order.ngay ? parseProductionOrderFilterDate(order.ngay) || order.ngay : '';
  return exportRows.filter(line => {
    const lineNgay = parseProductionOrderFilterDate(line.ngay) || line.ngay;
    if (orderNgay && lineNgay && lineNgay !== orderNgay) return false;
    if (order.shift && line.shift && !shiftNamesMatch(line.shift, order.shift)) return false;
    if (order.machine && line.machine) {
      const machineCandidates = String(line.machine)
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      if (
        machineCandidates.length > 0 &&
        !machineCandidates.some(machine =>
          machineValueMatchesFilter(
            order.machine!,
            { code: order.machine!, name: order.machine! },
            machine
          )
        )
      ) {
        return false;
      }
    }
    if (!String(line.orderCode || '').trim()) {
      return Boolean(orderNgay && order.shift);
    }
    return bbOrderCodesMatch(line.orderCode, order.orderCode);
  });
}

/** Cột «Trọng lượng vật tư xuất kho» mục 3.1/3.2 = Σ «Quy về kg» tab DỮ LIỆU XUẤT KHO (lọc ca). */
export function buildBbWarehouseExportMaterialTotalsForOrderFromExportTab(
  exportGroups: BbWarehouseExportGroup[],
  order: { orderCode: string; groupKey?: string; ngay?: string; shift?: string; machine?: string },
  exportRows: BbWarehouseExportLineRow[] = [],
  materials?: MaterialRow[]
): BbWarehouseExportMaterialTotal[] {
  const lines =
    exportRows.length > 0
      ? filterBbWarehouseExportLinesForOrder(exportRows, order)
      : findBbWarehouseExportGroupsForOrder(exportGroups, order).flatMap(group => group.lines || []);
  return aggregateBbWarehouseExportByMaterial(lines, materials);
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
  /** Σ định mức nhựa («Trọng lượng nhựa + phụ gia» × SL). */
  totalPlasticNormKg: number;
  actualQuantity: number;
  actualWeightKg: number;
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

/** Gom dòng hàng theo số lệnh SX (giữ thứ tự ngày desc). Cùng mã SP trong lệnh được gộp. */
export function groupBbProductionOrderLines(rows: BbProductionOrderLineRow[]): BbProductionOrderGroup[] {
  const map = new Map<string, BbProductionOrderGroup>();

  for (const row of mergeBbProductionOrderLineRowsByProduct(rows)) {
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
        totalPlasticNormKg:
          row.totalPlasticNormKg && row.totalPlasticNormKg > 0 ? row.totalPlasticNormKg : 0,
        actualQuantity: row.actualQuantity > 0 ? row.actualQuantity : 0,
        actualWeightKg: row.actualWeightKg && row.actualWeightKg > 0 ? row.actualWeightKg : 0,
        unit: row.unit || '',
        normKgPerUnit: row.normKgPerUnit,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.quantity += row.quantity > 0 ? row.quantity : 0;
    existing.totalNormKg += row.totalNormKg && row.totalNormKg > 0 ? row.totalNormKg : 0;
    existing.totalPlasticNormKg +=
      row.totalPlasticNormKg && row.totalPlasticNormKg > 0 ? row.totalPlasticNormKg : 0;
    existing.actualQuantity += row.actualQuantity > 0 ? row.actualQuantity : 0;
    existing.actualWeightKg += row.actualWeightKg && row.actualWeightKg > 0 ? row.actualWeightKg : 0;
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

/** Khóa nhóm xuất kho: tách theo lệnh + ngày + ca (tránh gom 12C1/12C2 chung một lệnh). */
function buildBbWarehouseExportGroupKey(row: Pick<BbWarehouseExportLineRow, 'orderCode' | 'ngay' | 'shift'>) {
  const orderCode = String(row.orderCode || '').trim();
  const ngay = String(row.ngay || '').trim();
  const shift = String(row.shift || '').trim();
  if (orderCode) return `${orderCode}|${ngay}|${shift}`;
  return `unlinked|${ngay}|${shift}`;
}

/** Gom dòng xuất kho theo số lệnh SX + ngày + ca. */
export function groupBbWarehouseExportLines(
  rows: BbWarehouseExportLineRow[],
  productionOrders: ProductionOrderRow[] = [],
  products: ProductRow[] = [],
  materials: MaterialRow[] = [],
  shiftSettings: (ShiftSetting | ProductionOrderLookupSetting)[] = []
): BbWarehouseExportGroup[] {
  const map = new Map<string, BbWarehouseExportGroup>();

  for (const row of rows) {
    const groupKey = buildBbWarehouseExportGroupKey(row);
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
    group.productGroups = buildBbWarehouseExportProductGroups(
      group,
      productionOrders,
      products,
      materials,
      shiftSettings
    );
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

/** SP lỗi + SP rác trên Báo cáo sản lượng. */
export function isAcceptanceLoiRacLoai(loaiVatTu?: string | null): boolean {
  return isAcceptanceSpLoiLoai(loaiVatTu) || isAcceptanceSpRacLoai(loaiVatTu);
}

function normalizeBbProductWarehouseKey(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sản phẩm thuộc Kho hàng hỏng (cột Kho trên danh mục SP). */
export function isBbDamagedGoodsProductWarehouse(warehouse?: string | null): boolean {
  const key = normalizeBbProductWarehouseKey(warehouse);
  if (!key) return false;
  return key.includes('hang hong') || key.includes('hang_hong') || key.includes('hang-hong') || key.includes('damaged');
}

/** NVL thuộc Kho hàng hỏng (cột Kho trên danh mục `kho_nvl`) — dùng cho SP lỗi trên Báo cáo sản lượng. */
export function isBbDamagedGoodsMaterialWarehouse(warehouse?: string | null): boolean {
  return isBbDamagedGoodsProductWarehouse(warehouse);
}

/** SP thuộc Kho thành phẩm (cột Kho trên danh mục `san_pham`). */
export function isBbThanhPhamProductWarehouse(warehouse?: string | null): boolean {
  const key = normalizeBbProductWarehouseKey(warehouse);
  if (!key) return false;
  return (
    key.includes('thanh pham') ||
    key.includes('thanh_pham') ||
    key.includes('thanh-pham') ||
    key === 'kho san pham' ||
    key.includes('kho san pham')
  );
}

/** Phiếu Báo cáo sản lượng — Thành phẩm + mã SP thuộc Kho thành phẩm. */
export function isAcceptanceThanhPhamKhoReport(
  report: AcceptanceReport,
  products: ProductRow[]
): boolean {
  if (!isAcceptanceThanhPhamLoai(report.loai_vat_tu)) return false;
  const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
  if (!productCode) return false;
  const product = findProductByCode(products, productCode);
  if (!product) return false;
  return isBbThanhPhamProductWarehouse(product.warehouse);
}

/** NVL thuộc kho rác (cột Kho trên danh mục `kho_nvl`) — dùng cho SP rác trên Báo cáo sản lượng. */
export function isBbRacMaterialWarehouse(warehouse?: string | null): boolean {
  const key = normalizeBbProductWarehouseKey(warehouse);
  if (!key) return false;
  return key.includes('kho rac') || key.includes('hang rac') || (key.includes('rac') && !key.includes('trac'));
}

function findBbMaterialRowByAcceptanceCode(materials: MaterialRow[], code: string): MaterialRow | undefined {
  const codeKey = normalizeMaterialCodeKey(code);
  if (!codeKey) return undefined;
  return materials.find(material => {
    const materialCode = normalizeMaterialCodeKey(material.code);
    const materialName = normalizeMaterialCodeKey(material.name);
    if (!materialCode && !materialName) return false;
    return (
      materialCode === codeKey ||
      materialName === codeKey ||
      (materialCode && (materialCode.includes(codeKey) || codeKey.includes(materialCode)))
    );
  });
}

function resolveBbMaterialNormKgPerUnit(
  material: MaterialRow,
  materialsCatalog: WarehouseWeightCatalogItem[]
): number | null {
  const fromCatalog = findMaterialTongKgPerUnit(material.code, materialsCatalog);
  if (fromCatalog > 0) return roundQty(fromCatalog, 4);
  const raw = String(material.totalWeight || '').trim().replace(',', '.');
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? roundQty(num, 4) : null;
}

/**
 * Tab «Sản phẩm lỗi + rác» — SL SP lấy từ Báo cáo sản lượng (SP lỗi + SP rác),
 * khớp mã trong `kho_nvl`: SP lỗi → Kho hàng hỏng; SP rác → kho rác (cùng quy tắc form Báo cáo sản lượng).
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
    if (!isAcceptanceLoiRacLoai(report.loai_vat_tu)) return false;
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
      // Báo cáo lỗi/rác có thể được nhận diện từ `loai_vat_tu` ngay cả khi
      // mã chưa có trong kho NVL. Các trường bên dưới cần bản ghi NVL để lấy
      // tên, đơn vị và định mức, nên không được dùng biến `material` chưa có.
      const material = findBbMaterialRowByAcceptanceCode(input.materials, productCode);
      if (!material) continue;
      const qty = Number(report.so_luong);
      const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (inboundQty <= 0) continue;

      const isLoi = isAcceptanceHangHongSanLuongReport(report, input.materials);
      const isRac = isAcceptanceHangRacSanLuongReport(report, input.materials);
      if (!isLoi && !isRac) continue;

      const resolvedCode = material.code || productCode;
      const productKey = normalizeProductCodeKey(resolvedCode) || normalizeProductCodeKey(productCode);
      if (!productKey) continue;

      let productGroup = productMap.get(productKey);
      if (!productGroup) {
        productGroup = {
          productKey,
          productCode: resolvedCode,
          productName: String(report.ten_sp || material.name || productCode).trim(),
          unit: String(report.don_vi || material.unit || '').trim(),
          orderQuantity: 0,
          normKgPerUnit: resolveBbMaterialNormKgPerUnit(material, materialsCatalog),
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
      const reportKg = acceptanceReportWeightKg(report);
      const productWeightKg =
        reportKg > 0
          ? roundQty(reportKg, 4)
          : unitNorm !== null && unitNorm > 0
            ? roundQty(unitNorm * inboundQty, 4)
            : 0;
      productGroup.totalWeightKg += productWeightKg;

      const materialKey = normalizeProductCodeKey(resolvedCode) || normalizeProductCodeKey(material.name);
      if (!materialKey) continue;
      const expectedKg = productWeightKg > 0 ? productWeightKg : 0;
      if (expectedKg <= 0) continue;

      const materialNorm: BbMaterialNormFormula = {
        productCode: productGroup.productCode,
        productName: productGroup.productName,
        productQuantity: inboundQty,
        productUnit: productGroup.unit || 'SP',
        productNormKgPerUnit: unitNorm,
        materialCode: material.code,
        materialName: material.name || material.code,
        amountType: 'quantity',
        rate: unitNorm ?? expectedKg,
        rateUnit: material.unit || 'kg',
        rawExpectedQuantity: inboundQty,
        rawExpectedUnit: productGroup.unit || material.unit || 'SP',
        catalogKgPerUnit: unitNorm,
        componentWeightKg: unitNorm,
        totalNormKg: expectedKg,
        allocationRatio: 1,
        allocatedNormKg: expectedKg
      };

      const movementPrefix = `${report.id}|${resolvedCode}|`;
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
        itemCode: material.code,
        itemName: material.name || material.code,
        unit: material.unit || 'kg',
        quantity: inboundQty,
        normQuantity: inboundQty,
        normWeightKg: expectedKg,
        materialNorm,
        weightKg: expectedKg,
        weightFormula: null,
        matchedByOrder: true,
        balanceDetail: null
      });
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
      // Tab sản phẩm lỗi + rác: không trừ thêm «Hàng lỗi hỏng» — SL đã là SP lỗi/rác.
      const damagedTabTotalKg = 0;
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
  materials: MaterialRow[] = [],
  shiftSettings: (ShiftSetting | ProductionOrderLookupSetting)[] = []
): BbWarehouseExportProductGroup[] {
  const materialsCatalog = materials.map(mapMaterialToWeightCatalogItem);
  const shiftOptions = getProductionShiftOptions(
    shiftSettings.filter(
      (setting): setting is ShiftSetting =>
        Boolean(setting && typeof setting === 'object' && 'loaiCaiDat' in setting)
    )
  );
  const orderCodes = group.orderCode
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const codeSet = new Set(orderCodes.map(code => code.toUpperCase()));
  const relatedOrders = productionOrders.filter(order => {
    const orderCode = String(order.code || '').trim().toUpperCase();
    if (codeSet.size > 0 && !codeSet.has(orderCode)) return false;
    const ngay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (group.ngay && ngay && ngay !== group.ngay) return false;
    // Đã gắn mã LSX trên tab → lấy BOM từ lệnh (ca chuẩn = ca lệnh SX, không phụ thuộc nhãn ca phiếu).
    if (codeSet.size > 0) return true;
    if (!group.shift) return true;
    return shiftNamesMatch(order.shift, group.shift, shiftOptions);
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

/** NVL màng xi cho dòng «Rác màng xi (Vật tư khác)» trên tab lỗi hỏng (máy cách nhiệt). */
export type BbLoiHongFilmScrapMaterial = {
  materialCode: string;
  materialName: string;
  unit: string;
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
  /** Dòng NVL con — ghi lúc Tính toán, FE không tự tính lại. */
  mixingLines?: BbDamagedMixingChildRow[];
  mixingLineCount?: number;
  /** Mã NVL màng xi — ghi lúc Tính toán (máy cách nhiệt). */
  filmScrapMaterial?: BbLoiHongFilmScrapMaterial;
};

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

/**
 * Tab «Dữ liệu trong báo cáo hàng lỗi hỏng»:
 * lấy từ Báo cáo sản lượng (`bao_cao_nghiem_thu`) — mục Hàng hỏng (SP lỗi) + Hàng rác (SP rác),
 * gắn lệnh BB theo ngày + ca + máy.
 */
export function buildBbDamagedGoodsLineRows(input: {
  productionOrders: ProductionOrderRow[];
  acceptanceReports: AcceptanceReport[];
  /** @deprecated Không còn dùng — giữ optional để tương thích gọi cũ. */
  damagedRecords?: WeighingRecord[];
  materials?: MaterialRow[];
  machines: MachineRow[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbDamagedGoodsLineRow[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];
  const materials = input.materials ?? [];
  const rows: BbDamagedGoodsLineRow[] = [];

  const findOrderCodeForReport = (ngay: string, shift: string, machine: string) => {
    for (const order of input.productionOrders) {
      const orderNgay = parseProductionOrderFilterDate(order.startDate);
      if (orderNgay !== ngay) continue;
      if (!shiftNamesMatch(order.shift, shift)) continue;
      const machineLabel = resolveProductionOrderMachine(order, input.machines);
      if (
        machineValueMatchesFilter(machine, null, order.machine, order.position, machineLabel) ||
        machineValueMatchesFilter(machine, null, order.machine, machineLabel) ||
        (isBbMachineText(machine) && isBbMachineText(order.machine, machineLabel))
      ) {
        return String(order.code || '').trim();
      }
    }
    return '';
  };

  for (const report of input.acceptanceReports || []) {
    const isLoi = materials.length > 0
      ? isAcceptanceHangHongSanLuongReport(report, materials)
      : isAcceptanceSpLoiLoai(report.loai_vat_tu);
    const isRac = materials.length > 0
      ? isAcceptanceHangRacSanLuongReport(report, materials)
      : isAcceptanceSpRacLoai(report.loai_vat_tu);
    if (!isLoi && !isRac) continue;

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

    const weightKg = resolveAcceptanceReportWeightKg(report, materials);
    if (!(weightKg > 0)) continue;

    const machine =
      String(report.ten_may || report.ma_may || '').trim() || '—';
    const orderCode = findOrderCodeForReport(ngay || '', report.ca, machine);
    const shiftLabel = formatProductionOrderShiftLabel(report.ca, lookupSettings);
    const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
    const productName = String(report.ten_sp || '').trim() || productCode;
    const kindLabel = isLoi ? 'Hàng hỏng' : 'Hàng rác';
    const documentNo = String(report.id || '').trim() || `${report.ngay}|${report.ca}|${report.lan || ''}`;

    rows.push({
      key: `${documentNo}|${isLoi ? 'sp_loi' : 'sp_rac'}|${productCode}|${ngay}|${report.ca}`,
      ngay: ngay || '',
      shift: report.ca,
      shiftLabel,
      orderCode,
      machine,
      documentNo,
      productCode,
      productName,
      materialCode: productCode,
      materialName: productName ? `${kindLabel} · ${productName}` : kindLabel,
      unit: String(report.don_vi_trong_luong || '').trim() || 'kg',
      weightKg: roundQty(weightKg, 4),
      matchedByOrder: Boolean(orderCode)
    });
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

function isDamagedRowKind(row: BbDamagedGoodsLineRow, kind: 'sp_loi' | 'sp_rac'): boolean {
  if (row.key.includes(`|${kind}|`)) return true;
  const name = String(row.materialName || '');
  if (kind === 'sp_loi') return name.startsWith('Hàng hỏng');
  return name.startsWith('Hàng rác');
}

/** SP rác / dòng lỗi hỏng — rác màng (màng / film) không tính vào TL nhựa. */
export function isBbDamagedFilmScrapRow(row: BbDamagedGoodsLineRow): boolean {
  const text = `${row.productCode} ${row.productName} ${row.materialName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (text.includes('film')) return true;
  if (text.includes('mang xi') || text.includes('rac mang') || text.includes('racmang')) return true;
  if (text.includes('mang') && text.includes('rac')) return true;
  if (isDamagedRowKind(row, 'sp_rac') && text.includes('mang')) return true;
  if (isDamagedRowKind(row, 'sp_loi') && text.includes('mang') && text.includes('rac')) return true;
  return false;
}

/** Σ kg rác màng xi trên snapshot lỗi hỏng. */
export function sumBbDamagedFilmScrapKg(rows: BbDamagedGoodsLineRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (!isBbDamagedFilmScrapRow(row)) continue;
    const kg = row.weightKg > 0 ? row.weightKg : 0;
    if (kg > 0) total += kg;
  }
  return roundQty(total, 4);
}

function findBbLoiHongCatalogProduct(products: ProductRow[] | undefined, productCode: string) {
  return (
    findProductByCode(products || [], productCode) ||
    (products || []).find(
      product =>
        normalizeProductCodeKey(product.name) === normalizeProductCodeKey(productCode) ||
        normalizeProductCodeKey(product.name).includes(normalizeProductCodeKey(productCode || ''))
    )
  );
}

function upsertBbLoiHongFilmScrapCandidate(
  bucket: Map<string, BbLoiHongFilmScrapMaterial & { score: number }>,
  input: { materialCode: string; materialName: string; unit: string; score: number }
) {
  const materialCode = String(input.materialCode || '').trim();
  const materialName = String(input.materialName || materialCode || '').trim();
  const unit = String(input.unit || '').trim() || 'kg';
  if (!isWarehouseFilmItem(materialCode, materialName, unit)) return;
  if (!materialCode && !materialName) return;
  const key = materialIdentityKey(materialCode, materialName) || materialName.toUpperCase();
  const row: BbLoiHongFilmScrapMaterial & { score: number } = {
    materialCode,
    materialName: materialName || materialCode,
    unit,
    score: input.score
  };
  const existing = bucket.get(key);
  if (
    !existing ||
    row.score > existing.score ||
    (!existing.materialCode && row.materialCode)
  ) {
    bucket.set(key, row);
  }
}

function collectBbLoiHongFilmScrapFromProductNplItems(
  bucket: Map<string, BbLoiHongFilmScrapMaterial & { score: number }>,
  products: ProductRow[] | undefined,
  productCode: string,
  score: number
) {
  const catalog = findBbLoiHongCatalogProduct(products, productCode);
  for (const item of catalog?.nplItems || []) {
    upsertBbLoiHongFilmScrapCandidate(bucket, {
      materialCode: String(item.code || '').trim(),
      materialName: String(item.name || item.code || '').trim(),
      unit: String(item.unit || '').trim() || 'kg',
      score
    });
  }
}

/**
 * Tra mã NVL màng xi cho dòng «Rác màng xi (Vật tư khác)».
 * Ưu tiên BOM SP rác → BOM lệnh SX → phiếu xuất màng ca → danh mục NVL.
 */
export function resolveBbLoiHongFilmScrapMaterialForShift(input: {
  productionOrders?: ProductionOrderRow[];
  products?: ProductRow[];
  materials?: MaterialRow[];
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  ngay: string;
  shift: string;
  orderCode?: string;
  damagedLines?: BbDamagedGoodsLineRow[];
}): BbLoiHongFilmScrapMaterial | null {
  const bucket = new Map<string, BbLoiHongFilmScrapMaterial & { score: number }>();

  for (const row of input.damagedLines || []) {
    if (!isBbDamagedFilmScrapRow(row)) continue;
    collectBbLoiHongFilmScrapFromProductNplItems(bucket, input.products, row.productCode, 4);
  }

  const orderCodes = String(input.orderCode || '')
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const codeSet = new Set(orderCodes.map(code => code.toUpperCase()));
  for (const order of input.productionOrders || []) {
    if (codeSet.size > 0 && !codeSet.has(String(order.code || '').trim().toUpperCase())) continue;
    const ngay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (input.ngay && ngay && ngay !== input.ngay) continue;
    if (!shiftNamesMatch(order.shift, input.shift)) continue;
    for (const line of getProductionOrderProductLines(order)) {
      collectBbLoiHongFilmScrapFromProductNplItems(bucket, input.products, line.productCode, 3);
    }
  }

  for (const movement of input.warehouseMovements || []) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!matchesWarehouseExportDate(input.ngay, movement.slipDate)) {
      continue;
    }
    upsertBbLoiHongFilmScrapCandidate(bucket, {
      materialCode: String(movement.itemCode || '').trim(),
      materialName: String(movement.itemName || movement.itemCode || '').trim(),
      unit: String(movement.unit || '').trim() || 'kg',
      score: 2
    });
  }

  for (const material of input.materials || []) {
    upsertBbLoiHongFilmScrapCandidate(bucket, {
      materialCode: String(material.code || '').trim(),
      materialName: String(material.name || material.code || '').trim(),
      unit: String(material.unit || '').trim() || 'kg',
      score: 1
    });
  }

  const candidates = [...bucket.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.materialCode && !b.materialCode) return -1;
    if (!a.materialCode && b.materialCode) return 1;
    return a.materialName.localeCompare(b.materialName, 'vi');
  });
  const best = candidates[0];
  if (!best) return null;
  return {
    materialCode: best.materialCode,
    materialName: best.materialName,
    unit: best.unit
  };
}

/**
 * Phân loại lỗi hỏng theo nhựa / vật tư khác.
 * - TL nhựa = SP lỗi (Hàng hỏng), không gồm rác màng.
 * - Máy cách nhiệt: Vật tư khác = rác màng; máy khác: Vật tư khác = SP rác trừ rác màng.
 */
export function sumBbDamagedGoodsWeightKgByKind(
  rows: BbDamagedGoodsLineRow[],
  options?: { isInsulationMachine?: boolean }
): {
  plasticKg: number;
  otherKg: number;
} {
  let plasticKg = 0;
  let otherKg = 0;
  for (const row of rows) {
    const kg = row.weightKg > 0 ? row.weightKg : 0;
    if (!(kg > 0)) continue;

    if (isBbDamagedFilmScrapRow(row)) {
      otherKg += kg;
      continue;
    }

    if (isDamagedRowKind(row, 'sp_loi')) {
      plasticKg += kg;
      continue;
    }

    if (isDamagedRowKind(row, 'sp_rac') && !options?.isInsulationMachine) {
      otherKg += kg;
    }
  }
  return { plasticKg: roundQty(plasticKg, 4), otherKg: roundQty(otherKg, 4) };
}

/** Trọng lượng nhựa lỗi hỏng dùng phân bổ NVL nhựa (tab lỗi hỏng / in BB). */
export function resolveBbDamagedPlasticLoiHongKg(
  rows: BbDamagedGoodsLineRow[],
  options?: { isInsulationMachine?: boolean }
): number {
  return sumBbDamagedGoodsWeightKgByKind(rows, options).plasticKg;
}

/** Trọng lượng vật tư khác lỗi hỏng (máy cách nhiệt: rác màng xi). */
export function resolveBbDamagedOtherLoiHongKg(
  rows: BbDamagedGoodsLineRow[],
  options?: { isInsulationMachine?: boolean }
): number {
  return sumBbDamagedGoodsWeightKgByKind(rows, options).otherKg;
}

/** SP lỗi (Hàng hỏng) — cột lỗi hỏng NVL nhựa trên báo cáo máy BB. */
export function sumBbDamagedPlasticLoiHongKg(rows: BbDamagedGoodsLineRow[]): number {
  return sumBbDamagedGoodsWeightKgByKind(rows).plasticKg;
}

/** SP rác trừ rác màng — cột lỗi hỏng NVL khác. */
export function sumBbDamagedOtherKgExclFilmScrap(rows: BbDamagedGoodsLineRow[]): number {
  return sumBbDamagedGoodsWeightKgByKind(rows).otherKg;
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

/**
 * Hàng hỏng trên Báo cáo sản lượng:
 * 1) Mã trong `kho_nvl` thuộc Kho hàng hỏng (ưu tiên — kể cả `loai_vat_tu` lưu sai),
 * 2) Hoặc `loai_vat_tu` = SP lỗi khi không khớp danh mục NVL.
 */
export function isAcceptanceHangHongSanLuongReport(
  report: AcceptanceReport,
  materials: MaterialRow[]
): boolean {
  if (isAcceptanceSpRacLoai(report.loai_vat_tu)) return false;
  const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
  if (!productCode) return false;
  const material = findBbMaterialRowByAcceptanceCode(materials, productCode);
  if (material) {
    return isBbDamagedGoodsMaterialWarehouse(material.warehouse);
  }
  return isAcceptanceSpLoiLoai(report.loai_vat_tu);
}

/**
 * Hàng rác trên Báo cáo sản lượng:
 * 1) Mã trong `kho_nvl` thuộc kho rác,
 * 2) Hoặc `loai_vat_tu` = SP rác khi không khớp danh mục NVL.
 */
export function isAcceptanceHangRacSanLuongReport(
  report: AcceptanceReport,
  materials: MaterialRow[]
): boolean {
  if (isAcceptanceSpLoiLoai(report.loai_vat_tu)) return false;
  const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
  if (!productCode) return false;
  const material = findBbMaterialRowByAcceptanceCode(materials, productCode);
  if (material) {
    return isBbRacMaterialWarehouse(material.warehouse);
  }
  return isAcceptanceSpRacLoai(report.loai_vat_tu);
}

export type AcceptanceLoiHongWeightSplit = {
  nhuaKg: number;
  mangKg: number;
  tongKg: number;
};

/** Phân loại KL lỗi hỏng từ phiếu Báo cáo sản lượng — chỉ mặt hàng thuộc Kho hàng hỏng / kho rác. */
export function splitAcceptanceLoiHongWeightKg(
  report: AcceptanceReport,
  materials: MaterialRow[]
): AcceptanceLoiHongWeightSplit | null {
  const kg = resolveAcceptanceReportWeightKg(report, materials);
  if (!(kg > 0)) return null;
  if (isAcceptanceHangHongSanLuongReport(report, materials)) {
    return { nhuaKg: kg, mangKg: 0, tongKg: kg };
  }
  if (isAcceptanceHangRacSanLuongReport(report, materials)) {
    return { nhuaKg: 0, mangKg: kg, tongKg: kg };
  }
  return null;
}

function accumulateAcceptanceLoiHongForHeader(input: {
  acceptanceReports: AcceptanceReport[];
  materials: MaterialRow[];
  header: { ngay: string; shift: string; machine: string };
  shiftOptions: ReturnType<typeof getProductionShiftOptions>;
}) {
  let hangHongNhua = 0;
  let hangHongMang = 0;
  let tlNhuaKhongMangLoiHong = 0;
  let tlNhuaCucDauNongLoiHong = 0;
  let tlNhuaDinhMangLoiHong = 0;
  let tlMangLoiHong = 0;
  let soCuonLoiDinhHangHong = 0;
  let tongTrongLuongLoiHong = 0;

  for (const report of input.acceptanceReports) {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (
      !matchesShiftSummaryBucket(
        input.header.ngay,
        input.header.shift,
        ngay,
        report.ca,
        input.shiftOptions
      )
    ) {
      continue;
    }
    const machineOk =
      machineValueMatchesFilter(input.header.machine, null, report.ma_may, report.ten_may) ||
      (isBbMachineText(report.ma_may, report.ten_may) && isBbMachineText(input.header.machine));
    if (!machineOk && !isBbMachineText(report.ma_may, report.ten_may)) continue;

    const split = splitAcceptanceLoiHongWeightKg(report, input.materials);
    if (!split) continue;

    hangHongNhua += split.nhuaKg;
    hangHongMang += split.mangKg;
    tlNhuaKhongMangLoiHong += split.nhuaKg;
    tlMangLoiHong += split.mangKg;
    tongTrongLuongLoiHong += split.tongKg;
  }

  return {
    hangHongNhua,
    hangHongMang,
    tlNhuaKhongMangLoiHong,
    tlNhuaCucDauNongLoiHong,
    tlNhuaDinhMangLoiHong,
    tlMangLoiHong,
    soCuonLoiDinhHangHong,
    tongTrongLuongLoiHong
  };
}

/** SP rác (Kho rác) trên Báo cáo sản lượng. */
export function isAcceptanceSpRacLoai(loaiVatTu?: string | null): boolean {
  const key = normalizeAcceptanceLoaiVatTuKey(loaiVatTu);
  if (!key) return false;
  return key === 'sp rac' || key.includes('sp rac') || key.includes('kho rac') || key.includes('hang rac');
}

/** Thành phẩm trên Báo cáo sản lượng (không gồm SP lỗi / SP rác). */
export function isAcceptanceThanhPhamLoai(loaiVatTu?: string | null): boolean {
  const key = normalizeAcceptanceLoaiVatTuKey(loaiVatTu);
  if (!key) return false;
  if (isAcceptanceSpLoiLoai(loaiVatTu) || isAcceptanceSpRacLoai(loaiVatTu)) return false;
  return key === 'thanh pham' || key.includes('thanh pham');
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

/** KL phiếu Báo cáo sản lượng — ưu tiên `trong_luong`, fallback ĐM NVL × SL. */
function resolveAcceptanceReportWeightKg(report: AcceptanceReport, materials?: MaterialRow[]): number {
  const fromField = acceptanceReportWeightKg(report);
  if (fromField > 0) return fromField;

  const qty = Number(report.so_luong);
  const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  if (inboundQty <= 0 || !materials?.length) return 0;

  const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
  if (!productCode) return 0;
  const material = findBbMaterialRowByAcceptanceCode(materials, productCode);
  if (!material) return 0;

  const raw = String(material.totalWeight || '').trim().replace(',', '.');
  const norm = Number(raw);
  if (Number.isFinite(norm) && norm > 0) {
    return roundQty(norm * inboundQty, 4);
  }
  return 0;
}

/**
 * SL + KL thực tế thành phẩm đạt nhập kho — từ phiếu Báo cáo sản lượng (loại thành phẩm),
 * khớp ngày + ca + máy + mã/tên SP.
 * @deprecated Dùng enrichBbProductionOrderRowsFromSanLuong — cùng nguồn tab sản lượng sau Tính toán.
 */
export function acceptanceThanhPhamActualForBbProduct(input: {
  ngay: string;
  shift: string;
  machine: string;
  productCode: string;
  productName: string;
  reports: AcceptanceReport[];
  normKgPerUnit?: number | null;
}): { quantity: number; weightKg: number } {
  const codeKey = normalizeProductCodeKey(input.productCode);
  const nameKey = normalizeProductCodeKey(input.productName);
  if (!codeKey && !nameKey) return { quantity: 0, weightKg: 0 };

  let quantity = 0;
  let weightKg = 0;

  for (const report of input.reports) {
    if (!isAcceptanceThanhPhamLoai(report.loai_vat_tu)) continue;
    if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
    const reportDate = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (reportDate !== input.ngay || !shiftNamesMatch(report.ca, input.shift)) continue;
    if (
      !machineValueMatchesFilter(input.machine, null, report.ma_may, report.ten_may) &&
      !(isBbMachineText(input.machine) && isBbMachineText(report.ma_may, report.ten_may))
    ) {
      continue;
    }

    const reportCode = normalizeProductCodeKey(resolveAcceptanceReportProductCode(report.mat_hang));
    const reportNameKey = normalizeProductCodeKey(String(report.ten_sp || report.mat_hang || '').trim());
    const matHangKey = normalizeProductCodeKey(report.mat_hang);
    const productMatched =
      (codeKey &&
        ((reportCode && (reportCode === codeKey || reportCode.includes(codeKey) || codeKey.includes(reportCode))) ||
          (matHangKey && (matHangKey === codeKey || matHangKey.includes(codeKey) || codeKey.includes(matHangKey))))) ||
      (nameKey &&
        reportNameKey &&
        (reportNameKey === nameKey || reportNameKey.includes(nameKey) || nameKey.includes(reportNameKey)));
    if (!productMatched) continue;

    const qty = Number(report.so_luong);
    const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
    if (inboundQty <= 0) continue;

    quantity += inboundQty;
    const reportKg = acceptanceReportWeightKg(report);
    if (reportKg > 0) {
      weightKg += reportKg;
    } else if (input.normKgPerUnit != null && input.normKgPerUnit > 0) {
      weightKg += roundQty(input.normKgPerUnit * inboundQty, 4);
    }
  }

  return {
    quantity,
    weightKg: roundQty(weightKg, 4)
  };
}

/**
 * Ô «Báo cáo lỗi hỏng» trên báo cáo máy BB:
 * lấy từ Báo cáo sản lượng — mục SP lỗi (hàng lỗi hỏng) + SP rác.
 * - Trọng lượng nhựa = Σ trọng lượng phiếu SP lỗi
 * - Vật tư khác = Σ trọng lượng phiếu SP rác
 */
export function sumBbSanLuongLoiHongVaRacWeightByKind(input: {
  acceptanceReports: AcceptanceReport[];
  materials?: MaterialRow[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): { plasticKg: number; otherKg: number } {
  let plasticKg = 0;
  let otherKg = 0;
  const materials = input.materials ?? [];
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

    const split =
      materials.length > 0
        ? splitAcceptanceLoiHongWeightKg(report, materials)
        : (() => {
            const kg = resolveAcceptanceReportWeightKg(report, materials);
            if (!(kg > 0)) return null;
            if (isAcceptanceSpLoiLoai(report.loai_vat_tu)) return { nhuaKg: kg, mangKg: 0, tongKg: kg };
            if (isAcceptanceSpRacLoai(report.loai_vat_tu)) return { nhuaKg: 0, mangKg: kg, tongKg: kg };
            return null;
          })();
    if (!split) continue;
    plasticKg += split.nhuaKg;
    otherKg += split.mangKg;
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
  /** Tỉ lệ trộn thực tế (%) = KL NVL ca đó ÷ tổng KL mọi NVL ca đó × 100. */
  tiLeTronPercent: number | null;
  /** TB `ti_le_phan_tram` trên danh sách trộn cùng ngày+ca+máy. */
  tiLeDinhMucPercent: number | null;
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
      tiLeDinhMucPercent:
        stat.tiLeDinhMucCount > 0
          ? roundQty(stat.tiLeDinhMucSum / stat.tiLeDinhMucCount, 4)
          : null,
      totalKlThucTe: roundQty(stat.klSum, 4),
      batchCount: stat.batchCount
    }))
    .sort((a, b) => a.materialName.localeCompare(b.materialName, 'vi'));
}

/**
 * Dòng NVL tab lỗi hỏng: chỉ từ BOM lệnh SX → thành phần NVL trên Kho sản phẩm (`san_pham.nplItems`).
 * Tỉ lệ trộn (%) lấy từ thành phần % trên BOM; NVL theo SL không có % phân bổ trọng lượng lỗi.
 */
export function buildBbLoiHongMaterialLinesForShift(input: {
  productionOrders?: ProductionOrderRow[];
  products?: ProductRow[];
  ngay: string;
  shift: string;
  orderCode?: string;
}): BbDamagedMixingChildRow[] {
  const byKey = new Map<string, BbDamagedMixingChildRow>();
  const upsert = (row: BbDamagedMixingChildRow) => {
    const key =
      materialIdentityKey(row.materialCode, row.materialName) ||
      String(row.materialName || row.materialCode || '')
        .trim()
        .toUpperCase();
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, key: `${input.ngay}|${input.shift}|${key}` });
      return;
    }
    if (!existing.materialCode && row.materialCode) existing.materialCode = row.materialCode;
    if (!existing.materialName && row.materialName) existing.materialName = row.materialName;
    if (!existing.unit && row.unit) existing.unit = row.unit;
    if (existing.tiLeTronPercent == null && row.tiLeTronPercent != null) {
      existing.tiLeTronPercent = row.tiLeTronPercent;
    }
    if (existing.tiLeDinhMucPercent == null && row.tiLeDinhMucPercent != null) {
      existing.tiLeDinhMucPercent = row.tiLeDinhMucPercent;
    }
  };

  const orderCodes = String(input.orderCode || '')
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const codeSet = new Set(orderCodes.map(code => code.toUpperCase()));
  for (const order of input.productionOrders || []) {
    if (codeSet.size > 0 && !codeSet.has(String(order.code || '').trim().toUpperCase())) continue;
    const ngay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (input.ngay && ngay && ngay !== input.ngay) continue;
    if (!shiftNamesMatch(order.shift, input.shift)) continue;
    for (const line of getProductionOrderProductLines(order)) {
      const catalog =
        findProductByCode(input.products || [], line.productCode) ||
        (input.products || []).find(
          product =>
            normalizeProductCodeKey(product.name) === normalizeProductCodeKey(line.productCode) ||
            normalizeProductCodeKey(product.name).includes(normalizeProductCodeKey(line.productCode || ''))
        );
      for (const item of catalog?.nplItems || []) {
        const code = String(item.code || '').trim();
        const name = String(item.name || item.code || '').trim();
        if (!code && !name) continue;
        if (isNnsTronMaterial(code, name)) continue;
        const rate =
          item.amountType === 'quantity'
            ? Math.max(0, item.quantity ?? 0)
            : Math.max(0, item.percent ?? 0);
        if (!(rate > 0)) continue;
        upsert({
          key: '',
          materialCode: code,
          materialName: name || code,
          unit:
            item.amountType === 'percent'
              ? 'kg'
              : String(item.unit || '').trim() || 'kg',
          tiLeTronPercent: null,
          tiLeDinhMucPercent:
            item.amountType === 'percent' && rate > 0 ? roundQty(rate, 4) : null,
          totalKlThucTe: 0,
          batchCount: 0
        });
      }
    }
  }

  // Phân bổ trọng lượng lỗi theo % trên BOM.
  for (const row of byKey.values()) {
    if (row.tiLeTronPercent == null && row.tiLeDinhMucPercent != null && row.tiLeDinhMucPercent > 0) {
      row.tiLeTronPercent = row.tiLeDinhMucPercent;
    }
  }

  return [...byKey.values()].sort((a, b) => a.materialName.localeCompare(b.materialName, 'vi'));
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
  header: { ngay: string; shift: string; orderCode: string },
  options?: { matchByDateOnly?: boolean }
) {
  const rowNgay = parseProductionOrderFilterDate(row.ngay) || row.ngay;
  if (rowNgay !== header.ngay) return false;
  if (!options?.matchByDateOnly && !shiftNamesMatch(row.shift, header.shift)) return false;
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
  header: { ngay: string; shift: string; orderCode: string },
  matchByDateOnly = false
) {
  const byCode = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const row of rows) {
    if (!bbTabRowMatchesOrderHeader(row, header, { matchByDateOnly })) continue;
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
 * Tỉ lệ ĐM (%) / Tỉ lệ TB thực tế (%) — chỉ từ danh sách trộn (`bao_cao_phoi_tron`), không lấy ty_le_tron máy.
 * Thực dùng (kg) = [Tồn đầu ca] + [Xuất thực tế] − [Tồn cuối ca]
 * Ba cột tồn/xuất lấy đúng số từ các tab đã có:
 * - Tồn đầu ca ← tab «Báo cáo dữ liệu tồn đầu ca»
 * - Xuất trong ngày ← tab «Phiếu xuất kho» (ca đang chọn trên bộ lọc)
 * - Tồn cuối ca ← tab «Dữ liệu trong báo cáo kiểm tồn cuối ca»
 */
export function buildBbTongHopVatTuThucXuatDungGroups(input: {
  productionOrders: ProductionOrderRow[];
  mixingReports: MixingReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  /** Phiếu xuất NVL cùng ngày lệnh (mọi ca). */
  warehouseMovementsByDate?: ShiftSummaryWarehouseMovement[];
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
    materials: input.materials,
    exportMatchScope: 'shift'
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
    const xuatThucTeMaps = buildKgMapsFromBbTabRowsForHeader(xuatKhoTabRows, header, false);

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
        /** Chỉ từ danh sách trộn (`ti_le_phan_tram`), không lấy ty_le_tron máy. */
        tiLeDinhMucPercent: mix.tiLeDinhMucPercent,
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
        /** Tỉ lệ TB thực tế = KL NVL ÷ tổng KL trộn ca × 100 (danh sách trộn). */
        tiLeThucTeTbPercent: mix.tiLeTronPercent
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

  const resolveTonWeightFromNnsAndDirect = (
    directTon: number,
    itemCode: string,
    itemName: string,
    unitIsKg: boolean,
    tiLeThucTeTbPercent: number | null
  ): { tonWeightKg: number; fromNnsTron: boolean } => {
    const useNns =
      unitIsKg &&
      nnsTronTonDauKg > 0 &&
      tiLeThucTeTbPercent !== null &&
      Number.isFinite(tiLeThucTeTbPercent) &&
      tiLeThucTeTbPercent > 0 &&
      !isNnsTronMaterial(itemCode, itemName);
    if (useNns) {
      return {
        tonWeightKg: roundQty(directTon + nnsTronTonDauKg * (tiLeThucTeTbPercent / 100), 4),
        fromNnsTron: true
      };
    }
    return { tonWeightKg: roundQty(directTon, 4), fromNnsTron: false };
  };

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
    // NNS-TRON × tỉ lệ ĐM + tồn trực tiếp theo mã (chưa trộn / tồn bồn…).
    const { tonWeightKg: tonDauWeightKg, fromNnsTron: useNns } = resolveTonWeightFromNnsAndDirect(
      directTon,
      meta.itemCode,
      meta.itemName,
      unitIsKg,
      tiLeThucTeTbPercent
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
    if (isNnsTronMaterial(row.itemCode, row.itemName) && materialLines.length > 0) {
      continue;
    }
    usedMaterialKeys.add(materialKey);
    const orphanUnit = row.unit || 'kg';
    const orphanUnitIsKg = isBbMixingRatioKgUnit(orphanUnit);
    const orphanTiLeDinhMuc = (() => {
      const fromMachine = resolveMachineDinhMuc(row.itemCode, row.itemName);
      return fromMachine === null ? null : roundQty(fromMachine, 4);
    })();
    const orphanTiLeThucTe = resolveTiLeThucTe(row.itemCode, row.itemName, orphanTiLeDinhMuc);
    const { tonWeightKg: orphanTonKg, fromNnsTron: orphanFromNns } = resolveTonWeightFromNnsAndDirect(
      row.weightKg,
      row.itemCode,
      row.itemName,
      orphanUnitIsKg,
      orphanTiLeThucTe
    );
    const orphanTonQty = roundQty(
      orphanUnitIsKg ? (orphanTonKg > 0 ? orphanTonKg : row.quantity) : row.quantity,
      4
    );
    materialLines.push({
      key: `${group.groupKey}|orphan|${materialKey}|${row.key}`,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: orphanUnit,
      dinhMucRate: null,
      dinhMucUnit: '',
      amountType: null,
      tiLeDinhMucPercent: orphanTiLeDinhMuc,
      tiLeThucTeTbPercent: orphanTiLeThucTe,
      tonDauQuantity: orphanTonQty,
      tonDauWeightKg: orphanTonKg,
      tonDauFormula: {
        itemCode: row.itemCode,
        itemName: row.itemName,
        productCode: '',
        productName: '',
        orderCode: group.orderCode,
        ngay: group.ngay,
        shiftLabel: group.shiftLabel || group.shift,
        machine: group.machine,
        fromNnsTron: orphanFromNns,
        nnsTronTonDauKg: roundQty(nnsTronTonDauKg, 4),
        directTonDauKg: roundQty(row.weightKg, 4),
        tiLeThucTeTbPercent: orphanTiLeThucTe,
        share: 1,
        productQuantity: 0,
        orderQuantityTotal: 0,
        tonDauWeightKg: orphanTonKg
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

/** Tách NVL tab tồn đầu/cuối: nhựa trộn (có tỉ lệ ĐM kg) vs vật tư còn lại. */
export function splitBbDauCaMaterialLinesByMixing(lines: BbDauCaProductLine[]): {
  mixingLines: BbDauCaProductLine[];
  otherLines: BbDauCaProductLine[];
} {
  const mixingLines: BbDauCaProductLine[] = [];
  const otherLines: BbDauCaProductLine[] = [];
  for (const row of lines) {
    if (isNnsTronMaterial(row.itemCode, row.itemName)) continue;
    const isMixing =
      row.tiLeDinhMucPercent != null &&
      Number.isFinite(row.tiLeDinhMucPercent) &&
      row.tiLeDinhMucPercent > 0 &&
      isBbMixingRatioKgUnit(row.unit, row.amountType);
    if (isMixing) mixingLines.push(row);
    else otherLines.push(row);
  }
  return { mixingLines, otherLines };
}

/** Tách NVL tab lỗi hỏng: nhựa trộn (ĐVT kg, có tỉ lệ %) vs vật tư còn lại. */
export function splitBbLoiHongMaterialLinesByMixing(lines: BbDamagedMixingChildRow[]): {
  mixingKgLines: BbDamagedMixingChildRow[];
  otherMaterialLines: BbDamagedMixingChildRow[];
} {
  const mixingKgLines: BbDamagedMixingChildRow[] = [];
  const otherMaterialLines: BbDamagedMixingChildRow[] = [];
  for (const row of lines) {
    if (isNnsTronMaterial(row.materialCode, row.materialName)) continue;
    const tiLe =
      row.tiLeTronPercent != null && row.tiLeTronPercent > 0
        ? row.tiLeTronPercent
        : row.tiLeDinhMucPercent;
    const isMixingKg =
      tiLe != null && Number.isFinite(tiLe) && tiLe > 0 && isBbMixingRatioKgUnit(row.unit);
    if (isMixingKg) mixingKgLines.push(row);
    else otherMaterialLines.push(row);
  }
  return { mixingKgLines, otherMaterialLines };
}

export function sumBbDauCaMaterialLinesTonKg(lines: BbDauCaProductLine[]): number {
  return lines.reduce((sum, row) => sum + (row.tonDauWeightKg > 0 ? row.tonDauWeightKg : 0), 0);
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
  /** SL NVL: % = tỉ lệ; NVL phụ (Cái/m²/…) = SL SP. */
  quantity: number | null;
  normWeightKg: number;
  materialNorm: BbMaterialNormFormula | null;
  /** KL NVL cả ca (trước khi × % mặt hàng) theo công thức SL sản lượng. */
  baseActualWeightKg: number;
  /** % mặt hàng = SL SP ÷ tổng SL mọi SP trên phiếu báo cáo sản lượng (0–100). */
  productSharePercent: number;
  /**
   * Trọng lượng (kg) phân bổ theo SP = định mức kg/SP (Thành phần) × SL sản lượng SP.
   */
  actualWeightKg: number;
  balanceDetail: BbInboundMaterialBalanceDetail | null;
};

/** ĐVT hiển thị dòng NVL tab báo cáo sản lượng (% → kg). */
export function resolveBbSanLuongNvlDisplayUnit(
  line: Pick<BbSanLuongNvlLine, 'unit' | 'amountType'>
): string {
  if (line.amountType === 'percent') return 'kg';
  const trimmed = String(line.unit || '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '%') return 'kg';
  return trimmed;
}

/** NVL trộn / ĐVT kg trên tab báo cáo sản lượng. */
export function isBbSanLuongNvlKgLine(
  line: Pick<BbSanLuongNvlLine, 'unit' | 'amountType'>
): boolean {
  return isBbMixingRatioKgUnit(line.unit, line.amountType);
}

/** NVL phụ: Thành phần kiểu số lượng (Cái/m²/… / dòng chỉ có khoi_luong_kg). */
function isBbSanLuongNvlPhu(amountType: 'percent' | 'quantity' | null | undefined): boolean {
  return amountType === 'quantity';
}

/** ĐVT NVL phụ: không hiện kg — SL là số lượng SP, TL mới là kg. */
function resolveBbSanLuongNvlPhuUnit(unit: string | null | undefined): string {
  const trimmed = String(unit || '').trim();
  if (!trimmed || trimmed === '-' || trimmed === '%' || isWarehouseKgUnit(trimmed)) return 'Cái';
  return trimmed;
}

/** SL NVL phụ = SL SP. */
function resolveBbSanLuongNvlPhuQuantity(slSp: number): number {
  return slSp > 0 ? slSp : 0;
}

/**
 * kg/1 NVL phụ: khoi_luong_kg trên Thành phần;
 * không có (không trong BOM) → tong_trong_luong kho NVL.
 */
function resolveBbSanLuongNvlPhuKgPerUnit(
  khoiLuongKg: number | null | undefined,
  itemCode: string,
  materialsCatalog: WarehouseWeightCatalogItem[]
): number | null {
  if (khoiLuongKg != null && Number.isFinite(khoiLuongKg) && khoiLuongKg > 0) {
    return khoiLuongKg;
  }
  const trongLuongKg = findMaterialTongKgPerUnit(itemCode, materialsCatalog);
  return trongLuongKg != null && trongLuongKg > 0 ? trongLuongKg : null;
}

/** TL NVL phụ = SL NVL phụ × (khoi_luong_kg hoặc tong_trong_luong). */
function resolveBbSanLuongNvlPhuWeightKg(
  slNvlPhu: number,
  kgPerUnit: number | null | undefined
): number {
  if (!(slNvlPhu > 0)) return 0;
  const kg = Number(kgPerUnit);
  if (!Number.isFinite(kg) || kg < 0) return 0;
  return roundQty(slNvlPhu * kg, 4);
}

function applyBbSanLuongNvlPhuToLine(
  line: BbSanLuongNvlLine,
  slSp: number,
  bomItem: ProductNplItem | undefined,
  materialsCatalog: WarehouseWeightCatalogItem[]
): BbSanLuongNvlLine {
  const isPhu = bomItem
    ? isBbSanLuongNvlPhu(bomItem.amountType)
    : isBbSanLuongNvlPhu(line.amountType);
  if (!isPhu) return line;
  const quantity = resolveBbSanLuongNvlPhuQuantity(slSp);
  const kgPerUnit = resolveBbSanLuongNvlPhuKgPerUnit(
    bomItem?.weightKg,
    bomItem?.code || line.itemCode,
    materialsCatalog
  );
  const weightKg = resolveBbSanLuongNvlPhuWeightKg(quantity, kgPerUnit);
  const unit = resolveBbSanLuongNvlPhuUnit(bomItem?.unit || line.unit);
  return {
    ...line,
    unit,
    dinhMucUnit: unit,
    amountType: 'quantity',
    quantity,
    normWeightKg: weightKg,
    actualWeightKg: weightKg,
    baseActualWeightKg: weightKg
  };
}

function rebuildBbSanLuongNvlTotals(
  groupKey: string,
  productGroups: BbSanLuongProductGroup[]
): BbSanLuongNvlTotal[] {
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
          amountType: line.amountType,
          rate: line.dinhMucRate,
          quantity: line.quantity,
          normWeightKg: line.normWeightKg,
          actualWeightKg: line.actualWeightKg,
          baseActualWeightKg: line.baseActualWeightKg,
          balanceDetail: null
        });
        continue;
      }
      existing.normWeightKg = roundQty(existing.normWeightKg + line.normWeightKg, 4);
      existing.actualWeightKg = roundQty(existing.actualWeightKg + line.actualWeightKg, 4);
      existing.baseActualWeightKg = existing.actualWeightKg;
      if (line.amountType === 'percent' && line.dinhMucRate != null) {
        existing.quantity = line.dinhMucRate;
        existing.rate = line.dinhMucRate;
      } else if (line.quantity != null && line.quantity > 0) {
        existing.quantity = roundQty((existing.quantity || 0) + line.quantity, 4);
      }
    }
  }
  return [...nvlAggMap.values()].sort(compareBbSanLuongNvlLines);
}

/** Sắp xếp NVL: khối ĐVT kg lên đầu (cạnh nhau), rồi NVL khác theo ĐVT + tên. */
export function orderBbSanLuongNvlLinesByKg(lines: BbSanLuongNvlLine[]): BbSanLuongNvlLine[] {
  const kgLines: BbSanLuongNvlLine[] = [];
  const otherLines: BbSanLuongNvlLine[] = [];
  for (const line of lines) {
    if (isBbSanLuongNvlKgLine(line)) kgLines.push(line);
    else otherLines.push(line);
  }
  kgLines.sort((a, b) => a.itemName.localeCompare(b.itemName, 'vi'));
  otherLines.sort((a, b) => {
    const unitCmp = resolveBbSanLuongNvlDisplayUnit(a).localeCompare(
      resolveBbSanLuongNvlDisplayUnit(b),
      'vi',
      { sensitivity: 'base' }
    );
    if (unitCmp !== 0) return unitCmp;
    return a.itemName.localeCompare(b.itemName, 'vi');
  });
  return [...kgLines, ...otherLines];
}

/** Sắp xếp NVL: ĐVT kg trước, rồi theo tên. */
export function compareBbSanLuongNvlLines(
  a: Pick<BbSanLuongNvlLine, 'itemName' | 'unit' | 'amountType'>,
  b: Pick<BbSanLuongNvlLine, 'itemName' | 'unit' | 'amountType'>
): number {
  const aIsKg = isBbSanLuongNvlKgLine(a);
  const bIsKg = isBbSanLuongNvlKgLine(b);
  if (aIsKg !== bIsKg) return aIsKg ? -1 : 1;
  if (!aIsKg) {
    const unitCmp = resolveBbSanLuongNvlDisplayUnit(a).localeCompare(
      resolveBbSanLuongNvlDisplayUnit(b),
      'vi',
      { sensitivity: 'base' }
    );
    if (unitCmp !== 0) return unitCmp;
  }
  return a.itemName.localeCompare(b.itemName, 'vi');
}

export type BbSanLuongProductGroup = {
  key: string;
  productCode: string;
  productName: string;
  unit: string;
  /** SL mặt hàng từ báo cáo sản lượng. */
  quantity: number;
  /** Khối lượng SP (kg) từ phiếu báo cáo sản lượng. */
  weightKg: number;
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
  amountType: 'percent' | 'quantity' | null;
  /** Định mức / 1 SP (SL hoặc %). */
  rate: number | null;
  /**
   * Cột SL:
   * - NVL phụ: SL SP
   * - percent: tỉ lệ trộn thực tế (%) — fallback định mức %
   */
  quantity: number | null;
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
   * Khối lượng theo SL sản lượng:
   * ĐVT kg = tổng nhựa định mức × tỉ lệ trộn thực tế;
   * ĐVT khác = định mức × SL.
   */
  totalActualWeightKg: number;
  /** Tổng 4 thành phần cân bằng của các NVL trên lệnh. */
  balanceSummary: BbInboundMaterialBalanceDetail;
  productGroups: BbSanLuongProductGroup[];
  /** Dòng con: tổng theo từng NVL. */
  nvlTotals: BbSanLuongNvlTotal[];
};

function bbSanLuongProductMatchesOrderLine(
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

function bbOrderCodesMatch(left: string, right: string) {
  const a = String(left || '')
    .trim()
    .toUpperCase()
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  const b = String(right || '')
    .trim()
    .toUpperCase()
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  if (a.length === 0 || b.length === 0) return false;
  return a.some(x => b.includes(x));
}

function findBbGroupForOrderHeader<T extends { orderCode: string; ngay: string; shift: string; machine: string }>(
  groups: T[],
  header: Pick<BbProductionOrderLineRow, 'orderCode' | 'ngay' | 'shift' | 'machine'>
): T | undefined {
  return groups.find(group => {
    if (group.ngay !== header.ngay) return false;
    if (!shiftNamesMatch(group.shift, header.shift)) return false;
    if (header.orderCode && group.orderCode && bbOrderCodesMatch(group.orderCode, header.orderCode)) return true;
    return (
      Boolean(header.machine) &&
      Boolean(group.machine) &&
      machineValueMatchesFilter(header.machine, null, group.machine)
    );
  });
}

function findBbSanLuongGroupForOrderRow(
  row: Pick<BbProductionOrderLineRow, 'orderCode' | 'ngay' | 'shift' | 'machine'>,
  sanLuongGroups: BbSanLuongGroup[]
): BbSanLuongGroup | undefined {
  return findBbGroupForOrderHeader(sanLuongGroups, row);
}

function findBbSanLuongProductForOrderLine(
  row: Pick<BbProductionOrderLineRow, 'orderCode' | 'ngay' | 'shift' | 'machine' | 'productCode' | 'productName'>,
  sanLuongGroups: BbSanLuongGroup[]
): BbSanLuongProductGroup | undefined {
  const group = findBbSanLuongGroupForOrderRow(row, sanLuongGroups);
  if (!group) return undefined;
  return group.productGroups.find(productGroup =>
    bbSanLuongProductMatchesOrderLine(productGroup, row.productCode, row.productName)
  );
}

/** Gắn «Trọng lượng nhựa + phụ gia (kg)» từ /kho-hang (áp dụng cả snapshot cũ thiếu field). */
export function enrichBbProductionOrderRowsPlasticNormFromProducts(
  rows: BbProductionOrderLineRow[],
  products: ProductRow[]
): BbProductionOrderLineRow[] {
  if (products.length === 0) return rows;
  return rows.map(row => {
    const product = findProductByCode(products, row.productCode);
    const plasticNormKgPerUnit = resolveBbProductionOrderPlasticNormKgPerUnit(product);
    const quantity = row.quantity > 0 ? row.quantity : 0;
    const totalPlasticNormKg =
      plasticNormKgPerUnit !== null && quantity > 0 ? plasticNormKgPerUnit * quantity : null;
    return {
      ...row,
      plasticNormKgPerUnit,
      totalPlasticNormKg
    };
  });
}

/** Gắn SL + TL thực tế từ snapshot tab Báo cáo sản lượng lên dòng lệnh SX. */
export function enrichBbProductionOrderRowsFromSanLuong(
  rows: BbProductionOrderLineRow[],
  sanLuongGroups: BbSanLuongGroup[]
): BbProductionOrderLineRow[] {
  // Gộp mã SP trùng trước khi gắn sản lượng — tránh gán cùng SL thực tế lên nhiều dòng rồi cộng dồn.
  const merged = mergeBbProductionOrderLineRowsByProduct(rows);
  if (sanLuongGroups.length === 0) return merged;
  return merged.map(row => {
    const productGroup = findBbSanLuongProductForOrderLine(row, sanLuongGroups);
    if (!productGroup) {
      return { ...row, actualQuantity: 0, actualWeightKg: null };
    }
    const actualQuantity = productGroup.quantity > 0 ? productGroup.quantity : 0;
    const actualWeightKg = productGroup.weightKg > 0 ? roundQty(productGroup.weightKg, 4) : null;
    return {
      ...row,
      actualQuantity,
      actualWeightKg
    };
  });
}

/**
 * Tab Báo cáo sản lượng (sau Tính toán):
 * - Header / SL / trọng lượng SP: `bao_cao_nghiem_thu` — Thành phẩm thuộc **Kho thành phẩm**
 * - Dòng NVL: hiện đủ `san_pham.npl_phan_tram`; SL/TL lấy từ snapshot
 *   `bao_cao_san_luong_nvl_dinh_muc`, dòng không có trong snapshot hiện 0
 * - NVL phụ (Cái/m²/…): SL NVL = SL SP; TL NVL = SL NVL × khoi_luong_kg
 */
export type BbAcceptanceNvlDinhMucItem = {
  code: string;
  name: string;
  unit: string;
  amountType: 'percent' | 'quantity';
  /** ĐM / 1 SP (% hoặc số lượng). */
  rate: number;
  /** Theo SL: % = định mức %; NVL phụ = SL SP. */
  quantityBySl: number | null;
  /** `false` = chỉ bổ sung từ `san_pham.npl_phan_tram`, không có dòng trong snapshot/BOM phiếu. */
  hasSnapshot?: boolean;
};

/** Map dòng snapshot `bao_cao_san_luong_nvl_dinh_muc`. */
export function mapAcceptanceNvlDinhMucRowsToNplItems(rows: unknown[]): BbAcceptanceNvlDinhMucItem[] {
  return rows
    .map((raw): BbAcceptanceNvlDinhMucItem | null => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      const loai = String(row.loai_dinh_muc ?? row.amountType ?? '')
        .trim()
        .toLowerCase();
      const amountType: BbAcceptanceNvlDinhMucItem['amountType'] =
        loai === 'percent' || loai === 'phan_tram' || loai === '%' ? 'percent' : 'quantity';
      const dinhMuc = Number(row.dinh_muc ?? row.rate ?? row.percent ?? row.quantity);
      const rate = Number.isFinite(dinhMuc) && dinhMuc > 0 ? dinhMuc : null;
      if (rate == null) return null;
      const theoSl = Number(row.so_luong_theo_sl ?? row.quantityBySl ?? row.theo_sl);
      return {
        code: String(row.ma_nvl ?? row.materialCode ?? row.code ?? '').trim(),
        name: String(row.ten_nvl ?? row.materialName ?? row.name ?? '').trim(),
        amountType,
        rate,
        quantityBySl: Number.isFinite(theoSl) && theoSl > 0 ? theoSl : null,
        unit: String(row.don_vi ?? row.unit ?? (amountType === 'percent' ? '%' : '')).trim(),
        hasSnapshot: true
      };
    })
    .filter((item): item is BbAcceptanceNvlDinhMucItem => Boolean(item && (item.code || item.name)));
}

/** Khóa mã NVL trên BOM SP (chuẩn hóa T1,08x2,2m ↔ T1.08*2.2m). */
export function buildProductBomMaterialMatchKeys(nplItems: ProductNplItem[] = []): Set<string> {
  const keys = new Set<string>();
  for (const item of nplItems) {
    const codeKey = normalizeNvlMatchKey(item.code || '');
    const nameKey = normalizeNvlMatchKey(item.name || '');
    if (codeKey) keys.add(codeKey);
    if (nameKey) keys.add(nameKey);
  }
  return keys;
}

export function buildOrderBomMaterialMatchKeys(
  order: { lines: Array<{ productCode?: string }> },
  products: ProductRow[]
): Set<string> {
  const keys = new Set<string>();
  for (const line of order.lines) {
    const product = findProductByCode(products, String(line.productCode || '').trim());
    for (const key of buildProductBomMaterialMatchKeys(product?.nplItems || [])) {
      keys.add(key);
    }
  }
  return keys;
}

export function isMaterialInProductBom(code: string, name: string, bomKeys: Set<string>): boolean {
  if (bomKeys.size === 0) return false;
  const codeKey = normalizeNvlMatchKey(code || '');
  const nameKey = normalizeNvlMatchKey(name || '');
  return Boolean((codeKey && bomKeys.has(codeKey)) || (nameKey && bomKeys.has(nameKey)));
}

/** Snapshot NVL định mức: chỉ giữ dòng còn trên BOM SP hiện tại. */
export function filterAcceptanceNvlItemsToProductBom(
  snapItems: BbAcceptanceNvlDinhMucItem[],
  catalogNplItems: ProductNplItem[]
): BbAcceptanceNvlDinhMucItem[] {
  const bomKeys = buildProductBomMaterialMatchKeys(catalogNplItems);
  if (bomKeys.size === 0) return [];
  return snapItems.filter(item => isMaterialInProductBom(item.code, item.name, bomKeys));
}

function findProductNplItemInBom(
  catalog: ProductRow,
  item: Pick<BbAcceptanceNvlDinhMucItem, 'code' | 'name'>
): ProductNplItem | undefined {
  const codeKey = normalizeNvlMatchKey(item.code || '');
  const nameKey = normalizeNvlMatchKey(item.name || '');
  const nplItems = dedupeProductNplItemsForSanLuong(catalog.nplItems || []);
  return nplItems.find(npl => {
    const nplCode = normalizeNvlMatchKey(npl.code || '');
    const nplName = normalizeNvlMatchKey(npl.name || '');
    return (
      (codeKey && (nplCode === codeKey || nplName === codeKey)) ||
      (nameKey && (nplCode === nameKey || nplName === nameKey))
    );
  });
}

/** Định mức/SP: % hoặc SL Cái. Dòng chỉ có khoi_luong_kg (vd BDT) → 1 NVL phụ / 1 SP. */
function resolveProductNplSanLuongRate(item: ProductNplItem): number | null {
  if (item.amountType === 'percent') {
    return item.percent != null && Number.isFinite(item.percent) && item.percent > 0
      ? item.percent
      : null;
  }
  if (item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0) {
    return item.quantity;
  }
  if (item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg >= 0) {
    return 1;
  }
  return null;
}

function nvlDinhMucItemMatchKey(item: Pick<BbAcceptanceNvlDinhMucItem, 'code' | 'name'>): string {
  return (
    normalizeNvlMatchKey(item.code) ||
    normalizeNvlMatchKey(item.name) ||
    String(item.name || '').trim().toUpperCase()
  );
}

/** Gộp dòng cùng mã NVL (Cái + kg, …) trước khi map báo cáo sản lượng. */
function dedupeProductNplItemsForSanLuong(items: ProductNplItem[]): ProductNplItem[] {
  const byKey = new Map<string, ProductNplItem>();
  for (const item of items) {
    const key =
      normalizeNvlMatchKey(item.code) ||
      normalizeNvlMatchKey(item.name) ||
      String(item.name || item.code || '').trim().toUpperCase();
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeProductNplItemsByUnitKinds(existing, item) : item);
  }
  return [...byKey.values()];
}

function mapOneProductNplItemToAcceptanceNvlDinhMuc(
  item: ProductNplItem,
  productQty: number
): BbAcceptanceNvlDinhMucItem | null {
  const isPercent = item.amountType === 'percent';
  const rate = resolveProductNplSanLuongRate(item);
  if (rate == null || !(rate > 0)) return null;
  const unit = isPercent ? '%' : resolveBbSanLuongNvlPhuUnit(item.unit);
  const quantityBySl = isPercent
    ? rate
    : resolveBbSanLuongNvlPhuQuantity(productQty) || null;
  return {
    code: item.code || '',
    name: item.name || item.code || '',
    amountType: isPercent ? 'percent' : 'quantity',
    rate,
    quantityBySl: quantityBySl != null && quantityBySl > 0 ? quantityBySl : null,
    unit
  };
}

/**
 * `san_pham.npl_phan_tram` quyết định danh sách NVL hiển thị.
 * NVL phụ: SL luôn = SL SP (kể cả không có snapshot).
 * NVL % không có snapshot → 0.
 */
function mergeSanLuongNvlFromBomAndSnapshot(
  bomNplItems: ProductNplItem[],
  productQty: number,
  snapItemsRaw: BbAcceptanceNvlDinhMucItem[]
): BbAcceptanceNvlDinhMucItem[] {
  const dedupedBom = dedupeProductNplItemsForSanLuong(bomNplItems);
  const snapItems = filterAcceptanceNvlItemsToProductBom(snapItemsRaw, dedupedBom);
  const snapByKey = new Map<string, BbAcceptanceNvlDinhMucItem>();
  for (const snap of snapItems) {
    const key = nvlDinhMucItemMatchKey(snap);
    if (key) snapByKey.set(key, snap);
  }

  const result: BbAcceptanceNvlDinhMucItem[] = [];
  for (const bomItem of dedupedBom) {
    const mapped = mapOneProductNplItemToAcceptanceNvlDinhMuc(bomItem, productQty);
    if (!mapped) continue;
    const snap = snapByKey.get(nvlDinhMucItemMatchKey(mapped));
    const isNvlPhu = isBbSanLuongNvlPhu(mapped.amountType);
    if (!snap || snap.hasSnapshot === false) {
      result.push({
        ...mapped,
        rate: isNvlPhu ? mapped.rate : 0,
        quantityBySl: isNvlPhu ? resolveBbSanLuongNvlPhuQuantity(productQty) : 0,
        hasSnapshot: false
      });
      continue;
    }
    result.push({
      ...mapped,
      rate: snap.rate > 0 ? snap.rate : mapped.rate,
      quantityBySl: isNvlPhu
        ? resolveBbSanLuongNvlPhuQuantity(productQty)
        : snap.quantityBySl != null && snap.quantityBySl > 0
          ? snap.quantityBySl
          : mapped.quantityBySl,
      unit: mapped.unit || snap.unit,
      amountType: mapped.amountType,
      hasSnapshot: true
    });
  }
  return result;
}

/**
 * Luôn lấy đủ NVL từ `san_pham.npl_phan_tram`.
 * NVL phụ: SL = SL SP; không snapshot vẫn tính TL từ khoi_luong_kg / tong_trong_luong.
 */
export function refreshAcceptanceNvlDinhMucFromProductBom(input: {
  reports: AcceptanceReport[];
  products: ProductRow[];
  existingByReportId?: Map<string, BbAcceptanceNvlDinhMucItem[]>;
}): Map<string, BbAcceptanceNvlDinhMucItem[]> {
  const result = new Map(input.existingByReportId || []);
  for (const report of input.reports) {
    const id = String(report.id || '').trim();
    if (!id) continue;
    const productCodeRaw = resolveAcceptanceReportProductCode(report.mat_hang);
    if (!productCodeRaw) continue;
    const catalog = findProductByCode(input.products, productCodeRaw);
    if (!catalog?.nplItems?.length) continue;
    const qtyRaw = Number(report.so_luong);
    const productQty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
    if (productQty <= 0) continue;
    const snapRaw = result.get(id) || [];
    const merged = mergeSanLuongNvlFromBomAndSnapshot(
      catalog.nplItems,
      productQty,
      snapRaw
    );
    if (merged.length > 0) result.set(id, merged);
  }
  return result;
}

/**
 * Phủ `san_pham.npl_phan_tram` lên snapshot đã lưu khi bấm «Áp dụng».
 * NVL phụ: SL = SL SP; TL = SL × khoi_luong_kg, không có thì × tong_trong_luong.
 */
export function overlayProductNplOnBbSanLuongGroups(
  groups: BbSanLuongGroup[],
  products: ProductRow[],
  materials: MaterialRow[] = []
): BbSanLuongGroup[] {
  if (!Array.isArray(groups) || groups.length === 0 || products.length === 0) return groups || [];
  const materialsCatalog = materials.map(mapMaterialToWeightCatalogItem);

  return groups.map(group => {
    const sourceProductGroups = Array.isArray(group.productGroups) ? group.productGroups : [];
    const productGroups = sourceProductGroups.map(productGroup => {
      const catalog = findProductByCode(products, productGroup.productCode);
      const sourceLines = Array.isArray(productGroup.lines) ? productGroup.lines : [];
      if (!catalog?.nplItems?.length && sourceLines.length === 0) return productGroup;

      const existingKeys = new Set<string>();
      const recalculatedLines = sourceLines.map(line => {
        const codeKey = normalizeNvlMatchKey(line.itemCode || '');
        const nameKey = normalizeNvlMatchKey(line.itemName || '');
        if (codeKey) existingKeys.add(codeKey);
        if (nameKey) existingKeys.add(nameKey);
        const bomItem = catalog
          ? findProductNplItemInBom(catalog, { code: line.itemCode, name: line.itemName })
          : undefined;
        return applyBbSanLuongNvlPhuToLine(
          line,
          productGroup.quantity,
          bomItem,
          materialsCatalog
        );
      });

      const missingLines: BbSanLuongNvlLine[] = [];
      if (catalog?.nplItems?.length) {
        for (const item of dedupeProductNplItemsForSanLuong(catalog.nplItems)) {
          const codeKey = normalizeNvlMatchKey(item.code || '');
          const nameKey = normalizeNvlMatchKey(item.name || '');
          if ((codeKey && existingKeys.has(codeKey)) || (nameKey && existingKeys.has(nameKey))) {
            continue;
          }

          const amountType: BbSanLuongNvlLine['amountType'] =
            item.amountType === 'percent' ? 'percent' : 'quantity';
          const unit =
            amountType === 'percent' ? '%' : resolveBbSanLuongNvlPhuUnit(item.unit);
          const materialKey = codeKey || nameKey;
          if (!materialKey) continue;

          const isNvlPhu = isBbSanLuongNvlPhu(amountType);
          const quantity = isNvlPhu ? resolveBbSanLuongNvlPhuQuantity(productGroup.quantity) : 0;
          const weightKg = isNvlPhu
            ? resolveBbSanLuongNvlPhuWeightKg(
                quantity,
                resolveBbSanLuongNvlPhuKgPerUnit(item.weightKg, item.code, materialsCatalog)
              )
            : 0;

          missingLines.push({
            key: `${productGroup.key}|catalog-nvl|${materialKey}`,
            itemCode: item.code || '',
            itemName: item.name || item.code || '',
            unit,
            tiLeDinhMucPercent: amountType === 'percent' ? 0 : null,
            dinhMucRate: isNvlPhu ? resolveProductNplSanLuongRate(item) ?? 0 : 0,
            dinhMucUnit: amountType === 'percent' ? '%' : unit,
            amountType,
            quantity,
            normWeightKg: weightKg,
            materialNorm: null,
            baseActualWeightKg: weightKg,
            productSharePercent: productGroup.productSharePercent,
            actualWeightKg: weightKg,
            balanceDetail: null
          });
          if (codeKey) existingKeys.add(codeKey);
          if (nameKey) existingKeys.add(nameKey);
        }
      }

      const lines = orderBbSanLuongNvlLinesByKg([...recalculatedLines, ...missingLines]);
      return {
        ...productGroup,
        lines,
        lineCount: lines.length,
        totalNormWeightKg: roundQty(
          lines.reduce((sum, line) => sum + line.normWeightKg, 0),
          3
        ),
        totalActualWeightKg: roundQty(
          lines.reduce((sum, line) => sum + (line.actualWeightKg || 0), 0),
          2
        )
      };
    });

    const nvlTotals = rebuildBbSanLuongNvlTotals(group.groupKey, productGroups);
    return {
      ...group,
      productGroups,
      lineCount: productGroups.reduce((sum, productGroup) => sum + productGroup.lineCount, 0),
      totalNormWeightKg: roundQty(
        productGroups.reduce((sum, pg) => sum + pg.totalNormWeightKg, 0),
        3
      ),
      totalActualWeightKg: roundQty(
        productGroups.reduce((sum, pg) => sum + (pg.totalActualWeightKg || 0), 0),
        2
      ),
      nvlTotals
    };
  });
}

/** Map toàn bộ Thành phần SP → NVL báo cáo sản lượng (kể cả BDT chỉ có kg/SP). */
export function mapProductNplItemsToAcceptanceNvlDinhMuc(
  items: ProductNplItem[],
  productQty: number
): BbAcceptanceNvlDinhMucItem[] {
  return dedupeProductNplItemsForSanLuong(items)
    .map(item => mapOneProductNplItemToAcceptanceNvlDinhMuc(item, productQty))
    .filter((item): item is BbAcceptanceNvlDinhMucItem => Boolean(item));
}

/** Payload PUT `/api/bao-cao-san-luong-nvl-dinh-muc` từ Thành phần SP × SL phiếu. */
export function buildAcceptanceNvlDinhMucPutItems(
  items: ProductNplItem[],
  productQty: number
): Array<{
  stt: number;
  ma_nvl: string;
  ten_nvl: string;
  don_vi: string;
  loai_dinh_muc: 'percent' | 'quantity';
  dinh_muc: number | null;
  so_luong_theo_sl: number | null;
}> {
  return mapProductNplItemsToAcceptanceNvlDinhMuc(items, productQty).map((item, index) => ({
    stt: index,
    ma_nvl: item.code,
    ten_nvl: item.name,
    don_vi: item.unit || (item.amountType === 'percent' ? '%' : ''),
    loai_dinh_muc: item.amountType,
    dinh_muc: item.rate,
    so_luong_theo_sl: item.quantityBySl
  }));
}

/**
 * TL NVL (kg) trên tab Báo cáo sản lượng.
 * - % / kg: định mức kg/SP (Thành phần) × SL SP
 * - NVL phụ: SL NVL phụ × khoi_luong_kg
 */
function resolveBbSanLuongNvlLineWeightKg(input: {
  item: BbAcceptanceNvlDinhMucItem;
  bomItem: ProductNplItem | undefined;
  catalog: ProductRow;
  inboundQty: number;
  reportWeightKg: number;
  lineQty: number;
  rate: number;
  materialsCatalog: WarehouseWeightCatalogItem[];
  materials: MaterialRow[];
}): number {
  const {
    item,
    bomItem,
    catalog,
    inboundQty,
    reportWeightKg,
    lineQty,
    rate,
    materialsCatalog,
    materials
  } = input;
  const isPercent = item.amountType === 'percent';
  const unit = String(item.unit || '').trim();

  if (isPercent) {
    const perUnitKgFromBom =
      bomItem != null ? resolveProductNplItemWeightKg(catalog, bomItem, materials) : null;
    if (
      perUnitKgFromBom != null &&
      Number.isFinite(perUnitKgFromBom) &&
      perUnitKgFromBom >= 0 &&
      inboundQty > 0
    ) {
      return roundQty(perUnitKgFromBom * inboundQty, 4);
    }
    return reportWeightKg > 0 ? roundQty(reportWeightKg * (rate / 100), 4) : 0;
  }

  if (isBbSanLuongNvlPhu(item.amountType)) {
    return resolveBbSanLuongNvlPhuWeightKg(
      lineQty,
      resolveBbSanLuongNvlPhuKgPerUnit(bomItem?.weightKg, item.code, materialsCatalog)
    );
  }

  if (isWarehouseKgUnit(unit)) {
    return lineQty > 0 ? roundQty(lineQty, 4) : 0;
  }

  if (lineQty > 0) {
    const catalogKgPerUnit = findMaterialTongKgPerUnit(item.code, materialsCatalog);
    if (catalogKgPerUnit !== null && catalogKgPerUnit > 0) {
      return roundQty(lineQty * catalogKgPerUnit, 4);
    }
    const converted = convertWarehouseQuantityToKg({
      quantity: lineQty,
      unit,
      itemCode: item.code,
      warehouseKind: 'nvl',
      materials: materialsCatalog,
      preferTongKgOnly: false
    });
    if (converted != null && Number.isFinite(converted) && converted > 0) {
      return roundQty(converted, 4);
    }
  }

  const perUnitKgFromBom =
    bomItem != null ? resolveProductNplItemWeightKg(catalog, bomItem, materials) : null;
  if (
    perUnitKgFromBom != null &&
    Number.isFinite(perUnitKgFromBom) &&
    perUnitKgFromBom >= 0 &&
    inboundQty > 0
  ) {
    return roundQty(perUnitKgFromBom * inboundQty, 4);
  }

  return 0;
}

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
  /**
   * Snapshot NVL định mức theo id phiếu `bao_cao_nghiem_thu`.
   * NVL phụ luôn SL = SL SP; không snapshot thì TL = SL × tong_trong_luong.
   */
  acceptanceNvlDinhMucByReportId?: Map<string, BbAcceptanceNvlDinhMucItem[]>;
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
  selectedMachine?: { code?: string; name?: string } | null;
  includeAllMachines?: boolean;
}): BbSanLuongGroup[] {
  const lookupSettings = (input.shiftSettings || []) as ProductionOrderLookupSetting[];

  const acceptanceReports = input.acceptanceReports.filter(report => {
    if (!isAcceptanceThanhPhamKhoReport(report, input.products)) return false;
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

  type ReportBucket = {
    ngay: string;
    shift: string;
    machine: string;
    reports: AcceptanceReport[];
  };

  const buckets = new Map<string, ReportBucket>();
  for (const report of acceptanceReports) {
    const ngay = parseProductionOrderFilterDate(report.ngay) || String(report.ngay || '').trim();
    const shift = String(report.ca || '').trim();
    const machine =
      String(report.ten_may || '').trim() || String(report.ma_may || '').trim() || '—';
    if (!ngay || !shift) continue;
    const key = `${ngay}|${shift}|${machine}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { ngay, shift, machine, reports: [] };
      buckets.set(key, bucket);
    }
    bucket.reports.push(report);
  }

  const findOrderCodeForBucket = (bucket: ReportBucket) => {
    for (const order of input.productionOrders) {
      const orderNgay = parseProductionOrderFilterDate(order.startDate);
      if (orderNgay !== bucket.ngay) continue;
      if (!shiftNamesMatch(order.shift, bucket.shift)) continue;
      const machineLabel = resolveProductionOrderMachine(order, input.machines);
      if (
        machineValueMatchesFilter(bucket.machine, null, order.machine, order.position, machineLabel) ||
        machineValueMatchesFilter(bucket.machine, null, order.machine, machineLabel)
      ) {
        return String(order.code || '').trim();
      }
    }
    return '';
  };

  const groups: BbSanLuongGroup[] = [];

  for (const bucket of buckets.values()) {
    const shiftLabel = formatProductionOrderShiftLabel(bucket.shift, lookupSettings);
    const orderCode = findOrderCodeForBucket(bucket);
    const groupKey =
      orderCode || `san-luong|${bucket.ngay}|${bucket.shift}|${bucket.machine}`;

    const productMap = new Map<
      string,
      {
        productCode: string;
        productName: string;
        unit: string;
        quantity: number;
        weightKg: number;
        reportCount: number;
        nvlAgg: Map<
          string,
          {
            itemCode: string;
            itemName: string;
            unit: string;
            amountType: 'percent' | 'quantity';
            rate: number;
            quantity: number | null;
            normWeightKg: number;
            actualWeightKg: number;
          }
        >;
      }
    >();

    let reportedProductQtyTotal = 0;

    for (const report of bucket.reports) {
      const productCodeRaw = resolveAcceptanceReportProductCode(report.mat_hang);
      if (!productCodeRaw) continue;
      const catalog = findProductByCode(input.products, productCodeRaw);
      if (!catalog || !isBbThanhPhamProductWarehouse(catalog.warehouse)) continue;

      const qty = Number(report.so_luong);
      const inboundQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
      if (inboundQty <= 0) continue;

      const weightRaw = Number(report.trong_luong);
      const reportWeightKg = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 0;
      reportedProductQtyTotal += inboundQty;

      const productKey = normalizeProductCodeKey(productCodeRaw) || productCodeRaw.toUpperCase();
      let product = productMap.get(productKey);
      if (!product) {
        product = {
          productCode: productCodeRaw,
          productName: String(report.ten_sp || catalog.name || '').trim() || productCodeRaw,
          unit: String(report.don_vi || catalog.unit || '').trim(),
          quantity: 0,
          weightKg: 0,
          reportCount: 0,
          nvlAgg: new Map()
        };
        productMap.set(productKey, product);
      }
      product.quantity += inboundQty;
      product.weightKg += reportWeightKg;
      product.reportCount += 1;
      if (!product.unit && (report.don_vi || catalog.unit)) {
        product.unit = String(report.don_vi || catalog.unit || '').trim();
      }
      if (!product.productName || product.productName === product.productCode) {
        const ten = String(report.ten_sp || catalog.name || '').trim();
        if (ten) product.productName = ten;
      }

      const snapItemsRaw =
        input.acceptanceNvlDinhMucByReportId?.get(String(report.id || '').trim()) || [];
      const nvlItems = mergeSanLuongNvlFromBomAndSnapshot(
        catalog.nplItems || [],
        inboundQty,
        snapItemsRaw
      );

      const materialsCatalog = input.materials.map(mapMaterialToWeightCatalogItem);

      for (const item of nvlItems) {
        const materialKey = nvlDinhMucItemMatchKey(item);
        if (!materialKey) continue;

        const hasSnapshot = item.hasSnapshot !== false;
        const bomItem = findProductNplItemInBom(catalog, item);
        const rateFromBom = bomItem ? resolveProductNplSanLuongRate(bomItem) : null;
        const rate = !hasSnapshot
          ? 0
          : item.rate > 0
            ? item.rate
            : rateFromBom != null && rateFromBom > 0
              ? rateFromBom
              : 0;

        const isPercent = item.amountType === 'percent';
        const isNvlPhu = isBbSanLuongNvlPhu(item.amountType);
        const lineQty = isNvlPhu
          ? resolveBbSanLuongNvlPhuQuantity(inboundQty)
          : !hasSnapshot
            ? 0
            : item.quantityBySl != null && item.quantityBySl > 0
              ? item.quantityBySl
              : isPercent
                ? rate
                : roundQuantityByUnit(rate * inboundQty, item.unit || '');

        const lineKg = isNvlPhu
          ? resolveBbSanLuongNvlPhuWeightKg(
              lineQty,
              resolveBbSanLuongNvlPhuKgPerUnit(bomItem?.weightKg, item.code, materialsCatalog)
            )
          : !hasSnapshot
            ? 0
            : resolveBbSanLuongNvlLineWeightKg({
                item,
                bomItem,
                catalog,
                inboundQty,
                reportWeightKg,
                lineQty,
                rate,
                materialsCatalog,
                materials: input.materials
              });

        const existing = product.nvlAgg.get(materialKey);
        if (!existing) {
          product.nvlAgg.set(materialKey, {
            itemCode: item.code || '',
            itemName: item.name || item.code || '',
            unit: isPercent ? '%' : resolveBbSanLuongNvlPhuUnit(item.unit),
            amountType: item.amountType,
            rate,
            quantity: lineQty >= 0 ? lineQty : null,
            normWeightKg: lineKg,
            actualWeightKg: lineKg
          });
        } else {
          if (isPercent && rate > 0) {
            // Giữ % ĐM; kg cộng dồn theo từng phiếu.
            existing.quantity = rate;
            existing.rate = rate;
          } else if (lineQty > 0) {
            existing.quantity = roundQty((existing.quantity || 0) + lineQty, 4);
          }
          existing.normWeightKg = roundQty(existing.normWeightKg + lineKg, 4);
          existing.actualWeightKg = roundQty(existing.actualWeightKg + lineKg, 4);
        }
      }
    }

    if (productMap.size === 0) continue;

    // Nếu chưa có định mức kg trên Thành phần SP — kg có thể = 0 (không suy từ TL phiếu × %).

    const productGroups: BbSanLuongProductGroup[] = [...productMap.entries()]
      .map(([productKey, product]) => {
        const productQty = product.quantity > 0 ? product.quantity : 0;
        const productShare =
          reportedProductQtyTotal > 0 && productQty > 0
            ? productQty / reportedProductQtyTotal
            : 1;
        const productSharePercent = roundQty(productShare * 100, 4);
        const lines: BbSanLuongNvlLine[] = orderBbSanLuongNvlLinesByKg(
          [...product.nvlAgg.entries()].map(([materialKey, nvl]) => ({
            key: `${groupKey}|${productKey}|${materialKey}`,
            itemCode: nvl.itemCode,
            itemName: nvl.itemName,
            unit: nvl.unit,
            tiLeDinhMucPercent:
              nvl.amountType === 'percent' ? roundQty(nvl.rate, 4) : null,
            dinhMucRate: roundQty(nvl.rate, 4),
            dinhMucUnit: nvl.amountType === 'percent' ? '%' : nvl.unit || 'đơn vị',
            amountType: nvl.amountType,
            quantity: nvl.quantity,
            normWeightKg: roundQty(nvl.normWeightKg, 4),
            materialNorm: null,
            baseActualWeightKg: roundQty(nvl.actualWeightKg, 4),
            productSharePercent,
            actualWeightKg: roundQty(nvl.actualWeightKg, 4),
            balanceDetail: null
          }))
        );
        return {
          key: `${groupKey}|${productKey}`,
          productCode: product.productCode,
          productName: product.productName,
          unit: product.unit,
          quantity: product.quantity,
          weightKg: roundQty(product.weightKg, 2),
          productSharePercent,
          reportCount: product.reportCount,
          lineCount: lines.length,
          totalNormWeightKg: roundQty(
            lines.reduce((sum, line) => sum + line.normWeightKg, 0),
            3
          ),
          totalActualWeightKg: roundQty(
            lines.reduce((sum, line) => sum + line.actualWeightKg, 0),
            2
          ),
          lines
        };
      })
      .sort((a, b) => a.productName.localeCompare(b.productName, 'vi'));

    /** Tổng NVL để footer — không ghi đè dòng từng SP (không gộp rồi chia lại). */
    const nvlTotals = rebuildBbSanLuongNvlTotals(groupKey, productGroups);
    const totalNormWeightKg = roundQty(
      productGroups.reduce((sum, pg) => sum + pg.totalNormWeightKg, 0),
      3
    );
    const totalActualWeightKg = roundQty(
      productGroups.reduce((sum, pg) => sum + (pg.totalActualWeightKg || 0), 0),
      2
    );
    const balanceSummary: BbInboundMaterialBalanceDetail = {
      tonDauKg: 0,
      tonDauFromNnsTron: false,
      tonDauDirectKg: 0,
      nnsTronTonDauKg: 0,
      tiLeThucTeTbPercent: null,
      xuatThucTeKg: 0,
      loiHongKg: 0,
      loiHongGroup: 'nhua',
      loiHongGroupTotalKg: 0,
      loiHongBaseKg: 0,
      loiHongGroupBaseSumKg: 0,
      loiHongTiLeTronPercent: null,
      tonCuoiKg: 0,
      realKg: totalActualWeightKg
    };

    groups.push({
      groupKey,
      orderCode,
      ngay: bucket.ngay,
      shift: bucket.shift,
      shiftLabel,
      machine: bucket.machine,
      productCount: productGroups.length,
      lineCount: productGroups.reduce((sum, pg) => sum + pg.lineCount, 0),
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
    return (a.orderCode || a.machine).localeCompare(b.orderCode || b.machine, 'vi');
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
  /** Xuất kho NVL của đúng mã này trong ngày (kg) — từ phiếu xuất kho (mọi ca). */
  xuatTrongCaKg: number;
  /** @deprecated Giữ tương thích — bằng xuatTrongCaKg (đã bỏ công thức TL đã trộn). */
  trongLuongDaTronKg: number;
  tonDauKg: number;
  /** Tồn đầu ghi nhận trực tiếp theo mã (chưa trộn…). */
  directTonDauKg: number;
  /** true khi tồn đầu có thành phần phân bổ từ NNS-TRON × tỉ lệ ĐM. */
  tonDauFromNnsTron: boolean;
  /** KL NNS-TRON tồn đầu ca dùng để phân bổ (nếu có). */
  nnsTronTonDauKg: number | null;
  tonCuoiKg: number;
  /** Tồn cuối ghi nhận trực tiếp theo mã (chưa trộn…). */
  directTonCuoiKg: number;
  /** true khi tồn cuối có thành phần phân bổ từ NNS-TRON × tỉ lệ ĐM. */
  tonCuoiFromNnsTron: boolean;
  /** KL NNS-TRON tồn cuối ca dùng để phân bổ (nếu có). */
  nnsTronTonCuoiKg: number | null;
  /** Ca nguồn của tỉ lệ TB thực tế (ca trước). */
  tiLeThucTeSourceNgay: string | null;
  tiLeThucTeSourceShift: string | null;
  /** KL thực trộn NVL trên danh sách phối trộn (ngày+ca+máy) — cột «Thực trộn». */
  mixingShiftMaterialKg: number | null;
  /** Tổng KL trộn ca (cộng KL mọi NVL kg) — mẫu số tỉ lệ TB thực tế. */
  mixingShiftTotalKg: number | null;
  weightKg: number;
  /** Nhựa TT — Tổng nhựa thành phẩm (banner) × Tỉ lệ TB thực tế (%) ÷ 100. */
  klThucTeKg: number;
  /** Nhựa lỗi — Tổng nhựa lỗi (banner) × Tỉ lệ TB thực tế (%) ÷ 100. */
  loiHongKg: number;
  /** KL nhựa TT + Nhựa Lỗi = klThucTeKg + loiHongKg (cùng cột in BB). */
  klThucTePlusLoiKg: number;
  /** Chênh lệch = KL nhựa TT+ Nhựa Lỗi − Thực dùng (kg). */
  chenhLechKg: number;
  /** Tổng nhựa thành phẩm (banner) dùng phân bổ — popup công thức. */
  nhuaThanhPhamHeaderKg: number | null;
  /** Tổng nhựa lỗi (banner) dùng phân bổ — popup công thức. */
  nhuaLoiHeaderKg: number | null;
  /** Tỉ lệ TB thực tế (%) dùng nhân banner — popup công thức. */
  nhuaPhanBoTiLePercent: number | null;
  /** Không dùng — giữ tương thích snapshot cũ. */
  nhuaPhanBoTiLeSumPercent: number | null;
  /** Nguồn tỉ lệ phân bổ. */
  nhuaPhanBoTiLeSource: 'tb_thuc_te' | 'dinh_muc' | null;
  /** true = NVL có trong bảng tỉ lệ trộn của máy (xếp nhóm trên). */
  inMixingRatioTable: boolean;
};

export type BbThucDungSectionTotals = {
  lineCount: number;
  thucTronTotal: number;
  xuatCaTotal: number;
  tonDauCaTotal: number;
  tonCuoiCaTotal: number;
  totalWeightKg: number;
  klThucTePlusLoiTotal: number;
  chenhLechTotal: number;
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
  /** Tổng KL thực trộn (danh sách phối trộn) các dòng NVL trong nhóm. */
  thucTronTotal: number;
  /** Tổng riêng khối NVL trong bảng tỉ lệ trộn máy. */
  mixingRatioTotals: BbThucDungSectionTotals;
  /** Tổng riêng khối NVL khác (không có trên tỉ lệ trộn máy). */
  otherTotals: BbThucDungSectionTotals;
  /** Đã xếp: tỉ lệ trộn trước, vật tư khác sau. */
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

/** Tổng KL lỗi hỏng đúng như tab «Dữ liệu trong báo cáo lỗi hỏng» cho 1 lệnh (ngày+ca+máy).
 * Nguồn: Báo cáo sản lượng — Hàng hỏng (SP lỗi) + Hàng rác (SP rác).
 */
function sumBbDamagedGoodsTabTotalKgForHeader(
  acceptanceReports: AcceptanceReport[],
  header: { ngay: string; shift: string; orderCode: string; machine: string },
  shiftOptions: ReturnType<typeof getProductionShiftOptions>,
  includeAllMachines?: boolean
) {
  let total = 0;
  for (const report of acceptanceReports || []) {
    if (!isAcceptanceSpLoiLoai(report.loai_vat_tu) && !isAcceptanceSpRacLoai(report.loai_vat_tu)) {
      continue;
    }
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (
      !matchesShiftSummaryBucket(header.ngay, header.shift, ngay, report.ca, shiftOptions)
    ) {
      continue;
    }
    const machineMatched =
      machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) ||
      (isBbMachineText(report.ma_may, report.ten_may) && isBbMachineText(header.machine));
    if (!machineMatched) {
      if (!isBbMachineText(report.ma_may, report.ten_may)) continue;
    }
    if (!includeAllMachines && !isBbMachineText(report.ma_may, report.ten_may)) continue;
    const kg = acceptanceReportWeightKg(report);
    if (kg > 0) total += kg;
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
  if (isWarehouseTapeExportItem(code, name)) return 'other';
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

/** Tồn theo mã = tồn trực tiếp + NNS-TRON × tỉ lệ ĐM (kg nhựa có tỉ lệ trộn). */
function resolveBbTonKgFromNnsTronAndDirect(input: {
  directKg: number;
  nnsTronKg: number;
  tiLePercent: number | null;
  itemCode: string;
  itemName: string;
}): {
  tonKg: number;
  fromNnsTron: boolean;
  directKg: number;
  tiLePercent: number | null;
} {
  const directKg = Number.isFinite(input.directKg) && input.directKg > 0 ? input.directKg : 0;
  if (isNnsTronMaterial(input.itemCode, input.itemName)) {
    return { tonKg: roundQty(directKg, 4), fromNnsTron: false, directKg: roundQty(directKg, 4), tiLePercent: null };
  }
  const tiLe = input.tiLePercent;
  const useNns =
    input.nnsTronKg > 0 && tiLe !== null && Number.isFinite(tiLe) && tiLe > 0;
  if (useNns) {
    return {
      tonKg: roundQty(directKg + input.nnsTronKg * (tiLe / 100), 4),
      fromNnsTron: true,
      directKg: roundQty(directKg, 4),
      tiLePercent: roundQty(tiLe, 4)
    };
  }
  return { tonKg: roundQty(directKg, 4), fromNnsTron: false, directKg: roundQty(directKg, 4), tiLePercent: null };
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
    // Khớp máy với header (mọi máy trên /phan-tich-tu-dong); không bắt buộc máy BB.
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
      const lineDinhMuc = (line as { ti_le_phan_tram?: number | null }).ti_le_phan_tram;
      if (lineDinhMuc !== null && lineDinhMuc !== undefined && Number.isFinite(lineDinhMuc)) {
        stat.tiLeDinhMucSum += lineDinhMuc;
        stat.tiLeDinhMucCount += 1;
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
      const tiLeThucTeTbPercent = resolveTiLeThucTeTbPercent(code, name);
      const resolved = resolveBbTonKgFromNnsTronAndDirect({
        directKg: directTonDauKg,
        nnsTronKg: nnsTronTonDauKg,
        tiLePercent: tiLeThucTeTbPercent,
        itemCode: code,
        itemName: name
      });
      return {
        tonDauKg: resolved.tonKg,
        fromNnsTron: resolved.fromNnsTron,
        tiLeThucTeTbPercent: resolved.tiLePercent
      };
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
 * (tab «Sản phẩm lỗi + rác»): Tồn đầu ca, Xuất thực tế, Tồn cuối ca.
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
  acceptanceReports: AcceptanceReport[];
  /** @deprecated Không còn dùng — lỗi hỏng lấy từ Báo cáo sản lượng. */
  damagedRecords?: WeighingRecord[];
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
      formula: `Xuất thực tế = tổng KL các phiếu xuất kho NVL loại "xuất" khớp mã NVL, đúng ngày (bộ lọc ngày, mọi ca) = ${roundQty(
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

  // loi_hong — cùng nguồn tab «Dữ liệu trong báo cáo lỗi hỏng» (Báo cáo sản lượng · Kho hàng hỏng)
  const rows: Array<Record<string, string | number | null | undefined>> = [];
  for (const report of input.acceptanceReports) {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (
      !matchesShiftSummaryBucket(
        header.ngay,
        header.shift,
        ngay,
        report.ca,
        shiftOptions
      )
    ) {
      continue;
    }
    const machineMatched =
      machineValueMatchesFilter(header.machine, null, report.ma_may, report.ten_may) ||
      (isBbMachineText(report.ma_may, report.ten_may) && isBbMachineText(header.machine));
    if (!machineMatched && !isBbMachineText(report.ma_may, report.ten_may)) continue;

    const split = splitAcceptanceLoiHongWeightKg(report, input.materials);
    if (!split) continue;

    const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
    rows.push({
      ngay: report.ngay,
      ca: report.ca,
      documentNo: String(report.id || '').trim() || `${report.ngay}|${report.ca}|${report.lan || ''}`,
      productCode,
      weightKg: roundQty(split.tongKg, 4)
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

/**
 * Tổng nhựa thành phẩm + tổng nhựa lỗi — cùng nguồn banner «Tổng hợp nhựa»
 * (displaySanLuongTotals − màng nếu máy cách nhiệt; Σ SP lỗi tab lỗi hỏng).
 */
export function resolveBbPlasticBannerTotals(input: {
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  sanLuongGroups?: BbSanLuongGroup[];
  canTuDongRecords?: CanTuDongWeightRow[];
  products?: ProductRow[];
  damagedLines?: BbDamagedGoodsLineRow[];
  selectedMachine?: { code?: string; name?: string } | null;
  dateFrom?: string;
  dateTo?: string;
  shiftFilter?: string;
  machineFilter?: string;
}): { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number } {
  const sanLuongSource = input.sanLuongSource || 'acceptance';
  const isInsulationMachine = isInsulationMachineText(input.selectedMachine?.name, input.selectedMachine?.code);
  let tongNhuaThanhPhamKg = 0;

  if (sanLuongSource === 'can-tu-dong' && (input.canTuDongRecords?.length ?? 0) > 0) {
    const canTuDongDateTo = input.dateTo
      ? shiftIsoDateByDays(input.dateTo, 1) || input.dateTo
      : input.dateTo;
    const scoped = filterCanTuDongRecordsForBoard(input.canTuDongRecords || [], {
      shiftFilter: input.shiftFilter,
      dateFrom: input.dateFrom,
      dateTo: canTuDongDateTo,
      machineFilter: input.machineFilter,
      selectedMachine: input.selectedMachine
    });
    if ((input.products?.length ?? 0) > 0) {
      const banner = computeCanTuDongTongHopBannerTotals(scoped, input.products);
      tongNhuaThanhPhamKg = banner.totals.nhua_tt_kg > 0 ? banner.totals.nhua_tt_kg : 0;
    } else {
      const totals = sumCanTuDongSanLuongTotals(scoped);
      tongNhuaThanhPhamKg = totals.weightKg > 0 ? totals.weightKg : 0;
      if (isInsulationMachine) {
        const filmKg = computeInsulationFilmWeightKg(input.products || [], scoped);
        tongNhuaThanhPhamKg = Math.max(0, tongNhuaThanhPhamKg - filmKg);
      }
    }
  } else {
    const sanLuongTotals = sumBbSanLuongTotals(input.sanLuongGroups || []);
    tongNhuaThanhPhamKg = sanLuongTotals.weightKg > 0 ? sanLuongTotals.weightKg : 0;
  }

  const tongNhuaLoiKg = sumBbDamagedGoodsWeightKgByKind(input.damagedLines || [], {
    isInsulationMachine
  }).plasticKg;

  return {
    tongNhuaThanhPhamKg: roundQty(tongNhuaThanhPhamKg, 4),
    tongNhuaLoiKg: roundQty(tongNhuaLoiKg, 4)
  };
}

/**
 * Cột «KL nhựa TT+ Nhựa Lỗi»: Tổng nhựa thành phẩm / lỗi (banner)
 * × Tỉ lệ TB thực tế (%) từng NVL ÷ 100.
 */
export function computeBbNhuaKgByTbThucTePercent(
  headerKg: number,
  tiLeTbPercent: number | null | undefined
): number {
  if (!Number.isFinite(headerKg) || headerKg <= 0) return 0;
  if (tiLeTbPercent === null || tiLeTbPercent === undefined || !Number.isFinite(tiLeTbPercent) || tiLeTbPercent <= 0) {
    return 0;
  }
  return roundQty(headerKg * (tiLeTbPercent / 100), 4);
}

/** Banner live ưu tiên snapshot (snapshot có thể lưu nhuaThanhPhamHeaderKg = 0). */
function resolveBbThucDungPlasticHeaderKg(
  lineKg: number | null | undefined,
  plasticBanner: { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number } | undefined,
  kind: 'thanhPham' | 'loi'
): number | null {
  if (plasticBanner) {
    const bannerKg =
      kind === 'thanhPham' ? plasticBanner.tongNhuaThanhPhamKg : plasticBanner.tongNhuaLoiKg;
    if (Number.isFinite(bannerKg)) return bannerKg;
  }
  if (lineKg !== null && lineKg !== undefined && Number.isFinite(lineKg)) return lineKg;
  return null;
}

/** Tính lại KL nhựa TT + lỗi từ banner × Tỉ lệ TB thực tế (%) — khớp popup & cột. */
export function resolveBbThucDungKlNhuaTtLoiKg(
  line: Pick<
    BbThucDungLineRow,
    | 'inMixingRatioTable'
    | 'tiLeThucTeTbPercent'
    | 'nhuaPhanBoTiLePercent'
    | 'klThucTeKg'
    | 'loiHongKg'
    | 'klThucTePlusLoiKg'
    | 'nhuaThanhPhamHeaderKg'
    | 'nhuaLoiHeaderKg'
  >,
  plasticBanner?: { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number }
): { klThucTeKg: number; loiHongKg: number; klThucTePlusLoiKg: number } {
  if (!line.inMixingRatioTable) {
    return { klThucTeKg: 0, loiHongKg: 0, klThucTePlusLoiKg: 0 };
  }
  const tpHeader = resolveBbThucDungPlasticHeaderKg(
    line.nhuaThanhPhamHeaderKg,
    plasticBanner,
    'thanhPham'
  );
  const loiHeader = resolveBbThucDungPlasticHeaderKg(line.nhuaLoiHeaderKg, plasticBanner, 'loi');
  const tiLeTb = line.nhuaPhanBoTiLePercent ?? line.tiLeThucTeTbPercent;
  if (
    tpHeader !== null &&
    tpHeader !== undefined &&
    tiLeTb !== null &&
    tiLeTb !== undefined &&
    Number.isFinite(tiLeTb) &&
    tiLeTb > 0
  ) {
    const klThucTeKg = computeBbNhuaKgByTbThucTePercent(tpHeader, tiLeTb);
    const loiHongKg = computeBbNhuaKgByTbThucTePercent(loiHeader ?? 0, tiLeTb);
    return {
      klThucTeKg,
      loiHongKg,
      klThucTePlusLoiKg: roundQty(klThucTeKg + loiHongKg, 4)
    };
  }
  return {
    klThucTeKg: line.klThucTeKg ?? 0,
    loiHongKg: line.loiHongKg ?? 0,
    klThucTePlusLoiKg: line.klThucTePlusLoiKg ?? 0
  };
}

/** Chênh lệch = KL nhựa TT+ Nhựa Lỗi − Thực dùng (kg). */
export function resolveBbThucDungChenhLechKg(
  line: Pick<
    BbThucDungLineRow,
    | 'inMixingRatioTable'
    | 'tiLeThucTeTbPercent'
    | 'nhuaPhanBoTiLePercent'
    | 'klThucTeKg'
    | 'loiHongKg'
    | 'klThucTePlusLoiKg'
    | 'nhuaThanhPhamHeaderKg'
    | 'nhuaLoiHeaderKg'
    | 'weightKg'
  >,
  plasticBanner?: { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number }
): number {
  const klNhuaTtLoiKg = resolveBbThucDungKlNhuaTtLoiKg(line, plasticBanner).klThucTePlusLoiKg;
  const thucDungKg = Number.isFinite(line.weightKg) ? line.weightKg : 0;
  return roundQty(klNhuaTtLoiKg - thucDungKg, 4);
}

function applyBbThucDungNhuaTtLoiToHeaderRows(input: {
  headerRows: BbThucDungLineRow[];
  bannerTotals: { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number };
}) {
  const mixingRows = input.headerRows.filter(row => row.inMixingRatioTable);
  for (const row of input.headerRows) {
    row.klThucTeKg = 0;
    row.loiHongKg = 0;
    row.klThucTePlusLoiKg = 0;
    row.chenhLechKg = 0;
  }
  if (mixingRows.length === 0) return;

  const tongNhuaThanhPhamKg = input.bannerTotals.tongNhuaThanhPhamKg;
  const tongNhuaLoiKg = input.bannerTotals.tongNhuaLoiKg;

  mixingRows.forEach(row => {
    const tiLeTb = row.tiLeThucTeTbPercent;
    const tiLeTbRounded =
      tiLeTb !== null && tiLeTb !== undefined && Number.isFinite(tiLeTb) && tiLeTb > 0 ? roundQty(tiLeTb, 4) : null;
    row.nhuaThanhPhamHeaderKg = tongNhuaThanhPhamKg;
    row.nhuaLoiHeaderKg = tongNhuaLoiKg;
    row.nhuaPhanBoTiLePercent = tiLeTbRounded;
    row.nhuaPhanBoTiLeSumPercent = null;
    row.nhuaPhanBoTiLeSource = tiLeTbRounded !== null ? 'tb_thuc_te' : null;
    row.klThucTeKg = computeBbNhuaKgByTbThucTePercent(tongNhuaThanhPhamKg, tiLeTb);
    row.loiHongKg = computeBbNhuaKgByTbThucTePercent(tongNhuaLoiKg, tiLeTb);
    row.klThucTePlusLoiKg = roundQty(row.klThucTeKg + row.loiHongKg, 4);
    row.chenhLechKg = roundQty(row.klThucTePlusLoiKg - row.weightKg, 4);
  });
}

function buildTonKgMapsFromMaterialLines(lines: BbDauCaProductLine[] | undefined): BbMaterialKgMaps {
  return buildBbMaterialKgMapsFromTabLines(
    (lines || []).map(line => ({
      itemCode: line.itemCode,
      itemName: line.itemName,
      weightKg: line.tonDauWeightKg
    }))
  );
}

function findBbDauCaMaterialLine(
  lines: BbDauCaProductLine[] | undefined,
  materialCode: string,
  materialName: string
): BbDauCaProductLine | undefined {
  if (!lines?.length) return undefined;
  const codeKey = normalizeMaterialCodeKey(materialCode);
  const nameKey = String(materialName || '')
    .trim()
    .toUpperCase();
  return lines.find(line => {
    const lineCode = normalizeMaterialCodeKey(line.itemCode);
    const lineName = String(line.itemName || '')
      .trim()
      .toUpperCase();
    if (codeKey && lineCode && codeKey === lineCode) return true;
    if (nameKey && lineName && nameKey === lineName) return true;
    return false;
  });
}

/** Tồn cuối ca — ưu tiên tab «Kiểm tồn cuối ca» (NNS-TRON × tỉ lệ + trực tiếp), fallback phiếu thô. */
function resolveBbThucDungTonCuoiKg(input: {
  materialCode: string;
  materialName: string;
  unit: string;
  cuoiCaGroup: BbCuoiCaGroup | undefined;
  tonCuoiMaps: BbMaterialKgMaps;
  tonCuoiResolvedMaps: BbMaterialKgMaps;
  nnsTronTonCuoiKg: number;
  tiLeDinhMucPercent: number | null;
}): number {
  const cuoiLine = findBbDauCaMaterialLine(
    input.cuoiCaGroup?.materialLines,
    input.materialCode,
    input.materialName
  );
  if (cuoiLine && Number.isFinite(cuoiLine.tonDauWeightKg) && cuoiLine.tonDauWeightKg > 0) {
    return roundQty(cuoiLine.tonDauWeightKg, 4);
  }

  let kg = lookupMachineNvlKgByMaterial(
    input.tonCuoiResolvedMaps,
    input.materialCode,
    input.materialName
  );
  if (kg > 0) return roundQty(kg, 4);

  const directTon = lookupMachineNvlKgByMaterial(
    input.tonCuoiMaps,
    input.materialCode,
    input.materialName
  );
  const tiLe =
    cuoiLine?.tonDauFormula?.tiLeThucTeTbPercent ??
    cuoiLine?.tiLeDinhMucPercent ??
    input.tiLeDinhMucPercent;
  const unitIsKg = isBbMixingRatioKgUnit(input.unit, cuoiLine?.amountType ?? null);
  if (
    unitIsKg &&
    input.nnsTronTonCuoiKg > 0 &&
    tiLe !== null &&
    Number.isFinite(tiLe) &&
    tiLe > 0 &&
    !isNnsTronMaterial(input.materialCode, input.materialName)
  ) {
    return roundQty(directTon + input.nnsTronTonCuoiKg * (tiLe / 100), 4);
  }
  return roundQty(directTon, 4);
}

/** Thực dùng theo từng NVL: Xuất (ca) + tồn đầu − tồn cuối.
 * Tỉ lệ ĐM (%): tỉ lệ trộn cấu hình trên Danh sách máy (`ty_le_tron`).
 * Tỉ lệ TB thực tế / Thực trộn: danh sách báo cáo phối trộn (`bao_cao_phoi_tron`).
 */
export function buildBbThucDungLineRows(input: {
  productionOrders: ProductionOrderRow[];
  mixingReports: MixingReport[];
  warehouseMovements: ShiftSummaryWarehouseMovement[];
  /** Phiếu xuất NVL ca đang chọn — cột «Xuất trong ngày». */
  warehouseMovementsByDate?: ShiftSummaryWarehouseMovement[];
  machineNvlReports: MachineNvlSavedReport[];
  materials: MaterialRow[];
  machines: MachineRow[];
  /** Nhóm tồn đầu ca đã phân bổ NNS-TRON — cùng nguồn tab «Tồn đầu ca». */
  dauCaGroups?: BbDauCaGroup[];
  /** Nhóm tồn cuối ca đã phân bổ NNS-TRON — cùng nguồn tab «Kiểm tồn cuối ca». */
  cuoiCaGroups?: BbCuoiCaGroup[];
  sanLuongGroups?: BbSanLuongGroup[];
  damagedGroups?: BbDamagedGoodsGroup[];
  sanLuongSource?: 'acceptance' | 'can-tu-dong';
  canTuDongRecords?: CanTuDongWeightRow[];
  products?: ProductRow[];
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
  const xuatKhoTabRows = buildBbWarehouseExportLineRows({
    productionOrders: input.productionOrders,
    warehouseMovements: input.warehouseMovements,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter,
    selectedMachine: input.selectedMachine,
    includeAllMachines: input.includeAllMachines,
    exportMatchScope: 'shift'
  });

  const rows: BbThucDungLineRow[] = [];
  const damagedLines = (input.damagedGroups || []).flatMap(group => group.lines || []);
  const plasticBannerTotals = resolveBbPlasticBannerTotals({
    sanLuongSource: input.sanLuongSource,
    sanLuongGroups: input.sanLuongGroups,
    canTuDongRecords: input.canTuDongRecords,
    products: input.products,
    damagedLines,
    selectedMachine: input.selectedMachine,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter
  });

  for (const header of headers) {
    const byMaterial = new Map<string, MixingThucDungAgg>();
    // Tỉ lệ ĐM (%) — tự động theo cấu hình tỉ lệ trộn của máy (Danh sách máy).
    const machineRow = findBbMachineByLabel(input.machines, header.machine);
    const machineRatioByCode = new Map<string, number>();
    const machineRatioByName = new Map<string, number>();
    const machineMaterialCodes = new Set<string>();
    const machineMaterialNames = new Set<string>();
    /** Key canonical của từng dòng tỉ lệ trộn máy — dùng để gộp tồn/xuất/trộn trùng mã|tên. */
    const machineRatioKeys = new Set<string>();

    const ensureMaterialAgg = (code: string, name: string, unit: string): string | null => {
      const codeKey = normalizeProductCodeKey(code);
      const nameKey = (name || '').trim().toLowerCase();
      // Ưu tiên gộp vào dòng đã seed từ tỉ lệ trộn máy (tránh sót / trùng).
      if (codeKey) {
        for (const [key, agg] of byMaterial.entries()) {
          if (!machineRatioKeys.has(key)) continue;
          if (normalizeProductCodeKey(agg.materialCode) === codeKey) {
            if (!agg.materialName && name) agg.materialName = name;
            if (!agg.unit && unit) agg.unit = unit;
            return key;
          }
        }
      }
      if (nameKey) {
        for (const [key, agg] of byMaterial.entries()) {
          if (!machineRatioKeys.has(key)) continue;
          if ((agg.materialName || '').trim().toLowerCase() === nameKey) {
            if (!agg.materialCode && code) agg.materialCode = code;
            if (!agg.unit && unit) agg.unit = unit;
            return key;
          }
        }
      }
      const directKey = materialIdentityKey(code, name);
      if (!directKey) return null;
      if (byMaterial.has(directKey)) {
        const existing = byMaterial.get(directKey)!;
        if (!existing.materialCode && code) existing.materialCode = code;
        if (!existing.materialName && name) existing.materialName = name;
        if (!existing.unit && unit) existing.unit = unit;
        return directKey;
      }
      if (codeKey) {
        for (const [key, agg] of byMaterial.entries()) {
          if (normalizeProductCodeKey(agg.materialCode) === codeKey) {
            if (!agg.materialName && name) agg.materialName = name;
            if (!agg.unit && unit) agg.unit = unit;
            return key;
          }
        }
      }
      if (nameKey) {
        for (const [key, agg] of byMaterial.entries()) {
          if ((agg.materialName || '').trim().toLowerCase() === nameKey) {
            if (!agg.materialCode && code) agg.materialCode = code;
            if (!agg.unit && unit) agg.unit = unit;
            return key;
          }
        }
      }
      byMaterial.set(directKey, {
        materialCode: code,
        materialName: name,
        unit: unit || 'kg',
        tiLeDinhMucSum: 0,
        tiLeDinhMucCount: 0,
        tiLeThucTeSum: 0,
        tiLeThucTeCount: 0,
        totalKlThucTe: 0
      });
      return directKey;
    };

    if (machineRow) {
      for (const ratio of machineRow.mixingRatios) {
        const code = String(ratio.materialCode || '').trim();
        const name = String(ratio.materialName || '').trim();
        if (!code && !name) continue;
        const codeKey = normalizeProductCodeKey(code);
        if (codeKey) machineMaterialCodes.add(codeKey);
        const nameKey = (name || '').trim().toLowerCase();
        if (nameKey) machineMaterialNames.add(nameKey);
        const pct = Number(String(ratio.percent ?? '').trim().replace(',', '.'));
        if (Number.isFinite(pct)) {
          if (codeKey) machineRatioByCode.set(codeKey, pct);
          if (nameKey) machineRatioByName.set(nameKey, pct);
        }
        // Seed đủ NVL trên bảng tỉ lệ trộn máy — kể cả chưa có xuất/tồn/trộn.
        const key = ensureMaterialAgg(code, name, 'kg');
        if (key) machineRatioKeys.add(key);
      }
    }
    const resolveMachineDinhMuc = (code: string, name: string): number | null => {
      const codeKey = normalizeProductCodeKey(code);
      if (codeKey && machineRatioByCode.has(codeKey)) return machineRatioByCode.get(codeKey)!;
      const nameKey = (name || '').trim().toLowerCase();
      if (nameKey && machineRatioByName.has(nameKey)) return machineRatioByName.get(nameKey)!;
      return null;
    };
    const isInMachineMixingRatioTable = (
      code: string,
      name: string,
      materialKey?: string
    ): boolean => {
      if (materialKey && machineRatioKeys.has(materialKey)) return true;
      const codeKey = normalizeProductCodeKey(code);
      if (codeKey && machineMaterialCodes.has(codeKey)) return true;
      const nameKey = (name || '').trim().toLowerCase();
      if (nameKey && machineMaterialNames.has(nameKey)) return true;
      return false;
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
    const dauCaGroup = findBbGroupForOrderHeader(input.dauCaGroups || [], header);
    const cuoiCaGroup = findBbGroupForOrderHeader(input.cuoiCaGroups || [], header);
    /** Ưu tiên materialLines tab tồn (đã NNS-TRON × tỉ lệ + tồn trực tiếp); fallback map thô. */
    const tonDauResolvedMaps =
      dauCaGroup?.materialLines && dauCaGroup.materialLines.length > 0
        ? buildTonKgMapsFromMaterialLines(dauCaGroup.materialLines)
        : tonDauMaps;
    const tonCuoiResolvedMaps =
      cuoiCaGroup?.materialLines && cuoiCaGroup.materialLines.length > 0
        ? buildTonKgMapsFromMaterialLines(cuoiCaGroup.materialLines)
        : tonCuoiMaps;
    const nnsTronTonDauKg = lookupNnsTronTonDauKg(tonDauMaps);
    const nnsTronTonCuoiKg = lookupNnsTronTonDauKg(tonCuoiMaps);
    /** Cùng nguồn tab «Phiếu xuất kho»: phiếu xuất ca đang chọn. */
    const xuatThucTeMaps = buildKgMapsFromBbTabRowsForHeader(xuatKhoTabRows, header, false);
    const headerRows: BbThucDungLineRow[] = [];

    // Bảng thực dùng phải hiện đủ NVL của báo cáo tồn cùng ngày + ca.
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
        ensureMaterialAgg(code, name, String(line.donVi || 'kg').trim() || 'kg');
      }
    }

    // Tỉ lệ TB thực tế / Thực trộn từ danh sách trộn cùng ngày+ca+máy (ĐM vẫn lấy theo máy).
    const mixingResolved = resolveBbMixingShiftStatsForOrderHeader({
      mixingReports: input.mixingReports,
      headerMachine: header.machine,
      headerNgay: header.ngay,
      headerShift: header.shift,
      shiftOptions
    });
    const mixingShiftStats = mixingResolved.stats;

    for (const [, stat] of mixingShiftStats.byMaterial.entries()) {
      const key = ensureMaterialAgg(stat.materialCode, stat.materialName, stat.unit || 'kg');
      if (!key) continue;
      const existing = byMaterial.get(key)!;
      existing.totalKlThucTe = stat.klSum;
      if (!existing.materialCode && stat.materialCode) existing.materialCode = stat.materialCode;
      if (!existing.materialName && stat.materialName) existing.materialName = stat.materialName;
      if (!existing.unit && stat.unit) existing.unit = stat.unit;
    }

    if (byMaterial.size === 0) continue;

    const shiftLabel = formatProductionOrderShiftLabel(header.shift, lookupSettings);
    for (const [materialKey, agg] of byMaterial.entries()) {
      // Đã phân bổ NNS-TRON xuống NVL khác → ẩn dòng NNS-TRON, không tính vào báo cáo.
      if (isNnsTronMaterial(agg.materialCode, agg.materialName) && (nnsTronTonDauKg > 0 || nnsTronTonCuoiKg > 0)) {
        continue;
      }
      const mixStat = lookupBbMixingShiftMaterialStat(
        mixingShiftStats.byMaterial,
        agg.materialCode,
        agg.materialName
      );
      const fromMachine = resolveMachineDinhMuc(agg.materialCode, agg.materialName);
      const tiLeDinhMucPercent = fromMachine === null ? null : roundQty(fromMachine, 4);
      const inMixingRatioTable = isInMachineMixingRatioTable(
        agg.materialCode,
        agg.materialName,
        materialKey
      );
      const tiLeThucTeTbPercent = resolveBbMixingShiftTiLeThucTeTbPercent(
        mixStat?.klSum ?? 0,
        mixingShiftStats.totalMixKg
      );
      const mixingShiftMaterialKg =
        mixStat && Number.isFinite(mixStat.klSum) && mixStat.klSum > 0 ? roundQty(mixStat.klSum, 4) : null;
      const mixingShiftTotalKg =
        mixingShiftStats.totalMixKg > 0 ? roundQty(mixingShiftStats.totalMixKg, 4) : null;
      const xuatTrongCaKg = roundQty(
        lookupMachineNvlKgByMaterial(xuatThucTeMaps, agg.materialCode, agg.materialName),
        4
      );
      const trongLuongDaTronKg = xuatTrongCaKg;
      const directTonDauKg = roundQty(
        findBbDauCaMaterialLine(dauCaGroup?.materialLines, agg.materialCode, agg.materialName)?.tonDauFormula
          ?.directTonDauKg ??
          lookupMachineNvlKgByMaterial(tonDauMaps, agg.materialCode, agg.materialName),
        4
      );
      const directTonCuoiKg = roundQty(
        findBbDauCaMaterialLine(cuoiCaGroup?.materialLines, agg.materialCode, agg.materialName)?.tonDauFormula
          ?.directTonDauKg ??
          lookupMachineNvlKgByMaterial(tonCuoiMaps, agg.materialCode, agg.materialName),
        4
      );
      const tonDauKg = roundQty(
        lookupMachineNvlKgByMaterial(tonDauResolvedMaps, agg.materialCode, agg.materialName),
        4
      );
      const cuoiMaterialLine = findBbDauCaMaterialLine(
        cuoiCaGroup?.materialLines,
        agg.materialCode,
        agg.materialName
      );
      const tonCuoiKg = resolveBbThucDungTonCuoiKg({
        materialCode: agg.materialCode,
        materialName: agg.materialName,
        unit: agg.unit,
        cuoiCaGroup,
        tonCuoiMaps,
        tonCuoiResolvedMaps,
        nnsTronTonCuoiKg,
        tiLeDinhMucPercent
      });
      const dauMaterialLine = findBbDauCaMaterialLine(dauCaGroup?.materialLines, agg.materialCode, agg.materialName);
      const tonDauFromNnsTron = dauMaterialLine?.tonDauFormula?.fromNnsTron ?? false;
      const tonCuoiFromNnsTron = cuoiMaterialLine?.tonDauFormula?.fromNnsTron ?? false;
      const weightKg = computeMaterialUsageKg(xuatTrongCaKg, tonDauKg, tonCuoiKg);
      const hasAnyQty =
        (Number.isFinite(weightKg) && weightKg !== 0) ||
        xuatTrongCaKg > 0 ||
        tonDauKg > 0 ||
        tonCuoiKg > 0 ||
        (mixingShiftMaterialKg !== null && mixingShiftMaterialKg > 0);
      // NVL trên bảng tỉ lệ trộn máy luôn giữ lại (kể cả chưa có số lượng).
      if (!inMixingRatioTable && !hasAnyQty) {
        continue;
      }
      headerRows.push({
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
        batchCount: mixStat?.batchCount || 0,
        xuatTrongCaKg,
        trongLuongDaTronKg,
        tonDauKg,
        directTonDauKg,
        tonDauFromNnsTron,
        nnsTronTonDauKg: tonDauFromNnsTron ? nnsTronTonDauKg : null,
        tonCuoiKg,
        directTonCuoiKg,
        tonCuoiFromNnsTron,
        nnsTronTonCuoiKg: tonCuoiFromNnsTron ? nnsTronTonCuoiKg : null,
        tiLeThucTeSourceNgay: mixingResolved.mixingNgay || header.ngay,
        tiLeThucTeSourceShift: mixingResolved.mixingShift || header.shift,
        mixingShiftMaterialKg,
        mixingShiftTotalKg,
        weightKg: roundQty(weightKg, 4),
        klThucTeKg: 0,
        loiHongKg: 0,
        klThucTePlusLoiKg: 0,
        chenhLechKg: 0,
        nhuaThanhPhamHeaderKg: null,
        nhuaLoiHeaderKg: null,
        nhuaPhanBoTiLePercent: null,
        nhuaPhanBoTiLeSumPercent: null,
        nhuaPhanBoTiLeSource: null,
        inMixingRatioTable
      });
    }

    applyBbThucDungNhuaTtLoiToHeaderRows({
      headerRows,
      bannerTotals: plasticBannerTotals
    });
    for (const row of headerRows) {
      rows.push(row);
    }
  }

  return rows.sort((a, b) => {
    const dateCmp = b.ngay.localeCompare(a.ngay);
    if (dateCmp !== 0) return dateCmp;
    const orderCmp = a.orderCode.localeCompare(b.orderCode, 'vi');
    if (orderCmp !== 0) return orderCmp;
    if (a.inMixingRatioTable !== b.inMixingRatioTable) return a.inMixingRatioTable ? -1 : 1;
    return a.materialName.localeCompare(b.materialName, 'vi');
  });
}

/** Đồng bộ cột «Tồn cuối» từ tab Kiểm tồn cuối ca (live UI). */
export function syncBbThucDungRowsTonCuoiFromCuoiCaTab(input: {
  rows: BbThucDungLineRow[];
  machineNvlReports: MachineNvlSavedReport[];
  cuoiCaGroups: BbCuoiCaGroup[];
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0) return input.rows;

  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  type HeaderCtx = {
    cuoiCaGroup: BbCuoiCaGroup | undefined;
    tonCuoiMaps: BbMaterialKgMaps;
    tonCuoiResolvedMaps: BbMaterialKgMaps;
    nnsTronTonCuoiKg: number;
  };
  const ctxByHeader = new Map<string, HeaderCtx>();

  return input.rows.map(row => {
    const headerKey = `${row.ngay}|${row.shift}|${row.orderCode}|${row.machine}`;
    let ctx = ctxByHeader.get(headerKey);
    if (!ctx) {
      const header = {
        ngay: row.ngay,
        shift: row.shift,
        orderCode: row.orderCode,
        machine: row.machine
      };
      const cuoiCaGroup = input.cuoiCaGroups.find(group => {
        if (group.ngay !== header.ngay) return false;
        if (!shiftNamesMatch(group.shift, header.shift)) return false;
        if (header.orderCode && group.orderCode && bbOrderCodesMatch(group.orderCode, header.orderCode)) {
          return true;
        }
        return (
          Boolean(header.machine) &&
          Boolean(group.machine) &&
          machineValueMatchesFilter(header.machine, null, group.machine)
        );
      });
      const tonCuoiMaps = sumMachineNvlKgByCodeForHeader(
        input.machineNvlReports,
        header,
        shiftOptions,
        'cuoi_ca'
      );
      const tonCuoiResolvedMaps =
        cuoiCaGroup?.materialLines && cuoiCaGroup.materialLines.length > 0
          ? buildTonKgMapsFromMaterialLines(cuoiCaGroup.materialLines)
          : tonCuoiMaps;
      ctx = {
        cuoiCaGroup,
        tonCuoiMaps,
        tonCuoiResolvedMaps,
        nnsTronTonCuoiKg: lookupNnsTronTonDauKg(tonCuoiMaps)
      };
      ctxByHeader.set(headerKey, ctx);
    }

    const tonCuoiKg = resolveBbThucDungTonCuoiKg({
      materialCode: row.materialCode,
      materialName: row.materialName,
      unit: row.unit,
      cuoiCaGroup: ctx.cuoiCaGroup,
      tonCuoiMaps: ctx.tonCuoiMaps,
      tonCuoiResolvedMaps: ctx.tonCuoiResolvedMaps,
      nnsTronTonCuoiKg: ctx.nnsTronTonCuoiKg,
      tiLeDinhMucPercent: row.tiLeDinhMucPercent
    });
    const cuoiMaterialLine = findBbDauCaMaterialLine(
      ctx.cuoiCaGroup?.materialLines,
      row.materialCode,
      row.materialName
    );
    const directTonCuoiKg = roundQty(
      cuoiMaterialLine?.tonDauFormula?.directTonDauKg ??
        lookupMachineNvlKgByMaterial(ctx.tonCuoiMaps, row.materialCode, row.materialName),
      4
    );
    const weightKg = roundQty(computeMaterialUsageKg(row.xuatTrongCaKg, row.tonDauKg, tonCuoiKg), 4);
    const chenhLechKg = roundQty(row.klThucTePlusLoiKg - weightKg, 4);
    return {
      ...row,
      tonCuoiKg,
      directTonCuoiKg,
      tonCuoiFromNnsTron: cuoiMaterialLine?.tonDauFormula?.fromNnsTron ?? row.tonCuoiFromNnsTron,
      weightKg,
      chenhLechKg
    };
  });
}

/** Đồng bộ cột «Xuất trong ngày» từ phiếu xuất kho theo ca bộ lọc (live UI). */
export function syncBbThucDungRowsXuatTrongNgayFromExportTab(input: {
  rows: BbThucDungLineRow[];
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
  includeAllMachines?: boolean;
}): BbThucDungLineRow[] {
  if (input.rows.length === 0) return input.rows;

  const xuatKhoTabRows = buildBbWarehouseExportLineRows({
    productionOrders: input.productionOrders,
    warehouseMovements: input.warehouseMovements,
    materials: input.materials,
    machines: input.machines,
    shiftSettings: input.shiftSettings,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    shiftFilter: input.shiftFilter,
    machineFilter: input.machineFilter,
    selectedMachine: input.selectedMachine,
    includeAllMachines: input.includeAllMachines,
    exportMatchScope: 'shift'
  });

  const xuatMapsByHeaderKey = new Map<string, ReturnType<typeof buildKgMapsFromBbTabRowsForHeader>>();
  const seenHeaders = new Set<string>();
  for (const row of input.rows) {
    const headerKey = `${row.ngay}|${row.shift}|${row.orderCode}|${row.machine}`;
    if (seenHeaders.has(headerKey)) continue;
    seenHeaders.add(headerKey);
    xuatMapsByHeaderKey.set(
      headerKey,
      buildKgMapsFromBbTabRowsForHeader(
        xuatKhoTabRows,
        { ngay: row.ngay, shift: row.shift, orderCode: row.orderCode, machine: row.machine },
        false
      )
    );
  }

  return input.rows.map(row => {
    const headerKey = `${row.ngay}|${row.shift}|${row.orderCode}|${row.machine}`;
    const maps = xuatMapsByHeaderKey.get(headerKey);
    if (!maps) return row;
    const xuatTrongCaKg = roundQty(
      lookupMachineNvlKgByMaterial(maps, row.materialCode, row.materialName),
      4
    );
    const weightKg = roundQty(computeMaterialUsageKg(xuatTrongCaKg, row.tonDauKg, row.tonCuoiKg), 4);
    return {
      ...row,
      xuatTrongCaKg,
      trongLuongDaTronKg: xuatTrongCaKg,
      weightKg
    };
  });
}

export function sumBbThucDungWeightKg(rows: BbThucDungLineRow[]) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.weightKg) ? row.weightKg : 0), 0);
}

export type BbThucDungDetailMetric =
  | 'ti_le_dinh_muc'
  | 'ti_le_thuc_te'
  | 'thuc_tron'
  | 'trong_luong_da_tron'
  | 'ton_dau'
  | 'ton_cuoi'
  | 'thuc_dung'
  | 'kl_nhua_tt_loi'
  | 'so_me';

export const BB_THUC_DUNG_DETAIL_METRIC_LABEL: Record<BbThucDungDetailMetric, string> = {
  ti_le_dinh_muc: 'Tỉ lệ định mức (%)',
  ti_le_thuc_te: 'Tỉ lệ TB thực tế (%)',
  thuc_tron: 'Thực trộn (kg)',
  trong_luong_da_tron: 'Xuất trong ngày (kg)',
  ton_dau: 'Tồn đầu (kg)',
  ton_cuoi: 'Tồn cuối (kg)',
  thuc_dung: 'Thực dùng (kg)',
  kl_nhua_tt_loi: 'KL nhựa TT + Nhựa Lỗi',
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

/** Công thức popup: banner kg × Tỉ lệ TB thực tế (%). */
function buildBbNhuaPhanBoRowFormula(input: {
  headerLabel: string;
  headerKg: number | null | undefined;
  tiLeTb: number | null;
  resultKg: number | null | undefined;
  fmt: (value: number | null | undefined, digits?: number) => number | null;
}): string {
  const { headerLabel, headerKg, tiLeTb, resultKg, fmt } = input;
  const computedKg =
    headerKg !== null &&
    headerKg !== undefined &&
    tiLeTb !== null &&
    tiLeTb > 0
      ? computeBbNhuaKgByTbThucTePercent(headerKg, tiLeTb)
      : resultKg;
  if (headerKg !== null && headerKg !== undefined && tiLeTb !== null && tiLeTb > 0) {
    return `${headerLabel} (${fmt(headerKg, 2)} kg) × ${fmt(tiLeTb, 4)}% = ${fmt(computedKg, 4) ?? 0} kg`;
  }
  return `${headerLabel} = ${fmt(computedKg, 4) ?? 0} kg`;
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
  /** Fallback banner «Tổng hợp nhựa» khi snapshot cũ chưa lưu metadata phân bổ. */
  plasticBanner?: { tongNhuaThanhPhamKg: number; tongNhuaLoiKg: number };
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

  if (input.metric === 'kl_nhua_tt_loi') {
    const fmt = (value: number | null | undefined, digits = 2) =>
      value !== null && value !== undefined && Number.isFinite(value) ? roundQty(value, digits) : null;
    const tpHeader = resolveBbThucDungPlasticHeaderKg(
      input.line.nhuaThanhPhamHeaderKg,
      input.plasticBanner,
      'thanhPham'
    );
    const loiHeader = resolveBbThucDungPlasticHeaderKg(
      input.line.nhuaLoiHeaderKg,
      input.plasticBanner,
      'loi'
    );
    const tiLeTbRaw = input.line.tiLeThucTeTbPercent;
    const tiLeTb =
      input.line.nhuaPhanBoTiLePercent ??
      (tiLeTbRaw !== null && tiLeTbRaw !== undefined && Number.isFinite(tiLeTbRaw) && tiLeTbRaw > 0
        ? roundQty(tiLeTbRaw, 4)
        : null);
    const tiLeTbText = tiLeTb !== null ? `${fmt(tiLeTb, 4)}%` : '—';
    const resolvedNhua = resolveBbThucDungKlNhuaTtLoiKg(input.line, input.plasticBanner);
    const nhuaTtKg = resolvedNhua.klThucTeKg;
    const nhuaLoiKg = resolvedNhua.loiHongKg;
    const nhuaTtPlusLoiKg = resolvedNhua.klThucTePlusLoiKg;

    if (!input.line.inMixingRatioTable) {
      return {
        metric: input.metric,
        title,
        subtitle,
        valueLabel: BB_THUC_DUNG_DETAIL_METRIC_LABEL.kl_nhua_tt_loi,
        valueText: `${fmt(nhuaTtPlusLoiKg, 4) ?? 0} kg`,
        formula:
          'Cột «KL nhựa TT+ Nhựa Lỗi» chỉ phân bổ cho NVL trên bảng tỉ lệ trộn máy. Vật tư khác = 0.',
        columns: [
          { key: 'chiTieu', label: 'Chỉ tiêu' },
          { key: 'congThuc', label: 'Công thức / Ghi chú' },
          { key: 'giaTri', label: 'Giá trị', align: 'right' }
        ],
        rows: [
          {
            chiTieu: 'Phạm vi phân bổ',
            congThuc: 'Chỉ NVL trong bảng tỉ lệ trộn máy',
            giaTri: 'Không áp dụng'
          }
        ]
      };
    }

    const nhuaTtFormula = buildBbNhuaPhanBoRowFormula({
      headerLabel: 'Nhựa TT',
      headerKg: tpHeader,
      tiLeTb,
      resultKg: nhuaTtKg,
      fmt
    });
    const nhuaLoiFormula = buildBbNhuaPhanBoRowFormula({
      headerLabel: 'Nhựa lỗi',
      headerKg: loiHeader,
      tiLeTb,
      resultKg: nhuaLoiKg,
      fmt
    });

    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel: BB_THUC_DUNG_DETAIL_METRIC_LABEL.kl_nhua_tt_loi,
      valueText: `${fmt(nhuaTtPlusLoiKg, 4) ?? 0} kg`,
      formula: `KL nhựa TT + Nhựa Lỗi = Nhựa TT (${fmt(nhuaTtKg, 4) ?? 0}) + Nhựa Lỗi (${fmt(nhuaLoiKg, 4) ?? 0}) = ${fmt(nhuaTtPlusLoiKg, 4) ?? 0} kg`,
      columns: [
        { key: 'chiTieu', label: 'Chỉ tiêu' },
        { key: 'congThuc', label: 'Công thức' },
        { key: 'giaTri', label: 'Giá trị (kg)', align: 'right' }
      ],
      rows: [
        {
          chiTieu: 'Tổng nhựa thành phẩm',
          congThuc: 'Banner «Tổng hợp nhựa» · Tổng nhựa thành phẩm',
          giaTri: fmt(tpHeader, 2)
        },
        {
          chiTieu: 'Tổng nhựa lỗi',
          congThuc: 'Banner «Tổng hợp nhựa» · Tổng nhựa lỗi',
          giaTri: fmt(loiHeader, 2)
        },
        {
          chiTieu: 'Tỉ lệ TB thực tế (%)',
          congThuc: 'Cột «Tỉ lệ TB thực tế (%)» trên bảng tỉ lệ trộn',
          giaTri: tiLeTbText
        },
        {
          chiTieu: 'Nhựa TT (dòng này)',
          congThuc: nhuaTtFormula,
          giaTri: fmt(nhuaTtKg, 2)
        },
        {
          chiTieu: 'Nhựa Lỗi (dòng này)',
          congThuc: nhuaLoiFormula,
          giaTri: fmt(nhuaLoiKg, 2)
        },
        {
          chiTieu: 'KL nhựa TT + Nhựa Lỗi',
          congThuc: 'Nhựa TT + Nhựa Lỗi',
          giaTri: fmt(nhuaTtPlusLoiKg, 2)
        }
      ]
    };
  }

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
      case 'thuc_tron':
        return input.line.mixingShiftMaterialKg === null ||
          input.line.mixingShiftMaterialKg === undefined
          ? '—'
          : `${roundQty(input.line.mixingShiftMaterialKg, 4)} kg`;
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
      case 'kl_nhua_tt_loi':
        return `${roundQty(input.line.klThucTePlusLoiKg, 4)} kg`;
      default:
        return '—';
    }
  };

  const previousShiftNote =
    'Tỉ lệ TB thực tế = KL NVL trên danh sách trộn ÷ tổng KL trộn ca × 100';

  const xuatTrongCaFormula = `Xuất trong ngày = tổng KL phiếu xuất kho NVL của mã này (ca đang chọn) = ${roundQty(
    input.line.xuatTrongCaKg, 4
  )} kg`;

  const tiLeThucTePercentFormula = `${previousShiftNote} (${
    input.line.tiLeThucTeTbPercent !== null && input.line.tiLeThucTeTbPercent !== undefined
      ? `${roundQty(input.line.tiLeThucTeTbPercent, 4)}%`
      : input.line.tiLeDinhMucPercent !== null && input.line.tiLeDinhMucPercent !== undefined
        ? `${roundQty(input.line.tiLeDinhMucPercent, 4)}%`
        : '—'
  }).`;

  const isMixingMetric = input.metric === 'ti_le_thuc_te' || input.metric === 'thuc_tron';
  const isXuatMetric = input.metric === 'trong_luong_da_tron' || input.metric === 'thuc_dung';
  const isTonDauMetric = input.metric === 'ton_dau' || input.metric === 'thuc_dung';
  const isTonCuoiMetric = input.metric === 'ton_cuoi' || input.metric === 'thuc_dung';

  const xuatRows: Array<Record<string, string | number | null | undefined>> = [];
  if (isXuatMetric && Array.isArray(input.warehouseMovements)) {
    const materials = input.materials || [];
    for (const movement of input.warehouseMovements) {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
      if (
        !matchesShiftSummaryBucket(
          header.ngay,
          header.shift,
          movement.slipDate,
          movement.shift,
          shiftOptions
        )
      ) {
        continue;
      }
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

  const thucTronFormula =
    input.line.mixingShiftMaterialKg !== null && input.line.mixingShiftMaterialKg !== undefined
      ? `Thực trộn = tổng KL thực tế NVL trên danh sách báo cáo phối trộn (ngày+ca+máy) = ${roundQty(
          input.line.mixingShiftMaterialKg,
          4
        )} kg`
      : 'Thực trộn = tổng KL thực tế NVL trên danh sách báo cáo phối trộn (ngày+ca+máy).';

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
    if (useNnsTonDauSource && input.line.tonDauFromNnsTron && input.line.nnsTronTonDauKg !== null) {
      const nnsAllocatedKg = roundQty(
        Math.max(0, input.line.tonDauKg - input.line.directTonDauKg),
        4
      );
      const tiLeLabel =
        input.line.tiLeDinhMucPercent !== null
          ? roundQty(input.line.tiLeDinhMucPercent, 4)
          : nnsAllocatedKg > 0 && input.line.nnsTronTonDauKg > 0
            ? roundQty((nnsAllocatedKg / input.line.nnsTronTonDauKg) * 100, 4)
            : '—';
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
        bonTron: `NNS-TRON × ${tiLeLabel}%`,
        chuaTron: null,
        tonNgoai: null,
        weightKg: nnsAllocatedKg,
        reportId: 'nns-tron-allocated'
      });
      if (input.line.directTonDauKg > 0) {
        tonRows.push({
          loai: 'Tồn trực tiếp theo mã',
          ngay: header.ngay,
          ca: header.shift,
          may: header.machine,
          maNvl: input.line.materialCode,
          tenNvl: input.line.materialName,
          donVi: input.line.unit || 'kg',
          soLuongTon: null,
          trongMay: null,
          bonTron: 'Ghi nhận trực tiếp trên phiếu tồn đầu',
          chuaTron: null,
          tonNgoai: null,
          weightKg: roundQty(input.line.directTonDauKg, 4),
          reportId: 'nns-tron-direct'
        });
      }
    }
  };
  if (isTonDauMetric) pushTonRows('dau_ca');
  if (isTonCuoiMetric) pushTonRows('cuoi_ca');

  if (input.metric === 'ton_dau' || input.metric === 'ton_cuoi') {
    const tonDauFormula =
      input.metric === 'ton_dau' &&
      input.line.tonDauFromNnsTron &&
      input.line.nnsTronTonDauKg !== null
        ? `Tồn đầu = NNS-TRON (${roundQty(input.line.nnsTronTonDauKg, 4)} kg) × Tỉ lệ ĐM (${roundQty(
            input.line.tiLeDinhMucPercent ??
              (input.line.tonDauKg - input.line.directTonDauKg > 0 && input.line.nnsTronTonDauKg > 0
                ? ((input.line.tonDauKg - input.line.directTonDauKg) / input.line.nnsTronTonDauKg) * 100
                : 0),
            4
          )}%)${input.line.directTonDauKg > 0 ? ` + Tồn trực tiếp (${roundQty(input.line.directTonDauKg, 4)} kg)` : ''} = ${roundQty(input.line.tonDauKg, 4)} kg`
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
      input.line.nnsTronTonDauKg !== null
        ? `Tồn đầu (${roundQty(input.line.tonDauKg, 4)} = NNS-TRON ${roundQty(
            input.line.nnsTronTonDauKg, 4
          )} × ${roundQty(
            input.line.tiLeDinhMucPercent ??
              (input.line.tonDauKg - input.line.directTonDauKg > 0 && input.line.nnsTronTonDauKg > 0
                ? ((input.line.tonDauKg - input.line.directTonDauKg) / input.line.nnsTronTonDauKg) * 100
                : 0),
            4
          )}%${
            input.line.directTonDauKg > 0
              ? ` + trực tiếp ${roundQty(input.line.directTonDauKg, 4)}`
              : ''
          })`
        : `Tồn đầu (${roundQty(input.line.tonDauKg, 4)})`;
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: `${xuatTrongCaFormula}. Thực dùng (kg) = Xuất trong ngày (${roundQty(
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

  const tiLeDinhMucFormula =
    input.line.tiLeDinhMucPercent !== null && input.line.tiLeDinhMucPercent !== undefined
      ? `Tỉ lệ ĐM (%) = tỉ lệ trộn cấu hình trên Danh sách máy (theo mã/tên NVL) = ${roundQty(
          input.line.tiLeDinhMucPercent,
          4
        )}%`
      : 'Tỉ lệ ĐM (%) = tỉ lệ trộn cấu hình trên Danh sách máy (theo mã/tên NVL). Chưa có tỉ lệ cho NVL này trên máy.';

  if (input.metric === 'ti_le_dinh_muc') {
    return {
      metric: input.metric,
      title,
      subtitle,
      valueLabel,
      valueText: formatValue(),
      formula: tiLeDinhMucFormula,
      columns: [
        { key: 'may', label: 'Máy' },
        { key: 'maNvl', label: 'Mã NVL' },
        { key: 'tenNvl', label: 'Tên NVL' },
        { key: 'tiLeDm', label: 'Tỉ lệ ĐM (%)', align: 'right' }
      ],
      rows: [
        {
          may: input.line.machine || '—',
          maNvl: input.line.materialCode || '—',
          tenNvl: input.line.materialName || '—',
          tiLeDm:
            input.line.tiLeDinhMucPercent !== null && input.line.tiLeDinhMucPercent !== undefined
              ? roundQty(input.line.tiLeDinhMucPercent, 4)
              : null
        }
      ]
    };
  }

  return {
    metric: input.metric,
    title,
    subtitle,
    valueLabel,
    valueText: formatValue(),
    formula:
      input.metric === 'ti_le_thuc_te'
        ? tiLeThucTePercentFormula
        : input.metric === 'thuc_tron'
          ? thucTronFormula
          : undefined,
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
      formula: `Xuất trong ngày lấy từ tab «Phiếu xuất kho» (ca đang chọn) = ${roundQty(
        input.line.baseXuatTrongCaKg, 4
      )} kg.${shareNote}`,
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

function emptyBbThucDungSectionTotals(): BbThucDungSectionTotals {
  return {
    lineCount: 0,
    thucTronTotal: 0,
    xuatCaTotal: 0,
    tonDauCaTotal: 0,
    tonCuoiCaTotal: 0,
    totalWeightKg: 0,
    klThucTePlusLoiTotal: 0,
    chenhLechTotal: 0
  };
}

function addBbThucDungSectionTotals(target: BbThucDungSectionTotals, row: BbThucDungLineRow) {
  target.lineCount += 1;
  target.thucTronTotal +=
    row.mixingShiftMaterialKg !== null &&
    row.mixingShiftMaterialKg !== undefined &&
    Number.isFinite(row.mixingShiftMaterialKg)
      ? row.mixingShiftMaterialKg
      : 0;
  target.xuatCaTotal += Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0;
  target.tonDauCaTotal += Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0;
  target.tonCuoiCaTotal += Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0;
  target.totalWeightKg += Number.isFinite(row.weightKg) ? row.weightKg : 0;
  target.klThucTePlusLoiTotal += Number.isFinite(row.klThucTePlusLoiKg) ? row.klThucTePlusLoiKg : 0;
  target.chenhLechTotal += Number.isFinite(row.chenhLechKg) ? row.chenhLechKg : 0;
}

export function groupBbThucDungLines(rows: BbThucDungLineRow[]): BbThucDungGroup[] {
  const map = new Map<string, BbThucDungGroup>();

  for (const row of rows) {
    const groupKey = row.orderCode.trim() || `unlinked|${row.ngay}|${row.shift}`;
    const existing = map.get(groupKey);
    if (!existing) {
      const mixingRatioTotals = emptyBbThucDungSectionTotals();
      const otherTotals = emptyBbThucDungSectionTotals();
      if (row.inMixingRatioTable) addBbThucDungSectionTotals(mixingRatioTotals, row);
      else addBbThucDungSectionTotals(otherTotals, row);
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
        thucTronTotal:
          row.mixingShiftMaterialKg !== null &&
          row.mixingShiftMaterialKg !== undefined &&
          Number.isFinite(row.mixingShiftMaterialKg)
            ? row.mixingShiftMaterialKg
            : 0,
        mixingRatioTotals,
        otherTotals,
        lines: [row]
      });
      continue;
    }
    existing.lineCount += 1;
    existing.totalWeightKg += Number.isFinite(row.weightKg) ? row.weightKg : 0;
    existing.tonDauCaTotal += Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0;
    existing.tonCuoiCaTotal += Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0;
    existing.xuatCaTotal += Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0;
    existing.thucTronTotal +=
      row.mixingShiftMaterialKg !== null &&
      row.mixingShiftMaterialKg !== undefined &&
      Number.isFinite(row.mixingShiftMaterialKg)
        ? row.mixingShiftMaterialKg
        : 0;
    if (row.inMixingRatioTable) addBbThucDungSectionTotals(existing.mixingRatioTotals, row);
    else addBbThucDungSectionTotals(existing.otherTotals, row);
    existing.lines.push(row);
  }

  return [...map.values()]
    .map(group => ({
      ...group,
      lines: [...group.lines].sort((a, b) => {
        if (a.inMixingRatioTable !== b.inMixingRatioTable) return a.inMixingRatioTable ? -1 : 1;
        return a.materialName.localeCompare(b.materialName, 'vi');
      })
    }))
    .sort((a, b) => {
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
  acceptanceReports: AcceptanceReport[];
  /** @deprecated Không còn dùng — lỗi hỏng lấy từ Báo cáo sản lượng. */
  damagedRecords?: WeighingRecord[];
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

    const loiHong = accumulateAcceptanceLoiHongForHeader({
      acceptanceReports: input.acceptanceReports,
      materials: input.materials,
      header,
      shiftOptions
    });
    tlNhuaKhongMangLoiHong = loiHong.tlNhuaKhongMangLoiHong;
    tlNhuaCucDauNongLoiHong = loiHong.tlNhuaCucDauNongLoiHong;
    tlNhuaDinhMangLoiHong = loiHong.tlNhuaDinhMangLoiHong;
    tlMangLoiHong = loiHong.tlMangLoiHong;
    tongTrongLuongLoiHong = loiHong.tongTrongLuongLoiHong;

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
  _ca: string,
  movements: ShiftSummaryWarehouseMovement[],
  _shiftSettings: ShiftSetting[],
  matchItem: (movement: ShiftSummaryWarehouseMovement) => boolean
) {
  let amount = 0;
  let qty = 0;
  for (const movement of movements) {
    if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') continue;
    if (!matchItem(movement)) continue;
    if (!matchesWarehouseExportDate(ngay, movement.slipDate)) continue;
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

/** Giá xuất kho NVL (đ/ĐVT) bình quân gia quyền theo ngày (không lọc ca), khớp mã/tên NVL. */
export function resolveBbMaterialExportUnitPrice(
  ngay: string,
  ca: string,
  movements: ShiftSummaryWarehouseMovement[],
  shiftSettings: ShiftSetting[],
  materialCode: string,
  materialName: string
) {
  const codeKey = normalizeMaterialCodeKey(materialCode);
  const nameKey = String(materialName || '')
    .trim()
    .toUpperCase();
  return resolveBbAvgExportUnitPrice(ngay, ca, movements, shiftSettings, movement => {
    const mCode = normalizeMaterialCodeKey(movement.itemCode || '');
    if (codeKey && mCode && codeKey === mCode) return true;
    if (!codeKey && nameKey) {
      return String(movement.itemName || '')
        .trim()
        .toUpperCase() === nameKey;
    }
    if (codeKey && !mCode && nameKey) {
      return String(movement.itemName || '')
        .trim()
        .toUpperCase() === nameKey;
    }
    return false;
  });
}

/**
 * Phân bổ kg nhựa hao hụt (Chênh lệch) theo tỉ lệ % từng NVL.
 * Ưu tiên Tỉ lệ TB thực tế (%); không có thì dùng ĐM máy. Chuẩn hóa theo tổng % các dòng.
 */
export function allocateBbNhuaHaoHutByRatioPercent(
  totalNhuaHaoHutKg: number,
  lines: Array<{ tiLeDinhMucPercent: number | null; tiLeThucTeTbPercent: number | null }>
): Array<number | null> {
  if (!Number.isFinite(totalNhuaHaoHutKg)) {
    return lines.map(() => null);
  }
  const percents = lines.map(line => {
    const fromTb = line.tiLeThucTeTbPercent;
    if (fromTb !== null && fromTb !== undefined && Number.isFinite(fromTb) && fromTb > 0) return fromTb;
    const fromDm = line.tiLeDinhMucPercent;
    if (fromDm !== null && fromDm !== undefined && Number.isFinite(fromDm) && fromDm > 0) return fromDm;
    return 0;
  });
  const sumPct = percents.reduce((sum, pct) => sum + pct, 0);
  if (sumPct <= 0) return lines.map(() => null);
  return percents.map(pct =>
    pct > 0 ? roundQty(totalNhuaHaoHutKg * (pct / sumPct), 4) : null
  );
}

/** Phân bổ tổng kg theo tỉ trọng Thực dùng (kg) — dùng cho Vật tư khác (không có % trộn). */
export function allocateBbKgByWeightShare(
  totalKg: number,
  lines: Array<{ weightKg: number }>
): Array<number | null> {
  if (!Number.isFinite(totalKg)) return lines.map(() => null);
  const weights = lines.map(line =>
    Number.isFinite(line.weightKg) && line.weightKg > 0 ? line.weightKg : 0
  );
  const sumW = weights.reduce((sum, w) => sum + w, 0);
  if (sumW <= 0) return lines.map(() => null);
  return weights.map(w => (w > 0 ? roundQty(totalKg * (w / sumW), 4) : null));
}

/**
 * Σ trọng lượng phiếu Báo cáo sản lượng · SP lỗi hoặc SP rác,
 * khớp ngày + ca (+ máy), chỉ mã SP thuộc tập mã trên bảng Sản lượng cùng lệnh.
 * `productCodeKeys` rỗng → 0 (bắt buộc lọc theo mã SP Sản lượng).
 */
export function sumBbAcceptanceLoiHongKgForHeaderByProductCodes(input: {
  acceptanceReports: AcceptanceReport[];
  header: { ngay: string; shift: string; machine: string };
  productCodeKeys: Iterable<string>;
  kind: 'sp_loi' | 'sp_rac';
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
  includeAllMachines?: boolean;
}): number {
  const keys = new Set(
    [...input.productCodeKeys]
      .map(code => normalizeProductCodeKey(code))
      .filter(Boolean)
  );
  if (keys.size === 0) return 0;

  const shiftOptions = getProductionShiftOptions((input.shiftSettings || []) as ShiftSetting[]);
  let total = 0;
  for (const report of input.acceptanceReports || []) {
    const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
    if (
      !matchesShiftSummaryBucket(
        input.header.ngay,
        input.header.shift,
        ngay,
        report.ca,
        shiftOptions
      )
    ) {
      continue;
    }
    const machineOk =
      machineValueMatchesFilter(input.header.machine, null, report.ma_may, report.ten_may) ||
      (isBbMachineText(input.header.machine) && isBbMachineText(report.ma_may, report.ten_may));
    if (!machineOk) continue;

    if (input.kind === 'sp_loi') {
      if (!isAcceptanceSpLoiLoai(report.loai_vat_tu)) continue;
    } else if (!isAcceptanceSpRacLoai(report.loai_vat_tu)) {
      continue;
    }

    const productCode = resolveAcceptanceReportProductCode(report.mat_hang);
    const productKey = normalizeProductCodeKey(productCode);
    if (!productKey || !keys.has(productKey)) continue;

    const kg = acceptanceReportWeightKg(report);
    if (kg > 0) total += kg;
  }
  return roundQty(total, 4);
}

/**
 * Cùng công thức `sumBbAcceptanceLoiHongKgForHeaderByProductCodes` nhưng đọc snapshot
 * `damagedRows` — FE không tự tính từ phiếu live.
 */
export function sumBbDamagedRowsLoiHongKgForHeaderByProductCodes(input: {
  damagedRows: BbDamagedGoodsLineRow[];
  header: { ngay: string; shift: string; machine: string; orderCode?: string };
  productCodeKeys: Iterable<string>;
  kind: 'sp_loi' | 'sp_rac';
  isInsulationMachine?: boolean;
}): number {
  const keys = new Set(
    [...input.productCodeKeys]
      .map(code => normalizeProductCodeKey(code))
      .filter(Boolean)
  );
  if (keys.size === 0) return 0;

  const scopedRows: BbDamagedGoodsLineRow[] = [];
  for (const row of input.damagedRows || []) {
    if (row.ngay && input.header.ngay && row.ngay !== input.header.ngay) continue;
    if (input.header.shift && row.shift && !shiftNamesMatch(row.shift, input.header.shift)) continue;
    if (
      input.header.machine &&
      row.machine &&
      !machineValueMatchesFilter(input.header.machine, null, row.machine)
    ) {
      continue;
    }
    const productKey = normalizeProductCodeKey(row.productCode);
    if (!productKey || !keys.has(productKey)) continue;
    scopedRows.push(row);
  }

  if (input.isInsulationMachine) {
    if (input.kind === 'sp_loi') {
      return resolveBbDamagedPlasticLoiHongKg(scopedRows, { isInsulationMachine: true });
    }
    return sumBbDamagedFilmScrapKg(scopedRows);
  }

  let total = 0;
  for (const row of scopedRows) {
    if (!isDamagedRowKind(row, input.kind)) continue;
    if (input.kind === 'sp_rac' && isBbDamagedFilmScrapRow(row)) continue;
    if (row.weightKg > 0) total += row.weightKg;
  }
  return roundQty(total, 4);
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
  acceptanceReports: AcceptanceReport[];
  /** @deprecated Không còn dùng — lỗi hỏng lấy từ Báo cáo sản lượng. */
  damagedRecords?: WeighingRecord[];
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

    const loiHong = accumulateAcceptanceLoiHongForHeader({
      acceptanceReports: input.acceptanceReports,
      materials: input.materials,
      header,
      shiftOptions
    });
    hangHongNhua = loiHong.hangHongNhua;
    hangHongMang = loiHong.hangHongMang;
    soCuonLoiHong = loiHong.soCuonLoiDinhHangHong;
    tongTrongLuongLoiHong = loiHong.tongTrongLuongLoiHong;
    tlNhuaKhongMangLoiHong = loiHong.tlNhuaKhongMangLoiHong;
    tlNhuaCucDauNongLoiHong = loiHong.tlNhuaCucDauNongLoiHong;
    tlNhuaDinhMangLoiHong = loiHong.tlNhuaDinhMangLoiHong;
    tlMangLoiHong = loiHong.tlMangLoiHong;

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
