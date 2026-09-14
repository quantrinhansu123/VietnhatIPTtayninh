import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  Cpu,
  ImagePlus,
  List,
  Loader2,
  Save,
  ScanBarcode,
  Scale,
  X
} from 'lucide-react';
import ProductQrScanner from './ProductQrScanner';
import SearchableSelect from './SearchableSelect';
import { SearchableSelect as ComboSelect } from './shared/SearchableSelect';
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
import { CAMERA_IMAGE_INPUT_PROPS, compressImageDataUrl } from '../utils/cameraCapture';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { getProductionShiftOptions, normalizeShiftSettings, shiftNamesMatch, type ShiftSetting } from '../utils/shiftSettings';
import { parseCanTuDongQrProductCode, resolveCanSpKg } from '../utils/canTuDongWeights';

const productLineGridClass =
  'min-w-[50rem] grid-cols-[2.25rem_minmax(9rem,1.1fr)_minmax(12rem,1.3fr)_4rem_6rem_7rem_4rem_2.5rem]';

const mobileProductColumnLabelClass =
  'block text-[9px] font-black uppercase tracking-wider text-zinc-500';

export type AcceptanceReport = {
  id: string;
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  loai_vat_tu: string;
  mat_hang: string;
  /** Tên SP — điền thêm khi in / hiển thị nếu khác mat_hang */
  ten_sp?: string;
  don_vi: string;
  so_luong: number | null;
  trong_luong: number | null;
  don_vi_trong_luong: string;
  hinh_anh: string;
  hinh_anh_public_id?: string;
  created_at?: string;
  da_in?: boolean;
};

interface MachineOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface ProductionOrderOption {
  shift: string;
  machine: string;
  productCode: string;
  productName: string;
  unit: string;
  startDate: string;
}

interface ProductSelectOption {
  code: string;
  name: string;
  unit: string;
  totalWeightKg: number | null;
}

interface AiWeighingRecord {
  qr_code?: string | null;
  ca?: string | null;
  unit?: string | null;
  tare_weight?: number | string | null;
  weight?: number | string | null;
  can_loi?: number | string | null;
  can_san_pham?: number | string | null;
}

const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

/** Danh sách loại vật tư — mỗi loại hiển thị thành 1 phiếu báo cáo độc lập trên màn hình. */
const MATERIAL_TYPES = ['Thành phẩm', 'Gia công', 'SP lỗi', 'SP rác'] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  'Thành phẩm': 'Thành phẩm',
  'Gia công': 'Gia công',
  'SP lỗi': 'SP lỗi (Hàng hỏng)',
  'SP rác': 'SP rác (Kho rác)'
};

const MATERIAL_TYPE_TITLE_LABELS: Record<MaterialType, string> = {
  'Thành phẩm': 'thành phẩm',
  'Gia công': 'gia công',
  'SP lỗi': 'SP lỗi (Hàng hỏng)',
  'SP rác': 'SP rác (Kho rác)'
};

function isMaterialType(value: string): value is MaterialType {
  return (MATERIAL_TYPES as readonly string[]).includes(value);
}

/**
 * Một dòng danh mục có thể gộp nhiều mã (VD "MT- MN001, MT- MN008") kèm chuỗi tên tương ứng.
 * Tách ra thành từng cặp mã — tên để menu chọn dễ đọc thay vì một khối chữ dài.
 */
