import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';

export type KiemKhoPrintRow = {
  maNvl: string;
  tenSp: string;
  loaiSp: string;
  tongSoLuong: number;
};

export type KiemKhoPrintReport = {
  dotLabel: string;
  dotKiemKho: string;
  ngayBatDau: string | null;
  thoiGianXacNhan: string | null;
  nguoiChot: string;
  daXacNhan: boolean;
  rows: KiemKhoPrintRow[];
};

function formatPrintDateTime(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatPrintNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

export function KiemKhoPrintSheet({ report }: { report: KiemKhoPrintReport }) {
  const totalQuantity = report.rows.reduce((sum, row) => sum + row.tongSoLuong, 0);

  return (
    <div className="production-order-print-sheet kiem-kho-print-sheet">
      <div className="production-order-print-doc kiem-kho-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">PHIẾU TỔNG HỢP KIỂM KHO</h1>

        <table className="production-order-print-grid-table kiem-kho-print-meta-table">
          <tbody>
            <tr>
              <th>Đợt kiểm kho</th>
              <td>{report.dotLabel || '—'}</td>
              <th>Trạng thái</th>
              <td>{report.daXacNhan ? 'Đã xác nhận kiểm kê' : 'Chưa xác nhận kiểm kê'}</td>
            </tr>
            <tr>
              <th>Ngày, giờ bắt đầu</th>
              <td>{formatPrintDateTime(report.ngayBatDau)}</td>
              <th>Ngày, giờ kết thúc</th>
              <td>{report.daXacNhan ? formatPrintDateTime(report.thoiGianXacNhan) : 'Chưa kết thúc'}</td>
            </tr>
            <tr>
              <th>Mã đợt</th>
              <td className="kiem-kho-print-batch-code">{report.dotKiemKho || '—'}</td>
              <th>Người chốt</th>
              <td>{report.daXacNhan ? report.nguoiChot || '—' : '—'}</td>
            </tr>
          </tbody>
        </table>

        <div className="kiem-kho-print-summary">
          <span>Tổng số mã SP: <strong>{report.rows.length}</strong></span>
          <span>Tổng số lượng kiểm: <strong>{formatPrintNumber(totalQuantity)}</strong></span>
        </div>

        <table className="production-order-print-grid-table kiem-kho-print-product-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã SP gốc</th>
              <th>Tên SP</th>
              <th>Loại SP</th>
              <th>Tổng số lượng</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={`${row.maNvl}-${index}`}>
                <td className="production-order-print-center">{index + 1}</td>
                <td className="kiem-kho-print-product-code">{row.maNvl || '—'}</td>
                <td>{row.tenSp || '—'}</td>
                <td>{row.loaiSp || '—'}</td>
                <td className="production-order-print-right">{formatPrintNumber(row.tongSoLuong)}</td>
              </tr>
            ))}
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="production-order-print-center kiem-kho-print-empty">
                  Đợt kiểm kho này chưa có sản phẩm nào được quét.
                </td>
              </tr>
            ) : null}
            <tr className="kiem-kho-print-total-row">
              <td colSpan={4} className="production-order-print-center">TỔNG CỘNG</td>
              <td className="production-order-print-right">{formatPrintNumber(totalQuantity)}</td>
            </tr>
          </tbody>
        </table>

        <div className="kiem-kho-print-signatures">
          <div>
            <p>Người lập biểu</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Người kiểm kho</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Người xác nhận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
