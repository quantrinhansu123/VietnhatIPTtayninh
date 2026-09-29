import React from 'react';
import { formatMoney, formatNumber } from '../utils';
import { vietNhatLogoUrl } from './layout/constants';
import type { ShippingOrder, ShippingOrderLine } from '../features/lenh-xuat-hang';

type PrintRow = {
  key: string;
  order: ShippingOrder;
  line: ShippingOrderLine | null;
  showNote: boolean;
};

function formatDateVi(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function dayOfYear(isoDate: string): number {
  const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const start = new Date(year, 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

function formatSlipNumber(order: ShippingOrder) {
  const day = dayOfYear(order.ngay_xuat);
  const code = String(order.ma_lenh || '').trim().toUpperCase();
  if (day > 0 && code) return `${day} - ${code}`;
  return code || '—';
}

function formatCombinedSlipNumbers(orders: ShippingOrder[]) {
  if (orders.length === 0) return '—';
  const days = [...new Set(orders.map(order => dayOfYear(order.ngay_xuat)).filter(day => day > 0))];
  const codes = orders
    .map(order => String(order.ma_lenh || '').trim().toUpperCase())
    .filter(Boolean);
  if (codes.length === 0) return '—';
  if (days.length === 1) return `${days[0]} - ${codes.join(', ')}`;
  return orders.map(formatSlipNumber).join(', ');
}

function uniqueJoined(values: string[], fallback = '—') {
  const items = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
  return items.length > 0 ? items.join(', ') : fallback;
}

function AddressCell({ name, address }: { name: string; address: string }) {
  const lines = String(address || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return (
    <>
      {name ? <div className="bb-gx-customer-name">{name}</div> : null}
      {lines.length > 0
        ? lines.map((line, index) => (
            <React.Fragment key={`${line}-${index}`}>
              {line}
              {index < lines.length - 1 ? <br /> : null}
            </React.Fragment>
          ))
        : null}
    </>
  );
}

function buildPrintRows(orders: ShippingOrder[]): PrintRow[] {
  const rows: PrintRow[] = [];
  for (const order of orders) {
    const lines = order.chi_tiet.length > 0 ? order.chi_tiet : [null];
    lines.forEach((line, index) => {
      rows.push({
        key: `${order.id || order.ma_lenh}-${line?.id || index}`,
        order,
        line,
        showNote: index === 0
      });
    });
  }
  return rows;
}

export function ShippingDeliveryPrintSheet({
  orders,
  generalNote = ''
}: {
  orders: ShippingOrder[];
  generalNote?: string;
}) {
  if (!orders.length) return null;

  const rows = buildPrintRows(orders);
  const totalValue = orders.reduce(
    (sum, order) => sum + order.chi_tiet.reduce((lineSum, line) => lineSum + (Number(line.tong_tien) || 0), 0),
    0
  );
  const totalKm = orders.reduce((sum, order) => sum + (order.so_km != null && order.so_km > 0 ? order.so_km : 0), 0);
  const shipDate = uniqueJoined(orders.map(order => formatDateVi(order.ngay_xuat)));
  const slipNo = formatCombinedSlipNumbers(orders);
  const plates = uniqueJoined(orders.map(order => order.bsx));
  const noteText = String(generalNote || '').trim();

  return (
    <div className="bb-gx-print-batch" aria-hidden>
      <div className="bb-gx-print-page">
        <div className="bb-gx-sheet">
          <section className="bb-gx-top">
            <div className="bb-gx-brand">
              <img src={vietNhatLogoUrl} alt="Việt Nhật IPT" className="bb-gx-logo" />
              <div className="bb-gx-brand-text">
                <div className="bb-gx-company">CÔNG TY CỔ PHẦN VẬT LIỆU CÁCH NHIỆT</div>
                <div className="bb-gx-vn">VIỆT NHẬT</div>
              </div>
            </div>

            <div className="bb-gx-title">
              <h1>BIÊN BẢN GIAO XE</h1>
              <div className="bb-gx-rule" />
              <div className="bb-gx-sub">PHIẾU XUẤT HÀNG - GIAO HÀNG</div>
            </div>

            <div className="bb-gx-meta">
              <div className="bb-gx-meta-row">
                <div className="bb-gx-meta-label">Ngày giao hàng</div>
                <div className="bb-gx-meta-value">{shipDate}</div>
              </div>
              <div className="bb-gx-meta-row">
                <div className="bb-gx-meta-label">Số phiếu</div>
                <div className="bb-gx-meta-value">{slipNo}</div>
              </div>
            </div>
          </section>

          <div className="bb-gx-vehicle">
            <div className="bb-gx-vehicle-label">BIỂN SỐ XE</div>
            <div className="bb-gx-vehicle-value">{plates}</div>
          </div>

          <table className="bb-gx-table">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>TT</th>
                <th>Mã KH</th>
                <th>Địa chỉ</th>
                <th>SĐT KH</th>
                <th>NVQL</th>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>SL</th>
                <th>
                  Giá bán
                  <br />
                  (VNĐ)
                </th>
                <th>Thanh toán</th>
                <th>
                  TỔNG GIÁ TRỊ
                  <br />
                  (VNĐ)
                </th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const { order, line, showNote } = row;
                const note = showNote ? String(order.ghi_chu || '').trim() : '';
                return (
                  <tr key={row.key}>
                    <td>{index + 1}</td>
                    <td>
                      <b>{order.ma_khach_hang || '—'}</b>
                    </td>
                    <td className="bb-gx-left">
                      <AddressCell name={order.ten_khach_hang} address={order.dia_chi_giao} />
                    </td>
                    <td>{order.so_dien_thoai || '—'}</td>
                    <td>
                      <b>{order.nhan_vien || '—'}</b>
                    </td>
                    <td>
                      <b>{line?.ma_sp || '—'}</b>
                    </td>
                    <td className="bb-gx-left">
                      <div className="bb-gx-product-name">{line?.ten_sp || '—'}</div>
                    </td>
                    <td className="bb-gx-qty">
                      {line ? formatNumber(line.so_luong || 0, 2) : '—'}
                    </td>
                    <td className="bb-gx-money">{line ? formatMoney(line.don_gia || 0) : '—'}</td>
                    <td>—</td>
                    <td className="bb-gx-money">{line ? formatMoney(line.tong_tien || 0) : '—'}</td>
                    <td className="bb-gx-note">{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="bb-gx-summary">
            <div className="bb-gx-distance">
              TỔNG CỘNG: <strong>{totalKm > 0 ? `${formatNumber(totalKm, 1)} KM` : '—'}</strong>
            </div>
            <div className="bb-gx-total">
              <span>TỔNG GIÁ TRỊ:</span>
              <span className="bb-gx-amount">{formatMoney(totalValue)}</span>
            </div>
          </div>

          <section className="bb-gx-signatures">
            {['ĐIỀU XE', 'KẾ TOÁN', 'THỦ KHO', 'LÁI XE', 'BẢO VỆ'].map(label => (
              <div key={label} className="bb-gx-sign">
                <div className="bb-gx-sign-head">{label}</div>
                <div className="bb-gx-sign-hint">(Ký, ghi rõ họ tên)</div>
              </div>
            ))}
          </section>

          <section className="bb-gx-general-note">
            <div className="bb-gx-general-note-head">GHI CHÚ CHUNG</div>
            <div className="bb-gx-general-note-body">{noteText}</div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default ShippingDeliveryPrintSheet;
