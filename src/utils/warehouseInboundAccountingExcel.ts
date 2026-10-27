import * as XLSX from 'xlsx';

/** Cột Excel nhập kho kế toán (mẫu AMIS / hàng tiền). */
export const WAREHOUSE_INBOUND_ACCOUNTING_HEADERS = [
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
  'Lệnh sản xuất',
  'Khoản mục CP',
  'Đối tượng THCP',
  'Tên đối tượng'
] as const;

export type WarehouseInboundAccountingDefaults = {
  kho: string;
  tkNo: string;
  tkCo: string;
  /** Nếu > 0 thì ghi đè đơn giá mọi dòng; 0 = giữ đơn giá / thành tiền từ phiếu. */
  donGiaOverride: number;
  lenhSanXuat: string;
  khoanMucCp: string;
  doiTuongThcp: string;
  tenDoiTuong: string;
};

export const DEFAULT_WAREHOUSE_INBOUND_ACCOUNTING: WarehouseInboundAccountingDefaults = {
  kho: 'KTP',
  tkNo: '155',
  tkCo: '154',
  donGiaOverride: 0,
  lenhSanXuat: '',
  khoanMucCp: '',
  doiTuongThcp: '12NP',
  tenDoiTuong: ''
};

export type WarehouseInboundAccountingLine = {
  maHang: string;
  tenHang: string;
  dvt: string;
  soLuong: number;
  donGia: number;
  thanhTien: number;
};

export function buildWarehouseInboundAccountingRows(
  lines: WarehouseInboundAccountingLine[],
  defaults: WarehouseInboundAccountingDefaults
) {
  const override = Number.isFinite(defaults.donGiaOverride) ? defaults.donGiaOverride : 0;
  return lines.map((line, index) => {
    const qty = Number.isFinite(line.soLuong) ? line.soLuong : 0;
    const donGia = override > 0 ? override : Number.isFinite(line.donGia) ? line.donGia : 0;
    const thanhTien =
      override > 0
        ? Math.round(qty * override * 100) / 100
        : Number.isFinite(line.thanhTien)
          ? line.thanhTien
          : Math.round(qty * donGia * 100) / 100;
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
      defaults.lenhSanXuat.trim() || '',
      defaults.khoanMucCp.trim() || '',
      defaults.doiTuongThcp.trim() || '',
      defaults.tenDoiTuong.trim() || ''
    ];
  });
}

export function downloadWarehouseInboundAccountingExcel(
  lines: WarehouseInboundAccountingLine[],
  defaults: WarehouseInboundAccountingDefaults,
  fileName = 'danh-sach-nhap-kho.xlsx'
) {
  const rows = buildWarehouseInboundAccountingRows(lines, defaults);
  const worksheet = XLSX.utils.aoa_to_sheet([[...WAREHOUSE_INBOUND_ACCOUNTING_HEADERS], ...rows]);
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
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 20 }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Nhập kho');
  XLSX.writeFile(workbook, fileName);
}
