import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { ClipboardList, Loader2, Plus, Printer, Save, Trash2, Wand2, X } from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import { uploadImage } from '../_shared/recordHelpers';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import {
  MachineNvlPrintBatch,
  buildMachineNvlPrintReportFromForm,
  type MachineNvlPrintReport
} from '../../components/MachineNvlPrintSheet';
import {
  buildPreviousShiftQuantityMap,
  findDuplicateMachineNvlTonReport,
  findLatestPreviousCuoiCaReport,
  formatMachineNvlDuplicateSaveMessage,
  guessMachineNvlMaterialType,
  machineNvlReportMatchesMachine,
  normalizeMachineNvlReports,
  MACHINE_NVL_MATERIAL_TYPE_OPTIONS,
  type MachineNvlMaterialType,
  type MachineNvlReportKind,
  type MachineNvlSavedLine,
  type MachineNvlSavedReport
} from '../../utils/machineNvlReports';
import { shiftNamesMatch } from '../../utils/shiftSettings';
import { normalizeProductCodeKey } from '../san-pham/types';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../../utils/printReady';
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
import { useReportFormsSharedOptional } from '../report-forms/ReportFormsSharedContext';

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
  imageUrl: string;
  imagePublicId: string;
  imagePreview: string;
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
  note: '',
  imageUrl: '',
  imagePublicId: '',
  imagePreview: ''
});

function machineNvlLineHasContent(line: MachineNvlReportLine) {
  return Boolean(
    line.code.trim() ||
      line.name.trim() ||
      parseMachineNvlNumber(line.inMachineQuantity) > 0 ||
      parseMachineNvlNumber(line.inMixerQuantity) > 0 ||
      parseMachineNvlNumber(line.unblendedQuantity) > 0 ||
      parseMachineNvlNumber(line.outsideQuantity) > 0 ||
      parseMachineNvlNumber(line.standardQuantity) > 0 ||
      parseMachineNvlNumber(line.quantity) > 0
  );
}

function machineNvlLineImageSrc(line: Pick<MachineNvlReportLine, 'imageUrl' | 'imagePreview'>) {
  return String(line.imageUrl || line.imagePreview || '').trim();
}

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

export { machineNvlReportMatchesMachine, findLatestPreviousCuoiCaReport, buildPreviousShiftQuantityMap };

export function machineNvlTextKey(value: string) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

export function machineNvlShiftKey(value: string) {
  return machineNvlTextKey(String(value ?? '').replace(/\([^)]*\)/g, '').replace(/^ca\s*/i, 'ca'));
}

