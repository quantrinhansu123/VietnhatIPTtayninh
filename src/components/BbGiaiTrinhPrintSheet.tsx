import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import type { BbGiaiTrinhFields } from '../utils/bbGiaiTrinh';
import type { BbProductionOrderGroup } from '../utils/controlBoardBbMachineReport';

export type BbGiaiTrinhPrintRow = {
  ngay: string;
  ca: string;
  orderCode: string;
  machine: string;
  fields: BbGiaiTrinhFields;
};

export type BbGiaiTrinhPrintReport = {
  title: string;
  filterText: string;
  printedAt: string;
  rows: BbGiaiTrinhPrintRow[];
};

function cellText(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  return text || '—';
}

export function BbGiaiTrinhPrintSheet({ report }: { report: BbGiaiTrinhPrintReport }) {
  return (
    <div className="bb-giai-trinh-print-sheet">
      <div className="production-order-print-doc bb-giai-trinh-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
          <div className="bb-giai-trinh-print-form-code">
            <p>BM-PT-01</p>
            <span>Phiên bản 1.0</span>
          </div>
        </header>

        <h1 className="production-order-print-title">BẢNG GIẢI TRÌNH</h1>
        <p className="bb-giai-trinh-print-subtitle">{report.filterText || '—'}</p>
        <p className="bb-giai-trinh-print-meta">In lúc: {report.printedAt}</p>

        <table className="bb-giai-trinh-print-table">
          <colgroup>
            <col className="bb-giai-trinh-col-stt" />
            <col className="bb-giai-trinh-col-ngay" />
            <col className="bb-giai-trinh-col-ca" />
            <col className="bb-giai-trinh-col-order" />
            <col className="bb-giai-trinh-col-may" />
            <col className="bb-giai-trinh-col-van-de" />
            <col className="bb-giai-trinh-col-giai-quyet" />
            <col className="bb-giai-trinh-col-lap" />
            <col className="bb-giai-trinh-col-nct" />
          </colgroup>
          <thead>
            <tr>
              <th>STT</th>
              <th>Ngày</th>
              <th>Ca</th>
              <th>Số lệnh SX</th>
              <th>Máy</th>
              <th>Vấn đề</th>
              <th>Giải quyết</th>
              <th>Lần lặp lại</th>
              <th>Người chịu trách nhiệm</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="bb-giai-trinh-print-empty">
                  Chưa có dòng giải trình.
                </td>
              </tr>
            ) : (
              report.rows.map((row, index) => (
                <tr key={`${row.orderCode}-${row.ngay}-${index}`}>
                  <td className="bb-giai-trinh-print-center">{index + 1}</td>
                  <td>{cellText(row.ngay)}</td>
                  <td>{cellText(row.ca)}</td>
                  <td className="bb-giai-trinh-print-mono">{cellText(row.orderCode)}</td>
                  <td>{cellText(row.machine)}</td>
                  <td className="bb-giai-trinh-print-text">{cellText(row.fields.van_de)}</td>
                  <td className="bb-giai-trinh-print-text">{cellText(row.fields.giai_quyet)}</td>
                  <td>{cellText(row.fields.lan_lap_lai)}</td>
                  <td>{cellText(row.fields.nguoi_chiu_trach_nhiem)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function buildBbGiaiTrinhPrintReport(input: {
  orderGroups: BbProductionOrderGroup[];
  giaiTrinhMap: Record<string, BbGiaiTrinhFields>;
  dateFrom: string;
  dateTo: string;
  shiftFilter?: string;
  machineFilter?: string;
}): BbGiaiTrinhPrintReport {
  const filterParts = [
    input.dateFrom && input.dateTo
      ? input.dateFrom === input.dateTo
        ? `Ngày ${input.dateFrom}`
        : `Từ ${input.dateFrom} → ${input.dateTo}`
      : input.dateFrom
        ? `Từ ngày ${input.dateFrom}`
        : input.dateTo
          ? `Đến ngày ${input.dateTo}`
          : 'Tất cả ngày',
    input.shiftFilter && input.shiftFilter !== 'all' ? `Ca ${input.shiftFilter}` : '',
    input.machineFilter && input.machineFilter !== 'all' ? `Máy ${input.machineFilter}` : ''
  ].filter(Boolean);

  const printedAt = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());

  return {
    title: 'BẢNG GIẢI TRÌNH',
    filterText: filterParts.join(' · '),
    printedAt,
    rows: input.orderGroups.map(group => ({
      ngay: group.ngay,
      ca: group.shiftLabel || group.shift,
      orderCode: group.orderCode,
      machine: group.machine,
      fields: input.giaiTrinhMap[group.groupKey] || {
        van_de: '',
        giai_quyet: '',
        lan_lap_lai: '',
        nguoi_chiu_trach_nhiem: ''
      }
    }))
  };
}
