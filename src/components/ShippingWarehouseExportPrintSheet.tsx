import { formatNumber } from '../utils';
import { vietNhatLogoUrl } from './layout/constants';
import type { ShippingOrder } from '../features/lenh-xuat-hang';

export type WarehouseExportChecklistLine = {
  key: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
};

function formatDateVi(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function uniqueJoined(values: string[], fallback = '—') {
  const items = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
  return items.length > 0 ? items.join(', ') : fallback;
}

/** Gộp theo mã SP trong phạm vi các lệnh được truyền vào (thường là 1 lệnh). */
export function buildWarehouseExportChecklist(orders: ShippingOrder[]): WarehouseExportChecklistLine[] {
  const map = new Map<string, WarehouseExportChecklistLine>();
  for (const order of orders) {
    for (const line of order.chi_tiet || []) {
      const code = String(line.ma_sp || '').replace(/\s+/g, '').toUpperCase();
      if (!code) continue;
      const qty = Number(line.so_luong) || 0;
      const existing = map.get(code);
      if (existing) {
        existing.so_luong += qty;
        if (!existing.ten_sp && line.ten_sp) existing.ten_sp = String(line.ten_sp).trim();
        if (!existing.don_vi && line.don_vi) existing.don_vi = String(line.don_vi).trim();
        continue;
      }
      map.set(code, {
        key: code,
        ma_sp: String(line.ma_sp || '').trim() || code,
        ten_sp: String(line.ten_sp || '').trim(),
        don_vi: String(line.don_vi || '').trim(),
        so_luong: qty
      });
    }
  }
  return [...map.values()].sort((a, b) => a.ma_sp.localeCompare(b.ma_sp, 'vi'));
}

/** Một phiếu biên bản xuất kho (checklist) cho các lệnh được truyền — thường 1 lệnh. */
export function ShippingWarehouseExportSheet({
  orders,
  embedded = false
}: {
  orders: ShippingOrder[];
  /** Nhúng dưới biên bản giao xe — không bọc batch ẩn ngoài màn hình. */
  embedded?: boolean;
}) {
  if (!orders.length) return null;

  const lines = buildWarehouseExportChecklist(orders);
  const shipDate = uniqueJoined(orders.map(order => formatDateVi(order.ngay_xuat)));
  const slipNos = uniqueJoined(orders.map(order => String(order.ma_lenh || '').trim().toUpperCase()));
  const plates = uniqueJoined(orders.map(order => order.bsx));
  const totalQty = lines.reduce((sum, line) => sum + (Number(line.so_luong) || 0), 0);

  const sheet = (
    <div className={`bb-xk-sheet${embedded ? ' bb-xk-sheet-embedded' : ''}`}>
      <table className="bb-xk-top">
        <tbody>
          <tr>
            <td className="bb-xk-brand-cell">
              <div className="bb-xk-brand">
                <img src={vietNhatLogoUrl} alt="Việt Nhật IPT" className="bb-xk-logo" />
                <div className="bb-xk-brand-text">
                  <div className="bb-xk-company">CÔNG TY CỔ PHẦN VẬT LIỆU CÁCH NHIỆT VIỆT NHẬT</div>
                  <h1 className="bb-xk-title">BIÊN BẢN XUẤT KHO</h1>
                  <div className="bb-xk-sub">CHECKLIST ĐỐI CHIẾU SỐ LƯỢNG</div>
                </div>
              </div>
            </td>
            <td className="bb-xk-meta-cell">
              <table className="bb-xk-meta">
                <tbody>
                  <tr>
                    <td className="bb-xk-meta-label">Ngày xuất</td>
                    <td className="bb-xk-meta-value">{shipDate}</td>
                  </tr>
                  <tr>
                    <td className="bb-xk-meta-label">Số lệnh</td>
                    <td className="bb-xk-meta-value">{slipNos}</td>
                  </tr>
                  <tr>
                    <td className="bb-xk-meta-label">Biển số xe</td>
                    <td className="bb-xk-meta-value">{plates}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="bb-xk-table">
        <colgroup>
          <col style={{ width: '6%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '28%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>TT</th>
            <th>Mã hàng</th>
            <th>Tên hàng</th>
            <th>ĐVT</th>
            <th>Số lượng</th>
            <th>Số lượng thực</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={7} className="bb-xk-empty">
                Không có mã hàng trong lệnh này.
              </td>
            </tr>
          ) : (
            lines.map((line, index) => (
              <tr key={line.key}>
                <td>{index + 1}</td>
                <td className="bb-xk-code">
                  <b>{line.ma_sp}</b>
                </td>
                <td className="bb-xk-left">{line.ten_sp || '—'}</td>
                <td>{line.don_vi || '—'}</td>
                <td className="bb-xk-qty">{formatNumber(line.so_luong || 0, 2)}</td>
                <td className="bb-xk-blank" />
                <td className="bb-xk-blank" />
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="bb-xk-total-label">
              TỔNG SỐ LƯỢNG
            </td>
            <td className="bb-xk-qty">
              <b>{formatNumber(totalQty, 2)}</b>
            </td>
            <td className="bb-xk-blank" />
            <td className="bb-xk-blank" />
          </tr>
        </tfoot>
      </table>

      <section className="bb-xk-signatures">
        {['THỦ KHO', 'NGƯỜI GIAO', 'NGƯỜI NHẬN', 'LÁI XE'].map(label => (
          <div key={label} className="bb-xk-sign">
            <div className="bb-xk-sign-head">{label}</div>
            <div className="bb-xk-sign-hint">(Ký, ghi rõ họ tên)</div>
          </div>
        ))}
      </section>
    </div>
  );

  return sheet;
}

/**
 * In biên bản xuất kho — **mỗi lệnh một trang**, không gộp mã hàng giữa các lệnh đã tick.
 */
export function ShippingWarehouseExportPrintSheet({
  orders
}: {
  orders: ShippingOrder[];
}) {
  if (!orders.length) return null;

  return (
    <div className="bb-xk-print-batch" aria-hidden>
      {orders.map((order, index) => (
        <div
          className="bb-xk-print-page"
          key={`bb-xk-page-${order.id || order.ma_lenh || index}`}
        >
          <ShippingWarehouseExportSheet orders={[order]} />
        </div>
      ))}
    </div>
  );
}

export default ShippingWarehouseExportPrintSheet;
