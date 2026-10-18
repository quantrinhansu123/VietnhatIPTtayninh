import * as XLSX from 'xlsx';

/**
 * Dòng Excel danh mục SP — chỉ các trường danh mục + thông số kỹ thuật.
 * Upsert theo Mã SP: có thì PATCH, chưa thì POST.
 */
export type ProductCatalogExcelRow = {
  code: string;
  name: string;
  nature: string;
  group: string;
  unit: string;
  totalWeight: string;
  rollWidth: string;
  rollLength: string;
  coreWeight: string;
  bagWeight: string;
  plasticWeight: string;
  amisCode: string;
  newCode: string;
  rowNumber: number;
};

const HEADER_ALIASES: Record<keyof Omit<ProductCatalogExcelRow, 'rowNumber'>, string[]> = {
  code: ['ma sp', 'ma_sp', 'ma san pham', 'ma hang', 'ma vat tu', 'code'],
  name: ['ten san pham', 'ten_sp', 'ten sp', 'ten hang', 'ten vat tu', 'name'],
  nature: ['tinh chat', 'tinh_chat', 'nature'],
  group: ['nhom vthh', 'nhom_vthh', 'nhom', 'group'],
  unit: ['don vi tinh', 'don_vi', 'don vi', 'unit'],
  totalWeight: ['tong tl kg', 'tong tl', 'tong trong luong', 'tong_trong_luong', 'total weight'],
  rollWidth: ['kho cuon m', 'kho cuon', 'kho_cuon', 'roll width'],
  rollLength: ['chieu dai met cuon m', 'chieu dai met cuon', 'chieu_dai_cuon', 'roll length'],
  coreWeight: ['trong luong loi kg', 'trong luong loi', 'trong_luong_loi', 'core weight'],
  bagWeight: ['trong luong tui kg', 'trong luong tui', 'trong_luong_tui', 'bag weight'],
  plasticWeight: [
    'trong luong nhua phu gia kg',
    'trong luong nhua phu gia',
    'trong luong nhua',
    'trong_luong_nhua',
    'plastic weight'
  ],
  amisCode: ['ma amis', 'ma_amis', 'amis'],
  newCode: ['ma moi', 'ma_sp_moi', 'ma sp moi']
};

/** Đúng 13 cột theo mẫu Kho thành phẩm. */
export const PRODUCT_CATALOG_EXCEL_HEADERS = [
  'Mã SP',
  'Tên sản phẩm',
  'Tính chất',
  'Nhóm',
  'Đơn vị',
  'Tổng TL (kg)',
  'Khổ cuộn (m)',
  'Chiều dài mét/cuộn (m)',
  'Trọng lượng lõi (kg)',
  'Trọng lượng túi (kg)',
  'Trọng lượng nhựa + phụ gia (kg)',
  'Mã AMIS',
  'Mã mới'
] as const;

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function excelCell(value: unknown) {
  const text = cellToText(value);
  return text === '-' ? '' : text;
}

/** Map 1 SP trên UI → 1 dòng Excel (đúng thứ tự PRODUCT_CATALOG_EXCEL_HEADERS). */
export function productToCatalogExcelValues(
  product: Omit<ProductCatalogExcelRow, 'rowNumber'>
): string[] {
  return [
    excelCell(product.code),
    excelCell(product.name),
    excelCell(product.nature),
    excelCell(product.group),
    excelCell(product.unit),
    excelCell(product.totalWeight),
    excelCell(product.rollWidth),
    excelCell(product.rollLength),
    excelCell(product.coreWeight),
    excelCell(product.bagWeight),
    excelCell(product.plasticWeight),
    excelCell(product.amisCode),
    excelCell(product.newCode)
  ];
}

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

/** Ưu tiên khớp đúng cả chuỗi header. */
function findColumn(headers: string[], aliases: string[]) {
  const exact = headers.findIndex(header => aliases.some(alias => header === alias));
  if (exact >= 0) return exact;
  return headers.findIndex(header =>
    aliases.some(alias => alias.length >= 4 && (header.includes(alias) || alias.includes(header)))
  );
}

