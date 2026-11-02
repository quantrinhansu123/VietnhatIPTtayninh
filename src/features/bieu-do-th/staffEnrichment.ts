import type { MachineRow } from '../danh-sach-may';
import { resolveMachineDisplayValue } from '../danh-sach-may';
import {
  normalizeProductionOrders,
  resolveProductionOrderMachine,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import { shiftNamesMatch } from '../../utils/shiftSettings';

function normalizeMachineToken(value: string, machines: MachineRow[]) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-' || raw.toLowerCase() === 'all') return '';
  return (resolveMachineDisplayValue(raw, machines) || raw).replace(/\s+/g, '').toUpperCase();
}

export function machineLabelsMatch(left: string, right: string, machines: MachineRow[]) {
  const a = normalizeMachineToken(left, machines);
  const b = normalizeMachineToken(right, machines);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Trưởng ca trên lệnh SX.
 * Ưu tiên `truong_ca` / shiftLead. Lệnh cũ chưa tách vai trò → fallback
 * nhân sự chính, rồi người đầu trong `nhan_su` (không lấy thợ phụ).
 */
export function orderShiftLeadNames(order: ProductionOrderRow): string[] {
  const fromLead = splitProductionOrderStaffNames(order.shiftLead);
  if (fromLead.length > 0) return fromLead;
  const fromMain = splitProductionOrderStaffNames(order.mainStaff);
  if (fromMain.length > 0) return fromMain;
  return splitProductionOrderStaffNames(order.staff).slice(0, 1);
}

/** @deprecated Dùng orderShiftLeadNames — bảng TH chỉ tính trưởng ca. */
export function orderMainStaffNames(order: ProductionOrderRow): string[] {
  return orderShiftLeadNames(order);
}

export function staffNamesInclude(haystack: string, needle: string) {
  const target = String(needle || '').trim();
  if (!target || target === 'all') return true;
  return splitProductionOrderStaffNames(haystack).some(name => name === target);
}

/** Ghép trưởng ca từ lệnh SX khớp ngày · ca · máy của dòng bao_cao_tong_hop. */
export function resolveCongNhanPhuTrach(input: {
  ngayTu: string;
  ngayDen: string;
  ca: string;
  may: string;
  orders: ProductionOrderRow[];
  machines: MachineRow[];
}): string {
  const from = String(input.ngayTu || '').trim();
  const to = String(input.ngayDen || input.ngayTu || '').trim() || from;
  if (!from) return '';

  const names = new Set<string>();
  for (const order of input.orders) {
    const orderDate = parseProductionOrderFilterDate(order.startDate);
    if (!orderDate || orderDate < from || orderDate > to) continue;

    const ca = String(input.ca || '').trim();
    if (ca && ca !== 'all' && !shiftNamesMatch(order.shift, ca)) continue;

    const may = String(input.may || '').trim();
    if (may && may !== 'all') {
      const orderMay = resolveProductionOrderMachine(order, input.machines);
      if (!machineLabelsMatch(may, orderMay, input.machines)) continue;
    }

    orderShiftLeadNames(order).forEach(name => names.add(name));
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'vi')).join(', ');
}

export function loadProductionOrdersFromApi(data: unknown): ProductionOrderRow[] {
  return normalizeProductionOrders(data);
}
