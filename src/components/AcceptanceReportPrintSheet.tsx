import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  resolveCanTuDongFilmKgPerRoll,
  type InsulationProductAlias
} from '../utils/canTuDongWeights';
import {
  formatAcceptanceShiftLabel,
  formatChecklistMachineHeader,
  resolveAcceptanceShiftHours
} from '../utils/printShiftMeta';

export {
  formatAcceptanceShiftLabel,
  formatChecklistMachineHeader,
  formatChecklistShiftLabel,
  resolveAcceptanceShiftHours
} from '../utils/printShiftMeta';

export type AcceptanceReportSource = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  loai_vat_tu?: string;
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
  trong_luong?: number | null;
  don_vi_trong_luong?: string;
};

export type AcceptancePrintLine = {
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
  trong_luong?: number | null;
  don_vi_trong_luong?: string;
  /** Thành phẩm / Gia công / SP lỗi / SP rác — dùng tách bảng lỗi hỏng. */
  loai_vat_tu?: string;
};

export type AcceptancePrintSlip = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  machineLabel: string;
  thanhPhamLines: AcceptancePrintLine[];
  hangLoiHongLines: AcceptancePrintLine[];
};

/** Định mức SP cho mẫu in Nhật ký SX — TL cuộn (4) + ĐM nhựa (5). */
export type AcceptanceProductNorm = {
  code: string;
  amisCode: string;
  name: string;
  totalWeightKg: number | null;
  plasticWeightKg: number | null;
};

function parsePositiveKg(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  const n = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildAcceptanceProductNormByCode(
  products: Array<{
    code?: string | null;
    newCode?: string | null;
    amisCode?: string | null;
    name?: string | null;
    totalWeight?: string | number | null;
    plasticWeight?: string | number | null;
    coreWeight?: string | number | null;
    bagWeight?: string | number | null;
    totalWeightKg?: number | null;
    plasticWeightKg?: number | null;
  }>
): Map<string, AcceptanceProductNorm> {
  const map = new Map<string, AcceptanceProductNorm>();
  for (const product of products) {
    const code = String(product.code || '').trim();
    if (!code) continue;
    const totalWeightKg =
      product.totalWeightKg != null && Number.isFinite(product.totalWeightKg) && product.totalWeightKg > 0
        ? product.totalWeightKg
        : parsePositiveKg(product.totalWeight);
    let plasticWeightKg =
      product.plasticWeightKg != null &&
      Number.isFinite(product.plasticWeightKg) &&
      product.plasticWeightKg > 0
        ? product.plasticWeightKg
        : parsePositiveKg(product.plasticWeight);
    if (plasticWeightKg == null && totalWeightKg != null) {
      const core = parsePositiveKg(product.coreWeight) ?? 0;
      const bag = parsePositiveKg(product.bagWeight) ?? 0;
      const derived = totalWeightKg - core - bag;
      if (derived > 0) plasticWeightKg = Math.round(derived * 100) / 100;
    }
    const norm: AcceptanceProductNorm = {
      code,
      amisCode: String(product.amisCode || '').trim(),
      name: String(product.name || '').trim(),
      totalWeightKg,
      plasticWeightKg
    };
    for (const candidate of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(String(candidate || ''));
      if (key && key !== '-') map.set(key, norm);
    }
  }
  return map;
}

function normalizeLoaiVatTuKey(loaiVatTu: string | undefined) {
  return String(loaiVatTu ?? 'Thành phẩm')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');
}

/** Thành phẩm + Gia công — bảng I. */
export function isAcceptanceThanhPhamLoai(loaiVatTu: string | undefined) {
  const key = normalizeLoaiVatTuKey(loaiVatTu);
  return key === 'thanh pham' || key === 'gia cong';
}

/** SP lỗi / SP rác — mục «Hàng lỗi hỏng nhập kho» trên danh sách. */
export function isAcceptanceHangLoiHongLoai(loaiVatTu: string | undefined) {
  const key = normalizeLoaiVatTuKey(loaiVatTu);
  return (
    key === 'sp loi' ||
    key === 'sp rac' ||
    key.includes('loi hong') ||
    key.includes('hang hong') ||
    key.includes('hang rac') ||
    key.includes('phe')
  );
}

/** Tab «SP lỗi (Hàng hỏng)» trên báo cáo sản lượng — không gồm tab SP rác. */
export function isAcceptanceHangLoiHongTabLoai(loaiVatTu: string | undefined) {
  const key = normalizeLoaiVatTuKey(loaiVatTu);
  if (!key || key.includes('sp rac') || key.includes('hang rac') || key.includes('kho rac')) return false;
  return key === 'sp loi' || key.includes('sp loi') || key.includes('loi hong') || key.includes('hang hong') || key.includes('hang loi');
}

function isKgUnit(unit: string) {
  const key = unit.trim().toLowerCase().replace(/\./g, '');
  return key === 'kg' || key === 'kgs' || key === 'kilogram';
}

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

const VN_MONTH_NAMES = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12'
];

