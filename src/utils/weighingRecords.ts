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
  /** Loại hàng hỏng: nhựa hoặc vật tư khác. */
  materialType?: string;
  materialCode?: string;
  materialQuantity?: string;
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

export function isDamagedOtherMaterial(
  row: Pick<WeighingRecord, 'materialType'> | { materialType?: string }
) {
  return String(row.materialType || '')
    .trim()
    .toLowerCase() === 'vat_tu_khac';
}

export function damagedGoodsMaterialTypeLabel(materialType?: string) {
  const raw = String(materialType || '')
    .trim()
    .toLowerCase();
  if (raw === 'vat_tu_khac') return 'Vật tư khác';
  if (raw === 'nhua') return 'Nhựa';
  return String(materialType || '').trim() || '—';
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
