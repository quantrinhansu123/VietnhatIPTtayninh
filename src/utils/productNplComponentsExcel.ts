import * as XLSX from 'xlsx';

export type ProductNplComponentsExcelRow = {
  code: string;
  name: string;
  amountType: 'percent' | 'quantity';
  value: number;
  unit: string;
  /** Kg gắn từ dòng Số lượng/Kg khi gộp với dòng Cái hoặc %. */
  weightKg?: number;
  /** % kèm theo khi gộp nhiều dòng cùng Mã NVL. */
  percent?: number;
};

export type BulkProductNplComponentsExportRow = {
  productCode: string;
  componentCode: string;
  componentName: string;
  amountType: 'percent' | 'quantity';
  percent: number | null;
  quantity: number | null;
  unit: string;
  /** Kg kèm theo — xuất cột Giá trị + ĐVT=Kg (hoặc dòng thứ 2 nếu đã có Cái). */
  weightKg?: number | null;
};

export type BulkProductNplComponentsExcelRow = {
  productCode: string;
  /** Khớp kho NVL theo mã — bắt buộc. */
  componentCode: string;
  /** Tùy chọn; khi nhập sẽ ưu tiên tên từ danh mục kho NVL. */
  componentName: string;
  amountType: 'percent' | 'quantity';
  value: number;
  unit: string;
  weightKg?: number;
  percent?: number;
};

export type ProductNplComponentsExportRow = {
  code: string;
  name: string;
  amountType: ProductNplComponentsExcelRow['amountType'];
  percent: number | null;
  quantity: number | null;
  unit: string;
  weightKg?: number | null;
};

const PRODUCT_CODE_HEADERS = ['mã sp', 'ma sp', 'ma_sp', 'mã sản phẩm', 'ma san pham', 'product code'];
const NVL_CODE_HEADERS = [
  'mã nvl',
  'ma nvl',
  'ma_nvl',
  'mã npl',
  'ma npl',
  'ma_npl',
  'mã nguyên phụ liệu',
  'ma nguyen phu lieu'
];
const CODE_HEADERS = ['mã npl', 'ma npl', 'ma_npl', 'mã nvl', 'ma nvl', 'ma_nvl', 'code'];
const NAME_HEADERS = ['tên nvl', 'ten nvl', 'ten_npl', 'tên nguyên phụ liệu', 'ten nguyen phu lieu', 'name'];
const TYPE_HEADERS = ['loại', 'loai', 'loại định lượng', 'loai dinh luong', 'type', 'amounttype'];
/** Cột giá trị chuẩn — không gộp "Phần trăm"/"Số lượng" để tránh nhầm cột. */
const VALUE_HEADERS = ['giá trị', 'gia tri', 'gia_tri', 'value', 'ty le', 'tỷ lệ'];
const UNIT_HEADERS = [
  'đvt',
  'dvt',
  'don vi',
  'đơn vị',
  'don vi tinh',
  'đơn vị tính',
  'don vi goc',
  'đơn vị gốc',
  'unit',
  'kg/don vi',
  'uom'
];
/** File cũ chỉ có cột Phần trăm / Số lượng thay cho Giá trị. */
const LEGACY_PERCENT_VALUE_HEADERS = ['phan tram', 'phần trăm', 'percent', '%'];
const LEGACY_QUANTITY_VALUE_HEADERS = ['so luong', 'số lượng', 'quantity', 'sl'];

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Đọc số từ ô Excel — không làm tròn.
 * Hỗ trợ "40%", "40,5"; ô format % của Excel (raw 0.4 → 40).
 */
function parseCellNumber(value: unknown, options: { percentFormat?: boolean } = {}): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (options.percentFormat && value > -1e-12 && value <= 1) {
      return value * 100;
    }
    return value;
  }

  let normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!normalized) return NaN;

  const hadPercentSign = normalized.includes('%');
  normalized = normalized.replace(/%/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return NaN;
  if (hadPercentSign) return parsed;
  if (options.percentFormat && parsed > -1e-12 && parsed <= 1) return parsed * 100;
  return parsed;
}

/** Tách "1 Cái", "0,084 kg", "2 cuộn" → số + đơn vị (giữ nguyên ĐVT khác kg). */
function parseQuantityValueAndUnit(value: unknown): { value: number; unit: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, unit: '' };
  }
  const text = String(value ?? '').trim();
  if (!text) return { value: NaN, unit: '' };

  const match = text.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/u);
  if (!match) return { value: NaN, unit: '' };

  const numeric = parseCellNumber(match[1]);
  const unit = String(match[2] ?? '')
    .replace(/%/g, '')
    .trim();
  return { value: numeric, unit };
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function findHeaderKey(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(alias => normalizeHeader(alias)).filter(Boolean);
  // Ưu tiên khớp đúng cả cụm (tránh "ma" khớp nhầm "ma sp").
  const exact = headers.find(header => normalizedAliases.some(alias => header === alias));
  if (exact) return exact;
  return headers.find(header =>
    normalizedAliases.some(alias => {
      if (alias.length < 4) return false;
      return header.includes(alias) || alias.includes(header);
    })
  );
}

function isExcelPercentFormat(format: unknown) {
  return String(format ?? '').includes('%');
}

function readSheetCell(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number
): { value: unknown; percentFormat: boolean; displayText: string } {
  if (colIndex < 0) return { value: '', percentFormat: false, displayText: '' };
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[address] as XLSX.CellObject | undefined;
  if (!cell) return { value: '', percentFormat: false, displayText: '' };
  return {
    value: cell.v ?? '',
    percentFormat: isExcelPercentFormat(cell.z),
    displayText: String(cell.w ?? '').trim()
  };
}

/**
 * Đọc phần trăm từ ô Excel.
 * - Ưu tiên text hiển thị có "%" (khớp số user nhìn thấy).
 * - Ô format % của Excel: raw 0.825 → 82.5.
 * - Số thuần 0–1 (tỷ lệ) được chuẩn hóa sau khi gom cả sheet (scaleProductNplPercentFractions).
 */
function parsePercentCellValue(valueCell: {
  value: unknown;
  percentFormat: boolean;
  displayText?: string;
}): number {
  const display = String(valueCell.displayText ?? '').trim();
  if (display.includes('%')) {
    return parseCellNumber(display);
  }

  const rawText = String(valueCell.value ?? '');
  if (rawText.includes('%')) {
    return parseCellNumber(rawText);
  }

  return parseCellNumber(valueCell.value, { percentFormat: valueCell.percentFormat });
}

/** Nếu các dòng % đang ở thang tỷ lệ 0–1 (tổng ≈ 1) thì nhân 100 → phần trăm. */
export function scaleProductNplPercentFractions<T extends { amountType: 'percent' | 'quantity'; value: number }>(
  rows: T[]
): T[] {
  const percentValues = rows.filter(row => row.amountType === 'percent').map(row => row.value);
  if (percentValues.length < 2) return rows;
  const max = Math.max(...percentValues);
  const sum = percentValues.reduce((acc, value) => acc + value, 0);
  // Vd 0,0917 + 0,825 + … ≈ 1 → 9,17% + 82,5% + …
  if (!(max <= 1 && sum >= 0.5 && sum <= 1.5)) return rows;
  return rows.map(row =>
    row.amountType === 'percent' ? { ...row, value: row.value * 100 } : row
  );
}

