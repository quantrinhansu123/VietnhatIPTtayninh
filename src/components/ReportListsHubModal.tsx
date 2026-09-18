import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardList, X, Printer, Loader2 } from 'lucide-react';
import type { AppTab } from '../routes';
import { REPORT_LIST_MENU_ITEMS, type MenuCardConfig } from '../app/menus';
import { DAMAGED_GOODS_SLIP_CONFIG } from '../lib/weighingSlipConfig';
import type { MachineNvlSavedReport } from '../utils/machineNvlReports';
import type { AcceptanceReport } from './AcceptanceReportForm';
import AcceptanceReportListView from './AcceptanceReportListView';
import MachineDowntimeReportListView from './MachineDowntimeReportListView';
import ShiftHandoverListView from './ShiftHandoverListView';
import MachineNvlReportListView from './MachineNvlReportListView';
import MachineRunLogPanel from './MachineRunLogPanel';
import MixingReportListView from './MixingReportListView';
import WeighingShiftSummary from './WeighingShiftSummary';
import { CanTuDongPanel } from '../features/can-tu-dong';
import { CanTuDongPilotPanel, CanKiemKhoPilotPanel } from '../features/can-tu-dong/pilot';
import { KiemKhoPanel } from '../features/kiem-kho';
import { WarehouseHistoryPanel } from '../features/phieu-xuat-nhap-kho';
import {
  loadProductionPlanRelatedReports,
  ProductionPlanRelatedPrintContent,
  type ProductionPlanRelatedReports
} from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import { normalizeProducts } from '../features/san-pham';
import {
  disablePortraitPrintPage,
  enablePortraitPrintPage,
  waitForPrintImagesReady
} from '../utils/printReady';

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

function getLocalTodayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
  const initialDate = getLocalTodayIso();
  const [printDate, setPrintDate] = useState(initialDate);
  const [printShift, setPrintShift] = useState(filters?.shift || '');
  const [printData, setPrintData] = useState<ProductionPlanRelatedReports | null>(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState('');

  // Bộ lọc trang chi tiết đã biết đúng 1 ngày + 1 ca (vd. mở từ Biểu đồ TH) → in gộp luôn, khỏi hỏi lại.
  const lockedPrintDate = filters?.dateFrom && filters.dateFrom === filters.dateTo ? filters.dateFrom : '';
  const lockedPrintShift = filters?.shift && filters.shift !== 'all' ? filters.shift : '';
  const isAutoPrint = Boolean(lockedPrintDate && lockedPrintShift);

  useEffect(() => {
    if (!open) return;
    setPrintDate(lockedPrintDate || getLocalTodayIso());
    setPrintShift(lockedPrintShift || '');
    setPrintData(null);
    setPrintError('');
  }, [open, lockedPrintDate, lockedPrintShift]);

  const prepareAndPrint = async (dateOverride?: string, shiftOverride?: string) => {
    const date = dateOverride || printDate;
    const shift = shiftOverride || printShift;
    if (!date || !shift) {
      setPrintError('Vui lòng chọn ngày và ca trước khi in.');
      return;
    }
    setIsPreparingPrint(true);
    setPrintError('');
    try {
      const productRes = await fetch('/api/san-pham');
      const productJson = await productRes.json().catch(() => []);
      const catalog = productRes.ok ? normalizeProducts(productJson) : [];
      const data = await loadProductionPlanRelatedReports(date, [shift], catalog);
      if (data.isEmpty) {
        setPrintError('Không có phiếu nào của ngày và ca đã chọn để in.');
        return;
      }
      setPrintData(data);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Không thể chuẩn bị bản in.');
    } finally {
      setIsPreparingPrint(false);
    }
  };

  useEffect(() => {
    if (!open || !isAutoPrint) return;
    void prepareAndPrint(lockedPrintDate, lockedPrintShift);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAutoPrint, lockedPrintDate, lockedPrintShift]);

  useEffect(() => {
    if (!printData) return;
    document.body.classList.add('production-plan-related-print-active');
    // Báo cáo kết quả theo từng lệnh SX có layout A4 dọc riêng. Khi được in
    // trong batch "Danh sách báo cáo", phải bật cùng ngữ cảnh với trang gốc
    // để giữ nguyên phân trang tự nhiên của mẫu (có thể kéo dài nhiều trang),
    // không bị Chrome thu nhỏ để dồn nội dung.
    document.body.classList.add('shift-summary-print-active');
    document.body.classList.add('bb-machine-report-print-active');
    enablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => window.print());
    }, 350);
    const cleanup = () => {
      window.clearTimeout(timer);
      document.body.classList.remove('production-plan-related-print-active');
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
      disablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
      setPrintData(null);
      if (isAutoPrint) onClose();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('production-plan-related-print-active');
      document.body.classList.remove('shift-summary-print-active');
      document.body.classList.remove('bb-machine-report-print-active');
      disablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
    };
  }, [printData, isAutoPrint, onClose]);

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

  const selectedHubFilters = useMemo<ReportListHubFilters>(() => ({
    ...hubFilters,
    dateFrom: printDate || hubFilters.dateFrom,
    dateTo: printDate || hubFilters.dateTo,
    shift: printShift || undefined
  }), [hubFilters, printDate, printShift]);
  if (!open) return null;

  const activeItem = menuItems.find(item => item.tab === activeTab) ?? menuItems[0];
  const panelKey = `${activeTab}:${filtersKey}:${printDate}:${printShift}`;

  // Trang phân tích tự động chỉ cần popup chọn phạm vi để in gộp; không hiển thị
  // lại trung tâm các danh sách báo cáo ở đây.
  // Đã biết đúng 1 ngày + 1 ca (mở từ Biểu đồ TH) → in gộp thẳng, không hỏi lại.
  return <>
    {createPortal(
      isAutoPrint ? (
        <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Đang chuẩn bị bản in">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl">
            {printError ? (
              <>
                <p className="text-sm font-bold text-rose-600">{printError}</p>
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={onClose} className="h-9 rounded-lg border border-zinc-200 px-4 text-xs font-black text-zinc-700 transition hover:bg-zinc-50">Đóng</button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2.5 text-zinc-700">
                <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                <span className="text-sm font-bold">Đang chuẩn bị bản in {lockedPrintDate} · {lockedPrintShift}...</span>
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Chọn ngày và ca để in">
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3.5 text-zinc-950">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-600">In báo cáo</p>
              <h3 className="mt-0.5 text-base font-black">Chọn ngày và ca</h3>
              <p className="mt-1 max-w-sm text-[11px] font-semibold leading-4 text-zinc-500">In gộp KHSX, LSX, xuất kho, tồn đầu, tồn cuối và sản lượng nếu có.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" title="Đóng" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3.5 px-4 py-4">
            <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
              Ngày
              <input type="date" value={printDate} onChange={event => setPrintDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
              Ca
              <select value={printShift} onChange={event => setPrintShift(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100">
                <option value="">— Chọn ca —</option>
                <option value="12C1">12C1 (06:00 - 18:00)</option>
                <option value="12C2">12C2 (18:00 - 06:00)</option>
                <option value="HC1">HC1 (06:00 - 14:00)</option>
                <option value="HC2">HC2 (14:00 - 22:00)</option>
                <option value="HC3">HC3 (22:00 - 06:00)</option>
              </select>
            </label>
            {printError ? <p className="text-sm font-bold text-rose-600">{printError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-black text-zinc-700 transition hover:bg-zinc-50">Hủy</button>
              <button type="button" onClick={() => void prepareAndPrint()} disabled={isPreparingPrint || !printDate || !printShift} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {isPreparingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {isPreparingPrint ? 'Đang chuẩn bị...' : 'In'}
              </button>
            </div>
          </div>
        </div>
      </div>
      ),
      document.body
    )}
    {printData ? createPortal(<div className="production-order-print-batch"><ProductionPlanRelatedPrintContent data={printData} /></div>, document.body) : null}
  </>;

  return <>
    {createPortal(
    <div
      className="fixed inset-0 z-[10040] flex flex-col bg-slate-950/55 p-2 backdrop-blur-sm sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Danh sách báo cáo"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-red-200/90 bg-white shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-red-100 bg-gradient-to-b from-red-50/60 to-white px-4 py-3.5 text-zinc-900">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-600">
              Xem báo cáo
            </p>
            <h3 className="text-sm font-black text-zinc-900 sm:text-base">Danh sách báo cáo</h3>
            <p className="mt-1 text-xs font-semibold text-zinc-500">
              {filterSummary || 'Theo bộ lọc trang phân tích'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 shadow-xs transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950"
          >
            <X className="h-4 w-4" />
            Đóng
          </button>
        </div>

        <div className="relative shrink-0 border-b border-zinc-200 bg-zinc-50/90">
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
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                    isActive
                      ? 'border border-red-200 bg-red-50 text-[#ef1b2d] shadow-xs'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
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

        <div className="shrink-0 border-b border-red-100 bg-white px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto] sm:items-end">
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
              Ngày
              <input type="date" value={printDate} onChange={event => setPrintDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-base font-bold text-zinc-900" />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
              Ca
              <select value={printShift} onChange={event => setPrintShift(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base font-bold text-zinc-900">
                <option value="">— Chọn ca —</option>
                <option value="12C1">12C1 (06:00 - 18:00)</option>
                <option value="12C2">12C2 (18:00 - 06:00)</option>
                <option value="HC1">HC1 (06:00 - 14:00)</option>
                <option value="HC2">HC2 (14:00 - 22:00)</option>
                <option value="HC3">HC3 (22:00 - 06:00)</option>
              </select>
            </label>
            <button type="button" onClick={() => void prepareAndPrint()} disabled={isPreparingPrint || !printDate || !printShift} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-black text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
              {isPreparingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {isPreparingPrint ? 'Đang chuẩn bị...' : 'In tất cả phiếu'}
            </button>
          </div>
          {printError ? <p className="mt-2 text-xs font-bold text-rose-600">{printError}</p> : null}
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
              initialFilters={selectedHubFilters}
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
            <MixingReportListView key={panelKey} initialFilters={selectedHubFilters} onBack={onClose} />
          ) : null}
          {activeTab === 'weighing-summary-list' ? (
            <WeighingShiftSummary
              key={panelKey}
              initialFilters={selectedHubFilters}
              onBackToMenu={onClose}
            />
          ) : null}
          {activeTab === 'can-tu-dong' ? (
            <CanTuDongPanel key={panelKey} initialFilters={selectedHubFilters} onBack={onClose} />
          ) : null}
          {activeTab === 'can-tu-dong-pilot' ? <CanTuDongPilotPanel key={panelKey} /> : null}
          {activeTab === 'can-kiem-kho' ? <CanKiemKhoPilotPanel key={panelKey} /> : null}
          {activeTab === 'kiem-kho' ? <KiemKhoPanel onBack={onClose} /> : null}
          {activeTab === 'damaged-goods-report-list' ? (
            <WeighingShiftSummary
              key={panelKey}
              config={DAMAGED_GOODS_SLIP_CONFIG}
              initialFilters={selectedHubFilters}
              onBackToMenu={onClose}
            />
          ) : null}
          {activeTab === 'acceptance-report-list' ? (
            <AcceptanceReportListView
              key={panelKey}
              initialFilters={selectedHubFilters}
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
              initialFilters={selectedHubFilters}
              onBack={onClose}
              onOpenSlip={() => goAndClose('warehouse-slip')}
            />
          ) : null}
          {activeTab === 'machine-downtime-list' ? (
            <MachineDowntimeReportListView
              key={panelKey}
              initialFilters={selectedHubFilters}
              onBack={onClose}
              onCreate={() => goAndClose('machine-downtime-report')}
            />
          ) : null}
          {activeTab === 'machine-run-log-list' ? <MachineRunLogPanel onBack={onClose} /> : null}
          {activeTab === 'shift-handover-list' ? (
            <ShiftHandoverListView
              key={panelKey}
              initialFilters={selectedHubFilters}
              onBack={onClose}
              onCreate={() => goAndClose('shift-handover-report')}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
    )}
    {printData ? createPortal(<div className="production-order-print-batch"><ProductionPlanRelatedPrintContent data={printData} /></div>, document.body) : null}
  </>;
}
