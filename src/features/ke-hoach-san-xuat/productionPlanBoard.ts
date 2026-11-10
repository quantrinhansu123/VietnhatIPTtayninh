import type { OrderProductLine } from '../_shared/productionProductHelpers';
import { parseProductionCShift } from '../../utils/shiftSettings';
import { formatNumber } from '../../utils';
import {
  findProductByCode,
  parseProductSpecNumber,
  resolveProductMaterialBaseKg
} from '../san-pham';
import type { ProductRow } from '../san-pham/types';

/** Một dòng lệnh SX đủ dữ liệu để dựng bảng Kế hoạch SX theo máy. */
export type ProductionPlanBoardLine = {
  id: string;
  orderCode: string;
  /** Tên máy đã hiển thị (cột máy trên bảng). */
  machine: string;
  shift: string;
  staff: string;
  note: string;
  products: OrderProductLine[];
};

export type ProductionPlanBoardPart = {
  text: string;
  /** 'weight' = khối lượng quy cách (in đỏ như file Excel của nhà máy). */
  tone?: 'weight';
};

export type ProductionPlanBoardCellItem = {
  id: string;
  orderCode: string;
  parts: ProductionPlanBoardPart[];
};

export type ProductionPlanBoardColumn = {
  key: string;
  label: string;
};

export type ProductionPlanBoardRow =
  | { kind: 'labor'; key: string; shiftLabel: string; cells: Record<string, string[]> }
  | { kind: 'shiftTitle'; key: string; shiftLabel: string }
  | { kind: 'orders'; key: string; cells: Record<string, ProductionPlanBoardCellItem[]> }
  | { kind: 'blank'; key: string };

export type ProductionPlanBoardBlock =
  | { kind: 'labor'; key: string; rows: ProductionPlanBoardRow[] }
  | { kind: 'shift'; key: string; shiftLabel: string; rows: ProductionPlanBoardRow[] };

export type ProductionPlanBoard = {
  columns: ProductionPlanBoardColumn[];
  blocks: ProductionPlanBoardBlock[];
  lineCount: number;
};

const EMPTY_MACHINE_LABEL = 'Chưa gán máy';

export function normalizeBoardMachineLabel(value: string) {
  const trimmed = String(value ?? '').trim();
  return trimmed && trimmed !== '-' ? trimmed : EMPTY_MACHINE_LABEL;
}

/** "12C1" → "C1"; "C2" → "C2"; ca chữ (HC…) giữ nguyên. */
export function formatBoardShiftLabel(shift: string) {
  const raw = String(shift ?? '').trim();
  if (!raw || raw === '-') return '';
  const parsed = parseProductionCShift(raw);
  if (parsed) return `C${parsed.num}`;
  return raw.toUpperCase();
}

function trimNumber(value: number, fractionDigits = 2) {
  return formatNumber(value, fractionDigits);
}

/** 1.5 → "1.5"; 7 → "7"; 7.12 → "7.12" */
function formatSpecNumber(value: number | null, fractionDigits = 2) {
  if (value === null || !Number.isFinite(value) || value <= 0) return '';
  return trimNumber(value, fractionDigits);
}

/**
 * Quy cách cắt khúc trong tên SP: "CK (50cm x 3)", "(30cmx4 +20cm)" → "50 X 3", "30 X 4 + 20".
 * Đây là phần "50 X 3" trong ô Excel: "BB 1.5M 95M 7.12KG 50 X 3 = 32".
 */
export function extractBoardCutSpec(productName: string) {
  const name = String(productName ?? '').trim();
  if (!name) return '';
  const parenthesized = name.match(/\(([^)]*\d\s*(?:cm|CM)[^)]*)\)/);
  const raw = parenthesized?.[1] || '';
  if (!raw) return '';
  const normalized = raw
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(\d+(?:[.,]\d+)?)cm/g, '$1')
    .replace(/(\d+(?:[.,]\d+)?)m(?!m)/g, '$1')
    .replace(/x/g, 'x');
  const tokens = normalized
    .replace(/([+])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean)
    .map(token => (token === 'x' ? 'X' : token.toUpperCase()));
  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

/** "2 TÚI" trong tên SP (bỏ qua "không túi"). */
export function extractBoardBagCount(productName: string) {
  const name = String(productName ?? '').trim();
  if (!name) return '';
  const match = name.match(/(\d+)\s*t[úu]i/i);
  if (!match) return '';
  return `${match[1]} TÚI`;
}

export function isBoardNoCoreProduct(productName: string) {
  return /kh[ôo]ng\s*l[õo]i/i.test(String(productName ?? ''));
}

