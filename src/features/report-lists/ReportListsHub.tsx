import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeftRight, ChevronLeft, Loader2 } from 'lucide-react';
import type { AuthUser } from '../../components/LoginPage';
import type { AcceptanceReport, AcceptanceReportCreatePrefill } from '../../components/AcceptanceReportForm';
import { DAMAGED_GOODS_SLIP_CONFIG } from '../../lib/weighingSlipConfig';
import { REPORT_LIST_MENU_ITEMS, type MenuCardConfig } from '../../app/menus';
import type { MachineNvlSavedReport } from '../../utils/machineNvlReports';
import type { AppTab } from '../../routes';
import type { MaterialRequestRow } from '../yeu-cau-xuat-vat-tu/MaterialRequestListView';
import {
  createDefaultReportListsHubFilters,
  ReportListsSharedFiltersBar,
  type ReportListsHubFilters
} from './ReportListsSharedFilters';
import ReportListsPrintActions from './ReportListsPrintActions';

const ProductionOrdersPanel = lazy(() => import('../lenh-sx').then(m => ({ default: m.ProductionOrdersPanel })));
const MachineNvlReportListView = lazy(() => import('../../components/MachineNvlReportListView'));
const MaterialRequestListView = lazy(() =>
  import('../yeu-cau-xuat-vat-tu/MaterialRequestListView').then(m => ({ default: m.MaterialRequestListView }))
);
const MixingReportListView = lazy(() => import('../../components/MixingReportListView'));
const CanTuDongPanel = lazy(() => import('../can-tu-dong').then(m => ({ default: m.CanTuDongPanel })));
const WeighingShiftSummary = lazy(() => import('../../components/WeighingShiftSummary'));
const AcceptanceReportListView = lazy(() => import('../../components/AcceptanceReportListView'));
const WarehouseHistoryPanel = lazy(() =>
  import('../phieu-xuat-nhap-kho').then(m => ({ default: m.WarehouseHistoryPanel }))
);
const MachineDowntimeReportListView = lazy(() => import('../../components/MachineDowntimeReportListView'));
const MachineRunLogPanel = lazy(() => import('../../components/MachineRunLogPanel'));
const ShiftHandoverListView = lazy(() => import('../../components/ShiftHandoverListView'));
const ControlBoardPanel = lazy(() => import('../control-board').then(m => ({ default: m.ControlBoardPanel })));
const MaterialConversionPanel = lazy(() => import('../quy-doi-vat-lieu'));

export type ReportListsHubTabId =
  | (typeof REPORT_LIST_MENU_ITEMS)[number]['tab']
  | 'dashboard-auto'
  | 'material-conversion';
type HubMenuItem = Omit<MenuCardConfig, 'tab'> & { tab: ReportListsHubTabId };

function shortTabLabel(item: HubMenuItem) {
  return item.title
    .replace(/^Danh sách\s+/i, '')
    .replace(/^Phiếu\s+/i, '')
    .replace(/^Báo cáo\s+/i, '');
}

function HubPanelFallback() {
  return (
    <div className="flex min-h-[36vh] items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      Đang mở danh sách...
    </div>
  );
}

/** Giữ panel đã mở mounted (ẩn CSS) để đổi tab không mất dữ liệu đã tải. */
function KeepAliveSlot({
  tabId,
  activeTab,
  mountedTabs,
  children
}: {
  tabId: ReportListsHubTabId;
  activeTab: ReportListsHubTabId;
  mountedTabs: ReadonlySet<ReportListsHubTabId>;
  children: React.ReactNode;
}) {
  if (!mountedTabs.has(tabId)) return null;
  const isActive = activeTab === tabId;
  return (
    <div role="tabpanel" hidden={!isActive} aria-hidden={!isActive} className={isActive ? undefined : 'hidden'}>
      <Suspense fallback={<HubPanelFallback />}>{children}</Suspense>
    </div>
  );
}

type Props = {
  menuItems: MenuCardConfig[];
  onBack: () => void;
  currentUser: AuthUser | null;
  onNavigate: (tab: AppTab) => void;
  onEditMachineNvlReport?: (report: MachineNvlSavedReport) => void;
  onEditMaterialRequest?: (row: MaterialRequestRow) => void;
  onEditAcceptanceReport?: (report: AcceptanceReport) => void;
  onEditAcceptanceReportGroup?: (reports: AcceptanceReport[]) => void;
  onCreateAcceptanceReport?: (prefill?: AcceptanceReportCreatePrefill | null) => void;
  initialHubTab?: ReportListsHubTabId;
};