/** `MT- MN001` ≡ `MT-MN001` khi gộp/import Excel. */
function normalizeCodeKey(code: string) {
  return String(code ?? '')
    .trim()
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
    .toUpperCase();
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
    value === 'ty le' ||
    value.includes('ty le')
  ) {
    return 'percent';
  }
  return null;
}

function resolveValueColumn(firstRow: string[]) {
  const valueHeader = findHeaderKey(firstRow, VALUE_HEADERS);
  if (valueHeader) {
    return { header: valueHeader, forcedType: null as 'percent' | 'quantity' | null };
  }
  const legacyPercent = findHeaderKey(firstRow, LEGACY_PERCENT_VALUE_HEADERS);
  if (legacyPercent) {
    return { header: legacyPercent, forcedType: 'percent' as const };
  }
  const legacyQuantity = findHeaderKey(firstRow, LEGACY_QUANTITY_VALUE_HEADERS);
  if (legacyQuantity) {
    return { header: legacyQuantity, forcedType: 'quantity' as const };
  }
  return { header: undefined, forcedType: null };
}

function isKgUnit(unit: string) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return (
    normalized === 'kg' ||
    normalized === 'kgs' ||
    normalized === 'kilogram' ||
    normalized === 'kilograms' ||
    normalized.startsWith('kg')
  );
}

function isPercentUnit(unit: string) {
  const normalized = unit
    .trim()
    .toLowerCase()
    .replace(/％/g, '%')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    normalized === '%' ||
    normalized === 'percent' ||
    normalized.includes('phan tram') ||
    normalized === 'pt'
  );
}

function isPercentRow(row: { amountType: 'percent' | 'quantity'; unit: string }) {
  return row.amountType === 'percent' || isPercentUnit(row.unit);
}

type MergedComponentFields = {
  name: string;
  amountType: 'percent' | 'quantity';
  value: number;
  unit: string;
  weightKg?: number;
  /** Phần trăm kèm theo khi dòng chính là Số lượng (Cái/Kg). */
  percent?: number;
};

function mergeOneComponentGroup<
  T extends { name?: string; amountType: 'percent' | 'quantity'; value: number; unit: string }
>(list: T[]): T & MergedComponentFields {
  const base = list[list.length - 1];
  const name =
    list.map(row => row.name).find(Boolean) ||
    String((base as { componentName?: string }).componentName || '') ||
    base.name ||
    '';
  const percentRows = list.filter(row => isPercentRow(row));
  // Cai/cuon: phai co DVT ro, khong phai kg
  const qtyNonKg = list.filter(row => {
    if (row.amountType !== 'quantity' || isKgUnit(row.unit) || isPercentUnit(row.unit)) return false;
    return Boolean(String(row.unit || '').trim());
  });
  // Loai = So luong + DVT = Kg -> cot Trong luong
  const qtyKg = list.filter(row => row.amountType === 'quantity' && isKgUnit(row.unit));
  const qtyBare = list.filter(
    row => row.amountType === 'quantity' && !String(row.unit || '').trim() && !isPercentUnit(row.unit)
  );

  const percentValue =
    percentRows.length > 0 ? percentRows[percentRows.length - 1].value : undefined;
  let kgValue = qtyKg.length > 0 ? qtyKg[qtyKg.length - 1].value : undefined;
  if (kgValue === undefined && qtyBare.length > 0 && (percentRows.length > 0 || qtyNonKg.length > 0)) {
    kgValue = qtyBare[qtyBare.length - 1].value;
  }
  // Giữ weightKg nếu đã gộp từ lần parse trước (tránh lần merge 2 ghi đè undefined).
  const preservedWeight = list
    .map(row => (row as { weightKg?: number }).weightKg)
    .filter((value): value is number => value !== undefined && Number.isFinite(value))
    .at(-1);
  const resolvedKg =
    kgValue !== undefined && Number.isFinite(kgValue) ? kgValue : preservedWeight;

  if (qtyNonKg.length > 0) {
    const primary = qtyNonKg[qtyNonKg.length - 1];
    return {
      ...primary,
      name: name || primary.name || '',
      amountType: 'quantity',
      weightKg: resolvedKg,
      percent: percentValue !== undefined && Number.isFinite(percentValue) ? percentValue : undefined
    };
  }

  if (percentValue !== undefined && Number.isFinite(percentValue)) {
    const primary = percentRows[percentRows.length - 1];
    return {
      ...primary,
      name: name || primary.name || '',
      amountType: 'percent',
      value: percentValue,
      unit: '%',
      weightKg: resolvedKg,
      percent: percentValue
    };
  }

  if (qtyKg.length > 0 || qtyBare.length > 0) {
    const primary = qtyKg.length > 0 ? qtyKg[qtyKg.length - 1] : qtyBare[qtyBare.length - 1];
    return {
      ...primary,
      name: name || primary.name || '',
      unit: primary.unit || 'kg',
      weightKg: resolvedKg ?? primary.value,
      percent: undefined
    };
  }

  return { ...base, name: name || base.name || '' };
}

/** Gộp nhiều dòng cùng Mã NPL (vd % + Kg, hoặc Cái + Kg) thành 1 dòng đủ. */
export function mergeProductNplComponentRows(rows: ProductNplComponentsExcelRow[]): ProductNplComponentsExcelRow[] {
  const groups = new Map<string, ProductNplComponentsExcelRow[]>();
  rows.forEach(row => {
    const key = normalizeCodeKey(row.code);
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  });
  return [...groups.values()].map(group => mergeOneComponentGroup(group));
}

/** Gộp nhiều dòng cùng Mã SP + Mã NVL thành 1 dòng thành phần. */
export function mergeBulkProductNplComponentRows(
  rows: BulkProductNplComponentsExcelRow[]
): BulkProductNplComponentsExcelRow[] {
  const groups = new Map<string, BulkProductNplComponentsExcelRow[]>();
  rows.forEach(row => {
    const key = `${normalizeCodeKey(row.productCode)}__${normalizeCodeKey(row.componentCode)}`;
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  });
  return [...groups.values()].map(group => {
    const merged = mergeOneComponentGroup(group);
    return {
      ...merged,
      productCode: group[0].productCode,
      componentCode: group[0].componentCode,
      componentName: merged.name || group[0].componentName
    };
  });
}

function dedupeRows(rows: ProductNplComponentsExcelRow[]) {
  return mergeProductNplComponentRows(rows);
}

function dedupeBulkRows(rows: BulkProductNplComponentsExcelRow[]) {
  return mergeBulkProductNplComponentRows(rows);
}

function findColumnIndex(headers: string[], aliases: string[]) {
  const key = findHeaderKey(headers, aliases);
  return key ? headers.indexOf(key) : -1;
}

function pushParsedComponentRow(
  target: ProductNplComponentsExcelRow[],
  input: {
    code: string;
    name: string;
    amountType: 'percent' | 'quantity';
    value: number;
    unit: string;
  }
) {
  if (!Number.isFinite(input.value) || input.value < 0) return;
  if (input.amountType === 'percent' && input.value > 100) return;
  target.push({
    code: input.code,
    name: input.name,
    amountType: input.amountType,
    value: input.value,
    unit: input.amountType === 'quantity' ? input.unit : '%'
  });
}

