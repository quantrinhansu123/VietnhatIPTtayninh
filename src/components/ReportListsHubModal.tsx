import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, X } from 'lucide-react';
import type { AppTab } from '../routes';
import { REPORT_LIST_MENU_ITEMS, type MenuCardConfig } from '../app/menus';
import { DAMAGED_GOODS_SLIP_CONFIG } from '../lib/weighingSlipConfig';
import type { MachineNvlSavedReport } from '../utils/machineNvlReports';
import type { AcceptanceReport } from './AcceptanceReportForm';
import AcceptanceReportListView from './AcceptanceReportListView';
import MachineDowntimeReportListView from './MachineDowntimeReportListView';
import MachineNvlReportListView from './MachineNvlReportListView';
import MachineRunLogPanel from './MachineRunLogPanel';
import MixingReportListView from './MixingReportListView';
import WeighingShiftSummary from './WeighingShiftSummary';
import { CanTuDongPanel } from '../features/can-tu-dong';
import { KiemKhoPanel } from '../features/kiem-kho';
import { WarehouseHistoryPanel } from '../features/phieu-xuat-nhap-kho';

export type ReportListHubTab = (typeof REPORT_LIST_MENU_ITEMS)[number]['tab'];

export type ReportListHubFilters = {
  dateFrom?: string;
  dateTo?: string;
  /** Ca; `all` / rỗng = không lọc */
  shift?: string;
  /** Mã máy; `all` / rỗng = không lọc */
  machineCode?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  /** Bộ lọc ngày/ca/máy đang dùng trên /phan-tich. */
  filters?: ReportListHubFilters;
  /** Chuỗi hiển thị trên header (đã format sẵn). */
  filterSummary?: string;
  allowedTabs?: AppTab[];
  onEditMachineNvlReport?: (report: MachineNvlSavedReport) => void;
  onEditAcceptanceReport?: (report: AcceptanceReport) => void;
};

function shortTabLabel(item: MenuCardConfig) {
  return item.title
    .replace(/^Danh sách\s+/i, '')
    .replace(/^Phiếu\s+/i, '')
    .replace(/^Báo cáo\s+/i, '');
}

function normalizeHubFilters(filters?: ReportListHubFilters): ReportListHubFilters {
  const shift = (filters?.shift || '').trim();
  const machineCode = (filters?.machineCode || '').trim();
  return {
    dateFrom: (filters?.dateFrom || '').trim() || undefined,
    dateTo: (filters?.dateTo || '').trim() || undefined,
    shift: !shift || shift === 'all' ? undefined : shift,
    machineCode: !machineCode || machineCode === 'all' ? undefined : machineCode
  };
}

