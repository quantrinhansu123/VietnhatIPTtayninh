import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import {
  isKgUnit,
  machineNvlQtyToKg,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal,
  type MachineNvlMaterialType,
  type MachineNvlSavedReport
} from '../utils/machineNvlReports';

export type MachineNvlPrintKind = 'dau_ca' | 'cuoi_ca';

export type MachineNvlPrintLine = {
  stt: number;
  maNvl: string;
  tenNvl: string;
  donVi: string;
  loaiVatTu: MachineNvlMaterialType | null;
  trongLuongQuyDoiKg: number | null;
  soLuongTonCaTruoc: number | null;
  soLuongTrongMay: number | null;
  soLuongTrongBonTron: number | null;
  soLuongNlChuaTron: number | null;
  soLuongTonNgoai: number | null;
  soLuongTonDinhMuc: number | null;
  soLuongTon: number;
  ghiChu: string;
};

export type MachineNvlPrintReport = {
  ngay: string;
  ca: string;
  maMay: string;
  tenMay: string;
  nhanSu: string;
  note: string;
  reportKind: MachineNvlPrintKind;
  lines: MachineNvlPrintLine[];
};

type FormLine = {
  code: string;
  name: string;
  unit: string;
  materialType: MachineNvlMaterialType | '';
  unitWeightKg: string;
  previousQuantity: string;
  inMachineQuantity: string;
  inMixerQuantity: string;
  unblendedQuantity: string;
  outsideQuantity: string;
  standardQuantity: string;
  quantity: string;
  note: string;
};

