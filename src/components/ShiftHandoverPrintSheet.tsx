import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import {
  SHIFT_HANDOVER_FORM_CODE,
  SHIFT_HANDOVER_FORM_EFFECTIVE,
  SHIFT_HANDOVER_FORM_ISSUE,
  mixingLineHasData,
  mixedTotalFromUses,
  sumClosingStockTotals,
  type SavedClosingStockLine,
  type SavedHandoverTask,
  type SavedKpiLine,
  type SavedMixingMaterialLine,
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
  materials: SavedMixingMaterialLine[];
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

function emptyClosingStock(stt: number): SavedClosingStockLine {
  return { stt, itemCode: '', itemName: '', unit: '', quantity: null, weightKg: null };
}

function emptyMixing(stt: number): SavedMixingMaterialLine {
  return {
    stt,
    materialCode: '',
    materialName: '',
    unit: '',
    normKg: null,
    percent: null,
    opening: null,
    takenFromWh: null,
    use1: null,
    use2: null,
    use3: null,
    use4: null,
    use5: null,
    mixedTotal: null,
    closing: null,
    actualUsage: null
  };
}

export function ShiftHandoverPrintSheet({ slip }: { slip: ShiftHandoverPrintSlip }) {
  const dateParts = formatPrintDate(slip.date);
  const closingStock = padRows(slip.closingStockLines || [], 5, emptyClosingStock);
  const closingTotals = sumClosingStockTotals(slip.closingStockLines || []);
  const mixingLines = (slip.materials || []).filter(
    line => mixingLineHasData(line) || Boolean(line.materialCode)
  );
  const mixing = padRows(mixingLines, 6, emptyMixing);
  const mixingTotal = mixingLines.reduce((sum, line) => {
    const mixed = line.mixedTotal ?? mixedTotalFromUses(line.use1, line.use2, line.use3, line.use4, line.use5);
    return sum + (mixed ?? 0);
  }, 0);
  const showLegacyTasks = (slip.closingStockLines || []).length === 0 && mixingLines.length === 0 && slip.lines.length > 0;

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
          <section className="shift-handover-print-block">
            <h2 className="shift-handover-print-section">1. Số lượng tồn cuối ca</h2>
            <table className="production-order-print-grid-table shift-handover-print-scrap-table">
              <colgroup>
                <col className="shift-handover-col-code" />
                <col className="shift-handover-col-name" />
                <col className="shift-handover-col-unit" />
                <col className="shift-handover-col-qty" />
                <col className="shift-handover-col-kg" />
              </colgroup>
              <thead>
                <tr>
                  <th>Mã NVL</th>
                  <th>Tên NVL</th>
                  <th>ĐVT</th>
                  <th>Số lượng</th>
                  <th>TL (kg)</th>
                </tr>
              </thead>
              <tbody>
                {closingStock.map((line, index) => (
                  <tr key={`${line.stt}-${index}`}>
                    <td className="shift-handover-print-code">{line.itemCode}</td>
                    <td className="shift-handover-print-left">{line.itemName}</td>
                    <td className="production-order-print-center">{line.unit}</td>
                    <td className="production-order-print-right">{printNum(line.quantity)}</td>
                    <td className="production-order-print-right">{printNum(line.weightKg)}</td>
                  </tr>
                ))}
                <tr className="shift-handover-print-total-row">
                  <td colSpan={3}>Tổng cộng</td>
                  <td className="production-order-print-right">{printNum(closingTotals.quantity)}</td>
                  <td className="production-order-print-right">{printNum(closingTotals.weightKg)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="shift-handover-print-block">
            <h2 className="shift-handover-print-section">2. Bảng trộn vật tư</h2>
            <table className="production-order-print-grid-table shift-handover-print-mixing-table">
              <colgroup>
                <col className="shift-handover-mix-stt" />
                <col className="shift-handover-mix-name" />
                <col className="shift-handover-mix-unit" />
                <col className="shift-handover-mix-pct" />
                <col className="shift-handover-mix-use" />
                <col className="shift-handover-mix-use" />
                <col className="shift-handover-mix-use" />
                <col className="shift-handover-mix-use" />
                <col className="shift-handover-mix-use" />
                <col className="shift-handover-mix-total" />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>STT</th>
                  <th rowSpan={2}>Tên vật tư</th>
                  <th rowSpan={2}>ĐVT</th>
                  <th rowSpan={2}>Tỉ lệ ĐM<br />(%)</th>
                  <th colSpan={5}>Sử dụng (kg)</th>
                  <th rowSpan={2}>Tổng nhựa<br />trộn</th>
                </tr>
                <tr>
                  <th>Lần 1</th>
                  <th>Lần 2</th>
                  <th>Lần 3</th>
                  <th>Lần 4</th>
                  <th>Lần 5</th>
                </tr>
              </thead>
              <tbody>
                {mixing.map((line, index) => {
                  const mixed =
                    line.mixedTotal ?? mixedTotalFromUses(line.use1, line.use2, line.use3, line.use4, line.use5);
                  return (
                    <tr key={`${line.stt}-${index}`}>
                      <td className="production-order-print-center">{index + 1}</td>
                      <td className="shift-handover-print-left">
                        {line.materialName || line.materialCode}
                      </td>
                      <td className="production-order-print-center">{line.unit}</td>
                      <td className="production-order-print-right">{printNum(line.percent, 1)}</td>
                      <td className="production-order-print-right">{printNum(line.use1)}</td>
                      <td className="production-order-print-right">{printNum(line.use2)}</td>
                      <td className="production-order-print-right">{printNum(line.use3)}</td>
                      <td className="production-order-print-right">{printNum(line.use4)}</td>
                      <td className="production-order-print-right">{printNum(line.use5)}</td>
                      <td className="production-order-print-right">{printNum(mixed)}</td>
                    </tr>
                  );
                })}
                <tr className="shift-handover-print-total-row">
                  <td colSpan={9}>Tổng cộng</td>
                  <td className="production-order-print-right">{printNum(mixingTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>
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
  materials?: SavedMixingMaterialLine[];
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
    materials: input.materials || [],
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
    materials: slip.materials || [],
    kpis: slip.kpis,
    lines: slip.lines,
    note: slip.note
  });
}
