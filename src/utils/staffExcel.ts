import * as XLSX from 'xlsx';

export type StaffExcelRow = {
  code: string;
  name: string;
  branch: string;
  department: string;
  role: string;
  shift: string;
  status: string;
  username: string;
  password: string;
  rowNumber: number;
};

export type StaffExcelExportRow = {
  code: string;
  name: string;
  branch: string;
  department: string;
  role: string;
  shift: string;
  status: string;
  username: string;
};

const CODE_HEADERS = ['ma nhan su', 'ma nv', 'ma_nhan_su', 'ma_nv', 'code'];
const NAME_HEADERS = ['ho ten', 'ten nhan su', 'nhan su', 'ten', 'name'];
const BRANCH_HEADERS = ['chi nhanh', 'chi_nhanh', 'branch'];
const DEPARTMENT_HEADERS = ['phong ban', 'phong_ban', 'department'];
const ROLE_HEADERS = ['chuc vu', 'cong viec', 'vi tri', 'role', 'chuc_vu', 'cong_viec'];
const SHIFT_HEADERS = ['ca lam', 'ca', 'ca_lam', 'shift'];
const STATUS_HEADERS = ['trang thai', 'trang_thai', 'status'];
const USERNAME_HEADERS = ['ten dang nhap', 'ten_dang_nhap', 'username', 'login'];
const PASSWORD_HEADERS = ['mat khau', 'mat_khau', 'password'];

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
  return headers.findIndex(header => aliases.includes(header));
}

export async function parseStaffExcel(file: File): Promise<StaffExcelRow[]> {
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
  const nameIndex = findColumn(headers, NAME_HEADERS);
  if (nameIndex < 0) {
    throw new Error('Không tìm thấy cột "Họ tên" trong file Excel.');
  }

  const codeIndex = findColumn(headers, CODE_HEADERS);
  const branchIndex = findColumn(headers, BRANCH_HEADERS);
  const departmentIndex = findColumn(headers, DEPARTMENT_HEADERS);
  const roleIndex = findColumn(headers, ROLE_HEADERS);
  const shiftIndex = findColumn(headers, SHIFT_HEADERS);
  const statusIndex = findColumn(headers, STATUS_HEADERS);
  const usernameIndex = findColumn(headers, USERNAME_HEADERS);
  const passwordIndex = findColumn(headers, PASSWORD_HEADERS);

  return matrix
    .slice(1)
    .map((row, index) => ({
      code: codeIndex >= 0 ? cellToText(row[codeIndex]) : '',
      name: cellToText(row[nameIndex]),
      branch: branchIndex >= 0 ? cellToText(row[branchIndex]) : '',
      department: departmentIndex >= 0 ? cellToText(row[departmentIndex]) : '',
      role: roleIndex >= 0 ? cellToText(row[roleIndex]) : '',
      shift: shiftIndex >= 0 ? cellToText(row[shiftIndex]) : '',
      status: statusIndex >= 0 ? cellToText(row[statusIndex]) : '',
      username: usernameIndex >= 0 ? cellToText(row[usernameIndex]) : '',
      password: passwordIndex >= 0 ? cellToText(row[passwordIndex]) : '',
      rowNumber: index + 2
    }))
    .filter(
      row =>
        row.code ||
        row.name ||
        row.branch ||
        row.department ||
        row.role ||
        row.shift ||
        row.status ||
        row.username ||
        row.password
    );
}

export function downloadStaffExcelTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'Mã nhân sự',
      'Họ tên',
      'Chi nhánh',
      'Phòng ban',
      'Chức vụ',
      'Ca làm',
      'Trạng thái',
      'Tên đăng nhập',
      'Mật khẩu'
    ],
    [
      'NV001',
      'Nguyễn Văn A',
      'Phú Thọ',
      'Sản xuất',
      'Công nhân',
      'Ca 1',
      'Đang làm',
      'nv001',
      '123456'
    ]
  ]);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Nhan_su');
  XLSX.writeFile(workbook, 'mau-nhap-nhan-su.xlsx');
}

export function downloadStaffExcel(rows: StaffExcelExportRow[]) {
  const data = rows.map(row => ({
    'Mã nhân sự': row.code,
    'Họ tên': row.name,
    'Chi nhánh': row.branch,
    'Phòng ban': row.department,
    'Chức vụ': row.role,
    'Ca làm': row.shift,
    'Trạng thái': row.status,
    'Tên đăng nhập': row.username,
    'Mật khẩu': ''
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Nhan_su');
  XLSX.writeFile(workbook, 'danh-sach-nhan-su.xlsx');
}
