import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ClipboardList, Eye, Factory, FileText, Hash, ImagePlus, Loader2, Pencil, Plus, Save, Trash2, UserCheck, Users } from 'lucide-react';
import type { WeighingPendingAdd, WeighingRecord } from '../utils/weighingRecords';
import { generateWeighingDocumentNo, getWeighingDataRows, getCurrentWeighRound, getNextWeighRoundNumber, countWeighingRounds, formatWeighingRowTotalWeight, formatWeighingNetWeight, formatDamagedGoodsRowTotalWeight, formatWeighingWeightField, isDamagedOtherMaterial, damagedGoodsMaterialTypeLabel, isSlipHeaderRow, parseWeighingWeight, splitDamagedGoodsDefectWeights } from '../utils/weighingRecords';
import {
  convertWarehouseQuantityToKg,
  mapMaterialToWeightCatalogItem
} from '../utils/warehouseWeight';
import SearchableSelect from './SearchableSelect';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
import { CAMERA_IMAGE_INPUT_PROPS } from '../utils/cameraCapture';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { useTabAccess } from '../app/useTabAccess';
import { RowActionsMenu } from './shared/table';
import { FACTORY_PLACEHOLDER } from './layout/constants';

interface WeighingRow {
  id: number;
  dbId?: string | number;
  productionDate: string;
  shiftName: string;
  worker1: string;
  worker2: string;
  weigherName: string;
  productCode: string;
  productName: string;
  coreWeight: string;
  coreWeightImageUrl?: string;
  coreWeightImagePublicId?: string;
  shellWeight: string;
  plasticNoFilmWeight?: string;
  plasticNozzleWeight?: string;
  plasticFilmAdhesionWeight?: string;
  materialType?: string;
  materialCode?: string;
  materialQuantity?: string;
  acceptanceStatus: string;
  note: string;
  machineName: string;
  weighNo: string;
  weighTime: string;
  weight: string;
  imageUrl?: string;
  imagePublicId?: string;
  savedToDb?: boolean;
}

const DEFAULT_ROWS: WeighingRow[] = [];

function isRealMachineName(name?: string) {
  const value = String(name ?? '').trim();
  return Boolean(value) && value !== FACTORY_PLACEHOLDER;
}

function resolveMachineName(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (isRealMachineName(candidate)) {
      return String(candidate).trim();
    }
  }
  return '—';
}
import { DEFAULT_WEIGHING_SLIP_CONFIG, type WeighingSlipConfig } from '../lib/weighingSlipConfig';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
import {
  buildWeighingProductOptionsFromOrders,
  normalizeMixingProductionOrders,
  type MixingProductionOrder
} from '../utils/mixingOrderAutofill';
import { sanitizeDecimalTyping } from '../lib/mixingReportModel';
import { isRecyclingMachine } from '../utils/machineKind';

const DEFAULT_SHELL_WEIGHT = '0,16';
const ACCEPTANCE_STATUS_OPTIONS = ['Đạt', 'Không đạt'] as const;
/** Chọn «Khác» ở ô Lệnh SX khi sản phẩm phát sinh ngoài lệnh. */
const WEIGHING_OTHER_ORDER_CODE = '__KHAC__';
const WEIGHING_OTHER_ORDER_OPTION: MixingProductionOrder = {
  id: WEIGHING_OTHER_ORDER_CODE,
  orderCode: WEIGHING_OTHER_ORDER_CODE,
  shift: '',
  machine: '',
  startDate: '',
  staff: '',
  productLines: []
};

function readStoredWeigherName(storageKey: string) {
  try {
    return localStorage.getItem(storageKey) || '';
  } catch {
    return '';
  }
}

function storeWeigherName(storageKey: string, name: string) {
  try {
    if (name.trim()) {
      localStorage.setItem(storageKey, name.trim());
    }
  } catch {
    // ignore storage errors
  }
}

const inputClass = 'h-9 w-full rounded-md border border-ink-200 bg-ink-50 focus:bg-white px-2.5 text-[13px] font-semibold text-ink-900 outline-none transition placeholder:text-ink-400 placeholder:italic focus:border-accent-700 focus:ring-2 focus:ring-accent-700/20';
const compactHeaderInputClass =
  'mt-0.5 h-8 w-full rounded-md border border-ink-200 bg-white px-2 text-[11px] font-semibold text-ink-900 outline-none focus:border-accent-700 focus:ring-2 focus:ring-accent-700/20';
const modalInputClass =
  'h-9 w-full rounded-md border border-ink-200 bg-ink-50 focus:bg-white px-2.5 text-[13px] font-semibold text-ink-900 outline-none transition placeholder:text-ink-400 placeholder:italic focus:border-accent-700 focus:ring-2 focus:ring-accent-700/20';
const modalLabelClass = 'text-[9px] font-extrabold uppercase tracking-wide text-zinc-500 leading-tight';
const modalCompactLabelClass = 'text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getCurrentWeighTime() {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function formatWeighRound(round: string | number) {
  return `Lần ${round}`;
}

async function uploadImage(imageDataUrl: string) {
  const res = await fetch('/api/cloudinary/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Không thể upload ảnh lên Cloudinary.');
  }
  return { imageUrl: data.url as string, imagePublicId: data.publicId as string };
}

interface ProductOption {
  productName: string;
  productCode: string;
  newCode?: string;
}

interface MachineOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface MaterialOption {
  code: string;
  name: string;
  unit: string;
  totalWeight?: string;
  coreWeight?: string;
  bagWeight?: string;
  plasticWeight?: string;
}

function normalizeMaterials(data: unknown): MaterialOption[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
    ? (data as { materials: Record<string, unknown>[] }).materials
    : [];
  return rows
    .map(row => ({
      code: String(row.ma_npl ?? '').trim(),
      name: String(row.ten_npl ?? '').trim(),
      unit: String(row.don_vi ?? '').trim(),
      totalWeight:
        row.tong_trong_luong === null || row.tong_trong_luong === undefined || row.tong_trong_luong === ''
          ? ''
          : String(row.tong_trong_luong),
      coreWeight:
        row.trong_luong_loi === null || row.trong_luong_loi === undefined || row.trong_luong_loi === ''
          ? ''
          : String(row.trong_luong_loi),
      bagWeight:
        row.trong_luong_tui === null || row.trong_luong_tui === undefined || row.trong_luong_tui === ''
          ? ''
          : String(row.trong_luong_tui),
      plasticWeight:
        row.trong_luong_nhua === null || row.trong_luong_nhua === undefined || row.trong_luong_nhua === ''
          ? ''
          : String(row.trong_luong_nhua)
    }))
    .filter(row => row.code);
}

function formatDamagedOtherMaterialWeightInput(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(value);
}

/** KL vật tư khác (kg) = Số lượng × Tổng kg/đvt trong kho NVL. */
function computeDamagedOtherMaterialWeightKg(
  materialCode: string,
  quantityText: string,
  materials: MaterialOption[]
): string {
  const code = materialCode.trim();
  const quantity = parseWeighingWeight(quantityText);
  if (!code || quantity === null || quantity <= 0) return '';

  const material = materials.find(item => item.code === code);
  if (!material) return '';

  const kg = convertWarehouseQuantityToKg({
    quantity,
    unit: material.unit || 'cái',
    itemCode: material.code,
    warehouseKind: 'nvl',
    materials: [mapMaterialToWeightCatalogItem(material)],
    // Ưu tiên Tổng kg; thiếu thì suy từ tên/mã (vd. L1.5m-1kg).
    preferTongKgOnly: false
  });
  if (kg === null || !Number.isFinite(kg) || kg <= 0) return '';
  return formatDamagedOtherMaterialWeightInput(kg);
}

function normalizeProducts(data: unknown): ProductOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  return rows
    .map((item): ProductOption | null => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { productName: name, productCode: '' } : null;
      }

      if (!item || typeof item !== 'object') return null;

      if ('productName' in item) {
        const record = item as ProductOption;
        const productName = String(record.productName ?? '').trim();
        const productCode = String(record.productCode ?? '').trim();
        const newCode = String(record.newCode ?? '').trim();
        if (!productName && !productCode) return null;
        return { productName, productCode, newCode: newCode || undefined };
      }

      const record = item as Record<string, unknown>;
      const productName = String(
        record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
      ).trim();
      const productCode = String(
        record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
      ).trim();
      const newCode = String(record.ma_sp_moi ?? record.newCode ?? '').trim();
      if (!productName && !productCode) return null;
      return { productName, productCode, newCode: newCode || undefined };
    })
    .filter((item): item is ProductOption => Boolean(item));
}

function findProductByCode(products: ProductOption[], code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  return (
    products.find(
      product =>
        product.productCode.toLowerCase() === normalized ||
        product.newCode?.toLowerCase() === normalized
    ) ?? null
  );
}

function resolveProductNameFromCode(
  products: ProductOption[],
  productCode: string,
  fallbackName = ''
) {
  const match = findProductByCode(products, productCode);
  if (match) return match.productName;
  return productCode.trim() ? '' : fallbackName;
}

function findProductByName(products: ProductOption[], name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  return products.find(product => product.productName.toLowerCase() === normalized) ?? null;
}

function normalizeMachines(data: unknown): MachineOption[] {
  if (!data || typeof data !== 'object') return [];
  const machines = (data as { machines?: unknown }).machines;
  if (!Array.isArray(machines)) return [];

  return machines
    .map((item): MachineOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = String(record.ten_may ?? record.name ?? record.may ?? '').trim();
      const code = String(record.ma_may ?? record.code ?? record.ma_so_may ?? '').trim();
      const type = String(record.loai_may ?? record.type ?? '').trim();
      if (!name) return null;
      return {
        id: String(record.id ?? code ?? name),
        code,
        name,
        type
      };
    })
    .filter((item): item is MachineOption => Boolean(item));
}

