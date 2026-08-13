import React from 'react';
import { createPortal } from 'react-dom';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import {
  MIXING_ROUND_KEYS,
  buildMixingReportPrintContext,
  formatNormWeight,
  listRoundMaterialEntries,
  mixingSessionColumnLabel,
  resolveMixingReportRoundPhotos,
  sumReportNormTotal,
  visibleRoundCount,
  type MixingReportPrintContext
} from '../lib/mixingReportModel';
import type { MixingReport } from './MixingReportForm';
const PRINT_PROJECT_NAME = 'Dự án Chuyển đổi số sản xuất';
const PRINT_DOC_CODE = 'BM-SX-06';
const PRINT_DOC_VERSION = 'Phiên bản 1.0';

export type MixingReportPrintRow = {
  lanTron: string;
  thoiGian: string;
  maNl: string;
  tenNl: string;
  donVi: string;
  khoiLuong: number | null;
  anhChup: 'Có' | 'Không';
  ghiChu: string;
  showLanTron: boolean;
  showThoiGian: boolean;
  showAnhChup: boolean;
  lanTronRowSpan: number;
  thoiGianRowSpan: number;
  anhChupRowSpan: number;
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
  return `${match[1]}h${match[2]}`;
}

function trimTrailingDecimalZeros(formatted: string) {
  const match = formatted.match(/^(.+),(\d+)$/);
  if (!match) return formatted;
  const [, intPart, decPart] = match;
  const trimmedDec = decPart.replace(/0+$/, '');
  return trimmedDec ? `${intPart},${trimmedDec}` : intPart;
}

function formatPrintWeight(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return trimTrailingDecimalZeros(formatNormWeight(value));
}

function hasMeaningfulPrintWeight(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}

function buildRowsForReport(report: MixingReport): MixingReportPrintRow[] {
  const sessionStart = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
  const roundCount = Math.min(
    5,
    Math.max(
      report.so_lan || 1,
      report.chi_tiet.reduce((max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)), 1)
    )
  );
  const roundPhotos = resolveMixingReportRoundPhotos(report);
  const rows: MixingReportPrintRow[] = [];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const roundKey = MIXING_ROUND_KEYS[roundIndex];
    const entries = listRoundMaterialEntries(report.chi_tiet, roundKey).filter(entry => {
      const weight = entry.item.kl_thuc_te ?? entry.item.so_luong;
      return (
        entry.item.ma_nvl.trim() ||
        entry.item.ten_vat_tu.trim() ||
        hasMeaningfulPrintWeight(weight)
      );
    });
    if (entries.length === 0) continue;

    const lanLabel = mixingSessionColumnLabel(sessionStart, roundIndex);
    const thoiGian = formatPrintTime(report.gio);
    const hasPhoto = (roundPhotos[roundKey]?.length ?? 0) > 0;
    const anhChup: 'Có' | 'Không' = hasPhoto ? 'Có' : 'Không';
    const ghiChu = report.ghi_chu.trim();

    entries.forEach((entry, entryIndex) => {
      const weight = entry.item.kl_thuc_te ?? entry.item.so_luong;
      rows.push({
        lanTron: lanLabel,
        thoiGian,
        maNl: entry.item.ma_nvl.trim(),
        tenNl: entry.item.ten_vat_tu.trim(),
        donVi: (entry.item.don_vi || 'KG').toUpperCase(),
        khoiLuong: weight,
        anhChup,
        ghiChu: entryIndex === 0 ? ghiChu : '',
        showLanTron: entryIndex === 0,
        showThoiGian: entryIndex === 0,
        showAnhChup: entryIndex === 0,
        lanTronRowSpan: entries.length,
        thoiGianRowSpan: entries.length,
        anhChupRowSpan: entries.length
      });
    });
  }

  return rows;
}

export function buildMixingReportPrintRows(reports: MixingReport | MixingReport[]): MixingReportPrintRow[] {
  const reportList = Array.isArray(reports) ? reports : [reports];
  return reportList.flatMap(report => buildRowsForReport(report));
}

