import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, X } from 'lucide-react';
import { PRINT_COMPANY_NAME, COMPANY_BRANCH_NAME, vietNhatLogoUrl } from './layout/constants';
import { formatMoney, formatNumber } from '../utils';
import { formatVietnameseMoneyWords } from '../utils/vietnameseMoneyWords';
import { isWarehouseKgUnit } from '../utils/warehouseWeight';
import { waitForPrintImagesReady } from '../utils/printReady';

const WAREHOUSE_SLIP_PORTRAIT_STYLE_ID = 'warehouse-slip-print-page-portrait';

/** Chrome hay bỏ qua named @page khi có @page landscape toàn cục — ép A4 dọc lúc in. */
function enableWarehousePortraitPrintPage() {
  document.getElementById(WAREHOUSE_SLIP_PORTRAIT_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = WAREHOUSE_SLIP_PORTRAIT_STYLE_ID;
  style.media = 'print';
  style.textContent = '@page { size: 210mm 297mm; margin: 8mm; }';
  document.head.appendChild(style);
}

function disableWarehousePortraitPrintPage() {
  document.getElementById(WAREHOUSE_SLIP_PORTRAIT_STYLE_ID)?.remove();
}
export type WarehouseSlipPrintLine = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  documentQuantity?: number | null;
  unitPrice: number;
  lineAmount: number;
  /** SL đã quy đổi về kg (nếu quy được). */
  weightKg?: number | null;
  quotaQuantity?: number | null;
  suggestedQuantity?: number | null;
  lineNote?: string;
  sourceInboundSlipCode?: string;
};

export type WarehouseSlipPrintData = {
  slipCode: string;
  slipType: 'nhap' | 'xuat';
  warehouseKind: 'nvl' | 'san_pham' | 'tai_che' | 'hang_hong' | 'hang_hoa' | 'cong_cu_dung_cu' | 'gia_cong';
  slipDate: string;
  reason: string;
  note: string;
  createdBy: string;
  totalAmount: number;
  productionOrderRef?: string;
  machine?: string;
  shift?: string;
  recipient?: string;
  deliverer?: string;
  warehouseLocation?: string;
  /** Tên kho vật lý (từ Quản lý kho). */
  warehouseName?: string;
  /** Bản xem/in tạm, chưa được lưu vào lịch sử và chưa cập nhật tồn kho. */
  isTemporary?: boolean;
  lines: WarehouseSlipPrintLine[];
};

function normalizeWarehousePrintSlipType(value: unknown, slipCode?: string): 'nhap' | 'xuat' {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    normalized === 'xuat' ||
    normalized === 'export' ||
    normalized === 'out' ||
    normalized.includes('xuat')
  ) {
    return 'xuat';
  }
  if (
    normalized === 'nhap' ||
    normalized === 'import' ||
    normalized === 'in' ||
    normalized.includes('nhap')
  ) {
    return 'nhap';
  }

  const code = String(slipCode || '')
    .trim()
    .toUpperCase();
  if (code.startsWith('PX') || code.includes('-XH-') || code.startsWith('XEM-XH')) return 'xuat';
  if (code.startsWith('PN') || code.includes('-NH-') || code.startsWith('XEM-NH')) return 'nhap';
  return 'nhap';
}

function isNhapKhoPrintLayout(data: WarehouseSlipPrintData) {
  return normalizeWarehousePrintSlipType(data.slipType, data.slipCode) === 'nhap';
}

function isNvlExportPrintLayout(data: WarehouseSlipPrintData) {
  return (
    normalizeWarehousePrintSlipType(data.slipType, data.slipCode) === 'xuat' &&
    data.warehouseKind !== 'san_pham'
  );
}

function joinUniquePrintValues(values: Array<string | undefined | null>, separator = ', ') {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].join(separator);
}