function renderProductOption(product: ProductSelectOption) {
  const codes = product.code.split(/,\s+/).map(part => part.trim()).filter(Boolean);
  const names = (product.name || '').split(/,\s+/).map(part => part.trim()).filter(Boolean);

  if (codes.length > 1 && codes.length === names.length) {
    return (
      <span className="block space-y-1">
        {codes.map((code, index) => (
          <span key={`${code}-${index}`} className="block">
            <span className="block font-black">{code}</span>
            <span className="block text-[12px] font-semibold text-zinc-500">{names[index]}</span>
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="block">
      <span className="block font-black">{product.code}</span>
      {product.name ? (
        <span className="block text-[12px] font-semibold text-zinc-500">{product.name}</span>
      ) : null}
    </span>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function extractIsoDate(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '-') return '';
  const match = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function normalizeKey(value: string) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function isKgUnit(value: string) {
  return ['kg', 'kilogram', 'kilograms'].includes(String(value ?? '').trim().toLowerCase());
}

function formatAutoWeight(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function calculateProductWeight(product: ProductSelectOption | null, quantityValue: string) {
  if (!product) return '';
  const quantity = Number(String(quantityValue).replace(',', '.'));
  if (!Number.isFinite(quantity)) return '';
  if (isKgUnit(product.unit)) return formatAutoWeight(quantity);
  if (product.totalWeightKg !== null && product.totalWeightKg >= 0) {
    return formatAutoWeight(quantity * product.totalWeightKg);
  }
  return '';
}

function shiftMatches(orderShift: string, selectedShift: string) {
  return shiftNamesMatch(orderShift, selectedShift);
}

function machineMatches(orderMachine: string, machineCode: string, machineName: string, machineRef: string) {
  const ref = orderMachine.trim();
  if (!ref || ref === '-') return false;

  const candidates = new Set<string>();
  if (machineCode) candidates.add(normalizeKey(machineCode));
  if (machineName) candidates.add(normalizeKey(machineName));
  if (machineRef) candidates.add(normalizeKey(machineRef));
  if (machineCode && machineName) candidates.add(normalizeKey(`${machineCode} · ${machineName}`));

  const refKey = normalizeKey(ref);
  return [...candidates].some(key => key && (key === refKey || key.includes(refKey) || refKey.includes(key)));
}

function parseQrProductCode(raw: string) {
  // Cùng quy tắc /can-tu-dong: tiền tố trước `_` / trước `+` / serial ddmmyy.
  return parseCanTuDongQrProductCode(raw);
}

// Gom mã theo tiền tố: bỏ phần serial ngẫu nhiên sau dấu «_» (vd MT-MN010_4UOOH7T98S1 → MT-MN010).
function autoReportGroupCode(code: string) {
  const trimmed = String(code ?? '').trim();
  if (!trimmed) return '';
  const fromQr = parseCanTuDongQrProductCode(trimmed);
  if (fromQr) return fromQr;
  const underscoreIdx = trimmed.indexOf('_');
  const base = underscoreIdx > 0 ? trimmed.slice(0, underscoreIdx) : trimmed;
  return base.trim();
}

function productCodeFromOrder(order: ProductionOrderOption) {
  return order.productCode.trim() || order.productName.trim();
}

function lineHasProductCode(line: ProductLine, code: string) {
  const target = normalizeKey(autoReportGroupCode(code));
  if (!target) return false;
  return normalizeKey(autoReportGroupCode(line.mat_hang)) === target;
}

function findProductOption(code: string, options: ProductSelectOption[]) {
  const key = normalizeKey(autoReportGroupCode(code));
  if (!key) return null;
  return (
    options.find(option => normalizeKey(option.code) === key) ??
    options.find(option => normalizeKey(autoReportGroupCode(option.code)) === key) ??
    null
  );
}

function normalizeCatalogProducts(data: unknown): ProductSelectOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  return rows
    .map((item): ProductSelectOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(
        record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
      ).trim();
      const name = String(
        record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
      ).trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim();
      const totalWeightRaw = record.tong_trong_luong ?? record.totalWeight;
      const totalWeightText = String(totalWeightRaw ?? '').trim();
      const totalWeightNumber = Number(totalWeightText.replace(',', '.'));
      const totalWeightKg = totalWeightText && Number.isFinite(totalWeightNumber) ? totalWeightNumber : null;
      if (!code) return null;
      return { code, name, unit, totalWeightKg };
    })
    .filter((item): item is ProductSelectOption => Boolean(item));
}

function normalizeWarehouseKey(name: string) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd');
}

function isHangHongWarehouse(name: string) {
  const key = normalizeWarehouseKey(name);
  return key.includes('hang hong') || key.includes('hang_hong') || key.includes('hang-hong');
}

function isRacWarehouse(name: string) {
  const key = normalizeWarehouseKey(name);
  return key.includes('kho rac') || key.includes('hang rac') || (key.includes('rac') && !key.includes('trac'));
}

/** Mã trong `kho_nvl` theo tên kho — dùng khi loại vật tư là SP lỗi / SP rác. */
function normalizeMaterialCatalogOptions(
  data: unknown,
  warehouseMatch: (warehouse: string) => boolean
): ProductSelectOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
      ? (data as { materials: unknown[] }).materials
      : [];

  const byCode = new Map<string, ProductSelectOption>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const warehouse = String(record.ten_kho ?? record.warehouse ?? '').trim();
    if (!warehouseMatch(warehouse)) continue;
    const code = String(record.ma_npl ?? record.ma_sp ?? record.code ?? '').trim();
    if (!code) continue;
    const key = normalizeKey(code);
    if (!key || byCode.has(key)) continue;
    const name = String(record.ten_npl ?? record.ten_sp ?? record.name ?? '').trim();
    const unit = String(record.don_vi ?? record.unit ?? '').trim();
    const totalWeightRaw = record.tong_trong_luong ?? record.totalWeight;
    const totalWeightText = String(totalWeightRaw ?? '').trim();
    const totalWeightNumber = Number(totalWeightText.replace(',', '.'));
    const totalWeightKg = totalWeightText && Number.isFinite(totalWeightNumber) ? totalWeightNumber : null;
    byCode.set(key, { code, name, unit, totalWeightKg });
  }
  return [...byCode.values()];
}

function isBlankProductLine(line: ProductLine) {
  return !line.mat_hang.trim() && !line.so_luong.trim();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadImage(imageDataUrl: string) {
  const res = await fetch('/api/cloudinary/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, folder: 'bao_cao_nghiem_thu' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể upload ảnh lên Cloudinary.');
  return { imageUrl: data.url as string, imagePublicId: data.publicId as string };
}

function normalizeProductionOrders(data: unknown): ProductionOrderOption[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { productionOrders?: unknown }).productionOrders;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item): ProductionOrderOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const shift = String(record.ca ?? record.shift ?? '').trim();
      const machine = String(record.may ?? record.ma_may ?? record.ten_may ?? '').trim();
      const productCode = String(record.ma_hang ?? record.ma_sp ?? '').trim();
      const productName = String(record.ten_hang ?? record.san_pham ?? record.ten_sp ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim();
      const startDate = extractIsoDate(
        String(record.ngay_gio_bat_dau ?? record.ngay_bat_dau ?? record.start_date ?? '')
      );
      if (!shift && !machine && !productName && !startDate) return null;
      return { shift, machine, productCode, productName, unit, startDate };
    })
    .filter((row): row is ProductionOrderOption => Boolean(row));
}

function normalizeMachines(data: unknown): MachineOption[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { machines?: unknown }).machines;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item): MachineOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_may ?? record.code ?? '').trim();
      const name = String(record.ten_may ?? record.name ?? '').trim();
      const type = String(record.loai_may ?? record.type ?? '').trim();
      if (!code && !name) return null;
      return {
        id: String(record.id ?? code ?? name),
        code,
        name,
        type
      };
    })
    .filter((row): row is MachineOption => Boolean(row));
}

export function normalizeReportFromApi(record: Record<string, unknown>): AcceptanceReport {
  return {
    id: String(record.id ?? ''),
    ngay: String(record.ngay ?? '').slice(0, 10),
    ca: String(record.ca ?? ''),
    lan: String(record.lan ?? ''),
    gio: String(record.gio ?? '').slice(0, 5),
    ma_may: String(record.ma_may ?? ''),
    ten_may: String(record.ten_may ?? ''),
    loai_vat_tu: String(record.loai_vat_tu ?? 'Thành phẩm'),
    mat_hang: String(record.mat_hang ?? ''),
    don_vi: String(record.don_vi ?? ''),
    so_luong:
      record.so_luong === null || record.so_luong === undefined ? null : Number(record.so_luong),
    trong_luong:
      record.trong_luong === null || record.trong_luong === undefined ? null : Number(record.trong_luong),
    don_vi_trong_luong: String(record.don_vi_trong_luong ?? 'Kg'),
    hinh_anh: String(record.hinh_anh ?? ''),
    hinh_anh_public_id: String(record.hinh_anh_public_id ?? ''),
    created_at: String(record.created_at ?? '')
  };
}

interface ProductLine {
  id: string;
  mat_hang: string;
  don_vi: string;
  so_luong: string;
  trong_luong: string;
  don_vi_trong_luong: string;
}

function newProductLine(): ProductLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mat_hang: '',
    don_vi: '',
    so_luong: '',
    trong_luong: '',
    don_vi_trong_luong: 'Kg'
  };
}

interface HeaderState {
  ngay: string;
  ca: string;
  lan: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  machineRef: string;
  teamId: string;
}

function newHeaderState(overrides?: Partial<{ ngay: string; ca: string }>): HeaderState {
  return {
    ngay: overrides?.ngay || todayIso(),
    ca: overrides?.ca || '',
    lan: '1',
    gio: nowTimeValue(),
    ma_may: '',
    ten_may: '',
    machineRef: '',
    teamId: ''
  };
}

interface SectionState {
  lines: ProductLine[];
  hinh_anh: string;
  hinh_anh_public_id: string;
  imagePreview: string;
}

function newSectionState(): SectionState {
  return { lines: [newProductLine()], hinh_anh: '', hinh_anh_public_id: '', imagePreview: '' };
}

function newSectionsState(): Record<MaterialType, SectionState> {
  return {
    'Thành phẩm': newSectionState(),
    'Gia công': newSectionState(),
    'SP lỗi': newSectionState(),
    'SP rác': newSectionState()
  };
}

