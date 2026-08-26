import * as XLSX from 'xlsx';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  parseCanTuDongQrProductCode,
  resolveCanLoiKg,
  resolveCanSpKg,
  resolveCanTuDongBusinessDate,
  resolveCanTuDongMachine,
  resolveCanTuDongProductionOrder,
  resolveNhuaDinhMucKg,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  type CanTuDongWeightRow
} from './canTuDongWeights';

function formatExcelDateTime(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatExcelDate(iso?: string | null) {
  const raw = String(iso ?? '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function roundKg(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  return Math.round(value * 1000) / 1000;
}

export type CanTuDongExcelExportRow = CanTuDongWeightRow & {
  unit?: string | null;
  status?: string | null;
  event_id?: string | null;
};

export type CanTuDongExcelExportOptions = {
  fromDate?: string;
  toDate?: string;
  productNameByCode?: Map<string, string>;
  productStandardWeightByCode?: Map<string, number>;
  productCoreWeightByCode?: Map<string, number>;
  productPlasticWeightByCode?: Map<string, number>;
};

/** Xuất các dòng đang lọc trên `/can-tu-dong` ra file Excel. */
export function downloadCanTuDongExcel(
  records: CanTuDongExcelExportRow[],
  options: CanTuDongExcelExportOptions = {}
) {
  const productNameByCode = options.productNameByCode ?? new Map<string, string>();
  const productStandardWeightByCode =
    options.productStandardWeightByCode ?? new Map<string, number>();
  const productCoreWeightByCode = options.productCoreWeightByCode ?? new Map<string, number>();
  const productPlasticWeightByCode =
    options.productPlasticWeightByCode ?? new Map<string, number>();
  const data = records.map((row, index) => {
    const qr = String(row.qr_code ?? '').trim();
    const maSp = parseCanTuDongQrProductCode(qr) || qr;
    const nameKey = normalizeProductCodeKey(maSp);
    const unit = String(row.unit ?? 'kg').trim() || 'kg';
    const standardKg = nameKey ? productStandardWeightByCode.get(nameKey) : undefined;
    const coreKg = nameKey ? productCoreWeightByCode.get(nameKey) : undefined;
    const plasticFromProduct = nameKey ? productPlasticWeightByCode.get(nameKey) : undefined;
    const canSpKg = resolveCanSpKg(row);
    const standardOk = standardKg != null && Number.isFinite(standardKg);
    const nhuaDinhMuc = resolveNhuaDinhMucKg(
      standardOk ? (standardKg as number) : null,
      coreKg ?? null,
      plasticFromProduct ?? null
    );
    const nhuaThucTe = resolveTrongLuongNhuaKg(row);
    const nhuaChenhLech =
      nhuaThucTe !== null && nhuaDinhMuc != null ? nhuaThucTe - nhuaDinhMuc : null;
    const nhuaPhanTram =
      nhuaChenhLech !== null && nhuaThucTe !== null && nhuaThucTe !== 0
        ? (nhuaChenhLech / nhuaThucTe) * 100
        : null;
    return {
      STT: index + 1,
      Ngày: formatExcelDate(resolveCanTuDongBusinessDate(row)),
      'Thời điểm': formatExcelDateTime(row.captured_at || row.created_at),
      Ca: String(row.ca ?? '').trim(),
      Máy: resolveCanTuDongMachine(row) || '',
      'Lệnh SX': resolveCanTuDongProductionOrder(row) || '',
      'Mã QR': qr,
      'Mã SP': maSp,
      'Tên SP': nameKey ? productNameByCode.get(nameKey) || '' : '',
      'Cân sản phẩm (kg)': roundKg(canSpKg),
      'Trọng lượng tiêu chuẩn (kg)': standardOk ? roundKg(standardKg as number) : '',
      'Nhựa thực tế (kg)': roundKg(nhuaThucTe),
      'Nhựa định mức (kg)': roundKg(nhuaDinhMuc),
      'Chênh lệch nhựa TT-ĐM (kg)': nhuaChenhLech !== null ? roundKg(nhuaChenhLech) : '',
      'Phần trăm (%)':
        nhuaPhanTram !== null ? Math.round(nhuaPhanTram * 100) / 100 : '',
      'Cân lõi (kg)': roundKg(resolveCanLoiKg(row)),
      'Trọng lượng bì (kg)': roundKg(resolveTrongLuongBiKg(row)),
      'Đơn vị': unit,
      'Trạng thái': String(row.status ?? '').trim(),
      'Thiết bị': String(row.device_id ?? '').trim(),
      'Event ID': String(row.event_id ?? '').trim()
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 20 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Can_tu_dong');

  const fromPart = String(options.fromDate ?? '').trim().replace(/-/g, '') || 'all';
  const toPart = String(options.toDate ?? '').trim().replace(/-/g, '') || 'all';
  XLSX.writeFile(workbook, `can-tu-dong_${fromPart}_${toPart}.xlsx`);
}
