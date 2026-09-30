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

function formatCombinedSlipNumbers(orders: ShippingOrder[]) {
  if (orders.length === 0) return '—';
  const codes = orders
    .map(order => String(order.ma_lenh || '').trim().toUpperCase())
    .filter(Boolean);
  return codes.length > 0 ? codes.join(', ') : '—';
}

function uniqueJoined(values: string[], fallback = '—') {
  const items = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
  return items.length > 0 ? items.join(', ') : fallback;
}

function customerMergeKey(order: ShippingOrder) {
  const code = String(order.ma_khach_hang || '').trim().toUpperCase();
  if (code) return `code:${code}`;
  // Không có mã KH → không gộp với lệnh khác
  return `solo:${order.id || order.ma_lenh || Math.random()}`;
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
  // Gom cùng Mã KH liền nhau để rowspan hoạt động
  const sorted = [...orders].sort((a, b) =>
    customerMergeKey(a).localeCompare(customerMergeKey(b), 'vi')
  );
  for (const order of sorted) {
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

/** rowspan cột Mã KH khi các dòng liền nhau cùng mã KH */
function buildMaKhRowSpans(rows: PrintRow[]): number[] {
  const spans = rows.map(() => 0);
  let i = 0;
  while (i < rows.length) {
    const key = customerMergeKey(rows[i].order);
    let j = i + 1;
    while (j < rows.length && customerMergeKey(rows[j].order) === key) j += 1;
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

function paymentLabel(order: ShippingOrder, line: ShippingOrderLine | null) {
  return String(line?.thanh_toan || order.thanh_toan || '').trim() || '—';
}

export function ShippingDeliveryPrintSheet({
  orders,
  generalNote = '',
  totalKmText
}: {
  orders: ShippingOrder[];
  generalNote?: string;
  /** Điền tay từ popup xem trước; nếu undefined thì lấy tổng so_km */
  totalKmText?: string;
}) {
  if (!orders.length) return null;

  const rows = buildPrintRows(orders);
  const maKhSpans = buildMaKhRowSpans(rows);

  const totalValue = orders.reduce(
    (sum, order) => sum + order.chi_tiet.reduce((lineSum, line) => lineSum + (Number(line.tong_tien) || 0), 0),
    0
  );
  const autoKm = orders.reduce(
    (sum, order) => sum + (order.so_km != null && order.so_km > 0 ? order.so_km : 0),
    0
  );
  const kmDisplay = (() => {
    if (typeof totalKmText === 'string') {
      const trimmed = totalKmText.trim();
      if (!trimmed) return '—';
      return /km/i.test(trimmed) ? trimmed : `${trimmed} KM`;
    }
    return autoKm > 0 ? `${formatNumber(autoKm, 1)} KM` : '—';
  })();
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
                const maKhSpan = maKhSpans[index];
                return (
                  <tr key={row.key}>
                    <td>{index + 1}</td>
                    {maKhSpan > 0 ? (
                      <td rowSpan={maKhSpan} className="bb-gx-merge-cell">
                        <b>{order.ma_khach_hang || '—'}</b>
                      </td>
                    ) : null}
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
                    <td>
                      <b>{paymentLabel(order, line)}</b>
                    </td>
                    <td className="bb-gx-money">{line ? formatMoney(line.tong_tien || 0) : '—'}</td>
                    <td className="bb-gx-note">{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="bb-gx-summary">
            <div className="bb-gx-distance">
              TỔNG CỘNG: <strong>{kmDisplay}</strong>
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