export type AcceptanceReportCreatePrefill = {
  ngay: string;
  ca: string;
};

export default function AcceptanceReportForm({
  onBack,
  onOpenList,
  editReport,
  onEditConsumed,
  createPrefill,
  onCreatePrefillConsumed
}: {
  onBack: () => void;
  onOpenList?: () => void;
  editReport?: AcceptanceReport | null;
  onEditConsumed?: () => void;
  createPrefill?: AcceptanceReportCreatePrefill | null;
  onCreatePrefillConsumed?: () => void;
}) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderOption[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductSelectOption[]>([]);
  const [hangHongMaterialOptions, setHangHongMaterialOptions] = useState<ProductSelectOption[]>([]);
  const [racMaterialOptions, setRacMaterialOptions] = useState<ProductSelectOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [header, setHeader] = useState<HeaderState>(newHeaderState());
  const [sections, setSections] = useState<Record<MaterialType, SectionState>>(newSectionsState());
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<MaterialType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<MaterialType | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'hardware' | 'camera'>('hardware');
  const [isAutoReportOpen, setIsAutoReportOpen] = useState(false);
  const [isLoadingAutoReport, setIsLoadingAutoReport] = useState(false);
  const [autoReportFilter, setAutoReportFilter] = useState({ ngay: todayIso(), ca: '' });
  const [highlightLine, setHighlightLine] = useState<{ type: MaterialType; lineId: string } | null>(null);
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const cameraInputRefs = useRef<Record<MaterialType, HTMLInputElement | null>>({
    'Thành phẩm': null,
    'Gia công': null,
    'SP lỗi': null,
    'SP rác': null
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError('');
      try {
        const [machineRes, productionRes, productRes, settingsRes, materialRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/lenh-sx'),
          fetch('/api/san-pham?format=table'),
          fetch('/api/cai-dat'),
          fetch('/api/kho-nvl')
        ]);
        const machineData = await machineRes.json().catch(() => ({}));
        const productionData = await productionRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));
        const settingsData = await settingsRes.json().catch(() => ({}));
        const materialData = await materialRes.json().catch(() => ({}));
        if (!machineRes.ok) throw new Error(machineData.error || 'Không thể tải danh sách máy.');
        if (!productionRes.ok) throw new Error(productionData.error || 'Không thể tải lệnh sản xuất.');
        if (cancelled) return;

        setMachines(normalizeMachines(machineData));
        setProductionOrders(normalizeProductionOrders(productionData));
        if (productRes.ok) {
          setCatalogProducts(normalizeCatalogProducts(productData));
        } else {
          setCatalogProducts([]);
        }
        if (materialRes.ok) {
          setHangHongMaterialOptions(normalizeMaterialCatalogOptions(materialData, isHangHongWarehouse));
          setRacMaterialOptions(normalizeMaterialCatalogOptions(materialData, isRacWarehouse));
        } else {
          setHangHongMaterialOptions([]);
          setRacMaterialOptions([]);
        }
        if (settingsRes.ok) {
          setShiftSettings(normalizeShiftSettings(settingsData));
        } else {
          setShiftSettings([]);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải dữ liệu.');
      } finally {
        if (!cancelled) setIsLoadingProducts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editReport || machines.length === 0) return;
    startEdit(editReport);
    onEditConsumed?.();
  }, [editReport, machines, onEditConsumed]);

  useEffect(() => {
    if (!createPrefill) return;
    setHeader(newHeaderState({ ngay: createPrefill.ngay, ca: createPrefill.ca }));
    setSections(newSectionsState());
    setEditingId(null);
    setEditingType(null);
    setError('');
    setMessage('');
    onCreatePrefillConsumed?.();
  }, [createPrefill, onCreatePrefillConsumed]);

  useEffect(() => {
    if (!highlightLine) return;
    const timer = window.setTimeout(() => setHighlightLine(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightLine]);

  // Tự tăng "Lần" theo cùng ngày + cùng ca khi tạo phiếu mới
  useEffect(() => {
    if (editingId) return;
    const ngay = header.ngay.trim();
    const ca = header.ca.trim();
    if (!ngay || !ca) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bao-cao-nghiem-thu?ngay=${encodeURIComponent(ngay)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const rows = Array.isArray((data as { reports?: unknown }).reports)
          ? ((data as { reports: Record<string, unknown>[] }).reports)
          : [];
        let maxLan = 0;
        rows.forEach(row => {
          if (!row || typeof row !== 'object') return;
          const report = normalizeReportFromApi(row);
          if (report.ca.trim() !== ca) return;
          const parsed = parseInt(report.lan.replace(/[^\d]/g, ''), 10);
          if (Number.isFinite(parsed) && parsed > maxLan) maxLan = parsed;
        });
        if (cancelled) return;
        setHeader(prev => {
          if (prev.ngay.trim() !== ngay || prev.ca.trim() !== ca) return prev;
          return { ...prev, lan: String(maxLan + 1) };
        });
      } catch {
        // Bỏ qua lỗi tải, giữ nguyên giá trị lần hiện tại
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [header.ngay, header.ca, editingId]);

  const ordersForSelectedDay = useMemo(
    () => productionOrders.filter(order => order.startDate === header.ngay),
    [productionOrders, header.ngay]
  );

  /** Nguồn Ca duy nhất: trang Cài đặt (`/api/cai-dat`) — dùng native select để HC1/HC2 không bị lọc nhầm. */
  const shiftSelectOptions = useMemo(() => {
    const options = getProductionShiftOptions(shiftSettings);
    const current = header.ca.trim();
    if (
      current &&
      !options.some(
        option =>
          option.value === current ||
          shiftNamesMatch(option.value, current) ||
          shiftNamesMatch(option.label, current)
      )
    ) {
      return [{ value: current, label: current }, ...options];
    }
    return options;
  }, [shiftSettings, header.ca]);

  const autoReportShiftOptions = useMemo(() => {
    const options = getProductionShiftOptions(shiftSettings);
    const current = autoReportFilter.ca.trim();
    if (
      current &&
      !options.some(
        option =>
          option.value === current ||
          shiftNamesMatch(option.value, current) ||
          shiftNamesMatch(option.label, current)
      )
    ) {
      return [{ value: current, label: current }, ...options];
    }
    return options;
  }, [shiftSettings, autoReportFilter.ca]);

  const teamOptions = useMemo(
    () =>
      [...machines]
        .filter(machine => machine.code || machine.name)
        .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'vi')),
    [machines]
  );

  const orderProductOptions = useMemo(() => {
    if (!header.ca || (!header.ma_may.trim() && !header.ten_may.trim())) return [] as ProductSelectOption[];

    return ordersForSelectedDay
      .filter(
        order =>
          shiftMatches(order.shift, header.ca) &&
          machineMatches(order.machine, header.ma_may, header.ten_may, header.machineRef || header.ten_may || header.ma_may)
      )
      .map(order => ({
        code: productCodeFromOrder(order),
        name: order.productName,
        unit: order.unit && order.unit !== '-' ? order.unit : '',
        totalWeightKg: null
      }))
      .filter(item => item.code && item.code !== '-');
  }, [ordersForSelectedDay, header.ca, header.ma_may, header.ten_may, header.machineRef]);

  const productOptionsByType = useMemo(() => {
    const build = (materialType: MaterialType) => {
      const byCode = new Map<string, ProductSelectOption>();

      const mergeOptions = (products: ProductSelectOption[]) => {
        products.forEach(product => {
          const key = normalizeKey(product.code);
          if (!key) return;
          const existing = byCode.get(key);
          byCode.set(key, {
            code: existing?.code || product.code,
            name: existing?.name || product.name || '',
            // Ưu tiên ĐVT đã có từ Kho hàng (`san_pham.don_vi`), không để lệnh SX / nguồn sau ghi đè.
            unit: existing?.unit || product.unit || '',
            totalWeightKg: existing?.totalWeightKg ?? product.totalWeightKg
          });
        });
      };

      // Thành phẩm / gia công: danh mục SP. SP lỗi / SP rác: thêm mã trong kho_nvl theo tên kho.
      mergeOptions(catalogProducts);
      if (materialType === 'SP lỗi') mergeOptions(hangHongMaterialOptions);
      if (materialType === 'SP rác') mergeOptions(racMaterialOptions);
      mergeOptions(orderProductOptions);

      return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
    };

    return {
      'Thành phẩm': build('Thành phẩm'),
      'Gia công': build('Gia công'),
      'SP lỗi': build('SP lỗi'),
      'SP rác': build('SP rác')
    } as Record<MaterialType, ProductSelectOption[]>;
  }, [catalogProducts, hangHongMaterialOptions, racMaterialOptions, orderProductOptions]);

  const updateSection = (type: MaterialType, updater: (section: SectionState) => SectionState) => {
    setSections(prev => ({ ...prev, [type]: updater(prev[type]) }));
  };

  const handleDateChange = (ngay: string) => {
    setHeader(prev => ({ ...prev, ngay, ca: '', ma_may: '', ten_may: '', machineRef: '', teamId: '' }));
    setSections(newSectionsState());
  };

  const handleShiftChange = (ca: string) => {
    setHeader(prev => ({ ...prev, ca }));
    setSections(newSectionsState());
  };

  const handleTeamChange = (teamId: string) => {
    const team = machines.find(machine => machine.id === teamId);
    if (!team) {
      setHeader(prev => ({ ...prev, teamId: '', machineRef: '', ma_may: '', ten_may: '' }));
      setSections(newSectionsState());
      return;
    }

    const machineRef = team.name || team.code;
    setHeader(prev => ({ ...prev, teamId: team.id, machineRef, ma_may: team.code, ten_may: team.name }));
    setSections(newSectionsState());
  };

  const handleLineProductChange = (type: MaterialType, lineId: string, mat_hang: string) => {
    const currentLines = sectionsRef.current[type].lines;
    if (mat_hang && currentLines.some(line => line.id !== lineId && lineHasProductCode(line, mat_hang))) {
      setError(`Mã SP "${parseQrProductCode(mat_hang)}" đã có trong phiếu ${MATERIAL_TYPE_LABELS[type]}.`);
      return;
    }

    const match = findProductOption(mat_hang, productOptionsByType[type]);
    updateSection(type, section => ({
      ...section,
      lines: section.lines.map(line =>
        line.id === lineId
          ? {
              ...line,
              mat_hang,
              don_vi: match?.unit || '',
              trong_luong: calculateProductWeight(match, line.so_luong)
            }
          : line
      )
    }));
    setError('');
  };

  const handleLineQuantityChange = (type: MaterialType, lineId: string, so_luong: string) => {
    updateSection(type, section => ({
      ...section,
      lines: section.lines.map(line => {
        if (line.id !== lineId) return line;
        const product = findProductOption(line.mat_hang, productOptionsByType[type]);
        return { ...line, so_luong, trong_luong: calculateProductWeight(product, so_luong) };
      })
    }));
  };

  const handleLineWeightChange = (type: MaterialType, lineId: string, trong_luong: string) => {
    updateSection(type, section => ({
      ...section,
      lines: section.lines.map(line => (line.id === lineId ? { ...line, trong_luong } : line))
    }));
  };

  const addProductLine = (type: MaterialType) => {
    updateSection(type, section => ({ ...section, lines: [...section.lines, newProductLine()] }));
  };

  const removeProductLine = (type: MaterialType, lineId: string) => {
    updateSection(type, section => {
      if (section.lines.length <= 1) return section;
      return { ...section, lines: section.lines.filter(line => line.id !== lineId) };
    });
  };

  const handleQrScan = useCallback(
    (raw: string): boolean | 'duplicate' => {
      setMessage('');
      const type: MaterialType = 'Thành phẩm';

      const code = parseQrProductCode(raw);
      if (!code) {
        setError('Mã QR không hợp lệ.');
        return false;
      }

      if (isLoadingProducts) {
        setError('Danh mục sản phẩm đang tải. Vui lòng quét lại sau ít giây.');
        return false;
      }

      const options = productOptionsByType[type];
      const matchedProduct = findProductOption(code, options);
      if (!matchedProduct) {
        setError(`Không tìm thấy mã SP "${code}" trong danh mục.`);
        return false;
      }

      // Dùng mã chuẩn trong danh mục sau khi đã tách phần ngày + serial của tem QR.
      const productCode = matchedProduct.code;
      const unit = matchedProduct.unit;
      const currentLines = sectionsRef.current[type].lines;
      const existingIndex = currentLines.findIndex(line => lineHasProductCode(line, productCode));

      if (existingIndex >= 0) {
        const targetLine = currentLines[existingIndex];
        setHighlightLine({ type, lineId: targetLine.id });
        setError(`Mã SP "${productCode}" đã có trên phiếu, không tăng số lượng.`);
        return 'duplicate';
      }

      const emptyLineIndex = currentLines.findIndex(line => isBlankProductLine(line));
      if (emptyLineIndex >= 0) {
        const targetLine = currentLines[emptyLineIndex];
        const nextLines = currentLines.map((line, index) =>
          index === emptyLineIndex
            ? {
                ...line,
                mat_hang: productCode,
                don_vi: unit || line.don_vi,
                so_luong: '1',
                trong_luong: calculateProductWeight(matchedProduct, '1')
              }
            : line
        );
        updateSection(type, section => ({ ...section, lines: nextLines }));
        setError('');
        setHighlightLine({ type, lineId: targetLine.id });
        setMessage(`Đã thêm mã SP: ${productCode}`);
        return true;
      }

      const nextLine = {
        ...newProductLine(),
        mat_hang: productCode,
        don_vi: unit,
        so_luong: '1',
        trong_luong: calculateProductWeight(matchedProduct, '1')
      };
      updateSection(type, section => ({ ...section, lines: [...currentLines, nextLine] }));
      setError('');
      setHighlightLine({ type, lineId: nextLine.id });
      setMessage(`Đã thêm mã SP: ${productCode}`);
      return true;
    },
    [isLoadingProducts, productOptionsByType]
  );

  const getQrConfirmMessage = useCallback((code: string) => {
    const currentLines = sectionsRef.current['Thành phẩm'].lines;
    const exists = currentLines.some(line => lineHasProductCode(line, code));
    if (exists) {
      return `Mã SP ${code} đã có trên phiếu — hệ thống sẽ không thêm và không tăng SL.`;
    }
    const hasBlankLine = currentLines.some(line => isBlankProductLine(line));
    if (hasBlankLine) {
      return `Đã quét mã ${code}. Bấm Xác nhận để điền vào dòng trống.`;
    }
    return `Đã quét mã ${code}. Bấm Xác nhận để thêm dòng mới.`;
  }, []);

  const scannedQrCount = useMemo(
    () => sections['Thành phẩm'].lines.filter(line => !isBlankProductLine(line)).length,
    [sections]
  );

  const handleImagePick = async (type: MaterialType, file: File | null) => {
    if (!file) return;
    setError('');
    setMessage('');
    setUploadingType(type);
    try {
      const rawDataUrl = await fileToDataUrl(file);
      let dataUrl = rawDataUrl;
      try {
        dataUrl = await compressImageDataUrl(rawDataUrl);
      } catch {
        dataUrl = rawDataUrl;
      }
      updateSection(type, section => ({ ...section, imagePreview: dataUrl, hinh_anh: dataUrl, hinh_anh_public_id: '' }));
      try {
        const uploaded = await uploadImage(dataUrl);
        updateSection(type, section => ({
          ...section,
          hinh_anh: uploaded.imageUrl,
          hinh_anh_public_id: uploaded.imagePublicId,
          imagePreview: uploaded.imageUrl
        }));
        setMessage('Đã chụp ảnh.');
      } catch {
        setMessage('Đã chụp ảnh (sẽ upload khi lưu báo cáo).');
      }
    } catch (err: any) {
      updateSection(type, section => ({ ...section, imagePreview: '', hinh_anh: '', hinh_anh_public_id: '' }));
      setError(err.message || 'Không thể đọc file ảnh.');
    } finally {
      setUploadingType(null);
    }
  };

  const pickImage = (type: MaterialType) => {
    if (uploadingType) return;
    cameraInputRefs.current[type]?.click();
  };

  const resolveImageForSave = async (section: SectionState) => {
    const source = section.hinh_anh.trim() || section.imagePreview.trim();
    if (!source) return null;
    if (!source.startsWith('data:')) {
      return { hinh_anh: source, hinh_anh_public_id: section.hinh_anh_public_id || '' };
    }
    let dataUrl = source;
    try {
      dataUrl = await compressImageDataUrl(source);
    } catch {
      dataUrl = source;
    }
    const uploaded = await uploadImage(dataUrl);
    return { hinh_anh: uploaded.imageUrl, hinh_anh_public_id: uploaded.imagePublicId };
  };

  const resetAll = () => {
    setEditingId(null);
    setEditingType(null);
    setHeader(newHeaderState());
    setSections(newSectionsState());
    setMessage('');
    setError('');
  };

  const startEdit = (report: AcceptanceReport) => {
    const linked =
      machines.find(machine => machine.code === report.ma_may) ??
      machines.find(machine => machine.name === report.ten_may) ??
      machines.find(machine => machine.code === report.ten_may || machine.name === report.ma_may) ??
      null;
    const machineRef = report.ten_may || report.ma_may;
    const type: MaterialType = isMaterialType(report.loai_vat_tu) ? report.loai_vat_tu : 'Thành phẩm';

    setEditingId(report.id);
    setEditingType(type);
    setHeader({
      ngay: report.ngay || todayIso(),
      ca: report.ca,
      lan: report.lan || '1',
      gio: report.gio || nowTimeValue(),
      ma_may: report.ma_may,
      ten_may: report.ten_may,
      machineRef,
      teamId: linked?.id ?? ''
    });
    setSections(prev => ({
      ...newSectionsState(),
      [type]: {
        lines: [
          {
            id: report.id,
            mat_hang: report.mat_hang,
            don_vi: report.don_vi,
            so_luong: report.so_luong === null ? '' : String(report.so_luong),
            trong_luong: report.trong_luong === null ? '' : String(report.trong_luong),
            don_vi_trong_luong: report.don_vi_trong_luong || 'Kg'
          }
        ],
        hinh_anh: report.hinh_anh,
        hinh_anh_public_id: report.hinh_anh_public_id || '',
        imagePreview: report.hinh_anh
      }
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const parseLineQuantity = (value: string) => Number(String(value).replace(',', '.'));

  const validateHeader = () => {
    if (!header.ngay.trim()) return 'Vui lòng chọn ngày.';
    if (!header.ca.trim()) return 'Vui lòng chọn ca.';
    if (!header.ma_may.trim() && !header.ten_may.trim()) return 'Vui lòng chọn máy.';
    if (!header.lan.trim()) return 'Vui lòng nhập lần ghi nhận.';
    return null;
  };

  type PreparedLine = ProductLine & { soLuong: number; trongLuong: number | null };

  const validateSectionLines = (type: MaterialType, section: SectionState): PreparedLine[] | string => {
    const validLines = section.lines
      .map(line => {
        const soLuong = parseLineQuantity(line.so_luong);
        const trongLuong = line.trong_luong.trim() ? parseLineQuantity(line.trong_luong) : null;
        return { ...line, soLuong, trongLuong };
      })
      .filter(line => line.mat_hang.trim() || line.so_luong.trim());

    if (validLines.length === 0) {
      return `Phiếu ${MATERIAL_TYPE_LABELS[type]}: vui lòng thêm ít nhất một dòng mã SP và số lượng.`;
    }

    for (const line of validLines) {
      if (!line.mat_hang.trim()) {
        return `Phiếu ${MATERIAL_TYPE_LABELS[type]}: vui lòng chọn mã SP cho từng dòng.`;
      }
      if (!Number.isFinite(line.soLuong) || line.soLuong <= 0) {
        return `Phiếu ${MATERIAL_TYPE_LABELS[type]}: số lượng phải lớn hơn 0 (${line.mat_hang}).`;
      }
      if (line.trongLuong !== null && (!Number.isFinite(line.trongLuong) || line.trongLuong < 0)) {
        return `Phiếu ${MATERIAL_TYPE_LABELS[type]}: trọng lượng không hợp lệ (${line.mat_hang}).`;
      }
    }

    return validLines;
  };

  const handleUpdateSingle = async () => {
    if (!editingId || !editingType) return;
    const headerError = validateHeader();
    if (headerError) {
      setError(showSaveFailure(headerError));
      return;
    }
    const section = sections[editingType];
    const prepared = validateSectionLines(editingType, section);
    if (typeof prepared === 'string') {
      setError(showSaveFailure(prepared));
      return;
    }

    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const resolvedImage = (await resolveImageForSave(section)) ?? {
        hinh_anh: '',
        hinh_anh_public_id: ''
      };
      const line = prepared[0];
      const res = await fetch(`/api/bao-cao-nghiem-thu/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: header.ngay,
          ca: header.ca,
          lan: header.lan,
          gio: header.gio,
          ma_may: header.ma_may,
          ten_may: header.ten_may,
          loai_vat_tu: editingType,
          hinh_anh: resolvedImage.hinh_anh || null,
          hinh_anh_public_id: resolvedImage.hinh_anh_public_id || null,
          mat_hang: line.mat_hang,
          don_vi: line.don_vi,
          so_luong: line.soLuong,
          trong_luong: line.trongLuong,
          don_vi_trong_luong: 'Kg'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu báo cáo sản lượng.'));
      const okMsg = 'Đã cập nhật báo cáo sản lượng.';
      setMessage(okMsg);
      showAppToast(okMsg);
      resetAll();
    } catch (err: any) {
      setError(showSaveFailure(err, 'Không thể lưu báo cáo sản lượng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const headerError = validateHeader();
    if (headerError) {
      setError(showSaveFailure(headerError));
      return;
    }

    const filledTypes = MATERIAL_TYPES.filter(type => sections[type].lines.some(line => !isBlankProductLine(line)));
    if (filledTypes.length === 0) {
      setError(showSaveFailure('Vui lòng nhập ít nhất một phiếu (Thành phẩm / Gia công / SP lỗi / SP rác).'));
      return;
    }

    const preparedByType = new Map<MaterialType, PreparedLine[]>();
    for (const type of filledTypes) {
      const prepared = validateSectionLines(type, sections[type]);
      if (typeof prepared === 'string') {
        setError(showSaveFailure(prepared));
        return;
      }
      preparedByType.set(type, prepared);
    }

    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const summary: string[] = [];
      let totalSaved = 0;
      for (const type of filledTypes) {
        const section = sections[type];
        const resolvedImage = (await resolveImageForSave(section)) ?? {
          hinh_anh: '',
          hinh_anh_public_id: ''
        };
        const validLines = preparedByType.get(type) ?? [];
        let savedForType = 0;
        for (const line of validLines) {
          const res = await fetch('/api/bao-cao-nghiem-thu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ngay: header.ngay,
              ca: header.ca,
              lan: header.lan,
              gio: header.gio,
              ma_may: header.ma_may,
              ten_may: header.ten_may,
              loai_vat_tu: type,
              hinh_anh: resolvedImage.hinh_anh || null,
              hinh_anh_public_id: resolvedImage.hinh_anh_public_id || null,
              mat_hang: line.mat_hang,
              don_vi: line.don_vi,
              so_luong: line.soLuong,
              trong_luong: line.trongLuong,
              don_vi_trong_luong: 'Kg'
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu báo cáo sản lượng.'));
          savedForType += 1;
          totalSaved += 1;
        }
        summary.push(`${MATERIAL_TYPE_LABELS[type]}: ${savedForType} dòng`);
      }

      const okMsg = `Đã lưu ${totalSaved} dòng báo cáo độc lập (${summary.join(', ')}).`;
      setMessage(okMsg);
      showAppToast(okMsg);
      resetAll();
    } catch (err: any) {
      setError(showSaveFailure(err, 'Không thể lưu báo cáo sản lượng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const teamSelectValue =
    header.teamId ||
    machines.find(machine => machine.id === header.machineRef)?.id ||
    machines.find(machine => machine.code === header.ma_may || machine.name === header.ten_may)?.id ||
    '';

  const openAutoReport = () => {
    setAutoReportFilter({ ngay: header.ngay || todayIso(), ca: header.ca });
    setError('');
    setIsAutoReportOpen(true);
  };

  const handleAutoReport = async () => {
    const { ngay, ca } = autoReportFilter;
    if (!ngay || !ca) {
      setError('Vui lòng chọn đủ ngày và ca.');
      return;
    }

    setIsLoadingAutoReport(true);
    setError('');
    setMessage('');
    try {
      const params = new URLSearchParams({ from: ngay, to: ngay, limit: '2000', dateBy: 'ngay' });
      const response = await fetch(`/api/can-tu-dong?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(readApiErrorMessage(response, data, 'Không thể tải phiếu cân AI.'));
      }

      const records = Array.isArray(data.records) ? (data.records as AiWeighingRecord[]) : [];
      const matched = records.filter(record => shiftMatches(String(record.ca ?? ''), ca));
      if (matched.length === 0) {
        throw new Error('Không có phiếu cân AI phù hợp với ngày và ca đã chọn.');
      }

      const quantities = new Map<
        string,
        { code: string; unit: string; quantity: number; rollWeightKg: number }
      >();
      let skipped = 0;
      matched.forEach(record => {
        const qrProductCode = parseQrProductCode(String(record.qr_code ?? ''));
        if (!qrProductCode) {
          skipped += 1;
          return;
        }
        // ĐVT lấy từ Kho hàng (`/kho-hang` · san_pham.don_vi), khớp tiền tố Mã SP — không dùng unit phiếu cân AI.
        const catalog = findProductOption(qrProductCode, catalogProducts);
        const product = findProductOption(qrProductCode, productOptionsByType['Thành phẩm']);
        const code = autoReportGroupCode(catalog?.code || product?.code || qrProductCode);
        const key = normalizeKey(code);
        const current = quantities.get(key);
        const rollKg = resolveCanSpKg(record);
        const unitFromKhoHang = String(catalog?.unit || product?.unit || current?.unit || '').trim();
        quantities.set(key, {
          code,
          unit: unitFromKhoHang,
          quantity: (current?.quantity ?? 0) + 1,
          rollWeightKg: (current?.rollWeightKg ?? 0) + (rollKg ?? 0)
        });
      });
      if (quantities.size === 0) {
        throw new Error('Phiếu cân AI không có mã QR sản phẩm hợp lệ.');
      }

      const missingUnit = [...quantities.values()].filter(item => !item.unit).length;
      const lines = [...quantities.values()].map(({ code, unit, quantity, rollWeightKg }) => ({
        ...newProductLine(),
        mat_hang: code,
        don_vi: unit,
        so_luong: String(quantity),
        // Trọng lượng cuộn = tổng cột «Cân sản phẩm» (cả lõi, chưa trừ bì)
        trong_luong: rollWeightKg > 0 ? formatAutoWeight(rollWeightKg) : ''
      }));
      setHeader(prev => ({ ...prev, ngay, ca }));
      updateSection('Thành phẩm', section => ({ ...section, lines }));
      setIsAutoReportOpen(false);
      setMessage(
        `Đã tự động điền ${lines.length} mã SP (gom theo tiền tố) từ ${matched.length} phiếu cân AI (SL = tổng số lần cân, TL = tổng Cân sản phẩm / trọng lượng cuộn, ĐVT từ Kho hàng)${
          skipped ? `; bỏ qua ${skipped} bản ghi không có QR hợp lệ` : ''
        }${missingUnit ? `; ${missingUnit} mã chưa có ĐVT trên /kho-hang` : ''}.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo báo cáo tự động.');
    } finally {
      setIsLoadingAutoReport(false);
    }
  };

  const visibleTypes = editingId && editingType ? [editingType] : MATERIAL_TYPES;

  return (
    <div className="space-y-3 pb-1 sm:space-y-4">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4 sm:py-3">
          <h2 className="min-w-0 flex-1 text-sm font-black text-zinc-950 sm:text-base">
            {editingId ? `Sửa phiếu ${MATERIAL_TYPE_TITLE_LABELS[editingType || 'Thành phẩm']}` : 'Báo cáo sản lượng'}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!editingId && (
              <button
                type="button"
                onClick={resetAll}
                disabled={isSaving || Boolean(uploadingType)}
                className="inline-flex h-9 shrink-0 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60 sm:h-10 sm:px-3 sm:text-xs"
              >
                Làm mới
              </button>
            )}
            {!editingId && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSaving || Boolean(uploadingType)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60 sm:h-10 sm:px-4 sm:text-xs"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu báo cáo
              </button>
            )}
            {onOpenList && (
              <button
                type="button"
                onClick={onOpenList}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:h-10 sm:gap-1.5 sm:px-3 sm:text-xs"
              >
                <List className="h-4 w-4" />
                <span className="hidden min-[380px]:inline">Danh sách</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:h-10 sm:gap-1.5 sm:px-3 sm:text-xs"
              aria-label="Quay lại"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden min-[380px]:inline">Quay lại</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 bg-zinc-50 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="field-cell">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" /> Ngày
              </span>
              <input type="date" value={header.ngay} onChange={e => handleDateChange(e.target.value)} className={inputClass} />
            </label>
            <label className="field-cell">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <Cpu className="h-3.5 w-3.5 text-[#ef1b2d]" /> Máy
              </span>
              <ComboSelect
                value={teamSelectValue}
                onChange={handleTeamChange}
                options={teamOptions}
                placeholder="Chọn máy..."
                inputClassName={inputClass}
                comboboxMode
                comboboxSearchable={false}
                matchDropdownWidth
                getValue={item => (item as MachineOption).id}
                getLabel={item => {
                  const team = item as MachineOption;
                  return team.code && team.name && team.code !== team.name
                    ? `${team.code} · ${team.name}`
                    : team.name || team.code;
                }}
              />
            </label>
            <label className="field-cell">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                Ca
              </span>
              <select
                value={header.ca}
                onChange={event => handleShiftChange(event.target.value)}
                disabled={shiftSelectOptions.length === 0}
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value="">
                  {shiftSelectOptions.length > 0 ? 'Chọn ca...' : 'Chưa có ca trong Cài đặt'}
                </option>
                {shiftSelectOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label || option.value}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-3">
              <label className="field-cell flex-1">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <Clock3 className="h-3.5 w-3.5 text-[#ef1b2d]" /> Giờ
                </span>
                <input
                  type="time"
                  value={header.gio}
                  onChange={e => setHeader(prev => ({ ...prev, gio: e.target.value }))}
                  className={`${inputClass} h-9`}
                />
              </label>
              <label className="field-cell flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lần</span>
                <input
                  value={header.lan}
                  onChange={e => setHeader(prev => ({ ...prev, lan: e.target.value }))}
                  className={`${inputClass} h-9`}
                  placeholder="VD: 1"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {visibleTypes.map(type => {
        const section = sections[type];
        const productSelectOptions = productOptionsByType[type];
        const isUploading = uploadingType === type;
        return (
          <section key={type} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4 sm:py-3">
              <h3 className="min-w-0 flex-1 text-sm font-black text-zinc-950">
                Phiếu {MATERIAL_TYPE_TITLE_LABELS[type]}
              </h3>
            </div>

            <div className="border-t border-zinc-100 bg-white p-3 sm:p-4">
              <RepeatableLinesBlock
                title="Mã SP & số lượng"
                required
                showColumnHeaders
                gridTemplateClass={productLineGridClass}
                noWrapHeader
                horizontalScroll
                onAdd={() => addProductLine(type)}
                addLabel="Thêm dòng"
                hideAddButton={Boolean(editingId)}
                addButtonClassName="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
                mobileHeader={
                  <div className={`grid ${productLineGridClass} items-end gap-2 border-b border-zinc-200/80 pb-1.5`}>
                    <span className={`${mobileProductColumnLabelClass} justify-self-center text-center`}>STT</span>
                    <span className={mobileProductColumnLabelClass}>Mã SP *</span>
                    <span className={mobileProductColumnLabelClass}>Tên SP</span>
                    <span className={`${mobileProductColumnLabelClass} text-center`}>ĐVT</span>
                    <span className={`${mobileProductColumnLabelClass} text-center`}>SL *</span>
                    <span className={`${mobileProductColumnLabelClass} text-center`}>Trọng lượng</span>
                    <span className={`${mobileProductColumnLabelClass} text-center`}>Đơn vị</span>
                    <span />
                  </div>
                }
                extraHeaderButtons={
                  !editingId ? (
                    <div className="flex items-center gap-1.5">
                      {type === 'Thành phẩm' ? (
                        <button
                          type="button"
                          onClick={openAutoReport}
                          className="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
                          aria-label="Tạo báo cáo tự động từ phiếu cân AI"
                          title="Chọn ngày và ca để lấy dữ liệu phiếu cân AI"
                        >
                          <Scale className="h-3.5 w-3.5 shrink-0" />
                          <span>Tự động BC</span>
                        </button>
                      ) : null}
                      {type === 'Thành phẩm' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setScannerMode('camera');
                            setIsQrScannerOpen(true);
                          }}
                          className="hidden"
                          aria-label="Quét QR mã SP bằng camera"
                          title="Quét QR mã SP bằng camera"
                        >
                          <ScanBarcode className="h-3.5 w-3.5 shrink-0" />
                          <span className="hidden min-[380px]:inline">Quét ĐT</span>
                        </button>
                      ) : null}
                    </div>
                  ) : undefined
                }
                columns={[
                  { key: 'stt', label: 'STT', className: 'justify-self-center text-center' },
                  { key: 'mat_hang', label: 'Mã SP', required: true },
                  { key: 'ten_sp', label: 'Tên SP' },
                  { key: 'don_vi', label: 'ĐVT' },
                  { key: 'so_luong', label: 'SL', required: true },
                  { key: 'trong_luong', label: 'Trọng lượng' },
                  { key: 'don_vi_trong_luong', label: 'Đơn vị' },
                  { key: 'actions', label: '' }
                ]}
              >
                {section.lines.map((line, index) => {
                  const matchedProduct = findProductOption(line.mat_hang, productSelectOptions);
                  const productName = matchedProduct?.name || '';
                  return (
                    <RepeatableLineRow
                      key={line.id}
                      gridTemplateClass={productLineGridClass}
                      className={
                        highlightLine && highlightLine.type === type && highlightLine.lineId === line.id
                          ? 'line-added-flash rounded-lg'
                          : ''
                      }
                    >
                      <div className="flex min-w-0 items-center justify-center justify-self-center">
                        <span className="flex h-10 w-7 items-center justify-center rounded-md bg-[#ef1b2d] text-[11px] font-black text-white">
                          {index + 1}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <SearchableSelect
                          value={line.mat_hang}
                          onChange={code => handleLineProductChange(type, line.id, code)}
                          options={productSelectOptions}
                          placeholder="Mã SP"
                          isLoading={isLoadingProducts}
                          inputClassName={inputClass}
                          getValue={item => (item as ProductSelectOption).code}
                          getLabel={item => {
                            const product = item as ProductSelectOption;
                            return product.name ? `${product.code} · ${product.name}` : product.code;
                          }}
                          getDisplayLabel={item => (item as ProductSelectOption).code}
                          getSearchText={item => {
                            const product = item as ProductSelectOption;
                            return `${product.code} ${product.name}`.trim();
                          }}
                          renderOption={item => renderProductOption(item as ProductSelectOption)}
                        />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`${inputClass} flex h-auto min-h-10 items-center whitespace-normal break-words bg-zinc-50 py-2 leading-snug text-zinc-700`}
                          title={productName || undefined}
                          aria-label="Tên SP"
                        >
                          {productName || (
                            <span className="font-semibold text-zinc-400">Tự động theo mã SP</span>
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.don_vi}
                          readOnly
                          className={`${inputClass} bg-zinc-50 px-1.5 text-center text-zinc-600 sm:px-3 sm:text-left`}
                          placeholder="-"
                          aria-label="ĐVT"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.so_luong}
                          onChange={e => handleLineQuantityChange(type, line.id, e.target.value)}
                          className={`${inputClass} px-1.5 text-center sm:px-3 sm:text-left`}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label="Số lượng"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.trong_luong}
                          onChange={e => handleLineWeightChange(type, line.id, e.target.value)}
                          className={`${inputClass} px-1.5 text-center sm:px-3 sm:text-left`}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label="Trọng lượng"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value="Kg"
                          readOnly
                          className={`${inputClass} bg-zinc-50 px-1.5 text-center text-zinc-600 sm:px-3 sm:text-left`}
                          aria-label="Đơn vị trọng lượng"
                        />
                      </div>
                      <div className="flex min-w-0 items-center justify-center">
                        {!editingId && section.lines.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeProductLine(type, line.id)}
                            className="inline-flex h-10 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:w-10"
                            aria-label={`Xóa dòng ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </RepeatableLineRow>
                  );
                })}
              </RepeatableLinesBlock>

              <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ảnh *</span>
                <div className="flex items-center gap-2">
                  <input
                    ref={el => {
                      cameraInputRefs.current[type] = el;
                    }}
                    {...CAMERA_IMAGE_INPUT_PROPS}
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      e.target.value = '';
                      void handleImagePick(type, file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => pickImage(type)}
                    disabled={isUploading}
                    className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition disabled:opacity-60 ${
                      section.imagePreview
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {isUploading ? 'Đang xử lý ảnh...' : section.imagePreview ? 'Chụp lại ảnh' : 'Chụp ảnh'}
                  </button>
                  {section.imagePreview ? (
                    <WeighingImageThumbnail
                      url={section.imagePreview}
                      alt={`Ảnh phiếu ${MATERIAL_TYPE_LABELS[type]}`}
                      title="Ảnh đã chụp — bấm để xem"
                      onView={() =>
                        setViewingImage({
                          url: section.imagePreview,
                          title: `Ảnh phiếu ${MATERIAL_TYPE_LABELS[type]}`
                        })
                      }
                      className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-200 ring-2 ring-emerald-100"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            {editingId ? (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-white px-3 py-3 sm:px-4">
                <button type="button" onClick={resetAll} className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700">
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleUpdateSingle}
                  disabled={isSaving || Boolean(uploadingType)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Cập nhật
                </button>
              </div>
            ) : null}
          </section>
        );
      })}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {isAutoReportOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 className="text-base font-black text-zinc-950">Tự động báo cáo sản lượng</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Lấy mã SP và cộng số lượng từ phiếu cân AI.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAutoReportOpen(false)}
                disabled={isLoadingAutoReport}
                className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <label className="field-cell">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                <input
                  type="date"
                  value={autoReportFilter.ngay}
                  onChange={event => setAutoReportFilter(prev => ({ ...prev, ngay: event.target.value, ca: '' }))}
                  className={inputClass}
                />
              </label>
              <label className="field-cell">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
                <select
                  value={autoReportFilter.ca}
                  onChange={event => setAutoReportFilter(prev => ({ ...prev, ca: event.target.value }))}
                  disabled={autoReportShiftOptions.length === 0}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <option value="">
                    {autoReportShiftOptions.length > 0 ? 'Chọn ca...' : 'Chưa có ca trong Cài đặt'}
                  </option>
                  {autoReportShiftOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label || option.value}
                    </option>
                  ))}
                </select>
              </label>
              <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold leading-5 text-blue-800">
                Mỗi QR cân AI được tính là 1 sản phẩm. Các QR cùng mã SP sẽ được cộng thành một dòng số lượng. Dữ liệu sẽ điền vào phiếu Thành phẩm.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsAutoReportOpen(false)}
                disabled={isLoadingAutoReport}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleAutoReport()}
                disabled={isLoadingAutoReport || !autoReportFilter.ngay || !autoReportFilter.ca}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white disabled:opacity-50"
              >
                {isLoadingAutoReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                {isLoadingAutoReport ? 'Đang lấy dữ liệu...' : 'Tự động điền'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductQrScanner
        open={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onScan={handleQrScan}
        hardwareOnly={scannerMode === 'hardware'}
        getConfirmMessage={getQrConfirmMessage}
        requireConfirm={false}
        scannedCount={scannedQrCount}
      />
      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />
    </div>
  );
}

export function normalizeAcceptanceReports(data: unknown): AcceptanceReport[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { reports?: unknown }).reports;
  if (!Array.isArray(rows)) return [];
  return rows.map((item: Record<string, unknown>) => normalizeReportFromApi(item));
}
