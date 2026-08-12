import React, { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import { ClipboardList, Loader2, Plus, Printer, Save, Trash2, Wand2, X } from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import { pickText, fileToDataUrl, uploadImage } from '../_shared/recordHelpers';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import {
  MachineNvlPrintBatch,
  buildMachineNvlPrintReportFromForm,
  type MachineNvlPrintReport
} from '../../components/MachineNvlPrintSheet';
import {
  findDuplicateMachineNvlTonReport,
  formatMachineNvlDuplicateSaveMessage,
  guessMachineNvlMaterialType,
  normalizeMachineNvlReports,
  MACHINE_NVL_MATERIAL_TYPE_OPTIONS,
  type MachineNvlMaterialType,
  type MachineNvlReportKind,
  type MachineNvlSavedLine,
  type MachineNvlSavedReport
} from '../../utils/machineNvlReports';
import { normalizeProductCodeKey } from '../san-pham/types';
import { waitForPrintImagesReady } from '../../utils/printReady';
import {
  findMachineByRef,
  machineSelectValue,
  normalizeMachines,
  renderMachineSelect,
  type MachineRow
} from '../danh-sach-may';
import { normalizeMaterialsInventory, type MaterialRow } from '../kho-nvl';
import {
  formatProductionOrderShiftLabel,
  mapProductionOrderSettings,
  normalizeProductionOrders,
  resolveProductionOrderMachine,
  type ProductionOrderLookupSetting,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';

export const MACHINE_NVL_REPORT_TABS: { id: MachineNvlReportKind; label: string; hint: string }[] = [
  { id: 'dau_ca', label: 'Báo cáo đầu ca', hint: 'Kiểm kê NVL tồn khi bắt đầu ca' },
  { id: 'cuoi_ca', label: 'Báo cáo cuối ca', hint: 'Kiểm kê NVL tồn khi kết thúc ca' }
];

export type MachineNvlReportLine = {
  key: string;
  code: string;
  name: string;
  unit: string;
  unitWeightKg: string;
  materialType: MachineNvlMaterialType | '';
  previousQuantity: string;
  inMachineQuantity: string;
  inMixerQuantity: string;
  unblendedQuantity: string;
  outsideQuantity: string;
  standardQuantity: string;
  quantity: string;
  note: string;
};

const machineNvlToday = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

const emptyMachineNvlLine = (): MachineNvlReportLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  code: '',
  name: '',
  unit: 'kg',
  unitWeightKg: '',
  materialType: '',
  previousQuantity: '',
  inMachineQuantity: '',
  inMixerQuantity: '',
  unblendedQuantity: '',
  outsideQuantity: '',
  standardQuantity: '',
  quantity: '',
  note: ''
});

function isKgUnitValue(unit: string) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilogam';
}

function parseMachineNvlNumber(value: string) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveMachineNvlLineQty(
  line: Pick<MachineNvlReportLine, 'inMachineQuantity' | 'inMixerQuantity' | 'unblendedQuantity' | 'outsideQuantity'>
) {
  return (
    parseMachineNvlNumber(line.inMachineQuantity) +
    parseMachineNvlNumber(line.inMixerQuantity) +
    parseMachineNvlNumber(line.unblendedQuantity) +
    parseMachineNvlNumber(line.outsideQuantity)
  );
}

function resolveMachineNvlLineActualQty(line: Pick<MachineNvlReportLine, 'quantity'>) {
  return parseMachineNvlNumber(line.quantity);
}

/** Số lượng dùng để quy đổi: ưu tiên tổng tồn máy/bồn/chưa trộn/ngoài, không có thì lấy SL đã lưu. */
function resolveMachineNvlLineCountQty(
  line: Pick<
    MachineNvlReportLine,
    'quantity' | 'inMachineQuantity' | 'inMixerQuantity' | 'unblendedQuantity' | 'outsideQuantity'
  >
) {
  const fromParts = resolveMachineNvlLineQty(line);
  if (fromParts > 0) return fromParts;
  return resolveMachineNvlLineActualQty(line);
}

function inferExplicitKgWeight(...values: string[]) {
  for (const value of values) {
    const matches = [...String(value ?? '').matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/gi)];
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const parsed = parseMachineNvlNumber(matches[index][1]);
      if (parsed > 0) return parsed;
    }
  }
  return 0;
}

/** Hệ số kg/ĐVT: kho NVL → hệ số đã lưu → trường theo loại → trọng lượng ghi trong mã/tên → quy tắc lõi. */
function resolveMachineNvlLineUnitWeightKg(
  line: Pick<MachineNvlReportLine, 'code' | 'name' | 'unit' | 'unitWeightKg' | 'materialType'>,
  materials: MaterialRow[]
) {
  if (isKgUnitValue(line.unit)) return 1;

  const material = findMaterialByCode(materials, line.code);
  const totalWeight = material ? parseMachineNvlNumber(material.totalWeight) : 0;
  if (totalWeight > 0) return totalWeight;

  const savedWeight = parseMachineNvlNumber(line.unitWeightKg);
  if (savedWeight > 0) return savedWeight;

  const materialType =
    line.materialType || guessMachineNvlMaterialType(line.code, line.name || material?.name || '', line.unit);
  const typeWeight = materialType === 'loi'
    ? parseMachineNvlNumber(material?.coreWeight || '')
    : materialType === 'bao_bi'
      ? parseMachineNvlNumber(material?.bagWeight || '')
      : 0;
  if (typeWeight > 0) return typeWeight;

  const explicitWeight = inferExplicitKgWeight(line.code, line.name, material?.code || '', material?.name || '');
  if (explicitWeight > 0) return explicitWeight;

  // Đồng bộ quy tắc nghiệp vụ đang dùng ở danh sách/in phiếu: lõi thiếu hệ số = 1 kg/cái.
  return materialType === 'loi' ? 1 : 0;
}

function resolveMachineNvlLineKg(
  line: Pick<
    MachineNvlReportLine,
    'unit' | 'unitWeightKg' | 'inMachineQuantity' | 'inMixerQuantity' | 'unblendedQuantity' | 'outsideQuantity'
  >
) {
  const qty = resolveMachineNvlLineQty(line);
  if (qty <= 0) return 0;
  if (isKgUnitValue(line.unit)) return qty;
  const factor = parseMachineNvlNumber(line.unitWeightKg);
  return factor > 0 ? qty * factor : 0;
}

/**
 * SL tồn thực tế (kg) = số lượng × Tổng khối lượng (kho NVL theo mã).
 * ĐVT = kg → giữ nguyên số lượng.
 */
function resolveMachineNvlLineActualKg(
  line: Pick<
    MachineNvlReportLine,
    | 'code'
    | 'name'
    | 'unit'
    | 'unitWeightKg'
    | 'materialType'
    | 'quantity'
    | 'inMachineQuantity'
    | 'inMixerQuantity'
    | 'unblendedQuantity'
    | 'outsideQuantity'
  >,
  materials: MaterialRow[]
) {
  const qty = resolveMachineNvlLineCountQty(line);
  if (qty <= 0) return 0;
  if (isKgUnitValue(line.unit)) return qty;
  const factor = resolveMachineNvlLineUnitWeightKg(line, materials);
  return factor > 0 ? qty * factor : 0;
}

