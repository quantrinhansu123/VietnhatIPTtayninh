import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';
import { formatLechKg, type LechReportRow } from './extractLechRows';

export type BaoCaoLechPrintModel = {
  dateFrom: string;
  dateTo: string;
  shift: string;
  machineCode: string;
  printedAt: string;
  rows: Array<LechReportRow & { ghiChu: string }>;
};

function formatPrintDate(iso: string) {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatSignedLech(value: number) {
  const text = formatLechKg(value);
  if (!Number.isFinite(value) || Math.abs(value) < 0.0005) return text;
  return value > 0 ? `+${text}` : text;
}

export function BaoCaoLechPrintSheet({ model }: { model: BaoCaoLechPrintModel }) {
  const dateLabel =
    model.dateFrom && model.dateTo && model.dateFrom !== model.dateTo
      ? `${formatPrintDate(model.dateFrom)} → ${formatPrintDate(model.dateTo)}`
      : formatPrintDate(model.dateFrom || model.dateTo);

  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">BÁO CÁO CHÊNH LỆCH NVL (3.1)</h1>

        <div className="production-order-print-meta">
          <span>Ngày: {dateLabel}</span>
          <span>Ca: {model.shift || 'Tất cả'}</span>
          <span>Máy: {model.machineCode || 'Tất cả'}</span>
          <span>In lúc: {model.printedAt}</span>
        </div>

        <table className="production-order-print-grid-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Ngày</th>
              <th>Ca</th>
              <th>Máy</th>
              <th>LSX</th>
              <th>Mã NVL</th>
              <th>Tên NVL</th>
              <th>TT sử dụng</th>
              <th>Nhập TP</th>
              <th>Lỗi</th>
              <th>Lệch</th>
              <th>Ghi chú bất thường</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="production-order-print-center">
                  Không có dòng lệch trong phạm vi in.
                </td>
              </tr>
            ) : (
              model.rows.map((row, index) => (
                <tr key={row.noteKey}>
                  <td className="production-order-print-center">{index + 1}</td>
                  <td className="production-order-print-center">{formatPrintDate(row.ngay)}</td>
                  <td className="production-order-print-center">{row.shiftLabel || row.shift || '—'}</td>
                  <td>{row.machineCode || row.machine || '—'}</td>
                  <td>{row.orderCode || '—'}</td>
                  <td>{row.materialCode}</td>
                  <td>{row.materialName || '—'}</td>
                  <td className="production-order-print-right">{formatLechKg(row.thucTeSuDungKg)}</td>
                  <td className="production-order-print-right">{formatLechKg(row.nhapTpKg)}</td>
                  <td className="production-order-print-right">{formatLechKg(row.loiHongKg)}</td>
                  <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                    {formatSignedLech(row.chenhLechKg)}
                  </td>
                  <td>{row.ghiChu || ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="machine-downtime-print-footnote" style={{ marginTop: 10 }}>
          Nguồn: cột lệch mục 3.1 trên bản tính toán BB đã lưu. Ghi chú dùng để đánh dấu điểm bất thường khi đối chiếu.
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
            <p>Quản đốc / Kỹ thuật</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BaoCaoLechPrintBatch({ model }: { model: BaoCaoLechPrintModel }) {
  return (
    <div className="production-order-print-batch">
      <div className="production-order-print-page">
        <BaoCaoLechPrintSheet model={model} />
      </div>
    </div>
  );
}
