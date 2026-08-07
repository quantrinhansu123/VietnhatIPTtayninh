import * as XLSX from 'xlsx';

/** Dòng Excel danh mục sản phẩm — khớp form / bảng UI / cột `san_pham`. */
export type ProductCatalogExcelRow = {
  code: string;
  amisCode: string;
  newCode: string;
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
  openingStock: string;
  inbound: string;
  outbound: string;
  stock: string;
  minStock: string;
  origin: string;
  description: string;
  rowNumber: number;
};

const HEADER_ALIASES: Record<keyof Omit<ProductCatalogExcelRow, 'rowNumber'>, string[]> = {
  code: ['ma sp', 'ma_sp', 'ma san pham', 'code'],
  amisCode: ['ma amis', 'ma_amis', 'amis'],
  newCode: ['ma moi', 'ma_sp_moi', 'ma sp moi'],
  name: ['ten san pham', 'ten_sp', 'ten sp', 'name'],
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
  openingStock: ['ton dau', 'ton_dau_ky', 'opening stock'],
  inbound: ['nhap trong ky', 'nhap_trong_ky', 'nhap', 'inbound'],
  outbound: ['xuat trong ky', 'xuat_trong_ky', 'xuat', 'outbound'],
  stock: ['sl_ton', 'ton kho', 'stock'],
  minStock: ['ton toi thieu', 'so_luong_ton_toi_thieu', 'min stock'],
  origin: ['nguon goc', 'nguon_goc', 'origin'],
  description: ['mo ta', 'mo_ta', 'ghi chu', 'description']
};

/**
 * Cột mẫu khớp bảng `/san-pham` + form thêm/sửa / DB `san_pham`.
 * Ô trống = vẫn đẩy lên (null / bỏ trống), không bắt buộc đủ giá trị.
 */
export const PRODUCT_CATALOG_EXCEL_HEADERS = [
  'Mã SP',
  'Tên sản phẩm',
  'Tính chất',
  'Nhóm',
  'Đơn vị',
  'Tổng TL (kg)',
  'Tồn đầu',
  'Nhập',
  'Xuất',
  'Tồn',
  'Tồn tối thiểu',
  'Mã AMIS',
  'Mã mới',
  'Khổ cuộn (m)',
  'Chiều dài mét/cuộn (m)',
  'Trọng lượng lõi (kg)',
  'Trọng lượng túi (kg)',
  'Trọng lượng nhựa + phụ gia (kg)',
  'Nguồn gốc',
  'Mô tả'
] as const;

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

/** Ưu tiên khớp đúng cả chuỗi header; tránh "ton" ăn nhầm "ton dau". */
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
  const nameIndex = findColumn(headers, HEADER_ALIASES.name);
  if (codeIndex < 0 && nameIndex < 0) {
    throw new Error('Không tìm thấy cột "Mã SP" hoặc "Tên sản phẩm" trong file Excel.');
  }

  // "Tồn" đúng cột — sau khi đã map ton dau / ton toi thieu
  const stockAliases = [...HEADER_ALIASES.stock, 'ton'];

  const indices = {
    code: codeIndex,
    amisCode: findColumn(headers, HEADER_ALIASES.amisCode),
    newCode: findColumn(headers, HEADER_ALIASES.newCode),
    name: nameIndex,
    nature: findColumn(headers, HEADER_ALIASES.nature),
    group: findColumn(headers, HEADER_ALIASES.group),
    unit: findColumn(headers, HEADER_ALIASES.unit),
    totalWeight: findColumn(headers, HEADER_ALIASES.totalWeight),
    rollWidth: findColumn(headers, HEADER_ALIASES.rollWidth),
    rollLength: findColumn(headers, HEADER_ALIASES.rollLength),
    coreWeight: findColumn(headers, HEADER_ALIASES.coreWeight),
    bagWeight: findColumn(headers, HEADER_ALIASES.bagWeight),
    plasticWeight: findColumn(headers, HEADER_ALIASES.plasticWeight),
    openingStock: findColumn(headers, HEADER_ALIASES.openingStock),
    inbound: findColumn(headers, HEADER_ALIASES.inbound),
    outbound: findColumn(headers, HEADER_ALIASES.outbound),
    stock: findColumn(headers, stockAliases),
    minStock: findColumn(headers, HEADER_ALIASES.minStock),
    origin: findColumn(headers, HEADER_ALIASES.origin),
    description: findColumn(headers, HEADER_ALIASES.description)
  } as const;

  // Nếu "ton" trùng cột đã dùng cho tồn đầu / tồn TT thì bỏ
  if (
    indices.stock >= 0 &&
    (indices.stock === indices.openingStock || indices.stock === indices.minStock)
  ) {
    const exactTon = headers.findIndex(header => header === 'ton');
    (indices as { stock: number }).stock =
      exactTon >= 0 && exactTon !== indices.openingStock && exactTon !== indices.minStock
        ? exactTon
        : -1;
  }

  return matrix
    .slice(1)
    .map((row, index) => {
      const get = (key: keyof typeof indices) => {
        const col = indices[key];
        return col >= 0 ? cellToText(row[col]) : '';
      };
      return {
        code: get('code'),
        amisCode: get('amisCode'),
        newCode: get('newCode'),
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
        openingStock: get('openingStock'),
        inbound: get('inbound'),
        outbound: get('outbound'),
        stock: get('stock'),
        minStock: get('minStock'),
        origin: get('origin'),
        description: get('description'),
        rowNumber: index + 2
      };
    })
    .filter(row => Boolean(row.code.trim() || row.name.trim()));
}

export function downloadProductCatalogExcelTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...PRODUCT_CATALOG_EXCEL_HEADERS],
    // 1 dòng đủ mẫu
    [
      'SP-001',
      'Tấm nhựa sóng mẫu',
      'Thành phẩm',
      'Nhựa',
      'tấm',
      '12.5',
      '0',
      '0',
      '0',
      '0',
      '10',
      'AMIS-001',
      '',
      '1.2',
      '50',
      '0.2',
      '0.1',
      '12.2',
      '',
      ''
    ],
    // 1 dòng gần như trống — vẫn hợp lệ khi tải lên (chỉ cần Mã SP hoặc Tên)
    ['SP-002', 'Sản phẩm để trống các cột còn lại', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
  ]);
  worksheet['!cols'] = PRODUCT_CATALOG_EXCEL_HEADERS.map(header => ({
    wch: Math.min(34, Math.max(12, header.length + 2))
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'San_pham');
  XLSX.writeFile(workbook, 'mau-danh-muc-san-pham.xlsx');
}

export function productCatalogRowToPayload(row: ProductCatalogExcelRow) {
  // Chuỗi rỗng vẫn gửi lên — API map thành null / bỏ trống, không chặn import.
  return {
    code: row.code.trim(),
    newCode: row.newCode.trim(),
    amisCode: row.amisCode.trim(),
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
    openingStock: row.openingStock.trim(),
    inbound: row.inbound.trim(),
    outbound: row.outbound.trim(),
    stock: row.stock.trim(),
    minStock: row.minStock.trim(),
    origin: row.origin.trim(),
    description: row.description.trim()
  };
}
