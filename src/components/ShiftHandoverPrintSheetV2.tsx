import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import {
  sumClosingStockTotals,
  type SavedClosingStockLine,
  type SavedHandoverTask,
  type SavedKpiLine,
  type SavedMixingMaterialLine,
  type SavedProductLine,
  type SavedScrapLine,
  type ShiftHandoverSlip
} from '../lib/shiftHandoverModel';
import type { ShiftHandoverPrintSlip } from './ShiftHandoverPrintSheet';

export type { ShiftHandoverPrintSlip } from './ShiftHandoverPrintSheet';
export { buildShiftHandoverPrintSlip, slipToPrintSlip } from './ShiftHandoverPrintSheet';

function num(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? '' : formatNumber(value, digits);
}

function dateText(value: string) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : value || '-';
}

function timeText(value: string) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}h${match[2]}` : value || '...';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="shift-print-v2-section"><h2>{title}</h2>{children}</section>;
}

export function ShiftHandoverPrintSheetV2({ slip }: { slip: ShiftHandoverPrintSlip }) {
  const stock = slip.closingStockLines || [];
  const products = slip.products || [];
  const scraps = slip.scraps || [];
  const kpis = slip.kpis || [];
  const tasks = slip.lines || [];
  const totals = sumClosingStockTotals(stock);

  return (
    <article className="shift-print-v2-sheet">
      <header className="shift-print-v2-header">
        <div className="shift-print-v2-brand"><img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} /><div><b>{PRINT_COMPANY_NAME}</b><span>VIET NHAT IPT — HIGH QUALITY</span></div></div>
      </header>
      <div className="shift-print-v2-heading"><h1>NHẬT KÝ SẢN XUẤT KIÊM PHIẾU GIAO CA</h1><p>QT-16-BM02</p></div>

      <table className="shift-print-v2-info"><tbody><tr><th>Số phiếu</th><td>{slip.slipCode || '...'}</td><th>Ngày</th><td>{dateText(slip.date)}</td></tr><tr><th>Ca sản xuất</th><td>{timeText(slip.timeFrom)} – {timeText(slip.timeTo)} {slip.shift && `(${slip.shift})`}</td><th>Máy</th><td>{slip.machineLabel || '...'}</td></tr><tr><th>Người thực hiện</th><td colSpan={3}>{slip.operators || '...'}</td></tr></tbody></table>

      <Section title="1. Số lượng tồn cuối ca"><table className="shift-print-v2-table"><thead><tr><th>Mã NVL</th><th>Tên NVL</th><th>ĐVT</th><th>Số lượng</th><th>TL (kg)</th></tr></thead><tbody>{stock.map((line, i) => <tr key={`${line.stt}-${i}`}><td>{line.itemCode}</td><td className="left">{line.itemName}</td><td>{line.unit}</td><td>{num(line.quantity)}</td><td>{num(line.weightKg)}</td></tr>)}<tr className="total"><td colSpan={3}>Tổng cộng</td><td>{num(totals.quantity)}</td><td>{num(totals.weightKg)}</td></tr></tbody></table></Section>

      {products.length > 0 && <Section title="2. Thành phẩm"><table className="shift-print-v2-table"><thead><tr><th>STT</th><th className="left">Mã / tên sản phẩm</th><th>SL</th><th>TL cuộn</th><th>Định mức nhựa</th><th>Hàng lỗi 20%</th><th>Hàng lỗi 30%</th></tr></thead><tbody>{products.map((line, i) => <tr key={`${line.stt}-${i}`}><td>{i + 1}</td><td className="left">{line.productCode} — {line.productName}</td><td>{num(line.quantity)}</td><td>{num(line.rollWeight)}</td><td>{num(line.resinNorm)}</td><td>{line.defect20}</td><td>{line.defect30}</td></tr>)}</tbody></table></Section>}
      {scraps.length > 0 && <Section title="3. Hàng lỗi"><table className="shift-print-v2-table"><thead><tr><th>STT</th><th className="left">Nội dung</th><th>Số lượng</th></tr></thead><tbody>{scraps.map((line, i) => <tr key={`${line.stt}-${i}`}><td>{i + 1}</td><td className="left">{line.name}</td><td>{num(line.quantity)}</td></tr>)}</tbody></table></Section>}
      {kpis.length > 0 && <Section title="4. Chỉ tiêu / KPI"><table className="shift-print-v2-table"><thead><tr><th>STT</th><th className="left">Tiêu chí</th><th>Định mức</th><th>Thực tế</th><th>Chênh lệch</th></tr></thead><tbody>{kpis.map((line, i) => <tr key={`${line.stt}-${i}`}><td>{i + 1}</td><td className="left">{line.criteria}</td><td>{num(line.norm)}</td><td>{num(line.actual)}</td><td>{num(line.variance)}</td></tr>)}</tbody></table></Section>}
      {tasks.length > 0 && <Section title="5. Công việc / sự cố bàn giao"><table className="shift-print-v2-table"><thead><tr><th>STT</th><th className="left">Nội dung</th><th>Mức độ</th><th>Người phụ trách</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead><tbody>{tasks.map((line, i) => <tr key={`${line.stt}-${i}`}><td>{i + 1}</td><td className="left">{line.content}</td><td>{line.priority}</td><td>{line.assignee}</td><td>{line.status}</td><td className="left">{line.note}</td></tr>)}</tbody></table></Section>}
      {slip.note && <p className="shift-print-v2-note"><b>Ghi chú:</b> {slip.note}</p>}
      <footer className="shift-print-v2-signatures"><div><b>Trưởng ca sản xuất</b><span>(Ký, ghi rõ họ tên)</span></div><div><b>Thủ kho thành phẩm</b><span>(Ký, ghi rõ họ tên)</span></div><div><b>Quản lý sản xuất</b><span>(Ký, ghi rõ họ tên)</span></div></footer>
    </article>
  );
}

export function ShiftHandoverPrintBatchV2({ slips }: { slips: ShiftHandoverPrintSlip[] }) {
  if (!slips.length) return null;
  return <div className="shift-print-v2-batch">{slips.map((slip, i) => <div className="shift-print-v2-page" key={`${slip.slipCode}-${i}`}><ShiftHandoverPrintSheetV2 slip={slip} /></div>)}</div>;
}

export type { ShiftHandoverSlip, SavedClosingStockLine, SavedHandoverTask, SavedKpiLine, SavedMixingMaterialLine, SavedProductLine, SavedScrapLine };
