import { FACTORY_PLACEHOLDER } from '../components/layout/constants';

function isRealMachineName(name?: string) {
  const value = String(name ?? '').trim();
  return Boolean(value) && value !== FACTORY_PLACEHOLDER;
}

export function slipKey(record: WeighingRecord) {
  return [
    record.productionDate,
    record.shiftName,
    record.documentNo,
    record.reportDate,
    record.worker1,
    record.worker2
  ].join('|');
}

export interface WeighingRecord {
  id?: string | number;
  documentNo: string;
  reportDate: string;
  productionDate: string;
  shiftName: string;
  worker1: string;
  worker2: string;
  weigherName: string;
  productCode: string;
  productName: string;
  machineName: string;
  weighNo: string;
  weighTime: string;
  coreWeight: string;
  shellWeight: string;
  weight: string;
  /** TL nhựa không mảng lỗi hỏng (kg) — báo cáo hàng hỏng */
  plasticNoFilmWeight?: string;
  /** TL nhựa cục đầu nòng lỗi hỏng (kg) */
  plasticNozzleWeight?: string;
  /** TL nhựa lỗi dính màng (kg) */
  plasticFilmAdhesionWeight?: string;
  /** Loại / trạng thái hàng hỏng (vd. nhua_khong_mang, vat_tu_khac). */
  materialType?: string;
  materialCode?: string;
  materialQuantity?: string;
  /** Đơn vị của số lượng (kg, cái, …). */
  materialUnit?: string;
  acceptanceStatus: string;
  note: string;
  imageUrl?: string;
  coreWeightImageUrl?: string;
  createdAt?: string;
}

export type DamagedGoodsDefectSplit = {
  nhuaKhongMang: number;
  nhuaCucDauNong: number;
  nhuaDinhMang: number;
  mang: number;
  loi: number;
  tong: number;
};

function isDamagedGoodsNozzleNote(note: string) {
  const normalized = note.toLowerCase();
  return /đầu\s*n[oô]ng|cục\s*đầu|dau\s*nong|cuc\s*dau/.test(normalized);
}

export type DamagedGoodsStatusCode =
  | 'nhua_khong_mang'
  | 'nhua_dau_nong'
  | 'nhua_dinh_mang'
  | 'kl_mang'
  | 'tl_loi_dinh_hh'
  | 'vat_tu_khac';

export const DAMAGED_GOODS_STATUS_OPTIONS: ReadonlyArray<{ value: DamagedGoodsStatusCode; label: string }> = [
  { value: 'nhua_khong_mang', label: 'Nhựa không màng' },
  { value: 'nhua_dau_nong', label: 'Nhựa đầu nòng' },
  { value: 'nhua_dinh_mang', label: 'Nhựa dính màng' },
  { value: 'kl_mang', label: 'KL màng' },
  { value: 'tl_loi_dinh_hh', label: 'TL lõi dính HH' },
  { value: 'vat_tu_khac', label: 'Vật tư khác' }
];

/** Nhóm loại vật tư trên form (lọc trạng thái chi tiết). */
export const DAMAGED_GOODS_KIND_OPTIONS: ReadonlyArray<{ value: 'nhua' | 'vat_tu_khac'; label: string }> = [
  { value: 'nhua', label: 'Nhựa' },
  { value: 'vat_tu_khac', label: 'Vật tư khác' }
];

export const DAMAGED_GOODS_PLASTIC_STATUS_OPTIONS = DAMAGED_GOODS_STATUS_OPTIONS.filter(
  option => option.value !== 'vat_tu_khac'
);

export const DAMAGED_GOODS_UNIT_OPTIONS = ['kg', 'cái', 'cuộn', 'mét', 'tờ', 'bao', 'thùng'] as const;

