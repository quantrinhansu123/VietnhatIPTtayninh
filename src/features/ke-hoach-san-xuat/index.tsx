import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import { RowActionsMenu } from '../../components/shared/table';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';
import { pickText, fileToDataUrl, uploadImage, formatCell } from '../_shared/recordHelpers';
import { formatDateDdMmYyyy, parseDateToIso } from '../../utils/dateFormat';
import { DateInput } from '../../components/shared/DateInput';
import { SearchableSelect, SimpleSelect } from '../../components/shared/SearchableSelect';
import { SearchableProductCodeField } from '../../components/shared/SearchableProductCodeField';
import ProductionPlanNvlPrintSheet, { type ProductionPlanNvlPrintShiftGroup } from '../../components/ProductionPlanNvlPrintSheet';
import { RepeatableLineRow, RepeatableLinesBlock } from '../../components/RepeatableLinesBlock';
import {
  loadProductionPlanRelatedReports,
  ProductionPlanRelatedPrintContent,
  collectProductionPlanOrderRefs,
  resolveCustomerOrdersForPrint,
  type ProductionPlanRelatedReports
} from './relatedReportsPrint';
import PhanCongCvPanel from './PhanCongCvPanel';
import OrderPrintSheet from '../../components/OrderPrintSheet';
import { getProductionShiftOptions, normalizeShiftSettings, shiftNamesMatch, type ShiftOption } from '../../utils/shiftSettings';
import { STORAGE_WAREHOUSE_SLIP_DRAFT_KEY } from '../_shared/storageKeys';
import { sortWarehouseLinesKgFirst, type WarehouseSlipPrefillDraft } from '../phieu-xuat-nhap-kho';
import { STANDARD_SHIFTS } from '../../types';
import { normalizeHrBranches, type HrBranch, type HrMember } from '../_shared/hr';
import { ControlBoardShiftSummaryPrintBatch } from '../../components/ControlBoardShiftSummaryPrintSheet';
import { buildControlBoardShiftSummary, type ControlBoardShiftSummaryRow } from '../../utils/controlBoardShiftSummary';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../../utils/printReady';
import {
  normalizeProducts,
  findProductByCode,
  normalizeProductCodeKey,
  parseProductSpecNumber,
  resolveProductMaterialBaseKg
} from '../san-pham';
import type { ProductRow, ProductNplItem } from '../san-pham/types';
import { roundNplNumber } from '../san-pham/types';
import { normalizeMaterialsInventory, parseInventoryNumber, type MaterialRow } from '../kho-nvl';
import {
  parseOrderProductsFromRecord,
  summarizeOrderProducts,
  getOrderProductLines,
  formatOrderProductsSummary,
  type OrderRow
} from '../_shared/orderRecordHelpers';
import {
  expandMergedProductionProducts,
  expandProductionOrderProductLines,
  splitProductionProductCodes,
  splitProductionProductNames,
  splitProductionFieldValues,
  type OrderProductLine
} from '../_shared/productionProductHelpers';
import {
  findMachineByRef,
  machineSelectValue,
  normalizeMachines,
  renderMachineSelect,
  resolveMachineDisplayValue,
  type MachineRow
} from '../danh-sach-may';
import { normalizeOrders } from '../don-hang';
import { OrderFormModal } from '../don-hang/OrderFormModal';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import { orderFieldClass } from '../_shared/orderHelpers';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpFromLine,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Eye,
  GripVertical,
  Loader2,
  Plus,
  Pencil,
  Printer,
  QrCode,
  Save,
  Search,
  Trash2,
  Users,
  X
} from 'lucide-react';

export {
  expandMergedProductionProducts,
  expandProductionOrderProductLines,
  splitProductionProductCodes,
  splitProductionProductNames,
  splitProductionFieldValues
} from '../_shared/productionProductHelpers';

export interface ProductionOrderRow {
  id: string;
  code: string;
  name: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  products: OrderProductLine[];
  status: string;
  customer: string;
  orderRef: string;
  /** Cột `ngay` trên lenh_sx — dùng cho nhóm ngày / KH SX / in. */
  startDate: string;
  endDate: string;
  /** Raw `ngay_gio_bat_dau` — chỉ dùng giờ bắt đầu trên form. */
  startAt: string;
  /** Raw `ngay_gio_ket_thuc` — chỉ dùng giờ kết thúc trên form. */
  endAt: string;
  createdAt: string;
  machine: string;
  shift: string;
  staff: string;
  shiftLead: string;
  mainStaff: string;
  assistantStaff: string;
  traineeStaff: string;
  note: string;
  position: string;
  priority: number;
  daIn?: boolean;
}

export function resolveProductionOrderMachine(row: ProductionOrderRow, machines: MachineRow[] = []): string {
  const machineRef = row.machine !== '-' ? row.machine : row.position !== '-' ? row.position : '';
  return resolveMachineDisplayValue(machineRef, machines) || machineRef || '-';
}

export function compareProductionOrderPriority(a: ProductionOrderRow, b: ProductionOrderRow): number {
  const priorityA = a.priority > 0 ? a.priority : Number.MAX_SAFE_INTEGER;
  const priorityB = b.priority > 0 ? b.priority : Number.MAX_SAFE_INTEGER;
  if (priorityA !== priorityB) return priorityA - priorityB;

  const idA = Number(a.id);
  const idB = Number(b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idB - idA;
  }

  return `${b.startDate} ${b.code}`.localeCompare(`${a.startDate} ${a.code}`, 'vi');
}

export function isActiveProductionPlanOrder(row: ProductionOrderRow) {
  return /đang|chờ|cho|active|sx/i.test(row.status);
}

export type ProductionPlanLine = {
  id: string;
  code: string;
  name: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  products: OrderProductLine[];
  status: string;
  orderRef: string;
  position: string;
  staff: string;
  shiftLead: string;
  mainStaff: string;
  assistantStaff: string;
  traineeStaff: string;
  shift: string;
  priority: number;
  note: string;
};

export function getProductionOrderProductLines(row: Pick<ProductionOrderRow, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>): OrderProductLine[] {
  if (row.products.length > 0) {
    return expandProductionOrderProductLines(row.products);
  }
  if (!row.productCode && !row.productName) return [];
  return expandMergedProductionProducts(
    row.productCode,
    row.productName,
    row.unit,
    row.quantity
  );
}

export function getProductionPlanProductCodes(
  line: Pick<ProductionPlanLine, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>
) {
  return getProductionOrderProductLines(line)
    .map(product => product.productCode.trim())
    .filter(code => code && code !== '-');
}

export function formatProductionPlanProductCodes(
  line: Pick<ProductionPlanLine, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>
) {
  const codes = getProductionPlanProductCodes(line);
  return codes.length > 0 ? codes.join(', ') : '-';
}

export function getProductionPlanLineMaterialKeys(line: ProductionPlanLine): string[] {
  if (line.products.length > 1) {
    return line.products.map(product => `${line.id}__${product.productCode}`);
  }
  return [line.id];
}

export function getProductionPlanLineMaterials(
  line: ProductionPlanLine,
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionOrderMaterialLine[] {
  const merged = new Map<string, ProductionOrderMaterialLine>();

  getProductionPlanLineMaterialKeys(line).forEach(key => {
    (materialsByLine[key] ?? []).forEach(material => {
      const mergeKey = `${normalizeProductCodeKey(material.code)}__${material.unit || '-'}`;
      const existing = merged.get(mergeKey);
      if (existing) {
        existing.proposedQuantity = roundNplNumber(existing.proposedQuantity + material.proposedQuantity);
      } else {
        merged.set(mergeKey, { ...material });
      }
    });
  });

  return [...merged.values()];
}

export function formatProductionOrderProductsSummary(row: Pick<ProductionOrderRow, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>) {
  const products = getProductionOrderProductLines(row);
  if (products.length === 0) return '-';
  if (products.length === 1) {
    const product = products[0];
    return `${product.productCode || '-'} · ${product.productName || '-'} · ${product.quantity}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''}`;
  }
  return products
    .map(product => `${product.productCode || '-'} (${product.quantity}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''})`)
    .join(' | ');
}

export function productionOrderToPlanLine(
  row: ProductionOrderRow,
  priority: number,
  machines: MachineRow[] = []
): ProductionPlanLine {
  const products = getProductionOrderProductLines(row);
  const primaryProduct = products[0];

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    productCode: primaryProduct?.productCode ?? row.productCode,
    productName: primaryProduct?.productName ?? row.productName,
    quantity: primaryProduct?.quantity ?? row.quantity,
    unit: primaryProduct?.unit ?? row.unit,
    products,
    status: row.status,
    orderRef: row.orderRef,
    position: resolveProductionOrderMachine(row, machines),
    staff: row.staff,
    shiftLead: row.shiftLead,
    mainStaff: row.mainStaff,
    assistantStaff: row.assistantStaff,
    traineeStaff: row.traineeStaff,
    shift: row.shift,
    priority,
    note: row.note
  };
}

export function buildInitialProductionPlanLines(
  productionOrders: ProductionOrderRow[],
  machines: MachineRow[] = [],
  planDate = ''
): ProductionPlanLine[] {
  const targetDate = parseProductionOrderFilterDate(planDate);
  return productionOrders
    .filter(isActiveProductionPlanOrder)
    .filter(row => {
      if (!targetDate) return true;
      const orderDate = parseProductionOrderFilterDate(row.startDate);
      return Boolean(orderDate) && orderDate === targetDate;
    })
    .sort(compareProductionOrderPriority)
    .map((row, index) => productionOrderToPlanLine(row, row.priority > 0 ? row.priority : index + 1, machines));
}

export function isProductionOrderUsedInSavedPlan(
  row: Pick<ProductionOrderRow, 'id' | 'code'>,
  usedLenhSxIds: Set<string>,
  usedOrderCodes: Set<string>
) {
  const orderId = String(row.id || '').trim();
  if (orderId && usedLenhSxIds.has(orderId)) return true;
  const orderCode = String(row.code || '').trim();
  return Boolean(orderCode) && usedOrderCodes.has(orderCode);
}

/** Lệnh SX còn có thể chọn khi lập kế hoạch mới (đúng ngày lệnh SX, chưa nằm trong KH đã lưu). */
export function getAvailableProductionPlanOrders(
  productionOrders: ProductionOrderRow[],
  planDate: string,
  usedLenhSxIds: Set<string>,
  usedOrderCodes: Set<string>,
  alwaysIncludeIds: Set<string> = new Set()
): ProductionOrderRow[] {
  // Chuẩn hóa về YYYY-MM-DD để khớp cột Ngày lệnh SX (không dùng ngày tạo).
  const targetDate = parseProductionOrderFilterDate(planDate);
  return productionOrders
    .filter(isActiveProductionPlanOrder)
    .filter(row => {
      if (!targetDate) return true;
      const orderDate = parseProductionOrderFilterDate(row.startDate);
      return Boolean(orderDate) && orderDate === targetDate;
    })
    .filter(row => alwaysIncludeIds.has(row.id) || !isProductionOrderUsedInSavedPlan(row, usedLenhSxIds, usedOrderCodes))
    .sort(compareProductionOrderPriority);
}