function resolveBoardPrefix(machineLabel: string, productName: string) {
  const name = String(productName ?? '').trim();
  if (/^t[úu]i\b/i.test(name)) return 'TÚI';
  const machine = String(machineLabel ?? '').trim();
  if (/t[úu]i/i.test(machine)) return 'TÚI';
  if (/bao\s*b[ìi]/i.test(machine) || /^bb\b/i.test(machine)) return 'BB';
  if (/^m[àa]ng\b/i.test(name)) return 'BB';
  return '';
}

/** Dựng nội dung 1 ô: "BB 1.5M 95M 7.12KG KHÔNG LÕI 50 X 3 = 32". */
export function buildBoardCellParts(
  line: ProductionPlanBoardLine,
  products: ProductRow[] = []
): ProductionPlanBoardPart[] {
  const productLine = line.products[0];
  const productCode = productLine?.productCode || '';
  const catalogProduct = productCode ? findProductByCode(products, productCode) : null;
  const productName = catalogProduct?.name || productLine?.productName || '';
  const quantity = Number(String(productLine?.quantity ?? '').replace(/\./g, '').replace(',', '.')) || 0;

  const parts: ProductionPlanBoardPart[] = [];
  const push = (text: string, tone?: 'weight') => {
    const value = String(text ?? '').trim();
    if (value) parts.push({ text: value, tone });
  };

  const prefix = resolveBoardPrefix(line.machine, productName);
  const width = formatSpecNumber(parseProductSpecNumber(catalogProduct?.rollWidth ?? ''));
  const length = formatSpecNumber(parseProductSpecNumber(catalogProduct?.rollLength ?? ''));
  const weightSource =
    parseProductSpecNumber(catalogProduct?.totalWeight ?? '') ??
    (catalogProduct ? resolveProductMaterialBaseKg(catalogProduct) : 0);

  push(prefix);
  if (width) push(`${width}M`);
  if (length) push(`${length}M`);
  if (weightSource && weightSource > 0) push(`${formatSpecNumber(weightSource, 2)}KG`, 'weight');
  if (isBoardNoCoreProduct(productName)) push('KHÔNG LÕI');
  push(extractBoardBagCount(productName));
  push(extractBoardCutSpec(productName));
  const note = String(line.note ?? '').trim();
  if (note && note !== '-') push(note);
  if (quantity > 0) {
    push('=');
    push(trimNumber(quantity, 2));
  }

  if (parts.length === 0) {
    push(
      productCode
        ? `${productCode}${productLine?.quantity ? ` = ${productLine.quantity}` : ''}`
        : line.orderCode || '-'
    );
  }

  return parts;
}

function compareBoardColumn(a: string, b: string) {
  return a.localeCompare(b, 'vi', { numeric: true });
}

function collectMachineColumns(
  lines: ProductionPlanBoardLine[],
  extraMachines: string[] = []
): string[] {
  const used = new Set<string>();
  lines.forEach(line => used.add(normalizeBoardMachineLabel(line.machine)));
  extraMachines.forEach(machine => {
    const label = normalizeBoardMachineLabel(machine);
    if (label) used.add(label);
  });
  return [...used].sort(compareBoardColumn);
}

function uniqueStaffList(staff: string) {
  return String(staff ?? '')
    .split(/\s*[-–—/,;]\s*|\s{2,}/)
    .map(name => name.trim())
    .filter(name => Boolean(name) && name !== '-');
}