export function resolveDamagedGoodsKind(
  materialType?: string
): '' | 'nhua' | 'vat_tu_khac' {
  const raw = String(materialType || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (raw === 'vat_tu_khac') return 'vat_tu_khac';
  if (
    raw === 'nhua' ||
    raw === 'nhua_khong_mang' ||
    raw === 'nhua_dau_nong' ||
    raw === 'nhua_dinh_mang' ||
    raw === 'kl_mang' ||
    raw === 'tl_loi_dinh_hh'
  ) {
    return 'nhua';
  }
  return '';
}

export function isDamagedOtherMaterial(
  row: Pick<WeighingRecord, 'materialType'> | { materialType?: string }
) {
  return String(row.materialType || '')
    .trim()
    .toLowerCase() === 'vat_tu_khac';
}

export function isDamagedPlasticStatus(materialType?: string) {
  const raw = String(materialType || '')
    .trim()
    .toLowerCase();
  return (
    raw === 'nhua' ||
    raw === 'nhua_khong_mang' ||
    raw === 'nhua_dau_nong' ||
    raw === 'nhua_dinh_mang' ||
    raw === 'kl_mang' ||
    raw === 'tl_loi_dinh_hh'
  );
}

export function damagedGoodsMaterialTypeLabel(materialType?: string) {
  const raw = String(materialType || '')
    .trim()
    .toLowerCase();
  const matched = DAMAGED_GOODS_STATUS_OPTIONS.find(option => option.value === raw);
  if (matched) return matched.label;
  if (raw === 'vat_tu_khac') return 'Vật tư khác';
  if (raw === 'nhua') return 'Nhựa';
  return String(materialType || '').trim() || '—';
}

export function resolveDamagedGoodsEnteredQuantity(
  row: Pick<
    WeighingRecord,
    | 'materialType'
    | 'materialQuantity'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
    | 'shellWeight'
    | 'coreWeight'
    | 'weight'
  >
): string {
  const fromQty = String(row.materialQuantity || '').trim();
  if (fromQty) return fromQty;
  const status = String(row.materialType || '')
    .trim()
    .toLowerCase();
  if (status === 'nhua_khong_mang') return String(row.plasticNoFilmWeight || '').trim();
  if (status === 'nhua_dau_nong') return String(row.plasticNozzleWeight || '').trim();
  if (status === 'nhua_dinh_mang') return String(row.plasticFilmAdhesionWeight || '').trim();
  if (status === 'kl_mang') return String(row.shellWeight || '').trim();
  if (status === 'tl_loi_dinh_hh') return String(row.coreWeight || '').trim();
  if (status === 'vat_tu_khac') return String(row.weight || row.materialQuantity || '').trim();
  if (status === 'nhua') {
    return (
      String(row.plasticNoFilmWeight || '').trim() ||
      String(row.plasticNozzleWeight || '').trim() ||
      String(row.plasticFilmAdhesionWeight || '').trim() ||
      String(row.shellWeight || '').trim() ||
      String(row.coreWeight || '').trim()
    );
  }
  return '';
}

/** Suy trạng thái + SL + ĐVT khi sửa dòng cũ (nhiều ô kg hoặc chỉ «nhựa»). */
export function inferDamagedGoodsFormFields(
  row: Pick<
    WeighingRecord,
    | 'materialType'
    | 'materialQuantity'
    | 'materialUnit'
    | 'materialCode'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
    | 'shellWeight'
    | 'coreWeight'
    | 'weight'
  >
) {
  let materialType = String(row.materialType || '')
    .trim()
    .toLowerCase();
  if (!materialType || materialType === 'nhua') {
    if (String(row.plasticNoFilmWeight || '').trim()) materialType = 'nhua_khong_mang';
    else if (String(row.plasticNozzleWeight || '').trim()) materialType = 'nhua_dau_nong';
    else if (String(row.plasticFilmAdhesionWeight || '').trim()) materialType = 'nhua_dinh_mang';
    else if (String(row.shellWeight || '').trim()) materialType = 'kl_mang';
    else if (String(row.coreWeight || '').trim()) materialType = 'tl_loi_dinh_hh';
    else if (String(row.materialCode || '').trim() || String(row.weight || '').trim()) {
      materialType = 'vat_tu_khac';
    } else {
      materialType = '';
    }
  }

  return {
    materialType,
    materialQuantity: resolveDamagedGoodsEnteredQuantity({ ...row, materialType }),
    materialUnit: String(row.materialUnit || '').trim() || 'kg',
    materialCode: String(row.materialCode || '').trim()
  };
}

/** Gán SL vào đúng cột kg theo trạng thái đã chọn (một trạng thái / một dòng). */
export function applyDamagedGoodsStatusToWeightFields(input: {
  materialType: string;
  materialQuantity: string;
  materialUnit?: string;
  materialCode?: string;
  weight?: string;
}) {
  const status = String(input.materialType || '')
    .trim()
    .toLowerCase();
  const quantity = String(input.materialQuantity || '').trim();
  const unit = String(input.materialUnit || 'kg').trim() || 'kg';
  const base = {
    materialType: status,
    materialQuantity: quantity,
    materialUnit: unit,
    materialCode: status === 'vat_tu_khac' ? String(input.materialCode || '').trim() : '',
    plasticNoFilmWeight: '',
    plasticNozzleWeight: '',
    plasticFilmAdhesionWeight: '',
    shellWeight: '',
    coreWeight: '',
    weight: status === 'vat_tu_khac' ? String(input.weight || '').trim() : ''
  };

  if (status === 'vat_tu_khac') return base;

  const normalizedUnit = unit
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const isKgUnit =
    !normalizedUnit ||
    normalizedUnit === 'kg' ||
    normalizedUnit === 'kgs' ||
    normalizedUnit.startsWith('kg/') ||
    normalizedUnit.startsWith('kg ');

  // Chỉ ghi vào các cột kg khi ĐVT là kg (báo cáo BB vẫn đọc các cột này).
  if (!isKgUnit || !quantity) return base;

  switch (status) {
    case 'nhua_khong_mang':
      return { ...base, plasticNoFilmWeight: quantity };
    case 'nhua_dau_nong':
      return { ...base, plasticNozzleWeight: quantity };
    case 'nhua_dinh_mang':
      return { ...base, plasticFilmAdhesionWeight: quantity };
    case 'kl_mang':
      return { ...base, shellWeight: quantity };
    case 'tl_loi_dinh_hh':
      return { ...base, coreWeight: quantity };
    default:
      return base;
  }
}

/**
 * KL (kg) vật tư khác: ưu tiên ô «Khối lượng vật tư khác» (weight),
 * không có thì dùng Số lượng (materialQuantity) khi người dùng nhập số.
 */
export function resolveDamagedOtherMaterialKg(
  row: Pick<WeighingRecord, 'materialType' | 'weight' | 'materialQuantity'>
): number {
  if (!isDamagedOtherMaterial(row)) return 0;
  const fromWeight = parseWeighingWeight(row.weight ?? '');
  if (fromWeight !== null && fromWeight > 0) return fromWeight;
  const fromQty = parseWeighingWeight(row.materialQuantity ?? '');
  if (fromQty !== null && fromQty > 0) return fromQty;
  return 0;
}

/** Phân tách trọng lượng lỗi hỏng theo loại vật liệu */
export function splitDamagedGoodsDefectWeights(
  row: Pick<
    WeighingRecord,
    | 'weight'
    | 'shellWeight'
    | 'coreWeight'
    | 'note'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
    | 'materialType'
  >
): DamagedGoodsDefectSplit {
  // Vật tư khác không cộng vào các cột nhựa/màng/lõi — xử lý riêng.
  if (isDamagedOtherMaterial(row)) {
    return { nhuaKhongMang: 0, nhuaCucDauNong: 0, nhuaDinhMang: 0, mang: 0, loi: 0, tong: 0 };
  }

  const mang = parseWeighingWeight(row.shellWeight) ?? 0;
  const loi = parseWeighingWeight(row.coreWeight) ?? 0;

  const explicitKhongMang = parseWeighingWeight(row.plasticNoFilmWeight ?? '') ?? 0;
  const explicitDauNong = parseWeighingWeight(row.plasticNozzleWeight ?? '') ?? 0;
  const explicitDinhMang = parseWeighingWeight(row.plasticFilmAdhesionWeight ?? '') ?? 0;
  const hasExplicitPlastic =
    explicitKhongMang > 0 || explicitDauNong > 0 || explicitDinhMang > 0;

  let nhuaKhongMang = 0;
  let nhuaCucDauNong = 0;
  let nhuaDinhMang = 0;

  if (hasExplicitPlastic) {
    nhuaKhongMang = explicitKhongMang;
    nhuaCucDauNong = explicitDauNong;
    nhuaDinhMang = explicitDinhMang;
  } else {
    const plastic = parseWeighingWeight(row.weight) ?? 0;
    if (isDamagedGoodsNozzleNote(row.note || '')) {
      nhuaCucDauNong = plastic;
    } else if (mang > 0) {
      nhuaDinhMang = plastic;
    } else {
      nhuaKhongMang = plastic;
    }
  }

  const tong = nhuaKhongMang + nhuaCucDauNong + nhuaDinhMang + mang + loi;
  return { nhuaKhongMang, nhuaCucDauNong, nhuaDinhMang, mang, loi, tong };
}

export interface WeighingPendingAdd {
  productionDate: string;
  shiftName?: string;
  worker1?: string;
  worker2?: string;
  documentNo?: string;
  reportDate?: string;
  productName?: string;
  productCode?: string;
  machineName?: string;
  existingRows?: WeighingRecord[];
  editingRow?: WeighingRecord;
  createNewSlip?: boolean;
  /** true = bắt đầu lần cân mới; false/mặc định = thêm SP vào lần cân hiện tại */
  newWeighRound?: boolean;
}

export function buildWeighingEditPending(
  record: WeighingRecord,
  allRecords: WeighingRecord[]
): WeighingPendingAdd {
  const key = slipKey(record);
  const existingRows = allRecords.filter(item => slipKey(item) === key);

  return {
    productionDate: record.productionDate,
    shiftName: record.shiftName,
    worker1: record.worker1,
    worker2: record.worker2,
    documentNo: record.documentNo,
    reportDate: record.reportDate,
    productCode: record.productCode,
    productName: record.productName,
    machineName: record.machineName,
    existingRows,
    editingRow: record
  };
}

export function isSlipHeaderRow(
  row: Pick<
    WeighingRecord,
    | 'weighNo'
    | 'productName'
    | 'productCode'
    | 'weight'
    | 'coreWeight'
    | 'shellWeight'
    | 'acceptanceStatus'
    | 'note'
    | 'imageUrl'
    | 'coreWeightImageUrl'
    | 'materialType'
    | 'materialCode'
    | 'materialQuantity'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
  >
) {
  return (
    !row.weighNo?.trim() &&
    !row.productName?.trim() &&
    !row.productCode?.trim() &&
    !row.weight?.trim() &&
    !row.coreWeight?.trim() &&
    !row.shellWeight?.trim() &&
    !row.acceptanceStatus?.trim() &&
    !row.note?.trim() &&
    !row.imageUrl &&
    !row.coreWeightImageUrl &&
    !row.materialType?.trim() &&
    !row.materialCode?.trim() &&
    !row.materialQuantity?.trim() &&
    !row.plasticNoFilmWeight?.trim() &&
    !row.plasticNozzleWeight?.trim() &&
    !row.plasticFilmAdhesionWeight?.trim()
  );
}

export function getWeighingDataRows<T extends WeighingRecord>(rows: T[]) {
  return rows.filter(row => !isSlipHeaderRow(row));
}

export function parseWeighRoundNumber(weighNo: string | number | undefined) {
  const value = Number(String(weighNo ?? '').trim());
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getMaxWeighRoundNumber(rows: WeighingRecord[]) {
  return getWeighingDataRows(rows).reduce(
    (max, row) => Math.max(max, parseWeighRoundNumber(row.weighNo)),
    0
  );
}

/** Lần cân đang nhập — giữ nguyên lần hiện tại để thêm nhiều SP trong cùng lần. */
export function getCurrentWeighRound(rows: WeighingRecord[]) {
  const maxRound = getMaxWeighRoundNumber(rows);
  return maxRound > 0 ? String(maxRound) : '1';
}

/** Lần cân tiếp theo — khi bắt đầu lần cân mới. */
export function getNextWeighRoundNumber(rows: WeighingRecord[]) {
  return String(getMaxWeighRoundNumber(rows) + 1);
}

export function countWeighingRounds(rows: WeighingRecord[]) {
  const dataRows = getWeighingDataRows(rows);
  if (dataRows.length === 0) return 0;

  const rounds = new Set(
    dataRows
      .map(row => String(row.weighNo ?? '').trim())
      .filter(Boolean)
  );

  return rounds.size > 0 ? rounds.size : 1;
}

export function parseWeighingWeight(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/** Tổng trọng lượng 1 lần cân = giá trị nhập trực tiếp ở ô "Tổng trọng lượng" (field weight) */
export function sumWeighingRowTotalWeight(
  row: Pick<WeighingRecord, 'coreWeight' | 'shellWeight' | 'weight'>
): number {
  return parseWeighingWeight(row.weight) ?? 0;
}

/** Báo cáo hàng hỏng: tổng trọng lượng lỗi hỏng (kg) — gồm cả vật tư khác */
export function sumDamagedGoodsRowWeight(
  row: Pick<
    WeighingRecord,
    | 'weight'
    | 'shellWeight'
    | 'coreWeight'
    | 'note'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
    | 'materialType'
    | 'materialQuantity'
  >
): number {
  if (isDamagedOtherMaterial(row)) {
    return resolveDamagedOtherMaterialKg(row);
  }
  return splitDamagedGoodsDefectWeights(row).tong;
}

export function sumDamagedGoodsRowPlasticWeight(
  row: Pick<
    WeighingRecord,
    | 'weight'
    | 'shellWeight'
    | 'coreWeight'
    | 'note'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
  >
): number {
  const split = splitDamagedGoodsDefectWeights(row);
  return split.nhuaKhongMang + split.nhuaCucDauNong + split.nhuaDinhMang;
}

export function sumDamagedGoodsRowFilmWeight(
  row: Pick<WeighingRecord, 'shellWeight'>
): number {
  return parseWeighingWeight(row.shellWeight) ?? 0;
}

export function formatDamagedGoodsRowPlasticWeight(
  row: Pick<WeighingRecord, 'weight'>
): string {
  return formatWeighingWeightField(row.weight);
}

export function formatDamagedGoodsRowFilmWeight(
  row: Pick<WeighingRecord, 'shellWeight'>
): string {
  return formatWeighingWeightField(row.shellWeight);
}

function formatWeighingWeightNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(value);
  return trimTrailingDecimalZeros(formatted);
}

export function formatWeighingWeightField(value: string | undefined): string {
  return formatWeighingWeightNumber(parseWeighingWeight(value ?? ''));
}

export function formatDamagedGoodsRowTotalWeight(
  row: Pick<
    WeighingRecord,
    | 'weight'
    | 'shellWeight'
    | 'coreWeight'
    | 'note'
    | 'plasticNoFilmWeight'
    | 'plasticNozzleWeight'
    | 'plasticFilmAdhesionWeight'
    | 'materialType'
    | 'materialQuantity'
  >
): string {
  const total = sumDamagedGoodsRowWeight(row);
  if (total <= 0) return '—';
  return formatWeighingWeightNumber(total);
}

function trimTrailingDecimalZeros(formatted: string) {
  const match = formatted.match(/^(.+),(\d+)$/);
  if (!match) return formatted;
  const [, intPart, decPart] = match;
  const trimmedDec = decPart.replace(/0+$/, '');
  return trimmedDec ? `${intPart},${trimmedDec}` : intPart;
}

export function formatWeighingRowTotalWeight(
  row: Pick<WeighingRecord, 'coreWeight' | 'shellWeight' | 'weight'>
): string {
  const total = parseWeighingWeight(row.weight);
  if (total === null) return '—';
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(total);
  return trimTrailingDecimalZeros(formatted);
}

/** TL nhựa = Tổng trọng lượng - TL lõi - TL bì */
export function computeWeighingNetWeight(
  row: Pick<WeighingRecord, 'coreWeight' | 'shellWeight' | 'weight'>
): number | null {
  const total = parseWeighingWeight(row.weight);
  if (total === null) return null;
  const core = parseWeighingWeight(row.coreWeight) ?? 0;
  const shell = parseWeighingWeight(row.shellWeight) ?? 0;
  return total - core - shell;
}

export function formatWeighingNetWeight(
  row: Pick<WeighingRecord, 'coreWeight' | 'shellWeight' | 'weight'>
): string {
  const net = computeWeighingNetWeight(row);
  if (net === null) return '—';
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(net);
  return trimTrailingDecimalZeros(formatted);
}

export function normalizeWeighingRecords(data: unknown): WeighingRecord[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item): WeighingRecord | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        id: row.id as string | number | undefined,
        documentNo: String(row.documentNo ?? row.document_no ?? '').trim(),
        reportDate: String(row.reportDate ?? row.report_date ?? '').trim(),
        productionDate: String(row.productionDate ?? row.ngay_san_xuat ?? '').trim(),
        shiftName: String(row.shiftName ?? row.ca_san_xuat ?? '').trim(),
        worker1: String(row.worker1 ?? row.ten_cn_1 ?? '').trim(),
        worker2: String(row.worker2 ?? row.ten_cn_2 ?? '').trim(),
        weigherName: String(row.weigherName ?? row.ten_nguoi_can ?? '').trim(),
        productCode: String(row.productCode ?? row.ma_san_pham ?? '').trim(),
        productName: String(row.productName ?? row.ten_san_pham ?? '').trim(),
        machineName: (() => {
          const raw = String(row.machineName ?? row.ten_may_san_xuat ?? '').trim();
          return isRealMachineName(raw) ? raw : '';
        })(),
        weighNo: String(row.weighNo ?? row.lan_can ?? '').trim(),
        weighTime: String(row.weighTime ?? row.gio_can ?? '').trim(),
        coreWeight: String(row.coreWeight ?? row.trong_luong_loi ?? '').trim(),
        shellWeight: String(row.shellWeight ?? row.trong_luong_bi ?? '').trim(),
        acceptanceStatus: String(row.acceptanceStatus ?? row.nghiem_thu ?? '').trim(),
        note: String(row.note ?? row.ghi_chu ?? '').trim(),
        weight: String(row.weight ?? row.trong_luong ?? '').trim(),
        plasticNoFilmWeight: String(
          row.plasticNoFilmWeight ?? row.trong_luong_nhua_khong_mang ?? ''
        ).trim(),
        plasticNozzleWeight: String(
          row.plasticNozzleWeight ?? row.trong_luong_nhua_dau_nong ?? ''
        ).trim(),
        plasticFilmAdhesionWeight: String(
          row.plasticFilmAdhesionWeight ?? row.trong_luong_nhua_dinh_mang ?? ''
        ).trim(),
        materialType: String(row.materialType ?? row.loai_hang_hong ?? '').trim(),
        materialCode: String(row.materialCode ?? row.ma_vat_tu ?? '').trim(),
        materialQuantity: String(row.materialQuantity ?? row.so_luong_vat_tu ?? '').trim(),
        materialUnit: String(row.materialUnit ?? row.don_vi_vat_tu ?? '').trim(),
        imageUrl: String(row.imageUrl ?? row.anh_url ?? '').trim() || undefined,
        coreWeightImageUrl: String(row.coreWeightImageUrl ?? row.anh_trong_luong_loi_url ?? '').trim() || undefined,
        createdAt: String(row.createdAt ?? row.created_at ?? '').trim() || undefined
      };
    })
    .filter((item): item is WeighingRecord => item !== null);
}

export function generateWeighingDocumentNo(productionDate?: string) {
  const now = new Date();
  const datePart = (productionDate || now.toISOString().split('T')[0]).replace(/-/g, '');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `P-${datePart}-${hh}${mm}${ss}-${rand}`;
}