function addNullablePrintQty(a: number | null | undefined, b: number | null | undefined): number | null {
  const left = Number.isFinite(a) && (a as number) > 0 ? (a as number) : 0;
  const right = Number.isFinite(b) && (b as number) > 0 ? (b as number) : 0;
  const sum = left + right;
  return sum > 0 ? sum : null;
}

function warehousePrintLineMergeKey(line: Pick<WarehouseSlipPrintLine, 'code' | 'unit'>) {
  return `${String(line.code || '')
    .replace(/\s+/g, '')
    .toUpperCase()}|${String(line.unit || '')
    .replace(/\s+/g, '')
    .toUpperCase()}`;
}

/** Gộp dòng trùng mã + ĐVT (cộng SL, quy đổi kg, thành tiền). */
export function mergeWarehousePrintLines(lines: WarehouseSlipPrintLine[]): WarehouseSlipPrintLine[] {
  const lineMap = new Map<string, WarehouseSlipPrintLine>();
  const lineOrder: string[] = [];

  for (const line of lines) {
    const code = String(line.code || '').trim();
    if (!code) continue;
    const key = warehousePrintLineMergeKey(line);
    const existing = lineMap.get(key);
    if (existing) {
      existing.quantity += Number.isFinite(line.quantity) ? line.quantity : 0;
      existing.documentQuantity = addNullablePrintQty(existing.documentQuantity, line.documentQuantity);
      existing.unitPrice = existing.unitPrice || line.unitPrice;
      existing.lineAmount += Number.isFinite(line.lineAmount) ? line.lineAmount : 0;
      existing.weightKg = addNullablePrintQty(existing.weightKg, line.weightKg);
      existing.quotaQuantity = addNullablePrintQty(existing.quotaQuantity, line.quotaQuantity);
      existing.suggestedQuantity = addNullablePrintQty(existing.suggestedQuantity, line.suggestedQuantity);
      if (!existing.name && line.name) existing.name = line.name;
      if (line.lineNote) {
        existing.lineNote = existing.lineNote
          ? [...new Set([existing.lineNote, line.lineNote].filter(Boolean))].join('; ')
          : line.lineNote;
      }
    } else {
      lineMap.set(key, { ...line });
      lineOrder.push(key);
    }
  }

  return lineOrder.map(key => lineMap.get(key)!);
}

/**
 * In gộp nhiều phiếu xuất/nhập: 1 bảng in, cộng SL khi trùng mã (+ ĐVT).
 */
export function mergeWarehousePrintSlips(slips: WarehouseSlipPrintData[]): WarehouseSlipPrintData {
  if (slips.length === 0) {
    throw new Error('Không có phiếu để gộp in.');
  }
  if (slips.length === 1) {
    const slip = slips[0];
    const lines = mergeWarehousePrintLines(slip.lines);
    if (lines.length === slip.lines.length) return slip;
    return {
      ...slip,
      totalAmount: lines.reduce((sum, line) => sum + (Number.isFinite(line.lineAmount) ? line.lineAmount : 0), 0),
      lines
    };
  }

  const lines = mergeWarehousePrintLines(slips.flatMap(slip => slip.lines));
  const first = slips[0];

  return {
    ...first,
    slipCode: joinUniquePrintValues(slips.map(slip => slip.slipCode)),
    slipDate: first.slipDate,
    reason: joinUniquePrintValues(slips.map(slip => slip.reason)),
    note: joinUniquePrintValues(slips.map(slip => slip.note)),
    createdBy: joinUniquePrintValues(slips.map(slip => slip.createdBy)),
    productionOrderRef: joinUniquePrintValues(slips.map(slip => slip.productionOrderRef)),
    machine: joinUniquePrintValues(slips.map(slip => slip.machine)),
    shift: joinUniquePrintValues(slips.map(slip => slip.shift)),
    recipient: joinUniquePrintValues(slips.map(slip => slip.recipient)),
    deliverer: joinUniquePrintValues(slips.map(slip => slip.deliverer)),
    warehouseLocation: joinUniquePrintValues(slips.map(slip => slip.warehouseLocation)),
    warehouseName: joinUniquePrintValues(slips.map(slip => slip.warehouseName)),
    totalAmount: lines.reduce((sum, line) => sum + (Number.isFinite(line.lineAmount) ? line.lineAmount : 0), 0),
    lines
  };
}

