import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabAccess } from '../../app/useTabAccess';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  HandCoins,
  ImageUp,
  Loader2,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Route,
  Save,
  Trash2,
  X
} from 'lucide-react';
import {
  cloudinaryPreviewUrl,
  fileToOptimizedImageDataUrl,
  uploadImage
} from '../_shared/recordHelpers';
import { vietNhatLogoUrl } from '../../components/layout/constants';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import {
  FilterCombobox,
  MultiSelectFilter,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge,
  RowActionsMenu
} from '../../components/shared/table';
import { VietmapRoutePlanner } from './VietmapRoutePlanner';

export type VehicleOption = {
  id: string;
  loai_xe: string;
  bien_so_xe: string;
  ma_tai_xe?: string;
  tai_xe_phu_trach?: string;
};

export type StaffOption = {
  code: string;
  name: string;
};

type VehicleExpense = {
  id: string;
  ngay_gio: string;
  loai_chi_phi: string;
  ten_chi_phi: string;
  so_luong: number;
  so_tien: number;
  xe_id: string;
  bien_so_xe: string;
  ma_nhan_su: string;
  nhan_vien_phu_trach: string;
  hoa_don_url: string;
  hoa_don_public_id: string;
  ghi_chu: string;
};

type FuelPriceOption = {
  title: string;
  price: number;
  zone1_price: number;
  zone2_price: number;
};

function normalizeFuelPriceOptions(payload: unknown, date: string): FuelPriceOption[] {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).options
    : payload;
  const records = Array.isArray(source)
    ? source.flatMap(group => Array.isArray(group) ? group : [group])
    : [];
  const seen = new Set<string>();

  return records.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const recordDate = text(record.date).slice(0, 10);
    if (recordDate && recordDate !== date) return [];
    const title = text(record.title);
    if (!title || seen.has(title)) return [];
    seen.add(title);
    return [{
      title,
      price: numberValue(record.price ?? record.zone1_price),
      zone1_price: numberValue(record.zone1_price ?? record.price),
      zone2_price: numberValue(record.zone2_price)
    }];
  });
}

type VehicleDeliveryRequest = {
  id: string;
  so_yeu_cau: string;
  ngay_yeu_cau: string;
  dia_diem_giao: string;
  hang_hoa: string;
  so_luong: number;
  don_vi: string;
  xe_id: string;
  bien_so_xe: string;
  ma_nhan_su: string;
  ten_tai_xe: string;
  trang_thai: string;
  ghi_chu: string;
  ten_khach_hang: string;
  thu_tu_giao: number;
  vi_do: number | null;
  kinh_do: number | null;
  km_vietmap: number;
  km_nhap_tay: number | null;
  km_chot: number;
  km_luy_ke: number;
};

type BusinessShippingOrderLine = {
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
};

type BusinessShippingOrder = {
  id: string;
  ma_lenh: string;
  ngay_xuat: string;
  dia_chi_giao: string;
  ten_khach_hang: string;
  ghi_chu: string;
  chi_tiet: BusinessShippingOrderLine[];
};

type VehicleKmLog = {
  id: string;
  ten_lai_xe: string;
  ma_nhan_su: string;
  xe_id: string;
  bien_so_xe: string;
  ngay_gio_di: string;
  ngay_gio_ve: string;
  loai_km: string;
  so_km_di: number;
  so_km_ve: number;
  tong_km: number;
  anh_url: string;
  anh_public_id: string;
  ghi_chu: string;
};

type CustomerPayment = {
  id: string;
  ngay_thu: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  so_tien: number;
  hinh_thuc: string;
  xe_id: string;
  bien_so_xe: string;
  ma_nhan_su: string;
  nguoi_thu: string;
  ghi_chu: string;
  anh_url: string;
  anh_public_id: string;
};

export type CustomerOption = {
  code: string;
  name: string;
  debt: number;
};

const PAYMENT_METHODS = ['Tiền mặt', 'Chuyển khoản'] as const;

/** VietQR chuyển khoản — VietinBank */
const VIETQR_VIETINBANK = {
  bankId: '970415',
  bankLabel: 'VietinBank',
  accountNo: '100001692967'
} as const;

function buildVietQrImageUrl(amount: number, addInfo: string) {
  const params = new URLSearchParams();
  const rounded = Math.round(Number(amount) || 0);
  if (rounded > 0) params.set('amount', String(rounded));
  const info = addInfo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  if (info) params.set('addInfo', info);
  const query = params.toString();
  return `https://img.vietqr.io/image/${VIETQR_VIETINBANK.bankId}-${VIETQR_VIETINBANK.accountNo}-compact2.png${
    query ? `?${query}` : ''
  }`;
}

function escapePrintHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function printVehicleExpenses(
  rows: VehicleExpense[],
  filters: { fromDate: string; toDate: string; vehicle: string; staff: string }
) {
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) {
    window.alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup rồi thử lại.');
    return;
  }
  popup.opener = null;
  const total = rows.reduce((sum, row) => sum + row.so_luong * row.so_tien, 0);
  const driver = filters.staff || [...new Set(rows.map(row => row.nhan_vien_phu_trach).filter(Boolean))].join(', ');
  const vehicle = filters.vehicle || [...new Set(rows.map(row => row.bien_so_xe).filter(Boolean))].join(', ');
  const period = filters.fromDate || filters.toDate
    ? `${filters.fromDate || '...'} đến ${filters.toDate || '...'}`
    : 'Tất cả thời gian';
  const expenseRows = rows.length > 0
    ? rows.map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapePrintHtml(row.ten_chi_phi)}<small>${escapePrintHtml(formatDateTime(row.ngay_gio))} · ${escapePrintHtml(row.loai_chi_phi)}</small></td>
          <td class="center">${escapePrintHtml(row.so_luong)}</td>
          <td class="money">${escapePrintHtml(formatMoney(row.so_tien))}</td>
          <td class="money">${escapePrintHtml(formatMoney(row.so_luong * row.so_tien))}</td>
          <td>${escapePrintHtml(row.ghi_chu || '')}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="center empty">Không có dữ liệu phù hợp bộ lọc</td></tr>';

  popup.document.write(`<!doctype html>
  <html lang="vi"><head><meta charset="utf-8"><title>Báo cáo chi phí lái xe</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font-family: "Times New Roman", serif; font-size: 12px; }
    .sheet { width: 100%; }
    .header { display: grid; grid-template-columns: 130px 1fr; align-items: center; border-bottom: 1px solid #111; padding-bottom: 7px; }
    .logo { width: 118px; max-height: 58px; object-fit: contain; }
    .company { font-size: 13px; font-weight: 700; line-height: 1.4; }
    h1 { margin: 14px 0 10px; text-align: center; font-size: 19px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 24px; margin-bottom: 9px; }
    .meta div { border-bottom: 1px dotted #555; padding: 3px 2px; }
    .section { margin-top: 8px; font-weight: 700; }
    .blank { height: 25px; border-bottom: 1px dotted #777; padding: 5px 3px; font-weight: 400; }
    table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    th, td { border: 1px solid #111; padding: 5px 6px; vertical-align: top; }
    th { text-align: center; font-weight: 700; }
    td small { display: block; margin-top: 2px; color: #444; }
    .center { text-align: center; }
    .money { text-align: right; white-space: nowrap; }
    .empty { height: 42px; vertical-align: middle; color: #666; }
    .total td { font-weight: 700; }
    .summary { width: 55%; margin-top: 10px; }
    .summary td:first-child { font-weight: 700; width: 55%; }
    .sign-date { margin-top: 24px; text-align: right; font-style: italic; }
    .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 18px; text-align: center; }
    .sign-box { min-height: 118px; }
    .sign-title { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    .sign-hint { margin-top: 4px; font-size: 11px; font-style: italic; color: #333; }
    .sign-space { height: 72px; }
    .sign-name { margin-top: 4px; min-height: 18px; }
  </style></head><body>
    <main class="sheet">
      <header class="header">
        <img class="logo" src="${escapePrintHtml(vietNhatLogoUrl)}" alt="Việt Nhật">
        <div class="company">Công ty cổ phần vật liệu cách nhiệt Việt Nhật<br>Chi nhánh Phú Thọ</div>
      </header>
      <h1>BÁO CÁO – CHI PHÍ – LÁI XE</h1>
      <div class="meta">
        <div><b>Tên lái xe:</b> ${escapePrintHtml(driver || '................................')}</div>
        <div><b>BSX:</b> ${escapePrintHtml(vehicle || '................................')}</div>
        <div><b>Khoảng ngày:</b> ${escapePrintHtml(period)}</div>
        <div><b>Số khoản chi:</b> ${rows.length}</div>
      </div>
      <div class="section">I. Phần giao hàng (kẹp yêu cầu xuất hàng vào)</div>
      <div class="blank">Yêu cầu xuất hàng số: ........................................ Ngày: ........................</div>
      <div class="blank">Địa điểm giao hàng: ............................................................................</div>
      <div class="blank">Số lượng hàng hóa: ..............................................................................</div>
      <div class="section">II. Báo cáo hàng trả về, lý do (nếu có hàng trả yêu cầu có xác nhận của thủ kho)</div>
      <div class="blank"></div><div class="blank"></div>
      <div class="section">III. Chi phí lái xe</div>
      <table>
        <thead><tr><th style="width:7%">STT</th><th>Diễn giải</th><th style="width:10%">Số lượng</th><th style="width:16%">Đơn giá</th><th style="width:17%">Thành tiền</th><th style="width:18%">Ghi chú</th></tr></thead>
        <tbody>${expenseRows}</tbody>
        <tfoot><tr class="total"><td colspan="4" class="center">Tổng cộng</td><td class="money">${escapePrintHtml(formatMoney(total))}</td><td></td></tr></tfoot>
      </table>
      <div class="section">IV. Thu tiền</div>
      <table><thead><tr><th>STT</th><th>Khách hàng</th><th>Số tiền</th></tr></thead><tbody>${[1,2,3].map(i => `<tr><td class="center">${i}</td><td>&nbsp;</td><td>&nbsp;</td></tr>`).join('')}</tbody></table>
      <div class="section">V. Hóa đơn nợ và chuyển khoản</div>
      <table><thead><tr><th>STT</th><th>Khách hàng</th><th>Số tiền</th><th>Người cho nợ</th></tr></thead><tbody>${[1,2,3].map(i => `<tr><td class="center">${i}</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`).join('')}</tbody></table>
      <table class="summary"><tr><td>TỔNG THU</td><td></td></tr><tr><td>CHI PHÍ</td><td class="money">${escapePrintHtml(formatMoney(total))}</td></tr><tr><td>CÒN NỘP</td><td></td></tr></table>
      <div class="sign-date">Phú Thọ, ngày ...... tháng ...... năm ........</div>
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-title">Lái xe</div>
          <div class="sign-hint">(Ký và ghi rõ họ tên)</div>
          <div class="sign-space"></div>
          <div class="sign-name">${escapePrintHtml(driver || '................................')}</div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Quản lý</div>
          <div class="sign-hint">(Ký và ghi rõ họ tên)</div>
          <div class="sign-space"></div>
          <div class="sign-name">................................</div>
        </div>
      </div>
    </main>
    <script>window.addEventListener('load', () => { window.print(); });<\/script>
  </body></html>`);
  popup.document.close();
}

function printVehicleKmLogs(
  rows: VehicleKmLog[],
  filters: { fromDate: string; toDate: string; vehicle: string; driver: string }
) {
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) {
    window.alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép popup rồi thử lại.');
    return;
  }
  popup.opener = null;
  const driver = filters.driver || [...new Set(rows.map(row => row.ten_lai_xe).filter(Boolean))].join(', ');
  const vehicle = filters.vehicle || [...new Set(rows.map(row => row.bien_so_xe).filter(Boolean))].join(', ');
  const totalKm = rows.reduce((sum, row) => sum + row.tong_km, 0);
  const bodyRows = rows.length > 0
    ? rows.map(row => `
        <tr>
          <td>${escapePrintHtml(formatDateTime(row.ngay_gio_di))}</td>
          <td>${escapePrintHtml(row.ngay_gio_ve ? formatDateTime(row.ngay_gio_ve) : '')}</td>
          <td>${escapePrintHtml(row.loai_km || '')}</td>
          <td class="center">${escapePrintHtml(formatNumber(row.so_km_di))}</td>
          <td class="center">${escapePrintHtml(formatNumber(row.so_km_ve))}</td>
          <td class="center">${escapePrintHtml(formatNumber(row.tong_km))}</td>
          <td>${escapePrintHtml(row.ghi_chu || '')}</td>
        </tr>`).join('')
    : `<tr><td class="blank-cell"></td><td class="blank-cell"></td><td class="blank-cell"></td><td class="blank-cell"></td><td class="blank-cell"></td><td class="blank-cell"></td><td class="blank-cell"></td></tr>`;

  popup.document.write(`<!doctype html>
  <html lang="vi"><head><meta charset="utf-8"><title>Phiếu xác nhận KM lái xe</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font-family: "Times New Roman", serif; font-size: 13px; }
    .sheet { width: 100%; }
    .header { display: grid; grid-template-columns: 130px 1fr; align-items: center; border-bottom: 1px solid #111; padding-bottom: 7px; }
    .logo { width: 118px; max-height: 58px; object-fit: contain; }
    .company { font-size: 13px; font-weight: 700; line-height: 1.4; }
    h1 { margin: 16px 0 14px; text-align: center; font-size: 20px; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 40px; margin-bottom: 14px; font-weight: 700; }
    .meta span.value { font-weight: 400; border-bottom: 1px dotted #555; padding: 0 4px; display: inline-block; min-width: 160px; }
    table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    th, td { border: 1px solid #111; padding: 7px 8px; vertical-align: middle; }
    th { text-align: center; font-weight: 700; background: #f2f2f2; }
    .center { text-align: center; }
    .blank-cell { height: 34px; }
    tfoot td { font-weight: 700; }
    .confirm { margin-top: 30px; text-align: center; font-weight: 700; }
    .sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 10px; text-align: center; }
    .sign-box { min-height: 110px; }
    .sign-title { font-weight: 700; }
    .sign-hint { margin-top: 4px; font-size: 11px; font-style: italic; color: #333; }
    .sign-space { height: 70px; }
    .sign-name { margin-top: 4px; min-height: 18px; }
  </style></head><body>
    <main class="sheet">
      <header class="header">
        <img class="logo" src="${escapePrintHtml(vietNhatLogoUrl)}" alt="Việt Nhật">
        <div class="company">Công ty cổ phần vật liệu cách nhiệt Việt Nhật<br>Đ/c: Chi nhánh Phú Thọ</div>
      </header>
      <h1>PHIẾU XÁC NHẬN KM LÁI XE</h1>
      <div class="meta">
        <div>Tên Lái Xe: <span class="value">${escapePrintHtml(driver)}</span></div>
        <div>Biển số xe: <span class="value">${escapePrintHtml(vehicle)}</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th colspan="2">Thời gian lưu hành</th>
            <th rowspan="2">Loại KM</th>
            <th colspan="3">Số Km</th>
            <th rowspan="2">Ghi chú</th>
          </tr>
          <tr>
            <th>Ngày giờ đi</th>
            <th>Ngày giờ về</th>
            <th>Số KM đi</th>
            <th>Số KM về</th>
            <th>Tổng</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        ${rows.length > 0 ? `<tfoot><tr><td colspan="5" class="center">Tổng cộng</td><td class="center">${escapePrintHtml(formatNumber(totalKm))}</td><td></td></tr></tfoot>` : ''}
      </table>
      <div class="confirm">Bộ phận xác nhận</div>
      <div class="sign-grid">
        <div class="sign-box">
          <div class="sign-title">Lái xe</div>
          <div class="sign-hint">(Ký và ghi rõ họ tên)</div>
          <div class="sign-space"></div>
          <div class="sign-name">${escapePrintHtml(driver || '................................')}</div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Quản lý</div>
          <div class="sign-hint">(Ký và ghi rõ họ tên)</div>
          <div class="sign-space"></div>
          <div class="sign-name">................................</div>
        </div>
      </div>
    </main>
    <script>window.addEventListener('load', () => { window.print(); });<\/script>
  </body></html>`);
  popup.document.close();
}

