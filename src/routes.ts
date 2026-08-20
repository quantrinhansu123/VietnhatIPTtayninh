export type AppTab = 'menu' | 'quan-tri' | 'production-reports' | 'report-forms' | 'report-lists' | 'facility-management' | 'hcns' | 'business' | 'factory' | 'factory-quan-doc' | 'factory-qc' | 'factory-cong-nhan' | 'factory-kho' | 'control-board' | 'form' | 'weighing-summary' | 'weighing-summary-list' | 'can-tu-dong' | 'can-tu-dong-pilot' | 'can-kiem-kho' | 'kiem-kho' | 'kiem-kho-chenh-lech' | 'quan-ly-kho' | 'damaged-goods-report' | 'damaged-goods-report-list' | 'mixing-report' | 'mixing-report-list' | 'machine-nvl-report' | 'machine-nvl-report-list' | 'machine-downtime-report' | 'machine-downtime-list' | 'shift-handover-report' | 'shift-handover-list' | 'machine-run-log' | 'machine-run-log-list' | 'acceptance-report' | 'acceptance-report-list' | 'hr' | 'vehicles' | 'inventory-catalog' | 'products' | 'machines' | 'materials' | 'warehouse-slip' | 'warehouse-history' | 'damaged-goods-warehouse' | 'ton-kho' | 'orders' | 'customers' | 'shipping-orders' | 'production-orders' | 'production-plan-history' | 'settings' | 'dashboard' | 'dashboard-auto';

export const TAB_ROUTES: Record<AppTab, string> = {
  menu: '/',
  'quan-tri': '/quan-tri',
  'production-reports': '/bao-cao-san-xuat',
  'report-forms': '/phieu-bao-cao',
  'report-lists': '/danh-sach-bao-cao',
  'facility-management': '/quan-ly-csvc',
  hcns: '/hcns',
  business: '/kinh-doanh',
  factory: '/nha-may',
  'factory-quan-doc': '/nha-may/quan-doc',
  'factory-qc': '/nha-may/qc',
  'factory-cong-nhan': '/nha-may/cong-nhan',
  'factory-kho': '/nha-may/kho',
  'control-board': '/bang-dieu-khien',
  form: '/nhap-bao-cao',
  'weighing-summary': '/tong-hop-ca',
  'weighing-summary-list': '/danh-sach-phieu-can-ca',
  'can-tu-dong': '/can-tu-dong',
  'can-tu-dong-pilot': '/tram-can-qr',
  'can-kiem-kho': '/can-kiem-kho',
  'kiem-kho': '/kiem-kho',
  'kiem-kho-chenh-lech': '/xu-ly-chenh-lech',
  'quan-ly-kho': '/quan-ly-kho',
  'damaged-goods-report': '/bao-cao-hang-hong',
  'damaged-goods-report-list': '/danh-sach-bao-cao-hang-hong',
  'mixing-report': '/bao-cao-phoi-tron',
  'mixing-report-list': '/danh-sach-bao-cao-phoi-tron',
  'machine-nvl-report': '/bao-cao-may-nvl-ton',
  'machine-nvl-report-list': '/danh-sach-bao-cao-may-nvl-ton',
  'machine-downtime-report': '/phieu-bao-dung-may',
  'machine-downtime-list': '/danh-sach-bao-cao-dung-may',
  'shift-handover-report': '/phieu-giao-ca',
  'shift-handover-list': '/danh-sach-phieu-giao-ca',
  'machine-run-log': '/nhat-ky-chay-may',
  'machine-run-log-list': '/danh-sach-nhat-ky-chay-may',
  'acceptance-report': '/bao-cao-san-luong',
  'acceptance-report-list': '/danh-sach-bao-cao-san-luong',
  hr: '/nhan-su',
  vehicles: '/danh-sach-xe',
  'inventory-catalog': '/kho-hang',
  products: '/san-pham',
  machines: '/danh-sach-may',
  materials: '/kho-nvl',
  'warehouse-slip': '/phieu-xuat-nhap-kho',
  'warehouse-history': '/lich-su-xuat-nhap-kho',
  'damaged-goods-warehouse': '/kho-hang-hong',
  'ton-kho': '/ton-kho',
  orders: '/don-hang',
  customers: '/khach-hang',
  'shipping-orders': '/lenh-xuat-hang',
  'production-orders': '/lenh-san-xuat',
  'production-plan-history': '/ke-hoach-san-xuat',
  settings: '/cai-dat',
  dashboard: '/phan-tich',
  'dashboard-auto': '/phan-tich-tu-dong'
};

const PATH_TO_TAB = new Map<string, AppTab>(
  Object.entries(TAB_ROUTES).map(([tab, path]) => [path, tab as AppTab])
);

PATH_TO_TAB.set('/bao-cao-nghiem-thu', 'acceptance-report');
PATH_TO_TAB.set('/menu', 'menu');
PATH_TO_TAB.set('/quy-che-lai-xe', 'menu');
PATH_TO_TAB.set('/bao-cao-can', 'weighing-summary');
PATH_TO_TAB.set('/nguyen-phu-lieu', 'materials');
PATH_TO_TAB.set('/tong-hop-ca', 'weighing-summary');
PATH_TO_TAB.set('/danh-sach-phieu-can-ca', 'weighing-summary-list');

export function tabFromPath(pathname: string): AppTab {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return PATH_TO_TAB.get(normalized) ?? 'menu';
}

export function pathFromTab(tab: AppTab): string {
  return TAB_ROUTES[tab];
}

export function normalizeAppPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function isWeighingFormPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === '/tong-hop-ca' || path === '/bao-cao-can';
}

export function isWeighingListPath(pathname: string): boolean {
  return normalizeAppPath(pathname) === '/danh-sach-phieu-can-ca';
}