function parseSheetRows(
  sheet: XLSX.WorkSheet,
  options: { filterProductCode?: string } = {}
): ProductNplComponentsExcelRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (matrix.length === 0) return [];

  const firstRow = matrix[0].map(cell => normalizeHeader(cell));
  const productCodeHeader = findHeaderKey(firstRow, PRODUCT_CODE_HEADERS);
  const nvlCodeHeader = findHeaderKey(firstRow, [...NVL_CODE_HEADERS, ...CODE_HEADERS]);
  // File bulk (Mã SP + Mã NVL): luôn lấy Mã NVL làm mã thành phần — không nhầm Mã SP.
  const codeHeader = nvlCodeHeader || findHeaderKey(firstRow, CODE_HEADERS);
  const nameHeader = findHeaderKey(firstRow, NAME_HEADERS);
  const typeHeader = findHeaderKey(firstRow, TYPE_HEADERS);
  const { header: valueHeader, forcedType } = resolveValueColumn(firstRow);
  const unitHeader = findHeaderKey(firstRow, UNIT_HEADERS);
  const percentHeader = findHeaderKey(firstRow, LEGACY_PERCENT_VALUE_HEADERS);
  const quantityHeader = findHeaderKey(firstRow, LEGACY_QUANTITY_VALUE_HEADERS);
  const weightHeader = findHeaderKey(firstRow, [
    'trong luong',
    'trọng lượng',
    'khoi luong',
    'khối lượng',
    'khoi luong kg',
    'khối lượng kg',
    'weight',
    'weight kg'
  ]);

  // Wide mới: Phần trăm + Giá trị + ĐVT (không cột Loại / Số lượng)
  const giaTriWideFormat =
    Boolean(codeHeader) &&
    Boolean(percentHeader) &&
    Boolean(valueHeader) &&
    percentHeader !== valueHeader;
  // Wide cũ: Phần trăm + Số lượng trên cùng dòng
  const qtyWideFormat =
    Boolean(codeHeader) &&
    Boolean(percentHeader) &&
    Boolean(quantityHeader) &&
    percentHeader !== quantityHeader;
  const wideFormat = giaTriWideFormat || qtyWideFormat;

  const hasHeader = Boolean(
    codeHeader && (valueHeader || percentHeader || quantityHeader || weightHeader)
  );

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const headerRowIndex = hasHeader ? 0 : -1;
  const codeIndex = hasHeader ? firstRow.indexOf(codeHeader!) : 0;
  const productCodeIndex = hasHeader && productCodeHeader ? firstRow.indexOf(productCodeHeader) : -1;
  const nameIndex = hasHeader && nameHeader ? firstRow.indexOf(nameHeader) : 1;
  const typeIndex = hasHeader && typeHeader ? firstRow.indexOf(typeHeader) : -1;
  const valueIndex = hasHeader && valueHeader ? firstRow.indexOf(valueHeader) : wideFormat ? -1 : 2;
  const unitIndex = hasHeader && unitHeader ? firstRow.indexOf(unitHeader) : wideFormat ? -1 : 4;
  const percentIndex = hasHeader && percentHeader ? firstRow.indexOf(percentHeader) : -1;
  const quantityIndex = hasHeader && quantityHeader ? firstRow.indexOf(quantityHeader) : -1;
  const weightIndex = hasHeader && weightHeader ? firstRow.indexOf(weightHeader) : -1;

  const parsed: ProductNplComponentsExcelRow[] = [];

  dataRows.forEach((row, offset) => {
    const sheetRowIndex = headerRowIndex >= 0 ? headerRowIndex + 1 + offset : offset;
    if (productCodeIndex >= 0 && options.filterProductCode) {
      const rowProductCode = cellToText(row[productCodeIndex]);
      const want = options.filterProductCode.trim().replace(/\s+/g, '').toUpperCase();
      const got = rowProductCode.trim().replace(/\s+/g, '').toUpperCase();
      if (want && got && want !== got) return;
    }
    const code = cellToText(row[codeIndex]);
    if (!code || CODE_HEADERS.includes(normalizeHeader(code)) || PRODUCT_CODE_HEADERS.includes(normalizeHeader(code))) return;
    const name = nameIndex >= 0 ? cellToText(row[nameIndex]) : '';

    if (wideFormat) {
      const unitFromColumn = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
      if (percentIndex >= 0) {
        const percentCell = readSheetCell(sheet, sheetRowIndex, percentIndex);
        const percentValue = parsePercentCellValue(percentCell);
        if (Number.isFinite(percentValue) && percentValue >= 0 && percentValue <= 100) {
          pushParsedComponentRow(parsed, {
            code,
            name,
            amountType: 'percent',
            value: percentValue,
            unit: '%'
          });
        }
      }

      // Format mới: Giá trị + ĐVT (Kg → trọng lượng, Cái → số lượng)
      if (giaTriWideFormat && valueIndex >= 0) {
        const valueCell = readSheetCell(sheet, sheetRowIndex, valueIndex);
        const parsedQty = parseQuantityValueAndUnit(valueCell.value);
        let qtyValue = parsedQty.value;
        if (!Number.isFinite(qtyValue)) qtyValue = parseCellNumber(valueCell.value);
        const qtyUnit = unitFromColumn || parsedQty.unit;
        if (Number.isFinite(qtyValue) && qtyValue >= 0) {
          if (isKgUnit(qtyUnit) || (!qtyUnit && !isPercentUnit(qtyUnit))) {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: qtyValue,
              unit: isKgUnit(qtyUnit) ? qtyUnit || 'kg' : qtyUnit || 'kg'
            });
          } else if (qtyUnit && !isPercentUnit(qtyUnit)) {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: qtyValue,
              unit: qtyUnit
            });
          }
        }
        return;
      }

      if (quantityIndex >= 0) {
        const qtyCell = readSheetCell(sheet, sheetRowIndex, quantityIndex);
        const parsedQty = parseQuantityValueAndUnit(qtyCell.value);
        let qtyValue = parsedQty.value;
        if (!Number.isFinite(qtyValue)) qtyValue = parseCellNumber(qtyCell.value);
        let qtyUnit = unitFromColumn || parsedQty.unit;
        if (weightIndex >= 0 && (!qtyUnit || isKgUnit(qtyUnit))) {
          const weightCell = readSheetCell(sheet, sheetRowIndex, weightIndex);
          const weightValue = parseCellNumber(weightCell.value);
          if (Number.isFinite(weightValue) && weightValue >= 0) {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: weightValue,
              unit: 'kg'
            });
            if (Number.isFinite(qtyValue) && qtyValue >= 0 && qtyUnit && !isKgUnit(qtyUnit) && !isPercentUnit(qtyUnit)) {
              pushParsedComponentRow(parsed, {
                code,
                name,
                amountType: 'quantity',
                value: qtyValue,
                unit: qtyUnit
              });
            }
            return;
          }
        }

        if (Number.isFinite(qtyValue) && qtyValue >= 0) {
          if (isKgUnit(qtyUnit) || (!qtyUnit && isKgUnit(unitFromColumn))) {
            qtyUnit = qtyUnit || unitFromColumn || 'kg';
          }
          if (qtyUnit || isKgUnit(qtyUnit)) {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: qtyValue,
              unit: qtyUnit || (isKgUnit(unitFromColumn) ? unitFromColumn : '')
            });
          } else if (unitFromColumn) {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: qtyValue,
              unit: unitFromColumn
            });
          } else {
            pushParsedComponentRow(parsed, {
              code,
              name,
              amountType: 'quantity',
              value: qtyValue,
              unit: 'kg'
            });
          }
        }
      } else if (weightIndex >= 0) {
        const weightCell = readSheetCell(sheet, sheetRowIndex, weightIndex);
        const weightValue = parseCellNumber(weightCell.value);
        if (Number.isFinite(weightValue) && weightValue >= 0) {
          pushParsedComponentRow(parsed, {
            code,
            name,
            amountType: 'quantity',
            value: weightValue,
            unit: 'kg'
          });
        }
      }
      return;
    }

    // Dinh dang Loai + Gia tri (+ DVT), hoac 1 cot legacy
    const typeRaw = typeIndex >= 0 ? cellToText(row[typeIndex]) : '';
    const unitFromColumn = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
    const valueCell = readSheetCell(sheet, sheetRowIndex, valueIndex >= 0 ? valueIndex : 2);
    const parsedQtyHint = parseQuantityValueAndUnit(valueCell.value);
    const unitHint = unitFromColumn || parsedQtyHint.unit;
    const amountType =
      forcedType ??
      resolveAmountType(typeRaw) ??
      (isPercentUnit(unitHint) ||
      valueCell.percentFormat ||
      String(valueCell.value).includes('%')
        ? 'percent'
        : isKgUnit(unitHint) || Boolean(unitHint)
          ? 'quantity'
          : 'percent');

    let value = NaN;
    let unitFromValue = '';
    if (amountType === 'quantity') {
      value = parsedQtyHint.value;
      unitFromValue = parsedQtyHint.unit;
      if (!Number.isFinite(value)) value = parseCellNumber(valueCell.value);
    } else {
      value = parsePercentCellValue(valueCell);
    }

    let unit = unitFromColumn || unitFromValue;
    let resolvedType = amountType;
    if (isKgUnit(unit) || isKgUnit(unitHint)) {
      resolvedType = 'quantity';
      unit = unit || unitHint || 'kg';
    }

    // Neu co cot Trong luong rieng, them dong kg
    if (weightIndex >= 0) {
      const weightCell = readSheetCell(sheet, sheetRowIndex, weightIndex);
      const weightValue = parseCellNumber(weightCell.value);
      if (Number.isFinite(weightValue) && weightValue >= 0) {
        pushParsedComponentRow(parsed, {
          code,
          name,
          amountType: 'quantity',
          value: weightValue,
          unit: 'kg'
        });
      }
    }

    pushParsedComponentRow(parsed, {
      code,
      name,
      amountType: resolvedType,
      value,
      unit: resolvedType === 'quantity' ? unit : '%'
    });
  });

  return dedupeRows(scaleProductNplPercentFractions(parsed));
}

