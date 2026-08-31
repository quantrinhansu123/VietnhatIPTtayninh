import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatNumber } from '../utils';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  resolveCanTuDongFilmKgPerRoll,
  type InsulationProductAlias
} from '../utils/canTuDongWeights';

export type AcceptanceReportSource = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  loai_vat_tu?: string;
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
  trong_luong?: number | null;
  don_vi_trong_luong?: string;
};

export type AcceptancePrintLine = {
  mat_hang: string;
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
  trong_luong?: number | null;
  don_vi_trong_luong?: string;
};

export type AcceptancePrintSlip = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  machineLabel: string;
  thanhPhamLines: AcceptancePrintLine[];
  hangLoiHongLines: AcceptancePrintLine[];
};

function normalizeLoaiVatTuKey(loaiVatTu: string | undefined) {
  return String(loaiVatTu ?? 'Thành phẩm')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');
}

/** Thành phẩm + Gia công — bảng 1. Còn lại (SP lỗi, SP rác) — bảng Hàng lỗi hỏng nhập kho. */
export function isAcceptanceThanhPhamLoai(loaiVatTu: string | undefined) {
  const key = normalizeLoaiVatTuKey(loaiVatTu);
  return key === 'thanh pham' || key === 'gia cong';
}

export function isAcceptanceHangLoiHongLoai(loaiVatTu: string | undefined) {
  return !isAcceptanceThanhPhamLoai(loaiVatTu);
}

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

export function sumTrongLuongKg(lines: Array<{ trong_luong?: number | null }>) {
  return lines.reduce((sum, line) => {
    const kg = Number(line.trong_luong);
    return sum + (Number.isFinite(kg) && kg > 0 ? kg : 0);
  }, 0);
}

/** Map BOM màng / cuộn theo mã SP — cùng nguồn `/can-tu-dong` (không ×2). */
export function buildAcceptanceFilmKgByProductCode(
  products: InsulationProductAlias[]
) {
  const filmKgByProductCode = new Map<string, number>();
  for (const product of products) {
    const filmKg = resolveCanTuDongFilmKgPerRoll(product);
    if (filmKg === null) continue;
    for (const productCode of [product.code, product.newCode, product.amisCode]) {
      const key = normalizeProductCodeKey(productCode);
      if (key && key !== '-') filmKgByProductCode.set(key, filmKg);
    }
  }
  return filmKgByProductCode;
}