/** @deprecated Dùng mergeWarehousePrintSlips — giữ alias để tương thích. */
export const mergeNvlExportPrintSlips = mergeWarehousePrintSlips;

function warehouseKindTitleLabel(kind: WarehouseSlipPrintData['warehouseKind']) {
  switch (kind) {
    case 'san_pham':
      return 'THÀNH PHẨM';
    case 'tai_che':
      return 'TÁI CHẾ';
    case 'hang_hong':
      return 'HÀNG HỎNG';
    case 'hang_hoa':
      return 'HÀNG HÓA';
    case 'cong_cu_dung_cu':
      return 'CÔNG CỤ DỤNG CỤ';
    case 'gia_cong':
      return 'GIA CÔNG';
    case 'nvl':
    default:
      return 'VẬT TƯ';
  }
}

function slipTypeTitle(data: WarehouseSlipPrintData) {
  const kindLabel = warehouseKindTitleLabel(data.warehouseKind);
  const base = isNhapKhoPrintLayout(data) ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO';
  return `${base} ${kindLabel}`;
}

function codeColumnLabel(kind: WarehouseSlipPrintData['warehouseKind']) {
  return kind === 'san_pham' ? 'Mã SP' : 'Mã NPL';
}

function nameColumnLabel(kind: WarehouseSlipPrintData['warehouseKind']) {
  return kind === 'san_pham' ? 'Tên SP' : 'Tên NVL';
}

function formatSlipDate(value: string) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrintShift(shift?: string): string {
  if (!shift?.trim()) return '';
  return shift
    .split(/[,;+]/)
    .map(item => item.trim())
    .filter(item => item && item !== 'Tất cả các ca')
    .join(', ');
}

function formatSlipDateShort(value: string) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

function formatPrintQty(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (value === 0) return '';
  return formatNumber(value, fractionDigits);
}

/** Phiếu xuất NVL: số nguyên không hiện phần lẻ; số có phần lẻ làm tròn 2 chữ số. */
function formatNvlExportNumber(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return formatNumber(value, 0);
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value);
}

function formatNvlExportQty(value: number | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return '';
  return formatNvlExportNumber(value, fractionDigits);
}

function sumPrintQty(lines: WarehouseSlipPrintLine[]) {
  return lines.reduce((sum, line) => {
    const value = line.quantity;
    return Number.isFinite(value) && (value as number) > 0 ? sum + (value as number) : sum;
  }, 0);
}

function sumPrintWeightKg(lines: WarehouseSlipPrintLine[]) {
  return lines.reduce((sum, line) => {
    const value = line.weightKg;
    return Number.isFinite(value) && (value as number) > 0 ? sum + (value as number) : sum;
  }, 0);
}

function isPlasticKgPrintLine(line: WarehouseSlipPrintLine) {
  return isWarehouseKgUnit(line.unit);
}

/** ĐVT kg lên đầu; trong mỗi nhóm xếp kg quy đổi giảm dần, rồi theo mã. */
function sortPrintLinesByUnit(lines: WarehouseSlipPrintLine[]) {
  return [...lines].sort((a, b) => {
    const aKg = isWarehouseKgUnit(a.unit);
    const bKg = isWarehouseKgUnit(b.unit);
    if (aKg !== bKg) return aKg ? -1 : 1;

    const aWeight = a.weightKg;
    const bWeight = b.weightKg;
    const aVal = aWeight != null && Number.isFinite(aWeight) && aWeight > 0 ? aWeight : -1;
    const bVal = bWeight != null && Number.isFinite(bWeight) && bWeight > 0 ? bWeight : -1;
    if (aVal !== bVal) return bVal - aVal;

    return String(a.code || '').localeCompare(String(b.code || ''), 'vi');
  });
}

