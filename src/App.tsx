import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ProductionReport, ShiftInfo, ProductEntry, MaterialBatches, STANDARD_SHIFTS
} from './types';
import { computeReportMetrics, formatNumber } from './utils';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ShiftInfoForm from './components/ShiftInfoForm';
import ProductEntryForm from './components/ProductEntryForm';
import MaterialsForm from './components/MaterialsForm';
import WasteForm from './components/WasteForm';
import WeighingShiftSummary from './components/WeighingShiftSummary';
import {
  buildWeighingEditPending,
  normalizeWeighingRecords,
  type WeighingPendingAdd
} from './utils/weighingRecords';
import WeighingReportForm from './components/WeighingReportForm';
import { DAMAGED_GOODS_SLIP_CONFIG } from './lib/weighingSlipConfig';
import MixingReportForm from './components/MixingReportForm';
import MixingReportListView from './components/MixingReportListView';
import MachineNvlReportListView from './components/MachineNvlReportListView';
import AcceptanceReportForm, {
  normalizeAcceptanceReports,
  type AcceptanceReport,
  type AcceptanceReportCreatePrefill
} from './components/AcceptanceReportForm';
import AcceptanceReportListView from './components/AcceptanceReportListView';
import ControlBoardShiftSummaryTable from './components/ControlBoardShiftSummaryTable';
import { buildControlBoardShiftSummary, collectShiftSummaryStaffOptions, defaultShiftSummaryDateRange, type ShiftSummaryWarehouseMovement } from './utils/controlBoardShiftSummary';
import { normalizeMachineNvlReports, type MachineNvlSavedReport } from './utils/machineNvlReports';
import { getProductionShiftOptions, normalizeShiftSettings } from './utils/shiftSettings';
import { normalizeMixingReport } from './lib/mixingReportModel';
import type { MixingReport } from './components/MixingReportForm';
import MachineDowntimeReportPanel from './components/MachineDowntimeReportPanel';
import MachineDowntimeReportListView from './components/MachineDowntimeReportListView';
import MachineRunLogPanel from './components/MachineRunLogPanel';
import AppToastHost from './components/AppToastHost';
import { AppTab, pathFromTab, tabFromPath, isWeighingFormPath, isWeighingListPath } from './routes';
import {
  FilePlus2, BarChart3, CheckCircle, Sparkles, Loader2, Menu, Search, Save, ChevronRight, ChevronLeft,
  Layers, Package, Cpu, Boxes, ClipboardList, X, LogOut
} from 'lucide-react';

import { readCachedReports, STORAGE_DRAFT_KEY, STORAGE_OFFLINE_KEY, STORAGE_REPORTS_CACHE_KEY, STORAGE_AUTH_KEY } from './features/_shared/storage';
import LoginPage, { grantResolvedAccess, type AuthUser } from './components/LoginPage';
import { AccessControlProvider } from './app/accessControl';
import { buildAllowedTabSet, hasFullMenuAccess } from './features/nhan-su/menuViews';
import { refreshAuthUserPermissions } from './app/refreshAuthPermissions';
import {
  buildKnownPermissionTabSet,
  expandImpliedHubTabs,
  hubHasAllowedChild,
  resolveAccessTab
} from './app/tabAccess';
import { VietNhatLogo } from './components/layout/Logo';
import { BackButton, HomeNavButton, MobileBackNavButton, BACK_TAB_MAP } from './components/layout/NavButtons';
import {
  MenuCardGrid, MainMenuFlow, FourStepMenuFlow, MenuPageHeader, SubNav, MAIN_MENU_ITEMS,
  ADMIN_MENU_ITEMS, REPORT_FORM_MENU_ITEMS, PRODUCTION_REPORT_MENU_ITEMS, FACILITY_MENU_ITEMS,
  REPORT_LIST_MENU_ITEMS, HCNS_MENU_ITEMS, BUSINESS_MENU_ITEMS, FACTORY_MENU_ITEMS,
  FACTORY_QUAN_DOC_MENU_ITEMS, FACTORY_QC_MENU_ITEMS, FACTORY_CONG_NHAN_MENU_ITEMS, FACTORY_KHO_MENU_ITEMS,
  getActivePageMeta
} from './app/menus';
import { ProductsPanel } from './features/san-pham';
import { MachinesPanel } from './features/danh-sach-may';
import { MaterialsInventoryPanel } from './features/kho-nvl';
import { WarehouseSlipPanel, WarehouseHistoryPanel } from './features/phieu-xuat-nhap-kho';
import { CustomersPanel } from './features/khach-hang';
import { ShippingOrdersPanel } from './features/lenh-xuat-hang';
import { OrdersPanel } from './features/don-hang';
import { ProductionOrdersPanel } from './features/lenh-sx';
import { ProductionPlanHistoryPanel } from './features/ke-hoach-san-xuat';
import { SettingsPanel } from './features/cai-dat-thoi-gian';
import { DashboardWindow } from './features/dashboard';
import { ControlBoardPanel } from './features/control-board';
import { HumanResourcesPanel } from './features/nhan-su';
import { VehiclesPanel } from './features/danh-sach-xe';
import { CanTuDongPanel } from './features/can-tu-dong';
import { KiemKhoPanel } from './features/kiem-kho';
import { QuanLyKhoPanel } from './features/quan-ly-kho';
import { MachineNvlReportPanel } from './features/bao-cao-may-nvl-ton';

const DEFAULT_REPORT: Omit<ProductionReport, 'id' | 'createdAt'> = {
  date: new Date().toISOString().split('T')[0],
  shiftInfo: {
    machineId: '',
    shiftName: '',
    operatorName: '',
    assistantName: ''
  },
  productEntry: {
    productCode: '',
    rolls: 0,
    actualWeight: 0
  },
  materials: {
    virginPlastic: [0],
    recycledPlastic: [0],
    brightenerPowder: [0],
    dispersionOil: [0],
    otherAdditives: [0]
  },
  wasteWeight: 0,
  notes: ''
};

function readStoredAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_KEY);
    return raw ? grantResolvedAccess(JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => readStoredAuthUser());
  const handleLogin = (user: AuthUser) => {
    const resolvedUser = grantResolvedAccess(user);
    try {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(resolvedUser));
    } catch {
      /* ignore storage errors */
    }
    setAuthUser(resolvedUser);
  };
  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_AUTH_KEY);
    } catch {
      /* ignore storage errors */
    }
    setAuthUser(null);
  };

  // Mỗi lần mở app: nạp lại quyền từ ma trận Phân quyền (tránh localStorage quyền cũ).
  useEffect(() => {
    const username = authUser?.username;
    if (!username || authUser?.fullAccess) return;
    let cancelled = false;
    void refreshAuthUserPermissions(username).then(next => {
      if (cancelled || !next) return;
      try {
        localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setAuthUser(next);
    });
    return () => {
      cancelled = true;
    };
    // Chỉ chạy khi đổi user đăng nhập
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.username, authUser?.fullAccess]);

  const [activeTab, setActiveTab] = useState<AppTab>(() => tabFromPath(window.location.pathname));
  const [locationPath, setLocationPath] = useState(() => window.location.pathname);
  const resolvedTab = useMemo(() => tabFromPath(locationPath), [locationPath]);
  const [currentStep, setCurrentStep] = useState<number>(1); // 1: Shift & Product, 2: Materials, 3: Waste & Submit
  const [reportForm, setReportForm] = useState<Omit<ProductionReport, 'id' | 'createdAt'>>(DEFAULT_REPORT);
  const [reports, setReports] = useState<ProductionReport[]>(() => readCachedReports());
  
  // App states
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [isFetchLoading, setIsFetchLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<{ id: string; text: string; type: 'success' | 'error' | 'warning' }[]>([]);
  const [offlineReports, setOfflineReports] = useState<ProductionReport[]>([]);
  const [quickNavOpen, setQuickNavOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setQuickNavOpen(open => !open);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setQuickNavOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [acceptanceEditReport, setAcceptanceEditReport] = useState<AcceptanceReport | null>(null);
  const [acceptanceCreatePrefill, setAcceptanceCreatePrefill] = useState<AcceptanceReportCreatePrefill | null>(null);
  const [mixingReportMachinePrefill, setMixingReportMachinePrefill] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);
  const [machineNvlReportPrefill, setMachineNvlReportPrefill] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [machineNvlEditReport, setMachineNvlEditReport] = useState<MachineNvlSavedReport | null>(null);
  const [weighingPendingAdd, setWeighingPendingAdd] = useState<WeighingPendingAdd | null>(null);
  const navigateToTab = (tab: AppTab, options?: { replace?: boolean }) => {
    let nextTab = tab;
    let nextOptions = options;
    if (authUser) {
      const fullAccess =
        Boolean(authUser.fullAccess) || hasFullMenuAccess(authUser.role, authUser.username);
      if (!fullAccess && nextTab !== 'menu') {
        const allowed = buildAllowedTabSet(authUser.viewPermissions ?? []);
        const known = buildKnownPermissionTabSet();
        const accessTab = resolveAccessTab(nextTab);
        const allowedHere =
          allowed.has(accessTab) ||
          allowed.has(nextTab) ||
          hubHasAllowedChild(accessTab, allowed) ||
          hubHasAllowedChild(nextTab, allowed);
        const controlled = known.has(nextTab) || known.has(accessTab);
        if (controlled && !allowedHere) {
          nextTab = 'menu';
          nextOptions = { ...options, replace: true };
        }
      }
    }

    const path = pathFromTab(nextTab);

    if (window.location.pathname !== path) {
      if (nextOptions?.replace) {
        window.history.replaceState(
          { tab: nextTab, appNavigation: true, previousPath: null },
          '',
          path
        );
      } else {
        window.history.pushState(
          { tab: nextTab, appNavigation: true, previousPath: window.location.pathname },
          '',
          path
        );
      }
    }

    setActiveTab(nextTab);
    setLocationPath(path);

    if (nextTab === 'dashboard') {
      fetchReports();
    }
  };

  const goBack = (fallbackTab: AppTab) => {
    const currentState = window.history.state as { appNavigation?: boolean; previousPath?: string | null } | null;
    if (currentState?.appNavigation && currentState.previousPath) {
      window.history.back();
      return;
    }
    navigateToTab(fallbackTab);
  };

  // URL / tab đang mở phải nằm trong quyền xem (trừ admin).
  useEffect(() => {
    if (!authUser) return;
    const fullAccess =
      Boolean(authUser.fullAccess) || hasFullMenuAccess(authUser.role, authUser.username);
    if (fullAccess || activeTab === 'menu') return;
    const allowed = buildAllowedTabSet(authUser.viewPermissions ?? []);
    const known = buildKnownPermissionTabSet();
    const accessTab = resolveAccessTab(activeTab);
    const allowedHere =
      allowed.has(accessTab) ||
      allowed.has(activeTab) ||
      hubHasAllowedChild(accessTab, allowed) ||
      hubHasAllowedChild(activeTab, allowed);
    const controlled = known.has(activeTab) || known.has(accessTab);
    if (controlled && !allowedHere) {
      navigateToTab('menu', { replace: true });
    }
  }, [authUser, activeTab]);

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, tab: AppTab) => {
    event.preventDefault();
    navigateToTab(tab);
  };

  // 1. Fetch reports from Server DB
  const fetchReports = async () => {
    setIsFetchLoading(true);
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
        localStorage.setItem(STORAGE_REPORTS_CACHE_KEY, JSON.stringify(data));
      } else {
        const cached = readCachedReports();
        if (cached.length > 0) {
          setReports(cached);
        } else {
          addNotification('Không thể lấy báo cáo từ máy chủ.', 'warning');
        }
      }
    } catch (err) {
      const cached = readCachedReports();
      if (cached.length > 0) {
        setReports(cached);
        addNotification('Mất kết nối máy chủ. Đang hiển thị bản lưu thiết bị.', 'warning');
      } else {
        addNotification('Mất kết nối máy chủ dữ liệu. Kiểm tra sóng di động.', 'warning');
      }
    } finally {
      setIsFetchLoading(false);
    }
  };

  // Sync / loading on mount
  useEffect(() => {
    fetchReports();

    // Check navigator online status
    const handleOnline = () => {
      setIsOnline(true);
      addNotification('Thiết bị trực tuyến bản ghi. Sẵn sàng đồng bộ!', 'success');
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      addNotification('Đã ngắt mạng kết nối. Đang kích hoạt lưu cục bộ.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handlePopState = () => {
      const tab = tabFromPath(window.location.pathname);
      setLocationPath(window.location.pathname);
      setActiveTab(tab);
      if (tab === 'dashboard') {
        fetchReports();
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Load draft from localStorage on start
    const cachedDraft = localStorage.getItem(STORAGE_DRAFT_KEY);
    if (cachedDraft) {
      try {
        setReportForm(JSON.parse(cachedDraft));
      } catch (e) {
        console.error('Lỗi khi phục hồi bản nháp:', e);
      }
    }

    // Load offline queue
    const cachedQueue = localStorage.getItem(STORAGE_OFFLINE_KEY);
    if (cachedQueue) {
      try {
        setOfflineReports(JSON.parse(cachedQueue));
      } catch (e) {
        console.error('Lỗi phục hồi hàng chờ ngoại tuyến:', e);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sync draft to storage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(reportForm));
  }, [reportForm]);

  // Sync offline queue to storage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_OFFLINE_KEY, JSON.stringify(offlineReports));
  }, [offlineReports]);

  // Helper to add floating toast notifications
  const addNotification = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = `${Date.now()}`;
    setNotifications(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Submit a production report
  const handleSubmitReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Complete form validation
    const { machineId, shiftName, operatorName, assistantName } = reportForm.shiftInfo;
    const { productCode, rolls, actualWeight } = reportForm.productEntry;
    
    if (!machineId || !shiftName || !operatorName || !assistantName) {
      addNotification('Vui lòng điền đầy đủ Thông tin Ca Trực ở Bước 1!', 'error');
      setCurrentStep(1);
      return;
    }
    if (!productCode || !rolls || !actualWeight) {
      addNotification('Vui lòng điền thông tin Thành Phẩm ở Bước 1!', 'error');
      setCurrentStep(1);
      return;
    }

    setIsSubmitLoading(true);

    try {
      if (isOnline) {
        // Send directly to Express Server API
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reportForm)
        });

        if (res.ok) {
          const newRep = await res.json();
          addNotification('Lưu báo cáo lên database Phú Thọ thành công!', 'success');
          // Update local list
          setReports(prev => [newRep, ...prev]);
          // Reset form draft
          handleResetForm();
        } else {
          // Server returned error, queue offline instead
          throw new Error('Server returned error status');
        }
      } else {
        // Offline capability fallback
        const offlineRep: ProductionReport = {
          ...reportForm,
          id: `rep_offline_${Date.now()}`,
          createdAt: new Date().toISOString()
        };
        setOfflineReports(prev => [offlineRep, ...prev]);
        addNotification('Mất sóng kho! Báo cáo đã lưu tạm tại LocalStorage trên máy dọn.', 'warning');
        // Reset form draft
        handleResetForm();
      }
    } catch (err) {
      // API error fallback
      const offlineRep: ProductionReport = {
        ...reportForm,
        id: `rep_offline_${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      setOfflineReports(prev => [offlineRep, ...prev]);
      addNotification('Mất mạng kết nối. Đã lưu báo cáo dự phòng ngoại tuyến.', 'warning');
      handleResetForm();
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Synchronize queued offline reports once connection returns
  const syncOfflineQueue = async () => {
    const cachedQueue = localStorage.getItem(STORAGE_OFFLINE_KEY);
    if (!cachedQueue) return;
    
    try {
      const parsedQueue: ProductionReport[] = JSON.parse(cachedQueue);
      if (parsedQueue.length === 0) return;

      addNotification(`Đang tự động đồng bộ ${parsedQueue.length} báo cáo nộp tạm...`, 'success');

      for (const rep of parsedQueue) {
        // Stripe out id generated for offline identification so server assigns database order key
        const { id, ...cleanForm } = rep; 
        await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanForm)
        });
      }

      // Success, empty local table queue
      setOfflineReports([]);
      localStorage.setItem(STORAGE_OFFLINE_KEY, '[]');
      addNotification('Đồng bộ dữ liệu nộp tạm thành công!', 'success');
      // Reload main database
      fetchReports();
    } catch (e) {
      console.error('Không thể tự động đồng bộ báo cáo ngoại tuyến:', e);
    }
  };

  // Reset form helper
  const handleResetForm = () => {
    setReportForm(DEFAULT_REPORT);
    localStorage.removeItem(STORAGE_DRAFT_KEY);
    setCurrentStep(1);
    navigateToTab('menu', { replace: true });
  };

  // Reset Server Database (for demo and review testing)
  const handleResetDb = async () => {
    if (window.confirm('Vui lòng xác nhận khôi phục tất cả dữ liệu báo cáo về bản seeding mẫu?')) {
      try {
        const res = await fetch('/api/reports/reset', { method: 'POST' });
        if (res.ok) {
          const resJson = await res.json();
          setReports(resJson.data);
          addNotification('Khôi phục database mẫu Phú Thọ thành công!', 'success');
        }
      } catch (e) {
        addNotification('Lỗi khi khôi phục database.', 'error');
      }
    }
  };

  // Wizard update handlers
  const updateShiftInfo = (updated: Partial<ShiftInfo>) => {
    setReportForm(prev => ({
      ...prev,
      shiftInfo: { ...prev.shiftInfo, ...updated }
    }));
  };

  const updateProductEntry = (updated: Partial<ProductEntry>) => {
    setReportForm(prev => ({
      ...prev,
      productEntry: { ...prev.productEntry, ...updated }
    }));
  };

  const updateMaterials = (updated: Partial<MaterialBatches>) => {
    setReportForm(prev => ({
      ...prev,
      materials: { ...prev.materials, ...updated }
    }));
  };

  const updateWasteAndNotes = (updates: { wasteWeight?: number; notes?: string }) => {
    setReportForm(prev => ({
      ...prev,
      ...updates
    }));
  };

  // Derived metrics for real-time stepper footer preview
  const activeMetrics = computeReportMetrics(reportForm);

  if (!authUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Chỉ quản trị mới xem toàn bộ; còn lại đúng theo ma trận Phân quyền (và vị trí gán).
  // Kiểm tra cả vai trò và tài khoản để phiên admin cũ/khác cách ghi vai trò vẫn luôn có toàn quyền.
  const menuFullAccess = Boolean(authUser.fullAccess) || hasFullMenuAccess(authUser.role, authUser.username);
  const allowedMenuTabs = expandImpliedHubTabs(buildAllowedTabSet(authUser.viewPermissions ?? []));
  const editableMenuTabs = expandImpliedHubTabs(buildAllowedTabSet(authUser.editPermissions ?? []));
  const deletableMenuTabs = expandImpliedHubTabs(buildAllowedTabSet(authUser.deletePermissions ?? []));
  const knownPermissionTabs = buildKnownPermissionTabSet();
  const canSeeTab = (tab: AppTab) => {
    if (menuFullAccess || tab === 'menu') return true;
    const accessTab = resolveAccessTab(tab);
    if (
      allowedMenuTabs.has(accessTab) ||
      allowedMenuTabs.has(tab) ||
      hubHasAllowedChild(accessTab, allowedMenuTabs) ||
      hubHasAllowedChild(tab, allowedMenuTabs)
    ) {
      return true;
    }
    const controlled = knownPermissionTabs.has(tab) || knownPermissionTabs.has(accessTab);
    // Tab thuộc cây / alias phân quyền mà không được cấp → ẩn
    if (controlled) return false;
    // Tab ngoài ma trận: giữ hành vi cũ (không khóa)
    return true;
  };
  const canSeeMainMenuTab = (tab: AppTab) => canSeeTab(tab);
  const visibleMainMenuItems = menuFullAccess
    ? MAIN_MENU_ITEMS
    : MAIN_MENU_ITEMS.filter(item => canSeeMainMenuTab(item.tab));
  const filterMenuItems = <T extends { tab: AppTab }>(items: T[]): T[] =>
    menuFullAccess ? items : items.filter(item => canSeeTab(item.tab));

  return (
    <AccessControlProvider user={authUser}>
    <div
      className="flex h-[100dvh] overflow-hidden bg-slate-50 font-sans text-slate-800 selection:bg-brand-500 selection:text-white"
      id="main-root-container"
    >
      <aside className="hidden shrink-0 flex-col items-center gap-1 border-r border-slate-800/60 bg-gradient-to-b from-slate-900 to-slate-950 py-3 pt-safe sm:flex sm:w-16">
        {BACK_TAB_MAP[activeTab] && (
          <MobileBackNavButton
            onClick={() => goBack(BACK_TAB_MAP[activeTab] as AppTab)}
            variant="sidebar"
          />
        )}
        <HomeNavButton
          active={activeTab === 'menu'}
          onClick={event => handleNavClick(event, 'menu')}
          variant="sidebar"
        />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white shadow-[var(--shadow-card)]">

        {/* Brand Header — logo + trigger Drawer + offline pill */}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl px-3 md:px-5 h-14 md:h-16 pt-safe shrink-0 flex items-center gap-2" style={{ boxShadow: 'var(--shadow-soft)' }}>
          <button
            type="button"
            onClick={() => setQuickNavOpen(true)}
            aria-label="Mở điều hướng nhanh"
            title="Mở điều hướng nhanh (Ctrl + K)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95 shrink-0"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            {(() => {
              const pageMeta = getActivePageMeta(activeTab);
              return (
                <div className="min-w-0 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none truncate">{pageMeta.group}</span>
                  <span className="mt-0.5 block font-display text-[13px] md:text-[14px] font-semibold tracking-tight text-slate-900 truncate">{pageMeta.sub || 'Trang chủ'}</span>
                </div>
              );
            })()}
          </div>

          <button
            type="button"
            onClick={() => setQuickNavOpen(true)}
            aria-label="Tìm kiếm nhanh"
            title="Tìm kiếm nhanh (Ctrl + K)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95 shrink-0"
          >
            <Search className="h-[16px] w-[16px]" />
          </button>
          {offlineReports.length > 0 && (
            <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-100">
              Tạm {offlineReports.length}
            </span>
          )}
          <span className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[11px] font-bold shadow-sm">
            VN
          </span>
          <VietNhatLogo className="h-9 md:h-10 max-h-full shrink-0 ml-0.5" />
          <div className="ml-1 flex items-center gap-1.5 pl-1.5 md:border-l md:border-slate-200 md:pl-2.5">
            <span className="hidden max-w-[140px] flex-col leading-tight md:flex">
              <span className="truncate text-[12px] font-bold text-slate-900">{authUser.name}</span>
              <span className="truncate text-[10px] font-semibold text-slate-400">{authUser.role}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 active:scale-95 shrink-0"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {/* Floating notifications / Toasts layout */}
        <div className="fixed top-14 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm mx-auto">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-3 rounded-2xl border border-white/30 shadow-elevated text-[12.5px] font-semibold flex items-start gap-2 backdrop-blur-xl leading-relaxed ${
                  n.type === 'success'
                    ? 'bg-gradient-to-br from-emerald-50/85 to-white/80 border-emerald-200/60 text-emerald-700'
                    : n.type === 'error'
                    ? 'bg-gradient-to-br from-rose-50/85 to-white/80 border-rose-200/60 text-rose-700'
                    : 'bg-gradient-to-br from-amber-50/85 to-white/80 border-amber-200/60 text-amber-700'
                }`}
              >
                {n.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                {n.type === 'error' && <Sparkles className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                {n.type === 'warning' && <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                <p className="flex-1 leading-relaxed">{n.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AppToastHost />

        {/* Drawer 'Điều hướng nhanh' — mặc định ẩn */}
        <AnimatePresence>
          {quickNavOpen && (
            <motion.div
              key="quicknav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setQuickNavOpen(false)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {quickNavOpen && (
            <motion.aside
              key="quicknav-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Điều hướng nhanh"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-[70] w-[280px] max-w-[85vw] bg-white border-r border-slate-200 shadow-elevated flex flex-col"
            >
              <div className="h-12 md:h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-500">
                    <Menu className="h-4 w-4" />
                  </span>
                  <span className="font-display text-[14px] font-semibold tracking-tight text-slate-900">Điều hướng nhanh</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickNavOpen(false)}
                  aria-label="Đóng"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <SubNav
                  activeTab={activeTab}
                  allowedTabs={allowedMenuTabs}
                  fullAccess={menuFullAccess}
                  onNavigate={(tab) => {
                    navigateToTab(tab);
                    setQuickNavOpen(false);
                  }}
                />
              </div>
              <div className="px-3 py-2 border-t border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                <span>Phím tắt</span>
                <span className="font-mono">Ctrl + K</span>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content scrollable container viewport */}
        <main className={`flex-1 min-h-0 overflow-y-auto bg-slate-50 focus:outline-none ${
          activeTab === 'control-board'
            ? 'p-2 md:p-4'
            : activeTab === 'machine-nvl-report' || activeTab === 'orders'
              ? 'overflow-hidden p-0'
              : activeTab === 'warehouse-slip' || activeTab === 'warehouse-history'
                ? 'p-2 md:p-3 pb-4'
                : activeTab === 'acceptance-report' || activeTab === 'acceptance-report-list'
                  ? 'p-2 md:p-4 pb-4'
                : 'p-4 md:p-6 pb-4'
        }`} id="applet-viewport">
          <div
            className={
              activeTab === 'machine-nvl-report' || activeTab === 'orders'
                ? 'w-full'
                : 'mx-auto w-full min-w-0 max-w-none'
            }
          >
            <div className="min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === 'control-board' ? (
              <motion.div
                key="control-board"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ControlBoardPanel
                  onNavigate={navigateToTab}
                  onEditWeighing={pending => {
                    setWeighingPendingAdd(pending);
                    navigateToTab('weighing-summary');
                  }}
                  onMachineReport={(machine, type) => {
                    if (type === 'mixing') {
                      setMixingReportMachinePrefill({
                        id: machine.id,
                        code: machine.code,
                        name: machine.name
                      });
                      navigateToTab('mixing-report');
                      return;
                    }
                    setMachineNvlReportPrefill({
                      code: machine.code,
                      name: machine.name
                    });
                    navigateToTab('machine-nvl-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'menu' ? (
              <motion.div
                key="main-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <MainMenuFlow items={visibleMainMenuItems} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'quan-tri' ? (
              <motion.div
                key="quan-tri-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Quản trị" desc="Dashboard quản trị, người dùng/phân quyền, cấu hình hệ thống và danh mục dùng chung." />
                <FourStepMenuFlow items={filterMenuItems(ADMIN_MENU_ITEMS)} onNavigate={navigateToTab} showFlow={false} />
              </motion.div>
            ) : activeTab === 'production-reports' ? (
              <motion.div
                key="production-reports-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Báo cáo sản xuất" desc="Chọn loại báo cáo cần mở." />
                <MenuCardGrid items={filterMenuItems(PRODUCTION_REPORT_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'report-forms' ? (
              <motion.div
                key="report-forms-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Nhập báo cáo" desc="Chọn phiếu báo cáo cần lập hoặc mở." />
                <MenuCardGrid items={filterMenuItems(REPORT_FORM_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'report-lists' ? (
              <motion.div
                key="report-lists-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Xem báo cáo" desc="Chọn danh sách báo cáo cần mở." />
                <MenuCardGrid items={filterMenuItems(REPORT_LIST_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'acceptance-report-list' ? (
              <motion.div
                key="acceptance-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <AcceptanceReportListView
                  onBack={() => goBack('factory-qc')}
                  onCreate={prefill => {
                    setAcceptanceEditReport(null);
                    setAcceptanceCreatePrefill(prefill ?? null);
                    navigateToTab('acceptance-report');
                  }}
                  onEdit={report => {
                    setAcceptanceCreatePrefill(null);
                    setAcceptanceEditReport(report);
                    navigateToTab('acceptance-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'facility-management' ? (
              <motion.div
                key="facility-management-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <div className="flex items-start gap-3">
                  <BackButton onClick={() => goBack('factory-kho')} />
                  <div className="min-w-0 flex-1">
                    <MenuPageHeader title="Quản lý CSVC" desc="Cơ sở vật chất, kho hàng và thiết bị sản xuất." />
                  </div>
                </div>
                <MenuCardGrid items={filterMenuItems(FACILITY_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'hcns' ? (
              <motion.div
                key="hcns-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="HCNS" desc="Quản lý nhân sự, chi nhánh, bộ phận và ca làm việc." />
                <MenuCardGrid items={filterMenuItems(HCNS_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'business' ? (
              <motion.div
                key="business-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Kinh doanh" desc="Khách hàng phục vụ lập và tra cứu đơn." />
                <MenuCardGrid items={filterMenuItems(BUSINESS_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory' ? (
              <motion.div
                key="factory-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Nhà máy" desc="Chọn vai trò để mở các chức năng tương ứng." />
                <FourStepMenuFlow items={filterMenuItems(FACTORY_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory-quan-doc' ? (
              <motion.div
                key="factory-quan-doc-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Quản Đốc" desc="Lệnh sản xuất, kế hoạch và báo cáo tổng hợp." />
                <MenuCardGrid items={filterMenuItems(FACTORY_QUAN_DOC_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory-qc' ? (
              <motion.div
                key="factory-qc-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="QC — Quản lý chất lượng" desc="Theo dõi sản lượng, hàng hỏng và phiếu cân ca." />
                <MenuCardGrid items={filterMenuItems(FACTORY_QC_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory-cong-nhan' ? (
              <motion.div
                key="factory-cong-nhan-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Công nhân" desc="Nhập và xem báo cáo theo ca sản xuất." />
                <MenuCardGrid items={filterMenuItems(FACTORY_CONG_NHAN_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory-kho' ? (
              <motion.div
                key="factory-kho-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Kho" desc="Quản lý NVL và phiếu xuất nhập kho." />
                <MenuCardGrid items={filterMenuItems(FACTORY_KHO_MENU_ITEMS)} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'form' ? (
              <motion.div
                key="form-stepper"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {/* Visual Wizard Stepper Indicator — industrial compact */}
                <div className="px-3 py-2 bg-white border border-ink-200 rounded-md flex items-center justify-between" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase text-ink-400 block tracking-wider leading-none">Bước</span>
                    <span className="text-[15px] font-semibold text-ink-900 num leading-none">{currentStep}/3</span>
                  </div>

                  {/* Visual segment progress lines */}
                  <div className="flex-1 mx-3 flex gap-0.5 h-0.5 bg-ink-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 1 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 2 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 3 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                  </div>

                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 shrink-0">
                    {currentStep === 1 ? 'Ca & Mã hàng' : currentStep === 2 ? 'Phối trộn' : 'Phế phẩm & Lưu'}
                  </span>
                </div>

                {/* Stepper Card Frame */}
                <div className="form-card min-h-[260px]">
                  {currentStep === 1 && (
                    <div className="form-section stagger-field">
                      <ShiftInfoForm data={reportForm.shiftInfo} onChange={updateShiftInfo} />
                      <ProductEntryForm data={reportForm.productEntry} onChange={updateProductEntry} />
                    </div>
                  )}

                  {currentStep === 2 && (
                    <MaterialsForm data={reportForm.materials} onChange={updateMaterials} />
                  )}

                  {currentStep === 3 && (
                    <div className="form-section stagger-field">
                      <WasteForm
                        wasteWeight={reportForm.wasteWeight}
                        notes={reportForm.notes || ''}
                        onChange={updateWasteAndNotes}
                      />

                      {/* Final layout summary review before submission */}
                      <div className="rounded-md bg-ink-900 border border-ink-800 p-3 space-y-2.5 text-ink-100">
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-warning-500 animate-pulse" />
                          Tổng hợp kết quả
                        </h4>

                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px] font-semibold pb-1.5 border-b border-ink-800">
                          <div>Ca máy: <span className="text-ink-300 block">{reportForm.shiftInfo.machineId.split(' ')[0] || '--'}</span></div>
                          <div>Mã hàng: <span className="text-ink-300 block">{reportForm.productEntry.productCode || '--'}</span></div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] pb-1.5 border-b border-ink-800">
                          <div>Polymer phối: <strong className="text-brand-400 num block text-[13px]">{formatNumber(activeMetrics.totalPlastic)} kg</strong></div>
                          <div>Thành phẩm: <strong className="text-accent-300 num block text-[13px]">{formatNumber(activeMetrics.actualProductWeight)} kg</strong></div>
                        </div>

                        {/* Variance result */}
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span>Phế phẩm: <strong className="text-rose-400 num">{formatNumber(reportForm.wasteWeight)} kg</strong></span>
                          <span>Tỉ lệ hao hụt: <strong className={`num ${
                            activeMetrics.status === 'optimal' ? 'text-accent-300' : activeMetrics.status === 'warning' ? 'text-warning-400' : 'text-rose-400'
                          }`}>{formatNumber(activeMetrics.variancePercent)}%</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitting / Loader overlay */}
                {isSubmitLoading && (
                  <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="p-5 bg-white rounded-2xl shadow-xl flex items-center gap-3.5 text-slate-800 font-bold max-w-sm">
                      <Loader2 className="w-6 h-6 text-emerald-600 animate-spin shrink-0" />
                      <span>Đang mã hóa & đồng bộ dữ liệu Phú Thọ...</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : resolvedTab === 'weighing-summary-list' ? (
              <motion.div
                key="weighing-summary-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingShiftSummary onBackToMenu={() => goBack('report-lists')} />
              </motion.div>
            ) : resolvedTab === 'can-tu-dong' ? (
              <motion.div
                key="can-tu-dong"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <CanTuDongPanel onBack={() => goBack('report-lists')} />
              </motion.div>
            ) : resolvedTab === 'kiem-kho' ? (
              <motion.div
                key="kiem-kho"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <KiemKhoPanel onBack={() => goBack('factory-kho')} currentUser={authUser} />
              </motion.div>
            ) : resolvedTab === 'quan-ly-kho' ? (
              <motion.div
                key="quan-ly-kho"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <QuanLyKhoPanel onBack={() => goBack('factory-kho')} />
              </motion.div>
            ) : resolvedTab === 'weighing-summary' ? (
              <motion.div
                key="weighing-summary"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingReportForm
                  autoOpenNewSlip={!weighingPendingAdd}
                  pendingAdd={weighingPendingAdd}
                  onPendingAddHandled={() => setWeighingPendingAdd(null)}
                  onBack={() => goBack('report-forms')}
                  onOpenList={() => navigateToTab('weighing-summary-list')}
                />
              </motion.div>
            ) : resolvedTab === 'damaged-goods-report-list' ? (
              <motion.div
                key="damaged-goods-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingShiftSummary
                  config={DAMAGED_GOODS_SLIP_CONFIG}
                  onBackToMenu={() => goBack('report-lists')}
                />
              </motion.div>
            ) : resolvedTab === 'damaged-goods-report' ? (
              <motion.div
                key="damaged-goods-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingReportForm
                  config={DAMAGED_GOODS_SLIP_CONFIG}
                  autoOpenNewSlip
                  onBack={() => goBack('report-forms')}
                  onOpenList={() => navigateToTab('damaged-goods-report-list')}
                />
              </motion.div>
            ) : activeTab === 'mixing-report' ? (
              <motion.div
                key="mixing-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MixingReportForm
                  onBack={() => goBack('report-forms')}
                  onOpenList={() => navigateToTab('mixing-report-list')}
                  initialMachine={mixingReportMachinePrefill}
                  onInitialMachineConsumed={() => setMixingReportMachinePrefill(null)}
                />
              </motion.div>
            ) : activeTab === 'mixing-report-list' ? (
              <motion.div
                key="mixing-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MixingReportListView
                  onBack={() => goBack('report-lists')}
                />
              </motion.div>
            ) : activeTab === 'machine-nvl-report-list' ? (
              <motion.div
                key="machine-nvl-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineNvlReportListView
                  onBack={() => goBack('report-lists')}
                  onCreate={() => {
                    setMachineNvlEditReport(null);
                    navigateToTab('machine-nvl-report');
                  }}
                  onEdit={report => {
                    setMachineNvlEditReport(report);
                    navigateToTab('machine-nvl-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'machine-nvl-report' ? (
              <motion.div
                key="machine-nvl-report"
                className="h-full min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineNvlReportPanel
                  onBack={() => goBack('report-forms')}
                  onOpenList={() => navigateToTab('machine-nvl-report-list')}
                  initialMachine={machineNvlReportPrefill}
                  onInitialMachineConsumed={() => setMachineNvlReportPrefill(null)}
                  editReport={machineNvlEditReport}
                  onEditConsumed={() => setMachineNvlEditReport(null)}
                />
              </motion.div>
            ) : activeTab === 'acceptance-report' ? (
              <motion.div
                key="acceptance-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <AcceptanceReportForm
                  onBack={() => goBack('report-forms')}
                  onOpenList={() => navigateToTab('acceptance-report-list')}
                  editReport={acceptanceEditReport}
                  onEditConsumed={() => setAcceptanceEditReport(null)}
                  createPrefill={acceptanceCreatePrefill}
                  onCreatePrefillConsumed={() => setAcceptanceCreatePrefill(null)}
                />
              </motion.div>
            ) : activeTab === 'machine-downtime-report' ? (
              <motion.div
                key="machine-downtime-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineDowntimeReportPanel onBack={() => goBack('report-forms')} />
              </motion.div>
            ) : activeTab === 'machine-downtime-list' ? (
              <motion.div
                key="machine-downtime-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineDowntimeReportListView
                  onBack={() => goBack('report-lists')}
                  onCreate={() => navigateToTab('machine-downtime-report')}
                />
              </motion.div>
            ) : activeTab === 'machine-run-log' ? (
              <motion.div
                key="machine-run-log"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineRunLogPanel onBack={() => goBack('report-forms')} />
              </motion.div>
            ) : activeTab === 'machine-run-log-list' ? (
              <motion.div
                key="machine-run-log-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineRunLogPanel onBack={() => goBack('report-lists')} />
              </motion.div>
            ) : activeTab === 'hr' ? (
              <motion.div
                key="human-resources"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <HumanResourcesPanel onBack={() => goBack('hcns')} />
              </motion.div>
            ) : activeTab === 'vehicles' ? (
              <motion.div
                key="vehicles"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <VehiclesPanel onBack={() => goBack('menu')} currentUser={authUser} />
              </motion.div>
            ) : activeTab === 'products' ? (
              <motion.div
                key="products"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductsPanel onBack={() => goBack('factory-kho')} />
              </motion.div>
            ) : activeTab === 'machines' ? (
              <motion.div
                key="machines"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachinesPanel onBack={() => goBack('menu')} />
              </motion.div>
            ) : activeTab === 'materials' ? (
              <motion.div
                key="materials"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MaterialsInventoryPanel onBack={() => goBack('factory-kho')} />
              </motion.div>
            ) : activeTab === 'warehouse-slip' ? (
              <motion.div
                key="warehouse-slip"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WarehouseSlipPanel
                  onBack={() => goBack('factory-kho')}
                  onOpenHistory={() => navigateToTab('warehouse-history')}
                />
              </motion.div>
            ) : activeTab === 'warehouse-history' ? (
              <motion.div
                key="warehouse-history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WarehouseHistoryPanel
                  onBack={() => goBack('factory-kho')}
                  onOpenSlip={() => navigateToTab('warehouse-slip')}
                />
              </motion.div>
            ) : activeTab === 'orders' ? (
              <motion.div
                key="orders"
                className="flex h-full min-h-0 flex-col"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <OrdersPanel onBack={() => goBack('menu')} />
              </motion.div>
            ) : activeTab === 'customers' ? (
              <motion.div
                key="customers"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <CustomersPanel onBack={() => goBack('business')} />
              </motion.div>
            ) : activeTab === 'shipping-orders' ? (
              <motion.div
                key="shipping-orders"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ShippingOrdersPanel onBack={() => goBack('business')} currentUser={authUser} />
              </motion.div>
            ) : activeTab === 'production-orders' ? (
              <motion.div
                key="production-orders"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductionOrdersPanel
                  onBack={() => goBack('factory')}
                  currentUser={authUser}
                  canEdit={menuFullAccess || editableMenuTabs.has('production-orders')}
                  canDelete={menuFullAccess || deletableMenuTabs.has('production-orders')}
                />
              </motion.div>
            ) : activeTab === 'production-plan-history' ? (
              <motion.div
                key="production-plan-history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductionPlanHistoryPanel onBack={() => goBack('production-reports')} />
              </motion.div>
            ) : activeTab === 'settings' ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <SettingsPanel onBack={() => goBack('quan-tri')} />
              </motion.div>
            ) : (
              <motion.div
                key="dashboard-charts"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <AnalyticsDashboard 
                  reports={reports} 
                  onResetDb={handleResetDb} 
                  isLoading={isFetchLoading} 
                />
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          </div>
        </main>

        {/* Dynamic STICKY Wizard Footer Bar for Form Inputs - locked at bottom, min height 44px layout */}
        {activeTab === 'form' && (
          <footer className="z-30 shrink-0 border-t border-slate-200/80 bg-white/85 backdrop-blur-xl px-4 py-3 shadow-elevated flex items-center justify-end" id="sticky-wizard-footer">
            <div className="flex gap-3 justify-end">
              <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Khôi phục bản ghi nháp hiện tại?')) {
                      setReportForm(DEFAULT_REPORT);
                      localStorage.removeItem(STORAGE_DRAFT_KEY);
                      addNotification('Đã xóa trắng nháp báo cáo!', 'success');
                    }
                  }}
                  className="h-12 px-4 rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 transition font-bold text-xs text-slate-500 shrink-0 active:scale-95"
                  style={{ minHeight: '44px' }}
                >
                  Reset Nháp
                </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  id="wizard-next-btn"
                  onClick={() => {
                    // Quick validation for Step 1
                    if (currentStep === 1) {
                      const { machineId, shiftName, operatorName, assistantName } = reportForm.shiftInfo;
                      const { productCode, rolls, actualWeight } = reportForm.productEntry;
                      if (!machineId || !shiftName || !operatorName || !assistantName) {
                        addNotification('Thiếu! Hãy nhập đầy đủ thông tin Ca máy và thợ máy.', 'warning');
                        return;
                      }
                      if (!productCode || !rolls || !actualWeight) {
                        addNotification('Thiếu! Hãy chọn Mã SP, Số lượng cuộn đạt và Cân nặng.', 'warning');
                        return;
                      }
                    }
                    setCurrentStep(prev => prev + 1);
                  }}
                  className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow"
                  style={{ minHeight: '44px' }}
                >
                  <span>Tiếp tục</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  id="save-report-submit-btn"
                  onClick={() => handleSubmitReport()}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-brand-500/25"
                  style={{ minHeight: '44px' }}
                >
                  <Save className="w-4.5 h-4.5" />
                  <span>Nộp & Lưu báo cáo</span>
                </button>
              )}
            </div>
          </footer>
        )}

        <nav className="z-40 shrink-0 px-2 pb-2 pb-safe sm:hidden">
          <div className="mx-auto flex max-w-sm items-stretch rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-elevated px-1.5 py-1">
            {BACK_TAB_MAP[activeTab] && (
          <MobileBackNavButton
                onClick={() => goBack(BACK_TAB_MAP[activeTab] as AppTab)}
                variant="bottom"
              />
            )}
            <HomeNavButton
              active={activeTab === 'menu'}
              onClick={event => handleNavClick(event, 'menu')}
              variant="bottom"
            />
          </div>
        </nav>

        <nav
          className="hidden"
          id="tab-navigation"
        >
          <a
            href={pathFromTab('menu')}
            id="tab-btn-menu"
            onClick={event => handleNavClick(event, 'menu')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'menu'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Menu className="h-4 w-4" />
            Menu
          </a>

          <a
            href={pathFromTab('form')}
            id="tab-btn-form"
            onClick={event => handleNavClick(event, 'form')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'form'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <FilePlus2 className="h-4 w-4" />
            Nhập Báo Cáo
          </a>

          <a
            href={pathFromTab('weighing-summary')}
            id="tab-btn-weighing-summary"
            onClick={event => handleNavClick(event, 'weighing-summary')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'weighing-summary'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Layers className="h-4 w-4" />
            Phiếu Cân Ca
          </a>

          <a
            href={pathFromTab('dashboard')}
            id="tab-btn-dashboard"
            onClick={event => handleNavClick(event, 'dashboard')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'dashboard'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <BarChart3 className="h-4 w-4" />
            Phân Tích
          </a>

          <a
            href={pathFromTab('products')}
            id="tab-btn-products"
            onClick={event => handleNavClick(event, 'products')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'products'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Package className="h-4 w-4" />
            Sản Phẩm
          </a>

          <a
            href={pathFromTab('machines')}
            id="tab-btn-machines"
            onClick={event => handleNavClick(event, 'machines')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'machines'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Cpu className="h-4 w-4" />
            Máy
          </a>

          <a
            href={pathFromTab('materials')}
            id="tab-btn-materials"
            onClick={event => handleNavClick(event, 'materials')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'materials'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Boxes className="h-4 w-4" />
            Kho NVL
          </a>

          <a
            href={pathFromTab('orders')}
            id="tab-btn-orders"
            onClick={event => handleNavClick(event, 'orders')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'orders'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <ClipboardList className="h-4 w-4" />
            Đơn Hàng
          </a>
        </nav>
      </div>
      </div>
    </div>
    </AccessControlProvider>
  );
}

