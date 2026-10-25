import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { AuthUser } from '../../components/LoginPage';
import type { AcceptanceReport, AcceptanceReportCreatePrefill } from '../../components/AcceptanceReportForm';
import { REPORT_FORM_MENU_ITEMS, type MenuCardConfig } from '../../app/menus';
import type { MachineNvlSavedReport } from '../../utils/machineNvlReports';
import type { AppTab } from '../../routes';
import { ReportFormsSharedProvider } from './ReportFormsSharedContext';
import { ReportFormsSharedHeader } from './ReportFormsSharedHeader';

const MachineNvlReportPanel = lazy(() =>
  import('../bao-cao-may-nvl-ton').then(m => ({ default: m.MachineNvlReportPanel }))
);
const YeuCauXuatVatTuPanel = lazy(() =>
  import('../yeu-cau-xuat-vat-tu').then(m => ({ default: m.YeuCauXuatVatTuPanel }))
);
const TraKhoNvlPanel = lazy(() =>
  import('../tra-kho-nvl').then(m => ({ default: m.TraKhoNvlPanel }))
);
const MixingReportListView = lazy(() => import('../../components/MixingReportListView'));
const CanTuDongPanel = lazy(() => import('../can-tu-dong').then(m => ({ default: m.CanTuDongPanel })));
const CanTuDongEntryForm = lazy(() =>
  import('../can-tu-dong/entry-form').then(m => ({ default: m.CanTuDongEntryForm }))
);
const CanKiemKhoPilotPanel = lazy(() =>
  import('../can-tu-dong/pilot').then(m => ({ default: m.CanKiemKhoPilotPanel }))
);
const MachineDowntimeReportPanel = lazy(() => import('../../components/MachineDowntimeReportPanel'));
const MachineRunLogPanel = lazy(() => import('../../components/MachineRunLogPanel'));
const AcceptanceReportForm = lazy(() => import('../../components/AcceptanceReportForm'));
const AcceptanceReportListView = lazy(() => import('../../components/AcceptanceReportListView'));
const ShiftHandoverPanel = lazy(() => import('../../components/ShiftHandoverPanel'));
const DoiSoatPanel = lazy(() => import('../doi-soat').then(m => ({ default: m.DoiSoatPanel })));

export type ReportFormsHubTabId =
  | 'machine-nvl-report'
  | 'material-request'
  | 'tra-kho-nvl'
  | 'mixing-report'
  | 'can-tu-dong'
  | 'can-tu-dong-entry'
  | 'can-kiem-kho'
  | 'machine-downtime-report'
  | 'machine-run-log'
  | 'acceptance-report'
  | 'shift-handover-report'
  | 'doi-soat';

type ReportFormHubItem = MenuCardConfig & { hubId: ReportFormsHubTabId };

function toHubId(item: MenuCardConfig): ReportFormsHubTabId {
  if (item.entryForm === 'can-tu-dong') return 'can-tu-dong-entry';
  return item.tab as ReportFormsHubTabId;
}

function buildHubItems(items: MenuCardConfig[]): ReportFormHubItem[] {
  return items.map(item => ({ ...item, hubId: toHubId(item) }));
}

function HubPanelFallback() {
  return (
    <div className="flex min-h-[36vh] items-center justify-center gap-2 px-4 py-10 text-sm font-semibold text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      Đang mở phiếu...
    </div>
  );
}

