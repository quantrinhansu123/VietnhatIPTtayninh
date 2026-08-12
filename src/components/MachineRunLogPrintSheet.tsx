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
  productionOrder: string;
  productCode: string;
  mainOperator: string;
  assistantOperator: string;
  plannedRunHours: number;
  note: string;
  totalRollsProduced: number;
  totalDowntimeMinutes: number;
  actualRunMinutes: number;
  timeEfficiencyPct: number | null;
  speedAttainmentPct: number | null;
  productivityRollsPerHour: number | null;
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
            <span>Phiên bản 1.0</span>
          </div>
        </header>

        <h1 className="production-order-print-title">NHẬT KÝ CHẠY MÁY</h1>
        <p className="machine-run-log-print-subtitle">(Thợ chính máy điền nhật ký mỗi 2 giờ/lần)</p>

        <div className="production-order-print-meta">
          <span>Số phiếu: {slip.slipCode || '-'}</span>
          <span>Ngày: {formatPrintDate(slip.date)}</span>
        </div>

        <table className="production-order-print-grid-table machine-run-log-print-info-table">
          <tbody>
            <tr>
              <th>Ngày sản xuất</th>
              <td>{formatPrintDate(slip.date)}</td>
              <th>Ca</th>
              <td>{slip.shift || '-'}</td>
            </tr>
            <tr>
              <th>Máy</th>
              <td>{slip.machineLabel || '-'}</td>
              <th>Lệnh sản xuất số</th>
              <td>{slip.productionOrder || '-'}</td>
            </tr>
            <tr>
              <th>Mã sản phẩm</th>
              <td>{slip.productCode || '-'}</td>
              <th>Thợ chính máy</th>
              <td>{slip.mainOperator || '-'}</td>
            </tr>
            <tr>
              <th>Giờ chạy KH (giờ)</th>
              <td>{formatNumber(slip.plannedRunHours, 2)}</td>
              <th>Thợ phụ máy</th>
              <td>{slip.assistantOperator || '-'}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Nhật ký ghi nhận</h2>
        <table className="production-order-print-grid-table machine-run-log-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Thời điểm ghi (giờ:phút)</th>
              <th>Nhiệt độ gia nhiệt (°C)</th>
              <th>Tốc độ thực (m/phút)</th>
              <th>Tốc độ định mức (m/phút)</th>
              <th>Số cuộn ra trong kỳ</th>
              <th>Thời gian dừng (phút)</th>
              <th>Lý do dừng / bất thường</th>
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
            <tr>
              <td colSpan={5} className="production-order-print-right" style={{ fontWeight: 700 }}>
                Tổng cộng
              </td>
              <td className="production-order-print-center" style={{ fontWeight: 700 }}>
                {formatNumber(slip.totalRollsProduced, 0)}
              </td>
              <td className="production-order-print-center" style={{ fontWeight: 700 }}>
                {formatNumber(slip.totalDowntimeMinutes, 0)}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Tổng kết hiệu suất máy trong ca (tự động tính)</h2>
        <table className="production-order-print-grid-table machine-run-log-print-summary-table">
          <tbody>
            <tr>
              <th>Tổng thời gian dừng máy (phút)</th>
              <td className="production-order-print-center">{formatNumber(slip.totalDowntimeMinutes, 0)}</td>
              <td>Cộng thời gian dừng các dòng nhật ký và Phiếu báo dừng máy (BM-SX-10).</td>
            </tr>
            <tr>
              <th>Thời gian chạy thực tế (phút)</th>
              <td className="production-order-print-center">{formatNumber(slip.actualRunMinutes, 0)}</td>
              <td>Bằng Giờ chạy kế hoạch × 60 − Tổng thời gian dừng.</td>
            </tr>
            <tr>
              <th>Hiệu suất thời gian chạy máy (%)</th>
              <td className="production-order-print-center">{formatMaybeNumber(slip.timeEfficiencyPct, 1)}</td>
              <td>Mục tiêu ≥ 85%. Lệch chỉ tiêu KPI thì xử lý theo thợ chính.</td>
            </tr>
            <tr>
              <th>Tốc độ bình quân đạt định mức (%)</th>
              <td className="production-order-print-center">{formatMaybeNumber(slip.speedAttainmentPct, 1)}</td>
              <td>Mục tiêu 95%. Phân tích máy chạy dưới định mức nếu thấp hơn.</td>
            </tr>
            <tr>
              <th>Tổng số cuộn ra trong ca</th>
              <td className="production-order-print-center">{formatNumber(slip.totalRollsProduced, 0)}</td>
              <td>Đối chiếu với Báo cáo sản lượng (BM-SX-08) của thợ phụ.</td>
            </tr>
            <tr>
              <th>Năng suất máy (cuộn/giờ chạy thực)</th>
              <td className="production-order-print-center">{formatMaybeNumber(slip.productivityRollsPerHour, 2)}</td>
              <td>Bằng Tổng cuộn ra ÷ Giờ chạy thực tế. Dùng cho tính toán chi phí máy/giờ.</td>
            </tr>
          </tbody>
        </table>

        {slip.note && (
          <p className="machine-downtime-print-note">
            <strong>Ghi chú:</strong> {slip.note}
          </p>
        )}

        <p className="machine-downtime-print-footnote">
          Hướng dẫn: Thợ chính ghi mỗi 2 giờ. Chỉ nhập ô ở cột trắng; các ô "tự động tính" hệ thống điền sẵn.
          Thời gian dừng máy phải khớp với Phiếu báo dừng máy (BM-SX-10). Số cuộn ra phải khớp Báo cáo sản lượng (BM-SX-08).
        </p>

        <div className="machine-run-log-print-signatures">
          <div>
            <p>Thợ chính máy (người ghi)</p>
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

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function buildMachineRunLogPrintSlip(input: {
  slipCode?: string;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  productionOrder: string;
  productCode: string;
  mainOperator: string;
  assistantOperator: string;
  plannedRunHours: string | number;
  note: string;
  lines: Array<{
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
  const printLines = input.lines.map((line, index) => ({
    stt: index + 1,
    logTime: line.logTime.trim(),
    temperature: toNumberOrNull(line.temperature),
    actualSpeed: toNumberOrNull(line.actualSpeed),
    standardSpeed: toNumberOrNull(line.standardSpeed),
    rollsProduced: toNumberOrNull(line.rollsProduced) ?? 0,
    downtimeMinutes: toNumberOrNull(line.downtimeMinutes) ?? 0,
    reason: line.reason.trim(),
    recordedBy: line.recordedBy.trim()
  }));

  const plannedRunHours = toNumberOrNull(input.plannedRunHours) ?? 0;
  const totalRollsProduced = printLines.reduce((sum, line) => sum + line.rollsProduced, 0);
  const totalDowntimeMinutes = printLines.reduce((sum, line) => sum + line.downtimeMinutes, 0);
  const plannedMinutes = plannedRunHours * 60;
  const actualRunMinutes = Math.max(0, plannedMinutes - totalDowntimeMinutes);
  const timeEfficiencyPct = plannedMinutes > 0 ? (actualRunMinutes / plannedMinutes) * 100 : null;

  const speedRatios = printLines
    .filter(line => (line.standardSpeed ?? 0) > 0 && (line.actualSpeed ?? 0) > 0)
    .map(line => (line.actualSpeed as number) / (line.standardSpeed as number));
  const speedAttainmentPct =
    speedRatios.length > 0
      ? (speedRatios.reduce((sum, ratio) => sum + ratio, 0) / speedRatios.length) * 100
      : null;

  const productivityRollsPerHour =
    actualRunMinutes > 0 ? totalRollsProduced / (actualRunMinutes / 60) : null;

  const machineLabel =
    input.machineCode && input.machineName && input.machineCode !== input.machineName
      ? `${input.machineCode} · ${input.machineName}`
      : input.machineName || input.machineCode || '-';

  return {
    slipCode: input.slipCode || '',
    date: input.date,
    shift: input.shift,
    machineLabel,
    productionOrder: input.productionOrder,
    productCode: input.productCode,
    mainOperator: input.mainOperator,
    assistantOperator: input.assistantOperator,
    plannedRunHours,
    note: input.note,
    totalRollsProduced,
    totalDowntimeMinutes,
    actualRunMinutes,
    timeEfficiencyPct,
    speedAttainmentPct,
    productivityRollsPerHour,
    lines: printLines
  };
}
