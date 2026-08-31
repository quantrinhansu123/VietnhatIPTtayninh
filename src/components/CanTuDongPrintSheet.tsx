import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  parseCanTuDongQrProductCode,
  resolveCanLoiKg,
  resolveCanSpKg,
  resolveNhuaDinhMucKg,
  resolveTrongLuongBiKg,
  resolveCanTuDongNhuaThucTeKg,
  type CanTuDongWeightRow
} from '../utils/canTuDongWeights';

export type CanTuDongPrintLine = {
  maSp: string;
  tenSp: string;
  soLuong: number;
  /** Tổng Cân sản phẩm (Cân hàng) — `weight` / `can_san_pham`. */
  tongTrongLuong: number;
  /** Tổng Cân lõi — `tare_weight` / `can_loi`. */
  tongTrongLuongLoi: number;
  /** Tổng Trọng lượng bì. */
  tongTrongLuongBi: number;
  /** Σ BOM màng / cuộn theo Mã SP. */
  trongLuongMang: number;
  trongLuongNhua: number;
  /** Σ nhựa định mức từng lần cân (theo mã SP). */
  trongLuongNhuaDinhMuc: number;
};

export type CanTuDongPrintData = {
  fromDate: string;
  toDate: string;
  ca: string;
  printedAt: string;
  lines: CanTuDongPrintLine[];
  totalSoLuong: number;
  totalTongTrongLuong: number;
  totalTongTrongLuongLoi: number;
  totalTongTrongLuongBi: number;
  totalTrongLuongMang: number;
  totalTrongLuongNhua: number;
  totalTrongLuongNhuaDinhMuc: number;
  totalChenhLechNhua: number;
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatPrintDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '-';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function addFinite(sum: number, value: number | null) {
  return value === null ? sum : sum + value;
}

function chenhLechNhuaKg(thucTe: number, dinhMuc: number) {
  return thucTe - dinhMuc;
}

/** % = chênh lệch ÷ nhựa thực tế × 100 — cùng công thức cột màn hình. */
function phanTramChenhLech(thucTe: number, dinhMuc: number): number | null {
  if (!Number.isFinite(thucTe) || thucTe === 0) return null;
  return (chenhLechNhuaKg(thucTe, dinhMuc) / thucTe) * 100;
}

function formatSignedKg(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)} kg`;
}

function formatSignedPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)}%`;
}

/**
 * Gộp các lần cân theo mã SP.
 * Số lượng = số lần cân; các cột tổng cộng dồn từ Cân hàng / Cân lõi / Bì / Nhựa.
 */
export function buildCanTuDongPrintData(
  records: CanTuDongWeightRow[],
  options: {
    fromDate?: string;
    toDate?: string;
    ca?: string;
    productNameByCode?: Map<string, string>;
    productStandardWeightByCode?: Map<string, number>;
    productCoreWeightByCode?: Map<string, number>;
    productPlasticWeightByCode?: Map<string, number>;
    productFilmWeightByCode?: Map<string, number>;
  } = {}
): CanTuDongPrintData {
  const productNameByCode = options.productNameByCode ?? new Map<string, string>();
  const productStandardWeightByCode = options.productStandardWeightByCode ?? new Map<string, number>();
  const productCoreWeightByCode = options.productCoreWeightByCode ?? new Map<string, number>();
  const productPlasticWeightByCode = options.productPlasticWeightByCode ?? new Map<string, number>();
  const productFilmWeightByCode = options.productFilmWeightByCode ?? new Map<string, number>();
  const lineMap = new Map<string, CanTuDongPrintLine>();

  for (const row of records) {
    const maSp =
      parseCanTuDongQrProductCode(row.qr_code) ||
      String(row.qr_code || '').trim() ||
      '—';
    const key = normalizeProductCodeKey(maSp) || maSp;
    const canHang = resolveCanSpKg(row);
    const canLoi = resolveCanLoiKg(row);
    const trongLuongBi = resolveTrongLuongBiKg(row);
    const nhua = resolveCanTuDongNhuaThucTeKg(row, productFilmWeightByCode);
    const nhuaDinhMuc = resolveNhuaDinhMucKg(
      productStandardWeightByCode.get(key),
      productCoreWeightByCode.get(key),
      productPlasticWeightByCode.get(key)
    );
    const filmKgPerRoll = productFilmWeightByCode.get(key);
    const filmKg =
      filmKgPerRoll != null && Number.isFinite(filmKgPerRoll) && filmKgPerRoll > 0
        ? filmKgPerRoll
        : null;
    const existing = lineMap.get(key);
    if (existing) {
      existing.soLuong += 1;
      existing.tongTrongLuong = addFinite(existing.tongTrongLuong, canHang);
      existing.tongTrongLuongLoi = addFinite(existing.tongTrongLuongLoi, canLoi);
      existing.tongTrongLuongBi += trongLuongBi;
      if (filmKg !== null) existing.trongLuongMang += filmKg;
      if (nhua !== null) existing.trongLuongNhua += nhua;
      if (nhuaDinhMuc !== null) existing.trongLuongNhuaDinhMuc += nhuaDinhMuc;
    } else {
      lineMap.set(key, {
        maSp,
        tenSp: productNameByCode.get(key) || '',
        soLuong: 1,
        tongTrongLuong: canHang ?? 0,
        tongTrongLuongLoi: canLoi ?? 0,
        tongTrongLuongBi: trongLuongBi,
        trongLuongMang: filmKg ?? 0,
        trongLuongNhua: nhua ?? 0,
        trongLuongNhuaDinhMuc: nhuaDinhMuc ?? 0
      });
    }
  }

  const lines = [...lineMap.values()].sort((a, b) =>
    a.maSp.localeCompare(b.maSp, 'vi', { numeric: true })
  );
  const totalTrongLuongMang = lines.reduce((sum, line) => sum + line.trongLuongMang, 0);
  const totalTrongLuongNhua = lines.reduce((sum, line) => sum + line.trongLuongNhua, 0);
  const totalTrongLuongNhuaDinhMuc = lines.reduce((sum, line) => sum + line.trongLuongNhuaDinhMuc, 0);

  return {
    fromDate: String(options.fromDate || '').trim(),
    toDate: String(options.toDate || '').trim(),
    ca: String(options.ca || '').trim() && options.ca !== 'all' ? String(options.ca).trim() : 'Tất cả',
    printedAt: new Date().toISOString(),
    lines,
    totalSoLuong: lines.reduce((sum, line) => sum + line.soLuong, 0),
    totalTongTrongLuong: lines.reduce((sum, line) => sum + line.tongTrongLuong, 0),
    totalTongTrongLuongLoi: lines.reduce((sum, line) => sum + line.tongTrongLuongLoi, 0),
    totalTongTrongLuongBi: lines.reduce((sum, line) => sum + line.tongTrongLuongBi, 0),
    totalTrongLuongMang,
    totalTrongLuongNhua,
    totalTrongLuongNhuaDinhMuc,
    totalChenhLechNhua: chenhLechNhuaKg(totalTrongLuongNhua, totalTrongLuongNhuaDinhMuc)
  };
}