/** Giữ panel đã mở mounted (ẩn CSS) để đổi tab không mất draft chưa lưu. */
function KeepAliveSlot({
  tabId,
  activeTab,
  mountedTabs,
  children
}: {
  tabId: ReportFormsHubTabId;
  activeTab: ReportFormsHubTabId;
  mountedTabs: ReadonlySet<ReportFormsHubTabId>;
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
  onOpenList: (tab: AppTab) => void;
  mixingReportMachinePrefill: { id: string; code: string; name: string } | null;
  onMixingPrefillConsumed: () => void;
  machineNvlReportPrefill: { code: string; name: string } | null;
  onMachineNvlPrefillConsumed: () => void;
  machineNvlEditReport: MachineNvlSavedReport | null;
  onMachineNvlEditConsumed: () => void;
  acceptanceEditReport: AcceptanceReport | null;
  onAcceptanceEditConsumed: () => void;
  acceptanceEditReportGroup: AcceptanceReport[] | null;
  onAcceptanceEditGroupConsumed: () => void;
  acceptanceCreatePrefill: AcceptanceReportCreatePrefill | null;
  onAcceptanceCreatePrefillConsumed: () => void;
  acceptanceShowForm: boolean;
  setAcceptanceShowForm: (show: boolean) => void;
  setAcceptanceEditReport: (report: AcceptanceReport | null) => void;
  setAcceptanceEditReportGroup: (reports: AcceptanceReport[] | null) => void;
  setAcceptanceCreatePrefill: (prefill: AcceptanceReportCreatePrefill | null) => void;
  initialHubTab?: ReportFormsHubTabId;
};

export function ReportFormsHub({
  menuItems,
  onBack,
  currentUser,
  onOpenList,
  mixingReportMachinePrefill,
  onMixingPrefillConsumed,
  machineNvlReportPrefill,
  onMachineNvlPrefillConsumed,
  machineNvlEditReport,
  onMachineNvlEditConsumed,
  acceptanceEditReport,
  onAcceptanceEditConsumed,
  acceptanceEditReportGroup,
  onAcceptanceEditGroupConsumed,
  acceptanceCreatePrefill,
  onAcceptanceCreatePrefillConsumed,
  acceptanceShowForm,
  setAcceptanceShowForm,
  setAcceptanceEditReport,
  setAcceptanceEditReportGroup,
  setAcceptanceCreatePrefill,
  initialHubTab
}: Props) {
  const hubItems = useMemo(
    () => buildHubItems(menuItems.length > 0 ? menuItems : REPORT_FORM_MENU_ITEMS),
    [menuItems]
  );

  const [activeHubTab, setActiveHubTab] = useState<ReportFormsHubTabId>(() => {
    if (initialHubTab && hubItems.some(item => item.hubId === initialHubTab)) return initialHubTab;
    return hubItems[0]?.hubId ?? 'machine-nvl-report';
  });

  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<ReportFormsHubTabId>>(
    () => new Set<ReportFormsHubTabId>([activeHubTab])
  );

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
    if (!hubItems.some(item => item.hubId === activeHubTab)) {
      setActiveHubTab(hubItems[0].hubId);
    }
  }, [hubItems, activeHubTab]);

  useEffect(() => {
    if (!initialHubTab) return;
    if (hubItems.some(item => item.hubId === initialHubTab)) {
      setActiveHubTab(initialHubTab);
    }
  }, [initialHubTab, hubItems]);

  const resetAcceptanceForm = () => {
    setAcceptanceShowForm(false);
    setAcceptanceEditReport(null);
    setAcceptanceEditReportGroup(null);
    setAcceptanceCreatePrefill(null);
  };

  const hideSharedHeader =
    activeHubTab === 'can-tu-dong' || activeHubTab === 'can-tu-dong-entry';

  return (
    <ReportFormsSharedProvider>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight text-slate-900 sm:text-base">Nhập báo cáo</h2>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Header chung áp dụng mọi tab · đổi tab giữ draft chưa lưu.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 transition hover:bg-zinc-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Quay lại
        </button>
      </div>

      {!hideSharedHeader ? <ReportFormsSharedHeader /> : null}

      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="Phiếu nhập báo cáo"
          className="flex items-end gap-1 overflow-x-auto px-1 scrollbar-thin"
        >
          {hubItems.map((item, index) => {
            const active = item.hubId === activeHubTab;
            const order = index + 1;
            return (
              <button
                key={item.hubId}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveHubTab(item.hubId)}
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
                  <span className="text-[12px] font-bold leading-tight">{item.title}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative z-0 min-h-0 rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-1.5 shadow-card sm:p-2">
          <KeepAliveSlot tabId="machine-nvl-report" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineNvlReportPanel
              onBack={onBack}
              onOpenList={() => onOpenList('machine-nvl-report-list')}
              initialMachine={machineNvlReportPrefill}
              onInitialMachineConsumed={onMachineNvlPrefillConsumed}
              editReport={machineNvlEditReport}
              onEditConsumed={onMachineNvlEditConsumed}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="material-request" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <YeuCauXuatVatTuPanel currentUser={currentUser} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="tra-kho-nvl" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <TraKhoNvlPanel onBack={onBack} currentUser={currentUser} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="mixing-report" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MixingReportListView
              initialTab="form"
              onBack={onBack}
              initialMachine={mixingReportMachinePrefill}
              onInitialMachineConsumed={onMixingPrefillConsumed}
            />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="can-tu-dong" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <CanTuDongPanel onBack={onBack} currentUser={currentUser} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="can-tu-dong-entry" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <CanTuDongEntryForm onClose={onBack} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="can-kiem-kho" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <CanKiemKhoPilotPanel />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="machine-downtime-report" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineDowntimeReportPanel onBack={onBack} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="machine-run-log" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <MachineRunLogPanel onBack={onBack} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="acceptance-report" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            {acceptanceShowForm ||
            acceptanceEditReport ||
            acceptanceEditReportGroup ||
            acceptanceCreatePrefill ? (
              <AcceptanceReportForm
                onBack={resetAcceptanceForm}
                onOpenList={resetAcceptanceForm}
                editReport={acceptanceEditReport}
                onEditConsumed={onAcceptanceEditConsumed}
                editReportGroup={acceptanceEditReportGroup}
                onEditGroupConsumed={onAcceptanceEditGroupConsumed}
                createPrefill={acceptanceCreatePrefill}
                onCreatePrefillConsumed={onAcceptanceCreatePrefillConsumed}
              />
            ) : (
              <AcceptanceReportListView
                onBack={onBack}
                onCreate={prefill => {
                  setAcceptanceEditReport(null);
                  setAcceptanceEditReportGroup(null);
                  setAcceptanceCreatePrefill(prefill ?? null);
                  setAcceptanceShowForm(true);
                }}
                onEdit={report => {
                  setAcceptanceCreatePrefill(null);
                  setAcceptanceEditReportGroup(null);
                  setAcceptanceEditReport(report);
                  setAcceptanceShowForm(true);
                }}
                onEditGroup={reports => {
                  setAcceptanceCreatePrefill(null);
                  setAcceptanceEditReport(null);
                  setAcceptanceEditReportGroup(reports);
                  setAcceptanceShowForm(true);
                }}
              />
            )}
          </KeepAliveSlot>

          <KeepAliveSlot tabId="shift-handover-report" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <ShiftHandoverPanel onBack={onBack} />
          </KeepAliveSlot>

          <KeepAliveSlot tabId="doi-soat" activeTab={activeHubTab} mountedTabs={mountedTabs}>
            <DoiSoatPanel onBack={onBack} currentUser={currentUser} />
          </KeepAliveSlot>
        </div>
      </div>
    </div>
    </ReportFormsSharedProvider>
  );
}

export default ReportFormsHub;