function resolveAcceptanceProductCodeKey(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  const code = (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
  return normalizeProductCodeKey(code) || code;
}

export function resolveAcceptanceLineFilmKg(
  matHang: string,
  soLuong: number | null,
  filmKgByProductCode?: Map<string, number>
): number | null {
  if (!filmKgByProductCode?.size) return null;
  const key = resolveAcceptanceProductCodeKey(matHang);
  const perUnit = key ? filmKgByProductCode.get(key) : undefined;
  if (perUnit == null || !(perUnit > 0)) return null;
  const qty = soLuong ?? 0;
  if (!(qty > 0)) return null;
  return perUnit * qty;
}

/** Trọng lượng nhựa = Trọng lượng − Trọng lượng màng. */
export function resolveAcceptanceLineNhuaKg(
  trongLuong: number | null | undefined,
  filmKg: number | null
): number | null {
  const weight = Number(trongLuong);
  if (!Number.isFinite(weight) || !(weight > 0)) return null;
  return weight - (filmKg ?? 0);
}

function formatWeightKgCell(value: number | null, unit = 'Kg') {
  if (value == null || !(value > 0)) return '-';
  return `${formatNumber(value, 2)} ${unit}`;
}

type LineBucketAcc = {
  lineMap: Map<string, AcceptancePrintLine>;
  lineOrder: string[];
};

function createLineBucketAcc(): LineBucketAcc {
  return { lineMap: new Map<string, AcceptancePrintLine>(), lineOrder: [] };
}

function mergeReportIntoLineBucket(acc: LineBucketAcc, report: AcceptanceReportSource) {
  const lineKey = [report.mat_hang, report.don_vi].join('|');
  const existing = acc.lineMap.get(lineKey);
  const weightKg =
    report.trong_luong !== null &&
    report.trong_luong !== undefined &&
    Number.isFinite(Number(report.trong_luong))
      ? Number(report.trong_luong)
      : 0;
  if (existing) {
    existing.so_luong = (existing.so_luong ?? 0) + (report.so_luong ?? 0);
    existing.trong_luong = (existing.trong_luong ?? 0) + weightKg;
    if (!existing.ten_sp && report.ten_sp) existing.ten_sp = report.ten_sp;
    return;
  }
  const line: AcceptancePrintLine = {
    mat_hang: report.mat_hang,
    ten_sp: report.ten_sp,
    don_vi: report.don_vi,
    so_luong: report.so_luong,
    trong_luong: weightKg > 0 ? weightKg : null,
    don_vi_trong_luong: report.don_vi_trong_luong || 'Kg'
  };
  acc.lineMap.set(lineKey, line);
  acc.lineOrder.push(lineKey);
}

function linesFromBucket(acc: LineBucketAcc) {
  return acc.lineOrder.map(key => acc.lineMap.get(key)!);
}

export function buildAcceptancePrintSlips(reports: AcceptanceReportSource[]): AcceptancePrintSlip[] {
  type AcceptanceSlipAcc = {
    id: string;
    ngay: string;
    ca: string;
    gio: string;
    lanSet: Set<string>;
    machineSet: Set<string>;
    thanhPham: LineBucketAcc;
    hangLoiHong: LineBucketAcc;
  };
  const grouped = new Map<string, AcceptanceSlipAcc>();

  // Gộp các dòng cùng NGÀY + CA thành 1 phiếu in, tách 2 bảng Thành phẩm / Hàng lỗi hỏng.
  reports.forEach(report => {
    const key = [report.ngay, report.ca].join('|');
    let acc = grouped.get(key);
    if (!acc) {
      acc = {
        id: `slip-${key}`,
        ngay: report.ngay,
        ca: report.ca || '-',
        gio: report.gio || '-',
        lanSet: new Set<string>(),
        machineSet: new Set<string>(),
        thanhPham: createLineBucketAcc(),
        hangLoiHong: createLineBucketAcc()
      };
      grouped.set(key, acc);
    }

    if (report.lan) acc.lanSet.add(report.lan);
    const machineLabel = machineLabelFromReport(report);
    if (machineLabel && machineLabel !== '-') acc.machineSet.add(machineLabel);

    const bucket = isAcceptanceThanhPhamLoai(report.loai_vat_tu) ? acc.thanhPham : acc.hangLoiHong;
    mergeReportIntoLineBucket(bucket, report);

    if (report.gio && (acc.gio === '-' || !acc.gio || report.gio < acc.gio)) {
      acc.gio = report.gio;
    }
  });

  return [...grouped.values()]
    .map(acc => ({
      id: acc.id,
      ngay: acc.ngay,
      ca: acc.ca,
      lan:
        acc.lanSet.size > 0
          ? [...acc.lanSet].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).join(', ')
          : '-',
      gio: acc.gio,
      machineLabel:
        acc.machineSet.size > 0
          ? [...acc.machineSet].sort((a, b) => a.localeCompare(b, 'vi')).join(', ')
          : '-',
      thanhPhamLines: linesFromBucket(acc.thanhPham),
      hangLoiHongLines: linesFromBucket(acc.hangLoiHong)
    }))
    .sort((a, b) => {
      const byDate = a.ngay.localeCompare(b.ngay, 'vi');
      if (byDate !== 0) return byDate;
      return a.ca.localeCompare(b.ca, 'vi');
    });
}