export function CanTuDongPrintSheet({ data }: { data: CanTuDongPrintData }) {
  const dateLabel =
    data.fromDate && data.toDate && data.fromDate === data.toDate
      ? formatPrintDate(data.fromDate)
      : `${formatPrintDate(data.fromDate || '')} – ${formatPrintDate(data.toDate || '')}`;

  return (
    <div className="production-order-print-sheet can-tu-dong-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">BẢNG TỔNG HỢP CÂN TỰ ĐỘNG</h1>

        <div className="production-order-print-meta">
          <span>Ngày: {dateLabel}</span>
          <span>Ca: {data.ca || '-'}</span>
          <span>In lúc: {formatPrintDateTime(data.printedAt)}</span>
        </div>

        <h2 className="production-order-print-section-title">Danh sách sản phẩm theo bộ lọc</h2>
        <table className="production-order-print-grid-table can-tu-dong-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã SP</th>
              <th>Tên SP</th>
              <th>Số lượng</th>
              <th>Tổng trọng lượng</th>
              <th>Trọng lượng màng</th>
              <th>Trọng lượng nhựa</th>
              <th>Tổng trọng lượng lõi</th>
              <th>Tổng trọng lượng bì</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="production-order-print-center">
                  Không có dữ liệu theo bộ lọc.
                </td>
              </tr>
            ) : (
              data.lines.map((line, index) => (
                <tr key={`${line.maSp}-${index}`}>
                  <td className="production-order-print-center">{index + 1}</td>
                  <td>{line.maSp || '-'}</td>
                  <td>{line.tenSp || '-'}</td>
                  <td className="production-order-print-right">{formatNumber(line.soLuong, 0)}</td>
                  <td className="production-order-print-right">
                    {formatNumber(line.tongTrongLuong, 2)} kg
                  </td>
                  <td className="production-order-print-right">
                    {line.trongLuongMang > 0 ? `${formatNumber(line.trongLuongMang, 2)} kg` : '—'}
                  </td>
                  <td className="production-order-print-right">
                    {formatNumber(line.trongLuongNhua, 2)} kg
                  </td>
                  <td className="production-order-print-right">
                    {formatNumber(line.tongTrongLuongLoi, 2)} kg
                  </td>
                  <td className="production-order-print-right">
                    {formatNumber(line.tongTrongLuongBi, 2)} kg
                  </td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={3} className="production-order-print-right" style={{ fontWeight: 700 }}>
                Tổng cộng
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalSoLuong, 0)}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTongTrongLuong, 2)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {data.totalTrongLuongMang > 0
                  ? `${formatNumber(data.totalTrongLuongMang, 2)} kg`
                  : '—'}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTrongLuongNhua, 2)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTongTrongLuongLoi, 2)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTongTrongLuongBi, 2)} kg
              </td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Tổng hợp nhựa</h2>
        <table className="production-order-print-grid-table can-tu-dong-print-nhua-summary">
          <thead>
            <tr>
              <th>Trọng lượng nhựa</th>
              <th>Trọng lượng nhựa định mức</th>
              <th>Chênh lệch nhựa</th>
              <th>Phần trăm chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTrongLuongNhua, 2)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(data.totalTrongLuongNhuaDinhMuc, 2)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatSignedKg(data.totalChenhLechNhua)}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatSignedPercent(
                  phanTramChenhLech(data.totalTrongLuongNhua, data.totalTrongLuongNhuaDinhMuc)
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="acceptance-report-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Thủ kho</p>
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

export function CanTuDongPrintBatch({ data }: { data: CanTuDongPrintData | null }) {
  if (!data) return null;
  return (
    <div className="production-order-print-batch can-tu-dong-print-batch">
      <div className="production-order-print-page">
        <CanTuDongPrintSheet data={data} />
      </div>
    </div>
  );
}
