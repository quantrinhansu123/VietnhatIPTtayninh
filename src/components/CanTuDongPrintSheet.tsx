import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  parseCanTuDongQrProductCode,
  resolveTrongLuongNhuaKg,
  type CanTuDongWeightRow
} from '../utils/canTuDongWeights';

export type CanTuDongPrintLine = {
  maSp: string;
  tenSp: string;
  soLuong: number;
  trongLuongNhua: number;
};

export type CanTuDongPrintData = {
  fromDate: string;
  toDate: string;
  ca: string;
  printedAt: string;
  lines: CanTuDongPrintLine[];
  totalSoLuong: number;
  totalTrongLuongNhua: number;
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

/**
 * Gộp các lần cân theo mã SP: Số lượng = số lần cân, Trọng lượng nhựa = tổng kg nhựa.
 */
export function buildCanTuDongPrintData(
  records: CanTuDongWeightRow[],
  options: {
    fromDate?: string;
    toDate?: string;
    ca?: string;
    productNameByCode?: Map<string, string>;
  } = {}
): CanTuDongPrintData {
  const productNameByCode = options.productNameByCode ?? new Map<string, string>();
  const lineMap = new Map<string, CanTuDongPrintLine>();

  for (const row of records) {
    const maSp =
      parseCanTuDongQrProductCode(row.qr_code) ||
      String(row.qr_code || '').trim() ||
      '—';
    const key = normalizeProductCodeKey(maSp) || maSp;
    const nhua = resolveTrongLuongNhuaKg(row);
    const existing = lineMap.get(key);
    if (existing) {
      existing.soLuong += 1;
      if (nhua !== null) existing.trongLuongNhua += nhua;
    } else {
      lineMap.set(key, {
        maSp,
        tenSp: productNameByCode.get(key) || '',
        soLuong: 1,
        trongLuongNhua: nhua ?? 0
      });
    }
  }

  const lines = [...lineMap.values()].sort((a, b) =>
    a.maSp.localeCompare(b.maSp, 'vi', { numeric: true })
  );

  return {
    fromDate: String(options.fromDate || '').trim(),
    toDate: String(options.toDate || '').trim(),
    ca: String(options.ca || '').trim() && options.ca !== 'all' ? String(options.ca).trim() : 'Tất cả',
    printedAt: new Date().toISOString(),
    lines,
    totalSoLuong: lines.reduce((sum, line) => sum + line.soLuong, 0),
    totalTrongLuongNhua: lines.reduce((sum, line) => sum + line.trongLuongNhua, 0)
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
              <th>Trọng lượng nhựa</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="production-order-print-center">
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
                    {formatNumber(line.trongLuongNhua, 2)} kg
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
                {formatNumber(data.totalTrongLuongNhua, 2)} kg
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