export async function parseProductNplComponentsExcel(
  file: File,
  options: { filterProductCode?: string } = {}
): Promise<ProductNplComponentsExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  return parseSheetRows(sheet, options);
}

export async function parseBulkProductNplComponentsExcel(file: File): Promise<BulkProductNplComponentsExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (matrix.length === 0) return [];

  // Tìm dòng header (file có thể có tiêu đề phía trên).
  let headerRowIndex = 0;
  let firstRow = matrix[0].map(cell => normalizeHeader(cell));
  for (let i = 0; i < Math.min(15, matrix.length); i += 1) {
    const candidate = matrix[i].map(cell => normalizeHeader(cell));
    const hasSp = findHeaderKey(candidate, PRODUCT_CODE_HEADERS);
    const hasNvl = findHeaderKey(candidate, [...NVL_CODE_HEADERS, ...CODE_HEADERS]);
    const hasValueish =
      findHeaderKey(candidate, VALUE_HEADERS) ||
      findHeaderKey(candidate, TYPE_HEADERS) ||
      findHeaderKey(candidate, UNIT_HEADERS) ||
      findHeaderKey(candidate, LEGACY_PERCENT_VALUE_HEADERS);
    if (hasSp && hasNvl && hasValueish) {
      headerRowIndex = i;
      firstRow = candidate;
      break;
    }
  }

  const productCodeHeader = findHeaderKey(firstRow, PRODUCT_CODE_HEADERS);
  const nvlCodeHeader = findHeaderKey(firstRow, [...NVL_CODE_HEADERS, ...CODE_HEADERS]);
  const nameHeader = findHeaderKey(firstRow, NAME_HEADERS);
  const typeHeader = findHeaderKey(firstRow, TYPE_HEADERS);
  const { header: valueHeader, forcedType } = resolveValueColumn(firstRow);
  const unitHeader = findHeaderKey(firstRow, UNIT_HEADERS);
  const percentHeader = findHeaderKey(firstRow, ['phan tram', 'phần trăm', 'percent']);
  const quantityHeader = findHeaderKey(firstRow, LEGACY_QUANTITY_VALUE_HEADERS);
  const weightHeader = findHeaderKey(firstRow, [
    'trong luong',
    'trọng lượng',
    'khoi luong',
    'khối lượng',
    'khoi luong kg',
    'khối lượng kg',
    'weight',
    'weight kg'
  ]);

  const giaTriWideFormat =
    Boolean(productCodeHeader) &&
    Boolean(nvlCodeHeader) &&
    Boolean(percentHeader) &&
    Boolean(valueHeader) &&
    percentHeader !== valueHeader;
  const qtyWideFormat =
    Boolean(productCodeHeader) &&
    Boolean(nvlCodeHeader) &&
    Boolean(percentHeader) &&
    Boolean(quantityHeader) &&
    percentHeader !== quantityHeader;
  const wideFormat = giaTriWideFormat || qtyWideFormat;

  const hasHeader = Boolean(
    productCodeHeader &&
      nvlCodeHeader &&
      (valueHeader || percentHeader || quantityHeader || weightHeader || typeHeader)
  );

  const dataRows = hasHeader ? matrix.slice(headerRowIndex + 1) : matrix;
  const productCodeIndex = hasHeader ? firstRow.indexOf(productCodeHeader!) : 0;
  const nvlCodeIndex = hasHeader ? firstRow.indexOf(nvlCodeHeader!) : 1;
  const nameIndex = hasHeader && nameHeader ? firstRow.indexOf(nameHeader) : -1;
  const typeIndex = hasHeader && typeHeader ? firstRow.indexOf(typeHeader) : hasHeader ? -1 : 2;
  const valueIndex = hasHeader && valueHeader ? firstRow.indexOf(valueHeader) : wideFormat ? -1 : 3;
  const unitIndex = hasHeader && unitHeader ? firstRow.indexOf(unitHeader) : wideFormat ? -1 : 4;
  const percentIndex = hasHeader && percentHeader ? firstRow.indexOf(percentHeader) : -1;
  const quantityIndex = hasHeader && quantityHeader ? firstRow.indexOf(quantityHeader) : -1;
  const weightIndex = hasHeader && weightHeader ? firstRow.indexOf(weightHeader) : -1;

  const rows: BulkProductNplComponentsExcelRow[] = [];

  const pushBulk = (input: BulkProductNplComponentsExcelRow) => {
    if (!Number.isFinite(input.value) || input.value < 0) return;
    if (input.amountType === 'percent' && input.value > 100) return;
    rows.push({
      ...input,
      unit: input.amountType === 'quantity' ? input.unit : '%'
    });
  };

  dataRows.forEach((row, offset) => {
    const sheetRowIndex = hasHeader ? headerRowIndex + 1 + offset : offset;
    const productCode = cellToText(row[productCodeIndex]);
    const componentCode = cellToText(row[nvlCodeIndex]);
    const componentName = nameIndex >= 0 ? cellToText(row[nameIndex]) : '';
    if (!productCode || !componentCode) return;
    if (normalizeCodeKey(productCode) === normalizeCodeKey(componentCode)) return;

    if (wideFormat) {
      const unitFromColumn = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
      if (percentIndex >= 0) {
        const percentCell = readSheetCell(sheet, sheetRowIndex, percentIndex);
        const percentValue = parsePercentCellValue(percentCell);
        if (Number.isFinite(percentValue) && percentValue >= 0 && percentValue <= 100) {
          pushBulk({
            productCode,
            componentCode,
            componentName,
            amountType: 'percent',
            value: percentValue,
            unit: '%'
          });
        }
      }

      if (giaTriWideFormat && valueIndex >= 0) {
        const valueCell = readSheetCell(sheet, sheetRowIndex, valueIndex);
        const parsedQty = parseQuantityValueAndUnit(valueCell.value);
        let qtyValue = parsedQty.value;
        if (!Number.isFinite(qtyValue)) qtyValue = parseCellNumber(valueCell.value);
        const qtyUnit = unitFromColumn || parsedQty.unit;
        if (Number.isFinite(qtyValue) && qtyValue >= 0) {
          if (isKgUnit(qtyUnit) || !qtyUnit) {
            pushBulk({
              productCode,
              componentCode,
              componentName,
              amountType: 'quantity',
              value: qtyValue,
              unit: 'kg'
            });
          } else if (!isPercentUnit(qtyUnit)) {
            pushBulk({
              productCode,
              componentCode,
              componentName,
              amountType: 'quantity',
              value: qtyValue,
              unit: qtyUnit
            });
          }
        }
        return;
      }

      if (quantityIndex >= 0) {
        const qtyCell = readSheetCell(sheet, sheetRowIndex, quantityIndex);
        const parsedQty = parseQuantityValueAndUnit(qtyCell.value);
        let qtyValue = parsedQty.value;
        if (!Number.isFinite(qtyValue)) qtyValue = parseCellNumber(qtyCell.value);
        let qtyUnit = unitFromColumn || parsedQty.unit;

        if (weightIndex >= 0) {
          const weightCell = readSheetCell(sheet, sheetRowIndex, weightIndex);
          const weightValue = parseCellNumber(weightCell.value);
          if (Number.isFinite(weightValue) && weightValue >= 0) {
            pushBulk({
              productCode,
              componentCode,
              componentName,
              amountType: 'quantity',
              value: weightValue,
              unit: 'kg'
            });
            if (
              Number.isFinite(qtyValue) &&
              qtyValue >= 0 &&
              qtyUnit &&
              !isKgUnit(qtyUnit) &&
              !isPercentUnit(qtyUnit)
            ) {
              pushBulk({
                productCode,
                componentCode,
                componentName,
                amountType: 'quantity',
                value: qtyValue,
                unit: qtyUnit
              });
            }
            return;
          }
        }

        if (Number.isFinite(qtyValue) && qtyValue >= 0) {
          if (isKgUnit(qtyUnit) || isKgUnit(unitFromColumn) || !qtyUnit) {
            pushBulk({
              productCode,
              componentCode,
              componentName,
              amountType: 'quantity',
              value: qtyValue,
              unit: qtyUnit || unitFromColumn || 'kg'
            });
          } else {
            pushBulk({
              productCode,
              componentCode,
              componentName,
              amountType: 'quantity',
              value: qtyValue,
              unit: qtyUnit || unitFromColumn
            });
          }
        }
      }
      return;
    }

    // Format Loại | Giá trị | ĐVT — ĐVT=Kg luôn là trọng lượng
    const unitFromColumn = unitIndex >= 0 ? cellToText(row[unitIndex]) : '';
    const typeRaw = typeIndex >= 0 ? cellToText(row[typeIndex]) : '';
    const vIdx = valueIndex >= 0 ? valueIndex : 3;
    const valueCell = readSheetCell(sheet, sheetRowIndex, vIdx);
    const matrixValue = row[vIdx];
    const rawValue =
      valueCell.value !== '' && valueCell.value !== undefined && valueCell.value !== null
        ? valueCell.value
        : matrixValue;
    const parsedQtyHint = parseQuantityValueAndUnit(rawValue);
    const unitHint = unitFromColumn || parsedQtyHint.unit;
    const type = resolveAmountType(typeRaw);
    const amountType =
      forcedType ??
      type ??
      (isPercentUnit(unitHint) ||
      valueCell.percentFormat ||
      String(rawValue).includes('%')
        ? 'percent'
        : isKgUnit(unitHint) || Boolean(unitHint)
          ? 'quantity'
          : 'percent');

    let value = NaN;
    let unitFromValue = '';
    if (amountType === 'quantity' || isKgUnit(unitHint)) {
      value = parsedQtyHint.value;
      unitFromValue = parsedQtyHint.unit;
      if (!Number.isFinite(value)) value = parseCellNumber(rawValue);
      if (!Number.isFinite(value)) value = parseLooseNumber(rawValue);
    } else {
      value = parsePercentCellValue({
        ...valueCell,
        value: rawValue
      });
      if (!Number.isFinite(value)) value = parseLooseNumber(rawValue);
    }

    let unit = unitFromColumn || unitFromValue;
    let resolvedType = amountType;
    // Cứng: mọi dòng ĐVT=Kg (kể cả Loại=Số lượng) → quantity + unit kg để merge vào weightKg
    if (isKgUnit(unit) || isKgUnit(unitHint)) {
      resolvedType = 'quantity';
      unit = 'kg';
    } else if (type === 'quantity' && !unit) {
      // Số lượng không ĐVT: nếu đã có dòng % cùng NVL thì coi là Kg
      const alreadyPercent = rows.some(
        r =>
          normalizeCodeKey(r.productCode) === normalizeCodeKey(productCode) &&
          normalizeCodeKey(r.componentCode) === normalizeCodeKey(componentCode) &&
          r.amountType === 'percent'
      );
      if (alreadyPercent) {
        resolvedType = 'quantity';
        unit = 'kg';
      }
    }

    if (weightIndex >= 0) {
      const weightCell = readSheetCell(sheet, sheetRowIndex, weightIndex);
      const weightValue = parseCellNumber(weightCell.value);
      if (Number.isFinite(weightValue) && weightValue >= 0) {
        pushBulk({
          productCode,
          componentCode,
          componentName,
          amountType: 'quantity',
          value: weightValue,
          unit: 'kg'
        });
      }
    }

    pushBulk({
      productCode,
      componentCode,
      componentName,
      amountType: resolvedType,
      value,
      unit: resolvedType === 'quantity' ? unit || 'Cái' : '%'
    });
  });

  return dedupeBulkRows(scaleProductNplPercentFractions(rows));
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