function AcceptancePrintLinesTable({
  title,
  lines,
  filmKgByProductCode
}: {
  title: string;
  lines: AcceptancePrintLine[];
  filmKgByProductCode?: Map<string, number>;
}) {
  if (lines.length === 0) return null;

  const totalsByUnit = sumByUnit(lines);
  const totalTrongLuongKg = sumTrongLuongKg(lines);
  const totalFilmKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    return sum + (film ?? 0);
  }, 0);
  const totalNhuaKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    const nhua = resolveAcceptanceLineNhuaKg(line.trong_luong, film);
    return sum + (nhua ?? 0);
  }, 0);

  return (
    <>
      <h2 className="production-order-print-section-title">{title}</h2>
      <table className="production-order-print-grid-table acceptance-report-print-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mặt hàng</th>
            <th>Tên SP</th>
            <th>ĐVT</th>
            <th>Số lượng</th>
            <th>Trọng lượng</th>
            <th>Trọng lượng màng</th>
            <th>Trọng lượng nhựa</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const filmKg = resolveAcceptanceLineFilmKg(
              line.mat_hang,
              line.so_luong,
              filmKgByProductCode
            );
            const nhuaKg = resolveAcceptanceLineNhuaKg(line.trong_luong, filmKg);
            return (
              <tr key={`${line.mat_hang}-${index}`}>
                <td className="production-order-print-center">{index + 1}</td>
                <td>{line.mat_hang || '-'}</td>
                <td>{line.ten_sp || '-'}</td>
                <td className="production-order-print-center">{line.don_vi || '-'}</td>
                <td className="production-order-print-right">
                  {line.so_luong === null ? '-' : formatNumber(line.so_luong, 2)}
                </td>
                <td className="production-order-print-right">
                  {formatWeightKgCell(
                    line.trong_luong != null && line.trong_luong > 0 ? line.trong_luong : null,
                    line.don_vi_trong_luong || 'Kg'
                  )}
                </td>
                <td className="production-order-print-right">{formatWeightKgCell(filmKg)}</td>
                <td className="production-order-print-right">{formatWeightKgCell(nhuaKg)}</td>
              </tr>
            );
          })}
          {totalsByUnit.map(([unit, total]) => (
            <tr key={unit}>
              <td colSpan={4} className="production-order-print-right" style={{ fontWeight: 700 }}>
                Tổng cộng ({unit})
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {formatNumber(total, 2)}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {totalTrongLuongKg > 0 ? `${formatNumber(totalTrongLuongKg, 2)} Kg` : '-'}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {totalFilmKg > 0 ? `${formatNumber(totalFilmKg, 2)} Kg` : '-'}
              </td>
              <td className="production-order-print-right" style={{ fontWeight: 700 }}>
                {totalNhuaKg > 0 ? `${formatNumber(totalNhuaKg, 2)} Kg` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function AcceptanceReportPrintSheet({
  slip,
  filmKgByProductCode
}: {
  slip: AcceptancePrintSlip;
  filmKgByProductCode?: Map<string, number>;
}) {
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

        <AcceptancePrintLinesTable
          title="Thành phẩm"
          lines={slip.thanhPhamLines}
          filmKgByProductCode={filmKgByProductCode}
        />
        <AcceptancePrintLinesTable
          title="Hàng lỗi hỏng nhập kho"
          lines={slip.hangLoiHongLines}
          filmKgByProductCode={filmKgByProductCode}
        />

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

export function AcceptanceReportPrintBatch({
  slips,
  filmKgByProductCode
}: {
  slips: AcceptancePrintSlip[];
  filmKgByProductCode?: Map<string, number>;
}) {
  if (slips.length === 0) return null;

  return (
    <div className="production-order-print-batch">
      {slips.map(slip => (
        <div key={slip.id} className="production-order-print-page">
          <AcceptanceReportPrintSheet slip={slip} filmKgByProductCode={filmKgByProductCode} />
        </div>
      ))}
    </div>
  );
}

/** Nhóm dòng DB thành 1 bảng trên màn hình (ngày + ca + máy + lần). */
export type AcceptanceScreenSlip = {
  key: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  machineLabel: string;
  lines: Array<AcceptanceReportSource & { ten_sp?: string }>;
};

export function buildAcceptanceScreenSlips(
  reports: Array<AcceptanceReportSource & { ten_sp?: string }>
): AcceptanceScreenSlip[] {
  const grouped = new Map<string, AcceptanceScreenSlip>();

  for (const report of reports) {
    const machineLabel = machineLabelFromReport(report);
    const key = [report.ngay, report.ca, report.ma_may || report.ten_may, report.lan].join('|');
    let slip = grouped.get(key);
    if (!slip) {
      slip = {
        key,
        ngay: report.ngay,
        ca: report.ca || '-',
        lan: report.lan || '-',
        gio: report.gio || '-',
        machineLabel,
        lines: []
      };
      grouped.set(key, slip);
    }
    slip.lines.push(report);
    if (report.gio && (slip.gio === '-' || !slip.gio || report.gio < slip.gio)) {
      slip.gio = report.gio;
    }
  }

  return [...grouped.values()].sort((a, b) => {
    const byDate = b.ngay.localeCompare(a.ngay, 'vi');
    if (byDate !== 0) return byDate;
    const byCa = a.ca.localeCompare(b.ca, 'vi');
    if (byCa !== 0) return byCa;
    const byMachine = a.machineLabel.localeCompare(b.machineLabel, 'vi');
    if (byMachine !== 0) return byMachine;
    return String(a.lan).localeCompare(String(b.lan), 'vi', { numeric: true });
  });
}

/** Bảng dòng trên màn hình — dùng chung cho 2 loại Thành phẩm / Hàng lỗi hỏng. */
function AcceptanceScreenLinesTable({
  title,
  lines,
  filmKgByProductCode,
  renderLineActions
}: {
  title: string;
  lines: Array<AcceptanceReportSource & { ten_sp?: string }>;
  filmKgByProductCode?: Map<string, number>;
  renderLineActions?: (line: AcceptanceReportSource & { ten_sp?: string }) => React.ReactNode;
}) {
  if (lines.length === 0) return null;

  const totalsByUnit = sumByUnit(
    lines.map(line => ({
      mat_hang: line.mat_hang,
      ten_sp: line.ten_sp,
      don_vi: line.don_vi,
      so_luong: line.so_luong
    }))
  );
  const totalTrongLuongKg = sumTrongLuongKg(lines);
  const totalFilmKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    return sum + (film ?? 0);
  }, 0);
  const totalNhuaKg = lines.reduce((sum, line) => {
    const film = resolveAcceptanceLineFilmKg(line.mat_hang, line.so_luong, filmKgByProductCode);
    const nhua = resolveAcceptanceLineNhuaKg(line.trong_luong, film);
    return sum + (nhua ?? 0);
  }, 0);

  return (
    <div className="border-t border-zinc-200 first:border-t-0">
      <div className="bg-zinc-50 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-zinc-700 sm:px-4">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-center">STT</th>
              <th className="px-3 py-2">Mặt hàng</th>
              <th className="px-3 py-2">Tên SP</th>
              <th className="px-3 py-2 text-center">ĐVT</th>
              <th className="px-3 py-2 text-right">Số lượng</th>
              <th className="px-3 py-2 text-right">Trọng lượng</th>
              <th className="px-3 py-2 text-right">Trọng lượng màng</th>
              <th className="px-3 py-2 text-right">Trọng lượng nhựa</th>
              {renderLineActions ? <th className="px-3 py-2 text-center">Thao tác</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const filmKg = resolveAcceptanceLineFilmKg(
                line.mat_hang,
                line.so_luong,
                filmKgByProductCode
              );
              const nhuaKg = resolveAcceptanceLineNhuaKg(line.trong_luong, filmKg);
              return (
                <tr key={line.id || `${title}-${index}`} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-center font-mono font-bold text-zinc-500">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-800">{line.mat_hang || '—'}</td>
                  <td className="px-3 py-2 text-zinc-600">{line.ten_sp || '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold text-zinc-600">{line.don_vi || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                    {line.so_luong === null ? '—' : formatNumber(line.so_luong, 2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                    {line.trong_luong == null || !(Number(line.trong_luong) > 0)
                      ? '—'
                      : `${formatNumber(Number(line.trong_luong), 2)} ${line.don_vi_trong_luong || 'Kg'}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-cyan-800">
                    {filmKg != null && filmKg > 0
                      ? `${formatNumber(filmKg, 2)} Kg`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-violet-800">
                    {nhuaKg != null && nhuaKg > 0
                      ? `${formatNumber(nhuaKg, 2)} Kg`
                      : '—'}
                  </td>
                  {renderLineActions ? (
                    <td className="px-3 py-2 text-center">{renderLineActions(line)}</td>
                  ) : null}
                </tr>
              );
            })}
            {totalsByUnit.map(([unit, total]) => (
              <tr key={unit} className="border-t border-zinc-200 bg-zinc-50">
                <td colSpan={4} className="px-3 py-2 text-right text-xs font-black text-zinc-800">
                  Tổng cộng ({unit})
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-emerald-800">
                  {formatNumber(total, 2)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-amber-800">
                  {totalTrongLuongKg > 0 ? `${formatNumber(totalTrongLuongKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-cyan-800">
                  {totalFilmKg > 0 ? `${formatNumber(totalFilmKg, 2)} Kg` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-black text-violet-800">
                  {totalNhuaKg > 0 ? `${formatNumber(totalNhuaKg, 2)} Kg` : '—'}
                </td>
                {renderLineActions ? <td /> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Bảng phiếu trên màn hình — xếp chồng, vuốt xuống xem, không cần chọn. */
export function AcceptanceReportSlipStack({
  slips,
  emptyText = 'Chưa có báo cáo.',
  filmKgByProductCode,
  renderLineActions
}: {
  slips: AcceptanceScreenSlip[];
  emptyText?: string;
  filmKgByProductCode?: Map<string, number>;
  renderLineActions?: (line: AcceptanceReportSource & { ten_sp?: string }) => React.ReactNode;
}) {
  if (slips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm font-bold text-zinc-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {slips.map(slip => {
        const thanhPhamLines = slip.lines.filter(line => isAcceptanceThanhPhamLoai(line.loai_vat_tu));
        const hangLoiHongLines = slip.lines.filter(line => isAcceptanceHangLoiHongLoai(line.loai_vat_tu));
        const lineCount = thanhPhamLines.length + hangLoiHongLines.length;
        return (
          <article
            key={slip.key}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">
                  Báo cáo sản lượng
                </p>
                <h3 className="mt-0.5 text-sm font-black text-zinc-900 sm:text-base">
                  {formatPrintDate(slip.ngay)} · Ca {slip.ca}
                </h3>
                <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                  Lần {slip.lan}
                  {slip.gio && slip.gio !== '-' ? ` · ${slip.gio}` : ''}
                  {slip.machineLabel && slip.machineLabel !== '-'
                    ? ` · ${slip.machineLabel}`
                    : ''}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800">
                {lineCount} dòng
              </span>
            </div>

            <AcceptanceScreenLinesTable
              title="Thành phẩm"
              lines={thanhPhamLines}
              filmKgByProductCode={filmKgByProductCode}
              renderLineActions={renderLineActions}
            />
            <AcceptanceScreenLinesTable
              title="Hàng lỗi hỏng nhập kho"
              lines={hangLoiHongLines}
              filmKgByProductCode={filmKgByProductCode}
              renderLineActions={renderLineActions}
            />
          </article>
        );
      })}
    </div>
  );
}
