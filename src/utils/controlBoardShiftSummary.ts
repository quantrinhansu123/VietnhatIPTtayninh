import type { AcceptanceReport } from '../components/AcceptanceReportForm';
import type { WeighingRecord } from './weighingRecords';
import {
  getWeighingDataRows,
  parseWeighingWeight,
  splitDamagedGoodsDefectWeights,
  sumWeighingRowTotalWeight
} from './weighingRecords';
import { roundNormWeight } from '../lib/mixingReportModel';
import type { MachineNvlMaterialType, MachineNvlSavedLine, MachineNvlSavedReport } from './machineNvlReports';
import {
  guessMachineNvlMaterialType,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal
} from './machineNvlReports';
import {
  getProductionShiftOptions,
  resolveShiftName,
  shiftNamesMatch,
  type ShiftOption,
  type ShiftSetting
} from './shiftSettings';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import { parseDateToIso } from './dateFormat';

export type ShiftSummaryWarehouseMovement = {
  id: string;
  slipCode: string;
  slipDate: string;
  shift: string;
  /** Máy trên phiếu XK (cột `may`) hoặc suy từ lệnh SX gắn trên lý do/ghi chú */
  machine?: string;
  slipType: 'nhap' | 'xuat';
  warehouseKind: 'nvl' | 'san_pham' | 'tai_che' | 'hang_hong' | 'hang_hoa' | 'cong_cu_dung_cu' | 'gia_cong';
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** Đơn giá từ phiếu xuất/nhập kho (đ/đơn vị) */
  unitPrice?: number;
  createdBy: string;
  /** Lý do phiếu — thường chứa mã lệnh SX đã chọn khi lập phiếu (`... | LSX-...`) */
  reason?: string;
  /** Ghi chú phiếu — có thể chứa mã lệnh SX (autofill cũ) */
  note?: string;
};

/** Token mã lệnh SX — ví dụ LSX-DH029 / LSX00094; không nhận mã ca HC1/12C1 hay "xuất sản xuất". */
export function looksLikeProductionOrderCode(token: string | undefined | null): boolean {
  const value = String(token || '').trim();
  if (value.length < 3 || /\s/.test(value)) return false;
  // Mã ca sản xuất thường gặp trong lý do phiếu — không phải mã lệnh.
  if (/^(HC|12C|CA)\d{1,2}$/i.test(value)) return false;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value)) return false;
  // Ưu tiên mã lệnh dạng LSX...
  if (/^LSX[\w\-]*\d[\w\-]*$/i.test(value)) return true;
  // Token sau `|` có thể là mã lệnh khác: chữ + số, dài hơn mã ca ngắn.
  if (value.length < 5) return false;
  return /[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value);
}

