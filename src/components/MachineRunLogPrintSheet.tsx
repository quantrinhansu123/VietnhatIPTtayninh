import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';

export type MachineRunLogPrintLine = {
  stt: number;
  logTime: string;
  temperature: number | null;
  actualSpeed: number | null;
  standardSpeed: number | null;
  rollsProduced: number;
  downtimeMinutes: number;
  reason: string;
  recordedBy: string;
};

export type MachineRunLogPrintSlip = {
  slipCode: string;
  date: string;
  shift: string;
  machineLabel: string;
  mainOperator: string;
  startTime: string;
  endTime: string;
  parameterImageUrl: string;
  note: string;
  actualRunMinutes: number;
  /** Phiếu cũ — chỉ hiện khi còn dòng chi tiết. */
  lines: MachineRunLogPrintLine[];
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

function formatMaybeNumber(value: number | null, digits = 0) {
  if (value === null || !Number.isFinite(value)) return '-';
  return formatNumber(value, digits);
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function MachineRunLogPrintSheet({ slip }: { slip: MachineRunLogPrintSlip }) {
  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
          <div className="machine-run-log-print-form-code">
            <p>BM-SX-11</p>
            <span>Phiên bản 2.0</span>
          </div>
        </header>

        <h1 className="production-order-print-title">NHẬT KÝ CHẠY MÁY</h1>

        <div className="production-order-print-meta">
          <span>Số phiếu: {slip.slipCode || '-'}</span>
          <span>Ngày: {formatPrintDate(slip.date)}</span>
        </div>

        <table className="production-order-print-grid-table machine-run-log-print-info-table">
          <tbody>
            <tr>
              <th>Ngày</th>
              <td>{formatPrintDate(slip.date)}</td>
              <th>Ca chạy</th>
              <td>{slip.shift || '-'}</td>
            </tr>
            <tr>
              <th>Giờ</th>
              <td>{formatPrintTime(slip.startTime)}</td>
              <th>Giờ dừng</th>
              <td>{formatPrintTime(slip.endTime)}</td>
            </tr>
            <tr>
              <th>Máy</th>
              <td>{slip.machineLabel || '-'}</td>
              <th>Nhân sự phụ trách</th>
              <td>{slip.mainOperator || '-'}</td>
            </tr>
            <tr>
              <th>Giờ chạy thực tế</th>
              <td colSpan={3}>{formatNumber(slip.actualRunMinutes, 0)} phút</td>
            </tr>
          </tbody>
        </table>

        {slip.note ? (
          <p className="machine-downtime-print-note">
            <strong>Ghi chú:</strong> {slip.note}
          </p>
        ) : null}

        {slip.parameterImageUrl ? (
          <div className="machine-run-log-print-photo">
            <p className="production-order-print-section-title">Ảnh thông số</p>
            <img src={slip.parameterImageUrl} alt="Ảnh thông số" />
          </div>
        ) : null}

        {slip.lines.length > 0 ? (
          <>
            <h2 className="production-order-print-section-title">Chi tiết (phiếu cũ)</h2>
            <table className="production-order-print-grid-table machine-run-log-print-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Thời điểm</th>
                  <th>Nhiệt độ</th>
                  <th>Tốc độ thực</th>
                  <th>TĐ định mức</th>
                  <th>Cuộn</th>
                  <th>Dừng (phút)</th>
                  <th>Lý do</th>
                  <th>Người ghi</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map(line => (
                  <tr key={line.stt}>
                    <td className="production-order-print-center">{line.stt}</td>
                    <td className="production-order-print-center">{formatPrintTime(line.logTime)}</td>
                    <td className="production-order-print-center">{formatMaybeNumber(line.temperature)}</td>
                    <td className="production-order-print-center">{formatMaybeNumber(line.actualSpeed)}</td>
                    <td className="production-order-print-center">{formatMaybeNumber(line.standardSpeed)}</td>
                    <td className="production-order-print-center">{formatNumber(line.rollsProduced, 0)}</td>
                    <td className="production-order-print-center">{formatNumber(line.downtimeMinutes, 0)}</td>
                    <td>{line.reason || '-'}</td>
                    <td>{line.recordedBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        <div className="machine-run-log-print-signatures">
          <div>
            <p>Nhân sự phụ trách</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Quản đốc xác nhận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MachineRunLogPrintBatch({ slips }: { slips: MachineRunLogPrintSlip[] }) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch">
      {slips.map((slip, index) => (
        <div key={`${slip.slipCode}-${index}`} className="production-order-print-page">
          <MachineRunLogPrintSheet slip={slip} />
        </div>
      ))}
    </div>
  );
}

export function buildMachineRunLogPrintSlip(input: {
  slipCode?: string;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  mainOperator: string;
  startTime: string;
  endTime: string;
  parameterImageUrl?: string;
  note: string;
  actualRunMinutes?: number;
  lines?: Array<{
    logTime: string;
    temperature: string | number | null;
    actualSpeed: string | number | null;
    standardSpeed: string | number | null;
    rollsProduced: string | number | null;
    downtimeMinutes: string | number | null;
    reason: string;
    recordedBy: string;
  }>;
}): MachineRunLogPrintSlip {
  const printLines = (input.lines || []).map((line, index) => ({
    stt: index + 1,
    logTime: String(line.logTime || '').trim(),
    temperature: toNumberOrNull(line.temperature),
    actualSpeed: toNumberOrNull(line.actualSpeed),
    standardSpeed: toNumberOrNull(line.standardSpeed),
    rollsProduced: toNumberOrNull(line.rollsProduced) ?? 0,
    downtimeMinutes: toNumberOrNull(line.downtimeMinutes) ?? 0,
    reason: String(line.reason || '').trim(),
    recordedBy: String(line.recordedBy || '').trim()
  }));

  const startMatch = String(input.startTime || '').trim().match(/^(\d{1,2}):(\d{2})/);
  const endMatch = String(input.endTime || '').trim().match(/^(\d{1,2}):(\d{2})/);
  let computedMinutes = 0;
  if (startMatch && endMatch) {
    const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
    let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
    if (endMinutes < startMinutes) endMinutes += 24 * 60;
    computedMinutes = Math.max(0, endMinutes - startMinutes);
  }

  const machineLabel =
    input.machineCode && input.machineName && input.machineCode !== input.machineName
      ? `${input.machineCode} · ${input.machineName}`
      : input.machineName || input.machineCode || '-';

  return {
    slipCode: input.slipCode || '',
    date: input.date,
    shift: input.shift,
    machineLabel,
    mainOperator: input.mainOperator,
    startTime: input.startTime,
    endTime: input.endTime,
    parameterImageUrl: String(input.parameterImageUrl || '').trim(),
    note: input.note,
    actualRunMinutes:
      input.actualRunMinutes != null && Number.isFinite(input.actualRunMinutes)
        ? Number(input.actualRunMinutes)
        : computedMinutes,
    lines: printLines
  };
}
