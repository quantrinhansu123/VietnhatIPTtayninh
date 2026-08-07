import * as XLSX from 'xlsx';

/** Dòng Excel danh mục NVL — khớp bảng `/kho-nvl` + form + DB `kho_nvl`. */
export type MaterialCatalogExcelRow = {
  code: string;
  name: string;
  unit: string;
  totalWeight: string;
  plasticWeight: string;
  bagWeight: string;
  coreWeight: string;
  rollWidth: string;
  unitLength: string;
  openingStock: string;
  inbound: string;
  outbound: string;
  rowNumber: number;
};

/**
 * Cột khớp UI bảng + form thêm/sửa.
 * Ô trống vẫn đẩy lên (null); tạo mới cần Mã NPL + Tên.
 */
export const MATERIAL_CATALOG_EXCEL_HEADERS = [
  'Mã NPL',
  'Tên nguyên phụ liệu',
  'ĐV',
  'Tổng kg',
  'Tồn đầu',
  'Nhập',
  'Xuất',
  'Kg nhựa',
  'Kg túi',
  'Kg lõi',
  'Khổ cuộn',
  'Chiều dài ĐV'
] as const;

const HEADER_ALIASES: Record<keyof Omit<MaterialCatalogExcelRow, 'rowNumber'>, string[]> = {
  code: ['ma npl', 'ma_npl', 'ma nvl', 'ma_nvl', 'code'],
  name: ['ten nguyen phu lieu', 'ten_npl', 'ten npl', 'ten nvl', 'name'],
  unit: ['don vi', 'don_vi', 'dv', 'unit'],
  totalWeight: ['tong kg', 'tong trong luong', 'tong_trong_luong', 'tong tl', 'total weight'],
  plasticWeight: ['kg nhua', 'trong luong nhua', 'trong_luong_nhua', 'plastic weight'],
  bagWeight: ['kg tui', 'trong luong tui', 'trong_luong_tui', 'bag weight'],
  coreWeight: ['kg loi', 'trong luong loi', 'trong_luong_loi', 'core weight'],
  rollWidth: ['kho cuon', 'kho_cuon', 'roll width'],
  unitLength: ['chieu dai dv', 'chieu dai don vi', 'chieu_dai_don_vi', 'unit length'],
  openingStock: ['ton dau', 'ton_dau_ky', 'opening stock'],
  inbound: ['nhap', 'nhap trong ky', 'nhap_trong_ky', 'inbound'],
  outbound: ['xuat', 'xuat trong ky', 'xuat_trong_ky', 'outbound']
};

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[_/-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function findColumn(headers: string[], aliases: string[]) {
  const exact = headers.findIndex(header => aliases.some(alias => header === alias));
  if (exact >= 0) return exact;
  return headers.findIndex(header =>
    aliases.some(alias => alias.length >= 3 && (header.includes(alias) || alias.includes(header)))
  );
}

export async function parseMaterialCatalogExcel(file: File): Promise<MaterialCatalogExcelRow[]> {
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

  // File 2 cột cũ chỉ cập nhật Tổng kg
  const codeOnlyKg =
    headers.length <= 3 &&
    findColumn(headers, HEADER_ALIASES.code) >= 0 &&
    findColumn(headers, HEADER_ALIASES.totalWeight) >= 0 &&
    findColumn(headers, HEADER_ALIASES.name) < 0;
  if (codeOnlyKg) {
    throw new Error(
      'File này là mẫu cũ chỉ có Mã NVL + Tổng kg. Hãy dùng "Tải mẫu Excel" danh mục NVL đầy đủ, hoặc nút "Mẫu cập nhật Tổng kg".'
    );
  }

  const codeIndex = findColumn(headers, HEADER_ALIASES.code);
  if (codeIndex < 0) {
    throw new Error('Không tìm thấy cột "Mã NPL" trong file Excel.');
  }

  const indices = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>).map(key => [
      key,
      key === 'code' ? codeIndex : findColumn(headers, HEADER_ALIASES[key])
    ])
  ) as Record<keyof typeof HEADER_ALIASES, number>;

  return matrix
    .slice(1)
    .map((row, index) => {
      const get = (key: keyof typeof indices) => {
        const col = indices[key];
        return col >= 0 ? cellToText(row[col]) : '';
      };
      return {
        code: get('code'),
        name: get('name'),
        unit: get('unit'),
        totalWeight: get('totalWeight'),
        plasticWeight: get('plasticWeight'),
        bagWeight: get('bagWeight'),
        coreWeight: get('coreWeight'),
        rollWidth: get('rollWidth'),
        unitLength: get('unitLength'),
        openingStock: get('openingStock'),
        inbound: get('inbound'),
        outbound: get('outbound'),
        rowNumber: index + 2
      };
    })
    .filter(row => Boolean(row.code.trim()));
}

export function downloadMaterialCatalogExcelTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...MATERIAL_CATALOG_EXCEL_HEADERS],
    [
      'NPL-001',
      'Màng PE',
      'kg',
      '1.25',
      '100',
      '0',
      '0',
      '1.1',
      '0.1',
      '0.05',
      '',
      ''
    ],
    // Dòng gần trống — vẫn đẩy lên được khi đã có mã + tên
    ['NPL-002', 'NVL để trống các cột còn lại', '', '', '', '', '', '', '', '', '', '']
  ]);
  worksheet['!cols'] = MATERIAL_CATALOG_EXCEL_HEADERS.map(header => ({
    wch: Math.min(28, Math.max(10, header.length + 2))
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Kho_NVL');
  XLSX.writeFile(workbook, 'mau-danh-muc-kho-nvl.xlsx');
}

export function materialCatalogRowToPayload(row: MaterialCatalogExcelRow) {
  return {
    code: row.code.trim(),
    name: row.name.trim(),
    unit: row.unit.trim(),
    totalWeight: row.totalWeight.trim(),
    plasticWeight: row.plasticWeight.trim(),
    bagWeight: row.bagWeight.trim(),
    coreWeight: row.coreWeight.trim(),
    rollWidth: row.rollWidth.trim(),
    unitLength: row.unitLength.trim(),
    openingStock: row.openingStock.trim(),
    inbound: row.inbound.trim(),
    outbound: row.outbound.trim()
  };
}