export function machineNvlReportMatchesMachine(
  report: Pick<MachineNvlSavedReport, 'maMay' | 'tenMay'>,
  machineCode: string,
  machineName: string,
  machineRef: string
) {
  const ref = machineRef.trim().toLowerCase();
  const code = machineCode.trim().toLowerCase();
  const name = machineName.trim().toLowerCase();
  const reportCode = report.maMay.trim().toLowerCase();
  const reportName = report.tenMay.trim().toLowerCase();
  if (!ref && !code && !name) return false;
  if (ref && (ref === reportCode || ref === reportName || reportCode.includes(ref) || reportName.includes(ref))) {
    return true;
  }
  if (code && (code === reportCode || reportCode.includes(code) || code.includes(reportCode))) return true;
  if (name && (name === reportName || reportName.includes(name) || name.includes(reportName))) return true;
  return false;
}

export function findLatestPreviousCuoiCaReport(
  reports: MachineNvlSavedReport[],
  machineCode: string,
  machineName: string,
  machineRef: string,
  ngay: string,
  ca: string
) {
  const shiftKey = ca.trim().toLowerCase();
  return (
    reports
      .filter(report => report.reportKind === 'cuoi_ca')
      .filter(report => machineNvlReportMatchesMachine(report, machineCode, machineName, machineRef))
      .filter(report => !(report.ngay === ngay && report.ca.trim().toLowerCase() === shiftKey))
      .sort((a, b) => {
        const dateCompare = b.ngay.localeCompare(a.ngay);
        if (dateCompare !== 0) return dateCompare;
        return b.createdAt.localeCompare(a.createdAt);
      })[0] ?? null
  );
}

export function buildPreviousShiftQuantityMap(report: MachineNvlSavedReport | null) {
  const map = new Map<string, number>();
  if (!report) return map;
  report.lines.forEach(line => {
    const codeKey = normalizeProductCodeKey(line.maNvl);
    if (!codeKey) return;
    map.set(codeKey, line.soLuongTon);
  });
  return map;
}

export function machineNvlTextKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function machineNvlShiftKey(value: string) {
  return machineNvlTextKey(value.replace(/\([^)]*\)/g, '').replace(/^ca\s*/i, 'ca'));
}

export function machineNvlShiftMatches(orderShift: string, selectedShift: string) {
  const orderKey = machineNvlShiftKey(orderShift);
  const selectedKey = machineNvlShiftKey(selectedShift);
  if (!orderKey || !selectedKey || orderKey === '-') return false;
  return orderKey === selectedKey || orderKey.includes(selectedKey) || selectedKey.includes(orderKey);
}

export function machineNvlOrderMatchesMachine(orderMachine: string, selectedMachine: MachineRow | null, machineRef: string) {
  const raw = String(orderMachine || '').trim();
  if (!raw || raw === '-') return false;

  const refKey = machineNvlTextKey(machineRef);
  const orderKey = machineNvlTextKey(raw);
  const candidateKeys = [
    selectedMachine?.code || '',
    selectedMachine?.name || '',
    selectedMachine ? `${selectedMachine.code} · ${selectedMachine.name}` : '',
    machineRef
  ]
    .map(machineNvlTextKey)
    .filter(Boolean);

  return candidateKeys.some(key => key === orderKey || key.includes(orderKey) || orderKey.includes(key) || key === refKey);
}

export function formatMachineNvlQuantityValue(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value);
}

export function formatMachineNvlCuoiCaOptionLabel(report: MachineNvlSavedReport) {
  const machine = report.tenMay || report.maMay || 'Máy';
  const total = Number.isFinite(report.total) ? `${formatNumber(report.total)} kg` : '—';
  return `${report.ngay} · ${report.ca || '—'} · ${machine} · ${total} · ${report.lines.length} NVL`;
}