function formatPrintDate(iso: string) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function parseQty(raw: string) {
  const parsed = Number(String(raw).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFormLineData(line: FormLine) {
  if (line.code.trim() || line.name.trim()) return true;
  return (
    parseQty(line.inMachineQuantity) !== null ||
    parseQty(line.inMixerQuantity) !== null ||
    parseQty(line.unblendedQuantity) !== null ||
    parseQty(line.outsideQuantity) !== null
  );
}

function formatMachineNvlPrintQty(
  qty: number | null,
  line: Pick<MachineNvlPrintLine, 'donVi' | 'trongLuongQuyDoiKg'>
) {
  if (qty === null || !Number.isFinite(qty)) return '';
  if (isKgUnit(line.donVi)) return formatNumber(qty);
  const kg = machineNvlQtyToKg(qty, line);
  if (kg !== null) return `${formatNumber(qty)} (${formatNumber(kg)} kg)`;
  return formatNumber(qty);
}

function resolveMachineNvlPrintLineKg(
  line: MachineNvlPrintLine,
  reportKind: MachineNvlPrintKind
) {
  if (reportKind === 'dau_ca') return sumMachineNvlDauCaLineTotal(line);
  return sumMachineNvlCuoiCaLineTotal(line);
}

function sumMachineNvlPrintColumnKg(
  lines: MachineNvlPrintLine[],
  getQty: (line: MachineNvlPrintLine) => number | null
) {
  return lines.reduce((sum, line) => {
    const qty = getQty(line);
    const kg = machineNvlQtyToKg(qty, line);
    if (kg !== null) return sum + kg;
    if (isKgUnit(line.donVi) && qty !== null && Number.isFinite(qty)) return sum + qty;
    return sum;
  }, 0);
}

export function buildMachineNvlPrintReportFromForm(input: {
  reportKind: MachineNvlPrintKind;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  staff: string;
  note: string;
  lines: FormLine[];
}): MachineNvlPrintReport {
  const lines = input.lines
    .filter(hasFormLineData)
    .map((line, index): MachineNvlPrintLine => {
      const inMachineQty = parseQty(line.inMachineQuantity);
      const inMixerQty = parseQty(line.inMixerQuantity);
      const unblendedQty = parseQty(line.unblendedQuantity);
      const outsideQty = parseQty(line.outsideQuantity);
      const computedQty = (inMachineQty ?? 0) + (inMixerQty ?? 0) + (unblendedQty ?? 0) + (outsideQty ?? 0);
      const actualQty = parseQty(line.quantity);
      const unitWeightParsed = parseQty(line.unitWeightKg);

      return {
        stt: index + 1,
        maNvl: line.code.trim(),
        tenNvl: line.name.trim(),
        donVi: line.unit.trim() || 'kg',
        loaiVatTu: line.materialType || null,
        trongLuongQuyDoiKg:
          unitWeightParsed !== null && unitWeightParsed > 0 ? unitWeightParsed : null,
        soLuongTonCaTruoc: parseQty(line.previousQuantity),
        soLuongTrongMay: inMachineQty,
        soLuongTrongBonTron: inMixerQty,
        soLuongNlChuaTron: unblendedQty,
        soLuongTonNgoai: outsideQty,
        soLuongTonDinhMuc: parseQty(line.standardQuantity),
        soLuongTon:
          actualQty !== null && actualQty >= 0 ? actualQty : computedQty,
        ghiChu: line.note.trim()
      };
    });

  return {
    ngay: input.date,
    ca: input.shift,
    maMay: input.machineCode,
    tenMay: input.machineName,
    nhanSu: input.staff,
    note: input.note,
    reportKind: input.reportKind,
    lines
  };
}

export function MachineNvlPrintSheet({ report }: { report: MachineNvlPrintReport }) {
  const isDauCaReport = report.reportKind === 'dau_ca';
  const printDate = formatPrintDate(report.ngay);
  const machineLabel =
    report.maMay && report.tenMay && report.maMay !== report.tenMay
      ? `${report.maMay} · ${report.tenMay}`
      : report.tenMay || report.maMay || '-';
  const lines = [...report.lines];
  const totalInMachineKg = sumMachineNvlPrintColumnKg(lines, line => line.soLuongTrongMay);
  const totalInMixerKg = sumMachineNvlPrintColumnKg(lines, line => line.soLuongTrongBonTron);
  const totalUnblendedKg = sumMachineNvlPrintColumnKg(lines, line => line.soLuongNlChuaTron);
  const totalOutsideKg = sumMachineNvlPrintColumnKg(lines, line => line.soLuongTonNgoai);
  const totalActualKg = lines.reduce(
    (sum, line) => sum + resolveMachineNvlPrintLineKg(line, report.reportKind),
    0
  );

  return (
    <div className="production-order-print-sheet machine-nvl-print-sheet">
      <div className="production-order-print-doc machine-nvl-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">
          {isDauCaReport ? 'BẢNG KIỂM KÊ VẬT TƯ TỒN CA' : 'BẢNG KIỂM KÊ VẬT TƯ CUỐI CA'}
        </h1>

        <div className="production-order-print-meta">
          <span>Ngày: {printDate}</span>
          <span>Ca: {report.ca || '-'}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Máy</th>
              <th>{isDauCaReport ? 'Người kiểm kê' : 'Nhân sự'}</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{machineLabel}</td>
              <td>{report.nhanSu || '-'}</td>
              <td className="whitespace-pre-wrap">{report.note || '-'}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">Chi tiết nguyên vật liệu tồn</h2>
        <table className="production-order-print-grid-table machine-nvl-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã vật tư</th>
              <th>Tên vật tư</th>
              <th>ĐVT</th>
              <th>Tồn máy</th>
              <th>Tồn bồn</th>
              <th>Chưa trộn</th>
              <th>Tồn ngoài</th>
              <th>{isDauCaReport ? 'Tổng tồn đầu ca' : 'Tổng tồn cuối ca'}</th>
              <th>Kg quy đổi</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => {
              const lineKg = resolveMachineNvlPrintLineKg(line, report.reportKind);
              return (
                <tr key={line.stt}>
                  <td className="production-order-print-center">{line.stt}</td>
                  <td>{line.maNvl || '-'}</td>
                  <td>{line.tenNvl || '-'}</td>
                  <td className="production-order-print-center">{line.donVi || '-'}</td>
                  <td className="production-order-print-right">
                    {formatMachineNvlPrintQty(line.soLuongTrongMay, line)}
                  </td>
                  <td className="production-order-print-right">
                    {formatMachineNvlPrintQty(line.soLuongTrongBonTron, line)}
                  </td>
                  <td className="production-order-print-right">
                    {formatMachineNvlPrintQty(line.soLuongNlChuaTron, line)}
                  </td>
                  <td className="production-order-print-right">
                    {formatMachineNvlPrintQty(line.soLuongTonNgoai, line)}
                  </td>
                  <td className="production-order-print-right">
                    {formatMachineNvlPrintQty(line.soLuongTon, line)}
                  </td>
                  <td className="production-order-print-right">
                    {lineKg > 0 ? `${formatNumber(lineKg)} kg` : ''}
                  </td>
                  <td className="whitespace-pre-wrap">{line.ghiChu || ''}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} className="production-order-print-center" style={{ fontWeight: 700 }}>
                TỔNG CỘNG
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalInMachineKg)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalInMixerKg)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalUnblendedKg)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalOutsideKg)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalActualKg)} kg
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(totalActualKg)} kg
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <p className="machine-nvl-print-note">
          Ghi chú: Tổng tồn gồm nhựa tồn trong máy, trong bồn trộn và nguyên liệu chưa trộn.
          {lines.some(line => !isKgUnit(line.donVi))
            ? ' Với đơn vị khác kg, số lượng hiển thị kèm kg quy đổi trong ngoặc.'
            : ''}
        </p>

        <div className="machine-nvl-print-signatures">
          <div>
            <p>NV kho vật tư</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MachineNvlPrintBatch({ reports }: { reports: MachineNvlPrintReport[] }) {
  if (reports.length === 0) return null;

  return (
    <div className="production-order-print-batch machine-nvl-print-batch">
      {reports.map((report, index) => (
        <div key={`${report.ngay}-${report.maMay}-${report.ca}-${index}`} className="production-order-print-page machine-nvl-print-page">
          <MachineNvlPrintSheet report={report} />
        </div>
      ))}
    </div>
  );
}

export function savedReportToMachineNvlPrintReport(report: MachineNvlSavedReport): MachineNvlPrintReport {
  return {
    ngay: report.ngay,
    ca: report.ca,
    maMay: report.maMay,
    tenMay: report.tenMay,
    nhanSu: report.nhanSu,
    note: report.note,
    reportKind: report.reportKind,
    lines: report.lines.map(line => ({
      stt: line.stt,
      maNvl: line.maNvl,
      tenNvl: line.tenNvl,
      donVi: line.donVi,
      loaiVatTu: line.loaiVatTu,
      trongLuongQuyDoiKg: line.trongLuongQuyDoiKg,
      soLuongTonCaTruoc: line.soLuongTonCaTruoc,
      soLuongTrongMay: line.soLuongTrongMay,
      soLuongTrongBonTron: line.soLuongTrongBonTron,
      soLuongNlChuaTron: line.soLuongNlChuaTron,
      soLuongTonNgoai: line.soLuongTonNgoai,
      soLuongTonDinhMuc: line.soLuongTonDinhMuc,
      soLuongTon: line.soLuongTon,
      ghiChu: line.ghiChu
    }))
  };
}
