import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
export type MachineDowntimePrintLine = {
  stt: number;
  startTime: string;
  restartTime: string;
  downtimeMinutes: number;
  reason: string;
  rollsAffected: number;
  confirmedBy: string;
  note: string;
};

export type MachineDowntimePrintSlip = {
  slipCode: string;
  date: string;
  shift: string;
  machineLabel: string;
  preparedBy: string;
  productionOrder: string;
  note: string;
  totalDowntimeMinutes: number;
  totalRollsAffected: number;
  lines: MachineDowntimePrintLine[];
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatPrintTime(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '-';
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function MachineDowntimePrintSheet({ slip }: { slip: MachineDowntimePrintSlip }) {
  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">PHIẾU BÁO DỪNG MÁY</h1>

        <div className="production-order-print-meta">
          <span>Số phiếu: {slip.slipCode || '-'}</span>
          <span>Ngày: {formatPrintDate(slip.date)}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Ca</th>
              <th>Máy</th>
              <th>Người lập</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-center">{slip.shift || '-'}</td>
              <td>{slip.machineLabel || '-'}</td>
              <td>{slip.preparedBy || '-'}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Chi tiết dừng máy</h2>
        <table className="production-order-print-grid-table machine-downtime-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Bắt đầu dừng</th>
              <th>Chạy lại</th>
              <th>Tổng (phút)</th>
              <th>Lý do dừng máy</th>
              <th>Số cuộn</th>
              <th>Người xác nhận</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map(line => (
              <tr key={line.stt}>
                <td className="production-order-print-center">{line.stt}</td>
                <td className="production-order-print-center">{formatPrintTime(line.startTime)}</td>
                <td className="production-order-print-center">{formatPrintTime(line.restartTime)}</td>
                <td className="production-order-print-center">{formatNumber(line.downtimeMinutes, 0)}</td>
                <td>{line.reason || '-'}</td>
                <td className="production-order-print-center">{formatNumber(line.rollsAffected, 0)}</td>
                <td>{line.confirmedBy || '-'}</td>
                <td>{line.note || '-'}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="production-order-print-right" style={{ fontWeight: 700 }}>
                Tổng cộng
              </td>
              <td className="production-order-print-center" style={{ fontWeight: 700 }}>
                {formatNumber(slip.totalDowntimeMinutes, 0)}
              </td>
              <td />
              <td className="production-order-print-center" style={{ fontWeight: 700 }}>
                {formatNumber(slip.totalRollsAffected, 0)}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>

        {slip.note && (
          <p className="machine-downtime-print-note">
            <strong>Ghi chú:</strong> {slip.note}
          </p>
        )}

        <p className="machine-downtime-print-footnote">
          Ghi chú: Ghi nhận ngay khi phát sinh. Hệ thống tự trừ định mức thời gian và số cuộn sản phẩm để đo lường hiệu suất máy.
        </p>

        <div className="machine-downtime-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Bộ phận kế hoạch / kỹ thuật</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MachineDowntimePrintBatch({ slips }: { slips: MachineDowntimePrintSlip[] }) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch">
      {slips.map((slip, index) => (
        <div key={`${slip.slipCode}-${index}`} className="production-order-print-page">
          <MachineDowntimePrintSheet slip={slip} />
        </div>
      ))}
    </div>
  );
}

export function buildMachineDowntimePrintSlip(input: {
  slipCode?: string;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  preparedBy: string;
  productionOrder: string;
  note: string;
  lines: Array<{
    startTime: string;
    restartTime: string;
    reason: string;
    rollsAffected: string | number;
    confirmedBy: string;
    note: string;
  }>;
}): MachineDowntimePrintSlip {
  const printLines = input.lines.map((line, index) => {
    const startTime = line.startTime.trim();
    const restartTime = line.restartTime.trim();
    const startMatch = startTime.match(/^(\d{1,2}):(\d{2})/);
    const endMatch = restartTime.match(/^(\d{1,2}):(\d{2})/);
    let downtimeMinutes = 0;
    if (startMatch && endMatch) {
      const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
      let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
      if (endMinutes < startMinutes) endMinutes += 24 * 60;
      downtimeMinutes = Math.max(0, endMinutes - startMinutes);
    }
    const rolls =
      typeof line.rollsAffected === 'number'
        ? line.rollsAffected
        : Number(String(line.rollsAffected).replace(',', '.')) || 0;

    return {
      stt: index + 1,
      startTime,
      restartTime,
      downtimeMinutes,
      reason: line.reason.trim(),
      rollsAffected: rolls,
      confirmedBy: line.confirmedBy.trim(),
      note: line.note.trim()
    };
  });

  const machineLabel =
    input.machineCode && input.machineName && input.machineCode !== input.machineName
      ? `${input.machineCode} · ${input.machineName}`
      : input.machineName || input.machineCode || '-';

  return {
    slipCode: input.slipCode || '',
    date: input.date,
    shift: input.shift,
    machineLabel,
    preparedBy: input.preparedBy,
    productionOrder: input.productionOrder,
    note: input.note,
    totalDowntimeMinutes: printLines.reduce((sum, line) => sum + line.downtimeMinutes, 0),
    totalRollsAffected: printLines.reduce((sum, line) => sum + line.rollsAffected, 0),
    lines: printLines
  };
}
