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
import {
  MaterialRequestListView,
  type MaterialRequestRow
} from '../features/yeu-cau-xuat-vat-tu/MaterialRequestListView';
import { CanTuDongPanel } from '../features/can-tu-dong';
import { KiemKhoPanel } from '../features/kiem-kho';
import { WarehouseHistoryPanel } from '../features/phieu-xuat-nhap-kho';
import {
  loadMachineShiftChecklistPrintData,
  loadProductionPlanRelatedReports,
  loadSanLuongNkSxPrintData,
  type ProductionPlanRelatedReports,
  type SanLuongNkSxPrintData
} from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import {
  loadTonThanhPhamReport,
  TonThanhPhamPrintSheet,
  type TonThanhPhamReport
} from '../features/ton-kho/TonKhoThanhPhamPrint';
import { MachineShiftMaterialChecklistPrintSheet } from './MachineShiftMaterialChecklistPrintSheet';
import {
  AcceptanceReportPrintBatch,
  buildAcceptancePrintSlips
} from './AcceptanceReportPrintSheet';
import ControlBoardBbMachineReportPrintBatch from './ControlBoardBbMachineReportPrintSheet';
import {
  disableLandscapePrintPage,
  disablePortraitPrintPage,
  enableLandscapePrintPage,
  enablePortraitPrintPage,
  waitForPrintImagesReady
} from '../utils/printReady';

type PrintReportKind = 'vat-tu' | 'san-luong' | 'ket-qua-lenh-sx' | 'ton';

const PRINT_REPORT_KIND_OPTIONS: Array<{ value: PrintReportKind; label: string; hint: string }> = [
  {
    value: 'vat-tu',
    label: 'Bảng theo dõi vật tư theo máy',
    hint: 'In bảng trộn vật tư (A4 ngang), trang sau kèm phiếu sản lượng (nhật ký SX) theo ngày · ca · máy.'
  },
  {
    value: 'san-luong',
    label: 'Nhật ký SX kiêm phiếu giao (báo cáo sản lượng)',
    hint: 'In mẫu giấy nhật ký sản xuất kiêm phiếu giao — dữ liệu lấy từ báo cáo sản lượng theo ngày · ca · máy.'
  },
  {
    value: 'ket-qua-lenh-sx',
    label: 'Báo cáo kết quả theo từng lệnh SX',
    hint: 'In báo cáo kết quả theo từng lệnh sản xuất (cùng mẫu /phan-tich-tu-dong). Cần đã Tính toán snapshot ngày · ca · máy.'
  },
  {
    value: 'ton',
    label: 'Báo cáo tồn thành phẩm',
    hint: 'In báo cáo tồn thành phẩm theo ngày (có thể chọn khoảng đến ngày).'
  }
];

export type ReportListHubTab = (typeof REPORT_LIST_MENU_ITEMS)[number]['tab'];

export type ReportListHubFilters = {
  dateFrom?: string;
  dateTo?: string;
  /** Ca; `all` / rỗng = không lọc */
  shift?: string;
  /** Mã máy; `all` / rỗng = không lọc */
  machineCode?: string;
  machineName?: string;
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
  onEditMaterialRequest?: (row: MaterialRequestRow) => void;
  onEditAcceptanceReport?: (report: AcceptanceReport) => void;
  onEditAcceptanceReportGroup?: (reports: AcceptanceReport[]) => void;
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
    machineCode: !machineCode || machineCode === 'all' ? undefined : machineCode,
    machineName: (filters?.machineName || '').trim() || undefined
  };
}

function getLocalTodayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/** Lấy tên trưởng ca từ lệnh SX / kế hoạch / phiếu giao ca đã lọc theo ngày·ca·máy. */
function resolveShiftLeadPerformedBy(data: ProductionPlanRelatedReports | null): string {
  if (!data) return '';
  const clean = (value: string) => {
    const text = String(value || '').trim();
    return !text || text === '-' ? '' : text;
  };
  for (const item of data.productionOrders || []) {
    const name = clean(item.order?.shiftLead || '');
    if (name) return name;
  }
  for (const plan of data.productionPlans || []) {
    for (const line of plan.lines || []) {
      const name = clean(line.shiftLead || '');
      if (name) return name;
    }
  }
  for (const slip of data.shiftHandovers || []) {
    const name = clean(slip.operators || '');
    if (name) return name;
  }
  return '';
}

type PrintMachineOption = { code: string; name: string };

function pickMachineField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-') return text;
  }
  return '';
}

function normalizePrintMachines(data: unknown): PrintMachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
        ? (data as { records: unknown[] }).records
        : [];
  const seen = new Set<string>();
  const out: PrintMachineOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const code = pickMachineField(rec, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'ma', 'id']);
    const name = pickMachineField(rec, ['ten_may', 'may', 'machine_name', 'name', 'ten']);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: name || code });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

