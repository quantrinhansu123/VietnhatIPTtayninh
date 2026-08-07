import type { AppTab } from '../../routes';

export type StaffViewChild = {
  tab: AppTab | string;
  label: string;
};

export type StaffViewGroup = {
  menu: AppTab | string;
  label: string;
  children: StaffViewChild[];
};

export type StaffViewPermissions = StaffViewGroup[];

/** Tài khoản quản trị hệ thống luôn có toàn quyền, không phụ thuộc cấu hình menu theo nhân sự. */
export const PRIMARY_ADMIN_USERNAME = 'itvietnhat2026@gmail.com';

/** Cây menu cha / con dùng cấp quyền (đồng bộ cấu trúc menu app) */
export const STAFF_MENU_VIEW_TREE: StaffViewGroup[] = [
  {
    menu: 'quan-tri',
    label: 'Quản trị',
    children: [
      { tab: 'dashboard', label: 'Dashboard' },
      { tab: 'settings', label: 'Cài đặt / phân quyền' }
    ]
  },
  {
    menu: 'hcns',
    label: 'HCNS',
    children: [{ tab: 'hr', label: 'Hồ sơ nhân sự' }]
  },
  {
    menu: 'business',
    label: 'Kinh doanh',
    children: [
      { tab: 'customers', label: 'Khách hàng' },
      { tab: 'orders', label: 'Đơn đặt hàng' },
      { tab: 'shipping-orders', label: 'Lệnh giao / xuất hàng' }
    ]
  },
  {
    menu: 'factory-quan-doc',
    label: 'Quản Đốc',
    children: [
      { tab: 'production-plan-history', label: 'Kế hoạch sản xuất' },
      { tab: 'production-orders', label: 'Lệnh sản xuất' },
      { tab: 'control-board', label: 'Theo dõi sản xuất' },
      { tab: 'production-reports', label: 'Báo cáo sản xuất' }
    ]
  },
  {
    menu: 'factory-qc',
    label: 'QC',
    children: [
      { tab: 'mixing-report-list', label: 'BOM và tỷ lệ phối trộn' },
      { tab: 'damaged-goods-report-list', label: 'Kiểm soát hàng hỏng' },
      { tab: 'weighing-summary-list', label: 'Phiếu cân ca' },
      { tab: 'can-tu-dong', label: 'Dữ liệu cân tự động' },
      { tab: 'acceptance-report-list', label: 'Kiểm tra kho thành phẩm' }
    ]
  },
  {
    menu: 'factory-cong-nhan',
    label: 'Công nhân',
    children: [
      { tab: 'production-orders', label: 'Công việc được giao' },
      { tab: 'report-forms', label: 'Nhập báo cáo ca' },
      { tab: 'report-lists', label: 'Lịch sử công việc' }
    ]
  },
  {
    menu: 'factory-kho',
    label: 'Kho',
    children: [
      { tab: 'quan-ly-kho', label: 'Danh mục kho' },
      { tab: 'materials', label: 'Kho nguyên vật liệu' },
      { tab: 'products', label: 'Kho thành phẩm' },
      { tab: 'warehouse-slip', label: 'Phiếu xuất nhập kho' },
      { tab: 'kiem-kho', label: 'Kiểm kho' },
      { tab: 'warehouse-history', label: 'Lịch sử xuất nhập' }
    ]
  },
  {
    menu: 'vehicles',
    label: 'Lái xe',
    children: [{ tab: 'vehicles', label: 'Lái xe' }]
  },
  {
    menu: 'machines',
    label: 'Quản lý máy',
    children: [{ tab: 'machines', label: 'Quản lý máy' }]
  },
  {
    menu: 'facility-management',
    label: 'Quản lý CSVC',
    children: [
      { tab: 'materials', label: 'Kho NVL' },
      { tab: 'products', label: 'Sản phẩm' },
      { tab: 'machines', label: 'Máy móc' },
      { tab: 'warehouse-slip', label: 'Phiếu xuất nhập kho' }
    ]
  }
];

export function defaultStaffViewPermissions(): StaffViewPermissions {
  return STAFF_MENU_VIEW_TREE.map(group => ({
    menu: group.menu,
    label: group.label,
    children: group.children.map(child => ({ ...child }))
  }));
}

export function clearStaffViewPermissions(): StaffViewPermissions {
  return [];
}

export function normalizeStaffViewPermissions(raw: unknown): StaffViewPermissions {
  if (raw === null || raw === undefined) return [];

  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) return [];

  return value
    .map((item): StaffViewGroup | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const menu = String(record.menu ?? record.tab ?? '').trim();
      const label = String(record.label ?? record.title ?? menu).trim();
      if (!menu) return null;

      const childrenRaw = Array.isArray(record.children) ? record.children : [];
      const children = childrenRaw
        .map((child): StaffViewChild | null => {
          if (!child || typeof child !== 'object') return null;
          const childRecord = child as Record<string, unknown>;
          const tab = String(childRecord.tab ?? childRecord.menu ?? '').trim();
          const childLabel = String(childRecord.label ?? childRecord.title ?? tab).trim();
          if (!tab) return null;
          return { tab, label: childLabel };
        })
        .filter((child): child is StaffViewChild => Boolean(child));

      return { menu, label: label || menu, children };
    })
    .filter((group): group is StaffViewGroup => Boolean(group))
    .map(group => {
      // Sửa quyền chỉ có menu cha / children rỗng → gắn đủ menu con theo cây hiện tại.
      if (group.children.length > 0) return group;
      const tree = STAFF_MENU_VIEW_TREE.find(item => item.menu === group.menu);
      if (!tree || tree.children.length === 0) return group;
      return {
        ...group,
        label: group.label || tree.label,
        children: tree.children.map(child => ({ ...child }))
      };
    });
}