export function machineNvlShiftMatches(orderShift: string, selectedShift: string) {
  return shiftNamesMatch(orderShift, selectedShift);
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

export function formatMachineNvlSourceOptionLabel(report: MachineNvlSavedReport) {
  const machine = report.tenMay || report.maMay || 'Máy';
  const total = Number.isFinite(report.total) ? `${formatNumber(report.total)} kg` : '—';
  return `${report.ngay} · ${report.ca || '—'} · ${machine} · ${total} · ${report.lines.length} NVL`;
}

/** @deprecated Dùng formatMachineNvlSourceOptionLabel */
export const formatMachineNvlCuoiCaOptionLabel = formatMachineNvlSourceOptionLabel;

export function filterMachineNvlReportsForPicker(
  reports: MachineNvlSavedReport[],
  kind: MachineNvlReportKind,
  filters: { ngay: string; ca: string; machineRef: string },
  machines: MachineRow[]
) {
  const ngay = filters.ngay.trim();
  const ca = filters.ca.trim();
  const machineRef = filters.machineRef.trim();
  const selectedMachine = machineRef ? findMachineByRef(machines, machineRef) : null;

  return reports
    .filter(report => report.reportKind === kind)
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

export function filterCuoiCaReportsForPicker(
  reports: MachineNvlSavedReport[],
  filters: { ngay: string; ca: string; machineRef: string },
  machines: MachineRow[]
) {
  return filterMachineNvlReportsForPicker(reports, 'cuoi_ca', filters, machines);
}

export function filterDauCaReportsForPicker(
  reports: MachineNvlSavedReport[],
  filters: { ngay: string; ca: string; machineRef: string },
  machines: MachineRow[]
) {
  return filterMachineNvlReportsForPicker(reports, 'dau_ca', filters, machines);
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
const machineNvlFormControlClass =
  'h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-red-500/10';
const machineNvlFormFieldClass = `mt-0.5 ${machineNvlFormControlClass}`;
const machineNvlFormLabelClass =
  'block min-w-0 text-[10px] font-black uppercase tracking-wider text-zinc-500';

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
    note: line.ghiChu,
    imageUrl: line.hinhAnh,
    imagePublicId: line.hinhAnhPublicId,
    imagePreview: line.hinhAnh
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

/** Tồn đầu ca → dòng tồn cuối ca (mã NVL + SL đầu làm tham chiếu; SL vị trí để trống). */
export function savedDauCaLineToCuoiCaFormLine(line: MachineNvlSavedLine): MachineNvlReportLine {
  const base = savedMachineNvlLineToFormLine(line);
  return {
    ...base,
    previousQuantity: formatMachineNvlQuantityValue(line.soLuongTon),
    inMachineQuantity: '',
    inMixerQuantity: '',
    unblendedQuantity: '',
    outsideQuantity: '',
    standardQuantity: '',
    quantity: '',
    note: ''
  };
}

/**
 * Gợi ý tồn cuối ca từ phiếu tồn đầu ca — lọc **Ngày + Ca**, không theo máy.
 * Gộp mã NVL trùng từ mọi máy cùng ngày/ca.
 */
export function buildCuoiCaSuggestionLinesFromDauCa(input: {
  reports: MachineNvlSavedReport[];
  date: string;
  shift: string;
}): MachineNvlReportLine[] {
  const dateIso = String(input.date || '').slice(0, 10);
  if (!dateIso || !input.shift.trim()) return [];

  const matched = input.reports
    .filter(report => report.reportKind === 'dau_ca')
    .filter(report => String(report.ngay || '').slice(0, 10) === dateIso)
    .filter(report => machineNvlShiftMatches(report.ca, input.shift))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const byKey = new Map<string, MachineNvlReportLine>();
  for (const report of matched) {
    for (const line of report.lines) {
      const code = String(line.maNvl || '').trim();
      const name = String(line.tenNvl || '').trim();
      if (!code && !name) continue;
      const key = normalizeProductCodeKey(code) || `name:${name.toLowerCase()}`;
      if (byKey.has(key)) continue;
      byKey.set(key, savedDauCaLineToCuoiCaFormLine(line));
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.code.localeCompare(b.code, 'vi') || a.name.localeCompare(b.name, 'vi')
  );
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
  const hubShared = useReportFormsSharedOptional();
  const hideLocalHeader = Boolean(hubShared);
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
  const [lines, setLines] = useState<MachineNvlReportLine[]>(() => [emptyMachineNvlLine()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<MachineNvlPrintReport | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  /** null = đóng; chỉ dùng cho đầu ca (chọn phiếu tồn cuối ca kế thừa). */
  const [autofillPickerKind, setAutofillPickerKind] = useState<'cuoi_ca' | null>(null);
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

    const applyJson = async (res: Response) => {
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };

    const load = async () => {
      setIsLoading(true);

      // Khởi động song song; mở form ngay khi máy + ca sẵn sàng (không chờ NVL / LSX / sổ).
      const machinesP = fetch('/api/danh-sach-may').then(applyJson);
      const settingsP = fetch('/api/cai-dat').then(applyJson);
      const materialsP = fetch('/api/kho-nvl?light=1').then(applyJson);
      const productionP = fetch('/api/lenh-sx?light=1').then(applyJson);
      const dauCaP = fetch('/api/bao-cao-may-nvl-ton?limit=100&loai_bao_cao=dau_ca').then(applyJson);
      const cuoiCaP = fetch('/api/bao-cao-may-nvl-ton?limit=100&loai_bao_cao=cuoi_ca').then(applyJson);

      try {
        const [machineResult, settingsResult] = await Promise.all([machinesP, settingsP]);
        if (!alive) return;
        if (machineResult.res.ok) setMachines(normalizeMachines(machineResult.data));
        if (settingsResult.res.ok) setShiftSettings(mapProductionOrderSettings(settingsResult.data));
      } finally {
        if (alive) setIsLoading(false);
      }

      if (!alive) return;

      void materialsP.then(({ res, data }) => {
        if (!alive || !res.ok) return;
        setMaterials(normalizeMaterialsInventory(data));
      });

      void Promise.all([productionP, dauCaP, cuoiCaP]).then(([productionResult, dauCaResult, cuoiCaResult]) => {
        if (!alive) return;
        if (productionResult.res.ok) setProductionOrders(normalizeProductionOrders(productionResult.data));
        const dauCaList = dauCaResult.res.ok ? normalizeMachineNvlReports(dauCaResult.data) : [];
        const cuoiCaList = cuoiCaResult.res.ok ? normalizeMachineNvlReports(cuoiCaResult.data) : [];
        setDauCaReports(dauCaList);
        setCuoiCaReports(cuoiCaList);
        setReports(activeKind === 'dau_ca' ? dauCaList : cuoiCaList);
      });
    };

    load();
    return () => {
      alive = false;
    };
    // Chỉ load lần đầu mount — đổi tab đầu/cuối dùng state đã có, không gọi lại API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setReports(activeKind === 'dau_ca' ? dauCaReports : cuoiCaReports);
  }, [activeKind, dauCaReports, cuoiCaReports]);

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
    const nextMachineRef = found ? machineSelectValue(found) : report.tenMay || report.maMay;
    const nextStaff = splitProductionOrderStaffNames(report.nhanSu);
    setActiveKind(report.reportKind);
    setEditingReportId(report.id);
    setDate(report.ngay || machineNvlToday());
    setShift(report.ca);
    setMachineRef(nextMachineRef);
    setSelectedStaffNames(nextStaff);
    setNote(report.note);
    setLines(
      report.lines.length > 0 ? report.lines.map(savedMachineNvlLineToFormLine) : [emptyMachineNvlLine()]
    );
    setMessage('');
    hubShared?.applyFromForm({
      ngay: report.ngay || machineNvlToday(),
      ca: report.ca,
      machineRef: nextMachineRef,
      staffNames: nextStaff,
      ghiChu: report.note
    });
  };

  useEffect(() => {
    if (!hubShared) return;
    setDate(hubShared.ngay);
    setShift(hubShared.ca);
    setMachineRef(hubShared.machineRef);
    setSelectedStaffNames(hubShared.staffNames);
    setNote(hubShared.ghiChu);
  }, [
    hubShared,
    hubShared?.ngay,
    hubShared?.ca,
    hubShared?.machineRef,
    hubShared?.staffNames,
    hubShared?.ghiChu
  ]);

  useEffect(() => {
    if (!editReport || machines.length === 0) return;
    applyEditReport(editReport);
    onEditConsumed?.();
  }, [editReport, machines, onEditConsumed]);

  const switchReportKind = (kind: MachineNvlReportKind) => {
    if (kind === activeKind) return;
    setActiveKind(kind);
    setEditingReportId(null);
    setLines([emptyMachineNvlLine()]);
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
    // Hub shared header owns staff selection when embedded.
    if (hubShared) return;
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
  }, [date, hubShared, machineRef, shift, staffOptions]);

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

  const pickerSourceOptions = useMemo(
    () =>
      autofillPickerKind === 'cuoi_ca'
        ? filterCuoiCaReportsForPicker(
            cuoiCaReports,
            { ngay: pickerNgay, ca: pickerCa, machineRef: pickerMachineRef },
            machines
          )
        : [],
    [autofillPickerKind, cuoiCaReports, pickerNgay, pickerCa, pickerMachineRef, machines]
  );

  useEffect(() => {
    if (!autofillPickerKind) return;
    if (!pickerReportId) return;
    if (pickerSourceOptions.some(report => report.id === pickerReportId)) return;
    setPickerReportId('');
  }, [autofillPickerKind, pickerSourceOptions, pickerReportId]);

  const openCuoiCaPickerForDauCa = () => {
    setPickerNgay('');
    setPickerCa('');
    setPickerMachineRef('');
    setPickerReportId('');
    setAutofillPickerKind('cuoi_ca');
  };

  const closeAutofillPicker = () => {
    setAutofillPickerKind(null);
    setPickerReportId('');
  };

  /** Đầu ca: giữ logic cũ — điền từ phiếu tồn cuối ca. */
  const applySelectedCuoiCaReport = () => {
    if (!isDauCaTab || autofillPickerKind !== 'cuoi_ca') return;
    const selected =
      pickerSourceOptions.find(report => report.id === pickerReportId) ??
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
    closeAutofillPicker();
    showAppToast(`Đã điền ${nextLines.length} dòng từ tồn cuối ca ${sourceLabel}.`);
  };

  /** Cuối ca: gợi ý từ tồn đầu ca cùng Ngày + Ca (không lọc máy). */
  const autofillCuoiCaFromDauCa = () => {
    if (isDauCaTab) return;
    if (!date.trim() || !shift.trim()) {
      const msg = 'Chọn Ngày và Ca trước khi tự điền từ tồn đầu ca.';
      setMessage(msg);
      showAppToast(msg, 'error');
      return;
    }
    if (
      lines.some(line => line.code.trim() || resolveMachineNvlLineQty(line) > 0) &&
      !window.confirm(
        'Điền lại danh sách NVL từ tồn đầu ca?\nCác dòng hiện tại trên form sẽ bị thay thế.'
      )
    ) {
      return;
    }

    const nextLines = buildCuoiCaSuggestionLinesFromDauCa({
      reports: dauCaReports,
      date,
      shift
    });
    if (nextLines.length === 0) {
      const msg = `Không có phiếu tồn đầu ca khớp ${date} · ${shift}.`;
      setMessage(msg);
      showAppToast(msg, 'error');
      return;
    }

    setLines(nextLines);
    setNote(prev => {
      const stamp = `Gợi ý từ tồn đầu ca ${date} · ${shift} (mọi máy)`;
      if (!prev.trim()) return stamp;
      if (prev.includes('Gợi ý từ tồn đầu ca')) return stamp;
      return `${prev}\n${stamp}`;
    });
    setMessage('');
    showAppToast(`Đã gợi ý ${nextLines.length} NVL từ tồn đầu ca.`);
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

  const resolveLineImagesForSave = async (sourceLines: MachineNvlReportLine[]) => {
    const resolved: MachineNvlReportLine[] = [];
    for (const line of sourceLines) {
      if (line.imageUrl.trim()) {
        resolved.push(line);
        continue;
      }
      const preview = line.imagePreview.trim();
      if (preview.startsWith('data:')) {
        const uploaded = await uploadImage(preview, 'bao_cao_may_nvl_ton');
        resolved.push({
          ...line,
          imageUrl: uploaded.imageUrl,
          imagePublicId: uploaded.imagePublicId,
          imagePreview: uploaded.imageUrl
        });
      } else {
        resolved.push(line);
      }
    }
    return resolved;
  };

  const saveReport = async ({ printAfterSave = false }: { printAfterSave?: boolean } = {}) => {
    setMessage('');
    const reportToPrint = printAfterSave ? buildCurrentPrintReport() : null;

    const activeLines = lines.filter(machineNvlLineHasContent);
    if (!date || !shift || !machineRef.trim() || activeLines.length === 0) {
      setMessage(showSaveFailure('Vui lòng chọn ngày, ca, máy và nhập ít nhất một dòng NVL tồn.'));
      return;
    }

    setIsSaving(true);
    let resolvedLines = lines;
    try {
      resolvedLines = await resolveLineImagesForSave(lines);
      setLines(resolvedLines);
    } catch (error: unknown) {
      setIsSaving(false);
      setMessage(showSaveFailure(error, 'Không thể upload ảnh trước khi lưu.'));
      return;
    }

    const materialLines = resolvedLines
      .map((line, index) => {
        const row: Record<string, unknown> = {
          stt: index + 1,
          ma_nvl: line.code.trim(),
          ten_nvl: line.name.trim(),
          don_vi: line.unit.trim() || 'kg',
          hinh_anh: machineNvlLineImageSrc(line) || null,
          hinh_anh_public_id: line.imagePublicId.trim() || null,
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
      .filter(line =>
        Boolean(
          line.ma_nvl ||
            line.ten_nvl ||
            Number(line.so_luong_trong_may) > 0 ||
            Number(line.so_luong_trong_bon_tron) > 0 ||
            Number(line.so_luong_nl_chua_tron) > 0 ||
            Number(line.so_luong_ton_ngoai) > 0 ||
            Number(line.so_luong_ton_dinh_muc) > 0 ||
            Number(line.so_luong_ton) > 0
        )
      );

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
      setIsSaving(false);
      setMessage(
        showSaveFailure(formatMachineNvlDuplicateSaveMessage(activeKind, date, shift, machineLabel))
      );
      return;
    }

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
        setLines([emptyMachineNvlLine()]);
      }
      setNote('');
      try {
        await loadReports(activeKind);
      } catch {
        // Báo cáo đã được máy chủ lưu thành công; lỗi làm mới danh sách không chặn thông báo lưu.
      }
      if (reportToPrint) {
        printReportPayload(reportToPrint);
      }
    } catch (error: any) {
      setMessage(showSaveFailure(error, 'Không thể lưu báo cáo.'));
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEditReport = () => {
    setEditingReportId(null);
    setLines([emptyMachineNvlLine()]);
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

  useEffect(() => {
    if (!pendingPrint || !printReport) return;
    let cancelled = false;
    document.body.classList.add('machine-nvl-report-print-active');
    enablePortraitPrintPage('machine-nvl-report-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('machine-nvl-report-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('machine-nvl-report-print-active');
      disablePortraitPrintPage('machine-nvl-report-page-portrait');
    };
  }, [pendingPrint, printReport]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('machine-nvl-report-print-active');
      disablePortraitPrintPage('machine-nvl-report-page-portrait');
      setPrintReport(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('machine-nvl-report-print-active');
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-2 py-1.5 sm:px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-sm font-black text-zinc-900 sm:text-base">Báo cáo NVL tồn theo máy</h1>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-right">
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Tổng tồn</span>
            <span className="text-sm font-black tabular-nums text-emerald-900">{formatNumber(totalWeightKg)} kg</span>
          </div>
        </div>
        <div className="mt-1.5 flex items-end gap-1 overflow-x-auto scrollbar-thin">
          {MACHINE_NVL_REPORT_TABS.map((tab, index) => {
            const active = activeKind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchReportKind(tab.id)}
                className={`relative inline-flex h-7 min-w-0 shrink-0 items-center gap-1 rounded-t-md px-2 text-[10px] font-extrabold leading-tight transition sm:text-[11px] ${
                  active
                    ? 'z-10 -mb-px border border-b-white border-zinc-200 bg-white text-zinc-900'
                    : 'mb-px border border-transparent bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-[#ef1b2d]'
                }`}
              >
                <span
                  className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-0.5 text-[9px] font-black tabular-nums ${
                    active ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
          {onOpenList ? (
            <button
              type="button"
              onClick={onOpenList}
              className="mb-px inline-flex h-7 min-w-0 shrink-0 items-center justify-center gap-1 rounded-t-md border border-transparent bg-emerald-50 px-2 text-[10px] font-extrabold text-emerald-800 transition hover:bg-emerald-100 sm:text-[11px]"
            >
              <ClipboardList className="h-3 w-3 shrink-0" />
              <span className="truncate">Danh sách</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="xl:p-2">
          <section className="w-full min-w-0 max-w-full overflow-hidden border-b border-zinc-200 bg-white px-1.5 py-1.5 sm:px-2 sm:py-2 xl:rounded-b-xl xl:rounded-tr-xl xl:border xl:border-t-0 xl:p-2.5 xl:shadow-sm">
            {editingReportId ? (
              <p className="mb-1.5 text-[11px] font-semibold text-[#ef1b2d]">
                Đang sửa {activeTabMeta.label.toLowerCase()} · bấm Cập nhật để lưu
              </p>
            ) : null}
            {!hideLocalHeader ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
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
              <label className={machineNvlFormLabelClass}>
                Máy
                <div className="mt-0.5 min-w-0">
                  {renderMachineSelect(machineRef, setMachineRef, machines, {
                    placeholder: 'Chọn máy',
                    isLoading,
                    inputClassName: machineNvlFormControlClass
                  })}
                </div>
              </label>
              <div className={`${machineNvlFormLabelClass} col-span-2 sm:col-span-2 lg:col-span-2`}>
                Nhân sự
                <div className="mt-0.5 flex max-h-20 min-h-8 min-w-0 flex-wrap content-start gap-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-1">
                  {!date || !shift || !machineRef.trim() ? (
                    <p className="flex items-center px-1 text-[10px] font-semibold leading-tight text-zinc-400">
                      Chọn ngày, ca và máy trước
                    </p>
                  ) : staffOptions.length === 0 ? (
                    <p className="flex items-center px-1 text-[10px] font-semibold leading-tight text-zinc-400">
                      Không có nhân sự theo máy/ca/ngày
                    </p>
                  ) : (
                    staffOptions.map(option => {
                      const checked = selectedStaffNames.includes(option);
                      return (
                        <label
                          key={option}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                            checked
                              ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                              : 'border-zinc-200 bg-white text-zinc-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStaffName(option)}
                            className="h-3 w-3 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                          />
                          <span className="font-bold">{option}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <label className={`${machineNvlFormLabelClass} col-span-2 sm:col-span-1 lg:col-span-1`}>
                Ghi chú
                <input
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="Ghi chú chung"
                  className={machineNvlFormFieldClass}
                />
              </label>
            </div>
            ) : null}

            {isDauCaTab ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-2 py-1">
                <p className="min-w-0 flex-1 text-[10px] font-semibold text-sky-900">
                  <span className="font-black">Tự điền đầu ca</span>
                  <span className="text-sky-800/80"> · từ phiếu tồn cuối ca trước</span>
                </p>
                <button
                  type="button"
                  onClick={openCuoiCaPickerForDauCa}
                  disabled={isLoading}
                  className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-sky-700 px-2.5 text-[10px] font-extrabold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 className="h-3 w-3" />
                  Tự điền
                </button>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1">
                <p className="min-w-0 flex-1 text-[10px] font-semibold text-amber-950">
                  <span className="font-black">Tự điền cuối ca</span>
                  <span className="text-amber-900/80"> · NVL từ tồn đầu ca (Ngày · Ca)</span>
                </p>
                <button
                  type="button"
                  onClick={autofillCuoiCaFromDauCa}
                  disabled={isLoading}
                  className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-amber-700 px-2.5 text-[10px] font-extrabold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Wand2 className="h-3 w-3" />
                  Tự điền
                </button>
              </div>
            )}

            <div className="mt-1.5 min-w-0 max-w-full overflow-hidden rounded-md border border-zinc-200">
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
              {lines.length > 0 ? (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-[10px]">
                    <thead className="sticky top-0 z-10 bg-zinc-100 text-[10px] font-black uppercase text-zinc-600 shadow-[0_1px_0_#e4e4e7]">
                      <tr>
                        {['STT', 'Mã NVL', 'Tên NVL', 'Loại vật tư', 'Tồn máy', 'Tồn bồn', 'Chưa trộn', 'Tồn ngoài', 'Tổng', 'KL định mức', 'SL thực tế (kg)', 'Ghi chú', ''].map(
                          (title, i) => (
                            <th key={i} className="whitespace-nowrap px-1.5 py-2 text-left">
                              {title}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {lines.map((line, index) => {
                        const unitWeightKg = resolveMachineNvlLineUnitWeightKg(line, materials);
                        return (
                          <tr key={line.key} className="align-top">
                            <td className="px-1.5 py-1.5">
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 text-[10px] font-black text-white">
                                {index + 1}
                              </span>
                            </td>
                            <td className="min-w-[150px] px-1.5 py-1.5">
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
                                preferValueMatch
                                isLoading={isLoading}
                                displaySelectedAsValue
                                dropdownMinWidth={460}
                                autoFlip
                                inputClassName="h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-1 text-[10px] font-bold outline-none focus:border-[#ef1b2d]"
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
                              <p className="mt-0.5 truncate text-[9px] font-semibold text-zinc-500">
                                {line.unit ? `ĐVT: ${line.unit}` : 'ĐVT: —'}
                              </p>
                            </td>
                            <td className="min-w-[180px] px-1.5 py-1.5">
                              <input
                                value={line.name}
                                readOnly
                                placeholder="Tự điền theo mã"
                                title={line.name || undefined}
                                className="h-8 w-full min-w-0 truncate rounded-md border border-zinc-200 bg-zinc-50 px-1.5 text-[10px] font-bold text-zinc-800 outline-none"
                              />
                            </td>
                            <td className="min-w-[110px] px-1.5 py-1.5">
                              <select
                                value={line.materialType}
                                onChange={event =>
                                  updateLine(line.key, {
                                    materialType: event.target.value as MachineNvlMaterialType | ''
                                  })
                                }
                                className="h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-1 text-[10px] font-bold outline-none focus:border-[#ef1b2d]"
                              >
                                <option value="">-- Chọn --</option>
                                {MACHINE_NVL_MATERIAL_TYPE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {(
                              [
                                ['inMachineQuantity', line.inMachineQuantity],
                                ['inMixerQuantity', line.inMixerQuantity],
                                ['unblendedQuantity', line.unblendedQuantity],
                                ['outsideQuantity', line.outsideQuantity]
                              ] as const
                            ).map(([field, value]) => (
                              <td key={field} className="min-w-[90px] px-1.5 py-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={value}
                                  onChange={event => updateLine(line.key, { [field]: event.target.value })}
                                  className={machineNvlLineMobileQtyClass}
                                />
                              </td>
                            ))}
                            <td className="min-w-[90px] px-1.5 py-1.5">
                              <input
                                value={formatMachineNvlQuantityValue(resolveMachineNvlLineQty(line))}
                                readOnly
                                className={machineNvlLineMobileQtyReadonlyClass}
                              />
                            </td>
                            <td className="min-w-[90px] px-1.5 py-1.5">
                              <input
                                value={unitWeightKg > 0 ? formatMachineNvlQuantityValue(unitWeightKg) : line.unitWeightKg || '—'}
                                readOnly
                                title="Khối lượng định mức từ bảng kho NVL theo mã"
                                className={machineNvlLineMobileQtyReadonlyClass}
                              />
                            </td>
                            <td className="min-w-[100px] px-1.5 py-1.5">
                              <input
                                value={formatMachineNvlQuantityValue(resolveMachineNvlLineActualKg(line, materials))}
                                readOnly
                                title="Số lượng × Khối lượng định mức (kho NVL theo mã)"
                                className={machineNvlLineMobileQtyReadonlyClass}
                              />
                              {line.code && !isKgUnitValue(line.unit) && unitWeightKg <= 0 ? (
                                <span className="mt-1 block text-[9px] font-bold text-red-600">Chưa có KL quy đổi</span>
                              ) : null}
                            </td>
                            <td className="min-w-[160px] px-1.5 py-1.5">
                              <textarea
                                value={line.note}
                                onChange={event => updateLine(line.key, { note: event.target.value })}
                                rows={1}
                                className="min-h-[36px] w-full min-w-0 resize-y rounded-md border border-zinc-200 px-1 py-1 text-[10px] font-semibold outline-none focus:border-[#ef1b2d]"
                              />
                            </td>
                            <td className="px-1.5 py-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setLines(prev => (prev.length > 1 ? prev.filter(item => item.key !== line.key) : prev))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                title="Xóa dòng"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isDauCaTab && previousCuoiCaReport ? (
                <p className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                  Tham chiếu cuối ca gần nhất: {previousCuoiCaReport.ngay} · {previousCuoiCaReport.ca} ·{' '}
                  {previousCuoiCaReport.tenMay || previousCuoiCaReport.maMay}
                </p>
              ) : null}
              {!isDauCaTab && previousDauCaReport ? (
                <p className="border-t border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-500">
                  Tham chiếu đầu ca cùng ca: {previousDauCaReport.ngay} · {previousDauCaReport.ca} ·{' '}
                  {previousDauCaReport.tenMay || previousDauCaReport.maMay}
                </p>
              ) : null}
            </div>

            <div className="mt-1.5 space-y-1.5">
              {message ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-center text-[10px] font-bold text-rose-700">
                  {message}
                </p>
              ) : null}
              <div className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => setLines(prev => [...prev, emptyMachineNvlLine()])}
                  className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-extrabold text-zinc-800 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Thêm dòng NVL</span>
                </button>
                {editingReportId ? (
                  <button
                    type="button"
                    onClick={cancelEditReport}
                    className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-extrabold text-zinc-700 transition hover:border-zinc-400"
                  >
                    <span className="truncate">Hủy sửa</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveReport()}
                  disabled={isSaving}
                  className="inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-[#ef1b2d] px-2 text-[10px] font-extrabold text-white shadow-sm disabled:opacity-60 md:hidden"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Save className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate normal-case">Lưu báo cáo</span>
                </button>
                <button
                  type="button"
                  onClick={() => void saveReport({ printAfterSave: true })}
                  disabled={isSaving}
                  className="hidden h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-[#ef1b2d] px-2 text-[10px] font-extrabold text-white shadow-sm disabled:opacity-60 md:inline-flex"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Printer className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate normal-case">Lưu và in báo cáo</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {printReport && typeof document !== 'undefined'
        ? createPortal(<MachineNvlPrintBatch reports={[printReport]} />, document.body)
        : null}

      {autofillPickerKind === 'cuoi_ca' ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  Chọn phiếu tồn cuối ca
                </h3>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Lọc Ngày · Ca · Máy rồi chọn phiếu tồn cuối ca để điền tồn đầu ca.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAutofillPicker}
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

              <div className={machineNvlFormLabelClass}>
                Phiếu tồn cuối ca
                <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
                  {pickerSourceOptions.length === 0 ? (
                    <p className="px-3 py-4 text-center text-[11px] font-semibold text-zinc-500">
                      Không có phiếu khớp bộ lọc. Thử bỏ Ngày/Ca/Máy.
                    </p>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {pickerSourceOptions.map(report => {
                        const selected = pickerReportId === report.id;
                        return (
                          <button
                            key={report.id}
                            type="button"
                            onClick={() => setPickerReportId(selected ? '' : report.id)}
                            className={`block w-full px-3 py-2.5 text-left text-[11px] transition hover:bg-sky-50 ${
                              selected
                                ? 'bg-sky-50 font-black text-sky-900'
                                : 'font-semibold text-zinc-800'
                            }`}
                          >
                            {formatMachineNvlSourceOptionLabel(report)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                  {pickerReportId
                    ? `Đã chọn 1 phiếu · ${pickerSourceOptions.length} phiếu trong bộ lọc`
                    : `Chạm để chọn · ${pickerSourceOptions.length} phiếu · có thể để trống Ngày/Ca/Máy`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-zinc-200 px-4 py-3">
              <button
                type="button"
                onClick={closeAutofillPicker}
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

