import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import type { WeighingRecord } from '../utils/weighingRecords';
import { getWeighingDataRows } from '../utils/weighingRecords';
export type WeighingSlipPrintLayout = {
  hideProductFields?: boolean;
  splitPlasticFilmWeights?: boolean;
};

export type WeighingSlipPrintData = {
  documentNo: string;
  reportDate: string;
  productionDate: string;
  shiftName: string;
  worker1: string;
  worker2: string;
  machineName: string;
  rows: WeighingRecord[];
};

function formatPrintDate(iso: string) {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function formatPrintTime(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '—';
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

function formatPrintWeight(value: string) {
  const num = parsePrintWeight(value);
  if (num === null) {
    const trimmed = String(value ?? '').trim();
    return trimmed && trimmed !== '—' ? trimmed : '—';
  }
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(num);
  return trimTrailingDecimalZeros(formatted);
}

function parsePrintWeight(value: string): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '—') return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatPrintWeightNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(value);
  return trimTrailingDecimalZeros(formatted);
}

function netRowWeight(row: WeighingRecord) {
  const total = parsePrintWeight(row.weight);
  if (total === null) return null;
  const core = parsePrintWeight(row.coreWeight) ?? 0;
  const shell = parsePrintWeight(row.shellWeight) ?? 0;
  return total - core - shell;
}

function damagedGoodsRowTotal(row: WeighingRecord) {
  const plastic = parsePrintWeight(row.weight) ?? 0;
  const film = parsePrintWeight(row.shellWeight) ?? 0;
  if (parsePrintWeight(row.weight) === null && parsePrintWeight(row.shellWeight) === null) return null;
  return plastic + film;
}

function resolveWeigherName(rows: WeighingRecord[]) {
  const names = [...new Set(rows.map(row => row.weigherName.trim()).filter(Boolean))];
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return names.join(' · ');
}

function hasAnyPhoto(row: WeighingRecord) {
  return Boolean(row.imageUrl || row.coreWeightImageUrl);
}