export default function ReportListsHubModal({
  open,
  onClose,
  onNavigate,
  filters,
  filterSummary,
  allowedTabs,
  onEditMachineNvlReport,
  onEditMaterialRequest,
  onEditAcceptanceReport,
  onEditAcceptanceReportGroup
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
    hubFilters.machineCode || '',
    hubFilters.machineName || ''
  ].join('|');

  const [activeTab, setActiveTab] = useState<ReportListHubTab>(
    () => (menuItems[0]?.tab ?? 'machine-nvl-report-list') as ReportListHubTab
  );
  const initialDate = getLocalTodayIso();
  const [printDate, setPrintDate] = useState(initialDate);
  const [printShift, setPrintShift] = useState(filters?.shift || '');
  const [printMachineCode, setPrintMachineCode] = useState(hubFilters.machineCode || '');
  const [printMachines, setPrintMachines] = useState<PrintMachineOption[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [machinesError, setMachinesError] = useState('');
  // Đến ngày (tuỳ chọn): có giá trị khác ngày → báo cáo tồn theo khoảng ngày; trống → báo cáo tồn 1 ngày.
  const [printDateTo, setPrintDateTo] = useState('');
  const [printReportKind, setPrintReportKind] = useState<PrintReportKind>('vat-tu');
  const [tonData, setTonData] = useState<TonThanhPhamReport | null>(null);
  const [printData, setPrintData] = useState<ProductionPlanRelatedReports | null>(null);
  const [sanLuongPrintData, setSanLuongPrintData] = useState<SanLuongNkSxPrintData | null>(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState('');
  const selectedPrintKind =
    PRINT_REPORT_KIND_OPTIONS.find(option => option.value === printReportKind) ||
    PRINT_REPORT_KIND_OPTIONS[0];

  // Prefill Ngày/Ca/Máy từ bộ lọc trang — luôn hiện dialog sổ xuống (không auto-in).
  const lockedPrintDate = filters?.dateFrom && filters.dateFrom === filters.dateTo ? filters.dateFrom : '';
  const lockedPrintShift = filters?.shift && filters.shift !== 'all' ? filters.shift : '';
  const lockedPrintMachine = hubFilters.machineCode || '';

  const selectedPrintMachine = useMemo(() => {
    const code = String(printMachineCode || '').trim();
    if (!code) return null;
    const found = printMachines.find(machine => machine.code === code);
    if (found) return found;
    if (hubFilters.machineCode === code) {
      return { code, name: hubFilters.machineName || code };
    }
    return { code, name: code };
  }, [printMachineCode, printMachines, hubFilters.machineCode, hubFilters.machineName]);

  const printMachineLabel = selectedPrintMachine
    ? selectedPrintMachine.name && selectedPrintMachine.name !== selectedPrintMachine.code
      ? `${selectedPrintMachine.code} · ${selectedPrintMachine.name}`
      : selectedPrintMachine.code
    : 'Chưa chọn máy';

  useEffect(() => {
    if (!open) return;
    setPrintDate(lockedPrintDate || getLocalTodayIso());
    setPrintShift(lockedPrintShift || '');
    setPrintMachineCode(lockedPrintMachine || hubFilters.machineCode || '');
    setPrintDateTo(hubFilters.dateFrom && hubFilters.dateTo && hubFilters.dateFrom !== hubFilters.dateTo ? hubFilters.dateTo : '');
    setPrintReportKind('vat-tu');
    setPrintData(null);
    setSanLuongPrintData(null);
    setTonData(null);
    setPrintError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedPrintDate, lockedPrintShift, lockedPrintMachine, hubFilters.machineCode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setIsLoadingMachines(true);
      setMachinesError('');
      try {
        const res = await fetch('/api/danh-sach-may');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPrintMachines([]);
          setMachinesError(
            String((data as { error?: string })?.error || 'Không tải được danh sách máy.')
          );
          return;
        }
        const machines = normalizePrintMachines(data);
        setPrintMachines(machines);
        if (machines.length === 0) {
          setMachinesError('Danh sách máy trống — kiểm tra /danh-sach-may.');
        }
      } catch (error) {
        if (!cancelled) {
          setPrintMachines([]);
          setMachinesError(error instanceof Error ? error.message : 'Không tải được danh sách máy.');
        }
      } finally {
        if (!cancelled) setIsLoadingMachines(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const tonRange = (date: string) => {
    const to = printDateTo && printDateTo > date ? printDateTo : date;
    return loadTonThanhPhamReport(date, to);
  };

  const prepareAndPrint = async (
    dateOverride?: string,
    shiftOverride?: string,
    machineOverride?: { code?: string; name?: string },
    kindOverride?: PrintReportKind
  ) => {
    const kind = kindOverride || printReportKind;
    const date = dateOverride || printDate;
    const shift = shiftOverride || printShift;
    const machineCode = String(machineOverride?.code || printMachineCode || '').trim();
    const machineName = String(
      machineOverride?.name ||
        printMachines.find(machine => machine.code === machineCode)?.name ||
        (hubFilters.machineCode === machineCode ? hubFilters.machineName : '') ||
        ''
    ).trim();

    if (!date) {
      setPrintError('Vui lòng chọn ngày trước khi in.');
      return;
    }
    if (kind === 'ton') {
      setIsPreparingPrint(true);
      setPrintError('');
      try {
        setPrintData(null);
        setSanLuongPrintData(null);
        setTonData(await tonRange(date));
      } catch (error) {
        setPrintError(error instanceof Error ? error.message : 'Không thể chuẩn bị bản in.');
      } finally {
        setIsPreparingPrint(false);
      }
      return;
    }

    if (!shift) {
      setPrintError('Vui lòng chọn ca trước khi in.');
      return;
    }
    if (!machineCode) {
      setPrintError('Vui lòng chọn máy trước khi in.');
      return;
    }
    setIsPreparingPrint(true);
    setPrintError('');
    try {
      const machine = { code: machineCode, name: machineName || machineCode };
      if (kind === 'san-luong') {
        // Path nhẹ: chỉ bao-cao-nghiem-thu + san-pham + cai-dat (không gọi cân AI / full related).
        const data = await loadSanLuongNkSxPrintData(date, shift, machine);
        if (data.acceptance.length === 0) {
          setPrintError('Chưa có báo cáo sản lượng cho ngày · ca · máy đã chọn.');
          setSanLuongPrintData(null);
          setPrintData(null);
          setTonData(null);
          return;
        }
        setTonData(null);
        setPrintData(null);
        setSanLuongPrintData(data);
        return;
      }

      if (kind === 'ket-qua-lenh-sx') {
        // Cần snapshot Tính toán (bb_bao_cao_tinh_toan) + phiếu liên quan.
        const data = await loadProductionPlanRelatedReports(date, [shift], [], machine);
        if (!data.totalReport || !(data.totalReport.orderGroups || []).length) {
          setPrintError(
            'Chưa có báo cáo kết quả theo lệnh SX. Vào /phan-tich-tu-dong chọn ngày · ca · máy rồi bấm Tính toán trước khi in.'
          );
          setPrintData(null);
          setSanLuongPrintData(null);
          setTonData(null);
          return;
        }
        setTonData(null);
        setSanLuongPrintData(null);
        setPrintData(data);
        return;
      }

      // Bảng vật tư: bỏ các API nặng (cân AI 10k dòng, phiếu cân, BB tổng hợp…).
      const data = await loadMachineShiftChecklistPrintData(date, [shift], [], machine);
      setTonData(null);
      setSanLuongPrintData(null);
      setPrintData(data);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Không thể chuẩn bị bản in.');
    } finally {
      setIsPreparingPrint(false);
    }
  };

  useEffect(() => {
    if (!printData && !tonData && !sanLuongPrintData) return;
    const previousTitle = document.title;
    const [y, m, d] = (lockedPrintDate || printDate).split('-');
    const machineLabel =
      selectedPrintMachine?.name ||
      selectedPrintMachine?.code ||
      printMachineCode ||
      hubFilters.machineName ||
      hubFilters.machineCode ||
      'máy';
    const shiftLabel = lockedPrintShift || printShift;
    const kind = tonData ? 'ton' : sanLuongPrintData ? 'san-luong' : printReportKind;
    document.title =
      kind === 'ton'
        ? `Báo cáo tồn thành phẩm ${d}-${m}-${y}`
        : kind === 'san-luong'
          ? `Nhat ky SX ${d}-${m}-${y}, ca ${shiftLabel}, may ${machineLabel}`
          : kind === 'ket-qua-lenh-sx'
            ? `Ket qua theo lenh SX ${d}-${m}-${y}, ca ${shiftLabel}, may ${machineLabel}`
            : `Bang theo doi vat tu ${d}-${m}-${y}, ca ${shiftLabel}, may ${machineLabel}`;

    if (kind === 'ton' || kind === 'ket-qua-lenh-sx') {
      document.body.classList.add('production-plan-related-print-active');
      enablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
    } else if (kind === 'san-luong') {
      document.body.classList.add('acceptance-report-print-active');
      enableLandscapePrintPage('acceptance-nk-sx-print-page-landscape');
    } else {
      document.body.classList.add('machine-shift-nvl-checklist-print-active');
      enableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
    }

    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => window.print());
    }, 350);
    const cleanup = () => {
      window.clearTimeout(timer);
      document.title = previousTitle;
      document.body.classList.remove('machine-shift-nvl-checklist-print-active');
      document.body.classList.remove('acceptance-report-print-active');
      document.body.classList.remove('production-plan-related-print-active');
      disableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
      disableLandscapePrintPage('acceptance-nk-sx-print-page-landscape');
      disablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
      setPrintData(null);
      setSanLuongPrintData(null);
      setTonData(null);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', cleanup);
      document.title = previousTitle;
      document.body.classList.remove('machine-shift-nvl-checklist-print-active');
      document.body.classList.remove('acceptance-report-print-active');
      document.body.classList.remove('production-plan-related-print-active');
      disableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
      disableLandscapePrintPage('acceptance-nk-sx-print-page-landscape');
      disablePortraitPrintPage('production-plan-related-bb-machine-report-page-portrait');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printData, tonData, sanLuongPrintData, onClose, printReportKind]);

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

  // Ngày/ca/máy in (printDate…) chỉ phục vụ dialog in — không ghi đè bộ lọc danh sách.
  // Trước đây printDate mặc định = hôm nay làm trống tab tồn cuối ca khi phiếu nằm ở ngày trước.
  const selectedHubFilters = useMemo<ReportListHubFilters>(() => ({
    ...hubFilters,
    dateFrom: hubFilters.dateFrom,
    dateTo: hubFilters.dateTo,
    shift: hubFilters.shift || (printShift && printShift !== 'all' ? printShift : undefined),
    machineCode: hubFilters.machineCode || (printMachineCode || undefined),
    machineName:
      hubFilters.machineName ||
      selectedPrintMachine?.name ||
      (printMachineCode ? selectedPrintMachine?.name || printMachineCode : undefined)
  }), [hubFilters, printShift, printMachineCode, selectedPrintMachine]);

  const acceptancePrintSlips = useMemo(() => {
    const acceptanceSource = sanLuongPrintData?.acceptance || printData?.acceptance;
    if (!acceptanceSource) return [];
    if (!sanLuongPrintData && printReportKind !== 'vat-tu' && printReportKind !== 'san-luong') {
      return [];
    }
    const built = buildAcceptancePrintSlips(acceptanceSource);
    if (built.length > 0) return built;
    // Vẫn in khung phiếu sản lượng trống khi đi kèm bảng vật tư.
    if (!printData || printReportKind !== 'vat-tu') return [];
    const date = lockedPrintDate || printDate;
    const shift = lockedPrintShift || printShift;
    const code = selectedPrintMachine?.code || printMachineCode || '';
    const name = selectedPrintMachine?.name || hubFilters.machineName || code;
    if (!date || !shift) return [];
    return [
      {
        id: `blank-san-luong-${date}-${shift}-${code || 'may'}`,
        ngay: date,
        ca: shift,
        lan: '-',
        gio: '-',
        ma_may: code,
        ten_may: name,
        machineLabel: name && code && name !== code ? `${code} · ${name}` : name || code || '-',
        thanhPhamLines: [],
        hangLoiHongLines: []
      }
    ];
  }, [
    sanLuongPrintData,
    printData,
    printReportKind,
    lockedPrintDate,
    printDate,
    lockedPrintShift,
    printShift,
    selectedPrintMachine,
    printMachineCode,
    hubFilters.machineName
  ]);

  const acceptancePerformedBy = useMemo(
    () => resolveShiftLeadPerformedBy(printData),
    [printData]
  );

  const sanLuongFilmKg = sanLuongPrintData?.acceptanceFilmKgByProductCode || printData?.acceptanceFilmKgByProductCode;
  const sanLuongProductNorm =
    sanLuongPrintData?.acceptanceProductNormByCode || printData?.acceptanceProductNormByCode;
  const sanLuongShiftSettings = sanLuongPrintData?.shiftOptions || printData?.shiftOptions;

  if (!open) return null;

  const activeItem = menuItems.find(item => item.tab === activeTab) ?? menuItems[0];
  const panelKey = `${activeTab}:${filtersKey}:${selectedHubFilters.shift || ''}:${selectedHubFilters.machineCode || ''}`;
  const needsShiftMachine = printReportKind !== 'ton';
  const canPreparePrint = printReportKind === 'ton'
    ? Boolean(printDate)
    : Boolean(printDate && printShift && printMachineCode);

  // Luôn hiện dialog sổ xuống Loại · Ngày · Ca · Máy (đã prefill từ bộ lọc trang).
  return <>
    {createPortal(
      <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Chọn ngày và ca để in">
        <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3.5 text-zinc-950">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-red-600">In báo cáo</p>
              <h3 className="mt-0.5 text-base font-black">Chọn loại · ngày · ca · máy</h3>
              <p className="mt-1 max-w-sm text-[11px] font-semibold leading-4 text-zinc-500">{selectedPrintKind.hint}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" title="Đóng" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3.5 px-4 py-4">
            <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
              Loại báo cáo
              <select
                value={printReportKind}
                onChange={event => {
                  setPrintReportKind(event.target.value as PrintReportKind);
                  setPrintError('');
                }}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                {PRINT_REPORT_KIND_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
              Ngày
              <input type="date" value={printDate} onChange={event => setPrintDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
            </label>
            {printReportKind === 'ton' ? (
              <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
                Đến ngày (báo cáo tồn khoảng ngày, bỏ trống = 1 ngày)
                <input type="date" value={printDateTo} min={printDate} onChange={event => setPrintDateTo(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100" />
              </label>
            ) : null}
            {needsShiftMachine ? (
              <>
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
                <label className="block text-[11px] font-black uppercase tracking-wide text-zinc-500">
                  Máy
                  <select
                    key={`print-machine-${printMachines.length}-${isLoadingMachines ? 'loading' : 'ready'}`}
                    value={printMachineCode}
                    disabled={isLoadingMachines}
                    onChange={event => {
                      setPrintMachineCode(event.target.value);
                      setPrintError('');
                      setMachinesError('');
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 disabled:cursor-wait disabled:opacity-70"
                  >
                    <option value="">
                      {isLoadingMachines ? 'Đang tải máy...' : '— Chọn máy —'}
                    </option>
                    {printMachines.map(machine => (
                      <option key={machine.code} value={machine.code}>
                        {machine.name && machine.name !== machine.code
                          ? `${machine.code} · ${machine.name}`
                          : machine.code}
                      </option>
                    ))}
                    {printMachineCode && !printMachines.some(machine => machine.code === printMachineCode) ? (
                      <option value={printMachineCode}>{printMachineLabel}</option>
                    ) : null}
                  </select>
                </label>
              </>
            ) : null}
            {machinesError ? <p className="text-sm font-bold text-rose-600">{machinesError}</p> : null}
            {printError ? <p className="text-sm font-bold text-rose-600">{printError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-black text-zinc-700 transition hover:bg-zinc-50">Hủy</button>
              <button type="button" onClick={() => void prepareAndPrint()} disabled={isPreparingPrint || !canPreparePrint} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">
                {isPreparingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                {isPreparingPrint ? 'Đang chuẩn bị...' : 'In'}
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    {printData || tonData || sanLuongPrintData
      ? createPortal(
          tonData ? (
            <div className="production-order-print-batch">
              <TonThanhPhamPrintSheet report={tonData} />
            </div>
          ) : sanLuongPrintData ? (
            <AcceptanceReportPrintBatch
              slips={acceptancePrintSlips}
              filmKgByProductCode={sanLuongFilmKg}
              productNormByCode={sanLuongProductNorm}
              shiftSettings={sanLuongShiftSettings}
              performedBy={acceptancePerformedBy}
              machineCode={selectedPrintMachine?.code || printMachineCode}
              machineName={selectedPrintMachine?.name || hubFilters.machineName}
              shift={lockedPrintShift || printShift}
            />
          ) : printData && printReportKind === 'ket-qua-lenh-sx' && printData.totalReport ? (
            <div className="production-order-print-batch">
              <ControlBoardBbMachineReportPrintBatch
                orderGroups={printData.totalReport.orderGroups}
                exportGroups={printData.totalReport.exportGroups}
                dauCaGroups={printData.totalReport.dauCaGroups}
                cuoiCaGroups={printData.totalReport.cuoiCaGroups}
                damagedGroups={printData.totalReport.damagedGroups}
                mixingGroups={printData.totalReport.mixingGroups}
                danhGiaGroups={printData.totalReport.danhGiaGroups}
                thucDungGroups={printData.totalReport.thucDungGroups}
                inboundRows={printData.totalReport.inboundRows}
                acceptanceReports={printData.acceptance}
                products={printData.productCatalog}
                materials={printData.materialCatalog}
                phanTichMap={{}}
                sanLuongSource="can-tu-dong"
                sanLuongGroups={printData.totalReport.sanLuongGroups}
                machineReportLabel={
                  selectedPrintMachine?.name ||
                  selectedPrintMachine?.code ||
                  printData.totalReport.orderGroups[0]?.machine ||
                  'máy BB'
                }
                warehouseMovements={printData.warehouseMovements}
                warehouseMovementsByDate={printData.warehouseMovements}
                shiftSettings={printData.shiftOptions}
              />
            </div>
          ) : printData ? (
            <>
              <MachineShiftMaterialChecklistPrintSheet
                data={printData}
                date={lockedPrintDate || printDate}
                shift={lockedPrintShift || printShift}
                machineCode={selectedPrintMachine?.code || printMachineCode}
                machineName={selectedPrintMachine?.name || hubFilters.machineName}
              />
              {/* Trang sau: phiếu sản lượng — Máy/Ca y hệt bảng vật tư */}
              <AcceptanceReportPrintBatch
                slips={acceptancePrintSlips}
                filmKgByProductCode={sanLuongFilmKg}
                productNormByCode={sanLuongProductNorm}
                shiftSettings={sanLuongShiftSettings}
                performedBy={acceptancePerformedBy}
                machineCode={selectedPrintMachine?.code || printMachineCode}
                machineName={selectedPrintMachine?.name || hubFilters.machineName}
                shift={lockedPrintShift || printShift}
              />
            </>
          ) : null,
          document.body
        )
      : null}
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(160px,1fr)_minmax(140px,0.9fr)_minmax(180px,1.1fr)_auto] sm:items-end">
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
            <label className="text-xs font-black uppercase tracking-wide text-zinc-500">
              Máy
              <select
                value={printMachineCode}
                onChange={event => {
                  setPrintMachineCode(event.target.value);
                  setPrintError('');
                }}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-base font-bold text-zinc-900"
              >
                <option value="">— Chọn máy —</option>
                {printMachines.map(machine => (
                  <option key={machine.code} value={machine.code}>
                    {machine.name && machine.name !== machine.code
                      ? `${machine.code} · ${machine.name}`
                      : machine.code}
                  </option>
                ))}
                {printMachineCode && !printMachines.some(machine => machine.code === printMachineCode) ? (
                  <option value={printMachineCode}>{printMachineLabel}</option>
                ) : null}
              </select>
            </label>
            <button type="button" onClick={() => void prepareAndPrint()} disabled={isPreparingPrint || !canPreparePrint} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-black text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
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
          {activeTab === 'material-request-list' ? (
            <MaterialRequestListView
              key={panelKey}
              initialFilters={selectedHubFilters}
              onBack={onClose}
              onCreate={() => goAndClose('material-request')}
              onEdit={row => {
                onClose();
                if (onEditMaterialRequest) onEditMaterialRequest(row);
                else onNavigate('material-request');
              }}
            />
          ) : null}
          {activeTab === 'mixing-report-list' ? (
            <MixingReportListView
              key={panelKey}
              initialTab="reports"
              initialFilters={selectedHubFilters}
              onBack={onClose}
            />
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
              onEditGroup={
                onEditAcceptanceReportGroup
                  ? reports => {
                      onClose();
                      onEditAcceptanceReportGroup(reports);
                    }
                  : undefined
              }
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
          {activeTab === 'machine-run-log-list' ? (
            <MachineRunLogPanel onBack={onClose} showSavedList />
          ) : null}
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
    {printData || tonData
      ? createPortal(
          printData ? (
            <MachineShiftMaterialChecklistPrintSheet
              data={printData}
              date={lockedPrintDate || printDate}
              shift={lockedPrintShift || printShift}
              machineCode={selectedPrintMachine?.code || printMachineCode}
              machineName={selectedPrintMachine?.name || hubFilters.machineName}
            />
          ) : tonData ? (
            <div className="production-order-print-batch">
              <TonThanhPhamPrintSheet report={tonData} />
            </div>
          ) : null,
          document.body
        )
      : null}
  </>;
}