export function buildProductionPlanBoard({
  lines,
  products = [],
  extraMachines = [],
  blankRowsPerShift = 3
}: {
  lines: ProductionPlanBoardLine[];
  products?: ProductRow[];
  extraMachines?: string[];
  blankRowsPerShift?: number;
}): ProductionPlanBoard {
  const columns = collectMachineColumns(lines, extraMachines).map(label => {
    const matching = lines.find(line => normalizeBoardMachineLabel(line.machine) === label);
    return {
      key: label,
      label: matching ? label : `${label} ·`
    };
  });

  const shiftBuckets = new Map<string, ProductionPlanBoardLine[]>();
  lines.forEach(line => {
    const shiftKey = formatBoardShiftLabel(line.shift) || 'Chưa có ca';
    if (!shiftBuckets.has(shiftKey)) shiftBuckets.set(shiftKey, []);
    shiftBuckets.get(shiftKey)!.push(line);
  });
  // Ca lớn trước (CA 2 → CA 1) như file Excel nhà máy.
  const shiftKeys = [...shiftBuckets.keys()].sort((a, b) => compareBoardColumn(b, a));

  /* ---------- Khối I: Lao động ---------- */
  const laborRows: ProductionPlanBoardRow[] = [];
  const laborRowIndex = new Map<string, { shiftLabel: string; staff: string }>();
  const laborOrder: Array<{ shiftLabel: string; staff: string }> = [];
  lines.forEach(line => {
    const shiftLabel = formatBoardShiftLabel(line.shift) || '-';
    const staff = uniqueStaffList(line.staff).join(' - ');
    if (!staff) return;
    const key = `${shiftLabel}|${staff}`;
    if (laborRowIndex.has(key)) return;
    laborRowIndex.set(key, { shiftLabel, staff });
    laborOrder.push({ shiftLabel, staff });
  });
  laborOrder
    .sort((a, b) => compareBoardColumn(a.shiftLabel, b.shiftLabel) || compareBoardColumn(a.staff, b.staff))
    .forEach(({ shiftLabel, staff }, index) => {
      const cells: Record<string, string[]> = {};
      columns.forEach(column => {
        const matching = lines.filter(line => {
          if (normalizeBoardMachineLabel(line.machine) !== column.key) return false;
          if ((formatBoardShiftLabel(line.shift) || '-') !== shiftLabel) return false;
          return uniqueStaffList(line.staff).join(' - ') === staff;
        });
        if (matching.length > 0) {
          cells[column.key] = matching.map(
            line => `${formatBoardShiftLabel(line.shift) || line.shift || '-'}: ${staff}`
          );
        }
      });
      laborRows.push({
        kind: 'labor',
        key: `labor-${index}-${shiftLabel}-${staff}`,
        shiftLabel,
        cells
      });
    });
  if (laborRows.length === 0) {
    laborRows.push({ kind: 'blank', key: 'labor-blank-0' });
  }

  /* ---------- Khối II: Lệnh SX theo ca ---------- */
  const shiftBlocks: ProductionPlanBoardBlock[] = shiftKeys.map(shiftKey => {
    const shiftLines = shiftBuckets.get(shiftKey) ?? [];
    const cellsByColumn = new Map<string, ProductionPlanBoardCellItem[]>();
    columns.forEach(column => {
      const columnLines = shiftLines
        .filter(line => normalizeBoardMachineLabel(line.machine) === column.key)
        .sort((a, b) => compareBoardColumn(a.orderCode, b.orderCode));
      cellsByColumn.set(
        column.key,
        columnLines.map(line => ({
          id: `${line.id}-${line.products[0]?.productCode ?? ''}`,
          orderCode: line.orderCode,
          parts: buildBoardCellParts(line, products)
        }))
      );
    });
    const rowCount = Math.max(0, ...[...cellsByColumn.values()].map(items => items.length));
    const rows: ProductionPlanBoardRow[] = [
      { kind: 'shiftTitle', key: `shift-title-${shiftKey}`, shiftLabel: shiftKey }
    ];
    if (rowCount === 0) {
      rows.push({ kind: 'blank', key: `shift-empty-${shiftKey}` });
    }
    for (let index = 0; index < rowCount; index += 1) {
      const cells: Record<string, ProductionPlanBoardCellItem[]> = {};
      columns.forEach(column => {
        const item = cellsByColumn.get(column.key)?.[index];
        if (item) cells[column.key] = [item];
      });
      rows.push({ kind: 'orders', key: `shift-${shiftKey}-row-${index}`, cells });
    }
    for (let index = 0; index < blankRowsPerShift; index += 1) {
      rows.push({ kind: 'blank', key: `shift-blank-${shiftKey}-${index}` });
    }
    return { kind: 'shift' as const, key: `block-${shiftKey}`, shiftLabel: shiftKey, rows };
  });

  return {
    columns,
    blocks: [
      { kind: 'labor', key: 'block-labor', rows: laborRows },
      ...shiftBlocks
    ],
    lineCount: lines.length
  };
}

/** Gom lệnh SX đã lưu (line kế hoạch) thành dòng bảng. */
export function toBoardLines<
  T extends {
    id: string;
    orderCode: string;
    machine: string;
    position: string;
    shift: string;
    staff: string;
    note: string;
    products: OrderProductLine[];
  }
>(lines: T[]): ProductionPlanBoardLine[] {
  return lines.map(line => ({
    id: line.id,
    orderCode: line.orderCode,
    machine: normalizeBoardMachineLabel(line.machine !== '-' ? line.machine : line.position),
    shift: line.shift,
    staff: line.staff,
    note: line.note,
    products: line.products
  }));
}