function formatPrintWeightKg(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '';
  return formatNvlExportNumber(value, 2);
}

function formatNhapKhoDateParts(value: string) {
  if (!value) return { day: '', month: '', year: '' };
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: '', month: '', year: '' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear())
  };
}

function warehouseImportLabel(data: WarehouseSlipPrintData) {
  const name = String(data.warehouseName || '').trim();
  if (name) return name;
  if (data.warehouseKind === 'san_pham') return `Kho Thành phẩm - ${COMPANY_BRANCH_NAME}`;
  if (data.warehouseKind === 'hang_hong') return `Kho hàng hỏng - ${COMPANY_BRANCH_NAME}`;
  if (data.warehouseKind === 'hang_hoa') return `Kho hàng hóa - ${COMPANY_BRANCH_NAME}`;
  if (data.warehouseKind === 'cong_cu_dung_cu') return `Kho công cụ dụng cụ - ${COMPANY_BRANCH_NAME}`;
  if (data.warehouseKind === 'gia_cong') return `Kho gia công - ${COMPANY_BRANCH_NAME}`;
  if (data.warehouseKind === 'tai_che') return `Kho tái chế - ${COMPANY_BRANCH_NAME}`;
  return `Kho NVL - ${COMPANY_BRANCH_NAME}`;
}

function nhapKhoAccountingCodes(kind: WarehouseSlipPrintData['warehouseKind']) {
  return kind === 'san_pham' ? { no: '155', co: '154' } : { no: '152', co: '331' };
}