export async function parseProductCatalogExcel(file: File): Promise<ProductCatalogExcelRow[]> {
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

  // File thành phần NVL cũ (Mã SP / Tên NVL / Loại…) → báo rõ dùng mẫu danh mục
  const looksLikeBom =
    headers.some(h => h.includes('ten nvl') || h.includes('ten npl')) &&
    headers.some(h => h === 'loai' || h.includes('gia tri'));
  if (looksLikeBom) {
    throw new Error(
      'File này là mẫu thành phần NVL (Tên NVL / Loại / Giá trị), không phải danh mục sản phẩm. Hãy dùng nút "Tải mẫu Excel SP".'
    );
  }

  const codeIndex = findColumn(headers, HEADER_ALIASES.code);
  if (codeIndex < 0) {
    throw new Error('Không tìm thấy cột "Mã SP" trong file Excel.');
  }

  const indices = {
    code: codeIndex,
    name: findColumn(headers, HEADER_ALIASES.name),
    nature: findColumn(headers, HEADER_ALIASES.nature),
    group: findColumn(headers, HEADER_ALIASES.group),
    unit: findColumn(headers, HEADER_ALIASES.unit),
    totalWeight: findColumn(headers, HEADER_ALIASES.totalWeight),
    rollWidth: findColumn(headers, HEADER_ALIASES.rollWidth),
    rollLength: findColumn(headers, HEADER_ALIASES.rollLength),
    coreWeight: findColumn(headers, HEADER_ALIASES.coreWeight),
    bagWeight: findColumn(headers, HEADER_ALIASES.bagWeight),
    plasticWeight: findColumn(headers, HEADER_ALIASES.plasticWeight),
    amisCode: findColumn(headers, HEADER_ALIASES.amisCode),
    newCode: findColumn(headers, HEADER_ALIASES.newCode)
  } as const;

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
        nature: get('nature'),
        group: get('group'),
        unit: get('unit'),
        totalWeight: get('totalWeight'),
        rollWidth: get('rollWidth'),
        rollLength: get('rollLength'),
        coreWeight: get('coreWeight'),
        bagWeight: get('bagWeight'),
        plasticWeight: get('plasticWeight'),
        amisCode: get('amisCode'),
        newCode: get('newCode'),
        rowNumber: index + 2
      };
    })
    .filter(row => Boolean(row.code.trim()));
}

export function downloadProductCatalogExcelTemplate(
  products?: Array<Omit<ProductCatalogExcelRow, 'rowNumber'>>
) {
  const dataRows =
    products && products.length > 0
      ? products.map(productToCatalogExcelValues)
      : [
          productToCatalogExcelValues({
            code: 'SP-001',
            name: 'Tấm nhựa sóng mẫu',
            nature: 'Thành phẩm',
            group: 'Nhựa',
            unit: 'tấm',
            totalWeight: '12.5',
            rollWidth: '1.2',
            rollLength: '50',
            coreWeight: '0.2',
            bagWeight: '0.1',
            plasticWeight: '12.2',
            amisCode: 'AMIS-001',
            newCode: ''
          }),
          productToCatalogExcelValues({
            code: 'SP-002',
            name: 'Sản phẩm để trống các cột còn lại',
            nature: '',
            group: '',
            unit: '',
            totalWeight: '',
            rollWidth: '',
            rollLength: '',
            coreWeight: '',
            bagWeight: '',
            plasticWeight: '',
            amisCode: '',
            newCode: ''
          })
        ];

  const worksheet = XLSX.utils.aoa_to_sheet([[...PRODUCT_CATALOG_EXCEL_HEADERS], ...dataRows]);
  worksheet['!cols'] = PRODUCT_CATALOG_EXCEL_HEADERS.map(header => ({
    wch: Math.min(36, Math.max(12, header.length + 2))
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'San_pham');
  XLSX.writeFile(
    workbook,
    products && products.length > 0 ? 'danh-sach-san-pham.xlsx' : 'mau-danh-muc-san-pham.xlsx'
  );
}

/** Chỉ gửi 13 trường danh mục/thông số — không đụng tồn kho / mô tả. */
export function productCatalogRowToPayload(row: ProductCatalogExcelRow) {
  return {
    code: row.code.trim(),
    name: row.name.trim(),
    nature: row.nature.trim(),
    group: row.group.trim(),
    unit: row.unit.trim(),
    totalWeight: row.totalWeight.trim(),
    rollWidth: row.rollWidth.trim(),
    rollLength: row.rollLength.trim(),
    coreWeight: row.coreWeight.trim(),
    bagWeight: row.bagWeight.trim(),
    plasticWeight: row.plasticWeight.trim(),
    amisCode: row.amisCode.trim(),
    newCode: row.newCode.trim()
  };
}