type VehicleLogProductLine = {
  id: string;
  loai: string;
  ten_mat_hang: string;
  ma_san_pham: string;
  so_luong: number;
  doanh_thu: number;
};

type VehicleLog = {
  id: string;
  ngay_gio: string;
  ca: string;
  xe_id: string;
  bien_so_xe: string;
  ma_nhan_su: string;
  nhan_vien_phu_trach: string;
  tong_mat_hang: number;
  tong_doanh_thu: number;
  tong_chi_phi: number;
  chi_tiet_mat_hang: VehicleLogProductLine[];
  ten_mat_hang: string;
  ma_san_pham: string;
  sl_cuon_cach_nhiet: number;
  doanh_thu_cach_nhiet: number;
  so_luong_bao_bi: number;
  doanh_thu_bao_bi: number;
  so_luong_tui_tam_gia_cong: number;
  doanh_thu_tui_tam_gia_cong: number;
  so_luong_tui_niem_phong: number;
  doanh_thu_tui_niem_phong: number;
  so_luong_tui_cao_cap_chong_soc: number;
  thanh_tien_tui_cao_cap_chong_soc: number;
  ds_poly: number;
  thuong_chuyen_giao_hang: number;
  cong_lai_xe_theo_km: number;
  thuong_km_di: number;
  chi_so_km_truoc: number;
  chi_so_km_ve: number;
  so_km_thuc_te: number;
  so_lenh: number;
  so_chuyen: number;
  ten_lx1: string;
  cong_lx1: number;
  luong_lx1: number;
  tien_an_lx1: number;
  tien_ds_lx1: number;
  tien_thuong_chuyen_lx1: number;
  tien_luat_lx1: number;
  ghi_chu: string;
};

type LogFormTab = 'doanh_thu' | 'km' | 'luong';

type ProductOption = {
  code: string;
  name: string;
};

const PRODUCT_LINE_TYPES = [
  { id: 'cach_nhiet', label: 'Cách nhiệt (cuộn)' },
  { id: 'bao_bi', label: 'Bao bì (cuộn)' },
  { id: 'tui_tam_gia_cong', label: 'Túi/tấm gia công (cái)' },
  { id: 'tui_niem_phong', label: 'Túi niêm phong (cuộn)' },
  { id: 'tui_cao_cap_chong_soc', label: 'Túi cao cấp chống sốc' },
  { id: 'ds_poly', label: 'DS POLY' }
] as const;

function createProductLine(partial?: Partial<VehicleLogProductLine>): VehicleLogProductLine {
  return {
    id: partial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    loai: partial?.loai || '',
    ten_mat_hang: partial?.ten_mat_hang || '',
    ma_san_pham: partial?.ma_san_pham || '',
    so_luong: numberValue(partial?.so_luong),
    doanh_thu: numberValue(partial?.doanh_thu)
  };
}

