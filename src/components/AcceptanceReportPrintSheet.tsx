import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
type AcceptanceReportSource = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
};

export type AcceptancePrintLine = {
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
};

export type AcceptancePrintSlip = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  machineLabel: string;
  lines: AcceptancePrintLine[];
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function machineLabelFromReport(report: AcceptanceReportSource) {
  if (report.ten_may && report.ma_may && report.ten_may !== report.ma_may) {
    return `${report.ma_may} · ${report.ten_may}`;
  }
  return report.ten_may || report.ma_may || '-';
}

function normalizeUnitKey(unit: string) {
  const trimmed = unit.trim();
  if (!trimmed) return '-';
  if (/^kg$/i.test(trimmed)) return 'kg';
  return trimmed;
}

export function sumByUnit(lines: AcceptancePrintLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const unitKey = normalizeUnitKey(line.don_vi || '');
    totals.set(unitKey, (totals.get(unitKey) ?? 0) + (line.so_luong ?? 0));
  }
  const unitOrder = (a: string, b: string) => {
    if (a === 'kg' && b !== 'kg') return 1;
    if (b === 'kg' && a !== 'kg') return -1;
    return a.localeCompare(b, 'vi');
  };
  return [...totals.entries()].sort(([a], [b]) => unitOrder(a, b));
}

export function buildAcceptancePrintSlips(reports: AcceptanceReportSource[]): AcceptancePrintSlip[] {
  // Mỗi bản ghi là một phiếu độc lập, nhận diện duy nhất bằng id.
  // Không gộp theo ngày, ca, lần, máy hoặc mặt hàng.
  return reports.map(report => ({
    id: report.id,
    ngay: report.ngay,
    ca: report.ca || '-',
    lan: report.lan || '-',
    gio: report.gio || '-',
    machineLabel: machineLabelFromReport(report),
    lines: [
      {
        mat_hang: report.mat_hang,
        ten_sp: report.ten_sp,
        don_vi: report.don_vi,
        so_luong: report.so_luong
      }
    ]
  }));
}

export function AcceptanceReportPrintSheet({ slip }: { slip: AcceptancePrintSlip }) {
  const totalsByUnit = sumByUnit(slip.lines);

  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">BÁO CÁO SẢN LƯỢNG</h1>

        <div className="production-order-print-meta">
          <span>Ngày: {formatPrintDate(slip.ngay)}</span>
          <span>Giờ: {slip.gio || '-'}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Ca</th>
              <th>Lần</th>
              <th>Tổ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-center">{slip.ca}</td>
              <td className="production-order-print-center">{slip.lan}</td>
              <td>{slip.machineLabel}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Danh sách sản phẩm sản lượng</h2>
        <table className="production-order-print-grid-table acceptance-report-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mặt hàng</th>
              <th>Tên SP</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((line, index) => (
              <tr key={`${line.mat_hang}-${index}`}>
                <td className="production-order-print-center">{index + 1}</td>
                <td>{line.mat_hang || '-'}</td>
                <td>{line.ten_sp || '-'}</td>
                <td className="production-order-print-center">{line.don_vi || '-'}</td>
                <td className="production-order-print-right">
                  {line.so_luong === null ? '-' : formatNumber(line.so_luong, 2)}
                </td>
              </tr>
            ))}
            {totalsByUnit.map(([unit, total]) => (
              <tr key={unit}>
                <td colSpan={4} className="production-order-print-right" style={{ fontWeight: 700 }}>
                  Tổng cộng ({unit})
                </td>
                <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                  {formatNumber(total, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="acceptance-report-print-signatures">
          <div>
            <p>Người ghi nhận</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca sản xuất</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Quản lý sản xuất</p>
            <span>(Ký, họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcceptanceReportPrintBatch({ slips }: { slips: AcceptancePrintSlip[] }) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch">
      {slips.map(slip => (
        <div key={slip.id} className="production-order-print-page">
          <AcceptanceReportPrintSheet slip={slip} />
        </div>
      ))}
    </div>
  );
}