export function ReportListsHub({
  menuItems,
  onBack,
  currentUser,
  onNavigate,
  onEditMachineNvlReport,
  onEditMaterialRequest,
  onEditAcceptanceReport,
  onEditAcceptanceReportGroup,
  onCreateAcceptanceReport,
  initialHubTab
}: Props) {
  const hubItems = useMemo<HubMenuItem[]>(() => {
    const base: HubMenuItem[] = [
      ...(menuItems.length > 0 ? menuItems : REPORT_LIST_MENU_ITEMS),
      {
        title: 'Cắt Lõi',
        desc: 'Cắt lõi / quy đổi theo Ngày · Ca · Máy, vật tư gốc và vật tư đích.',
        icon: ArrowLeftRight,
        tab: 'material-conversion'
      }
    ];
    if (base.some(item => item.tab === 'dashboard-auto')) return base;
    return [
      ...base,
      {
        title: 'Báo cáo theo LSX',
        desc: 'Báo cáo tổng hợp máy BB, tính toán và in báo cáo theo từng lệnh sản xuất.',
        icon: Activity,
        tab: 'dashboard-auto'
      } as MenuCardConfig
    ];
  }, [menuItems]);

  const [activeHubTab, setActiveHubTab] = useState<ReportListsHubTabId>(() => {
    if (initialHubTab && hubItems.some(item => item.tab === initialHubTab)) {
      return initialHubTab;
    }
    return (hubItems[0]?.tab ?? 'machine-nvl-report-list') as ReportListsHubTabId;
  });

  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<ReportListsHubTabId>>(
    () => new Set<ReportListsHubTabId>([activeHubTab])
  );

  const [draftFilters, setDraftFilters] = useState<ReportListsHubFilters>(() =>
    createDefaultReportListsHubFilters()
  );
  const [appliedFilters, setAppliedFilters] = useState<ReportListsHubFilters>(() =>
    createDefaultReportListsHubFilters()
  );

  // Ngày · ca · máy áp dụng ngay; tìm kiếm debounce để tránh remount liên tục.
  useEffect(() => {
    const nextCore = {
      shift: draftFilters.shift,
      machineCode: draftFilters.machineCode,
      dateFrom: draftFilters.dateFrom,
      dateTo: draftFilters.dateTo
    };
    setAppliedFilters(prev => {
      if (
        prev.shift === nextCore.shift &&
        prev.machineCode === nextCore.machineCode &&
        prev.dateFrom === nextCore.dateFrom &&
        prev.dateTo === nextCore.dateTo
      ) {
        return prev;
      }
      return { ...prev, ...nextCore };
    });
  }, [draftFilters.shift, draftFilters.machineCode, draftFilters.dateFrom, draftFilters.dateTo]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setAppliedFilters(prev =>
        prev.search === draftFilters.search ? prev : { ...prev, search: draftFilters.search }
      );
    }, 350);
    return () => window.clearTimeout(handle);
  }, [draftFilters.search]);

  useEffect(() => {
    setMountedTabs(prev => {
      if (prev.has(activeHubTab)) return prev;
      const next = new Set(prev);
      next.add(activeHubTab);
      return next;
    });
  }, [activeHubTab]);

  useEffect(() => {
    if (hubItems.length === 0) return;
    if (!hubItems.some(item => item.tab === activeHubTab)) {
      setActiveHubTab(hubItems[0].tab as ReportListsHubTabId);
    }
  }, [hubItems, activeHubTab]);

  useEffect(() => {
    if (!initialHubTab) return;
    if (hubItems.some(item => item.tab === initialHubTab)) {
      setActiveHubTab(initialHubTab);
    }
  }, [initialHubTab, hubItems]);

  const sharedInitialFilters = useMemo(
    () => ({
      search: appliedFilters.search,
      dateFrom: appliedFilters.dateFrom || undefined,
      dateTo: appliedFilters.dateTo || undefined,
      shift: appliedFilters.shift || undefined,
      machineCode: appliedFilters.machineCode || undefined
    }),
    [appliedFilters]
  );

  const filtersKey = [
    appliedFilters.dateFrom,
    appliedFilters.dateTo,
    appliedFilters.shift,
    appliedFilters.machineCode,
    appliedFilters.search.trim().toLowerCase()
  ].join('|');

  // Khi đổi bộ lọc chung, chỉ giữ tab đang xem (và tab cân đã mở) để các tab ẩn không đồng loạt remount gây nghẽn mạng.
  useEffect(() => {
    setMountedTabs(prev => {
      const next = new Set<ReportListsHubTabId>([activeHubTab]);
      if (prev.has('can-tu-dong')) next.add('can-tu-dong');
      if (prev.has('material-conversion')) next.add('material-conversion');
      if (next.size === prev.size && [...next].every(item => prev.has(item))) return prev;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ thu gọn tab ẩn khi filtersKey đổi
  }, [filtersKey]);

  // Tải trước dữ liệu Cân tự động theo khoảng ngày đang lọc để bấm sang tab 5 Cân hiển thị tức thì.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import('../can-tu-dong')
        .then(m =>
          m.prefetchCanTuDongData({
            from: appliedFilters.dateFrom || undefined,
            to: appliedFilters.dateTo || undefined
          })
        )
        .catch(() => {});
    }, 120);
    return () => window.clearTimeout(timer);
  }, [appliedFilters.dateFrom, appliedFilters.dateTo]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
            Xem báo cáo
          </h2>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Bộ lọc chung áp dụng mọi tab · đổi tab giữ dữ liệu đã tải.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReportListsPrintActions
            filters={draftFilters}
            onNavigate={onNavigate}
            onOpenAutoReportTab={() => {
              setActiveHubTab('dashboard-auto');
              setMountedTabs(prev => new Set([...prev, 'dashboard-auto']));
            }}
          />
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại
          </button>
        </div>
      </div>

      <ReportListsSharedFiltersBar value={draftFilters} onChange={setDraftFilters} />

      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="Danh sách báo cáo"
          className="flex items-end gap-1 overflow-x-auto px-1 scrollbar-thin"
        >
          {hubItems.map((item, index) => {
            const active = item.tab === activeHubTab;
            const order = index + 1;
            const label = shortTabLabel(item);
            return (
              <button
                key={item.tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveHubTab(item.tab as ReportListsHubTabId)}
                title={`${order}. ${item.desc}`}
                className={`relative shrink-0 rounded-t-lg px-2.5 pt-2 text-left transition sm:px-3 ${
                  active
                    ? 'z-10 -mb-px border border-b-white border-slate-200 bg-white pb-2.5 text-slate-900'
                    : 'z-0 mb-px border border-transparent bg-slate-100/90 pb-2 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800'
                }`}
              >
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-black tabular-nums leading-none ${
                      active ? 'bg-[#ef1b2d] text-white' : 'bg-slate-200/90 text-slate-600'
                    }`}
                  >
                    {order}
                  </span>
                  <span className="text-[12px] font-bold leading-tight">{label}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative z-0 min-h-0 rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-1.5 shadow-card sm:p-2">
          <KeepAliveSlot tabId="production-orders" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <ProductionOrdersPanel
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              currentUser={currentUser}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="machine-nvl-report-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineNvlReportListView
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              onCreate={() => onNavigate('machine-nvl-report')}
              onEdit={report => {
                if (onEditMachineNvlReport) onEditMachineNvlReport(report);
                else onNavigate('machine-nvl-report');
              }}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="material-request-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MaterialRequestListView
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              onCreate={() => onNavigate('material-request')}
              onEdit={row => {
                if (onEditMaterialRequest) onEditMaterialRequest(row);
                else onNavigate('material-request');
              }}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="mixing-report-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MixingReportListView
              key={filtersKey}
              hideLocalFilters
              initialTab="reports"
              initialFilters={sharedInitialFilters}
              onBack={onBack}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="can-tu-dong" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <CanTuDongPanel
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              currentUser={currentUser}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="damaged-goods-report-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <WeighingShiftSummary
              key={filtersKey}
              hideLocalFilters
              config={DAMAGED_GOODS_SLIP_CONFIG}
              initialFilters={sharedInitialFilters}
              onBackToMenu={onBack}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="acceptance-report-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <AcceptanceReportListView
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              onCreate={prefill => {
                if (onCreateAcceptanceReport) onCreateAcceptanceReport(prefill ?? null);
                else onNavigate('acceptance-report');
              }}
              onEdit={report => {
                if (onEditAcceptanceReport) onEditAcceptanceReport(report);
                else onNavigate('acceptance-report');
              }}
              onEditGroup={
                onEditAcceptanceReportGroup
                  ? reports => onEditAcceptanceReportGroup(reports)
                  : undefined
              }
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="warehouse-history" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <WarehouseHistoryPanel
              key={filtersKey}
              initialFilters={sharedInitialFilters}
              initialWarehouseTab="san_pham"
              initialSlipType="nhap"
              onBack={onBack}
              onOpenSlip={() => onNavigate('warehouse-slip')}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="machine-downtime-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineDowntimeReportListView
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              onCreate={() => onNavigate('machine-downtime-report')}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="machine-run-log-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineRunLogPanel onBack={onBack} showSavedList filters={sharedInitialFilters} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="shift-handover-list" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <ShiftHandoverListView
              key={filtersKey}
              hideLocalFilters
              initialFilters={sharedInitialFilters}
              onBack={onBack}
              onCreate={() => onNavigate('shift-handover-report')}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="material-conversion" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MaterialConversionPanel
              key={filtersKey}
              search={appliedFilters.search}
              initialFilters={sharedInitialFilters}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="dashboard-auto" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <ControlBoardPanel
              key={filtersKey}
              mode="report-only-auto"
              hideCommonFilters
              initialFilters={sharedInitialFilters}
              onNavigate={onNavigate}
              onMachineReport={() => {}}
            />
          </KeepAliveSlot>
        </div>
      </div>
    </div>
  );
}

export default ReportListsHub;