function formatPrintDateLong(iso: string) {
  if (!iso) return '…… Tháng …… Năm ……';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  const monthNum = Number(month);
  const monthLabel = Number.isFinite(monthNum) ? VN_MONTH_NAMES[monthNum - 1] || month : month;
  return `${Number(day)} Tháng ${monthLabel} Năm ${year}`;
}

function formatPrintDateParts(iso: string) {
  if (!iso) return { day: '……', month: '……', year: '……' };
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return { day: '……', month: '……', year: '……' };
  return {
    day: String(Number(day)),
    month: String(Number(month)),
    year
  };
}

/** Tách «Máy Bao bì Số: 5» → label + số để gạch chân đúng như bảng vật tư. */
function splitChecklistMachineHeader(header: string): { label: string; value: string } {
  const text = String(header || '').trim();
  const match = text.match(/^(Máy\s+Bao\s+bì\s+Số:\s*)(.+)$/i);
  if (match) return { label: match[1].trimEnd(), value: match[2].trim() };
  return { label: '', value: text || '……' };
}

function machineLabelFromReport(report: AcceptanceReportSource) {
  if (report.ten_may && report.ma_may && report.ten_may !== report.ma_may) {
    return `${report.ma_may} · ${report.ten_may}`;
  }
  return report.ten_may || report.ma_may || '-';
}

function normalizeUnitKey(unit: string) {
  const trimmed = unit.trim();
  if (!trimmed) return '-';
  if (/^kg$/i.test(trimmed)) return 'kg';
  return trimmed;
}

export function sumByUnit(lines: AcceptancePrintLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const unitKey = normalizeUnitKey(line.don_vi || '');
    totals.set(unitKey, (totals.get(unitKey) ?? 0) + (line.so_luong ?? 0));
  }
  const unitOrder = (a: string, b: string) => {
    if (a === 'kg' && b !== 'kg') return 1;
    if (b === 'kg' && a !== 'kg') return -1;
    return a.localeCompare(b, 'vi');
  };
  return [...totals.entries()].sort(([a], [b]) => unitOrder(a, b));
}

export function sumTrongLuongKg(lines: Array<{ trong_luong?: number | null }>) {
  return lines.reduce((sum, line) => {
    const kg = Number(line.trong_luong);
    return sum + (Number.isFinite(kg) && kg > 0 ? kg : 0);
  }, 0);
}

/** Map BOM màng / cuộn theo mã SP — cùng nguồn `/can-tu-dong` (không ×2). */
export function buildAcceptanceFilmKgByProductCode(
  products: InsulationProductAlias[]
) {
  const filmKgByProductCode = new Map<string, number>();
  for (const product of products) {
    const filmKg = resolveCanTuDongFilmKgPerRoll(product);
    if (filmKg === null) continue;
    for (const productCode of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(productCode);
      if (key && key !== '-') filmKgByProductCode.set(key, filmKg);
    }
  }
  return filmKgByProductCode;
}