export async function loadUsedProductionPlanOrderRefs(excludePlanId = ''): Promise<{
  usedLenhSxIds: Set<string>;
  usedOrderCodes: Set<string>;
}> {
  const params = new URLSearchParams({ usedLenhSx: '1' });
  if (excludePlanId) params.set('excludePlanId', excludePlanId);
  const res = await fetch(`/api/ke-hoach-sx?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Không thể tải danh sách lệnh đã lập kế hoạch.');
  }
  return {
    usedLenhSxIds: new Set(
      (Array.isArray(data.usedLenhSxIds) ? data.usedLenhSxIds : [])
        .map((value: unknown) => String(value ?? '').trim())
        .filter(Boolean)
    ),
    usedOrderCodes: new Set(
      (Array.isArray(data.usedOrderCodes) ? data.usedOrderCodes : [])
        .map((value: unknown) => String(value ?? '').trim())
        .filter(Boolean)
    )
  };
}

/** Ngày kế hoạch mặc định = ngày (cột Ngày lệnh SX) xuất hiện nhiều nhất trong lệnh đã chọn. */
export function resolveDefaultProductionPlanDate(
  productionOrders: ProductionOrderRow[],
  fallback = todayDateInputValue()
): string {
  const counts = new Map<string, number>();
  for (const row of productionOrders) {
    // Chỉ lấy cột Ngày lệnh SX — không dùng created_at / ngày tạo.
    const date = parseProductionOrderFilterDate(row.startDate);
    if (!date) continue;
    counts.set(date, (counts.get(date) || 0) + 1);
  }
  if (counts.size === 0) return parseProductionOrderFilterDate(fallback) || todayDateInputValue();
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
}

export function enrichProductionPlanLines(
  planLines: ProductionPlanLine[],
  productionOrders: ProductionOrderRow[],
  machines: MachineRow[] = []
): ProductionPlanLine[] {
  const sourceById = new Map(productionOrders.map(row => [row.id, row]));

  return planLines.map(line => {
    const source = sourceById.get(line.id);
    if (!source) return line;

    return {
      ...productionOrderToPlanLine(source, line.priority, machines),
      note: line.note
    };
  });
}

function findProductionOrderForPlanLine(
  line: Pick<ProductionPlanLine, 'id' | 'code'>,
  productionOrders: ProductionOrderRow[]
): ProductionOrderRow | undefined {
  const lineId = String(line.id || '').trim();
  if (lineId) {
    const byId = productionOrders.find(order => order.id === lineId);
    if (byId) return byId;
  }

  const lineCode = String(line.code || '').trim().toLocaleLowerCase('vi');
  if (!lineCode || lineCode === '-') return undefined;
  return productionOrders.find(
    order => String(order.code || '').trim().toLocaleLowerCase('vi') === lineCode
  );
}

export type ProductionPlanPrintGroup = {
  machine: string;
  lines: ProductionPlanLine[];
};

export function buildProductionPlanPrintGroups(lines: ProductionPlanLine[]): ProductionPlanPrintGroup[] {
  const map = new Map<string, ProductionPlanLine[]>();

  lines.forEach(line => {
    const machine = line.position.trim() || 'Chưa gán máy';
    if (!map.has(machine)) map.set(machine, []);
    map.get(machine)!.push(line);
  });

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([machine, groupLines]) => ({
      machine,
      lines: [...groupLines].sort((a, b) => a.priority - b.priority)
    }));
}

export type ProductionPlanPrintRow = {
  stt: number;
  line: ProductionPlanLine;
  machine: string;
  machineRowSpan: number;
};

export function buildProductionPlanPrintRows(lines: ProductionPlanLine[]): ProductionPlanPrintRow[] {
  const groups = buildProductionPlanPrintGroups(lines);
  const rows: ProductionPlanPrintRow[] = [];

  groups.forEach(group => {
    group.lines.forEach((line, index) => {
      rows.push({
        stt: rows.length + 1,
        line,
        machine: group.machine,
        machineRowSpan: index === 0 ? group.lines.length : 0
      });
    });
  });

  return rows;
}

function formatProductionPlanPrintDate(value: string) {
  const formatted = formatDateDdMmYyyy(value);
  return formatted === '-' ? formatDateDdMmYyyy(new Date()) : formatted;
}

export function ProductionPlanPrintSheet({
  lines,
  materialsByLine: _materialsByLine,
  planDate = '',
  planNote = ''
}: {
  lines: ProductionPlanLine[];
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>;
  planDate?: string;
  planNote?: string;
}) {
  const printRows = buildProductionPlanPrintRows(lines);
  const printDate = formatProductionPlanPrintDate(planDate);
  const machineCount = new Set(printRows.map(row => row.machine)).size;
  const staffCount = new Set(
    lines.flatMap(line => splitProductionOrderStaffNames(line.staff))
  ).size;

  return (
    <div className="production-plan-print-sheet">
      <div className="production-plan-print-doc">
        <header className="production-plan-print-header">
          <div className="production-plan-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-plan-print-logo" />
            <div className="production-plan-print-company">
              <p className="production-plan-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <div className="production-plan-print-title-wrap">
            <h1>KẾ HOẠCH SẢN XUẤT</h1>
            <p>PHIẾU PHÂN CÔNG SẢN XUẤT THEO NGÀY</p>
          </div>
          <div className="production-plan-print-date">
            <span>Ngày lập</span>
            <strong>{printDate}</strong>
          </div>
        </header>

        <table className="production-plan-nvl-print-meta-table">
          <tbody>
            <tr>
              <th>Ngày kế hoạch</th>
              <td>{printDate}</td>
              <th>Số máy</th>
              <td>{machineCount}</td>
            </tr>
            <tr>
              <th>Số lệnh SX</th>
              <td>{printRows.length}</td>
              <th>Số nhân sự</th>
              <td>{staffCount}</td>
            </tr>
            {planNote.trim() ? (
              <tr>
                <th>Ghi chú</th>
                <td colSpan={3}>{planNote.trim()}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <table className="production-plan-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên máy</th>
              <th>Ca làm việc</th>
              <th>Nhân sự</th>
              <th>Lệnh sản xuất</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map(row => {
              const products = getProductionOrderProductLines(row.line);
              const orderCode = String(row.line.code || '').trim() || '-';

              return (
                <tr key={row.line.id}>
                  <td className="production-plan-print-center">{row.stt}</td>
                  {row.machineRowSpan > 0 && (
                    <td rowSpan={row.machineRowSpan} className="production-plan-print-merged">
                      {row.machine}
                    </td>
                  )}
                  <td>{row.line.shift && row.line.shift !== '-' ? row.line.shift : '-'}</td>
                  <td>
                    {(() => {
                      const staffLines = [
                        ...splitProductionOrderStaffNames(row.line.shiftLead).map(name => 'Trưởng ca: ' + name),
                        ...splitProductionOrderStaffNames(row.line.mainStaff).map(name => 'Thợ chính: ' + name),
                        ...splitProductionOrderStaffNames(row.line.assistantStaff).map(name => 'Thợ phụ: ' + name),
                        ...splitProductionOrderStaffNames(row.line.traineeStaff).map(name => 'Học việc: ' + name)
                      ];
                      return staffLines.length > 0
                        ? staffLines.map((staffLine, index) => <div key={index}>{staffLine}</div>)
                        : splitProductionOrderStaffNames(row.line.staff).length > 0
                          ? splitProductionOrderStaffNames(row.line.staff).map((name, index) => <div key={index}>Nhân sự: {name}</div>)
                          : '-';
                    })()}
                  </td>
                  <td className="production-plan-print-order-code">{orderCode}</td>
                  <td className="production-plan-print-product-column">
                    {products.length === 0 ? (
                      <span className="production-plan-print-empty-material">-</span>
                    ) : (
                      <div className="production-plan-print-material-list">
                        {products.map((product, index) => {
                          const qty =
                            product.quantity && product.quantity !== '-'
                              ? `${product.quantity}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''}`
                              : '';
                          return (
                            <div
                              key={`${row.line.id}-${product.productCode || index}`}
                              className="production-plan-print-material-item"
                            >
                              <span className="production-plan-print-material-name">
                                {products.length > 1 ? `${index + 1}. ` : ''}
                                {product.productCode || '-'}
                                {product.productName ? ` - ${product.productName}` : ''}
                              </span>
                              {qty ? <span className="production-plan-print-material-qty">{qty}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td>{row.line.note || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="production-plan-print-signatures">
          <div>
            <p>Người giao</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Người nhận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type StaffAssignmentRow = {
  key: string;
  staff: string;
  shift: string;
  machine: string;
  order: string;
};

export function StaffAssignmentPrintSheet({
  rows,
  planDate,
  planNote
}: {
  rows: StaffAssignmentRow[];
  planDate: string;
  planNote: string;
}) {
  const printDate = (() => {
    const formatted = planDate ? formatDateDdMmYyyy(planDate) : '-';
    return formatted === '-' ? formatDateDdMmYyyy(new Date()) : formatted;
  })();

  return (
    <div className="production-plan-print-sheet">
      <div className="production-plan-print-doc">
        <header className="production-plan-print-header">
          <div className="production-plan-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-plan-print-logo" />
            <div className="production-plan-print-company">
              <p className="production-plan-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <div className="production-plan-print-title-wrap">
            <h1>PHÂN CÔNG NHÂN SỰ</h1>
          </div>
          <p className="production-plan-print-date">Ngày: {printDate}</p>
        </header>

        {planNote ? <p className="production-plan-print-date">Ghi chú: {planNote}</p> : null}

        <table className="production-plan-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Nhân sự</th>
              <th>Ca làm việc</th>
              <th>Tên máy</th>
              <th>Lệnh sản xuất</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td className="production-plan-print-center">{index + 1}</td>
                <td>{row.staff}</td>
                <td>{row.shift}</td>
                <td>{row.machine}</td>
                <td className="font-mono">{row.order}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="production-plan-print-center" colSpan={5}>
                  Không có dữ liệu phân công nhân sự.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="production-plan-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Quản đốc</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function loadProductionPlanMaterials(
  lines: ProductionPlanLine[]
): Promise<Record<string, ProductionOrderMaterialLine[]>> {
  const entries = await Promise.all(
    lines.flatMap(line => {
      const products =
        line.products.length > 0
          ? line.products
          : [
              {
                productCode: line.productCode,
                productName: line.productName,
                unit: line.unit,
                quantity: line.quantity
              }
            ];

      return products.map(async product => {
        const { items, product: catalogProduct } = await fetchProductPrintData(product.productCode);
        const orderQuantity = parseProductionOrderQuantity(product.quantity);
        const materialKey = products.length > 1 ? `${line.id}__${product.productCode}` : line.id;
        return [materialKey, buildProductionOrderMaterialProposal(orderQuantity, items, catalogProduct)] as const;
      });
    })
  );

  return Object.fromEntries(entries);
}

export type ProductionPlanMaterialAccountingDetail = {
  lineId: string;
  orderCode: string;
  productName: string;
  orderQuantity: string;
  proposedQuantity: number;
  normLabel: string;
  shift: string;
};

export type ProductionPlanMaterialAccountingLine = {
  code: string;
  name: string;
  unit: string;
  totalQuantity: number;
  details: ProductionPlanMaterialAccountingDetail[];
};

export type ProductionPlanMaterialAccountingShiftGroup = {
  shift: string;
  orderCount: number;
  lines: ProductionPlanMaterialAccountingLine[];
};

export type ProductionPlanWarehouseExportLine = {
  code: string;
  name: string;
  unit: string;
  quotaQuantity: number;
  suggestedQuantity: number;
  actualQuantity: number;
};

export function normalizeProductionPlanShift(shift: string) {
  const trimmed = String(shift || '').trim();
  return trimmed && trimmed !== '-' ? trimmed : 'Chưa phân ca';
}

export function productionPlanAccountingKey(
  shift: string,
  material: Pick<ProductionPlanMaterialAccountingLine, 'code' | 'unit'>
) {
  return `${normalizeProductionPlanShift(shift)}__${normalizeProductCodeKey(material.code)}__${material.unit || '-'}`;
}

export function buildInventoryTotalKgMap(materials: MaterialRow[]) {
  const map = new Map<string, number>();

  materials.forEach(material => {
    const totalKg = parseInventoryNumber(material.totalWeight);
    if (!material.code || totalKg === null || totalKg <= 0) return;
    map.set(normalizeProductCodeKey(material.code), totalKg);
  });

  return map;
}

export function lookupInventoryTotalKg(code: string, inventoryTotalKgByCode: Map<string, number>) {
  return inventoryTotalKgByCode.get(normalizeProductCodeKey(code)) ?? null;
}

export function suggestProductionPlanPackageQuantity(totalNorm: number, totalKg: number | null) {
  if (totalKg === null || totalKg <= 0 || !Number.isFinite(totalNorm) || totalNorm <= 0) return '';
  return String(roundNplNumber(totalNorm / totalKg));
}

export function calcProductionPlanExpectedWeight(packageQuantity: number, totalKg: number | null) {
  if (totalKg === null || totalKg <= 0 || !Number.isFinite(packageQuantity) || packageQuantity < 0) return '';
  return String(roundNplNumber(packageQuantity * totalKg));
}

export function resolveProductionPlanLineForMaterialKey(
  scopedLines: ProductionPlanLine[],
  materialKey: string
): { line: ProductionPlanLine; product: OrderProductLine } | null {
  const directLine = scopedLines.find(line => line.id === materialKey);
  if (directLine) {
    const products =
      directLine.products.length > 0
        ? directLine.products
        : [
            {
              productCode: directLine.productCode,
              productName: directLine.productName,
              unit: directLine.unit,
              quantity: directLine.quantity
            }
          ];
    return { line: directLine, product: products[0] };
  }

  const separatorIndex = materialKey.indexOf('__');
  if (separatorIndex <= 0) return null;

  const orderId = materialKey.slice(0, separatorIndex);
  const productCode = materialKey.slice(separatorIndex + 2);
  const line = scopedLines.find(item => item.id === orderId);
  if (!line) return null;

  const products =
    line.products.length > 0
      ? line.products
      : [
          {
            productCode: line.productCode,
            productName: line.productName,
            unit: line.unit,
            quantity: line.quantity
          }
        ];
  const product =
    products.find(item => item.productCode === productCode) ??
    ({
      productCode,
      productName: productCode,
      unit: line.unit,
      quantity: line.quantity
    } as OrderProductLine);

  return { line, product };
}

export function buildProductionPlanMaterialAccountingForLines(
  scopedLines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingLine[] {
  const scopedLineIds = new Set(scopedLines.map(line => line.id));
  const map = new Map<string, ProductionPlanMaterialAccountingLine>();

  Object.entries(materialsByLine).forEach(([materialKey, materials]) => {
    const parentId = materialKey.includes('__') ? materialKey.slice(0, materialKey.indexOf('__')) : materialKey;
    if (!scopedLineIds.has(parentId)) return;

    const resolved = resolveProductionPlanLineForMaterialKey(scopedLines, materialKey);
    if (!resolved) return;

    const { line, product } = resolved;

    materials.forEach(material => {
      const code = material.code || '-';
      const unit = material.unit || '-';
      const key = `${normalizeProductCodeKey(code)}__${unit}`;
      const existing =
        map.get(key) ??
        {
          code,
          name: material.name || code,
          unit,
          totalQuantity: 0,
          details: []
        };

      existing.totalQuantity = roundNplNumber(existing.totalQuantity + material.proposedQuantity);
      existing.details.push({
        lineId: materialKey,
        orderCode: line.code || '-',
        productName: product.productName || product.productCode || '-',
        orderQuantity:
          product.quantity || product.unit
            ? `${product.quantity || '-'}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''}`
            : '-',
        proposedQuantity: material.proposedQuantity,
        normLabel: material.normLabel,
        shift: normalizeProductionPlanShift(line.shift)
      });
      map.set(key, existing);
    });
  });

  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

export function buildProductionPlanMaterialAccountingByShift(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingShiftGroup[] {
  const shifts = [...new Set(lines.map(line => normalizeProductionPlanShift(line.shift)))].sort((a, b) =>
    a.localeCompare(b, 'vi', { numeric: true })
  );

  return shifts.map(shift => {
    const scopedLines = lines.filter(line => normalizeProductionPlanShift(line.shift) === shift);
    return {
      shift,
      orderCount: scopedLines.length,
      lines: buildProductionPlanMaterialAccountingForLines(scopedLines, materialsByLine)
    };
  });
}

export function buildProductionPlanMaterialAccounting(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingLine[] {
  return buildProductionPlanMaterialAccountingForLines(lines, materialsByLine);
}

export function buildProductionPlanNvlPrintGroups(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanNvlPrintShiftGroup[] {
  return buildProductionPlanMaterialAccountingByShift(lines, materialsByLine).map(group => ({
    shift: group.shift,
    orderCount: group.orderCount,
    orderCodes: [
      ...new Set(
        lines
          .filter(line => normalizeProductionPlanShift(line.shift) === group.shift)
          .map(line => line.code)
          .filter(code => code && code !== '-')
      )
    ],
    lines: group.lines.map(line => ({
      code: line.code,
      name: line.name,
      unit: line.unit,
      totalQuantity: line.totalQuantity
    }))
  }));
}

export function ProductionPlanMaterialAccountingModal({
  open,
  onClose,
  lines,
  materialsByLine,
  inventoryMaterials,
  isLoading,
  error,
  onReload,
  onExportWarehouseSlip
}: {
  open: boolean;
  onClose: () => void;
  lines: ProductionPlanLine[];
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>;
  inventoryMaterials: MaterialRow[];
  isLoading: boolean;
  error: string;
  onReload: () => void;
  onExportWarehouseSlip: (lines: ProductionPlanWarehouseExportLine[], shift: string) => void;
}) {
  const accountingShiftGroups = useMemo(
    () => buildProductionPlanMaterialAccountingByShift(lines, materialsByLine),
    [lines, materialsByLine]
  );
  const inventoryTotalKgByCode = useMemo(
    () => buildInventoryTotalKgMap(inventoryMaterials),
    [inventoryMaterials]
  );
  const [packageQuantities, setPackageQuantities] = useState<Record<string, string>>({});
  const [expectedExportWeights, setExpectedExportWeights] = useState<Record<string, string>>({});
  const totalOrderCount = lines.length;
  const totalMaterialCount = useMemo(
    () =>
      new Set(
        accountingShiftGroups.flatMap(group =>
          group.lines.map(material => `${normalizeProductCodeKey(material.code)}__${material.unit}`)
        )
      ).size,
    [accountingShiftGroups]
  );

  const buildActualExportLinesForShift = (shift: string) =>
    (accountingShiftGroups.find(group => group.shift === shift)?.lines ?? [])
      .map(material => {
        const key = productionPlanAccountingKey(shift, material);
        const packageQty = parsePercentInput(packageQuantities[key] ?? '');
        const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
        const manualExpected = expectedExportWeights[key];
        const actualQuantity =
          manualExpected !== undefined && manualExpected.trim() !== ''
            ? parsePercentInput(manualExpected)
            : parsePercentInput(calcProductionPlanExpectedWeight(packageQty, totalKg));
        const autoSuggested = parsePercentInput(calcProductionPlanExpectedWeight(packageQty, totalKg));
        const suggestedQuantity =
          manualExpected !== undefined && manualExpected.trim() !== ''
            ? parsePercentInput(manualExpected)
            : autoSuggested;
        return {
          code: material.code,
          name: material.name,
          unit: material.unit && material.unit !== '-' ? material.unit : '',
          quotaQuantity: material.totalQuantity,
          suggestedQuantity: Number.isFinite(suggestedQuantity) ? suggestedQuantity : 0,
          actualQuantity
        };
      })
      .filter(line => Number.isFinite(line.actualQuantity) && line.actualQuantity > 0);

  const allExportLines = useMemo(() => {
    const merged = new Map<string, ProductionPlanWarehouseExportLine>();

    accountingShiftGroups.forEach(group => {
      buildActualExportLinesForShift(group.shift).forEach(line => {
        const key = `${normalizeProductCodeKey(line.code)}__${line.unit}`;
        const existing = merged.get(key);
        if (existing) {
          existing.quotaQuantity = roundNplNumber(existing.quotaQuantity + line.quotaQuantity);
          existing.suggestedQuantity = roundNplNumber(existing.suggestedQuantity + line.suggestedQuantity);
          existing.actualQuantity = roundNplNumber(existing.actualQuantity + line.actualQuantity);
        } else {
          merged.set(key, { ...line });
        }
      });
    });

    return [...merged.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  }, [accountingShiftGroups, packageQuantities, expectedExportWeights, inventoryTotalKgByCode]);

  useEffect(() => {
    if (!open || accountingShiftGroups.length === 0) return;

    const suggestedPackages: Record<string, string> = {};
    const suggestedExpected: Record<string, string> = {};

    accountingShiftGroups.forEach(group => {
      group.lines.forEach(material => {
        const key = productionPlanAccountingKey(group.shift, material);
        const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
        const suggestedPackage = suggestProductionPlanPackageQuantity(material.totalQuantity, totalKg);

        if (suggestedPackage) {
          suggestedPackages[key] = suggestedPackage;
          const expected = calcProductionPlanExpectedWeight(parsePercentInput(suggestedPackage), totalKg);
          if (expected) suggestedExpected[key] = expected;
        }
      });
    });

    setPackageQuantities(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(suggestedPackages).forEach(([key, value]) => {
        if (next[key] === undefined) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setExpectedExportWeights(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(suggestedExpected).forEach(([key, value]) => {
        if (next[key] === undefined) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [open, accountingShiftGroups, inventoryTotalKgByCode]);

  const handlePackageQuantityChange = (
    shift: string,
    material: ProductionPlanMaterialAccountingLine,
    value: string
  ) => {
    const key = productionPlanAccountingKey(shift, material);
    const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
    const expected = calcProductionPlanExpectedWeight(parsePercentInput(value), totalKg);

    setPackageQuantities(prev => ({
      ...prev,
      [key]: value
    }));
    setExpectedExportWeights(prev => ({
      ...prev,
      [key]: expected
    }));
  };

  const handleExpectedExportWeightChange = (
    shift: string,
    material: ProductionPlanMaterialAccountingLine,
    value: string
  ) => {
    const key = productionPlanAccountingKey(shift, material);

    setExpectedExportWeights(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-3">
      <div className="flex max-h-[94vh] w-full max-w-[min(98vw,1920px)] flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-lg font-black text-zinc-950">Hạch toán định mức NVL</h3>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              Tổng hợp NVL tạm tính theo từng ca từ {totalOrderCount} lệnh SX trong kế hoạch hiện tại.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lệnh SX</p>
              <p className="mt-1 text-xl font-black text-zinc-950">{totalOrderCount}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Số ca</p>
              <p className="mt-1 text-xl font-black text-sky-800">{accountingShiftGroups.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Mã NVL</p>
              <p className="mt-1 text-xl font-black text-emerald-800">{totalMaterialCount}</p>
            </div>
          </div>

          {isLoading ? (
            <p className="py-10 text-center text-sm font-semibold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tính định mức NVL...
            </p>
          ) : accountingShiftGroups.length === 0 || accountingShiftGroups.every(group => group.lines.length === 0) ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
              Chưa có NVL để hạch toán. Kiểm tra thành phần NPL trong danh mục sản phẩm.
            </p>
          ) : (
            <div className="space-y-3">
              {accountingShiftGroups.map(group => {
                const shiftExportLines = buildActualExportLinesForShift(group.shift);

                return (
                  <section key={group.shift} className="overflow-hidden rounded-xl border border-zinc-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-white">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-red-300">Ca làm việc</p>
                        <h4 className="text-lg font-black">{group.shift}</h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="rounded-full bg-white/10 px-2.5 py-1">{group.orderCount} lệnh SX</span>
                        <span className="rounded-full bg-white/10 px-2.5 py-1">{group.lines.length} mã NVL</span>
                        <button
                          type="button"
                          onClick={() => onExportWarehouseSlip(shiftExportLines, group.shift)}
                          disabled={isLoading || shiftExportLines.length === 0}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                          Xuất kho {group.shift}
                        </button>
                      </div>
                    </div>

                    {group.lines.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm font-semibold text-zinc-500">
                        Ca này chưa có NVL để hạch toán.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed text-left text-xs">
                          <colgroup>
                            <col className="w-[5%]" />
                            <col className="w-[10%]" />
                            <col className="w-[32%]" />
                            <col className="w-[8%]" />
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                          </colgroup>
                          <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                            <tr>
                              <th className="px-2 py-1.5 font-black">STT</th>
                              <th className="px-2 py-1.5 font-black">Mã NVL</th>
                              <th className="px-2 py-1.5 font-black">Tên NVL</th>
                              <th className="px-2 py-1.5 font-black">ĐVT</th>
                              <th className="px-2 py-1.5 text-right font-black">Tổng định mức</th>
                              <th className="px-2 py-1.5 text-center font-black leading-tight">Số lượng xuất kiện</th>
                              <th className="px-2 py-1.5 text-right font-black leading-tight">Khối lượng xuất dự kiến</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {group.lines.map((material, index) => {
                              const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
                              const accountingKey = productionPlanAccountingKey(group.shift, material);
                              const packageQty = parsePercentInput(packageQuantities[accountingKey] ?? '');
                              const autoExpectedExportWeight = calcProductionPlanExpectedWeight(packageQty, totalKg);
                              const expectedExportDisplay =
                                expectedExportWeights[accountingKey] ?? autoExpectedExportWeight;

                              return (
                              <tr key={`${group.shift}-${material.code}-${material.unit}`} className="leading-tight">
                                <td className="px-2 py-1.5 text-center font-black text-emerald-700">{index + 1}</td>
                                <td className="truncate px-2 py-1.5 font-mono text-[11px] font-bold text-zinc-900" title={material.code}>
                                  {material.code}
                                </td>
                                <td className="truncate px-2 py-1.5 font-semibold text-zinc-800" title={material.name}>
                                  {material.name}
                                </td>
                                <td className="px-2 py-1.5 text-center text-zinc-700">{material.unit}</td>
                                <td className="px-2 py-1.5 text-right font-black text-[#ef1b2d]">
                                  {formatProductionOrderPrintQuantity(material.totalQuantity)}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={packageQuantities[accountingKey] ?? ''}
                                    onChange={event =>
                                      handlePackageQuantityChange(group.shift, material, event.target.value)
                                    }
                                    title={
                                      totalKg
                                        ? `Tổng định mức ÷ ${formatNumber(totalKg, 2)} kg`
                                        : 'Chưa tìm thấy Tổng kg trong Kho NVL'
                                    }
                                    className="h-7 w-full min-w-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-center text-[11px] font-black text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                    placeholder={totalKg ? 'Kiện' : '-'}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={expectedExportDisplay}
                                    onChange={event =>
                                      handleExpectedExportWeightChange(group.shift, material, event.target.value)
                                    }
                                    title={
                                      totalKg && autoExpectedExportWeight
                                        ? `Tự tính: Số kiện × ${formatNumber(totalKg, 2)} kg`
                                        : 'Có thể nhập tay khối lượng xuất dự kiến'
                                    }
                                    className="h-7 w-full min-w-0 rounded-md border border-sky-200 bg-sky-50 px-2 text-right text-[11px] font-black text-sky-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                    placeholder="kg"
                                  />
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={() => onExportWarehouseSlip(allExportLines, 'Tất cả các ca')}
            disabled={isLoading || allExportLines.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Xuất kho NVL
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Tính lại
          </button>
        </div>
      </div>
    </div>
  );
}

export type ProductionPlanQrLabel = {
  id: string;
  qrPayload: string;
  displayCode: string;
  displayName: string;
  orderCode: string;
  quantity: number;
  shift: string;
  staff: string;
  productionDate: string;
};

/** Phần ngày trong serial QR: ddmmyy (theo ngày kế hoạch / hôm nay). */
export function buildProductionPlanQrDateSerial(dateInput?: string) {
  const source = String(dateInput || '').trim();
  let date = new Date();
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) {
    const [y, m, d] = source.slice(0, 10).split('-').map(Number);
    if (y && m && d) date = new Date(y, m - 1, d);
  } else if (/^\d{2}\/\d{2}\/\d{4}/.test(source)) {
    const [d, m, y] = source.slice(0, 10).split('/').map(Number);
    if (y && m && d) date = new Date(y, m - 1, d);
  }
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function randomProductionPlanQrSerial(length = 4) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

/** Nội dung QR: MãSP_ddmmyy + số serial random (vd MT-MN009_3107268472). */
export function buildProductionPlanQrPayload(
  productCode: string,
  dateInput?: string,
  randomSerial?: string
) {
  const maSp = productCode.trim();
  if (!maSp || maSp === '-') return '';
  const datePart = buildProductionPlanQrDateSerial(dateInput);
  const serialPart = (randomSerial || randomProductionPlanQrSerial(4)).replace(/\D/g, '') || randomProductionPlanQrSerial(4);
  return `${maSp}_${datePart}${serialPart}`;
}

/** Mẫu hiển thị preview (không dùng để in). */
export function buildProductionPlanQrPayloadPreview(productCode: string, dateInput?: string) {
  const maSp = productCode.trim();
  if (!maSp || maSp === '-') return '—';
  return `${maSp}_${buildProductionPlanQrDateSerial(dateInput)}****`;
}

export function buildProductionPlanQrLabels(
  lines: ProductionPlanLine[],
  selectedShift: string,
  products: ProductRow[],
  planDate = ''
): ProductionPlanQrLabel[] {
  const labels: ProductionPlanQrLabel[] = [];
  const usedPayloads = new Set<string>();
  const productionDate = formatProductionPlanPrintDate(planDate);
  const datePart = buildProductionPlanQrDateSerial(planDate);

  lines
    .filter(line => line.shift === selectedShift)
    .forEach(line => {
      const quantity = Math.max(0, Math.floor(parseProductionOrderQuantity(line.quantity)));
      if (quantity <= 0) return;

      const product = findProductByCode(products, line.productCode);
      const displayCode = product?.code || line.productCode || '-';
      const displayName = product?.name || line.productName || line.name || '-';
      const shift = line.shift && line.shift !== '-' ? line.shift : selectedShift;
      const staff = line.staff && line.staff !== '-' ? line.staff : '—';

      for (let index = 0; index < quantity; index += 1) {
        let qrPayload = '';
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const candidate = buildProductionPlanQrPayload(displayCode, planDate, randomProductionPlanQrSerial(4));
          if (candidate && !usedPayloads.has(candidate)) {
            qrPayload = candidate;
            usedPayloads.add(candidate);
            break;
          }
        }
        if (!qrPayload) {
          qrPayload = `${displayCode}_${datePart}${String(index).padStart(4, '0')}${randomProductionPlanQrSerial(2)}`;
          usedPayloads.add(qrPayload);
        }

        labels.push({
          id: `${line.id}-${index}`,
          qrPayload,
          displayCode,
          displayName,
          orderCode: line.code,
          quantity: 1,
          shift,
          staff,
          productionDate
        });
      }
    });

  return labels;
}

export function ProductionPlanQrPrintSheet({
  labels,
  qrImages
}: {
  labels: ProductionPlanQrLabel[];
  qrImages: Record<string, string>;
}) {
  return (
    <div className="production-plan-qr-print-sheet">
      <div className="production-plan-qr-print-page">
        {labels.map(label => (
            <div key={label.id} className="production-plan-qr-print-card">
              <div className="production-plan-qr-print-code-wrap">
                {qrImages[label.qrPayload] && (
                  <img src={qrImages[label.qrPayload]} alt={`QR ${label.qrPayload}`} />
                )}
              </div>
              <div className="production-plan-qr-print-info">
                <p className="production-plan-qr-print-info-label">Tên sản phẩm</p>
                <p className="production-plan-qr-print-name">{label.displayName}</p>
                <p className="production-plan-qr-print-code">{label.displayCode}</p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export function ProductionPlanQrPrintModal({
  open,
  onClose,
  lines,
  planDate = ''
}: {
  open: boolean;
  onClose: () => void;
  lines: ProductionPlanLine[];
  planDate?: string;
}) {
  const shiftOptions = useMemo(
    () =>
      [...new Set(lines.map(line => line.shift).filter(shift => shift && shift !== '-'))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      ),
    [lines]
  );
  const [selectedShift, setSelectedShift] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [formError, setFormError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [printLabels, setPrintLabels] = useState<ProductionPlanQrLabel[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [pendingPrint, setPendingPrint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedShift(shiftOptions[0] ?? '');
    setFormError('');
    setPrintLabels([]);
    setQrImages({});
    setPendingPrint(false);
  }, [open, shiftOptions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setIsLoadingProducts(true);
      try {
        const productRes = await fetch('/api/san-pham?format=table');
        const productData = await productRes.json().catch(() => ({}));
        if (!productRes.ok) throw new Error(productData.error || 'Không thể tải danh sách sản phẩm.');
        if (!cancelled) {
          setProducts(normalizeProducts(productData));
        }
      } catch (error: any) {
        if (!cancelled) setFormError(error.message || 'Không thể tải dữ liệu in QR.');
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const previewGroups = useMemo(() => {
    if (!selectedShift) return [];

    return lines
      .filter(line => line.shift === selectedShift)
      .map(line => {
        const product = findProductByCode(products, line.productCode);
        const displayCode = product?.code || line.productCode || '-';
        const displayName = product?.name || line.productName || line.name || '-';
        const quantity = Math.max(0, Math.floor(parseProductionOrderQuantity(line.quantity)));
        const staff = line.staff && line.staff !== '-' ? line.staff : '—';

        return {
          id: line.id,
          orderCode: line.code,
          displayCode,
          displayName,
          quantity,
          staff,
          shift: selectedShift,
          productionDate: formatProductionPlanPrintDate(planDate),
          qrPayload: buildProductionPlanQrPayloadPreview(displayCode, planDate)
        };
      })
      .filter(group => group.quantity > 0);
  }, [lines, selectedShift, products, planDate]);

  const totalQrCount = useMemo(
    () => previewGroups.reduce((sum, group) => sum + group.quantity, 0),
    [previewGroups]
  );

  useEffect(() => {
    if (!pendingPrint || printLabels.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printLabels, qrImages]);

  const handlePrint = async () => {
    if (!selectedShift) {
      setFormError('Vui lòng chọn ca.');
      return;
    }

    const labels = buildProductionPlanQrLabels(lines, selectedShift, products, planDate);
    if (labels.length === 0) {
      setFormError('Không có sản phẩm nào trong ca đã chọn để in QR.');
      return;
    }

    setIsGenerating(true);
    setFormError('');

    try {
      const uniquePayloads = [...new Set(labels.map(label => label.qrPayload))];
      const imageEntries = await Promise.all(
        uniquePayloads.map(async payload => {
          const url = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 220,
            color: {
              dark: '#111111',
              light: '#ffffff'
            }
          });
          return [payload, url] as const;
        })
      );

      setQrImages(Object.fromEntries(imageEntries));
      setPrintLabels(labels);
      setPendingPrint(true);
    } catch (error: any) {
      setFormError(error.message || 'Không thể tạo mã QR.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">In QR sản phẩm theo ca</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Số lượng tem QR = số lượng SP. Nội dung QR: mã SP_ddmmyy + số serial random (mỗi tem một mã).
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              Đóng
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {formError && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {formError}
              </p>
            )}

            <label className="mb-4 block space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chọn ca</span>
              <select
                value={selectedShift}
                onChange={event => setSelectedShift(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">-- Chọn ca --</option>
                {shiftOptions.map(shift => (
                  <option key={shift} value={shift}>
                    {shift}
                  </option>
                ))}
              </select>
            </label>

            {isLoadingProducts ? (
              <p className="py-6 text-center text-sm font-semibold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải sản phẩm...
              </p>
            ) : selectedShift && previewGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Ca này chưa có lệnh SX với số lượng hợp lệ.
              </p>
            ) : selectedShift ? (
              <div className="space-y-3">
                <p className="text-sm font-black text-emerald-800">
                  Sẽ in <span className="text-[#ef1b2d]">{totalQrCount}</span> tem QR
                </p>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3 py-2 font-black">Mã SP</th>
                        <th className="px-3 py-2 font-black">Tên sản phẩm</th>
                        <th className="px-3 py-2 font-black">Lệnh SX</th>
                        <th className="px-3 py-2 font-black">Nội dung QR</th>
                        <th className="px-3 py-2 text-right font-black">Số tem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {previewGroups.map(group => (
                        <tr key={group.id}>
                          <td className="px-3 py-2 font-mono font-bold text-zinc-800">{group.displayCode}</td>
                          <td className="px-3 py-2 text-zinc-700">{group.displayName}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-800">{group.orderCode}</td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-600">{group.qrPayload}</td>
                          <td className="px-3 py-2 text-right font-black text-emerald-700">{group.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isGenerating || isLoadingProducts || !selectedShift || totalQrCount === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              In {totalQrCount > 0 ? `${totalQrCount} tem QR` : 'QR'}
            </button>
          </div>
        </div>
      </div>

      {pendingPrint && printLabels.length > 0 && (
        <ProductionPlanQrPrintSheet labels={printLabels} qrImages={qrImages} />
      )}
    </>
  );
}

export function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function buildProductionPlanSaveItems(lines: ProductionPlanLine[]) {
  return lines.map((line, index) => {
    const products =
      line.products.length > 0
        ? line.products
        : [
            {
              productCode: line.productCode,
              productName: line.productName,
              unit: line.unit,
              quantity: line.quantity
            }
          ];

    return {
      id: line.id,
      thu_tu_uu_tien: index + 1,
      vi_tri: line.position && line.position !== '-' ? line.position : null,
      ghi_chu: line.note.trim() || null,
      ma_lenh_sx: line.code,
      ma_don_hang: line.orderRef && line.orderRef !== '-' ? line.orderRef : '',
      ca: line.shift && line.shift !== '-' ? line.shift : '',
      may: line.position && line.position !== '-' ? line.position : '',
      nhan_su: line.staff && line.staff !== '-' ? line.staff : '',
      truong_ca: line.shiftLead && line.shiftLead !== '-' ? line.shiftLead : '',
      nhan_su_chinh: line.mainStaff && line.mainStaff !== '-' ? line.mainStaff : '',
      tho_phu: line.assistantStaff && line.assistantStaff !== '-' ? line.assistantStaff : '',
      hoc_viec: line.traineeStaff && line.traineeStaff !== '-' ? line.traineeStaff : '',
      san_pham: products.map(product => ({
        ma_sp: product.productCode,
        ten_sp: product.productName,
        don_vi: product.unit && product.unit !== '-' ? product.unit : '',
        so_luong: parseProductionOrderQuantity(product.quantity)
      }))
    };
  });
}

export type ProductionPlanHistorySummary = {
  id: string;
  code: string;
  planDate: string;
  status: string;
  orderCount: number;
  note: string;
  createdBy: string;
  createdAt: string;
  daIn?: boolean;
};

export type ProductionPlanHistoryLine = {
  id: string;
  productionOrderId: string;
  priority: number;
  position: string;
  note: string;
  orderCode: string;
  orderRef: string;
  shift: string;
  machine: string;
  staff: string;
  shiftLead: string;
  mainStaff: string;
  assistantStaff: string;
  traineeStaff: string;
  products: OrderProductLine[];
};

export function normalizeProductionPlanHistory(data: unknown): ProductionPlanHistorySummary[] {
  if (!data || typeof data !== 'object') return [];
  const plans = (data as { plans?: unknown }).plans;
  if (!Array.isArray(plans)) return [];

  return plans
    .map((item): ProductionPlanHistorySummary | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? '').trim();
      if (!id) return null;

      return {
        id,
        code: pickText(record, ['ma_ke_hoach', 'code'], '-'),
        planDate:
          parseProductionOrderFilterDate(String(record.ngay_ke_hoach ?? record.planDate ?? '')) ||
          formatCell(record.ngay_ke_hoach ?? record.planDate),
        status: pickText(record, ['trang_thai', 'status'], '-'),
        orderCount: Number(record.so_lenh ?? record.orderCount ?? 0) || 0,
        note: pickText(record, ['ghi_chu', 'note'], ''),
        createdBy: pickText(record, ['nguoi_lap', 'createdBy'], ''),
        createdAt: formatCell(record.created_at ?? record.createdAt),
        daIn: record.da_in === true
      };
    })
    .filter((row): row is ProductionPlanHistorySummary => Boolean(row));
}

export function normalizeProductionPlanHistoryLines(data: unknown): ProductionPlanHistoryLine[] {
  if (!data || typeof data !== 'object') return [];
  const lines = (data as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];

  return lines
    .map((item): ProductionPlanHistoryLine | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const products = parseOrderProductsFromRecord({
        san_pham: record.san_pham,
        ma_hang: record.ma_lenh_sx,
        ten_hang: record.ten_hang,
        don_vi: record.don_vi,
        so_luong: record.so_luong
      });

      return {
        id: String(record.id ?? '').trim() || `${record.ma_lenh_sx}-${record.thu_tu_uu_tien}`,
        productionOrderId: (() => {
          const value = String(record.lenh_sx_id ?? '').trim();
          return value && value !== '0' && value.toLowerCase() !== 'null' ? value : '';
        })(),
        priority: Number(record.thu_tu_uu_tien ?? 0) || 0,
        position: pickText(record, ['vi_tri', 'position'], '-'),
        note: pickText(record, ['ghi_chu', 'note'], ''),
        orderCode: pickText(record, ['ma_lenh_sx', 'code'], '-'),
        orderRef: pickText(record, ['ma_don_hang', 'orderRef'], '-'),
        shift: pickText(record, ['ca', 'shift'], '-'),
        machine: pickText(record, ['may', 'machine'], '-'),
        staff: pickText(record, ['nhan_su', 'staff'], '-'),
        shiftLead: pickText(record, ['truong_ca', 'shiftLead'], '-'),
        mainStaff: pickText(record, ['nhan_su_chinh', 'mainStaff'], '-'),
        assistantStaff: pickText(record, ['tho_phu', 'assistantStaff'], '-'),
        traineeStaff: pickText(record, ['hoc_viec', 'traineeStaff'], '-'),
        products
      };
    })
    .filter((row): row is ProductionPlanHistoryLine => Boolean(row))
    .sort((a, b) => a.priority - b.priority);
}

export function formatProductionPlanHistoryProducts(products: OrderProductLine[]) {
  if (products.length === 0) return '-';
  const codes = products.map(product => product.productCode.trim()).filter(code => code && code !== '-');
  return codes.length > 0 ? codes.join(', ') : '-';
}

export function ProductionPlanHistoryPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('production-plan-history');
  const [filterDate, setFilterDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [plans, setPlans] = useState<ProductionPlanHistorySummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedLines, setSelectedLines] = useState<ProductionPlanHistoryLine[]>([]);
  const [selectedPrintLineIds, setSelectedPrintLineIds] = useState<string[]>([]);
  const [historyPrintLines, setHistoryPrintLines] = useState<ProductionPlanLine[]>([]);
  const [historyPrintMaterials, setHistoryPrintMaterials] = useState<Record<string, ProductionOrderMaterialLine[]>>({});
  const [isPrintingSelected, setIsPrintingSelected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isLoadingCreate, setIsLoadingCreate] = useState(false);
  const [createOrders, setCreateOrders] = useState<ProductionOrderRow[]>([]);
  const [createMachines, setCreateMachines] = useState<MachineRow[]>([]);
  const [editingPlan, setEditingPlan] = useState<ProductionPlanHistorySummary | null>(null);
  const [editLines, setEditLines] = useState<ProductionPlanLine[]>([]);
  const [deletingPlanId, setDeletingPlanId] = useState('');
  const [pageKind, setPageKind] = useState<'ke_hoach' | 'bao_cao_cv'>('ke_hoach');
  const [phanCongAddTick, setPhanCongAddTick] = useState(0);

  const pageKindOptions = [
    { value: 'ke_hoach', label: 'Kế hoạch sản xuất' },
    { value: 'bao_cao_cv', label: 'Kế hoạch CV' }
  ] as const;

  const loadPlans = async (options?: { ngay?: string; tuNgay?: string; denNgay?: string }) => {
    setIsLoading(true);
    setLoadError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (options?.ngay) {
        params.set('ngay', options.ngay);
      } else {
        if (options?.tuNgay) params.set('tu_ngay', options.tuNgay);
        if (options?.denNgay) params.set('den_ngay', options.denNgay);
      }

      const res = await fetch(`/api/ke-hoach-sx?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải kế hoạch sản xuất.');
      }

      const nextPlans = normalizeProductionPlanHistory(data);
      setPlans(nextPlans);
      if (selectedPlanId && !nextPlans.some(plan => plan.id === selectedPlanId)) {
        setSelectedPlanId('');
        setSelectedLines([]);
      }
    } catch (error: any) {
      setPlans([]);
      setLoadError(error.message || 'Không thể tải kế hoạch sản xuất.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlanDetail = async (planId: string) => {
    setIsLoadingDetail(true);
    setLoadError('');

    try {
      const res = await fetch(`/api/ke-hoach-sx?id=${encodeURIComponent(planId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải chi tiết kế hoạch.');
      }

      setSelectedPlanId(planId);
      const nextLines = normalizeProductionPlanHistoryLines(data);
      setSelectedLines(nextLines);
      setSelectedPrintLineIds(nextLines.map(line => line.id));
    } catch (error: any) {
      setSelectedLines([]);
      setLoadError(error.message || 'Không thể tải chi tiết kế hoạch.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? null;
  const allSelectedLinesChecked = selectedLines.length > 0 && selectedLines.every(line => selectedPrintLineIds.includes(line.id));

  const togglePrintLine = (lineId: string) => {
    setSelectedPrintLineIds(current => current.includes(lineId)
      ? current.filter(id => id !== lineId)
      : [...current, lineId]);
  };

  const buildPrintablePlanLines = (lines: ProductionPlanHistoryLine[]): ProductionPlanLine[] =>
    lines.map(line => ({
      id: line.productionOrderId || line.id,
      code: line.orderCode,
      name: line.orderCode,
      productCode: line.products[0]?.productCode || '',
      productName: line.products[0]?.productName || '',
      quantity: line.products[0]?.quantity || '',
      unit: line.products[0]?.unit || '',
      products: line.products,
      status: '',
      orderRef: line.orderRef,
      position: line.machine !== '-' ? line.machine : line.position,
      staff: line.staff,
      shiftLead: line.shiftLead,
      mainStaff: line.mainStaff,
      assistantStaff: line.assistantStaff,
      traineeStaff: line.traineeStaff,
      shift: line.shift,
      priority: line.priority,
      note: line.note
    }));

  const printSelectedLines = async () => {
    if (!selectedPlan) return;
    const chosen =
      selectedPrintLineIds.length > 0
        ? selectedLines.filter(line => selectedPrintLineIds.includes(line.id))
        : selectedLines;
    if (chosen.length === 0) return;
    setIsPrintingSelected(true);
    setLoadError('');
    try {
      setHistoryPrintMaterials({});
      setHistoryPrintLines(buildPrintablePlanLines(chosen));
    } catch (error: any) {
      setLoadError(error.message || 'Không thể chuẩn bị dữ liệu in các lệnh đã chọn.');
    } finally {
      setIsPrintingSelected(false);
    }
  };

  const printPlanFromList = async (planId: string) => {
    setIsPrintingSelected(true);
    setLoadError('');
    try {
      let lines = selectedPlanId === planId ? selectedLines : [];
      if (selectedPlanId !== planId || lines.length === 0) {
        const res = await fetch(`/api/ke-hoach-sx?id=${encodeURIComponent(planId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải chi tiết kế hoạch để in.');
        }
        lines = normalizeProductionPlanHistoryLines(data);
        setSelectedPlanId(planId);
        setSelectedLines(lines);
        setSelectedPrintLineIds(lines.map(line => line.id));
      }
      if (lines.length === 0) {
        throw new Error('Kế hoạch không có lệnh để in.');
      }
      setHistoryPrintMaterials({});
      setHistoryPrintLines(buildPrintablePlanLines(lines));
    } catch (error: any) {
      setLoadError(error.message || 'Không thể in kế hoạch.');
    } finally {
      setIsPrintingSelected(false);
    }
  };

  useEffect(() => {
    if (historyPrintLines.length === 0) return;
    let cancelled = false;
    document.body.classList.add('production-plan-history-print-active');
    enablePortraitPrintPage('production-plan-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('production-plan-history-print-active');
      disablePortraitPrintPage('production-plan-print-page-portrait');
    };
  }, [historyPrintLines]);

  useEffect(() => {
    const handleAfterHistoryPrint = () => {
      document.body.classList.remove('production-plan-history-print-active');
      disablePortraitPrintPage('production-plan-print-page-portrait');
      setHistoryPrintLines([]);
      setHistoryPrintMaterials({});
    };
    window.addEventListener('afterprint', handleAfterHistoryPrint);
    return () => window.removeEventListener('afterprint', handleAfterHistoryPrint);
  }, []);
  const plansByDate = useMemo(() => {
    const map = new Map<string, ProductionPlanHistorySummary[]>();
    plans.forEach(plan => {
      const key = plan.planDate && plan.planDate !== '-' ? plan.planDate : 'Chưa có ngày';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(plan);
    });
    return [...map.entries()].sort((a, b) =>
      String(b[1][0]?.createdAt ?? '').localeCompare(String(a[1][0]?.createdAt ?? ''))
    );
  }, [plans]);

  const applyFilters = () => {
    if (filterDate) {
      void loadPlans({ ngay: filterDate });
      return;
    }
    void loadPlans({ tuNgay: fromDate, denNgay: toDate });
  };

  const resetToToday = () => {
    const today = todayDateInputValue();
    setFilterDate(today);
    setFromDate('');
    setToDate('');
    void loadPlans({ ngay: today });
  };

  const openCreatePlan = async () => {
    setIsLoadingCreate(true);
    setLoadError('');
    try {
      const [orderRes, machineRes] = await Promise.all([
        fetch('/api/lenh-sx'),
        fetch('/api/danh-sach-may')
      ]);
      const [orderData, machineData] = await Promise.all([
        orderRes.json().catch(() => ({})),
        machineRes.json().catch(() => ({}))
      ]);
      if (!orderRes.ok || !machineRes.ok) {
        throw new Error('Không thể tải lệnh sản xuất và danh sách máy.');
      }
      setCreateOrders(normalizeProductionOrders(orderData));
      setCreateMachines(normalizeMachines(machineData));
      setEditingPlan(null);
      setEditLines([]);
      setShowCreateModal(true);
    } catch (error: any) {
      setLoadError(error.message || 'Không thể mở form thêm kế hoạch sản xuất.');
    } finally {
      setIsLoadingCreate(false);
    }
  };

  const openEditPlan = async (plan: ProductionPlanHistorySummary) => {
    if (plan.daIn) {
      setLoadError('Kế hoạch sản xuất đã in, không thể sửa nữa.');
      return;
    }
    setIsLoadingCreate(true);
    setLoadError('');
    try {
      const [detailRes, orderRes, machineRes] = await Promise.all([
        fetch(`/api/ke-hoach-sx?id=${encodeURIComponent(plan.id)}`),
        fetch('/api/lenh-sx'),
        fetch('/api/danh-sach-may')
      ]);
      const [detailData, orderData, machineData] = await Promise.all([
        detailRes.json().catch(() => ({})), orderRes.json().catch(() => ({})), machineRes.json().catch(() => ({}))
      ]);
      if (!detailRes.ok || !orderRes.ok || !machineRes.ok) throw new Error('Không thể tải dữ liệu để sửa kế hoạch.');
      const historyLines = normalizeProductionPlanHistoryLines(detailData);
      const normalizedOrders = normalizeProductionOrders(orderData);
      setCreateOrders(normalizedOrders);
      setCreateMachines(normalizeMachines(machineData));
      setEditLines(historyLines.map(line => {
        const sourceOrder = findProductionOrderForPlanLine(
          { id: line.productionOrderId, code: line.orderCode },
          normalizedOrders
        );
        return {
          id: sourceOrder?.id || line.productionOrderId,
          code: line.orderCode,
          name: line.orderCode,
          productCode: line.products[0]?.productCode || '',
          productName: line.products[0]?.productName || '',
          quantity: line.products[0]?.quantity || '',
          unit: line.products[0]?.unit || '',
          products: line.products,
          status: '', orderRef: line.orderRef, position: line.machine !== '-' ? line.machine : line.position,
          staff: line.staff, shift: line.shift, priority: line.priority, note: line.note
        };
      }));
      setEditingPlan(plan);
      setShowCreateModal(true);
    } catch (error: any) {
      setLoadError(error.message || 'Không thể mở form sửa kế hoạch.');
    } finally { setIsLoadingCreate(false); }
  };

  const deletePlan = async (plan: ProductionPlanHistorySummary) => {
    if (!window.confirm(`Xóa kế hoạch ${plan.code}?`)) return;
    setDeletingPlanId(plan.id); setLoadError('');
    try {
      const res = await fetch(`/api/ke-hoach-sx/${encodeURIComponent(plan.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa kế hoạch.');
      if (selectedPlanId === plan.id) { setSelectedPlanId(''); setSelectedLines([]); }
      await loadPlans();
    } catch (error: any) { setLoadError(error.message || 'Không thể xóa kế hoạch.'); }
    finally { setDeletingPlanId(''); }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {canCreate ? (
              <button
                type="button"
                onClick={() => {
                  if (pageKind === 'bao_cao_cv') {
                    setPhanCongAddTick(tick => tick + 1);
                    return;
                  }
                  void openCreatePlan();
                }}
                disabled={isLoadingCreate}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
              >
                {isLoadingCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Thêm mới
              </button>
            ) : null}
            <label className="min-w-0 flex-1 space-y-1 sm:max-w-[16rem]">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Loại</span>
              <select
                value={pageKind}
                onChange={e => setPageKind(e.target.value === 'bao_cao_cv' ? 'bao_cao_cv' : 'ke_hoach')}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
              >
                {pageKindOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {pageKind === 'ke_hoach' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Theo ngày</span>
                <DateInput
                  value={filterDate}
                  onChange={next => {
                    setFilterDate(next);
                    setFromDate('');
                    setToDate('');
                  }}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 pr-10 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Từ ngày</span>
                <DateInput
                  value={fromDate}
                  onChange={next => {
                    setFromDate(next);
                    setFilterDate('');
                  }}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 pr-10 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đến ngày</span>
                <DateInput
                  value={toDate}
                  onChange={next => {
                    setToDate(next);
                    setFilterDate('');
                  }}
                  className="h-10 w-full rounded-lg border border-zinc-200 px-3 pr-10 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                <button
                  type="button"
                  onClick={applyFilters}
                  disabled={isLoading}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60 lg:flex-none"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Lọc
                </button>
                <button
                  type="button"
                  onClick={resetToToday}
                  disabled={isLoading}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 lg:flex-none"
                >
                  Hôm nay
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {loadError && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {loadError}
        </section>
      )}

      {pageKind === 'ke_hoach' ? (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h3 className="text-sm font-black text-zinc-950">Danh sách kế hoạch</h3>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải...
              </p>
            ) : plans.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Chưa có kế hoạch đã lưu. Lưu từ modal Kế hoạch sản xuất hoặc chạy supabase-ke-hoach-san-xuat.sql.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {plansByDate.map(([date, datePlans]) => {
                  const dateOrderTotal = datePlans.reduce((sum, plan) => sum + (plan.orderCount || 0), 0);
                  return (
                  <div key={date}>
                    <div className="sticky top-0 flex items-center justify-between gap-2 bg-[#ef1b2d] px-4 py-2">
                      <span className="text-xs font-black uppercase tracking-wider text-white">{date}</span>
                      <span className="text-right">
                        <span className="mr-1.5 text-[9px] font-black uppercase tracking-wider text-white/80">
                          Tổng ngày
                        </span>
                        <span className="font-mono text-xs font-black text-white">
                          {dateOrderTotal} lệnh SX
                        </span>
                      </span>
                    </div>
                    {datePlans.map(plan => (
                      <div
                        key={plan.id}
                        className={`px-4 py-3 transition hover:bg-red-50/50 ${
                          selectedPlanId === plan.id ? 'bg-emerald-50' : ''
                        }`}
                      >
                        <button type="button" onClick={() => void loadPlanDetail(plan.id)} className="flex w-full items-start justify-between gap-3 text-left">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black text-zinc-950">{plan.code}</p>
                          <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                            {plan.orderCount} lệnh SX · {plan.status}
                          </p>
                          {plan.note ? (
                            <p className="mt-1 text-xs font-medium text-zinc-500">{plan.note}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-200/70 pt-2">
                          <button type="button" onClick={() => void loadPlanDetail(plan.id)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[11px] font-bold text-sky-700"><Eye className="h-3.5 w-3.5" />Xem</button>
                          <button
                            type="button"
                            onClick={() => void printPlanFromList(plan.id)}
                            disabled={isPrintingSelected || (selectedPlanId === plan.id && selectedLines.length === 0 && isLoadingDetail)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-[11px] font-bold text-red-700 disabled:opacity-50"
                          >
                            {isPrintingSelected && selectedPlanId === plan.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Printer className="h-3.5 w-3.5" />
                            )}
                            In
                          </button>
                          {canEdit && !plan.daIn ? <button type="button" onClick={() => void openEditPlan(plan)} disabled={isLoadingCreate} className="inline-flex h-7 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Sửa</button> : null}
                          {canDelete ? <button type="button" onClick={() => void deletePlan(plan)} disabled={deletingPlanId === plan.id} className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 disabled:opacity-50">{deletingPlanId === plan.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Xóa</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <h3 className="text-sm font-black text-zinc-950">Chi tiết kế hoạch</h3>
              {selectedPlan ? (
                <p className="mt-1 text-xs font-semibold text-zinc-600">
                  {selectedPlan.code} · {selectedPlan.planDate} · {selectedPlan.orderCount} lệnh
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold text-zinc-500">Chọn một bản ghi bên trái để xem chi tiết.</p>
              )}
            </div>
            {selectedPlan ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void printSelectedLines()}
                  disabled={selectedLines.length === 0 || isPrintingSelected}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-black text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    selectedPrintLineIds.length > 0
                      ? `In ${selectedPrintLineIds.length} lệnh đã chọn`
                      : 'In toàn bộ lệnh của kế hoạch'
                  }
                >
                  {isPrintingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  {selectedPrintLineIds.length > 0
                    ? `In ${selectedPrintLineIds.length} lệnh`
                    : 'In'}
                </button>
              </div>
            ) : null}
          </div>

          {!selectedPlan ? (
            <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-500">Chưa chọn kế hoạch.</p>
          ) : isLoadingDetail ? (
            <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải chi tiết...
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                  <tr>
                    <th className="w-12 px-3 py-2 text-center font-black">
                      <input
                        type="checkbox"
                        aria-label="Chọn tất cả lệnh để in"
                        checked={allSelectedLinesChecked}
                        onChange={() => setSelectedPrintLineIds(allSelectedLinesChecked ? [] : selectedLines.map(line => line.id))}
                        className="h-4 w-4 cursor-pointer accent-white"
                      />
                    </th>
                    <th className="px-3 py-2 font-black">STT</th>
                    <th className="px-3 py-2 font-black">Mã lệnh</th>
                    <th className="px-3 py-2 font-black">Máy</th>
                    <th className="px-3 py-2 font-black">Ca</th>
                    <th className="px-3 py-2 font-black">Nhân sự</th>
                    <th className="px-3 py-2 font-black">Sản phẩm</th>
                    <th className="px-3 py-2 font-black">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedLines.map(line => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Chọn lệnh ${line.orderCode} để in`}
                          checked={selectedPrintLineIds.includes(line.id)}
                          onChange={() => togglePrintLine(line.id)}
                          className="h-4 w-4 cursor-pointer accent-[#ef1b2d]"
                        />
                      </td>
                      <td className="px-3 py-2 font-black text-emerald-700">{line.priority}</td>
                      <td className="px-3 py-2">
                        <p className="font-mono font-bold text-zinc-900">{line.orderCode}</p>
                        {line.orderRef !== '-' ? (
                          <p className="text-xs font-semibold text-zinc-500">{line.orderRef}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{line.machine !== '-' ? line.machine : line.position}</td>
                      <td className="px-3 py-2 text-zinc-700">{line.shift}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.staff}</td>
                      <td className="px-3 py-2 text-zinc-800">{formatProductionPlanHistoryProducts(line.products)}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.note || '-'}</td>
                    </tr>
                  ))}
                  {selectedLines.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center font-semibold text-zinc-500">
                        Kế hoạch này chưa có dòng chi tiết.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      ) : (
      <PhanCongCvPanel
        defaultDate={filterDate || selectedPlan?.planDate || todayDateInputValue()}
        canEdit={canCreate || canEdit}
        addRowTick={phanCongAddTick}
      />
      )}

      {historyPrintLines.length > 0 ? createPortal(
        <div className="production-plan-history-print-root">
          <ProductionPlanPrintSheet
            lines={historyPrintLines}
            materialsByLine={historyPrintMaterials}
            planDate={selectedPlan?.planDate || ''}
            planNote={selectedPlan?.note || ''}
          />
        </div>,
        document.body
      ) : null}
      <ProductionPlanModal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingPlan(null); setEditLines([]); }}
        onSaved={async () => {
          setShowCreateModal(false);
          await loadPlans();
        }}
        onOpenWarehouseSlip={() => setShowCreateModal(false)}
        productionOrders={createOrders}
        machines={createMachines}
        editPlanId={editingPlan?.id}
        initialLines={editingPlan ? editLines : undefined}
        initialPlanDate={editingPlan?.planDate}
        initialNote={editingPlan?.note}
        initialDaIn={editingPlan?.daIn}
      />
    </div>
  );
}

