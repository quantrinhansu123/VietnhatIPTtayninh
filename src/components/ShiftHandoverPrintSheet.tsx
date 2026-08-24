import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import {
  SHIFT_HANDOVER_FORM_CODE,
  SHIFT_HANDOVER_FORM_EFFECTIVE,
  SHIFT_HANDOVER_FORM_ISSUE,
  sumClosingStockTotals,
  sumProductTotals,
  sumScrapQuantity,
  type SavedClosingStockLine,
  type SavedHandoverTask,
  type SavedKpiLine,
  type SavedProductLine,
  type SavedScrapLine,
  type ShiftHandoverSlip
} from '../lib/shiftHandoverModel';

export type ShiftHandoverPrintSlip = {
  slipCode: string;
  date: string;
  shift: string;
  timeFrom: string;
  timeTo: string;
  machineLabel: string;
  operators: string;
  products: SavedProductLine[];
  scraps: SavedScrapLine[];
  closingStockLines: SavedClosingStockLine[];
  kpis: SavedKpiLine[];
  lines: SavedHandoverTask[];
  note: string;
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return { day, month, year, text: `${day}/${month}/${year}` };
}

function formatPrintTime(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '……';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}h${match[2]}`;
}

function printNum(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return value === 0 ? '0' : '';
  }
  return formatNumber(value, digits);
}

function padRows<T>(rows: T[], min: number, factory: (index: number) => T): T[] {
  if (rows.length >= min) return rows;
  return [...rows, ...Array.from({ length: min - rows.length }, (_, index) => factory(rows.length + index))];
}

function emptyProduct(stt: number): SavedProductLine {
  return {
    stt,
    productCode: '',
    productName: '',
    plannedReturn: null,
    quantity: null,
    rollWeight: null,
    resinNorm: null,
    totalNormWeight: null,
    defect20: '',
    defect30: ''
  };
}

function emptyScrap(stt: number): SavedScrapLine {
  return { stt, name: '', quantity: null };
}

function emptyClosingStock(stt: number): SavedClosingStockLine {
  return { stt, itemCode: '', itemName: '', unit: '', quantity: null, weightKg: null };
}

function emptyKpi(stt: number): SavedKpiLine {
  return { stt, criteria: '', norm: null, actual: null, variance: null };
}

export function ShiftHandoverPrintSheet({ slip }: { slip: ShiftHandoverPrintSlip }) {
  const dateParts = formatPrintDate(slip.date);
  const products = padRows(slip.products, 6, emptyProduct);
  const scraps = padRows(slip.scraps, 5, emptyScrap);
  const closingStock = padRows(slip.closingStockLines || [], 4, emptyClosingStock);
  const kpis = padRows(slip.kpis, 3, emptyKpi);
  const totals = sumProductTotals(slip.products);
  const scrapTotal = sumScrapQuantity(slip.scraps);
  const closingTotals = sumClosingStockTotals(slip.closingStockLines || []);
  const showLegacyTasks = slip.products.length === 0 && slip.lines.length > 0;

  return (
    <div className="production-order-print-sheet shift-handover-print-sheet">
      <div className="production-order-print-doc shift-handover-print-doc">
        <header className="shift-handover-print-letterhead">
          <div className="shift-handover-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
            <div>
              <p className="shift-handover-print-company">{PRINT_COMPANY_NAME}</p>
              <p className="shift-handover-print-company-sub">VIET NHAT IPT — HIGH QUALITY</p>
            </div>
          </div>
          <h1 className="shift-handover-print-title">NHẬT KÝ SẢN XUẤT KIÊM PHIẾU GIAO CA</h1>
          <table className="shift-handover-print-control-table">
            <tbody>
              <tr>
                <th>Ký hiệu</th>
                <td>{SHIFT_HANDOVER_FORM_CODE}</td>
              </tr>
              <tr>
                <th>Lần BH</th>
                <td>{SHIFT_HANDOVER_FORM_ISSUE}</td>
              </tr>
              <tr>
                <th>Ngày HL</th>
                <td>{SHIFT_HANDOVER_FORM_EFFECTIVE}</td>
              </tr>
            </tbody>
          </table>
        </header>

        <table className="shift-handover-print-meta-table">
          <tbody>
            <tr>
              <td>
                Ca sản xuất từ <strong>{formatPrintTime(slip.timeFrom)}</strong> đến{' '}
                <strong>{formatPrintTime(slip.timeTo)}</strong>
                {slip.shift ? ` (${slip.shift})` : ''}
              </td>
              <td>
                Ngày <strong>{typeof dateParts === 'string' ? dateParts : dateParts.day}</strong> Tháng{' '}
                <strong>{typeof dateParts === 'string' ? '' : dateParts.month}</strong> Năm{' '}
                <strong>{typeof dateParts === 'string' ? '' : dateParts.year}</strong>
              </td>
              <td>
                Số phiếu: <strong>{slip.slipCode || '…………'}</strong>
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                Người thực hiện: <strong>{slip.operators || '…………………………………………'}</strong>
              </td>
              <td>
                Máy: <strong>{slip.machineLabel || '…………'}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="shift-handover-print-body">
          <div className="shift-handover-print-main">
            <h2 className="shift-handover-print-section">II. THÀNH PHẨM</h2>
            <table className="production-order-print-grid-table shift-handover-print-products-table">
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>MÃ HÀNG</th>
                  <th rowSpan={2}>
                    THÀNH PHẨM
                    <span>(2)</span>
                  </th>
                  <th rowSpan={2}>
                    DỰ KIẾN TP TRẢ KHO
                    <span>(Cuộn)</span>
                  </th>
                  <th colSpan={3}>THÀNH PHẨM THỰC TẾ NHẬP KHO</th>
                  <th rowSpan={2}>
                    TỔNG TL THEO ĐM NHỰA
                    <span>(6) = (3) × (5)</span>
                  </th>
                  <th colSpan={2}>LÕI / CUỘN</th>
                </tr>
                <tr>
                  <th>
                    SỐ LƯỢNG
                    <span>(Cuộn) (3)</span>
                  </th>
                  <th>
                    TL CUỘN GỒM TÚI, LÕI
                    <span>(4)</span>
                  </th>
                  <th>
                    ĐỊNH MỨC NHỰA
                    <span>(5)</span>
                  </th>
                  <th>20cm</th>
                  <th>30cm</th>
                </tr>
              </thead>
              <tbody>
                {products.map((line, index) => (
                  <tr key={`${line.stt}-${index}`}>
                    <td>{line.productCode}</td>
                    <td className="shift-handover-print-left">{line.productName}</td>
                    <td className="production-order-print-center">{printNum(line.plannedReturn)}</td>
                    <td className="production-order-print-center">{printNum(line.quantity)}</td>
                    <td className="production-order-print-center">{printNum(line.rollWeight)}</td>
                    <td className="production-order-print-center">{printNum(line.resinNorm)}</td>
                    <td className="production-order-print-center">{printNum(line.totalNormWeight)}</td>
                    <td className="production-order-print-center">{line.defect20}</td>
                    <td className="production-order-print-center">{line.defect30}</td>
                  </tr>
                ))}
                <tr className="shift-handover-print-total-row">
                  <td colSpan={2}>TỔNG CỘNG</td>
                  <td className="production-order-print-center">{printNum(totals.plannedReturn)}</td>
                  <td className="production-order-print-center">{printNum(totals.quantity)}</td>
                  <td />
                  <td />
                  <td className="production-order-print-center">{printNum(totals.totalNormWeight)}</td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="shift-handover-print-side">
            <h2 className="shift-handover-print-section">III. HÀNG LỖI HỎNG / PHẾ / SỰ CỐ SX</h2>
            <table className="production-order-print-grid-table shift-handover-print-scrap-table">
              <thead>
                <tr>
                  <th>TÊN LỖI HỎNG / PHẾ / SỰ CỐ SẢN XUẤT</th>
                  <th>SỐ LƯỢNG</th>
                </tr>
              </thead>
              <tbody>
                {scraps.map((line, index) => (
                  <tr key={`${line.stt}-${index}`}>
                    <td className="shift-handover-print-left">{line.name}</td>
                    <td className="production-order-print-center">
                      {line.quantity !== null ? `${printNum(line.quantity)} KG` : ''}
                    </td>
                  </tr>
                ))}
                <tr className="shift-handover-print-total-row">
                  <td>TỔNG CỘNG</td>
                  <td className="production-order-print-center">{scrapTotal ? `${printNum(scrapTotal)} KG` : ''}</td>
                </tr>
              </tbody>
            </table>

            <h2 className="shift-handover-print-section">III. BÁO CÁO SX CUỐI CA</h2>
            <table className="production-order-print-grid-table shift-handover-print-kpi-table">
              <thead>
                <tr>
                  <th>CHỈ TIÊU</th>
                  <th>SL ĐM</th>
                  <th>THỰC TẾ</th>
                  <th>CHÊNH LỆCH</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((line, index) => (
                  <tr key={`${line.stt}-${index}`}>
                    <td className="shift-handover-print-left">{line.criteria}</td>
                    <td className="production-order-print-center">{printNum(line.norm)}</td>
                    <td className="production-order-print-center">{printNum(line.actual)}</td>
                    <td className="production-order-print-center">{printNum(line.variance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="shift-handover-print-section">IV. SỐ LƯỢNG TỒN CUỐI CA</h2>
            <table className="production-order-print-grid-table shift-handover-print-scrap-table">
              <thead>
                <tr>
                  <th>MÃ NVL</th>
                  <th>TÊN NVL</th>
                  <th>ĐVT</th>
                  <th>SỐ LƯỢNG</th>
                  <th>TL (KG)</th>
                </tr>
              </thead>
              <tbody>
                {closingStock.map((line, index) => (
                  <tr key={`${line.stt}-${index}`}>
                    <td className="production-order-print-center">{line.itemCode}</td>
                    <td className="shift-handover-print-left">{line.itemName}</td>
                    <td className="production-order-print-center">{line.unit}</td>
                    <td className="production-order-print-center">{printNum(line.quantity)}</td>
                    <td className="production-order-print-center">{printNum(line.weightKg)}</td>
                  </tr>
                ))}
                <tr className="shift-handover-print-total-row">
                  <td colSpan={3}>TỔNG CỘNG</td>
                  <td className="production-order-print-center">{printNum(closingTotals.quantity)}</td>
                  <td className="production-order-print-center">{printNum(closingTotals.weightKg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {showLegacyTasks ? (
          <>
            <h2 className="shift-handover-print-section">Công việc / sự cố bàn giao</h2>
            <table className="production-order-print-grid-table shift-handover-print-details-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Nội dung bàn giao</th>
                  <th>Mức độ</th>
                  <th>Người phụ trách</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map(line => (
                  <tr key={line.stt}>
                    <td className="production-order-print-center">{line.stt}</td>
                    <td>{line.content || '-'}</td>
                    <td className="production-order-print-center">{line.priority || '-'}</td>
                    <td>{line.assignee || '-'}</td>
                    <td className="production-order-print-center">{line.status || '-'}</td>
                    <td>{line.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {slip.note ? (
          <p className="machine-downtime-print-note">
            <strong>Ghi chú:</strong> {slip.note}
          </p>
        ) : null}

        <div className="machine-downtime-print-signatures shift-handover-print-signatures">
          <div>
            <p>Trưởng ca sản xuất</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Thủ kho thành phẩm</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Quản lý sản xuất</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShiftHandoverPrintBatch({ slips }: { slips: ShiftHandoverPrintSlip[] }) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch shift-handover-print-batch">
      {slips.map((slip, index) => (
        <div key={`${slip.slipCode}-${index}`} className="production-order-print-page shift-handover-print-page">
          <ShiftHandoverPrintSheet slip={slip} />
        </div>
      ))}
    </div>
  );
}

export function buildShiftHandoverPrintSlip(input: {
  slipCode?: string;
  date: string;
  shift: string;
  timeFrom?: string;
  timeTo?: string;
  machineCode: string;
  machineName: string;
  operators: string;
  products: SavedProductLine[];
  scraps: SavedScrapLine[];
  closingStockLines?: SavedClosingStockLine[];
  kpis: SavedKpiLine[];
  lines?: SavedHandoverTask[];
  note?: string;
}): ShiftHandoverPrintSlip {
  const machineLabel =
    input.machineCode && input.machineName && input.machineCode !== input.machineName
      ? `${input.machineCode} · ${input.machineName}`
      : input.machineName || input.machineCode || '';

  return {
    slipCode: input.slipCode || '',
    date: input.date,
    shift: input.shift,
    timeFrom: input.timeFrom || '',
    timeTo: input.timeTo || '',
    machineLabel,
    operators: input.operators,
    products: input.products,
    scraps: input.scraps,
    closingStockLines: input.closingStockLines || [],
    kpis: input.kpis,
    lines: input.lines || [],
    note: input.note || ''
  };
}

export function slipToPrintSlip(slip: ShiftHandoverSlip): ShiftHandoverPrintSlip {
  return buildShiftHandoverPrintSlip({
    slipCode: slip.slipCode,
    date: slip.date,
    shift: slip.shift,
    timeFrom: slip.timeFrom,
    timeTo: slip.timeTo,
    machineCode: slip.machineCode,
    machineName: slip.machineName,
    operators: slip.operators,
    products: slip.products,
    scraps: slip.scraps,
    closingStockLines: slip.closingStockLines || [],
    kpis: slip.kpis,
    lines: slip.lines,
    note: slip.note
  });
}