function resolveAcceptanceProductCodeKey(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  const code = (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
  return normalizeProductCodeKey(code) || code;
}

function lookupAcceptanceProductNorm(
  matHang: string,
  productNormByCode?: Map<string, AcceptanceProductNorm>
): AcceptanceProductNorm | null {
  if (!productNormByCode?.size) return null;
  const key = resolveAcceptanceProductCodeKey(matHang);
  if (!key) return null;
  return productNormByCode.get(key) || null;
}

function resolveRollWeightKg(
  line: AcceptancePrintLine,
  norm: AcceptanceProductNorm | null
): number | null {
  if (norm?.totalWeightKg != null && norm.totalWeightKg > 0) return norm.totalWeightKg;
  const qty = line.so_luong ?? 0;
  const total = Number(line.trong_luong);
  if (qty > 0 && Number.isFinite(total) && total > 0) {
    return Math.round((total / qty) * 100) / 100;
  }
  return null;
}

function resolvePlasticNormKg(
  line: AcceptancePrintLine,
  norm: AcceptanceProductNorm | null,
  filmKgByProductCode?: Map<string, number>
): number | null {
  if (norm?.plasticWeightKg != null && norm.plasticWeightKg > 0) return norm.plasticWeightKg;
  const rollKg = resolveRollWeightKg(line, norm);
  if (rollKg == null) return null;
  const key = resolveAcceptanceProductCodeKey(line.mat_hang);
  const filmPerRoll = key && filmKgByProductCode ? filmKgByProductCode.get(key) : undefined;
  if (filmPerRoll != null && filmPerRoll > 0 && rollKg > filmPerRoll) {
    return Math.round((rollKg - filmPerRoll) * 100) / 100;
  }
  return null;
}

export function resolveAcceptanceLineFilmKg(
  matHang: string,
  soLuong: number | null,
  filmKgByProductCode?: Map<string, number>
): number | null {
  if (!filmKgByProductCode?.size) return null;
  const key = resolveAcceptanceProductCodeKey(matHang);
  const perUnit = key ? filmKgByProductCode.get(key) : undefined;
  if (perUnit == null || !(perUnit > 0)) return null;
  const qty = soLuong ?? 0;
  if (!(qty > 0)) return null;
  return perUnit * qty;
}

/** Trọng lượng nhựa = Trọng lượng − Trọng lượng màng. */
export function resolveAcceptanceLineNhuaKg(
  trongLuong: number | null | undefined,
  filmKg: number | null
): number | null {
  const weight = Number(trongLuong);
  if (!Number.isFinite(weight) || !(weight > 0)) return null;
  return weight - (filmKg ?? 0);
}

type LineBucketAcc = {
  lineMap: Map<string, AcceptancePrintLine>;
  lineOrder: string[];
};

function createLineBucketAcc(): LineBucketAcc {
  return { lineMap: new Map<string, AcceptancePrintLine>(), lineOrder: [] };
}

function mergeReportIntoLineBucket(acc: LineBucketAcc, report: AcceptanceReportSource) {
  const lineKey = [report.mat_hang, report.don_vi].join('|');
  const existing = acc.lineMap.get(lineKey);
  const weightKg =
    report.trong_luong !== null &&
    report.trong_luong !== undefined &&
    Number.isFinite(Number(report.trong_luong))
      ? Number(report.trong_luong)
      : 0;
  if (existing) {
    existing.so_luong = (existing.so_luong ?? 0) + (report.so_luong ?? 0);
    existing.trong_luong = (existing.trong_luong ?? 0) + weightKg;
    if (!existing.ten_sp && report.ten_sp) existing.ten_sp = report.ten_sp;
    if (!existing.loai_vat_tu && report.loai_vat_tu) existing.loai_vat_tu = report.loai_vat_tu;
    return;
  }
  const line: AcceptancePrintLine = {
    mat_hang: report.mat_hang,
    ten_sp: report.ten_sp,
    don_vi: report.don_vi,
    so_luong: report.so_luong,
    trong_luong: weightKg > 0 ? weightKg : null,
    don_vi_trong_luong: report.don_vi_trong_luong || 'Kg',
    loai_vat_tu: report.loai_vat_tu
  };
  acc.lineMap.set(lineKey, line);
  acc.lineOrder.push(lineKey);
}

function formatDefectLineName(line: AcceptancePrintLine) {
  const name = String(line.ten_sp || '').trim();
  const code = String(line.mat_hang || '').trim();
  if (name && code && name.toLowerCase() !== code.toLowerCase()) return name;
  return name || code || '';
}

function formatDefectLineQty(line: AcceptancePrintLine) {
  const unit = String(line.don_vi || '').trim();
  const weight = Number(line.trong_luong);
  // Tab Hàng lỗi hỏng, ĐVT kg: công nhân để SL = 1 rồi gõ kg thật vào cột Trọng lượng.
  if (isKgUnit(unit) && Number.isFinite(weight) && weight > 0) {
    return `${formatKgPlain(weight)} ${line.don_vi_trong_luong || 'Kg'}`;
  }
  const qty = line.so_luong;
  if (qty != null && Number.isFinite(qty) && qty !== 0) {
    const qtyText = formatQtyPlain(qty);
    if (!qtyText) return '';
    return unit && unit !== '-' ? `${qtyText} ${unit}` : qtyText;
  }
  if (Number.isFinite(weight) && weight > 0) {
    return `${formatKgPlain(weight)} ${line.don_vi_trong_luong || 'Kg'}`;
  }
  return '';
}

/** Nhựa không màng / đầu keo — gom TL từ dòng lỗi hỏng khớp tên/mã. */
function isNhuaKhongMangOrDauKeoLine(line: AcceptancePrintLine) {
  const hay = `${line.mat_hang || ''} ${line.ten_sp || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');
  return (
    /nhua\s*km|nhuakm|khong\s*mang|khongmang|dau\s*keo|daukeo|nhua\s*dau/.test(hay)
  );
}

function linesFromBucket(acc: LineBucketAcc) {
  return acc.lineOrder.map(key => acc.lineMap.get(key)!);
}

export function buildAcceptancePrintSlips(reports: AcceptanceReportSource[]): AcceptancePrintSlip[] {
  type AcceptanceSlipAcc = {
    id: string;
    ngay: string;
    ca: string;
    gio: string;
    ma_may: string;
    ten_may: string;
    lanSet: Set<string>;
    machineLabel: string;
    thanhPham: LineBucketAcc;
    hangLoiHong: LineBucketAcc;
  };
  const grouped = new Map<string, AcceptanceSlipAcc>();

  // 1 phiếu in = 1 máy / ngày / ca (khớp mẫu giấy Nhật ký SX kiêm phiếu giao).
  reports.forEach(report => {
    const machineKey = String(report.ma_may || report.ten_may || '-').trim() || '-';
    const key = [report.ngay, report.ca, machineKey].join('|');
    let acc = grouped.get(key);
    if (!acc) {
      acc = {
        id: `slip-${key}`,
        ngay: report.ngay,
        ca: report.ca || '-',
        gio: report.gio || '-',
        ma_may: report.ma_may || '',
        ten_may: report.ten_may || '',
        lanSet: new Set<string>(),
        machineLabel: machineLabelFromReport(report),
        thanhPham: createLineBucketAcc(),
        hangLoiHong: createLineBucketAcc()
      };
      grouped.set(key, acc);
    }

    if (report.lan) acc.lanSet.add(report.lan);
    if (!acc.ma_may && report.ma_may) acc.ma_may = report.ma_may;
    if (!acc.ten_may && report.ten_may) acc.ten_may = report.ten_may;

    // Thành phẩm/Gia công → bảng I; chỉ tab Hàng lỗi hỏng (SP lỗi) → bảng II.
    const bucket = isAcceptanceThanhPhamLoai(report.loai_vat_tu)
      ? acc.thanhPham
      : isAcceptanceHangLoiHongTabLoai(report.loai_vat_tu)
        ? acc.hangLoiHong
        : null;
    if (!bucket) return;
    mergeReportIntoLineBucket(bucket, report);

    if (report.gio && (acc.gio === '-' || !acc.gio || report.gio < acc.gio)) {
      acc.gio = report.gio;
    }
  });

  return [...grouped.values()]
    .map(acc => ({
      id: acc.id,
      ngay: acc.ngay,
      ca: acc.ca,
      lan:
        acc.lanSet.size > 0
          ? [...acc.lanSet].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).join(', ')
          : '-',
      gio: acc.gio,
      ma_may: acc.ma_may,
      ten_may: acc.ten_may,
      machineLabel: acc.machineLabel || '-',
      thanhPhamLines: linesFromBucket(acc.thanhPham),
      hangLoiHongLines: linesFromBucket(acc.hangLoiHong)
    }))
    .sort((a, b) => {
      const byDate = a.ngay.localeCompare(b.ngay, 'vi');
      if (byDate !== 0) return byDate;
      const byCa = a.ca.localeCompare(b.ca, 'vi');
      if (byCa !== 0) return byCa;
      return a.machineLabel.localeCompare(b.machineLabel, 'vi');
    });
}

const ACCEPTANCE_PRINT_MIN_ROWS = 12;

function formatKgPlain(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '';
  return formatNumber(value, digits);
}

function formatQtyPlain(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : formatNumber(rounded, 2);
}

export function AcceptanceReportPrintSheet({
  slip,
  filmKgByProductCode,
  productNormByCode,
  shiftSettings,
  performedBy = '',
  machineCode,
  machineName,
  shift
}: {
  slip: AcceptancePrintSlip;
  filmKgByProductCode?: Map<string, number>;
  productNormByCode?: Map<string, AcceptanceProductNorm>;
  shiftSettings?: Array<{
    code?: string;
    name?: string;
    value?: string;
    label?: string;
    startTime?: string;
    endTime?: string;
    timeFrame?: string;
  }>;
  /** Trưởng ca — hiện ở «Người thực hiện». */
  performedBy?: string;
  /** Ưu tiên Máy/Ca đã chọn khi in (y hệt bảng vật tư). */
  machineCode?: string;
  machineName?: string;
  shift?: string;
}) {
  const resolvedShift = String(shift || slip.ca || '').trim();
  const resolvedMachineCode = String(machineCode || slip.ma_may || '').trim();
  const resolvedMachineName = String(machineName || slip.ten_may || slip.machineLabel || '').trim();
  const hours = resolveAcceptanceShiftHours(resolvedShift, shiftSettings);
  const machineHeader = formatChecklistMachineHeader(resolvedMachineCode, resolvedMachineName);
  const machineParts = splitChecklistMachineHeader(machineHeader);
  const shiftLabel = formatAcceptanceShiftLabel(resolvedShift);
  const performer = String(performedBy || '').trim();
  const dateParts = formatPrintDateParts(slip.ngay);
  const lines = slip.thanhPhamLines;
  const paddedCount = Math.max(ACCEPTANCE_PRINT_MIN_ROWS, lines.length);

  type ComputedRow = {
    key: string;
    stt: number;
    amisCode: string;
    tenSp: string;
    soLuong: number | null;
    rollWeightKg: number | null;
    plasticNormKg: number | null;
    totalNormKg: number | null;
    actualNhuaKg: number | null;
  };

  const computedRows: ComputedRow[] = [];
  for (let i = 0; i < paddedCount; i += 1) {
    const line = lines[i];
    if (!line) {
      computedRows.push({
        key: `empty-${i}`,
        stt: i + 1,
        amisCode: '',
        tenSp: '',
        soLuong: null,
        rollWeightKg: null,
        plasticNormKg: null,
        totalNormKg: null,
        actualNhuaKg: null
      });
      continue;
    }
    const norm = lookupAcceptanceProductNorm(line.mat_hang, productNormByCode);
    const rollWeightKg = resolveRollWeightKg(line, norm);
    const plasticNormKg = resolvePlasticNormKg(line, norm, filmKgByProductCode);
    const qty = line.so_luong;
    const totalNormKg =
      qty != null && qty > 0 && plasticNormKg != null && plasticNormKg > 0
        ? Math.round(qty * plasticNormKg * 100) / 100
        : null;
    const filmKg = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    const actualNhuaKg = resolveAcceptanceLineNhuaKg(line.trong_luong, filmKg);
    computedRows.push({
      key: `${line.mat_hang}-${i}`,
      stt: i + 1,
      amisCode: norm?.amisCode || '',
      tenSp: line.ten_sp || norm?.name || line.mat_hang || '',
      soLuong: qty,
      rollWeightKg,
      plasticNormKg,
      totalNormKg,
      actualNhuaKg
    });
  }

  const totalQty = lines.reduce((sum, line) => sum + (line.so_luong ?? 0), 0);
  const totalNormKg = computedRows.reduce(
    (sum, row) => sum + (row.totalNormKg != null && row.totalNormKg > 0 ? row.totalNormKg : 0),
    0
  );
  const nhuaThucDungKg = computedRows.reduce(
    (sum, row) => sum + (row.actualNhuaKg != null && Number.isFinite(row.actualNhuaKg) ? row.actualNhuaKg : 0),
    0
  );
  // Bảng II: chỉ dòng tab Hàng lỗi hỏng (SP lỗi) trên báo cáo sản lượng.
  const defectLines = slip.hangLoiHongLines.filter(line =>
    isAcceptanceHangLoiHongTabLoai(line.loai_vat_tu)
  );
  const defectPadded = Math.max(4, defectLines.length);
  const nhuaKhongMangKg = defectLines.reduce((sum, line) => {
    if (!isNhuaKhongMangOrDauKeoLine(line)) return sum;
    const weight = Number(line.trong_luong);
    if (Number.isFinite(weight) && weight > 0) return sum + weight;
    const qty = Number(line.so_luong);
    const unit = String(line.don_vi || '').trim().toLowerCase();
    if (Number.isFinite(qty) && qty > 0 && (unit === 'kg' || unit === 'kilogram')) return sum + qty;
    return sum;
  }, 0);
  const haoHutKg = Math.round((totalNormKg + nhuaKhongMangKg - nhuaThucDungKg) * 100) / 100;

  return (
    <div className="production-order-print-sheet acceptance-nk-sx-print-sheet">
      <div className="acceptance-nk-sx-print-doc">
        <header className="acceptance-nk-sx-print-header">
          <div className="acceptance-nk-sx-print-header-left">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="acceptance-nk-sx-print-logo" />
            <div className="acceptance-nk-sx-print-brand">
              <p className="acceptance-nk-sx-print-company">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <div className="acceptance-nk-sx-print-header-center">
            <h1 className="acceptance-nk-sx-print-title">
              NHẬT KÝ SẢN XUẤT KIÊM PHIẾU GIAO NHẬN SẢN PHẨM
            </h1>
            <div className="acceptance-nk-sx-print-date-line">
              Ca sản xuất từ{' '}
              <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-time">
                {hours.from || '…..'}
              </span>{' '}
              Đến{' '}
              <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-time">
                {hours.to || '…..'}
              </span>{' '}
              ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}
            </div>
            <div className="acceptance-nk-sx-print-date-line">
              Người thực hiện:{' '}
              <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-performer">
                {performer || '……………………'}
              </span>
            </div>
          </div>
          <div className="acceptance-nk-sx-print-header-right">
            <span className="acceptance-nk-sx-print-meta-machine-label">
              {machineParts.label ? (
                <>
                  {machineParts.label}{' '}
                  <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-machine">
                    {machineParts.value}
                  </span>
                </>
              ) : (
                <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-machine">
                  {machineParts.value}
                </span>
              )}
            </span>
            <span>
              Ca:{' '}
              <span className="acceptance-nk-sx-print-fill acceptance-nk-sx-print-shift">{shiftLabel || '…'}</span>
            </span>
          </div>
        </header>

        <div className="acceptance-nk-sx-print-body">
          <div className="acceptance-nk-sx-print-main">
            <p className="acceptance-nk-sx-print-section-label">I. THÀNH PHẨM</p>
            <table className="acceptance-nk-sx-print-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="col-stt">
                    STT
                  </th>
                  <th rowSpan={2} className="col-amis">
                    Mã Thành phẩm trên MISA
                  </th>
                  <th rowSpan={2} className="col-sp">
                    THÀNH PHẨM (2)
                  </th>
                  <th colSpan={2}>
                    TRỌNG LƯỢNG THÀNH PHẨM TRẢ KHO - gồm lõi, túi, màng (KG) (Cuộn)
                  </th>
                  <th rowSpan={2} className="col-qty">
                    SỐ LƯỢNG (Cuộn) (3)
                  </th>
                  <th rowSpan={2} className="col-roll">
                    TRỌNG LƯỢNG CUỘN BAO GỒM CẢ TÚI, LÕI (4)
                  </th>
                  <th rowSpan={2} className="col-norm">
                    ĐỊNH MỨC NHỰA (5)
                  </th>
                  <th rowSpan={2} className="col-total">
                    TỔNG TRỌNG LƯỢNG THEO ĐỊNH MỨC NHỰA (6) = (3) × (5)
                  </th>
                  <th rowSpan={2} className="col-eval">
                    ĐÁNH GIÁ ĐẠT / KHÔNG ĐẠT SO VỚI ĐỊNH MỨC
                  </th>
                </tr>
                <tr>
                  <th className="col-blank">KG</th>
                  <th className="col-blank">Cuộn</th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map(row => (
                  <tr key={row.key}>
                    <td className="center">{row.stt}</td>
                    <td>{row.amisCode}</td>
                    <td>{row.tenSp}</td>
                    <td />
                    <td />
                    <td className="right">{formatQtyPlain(row.soLuong)}</td>
                    <td className="right">{formatKgPlain(row.rollWeightKg)}</td>
                    <td className="right">{formatKgPlain(row.plasticNormKg)}</td>
                    <td className="right">{formatKgPlain(row.totalNormKg)}</td>
                    <td />
                  </tr>
                ))}
                <tr className="acceptance-nk-sx-print-total-row">
                  <td colSpan={5} className="right strong">
                    TỔNG CỘNG
                  </td>
                  <td className="right strong">{formatQtyPlain(totalQty || null)}</td>
                  <td />
                  <td />
                  <td className="right strong">{formatKgPlain(totalNormKg > 0 ? totalNormKg : null)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <aside className="acceptance-nk-sx-print-side">
            <p className="acceptance-nk-sx-print-section-label">II. BÁO CÁO SX CUỐI CA</p>
            <table className="acceptance-nk-sx-print-side-table">
              <thead>
                <tr>
                  <th>TÊN LỖI HỎNG / PHẾ / SỰ CỐ SẢN XUẤT</th>
                  <th className="col-side-qty">SỐ LƯỢNG</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: defectPadded }, (_, index) => {
                  const line = defectLines[index];
                  return (
                    <tr key={line ? `${line.mat_hang}-${index}` : `defect-empty-${index}`}>
                      <td>{line ? formatDefectLineName(line) : ''}</td>
                      <td className="right">{line ? formatDefectLineQty(line) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="acceptance-nk-sx-print-summary">
              <div className="acceptance-nk-sx-print-summary-row">
                <span>1. ĐỊNH MỨC THÀNH PHẨM SX</span>
                <strong>{totalNormKg > 0 ? `${formatKgPlain(totalNormKg)} KG` : '…… KG'}</strong>
              </div>
              <div className="acceptance-nk-sx-print-summary-row">
                <span>2. Nhựa không màng, Nhựa đầu keo</span>
                <strong>
                  {nhuaKhongMangKg > 0 ? `${formatKgPlain(nhuaKhongMangKg)} KG` : '…… KG'}
                </strong>
              </div>
              <div className="acceptance-nk-sx-print-summary-row">
                <span>3. NHỰA THỰC DÙNG</span>
                <strong>
                  {nhuaThucDungKg > 0 ? `${formatKgPlain(nhuaThucDungKg)} KG` : '…… KG'}
                </strong>
              </div>
              <div className="acceptance-nk-sx-print-summary-note">
                (1) + (2) − (3) · Nhựa thực dùng − Định mức TP SX + nhựa không màng (ÂM là hao hụt)
              </div>
              <div className="acceptance-nk-sx-print-summary-result">
                <strong>
                  {totalNormKg > 0 || nhuaThucDungKg > 0
                    ? `${formatKgPlain(haoHutKg)} KG`
                    : '…… KG'}
                </strong>
              </div>
            </div>
          </aside>
        </div>

        <div className="acceptance-nk-sx-print-signatures">
          <div>
            <p>Thủ kho</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca sản xuất</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Thợ máy</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Giao ca sau</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Quản lý sản xuất</p>
            <span>(Ký, họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcceptanceReportPrintBatch({
  slips,
  filmKgByProductCode,
  productNormByCode,
  shiftSettings,
  performedBy = '',
  machineCode,
  machineName,
  shift
}: {
  slips: AcceptancePrintSlip[];
  filmKgByProductCode?: Map<string, number>;
  productNormByCode?: Map<string, AcceptanceProductNorm>;
  shiftSettings?: Array<{
    code?: string;
    name?: string;
    value?: string;
    label?: string;
    startTime?: string;
    endTime?: string;
    timeFrame?: string;
  }>;
  /** Trưởng ca — điền «Người thực hiện» trên mỗi phiếu. */
  performedBy?: string;
  /** Máy/Ca đã chọn khi in — y hệt bảng vật tư trang trước. */
  machineCode?: string;
  machineName?: string;
  shift?: string;
}) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch acceptance-nk-sx-print-batch">
      {slips.map(slip => (
        <div key={slip.id} className="production-order-print-page acceptance-nk-sx-print-page">
          <AcceptanceReportPrintSheet
            slip={slip}
            filmKgByProductCode={filmKgByProductCode}
            productNormByCode={productNormByCode}
            shiftSettings={shiftSettings}
            performedBy={performedBy}
            machineCode={machineCode}
            machineName={machineName}
            shift={shift}
          />
        </div>
      ))}
    </div>
  );
}

/** Nhóm dòng DB thành 1 bảng trên màn hình (ngày + ca + máy + lần). */
export type AcceptanceScreenSlip = {
  key: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  machineLabel: string;
  lines: Array<AcceptanceReportSource & { ten_sp?: string }>;
};

export function buildAcceptanceScreenSlips(
  reports: Array<AcceptanceReportSource & { ten_sp?: string }>
): AcceptanceScreenSlip[] {
  const grouped = new Map<string, AcceptanceScreenSlip>();

  for (const report of reports) {
    const machineLabel = machineLabelFromReport(report);
    const key = [report.ngay, report.ca, report.ma_may || report.ten_may, report.lan].join('|');
    let slip = grouped.get(key);
    if (!slip) {
      slip = {
        key,
        ngay: report.ngay,
        ca: report.ca || '-',
        lan: report.lan || '-',
        gio: report.gio || '-',
        machineLabel,
        lines: []
      };
      grouped.set(key, slip);
    }
    slip.lines.push(report);
    if (report.gio && (slip.gio === '-' || !slip.gio || report.gio < slip.gio)) {
      slip.gio = report.gio;
    }
  }

  return [...grouped.values()].sort((a, b) => {
    const byDate = b.ngay.localeCompare(a.ngay, 'vi');
    if (byDate !== 0) return byDate;
    const byCa = a.ca.localeCompare(b.ca, 'vi');
    if (byCa !== 0) return byCa;
    const byMachine = a.machineLabel.localeCompare(b.machineLabel, 'vi');
    if (byMachine !== 0) return byMachine;
    return String(a.lan).localeCompare(String(b.lan), 'vi', { numeric: true });
  });
}

/** Bảng dòng trên màn hình — dùng chung cho 2 loại Thành phẩm / Hàng lỗi hỏng. */
function AcceptanceScreenLinesTable({
  title,
  lines,
  filmKgByProductCode,
  renderLineActions
}: {
  title: string;
  lines: Array<AcceptanceReportSource & { ten_sp?: string }>;
  filmKgByProductCode?: Map<string, number>;
  renderLineActions?: (line: AcceptanceReportSource & { ten_sp?: string }) => React.ReactNode;
}) {
  if (lines.length === 0) return null;

  const totalsByUnit = sumByUnit(
    lines.map(line => ({
      mat_hang: line.mat_hang,
      ten_sp: line.ten_sp,
      don_vi: line.don_vi,
      so_luong: line.so_luong
    }))
  );
  const totalTrongLuongKg = sumTrongLuongKg(lines);
  const totalFilmKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    return sum + (film ?? 0);
  }, 0);
  const totalNhuaKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    const nhua = resolveAcceptanceLineNhuaKg(line.trong_luong, film);
    return sum + (nhua ?? 0);
  }, 0);

  return (
    <div className="border-t border-zinc-200 first:border-t-0">
      <div className="bg-zinc-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-zinc-700 sm:px-4">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-center">STT</th>
              <th className="px-3 py-2">Mặt hàng</th>
              <th className="px-3 py-2">Tên SP</th>
              <th className="px-3 py-2 text-center">ĐVT</th>
              <th className="px-3 py-2 text-right">Số lượng</th>
              <th className="px-3 py-2 text-right">Trọng lượng</th>
              <th className="px-3 py-2 text-right">Trọng lượng màng</th>
              <th className="px-3 py-2 text-right">Trọng lượng nhựa</th>
              {renderLineActions ? <th className="px-3 py-2 text-center">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const filmKg = resolveAcceptanceLineFilmKg(
                line.mat_hang,
                line.so_luong,
                filmKgByProductCode
              );
              const nhuaKg = resolveAcceptanceLineNhuaKg(line.trong_luong, filmKg);
              return (
                <tr key={line.id || `${title}-${index}`} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-center font-mono font-bold text-zinc-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-800">{line.mat_hang || '—'}</td>
                  <td className="px-3 py-2 text-zinc-600">{line.ten_sp || '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold text-zinc-600">{line.don_vi || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                    {line.so_luong === null ? '—' : formatNumber(line.so_luong, 2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                    {line.trong_luong == null || !(Number(line.trong_luong) > 0)
                      ? '—'
                      : `${formatNumber(Number(line.trong_luong), 2)} ${line.don_vi_trong_luong || 'Kg'}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-cyan-800">
                    {filmKg != null && filmKg > 0
                      ? `${formatNumber(filmKg, 2)} Kg`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">
                    {nhuaKg != null && nhuaKg > 0
                      ? `${formatNumber(nhuaKg, 2)} Kg`
                      : '—'}
                  </td>
                  {renderLineActions ? (
                    <td className="px-3 py-2 text-center">{renderLineActions(line)}</td>
                  ) : null}
                </tr>
              );
            })}
            {totalsByUnit.map(([unit, total]) => (
              <tr key={unit} className="border-t border-zinc-200 bg-zinc-50">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-black text-zinc-800">
                  Tổng cộng ({unit})
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-emerald-800">
                  {formatNumber(total, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-amber-800">
                  {totalTrongLuongKg > 0 ? `${formatNumber(totalTrongLuongKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-cyan-800">
                  {totalFilmKg > 0 ? `${formatNumber(totalFilmKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-violet-800">
                  {totalNhuaKg > 0 ? `${formatNumber(totalNhuaKg, 2)} Kg` : '—'}
                </td>
                {renderLineActions ? <td /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bảng phiếu trên màn hình — xếp chồng, vuốt xuống xem, không cần chọn. */
export function AcceptanceReportSlipStack({
  slips,
  emptyText = 'Chưa có báo cáo.',
  filmKgByProductCode,
  renderLineActions,
  renderSlipActions
}: {
  slips: AcceptanceScreenSlip[];
  emptyText?: string;
  filmKgByProductCode?: Map<string, number>;
  renderLineActions?: (line: AcceptanceReportSource & { ten_sp?: string }) => React.ReactNode;
  renderSlipActions?: (slip: AcceptanceScreenSlip) => React.ReactNode;
}) {
  if (slips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm font-bold text-zinc-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {slips.map(slip => {
        const thanhPhamLines = slip.lines.filter(line => isAcceptanceThanhPhamLoai(line.loai_vat_tu));
        const hangLoiHongLines = slip.lines.filter(line => isAcceptanceHangLoiHongLoai(line.loai_vat_tu));
        const lineCount = thanhPhamLines.length + hangLoiHongLines.length;
        return (
          <article
            key={slip.key}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">
                  Báo cáo sản lượng
                </p>
                <h3 className="mt-0.5 text-sm font-black text-zinc-900 sm:text-base">
                  {formatPrintDate(slip.ngay)} · Ca {slip.ca}
                </h3>
                <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                  Lần {slip.lan}
                  {slip.gio && slip.gio !== '-' ? ` · ${slip.gio}` : ''}
                  {slip.machineLabel && slip.machineLabel !== '-'
                    ? ` · ${slip.machineLabel}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {renderSlipActions?.(slip)}
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                  {lineCount} dòng
                </span>
              </div>
            </div>

            <AcceptanceScreenLinesTable
              title="Thành phẩm"
              lines={thanhPhamLines}
              filmKgByProductCode={filmKgByProductCode}
              renderLineActions={renderLineActions}
            />
            <AcceptanceScreenLinesTable
              title="Hàng lỗi hỏng nhập kho"
              lines={hangLoiHongLines}
              filmKgByProductCode={filmKgByProductCode}
              renderLineActions={renderLineActions}
            />
          </article>
        );
      })}
    </div>
  );
}
