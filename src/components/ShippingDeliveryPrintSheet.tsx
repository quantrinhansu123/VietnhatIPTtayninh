import { formatMoney, formatNumber } from '../utils';
import { vietNhatLogoUrl } from './layout/constants';
import type { ShippingOrder, ShippingOrderLine } from '../features/lenh-xuat-hang';

type PrintRow = {
  key: string;
  order: ShippingOrder;
  line: ShippingOrderLine | null;
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

function orderViewForLine(order: ShippingOrder, line: ShippingOrderLine | null): ShippingOrder {
  if (!line) return order;
  const code = String(line.ma_khach_hang || '').trim();
  const name = String(line.ten_khach_hang || '').trim();
  if (!code && !name) return order;
  return {
    ...order,
    ma_khach_hang: code || order.ma_khach_hang,
    ten_khach_hang: name || order.ten_khach_hang,
    dia_chi_giao: String(line.dia_chi_giao || '').trim() || order.dia_chi_giao,
    so_dien_thoai: String(line.so_dien_thoai || '').trim() || order.so_dien_thoai,
    ghi_chu: line.ghi_chu != null ? String(line.ghi_chu).trim() : order.ghi_chu
  };
}

function buildPrintRows(orders: ShippingOrder[]): PrintRow[] {
  const rows: PrintRow[] = [];
  const sorted = [...orders].sort((a, b) =>
    customerMergeKey(a).localeCompare(customerMergeKey(b), 'vi')
  );
  for (const order of sorted) {
    const lines = order.chi_tiet.length > 0 ? order.chi_tiet : [null];
    const keyed = lines
      .map(line => ({ line, view: orderViewForLine(order, line) }))
      .sort((a, b) => customerMergeKey(a.view).localeCompare(customerMergeKey(b.view), 'vi'));
    keyed.forEach(({ line, view }, index) => {
      rows.push({
        key: `${order.id || order.ma_lenh}-${line?.id || index}`,
        order: view,
        line
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

function buildGroupedRowSpans(
  rows: PrintRow[],
  getValue: (order: ShippingOrder) => string
): number[] {
  const spans = rows.map(() => 0);
  let i = 0;
  while (i < rows.length) {
    const customerKey = customerMergeKey(rows[i].order);
    const value = String(getValue(rows[i].order) || '').trim();
    let j = i + 1;
    while (
      j < rows.length &&
      customerMergeKey(rows[j].order) === customerKey &&
      String(getValue(rows[j].order) || '').trim() === value
    ) {
      j += 1;
    }
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

/** Gộp ghi chú các lệnh cùng Mã KH, bỏ trùng. */
function mergedGroupNotes(rows: PrintRow[], start: number, span: number) {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (let i = start; i < start + span; i += 1) {
    const text = String(rows[i]?.order.ghi_chu || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join('\n');
}

function paymentLabel(order: ShippingOrder, line: ShippingOrderLine | null) {
  return String(line?.thanh_toan || order.thanh_toan || '').trim() || '—';
}

/** NVQL trên phiếu chỉ hiện tên gọi: chữ cuối của họ tên. */
function staffShortName(value: string) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '—';
}

const ORDERS_PER_PAGE = 3;

function chunkOrders(orders: ShippingOrder[], size: number) {
  const pages: ShippingOrder[][] = [];
  for (let index = 0; index < orders.length; index += size) {
    pages.push(orders.slice(index, index + size));
  }
  return pages;
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

  const noteText = String(generalNote || '').trim();
  const pages = chunkOrders(orders, ORDERS_PER_PAGE);
  const kmDisplay = (() => {
    if (typeof totalKmText === 'string') {
      const trimmed = totalKmText.trim();
      if (!trimmed) return '—';
      return /km/i.test(trimmed) ? trimmed : `${trimmed} KM`;
    }
    const autoKm = orders.reduce(
      (sum, order) => sum + (order.so_km != null && order.so_km > 0 ? order.so_km : 0),
      0
    );
    return autoKm > 0 ? `${formatNumber(autoKm, 1)} KM` : '—';
  })();

  return (
    <div className="bb-gx-print-batch" aria-hidden>
      {pages.map((pageOrders, pageIndex) => {
        const rows = buildPrintRows(pageOrders);
        const maKhSpans = buildMaKhRowSpans(rows);
        const phoneSpans = buildGroupedRowSpans(rows, order => order.so_dien_thoai);
        const managerSpans = buildGroupedRowSpans(rows, order => order.nhan_vien);
        const groupNumbers = rows.map(() => 0);
        let nextGroup = 0;
        maKhSpans.forEach((span, index) => {
          if (span > 0) {
            nextGroup += 1;
            groupNumbers[index] = nextGroup;
          }
        });
        const totalValue = pageOrders.reduce(
          (sum, order) => sum + order.chi_tiet.reduce((lineSum, line) => lineSum + (Number(line.tong_tien) || 0), 0),
          0
        );
        const shipDate = uniqueJoined(pageOrders.map(order => formatDateVi(order.ngay_xuat)));
        const slipNo = formatCombinedSlipNumbers(pageOrders);
        const plates = uniqueJoined(pageOrders.map(order => order.bsx));
        return (
      <div className="bb-gx-print-page" key={`bb-gx-page-${pageIndex}`}>
        <div className="bb-gx-sheet">
          <table className="bb-gx-table">
            <colgroup>
              <col style={{ width: '3.5%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '4.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '24.5%' }} />
            </colgroup>
            <thead>
              <tr>
                <td colSpan={12} className="bb-gx-head-cell">
                  <section className="bb-gx-top">
                    <div className="bb-gx-brand">
                      <img src={vietNhatLogoUrl} alt="Việt Nhật IPT" className="bb-gx-logo" />
                      <div className="bb-gx-brand-text">
                        <div className="bb-gx-company">CÔNG TY CỔ PHẦN VẬT LIỆU CÁCH NHIỆT VIỆT NHẬT</div>
                        <h1 className="bb-gx-title">BIÊN BẢN GIAO XE</h1>
                        <div className="bb-gx-sub">PHIẾU XUẤT HÀNG - GIAO HÀNG</div>
                      </div>
                    </div>

                    <table className="bb-gx-meta">
                      <tbody>
                        <tr>
                          <td className="bb-gx-meta-label">Ngày giao hàng</td>
                          <td className="bb-gx-meta-value bb-gx-meta-strong">{shipDate}</td>
                        </tr>
                        <tr>
                          <td className="bb-gx-meta-label">Số phiếu</td>
                          <td className="bb-gx-meta-value bb-gx-meta-strong">{slipNo}</td>
                        </tr>
                        <tr>
                          <td className="bb-gx-meta-label">BIỂN SỐ XE</td>
                          <td className="bb-gx-meta-value bb-gx-plate-value">{plates}</td>
                        </tr>
                      </tbody>
                    </table>
                  </section>
                </td>
              </tr>
              <tr>
                <th>TT</th>
                <th>Mã KH</th>
                <th>
                  Tên
                  <br />
                  khách
                </th>
                <th className="bb-gx-phone">SĐT KH</th>
                <th className="bb-gx-staff">NVQL</th>
                <th className="bb-gx-code">
                  Mã
                  <br />
                  sản phẩm
                </th>
                <th className="bb-gx-emphasis">Tên sản phẩm</th>
                <th>SL</th>
                <th>Giá bán</th>
                <th className="bb-gx-pay">
                  Thanh
                  <br />
                  toán
                </th>
                <th className="bb-gx-total">
                  Tổng
                  <br />
                  giá trị
                </th>
                <th className="bb-gx-emphasis">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const { order, line } = row;
                const maKhSpan = maKhSpans[index];
                const phoneSpan = phoneSpans[index];
                const managerSpan = managerSpans[index];
                const note = maKhSpan > 0 ? mergedGroupNotes(rows, index, maKhSpan) : '';
                return (
                  <tr key={row.key}>
                    {maKhSpan > 0 ? (
                      <td rowSpan={maKhSpan} className="bb-gx-merge-cell">
                        {groupNumbers[index]}
                      </td>
                    ) : null}
                    {maKhSpan > 0 ? (
                      <td rowSpan={maKhSpan} className="bb-gx-merge-cell">
                        <b>{order.ma_khach_hang || '—'}</b>
                      </td>
                    ) : null}
                    {maKhSpan > 0 ? (
                      <td rowSpan={maKhSpan} className="bb-gx-left bb-gx-customer bb-gx-merge-cell">
                        {order.ten_khach_hang || '—'}
                      </td>
                    ) : null}
                    {phoneSpan > 0 ? (
                      <td rowSpan={phoneSpan} className="bb-gx-phone bb-gx-merge-cell">
                        {order.so_dien_thoai || '—'}
                      </td>
                    ) : null}
                    {managerSpan > 0 ? (
                      <td rowSpan={managerSpan} className="bb-gx-staff bb-gx-merge-cell">
                        <b>{staffShortName(order.nhan_vien)}</b>
                      </td>
                    ) : null}
                    <td className="bb-gx-code">
                      <b>{line?.ma_sp || '—'}</b>
                    </td>
                    <td className="bb-gx-left bb-gx-emphasis">
                      <div className="bb-gx-product-name">{line?.ten_sp || '—'}</div>
                    </td>
                    <td className="bb-gx-qty">
                      {line ? formatNumber(line.so_luong || 0, 2) : '—'}
                    </td>
                    <td className="bb-gx-money">{line ? formatMoney(line.don_gia || 0) : '—'}</td>
                    <td>
                      <b>{paymentLabel(order, line)}</b>
                    </td>
                    <td className="bb-gx-money bb-gx-total">{line ? formatMoney(line.tong_tien || 0) : '—'}</td>
                    {maKhSpan > 0 ? (
                      <td rowSpan={maKhSpan} className="bb-gx-note bb-gx-emphasis bb-gx-merge-cell">
                        {note}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10} className="bb-gx-distance">
                  TỔNG CỘNG: <strong>{kmDisplay}</strong>
                </td>
                <td className="bb-gx-money bb-gx-amount bb-gx-total">{formatMoney(totalValue)}</td>
                <td />
              </tr>
            </tfoot>
          </table>

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
        );
      })}
    </div>
  );
}

export default ShippingDeliveryPrintSheet;
