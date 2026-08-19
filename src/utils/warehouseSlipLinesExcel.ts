import * as XLSX from 'xlsx';

export type WarehouseSlipLineImportRow = {
  code: string;
  name: string;
  unit: string;
  quantity: string;
  documentQuantity: string;
  unitPrice: string;
};

export type WarehouseSlipTemplateItem = {
  code: string;
  name: string;
  unit: string;
};

const CODE_HEADERS = ['mã sp', 'ma sp', 'mã npl', 'ma npl', 'ma_sp', 'ma_npl', 'code', 'mã', 'ma'];
const NAME_HEADERS = ['tên sp', 'ten sp', 'tên npl', 'ten npl', 'ten_sp', 'ten_npl', 'tên', 'ten', 'name'];
const UNIT_HEADERS = ['đvt', 'dvt', 'unit'];
const DOCUMENT_QTY_HEADERS = [
  'sl chứng từ',
  'sl chung tu',
  'so luong chung tu',
  'số lượng chứng từ',
  'sl ct',
  'document quantity'
];
const ACTUAL_QTY_HEADERS = [
  'sl thực',
  'sl thuc',
  'sl thực xuất',
  'so luong thuc',
  'số lượng thực',
  'actual quantity'
];
const QUANTITY_HEADERS = ['số lượng', 'so luong', 'sl', 'quantity'];
const PRICE_HEADERS = ['giá', 'gia', 'đơn giá', 'don gia', 'price'];

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

function findHeaderKey(headers: string[], aliases: string[]) {
  return headers.find(header => aliases.some(alias => header === alias || header.includes(alias)));
}

function normalizeCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

function dedupeImportRows(rows: WarehouseSlipLineImportRow[]) {
  const map = new Map<string, WarehouseSlipLineImportRow>();
  rows.forEach(row => {
    map.set(normalizeCodeKey(row.code), row);
  });
  return [...map.values()];
}

function parseSheetRows(sheet: XLSX.WorkSheet, slipType: 'xuat' | 'nhap'): WarehouseSlipLineImportRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const firstRow = matrix[0].map(cell => normalizeHeader(cell));
  const codeHeader = findHeaderKey(firstRow, CODE_HEADERS);
  if (!codeHeader) return [];

  const nameHeader = findHeaderKey(firstRow, NAME_HEADERS);
  const unitHeader = findHeaderKey(firstRow, UNIT_HEADERS);
  const priceHeader = findHeaderKey(firstRow, PRICE_HEADERS);

  const codeIndex = firstRow.indexOf(codeHeader);
  const nameIndex = nameHeader ? firstRow.indexOf(nameHeader) : -1;
  const unitIndex = unitHeader ? firstRow.indexOf(unitHeader) : -1;
  const priceIndex = priceHeader ? firstRow.indexOf(priceHeader) : -1;

  let documentQtyIndex = -1;
  let quantityIndex = -1;

  if (slipType === 'xuat') {
    const documentQtyHeader = findHeaderKey(firstRow, DOCUMENT_QTY_HEADERS);
    const actualQtyHeader = findHeaderKey(firstRow, ACTUAL_QTY_HEADERS);
    documentQtyIndex = documentQtyHeader ? firstRow.indexOf(documentQtyHeader) : -1;
    quantityIndex = actualQtyHeader
      ? firstRow.indexOf(actualQtyHeader)
      : firstRow.indexOf(findHeaderKey(firstRow, QUANTITY_HEADERS) || '');
  } else {
    const quantityHeader = findHeaderKey(firstRow, QUANTITY_HEADERS);
    quantityIndex = quantityHeader ? firstRow.indexOf(quantityHeader) : -1;
  }

  return dedupeImportRows(
    matrix
      .slice(1)
      .map(row => ({
        code: cellToText(row[codeIndex]),
        name: nameIndex >= 0 ? cellToText(row[nameIndex]) : '',
        unit: unitIndex >= 0 ? cellToText(row[unitIndex]) : '',
        quantity: quantityIndex >= 0 ? cellToText(row[quantityIndex]) : '',
        documentQuantity: documentQtyIndex >= 0 ? cellToText(row[documentQtyIndex]) : '',
        unitPrice: priceIndex >= 0 ? cellToText(row[priceIndex]) : ''
      }))
      .filter(row => row.code)
  );
}

export async function parseWarehouseSlipLinesExcel(
  file: File,
  slipType: 'xuat' | 'nhap'
): Promise<WarehouseSlipLineImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  return parseSheetRows(sheet, slipType);
}

export function downloadWarehouseSlipLinesTemplate(
  items: WarehouseSlipTemplateItem[],
  slipType: 'xuat' | 'nhap',
  warehouseKind: string
) {
  const codeLabel = warehouseKind === 'san_pham' ? 'Mã SP' : 'Mã NPL';
  const nameLabel = warehouseKind === 'san_pham' ? 'Tên SP' : 'Tên NPL';
  const header =
    slipType === 'xuat'
      ? [codeLabel, nameLabel, 'ĐVT', 'SL chứng từ', 'SL thực', 'Giá']
      : [codeLabel, nameLabel, 'ĐVT', 'Số lượng', 'Giá'];

  const sortedItems = [...items]
    .filter(item => item.code)
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

  const rows = sortedItems.length > 0
    ? sortedItems.map(item =>
        slipType === 'xuat'
          ? {
              [codeLabel]: item.code,
              [nameLabel]: item.name,
              'ĐVT': item.unit,
              'SL chứng từ': '',
              'SL thực': '',
              'Giá': ''
            }
          : {
              [codeLabel]: item.code,
              [nameLabel]: item.name,
              'ĐVT': item.unit,
              'Số lượng': '',
              'Giá': ''
            }
      )
    : [
        slipType === 'xuat'
          ? { [codeLabel]: '', [nameLabel]: '', 'ĐVT': '', 'SL chứng từ': '', 'SL thực': '', 'Giá': '' }
          : { [codeLabel]: '', [nameLabel]: '', 'ĐVT': '', 'Số lượng': '', 'Giá': '' }
      ];

  const worksheet = XLSX.utils.json_to_sheet(rows, { header });
  worksheet['!cols'] = header.map(label => ({ wch: label.length > 10 ? 22 : 14 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Chi_tiet');
  const fileNameKind = warehouseKind.replace(/_/g, '-') || 'kho';
  const fileNameType = slipType === 'xuat' ? 'xuat-kho' : 'nhap-kho';
  XLSX.writeFile(workbook, `mau-${fileNameType}-${fileNameKind}.xlsx`);
}