export function MixingReportPrintSheet({
  reports,
  context
}: {
  reports: MixingReport[];
  context: MixingReportPrintContext;
}) {
  const rows = buildMixingReportPrintRows(reports);
  const totalWeight = reports.reduce((sum, report) => sum + sumReportNormTotal(report.chi_tiet), 0);
  const machineLabel =
    context.tenMay && context.maMay && context.maMay !== context.tenMay
      ? `${context.maMay} · ${context.tenMay}`
      : context.tenMay || context.maMay || '-';

  return (
    <div className="mixing-report-print-sheet">
      <div className="mixing-report-print-doc">
        <header className="mixing-report-print-header">
          <div className="mixing-report-print-header-top">
            <div className="mixing-report-print-brand">
              <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="mixing-report-print-logo" />
              <div>
                <p className="mixing-report-print-company-name">{PRINT_COMPANY_NAME}</p>
                <p className="mixing-report-print-project-name">{PRINT_PROJECT_NAME}</p>
              </div>
            </div>
            <div className="mixing-report-print-doc-meta">
              <p>{PRINT_DOC_CODE}</p>
              <p>{PRINT_DOC_VERSION}</p>
            </div>
          </div>
          <h1 className="mixing-report-print-title">NHẬT KÝ TRỘN NGUYÊN LIỆU</h1>
        </header>

        <table className="mixing-report-print-grid-table mixing-report-print-params-table">
          <tbody>
            <tr>
              <th>Ngày sản xuất</th>
              <td>{formatPrintDate(context.ngay)}</td>
              <th>Ca</th>
              <td>{context.ca || '-'}</td>
            </tr>
            <tr>
              <th>Máy</th>
              <td>{machineLabel}</td>
              <th>Công nhân</th>
              <td>{context.nhanSu || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table className="mixing-report-print-grid-table mixing-report-print-table">
          <colgroup>
            <col className="mixing-report-print-col-lan" />
            <col className="mixing-report-print-col-time" />
            <col className="mixing-report-print-col-code" />
            <col className="mixing-report-print-col-name" />
            <col className="mixing-report-print-col-unit" />
            <col className="mixing-report-print-col-weight" />
            <col className="mixing-report-print-col-photo" />
            <col className="mixing-report-print-col-note" />
          </colgroup>
          <thead>
            <tr>
              <th>Lần</th>
              <th>Thời gian</th>
              <th>Mã NL</th>
              <th>Tên NL</th>
              <th>ĐVT</th>
              <th>KL</th>
              <th>Ảnh</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="mixing-report-print-center">
                  Chưa có dữ liệu trộn nguyên liệu.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.lanTron}-${row.maNl}-${row.tenNl}-${index}`}>
                  {row.showLanTron ? (
                    <td
                      rowSpan={row.lanTronRowSpan}
                      className="mixing-report-print-center mixing-report-print-merged mixing-report-print-lan"
                    >
                      {row.lanTron}
                    </td>
                  ) : null}
                  {row.showThoiGian ? (
                    <td
                      rowSpan={row.thoiGianRowSpan}
                      className="mixing-report-print-center mixing-report-print-merged mixing-report-print-time"
                    >
                      {row.thoiGian}
                    </td>
                  ) : null}
                  <td className="mixing-report-print-code">{row.maNl || ''}</td>
                  <td className="mixing-report-print-material-name">
                    <span className="mixing-report-print-material-name-text">{row.tenNl || ''}</span>
                  </td>
                  <td className="mixing-report-print-center mixing-report-print-unit">{row.donVi || ''}</td>
                  <td className="mixing-report-print-right mixing-report-print-weight">
                    {formatPrintWeight(row.khoiLuong)}
                  </td>
                  {row.showAnhChup ? (
                    <td rowSpan={row.anhChupRowSpan} className="mixing-report-print-center mixing-report-print-merged mixing-report-print-photo">
                      {row.anhChup}
                    </td>
                  ) : null}
                  <td className="mixing-report-print-note-cell">{row.ghiChu}</td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={5} className="mixing-report-print-center mixing-report-print-total-label">
                TỔNG CỘNG
              </td>
              <td className="mixing-report-print-right mixing-report-print-total-value mixing-report-print-weight">
                {rows.length > 0 ? formatPrintWeight(totalWeight) : ''}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>

        <p className="mixing-report-print-note">
          Ghi chú: Mỗi mẻ trộn phải gắn thẻ trộn (số lần trộn, ca, ngày SX...) và chụp ảnh lưu vết trước khi cập nhật
          hệ thống.
        </p>

        <div className="mixing-report-print-signatures">
          <div>
            <p>Công nhân</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca xác nhận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MixingReportPrintBatch({ reports }: { reports: MixingReport[] }) {
  if (reports.length === 0) return null;

  return createPortal(
    <div className="mixing-report-print-batch">
      {reports.map(report => {
        // Mỗi id được chọn tương ứng đúng một phiếu/trang preview; không gộp
        // các bản ghi có cùng ngày, ca hoặc máy.
        const context = buildMixingReportPrintContext([report]);
        return (
          <div key={report.id} className="mixing-report-print-page">
            <MixingReportPrintSheet reports={[report]} context={context} />
          </div>
        );
      })}
    </div>,
    document.body
  );
}