export function ProductionPlanModal({
  open,
  onClose,
  onSaved,
  onOpenWarehouseSlip,
  productionOrders,
  machines,
  editPlanId,
  initialLines,
  initialPlanDate,
  initialNote,
  initialDaIn,
  seedOrderIds
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onOpenWarehouseSlip: () => void;
  productionOrders: ProductionOrderRow[];
  machines: MachineRow[];
  editPlanId?: string;
  initialLines?: ProductionPlanLine[];
  initialPlanDate?: string;
  initialNote?: string;
  initialDaIn?: boolean;
  /** Lệnh đang tick trên bảng điều khiển — dùng suy ngày kế hoạch mặc định. */
  seedOrderIds?: string[];
}) {
  const { canCreate } = useTabAccess('production-plan-history');
  const { canEdit: canEditProductionOrder } = useTabAccess('production-orders');
  const [planLines, setPlanLines] = useState<ProductionPlanLine[]>([]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [printLocked, setPrintLocked] = useState(Boolean(initialDaIn));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [pendingNvlPrint, setPendingNvlPrint] = useState(false);
  const [showNvlPrintSheet, setShowNvlPrintSheet] = useState(false);
  const [isLoadingPlanPrint, setIsLoadingPlanPrint] = useState(false);
  const [isLoadingNvlPrint, setIsLoadingNvlPrint] = useState(false);
  const [printMaterialsByLine, setPrintMaterialsByLine] = useState<Record<string, ProductionOrderMaterialLine[]>>({});
  const [nvlPrintMaterialsByLine, setNvlPrintMaterialsByLine] = useState<
    Record<string, ProductionOrderMaterialLine[]>
  >({});
  const [showMaterialAccountingModal, setShowMaterialAccountingModal] = useState(false);
  const [isLoadingMaterialAccounting, setIsLoadingMaterialAccounting] = useState(false);
  const [materialAccountingError, setMaterialAccountingError] = useState('');
  const [accountingMaterialsByLine, setAccountingMaterialsByLine] = useState<Record<string, ProductionOrderMaterialLine[]>>({});
  const [accountingInventoryMaterials, setAccountingInventoryMaterials] = useState<MaterialRow[]>([]);
  const [planDate, setPlanDate] = useState(todayDateInputValue());
  const [planHeaderNote, setPlanHeaderNote] = useState('');
  const [pendingStaffAssignmentPrint, setPendingStaffAssignmentPrint] = useState(false);
  const [isLoadingRelatedPrint, setIsLoadingRelatedPrint] = useState(false);
  const [relatedPrintData, setRelatedPrintData] = useState<ProductionPlanRelatedReports | null>(null);
  const [relatedPrintOrders, setRelatedPrintOrders] = useState<PrintableProductionOrder[]>([]);
  const [relatedPrintCustomerOrders, setRelatedPrintCustomerOrders] = useState<OrderRow[]>([]);
  const [relatedPrintCatalog, setRelatedPrintCatalog] = useState<ProductRow[]>([]);
  const [pendingRelatedPrint, setPendingRelatedPrint] = useState(false);
  const [relatedShiftOptions, setRelatedShiftOptions] = useState<ShiftOption[]>([]);
  const [selectedRelatedShifts, setSelectedRelatedShifts] = useState<string[]>([]);
  const [relatedShiftSummaryRows, setRelatedShiftSummaryRows] = useState<ControlBoardShiftSummaryRow[]>([]);
  const [relatedShiftSummaryFilters, setRelatedShiftSummaryFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    shiftLabel: string;
    staffLabel: string;
    machineLabel?: string;
  } | null>(null);
  const [editingProductionOrder, setEditingProductionOrder] = useState<ProductionOrderRow | null>(null);
  const [editOrderLookups, setEditOrderLookups] = useState<OrderRow[]>([]);
  const [editProductLookups, setEditProductLookups] = useState<ProductRow[]>([]);
  const [loadingEditLineId, setLoadingEditLineId] = useState('');
  const [productionOrderOverrides, setProductionOrderOverrides] = useState<Record<string, ProductionOrderRow>>({});
  const [usedLenhSxIds, setUsedLenhSxIds] = useState<Set<string>>(() => new Set());
  const [usedOrderCodes, setUsedOrderCodes] = useState<Set<string>>(() => new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [isLoadingUsedOrders, setIsLoadingUsedOrders] = useState(false);

  const effectiveProductionOrders = useMemo(
    () => productionOrders.map(order => productionOrderOverrides[order.id] ?? order),
    [productionOrders, productionOrderOverrides]
  );

  const isEditingExistingPlan = Boolean(editPlanId || (initialLines && initialLines.length > 0));

  const availableOrders = useMemo(
    () =>
      isEditingExistingPlan
        ? []
        : getAvailableProductionPlanOrders(
            effectiveProductionOrders,
            planDate,
            usedLenhSxIds,
            usedOrderCodes
          ),
    [isEditingExistingPlan, effectiveProductionOrders, planDate, usedLenhSxIds, usedOrderCodes]
  );

  const allAvailableOrdersSelected =
    availableOrders.length > 0 && availableOrders.every(order => selectedOrderIds.has(order.id));

  useEffect(() => {
    if (open) setPrintLocked(Boolean(initialDaIn));
  }, [open, editPlanId, initialDaIn]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoadingUsedOrders(true);
    loadUsedProductionPlanOrderRefs(editPlanId || '')
      .then(used => {
        if (cancelled) return;
        setUsedLenhSxIds(used.usedLenhSxIds);
        setUsedOrderCodes(used.usedOrderCodes);
      })
      .catch(() => {
        if (cancelled) return;
        setUsedLenhSxIds(new Set());
        setUsedOrderCodes(new Set());
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUsedOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editPlanId]);

  const displayLines = useMemo(
    () => enrichProductionPlanLines(planLines, effectiveProductionOrders, machines),
    [planLines, effectiveProductionOrders, machines]
  );

  const createModeTableRows = useMemo(() => {
    if (isEditingExistingPlan) return [];
    return availableOrders.map(order => {
      const existingLine = planLines.find(line => line.id === order.id);
      const line =
        existingLine ||
        productionOrderToPlanLine(
          order,
          order.priority > 0 ? order.priority : availableOrders.findIndex(item => item.id === order.id) + 1,
          machines
        );
      return {
        order,
        line,
        selected: selectedOrderIds.has(order.id)
      };
    });
  }, [isEditingExistingPlan, availableOrders, planLines, selectedOrderIds, machines]);

  useEffect(() => {
    if (!open) return;
    const seedIdSet = new Set((seedOrderIds || []).filter(Boolean));
    const seedOrders =
      seedIdSet.size > 0 ? productionOrders.filter(order => seedIdSet.has(order.id)) : productionOrders;
    const nextDate =
      parseProductionOrderFilterDate(initialPlanDate || '') ||
      resolveDefaultProductionPlanDate(seedOrders.length > 0 ? seedOrders : productionOrders, todayDateInputValue());
    setPlanDate(nextDate);
    if (initialLines?.length) {
      setPlanLines(initialLines);
      setSelectedOrderIds(new Set(initialLines.map(line => line.id).filter(Boolean)));
    } else {
      setPlanLines([]);
      setSelectedOrderIds(new Set(seedIdSet));
    }
    setFormError('');
    setDragIndex(null);
    setPendingPrint(false);
    setPendingNvlPrint(false);
    setShowNvlPrintSheet(false);
    setIsLoadingPlanPrint(false);
    setIsLoadingNvlPrint(false);
    setPrintMaterialsByLine({});
    setNvlPrintMaterialsByLine({});
    setShowMaterialAccountingModal(false);
    setIsLoadingMaterialAccounting(false);
    setMaterialAccountingError('');
    setAccountingMaterialsByLine({});
    setAccountingInventoryMaterials([]);
    setPlanHeaderNote(initialNote || '');
    setPendingStaffAssignmentPrint(false);
    setIsLoadingRelatedPrint(false);
    setRelatedPrintData(null);
    setRelatedPrintOrders([]);
    setRelatedPrintCustomerOrders([]);
    setRelatedPrintCatalog([]);
    setPendingRelatedPrint(false);
    setSelectedRelatedShifts([]);
    setRelatedShiftSummaryRows([]);
    setRelatedShiftSummaryFilters(null);
    setEditingProductionOrder(null);
    setEditOrderLookups([]);
    setEditProductLookups([]);
    setLoadingEditLineId('');
    setProductionOrderOverrides({});

    fetch('/api/cai-dat')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setRelatedShiftOptions(data ? getProductionShiftOptions(normalizeShiftSettings(data)) : []))
      .catch(() => setRelatedShiftOptions([]));
  }, [open, productionOrders, machines, initialLines, initialPlanDate, initialNote, seedOrderIds]);

  /** Đổi ngày kế hoạch → bỏ chọn lệnh không thuộc ngày mới (không áp khi sửa kế hoạch đã lưu). */
  useEffect(() => {
    if (!open || isEditingExistingPlan) return;
    setSelectedOrderIds(prev => {
      const availableIdSet = new Set(
        getAvailableProductionPlanOrders(
          effectiveProductionOrders,
          planDate,
          usedLenhSxIds,
          usedOrderCodes
        ).map(order => order.id)
      );
      return new Set([...prev].filter(id => availableIdSet.has(id)));
    });
  }, [open, isEditingExistingPlan, planDate, effectiveProductionOrders, usedLenhSxIds, usedOrderCodes]);

  useEffect(() => {
    if (!open || isEditingExistingPlan) return;
    setPlanLines(prev => {
      const prevById = new Map<string, ProductionPlanLine>(prev.map(line => [line.id, line]));
      const selectedOrders = availableOrders.filter(order => selectedOrderIds.has(order.id));
      return selectedOrders.map((order, index) => {
        const existing = prevById.get(order.id);
        const priority = index + 1;
        const baseLine = productionOrderToPlanLine(order, priority, machines);
        return existing ? { ...baseLine, note: existing.note, priority } : baseLine;
      });
    });
  }, [open, isEditingExistingPlan, availableOrders, selectedOrderIds, machines]);

  useEffect(() => {
    if (!open) return;
    if (selectedRelatedShifts.length > 0) return;
    const defaults = Array.from(
      new Set(
        displayLines
          .map(line => (line.shift || '').trim())
          .filter(shift => shift && shift !== '-')
      )
    );
    if (defaults.length > 0) setSelectedRelatedShifts(defaults);
  }, [open, displayLines, selectedRelatedShifts.length]);

  const staffAssignmentRows = useMemo(() => {
    const rows: Array<{
      key: string;
      staff: string;
      shift: string;
      machine: string;
      order: string;
    }> = [];

    displayLines.forEach((line, lineIndex) => {
      const shiftLabel = line.shift && line.shift !== '-' ? line.shift : 'Chưa phân ca';
      const machineLabel = line.position && line.position !== '-' ? line.position : '-';
      const orderLabel = formatProductionPlanProductCodes(line) || '-';
      const names = String(line.staff || '')
        .split(/[,;/]/)
        .map(name => name.trim())
        .filter(name => name && name !== '-');

      if (names.length === 0) {
        rows.push({
          key: `${line.id}-${lineIndex}-none`,
          staff: 'Chưa phân công',
          shift: shiftLabel,
          machine: machineLabel,
          order: orderLabel
        });
        return;
      }

      names.forEach((name, index) => {
        rows.push({
          key: `${line.id}-${lineIndex}-${index}`,
          staff: name,
          shift: shiftLabel,
          machine: machineLabel,
          order: orderLabel
        });
      });
    });

    return rows.sort((a, b) => {
      const staffCompare = a.staff.localeCompare(b.staff, 'vi');
      if (staffCompare !== 0) return staffCompare;
      return a.shift.localeCompare(b.shift, 'vi', { numeric: true });
    });
  }, [displayLines]);

  const isModalPlanPrintActive =
    (pendingPrint && displayLines.length > 0) ||
    (pendingNvlPrint && displayLines.length > 0) ||
    pendingStaffAssignmentPrint;

  useEffect(() => {
    if (!isModalPlanPrintActive) return;
    document.body.classList.add('production-plan-modal-print-active');
    return () => {
      document.body.classList.remove('production-plan-modal-print-active');
    };
  }, [isModalPlanPrintActive]);

  useEffect(() => {
    if (!pendingPrint || displayLines.length === 0) return;
    let cancelled = false;
    enablePortraitPrintPage('production-plan-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('production-plan-print-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disablePortraitPrintPage('production-plan-print-page-portrait');
    };
  }, [pendingPrint, displayLines]);

  useEffect(() => {
    if (!pendingNvlPrint || displayLines.length === 0) return;
    let cancelled = false;
    enablePortraitPrintPage('production-plan-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingNvlPrint(false);
          setShowNvlPrintSheet(false);
          disablePortraitPrintPage('production-plan-print-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disablePortraitPrintPage('production-plan-print-page-portrait');
    };
  }, [pendingNvlPrint, displayLines]);

  useEffect(() => {
    if (!pendingStaffAssignmentPrint) return;
    let cancelled = false;
    enablePortraitPrintPage('production-plan-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingStaffAssignmentPrint(false);
          disablePortraitPrintPage('production-plan-print-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disablePortraitPrintPage('production-plan-print-page-portrait');
    };
  }, [pendingStaffAssignmentPrint]);

  useEffect(() => {
    if (!pendingRelatedPrint && relatedPrintOrders.length === 0 && relatedPrintCustomerOrders.length === 0 && !relatedPrintData) return;
    document.body.classList.add('production-plan-related-print-active');
    return () => {
      document.body.classList.remove('production-plan-related-print-active');
    };
  }, [pendingRelatedPrint, relatedPrintOrders, relatedPrintCustomerOrders, relatedPrintData]);

  useEffect(() => {
    if (!pendingRelatedPrint) return;
    if (!relatedPrintData && relatedPrintOrders.length === 0 && relatedPrintCustomerOrders.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingRelatedPrint(false);
      });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingRelatedPrint, relatedPrintData, relatedPrintOrders, relatedPrintCustomerOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPendingPrint(false);
      setPendingNvlPrint(false);
      setPendingStaffAssignmentPrint(false);
      setShowNvlPrintSheet(false);
      setPrintMaterialsByLine({});
      setNvlPrintMaterialsByLine({});
      setPendingRelatedPrint(false);
      setRelatedPrintData(null);
      setRelatedPrintOrders([]);
      setRelatedPrintCustomerOrders([]);
      setRelatedPrintCatalog([]);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const reorderLine = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setPlanLines(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((line, index) => ({ ...line, priority: index + 1 }));
    });
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    reorderLine(index, index + direction);
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAllAvailableOrders = () => {
    if (allAvailableOrdersSelected) {
      setSelectedOrderIds(new Set());
      return;
    }
    setSelectedOrderIds(new Set(availableOrders.map(order => order.id)));
  };

  const handleSave = async () => {
    if (displayLines.length === 0) {
      setFormError(
        isEditingExistingPlan
          ? 'Không có lệnh SX đang chờ/đang sản xuất để lập kế hoạch.'
          : 'Vui lòng tick chọn ít nhất một lệnh SX để lập kế hoạch.'
      );
      return;
    }

    if (printLocked) {
      setFormError('Kế hoạch sản xuất đã in, không thể sửa nữa.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/ke-hoach-sx', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editPlanId,
          ngay_ke_hoach: parseProductionOrderFilterDate(planDate) || planDate,
          ghi_chu: planHeaderNote.trim(),
          items: buildProductionPlanSaveItems(displayLines)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể lưu kế hoạch sản xuất.');
      }

      await onSaved();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu kế hoạch sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmAndLockPrint = () => {
    if (!editPlanId || printLocked) return true;
    if (!window.confirm('In phiếu sẽ khóa việc sửa kế hoạch sản xuất này. Bạn có chắc chắn muốn in?')) {
      return false;
    }
    setPrintLocked(true);
    fetch('/api/ke-hoach-sx/danh-dau-da-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editPlanId })
    }).catch(() => {});
    return true;
  };

  const handlePrint = async () => {
    if (displayLines.length === 0) return;
    if (!confirmAndLockPrint()) return;
    setFormError('');
    setPrintMaterialsByLine({});
    setPendingPrint(true);
  };

  const handlePrintNvl = async () => {
    if (displayLines.length === 0) return;
    if (!confirmAndLockPrint()) return;
    setIsLoadingNvlPrint(true);
    setFormError('');

    try {
      setNvlPrintMaterialsByLine(await loadProductionPlanMaterials(displayLines));
      setShowNvlPrintSheet(true);
      setPendingNvlPrint(true);
    } catch (error: any) {
      setFormError(error.message || 'Không thể tải thành phần NVL để in phiếu.');
    } finally {
      setIsLoadingNvlPrint(false);
    }
  };

  const handlePrintRelated = async () => {
    if (!planDate) {
      setFormError('Vui lòng chọn ngày kế hoạch trước khi in các phiếu liên quan.');
      return;
    }
    if (!confirmAndLockPrint()) return;
    setIsLoadingRelatedPrint(true);
    setFormError('');

    try {
      const machineSet = new Set<string>();
      displayLines.forEach(line => {
        const position = (line.position || '').trim();
        if (position && position !== '-') machineSet.add(position);
        const order = productionOrders.find(item => item.id === line.id);
        const orderMachine = (order?.machine || '').trim();
        if (orderMachine && orderMachine !== '-') machineSet.add(orderMachine);
      });
      const shifts = selectedRelatedShifts.length > 0 ? selectedRelatedShifts : [];
      const planMachines = Array.from(machineSet);

      const ordersToPrint = displayLines
        .map(line => productionOrders.find(order => order.id === line.id))
        .filter((order): order is ProductionOrderRow => Boolean(order));

      const productCatalog = await loadProductionOrderProductCatalog();
      const orderRefs = collectProductionPlanOrderRefs([
        ...displayLines.map(line => line.orderRef),
        ...ordersToPrint.map(order => order.orderRef)
      ]);
      const [data, orderRes] = await Promise.all([
        loadProductionPlanRelatedReports(planDate, shifts, productCatalog),
        fetch('/api/don-hang')
      ]);

      let customerOrders: OrderRow[] = [];
      const orderData = await orderRes.json().catch(() => ({}));
      const allOrders = orderRes.ok ? normalizeOrders(orderData) : [];
      if (allOrders.length > 0) {
        customerOrders = resolveCustomerOrdersForPrint(allOrders, orderRefs);
        if (customerOrders.length === 0) {
          const linkedCodes = new Set(
            ordersToPrint.flatMap(order => splitProductionOrderRefs(order.orderRef))
          );
          if (linkedCodes.size > 0) {
            customerOrders = allOrders.filter(order => {
              const code = (order.orderCode || '').trim();
              return linkedCodes.has(code) || linkedCodes.has(code.toUpperCase());
            });
          }
        }
        if (customerOrders.length === 0) {
          // Không khớp được mã đơn hàng cụ thể — vẫn in kèm đơn hàng cùng ngày kế hoạch thay vì bỏ trống.
          customerOrders = filterOrdersForProductionDate(allOrders, planDate);
        }
      }

      const printableOrders = (
        await Promise.allSettled(
          ordersToPrint.map(async order => {
            const [{ materials, product }, machineLabel] = await Promise.all([
              loadProductionOrderPrintMaterials(order),
              resolveProductionOrderMachineLabel(order.machine)
            ]);
            return { order, materials, machineLabel, product } as PrintableProductionOrder;
          })
        )
      )
        .filter((result): result is PromiseFulfilledResult<PrintableProductionOrder> => result.status === 'fulfilled')
        .map(result => result.value);

      if (data.isEmpty && printableOrders.length === 0 && customerOrders.length === 0) {
        setFormError('Không tìm thấy lệnh sản xuất hay phiếu nào liên quan tới ngày/ca của kế hoạch để in.');
        return;
      }

      setRelatedPrintCatalog(productCatalog);
      setRelatedPrintCustomerOrders(customerOrders);
      setRelatedPrintOrders(applyWarehouseActualQuantities(printableOrders, data.warehouseSlips));
      setRelatedPrintData(data);

      // BẢNG TỔNG HỢP THEO CA (đặt trang đầu tiên)
      try {
        const [settingRes, materialRes] = await Promise.all([fetch('/api/cai-dat'), fetch('/api/kho-nvl')]);
        const settingData = await settingRes.json().catch(() => ({}));
        const shiftSettings = normalizeShiftSettings(settingData);
        const materialData = await materialRes.json().catch(() => ({}));
        const materials = materialRes.ok ? normalizeMaterialsInventory(materialData) : [];

        const productionOrderRefs = ordersToPrint.map(order => ({
          startDate: order.startDate,
          shift: order.shift,
          productCode: order.productCode,
          productName: order.productName,
          quantity: order.quantity,
          unit: order.unit,
          products: getProductionOrderProductLines(order).map(line => ({
            productCode: line.productCode,
            productName: line.productName,
            quantity: line.quantity,
            unit: line.unit
          }))
        }));

        const warehouseMovements = data.warehouseSlips.flatMap(slip =>
          slip.lines.map(line => ({
            id: `${slip.slipCode || slip.slipDate}-${line.code}`,
            slipCode: slip.slipCode || '',
            slipDate: slip.slipDate || planDate,
            shift: slip.shift || '',
            slipType: slip.slipType,
            warehouseKind: slip.warehouseKind,
            itemCode: line.code,
            itemName: line.name,
            unit: line.unit,
            quantity: line.quantity,
            createdBy: slip.createdBy || ''
          }))
        );

        const summaryRows = buildControlBoardShiftSummary({
          shiftSettings,
          productionOrders: productionOrderRefs,
          products: productCatalog.map(product => ({ code: product.code, totalWeight: product.totalWeight })),
          materials: materials.map(material => ({ code: material.code, totalWeight: material.totalWeight })),
          acceptanceReports: data.acceptance,
          warehouseMovements,
          weighingRecords: data.weighing,
          damagedRecords: data.damaged,
          machineNvlReports: data.machineNvl,
          dateFrom: planDate,
          dateTo: planDate
        }).filter(row => selectedRelatedShifts.length === 0 || selectedRelatedShifts.some(shift => shiftNamesMatch(shift, row.ca)));

        setRelatedShiftSummaryRows(summaryRows);
        setRelatedShiftSummaryFilters({
          dateFrom: planDate,
          dateTo: planDate,
          shiftLabel: selectedRelatedShifts.length > 0 ? selectedRelatedShifts.join(', ') : 'Tất cả ca',
          staffLabel: 'Tất cả nhân viên'
        });
      } catch {
        setRelatedShiftSummaryRows([]);
        setRelatedShiftSummaryFilters(null);
      }

      setPendingRelatedPrint(true);

      const messages: string[] = [];
      if (data.errors.length > 0) {
        messages.push(`Một số loại lỗi khi tải: ${data.errors.join(', ')}.`);
      }
      const droppedByShift = data.diagnostics.filter(d => d.matched === 0 && d.dayTotal > 0);
      if (droppedByShift.length > 0) {
        messages.push(
          `Một số loại phiếu có dữ liệu trong ngày nhưng chưa khớp ca/máy: ${droppedByShift
            .map(d => `${d.label} (${d.dayTotal})`)
            .join(', ')}.`
        );
      }
      const foundSummary = data.diagnostics
        .filter(d => d.matched > 0)
        .map(d => `${d.label}: ${d.matched}`)
        .join(', ');
      if (foundSummary) {
        messages.push(`Đã tải: ${foundSummary}.`);
      }
      messages.push(`Đơn hàng: ${customerOrders.length}.`);
      if (messages.length > 0) {
        setFormError(messages.join(' '));
      }
    } catch (error: any) {
      setFormError(error.message || 'Không thể tải các phiếu liên quan để in.');
    } finally {
      setIsLoadingRelatedPrint(false);
    }
  };

  const loadMaterialAccounting = async () => {
    if (displayLines.length === 0) return;
    setIsLoadingMaterialAccounting(true);
    setMaterialAccountingError('');

    try {
      const [materialsByLine, inventoryRes] = await Promise.all([
        loadProductionPlanMaterials(displayLines),
        fetch('/api/kho-nvl')
      ]);
      const inventoryData = await inventoryRes.json().catch(() => ({}));
      if (!inventoryRes.ok) {
        throw new Error(inventoryData.error || 'Không thể tải Kho NVL để tra Tổng kg.');
      }

      setAccountingMaterialsByLine(materialsByLine);
      setAccountingInventoryMaterials(normalizeMaterialsInventory(inventoryData));
    } catch (error: any) {
      setMaterialAccountingError(error.message || 'Không thể tải thành phần sản phẩm để hạch toán NVL.');
    } finally {
      setIsLoadingMaterialAccounting(false);
    }
  };

  const handleOpenMaterialAccounting = () => {
    if (displayLines.length === 0) return;
    setShowMaterialAccountingModal(true);
    void loadMaterialAccounting();
  };

  const handleExportWarehouseSlip = (materialLines: ProductionPlanWarehouseExportLine[], shift: string) => {
    if (materialLines.length === 0) {
      setMaterialAccountingError('Vui lòng nhập khối lượng xuất dự kiến lớn hơn 0 cho ít nhất một NVL trong ca này.');
      return;
    }

    const shiftOrderCount =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? displayLines.length
        : displayLines.filter(
            line => normalizeProductionPlanShift(line.shift) === normalizeProductionPlanShift(shift)
          ).length;

    const shiftLines =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? displayLines
        : displayLines.filter(
            line => normalizeProductionPlanShift(line.shift) === normalizeProductionPlanShift(shift)
          );

    const resolvedShift =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? [...new Set(shiftLines.map(line => normalizeProductionPlanShift(line.shift)).filter(Boolean))].join(', ')
        : normalizeProductionPlanShift(shift);

    const draft: WarehouseSlipPrefillDraft = {
      slipType: 'xuat',
      warehouseKind: 'nvl',
      slipDate: planDate,
      createdAt: Date.now(),
      reason: resolvedShift ? `Xuất NVL theo kế hoạch sản xuất - ${resolvedShift}` : 'Xuất NVL theo kế hoạch sản xuất',
      note: resolvedShift
        ? `Tạo từ hạch toán định mức NVL (${resolvedShift}, ${shiftOrderCount} lệnh SX).`
        : `Tạo từ hạch toán định mức NVL (${shiftOrderCount} lệnh SX).`,
      createdBy: '',
      productionOrderRef: [...new Set(shiftLines.map(line => line.code).filter(code => code && code !== '-'))].join(
        ', '
      ),
      machine: [...new Set(shiftLines.map(line => line.position).filter(value => value && value !== '-'))].join(', '),
      shift: resolvedShift,
      recipient: [...new Set(shiftLines.map(line => line.staff).filter(value => value && value !== '-'))].join(', '),
      lines: sortWarehouseLinesKgFirst(materialLines).map(line => ({
        code: line.code,
        name: line.name,
        unit: line.unit,
        quantity: String(roundNplNumber(line.actualQuantity)),
        quotaQuantity: String(roundNplNumber(line.quotaQuantity)),
        suggestedQuantity: String(roundNplNumber(line.suggestedQuantity)),
        unitPrice: '',
        lineNote: ''
      }))
    };

    localStorage.setItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY, JSON.stringify(draft));
    setShowMaterialAccountingModal(false);
    onClose();
    onOpenWarehouseSlip();
  };

  const updateLineNote = (lineId: string, note: string) => {
    setPlanLines(prev => prev.map(line => (line.id === lineId ? { ...line, note } : line)));
  };

  const openProductionOrderEdit = async (line: ProductionPlanLine) => {
    const sourceOrder = findProductionOrderForPlanLine(line, effectiveProductionOrders);
    if (!sourceOrder) {
      setFormError('Không tìm thấy lệnh sản xuất để sửa.');
      return;
    }

    setLoadingEditLineId(line.id);
    setFormError('');
    try {
      const [orderRes, productRes] = await Promise.all([
        fetch('/api/don-hang'),
        fetch('/api/san-pham?format=table')
      ]);
      const [orderData, productData] = await Promise.all([
        orderRes.json().catch(() => ({})),
        productRes.json().catch(() => ({}))
      ]);
      if (!orderRes.ok || !productRes.ok) {
        throw new Error('Không thể tải đơn hàng và danh mục sản phẩm để sửa lệnh sản xuất.');
      }

      setEditOrderLookups(normalizeOrders(orderData));
      setEditProductLookups(normalizeProducts(productData));
      setEditingProductionOrder(sourceOrder);
    } catch (error: any) {
      setFormError(error.message || 'Không thể mở form sửa lệnh sản xuất.');
    } finally {
      setLoadingEditLineId('');
    }
  };

  const refreshEditedProductionOrder = async () => {
    const editedId = editingProductionOrder?.id;
    if (!editedId) return;

    try {
      const res = await fetch('/api/lenh-sx');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const updatedOrder = normalizeProductionOrders(data).find(order => order.id === editedId);
      if (updatedOrder) {
        setProductionOrderOverrides(current => ({ ...current, [editedId]: updatedOrder }));
      }
    } catch {
      // Lệnh đã được lưu; giữ modal kế hoạch hoạt động nếu lần làm mới tức thời thất bại.
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">Kế hoạch sản xuất</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Máy, ca, nhân sự và sản phẩm lấy từ lệnh SX. Kéo thả hoặc dùng mũi tên để sắp xếp ưu tiên.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              Đóng
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {formError && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {formError}
              </p>
            )}

            <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày kế hoạch</span>
                <DateInput
                  value={planDate}
                  onChange={setPlanDate}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 pr-10 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <span className="block text-[11px] font-semibold text-zinc-500">
                  {isEditingExistingPlan
                    ? 'Bảng dưới chỉ hiện lệnh SX có ngày bắt đầu trùng ngày này.'
                    : 'Chỉ hiện lệnh SX đúng ngày và chưa nằm trong kế hoạch đã lưu. Tick để chọn lệnh đưa vào kế hoạch.'}
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú kế hoạch</span>
                <input
                  type="text"
                  value={planHeaderNote}
                  onChange={event => setPlanHeaderNote(event.target.value)}
                  placeholder="Ghi chú chung khi lưu snapshot"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Lọc phiếu theo ca (khi in phiếu liên quan)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRelatedShifts(relatedShiftOptions.map(opt => opt.value))}
                    className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRelatedShifts([])}
                    className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {relatedShiftOptions.map(opt => {
                  const checked = selectedRelatedShifts.some(item => shiftNamesMatch(item, opt.value));
                  return (
                    <label
                      key={opt.value}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold transition ${
                        checked ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={event => {
                          const nextChecked = event.target.checked;
                          setSelectedRelatedShifts(current => {
                            const without = current.filter(item => !shiftNamesMatch(item, opt.value));
                            return nextChecked ? [...without, opt.value] : without;
                          });
                        }}
                      />
                      <span>{opt.label || opt.value}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {!isEditingExistingPlan && createModeTableRows.length > 0 ? (
              <section className="mb-4 rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Chọn lệnh SX ({selectedOrderIds.size}/{createModeTableRows.length} đã chọn)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleAllAvailableOrders}
                      className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {allAvailableOrdersSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {isLoadingUsedOrders && !isEditingExistingPlan ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải danh sách lệnh chưa lập kế hoạch...
              </p>
            ) : isEditingExistingPlan ? (
              displayLines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                  Không có lệnh SX đang chờ / đang sản xuất cho ngày {planDate || 'đã chọn'}.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-[980px] w-full text-left text-sm">
                    <thead className="bg-[#ef1b2d] text-[11px] uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-2 py-2 font-black">STT</th>
                        <th className="px-2 py-2 font-black">Tên máy</th>
                        <th className="px-2 py-2 font-black">Ca làm việc</th>
                        <th className="px-2 py-2 font-black">Nhân sự</th>
                        <th className="px-2 py-2 font-black">Lệnh sản xuất</th>
                        <th className="px-2 py-2 font-black">Ghi chú</th>
                        <th className="px-2 py-2 font-black">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {displayLines.map((line, index) => (
                        <tr
                          key={line.id}
                          draggable
                          onDragStart={() => setDragIndex(index)}
                          onDragOver={event => event.preventDefault()}
                          onDrop={() => {
                            if (dragIndex === null) return;
                            reorderLine(dragIndex, index);
                            setDragIndex(null);
                          }}
                          className={dragIndex === index ? 'bg-emerald-50' : 'hover:bg-zinc-50'}
                        >
                          <td className="px-2 py-2 font-black text-emerald-700">{index + 1}</td>
                          <td className="px-2 py-2 font-semibold text-zinc-800">{line.position || '-'}</td>
                          <td className="px-2 py-2 text-zinc-700">{line.shift && line.shift !== '-' ? line.shift : '-'}</td>
                          <td className="px-2 py-2 text-zinc-600">{line.staff && line.staff !== '-' ? line.staff : '-'}</td>
                          <td className="px-2 py-2 font-mono text-xs font-bold text-zinc-900">
                            {formatProductionPlanProductCodes(line)}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <textarea
                              value={line.note}
                              onChange={event => updateLineNote(line.id, event.target.value)}
                              rows={3}
                              className="w-full min-w-[220px] rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                              placeholder="Nhập ghi chú cho lệnh này"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <RowActionsMenu label={`Thao tác dòng ${index + 1}`}>
                              <div className="flex items-center gap-1">
                                {canEditProductionOrder ? (
                                  <button
                                    type="button"
                                    onClick={() => void openProductionOrderEdit(line)}
                                    disabled={Boolean(loadingEditLineId)}
                                    className="flex h-7 w-7 items-center justify-center rounded border border-amber-200 text-amber-700 disabled:opacity-40"
                                    title="Sửa"
                                  >
                                    {loadingEditLineId === line.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Pencil className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => moveLine(index, -1)}
                                  disabled={index === 0}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                                  title="Lên"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveLine(index, 1)}
                                  disabled={index === displayLines.length - 1}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                                  title="Xuống"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <span className="flex h-7 w-7 items-center justify-center text-zinc-400">
                                  <GripVertical className="h-4 w-4" />
                                </span>
                              </div>
                            </RowActionsMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : createModeTableRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Không còn lệnh SX đang chờ / đang sản xuất nào chưa lập kế hoạch cho ngày {planDate || 'đã chọn'}.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-[#ef1b2d] text-[11px] uppercase tracking-wider text-white">
                    <tr>
                      <th className="w-12 px-2 py-2 text-center font-black">
                        <input
                          type="checkbox"
                          aria-label="Chọn tất cả lệnh SX"
                          checked={allAvailableOrdersSelected}
                          onChange={toggleAllAvailableOrders}
                          className="h-4 w-4 cursor-pointer accent-white"
                        />
                      </th>
                      <th className="px-2 py-2 font-black">STT</th>
                      <th className="px-2 py-2 font-black">Ngày</th>
                      <th className="px-2 py-2 font-black">Tên máy</th>
                      <th className="px-2 py-2 font-black">Ca làm việc</th>
                      <th className="px-2 py-2 font-black">Nhân sự</th>
                      <th className="px-2 py-2 font-black">Lệnh sản xuất</th>
                      <th className="px-2 py-2 font-black">Ghi chú</th>
                      <th className="px-2 py-2 font-black">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {createModeTableRows.map((row, index) => {
                      const selectedIndex = row.selected
                        ? displayLines.findIndex(line => line.id === row.line.id)
                        : -1;
                      const line = row.selected && selectedIndex >= 0 ? displayLines[selectedIndex] : row.line;
                      return (
                        <tr
                          key={row.line.id}
                          draggable={row.selected}
                          onDragStart={() => {
                            if (!row.selected || selectedIndex < 0) return;
                            setDragIndex(selectedIndex);
                          }}
                          onDragOver={event => event.preventDefault()}
                          onDrop={() => {
                            if (!row.selected || dragIndex === null || selectedIndex < 0) return;
                            reorderLine(dragIndex, selectedIndex);
                            setDragIndex(null);
                          }}
                          className={
                            !row.selected
                              ? 'bg-zinc-50/80 opacity-70'
                              : dragIndex === selectedIndex
                                ? 'bg-emerald-50'
                                : 'hover:bg-zinc-50'
                          }
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Chọn lệnh ${row.order.code}`}
                              checked={row.selected}
                              onChange={() => toggleOrderSelection(row.line.id)}
                              className="h-4 w-4 cursor-pointer accent-[#ef1b2d]"
                            />
                          </td>
                          <td className="px-2 py-2 font-black text-emerald-700">
                            {row.selected && selectedIndex >= 0 ? selectedIndex + 1 : '-'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-xs font-bold text-zinc-800">
                            {row.order.startDate || '-'}
                          </td>
                          <td className="px-2 py-2 font-semibold text-zinc-800">{line.position || '-'}</td>
                          <td className="px-2 py-2 text-zinc-700">{line.shift && line.shift !== '-' ? line.shift : '-'}</td>
                          <td className="px-2 py-2 text-zinc-600">{line.staff && line.staff !== '-' ? line.staff : '-'}</td>
                          <td className="px-2 py-2 font-mono text-xs font-bold text-zinc-900">
                            {formatProductionPlanProductCodes(line)}
                          </td>
                          <td className="px-2 py-2 align-top">
                            <textarea
                              value={line.note}
                              onChange={event => updateLineNote(line.id, event.target.value)}
                              rows={3}
                              disabled={!row.selected}
                              className="w-full min-w-[220px] rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-100"
                              placeholder={row.selected ? 'Nhập ghi chú cho lệnh này' : 'Tick chọn lệnh để thêm ghi chú'}
                            />
                          </td>
                          <td className="px-2 py-2">
                            {row.selected && selectedIndex >= 0 ? (
                              <RowActionsMenu label={`Thao tác dòng ${selectedIndex + 1}`}>
                                <div className="flex items-center gap-1">
                                  {canEditProductionOrder ? (
                                    <button
                                      type="button"
                                      onClick={() => void openProductionOrderEdit(line)}
                                      disabled={Boolean(loadingEditLineId)}
                                      className="flex h-7 w-7 items-center justify-center rounded border border-amber-200 text-amber-700 disabled:opacity-40"
                                      title="Sửa"
                                    >
                                      {loadingEditLineId === line.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Pencil className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => moveLine(selectedIndex, -1)}
                                    disabled={selectedIndex === 0}
                                    className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                                    title="Lên"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveLine(selectedIndex, 1)}
                                    disabled={selectedIndex === displayLines.length - 1}
                                    className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                                    title="Xuống"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="flex h-7 w-7 items-center justify-center text-zinc-400">
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                </div>
                              </RowActionsMenu>
                            ) : (
                              <span className="text-xs font-semibold text-zinc-400">Chưa chọn</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={() => setPendingStaffAssignmentPrint(true)}
              disabled={displayLines.length === 0}
              className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Users className="h-4 w-4" />
              Phân công nhân sự
            </button>
            <button
              type="button"
              onClick={handleOpenMaterialAccounting}
              disabled={displayLines.length === 0 || isLoadingMaterialAccounting}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMaterialAccounting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Định mức NVL
            </button>
            <button
              type="button"
              onClick={handlePrintNvl}
              disabled={displayLines.length === 0 || isLoadingNvlPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-extrabold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingNvlPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In phiếu NVL
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={displayLines.length === 0 || isLoadingPlanPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingPlanPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In kế hoạch
            </button>
            <button
              type="button"
              onClick={handlePrintRelated}
              disabled={displayLines.length === 0 || isLoadingRelatedPrint}
              title="In gộp tất cả phiếu liên quan (đơn hàng, lệnh SX, tồn NVL, trộn, cân, dừng máy, hàng hỏng, sản lượng, phiếu xuất vật tư) theo ngày + ca của kế hoạch"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-extrabold text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingRelatedPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In tất cả phiếu liên quan
            </button>
            {canCreate ? (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || printLocked || displayLines.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu kế hoạch SX
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {pendingStaffAssignmentPrint
        ? createPortal(
            <StaffAssignmentPrintSheet rows={staffAssignmentRows} planDate={planDate} planNote={planHeaderNote} />,
            document.body
          )
        : null}

      {(relatedPrintOrders.length > 0 || relatedPrintCustomerOrders.length > 0 || relatedPrintData) &&
        createPortal(
          <div className="production-order-print-batch">
            {/* 1. Phiếu đơn hàng */}
            {relatedPrintCustomerOrders.map(order => (
              <div key={`customer-order-${order.id}`} className="production-order-print-page">
                <OrderPrintSheet order={order} />
              </div>
            ))}

            {/* 2. Kế hoạch sản xuất */}
            {displayLines.length > 0 ? (
              <div className="production-order-print-page">
                <ProductionPlanPrintSheet
                  lines={displayLines}
                  materialsByLine={printMaterialsByLine}
                  planDate={planDate}
                  planNote={planHeaderNote}
                />
              </div>
            ) : null}

            {/* 3. Lệnh sản xuất */}
            {relatedPrintOrders.map(item => (
              <div key={`po-${item.order.id}`} className="production-order-print-page">
                <ProductionOrderPrintSheet
                  order={item.order}
                  materials={item.materials}
                  machineLabel={item.machineLabel}
                  product={item.product}
                  productCatalog={relatedPrintCatalog}
                  showActualQuantity
                  portal={false}
                />
              </div>
            ))}

            {/* 4..13. Các phiếu liên quan */}
            {relatedPrintData && <ProductionPlanRelatedPrintContent data={relatedPrintData} />}

            {/* (Ngoài danh sách thứ tự) Bảng tổng hợp ca */}
            {relatedShiftSummaryRows.length > 0 && relatedShiftSummaryFilters ? (
              <div className="production-order-print-page">
                <ControlBoardShiftSummaryPrintBatch rows={relatedShiftSummaryRows} filters={relatedShiftSummaryFilters} />
              </div>
            ) : null}
          </div>,
          document.body
        )}

      {pendingPrint && displayLines.length > 0
        ? createPortal(
            <ProductionPlanPrintSheet
              lines={displayLines}
              materialsByLine={printMaterialsByLine}
              planDate={planDate}
              planNote={planHeaderNote}
            />,
            document.body
          )
        : null}

      {showNvlPrintSheet && displayLines.length > 0
        ? createPortal(
            <ProductionPlanNvlPrintSheet
              planDate={planDate}
              planNote={planHeaderNote}
              shiftGroups={buildProductionPlanNvlPrintGroups(displayLines, nvlPrintMaterialsByLine)}
            />,
            document.body
          )
        : null}

      <ProductionPlanMaterialAccountingModal
        open={showMaterialAccountingModal}
        onClose={() => setShowMaterialAccountingModal(false)}
        lines={displayLines}
        materialsByLine={accountingMaterialsByLine}
        inventoryMaterials={accountingInventoryMaterials}
        isLoading={isLoadingMaterialAccounting}
        error={materialAccountingError}
        onReload={loadMaterialAccounting}
        onExportWarehouseSlip={handleExportWarehouseSlip}
      />

      <EditProductionOrderModal
        open={Boolean(editingProductionOrder)}
        row={editingProductionOrder}
        orders={editOrderLookups}
        productionOrders={effectiveProductionOrders}
        catalogProducts={editProductLookups}
        machines={machines}
        onClose={() => setEditingProductionOrder(null)}
        onSaved={refreshEditedProductionOrder}
      />
    </>
  );
}

export function normalizeProductionOrders(data: unknown): ProductionOrderRow[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { productionOrders?: unknown }).productionOrders;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item): ProductionOrderRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_lenh_sx', 'ma', 'code', 'so_lenh'], '');
      const name = pickText(record, ['ten_lenh_sx', 'ten', 'name', 'tieu_de'], '');
      const productCode = pickText(record, ['ma_hang', 'ma_sp', 'product_code'], '');
      const productName = pickText(record, ['ten_hang', 'ten_sp', 'product_name'], '');
      if (!code && !name && !productCode && !productName) return null;

      const products = parseOrderProductsFromRecord(record);
      const summary = summarizeOrderProducts(products);

      return {
        id: String(record.id ?? '').trim() || code || name || summary.productCode,
        code,
        name,
        productCode: summary.productCode,
        productName: summary.productName,
        quantity: summary.quantity,
        unit: summary.unit,
        products,
        status: pickText(record, ['trang_thai', 'status', 'tinh_trang'], '-'),
        customer: pickText(record, ['khach_hang', 'customer', 'ten_khach_hang'], '-'),
        orderRef: pickText(record, ['ma_don_hang', 'don_hang', 'order_code'], '-'),
        // Form/UI «Ngày»: ưu tiên cột ngay; fallback ngay_bat_dau (khi ngay generated/không ghi được).
        startDate: formatProductionOrderDate(record.ngay ?? record.ngay_bat_dau),
        endDate: formatProductionOrderDate(record.ngay_gio_ket_thuc ?? record.ngay_ket_thuc ?? record.end_date),
        startAt: String(record.ngay_gio_bat_dau ?? record.start_at ?? '').trim(),
        endAt: String(record.ngay_gio_ket_thuc ?? record.end_at ?? '').trim(),
        createdAt: String(record.created_at ?? record.createdAt ?? '').trim(),
        machine: pickText(record, ['may', 'ten_may', 'ma_may', 'machine'], '-'),
        shift: pickText(record, ['ca', 'shift'], '-'),
        staff: pickText(record, ['nhan_su', 'staff', 'nhan_vien'], '-'),
        shiftLead: pickText(record, ['truong_ca', 'shiftLead'], '-'),
        mainStaff: pickText(record, ['nhan_su_chinh', 'mainStaff'], '-'),
        assistantStaff: pickText(record, ['tho_phu', 'assistantStaff'], '-'),
        traineeStaff: pickText(record, ['hoc_viec', 'traineeStaff'], '-'),
        note: pickText(record, ['ghi_chu', 'note', 'mo_ta'], ''),
        position: pickText(record, ['vi_tri', 'position'], '-'),
        priority: Number(record.thu_tu_uu_tien ?? record.priority ?? 0) || 0,
        daIn: record.da_in === true
      };
    })
    .filter((row): row is ProductionOrderRow => Boolean(row));
}

/** Hiển thị ngày của lệnh SX: luôn dd/mm/yyyy, không dùng locale máy. */
export function formatProductionOrderDate(value: unknown): string {
  return formatDateDdMmYyyy(value);
}

export interface ProductionOrderMaterialLine {
  code: string;
  name: string;
  normLabel: string;
  percent: number | null;
  weightKg: number | null;
  proposedQuantity: number;
  unit: string;
  /** KL xuất thực tế từ Lệnh xuất vật tư (phiếu xuất kho NVL) cùng ngày của lệnh SX (mọi ca). */
  actualQuantity?: number | null;
}

export function formatProductionOrderNormLabel(item: ProductNplItem): string {
  if (item.amountType === 'quantity') {
    const unitSuffix = item.unit && item.unit !== '-' ? ` ${item.unit}` : '';
    return `${formatNumber(item.quantity ?? 0, 2)}${unitSuffix}/TP`;
  }
  return `${formatPercent(item.percent ?? 0)}%`;
}

export function formatProductionOrderFinishedWeight(
  orderQuantity: number,
  product?: Pick<ProductRow, 'totalWeight'> | null
) {
  const unitWeight = parseProductSpecNumber(product?.totalWeight ?? '');
  if (unitWeight === null || unitWeight <= 0 || orderQuantity <= 0) return '-';
  return formatProductionOrderPrintQuantity(roundNplNumber(unitWeight * orderQuantity));
}

export function resolveProductUnitNormKg(product?: Pick<ProductRow, 'totalWeight'> | null): number | null {
  const unitWeight = parseProductSpecNumber(product?.totalWeight ?? '');
  return unitWeight !== null && unitWeight > 0 ? unitWeight : null;
}

export function formatProductionOrderProductNorm(product?: Pick<ProductRow, 'totalWeight'> | null): string {
  const normKg = resolveProductUnitNormKg(product);
  return normKg === null ? '-' : formatProductionOrderPrintQuantity(normKg);
}

export function resolveFinishedProductDisplay(
  quantity: string,
  productCode: string,
  productCatalog: ProductRow[],
  fallbackProduct?: ProductRow | null
) {
  const catalogProduct =
    findProductByCode(productCatalog, productCode) ??
    (fallbackProduct && normalizeProductCodeKey(fallbackProduct.code) === normalizeProductCodeKey(productCode)
      ? fallbackProduct
      : null);
  const orderQuantity = parseProductionOrderQuantity(quantity);
  return {
    norm: formatProductionOrderProductNorm(catalogProduct),
    weight: formatProductionOrderFinishedWeight(orderQuantity, catalogProduct)
  };
}

export function parseProductionOrderQuantity(value: string) {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatProductionOrderPrintQuantity(value: string | number, fractionDigits = 2) {
  const numeric = typeof value === 'number' ? value : parseProductionOrderQuantity(String(value));
  return formatNumber(numeric, fractionDigits);
}

export function buildProductionOrderMaterialProposal(
  orderQuantity: number,
  items: ProductNplItem[],
  product?: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'> | null
): ProductionOrderMaterialLine[] {
  const materialBaseKg = resolveProductMaterialBaseKg(product);
  const finishedWeightKg = materialBaseKg > 0 ? materialBaseKg * orderQuantity : orderQuantity;

  return items.map(item => {
    const isPercent = item.amountType !== 'quantity';
    const percent = isPercent ? item.percent ?? 0 : null;
    const weightKg = isPercent ? roundNplNumber((finishedWeightKg * (item.percent ?? 0)) / 100) : null;
    if (isPercent) {
      return {
        code: item.code,
        name: item.name || item.code,
        normLabel: formatProductionOrderNormLabel(item),
        percent,
        weightKg,
        proposedQuantity: weightKg ?? 0,
        unit: 'kg'
      };
    }

    const qtyPerSp =
      item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null;
    const weightPerSp =
      item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg > 0 ? item.weightKg : null;
    if (qtyPerSp != null) {
      return {
        code: item.code,
        name: item.name || item.code,
        normLabel: formatProductionOrderNormLabel(item),
        percent: null,
        weightKg: weightPerSp != null ? roundNplNumber(weightPerSp * orderQuantity) : null,
        proposedQuantity: roundNplNumber(qtyPerSp * orderQuantity),
        unit: item.unit && item.unit !== '-' ? item.unit : ''
      };
    }
    // BOM chỉ có Kg/SP (vd BDT 0.0085): điền khối lượng kg.
    const kgTotal = weightPerSp != null ? roundNplNumber(weightPerSp * orderQuantity) : 0;
    return {
      code: item.code,
      name: item.name || item.code,
      normLabel: formatProductionOrderNormLabel(item),
      percent: null,
      weightKg: kgTotal > 0 ? kgTotal : null,
      proposedQuantity: kgTotal,
      unit: 'kg'
    };
  });
}

/**
 * Điền NVL theo định mức BOM, nhưng tổng kg nhựa lấy từ phiếu cân thực tế (can_tu_dong).
 * - NVL %: phân bổ actualPlasticKg theo % ĐM
 * - NVL SL/ĐVT khác: SL = định mức × số lần cân; nếu BOM chỉ có kg/SP thì lấy kg × số lần cân
 */
export function buildProductionOrderMaterialProposalFromActualWeighing(
  actualProductQty: number,
  actualPlasticKg: number,
  items: ProductNplItem[],
  product?: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'> | null
): ProductionOrderMaterialLine[] {
  const qty = Number.isFinite(actualProductQty) && actualProductQty > 0 ? actualProductQty : 0;
  const plasticBase =
    Number.isFinite(actualPlasticKg) && actualPlasticKg > 0
      ? actualPlasticKg
      : (() => {
          const materialBaseKg = resolveProductMaterialBaseKg(product);
          return materialBaseKg > 0 && qty > 0 ? materialBaseKg * qty : 0;
        })();

  return items.map(item => {
    const isPercent = item.amountType !== 'quantity';
    const percent = isPercent ? item.percent ?? 0 : null;
    if (isPercent) {
      const weightKg = roundNplNumber((plasticBase * (item.percent ?? 0)) / 100);
      return {
        code: item.code,
        name: item.name || item.code,
        normLabel: formatProductionOrderNormLabel(item),
        percent,
        weightKg,
        proposedQuantity: weightKg,
        unit: 'kg'
      };
    }

    const qtyPerSp =
      item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null;
    const weightPerSp =
      item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg > 0 ? item.weightKg : null;
    if (qtyPerSp != null) {
      return {
        code: item.code,
        name: item.name || item.code,
        normLabel: formatProductionOrderNormLabel(item),
        percent: null,
        weightKg: weightPerSp != null ? roundNplNumber(weightPerSp * qty) : null,
        proposedQuantity: roundNplNumber(qtyPerSp * qty),
        unit: item.unit && item.unit !== '-' ? item.unit : ''
      };
    }
    const kgTotal = weightPerSp != null ? roundNplNumber(weightPerSp * qty) : 0;
    return {
      code: item.code,
      name: item.name || item.code,
      normLabel: formatProductionOrderNormLabel(item),
      percent: null,
      weightKg: kgTotal > 0 ? kgTotal : null,
      proposedQuantity: kgTotal,
      unit: 'kg'
    };
  });
}

let productNplCache: ProductRow[] | null = null;
let productNplCachePromise: Promise<ProductRow[]> | null = null;

async function loadProductsForPrint(): Promise<ProductRow[]> {
  if (productNplCache) return productNplCache;
  if (productNplCachePromise) return productNplCachePromise;

  productNplCachePromise = fetch('/api/san-pham?format=table')
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
      }
      return normalizeProducts(data);
    })
    .then(products => {
      productNplCache = products;
      return products;
    })
    .finally(() => {
      productNplCachePromise = null;
    });

  return productNplCachePromise;
}

export async function loadProductionOrderProductCatalog(): Promise<ProductRow[]> {
  return loadProductsForPrint();
}

export async function fetchProductPrintData(
  productCode: string
): Promise<{ items: ProductNplItem[]; product: ProductRow | null }> {
  const codes = productCode
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  if (codes.length === 0) return { items: [], product: null };

  const products = await loadProductsForPrint();
  const primaryProduct = findProductByCode(products, codes[0]) ?? null;
  const merged = new Map<string, ProductNplItem>();

  codes.forEach(code => {
    const product = findProductByCode(products, code);
    (product?.nplItems ?? []).forEach(item => {
      const key = `${item.code}__${item.amountType}__${item.unit}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        return;
      }

      if (item.amountType === 'quantity') {
        existing.quantity = roundNplNumber((existing.quantity ?? 0) + (item.quantity ?? 0));
      } else {
        existing.percent = roundNplNumber((existing.percent ?? 0) + (item.percent ?? 0));
      }
    });
  });

  return { items: [...merged.values()], product: primaryProduct };
}

async function fetchProductNplItems(productCode: string): Promise<ProductNplItem[]> {
  const { items } = await fetchProductPrintData(productCode);
  return items;
}

export async function loadProductionOrderPrintMaterials(
  order: Pick<ProductionOrderRow, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>
): Promise<{ materials: ProductionOrderMaterialLine[]; product: ProductRow | null }> {
  const productLines = getProductionOrderProductLines(order);
  if (productLines.length === 0) return { materials: [], product: null };

  let primaryProduct: ProductRow | null = null;
  const merged = new Map<string, ProductionOrderMaterialLine>();

  for (const line of productLines) {
    const { items, product } = await fetchProductPrintData(line.productCode);
    if (!primaryProduct && product) primaryProduct = product;

    const lineQuantity = parseProductionOrderQuantity(line.quantity);
    buildProductionOrderMaterialProposal(lineQuantity, items, product).forEach(material => {
      const key = `${normalizeProductCodeKey(material.code)}__${material.unit || '-'}`;
      const existing = merged.get(key);
      if (existing) {
        existing.proposedQuantity = roundNplNumber(existing.proposedQuantity + material.proposedQuantity);
      } else {
        merged.set(key, { ...material });
      }
    });
  }

  return { materials: [...merged.values()], product: primaryProduct };
}

/**
 * Gán KL xuất thực tế từ các Lệnh xuất vật tư (phiếu xuất kho NVL cùng ngày kế hoạch)
 * vào bảng định mức NVL của từng lệnh SX, khớp theo ngày + mã NVL (không lọc ca).
 */
export function applyWarehouseActualQuantities(
  items: PrintableProductionOrder[],
  warehouseSlips: Array<{ shift?: string; lines: Array<{ code: string; quantity: number }> }>
): PrintableProductionOrder[] {
  return items.map(item => {
    const totalsByMaterial = new Map<string, number>();
    warehouseSlips.forEach(slip => {
      slip.lines.forEach(line => {
        const key = normalizeProductCodeKey(line.code);
        if (!key) return;
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        totalsByMaterial.set(key, roundNplNumber((totalsByMaterial.get(key) ?? 0) + quantity));
      });
    });

    return {
      ...item,
      materials: item.materials.map(material => ({
        ...material,
        actualQuantity: totalsByMaterial.get(normalizeProductCodeKey(material.code)) ?? null
      }))
    };
  });
}

let machinePrintCache: MachineRow[] | null = null;

export async function resolveProductionOrderMachineLabel(machineValue: string): Promise<string> {
  const value = machineValue.trim();
  if (!value || value === '-') return '-';

  if (!machinePrintCache) {
    const res = await fetch('/api/danh-sach-may');
    const data = await res.json().catch(() => ({}));
    machinePrintCache = res.ok ? normalizeMachines(data) : [];
  }

  const match = machinePrintCache.find(
    machine => machine.code === value || machine.name === value || machine.id === value
  );
  return match?.name || value;
}

export function formatProductionOrderPrintDate(value?: string) {
  if (!value || value === '-') {
    return formatDateDdMmYyyy(new Date());
  }
  const formatted = formatProductionOrderDate(value);
  return formatted === '-' ? String(value).trim() : formatted;
}

export function ProductionOrderPrintSheet({
  order,
  materials,
  machineLabel,
  product,
  productCatalog = [],
  shiftSettings = [],
  showActualQuantity = false,
  portal = true
}: {
  order: ProductionOrderRow;
  materials: ProductionOrderMaterialLine[];
  machineLabel?: string;
  product?: ProductRow | null;
  productCatalog?: ProductRow[];
  shiftSettings?: ProductionOrderLookupSetting[];
  /** Hiện cột KL thực tế lấy từ Lệnh xuất vật tư cùng ngày (mọi ca). */
  showActualQuantity?: boolean;
  /** Portal ra body để tránh #root overflow:hidden làm phiếu in trắng. */
  portal?: boolean;
}) {
  const printDate = formatProductionOrderPrintDate(order.startDate);
  const shiftLabel = formatProductionOrderShiftLabel(order.shift, shiftSettings);
  const productLines = getProductionOrderProductLines(order);
  const staffLabel =
    order.staff && order.staff !== '-'
      ? order.staff.replace(/,/g, ' + ')
      : '-';
  const machineName =
    machineLabel && machineLabel !== '-'
      ? machineLabel
      : order.machine && order.machine !== '-'
        ? order.machine
        : '-';
  const costObject = machineName;

  const sheet = (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img
            src={vietNhatLogoUrl}
            alt={PRINT_COMPANY_NAME}
            className="production-order-print-logo"
          />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">LỆNH SẢN XUẤT</h1>

        <div className="production-order-print-meta">
          <span>Số: {order.code || '-'}</span>
          <span>Ngày: {printDate}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Ca sản xuất</th>
              <th>Máy sản xuất</th>
              <th>Nhân sự phụ trách</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-center production-order-print-shift-cell">{shiftLabel}</td>
              <td>{machineName}</td>
              <td>{staffLabel}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">1. Thành phẩm:</h2>
        <table className="production-order-print-grid-table production-order-print-product-table">
          <thead>
            <tr>
              <th>Mã TP</th>
              <th>Tên thành phẩm</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Định mức (kg/cuộn)</th>
              <th>Tổng trọng lượng (kg)</th>
              <th>Đối tượng THCP</th>
            </tr>
          </thead>
          <tbody>
            {productLines.length > 0 ? (
              productLines.map((line, index) => {
                const { norm, weight } = resolveFinishedProductDisplay(
                  line.quantity,
                  line.productCode,
                  productCatalog,
                  product
                );
                return (
                <tr key={`${line.productCode}-${index}`}>
                  <td>{line.productCode || '-'}</td>
                  <td className="production-order-print-product-name-cell">{line.productName || '-'}</td>
                  <td className="production-order-print-center">{line.unit && line.unit !== '-' ? line.unit : '-'}</td>
                  <td className="production-order-print-right">{formatProductionOrderPrintQuantity(line.quantity)}</td>
                  <td className="production-order-print-right">{norm}</td>
                  <td className="production-order-print-right">{weight}</td>
                  <td>{costObject}</td>
                </tr>
                );
              })
            ) : (
              (() => {
                const { norm, weight } = resolveFinishedProductDisplay(
                  order.quantity,
                  order.productCode,
                  productCatalog,
                  product
                );
                return (
              <tr>
                <td>{order.productCode || '-'}</td>
                <td className="production-order-print-product-name-cell">{order.productName || '-'}</td>
                <td className="production-order-print-center">{order.unit && order.unit !== '-' ? order.unit : '-'}</td>
                <td className="production-order-print-right">{formatProductionOrderPrintQuantity(order.quantity)}</td>
                <td className="production-order-print-right">{norm}</td>
                <td className="production-order-print-right">{weight}</td>
                <td>{costObject}</td>
              </tr>
                );
              })()
            )}
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">2. Định mức nguyên vật liệu</h2>
        {materials.length === 0 ? (
          <p className="production-order-print-materials-empty">
            Sản phẩm chưa khai báo thành phần NPL. Vào Sản phẩm → tab Thành phần để nhập định mức.
          </p>
        ) : (
          <table
            className={`production-order-print-grid-table production-order-print-materials-table${
              showActualQuantity ? ' production-order-print-materials-table--actual' : ''
            }`}
          >
            <thead>
              <tr>
                <th>Mã nguyên vật liệu</th>
                <th>Tên nguyên vật liệu</th>
                <th>ĐVT</th>
                <th>Định mức (%)</th>
                <th>Số lượng</th>
                {showActualQuantity && <th>KL thực tế (kg)</th>}
              </tr>
            </thead>
            <tbody>
              {materials.map((line, index) => (
                <tr key={`${line.code}-${index}`}>
                  <td>{line.code}</td>
                  <td>{line.name}</td>
                  <td className="production-order-print-center">{line.unit || '-'}</td>
                  <td className="production-order-print-right">{line.percent !== null ? `${formatPercent(line.percent)}%` : '-'}</td>
                  <td className="production-order-print-right">{formatProductionOrderPrintQuantity(line.proposedQuantity)}</td>
                  {showActualQuantity && (
                    <td className="production-order-print-right">
                      {line.actualQuantity != null ? formatProductionOrderPrintQuantity(line.actualQuantity) : '-'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="production-order-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Thủ kho</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Kế toán</p>
            <span>(Ký, họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!portal || typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
}

export type PrintableProductionOrder = {
  order: ProductionOrderRow;
  materials: ProductionOrderMaterialLine[];
  machineLabel: string;
  product: ProductRow | null;
};

export function ProductionOrderBatchPrintSheets({
  items,
  shiftSettings = [],
  productCatalog = []
}: {
  items: PrintableProductionOrder[];
  shiftSettings?: ProductionOrderLookupSetting[];
  productCatalog?: ProductRow[];
}) {
  if (items.length === 0) return null;

  const content = (
    <div className="production-order-print-batch">
      {items.map(item => (
        <div key={item.order.id} className="production-order-print-page">
          <ProductionOrderPrintSheet
            order={item.order}
            materials={item.materials}
            machineLabel={item.machineLabel}
            product={item.product}
            productCatalog={productCatalog}
            shiftSettings={shiftSettings}
            portal={false}
          />
        </div>
      ))}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}

export function useProductionOrderPrint() {
  const [printingOrder, setPrintingOrder] = useState<ProductionOrderRow | null>(null);
  const [printingMaterials, setPrintingMaterials] = useState<ProductionOrderMaterialLine[]>([]);
  const [printingProduct, setPrintingProduct] = useState<ProductRow | null>(null);
  const [printingProductCatalog, setPrintingProductCatalog] = useState<ProductRow[]>([]);
  const [printingMachineLabel, setPrintingMachineLabel] = useState('');
  const [shiftSettings, setShiftSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [isLoadingPrint, setIsLoadingPrint] = useState(false);

  useEffect(() => {
    fetch('/api/cai-dat')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setShiftSettings(data ? mapProductionOrderSettings(data) : []))
      .catch(() => setShiftSettings([]));
  }, []);

  const printProductionOrder = async (order: ProductionOrderRow, onPrinted?: () => void) => {
    if (!order.daIn) {
      if (!window.confirm('In phiếu sẽ khóa việc sửa lệnh sản xuất này. Bạn có chắc chắn muốn in?')) {
        return;
      }
      fetch('/api/lenh-sx/danh-dau-da-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [order.id] })
      }).catch(() => {});
      onPrinted?.();
    }
    setIsLoadingPrint(true);
    try {
      const [productCatalog, { materials, product }, machineLabel] = await Promise.all([
        loadProductionOrderProductCatalog(),
        loadProductionOrderPrintMaterials(order),
        resolveProductionOrderMachineLabel(order.machine)
      ]);
      setPrintingMaterials(materials);
      setPrintingProduct(product);
      setPrintingProductCatalog(productCatalog);
      setPrintingMachineLabel(machineLabel);
      setPrintingOrder(order);
      setPendingPrint(true);
    } catch (error) {
      console.error('Không thể in lệnh SX:', error);
      window.alert('Không thể tải thành phần sản phẩm để in lệnh SX.');
    } finally {
      setIsLoadingPrint(false);
    }
  };

  useEffect(() => {
    if (!pendingPrint || !printingOrder) return;

    let cancelled = false;
    document.body.classList.add('production-order-print-active');
    enablePortraitPrintPage('production-order-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('production-order-print-page-portrait');
        }
      });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('production-order-print-active');
      disablePortraitPrintPage('production-order-print-page-portrait');
    };
  }, [pendingPrint, printingOrder, printingMaterials, printingProduct, printingMachineLabel]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('production-order-print-active');
      disablePortraitPrintPage('production-order-print-page-portrait');
      setPrintingOrder(null);
      setPrintingMaterials([]);
      setPrintingProduct(null);
      setPrintingProductCatalog([]);
      setPrintingMachineLabel('');
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return {
    printingOrder,
    printingMaterials,
    printingProduct,
    printingProductCatalog,
    printingMachineLabel,
    shiftSettings,
    isLoadingPrint,
    printProductionOrder
  };
}

export const PRODUCTION_ORDER_STATUS_OPTIONS = ['Chờ sx', 'Đang sx', 'Hoàn thành', 'Hủy'];
export const PRODUCTION_ORDER_EDIT_STATUS_OPTIONS = [
  ...PRODUCTION_ORDER_STATUS_OPTIONS,
  'Đang chạy',
  'Huỷ lệnh'
];

export type ProductionOrderLookupSetting = {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  group: string;
  timeFrame: string;
  note: string;
};

export function mapProductionOrderSettings(data: unknown): ProductionOrderLookupSetting[] {
  if (!data || typeof data !== 'object') return [];
  const settings = (data as { settings?: unknown }).settings;
  if (!Array.isArray(settings)) return [];

  return settings.map(item => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id ?? ''),
      code: pickText(record, ['ma_cai_dat', 'ma', 'code'], ''),
      name: pickText(record, ['ten_cai_dat', 'hang_muc', 'name'], ''),
      loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
      group: pickText(record, ['nhom', 'group'], '-'),
      timeFrame: formatCell(record.khung_gio),
      note: pickText(record, ['ghi_chu', 'note'], '')
    };
  });
}

export function toDatetimeLocalValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Chuyển ngày lệnh SX (ISO / dd/mm/yyyy / datetime) → YYYY-MM-DD; không fallback ngày tạo. */
export function parseProductionOrderDateToIso(value: string): string {
  return parseDateToIso(value);
}

export function toDatetimeLocalInputValue(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;

  const isoDate = parseProductionOrderDateToIso(raw);
  if (isoDate) return `${isoDate}T08:00`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDatetimeLocalValue(parsed);
}

export function todayIsoDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function extractProductionOrderDate(datetimeLocal: string) {
  const fromFlexible = parseProductionOrderDateToIso(datetimeLocal);
  if (fromFlexible) return fromFlexible;
  if (!datetimeLocal) return todayIsoDate();
  const datePart = datetimeLocal.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : todayIsoDate();
}

export function mergeProductionOrderDateTime(date: string, datetimeLocal: string) {
  const timePart =
    datetimeLocal && datetimeLocal.includes('T')
      ? datetimeLocal.split('T')[1]?.slice(0, 5) || '08:00'
      : '08:00';
  return date ? `${date}T${timePart}` : datetimeLocal;
}

function addProductionOrderDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + days);
  return todayIsoDate(parsed);
}

function getProductionShiftDateTimeDefaults(
  date: string,
  shift: string,
  settings: ProductionOrderLookupSetting[]
) {
  if (!date || !shift) return null;

  const normalizedShift = shift.trim().toLowerCase();
  const setting = settings.find(item =>
    [item.name, item.code].some(value => value.trim().toLowerCase() === normalizedShift)
  );
  const match = `${setting?.timeFrame || ''} ${shift}`.match(
    /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/
  );
  if (!match) return null;

  const start = `${match[1].padStart(2, '0')}:${match[2]}`;
  const end = `${match[3].padStart(2, '0')}:${match[4]}`;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);
  const endDate = endMinutes <= startMinutes ? addProductionOrderDays(date, 1) : date;

  return {
    startDateTime: `${date}T${start}`,
    endDateTime: `${endDate}T${end}`
  };
}

export function settingMatchesShift(setting: ProductionOrderLookupSetting, shift: string) {
  if (!shift) return false;
  const needle = shift.toLowerCase();
  return [setting.group, setting.name, setting.timeFrame, setting.note, setting.code]
    .some(value => value && value !== '-' && value.toLowerCase().includes(needle));
}

export function formatProductionOrderShiftLabel(shift: string, settings: ProductionOrderLookupSetting[] = []) {
  const trimmed = shift.trim();
  if (!trimmed || trimmed === '-') return '-';

  if (/\(\s*\d{1,2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();

  const matchedSetting = settings.find(setting => {
    const candidates = [setting.name, setting.code].filter(value => value && value !== '-');
    return candidates.some(value => String(value ?? '').trim().toLowerCase() === normalized);
  });
  const timeFrame = matchedSetting?.timeFrame && matchedSetting.timeFrame !== '-' ? matchedSetting.timeFrame : '';
  if (timeFrame) return `${trimmed} (${timeFrame})`;

  const standardMatch = STANDARD_SHIFTS.find(option => {
    const base = option.replace(/\s*\([^)]*\).*$/, '').trim().toLowerCase();
    return option.toLowerCase() === normalized || base === normalized;
  });
  if (standardMatch) return standardMatch;

  return trimmed;
}

export function parseRowQuantity(raw: string): number {
  const num = parsePercentInput(raw);
  return Number.isFinite(num) ? num : 0;
}

export function getOrderProductQuantity(orders: OrderRow[], orderRef: string, productCode: string): number {
  const orderRefs = new Set(splitProductionOrderRefs(orderRef));
  return orders
    .filter(order => orderRefs.has(order.orderCode))
    .reduce((sum, order) => {
      const lines = getOrderProductLines(order);
      return (
        sum +
        lines
          .filter(line => line.productCode === productCode)
          .reduce((lineSum, line) => lineSum + parseRowQuantity(line.quantity), 0)
      );
    }, 0);
}

export function getAllocatedProductionQuantity(
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string
): number {
  const orderRefs = new Set(splitProductionOrderRefs(orderRef));
  return productionOrders
    .reduce((sum, po) => {
      return (
        sum +
        getProductionOrderProductLines(po)
          .filter(line => {
            const lineRefs = splitProductionOrderRefs(line.orderRef || po.orderRef);
            return line.productCode === productCode && lineRefs.some(ref => orderRefs.has(ref));
          })
          .reduce((lineSum, line) => lineSum + parseRowQuantity(line.quantity), 0)
      );
    }, 0);
}

export function getRemainingProductionQuantity(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string
): number {
  const ordered = getOrderProductQuantity(orders, orderRef, productCode);
  const allocated = getAllocatedProductionQuantity(productionOrders, orderRef, productCode);
  return Math.max(0, ordered - allocated);
}

export function getOrderProductUnit(orders: OrderRow[], orderRef: string, productCode: string): string {
  const orderRefs = new Set(splitProductionOrderRefs(orderRef));
  const line = orders
    .filter(order => orderRefs.has(order.orderCode))
    .flatMap(order => getOrderProductLines(order))
    .find(item => item.productCode === productCode);
  return line?.unit && line.unit !== '-' ? line.unit : '';
}

export function buildProductionEntryLine(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string,
  productName = '',
  unit = ''
): Pick<ProductionOrderEntryLine, 'productCode' | 'productName' | 'quantity' | 'unit'> {
  const remaining = getRemainingProductionQuantity(orders, productionOrders, orderRef, productCode);
  return {
    productCode,
    productName,
    quantity: remaining > 0 ? String(remaining) : '',
    unit: unit || getOrderProductUnit(orders, orderRef, productCode)
  };
}

function parseProductionEntryQuantity(value: string): number {
  const parsed = Number(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeProductionOrderRefs(...refs: string[]): string {
  return [...new Set(refs.flatMap(ref => splitProductionOrderRefs(ref)))].join(', ');
}

/** Gộp các dòng trùng mã hàng: cộng số lượng, gộp mã đơn. */
export function mergeProductionOrderEntryLinesByProductCode(
  lines: ProductionOrderEntryLine[]
): ProductionOrderEntryLine[] {
  const merged: ProductionOrderEntryLine[] = [];
  const indexByCode = new Map<string, number>();

  for (const line of lines) {
    const productCode = String(line.productCode || '').trim();
    if (!productCode || productCode === '-') {
      merged.push(line);
      continue;
    }

    const codeKey = normalizeProductCodeKey(productCode);
    const existingIndex = indexByCode.get(codeKey);
    if (existingIndex === undefined) {
      indexByCode.set(codeKey, merged.length);
      merged.push({ ...line, productCode });
      continue;
    }

    const existing = merged[existingIndex];
    const totalQty =
      parseProductionEntryQuantity(existing.quantity) + parseProductionEntryQuantity(line.quantity);

    merged[existingIndex] = {
      ...existing,
      orderRef: mergeProductionOrderRefs(existing.orderRef, line.orderRef),
      productName: existing.productName.trim() || line.productName,
      unit: existing.unit.trim() || line.unit,
      quantity: totalQty > 0 ? String(totalQty) : existing.quantity || line.quantity
    };
  }

  return merged;
}

export function autofillProductKey(orderRef: string, productCode: string) {
  return `${orderRef}::${productCode}`;
}

export type AutofillProductCandidate = {
  key: string;
  orderRef: string;
  productCode: string;
  productName: string;
  unit: string;
  remainingQty: number;
};

/** Gộp sản phẩm cùng mã (nhiều đơn) — cộng còn lại, gộp mã đơn. */
export function groupAutofillProductsByCode(products: AutofillProductCandidate[]) {
  const groups: Array<{
    codeKey: string;
    productCode: string;
    productName: string;
    unit: string;
    remainingQty: number;
    orderRefs: string[];
    keys: string[];
  }> = [];
  const indexByCode = new Map<string, number>();

  for (const product of products) {
    const productCode = String(product.productCode || '').trim();
    if (!productCode || productCode === '-') continue;
    const codeKey = normalizeProductCodeKey(productCode);
    const existingIndex = indexByCode.get(codeKey);
    if (existingIndex === undefined) {
      indexByCode.set(codeKey, groups.length);
      groups.push({
        codeKey,
        productCode,
        productName: product.productName,
        unit: product.unit,
        remainingQty: Number(product.remainingQty) || 0,
        orderRefs: product.orderRef.trim() ? [product.orderRef.trim()] : [],
        keys: [product.key]
      });
      continue;
    }

    const group = groups[existingIndex];
    group.remainingQty += Number(product.remainingQty) || 0;
    const orderRef = product.orderRef.trim();
    if (orderRef && !group.orderRefs.includes(orderRef)) group.orderRefs.push(orderRef);
    if (!group.keys.includes(product.key)) group.keys.push(product.key);
    if (!group.productName.trim()) group.productName = product.productName;
    if (!group.unit.trim()) group.unit = product.unit;
  }

  return groups;
}

export function splitProductionOrderRefs(orderRef: string): string[] {
  return String(orderRef || '')
    .split(/[,;+]/)
    .map(part => part.trim())
    .filter(part => part && part !== '-');
}

export function filterOrdersForProductionDate(
  orders: OrderRow[],
  selectedDate: string
): OrderRow[] {
  const date = selectedDate.trim();
  if (!date || orders.length === 0) return [];

  return orders
    .filter(order => {
      if (!order.orderCode || order.orderCode === '-') return false;
      return parseProductionOrderFilterDate(order.orderDate || '') === date;
    })
    .sort((a, b) => a.orderCode.localeCompare(b.orderCode, 'vi'));
}

export function listProductOptionsForOrder(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  catalogProducts: ProductRow[],
  orderRef: string
) {
  if (!orderRef) return [];

  const orderRefs = new Set(splitProductionOrderRefs(orderRef));

  const fromOrders = orders
    .filter(order => orderRefs.has(order.orderCode))
    .flatMap(order =>
      getOrderProductLines(order).map(line => ({
        code: line.productCode,
        name: line.productName,
        unit: line.unit && line.unit !== '-' ? line.unit : ''
      }))
    )
    .filter(item => item.code && item.code !== '-');

  const unique = new Map<string, { name: string; unit: string }>();
  fromOrders.forEach(item => unique.set(item.code, { name: item.name || item.code, unit: item.unit }));

  if (unique.size === 0) {
    catalogProducts.forEach(product => {
      if (product.code) {
        unique.set(product.code, {
          name: product.name || product.code,
          unit: product.unit && product.unit !== '-' ? product.unit : ''
        });
      }
    });
  }

  return [...unique.entries()]
    .map(([code, meta]) => ({
      code,
      name: meta.name,
      unit: meta.unit,
      orderQty: getOrderProductQuantity(orders, orderRef, code),
      remainingQty: getRemainingProductionQuantity(orders, productionOrders, orderRef, code)
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

export type ProductionOrderEntryLine = {
  key: string;
  orderRef: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
};

export type ProductionOrderFormState = {
  code: string;
  name: string;
  entryLines: ProductionOrderEntryLine[];
  status: string;
  shift: string;
  selectedStaffIds: string[];
  shiftLeadId: string;
  mainStaffId: string;
  assistantStaffId: string;
  traineeStaffId: string;
  startDate: string;
  startDateTime: string;
  endDateTime: string;
  machine: string;
  note: string;
};

const PRODUCTION_ORDER_DRAFT_STORAGE_KEY = 'lenh_sx_add_draft_v1';

type ProductionOrderDraft = {
  form: ProductionOrderFormState;
  selectedShifts: string[];
  savedAt: number;
};

function readProductionOrderDraft(): ProductionOrderDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTION_ORDER_DRAFT_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;

    const record = parsed as Record<string, unknown>;
    const rawForm = record.form;
    const savedAt = Number(record.savedAt);
    if (!rawForm || typeof rawForm !== 'object' || !Number.isFinite(new Date(savedAt).getTime())) return null;

    const formRecord = rawForm as Record<string, unknown>;
    const rawLines = Array.isArray(formRecord.entryLines) ? formRecord.entryLines : [];
    const entryLines = rawLines
      .filter(line => line && typeof line === 'object')
      .map(line => ({ ...newProductionOrderEntryLine(), ...(line as Partial<ProductionOrderEntryLine>) }));

    return {
      form: {
        ...emptyProductionOrderForm(),
        ...formRecord,
        entryLines: entryLines.length > 0 ? entryLines : [newProductionOrderEntryLine()]
      } as ProductionOrderFormState,
      selectedShifts: Array.isArray(record.selectedShifts)
        ? record.selectedShifts.filter((shift): shift is string => typeof shift === 'string')
        : [],
      savedAt
    };
  } catch {
    return null;
  }
}

function hasProductionOrderDraftContent(form: ProductionOrderFormState, selectedShifts: string[]) {
  const empty = emptyProductionOrderForm();
  return Boolean(
    form.code.trim() ||
      form.name.trim() ||
      form.entryLines.some(line => line.orderRef.trim() || line.productCode.trim() || line.quantity.trim()) ||
      form.status !== empty.status ||
      form.shift.trim() ||
      selectedShifts.length > 0 ||
      form.selectedStaffIds.length > 0 ||
      form.shiftLeadId ||
      form.mainStaffId ||
      form.assistantStaffId ||
      form.traineeStaffId ||
      form.startDate !== empty.startDate ||
      form.endDateTime.trim() ||
      form.machine.trim() ||
      form.note.trim()
  );
}

function formatProductionOrderDraftTime(value: number) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value)).replace(/\//g, '-');
}

type ProductionStaffRoleKey = 'shiftLeadId' | 'mainStaffId' | 'assistantStaffId' | 'traineeStaffId';

/** Phòng ban nguồn cho Trưởng ca / NS chính / Thợ phụ (/ Học việc) trên lệnh SX */
const PRODUCTION_WORKSHOP_DEPARTMENT = 'PHÂN XƯỞNG SẢN XUẤT';

const PRODUCTION_STAFF_ROLES: Array<{ key: ProductionStaffRoleKey; label: string }> = [
  { key: 'shiftLeadId', label: 'Trưởng ca' },
  { key: 'mainStaffId', label: 'Nhân sự chính' },
  { key: 'assistantStaffId', label: 'Thợ phụ' },
  { key: 'traineeStaffId', label: 'Học việc' }
];

function normalizeStaffPositionText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[_/|,;+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProductionWorkshopDepartment(name: string) {
  const normalized = normalizeStaffPositionText(name);
  if (!normalized) return false;
  const target = normalizeStaffPositionText(PRODUCTION_WORKSHOP_DEPARTMENT);
  if (normalized === target || normalized.includes(target) || target.includes(normalized)) return true;
  // Biến thể tên phòng trên hệ thống / dữ liệu cũ
  if (normalized.includes('phan xuong')) return true;
  if (normalized === 'san xuat' || normalized === 'px san xuat') return true;
  return false;
}

function collectProductionWorkshopStaff(branches: HrBranch[]): HrMember[] {
  const byId = new Map<string, HrMember>();

  for (const branch of branches) {
    for (const department of branch.departments) {
      const deptMatch = isProductionWorkshopDepartment(department.name);
      for (const member of department.members) {
        const assignedMatch = (member.assignedPositions ?? []).some(item =>
          isProductionWorkshopDepartment(item.department)
        );
        if (!deptMatch && !assignedMatch) continue;
        const key = String(member.id || member.code || member.name);
        if (!key || byId.has(key)) continue;
        byId.set(key, member);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function newProductionOrderEntryLine(): ProductionOrderEntryLine {
  return {
    key: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderRef: '',
    productCode: '',
    productName: '',
    quantity: '',
    unit: ''
  };
}

export function emptyProductionOrderForm(): ProductionOrderFormState {
  const startDateTime = toDatetimeLocalValue();
  return {
    code: '',
    name: '',
    entryLines: [newProductionOrderEntryLine()],
    status: 'Chờ sx',
    shift: '',
    selectedStaffIds: [],
    shiftLeadId: '',
    mainStaffId: '',
    assistantStaffId: '',
    traineeStaffId: '',
    startDate: extractProductionOrderDate(startDateTime),
    startDateTime,
    endDateTime: '',
    machine: '',
    note: ''
  };
}

export function productionOrderFormToCreatePayload(
  form: ProductionOrderFormState,
  lines: ProductionOrderEntryLine[],
  staffText = '',
  staffRoles?: {
    shiftLead?: string;
    mainStaff?: string;
    assistantStaff?: string;
    traineeStaff?: string;
  }
) {
  const staff = staffText || form.selectedStaffIds.join(', ');
  const products = lines.map(line => ({
    ma_don_hang: line.orderRef.trim(),
    ma_sp: line.productCode.trim(),
    ten_sp: line.productName.trim(),
    don_vi: line.unit.trim(),
    so_luong: Number(line.quantity)
  }));
  const summary = summarizeOrderProducts(
    products.map(product => ({
      productCode: product.ma_sp,
      productName: product.ten_sp,
      unit: product.don_vi,
      quantity: String(product.so_luong)
    }))
  );
  const primaryLine = lines[0];
  const orderRefs = [...new Set(lines.map(line => line.orderRef.trim()).filter(Boolean))];
  const defaultName =
    lines.length === 1
      ? primaryLine.productName || primaryLine.productCode
      : lines
          .map(line => line.productName || line.productCode)
          .filter(Boolean)
          .join(' + ');

  const productionDate = form.startDate.trim();
  const startDateTime = mergeProductionOrderDateTime(productionDate, form.startDateTime) || null;
  return {
    ma_lenh_sx: form.code.trim(),
    ten_lenh_sx: form.name.trim() || (defaultName ? `SX ${defaultName}` : ''),
    san_pham: products,
    ma_hang: summary.productCode,
    ten_hang: summary.productName,
    so_luong: Number(summary.quantity),
    don_vi: summary.unit === '-' ? '' : summary.unit,
    trang_thai: form.status,
    ma_don_hang: orderRefs.join(', ') || primaryLine.orderRef.trim(),
    ca: form.shift.trim(),
    nhan_su: staff,
    truong_ca: staffRoles?.shiftLead?.trim() || '',
    nhan_su_chinh: staffRoles?.mainStaff?.trim() || '',
    tho_phu: staffRoles?.assistantStaff?.trim() || '',
    hoc_viec: staffRoles?.traineeStaff?.trim() || '',
    // Form «Ngày» — ghi cả ngay + ngay_bat_dau để vẫn lưu được nếu cột ngay bị generated/thiếu.
    ngay: productionDate || null,
    ngay_bat_dau: productionDate || null,
    ngay_gio_bat_dau: startDateTime,
    ngay_gio_ket_thuc: form.endDateTime.trim() || null,
    may: form.machine.trim(),
    ghi_chu: form.note.trim()
  };
}

export function productionOrderFormToPayload(
  form: ProductionOrderFormState,
  line: ProductionOrderEntryLine,
  staffText = ''
) {
  return productionOrderFormToCreatePayload(form, [line], staffText);
}

export function AddProductionOrderModal({
  open,
  onClose,
  onCreated,
  seedOrder = null
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  seedOrder?: OrderRow | null;
}) {
  const [form, setForm] = useState<ProductionOrderFormState>(emptyProductionOrderForm);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [settings, setSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [staffBranches, setStaffBranches] = useState<HrBranch[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [showAutofillOrders, setShowAutofillOrders] = useState(false);
  const [autofillSearch, setAutofillSearch] = useState('');
  const [selectedAutofillOrderCodes, setSelectedAutofillOrderCodes] = useState<string[]>([]);
  const [selectedAutofillProductKeys, setSelectedAutofillProductKeys] = useState<string[]>([]);
  const [showAddLine, setShowAddLine] = useState(false);
  const [lineDraftOrderRef, setLineDraftOrderRef] = useState('');
  const [lineDraftProductCode, setLineDraftProductCode] = useState('');
  const [lineDraftQuantity, setLineDraftQuantity] = useState('');
  const [lineDraftError, setLineDraftError] = useState('');
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ProductionOrderDraft | null>(null);

  useEffect(() => {
    if (!open) return;

    setForm(emptyProductionOrderForm());
    setSelectedShifts([]);
    setFormError('');
    setShowAutofillOrders(false);
    setAutofillSearch('');
    setSelectedAutofillOrderCodes([]);
    setSelectedAutofillProductKeys([]);
    setShowAddLine(false);
    setLineDraftOrderRef('');
    setLineDraftProductCode('');
    setLineDraftQuantity('');
    setLineDraftError('');
    setShowCreateOrderModal(false);
    setSavedDraft(seedOrder ? null : readProductionOrderDraft());
    setIsLoadingLookups(true);

    const loadLookups = async () => {
      try {
        const [orderRes, productionRes, machineRes, settingRes, staffRes, productRes] = await Promise.all([
          fetch('/api/don-hang'),
          fetch('/api/lenh-sx'),
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups&scope=all'),
          fetch('/api/san-pham?format=table')
        ]);

        const orderData = await orderRes.json().catch(() => ({}));
        const productionData = await productionRes.json().catch(() => ({}));
        const machineData = await machineRes.json().catch(() => ({}));
        const settingData = await settingRes.json().catch(() => ({}));
        const staffData = await staffRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));

        if (orderRes.ok) {
          const loadedOrders = normalizeOrders(orderData);
          const nextOrders = seedOrder
            ? [seedOrder, ...loadedOrders.filter(item => item.id !== seedOrder.id)]
            : loadedOrders;
          setOrders(nextOrders);
          if (seedOrder) {
            const orderDate = parseProductionOrderFilterDate(seedOrder.orderDate || seedOrder.createdAt || '');
            const productLines = getOrderProductLines(seedOrder);
            const linesFromOrder =
              productLines.length > 0
                ? productLines.map(line => ({
                    key: `entry-${seedOrder.orderCode}-${line.productCode}-${Math.random().toString(36).slice(2, 7)}`,
                    orderRef: seedOrder.orderCode,
                    ...buildProductionEntryLine(
                      nextOrders,
                      productionRes.ok ? normalizeProductionOrders(productionData) : [],
                      seedOrder.orderCode,
                      line.productCode,
                      line.productName,
                      line.unit && line.unit !== '-' ? line.unit : ''
                    )
                  }))
                : [{ ...newProductionOrderEntryLine(), orderRef: seedOrder.orderCode }];
            setForm(prev => ({
              ...prev,
              startDate: orderDate || prev.startDate,
              startDateTime: mergeProductionOrderDateTime(orderDate || prev.startDate, prev.startDateTime),
              entryLines: mergeProductionOrderEntryLinesByProductCode(linesFromOrder)
            }));
          }
        }
        if (productionRes.ok) setProductionOrders(normalizeProductionOrders(productionData));
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(mapProductionOrderSettings(settingData));
        if (staffRes.ok) setStaffBranches(normalizeHrBranches(staffData));
        if (productRes.ok) setCatalogProducts(normalizeProducts(productData));
      } catch (error: any) {
        setFormError(error?.message || 'Không thể tải dữ liệu đơn hàng, máy, ca và nhân sự.');
      } finally {
        setIsLoadingLookups(false);
      }
    };

    loadLookups();
  }, [open, seedOrder]);

  useEffect(() => {
    setSelectedAutofillOrderCodes([]);
    setSelectedAutofillProductKeys([]);
    setAutofillSearch('');
  }, [form.startDate]);

  const ordersForSelectedDate = useMemo(
    () => filterOrdersForProductionDate(orders, form.startDate),
    [orders, form.startDate]
  );

  const orderCodeOptions = useMemo(() => {
    return [...new Set(ordersForSelectedDate.map(order => order.orderCode).filter(code => code && code !== '-'))].sort(
      (a, b) => String(a).localeCompare(String(b), 'vi')
    );
  }, [ordersForSelectedDate]);

  const shiftOptions = useMemo(() => {
    const fromSettings = settings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Thời gian' ||
          setting.loaiCaiDat === 'Sản xuất' ||
          /ca/i.test(setting.name) ||
          /ca/i.test(setting.code)
      )
      .map(setting => setting.name || setting.code)
      .filter((name, index, arr) => name && arr.indexOf(name) === index);

    return fromSettings;
  }, [settings]);

  const assignedMachineKeys = useMemo(() => {
    if (selectedShifts.length === 0) return new Set<string>();

    const keys = settings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Ca máy' &&
          selectedShifts.some(shift => settingMatchesShift(setting, shift))
      )
      .flatMap(setting =>
        [setting.code, setting.name].filter(value => value && value !== '-').map(value => value.toLowerCase())
      );

    return new Set(keys);
  }, [selectedShifts, settings]);

  const availableMachines = useMemo(() => {
    return machines.filter(machine => {
      const candidates = [machine.code, machine.name]
        .filter(value => value && value !== '-')
        .map(value => value.toLowerCase());

      return !candidates.some(
        key =>
          assignedMachineKeys.has(key) ||
          [...assignedMachineKeys].some(assigned => key.includes(assigned) || assigned.includes(key))
      );
    });
  }, [assignedMachineKeys, machines]);

  const workshopStaff = useMemo(() => collectProductionWorkshopStaff(staffBranches), [staffBranches]);

  const staffOptions = workshopStaff;

  const staffOptionsByRole = useMemo(() => {
    // Trưởng ca / NS chính / Thợ phụ (/ Học việc): sổ từ cùng pool phòng PHÂN XƯỞNG SẢN XUẤT
    return Object.fromEntries(
      PRODUCTION_STAFF_ROLES.map(role => [role.key, staffOptions])
    ) as Record<ProductionStaffRoleKey, HrMember[]>;
  }, [staffOptions]);

  const selectedStaffRoles = useMemo(() => {
    const nameById = (id: string) => staffOptions.find(member => member.id === id)?.name || '';
    return {
      shiftLead: nameById(form.shiftLeadId),
      mainStaff: nameById(form.mainStaffId),
      assistantStaff: nameById(form.assistantStaffId),
      traineeStaff: nameById(form.traineeStaffId)
    };
  }, [form.assistantStaffId, form.mainStaffId, form.shiftLeadId, form.traineeStaffId, staffOptions]);

  const selectedStaffNames = useMemo(
    () => [...new Set(Object.values(selectedStaffRoles).filter(Boolean))].join(', '),
    [selectedStaffRoles]
  );

  const autofillOrderOptions = useMemo(() => {
    const normalized = autofillSearch.trim().toLowerCase();
    return ordersForSelectedDate
      .filter(order => getOrderProductLines(order).length > 0)
      .filter(order => {
        if (!normalized) return true;
        return `${order.orderCode} ${order.customer} ${formatOrderProductsSummary(getOrderProductLines(order))}`
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => a.orderCode.localeCompare(b.orderCode, 'vi'));
  }, [autofillSearch, ordersForSelectedDate]);

  const allAutofillOrdersSelected =
    autofillOrderOptions.length > 0 &&
    autofillOrderOptions.every(order => selectedAutofillOrderCodes.includes(order.orderCode));

  const autofillProductCandidates = useMemo(() => {
    return selectedAutofillOrderCodes.flatMap(orderRef =>
      listProductOptionsForOrder(ordersForSelectedDate, productionOrders, catalogProducts, orderRef)
        .filter(product => product.orderQty > 0 && product.remainingQty > 0)
        .map(product => ({
          key: autofillProductKey(orderRef, product.code),
          orderRef,
          productCode: product.code,
          productName: product.name,
          unit: product.unit,
          remainingQty: product.remainingQty
        }))
    );
  }, [selectedAutofillOrderCodes, ordersForSelectedDate, productionOrders, catalogProducts]);

  const toggleAutofillOrderCode = (orderCode: string) => {
    setSelectedAutofillOrderCodes(prev => {
      const isSelected = prev.includes(orderCode);
      if (isSelected) {
        setSelectedAutofillProductKeys(keys =>
          keys.filter(key => !key.startsWith(`${orderCode}::`))
        );
        return prev.filter(code => code !== orderCode);
      }
      return [...prev, orderCode];
    });
  };

  const toggleAllAutofillOrders = () => {
    const codes = autofillOrderOptions.map(order => order.orderCode);
    if (allAutofillOrdersSelected) {
      const codeSet = new Set(codes);
      setSelectedAutofillOrderCodes(prev => prev.filter(code => !codeSet.has(code)));
      setSelectedAutofillProductKeys(prev => prev.filter(key => !codes.some(code => key.startsWith(`${code}::`))));
      return;
    }
    setSelectedAutofillOrderCodes(prev => [...new Set([...prev, ...codes])]);
  };

  const toggleAutofillProduct = (key: string) => {
    setSelectedAutofillProductKeys(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const applyAutofillOrders = () => {
    const selectedCodes = [...new Set(selectedAutofillOrderCodes.map(code => code.trim()).filter(Boolean))];
    if (selectedCodes.length === 0) {
      setFormError('Vui lòng tick ít nhất một đơn hàng để tự điền.');
      return;
    }

    const selectedProducts = autofillProductCandidates.filter(item =>
      selectedAutofillProductKeys.includes(item.key)
    );

    if (selectedProducts.length === 0) {
      setFormError('Vui lòng chọn ít nhất một sản phẩm trong đơn hàng.');
      return;
    }

    // Cùng mã hàng (nhiều đơn) → 1 dòng lệnh SX, cộng SL còn lại, gộp mã đơn.
    const nextLines = groupAutofillProductsByCode(selectedProducts).map(group => ({
      key: `entry-${group.productCode}-${Math.random().toString(36).slice(2, 7)}`,
      orderRef: mergeProductionOrderRefs(...group.orderRefs),
      productCode: group.productCode,
      productName: group.productName,
      unit: group.unit,
      quantity: group.remainingQty > 0 ? String(group.remainingQty) : ''
    }));

    setForm(prev => ({
      ...prev,
      entryLines: nextLines
    }));
    setFormError('');
    setShowAutofillOrders(false);
  };

  const handleCreatedSalesOrder = (createdOrder: OrderRow) => {
    const orderDate = parseProductionOrderFilterDate(createdOrder.orderDate || createdOrder.createdAt || '');
    const nextOrders = [createdOrder, ...orders.filter(item => item.id !== createdOrder.id)];
    setOrders(nextOrders);

    const productLines = getOrderProductLines(createdOrder);
    const linesFromOrder =
      productLines.length > 0
        ? productLines.map(line => ({
            key: `entry-${createdOrder.orderCode}-${line.productCode}-${Math.random().toString(36).slice(2, 7)}`,
            orderRef: createdOrder.orderCode,
            ...buildProductionEntryLine(
              nextOrders,
              productionOrders,
              createdOrder.orderCode,
              line.productCode,
              line.productName,
              line.unit && line.unit !== '-' ? line.unit : ''
            )
          }))
        : [
            {
              ...newProductionOrderEntryLine(),
              orderRef: createdOrder.orderCode
            }
          ];

    setForm(prev => {
      const startDate = orderDate || prev.startDate;
      const hasFilledLines = prev.entryLines.some(line => line.orderRef.trim() || line.productCode.trim());
      const combined = hasFilledLines
        ? [
            ...prev.entryLines.filter(line => line.orderRef.trim() || line.productCode.trim()),
            ...linesFromOrder
          ]
        : linesFromOrder;
      return {
        ...prev,
        startDate,
        startDateTime: mergeProductionOrderDateTime(startDate, prev.startDateTime),
        entryLines: mergeProductionOrderEntryLinesByProductCode(combined)
      };
    });
    setFormError('');
  };

  const openAddLine = () => {
    setLineDraftOrderRef('');
    setLineDraftProductCode('');
    setLineDraftQuantity('');
    setLineDraftError('');
    setShowAddLine(true);
  };

  const closeAddLine = () => {
    setShowAddLine(false);
    setLineDraftError('');
  };

  const confirmAddLine = () => {
    const orderRef = lineDraftOrderRef.trim();
    const productCode = lineDraftProductCode.trim();
    const quantityRaw = lineDraftQuantity.trim();
    const quantity = Number(quantityRaw);

    if (!orderRef) {
      setLineDraftError('Vui lòng chọn mã đơn hàng.');
      return;
    }
    if (!productCode) {
      setLineDraftError('Vui lòng chọn mã hàng.');
      return;
    }
    if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) {
      setLineDraftError('Số lượng phải lớn hơn 0.');
      return;
    }

    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      '',
      ''
    );

    const newLine: ProductionOrderEntryLine = {
      key: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderRef,
      productCode,
      productName: built.productName || built.productCode,
      quantity: String(quantity),
      unit: built.unit || built.productCode
    };

    setForm(prev => ({
      ...prev,
      entryLines: mergeProductionOrderEntryLinesByProductCode([
        ...prev.entryLines.filter(line => line.orderRef.trim() || line.productCode.trim()),
        newLine
      ])
    }));
    setShowAddLine(false);
    setLineDraftError('');
  };

  const updateEntryLine = (key: string, patch: Partial<ProductionOrderEntryLine>) => {
    setForm(prev => ({
      ...prev,
      entryLines: mergeProductionOrderEntryLinesByProductCode(
        prev.entryLines.map(line => (line.key === key ? { ...line, ...patch } : line))
      )
    }));
  };

  const handleEntryOrderChange = (key: string, orderRef: string) => {
    const options = listProductOptionsForOrder(ordersForSelectedDate, productionOrders, catalogProducts, orderRef);
    let patch: Partial<ProductionOrderEntryLine> = {
      orderRef,
      productCode: '',
      productName: '',
      quantity: '',
      unit: ''
    };
    if (options.length === 1) {
      const product = options[0];
      patch = {
        orderRef,
        ...buildProductionEntryLine(
          orders,
          productionOrders,
          orderRef,
          product.code,
          product.name,
          product.unit
        )
      };
    }
    updateEntryLine(key, patch);
  };

  const handleEntryProductChange = (key: string, orderRef: string, productCode: string) => {
    const options = listProductOptionsForOrder(ordersForSelectedDate, productionOrders, catalogProducts, orderRef);
    const product = options.find(item => item.code === productCode);
    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      product?.name || '',
      product?.unit || ''
    );
    updateEntryLine(key, built);
  };

  const toggleShift = (shift: string) => {
    const nextSelectedShifts = selectedShifts.includes(shift)
      ? selectedShifts.filter(item => item !== shift)
      : [...selectedShifts, shift];
    const defaults = getProductionShiftDateTimeDefaults(form.startDate, nextSelectedShifts[0] || '', settings);
    setSelectedShifts(nextSelectedShifts);
    setForm(prev => ({
      ...prev,
      machine: '',
      ...(defaults || {})
    }));
  };

  const handleClose = () => {
    if (isSaving) return;

    try {
      if (!seedOrder && hasProductionOrderDraftContent(form, selectedShifts)) {
        localStorage.setItem(
          PRODUCTION_ORDER_DRAFT_STORAGE_KEY,
          JSON.stringify({ form, selectedShifts, savedAt: Date.now() })
        );
      } else {
        localStorage.removeItem(PRODUCTION_ORDER_DRAFT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota/privacy errors; closing the form must still work.
    }

    onClose();
  };

  const restoreDraft = () => {
    if (!savedDraft) return;
    setForm(savedDraft.form);
    setSelectedShifts(savedDraft.selectedShifts);
    setSavedDraft(null);
    setFormError('');
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(PRODUCTION_ORDER_DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage privacy errors; hiding the banner is enough for this session.
    }
    setSavedDraft(null);
  };

  if (!open) return null;

  const handleSubmit = async () => {
    const filledLines = mergeProductionOrderEntryLinesByProductCode(
      form.entryLines.filter(line => line.orderRef.trim() && line.productCode.trim())
    );

    if (filledLines.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng đơn hàng và mã hàng.');
      return;
    }

    for (const line of filledLines) {
      const quantity = Number(line.quantity);
      const productName = line.productName || line.productCode;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho ${productName}.`);
        return;
      }
      const ordered = getOrderProductQuantity(orders, line.orderRef.trim(), line.productCode);
      if (ordered <= 0) {
        setFormError(`${productName} không có trong đơn ${line.orderRef} hoặc chưa có số lượng đặt hàng.`);
        return;
      }
    }
    if (selectedShifts.length === 0) {
      setFormError('Vui lòng chọn ít nhất một ca.');
      return;
    }
    if (!form.machine.trim()) {
      setFormError('Vui lòng chọn máy.');
      return;
    }
    if (!form.startDate.trim()) {
      setFormError('Vui lòng chọn ngày.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    const multipleShifts = selectedShifts.length > 1;

    try {
      for (const shift of selectedShifts) {
        const shiftForm: ProductionOrderFormState = {
          ...form,
          shift,
          // Nhiều ca: để trống mã để tự sinh, tránh trùng mã lệnh
          code: multipleShifts ? '' : form.code
        };
        const res = await fetch('/api/lenh-sx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            productionOrderFormToCreatePayload(shiftForm, filledLines, selectedStaffNames, selectedStaffRoles)
          )
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Không thể tạo lệnh SX cho ${shift}.`);
        }
      }

      await onCreated();
      try {
        localStorage.removeItem(PRODUCTION_ORDER_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage privacy errors after the order was already created.
      }
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể tạo lệnh sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="h-[96vh] max-h-[98vh] w-full max-w-[1500px] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm lệnh sản xuất mới</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {savedDraft && !seedOrder ? (
          <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800">
            <span>
              Có bản nháp lưu lúc <strong>{formatProductionOrderDraftTime(savedDraft.savedAt)}</strong>.
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={discardDraft} className="px-2 py-1 font-bold text-zinc-500 hover:text-zinc-700">
                Bỏ
              </button>
              <button
                type="button"
                onClick={restoreDraft}
                className="rounded-lg bg-[#d9152b] px-3 py-1.5 font-bold text-white transition hover:bg-[#b30d1c]"
              >
                Khôi phục
              </button>
            </div>
          </div>
        ) : null}

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        {isLoadingLookups && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải đơn hàng, máy, ca và nhân sự...
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã lệnh</span>
            <input
              value={form.code}
              onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
              className={orderFieldClass}
              placeholder="Để trống = tự sinh"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày *</span>
            <DateInput
              value={form.startDate}
              onChange={startDate => {
                const defaults = getProductionShiftDateTimeDefaults(startDate, selectedShifts[0] || '', settings);
                setForm(prev => ({
                  ...prev,
                  startDate,
                  startDateTime: defaults?.startDateTime || mergeProductionOrderDateTime(startDate, prev.startDateTime),
                  endDateTime: defaults?.endDateTime || prev.endDateTime
                }));
              }}
              required
              className={`${orderFieldClass} pr-10`}
            />
          </label>

          <RepeatableLinesBlock
            className="col-span-2"
            title="Đơn hàng & mã hàng"
            required
            onAdd={openAddLine}
            extraHeaderButtons={
              <>
                <button
                  type="button"
                  onClick={() => setShowCreateOrderModal(true)}
                  disabled={isLoadingLookups || isSaving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm đơn mới
                </button>
                <button
                  type="button"
                  onClick={() => setShowAutofillOrders(true)}
                  disabled={isLoadingLookups}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/25 bg-red-50 px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Tự điền từ đơn hàng
                </button>
              </>
            }
            columns={[
              { key: 'order', label: 'Mã đơn', className: 'min-w-0 flex-[1.1]', required: true },
              { key: 'code', label: 'Mã hàng', className: 'min-w-0 flex-[1.35]', required: true },
              { key: 'name', label: 'Tên hàng', className: 'min-w-0 flex-[1.1]' },
              { key: 'unit', label: 'ĐV', className: 'w-16 shrink-0 sm:w-20' },
              { key: 'qty', label: 'SL', className: 'w-20 shrink-0 sm:w-24', required: true },
              { key: 'actions', label: '', className: 'w-9 shrink-0' }
            ]}
          >
            <p className="pb-2 text-[11px] font-bold text-zinc-500">
              {form.startDate
                ? `Gợi ý đơn hàng cùng ngày ${formatDateDdMmYyyy(form.startDate)} hoặc còn SL chưa lập lệnh.`
                : 'Chọn ngày lệnh SX để lọc đơn hàng cùng ngày.'}
            </p>

            {form.entryLines.map(line => {
              const productOptions = listProductOptionsForOrder(
                ordersForSelectedDate,
                productionOrders,
                catalogProducts,
                line.orderRef
              );
              const selectedProduct = productOptions.find(item => item.code === line.productCode);

              return (
                <RepeatableLineRow key={line.key}>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <SearchableSelect
                      value={line.orderRef}
                      onChange={orderRef => handleEntryOrderChange(line.key, orderRef)}
                      options={orderCodeOptions}
                      placeholder="Gõ để tìm mã đơn"
                      isLoading={isLoadingLookups}
                      inputClassName={orderFieldClass}
                      getLabel={item => String(item)}
                      getValue={item => String(item)}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.35]">
                    <SearchableSelect
                      value={line.productCode}
                      onChange={productCode => handleEntryProductChange(line.key, line.orderRef, productCode)}
                      options={productOptions}
                      placeholder={line.orderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                      disabled={!line.orderRef}
                      isLoading={isLoadingLookups}
                      inputClassName={orderFieldClass}
                      getLabel={item => {
                        const product = item as (typeof productOptions)[number];
                        const remaining =
                          product.remainingQty <= 0 && product.orderQty > 0
                            ? ' · hết'
                            : product.orderQty > 0
                              ? ` · còn ${formatNumber(product.remainingQty, 0)}`
                              : '';
                        return product.code ? `${product.code} · ${product.name}${remaining}` : product.name;
                      }}
                      getValue={item => (item as (typeof productOptions)[number]).code}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <input
                      value={selectedProduct?.name || line.productName}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="Tự điền theo mã hàng"
                    />
                  </div>
                  <div className="col-span-1 md:w-16 md:shrink-0 sm:md:w-20">
                    <input
                      value={line.unit}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="ĐV"
                    />
                  </div>
                  <div className="col-span-1 md:w-20 md:shrink-0 sm:md:w-24">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={e => updateEntryLine(line.key, { quantity: e.target.value })}
                      className={orderFieldClass}
                      placeholder="SL"
                    />
                  </div>
                  {form.entryLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(prev => ({
                          ...prev,
                          entryLines: prev.entryLines.filter(item => item.key !== line.key)
                        }))
                      }
                      className="col-span-2 md:col-span-1 md:mb-0.5 flex h-10 w-full md:h-9 md:w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="md:hidden">Xóa dòng này</span>
                    </button>
                  )}
                </RepeatableLineRow>
              );
            })}
          </RepeatableLinesBlock>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Ca * <span className="text-zinc-400">(chọn nhiều ca cho cùng ngày)</span>
            </span>
            {shiftOptions.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-400">
                {isLoadingLookups ? 'Đang tải ca...' : 'Chưa có ca nào được khai báo.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                {shiftOptions.map(shift => {
                  const shiftValue = String(shift);
                  const checked = selectedShifts.includes(shiftValue);
                  return (
                    <label
                      key={shiftValue}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        checked
                          ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShift(shiftValue)}
                        className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                      />
                      {formatProductionOrderShiftLabel(shiftValue, settings)}
                    </label>
                  );
                })}
              </div>
            )}
            {selectedShifts.length > 1 && (
              <p className="text-[11px] font-semibold text-emerald-700">
                Sẽ tạo {selectedShifts.length} lệnh SX — mỗi ca một lệnh (cùng sản phẩm, máy, nhân sự, ngày).
              </p>
            )}
          </label>

          <label className="col-span-2 space-y-1.5 sm:col-span-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
            <SearchableSelect
              value={form.status}
              onChange={status => setForm(prev => ({ ...prev, status }))}
              options={[...PRODUCTION_ORDER_STATUS_OPTIONS]}
              placeholder="Gõ để tìm trạng thái"
              getLabel={item => String(item)}
              getValue={item => String(item)}
              allowEmpty={false}
            />
          </label>

          <label className="col-span-2 space-y-1.5 sm:col-span-1">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Máy *</span>
            {renderMachineSelect(
              form.machine,
              machine => setForm(prev => ({ ...prev, machine })),
              availableMachines,
              {
                disabled: selectedShifts.length === 0,
                placeholder: selectedShifts.length > 0 ? 'Gõ để tìm máy' : 'Chọn ca trước'
              }
            )}
            {selectedShifts.length > 0 && availableMachines.length === 0 && (
              <p className="text-[11px] font-semibold text-amber-700">
                Không còn máy trống cho ca đã chọn (các máy đã khai báo trong Ca máy).
              </p>
            )}
          </label>

          <div className="col-span-2 space-y-2">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phân công nhân sự</span>
              <p className="mt-1 text-[11px] font-semibold text-zinc-400">
                Trưởng ca / Nhân sự chính / Thợ phụ lấy từ phòng ban {PRODUCTION_WORKSHOP_DEPARTMENT}.
              </p>
            </div>
            {staffOptions.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-400">
                Chưa có nhân sự thuộc phòng {PRODUCTION_WORKSHOP_DEPARTMENT}.
              </p>
            ) : (
              <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
                {PRODUCTION_STAFF_ROLES.map(field => (
                  <label key={field.key} className="space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{field.label}</span>
                    <select
                      value={form[field.key]}
                      onChange={event =>
                        setForm(prev => ({ ...prev, [field.key]: event.target.value }))
                      }
                      className={orderFieldClass}
                    >
                      <option value="">Chưa phân công</option>
                      {staffOptionsByRole[field.key].map(member => {
                        const roleLabel = member.role || member.position || '';
                        return (
                          <option key={`${field.key}-${member.id}`} value={member.id}>
                            {member.name}
                            {roleLabel ? ` · ${roleLabel}` : ''}
                            {member.shift ? ` · ${member.shift}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu</span>
            <input
              type="time"
              value={form.startDateTime.includes('T') ? form.startDateTime.split('T')[1]?.slice(0, 5) || '' : ''}
              onChange={e => {
                const time = e.target.value;
                setForm(prev => ({
                  ...prev,
                  startDateTime: mergeProductionOrderDateTime(prev.startDate, `${prev.startDate}T${time}`)
                }));
              }}
              className={orderFieldClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày giờ kết thúc</span>
            <input
              type="datetime-local"
              value={form.endDateTime}
              onChange={e => setForm(prev => ({ ...prev, endDateTime: e.target.value }))}
              className={orderFieldClass}
            />
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
            <textarea
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
              rows={2}
              className={`${orderFieldClass} min-h-[72px] resize-y`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || isLoadingLookups}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Tạo lệnh SX'}
          </button>
        </div>
      </div>

      {showAutofillOrders && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[94vh] max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-zinc-950">Tự điền từ đơn hàng</h4>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {form.startDate
                    ? `Chọn đơn hàng cùng ngày ${formatDateDdMmYyyy(form.startDate)}, sau đó tick sản phẩm cần lập lệnh SX.`
                    : 'Chọn ngày lệnh SX trước để lọc đơn hàng cùng ngày.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutofillOrders(false)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>

            <div className="shrink-0 border-b border-zinc-100 p-4">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  value={autofillSearch}
                  onChange={event => setAutofillSearch(event.target.value)}
                  placeholder="Tìm mã đơn, khách hàng, mã hàng..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4">
                {autofillOrderOptions.length > 0 && (
                  <label className="mb-3 flex h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3">
                    <input
                      type="checkbox"
                      checked={allAutofillOrdersSelected}
                      onChange={toggleAllAutofillOrders}
                      className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                    <span className="text-xs font-extrabold text-zinc-700">Chọn tất cả đơn hàng</span>
                  </label>
                )}
                {autofillOrderOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm font-bold text-zinc-400">
                    {form.startDate
                      ? `Không có đơn hàng phù hợp cho ngày ${formatDateDdMmYyyy(form.startDate)}.`
                      : 'Chọn ngày lệnh SX để xem đơn hàng cùng ngày.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {autofillOrderOptions.map(order => {
                      const checked = selectedAutofillOrderCodes.includes(order.orderCode);
                      const productLines = getOrderProductLines(order);
                      const orderProducts = checked
                        ? autofillProductCandidates.filter(item => item.orderRef === order.orderCode)
                        : [];
                      const allOrderProductsSelected =
                        orderProducts.length > 0 &&
                        orderProducts.every(product => selectedAutofillProductKeys.includes(product.key));
                      return (
                        <div
                          key={order.id}
                          className={`rounded-xl border p-3 transition ${
                            checked ? 'border-[#ef1b2d]/35 bg-red-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              id={`autofill-order-${order.id}`}
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAutofillOrderCode(order.orderCode)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                            />
                            <label htmlFor={`autofill-order-${order.id}`} className="min-w-0 flex-1 cursor-pointer">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-zinc-950">{order.orderCode || '-'}</span>
                                <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-black text-zinc-600">
                                  {productLines.length} sản phẩm
                                </span>
                                <span className="text-xs font-semibold text-zinc-500">{order.customer}</span>
                              </div>
                            </label>
                          </div>
                          {checked && (
                            <div className="ml-4 mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                              {orderProducts.length === 0 ? (
                                <p className="px-3 py-3 text-center text-xs font-bold text-zinc-400">
                                  Đơn hàng không còn sản phẩm cần lập lệnh SX.
                                </p>
                              ) : (
                                <>
                                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-xs font-extrabold text-zinc-700">
                                    <input
                                      type="checkbox"
                                      checked={allOrderProductsSelected}
                                      onChange={() => {
                                        const keys = orderProducts.map(product => product.key);
                                        setSelectedAutofillProductKeys(prev =>
                                          allOrderProductsSelected
                                            ? prev.filter(key => !keys.includes(key))
                                            : [...new Set([...prev, ...keys])]
                                        );
                                      }}
                                      className="h-4 w-4 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                                    />
                                    Chọn tất cả sản phẩm
                                  </label>
                                  {orderProducts.map(product => {
                                    const productChecked = selectedAutofillProductKeys.includes(product.key);
                                    return (
                                      <label
                                        key={product.key}
                                        className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${
                                          productChecked ? 'bg-red-50/70' : 'hover:bg-zinc-50'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={productChecked}
                                          onChange={() => toggleAutofillProduct(product.key)}
                                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                                        />
                                        <span className="min-w-0 flex-1">
                                          <span className="flex flex-wrap items-center gap-2">
                                            <span className="font-black text-zinc-950">{product.productCode}</span>
                                            <span className="text-[11px] font-bold text-emerald-700">
                                              Còn {formatNumber(product.remainingQty, 0)} {product.unit || ''}
                                            </span>
                                          </span>
                                          <span className="mt-0.5 block text-xs font-semibold text-zinc-600">
                                            {product.productName || '-'}
                                          </span>
                                        </span>
                                      </label>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
              <span className="text-xs font-bold text-zinc-500">
                Đã chọn {selectedAutofillOrderCodes.length} đơn ·{' '}
                {
                  groupAutofillProductsByCode(
                    autofillProductCandidates.filter(item =>
                      selectedAutofillProductKeys.includes(item.key)
                    )
                  ).length
                }{' '}
                sản phẩm
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAutofillOrderCodes([]);
                    setSelectedAutofillProductKeys([]);
                  }}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={applyAutofillOrders}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Tự điền
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddLine && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm dòng</h4>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  Nhập nhanh một dòng đơn hàng + mã hàng.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddLine}
                aria-label="Đóng"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã đơn *</span>
                <SearchableSelect
                  value={lineDraftOrderRef}
                  onChange={orderRef => {
                    setLineDraftOrderRef(orderRef);
                    setLineDraftProductCode('');
                  }}
                  options={orderCodeOptions}
                  placeholder="Gõ để tìm mã đơn"
                  isLoading={isLoadingLookups}
                  inputClassName="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã hàng *</span>
                <SearchableSelect
                  value={lineDraftProductCode}
                  onChange={setLineDraftProductCode}
                  options={listProductOptionsForOrder(
                    ordersForSelectedDate,
                    productionOrders,
                    catalogProducts,
                    lineDraftOrderRef
                  )}
                  placeholder={lineDraftOrderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                  disabled={!lineDraftOrderRef}
                  isLoading={isLoadingLookups}
                  inputClassName="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                  getLabel={item => {
                    const product = item as { code: string; name: string; orderQty: number; remainingQty: number };
                    return product.code
                      ? `${product.code} · ${product.name}${product.orderQty > 0 ? ` · còn ${formatNumber(product.remainingQty, 0)}` : ''}`
                      : product.name;
                  }}
                  getValue={item => (item as { code: string }).code}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Số lượng *</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={lineDraftQuantity}
                  onChange={event => setLineDraftQuantity(event.target.value)}
                  placeholder="Nhập số lượng"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>

              {lineDraftError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {lineDraftError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeAddLine}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmAddLine}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm dòng
              </button>
            </div>
          </div>
        </div>
      )}

      <OrderFormModal
        open={showCreateOrderModal}
        mode="add"
        existingOrderCodes={orders.map(order => order.orderCode)}
        defaultCreatedAt={form.startDate}
        zIndexClassName="z-[80]"
        onClose={() => setShowCreateOrderModal(false)}
        onSaved={handleCreatedSalesOrder}
      />
    </div>
  );
}

export function ProductionOrderDetailBody({
  row,
  gridClassName = 'grid-cols-2'
}: {
  row: ProductionOrderRow;
  gridClassName?: string;
}) {
  const productLines = getProductionOrderProductLines(row);

  return (
    <>
        <div className={`grid ${gridClassName} gap-3 p-4 text-sm`}>
          {[
            ['Mã lệnh', row.code],
            ['Tên lệnh', row.name],
            ['Trạng thái', row.status],
            ['Khách hàng', row.customer],
            ['Đơn hàng', row.orderRef],
            ['Ca', row.shift],
            ['Trưởng ca', row.shiftLead],
            ['Nhân sự chính', row.mainStaff],
            ['Thợ phụ', row.assistantStaff],
            ['Học việc', row.traineeStaff],
            ['Tổng nhân sự', row.staff],
            ['Ngày', row.startDate],
            ['Máy', row.machine],
            ['Ghi chú', row.note || '-']
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
              <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Sản phẩm ({productLines.length})
          </p>
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                <tr>
                  <th className="px-3 py-2 font-black">Mã hàng</th>
                  <th className="px-3 py-2 font-black">Tên sản phẩm</th>
                  <th className="px-3 py-2 text-right font-black">Số lượng</th>
                  <th className="px-3 py-2 font-black">ĐVT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {productLines.map((product, index) => (
                  <tr key={`${product.productCode}-${index}`}>
                    <td className="px-3 py-2 font-black text-zinc-950">{product.productCode || '-'}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-700">{product.productName || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{product.quantity || '-'}</td>
                    <td className="px-3 py-2 text-zinc-600">{product.unit && product.unit !== '-' ? product.unit : '-'}</td>
                  </tr>
                ))}
                {productLines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center font-bold text-zinc-400">
                      Chưa có sản phẩm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
    </>
  );
}

export function ProductionOrderViewModal({
  row,
  onClose
}: {
  row: ProductionOrderRow | null;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết lệnh SX</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{row.code || row.name}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50">
            Đóng
          </button>
        </div>
        <ProductionOrderDetailBody row={row} />
      </div>
    </div>
  );
}

export function EditProductionOrderModal({
  open,
  row,
  orders,
  productionOrders,
  catalogProducts,
  machines,
  onClose,
  onSaved
}: {
  open: boolean;
  row: ProductionOrderRow | null;
  orders: OrderRow[];
  productionOrders: ProductionOrderRow[];
  catalogProducts: ProductRow[];
  machines: MachineRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<ProductionOrderFormState>(emptyProductionOrderForm);
  const [staffRoles, setStaffRoles] = useState({
    shiftLead: '',
    mainStaff: '',
    assistantStaff: '',
    traineeStaff: ''
  });
  const [staffBranches, setStaffBranches] = useState<HrBranch[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    const productLines = getProductionOrderProductLines(row);
    // Ngày form = cột `ngay`; giờ bắt đầu/kết thúc lấy từ ngay_gio_* .
    const startDate = parseProductionOrderDateToIso(row.startDate) || todayIsoDate();
    const startDateTime =
      toDatetimeLocalInputValue(row.startAt) ||
      mergeProductionOrderDateTime(startDate, `${startDate}T08:00`);
    setForm({
      code: row.code === '-' ? '' : row.code,
      name: row.name === '-' ? '' : row.name,
      entryLines:
        productLines.length > 0
          ? productLines.map((product, index) => ({
              key: `edit-${row.id}-${index}`,
              orderRef: row.orderRef === '-' ? '' : row.orderRef,
              productCode: product.productCode === '-' ? '' : product.productCode,
              productName: product.productName === '-' ? '' : product.productName,
              quantity: product.quantity === '-' ? '' : product.quantity,
              unit: product.unit === '-' ? '' : product.unit
            }))
          : [newProductionOrderEntryLine()],
      status: row.status === '-' ? 'Chờ sx' : row.status,
      shift: row.shift === '-' ? '' : row.shift,
      selectedStaffIds: [],
      shiftLeadId: '',
      mainStaffId: '',
      assistantStaffId: '',
      traineeStaffId: '',
      startDate,
      startDateTime,
      endDateTime: toDatetimeLocalInputValue(row.endAt || row.endDate),
      machine: row.machine === '-' ? '' : row.machine,
      note: row.note === '-' ? '' : row.note || ''
    });
    setStaffRoles({
      shiftLead: row.shiftLead === '-' ? '' : row.shiftLead,
      mainStaff: row.mainStaff === '-' ? '' : row.mainStaff,
      assistantStaff: row.assistantStaff === '-' ? '' : row.assistantStaff,
      traineeStaff: row.traineeStaff === '-' ? '' : row.traineeStaff
    });
    setFormError('');
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const res = await fetch('/api/nhan-su?format=groups&scope=all');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải nhân sự.');
        if (!cancelled) setStaffBranches(normalizeHrBranches(data));
      } catch (error: any) {
        if (!cancelled) {
          setStaffBranches([]);
          setFormError(error?.message || 'Không thể tải nhân sự Phân xưởng sản xuất.');
        }
      } finally {
        if (!cancelled) setIsLoadingStaff(false);
      }
    };
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const workshopStaff = useMemo(() => collectProductionWorkshopStaff(staffBranches), [staffBranches]);

  const staffText = useMemo(
    () => [...new Set([
      staffRoles.shiftLead,
      staffRoles.mainStaff,
      staffRoles.assistantStaff,
      staffRoles.traineeStaff
    ].map(name => name.trim()).filter(Boolean))].join(', '),
    [staffRoles]
  );

  const orderCodeOptions = useMemo(() => {
    return [...new Set(orders.map(order => order.orderCode).filter(code => code && code !== '-'))].sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [orders]);

  const statusOptions = useMemo(() => {
    const options = [...PRODUCTION_ORDER_EDIT_STATUS_OPTIONS];
    if (form.status && !options.includes(form.status)) {
      options.push(form.status);
    }
    return options;
  }, [form.status]);

  const updateEntryLine = (key: string, patch: Partial<ProductionOrderEntryLine>) => {
    setForm(prev => ({
      ...prev,
      entryLines: mergeProductionOrderEntryLinesByProductCode(
        prev.entryLines.map(line => (line.key === key ? { ...line, ...patch } : line))
      )
    }));
  };

  const handleEntryOrderChange = (key: string, orderRef: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    let patch: Partial<ProductionOrderEntryLine> = {
      orderRef,
      productCode: '',
      productName: '',
      quantity: '',
      unit: ''
    };
    if (options.length === 1) {
      const product = options[0];
      patch = {
        orderRef,
        ...buildProductionEntryLine(
          orders,
          productionOrders,
          orderRef,
          product.code,
          product.name,
          product.unit
        )
      };
    }
    updateEntryLine(key, patch);
  };

  const handleEntryProductChange = (key: string, orderRef: string, productCode: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    const product = options.find(item => item.code === productCode);
    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      product?.name || '',
      product?.unit || ''
    );
    updateEntryLine(key, built);
  };

  if (!open || !row) return null;

  const handleSubmit = async () => {
    const filledLines = mergeProductionOrderEntryLinesByProductCode(
      form.entryLines.filter(line => line.orderRef.trim() && line.productCode.trim())
    );

    if (!form.startDate.trim()) {
      setFormError('Vui lòng chọn Ngày.');
      return;
    }

    if (filledLines.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng đơn hàng và mã hàng.');
      return;
    }

    for (const line of filledLines) {
      const quantity = Number(line.quantity);
      const productName = line.productName || line.productCode;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho ${productName}.`);
        return;
      }
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch(`/api/lenh-sx/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productionOrderFormToCreatePayload(form, filledLines, staffText, staffRoles))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể cập nhật lệnh sản xuất.');
      }

      await onSaved();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể cập nhật lệnh sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  const staffRoleFields = [
    { key: 'shiftLead', label: 'Trưởng ca' },
    { key: 'mainStaff', label: 'Nhân sự chính' },
    { key: 'assistantStaff', label: 'Thợ phụ' },
    { key: 'traineeStaff', label: 'Học việc' }
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Sửa lệnh sản xuất</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{row.code || row.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã lệnh</span>
            <input value={form.code} onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))} className={orderFieldClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày *</span>
            <DateInput
              value={form.startDate}
              onChange={startDate => {
                setForm(prev => ({
                  ...prev,
                  startDate,
                  startDateTime: mergeProductionOrderDateTime(startDate, prev.startDateTime)
                }));
              }}
              required
              className={`${orderFieldClass} pr-10`}
            />
          </label>

          <RepeatableLinesBlock
            className="col-span-2"
            title="Đơn hàng & mã hàng"
            required
            onAdd={() =>
              setForm(prev => ({
                ...prev,
                entryLines: [...prev.entryLines, newProductionOrderEntryLine()]
              }))
            }
            columns={[
              { key: 'order', label: 'Mã đơn', className: 'min-w-0 flex-[1.1]', required: true },
              { key: 'code', label: 'Mã hàng', className: 'min-w-0 flex-[1.35]', required: true },
              { key: 'name', label: 'Tên hàng', className: 'min-w-0 flex-[1.1]' },
              { key: 'unit', label: 'ĐV', className: 'w-16 shrink-0 sm:w-20' },
              { key: 'qty', label: 'SL', className: 'w-20 shrink-0 sm:w-24', required: true },
              { key: 'actions', label: '', className: 'w-9 shrink-0' }
            ]}
          >
            {form.entryLines.map(line => {
              const productOptions = listProductOptionsForOrder(
                orders,
                productionOrders,
                catalogProducts,
                line.orderRef
              );
              const selectedProduct = productOptions.find(item => item.code === line.productCode);

              return (
                <RepeatableLineRow key={line.key}>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <SearchableSelect
                      value={line.orderRef}
                      onChange={orderRef => handleEntryOrderChange(line.key, orderRef)}
                      options={orderCodeOptions}
                      placeholder="Gõ để tìm mã đơn"
                      inputClassName={orderFieldClass}
                      getLabel={item => String(item)}
                      getValue={item => String(item)}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.35]">
                    <SearchableSelect
                      value={line.productCode}
                      onChange={productCode => handleEntryProductChange(line.key, line.orderRef, productCode)}
                      options={productOptions}
                      placeholder={line.orderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                      disabled={!line.orderRef}
                      inputClassName={orderFieldClass}
                      getLabel={item => {
                        const product = item as (typeof productOptions)[number];
                        return product.code ? `${product.code} · ${product.name}` : product.name;
                      }}
                      getValue={item => (item as (typeof productOptions)[number]).code}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <input
                      value={selectedProduct?.name || line.productName}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="Tự điền theo mã hàng"
                    />
                  </div>
                  <div className="col-span-1 md:w-16 md:shrink-0 sm:md:w-20">
                    <input
                      value={line.unit}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="ĐV"
                    />
                  </div>
                  <div className="col-span-1 md:w-20 md:shrink-0 sm:md:w-24">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={e => updateEntryLine(line.key, { quantity: e.target.value })}
                      className={orderFieldClass}
                      placeholder="SL"
                    />
                  </div>
                  {form.entryLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(prev => ({
                          ...prev,
                          entryLines: prev.entryLines.filter(item => item.key !== line.key)
                        }))
                      }
                      className="col-span-2 md:col-span-1 md:mb-0.5 flex h-10 w-full md:h-9 md:w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="md:hidden">Xóa dòng này</span>
                    </button>
                  )}
                </RepeatableLineRow>
              );
            })}
          </RepeatableLinesBlock>

          <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
              <SearchableSelect
                value={form.status}
                onChange={status => setForm(prev => ({ ...prev, status }))}
                options={statusOptions}
                placeholder="Gõ để tìm trạng thái"
                inputClassName={orderFieldClass}
                getLabel={item => String(item)}
                getValue={item => String(item)}
                allowEmpty={false}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca</span>
              <input value={form.shift} onChange={e => setForm(prev => ({ ...prev, shift: e.target.value }))} className={orderFieldClass} />
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhân sự</span>
              <input
                value={staffText}
                readOnly
                className={`${orderFieldClass} bg-zinc-50 text-zinc-700`}
                placeholder="Tự tổng hợp theo các vai trò bên dưới"
              />
              <span className="block text-[10px] font-semibold text-zinc-400">
                Trưởng ca / NS chính / Thợ phụ / Học việc sổ từ phòng {PRODUCTION_WORKSHOP_DEPARTMENT}.
              </span>
            </label>

            {staffRoleFields.map(field => {
              const currentName = staffRoles[field.key];
              const hasCurrent =
                Boolean(currentName) &&
                !workshopStaff.some(member => member.name === currentName);
              return (
                <label key={field.key} className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">{field.label}</span>
                  <select
                    value={currentName}
                    onChange={event =>
                      setStaffRoles(prev => ({ ...prev, [field.key]: event.target.value }))
                    }
                    disabled={isLoadingStaff}
                    className={orderFieldClass}
                  >
                    <option value="">
                      {isLoadingStaff ? 'Đang tải nhân sự...' : 'Chưa phân công'}
                    </option>
                    {hasCurrent ? <option value={currentName}>{currentName}</option> : null}
                    {workshopStaff.map(member => (
                      <option key={`${field.key}-${member.id}`} value={member.name}>
                        {member.name}
                        {member.role ? ` · ${member.role}` : ''}
                        {member.shift ? ` · ${member.shift}` : ''}
                      </option>
                    ))}
                  </select>
                  {!isLoadingStaff && workshopStaff.length === 0 ? (
                    <span className="block text-[10px] font-semibold text-amber-700">
                      Chưa có nhân sự phòng {PRODUCTION_WORKSHOP_DEPARTMENT}.
                    </span>
                  ) : null}
                </label>
              );
            })}

            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Máy</span>
              {renderMachineSelect(
                form.machine,
                machine => setForm(prev => ({ ...prev, machine })),
                machines,
                { placeholder: 'Gõ để tìm máy' }
              )}
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu</span>
              <input
                type="time"
                value={form.startDateTime.includes('T') ? form.startDateTime.split('T')[1]?.slice(0, 5) || '' : ''}
                onChange={e => {
                  const time = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    startDateTime: mergeProductionOrderDateTime(prev.startDate, `${prev.startDate}T${time}`)
                  }));
                }}
                className={orderFieldClass}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày giờ kết thúc</span>
              <input
                type="datetime-local"
                value={form.endDateTime}
                onChange={e => setForm(prev => ({ ...prev, endDateTime: e.target.value }))}
                className={orderFieldClass}
              />
            </label>

            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
              <textarea
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                rows={3}
                placeholder="Nhập ghi chú cho lệnh sản xuất..."
                className={`${orderFieldClass} min-h-[80px] resize-y`}
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

