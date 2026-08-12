import * as XLSX from 'xlsx';

export type ProductNplComponentsExcelRow = {
  code: string;
  name: string;
  amountType: 'percent' | 'quantity';
  value: number;
  unit: string;
};

export type ProductNplComponentsExportRow = {
  code: string;
  name: string;
  amountType: ProductNplComponentsExcelRow['amountType'];
  percent: number | null;
  quantity: number | null;
  unit: string;
};

export type BulkProductNplComponentsExcelRow = {
  productCode: string;
  componentName: string;
  amountType: 'percent' | 'quantity';
  value: number;
  unit: string;
};

export type BulkProductNplComponentsExportRow = {
  productCode: string;
  componentName: string;
  amountType: 'percent' | 'quantity';
  percent: number | null;
  quantity: number | null;
  unit: string;
};

const PRODUCT_CODE_HEADERS = ['mã sp', 'ma sp', 'ma_sp', 'mã sản phẩm', 'ma san pham', 'product code'];
const CODE_HEADERS = ['mã npl', 'ma npl', 'ma_npl', 'mã', 'ma', 'code'];
const NAME_HEADERS = ['tên nvl', 'ten nvl', 'ten_npl', 'tên nguyên phụ liệu', 'ten nguyen phu lieu', 'name'];
const TYPE_HEADERS = ['loại', 'loai', 'loại định lượng', 'loai dinh luong', 'type', 'amounttype'];
const VALUE_HEADERS = ['giá trị', 'gia tri', 'gia_tri', 'value', 'phan tram', 'phần trăm', 'so luong', 'số lượng'];
const UNIT_HEADERS = ['đvt', 'dvt', 'don vi', 'đơn vị', 'unit'];

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function parseNumber(value: string) {
  const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return NaN;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function findHeaderKey(headers: string[], aliases: string[]) {
  return headers.find(header => aliases.some(alias => header === alias || header.includes(alias)));
}

function normalizeCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

function resolveAmountType(raw: string): 'percent' | 'quantity' | null {
  const value = normalizeHeader(raw);
  if (!value) return null;
  if (
    value.includes('so luong') ||
    value.includes('quantity') ||
    value === 'sl' ||
    value === 'dinh luong'
  ) {
    return 'quantity';
  }
  if (
    value.includes('phan tram') ||
    value.includes('percent') ||
    value === '%' ||
    value === 'ty le'
  ) {
    return 'percent';
  }
  return null;
}

function dedupeRows(rows: ProductNplComponentsExcelRow[]) {
  const map = new Map<string, ProductNplComponentsExcelRow>();
  rows.forEach(row => {
    map.set(normalizeCodeKey(row.code), row);
  });
  return [...map.values()];
}

function dedupeBulkRows(rows: BulkProductNplComponentsExcelRow[]) {
  const map = new Map<string, BulkProductNplComponentsExcelRow>();
  rows.forEach(row => {
    map.set(`${normalizeCodeKey(row.productCode)}__${normalizeHeader(row.componentName)}`, row);
  });
  return [...map.values()];
}

function parseSheetRows(sheet: XLSX.WorkSheet): ProductNplComponentsExcelRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const firstRow = matrix[0].map(cell => normalizeHeader(cell));
  const codeHeader = findHeaderKey(firstRow, CODE_HEADERS);
  const nameHeader = findHeaderKey(firstRow, NAME_HEADERS);
  const typeHeader = findHeaderKey(firstRow, TYPE_HEADERS);
  const valueHeader = findHeaderKey(firstRow, VALUE_HEADERS);
  const unitHeader = findHeaderKey(firstRow, UNIT_HEADERS);
  const hasHeader = Boolean(codeHeader && valueHeader);

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const codeIndex = hasHeader ? firstRow.indexOf(codeHeader!) : 0;
  const nameIndex = hasHeader && nameHeader ? firstRow.indexOf(nameHeader) : 1;
  const typeIndex = hasHeader && typeHeader ? firstRow.indexOf(typeHeader) : 2;
  const valueIndex = hasHeader ? firstRow.indexOf(valueHeader!) : hasHeader ? 3 : 2;
  const unitIndex = hasHeader && unitHeader ? firstRow.indexOf(unitHeader) : 4;

  const parsed: ProductNplComponentsExcelRow[] = [];

  for (const row of dataRows) {
    const code = cellToText(row[codeIndex]);
    if (!code || CODE_HEADERS.includes(normalizeHeader(code))) continue;

    const name = nameIndex >= 0 ? cellToText(row[nameIndex]) : '';
    const typeRaw = typeIndex >= 0 ? cellToText(row[typeIndex]) : '';
    const valueRaw = cellToText(row[valueIndex]);
    const unit = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
    const value = parseNumber(valueRaw);

    if (!Number.isFinite(value) || value < 0) continue;

    const amountType = resolveAmountType(typeRaw) ?? 'percent';
    if (amountType === 'quantity' && !unit) continue;

    parsed.push({
      code,
      name,
      amountType,
      value: Math.round(value * 100) / 100,
      unit: amountType === 'quantity' ? unit : ''
    });
  }

  return dedupeRows(parsed);
}

