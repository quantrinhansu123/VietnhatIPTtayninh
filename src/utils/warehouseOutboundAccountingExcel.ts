import * as XLSX from 'xlsx';

/** Cột Excel xuất kho kế toán (mẫu AMIS / danh sách xuất). */
export const WAREHOUSE_OUTBOUND_ACCOUNTING_HEADERS = [
  '#',
  'Mã hàng',
  'Tên hàng',
  'Kho',
  'TK Nợ',
  'TK Có',
  'ĐVT',
  'Số lượng',
  'Đơn giá',
  'Thành tiền',
  'Đối tượng THCP',
  'Khoản mục CP'
] as const;

export type WarehouseOutboundAccountingDefaults = {
  kho: string;
  tkNo: string;
  tkCo: string;
  donGia: number;
  doiTuongThcp: string;
  khoanMucCp: string;
};

export const DEFAULT_WAREHOUSE_OUTBOUND_ACCOUNTING: WarehouseOutboundAccountingDefaults = {
  kho: 'KSX',
  tkNo: '154',
  tkCo: '152',
  donGia: 0,
  doiTuongThcp: '168B',
  khoanMucCp: 'NVLTT'
};

export type WarehouseOutboundAccountingLine = {
  maHang: string;
  tenHang: string;
  dvt: string;
  soLuong: number;
};

export function buildWarehouseOutboundAccountingRows(
  lines: WarehouseOutboundAccountingLine[],
  defaults: WarehouseOutboundAccountingDefaults
) {
  const donGia = Number.isFinite(defaults.donGia) ? defaults.donGia : 0;
  return lines.map((line, index) => {
    const qty = Number.isFinite(line.soLuong) ? line.soLuong : 0;
    const thanhTien = Math.round(qty * donGia * 100) / 100;
    return [
      index + 1,
      line.maHang,
      line.tenHang,
      defaults.kho.trim() || '',
      defaults.tkNo.trim() || '',
      defaults.tkCo.trim() || '',
      line.dvt || '',
      qty,
      donGia,
      thanhTien,
      defaults.doiTuongThcp.trim() || '',
      defaults.khoanMucCp.trim() || ''
    ];
  });
}

export function downloadWarehouseOutboundAccountingExcel(
  lines: WarehouseOutboundAccountingLine[],
  defaults: WarehouseOutboundAccountingDefaults,
  fileName = 'danh-sach-xuat-kho.xlsx'
) {
  const rows = buildWarehouseOutboundAccountingRows(lines, defaults);
  const worksheet = XLSX.utils.aoa_to_sheet([[...WAREHOUSE_OUTBOUND_ACCOUNTING_HEADERS], ...rows]);
  worksheet['!cols'] = [
    { wch: 5 },
    { wch: 16 },
    { wch: 48 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Xuất kho');
  XLSX.writeFile(workbook, fileName);
}
