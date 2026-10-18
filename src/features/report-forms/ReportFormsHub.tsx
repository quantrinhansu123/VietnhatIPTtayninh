import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AuthUser } from '../../components/LoginPage';
import type { AcceptanceReport, AcceptanceReportCreatePrefill } from '../../components/AcceptanceReportForm';
import AcceptanceReportForm from '../../components/AcceptanceReportForm';
import AcceptanceReportListView from '../../components/AcceptanceReportListView';
import MixingReportListView from '../../components/MixingReportListView';
import MachineDowntimeReportPanel from '../../components/MachineDowntimeReportPanel';
import ShiftHandoverPanel from '../../components/ShiftHandoverPanel';
import MachineRunLogPanel from '../../components/MachineRunLogPanel';
import { REPORT_FORM_MENU_ITEMS, type MenuCardConfig } from '../../app/menus';
import { CanTuDongPanel } from '../can-tu-dong';
import { CanTuDongEntryForm } from '../can-tu-dong/entry-form';
import { CanKiemKhoPilotPanel } from '../can-tu-dong/pilot';
import { DoiSoatPanel } from '../doi-soat';
import { MachineNvlReportPanel } from '../bao-cao-may-nvl-ton';
import type { MachineNvlSavedReport } from '../../utils/machineNvlReports';
import type { AppTab } from '../../routes';

export type ReportFormsHubTabId =
  | 'machine-nvl-report'
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

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">Nhập báo cáo</h2>
            <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">
              Chọn tab phiếu cần lập — không phải chọn thẻ riêng.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/80 px-2 py-2 scrollbar-thin sm:px-3">
          {hubItems.map(item => {
            const active = item.hubId === activeHubTab;
            return (
              <button
                key={item.hubId}
                type="button"
                onClick={() => setActiveHubTab(item.hubId)}
                aria-pressed={active}
                title={item.desc}
                className={`shrink-0 rounded-lg px-3 py-2 text-left transition ${
                  active
                    ? 'bg-[#ef1b2d] text-white shadow-sm'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="block whitespace-nowrap text-[12px] font-bold leading-tight">{item.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="min-h-0">
        {activeHubTab === 'machine-nvl-report' ? (
          <MachineNvlReportPanel
            onBack={onBack}
            onOpenList={() => onOpenList('machine-nvl-report-list')}
            initialMachine={machineNvlReportPrefill}
            onInitialMachineConsumed={onMachineNvlPrefillConsumed}
            editReport={machineNvlEditReport}
            onEditConsumed={onMachineNvlEditConsumed}
          />
        ) : null}

        {activeHubTab === 'mixing-report' ? (
          <MixingReportListView
            initialTab="form"
            onBack={onBack}
            initialMachine={mixingReportMachinePrefill}
            onInitialMachineConsumed={onMixingPrefillConsumed}
          />
        ) : null}

        {activeHubTab === 'can-tu-dong' ? (
          <CanTuDongPanel onBack={onBack} currentUser={currentUser} />
        ) : null}

        {activeHubTab === 'can-tu-dong-entry' ? (
          <CanTuDongEntryForm onClose={onBack} />
        ) : null}

        {activeHubTab === 'can-kiem-kho' ? <CanKiemKhoPilotPanel /> : null}

        {activeHubTab === 'machine-downtime-report' ? (
          <MachineDowntimeReportPanel onBack={onBack} />
        ) : null}

        {activeHubTab === 'machine-run-log' ? <MachineRunLogPanel onBack={onBack} /> : null}

        {activeHubTab === 'acceptance-report' ? (
          acceptanceShowForm ||
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
          )
        ) : null}

        {activeHubTab === 'shift-handover-report' ? (
          <ShiftHandoverPanel onBack={onBack} />
        ) : null}

        {activeHubTab === 'doi-soat' ? (
          <DoiSoatPanel onBack={onBack} currentUser={currentUser} />
        ) : null}
      </div>
    </div>
  );
}

export default ReportFormsHub;