type ExcelLoaiRow = {
  'Mã SP': string;
  'Mã NVL': string;
  Loại: string;
  'Giá trị': number | string;
  ĐVT: string;
};

/**
 * Xuất đúng cấu trúc người dùng:
 * Mã SP | Mã NVL | Loại | Giá trị | ĐVT
 * — mỗi NVL: dòng Phần trăm+% và/hoặc Số lượng+Cái, kèm dòng Số lượng+Kg (trọng lượng).
 */
function expandItemToLoaiRows(input: {
  productCode: string;
  code: string;
  amountType: 'percent' | 'quantity';
  percent: number | null;
  quantity: number | null;
  unit: string;
  weightKg?: number | null;
}): ExcelLoaiRow[] {
  const productCode = input.productCode;
  const code = input.code;
  const percent =
    input.percent !== null && input.percent !== undefined && Number.isFinite(input.percent)
      ? input.percent
      : null;
  const quantity =
    input.quantity !== null && input.quantity !== undefined && Number.isFinite(input.quantity)
      ? input.quantity
      : null;
  const weightKg =
    input.weightKg !== null && input.weightKg !== undefined && Number.isFinite(input.weightKg)
      ? input.weightKg
      : null;
  const unit = String(input.unit || '').trim();
  const unitIsKg = isKgUnit(unit);
  const rows: ExcelLoaiRow[] = [];

  if (percent !== null) {
    rows.push({
      'Mã SP': productCode,
      'Mã NVL': code,
      Loại: 'Phần trăm',
      'Giá trị': percent,
      ĐVT: '%'
    });
  }

  if (quantity !== null && !unitIsKg) {
    rows.push({
      'Mã SP': productCode,
      'Mã NVL': code,
      Loại: 'Số lượng',
      'Giá trị': quantity,
      ĐVT: unit || 'Cái'
    });
  }

  if (weightKg !== null) {
    rows.push({
      'Mã SP': productCode,
      'Mã NVL': code,
      Loại: 'Số lượng',
      'Giá trị': weightKg,
      ĐVT: 'Kg'
    });
  } else if (quantity !== null && unitIsKg && percent === null) {
    rows.push({
      'Mã SP': productCode,
      'Mã NVL': code,
      Loại: 'Số lượng',
      'Giá trị': quantity,
      ĐVT: 'Kg'
    });
  }

  if (rows.length === 0) {
    rows.push({
      'Mã SP': productCode,
      'Mã NVL': code,
      Loại: input.amountType === 'quantity' ? 'Số lượng' : 'Phần trăm',
      'Giá trị': '',
      ĐVT: input.amountType === 'quantity' ? unit || 'Cái' : '%'
    });
  }

  return rows;
}