function parseProductLines(value: unknown): VehicleLogProductLine[] {
  if (typeof value === 'string') {
    try {
      return parseProductLines(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => createProductLine({
      id: text(row.id) || undefined,
      loai: text(row.loai),
      ten_mat_hang: text(row.ten_mat_hang),
      ma_san_pham: text(row.ma_san_pham),
      so_luong: numberValue(row.so_luong),
      doanh_thu: numberValue(row.doanh_thu)
    }));
}

function productLinesFromFlat(row: Record<string, unknown>): VehicleLogProductLine[] {
  const existing = parseProductLines(row.chi_tiet_mat_hang);
  if (existing.length > 0) return existing;

  const fallbackName = text(row.ten_mat_hang);
  const fallbackCode = text(row.ma_san_pham);
  const pairs: Array<{ loai: string; so_luong: number; doanh_thu: number }> = [
    { loai: 'cach_nhiet', so_luong: numberValue(row.sl_cuon_cach_nhiet), doanh_thu: numberValue(row.doanh_thu_cach_nhiet) },
    { loai: 'bao_bi', so_luong: numberValue(row.so_luong_bao_bi), doanh_thu: numberValue(row.doanh_thu_bao_bi) },
    { loai: 'tui_tam_gia_cong', so_luong: numberValue(row.so_luong_tui_tam_gia_cong), doanh_thu: numberValue(row.doanh_thu_tui_tam_gia_cong) },
    { loai: 'tui_niem_phong', so_luong: numberValue(row.so_luong_tui_niem_phong), doanh_thu: numberValue(row.doanh_thu_tui_niem_phong) },
    { loai: 'tui_cao_cap_chong_soc', so_luong: numberValue(row.so_luong_tui_cao_cap_chong_soc), doanh_thu: numberValue(row.thanh_tien_tui_cao_cap_chong_soc) },
    { loai: 'ds_poly', so_luong: 0, doanh_thu: numberValue(row.ds_poly) }
  ];
  return pairs
    .filter(item => item.so_luong > 0 || item.doanh_thu > 0)
    .map(item => createProductLine({
      loai: item.loai,
      ten_mat_hang: fallbackName,
      ma_san_pham: fallbackCode,
      so_luong: item.so_luong,
      doanh_thu: item.doanh_thu
    }));
}

function flattenProductLines(lines: VehicleLogProductLine[]) {
  const sumBy = (loai: string, field: 'so_luong' | 'doanh_thu') =>
    lines.filter(line => line.loai === loai).reduce((sum, line) => sum + numberValue(line[field]), 0);

  return {
    ten_mat_hang: lines.find(line => line.ten_mat_hang)?.ten_mat_hang || '',
    ma_san_pham: lines.find(line => line.ma_san_pham)?.ma_san_pham || '',
    sl_cuon_cach_nhiet: sumBy('cach_nhiet', 'so_luong'),
    doanh_thu_cach_nhiet: sumBy('cach_nhiet', 'doanh_thu'),
    so_luong_bao_bi: sumBy('bao_bi', 'so_luong'),
    doanh_thu_bao_bi: sumBy('bao_bi', 'doanh_thu'),
    so_luong_tui_tam_gia_cong: sumBy('tui_tam_gia_cong', 'so_luong'),
    doanh_thu_tui_tam_gia_cong: sumBy('tui_tam_gia_cong', 'doanh_thu'),
    so_luong_tui_niem_phong: sumBy('tui_niem_phong', 'so_luong'),
    doanh_thu_tui_niem_phong: sumBy('tui_niem_phong', 'doanh_thu'),
    so_luong_tui_cao_cap_chong_soc: sumBy('tui_cao_cap_chong_soc', 'so_luong'),
    thanh_tien_tui_cao_cap_chong_soc: sumBy('tui_cao_cap_chong_soc', 'doanh_thu'),
    ds_poly: sumBy('ds_poly', 'doanh_thu'),
    tong_mat_hang: lines.reduce((sum, line) => sum + numberValue(line.so_luong), 0),
    tong_doanh_thu: lines.reduce((sum, line) => sum + numberValue(line.doanh_thu), 0)
  };
}

const EXPENSE_TYPES = ['CHI PHÍ XĂNG DẦU', 'CÁC CHI PHÍ KHÁC CỦA XE'] as const;
const KM_TYPES = ['Giao hàng', 'Nhận hàng', 'Giao & nhận', 'Công tác', 'Nội bộ', 'Khác'] as const;

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function localDateTimeValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function apiDateTimeValue(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || '—'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0)} đ`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value || 0);
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể xử lý yêu cầu.');
  return data;
}

function normalizeExpenses(data: unknown): VehicleExpense[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: unknown[] }).rows
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      ngay_gio: text(row.ngay_gio),
      loai_chi_phi: text(row.loai_chi_phi),
      ten_chi_phi: text(row.ten_chi_phi),
      so_luong: numberValue(row.so_luong) || 1,
      so_tien: numberValue(row.so_tien),
      xe_id: text(row.xe_id),
      bien_so_xe: text(row.bien_so_xe),
      ma_nhan_su: text(row.ma_nhan_su),
      nhan_vien_phu_trach: text(row.nhan_vien_phu_trach),
      hoa_don_url: text(row.hoa_don_url),
      hoa_don_public_id: text(row.hoa_don_public_id),
      ghi_chu: text(row.ghi_chu)
    }));
}

function isRemoteImageUrl(url: string) {
  return /^https?:\/\//i.test(url.trim());
}

function normalizeCustomerPayments(data: unknown): CustomerPayment[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: unknown[] }).rows
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      ngay_thu: text(row.ngay_thu),
      ma_khach_hang: text(row.ma_khach_hang),
      ten_khach_hang: text(row.ten_khach_hang),
      so_tien: numberValue(row.so_tien),
      hinh_thuc: text(row.hinh_thuc) || PAYMENT_METHODS[0],
      xe_id: text(row.xe_id),
      bien_so_xe: text(row.bien_so_xe),
      ma_nhan_su: text(row.ma_nhan_su),
      nguoi_thu: text(row.nguoi_thu),
      ghi_chu: text(row.ghi_chu),
      anh_url: text(row.anh_url),
      anh_public_id: text(row.anh_public_id)
    }));
}

function emptyCustomerPaymentForm(): Omit<CustomerPayment, 'id'> {
  return {
    ngay_thu: localDateTimeValue(),
    ma_khach_hang: '',
    ten_khach_hang: '',
    so_tien: 0,
    hinh_thuc: PAYMENT_METHODS[0],
    xe_id: '',
    bien_so_xe: '',
    ma_nhan_su: '',
    nguoi_thu: '',
    ghi_chu: '',
    anh_url: '',
    anh_public_id: ''
  };
}

async function patchCustomerPaymentImage(
  id: string,
  image: { imageUrl: string; imagePublicId: string }
) {
  await readJson(
    await fetch(`/api/thu-tien-khach-hang/${encodeURIComponent(id)}/anh`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anh_url: image.imageUrl,
        anh_public_id: image.imagePublicId
      })
    })
  );
}

function normalizeCustomerOptions(data: unknown): CustomerOption[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { customers?: unknown }).customers)
    ? (data as { customers: unknown[] }).customers
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      code: text(row.ma_khach_hang),
      name: text(row.ten_khach_hang),
      debt: numberValue(row.cong_no)
    }))
    .filter(customer => customer.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function normalizeLogs(data: unknown): VehicleLog[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: unknown[] }).rows
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      ngay_gio: text(row.ngay_gio),
      ca: text(row.ca),
      xe_id: text(row.xe_id),
      bien_so_xe: text(row.bien_so_xe),
      ma_nhan_su: text(row.ma_nhan_su),
      nhan_vien_phu_trach: text(row.nhan_vien_phu_trach),
      tong_mat_hang: numberValue(row.tong_mat_hang),
      tong_doanh_thu: numberValue(row.tong_doanh_thu),
      tong_chi_phi: numberValue(row.tong_chi_phi),
      chi_tiet_mat_hang: productLinesFromFlat(row),
      ten_mat_hang: text(row.ten_mat_hang),
      ma_san_pham: text(row.ma_san_pham),
      sl_cuon_cach_nhiet: numberValue(row.sl_cuon_cach_nhiet),
      doanh_thu_cach_nhiet: numberValue(row.doanh_thu_cach_nhiet),
      so_luong_bao_bi: numberValue(row.so_luong_bao_bi),
      doanh_thu_bao_bi: numberValue(row.doanh_thu_bao_bi),
      so_luong_tui_tam_gia_cong: numberValue(row.so_luong_tui_tam_gia_cong),
      doanh_thu_tui_tam_gia_cong: numberValue(row.doanh_thu_tui_tam_gia_cong),
      so_luong_tui_niem_phong: numberValue(row.so_luong_tui_niem_phong),
      doanh_thu_tui_niem_phong: numberValue(row.doanh_thu_tui_niem_phong),
      so_luong_tui_cao_cap_chong_soc: numberValue(row.so_luong_tui_cao_cap_chong_soc),
      thanh_tien_tui_cao_cap_chong_soc: numberValue(row.thanh_tien_tui_cao_cap_chong_soc),
      ds_poly: numberValue(row.ds_poly),
      thuong_chuyen_giao_hang: numberValue(row.thuong_chuyen_giao_hang),
      cong_lai_xe_theo_km: numberValue(row.cong_lai_xe_theo_km),
      thuong_km_di: numberValue(row.thuong_km_di),
      chi_so_km_truoc: numberValue(row.chi_so_km_truoc),
      chi_so_km_ve: numberValue(row.chi_so_km_ve),
      so_km_thuc_te: numberValue(row.so_km_thuc_te),
      so_lenh: numberValue(row.so_lenh),
      so_chuyen: numberValue(row.so_chuyen),
      ten_lx1: text(row.ten_lx1),
      cong_lx1: numberValue(row.cong_lx1),
      luong_lx1: numberValue(row.luong_lx1),
      tien_an_lx1: numberValue(row.tien_an_lx1),
      tien_ds_lx1: numberValue(row.tien_ds_lx1),
      tien_thuong_chuyen_lx1: numberValue(row.tien_thuong_chuyen_lx1),
      tien_luat_lx1: numberValue(row.tien_luat_lx1),
      ghi_chu: text(row.ghi_chu)
    }));
}

function emptyVehicleLogForm(): Omit<VehicleLog, 'id'> {
  return {
    ngay_gio: localDateTimeValue(),
    ca: '',
    xe_id: '',
    bien_so_xe: '',
    ma_nhan_su: '',
    nhan_vien_phu_trach: '',
    tong_mat_hang: 0,
    tong_doanh_thu: 0,
    tong_chi_phi: 0,
    chi_tiet_mat_hang: [],
    ten_mat_hang: '',
    ma_san_pham: '',
    sl_cuon_cach_nhiet: 0,
    doanh_thu_cach_nhiet: 0,
    so_luong_bao_bi: 0,
    doanh_thu_bao_bi: 0,
    so_luong_tui_tam_gia_cong: 0,
    doanh_thu_tui_tam_gia_cong: 0,
    so_luong_tui_niem_phong: 0,
    doanh_thu_tui_niem_phong: 0,
    so_luong_tui_cao_cap_chong_soc: 0,
    thanh_tien_tui_cao_cap_chong_soc: 0,
    ds_poly: 0,
    thuong_chuyen_giao_hang: 0,
    cong_lai_xe_theo_km: 0,
    thuong_km_di: 0,
    chi_so_km_truoc: 0,
    chi_so_km_ve: 0,
    so_km_thuc_te: 0,
    so_lenh: 0,
    so_chuyen: 0,
    ten_lx1: '',
    cong_lx1: 0,
    luong_lx1: 0,
    tien_an_lx1: 0,
    tien_ds_lx1: 0,
    tien_thuong_chuyen_lx1: 0,
    tien_luat_lx1: 0,
    ghi_chu: ''
  };
}

function normalizeKmLogs(data: unknown): VehicleKmLog[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: unknown[] }).rows
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      ten_lai_xe: text(row.ten_lai_xe),
      ma_nhan_su: text(row.ma_nhan_su),
      xe_id: text(row.xe_id),
      bien_so_xe: text(row.bien_so_xe),
      ngay_gio_di: text(row.ngay_gio_di),
      ngay_gio_ve: text(row.ngay_gio_ve),
      loai_km: text(row.loai_km),
      so_km_di: numberValue(row.so_km_di),
      so_km_ve: numberValue(row.so_km_ve),
      tong_km: numberValue(row.tong_km),
      anh_url: text(row.anh_url),
      anh_public_id: text(row.anh_public_id),
      ghi_chu: text(row.ghi_chu)
    }));
}

function emptyVehicleKmLogForm(): Omit<VehicleKmLog, 'id'> {
  return {
    ten_lai_xe: '',
    ma_nhan_su: '',
    xe_id: '',
    bien_so_xe: '',
    ngay_gio_di: localDateTimeValue(),
    ngay_gio_ve: '',
    loai_km: KM_TYPES[0],
    so_km_di: 0,
    so_km_ve: 0,
    tong_km: 0,
    anh_url: '',
    anh_public_id: '',
    ghi_chu: ''
  };
}

function ActionButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
        danger
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function ViewHeader({
  title,
  subtitle,
  count,
  buttonLabel,
  onAdd,
  showAdd = true
}: {
  title: string;
  subtitle: string;
  count: number;
  buttonLabel: string;
  onAdd: () => void;
  showAdd?: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{subtitle} · {count} dòng</p>
      </div>
      {showAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </button>
      ) : null}
    </section>
  );
}

function OperationModal({
  title,
  subtitle,
  onClose,
  onSave,
  isSaving,
  wide = false,
  children
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
      <div className={`flex h-[96dvh] max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:rounded-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="min-w-0 pr-2">
            <h3 className="truncate text-sm font-black uppercase tracking-wide text-slate-900">{title}</h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">
            Huỷ
          </button>
          <button type="button" onClick={onSave} disabled={isSaving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10';

/** Ô nhập tiền: hiển thị dấu chấm phân cách hàng nghìn, lưu về number */
function MoneyInput({
  value,
  onChange,
  className = ''
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ? new Intl.NumberFormat('vi-VN').format(value) : ''}
      onChange={event => {
        const digits = event.target.value.replace(/\D/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
      placeholder="0"
      className={`${inputClass} text-right ${className}`}
    />
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ProductNameCombobox({
  products,
  code,
  name,
  onChange
}: {
  products: ProductOption[];
  code: string;
  name: string;
  onChange: (next: { code: string; name: string }) => void;
}) {
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(name);
  }, [name, code]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products.slice(0, 80);
    return products
      .filter(product =>
        `${product.code} ${product.name}`.toLowerCase().includes(keyword)
      )
      .slice(0, 80);
  }, [products, query]);

  const selectProduct = (product: ProductOption) => {
    onChange({ code: product.code, name: product.name });
    setQuery(product.name);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={event => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            const matched = products.find(
              product =>
                product.name.toLowerCase() === next.trim().toLowerCase() ||
                `${product.code} · ${product.name}`.toLowerCase() === next.trim().toLowerCase()
            );
            if (matched) {
              onChange({ code: matched.code, name: matched.name });
            } else {
              onChange({ code: '', name: next });
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && filtered[0]) {
              event.preventDefault();
              selectProduct(filtered[0]);
            }
          }}
          className={`${inputClass} pr-9`}
          placeholder="Gõ để tìm sản phẩm..."
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen(prev => !prev)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
          aria-label="Mở danh sách sản phẩm"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs font-semibold text-slate-400">Không tìm thấy sản phẩm.</p>
          ) : (
            filtered.map(product => (
              <button
                key={`${product.code}-${product.name}`}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => selectProduct(product)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-brand-50 ${
                  product.code === code && product.name === name ? 'bg-brand-50' : ''
                }`}
              >
                <span className="text-sm font-bold text-slate-800">{product.name}</span>
                {product.code && <span className="font-mono text-[10px] font-semibold text-slate-400">{product.code}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const DELIVERY_REQUEST_STATUS_OPTIONS = ['Chờ xuất hàng', 'Đang giao', 'Hoàn thành', 'Đã hủy'];

function deliveryRequestStatusColor(status: string): 'amber' | 'sky' | 'emerald' | 'rose' | 'zinc' {
  if (status === 'Hoàn thành') return 'emerald';
  if (status === 'Đang giao') return 'sky';
  if (status === 'Đã hủy') return 'rose';
  if (status === 'Chờ xuất hàng') return 'amber';
  return 'zinc';
}

export function VehicleDeliveryRequestsView({
  vehicles,
  staff
}: {
  vehicles: VehicleOption[];
  staff: StaffOption[];
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [rows, setRows] = useState<VehicleDeliveryRequest[]>([]);
  const [shippingOrders, setShippingOrders] = useState<BusinessShippingOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<VehicleDeliveryRequest | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState<string[]>([]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [requestData, shippingData] = await Promise.all([
        readJson(await fetch('/api/yeu-cau-xuat-hang-xe')),
        readJson(await fetch('/api/lenh-xuat-hang'))
      ]);
      const source = Array.isArray(requestData.rows) ? requestData.rows : [];
      setRows(source.map((row: Record<string, unknown>) => ({
        id: text(row.id),
        so_yeu_cau: text(row.so_yeu_cau),
        ngay_yeu_cau: text(row.ngay_yeu_cau),
        dia_diem_giao: text(row.dia_diem_giao),
        hang_hoa: text(row.hang_hoa),
        so_luong: numberValue(row.so_luong),
        don_vi: text(row.don_vi),
        xe_id: text(row.xe_id),
        bien_so_xe: text(row.bien_so_xe),
        ma_nhan_su: text(row.ma_nhan_su),
        ten_tai_xe: text(row.ten_tai_xe),
        trang_thai: text(row.trang_thai) || 'Chờ xuất hàng',
        ghi_chu: text(row.ghi_chu),
        ten_khach_hang: text(row.ten_khach_hang),
        thu_tu_giao: numberValue(row.thu_tu_giao)
      })));
      const shippingSource = Array.isArray(shippingData.orders) ? shippingData.orders : [];
      setShippingOrders(
        shippingSource.map((row: Record<string, unknown>) => ({
          id: text(row.id),
          ma_lenh: text(row.ma_lenh),
          ngay_xuat: text(row.ngay_xuat).slice(0, 10),
          dia_chi_giao: text(row.dia_chi_giao),
          ten_khach_hang: text(row.ten_khach_hang),
          ghi_chu: text(row.ghi_chu),
          chi_tiet: Array.isArray(row.chi_tiet)
            ? row.chi_tiet.map((line: unknown) => {
                const item = line && typeof line === 'object' ? (line as Record<string, unknown>) : {};
                return {
                  ma_sp: text(item.ma_sp),
                  ten_sp: text(item.ten_sp),
                  don_vi: text(item.don_vi),
                  so_luong: numberValue(item.so_luong)
                };
              })
            : []
        }))
      );
    } catch (loadError: any) {
      setRows([]);
      setShippingOrders([]);
      setError(loadError.message || 'Không thể tải yêu cầu xuất hàng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const vehicleFilterOptions = useMemo(() => {
    const plates = rows.map(row => row.bien_so_xe).filter((plate): plate is string => Boolean(plate));
    return [...new Set<string>(plates)].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rows]);

  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesStatus = statusFilter === 'all' || row.trang_thai === statusFilter;
      const matchesVehicle = vehicleFilter.length === 0 || vehicleFilter.includes(row.bien_so_xe);
      const matchesSearch =
        !normalizedSearch ||
        `${row.so_yeu_cau} ${row.dia_diem_giao} ${row.hang_hoa} ${row.bien_so_xe} ${row.ten_tai_xe} ${row.trang_thai}`
          .toLocaleLowerCase('vi').includes(normalizedSearch);
      return matchesStatus && matchesVehicle && matchesSearch;
    });
  }, [rows, normalizedSearch, statusFilter, vehicleFilter]);

  const hasActiveFilters = statusFilter !== 'all' || vehicleFilter.length > 0 || Boolean(search);
  const resetFilters = () => {
    setStatusFilter('all');
    setVehicleFilter([]);
    setSearch('');
  };

  const deleteRow = async (row: VehicleDeliveryRequest) => {
    if (!window.confirm(`Xóa yêu cầu "${row.so_yeu_cau}"?`)) return;
    try {
      await readJson(await fetch(`/api/yeu-cau-xuat-hang-xe/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa yêu cầu xuất hàng.');
    }
  };

  return (
    <>
      <ViewHeader title="Yêu cầu xuất hàng" subtitle="Điều phối giao hàng theo xe và lái xe" count={filteredRows.length} buttonLabel="Thêm yêu cầu" showAdd={canCreate} onAdd={() => setEditing(null)} />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}

      <TableToolbar isLoading={isLoading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
        <TableSearchInput value={search} onChange={setSearch} placeholder="Tìm số yêu cầu, nơi giao, hàng hóa, BSX..." disabled={isLoading} />
        <FilterCombobox
          label="Trạng thái"
          options={DELIVERY_REQUEST_STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
          searchPlaceholder="Tìm trạng thái..."
          compact
        />
        <MultiSelectFilter
          label="BSX"
          allLabel="Tất cả xe"
          searchPlaceholder="Tìm biển số xe..."
          emptyLabel="Không tìm thấy xe"
          options={vehicleFilterOptions}
          values={vehicleFilter}
          onChange={setVehicleFilter}
        />
      </TableToolbar>

      <TableShell minWidthClassName="min-w-[1120px]">
        <TableHead>
          <TableHeadCell>STT</TableHeadCell>
          <TableHeadCell>Số yêu cầu</TableHeadCell>
          <TableHeadCell>Ngày</TableHeadCell>
          <TableHeadCell>Khách hàng</TableHeadCell>
          <TableHeadCell>Địa điểm giao</TableHeadCell>
          <TableHeadCell>Hàng hóa</TableHeadCell>
          <TableHeadCell align="center">Số lượng</TableHeadCell>
          <TableHeadCell>BSX</TableHeadCell>
          <TableHeadCell>Lái xe</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredRows.map(row => (
            <React.Fragment key={row.id}>
              <TableRow>
                <td className="px-3 py-2.5 font-black text-slate-500">{row.thu_tu_giao > 0 ? row.thu_tu_giao : '—'}</td>
                <td className="px-3 py-2.5 font-black text-brand-700">{row.so_yeu_cau}</td>
                <td className="px-3 py-2.5">{row.ngay_yeu_cau}</td>
                <td className="px-3 py-2.5 font-semibold">{row.ten_khach_hang || '—'}</td>
                <td className="px-3 py-2.5 font-semibold">{row.dia_diem_giao}</td>
                <td className="px-3 py-2.5">{row.hang_hoa}</td>
                <td className="px-3 py-2.5 text-right font-black">{row.so_luong} {row.don_vi}</td>
                <td className="px-3 py-2.5 font-mono font-black">{row.bien_so_xe || '—'}</td>
                <td className="px-3 py-2.5">{row.ten_tai_xe || '—'}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge label={row.trang_thai} color={deliveryRequestStatusColor(row.trang_thai)} />
                </td>
                <td className="px-3 py-2.5 text-center"><RowActionsMenu label={`Thao tác ${row.so_yeu_cau}`}><div className="flex justify-center gap-1">{canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}{canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}</div></RowActionsMenu></td>
              </TableRow>
            </React.Fragment>
          ))}
          {!isLoading && filteredRows.length === 0 && (
            <TableEmptyRow colSpan={11}>Chưa có yêu cầu xuất hàng.</TableEmptyRow>
          )}
        </TableBody>
      </TableShell>

      {editing !== undefined && (
        <DeliveryRequestModal
          initial={editing || undefined}
          vehicles={vehicles}
          staff={staff}
          shippingOrders={shippingOrders}
          onClose={() => setEditing(undefined)}
          onSaved={async () => { setEditing(undefined); await loadRows(); }}
        />
      )}
    </>
  );
}

function DeliveryRequestModal({
  initial, vehicles, staff, shippingOrders, onClose, onSaved
}: {
  initial?: VehicleDeliveryRequest;
  vehicles: VehicleOption[];
  staff: StaffOption[];
  shippingOrders: BusinessShippingOrder[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [selectedShippingOrderId, setSelectedShippingOrderId] = useState('');
  const [form, setForm] = useState<Omit<VehicleDeliveryRequest, 'id'>>(() => ({
    so_yeu_cau: initial?.so_yeu_cau || `YCXH-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
    ngay_yeu_cau: initial?.ngay_yeu_cau || new Date().toISOString().slice(0, 10),
    dia_diem_giao: initial?.dia_diem_giao || '',
    hang_hoa: initial?.hang_hoa || '',
    so_luong: initial?.so_luong || 0,
    don_vi: initial?.don_vi || '',
    xe_id: initial?.xe_id || '',
    bien_so_xe: initial?.bien_so_xe || '',
    ma_nhan_su: initial?.ma_nhan_su || '',
    ten_tai_xe: initial?.ten_tai_xe || '',
    trang_thai: initial?.trang_thai || 'Chờ xuất hàng',
    ghi_chu: initial?.ghi_chu || '',
    ten_khach_hang: initial?.ten_khach_hang || '',
    thu_tu_giao: initial?.thu_tu_giao || 0
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const shippingOrderOptions = useMemo(
    () =>
      shippingOrders.filter(order => order.ngay_xuat === form.ngay_yeu_cau),
    [form.ngay_yeu_cau, shippingOrders]
  );

  const applyBusinessShippingOrder = (orderId: string) => {
    setSelectedShippingOrderId(orderId);
    const order = shippingOrders.find(item => item.id === orderId);
    if (!order) return;
    const totalQuantity = order.chi_tiet.reduce((sum, line) => sum + (line.so_luong || 0), 0);
    const firstUnit = order.chi_tiet.find(line => line.don_vi)?.don_vi || '';
    const goodsSummary = order.chi_tiet
      .map(line => line.ten_sp || line.ma_sp)
      .filter(Boolean)
      .join(', ');
    setForm(prev => ({
      ...prev,
      so_yeu_cau: order.ma_lenh || prev.so_yeu_cau,
      ngay_yeu_cau: order.ngay_xuat || prev.ngay_yeu_cau,
      dia_diem_giao: order.dia_chi_giao || prev.dia_diem_giao,
      hang_hoa: goodsSummary || order.ten_khach_hang || prev.hang_hoa,
      so_luong: totalQuantity > 0 ? totalQuantity : prev.so_luong,
      don_vi: firstUnit || prev.don_vi,
      ghi_chu: order.ghi_chu || prev.ghi_chu,
      ten_khach_hang: order.ten_khach_hang || prev.ten_khach_hang
    }));
  };

  const save = async () => {
    setIsSaving(true); setError('');
    try {
      const endpoint = initial ? `/api/yeu-cau-xuat-hang-xe/${encodeURIComponent(initial.id)}` : '/api/yeu-cau-xuat-hang-xe';
      await readJson(await fetch(endpoint, { method: initial ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu yêu cầu xuất hàng.');
    } finally { setIsSaving(false); }
  };
  return (
    <OperationModal title={initial ? 'Sửa yêu cầu xuất hàng' : 'Thêm yêu cầu xuất hàng'} subtitle="Thông tin giao hàng, xe và lái xe phụ trách" onClose={onClose} onSave={() => void save()} isSaving={isSaving}>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {!initial ? (
          <>
            <Field label="Ngày lấy từ kinh doanh">
              <input type="date" value={form.ngay_yeu_cau} onChange={e => setForm(p => ({ ...p, ngay_yeu_cau: e.target.value }))} className={inputClass} />
            </Field>
            <Field label="Lệnh xuất hàng (kinh doanh)">
              <select value={selectedShippingOrderId} onChange={e => applyBusinessShippingOrder(e.target.value)} className={inputClass}>
                <option value="">Chọn lệnh xuất hàng theo ngày</option>
                {shippingOrderOptions.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.ma_lenh} · {order.ten_khach_hang || 'Khách hàng'} · {order.chi_tiet.length} SP
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field label="Số yêu cầu *"><input value={form.so_yeu_cau} onChange={e => setForm(p => ({ ...p, so_yeu_cau: e.target.value }))} className={inputClass} /></Field>
        <Field label="Ngày yêu cầu *"><input type="date" value={form.ngay_yeu_cau} onChange={e => setForm(p => ({ ...p, ngay_yeu_cau: e.target.value }))} className={inputClass} /></Field>
        <Field label="Địa điểm giao *"><input value={form.dia_diem_giao} onChange={e => setForm(p => ({ ...p, dia_diem_giao: e.target.value }))} className={inputClass} /></Field>
        <Field label="Hàng hóa *"><input value={form.hang_hoa} onChange={e => setForm(p => ({ ...p, hang_hoa: e.target.value }))} className={inputClass} /></Field>
        <Field label="Số lượng *"><input type="number" min="0" step="any" value={form.so_luong || ''} onChange={e => setForm(p => ({ ...p, so_luong: Number(e.target.value) }))} className={inputClass} /></Field>
        <Field label="Đơn vị"><input value={form.don_vi} onChange={e => setForm(p => ({ ...p, don_vi: e.target.value }))} className={inputClass} placeholder="cuộn, kg, cái..." /></Field>
        <Field label="Biển số xe"><select value={form.xe_id} onChange={e => { const v = vehicles.find(x => x.id === e.target.value); setForm(p => ({ ...p, xe_id: v?.id || '', bien_so_xe: v?.bien_so_xe || '' })); }} className={inputClass}><option value="">Chọn xe</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.bien_so_xe} · {v.loai_xe}</option>)}</select></Field>
        <Field label="Lái xe">
          <SearchableSelect
            value={`${form.ma_nhan_su}|${form.ten_tai_xe}`}
            options={staff}
            onChange={value => {
              const s = staff.find(x => `${x.code}|${x.name}` === value);
              setForm(p => ({ ...p, ma_nhan_su: s?.code || '', ten_tai_xe: s?.name || '' }));
            }}
            placeholder="Gõ để tìm lái xe"
            getValue={item => `${(item as StaffOption).code}|${(item as StaffOption).name}`}
            getLabel={item => {
              const staffItem = item as StaffOption;
              return staffItem.code ? `${staffItem.name} (${staffItem.code})` : staffItem.name;
            }}
            getSearchText={item => {
              const staffItem = item as StaffOption;
              return `${staffItem.name} ${staffItem.code}`;
            }}
            inputClassName={inputClass}
          />
        </Field>
        <Field label="Trạng thái"><select value={form.trang_thai} onChange={e => setForm(p => ({ ...p, trang_thai: e.target.value }))} className={inputClass}>{['Chờ xuất hàng', 'Đang giao', 'Hoàn thành', 'Đã hủy'].map(v => <option key={v}>{v}</option>)}</select></Field>
        <Field label="Ghi chú"><input value={form.ghi_chu} onChange={e => setForm(p => ({ ...p, ghi_chu: e.target.value }))} className={inputClass} /></Field>
      </div>
    </OperationModal>
  );
}

export function VehicleExpensesView({
  vehicles,
  staff,
  currentUser
}: {
  vehicles: VehicleOption[];
  staff: StaffOption[];
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [rows, setRows] = useState<VehicleExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [editing, setEditing] = useState<VehicleExpense | null | undefined>(undefined);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/chi-phi-xe'));
      setRows(normalizeExpenses(data));
      setWarning(text(data.warning));
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải chi phí xe.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('vi');
    return rows.filter(row => {
      const date = row.ngay_gio.slice(0, 10);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      if (vehicleFilter && row.bien_so_xe !== vehicleFilter) return false;
      if (staffFilter && row.nhan_vien_phu_trach !== staffFilter) return false;
      if (typeFilter && row.loai_chi_phi !== typeFilter) return false;
      if (
        normalizedSearch &&
        !`${row.ten_chi_phi} ${row.ghi_chu} ${row.bien_so_xe} ${row.nhan_vien_phu_trach}`
          .toLocaleLowerCase('vi')
          .includes(normalizedSearch)
      ) return false;
      return true;
    });
  }, [fromDate, rows, searchText, staffFilter, toDate, typeFilter, vehicleFilter]);
  const total = useMemo(
    () => filteredRows.reduce((sum, row) => sum + row.so_luong * row.so_tien, 0),
    [filteredRows]
  );

  const deleteRow = async (row: VehicleExpense) => {
    if (!window.confirm(`Xóa chi phí "${row.ten_chi_phi}"?`)) return;
    try {
      await readJson(await fetch(`/api/chi-phi-xe/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa chi phí xe.');
    }
  };

  return (
    <>
      <ViewHeader title="Chi phí xe" subtitle={`Tổng theo bộ lọc ${formatMoney(total)}`} count={filteredRows.length} buttonLabel="Thêm chi phí" showAdd={canCreate} onAdd={() => setEditing(null)} />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{warning}</p>}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Field label="Từ ngày"><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Đến ngày"><input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Biển số xe">
            <select value={vehicleFilter} onChange={event => setVehicleFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả xe</option>
              {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.bien_so_xe}>{vehicle.bien_so_xe}</option>)}
            </select>
          </Field>
          <Field label="Nhân viên">
            <select value={staffFilter} onChange={event => setStaffFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả nhân viên</option>
              {staff.map(person => <option key={`${person.code}-${person.name}`} value={person.name}>{person.name}</option>)}
            </select>
          </Field>
          <Field label="Loại chi phí">
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả loại</option>
              {EXPENSE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Tìm kiếm"><input value={searchText} onChange={event => setSearchText(event.target.value)} className={inputClass} placeholder="Tên chi phí, ghi chú..." /></Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setVehicleFilter('');
                setStaffFilter('');
                setTypeFilter('');
                setSearchText('');
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Xóa lọc
            </button>
            <button
              type="button"
              onClick={() => printVehicleExpenses(filteredRows, {
                fromDate,
                toDate,
                vehicle: vehicleFilter,
                staff: staffFilter
              })}
              disabled={filteredRows.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              In theo lọc
            </button>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] text-left text-xs">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-2.5 font-black">ID</th>
                <th className="px-3 py-2.5 font-black">Ngày giờ</th>
                <th className="px-3 py-2.5 font-black">Loại chi phí</th>
                <th className="px-3 py-2.5 font-black">Tên chi phí</th>
                <th className="px-3 py-2.5 font-black">BSX</th>
                <th className="px-3 py-2.5 font-black">NV phụ trách</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng</th>
                <th className="px-3 py-2.5 text-right font-black">Đơn giá</th>
                <th className="px-3 py-2.5 text-right font-black">Thành tiền</th>
                <th className="px-3 py-2.5 text-center font-black">Hóa đơn</th>
                <th className="px-3 py-2.5 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{row.id}</td>
                  <td className="px-3 py-2.5 font-semibold">{formatDateTime(row.ngay_gio)}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700">{row.loai_chi_phi}</td>
                  <td className="px-3 py-2.5 font-semibold">{row.ten_chi_phi}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-brand-700">{row.bien_so_xe}</td>
                  <td className="px-3 py-2.5">{row.nhan_vien_phu_trach || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{new Intl.NumberFormat('vi-VN').format(row.so_luong)}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{formatMoney(row.so_tien)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-rose-700">{formatMoney(row.so_luong * row.so_tien)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {row.hoa_don_url ? (
                      <a href={row.hoa_don_url} target="_blank" rel="noreferrer" className="inline-flex h-10 w-14 overflow-hidden rounded-lg border border-slate-200">
                        <img src={cloudinaryPreviewUrl(row.hoa_don_url, 160)} alt="Hóa đơn" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <RowActionsMenu label={`Thao tác chi phí ${row.id}`}>
                    <div className="flex justify-center gap-1">
                      {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                      {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredRows.map(row => (
            <article key={row.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{row.ten_chi_phi}</p>
                  <p className="mt-1 font-mono text-xs font-black text-brand-700">{row.bien_so_xe} · {formatDateTime(row.ngay_gio)}</p>
                </div>
                <RowActionsMenu label={`Thao tác chi phí ${row.id}`}>
                <div className="flex gap-1">
                  {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                  {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                </div>
                </RowActionsMenu>
              </div>
              <p className="mt-2 text-sm font-black text-rose-700">
                {new Intl.NumberFormat('vi-VN').format(row.so_luong)} × {formatMoney(row.so_tien)}
                {' = '}{formatMoney(row.so_luong * row.so_tien)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{row.loai_chi_phi} · {row.nhan_vien_phu_trach || 'Chưa phân công'}</p>
            </article>
          ))}
        </div>
        {isLoading && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Đang tải chi phí xe...</p>}
        {!isLoading && filteredRows.length === 0 && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Không có chi phí xe phù hợp bộ lọc.</p>}
      </section>
      {editing !== undefined && (
        <ExpenseModal
          initial={editing || undefined}
          vehicles={vehicles}
          staff={staff}
          currentUser={currentUser}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadRows();
          }}
        />
      )}
    </>
  );
}

function ExpenseModal({
  initial,
  vehicles,
  staff,
  currentUser,
  onClose,
  onSaved
}: {
  initial?: VehicleExpense;
  vehicles: VehicleOption[];
  staff: StaffOption[];
  currentUser?: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<Omit<VehicleExpense, 'id'>>(() => ({
    ngay_gio: localDateTimeValue(initial?.ngay_gio),
    loai_chi_phi: initial?.loai_chi_phi || EXPENSE_TYPES[0],
    ten_chi_phi: initial?.ten_chi_phi || '',
    so_luong: initial?.so_luong || 1,
    so_tien: initial?.so_tien || 0,
    xe_id: initial?.xe_id || '',
    bien_so_xe: initial?.bien_so_xe || '',
    ma_nhan_su: initial?.ma_nhan_su || '',
    nhan_vien_phu_trach: initial?.nhan_vien_phu_trach || '',
    hoa_don_url: initial?.hoa_don_url || '',
    hoa_don_public_id: initial?.hoa_don_public_id || '',
    ghi_chu: initial?.ghi_chu || ''
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [fuelOptions, setFuelOptions] = useState<FuelPriceOption[]>([]);
  const [isLoadingFuelOptions, setIsLoadingFuelOptions] = useState(false);
  const isFuelExpense = form.loai_chi_phi === EXPENSE_TYPES[0];
  const expenseDate = form.ngay_gio.slice(0, 10);
  const assignedVehicle = vehicles.find(vehicle => vehicle.id === form.xe_id);
  const assignedStaffValue = `${form.ma_nhan_su}|${form.nhan_vien_phu_trach}`;
  const assignedStaffExists = staff.some(item => `${item.code}|${item.name}` === assignedStaffValue);

  useEffect(() => {
    if (!isFuelExpense || !expenseDate) {
      setFuelOptions([]);
      return;
    }

    const controller = new AbortController();
    setIsLoadingFuelOptions(true);
    void (async () => {
      try {
        let payload: unknown;
        try {
          payload = await readJson(await fetch(
            `/api/chi-phi-xe/gia-xang?ngay=${encodeURIComponent(expenseDate)}`,
            { signal: controller.signal }
          ));
        } catch (proxyError: any) {
          if (proxyError?.name === 'AbortError') throw proxyError;
          payload = await readJson(await fetch(
            `https://giaxanghomnay.com/api/pvdate/${encodeURIComponent(expenseDate)}`,
            { signal: controller.signal }
          ));
        }
        setFuelOptions(normalizeFuelPriceOptions(payload, expenseDate));
      } catch (loadError: any) {
        if (loadError?.name === 'AbortError') return;
        setFuelOptions([]);
        setError(loadError.message || 'Không thể tải danh sách diễn giải giá xăng.');
      } finally {
        if (!controller.signal.aborted) setIsLoadingFuelOptions(false);
      }
    })();

    return () => controller.abort();
  }, [expenseDate, isFuelExpense]);

  useEffect(() => {
    if (!isFuelExpense || !form.ten_chi_phi || fuelOptions.length === 0) return;
    const selected = fuelOptions.find(option => option.title === form.ten_chi_phi);
    if (!selected || selected.price <= 0 || selected.price === form.so_tien) return;
    setForm(prev => ({ ...prev, so_tien: selected.price }));
  }, [form.so_tien, form.ten_chi_phi, fuelOptions, isFuelExpense]);

  const uploadInvoice = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Hóa đơn/biên lai phải là file ảnh.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Ảnh hóa đơn không được vượt quá 12 MB.');
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1600, quality: 0.76 });
      const uploaded = await uploadImage(dataUrl, 'xe/hoa_don');
      setForm(prev => ({
        ...prev,
        hoa_don_url: uploaded.imageUrl,
        hoa_don_public_id: uploaded.imagePublicId
      }));
    } catch (uploadError: any) {
      setError(uploadError.message || 'Không thể tải ảnh hóa đơn.');
    } finally {
      setIsUploading(false);
    }
  };

  const save = async () => {
    if (!form.ngay_gio || !form.ten_chi_phi.trim() || !form.bien_so_xe) {
      setError('Vui lòng nhập ngày giờ, tên chi phí và chọn xe.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const endpoint = initial ? `/api/chi-phi-xe/${encodeURIComponent(initial.id)}` : '/api/chi-phi-xe';
      await readJson(await fetch(endpoint, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ngay_gio: apiDateTimeValue(form.ngay_gio) })
      }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu chi phí xe.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OperationModal title={initial ? 'Sửa chi phí xe' : 'Thêm chi phí xe'} subtitle="Lưu biển số, người phụ trách và ảnh hóa đơn/biên lai" onClose={onClose} onSave={() => void save()} isSaving={isSaving || isUploading}>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ngày giờ *"><input type="datetime-local" value={form.ngay_gio} onChange={event => setForm(prev => ({ ...prev, ngay_gio: event.target.value }))} className={inputClass} /></Field>
        <Field label="Loại chi phí *">
          <select
            value={form.loai_chi_phi}
            onChange={event => {
              const loai_chi_phi = event.target.value;
              setForm(prev => ({
                ...prev,
                loai_chi_phi,
                ...(loai_chi_phi === EXPENSE_TYPES[0]
                  ? { ngay_gio: localDateTimeValue(), ten_chi_phi: '' }
                  : {})
              }));
            }}
            className={inputClass}
          >
            {EXPENSE_TYPES.map(type => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Diễn giải *">
          {isFuelExpense ? (
            <select
              value={form.ten_chi_phi}
              onChange={event => {
                const title = event.target.value;
                const selected = fuelOptions.find(option => option.title === title);
                setForm(prev => ({
                  ...prev,
                  ten_chi_phi: title,
                  so_tien: selected?.price || 0
                }));
              }}
              className={inputClass}
              disabled={isLoadingFuelOptions}
            >
              <option value="">
                {isLoadingFuelOptions ? 'Đang tải giá xăng...' : 'Chọn loại xăng dầu'}
              </option>
              {fuelOptions.map(option => (
                <option key={option.title} value={option.title}>{option.title}</option>
              ))}
            </select>
          ) : (
            <input
              value={form.ten_chi_phi}
              onChange={event => setForm(prev => ({ ...prev, ten_chi_phi: event.target.value }))}
              className={inputClass}
              placeholder="Nhập diễn giải chi phí"
            />
          )}
        </Field>
        <Field label="Số lượng *">
          <input
            type="number"
            min="0.01"
            step="any"
            value={form.so_luong}
            onChange={event => setForm(prev => ({ ...prev, so_luong: Number(event.target.value) }))}
            className={inputClass}
          />
        </Field>
        <Field label="Đơn giá"><MoneyInput value={form.so_tien} onChange={so_tien => setForm(prev => ({ ...prev, so_tien }))} /></Field>
        <Field label="Thành tiền">
          <input
            value={formatMoney(form.so_luong * form.so_tien)}
            className={`${inputClass} bg-slate-50 font-black text-rose-700`}
            readOnly
          />
        </Field>
        <Field label="Biển số xe (BSX) *">
          <select
            value={form.xe_id}
            onChange={event => {
              const vehicle = vehicles.find(item => item.id === event.target.value);
              setForm(prev => ({
                ...prev,
                xe_id: vehicle?.id || '',
                bien_so_xe: vehicle?.bien_so_xe || '',
                ma_nhan_su: vehicle?.ma_tai_xe || '',
                nhan_vien_phu_trach: vehicle?.tai_xe_phu_trach || ''
              }));
            }}
            className={inputClass}
          >
            <option value="">Chọn xe</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.bien_so_xe} · {vehicle.loai_xe}</option>)}
          </select>
        </Field>
        <Field label="Nhân viên phụ trách">
          <select
            value={assignedStaffValue}
            className={inputClass}
            disabled
          >
            <option value="|">{assignedVehicle ? 'Xe chưa phân công' : 'Chọn xe trước'}</option>
            {!assignedStaffExists && form.nhan_vien_phu_trach && (
              <option value={assignedStaffValue}>
                {form.ma_nhan_su ? `${form.ma_nhan_su} · ` : ''}{form.nhan_vien_phu_trach}
              </option>
            )}
            {staff.map(item => <option key={`${item.code}-${item.name}`} value={`${item.code}|${item.name}`}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-3">
            {form.hoa_don_url ? (
              <a href={form.hoa_don_url} target="_blank" rel="noreferrer" className="relative block h-24 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src={cloudinaryPreviewUrl(form.hoa_don_url, 400)} alt="Hóa đơn" className="h-full w-full object-cover" />
                <ExternalLink className="absolute right-1 top-1 h-4 w-4 rounded bg-white/90 p-0.5 text-slate-700" />
              </a>
            ) : (
              <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-[10px] font-black uppercase text-slate-400">Chưa có ảnh</div>
            )}
            <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              {isUploading ? 'Đang tải...' : form.hoa_don_url ? 'Đổi ảnh' : 'Chọn ảnh hóa đơn'}
              <input type="file" accept="image/*" disabled={isUploading} onChange={event => { void uploadInvoice(event.target.files?.[0]); event.currentTarget.value = ''; }} className="hidden" />
            </label>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">Ảnh được nén trước khi tải lên để giảm thời gian chờ.</p>
        </div>
        <Field label="Ghi chú" wide><textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} /></Field>
      </div>
    </OperationModal>
  );
}

export function VehicleLogsView({
  vehicles,
  staff
}: {
  vehicles: VehicleOption[];
  staff: StaffOption[];
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [rows, setRows] = useState<VehicleLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [editing, setEditing] = useState<VehicleLog | null | undefined>(undefined);
  const [searchText, setSearchText] = useState('');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/nhat-ky-xe'));
      setRows(normalizeLogs(data));
      setWarning(text(data.warning));
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải nhật ký xe.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('vi');
    if (!query) return rows;
    return rows.filter(row =>
      `${row.id} ${row.ngay_gio} ${row.ca} ${row.bien_so_xe} ${row.nhan_vien_phu_trach}`
        .toLocaleLowerCase('vi')
        .includes(query)
    );
  }, [rows, searchText]);
  const totals = useMemo(
    () => filteredRows.reduce(
      (sum, row) => ({
        items: sum.items + row.tong_mat_hang,
        revenue: sum.revenue + row.tong_doanh_thu,
        expense: sum.expense + row.tong_chi_phi
      }),
      { items: 0, revenue: 0, expense: 0 }
    ),
    [filteredRows]
  );

  const deleteRow = async (row: VehicleLog) => {
    if (!window.confirm(`Xóa nhật ký xe ${row.bien_so_xe}?`)) return;
    try {
      await readJson(await fetch(`/api/nhat-ky-xe/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa nhật ký xe.');
    }
  };

  return (
    <>
      <ViewHeader title="Nhật ký xe" subtitle={`Doanh thu ${formatMoney(totals.revenue)} · Chi phí ${formatMoney(totals.expense)}`} count={rows.length} buttonLabel="Thêm nhật ký" showAdd={canCreate} onAdd={() => setEditing(null)} />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{warning}</p>}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-2.5 font-black">ID</th>
                <th className="px-3 py-2.5 font-black">Ngày giờ</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 font-black">BSX</th>
                <th className="px-3 py-2.5 font-black">NV phụ trách</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng mặt hàng</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng doanh thu</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng chi phí</th>
                <th className="px-3 py-2.5 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{row.id}</td>
                  <td className="px-3 py-2.5 font-semibold">{formatDateTime(row.ngay_gio)}</td>
                  <td className="px-3 py-2.5 font-bold">{row.ca || '—'}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-brand-700">{row.bien_so_xe}</td>
                  <td className="px-3 py-2.5">{row.nhan_vien_phu_trach || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{new Intl.NumberFormat('vi-VN').format(row.tong_mat_hang)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-emerald-700">{formatMoney(row.tong_doanh_thu)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-rose-700">{formatMoney(row.tong_chi_phi)}</td>
                  <td className="px-3 py-2.5">
                    <RowActionsMenu label={`Thao tác nhật ký ${row.id}`}>
                    <div className="flex justify-center gap-1">
                      {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                      {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black">
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-right uppercase">Tổng</td>
                  <td className="px-3 py-3 text-right">{new Intl.NumberFormat('vi-VN').format(totals.items)}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{formatMoney(totals.revenue)}</td>
                  <td className="px-3 py-3 text-right text-rose-700">{formatMoney(totals.expense)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {isLoading && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Đang tải nhật ký xe...</p>}
        {!isLoading && rows.length === 0 && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Chưa có nhật ký xe.</p>}
      </section>
      <TableToolbar hasActiveFilters={Boolean(searchText)} onResetFilters={() => setSearchText('')} isLoading={isLoading}>
        <TableSearchInput value={searchText} onChange={setSearchText} placeholder="Tìm ID, ngày, ca, biển số, nhân viên..." />
      </TableToolbar>
      {editing !== undefined && (
        <LogModal
          initial={editing || undefined}
          vehicles={vehicles}
          staff={staff}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadRows();
          }}
        />
      )}
    </>
  );
}

function LogModal({
  initial,
  vehicles,
  staff,
  onClose,
  onSaved
}: {
  initial?: VehicleLog;
  vehicles: VehicleOption[];
  staff: StaffOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<Omit<VehicleLog, 'id'>>(() => {
    const base = emptyVehicleLogForm();
    if (!initial) return base;
    const { id: _id, ...rest } = initial;
    return {
      ...base,
      ...rest,
      ngay_gio: localDateTimeValue(initial.ngay_gio)
    };
  });
  const [activeTab, setActiveTab] = useState<LogFormTab>('doanh_thu');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await readJson(await fetch('/api/san-pham'));
        const rows = Array.isArray(data)
          ? data
          : Array.isArray((data as { products?: unknown }).products)
            ? (data as { products: unknown[] }).products
            : [];
        if (cancelled) return;
        setProducts(
          rows
            .map((row: unknown) => {
              if (!row || typeof row !== 'object') return null;
              const item = row as Record<string, unknown>;
              const name = text(item.productName ?? item.ten_sp ?? item.name);
              const code = text(item.productCode ?? item.ma_sp ?? item.code);
              if (!name && !code) return null;
              return { name: name || code, code };
            })
            .filter((item: ProductOption | null): item is ProductOption => Boolean(item))
        );
      } catch {
        if (!cancelled) setProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setNumber = (key: keyof Omit<VehicleLog, 'id'>, value: string) => {
    setForm(prev => ({ ...prev, [key]: Number(value) || 0 }));
  };

  const syncProductLines = (lines: VehicleLogProductLine[]) => {
    const flat = flattenProductLines(lines);
    setForm(prev => ({
      ...prev,
      chi_tiet_mat_hang: lines,
      ...flat
    }));
  };

  const addProductLine = () => {
    syncProductLines([...form.chi_tiet_mat_hang, createProductLine()]);
  };

  const updateProductLine = (lineId: string, patch: Partial<VehicleLogProductLine>) => {
    syncProductLines(
      form.chi_tiet_mat_hang.map(line => (line.id === lineId ? { ...line, ...patch } : line))
    );
  };

  const removeProductLine = (lineId: string) => {
    syncProductLines(form.chi_tiet_mat_hang.filter(line => line.id !== lineId));
  };

  const setKmField = (key: 'chi_so_km_truoc' | 'chi_so_km_ve', value: string) => {
    const next = Number(value) || 0;
    setForm(prev => {
      const chi_so_km_truoc = key === 'chi_so_km_truoc' ? next : prev.chi_so_km_truoc;
      const chi_so_km_ve = key === 'chi_so_km_ve' ? next : prev.chi_so_km_ve;
      return {
        ...prev,
        chi_so_km_truoc,
        chi_so_km_ve,
        so_km_thuc_te: Math.max(0, chi_so_km_ve - chi_so_km_truoc)
      };
    });
  };

  const save = async () => {
    if (!form.ngay_gio || !form.bien_so_xe) {
      setError('Vui lòng nhập ngày giờ và chọn xe.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const endpoint = initial ? `/api/nhat-ky-xe/${encodeURIComponent(initial.id)}` : '/api/nhat-ky-xe';
      await readJson(await fetch(endpoint, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ngay_gio: apiDateTimeValue(form.ngay_gio) })
      }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu nhật ký xe.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { id: LogFormTab; label: string }[] = [
    { id: 'doanh_thu', label: 'Doanh thu mặt hàng' },
    { id: 'km', label: 'Số KM thực đi' },
    { id: 'luong', label: 'Lương lái xe' }
  ];

  return (
    <OperationModal
      wide
      title={initial ? 'Sửa nhật ký xe' : 'Thêm nhật ký xe'}
      subtitle="Doanh thu mặt hàng · KM thực đi · Tổng hợp lương lái xe"
      onClose={onClose}
      onSave={() => void save()}
      isSaving={isSaving}
    >
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Ngày giờ *"><input type="datetime-local" value={form.ngay_gio} onChange={event => setForm(prev => ({ ...prev, ngay_gio: event.target.value }))} className={inputClass} /></Field>
        <Field label="Ca"><input value={form.ca} onChange={event => setForm(prev => ({ ...prev, ca: event.target.value }))} className={inputClass} placeholder="VD: Ca ngày / 12C1" /></Field>
        <Field label="Biển số xe (BSX) *">
          <select
            value={form.xe_id}
            onChange={event => {
              const vehicle = vehicles.find(item => item.id === event.target.value);
              setForm(prev => ({ ...prev, xe_id: vehicle?.id || '', bien_so_xe: vehicle?.bien_so_xe || '' }));
            }}
            className={inputClass}
          >
            <option value="">Chọn xe</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.bien_so_xe} · {vehicle.loai_xe}</option>)}
          </select>
        </Field>
        <Field label="Nhân viên phụ trách">
          <select
            value={`${form.ma_nhan_su}|${form.nhan_vien_phu_trach}`}
            onChange={event => {
              const selected = staff.find(item => `${item.code}|${item.name}` === event.target.value);
              setForm(prev => ({ ...prev, ma_nhan_su: selected?.code || '', nhan_vien_phu_trach: selected?.name || '' }));
            }}
            className={inputClass}
          >
            <option value="|">Chưa phân công</option>
            {staff.map(item => <option key={`${item.code}-${item.name}`} value={`${item.code}|${item.name}`}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-wide transition ${
              activeTab === tab.id
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'doanh_thu' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Doanh thu từng loại mặt hàng</h4>
            <button
              type="button"
              onClick={addProductLine}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-extrabold text-brand-700 hover:bg-brand-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm dòng
            </button>
          </div>

          {form.chi_tiet_mat_hang.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-xs font-semibold text-slate-500">
              Chưa có dòng mặt hàng. Bấm <span className="font-black text-brand-700">Thêm dòng</span> để nhập từng loại.
            </div>
          ) : (
            <div className="space-y-3">
              {form.chi_tiet_mat_hang.map((line, index) => (
                <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dòng {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeProductLine(line.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      title="Xóa dòng"
                      aria-label="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Loại mặt hàng">
                      <select
                        value={line.loai}
                        onChange={event => updateProductLine(line.id, { loai: event.target.value })}
                        className={inputClass}
                      >
                        <option value="">Chọn loại</option>
                        {PRODUCT_LINE_TYPES.map(type => (
                          <option key={type.id} value={type.id}>{type.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tên mặt hàng">
                      <ProductNameCombobox
                        products={products}
                        code={line.ma_san_pham}
                        name={line.ten_mat_hang}
                        onChange={({ code, name }) => updateProductLine(line.id, { ma_san_pham: code, ten_mat_hang: name })}
                      />
                    </Field>
                    <Field label="Số lượng">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={line.so_luong}
                        onChange={event => updateProductLine(line.id, { so_luong: Number(event.target.value) || 0 })}
                        className={`${inputClass} text-right`}
                      />
                    </Field>
                    <Field label="Doanh thu (VNĐ)">
                      <MoneyInput
                        value={line.doanh_thu}
                        onChange={doanh_thu => updateProductLine(line.id, { doanh_thu })}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tổng mặt hàng"><input type="number" min={0} step={1} value={form.tong_mat_hang} onChange={event => setNumber('tong_mat_hang', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Tổng doanh thu"><MoneyInput value={form.tong_doanh_thu} onChange={tong_doanh_thu => setForm(prev => ({ ...prev, tong_doanh_thu }))} /></Field>
            <Field label="Tổng chi phí"><MoneyInput value={form.tong_chi_phi} onChange={tong_chi_phi => setForm(prev => ({ ...prev, tong_chi_phi }))} /></Field>
            <Field label="Ghi chú" wide><textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} /></Field>
          </div>
        </section>
      )}

      {activeTab === 'km' && (
        <section className="space-y-3">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Dữ liệu liên quan số KM thực đi của xe</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Thưởng chuyến (Giao hàng)"><MoneyInput value={form.thuong_chuyen_giao_hang} onChange={thuong_chuyen_giao_hang => setForm(prev => ({ ...prev, thuong_chuyen_giao_hang }))} /></Field>
            <Field label="Công lái xe theo số KM"><input type="number" min={0} step={0.01} value={form.cong_lai_xe_theo_km} onChange={event => setNumber('cong_lai_xe_theo_km', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Thưởng KM đi"><MoneyInput value={form.thuong_km_di} onChange={thuong_km_di => setForm(prev => ({ ...prev, thuong_km_di }))} /></Field>
            <Field label="Chỉ số KM trước khi đi"><input type="number" min={0} step={0.1} value={form.chi_so_km_truoc} onChange={event => setKmField('chi_so_km_truoc', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Chỉ số công tơ KM khi về"><input type="number" min={0} step={0.1} value={form.chi_so_km_ve} onChange={event => setKmField('chi_so_km_ve', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Số KM đi thực tế của chuyến"><input type="number" min={0} step={0.1} value={form.so_km_thuc_te} onChange={event => setNumber('so_km_thuc_te', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Số lệnh"><input type="number" min={0} step={1} value={form.so_lenh} onChange={event => setNumber('so_lenh', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Số chuyến"><input type="number" min={0} step={1} value={form.so_chuyen} onChange={event => setNumber('so_chuyen', event.target.value)} className={`${inputClass} text-right`} /></Field>
          </div>
          <p className="text-[11px] font-semibold text-slate-400">Số KM thực tế tự tính = KM về − KM trước (vẫn có thể sửa tay).</p>
        </section>
      )}

      {activeTab === 'luong' && (
        <section className="space-y-3">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Vùng dữ liệu tổng hợp lương lái xe</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tên LX1">
              <input
                list={`lx1-staff-${initial?.id || 'new'}`}
                value={form.ten_lx1}
                onChange={event => setForm(prev => ({ ...prev, ten_lx1: event.target.value }))}
                className={inputClass}
                placeholder="Chọn hoặc nhập tên lái xe"
              />
              <datalist id={`lx1-staff-${initial?.id || 'new'}`}>
                {staff.map(item => (
                  <option key={`lx1-${item.code}-${item.name}`} value={item.name}>
                    {item.code ? `${item.code} · ` : ''}{item.name}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="Công LX1"><input type="number" min={0} step={0.01} value={form.cong_lx1} onChange={event => setNumber('cong_lx1', event.target.value)} className={`${inputClass} text-right`} /></Field>
            <Field label="Lương LX1"><MoneyInput value={form.luong_lx1} onChange={luong_lx1 => setForm(prev => ({ ...prev, luong_lx1 }))} /></Field>
            <Field label="Tiền ăn LX1"><MoneyInput value={form.tien_an_lx1} onChange={tien_an_lx1 => setForm(prev => ({ ...prev, tien_an_lx1 }))} /></Field>
            <Field label="Tiền DS LX1"><MoneyInput value={form.tien_ds_lx1} onChange={tien_ds_lx1 => setForm(prev => ({ ...prev, tien_ds_lx1 }))} /></Field>
            <Field label="Tiền thưởng chuyến LX1"><MoneyInput value={form.tien_thuong_chuyen_lx1} onChange={tien_thuong_chuyen_lx1 => setForm(prev => ({ ...prev, tien_thuong_chuyen_lx1 }))} /></Field>
            <Field label="Tiền luật LX1"><MoneyInput value={form.tien_luat_lx1} onChange={tien_luat_lx1 => setForm(prev => ({ ...prev, tien_luat_lx1 }))} /></Field>
          </div>
        </section>
      )}
    </OperationModal>
  );
}

export function VehicleKmLogsView({
  vehicles,
  staff
}: {
  vehicles: VehicleOption[];
  staff: StaffOption[];
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [rows, setRows] = useState<VehicleKmLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [editing, setEditing] = useState<VehicleKmLog | null | undefined>(undefined);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/nhat-ky-km-xe'));
      setRows(normalizeKmLogs(data));
      setWarning(text(data.warning));
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải nhật ký KM xe.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const date = row.ngay_gio_di.slice(0, 10);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      if (vehicleFilter && row.bien_so_xe !== vehicleFilter) return false;
      if (driverFilter && row.ten_lai_xe !== driverFilter) return false;
      if (searchText.trim()) {
        const query = searchText.trim().toLocaleLowerCase('vi');
        if (!`${row.ten_lai_xe} ${row.bien_so_xe} ${row.loai_km} ${row.ghi_chu}`.toLocaleLowerCase('vi').includes(query)) return false;
      }
      return true;
    });
  }, [driverFilter, fromDate, rows, searchText, toDate, vehicleFilter]);

  const totalKm = useMemo(() => filteredRows.reduce((sum, row) => sum + row.tong_km, 0), [filteredRows]);

  const deleteRow = async (row: VehicleKmLog) => {
    if (!window.confirm(`Xóa nhật ký KM của ${row.ten_lai_xe || row.bien_so_xe}?`)) return;
    try {
      await readJson(await fetch(`/api/nhat-ky-km-xe/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa nhật ký KM xe.');
    }
  };

  return (
    <>
      <ViewHeader title="Nhật ký KM xe" subtitle={`Tổng KM theo bộ lọc ${formatNumber(totalKm)} km`} count={filteredRows.length} buttonLabel="Thêm nhật ký KM" showAdd={canCreate} onAdd={() => setEditing(null)} />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{warning}</p>}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Field label="Từ ngày"><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Đến ngày"><input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Biển số xe">
            <select value={vehicleFilter} onChange={event => setVehicleFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả xe</option>
              {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.bien_so_xe}>{vehicle.bien_so_xe}</option>)}
            </select>
          </Field>
          <Field label="Lái xe">
            <select value={driverFilter} onChange={event => setDriverFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả lái xe</option>
              {staff.map(person => <option key={`${person.code}-${person.name}`} value={person.name}>{person.name}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setVehicleFilter('');
                setDriverFilter('');
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Xóa lọc
            </button>
            <button
              type="button"
              onClick={() => printVehicleKmLogs(filteredRows, {
                fromDate,
                toDate,
                vehicle: vehicleFilter,
                driver: driverFilter
              })}
              disabled={filteredRows.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              In theo lọc
            </button>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-xs">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-2.5 font-black">Lái xe</th>
                <th className="px-3 py-2.5 font-black">BSX</th>
                <th className="px-3 py-2.5 font-black">Loại KM</th>
                <th className="px-3 py-2.5 font-black">Ngày giờ đi</th>
                <th className="px-3 py-2.5 font-black">Ngày giờ về</th>
                <th className="px-3 py-2.5 text-right font-black">Số KM đi</th>
                <th className="px-3 py-2.5 text-right font-black">Số KM về</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng KM</th>
                <th className="px-3 py-2.5 font-black">Ảnh</th>
                <th className="px-3 py-2.5 font-black">Ghi chú</th>
                <th className="px-3 py-2.5 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-bold text-slate-800">{row.ten_lai_xe || '—'}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-brand-700">{row.bien_so_xe || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{row.loai_km || '—'}</td>
                  <td className="px-3 py-2.5">{formatDateTime(row.ngay_gio_di)}</td>
                  <td className="px-3 py-2.5">{row.ngay_gio_ve ? formatDateTime(row.ngay_gio_ve) : '—'}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(row.so_km_di)}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(row.so_km_ve)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-emerald-700">{formatNumber(row.tong_km)}</td>
                  <td className="px-3 py-2.5">
                    {row.anh_url ? (
                      <a href={row.anh_url} target="_blank" rel="noreferrer" className="inline-flex h-10 w-14 overflow-hidden rounded-lg border border-slate-200">
                        <img src={cloudinaryPreviewUrl(row.anh_url, 160)} alt="Ảnh KM" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-500" title={row.ghi_chu}>{row.ghi_chu || '—'}</td>
                  <td className="px-3 py-2.5">
                    <RowActionsMenu label={`Thao tác km ${row.id}`}>
                    <div className="flex justify-center gap-1">
                      {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                      {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black">
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-right uppercase">Tổng</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{formatNumber(totalKm)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {isLoading && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Đang tải nhật ký KM xe...</p>}
        {!isLoading && filteredRows.length === 0 && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Không có nhật ký KM phù hợp bộ lọc.</p>}
      </section>
      <TableToolbar hasActiveFilters={Boolean(searchText)} onResetFilters={() => setSearchText('')} isLoading={isLoading}>
        <TableSearchInput value={searchText} onChange={setSearchText} placeholder="Tìm lái xe, biển số, loại KM, ghi chú..." />
      </TableToolbar>
      {editing !== undefined && (
        <KmLogModal
          initial={editing || undefined}
          vehicles={vehicles}
          staff={staff}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadRows();
          }}
        />
      )}
    </>
  );
}

function KmLogModal({
  initial,
  vehicles,
  staff,
  onClose,
  onSaved
}: {
  initial?: VehicleKmLog;
  vehicles: VehicleOption[];
  staff: StaffOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<Omit<VehicleKmLog, 'id'>>(() => {
    const base = emptyVehicleKmLogForm();
    if (!initial) return base;
    const { id: _id, ...rest } = initial;
    return {
      ...base,
      ...rest,
      loai_km: initial.loai_km || KM_TYPES[0],
      ngay_gio_di: localDateTimeValue(initial.ngay_gio_di),
      ngay_gio_ve: initial.ngay_gio_ve ? localDateTimeValue(initial.ngay_gio_ve) : ''
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const setKmField = (key: 'so_km_di' | 'so_km_ve', value: string) => {
    const next = Number(value) || 0;
    setForm(prev => {
      const so_km_di = key === 'so_km_di' ? next : prev.so_km_di;
      const so_km_ve = key === 'so_km_ve' ? next : prev.so_km_ve;
      return {
        ...prev,
        so_km_di,
        so_km_ve,
        tong_km: Math.max(0, so_km_ve - so_km_di)
      };
    });
  };

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Ảnh nhật ký KM phải là file ảnh.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Ảnh không được vượt quá 12 MB.');
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1600, quality: 0.76 });
      const uploaded = await uploadImage(dataUrl, 'xe/nhat_ky_km');
      setForm(prev => ({
        ...prev,
        anh_url: uploaded.imageUrl,
        anh_public_id: uploaded.imagePublicId
      }));
    } catch (uploadError: any) {
      setError(uploadError.message || 'Không thể tải ảnh nhật ký KM.');
    } finally {
      setIsUploading(false);
    }
  };

  const save = async () => {
    if (!form.ten_lai_xe.trim() || !form.bien_so_xe || !form.ngay_gio_di) {
      setError('Vui lòng chọn lái xe, biển số xe và ngày giờ đi.');
      return;
    }
    if (!form.loai_km.trim()) {
      setError('Vui lòng chọn loại KM.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const endpoint = initial ? `/api/nhat-ky-km-xe/${encodeURIComponent(initial.id)}` : '/api/nhat-ky-km-xe';
      await readJson(await fetch(endpoint, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ngay_gio_di: apiDateTimeValue(form.ngay_gio_di),
          ngay_gio_ve: form.ngay_gio_ve ? apiDateTimeValue(form.ngay_gio_ve) : ''
        })
      }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu nhật ký KM xe.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OperationModal title={initial ? 'Sửa nhật ký KM xe' : 'Thêm nhật ký KM xe'} subtitle="Chọn loại KM, nhập số KM đi/về và chụp ảnh xác nhận" onClose={onClose} onSave={() => void save()} isSaving={isSaving}>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên lái xe *">
          <select
            value={`${form.ma_nhan_su}|${form.ten_lai_xe}`}
            onChange={event => {
              const selected = staff.find(item => `${item.code}|${item.name}` === event.target.value);
              setForm(prev => ({ ...prev, ma_nhan_su: selected?.code || '', ten_lai_xe: selected?.name || '' }));
            }}
            className={inputClass}
          >
            <option value="|">Chọn lái xe</option>
            {staff.map(item => <option key={`${item.code}-${item.name}`} value={`${item.code}|${item.name}`}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}
          </select>
        </Field>
        <Field label="Biển số xe (BSX) *">
          <select
            value={form.xe_id}
            onChange={event => {
              const vehicle = vehicles.find(item => item.id === event.target.value);
              setForm(prev => ({ ...prev, xe_id: vehicle?.id || '', bien_so_xe: vehicle?.bien_so_xe || '' }));
            }}
            className={inputClass}
          >
            <option value="">Chọn xe</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.bien_so_xe} · {vehicle.loai_xe}</option>)}
          </select>
        </Field>
        <Field label="Ngày giờ đi *"><input type="datetime-local" value={form.ngay_gio_di} onChange={event => setForm(prev => ({ ...prev, ngay_gio_di: event.target.value }))} className={inputClass} /></Field>
        <Field label="Ngày giờ về"><input type="datetime-local" value={form.ngay_gio_ve} onChange={event => setForm(prev => ({ ...prev, ngay_gio_ve: event.target.value }))} className={inputClass} /></Field>

        <Field label="Loại KM *" wide>
          <select
            value={form.loai_km}
            onChange={event => setForm(prev => ({ ...prev, loai_km: event.target.value }))}
            className={inputClass}
          >
            {KM_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
            {form.loai_km && !(KM_TYPES as readonly string[]).includes(form.loai_km) ? (
              <option value={form.loai_km}>{form.loai_km}</option>
            ) : null}
          </select>
        </Field>
        <Field label="Số KM đi">
          <input type="number" min={0} step={0.1} value={form.so_km_di} onChange={event => setKmField('so_km_di', event.target.value)} className={`${inputClass} text-right`} />
        </Field>
        <Field label="Số KM về">
          <input type="number" min={0} step={0.1} value={form.so_km_ve} onChange={event => setKmField('so_km_ve', event.target.value)} className={`${inputClass} text-right`} />
        </Field>
        <Field label="Tổng KM">
          <input type="number" min={0} step={0.1} value={form.tong_km} onChange={event => setForm(prev => ({ ...prev, tong_km: Number(event.target.value) || 0 }))} className={`${inputClass} text-right`} />
        </Field>
        <p className="sm:col-span-2 text-[11px] font-semibold text-slate-400">
          Tổng KM tự tính = Số KM về − Số KM đi (vẫn có thể sửa tay).
        </p>

        <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Chụp ảnh xác nhận KM</p>
          <div className="flex flex-wrap items-center gap-3">
            {form.anh_url ? (
              <a href={form.anh_url} target="_blank" rel="noreferrer" className="relative block h-28 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <img src={cloudinaryPreviewUrl(form.anh_url, 400)} alt="Ảnh KM" className="h-full w-full object-cover" />
                <ExternalLink className="absolute right-1 top-1 h-4 w-4 rounded bg-white/90 p-0.5 text-slate-700" />
              </a>
            ) : (
              <div className="flex h-28 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-[10px] font-black uppercase text-slate-400">
                Chưa có ảnh
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {isUploading ? 'Đang tải...' : form.anh_url ? 'Chụp / đổi ảnh' : 'Chụp ảnh'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={isUploading}
                  onChange={event => {
                    void uploadPhoto(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                  className="hidden"
                />
              </label>
              {form.anh_url ? (
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, anh_url: '', anh_public_id: '' }))}
                  className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700"
                >
                  Xóa ảnh
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            Trên điện thoại sẽ mở camera. Ảnh được nén trước khi tải lên.
          </p>
        </div>

        <Field label="Ghi chú" wide>
          <textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} />
        </Field>
      </div>
    </OperationModal>
  );
}

export function CustomerPaymentsView({
  vehicles,
  staff
}: {
  vehicles: VehicleOption[];
  staff: StaffOption[];
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [rows, setRows] = useState<CustomerPayment[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [editing, setEditing] = useState<CustomerPayment | null | undefined>(undefined);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [paymentData, customerData] = await Promise.all([
        readJson(await fetch('/api/thu-tien-khach-hang')),
        readJson(await fetch('/api/khach-hang'))
      ]);
      setRows(normalizeCustomerPayments(paymentData));
      setWarning(text(paymentData.warning));
      setCustomers(normalizeCustomerOptions(customerData));
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải phiếu thu tiền khách hàng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('vi');
    return rows.filter(row => {
      const date = row.ngay_thu.slice(0, 10);
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      if (customerFilter && row.ten_khach_hang !== customerFilter) return false;
      if (
        normalizedSearch &&
        !`${row.ten_khach_hang} ${row.nguoi_thu} ${row.bien_so_xe} ${row.ghi_chu}`
          .toLocaleLowerCase('vi')
          .includes(normalizedSearch)
      ) return false;
      return true;
    });
  }, [customerFilter, fromDate, rows, searchText, toDate]);

  const total = useMemo(() => filteredRows.reduce((sum, row) => sum + row.so_tien, 0), [filteredRows]);

  const deleteRow = async (row: CustomerPayment) => {
    if (!window.confirm(`Xóa phiếu thu ${formatMoney(row.so_tien)} của ${row.ten_khach_hang}?`)) return;
    try {
      await readJson(await fetch(`/api/thu-tien-khach-hang/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa phiếu thu tiền khách hàng.');
    }
  };

  return (
    <>
      <ViewHeader title="Thu tiền khách hàng" subtitle={`Tổng thu theo bộ lọc ${formatMoney(total)}`} count={filteredRows.length} buttonLabel="Thêm phiếu thu" showAdd={canCreate} onAdd={() => setEditing(null)} />
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{warning}</p>}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Field label="Từ ngày"><input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Đến ngày"><input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={inputClass} /></Field>
          <Field label="Khách hàng">
            <select value={customerFilter} onChange={event => setCustomerFilter(event.target.value)} className={inputClass}>
              <option value="">Tất cả khách hàng</option>
              {customers.map(customer => <option key={customer.code || customer.name} value={customer.name}>{customer.name}</option>)}
            </select>
          </Field>
          <Field label="Tìm kiếm"><input value={searchText} onChange={event => setSearchText(event.target.value)} className={inputClass} placeholder="Khách hàng, người thu, ghi chú..." /></Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setCustomerFilter('');
                setSearchText('');
              }}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Xóa lọc
            </button>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày thu</th>
                <th className="px-3 py-2.5 font-black">Khách hàng</th>
                <th className="px-3 py-2.5 text-right font-black">Số tiền</th>
                <th className="px-3 py-2.5 font-black">Hình thức</th>
                <th className="px-3 py-2.5 font-black">BSX</th>
                <th className="px-3 py-2.5 font-black">Người thu</th>
                <th className="px-3 py-2.5 font-black">Ảnh</th>
                <th className="px-3 py-2.5 font-black">Ghi chú</th>
                <th className="px-3 py-2.5 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-semibold">{formatDateTime(row.ngay_thu)}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-800">
                    {row.ten_khach_hang}
                    {row.ma_khach_hang && <span className="ml-1 text-[10px] text-slate-400">({row.ma_khach_hang})</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-black text-emerald-700">{formatMoney(row.so_tien)}</td>
                  <td className="px-3 py-2.5">{row.hinh_thuc}</td>
                  <td className="px-3 py-2.5 font-mono font-black text-brand-700">{row.bien_so_xe || '—'}</td>
                  <td className="px-3 py-2.5">{row.nguoi_thu || '—'}</td>
                  <td className="px-3 py-2.5">
                    {row.anh_url ? (
                      <a href={row.anh_url} target="_blank" rel="noreferrer" className="inline-flex h-10 w-14 overflow-hidden rounded-lg border border-slate-200">
                        <img src={cloudinaryPreviewUrl(row.anh_url, 160)} alt="Ảnh thu tiền" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-slate-500" title={row.ghi_chu}>{row.ghi_chu || '—'}</td>
                  <td className="px-3 py-2.5">
                    <RowActionsMenu label={`Thao tác phiếu thu ${row.id}`}>
                    <div className="flex justify-center gap-1">
                      {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                      {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-black">
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-right uppercase">Tổng</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{formatMoney(total)}</td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredRows.map(row => (
            <article key={row.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{row.ten_khach_hang}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{formatDateTime(row.ngay_thu)} · {row.hinh_thuc}</p>
                </div>
                <RowActionsMenu label={`Thao tác phiếu thu ${row.id}`}>
                <div className="flex gap-1">
                  {canEdit ? <ActionButton label="Sửa" onClick={() => setEditing(row)}><Pencil className="h-3.5 w-3.5" /></ActionButton> : null}
                  {canDelete ? <ActionButton label="Xóa" danger onClick={() => void deleteRow(row)}><Trash2 className="h-3.5 w-3.5" /></ActionButton> : null}
                </div>
                </RowActionsMenu>
              </div>
              <p className="mt-2 text-sm font-black text-emerald-700">{formatMoney(row.so_tien)}</p>
              <p className="mt-1 text-xs text-slate-500">{row.bien_so_xe || 'Không kèm xe'} · {row.nguoi_thu || 'Chưa ghi người thu'}</p>
              {row.anh_url ? (
                <a href={row.anh_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-16 w-24 overflow-hidden rounded-lg border border-slate-200">
                  <img src={cloudinaryPreviewUrl(row.anh_url, 240)} alt="Ảnh thu tiền" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
        {isLoading && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Đang tải phiếu thu tiền khách hàng...</p>}
        {!isLoading && filteredRows.length === 0 && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Không có phiếu thu phù hợp bộ lọc.</p>}
      </section>
      {editing !== undefined && (
        <CustomerPaymentModal
          initial={editing || undefined}
          vehicles={vehicles}
          staff={staff}
          customers={customers}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadRows();
          }}
          onImageSynced={() => {
            void loadRows();
          }}
        />
      )}
    </>
  );
}

function CustomerPaymentModal({
  initial,
  vehicles,
  staff,
  customers,
  onClose,
  onSaved,
  onImageSynced
}: {
  initial?: CustomerPayment;
  vehicles: VehicleOption[];
  staff: StaffOption[];
  customers: CustomerOption[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onImageSynced?: () => void;
}) {
  const [form, setForm] = useState<Omit<CustomerPayment, 'id'>>(() => {
    const base = emptyCustomerPaymentForm();
    if (!initial) return base;
    const { id: _id, ...rest } = initial;
    return { ...base, ...rest, ngay_thu: localDateTimeValue(initial.ngay_thu) };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [error, setError] = useState('');
  const pendingUploadRef = useRef<{
    token: number;
    promise: Promise<{ imageUrl: string; imagePublicId: string }>;
  } | null>(null);
  const savedIdRef = useRef<string | null>(initial?.id || null);
  const uploadTokenRef = useRef(0);

  const selectedCustomer = customers.find(customer => customer.code === form.ma_khach_hang);
  const showVietQr = form.hinh_thuc === 'Chuyển khoản';
  const vietQrUrl = useMemo(
    () =>
      showVietQr
        ? buildVietQrImageUrl(
            form.so_tien,
            form.ten_khach_hang ? `Thu ${form.ten_khach_hang}` : 'Thu tien khach hang'
          )
        : '',
    [form.so_tien, form.ten_khach_hang, showVietQr]
  );
  const previewSrc = form.anh_url
    ? isRemoteImageUrl(form.anh_url)
      ? cloudinaryPreviewUrl(form.anh_url, 400)
      : form.anh_url
    : '';

  const clearPhoto = () => {
    uploadTokenRef.current += 1;
    pendingUploadRef.current = null;
    setIsUploadingImage(false);
    setForm(prev => ({ ...prev, anh_url: '', anh_public_id: '' }));
  };

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Ảnh thu tiền phải là file ảnh.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Ảnh không được vượt quá 12 MB.');
      return;
    }

    setIsPreparingImage(true);
    setError('');
    try {
      const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1600, quality: 0.76 });
      const token = uploadTokenRef.current + 1;
      uploadTokenRef.current = token;
      setForm(prev => ({ ...prev, anh_url: dataUrl, anh_public_id: '' }));
      setIsUploadingImage(true);

      const promise = uploadImage(dataUrl, 'xe/thu_tien_khach_hang');
      pendingUploadRef.current = { token, promise };

      void promise
        .then(async uploaded => {
          if (uploadTokenRef.current !== token) return;
          setForm(prev => ({
            ...prev,
            anh_url: uploaded.imageUrl,
            anh_public_id: uploaded.imagePublicId
          }));
          const rowId = savedIdRef.current;
          if (rowId) {
            try {
              await patchCustomerPaymentImage(rowId, uploaded);
              onImageSynced?.();
            } catch {
              // Đồng bộ sau — không chặn form; lần tải lại sẽ thiếu ảnh nếu patch lỗi.
            }
          }
        })
        .catch((uploadError: any) => {
          if (uploadTokenRef.current !== token) return;
          setError(uploadError?.message || 'Không thể tải ảnh lên Cloudinary. Phiếu vẫn lưu được, thử chụp lại.');
        })
        .finally(() => {
          if (uploadTokenRef.current === token) {
            setIsUploadingImage(false);
            if (pendingUploadRef.current?.token === token) pendingUploadRef.current = null;
          }
        });
    } catch (prepareError: any) {
      setError(prepareError.message || 'Không thể xử lý ảnh thu tiền.');
    } finally {
      setIsPreparingImage(false);
    }
  };

  const save = async () => {
    if (!form.ngay_thu || !form.ten_khach_hang.trim()) {
      setError('Vui lòng nhập ngày thu và chọn khách hàng.');
      return;
    }
    if (form.so_tien <= 0) {
      setError('Số tiền thu phải lớn hơn 0.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const remoteUrl = isRemoteImageUrl(form.anh_url) ? form.anh_url : '';
      const endpoint = initial ? `/api/thu-tien-khach-hang/${encodeURIComponent(initial.id)}` : '/api/thu-tien-khach-hang';
      const data = await readJson(
        await fetch(endpoint, {
          method: initial ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            ngay_thu: apiDateTimeValue(form.ngay_thu),
            anh_url: remoteUrl,
            anh_public_id: remoteUrl ? form.anh_public_id : ''
          })
        })
      );
      const rowId = text(data?.row?.id) || initial?.id || '';
      if (rowId) savedIdRef.current = rowId;

      // Upload còn chạy → đồng bộ ảnh sau, không chờ.
      const pending = pendingUploadRef.current;
      if (rowId && pending && !remoteUrl) {
        void pending.promise
          .then(async uploaded => {
            await patchCustomerPaymentImage(rowId, uploaded);
            onImageSynced?.();
          })
          .catch(() => undefined);
      }

      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu phiếu thu tiền khách hàng.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <OperationModal title={initial ? 'Sửa phiếu thu tiền' : 'Thêm phiếu thu tiền'} subtitle="Ghi nhận thu tiền khách hàng, tự động giảm công nợ" onClose={onClose} onSave={() => void save()} isSaving={isSaving}>
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ngày thu *"><input type="datetime-local" value={form.ngay_thu} onChange={event => setForm(prev => ({ ...prev, ngay_thu: event.target.value }))} className={inputClass} /></Field>
        <Field label="Khách hàng *">
          <SearchableSelect
            value={form.ma_khach_hang}
            onChange={value => setForm(prev => ({ ...prev, ma_khach_hang: value }))}
            options={customers}
            placeholder="Gõ để tìm khách hàng..."
            getLabel={item => (item as CustomerOption).name}
            getValue={item => (item as CustomerOption).code}
            getOptionLabel={item => {
              const customer = item as CustomerOption;
              return customer.debt ? `${customer.name} · Công nợ ${formatMoney(customer.debt)}` : customer.name;
            }}
            resolveSelectedItem={(options, value) =>
              (options as CustomerOption[]).find(customer => customer.code === value) ||
              (form.ten_khach_hang ? { code: value, name: form.ten_khach_hang, debt: 0 } : null)
            }
            onSelectOption={item => {
              const customer = item as CustomerOption | null;
              setForm(prev => ({ ...prev, ma_khach_hang: customer?.code || '', ten_khach_hang: customer?.name || prev.ten_khach_hang }));
            }}
            inputClassName={inputClass}
          />
          {selectedCustomer ? (
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Công nợ hiện tại: <span className="font-black text-rose-600">{formatMoney(selectedCustomer.debt)}</span>
            </p>
          ) : null}
        </Field>
        <Field label="Số tiền thu *"><MoneyInput value={form.so_tien} onChange={so_tien => setForm(prev => ({ ...prev, so_tien }))} /></Field>
        <Field label="Hình thức thu *">
          <select value={form.hinh_thuc} onChange={event => setForm(prev => ({ ...prev, hinh_thuc: event.target.value }))} className={inputClass}>
            {PAYMENT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
          </select>
        </Field>

        {showVietQr ? (
          <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-emerald-800">VietQR · Chuyển khoản</p>
            <div className="flex flex-wrap items-start gap-4">
              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white p-2 shadow-sm">
                {vietQrUrl ? (
                  <img
                    src={vietQrUrl}
                    alt="VietQR chuyển khoản VietinBank"
                    className="h-52 w-52 object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
              </div>
              <div className="min-w-[180px] flex-1 space-y-1.5 text-xs font-semibold text-slate-700">
                <p>
                  Ngân hàng: <span className="font-black text-slate-900">{VIETQR_VIETINBANK.bankLabel}</span>
                </p>
                <p>
                  STK: <span className="font-mono font-black tracking-wide text-slate-900">{VIETQR_VIETINBANK.accountNo}</span>
                </p>
                <p>
                  Số tiền:{' '}
                  <span className="font-black text-emerald-700">
                    {form.so_tien > 0 ? formatMoney(form.so_tien) : 'Nhập số tiền để gắn vào QR'}
                  </span>
                </p>
                {form.ten_khach_hang ? (
                  <p>
                    Nội dung gợi ý: <span className="font-bold text-slate-900">Thu {form.ten_khach_hang}</span>
                  </p>
                ) : null}
                <p className="pt-1 text-[11px] font-semibold text-slate-500">
                  Quét QR bằng app ngân hàng. QR cập nhật khi đổi số tiền / khách hàng.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <Field label="Biển số xe">
          <select
            value={form.xe_id}
            onChange={event => {
              const vehicle = vehicles.find(item => item.id === event.target.value);
              setForm(prev => ({ ...prev, xe_id: vehicle?.id || '', bien_so_xe: vehicle?.bien_so_xe || '' }));
            }}
            className={inputClass}
          >
            <option value="">Không kèm xe</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.bien_so_xe} · {vehicle.loai_xe}</option>)}
          </select>
        </Field>
        <Field label="Người thu">
          <input
            list="customer-payment-collector-suggestions"
            value={form.nguoi_thu}
            onChange={event => setForm(prev => ({ ...prev, nguoi_thu: event.target.value }))}
            className={inputClass}
            placeholder="Chọn hoặc nhập người thu tiền"
            autoComplete="off"
          />
          <datalist id="customer-payment-collector-suggestions">
            {staff.map(person => <option key={`${person.code}-${person.name}`} value={person.name} />)}
          </datalist>
        </Field>

        <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Chụp ảnh</p>
          <div className="flex flex-wrap items-center gap-3">
            {previewSrc ? (
              <a
                href={isRemoteImageUrl(form.anh_url) ? form.anh_url : previewSrc}
                target="_blank"
                rel="noreferrer"
                className="relative block h-28 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <img src={previewSrc} alt="Ảnh thu tiền" className="h-full w-full object-cover" />
                {isRemoteImageUrl(form.anh_url) ? (
                  <ExternalLink className="absolute right-1 top-1 h-4 w-4 rounded bg-white/90 p-0.5 text-slate-700" />
                ) : null}
              </a>
            ) : (
              <div className="flex h-28 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-[10px] font-black uppercase text-slate-400">
                Chưa có ảnh
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                {isPreparingImage || isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {isPreparingImage ? 'Đang nén...' : isUploadingImage ? 'Đang đẩy Cloudinary...' : form.anh_url ? 'Chụp / đổi ảnh' : 'Chụp ảnh'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={isPreparingImage}
                  onChange={event => {
                    void pickPhoto(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                  className="hidden"
                />
              </label>
              {form.anh_url ? (
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="h-9 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700"
                >
                  Xóa ảnh
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            Trên điện thoại mở camera. Ảnh xem trước ngay; đẩy Cloudinary chạy nền, không chặn lưu phiếu.
          </p>
        </div>

        <Field label="Ghi chú" wide><textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} /></Field>
      </div>
    </OperationModal>
  );
}

export function VehicleDeliveryRouteView() {
  const [rows, setRows] = useState<VehicleDeliveryRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPlate, setSelectedPlate] = useState('');
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await readJson(await fetch('/api/yeu-cau-xuat-hang-xe'));
      const source = Array.isArray(data.rows) ? data.rows : [];
      const normalized = source.map((row: Record<string, unknown>) => ({
        id: text(row.id),
        so_yeu_cau: text(row.so_yeu_cau),
        ngay_yeu_cau: text(row.ngay_yeu_cau).slice(0, 10),
        dia_diem_giao: text(row.dia_diem_giao),
        hang_hoa: text(row.hang_hoa),
        so_luong: numberValue(row.so_luong),
        don_vi: text(row.don_vi),
        xe_id: text(row.xe_id),
        bien_so_xe: text(row.bien_so_xe),
        ma_nhan_su: text(row.ma_nhan_su),
        ten_tai_xe: text(row.ten_tai_xe),
        trang_thai: text(row.trang_thai) || 'Chờ xuất hàng',
        ghi_chu: text(row.ghi_chu),
        ten_khach_hang: text(row.ten_khach_hang),
        thu_tu_giao: numberValue(row.thu_tu_giao),
        vi_do: row.vi_do === null || row.vi_do === undefined ? null : numberValue(row.vi_do),
        kinh_do: row.kinh_do === null || row.kinh_do === undefined ? null : numberValue(row.kinh_do),
        km_vietmap: numberValue(row.km_vietmap),
        km_nhap_tay: row.km_nhap_tay === null || row.km_nhap_tay === undefined ? null : numberValue(row.km_nhap_tay),
        km_chot: numberValue(row.km_chot),
        km_luy_ke: numberValue(row.km_luy_ke)
      }));
      setRows(normalized);
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải yêu cầu xuất hàng để xếp tuyến.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const dateOptions = useMemo(() => {
    const dates = [...new Set(rows.map(row => row.ngay_yeu_cau).filter((value): value is string => Boolean(value)))];
    return dates.sort((a, b) => String(b).localeCompare(String(a)));
  }, [rows]);

  useEffect(() => {
    if (!selectedDate && dateOptions.length > 0) setSelectedDate(dateOptions[0]);
  }, [dateOptions, selectedDate]);

  const plateOptions = useMemo(() => {
    const plates = [
      ...new Set(
        rows
          .filter(row => !selectedDate || row.ngay_yeu_cau === selectedDate)
          .map(row => row.bien_so_xe)
          .filter((value): value is string => Boolean(value))
      )
    ];
    return plates.sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  }, [rows, selectedDate]);

  useEffect(() => {
    if (selectedPlate && !plateOptions.includes(selectedPlate)) setSelectedPlate('');
  }, [plateOptions, selectedPlate]);

  const tripStops = useMemo(() => {
    if (!selectedDate || !selectedPlate) return [];
    return rows
      .filter(row => row.ngay_yeu_cau === selectedDate && row.bien_so_xe === selectedPlate)
      .sort((a, b) => {
        const orderA = a.thu_tu_giao > 0 ? a.thu_tu_giao : Number.MAX_SAFE_INTEGER;
        const orderB = b.thu_tu_giao > 0 ? b.thu_tu_giao : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.so_yeu_cau.localeCompare(b.so_yeu_cau, 'vi');
      });
  }, [rows, selectedDate, selectedPlate]);

  useEffect(() => {
    setOrderedIds(tripStops.map(row => row.id));
    setMessage('');
  }, [tripStops]);

  const orderedStops = useMemo(() => {
    const byId = new Map(tripStops.map(row => [row.id, row]));
    return orderedIds.map(id => byId.get(id)).filter((row): row is VehicleDeliveryRequest => Boolean(row));
  }, [orderedIds, tripStops]);

  const moveStop = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderedIds.length) return;
    setOrderedIds(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = temp;
      return next;
    });
    setMessage('');
  };

  const saveOrder = async () => {
    if (orderedStops.length === 0) {
      setError('Chọn ngày và biển số xe có yêu cầu xuất hàng để xếp tuyến.');
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      await readJson(
        await fetch('/api/yeu-cau-xuat-hang-xe/thu-tu', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: orderedStops.map((row, index) => ({
              id: row.id,
              thu_tu_giao: index + 1
            }))
          })
        })
      );
      setMessage(`Đã lưu thứ tự giao ${orderedStops.length} điểm trên tuyến ${selectedPlate}.`);
      await loadRows();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu thứ tự tuyến giao hàng.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Route className="h-4 w-4 text-brand-600" />
            Tuyến giao hàng
          </h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Chọn ngày + xe từ Yêu cầu xuất hàng, rồi sắp thứ tự giao từng khách hàng.
          </p>
        </div>
        <button
          type="button"
          disabled={isSaving || orderedStops.length === 0}
          onClick={() => void saveOrder()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Lưu thứ tự tuyến
        </button>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{message}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Ngày yêu cầu">
            <select value={selectedDate} onChange={event => setSelectedDate(event.target.value)} className={inputClass}>
              <option value="">Chọn ngày</option>
              {dateOptions.map(date => (
                <option key={date} value={date}>{date}</option>
              ))}
            </select>
          </Field>
          <Field label="Biển số xe (tuyến)">
            <select value={selectedPlate} onChange={event => setSelectedPlate(event.target.value)} className={inputClass}>
              <option value="">Chọn xe đã có yêu cầu xuất hàng</option>
              {plateOptions.map(plate => (
                <option key={plate} value={plate}>{plate}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <p className="text-[11px] font-semibold text-slate-500">
              {selectedDate && selectedPlate
                ? `${orderedStops.length} điểm giao trên tuyến`
                : 'Chọn ngày và BSX để hiện danh sách khách hàng'}
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100">
          {orderedStops.map((row, index) => (
            <article key={row.id} className="flex flex-wrap items-start gap-3 p-3 sm:flex-nowrap">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-black text-brand-700">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900">
                  {row.ten_khach_hang || row.hang_hoa || 'Khách hàng'}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {row.so_yeu_cau} · {row.dia_diem_giao || 'Chưa có địa điểm'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.hang_hoa} · {row.so_luong} {row.don_vi} · {row.ten_tai_xe || 'Chưa gán lái xe'} · {row.trang_thai}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <ActionButton label="Lên trên" onClick={() => moveStop(index, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </ActionButton>
                <ActionButton label="Xuống dưới" onClick={() => moveStop(index, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </ActionButton>
              </div>
            </article>
          ))}
        </div>
        {isLoading && <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">Đang tải tuyến giao hàng...</p>}
        {!isLoading && selectedDate && selectedPlate && orderedStops.length === 0 && (
          <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">
            Ngày/xe này chưa có yêu cầu xuất hàng. Tạo ở thẻ Yêu cầu xuất hàng trước.
          </p>
        )}
        {!isLoading && (!selectedDate || !selectedPlate) && (
          <p className="px-4 py-10 text-center text-sm font-bold text-slate-400">
            Chọn ngày và biển số xe để xếp thứ tự giao hàng.
          </p>
        )}
      </section>

      <VietmapRoutePlanner
        date={selectedDate}
        plate={selectedPlate}
        sourceStops={orderedStops.map((row, index) => ({
          id: row.id,
          title: row.ten_khach_hang || row.hang_hoa || row.so_yeu_cau,
          address: row.dia_diem_giao,
          latitude: row.vi_do,
          longitude: row.kinh_do,
          apiKm: row.km_vietmap,
          manualKm: row.km_nhap_tay,
          order: row.thu_tu_giao > 0 ? row.thu_tu_giao : index + 1
        }))}
        onSaved={loadRows}
      />
    </>
  );
}

export const vehicleOperationIcons = {
  expenses: ReceiptText,
  logs: BookOpen,
  payments: HandCoins,
  route: Route
};
