import * as XLSX from 'xlsx';

export type CustomerExcelRow = {
  code: string;
  name: string;
  address: string;
  newAddress: string;
  debt: string;
  taxCode: string;
  phone: string;
  mobilePhoneNlh: string;
  isInternal: string;
  managingUnit: string;
  note: string;
  rowNumber: number;
};

export type CustomerExcelExportRow = {
  code: string;
  name: string;
  address: string;
  newAddress: string;
  debt: number;
  taxCode: string;
  phone: string;
  mobilePhoneNlh: string;
  isInternal: boolean;
  managingUnit: string;
  note: string;
};

const CODE_HEADERS = ['ma khach hang', 'ma kh', 'ma_khach_hang', 'ma_kh', 'code'];
const NAME_HEADERS = ['ten khach hang', 'ten kh', 'ten_khach_hang', 'khach hang', 'name'];
const ADDRESS_HEADERS = ['dia chi cu', 'dia chi', 'dia_chi', 'address'];
const NEW_ADDRESS_HEADERS = ['dia chi moi', 'dia_chi_moi', 'new address'];
const DEBT_HEADERS = ['cong no', 'cong_no', 'debt'];
const TAX_CODE_HEADERS = ['ma so thue/cccd chu ho', 'ma so thue cccd chu ho', 'ma so thue', 'ma_so_thue', 'cccd', 'tax code'];
const PHONE_HEADERS = ['dien thoai', 'so dien thoai', 'so_dien_thoai', 'sdt', 'phone'];
const MOBILE_NLH_HEADERS = ['dt di dong nlh', 'di dong nlh', 'dt_di_dong_nlh', 'mobile nlh'];
const IS_INTERNAL_HEADERS = ['la doi tuong noi bo', 'la_doi_tuong_noi_bo', 'doi tuong noi bo'];
const MANAGING_UNIT_HEADERS = ['don vi quan ly', 'don_vi_quan_ly', 'managing unit'];
const NOTE_HEADERS = ['ghi chu', 'ghi_chu', 'note', 'notes'];

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function findColumn(headers: string[], aliases: string[]) {
  const exact = headers.findIndex(header => aliases.some(alias => header === alias));
  if (exact >= 0) return exact;
  return headers.findIndex(header =>
    aliases.some(alias => alias.length >= 4 && (header.includes(alias) || alias.includes(header)))
  );
}

export async function parseCustomerExcel(file: File): Promise<CustomerExcelRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  }) as unknown[][];
  if (matrix.length === 0) return [];

  const headers = matrix[0].map(normalizeHeader);
  const codeIndex = findColumn(headers, CODE_HEADERS);
  const nameIndex = findColumn(headers, NAME_HEADERS);
  if (nameIndex < 0) {
    throw new Error('Không tìm thấy cột "Tên khách hàng" trong file Excel.');
  }

  const addressIndex = findColumn(headers, ADDRESS_HEADERS);
  const newAddressIndex = findColumn(headers, NEW_ADDRESS_HEADERS);
  const debtIndex = findColumn(headers, DEBT_HEADERS);
  const taxCodeIndex = findColumn(headers, TAX_CODE_HEADERS);
  const phoneIndex = findColumn(headers, PHONE_HEADERS);
  const mobileNlhIndex = findColumn(headers, MOBILE_NLH_HEADERS);
  const isInternalIndex = findColumn(headers, IS_INTERNAL_HEADERS);
  const managingUnitIndex = findColumn(headers, MANAGING_UNIT_HEADERS);
  const noteIndex = findColumn(headers, NOTE_HEADERS);

  return matrix
    .slice(1)
    .map((row, index) => ({
      code: codeIndex >= 0 ? cellToText(row[codeIndex]) : '',
      name: cellToText(row[nameIndex]),
      address: addressIndex >= 0 ? cellToText(row[addressIndex]) : '',
      newAddress: newAddressIndex >= 0 ? cellToText(row[newAddressIndex]) : '',
      debt: debtIndex >= 0 ? cellToText(row[debtIndex]) : '',
      taxCode: taxCodeIndex >= 0 ? cellToText(row[taxCodeIndex]) : '',
      phone: phoneIndex >= 0 ? cellToText(row[phoneIndex]) : '',
      mobilePhoneNlh: mobileNlhIndex >= 0 ? cellToText(row[mobileNlhIndex]) : '',
      isInternal: isInternalIndex >= 0 ? cellToText(row[isInternalIndex]) : '',
      managingUnit: managingUnitIndex >= 0 ? cellToText(row[managingUnitIndex]) : '',
      note: noteIndex >= 0 ? cellToText(row[noteIndex]) : '',
      rowNumber: index + 2
    }))
    .filter(
      row =>
        row.code ||
        row.name ||
        row.address ||
        row.newAddress ||
        row.debt ||
        row.taxCode ||
        row.phone ||
        row.mobilePhoneNlh ||
        row.isInternal ||
        row.managingUnit ||
        row.note
    );
}

export function downloadCustomerExcelTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'Mã khách hàng',
      'Tên khách hàng',
      'Địa chỉ cũ',
      'Địa chỉ mới',
      'Công nợ',
      'Mã số thuế/CCCD chủ hộ',
      'Điện thoại',
      'ĐT di động NLH',
      'Là đối tượng nội bộ',
      'Đơn vị quản lý',
      'Ghi chú'
    ],
    [
      'KH001',
      'Công ty mẫu',
      '',
      '',
      '',
      '',
      '',
      '',
      'Không',
      '',
      ''
    ],
    ['KH002', 'Khách hàng để trống các cột còn lại', '', '', '', '', '', '', '', '', '']
  ]);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 36 },
    { wch: 40 },
    { wch: 40 },
    { wch: 16 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 36 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Khach_hang');
  XLSX.writeFile(workbook, 'mau-nhap-khach-hang.xlsx');
}

export function downloadCustomerExcel(customers: CustomerExcelExportRow[]) {
  const rows = customers.map(customer => ({
    'Mã khách hàng': customer.code,
    'Tên khách hàng': customer.name,
    'Địa chỉ cũ': customer.address,
    'Địa chỉ mới': customer.newAddress,
    'Công nợ': customer.debt,
    'Mã số thuế/CCCD chủ hộ': customer.taxCode,
    'Điện thoại': customer.phone,
    'ĐT di động NLH': customer.mobilePhoneNlh,
    'Là đối tượng nội bộ': customer.isInternal ? 'Có' : 'Không',
    'Đơn vị quản lý': customer.managingUnit,
    'Ghi chú': customer.note
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 36 },
    { wch: 40 },
    { wch: 40 },
    { wch: 16 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 20 },
    { wch: 24 },
    { wch: 36 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Khach_hang');
  XLSX.writeFile(workbook, 'danh-sach-khach-hang.xlsx');
}
