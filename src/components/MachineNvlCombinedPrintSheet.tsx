import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import {
  isKgUnit,
  machineNvlQtyToKg,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal
} from '../utils/machineNvlReports';
import type { MachineNvlPrintLine, MachineNvlPrintReport } from './MachineNvlPrintSheet';

export type CombinedMachineNvlReport = {
  key: string;
  opening: MachineNvlPrintReport | null;
  closing: MachineNvlPrintReport | null;
};

type CombinedLine = {
  key: string;
  line: MachineNvlPrintLine;
  opening: MachineNvlPrintLine | null;
  closing: MachineNvlPrintLine | null;
};

function dateText(value: string) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : value || '-';
}

function machineKey(report: MachineNvlPrintReport) {
  return `${report.maMay.trim().toLowerCase()}|${report.tenMay.trim().toLowerCase()}`;
}

function materialKey(line: MachineNvlPrintLine) {
  return line.maNvl.trim().toLowerCase() || `${line.tenNvl.trim().toLowerCase()}|${line.donVi.trim().toLowerCase()}`;
}

function quantityText(quantity: number | null, line: MachineNvlPrintLine) {
  if (quantity === null || !Number.isFinite(quantity)) return '';
  if (isKgUnit(line.donVi)) return formatNumber(quantity);
  const kg = machineNvlQtyToKg(quantity, line);
  return kg === null ? formatNumber(quantity) : `${formatNumber(quantity)} (${formatNumber(kg)} kg)`;
}

function totalKg(line: MachineNvlPrintLine | null, kind: 'dau_ca' | 'cuoi_ca') {
  if (!line) return 0;
  return kind === 'dau_ca' ? sumMachineNvlDauCaLineTotal(line) : sumMachineNvlCuoiCaLineTotal(line);
}

/** Ghép tồn đầu/cuối theo máy, chỉ dùng trong bản in Danh sách báo cáo. */
export function buildCombinedMachineNvlReports(
  openingReports: MachineNvlPrintReport[],
  closingReports: MachineNvlPrintReport[]
): CombinedMachineNvlReport[] {
  const openingByMachine = new Map<string, MachineNvlPrintReport[]>();
  const closingByMachine = new Map<string, MachineNvlPrintReport[]>();
  const order: string[] = [];

  const add = (map: Map<string, MachineNvlPrintReport[]>, report: MachineNvlPrintReport) => {
    const key = machineKey(report);
    if (!map.has(key)) {
      map.set(key, []);
      if (!order.includes(key)) order.push(key);
    }
    map.get(key)!.push(report);
  };

  openingReports.forEach(report => add(openingByMachine, report));
  closingReports.forEach(report => add(closingByMachine, report));

  return order.flatMap(key => {
    const opening = openingByMachine.get(key) || [];
    const closing = closingByMachine.get(key) || [];
    const count = Math.max(opening.length, closing.length);
    return Array.from({ length: count }, (_, index) => ({
      key: `${key}-${index}`,
      opening: opening[index] || null,
      closing: closing[index] || null
    }));
  });
}

export function MachineNvlCombinedPrintSheet({ report }: { report: CombinedMachineNvlReport }) {
  const source = report.opening || report.closing;
  if (!source) return null;
  const machineLabel = source.maMay && source.tenMay && source.maMay !== source.tenMay
    ? `${source.maMay} · ${source.tenMay}`
    : source.tenMay || source.maMay || '-';
  const rows = new Map<string, CombinedLine>();
  const addLines = (lines: MachineNvlPrintLine[], kind: 'opening' | 'closing') => {
    lines.forEach(line => {
      const key = materialKey(line);
      const current = rows.get(key) || { key, line, opening: null, closing: null };
      current[kind] = line;
      if (!current.line.maNvl && line.maNvl) current.line = line;
      rows.set(key, current);
    });
  };
  addLines(report.opening?.lines || [], 'opening');
  addLines(report.closing?.lines || [], 'closing');
  const lines = Array.from(rows.values());
  const openingKg = lines.reduce((sum, row) => sum + totalKg(row.opening, 'dau_ca'), 0);
  const closingKg = lines.reduce((sum, row) => sum + totalKg(row.closing, 'cuoi_ca'), 0);

  return (
    <div className="production-order-print-sheet machine-nvl-combined-print-sheet">
      <div className="production-order-print-doc machine-nvl-combined-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company"><p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p></div>
        </header>

        <h1 className="production-order-print-title">BẢNG KIỂM KÊ VẬT TƯ TỒN ĐẦU VÀ CUỐI CA</h1>
        <div className="production-order-print-meta"><span>Ngày: {dateText(source.ngay)}</span><span>Ca: {source.ca || '-'}</span></div>
        <table className="production-order-print-grid-table production-order-print-params-table"><thead><tr><th>Máy</th><th>Nhân sự</th><th>Ghi chú</th></tr></thead><tbody><tr><td>{machineLabel}</td><td>{source.nhanSu || '-'}</td><td className="whitespace-pre-wrap">{[report.opening?.note, report.closing?.note].filter(Boolean).join(' | ') || '-'}</td></tr></tbody></table>

        <h2 className="production-order-print-section-title">Chi tiết nguyên vật liệu tồn đầu và cuối ca</h2>
        <table className="production-order-print-grid-table machine-nvl-combined-print-table">
          <thead><tr><th>STT</th><th>Mã vật tư</th><th>Tên vật tư</th><th>ĐVT</th><th>Tồn đầu ca</th><th>Tồn cuối ca</th><th>Kg đầu ca</th><th>Kg cuối ca</th><th>Ghi chú</th></tr></thead>
          <tbody>
            {lines.map((row, index) => {
              const line = row.opening || row.closing || row.line;
              return <tr key={row.key}><td className="production-order-print-center">{index + 1}</td><td>{line.maNvl || '-'}</td><td>{line.tenNvl || '-'}</td><td className="production-order-print-center">{line.donVi || '-'}</td><td className="production-order-print-right">{row.opening ? quantityText(row.opening.soLuongTon, row.opening) : ''}</td><td className="production-order-print-right">{row.closing ? quantityText(row.closing.soLuongTon, row.closing) : ''}</td><td className="production-order-print-right">{row.opening ? `${formatNumber(totalKg(row.opening, 'dau_ca'))} kg` : ''}</td><td className="production-order-print-right">{row.closing ? `${formatNumber(totalKg(row.closing, 'cuoi_ca'))} kg` : ''}</td><td className="whitespace-pre-wrap">{[row.opening?.ghiChu, row.closing?.ghiChu].filter(Boolean).join(' | ')}</td></tr>;
            })}
            <tr><td colSpan={4} className="production-order-print-center" style={{ fontWeight: 700 }}>TỔNG CỘNG</td><td></td><td></td><td className="production-order-print-right" style={{ fontWeight: 700 }}>{formatNumber(openingKg)} kg</td><td className="production-order-print-right" style={{ fontWeight: 700 }}>{formatNumber(closingKg)} kg</td><td></td></tr>
          </tbody>
        </table>
        <p className="machine-nvl-print-note">Ghi chú: Phiếu này gộp số liệu tồn đầu ca và tồn cuối ca theo cùng ngày, ca và máy.</p>
        <div className="machine-nvl-print-signatures"><div><p>NV kho vật tư</p><span>(Ký, ghi rõ họ tên)</span></div><div><p>Trưởng ca</p><span>(Ký, ghi rõ họ tên)</span></div></div>
      </div>
    </div>
  );
}