/** Tập hợp tab (menu cha + con) mà nhân sự được xem */
export function buildAllowedTabSet(permissions: StaffViewPermissions): Set<string> {
  const tabs = new Set<string>();
  permissions.forEach(group => {
    if (!group?.menu) return;
    const menu = String(group.menu);
    tabs.add(menu);

    const savedChildren = Array.isArray(group.children) ? group.children : [];
    // Menu cha được lưu nhưng children rỗng (dữ liệu cũ / normalize lỗi) → mở hết menu con trong cây.
    const children =
      savedChildren.length > 0
        ? savedChildren
        : STAFF_MENU_VIEW_TREE.find(item => item.menu === menu)?.children ?? [];

    children.forEach(child => {
      if (child.tab) tabs.add(String(child.tab));
    });
  });
  return tabs;
}

/** Gộp nhiều bộ quyền (nhiều vị trí gán) — union theo menu + tab con. */
export function mergeStaffViewPermissions(
  ...lists: StaffViewPermissions[]
): StaffViewPermissions {
  const byMenu = new Map<string, StaffViewGroup>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const group of list) {
      if (!group?.menu) continue;
      const menu = String(group.menu);
      let existing = byMenu.get(menu);
      if (!existing) {
        existing = {
          menu,
          label: String(group.label || menu),
          children: []
        };
        byMenu.set(menu, existing);
      }
      const seen = new Set(existing.children.map(child => child.tab));
      for (const child of group.children || []) {
        const tab = String(child?.tab || '').trim();
        if (!tab || seen.has(tab)) continue;
        existing.children.push({
          tab,
          label: String(child.label || tab)
        });
        seen.add(tab);
      }
    }
  }

  return [...byMenu.values()];
}

function normalizeAccessIdentity(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim()
    .toLowerCase();
}

/** Tài khoản quản trị hoặc vai trò quản trị được xem toàn bộ menu. */
export function hasFullMenuAccess(
  role: string | null | undefined,
  username?: string | null
): boolean {
  if (normalizeAccessIdentity(username) === PRIMARY_ADMIN_USERNAME) return true;

  const normalizedRole = normalizeAccessIdentity(role);
  return [
    'admin',
    'administrator',
    'super admin',
    'superadmin',
    'quan tri',
    'quan tri vien',
    'quan tri he thong'
  ].includes(normalizedRole);
}

export function summarizeStaffViewPermissions(permissions: StaffViewPermissions): string {
  if (permissions.length === 0) return 'Chưa cấu hình';
  return permissions
    .map(group => {
      const childCount = group.children.length;
      return childCount > 0 ? `${group.label} (${childCount})` : group.label;
    })
    .join(' · ');
}

export function formatStaffViewPermissionsJson(permissions: StaffViewPermissions): string {
  return JSON.stringify(permissions, null, 2);
}

export function isStaffChildViewSelected(
  permissions: StaffViewPermissions,
  parentMenu: string,
  childTab: string
): boolean {
  const group = permissions.find(item => item.menu === parentMenu);
  if (!group) return false;
  return group.children.some(child => child.tab === childTab);
}

export function isStaffParentViewSelected(permissions: StaffViewPermissions, group: StaffViewGroup): boolean {
  if (group.children.length === 0) {
    return permissions.some(item => item.menu === group.menu);
  }
  return group.children.every(child => isStaffChildViewSelected(permissions, group.menu, child.tab));
}

export function isStaffParentViewIndeterminate(
  permissions: StaffViewPermissions,
  group: StaffViewGroup
): boolean {
  if (group.children.length === 0) return false;
  const selectedCount = group.children.filter(child =>
    isStaffChildViewSelected(permissions, group.menu, child.tab)
  ).length;
  return selectedCount > 0 && selectedCount < group.children.length;
}

export function toggleStaffChildView(
  permissions: StaffViewPermissions,
  parentMenu: string,
  parentLabel: string,
  child: StaffViewChild,
  checked: boolean
): StaffViewPermissions {
  const next = permissions.map(group => ({
    ...group,
    children: group.children.map(childItem => ({ ...childItem }))
  }));

  let group = next.find(item => item.menu === parentMenu);
  if (!group) {
    group = { menu: parentMenu, label: parentLabel, children: [] };
    next.push(group);
  }

  const exists = group.children.some(item => item.tab === child.tab);
  if (checked && !exists) {
    group.children.push({ ...child });
  }
  if (!checked) {
    group.children = group.children.filter(item => item.tab !== child.tab);
  }

  return next
    .map(item => ({
      ...item,
      children: item.children.filter(childItem => childItem.tab)
    }))
    .filter(item => item.children.length > 0);
}

/** Tick menu cha → chọn / bỏ toàn bộ menu con */
export function toggleStaffParentView(
  permissions: StaffViewPermissions,
  group: StaffViewGroup,
  checked: boolean
): StaffViewPermissions {
  if (!checked) {
    return permissions.filter(item => item.menu !== group.menu);
  }

  const without = permissions.filter(item => item.menu !== group.menu);
  return [
    ...without,
    {
      menu: group.menu,
      label: group.label,
      children: group.children.map(child => ({ ...child }))
    }
  ];
}