export function filterCuoiCaReportsForPicker(
  reports: MachineNvlSavedReport[],
  filters: { ngay: string; ca: string; machineRef: string },
  machines: MachineRow[]
) {
  const ngay = filters.ngay.trim();
  const ca = filters.ca.trim();
  const machineRef = filters.machineRef.trim();
  const selectedMachine = machineRef ? findMachineByRef(machines, machineRef) : null;

  return reports
    .filter(report => report.reportKind === 'cuoi_ca')
    .filter(report => !ngay || report.ngay === ngay)
    .filter(report => !ca || machineNvlShiftKey(report.ca) === machineNvlShiftKey(ca))
    .filter(report => {
      if (!machineRef) return true;
      return machineNvlReportMatchesMachine(
        report,
        selectedMachine?.code || machineRef,
        selectedMachine?.name || machineRef,
        machineRef
      );
    })
    .sort((a, b) => {
      const byDate = b.ngay.localeCompare(a.ngay);
      if (byDate !== 0) return byDate;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

export const MACHINE_NVL_DAU_CA_GRID =
  // STT | Mã | Tên | ĐVT | Loại vật tư | Tồn máy | Tồn bồn | Chưa trộn | Tồn ngoài | Tổng | KL định mức | SL tồn | Ghi chú | Xóa
  'grid-cols-[52px_minmax(130px,1.1fr)_minmax(160px,2fr)_64px_104px_96px_96px_96px_96px_104px_104px_96px_minmax(96px,1fr)_40px]';

export const MACHINE_NVL_CUOI_CA_GRID =
  // STT | Mã | Tên | ĐVT | Loại vật tư | Tồn máy | Tồn bồn | Chưa trộn | Tồn ngoài | Tổng | KL định mức | SL tồn | Ghi chú | Xóa
  'grid-cols-[52px_minmax(130px,1.1fr)_minmax(160px,2fr)_64px_104px_96px_96px_96px_96px_104px_104px_96px_minmax(96px,1fr)_40px]';

const machineNvlLineMobileQtyClass =
  'machine-nvl-line-mobile-input h-9 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-center font-mono text-sm font-black tracking-tight outline-none focus:border-[#ef1b2d]';
const machineNvlLineMobileQtyReadonlyClass =
  'machine-nvl-line-mobile-input h-9 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-0.5 text-center font-mono text-sm font-black tracking-tight text-zinc-800 outline-none';
const machineNvlLineDesktopQtyClass =
  'min-w-0 h-10 rounded-lg border border-zinc-200 px-2 text-center font-mono text-base font-black tracking-tight outline-none focus:border-[#ef1b2d]';
const machineNvlLineDesktopQtyReadonlyClass =
  'min-w-0 h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-center font-mono text-base font-black tracking-tight text-zinc-800 outline-none';
const machineNvlFormControlClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 lg:h-11 lg:px-3 lg:text-sm';
const machineNvlFormFieldClass = `mt-1 ${machineNvlFormControlClass}`;
const machineNvlFormLabelClass =
  'block min-w-0 text-[10px] font-black uppercase tracking-wider text-zinc-500 sm:text-xs';

export function findMaterialByCode(materials: MaterialRow[], code: string) {
  const normalized = code.trim();
  if (!normalized) return null;
  const exact = materials.find(material => material.code === normalized);
  if (exact) return exact;
  const key = normalizeProductCodeKey(normalized);
  if (!key) return null;
  return materials.find(material => normalizeProductCodeKey(material.code) === key) ?? null;
}

export function savedMachineNvlLineToFormLine(line: MachineNvlSavedLine): MachineNvlReportLine {
  return {
    key: `${Date.now()}-${line.stt}-${Math.random().toString(36).slice(2)}`,
    code: line.maNvl,
    name: line.tenNvl,
    unit: line.donVi || 'kg',
    unitWeightKg: line.trongLuongQuyDoiKg !== null ? String(line.trongLuongQuyDoiKg) : '',
    materialType: line.loaiVatTu ?? '',
    previousQuantity: formatMachineNvlQuantityValue(line.soLuongTonCaTruoc),
    inMachineQuantity: formatMachineNvlQuantityValue(line.soLuongTrongMay),
    inMixerQuantity: formatMachineNvlQuantityValue(line.soLuongTrongBonTron),
    unblendedQuantity: formatMachineNvlQuantityValue(line.soLuongNlChuaTron),
    outsideQuantity: formatMachineNvlQuantityValue(line.soLuongTonNgoai),
    standardQuantity: formatMachineNvlQuantityValue(line.soLuongTonDinhMuc),
    quantity: formatMachineNvlQuantityValue(line.soLuongTon),
    note: line.ghiChu
  };
}

/** Tồn cuối ca trước → dòng tồn đầu ca (SL tồn cuối làm tồn đầu + tham chiếu ca trước). */
export function savedCuoiCaLineToDauCaFormLine(line: MachineNvlSavedLine): MachineNvlReportLine {
  const base = savedMachineNvlLineToFormLine(line);
  return {
    ...base,
    previousQuantity: formatMachineNvlQuantityValue(line.soLuongTon)
  };
}

export function MachineNvlReportPanel({
  onBack,
  onOpenList,
  initialMachine,
  onInitialMachineConsumed,
  editReport,
  onEditConsumed
}: {
  onBack: () => void;
  onOpenList?: () => void;
  initialMachine?: { code: string; name: string } | null;
  onInitialMachineConsumed?: () => void;
  editReport?: MachineNvlSavedReport | null;
  onEditConsumed?: () => void;
}) {
  const [activeKind, setActiveKind] = useState<MachineNvlReportKind>('dau_ca');
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [reports, setReports] = useState<MachineNvlSavedReport[]>([]);
  const [dauCaReports, setDauCaReports] = useState<MachineNvlSavedReport[]>([]);
  const [cuoiCaReports, setCuoiCaReports] = useState<MachineNvlSavedReport[]>([]);
  const [date, setDate] = useState(machineNvlToday());
  const [shift, setShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [selectedStaffNames, setSelectedStaffNames] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<MachineNvlReportLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<MachineNvlPrintReport | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [showCuoiCaPicker, setShowCuoiCaPicker] = useState(false);
  const [pickerNgay, setPickerNgay] = useState('');
  const [pickerCa, setPickerCa] = useState('');
  const [pickerMachineRef, setPickerMachineRef] = useState('');
  const [pickerReportId, setPickerReportId] = useState('');

  const loadReports = async (kind: MachineNvlReportKind = activeKind) => {
    const res = await fetch(`/api/bao-cao-may-nvl-ton?limit=200&loai_bao_cao=${encodeURIComponent(kind)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const list = normalizeMachineNvlReports(data);
    setReports(list);
    if (kind === 'dau_ca') setDauCaReports(list);
    if (kind === 'cuoi_ca') setCuoiCaReports(list);
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [machineRes, materialRes, settingsRes, productionRes, reportRes, dauCaRes, cuoiCaRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/kho-nvl'),
          fetch('/api/cai-dat'),
          fetch('/api/lenh-sx'),
          fetch(`/api/bao-cao-may-nvl-ton?limit=200&loai_bao_cao=${encodeURIComponent(activeKind)}`),
          fetch('/api/bao-cao-may-nvl-ton?limit=200&loai_bao_cao=dau_ca'),
          fetch('/api/bao-cao-may-nvl-ton?limit=200&loai_bao_cao=cuoi_ca')
        ]);
        const [machineData, materialData, settingsData, productionData, reportData, dauCaData, cuoiCaData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          materialRes.json().catch(() => ({})),
          settingsRes.json().catch(() => ({})),
          productionRes.json().catch(() => ({})),
          reportRes.json().catch(() => ({})),
          dauCaRes.json().catch(() => ({})),
          cuoiCaRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (materialRes.ok) setMaterials(normalizeMaterialsInventory(materialData));
        if (settingsRes.ok) setShiftSettings(mapProductionOrderSettings(settingsData));
        if (productionRes.ok) setProductionOrders(normalizeProductionOrders(productionData));
        if (reportRes.ok) setReports(normalizeMachineNvlReports(reportData));
        if (dauCaRes.ok) setDauCaReports(normalizeMachineNvlReports(dauCaData));
        if (cuoiCaRes.ok) setCuoiCaReports(normalizeMachineNvlReports(cuoiCaData));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [activeKind]);

  useEffect(() => {
    if (!initialMachine || machines.length === 0) return;
    const found =
      findMachineByRef(machines, initialMachine.code) ?? findMachineByRef(machines, initialMachine.name);
    setMachineRef(found ? machineSelectValue(found) : initialMachine.name || initialMachine.code);
    onInitialMachineConsumed?.();
  }, [initialMachine, machines, onInitialMachineConsumed]);

  const applyEditReport = (report: MachineNvlSavedReport) => {
    const found =
      findMachineByRef(machines, report.maMay) ?? findMachineByRef(machines, report.tenMay);
    setActiveKind(report.reportKind);
    setEditingReportId(report.id);
    setDate(report.ngay || machineNvlToday());
    setShift(report.ca);
    setMachineRef(found ? machineSelectValue(found) : report.tenMay || report.maMay);
    setSelectedStaffNames(splitProductionOrderStaffNames(report.nhanSu));
    setNote(report.note);
    setLines(
      report.lines.length > 0 ? report.lines.map(savedMachineNvlLineToFormLine) : [emptyMachineNvlLine()]
    );
    setMessage('');
  };

  useEffect(() => {
    if (!editReport || machines.length === 0) return;
    applyEditReport(editReport);
    onEditConsumed?.();
  }, [editReport, machines, onEditConsumed]);

  const switchReportKind = (kind: MachineNvlReportKind) => {
    if (kind === activeKind) return;
    setActiveKind(kind);
    setEditingReportId(null);
    setLines([]);
    setSelectedStaffNames([]);
    setNote('');
    setMessage('');
  };

  const activeTabMeta = MACHINE_NVL_REPORT_TABS.find(tab => tab.id === activeKind) ?? MACHINE_NVL_REPORT_TABS[0];
  const isDauCaTab = activeKind === 'dau_ca';

  const selectedMachine = findMachineByRef(machines, machineRef);
  const shiftOptions = useMemo(() => {
    const fromSettings = shiftSettings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Thời gian' ||
          setting.loaiCaiDat === 'Ca máy' ||
          setting.loaiCaiDat === 'Sản xuất' ||
          /ca/i.test(setting.name) ||
          /ca/i.test(setting.code)
      )
      .map(setting => setting.name || setting.code)
      .filter((name, index, arr) => name && arr.indexOf(name) === index);

    return fromSettings;
  }, [shiftSettings]);
  const staffOptions = useMemo(() => {
    if (!date || !shift || !machineRef.trim()) return [];

    const matchedOrders = productionOrders.filter(order => {
      const orderDate = parseProductionOrderFilterDate(order.startDate);
      if (orderDate && orderDate !== date) return false;
      if (!machineNvlShiftMatches(order.shift, shift)) return false;
      return machineNvlOrderMatchesMachine(resolveProductionOrderMachine(order, machines), selectedMachine, machineRef);
    });

    return Array.from(new Set<string>(matchedOrders.flatMap(order => splitProductionOrderStaffNames(order.staff)))).sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [date, machines, machineRef, productionOrders, selectedMachine, shift]);

  useEffect(() => {
    if (!date || !shift || !machineRef.trim()) {
      if (selectedStaffNames.length > 0) setSelectedStaffNames([]);
      return;
    }

    if (staffOptions.length === 1) {
      setSelectedStaffNames(prev =>
        prev.length === 1 && prev[0] === staffOptions[0] ? prev : [staffOptions[0]]
      );
      return;
    }

    setSelectedStaffNames(prev => {
      const next = prev.filter(name => staffOptions.includes(name));
      return next.length === prev.length ? prev : next;
    });
  }, [date, machineRef, shift, staffOptions]);

  const toggleStaffName = (name: string) => {
    setSelectedStaffNames(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  const machineNvlStaffText = selectedStaffNames.join(', ');
  const canPickPreviousCuoiCa = Boolean(isDauCaTab && date && shift && machineRef.trim());
  const previousCuoiCaReport = useMemo(
    () =>
      canPickPreviousCuoiCa
        ? findLatestPreviousCuoiCaReport(
            cuoiCaReports,
            selectedMachine?.code || machineRef.trim(),
            selectedMachine?.name || machineRef.trim(),
            machineRef,
            date,
            shift
          )
        : null,
    [canPickPreviousCuoiCa, cuoiCaReports, selectedMachine, machineRef, date, shift]
  );
  const previousDauCaReport = useMemo(() => {
    if (isDauCaTab) return null;
    if (!date || !shift) return null;
    return (
      dauCaReports
        .filter(report => report.reportKind === 'dau_ca')
        .filter(report => report.ngay === date)
        .filter(report => machineNvlReportMatchesMachine(report, selectedMachine?.code || machineRef.trim(), selectedMachine?.name || machineRef.trim(), machineRef))
        .filter(report => machineNvlShiftKey(report.ca) === machineNvlShiftKey(shift))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] ?? null
    );
  }, [isDauCaTab, dauCaReports, date, shift, selectedMachine, machineRef]);
  const previousShiftQtyMap = useMemo(
    () => buildPreviousShiftQuantityMap(isDauCaTab ? previousCuoiCaReport : previousDauCaReport),
    [isDauCaTab, previousCuoiCaReport, previousDauCaReport]
  );

  const pickerCuoiCaOptions = useMemo(
    () =>
      filterCuoiCaReportsForPicker(
        cuoiCaReports,
        { ngay: pickerNgay, ca: pickerCa, machineRef: pickerMachineRef },
        machines
      ),
    [cuoiCaReports, pickerNgay, pickerCa, pickerMachineRef, machines]
  );

  useEffect(() => {
    if (!showCuoiCaPicker) return;
    if (!pickerReportId) return;
    if (pickerCuoiCaOptions.some(report => report.id === pickerReportId)) return;
    setPickerReportId('');
  }, [showCuoiCaPicker, pickerCuoiCaOptions, pickerReportId]);

  const openCuoiCaPickerModal = () => {
    setPickerNgay('');
    setPickerCa('');
    setPickerMachineRef('');
    setPickerReportId('');
    setShowCuoiCaPicker(true);
  };

  const closeCuoiCaPickerModal = () => {
    setShowCuoiCaPicker(false);
    setPickerReportId('');
  };

  const applySelectedCuoiCaReport = () => {
    if (!isDauCaTab) return;
    const selected =
      pickerCuoiCaOptions.find(report => report.id === pickerReportId) ??
      cuoiCaReports.find(report => report.id === pickerReportId) ??
      null;
    if (!selected) {
      const msg = 'Hãy chọn một phiếu tồn cuối ca trong danh sách.';
      setMessage(msg);
      showAppToast(msg, 'error');
      return;
    }

    const sourceLabel = `${selected.ngay} · ${selected.ca} · ${selected.tenMay || selected.maMay}`;
    if (
      lines.some(line => line.code.trim() || resolveMachineNvlLineQty(line) > 0) &&
      !window.confirm(
        `Điền lại toàn bộ dòng từ tồn cuối ca?\n${sourceLabel}\n\nCác dòng hiện tại trên form sẽ bị thay thế.`
      )
    ) {
      return;
    }

    const nextLines =
      selected.lines.length > 0
        ? selected.lines.map(savedCuoiCaLineToDauCaFormLine)
        : [emptyMachineNvlLine()];
    setLines(nextLines);
    setNote(prev => {
      const stamp = `Điền từ tồn cuối ca ${sourceLabel}`;
      if (!prev.trim()) return stamp;
      if (prev.includes('Điền từ tồn cuối ca')) return stamp;
      return `${prev}\n${stamp}`;
    });
    setMessage('');
    closeCuoiCaPickerModal();
    showAppToast(`Đã điền ${nextLines.length} dòng từ tồn cuối ca ${sourceLabel}.`);
  };

  useEffect(() => {
    if (previousShiftQtyMap.size === 0) return;
    setLines(prev =>
      prev.map(line => {
        const codeKey = normalizeProductCodeKey(line.code);
        if (!codeKey || !previousShiftQtyMap.has(codeKey)) return line;
        const prevQty = previousShiftQtyMap.get(codeKey);
        return {
          ...line,
          previousQuantity: formatMachineNvlQuantityValue(prevQty)
        };
      })
    );
  }, [previousShiftQtyMap]);

  useEffect(() => {
    if (materials.length === 0) return;
    setLines(prev => {
      let changed = false;
      const next = prev.map(line => {
        const code = line.code.trim();
        if (!code) return line;
        const material = findMaterialByCode(materials, code);
        if (!material) return line;
        const unitRaw = material.unit === '-' ? 'kg' : material.unit;
        const autoUnitWeightKg = material.totalWeight === '-' ? '' : material.totalWeight;
        const nextName = line.name.trim() ? line.name : material.name;
        const nextUnit = line.unit.trim() ? line.unit : unitRaw;
        const nextUnitWeight = autoUnitWeightKg || line.unitWeightKg;
        const nextType = line.materialType || guessMachineNvlMaterialType(material.code, material.name, unitRaw);
        if (
          nextName === line.name &&
          nextUnit === line.unit &&
          nextUnitWeight === line.unitWeightKg &&
          nextType === line.materialType
        ) {
          return line;
        }
        changed = true;
        return {
          ...line,
          name: nextName,
          unit: nextUnit,
          unitWeightKg: nextUnitWeight,
          materialType: nextType
        };
      });
      return changed ? next : prev;
    });
  }, [materials]);

  const totalWeightKg = lines.reduce((sum, line) => sum + resolveMachineNvlLineActualKg(line, materials), 0);

  const updateLine = (key: string, updates: Partial<MachineNvlReportLine>) => {
    setLines(prev =>
      prev.map(line => {
        if (line.key !== key) return line;
        const next = { ...line, ...updates };
        const touchesStorageFields = Boolean(
          updates.inMachineQuantity !== undefined ||
            updates.inMixerQuantity !== undefined ||
            updates.unblendedQuantity !== undefined ||
            updates.outsideQuantity !== undefined
        );
        if (touchesStorageFields) {
          const totalQty = resolveMachineNvlLineQty(next);
          next.quantity = totalQty > 0 ? formatMachineNvlQuantityValue(totalQty) : '';
          // Đồng bộ hệ số kg từ kho NVL theo mã
          if (next.code.trim()) {
            const fromNvl = resolveMachineNvlLineUnitWeightKg(next, materials);
            if (fromNvl > 0) {
              next.unitWeightKg = formatMachineNvlQuantityValue(fromNvl);
            }
          }
        }
        return next;
      })
    );
  };

  const selectMaterial = (key: string, material: MaterialRow | null) => {
    if (!material) {
      updateLine(key, { code: '', name: '', unit: '', unitWeightKg: '', materialType: '' });
      return;
    }
    const codeKey = normalizeProductCodeKey(material.code);
    const prevQty = isDauCaTab && codeKey ? previousShiftQtyMap.get(codeKey) : undefined;
    const unitRaw = material.unit === '-' ? 'kg' : material.unit;
    const autoUnitWeightKg = material.totalWeight === '-' ? '' : material.totalWeight;
    updateLine(key, {
      code: material.code,
      name: material.name,
      unit: unitRaw,
      unitWeightKg: autoUnitWeightKg,
      materialType: guessMachineNvlMaterialType(material.code, material.name, unitRaw),
      previousQuantity:
        isDauCaTab && prevQty !== undefined ? formatMachineNvlQuantityValue(prevQty) : ''
    });
  };

  const saveReport = async () => {
    setMessage('');
    const materialLines = lines
      .map((line, index) => {
        const row: Record<string, unknown> = {
          stt: index + 1,
          ma_nvl: line.code.trim(),
          ten_nvl: line.name.trim(),
          don_vi: line.unit.trim() || 'kg',
          trong_luong_quy_doi_kg: (() => {
            const fromNvl = resolveMachineNvlLineUnitWeightKg(line, materials);
            if (fromNvl > 0) return fromNvl;
            const raw = Number(String(line.unitWeightKg || '').replace(',', '.'));
            return Number.isFinite(raw) && raw > 0 ? raw : null;
          })(),
          loai_vat_tu: line.materialType || null,
          ghi_chu: line.note.trim()
        };
        const inMachineQty = Number(line.inMachineQuantity.replace(',', '.'));
        const inMixerQty = Number(line.inMixerQuantity.replace(',', '.'));
        const unblendedQty = Number(line.unblendedQuantity.replace(',', '.'));
        const outsideQty = Number(line.outsideQuantity.replace(',', '.'));
        if (Number.isFinite(inMachineQty) && inMachineQty >= 0) {
          row.so_luong_trong_may = inMachineQty;
        }
        if (Number.isFinite(inMixerQty) && inMixerQty >= 0) {
          row.so_luong_trong_bon_tron = inMixerQty;
        }
        if (Number.isFinite(unblendedQty) && unblendedQty >= 0) {
          row.so_luong_nl_chua_tron = unblendedQty;
        }
        if (Number.isFinite(outsideQty) && outsideQty >= 0) {
          row.so_luong_ton_ngoai = outsideQty;
        }
        const computedQty =
          (Number.isFinite(inMachineQty) ? inMachineQty : 0) +
          (Number.isFinite(inMixerQty) ? inMixerQty : 0) +
          (Number.isFinite(unblendedQty) ? unblendedQty : 0) +
          (Number.isFinite(outsideQty) ? outsideQty : 0);
        // Lưu số lượng (ĐVT gốc); SL tồn thực tế trên UI = số lượng × Tổng KL NVL
        const actualQty = Number(String(line.quantity || '').replace(',', '.'));
        row.so_luong_ton =
          computedQty > 0 ? computedQty : Number.isFinite(actualQty) && actualQty >= 0 ? actualQty : 0;
        if (isDauCaTab) {
          const prevQty = Number(line.previousQuantity.replace(',', '.'));
          if (Number.isFinite(prevQty) && prevQty >= 0) {
            row.so_luong_ton_ca_truoc = prevQty;
          }
        }
        return row;
      })
      .filter(
        line =>
          line.ma_nvl ||
          line.ten_nvl ||
          Number(line.so_luong_trong_may) > 0 ||
          Number(line.so_luong_trong_bon_tron) > 0 ||
          Number(line.so_luong_nl_chua_tron) > 0 ||
          Number(line.so_luong_ton_ngoai) > 0 ||
          Number(line.so_luong_ton_dinh_muc) > 0 ||
          Number(line.so_luong_ton) > 0
      );

    if (!date || !shift || !machineRef.trim() || materialLines.length === 0) {
      setMessage(showSaveFailure('Vui lòng chọn ngày, ca, máy và nhập ít nhất một dòng NVL tồn.'));
      return;
    }

    const maMay = selectedMachine?.code || machineRef.trim();
    const tenMay = selectedMachine?.name || machineRef.trim();
    const machineLabel = selectedMachine
      ? `${selectedMachine.code} · ${selectedMachine.name}`
      : machineRef.trim();
    const duplicateSource =
      activeKind === 'cuoi_ca'
        ? [...reports, ...cuoiCaReports]
        : [...reports, ...dauCaReports];
    const duplicate = findDuplicateMachineNvlTonReport(duplicateSource, {
      ngay: date,
      ca: shift,
      reportKind: activeKind,
      maMay,
      tenMay,
      excludeId: editingReportId
    });
    if (duplicate) {
      setMessage(
        showSaveFailure(formatMachineNvlDuplicateSaveMessage(activeKind, date, shift, machineLabel))
      );
      return;
    }

    setIsSaving(true);
    try {
      const isEdit = Boolean(editingReportId);
      const res = await fetch(
        isEdit ? `/api/bao-cao-may-nvl-ton/${encodeURIComponent(editingReportId!)}` : '/api/bao-cao-may-nvl-ton',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ngay: date,
            ca: shift,
            gio: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            ma_may: maMay,
            ten_may: tenMay,
            nhan_su: machineNvlStaffText,
            ghi_chu: note.trim(),
            loai_bao_cao: activeKind,
            chi_tiet: materialLines
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          readApiErrorMessage(res, data, `Không thể ${isEdit ? 'cập nhật' : 'lưu'} báo cáo NVL tồn theo máy.`)
        );
      }

      setMessage('');
      showAppToast(
        isEdit ? `Đã cập nhật ${activeTabMeta.label.toLowerCase()}.` : `Đã lưu ${activeTabMeta.label.toLowerCase()}.`
      );
      setEditingReportId(null);
      if (isEdit) {
        setLines([]);
      }
      setNote('');
      await loadReports(activeKind);
    } catch (error: any) {
      setMessage(showSaveFailure(error, 'Không thể lưu báo cáo.'));
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEditReport = () => {
    setEditingReportId(null);
    setLines([]);
    setSelectedStaffNames([]);
    setNote('');
    setMessage('');
  };

  const printReportPayload = (report: MachineNvlPrintReport) => {
    setPrintReport(report);
    setPendingPrint(true);
  };

  const buildCurrentPrintReport = (): MachineNvlPrintReport =>
    buildMachineNvlPrintReportFromForm({
      reportKind: activeKind,
      date,
      shift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      staff: machineNvlStaffText,
      note: note.trim(),
      lines
    });

  const canPrintCurrentReport = lines.some(line => {
    if (line.code.trim() || line.name.trim()) return true;
    return Boolean(
      line.inMachineQuantity.trim() ||
        line.inMixerQuantity.trim() ||
        line.unblendedQuantity.trim() ||
        line.outsideQuantity.trim()
    );
  });

  useEffect(() => {
    if (!pendingPrint || !printReport) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printReport]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintReport(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-2 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-black text-zinc-900">Báo cáo NVL tồn theo máy</h1>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Tổng tồn</p>
            <p className="text-lg font-black text-emerald-900">{formatNumber(totalWeightKg)} kg</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 sm:mt-3 sm:gap-2">
          {MACHINE_NVL_REPORT_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchReportKind(tab.id)}
              className={`inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-[9px] font-extrabold leading-tight transition sm:h-8 sm:rounded-xl sm:px-3 sm:text-xs ${
                activeKind === tab.id
                  ? 'bg-[#ef1b2d] text-white shadow-sm'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-[#ef1b2d]/40 hover:text-[#ef1b2d]'
              }`}
            >
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
          {onOpenList ? (
            <button
              type="button"
              onClick={onOpenList}
              className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1 text-[9px] font-extrabold text-emerald-800 transition hover:bg-emerald-100 sm:h-8 sm:rounded-lg sm:px-2.5 sm:text-xs"
            >
              <ClipboardList className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="truncate">Danh sách</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="xl:p-4">
          <section className="w-full min-w-0 max-w-full overflow-hidden border-b border-zinc-200 bg-white px-1.5 py-2 sm:px-2 sm:py-3 xl:rounded-2xl xl:border xl:p-4 xl:shadow-sm">
            <div className="mb-3 border-b border-zinc-100 pb-3">
              <p className="text-sm font-black text-zinc-900">
                {editingReportId ? `Đang sửa ${activeTabMeta.label.toLowerCase()}` : activeTabMeta.label}
              </p>
              {editingReportId ? (
                <p className="mt-1 text-xs font-semibold text-[#ef1b2d]">
                  Chỉnh sửa phiếu đã lưu · bấm Cập nhật để lưu thay đổi
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
              <label className={machineNvlFormLabelClass}>
                Ngày
                <input
                  type="date"
                  value={date}
                  onChange={event => setDate(event.target.value)}
                  className={machineNvlFormFieldClass}
                />
              </label>
              <label className={machineNvlFormLabelClass}>
                Ca
                <select value={shift} onChange={event => setShift(event.target.value)} className={machineNvlFormFieldClass}>
                  <option value="">Chọn ca</option>
                  {shiftOptions.map(option => (
                    <option key={option} value={option}>
                      {formatProductionOrderShiftLabel(option, shiftSettings)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${machineNvlFormLabelClass} lg:col-span-2`}>
                Máy
                <div className="mt-1 min-w-0">
                  {renderMachineSelect(machineRef, setMachineRef, machines, {
                    placeholder: 'Chọn máy',
                    isLoading,
                    inputClassName: machineNvlFormControlClass
                  })}
                </div>
              </label>
              <div className={`${machineNvlFormLabelClass} lg:col-span-2`}>
                Nhân sự (chọn nhiều)
                <div className="mt-1 flex min-h-10 max-h-40 min-w-0 flex-col overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 lg:min-h-11">
                  {!date || !shift || !machineRef.trim() ? (
                    <p className="flex flex-1 items-center px-1 text-[11px] font-semibold leading-tight text-zinc-400">
                      Chọn ngày, ca và máy trước.
                    </p>
                  ) : staffOptions.length === 0 ? (
                    <p className="flex flex-1 items-center px-1 text-[11px] font-semibold leading-tight text-zinc-400">
                      Không có nhân sự theo máy/ca/ngày.
                    </p>
                  ) : (
                    staffOptions.map(option => {
                      const checked = selectedStaffNames.includes(option);
                      return (
                        <label
                          key={option}
                          className={`mb-1 flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold transition last:mb-0 ${
                            checked
                              ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                              : 'border-zinc-200 bg-white text-zinc-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStaffName(option)}
                            className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                          />
                          <span className="font-black">{option}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <label className={`${machineNvlFormLabelClass} col-span-2 lg:col-span-2`}>
                Ghi chú
                <textarea
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Ghi chú chung"
                  rows={2}
                  className="mt-1 min-h-10 w-full resize-y rounded-lg border border-zinc-200 px-2 py-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 lg:min-h-11 lg:px-3 lg:text-sm"
                />
              </label>
            </div>

            {isDauCaTab ? (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-sky-900">Điền từ báo cáo tồn cuối ca</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-sky-800/80">
                    Nhấn nút để mở bộ lọc Ngày · Ca · Máy và chọn phiếu tồn cuối ca cần điền.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCuoiCaPickerModal}
                  disabled={isLoading}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 text-[11px] font-extrabold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Tự điền tồn đầu ca
                </button>
              </div>
            ) : null}

            <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-200 md:mt-4 md:rounded-xl">
              <div
                className={`hidden md:grid gap-2 ${isDauCaTab ? MACHINE_NVL_DAU_CA_GRID : MACHINE_NVL_CUOI_CA_GRID} bg-zinc-950 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white md:min-w-[1120px]`}
              >
                <span>STT</span>
                <span>Mã NVL</span>
                <span>Tên NVL</span>
                <span>ĐVT</span>
                <span>Loại vật tư</span>
                <span>Tồn máy</span>
                <span>Tồn bồn</span>
                <span>Chưa trộn</span>
                <span>Tồn ngoài</span>
                <span>{isDauCaTab ? 'Tổng tồn đầu ca' : 'Tổng tồn cuối ca'}</span>
                <span>Khối lượng định mức</span>
                <span>SL tồn thực tế (kg)</span>
                <span>Ghi chú</span>
                <span></span>
              </div>
              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
                  <p className="text-sm font-bold text-zinc-500">Chưa có dòng NVL nào.</p>
                  <button
                    type="button"
                    onClick={() => setLines(prev => [...prev, emptyMachineNvlLine()])}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-extrabold text-zinc-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm dòng NVL
                  </button>
                </div>
              ) : null}
              <div className="divide-y divide-zinc-100">
                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className="min-w-0 max-w-full px-1 py-1.5 md:px-3 md:py-2 md:min-w-[1120px]"
                  >
                    <div className="mb-1.5 flex min-w-0 items-center gap-1.5 md:hidden">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-500 text-[10px] font-black text-white">
                        {index + 1}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight text-zinc-800" title={line.name || line.code || undefined}>
                        {line.name || (line.code ? line.code : 'Chọn mã NVL')}
                      </p>
                      <button
                        type="button"
                        onClick={() => setLines(prev => prev.length > 1 ? prev.filter(item => item.key !== line.key) : prev)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                        title="Xóa dòng"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="machine-nvl-line-mobile-grid grid grid-cols-4 gap-0.5 md:hidden">
                      <label className="field-cell col-span-3">
                        <span className="machine-nvl-line-mobile-label">Mã NVL</span>
                        <div className="min-w-0 max-w-full">
                        <SearchableSelect
                          value={line.code}
                          onChange={value => {
                            const material = findMaterialByCode(materials, value);
                            if (material) {
                              selectMaterial(line.key, material);
                              return;
                            }
                            updateLine(line.key, { code: value, name: '', unit: '' });
                          }}
                          options={materials}
                          placeholder="Mã"
                          isLoading={isLoading}
                          displaySelectedAsValue
                          inputClassName="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-1.5 text-[10px] font-bold outline-none focus:border-[#ef1b2d]"
                          getLabel={item => (item as MaterialRow).code}
                          getSearchText={item => {
                            const material = item as MaterialRow;
                            return `${material.code} ${material.name}`;
                          }}
                          getOptionLabel={item => {
                            const material = item as MaterialRow;
                            return `${material.code} — ${material.name}`;
                          }}
                          getValue={item => (item as MaterialRow).code}
                          onSelectOption={item => selectMaterial(line.key, item as MaterialRow | null)}
                        />
                        </div>
                      </label>
                      <label className="field-cell col-span-1">
                        <span className="machine-nvl-line-mobile-label">ĐVT</span>
                        <input value={line.unit} readOnly className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-0.5 text-center text-[10px] font-semibold text-zinc-700 outline-none" />
                      </label>
                      <label className="field-cell col-span-4">
                        <span className="machine-nvl-line-mobile-label">Loại vật tư</span>
                        <select
                          value={line.materialType}
                          onChange={event => updateLine(line.key, { materialType: event.target.value as MachineNvlMaterialType | '' })}
                          className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-1.5 text-[10px] font-bold outline-none focus:border-[#ef1b2d]"
                        >
                          <option value="">-- Chọn --</option>
                          {MACHINE_NVL_MATERIAL_TYPE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">Tồn máy</span>
                        <input type="number" min="0" step="0.01" value={line.inMachineQuantity} onChange={event => updateLine(line.key, { inMachineQuantity: event.target.value })} className={machineNvlLineMobileQtyClass} />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">Tồn bồn</span>
                        <input type="number" min="0" step="0.01" value={line.inMixerQuantity} onChange={event => updateLine(line.key, { inMixerQuantity: event.target.value })} className={machineNvlLineMobileQtyClass} />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">Chưa trộn</span>
                        <input type="number" min="0" step="0.01" value={line.unblendedQuantity} onChange={event => updateLine(line.key, { unblendedQuantity: event.target.value })} className={machineNvlLineMobileQtyClass} />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">Tồn ngoài</span>
                        <input type="number" min="0" step="0.01" value={line.outsideQuantity} onChange={event => updateLine(line.key, { outsideQuantity: event.target.value })} className={machineNvlLineMobileQtyClass} />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">Tổng</span>
                        <input
                          value={formatMachineNvlQuantityValue(resolveMachineNvlLineQty(line))}
                          readOnly
                          className={machineNvlLineMobileQtyReadonlyClass}
                        />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">KL định mức</span>
                        <input
                          value={
                            resolveMachineNvlLineUnitWeightKg(line, materials) > 0
                              ? formatMachineNvlQuantityValue(resolveMachineNvlLineUnitWeightKg(line, materials))
                              : line.unitWeightKg || '—'
                          }
                          readOnly
                          title="Khối lượng định mức từ bảng kho NVL theo mã"
                          className={machineNvlLineMobileQtyReadonlyClass}
                        />
                      </label>
                      <label className="field-cell">
                        <span className="machine-nvl-line-mobile-label">SL thực tế</span>
                        <input
                          value={formatMachineNvlQuantityValue(resolveMachineNvlLineActualKg(line, materials))}
                          readOnly
                          title="Số lượng × Khối lượng định mức (kho NVL theo mã)"
                          className={machineNvlLineMobileQtyReadonlyClass}
                        />
                      </label>
                      <label className="field-cell col-span-4">
                        <span className="machine-nvl-line-mobile-label">Ghi chú</span>
                        <textarea
                          value={line.note}
                          onChange={event => updateLine(line.key, { note: event.target.value })}
                          rows={2}
                          className="machine-nvl-line-mobile-input min-h-[40px] w-full min-w-0 resize-y rounded-md border border-zinc-200 px-1 py-1 text-[10px] font-semibold outline-none focus:border-[#ef1b2d]"
                        />
                      </label>
                    </div>
                    <div
                      className={`hidden md:grid gap-2 ${isDauCaTab ? MACHINE_NVL_DAU_CA_GRID : MACHINE_NVL_CUOI_CA_GRID} items-center md:min-w-[1120px]`}
                    >
                    <span className="min-w-0 font-mono text-sm font-black text-[#ef1b2d]">{index + 1}</span>
                    <div className="min-w-0">
                    <SearchableSelect
                      value={line.code}
                      onChange={value => {
                        const material = findMaterialByCode(materials, value);
                        if (material) {
                          selectMaterial(line.key, material);
                          return;
                        }
                        updateLine(line.key, { code: value, name: '', unit: '' });
                      }}
                      options={materials}
                      placeholder="Mã NVL"
                      isLoading={isLoading}
                      displaySelectedAsValue
                      inputClassName="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-bold outline-none focus:border-[#ef1b2d]"
                      getLabel={item => (item as MaterialRow).code}
                      getSearchText={item => {
                        const material = item as MaterialRow;
                        return `${material.code} ${material.name}`;
                      }}
                      getOptionLabel={item => {
                        const material = item as MaterialRow;
                        return `${material.code} — ${material.name}`;
                      }}
                      getValue={item => (item as MaterialRow).code}
                      onSelectOption={item => selectMaterial(line.key, item as MaterialRow | null)}
                    />
                    </div>
                    <input value={line.name} readOnly className="min-w-0 h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700 outline-none" />
                    <input value={line.unit} onChange={event => updateLine(line.key, { unit: event.target.value })} className="min-w-0 h-10 rounded-lg border border-zinc-200 px-3 text-sm font-semibold outline-none focus:border-[#ef1b2d]" />
                    <select
                      value={line.materialType}
                      onChange={event => updateLine(line.key, { materialType: event.target.value as MachineNvlMaterialType | '' })}
                      className="min-w-0 h-10 rounded-lg border border-zinc-200 px-2 text-sm font-semibold outline-none focus:border-[#ef1b2d]"
                    >
                      <option value="">-- Chọn --</option>
                      {MACHINE_NVL_MATERIAL_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.inMachineQuantity}
                      onChange={event => updateLine(line.key, { inMachineQuantity: event.target.value })}
                      className={machineNvlLineDesktopQtyClass}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.inMixerQuantity}
                      onChange={event => updateLine(line.key, { inMixerQuantity: event.target.value })}
                      className={machineNvlLineDesktopQtyClass}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unblendedQuantity}
                      onChange={event => updateLine(line.key, { unblendedQuantity: event.target.value })}
                      className={machineNvlLineDesktopQtyClass}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.outsideQuantity}
                      onChange={event => updateLine(line.key, { outsideQuantity: event.target.value })}
                      className={machineNvlLineDesktopQtyClass}
                      title="Tồn ngoài máy (kho tạm gần máy, chưa nạp vào máy/bồn)"
                    />
                    <input
                      value={formatMachineNvlQuantityValue(resolveMachineNvlLineQty(line))}
                      readOnly
                      className={machineNvlLineDesktopQtyReadonlyClass}
                    />
                    <input
                      value={
                        resolveMachineNvlLineUnitWeightKg(line, materials) > 0
                          ? formatMachineNvlQuantityValue(resolveMachineNvlLineUnitWeightKg(line, materials))
                          : line.unitWeightKg || '—'
                      }
                      readOnly
                      title="Khối lượng định mức từ bảng kho NVL theo mã"
                      className={machineNvlLineDesktopQtyReadonlyClass}
                    />
                    <input
                      value={formatMachineNvlQuantityValue(resolveMachineNvlLineActualKg(line, materials))}
                      readOnly
                      title="Số lượng × Khối lượng định mức (kho NVL theo mã)"
                      className={machineNvlLineDesktopQtyReadonlyClass}
                    />
                    <textarea
                      value={line.note}
                      onChange={event => updateLine(line.key, { note: event.target.value })}
                      rows={2}
                      className="min-h-[40px] min-w-0 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#ef1b2d]"
                    />
                    <button type="button" onClick={() => setLines(prev => prev.length > 1 ? prev.filter(item => item.key !== line.key) : prev)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] hover:bg-red-50" title="Xóa dòng">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    </div>
                  </div>
                ))}
              </div>
              {isDauCaTab && previousCuoiCaReport ? (
                <p className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                  Tham chiếu cuối ca gần nhất: {previousCuoiCaReport.ngay} · {previousCuoiCaReport.ca} ·{' '}
                  {previousCuoiCaReport.tenMay || previousCuoiCaReport.maMay}
                </p>
              ) : null}
            </div>

            <div className="mt-3 space-y-2">
              {message ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-center text-[11px] font-bold text-rose-700">
                  {message}
                </p>
              ) : null}
              <div className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => setLines(prev => [...prev, emptyMachineNvlLine()])}
                  className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-extrabold text-zinc-800 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Thêm dòng NVL</span>
                </button>
                {editingReportId ? (
                  <button
                    type="button"
                    onClick={cancelEditReport}
                    className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-extrabold text-zinc-700 transition hover:border-zinc-400"
                  >
                    <span className="truncate">Hủy sửa</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => printReportPayload(buildCurrentPrintReport())}
                  disabled={!canPrintCurrentReport}
                  className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-extrabold text-zinc-700 transition hover:border-zinc-400 disabled:opacity-60"
                >
                  <Printer className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">In phiếu</span>
                </button>
                <button
                  type="button"
                  onClick={saveReport}
                  disabled={isSaving}
                  className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-[#ef1b2d] px-2 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Save className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{editingReportId ? 'Cập nhật' : 'Lưu báo cáo'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
        {printReport && <MachineNvlPrintBatch reports={[printReport]} />}
      </div>

      {showCuoiCaPicker ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  Chọn phiếu tồn cuối ca
                </h3>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Lọc Ngày · Ca · Máy rồi chọn phiếu trong sổ xuống để điền tồn đầu ca.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCuoiCaPickerModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={machineNvlFormLabelClass}>
                  Ngày phiếu cuối ca
                  <input
                    type="date"
                    value={pickerNgay}
                    onChange={event => setPickerNgay(event.target.value)}
                    className={machineNvlFormFieldClass}
                  />
                </label>
                <label className={machineNvlFormLabelClass}>
                  Ca
                  <select
                    value={pickerCa}
                    onChange={event => setPickerCa(event.target.value)}
                    className={machineNvlFormFieldClass}
                  >
                    <option value="">Tất cả ca</option>
                    {shiftOptions.map(option => (
                      <option key={option} value={option}>
                        {formatProductionOrderShiftLabel(option, shiftSettings)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${machineNvlFormLabelClass} sm:col-span-2`}>
                  Máy
                  <div className="mt-1 min-w-0">
                    {renderMachineSelect(pickerMachineRef, setPickerMachineRef, machines, {
                      placeholder: 'Tất cả máy',
                      isLoading,
                      inputClassName: machineNvlFormControlClass
                    })}
                  </div>
                </label>
              </div>

              <label className={machineNvlFormLabelClass}>
                Phiếu tồn cuối ca
                <select
                  value={pickerReportId}
                  onChange={event => setPickerReportId(event.target.value)}
                  className={machineNvlFormFieldClass}
                >
                  <option value="">
                    {pickerCuoiCaOptions.length === 0
                      ? 'Không có phiếu khớp bộ lọc'
                      : `Chọn phiếu (${pickerCuoiCaOptions.length})`}
                  </option>
                  {pickerCuoiCaOptions.map(report => (
                    <option key={report.id} value={report.id}>
                      {formatMachineNvlCuoiCaOptionLabel(report)}
                    </option>
                  ))}
                </select>
              </label>

              {pickerReportId ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
                  Đã chọn:{' '}
                  {formatMachineNvlCuoiCaOptionLabel(
                    pickerCuoiCaOptions.find(report => report.id === pickerReportId) ||
                      cuoiCaReports.find(report => report.id === pickerReportId) || {
                        id: pickerReportId,
                        ngay: '—',
                        ca: '—',
                        gio: '',
                        maMay: '',
                        tenMay: '—',
                        nhanSu: '',
                        total: NaN,
                        note: '',
                        reportKind: 'cuoi_ca',
                        lines: [],
                        createdAt: ''
                      }
                  )}
                </p>
              ) : (
                <p className="text-[11px] font-semibold text-zinc-500">
                  Có thể để trống Ngày/Ca/Máy để xem toàn bộ phiếu tồn cuối ca.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-zinc-200 px-4 py-3">
              <button
                type="button"
                onClick={closeCuoiCaPickerModal}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={applySelectedCuoiCaReport}
                disabled={!pickerReportId}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-700 text-xs font-extrabold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Điền vào form
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