export function WeighingSlipPrintSheet({
  slip,
  title,
  layout
}: {
  slip: WeighingSlipPrintData;
  title: string;
  layout?: WeighingSlipPrintLayout;
}) {
  const dataRows = getWeighingDataRows(slip.rows);
  const weigherName = resolveWeigherName(dataRows);
  const splitPlasticFilmWeights = Boolean(layout?.splitPlasticFilmWeights);
  const hideProductFields = Boolean(layout?.hideProductFields);
  const detailColSpan = splitPlasticFilmWeights ? 7 : hideProductFields ? 9 : 11;

  return (
    <div className="weighing-slip-print-sheet">
      <div className="weighing-slip-print-doc">
        <header className="weighing-slip-print-header">
          <div className="weighing-slip-print-header-top">
            <div className="weighing-slip-print-brand">
              <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="weighing-slip-print-logo" />
              <p className="weighing-slip-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <h1 className="weighing-slip-print-title">{title}</h1>
        </header>

        <table className="weighing-slip-print-params-table">
          <tbody>
            <tr>
              <th>Ngày SX</th>
              <td>{formatPrintDate(slip.productionDate)}</td>
              <th>Ca SX</th>
              <td>{slip.shiftName || '—'}</td>
            </tr>
            <tr>
              <th>Bản số</th>
              <td className="weighing-slip-print-doc-no">{slip.documentNo || '—'}</td>
              <th>Ngày lập</th>
              <td>{formatPrintDate(slip.reportDate)}</td>
            </tr>
            <tr>
              <th>Công nhân 1</th>
              <td>{slip.worker1 || '—'}</td>
              <th>Công nhân 2</th>
              <td>{slip.worker2 || '—'}</td>
            </tr>
            <tr>
              <th>Tên máy</th>
              <td>{slip.machineName || '—'}</td>
              <th>Người cân</th>
              <td>{weigherName}</td>
            </tr>
          </tbody>
        </table>

        <p className="weighing-slip-print-section-title">Bảng chi tiết cân</p>
        <table className="weighing-slip-print-table">
          {splitPlasticFilmWeights ? (
            <>
              <colgroup>
                <col className="weighing-slip-print-col-lan" />
                <col className="weighing-slip-print-col-weight" />
                <col className="weighing-slip-print-col-shell" />
                <col className="weighing-slip-print-col-total" />
                <col className="weighing-slip-print-col-time" />
                <col className="weighing-slip-print-col-note" />
              </colgroup>
              <thead>
                <tr>
                  <th>Lần</th>
                  <th>KL nhựa</th>
                  <th>KL màng</th>
                  <th className="weighing-slip-print-total-head">Tổng</th>
                  <th>Giờ</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="weighing-slip-print-center">
                      Chưa có lần cân.
                    </td>
                  </tr>
                ) : (
                  dataRows.map((row, index) => (
                    <tr key={row.id ?? `${slip.documentNo}-${index}`}>
                      <td className="weighing-slip-print-center weighing-slip-print-lan">{row.weighNo || index + 1}</td>
                      <td className="weighing-slip-print-right weighing-slip-print-num weighing-slip-print-weight">
                        {formatPrintWeight(row.weight)}
                      </td>
                      <td className="weighing-slip-print-right weighing-slip-print-num">
                        {formatPrintWeight(row.shellWeight)}
                      </td>
                      <td className="weighing-slip-print-right weighing-slip-print-num weighing-slip-print-total">
                        {formatPrintWeightNumber(damagedGoodsRowTotal(row))}
                      </td>
                      <td className="weighing-slip-print-center weighing-slip-print-time">
                        {formatPrintTime(row.weighTime)}
                      </td>
                      <td className="weighing-slip-print-note">{row.note || ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </>
          ) : (
            <>
          <colgroup>
            <col className="weighing-slip-print-col-lan" />
            <col className="weighing-slip-print-col-code" />
            <col className="weighing-slip-print-col-name" />
            <col className="weighing-slip-print-col-core" />
            <col className="weighing-slip-print-col-shell" />
            <col className="weighing-slip-print-col-weight" />
            <col className="weighing-slip-print-col-total" />
            <col className="weighing-slip-print-col-time" />
            <col className="weighing-slip-print-col-status" />
            <col className="weighing-slip-print-col-note" />
            <col className="weighing-slip-print-col-photo" />
          </colgroup>
          <thead>
            <tr>
              <th>Lần</th>
              {!hideProductFields && <th>Mã SP</th>}
              {!hideProductFields && <th>Tên SP</th>}
              <th>TL lõi</th>
              <th>TL bì</th>
              <th>TL nhựa</th>
              <th className="weighing-slip-print-total-head">Tổng trọng lượng</th>
              <th>Giờ</th>
              <th>NT</th>
              <th>Ghi chú</th>
              <th>Ảnh</th>
            </tr>
          </thead>
          <tbody>
            {dataRows.length === 0 ? (
              <tr>
                <td colSpan={detailColSpan} className="weighing-slip-print-center">
                  Chưa có lần cân.
                </td>
              </tr>
            ) : (
              dataRows.map((row, index) => (
                <tr key={row.id ?? `${slip.documentNo}-${index}`}>
                  <td className="weighing-slip-print-center weighing-slip-print-lan">{row.weighNo || index + 1}</td>
                  {!hideProductFields && (
                    <td className="weighing-slip-print-code">{row.productCode || '—'}</td>
                  )}
                  {!hideProductFields && (
                    <td className="weighing-slip-print-product-name">{row.productName || '—'}</td>
                  )}
                  <td className="weighing-slip-print-right weighing-slip-print-num">
                    {formatPrintWeight(row.coreWeight)}
                  </td>
                  <td className="weighing-slip-print-right weighing-slip-print-num">
                    {formatPrintWeight(row.shellWeight)}
                  </td>
                  <td className="weighing-slip-print-right weighing-slip-print-num weighing-slip-print-weight">
                    {formatPrintWeightNumber(netRowWeight(row))}
                  </td>
                  <td className="weighing-slip-print-right weighing-slip-print-num weighing-slip-print-total">
                    {formatPrintWeight(row.weight)}
                  </td>
                  <td className="weighing-slip-print-center weighing-slip-print-time">
                    {formatPrintTime(row.weighTime)}
                  </td>
                  <td className="weighing-slip-print-center weighing-slip-print-status">
                    {row.acceptanceStatus || '—'}
                  </td>
                  <td className="weighing-slip-print-note">{row.note || ''}</td>
                  <td className="weighing-slip-print-center weighing-slip-print-photo">
                    {hasAnyPhoto(row) ? 'Có' : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
            </>
          )}
        </table>

        <div className="weighing-slip-print-signatures">
          <div>
            <p>Công nhân 1</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Công nhân 2</p>
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

export function WeighingSlipPrintBatch({
  slip,
  title,
  layout
}: {
  slip: WeighingSlipPrintData | null;
  title: string;
  layout?: WeighingSlipPrintLayout;
}) {
  if (!slip) return null;

  return (
    <div className="weighing-slip-print-batch">
      <div className="weighing-slip-print-page">
        <WeighingSlipPrintSheet slip={slip} title={title} layout={layout} />
      </div>
    </div>
  );
}