function NhapKhoPrintBody({ data }: { data: WarehouseSlipPrintData }) {
  const dateParts = formatNhapKhoDateParts(data.slipDate);
  const accounts = nhapKhoAccountingCodes(data.warehouseKind);
  const totalQuantity = sumPrintQty(data.lines);
  const deliverer = data.deliverer || data.recipient || '';
  const location = data.warehouseLocation || '';
  const referenceText = data.productionOrderRef || data.reason || '';
  const printRows = data.lines.filter(
    line =>
      Boolean(line.code || line.name) ||
      line.quantity > 0 ||
      line.unitPrice > 0 ||
      line.lineAmount > 0
  );

  return (
    <>
      <div className="warehouse-nhap-kho-print-top">
        <div className="warehouse-nhap-kho-print-brand">
          <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="warehouse-nhap-kho-print-logo" />
          <div className="warehouse-nhap-kho-print-company">
            <p className="warehouse-nhap-kho-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </div>
        <div className="warehouse-nhap-kho-print-accounts">
          <p>
            <em>Nợ:</em> {accounts.no}
          </p>
          <p>
            <em>Có:</em> {accounts.co}
          </p>
        </div>
      </div>

      <div className="warehouse-nhap-kho-print-heading">
        <h1 className="warehouse-nhap-kho-print-title">{slipTypeTitle(data)}</h1>
        {data.isTemporary ? (
          <p className="mt-1 text-center text-sm font-black uppercase tracking-widest text-[#ef1b2d]">
            Bản tạm · Chưa ghi sổ kho
          </p>
        ) : null}
        <p className="warehouse-nhap-kho-print-date">
          <em>
            Ngày {dateParts.day || '……'} tháng {dateParts.month || '……'} năm {dateParts.year || '……'}
          </em>
        </p>
        <p className="warehouse-nhap-kho-print-code">
          <strong>Số:</strong> {data.slipCode || '…………'}
        </p>
      </div>

      <div className="warehouse-nhap-kho-print-meta">
        <p>
          <span>- Họ và tên người giao:</span> {deliverer || '.................................................................'}
        </p>
        <p>
          <span>- Theo</span> ............ <span>số</span> {referenceText || '..............'}{' '}
          <span>ngày</span> {dateParts.day || '.....'} <span>tháng</span> {dateParts.month || '.....'}{' '}
          <span>năm</span> {dateParts.year || '.....'} <span>của</span>{' '}
          .........................................................
        </p>
        <p>
          <span>- Nhập tại kho:</span> {warehouseImportLabel(data)}
        </p>
        <p>
          <span>Địa điểm:</span> {location || '.................................................................'}
        </p>
      </div>

      <table className="warehouse-nhap-kho-print-table">
        <thead>
          <tr>
            <th className="warehouse-nhap-kho-col-stt">
              STT
            </th>
            <th className="warehouse-nhap-kho-col-name">
              Tên, nhãn hiệu, quy cách, phẩm chất vật tư, dụng cụ sản phẩm, hàng hóa
            </th>
            <th className="warehouse-nhap-kho-col-code">
              Mã số
            </th>
            <th className="warehouse-nhap-kho-col-unit">
              Đơn vị tính
            </th>
            <th className="warehouse-nhap-kho-col-qty">Số lượng</th>
            <th className="warehouse-nhap-kho-col-price">
              Đơn giá
            </th>
            <th className="warehouse-nhap-kho-col-amount">
              Thành tiền
            </th>
          </tr>
        </thead>
        <tbody>
          {printRows.map((line, index) => (
              <tr key={`${line.code}-${index}`}>
                <td className="warehouse-slip-print-center">{index + 1}</td>
                <td>{line.name || ''}</td>
                <td className="warehouse-slip-print-center">{line.code || ''}</td>
                <td className="warehouse-slip-print-center">{line.unit || ''}</td>
                <td className="warehouse-slip-print-right">{formatPrintQty(line.quantity, 2)}</td>
                <td className="warehouse-slip-print-right">
                  {line.unitPrice > 0 ? formatMoney(line.unitPrice, 0) : ''}
                </td>
                <td className="warehouse-slip-print-right">
                  {line.lineAmount > 0 ? formatMoney(line.lineAmount, 0) : ''}
                </td>
              </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="warehouse-nhap-kho-total-label">
              Cộng
            </td>
            <td className="warehouse-slip-print-right warehouse-nhap-kho-total-value">
              {totalQuantity > 0 ? formatNumber(totalQuantity, 2) : ''}
            </td>
            <td />
            <td className="warehouse-slip-print-right warehouse-nhap-kho-total-value">
              {data.totalAmount > 0 ? formatMoney(data.totalAmount, 0) : ''}
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="warehouse-nhap-kho-print-footer">
        <p>
          <span>- Tổng số tiền (Viết bằng chữ):</span>{' '}
          {data.totalAmount > 0 ? formatVietnameseMoneyWords(data.totalAmount) : '.................................................................'}
        </p>
        <p>
          <span>- Số chứng từ gốc kèm theo:</span> {data.note || '.................................................................'}
        </p>
      </div>

      <div className="warehouse-nhap-kho-print-signatures">
        <div>
          <p>Người lập biểu</p>
          <span>(Ký, họ tên)</span>
          <strong>{data.createdBy || ''}</strong>
        </div>
        <div>
          <p>Người giao hàng</p>
          <span>(Ký, họ tên)</span>
          <strong>{deliverer}</strong>
        </div>
        <div>
          <p>Thủ kho</p>
          <span>(Ký, họ tên)</span>
        </div>
      </div>
    </>
  );
}

function NvlExportPrintBody({ data }: { data: WarehouseSlipPrintData }) {
  const sortedLines = sortPrintLinesByUnit(mergeWarehousePrintLines(data.lines));
  const plasticLines = sortedLines.filter(isPlasticKgPrintLine);
  const otherMaterialLines = sortedLines.filter(line => !isPlasticKgPrintLine(line));
  const totalPlasticKg = sumPrintWeightKg(plasticLines) || sumPrintQty(plasticLines);
  const totalOtherMaterialKg = sumPrintWeightKg(otherMaterialLines);
  const grandTotalKg = totalPlasticKg + totalOtherMaterialKg;
  const printShift = formatPrintShift(data.shift);

  return (
    <>
      <div className="warehouse-slip-print-meta warehouse-slip-print-meta--nvl-export">
        <p>
          <strong>Số phiếu:</strong> {data.slipCode || ''}
        </p>
        <p>
          <strong>Ngày:</strong> {formatSlipDateShort(data.slipDate)}
        </p>
        <p>
          <strong>Căn cứ Lệnh SX/KH số:</strong> {data.productionOrderRef || ''}
        </p>
        <p>
          <strong>Máy:</strong> {data.machine || ''}
        </p>
        {printShift ? (
          <p>
            <strong>Ca:</strong> {printShift}
          </p>
        ) : null}
        <p>
          <strong>Người nhận:</strong> {data.recipient || data.createdBy || ''}
        </p>
      </div>

      <table className="warehouse-slip-print-table warehouse-slip-print-table--nvl-export">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã vật tư</th>
            <th>Tên vật tư</th>
            <th>ĐVT</th>
            <th>SL THỰC</th>
            <th>Quy về kg</th>
            <th>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {sortedLines.map((line, index) => (
            <tr key={`${line.code}-${index}`}>
              <td className="warehouse-slip-print-center">{index + 1}</td>
              <td>{line.code || ''}</td>
              <td className="warehouse-slip-print-name">{line.name || ''}</td>
              <td className="warehouse-slip-print-center">{line.unit || ''}</td>
              <td className="warehouse-slip-print-right">{formatNvlExportQty(line.quantity, 2)}</td>
              <td className="warehouse-slip-print-right">{formatPrintWeightKg(line.weightKg)}</td>
              <td>{line.lineNote || ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {plasticLines.length > 0 ? <tr>
            <td colSpan={5} className="warehouse-slip-print-total-label">
              TỔNG NHỰA (kg)
            </td>
            <td className="warehouse-slip-print-right warehouse-slip-print-total-value">
              {totalPlasticKg > 0 ? `${formatNvlExportNumber(totalPlasticKg, 2)} kg` : '0 kg'}
            </td>
            <td />
          </tr> : null}
          {otherMaterialLines.length > 0 ? <tr>
            <td colSpan={5} className="warehouse-slip-print-total-label">
              TỔNG VẬT TƯ KHÁC (kg)
            </td>
            <td className="warehouse-slip-print-right warehouse-slip-print-total-value">
              {totalOtherMaterialKg > 0 ? `${formatNvlExportNumber(totalOtherMaterialKg, 2)} kg` : '0 kg'}
            </td>
            <td />
          </tr> : null}
          <tr className="warehouse-slip-print-grand-total-row">
            <td colSpan={5} className="warehouse-slip-print-total-label">
              TỔNG KG
            </td>
            <td className="warehouse-slip-print-right warehouse-slip-print-total-value">
              {grandTotalKg > 0 ? `${formatNvlExportNumber(grandTotalKg, 2)} kg` : '0 kg'}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      <p className="warehouse-slip-print-footnote">
        <strong>Ghi chú:</strong> Tổng nhựa và tổng vật tư khác được cộng riêng theo cột «Quy về kg»; không cộng chung số lượng khác ĐVT.
      </p>

      <div className="warehouse-slip-print-signatures warehouse-slip-print-signatures--nvl-export">
        <div>
          <p>Người lập phiếu</p>
          <span>(NV kho)</span>
        </div>
        <div>
          <p>Người giao</p>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
        <div>
          <p>Người nhận</p>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
      </div>
    </>
  );
}

export function WarehouseSlipPrintSheet({ data }: { data: WarehouseSlipPrintData }) {
  const printDate = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const printData: WarehouseSlipPrintData = {
    ...data,
    slipType: normalizeWarehousePrintSlipType(data.slipType, data.slipCode)
  };
  const nvlExport = isNvlExportPrintLayout(printData);
  const nhapKho = isNhapKhoPrintLayout(printData);
  // Phiếu xuất NVL 8–12 dòng thường chỉ tràn phần ký tên sang trang thứ hai.
  // Đánh dấu riêng để CSS in thu gọn đồng đều chữ và khoảng cách, thay vì để
  // Chrome tách vài dòng chữ ký thành một trang trống gần như hoàn toàn.
  const useCompactPrintLayout = nvlExport && printData.lines.length >= 8 && printData.lines.length <= 12;

  if (nhapKho) {
    return (
      <div className="warehouse-slip-print-sheet warehouse-slip-print-sheet--nhap-kho">
        <div className="warehouse-slip-print-doc warehouse-slip-print-doc--nhap-kho">
          <NhapKhoPrintBody data={printData} />
        </div>
      </div>
    );
  }

  return (
    <div className="warehouse-slip-print-sheet warehouse-slip-print-sheet--xuat">
      <div className={`warehouse-slip-print-doc${useCompactPrintLayout ? ' warehouse-slip-print-doc--compact' : ''}`}>
        <header className="warehouse-slip-print-header">
          <div className="warehouse-slip-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="warehouse-slip-print-logo" />
            <div className="warehouse-slip-print-company">
              <p className="warehouse-slip-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <h1 className="warehouse-slip-print-title">{slipTypeTitle(printData)}</h1>
        </header>
        {printData.isTemporary ? (
          <p className="mb-3 text-center text-sm font-black uppercase tracking-widest text-[#ef1b2d]">
            Bản tạm · Chưa ghi sổ kho
          </p>
        ) : null}

        {nvlExport ? (
          <NvlExportPrintBody data={printData} />
        ) : (
          <>
            <div className="warehouse-slip-print-meta">
              <p>
                <strong>Số phiếu:</strong> {printData.slipCode || '-'}
              </p>
              <p>
                <strong>Ngày phiếu:</strong> {formatSlipDate(printData.slipDate)}
              </p>
              <p>
                <strong>Người lập:</strong> {printData.createdBy || '-'}
              </p>
              <p>
                <strong>Lý do:</strong> {printData.reason || '-'}
              </p>
              {printData.note ? (
                <p>
                  <strong>Ghi chú:</strong> {printData.note}
                </p>
              ) : null}
              <p>
                <strong>Ngày in:</strong> {printDate}
              </p>
            </div>

            <table className="warehouse-slip-print-table warehouse-slip-print-table--xuat">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>{codeColumnLabel(printData.warehouseKind)}</th>
                  <th>{nameColumnLabel(printData.warehouseKind)}</th>
                  <th>ĐVT</th>
                  <th>SL</th>
                </tr>
              </thead>
              <tbody>
                {sortPrintLinesByUnit(printData.lines).map((line, index) => (
                  <tr key={`${line.code}-${index}`}>
                    <td className="warehouse-slip-print-center">{index + 1}</td>
                    <td>{line.code || '-'}</td>
                    <td className="warehouse-slip-print-name">{line.name || '-'}</td>
                    <td className="warehouse-slip-print-center">{line.unit || '-'}</td>
                    <td className="warehouse-slip-print-right">{formatNumber(line.quantity, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="warehouse-slip-print-total-label">
                    Tổng cộng
                  </td>
                  <td className="warehouse-slip-print-right warehouse-slip-print-total-value">
                    {formatNumber(sumPrintQty(printData.lines), 2)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="warehouse-slip-print-signatures">
              <div>
                <p>{printData.warehouseKind === 'san_pham' ? 'Lái xe' : 'Người lập phiếu'}</p>
                <span>(Ký, ghi rõ họ tên)</span>
              </div>
              <div>
                <p>Thủ kho</p>
                <span>(Ký, ghi rõ họ tên)</span>
              </div>
              <div>
                <p>Kế toán</p>
                <span>(Ký, ghi rõ họ tên)</span>
              </div>
              <div>
                <p>Giám đốc</p>
                <span>(Ký, ghi rõ họ tên)</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Batch dùng chung cho các luồng in tổng hợp; giữ nguyên mẫu phiếu hiện hữu. */
export function WarehouseSlipPrintBatch({ slips }: { slips: WarehouseSlipPrintData[] }) {
  if (!slips.length) return null;
  return (
    <div className="warehouse-slip-print-batch">
      {slips.map((slip, index) => (
        <WarehouseSlipPrintSheet key={`${slip.slipCode || 'slip'}-${index}`} data={slip} />
      ))}
    </div>
  );
}

export default function WarehouseSlipPrintModal({
  open,
  data = null,
  slips = null,
  autoPrint = false,
  onClose,
  onAfterPrint
}: {
  open: boolean;
  data?: WarehouseSlipPrintData | null;
  /** In gộp nhiều phiếu — mỗi phiếu một trang. */
  slips?: WarehouseSlipPrintData[] | null;
  autoPrint?: boolean;
  onClose: () => void;
  onAfterPrint?: () => void;
}) {
  const [pendingPrint, setPendingPrint] = useState(false);
  const printSlips = slips && slips.length > 0 ? slips : data ? [data] : [];
  const primarySlip = printSlips[0] ?? null;

  useEffect(() => {
    if (!open) setPendingPrint(false);
  }, [open]);

  useEffect(() => {
    if (!open || !autoPrint || printSlips.length === 0) return;
    setPendingPrint(true);
  }, [open, autoPrint, printSlips.length, primarySlip?.slipCode]);

  useEffect(() => {
    if (!pendingPrint || printSlips.length === 0) return;
    document.body.classList.add('warehouse-slip-print-active');
    enableWarehousePortraitPrintPage();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          document.body.classList.remove('warehouse-slip-print-active');
          disableWarehousePortraitPrintPage();
          onAfterPrint?.();
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('warehouse-slip-print-active');
      disableWarehousePortraitPrintPage();
    };
  }, [pendingPrint, printSlips, onAfterPrint]);

  const printBatchPortal =
    pendingPrint && printSlips.length > 0
      ? createPortal(
          <div className="warehouse-slip-print-batch">
            {printSlips.map((slip, index) => (
              <WarehouseSlipPrintSheet key={`${slip.slipCode}-${index}`} data={slip} />
            ))}
          </div>,
          document.body
        )
      : null;

  if (!open || printSlips.length === 0) {
    return printBatchPortal;
  }

  const isBatch = printSlips.length > 1;

  return (
    <>
      {printBatchPortal}

      <div className="warehouse-slip-print-modal fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="warehouse-slip-print-modal-chrome flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">
                {isBatch
                  ? `In gộp ${printSlips.length} phiếu`
                  : primarySlip?.isTemporary
                    ? 'Bản in tạm · Chưa ghi sổ kho'
                    : isNhapKhoPrintLayout(primarySlip!)
                      ? 'Mẫu phiếu nhập kho'
                      : 'Mẫu phiếu xuất kho'}
              </h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                {isBatch
                  ? printSlips.map(slip => slip.slipCode).filter(Boolean).join(' · ')
                  : `${primarySlip?.slipCode || ''} · ${slipTypeTitle(primarySlip!)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 px-4 py-4 sm:px-5">
            <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-4">
              {printSlips.map((slip, index) => (
                <div
                  key={`${slip.slipCode}-${index}`}
                  className="warehouse-slip-print-preview rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <WarehouseSlipPrintSheet data={slip} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => setPendingPrint(true)}
              disabled={pendingPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
            >
              {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {isBatch
                ? `In gộp ${printSlips.length} phiếu`
                : primarySlip?.isTemporary
                  ? 'In tạm phiếu'
                  : 'In phiếu'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
