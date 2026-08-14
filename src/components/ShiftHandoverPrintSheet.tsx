import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';

export type ShiftHandoverPrintLine = {
  stt: number;
  content: string;
  priority: string;
  assignee: string;
  status: string;
  note: string;
};

export type ShiftHandoverPrintSlip = {
  slipCode: string;
  date: string;
  shift: string;
  nextShift: string;
  machineLabel: string;
  handoverBy: string;
  receivedBy: string;
  productionStatus: string;
  output: string;
  machineStatus: string;
  endingStock: string;
  note: string;
  lines: ShiftHandoverPrintLine[];
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function ShiftHandoverPrintSheet({ slip }: { slip: ShiftHandoverPrintSlip }) {
  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">PHIẾU GIAO CA</h1>

        <div className="production-order-print-meta">
          <span>Số phiếu: {slip.slipCode || '-'}</span>
          <span>Ngày: {formatPrintDate(slip.date)}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Ca giao</th>
              <th>Ca nhận</th>
              <th>Máy / Chuyền</th>
              <th>Người giao ca</th>
              <th>Người nhận ca</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-center">{slip.shift || '-'}</td>
              <td className="production-order-print-center">{slip.nextShift || '-'}</td>
              <td>{slip.machineLabel || '-'}</td>
              <td>{slip.handoverBy || '-'}</td>
              <td>{slip.receivedBy || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Tình hình sản xuất trong ca</th>
              <th>Sản lượng đạt được</th>
              <th>Tình trạng máy móc</th>
              <th>Tồn kho cuối ca</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{slip.productionStatus || '-'}</td>
              <td>{slip.output || '-'}</td>
              <td>{slip.machineStatus || '-'}</td>
              <td>{slip.endingStock || '-'}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Công việc / sự cố bàn giao</h2>
        <table className="production-order-print-grid-table">
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
            {slip.lines.length === 0 && (
              <tr>
                <td colSpan={6} className="production-order-print-center">
                  Không có việc bàn giao.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {slip.note && (
          <p className="machine-downtime-print-note">
            <strong>Ghi chú:</strong> {slip.note}
          </p>
        )}

        <div className="machine-downtime-print-signatures shift-handover-print-signatures">
          <div>
            <p>Người giao ca</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Người nhận ca</p>
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
    <div className="production-order-print-batch">
      {slips.map((slip, index) => (
        <div key={`${slip.slipCode}-${index}`} className="production-order-print-page">
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
  nextShift: string;
  machineCode: string;
  machineName: string;
  handoverBy: string;
  receivedBy: string;
  productionStatus: string;
  output: string;
  machineStatus: string;
  endingStock: string;
  note: string;
  lines: Array<{
    content: string;
    priority: string;
    assignee: string;
    status: string;
    note: string;
  }>;
}): ShiftHandoverPrintSlip {
  const printLines = input.lines.map((line, index) => ({
    stt: index + 1,
    content: line.content.trim(),
    priority: line.priority.trim(),
    assignee: line.assignee.trim(),
    status: line.status.trim(),
    note: line.note.trim()
  }));

  const machineLabel =
    input.machineCode && input.machineName && input.machineCode !== input.machineName
      ? `${input.machineCode} · ${input.machineName}`
      : input.machineName || input.machineCode || '-';

  return {
    slipCode: input.slipCode || '',
    date: input.date,
    shift: input.shift,
    nextShift: input.nextShift,
    machineLabel,
    handoverBy: input.handoverBy,
    receivedBy: input.receivedBy,
    productionStatus: input.productionStatus,
    output: input.output,
    machineStatus: input.machineStatus,
    endingStock: input.endingStock,
    note: input.note,
    lines: printLines
  };
}