export async function parseProductNplComponentsExcel(file: File): Promise<ProductNplComponentsExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  return parseSheetRows(sheet);
}

export async function parseBulkProductNplComponentsExcel(file: File): Promise<BulkProductNplComponentsExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const firstRow = matrix[0].map(cell => normalizeHeader(cell));
  const productCodeHeader = findHeaderKey(firstRow, PRODUCT_CODE_HEADERS);
  const nameHeader = findHeaderKey(firstRow, NAME_HEADERS);
  const typeHeader = findHeaderKey(firstRow, TYPE_HEADERS);
  const valueHeader = findHeaderKey(firstRow, VALUE_HEADERS);
  const unitHeader = findHeaderKey(firstRow, UNIT_HEADERS);
  const hasHeader = Boolean(productCodeHeader && nameHeader && valueHeader);

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const productCodeIndex = hasHeader ? firstRow.indexOf(productCodeHeader!) : 0;
  const nameIndex = hasHeader ? firstRow.indexOf(nameHeader!) : 1;
  const typeIndex = hasHeader && typeHeader ? firstRow.indexOf(typeHeader) : 2;
  const valueIndex = hasHeader ? firstRow.indexOf(valueHeader!) : 3;
  const unitIndex = hasHeader && unitHeader ? firstRow.indexOf(unitHeader) : 4;

  const rows: BulkProductNplComponentsExcelRow[] = [];

  for (const row of dataRows) {
    const productCode = cellToText(row[productCodeIndex]);
    const componentName = cellToText(row[nameIndex]);
    if (!productCode || !componentName) continue;

    const value = parseNumber(cellToText(row[valueIndex]));
    if (!Number.isFinite(value) || value < 0) continue;

    const amountType = resolveAmountType(typeIndex >= 0 ? cellToText(row[typeIndex]) : '') ?? 'percent';
    const unit = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
    if (amountType === 'quantity' && !unit) continue;

    rows.push({
      productCode,
      componentName,
      amountType,
      value: Math.round(value * 100) / 100,
      unit: amountType === 'quantity' ? unit : ''
    });
  }

  return dedupeBulkRows(rows);
}

function amountTypeLabel(type: ProductNplComponentsExcelRow['amountType']) {
  return type === 'quantity' ? 'Số lượng' : 'Phần trăm';
}

function exportValue(row: ProductNplComponentsExportRow) {
  if (row.amountType === 'quantity') {
    return row.quantity ?? '';
  }
  return row.percent ?? '';
}

export function downloadProductNplComponentsTemplate(
  items: ProductNplComponentsExportRow[],
  productCode: string
) {
  const rows =
    items.length > 0
      ? items.map(item => ({
          'Mã NPL': item.code,
          'Tên NVL': item.name === '-' ? '' : item.name,
          Loại: amountTypeLabel(item.amountType),
          'Giá trị': exportValue(item),
          ĐVT: item.amountType === 'quantity' ? item.unit || '' : ''
        }))
      : [
          {
            'Mã NPL': 'NPL-001',
            'Tên NVL': 'Nhựa LDPE',
            Loại: 'Phần trăm',
            'Giá trị': 60,
            ĐVT: ''
          },
          {
            'Mã NPL': 'NPL-002',
            'Tên NVL': 'Phụ gia',
            Loại: 'Số lượng',
            'Giá trị': 0.5,
            ĐVT: 'kg'
          }
        ];

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Mã NPL', 'Tên NVL', 'Loại', 'Giá trị', 'ĐVT']
  });
  worksheet['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Thanh_phan');
  const safeCode = productCode.replace(/[^\w.-]+/g, '_') || 'san-pham';
  XLSX.writeFile(workbook, `mau-thanh-phan-${safeCode}.xlsx`);
}

export function downloadBulkProductNplComponentsTemplate(rows: BulkProductNplComponentsExportRow[]) {
  const exportRows =
    rows.length > 0
      ? rows.map(row => ({
          'Mã SP': row.productCode,
          'Tên NVL': row.componentName,
          Loại: amountTypeLabel(row.amountType),
          'Giá trị': row.amountType === 'quantity' ? row.quantity ?? '' : row.percent ?? '',
          ĐVT: row.amountType === 'quantity' ? row.unit || '' : ''
        }))
      : [
          {
            'Mã SP': 'SP-001',
            'Tên NVL': 'Nhựa LDPE',
            Loại: 'Phần trăm',
            'Giá trị': 95,
            ĐVT: ''
          },
          {
            'Mã SP': 'SP-001',
            'Tên NVL': 'Phụ gia',
            Loại: 'Số lượng',
            'Giá trị': 0.5,
            ĐVT: 'kg'
          }
        ];

  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: ['Mã SP', 'Tên NVL', 'Loại', 'Giá trị', 'ĐVT']
  });
  worksheet['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Thanh_phan_SP');
  XLSX.writeFile(workbook, 'mau-thanh-phan-nhieu-san-pham.xlsx');
}