function MachineSelect({
  value,
  onChange,
  machines,
  isLoading,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  machines: MachineOption[];
  isLoading?: boolean;
  className?: string;
}) {
  const machineNames = useMemo(() => new Set(machines.map(machine => machine.name)), [machines]);
  const selectedValue = !isLoading && value && machineNames.has(value) ? value : '';

  return (
    <div className="relative">
      <select
        value={selectedValue}
        onChange={e => onChange(e.target.value)}
        disabled={isLoading || machines.length === 0}
        className={`${className} appearance-none pr-9`}
      >
        <option value="">
          {isLoading
            ? 'Đang tải danh sách máy...'
            : machines.length === 0
              ? 'Chưa có máy — thêm tại Danh sách máy'
              : 'Chọn tên máy'}
        </option>
        {machines.map(machine => (
          <option key={machine.id} value={machine.name}>
            {machine.code ? `${machine.code} · ${machine.name}` : machine.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

interface StaffOption {
  name: string;
}

function normalizeStaff(data: unknown): StaffOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item.trim() };
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const name = String(record.name ?? record.nhan_su ?? record.ho_ten ?? record.ten ?? '').trim();
        if (name) return { name };
      }
      return null;
    })
    .filter((item): item is StaffOption => Boolean(item?.name));
}

function StaffSelect({
  value,
  onChange,
  staff,
  isLoading,
  placeholder,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  staff: StaffOption[];
  isLoading?: boolean;
  placeholder: string;
  className?: string;
}) {
  const staffNames = useMemo(() => new Set(staff.map(person => person.name)), [staff]);
  const selectedValue = !isLoading && value && staffNames.has(value) ? value : '';

  return (
    <div className="relative">
      <select
        value={selectedValue}
        onChange={e => onChange(e.target.value)}
        disabled={isLoading || staff.length === 0}
        className={`${className} appearance-none pr-9`}
      >
        <option value="">
          {isLoading
            ? 'Đang tải nhân sự...'
            : staff.length === 0
              ? 'Không có nhân sự'
              : placeholder}
        </option>
        {staff.map(person => (
          <option key={person.name} value={person.name}>{person.name}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

function ProductNameSelect({
  value,
  onChange,
  products,
  isLoading,
  className
}: {
  value: string;
  onChange: (value: string) => void;
  products: ProductOption[];
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={isLoading || products.length === 0}
      className={className}
    >
      <option value="">
        {isLoading
          ? 'Đang tải sản phẩm...'
          : products.length === 0
            ? 'Không có SP trong lệnh SX'
            : 'Chọn tên sản phẩm'}
      </option>
      {products.map(product => (
        <option key={`${product.productCode}-${product.productName}`} value={product.productName}>
          {product.productCode ? `${product.productCode} · ${product.productName}` : product.productName}
        </option>
      ))}
    </select>
  );
}

function getSlipInfo(rows: WeighingRow[]) {
  const source = rows[0];
  if (!source) return null;

  return {
    productionDate: source.productionDate
      ? source.productionDate.split('-').reverse().join('/')
      : '—',
    shiftName: source.shiftName || '—',
    worker1: source.worker1 || '—',
    worker2: source.worker2 || '—',
    machineName: resolveMachineName(...rows.map(row => row.machineName))
  };
}

function getSlipContextFromRows(rowList: WeighingRow[]) {
  const source = rowList[0];
  if (!source) return null;

  return {
    productionDate: source.productionDate,
    shiftName: source.shiftName,
    worker1: source.worker1,
    worker2: source.worker2,
    machineName: source.machineName
  };
}

function recordsToRows(records: WeighingRecord[]): WeighingRow[] {
  return records.map((record, index) => ({
    id: index + 1,
    dbId: record.id,
    productionDate: record.productionDate,
    shiftName: record.shiftName,
    worker1: record.worker1,
    worker2: record.worker2,
    weigherName: record.weigherName || '',
    productCode: record.productCode || '',
    productName: record.productName,
    coreWeight: record.coreWeight,
    coreWeightImageUrl: record.coreWeightImageUrl,
    shellWeight: record.shellWeight || '',
    plasticNoFilmWeight: record.plasticNoFilmWeight || '',
    plasticNozzleWeight: record.plasticNozzleWeight || '',
    plasticFilmAdhesionWeight: record.plasticFilmAdhesionWeight || '',
    materialType: record.materialType || '',
    materialCode: record.materialCode || '',
    materialQuantity: record.materialQuantity || '',
    acceptanceStatus: record.acceptanceStatus || '',
    note: record.note || '',
    machineName: isRealMachineName(record.machineName) ? record.machineName : '',
    weighNo: record.weighNo,
    weighTime: record.weighTime,
    weight: record.weight,
    imageUrl: record.imageUrl,
    savedToDb: Boolean(record.id)
  }));
}

function rowToNewRowState(row: WeighingRow): Omit<WeighingRow, 'id' | 'weighNo' | 'weighTime' | 'savedToDb'> {
  return {
    productionDate: row.productionDate,
    shiftName: row.shiftName,
    worker1: row.worker1,
    worker2: row.worker2,
    weigherName: row.weigherName,
    productCode: row.productCode,
    productName: row.productName,
    coreWeight: row.coreWeight,
    coreWeightImageUrl: row.coreWeightImageUrl,
    coreWeightImagePublicId: row.coreWeightImagePublicId,
    shellWeight: row.shellWeight || DEFAULT_SHELL_WEIGHT,
    plasticNoFilmWeight: row.plasticNoFilmWeight || '',
    plasticNozzleWeight: row.plasticNozzleWeight || '',
    plasticFilmAdhesionWeight: row.plasticFilmAdhesionWeight || '',
    materialType: row.materialType || '',
    materialCode: row.materialCode || '',
    materialQuantity: row.materialQuantity || '',
    acceptanceStatus: row.acceptanceStatus,
    note: row.note,
    machineName: row.machineName,
    weight: row.weight,
    imageUrl: row.imageUrl,
    imagePublicId: row.imagePublicId
  };
}

export default function WeighingReportForm({
  pendingAdd = null,
  onPendingAddHandled,
  autoOpenNewSlip = false,
  onBack,
  onOpenList,
  config = DEFAULT_WEIGHING_SLIP_CONFIG
}: {
  pendingAdd?: WeighingPendingAdd | null;
  onPendingAddHandled?: () => void;
  autoOpenNewSlip?: boolean;
  onBack?: () => void;
  onOpenList?: () => void;
  config?: WeighingSlipConfig;
} = {}) {
  const hideProductFields = Boolean(config.hideProductFields);
  const splitPlasticFilmWeights = Boolean(config.splitPlasticFilmWeights);
  const splitDamagedPlasticDefectWeights = Boolean(config.splitDamagedPlasticDefectWeights);
  const { canCreate, canEdit, canDelete } = useTabAccess(config.accessTab || 'weighing-summary-list');
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [form, setForm] = useState({
    documentNo: '',
    reportDate: today
  });
  const [rows, setRows] = useState<WeighingRow[]>(DEFAULT_ROWS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [addFormError, setAddFormError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [coreWeightImageFile, setCoreWeightImageFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [machinesError, setMachinesError] = useState('');
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [productionOrders, setProductionOrders] = useState<MixingProductionOrder[]>([]);
  const [isLoadingProductionOrders, setIsLoadingProductionOrders] = useState(true);
  const [productionOrdersError, setProductionOrdersError] = useState('');
  const [selectedProductionOrderCode, setSelectedProductionOrderCode] = useState('');
  const [viewingRow, setViewingRow] = useState<WeighingRow | null>(null);
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [editingRow, setEditingRow] = useState<WeighingRow | null>(null);
  const [activeWeighRound, setActiveWeighRound] = useState('1');
  const [deletingRowId, setDeletingRowId] = useState<number | null>(null);
  const [currentWeigherName, setCurrentWeigherName] = useState(() => readStoredWeigherName(config.weigherStorageKey));
  const hasAutoOpenedNewSlip = useRef(false);
  const coreWeightCameraInputRef = useRef<HTMLInputElement>(null);
  const weightCameraInputRef = useRef<HTMLInputElement>(null);

  const updateCurrentWeigherName = (name: string) => {
    setCurrentWeigherName(name);
    storeWeigherName(config.weigherStorageKey, name);
  };

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const changeProductionContext = (field: 'productionDate' | 'shiftName', value: string) => {
    setSelectedProductionOrderCode('');
    setNewRow(prev => ({
      ...prev,
      [field]: value,
      worker1: '',
      worker2: '',
      machineName: '',
      productCode: '',
      productName: ''
    }));
  };

  const applySavedRowIds = (savedRows: WeighingRecord[] | undefined, targetRows: WeighingRow[]) => {
    if (!savedRows?.length) return targetRows;

    return targetRows.map((row, index) => ({
      ...row,
      dbId: savedRows[index]?.id ?? row.dbId,
      savedToDb: true
    }));
  };

  const persistRowsToServer = async (rowsToSave: WeighingRow[]) => {
    const firstRow = rowsToSave[0];
    const res = await fetch(config.apiBasePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        productionDate: firstRow.productionDate,
        shiftName: firstRow.shiftName,
        worker1: firstRow.worker1,
        worker2: firstRow.worker2,
        rows: rowsToSave
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu cân.'));
    }

    return data as {
      success?: boolean;
      inserted?: number;
      mode?: string;
      warning?: string;
      rows?: WeighingRecord[];
    };
  };

  const updateRowOnServer = async (row: WeighingRow) => {
    if (!row.dbId) {
      throw new Error('Dòng chưa có ID trên server. Hãy lưu phiếu trước khi sửa.');
    }

    const res = await fetch(`${config.apiBasePath}/${row.dbId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        productionDate: row.productionDate,
        shiftName: row.shiftName,
        worker1: row.worker1,
        worker2: row.worker2,
        row
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể cập nhật dòng cân.');
    }

    return data as { success?: boolean; row?: WeighingRecord; mode?: string };
  };

  const deleteRowOnServer = async (dbId: string | number) => {
    const res = await fetch(`${config.apiBasePath}/${dbId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa dòng cân.');
    }

    return data as { success?: boolean; mode?: string };
  };

  const getSaveSuccessMessage = (mode?: string, count = 1, warning?: string) => {
    if (warning) return warning;
    if (mode === 'local') {
      return `Đã lưu ${count} dòng vào file local (chưa ghi Supabase). Kiểm tra kết nối mạng và SUPABASE_SERVICE_KEY trong .env.`;
    }
    return `Đã lưu ${count} dòng vào Supabase (phieu_can_dinh_ki).`;
  };

  const [newRow, setNewRow] = useState<Omit<WeighingRow, 'id' | 'weighNo' | 'weighTime' | 'savedToDb'>>({
    productionDate: today,
    shiftName: '',
    worker1: '',
    worker2: '',
    weigherName: '',
    productCode: '',
    productName: '',
    machineName: '',
    coreWeight: '',
    shellWeight: splitDamagedPlasticDefectWeights ? '' : DEFAULT_SHELL_WEIGHT,
    plasticNoFilmWeight: '',
    plasticNozzleWeight: '',
    plasticFilmAdhesionWeight: '',
    materialType: '',
    materialCode: '',
    materialQuantity: '',
    acceptanceStatus: '',
    note: '',
    weight: '',
    imageUrl: '',
    imagePublicId: '',
    coreWeightImageUrl: '',
    coreWeightImagePublicId: ''
  });

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setIsLoadingProducts(true);
      setProductsError('');

      try {
        const res = await fetch('/api/san-pham?format=table');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
        }

        if (!cancelled) {
          setProducts(normalizeProducts(data));
        }
      } catch (error: any) {
        if (!cancelled) {
          setProductsError(error.message || 'Không thể tải danh sách sản phẩm.');
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      }
    };

    loadProducts();

    const loadStaff = async () => {
      setIsLoadingStaff(true);
      setStaffError('');

      try {
        const res = await fetch('/api/nhan-su');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải danh sách nhân sự.');
        }

        if (!cancelled) {
          setStaff(normalizeStaff(data));
        }
      } catch (error: any) {
        if (!cancelled) {
          setStaffError(error.message || 'Không thể tải danh sách nhân sự.');
          setStaff([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStaff(false);
        }
      }
    };

    loadStaff();

    const loadMachines = async () => {
      setIsLoadingMachines(true);
      setMachinesError('');

      try {
        const res = await fetch('/api/danh-sach-may');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải danh sách máy.');
        }

        if (!cancelled) {
          setMachines(normalizeMachines(data));
        }
      } catch (error: any) {
        if (!cancelled) {
          setMachinesError(error.message || 'Không thể tải danh sách máy.');
          setMachines([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMachines(false);
        }
      }
    };

    loadMachines();

    const loadShiftSettings = async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setShiftSettings(normalizeShiftSettings(data));
        }
      } catch {
        if (!cancelled) setShiftSettings([]);
      }
    };

    loadShiftSettings();

    const loadProductionOrders = async () => {
      setIsLoadingProductionOrders(true);
      setProductionOrdersError('');
      try {
        const res = await fetch('/api/lenh-sx');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Không thể tải lệnh sản xuất.');
        }
        if (!cancelled) {
          setProductionOrders(normalizeMixingProductionOrders(data));
        }
      } catch (error: any) {
        if (!cancelled) {
          setProductionOrders([]);
          setProductionOrdersError(error.message || 'Không thể tải lệnh sản xuất.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProductionOrders(false);
        }
      }
    };

    loadProductionOrders();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Phiếu cân: cần NVL khi chọn «Khác» ngoài lệnh. Báo cáo hàng hỏng: chọn vật tư khác.
    if (!splitDamagedPlasticDefectWeights && hideProductFields) return;
    let cancelled = false;
    setIsLoadingMaterials(true);
    fetch('/api/kho-nvl')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách kho NVL.');
        if (!cancelled) setMaterials(normalizeMaterials(data));
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMaterials(false);
      });
    return () => {
      cancelled = true;
    };
  }, [splitDamagedPlasticDefectWeights, hideProductFields]);

  useEffect(() => {
    if (isLoadingStaff || staff.length === 0) return;

    const validNames = new Set(staff.map(person => person.name));
    setNewRow(prev => {
      const worker1 = validNames.has(prev.worker1) ? prev.worker1 : '';
      const worker2 = validNames.has(prev.worker2) ? prev.worker2 : '';
      if (worker1 === prev.worker1 && worker2 === prev.worker2) return prev;
      return { ...prev, worker1, worker2 };
    });

    setCurrentWeigherName(prev => (prev && validNames.has(prev) ? prev : ''));
  }, [isLoadingStaff, staff]);

  // Vật tư khác: nếu KL trống/0 thì tự nhân SL × Tổng kg kho NVL.
  useEffect(() => {
    if (newRow.materialType !== 'vat_tu_khac') return;
    if (!newRow.materialCode?.trim() || !newRow.materialQuantity?.trim()) return;
    if (materials.length === 0) return;
    const currentKg = parseWeighingWeight(newRow.weight ?? '');
    if (currentKg !== null && currentKg > 0) return;
    const computed = computeDamagedOtherMaterialWeightKg(
      newRow.materialCode,
      newRow.materialQuantity,
      materials
    );
    if (!computed) return;
    setNewRow(prev => (prev.weight === computed ? prev : { ...prev, weight: computed }));
  }, [
    materials,
    newRow.materialType,
    newRow.materialCode,
    newRow.materialQuantity,
    newRow.weight
  ]);


  const openAddForm = (options?: {
    productionDate?: string;
    shiftName?: string;
    worker1?: string;
    worker2?: string;
    productName?: string;
    productCode?: string;
    machineName?: string;
    newWeighRound?: boolean;
  }) => {
    if (!canCreate) return;
    const slip = rows.length > 0 ? getSlipContextFromRows(rows) : null;
    const lastRow = rows[rows.length - 1];
    const productionDate = options?.productionDate || slip?.productionDate || lastRow?.productionDate || today;
    const dataRows = getWeighingDataRows(rows);
    const nextRound = options?.newWeighRound
      ? getNextWeighRoundNumber(dataRows)
      : getCurrentWeighRound(dataRows);
    setActiveWeighRound(nextRound);
    setNewRow({
      productionDate,
      shiftName: options?.shiftName || slip?.shiftName || lastRow?.shiftName || '',
      worker1: options?.worker1 ?? slip?.worker1 ?? lastRow?.worker1 ?? '',
      worker2: options?.worker2 ?? slip?.worker2 ?? lastRow?.worker2 ?? '',
      productCode: slip ? '' : options?.productCode ?? lastRow?.productCode ?? '',
      productName: slip ? '' : options?.productName ?? lastRow?.productName ?? '',
      machineName:
        options?.machineName ??
        slip?.machineName ??
        (isRealMachineName(lastRow?.machineName) ? lastRow.machineName : ''),
      coreWeight: '',
      shellWeight: splitDamagedPlasticDefectWeights ? '' : DEFAULT_SHELL_WEIGHT,
      plasticNoFilmWeight: '',
      plasticNozzleWeight: '',
      plasticFilmAdhesionWeight: '',
      materialType: '',
      materialCode: '',
      materialQuantity: '',
      acceptanceStatus: '',
      note: '',
      weight: '',
      imageUrl: '',
      imagePublicId: '',
      coreWeightImageUrl: '',
      coreWeightImagePublicId: ''
    });
    setForm(prev => ({
      ...prev,
      reportDate: productionDate || prev.reportDate
    }));
    setImageFile(null);
    setCoreWeightImageFile(null);
    setSaveMessage(null);
    setAddFormError('');
    setEditingRow(null);
    if (!currentWeigherName) {
      setCurrentWeigherName(readStoredWeigherName(config.weigherStorageKey));
    }
    setIsAddFormOpen(true);
  };

  const openEditRow = (row: WeighingRow) => {
    if (!canEdit) return;
    setEditingRow(row);
    if (row.weigherName) {
      updateCurrentWeigherName(row.weigherName);
    }
    setNewRow(rowToNewRowState(row));
    setImageFile(null);
    setCoreWeightImageFile(null);
    setSaveMessage(null);
    setAddFormError('');
    setIsAddFormOpen(true);
  };

  const handleDeleteRow = async (row: WeighingRow) => {
    if (!canDelete) return;
    if (!window.confirm('Bạn có chắc muốn xóa dòng cân này?')) return;

    setDeletingRowId(row.id);
    setSaveMessage(null);

    try {
      if (row.dbId) {
        await deleteRowOnServer(row.dbId);
      } else if (row.savedToDb) {
        throw new Error('Không tìm thấy ID dòng trên server. Vui lòng tải lại trang.');
      }

      setRows(prev => prev.filter(item => item.id !== row.id));
      setSaveMessage({ type: 'success', text: 'Đã xóa dòng cân.' });
      if (viewingRow?.id === row.id) setViewingRow(null);
      if (editingRow?.id === row.id) {
        setEditingRow(null);
        setIsAddFormOpen(false);
      }
    } catch (error: any) {
      setSaveMessage({ type: 'error', text: error.message || 'Không thể xóa dòng cân.' });
    } finally {
      setDeletingRowId(null);
    }
  };

  useLayoutEffect(() => {
    if (!pendingAdd) return;

    const existingRows = pendingAdd.existingRows?.length
      ? recordsToRows(pendingAdd.existingRows)
      : [];

    if (pendingAdd.createNewSlip) {
      const productionDate = pendingAdd.productionDate || today;
      const documentNo = pendingAdd.documentNo || generateWeighingDocumentNo(productionDate);

      setRows([]);
      setForm({
        documentNo,
        reportDate: pendingAdd.reportDate || productionDate
      });
      openAddForm({
        productionDate,
        shiftName: pendingAdd.shiftName || '',
        worker1: '',
        worker2: '',
        productCode: '',
        productName: '',
        machineName: ''
      });
    } else if (existingRows.length) {
      setRows(existingRows);
      setForm({
        documentNo: pendingAdd.documentNo || '',
        reportDate: pendingAdd.reportDate || pendingAdd.productionDate || today
      });
    } else {
      setRows([]);
      setForm({
        documentNo: pendingAdd.documentNo || '',
        reportDate: pendingAdd.productionDate || today
      });
    }

    const lastRecord = pendingAdd.createNewSlip
      ? undefined
      : pendingAdd.existingRows?.[pendingAdd.existingRows.length - 1];

    if (pendingAdd.editingRow) {
      const editRows = existingRows.length ? existingRows : recordsToRows([pendingAdd.editingRow]);
      if (editRows.length) setRows(editRows);
      const target = editRows.find(item => item.dbId === pendingAdd.editingRow?.id)
        ?? recordsToRows([pendingAdd.editingRow])[0];
      openEditRow(target);
    } else if (!pendingAdd.createNewSlip) {
      openAddForm({
        productionDate: pendingAdd.productionDate || lastRecord?.productionDate,
        shiftName: pendingAdd.shiftName || lastRecord?.shiftName,
        worker1: pendingAdd.worker1 || lastRecord?.worker1,
        worker2: pendingAdd.worker2 || lastRecord?.worker2,
        productCode: pendingAdd.productCode || lastRecord?.productCode,
        productName: pendingAdd.productName || lastRecord?.productName,
        machineName: isRealMachineName(pendingAdd.machineName)
          ? pendingAdd.machineName
          : isRealMachineName(lastRecord?.machineName)
            ? lastRecord.machineName
            : '',
        newWeighRound: pendingAdd.newWeighRound
      });
    }

    onPendingAddHandled?.();
  }, [pendingAdd]);

  useLayoutEffect(() => {
    if (!autoOpenNewSlip || pendingAdd || hasAutoOpenedNewSlip.current) return;
    hasAutoOpenedNewSlip.current = true;
    const productionDate = today;
    const documentNo = generateWeighingDocumentNo(productionDate);
    setRows([]);
    setForm({
      documentNo,
      reportDate: productionDate
    });
    openAddForm({
      productionDate,
      shiftName: '',
      worker1: '',
      worker2: '',
      productCode: '',
      productName: '',
      machineName: ''
    });
  }, [autoOpenNewSlip, pendingAdd, today]);

  const addFormRow = async () => {
    if (editingRow ? !canEdit : !canCreate) return;
    const slip = rows.length > 0 ? getSlipContextFromRows(rows) : null;
    const productionDate = slip?.productionDate || newRow.productionDate;
    const shiftName = slip?.shiftName || newRow.shiftName;
    const worker1 = slip?.worker1 ?? newRow.worker1 ?? '';
    const worker2 = slip?.worker2 ?? newRow.worker2 ?? '';
    const machineName = (slip?.machineName || newRow.machineName).trim();

    if (!productionDate || !shiftName.trim()) {
      setAddFormError('Vui lòng nhập ngày sản xuất và ca sản xuất.');
      return;
    }

    if (!machineName) {
      setAddFormError('Vui lòng chọn tên máy từ danh sách máy.');
      return;
    }

    if (!currentWeigherName.trim()) {
      setAddFormError('Vui lòng chọn Người cân (người đang nhập liệu).');
      return;
    }

    if (splitDamagedPlasticDefectWeights && !newRow.materialType?.trim()) {
      setAddFormError('Vui lòng chọn loại hàng hỏng: Nhựa hoặc Vật tư khác.');
      return;
    }

    if (
      splitDamagedPlasticDefectWeights &&
      newRow.materialType === 'vat_tu_khac' &&
      (!newRow.materialCode?.trim() || !newRow.materialQuantity?.trim())
    ) {
      setAddFormError('Vui lòng chọn Mã vật tư và nhập Số lượng.');
      return;
    }

    if (!config.hideAcceptanceStatus && !newRow.acceptanceStatus.trim()) {
      setAddFormError('Vui lòng chọn kết quả Nghiệm thu.');
      return;
    }

    if (splitDamagedPlasticDefectWeights) {
      if (
        !newRow.weight.trim() &&
        !newRow.materialQuantity?.trim() &&
        !newRow.plasticNoFilmWeight?.trim() &&
        !newRow.plasticNozzleWeight?.trim() &&
        !newRow.plasticFilmAdhesionWeight?.trim() &&
        !newRow.shellWeight.trim() &&
        !newRow.coreWeight.trim() &&
        !newRow.note.trim()
      ) {
        setAddFormError('Vui lòng nhập ít nhất một trọng lượng lỗi hỏng hoặc ghi chú.');
        return;
      }
    } else if (splitPlasticFilmWeights) {
      if (!newRow.weight.trim() && !newRow.shellWeight.trim() && !newRow.note.trim()) {
        setAddFormError('Vui lòng nhập KL nhựa, KL màng hoặc ghi chú.');
        return;
      }
    } else {
      if (!config.hideProductFields && !newRow.productCode.trim() && !newRow.productName.trim()) {
        setAddFormError('Vui lòng chọn hoặc nhập Mã SP / Tên SP.');
        return;
      }
      if (
        !newRow.productCode.trim() &&
        !newRow.productName.trim() &&
        !newRow.coreWeight.trim() &&
        !newRow.shellWeight.trim() &&
        !newRow.weight.trim() &&
        !newRow.acceptanceStatus.trim() &&
        !newRow.note.trim() &&
        !imageFile &&
        !coreWeightImageFile
      ) {
        setAddFormError('Vui lòng nhập thông tin hoặc chụp ảnh trước khi thêm form.');
        return;
      }
    }

    setIsUploadingImage(true);
    setSaveMessage(null);
    setAddFormError('');

    try {
      let imagePayload = {
        imageUrl: newRow.imageUrl,
        imagePublicId: newRow.imagePublicId
      };
      let coreWeightImagePayload = {
        coreWeightImageUrl: newRow.coreWeightImageUrl,
        coreWeightImagePublicId: newRow.coreWeightImagePublicId
      };

      if (imageFile && !newRow.imageUrl) {
        const uploaded = await uploadImage(await fileToDataUrl(imageFile));
        imagePayload = {
          imageUrl: uploaded.imageUrl,
          imagePublicId: uploaded.imagePublicId
        };
      }

      if (coreWeightImageFile && !newRow.coreWeightImageUrl) {
        const uploaded = await uploadImage(await fileToDataUrl(coreWeightImageFile));
        coreWeightImagePayload = {
          coreWeightImageUrl: uploaded.imageUrl,
          coreWeightImagePublicId: uploaded.imagePublicId
        };
      }

      if (editingRow) {
        const slipForEdit = getSlipContextFromRows(rows);
        const updatedRow: WeighingRow = {
          ...editingRow,
          productionDate: newRow.productionDate || slipForEdit?.productionDate || editingRow.productionDate,
          shiftName: newRow.shiftName || slipForEdit?.shiftName || editingRow.shiftName,
          worker1: slipForEdit?.worker1 ?? editingRow.worker1 ?? '',
          worker2: slipForEdit?.worker2 ?? editingRow.worker2 ?? '',
          weigherName: currentWeigherName.trim(),
          productCode: newRow.productCode.trim(),
          productName: newRow.productName || '',
          coreWeight: newRow.coreWeight || '',
          shellWeight: newRow.shellWeight || '',
          plasticNoFilmWeight: newRow.plasticNoFilmWeight || '',
          plasticNozzleWeight: newRow.plasticNozzleWeight || '',
          plasticFilmAdhesionWeight: newRow.plasticFilmAdhesionWeight || '',
          materialType: newRow.materialType || '',
          materialCode: newRow.materialCode || '',
          materialQuantity: newRow.materialQuantity || '',
          acceptanceStatus: newRow.acceptanceStatus || '',
          note: newRow.note || '',
          machineName: slipForEdit?.machineName || editingRow.machineName,
          weight: newRow.weight || '',
          ...imagePayload,
          ...coreWeightImagePayload
        };

        if (updatedRow.dbId) {
          const updateResult = await updateRowOnServer(updatedRow);
          if (updateResult.row?.id) {
            updatedRow.dbId = updateResult.row.id;
          }
          updatedRow.savedToDb = true;
        }

        setRows(prev => prev.map(row => (row.id === editingRow.id ? updatedRow : row)));
        setSaveMessage({
          type: 'success',
          text: updatedRow.dbId
            ? 'Đã cập nhật dòng cân.'
            : 'Đã cập nhật dòng trên bảng (chưa đồng bộ server).'
        });
        setEditingRow(null);
        setIsAddFormOpen(false);
        setImageFile(null);
        setCoreWeightImageFile(null);
        setAddFormError('');
        return;
      }

      const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
      const newRowData: WeighingRow = {
        id: nextId,
        productionDate,
        shiftName,
        worker1,
        worker2,
        weigherName: currentWeigherName.trim(),
        productCode: newRow.productCode.trim(),
        productName: newRow.productName || '',
        coreWeight: newRow.coreWeight || '',
        shellWeight: newRow.shellWeight || '',
        plasticNoFilmWeight: newRow.plasticNoFilmWeight || '',
        plasticNozzleWeight: newRow.plasticNozzleWeight || '',
        plasticFilmAdhesionWeight: newRow.plasticFilmAdhesionWeight || '',
        materialType: newRow.materialType || '',
        materialCode: newRow.materialCode || '',
        materialQuantity: newRow.materialQuantity || '',
        acceptanceStatus: newRow.acceptanceStatus || '',
        note: newRow.note || '',
        machineName,
        weight: newRow.weight || '',
        weighNo: activeWeighRound,
        weighTime: getCurrentWeighTime(),
        savedToDb: false,
        ...imagePayload,
        ...coreWeightImagePayload
      };

      const saveResult = await persistRowsToServer([newRowData]);
      const [savedRow] = applySavedRowIds(saveResult.rows, [newRowData]);
      newRowData.dbId = savedRow.dbId;
      newRowData.savedToDb = Boolean(savedRow.dbId);

      setRows(prev => [...prev, newRowData]);
      setSaveMessage({
        type: 'success',
        text: savedRow.dbId
          ? getSaveSuccessMessage(saveResult.mode, saveResult.inserted ?? 1, saveResult.warning)
          : 'Đã thêm dòng — bấm Lưu phiếu để đồng bộ lên server.'
      });
      setIsAddFormOpen(false);
      setImageFile(null);
      setCoreWeightImageFile(null);
      setAddFormError('');
      const slipAfterAdd = getSlipContextFromRows([...rows, newRowData]);
      setNewRow({
        productionDate: slipAfterAdd?.productionDate || productionDate,
        shiftName: slipAfterAdd?.shiftName || shiftName,
        worker1: slipAfterAdd?.worker1 ?? worker1,
        worker2: slipAfterAdd?.worker2 ?? worker2,
        machineName: slipAfterAdd?.machineName || machineName,
        productCode: newRowData.productCode,
        productName: newRowData.productName,
        coreWeight: '',
        shellWeight: splitDamagedPlasticDefectWeights ? '' : DEFAULT_SHELL_WEIGHT,
        plasticNoFilmWeight: '',
        plasticNozzleWeight: '',
        plasticFilmAdhesionWeight: '',
        materialType: '',
        materialCode: '',
        materialQuantity: '',
        acceptanceStatus: '',
        note: '',
        weight: '',
        imageUrl: '',
        imagePublicId: '',
        coreWeightImageUrl: '',
        coreWeightImagePublicId: ''
      });
    } catch (error: any) {
      setAddFormError(error.message || 'Không thể thêm form cân.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCoreImageUpload = async (file?: File | null) => {
    if (!file) return;

    setIsUploadingImage(true);
    setAddFormError('');

    try {
      const uploaded = await uploadImage(await fileToDataUrl(file));
      setNewRow(prev => ({
        ...prev,
        coreWeightImageUrl: uploaded.imageUrl,
        coreWeightImagePublicId: uploaded.imagePublicId
      }));
      setCoreWeightImageFile(null);
    } catch (error: any) {
      setAddFormError(error.message || 'Không thể upload ảnh trọng lượng lõi.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleWeightImageUpload = async (file?: File | null) => {
    if (!file) return;

    setIsUploadingImage(true);
    setAddFormError('');

    try {
      const uploaded = await uploadImage(await fileToDataUrl(file));
      setNewRow(prev => ({
        ...prev,
        imageUrl: uploaded.imageUrl,
        imagePublicId: uploaded.imagePublicId
      }));
      setImageFile(null);
    } catch (error: any) {
      setAddFormError(error.message || 'Không thể upload ảnh cân.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const filledRows = rows.filter(row =>
      row.productCode.trim() ||
      row.productName.trim() ||
      row.machineName.trim() ||
      row.coreWeight.trim() ||
      row.shellWeight.trim() ||
      row.weighNo.trim() ||
      row.weight.trim() ||
      row.materialType?.trim() ||
      row.materialCode?.trim() ||
      row.materialQuantity?.trim() ||
      row.acceptanceStatus.trim() ||
      row.note.trim() ||
      row.imageUrl ||
      row.coreWeightImageUrl
    );

    if (filledRows.length === 0) {
      const text = showSaveFailure('Vui lòng thêm ít nhất một dòng cân.');
      setSaveMessage({ type: 'error', text });
      return;
    }

    const missingShift = filledRows.find(row => !row.productionDate || !row.shiftName.trim());
    if (missingShift) {
      const text = showSaveFailure('Mỗi dòng cần có ngày sản xuất và ca sản xuất.');
      setSaveMessage({ type: 'error', text });
      return;
    }

    const missingAcceptanceStatus = !config.hideAcceptanceStatus &&
      filledRows.some(row => !row.acceptanceStatus.trim());
    if (missingAcceptanceStatus) {
      setSaveMessage({ type: 'error', text: 'Mỗi dòng cân cần có kết quả Nghiệm thu.' });
      return;
    }

    const unsavedRows = filledRows.filter(row => !row.savedToDb || !row.dbId);

    setIsSaving(true);
    setSaveMessage(null);

    try {
      let workingRows = rows;
      let mode: string | undefined;
      let warning: string | undefined;
      let inserted = 0;

      if (unsavedRows.length > 0) {
        const saveResult = await persistRowsToServer(unsavedRows);
        const savedRows = applySavedRowIds(saveResult.rows, unsavedRows);
        const savedIds = new Set(unsavedRows.map(row => row.id));
        workingRows = rows.map(row => {
          if (!savedIds.has(row.id)) return row;
          const saved = savedRows.find(item => item.id === row.id);
          return saved
            ? { ...row, ...saved, dbId: saved.dbId, savedToDb: Boolean(saved.dbId) }
            : { ...row, savedToDb: false };
        });
        setRows(workingRows);
        mode = saveResult.mode;
        warning = saveResult.warning;
        inserted = saveResult.inserted ?? unsavedRows.length;
      }

      const filledIds = new Set(filledRows.map(row => row.id));
      const rowsToSync = workingRows.filter(row => filledIds.has(row.id) && row.dbId);
      for (const row of rowsToSync) {
        await updateRowOnServer(row);
      }

      const successText =
        unsavedRows.length > 0
          ? getSaveSuccessMessage(mode, inserted, warning)
          : rowsToSync.length > 0
            ? 'Đã lưu phiếu thành công.'
            : 'Không thể đồng bộ phiếu — vui lòng thêm lại dòng cân.';
      if (unsavedRows.length > 0 || rowsToSync.length > 0) {
        setSaveMessage({ type: 'success', text: successText });
        showAppToast(successText);
      } else {
        const text = showSaveFailure(successText);
        setSaveMessage({ type: 'error', text });
      }
    } catch (error: any) {
      const text = showSaveFailure(error, 'Không thể lưu phiếu cân.');
      setSaveMessage({ type: 'error', text });
    } finally {
      setIsSaving(false);
    }
  };

  const slipInfo = getSlipInfo(rows);
  const modalSlipInfo = slipInfo ?? (editingRow ? getSlipInfo([editingRow]) : null);
  const weighingRows = useMemo(() => {
    const dataRows = getWeighingDataRows(rows);
    return [...dataRows].sort((a, b) => {
      const roundCmp = Number(a.weighNo) - Number(b.weighNo);
      if (roundCmp !== 0) return roundCmp;
      const timeCmp = (a.weighTime || '').localeCompare(b.weighTime || '');
      if (timeCmp !== 0) return timeCmp;
      return Number(a.id ?? 0) - Number(b.id ?? 0);
    });
  }, [rows]);
  const weighRoundCount = useMemo(() => countWeighingRounds(rows), [rows]);
  const showSlipFields = !editingRow && weighingRows.length === 0 && rows.length === 0;
  const slipContext = rows.length > 0 ? getSlipContextFromRows(rows) : null;
  const restrictProductsToOrders = config.restrictProductsToOrders !== false;
  const isOtherOrderSelected = selectedProductionOrderCode === WEIGHING_OTHER_ORDER_CODE;

  const selectedWeighingMachine = useMemo(() => {
    const label = String(newRow.machineName || '').trim();
    if (!label) return null;
    return (
      machines.find(
        machine =>
          machine.name === label ||
          machine.code === label ||
          `${machine.code} · ${machine.name}` === label
      ) ?? null
    );
  }, [machines, newRow.machineName]);

  const isRecycleMachineSelected = isRecyclingMachine(selectedWeighingMachine);

  useEffect(() => {
    if (!isRecycleMachineSelected) return;
    if (selectedProductionOrderCode === WEIGHING_OTHER_ORDER_CODE) return;
    setSelectedProductionOrderCode(WEIGHING_OTHER_ORDER_CODE);
  }, [isRecycleMachineSelected, selectedProductionOrderCode]);

  const productionOrderOptions = useMemo(() => {
    if (!newRow.productionDate || !newRow.shiftName) return [];
    return productionOrders.filter(order => {
      const orderDate = String(order.startDate || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
      return orderDate === newRow.productionDate && shiftNamesMatch(order.shift, newRow.shiftName);
    });
  }, [productionOrders, newRow.productionDate, newRow.shiftName]);

  const productionOrderSelectOptions = useMemo(() => {
    // Luôn có «Khác» dù không có lệnh SX / chưa chọn ca.
    return [WEIGHING_OTHER_ORDER_OPTION, ...productionOrderOptions];
  }, [productionOrderOptions]);

  const materialProductOptions = useMemo<ProductOption[]>(
    () =>
      materials
        .filter(material => material.code.trim())
        .map(material => ({
          productCode: material.code,
          productName: material.name || material.code
        }))
        .sort((a, b) => a.productCode.localeCompare(b.productCode, 'vi')),
    [materials]
  );

  useEffect(() => {
    if (!selectedProductionOrderCode) return;
    if (selectedProductionOrderCode === WEIGHING_OTHER_ORDER_CODE) return;
    if (productionOrderOptions.some(order => order.orderCode === selectedProductionOrderCode)) return;
    setSelectedProductionOrderCode('');
  }, [productionOrderOptions, selectedProductionOrderCode]);

  useEffect(() => {
    if (selectedProductionOrderCode === WEIGHING_OTHER_ORDER_CODE) return;
    const order = productionOrderOptions.find(item => item.orderCode === selectedProductionOrderCode);
    if (!order) return;
    const machineRef = order.machine.trim();
    const matchedMachine = machines.find(machine => machine.code === machineRef || machine.name === machineRef);
    const workerNames = order.staff.split(/[,;+|/\n]+/).map(name => name.trim()).filter(Boolean);
    const firstProduct = order.productLines.find(line => line.productCode.trim() || line.productName.trim());
    const catalogProduct = firstProduct ? findProductByCode(products, firstProduct.productCode) : null;
    setNewRow(prev => ({
      ...prev,
      worker1: workerNames[0] || '',
      worker2: workerNames[1] || '',
      machineName: matchedMachine?.name || machineRef,
      productCode: firstProduct?.productCode || '',
      productName: firstProduct?.productName || catalogProduct?.productName || ''
    }));
  }, [selectedProductionOrderCode, productionOrderOptions, machines, products]);

  const productFilterContext = useMemo(() => {
    const machineName =
      slipContext?.machineName ||
      newRow.machineName ||
      (modalSlipInfo?.machineName && modalSlipInfo.machineName !== '—' ? modalSlipInfo.machineName : '');

    return {
      ngay: slipContext?.productionDate || newRow.productionDate || '',
      ca: slipContext?.shiftName || newRow.shiftName || '',
      machineName: isRealMachineName(machineName) ? machineName : ''
    };
  }, [
    slipContext,
    newRow.productionDate,
    newRow.shiftName,
    newRow.machineName,
    modalSlipInfo?.machineName
  ]);

  const orderProductOptions = useMemo(() => {
    if (isOtherOrderSelected) return [];
    const selectedOrder = productionOrderOptions.find(
      order => order.orderCode === selectedProductionOrderCode
    );
    if (selectedOrder) {
      return selectedOrder.productLines
        .filter(line => line.productCode.trim())
        .map(line => {
          const catalog = findProductByCode(products, line.productCode);
          return {
            productCode: line.productCode,
            productName: line.productName || catalog?.productName || line.productCode,
            newCode: catalog?.newCode
          };
        });
    }
    return buildWeighingProductOptionsFromOrders(
      productionOrders,
      productFilterContext,
      machines,
      products
    );
  }, [
    isOtherOrderSelected,
    productionOrders,
    productionOrderOptions,
    selectedProductionOrderCode,
    productFilterContext,
    machines,
    products
  ]);

  const productSelectOptions = useMemo(() => {
    if (isOtherOrderSelected) {
      const options = [...materialProductOptions];
      const currentCode = newRow.productCode.trim();
      if (currentCode && !options.some(item => item.productCode === currentCode)) {
        options.push({
          productCode: currentCode,
          productName: newRow.productName || currentCode
        });
      }
      return options;
    }
    const options = restrictProductsToOrders ? [...orderProductOptions] : [...products];
    const currentCode = newRow.productCode.trim();
    if (currentCode && !options.some(item => item.productCode === currentCode)) {
      const catalog = findProductByCode(products, currentCode);
      options.push({
        productCode: currentCode,
        productName: catalog?.productName || newRow.productName || currentCode,
        newCode: catalog?.newCode
      });
    }
    return options.sort((a, b) => a.productCode.localeCompare(b.productCode, 'vi'));
  }, [
    isOtherOrderSelected,
    materialProductOptions,
    orderProductOptions,
    newRow.productCode,
    newRow.productName,
    products,
    restrictProductsToOrders
  ]);

  const productCodePlaceholder = useMemo(() => {
    if (isOtherOrderSelected) {
      if (isLoadingMaterials) return 'Đang tải kho NVL...';
      if (productSelectOptions.length === 0) return 'Không có NVL trong kho';
      return 'Gõ để tìm mã NVL';
    }
    if (!restrictProductsToOrders) return 'Gõ để tìm mã SP';
    if (isLoadingProductionOrders) return 'Đang tải lệnh SX...';
    if (!productFilterContext.ngay || !productFilterContext.ca || !productFilterContext.machineName) {
      return 'Chọn ngày, ca và máy trước';
    }
    if (productSelectOptions.length === 0) {
      return 'Không có SP trong lệnh SX phù hợp';
    }
    return 'Gõ để tìm mã SP';
  }, [
    isOtherOrderSelected,
    isLoadingMaterials,
    isLoadingProductionOrders,
    productFilterContext,
    productSelectOptions.length,
    restrictProductsToOrders
  ]);

  const productCodeSelectDisabled =
    isOtherOrderSelected
      ? isLoadingMaterials || productSelectOptions.length === 0
      : (!restrictProductsToOrders && (isLoadingProducts || productSelectOptions.length === 0)) ||
        (restrictProductsToOrders &&
          (isLoadingProductionOrders ||
            !productFilterContext.ngay ||
            !productFilterContext.ca ||
            !productFilterContext.machineName ||
            productSelectOptions.length === 0));

  useEffect(() => {
    if (!newRow.productCode?.trim() || isLoadingProductionOrders) return;
    if (isOtherOrderSelected && isLoadingMaterials) return;
    const resolvedName = resolveProductNameFromCode(productSelectOptions, newRow.productCode);
    if (!resolvedName) return;
    setNewRow(prev => (prev.productName === resolvedName ? prev : { ...prev, productName: resolvedName }));
  }, [
    productSelectOptions,
    isLoadingProductionOrders,
    isLoadingMaterials,
    isOtherOrderSelected,
    newRow.productCode
  ]);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-ink-200 bg-white overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="border-b border-brand-500 bg-white px-2 py-2 sm:px-3" style={{ borderBottomWidth: '3px' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black uppercase tracking-tight text-zinc-950 sm:text-base">
                Báo cáo trọng lượng
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {onOpenList ? (
                <button
                  type="button"
                  onClick={onOpenList}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-extrabold text-emerald-800 transition hover:bg-emerald-100 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-xs"
                >
                  <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline sm:inline">Danh sách</span>
                </button>
              ) : null}
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-[10px] font-bold text-zinc-700 transition hover:bg-zinc-50 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Quay lại</span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:mt-2 sm:gap-2">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3 text-[#ef1b2d]" />
                Bản số
              </span>
              <input
                value={form.documentNo}
                onChange={e => setForm(prev => ({ ...prev, documentNo: e.target.value }))}
                className={compactHeaderInputClass}
                placeholder="..."
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-100 bg-zinc-50 p-2 sm:grid-cols-3 sm:gap-2 sm:p-3 lg:grid-cols-5">
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <CalendarDays className="h-3 w-3 shrink-0 text-[#ef1b2d]" />
              Ngày SX
            </p>
            <p className="truncate text-[11px] font-bold text-zinc-900 sm:text-sm">{slipInfo?.productionDate ?? '—'}</p>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <FileText className="h-3 w-3 shrink-0 text-[#ef1b2d]" />
              Ca SX
            </p>
            <p className="truncate text-[11px] font-bold text-zinc-900 sm:text-sm">{slipInfo?.shiftName ?? '—'}</p>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <Users className="h-3 w-3 shrink-0 text-[#ef1b2d]" />
              Tên CN 1
            </p>
            <p className="truncate text-[11px] font-bold text-zinc-900 sm:text-sm">{slipInfo?.worker1 ?? '—'}</p>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <Users className="h-3 w-3 shrink-0 text-[#ef1b2d]" />
              Tên CN 2
            </p>
            <p className="truncate text-[11px] font-bold text-zinc-900 sm:text-sm">{slipInfo?.worker2 ?? '—'}</p>
          </div>
          <div className="col-span-2 min-w-0 space-y-0.5 sm:col-span-1">
            <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-500 sm:text-[10px]">
              <Factory className="h-3 w-3 shrink-0 text-[#ef1b2d]" />
              Tên máy
            </p>
            <p className="truncate text-[11px] font-bold text-zinc-900 sm:text-sm">{slipInfo?.machineName ?? '—'}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="border-b border-ink-100 px-2 py-1.5 sm:px-3 sm:py-2">
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-ink-900 font-semibold sm:text-[12px]">
            Bảng chi tiết cân
          </h3>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-zinc-500 sm:text-xs">
            Tổng số dòng: {weighingRows.length}
            {weighRoundCount > 0 ? ` · ${weighRoundCount} lần cân` : ''}
          </p>
        </div>

        {weighingRows.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs font-semibold text-zinc-400 sm:py-10 sm:text-sm">
            Chưa có dòng cân.
          </p>
        ) : (
          <>
            <div className="divide-y divide-zinc-100 md:hidden">
              {weighingRows.map((row, index) => {
                const showRoundHeader = index === 0 || weighingRows[index - 1].weighNo !== row.weighNo;
                return (
                <div key={`mobile-${row.id}`} className="weighing-row-mobile px-2 py-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      {showRoundHeader ? (
                        <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#ef1b2d]">
                          {row.weighNo ? formatWeighRound(row.weighNo) : '—'}
                        </span>
                      ) : null}
                      <span className="shrink-0 font-mono text-[9px] font-bold text-zinc-600">
                        {row.weighTime || '—'}
                      </span>
                      {!hideProductFields ? (
                        <span className="truncate font-mono text-[10px] font-bold text-zinc-800">
                          {row.productCode || '—'}
                        </span>
                      ) : null}
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!config.hideAcceptanceStatus && row.acceptanceStatus ? (
                          <span
                            className={`rounded-full px-1 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                              row.acceptanceStatus === 'Đạt'
                                ? 'bg-success-50 text-success-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {row.acceptanceStatus}
                          </span>
                        ) : null}
                        <span className="font-mono text-[9px] font-black text-[#ef1b2d]">
                          Tổng{' '}
                          {splitPlasticFilmWeights
                            ? formatDamagedGoodsRowTotalWeight(row)
                            : formatWeighingRowTotalWeight(row)}
                        </span>
                      </div>
                      {!config.hideCoreWeightImage && !config.hideWeightImage && (row.coreWeightImageUrl || row.imageUrl) ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {row.coreWeightImageUrl ? (
                            <WeighingImageThumbnail
                              url={row.coreWeightImageUrl}
                              alt="Ảnh TL lõi"
                              title="Ảnh trọng lượng lõi"
                              className="block h-6 w-8 overflow-hidden rounded border border-ink-200 bg-ink-50"
                              onView={() =>
                                setViewingImage({ url: row.coreWeightImageUrl!, title: 'Ảnh trọng lượng lõi' })
                              }
                            />
                          ) : null}
                          {row.imageUrl ? (
                            <WeighingImageThumbnail
                              url={row.imageUrl}
                              alt="Ảnh cân"
                              title="Ảnh cân"
                              className="block h-6 w-8 overflow-hidden rounded border border-ink-200 bg-ink-50"
                              onView={() => setViewingImage({ url: row.imageUrl!, title: 'Ảnh cân' })}
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setViewingRow(row)}
                        title="Xem"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditRow(row)}
                        title="Sửa"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row)}
                        disabled={deletingRowId === row.id}
                        title="Xóa"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRowId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={`mt-1 grid gap-0.5 ${
                      splitDamagedPlasticDefectWeights
                        ? 'grid-cols-3'
                        : splitPlasticFilmWeights
                          ? 'grid-cols-3'
                          : 'grid-cols-4'
                    }`}
                  >
                    {splitDamagedPlasticDefectWeights ? (
                      isDamagedOtherMaterial(row) ? (
                      <>
                        <div className="col-span-3">
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Loại
                          </span>
                          <p className="text-[10px] font-bold text-zinc-800">
                            {damagedGoodsMaterialTypeLabel(row.materialType)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Mã VT
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">{row.materialCode || '—'}</p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            SL
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {row.materialQuantity || '—'}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            NVL khác
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.weight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Lõi
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.weight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Tổng
                          </span>
                          <p className="font-mono text-[10px] font-black text-[#ef1b2d]">
                            {formatDamagedGoodsRowTotalWeight(row)}
                          </p>
                        </div>
                      </>
                      ) : (
                      <>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Nhựa KM
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.plasticNoFilmWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Nhựa ĐN
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.plasticNozzleWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Nhựa DM
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.plasticFilmAdhesionWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Màng
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.shellWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Lõi
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.coreWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Tổng
                          </span>
                          <p className="font-mono text-[10px] font-black text-[#ef1b2d]">
                            {formatDamagedGoodsRowTotalWeight(row)}
                          </p>
                        </div>
                      </>
                      )
                    ) : splitPlasticFilmWeights ? (
                      <>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            KL nhựa
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.weight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            KL màng
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">
                            {formatWeighingWeightField(row.shellWeight)}
                          </p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Tổng
                          </span>
                          <p className="font-mono text-[10px] font-black text-[#ef1b2d]">
                            {formatDamagedGoodsRowTotalWeight(row)}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Lõi
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">{row.coreWeight || '—'}</p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Bì
                          </span>
                          <p className="font-mono text-[10px] font-bold text-zinc-800">{row.shellWeight || '—'}</p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            TL nhựa
                          </span>
                          <p className="font-mono text-[10px] font-black text-zinc-900">{formatWeighingNetWeight(row)}</p>
                        </div>
                        <div>
                          <span className="block text-[8px] font-extrabold uppercase tracking-wide text-zinc-500 leading-none">
                            Tổng
                          </span>
                          <p className="font-mono text-[10px] font-black text-[#ef1b2d]">
                            {formatWeighingRowTotalWeight(row)}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>

            <div className="hidden md:block md:overflow-x-auto">
          {splitDamagedPlasticDefectWeights ? (
          <table className="responsive-table w-full md:min-w-[1180px] border-collapse text-left">
            <thead className="table-header-group">
              <tr className="bg-zinc-950 text-xs font-black uppercase tracking-wider text-white">
                <th className="w-20 px-3 py-3 text-center">Lần cân</th>
                <th className="px-3 py-3">Người cân</th>
                <th className="px-3 py-3">Loại</th>
                <th className="px-3 py-3">Mã VT</th>
                <th className="px-3 py-3">SL</th>
                <th className="px-3 py-3">NVL khác</th>
                <th className="px-3 py-3">Nhựa KM</th>
                <th className="px-3 py-3">Nhựa ĐN</th>
                <th className="px-3 py-3">Nhựa DM</th>
                <th className="px-3 py-3">Màng</th>
                <th className="px-3 py-3">Lõi</th>
                <th className="px-3 py-3">Tổng</th>
                <th className="px-3 py-3">Giờ cân</th>
                <th className="px-3 py-3">Ghi chú</th>
                <th className="w-28 px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {weighingRows.map(row => {
                const isOther = isDamagedOtherMaterial(row);
                return (
                <tr key={row.id} className="transition hover:bg-red-50/40">
                  <td className="border-r border-zinc-100 px-3 py-2 text-center text-sm font-black text-[#ef1b2d]">
                    {row.weighNo ? formatWeighRound(row.weighNo) : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weigherName || '—'}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-800">
                    {damagedGoodsMaterialTypeLabel(row.materialType)}
                  </td>
                  <td className="px-2 py-2 font-mono text-sm font-bold text-zinc-900">
                    {isOther ? row.materialCode || '—' : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? row.materialQuantity || '—' : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? formatWeighingWeightField(row.weight) : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? '—' : formatWeighingWeightField(row.plasticNoFilmWeight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? '—' : formatWeighingWeightField(row.plasticNozzleWeight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? '—' : formatWeighingWeightField(row.plasticFilmAdhesionWeight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther ? '—' : formatWeighingWeightField(row.shellWeight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {isOther
                      ? formatWeighingWeightField(row.weight)
                      : formatWeighingWeightField(row.coreWeight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-black text-[#ef1b2d]">
                    {formatDamagedGoodsRowTotalWeight(row)}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weighTime || '—'}</td>
                  <td className="max-w-[180px] truncate px-2 py-2 text-sm font-semibold text-zinc-600" title={row.note || undefined}>
                    {row.note || '—'}
                  </td>
                  <td className="px-2 py-2">
                    <RowActionsMenu label={`Thao tác lần cân ${row.weighNo || row.id}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingRow(row)}
                        title="Xem"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditRow(row)}
                        title="Sửa"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row)}
                        disabled={deletingRowId === row.id}
                        title="Xóa"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRowId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          ) : splitPlasticFilmWeights ? (
          <table className="responsive-table w-full md:min-w-[640px] border-collapse text-left">
            <thead className="table-header-group">
              <tr className="bg-zinc-950 text-xs font-black uppercase tracking-wider text-white">
                <th className="w-20 px-3 py-3 text-center">Lần cân</th>
                <th className="px-3 py-3">Người cân</th>
                <th className="px-3 py-3">KL nhựa</th>
                <th className="px-3 py-3">KL màng</th>
                <th className="px-3 py-3">Tổng</th>
                <th className="px-3 py-3">Giờ cân</th>
                <th className="px-3 py-3">Ghi chú</th>
                <th className="w-28 px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {weighingRows.map(row => (
                <tr key={row.id} className="transition hover:bg-red-50/40">
                  <td className="border-r border-zinc-100 px-3 py-2 text-center text-sm font-black text-[#ef1b2d]">
                    {row.weighNo ? formatWeighRound(row.weighNo) : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weigherName || '—'}</td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">
                    {formatWeighingWeightField(row.weight)}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-700">
                    {formatWeighingWeightField(row.shellWeight)}
                  </td>
                  <td className="px-2 py-2 font-mono text-sm font-black text-[#ef1b2d]">
                    {formatDamagedGoodsRowTotalWeight(row)}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weighTime || '—'}</td>
                  <td
                    className="max-w-[160px] truncate px-2 py-2 text-sm font-semibold text-zinc-600"
                    title={row.note || undefined}
                  >
                    {row.note || '—'}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RowActionsMenu label={`Thao tác lần cân ${row.weighNo || row.id}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingRow(row)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditRow(row)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row)}
                        disabled={deletingRowId === row.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRowId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          ) : (
          <table className="responsive-table w-full md:min-w-[760px] border-collapse text-left">
            <thead className="table-header-group">
              <tr className="bg-zinc-950 text-xs font-black uppercase tracking-wider text-white">
                <th className="w-20 px-3 py-3 text-center">Lần cân</th>
                <th className="w-28 px-3 py-3">Mã SP</th>
                <th className="px-3 py-3">Tên sản phẩm</th>
                <th className="px-3 py-3">Người cân</th>
                <th className="px-3 py-3">Trọng lượng lõi</th>
                <th className="px-3 py-3">Trọng lượng bì</th>
                <th className="px-3 py-3">TL nhựa</th>
                <th className="px-3 py-3">Tổng cân</th>
                <th className="px-3 py-3">Giờ cân</th>
                <th className="px-3 py-3">Nghiệm thu</th>
                <th className="px-3 py-3">Ghi chú</th>
                <th className="px-3 py-3">Ảnh TL lõi</th>
                <th className="px-3 py-3">Ảnh</th>
                <th className="w-28 px-3 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {weighingRows.map(row => (
                <tr key={row.id} className="transition hover:bg-red-50/40">
                  <td className="border-r border-zinc-100 px-3 py-2 text-center text-sm font-black text-[#ef1b2d]">
                    {row.weighNo ? formatWeighRound(row.weighNo) : '—'}
                  </td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-800">{row.productCode || '—'}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-700">{row.productName || '—'}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weigherName || '—'}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-700">{row.coreWeight || '—'}</td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-700">{row.shellWeight || '—'}</td>
                  <td className="px-2 py-2 text-sm font-bold text-zinc-900">{formatWeighingNetWeight(row)}</td>
                  <td className="px-2 py-2 font-mono text-sm font-black text-[#ef1b2d]">
                    Tổng {formatWeighingRowTotalWeight(row)}
                  </td>
                  <td className="px-2 py-2 text-sm font-semibold text-zinc-600">{row.weighTime || '—'}</td>
                  <td className="px-2 py-2">
                    {row.acceptanceStatus ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          row.acceptanceStatus === 'Đạt'
                            ? 'bg-success-50 text-success-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {row.acceptanceStatus}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="max-w-[120px] truncate px-2 py-2 text-sm font-semibold text-zinc-600" title={row.note || undefined}>
                    {row.note || '—'}
                  </td>
                  <td className="px-2 py-2">
                    {row.coreWeightImageUrl ? (
                      <WeighingImageThumbnail
                        url={row.coreWeightImageUrl}
                        alt="Ảnh trọng lượng lõi"
                        title="Ảnh trọng lượng lõi"
                        onView={() =>
                          setViewingImage({ url: row.coreWeightImageUrl!, title: 'Ảnh trọng lượng lõi' })
                        }
                      />
                    ) : (
                      <span className="text-xs font-semibold text-zinc-300">Chưa có</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {row.imageUrl ? (
                      <WeighingImageThumbnail
                        url={row.imageUrl}
                        alt="Ảnh cân"
                        title="Ảnh cân"
                        onView={() => setViewingImage({ url: row.imageUrl!, title: 'Ảnh cân' })}
                      />
                    ) : (
                      <span className="text-xs font-semibold text-zinc-300">Chưa có</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <RowActionsMenu label={`Thao tác lần cân ${row.weighNo || row.id}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingRow(row)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditRow(row)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      ) : null}
                      {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row)}
                        disabled={deletingRowId === row.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingRowId === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border border-ink-200 bg-white overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="space-y-2 px-2 py-2 sm:px-3 sm:py-2.5">
          {productsError || staffError || saveMessage ? (
            <div className="min-w-0 space-y-0.5">
              {productsError ? (
                <p className="text-xs font-bold text-rose-600">{productsError}</p>
              ) : null}
              {staffError ? (
                <p className="text-xs font-bold text-rose-600">{staffError}</p>
              ) : null}
              {saveMessage?.type === 'success' ? (
                <p className="text-xs font-bold text-emerald-700">{saveMessage.text}</p>
              ) : null}
              {saveMessage?.type === 'error' ? (
                <p className="text-xs font-bold text-rose-600">{saveMessage.text}</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-1 overflow-x-auto">
            {canCreate ? (
            <button
              type="button"
              onClick={() => openAddForm({ newWeighRound: true })}
              disabled={weighingRows.length === 0}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#ef1b2d]/30 bg-white px-2 text-[10px] font-extrabold text-[#ef1b2d] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-lg sm:px-2.5 sm:text-[11px]"
            >
              Lần mới
            </button>
            ) : null}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-zinc-900 px-2 text-[10px] font-bold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-1.5 sm:rounded-lg sm:px-2.5 sm:text-[11px]"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" /> : <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              {isSaving ? 'Đang lưu' : 'Lưu phiếu'}
            </button>
          </div>
        </div>
      </section>

      {isAddFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-3">
          <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-2">
              <div className="min-w-0 pr-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-zinc-950">
                  {editingRow ? 'Sửa dòng cân' : 'Nhập liệu'}
                </h3>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-500">
                  {editingRow
                    ? `${editingRow.weighNo ? formatWeighRound(editingRow.weighNo) : 'Dòng cân'} · ${editingRow.weighTime || '—'}`
                    : `${formatWeighRound(activeWeighRound)}${
                        showSlipFields ? ' · Phiếu mới' : ''
                      } · thêm sản phẩm`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(false);
                  setEditingRow(null);
                }}
                className="h-8 shrink-0 rounded-lg border border-zinc-200 px-2.5 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="grid grid-cols-2 gap-2 p-3">
              <label className="field-cell col-span-2">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <UserCheck className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  Người cân
                </span>
                <StaffSelect
                  value={currentWeigherName}
                  onChange={updateCurrentWeigherName}
                  staff={staff}
                  isLoading={isLoadingStaff}
                  placeholder="Chọn người nhập liệu"
                  className={modalInputClass}
                />
              </label>
              {!showSlipFields && !editingRow && modalSlipInfo && (
                <div className="col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] font-semibold text-zinc-600">
                  <span className="font-bold text-zinc-900">{modalSlipInfo.productionDate}</span>
                  {' · '}
                  <span className="font-bold text-zinc-900">{modalSlipInfo.shiftName}</span>
                  {' · '}
                  <span className="font-bold text-zinc-900">{modalSlipInfo.machineName}</span>
                </div>
              )}
              {editingRow && (
                <>
                  <label className="field-cell">
                    <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                      <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" />
                      Ngày SX
                    </span>
                    <input
                      type="date"
                      value={newRow.productionDate}
                      onChange={e => changeProductionContext('productionDate', e.target.value)}
                      className={modalInputClass}
                    />
                  </label>
                  <label className="field-cell">
                    <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                      <FileText className="h-3.5 w-3.5 text-[#ef1b2d]" />
                      Ca SX
                    </span>
                    <select
                      value={newRow.shiftName}
                      onChange={e => changeProductionContext('shiftName', e.target.value)}
                      className={modalInputClass}
                    >
                      <option value="">Chọn ca</option>
                      {newRow.shiftName &&
                        !shiftOptions.some(shift => shift.value === newRow.shiftName) && (
                          <option value={newRow.shiftName}>{newRow.shiftName}</option>
                        )}
                      {shiftOptions.map(shift => (
                        <option key={shift.value} value={shift.value}>{shift.label}</option>
                      ))}
                    </select>
                  </label>
                  {modalSlipInfo && (
                    <div className="col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[11px] font-semibold text-zinc-600">
                      Máy: <span className="font-bold text-zinc-900">{modalSlipInfo.machineName}</span>
                    </div>
                  )}
                </>
              )}
              {showSlipFields && (
              <>
              <label className="field-cell">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  Ngày SX
                </span>
                <input
                  type="date"
                  value={newRow.productionDate}
                  onChange={e => changeProductionContext('productionDate', e.target.value)}
                  className={modalInputClass}
                />
              </label>
              <label className="field-cell">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <FileText className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  Ca SX
                </span>
                <select
                  value={newRow.shiftName}
                  onChange={e => changeProductionContext('shiftName', e.target.value)}
                  className={modalInputClass}
                >
                  <option value="">Chọn ca</option>
                  {shiftOptions.map(shift => (
                    <option key={shift.value} value={shift.value}>{shift.label}</option>
                  ))}
                </select>
              </label>
              <label className="field-cell col-span-2">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <Factory className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  Tên máy
                </span>
                <MachineSelect
                  value={newRow.machineName}
                  onChange={value => setNewRow(prev => ({ ...prev, machineName: value }))}
                  machines={machines}
                  isLoading={isLoadingMachines}
                  className={modalInputClass}
                />
                {machinesError && (
                  <p className="text-[11px] font-bold text-rose-600">{machinesError}</p>
                )}
                {isRecycleMachineSelected ? (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                    Máy tái chế — chọn ca trực tiếp, không cần lệnh sản xuất.
                  </p>
                ) : null}
              </label>
              <label className="field-cell col-span-2">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <ClipboardList className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  Lệnh SX
                </span>
                {isRecycleMachineSelected ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold text-emerald-800">
                    Đã bỏ qua lệnh SX (máy tái chế).
                  </div>
                ) : (
                  <SearchableSelect
                    value={selectedProductionOrderCode}
                    onChange={value => {
                      setSelectedProductionOrderCode(value);
                      if (value === WEIGHING_OTHER_ORDER_CODE) {
                        setNewRow(prev => ({
                          ...prev,
                          productCode: '',
                          productName: ''
                        }));
                      }
                    }}
                    options={productionOrderSelectOptions}
                    placeholder={
                      isLoadingProductionOrders
                        ? 'Đang tải lệnh SX...'
                        : productionOrderOptions.length === 0
                          ? 'Không có lệnh SX — chọn Khác'
                          : 'Chọn lệnh SX hoặc Khác'
                    }
                    isLoading={isLoadingProductionOrders}
                    disabled={isLoadingProductionOrders}
                    inputClassName={modalInputClass}
                    getValue={item => (item as MixingProductionOrder).orderCode}
                    getLabel={item => {
                      const order = item as MixingProductionOrder;
                      if (order.orderCode === WEIGHING_OTHER_ORDER_CODE) {
                        return 'Khác — sản phẩm ngoài lệnh SX';
                      }
                      return order.machine ? `${order.orderCode} · ${order.machine}` : order.orderCode;
                    }}
                    resolveSelectedItem={(options, value) =>
                      (options as MixingProductionOrder[]).find(order => order.orderCode === value)
                    }
                  />
                )}
                {productionOrdersError ? (
                  <p className="text-[10px] font-semibold text-rose-600">{productionOrdersError}</p>
                ) : isOtherOrderSelected && !isRecycleMachineSelected ? (
                  <p className="text-[10px] font-semibold text-amber-700">
                    Đã chọn Khác — chọn NVL bên dưới từ kho.
                  </p>
                ) : null}
              </label>
              {!config.hideWorkersInEntry && (
                <>
                  <label className="field-cell">
                    <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                      <Users className="h-3.5 w-3.5 text-[#ef1b2d]" />
                      CN 1
                    </span>
                    <StaffSelect
                      value={newRow.worker1}
                      onChange={value => setNewRow(prev => ({ ...prev, worker1: value }))}
                      staff={staff}
                      isLoading={isLoadingStaff}
                      placeholder="CN 1"
                      className={modalInputClass}
                    />
                  </label>
                  <label className="field-cell">
                    <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                      <Users className="h-3.5 w-3.5 text-[#ef1b2d]" />
                      CN 2
                    </span>
                    <StaffSelect
                      value={newRow.worker2}
                      onChange={value => setNewRow(prev => ({ ...prev, worker2: value }))}
                      staff={staff}
                      isLoading={isLoadingStaff}
                      placeholder="CN 2"
                      className={modalInputClass}
                    />
                  </label>
                </>
              )}
              </>
              )}
              {!hideProductFields && (
              <>
              {!showSlipFields && restrictProductsToOrders ? (
                <label className="field-cell col-span-2">
                  <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                    <ClipboardList className="h-3.5 w-3.5 text-[#ef1b2d]" />
                    Nguồn SP
                  </span>
                  <select
                    value={isOtherOrderSelected ? WEIGHING_OTHER_ORDER_CODE : 'order'}
                    onChange={e => {
                      const value = e.target.value;
                      if (value === WEIGHING_OTHER_ORDER_CODE) {
                        setSelectedProductionOrderCode(WEIGHING_OTHER_ORDER_CODE);
                        setNewRow(prev => ({ ...prev, productCode: '', productName: '' }));
                      } else {
                        setSelectedProductionOrderCode('');
                        setNewRow(prev => ({ ...prev, productCode: '', productName: '' }));
                      }
                    }}
                    className={modalInputClass}
                  >
                    <option value="order">Theo lệnh SX</option>
                    <option value={WEIGHING_OTHER_ORDER_CODE}>Khác — chọn NVL ngoài lệnh</option>
                  </select>
                </label>
              ) : null}
              <label className="field-cell col-span-2">
                <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                  <Hash className="h-3.5 w-3.5 text-[#ef1b2d]" />
                  {isOtherOrderSelected ? 'Mã NVL' : 'Mã SP'}
                </span>
                <div>
                    <SearchableSelect
                      value={newRow.productCode ?? ''}
                      onChange={productCode => {
                        setNewRow(prev => ({
                          ...prev,
                          productCode,
                          productName: resolveProductNameFromCode(productSelectOptions, productCode, prev.productName)
                        }));
                      }}
                      onSelectOption={item => {
                        if (!item) return;
                        const product = item as ProductOption;
                        setNewRow(prev => ({
                          ...prev,
                          productCode: product.productCode,
                          productName: product.productName
                        }));
                      }}
                      options={productSelectOptions}
                      placeholder={productCodePlaceholder}
                      isLoading={isOtherOrderSelected ? isLoadingMaterials : isLoadingProductionOrders}
                      disabled={productCodeSelectDisabled}
                      inputClassName={modalInputClass}
                      getValue={item => (item as ProductOption).productCode}
                      getLabel={item => {
                        const product = item as ProductOption;
                        const codeLabel =
                          product.newCode && product.newCode !== product.productCode
                            ? `${product.productCode} / ${product.newCode}`
                            : product.productCode;
                        return product.productName ? `${codeLabel} · ${product.productName}` : codeLabel;
                      }}
                      resolveSelectedItem={(options, value) =>
                        findProductByCode(options as ProductOption[], value)
                      }
                    />
                </div>
                {(productionOrdersError || productFilterContext.ngay || isOtherOrderSelected) && (
                  <p className="text-[10px] font-semibold text-zinc-400">
                    {productionOrdersError ||
                      (isOtherOrderSelected
                        ? `${productSelectOptions.length} mã NVL từ kho`
                        : productFilterContext.ngay && productFilterContext.ca && productFilterContext.machineName
                          ? `${productSelectOptions.length} mã từ lệnh SX`
                          : 'Lọc theo ngày, ca, máy')}
                  </p>
                )}
              </label>
              <label className="field-cell col-span-2">
                <span className={modalLabelClass}>{isOtherOrderSelected ? 'Tên NVL' : 'Tên SP'}</span>
                {(() => {
                  const codeMatch = findProductByCode(productSelectOptions, newRow.productCode ?? '');
                  if (codeMatch || isOtherOrderSelected) {
                    return (
                      <input
                        type="text"
                        readOnly
                        value={codeMatch?.productName || newRow.productName || ''}
                        className={`${modalInputClass} bg-zinc-50 text-zinc-800`}
                        placeholder={isOtherOrderSelected ? 'Chọn mã NVL trước' : ''}
                      />
                    );
                  }
                  return (
                    <ProductNameSelect
                      value={newRow.productName ?? ''}
                      onChange={value => {
                        const match = findProductByName(productSelectOptions, value);
                        setNewRow(prev => ({
                          ...prev,
                          productName: value,
                          productCode: match?.productCode || prev.productCode
                        }));
                      }}
                      products={productSelectOptions}
                      isLoading={isLoadingProductionOrders}
                      className={modalInputClass}
                    />
                  );
                })()}
                {productsError && (
                  <p className="text-[11px] font-bold text-rose-600">{productsError}</p>
                )}
              </label>
              </>
              )}
              {splitDamagedPlasticDefectWeights ? (
                <div className="col-span-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  <label className="field-cell col-span-2 sm:col-span-3">
                    <span className={modalCompactLabelClass}>
                      Loại hàng hỏng <span className="text-[#ef1b2d]">*</span>
                    </span>
                    <select
                      value={newRow.materialType ?? ''}
                      onChange={e => {
                        const materialType = e.target.value;
                        setNewRow(prev => ({
                          ...prev,
                          materialType,
                          ...(materialType === 'vat_tu_khac'
                            ? {
                                plasticNoFilmWeight: '',
                                plasticNozzleWeight: '',
                                plasticFilmAdhesionWeight: '',
                                shellWeight: '',
                                coreWeight: ''
                              }
                            : {
                                materialCode: '',
                                materialQuantity: '',
                                weight: materialType === 'nhua' ? '' : prev.weight
                              })
                        }));
                      }}
                      className={modalInputClass}
                      required
                    >
                      <option value="">Chọn...</option>
                      <option value="nhua">Nhựa</option>
                      <option value="vat_tu_khac">Vật tư khác</option>
                    </select>
                  </label>
                  {newRow.materialType === 'vat_tu_khac' ? (
                    <>
                      <label className="field-cell col-span-2 sm:col-span-3">
                        <span className={modalCompactLabelClass}>
                          Mã vật tư <span className="text-[#ef1b2d]">*</span>
                        </span>
                        <select
                          value={newRow.materialCode ?? ''}
                          onChange={e => {
                            const materialCode = e.target.value;
                            setNewRow(prev => ({
                              ...prev,
                              materialCode,
                              weight: computeDamagedOtherMaterialWeightKg(
                                materialCode,
                                prev.materialQuantity ?? '',
                                materials
                              )
                            }));
                          }}
                          className={modalInputClass}
                          required
                        >
                          <option value="">Chọn từ kho NVL...</option>
                          {materials.map(material => (
                            <option key={material.code} value={material.code}>
                              {material.code}{material.name ? ` — ${material.name}` : ''}
                              {material.totalWeight
                                ? ` (${material.totalWeight} kg/${material.unit || 'đvt'})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-cell">
                        <span className={modalCompactLabelClass}>
                          Số lượng <span className="text-[#ef1b2d]">*</span>
                        </span>
                        <input
                          value={newRow.materialQuantity ?? ''}
                          onChange={e => {
                            const materialQuantity = sanitizeDecimalTyping(e.target.value);
                            setNewRow(prev => ({
                              ...prev,
                              materialQuantity,
                              weight: computeDamagedOtherMaterialWeightKg(
                                prev.materialCode ?? '',
                                materialQuantity,
                                materials
                              )
                            }));
                          }}
                          className={modalInputClass}
                          placeholder="0"
                          required
                        />
                      </label>
                      <label className="field-cell col-span-1 sm:col-span-2">
                        <span className={modalCompactLabelClass}>Khối lượng vật tư khác (kg)</span>
                        <input
                          value={newRow.weight ?? ''}
                          onChange={e =>
                            setNewRow(prev => ({ ...prev, weight: sanitizeDecimalTyping(e.target.value) }))
                          }
                          className={modalInputClass}
                          placeholder="Tự tính = SL × Tổng kg NVL"
                        />
                        {(() => {
                          const material = materials.find(item => item.code === (newRow.materialCode || ''));
                          const qty = parseWeighingWeight(newRow.materialQuantity ?? '');
                          if (!material || qty === null || qty <= 0) return null;
                          const perUnitHint = material.totalWeight
                            ? `${material.totalWeight} kg/${material.unit || 'đvt'}`
                            : null;
                          return (
                            <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">
                              {perUnitHint
                                ? `Tự nhân: ${newRow.materialQuantity} × ${perUnitHint}`
                                : 'Tự nhân theo Tổng kg kho NVL (hoặc suy từ tên/mã nếu thiếu cột Tổng kg)'}
                            </p>
                          );
                        })()}
                      </label>
                    </>
                  ) : (
                  <>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>Nhựa không mảng</span>
                    <input
                      value={newRow.plasticNoFilmWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({ ...prev, plasticNoFilmWeight: sanitizeDecimalTyping(e.target.value) }))
                      }
                      className={modalInputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>Nhựa đầu nòng</span>
                    <input
                      value={newRow.plasticNozzleWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({ ...prev, plasticNozzleWeight: sanitizeDecimalTyping(e.target.value) }))
                      }
                      className={modalInputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>Nhựa dính màng</span>
                    <input
                      value={newRow.plasticFilmAdhesionWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({
                          ...prev,
                          plasticFilmAdhesionWeight: sanitizeDecimalTyping(e.target.value)
                        }))
                      }
                      className={modalInputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>KL màng</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newRow.shellWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({ ...prev, shellWeight: sanitizeDecimalTyping(e.target.value) }))
                      }
                      className={modalInputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>TL lõi dính HH</span>
                    <input
                      value={newRow.coreWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({ ...prev, coreWeight: sanitizeDecimalTyping(e.target.value) }))
                      }
                      className={modalInputClass}
                      placeholder="0"
                    />
                  </label>
                  </>
                  )}
                </div>
              ) : splitPlasticFilmWeights ? (
                <div className="col-span-2 grid grid-cols-2 gap-1.5">
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>KL nhựa</span>
                    <input
                      value={newRow.weight ?? ''}
                      onChange={e => setNewRow(prev => ({ ...prev, weight: sanitizeDecimalTyping(e.target.value) }))}
                      className={modalInputClass}
                      placeholder="8,0"
                    />
                  </label>
                  <label className="field-cell">
                    <span className={modalCompactLabelClass}>KL màng</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newRow.shellWeight ?? ''}
                      onChange={e =>
                        setNewRow(prev => ({ ...prev, shellWeight: sanitizeDecimalTyping(e.target.value) }))
                      }
                      className={modalInputClass}
                      placeholder="0,5"
                    />
                  </label>
                </div>
              ) : (
              <div
                className={`col-span-2 grid gap-1.5 ${
                  config.hideCoreShellWeights ? 'grid-cols-1' : 'grid-cols-3'
                }`}
              >
                <label className="field-cell">
                  <span className={modalCompactLabelClass}>Tổng trọng lượng</span>
                  <input
                    value={newRow.weight ?? ''}
                    onChange={e => setNewRow(prev => ({ ...prev, weight: e.target.value }))}
                    className={modalInputClass}
                    placeholder="8,0"
                  />
                </label>
                {!config.hideCoreShellWeights && (
                  <>
                    <label className="field-cell">
                      <span className={modalCompactLabelClass}>TL lõi</span>
                      <input
                        value={newRow.coreWeight ?? ''}
                        onChange={e => setNewRow(prev => ({ ...prev, coreWeight: e.target.value }))}
                        className={modalInputClass}
                        placeholder="0,5"
                      />
                    </label>
                    <label className="field-cell">
                      <span className={modalCompactLabelClass}>TL bì</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newRow.shellWeight ?? ''}
                        onChange={e =>
                          setNewRow(prev => ({ ...prev, shellWeight: sanitizeDecimalTyping(e.target.value) }))
                        }
                        className={modalInputClass}
                        placeholder={DEFAULT_SHELL_WEIGHT}
                      />
                    </label>
                  </>
                )}
              </div>
              )}
              {!config.hideAcceptanceStatus && (
                <label className="field-cell">
                  <span className={modalLabelClass}>
                    Nghiệm thu <span className="text-[#ef1b2d]">*</span>
                  </span>
                  <select
                    value={newRow.acceptanceStatus ?? ''}
                    onChange={e => setNewRow(prev => ({ ...prev, acceptanceStatus: e.target.value }))}
                    className={modalInputClass}
                    required
                  >
                    <option value="">Chọn...</option>
                    {ACCEPTANCE_STATUS_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={`field-cell ${config.hideAcceptanceStatus ? 'col-span-2' : ''}`}>
                <span className={modalLabelClass}>Ghi chú</span>
                <input
                  type="text"
                  value={newRow.note ?? ''}
                  onChange={e => setNewRow(prev => ({ ...prev, note: e.target.value }))}
                  className={modalInputClass}
                  placeholder="Ghi chú lần cân"
                />
              </label>
              {!config.hideCoreWeightImage && (
                <div className="field-cell">
                  <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                    <ImagePlus className="h-3.5 w-3.5 text-[#ef1b2d]" />
                    Ảnh lõi
                  </span>
                  <input
                    ref={coreWeightCameraInputRef}
                    {...CAMERA_IMAGE_INPUT_PROPS}
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      e.target.value = '';
                      setCoreWeightImageFile(file);
                      if (file) handleCoreImageUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => coreWeightCameraInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {coreWeightImageFile || newRow.coreWeightImageUrl ? 'Chụp lại' : 'Chụp ảnh'}
                  </button>
                  {(coreWeightImageFile || newRow.coreWeightImageUrl) && (
                    <p className="truncate text-[10px] font-semibold text-zinc-500">
                      {newRow.coreWeightImageUrl ? 'Đã upload' : coreWeightImageFile?.name}
                    </p>
                  )}
                </div>
              )}
              {!config.hideWeightImage && (
                <div className="field-cell">
                  <span className={`flex items-center gap-1 ${modalLabelClass}`}>
                    <ImagePlus className="h-3.5 w-3.5 text-[#ef1b2d]" />
                    Ảnh cân
                  </span>
                  <input
                    ref={weightCameraInputRef}
                    {...CAMERA_IMAGE_INPUT_PROPS}
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      e.target.value = '';
                      setImageFile(file);
                      if (file) handleWeightImageUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => weightCameraInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {imageFile || newRow.imageUrl ? 'Chụp lại' : 'Chụp ảnh'}
                  </button>
                  {(imageFile || newRow.imageUrl) && (
                    <p className="truncate text-[10px] font-semibold text-zinc-500">
                      {newRow.imageUrl ? 'Đã upload' : imageFile?.name}
                    </p>
                  )}
                </div>
              )}
            </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-3 py-2.5">
              {addFormError && (
                <p className="mr-auto max-w-xs text-xs font-bold text-rose-600">
                  {addFormError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsAddFormOpen(false);
                  setEditingRow(null);
                }}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              {(editingRow ? canEdit : canCreate) ? (
              <button
                type="button"
                onClick={addFormRow}
                disabled={isUploadingImage}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploadingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingRow ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {isUploadingImage
                  ? 'Đang upload ảnh...'
                  : editingRow
                    ? 'Lưu thay đổi'
                    : 'Thêm vào bảng'}
              </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {viewingRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wide text-zinc-950">Chi tiết dòng cân</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {viewingRow.weighNo ? formatWeighRound(viewingRow.weighNo) : '—'} · {viewingRow.weighTime || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRow(null)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 text-xs">
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ngày SX</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.productionDate || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ca</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.shiftName || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">CN 1</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.worker1 || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">CN 2</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.worker2 || '—'}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Người cân</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.weigherName || '—'}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Tên máy</span>
                <p className="mt-1 font-bold text-zinc-800">
                  {isRealMachineName(viewingRow.machineName) ? viewingRow.machineName : '—'}
                </p>
              </div>
              {!hideProductFields && (
              <>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Mã sản phẩm</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.productCode || '—'}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Tên sản phẩm</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.productName || '—'}</p>
              </div>
              </>
              )}
              {splitDamagedPlasticDefectWeights ? (
                isDamagedOtherMaterial(viewingRow) ? (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Loại hàng hỏng</span>
                    <p className="mt-1 font-bold text-zinc-800">
                      {damagedGoodsMaterialTypeLabel(viewingRow.materialType)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Mã vật tư</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.materialCode || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Số lượng</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.materialQuantity || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">NVL khác (kg)</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Lõi (kg)</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng lỗi hỏng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
                ) : (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Loại hàng hỏng</span>
                    <p className="mt-1 font-bold text-zinc-800">
                      {damagedGoodsMaterialTypeLabel(viewingRow.materialType)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa không mảng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticNoFilmWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa đầu nòng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticNozzleWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa dính màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticFilmAdhesionWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.shellWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">TL lõi dính HH</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.coreWeight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng lỗi hỏng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
                )
              ) : splitPlasticFilmWeights ? (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL nhựa</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.shellWeight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
              ) : (
              <>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">TL lõi</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.coreWeight || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">TL bì</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.shellWeight || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wide text-zinc-400 text-[10px]">TL nhựa</span>
                <p className="mt-1 font-bold text-zinc-800">{formatWeighingNetWeight(viewingRow)}</p>
              </div>
              <div className="rounded-lg bg-red-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                <p className="mt-1 font-black text-[#ef1b2d]">{formatWeighingRowTotalWeight(viewingRow)}</p>
              </div>
              </>
              )}
              {!config.hideAcceptanceStatus && (
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Nghiệm thu</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.acceptanceStatus || '—'}</p>
              </div>
              )}
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ghi chú</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.note || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ảnh TL lõi</span>
                {viewingRow.coreWeightImageUrl ? (
                  <WeighingImageThumbnail
                    url={viewingRow.coreWeightImageUrl}
                    alt="Ảnh TL lõi"
                    title="Ảnh trọng lượng lõi"
                    onView={() =>
                      setViewingImage({ url: viewingRow.coreWeightImageUrl!, title: 'Ảnh trọng lượng lõi' })
                    }
                    className="mt-2 block h-24 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                  />
                ) : (
                  <p className="mt-1 font-semibold text-zinc-400">Chưa có</p>
                )}
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ảnh cân</span>
                {viewingRow.imageUrl ? (
                  <WeighingImageThumbnail
                    url={viewingRow.imageUrl}
                    alt="Ảnh cân"
                    title="Ảnh cân"
                    onView={() => setViewingImage({ url: viewingRow.imageUrl!, title: 'Ảnh cân' })}
                    className="mt-2 block h-24 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                  />
                ) : (
                  <p className="mt-1 font-semibold text-zinc-400">Chưa có</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setViewingRow(null);
                  openEditRow(viewingRow);
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa
              </button>
              ) : null}
              <button
                type="button"
                onClick={() => setViewingRow(null)}
                className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white transition hover:bg-zinc-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />
      {/* Chọn sản phẩm theo lệnh SX; form này không còn dùng trình quét QR. */}
    </div>
  );
}
