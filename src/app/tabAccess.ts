import type { AppTab } from '../routes';
import { STAFF_MENU_VIEW_TREE } from '../features/nhan-su/menuViews';

/**
 * Form/create tabs map → list tab trong ma trận Phân quyền.
 * Tránh lọt quyền vì tab form không có trong STAFF_MENU_VIEW_TREE.
 */
export const TAB_ACCESS_ALIASES: Record<string, string> = {
  'weighing-summary': 'weighing-summary-list',
  'damaged-goods-report': 'damaged-goods-report-list',
  'mixing-report': 'mixing-report-list',
  'machine-nvl-report': 'machine-nvl-report-list',
  'machine-downtime-report': 'machine-downtime-list',
  'acceptance-report': 'acceptance-report-list',
  'machine-run-log': 'machine-run-log-list'
};

/**
 * Hub trong cây Phân quyền (Công nhân / Quản Đốc) ≠ từng card bên trong.
 * Có quyền hub → được xem các tab card thuộc hub đó.
 */
export const HUB_IMPLIED_TABS: Record<string, readonly string[]> = {
  'report-forms': [
    'machine-nvl-report',
    'mixing-report',
    'weighing-summary',
    'machine-downtime-report',
    'machine-run-log',
    'damaged-goods-report',
    'acceptance-report',
    'kiem-kho',
    // form ↔ list (nút Danh sách / Sửa)
    'machine-nvl-report-list',
    'mixing-report-list',
    'weighing-summary-list',
    'machine-downtime-list',
    'machine-run-log-list',
    'damaged-goods-report-list',
    'acceptance-report-list'
  ],
  'report-lists': [
    'machine-nvl-report-list',
    'mixing-report-list',
    'weighing-summary-list',
    'can-tu-dong',
    'kiem-kho',
    'damaged-goods-report-list',
    'acceptance-report-list',
    'warehouse-history',
    'machine-downtime-list',
    'machine-run-log-list'
  ],
  'production-reports': ['report-forms', 'report-lists']
};

export function resolveAccessTab(tab: AppTab | string): string {
  const raw = String(tab || '').trim();
  return TAB_ACCESS_ALIASES[raw] || raw;
}

/** Bổ sung tab card ẩn sau hub (report-forms / report-lists / …). */
export function expandImpliedHubTabs(tabs: Set<string>): Set<string> {
  const out = new Set(tabs);
  let changed = true;
  while (changed) {
    changed = false;
    for (const tab of [...out]) {
      const implied = HUB_IMPLIED_TABS[tab];
      if (!implied) continue;
      for (const next of implied) {
        if (!out.has(next)) {
          out.add(next);
          changed = true;
        }
      }
    }
  }
  return out;
}

/** Tập tab cha + con trong cây phân quyền + alias form. */
export function buildKnownPermissionTabSet(): Set<string> {
  const tabs = new Set<string>();
  for (const group of STAFF_MENU_VIEW_TREE) {
    if (group.menu) tabs.add(String(group.menu));
    for (const child of group.children) {
      if (child.tab) tabs.add(String(child.tab));
    }
  }
  for (const [from, to] of Object.entries(TAB_ACCESS_ALIASES)) {
    tabs.add(from);
    tabs.add(to);
  }
  for (const [hub, implied] of Object.entries(HUB_IMPLIED_TABS)) {
    tabs.add(hub);
    for (const tab of implied) tabs.add(tab);
  }
  // Hub phụ dùng trong App nhưng không nằm trong matrix
  tabs.add('factory');
  tabs.add('menu');
  tabs.add('form');
  return tabs;
}

/** Hub menu cha: được vào nếu có quyền cha hoặc bất kỳ menu con. */
export function hubHasAllowedChild(hubTab: string, allowed: Set<string>): boolean {
  if (allowed.has(hubTab)) return true;
  const group = STAFF_MENU_VIEW_TREE.find(item => item.menu === hubTab);
  if (group) {
    return group.children.some(child => allowed.has(child.tab));
  }
  if (hubTab === 'factory') {
    return [
      'factory-quan-doc',
      'factory-qc',
      'factory-cong-nhan',
      'factory-kho',
      'facility-management',
      'production-reports',
      'production-orders',
      'production-plan-history',
      'control-board'
    ].some(tab => allowed.has(tab) || hubHasAllowedChild(tab, allowed));
  }
  if (HUB_IMPLIED_TABS[hubTab]) {
    return HUB_IMPLIED_TABS[hubTab].some(tab => allowed.has(tab));
  }
  return false;
}