export function downloadProductNplComponentsTemplate(
  items: ProductNplComponentsExportRow[],
  productCode: string
) {
  const sp = productCode || 'MT- MN001';
  const rows: ExcelLoaiRow[] =
    items.length > 0
      ? items.flatMap(item =>
          expandItemToLoaiRows({
            productCode: sp,
            code: item.code,
            amountType: item.amountType,
            percent: item.percent,
            quantity: item.quantity,
            unit: item.unit,
            weightKg: item.weightKg
          })
        )
      : [
          { 'Mã SP': sp, 'Mã NVL': 'NNS 1L', Loại: 'Phần trăm', 'Giá trị': 9.17, ĐVT: '%' },
          { 'Mã SP': sp, 'Mã NVL': 'NNS 1L', Loại: 'Số lượng', 'Giá trị': 0.51, ĐVT: 'Kg' },
          { 'Mã SP': sp, 'Mã NVL': 'T1,08x2,2m', Loại: 'Số lượng', 'Giá trị': 1, ĐVT: 'Cái' },
          { 'Mã SP': sp, 'Mã NVL': 'T1,08x2,2m', Loại: 'Số lượng', 'Giá trị': 0.1333, ĐVT: 'Kg' }
        ];

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ['Mã SP', 'Mã NVL', 'Loại', 'Giá trị', 'ĐVT']
  });
  worksheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 8 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Thanh_phan');
  const safeCode = productCode.replace(/[^\w.-]+/g, '_') || 'san-pham';
  XLSX.writeFile(workbook, `mau-thanh-phan-${safeCode}.xlsx`);
}

export function downloadBulkProductNplComponentsTemplate(rows: BulkProductNplComponentsExportRow[]) {
  const exportRows: ExcelLoaiRow[] =
    rows.length > 0
      ? rows.flatMap(row =>
          expandItemToLoaiRows({
            productCode: row.productCode,
            code: row.componentCode,
            amountType: row.amountType,
            percent: row.percent,
            quantity: row.quantity,
            unit: row.unit,
            weightKg: row.weightKg
          })
        )
      : [
          { 'Mã SP': 'MT- MN001', 'Mã NVL': 'NNS 1L', Loại: 'Phần trăm', 'Giá trị': 9.17, ĐVT: '%' },
          { 'Mã SP': 'MT- MN001', 'Mã NVL': 'NNS 1L', Loại: 'Số lượng', 'Giá trị': 0.51, ĐVT: 'Kg' },
          { 'Mã SP': 'MT- MN001', 'Mã NVL': 'T1,08x2,2m', Loại: 'Số lượng', 'Giá trị': 1, ĐVT: 'Cái' },
          { 'Mã SP': 'MT- MN001', 'Mã NVL': 'T1,08x2,2m', Loại: 'Số lượng', 'Giá trị': 0.1333, ĐVT: 'Kg' }
        ];

  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: ['Mã SP', 'Mã NVL', 'Loại', 'Giá trị', 'ĐVT']
  });
  worksheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 8 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Thanh_phan_SP');
  XLSX.writeFile(workbook, 'mau-thanh-phan-nhieu-san-pham.xlsx');
}

function pickRowValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = aliases.map(alias => normalizeHeader(alias)).filter(Boolean);
  for (const [key, value] of Object.entries(row)) {
    const header = normalizeHeader(key);
    if (normalizedAliases.some(alias => header === alias)) return value;
  }
  for (const [key, value] of Object.entries(row)) {
    const header = normalizeHeader(key);
    if (
      normalizedAliases.some(alias => alias.length >= 4 && (header.includes(alias) || alias.includes(header)))
    ) {
      return value;
    }
  }
  return '';
}

function parseLooseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace('%', '')
    .replace(',', '.');
  if (!text) return NaN;
  const match = text.match(/^[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

type LongFormatAgg = {
  productCode: string;
  componentCode: string;
  percent: number | null;
  quantity: number | null;
  quantityUnit: string;
  weightKg: number | null;
};

/**
 * Parser cấu trúc Excel người dùng:
 * Mã SP | Mã NVL | Loại | Giá trị | ĐVT
 * — gộp theo Mã SP+Mã NVL: Phần trăm+% → %, Số lượng+Cái → SL, Số lượng+Kg → Trọng lượng (giữ nguyên số, không làm tròn).
 * Vẫn hỗ trợ format ngang: Phần trăm | Giá trị | ĐVT (không cột Loại).
 */
export async function parseThanhPhanLongFormatExcel(
  file: File
): Promise<Map<string, Array<{
  code: string;
  amountType: 'percent' | 'quantity';
  percent: number | null;
  quantity: number | null;
  unit: string;
  weightKg: number | null;
}>>> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return new Map();
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return new Map();

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (matrix.length === 0) return new Map();

  // Tìm dòng header trong 15 dòng đầu (file có thể có tiêu đề phía trên).
  let headerRowIndex = 0;
  let headerRow = matrix[0].map(cell => normalizeHeader(cell));
  for (let i = 0; i < Math.min(15, matrix.length); i += 1) {
    const candidate = matrix[i].map(cell => normalizeHeader(cell));
    const hasSp = findColumnIndex(candidate, PRODUCT_CODE_HEADERS) >= 0;
    const hasNvl = findColumnIndex(candidate, [...NVL_CODE_HEADERS, ...CODE_HEADERS]) >= 0;
    const hasLoaiOrValue =
      findColumnIndex(candidate, TYPE_HEADERS) >= 0 ||
      findColumnIndex(candidate, VALUE_HEADERS) >= 0 ||
      findColumnIndex(candidate, UNIT_HEADERS) >= 0;
    if (hasSp && hasNvl && hasLoaiOrValue) {
      headerRowIndex = i;
      headerRow = candidate;
      break;
    }
  }

  const productCodeIndex = findColumnIndex(headerRow, PRODUCT_CODE_HEADERS);
  const nvlCodeIndex = findColumnIndex(headerRow, [...NVL_CODE_HEADERS, ...CODE_HEADERS]);
  const typeIndex = findColumnIndex(headerRow, TYPE_HEADERS);
  const valueIndex = findColumnIndex(headerRow, VALUE_HEADERS);
  const unitIndex = findColumnIndex(headerRow, UNIT_HEADERS);
  const percentColIndex = findColumnIndex(headerRow, ['phan tram', 'phần trăm', 'percent']);

  const hasHeader =
    productCodeIndex >= 0 &&
    nvlCodeIndex >= 0 &&
    (valueIndex >= 0 || percentColIndex >= 0 || typeIndex >= 0);

  const dataRows = hasHeader ? matrix.slice(headerRowIndex + 1) : matrix;
  const pIdx = hasHeader ? productCodeIndex : 0;
  const nIdx = hasHeader ? nvlCodeIndex : 1;
  const tIdx = hasHeader ? typeIndex : 2;
  const vIdx = hasHeader ? (valueIndex >= 0 ? valueIndex : 3) : 3;
  // ĐVT bắt buộc cho dòng Kg — nếu không khớp header thì mặc định cột thứ 5 (index 4).
  const uIdx = hasHeader ? (unitIndex >= 0 ? unitIndex : 4) : 4;
  const hasLoaiCol = tIdx >= 0;
  const hasPercentCol = percentColIndex >= 0 && !hasLoaiCol;

  const aggs = new Map<string, LongFormatAgg>();

  dataRows.forEach((row, offset) => {
    const sheetRowIndex = hasHeader ? headerRowIndex + 1 + offset : offset;
    const productCode = cellToText(row[pIdx]);
    const componentCode = cellToText(row[nIdx]);
    if (!productCode || !componentCode) return;
    if (normalizeCodeKey(productCode) === normalizeCodeKey(componentCode)) return;

    const groupKey = `${normalizeCodeKey(productCode)}__${normalizeCodeKey(componentCode)}`;
    const current = aggs.get(groupKey) || {
      productCode,
      componentCode,
      percent: null,
      quantity: null,
      quantityUnit: '',
      weightKg: null
    };

    const typeRaw = tIdx >= 0 ? cellToText(row[tIdx]) : '';
    const unitRaw = uIdx >= 0 ? cellToText(row[uIdx]) : '';
    const valueCell = readSheetCell(sheet, sheetRowIndex, vIdx >= 0 ? vIdx : 3);
    const matrixValue = vIdx >= 0 ? row[vIdx] : row[3];
    const parsedQty = parseQuantityValueAndUnit(
      valueCell.value !== '' && valueCell.value !== undefined ? valueCell.value : matrixValue
    );
    let value = parsedQty.value;
    if (!Number.isFinite(value)) {
      value = parseLooseNumber(
        valueCell.value !== '' && valueCell.value !== undefined ? valueCell.value : matrixValue
      );
    }
    const unitFromValue = parsedQty.unit;
    const unit = unitRaw || unitFromValue;
    const type = resolveAmountType(typeRaw);

    // Format ngang: cột Phần trăm riêng (không có Loại)
    if (hasPercentCol) {
      const percentCell = readSheetCell(sheet, sheetRowIndex, percentColIndex);
      const percentFromCol = parsePercentCellValue(percentCell);
      if (Number.isFinite(percentFromCol) && percentFromCol >= 0 && percentFromCol <= 100) {
        current.percent = percentFromCol;
      }
      if (Number.isFinite(value) && value >= 0) {
        if (isKgUnit(unit) || !unit) {
          current.weightKg = value;
        } else if (!isPercentUnit(unit)) {
          current.quantity = value;
          current.quantityUnit = unit;
        }
      }
      aggs.set(groupKey, current);
      return;
    }

    // Format chuẩn: Loại | Giá trị | ĐVT — giữ nguyên số Excel (0 vẫn OK, không làm tròn).
    if (!Number.isFinite(value) || value < 0) {
      aggs.set(groupKey, current);
      return;
    }

    const unitIsKg = isKgUnit(unit);
    const typeIsQty = type === 'quantity';
    const typeIsPercent = type === 'percent' || isPercentUnit(unit);

    if (unitIsKg || (typeIsQty && unitIsKg)) {
      current.weightKg = value;
    } else if (typeIsQty && !unit && current.percent !== null) {
      // Dòng Số lượng sau dòng % mà thiếu ĐVT → coi là Kg (hay gặp khi Excel lỗi ĐVT)
      current.weightKg = value;
    } else if (typeIsPercent) {
      if (value <= 100) current.percent = value;
    } else if (typeIsQty || (unit && !isPercentUnit(unit))) {
      current.quantity = value;
      current.quantityUnit = unit || current.quantityUnit || 'Cái';
    } else if (!unit && !type && value <= 100) {
      current.percent = value;
    }

    aggs.set(groupKey, current);
  });

  // Nếu toàn bộ % đang ở thang 0–1 (tổng ≈ 1) → ×100
  const byProductTemp = new Map<string, LongFormatAgg[]>();
  aggs.forEach(agg => {
    const key = normalizeCodeKey(agg.productCode);
    const list = byProductTemp.get(key) || [];
    list.push(agg);
    byProductTemp.set(key, list);
  });
  byProductTemp.forEach(list => {
    const percents = list.map(item => item.percent).filter((v): v is number => v !== null);
    if (percents.length < 2) return;
    const max = Math.max(...percents);
    const sum = percents.reduce((a, b) => a + b, 0);
    if (max <= 1 && sum >= 0.5 && sum <= 1.5) {
      list.forEach(item => {
        if (item.percent !== null) item.percent = item.percent * 100;
      });
    }
  });

  const result = new Map<
    string,
    Array<{
      code: string;
      amountType: 'percent' | 'quantity';
      percent: number | null;
      quantity: number | null;
      unit: string;
      weightKg: number | null;
    }>
  >();

  aggs.forEach(agg => {
    const productKey = normalizeCodeKey(agg.productCode);
    const hasPercent = agg.percent !== null;
    const hasQty = agg.quantity !== null;
    const hasKg = agg.weightKg !== null;

    let amountType: 'percent' | 'quantity' = 'percent';
    let unit = '%';
    if (hasQty) {
      amountType = 'quantity';
      unit = agg.quantityUnit || 'Cái';
    } else if (hasPercent) {
      amountType = 'percent';
      unit = '%';
    } else if (hasKg) {
      amountType = 'quantity';
      unit = 'kg';
    } else {
      return;
    }

    const quantity = hasQty ? agg.quantity : null;
    // Giữ nguyên số Excel (kể cả 0) — không làm tròn khi import.
    const weightKg =
      agg.weightKg !== null
        ? agg.weightKg
        : unit === 'kg' || isKgUnit(unit)
          ? quantity !== null
            ? quantity
            : null
          : null;

    const item = {
      code: agg.componentCode,
      amountType,
      percent: agg.percent,
      quantity,
      unit: amountType === 'percent' ? '%' : unit,
      weightKg
    };

    const list = result.get(productKey) || [];
    list.push(item);
    result.set(productKey, list);
  });

  return result;
}

/** Một dòng Excel thô → bảng staging `import_sp` (không gộp %/Cái/Kg). */
export type ImportSpExcelRow = {
  ma_sp: string;
  ma_nvl: string;
  ten_nvl: string | null;
  loai: string | null;
  gia_tri: number | null;
  dvt: string | null;
  phan_tram: number | null;
  so_luong: number | null;
  khoi_luong_kg: number | null;
  don_vi: string | null;
  so_dong_excel: number;
};

/**
 * Đọc Excel định mức NVL từng dòng (Mã SP | Mã NVL | Loại | Giá trị | ĐVT)
 * → đổ thẳng `import_sp`. Giữ nguyên số (kể cả 0), không làm tròn.
 */
export async function parseImportSpExcelRows(file: File): Promise<ImportSpExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellNF: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (matrix.length === 0) return [];

  let headerRowIndex = 0;
  let headerRow = matrix[0].map(cell => normalizeHeader(cell));
  for (let i = 0; i < Math.min(15, matrix.length); i += 1) {
    const candidate = matrix[i].map(cell => normalizeHeader(cell));
    const hasSp = findColumnIndex(candidate, PRODUCT_CODE_HEADERS) >= 0;
    const hasNvl = findColumnIndex(candidate, [...NVL_CODE_HEADERS, ...CODE_HEADERS]) >= 0;
    const hasLoaiOrValue =
      findColumnIndex(candidate, TYPE_HEADERS) >= 0 ||
      findColumnIndex(candidate, VALUE_HEADERS) >= 0 ||
      findColumnIndex(candidate, UNIT_HEADERS) >= 0;
    if (hasSp && hasNvl && hasLoaiOrValue) {
      headerRowIndex = i;
      headerRow = candidate;
      break;
    }
  }

  const productCodeIndex = findColumnIndex(headerRow, PRODUCT_CODE_HEADERS);
  const nvlCodeIndex = findColumnIndex(headerRow, [...NVL_CODE_HEADERS, ...CODE_HEADERS]);
  const typeIndex = findColumnIndex(headerRow, TYPE_HEADERS);
  const valueIndex = findColumnIndex(headerRow, VALUE_HEADERS);
  const unitIndex = findColumnIndex(headerRow, UNIT_HEADERS);
  const nameIndex = findColumnIndex(headerRow, ['ten nvl', 'ten_nvl', 'ten npl', 'ten hang']);

  const hasHeader =
    productCodeIndex >= 0 &&
    nvlCodeIndex >= 0 &&
    (valueIndex >= 0 || typeIndex >= 0);

  const dataRows = hasHeader ? matrix.slice(headerRowIndex + 1) : matrix;
  const pIdx = hasHeader ? productCodeIndex : 0;
  const nIdx = hasHeader ? nvlCodeIndex : 1;
  const tIdx = hasHeader ? typeIndex : 2;
  const vIdx = hasHeader ? (valueIndex >= 0 ? valueIndex : 3) : 3;
  const uIdx = hasHeader ? (unitIndex >= 0 ? unitIndex : 4) : 4;
  const nameIdx = hasHeader ? nameIndex : -1;

  const out: ImportSpExcelRow[] = [];

  dataRows.forEach((row, offset) => {
    const sheetRowIndex = hasHeader ? headerRowIndex + 1 + offset : offset;
    const ma_sp = cellToText(row[pIdx]);
    const ma_nvl = cellToText(row[nIdx]);
    if (!ma_sp || !ma_nvl) return;
    if (normalizeCodeKey(ma_sp) === normalizeCodeKey(ma_nvl)) return;

    const loaiRaw = tIdx >= 0 ? cellToText(row[tIdx]) : '';
    const dvtRaw = uIdx >= 0 ? cellToText(row[uIdx]) : '';
    const valueCell = readSheetCell(sheet, sheetRowIndex, vIdx >= 0 ? vIdx : 3);
    const matrixValue = vIdx >= 0 ? row[vIdx] : row[3];
    const parsedQty = parseQuantityValueAndUnit(
      valueCell.value !== '' && valueCell.value !== undefined ? valueCell.value : matrixValue
    );
    let gia_tri = parsedQty.value;
    if (!Number.isFinite(gia_tri)) {
      gia_tri = parseLooseNumber(
        valueCell.value !== '' && valueCell.value !== undefined ? valueCell.value : matrixValue
      );
    }
    if (!Number.isFinite(gia_tri) || gia_tri < 0) return;

    const dvt = dvtRaw || parsedQty.unit || null;
    const type = resolveAmountType(loaiRaw);
    const unitIsKg = isKgUnit(dvt || '');
    const typeIsPercent = type === 'percent' || isPercentUnit(dvt || '');
    const typeIsQty = type === 'quantity' || (!typeIsPercent && Boolean(dvt));

    let phan_tram: number | null = null;
    let so_luong: number | null = null;
    let khoi_luong_kg: number | null = null;
    let don_vi: string | null = dvt;

    if (unitIsKg) {
      khoi_luong_kg = gia_tri;
      so_luong = 0;
      don_vi = 'kg';
    } else if (typeIsPercent || isPercentUnit(dvt || '')) {
      phan_tram = gia_tri;
      don_vi = '%';
    } else if (type === 'quantity' && !dvt) {
      // Mẫu định mức: dòng «Số lượng» thiếu ĐVT=Kg → coi là trọng lượng kg.
      khoi_luong_kg = gia_tri;
      so_luong = 0;
      don_vi = 'kg';
    } else if (typeIsQty) {
      so_luong = gia_tri;
      don_vi = dvt || 'Cái';
    } else {
      phan_tram = gia_tri <= 100 ? gia_tri : null;
      so_luong = gia_tri > 100 ? gia_tri : null;
    }

    const ten_nvl = nameIdx >= 0 ? cellToText(row[nameIdx]) || null : null;

    out.push({
      ma_sp,
      ma_nvl,
      ten_nvl,
      loai: loaiRaw || (unitIsKg || typeIsQty ? 'Số lượng' : 'Phần trăm'),
      gia_tri,
      dvt,
      phan_tram,
      so_luong,
      khoi_luong_kg,
      don_vi,
      so_dong_excel: sheetRowIndex + 1
    });
  });

  return out;
}