export default function ReportListsHubModal({
  open,
  onClose,
  onNavigate,
  filters,
  filterSummary,
  allowedTabs,
  onEditMachineNvlReport,
  onEditAcceptanceReport
}: Props) {
  const menuItems = useMemo(() => {
    if (!allowedTabs || allowedTabs.length === 0) return REPORT_LIST_MENU_ITEMS;
    const allowed = new Set(allowedTabs);
    return REPORT_LIST_MENU_ITEMS.filter(item => allowed.has(item.tab));
  }, [allowedTabs]);

  const hubFilters = useMemo(() => normalizeHubFilters(filters), [filters]);
  const filtersKey = [
    hubFilters.dateFrom || '',
    hubFilters.dateTo || '',
    hubFilters.shift || '',
    hubFilters.machineCode || ''
  ].join('|');

  const [activeTab, setActiveTab] = useState<ReportListHubTab>(
    () => (menuItems[0]?.tab ?? 'machine-nvl-report-list') as ReportListHubTab
  );

  useEffect(() => {
    if (!open) return;
    if (!menuItems.some(item => item.tab === activeTab) && menuItems[0]) {
      setActiveTab(menuItems[0].tab as ReportListHubTab);
    }
  }, [open, menuItems, activeTab]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const goAndClose = (tab: AppTab) => {
    onClose();
    onNavigate(tab);
  };

  if (!open) return null;

  const activeItem = menuItems.find(item => item.tab === activeTab) ?? menuItems[0];
  const panelKey = `${activeTab}:${filtersKey}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[10040] flex flex-col bg-slate-950/55 p-2 backdrop-blur-sm sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Danh sách báo cáo"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-red-800 bg-gradient-to-r from-[#b30d1c] to-[#ef1b2d] px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200/90">
              Xem báo cáo
            </p>
            <h3 className="text-sm font-black sm:text-base">Danh sách báo cáo</h3>
            <p className="mt-1 text-xs font-semibold text-white/90">
              {filterSummary || 'Theo bộ lọc trang phân tích'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/80 bg-white px-3 text-xs font-black text-sky-950 shadow-sm transition hover:bg-sky-50"
          >
            <X className="h-4 w-4" />
            Đóng
          </button>
        </div>

        <div className="relative shrink-0 border-b border-zinc-100 bg-zinc-50/90">
          <div className="bb-tab-scroller gap-1.5 px-2 py-2">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = item.tab === activeTab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab as ReportListHubTab)}
                  title={item.desc}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide transition ${
                    isActive
                      ? 'bg-[#ef1b2d] text-white shadow-sm'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {shortTabLabel(item)}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-50 to-transparent" />
        </div>

        {activeItem ? (
          <div className="shrink-0 border-b border-zinc-100 bg-white px-4 py-2">
            <div className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#ef1b2d]" />
              <div className="min-w-0">
                <p className="text-sm font-black text-zinc-900">{activeItem.title}</p>
                <p className="text-xs font-semibold text-zinc-500">{activeItem.desc}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-2 sm:p-3">
          {activeTab === 'machine-nvl-report-list' ? (
            <MachineNvlReportListView
              key={panelKey}
              initialFilters={hubFilters}
              onBack={onClose}
              onCreate={() => goAndClose('machine-nvl-report')}
              onEdit={report => {
                onClose();
                if (onEditMachineNvlReport) onEditMachineNvlReport(report);
                else onNavigate('machine-nvl-report');
              }}
            />
          ) : null}
          {activeTab === 'mixing-report-list' ? (
            <MixingReportListView key={panelKey} initialFilters={hubFilters} onBack={onClose} />
          ) : null}
          {activeTab === 'weighing-summary-list' ? (
            <WeighingShiftSummary
              key={panelKey}
              initialFilters={hubFilters}
              onBackToMenu={onClose}
            />
          ) : null}
          {activeTab === 'can-tu-dong' ? (
            <CanTuDongPanel key={panelKey} initialFilters={hubFilters} onBack={onClose} />
          ) : null}
          {activeTab === 'kiem-kho' ? <KiemKhoPanel onBack={onClose} /> : null}
          {activeTab === 'damaged-goods-report-list' ? (
            <WeighingShiftSummary
              key={panelKey}
              config={DAMAGED_GOODS_SLIP_CONFIG}
              initialFilters={hubFilters}
              onBackToMenu={onClose}
            />
          ) : null}
          {activeTab === 'acceptance-report-list' ? (
            <AcceptanceReportListView
              key={panelKey}
              initialFilters={hubFilters}
              onBack={onClose}
              onCreate={prefill => {
                onClose();
                onNavigate('acceptance-report');
                void prefill;
              }}
              onEdit={report => {
                onClose();
                if (onEditAcceptanceReport) onEditAcceptanceReport(report);
                else onNavigate('acceptance-report');
              }}
            />
          ) : null}
          {activeTab === 'warehouse-history' ? (
            <WarehouseHistoryPanel
              key={panelKey}
              initialFilters={hubFilters}
              onBack={onClose}
              onOpenSlip={() => goAndClose('warehouse-slip')}
            />
          ) : null}
          {activeTab === 'machine-downtime-list' ? (
            <MachineDowntimeReportListView
              key={panelKey}
              initialFilters={hubFilters}
              onBack={onClose}
              onCreate={() => goAndClose('machine-downtime-report')}
            />
          ) : null}
          {activeTab === 'machine-run-log-list' ? <MachineRunLogPanel onBack={onClose} /> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
