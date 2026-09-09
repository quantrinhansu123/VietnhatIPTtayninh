import React from 'react';
import { formatNumber, parsePercentInput } from '../utils';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { getOrderProductLines, type OrderRow } from '../features/_shared/orderRecordHelpers';

function formatOrderCreatedAt(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '—';
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function displayCell(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  return trimmed && trimmed !== '-' ? trimmed : '';
}

export default function OrderPrintSheet({ order }: { order: OrderRow }) {
  const productLines = getOrderProductLines(order);
  const totalQuantity = productLines.reduce((sum, item) => sum + parsePercentInput(item.quantity), 0);
  const orderNote = displayCell(order.note);

  return (
    <div className="order-print-sheet">
      <div className="order-print-doc">
        <header className="order-print-letterhead">
          <div className="order-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="order-print-logo" />
            <div className="order-print-company">
              <p className="order-print-company-name">{PRINT_COMPANY_NAME}</p>
              <p className="order-print-company-subtitle">Dự án Chuyển đổi số sản xuất</p>
            </div>
          </div>
          <div className="order-print-form-meta">
            <p className="order-print-form-code">BM-SX-01</p>
            <p className="order-print-form-version">Phiên bản 1.0</p>
          </div>
        </header>

        <h1 className="order-print-title">ĐƠN ĐẶT HÀNG SẢN XUẤT</h1>

        <table className="order-print-meta-table">
          <tbody>
            <tr>
              <th>Số đơn hàng</th>
              <td>{displayCell(order.orderCode) || '—'}</td>
              <th>Ngày lập</th>
              <td>{formatOrderCreatedAt(order.orderDate || order.createdAt)}</td>
            </tr>
            <tr>
              <th>Khách hàng</th>
              <td>{displayCell(order.customer) || '—'}</td>
              <th>Bộ phận lập</th>
              <td>{displayCell(order.staffName) || '—'}</td>
            </tr>
            <tr>
              <th>Địa chỉ khách hàng</th>
              <td colSpan={3} />
            </tr>
            <tr>
              <th>Thời hạn giao hàng</th>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>

        <table className="order-print-products-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã sản phẩm</th>
              <th>Tên sản phẩm</th>
              <th>Quy cách</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Hạn giao</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {productLines.length === 0 ? (
              <tr>
                <td colSpan={8} className="order-print-empty-row">
                  Chưa có dòng sản phẩm
                </td>
              </tr>
            ) : (
              productLines.map((line, idx) => (
                <tr key={`${line.productCode}-${idx}`}>
                  <td className="order-print-center">{idx + 1}</td>
                  <td className="order-print-mono">{displayCell(line.productCode)}</td>
                  <td className="order-print-product-name">{displayCell(line.productName)}</td>
                  <td />
                  <td className="order-print-center">{displayCell(line.unit)}</td>
                  <td className="order-print-center order-print-qty">
                    {displayCell(line.quantity) || '—'}
                  </td>
                  <td />
                  <td>{displayCell(line.note) || (idx === 0 ? orderNote : '')}</td>
                </tr>
              ))
            )}
            <tr className="order-print-total-row">
              <td colSpan={5} className="order-print-total-label">
                TỔNG CỘNG
              </td>
              <td className="order-print-center order-print-total-value">
                {formatNumber(totalQuantity)}
              </td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>

        <div className="order-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Phụ trách bộ phận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Bộ phận kế hoạch (tiếp nhận)</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