/** Tách token mã lệnh từ chuỗi (ưu tiên phần sau `|`; quét pattern LSX trong ghi chú). */
export function parseProductionOrderCodeTokens(value: string | undefined | null): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const tokens: string[] = [];
  const pushToken = (token: string) => {
    const cleaned = token.trim().replace(/^[(\[{<'"]+|[)\]}>'",.;:]+$/g, '');
    if (looksLikeProductionOrderCode(cleaned)) tokens.push(cleaned);
  };

  // Phần sau `|` là danh sách mã lệnh đã gắn có chủ đích.
  if (raw.includes('|')) {
    for (const segment of raw.split('|').slice(1)) {
      for (const part of segment.split(/[,;|/]+/)) {
        pushToken(part);
      }
    }
  }

  // Ghi chú autofill cũ: "... lệnh SX (LSX-DH029, LSX-DH028)."
  const patternMatches = raw.match(/\bLSX[\w\-]*/gi) || [];
  for (const match of patternMatches) {
    pushToken(match);
  }

  return [...new Set(tokens)];
}

/** Lấy mã lệnh liên thông từ ly_do + ghi_chu phiếu XK. */
export function extractLinkedProductionOrderCodes(
  ...parts: Array<string | undefined | null>
): string[] {
  const codes: string[] = [];
  for (const part of parts) {
    for (const token of parseProductionOrderCodeTokens(part)) {
      codes.push(token);
    }
  }
  return [...new Set(codes)];
}

/** Bỏ hậu tố ` | LSX-...` khỏi lý do để hiển thị/sửa. */
export function stripProductionOrderCodesFromReason(reason: string | undefined | null): string {
  const raw = String(reason || '').trim();
  if (!raw || !raw.includes('|')) return raw;
  const head = raw.split('|')[0]?.trim() || '';
  return head;
}

/** Gắn mã lệnh vào ly_do dạng `lý do | LSX-A, LSX-B`. */
export function composeReasonWithProductionOrderCodes(
  reason: string | undefined | null,
  codes: string[]
): string {
  const base = stripProductionOrderCodesFromReason(reason);
  const uniqueCodes = [...new Set(codes.map(code => String(code || '').trim()).filter(Boolean))];
  if (uniqueCodes.length === 0) return base;
  const suffix = uniqueCodes.join(', ');
  return base ? `${base} | ${suffix}` : suffix;
}

/** Phiếu có gắn mã lệnh (parse được từ reason/note) khớp `orderCode` không. */
export function movementLinksProductionOrderCode(
  movement: Pick<ShiftSummaryWarehouseMovement, 'reason' | 'note' | 'slipCode' | 'itemCode' | 'itemName' | 'createdBy'>,
  orderCode: string
): boolean {
  const code = String(orderCode || '').trim();
  if (!code) return false;
  const upper = code.toUpperCase();

  const linked = extractLinkedProductionOrderCodes(movement.reason, movement.note).map(item =>
    item.toUpperCase()
  );
  if (linked.length > 0) return linked.includes(upper);

  const hay = `${movement.reason || ''} ${movement.note || ''} ${movement.slipCode || ''} ${movement.createdBy || ''} ${movement.itemName || ''} ${movement.itemCode || ''}`
    .toUpperCase();
  return hay.includes(upper);
}

/** Phiếu đã khai báo ít nhất một mã lệnh parse được (không phải free-text thuần). */
export function movementHasLinkedProductionOrderCodes(
  movement: Pick<ShiftSummaryWarehouseMovement, 'reason' | 'note'>
): boolean {
  return extractLinkedProductionOrderCodes(movement.reason, movement.note).length > 0;
}

/** Token máy từ cột `may` phiếu + máy lệnh SX gắn trên lý do/ghi chú (giống lịch sử XK). */
export function resolveWarehouseMovementMachineCandidates(
  movement: Pick<ShiftSummaryWarehouseMovement, 'machine' | 'reason' | 'note'>,
  productionOrders: Array<{ code: string; machine?: string; position?: string }>,
  resolveOrderMachineLabel?: (order: { code: string; machine?: string; position?: string }) => string
): string[] {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return;
    for (const part of raw.split(/[,;/|]+/)) {
      const token = part.trim();
      if (token && token !== '-') out.push(token);
    }
  };

  push(movement.machine);
  const orderByCode = new Map(
    productionOrders.map(order => [String(order.code || '').trim().toUpperCase(), order] as const)
  );
  for (const code of extractLinkedProductionOrderCodes(movement.reason, movement.note)) {
    const order = orderByCode.get(code.trim().toUpperCase());
    if (!order) continue;
    push(order.machine);
    push(order.position);
    if (resolveOrderMachineLabel) push(resolveOrderMachineLabel(order));
  }
  return [...new Set(out)];
}

export type ShiftSummaryFilterSources = {
  shiftSettings: ShiftSetting[];
  productionOrders: Array<{ startDate: string; shift: string; staff: string; machine?: string; position?: string }>;
  mixingReports: Array<{ ngay: string; ca: string; nhan_su: string; ma_may?: string; ten_may?: string }>;
  warehouseMovements: Array<{ slipDate: string; shift: string; createdBy: string }>;
  machineNvlReports: Array<{ ngay: string; ca: string; nhanSu: string; maMay?: string; tenMay?: string }>;
  weighingRecords: Array<{
    productionDate: string;
    reportDate: string;
    shiftName: string;
    worker1: string;
    worker2: string;
    machineName?: string;
  }>;
  acceptanceReports?: Array<{ ngay: string; ca: string; ma_may?: string; ten_may?: string }>;
};

export type ControlBoardShiftSummaryRow = {
  key: string;
  ngay: string;
  ca: string;
  slHang: number;
  khoiLuongHang: number;
  slHangThucTe: number;
  khoiLuongHangThucTe: number;
  khoiLuongNhuaTp: number;
  hangHong: number;
  hangHongNhua: number;
  hangHongMang: number;
  khoiLuongNpl: number;
  khoiLuongMangXuat: number;
  khoiLuongLoiXuatKho: number;
  khoiLuongTuiXuatKho: number;
  khoiLuongLoi: number;
  khoiLuongMang: number;
  tonDauCa: number;
  tonDauCaNhua: number;
  tonDauCaMang: number;
  tonDauCaLoi: number;
  tonDauCaTui: number;
  tonCuoiCa: number;
  tonCuoiCaNhua: number;
  tonCuoiCaMang: number;
  tonCuoiCaLoi: number;
  tonCuoiCaTui: number;
  tongNhuaThucDung: number;
  tongMangThucDung: number;
  loiThucDung: number;
  tuiThucDung: number;
  tongThucDung: number;
  tongVatLieu: number;
  chenhLech: number;
  tongTrongLuongXuatKho: number;
  tongTrongLuongTonDauCa: number;
  tongTrongLuongTonCuoiCa: number;
  slDatThucTeNhapKho: number;
  tlNhuaTpNhapKho: number;
  tlMangTpNhapKho: number;
  tlTuiBaoBiNhapKho: number;
  tlLoiTpNhapKho: number;
  tongTpNhapKho: number;
  tlNhuaKhongMangLoiHong: number;
  tlNhuaCucDauNongLoiHong: number;
  tlNhuaDinhMangLoiHong: number;
  tlMangLoiHong: number;
  soCuonLoiDinhHangHong: number;
  tongTrongLuongLoiHong: number;
  /** Tổng trọng lượng nhập kho = Tổng TP nhập kho + Tổng trọng lượng lỗi hỏng */
  tongTrongLuongNhapKho: number;
  /** Chênh lệch = Tổng trọng lượng nhập kho − Tổng thực dùng */
  chenhLechTrongLuongNhapXuat: number;
  /** Tỉ lệ chênh lệch trọng lượng (%) = Chênh lệch / Tổng trọng lượng nhập kho × 100 */
  tiLeChenhLechTrongLuong: number;
  /** Tỉ lệ lỗi hỏng định mức (%) */
  tiLeLoiHongDinhMuc: number;
  /** Tỉ lệ lỗi hỏng thực tế (%) = TL lỗi hỏng / (Tổng TP nhập kho + TL lỗi hỏng) × 100 */
  tiLeLoiHong: number;
  /** Lệch lỗi hỏng so với định mức (điểm %) */
  lechLoiHongVsDinhMuc: number;
  /** Giá trị lỗ/lãi nhựa (kg chênh lệch nhựa) */
  giaTriLoLaiNhua: number;
  /** Giá trị lỗ/lãi màng (kg) */
  giaTriLoLaiMang: number;
};

type ProductRef = {
  code: string;
  totalWeight: string;
};

type MaterialRef = {
  code: string;
  totalWeight: string;
};

type ProductionOrderRef = {
  startDate: string;
  shift: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  products: Array<{ productCode: string; productName: string; quantity: string; unit: string }>;
};

type SummaryBucket = {
  ngay: string;
  ca: string;
  slHang: number;
  khoiLuongHang: number;
  slHangThucTe: number;
  khoiLuongHangThucTe: number;
  hangHong: number;
  hangHongNhua: number;
  hangHongMang: number;
  tlNhuaKhongMangLoiHong: number;
  tlNhuaCucDauNongLoiHong: number;
  tlNhuaDinhMangLoiHong: number;
  tlMangLoiHong: number;
  soCuonLoiDinhHangHong: number;
  tongTrongLuongLoiHong: number;
  khoiLuongNpl: number;
  khoiLuongMangXuat: number;
  khoiLuongLoiXuatKho: number;
  khoiLuongTuiXuatKho: number;
  khoiLuongLoi: number;
  tonDauCaNhua: number;
  tonDauCaMang: number;
  tonDauCaLoi: number;
  tonDauCaTui: number;
  tonCuoiCaNhua: number;
  tonCuoiCaMang: number;
  tonCuoiCaLoi: number;
  tonCuoiCaTui: number;
  slDatThucTeNhapKho: number;
};

/** KL bì (kg) = số thành phẩm thực tế × 0,16 kg */
export const KHOI_LUONG_MANG_KG_PER_UNIT = 0.16;

/** TL túi bao bì nhập kho (kg) = SL đạt thực tế × 0,2 kg */
export const TL_TUI_BAO_BI_KG_PER_UNIT = 0.2;

/** TL lõi thành phẩm (kg) = SL đạt thực tế × 1 kg */
export const TL_LOI_TP_KG_PER_UNIT = 1;

/** KL nhựa TP (kg) = (KL hàng TT − KL lõi − KL bì) × 0,75 */
export const KHOI_LUONG_NHUA_TP_FACTOR = 0.75;

/** Tỉ lệ lỗi hỏng định mức mặc định (%) */
export const TI_LE_LOI_HONG_DINH_MUC_PERCENT = 2;

export function computePercentRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return roundNormWeight((numerator / denominator) * 100);
}

export function computeShiftSummarySanLuongMetrics(input: {
  tongTpNhapKho: number;
  tongTrongLuongLoiHong: number;
  tongThucDung: number;
  chenhLechNhua: number;
  tongMangThucDung: number;
  tlMangTpNhapKho: number;
  hangHongMang: number;
  tiLeLoiHongDinhMuc?: number;
}) {
  const tongTpNhapKho = roundNormWeight(input.tongTpNhapKho);
  const tongTrongLuongLoiHong = roundNormWeight(input.tongTrongLuongLoiHong);
  const tongTrongLuongNhapKho = roundNormWeight(tongTpNhapKho + tongTrongLuongLoiHong);
  const tongThucDung = roundNormWeight(input.tongThucDung);
  const chenhLechTrongLuongNhapXuat = roundNormWeight(tongTrongLuongNhapKho - tongThucDung);
  const tiLeChenhLechTrongLuong = computePercentRatio(chenhLechTrongLuongNhapXuat, tongTrongLuongNhapKho);
  const tiLeLoiHongDinhMuc = input.tiLeLoiHongDinhMuc ?? TI_LE_LOI_HONG_DINH_MUC_PERCENT;
  const tiLeLoiHong = computePercentRatio(tongTrongLuongLoiHong, tongTrongLuongNhapKho);
  const lechLoiHongVsDinhMuc = roundNormWeight(tiLeLoiHong - tiLeLoiHongDinhMuc);
  const giaTriLoLaiNhua = roundNormWeight(input.chenhLechNhua);
  const giaTriLoLaiMang = roundNormWeight(
    input.tongMangThucDung - input.tlMangTpNhapKho - input.hangHongMang
  );
  return {
    tongTrongLuongNhapKho,
    chenhLechTrongLuongNhapXuat,
    tiLeChenhLechTrongLuong,
    tiLeLoiHongDinhMuc,
    tiLeLoiHong,
    lechLoiHongVsDinhMuc,
    giaTriLoLaiNhua,
    giaTriLoLaiMang
  };
}

export function computeKhoiLuongNhuaTp(
  khoiLuongHangThucTe: number,
  khoiLuongLoi: number,
  khoiLuongMang: number
) {
  return roundNormWeight(
    (khoiLuongHangThucTe - khoiLuongLoi - khoiLuongMang) * KHOI_LUONG_NHUA_TP_FACTOR
  );
}

function parseFlexibleNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

// Dùng cho "Tổng kg" định mức nhỏ (vd 0.238 kg/m2) và cũng hỗ trợ kiểu VN (1.250,5)
function parseKgFactor(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseOrderQuantity(value: string) {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIsoDate(value: string) {
  return parseDateToIso(value);
}

function normalizeShiftKey(raw: string, shiftOptions: ShiftOption[]) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return 'Chưa phân ca';
  if (shiftOptions.length === 0) return trimmed;
  return resolveShiftName(trimmed, shiftOptions);
}

function bucketKey(ngay: string, ca: string, shiftOptions: ShiftOption[]) {
  const date = parseIsoDate(ngay);
  if (!date) return '';
  return `${date}|${normalizeShiftKey(ca, shiftOptions)}`;
}

function getOrCreateBucket(
  map: Map<string, SummaryBucket>,
  ngay: string,
  ca: string,
  shiftOptions: ShiftOption[]
) {
  const key = bucketKey(ngay, ca, shiftOptions);
  if (!key) return null;
  const existing = map.get(key);
  if (existing) return existing;

  const bucket: SummaryBucket = {
    ngay: parseIsoDate(ngay),
    ca: normalizeShiftKey(ca, shiftOptions),
    slHang: 0,
    khoiLuongHang: 0,
    slHangThucTe: 0,
    khoiLuongHangThucTe: 0,
    hangHong: 0,
    hangHongNhua: 0,
    hangHongMang: 0,
    tlNhuaKhongMangLoiHong: 0,
    tlNhuaCucDauNongLoiHong: 0,
    tlNhuaDinhMangLoiHong: 0,
    tlMangLoiHong: 0,
    soCuonLoiDinhHangHong: 0,
    tongTrongLuongLoiHong: 0,
    khoiLuongNpl: 0,
    khoiLuongMangXuat: 0,
    khoiLuongLoiXuatKho: 0,
    khoiLuongTuiXuatKho: 0,
    khoiLuongLoi: 0,
    tonDauCaNhua: 0,
    tonDauCaMang: 0,
    tonDauCaLoi: 0,
    tonDauCaTui: 0,
    tonCuoiCaNhua: 0,
    tonCuoiCaMang: 0,
    tonCuoiCaLoi: 0,
    tonCuoiCaTui: 0,
    slDatThucTeNhapKho: 0
  };
  map.set(key, bucket);
  return bucket;
}

function getOrderProductLines(order: ProductionOrderRef) {
  if (order.products.length > 0) return order.products;
  if (!order.productCode && !order.productName) return [];
  return [
    {
      productCode: order.productCode,
      productName: order.productName,
      quantity: order.quantity,
      unit: order.unit
    }
  ];
}

function findProductWeight(products: ProductRef[], productCode: string) {
  const codeKey = productCode.trim().toLowerCase();
  if (!codeKey) return null;
  const match = products.find(product => product.code.trim().toLowerCase() === codeKey);
  if (!match) return null;
  return parseFlexibleNumber(match.totalWeight);
}

function isKgUnit(unit: string) {
  const normalized = unit
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    normalized === 'kg' ||
    normalized === 'kgs' ||
    normalized === 'kg.' ||
    normalized === 'kilogram' ||
    normalized === 'kilograms' ||
    normalized === 'kilogam'
  ) {
    return true;
  }
  return normalized.startsWith('kg/') || normalized.startsWith('kg ');
}

/** ĐVT cuộn trên phiếu báo cáo sản lượng (bao_cao_nghiem_thu). */
export function isCuonUnit(unit: string) {
  const normalized = unit
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'cuon' || normalized.startsWith('cuon ') || normalized.includes(' cuon');
}

/** SL cuộn nguyên từ báo cáo sản lượng — bỏ ĐVT khác (vd kg); ĐVT trống coi như cuộn. */
export function acceptanceRollQuantity(report: { so_luong: number | null; don_vi?: string | null }) {
  if (report.so_luong === null || !Number.isFinite(report.so_luong) || report.so_luong <= 0) return 0;
  const unit = String(report.don_vi ?? '').trim();
  if (unit && !isCuonUnit(unit)) return 0;
  return Math.round(report.so_luong);
}

function isM2Unit(unit: string) {
  const normalized = unit
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'm2' || normalized === 'm^2' || normalized === 'm²' || normalized === 'm 2';
}

function splitShiftLabels(label: string) {
  return String(label || '')
    .split(/[,;+]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeWarehouseItemHay(code: string, name: string) {
  return `${code} ${name}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isWarehouseCoreExportItem(code: string, name: string) {
  const hay = normalizeWarehouseItemHay(code, name);
  if (!hay) return false;
  // «Nhựa tái lõi từ SX» (NVN) là hạt nhựa, không phải lõi quấn giấy L20cm / L30cm.
  if (hay.startsWith('nhua') || /(?:^|\s)nhua(?:\s|$)/.test(hay)) return false;

  const codeKey = String(code || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/^l\d/.test(codeKey) || /^loi(\b|$|-|_|\d)/.test(codeKey)) return true;

  return (
    /\bloi\b/.test(hay) ||
    hay.startsWith('loi ') ||
    hay.startsWith('loi-') ||
    hay.startsWith('loi_')
  );
}

export function isWarehouseBagExportItem(code: string, name: string) {
  const hay = normalizeWarehouseItemHay(code, name);
  return (
    hay.includes('tui') ||
    hay.includes('bao bi') ||
    hay.includes('tai nilon') ||
    hay.includes('bi nilon')
  );
}

export function isWarehouseFilmItem(code: string, name: string, unit: string) {
  if (isM2Unit(unit)) return true;
  const hay = normalizeWarehouseItemHay(code, name);
  return hay.includes('mang') || hay.includes('film');
}

function sumWarehouseSanPhamNhapLineKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveProductKgFactor: (unit: string, code: string) => number | null
) {
  if (movement.warehouseKind !== 'san_pham' || movement.slipType !== 'nhap') return 0;
  const qty = movement.quantity;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const unit = movement.unit || '';
  if (isKgUnit(unit)) return qty;
  const factor = resolveProductKgFactor(unit, movement.itemCode || '');
  return factor !== null && factor > 0 ? qty * factor : 0;
}

export function resolveWarehouseSanPhamNhapSl(
  movement: Pick<ShiftSummaryWarehouseMovement, 'warehouseKind' | 'slipType' | 'itemCode' | 'itemName' | 'quantity'>
) {
  if (movement.warehouseKind !== 'san_pham' || movement.slipType !== 'nhap') return 0;
  const qty = movement.quantity;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const code = movement.itemCode || '';
  const name = movement.itemName || '';
  // Chỉ bỏ lõi / túi bao bì phụ; thành phẩm (kể cả SP màng) vẫn tính SL đạt
  if (isWarehouseCoreExportItem(code, name) || isWarehouseBagExportItem(code, name)) return 0;
  return qty;
}

export function splitWarehouseSanPhamNhapLine(
  movement: Pick<ShiftSummaryWarehouseMovement, 'itemCode' | 'itemName' | 'unit' | 'quantity'>,
  kg: number
) {
  const code = movement.itemCode || '';
  const name = movement.itemName || '';
  const unit = movement.unit || '';
  const qty = resolveWarehouseSanPhamNhapSl({
    warehouseKind: 'san_pham',
    slipType: 'nhap',
    itemCode: code,
    itemName: name,
    quantity: movement.quantity
  });
  if (isWarehouseCoreExportItem(code, name)) {
    return { sl: 0, nhua: 0, mang: 0, loi: kg, tui: 0 };
  }
  if (isWarehouseBagExportItem(code, name)) {
    return { sl: 0, nhua: 0, mang: 0, loi: 0, tui: kg };
  }
  if (isWarehouseFilmItem(code, name, unit)) {
    return { sl: qty, nhua: 0, mang: kg, loi: 0, tui: 0 };
  }
  return { sl: qty, nhua: kg, mang: 0, loi: 0, tui: 0 };
}

export function resolveShiftSummarySanPhamNhapLineKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveProductKgFactor: (unit: string, code: string) => number | null
) {
  return sumWarehouseSanPhamNhapLineKg(movement, resolveProductKgFactor);
}

function sumWarehouseMovementExportKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveKgFactor: (unit: string, code: string, lineFactor: number | null | undefined) => number | null,
  fallbackFactor?: number
) {
  if (movement.warehouseKind !== 'nvl') return 0;
  if (movement.slipType !== 'xuat') return 0;
  const qty = movement.quantity;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const unit = movement.unit || '';
  // ĐVT kg → KL = SL, không nhân Tổng kg / định mức mặc định
  if (isKgUnit(unit)) return qty;
  const resolved = resolveKgFactor(unit, movement.itemCode || '', null);
  const factor = resolved !== null && resolved > 0 ? resolved : fallbackFactor ?? null;
  return factor !== null && factor > 0 ? qty * factor : 0;
}

function sumWarehouseMovementNplKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveKgFactor: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
) {
  if (movement.warehouseKind !== 'nvl') return 0;
  if (movement.slipType !== 'xuat') return 0;
  if (isWarehouseCoreExportItem(movement.itemCode || '', movement.itemName || '')) return 0;
  if (isWarehouseBagExportItem(movement.itemCode || '', movement.itemName || '')) return 0;
  const unit = movement.unit || '';
  if (isM2Unit(unit)) return 0;
  if (!isKgUnit(unit)) return 0;
  const qty = movement.quantity;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return qty;
}

function sumWarehouseMovementMangKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveKgFactor: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
) {
  if (movement.warehouseKind !== 'nvl') return 0;
  if (movement.slipType !== 'xuat') return 0;
  const unit = movement.unit || '';
  if (!isM2Unit(unit)) return 0;
  const qty = movement.quantity;
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const factor = resolveKgFactor(unit, movement.itemCode || '', null);
  return factor !== null && factor > 0 ? qty * factor : 0;
}

function sumWarehouseMovementLoiXuatKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveKgFactor: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
) {
  if (!isWarehouseCoreExportItem(movement.itemCode || '', movement.itemName || '')) return 0;
  return sumWarehouseMovementExportKg(movement, resolveKgFactor, TL_LOI_TP_KG_PER_UNIT);
}

function sumWarehouseMovementTuiXuatKg(
  movement: ShiftSummaryWarehouseMovement,
  resolveKgFactor: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
) {
  if (!isWarehouseBagExportItem(movement.itemCode || '', movement.itemName || '')) return 0;
  return sumWarehouseMovementExportKg(movement, resolveKgFactor, TL_TUI_BAO_BI_KG_PER_UNIT);
}

type MachineNvlMaterialSplit = { nhua: number; mang: number; loi: number; tui: number };

/** Ưu tiên loai_vat_tu người dùng chọn; không có thì đoán từ mã/tên/ĐVT. */
export function resolveMachineNvlLineMaterialType(line: MachineNvlSavedLine): MachineNvlMaterialType {
  if (line.loaiVatTu) return line.loaiVatTu;
  if (isWarehouseCoreExportItem(line.maNvl || '', line.tenNvl || '')) return 'loi';
  if (isWarehouseBagExportItem(line.maNvl || '', line.tenNvl || '')) return 'bao_bi';
  return guessMachineNvlMaterialType(line.maNvl || '', line.tenNvl || '', line.donVi || '');
}

/**
 * KL 1 dòng NVL đầu/cuối ca, ưu tiên hệ số quy đổi kg lưu trên chính dòng báo cáo
 * ("Kg quy đổi" nhập tay khi kiểm kê); nếu dòng chưa nhập hệ số (thường gặp với NVL
 * đơn vị m2 như màng vì hay bị bỏ trống) thì rơi về hệ số "Tổng trọng lượng" khai báo
 * trong danh mục NVL — cùng cách quy đổi đã dùng cho phiếu xuất kho NVL.
 * Lõi / bao bì không có hệ số → mặc định 1 kg/đơn vị (khối lượng = SL tồn).
 */
export function computeMachineNvlLineKg(
  line: MachineNvlSavedLine,
  reportKind: 'dau_ca' | 'cuoi_ca',
  resolveKgFactor?: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
) {
  const materialType = resolveMachineNvlLineMaterialType(line);

  const componentQty =
    (line.soLuongTrongMay ?? 0) +
    (line.soLuongTrongBonTron ?? 0) +
    (line.soLuongNlChuaTron ?? 0) +
    (line.soLuongTonNgoai ?? 0);
  const base =
    reportKind === 'dau_ca'
      ? line.soLuongTon > 0
        ? line.soLuongTon
        : componentQty
      : Number.isFinite(line.soLuongTon) && line.soLuongTon > 0
        ? line.soLuongTon
        : componentQty;

  if (base <= 0) return 0;

  // ĐVT đã là kg → KL = SL, không nhân Tổng kg / định mức
  if (isKgUnit(line.donVi || '')) return base;

  let factor: number | null = null;
  if (resolveKgFactor) {
    factor = resolveKgFactor(line.donVi || '', line.maNvl || '', line.trongLuongQuyDoiKg);
  } else if (reportKind === 'dau_ca') {
    return sumMachineNvlDauCaLineTotal(line);
  } else {
    return sumMachineNvlCuoiCaLineTotal(line);
  }

  // Lõi / bao bì (cái/túi…): nếu thiếu hệ số quy đổi thì lấy 1 kg/đơn vị
  if ((factor === null || factor <= 0) && (materialType === 'loi' || materialType === 'bao_bi')) {
    factor = TL_LOI_TP_KG_PER_UNIT;
  }
  if (factor === null || factor <= 0) return 0;

  return base * factor;
}

function splitMachineNvlLineByMaterial(
  line: MachineNvlSavedLine,
  reportKind: 'dau_ca' | 'cuoi_ca',
  resolveKgFactor?: (unit: string, code: string, lineFactor: number | null | undefined) => number | null
): MachineNvlMaterialSplit {
  const zero: MachineNvlMaterialSplit = { nhua: 0, mang: 0, loi: 0, tui: 0 };
  const materialType = resolveMachineNvlLineMaterialType(line);
  const kg = computeMachineNvlLineKg(line, reportKind, resolveKgFactor);
  if (kg <= 0) return zero;

  if (materialType === 'loi') return { ...zero, loi: kg };
  if (materialType === 'bao_bi') return { ...zero, tui: kg };
  if (materialType === 'mang') return { ...zero, mang: kg };
  return { ...zero, nhua: kg };
}

/** Tổng nhựa thực dùng = tồn đầu ca + xuất dùng − tồn cuối ca */
export function computeMaterialUsageKg(xuat: number, tonDauCa: number, tonCuoiCa: number) {
  return roundNormWeight(tonDauCa + xuat - tonCuoiCa);
}

/** TL nhựa TP = nhựa xuất dùng + tồn đầu ca nhựa − tồn cuối ca nhựa − 3 loại nhựa lỗi hỏng */
export function computeTlNhuaTpNhapKhoFromShiftSummary(input: {
  khoiLuongNpl: number;
  tonDauCaNhua: number;
  tonCuoiCaNhua: number;
  tlNhuaKhongMangLoiHong: number;
  tlNhuaCucDauNongLoiHong: number;
  tlNhuaDinhMangLoiHong: number;
}) {
  return roundNormWeight(
    input.khoiLuongNpl
      + input.tonDauCaNhua
      - input.tonCuoiCaNhua
      - input.tlNhuaDinhMangLoiHong
      - input.tlNhuaCucDauNongLoiHong
      - input.tlNhuaKhongMangLoiHong
  );
}

/** TL màng TP = màng xuất dùng + tồn đầu ca màng − tồn cuối ca màng − màng lỗi hỏng */
export function computeTlMangTpNhapKhoFromShiftSummary(input: {
  khoiLuongMangXuat: number;
  tonDauCaMang: number;
  tonCuoiCaMang: number;
  tlMangLoiHong: number;
}) {
  return roundNormWeight(
    input.khoiLuongMangXuat + input.tonDauCaMang - input.tonCuoiCaMang - input.tlMangLoiHong
  );
}

/** TL túi bao bì nhập kho (kg) = 0,2 × SL đạt thực tế */
export function computeTlTuiBaoBiNhapKhoFromShiftSummary(slDatThucTeNhapKho: number) {
  return roundNormWeight(slDatThucTeNhapKho * TL_TUI_BAO_BI_KG_PER_UNIT);
}

/** TL lõi thành phẩm (kg) = 1 × SL đạt thực tế */
export function computeTlLoiTpNhapKhoFromShiftSummary(slDatThucTeNhapKho: number) {
  return roundNormWeight(slDatThucTeNhapKho * TL_LOI_TP_KG_PER_UNIT);
}

export function matchesShiftSummaryBucket(
  bucketNgay: string,
  bucketCa: string,
  rowNgay: string,
  rowCa: string,
  shiftOptions: ShiftOption[]
) {
  const date = parseIsoDate(rowNgay);
  if (!date || date !== parseIsoDate(bucketNgay)) return false;
  const bucketShift = normalizeShiftKey(bucketCa, shiftOptions);
  const rowShiftParts = splitShiftLabels(rowCa);
  const candidates = rowShiftParts.length > 0 ? rowShiftParts : [rowCa];
  return candidates.some(
    part =>
      normalizeShiftKey(part, shiftOptions) === bucketShift || shiftNamesMatch(part, bucketCa)
  );
}

function compareSummaryRows(a: ControlBoardShiftSummaryRow, b: ControlBoardShiftSummaryRow, shiftOptions: ShiftOption[]) {
  const byDate = b.ngay.localeCompare(a.ngay);
  if (byDate !== 0) return byDate;

  const indexOf = (ca: string) => {
    const idx = shiftOptions.findIndex(option => shiftNamesMatch(ca, option.value));
    return idx === -1 ? 999 : idx;
  };

  const byShift = indexOf(a.ca) - indexOf(b.ca);
  if (byShift !== 0) return byShift;
  return a.ca.localeCompare(b.ca, 'vi');
}

export function buildControlBoardShiftSummary(input: {
  shiftSettings: ShiftSetting[];
  productionOrders: ProductionOrderRef[];
  products: ProductRef[];
  materials?: MaterialRef[];
  acceptanceReports: AcceptanceReport[];
  warehouseMovements?: ShiftSummaryWarehouseMovement[];
  weighingRecords: WeighingRecord[];
  damagedRecords?: WeighingRecord[];
  machineNvlReports?: MachineNvlSavedReport[];
  dateFrom?: string;
  dateTo?: string;
}): ControlBoardShiftSummaryRow[] {
  const shiftOptions = getProductionShiftOptions(input.shiftSettings);
  const map = new Map<string, SummaryBucket>();

  const inventoryTotalKgByCode = (() => {
    const m = new Map<string, number>();
    for (const material of input.materials ?? []) {
      const key = normalizeProductCodeKey(material.code);
      if (!key) continue;
      const totalKg = parseKgFactor(material.totalWeight);
      if (totalKg !== null && totalKg > 0) m.set(key, totalKg);
    }
    return m;
  })();

  const resolveKgFactor = (unit: string, code: string, lineFactor: number | null | undefined) => {
    // ĐVT kg → không nhân hệ số Tổng kg / định mức
    if (isKgUnit(unit)) return 1;
    if (lineFactor !== null && lineFactor !== undefined && Number.isFinite(lineFactor) && lineFactor > 0) {
      return lineFactor;
    }
    return inventoryTotalKgByCode.get(normalizeProductCodeKey(code)) ?? null;
  };

  const inRange = (ngay: string) => {
    const date = parseIsoDate(ngay);
    if (!date) return false;
    if (input.dateFrom && date < input.dateFrom) return false;
    if (input.dateTo && date > input.dateTo) return false;
    return true;
  };

  for (const order of input.productionOrders) {
    const ngay = parseIsoDate(order.startDate);
    if (!ngay || !inRange(ngay)) continue;

    const bucket = getOrCreateBucket(map, ngay, order.shift, shiftOptions);
    if (!bucket) continue;

    for (const line of getOrderProductLines(order)) {
      const qty = parseOrderQuantity(line.quantity);
      if (qty <= 0) continue;
      bucket.slHang += qty;

      const unitWeight = findProductWeight(input.products, line.productCode);
      if (unitWeight !== null && unitWeight > 0) {
        bucket.khoiLuongHang += unitWeight * qty;
      }
    }
  }

  for (const report of input.acceptanceReports) {
    if (!inRange(report.ngay)) continue;
    const bucket = getOrCreateBucket(map, report.ngay, report.ca, shiftOptions);
    if (!bucket) continue;
    // Số lượng hàng TT / SL đạt / KL lõi — chỉ SL cuộn nguyên từ báo cáo sản lượng
    const rollQty = acceptanceRollQuantity(report);
    if (rollQty > 0) {
      bucket.slHangThucTe += rollQty;
      bucket.slDatThucTeNhapKho += rollQty;
      bucket.khoiLuongLoi += rollQty;
    }

    // Khối lượng hàng TT — lấy từ báo cáo sản lượng: Số lượng * định mức kg của sản phẩm
    const unitWeight = findProductWeight(input.products, report.mat_hang);
    if (unitWeight !== null && unitWeight > 0 && rollQty > 0) {
      bucket.khoiLuongHangThucTe += unitWeight * rollQty;
    }
  }

  // Không lấy Khối lượng hàng TT từ phiếu cân ca nữa (phieu_can_dinh_ki).
  // KL lõi không lấy từ phiếu cân ca; lấy từ SL cuộn thực tế (báo cáo sản lượng) × 1kg.

  for (const record of getWeighingDataRows(input.damagedRecords ?? [])) {
    const ngay = parseIsoDate(record.productionDate || record.reportDate);
    if (!ngay || !inRange(ngay)) continue;
    const bucket = getOrCreateBucket(map, ngay, record.shiftName, shiftOptions);
    if (!bucket) continue;
    const defectSplit = splitDamagedGoodsDefectWeights(record);
    bucket.hangHong += defectSplit.tong;
    bucket.hangHongNhua += defectSplit.nhuaKhongMang + defectSplit.nhuaCucDauNong + defectSplit.nhuaDinhMang;
    bucket.hangHongMang += defectSplit.mang;
    bucket.tlNhuaKhongMangLoiHong += defectSplit.nhuaKhongMang;
    bucket.tlNhuaCucDauNongLoiHong += defectSplit.nhuaCucDauNong;
    bucket.tlNhuaDinhMangLoiHong += defectSplit.nhuaDinhMang;
    bucket.tlMangLoiHong += defectSplit.mang;
    bucket.soCuonLoiDinhHangHong += defectSplit.loi;
    bucket.tongTrongLuongLoiHong += defectSplit.tong;
  }

  for (const movement of input.warehouseMovements ?? []) {
    if (!inRange(movement.slipDate)) continue;
    const bucket = getOrCreateBucket(map, movement.slipDate, movement.shift, shiftOptions);
    if (!bucket) continue;
    bucket.khoiLuongNpl += sumWarehouseMovementNplKg(movement, resolveKgFactor);
    bucket.khoiLuongMangXuat += sumWarehouseMovementMangKg(movement, resolveKgFactor);
    bucket.khoiLuongLoiXuatKho += sumWarehouseMovementLoiXuatKg(movement, resolveKgFactor);
    bucket.khoiLuongTuiXuatKho += sumWarehouseMovementTuiXuatKg(movement, resolveKgFactor);
  }

  for (const report of input.machineNvlReports ?? []) {
    if (!inRange(report.ngay)) continue;
    const bucket = getOrCreateBucket(map, report.ngay, report.ca, shiftOptions);
    if (!bucket) continue;
    if (report.reportKind === 'dau_ca') {
      for (const line of report.lines) {
        const split = splitMachineNvlLineByMaterial(line, 'dau_ca', resolveKgFactor);
        bucket.tonDauCaNhua += split.nhua;
        bucket.tonDauCaMang += split.mang;
        bucket.tonDauCaLoi += split.loi;
        bucket.tonDauCaTui += split.tui;
      }
    } else if (report.reportKind === 'cuoi_ca') {
      for (const line of report.lines) {
        const split = splitMachineNvlLineByMaterial(line, 'cuoi_ca', resolveKgFactor);
        bucket.tonCuoiCaNhua += split.nhua;
        bucket.tonCuoiCaMang += split.mang;
        bucket.tonCuoiCaLoi += split.loi;
        bucket.tonCuoiCaTui += split.tui;
      }
    }
  }

  return [...map.values()]
    .filter(bucket => bucket.ca !== 'Chưa phân ca')
    .map(bucket => {
      const khoiLuongNpl = roundNormWeight(bucket.khoiLuongNpl);
      const khoiLuongMangXuat = roundNormWeight(bucket.khoiLuongMangXuat);
      const khoiLuongLoiXuatKho = roundNormWeight(bucket.khoiLuongLoiXuatKho);
      const khoiLuongTuiXuatKho = roundNormWeight(bucket.khoiLuongTuiXuatKho);
      const tonDauCaNhua = roundNormWeight(bucket.tonDauCaNhua);
      const tonDauCaMang = roundNormWeight(bucket.tonDauCaMang);
      const tonDauCaLoi = roundNormWeight(bucket.tonDauCaLoi);
      const tonDauCaTui = roundNormWeight(bucket.tonDauCaTui);
      const tonCuoiCaNhua = roundNormWeight(bucket.tonCuoiCaNhua);
      const tonCuoiCaMang = roundNormWeight(bucket.tonCuoiCaMang);
      const tonCuoiCaLoi = roundNormWeight(bucket.tonCuoiCaLoi);
      const tonCuoiCaTui = roundNormWeight(bucket.tonCuoiCaTui);
      const tonDauCa = tonDauCaNhua;
      const tonCuoiCa = tonCuoiCaNhua;
      const khoiLuongHangThucTe = roundNormWeight(bucket.khoiLuongHangThucTe);
      const hangHong = roundNormWeight(bucket.hangHong);
      const hangHongNhua = roundNormWeight(bucket.hangHongNhua);
      const hangHongMang = roundNormWeight(bucket.hangHongMang);
      const tlNhuaKhongMangLoiHong = roundNormWeight(bucket.tlNhuaKhongMangLoiHong);
      const tlNhuaCucDauNongLoiHong = roundNormWeight(bucket.tlNhuaCucDauNongLoiHong);
      const tlNhuaDinhMangLoiHong = roundNormWeight(bucket.tlNhuaDinhMangLoiHong);
      const tlMangLoiHong = roundNormWeight(bucket.tlMangLoiHong);
      const soCuonLoiDinhHangHong = roundNormWeight(bucket.soCuonLoiDinhHangHong);
      const tongTrongLuongLoiHong = roundNormWeight(bucket.tongTrongLuongLoiHong);
      const khoiLuongLoi = roundNormWeight(bucket.khoiLuongLoi);
      const khoiLuongMang = roundNormWeight(bucket.slHangThucTe * KHOI_LUONG_MANG_KG_PER_UNIT);
      const khoiLuongNhuaTp = computeKhoiLuongNhuaTp(khoiLuongHangThucTe, khoiLuongLoi, khoiLuongMang);
      const tongNhuaThucDung = computeMaterialUsageKg(khoiLuongNpl, tonDauCaNhua, tonCuoiCaNhua);
      const tongMangThucDung = computeMaterialUsageKg(khoiLuongMangXuat, tonDauCaMang, tonCuoiCaMang);
      const slDatThucTeNhapKho = Math.round(bucket.slDatThucTeNhapKho);
      // Lõi thực dùng = Số lượng đạt thực tế × 1 (= KL lõi từ báo cáo sản lượng)
      const loiThucDung = computeTlLoiTpNhapKhoFromShiftSummary(slDatThucTeNhapKho);
      // Túi thực dùng = TL túi bao bì nhập kho = 0,2 × SL đạt thực tế
      const tuiThucDung = computeTlTuiBaoBiNhapKhoFromShiftSummary(slDatThucTeNhapKho);
      const tongThucDung = roundNormWeight(tongNhuaThucDung + tongMangThucDung + loiThucDung + tuiThucDung);
      const tongVatLieu = tongNhuaThucDung;
      const tongTrongLuongXuatKho = roundNormWeight(
        khoiLuongNpl + khoiLuongMangXuat + khoiLuongLoiXuatKho + khoiLuongTuiXuatKho
      );
      const tongTrongLuongTonDauCa = roundNormWeight(tonDauCaNhua + tonDauCaMang + tonDauCaLoi + tonDauCaTui);
      const tongTrongLuongTonCuoiCa = roundNormWeight(
        tonCuoiCaNhua + tonCuoiCaMang + tonCuoiCaLoi + tonCuoiCaTui
      );
      const tlNhuaTpNhapKho = computeTlNhuaTpNhapKhoFromShiftSummary({
        khoiLuongNpl,
        tonDauCaNhua,
        tonCuoiCaNhua,
        tlNhuaKhongMangLoiHong,
        tlNhuaCucDauNongLoiHong,
        tlNhuaDinhMangLoiHong
      });
      const tlMangTpNhapKho = computeTlMangTpNhapKhoFromShiftSummary({
        khoiLuongMangXuat,
        tonDauCaMang,
        tonCuoiCaMang,
        tlMangLoiHong
      });
      const tlTuiBaoBiNhapKho = tuiThucDung;
      const tlLoiTpNhapKho = loiThucDung;
      const tongTpNhapKho = roundNormWeight(
        tlNhuaTpNhapKho + tlMangTpNhapKho + tlTuiBaoBiNhapKho + tlLoiTpNhapKho
      );
      const chenhLech = roundNormWeight(tongNhuaThucDung - khoiLuongNhuaTp - hangHongNhua);
      const sanLuongMetrics = computeShiftSummarySanLuongMetrics({
        tongTpNhapKho,
        tongTrongLuongLoiHong,
        tongThucDung,
        chenhLechNhua: chenhLech,
        tongMangThucDung,
        tlMangTpNhapKho,
        hangHongMang
      });
      return {
        key: `${bucket.ngay}|${bucket.ca}`,
        ngay: bucket.ngay,
        ca: bucket.ca,
        slHang: bucket.slHang,
        khoiLuongHang: roundNormWeight(bucket.khoiLuongHang),
        slHangThucTe: bucket.slHangThucTe,
        khoiLuongHangThucTe,
        khoiLuongNhuaTp,
        hangHong,
        hangHongNhua,
        hangHongMang,
        khoiLuongNpl,
        khoiLuongMangXuat,
        khoiLuongLoiXuatKho,
        khoiLuongTuiXuatKho,
        khoiLuongLoi,
        khoiLuongMang,
        tonDauCa,
        tonDauCaNhua,
        tonDauCaMang,
        tonDauCaLoi,
        tonDauCaTui,
        tonCuoiCa,
        tonCuoiCaNhua,
        tonCuoiCaMang,
        tonCuoiCaLoi,
        tonCuoiCaTui,
        tongNhuaThucDung,
        tongMangThucDung,
        loiThucDung,
        tuiThucDung,
        tongThucDung,
        tongVatLieu,
        chenhLech,
        tongTrongLuongXuatKho,
        tongTrongLuongTonDauCa,
        tongTrongLuongTonCuoiCa,
        slDatThucTeNhapKho,
        tlNhuaTpNhapKho,
        tlMangTpNhapKho,
        tlTuiBaoBiNhapKho,
        tlLoiTpNhapKho,
        tongTpNhapKho,
        tlNhuaKhongMangLoiHong,
        tlNhuaCucDauNongLoiHong,
        tlNhuaDinhMangLoiHong,
        tlMangLoiHong,
        soCuonLoiDinhHangHong,
        tongTrongLuongLoiHong,
        ...sanLuongMetrics
      };
    })
    .sort((a, b) => compareSummaryRows(a, b, shiftOptions));
}

export function formatShiftSummaryNumber(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

export function formatShiftSummaryKg(value: number, fractionDigits = 3) {
  return formatShiftSummaryNumber(value, fractionDigits);
}

export function formatShiftSummaryPercent(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) return '-';
  return `${formatShiftSummaryNumber(value, fractionDigits)}%`;
}

/** Số tiền lỗ lãi nhựa (đ) = Giá trị lỗ/lãi nhựa (kg) × Giá (đ/kg) */
export function computeSoTienLoLaiNhua(giaTriLoLaiNhua: number, gia: number) {
  if (!Number.isFinite(giaTriLoLaiNhua) || !Number.isFinite(gia) || gia === 0) return 0;
  return Math.round(giaTriLoLaiNhua * gia);
}

/** Dòng NVL nhựa (kg): không phải lõi/túi/màng m2 — cùng quy tắc xuất NPL trong tổng hợp ca. */
export function isWarehousePlasticNvlLine(
  movement: Pick<ShiftSummaryWarehouseMovement, 'warehouseKind' | 'itemCode' | 'itemName' | 'unit'>
) {
  if (movement.warehouseKind !== 'nvl') return false;
  if (isWarehouseCoreExportItem(movement.itemCode || '', movement.itemName || '')) return false;
  if (isWarehouseBagExportItem(movement.itemCode || '', movement.itemName || '')) return false;
  const unit = movement.unit || '';
  if (isM2Unit(unit)) return false;
  return isKgUnit(unit) || !unit.trim();
}

/**
 * Giá nhựa (đ/kg) từ phiếu xuất kho cùng ngày + ca.
 * Chỉ lấy từ phiếu xuất NVL nhựa — không được phép tính từ phiếu nhập kho.
 * Nhiều dòng → bình quân gia quyền theo số lượng.
 */
export function resolveShiftSummaryGiaNhuaFromWarehouse(
  ngay: string,
  ca: string,
  movements: ShiftSummaryWarehouseMovement[] | undefined,
  shiftSettings: ShiftSetting[]
): number {
  if (!movements || movements.length === 0) return 0;
  const shiftOptions = getProductionShiftOptions(shiftSettings);

  let amount = 0;
  let qty = 0;
  for (const movement of movements) {
    if (movement.slipType !== 'xuat') continue;
    if (!isWarehousePlasticNvlLine(movement)) continue;
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

export function resolveShiftSummaryTlDinhMucKgCuon(
  row: Pick<ControlBoardShiftSummaryRow, 'slHang' | 'khoiLuongHang'>
) {
  if (!row.slHang || row.slHang <= 0) return 0;
  return roundNormWeight(row.khoiLuongHang / row.slHang);
}

export function sumShiftSummaryColumn(rows: ControlBoardShiftSummaryRow[], key: keyof ControlBoardShiftSummaryRow) {
  if (key === 'key' || key === 'ngay' || key === 'ca') return 0;
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

export function defaultShiftSummaryDateRange(days = 14) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - Math.max(0, days - 1));
  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return {
    from: toLocalIso(from),
    to: toLocalIso(today)
  };
}

export function splitStaffNames(value: string) {
  return String(value || '')
    .split(/[,;+]/)
    .map(name => name.trim())
    .filter(name => name && name !== '-');
}

function staffNameMatches(value: string, staffFilter: string) {
  const target = staffFilter.trim().toLowerCase();
  if (!target) return true;
  return splitStaffNames(value).some(name => name.toLowerCase() === target);
}

export function normalizeMachineToken(value: string) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

export function machineValueMatchesFilter(
  machineFilter: string,
  selected: { code?: string; name?: string } | null,
  ...candidates: Array<string | undefined | null>
) {
  if (!machineFilter || machineFilter === 'all') return true;

  const tokens = new Set<string>();
  const addToken = (value?: string | null) => {
    const token = normalizeMachineToken(value || '');
    if (token) tokens.add(token);
  };

  addToken(machineFilter);
  addToken(selected?.code);
  addToken(selected?.name);

  return candidates.some(candidate => {
    const token = normalizeMachineToken(candidate || '');
    if (!token) return false;
    for (const selectedToken of tokens) {
      if (token === selectedToken || token.includes(selectedToken) || selectedToken.includes(token)) {
        return true;
      }
    }
    return false;
  });
}

export function parseControlBoardFilterDate(value?: string) {
  return parseDateToIso(value);
}

export function matchesControlBoardDateRange(value: string | undefined, dateFrom: string, dateTo: string) {
  const date = parseControlBoardFilterDate(value);
  if (!date) return !dateFrom && !dateTo;
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
}

export function shiftSummaryRowHasStaff(
  row: Pick<ControlBoardShiftSummaryRow, 'ngay' | 'ca'>,
  staffFilter: string,
  sources: ShiftSummaryFilterSources
) {
  const target = staffFilter.trim();
  if (!target || target === 'all') return true;

  const shiftOptions = getProductionShiftOptions(sources.shiftSettings);

  for (const order of sources.productionOrders) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, order.startDate, order.shift, shiftOptions)) continue;
    if (staffNameMatches(order.staff, target)) return true;
  }

  for (const report of sources.mixingReports) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, report.ngay, report.ca, shiftOptions)) continue;
    if (staffNameMatches(report.nhan_su, target)) return true;
  }

  for (const movement of sources.warehouseMovements) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, movement.slipDate, movement.shift, shiftOptions)) continue;
    if (staffNameMatches(movement.createdBy, target)) return true;
  }

  for (const report of sources.machineNvlReports) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, report.ngay, report.ca, shiftOptions)) continue;
    if (staffNameMatches(report.nhanSu, target)) return true;
  }

  for (const record of sources.weighingRecords) {
    const recordNgay = record.productionDate || record.reportDate;
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, recordNgay, record.shiftName, shiftOptions)) continue;
    if (staffNameMatches(record.worker1, target) || staffNameMatches(record.worker2, target)) return true;
  }

  return false;
}

export function shiftSummaryRowHasMachine(
  row: Pick<ControlBoardShiftSummaryRow, 'ngay' | 'ca'>,
  machineFilter: string,
  sources: ShiftSummaryFilterSources,
  selectedMachine?: { code?: string; name?: string } | null
) {
  const target = machineFilter.trim();
  if (!target || target === 'all') return true;

  const shiftOptions = getProductionShiftOptions(sources.shiftSettings);
  const matches = (...candidates: Array<string | undefined | null>) =>
    machineValueMatchesFilter(target, selectedMachine ?? null, ...candidates);

  for (const order of sources.productionOrders) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, order.startDate, order.shift, shiftOptions)) continue;
    if (matches(order.machine, order.position)) return true;
  }

  for (const report of sources.acceptanceReports ?? []) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, report.ngay, report.ca, shiftOptions)) continue;
    if (matches(report.ma_may, report.ten_may)) return true;
  }

  for (const report of sources.mixingReports) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, report.ngay, report.ca, shiftOptions)) continue;
    if (matches(report.ma_may, report.ten_may)) return true;
  }

  for (const report of sources.machineNvlReports) {
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, report.ngay, report.ca, shiftOptions)) continue;
    if (matches(report.maMay, report.tenMay)) return true;
  }

  for (const record of sources.weighingRecords) {
    const recordNgay = record.productionDate || record.reportDate;
    if (!matchesShiftSummaryBucket(row.ngay, row.ca, recordNgay, record.shiftName, shiftOptions)) continue;
    if (matches(record.machineName)) return true;
  }

  return false;
}

export function filterControlBoardShiftSummaryRows(
  rows: ControlBoardShiftSummaryRow[],
  filters: {
    shiftFilter: string;
    staffFilter: string;
    machineFilter?: string;
  },
  sources: ShiftSummaryFilterSources,
  selectedMachine?: { code?: string; name?: string } | null
) {
  const shiftOptions = getProductionShiftOptions(sources.shiftSettings);

  return rows.filter(row => {
    if (filters.shiftFilter !== 'all') {
      const rowShift = normalizeShiftKey(row.ca, shiftOptions);
      const filterShift = normalizeShiftKey(filters.shiftFilter, shiftOptions);
      if (rowShift !== filterShift && !shiftNamesMatch(row.ca, filters.shiftFilter)) {
        return false;
      }
    }

    if (!shiftSummaryRowHasStaff(row, filters.staffFilter, sources)) {
      return false;
    }

    return shiftSummaryRowHasMachine(row, filters.machineFilter || 'all', sources, selectedMachine);
  });
}

export function collectShiftSummaryStaffOptions(sources: ShiftSummaryFilterSources) {
  const names = new Set<string>();

  sources.productionOrders.forEach(order => {
    splitStaffNames(order.staff).forEach(name => names.add(name));
  });
  sources.mixingReports.forEach(report => {
    splitStaffNames(report.nhan_su).forEach(name => names.add(name));
  });
  sources.warehouseMovements.forEach(movement => {
    splitStaffNames(movement.createdBy).forEach(name => names.add(name));
  });
  sources.machineNvlReports.forEach(report => {
    splitStaffNames(report.nhanSu).forEach(name => names.add(name));
  });
  sources.weighingRecords.forEach(record => {
    if (record.worker1?.trim()) names.add(record.worker1.trim());
    if (record.worker2?.trim()) names.add(record.worker2.trim());
  });

  return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
}
