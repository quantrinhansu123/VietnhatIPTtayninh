import { pickText } from './recordHelpers';
import { normalizeHrBranches } from './hr';
import { normalizeProducts } from '../san-pham';

export const ORDER_TYPE_OPTIONS = ['Đơn bán', 'Đơn sản xuất'] as const;
export const ORDER_STATUS_DEFAULT = 'Chờ sx';
export const ORDER_STATUS_OPTIONS = ['Chờ sx', 'Đang sx', 'Hoàn thành', 'Hủy'] as const;
export const STORAGE_ORDER_UNIT_KEY = 'order_unit_suggestions_v1';
export const orderFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

export interface StaffOption {
  name: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  code: string;
}

export interface OrderProductOption {
  code: string;
  name: string;
  unit: string;
  newCode: string;
}

export function normalizeLookupText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function resolveStaffNameFromLogin(
  loginName: string | undefined | null,
  options: StaffOption[] = []
): string {
  const name = String(loginName || '').trim();
  if (!name) return '';
  const key = normalizeLookupText(name);
  const match = options.find(option => normalizeLookupText(option.name) === key);
  return match?.name || name;
}

export function normalizeStaffOptions(data: unknown): StaffOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item): StaffOption | null => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['name', 'nhan_su', 'ho_ten', 'ten'], '');
      return name ? { name } : null;
    })
    .filter((item): item is StaffOption => Boolean(item));
}

function isHcmBranchText(value: string) {
  const text = normalizeLookupText(value);
  return (
    text.includes('hcm') ||
    text.includes('ho chi minh') ||
    text.includes('tp hcm') ||
    text.includes('sai gon')
  );
}

/** Nhân viên KD / Quản đốc chi nhánh HCM — sổ Nhân viên form đơn hàng. */
export function normalizeHcmBusinessStaffOptions(data: unknown): StaffOption[] {
  const branches = normalizeHrBranches(data);
  const isQuanDocText = (value: string) => {
    const text = normalizeLookupText(value);
    return text === 'quan doc' || text.includes('quan doc');
  };
  const staff = branches.flatMap(branch => {
    const branchText = normalizeLookupText(`${branch.name} ${branch.shortName}`);
    if (!isHcmBranchText(branchText)) return [];

    return branch.departments.flatMap(department => {
      const departmentText = normalizeLookupText(department.name);
      const isBusinessDept = departmentText.includes('kinh doanh');
      const isQuanDocDept = isQuanDocText(department.name);
      return department.members
        .filter(member => {
          if (isBusinessDept || isQuanDocDept) return true;
          return isQuanDocText(member.role) || isQuanDocText(member.position || '');
        })
        .map(member => ({ name: member.name }));
    });
  });

  const seen = new Set<string>();
  return staff
    .filter(item => {
      const key = normalizeLookupText(item.name.trim());
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function normalizeCustomerOptions(data: unknown): CustomerOption[] {
  if (!data || typeof data !== 'object') return [];
  const customers = (data as { customers?: unknown }).customers;
  if (!Array.isArray(customers)) return [];

  return customers
    .map((item): CustomerOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['ten_khach_hang', 'khach_hang', 'ten', 'name', 'ten_cong_ty'], '');
      const code = pickText(record, ['ma_khach_hang', 'ma_kh', 'code', 'id'], '');
      if (!name && !code) return null;
      return {
        id: code || name,
        name: name || code,
        code
      };
    })
    .filter((item): item is CustomerOption => Boolean(item));
}

export function normalizeOrderProducts(data: unknown): OrderProductOption[] {
  return normalizeProducts(data).map(product => ({
    code: product.code,
    name: product.name,
    unit: product.unit === '-' ? '' : product.unit,
    newCode: product.newCode
  }));
}

export function findOrderProductByCode(products: OrderProductOption[], code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  return (
    products.find(
      product =>
        product.code.toLowerCase() === normalized ||
        product.newCode.toLowerCase() === normalized
    ) ?? null
  );
}

export function resolveOrderProductFields(
  products: OrderProductOption[],
  productCode: string,
  fallback: { productName?: string; unit?: string } = {}
) {
  const match = findOrderProductByCode(products, productCode);
  if (!match) {
    return {
      productName: productCode.trim() ? '' : (fallback.productName ?? ''),
      unit: fallback.unit ?? ''
    };
  }

  return {
    productName: match.name,
    unit: match.unit || fallback.unit || ''
  };
}

export function readUnitSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_UNIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  } catch {
    return [];
  }
}

export function saveUnitSuggestion(unit: string) {
  const trimmed = unit.trim();
  if (!trimmed) return;
  const next = [...new Set([trimmed, ...readUnitSuggestions()])].slice(0, 30);
  localStorage.setItem(STORAGE_ORDER_UNIT_KEY, JSON.stringify(next));
}
