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
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
import { CAMERA_IMAGE_INPUT_PROPS, compressImageDataUrl } from '../utils/cameraCapture';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { getProductionShiftOptions, normalizeShiftSettings, type ShiftSetting } from '../utils/shiftSettings';

const productLineGridClass =
  'grid-cols-1 sm:grid-cols-[2.25rem_minmax(0,1.1fr)_minmax(0,1.3fr)_4rem_6rem_7rem_4rem_2.5rem]';

const mobileFieldLabelClass =
  'mb-0.5 block text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:hidden';

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
}

const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

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
  if (!orderShift || !selectedShift) return false;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
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
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Legacy: MãSP+LSX...
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  // Tem thực tế: MãSP-ddmmyy + serial random (vd MT- MN009-3107263087).
  // Vẫn nhận dấu _ để tương thích với các tem đã tạo trước đây.
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

function productCodeFromOrder(order: ProductionOrderOption) {
  return order.productCode.trim() || order.productName.trim();
}

function lineHasProductCode(line: ProductLine, code: string) {
  const target = normalizeKey(code);
  if (!target) return false;
  return normalizeKey(parseQrProductCode(line.mat_hang)) === target;
}

function findProductOption(code: string, options: ProductSelectOption[]) {
  const key = normalizeKey(parseQrProductCode(code));
  if (!key) return null;
  return options.find(option => normalizeKey(option.code) === key) ?? null;
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

function newReportForm(overrides?: Partial<{ ngay: string; ca: string }>) {
  return {
    ngay: overrides?.ngay || todayIso(),
    ca: overrides?.ca || '',
    lan: '1',
    gio: nowTimeValue(),
    ma_may: '',
    ten_may: '',
    loai_vat_tu: 'Thành phẩm',
    machineRef: '',
    teamId: '',
    lines: [newProductLine()],
    hinh_anh: '',
    hinh_anh_public_id: '',
    imagePreview: ''
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
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [form, setForm] = useState(newReportForm());
  const formLinesRef = useRef(form.lines);
  formLinesRef.current = form.lines;
  const isAutoReportMaterialType = form.loai_vat_tu === 'Thành phẩm';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'hardware' | 'camera'>('hardware');
  const [isAutoReportOpen, setIsAutoReportOpen] = useState(false);
  const [isLoadingAutoReport, setIsLoadingAutoReport] = useState(false);
  const [autoReportFilter, setAutoReportFilter] = useState({ ngay: todayIso(), ca: '' });
  const [highlightLineId, setHighlightLineId] = useState('');
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError('');
      try {
        const [machineRes, productionRes, productRes, settingsRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/lenh-sx'),
          fetch('/api/san-pham?format=table'),
          fetch('/api/cai-dat')
        ]);
        const machineData = await machineRes.json().catch(() => ({}));
        const productionData = await productionRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));
        const settingsData = await settingsRes.json().catch(() => ({}));
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
    setForm(newReportForm({ ngay: createPrefill.ngay, ca: createPrefill.ca }));
    setEditingId(null);
    setError('');
    setMessage('');
    onCreatePrefillConsumed?.();
  }, [createPrefill, onCreatePrefillConsumed]);

  useEffect(() => {
    if (!highlightLineId) return;
    const timer = window.setTimeout(() => setHighlightLineId(''), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightLineId]);

  // Tự tăng "Lần" theo cùng ngày + cùng ca khi tạo phiếu mới
  useEffect(() => {
    if (editingId) return;
    const ngay = form.ngay.trim();
    const ca = form.ca.trim();
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
        setForm(prev => {
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
  }, [form.ngay, form.ca, editingId]);

  const ordersForSelectedDay = useMemo(
    () => productionOrders.filter(order => order.startDate === form.ngay),
    [productionOrders, form.ngay]
  );

  const settingShiftOptions = useMemo(
    () => getProductionShiftOptions(shiftSettings).map(option => option.value),
    [shiftSettings]
  );

  /** Nguồn Ca duy nhất: trang Cài đặt (`/api/cai-dat`). */
  const shiftOptions = settingShiftOptions;

  const teamOptions = useMemo(
    () =>
      [...machines]
        .filter(machine => machine.code || machine.name)
        .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'vi')),
    [machines]
  );

  const orderProductOptions = useMemo(() => {
    if (!form.ca || (!form.ma_may.trim() && !form.ten_may.trim())) return [] as ProductSelectOption[];

    return ordersForSelectedDay
      .filter(
        order =>
          shiftMatches(order.shift, form.ca) &&
          machineMatches(order.machine, form.ma_may, form.ten_may, form.machineRef || form.ten_may || form.ma_may)
      )
      .map(order => ({
        code: productCodeFromOrder(order),
        name: order.productName,
        unit: order.unit && order.unit !== '-' ? order.unit : '',
        totalWeightKg: null
      }))
      .filter(item => item.code && item.code !== '-');
  }, [ordersForSelectedDay, form.ca, form.ma_may, form.ten_may, form.machineRef]);

  const productSelectOptions = useMemo(() => {
    const byCode = new Map<string, ProductSelectOption>();

    catalogProducts.forEach(product => {
      const key = normalizeKey(product.code);
      if (!key) return;
      byCode.set(key, product);
    });

    orderProductOptions.forEach(product => {
      const key = normalizeKey(product.code);
      if (!key) return;
      const existing = byCode.get(key);
      byCode.set(key, {
        code: product.code,
        name: product.name || existing?.name || '',
        unit: product.unit || existing?.unit || '',
        totalWeightKg: existing?.totalWeightKg ?? product.totalWeightKg
      });
    });

    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  }, [catalogProducts, orderProductOptions]);

  const handleDateChange = (ngay: string) => {
    setForm(prev => ({
      ...prev,
      ngay,
      ca: '',
      ma_may: '',
      ten_may: '',
      machineRef: '',
      teamId: '',
      lines: [newProductLine()]
    }));
  };

  const handleShiftChange = (ca: string) => {
    setForm(prev => ({
      ...prev,
      ca,
      lines: [newProductLine()]
    }));
  };

  const handleTeamChange = (teamId: string) => {
    const team = machines.find(machine => machine.id === teamId);
    if (!team) {
      setForm(prev => ({
        ...prev,
        teamId: '',
        machineRef: '',
        ma_may: '',
        ten_may: '',
        lines: [newProductLine()]
      }));
      return;
    }

    const machineRef = team.name || team.code;
    setForm(prev => ({
      ...prev,
      teamId: team.id,
      machineRef,
      ma_may: team.code,
      ten_may: team.name,
      lines: [newProductLine()]
    }));
  };

  const handleLineProductChange = (lineId: string, mat_hang: string) => {
    if (
      mat_hang &&
      form.lines.some(line => line.id !== lineId && lineHasProductCode(line, mat_hang))
    ) {
      setError(`Mã SP "${parseQrProductCode(mat_hang)}" đã có trong danh sách.`);
      return;
    }

    const match = findProductOption(mat_hang, productSelectOptions);
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(line =>
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

  const handleLineQuantityChange = (lineId: string, so_luong: string) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(line => {
        if (line.id !== lineId) return line;
        const product = findProductOption(line.mat_hang, productSelectOptions);
        return { ...line, so_luong, trong_luong: calculateProductWeight(product, so_luong) };
      })
    }));
  };

  const handleLineWeightChange = (lineId: string, trong_luong: string) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(line => (line.id === lineId ? { ...line, trong_luong } : line))
    }));
  };

  const addProductLine = () => {
    setForm(prev => ({ ...prev, lines: [...prev.lines, newProductLine()] }));
  };

  const removeProductLine = (lineId: string) => {
    setForm(prev => {
      if (prev.lines.length <= 1) return prev;
      return { ...prev, lines: prev.lines.filter(line => line.id !== lineId) };
    });
  };

  const handleQrScan = useCallback(
    (raw: string): boolean | 'duplicate' => {
      setMessage('');

      const code = parseQrProductCode(raw);
      if (!code) {
        setError('Mã QR không hợp lệ.');
        return false;
      }

      if (isLoadingProducts) {
        setError('Danh mục sản phẩm đang tải. Vui lòng quét lại sau ít giây.');
        return false;
      }

      const matchedProduct = findProductOption(code, productSelectOptions);
      if (!matchedProduct) {
        setError(`Không tìm thấy mã SP "${code}" trong danh mục.`);
        return false;
      }

      // Dùng mã chuẩn trong danh mục sau khi đã tách phần ngày + serial của tem QR.
      const productCode = matchedProduct.code;
      const unit = matchedProduct.unit;
      const currentLines = formLinesRef.current;
      const existingIndex = currentLines.findIndex(line => lineHasProductCode(line, productCode));

      if (existingIndex >= 0) {
        const targetLine = currentLines[existingIndex];
        setHighlightLineId(targetLine.id);
        setError(`Mã SP "${productCode}" đã có trên form, không tăng số lượng.`);
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
        formLinesRef.current = nextLines;
        setForm(prev => ({ ...prev, lines: nextLines }));
        setError('');
        setHighlightLineId(targetLine.id);
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
      const nextLines = [...currentLines, nextLine];
      formLinesRef.current = nextLines;
      setForm(prev => ({ ...prev, lines: nextLines }));
      setError('');
      setHighlightLineId(nextLine.id);
      setMessage(`Đã thêm mã SP: ${productCode}`);
      return true;
    },
    [isLoadingProducts, productSelectOptions]
  );

  const getQrConfirmMessage = useCallback((code: string) => {
    const exists = formLinesRef.current.some(line => lineHasProductCode(line, code));
    if (exists) {
      return `Mã SP ${code} đã có trên form — hệ thống sẽ không thêm và không tăng SL.`;
    }
    const hasBlankLine = formLinesRef.current.some(line => isBlankProductLine(line));
    if (hasBlankLine) {
      return `Đã quét mã ${code}. Bấm Xác nhận để điền vào dòng trống.`;
    }
    return `Đã quét mã ${code}. Bấm Xác nhận để thêm dòng mới.`;
  }, []);

  const scannedQrCount = useMemo(
    () => form.lines.filter(line => !isBlankProductLine(line)).length,
    [form.lines]
  );

  const handleImagePick = async (file: File | null) => {
    if (!file) return;
    setError('');
    setMessage('');
    setIsUploading(true);
    try {
      const rawDataUrl = await fileToDataUrl(file);
      let dataUrl = rawDataUrl;
      try {
        dataUrl = await compressImageDataUrl(rawDataUrl);
      } catch {
        dataUrl = rawDataUrl;
      }
      setForm(prev => ({ ...prev, imagePreview: dataUrl, hinh_anh: dataUrl, hinh_anh_public_id: '' }));
      try {
        const uploaded = await uploadImage(dataUrl);
        setForm(prev => ({
          ...prev,
          hinh_anh: uploaded.imageUrl,
          hinh_anh_public_id: uploaded.imagePublicId,
          imagePreview: uploaded.imageUrl
        }));
        setMessage('Đã chụp ảnh.');
      } catch {
        setMessage('Đã chụp ảnh (sẽ upload khi lưu báo cáo).');
      }
    } catch (err: any) {
      setForm(prev => ({ ...prev, imagePreview: '', hinh_anh: '', hinh_anh_public_id: '' }));
      setError(err.message || 'Không thể đọc file ảnh.');
    } finally {
      setIsUploading(false);
    }
  };

  const pickImage = () => {
    if (isUploading) return;
    cameraInputRef.current?.click();
  };

  const resolveImageForSave = async () => {
    const source = form.hinh_anh.trim() || form.imagePreview.trim();
    if (!source) return null;
    if (!source.startsWith('data:')) {
      return { hinh_anh: source, hinh_anh_public_id: form.hinh_anh_public_id || '' };
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

  const resetForm = () => {
    setEditingId(null);
    setForm(newReportForm());
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
    setEditingId(report.id);
    setForm({
      ngay: report.ngay || todayIso(),
      ca: report.ca,
      lan: report.lan || '1',
      gio: report.gio || nowTimeValue(),
      ma_may: report.ma_may,
      ten_may: report.ten_may,
      loai_vat_tu: report.loai_vat_tu || 'Thành phẩm',
      machineRef,
      teamId: linked?.id ?? '',
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
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const parseLineQuantity = (value: string) => Number(String(value).replace(',', '.'));

  const validateForm = () => {
    if (!form.ngay.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày.'));
      return null;
    }
    if (!form.ca.trim()) {
      setError(showSaveFailure('Vui lòng chọn ca.'));
      return null;
    }
    if (!form.ma_may.trim() && !form.ten_may.trim()) {
      setError(showSaveFailure('Vui lòng chọn máy.'));
      return null;
    }
    if (!form.loai_vat_tu.trim()) {
      setError(showSaveFailure('Vui lòng chọn loại vật tư.'));
      return null;
    }
    if (!form.lan.trim()) {
      setError(showSaveFailure('Vui lòng nhập lần ghi nhận.'));
      return null;
    }

    const validLines = form.lines
      .map(line => {
        const soLuong = parseLineQuantity(line.so_luong);
        const trongLuong = line.trong_luong.trim() ? parseLineQuantity(line.trong_luong) : null;
        return { ...line, soLuong, trongLuong };
      })
      .filter(line => line.mat_hang.trim() || line.so_luong.trim());

    if (validLines.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một dòng mã SP và số lượng.'));
      return null;
    }

    for (const line of validLines) {
      if (!line.mat_hang.trim()) {
        setError(showSaveFailure('Vui lòng chọn mã SP cho từng dòng.'));
        return null;
      }
      if (!Number.isFinite(line.soLuong) || line.soLuong <= 0) {
        setError(showSaveFailure(`Số lượng phải lớn hơn 0 (${line.mat_hang}).`));
        return null;
      }
      if (line.trongLuong !== null && (!Number.isFinite(line.trongLuong) || line.trongLuong < 0)) {
        setError(showSaveFailure(`Trọng lượng không hợp lệ (${line.mat_hang}).`));
        return null;
      }
    }

    if (!form.hinh_anh.trim() && !form.imagePreview.trim()) {
      setError(showSaveFailure('Vui lòng chụp ảnh chung cho các dòng sản lượng.'));
      return null;
    }

    return validLines;
  };

  const handleSave = async () => {
    const validLines = validateForm();
    if (!validLines) return;

    setIsSaving(true);
    setError('');
    setMessage('');

    try {
      const resolvedImage = await resolveImageForSave();
      if (!resolvedImage) {
        setError(showSaveFailure('Vui lòng chụp ảnh chung cho các dòng sản lượng.'));
        return;
      }

      const sharedPayload = {
        ngay: form.ngay,
        ca: form.ca,
        lan: form.lan,
        gio: form.gio,
        ma_may: form.ma_may,
        ten_may: form.ten_may,
        loai_vat_tu: form.loai_vat_tu,
        hinh_anh: resolvedImage.hinh_anh,
        hinh_anh_public_id: resolvedImage.hinh_anh_public_id
      };

      if (editingId) {
        const line = validLines[0];
        const res = await fetch(`/api/bao-cao-nghiem-thu/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...sharedPayload,
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
      } else {
        let savedCount = 0;
        for (const line of validLines) {
          const res = await fetch('/api/bao-cao-nghiem-thu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...sharedPayload,
              mat_hang: line.mat_hang,
              don_vi: line.don_vi,
              so_luong: line.soLuong,
              trong_luong: line.trongLuong,
              don_vi_trong_luong: 'Kg'
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu báo cáo sản lượng.'));
          savedCount += 1;
        }
        const okMsg =
          savedCount > 1 ? `Đã lưu ${savedCount} dòng sản lượng với ảnh chung.` : 'Đã lưu báo cáo sản lượng.';
        setMessage(okMsg);
        showAppToast(okMsg);
      }

      resetForm();
    } catch (err: any) {
      setError(showSaveFailure(err, 'Không thể lưu báo cáo sản lượng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const teamSelectValue =
    form.teamId ||
    machines.find(machine => machine.id === form.machineRef)?.id ||
    machines.find(machine => machine.code === form.ma_may || machine.name === form.ten_may)?.id ||
    '';

  const openAutoReport = () => {
    setAutoReportFilter({ ngay: form.ngay || todayIso(), ca: form.ca });
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
      const params = new URLSearchParams({ from: ngay, to: ngay, limit: '2000' });
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

      const quantities = new Map<string, { code: string; unit: string; quantity: number }>();
      let skipped = 0;
      matched.forEach(record => {
        const qrProductCode = parseQrProductCode(String(record.qr_code ?? ''));
        if (!qrProductCode) {
          skipped += 1;
          return;
        }
        const product = findProductOption(qrProductCode, productSelectOptions);
        const code = product?.code || qrProductCode;
        const key = normalizeKey(code);
        const current = quantities.get(key);
        quantities.set(key, {
          code,
          unit: product?.unit || current?.unit || String(record.unit ?? '').trim(),
          quantity: (current?.quantity ?? 0) + 1
        });
      });
      if (quantities.size === 0) {
        throw new Error('Phiếu cân AI không có mã QR sản phẩm hợp lệ.');
      }

      const lines = [...quantities.values()].map(({ code, unit, quantity }) => ({
        ...newProductLine(),
        mat_hang: code,
        don_vi: unit,
        so_luong: String(quantity),
        trong_luong: calculateProductWeight(
          findProductOption(code, productSelectOptions),
          String(quantity)
        )
      }));
      setForm(prev => ({
        ...prev,
        ngay,
        ca,
        lines
      }));
      setIsAutoReportOpen(false);
      setMessage(
        `Đã tự động điền ${lines.length} mã SP từ ${matched.length} phiếu cân AI${
          skipped ? `; bỏ qua ${skipped} bản ghi không có QR hợp lệ` : ''
        }.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo báo cáo tự động.');
    } finally {
      setIsLoadingAutoReport(false);
    }
  };

  return (
    <div className="space-y-3 pb-24 sm:space-y-4">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4 sm:py-3">
          <h2 className="min-w-0 flex-1 text-sm font-black text-zinc-950 sm:text-base">Phiếu báo cáo sản lượng</h2>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Mobile: Ngày chiếm trọn 1 hàng vì ô date hiển thị dạng "ngày 22 thg 7, 2026" rất dài */}
            <label className="field-cell col-span-2 sm:col-span-1">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" /> Ngày
              </span>
              <input type="date" value={form.ngay} onChange={e => handleDateChange(e.target.value)} className={inputClass} />
            </label>
            <label className="field-cell">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <Cpu className="h-3.5 w-3.5 text-[#ef1b2d]" /> Máy
              </span>
              <select
                value={teamSelectValue}
                onChange={e => handleTeamChange(e.target.value)}
                className={inputClass}
              >
                <option value="">Chọn máy...</option>
                {teamOptions.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.code && team.name && team.code !== team.name
                      ? `${team.code} · ${team.name}`
                      : team.name || team.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-cell">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                Ca
              </span>
              <select
                value={form.ca}
                onChange={e => handleShiftChange(e.target.value)}
                className={inputClass}
                disabled={settingShiftOptions.length === 0}
              >
                <option value="">
                  {settingShiftOptions.length > 0 ? 'Chọn ca...' : 'Chưa có ca trong Cài đặt'}
                </option>
                {shiftOptions.map(shift => (
                  <option key={shift} value={shift}>
                    {shift}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="field-cell col-span-2 sm:col-span-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Loại vật tư *</span>
              <select
                value={form.loai_vat_tu}
                onChange={e => setForm(prev => ({ ...prev, loai_vat_tu: e.target.value }))}
                className={inputClass}
                required
              >
                <option value="Thành phẩm">Thành phẩm</option>
                <option value="Gia công">Gia công</option>
                <option value="SP lỗi">SP lỗi (Hàng hỏng)</option>
                <option value="SP rác">SP rác (Kho rác)</option>
              </select>
            </label>
            <label className="field-cell">
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                <Clock3 className="h-3.5 w-3.5 text-[#ef1b2d]" /> Giờ
              </span>
              <input
                type="time"
                value={form.gio}
                onChange={e => setForm(prev => ({ ...prev, gio: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="field-cell">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lần</span>
              <input
                value={form.lan}
                onChange={e => setForm(prev => ({ ...prev, lan: e.target.value }))}
                className={inputClass}
                placeholder="VD: 1"
              />
            </label>
          </div>
        </div>

        <div className="border-t border-zinc-100 bg-white p-3 sm:p-4">
          <RepeatableLinesBlock
            title="Mã SP & số lượng"
            required
            showColumnHeaders
            gridTemplateClass={productLineGridClass}
            onAdd={addProductLine}
            addLabel="Thêm dòng"
            hideAddButton={Boolean(editingId)}
            addButtonClassName="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c]"
            extraHeaderButtons={
              !editingId ? (
                <div className="flex items-center gap-1.5">
                  {isAutoReportMaterialType ? (
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
                </div>
              ) : undefined
            }
            columns={[
              { key: 'stt', label: 'STT', className: 'text-center' },
              { key: 'mat_hang', label: 'Mã SP', required: true },
              { key: 'ten_sp', label: 'Tên SP' },
              { key: 'don_vi', label: 'ĐVT' },
              { key: 'so_luong', label: 'SL', required: true },
              { key: 'trong_luong', label: 'Trọng lượng' },
              { key: 'don_vi_trong_luong', label: 'Đơn vị' },
              { key: 'actions', label: '' }
            ]}
          >
            {form.lines.map((line, index) => {
              const matchedProduct = findProductOption(line.mat_hang, productSelectOptions);
              const productName = matchedProduct?.name || '';
              return (
              <RepeatableLineRow
                key={line.id}
                gridTemplateClass={productLineGridClass}
                className={line.id === highlightLineId ? 'line-added-flash rounded-lg px-1' : ''}
              >
                {/* Mobile: 2 dòng — (1) mã/ĐVT/SL, (2) tên SP full. Desktop: grid cột. */}
                <div className="flex flex-col gap-1.5 sm:col-span-8">
                  <div className="flex min-w-0 flex-wrap items-end gap-1.5 sm:grid sm:grid-cols-[2.25rem_minmax(0,1.1fr)_minmax(0,1.3fr)_4rem_6rem_7rem_4rem_2.5rem] sm:gap-2">
                    <div className="flex shrink-0 items-center justify-center self-end pb-1.5 sm:col-start-1 sm:self-center sm:pb-0">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ef1b2d] text-[11px] font-black text-white">
                        {index + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-[1.4] sm:col-start-2 sm:flex-none">
                      <span className={mobileFieldLabelClass}>Mã SP *</span>
                      <SearchableSelect
                        value={line.mat_hang}
                        onChange={code => handleLineProductChange(line.id, code)}
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
                    <div className="w-12 shrink-0 sm:col-start-4 sm:w-auto sm:shrink">
                      <span className={mobileFieldLabelClass}>ĐVT</span>
                      <input
                        value={line.don_vi}
                        readOnly
                        className={`${inputClass} bg-zinc-50 px-1.5 text-center text-zinc-600 sm:px-3 sm:text-left`}
                        placeholder="-"
                        aria-label="ĐVT"
                      />
                    </div>
                    <div className="w-16 shrink-0 sm:col-start-5 sm:w-auto sm:shrink sm:flex-none">
                      <span className={mobileFieldLabelClass}>SL *</span>
                      <input
                        value={line.so_luong}
                        onChange={e => handleLineQuantityChange(line.id, e.target.value)}
                        className={`${inputClass} px-1.5 text-center sm:px-3 sm:text-left`}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label="Số lượng"
                      />
                    </div>
                    <div className="w-24 shrink-0 sm:col-start-6 sm:w-auto sm:shrink">
                      <span className={mobileFieldLabelClass}>Trọng lượng</span>
                      <input
                        value={line.trong_luong}
                        onChange={e => handleLineWeightChange(line.id, e.target.value)}
                        className={`${inputClass} px-1.5 text-center sm:px-3 sm:text-left`}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label="Trọng lượng"
                      />
                    </div>
                    <div className="w-14 shrink-0 sm:col-start-7 sm:w-auto sm:shrink">
                      <span className={mobileFieldLabelClass}>Đơn vị</span>
                      <input
                        value="Kg"
                        readOnly
                        className={`${inputClass} bg-zinc-50 px-1.5 text-center text-zinc-600 sm:px-3 sm:text-left`}
                        aria-label="Đơn vị trọng lượng"
                      />
                    </div>
                    {!editingId && form.lines.length > 1 ? (
                      <div className="shrink-0 self-end sm:col-start-8">
                        <button
                          type="button"
                          onClick={() => removeProductLine(line.id)}
                          className="inline-flex h-10 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:w-10"
                          aria-label={`Xóa dòng ${index + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <div className="order-last w-full min-w-0 sm:order-none sm:col-start-3 sm:row-start-1 sm:w-auto">
                      <span className={mobileFieldLabelClass}>Tên SP</span>
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
                  </div>
                </div>
              </RepeatableLineRow>
            );
            })}
          </RepeatableLinesBlock>

          <div className="mt-4 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ảnh chung *</span>
            <div className="flex items-center gap-2">
              <input
                ref={cameraInputRef}
                {...CAMERA_IMAGE_INPUT_PROPS}
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  void handleImagePick(file);
                }}
              />
              <button
                type="button"
                onClick={pickImage}
                disabled={isUploading}
                className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition disabled:opacity-60 ${
                  form.imagePreview
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {isUploading ? 'Đang xử lý ảnh...' : form.imagePreview ? 'Chụp lại ảnh' : 'Chụp ảnh'}
              </button>
              {form.imagePreview ? (
                <WeighingImageThumbnail
                  url={form.imagePreview}
                  alt="Ảnh chung"
                  title="Ảnh đã chụp — bấm để xem"
                  onView={() => setViewingImage({ url: form.imagePreview, title: 'Ảnh báo cáo sản lượng' })}
                  className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-200 ring-2 ring-emerald-100"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 bg-white px-3 py-3 sm:px-4">
          <button type="button" onClick={resetForm} className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700">
            Làm mới
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isUploading}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editingId ? 'Cập nhật' : 'Lưu báo cáo'}
          </button>
        </div>
      </section>

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
                  className={inputClass}
                >
                  <option value="">Chọn ca...</option>
                  {settingShiftOptions.map(shift => (
                    <option key={shift} value={shift}>{shift}</option>
                  ))}
                </select>
              </label>
              <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold leading-5 text-blue-800">
                Mỗi QR cân AI được tính là 1 sản phẩm. Các QR cùng mã SP sẽ được cộng thành một dòng số lượng.
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
