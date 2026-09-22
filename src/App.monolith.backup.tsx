import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { 
  ProductionReport, ShiftInfo, ProductEntry, MaterialBatches, STANDARD_SHIFTS
} from './types';
import { computeReportMetrics, formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from './utils';
import ShiftInfoForm from './components/ShiftInfoForm';
import {
  downloadBulkOpeningStockTemplate,
  parseBulkOpeningStockExcel,
  type BulkOpeningStockImportRow
} from './utils/bulkOpeningStockExcel';
import {
  downloadBulkMaterialTotalWeightTemplate,
  parseBulkMaterialTotalWeightExcel,
  type BulkMaterialTotalWeightImportRow
} from './utils/bulkMaterialTotalWeightExcel';
import {
  downloadBulkProductNplComponentsTemplate,
  downloadProductNplComponentsTemplate,
  parseBulkProductNplComponentsExcel,
  parseProductNplComponentsExcel,
  type BulkProductNplComponentsExcelRow,
  type ProductNplComponentsExcelRow
} from './utils/productNplComponentsExcel';
import ProductEntryForm from './components/ProductEntryForm';
import MaterialsForm from './components/MaterialsForm';
import WasteForm from './components/WasteForm';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import WeighingShiftSummary, {
  buildWeighingEditPending,
  normalizeWeighingRecords,
  type WeighingPendingAdd,
  type WeighingRecord
} from './components/WeighingShiftSummary';
import WeighingReportForm from './components/WeighingReportForm';
import { DAMAGED_GOODS_SLIP_CONFIG } from './lib/weighingSlipConfig';
import MixingReportForm from './components/MixingReportForm';
import MixingReportListView from './components/MixingReportListView';
import MachineNvlReportListView from './components/MachineNvlReportListView';
import AcceptanceReportForm, { normalizeAcceptanceReports, type AcceptanceReport } from './components/AcceptanceReportForm';
import AcceptanceReportListView from './components/AcceptanceReportListView';
import ControlBoardShiftSummaryTable from './components/ControlBoardShiftSummaryTable';
import ProductionPlanNvlPrintSheet from './components/ProductionPlanNvlPrintSheet';
import type { ProductionPlanNvlPrintShiftGroup } from './components/ProductionPlanNvlPrintSheet';
import { buildControlBoardShiftSummary, collectShiftSummaryStaffOptions, defaultShiftSummaryDateRange, type ShiftSummaryWarehouseMovement } from './utils/controlBoardShiftSummary';
import {
  normalizeMachineNvlReports,
  type MachineNvlReportKind,
  type MachineNvlSavedReport,
  type MachineNvlSavedLine
} from './utils/machineNvlReports';
import { getProductionShiftOptions, normalizeShiftSettings } from './utils/shiftSettings';
import { normalizeMixingReport } from './lib/mixingReportModel';
import type { MixingReport } from './components/MixingReportForm';
import MachineDowntimeReportPanel from './components/MachineDowntimeReportPanel';
import MachineDowntimeIcon from './components/icons/MachineDowntimeIcon';
import {
  MachineNvlPrintBatch,
  buildMachineNvlPrintReportFromForm,
  type MachineNvlPrintReport
} from './components/MachineNvlPrintSheet';
import WarehouseSlipPrintModal, { type WarehouseSlipPrintData } from './components/WarehouseSlipPrintModal';
import { RepeatableLineRow, RepeatableLinesBlock } from './components/RepeatableLinesBlock';
import { AppTab, pathFromTab, tabFromPath } from './routes';
import vietNhatLogoUrl from '../logovietnhat_1.png';
import { 
  FilePlus2, BarChart3, Layers, Wifi, WifiOff, 
  HelpCircle, CheckCircle, Smartphone, MapPin, 
  ChevronRight, ChevronLeft, ChevronDown, Save, Sparkles, Loader2, Menu, History, UsersRound,
  Building2, UserPlus, Search, MoreVertical, ShieldCheck, BriefcaseBusiness, Package, Cpu, Plus, Boxes, ClipboardList, Settings,
  ImagePlus,
  Eye, Pencil, Trash2, Factory, LayoutDashboard, FlaskConical, ArrowDownToLine, ArrowUpFromLine, Printer,
  GripVertical, ArrowUp, ArrowDown, ClipboardCheck, ClipboardPaste, Download, Upload, QrCode, Scale, CalendarDays, Home, PackageX,
  X
} from 'lucide-react';

const STORAGE_DRAFT_KEY = 'factory_report_draft_v1';
const STORAGE_OFFLINE_KEY = 'factory_reports_offline_queue';
const STORAGE_REPORTS_CACHE_KEY = 'factory_reports_cache_v1';
const STORAGE_WAREHOUSE_SLIP_DRAFT_KEY = 'warehouse_slip_prefill_draft_v1';

function readCachedReports(): ProductionReport[] {
  try {
    const cached = localStorage.getItem(STORAGE_REPORTS_CACHE_KEY);
    return cached ? JSON.parse(cached) as ProductionReport[] : [];
  } catch {
    return [];
  }
}

function VietNhatLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={vietNhatLogoUrl}
      alt="Công ty Việt Nhật - HCM"
      className={`brand-logo h-9 md:h-10 w-auto max-h-full object-contain ${className}`}
    />
  );
}

const PRINT_COMPANY_NAME = 'CÔNG TY VIỆT NHẬT – HCM';

interface HrMember {
  id: string;
  code?: string;
  name: string;
  role: string;
  position?: string;
  shift: string;
  status: string;
}

interface HrDepartment {
  id: string;
  name: string;
  lead: string;
  members: HrMember[];
}

interface HrBranch {
  id: string;
  name: string;
  shortName: string;
  departments: HrDepartment[];
}

function normalizeHrBranches(data: unknown): HrBranch[] {
  if (!data || typeof data !== 'object') return [];
  const branches = (data as { branches?: unknown }).branches;
  if (!Array.isArray(branches)) return [];

  return branches
    .map((branch): HrBranch | null => {
      if (!branch || typeof branch !== 'object') return null;
      const record = branch as Record<string, unknown>;
      const departments = Array.isArray(record.departments) ? record.departments : [];
      const normalizedDepartments = departments
        .map((department): HrDepartment | null => {
          if (!department || typeof department !== 'object') return null;
          const departmentRecord = department as Record<string, unknown>;
          const members = Array.isArray(departmentRecord.members) ? departmentRecord.members : [];

          return {
            id: String(departmentRecord.id ?? departmentRecord.name ?? ''),
            name: String(departmentRecord.name ?? 'Chưa phân phòng ban'),
            lead: String(departmentRecord.lead ?? 'Chưa phân công'),
            members: members
              .map((member): HrMember | null => {
                if (!member || typeof member !== 'object') return null;
                const memberRecord = member as Record<string, unknown>;
                const name = String(memberRecord.name ?? '').trim();
                if (!name) return null;

                return {
                  id: String(memberRecord.id ?? memberRecord.code ?? name),
                  code: String(memberRecord.code ?? '').trim() || undefined,
                  name,
                  role: String(memberRecord.role ?? 'Nhân sự'),
                  position: String(memberRecord.position ?? '').trim() || undefined,
                  shift: String(memberRecord.shift ?? 'Theo phân công'),
                  status: String(memberRecord.status ?? 'Đang làm')
                };
              })
              .filter((member): member is HrMember => Boolean(member))
          };
        })
        .filter((department): department is HrDepartment => Boolean(department));

      return {
        id: String(record.id ?? record.name ?? ''),
        name: String(record.name ?? 'Chưa phân chi nhánh'),
        shortName: String(record.shortName ?? record.name ?? 'Chi nhánh'),
        departments: normalizedDepartments
      };
    })
    .filter((branch): branch is HrBranch => Boolean(branch));
}

interface ProductRow {
  id: string;
  code: string;
  newCode: string;
  amisCode: string;
  name: string;
  nature: string;
  group: string;
  unit: string;
  totalWeight: string;
  rollWidth: string;
  rollLength: string;
  coreWeight: string;
  bagWeight: string;
  plasticWeight: string;
  openingStock: string;
  inbound: string;
  outbound: string;
  stock: string;
  minStock: string;
  origin: string;
  description: string;
  nplItems: ProductNplItem[];
}

type ProductNplAmountType = 'percent' | 'quantity';

interface ProductNplItem {
  code: string;
  name: string;
  amountType: ProductNplAmountType;
  percent: number | null;
  quantity: number | null;
  unit: string;
}

interface MaterialOption {
  code: string;
  name: string;
  unit: string;
}

function roundNplNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveProductNplAmountType(record: Record<string, unknown>): ProductNplAmountType {
  const loai = String(record.loai ?? record.amountType ?? record.dinh_luong_loai ?? '').trim().toLowerCase();
  if (loai === 'so_luong' || loai === 'quantity') return 'quantity';
  if (loai === 'phan_tram' || loai === 'percent') return 'percent';

  const quantityRaw = record.so_luong ?? record.quantity;
  const percentRaw = record.phan_tram ?? record.percent ?? record.ty_le;
  const quantity = parsePercentInput(String(quantityRaw ?? ''));
  const percent = parsePercentInput(String(percentRaw ?? ''));

  if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== '' && (percentRaw === undefined || percentRaw === null || percentRaw === '')) {
    return 'quantity';
  }

  if (Number.isFinite(quantity) && !Number.isFinite(percent)) return 'quantity';
  return 'percent';
}

function productNplAmountTypeLabel(type: ProductNplAmountType) {
  return type === 'quantity' ? 'Số lượng' : 'Phần trăm';
}

function formatProductNplAmount(item: ProductNplItem) {
  if (item.amountType === 'quantity') {
    const unitSuffix = item.unit && item.unit !== '-' ? ` ${item.unit}` : '';
    return `${formatNumber(item.quantity ?? 0, 2)}${unitSuffix}`;
  }
  return `${formatPercent(item.percent ?? 0)}%`;
}

function parseProductNplItems(raw: unknown): ProductNplItem[] {
  let source = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(source)
    ? source
    : source && typeof source === 'object' && Array.isArray((source as { items?: unknown }).items)
      ? (source as { items: unknown[] }).items
      : [];

  return list
    .map((entry): ProductNplItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.code ?? record.ma ?? '').trim();
      const name = String(record.ten_npl ?? record.name ?? record.ten ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim() || '-';
      const amountType = resolveProductNplAmountType(record);

      if (!code) return null;

      if (amountType === 'quantity') {
        const quantity = Number(record.so_luong ?? record.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) return null;
        return {
          code,
          name,
          amountType: 'quantity',
          percent: null,
          quantity: roundNplNumber(quantity),
          unit
        };
      }

      const percent = Number(record.phan_tram ?? record.percent ?? record.ty_le);
      if (!Number.isFinite(percent)) return null;
      return {
        code,
        name,
        amountType: 'percent',
        percent: roundNplNumber(percent),
        quantity: null,
        unit
      };
    })
    .filter((item): item is ProductNplItem => Boolean(item));
}

function formatProductNplSummary(items: ProductNplItem[]) {
  if (items.length === 0) return '-';
  return items.map(item => `${item.code} ${formatProductNplAmount(item)}`).join(' · ');
}

function productNplItemsToJson(items: ProductNplItem[]) {
  return items.map(item => {
    const base = {
      ma_npl: item.code,
      ten_npl: item.name,
      loai: item.amountType === 'quantity' ? 'so_luong' : 'phan_tram',
      don_vi: item.unit && item.unit !== '-' ? item.unit : null
    };

    if (item.amountType === 'quantity') {
      return {
        ...base,
        so_luong: item.quantity,
        phan_tram: null
      };
    }

    return {
      ...base,
      phan_tram: item.percent,
      so_luong: null
    };
  });
}

function excelRowsToProductNplItems(
  rows: ProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
): ProductNplItem[] {
  return rows.map(row => {
    const material = materialOptions.find(
      option => normalizeProductCodeKey(option.code) === normalizeProductCodeKey(row.code)
    );
    const name = row.name || material?.name || '';
    if (row.amountType === 'quantity') {
      return {
        code: row.code.trim(),
        name,
        amountType: 'quantity',
        percent: null,
        quantity: row.value,
        unit: row.unit || material?.unit || '-'
      };
    }

    return {
      code: row.code.trim(),
      name,
      amountType: 'percent',
      percent: row.value,
      quantity: null,
      unit: '-'
    };
  });
}

function bulkExcelRowsToProductMap(
  rows: BulkProductNplComponentsExcelRow[],
  materialOptions: MaterialOption[]
) {
  const grouped = new Map<string, ProductNplItem[]>();

  rows.forEach(row => {
    const material = materialOptions.find(
      option => normalizeProductCodeKey(option.name) === normalizeProductCodeKey(row.componentName)
    );
    const item: ProductNplItem =
      row.amountType === 'quantity'
        ? {
            code: material?.code || row.componentName.trim(),
            name: row.componentName || material?.name || '',
            amountType: 'quantity',
            percent: null,
            quantity: row.value,
            unit: row.unit || material?.unit || '-'
          }
        : {
            code: material?.code || row.componentName.trim(),
            name: row.componentName || material?.name || '',
            amountType: 'percent',
            percent: row.value,
            quantity: null,
            unit: '-'
          };

    const key = normalizeProductCodeKey(row.productCode);
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  });

  return grouped;
}

const productFieldClass =
  'h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10';

function BackButton({
  onClick,
  variant = 'light',
  className = ''
}: {
  onClick: () => void;
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const styles =
    variant === 'dark'
      ? 'border-white/15 text-white hover:border-brand-500 hover:bg-brand-500'
      : 'border-slate-200 text-slate-600 hover:bg-slate-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-3 text-xs font-bold transition ${styles} ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      Quay lại
    </button>
  );
}

function HomeNavButton({
  active,
  onClick,
  variant = 'sidebar'
}: {
  active: boolean;
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  variant?: 'sidebar' | 'bottom';
}) {
  const isSidebar = variant === 'sidebar';
  const activeClass = active
    ? isSidebar
      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
      : 'bg-brand-50 text-brand-700'
    : isSidebar
      ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
      : 'text-slate-500 hover:bg-slate-50 hover:text-brand-500';

  return (
    <a
      href={pathFromTab('menu')}
      onClick={onClick}
      aria-label="Trang chủ"
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 transition active:scale-95 ${
        isSidebar
          ? `w-14 rounded-xl px-1 py-2 ${activeClass}`
          : `min-h-[40px] flex-1 py-1 px-2 rounded-lg ${activeClass}`
      }`}
    >
      <Home className="h-4 w-4" />
      <span className={`font-bold uppercase leading-none ${isSidebar ? 'text-[8px] tracking-wide' : 'text-[9px] tracking-wider'}`}>
        Trang chủ
      </span>
    </a>
  );
}

// Bảng ánh xạ tab hiện tại → tab cha (dùng cho nút Quay lại ở bottom nav)
const BACK_TAB_MAP: Record<string, string> = {
  'acceptance-report-list': 'report-lists',
  'report-lists': 'production-reports',
  'report-forms': 'production-reports',
  'production-reports': 'menu',
  'facility-management': 'menu',
  'hcns': 'menu',
  'business': 'menu',
  'factory': 'menu',
  'products': 'facility-management',
  'machines': 'facility-management',
  'materials': 'facility-management',
  'warehouse-slip': 'facility-management',
  'warehouse-history': 'facility-management',
  'hr': 'hcns',
  'settings': 'hcns',
  'orders': 'business',
  'customers': 'business',
  'production-orders': 'factory',
  'production-plan-history': 'production-reports',
  'weighing-summary': 'report-forms',
  'weighing-summary-list': 'report-lists',
  'damaged-goods-report': 'report-forms',
  'machine-nvl-report': 'report-forms',
  'machine-nvl-report-list': 'report-lists',
  'machine-downtime-list': 'report-lists',
  'machine-downtime-report': 'report-forms',
  'acceptance-report': 'report-forms'
};

function MobileBackNavButton({
  onClick,
  variant = 'bottom'
}: {
  onClick: () => void;
  variant?: 'bottom' | 'sidebar';
}) {
  const isSidebar = variant === 'sidebar';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quay lại"
      className={`flex flex-col items-center justify-center gap-0.5 transition active:scale-95 ${
        isSidebar
          ? 'w-14 rounded-xl px-1 py-2 text-slate-400 hover:bg-slate-800 hover:text-white'
          : 'min-h-[40px] flex-1 py-1 px-2 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-brand-500'
      }`}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className={`font-bold uppercase leading-none ${isSidebar ? 'text-[8px] tracking-wide' : 'text-[9px] tracking-wide'}`}>
        Quay lại
      </span>
    </button>
  );
}

type ProductViewTab = 'info' | 'components';

function ProductNplItemFormModal({
  mode,
  initialItem,
  materialOptions,
  isLoadingMaterials,
  isSaving,
  existingCodes,
  onClose,
  onSave
}: {
  mode: 'add' | 'edit';
  initialItem?: ProductNplItem;
  materialOptions: MaterialOption[];
  isLoadingMaterials: boolean;
  isSaving: boolean;
  existingCodes: string[];
  onClose: () => void;
  onSave: (item: ProductNplItem) => Promise<void>;
}) {
  const [code, setCode] = useState(initialItem?.code ?? '');
  const [name, setName] = useState(initialItem?.name ?? '');
  const [amountType, setAmountType] = useState<ProductNplAmountType>(initialItem?.amountType ?? 'percent');
  const [amountValue, setAmountValue] = useState(() => {
    if (!initialItem) return '';
    if (initialItem.amountType === 'quantity') {
      return formatNumber(initialItem.quantity ?? 0, 2);
    }
    return formatPercent(initialItem.percent ?? 0);
  });
  const [unit, setUnit] = useState(initialItem?.unit && initialItem.unit !== '-' ? initialItem.unit : '');
  const [formError, setFormError] = useState('');

  const pickMaterial = (nextCode: string) => {
    setCode(nextCode);
    const material = materialOptions.find(option => option.code === nextCode);
    if (material) {
      setName(material.name);
      if (material.unit && material.unit !== '-') {
        setUnit(material.unit);
      }
    }
  };

  const handleSave = async () => {
    const trimmedCode = code.trim();
    const numericValue = parsePercentInput(amountValue);

    if (!trimmedCode) {
      setFormError('Vui lòng chọn mã NPL.');
      return;
    }
    if (existingCodes.includes(trimmedCode)) {
      setFormError(`Mã NPL ${trimmedCode} đã có trong thành phần.`);
      return;
    }

    const material = materialOptions.find(option => option.code === trimmedCode);
    const resolvedUnit = unit.trim() || material?.unit || '-';

    if (amountType === 'percent') {
      if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
        setFormError('Phần trăm phải từ 0 đến 100.');
        return;
      }
    } else if (!Number.isFinite(numericValue) || numericValue < 0) {
      setFormError('Số lượng phải lớn hơn hoặc bằng 0.');
      return;
    }

    setFormError('');
    try {
      await onSave({
        code: trimmedCode,
        name: name.trim() || material?.name || '',
        amountType,
        percent: amountType === 'percent' ? roundNplNumber(numericValue) : null,
        quantity: amountType === 'quantity' ? roundNplNumber(numericValue) : null,
        unit: resolvedUnit
      });
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu thành phần.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              {mode === 'add' ? 'Thêm thành phần' : 'Sửa thành phần'}
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">NVL · phần trăm hoặc số lượng</p>
          </div>
          <BackButton onClick={onClose} />
        </div>
        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
            {formError}
          </div>
        )}
        <div className="space-y-3 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã NPL *</span>
            <SearchableSelect
              value={code}
              onChange={pickMaterial}
              options={materialOptions}
              placeholder="Gõ để tìm mã NPL"
              isLoading={isLoadingMaterials}
              disabled={isLoadingMaterials || mode === 'edit'}
              inputClassName={productFieldClass}
              getLabel={item => {
                const material = item as MaterialOption;
                return `${material.code} · ${material.name}`;
              }}
              getValue={item => (item as MaterialOption).code}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên NVL</span>
            <input value={name} onChange={e => setName(e.target.value)} className={productFieldClass} placeholder="Tên nguyên vật liệu" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại định lượng *</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['percent', 'Phần trăm'],
                ['quantity', 'Số lượng']
              ] as const).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setAmountType(type);
                    setAmountValue('');
                  }}
                  className={`h-11 rounded-lg border px-3 text-xs font-extrabold transition ${
                    amountType === type
                      ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>
          {amountType === 'percent' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phần trăm *</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountValue}
                onChange={e => setAmountValue(e.target.value)}
                className={productFieldClass}
                placeholder="VD: 40,50"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Số lượng *</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountValue}
                  onChange={e => setAmountValue(e.target.value)}
                  className={productFieldClass}
                  placeholder="VD: 100,00"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Đơn vị</span>
                <input
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className={productFieldClass}
                  placeholder="VD: Kg, Cuộn"
                />
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <BackButton onClick={onClose} className="h-10 rounded-lg bg-white" />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : mode === 'add' ? 'Thêm' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseProductSpecNumber(value: string) {
  if (!value || value === '-') return null;
  const num = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function formatProductSpecDisplay(value: string) {
  const num = parseProductSpecNumber(value);
  if (num === null) return '-';
  return formatNumber(num, 2);
}

function resolveProductPlasticWeight(
  product: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'>
) {
  const stored = parseProductSpecNumber(product.plasticWeight);
  if (stored !== null) return formatNumber(stored, 2);
  const total = parseProductSpecNumber(product.totalWeight);
  if (total === null) return '-';
  const core = parseProductSpecNumber(product.coreWeight) ?? 0;
  const bag = parseProductSpecNumber(product.bagWeight) ?? 0;
  return formatNumber(total - core - bag, 2);
}

function resolveProductMaterialBaseKg(
  product?: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'> | null
) {
  if (!product) return 0;
  const stored = parseProductSpecNumber(product.plasticWeight);
  if (stored !== null && stored > 0) return stored;
  const total = parseProductSpecNumber(product.totalWeight);
  if (total === null || total <= 0) return 0;
  const core = parseProductSpecNumber(product.coreWeight) ?? 0;
  const bag = parseProductSpecNumber(product.bagWeight) ?? 0;
  return roundNplNumber(total - core - bag);
}

function normalizeProductCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

function findProductByCode(products: ProductRow[], code: string) {
  const key = normalizeProductCodeKey(code);
  if (!key) return undefined;
  return products.find(
    product =>
      normalizeProductCodeKey(product.code) === key ||
      (product.amisCode && normalizeProductCodeKey(product.amisCode) === key) ||
      (product.newCode && normalizeProductCodeKey(product.newCode) === key)
  );
}

function productAmisDisplayCode(product: Pick<ProductRow, 'amisCode' | 'code'>) {
  return product.amisCode && product.amisCode !== '-' ? product.amisCode : product.code || '-';
}

function ProductViewModal({
  product,
  initialTab = 'info',
  materialOptions,
  isLoadingMaterials,
  isSaving,
  onClose,
  onSaveItems
}: {
  product: ProductRow;
  initialTab?: ProductViewTab;
  materialOptions: MaterialOption[];
  isLoadingMaterials: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSaveItems: (items: ProductNplItem[]) => Promise<void>;
}) {
  const [tab, setTab] = useState<ProductViewTab>(initialTab);
  const [items, setItems] = useState<ProductNplItem[]>(product.nplItems);
  const [detailItem, setDetailItem] = useState<ProductNplItem | null>(null);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [formIndex, setFormIndex] = useState<number | null>(null);
  const componentsFileInputRef = useRef<HTMLInputElement>(null);
  const [isReadingComponentsExcel, setIsReadingComponentsExcel] = useState(false);
  const [componentsExcelMessage, setComponentsExcelMessage] = useState('');
  const [componentsExcelError, setComponentsExcelError] = useState('');

  useEffect(() => {
    setItems(product.nplItems);
  }, [product]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, product.id]);

  const totalPercent = items.reduce((sum, item) => {
    if (item.amountType !== 'percent' || item.percent === null) return sum;
    return sum + item.percent;
  }, 0);
  const percentItemCount = items.filter(item => item.amountType === 'percent').length;

  const openAddForm = () => {
    setFormIndex(null);
    setFormMode('add');
  };

  const openEditForm = (index: number) => {
    setFormIndex(index);
    setFormMode('edit');
  };

  const handleDeleteItem = async (index: number) => {
    const item = items[index];
    if (!item) return;
    if (!window.confirm(`Xóa thành phần "${item.code}" khỏi sản phẩm?`)) return;

    const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
    try {
      await onSaveItems(nextItems);
      setItems(nextItems);
      if (detailItem?.code === item.code) setDetailItem(null);
    } catch {
      // Lỗi đã hiển thị ở ProductsPanel
    }
  };

  const handleSaveItem = async (item: ProductNplItem) => {
    let nextItems: ProductNplItem[];

    if (formMode === 'edit' && formIndex !== null) {
      nextItems = items.map((existing, index) => (index === formIndex ? item : existing));
    } else {
      nextItems = [...items, item];
    }

    try {
      await onSaveItems(nextItems);
      setItems(nextItems);
      setFormMode(null);
      setFormIndex(null);
    } catch {
      // Lỗi đã hiển thị ở ProductsPanel
    }
  };

  const handleDownloadComponentsTemplate = () => {
    downloadProductNplComponentsTemplate(
      items.map(item => ({
        code: item.code,
        name: item.name,
        amountType: item.amountType,
        percent: item.percent,
        quantity: item.quantity,
        unit: item.unit
      })),
      product.code
    );
  };

  const handleComponentsExcelChange = async (file?: File | null) => {
    if (!file) return;

    setIsReadingComponentsExcel(true);
    setComponentsExcelError('');
    setComponentsExcelMessage('');

    try {
      const rows = await parseProductNplComponentsExcel(file);
      if (rows.length === 0) {
        throw new Error(
          'File Excel không có dòng thành phần hợp lệ. Kiểm tra cột Mã NPL, Loại, Giá trị và ĐVT (nếu là Số lượng).'
        );
      }

      const nextItems = excelRowsToProductNplItems(rows, materialOptions);
      const replaceLabel = items.length > 0 ? 'thay thế' : 'nhập';
      if (
        !window.confirm(
          `Tải ${nextItems.length} thành phần từ Excel và ${replaceLabel} danh sách hiện tại?`
        )
      ) {
        return;
      }

      await onSaveItems(nextItems);
      setItems(nextItems);
      setComponentsExcelMessage(`Đã tải ${nextItems.length} thành phần từ Excel.`);
    } catch (error: any) {
      setComponentsExcelError(error.message || 'Không thể đọc file Excel.');
    } finally {
      setIsReadingComponentsExcel(false);
      if (componentsFileInputRef.current) {
        componentsFileInputRef.current.value = '';
      }
    }
  };

  const compactInfoRows: Array<[string, string]> = [
    ['Mã SP', product.code || '-'],
    ['Mã AMIS', productAmisDisplayCode(product)],
    ...(product.newCode && product.newCode !== '-' && product.newCode !== product.code
      ? [['Mã mới', product.newCode] as [string, string]]
      : []),
    ['Nhóm', product.group],
    ['Tính chất', product.nature],
    ['Tồn đầu', product.openingStock],
    ['Nhập', product.inbound],
    ['Xuất', product.outbound],
    ['Tồn kho', product.stock],
    ['Tồn TT', product.minStock],
    ['Nguồn gốc', product.origin]
  ].filter(([, value]) => value && value !== '-');

  const productDescription =
    product.description && product.description !== '-' ? product.description.trim() : '';

  const normSpecCells = [
    { label: 'Đơn vị tính', value: product.unit && product.unit !== '-' ? product.unit : '-' },
    { label: 'Tổng trọng lượng TP (kg)', value: formatProductSpecDisplay(product.totalWeight), highlight: true },
    { label: 'Khổ cuộn (m)', value: formatProductSpecDisplay(product.rollWidth) },
    { label: 'Chiều dài mét/cuộn (m)', value: formatProductSpecDisplay(product.rollLength) },
    { label: 'Trọng lượng lõi (kg)', value: formatProductSpecDisplay(product.coreWeight) },
    { label: 'Trọng lượng túi (kg)', value: formatProductSpecDisplay(product.bagWeight) },
    { label: 'Trọng lượng nhựa + phụ gia (kg)', value: resolveProductPlasticWeight(product), highlight: true }
  ];

  const hasNormSpecs = normSpecCells.some(
    cell => cell.label !== 'Đơn vị tính' && cell.value !== '-'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-red-500">Xem sản phẩm</p>
            <h3 className="mt-1 text-lg font-black text-zinc-950">{product.name || product.code}</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{product.code}{product.newCode ? ` · ${product.newCode}` : ''}</p>
          </div>
          <BackButton onClick={onClose} />
        </div>

        <div className="flex gap-1 border-b border-zinc-200 px-4">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={`border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'info' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Thông tin
          </button>
          <button
            type="button"
            onClick={() => setTab('components')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'components' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            Thành phần
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">{items.length}</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'info' ? (
            <div className="space-y-3">
              <section className="rounded-lg border border-zinc-200 bg-zinc-50/80">
                <p className="border-b border-zinc-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Thông tin chung
                </p>
                <div className="overflow-x-auto px-2 py-2">
                  <table className="min-w-full text-xs">
                    <tbody>
                      <tr className="divide-x divide-zinc-200">
                        {compactInfoRows.map(([label, value]) => (
                          <td key={label} className="px-2 py-1 align-top whitespace-nowrap">
                            <span className="text-[9px] font-black uppercase tracking-wide text-zinc-400">{label}</span>
                            <p className="mt-0.5 font-bold text-zinc-900">{value}</p>
                          </td>
                        ))}
                      </tr>
                      {productDescription ? (
                        <tr>
                          <td colSpan={Math.max(compactInfoRows.length, 1)} className="border-t border-zinc-200 px-2 py-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wide text-zinc-400">Mô tả</span>
                            <p className="mt-0.5 text-xs font-semibold text-zinc-700">{productDescription}</p>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border-2 border-emerald-200 bg-emerald-50/30">
                <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Định mức sản phẩm</p>
                  <p className="text-[10px] font-semibold text-emerald-700/80">
                    Mã AMIS · {productAmisDisplayCode(product)}
                    {product.unit && product.unit !== '-' ? ` · ${product.unit}` : ''}
                  </p>
                </div>
                {!hasNormSpecs ? (
                  <p className="px-4 py-6 text-center text-sm font-semibold text-zinc-500">
                    Chưa khai báo định mức. Bấm Sửa để nhập hoặc chạy file seed SQL trên Supabase.
                  </p>
                ) : (
                  <div className="overflow-x-auto p-2">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-zinc-950 text-[9px] uppercase tracking-wider text-white">
                          {normSpecCells.map(cell => (
                            <th key={cell.label} className="px-2 py-2 font-black whitespace-nowrap">
                              {cell.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white">
                          {normSpecCells.map(cell => (
                            <td
                              key={cell.label}
                              className={`border border-zinc-200 px-2 py-2 font-bold whitespace-nowrap ${
                                cell.highlight ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-900'
                              }`}
                            >
                              {cell.value}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-zinc-950">Bảng thành phần NVL</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">Nguyên vật liệu · phần trăm hoặc số lượng</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {percentItemCount > 0 && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${Math.abs(totalPercent - 100) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                      Tổng %: {formatPercent(totalPercent)}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadComponentsTemplate}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Download className="h-4 w-4" />
                    Tải mẫu Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => componentsFileInputRef.current?.click()}
                    disabled={isSaving || isReadingComponentsExcel}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReadingComponentsExcel ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {isReadingComponentsExcel ? 'Đang đọc...' : 'Tải Excel lên'}
                  </button>
                  <input
                    ref={componentsFileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={event => handleComponentsExcelChange(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={openAddForm}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm
                  </button>
                </div>
              </div>

              {(componentsExcelError || componentsExcelMessage) && (
                <p
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                    componentsExcelError
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {componentsExcelError || componentsExcelMessage}
                </p>
              )}

              <p className="text-[11px] font-semibold text-zinc-500">
                Excel gồm các cột: <strong>Mã NPL</strong>, <strong>Tên NVL</strong>, <strong>Loại</strong> (Phần trăm / Số lượng), <strong>Giá trị</strong>, <strong>ĐVT</strong> (bắt buộc nếu Số lượng). Tải lên sẽ thay thế toàn bộ thành phần hiện tại.
              </p>

              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-4 py-3 font-black">STT</th>
                      <th className="px-4 py-3 font-black">Mã NPL</th>
                      <th className="px-4 py-3 font-black">Tên NVL</th>
                      <th className="px-4 py-3 font-black">Loại</th>
                      <th className="px-4 py-3 font-black">Giá trị</th>
                      <th className="px-4 py-3 font-black">ĐVT</th>
                      <th className="px-4 py-3 text-center font-black">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {items.map((item, index) => (
                      <tr key={`${item.code}-${index}`} className="hover:bg-red-50/40">
                        <td className="px-4 py-3 font-bold text-zinc-600">{index + 1}</td>
                        <td className="px-4 py-3 font-black text-zinc-950">{item.code}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">{item.name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-black text-zinc-700">
                            {productNplAmountTypeLabel(item.amountType)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                            {item.amountType === 'percent'
                              ? formatPercent(item.percent ?? 0)
                              : formatNumber(item.quantity ?? 0, 2)}
                            {item.amountType === 'percent' ? '%' : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-zinc-700">
                          {item.amountType === 'quantity' ? item.unit || '-' : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailItem(item)}
                              title="Xem"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditForm(index)}
                              title="Sửa"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(index)}
                              disabled={isSaving}
                              title="Xóa"
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center font-bold text-zinc-400">
                          Chưa khai báo thành phần NVL.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {detailItem && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết thành phần</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">{detailItem.code}</p>
              </div>
              <BackButton onClick={() => setDetailItem(null)} />
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {[
                ['Mã NPL', detailItem.code],
                ['Tên NVL', detailItem.name || '-'],
                ['Loại', productNplAmountTypeLabel(detailItem.amountType)],
                ['Giá trị', formatProductNplAmount(detailItem)],
                ['Đơn vị', detailItem.amountType === 'quantity' ? detailItem.unit || '-' : '-'],
                ['Sản phẩm', product.code]
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {formMode && (
        <ProductNplItemFormModal
          mode={formMode}
          initialItem={formMode === 'edit' && formIndex !== null ? items[formIndex] : undefined}
          materialOptions={materialOptions}
          isLoadingMaterials={isLoadingMaterials}
          isSaving={isSaving}
          existingCodes={items
            .filter((_, index) => formMode !== 'edit' || index !== formIndex)
            .map(item => item.code)}
          onClose={() => {
            setFormMode(null);
            setFormIndex(null);
          }}
          onSave={handleSaveItem}
        />
      )}
    </div>
  );
}

function normalizeProducts(data: unknown): ProductRow[] {
  if (!data || typeof data !== 'object') return [];
  const products = (data as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];

  return products
    .map((item): ProductRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.name ?? '').trim();
      if (!code && !name) return null;

      return {
        id: String(record.id ?? '').trim() || code || name,
        code,
        newCode: String(record.ma_sp_moi ?? '').trim(),
        amisCode: String(record.ma_amis ?? '').trim(),
        name,
        nature: String(record.tinh_chat ?? '').trim() || 'Chưa phân loại',
        group: String(record.nhom_vthh ?? '').trim() || 'Chưa nhóm',
        unit: String(record.don_vi ?? '').trim() || '-',
        totalWeight: formatCell(record.tong_trong_luong),
        rollWidth: formatCell(record.kho_cuon),
        rollLength: formatCell(record.chieu_dai_cuon),
        coreWeight: formatCell(record.trong_luong_loi),
        bagWeight: formatCell(record.trong_luong_tui),
        plasticWeight: formatCell(record.trong_luong_nhua),
        openingStock:
          record.ton_dau_ky === null || record.ton_dau_ky === undefined ? '-' : String(record.ton_dau_ky),
        inbound: formatCell(record.nhap_trong_ky),
        outbound: formatCell(record.xuat_trong_ky),
        stock: record.sl_ton === null || record.sl_ton === undefined ? '-' : String(record.sl_ton),
        minStock:
          record.so_luong_ton_toi_thieu === null || record.so_luong_ton_toi_thieu === undefined
            ? '-'
            : String(record.so_luong_ton_toi_thieu),
        origin: String(record.nguon_goc ?? '').trim() || '-',
        description: String(record.mo_ta ?? '').trim(),
        nplItems: parseProductNplItems(
          record.npl_phan_tram ??
          record.nplPhanTram ??
          record.nplItems ??
          record.thanh_phan ??
          record.dinh_muc
        )
      };
    })
    .filter((product): product is ProductRow => Boolean(product));
}

type ProductFormState = {
  code: string;
  newCode: string;
  amisCode: string;
  name: string;
  nature: string;
  group: string;
  unit: string;
  totalWeight: string;
  rollWidth: string;
  rollLength: string;
  coreWeight: string;
  bagWeight: string;
  plasticWeight: string;
  openingStock: string;
  inbound: string;
  outbound: string;
  stock: string;
  minStock: string;
  origin: string;
  description: string;
};

function productCellToInput(value: string) {
  return value === '-' ? '' : value;
}

function productToForm(product: ProductRow): ProductFormState {
  return {
    code: productCellToInput(product.code),
    newCode: productCellToInput(product.newCode),
    amisCode: productCellToInput(product.amisCode),
    name: productCellToInput(product.name),
    nature: productCellToInput(product.nature),
    group: productCellToInput(product.group),
    unit: productCellToInput(product.unit),
    totalWeight: productCellToInput(product.totalWeight),
    rollWidth: productCellToInput(product.rollWidth),
    rollLength: productCellToInput(product.rollLength),
    coreWeight: productCellToInput(product.coreWeight),
    bagWeight: productCellToInput(product.bagWeight),
    plasticWeight: productCellToInput(product.plasticWeight),
    openingStock: productCellToInput(product.openingStock),
    inbound: productCellToInput(product.inbound),
    outbound: productCellToInput(product.outbound),
    stock: productCellToInput(product.stock),
    minStock: productCellToInput(product.minStock),
    origin: productCellToInput(product.origin),
    description: productCellToInput(product.description)
  };
}

function emptyProductForm(): ProductFormState {
  return {
    code: '',
    newCode: '',
    amisCode: '',
    name: '',
    nature: '',
    group: '',
    unit: '',
    totalWeight: '',
    rollWidth: '',
    rollLength: '',
    coreWeight: '',
    bagWeight: '',
    plasticWeight: '',
    openingStock: '',
    inbound: '',
    outbound: '',
    stock: '',
    minStock: '',
    origin: '',
    description: ''
  };
}

function productFormToPayload(form: ProductFormState) {
  return {
    code: form.code.trim(),
    newCode: form.newCode.trim(),
    amisCode: form.amisCode.trim(),
    name: form.name.trim(),
    nature: form.nature.trim(),
    group: form.group.trim(),
    unit: form.unit.trim(),
    totalWeight: form.totalWeight.trim(),
    rollWidth: form.rollWidth.trim(),
    rollLength: form.rollLength.trim(),
    coreWeight: form.coreWeight.trim(),
    bagWeight: form.bagWeight.trim(),
    plasticWeight: form.plasticWeight.trim(),
    openingStock: form.openingStock.trim(),
    inbound: form.inbound.trim(),
    outbound: form.outbound.trim(),
    stock: form.stock.trim(),
    minStock: form.minStock.trim(),
    origin: form.origin.trim(),
    description: form.description.trim()
  };
}

function ProductEditModal({
  mode,
  product,
  isSaving,
  formError,
  onClose,
  onSave
}: {
  mode: 'add' | 'edit';
  product: ProductRow | null;
  isSaving: boolean;
  formError: string;
  onClose: () => void;
  onSave: (form: ProductFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductFormState>(() =>
    mode === 'edit' && product ? productToForm(product) : emptyProductForm()
  );

  useEffect(() => {
    setForm(mode === 'edit' && product ? productToForm(product) : emptyProductForm());
  }, [mode, product?.id]);

  const fields: Array<{ key: keyof ProductFormState; label: string; required?: boolean; span?: boolean }> = [
    { key: 'code', label: 'Mã SP', required: true },
    { key: 'amisCode', label: 'Mã AMIS' },
    { key: 'newCode', label: 'Mã mới' },
    { key: 'name', label: 'Tên sản phẩm', required: true },
    { key: 'nature', label: 'Tính chất' },
    { key: 'group', label: 'Nhóm VTHH' },
    { key: 'unit', label: 'Đơn vị tính' },
    { key: 'totalWeight', label: 'Tổng trọng lượng TP (kg)' },
    { key: 'rollWidth', label: 'Khổ cuộn (m)' },
    { key: 'rollLength', label: 'Chiều dài mét/cuộn (m)' },
    { key: 'coreWeight', label: 'Trọng lượng lõi (kg)' },
    { key: 'bagWeight', label: 'Trọng lượng túi (kg)' },
    { key: 'plasticWeight', label: 'Trọng lượng nhựa + phụ gia (kg)' },
    { key: 'openingStock', label: 'Tồn đầu' },
    { key: 'inbound', label: 'Nhập' },
    { key: 'outbound', label: 'Xuất' },
    { key: 'stock', label: 'Tồn kho' },
    { key: 'minStock', label: 'Tồn tối thiểu' },
    { key: 'origin', label: 'Nguồn gốc' },
    { key: 'description', label: 'Mô tả', span: true }
  ];

  const handleSave = async () => {
    await onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              {mode === 'add' ? 'Thêm sản phẩm mới' : 'Sửa sản phẩm'}
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              {mode === 'add' ? 'Ghi vào bảng san_pham trên Supabase' : product?.code || '-'}
            </p>
          </div>
          <BackButton onClick={onClose} />
        </div>
        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
            {formError}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {fields.map(field => (
            <label key={field.key} className={`block space-y-1.5 ${field.span ? 'sm:col-span-2' : ''}`}>
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                {field.label}{field.required ? ' *' : ''}
              </span>
              <input
                value={form[field.key]}
                onChange={event => setForm(prev => ({ ...prev, [field.key]: event.target.value }))}
                className={productFieldClass}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <BackButton onClick={onClose} className="h-10 rounded-lg bg-white" />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : mode === 'add' ? 'Thêm mới' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsPanel({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedNatures, setSelectedNatures] = useState<Set<string>>(() => new Set());
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  const [productActionMessage, setProductActionMessage] = useState('');
  const [viewingProduct, setViewingProduct] = useState<ProductRow | null>(null);
  const [productViewTab, setProductViewTab] = useState<ProductViewTab>('info');
  const [materialOptions, setMaterialOptions] = useState<MaterialOption[]>([]);
  const [isLoadingMaterialOptions, setIsLoadingMaterialOptions] = useState(false);
  const [isSavingProductNpl, setIsSavingProductNpl] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [productFormMode, setProductFormMode] = useState<'add' | 'edit' | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const bulkComponentsFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingBulkProductComponents, setIsImportingBulkProductComponents] = useState(false);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    setProductError('');

    try {
      const res = await fetch('/api/san-pham?format=table');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải sản phẩm từ Supabase.');
      }

      setProducts(normalizeProducts(data));
    } catch (error: any) {
      setProducts([]);
      setProductError(error.message || 'Không thể tải sản phẩm từ Supabase.');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (!viewingProduct) return;
    const fresh = products.find(product => product.id === viewingProduct.id);
    if (fresh) setViewingProduct(fresh);
  }, [products, viewingProduct?.id]);

  const loadMaterialOptions = async () => {
    setIsLoadingMaterialOptions(true);
    try {
      const res = await fetch('/api/kho-nvl');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải danh sách NPL.');
      }
      const materials = normalizeMaterialsInventory(data);
      const options = materials.map(material => ({
        code: material.code,
        name: material.name,
        unit: material.unit && material.unit !== '-' ? material.unit : ''
      }));
      setMaterialOptions(options);
      return options;
    } catch {
      setMaterialOptions([]);
      return [];
    } finally {
      setIsLoadingMaterialOptions(false);
    }
  };

  const openProductView = (product: ProductRow, tab: ProductViewTab = 'info') => {
    setProductActionMessage('');
    setProductError('');
    setProductFormError('');
    setEditingProduct(null);
    setProductFormMode(null);
    setViewingProduct(product);
    setProductViewTab(tab);
    if (materialOptions.length === 0) {
      loadMaterialOptions();
    }
  };

  const openProductCreate = () => {
    setProductActionMessage('');
    setProductError('');
    setProductFormError('');
    setViewingProduct(null);
    setEditingProduct(null);
    setProductFormMode('add');
  };

  const openProductEdit = (product: ProductRow) => {
    setProductActionMessage('');
    setProductError('');
    setProductFormError('');
    setViewingProduct(null);
    setEditingProduct(product);
    setProductFormMode('edit');
  };

  const closeProductForm = () => {
    setProductFormMode(null);
    setEditingProduct(null);
    setProductFormError('');
  };

  const handleCreateProduct = async (form: ProductFormState) => {
    if (!form.code.trim() && !form.name.trim()) {
      setProductFormError('Vui lòng nhập mã SP hoặc tên sản phẩm.');
      return;
    }

    setIsSavingProduct(true);
    setProductFormError('');

    try {
      const res = await fetch('/api/san-pham', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productFormToPayload(form))
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể thêm sản phẩm.');
      }

      closeProductForm();
      setProductActionMessage('Đã thêm sản phẩm mới.');
      await loadProducts();
    } catch (error: any) {
      setProductFormError(error.message || 'Không thể thêm sản phẩm.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleSaveProduct = async (form: ProductFormState) => {
    if (!editingProduct) return;
    if (!form.code.trim() && !form.name.trim()) {
      setProductFormError('Vui lòng nhập mã SP hoặc tên sản phẩm.');
      return;
    }

    setIsSavingProduct(true);
    setProductFormError('');

    try {
      const res = await fetch(`/api/san-pham/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productFormToPayload(form))
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể cập nhật sản phẩm.');
      }

      closeProductForm();
      setProductActionMessage('Đã cập nhật sản phẩm.');
      await loadProducts();
    } catch (error: any) {
      setProductFormError(error.message || 'Không thể cập nhật sản phẩm.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (product: ProductRow) => {
    if (!product.id) {
      setProductError('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product.code || product.name}"?`)) return;

    setDeletingProductId(product.id);
    setProductActionMessage('');

    try {
      const res = await fetch('/api/san-pham', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [product.id] })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa sản phẩm.');
      }

      if (viewingProduct?.id === product.id) setViewingProduct(null);
      if (editingProduct?.id === product.id) closeProductForm();
      setSelectedProductIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
      setProductActionMessage('Đã xóa sản phẩm.');
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể xóa sản phẩm.');
    } finally {
      setDeletingProductId(null);
    }
  };

  const saveProductNplItems = async (productId: string, items: ProductNplItem[]) => {
    setIsSavingProductNpl(true);
    setProductError('');

    try {
      const res = await fetch(`/api/san-pham/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npl_phan_tram: productNplItemsToJson(items) })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể lưu thành phần sản phẩm.');
      }

      setProductActionMessage('Đã cập nhật thành phần sản phẩm.');
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể lưu thành phần sản phẩm.');
      throw error;
    } finally {
      setIsSavingProductNpl(false);
    }
  };

  const handleDownloadBulkProductComponentsTemplate = () => {
    downloadBulkProductNplComponentsTemplate(
      products.flatMap(product =>
        product.nplItems.map(item => ({
          productCode: product.code,
          componentName: item.name,
          amountType: item.amountType,
          percent: item.percent,
          quantity: item.quantity,
          unit: item.unit
        }))
      )
    );
  };

  const handleImportBulkProductComponents = async (file?: File | null) => {
    if (!file) return;

    setIsImportingBulkProductComponents(true);
    setProductError('');
    setProductActionMessage('');

    try {
      const effectiveMaterialOptions =
        materialOptions.length > 0 ? materialOptions : await loadMaterialOptions();

      const rows = await parseBulkProductNplComponentsExcel(file);
      if (rows.length === 0) {
        throw new Error(
          'File Excel không có dòng hợp lệ. Cần có các cột Mã SP, Tên NVL, Loại, Giá trị và ĐVT nếu là Số lượng.'
        );
      }

      const productMap = bulkExcelRowsToProductMap(rows, effectiveMaterialOptions);
      const unknownMaterialNames = rows
        .filter(
          row =>
            !effectiveMaterialOptions.some(
              option => normalizeProductCodeKey(option.name) === normalizeProductCodeKey(row.componentName)
            )
        )
        .map(row => row.componentName);
      if (unknownMaterialNames.length > 0) {
        const sample = [...new Set(unknownMaterialNames)].slice(0, 5).join(', ');
        throw new Error(`Không tìm thấy NVL trong kho theo tên: ${sample}.`);
      }
      const updates = products
        .map(product => ({
          product,
          key: normalizeProductCodeKey(product.code || product.amisCode || product.newCode || ''),
          items: productMap.get(normalizeProductCodeKey(product.code || product.amisCode || product.newCode || '')) || []
        }))
        .filter(entry => entry.key && entry.items.length > 0);

      if (updates.length === 0) {
        throw new Error('Không tìm thấy sản phẩm nào trong file khớp với danh sách hiện tại.');
      }

      const missingProductCodes = [...productMap.keys()].filter(
        key =>
          !products.some(product =>
            [
              normalizeProductCodeKey(product.code),
              normalizeProductCodeKey(product.amisCode),
              normalizeProductCodeKey(product.newCode)
            ].includes(key)
          )
      );

      const confirmMessage = [
        `Cập nhật thành phần cho ${updates.length} sản phẩm từ Excel?`,
        missingProductCodes.length > 0 ? `Bỏ qua ${missingProductCodes.length} mã SP không khớp.` : null
      ]
        .filter(Boolean)
        .join('\n');

      if (!window.confirm(confirmMessage)) {
        return;
      }

      await Promise.all(
        updates.map(async entry => {
          const res = await fetch(`/api/san-pham/${entry.product.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ npl_phan_tram: productNplItemsToJson(entry.items) })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `Không thể cập nhật thành phần cho ${entry.product.code}.`);
          }
        })
      );

      const parts = [`Đã cập nhật thành phần cho ${updates.length} sản phẩm.`];
      if (missingProductCodes.length > 0) {
        parts.push(`Bỏ qua ${missingProductCodes.length} mã SP không khớp.`);
      }
      setProductActionMessage(parts.join(' '));
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể tải Excel thành phần sản phẩm.');
    } finally {
      setIsImportingBulkProductComponents(false);
      if (bulkComponentsFileInputRef.current) {
        bulkComponentsFileInputRef.current.value = '';
      }
    }
  };

  const productGroups = useMemo(
    () => ['all', ...Array.from(new Set(products.map(product => product.group))).sort((a, b) => a.localeCompare(b, 'vi'))],
    [products]
  );
  const productNatures = useMemo(
    () => Array.from(new Set(products.map(product => product.nature))).sort((a, b) => a.localeCompare(b, 'vi')),
    [products]
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesGroup = selectedGroup === 'all' || product.group === selectedGroup;
      const matchesNature = selectedNatures.size === 0 || selectedNatures.has(product.nature);
      const matchesSearch =
        !normalizedSearch ||
        `${product.code} ${product.newCode} ${product.name} ${product.nature} ${product.group} ${product.origin} ${formatProductNplSummary(product.nplItems)}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesGroup && matchesNature && matchesSearch;
    });
  }, [normalizedSearch, products, selectedGroup, selectedNatures]);

  const natureCount = new Set(products.map(product => product.nature)).size;
  const unitCount = new Set(products.map(product => product.unit).filter(Boolean)).size;
  const selectedProducts = useMemo(
    () => products.filter(product => selectedProductIds.has(product.id)),
    [products, selectedProductIds]
  );
  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(product => selectedProductIds.has(product.id));

  useEffect(() => {
    let cancelled = false;

    const generateQrImages = async () => {
      const nextEntries = await Promise.all(
        products
          .filter(product => product.code)
          .map(async product => {
            const url = await QRCode.toDataURL(product.code, {
              errorCorrectionLevel: 'H',
              margin: 1,
              width: 160,
              color: {
                dark: '#111111',
                light: '#ffffff'
              }
            });
            return [product.id, url] as const;
          })
      );

      if (!cancelled) {
        setQrImages(Object.fromEntries(nextEntries));
      }
    };

    if (products.length > 0) {
      generateQrImages();
    } else {
      setQrImages({});
    }

    return () => {
      cancelled = true;
    };
  }, [products]);

  const toggleProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleNature = (nature: string) => {
    setSelectedNatures(prev => {
      const next = new Set(prev);
      if (next.has(nature)) {
        next.delete(nature);
      } else {
        next.add(nature);
      }
      return next;
    });
  };

  const clearNatureFilters = () => {
    setSelectedNatures(new Set());
  };

  const toggleFilteredProducts = () => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredProducts.forEach(product => next.delete(product.id));
      } else {
        filteredProducts.forEach(product => next.add(product.id));
      }
      return next;
    });
  };

  const handlePrintSelectedQr = () => {
    if (selectedProducts.length === 0) return;
    window.print();
  };

  const handleBulkDeleteProducts = async () => {
    if (selectedProducts.length === 0) return;

    const label =
      selectedProducts.length === 1
        ? `"${selectedProducts[0].code || selectedProducts[0].name}"`
        : `${selectedProducts.length} sản phẩm`;

    if (!window.confirm(`Bạn có chắc muốn xóa ${label}? Hành động này không thể hoàn tác.`)) {
      return;
    }

    setIsDeletingProducts(true);
    setProductActionMessage('');
    setProductError('');

    try {
      const res = await fetch('/api/san-pham', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedProducts.map(product => product.id) })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa sản phẩm đã chọn.');
      }

      setSelectedProductIds(new Set());
      setProductActionMessage(`Đã xóa ${data.deleted ?? selectedProducts.length} sản phẩm.`);
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể xóa sản phẩm đã chọn.');
    } finally {
      setIsDeletingProducts(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Danh mục sản phẩm</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Sản phẩm</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase san_pham.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openProductCreate}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Sản phẩm', products.length],
              ['Nhóm VTHH', productGroups.length > 0 ? productGroups.length - 1 : 0],
              ['Đơn vị', unitCount || natureCount]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {productGroups.map(group => (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedGroup(group)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedGroup === group
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {group === 'all' ? 'Tất cả' : group}
            </button>
          ))}
          {isLoadingProducts && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã, tên, nhóm, nguồn gốc..."
            disabled={isLoadingProducts || products.length === 0}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {productError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {productError}
          </p>
        )}

        {productActionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {productActionMessage}
          </p>
        )}
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-zinc-950">Lọc theo tính chất</p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              {selectedNatures.size === 0
                ? 'Đang hiển thị tất cả tính chất.'
                : `Đã chọn ${selectedNatures.size} tính chất.`}
            </p>
          </div>

          {selectedNatures.size > 0 && (
            <button
              type="button"
              onClick={clearNatureFilters}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-600 transition hover:border-zinc-950"
            >
              Bỏ lọc tính chất
            </button>
          )}
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {productNatures.map(nature => {
            const checked = selectedNatures.has(nature);
            return (
              <label
                key={nature}
                className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-black transition ${
                  checked
                    ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleNature(nature)}
                  disabled={isLoadingProducts}
                  className="h-4 w-4 accent-[#ef1b2d]"
                />
                <span>{nature}</span>
              </label>
            );
          })}

          {!isLoadingProducts && productNatures.length === 0 && (
            <div className="flex h-10 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold text-zinc-500">
              Chưa có dữ liệu tính chất
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-950">Thao tác hàng loạt</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            Đã chọn {selectedProducts.length} dòng. Có thể nhập Excel thành phần cho nhiều sản phẩm, in QR hoặc xóa các sản phẩm đã tick.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            onClick={handleDownloadBulkProductComponentsTemplate}
            disabled={isLoadingProducts}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Tải mẫu Excel TP
          </button>
          <button
            type="button"
            onClick={() => bulkComponentsFileInputRef.current?.click()}
            disabled={isLoadingProducts || isImportingBulkProductComponents}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImportingBulkProductComponents ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isImportingBulkProductComponents ? 'Đang nhập...' : 'Tải Excel TP lên'}
          </button>
          <input
            ref={bulkComponentsFileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={event => handleImportBulkProductComponents(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={toggleFilteredProducts}
            disabled={filteredProducts.length === 0}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allFilteredSelected ? 'Bỏ chọn bộ lọc' : 'Chọn các dòng đang lọc'}
          </button>
          <button
            type="button"
            onClick={handleBulkDeleteProducts}
            disabled={selectedProducts.length === 0 || isDeletingProducts}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeletingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeletingProducts ? 'Đang xóa...' : 'Xóa đã chọn'}
          </button>
          <button
            type="button"
            onClick={handlePrintSelectedQr}
            disabled={selectedProducts.length === 0}
            className="h-11 rounded-xl bg-[#ef1b2d] px-5 text-xs font-black text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            In QR đã chọn
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[155px]" />
              <col className="w-[110px]" />
              <col className="w-[30%]" />
              <col className="w-[155px]" />
              <col className="w-[100px]" />
              <col className="w-[72px]" />
              <col className="w-[96px]" />
              <col className="w-[76px]" />
              <col className="w-[76px]" />
              <col className="w-[76px]" />
              <col className="w-[76px]" />
              <col className="w-[118px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-4 text-center font-black">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleFilteredProducts}
                    className="h-4 w-4 accent-[#ef1b2d]"
                    aria-label="Chọn tất cả sản phẩm đang lọc"
                  />
                </th>
                <th className="px-4 py-4 font-black">Mã SP</th>
                <th className="px-3 py-4 text-center font-black">Mã QR</th>
                <th className="px-4 py-4 font-black">Tên sản phẩm</th>
                <th className="px-4 py-4 font-black">Tính chất</th>
                <th className="px-4 py-4 text-center font-black">Nhóm</th>
                <th className="px-4 py-4 text-center font-black">Đơn vị</th>
                <th className="px-3 py-4 text-center font-black">Tổng TL (kg)</th>
                <th className="px-3 py-4 text-center font-black">Tồn đầu</th>
                <th className="px-3 py-4 text-center font-black">Nhập</th>
                <th className="px-3 py-4 text-center font-black">Xuất</th>
                <th className="px-3 py-4 text-center font-black">Tồn</th>
                <th className="px-3 py-4 text-center font-black">Tồn tối thiểu</th>
                <th className="px-3 py-4 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredProducts.map(product => (
                <tr key={`${product.code}-${product.name}`} className="align-middle transition hover:bg-red-50/40">
                  <td className="px-3 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="h-4 w-4 accent-[#ef1b2d]"
                      aria-label={`Chọn in QR ${product.code}`}
                    />
                  </td>
                  <td className="px-4 py-3.5 font-black text-zinc-950">{product.code || '-'}</td>
                  <td className="px-3 py-3.5">
                    {qrImages[product.id] ? (
                      <div className="relative mx-auto h-14 w-14 rounded-lg border border-zinc-200 bg-white p-1">
                        <img src={qrImages[product.id]} alt={`QR ${product.code}`} className="h-full w-full" />
                        <span className="absolute left-1/2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-white p-0.5 shadow-sm">
                          <img src={vietNhatLogoUrl} alt="Logo Viet Nhat" className="max-h-full max-w-full object-contain" />
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-300">Đang tạo</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-black text-zinc-950">{product.name || '-'}</div>
                    {product.description && (
                      <div className="mt-0.5 max-w-sm truncate text-xs font-semibold text-zinc-400">{product.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex max-w-full items-center rounded-full border border-[#ef1b2d]/20 bg-red-50 px-2.5 py-1 text-xs font-black leading-tight text-[#ef1b2d]">
                      {product.nature}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center font-bold text-zinc-700">{product.group}</td>
                  <td className="px-4 py-3.5 text-center font-bold text-zinc-700">{product.unit}</td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-emerald-800">
                    {formatProductSpecDisplay(product.totalWeight)}
                  </td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.openingStock}</td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.inbound}</td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.outbound}</td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.stock}</td>
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.minStock}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openProductView(product)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openProductEdit(product)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(product)}
                        disabled={deletingProductId === product.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingProductId === product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoadingProducts && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Không có sản phẩm phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {productFormMode && (
        <ProductEditModal
          mode={productFormMode}
          product={editingProduct}
          isSaving={isSavingProduct}
          formError={productFormError}
          onClose={closeProductForm}
          onSave={productFormMode === 'add' ? handleCreateProduct : handleSaveProduct}
        />
      )}

      {viewingProduct && (
        <ProductViewModal
          product={viewingProduct}
          initialTab={productViewTab}
          materialOptions={materialOptions}
          isLoadingMaterials={isLoadingMaterialOptions}
          isSaving={isSavingProductNpl}
          onClose={() => setViewingProduct(null)}
          onSaveItems={items => saveProductNplItems(viewingProduct.id, items)}
        />
      )}

      <div className="qr-print-sheet">
        <div className="qr-print-page">
          {selectedProducts.map(product => (
            <div key={`print-${product.id}`} className="qr-print-card">
              <div className="qr-print-code">
                {qrImages[product.id] && <img src={qrImages[product.id]} alt={`QR ${product.code}`} />}
                <span>
                  <img src={vietNhatLogoUrl} alt="Logo Viet Nhat" />
                </span>
              </div>
              <div className="qr-print-meta">
                <strong>{product.code || '-'}</strong>
                <p>{product.name || '-'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface MachineRow {
  id: string;
  code: string;
  name: string;
  type: string;
  branch: string;
  location: string;
  status: string;
  note: string;
  imageUrl?: string;
  imagePublicId?: string;
}

function pickText(record: Record<string, unknown>, keys: string[], fallback = '-') {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
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
    body: JSON.stringify({ imageDataUrl })
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Không thể upload ảnh.');
  }

  return {
    imageUrl: String(data.url ?? data.imageUrl ?? ''),
    imagePublicId: String(data.publicId ?? data.imagePublicId ?? '')
  };
}

function normalizeMachines(data: unknown): MachineRow[] {
  if (!data || typeof data !== 'object') return [];
  const machines = (data as { machines?: unknown }).machines;
  if (!Array.isArray(machines)) return [];

  return machines
    .map((item): MachineRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'id'], '');
      const name = pickText(record, ['ten_may', 'may', 'machine_name', 'name'], '');
      if (!code && !name) return null;

      return {
        id: pickText(record, ['id'], code || name),
        code,
        name,
        type: pickText(record, ['loai_may', 'nhom_may', 'type', 'category'], 'Chưa phân loại'),
        branch: pickText(record, ['chi_nhanh', 'co_so', 'branch'], '-'),
        location: pickText(record, ['vi_tri', 'khu_vuc', 'location', 'line'], '-'),
        status: pickText(record, ['trang_thai', 'status', 'tinh_trang'], 'Đang dùng'),
        note: pickText(record, ['ghi_chu', 'mo_ta', 'note', 'description'], ''),
        imageUrl: pickText(record, ['anh_url', 'hinh_anh_url', 'image_url', 'imageUrl'], ''),
        imagePublicId: pickText(record, ['anh_public_id', 'image_public_id', 'imagePublicId'], '')
      };
    })
    .filter((machine): machine is MachineRow => Boolean(machine));
}

function findMachineByRef(machines: MachineRow[], ref: string): MachineRow | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  return (
    machines.find(machine => machine.code === trimmed) ??
    machines.find(machine => machine.name === trimmed) ??
    machines.find(machine => `${machine.code} · ${machine.name}` === trimmed) ??
    null
  );
}

function machineSelectLabel(machine: MachineRow): string {
  const name = machine.name?.trim();
  if (name && name !== '-') return name;
  const code = machine.code?.trim();
  if (code && code !== '-') return code;
  return '';
}

function machineSelectValue(machine: MachineRow): string {
  return machineSelectLabel(machine);
}

function buildMachineSelectOptions(machines: MachineRow[], currentValue = ''): MachineRow[] {
  const normalized = resolveMachineDisplayValue(currentValue, machines) || currentValue.trim();
  if (!normalized) return machines;

  if (findMachineByRef(machines, normalized) || findMachineByRef(machines, currentValue)) {
    return machines;
  }

  return [
    {
      id: `custom-${normalized}`,
      code: normalized,
      name: normalized,
      type: '-',
      branch: '-',
      location: '-',
      status: '-',
      note: ''
    },
    ...machines
  ];
}

function renderMachineSelect(
  value: string,
  onChange: (machine: string) => void,
  machines: MachineRow[],
  options?: { disabled?: boolean; placeholder?: string; isLoading?: boolean }
) {
  const machineOptions = buildMachineSelectOptions(machines, value);
  const displayValue = resolveMachineDisplayValue(value, machines) || value;

  return (
    <SearchableSelect
      value={displayValue}
      onChange={onChange}
      options={machineOptions}
      placeholder={options?.placeholder ?? 'Gõ để tìm máy'}
      disabled={options?.disabled}
      isLoading={options?.isLoading}
      getLabel={item => machineSelectLabel(item as MachineRow)}
      getValue={item => machineSelectValue(item as MachineRow)}
      resolveSelectedItem={(opts, val) => findMachineByRef(opts as MachineRow[], val)}
    />
  );
}

type MachineFormState = {
  code: string;
  name: string;
  type: string;
  branch: string;
  location: string;
  status: string;
  note: string;
};

const emptyMachineForm = (): MachineFormState => ({
  code: '',
  name: '',
  type: '',
  branch: 'HCM',
  location: '',
  status: 'Đang dùng',
  note: ''
});

function machineCellToInput(value: string) {
  return value === '-' ? '' : value;
}

function machineToForm(machine: MachineRow): MachineFormState {
  return {
    code: machineCellToInput(machine.code),
    name: machineCellToInput(machine.name),
    type: machineCellToInput(machine.type === 'Chưa phân loại' ? '' : machine.type),
    branch: machineCellToInput(machine.branch),
    location: machineCellToInput(machine.location),
    status: machineCellToInput(machine.status) || 'Đang dùng',
    note: machineCellToInput(machine.note)
  };
}

const machineFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function MachinesPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [machineError, setMachineError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingMachineId, setDeletingMachineId] = useState<string | null>(null);
  const [isSavingMachine, setIsSavingMachine] = useState(false);
  const [uploadingMachineIds, setUploadingMachineIds] = useState<Set<string>>(() => new Set());
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [machineForm, setMachineForm] = useState<MachineFormState>(emptyMachineForm);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState('');
  const [isUploadingFormImage, setIsUploadingFormImage] = useState(false);

  const resetFormImage = () => {
    setFormImageFile(null);
    setFormImagePreview('');
  };

  const saveMachineImage = async (machineId: string, file: File) => {
    const uploaded = await uploadImage(await fileToDataUrl(file));
    const res = await fetch(`/api/danh-sach-may/${encodeURIComponent(machineId)}/image`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploaded)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Không thể lưu ảnh cho máy.');
    }

    return uploaded;
  };

  const loadMachines = async () => {
    setIsLoadingMachines(true);
    setMachineError('');

    try {
      const res = await fetch('/api/danh-sach-may');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải danh sách máy từ Supabase.');
      }

      setMachines(normalizeMachines(data));
    } catch (error: any) {
      setMachines([]);
      setMachineError(error.message || 'Không thể tải danh sách máy từ Supabase.');
    } finally {
      setIsLoadingMachines(false);
    }
  };

  useEffect(() => {
    loadMachines();
  }, []);

  const openAddForm = () => {
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setMachineForm(emptyMachineForm());
    resetFormImage();
    setFormMode('add');
  };

  const openEditForm = (machine: MachineRow) => {
    setFormError('');
    setActionMessage('');
    setEditingId(machine.id);
    setMachineForm(machineToForm(machine));
    setFormImageFile(null);
    setFormImagePreview(machine.imageUrl || '');
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
    resetFormImage();
  };

  const handleFormImageChange = (file?: File | null) => {
    if (!file) return;
    setFormImageFile(file);
    setFormImagePreview(URL.createObjectURL(file));
  };

  const handleSaveMachine = async () => {
    if (!machineForm.code.trim() || !machineForm.name.trim()) {
      setFormError('Vui lòng nhập mã máy và tên máy.');
      return;
    }

    setIsSavingMachine(true);
    setFormError('');

    try {
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/danh-sach-may/${editingId}` : '/api/danh-sach-may', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(machineForm)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật máy.' : 'Không thể thêm máy mới.'));
      }

      const savedId = isEdit
        ? String(editingId)
        : String((data.machine as { id?: string | number } | undefined)?.id ?? '');

      if (formImageFile && savedId) {
        setIsUploadingFormImage(true);
        try {
          await saveMachineImage(savedId, formImageFile);
        } catch (error: any) {
          closeForm();
          setMachineError(error.message || 'Đã lưu máy nhưng không thể tải ảnh.');
          await loadMachines();
          return;
        } finally {
          setIsUploadingFormImage(false);
        }
      }

      closeForm();
      setActionMessage(
        formImageFile
          ? isEdit
            ? 'Đã cập nhật máy và tải ảnh.'
            : 'Đã thêm máy mới và tải ảnh.'
          : isEdit
            ? 'Đã cập nhật máy.'
            : 'Đã thêm máy mới.'
      );
      await loadMachines();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu máy.');
    } finally {
      setIsSavingMachine(false);
    }
  };

  const handleDeleteMachine = async (machine: MachineRow) => {
    if (!machine.id) {
      setMachineError('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa máy "${machine.code || machine.name}"?`)) return;

    setDeletingMachineId(machine.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/danh-sach-may/${machine.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa máy.');
      }

      setActionMessage('Đã xóa máy.');
      await loadMachines();
    } catch (error: any) {
      setMachineError(error.message || 'Không thể xóa máy.');
    } finally {
      setDeletingMachineId(null);
    }
  };

  const handleMachineImageUpload = async (machine: MachineRow, file?: File | null) => {
    if (!file) return;

    setMachineError('');
    setUploadingMachineIds(prev => {
      const next = new Set(prev);
      next.add(machine.id);
      return next;
    });

    try {
      const uploaded = await saveMachineImage(machine.id, file);

      setMachines(prev =>
        prev.map(item =>
          item.id === machine.id
            ? {
                ...item,
                imageUrl: uploaded.imageUrl,
                imagePublicId: uploaded.imagePublicId
              }
            : item
        )
      );
      setActionMessage(`Đã tải ảnh cho máy ${machine.code || machine.name}.`);
    } catch (error: any) {
      setMachineError(error.message || 'Không thể upload ảnh cho máy.');
    } finally {
      setUploadingMachineIds(prev => {
        const next = new Set(prev);
        next.delete(machine.id);
        return next;
      });
    }
  };

  const machineTypes = useMemo(
    () => ['all', ...Array.from(new Set(machines.map(machine => machine.type))).sort((a, b) => a.localeCompare(b, 'vi'))],
    [machines]
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMachines = useMemo(() => {
    return machines.filter(machine => {
      const matchesType = selectedType === 'all' || machine.type === selectedType;
      const matchesSearch =
        !normalizedSearch ||
        `${machine.code} ${machine.name} ${machine.type} ${machine.branch} ${machine.location} ${machine.status}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [machines, normalizedSearch, selectedType]);

  const branchCount = new Set(machines.map(machine => machine.branch).filter(branch => branch && branch !== '-')).size;
  const activeCount = machines.filter(machine => /đang|hoạt|active|dung|dùng/i.test(machine.status)).length;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Thiết bị sản xuất</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Danh sách máy</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase danh_sach_may.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openAddForm}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Máy', machines.length],
              ['Đang dùng', activeCount],
              ['Chi nhánh', branchCount]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa máy' : 'Thêm máy mới'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng danh_sach_may trên Supabase</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã máy *</span>
                <input
                  value={machineForm.code}
                  onChange={e => setMachineForm(prev => ({ ...prev, code: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: MAY-01"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên máy *</span>
                <input
                  value={machineForm.name}
                  onChange={e => setMachineForm(prev => ({ ...prev, name: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Máy đùn PE 01"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại/Nhóm</span>
                <input
                  value={machineForm.type}
                  onChange={e => setMachineForm(prev => ({ ...prev, type: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Đùn PE"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chi nhánh</span>
                <input
                  value={machineForm.branch}
                  onChange={e => setMachineForm(prev => ({ ...prev, branch: e.target.value }))}
                  className={machineFieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Vị trí</span>
                <input
                  value={machineForm.location}
                  onChange={e => setMachineForm(prev => ({ ...prev, location: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Khu A"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
                <SearchableSelect
                  value={machineForm.status}
                  onChange={status => setMachineForm(prev => ({ ...prev, status }))}
                  options={['Đang dùng', 'Bảo trì', 'Ngừng']}
                  placeholder="Gõ để tìm trạng thái"
                  inputClassName={machineFieldClass}
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              </label>
              <label className="col-span-2 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input
                  value={machineForm.note}
                  onChange={e => setMachineForm(prev => ({ ...prev, note: e.target.value }))}
                  className={machineFieldClass}
                />
              </label>

              <div className="col-span-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Hình ảnh máy</p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Chọn ảnh để upload lên Cloudinary và lưu vào cột anh_url trên Supabase.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {formImagePreview ? (
                    <a
                      href={formImagePreview}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-24 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white"
                    >
                      <img
                        src={formImagePreview}
                        alt="Xem trước ảnh máy"
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Chưa chọn ảnh
                    </div>
                  )}

                  <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]">
                    <ImagePlus className="h-4 w-4" />
                    {formImageFile ? 'Đổi ảnh' : formImagePreview ? 'Chọn ảnh khác' : 'Chọn ảnh'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        handleFormImageChange(file);
                      }}
                    />
                  </label>

                  {formImageFile && (
                    <p className="text-xs font-semibold text-zinc-600">{formImageFile.name}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {formError && (
                <p className="mr-auto text-xs font-bold text-rose-600">{formError}</p>
              )}
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveMachine}
                disabled={isSavingMachine || isUploadingFormImage}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMachine || isUploadingFormImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingMachine || isUploadingFormImage
                  ? isUploadingFormImage
                    ? 'Đang tải ảnh...'
                    : 'Đang lưu...'
                  : formMode === 'edit'
                    ? 'Cập nhật'
                    : 'Lưu máy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {machineTypes.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedType === type
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {type === 'all' ? 'Tất cả' : type}
            </button>
          ))}
          {isLoadingMachines && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã máy, tên máy, vị trí..."
            disabled={isLoadingMachines}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {machineError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {machineError}
          </p>
        )}

        {actionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {actionMessage}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-3 font-black">Mã máy</th>
                <th className="px-4 py-3 font-black">Tên máy</th>
                <th className="px-4 py-3 font-black">Hình ảnh</th>
                <th className="px-4 py-3 font-black">Loại/Nhóm</th>
                <th className="px-4 py-3 font-black">Chi nhánh</th>
                <th className="px-4 py-3 font-black">Vị trí</th>
                <th className="px-4 py-3 font-black">Trạng thái</th>
                <th className="px-4 py-3 font-black">Ghi chú</th>
                <th className="px-4 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredMachines.map(machine => (
                <tr key={machine.id} className="transition hover:bg-red-50/40">
                  <td className="px-4 py-3 font-black text-zinc-950">{machine.code || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-black text-zinc-950">
                      <Cpu className="h-4 w-4 text-[#ef1b2d]" />
                      {machine.name || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[220px] flex-col gap-2">
                      <div className="flex items-center gap-3">
                        {machine.imageUrl ? (
                          <a
                            href={machine.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                          >
                            <img src={machine.imageUrl} alt={`Ảnh ${machine.name || machine.code}`} className="h-full w-full object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Chưa có
                          </div>
                        )}

                        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]">
                          {uploadingMachineIds.has(machine.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ImagePlus className="h-4 w-4" />
                          )}
                          {uploadingMachineIds.has(machine.id) ? 'Đang tải' : machine.imageUrl ? 'Đổi ảnh' : 'Tải ảnh'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingMachineIds.has(machine.id)}
                            onChange={event => {
                              const file = event.target.files?.[0];
                              event.target.value = '';
                              handleMachineImageUpload(machine, file);
                            }}
                          />
                        </label>
                      </div>
                      <p className="text-[10px] font-semibold text-zinc-400">JPG, PNG · lưu Cloudinary</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-700">{machine.type}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{machine.branch}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{machine.location}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-[#ef1b2d]/20 bg-red-50 px-2.5 py-1 text-xs font-black text-[#ef1b2d]">
                      {machine.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-500">{machine.note || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditForm(machine)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMachine(machine)}
                        disabled={deletingMachineId === machine.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingMachineId === machine.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoadingMachines && filteredMachines.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Bảng danh_sach_may chưa có dữ liệu hoặc không có máy phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

interface MaterialRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  totalWeight: string;
  plasticWeight: string;
  bagWeight: string;
  coreWeight: string;
  rollWidth: string;
  unitLength: string;
  openingStock: string;
  inbound: string;
  outbound: string;
}

function formatCell(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);
}

function parseInventoryNumber(value: string): number | null {
  if (!value || value === '-') return null;
  const normalized = String(value).trim().replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function isMaterialKgUnit(unit: string) {
  const normalized = unit.trim().toLowerCase();
  return normalized === 'kg';
}

function computeClosingStock(opening: string, inbound: string, outbound: string): string {
  const openingVal = parseInventoryNumber(opening);
  if (openingVal === null) return '-';
  const inboundVal = parseInventoryNumber(inbound) ?? 0;
  const outboundVal = parseInventoryNumber(outbound) ?? 0;
  return String(Math.round((openingVal + inboundVal - outboundVal) * 100) / 100);
}

function normalizeMaterialsInventory(data: unknown): MaterialRow[] {
  if (!data || typeof data !== 'object') return [];
  const materials = (data as { materials?: unknown }).materials;
  if (!Array.isArray(materials)) return [];

  return materials
    .map((item): MaterialRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_npl ?? '').trim();
      const name = String(record.ten_npl ?? '').trim();
      if (!code && !name) return null;

      const rawId = String(record.id ?? '').trim();
      return {
        id: rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)
          ? rawId
          : code || rawId || name,
        code,
        name,
        unit: formatCell(record.don_vi),
        totalWeight: formatCell(record.tong_trong_luong),
        plasticWeight: formatCell(record.trong_luong_nhua),
        bagWeight: formatCell(record.trong_luong_tui),
        coreWeight: formatCell(record.trong_luong_loi),
        rollWidth: formatCell(record.kho_cuon),
        unitLength: formatCell(record.chieu_dai_don_vi),
        openingStock: formatCell(record.ton_dau_ky),
        inbound: formatCell(record.nhap_trong_ky),
        outbound: formatCell(record.xuat_trong_ky)
      };
    })
    .filter((material): material is MaterialRow => Boolean(material));
}

type MaterialFormState = {
  code: string;
  name: string;
  unit: string;
  totalWeight: string;
  plasticWeight: string;
  bagWeight: string;
  coreWeight: string;
  rollWidth: string;
  unitLength: string;
  openingStock: string;
  inbound: string;
  outbound: string;
};

const emptyMaterialForm = (): MaterialFormState => ({
  code: '',
  name: '',
  unit: '',
  totalWeight: '',
  plasticWeight: '',
  bagWeight: '',
  coreWeight: '',
  rollWidth: '',
  unitLength: '',
  openingStock: '',
  inbound: '',
  outbound: ''
});

function materialCellToInput(value: string) {
  return value === '-' ? '' : value;
}

function materialToForm(material: MaterialRow): MaterialFormState {
  return {
    code: materialCellToInput(material.code),
    name: materialCellToInput(material.name),
    unit: materialCellToInput(material.unit),
    totalWeight: materialCellToInput(material.totalWeight),
    plasticWeight: materialCellToInput(material.plasticWeight),
    bagWeight: materialCellToInput(material.bagWeight),
    coreWeight: materialCellToInput(material.coreWeight),
    rollWidth: materialCellToInput(material.rollWidth),
    unitLength: materialCellToInput(material.unitLength),
    openingStock: materialCellToInput(material.openingStock),
    inbound: materialCellToInput(material.inbound),
    outbound: materialCellToInput(material.outbound)
  };
}

async function patchMaterialsTotalWeight(materials: MaterialRow[], totalWeight: string) {
  await Promise.all(
    materials.map(async material => {
      const payload = {
        ...materialToForm(material),
        totalWeight
      };
      const res = await fetch(`/api/kho-nvl/${encodeURIComponent(material.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Không thể cập nhật ${material.code}.`);
      }
    })
  );
  return materials.length;
}

function isFetchNetworkError(error: unknown) {
  if (error instanceof TypeError) return true;
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return message.includes('failed to fetch') || message.includes('networkerror');
}

const materialFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

type BulkOpeningStockPreviewRow = BulkOpeningStockImportRow & {
  material: MaterialRow | null;
  status: 'update' | 'create' | 'invalid' | 'skipped';
};

function normalizeMaterialCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

function buildBulkOpeningStockPreview(
  rows: BulkOpeningStockImportRow[],
  materials: MaterialRow[]
): BulkOpeningStockPreviewRow[] {
  const materialByCode = new Map<string, MaterialRow>();
  materials.forEach(material => {
    if (material.code && material.code !== '-') {
      materialByCode.set(normalizeMaterialCodeKey(material.code), material);
    }
  });

  return rows.map(row => {
    const openingValue = row.openingStock.trim().replace(',', '.');
    const hasOpeningValue = openingValue !== '' && openingValue !== '-';
    const isValidNumber = hasOpeningValue && Number.isFinite(Number(openingValue));
    const material = materialByCode.get(normalizeMaterialCodeKey(row.code)) ?? null;

    if (!hasOpeningValue) {
      return { ...row, material, status: 'skipped' as const };
    }

    return {
      ...row,
      material,
      status: !isValidNumber ? 'invalid' : material ? 'update' : 'create'
    };
  });
}

function buildBulkOpeningStockPayload(
  row: BulkOpeningStockPreviewRow,
  material?: MaterialRow | null
) {
  const openingStock = row.openingStock.trim().replace(',', '.');
  const code = row.code.trim();
  const name = (row.name || material?.name || code).trim();

  if (material) {
    return {
      ...materialToForm(material),
      code,
      name: name || material.name.trim(),
      unit: material.unit === '-' ? '' : material.unit.trim(),
      openingStock
    };
  }

  return {
    ...emptyMaterialForm(),
    code,
    name: name || code,
    openingStock
  };
}

function BulkOpeningStockModal({
  open,
  materials,
  onClose,
  onApplied
}: {
  open: boolean;
  materials: MaterialRow[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const [importRows, setImportRows] = useState<BulkOpeningStockImportRow[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setImportRows([]);
      setUploadedFileName('');
      setPasteError('');
      setIsApplying(false);
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const previewRows = useMemo(
    () => (importRows.length > 0 ? buildBulkOpeningStockPreview(importRows, materials) : []),
    [importRows, materials]
  );
  const updateRows = previewRows.filter(row => row.status === 'update');
  const createRows = previewRows.filter(row => row.status === 'create');
  const applicableCount = updateRows.length + createRows.length;
  const invalidCount = previewRows.filter(row => row.status === 'invalid').length;
  const skippedCount = previewRows.filter(row => row.status === 'skipped').length;

  const handleDownloadTemplate = () => {
    downloadBulkOpeningStockTemplate(
      materials.map(material => ({
        code: material.code,
        name: material.name,
        openingStock: material.openingStock
      }))
    );
  };

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;

    setIsReadingFile(true);
    setPasteError('');
    setUploadedFileName(file.name);

    try {
      const rows = await parseBulkOpeningStockExcel(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dòng dữ liệu hợp lệ.');
      }
      setImportRows(rows);
    } catch (error: any) {
      setImportRows([]);
      setPasteError(error.message || 'Không thể đọc file Excel.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleApply = async () => {
    if (applicableCount === 0) {
      setPasteError('Không có dòng hợp lệ để xử lý. Kiểm tra lại cột Mã NPL và Tồn đầu trong file Excel.');
      return;
    }

    if (
      !window.confirm(
        `Ghi đè Tồn đầu cho ${updateRows.length} NPL và thêm mới ${createRows.length} NPL?`
      )
    ) {
      return;
    }

    setIsApplying(true);
    setPasteError('');

    try {
      const updatedCodes: string[] = [];
      const createdCodes: string[] = [];

      await Promise.all([
        ...updateRows.map(async row => {
          const material = row.material!;
          const payload = buildBulkOpeningStockPayload(row, material);
          const res = await fetch(`/api/kho-nvl/${material.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `Không thể cập nhật ${material.code}.`);
          }
          updatedCodes.push(material.code);
        }),
        ...createRows.map(async row => {
          const payload = buildBulkOpeningStockPayload(row);
          const res = await fetch('/api/kho-nvl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `Không thể thêm mới ${row.code}.`);
          }
          createdCodes.push(row.code);
        })
      ]);

      const parts: string[] = [];
      if (updatedCodes.length > 0) parts.push(`ghi đè ${updatedCodes.length} NPL`);
      if (createdCodes.length > 0) parts.push(`thêm mới ${createdCodes.length} NPL`);
      onApplied(`Đã ${parts.join(', ')}.`);
      onClose();
    } catch (error: any) {
      setPasteError(error.message || 'Không thể cập nhật tồn đầu hàng loạt.');
    } finally {
      setIsApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Cập nhật Tồn đầu từ Excel</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Mã đã có sẽ ghi đè Tồn đầu; mã chưa có sẽ tự thêm dòng NPL mới
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {pasteError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
              {pasteError}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Download className="h-4 w-4" />
              Tải mẫu Excel
            </button>
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100">
              {isReadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isReadingFile ? 'Đang đọc file...' : 'Tải file Excel lên'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  void handleFileChange(file);
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-600">
            <p className="font-bold text-zinc-800">Hướng dẫn</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>Bấm <strong>Tải mẫu Excel</strong> — file có sẵn Mã NPL, Tên NVL và Tồn đầu hiện tại.</li>
              <li>Sửa cột <strong>Tồn đầu</strong> hoặc thêm dòng mới (Mã NPL + Tên NVL + Tồn đầu).</li>
              <li>Bấm <strong>Tải file Excel lên</strong> — mã cũ ghi đè, mã mới tự thêm.</li>
            </ol>
          </div>

          {uploadedFileName && (
            <p className="text-xs font-bold text-zinc-500">
              File: <span className="text-zinc-800">{uploadedFileName}</span>
            </p>
          )}

          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-800">
                  Ghi đè: {updateRows.length}
                </span>
                <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-sky-800">
                  Thêm mới: {createRows.length}
                </span>
                {skippedCount > 0 && (
                  <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-zinc-700">
                    Bỏ qua (trống): {skippedCount}
                  </span>
                )}
                {invalidCount > 0 && (
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700">
                    Tồn đầu không hợp lệ: {invalidCount}
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-3 py-2 font-black">Mã NPL</th>
                      <th className="px-3 py-2 font-black">Tên NVL</th>
                      <th className="px-3 py-2 font-black">Tồn đầu mới</th>
                      <th className="px-3 py-2 font-black">Tồn đầu hiện tại</th>
                      <th className="px-3 py-2 font-black">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {previewRows.map((row, index) => (
                      <tr
                        key={`${row.code}-${index}`}
                        className={
                          row.status === 'update'
                            ? 'bg-white'
                            : row.status === 'create'
                              ? 'bg-sky-50/60'
                              : row.status === 'skipped'
                                ? 'bg-zinc-50'
                                : 'bg-rose-50/60'
                        }
                      >
                        <td className="px-3 py-2 font-black text-zinc-900">{row.code}</td>
                        <td className="px-3 py-2 font-semibold text-zinc-700">
                          {row.name || row.material?.name || '-'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-800">{row.openingStock}</td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-500">
                          {row.material?.openingStock ?? '-'}
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {row.status === 'update' && <span className="text-emerald-700">Ghi đè</span>}
                          {row.status === 'create' && <span className="text-sky-700">Thêm mới</span>}
                          {row.status === 'skipped' && <span className="text-zinc-500">Bỏ qua</span>}
                          {row.status === 'invalid' && <span className="text-rose-700">Số không hợp lệ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || applicableCount === 0}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isApplying ? 'Đang xử lý...' : `Áp dụng ${applicableCount} dòng`}
          </button>
        </div>
      </div>
    </div>
  );
}

type BulkMaterialTotalWeightPreviewRow = BulkMaterialTotalWeightImportRow & {
  material: MaterialRow | null;
  status: 'update' | 'not_found' | 'invalid' | 'skipped';
};

function buildBulkMaterialTotalWeightPreview(
  rows: BulkMaterialTotalWeightImportRow[],
  materials: MaterialRow[]
): BulkMaterialTotalWeightPreviewRow[] {
  const materialByCode = new Map<string, MaterialRow>();
  materials.forEach(material => {
    if (material.code && material.code !== '-') {
      materialByCode.set(normalizeMaterialCodeKey(material.code), material);
    }
  });

  return rows.map(row => {
    const weightValue = row.totalWeight.trim().replace(',', '.');
    const hasWeightValue = weightValue !== '' && weightValue !== '-';
    const isValidNumber = hasWeightValue && Number.isFinite(Number(weightValue));
    const material = materialByCode.get(normalizeMaterialCodeKey(row.code)) ?? null;

    if (!hasWeightValue) {
      return { ...row, material, status: 'skipped' as const };
    }

    if (!isValidNumber) {
      return { ...row, material, status: 'invalid' as const };
    }

    if (!material) {
      return { ...row, material, status: 'not_found' as const };
    }

    return { ...row, material, status: 'update' as const };
  });
}

function BulkMaterialTotalWeightModal({
  open,
  materials,
  onClose,
  onApplied
}: {
  open: boolean;
  materials: MaterialRow[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const [importRows, setImportRows] = useState<BulkMaterialTotalWeightImportRow[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setImportRows([]);
      setUploadedFileName('');
      setPasteError('');
      setIsApplying(false);
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const previewRows = useMemo(
    () => (importRows.length > 0 ? buildBulkMaterialTotalWeightPreview(importRows, materials) : []),
    [importRows, materials]
  );
  const updateRows = previewRows.filter(row => row.status === 'update');
  const applicableCount = updateRows.length;
  const invalidCount = previewRows.filter(row => row.status === 'invalid').length;
  const notFoundCount = previewRows.filter(row => row.status === 'not_found').length;
  const skippedCount = previewRows.filter(row => row.status === 'skipped').length;

  const handleDownloadTemplate = () => {
    downloadBulkMaterialTotalWeightTemplate(
      materials.map(material => ({
        code: material.code,
        totalWeight: material.totalWeight
      }))
    );
  };

  const handleFileChange = async (file?: File | null) => {
    if (!file) return;

    setIsReadingFile(true);
    setPasteError('');
    setUploadedFileName(file.name);

    try {
      const rows = await parseBulkMaterialTotalWeightExcel(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dòng dữ liệu hợp lệ.');
      }
      setImportRows(rows);
    } catch (error: any) {
      setImportRows([]);
      setPasteError(error.message || 'Không thể đọc file Excel.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleApply = async () => {
    if (applicableCount === 0) {
      setPasteError('Không có dòng hợp lệ để xử lý. Kiểm tra lại cột Mã NVL và Tổng trọng lượng trong file Excel.');
      return;
    }

    if (!window.confirm(`Cập nhật Tổng trọng lượng cho ${updateRows.length} NPL?`)) {
      return;
    }

    setIsApplying(true);
    setPasteError('');

    try {
      const updatedCodes: string[] = [];

      await Promise.all(
        updateRows.map(async row => {
          const material = row.material!;
          const payload = {
            ...materialToForm(material),
            totalWeight: row.totalWeight.trim().replace(',', '.')
          };
          const res = await fetch(`/api/kho-nvl/${material.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `Không thể cập nhật ${material.code}.`);
          }
          updatedCodes.push(material.code);
        })
      );

      onApplied(`Đã cập nhật Tổng trọng lượng cho ${updatedCodes.length} NPL.`);
      onClose();
    } catch (error: any) {
      setPasteError(error.message || 'Không thể cập nhật Tổng trọng lượng hàng loạt.');
    } finally {
      setIsApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              Cập nhật Tổng trọng lượng từ Excel
            </h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Khớp theo Mã NVL / Mã NPL và ghi vào cột Tổng kg
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {pasteError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
              {pasteError}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Download className="h-4 w-4" />
              Tải mẫu Excel
            </button>
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100">
              {isReadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isReadingFile ? 'Đang đọc file...' : 'Tải file Excel lên'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  void handleFileChange(file);
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-5 text-zinc-600">
            <p className="font-bold text-zinc-800">Hướng dẫn</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>
                Bấm <strong>Tải mẫu Excel</strong> — file có 2 cột: <strong>Mã NVL</strong> và{' '}
                <strong>Tổng trọng lượng</strong>.
              </li>
              <li>Sửa cột <strong>Tổng trọng lượng</strong> theo từng mã NPL.</li>
              <li>
                Bấm <strong>Tải file Excel lên</strong> — hệ thống khớp Mã NVL và cập nhật cột Tổng kg.
              </li>
            </ol>
          </div>

          {uploadedFileName && (
            <p className="text-xs font-bold text-zinc-500">
              File: <span className="text-zinc-800">{uploadedFileName}</span>
            </p>
          )}

          {previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-800">
                  Cập nhật: {updateRows.length}
                </span>
                {notFoundCount > 0 && (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-800">
                    Không tìm thấy mã: {notFoundCount}
                  </span>
                )}
                {skippedCount > 0 && (
                  <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-zinc-700">
                    Bỏ qua (trống): {skippedCount}
                  </span>
                )}
                {invalidCount > 0 && (
                  <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700">
                    Số không hợp lệ: {invalidCount}
                  </span>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-3 py-2 font-black">Mã NVL</th>
                      <th className="px-3 py-2 font-black">Tổng trọng lượng mới</th>
                      <th className="px-3 py-2 font-black">Tổng kg hiện tại</th>
                      <th className="px-3 py-2 font-black">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {previewRows.map((row, index) => (
                      <tr
                        key={`${row.code}-${index}`}
                        className={
                          row.status === 'update'
                            ? 'bg-white'
                            : row.status === 'not_found'
                              ? 'bg-amber-50/60'
                              : row.status === 'skipped'
                                ? 'bg-zinc-50'
                                : 'bg-rose-50/60'
                        }
                      >
                        <td className="px-3 py-2 font-black text-zinc-900">{row.code}</td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-800">{row.totalWeight}</td>
                        <td className="px-3 py-2 font-mono font-bold text-zinc-500">
                          {row.material?.totalWeight ?? '-'}
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {row.status === 'update' && <span className="text-emerald-700">Cập nhật</span>}
                          {row.status === 'not_found' && <span className="text-amber-700">Không tìm thấy</span>}
                          {row.status === 'skipped' && <span className="text-zinc-500">Bỏ qua</span>}
                          {row.status === 'invalid' && <span className="text-rose-700">Số không hợp lệ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={isApplying || applicableCount === 0}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isApplying ? 'Đang xử lý...' : `Áp dụng ${applicableCount} dòng`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MaterialMovementRow {
  slipCode: string;
  slipType: 'nhap' | 'xuat';
  slipDate: string;
  quantity: number;
}

function parseMaterialMovements(data: unknown): MaterialMovementRow[] {
  const list =
    data && typeof data === 'object' && Array.isArray((data as { movements?: unknown }).movements)
      ? (data as { movements: unknown[] }).movements
      : [];

  return list
    .map((entry): MaterialMovementRow | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const slipTypeRaw = String(record.loai_phieu ?? record.slipType ?? '').trim().toLowerCase();
      const quantity = Number(record.so_luong ?? record.quantity);
      return {
        slipCode: String(record.ma_phieu ?? record.slipCode ?? '').trim(),
        slipType: slipTypeRaw === 'xuat' ? 'xuat' : 'nhap',
        slipDate: String(record.ngay_phieu ?? record.slipDate ?? '').trim(),
        quantity: Number.isFinite(quantity) ? quantity : 0
      };
    })
    .filter((row): row is MaterialMovementRow => Boolean(row.slipCode || row.quantity));
}

function sumMaterialMovementQuantity(rows: MaterialMovementRow[], slipType: 'nhap' | 'xuat') {
  return rows
    .filter(row => row.slipType === slipType)
    .reduce((sum, row) => sum + row.quantity, 0);
}

type MaterialViewTab = 'info' | 'nvl-info' | 'history';

function MaterialViewModal({
  material,
  onClose,
  onEdit,
  onDelete,
  isDeleting
}: {
  material: MaterialRow;
  onClose: () => void;
  onEdit: (material: MaterialRow) => void;
  onDelete: (material: MaterialRow) => void;
  isDeleting: boolean;
}) {
  const [tab, setTab] = useState<MaterialViewTab>('info');
  const [movements, setMovements] = useState<MaterialMovementRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (tab !== 'history' || !material.code) return;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setHistoryError('');
      try {
        const params = new URLSearchParams();
        params.set('loai_kho', 'nvl');
        params.set('ma_npl', material.code);
        const res = await fetch(`/api/phieu-xuat-nhap-kho?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải lịch sử xuất nhập.');
        setMovements(parseMaterialMovements(data));
      } catch (error: any) {
        setMovements([]);
        setHistoryError(error.message || 'Không thể tải lịch sử xuất nhập.');
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [tab, material.code]);

  const inboundRows = useMemo(() => movements.filter(row => row.slipType === 'nhap'), [movements]);
  const outboundRows = useMemo(() => movements.filter(row => row.slipType === 'xuat'), [movements]);
  const totalInbound = sumMaterialMovementQuantity(movements, 'nhap');
  const totalOutbound = sumMaterialMovementQuantity(movements, 'xuat');
  const inboundDisplay = tab === 'history' ? String(Math.round(totalInbound * 100) / 100) : material.inbound;
  const outboundDisplay = tab === 'history' ? String(Math.round(totalOutbound * 100) / 100) : material.outbound;
  const closingDisplay = computeClosingStock(material.openingStock, inboundDisplay, outboundDisplay);

  const infoRows: Array<[string, string]> = [
    ['Mã NPL', material.code],
    ['Tên NVL', material.name],
    ['Đơn vị', material.unit],
    ['Tồn đầu', material.openingStock],
    ['Nhập', inboundDisplay],
    ['Xuất', outboundDisplay],
    ['Tồn cuối', closingDisplay]
  ];

  const nvlInfoRows: Array<[string, string]> = [
    ['Tổng kg', material.totalWeight],
    ['Kg nhựa', material.plasticWeight],
    ['Kg túi', material.bagWeight],
    ['Kg lõi', material.coreWeight],
    ['Khổ cuộn', material.rollWidth],
    ['Dài ĐV', material.unitLength]
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl ${
          tab === 'history' ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-red-500">Xem NVL</p>
            <h3 className="mt-1 text-lg font-black text-zinc-950">{material.name || material.code}</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{material.code}</p>
          </div>
          <BackButton onClick={onClose} />
        </div>

        <div className="flex gap-1 border-b border-zinc-200 px-4">
          <button
            type="button"
            onClick={() => setTab('info')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'info' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Package className="h-4 w-4" />
            Thông tin
          </button>
          <button
            type="button"
            onClick={() => setTab('nvl-info')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'nvl-info' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            Thông tin NVL
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'history' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <History className="h-4 w-4" />
            Lịch sử X/N
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'history' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Tồn đầu', material.openingStock],
                  ['Nhập', formatNumber(totalInbound, 2)],
                  ['Xuất', formatNumber(totalOutbound, 2)],
                  ['Tồn cuối', closingDisplay]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-center">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                    <p className="mt-1 font-black text-zinc-900">{value || '-'}</p>
                  </div>
                ))}
              </div>

              {historyError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {historyError}
                </p>
              )}

              {isLoadingHistory ? (
                <p className="py-8 text-center text-sm font-bold text-zinc-500">Đang tải lịch sử...</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-emerald-200">
                    <div className="bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-emerald-800">
                      Nhập kho ({inboundRows.length})
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="px-3 py-2 font-black">Ngày</th>
                            <th className="px-3 py-2 font-black">Phiếu</th>
                            <th className="px-3 py-2 text-right font-black">SL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {inboundRows.map(row => (
                            <tr key={`${row.slipCode}-${row.slipDate}-${row.quantity}`}>
                              <td className="px-3 py-2 font-semibold text-zinc-700">{row.slipDate || '-'}</td>
                              <td className="px-3 py-2 font-bold text-zinc-900">{row.slipCode || '-'}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                                {formatNumber(row.quantity, 2)}
                              </td>
                            </tr>
                          ))}
                          {inboundRows.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-6 text-center font-semibold text-zinc-400">
                                Chưa có phiếu nhập
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-amber-200">
                    <div className="bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-wider text-amber-800">
                      Xuất kho ({outboundRows.length})
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                          <tr>
                            <th className="px-3 py-2 font-black">Ngày</th>
                            <th className="px-3 py-2 font-black">Phiếu</th>
                            <th className="px-3 py-2 text-right font-black">SL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {outboundRows.map(row => (
                            <tr key={`${row.slipCode}-${row.slipDate}-${row.quantity}`}>
                              <td className="px-3 py-2 font-semibold text-zinc-700">{row.slipDate || '-'}</td>
                              <td className="px-3 py-2 font-bold text-zinc-900">{row.slipCode || '-'}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-amber-800">
                                {formatNumber(row.quantity, 2)}
                              </td>
                            </tr>
                          ))}
                          {outboundRows.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-6 text-center font-semibold text-zinc-400">
                                Chưa có phiếu xuất
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {(tab === 'info' ? infoRows : nvlInfoRows).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button type="button" onClick={() => onEdit(material)} className="flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100">
            <Pencil className="h-4 w-4" />
            Sửa
          </button>
          <button
            type="button"
            onClick={() => onDelete(material)}
            disabled={isDeleting}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialsInventoryPanel({ onBack }: { onBack: () => void }) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('all');
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [materialsError, setMaterialsError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingMaterial, setViewingMaterial] = useState<MaterialRow | null>(null);
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(emptyMaterialForm);
  const [showBulkOpeningStock, setShowBulkOpeningStock] = useState(false);
  const [showBulkTotalWeight, setShowBulkTotalWeight] = useState(false);
  const [isFillingKgTotalWeight, setIsFillingKgTotalWeight] = useState(false);

  const loadMaterials = async () => {
    setIsLoadingMaterials(true);
    setMaterialsError('');

    try {
      const res = await fetch('/api/kho-nvl');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải nguyên phụ liệu từ Supabase.');
      }

      setMaterials(normalizeMaterialsInventory(data));
    } catch (error: any) {
      setMaterials([]);
      setMaterialsError(error.message || 'Không thể tải nguyên phụ liệu từ Supabase.');
    } finally {
      setIsLoadingMaterials(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  const units = useMemo(
    () => ['all', ...Array.from(new Set(materials.map(material => material.unit).filter(unit => unit !== '-'))).sort((a, b) => a.localeCompare(b, 'vi'))],
    [materials]
  );
  const materialUnitSuggestions = useMemo(() => {
    const fromMaterials = materials.map(material => material.unit).filter(unit => unit && unit !== '-');
    return [...new Set([...fromMaterials, ...readUnitSuggestions()])].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [materials]);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMaterials = useMemo(() => {
    return materials.filter(material => {
      const matchesUnit = selectedUnit === 'all' || material.unit === selectedUnit;
      const matchesSearch =
        !normalizedSearch ||
        `${material.code} ${material.name} ${material.unit}`.toLowerCase().includes(normalizedSearch);
      return matchesUnit && matchesSearch;
    });
  }, [materials, normalizedSearch, selectedUnit]);

  const totalWeightAll = materials.reduce((sum, material) => {
    const value = parseInventoryNumber(material.totalWeight);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  const handleDownloadTotalWeightTemplate = () => {
    downloadBulkMaterialTotalWeightTemplate(
      materials.map(material => ({
        code: material.code,
        totalWeight: material.totalWeight
      }))
    );
  };

  const handleDownloadOpeningStockTemplate = () => {
    downloadBulkOpeningStockTemplate(
      materials.map(material => ({
        code: material.code,
        name: material.name,
        openingStock: material.openingStock
      }))
    );
  };

  const handleFillKgTotalWeight25 = async () => {
    const kgMaterials = materials.filter(
      material => material.code && isMaterialKgUnit(material.unit)
    );
    if (kgMaterials.length === 0) {
      setMaterialsError('Không có NPL nào có đơn vị Kg.');
      return;
    }

    if (!window.confirm(`Điền Tổng kg = 25 cho ${kgMaterials.length} NPL có đơn vị Kg?`)) {
      return;
    }

    setIsFillingKgTotalWeight(true);
    setMaterialsError('');
    setActionMessage('');

    try {
      let updated = 0;

      try {
        const res = await fetch('/api/kho-nvl/fill-total-kg', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 25 })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          updated = data.updated ?? kgMaterials.length;
        } else if (res.status === 404) {
          updated = await patchMaterialsTotalWeight(kgMaterials, '25');
        } else {
          throw new Error(data.error || 'Không thể điền Tổng kg hàng loạt.');
        }
      } catch (error) {
        if (!isFetchNetworkError(error)) throw error;
        updated = await patchMaterialsTotalWeight(kgMaterials, '25');
      }

      setActionMessage(`Đã điền Tổng kg = 25 cho ${updated} NPL (đơn vị Kg).`);
      await loadMaterials();
    } catch (error: any) {
      if (isFetchNetworkError(error)) {
        setMaterialsError(
          'Mất kết nối server (Failed to fetch). Chạy `npm run dev` trong thư mục dự án, đợi dòng "Server running on http://0.0.0.0:3001", rồi tải lại trang.'
        );
        return;
      }
      setMaterialsError(error.message || 'Không thể điền Tổng kg hàng loạt.');
    } finally {
      setIsFillingKgTotalWeight(false);
    }
  };

  const openAddForm = () => {
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setMaterialForm(emptyMaterialForm());
    setFormMode('add');
  };

  const openEditForm = (material: MaterialRow) => {
    setFormError('');
    setActionMessage('');
    setViewingMaterial(null);
    setEditingId(material.id);
    setMaterialForm(materialToForm(material));
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
  };

  const handleSaveMaterial = async () => {
    if (!materialForm.code.trim()) {
      setFormError('Vui lòng nhập mã NPL.');
      return;
    }
    if (!materialForm.name.trim()) {
      setFormError('Vui lòng nhập tên nguyên phụ liệu.');
      return;
    }

    const payload = {
      ...materialForm,
      code: materialForm.code.trim(),
      unit: materialForm.unit.trim()
    };

    if (payload.unit) {
      saveUnitSuggestion(payload.unit);
    }

    setIsSavingMaterial(true);
    setFormError('');

    try {
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/kho-nvl/${editingId}` : '/api/kho-nvl', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật nguyên phụ liệu.' : 'Không thể thêm nguyên phụ liệu.'));
      }

      closeForm();
      setActionMessage(isEdit ? 'Đã cập nhật nguyên phụ liệu.' : 'Đã thêm nguyên phụ liệu mới.');
      await loadMaterials();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu nguyên phụ liệu.');
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const handleDeleteMaterial = async (material: MaterialRow) => {
    if (!material.id) {
      setMaterialsError('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa NPL "${material.code || material.name}"?`)) return;

    setDeletingMaterialId(material.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/kho-nvl/${material.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa nguyên phụ liệu.');
      }

      if (viewingMaterial?.id === material.id) setViewingMaterial(null);
      setActionMessage('Đã xóa nguyên phụ liệu.');
      await loadMaterials();
    } catch (error: any) {
      setMaterialsError(error.message || 'Không thể xóa nguyên phụ liệu.');
    } finally {
      setDeletingMaterialId(null);
    }
  };

  const materialFormFields: Array<{ key: keyof MaterialFormState; label: string; required?: boolean; placeholder?: string }> = [
    { key: 'name', label: 'Tên nguyên phụ liệu', required: true, placeholder: 'VD: Màng PE' },
    { key: 'totalWeight', label: 'Tổng kg' },
    { key: 'plasticWeight', label: 'Kg nhựa' },
    { key: 'bagWeight', label: 'Kg túi' },
    { key: 'coreWeight', label: 'Kg lõi' },
    { key: 'rollWidth', label: 'Khổ cuộn' },
    { key: 'unitLength', label: 'Chiều dài ĐV' },
    { key: 'openingStock', label: 'Tồn đầu kỳ' },
    { key: 'inbound', label: 'Nhập trong kỳ' },
    { key: 'outbound', label: 'Xuất trong kỳ' }
  ];

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý kho</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Kho NVL</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Nguyên phụ liệu · dữ liệu từ bảng Supabase kho_nvl.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={handleDownloadOpeningStockTemplate}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-3 text-xs font-extrabold text-emerald-100 transition hover:bg-emerald-500/25"
              >
                <Download className="h-4 w-4" />
                Tải mẫu Tồn đầu
              </button>
              <button
                type="button"
                onClick={() => setShowBulkOpeningStock(true)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-extrabold text-white transition hover:bg-white/20"
              >
                <ClipboardPaste className="h-4 w-4" />
                Excel Tồn đầu
              </button>
              <button
                type="button"
                onClick={handleDownloadTotalWeightTemplate}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-3 text-xs font-extrabold text-emerald-100 transition hover:bg-emerald-500/25"
              >
                <Download className="h-4 w-4" />
                Tải mẫu Excel
              </button>
              <button
                type="button"
                onClick={() => setShowBulkTotalWeight(true)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-extrabold text-white transition hover:bg-white/20"
              >
                <Upload className="h-4 w-4" />
                Tải Excel lên
              </button>
              <button
                type="button"
                onClick={handleFillKgTotalWeight25}
                disabled={isFillingKgTotalWeight || isLoadingMaterials || materials.length === 0}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 text-xs font-extrabold text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFillingKgTotalWeight ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                Điền 25 kg (Kg)
              </button>
              <button
                type="button"
                onClick={openAddForm}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Mã NVL', materials.length],
              ['Tổng kg', formatNumber(totalWeightAll, 2)],
              ['Đơn vị', units.length > 0 ? units.length - 1 : 0]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {units.map(unit => (
            <button
              key={unit}
              type="button"
              onClick={() => setSelectedUnit(unit)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedUnit === unit
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {unit === 'all' ? 'Tất cả' : unit}
            </button>
          ))}
          {isLoadingMaterials && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã NVL, tên nguyên phụ liệu..."
            disabled={isLoadingMaterials || materials.length === 0}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {materialsError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {materialsError}
          </p>
        )}

        {actionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {actionMessage}
          </p>
        )}
      </section>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa nguyên phụ liệu' : 'Thêm nguyên phụ liệu'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng kho_nvl trên Supabase</p>
              </div>
              <button type="button" onClick={closeForm} className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50">
                Đóng
              </button>
            </div>
            {formError && (
              <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 p-4">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã NPL *</span>
                <input
                  value={materialForm.code}
                  onChange={e => setMaterialForm(prev => ({ ...prev, code: e.target.value }))}
                  className={materialFieldClass}
                  placeholder="VD: NPL-001"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Đơn vị</span>
                <input
                  list="material-unit-suggestions"
                  value={materialForm.unit}
                  onChange={e => setMaterialForm(prev => ({ ...prev, unit: e.target.value }))}
                  onBlur={e => {
                    const trimmed = e.target.value.trim();
                    if (trimmed) saveUnitSuggestion(trimmed);
                  }}
                  className={materialFieldClass}
                  placeholder="Chọn hoặc nhập đơn vị mới"
                />
                <datalist id="material-unit-suggestions">
                  {materialUnitSuggestions.map(unit => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
              </label>
              {materialFormFields.map(field => (
                <label key={field.key} className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    {field.label}{field.required ? ' *' : ''}
                  </span>
                  <input
                    value={materialForm[field.key]}
                    onChange={e => setMaterialForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className={materialFieldClass}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button type="button" onClick={closeForm} className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50">
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveMaterial}
                disabled={isSavingMaterial}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMaterial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingMaterial ? 'Đang lưu...' : formMode === 'edit' ? 'Cập nhật' : 'Lưu NPL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingMaterial && (
        <MaterialViewModal
          material={viewingMaterial}
          onClose={() => {
            setViewingMaterial(null);
            loadMaterials();
          }}
          onEdit={openEditForm}
          onDelete={handleDeleteMaterial}
          isDeleting={deletingMaterialId === viewingMaterial.id}
        />
      )}

      <BulkOpeningStockModal
        open={showBulkOpeningStock}
        materials={materials}
        onClose={() => setShowBulkOpeningStock(false)}
        onApplied={message => {
          setActionMessage(message);
          void loadMaterials();
        }}
      />

      <BulkMaterialTotalWeightModal
        open={showBulkTotalWeight}
        materials={materials}
        onClose={() => setShowBulkTotalWeight(false)}
        onApplied={message => {
          setActionMessage(message);
          void loadMaterials();
        }}
      />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto md:overflow-visible">
          <table className="responsive-table w-full min-w-[640px] md:min-w-0 text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
              <tr>
                <th className="px-2.5 py-2 font-bold">Mã NPL</th>
                <th className="px-2.5 py-2 font-bold">Tên nguyên phụ liệu</th>
                <th className="px-2.5 py-2 font-bold">ĐV</th>
                <th className="px-2.5 py-2 text-right font-bold">Tổng kg</th>
                <th className="px-2.5 py-2 font-bold">Tồn đầu</th>
                <th className="px-2.5 py-2 font-bold">Nhập</th>
                <th className="px-2.5 py-2 font-bold">Xuất</th>
                <th className="px-2.5 py-2 font-bold">Tồn cuối</th>
                <th className="px-2.5 py-2 text-center font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMaterials.map(material => (
                <tr key={material.id} className="transition hover:bg-brand-50/40">
                  <td data-label="Mã NPL" className="px-1 md:px-2.5 py-2 font-black text-slate-900">{material.code || '-'}</td>
                  <td data-label="Tên NVL" className="px-1 md:px-2.5 py-2 font-semibold text-slate-900">{material.name || '-'}</td>
                  <td data-label="Đơn vị" className="px-1 md:px-2.5 py-2 font-semibold text-slate-700">{material.unit}</td>
                  <td data-label="Tổng kg" className="px-1 md:px-2.5 py-2 text-right font-mono font-bold text-slate-800">{material.totalWeight}</td>
                  <td data-label="Tồn đầu" className="px-1 md:px-2.5 py-2 font-mono font-bold text-slate-700">{material.openingStock}</td>
                  <td data-label="Nhập" className="px-1 md:px-2.5 py-2 font-mono font-bold text-slate-700">{material.inbound}</td>
                  <td data-label="Xuất" className="px-1 md:px-2.5 py-2 font-mono font-bold text-slate-700">{material.outbound}</td>
                  <td data-label="Tồn cuối" className="px-1 md:px-2.5 py-2 font-mono font-bold text-slate-900">
                    {computeClosingStock(material.openingStock, material.inbound, material.outbound)}
                  </td>
                  <td data-label="Thao tác" className="px-1 md:px-2.5 py-2">
                    <div className="flex items-center justify-end md:justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingMaterial(material)}
                        title="Xem"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 active:scale-95"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(material)}
                        title="Sửa"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-brand-600 transition hover:bg-brand-50 active:scale-95"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMaterial(material)}
                        disabled={deletingMaterialId === material.id}
                        title="Xóa"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
                      >
                        {deletingMaterialId === material.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoadingMaterials && filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center font-semibold text-slate-500">
                    Không có nguyên phụ liệu phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type WarehouseSlipType = 'nhap' | 'xuat';
type WarehouseKind = 'nvl' | 'san_pham';

interface WarehouseMovementRow {
  id: string;
  slipCode: string;
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
  slipDate: string;
  shift: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  documentQuantity?: number;
  unitPrice: number;
  lineAmount: number;
  reason: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface WarehouseSlipLineDraft {
  key: string;
  code: string;
  name: string;
  unit: string;
  quantity: string;
  documentQuantity?: string;
  unitPrice: string;
  quotaQuantity?: string;
  suggestedQuantity?: string;
  lineNote?: string;
}

type WarehouseSlipPrefillDraft = {
  slipType: WarehouseSlipType;
  warehouseKind: WarehouseKind;
  slipDate?: string;
  reason: string;
  note: string;
  createdBy: string;
  productionOrderRef?: string;
  machine?: string;
  shift?: string;
  recipient?: string;
  deliverer?: string;
  warehouseLocation?: string;
  editSlipCode?: string;
  lines: Array<
    Pick<
      WarehouseSlipLineDraft,
      'code' | 'name' | 'unit' | 'quantity' | 'documentQuantity' | 'unitPrice' | 'quotaQuantity' | 'suggestedQuantity' | 'lineNote'
    >
  >;
};

function buildWarehouseSlipDraftFromHistoryRows(
  rows: WarehouseMovementRow[],
  slipCode: string
): WarehouseSlipPrefillDraft | null {
  const header = rows[0];
  if (!header) return null;

  return {
    slipType: header.slipType,
    warehouseKind: header.warehouseKind,
    slipDate: header.slipDate,
    reason: header.reason || '',
    note: header.note || '',
    createdBy: header.createdBy || '',
    shift: header.shift || '',
    editSlipCode: slipCode,
    lines: rows.map(row => ({
      code: row.itemCode,
      name: row.itemName,
      unit: row.unit,
      quantity: formatNumber(row.quantity, 2),
      documentQuantity:
        row.documentQuantity != null && Number.isFinite(row.documentQuantity)
          ? formatNumber(row.documentQuantity, 2)
          : '',
      unitPrice: row.unitPrice > 0 ? String(row.unitPrice) : ''
    }))
  };
}

const warehouseFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function parseWarehouseShiftSelection(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.map(item => item.trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,;+]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function formatWarehouseShiftSelection(shifts: string[]): string {
  return shifts.join(', ');
}

function toggleWarehouseShiftSelection(current: string[], shiftValue: string): string[] {
  return current.includes(shiftValue)
    ? current.filter(item => item !== shiftValue)
    : [...current, shiftValue];
}

function warehouseSlipTypeLabel(type: WarehouseSlipType) {
  return type === 'nhap' ? 'Nhập kho' : 'Xuất kho';
}

function warehouseKindLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Kho Sản phẩm' : 'Kho NVL';
}

function warehouseItemCodeLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Mã SP' : 'Mã NPL';
}

function warehouseItemNameLabel(kind: WarehouseKind) {
  return kind === 'san_pham' ? 'Tên SP' : 'Tên NVL';
}

function computeWarehouseLineAmount(quantityText: string, unitPriceText: string): number {
  const quantity = parsePercentInput(quantityText);
  const unitPrice = parseMoneyInput(unitPriceText);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return 0;
  return Math.round(quantity * unitPrice * 100) / 100;
}

function generateWarehouseSlipPreviewCode(slipType: WarehouseSlipType) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${slipType === 'nhap' ? 'PN' : 'PX'}-${date}-${time}`;
}

type WarehouseSlipPayloadItem = {
  code: string;
  name: string;
  unit: string;
  quantity: number;
  documentQuantity?: number;
  unitPrice: number;
  quotaQuantity?: number;
  suggestedQuantity?: number;
  lineNote?: string;
};

function parseWarehouseSlipPayloadItems(
  lines: WarehouseSlipLineDraft[],
  warehouseKind: WarehouseKind,
  options?: { allowMissingUnitPrice?: boolean }
): { error: string } | { items: WarehouseSlipPayloadItem[] } {
  const itemLabel = warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL';
  const codeLabel = warehouseItemCodeLabel(warehouseKind);
  const allowMissingUnitPrice = options?.allowMissingUnitPrice ?? false;

  const payloadItems = lines
    .map(line => {
      const quantity = parsePercentInput(line.quantity);
      const documentQuantity = parsePercentInput(line.documentQuantity ?? line.suggestedQuantity ?? '');
      const unitPrice = parseMoneyInput(line.unitPrice);
      const quotaQuantity = parsePercentInput(line.quotaQuantity ?? '');
      const suggestedQuantity = parsePercentInput(line.suggestedQuantity ?? '');
      return {
        code: line.code.trim(),
        name: line.name.trim(),
        unit: line.unit.trim(),
        quantity,
        documentQuantity:
          Number.isFinite(documentQuantity) && documentQuantity > 0 ? documentQuantity : undefined,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        quotaQuantity: Number.isFinite(quotaQuantity) && quotaQuantity > 0 ? quotaQuantity : undefined,
        suggestedQuantity:
          Number.isFinite(suggestedQuantity) && suggestedQuantity > 0 ? suggestedQuantity : undefined,
        lineNote: line.lineNote?.trim() || undefined
      };
    })
    .filter(line => line.code || line.quantity);

  if (payloadItems.length === 0) {
    return { error: `Vui lòng thêm ít nhất một dòng ${itemLabel}.` };
  }

  for (const item of payloadItems) {
    if (!item.code) {
      return { error: `Mỗi dòng cần chọn ${codeLabel}.` };
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      return { error: `Số lượng của ${item.code} phải lớn hơn 0.` };
    }
    if (!allowMissingUnitPrice && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      return { error: `Giá của ${item.code} không hợp lệ.` };
    }
  }

  return { items: payloadItems };
}

function buildWarehouseSlipPrintData(
  items: WarehouseSlipPayloadItem[],
  options: {
    slipCode: string;
    slipType: WarehouseSlipType;
    warehouseKind: WarehouseKind;
    slipDate: string;
    reason: string;
    note: string;
    createdBy: string;
    productionOrderRef?: string;
    machine?: string;
    shift?: string;
    recipient?: string;
    deliverer?: string;
    warehouseLocation?: string;
  }
): WarehouseSlipPrintData {
  const printLines = items.map(item => ({
    code: item.code,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    documentQuantity: item.documentQuantity ?? item.suggestedQuantity ?? null,
    unitPrice: item.unitPrice,
    lineAmount: Math.round(item.quantity * item.unitPrice * 100) / 100,
    quotaQuantity: item.quotaQuantity ?? null,
    suggestedQuantity: item.suggestedQuantity ?? null,
    lineNote: item.lineNote
  }));

  return {
    slipCode: options.slipCode,
    slipType: options.slipType,
    warehouseKind: options.warehouseKind,
    slipDate: options.slipDate,
    reason: options.reason,
    note: options.note,
    createdBy: options.createdBy,
    productionOrderRef: options.productionOrderRef,
    machine: options.machine,
    shift: options.shift,
    recipient: options.recipient,
    deliverer: options.deliverer,
    warehouseLocation: options.warehouseLocation,
    totalAmount: printLines.reduce((sum, line) => sum + line.lineAmount, 0),
    lines: printLines
  };
}

function formatWarehouseMoney(value: number) {
  return formatMoney(value, 0);
}

function createWarehouseLineDraft(): WarehouseSlipLineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: '',
    name: '',
    unit: '',
    quantity: '',
    documentQuantity: '',
    unitPrice: ''
  };
}

function createWarehouseLineDraftFromPrefill(
  line: Pick<
    WarehouseSlipLineDraft,
    'code' | 'name' | 'unit' | 'quantity' | 'documentQuantity' | 'unitPrice' | 'quotaQuantity' | 'suggestedQuantity' | 'lineNote'
  >
): WarehouseSlipLineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: line.code || '',
    name: line.name || '',
    unit: line.unit || '',
    quantity: line.quantity || '',
    documentQuantity: line.documentQuantity || line.suggestedQuantity || '',
    unitPrice: line.unitPrice || '',
    quotaQuantity: line.quotaQuantity || '',
    suggestedQuantity: line.suggestedQuantity || '',
    lineNote: line.lineNote || ''
  };
}

function normalizeWarehouseMovements(data: unknown): WarehouseMovementRow[] {
  const list = data && typeof data === 'object' && Array.isArray((data as { movements?: unknown }).movements)
    ? (data as { movements: unknown[] }).movements
    : Array.isArray(data)
      ? data
      : [];

  return list
    .map((entry): WarehouseMovementRow | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const slipTypeRaw = String(record.loai_phieu ?? record.slipType ?? '').trim().toLowerCase();
      const slipType: WarehouseSlipType = slipTypeRaw === 'xuat' ? 'xuat' : 'nhap';
      const warehouseKindRaw = String(record.loai_kho ?? record.warehouseKind ?? 'nvl').trim().toLowerCase();
      const warehouseKind: WarehouseKind = warehouseKindRaw === 'san_pham' ? 'san_pham' : 'nvl';
      const quantity = Number(record.so_luong ?? record.quantity);
      const documentQuantity = Number(record.so_luong_chung_tu ?? record.documentQuantity);
      const unitPrice = Number(record.don_gia ?? record.unitPrice ?? record.price ?? 0);
      const lineAmountRaw = Number(record.thanh_tien ?? record.lineAmount ?? record.amount);
      const lineAmount = Number.isFinite(lineAmountRaw)
        ? lineAmountRaw
        : Number.isFinite(quantity) && Number.isFinite(unitPrice)
          ? Math.round(quantity * unitPrice * 100) / 100
          : 0;
      const itemCode =
        warehouseKind === 'san_pham'
          ? String(record.ma_sp ?? record.productCode ?? record.itemCode ?? '').trim()
          : String(record.ma_npl ?? record.materialCode ?? record.itemCode ?? '').trim();
      const itemName =
        warehouseKind === 'san_pham'
          ? String(record.ten_sp ?? record.productName ?? record.itemName ?? '').trim()
          : String(record.ten_npl ?? record.materialName ?? record.itemName ?? '').trim();

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.ma_phieu ?? record.slipCode ?? '').trim(),
        slipType,
        warehouseKind,
        slipDate: String(record.ngay_phieu ?? record.slipDate ?? '').trim(),
        shift: String(record.ca ?? record.shift ?? record.ca_san_xuat ?? '').trim(),
        itemCode,
        itemName,
        unit: String(record.don_vi ?? record.unit ?? '').trim() || '-',
        quantity: Number.isFinite(quantity) ? quantity : 0,
        documentQuantity: Number.isFinite(documentQuantity) && documentQuantity > 0 ? documentQuantity : undefined,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lineAmount: Number.isFinite(lineAmount) ? lineAmount : 0,
        reason: String(record.ly_do ?? record.reason ?? '').trim(),
        note: String(record.ghi_chu ?? record.note ?? '').trim(),
        createdBy: String(record.nguoi_lap ?? record.nhan_su ?? record.createdBy ?? '').trim(),
        createdAt: String(record.created_at ?? record.createdAt ?? '').trim()
      };
    })
    .filter((row): row is WarehouseMovementRow => Boolean(row.id || row.slipCode));
}

function mapWarehouseMovementsForShiftSummary(rows: WarehouseMovementRow[]): ShiftSummaryWarehouseMovement[] {
  return rows.map(row => ({
    id: row.id,
    slipCode: row.slipCode,
    slipDate: row.slipDate,
    shift: row.shift,
    slipType: row.slipType,
    warehouseKind: row.warehouseKind,
    itemCode: row.itemCode,
    itemName: row.itemName,
    unit: row.unit,
    quantity: row.quantity,
    createdBy: row.createdBy
  }));
}

function WarehouseSlipPanel({
  onBack,
  onOpenHistory
}: {
  onBack: () => void;
  onOpenHistory: () => void;
}) {
  const [warehouseKind, setWarehouseKind] = useState<WarehouseKind>('nvl');
  const [slipType, setSlipType] = useState<WarehouseSlipType>('nhap');
  const [slipDate, setSlipDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [productionOrderRef, setProductionOrderRef] = useState('');
  const [machine, setMachine] = useState('');
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [deliverer, setDeliverer] = useState('');
  const [warehouseLocation, setWarehouseLocation] = useState('HCM');
  const [lines, setLines] = useState<WarehouseSlipLineDraft[]>(() => [createWarehouseLineDraft()]);
  const [itemOptions, setItemOptions] = useState<MaterialOption[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [printSlip, setPrintSlip] = useState<WarehouseSlipPrintData | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printAutoTrigger, setPrintAutoTrigger] = useState(false);
  const [editSlipCode, setEditSlipCode] = useState<string | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ReturnType<typeof normalizeShiftSettings>>([]);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  useEffect(() => {
    const loadShiftSettings = async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setShiftSettings(normalizeShiftSettings(data));
        }
      } catch {
        setShiftSettings([]);
      }
    };
    void loadShiftSettings();
  }, []);

  useEffect(() => {
    const rawDraft = localStorage.getItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<WarehouseSlipPrefillDraft>;
      if (!draft || !Array.isArray(draft.lines) || draft.lines.length === 0) return;

      setWarehouseKind(draft.warehouseKind === 'san_pham' ? 'san_pham' : 'nvl');
      setSlipType(draft.slipType === 'nhap' ? 'nhap' : 'xuat');
      if (draft.slipDate) setSlipDate(draft.slipDate);
      setReason(draft.reason || '');
      setNote(draft.note || '');
      setCreatedBy(draft.createdBy || '');
      setProductionOrderRef(draft.productionOrderRef || '');
      setMachine(draft.machine || '');
      setSelectedShifts(parseWarehouseShiftSelection(draft.shift));
      setRecipient(draft.recipient || '');
      setDeliverer(draft.deliverer || draft.recipient || '');
      setWarehouseLocation(draft.warehouseLocation || 'HCM');
      setLines(draft.lines.map(createWarehouseLineDraftFromPrefill));
      const editingCode = String(draft.editSlipCode || '').trim();
      if (editingCode) {
        setEditSlipCode(editingCode);
        setActionMessage(`Đang sửa phiếu ${editingCode}. Chỉnh sửa và bấm cập nhật để lưu.`);
      } else {
        setActionMessage('Đã điền sẵn phiếu xuất kho từ hạch toán định mức NVL.');
      }
      setFormError('');
    } catch {
      setFormError('Không thể đọc dữ liệu phiếu xuất kho đã chuyển sang.');
    } finally {
      localStorage.removeItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    const loadItems = async () => {
      setIsLoadingItems(true);
      try {
        if (warehouseKind === 'san_pham') {
          const res = await fetch('/api/san-pham?format=table');
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
          const products = normalizeProducts(data);
          setItemOptions(
            products.map(product => ({
              code: product.code,
              name: product.name,
              unit: product.unit && product.unit !== '-' ? product.unit : ''
            }))
          );
        } else {
          const res = await fetch('/api/kho-nvl');
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Không thể tải kho NVL.');
          const materials = normalizeMaterialsInventory(data);
          setItemOptions(
            materials.map(material => ({
              code: material.code,
              name: material.name,
              unit: material.unit && material.unit !== '-' ? material.unit : ''
            }))
          );
        }
      } catch {
        setItemOptions([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadItems();
  }, [warehouseKind]);

  const handleWarehouseKindChange = (kind: WarehouseKind) => {
    setWarehouseKind(kind);
    setLines([createWarehouseLineDraft()]);
    setFormError('');
    setActionMessage('');
  };

  const updateLine = (key: string, patch: Partial<WarehouseSlipLineDraft>) => {
    setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const pickItem = (key: string, code: string) => {
    const item = itemOptions.find(option => option.code === code);
    updateLine(key, {
      code,
      name: item?.name || '',
      unit: item?.unit || ''
    });
  };

  const slipTotal = useMemo(
    () => lines.reduce((sum, line) => sum + computeWarehouseLineAmount(line.quantity, line.unitPrice), 0),
    [lines]
  );

  const shiftLabel = formatWarehouseShiftSelection(selectedShifts);

  const handlePrintPreview = () => {
    void handleSave();
  };

  const handleSave = async () => {
    const parsed = parseWarehouseSlipPayloadItems(lines, warehouseKind, {
      allowMissingUnitPrice: warehouseKind === 'nvl' && slipType === 'xuat'
    });
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }

    const payloadItems = parsed.items;
    setIsSaving(true);
    setFormError('');
    setActionMessage('');

    const isEditing = Boolean(editSlipCode);
    const slipPayload = {
      loaiPhieu: slipType,
      loaiKho: warehouseKind,
      ngayPhieu: slipDate,
      lyDo: reason.trim(),
      ghiChu: note.trim(),
      nguoiLap: createdBy.trim(),
      ca: shiftLabel || null,
      items: payloadItems
    };

    try {
      const res = await fetch(
        isEditing ? `/api/phieu-xuat-nhap-kho/${encodeURIComponent(editSlipCode!)}` : '/api/phieu-xuat-nhap-kho',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slipPayload)
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEditing ? 'Không thể cập nhật phiếu xuất nhập kho.' : 'Không thể lưu phiếu xuất nhập kho.'));
      }

      const savedSlipCode = String(data.slipCode || editSlipCode || '').trim();

      setPrintSlip(
        buildWarehouseSlipPrintData(payloadItems, {
          slipCode: savedSlipCode,
          slipType,
          warehouseKind,
          slipDate,
          reason: reason.trim(),
          note: note.trim(),
          createdBy: createdBy.trim(),
          productionOrderRef: productionOrderRef.trim(),
          machine: machine.trim(),
          shift: shiftLabel,
          recipient: recipient.trim(),
          deliverer: deliverer.trim(),
          warehouseLocation: warehouseLocation.trim()
        })
      );
      setPrintAutoTrigger(false);
      setPrintModalOpen(true);
      setActionMessage(
        isEditing
          ? `Đã cập nhật phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}). Xem tại Lịch sử xuất nhập kho.`
          : `Đã lưu phiếu ${savedSlipCode} (${warehouseKindLabel(warehouseKind)}) vào lịch sử.`
      );
      setEditSlipCode(null);
      setReason('');
      setNote('');
      setDeliverer('');
      setProductionOrderRef('');
      setLines([createWarehouseLineDraft()]);
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu phiếu xuất nhập kho.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý kho</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Phiếu xuất nhập kho</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Lập phiếu nhập hoặc xuất cho kho NVL hoặc kho Sản phẩm.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-bold text-white transition hover:border-[#ef1b2d] hover:bg-[#ef1b2d]"
              >
                <History className="h-4 w-4" />
                Lịch sử
              </button>
            </div>
          </div>
        </div>
      </section>

      {editSlipCode ? (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-amber-800">Chế độ sửa phiếu</p>
          <p className="mt-1 text-sm font-bold text-amber-950">
            Mã phiếu: <span className="font-black">{editSlipCode}</span> — thay đổi sẽ ghi đè toàn bộ dòng của phiếu này.
          </p>
        </section>
      ) : null}

      {(formError || actionMessage) && (
        <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
          {formError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{formError}</p>
          )}
          {actionMessage && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-xs font-bold text-emerald-700">{actionMessage}</p>
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 text-[11px] font-black text-emerald-800 transition hover:bg-emerald-100"
              >
                <History className="h-3.5 w-3.5" />
                Xem lịch sử
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm space-y-4">
        <div>
          <p className="text-sm font-black text-zinc-950">Loại kho</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">Chọn kho NVL hoặc kho Sản phẩm trước khi lập phiếu</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            ['nvl', 'Kho NVL', Boxes],
            ['san_pham', 'Kho Sản phẩm', Package]
          ] as const).map(([kind, label, Icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => handleWarehouseKindChange(kind)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition ${
                warehouseKind === kind
                  ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">Tổng tiền phiếu</p>
            <p className="mt-1 text-2xl font-black text-zinc-950">{formatWarehouseMoney(slipTotal)} đ</p>
          </div>
          <p className="text-xs font-semibold text-zinc-500">
            Tự động cộng thành tiền các dòng (Giá × Số lượng)
          </p>
        </div>

        <div>
          <p className="text-sm font-black text-zinc-950">Thông tin phiếu</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            {warehouseSlipTypeLabel(slipType)} · {warehouseKindLabel(warehouseKind)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([
            ['nhap', 'Nhập kho', ArrowDownToLine],
            ['xuat', 'Xuất kho', ArrowUpFromLine]
          ] as const).map(([type, label, Icon]) => (
            <button
              key={type}
              type="button"
              onClick={() => setSlipType(type)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition ${
                slipType === type
                  ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày phiếu *</span>
            <input type="date" value={slipDate} onChange={event => setSlipDate(event.target.value)} className={warehouseFieldClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người lập</span>
            <input value={createdBy} onChange={event => setCreatedBy(event.target.value)} className={warehouseFieldClass} placeholder="Tên người lập phiếu" />
          </label>
          <div className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca</span>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              {shiftOptions.length === 0 ? (
                <p className="text-xs font-semibold text-zinc-400">Chưa có ca trong cài đặt.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {shiftOptions.map(option => {
                    const checked = selectedShifts.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          checked
                            ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedShifts(current => toggleWarehouseShiftSelection(current, option.value))
                          }
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedShifts.length > 0 ? (
                <p className="mt-2 text-[11px] font-semibold text-zinc-500">
                  Đã chọn: {shiftLabel}
                </p>
              ) : null}
            </div>
          </div>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lý do</span>
            <input value={reason} onChange={event => setReason(event.target.value)} className={warehouseFieldClass} placeholder="VD: Nhập mua ngoài, xuất sản xuất..." />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
            <input value={note} onChange={event => setNote(event.target.value)} className={warehouseFieldClass} placeholder={slipType === 'nhap' ? 'Số chứng từ gốc kèm theo...' : 'Ghi chú thêm (tuỳ chọn)'} />
          </label>
          {slipType === 'nhap' && (
            <>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Theo số chứng từ / lệnh SX</span>
                <input
                  value={productionOrderRef}
                  onChange={event => setProductionOrderRef(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="Số hóa đơn, lệnh SX, biên bản giao nhận..."
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Người giao hàng</span>
                <input
                  value={deliverer}
                  onChange={event => setDeliverer(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="Họ tên người giao hàng"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Địa điểm</span>
                <input
                  value={warehouseLocation}
                  onChange={event => setWarehouseLocation(event.target.value)}
                  className={warehouseFieldClass}
                  placeholder="VD: HCM"
                />
              </label>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Chi tiết {warehouseKind === 'san_pham' ? 'sản phẩm' : 'NVL'}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Mỗi dòng là một {warehouseKind === 'san_pham' ? 'mã SP' : 'mã NPL'} trong phiếu
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLines(current => [...current, createWarehouseLineDraft()])}
              className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm dòng
            </button>
          </div>

          <div
            className={
              slipType === 'nhap'
                ? 'hidden xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_5.5rem_5.5rem_2.5rem] xl:gap-3 xl:border-b xl:border-zinc-200/80 xl:pb-1.5'
                : 'hidden xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6rem_6rem_6rem_2.5rem] xl:gap-3 xl:border-b xl:border-zinc-200/80 xl:pb-1.5'
            }
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {warehouseItemCodeLabel(warehouseKind)} *
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              {warehouseItemNameLabel(warehouseKind)}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đơn vị</span>
            {slipType === 'nhap' ? (
              <>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Theo chứng từ</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Thực nhập *</span>
              </>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Số lượng *</span>
            )}
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Giá</span>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Thành tiền</span>
            <span />
          </div>

          <div className="divide-y divide-zinc-200/80">
            {lines.map(line => (
              <div
                key={line.key}
                className={
                  slipType === 'nhap'
                    ? 'grid grid-cols-1 gap-3 py-2 first:pt-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_4.5rem_5.5rem_5.5rem_5.5rem_5.5rem_2.5rem] xl:items-end xl:gap-3'
                    : 'grid grid-cols-1 gap-3 py-2 first:pt-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6rem_6rem_6rem_2.5rem] xl:items-end xl:gap-3'
                }
              >
                <div className="sm:col-span-2 xl:col-span-1">
                  <SearchableSelect
                    value={line.code}
                    onChange={code => pickItem(line.key, code)}
                    options={itemOptions}
                    placeholder={warehouseKind === 'san_pham' ? 'Gõ để tìm mã SP' : 'Gõ để tìm mã NPL'}
                    isLoading={isLoadingItems}
                    disabled={isLoadingItems}
                    inputClassName={warehouseFieldClass}
                    getLabel={item => {
                      const option = item as MaterialOption;
                      return `${option.code} · ${option.name}`;
                    }}
                    getValue={item => (item as MaterialOption).code}
                  />
                </div>
                <div>
                  <input
                    value={line.name}
                    onChange={event => updateLine(line.key, { name: event.target.value })}
                    className={warehouseFieldClass}
                  />
                </div>
                <div>
                  <input
                    value={line.unit}
                    onChange={event => updateLine(line.key, { unit: event.target.value })}
                    className={warehouseFieldClass}
                  />
                </div>
                {slipType === 'nhap' ? (
                  <>
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                        Theo chứng từ
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.documentQuantity || ''}
                        onChange={event => updateLine(line.key, { documentQuantity: event.target.value })}
                        className={warehouseFieldClass}
                        placeholder="SL CT"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-zinc-500 xl:hidden">
                        Thực nhập *
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={event => updateLine(line.key, { quantity: event.target.value })}
                        className={warehouseFieldClass}
                        placeholder="SL thực"
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={event => updateLine(line.key, { quantity: event.target.value })}
                      className={warehouseFieldClass}
                      placeholder="VD: 100,00"
                    />
                  </div>
                )}
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={line.unitPrice}
                    onChange={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                    onBlur={event => updateLine(line.key, { unitPrice: sanitizeMoneyInput(event.target.value) })}
                    className={warehouseFieldClass}
                    placeholder="VD: 25.000"
                  />
                </div>
                <div>
                  <div className={`${warehouseFieldClass} flex items-center bg-white font-mono font-bold text-zinc-900`}>
                    {formatWarehouseMoney(computeWarehouseLineAmount(line.quantity, line.unitPrice))} đ
                  </div>
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 xl:mb-0.5"
                    title="Xóa dòng"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] font-semibold text-zinc-500">
            Phiếu chỉ xuất hiện trong lịch sử sau khi bấm <strong>Lưu &amp; in</strong> hoặc <strong>In phiếu</strong>.
          </p>
          <button
            type="button"
            onClick={handlePrintPreview}
            disabled={isSaving}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-5 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            In phiếu
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-5 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving
              ? editSlipCode
                ? 'Đang cập nhật...'
                : 'Đang lưu...'
              : editSlipCode
                ? `Cập nhật phiếu ${editSlipCode}`
                : `Lưu & in phiếu ${warehouseSlipTypeLabel(slipType).toLowerCase()}`}
          </button>
        </div>
      </section>

      <WarehouseSlipPrintModal
        open={printModalOpen}
        data={printSlip}
        autoPrint={printAutoTrigger}
        onClose={() => {
          setPrintModalOpen(false);
          setPrintSlip(null);
          setPrintAutoTrigger(false);
        }}
      />
    </div>
  );
}

function WarehouseHistoryPanel({
  onBack,
  onOpenSlip
}: {
  onBack: () => void;
  onOpenSlip: () => void;
}) {
  const [warehouseTab, setWarehouseTab] = useState<WarehouseKind>('nvl');
  const [movements, setMovements] = useState<WarehouseMovementRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | WarehouseSlipType>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingSlipCode, setViewingSlipCode] = useState<string | null>(null);
  const [deletingSlipCode, setDeletingSlipCode] = useState<string | null>(null);
  const [selectedSlipCodes, setSelectedSlipCodes] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [historyPrintSlip, setHistoryPrintSlip] = useState<WarehouseSlipPrintData | null>(null);
  const [historyPrintOpen, setHistoryPrintOpen] = useState(false);
  const [historyPrintAutoTrigger, setHistoryPrintAutoTrigger] = useState(false);

  const loadMovements = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('loai_kho', warehouseTab);
      if (selectedType !== 'all') params.set('loai', selectedType);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await fetch(`/api/phieu-xuat-nhap-kho?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải lịch sử xuất nhập kho.');
      }

      setMovements(normalizeWarehouseMovements(data));
    } catch (loadError: any) {
      setMovements([]);
      setError(loadError.message || 'Không thể tải lịch sử xuất nhập kho.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setViewingSlipCode(null);
    setSelectedSlipCodes(new Set());
    loadMovements();
  }, [warehouseTab, selectedType, fromDate, toDate]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMovements = useMemo(() => {
    return movements.filter(row => {
      if (!normalizedSearch) return true;
      return `${row.slipCode} ${row.shift} ${row.itemCode} ${row.itemName} ${row.reason} ${row.createdBy}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [movements, normalizedSearch]);

  useEffect(() => {
    setSelectedSlipCodes(new Set());
  }, [normalizedSearch]);

  const slipGroups = useMemo(() => {
    const map = new Map<string, WarehouseMovementRow[]>();
    filteredMovements.forEach(row => {
      const key = row.slipCode || row.id;
      const current = map.get(key) || [];
      current.push(row);
      map.set(key, current);
    });
    return [...map.entries()]
      .map(([slipCode, rows]) => ({
        slipCode,
        rows,
        header: rows[0],
        totalAmount: rows.reduce((sum, row) => sum + row.lineAmount, 0)
      }))
      .sort((a, b) => {
        const byDate = (b.header.slipDate || '').localeCompare(a.header.slipDate || '');
        if (byDate !== 0) return byDate;
        return (b.slipCode || '').localeCompare(a.slipCode || '', 'vi');
      });
  }, [filteredMovements]);

  const selectableSlips = useMemo(
    () => slipGroups.filter(group => group.slipCode && group.rows.some(row => row.id)),
    [slipGroups]
  );
  const allSelected =
    selectableSlips.length > 0 && selectableSlips.every(group => selectedSlipCodes.has(group.slipCode));
  const selectedCount = selectedSlipCodes.size;

  const toggleSlipSelection = (slipCode: string) => {
    setSelectedSlipCodes(prev => {
      const next = new Set(prev);
      if (next.has(slipCode)) next.delete(slipCode);
      else next.add(slipCode);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedSlipCodes(
      allSelected ? new Set() : new Set(selectableSlips.map(group => group.slipCode))
    );
  };

  const viewingRows = viewingSlipCode
    ? filteredMovements.filter(row => row.slipCode === viewingSlipCode)
    : [];

  const viewingSlipTotal = useMemo(
    () => viewingRows.reduce((sum, row) => sum + row.lineAmount, 0),
    [viewingRows]
  );

  const handlePrintSlipByCode = (slipCode: string, autoPrint = false) => {
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const header = rows[0];
    if (!header) return;

    const totalAmount = rows.reduce((sum, row) => sum + row.lineAmount, 0);
    setHistoryPrintSlip({
      slipCode,
      slipType: header.slipType,
      warehouseKind: header.warehouseKind,
      slipDate: header.slipDate,
      shift: header.shift,
      reason: header.reason,
      note: header.note,
      createdBy: header.createdBy,
      totalAmount,
      lines: rows.map(row => ({
        code: row.itemCode,
        name: row.itemName,
        unit: row.unit,
        quantity: row.quantity,
        documentQuantity: row.documentQuantity ?? null,
        unitPrice: row.unitPrice,
        lineAmount: row.lineAmount
      }))
    });
    setHistoryPrintAutoTrigger(autoPrint);
    setHistoryPrintOpen(true);
  };

  const handlePrintViewingSlip = (autoPrint = false) => {
    if (!viewingSlipCode) return;
    handlePrintSlipByCode(viewingSlipCode, autoPrint);
  };

  const handleEditSlip = (slipCode: string) => {
    const rows = filteredMovements.filter(row => row.slipCode === slipCode);
    const draft = buildWarehouseSlipDraftFromHistoryRows(rows, slipCode);
    if (!draft) return;

    localStorage.setItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY, JSON.stringify(draft));
    setViewingSlipCode(null);
    onOpenSlip();
  };

  const handleDeleteSlip = async (slipCode: string, lineCount: number) => {
    if (!slipCode) return;
    if (!window.confirm(`Xóa toàn bộ phiếu ${slipCode} (${lineCount} dòng)?`)) return;

    setDeletingSlipCode(slipCode);
    setError('');
    try {
      const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa phiếu.');
      setSelectedSlipCodes(prev => {
        const next = new Set(prev);
        next.delete(slipCode);
        return next;
      });
      if (viewingSlipCode === slipCode) setViewingSlipCode(null);
      await loadMovements();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa phiếu.');
    } finally {
      setDeletingSlipCode(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCount === 0) return;
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedCount} phiếu đã chọn?`)) return;

    setIsBulkDeleting(true);
    setError('');
    try {
      for (const slipCode of selectedSlipCodes) {
        const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, {
          method: 'DELETE'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể xóa phiếu.');
      }
      if (viewingSlipCode && selectedSlipCodes.has(viewingSlipCode)) {
        setViewingSlipCode(null);
      }
      setSelectedSlipCodes(new Set());
      await loadMovements();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa các phiếu đã chọn.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý kho</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Lịch sử xuất nhập kho</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Mỗi dòng là một phiếu · bấm Xem để xem chi tiết NVL/SP bên trong.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onOpenSlip}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Lập phiếu
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Phiếu', slipGroups.length],
              [warehouseTab === 'san_pham' ? 'Dòng SP' : 'Dòng NVL', filteredMovements.length],
              ['Nhập', filteredMovements.filter(row => row.slipType === 'nhap').length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="flex gap-1 border-b border-zinc-200 px-4">
          {([
            ['nvl', 'Kho NVL', Boxes],
            ['san_pham', 'Kho Sản phẩm', Package]
          ] as const).map(([tab, label, Icon]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWarehouseTab(tab)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
                warehouseTab === tab ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-3 lg:flex lg:flex-wrap lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
          {([
            ['all', 'Tất cả'],
            ['nhap', 'Nhập kho'],
            ['xuat', 'Xuất kho']
          ] as const).map(([type, label]) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedType === type
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:mt-0 lg:w-auto">
          <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className={warehouseFieldClass} />
          <input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className={warehouseFieldClass} />
        </div>

        <label className="mt-3 flex h-11 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:min-w-[320px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder={warehouseTab === 'san_pham' ? 'Tìm mã phiếu, SP, lý do...' : 'Tìm mã phiếu, NPL, lý do...'}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {error}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        {selectableSlips.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <p className="text-xs font-semibold text-zinc-600">
              {selectedCount > 0 ? `Đã chọn ${selectedCount} phiếu` : 'Chọn phiếu để xóa nhiều'}
            </p>
            <button
              type="button"
              disabled={selectedCount === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
              onClick={() => void handleBulkDelete()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Xóa đã chọn{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="w-10 px-3 py-3 text-center font-black">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableSlips.length === 0 || isBulkDeleting || Boolean(deletingSlipCode)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    title="Chọn tất cả"
                  />
                </th>
                <th className="px-4 py-3 font-black">Mã phiếu</th>
                <th className="px-4 py-3 font-black">Loại</th>
                <th className="px-4 py-3 font-black">Ngày</th>
                <th className="px-4 py-3 font-black">Ca</th>
                <th className="px-4 py-3 font-black">Người lập</th>
                <th className="px-4 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Đang tải Supabase...
                  </td>
                </tr>
              ) : slipGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-bold text-zinc-400">
                    Chưa có lịch sử {warehouseKindLabel(warehouseTab).toLowerCase()}.
                  </td>
                </tr>
              ) : (
                slipGroups.map(group => {
                  const header = group.header;
                  const lineCount = group.rows.length;
                  const isSelected = selectedSlipCodes.has(group.slipCode);
                  const isDeleting = deletingSlipCode === group.slipCode;

                  return (
                    <tr
                      key={group.slipCode}
                      className={`hover:bg-red-50/40 ${isSelected ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!group.slipCode || isBulkDeleting || isDeleting}
                          onChange={() => toggleSlipSelection(group.slipCode)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Chọn phiếu"
                        />
                      </td>
                      <td className="px-4 py-3 font-black text-zinc-950">
                        <div>{group.slipCode || '-'}</div>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          {lineCount} dòng · {formatWarehouseMoney(group.totalAmount)} đ
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${
                            header.slipType === 'nhap'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {warehouseSlipTypeLabel(header.slipType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-700">{header.slipDate || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-700">{header.shift || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-600">{header.createdBy || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingSlipCode(group.slipCode)}
                            title="Xem chi tiết NVL"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSlip(group.slipCode)}
                            title="Sửa phiếu"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-amber-700 transition hover:bg-amber-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintSlipByCode(group.slipCode, true)}
                            title="In phiếu"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSlip(group.slipCode, lineCount)}
                            disabled={isDeleting || isBulkDeleting}
                            title="Xóa phiếu"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewingSlipCode && viewingRows[0] && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết phiếu</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  {viewingSlipCode} · {viewingRows.length} dòng {warehouseTab === 'san_pham' ? 'SP' : 'NVL'}
                </p>
              </div>
              <BackButton onClick={() => setViewingSlipCode(null)} />
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {[
                ['Kho', warehouseKindLabel(viewingRows[0].warehouseKind)],
                ['Loại', warehouseSlipTypeLabel(viewingRows[0].slipType)],
                ['Ngày', viewingRows[0].slipDate || '-'],
                ['Ca', viewingRows[0].shift || '-'],
                ['Tổng tiền', `${formatWarehouseMoney(viewingSlipTotal)} đ`],
                ['Lý do', viewingRows[0].reason || '-'],
                ['Ghi chú', viewingRows[0].note || '-'],
                ['Người lập', viewingRows[0].createdBy || '-']
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-zinc-200 px-4 py-3">
              <table className="min-w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-black">{warehouseItemCodeLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">{warehouseItemNameLabel(viewingRows[0].warehouseKind)}</th>
                    <th className="py-2 pr-3 font-black">SL</th>
                    <th className="py-2 pr-3 font-black">ĐVT</th>
                    <th className="py-2 pr-3 font-black">Giá</th>
                    <th className="py-2 font-black">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {viewingRows.map(row => (
                    <tr key={row.id || `${row.itemCode}-${row.quantity}`}>
                      <td className="py-2 pr-3 font-bold text-zinc-900">{row.itemCode}</td>
                      <td className="py-2 pr-3 text-zinc-700">{row.itemName || '-'}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-zinc-800">{formatNumber(row.quantity, 2)}</td>
                      <td className="py-2 pr-3 text-zinc-700">{row.unit}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-zinc-800">{formatWarehouseMoney(row.unitPrice)} đ</td>
                      <td className="py-2 font-mono font-bold text-zinc-900">{formatWarehouseMoney(row.lineAmount)} đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-4 py-3">
                <p className="text-sm font-black text-zinc-950">
                  Tổng tiền: <span className="text-[#ef1b2d]">{formatWarehouseMoney(viewingSlipTotal)} đ</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditSlip(viewingSlipCode!)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-800 transition hover:bg-amber-100"
                  >
                    <Pencil className="h-4 w-4" />
                    Sửa phiếu
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintViewingSlip(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                  >
                    <Printer className="h-4 w-4" />
                    In phiếu
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <WarehouseSlipPrintModal
        open={historyPrintOpen}
        data={historyPrintSlip}
        autoPrint={historyPrintAutoTrigger}
        onClose={() => {
          setHistoryPrintOpen(false);
          setHistoryPrintSlip(null);
          setHistoryPrintAutoTrigger(false);
        }}
      />
    </div>
  );
}

const ORDER_TYPE_OPTIONS = ['Đơn bán', 'Đơn sản xuất'] as const;
const ORDER_STATUS_DEFAULT = 'Chờ sx';
const ORDER_STATUS_OPTIONS = ['Chờ sx', 'Đang sx', 'Hoàn thành', 'Hủy'] as const;
const STORAGE_ORDER_UNIT_KEY = 'order_unit_suggestions_v1';
const orderFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

interface StaffOption {
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
  code: string;
}

interface OrderProductOption {
  code: string;
  name: string;
  unit: string;
  newCode: string;
}

function normalizeLookupText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function normalizeStaffOptions(data: unknown): StaffOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item): StaffOption | null => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['name', 'nhan_su', 'ho_ten', 'ten'], '');
      return name ? { name } : null;
    })
    .filter((item): item is StaffOption => Boolean(item));
}

function normalizeHcmBusinessStaffOptions(data: unknown): StaffOption[] {
  const branches = normalizeHrBranches(data);
  const staff = branches.flatMap(branch => {
    const branchText = normalizeLookupText(`${branch.name} ${branch.shortName}`);
    if (!branchText.includes('hcm')) return [];

    return branch.departments.flatMap(department => {
      const departmentText = normalizeLookupText(department.name);
      if (!departmentText.includes('kinh doanh')) return [];
      return department.members.map(member => ({ name: member.name }));
    });
  });

  const seen = new Set<string>();
  return staff
    .filter(item => {
      const key = normalizeLookupText(item.name.trim());
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function normalizeCustomerOptions(data: unknown): CustomerOption[] {
  if (!data || typeof data !== 'object') return [];
  const customers = (data as { customers?: unknown }).customers;
  if (!Array.isArray(customers)) return [];

  return customers
    .map((item): CustomerOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['ten_khach_hang', 'khach_hang', 'ten', 'name', 'ten_cong_ty'], '');
      const code = pickText(record, ['ma_khach_hang', 'ma_kh', 'code', 'id'], '');
      if (!name && !code) return null;
      return {
        id: code || name,
        name: name || code,
        code
      };
    })
    .filter((item): item is CustomerOption => Boolean(item));
}

function CustomersPanel({ onBack }: { onBack: () => void }) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCustomers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/khach-hang');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách khách hàng.');
      setCustomers(normalizeCustomerOptions(data));
    } catch (loadError: any) {
      setCustomers([]);
      setError(loadError.message || 'Không thể tải danh sách khách hàng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredCustomers = useMemo(
    () =>
      customers.filter(customer =>
        !normalizedSearch || `${customer.code} ${customer.name}`.toLowerCase().includes(normalizedSearch)
      ),
    [customers, normalizedSearch]
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Kinh doanh</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Khách hàng</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Danh sách khách hàng dùng cho đơn hàng và tra cứu kinh doanh.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            {[
              ['Khách hàng', customers.length],
              ['Đang hiển thị', filteredCustomers.length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã hoặc tên khách hàng..."
            disabled={isLoading}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={loadCustomers}
          disabled={isLoading}
          className="mt-3 h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 lg:mt-0"
        >
          {isLoading ? 'Đang tải...' : 'Tải lại'}
        </button>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-3 font-black">STT</th>
                <th className="px-4 py-3 font-black">Mã khách hàng</th>
                <th className="px-4 py-3 font-black">Tên khách hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải khách hàng...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center font-bold text-zinc-500">
                    Chưa có khách hàng phù hợp.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer, index) => (
                  <tr key={customer.id} className="transition hover:bg-red-50/40">
                    <td className="px-4 py-3 font-black text-[#ef1b2d]">{index + 1}</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-900">{customer.code || '-'}</td>
                    <td className="px-4 py-3 font-black text-zinc-950">{customer.name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function normalizeOrderProducts(data: unknown): OrderProductOption[] {
  return normalizeProducts(data).map(product => ({
    code: product.code,
    name: product.name,
    unit: product.unit === '-' ? '' : product.unit,
    newCode: product.newCode
  }));
}

function findOrderProductByCode(products: OrderProductOption[], code: string) {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  return (
    products.find(
      product =>
        product.code.toLowerCase() === normalized ||
        product.newCode.toLowerCase() === normalized
    ) ?? null
  );
}

function resolveOrderProductFields(
  products: OrderProductOption[],
  productCode: string,
  fallback: { productName?: string; unit?: string } = {}
) {
  const match = findOrderProductByCode(products, productCode);
  if (!match) {
    return {
      productName: productCode.trim() ? '' : (fallback.productName ?? ''),
      unit: fallback.unit ?? ''
    };
  }

  return {
    productName: match.name,
    unit: match.unit || fallback.unit || ''
  };
}

function readUnitSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ORDER_UNIT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  } catch {
    return [];
  }
}

function saveUnitSuggestion(unit: string) {
  const trimmed = unit.trim();
  if (!trimmed) return;
  const next = [...new Set([trimmed, ...readUnitSuggestions()])].slice(0, 30);
  localStorage.setItem(STORAGE_ORDER_UNIT_KEY, JSON.stringify(next));
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  isLoading,
  disabled,
  getLabel,
  getValue,
  inputClassName,
  maxResults = 50,
  allowEmpty = true,
  onSelectOption,
  resolveSelectedItem,
  getOptionLabel,
  getSearchText,
  displaySelectedAsValue = false
}: {
  value: string;
  onChange: (value: string) => void;
  options: unknown[];
  placeholder: string;
  isLoading?: boolean;
  disabled?: boolean;
  getLabel: (item: unknown) => string;
  getValue: (item: unknown) => string;
  inputClassName?: string;
  maxResults?: number;
  allowEmpty?: boolean;
  onSelectOption?: (item: unknown | null) => void;
  resolveSelectedItem?: (options: unknown[], value: string) => unknown | null;
  getOptionLabel?: (item: unknown) => string;
  getSearchText?: (item: unknown) => string;
  displaySelectedAsValue?: boolean;
}) {
  const fieldClass = inputClassName || orderFieldClass;
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const selectedItem = useMemo(() => {
    if (resolveSelectedItem) {
      return resolveSelectedItem(options, value);
    }
    return options.find(item => getValue(item) === value) ?? null;
  }, [options, value, getValue, resolveSelectedItem]);
  const selectedLabel = selectedItem
    ? displaySelectedAsValue
      ? getValue(selectedItem)
      : getLabel(selectedItem)
    : value;

  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel);
    }
  }, [selectedLabel, open]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = normalized
      ? options.filter(item => {
          const label = (getSearchText ?? getLabel)(item).toLowerCase();
          const optionValue = getValue(item).toLowerCase();
          return label.includes(normalized) || optionValue.includes(normalized);
        })
      : options;
    return list.slice(0, maxResults);
  }, [options, query, getLabel, getSearchText, getValue, maxResults]);

  const commitValue = (nextValue: string, item: unknown | null = null) => {
    const trimmed = nextValue.trim();
    onChange(trimmed);
    onSelectOption?.(item);
    if (item) {
      setQuery(getLabel(item));
    } else if (trimmed) {
      const match = options.find(opt => getValue(opt) === trimmed);
      setQuery(match ? getLabel(match) : trimmed);
    } else {
      setQuery('');
    }
    setOpen(false);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        if (allowEmpty) {
          commitValue('', null);
        } else {
          setQuery(selectedLabel);
          setOpen(false);
        }
        return;
      }

      const exactValue = options.find(item => getValue(item).toLowerCase() === normalized);
      if (exactValue) {
        commitValue(getValue(exactValue), exactValue);
        return;
      }

      const exactLabel = options.find(item => getLabel(item).toLowerCase() === normalized);
      if (exactLabel) {
        commitValue(getValue(exactLabel), exactLabel);
        return;
      }

      if (filteredOptions.length === 1) {
        commitValue(getValue(filteredOptions[0]), filteredOptions[0]);
        return;
      }

      setQuery(selectedLabel);
      setOpen(false);
    }, 120);
  };

  const isDisabled = Boolean(disabled || isLoading);
  const emptyText = isLoading ? 'Đang tải...' : options.length === 0 ? 'Không có dữ liệu' : placeholder;

  const updateMenuPosition = () => {
    const element = inputRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width
    });
  };

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, query, filteredOptions.length]);

  const dropdownPanelClass =
    'fixed z-[120] max-h-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg';

  const renderDropdown = () => {
    if (!open || isDisabled || !menuStyle) return null;

    if (filteredOptions.length > 0) {
      return createPortal(
        <div className={dropdownPanelClass} style={menuStyle}>
          {allowEmpty && !query.trim() && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => commitValue('', null)}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50"
            >
              {placeholder}
            </button>
          )}
          {filteredOptions.map((item, index) => {
            const optionValue = getValue(item);
            const optionLabel = (getOptionLabel ?? getLabel)(item);
            return (
              <button
                key={`${optionValue}-${index}`}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => commitValue(optionValue, item)}
                className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-red-50 ${
                  optionValue === value ? 'bg-red-50 font-black text-[#ef1b2d]' : 'font-semibold text-zinc-800'
                }`}
              >
                {optionLabel}
              </button>
            );
          })}
        </div>,
        document.body
      );
    }

    if (query.trim()) {
      return createPortal(
        <div className={dropdownPanelClass} style={menuStyle}>
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500">Không tìm thấy kết quả</div>
        </div>,
        document.body
      );
    }

    return null;
  };

  return (
    <div className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!isDisabled) setOpen(true);
        }}
        onBlur={handleBlur}
        disabled={isDisabled}
        placeholder={emptyText}
        className={fieldClass}
      />
      {renderDropdown()}
    </div>
  );
}

function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  isLoading,
  disabled,
  getLabel,
  getValue
}: {
  value: string;
  onChange: (value: string) => void;
  options: unknown[];
  placeholder: string;
  isLoading?: boolean;
  disabled?: boolean;
  getLabel: (item: unknown) => string;
  getValue: (item: unknown) => string;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      isLoading={isLoading}
      disabled={disabled}
      getLabel={getLabel}
      getValue={getValue}
    />
  );
}

const MACHINE_NVL_REPORT_TABS: { id: MachineNvlReportKind; label: string; hint: string }[] = [
  { id: 'dau_ca', label: 'Báo cáo đầu ca', hint: 'Kiểm kê NVL tồn khi bắt đầu ca' },
  { id: 'cuoi_ca', label: 'Báo cáo cuối ca', hint: 'Kiểm kê NVL tồn khi kết thúc ca' }
];

type MachineNvlReportLine = {
  key: string;
  code: string;
  name: string;
  unit: string;
  previousQuantity: string;
  inMachineQuantity: string;
  inMixerQuantity: string;
  unblendedQuantity: string;
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
  previousQuantity: '',
  inMachineQuantity: '',
  inMixerQuantity: '',
  unblendedQuantity: '',
  standardQuantity: '',
  quantity: '',
  note: ''
});

function machineNvlReportMatchesMachine(
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

function findLatestPreviousCuoiCaReport(
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

function buildPreviousShiftQuantityMap(report: MachineNvlSavedReport | null) {
  const map = new Map<string, number>();
  if (!report) return map;
  report.lines.forEach(line => {
    const codeKey = normalizeProductCodeKey(line.maNvl);
    if (!codeKey) return;
    map.set(codeKey, line.soLuongTon);
  });
  return map;
}

function machineNvlTextKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function machineNvlShiftKey(value: string) {
  return machineNvlTextKey(value.replace(/\([^)]*\)/g, '').replace(/^ca\s*/i, 'ca'));
}

function machineNvlShiftMatches(orderShift: string, selectedShift: string) {
  const orderKey = machineNvlShiftKey(orderShift);
  const selectedKey = machineNvlShiftKey(selectedShift);
  if (!orderKey || !selectedKey || orderKey === '-') return false;
  return orderKey === selectedKey || orderKey.includes(selectedKey) || selectedKey.includes(orderKey);
}

function machineNvlOrderMatchesMachine(orderMachine: string, selectedMachine: MachineRow | null, machineRef: string) {
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

function formatMachineNvlQuantityValue(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(value);
}

const MACHINE_NVL_DAU_CA_GRID =
  'grid-cols-[52px_minmax(130px,1.1fr)_minmax(160px,2fr)_64px_96px_96px_96px_104px_96px_minmax(96px,1fr)_40px]';
const MACHINE_NVL_CUOI_CA_GRID =
  'grid-cols-[52px_minmax(130px,1.1fr)_minmax(160px,2fr)_64px_112px_112px_minmax(96px,1fr)_40px]';

function findMaterialByCode(materials: MaterialRow[], code: string) {
  const normalized = code.trim();
  if (!normalized) return null;
  return materials.find(material => material.code === normalized) ?? null;
}

function savedMachineNvlLineToFormLine(line: MachineNvlSavedLine): MachineNvlReportLine {
  return {
    key: `${Date.now()}-${line.stt}-${Math.random().toString(36).slice(2)}`,
    code: line.maNvl,
    name: line.tenNvl,
    unit: line.donVi || 'kg',
    previousQuantity: formatMachineNvlQuantityValue(line.soLuongTonCaTruoc),
    inMachineQuantity: formatMachineNvlQuantityValue(line.soLuongTrongMay),
    inMixerQuantity: formatMachineNvlQuantityValue(line.soLuongTrongBonTron),
    unblendedQuantity: formatMachineNvlQuantityValue(line.soLuongNlChuaTron),
    standardQuantity: formatMachineNvlQuantityValue(line.soLuongTonDinhMuc),
    quantity: formatMachineNvlQuantityValue(line.soLuongTon),
    note: line.ghiChu
  };
}

function MachineNvlReportPanel({
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

  const loadReports = async (kind: MachineNvlReportKind = activeKind) => {
    const res = await fetch(`/api/bao-cao-may-nvl-ton?limit=50&loai_bao_cao=${encodeURIComponent(kind)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setReports(normalizeMachineNvlReports(data));
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [machineRes, materialRes, settingsRes, productionRes, reportRes, cuoiCaRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/kho-nvl'),
          fetch('/api/cai-dat'),
          fetch('/api/lenh-sx'),
          fetch(`/api/bao-cao-may-nvl-ton?limit=50&loai_bao_cao=${encodeURIComponent(activeKind)}`),
          fetch('/api/bao-cao-may-nvl-ton?limit=50&loai_bao_cao=cuoi_ca')
        ]);
        const [machineData, materialData, settingsData, productionData, reportData, cuoiCaData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          materialRes.json().catch(() => ({})),
          settingsRes.json().catch(() => ({})),
          productionRes.json().catch(() => ({})),
          reportRes.json().catch(() => ({})),
          cuoiCaRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (materialRes.ok) setMaterials(normalizeMaterialsInventory(materialData));
        if (settingsRes.ok) setShiftSettings(mapProductionOrderSettings(settingsData));
        if (productionRes.ok) setProductionOrders(normalizeProductionOrders(productionData));
        if (reportRes.ok) setReports(normalizeMachineNvlReports(reportData));
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

    return fromSettings.length > 0 ? fromSettings : [...STANDARD_SHIFTS];
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
  const previousCuoiCaReport = useMemo(
    () =>
      isDauCaTab
        ? findLatestPreviousCuoiCaReport(
            cuoiCaReports,
            selectedMachine?.code || machineRef.trim(),
            selectedMachine?.name || machineRef.trim(),
            machineRef,
            date,
            shift
          )
        : null,
    [isDauCaTab, cuoiCaReports, selectedMachine, machineRef, date, shift]
  );
  const previousShiftQtyMap = useMemo(
    () => buildPreviousShiftQuantityMap(previousCuoiCaReport),
    [previousCuoiCaReport]
  );

  useEffect(() => {
    if (!isDauCaTab || previousShiftQtyMap.size === 0) return;
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
  }, [isDauCaTab, previousShiftQtyMap]);

  useEffect(() => {
    if (materials.length === 0) return;
    setLines(prev => {
      let changed = false;
      const next = prev.map(line => {
        const code = line.code.trim();
        if (!code || line.name.trim()) return line;
        const material = findMaterialByCode(materials, code);
        if (!material) return line;
        changed = true;
        return {
          ...line,
          name: material.name,
          unit: material.unit === '-' ? 'kg' : material.unit
        };
      });
      return changed ? next : prev;
    });
  }, [materials]);

  const totalQuantity = lines.reduce((sum, line) => {
    const value = isDauCaTab
      ? (Number(line.inMachineQuantity.replace(',', '.')) || 0) +
        (Number(line.inMixerQuantity.replace(',', '.')) || 0) +
        (Number(line.unblendedQuantity.replace(',', '.')) || 0)
      : Number(line.quantity.replace(',', '.'));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const updateLine = (key: string, updates: Partial<MachineNvlReportLine>) => {
    setLines(prev => prev.map(line => (line.key === key ? { ...line, ...updates } : line)));
  };

  const selectMaterial = (key: string, material: MaterialRow | null) => {
    if (!material) {
      updateLine(key, { code: '', name: '', unit: '' });
      return;
    }
    const codeKey = normalizeProductCodeKey(material.code);
    const prevQty = isDauCaTab && codeKey ? previousShiftQtyMap.get(codeKey) : undefined;
    updateLine(key, {
      code: material.code,
      name: material.name,
      unit: material.unit === '-' ? 'kg' : material.unit,
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
          ghi_chu: line.note.trim()
        };
        if (isDauCaTab) {
          const prevQty = Number(line.previousQuantity.replace(',', '.'));
          const inMachineQty = Number(line.inMachineQuantity.replace(',', '.'));
          const inMixerQty = Number(line.inMixerQuantity.replace(',', '.'));
          const unblendedQty = Number(line.unblendedQuantity.replace(',', '.'));
          if (Number.isFinite(prevQty) && prevQty >= 0) {
            row.so_luong_ton_ca_truoc = prevQty;
          }
          if (Number.isFinite(inMachineQty) && inMachineQty >= 0) {
            row.so_luong_trong_may = inMachineQty;
          }
          if (Number.isFinite(inMixerQty) && inMixerQty >= 0) {
            row.so_luong_trong_bon_tron = inMixerQty;
          }
          if (Number.isFinite(unblendedQty) && unblendedQty >= 0) {
            row.so_luong_nl_chua_tron = unblendedQty;
          }
          row.so_luong_ton =
            (Number.isFinite(inMachineQty) ? inMachineQty : 0) +
            (Number.isFinite(inMixerQty) ? inMixerQty : 0) +
            (Number.isFinite(unblendedQty) ? unblendedQty : 0);
        } else {
          const standardQty = Number(line.standardQuantity.replace(',', '.'));
          row.so_luong_ton = Number(line.quantity.replace(',', '.')) || 0;
          if (Number.isFinite(standardQty) && standardQty >= 0) {
            row.so_luong_ton_dinh_muc = standardQty;
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
          Number(line.so_luong_ton_dinh_muc) > 0 ||
          Number(line.so_luong_ton) > 0
      );

    if (!date || !shift || !machineRef.trim() || materialLines.length === 0) {
      setMessage('Vui lòng chọn ngày, ca, máy và nhập ít nhất một dòng NVL tồn.');
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
            ma_may: selectedMachine?.code || machineRef.trim(),
            ten_may: selectedMachine?.name || machineRef.trim(),
            nhan_su: machineNvlStaffText,
            ghi_chu: note.trim(),
            loai_bao_cao: activeKind,
            chi_tiet: materialLines
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Không thể ${isEdit ? 'cập nhật' : 'lưu'} báo cáo NVL tồn theo máy.`);
      }

      setMessage(isEdit ? `Đã cập nhật ${activeTabMeta.label.toLowerCase()}.` : `Đã lưu ${activeTabMeta.label.toLowerCase()}.`);
      setEditingReportId(null);
      if (isEdit) {
        setLines([]);
      }
      setNote('');
      await loadReports(activeKind);
    } catch (error: any) {
      setMessage(error.message || 'Không thể lưu báo cáo.');
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
    if (isDauCaTab) {
      return (
        line.inMachineQuantity.trim() ||
        line.inMixerQuantity.trim() ||
        line.unblendedQuantity.trim()
      );
    }
    return line.standardQuantity.trim() || line.quantity.trim();
  });

  useEffect(() => {
    if (!pendingPrint || !printReport) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 150);
    return () => window.clearTimeout(timer);
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
              <p className="text-sm font-semibold text-zinc-500">{activeTabMeta.hint}</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Tổng tồn</p>
            <p className="text-lg font-black text-emerald-900">{formatNumber(totalQuantity)} kg</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {MACHINE_NVL_REPORT_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchReportKind(tab.id)}
                className={`inline-flex h-10 items-center rounded-xl px-4 text-sm font-black transition ${
                  activeKind === tab.id
                    ? 'bg-[#ef1b2d] text-white shadow-sm'
                    : 'border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-[#ef1b2d]/40 hover:text-[#ef1b2d]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {onOpenList ? (
            <button
              type="button"
              onClick={onOpenList}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
            >
              <ClipboardList className="h-4 w-4" />
              Danh sách
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
            <div className="machine-nvl-form-grid flex w-full flex-wrap gap-2 lg:grid lg:grid-cols-4 lg:gap-3">
              <label
                className="machine-nvl-form-field w-[calc(50%-0.25rem)] text-xs font-black uppercase tracking-wider text-zinc-500 lg:w-auto"
                style={{ width: 'calc(50% - 0.25rem)' }}
              >
                Ngày
                <input type="date" value={date} onChange={event => setDate(event.target.value)} className={`${orderFieldClass} mt-1`} />
              </label>
              <label
                className="machine-nvl-form-field w-[calc(50%-0.25rem)] text-xs font-black uppercase tracking-wider text-zinc-500 lg:w-auto"
                style={{ width: 'calc(50% - 0.25rem)' }}
              >
                Ca
                <select value={shift} onChange={event => setShift(event.target.value)} className={`${orderFieldClass} mt-1`}>
                  <option value="">Chọn ca</option>
                  {shiftOptions.map(option => (
                    <option key={option} value={option}>
                      {formatProductionOrderShiftLabel(option, shiftSettings)}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="machine-nvl-form-field machine-nvl-form-span-2-lg w-[calc(50%-0.25rem)] text-xs font-black uppercase tracking-wider text-zinc-500 lg:col-span-2 lg:w-auto"
                style={{ width: 'calc(50% - 0.25rem)' }}
              >
                Máy
                <div className="mt-1 min-w-0">
                  {renderMachineSelect(machineRef, setMachineRef, machines, {
                    placeholder: 'Chọn máy',
                    isLoading
                  })}
                </div>
              </label>
              <div
                className="machine-nvl-form-field machine-nvl-form-span-2-lg w-[calc(50%-0.25rem)] text-xs font-black uppercase tracking-wider text-zinc-500 lg:col-span-2 lg:w-auto"
                style={{ width: 'calc(50% - 0.25rem)' }}
              >
                Nhân sự (chọn nhiều)
                <div className="mt-1 max-h-40 min-w-0 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  {!date || !shift || !machineRef.trim() ? (
                    <p className="px-2 py-3 text-xs font-semibold text-zinc-400">Chọn ngày, ca và máy trước.</p>
                  ) : staffOptions.length === 0 ? (
                    <p className="px-2 py-3 text-xs font-semibold text-zinc-400">
                      Không có nhân sự theo máy/ca/ngày.
                    </p>
                  ) : (
                    staffOptions.map(option => {
                      const checked = selectedStaffNames.includes(option);
                      return (
                        <label
                          key={option}
                          className={`mb-1 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition last:mb-0 ${
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
              <label
                className="machine-nvl-form-field machine-nvl-form-span-2 w-full text-xs font-black uppercase tracking-wider text-zinc-500 lg:col-span-2"
                style={{ width: '100%' }}
              >
                Ghi chú
                <input value={note} onChange={event => setNote(event.target.value)} placeholder="Ghi chú chung" className={`${orderFieldClass} mt-1`} />
              </label>
            </div>

            <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-200 md:mt-4 md:rounded-xl">
              <div
                className={`hidden md:grid gap-2 ${isDauCaTab ? MACHINE_NVL_DAU_CA_GRID : MACHINE_NVL_CUOI_CA_GRID} bg-zinc-950 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white ${isDauCaTab ? 'md:min-w-[1120px]' : 'md:min-w-[980px]'}`}
              >
                <span>STT</span>
                <span>Mã NVL</span>
                <span>Tên NVL</span>
                <span>ĐVT</span>
                {isDauCaTab ? <span>Tồn trong máy</span> : null}
                {isDauCaTab ? <span>Tồn trong bồn trộn</span> : null}
                {isDauCaTab ? <span>NL chưa trộn</span> : null}
                {isDauCaTab ? <span>Tổng tồn đầu ca</span> : null}
                {!isDauCaTab ? <span>SL tồn định mức</span> : null}
                <span>SL tồn thực tế</span>
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
                    className={`min-w-0 max-w-full px-1 py-1.5 md:px-3 md:py-2 ${isDauCaTab ? 'md:min-w-[1120px]' : 'md:min-w-[980px]'}`}
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
                      <label className="col-span-3 block min-w-0 space-y-0.5">
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
                      <label className="col-span-1 block min-w-0 space-y-0.5">
                        <span className="machine-nvl-line-mobile-label">ĐVT</span>
                        <input value={line.unit} readOnly className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-0.5 text-center text-[10px] font-semibold text-zinc-700 outline-none" />
                      </label>
                      {isDauCaTab ? (
                        <>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">Máy</span>
                            <input type="number" min="0" step="0.01" value={line.inMachineQuantity} onChange={event => updateLine(line.key, { inMachineQuantity: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-[10px] font-black outline-none focus:border-[#ef1b2d]" />
                          </label>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">Bồn</span>
                            <input type="number" min="0" step="0.01" value={line.inMixerQuantity} onChange={event => updateLine(line.key, { inMixerQuantity: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-[10px] font-black outline-none focus:border-[#ef1b2d]" />
                          </label>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">C.trộn</span>
                            <input type="number" min="0" step="0.01" value={line.unblendedQuantity} onChange={event => updateLine(line.key, { unblendedQuantity: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-[10px] font-black outline-none focus:border-[#ef1b2d]" />
                          </label>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">Tổng</span>
                            <input
                              value={formatMachineNvlQuantityValue(
                                (Number(line.inMachineQuantity.replace(',', '.')) || 0) +
                                  (Number(line.inMixerQuantity.replace(',', '.')) || 0) +
                                  (Number(line.unblendedQuantity.replace(',', '.')) || 0)
                              )}
                              readOnly
                              className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-0.5 text-[10px] font-black text-zinc-600 outline-none"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">SL ĐM</span>
                            <input type="number" min="0" step="0.01" value={line.standardQuantity} onChange={event => updateLine(line.key, { standardQuantity: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-[10px] font-black outline-none focus:border-[#ef1b2d]" />
                          </label>
                          <label className="block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">SL TT</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.quantity}
                              onChange={event => updateLine(line.key, { quantity: event.target.value })}
                              className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-0.5 text-[10px] font-black outline-none focus:border-[#ef1b2d]"
                            />
                          </label>
                          <label className="col-span-2 block min-w-0 space-y-0.5">
                            <span className="machine-nvl-line-mobile-label">Ghi chú</span>
                            <input value={line.note} onChange={event => updateLine(line.key, { note: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-1 text-[10px] font-semibold outline-none focus:border-[#ef1b2d]" />
                          </label>
                        </>
                      )}
                      {isDauCaTab ? (
                        <label className="col-span-4 block min-w-0 space-y-0.5">
                          <span className="machine-nvl-line-mobile-label">Ghi chú</span>
                          <input value={line.note} onChange={event => updateLine(line.key, { note: event.target.value })} className="machine-nvl-line-mobile-input h-8 w-full min-w-0 rounded-md border border-zinc-200 px-1 text-[10px] font-semibold outline-none focus:border-[#ef1b2d]" />
                        </label>
                      ) : null}
                    </div>
                    <div
                      className={`hidden md:grid gap-2 ${isDauCaTab ? MACHINE_NVL_DAU_CA_GRID : MACHINE_NVL_CUOI_CA_GRID} items-center ${isDauCaTab ? 'md:min-w-[1120px]' : 'md:min-w-[980px]'}`}
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
                    {isDauCaTab ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.inMachineQuantity}
                        onChange={event => updateLine(line.key, { inMachineQuantity: event.target.value })}
                        className="min-w-0 h-10 rounded-lg border border-zinc-200 px-2 text-sm font-black outline-none focus:border-[#ef1b2d]"
                      />
                    ) : null}
                    {isDauCaTab ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.inMixerQuantity}
                        onChange={event => updateLine(line.key, { inMixerQuantity: event.target.value })}
                        className="min-w-0 h-10 rounded-lg border border-zinc-200 px-2 text-sm font-black outline-none focus:border-[#ef1b2d]"
                      />
                    ) : null}
                    {isDauCaTab ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unblendedQuantity}
                        onChange={event => updateLine(line.key, { unblendedQuantity: event.target.value })}
                        className="min-w-0 h-10 rounded-lg border border-zinc-200 px-2 text-sm font-black outline-none focus:border-[#ef1b2d]"
                      />
                    ) : null}
                    {isDauCaTab ? (
                      <input
                        value={formatMachineNvlQuantityValue(
                          (Number(line.inMachineQuantity.replace(',', '.')) || 0) +
                            (Number(line.inMixerQuantity.replace(',', '.')) || 0) +
                            (Number(line.unblendedQuantity.replace(',', '.')) || 0)
                        )}
                        readOnly
                        className="min-w-0 h-10 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm font-black text-zinc-600 outline-none"
                      />
                    ) : null}
                    {!isDauCaTab ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.standardQuantity}
                        onChange={event => updateLine(line.key, { standardQuantity: event.target.value })}
                        className="min-w-0 h-10 rounded-lg border border-zinc-200 px-3 text-sm font-black outline-none focus:border-[#ef1b2d]"
                      />
                    ) : null}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={
                        isDauCaTab
                          ? formatMachineNvlQuantityValue(
                              (Number(line.inMachineQuantity.replace(',', '.')) || 0) +
                                (Number(line.inMixerQuantity.replace(',', '.')) || 0) +
                                (Number(line.unblendedQuantity.replace(',', '.')) || 0)
                            )
                          : line.quantity
                      }
                      onChange={event => updateLine(line.key, { quantity: event.target.value })}
                      readOnly={isDauCaTab}
                      className={`min-w-0 h-10 rounded-lg border border-zinc-200 px-3 text-sm font-black outline-none ${
                        isDauCaTab ? 'bg-zinc-50 text-zinc-600' : 'focus:border-[#ef1b2d]'
                      }`}
                    />
                    <input value={line.note} onChange={event => updateLine(line.key, { note: event.target.value })} className="min-w-0 h-10 rounded-lg border border-zinc-200 px-3 text-sm font-semibold outline-none focus:border-[#ef1b2d]" />
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setLines(prev => [...prev, emptyMachineNvlLine()])} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-800 hover:border-[#ef1b2d] hover:text-[#ef1b2d]">
                <Plus className="h-4 w-4" />
                Thêm dòng NVL
              </button>
              <div className="flex items-center gap-3">
                {message && <span className="text-sm font-bold text-zinc-600">{message}</span>}
                {editingReportId ? (
                  <button
                    type="button"
                    onClick={cancelEditReport}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-zinc-400"
                  >
                    Hủy sửa
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => printReportPayload(buildCurrentPrintReport())}
                  disabled={!canPrintCurrentReport}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-zinc-400 disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  In phiếu
                </button>
                <button type="button" onClick={saveReport} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingReportId ? 'Cập nhật báo cáo' : 'Lưu báo cáo'}
                </button>
              </div>
            </div>
          </section>
        </div>
        {printReport && <MachineNvlPrintBatch reports={[printReport]} />}
      </div>
    </div>
  );
}

function SearchableProductCodeField({
  value,
  onChange,
  products,
  isLoading,
  onSelectProduct
}: {
  value: string;
  onChange: (value: string) => void;
  products: OrderProductOption[];
  isLoading?: boolean;
  onSelectProduct: (product: OrderProductOption | null) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = normalized
      ? products.filter(product =>
          `${product.code} ${product.newCode} ${product.name}`.toLowerCase().includes(normalized)
        )
      : products;
    return list.slice(0, 40);
  }, [products, query]);

  const commitCode = (nextCode: string) => {
    const trimmed = nextCode.trim();
    onChange(trimmed);
    onSelectProduct(findOrderProductByCode(products, trimmed));
    setQuery(trimmed);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 w-full">
      <input
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            commitCode(query);
          }, 120);
        }}
        disabled={isLoading}
        placeholder={isLoading ? 'Đang tải hàng hóa...' : 'Gõ để tìm mã hàng'}
        className={orderFieldClass}
      />
      {open && !isLoading && filteredProducts.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {filteredProducts.map(product => (
            <button
              key={`${product.code}-${product.name}`}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => commitCode(product.code || product.newCode)}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-red-50"
            >
              <span className="text-sm font-black text-zinc-900">
                {product.code || product.newCode || '—'}
              </span>
              <span className="text-xs font-semibold text-zinc-500">{product.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProductionOrderRow {
  id: string;
  code: string;
  name: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  products: OrderProductLine[];
  status: string;
  customer: string;
  orderRef: string;
  startDate: string;
  endDate: string;
  machine: string;
  shift: string;
  staff: string;
  note: string;
  position: string;
  priority: number;
}

function resolveMachineDisplayValue(machineRef: string, machines: MachineRow[] = []): string {
  const trimmed = machineRef.trim();
  if (!trimmed || trimmed === '-') return '';
  const match = findMachineByRef(machines, trimmed);
  return match ? machineSelectValue(match) : trimmed;
}

function resolveProductionOrderMachine(row: ProductionOrderRow, machines: MachineRow[] = []): string {
  const machineRef = row.machine !== '-' ? row.machine : row.position !== '-' ? row.position : '';
  return resolveMachineDisplayValue(machineRef, machines) || machineRef || '-';
}

function compareProductionOrderPriority(a: ProductionOrderRow, b: ProductionOrderRow): number {
  const priorityA = a.priority > 0 ? a.priority : Number.MAX_SAFE_INTEGER;
  const priorityB = b.priority > 0 ? b.priority : Number.MAX_SAFE_INTEGER;
  if (priorityA !== priorityB) return priorityA - priorityB;

  const idA = Number(a.id);
  const idB = Number(b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idB - idA;
  }

  return `${b.startDate} ${b.code}`.localeCompare(`${a.startDate} ${a.code}`, 'vi');
}

function isActiveProductionPlanOrder(row: ProductionOrderRow) {
  return /đang|chờ|cho|active|sx/i.test(row.status);
}

type ProductionPlanLine = {
  id: string;
  code: string;
  name: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
  products: OrderProductLine[];
  status: string;
  orderRef: string;
  position: string;
  staff: string;
  shift: string;
  priority: number;
  note: string;
};

function splitProductionProductNames(raw: string, expectedCount: number): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || expectedCount <= 1) {
    return trimmed && trimmed !== '-' ? [trimmed] : [];
  }

  const matchCount = (parts: string[]) =>
    parts.length === expectedCount ? parts : null;

  const byPlus = matchCount(trimmed.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean));
  if (byPlus) return byPlus;

  const byComma = matchCount(trimmed.split(/,\s+/).map(part => part.trim()).filter(Boolean));
  if (byComma) return byComma;

  const byProductPrefix = matchCount(
    trimmed.split(/,\s*(?=Màng\s)/u).map(part => part.trim()).filter(Boolean)
  );
  if (byProductPrefix) return byProductPrefix;

  return [trimmed];
}

function splitProductionFieldValues(
  raw: string,
  expectedCount: number,
  options?: { duplicateSingle?: boolean }
): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || expectedCount <= 1) {
    return [trimmed || '-'];
  }

  const parts = trimmed.split(/,\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length === expectedCount) return parts;
  if (parts.length === 1) {
    if (options?.duplicateSingle) {
      return Array(expectedCount).fill(parts[0]);
    }
    return [parts[0], ...Array(expectedCount - 1).fill('-')];
  }

  return [trimmed, ...Array(expectedCount - 1).fill('-')];
}

function expandMergedProductionProducts(
  productCode: string,
  productName: string,
  unit: string,
  quantity: string,
  orderRef?: string
): OrderProductLine[] {
  const codes = splitProductionProductCodes(productCode);
  if (codes.length <= 1) {
    if (!productCode && !productName) return [];
    return [{ productCode, productName, unit, quantity, orderRef }];
  }

  const names = splitProductionProductNames(productName, codes.length);
  const units = splitProductionFieldValues(unit, codes.length, { duplicateSingle: true });
  const quantities = splitProductionFieldValues(quantity, codes.length);

  return codes.map((code, index) => ({
    productCode: code,
    productName: names[index] ?? names[0] ?? '',
    unit: units[index] ?? units[0] ?? unit,
    quantity: quantities[index] ?? quantities[0] ?? quantity,
    orderRef
  }));
}

function expandProductionOrderProductLines(lines: OrderProductLine[]): OrderProductLine[] {
  return lines.flatMap(line => {
    if (splitProductionProductCodes(line.productCode).length <= 1) return [line];
    return expandMergedProductionProducts(
      line.productCode,
      line.productName,
      line.unit,
      line.quantity,
      line.orderRef
    );
  });
}

function getProductionOrderProductLines(row: Pick<ProductionOrderRow, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>): OrderProductLine[] {
  if (row.products.length > 0) {
    return expandProductionOrderProductLines(row.products);
  }
  if (!row.productCode && !row.productName) return [];
  return expandMergedProductionProducts(
    row.productCode,
    row.productName,
    row.unit,
    row.quantity
  );
}

function getProductionPlanProductCodes(
  line: Pick<ProductionPlanLine, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>
) {
  return getProductionOrderProductLines(line)
    .map(product => product.productCode.trim())
    .filter(code => code && code !== '-');
}

function formatProductionPlanProductCodes(
  line: Pick<ProductionPlanLine, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>
) {
  const codes = getProductionPlanProductCodes(line);
  return codes.length > 0 ? codes.join(', ') : '-';
}

function getProductionPlanLineMaterialKeys(line: ProductionPlanLine): string[] {
  if (line.products.length > 1) {
    return line.products.map(product => `${line.id}__${product.productCode}`);
  }
  return [line.id];
}

function getProductionPlanLineMaterials(
  line: ProductionPlanLine,
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionOrderMaterialLine[] {
  const merged = new Map<string, ProductionOrderMaterialLine>();

  getProductionPlanLineMaterialKeys(line).forEach(key => {
    (materialsByLine[key] ?? []).forEach(material => {
      const mergeKey = `${normalizeProductCodeKey(material.code)}__${material.unit || '-'}`;
      const existing = merged.get(mergeKey);
      if (existing) {
        existing.proposedQuantity = roundNplNumber(existing.proposedQuantity + material.proposedQuantity);
      } else {
        merged.set(mergeKey, { ...material });
      }
    });
  });

  return [...merged.values()];
}

function formatProductionOrderProductsSummary(row: Pick<ProductionOrderRow, 'products' | 'productCode' | 'productName' | 'quantity' | 'unit'>) {
  const products = getProductionOrderProductLines(row);
  if (products.length === 0) return '-';
  if (products.length === 1) {
    const product = products[0];
    return `${product.productCode || '-'} · ${product.productName || '-'} · ${product.quantity}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''}`;
  }
  return products
    .map(product => `${product.productCode || '-'} (${product.quantity}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''})`)
    .join(' | ');
}

function productionOrderToPlanLine(
  row: ProductionOrderRow,
  priority: number,
  machines: MachineRow[] = []
): ProductionPlanLine {
  const products = getProductionOrderProductLines(row);
  const primaryProduct = products[0];

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    productCode: primaryProduct?.productCode ?? row.productCode,
    productName: primaryProduct?.productName ?? row.productName,
    quantity: primaryProduct?.quantity ?? row.quantity,
    unit: primaryProduct?.unit ?? row.unit,
    products,
    status: row.status,
    orderRef: row.orderRef,
    position: resolveProductionOrderMachine(row, machines),
    staff: row.staff,
    shift: row.shift,
    priority,
    note: row.note
  };
}

function buildInitialProductionPlanLines(
  productionOrders: ProductionOrderRow[],
  machines: MachineRow[] = []
): ProductionPlanLine[] {
  return productionOrders
    .filter(isActiveProductionPlanOrder)
    .sort(compareProductionOrderPriority)
    .map((row, index) => productionOrderToPlanLine(row, row.priority > 0 ? row.priority : index + 1, machines));
}

function enrichProductionPlanLines(
  planLines: ProductionPlanLine[],
  productionOrders: ProductionOrderRow[],
  machines: MachineRow[] = []
): ProductionPlanLine[] {
  const sourceById = new Map(productionOrders.map(row => [row.id, row]));

  return planLines.map(line => {
    const source = sourceById.get(line.id);
    if (!source) return line;

    return {
      ...productionOrderToPlanLine(source, line.priority, machines),
      note: line.note
    };
  });
}

type ProductionPlanPrintGroup = {
  machine: string;
  lines: ProductionPlanLine[];
};

function buildProductionPlanPrintGroups(lines: ProductionPlanLine[]): ProductionPlanPrintGroup[] {
  const map = new Map<string, ProductionPlanLine[]>();

  lines.forEach(line => {
    const machine = line.position.trim() || 'Chưa gán máy';
    if (!map.has(machine)) map.set(machine, []);
    map.get(machine)!.push(line);
  });

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([machine, groupLines]) => ({
      machine,
      lines: [...groupLines].sort((a, b) => a.priority - b.priority)
    }));
}

type ProductionPlanPrintRow = {
  stt: number;
  line: ProductionPlanLine;
  machine: string;
  machineRowSpan: number;
};

function buildProductionPlanPrintRows(lines: ProductionPlanLine[]): ProductionPlanPrintRow[] {
  const groups = buildProductionPlanPrintGroups(lines);
  const rows: ProductionPlanPrintRow[] = [];

  groups.forEach(group => {
    group.lines.forEach((line, index) => {
      rows.push({
        stt: rows.length + 1,
        line,
        machine: group.machine,
        machineRowSpan: index === 0 ? group.lines.length : 0
      });
    });
  });

  return rows;
}

function ProductionPlanPrintSheet({
  lines,
  materialsByLine
}: {
  lines: ProductionPlanLine[];
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>;
}) {
  const printRows = buildProductionPlanPrintRows(lines);
  const printDate = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return (
    <div className="production-plan-print-sheet">
      <div className="production-plan-print-doc">
        <header className="production-plan-print-header">
          <div className="production-plan-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-plan-print-logo" />
            <div className="production-plan-print-company">
              <p className="production-plan-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <div className="production-plan-print-title-wrap">
            <h1>KẾ HOẠCH SẢN XUẤT</h1>
          </div>
          <p className="production-plan-print-date">Ngày: {printDate}</p>
        </header>

        <table className="production-plan-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên máy</th>
              <th>Ca làm việc</th>
              <th>Nhân sự</th>
              <th>Lệnh sản xuất</th>
              <th>Vật tư / định mức tạm tính</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map(row => {
              const materials = getProductionPlanLineMaterials(row.line, materialsByLine);

              return (
                <tr key={row.line.id}>
                  <td className="production-plan-print-center">{row.stt}</td>
                  {row.machineRowSpan > 0 && (
                    <td rowSpan={row.machineRowSpan} className="production-plan-print-merged">
                      {row.machine}
                    </td>
                  )}
                  <td>{row.line.shift && row.line.shift !== '-' ? row.line.shift : '-'}</td>
                  <td>{row.line.staff && row.line.staff !== '-' ? row.line.staff : '-'}</td>
                  <td>
                    {getProductionPlanProductCodes(row.line).map(code => (
                      <div key={`${row.line.id}-${code}`} className="production-plan-print-product-name font-mono">
                        {code}
                      </div>
                    ))}
                    {getProductionPlanProductCodes(row.line).length === 0 ? '-' : null}
                  </td>
                  <td>
                    {materials.length === 0 ? (
                      <span className="production-plan-print-empty-material">
                        Chưa khai báo thành phần NPL
                      </span>
                    ) : (
                      <div className="production-plan-print-material-list">
                        {materials.map((material, index) => (
                          <div key={`${row.line.id}-${material.code}-${index}`} className="production-plan-print-material-item">
                            <span className="production-plan-print-material-name">
                              {index + 1}. {material.code}{material.name ? ` - ${material.name}` : ''}
                            </span>
                            <span className="production-plan-print-material-qty">
                              {formatProductionOrderPrintQuantity(material.proposedQuantity)}
                              {material.unit ? ` ${material.unit}` : ''} ({material.normLabel})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{row.line.note || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="production-plan-print-signatures">
          <div>
            <p>Người giao</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Người nhận</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function loadProductionPlanMaterials(
  lines: ProductionPlanLine[]
): Promise<Record<string, ProductionOrderMaterialLine[]>> {
  const entries = await Promise.all(
    lines.flatMap(line => {
      const products =
        line.products.length > 0
          ? line.products
          : [
              {
                productCode: line.productCode,
                productName: line.productName,
                unit: line.unit,
                quantity: line.quantity
              }
            ];

      return products.map(async product => {
        const { items, product: catalogProduct } = await fetchProductPrintData(product.productCode);
        const orderQuantity = parseProductionOrderQuantity(product.quantity);
        const materialKey = products.length > 1 ? `${line.id}__${product.productCode}` : line.id;
        return [materialKey, buildProductionOrderMaterialProposal(orderQuantity, items, catalogProduct)] as const;
      });
    })
  );

  return Object.fromEntries(entries);
}

type ProductionPlanMaterialAccountingDetail = {
  lineId: string;
  orderCode: string;
  productName: string;
  orderQuantity: string;
  proposedQuantity: number;
  normLabel: string;
  shift: string;
};

type ProductionPlanMaterialAccountingLine = {
  code: string;
  name: string;
  unit: string;
  totalQuantity: number;
  details: ProductionPlanMaterialAccountingDetail[];
};

type ProductionPlanMaterialAccountingShiftGroup = {
  shift: string;
  orderCount: number;
  lines: ProductionPlanMaterialAccountingLine[];
};

type ProductionPlanWarehouseExportLine = {
  code: string;
  name: string;
  unit: string;
  quotaQuantity: number;
  suggestedQuantity: number;
  actualQuantity: number;
};

function normalizeProductionPlanShift(shift: string) {
  const trimmed = String(shift || '').trim();
  return trimmed && trimmed !== '-' ? trimmed : 'Chưa phân ca';
}

function productionPlanAccountingKey(
  shift: string,
  material: Pick<ProductionPlanMaterialAccountingLine, 'code' | 'unit'>
) {
  return `${normalizeProductionPlanShift(shift)}__${normalizeProductCodeKey(material.code)}__${material.unit || '-'}`;
}

function buildInventoryTotalKgMap(materials: MaterialRow[]) {
  const map = new Map<string, number>();

  materials.forEach(material => {
    const totalKg = parseInventoryNumber(material.totalWeight);
    if (!material.code || totalKg === null || totalKg <= 0) return;
    map.set(normalizeProductCodeKey(material.code), totalKg);
  });

  return map;
}

function lookupInventoryTotalKg(code: string, inventoryTotalKgByCode: Map<string, number>) {
  return inventoryTotalKgByCode.get(normalizeProductCodeKey(code)) ?? null;
}

function suggestProductionPlanPackageQuantity(totalNorm: number, totalKg: number | null) {
  if (totalKg === null || totalKg <= 0 || !Number.isFinite(totalNorm) || totalNorm <= 0) return '';
  return String(roundNplNumber(totalNorm / totalKg));
}

function calcProductionPlanExpectedWeight(packageQuantity: number, totalKg: number | null) {
  if (totalKg === null || totalKg <= 0 || !Number.isFinite(packageQuantity) || packageQuantity < 0) return '';
  return String(roundNplNumber(packageQuantity * totalKg));
}

function resolveProductionPlanLineForMaterialKey(
  scopedLines: ProductionPlanLine[],
  materialKey: string
): { line: ProductionPlanLine; product: OrderProductLine } | null {
  const directLine = scopedLines.find(line => line.id === materialKey);
  if (directLine) {
    const products =
      directLine.products.length > 0
        ? directLine.products
        : [
            {
              productCode: directLine.productCode,
              productName: directLine.productName,
              unit: directLine.unit,
              quantity: directLine.quantity
            }
          ];
    return { line: directLine, product: products[0] };
  }

  const separatorIndex = materialKey.indexOf('__');
  if (separatorIndex <= 0) return null;

  const orderId = materialKey.slice(0, separatorIndex);
  const productCode = materialKey.slice(separatorIndex + 2);
  const line = scopedLines.find(item => item.id === orderId);
  if (!line) return null;

  const products =
    line.products.length > 0
      ? line.products
      : [
          {
            productCode: line.productCode,
            productName: line.productName,
            unit: line.unit,
            quantity: line.quantity
          }
        ];
  const product =
    products.find(item => item.productCode === productCode) ??
    ({
      productCode,
      productName: productCode,
      unit: line.unit,
      quantity: line.quantity
    } as OrderProductLine);

  return { line, product };
}

function buildProductionPlanMaterialAccountingForLines(
  scopedLines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingLine[] {
  const scopedLineIds = new Set(scopedLines.map(line => line.id));
  const map = new Map<string, ProductionPlanMaterialAccountingLine>();

  Object.entries(materialsByLine).forEach(([materialKey, materials]) => {
    const parentId = materialKey.includes('__') ? materialKey.slice(0, materialKey.indexOf('__')) : materialKey;
    if (!scopedLineIds.has(parentId)) return;

    const resolved = resolveProductionPlanLineForMaterialKey(scopedLines, materialKey);
    if (!resolved) return;

    const { line, product } = resolved;

    materials.forEach(material => {
      const code = material.code || '-';
      const unit = material.unit || '-';
      const key = `${normalizeProductCodeKey(code)}__${unit}`;
      const existing =
        map.get(key) ??
        {
          code,
          name: material.name || code,
          unit,
          totalQuantity: 0,
          details: []
        };

      existing.totalQuantity = roundNplNumber(existing.totalQuantity + material.proposedQuantity);
      existing.details.push({
        lineId: materialKey,
        orderCode: line.code || '-',
        productName: product.productName || product.productCode || '-',
        orderQuantity:
          product.quantity || product.unit
            ? `${product.quantity || '-'}${product.unit && product.unit !== '-' ? ` ${product.unit}` : ''}`
            : '-',
        proposedQuantity: material.proposedQuantity,
        normLabel: material.normLabel,
        shift: normalizeProductionPlanShift(line.shift)
      });
      map.set(key, existing);
    });
  });

  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

function buildProductionPlanMaterialAccountingByShift(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingShiftGroup[] {
  const shifts = [...new Set(lines.map(line => normalizeProductionPlanShift(line.shift)))].sort((a, b) =>
    a.localeCompare(b, 'vi', { numeric: true })
  );

  return shifts.map(shift => {
    const scopedLines = lines.filter(line => normalizeProductionPlanShift(line.shift) === shift);
    return {
      shift,
      orderCount: scopedLines.length,
      lines: buildProductionPlanMaterialAccountingForLines(scopedLines, materialsByLine)
    };
  });
}

function buildProductionPlanMaterialAccounting(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanMaterialAccountingLine[] {
  return buildProductionPlanMaterialAccountingForLines(lines, materialsByLine);
}

function buildProductionPlanNvlPrintGroups(
  lines: ProductionPlanLine[],
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>
): ProductionPlanNvlPrintShiftGroup[] {
  return buildProductionPlanMaterialAccountingByShift(lines, materialsByLine).map(group => ({
    shift: group.shift,
    orderCount: group.orderCount,
    orderCodes: [
      ...new Set(
        lines
          .filter(line => normalizeProductionPlanShift(line.shift) === group.shift)
          .map(line => line.code)
          .filter(code => code && code !== '-')
      )
    ],
    lines: group.lines.map(line => ({
      code: line.code,
      name: line.name,
      unit: line.unit,
      totalQuantity: line.totalQuantity
    }))
  }));
}

function ProductionPlanMaterialAccountingModal({
  open,
  onClose,
  lines,
  materialsByLine,
  inventoryMaterials,
  isLoading,
  error,
  onReload,
  onExportWarehouseSlip
}: {
  open: boolean;
  onClose: () => void;
  lines: ProductionPlanLine[];
  materialsByLine: Record<string, ProductionOrderMaterialLine[]>;
  inventoryMaterials: MaterialRow[];
  isLoading: boolean;
  error: string;
  onReload: () => void;
  onExportWarehouseSlip: (lines: ProductionPlanWarehouseExportLine[], shift: string) => void;
}) {
  const accountingShiftGroups = useMemo(
    () => buildProductionPlanMaterialAccountingByShift(lines, materialsByLine),
    [lines, materialsByLine]
  );
  const inventoryTotalKgByCode = useMemo(
    () => buildInventoryTotalKgMap(inventoryMaterials),
    [inventoryMaterials]
  );
  const [packageQuantities, setPackageQuantities] = useState<Record<string, string>>({});
  const [expectedExportWeights, setExpectedExportWeights] = useState<Record<string, string>>({});
  const totalOrderCount = lines.length;
  const totalMaterialCount = useMemo(
    () =>
      new Set(
        accountingShiftGroups.flatMap(group =>
          group.lines.map(material => `${normalizeProductCodeKey(material.code)}__${material.unit}`)
        )
      ).size,
    [accountingShiftGroups]
  );

  const buildActualExportLinesForShift = (shift: string) =>
    (accountingShiftGroups.find(group => group.shift === shift)?.lines ?? [])
      .map(material => {
        const key = productionPlanAccountingKey(shift, material);
        const packageQty = parsePercentInput(packageQuantities[key] ?? '');
        const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
        const manualExpected = expectedExportWeights[key];
        const actualQuantity =
          manualExpected !== undefined && manualExpected.trim() !== ''
            ? parsePercentInput(manualExpected)
            : parsePercentInput(calcProductionPlanExpectedWeight(packageQty, totalKg));
        const autoSuggested = parsePercentInput(calcProductionPlanExpectedWeight(packageQty, totalKg));
        const suggestedQuantity =
          manualExpected !== undefined && manualExpected.trim() !== ''
            ? parsePercentInput(manualExpected)
            : autoSuggested;
        return {
          code: material.code,
          name: material.name,
          unit: material.unit && material.unit !== '-' ? material.unit : '',
          quotaQuantity: material.totalQuantity,
          suggestedQuantity: Number.isFinite(suggestedQuantity) ? suggestedQuantity : 0,
          actualQuantity
        };
      })
      .filter(line => Number.isFinite(line.actualQuantity) && line.actualQuantity > 0);

  const allExportLines = useMemo(() => {
    const merged = new Map<string, ProductionPlanWarehouseExportLine>();

    accountingShiftGroups.forEach(group => {
      buildActualExportLinesForShift(group.shift).forEach(line => {
        const key = `${normalizeProductCodeKey(line.code)}__${line.unit}`;
        const existing = merged.get(key);
        if (existing) {
          existing.quotaQuantity = roundNplNumber(existing.quotaQuantity + line.quotaQuantity);
          existing.suggestedQuantity = roundNplNumber(existing.suggestedQuantity + line.suggestedQuantity);
          existing.actualQuantity = roundNplNumber(existing.actualQuantity + line.actualQuantity);
        } else {
          merged.set(key, { ...line });
        }
      });
    });

    return [...merged.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  }, [accountingShiftGroups, packageQuantities, expectedExportWeights, inventoryTotalKgByCode]);

  useEffect(() => {
    if (!open || accountingShiftGroups.length === 0) return;

    const suggestedPackages: Record<string, string> = {};
    const suggestedExpected: Record<string, string> = {};

    accountingShiftGroups.forEach(group => {
      group.lines.forEach(material => {
        const key = productionPlanAccountingKey(group.shift, material);
        const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
        const suggestedPackage = suggestProductionPlanPackageQuantity(material.totalQuantity, totalKg);

        if (suggestedPackage) {
          suggestedPackages[key] = suggestedPackage;
          const expected = calcProductionPlanExpectedWeight(parsePercentInput(suggestedPackage), totalKg);
          if (expected) suggestedExpected[key] = expected;
        }
      });
    });

    setPackageQuantities(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(suggestedPackages).forEach(([key, value]) => {
        if (next[key] === undefined) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setExpectedExportWeights(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(suggestedExpected).forEach(([key, value]) => {
        if (next[key] === undefined) {
          next[key] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [open, accountingShiftGroups, inventoryTotalKgByCode]);

  const handlePackageQuantityChange = (
    shift: string,
    material: ProductionPlanMaterialAccountingLine,
    value: string
  ) => {
    const key = productionPlanAccountingKey(shift, material);
    const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
    const expected = calcProductionPlanExpectedWeight(parsePercentInput(value), totalKg);

    setPackageQuantities(prev => ({
      ...prev,
      [key]: value
    }));
    setExpectedExportWeights(prev => ({
      ...prev,
      [key]: expected
    }));
  };

  const handleExpectedExportWeightChange = (
    shift: string,
    material: ProductionPlanMaterialAccountingLine,
    value: string
  ) => {
    const key = productionPlanAccountingKey(shift, material);

    setExpectedExportWeights(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-3">
      <div className="flex max-h-[94vh] w-full max-w-[min(98vw,1920px)] flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-lg font-black text-zinc-950">Hạch toán định mức NVL</h3>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              Tổng hợp NVL tạm tính theo từng ca từ {totalOrderCount} lệnh SX trong kế hoạch hiện tại.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lệnh SX</p>
              <p className="mt-1 text-xl font-black text-zinc-950">{totalOrderCount}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Số ca</p>
              <p className="mt-1 text-xl font-black text-sky-800">{accountingShiftGroups.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Mã NVL</p>
              <p className="mt-1 text-xl font-black text-emerald-800">{totalMaterialCount}</p>
            </div>
          </div>

          {isLoading ? (
            <p className="py-10 text-center text-sm font-semibold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tính định mức NVL...
            </p>
          ) : accountingShiftGroups.length === 0 || accountingShiftGroups.every(group => group.lines.length === 0) ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
              Chưa có NVL để hạch toán. Kiểm tra thành phần NPL trong danh mục sản phẩm.
            </p>
          ) : (
            <div className="space-y-3">
              {accountingShiftGroups.map(group => {
                const shiftExportLines = buildActualExportLinesForShift(group.shift);

                return (
                  <section key={group.shift} className="overflow-hidden rounded-xl border border-zinc-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-white">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-red-300">Ca làm việc</p>
                        <h4 className="text-lg font-black">{group.shift}</h4>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="rounded-full bg-white/10 px-2.5 py-1">{group.orderCount} lệnh SX</span>
                        <span className="rounded-full bg-white/10 px-2.5 py-1">{group.lines.length} mã NVL</span>
                        <button
                          type="button"
                          onClick={() => onExportWarehouseSlip(shiftExportLines, group.shift)}
                          disabled={isLoading || shiftExportLines.length === 0}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                          Xuất kho {group.shift}
                        </button>
                      </div>
                    </div>

                    {group.lines.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm font-semibold text-zinc-500">
                        Ca này chưa có NVL để hạch toán.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed text-left text-xs">
                          <colgroup>
                            <col className="w-[5%]" />
                            <col className="w-[10%]" />
                            <col className="w-[32%]" />
                            <col className="w-[8%]" />
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                          </colgroup>
                          <thead className="bg-zinc-100 text-[10px] uppercase tracking-wider text-zinc-700">
                            <tr>
                              <th className="px-2 py-1.5 font-black">STT</th>
                              <th className="px-2 py-1.5 font-black">Mã NVL</th>
                              <th className="px-2 py-1.5 font-black">Tên NVL</th>
                              <th className="px-2 py-1.5 font-black">ĐVT</th>
                              <th className="px-2 py-1.5 text-right font-black">Tổng định mức</th>
                              <th className="px-2 py-1.5 text-center font-black leading-tight">Số lượng xuất kiện</th>
                              <th className="px-2 py-1.5 text-right font-black leading-tight">Khối lượng xuất dự kiến</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {group.lines.map((material, index) => {
                              const totalKg = lookupInventoryTotalKg(material.code, inventoryTotalKgByCode);
                              const accountingKey = productionPlanAccountingKey(group.shift, material);
                              const packageQty = parsePercentInput(packageQuantities[accountingKey] ?? '');
                              const autoExpectedExportWeight = calcProductionPlanExpectedWeight(packageQty, totalKg);
                              const expectedExportDisplay =
                                expectedExportWeights[accountingKey] ?? autoExpectedExportWeight;

                              return (
                              <tr key={`${group.shift}-${material.code}-${material.unit}`} className="leading-tight">
                                <td className="px-2 py-1.5 text-center font-black text-emerald-700">{index + 1}</td>
                                <td className="truncate px-2 py-1.5 font-mono text-[11px] font-bold text-zinc-900" title={material.code}>
                                  {material.code}
                                </td>
                                <td className="truncate px-2 py-1.5 font-semibold text-zinc-800" title={material.name}>
                                  {material.name}
                                </td>
                                <td className="px-2 py-1.5 text-center text-zinc-700">{material.unit}</td>
                                <td className="px-2 py-1.5 text-right font-black text-[#ef1b2d]">
                                  {formatProductionOrderPrintQuantity(material.totalQuantity)}
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={packageQuantities[accountingKey] ?? ''}
                                    onChange={event =>
                                      handlePackageQuantityChange(group.shift, material, event.target.value)
                                    }
                                    title={
                                      totalKg
                                        ? `Tổng định mức ÷ ${formatNumber(totalKg, 2)} kg`
                                        : 'Chưa tìm thấy Tổng kg trong Kho NVL'
                                    }
                                    className="h-7 w-full min-w-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-center text-[11px] font-black text-emerald-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                    placeholder={totalKg ? 'Kiện' : '-'}
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={expectedExportDisplay}
                                    onChange={event =>
                                      handleExpectedExportWeightChange(group.shift, material, event.target.value)
                                    }
                                    title={
                                      totalKg && autoExpectedExportWeight
                                        ? `Tự tính: Số kiện × ${formatNumber(totalKg, 2)} kg`
                                        : 'Có thể nhập tay khối lượng xuất dự kiến'
                                    }
                                    className="h-7 w-full min-w-0 rounded-md border border-sky-200 bg-sky-50 px-2 text-right text-[11px] font-black text-sky-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                    placeholder="kg"
                                  />
                                </td>
                              </tr>
                            );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={() => onExportWarehouseSlip(allExportLines, 'Tất cả các ca')}
            disabled={isLoading || allExportLines.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Xuất kho NVL
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Tính lại
          </button>
        </div>
      </div>
    </div>
  );
}

type ProductionPlanQrLabel = {
  id: string;
  qrPayload: string;
  displayCode: string;
  displayName: string;
  orderCode: string;
  quantity: number;
};

function buildProductionPlanQrPayload(productCode: string, orderCode: string) {
  const maSp = productCode.trim();
  const maLenh = orderCode.trim();
  if (maSp && maLenh) return `${maSp}+${maLenh}`;
  return maSp || maLenh;
}

function buildProductionPlanQrLabels(
  lines: ProductionPlanLine[],
  selectedShift: string,
  products: ProductRow[]
): ProductionPlanQrLabel[] {
  const labels: ProductionPlanQrLabel[] = [];

  lines
    .filter(line => line.shift === selectedShift)
    .forEach(line => {
      const quantity = Math.max(0, Math.floor(parseProductionOrderQuantity(line.quantity)));
      if (quantity <= 0) return;

      const product = findProductByCode(products, line.productCode);
      const displayCode = product?.code || line.productCode || '-';
      const displayName = product?.name || line.productName || line.name || '-';
      const qrPayload = buildProductionPlanQrPayload(displayCode, line.code);

      for (let index = 0; index < quantity; index += 1) {
        labels.push({
          id: `${line.id}-${index}`,
          qrPayload,
          displayCode,
          displayName,
          orderCode: line.code,
          quantity: 1
        });
      }
    });

  return labels;
}

function ProductionPlanQrPrintSheet({
  labels,
  qrImages
}: {
  labels: ProductionPlanQrLabel[];
  qrImages: Record<string, string>;
}) {
  const footerRows: Array<{ label: string; value: string }> = [
    { label: 'Ca sản xuất', value: '' },
    { label: 'Công nhân sx', value: '' },
    { label: 'Ngày sản xuất', value: '' }
  ];

  return (
    <div className="production-plan-qr-print-sheet">
      <div className="production-plan-qr-print-page">
        {labels.map(label => (
          <div key={label.id} className="production-plan-qr-print-card">
            <p className="production-plan-qr-print-code">{label.displayCode}</p>
            <p className="production-plan-qr-print-name">{label.displayName}</p>
            <div className="production-plan-qr-print-code-wrap">
              {qrImages[label.qrPayload] && (
                <img src={qrImages[label.qrPayload]} alt={`QR ${label.qrPayload}`} />
              )}
            </div>
            <table className="production-plan-qr-print-footer">
              <tbody>
                {footerRows.map(row => (
                  <tr key={row.label}>
                    <th>{row.label}</th>
                    <td>
                      <span className="production-plan-qr-print-footer-field">{row.value}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductionPlanQrPrintModal({
  open,
  onClose,
  lines
}: {
  open: boolean;
  onClose: () => void;
  lines: ProductionPlanLine[];
}) {
  const shiftOptions = useMemo(
    () =>
      [...new Set(lines.map(line => line.shift).filter(shift => shift && shift !== '-'))].sort((a, b) =>
        a.localeCompare(b, 'vi')
      ),
    [lines]
  );
  const [selectedShift, setSelectedShift] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [formError, setFormError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [printLabels, setPrintLabels] = useState<ProductionPlanQrLabel[]>([]);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [pendingPrint, setPendingPrint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedShift(shiftOptions[0] ?? '');
    setFormError('');
    setPrintLabels([]);
    setQrImages({});
    setPendingPrint(false);
  }, [open, shiftOptions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setIsLoadingProducts(true);
      try {
        const productRes = await fetch('/api/san-pham?format=table');
        const productData = await productRes.json().catch(() => ({}));
        if (!productRes.ok) throw new Error(productData.error || 'Không thể tải danh sách sản phẩm.');
        if (!cancelled) {
          setProducts(normalizeProducts(productData));
        }
      } catch (error: any) {
        if (!cancelled) setFormError(error.message || 'Không thể tải dữ liệu in QR.');
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const previewGroups = useMemo(() => {
    if (!selectedShift) return [];

    return lines
      .filter(line => line.shift === selectedShift)
      .map(line => {
        const product = findProductByCode(products, line.productCode);
        const displayCode = product?.code || line.productCode || '-';
        const displayName = product?.name || line.productName || line.name || '-';
        const quantity = Math.max(0, Math.floor(parseProductionOrderQuantity(line.quantity)));

        return {
          id: line.id,
          orderCode: line.code,
          displayCode,
          displayName,
          quantity,
          qrPayload: buildProductionPlanQrPayload(displayCode, line.code)
        };
      })
      .filter(group => group.quantity > 0);
  }, [lines, selectedShift, products]);

  const totalQrCount = useMemo(
    () => previewGroups.reduce((sum, group) => sum + group.quantity, 0),
    [previewGroups]
  );

  useEffect(() => {
    if (!pendingPrint || printLabels.length === 0) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [pendingPrint, printLabels, qrImages]);

  const handlePrint = async () => {
    if (!selectedShift) {
      setFormError('Vui lòng chọn ca.');
      return;
    }

    const labels = buildProductionPlanQrLabels(lines, selectedShift, products);
    if (labels.length === 0) {
      setFormError('Không có sản phẩm nào trong ca đã chọn để in QR.');
      return;
    }

    setIsGenerating(true);
    setFormError('');

    try {
      const uniquePayloads = [...new Set(labels.map(label => label.qrPayload))];
      const imageEntries = await Promise.all(
        uniquePayloads.map(async payload => {
          const url = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: 220,
            color: {
              dark: '#111111',
              light: '#ffffff'
            }
          });
          return [payload, url] as const;
        })
      );

      setQrImages(Object.fromEntries(imageEntries));
      setPrintLabels(labels);
      setPendingPrint(true);
    } catch (error: any) {
      setFormError(error.message || 'Không thể tạo mã QR.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">In QR sản phẩm theo ca</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Số lượng tem QR = số lượng SP. Nội dung QR: mã SP + mã lệnh SX.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              Đóng
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {formError && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {formError}
              </p>
            )}

            <label className="mb-4 block space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chọn ca</span>
              <select
                value={selectedShift}
                onChange={event => setSelectedShift(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">-- Chọn ca --</option>
                {shiftOptions.map(shift => (
                  <option key={shift} value={shift}>
                    {shift}
                  </option>
                ))}
              </select>
            </label>

            {isLoadingProducts ? (
              <p className="py-6 text-center text-sm font-semibold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải sản phẩm...
              </p>
            ) : selectedShift && previewGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Ca này chưa có lệnh SX với số lượng hợp lệ.
              </p>
            ) : selectedShift ? (
              <div className="space-y-3">
                <p className="text-sm font-black text-emerald-800">
                  Sẽ in <span className="text-[#ef1b2d]">{totalQrCount}</span> tem QR
                </p>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3 py-2 font-black">Mã SP</th>
                        <th className="px-3 py-2 font-black">Tên sản phẩm</th>
                        <th className="px-3 py-2 font-black">Lệnh SX</th>
                        <th className="px-3 py-2 font-black">Nội dung QR</th>
                        <th className="px-3 py-2 text-right font-black">Số tem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {previewGroups.map(group => (
                        <tr key={group.id}>
                          <td className="px-3 py-2 font-mono font-bold text-zinc-800">{group.displayCode}</td>
                          <td className="px-3 py-2 text-zinc-700">{group.displayName}</td>
                          <td className="px-3 py-2 font-semibold text-zinc-800">{group.orderCode}</td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-600">{group.qrPayload}</td>
                          <td className="px-3 py-2 text-right font-black text-emerald-700">{group.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isGenerating || isLoadingProducts || !selectedShift || totalQrCount === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              In {totalQrCount > 0 ? `${totalQrCount} tem QR` : 'QR'}
            </button>
          </div>
        </div>
      </div>

      {pendingPrint && printLabels.length > 0 && (
        <ProductionPlanQrPrintSheet labels={printLabels} qrImages={qrImages} />
      )}
    </>
  );
}

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function buildProductionPlanSaveItems(lines: ProductionPlanLine[]) {
  return lines.map((line, index) => {
    const products =
      line.products.length > 0
        ? line.products
        : [
            {
              productCode: line.productCode,
              productName: line.productName,
              unit: line.unit,
              quantity: line.quantity
            }
          ];

    return {
      id: line.id,
      thu_tu_uu_tien: index + 1,
      vi_tri: line.position && line.position !== '-' ? line.position : null,
      ghi_chu: line.note.trim() || null,
      ma_lenh_sx: line.code,
      ma_don_hang: line.orderRef && line.orderRef !== '-' ? line.orderRef : '',
      ca: line.shift && line.shift !== '-' ? line.shift : '',
      may: line.position && line.position !== '-' ? line.position : '',
      nhan_su: line.staff && line.staff !== '-' ? line.staff : '',
      san_pham: products.map(product => ({
        ma_sp: product.productCode,
        ten_sp: product.productName,
        don_vi: product.unit && product.unit !== '-' ? product.unit : '',
        so_luong: parseProductionOrderQuantity(product.quantity)
      }))
    };
  });
}

type ProductionPlanHistorySummary = {
  id: string;
  code: string;
  planDate: string;
  status: string;
  orderCount: number;
  note: string;
  createdBy: string;
  createdAt: string;
};

type ProductionPlanHistoryLine = {
  id: string;
  priority: number;
  position: string;
  note: string;
  orderCode: string;
  orderRef: string;
  shift: string;
  machine: string;
  staff: string;
  products: OrderProductLine[];
};

function normalizeProductionPlanHistory(data: unknown): ProductionPlanHistorySummary[] {
  if (!data || typeof data !== 'object') return [];
  const plans = (data as { plans?: unknown }).plans;
  if (!Array.isArray(plans)) return [];

  return plans
    .map((item): ProductionPlanHistorySummary | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? '').trim();
      if (!id) return null;

      return {
        id,
        code: pickText(record, ['ma_ke_hoach', 'code'], '-'),
        planDate: formatCell(record.ngay_ke_hoach ?? record.planDate),
        status: pickText(record, ['trang_thai', 'status'], '-'),
        orderCount: Number(record.so_lenh ?? record.orderCount ?? 0) || 0,
        note: pickText(record, ['ghi_chu', 'note'], ''),
        createdBy: pickText(record, ['nguoi_lap', 'createdBy'], ''),
        createdAt: formatCell(record.created_at ?? record.createdAt)
      };
    })
    .filter((row): row is ProductionPlanHistorySummary => Boolean(row));
}

function normalizeProductionPlanHistoryLines(data: unknown): ProductionPlanHistoryLine[] {
  if (!data || typeof data !== 'object') return [];
  const lines = (data as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];

  return lines
    .map((item): ProductionPlanHistoryLine | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const products = parseOrderProductsFromRecord({
        san_pham: record.san_pham,
        ma_hang: record.ma_lenh_sx,
        ten_hang: record.ten_hang,
        don_vi: record.don_vi,
        so_luong: record.so_luong
      });

      return {
        id: String(record.id ?? '').trim() || `${record.ma_lenh_sx}-${record.thu_tu_uu_tien}`,
        priority: Number(record.thu_tu_uu_tien ?? 0) || 0,
        position: pickText(record, ['vi_tri', 'position'], '-'),
        note: pickText(record, ['ghi_chu', 'note'], ''),
        orderCode: pickText(record, ['ma_lenh_sx', 'code'], '-'),
        orderRef: pickText(record, ['ma_don_hang', 'orderRef'], '-'),
        shift: pickText(record, ['ca', 'shift'], '-'),
        machine: pickText(record, ['may', 'machine'], '-'),
        staff: pickText(record, ['nhan_su', 'staff'], '-'),
        products
      };
    })
    .filter((row): row is ProductionPlanHistoryLine => Boolean(row))
    .sort((a, b) => a.priority - b.priority);
}

function formatProductionPlanHistoryProducts(products: OrderProductLine[]) {
  if (products.length === 0) return '-';
  const codes = products.map(product => product.productCode.trim()).filter(code => code && code !== '-');
  return codes.length > 0 ? codes.join(', ') : '-';
}

function ProductionPlanHistoryPanel({ onBack }: { onBack: () => void }) {
  const [filterDate, setFilterDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [plans, setPlans] = useState<ProductionPlanHistorySummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedLines, setSelectedLines] = useState<ProductionPlanHistoryLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadPlans = async (options?: { ngay?: string; tuNgay?: string; denNgay?: string }) => {
    setIsLoading(true);
    setLoadError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (options?.ngay) {
        params.set('ngay', options.ngay);
      } else {
        if (options?.tuNgay) params.set('tu_ngay', options.tuNgay);
        if (options?.denNgay) params.set('den_ngay', options.denNgay);
      }

      const res = await fetch(`/api/ke-hoach-sx?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải kế hoạch sản xuất.');
      }

      const nextPlans = normalizeProductionPlanHistory(data);
      setPlans(nextPlans);
      if (selectedPlanId && !nextPlans.some(plan => plan.id === selectedPlanId)) {
        setSelectedPlanId('');
        setSelectedLines([]);
      }
    } catch (error: any) {
      setPlans([]);
      setLoadError(error.message || 'Không thể tải kế hoạch sản xuất.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlanDetail = async (planId: string) => {
    setIsLoadingDetail(true);
    setLoadError('');

    try {
      const res = await fetch(`/api/ke-hoach-sx?id=${encodeURIComponent(planId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải chi tiết kế hoạch.');
      }

      setSelectedPlanId(planId);
      setSelectedLines(normalizeProductionPlanHistoryLines(data));
    } catch (error: any) {
      setSelectedLines([]);
      setLoadError(error.message || 'Không thể tải chi tiết kế hoạch.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? null;
  const plansByDate = useMemo(() => {
    const map = new Map<string, ProductionPlanHistorySummary[]>();
    plans.forEach(plan => {
      const key = plan.planDate && plan.planDate !== '-' ? plan.planDate : 'Chưa có ngày';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(plan);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0], 'vi'));
  }, [plans]);

  const applyFilters = () => {
    if (filterDate) {
      void loadPlans({ ngay: filterDate });
      return;
    }
    void loadPlans({ tuNgay: fromDate, denNgay: toDate });
  };

  const resetToToday = () => {
    const today = todayDateInputValue();
    setFilterDate(today);
    setFromDate('');
    setToDate('');
    void loadPlans({ ngay: today });
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Báo cáo sản xuất</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Kế hoạch sản xuất theo ngày</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Tra cứu snapshot kế hoạch đã lưu từ bảng ke_hoach_san_xuat.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Bản ghi', plans.length],
              ['Ngày có KH', plansByDate.length],
              ['Đang xem', selectedPlan ? 1 : 0]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Theo ngày</span>
            <input
              type="date"
              value={filterDate}
              onChange={event => {
                setFilterDate(event.target.value);
                setFromDate('');
                setToDate('');
              }}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Từ ngày</span>
            <input
              type="date"
              value={fromDate}
              onChange={event => {
                setFromDate(event.target.value);
                setFilterDate('');
              }}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đến ngày</span>
            <input
              type="date"
              value={toDate}
              onChange={event => {
                setToDate(event.target.value);
                setFilterDate('');
              }}
              className="h-10 rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
            />
          </label>
          <button
            type="button"
            onClick={applyFilters}
            disabled={isLoading}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Lọc
          </button>
          <button
            type="button"
            onClick={resetToToday}
            disabled={isLoading}
            className="inline-flex h-10 items-center rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hôm nay
          </button>
        </div>

        {loadError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {loadError}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h3 className="text-sm font-black text-zinc-950">Danh sách kế hoạch</h3>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải...
              </p>
            ) : plans.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Chưa có kế hoạch đã lưu. Lưu từ modal Kế hoạch sản xuất hoặc chạy supabase-ke-hoach-san-xuat.sql.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {plansByDate.map(([date, datePlans]) => (
                  <div key={date}>
                    <div className="sticky top-0 bg-zinc-950 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-300">
                      {date}
                    </div>
                    {datePlans.map(plan => (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => void loadPlanDetail(plan.id)}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-red-50/50 ${
                          selectedPlanId === plan.id ? 'bg-emerald-50' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black text-zinc-950">{plan.code}</p>
                          <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                            {plan.orderCount} lệnh SX · {plan.status}
                          </p>
                          {plan.note ? (
                            <p className="mt-1 text-xs font-medium text-zinc-500">{plan.note}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h3 className="text-sm font-black text-zinc-950">Chi tiết kế hoạch</h3>
            {selectedPlan ? (
              <p className="mt-1 text-xs font-semibold text-zinc-600">
                {selectedPlan.code} · {selectedPlan.planDate} · {selectedPlan.orderCount} lệnh
              </p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-zinc-500">Chọn một bản ghi bên trái để xem chi tiết.</p>
            )}
          </div>

          {!selectedPlan ? (
            <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-500">Chưa chọn kế hoạch.</p>
          ) : isLoadingDetail ? (
            <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải chi tiết...
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                  <tr>
                    <th className="px-3 py-2 font-black">STT</th>
                    <th className="px-3 py-2 font-black">Mã lệnh</th>
                    <th className="px-3 py-2 font-black">Máy</th>
                    <th className="px-3 py-2 font-black">Ca</th>
                    <th className="px-3 py-2 font-black">Nhân sự</th>
                    <th className="px-3 py-2 font-black">Sản phẩm</th>
                    <th className="px-3 py-2 font-black">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedLines.map(line => (
                    <tr key={line.id}>
                      <td className="px-3 py-2 font-black text-emerald-700">{line.priority}</td>
                      <td className="px-3 py-2">
                        <p className="font-mono font-bold text-zinc-900">{line.orderCode}</p>
                        {line.orderRef !== '-' ? (
                          <p className="text-xs font-semibold text-zinc-500">{line.orderRef}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-zinc-700">{line.machine !== '-' ? line.machine : line.position}</td>
                      <td className="px-3 py-2 text-zinc-700">{line.shift}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.staff}</td>
                      <td className="px-3 py-2 text-zinc-800">{formatProductionPlanHistoryProducts(line.products)}</td>
                      <td className="px-3 py-2 text-zinc-600">{line.note || '-'}</td>
                    </tr>
                  ))}
                  {selectedLines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center font-semibold text-zinc-500">
                        Kế hoạch này chưa có dòng chi tiết.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProductionPlanModal({
  open,
  onClose,
  onSaved,
  onOpenWarehouseSlip,
  productionOrders,
  machines
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onOpenWarehouseSlip: () => void;
  productionOrders: ProductionOrderRow[];
  machines: MachineRow[];
}) {
  const [planLines, setPlanLines] = useState<ProductionPlanLine[]>([]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [pendingNvlPrint, setPendingNvlPrint] = useState(false);
  const [showNvlPrintSheet, setShowNvlPrintSheet] = useState(false);
  const [isLoadingPlanPrint, setIsLoadingPlanPrint] = useState(false);
  const [isLoadingNvlPrint, setIsLoadingNvlPrint] = useState(false);
  const [printMaterialsByLine, setPrintMaterialsByLine] = useState<Record<string, ProductionOrderMaterialLine[]>>({});
  const [nvlPrintMaterialsByLine, setNvlPrintMaterialsByLine] = useState<
    Record<string, ProductionOrderMaterialLine[]>
  >({});
  const [showMaterialAccountingModal, setShowMaterialAccountingModal] = useState(false);
  const [isLoadingMaterialAccounting, setIsLoadingMaterialAccounting] = useState(false);
  const [materialAccountingError, setMaterialAccountingError] = useState('');
  const [accountingMaterialsByLine, setAccountingMaterialsByLine] = useState<Record<string, ProductionOrderMaterialLine[]>>({});
  const [accountingInventoryMaterials, setAccountingInventoryMaterials] = useState<MaterialRow[]>([]);
  const [showQrPrintModal, setShowQrPrintModal] = useState(false);
  const [planDate, setPlanDate] = useState(todayDateInputValue());
  const [planHeaderNote, setPlanHeaderNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setPlanLines(buildInitialProductionPlanLines(productionOrders, machines));
    setFormError('');
    setDragIndex(null);
    setPendingPrint(false);
    setPendingNvlPrint(false);
    setShowNvlPrintSheet(false);
    setIsLoadingPlanPrint(false);
    setIsLoadingNvlPrint(false);
    setPrintMaterialsByLine({});
    setNvlPrintMaterialsByLine({});
    setShowMaterialAccountingModal(false);
    setIsLoadingMaterialAccounting(false);
    setMaterialAccountingError('');
    setAccountingMaterialsByLine({});
    setAccountingInventoryMaterials([]);
    setShowQrPrintModal(false);
    setPlanDate(todayDateInputValue());
    setPlanHeaderNote('');
  }, [open, productionOrders, machines]);

  const displayLines = useMemo(
    () => enrichProductionPlanLines(planLines, productionOrders, machines),
    [planLines, productionOrders, machines]
  );

  useEffect(() => {
    if (!pendingPrint || displayLines.length === 0) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [pendingPrint, displayLines]);

  useEffect(() => {
    if (!pendingNvlPrint || displayLines.length === 0) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingNvlPrint(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [pendingNvlPrint, displayLines]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPendingPrint(false);
      setPendingNvlPrint(false);
      setShowNvlPrintSheet(false);
      setPrintMaterialsByLine({});
      setNvlPrintMaterialsByLine({});
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const reorderLine = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setPlanLines(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((line, index) => ({ ...line, priority: index + 1 }));
    });
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    reorderLine(index, index + direction);
  };

  const handleSave = async () => {
    if (displayLines.length === 0) {
      setFormError('Không có lệnh SX đang chờ/đang sản xuất để lập kế hoạch.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/ke-hoach-sx', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay_ke_hoach: planDate,
          ghi_chu: planHeaderNote.trim(),
          items: buildProductionPlanSaveItems(displayLines)
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể lưu kế hoạch sản xuất.');
      }

      await onSaved();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu kế hoạch sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async () => {
    if (displayLines.length === 0) return;
    setIsLoadingPlanPrint(true);
    setFormError('');

    try {
      setPrintMaterialsByLine(await loadProductionPlanMaterials(displayLines));
      setPendingPrint(true);
    } catch (error: any) {
      setFormError(error.message || 'Không thể tải thành phần sản phẩm để in kế hoạch.');
    } finally {
      setIsLoadingPlanPrint(false);
    }
  };

  const handlePrintNvl = async () => {
    if (displayLines.length === 0) return;
    setIsLoadingNvlPrint(true);
    setFormError('');

    try {
      setNvlPrintMaterialsByLine(await loadProductionPlanMaterials(displayLines));
      setShowNvlPrintSheet(true);
      setPendingNvlPrint(true);
    } catch (error: any) {
      setFormError(error.message || 'Không thể tải thành phần NVL để in phiếu.');
    } finally {
      setIsLoadingNvlPrint(false);
    }
  };

  const loadMaterialAccounting = async () => {
    if (displayLines.length === 0) return;
    setIsLoadingMaterialAccounting(true);
    setMaterialAccountingError('');

    try {
      const [materialsByLine, inventoryRes] = await Promise.all([
        loadProductionPlanMaterials(displayLines),
        fetch('/api/kho-nvl')
      ]);
      const inventoryData = await inventoryRes.json().catch(() => ({}));
      if (!inventoryRes.ok) {
        throw new Error(inventoryData.error || 'Không thể tải Kho NVL để tra Tổng kg.');
      }

      setAccountingMaterialsByLine(materialsByLine);
      setAccountingInventoryMaterials(normalizeMaterialsInventory(inventoryData));
    } catch (error: any) {
      setMaterialAccountingError(error.message || 'Không thể tải thành phần sản phẩm để hạch toán NVL.');
    } finally {
      setIsLoadingMaterialAccounting(false);
    }
  };

  const handleOpenMaterialAccounting = () => {
    if (displayLines.length === 0) return;
    setShowMaterialAccountingModal(true);
    void loadMaterialAccounting();
  };

  const handleExportWarehouseSlip = (materialLines: ProductionPlanWarehouseExportLine[], shift: string) => {
    if (materialLines.length === 0) {
      setMaterialAccountingError('Vui lòng nhập khối lượng xuất dự kiến lớn hơn 0 cho ít nhất một NVL trong ca này.');
      return;
    }

    const shiftOrderCount =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? displayLines.length
        : displayLines.filter(
            line => normalizeProductionPlanShift(line.shift) === normalizeProductionPlanShift(shift)
          ).length;

    const shiftLines =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? displayLines
        : displayLines.filter(
            line => normalizeProductionPlanShift(line.shift) === normalizeProductionPlanShift(shift)
          );

    const resolvedShift =
      normalizeProductionPlanShift(shift) === 'Tất cả các ca'
        ? [...new Set(shiftLines.map(line => normalizeProductionPlanShift(line.shift)).filter(Boolean))].join(', ')
        : normalizeProductionPlanShift(shift);

    const draft: WarehouseSlipPrefillDraft = {
      slipType: 'xuat',
      warehouseKind: 'nvl',
      slipDate: planDate,
      reason: resolvedShift ? `Xuất NVL theo kế hoạch sản xuất - ${resolvedShift}` : 'Xuất NVL theo kế hoạch sản xuất',
      note: resolvedShift
        ? `Tạo từ hạch toán định mức NVL (${resolvedShift}, ${shiftOrderCount} lệnh SX).`
        : `Tạo từ hạch toán định mức NVL (${shiftOrderCount} lệnh SX).`,
      createdBy: '',
      productionOrderRef: [...new Set(shiftLines.map(line => line.code).filter(code => code && code !== '-'))].join(
        ', '
      ),
      machine: [...new Set(shiftLines.map(line => line.position).filter(value => value && value !== '-'))].join(', '),
      shift: resolvedShift,
      recipient: [...new Set(shiftLines.map(line => line.staff).filter(value => value && value !== '-'))].join(', '),
      lines: materialLines.map(line => ({
        code: line.code,
        name: line.name,
        unit: line.unit,
        quantity: String(roundNplNumber(line.actualQuantity)),
        quotaQuantity: String(roundNplNumber(line.quotaQuantity)),
        suggestedQuantity: String(roundNplNumber(line.suggestedQuantity)),
        unitPrice: '',
        lineNote: ''
      }))
    };

    localStorage.setItem(STORAGE_WAREHOUSE_SLIP_DRAFT_KEY, JSON.stringify(draft));
    setShowMaterialAccountingModal(false);
    onClose();
    onOpenWarehouseSlip();
  };

  const updateLineNote = (lineId: string, note: string) => {
    setPlanLines(prev => prev.map(line => (line.id === lineId ? { ...line, note } : line)));
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">Kế hoạch sản xuất</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Máy, ca, nhân sự và sản phẩm lấy từ lệnh SX. Kéo thả hoặc dùng mũi tên để sắp xếp ưu tiên.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              Đóng
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
            {formError && (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {formError}
              </p>
            )}

            <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày kế hoạch</span>
                <input
                  type="date"
                  value={planDate}
                  onChange={event => setPlanDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú kế hoạch</span>
                <input
                  type="text"
                  value={planHeaderNote}
                  onChange={event => setPlanHeaderNote(event.target.value)}
                  placeholder="Ghi chú chung khi lưu snapshot"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            {displayLines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Không có lệnh SX đang chờ hoặc đang sản xuất.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="bg-zinc-950 text-[11px] uppercase tracking-wider text-white">
                    <tr>
                      <th className="px-2 py-2 font-black">STT</th>
                      <th className="px-2 py-2 font-black">Tên máy</th>
                      <th className="px-2 py-2 font-black">Ca làm việc</th>
                      <th className="px-2 py-2 font-black">Nhân sự</th>
                      <th className="px-2 py-2 font-black">Lệnh sản xuất</th>
                      <th className="px-2 py-2 font-black">Ghi chú</th>
                      <th className="px-2 py-2 font-black">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {displayLines.map((line, index) => (
                      <tr
                        key={line.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={event => event.preventDefault()}
                        onDrop={() => {
                          if (dragIndex === null) return;
                          reorderLine(dragIndex, index);
                          setDragIndex(null);
                        }}
                        className={dragIndex === index ? 'bg-emerald-50' : 'hover:bg-zinc-50'}
                      >
                        <td className="px-2 py-2 font-black text-emerald-700">{index + 1}</td>
                        <td className="px-2 py-2 font-semibold text-zinc-800">{line.position || '-'}</td>
                        <td className="px-2 py-2 text-zinc-700">{line.shift && line.shift !== '-' ? line.shift : '-'}</td>
                        <td className="px-2 py-2 text-zinc-600">{line.staff && line.staff !== '-' ? line.staff : '-'}</td>
                        <td className="px-2 py-2 font-mono text-xs font-bold text-zinc-900">
                          {formatProductionPlanProductCodes(line)}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <textarea
                            value={line.note}
                            onChange={event => updateLineNote(line.id, event.target.value)}
                            rows={3}
                            className="w-full min-w-[220px] rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                            placeholder="Nhập ghi chú cho lệnh này"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveLine(index, -1)}
                              disabled={index === 0}
                              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                              title="Lên"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveLine(index, 1)}
                              disabled={index === displayLines.length - 1}
                              className="flex h-7 w-7 items-center justify-center rounded border border-zinc-200 text-zinc-600 disabled:opacity-40"
                              title="Xuống"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <span className="flex h-7 w-7 items-center justify-center text-zinc-400">
                              <GripVertical className="h-4 w-4" />
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={handleOpenMaterialAccounting}
              disabled={displayLines.length === 0 || isLoadingMaterialAccounting}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMaterialAccounting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Định mức NVL
            </button>
            <button
              type="button"
              onClick={() => setShowQrPrintModal(true)}
              disabled={displayLines.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" />
              In QR
            </button>
            <button
              type="button"
              onClick={handlePrintNvl}
              disabled={displayLines.length === 0 || isLoadingNvlPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-extrabold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingNvlPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In phiếu NVL
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={displayLines.length === 0 || isLoadingPlanPrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingPlanPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In kế hoạch
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || displayLines.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Lưu kế hoạch SX
            </button>
          </div>
        </div>
      </div>

      {pendingPrint && displayLines.length > 0 && (
        <ProductionPlanPrintSheet lines={displayLines} materialsByLine={printMaterialsByLine} />
      )}

      {showNvlPrintSheet && displayLines.length > 0 && (
        <ProductionPlanNvlPrintSheet
          planDate={planDate}
          planNote={planHeaderNote}
          shiftGroups={buildProductionPlanNvlPrintGroups(displayLines, nvlPrintMaterialsByLine)}
        />
      )}

      <ProductionPlanMaterialAccountingModal
        open={showMaterialAccountingModal}
        onClose={() => setShowMaterialAccountingModal(false)}
        lines={displayLines}
        materialsByLine={accountingMaterialsByLine}
        inventoryMaterials={accountingInventoryMaterials}
        isLoading={isLoadingMaterialAccounting}
        error={materialAccountingError}
        onReload={loadMaterialAccounting}
        onExportWarehouseSlip={handleExportWarehouseSlip}
      />

      <ProductionPlanQrPrintModal
        open={showQrPrintModal}
        onClose={() => setShowQrPrintModal(false)}
        lines={displayLines}
      />
    </>
  );
}

function normalizeProductionOrders(data: unknown): ProductionOrderRow[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { productionOrders?: unknown }).productionOrders;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((item): ProductionOrderRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_lenh_sx', 'ma', 'code', 'so_lenh'], '');
      const name = pickText(record, ['ten_lenh_sx', 'ten', 'name', 'tieu_de'], '');
      const productCode = pickText(record, ['ma_hang', 'ma_sp', 'product_code'], '');
      const productName = pickText(record, ['ten_hang', 'ten_sp', 'product_name'], '');
      if (!code && !name && !productCode && !productName) return null;

      const products = parseOrderProductsFromRecord(record);
      const summary = summarizeOrderProducts(products);

      return {
        id: String(record.id ?? '').trim() || code || name || summary.productCode,
        code,
        name,
        productCode: summary.productCode,
        productName: summary.productName,
        quantity: summary.quantity,
        unit: summary.unit,
        products,
        status: pickText(record, ['trang_thai', 'status', 'tinh_trang'], '-'),
        customer: pickText(record, ['khach_hang', 'customer', 'ten_khach_hang'], '-'),
        orderRef: pickText(record, ['ma_don_hang', 'don_hang', 'order_code'], '-'),
        startDate: formatCell(
          record.ngay_gio_bat_dau ?? record.ngay_bat_dau ?? record.ngay_san_xuat ?? record.ngay_sx ?? record.start_date
        ),
        endDate: formatCell(record.ngay_gio_ket_thuc ?? record.ngay_ket_thuc ?? record.end_date),
        machine: pickText(record, ['may', 'ten_may', 'ma_may', 'machine'], '-'),
        shift: pickText(record, ['ca', 'shift'], '-'),
        staff: pickText(record, ['nhan_su', 'staff', 'nhan_vien'], '-'),
        note: pickText(record, ['ghi_chu', 'note', 'mo_ta'], ''),
        position: pickText(record, ['vi_tri', 'position'], '-'),
        priority: Number(record.thu_tu_uu_tien ?? record.priority ?? 0) || 0
      };
    })
    .filter((row): row is ProductionOrderRow => Boolean(row));
}

interface ProductionOrderMaterialLine {
  code: string;
  name: string;
  normLabel: string;
  proposedQuantity: number;
  unit: string;
}

function formatProductionOrderNormLabel(item: ProductNplItem): string {
  if (item.amountType === 'quantity') {
    const unitSuffix = item.unit && item.unit !== '-' ? ` ${item.unit}` : '';
    return `${formatNumber(item.quantity ?? 0, 2)}${unitSuffix}/TP`;
  }
  return `${formatPercent(item.percent ?? 0)}%`;
}

function formatProductionOrderFinishedWeight(
  orderQuantity: number,
  product?: Pick<ProductRow, 'totalWeight'> | null
) {
  const unitWeight = parseProductSpecNumber(product?.totalWeight ?? '');
  if (unitWeight === null || unitWeight <= 0 || orderQuantity <= 0) return '-';
  return formatProductionOrderPrintQuantity(roundNplNumber(unitWeight * orderQuantity));
}

function parseProductionOrderQuantity(value: string) {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatProductionOrderPrintQuantity(value: string | number, fractionDigits = 2) {
  const numeric = typeof value === 'number' ? value : parseProductionOrderQuantity(String(value));
  return formatNumber(numeric, fractionDigits);
}

function buildProductionOrderMaterialProposal(
  orderQuantity: number,
  items: ProductNplItem[],
  product?: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'> | null
): ProductionOrderMaterialLine[] {
  const materialBaseKg = resolveProductMaterialBaseKg(product);

  return items.map(item => {
    const proposedQuantity =
      item.amountType === 'quantity'
        ? roundNplNumber((item.quantity ?? 0) * orderQuantity)
        : materialBaseKg > 0
          ? roundNplNumber((materialBaseKg * orderQuantity * (item.percent ?? 0)) / 100)
          : roundNplNumber((orderQuantity * (item.percent ?? 0)) / 100);

    return {
      code: item.code,
      name: item.name || item.code,
      normLabel: formatProductionOrderNormLabel(item),
      proposedQuantity,
      unit:
        item.amountType === 'percent'
          ? 'kg'
          : item.unit && item.unit !== '-'
            ? item.unit
            : ''
    };
  });
}

let productNplCache: ProductRow[] | null = null;
let productNplCachePromise: Promise<ProductRow[]> | null = null;

async function loadProductsForPrint(): Promise<ProductRow[]> {
  if (productNplCache) return productNplCache;
  if (productNplCachePromise) return productNplCachePromise;

  productNplCachePromise = fetch('/api/san-pham?format=table')
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải danh sách sản phẩm.');
      }
      return normalizeProducts(data);
    })
    .then(products => {
      productNplCache = products;
      return products;
    })
    .finally(() => {
      productNplCachePromise = null;
    });

  return productNplCachePromise;
}

async function fetchProductPrintData(
  productCode: string
): Promise<{ items: ProductNplItem[]; product: ProductRow | null }> {
  const codes = productCode
    .split(',')
    .map(code => code.trim())
    .filter(Boolean);
  if (codes.length === 0) return { items: [], product: null };

  const products = await loadProductsForPrint();
  const primaryProduct = findProductByCode(products, codes[0]) ?? null;
  const merged = new Map<string, ProductNplItem>();

  codes.forEach(code => {
    const product = findProductByCode(products, code);
    (product?.nplItems ?? []).forEach(item => {
      const key = `${item.code}__${item.amountType}__${item.unit}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        return;
      }

      if (item.amountType === 'quantity') {
        existing.quantity = roundNplNumber((existing.quantity ?? 0) + (item.quantity ?? 0));
      } else {
        existing.percent = roundNplNumber((existing.percent ?? 0) + (item.percent ?? 0));
      }
    });
  });

  return { items: [...merged.values()], product: primaryProduct };
}

async function fetchProductNplItems(productCode: string): Promise<ProductNplItem[]> {
  const { items } = await fetchProductPrintData(productCode);
  return items;
}

let machinePrintCache: MachineRow[] | null = null;

async function resolveProductionOrderMachineLabel(machineValue: string): Promise<string> {
  const value = machineValue.trim();
  if (!value || value === '-') return '-';

  if (!machinePrintCache) {
    const res = await fetch('/api/danh-sach-may');
    const data = await res.json().catch(() => ({}));
    machinePrintCache = res.ok ? normalizeMachines(data) : [];
  }

  const match = machinePrintCache.find(
    machine => machine.code === value || machine.name === value || machine.id === value
  );
  return match?.name || value;
}

function formatProductionOrderPrintDate(value?: string) {
  if (!value || value === '-') {
    return new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  return value;
}

function ProductionOrderPrintSheet({
  order,
  materials,
  machineLabel,
  product,
  shiftSettings = []
}: {
  order: ProductionOrderRow;
  materials: ProductionOrderMaterialLine[];
  machineLabel?: string;
  product?: ProductRow | null;
  shiftSettings?: ProductionOrderLookupSetting[];
}) {
  const printDate = formatProductionOrderPrintDate(order.startDate);
  const orderQuantity = parseProductionOrderQuantity(order.quantity);
  const shiftLabel = formatProductionOrderShiftLabel(order.shift, shiftSettings);
  const productLines = getProductionOrderProductLines(order);
  const staffLabel =
    order.staff && order.staff !== '-'
      ? order.staff.replace(/,/g, ' + ')
      : '-';
  const machineName =
    machineLabel && machineLabel !== '-'
      ? machineLabel
      : order.machine && order.machine !== '-'
        ? order.machine
        : '-';
  const costObject = machineName;

  return (
    <div className="production-order-print-sheet">
      <div className="production-order-print-doc">
        <header className="production-order-print-letterhead">
          <img
            src={vietNhatLogoUrl}
            alt="Logo Viet Nhat IPT"
            className="production-order-print-logo"
          />
          <div className="production-order-print-company">
            <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
          </div>
        </header>

        <h1 className="production-order-print-title">LỆNH SẢN XUẤT</h1>

        <div className="production-order-print-meta">
          <span>Số: {order.code || '-'}</span>
          <span>Ngày: {printDate}</span>
        </div>

        <table className="production-order-print-grid-table production-order-print-params-table">
          <thead>
            <tr>
              <th>Ca</th>
              <th>Máy</th>
              <th>Nhân sự phụ trách</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="production-order-print-center production-order-print-shift-cell">{shiftLabel}</td>
              <td>{machineName}</td>
              <td>{staffLabel}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">1. Thành phẩm:</h2>
        <table className="production-order-print-grid-table production-order-print-product-table">
          <thead>
            <tr>
              <th>Mã thành phẩm</th>
              <th>Tên thành phẩm</th>
              <th>ĐVT</th>
              <th>Số lượng</th>
              <th>Đối tượng THCP</th>
            </tr>
          </thead>
          <tbody>
            {productLines.length > 0 ? (
              productLines.map((line, index) => (
                <tr key={`${line.productCode}-${index}`}>
                  <td>{line.productCode || '-'}</td>
                  <td className="production-order-print-product-name-cell">{line.productName || '-'}</td>
                  <td className="production-order-print-center">{line.unit && line.unit !== '-' ? line.unit : '-'}</td>
                  <td className="production-order-print-right">{formatProductionOrderPrintQuantity(line.quantity)}</td>
                  <td>{costObject}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>{order.productCode || '-'}</td>
                <td className="production-order-print-product-name-cell">{order.productName || '-'}</td>
                <td className="production-order-print-center">{order.unit && order.unit !== '-' ? order.unit : '-'}</td>
                <td className="production-order-print-right">{formatProductionOrderPrintQuantity(order.quantity)}</td>
                <td>{costObject}</td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="production-order-print-section-title">2. Định mức nguyên vật liệu</h2>
        {materials.length === 0 ? (
          <p className="production-order-print-materials-empty">
            Sản phẩm chưa khai báo thành phần NPL. Vào Sản phẩm → tab Thành phần để nhập định mức.
          </p>
        ) : (
          <table className="production-order-print-grid-table production-order-print-materials-table">
            <thead>
              <tr>
                <th>Mã nguyên vật liệu</th>
                <th>Tên nguyên vật liệu</th>
                <th>ĐVT</th>
                <th>Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((line, index) => (
                <tr key={`${line.code}-${index}`}>
                  <td>{line.code}</td>
                  <td>{line.name}</td>
                  <td className="production-order-print-center">{line.unit || '-'}</td>
                  <td className="production-order-print-right">{formatProductionOrderPrintQuantity(line.proposedQuantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="production-order-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Trưởng ca</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Thủ kho</p>
            <span>(Ký, họ tên)</span>
          </div>
          <div>
            <p>Kế toán</p>
            <span>(Ký, họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

type PrintableProductionOrder = {
  order: ProductionOrderRow;
  materials: ProductionOrderMaterialLine[];
  machineLabel: string;
  product: ProductRow | null;
};

function ProductionOrderBatchPrintSheets({
  items,
  shiftSettings = []
}: {
  items: PrintableProductionOrder[];
  shiftSettings?: ProductionOrderLookupSetting[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="production-order-print-batch">
      {items.map(item => (
        <div key={item.order.id} className="production-order-print-page">
          <ProductionOrderPrintSheet
            order={item.order}
            materials={item.materials}
            machineLabel={item.machineLabel}
            product={item.product}
            shiftSettings={shiftSettings}
          />
        </div>
      ))}
    </div>
  );
}

function useProductionOrderPrint() {
  const [printingOrder, setPrintingOrder] = useState<ProductionOrderRow | null>(null);
  const [printingMaterials, setPrintingMaterials] = useState<ProductionOrderMaterialLine[]>([]);
  const [printingProduct, setPrintingProduct] = useState<ProductRow | null>(null);
  const [printingMachineLabel, setPrintingMachineLabel] = useState('');
  const [shiftSettings, setShiftSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [isLoadingPrint, setIsLoadingPrint] = useState(false);

  useEffect(() => {
    fetch('/api/cai-dat')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setShiftSettings(data ? mapProductionOrderSettings(data) : []))
      .catch(() => setShiftSettings([]));
  }, []);

  const printProductionOrder = async (order: ProductionOrderRow) => {
    setIsLoadingPrint(true);
    try {
      const [{ items, product }, machineLabel] = await Promise.all([
        fetchProductPrintData(order.productCode),
        resolveProductionOrderMachineLabel(order.machine)
      ]);
      const orderQuantity = parseProductionOrderQuantity(order.quantity);
      const materials = buildProductionOrderMaterialProposal(orderQuantity, items, product);
      setPrintingMaterials(materials);
      setPrintingProduct(product);
      setPrintingMachineLabel(machineLabel);
      setPrintingOrder(order);
      setPendingPrint(true);
    } catch (error) {
      console.error('Không thể in lệnh SX:', error);
      window.alert('Không thể tải thành phần sản phẩm để in lệnh SX.');
    } finally {
      setIsLoadingPrint(false);
    }
  };

  useEffect(() => {
    if (!pendingPrint || !printingOrder) return;

    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrint(false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [pendingPrint, printingOrder, printingMaterials, printingProduct, printingMachineLabel]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintingOrder(null);
      setPrintingMaterials([]);
      setPrintingProduct(null);
      setPrintingMachineLabel('');
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return { printingOrder, printingMaterials, printingProduct, printingMachineLabel, shiftSettings, isLoadingPrint, printProductionOrder };
}

const PRODUCTION_ORDER_STATUS_OPTIONS = ['Chờ sx', 'Đang sx', 'Hoàn thành', 'Hủy'];

type ProductionOrderLookupSetting = {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  group: string;
  timeFrame: string;
  note: string;
};

function mapProductionOrderSettings(data: unknown): ProductionOrderLookupSetting[] {
  if (!data || typeof data !== 'object') return [];
  const settings = (data as { settings?: unknown }).settings;
  if (!Array.isArray(settings)) return [];

  return settings.map(item => {
    const record = item as Record<string, unknown>;
    return {
      id: String(record.id ?? ''),
      code: pickText(record, ['ma_cai_dat', 'ma', 'code'], ''),
      name: pickText(record, ['ten_cai_dat', 'hang_muc', 'name'], ''),
      loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
      group: pickText(record, ['nhom', 'group'], '-'),
      timeFrame: formatCell(record.khung_gio),
      note: pickText(record, ['ghi_chu', 'note'], '')
    };
  });
}

function toDatetimeLocalValue(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDatetimeLocalInputValue(value: string) {
  const raw = value.trim();
  if (!raw || raw === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDatetimeLocalValue(parsed);
}

function todayIsoDate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function extractProductionOrderDate(datetimeLocal: string) {
  if (!datetimeLocal) return todayIsoDate();
  const datePart = datetimeLocal.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : todayIsoDate();
}

function mergeProductionOrderDateTime(date: string, datetimeLocal: string) {
  const timePart =
    datetimeLocal && datetimeLocal.includes('T')
      ? datetimeLocal.split('T')[1]?.slice(0, 5) || '08:00'
      : '08:00';
  return date ? `${date}T${timePart}` : datetimeLocal;
}

function settingMatchesShift(setting: ProductionOrderLookupSetting, shift: string) {
  if (!shift) return false;
  const needle = shift.toLowerCase();
  return [setting.group, setting.name, setting.timeFrame, setting.note, setting.code]
    .some(value => value && value !== '-' && value.toLowerCase().includes(needle));
}

function formatProductionOrderShiftLabel(shift: string, settings: ProductionOrderLookupSetting[] = []) {
  const trimmed = shift.trim();
  if (!trimmed || trimmed === '-') return '-';

  if (/\(\s*\d{1,2}:\d{2}/.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();

  const matchedSetting = settings.find(setting => {
    const candidates = [setting.name, setting.code].filter(value => value && value !== '-');
    return candidates.some(value => value.trim().toLowerCase() === normalized);
  });
  const timeFrame = matchedSetting?.timeFrame && matchedSetting.timeFrame !== '-' ? matchedSetting.timeFrame : '';
  if (timeFrame) return `${trimmed} (${timeFrame})`;

  const standardMatch = STANDARD_SHIFTS.find(option => {
    const base = option.replace(/\s*\([^)]*\).*$/, '').trim().toLowerCase();
    return option.toLowerCase() === normalized || base === normalized;
  });
  if (standardMatch) return standardMatch;

  return trimmed;
}

function splitProductionProductCodes(raw: string): string[] {
  return raw
    .split(',')
    .map(code => code.trim())
    .filter(code => code && code !== '-');
}

function parseRowQuantity(raw: string): number {
  const num = parsePercentInput(raw);
  return Number.isFinite(num) ? num : 0;
}

function getOrderProductQuantity(orders: OrderRow[], orderRef: string, productCode: string): number {
  return orders
    .filter(order => order.orderCode === orderRef)
    .reduce((sum, order) => {
      const lines = getOrderProductLines(order);
      return (
        sum +
        lines
          .filter(line => line.productCode === productCode)
          .reduce((lineSum, line) => lineSum + parseRowQuantity(line.quantity), 0)
      );
    }, 0);
}

function getAllocatedProductionQuantity(
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string
): number {
  return productionOrders
    .reduce((sum, po) => {
      return (
        sum +
        getProductionOrderProductLines(po)
          .filter(line => (line.orderRef || po.orderRef) === orderRef && line.productCode === productCode)
          .reduce((lineSum, line) => lineSum + parseRowQuantity(line.quantity), 0)
      );
    }, 0);
}

function getRemainingProductionQuantity(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string
): number {
  const ordered = getOrderProductQuantity(orders, orderRef, productCode);
  const allocated = getAllocatedProductionQuantity(productionOrders, orderRef, productCode);
  return Math.max(0, ordered - allocated);
}

function getOrderProductUnit(orders: OrderRow[], orderRef: string, productCode: string): string {
  const line = orders
    .filter(order => order.orderCode === orderRef)
    .flatMap(order => getOrderProductLines(order))
    .find(item => item.productCode === productCode);
  return line?.unit && line.unit !== '-' ? line.unit : '';
}

function buildProductionEntryLine(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  orderRef: string,
  productCode: string,
  productName = '',
  unit = ''
): Pick<ProductionOrderEntryLine, 'productCode' | 'productName' | 'quantity' | 'unit'> {
  const remaining = getRemainingProductionQuantity(orders, productionOrders, orderRef, productCode);
  return {
    productCode,
    productName,
    quantity: remaining > 0 ? String(remaining) : '',
    unit: unit || getOrderProductUnit(orders, orderRef, productCode)
  };
}

function autofillProductKey(orderRef: string, productCode: string) {
  return `${orderRef}::${productCode}`;
}

function listProductOptionsForOrder(
  orders: OrderRow[],
  productionOrders: ProductionOrderRow[],
  catalogProducts: ProductRow[],
  orderRef: string
) {
  if (!orderRef) return [];

  const fromOrders = orders
    .filter(order => order.orderCode === orderRef)
    .flatMap(order =>
      getOrderProductLines(order).map(line => ({
        code: line.productCode,
        name: line.productName,
        unit: line.unit && line.unit !== '-' ? line.unit : ''
      }))
    )
    .filter(item => item.code && item.code !== '-');

  const unique = new Map<string, { name: string; unit: string }>();
  fromOrders.forEach(item => unique.set(item.code, { name: item.name || item.code, unit: item.unit }));

  if (unique.size === 0) {
    catalogProducts.forEach(product => {
      if (product.code) {
        unique.set(product.code, {
          name: product.name || product.code,
          unit: product.unit && product.unit !== '-' ? product.unit : ''
        });
      }
    });
  }

  return [...unique.entries()]
    .map(([code, meta]) => ({
      code,
      name: meta.name,
      unit: meta.unit,
      orderQty: getOrderProductQuantity(orders, orderRef, code),
      remainingQty: getRemainingProductionQuantity(orders, productionOrders, orderRef, code)
    }))
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

type ProductionOrderEntryLine = {
  key: string;
  orderRef: string;
  productCode: string;
  productName: string;
  quantity: string;
  unit: string;
};

type ProductionOrderFormState = {
  code: string;
  name: string;
  entryLines: ProductionOrderEntryLine[];
  status: string;
  shift: string;
  selectedStaffIds: string[];
  startDate: string;
  startDateTime: string;
  endDateTime: string;
  machine: string;
  note: string;
};

function newProductionOrderEntryLine(): ProductionOrderEntryLine {
  return {
    key: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderRef: '',
    productCode: '',
    productName: '',
    quantity: '',
    unit: ''
  };
}

function emptyProductionOrderForm(): ProductionOrderFormState {
  const startDateTime = toDatetimeLocalValue();
  return {
    code: '',
    name: '',
    entryLines: [newProductionOrderEntryLine()],
    status: 'Chờ sx',
    shift: '',
    selectedStaffIds: [],
    startDate: extractProductionOrderDate(startDateTime),
    startDateTime,
    endDateTime: '',
    machine: '',
    note: ''
  };
}

function productionOrderFormToCreatePayload(
  form: ProductionOrderFormState,
  lines: ProductionOrderEntryLine[],
  staffText = ''
) {
  const staff = staffText || form.selectedStaffIds.join(', ');
  const products = lines.map(line => ({
    ma_don_hang: line.orderRef.trim(),
    ma_sp: line.productCode.trim(),
    ten_sp: line.productName.trim(),
    don_vi: line.unit.trim(),
    so_luong: Number(line.quantity)
  }));
  const summary = summarizeOrderProducts(
    products.map(product => ({
      productCode: product.ma_sp,
      productName: product.ten_sp,
      unit: product.don_vi,
      quantity: String(product.so_luong)
    }))
  );
  const primaryLine = lines[0];
  const orderRefs = [...new Set(lines.map(line => line.orderRef.trim()).filter(Boolean))];
  const defaultName =
    lines.length === 1
      ? primaryLine.productName || primaryLine.productCode
      : lines
          .map(line => line.productName || line.productCode)
          .filter(Boolean)
          .join(' + ');

  return {
    ma_lenh_sx: form.code.trim(),
    ten_lenh_sx: form.name.trim() || (defaultName ? `SX ${defaultName}` : ''),
    san_pham: products,
    ma_hang: summary.productCode,
    ten_hang: summary.productName,
    so_luong: Number(summary.quantity),
    don_vi: summary.unit === '-' ? '' : summary.unit,
    trang_thai: form.status,
    ma_don_hang: orderRefs.join(', ') || primaryLine.orderRef.trim(),
    ca: form.shift.trim(),
    nhan_su: staff,
    ngay_gio_bat_dau: mergeProductionOrderDateTime(form.startDate, form.startDateTime) || null,
    ngay_gio_ket_thuc: form.endDateTime.trim() || null,
    may: form.machine.trim(),
    ghi_chu: form.note.trim()
  };
}

function productionOrderFormToPayload(
  form: ProductionOrderFormState,
  line: ProductionOrderEntryLine,
  staffText = ''
) {
  return productionOrderFormToCreatePayload(form, [line], staffText);
}

function AddProductionOrderModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<ProductionOrderFormState>(emptyProductionOrderForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [settings, setSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [staffBranches, setStaffBranches] = useState<HrBranch[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [showAutofillOrders, setShowAutofillOrders] = useState(false);
  const [autofillSearch, setAutofillSearch] = useState('');
  const [selectedAutofillOrderCodes, setSelectedAutofillOrderCodes] = useState<string[]>([]);
  const [selectedAutofillProductKeys, setSelectedAutofillProductKeys] = useState<string[]>([]);
  const [autofillProductOrderFilter, setAutofillProductOrderFilter] = useState('all');
  const [autofillProductSearch, setAutofillProductSearch] = useState('');
  const [showAddLine, setShowAddLine] = useState(false);
  const [lineDraftOrderRef, setLineDraftOrderRef] = useState('');
  const [lineDraftProductCode, setLineDraftProductCode] = useState('');
  const [lineDraftQuantity, setLineDraftQuantity] = useState('');
  const [lineDraftError, setLineDraftError] = useState('');

  useEffect(() => {
    if (!open) return;

    setForm(emptyProductionOrderForm());
    setFormError('');
    setShowAutofillOrders(false);
    setAutofillSearch('');
    setSelectedAutofillOrderCodes([]);
    setSelectedAutofillProductKeys([]);
    setAutofillProductOrderFilter('all');
    setAutofillProductSearch('');
    setShowAddLine(false);
    setLineDraftOrderRef('');
    setLineDraftProductCode('');
    setLineDraftQuantity('');
    setLineDraftError('');
    setIsLoadingLookups(true);

    const loadLookups = async () => {
      try {
        const [orderRes, productionRes, machineRes, settingRes, staffRes, productRes] = await Promise.all([
          fetch('/api/don-hang'),
          fetch('/api/lenh-sx'),
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/san-pham?format=table')
        ]);

        const orderData = await orderRes.json().catch(() => ({}));
        const productionData = await productionRes.json().catch(() => ({}));
        const machineData = await machineRes.json().catch(() => ({}));
        const settingData = await settingRes.json().catch(() => ({}));
        const staffData = await staffRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));

        if (orderRes.ok) setOrders(normalizeOrders(orderData));
        if (productionRes.ok) setProductionOrders(normalizeProductionOrders(productionData));
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(mapProductionOrderSettings(settingData));
        if (staffRes.ok) setStaffBranches(normalizeHrBranches(staffData));
        if (productRes.ok) setCatalogProducts(normalizeProducts(productData));
      } finally {
        setIsLoadingLookups(false);
      }
    };

    loadLookups();
  }, [open]);

  const orderCodeOptions = useMemo(() => {
    return [...new Set(orders.map(order => order.orderCode).filter(code => code && code !== '-'))].sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [orders]);

  const shiftOptions = useMemo(() => {
    const fromSettings = settings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Thời gian' ||
          setting.loaiCaiDat === 'Sản xuất' ||
          /ca/i.test(setting.name) ||
          /ca/i.test(setting.code)
      )
      .map(setting => setting.name || setting.code)
      .filter((name, index, arr) => name && arr.indexOf(name) === index);

    return fromSettings.length > 0 ? fromSettings : [...STANDARD_SHIFTS];
  }, [settings]);

  const assignedMachineKeys = useMemo(() => {
    if (!form.shift) return new Set<string>();

    const keys = settings
      .filter(setting => setting.loaiCaiDat === 'Ca máy' && settingMatchesShift(setting, form.shift))
      .flatMap(setting =>
        [setting.code, setting.name].filter(value => value && value !== '-').map(value => value.toLowerCase())
      );

    return new Set(keys);
  }, [form.shift, settings]);

  const availableMachines = useMemo(() => {
    return machines.filter(machine => {
      const candidates = [machine.code, machine.name]
        .filter(value => value && value !== '-')
        .map(value => value.toLowerCase());

      return !candidates.some(
        key =>
          assignedMachineKeys.has(key) ||
          [...assignedMachineKeys].some(assigned => key.includes(assigned) || assigned.includes(key))
      );
    });
  }, [assignedMachineKeys, machines]);

  const staffOptions = useMemo(() => {
    const allMembers = staffBranches.flatMap(branch =>
      branch.departments.flatMap(department => department.members)
    );

    if (!form.shift) return allMembers;

    const needle = form.shift.toLowerCase();
    const filtered = allMembers.filter(member => {
      const memberShift = member.shift.toLowerCase();
      return memberShift.includes(needle) || needle.includes(memberShift);
    });

    return filtered.length > 0 ? filtered : allMembers;
  }, [form.shift, staffBranches]);

  const selectedStaffNames = useMemo(() => {
    return staffOptions
      .filter(member => form.selectedStaffIds.includes(member.id))
      .map(member => member.name)
      .join(', ');
  }, [form.selectedStaffIds, staffOptions]);

  const autofillOrderOptions = useMemo(() => {
    const normalized = autofillSearch.trim().toLowerCase();
    return orders
      .filter(order => getOrderProductLines(order).length > 0)
      .filter(order => {
        if (!normalized) return true;
        return `${order.orderCode} ${order.customer} ${formatOrderProductsSummary(getOrderProductLines(order))}`
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => a.orderCode.localeCompare(b.orderCode, 'vi'));
  }, [autofillSearch, orders]);

  const autofillProductCandidates = useMemo(() => {
    return selectedAutofillOrderCodes.flatMap(orderRef =>
      listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef)
        .filter(product => product.orderQty > 0 && product.remainingQty > 0)
        .map(product => ({
          key: autofillProductKey(orderRef, product.code),
          orderRef,
          productCode: product.code,
          productName: product.name,
          unit: product.unit,
          remainingQty: product.remainingQty
        }))
    );
  }, [selectedAutofillOrderCodes, orders, productionOrders, catalogProducts]);

  const autofillOrderFilterOptions = useMemo(
    () => [
      { value: 'all', label: `Tất cả đơn đã chọn (${selectedAutofillOrderCodes.length})` },
      ...selectedAutofillOrderCodes.map(orderCode => ({ value: orderCode, label: orderCode }))
    ],
    [selectedAutofillOrderCodes]
  );

  const filteredAutofillProducts = useMemo(() => {
    const byOrder =
      autofillProductOrderFilter === 'all'
        ? autofillProductCandidates
        : autofillProductCandidates.filter(item => item.orderRef === autofillProductOrderFilter);

    const normalized = autofillProductSearch.trim().toLowerCase();
    if (!normalized) return byOrder;

    return byOrder.filter(item =>
      `${item.productCode} ${item.productName} ${item.orderRef} ${item.unit}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [autofillProductCandidates, autofillProductOrderFilter, autofillProductSearch]);

  const allFilteredProductsSelected =
    filteredAutofillProducts.length > 0 &&
    filteredAutofillProducts.every(item => selectedAutofillProductKeys.includes(item.key));

  const toggleAutofillOrderCode = (orderCode: string) => {
    setSelectedAutofillOrderCodes(prev => {
      const isSelected = prev.includes(orderCode);
      if (isSelected) {
        setSelectedAutofillProductKeys(keys =>
          keys.filter(key => !key.startsWith(`${orderCode}::`))
        );
        setAutofillProductOrderFilter(current => (current === orderCode ? 'all' : current));
        return prev.filter(code => code !== orderCode);
      }
      return [...prev, orderCode];
    });
  };

  const toggleAutofillProductKey = (key: string) => {
    setSelectedAutofillProductKeys(prev =>
      prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key]
    );
  };

  const toggleAutofillSelectAllFiltered = () => {
    const keys = filteredAutofillProducts.map(item => item.key);
    if (allFilteredProductsSelected) {
      setSelectedAutofillProductKeys(prev => prev.filter(key => !keys.includes(key)));
      return;
    }
    setSelectedAutofillProductKeys(prev => [...new Set([...prev, ...keys])]);
  };

  const applyAutofillOrders = () => {
    const selectedCodes = [...new Set(selectedAutofillOrderCodes.map(code => code.trim()).filter(Boolean))];
    if (selectedCodes.length === 0) {
      setFormError('Vui lòng tick ít nhất một đơn hàng để tự điền.');
      return;
    }

    const selectedProducts = autofillProductCandidates.filter(item =>
      selectedAutofillProductKeys.includes(item.key)
    );

    if (selectedProducts.length === 0) {
      setFormError('Vui lòng chọn ít nhất một sản phẩm trong đơn hàng.');
      return;
    }

    const nextLines = selectedProducts.map(product => ({
      key: `entry-${product.orderRef}-${product.productCode}-${Math.random().toString(36).slice(2, 7)}`,
      orderRef: product.orderRef,
      ...buildProductionEntryLine(
        orders,
        productionOrders,
        product.orderRef,
        product.productCode,
        product.productName,
        product.unit
      )
    }));

    setForm(prev => ({
      ...prev,
      entryLines: nextLines
    }));
    setFormError('');
    setShowAutofillOrders(false);
  };

  const openAddLine = () => {
    setLineDraftOrderRef('');
    setLineDraftProductCode('');
    setLineDraftQuantity('');
    setLineDraftError('');
    setShowAddLine(true);
  };

  const closeAddLine = () => {
    setShowAddLine(false);
    setLineDraftError('');
  };

  const confirmAddLine = () => {
    const orderRef = lineDraftOrderRef.trim();
    const productCode = lineDraftProductCode.trim();
    const quantityRaw = lineDraftQuantity.trim();
    const quantity = Number(quantityRaw);

    if (!orderRef) {
      setLineDraftError('Vui lòng chọn mã đơn hàng.');
      return;
    }
    if (!productCode) {
      setLineDraftError('Vui lòng chọn mã hàng.');
      return;
    }
    if (!quantityRaw || !Number.isFinite(quantity) || quantity <= 0) {
      setLineDraftError('Số lượng phải lớn hơn 0.');
      return;
    }

    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      '',
      ''
    );

    const newLine: ProductionOrderEntryLine = {
      key: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderRef,
      productCode,
      productName: built.productName || built.productCode,
      quantity: String(quantity),
      unit: built.unit || built.productCode
    };

    setForm(prev => ({
      ...prev,
      entryLines: [...prev.entryLines, newLine]
    }));
    setShowAddLine(false);
    setLineDraftError('');
  };

  const updateEntryLine = (key: string, patch: Partial<ProductionOrderEntryLine>) => {
    setForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map(line => (line.key === key ? { ...line, ...patch } : line))
    }));
  };

  const handleEntryOrderChange = (key: string, orderRef: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    let patch: Partial<ProductionOrderEntryLine> = {
      orderRef,
      productCode: '',
      productName: '',
      quantity: '',
      unit: ''
    };
    if (options.length === 1) {
      const product = options[0];
      patch = {
        orderRef,
        ...buildProductionEntryLine(
          orders,
          productionOrders,
          orderRef,
          product.code,
          product.name,
          product.unit
        )
      };
    }
    updateEntryLine(key, patch);
  };

  const handleEntryProductChange = (key: string, orderRef: string, productCode: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    const product = options.find(item => item.code === productCode);
    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      product?.name || '',
      product?.unit || ''
    );
    updateEntryLine(key, built);
  };

  const toggleStaffId = (staffId: string) => {
    setForm(prev => ({
      ...prev,
      selectedStaffIds: prev.selectedStaffIds.includes(staffId)
        ? prev.selectedStaffIds.filter(id => id !== staffId)
        : [...prev.selectedStaffIds, staffId]
    }));
  };

  if (!open) return null;

  const handleSubmit = async () => {
    const filledLines = form.entryLines.filter(line => line.orderRef.trim() && line.productCode.trim());

    if (filledLines.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng đơn hàng và mã hàng.');
      return;
    }

    for (const line of filledLines) {
      const quantity = Number(line.quantity);
      const productName = line.productName || line.productCode;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho ${productName}.`);
        return;
      }
      const ordered = getOrderProductQuantity(orders, line.orderRef.trim(), line.productCode);
      if (ordered <= 0) {
        setFormError(`${productName} không có trong đơn ${line.orderRef} hoặc chưa có số lượng đặt hàng.`);
        return;
      }
      const remaining = getRemainingProductionQuantity(
        orders,
        productionOrders,
        line.orderRef.trim(),
        line.productCode
      );
      if (remaining <= 0) {
        setFormError(`${productName} đã được lập đủ lệnh SX cho đơn ${line.orderRef}.`);
        return;
      }
      if (quantity > remaining) {
        setFormError(
          `Số lượng ${productName} (đơn ${line.orderRef}) vượt quá còn lại (${formatNumber(remaining, 0)}).`
        );
        return;
      }
    }
    if (!form.shift.trim()) {
      setFormError('Vui lòng chọn ca.');
      return;
    }
    if (!form.machine.trim()) {
      setFormError('Vui lòng chọn máy.');
      return;
    }
    if (!form.startDate.trim()) {
      setFormError('Vui lòng chọn ngày.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/lenh-sx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productionOrderFormToCreatePayload(form, filledLines, selectedStaffNames))
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tạo lệnh SX.');
      }

      await onCreated();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể tạo lệnh sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="h-[96vh] max-h-[98vh] w-full max-w-[1500px] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm lệnh sản xuất mới</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng lenh_sx trên Supabase</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        {isLoadingLookups && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải đơn hàng, máy, ca và nhân sự...
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã lệnh</span>
            <input
              value={form.code}
              onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
              className={orderFieldClass}
              placeholder="Để trống = tự sinh"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày *</span>
            <input
              type="date"
              value={form.startDate}
              onChange={e => {
                const startDate = e.target.value;
                setForm(prev => ({
                  ...prev,
                  startDate,
                  startDateTime: mergeProductionOrderDateTime(startDate, prev.startDateTime)
                }));
              }}
              className={orderFieldClass}
            />
          </label>

          <RepeatableLinesBlock
            className="col-span-2"
            title="Đơn hàng & mã hàng"
            required
            onAdd={() =>
              setForm(prev => ({
                ...prev,
                entryLines: [...prev.entryLines, newProductionOrderEntryLine()]
              }))
            }
            columns={[
              { key: 'order', label: 'Mã đơn', className: 'min-w-0 flex-[1.1]', required: true },
              { key: 'code', label: 'Mã hàng', className: 'min-w-0 flex-[1.35]', required: true },
              { key: 'name', label: 'Tên hàng', className: 'min-w-0 flex-[1.1]' },
              { key: 'unit', label: 'ĐV', className: 'w-16 shrink-0 sm:w-20' },
              { key: 'qty', label: 'SL', className: 'w-20 shrink-0 sm:w-24', required: true },
              { key: 'actions', label: '', className: 'w-9 shrink-0' }
            ]}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <span className="text-[11px] font-bold text-zinc-500">
                Chọn từng dòng thủ công hoặc tự điền từ nhiều đơn hàng.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddLine(true)}
                  disabled={isLoadingLookups || orders.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm dòng
                </button>
                <button
                  type="button"
                  onClick={() => setShowAutofillOrders(true)}
                  disabled={isLoadingLookups || orders.length === 0}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/25 bg-red-50 px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Tự điền từ đơn hàng
                </button>
              </div>
            </div>

            {form.entryLines.map(line => {
              const productOptions = listProductOptionsForOrder(
                orders,
                productionOrders,
                catalogProducts,
                line.orderRef
              );
              const selectedProduct = productOptions.find(item => item.code === line.productCode);

              return (
                <RepeatableLineRow key={line.key}>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <SearchableSelect
                      value={line.orderRef}
                      onChange={orderRef => handleEntryOrderChange(line.key, orderRef)}
                      options={orderCodeOptions}
                      placeholder="Gõ để tìm mã đơn"
                      isLoading={isLoadingLookups}
                      inputClassName={orderFieldClass}
                      getLabel={item => String(item)}
                      getValue={item => String(item)}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.35]">
                    <SearchableSelect
                      value={line.productCode}
                      onChange={productCode => handleEntryProductChange(line.key, line.orderRef, productCode)}
                      options={productOptions}
                      placeholder={line.orderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                      disabled={!line.orderRef}
                      isLoading={isLoadingLookups}
                      inputClassName={orderFieldClass}
                      getLabel={item => {
                        const product = item as (typeof productOptions)[number];
                        const remaining =
                          product.remainingQty <= 0 && product.orderQty > 0
                            ? ' · hết'
                            : product.orderQty > 0
                              ? ` · còn ${formatNumber(product.remainingQty, 0)}`
                              : '';
                        return product.code ? `${product.code} · ${product.name}${remaining}` : product.name;
                      }}
                      getValue={item => (item as (typeof productOptions)[number]).code}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <input
                      value={selectedProduct?.name || line.productName}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="Tự điền theo mã hàng"
                    />
                  </div>
                  <div className="col-span-1 md:w-16 md:shrink-0 sm:md:w-20">
                    <input
                      value={line.unit}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="ĐV"
                    />
                  </div>
                  <div className="col-span-1 md:w-20 md:shrink-0 sm:md:w-24">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={e => updateEntryLine(line.key, { quantity: e.target.value })}
                      className={orderFieldClass}
                      placeholder="SL"
                    />
                  </div>
                  {line.orderRef && line.productCode && selectedProduct && selectedProduct.orderQty > 0 && (
                    <span className="col-span-2 mb-2 shrink-0 text-[11px] font-bold text-zinc-500">
                      Còn {formatNumber(selectedProduct.remainingQty, 0)}
                    </span>
                  )}
                  {form.entryLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(prev => ({
                          ...prev,
                          entryLines: prev.entryLines.filter(item => item.key !== line.key)
                        }))
                      }
                      className="col-span-2 md:col-span-1 md:mb-0.5 flex h-10 w-full md:h-9 md:w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="md:hidden">Xóa dòng này</span>
                    </button>
                  )}
                </RepeatableLineRow>
              );
            })}
          </RepeatableLinesBlock>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca *</span>
            <SearchableSelect
              value={form.shift}
              onChange={shift => setForm(prev => ({ ...prev, shift, machine: '' }))}
              options={shiftOptions}
              placeholder="Gõ để tìm ca"
              isLoading={isLoadingLookups}
              getLabel={item => formatProductionOrderShiftLabel(String(item), settings)}
              getValue={item => String(item)}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
            <SearchableSelect
              value={form.status}
              onChange={status => setForm(prev => ({ ...prev, status }))}
              options={[...PRODUCTION_ORDER_STATUS_OPTIONS]}
              placeholder="Gõ để tìm trạng thái"
              getLabel={item => String(item)}
              getValue={item => String(item)}
              allowEmpty={false}
            />
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Máy *</span>
            {renderMachineSelect(
              form.machine,
              machine => setForm(prev => ({ ...prev, machine })),
              availableMachines,
              {
                disabled: !form.shift,
                placeholder: form.shift ? 'Gõ để tìm máy' : 'Chọn ca trước'
              }
            )}
            {form.shift && availableMachines.length === 0 && (
              <p className="text-[11px] font-semibold text-amber-700">
                Không còn máy trống cho ca này (các máy đã khai báo trong Ca máy).
              </p>
            )}
          </label>

          <div className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhân sự (chọn nhiều)</span>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              {staffOptions.length === 0 && (
                <p className="px-2 py-3 text-xs font-semibold text-zinc-400">Chưa có nhân sự Sản xuất · HCM.</p>
              )}
              {staffOptions.map(member => {
                const checked = form.selectedStaffIds.includes(member.id);
                return (
                  <label
                    key={member.id}
                    className={`mb-1 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition last:mb-0 ${
                      checked ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]' : 'border-zinc-200 bg-white text-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStaffId(member.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                    <span className="font-black">{member.name}</span>
                    <span className="text-zinc-500">{member.role} · {member.shift}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu</span>
            <input
              type="time"
              value={form.startDateTime.includes('T') ? form.startDateTime.split('T')[1]?.slice(0, 5) || '' : ''}
              onChange={e => {
                const time = e.target.value;
                setForm(prev => ({
                  ...prev,
                  startDateTime: mergeProductionOrderDateTime(prev.startDate, `${prev.startDate}T${time}`)
                }));
              }}
              className={orderFieldClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày giờ kết thúc</span>
            <input
              type="datetime-local"
              value={form.endDateTime}
              onChange={e => setForm(prev => ({ ...prev, endDateTime: e.target.value }))}
              className={orderFieldClass}
            />
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
            <textarea
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
              rows={2}
              className={`${orderFieldClass} min-h-[72px] resize-y`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || isLoadingLookups}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Tạo lệnh SX'}
          </button>
        </div>
      </div>

      {showAutofillOrders && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex h-[94vh] max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-zinc-950">Tự điền từ đơn hàng</h4>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  Chọn đơn hàng, sau đó tick sản phẩm cần lập lệnh SX.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutofillOrders(false)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>

            <div className="shrink-0 border-b border-zinc-100 p-4">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  value={autofillSearch}
                  onChange={event => setAutofillSearch(event.target.value)}
                  placeholder="Tìm mã đơn, khách hàng, mã hàng..."
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4">
                {autofillOrderOptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm font-bold text-zinc-400">
                    Không có đơn hàng phù hợp.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {autofillOrderOptions.map(order => {
                      const checked = selectedAutofillOrderCodes.includes(order.orderCode);
                      const productLines = getOrderProductLines(order);
                      return (
                        <label
                          key={order.id}
                          className={`block cursor-pointer rounded-xl border p-3 transition ${
                            checked ? 'border-[#ef1b2d]/35 bg-red-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAutofillOrderCode(order.orderCode)}
                              className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-zinc-950">{order.orderCode || '-'}</span>
                                <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-black text-zinc-600">
                                  {productLines.length} sản phẩm
                                </span>
                                <span className="text-xs font-semibold text-zinc-500">{order.customer}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold leading-5 text-zinc-600">
                                {formatOrderProductsSummary(productLines)}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedAutofillOrderCodes.length > 0 && (
                <div className="border-t border-zinc-100 bg-zinc-50/80 p-4 pb-6">
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Chọn sản phẩm trong đơn</p>
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="min-w-0 space-y-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Lọc theo đơn hàng</span>
                        <SearchableSelect
                          value={autofillProductOrderFilter}
                          onChange={setAutofillProductOrderFilter}
                          options={autofillOrderFilterOptions}
                          placeholder="Gõ để tìm đơn hàng"
                          getValue={item => String((item as { value: string }).value)}
                          getLabel={item => String((item as { label: string }).label)}
                          allowEmpty={false}
                          inputClassName={`${orderFieldClass} bg-white`}
                        />
                      </label>
                      <label className="min-w-0 space-y-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tìm sản phẩm</span>
                        <div className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
                          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                          <input
                            value={autofillProductSearch}
                            onChange={event => setAutofillProductSearch(event.target.value)}
                            placeholder="Gõ mã SP, tên hàng, mã đơn..."
                            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                          />
                        </div>
                      </label>
                    </div>
                    <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3">
                      <input
                        type="checkbox"
                        checked={allFilteredProductsSelected}
                        onChange={toggleAutofillSelectAllFiltered}
                        disabled={filteredAutofillProducts.length === 0}
                        className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20 disabled:opacity-50"
                      />
                      <span className="text-xs font-extrabold text-zinc-700">Chọn tất cả (đang lọc)</span>
                    </label>
                  </div>

                  <div className="mt-3 rounded-xl border border-zinc-200 bg-white">
                    {filteredAutofillProducts.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs font-bold text-zinc-400">
                        {autofillProductSearch.trim()
                          ? 'Không có sản phẩm phù hợp từ khóa tìm kiếm.'
                          : 'Đơn đã chọn không còn sản phẩm cần lập lệnh SX.'}
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-100">
                        {filteredAutofillProducts.map(product => {
                          const checked = selectedAutofillProductKeys.includes(product.key);
                          return (
                            <label
                              key={product.key}
                              className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition ${
                                checked ? 'bg-red-50/70' : 'hover:bg-zinc-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAutofillProductKey(product.key)}
                                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-black text-zinc-950">{product.productCode}</span>
                                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-black text-zinc-600">
                                    {product.orderRef}
                                  </span>
                                  <span className="text-[11px] font-bold text-emerald-700">
                                    Còn {formatNumber(product.remainingQty, 0)} {product.unit || ''}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-xs font-semibold text-zinc-600">{product.productName || '-'}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
              <span className="text-xs font-bold text-zinc-500">
                Đã chọn {selectedAutofillOrderCodes.length} đơn · {selectedAutofillProductKeys.length} sản phẩm
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAutofillOrderCodes([]);
                    setSelectedAutofillProductKeys([]);
                    setAutofillProductOrderFilter('all');
                    setAutofillProductSearch('');
                  }}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
                >
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={applyAutofillOrders}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Tự điền
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddLine && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[96vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm dòng</h4>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  Nhập nhanh một dòng đơn hàng + mã hàng.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddLine}
                aria-label="Đóng"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã đơn *</span>
                <SearchableSelect
                  value={lineDraftOrderRef}
                  onChange={orderRef => {
                    setLineDraftOrderRef(orderRef);
                    setLineDraftProductCode('');
                  }}
                  options={orderCodeOptions}
                  placeholder="Gõ để tìm mã đơn"
                  isLoading={isLoadingLookups}
                  inputClassName="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã hàng *</span>
                <SearchableSelect
                  value={lineDraftProductCode}
                  onChange={setLineDraftProductCode}
                  options={listProductOptionsForOrder(orders, productionOrders, catalogProducts, lineDraftOrderRef)}
                  placeholder={lineDraftOrderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                  disabled={!lineDraftOrderRef}
                  isLoading={isLoadingLookups}
                  inputClassName="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                  getLabel={item => {
                    const product = item as { code: string; name: string; orderQty: number; remainingQty: number };
                    return product.code
                      ? `${product.code} · ${product.name}${product.orderQty > 0 ? ` · còn ${formatNumber(product.remainingQty, 0)}` : ''}`
                      : product.name;
                  }}
                  getValue={item => (item as { code: string }).code}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Số lượng *</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={lineDraftQuantity}
                  onChange={event => setLineDraftQuantity(event.target.value)}
                  placeholder="Nhập số lượng"
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>

              {lineDraftError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {lineDraftError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeAddLine}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmAddLine}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm dòng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductionOrderViewModal({
  row,
  onClose
}: {
  row: ProductionOrderRow | null;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết lệnh SX</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{row.code || row.name}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50">
            Đóng
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 text-sm">
          {[
            ['Mã lệnh', row.code],
            ['Tên lệnh', row.name],
            ['Sản phẩm', formatProductionOrderProductsSummary(row)],
            ['Trạng thái', row.status],
            ['Khách hàng', row.customer],
            ['Đơn hàng', row.orderRef],
            ['Ca', row.shift],
            ['Nhân sự', row.staff],
            ['Bắt đầu', row.startDate],
            ['Kết thúc', row.endDate],
            ['Máy', row.machine],
            ['Ghi chú', row.note || '-']
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
              <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditProductionOrderModal({
  open,
  row,
  orders,
  productionOrders,
  catalogProducts,
  machines,
  onClose,
  onSaved
}: {
  open: boolean;
  row: ProductionOrderRow | null;
  orders: OrderRow[];
  productionOrders: ProductionOrderRow[];
  catalogProducts: ProductRow[];
  machines: MachineRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<ProductionOrderFormState>(emptyProductionOrderForm);
  const [staffText, setStaffText] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    const productLines = getProductionOrderProductLines(row);
    const startDateTime = toDatetimeLocalInputValue(row.startDate);
    setForm({
      code: row.code === '-' ? '' : row.code,
      name: row.name === '-' ? '' : row.name,
      entryLines:
        productLines.length > 0
          ? productLines.map((product, index) => ({
              key: `edit-${row.id}-${index}`,
              orderRef: row.orderRef === '-' ? '' : row.orderRef,
              productCode: product.productCode === '-' ? '' : product.productCode,
              productName: product.productName === '-' ? '' : product.productName,
              quantity: product.quantity === '-' ? '' : product.quantity,
              unit: product.unit === '-' ? '' : product.unit
            }))
          : [newProductionOrderEntryLine()],
      status: row.status === '-' ? 'Chờ sx' : row.status,
      shift: row.shift === '-' ? '' : row.shift,
      selectedStaffIds: [],
      startDate: extractProductionOrderDate(startDateTime),
      startDateTime,
      endDateTime: toDatetimeLocalInputValue(row.endDate),
      machine: row.machine === '-' ? '' : row.machine,
      note: row.note
    });
    setStaffText(row.staff === '-' ? '' : row.staff);
    setFormError('');
  }, [open, row]);

  const orderCodeOptions = useMemo(() => {
    return [...new Set(orders.map(order => order.orderCode).filter(code => code && code !== '-'))].sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [orders]);

  const updateEntryLine = (key: string, patch: Partial<ProductionOrderEntryLine>) => {
    setForm(prev => ({
      ...prev,
      entryLines: prev.entryLines.map(line => (line.key === key ? { ...line, ...patch } : line))
    }));
  };

  const handleEntryOrderChange = (key: string, orderRef: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    let patch: Partial<ProductionOrderEntryLine> = {
      orderRef,
      productCode: '',
      productName: '',
      quantity: '',
      unit: ''
    };
    if (options.length === 1) {
      const product = options[0];
      patch = {
        orderRef,
        ...buildProductionEntryLine(
          orders,
          productionOrders,
          orderRef,
          product.code,
          product.name,
          product.unit
        )
      };
    }
    updateEntryLine(key, patch);
  };

  const handleEntryProductChange = (key: string, orderRef: string, productCode: string) => {
    const options = listProductOptionsForOrder(orders, productionOrders, catalogProducts, orderRef);
    const product = options.find(item => item.code === productCode);
    const built = buildProductionEntryLine(
      orders,
      productionOrders,
      orderRef,
      productCode,
      product?.name || '',
      product?.unit || ''
    );
    updateEntryLine(key, built);
  };

  if (!open || !row) return null;

  const handleSubmit = async () => {
    const filledLines = form.entryLines.filter(line => line.orderRef.trim() && line.productCode.trim());

    if (filledLines.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng đơn hàng và mã hàng.');
      return;
    }

    for (const line of filledLines) {
      const quantity = Number(line.quantity);
      const productName = line.productName || line.productCode;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho ${productName}.`);
        return;
      }
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch(`/api/lenh-sx/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productionOrderFormToCreatePayload(form, filledLines, staffText))
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể cập nhật lệnh sản xuất.');
      }

      await onSaved();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể cập nhật lệnh sản xuất.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Sửa lệnh sản xuất</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{row.code || row.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã lệnh</span>
            <input value={form.code} onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))} className={orderFieldClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày *</span>
            <input
              type="date"
              value={form.startDate}
              onChange={e => {
                const startDate = e.target.value;
                setForm(prev => ({
                  ...prev,
                  startDate,
                  startDateTime: mergeProductionOrderDateTime(startDate, prev.startDateTime)
                }));
              }}
              className={orderFieldClass}
            />
          </label>

          <RepeatableLinesBlock
            className="col-span-2"
            title="Đơn hàng & mã hàng"
            required
            onAdd={() =>
              setForm(prev => ({
                ...prev,
                entryLines: [...prev.entryLines, newProductionOrderEntryLine()]
              }))
            }
            columns={[
              { key: 'order', label: 'Mã đơn', className: 'min-w-0 flex-[1.1]', required: true },
              { key: 'code', label: 'Mã hàng', className: 'min-w-0 flex-[1.35]', required: true },
              { key: 'name', label: 'Tên hàng', className: 'min-w-0 flex-[1.1]' },
              { key: 'unit', label: 'ĐV', className: 'w-16 shrink-0 sm:w-20' },
              { key: 'qty', label: 'SL', className: 'w-20 shrink-0 sm:w-24', required: true },
              { key: 'actions', label: '', className: 'w-9 shrink-0' }
            ]}
          >
            {form.entryLines.map(line => {
              const productOptions = listProductOptionsForOrder(
                orders,
                productionOrders,
                catalogProducts,
                line.orderRef
              );
              const selectedProduct = productOptions.find(item => item.code === line.productCode);

              return (
                <RepeatableLineRow key={line.key}>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <SearchableSelect
                      value={line.orderRef}
                      onChange={orderRef => handleEntryOrderChange(line.key, orderRef)}
                      options={orderCodeOptions}
                      placeholder="Gõ để tìm mã đơn"
                      inputClassName={orderFieldClass}
                      getLabel={item => String(item)}
                      getValue={item => String(item)}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.35]">
                    <SearchableSelect
                      value={line.productCode}
                      onChange={productCode => handleEntryProductChange(line.key, line.orderRef, productCode)}
                      options={productOptions}
                      placeholder={line.orderRef ? 'Gõ để tìm mã hàng' : 'Chọn đơn trước'}
                      disabled={!line.orderRef}
                      inputClassName={orderFieldClass}
                      getLabel={item => {
                        const product = item as (typeof productOptions)[number];
                        return product.code ? `${product.code} · ${product.name}` : product.name;
                      }}
                      getValue={item => (item as (typeof productOptions)[number]).code}
                    />
                  </div>
                  <div className="col-span-2 md:min-w-0 md:flex-[1.1]">
                    <input
                      value={selectedProduct?.name || line.productName}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="Tự điền theo mã hàng"
                    />
                  </div>
                  <div className="col-span-1 md:w-16 md:shrink-0 sm:md:w-20">
                    <input
                      value={line.unit}
                      readOnly
                      className={`${orderFieldClass} bg-white text-zinc-800`}
                      placeholder="ĐV"
                    />
                  </div>
                  <div className="col-span-1 md:w-20 md:shrink-0 sm:md:w-24">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={e => updateEntryLine(line.key, { quantity: e.target.value })}
                      className={orderFieldClass}
                      placeholder="SL"
                    />
                  </div>
                  {form.entryLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(prev => ({
                          ...prev,
                          entryLines: prev.entryLines.filter(item => item.key !== line.key)
                        }))
                      }
                      className="col-span-2 md:col-span-1 md:mb-0.5 flex h-10 w-full md:h-9 md:w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="md:hidden">Xóa dòng này</span>
                    </button>
                  )}
                </RepeatableLineRow>
              );
            })}
          </RepeatableLinesBlock>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
            <SearchableSelect
              value={form.status}
              onChange={status => setForm(prev => ({ ...prev, status }))}
              options={[...PRODUCTION_ORDER_STATUS_OPTIONS]}
              placeholder="Gõ để tìm trạng thái"
              getLabel={item => String(item)}
              getValue={item => String(item)}
              allowEmpty={false}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca</span>
            <input value={form.shift} onChange={e => setForm(prev => ({ ...prev, shift: e.target.value }))} className={orderFieldClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhân sự</span>
            <input value={staffText} onChange={e => setStaffText(e.target.value)} className={orderFieldClass} />
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Máy</span>
            {renderMachineSelect(
              form.machine,
              machine => setForm(prev => ({ ...prev, machine })),
              machines,
              { placeholder: 'Gõ để tìm máy' }
            )}
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu</span>
            <input
              type="time"
              value={form.startDateTime.includes('T') ? form.startDateTime.split('T')[1]?.slice(0, 5) || '' : ''}
              onChange={e => {
                const time = e.target.value;
                setForm(prev => ({
                  ...prev,
                  startDateTime: mergeProductionOrderDateTime(prev.startDate, `${prev.startDate}T${time}`)
                }));
              }}
              className={orderFieldClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày giờ kết thúc</span>
            <input type="datetime-local" value={form.endDateTime} onChange={e => setForm(prev => ({ ...prev, endDateTime: e.target.value }))} className={orderFieldClass} />
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
            <textarea
              value={form.note}
              onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
              rows={2}
              className={`${orderFieldClass} min-h-[72px] resize-y`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Cập nhật'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductionOrdersPanel({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<ProductionOrderRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewingRow, setViewingRow] = useState<ProductionOrderRow | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const { printingOrder, printingMaterials, printingProduct, printingMachineLabel, shiftSettings, isLoadingPrint, printProductionOrder } = useProductionOrderPrint();

  const loadProductionOrders = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const res = await fetch('/api/lenh-sx');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải lệnh sản xuất từ Supabase.');
      }

      setRows(normalizeProductionOrders(data));
    } catch (error: any) {
      setRows([]);
      setLoadError(error.message || 'Không thể tải lệnh sản xuất từ Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionOrders();
  }, []);

  const statusFilters = useMemo(() => {
    const statuses = rows
      .map(row => row.status)
      .filter((status): status is string => status !== '-' && status.length > 0);
    return ['all', ...[...new Set(statuses)].sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [rows]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const matchesStatus = selectedStatus === 'all' || row.status === selectedStatus;
      const matchesSearch =
        !normalizedSearch ||
        `${row.code} ${row.name} ${row.productCode} ${row.productName} ${formatProductionOrderProductsSummary(row)} ${row.customer} ${row.orderRef} ${row.machine} ${row.status} ${row.note}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [normalizedSearch, rows, selectedStatus]);

  const activeCount = rows.filter(row => /đang|cho|chờ|active|sx/i.test(row.status)).length;
  const totalQuantity = rows.reduce((sum, row) => {
    const value = Number(row.quantity);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Kế hoạch & điều phối</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Lệnh sản xuất</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase lenh_sx.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Lệnh SX', rows.length],
              ['Đang / chờ SX', activeCount],
              ['Tổng SL', formatNumber(totalQuantity)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {statusFilters.map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(status)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedStatus === status
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {status === 'all' ? 'Tất cả' : status}
            </button>
          ))}
          {isLoading && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã lệnh, hàng, khách, đơn hàng..."
            disabled={isLoading}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {loadError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {loadError}
          </p>
        )}
      </section>

      <AddProductionOrderModal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onCreated={loadProductionOrders}
      />

      <ProductionOrderViewModal row={viewingRow} onClose={() => setViewingRow(null)} />

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1480px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-3 font-black">Mã lệnh</th>
                <th className="px-4 py-3 font-black">Tên lệnh</th>
                <th className="px-4 py-3 font-black">Mã hàng</th>
                <th className="px-4 py-3 font-black">Tên hàng</th>
                <th className="px-4 py-3 font-black">SL</th>
                <th className="px-4 py-3 font-black">Đơn vị</th>
                <th className="px-4 py-3 font-black">Trạng thái</th>
                <th className="px-4 py-3 font-black">Khách hàng</th>
                <th className="px-4 py-3 font-black">Đơn hàng</th>
                <th className="px-4 py-3 font-black">Bắt đầu</th>
                <th className="px-4 py-3 font-black">Kết thúc</th>
                <th className="px-4 py-3 font-black">Máy</th>
                <th className="px-4 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="transition hover:bg-red-50/40">
                  <td className="px-4 py-3 font-black text-zinc-950">{row.code || '-'}</td>
                  <td className="px-4 py-3 font-black text-zinc-950">{row.name || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">
                    {getProductionOrderProductLines(row)
                      .map(product => product.productCode || '-')
                      .join(' | ') || '-'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-800">
                    {getProductionOrderProductLines(row)
                      .map(product => product.productName || '-')
                      .join(' | ') || '-'}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-700">
                    {getProductionOrderProductLines(row)
                      .map(product => product.quantity || '-')
                      .join(' | ') || '-'}
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-700">
                    {getProductionOrderProductLines(row)
                      .map(product => product.unit || '-')
                      .join(' | ') || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.customer}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.orderRef}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-600">{row.startDate}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-600">{row.endDate}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.machine}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingRow(row)}
                        title="Xem chi tiết"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => printProductionOrder(row)}
                        disabled={isLoadingPrint}
                        title="In lệnh SX"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Bảng lenh_sx chưa có dữ liệu hoặc không có lệnh phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {printingOrder && (
        <ProductionOrderPrintSheet
          order={printingOrder}
          materials={printingMaterials}
          machineLabel={printingMachineLabel}
          product={printingProduct}
          shiftSettings={shiftSettings}
        />
      )}
    </div>
  );
}

interface OrderProductLine {
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  orderRef?: string;
}

function parseOrderProductsFromRecord(record: Record<string, unknown>): OrderProductLine[] {
  let raw = record.san_pham ?? record.products;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed;
      }
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested =
      (raw as { items?: unknown }).items ??
      (raw as { products?: unknown }).products ??
      (raw as { san_pham?: unknown }).san_pham;
    if (Array.isArray(nested)) {
      raw = nested;
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return expandProductionOrderProductLines(
      raw
        .map((item): OrderProductLine | null => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const productCode = pickText(row, ['ma_sp', 'ma_hang', 'productCode', 'code'], '');
          const productName = pickText(row, ['ten_sp', 'ten_hang', 'productName', 'name'], '');
          const unit = formatCell(row.don_vi ?? row.unit);
          const quantity = formatCell(row.so_luong ?? row.quantity);
          if (!productCode && !productName) return null;
          return {
            productCode,
            productName,
            unit,
            quantity,
            orderRef: pickText(row, ['ma_don_hang', 'orderRef', 'order_code'], '')
          };
        })
        .filter((line): line is OrderProductLine => Boolean(line))
    );
  }

  const productCode = pickText(record, ['ma_hang', 'ma_sp', 'product_code'], '');
  const productName = pickText(record, ['ten_hang', 'ten_sp', 'product_name'], '');
  if (!productCode && !productName) return [];

  return expandMergedProductionProducts(
    productCode,
    productName,
    formatCell(record.don_vi),
    formatCell(record.so_luong ?? record.sl ?? record.quantity),
    pickText(record, ['ma_don_hang', 'orderRef', 'order_code'], '')
  );
}

function summarizeOrderProducts(products: OrderProductLine[]) {
  const productCode = products.map(item => item.productCode).filter(Boolean).join(', ') || '-';
  const productName = products.map(item => item.productName).filter(Boolean).join(', ') || '-';
  const unit =
    products.length === 1
      ? products[0].unit
      : products
          .map(item => item.unit)
          .filter(unit => unit && unit !== '-')
          .join(', ') || '-';
  const total = products.reduce((sum, item) => sum + parsePercentInput(item.quantity), 0);

  return {
    productCode,
    productName,
    unit,
    quantity: total > 0 ? String(total) : '-'
  };
}

function getOrderProductLines(order: OrderRow): OrderProductLine[] {
  if (order.products.length > 0) return order.products;
  if (!order.productCode && !order.productName) return [];
  return [
    {
      productCode: order.productCode,
      productName: order.productName,
      unit: order.unit,
      quantity: order.quantity
    }
  ];
}

function formatOrderProductsSummary(products: OrderProductLine[]) {
  if (products.length === 0) return '-';
  return products
    .map(line => {
      const qty = line.quantity && line.quantity !== '-' ? line.quantity : '';
      const unit = line.unit && line.unit !== '-' ? line.unit : '';
      const label = line.productCode || line.productName || '-';
      return `${label}${qty ? ` × ${qty}` : ''}${unit ? ` ${unit}` : ''}`;
    })
    .join(' · ');
}

interface OrderRow {
  id: string;
  orderCode: string;
  orderType: string;
  status: string;
  staffName: string;
  customer: string;
  products: OrderProductLine[];
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  note: string;
}

function generateNextOrderCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^DH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `DH${String(next).padStart(width, '0')}`;
}

function normalizeOrders(data: unknown): OrderRow[] {
  if (!data || typeof data !== 'object') return [];
  const orders = (data as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];

  return orders
    .map((item): OrderRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const orderCode = pickText(record, ['ma_don_hang', 'order_code', 'code'], '');
      const products = parseOrderProductsFromRecord(record);
      const summary = summarizeOrderProducts(products);
      if (!orderCode && products.length === 0) return null;

      return {
        id: String(record.id ?? '').trim() || orderCode || summary.productCode || summary.productName,
        orderCode,
        orderType: pickText(record, ['loai_don_hang', 'order_type', 'type'], '-'),
        status: pickText(record, ['trang_thai', 'status', 'trang_thai_don'], ORDER_STATUS_DEFAULT),
        staffName: pickText(record, ['nhan_vien', 'staff', 'nv'], '-'),
        customer: pickText(record, ['khach_hang', 'customer'], '-'),
        products,
        productCode: summary.productCode,
        productName: summary.productName,
        unit: summary.unit,
        quantity: summary.quantity,
        note: pickText(record, ['ghi_chu', 'note'], '')
      };
    })
    .filter((order): order is OrderRow => Boolean(order));
}

type OrderProductFormLine = {
  key: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
};

function newOrderProductFormLine(): OrderProductFormLine {
  return {
    key: `order-product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productCode: '',
    productName: '',
    unit: '',
    quantity: ''
  };
}

type OrderFormState = {
  orderCode: string;
  orderType: string;
  staffName: string;
  customer: string;
  productLines: OrderProductFormLine[];
  note: string;
  status: string;
};

const emptyOrderForm = (): OrderFormState => ({
  orderCode: '',
  orderType: ORDER_TYPE_OPTIONS[0],
  staffName: '',
  customer: '',
  productLines: [newOrderProductFormLine()],
  note: '',
  status: ORDER_STATUS_DEFAULT
});

function orderProductLinesToPayload(lines: OrderProductFormLine[], productOptions: OrderProductOption[]) {
  return lines
    .filter(line => line.productCode.trim() || line.productName.trim())
    .map(line => {
      const resolved = resolveOrderProductFields(productOptions, line.productCode, {
        productName: line.productName,
        unit: line.unit
      });
      const productCode = line.productCode.trim();
      const productName = resolved.productName || line.productName.trim();
      const unit = line.unit.trim() || resolved.unit;
      const quantity = parsePercentInput(line.quantity);

      return {
        ma_sp: productCode,
        ten_sp: productName,
        don_vi: unit,
        so_luong: Number.isFinite(quantity) && quantity > 0 ? quantity : null
      };
    })
    .filter(item => item.ma_sp || item.ten_sp);
}

function orderCellToInput(value: string) {
  return value === '-' ? '' : value;
}

function orderHasProductionOrder(order: OrderRow) {
  return Boolean(order.productionOrder && order.productionOrder !== '-');
}

function orderToForm(order: OrderRow): OrderFormState {
  const orderType = (ORDER_TYPE_OPTIONS as readonly string[]).includes(order.orderType)
    ? order.orderType
    : ORDER_TYPE_OPTIONS[0];

  const productLines = getOrderProductLines(order).map(line => ({
    key: `order-product-${line.productCode}-${Math.random().toString(36).slice(2, 7)}`,
    productCode: orderCellToInput(line.productCode),
    productName: orderCellToInput(line.productName),
    unit: orderCellToInput(line.unit),
    quantity: orderCellToInput(line.quantity)
  }));

  return {
    orderCode: orderCellToInput(order.orderCode),
    orderType,
    staffName: orderCellToInput(order.staffName),
    customer: orderCellToInput(order.customer),
    productLines: productLines.length > 0 ? productLines : [newOrderProductFormLine()],
    note: orderCellToInput(order.note),
    status: (ORDER_STATUS_OPTIONS as readonly string[]).includes(order.status)
      ? order.status
      : order.status && order.status !== '-'
        ? order.status
        : ORDER_STATUS_DEFAULT
  };
}

function OrdersPanel({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingOrder, setViewingOrder] = useState<OrderRow | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [productOptions, setProductOptions] = useState<OrderProductOption[]>([]);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    setOrdersError('');

    try {
      const res = await fetch('/api/don-hang');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải đơn hàng từ Supabase.');
      }

      setOrders(normalizeOrders(data));
    } catch (error: any) {
      setOrders([]);
      setOrdersError(error.message || 'Không thể tải đơn hàng từ Supabase.');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (!formMode) return;

    let cancelled = false;

    const loadLookups = async () => {
      setIsLoadingLookups(true);
      setLookupError('');

      try {
        const [staffRes, customerRes, productRes] = await Promise.all([
          fetch('/api/nhan-su?format=groups&scope=all'),
          fetch('/api/khach-hang'),
          fetch('/api/san-pham?format=table')
        ]);

        const staffData = await staffRes.json().catch(() => ({}));
        const customerData = await customerRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));

        if (!staffRes.ok) {
          throw new Error(staffData.error || 'Không thể tải nhân sự.');
        }
        if (!customerRes.ok) {
          throw new Error(customerData.error || 'Không thể tải khách hàng.');
        }
        if (!productRes.ok) {
          throw new Error(productData.error || 'Không thể tải hàng hóa.');
        }

        if (!cancelled) {
          setStaffOptions(normalizeHcmBusinessStaffOptions(staffData));
          setCustomerOptions(normalizeCustomerOptions(customerData));
          setProductOptions(normalizeOrderProducts(productData));
        }
      } catch (error: any) {
        if (!cancelled) {
          setStaffOptions([]);
          setCustomerOptions([]);
          setProductOptions([]);
          setLookupError(error.message || 'Không thể tải dữ liệu tham chiếu.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLookups(false);
        }
      }
    };

    loadLookups();

    return () => {
      cancelled = true;
    };
  }, [formMode]);

  const openAddForm = () => {
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setOrderForm({
      ...emptyOrderForm(),
      orderCode: generateNextOrderCode(orders.map(order => order.orderCode))
    });
    setFormMode('add');
  };

  const openEditForm = (order: OrderRow) => {
    setFormError('');
    setActionMessage('');
    setViewingOrder(null);
    setEditingId(order.id);
    setOrderForm(orderToForm(order));
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
  };

  const unitSuggestions = useMemo(() => {
    const fromProducts = productOptions.map(product => product.unit).filter(Boolean);
    const fromOrders = orders
      .flatMap(order => getOrderProductLines(order).map(line => line.unit))
      .filter(unit => unit && unit !== '-');
    return [...new Set([...fromProducts, ...fromOrders, ...readUnitSuggestions()])].sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [orders, productOptions]);

  const updateProductLine = (key: string, patch: Partial<OrderProductFormLine>) => {
    setOrderForm(prev => ({
      ...prev,
      productLines: prev.productLines.map(line => (line.key === key ? { ...line, ...patch } : line))
    }));
  };

  const pickOrderProduct = (key: string, productCode: string) => {
    const resolved = resolveOrderProductFields(productOptions, productCode, {});
    const match = findOrderProductByCode(productOptions, productCode);
    updateProductLine(key, {
      productCode,
      productName: resolved.productName,
      unit: resolved.unit || match?.unit || ''
    });
  };

  const handleSaveOrder = async () => {
    if (!orderForm.orderCode.trim()) {
      setFormError('Vui lòng nhập mã đơn hàng.');
      return;
    }

    const products = orderProductLinesToPayload(orderForm.productLines, productOptions);
    if (products.length === 0) {
      setFormError('Vui lòng thêm ít nhất một sản phẩm.');
      return;
    }

    for (const product of products) {
      if (!product.ma_sp && !product.ten_sp) {
        setFormError('Mỗi dòng sản phẩm cần có mã SP hoặc tên SP.');
        return;
      }
      if (!product.so_luong || product.so_luong <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho sản phẩm ${product.ma_sp || product.ten_sp}.`);
        return;
      }
    }

    const payload = {
      orderCode: orderForm.orderCode.trim(),
      orderType: orderForm.orderType,
      staffName: orderForm.staffName,
      customer: orderForm.customer,
      products,
      note: orderForm.note,
      status: orderForm.status
    };

    setIsSavingOrder(true);
    setFormError('');

    try {
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/don-hang/${editingId}` : '/api/don-hang', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật đơn hàng.' : 'Không thể thêm đơn hàng mới.'));
      }

      orderForm.productLines.forEach(line => {
        if (line.unit.trim()) saveUnitSuggestion(line.unit.trim());
      });

      closeForm();
      setActionMessage(isEdit ? 'Đã cập nhật đơn hàng.' : 'Đã thêm đơn hàng mới.');
      await loadOrders();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu đơn hàng.');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleDeleteOrder = async (order: OrderRow) => {
    if (!order.id) {
      setOrdersError('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa đơn "${order.orderCode || order.productCode}"?`)) return;

    setDeletingOrderId(order.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/don-hang/${order.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa đơn hàng.');
      }

      if (viewingOrder?.id === order.id) setViewingOrder(null);
      setActionMessage('Đã xóa đơn hàng.');
      await loadOrders();
    } catch (error: any) {
      setOrdersError(error.message || 'Không thể xóa đơn hàng.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const orderTypes = useMemo(() => {
    const types = orders
      .map(order => order.orderType)
      .filter((type): type is string => type !== '-' && type.length > 0);
    return ['all', ...[...new Set(types)].sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [orders]);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesType = selectedType === 'all' || order.orderType === selectedType;
      const matchesSearch =
        !normalizedSearch ||
        `${order.orderCode} ${order.orderType} ${order.status} ${order.staffName} ${order.customer} ${formatOrderProductsSummary(getOrderProductLines(order))} ${order.note}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [orders, normalizedSearch, selectedType]);

  const customerCount = new Set(orders.map(order => order.customer).filter(customer => customer && customer !== '-')).size;
  const totalQuantity = orders.reduce((sum, order) => {
    const value = Number(order.quantity);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Kế hoạch sản xuất</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Đơn hàng</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase don_hang.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openAddForm}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Đơn hàng', orders.length],
              ['Khách hàng', customerCount],
              ['Tổng SL', formatNumber(totalQuantity)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 shrink-0">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa đơn hàng' : 'Thêm đơn hàng mới'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng don_hang trên Supabase</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            {(formError || lookupError) && (
              <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
                {formError || lookupError}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 p-4">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã đơn *</span>
                <input
                  value={orderForm.orderCode}
                  onChange={e => setOrderForm(prev => ({ ...prev, orderCode: e.target.value }))}
                  readOnly={formMode === 'add'}
                  className={`${orderFieldClass} ${formMode === 'add' ? 'bg-zinc-50 font-black text-zinc-900' : ''}`}
                  placeholder="DH001"
                />
                {formMode === 'add' ? (
                  <p className="text-[11px] font-semibold text-zinc-400">Mã tự tăng theo thứ tự DH001, DH002, DH003...</p>
                ) : null}
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại đơn</span>
                <SearchableSelect
                  value={orderForm.orderType}
                  onChange={orderType => setOrderForm(prev => ({ ...prev, orderType }))}
                  options={[...ORDER_TYPE_OPTIONS]}
                  placeholder="Gõ để tìm loại đơn"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
                {formMode === 'add' ? (
                  <input
                    value={ORDER_STATUS_DEFAULT}
                    readOnly
                    className={`${orderFieldClass} bg-amber-50 font-black text-amber-800`}
                  />
                ) : (
                  <SearchableSelect
                    value={orderForm.status}
                    onChange={status => setOrderForm(prev => ({ ...prev, status }))}
                    options={[...ORDER_STATUS_OPTIONS]}
                    placeholder="Gõ để tìm trạng thái"
                    getLabel={item => String(item)}
                    getValue={item => String(item)}
                    allowEmpty={false}
                  />
                )}
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhân viên</span>
                <SimpleSelect
                  value={orderForm.staffName}
                  onChange={staffName => setOrderForm(prev => ({ ...prev, staffName }))}
                  options={staffOptions}
                  placeholder="Chọn nhân viên KD HCM"
                  isLoading={isLoadingLookups}
                  getValue={item => (item as StaffOption).name}
                  getLabel={item => (item as StaffOption).name}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Khách hàng</span>
                <SimpleSelect
                  value={orderForm.customer}
                  onChange={customer => setOrderForm(prev => ({ ...prev, customer }))}
                  options={customerOptions}
                  placeholder="Chọn khách hàng"
                  isLoading={isLoadingLookups}
                  getValue={item => (item as CustomerOption).name}
                  getLabel={item => {
                    const customer = item as CustomerOption;
                    return customer.code ? `${customer.code} · ${customer.name}` : customer.name;
                  }}
                />
              </label>

              <RepeatableLinesBlock
                className="col-span-2"
                title="Sản phẩm"
                required
                onAdd={() =>
                  setOrderForm(prev => ({
                    ...prev,
                    productLines: [...prev.productLines, newOrderProductFormLine()]
                  }))
                }
                addButtonClassName="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
                columns={[
                  { key: 'code', label: 'Mã SP', className: 'min-w-0 flex-[1.35]', required: true },
                  { key: 'name', label: 'Tên SP', className: 'min-w-0 flex-[1.5]' },
                  { key: 'unit', label: 'ĐVT', className: 'w-24 shrink-0' },
                  { key: 'qty', label: 'SL', className: 'w-24 shrink-0', required: true },
                  { key: 'actions', label: '', className: 'w-10 shrink-0' }
                ]}
              >
                {orderForm.productLines.map(line => {
                  const matchedLineProduct = findOrderProductByCode(productOptions, line.productCode);
                  return (
                    <RepeatableLineRow key={line.key}>
                      <div className="col-span-2 md:min-w-0 md:flex-[1.35]">
                        <SearchableSelect
                          value={line.productCode}
                          onChange={productCode => pickOrderProduct(line.key, productCode)}
                          options={productOptions}
                          placeholder="Gõ để tìm mã SP"
                          isLoading={isLoadingLookups}
                          inputClassName={orderFieldClass}
                          getValue={item => (item as OrderProductOption).code}
                          getLabel={item => {
                            const product = item as OrderProductOption;
                            return product.newCode ? `${product.code} · ${product.name}` : `${product.code} · ${product.name}`;
                          }}
                        />
                      </div>
                      <div className="col-span-2 md:min-w-0 md:flex-[1.5]">
                        <input
                          value={matchedLineProduct ? matchedLineProduct.name : line.productName}
                          readOnly={Boolean(matchedLineProduct)}
                          onChange={e => updateProductLine(line.key, { productName: e.target.value })}
                          className={`${orderFieldClass} ${matchedLineProduct ? 'bg-white text-zinc-800' : 'bg-white'}`}
                          placeholder={matchedLineProduct ? '' : 'Tự động theo mã SP'}
                        />
                      </div>
                      <div className="col-span-1 md:w-24 md:shrink-0">
                        <input
                          list="order-unit-suggestions"
                          value={line.unit}
                          onChange={e => updateProductLine(line.key, { unit: e.target.value })}
                          onBlur={e => {
                            const trimmed = e.target.value.trim();
                            if (trimmed) saveUnitSuggestion(trimmed);
                          }}
                          className={`${orderFieldClass} bg-white`}
                          placeholder="ĐVT"
                        />
                      </div>
                      <div className="col-span-1 md:w-24 md:shrink-0">
                        <input
                          type="number"
                          value={line.quantity}
                          onChange={e => updateProductLine(line.key, { quantity: e.target.value })}
                          className={`${orderFieldClass} bg-white`}
                          placeholder="0"
                        />
                      </div>
                      {orderForm.productLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOrderForm(prev => ({
                              ...prev,
                              productLines: prev.productLines.filter(item => item.key !== line.key)
                            }))
                          }
                          title="Xóa dòng"
                          className="col-span-2 md:col-span-1 md:mb-0.5 flex h-10 w-full md:h-10 md:w-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 font-bold text-xs"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="md:hidden">Xóa dòng này</span>
                        </button>
                      )}
                    </RepeatableLineRow>
                  );
                })}
              </RepeatableLinesBlock>

              <datalist id="order-unit-suggestions">
                {unitSuggestions.map(unit => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={isSavingOrder}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingOrder ? 'Đang lưu...' : formMode === 'edit' ? 'Cập nhật' : 'Lưu đơn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết đơn hàng</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">{viewingOrder.orderCode}</p>
              </div>
              <button type="button" onClick={() => setViewingOrder(null)} className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50">
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 text-sm">
              {[
                ['Mã đơn', viewingOrder.orderCode],
                ['Loại đơn', viewingOrder.orderType],
                ['Trạng thái', viewingOrder.status],
                ['Nhân viên', viewingOrder.staffName],
                ['Khách hàng', viewingOrder.customer],
                ['Ghi chú', viewingOrder.note || '-']
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
                </div>
              ))}
              <div className="col-span-2 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Sản phẩm</p>
                <div className="mt-2 space-y-2">
                  {getOrderProductLines(viewingOrder).map(line => (
                    <div key={`${line.productCode}-${line.quantity}`} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                      <p className="font-bold text-zinc-900">{line.productCode || '-'} · {line.productName || '-'}</p>
                      <p className="mt-0.5 text-zinc-600">
                        SL: {line.quantity || '-'}
                        {line.unit && line.unit !== '-' ? ` ${line.unit}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button type="button" onClick={() => openEditForm(viewingOrder)} className="flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100">
                <Pencil className="h-4 w-4" />
                Sửa
              </button>
              <button
                type="button"
                onClick={() => handleDeleteOrder(viewingOrder)}
                disabled={deletingOrderId === viewingOrder.id}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingOrderId === viewingOrder.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {orderTypes.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedType === type
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {type === 'all' ? 'Tất cả' : type}
            </button>
          ))}
          {isLoadingOrders && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã đơn, khách hàng, mã hàng..."
            disabled={isLoadingOrders}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {ordersError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {ordersError}
          </p>
        )}

        {actionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {actionMessage}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-3 font-black">Mã đơn</th>
                <th className="px-4 py-3 font-black">Loại đơn</th>
                <th className="px-4 py-3 font-black">Trạng thái</th>
                <th className="px-4 py-3 font-black">Nhân viên</th>
                <th className="px-4 py-3 font-black">Khách hàng</th>
                <th className="w-[560px] px-4 py-3 font-black">Sản phẩm</th>
                <th className="px-4 py-3 font-black">Ghi chú</th>
                <th className="px-4 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredOrders.map(order => (
                <tr key={order.id} className="transition hover:bg-red-50/40">
                  <td className="px-4 py-3 font-black text-zinc-950">{order.orderCode || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-[#ef1b2d]/20 bg-red-50 px-2.5 py-1 text-xs font-black text-[#ef1b2d]">
                      {order.orderType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{order.staffName}</td>
                  <td className="px-4 py-3 font-bold text-zinc-800">{order.customer}</td>
                  <td className="w-[560px] px-4 py-3">
                    <div className="min-w-[520px] overflow-hidden rounded-lg border border-zinc-300 bg-white">
                      <div className="grid grid-cols-[1.1fr_1.7fr_0.8fr_0.8fr] divide-x divide-zinc-300 border-b border-zinc-300 bg-zinc-100 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                        <span className="px-3 py-2">Mã SP</span>
                        <span className="px-3 py-2">Tên SP</span>
                        <span className="px-3 py-2 text-right">Số lượng</span>
                        <span className="px-3 py-2">Đơn vị</span>
                      </div>
                      {getOrderProductLines(order).map((line, index) => (
                        <div
                          key={`${order.id}-${line.productCode}-${line.productName}-${index}`}
                          className="grid grid-cols-[1.1fr_1.7fr_0.8fr_0.8fr] divide-x divide-zinc-200 border-b border-zinc-200 text-xs font-semibold text-zinc-700 last:border-b-0"
                        >
                          <span className="px-3 py-2 font-black text-zinc-950">{line.productCode || '-'}</span>
                          <span className="px-3 py-2 text-zinc-800">{line.productName || '-'}</span>
                          <span className="px-3 py-2 text-right font-mono font-bold text-zinc-900">{line.quantity || '-'}</span>
                          <span className="px-3 py-2 font-bold text-zinc-700">{line.unit || '-'}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-500">{order.note || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingOrder(order)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(order)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(order)}
                        disabled={deletingOrderId === order.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingOrderId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoadingOrders && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Bảng don_hang chưa có dữ liệu hoặc không có đơn phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatTimeCell(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

interface SettingRow {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  timeFrame: string;
  startTime: string;
  endTime: string;
  group: string;
  note: string;
}

function normalizeSettings(data: unknown): SettingRow[] {
  if (!data || typeof data !== 'object') return [];
  const settings = (data as { settings?: unknown }).settings;
  if (!Array.isArray(settings)) return [];

  return settings
    .map((item): SettingRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_cai_dat', 'ma', 'key', 'code'], '');
      const name = pickText(record, ['ten_cai_dat', 'hang_muc', 'ten', 'name', 'tieu_de'], '');
      const startTime = formatTimeCell(
        record.gio_bat_dau ?? record.thoi_gian_bat_dau ?? record.start_time ?? record.gio_bd
      );
      let endTime = formatTimeCell(
        record.gio_ket_thuc ?? record.thoi_gian_ket_thuc ?? record.end_time ?? record.gio_kt
      );
      if (startTime === '-' || endTime === '-') {
        const legacyValue = formatCell(record.gia_tri);
        if (legacyValue !== '-') {
          const parts = legacyValue.split(/\s*[-–—]\s*|\s+đến\s+/i).map(part => part.trim()).filter(Boolean);
          if (parts[0]) {
            const parsedStart = formatTimeCell(parts[0]);
            if (parsedStart !== '-') {
              const parsedEnd = parts[1] ? formatTimeCell(parts[1]) : '-';
              return {
                id: pickText(record, ['id'], code || name),
                code,
                name,
                loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
                timeFrame: pickText(record, ['khung_gio'], '-'),
                startTime: startTime === '-' ? parsedStart : startTime,
                endTime: endTime === '-' ? parsedEnd : endTime,
                group: pickText(record, ['nhom', 'group', 'phan_loai'], '-'),
                note: pickText(record, ['mo_ta', 'ghi_chu', 'note', 'description'], '')
              };
            }
          }
        }
      }
      if (!code && !name && startTime === '-' && endTime === '-') return null;

      return {
        id: pickText(record, ['id'], code || name),
        code,
        name,
        loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
        timeFrame: pickText(record, ['khung_gio'], '-'),
        startTime,
        endTime,
        group: pickText(record, ['nhom', 'group', 'phan_loai'], '-'),
        note: pickText(record, ['mo_ta', 'ghi_chu', 'note', 'description'], '')
      };
    })
    .filter((setting): setting is SettingRow => Boolean(setting));
}

const SETTING_TYPE_OPTIONS = ['Thời gian', 'Ca máy', 'Sản xuất', 'Chung'] as const;

type SettingFormState = {
  code: string;
  name: string;
  loaiCaiDat: string;
  startTime: string;
  endTime: string;
  group: string;
  note: string;
};

const emptySettingForm = (): SettingFormState => ({
  code: '',
  name: '',
  loaiCaiDat: SETTING_TYPE_OPTIONS[0],
  startTime: '',
  endTime: '',
  group: 'Chung',
  note: ''
});

function settingToForm(setting: SettingRow): SettingFormState {
  const loaiCaiDat = (SETTING_TYPE_OPTIONS as readonly string[]).includes(setting.loaiCaiDat)
    ? setting.loaiCaiDat
    : SETTING_TYPE_OPTIONS[0];

  return {
    code: setting.code === '-' ? '' : setting.code,
    name: setting.name === '-' ? '' : setting.name,
    loaiCaiDat,
    startTime: setting.startTime === '-' ? '' : setting.startTime,
    endTime: setting.endTime === '-' ? '' : setting.endTime,
    group: setting.group === '-' ? 'Chung' : setting.group,
    note: setting.note === '-' ? '' : setting.note
  };
}

function SettingsPanel({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingSetting, setViewingSetting] = useState<SettingRow | null>(null);
  const [deletingSettingId, setDeletingSettingId] = useState<string | null>(null);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [settingForm, setSettingForm] = useState<SettingFormState>(emptySettingForm);

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    setSettingsError('');

    try {
      const res = await fetch('/api/cai-dat');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải cài đặt từ Supabase.');
      }

      setSettings(normalizeSettings(data));
    } catch (error: any) {
      setSettings([]);
      setSettingsError(error.message || 'Không thể tải cài đặt từ Supabase.');
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const openAddForm = () => {
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setSettingForm(emptySettingForm());
    setFormMode('add');
  };

  const openEditForm = (setting: SettingRow) => {
    setFormError('');
    setActionMessage('');
    setViewingSetting(null);
    setEditingId(setting.id);
    setSettingForm(settingToForm(setting));
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
  };

  const validateSettingForm = () => {
    if (!settingForm.code.trim()) {
      setFormError('Vui lòng nhập mã cài đặt.');
      return false;
    }
    if (!settingForm.name.trim()) {
      setFormError('Vui lòng nhập hạng mục / tên cài đặt.');
      return false;
    }
    if (!settingForm.loaiCaiDat.trim()) {
      setFormError('Vui lòng chọn loại cài đặt (loai_cai_dat).');
      return false;
    }
    if (!settingForm.startTime) {
      setFormError('Vui lòng chọn giờ bắt đầu.');
      return false;
    }
    if (!settingForm.endTime) {
      setFormError('Vui lòng chọn giờ kết thúc.');
      return false;
    }
    return true;
  };

  const handleSaveSetting = async () => {
    if (!validateSettingForm()) return;

    setIsSavingSetting(true);
    setFormError('');

    try {
      const payload = {
        ...settingForm,
        khungGio: `${settingForm.startTime} - ${settingForm.endTime}`
      };
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/cai-dat/${editingId}` : '/api/cai-dat', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật cài đặt.' : 'Không thể thêm cài đặt mới.'));
      }

      closeForm();
      setActionMessage(isEdit ? 'Đã cập nhật cài đặt.' : 'Đã thêm cài đặt mới.');
      await loadSettings();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu cài đặt.');
    } finally {
      setIsSavingSetting(false);
    }
  };

  const handleDeleteSetting = async (setting: SettingRow) => {
    if (!setting.id) {
      setActionMessage('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa cài đặt "${setting.name || setting.code}"?`)) return;

    setDeletingSettingId(setting.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/cai-dat/${setting.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa cài đặt.');
      }

      if (viewingSetting?.id === setting.id) setViewingSetting(null);
      setActionMessage('Đã xóa cài đặt.');
      await loadSettings();
    } catch (error: any) {
      setActionMessage(error.message || 'Không thể xóa cài đặt.');
    } finally {
      setDeletingSettingId(null);
    }
  };

  const settingGroups = useMemo(() => {
    const groups = settings
      .map(setting => setting.group)
      .filter((group): group is string => group !== '-' && group.length > 0);
    return ['all', ...[...new Set(groups)].sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [settings]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredSettings = useMemo(() => {
    return settings.filter(setting => {
      const matchesGroup = selectedGroup === 'all' || setting.group === selectedGroup;
      const matchesSearch =
        !normalizedSearch ||
        `${setting.code} ${setting.name} ${setting.loaiCaiDat} ${setting.timeFrame} ${setting.startTime} ${setting.endTime} ${setting.group} ${setting.note}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesGroup && matchesSearch;
    });
  }, [normalizedSearch, selectedGroup, settings]);

  const filledTimeRangeCount = settings.filter(
    setting => setting.startTime !== '-' && setting.endTime !== '-'
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Tham số hệ thống</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Cài đặt</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase cai_dat_thoi_gian.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={openAddForm}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Mục cài đặt', settings.length],
              ['Nhóm', settingGroups.length > 0 ? settingGroups.length - 1 : 0],
              ['Đủ khung giờ', filledTimeRangeCount]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa cài đặt' : 'Thêm cài đặt mới'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng cai_dat_thoi_gian trên Supabase</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            {formError && (
              <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 p-4">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã cài đặt *</span>
                <input
                  value={settingForm.code}
                  onChange={e => setSettingForm(prev => ({ ...prev, code: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: TG_CA_SANG"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Hạng mục *</span>
                <input
                  value={settingForm.name}
                  onChange={e => setSettingForm(prev => ({ ...prev, name: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: Ca sáng"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại cài đặt *</span>
                <SearchableSelect
                  value={settingForm.loaiCaiDat}
                  onChange={loaiCaiDat => setSettingForm(prev => ({ ...prev, loaiCaiDat }))}
                  options={[...SETTING_TYPE_OPTIONS]}
                  placeholder="Gõ để tìm loại cài đặt"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu *</span>
                <input
                  type="time"
                  value={settingForm.startTime}
                  onChange={e => setSettingForm(prev => ({ ...prev, startTime: e.target.value }))}
                  className={orderFieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ kết thúc *</span>
                <input
                  type="time"
                  value={settingForm.endTime}
                  onChange={e => setSettingForm(prev => ({ ...prev, endTime: e.target.value }))}
                  className={orderFieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhóm</span>
                <input
                  value={settingForm.group}
                  onChange={e => setSettingForm(prev => ({ ...prev, group: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: Thời gian"
                />
              </label>
              <label className="col-span-2 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input
                  value={settingForm.note}
                  onChange={e => setSettingForm(prev => ({ ...prev, note: e.target.value }))}
                  className={orderFieldClass}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveSetting}
                disabled={isSavingSetting}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingSetting ? 'Đang lưu...' : formMode === 'edit' ? 'Cập nhật' : 'Lưu cài đặt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingSetting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết cài đặt</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">{viewingSetting.code || viewingSetting.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSetting(null)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              {[
                ['Mã cài đặt', viewingSetting.code],
                ['Hạng mục', viewingSetting.name],
                ['Loại cài đặt', viewingSetting.loaiCaiDat],
                ['Khung giờ', viewingSetting.timeFrame !== '-' ? viewingSetting.timeFrame : `${viewingSetting.startTime} - ${viewingSetting.endTime}`],
                ['Giờ bắt đầu', viewingSetting.startTime],
                ['Giờ kết thúc', viewingSetting.endTime],
                ['Nhóm', viewingSetting.group],
                ['Ghi chú', viewingSetting.note || '-']
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={() => openEditForm(viewingSetting)}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100"
              >
                <Pencil className="h-4 w-4" />
                Sửa
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSetting(viewingSetting)}
                disabled={deletingSettingId === viewingSetting.id}
                className="flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingSettingId === viewingSetting.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {settingGroups.map(group => (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedGroup(group)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedGroup === group
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {group === 'all' ? 'Tất cả' : group}
            </button>
          ))}
          {isLoadingSettings && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[420px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm mã, tên, giá trị cài đặt..."
            disabled={isLoadingSettings}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {settingsError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 lg:mt-0">
            {settingsError}
          </p>
        )}

        {actionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {actionMessage}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-3 font-black">Mã</th>
                <th className="px-4 py-3 font-black">Tên cài đặt</th>
                <th className="px-4 py-3 font-black">Loại</th>
                <th className="px-4 py-3 font-black">Giờ bắt đầu</th>
                <th className="px-4 py-3 font-black">Giờ kết thúc</th>
                <th className="px-4 py-3 font-black">Nhóm</th>
                <th className="px-4 py-3 font-black">Ghi chú</th>
                <th className="px-4 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredSettings.map(setting => (
                <tr key={setting.id} className="transition hover:bg-red-50/40">
                  <td className="px-4 py-3 font-black text-zinc-950">{setting.code || '-'}</td>
                  <td className="px-4 py-3 font-black text-zinc-950">{setting.name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-black text-zinc-800">
                      {setting.loaiCaiDat}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-[#ef1b2d]/20 bg-red-50 px-2.5 py-1 text-xs font-black text-[#ef1b2d]">
                      {setting.startTime}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-black text-zinc-800">
                      {setting.endTime}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{setting.group}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-500">{setting.note || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingSetting(setting)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(setting)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSetting(setting)}
                        disabled={deletingSettingId === setting.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingSettingId === setting.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoadingSettings && filteredSettings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-bold text-zinc-500">
                    Bảng cai_dat_thoi_gian chưa có dữ liệu hoặc không có mục phù hợp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function flattenHrMembers(branches: HrBranch[]): HrMember[] {
  return branches.flatMap(branch => branch.departments.flatMap(department => department.members));
}

function getHrDepartmentMembers(branches: HrBranch[], departmentName: string): HrMember[] {
  const needle = departmentName.trim().toLowerCase();
  if (!needle) return [];

  const members: HrMember[] = [];
  const seen = new Set<string>();

  branches.forEach(branch => {
    branch.departments.forEach(department => {
      if (!department.name.toLowerCase().includes(needle)) return;
      department.members.forEach(member => {
        const key = member.name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        members.push(member);
      });
    });
  });

  return members.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function parseProductionOrderFilterDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function splitProductionOrderStaffNames(value: string): string[] {
  return String(value || '')
    .split(/[,;+]/)
    .map(name => name.trim())
    .filter(name => name && name !== '-');
}

function DashboardWindow({
  title,
  subtitle,
  icon: Icon,
  accentClass,
  count,
  countLabel,
  search,
  onSearchChange,
  isLoading,
  error,
  onOpen,
  openLabel,
  disabled,
  secondaryAction,
  tertiaryAction,
  summaryExtra,
  compact = false,
  children
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
  count: number;
  countLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  error: string;
  onOpen: () => void;
  openLabel: string;
  disabled?: boolean;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  tertiaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  summaryExtra?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm ${
        compact ? 'min-h-[300px]' : 'min-h-[440px]'
      }`}
    >
      <div className={`flex items-start justify-between gap-2 border-b border-zinc-100 ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${accentClass}`}>
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={`flex shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 ${
              compact ? 'h-8 w-8' : 'h-10 w-10'
            }`}
          >
            <Icon className={compact ? 'h-4 w-4 text-white' : 'h-5 w-5 text-white'} />
          </span>
          <div className="min-w-0">
            <h3 className={`font-black text-white ${compact ? 'text-sm' : 'text-base'}`}>{title}</h3>
            {!compact && <p className="mt-0.5 text-xs font-semibold text-white/75">{subtitle}</p>}
            <p className={`font-bold uppercase tracking-wider text-white/60 ${compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'}`}>
              {countLabel}: <span className="text-white">{isLoading ? '...' : count}</span>
            </p>
            {summaryExtra ? (
              <p className={`font-bold uppercase tracking-wider text-white/70 ${compact ? 'mt-0.5 text-[10px]' : 'mt-1 text-[11px]'}`}>
                {summaryExtra}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1.5">
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled || secondaryAction.loading}
              className="rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {secondaryAction.loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang tạo...
                </span>
              ) : (
                secondaryAction.label
              )}
            </button>
          )}
          {tertiaryAction && (
            <button
              type="button"
              onClick={tertiaryAction.onClick}
              disabled={tertiaryAction.disabled || tertiaryAction.loading}
              className="rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tertiaryAction.loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang in...
                </span>
              ) : (
                tertiaryAction.label
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={disabled}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {openLabel}
          </button>
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${compact ? 'p-2' : 'p-3'}`}>
        <label className={`flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-2 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 ${compact ? 'h-8' : 'h-10'}`}>
          <Search className={`text-zinc-400 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Lọc nhanh..."
            disabled={isLoading}
            className={`min-w-0 flex-1 bg-transparent font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none ${compact ? 'text-xs' : 'text-sm'}`}
          />
        </label>

        {error && (
          <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-100">
          {isLoading ? (
            <div className={`flex h-full items-center justify-center font-bold text-zinc-400 ${compact ? 'min-h-[160px] text-xs' : 'min-h-[240px] text-sm'}`}>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </section>
  );
}

function ControlBoardPanel({
  onNavigate,
  onMachineReport,
  onEditWeighing
}: {
  onNavigate: (tab: AppTab) => void;
  onMachineReport: (machine: MachineRow, type: 'mixing' | 'nvl') => void;
  onEditWeighing?: (pending: WeighingPendingAdd) => void;
}) {
  const [staffBranches, setStaffBranches] = useState<HrBranch[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [productionOrderSettings, setProductionOrderSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [acceptanceReports, setAcceptanceReports] = useState<AcceptanceReport[]>([]);
  const [shiftSummaryAcceptanceReports, setShiftSummaryAcceptanceReports] = useState<AcceptanceReport[]>([]);
  const [mixingReports, setMixingReports] = useState<MixingReport[]>([]);
  const [weighingRecords, setWeighingRecords] = useState<WeighingRecord[]>([]);
  const [machineNvlReports, setMachineNvlReports] = useState<MachineNvlSavedReport[]>([]);
  const [shiftSummaryWarehouseMovements, setShiftSummaryWarehouseMovements] = useState<WarehouseMovementRow[]>([]);
  const defaultShiftSummaryRange = defaultShiftSummaryDateRange(14);
  const [shiftSummaryDateFrom, setShiftSummaryDateFrom] = useState(defaultShiftSummaryRange.from);
  const [shiftSummaryDateTo, setShiftSummaryDateTo] = useState(defaultShiftSummaryRange.to);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [productionOrderSearch, setProductionOrderSearch] = useState('');
  const [productionOrderDateFrom, setProductionOrderDateFrom] = useState('');
  const [productionOrderDateTo, setProductionOrderDateTo] = useState('');
  const [productionOrderShiftFilter, setProductionOrderShiftFilter] = useState('all');
  const [productionOrderStaffFilters, setProductionOrderStaffFilters] = useState<Set<string>>(() => new Set());
  const [acceptanceReportSearch, setAcceptanceReportSearch] = useState('');
  const [showAddProductionOrder, setShowAddProductionOrder] = useState(false);
  const [showProductionPlan, setShowProductionPlan] = useState(false);
  const [viewingProductionOrder, setViewingProductionOrder] = useState<ProductionOrderRow | null>(null);
  const [editingProductionOrder, setEditingProductionOrder] = useState<ProductionOrderRow | null>(null);
  const [deletingProductionOrderId, setDeletingProductionOrderId] = useState('');
  const [deletingAcceptanceReportId, setDeletingAcceptanceReportId] = useState('');
  const [selectedProductionOrderIds, setSelectedProductionOrderIds] = useState<string[]>([]);
  const [printingBatchOrders, setPrintingBatchOrders] = useState<PrintableProductionOrder[]>([]);
  const [pendingBatchPrint, setPendingBatchPrint] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const { printingOrder, printingMaterials, printingProduct, printingMachineLabel, shiftSettings, isLoadingPrint, printProductionOrder } = useProductionOrderPrint();

  const loadBoard = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const summaryFrom = shiftSummaryDateFrom || defaultShiftSummaryRange.from;
      const summaryTo = shiftSummaryDateTo || defaultShiftSummaryRange.to;
      const [staffRes, orderRes, productRes, machineRes, materialRes, productionRes, settingRes, acceptanceRes, shiftSummaryAcceptanceRes, mixingRes, weighingRes, machineNvlRes, warehouseMovementRes] =
        await Promise.all([
        fetch('/api/nhan-su?format=groups'),
        fetch('/api/don-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-may'),
        fetch('/api/kho-nvl'),
        fetch('/api/lenh-sx'),
        fetch('/api/cai-dat'),
        fetch('/api/bao-cao-nghiem-thu?limit=30'),
        fetch(
          `/api/bao-cao-nghiem-thu?tu_ngay=${encodeURIComponent(summaryFrom)}&den_ngay=${encodeURIComponent(summaryTo)}`
        ),
        fetch(`/api/bao-cao-phoi-tron?tu_ngay=${encodeURIComponent(summaryFrom)}&den_ngay=${encodeURIComponent(summaryTo)}`),
        fetch(`/api/phieu-can-dinh-ki?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`),
        fetch('/api/bao-cao-may-nvl-ton?limit=300'),
        fetch(
          `/api/phieu-xuat-nhap-kho?loai_kho=nvl&from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`
        )
      ]);

      const staffData = await staffRes.json().catch(() => ({}));
      const orderData = await orderRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const machineData = await machineRes.json().catch(() => ({}));
      const materialData = await materialRes.json().catch(() => ({}));
      const productionData = await productionRes.json().catch(() => ({}));
      const settingData = await settingRes.json().catch(() => ({}));
      const acceptanceData = await acceptanceRes.json().catch(() => ({}));
      const shiftSummaryAcceptanceData = await shiftSummaryAcceptanceRes.json().catch(() => ({}));
      const mixingData = await mixingRes.json().catch(() => ({}));
      const weighingData = await weighingRes.json().catch(() => ([]));
      const machineNvlData = await machineNvlRes.json().catch(() => ({}));
      const warehouseMovementData = await warehouseMovementRes.json().catch(() => ({}));

      if (!staffRes.ok) throw new Error(staffData.error || 'Không thể tải nhân sự.');
      if (!orderRes.ok) throw new Error(orderData.error || 'Không thể tải đơn hàng.');
      if (!productRes.ok) throw new Error(productData.error || 'Không thể tải sản phẩm.');
      if (!machineRes.ok) throw new Error(machineData.error || 'Không thể tải danh sách máy.');
      if (!materialRes.ok) throw new Error(materialData.error || 'Không thể tải kho NVL.');
      if (!productionRes.ok) throw new Error(productionData.error || 'Không thể tải lệnh sản xuất.');

      setStaffBranches(normalizeHrBranches(staffData));
      setOrders(normalizeOrders(orderData));
      setProducts(normalizeProducts(productData));
      setMachines(normalizeMachines(machineData));
      setMaterials(normalizeMaterialsInventory(materialData));
      setProductionOrders(normalizeProductionOrders(productionData));
      setProductionOrderSettings(settingRes.ok ? mapProductionOrderSettings(settingData) : []);
      if (acceptanceRes.ok) {
        setAcceptanceReports(normalizeAcceptanceReports(acceptanceData));
      } else {
        setAcceptanceReports([]);
      }

      if (shiftSummaryAcceptanceRes.ok) {
        setShiftSummaryAcceptanceReports(normalizeAcceptanceReports(shiftSummaryAcceptanceData));
      } else {
        setShiftSummaryAcceptanceReports([]);
      }

      if (mixingRes.ok) {
        const mixingList = Array.isArray(mixingData.reports) ? mixingData.reports : [];
        setMixingReports(mixingList.map((item: Record<string, unknown>) => normalizeMixingReport(item)));
      } else {
        setMixingReports([]);
      }

      if (weighingRes.ok) {
        setWeighingRecords(normalizeWeighingRecords(weighingData));
      } else {
        setWeighingRecords([]);
      }

      if (machineNvlRes.ok) {
        setMachineNvlReports(normalizeMachineNvlReports(machineNvlData));
      } else {
        setMachineNvlReports([]);
      }

      if (warehouseMovementRes.ok) {
        setShiftSummaryWarehouseMovements(normalizeWarehouseMovements(warehouseMovementData));
      } else {
        setShiftSummaryWarehouseMovements([]);
      }

      const usingLocalFallback = [machineData, staffData, orderData, materialData, productionData].some(
        payload => payload && typeof payload === 'object' && (payload as { source?: string }).source === 'local'
      );
      if (usingLocalFallback) {
        setLoadError(
          'Chưa kết nối Supabase — dữ liệu đang rỗng. Kiểm tra file .env (SUPABASE_URL, SUPABASE_SERVICE_KEY) rồi khởi động lại server: npm run dev.'
        );
      }
    } catch (error: any) {
      setStaffBranches([]);
      setOrders([]);
      setProducts([]);
      setMachines([]);
      setMaterials([]);
      setProductionOrders([]);
      setProductionOrderSettings([]);
      setAcceptanceReports([]);
      setShiftSummaryAcceptanceReports([]);
      setMixingReports([]);
      setWeighingRecords([]);
      setMachineNvlReports([]);
      setShiftSummaryWarehouseMovements([]);
      setLoadError(error.message || 'Không thể tải dữ liệu bảng điều khiển.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [shiftSummaryDateFrom, shiftSummaryDateTo]);

  const shiftSummaryWarehouseMovementRefs = useMemo(
    () => mapWarehouseMovementsForShiftSummary(shiftSummaryWarehouseMovements),
    [shiftSummaryWarehouseMovements]
  );

  const shiftSummaryRows = useMemo(
    () =>
      buildControlBoardShiftSummary({
        shiftSettings: productionOrderSettings,
        productionOrders,
        products: products.map(product => ({ code: product.code, totalWeight: product.totalWeight })),
        acceptanceReports: shiftSummaryAcceptanceReports,
        warehouseMovements: shiftSummaryWarehouseMovementRefs,
        weighingRecords,
        machineNvlReports,
        dateFrom: shiftSummaryDateFrom,
        dateTo: shiftSummaryDateTo
      }),
    [
      productionOrderSettings,
      productionOrders,
      products,
      shiftSummaryAcceptanceReports,
      shiftSummaryWarehouseMovementRefs,
      weighingRecords,
      machineNvlReports,
      shiftSummaryDateFrom,
      shiftSummaryDateTo
    ]
  );

  const shiftSummaryFilterSources = useMemo(
    () => ({
      shiftSettings: productionOrderSettings,
      productionOrders: productionOrders.map(order => ({
        startDate: order.startDate,
        shift: order.shift,
        staff: order.staff
      })),
      mixingReports: mixingReports.map(report => ({
        ngay: report.ngay,
        ca: report.ca,
        nhan_su: report.nhan_su
      })),
      warehouseMovements: shiftSummaryWarehouseMovementRefs.map(movement => ({
        slipDate: movement.slipDate,
        shift: movement.shift,
        createdBy: movement.createdBy
      })),
      machineNvlReports: machineNvlReports.map(report => ({
        ngay: report.ngay,
        ca: report.ca,
        nhanSu: report.nhanSu
      })),
      weighingRecords: weighingRecords.map(record => ({
        productionDate: record.productionDate,
        reportDate: record.reportDate,
        shiftName: record.shiftName,
        worker1: record.worker1,
        worker2: record.worker2
      }))
    }),
    [productionOrderSettings, productionOrders, mixingReports, shiftSummaryWarehouseMovementRefs, machineNvlReports, weighingRecords]
  );

  const shiftSummaryShiftOptions = useMemo(() => {
    const fromSettings = productionOrderSettings
      .filter(setting => setting.loaiCaiDat === 'Thời gian')
      .map(setting => setting.name || setting.code)
      .filter(value => value && value !== '-');

    const fromRows = shiftSummaryRows.map(row => row.ca).filter(Boolean);
    return [...new Set(fromSettings.length > 0 ? fromSettings : fromRows)].sort((a, b) =>
      a.localeCompare(b, 'vi', { numeric: true })
    );
  }, [productionOrderSettings, shiftSummaryRows]);

  const shiftSummaryStaffOptions = useMemo(
    () => collectShiftSummaryStaffOptions(shiftSummaryFilterSources),
    [shiftSummaryFilterSources]
  );

  const handleDeleteWeighingRecord = async (recordId: string | number) => {
    const res = await fetch(`/api/phieu-can-dinh-ki/${recordId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa dòng cân.');
    }
    await loadBoard();
  };

  const handleDeleteWeighingRecords = async (recordIds: Array<string | number>) => {
    for (const recordId of recordIds) {
      const res = await fetch(`/api/phieu-can-dinh-ki/${recordId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa dòng cân.');
      }
    }
    await loadBoard();
  };

  const handleDeleteWarehouseSlip = async (slipCode: string) => {
    const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa phiếu xuất nhập kho.');
    }
    await loadBoard();
  };

  const handleDeleteWarehouseSlips = async (slipCodes: string[]) => {
    const uniqueIds = Array.from(new Set(slipCodes.filter(Boolean)));
    for (const slipCode of uniqueIds) {
      const res = await fetch(`/api/phieu-xuat-nhap-kho/slip/${encodeURIComponent(slipCode)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa phiếu xuất nhập kho.');
      }
    }
    await loadBoard();
  };

  const handleDeleteMixingReport = async (reportId: string) => {
    const res = await fetch(`/api/bao-cao-phoi-tron/${reportId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa báo cáo phối trộn.');
    }
    await loadBoard();
  };

  const handleDeleteMixingReports = async (reportIds: string[]) => {
    const uniqueIds = Array.from(new Set(reportIds.filter(Boolean)));
    for (const reportId of uniqueIds) {
      const res = await fetch(`/api/bao-cao-phoi-tron/${reportId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa báo cáo phối trộn.');
      }
    }
    await loadBoard();
  };

  const handleDeleteMachineNvlReport = async (reportId: string) => {
    const res = await fetch(`/api/bao-cao-may-nvl-ton/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa báo cáo tồn NVL đầu ca.');
    }
    await loadBoard();
  };

  const handleDeleteMachineNvlReports = async (reportIds: string[]) => {
    const uniqueIds = Array.from(new Set(reportIds.filter(Boolean)));
    for (const reportId of uniqueIds) {
      const res = await fetch(`/api/bao-cao-may-nvl-ton/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa báo cáo tồn NVL đầu ca.');
      }
    }
    await loadBoard();
  };

  const handleEditWeighingRecord = (recordId: string | number) => {
    const record = weighingRecords.find(item => item.id === recordId);
    if (!record || !onEditWeighing) return;
    onEditWeighing(buildWeighingEditPending(record, weighingRecords));
  };

  const shiftSummaryDetailSources = useMemo(
    () => ({
      shiftSettings: productionOrderSettings,
      productionOrders: productionOrders.map(order => ({
        code: order.code,
        startDate: order.startDate,
        shift: order.shift,
        productCode: order.productCode,
        productName: order.productName,
        quantity: order.quantity,
        unit: order.unit,
        products: order.products
      })),
      products: products.map(product => ({ code: product.code, totalWeight: product.totalWeight })),
      acceptanceReports: shiftSummaryAcceptanceReports,
      warehouseMovements: shiftSummaryWarehouseMovementRefs,
      weighingRecords,
      machineNvlReports
    }),
    [
      productionOrderSettings,
      productionOrders,
      products,
      shiftSummaryAcceptanceReports,
      shiftSummaryWarehouseMovementRefs,
      weighingRecords,
      machineNvlReports
    ]
  );

  const staffMembers = useMemo(() => flattenHrMembers(staffBranches), [staffBranches]);
  const staffQuery = staffSearch.trim().toLowerCase();
  const filteredStaff = useMemo(() => {
    if (!staffQuery) return staffMembers;
    return staffMembers.filter(member =>
      `${member.name} ${member.role} ${member.shift} ${member.status}`.toLowerCase().includes(staffQuery)
    );
  }, [staffMembers, staffQuery]);

  const orderQuery = orderSearch.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    if (!orderQuery) return orders;
    return orders.filter(order =>
      `${order.orderCode} ${formatOrderProductsSummary(getOrderProductLines(order))} ${order.customer} ${order.status} ${order.stockQuantity}`
        .toLowerCase()
        .includes(orderQuery)
    );
  }, [orders, orderQuery]);

  const productQuery = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!productQuery) return products;
    return products.filter(product =>
      `${product.code} ${product.name} ${product.group} ${product.nature}`.toLowerCase().includes(productQuery)
    );
  }, [products, productQuery]);

  const machineQuery = machineSearch.trim().toLowerCase();
  const filteredMachines = useMemo(() => {
    if (!machineQuery) return machines;
    return machines.filter(machine =>
      `${machine.code} ${machine.name} ${machine.type} ${machine.branch} ${machine.location} ${machine.status}`
        .toLowerCase()
        .includes(machineQuery)
    );
  }, [machines, machineQuery]);

  const materialQuery = materialSearch.trim().toLowerCase();
  const filteredMaterials = useMemo(() => {
    if (!materialQuery) return materials;
    return materials.filter(material =>
      `${material.code} ${material.name} ${material.unit}`.toLowerCase().includes(materialQuery)
    );
  }, [materials, materialQuery]);

  const productionOrderQuery = productionOrderSearch.trim().toLowerCase();
  const productionOrderShiftOptions = useMemo(() => {
    const fromTimeSettings = productionOrderSettings
      .filter(setting => setting.loaiCaiDat === 'Thời gian')
      .map(setting => setting.name || setting.code)
      .filter(value => value && value !== '-');

    const fallbackFromOrders = productionOrders
      .map(row => (row.shift && row.shift !== '-' ? row.shift : 'Chưa phân ca'))
      .filter(Boolean);

    return [...new Set(fromTimeSettings.length > 0 ? fromTimeSettings : fallbackFromOrders)].sort((a, b) =>
      a.localeCompare(b, 'vi', { numeric: true })
    );
  }, [productionOrderSettings, productionOrders]);
  const productionOrderStaffOptions = useMemo(() => {
    return [
      ...new Set(productionOrders.flatMap(row => splitProductionOrderStaffNames(row.staff)))
    ].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [productionOrders]);
  const recentProductionOrders = useMemo(() => {
    const sorted = [...productionOrders].sort(compareProductionOrderPriority);

    return sorted.filter(row =>
      {
        const matchesSearch =
          !productionOrderQuery ||
          `${row.code} ${row.name} ${row.productCode} ${row.productName} ${row.customer} ${row.orderRef} ${row.status} ${row.machine} ${row.position} ${resolveProductionOrderMachine(row, machines)} ${row.shift} ${row.staff}`
            .toLowerCase()
            .includes(productionOrderQuery);
        const rowDate = parseProductionOrderFilterDate(row.startDate);
        const matchesDateFrom = !productionOrderDateFrom || (rowDate && rowDate >= productionOrderDateFrom);
        const matchesDateTo = !productionOrderDateTo || (rowDate && rowDate <= productionOrderDateTo);
        const rowShift = row.shift && row.shift !== '-' ? row.shift : 'Chưa phân ca';
        const matchesShift = productionOrderShiftFilter === 'all' || rowShift === productionOrderShiftFilter;
        const rowStaff = splitProductionOrderStaffNames(row.staff);
        const matchesStaff =
          productionOrderStaffFilters.size === 0 ||
          rowStaff.some(name => productionOrderStaffFilters.has(name));

        return matchesSearch && matchesDateFrom && matchesDateTo && matchesShift && matchesStaff;
      }
    );
  }, [
    productionOrders,
    productionOrderQuery,
    productionOrderDateFrom,
    productionOrderDateTo,
    productionOrderShiftFilter,
    productionOrderStaffFilters,
    machines
  ]);

  const acceptanceReportQuery = acceptanceReportSearch.trim().toLowerCase();
  const filteredAcceptanceReports = useMemo(() => {
    if (!acceptanceReportQuery) return acceptanceReports;
    return acceptanceReports.filter(report =>
      `${report.ngay} ${report.ca} ${report.lan} ${report.gio} ${report.ma_may} ${report.ten_may} ${report.mat_hang} ${report.don_vi} ${report.so_luong ?? ''}`
        .toLowerCase()
        .includes(acceptanceReportQuery)
    );
  }, [acceptanceReports, acceptanceReportQuery]);
  const totalAcceptanceRolls = useMemo(
    () =>
      acceptanceReports.reduce((sum, report) => {
        const unit = String(report.don_vi || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (unit !== 'cuon') return sum;
        return sum + (report.so_luong ?? 0);
      }, 0),
    [acceptanceReports]
  );

  const previewLimit = 12;
  const sidePreviewLimit = 6;
  const productionPreviewLimit = 20;
  const visibleProductionOrders = recentProductionOrders.slice(0, productionPreviewLimit);
  const selectedProductionOrdersForPlan = useMemo(
    () => productionOrders.filter(row => selectedProductionOrderIds.includes(row.id)),
    [productionOrders, selectedProductionOrderIds]
  );
  const selectedVisibleProductionOrderIds = visibleProductionOrders
    .map(row => row.id)
    .filter(id => selectedProductionOrderIds.includes(id));
  const allVisibleProductionOrdersSelected =
    visibleProductionOrders.length > 0 && selectedVisibleProductionOrderIds.length === visibleProductionOrders.length;
  const hasAnyVisibleProductionOrderSelected = selectedVisibleProductionOrderIds.length > 0;

  useEffect(() => {
    setSelectedProductionOrderIds(prev => prev.filter(id => productionOrders.some(row => row.id === id)));
  }, [productionOrders]);

  const handleDeleteProductionOrder = async (row: ProductionOrderRow) => {
    const label = row.code || row.name || 'lệnh SX';
    if (!window.confirm(`Xóa ${label}?`)) return;

    setDeletingProductionOrderId(row.id);
    try {
      const res = await fetch(`/api/lenh-sx/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa lệnh sản xuất.');
      }
      if (viewingProductionOrder?.id === row.id) setViewingProductionOrder(null);
      if (editingProductionOrder?.id === row.id) setEditingProductionOrder(null);
      await loadBoard();
    } catch (error: any) {
      window.alert(error.message || 'Không thể xóa lệnh sản xuất.');
    } finally {
      setDeletingProductionOrderId('');
    }
  };

  const handleDeleteAcceptanceReport = async (report: AcceptanceReport) => {
    const label = report.mat_hang || report.ten_may || 'báo cáo sản lượng';
    if (!window.confirm(`Xóa ${label}?`)) return;

    setDeletingAcceptanceReportId(report.id);
    try {
      const res = await fetch(`/api/bao-cao-nghiem-thu/${report.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa báo cáo sản lượng.');
      }
      await loadBoard();
    } catch (error: any) {
      window.alert(error.message || 'Không thể xóa báo cáo sản lượng.');
    } finally {
      setDeletingAcceptanceReportId('');
    }
  };

  const toggleProductionOrderSelection = (orderId: string) => {
    setSelectedProductionOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAllVisibleProductionOrders = () => {
    setSelectedProductionOrderIds(prev => {
      const visibleIds = visibleProductionOrders.map(row => row.id);
      if (visibleIds.length === 0) return prev;
      if (allVisibleProductionOrdersSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      return [...new Set([...prev, ...visibleIds])];
    });
  };

  const toggleProductionOrderStaffFilter = (staffName: string) => {
    setProductionOrderStaffFilters(prev => {
      const next = new Set(prev);
      if (next.has(staffName)) {
        next.delete(staffName);
      } else {
        next.add(staffName);
      }
      return next;
    });
  };

  const clearProductionOrderFilters = () => {
    setProductionOrderDateFrom('');
    setProductionOrderDateTo('');
    setProductionOrderShiftFilter('all');
    setProductionOrderStaffFilters(new Set());
  };

  const handlePrintSelectedProductionOrders = async () => {
    const rowsToPrint = visibleProductionOrders.filter(row => selectedProductionOrderIds.includes(row.id));
    if (rowsToPrint.length === 0) return;

    setIsBatchPrinting(true);
    try {
      const printableItems = await Promise.all(
        rowsToPrint.map(async order => {
          const [{ items, product }, machineLabel] = await Promise.all([
            fetchProductPrintData(order.productCode),
            resolveProductionOrderMachineLabel(order.machine)
          ]);
          const orderQuantity = parseProductionOrderQuantity(order.quantity);
          return {
            order,
            materials: buildProductionOrderMaterialProposal(orderQuantity, items, product),
            machineLabel,
            product
          };
        })
      );
      setPrintingBatchOrders(printableItems);
      setPendingBatchPrint(true);
    } catch (error) {
      console.error('Không thể in nhiều lệnh SX:', error);
      window.alert('Không thể tải dữ liệu để in các lệnh SX đã chọn.');
    } finally {
      setIsBatchPrinting(false);
    }
  };

  useEffect(() => {
    if (!pendingBatchPrint || printingBatchOrders.length === 0) return;

    const timer = window.setTimeout(() => {
      window.print();
      setPendingBatchPrint(false);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [pendingBatchPrint, printingBatchOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintingBatchOrders([]);
      setPendingBatchPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1880px] space-y-4">
      {loadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {loadError}
        </p>
      )}

      <ControlBoardShiftSummaryTable
        rows={shiftSummaryRows}
        isLoading={isLoading}
        dateFrom={shiftSummaryDateFrom}
        dateTo={shiftSummaryDateTo}
        onDateFromChange={setShiftSummaryDateFrom}
        onDateToChange={setShiftSummaryDateTo}
        detailSources={shiftSummaryDetailSources}
        filterSources={shiftSummaryFilterSources}
        shiftOptions={shiftSummaryShiftOptions}
        staffOptions={shiftSummaryStaffOptions}
        onEditWeighingRecord={onEditWeighing ? handleEditWeighingRecord : undefined}
        onDeleteWeighingRecord={handleDeleteWeighingRecord}
        onDeleteWeighingRecords={handleDeleteWeighingRecords}
        onDeleteWarehouseSlip={handleDeleteWarehouseSlip}
        onDeleteWarehouseSlips={handleDeleteWarehouseSlips}
        onDeleteMachineNvlReport={handleDeleteMachineNvlReport}
        onDeleteMachineNvlReports={handleDeleteMachineNvlReports}
      />

      <div className="grid grid-cols-1 gap-4">
        <DashboardWindow
          title="Lệnh sản xuất"
          subtitle="Các dòng lệnh mới nhất từ bảng lenh_sx"
          icon={Factory}
          accentClass="bg-gradient-to-r from-emerald-900 to-emerald-700"
          count={productionOrders.length}
          countLabel="Lệnh"
          search={productionOrderSearch}
          onSearchChange={setProductionOrderSearch}
          isLoading={isLoading}
          error=""
          onOpen={async () => {
            if (selectedProductionOrdersForPlan.length === 0) return;
            await loadBoard();
            setShowProductionPlan(true);
          }}
          openLabel={`Tạo Kế hoạch SX${selectedProductionOrdersForPlan.length > 0 ? ` (${selectedProductionOrdersForPlan.length})` : ''}`}
          disabled={selectedProductionOrdersForPlan.length === 0}
          secondaryAction={{
            label: 'Thêm mới',
            onClick: () => setShowAddProductionOrder(true)
          }}
          tertiaryAction={{
            label: `In lệnh${selectedProductionOrderIds.length > 0 ? ` (${selectedProductionOrderIds.length})` : ''}`,
            onClick: handlePrintSelectedProductionOrders,
            disabled: !hasAnyVisibleProductionOrderSelected,
            loading: isBatchPrinting
          }}
        >
          <div className="border-b border-zinc-100 bg-white p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1.2fr_auto]">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Từ ngày</span>
                <input
                  type="date"
                  value={productionOrderDateFrom}
                  onChange={event => setProductionOrderDateFrom(event.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tới ngày</span>
                <input
                  type="date"
                  value={productionOrderDateTo}
                  onChange={event => setProductionOrderDateTo(event.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
                <select
                  value={productionOrderShiftFilter}
                  onChange={event => setProductionOrderShiftFilter(event.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                >
                  <option value="all">Tất cả ca</option>
                  {productionOrderShiftOptions.map(shift => (
                    <option key={shift} value={shift}>
                      {formatProductionOrderShiftLabel(shift, productionOrderSettings)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearProductionOrderFilters}
                  className="h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-black text-zinc-700 transition hover:bg-zinc-100"
                >
                  Xóa lọc
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Nhân sự</span>
                <span className="text-[10px] font-bold text-zinc-400">
                  Hiển thị {recentProductionOrders.length}/{productionOrders.length} lệnh
                </span>
              </div>
              {productionOrderStaffOptions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-400">
                  Chưa có nhân sự trong lệnh SX.
                </p>
              ) : (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                  {productionOrderStaffOptions.map(staffName => {
                    const checked = productionOrderStaffFilters.has(staffName);
                    return (
                      <label
                        key={staffName}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                          checked
                            ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProductionOrderStaffFilter(staffName)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        />
                        {staffName}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="sticky top-0 bg-zinc-100 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-center font-black">
                  <input
                    type="checkbox"
                    checked={allVisibleProductionOrdersSelected}
                    onChange={toggleSelectAllVisibleProductionOrders}
                    aria-label="Chọn tất cả lệnh SX đang hiển thị"
                    className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                  />
                </th>
                <th className="px-3 py-2 font-black">Ưu tiên</th>
                <th className="px-3 py-2 font-black">Mã lệnh</th>
                <th className="px-3 py-2 font-black">Mã hàng</th>
                <th className="px-3 py-2 font-black">Tên hàng</th>
                <th className="px-3 py-2 font-black">SL</th>
                <th className="px-3 py-2 font-black">Trạng thái</th>
                <th className="px-3 py-2 font-black">Máy</th>
                <th className="px-3 py-2 font-black">Đơn hàng</th>
                <th className="px-3 py-2 font-black">Bắt đầu</th>
                  <th className="px-3 py-2 text-center font-black">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleProductionOrders.map(row => (
                  <tr key={row.id} className="hover:bg-emerald-50/50">
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedProductionOrderIds.includes(row.id)}
                      onChange={() => toggleProductionOrderSelection(row.id)}
                      aria-label={`Chọn ${row.code || row.name}`}
                      className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                  </td>
                  <td className="px-3 py-2 font-black text-emerald-700">{row.priority > 0 ? row.priority : '-'}</td>
                  <td className="px-3 py-2 font-black text-zinc-950">{row.code || '-'}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-700">{row.productCode || '-'}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-800">{row.productName || '-'}</td>
                  <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.quantity}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-zinc-700">{resolveProductionOrderMachine(row, machines)}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-600">{row.orderRef}</td>
                    <td className="px-3 py-2 font-mono text-[11px] font-bold text-zinc-600">{row.startDate}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingProductionOrder(row)}
                          title="Xem chi tiết"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProductionOrder(row)}
                          title="Sửa lệnh SX"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProductionOrder(row)}
                          disabled={deletingProductionOrderId === row.id}
                          title="Xóa lệnh SX"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingProductionOrderId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => printProductionOrder(row)}
                          disabled={isLoadingPrint}
                        title="In lệnh SX"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && recentProductionOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center font-bold text-zinc-400">
                    Chưa có lệnh SX. Tạo lệnh từ trang Đơn hàng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DashboardWindow>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <DashboardWindow
          title="Báo cáo sản lượng"
          subtitle="Ghi nhận mặt hàng, số lượng và ảnh sản lượng theo ca"
          icon={ClipboardCheck}
          accentClass="bg-gradient-to-r from-sky-900 to-sky-700"
          count={acceptanceReports.length}
          countLabel="Báo cáo"
          summaryExtra={
            <>
              Tổng cuộn: <span className="text-white">{isLoading ? '...' : formatNumber(totalAcceptanceRolls, 0)}</span>
            </>
          }
          search={acceptanceReportSearch}
          onSearchChange={setAcceptanceReportSearch}
          isLoading={isLoading}
          error=""
          onOpen={() => onNavigate('acceptance-report')}
          openLabel="Thêm mới"
          compact
        >
          <table className="w-full table-fixed text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-100 text-[9px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="w-12 px-2 py-1.5 font-black">Ảnh</th>
                <th className="w-[28%] px-2 py-1.5 font-black">Ngày</th>
                <th className="px-2 py-1.5 font-black">Mặt hàng</th>
                <th className="w-16 px-2 py-1.5 text-right font-black">SL</th>
                <th className="w-10 px-1 py-1.5 text-center font-black"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredAcceptanceReports.slice(0, sidePreviewLimit).map(report => (
                <tr key={report.id} className="hover:bg-sky-50/50">
                  <td className="px-2 py-1.5">
                    {report.hinh_anh ? (
                      <a
                        href={report.hinh_anh}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-8 w-8 overflow-hidden rounded-md border border-zinc-200"
                      >
                        <img src={report.hinh_anh} alt="Sản lượng" className="h-full w-full object-cover" />
                      </a>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="truncate font-mono text-[10px] font-bold text-zinc-700">{report.ngay || '-'}</p>
                    <p className="truncate text-[9px] font-semibold text-zinc-500">
                      {report.ca || '-'} · Lần {report.lan || '-'}
                    </p>
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="truncate font-semibold text-zinc-800">{report.mat_hang || '-'}</p>
                    <p className="truncate text-[9px] font-semibold text-zinc-500">
                      {report.ten_may || report.ma_may || '-'} · {report.gio || '-'}
                    </p>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                    {report.so_luong === null ? '-' : formatNumber(report.so_luong, 2)}
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteAcceptanceReport(report)}
                      disabled={deletingAcceptanceReportId === report.id}
                      title="Xóa báo cáo"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingAcceptanceReportId === report.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredAcceptanceReports.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-[10px] font-bold text-zinc-400">
                    Chưa có báo cáo sản lượng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DashboardWindow>

        <DashboardWindow
          title="Nhân sự"
          subtitle="Danh sách thợ máy, phụ máy theo ca"
          icon={UsersRound}
          accentClass="bg-gradient-to-r from-zinc-950 to-zinc-800"
          count={staffMembers.length}
          countLabel="NV"
          search={staffSearch}
          onSearchChange={setStaffSearch}
          isLoading={isLoading}
          error=""
          onOpen={() => onNavigate('hr')}
          openLabel="Mở"
          compact
        >
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-zinc-100 text-[9px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-2 py-1.5 font-black">Tên</th>
                <th className="px-2 py-1.5 font-black">Ca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredStaff.slice(0, sidePreviewLimit).map(member => (
                <tr key={member.id} className="hover:bg-red-50/50">
                  <td className="px-2 py-1.5 font-bold text-zinc-900">{member.name}</td>
                  <td className="px-2 py-1.5 text-zinc-600">{member.shift}</td>
                </tr>
              ))}
              {!isLoading && filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-2 py-4 text-center text-[10px] font-bold text-zinc-400">Không có nhân sự.</td>
                </tr>
              )}
            </tbody>
          </table>
        </DashboardWindow>

        <DashboardWindow
          title="Đơn hàng"
          subtitle="Mã đơn, hàng hóa, số lượng và trạng thái"
          icon={ClipboardList}
          accentClass="bg-gradient-to-r from-[#ef1b2d] to-[#b30d1c]"
          count={orders.length}
          countLabel="Đơn"
          search={orderSearch}
          onSearchChange={setOrderSearch}
          isLoading={isLoading}
          error=""
          onOpen={() => onNavigate('orders')}
          openLabel="Mở Đơn hàng"
        >
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-100 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-black">Mã đơn</th>
                <th className="px-3 py-2 font-black">Hàng</th>
                <th className="px-3 py-2 font-black">Số lượng</th>
                <th className="px-3 py-2 font-black">Số lượng tồn</th>
                <th className="px-3 py-2 font-black">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredOrders.slice(0, previewLimit).map(order => (
                <tr key={order.id} className="hover:bg-red-50/50">
                  <td className="px-3 py-2 font-bold text-zinc-900">{order.orderCode || '-'}</td>
                  <td className="px-3 py-2 text-zinc-700">{formatOrderProductsSummary(getOrderProductLines(order))}</td>
                  <td className="px-3 py-2 font-mono font-bold text-zinc-700">{order.quantity}</td>
                  <td className="px-3 py-2 font-mono font-bold text-zinc-700">{order.stockQuantity}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800">
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center font-bold text-zinc-400">Không có đơn hàng.</td>
                </tr>
              )}
            </tbody>
          </table>
        </DashboardWindow>

        <DashboardWindow
          title="Danh sách máy"
          subtitle="Ảnh máy, mã, tên và trạng thái vận hành"
          icon={Cpu}
          accentClass="bg-gradient-to-r from-emerald-900 to-emerald-700"
          count={machines.length}
          countLabel="Máy"
          search={machineSearch}
          onSearchChange={setMachineSearch}
          isLoading={isLoading}
          error=""
          onOpen={() => onNavigate('machines')}
          openLabel="Mở"
          compact
        >
          <div className="grid grid-cols-1 gap-1.5 p-0.5">
            {filteredMachines.slice(0, sidePreviewLimit).map(machine => (
              <div
                key={machine.id}
                className="flex gap-2 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1.5 transition hover:border-[#ef1b2d]/30"
              >
                {machine.imageUrl ? (
                  <a
                    href={machine.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-12 w-12 shrink-0 overflow-hidden rounded-md bg-zinc-100"
                  >
                    <img
                      src={machine.imageUrl}
                      alt={`Ảnh ${machine.name || machine.code}`}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-zinc-50 text-zinc-400">
                    <Cpu className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[9px] font-black uppercase tracking-wider text-zinc-400">
                    {machine.code || '-'}
                  </p>
                  <p className="truncate text-[11px] font-black text-zinc-900">{machine.name || '-'}</p>
                  <span className="inline-block rounded-full border border-[#ef1b2d]/20 bg-red-50 px-1.5 py-0.5 text-[9px] font-black text-[#ef1b2d]">
                    {machine.status}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onMachineReport(machine, 'nvl')}
                    className="rounded-md border border-emerald-500/50 bg-emerald-700 px-2 py-1 text-[9px] font-extrabold leading-tight text-white transition hover:bg-emerald-800"
                  >
                    Báo cáo NVL tồn
                  </button>
                  <button
                    type="button"
                    onClick={() => onMachineReport(machine, 'mixing')}
                    className="rounded-md border border-emerald-500/50 bg-emerald-700 px-2 py-1 text-[9px] font-extrabold leading-tight text-white transition hover:bg-emerald-800"
                  >
                    Báo cáo phối trộn
                  </button>
                </div>
              </div>
            ))}
            {!isLoading && filteredMachines.length === 0 && (
              <div className="py-6 text-center text-[10px] font-bold text-zinc-400">Không có máy.</div>
            )}
          </div>
        </DashboardWindow>
      </div>

      <AddProductionOrderModal
        open={showAddProductionOrder}
        onClose={() => setShowAddProductionOrder(false)}
        onCreated={loadBoard}
      />

      <ProductionOrderViewModal
        row={viewingProductionOrder}
        onClose={() => setViewingProductionOrder(null)}
      />

      <EditProductionOrderModal
        open={Boolean(editingProductionOrder)}
        row={editingProductionOrder}
        orders={orders}
        productionOrders={productionOrders}
        catalogProducts={products}
        machines={machines}
        onClose={() => setEditingProductionOrder(null)}
        onSaved={loadBoard}
      />

      <ProductionPlanModal
        open={showProductionPlan}
        onClose={() => setShowProductionPlan(false)}
        onSaved={loadBoard}
        onOpenWarehouseSlip={() => onNavigate('warehouse-slip')}
        productionOrders={selectedProductionOrdersForPlan}
        machines={machines}
      />

      {printingOrder && (
        <ProductionOrderPrintSheet
          order={printingOrder}
          materials={printingMaterials}
          machineLabel={printingMachineLabel}
          product={printingProduct}
          shiftSettings={shiftSettings}
        />
      )}

      {printingBatchOrders.length > 0 && (
        <ProductionOrderBatchPrintSheets items={printingBatchOrders} shiftSettings={productionOrderSettings} />
      )}
    </div>
  );
}

function HumanResourcesPanel({ onBack }: { onBack: () => void }) {
  const [branches, setBranches] = useState<HrBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [showAddStaffForm, setShowAddStaffForm] = useState(false);
  const [addStaffDefaults, setAddStaffDefaults] = useState<{ branchId: string; department: string }>({
    branchId: '',
    department: ''
  });

  const loadStaffGroups = async () => {
    setIsLoadingStaff(true);
    setStaffError('');

    try {
      const res = await fetch('/api/nhan-su?format=groups&scope=all');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải nhân sự từ Supabase.');
      }

      const nextBranches = normalizeHrBranches(data);
      setBranches(nextBranches);
      setSelectedBranchId(prev => prev || nextBranches[0]?.id || '');
    } catch (error: any) {
      setBranches([]);
      setStaffError(error.message || 'Không thể tải nhân sự từ Supabase.');
    } finally {
      setIsLoadingStaff(false);
    }
  };

  useEffect(() => {
    void loadStaffGroups();
  }, []);

  const openAddStaffForm = (defaults?: { branchId?: string; department?: string }) => {
    setAddStaffDefaults({
      branchId: defaults?.branchId || selectedBranchId || branches[0]?.id || '',
      department: defaults?.department || ''
    });
    setShowAddStaffForm(true);
  };

  const selectedBranch = branches.find(branch => branch.id === selectedBranchId) ?? branches[0];
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredDepartments = useMemo(() => {
    if (!selectedBranch) return [];
    if (!normalizedSearch) return selectedBranch.departments;

    return selectedBranch.departments
      .map(department => ({
        ...department,
        members: department.members.filter(member =>
          `${member.name} ${member.role} ${member.shift}`.toLowerCase().includes(normalizedSearch)
        )
      }))
      .filter(department =>
        department.name.toLowerCase().includes(normalizedSearch) ||
        department.lead.toLowerCase().includes(normalizedSearch) ||
        department.members.length > 0
      );
  }, [normalizedSearch, selectedBranch]);

  const totalDepartments = selectedBranch?.departments.length ?? 0;
  const totalMembers = selectedBranch?.departments.reduce((sum, department) => sum + department.members.length, 0) ?? 0;
  const activeMembers = selectedBranch?.departments.reduce(
    (sum, department) => sum + department.members.filter(member => member.status === 'Đang làm').length,
    0
  ) ?? 0;
  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    branches.forEach(branch => branch.departments.forEach(department => names.add(department.name)));
    if (names.size === 0) names.add('Sản xuất');
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [branches]);

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý nhân sự</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Chi nhánh & Phòng ban</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Phòng ban Sản xuất · Chi nhánh HCM.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => openAddStaffForm()}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Plus className="h-4 w-4" />
                Thêm mới
              </button>

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Phòng ban', totalDepartments],
              ['Nhân sự', totalMembers],
              ['Đang làm', activeMembers]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {branches.map(branch => (
            <button
              key={branch.id}
              type="button"
              onClick={() => setSelectedBranchId(branch.id)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedBranchId === branch.id
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {branch.shortName}
            </button>
          ))}
          {isLoadingStaff && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <label className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 lg:mt-0 lg:w-[360px]">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Tìm tên, chức vụ, ca làm..."
            disabled={isLoadingStaff || branches.length === 0}
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>

        {staffError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {staffError}
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {!isLoadingStaff && !staffError && branches.length === 0 && (
          <div className="rounded-2xl border-2 border-zinc-900/10 bg-white px-4 py-8 text-center text-sm font-bold text-zinc-500">
            Supabase chưa có dữ liệu nhân sự để hiển thị.
          </div>
        )}

        {filteredDepartments.map(department => (
          <article
            key={department.id}
            className="overflow-hidden rounded-xl border-2 border-zinc-900/10 bg-white shadow-sm"
          >
            <div className="flex items-start justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
              <div className="flex min-w-0 gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-[#ef1b2d]">
                  <Building2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black leading-tight text-zinc-950">{department.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-zinc-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#ef1b2d]" />
                    <span className="truncate">Trưởng nhóm: {department.lead}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Thêm nhân sự vào ${department.name}`}
                onClick={() => openAddStaffForm({ branchId: selectedBranchId, department: department.name })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#ef1b2d] text-white transition hover:bg-[#b30d1c]"
              >
                <UserPlus className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-zinc-100">
              {department.members.map(member => (
                <div key={`${department.id}-${member.name}`} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-xs font-black text-white">
                    {member.name.split(' ').slice(-1)[0].charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black leading-tight text-zinc-950">{member.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <BriefcaseBusiness className="h-3 w-3" />
                        {member.role}
                      </span>
                      <span className="rounded-full border border-zinc-200 px-1.5 py-0.5">{member.shift}</span>
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-black ${
                    member.status === 'Đang làm'
                      ? 'border-[#ef1b2d]/20 bg-red-50 text-[#ef1b2d]'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                  }`}>
                    {member.status}
                  </span>
                  <button type="button" className="h-7 w-7 shrink-0 rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950">
                    <MoreVertical className="mx-auto h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {department.members.length === 0 && (
                <div className="px-4 py-5 text-center text-sm font-semibold text-zinc-500">
                  Không có nhân sự phù hợp bộ lọc.
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      <AddStaffModal
        open={showAddStaffForm}
        branches={branches}
        departmentOptions={departmentOptions}
        defaultBranchId={addStaffDefaults.branchId}
        defaultDepartment={addStaffDefaults.department}
        onClose={() => setShowAddStaffForm(false)}
        onCreated={loadStaffGroups}
      />
    </div>
  );
}

type StaffFormState = {
  name: string;
  code: string;
  branch: string;
  department: string;
  role: string;
  shift: string;
  status: string;
};

function emptyStaffForm(defaults?: { branch?: string; department?: string }): StaffFormState {
  return {
    name: '',
    code: '',
    branch: defaults?.branch || 'HCM',
    department: defaults?.department || 'Sản xuất',
    role: 'Nhân sự',
    shift: STANDARD_SHIFTS[0] || 'Ca 1',
    status: 'Đang làm'
  };
}

function AddStaffModal({
  open,
  onClose,
  onCreated,
  branches,
  departmentOptions,
  defaultBranchId,
  defaultDepartment
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  branches: HrBranch[];
  departmentOptions: string[];
  defaultBranchId: string;
  defaultDepartment: string;
}) {
  const [form, setForm] = useState<StaffFormState>(emptyStaffForm());
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const branchOptions = useMemo(() => {
    const names = branches.map(branch => branch.name).filter(Boolean);
    return names.length > 0 ? names : ['HCM'];
  }, [branches]);

  useEffect(() => {
    if (!open) return;
    const branchName = branches.find(branch => branch.id === defaultBranchId)?.name || branchOptions[0] || 'HCM';
    setForm(emptyStaffForm({ branch: branchName, department: defaultDepartment || departmentOptions[0] || 'Sản xuất' }));
    setFormError('');
  }, [open, defaultBranchId, defaultDepartment, branches, branchOptions, departmentOptions]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('Vui lòng nhập tên nhân sự.');
      return;
    }
    if (!form.department.trim()) {
      setFormError('Vui lòng chọn phòng ban.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const res = await fetch('/api/nhan-su', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nhan_su: form.name.trim(),
          ma_nhan_su: form.code.trim(),
          chi_nhanh: form.branch.trim(),
          phong_ban: form.department.trim(),
          cong_viec: form.role.trim(),
          ca_lam: form.shift.trim(),
          trang_thai: form.status.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể thêm nhân sự.');
      }

      await onCreated();
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể thêm nhân sự.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm nhân sự mới</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ghi vào bảng nhan_su trên Supabase</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Họ và tên *</span>
            <input
              value={form.name}
              onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              placeholder="Nhập tên nhân sự"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã NV</span>
            <input
              value={form.code}
              onChange={event => setForm(prev => ({ ...prev, code: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              placeholder="Tuỳ chọn"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chi nhánh</span>
            <select
              value={form.branch}
              onChange={event => setForm(prev => ({ ...prev, branch: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {branchOptions.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phòng ban *</span>
            <select
              value={form.department}
              onChange={event => setForm(prev => ({ ...prev, department: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {departmentOptions.map(department => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chức vụ</span>
            <input
              value={form.role}
              onChange={event => setForm(prev => ({ ...prev, role: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca làm</span>
            <select
              value={form.shift}
              onChange={event => setForm(prev => ({ ...prev, shift: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {STANDARD_SHIFTS.map(shift => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
            <select
              value={form.status}
              onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {['Đang làm', 'Nghỉ phép', 'Nghỉ việc'].map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Lưu nhân sự'}
          </button>
        </div>
      </div>
    </div>
  );
}

type MenuCardConfig = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: AppTab;
};

const MAIN_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Bảng điều khiển',
    desc: 'Nhân sự, đơn hàng, sản phẩm và danh sách máy trên một màn hình.',
    icon: LayoutDashboard,
    tab: 'control-board'
  },
  {
    title: 'Báo cáo sản xuất',
    desc: 'Phiếu cân ca, phối trộn, sản lượng và các báo cáo theo ca.',
    icon: Factory,
    tab: 'production-reports'
  },
  {
    title: 'HCNS',
    desc: 'Nhân sự và các tham số cài đặt vận hành hệ thống.',
    icon: UsersRound,
    tab: 'hcns'
  },
  {
    title: 'Kinh doanh',
    desc: 'Đơn hàng và danh sách khách hàng phục vụ sản xuất.',
    icon: BriefcaseBusiness,
    tab: 'business'
  },
  {
    title: 'Nhà máy',
    desc: 'Theo dõi lệnh sản xuất và kế hoạch sản xuất.',
    icon: Factory,
    tab: 'factory'
  },
  {
    title: 'Quản lý CSVC',
    desc: 'Kho NVL, sản phẩm, máy móc và phiếu xuất nhập kho.',
    icon: Building2,
    tab: 'facility-management'
  }
];

function MenuPageHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <h2 className="font-display text-base font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{desc}</p>
    </div>
  );
}

const REPORT_FORM_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Báo cáo tồn',
    desc: 'Theo dõi NVL tồn theo từng máy và ca sản xuất.',
    icon: Boxes,
    tab: 'machine-nvl-report'
  },
  {
    title: 'Trộn nguyên vật liệu',
    desc: 'Nhập bảng trộn vật tư theo ca, máy và lần phối trộn.',
    icon: FlaskConical,
    tab: 'mixing-report'
  },
  {
    title: 'Phiếu cân',
    desc: 'Lập phiếu cân, ghi nhận khối lượng và xem tổng hợp theo ca.',
    icon: Scale,
    tab: 'weighing-summary'
  },
  {
    title: 'Báo cáo sản lượng',
    desc: 'Ghi nhận mặt hàng, số lượng và ảnh sản lượng theo ca.',
    icon: ClipboardCheck,
    tab: 'acceptance-report'
  },
  {
    title: 'Phiếu nhập kho thành phẩm',
    desc: 'Lập phiếu nhập kho thành phẩm theo từng lô và mã hàng.',
    icon: ArrowDownToLine,
    tab: 'warehouse-slip'
  },
  {
    title: 'Phiếu báo dừng máy',
    desc: 'Ghi nhận thời gian dừng, lý do và số cuộn ảnh hưởng theo ca.',
    icon: MachineDowntimeIcon,
    tab: 'machine-downtime-report'
  },
  {
    title: 'Báo cáo hàng hỏng',
    desc: 'Lập phiếu hàng hỏng với các cột và chức năng giống phiếu cân ca.',
    icon: PackageX,
    tab: 'damaged-goods-report'
  }
];

const PRODUCTION_REPORT_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Phiếu báo cáo',
    desc: 'Mở các phiếu nhập báo cáo theo ca sản xuất.',
    icon: FilePlus2,
    tab: 'report-forms'
  },
  {
    title: 'Danh sách báo cáo',
    desc: 'Mở danh sách phiếu cân, phối trộn và báo cáo sản lượng đã lưu.',
    icon: ClipboardList,
    tab: 'report-lists'
  }
];

const FACILITY_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Kho NVL',
    desc: 'Quản lý nguyên phụ liệu, trọng lượng, khổ cuộn và tồn nhập xuất.',
    icon: Boxes,
    tab: 'materials'
  },
  {
    title: 'Sản phẩm',
    desc: 'Xem danh mục mã hàng, nhóm VTHH, đơn vị và tồn kho.',
    icon: Package,
    tab: 'products'
  },
  {
    title: 'Danh sách máy',
    desc: 'Theo dõi mã máy, vị trí, loại máy và trạng thái vận hành.',
    icon: Cpu,
    tab: 'machines'
  },
  {
    title: 'Phiếu xuất nhập kho',
    desc: 'Lập phiếu nhập hoặc xuất NVL theo từng mã NPL.',
    icon: ArrowDownToLine,
    tab: 'warehouse-slip'
  },
  {
    title: 'Lịch sử xuất nhập kho',
    desc: 'Tra cứu phiếu đã lưu, lọc theo loại và ngày.',
    icon: History,
    tab: 'warehouse-history'
  }
];

const REPORT_LIST_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Danh sách báo cáo tồn',
    desc: 'Xem báo cáo NVL tồn theo từng máy và ca sản xuất.',
    icon: Boxes,
    tab: 'machine-nvl-report-list'
  },
  {
    title: 'Danh sách trộn nguyên vật liệu',
    desc: 'Lấy danh sách báo cáo phối trộn đã lưu theo ngày, ca và máy.',
    icon: Layers,
    tab: 'mixing-report-list'
  },
  {
    title: 'Phiếu cân ca',
    desc: 'Xem danh sách phiếu cân và cộng dồn theo ca.',
    icon: History,
    tab: 'weighing-summary-list'
  },
  {
    title: 'Danh sách báo cáo sản lượng',
    desc: 'Xem, sửa và in các phiếu báo cáo sản lượng đã lưu.',
    icon: ClipboardList,
    tab: 'acceptance-report-list'
  },
  {
    title: 'Danh sách phiếu nhập kho thành phẩm',
    desc: 'Tra cứu các phiếu nhập kho thành phẩm đã lưu.',
    icon: ArrowDownToLine,
    tab: 'warehouse-history'
  },
  {
    title: 'Danh sách báo cáo dừng máy',
    desc: 'Xem các phiếu báo dừng máy đã lưu và lịch sử gần nhất.',
    icon: MachineDowntimeIcon,
    tab: 'machine-downtime-list'
  }
];

const HCNS_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Nhân sự',
    desc: 'Quản lý thợ máy, phụ máy và phân công ca trực.',
    icon: UsersRound,
    tab: 'hr'
  },
  {
    title: 'Cài đặt',
    desc: 'Xem tham số cấu hình và giá trị mặc định của hệ thống.',
    icon: Settings,
    tab: 'settings'
  }
];

const BUSINESS_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Đơn hàng',
    desc: 'Theo dõi mã đơn, khách hàng, mã hàng và lệnh sản xuất.',
    icon: ClipboardList,
    tab: 'orders'
  },
  {
    title: 'Khách hàng',
    desc: 'Xem danh sách khách hàng phục vụ lập và tra cứu đơn hàng.',
    icon: BriefcaseBusiness,
    tab: 'customers'
  }
];

const FACTORY_MENU_ITEMS: MenuCardConfig[] = [
  {
    title: 'Lệnh sản xuất',
    desc: 'Xem danh sách lệnh SX, mã hàng, trạng thái và kế hoạch sản xuất.',
    icon: Factory,
    tab: 'production-orders'
  },
  {
    title: 'Kế hoạch SX theo ngày',
    desc: 'Tra cứu snapshot kế hoạch sản xuất đã lưu, lọc theo ngày hoặc khoảng thời gian.',
    icon: CalendarDays,
    tab: 'production-plan-history'
  }
];

function MenuCardGrid({
  items,
  onNavigate
}: {
  items: MenuCardConfig[];
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => onNavigate(item.tab)}
            className="group relative min-h-[80px] overflow-hidden rounded-xl bg-white border border-slate-200 p-3.5 md:p-4 text-left transition hover:border-brand-200 hover:shadow-elevated active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand-500/25"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 transition group-hover:bg-brand-500 group-hover:text-white">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display font-semibold tracking-tight text-[13.5px] text-slate-900">{item.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500 line-clamp-2">{item.desc}</span>
              </span>
              <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-brand-500 group-hover:translate-x-0.5" />
            </div>
          </button>
        );
      })}
    </section>
  );
}

const PRIMARY_NAV_GROUPS: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tab: AppTab;
  children: { label: string; tab: AppTab }[];
}[] = [
  {
    title: 'Sản xuất',
    icon: Factory,
    tab: 'production-reports',
    children: [
      { label: 'Bảng điều khiển', tab: 'control-board' },
      { label: 'Phiếu báo cáo', tab: 'report-forms' },
      { label: 'Danh sách báo cáo', tab: 'report-lists' },
      { label: 'Tổng hợp cân ca', tab: 'weighing-summary' },
      { label: 'Kế hoạch SX', tab: 'production-plan-history' }
    ]
  },
  {
    title: 'CSVC & Kho',
    icon: Building2,
    tab: 'facility-management',
    children: [
      { label: 'Kho NVL', tab: 'materials' },
      { label: 'Sản phẩm', tab: 'products' },
      { label: 'Danh sách máy', tab: 'machines' },
      { label: 'Phiếu xuất nhập', tab: 'warehouse-slip' },
      { label: 'Lịch sử XNK', tab: 'warehouse-history' }
    ]
  },
  {
    title: 'Nhân sự',
    icon: UsersRound,
    tab: 'hcns',
    children: [
      { label: 'Nhân sự', tab: 'hr' },
      { label: 'Cài đặt', tab: 'settings' }
    ]
  },
  {
    title: 'Kinh doanh',
    icon: BriefcaseBusiness,
    tab: 'business',
    children: [
      { label: 'Đơn hàng', tab: 'orders' },
      { label: 'Khách hàng', tab: 'customers' }
    ]
  },
  {
    title: 'Nhà máy',
    icon: ClipboardList,
    tab: 'factory',
    children: [
      { label: 'Lệnh sản xuất', tab: 'production-orders' },
      { label: 'Kế hoạch SX', tab: 'production-plan-history' }
    ]
  },
  {
    title: 'Phân tích',
    icon: BarChart3,
    tab: 'dashboard',
    children: []
  }
];

const TAB_TITLE_MAP: Record<string, { group: string; sub: string }> = {
  'menu': { group: 'Trang chủ', sub: 'Chọn chức năng' },
  'control-board': { group: 'Sản xuất', sub: 'Bảng điều khiển' },
  'report-forms': { group: 'Sản xuất', sub: 'Phiếu báo cáo' },
  'form': { group: 'Sản xuất', sub: 'Phiếu báo cáo' },
  'report-lists': { group: 'Sản xuất', sub: 'Danh sách báo cáo' },
  'acceptance-report-list': { group: 'Sản xuất', sub: 'DS phiếu nghiệm thu' },
  'weighing-summary': { group: 'Sản xuất', sub: 'Phiếu cân ca' },
  'weighing-summary-list': { group: 'Sản xuất', sub: 'DS phiếu cân' },
  'damaged-goods-report': { group: 'Sản xuất', sub: 'Báo cáo hàng hư' },
  'mixing-report': { group: 'Sản xuất', sub: 'Báo cáo trộn' },
  'mixing-report-list': { group: 'Sản xuất', sub: 'DS phiếu trộn' },
  'machine-nvl-report': { group: 'Sản xuất', sub: 'Báo cáo máy-NVL' },
  'machine-nvl-report-list': { group: 'Sản xuất', sub: 'DS báo cáo tồn' },
  'acceptance-report': { group: 'Sản xuất', sub: 'Phiếu nghiệm thu' },
  'machine-downtime-report': { group: 'Sản xuất', sub: 'Báo cáo máy dừng' },
  'machine-downtime-list': { group: 'Sản xuất', sub: 'DS máy dừng' },
  'production-plan-history': { group: 'Sản xuất', sub: 'Kế hoạch SX' },
  'materials': { group: 'CSVC & Kho', sub: 'Kho NVL' },
  'materials-inventory': { group: 'CSVC & Kho', sub: 'Kho NVL' },
  'products': { group: 'CSVC & Kho', sub: 'Sản phẩm' },
  'machines': { group: 'CSVC & Kho', sub: 'Danh sách máy' },
  'warehouse-slip': { group: 'CSVC & Kho', sub: 'Phiếu xuất nhập kho' },
  'warehouse-history': { group: 'CSVC & Kho', sub: 'Lịch sử XNK' },
  'hr': { group: 'Nhân sự', sub: 'Nhân sự' },
  'settings': { group: 'Nhân sự', sub: 'Cài đặt' },
  'orders': { group: 'Kinh doanh', sub: 'Đơn hàng' },
  'customers': { group: 'Kinh doanh', sub: 'Khách hàng' },
  'production-orders': { group: 'Nhà máy', sub: 'Lệnh sản xuất' },
  'dashboard': { group: 'Phân tích', sub: 'Dashboard' }
};

function getActivePageMeta(tab: AppTab): { group: string; sub: string } {
  if (TAB_TITLE_MAP[tab]) return TAB_TITLE_MAP[tab];
  for (const group of PRIMARY_NAV_GROUPS) {
    if (group.tab === tab) return { group: group.title, sub: '' };
    const child = group.children.find(c => c.tab === tab);
    if (child) return { group: group.title, sub: child.label };
  }
  return { group: 'Trang chủ', sub: '' };
}

function SubNav({
  activeTab,
  onNavigate
}: {
  activeTab: AppTab;
  onNavigate: (tab: AppTab) => void;
}) {
  return (
    <nav className="rounded-xl bg-white border border-slate-100 p-2">
      <ul className="flex flex-col gap-0.5">
        {PRIMARY_NAV_GROUPS.map(group => {
          const Icon = group.icon;
          const isActiveGroup = activeTab === group.tab || group.children.some(c => c.tab === activeTab);
          const isExact = activeTab === group.tab;
          return (
            <li key={group.title}>
              <button
                type="button"
                onClick={() => onNavigate(group.tab)}
                className={`relative flex w-full items-center gap-2 rounded-lg pl-3 pr-2.5 py-2 text-left text-sm font-semibold transition ${
                  isExact
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : isActiveGroup
                    ? 'bg-slate-50 text-slate-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {isExact && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand-500" aria-hidden />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 truncate font-display font-semibold tracking-tight">{group.title}</span>
              </button>
              {isActiveGroup && group.children.length > 0 && (
                <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l-2 border-slate-200 pl-2">
                  {group.children.map(child => (
                    <li key={child.tab}>
                      <button
                        type="button"
                        onClick={() => onNavigate(child.tab)}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold transition ${
                          activeTab === child.tab
                            ? 'bg-brand-50 text-brand-700 font-bold'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-brand-600'
                        }`}
                      >
                        {child.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const DEFAULT_REPORT: Omit<ProductionReport, 'id' | 'createdAt'> = {
  date: new Date().toISOString().split('T')[0],
  shiftInfo: {
    machineId: '',
    shiftName: '',
    operatorName: '',
    assistantName: ''
  },
  productEntry: {
    productCode: '',
    rolls: 0,
    actualWeight: 0
  },
  materials: {
    virginPlastic: [0],
    recycledPlastic: [0],
    brightenerPowder: [0],
    dispersionOil: [0],
    otherAdditives: [0]
  },
  wasteWeight: 0,
  notes: ''
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() => tabFromPath(window.location.pathname));
  const [locationPath, setLocationPath] = useState(() => window.location.pathname);
  const resolvedTab = useMemo(() => tabFromPath(locationPath), [locationPath]);
  const [currentStep, setCurrentStep] = useState<number>(1); // 1: Shift & Product, 2: Materials, 3: Waste & Submit
  const [reportForm, setReportForm] = useState<Omit<ProductionReport, 'id' | 'createdAt'>>(DEFAULT_REPORT);
  const [reports, setReports] = useState<ProductionReport[]>(() => readCachedReports());
  
  // App states
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [isFetchLoading, setIsFetchLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<{ id: string; text: string; type: 'success' | 'error' | 'warning' }[]>([]);
  const [offlineReports, setOfflineReports] = useState<ProductionReport[]>([]);
  const [quickNavOpen, setQuickNavOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        setQuickNavOpen(open => !open);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setQuickNavOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [acceptanceEditReport, setAcceptanceEditReport] = useState<AcceptanceReport | null>(null);
  const [mixingReportMachinePrefill, setMixingReportMachinePrefill] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);
  const [machineNvlReportPrefill, setMachineNvlReportPrefill] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [machineNvlEditReport, setMachineNvlEditReport] = useState<MachineNvlSavedReport | null>(null);
  const [weighingPendingAdd, setWeighingPendingAdd] = useState<WeighingPendingAdd | null>(null);
  const navigateToTab = (tab: AppTab, options?: { replace?: boolean }) => {
    const path = pathFromTab(tab);

    if (window.location.pathname !== path) {
      if (options?.replace) {
        window.history.replaceState({ tab }, '', path);
      } else {
        window.history.pushState({ tab }, '', path);
      }
    }

    setActiveTab(tab);
    setLocationPath(path);

    if (tab === 'dashboard') {
      fetchReports();
    }
  };

  const handleNavClick = (event: React.MouseEvent<HTMLAnchorElement>, tab: AppTab) => {
    event.preventDefault();
    navigateToTab(tab);
  };

  // 1. Fetch reports from Server DB
  const fetchReports = async () => {
    setIsFetchLoading(true);
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
        localStorage.setItem(STORAGE_REPORTS_CACHE_KEY, JSON.stringify(data));
      } else {
        const cached = readCachedReports();
        if (cached.length > 0) {
          setReports(cached);
        } else {
          addNotification('Không thể lấy báo cáo từ máy chủ.', 'warning');
        }
      }
    } catch (err) {
      const cached = readCachedReports();
      if (cached.length > 0) {
        setReports(cached);
        addNotification('Mất kết nối máy chủ. Đang hiển thị bản lưu thiết bị.', 'warning');
      } else {
        addNotification('Mất kết nối máy chủ dữ liệu. Kiểm tra sóng di động.', 'warning');
      }
    } finally {
      setIsFetchLoading(false);
    }
  };

  // Sync / loading on mount
  useEffect(() => {
    fetchReports();

    // Check navigator online status
    const handleOnline = () => {
      setIsOnline(true);
      addNotification('Thiết bị trực tuyến bản ghi. Sẵn sàng đồng bộ!', 'success');
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      addNotification('Đã ngắt mạng kết nối. Đang kích hoạt lưu cục bộ.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handlePopState = () => {
      const tab = tabFromPath(window.location.pathname);
      setLocationPath(window.location.pathname);
      setActiveTab(tab);
      if (tab === 'dashboard') {
        fetchReports();
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Load draft from localStorage on start
    const cachedDraft = localStorage.getItem(STORAGE_DRAFT_KEY);
    if (cachedDraft) {
      try {
        setReportForm(JSON.parse(cachedDraft));
      } catch (e) {
        console.error('Lỗi khi phục hồi bản nháp:', e);
      }
    }

    // Load offline queue
    const cachedQueue = localStorage.getItem(STORAGE_OFFLINE_KEY);
    if (cachedQueue) {
      try {
        setOfflineReports(JSON.parse(cachedQueue));
      } catch (e) {
        console.error('Lỗi phục hồi hàng chờ ngoại tuyến:', e);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Sync draft to storage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_DRAFT_KEY, JSON.stringify(reportForm));
  }, [reportForm]);

  // Sync offline queue to storage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_OFFLINE_KEY, JSON.stringify(offlineReports));
  }, [offlineReports]);

  // Helper to add floating toast notifications
  const addNotification = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = `${Date.now()}`;
    setNotifications(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Submit a production report
  const handleSubmitReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Complete form validation
    const { machineId, shiftName, operatorName, assistantName } = reportForm.shiftInfo;
    const { productCode, rolls, actualWeight } = reportForm.productEntry;
    
    if (!machineId || !shiftName || !operatorName || !assistantName) {
      addNotification('Vui lòng điền đầy đủ Thông tin Ca Trực ở Bước 1!', 'error');
      setCurrentStep(1);
      return;
    }
    if (!productCode || !rolls || !actualWeight) {
      addNotification('Vui lòng điền thông tin Thành Phẩm ở Bước 1!', 'error');
      setCurrentStep(1);
      return;
    }

    setIsSubmitLoading(true);

    try {
      if (isOnline) {
        // Send directly to Express Server API
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reportForm)
        });

        if (res.ok) {
          const newRep = await res.json();
          addNotification('Lưu báo cáo lên database HCM thành công!', 'success');
          // Update local list
          setReports(prev => [newRep, ...prev]);
          // Reset form draft
          handleResetForm();
        } else {
          // Server returned error, queue offline instead
          throw new Error('Server returned error status');
        }
      } else {
        // Offline capability fallback
        const offlineRep: ProductionReport = {
          ...reportForm,
          id: `rep_offline_${Date.now()}`,
          createdAt: new Date().toISOString()
        };
        setOfflineReports(prev => [offlineRep, ...prev]);
        addNotification('Mất sóng kho! Báo cáo đã lưu tạm tại LocalStorage trên máy dọn.', 'warning');
        // Reset form draft
        handleResetForm();
      }
    } catch (err) {
      // API error fallback
      const offlineRep: ProductionReport = {
        ...reportForm,
        id: `rep_offline_${Date.now()}`,
        createdAt: new Date().toISOString()
      };
      setOfflineReports(prev => [offlineRep, ...prev]);
      addNotification('Mất mạng kết nối. Đã lưu báo cáo dự phòng ngoại tuyến.', 'warning');
      handleResetForm();
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Synchronize queued offline reports once connection returns
  const syncOfflineQueue = async () => {
    const cachedQueue = localStorage.getItem(STORAGE_OFFLINE_KEY);
    if (!cachedQueue) return;
    
    try {
      const parsedQueue: ProductionReport[] = JSON.parse(cachedQueue);
      if (parsedQueue.length === 0) return;

      addNotification(`Đang tự động đồng bộ ${parsedQueue.length} báo cáo nộp tạm...`, 'success');

      for (const rep of parsedQueue) {
        // Stripe out id generated for offline identification so server assigns database order key
        const { id, ...cleanForm } = rep; 
        await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleanForm)
        });
      }

      // Success, empty local table queue
      setOfflineReports([]);
      localStorage.setItem(STORAGE_OFFLINE_KEY, '[]');
      addNotification('Đồng bộ dữ liệu nộp tạm thành công!', 'success');
      // Reload main database
      fetchReports();
    } catch (e) {
      console.error('Không thể tự động đồng bộ báo cáo ngoại tuyến:', e);
    }
  };

  // Reset form helper
  const handleResetForm = () => {
    setReportForm(DEFAULT_REPORT);
    localStorage.removeItem(STORAGE_DRAFT_KEY);
    setCurrentStep(1);
    navigateToTab('menu', { replace: true });
  };

  // Reset Server Database (for demo and review testing)
  const handleResetDb = async () => {
    if (window.confirm('Vui lòng xác nhận khôi phục tất cả dữ liệu báo cáo về bản seeding mẫu?')) {
      try {
        const res = await fetch('/api/reports/reset', { method: 'POST' });
        if (res.ok) {
          const resJson = await res.json();
          setReports(resJson.data);
          addNotification('Khôi phục database mẫu HCM thành công!', 'success');
        }
      } catch (e) {
        addNotification('Lỗi khi khôi phục database.', 'error');
      }
    }
  };

  // Wizard update handlers
  const updateShiftInfo = (updated: Partial<ShiftInfo>) => {
    setReportForm(prev => ({
      ...prev,
      shiftInfo: { ...prev.shiftInfo, ...updated }
    }));
  };

  const updateProductEntry = (updated: Partial<ProductEntry>) => {
    setReportForm(prev => ({
      ...prev,
      productEntry: { ...prev.productEntry, ...updated }
    }));
  };

  const updateMaterials = (updated: Partial<MaterialBatches>) => {
    setReportForm(prev => ({
      ...prev,
      materials: { ...prev.materials, ...updated }
    }));
  };

  const updateWasteAndNotes = (updates: { wasteWeight?: number; notes?: string }) => {
    setReportForm(prev => ({
      ...prev,
      ...updates
    }));
  };

  // Derived metrics for real-time stepper footer preview
  const activeMetrics = computeReportMetrics(reportForm);

  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-slate-50 font-sans text-slate-800 selection:bg-brand-500 selection:text-white"
      id="main-root-container"
    >
      <aside className="hidden shrink-0 flex-col items-center gap-1 border-r border-slate-800/60 bg-gradient-to-b from-slate-900 to-slate-950 py-3 pt-safe sm:flex sm:w-16">
        {BACK_TAB_MAP[activeTab] && (
          <MobileBackNavButton
            onClick={() => navigateToTab(BACK_TAB_MAP[activeTab])}
            variant="sidebar"
          />
        )}
        <HomeNavButton
          active={activeTab === 'menu'}
          onClick={event => handleNavClick(event, 'menu')}
          variant="sidebar"
        />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white shadow-[var(--shadow-card)]">

        {/* Brand Header — logo + trigger Drawer + offline pill */}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl px-3 md:px-5 h-14 md:h-16 pt-safe shrink-0 flex items-center gap-2" style={{ boxShadow: 'var(--shadow-soft)' }}>
          <button
            type="button"
            onClick={() => setQuickNavOpen(true)}
            aria-label="Mở điều hướng nhanh"
            title="Mở điều hướng nhanh (Ctrl + K)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95 shrink-0"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            {(() => {
              const pageMeta = getActivePageMeta(activeTab);
              return (
                <div className="min-w-0 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none truncate">{pageMeta.group}</span>
                  <span className="mt-0.5 block font-display text-[13px] md:text-[14px] font-semibold tracking-tight text-slate-900 truncate">{pageMeta.sub || 'Trang chủ'}</span>
                </div>
              );
            })()}
          </div>

          <button
            type="button"
            onClick={() => setQuickNavOpen(true)}
            aria-label="Tìm kiếm nhanh"
            title="Tìm kiếm nhanh (Ctrl + K)"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95 shrink-0"
          >
            <Search className="h-[16px] w-[16px]" />
          </button>
          {offlineReports.length > 0 && (
            <span className="text-[10px] bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-100">
              Tạm {offlineReports.length}
            </span>
          )}
          <span className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[11px] font-bold shadow-sm">
            VN
          </span>
          <VietNhatLogo className="h-9 md:h-10 w-auto max-h-full object-contain shrink-0 ml-0.5" />
        </header>

        {/* Floating notifications / Toasts layout */}
        <div className="fixed top-14 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm mx-auto">
          <AnimatePresence>
            {notifications.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-3 rounded-2xl border border-white/30 shadow-elevated text-[12.5px] font-semibold flex items-start gap-2 backdrop-blur-xl leading-relaxed ${
                  n.type === 'success'
                    ? 'bg-gradient-to-br from-emerald-50/85 to-white/80 border-emerald-200/60 text-emerald-700'
                    : n.type === 'error'
                    ? 'bg-gradient-to-br from-rose-50/85 to-white/80 border-rose-200/60 text-rose-700'
                    : 'bg-gradient-to-br from-amber-50/85 to-white/80 border-amber-200/60 text-amber-700'
                }`}
              >
                {n.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                {n.type === 'error' && <Sparkles className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />}
                {n.type === 'warning' && <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                <p className="flex-1 leading-relaxed">{n.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Drawer 'Điều hướng nhanh' — mặc định ẩn */}
        <AnimatePresence>
          {quickNavOpen && (
            <motion.div
              key="quicknav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setQuickNavOpen(false)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {quickNavOpen && (
            <motion.aside
              key="quicknav-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Điều hướng nhanh"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-[70] w-[280px] max-w-[85vw] bg-white border-r border-slate-200 shadow-elevated flex flex-col"
            >
              <div className="h-12 md:h-14 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-500">
                    <Menu className="h-4 w-4" />
                  </span>
                  <span className="font-display text-[14px] font-semibold tracking-tight text-slate-900">Điều hướng nhanh</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickNavOpen(false)}
                  aria-label="Đóng"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2">
                <SubNav
                  activeTab={activeTab}
                  onNavigate={(tab) => {
                    navigateToTab(tab);
                    setQuickNavOpen(false);
                  }}
                />
              </div>
              <div className="px-3 py-2 border-t border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                <span>Phím tắt</span>
                <span className="font-mono">Ctrl + K</span>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content scrollable container viewport */}
        <main className={`flex-1 min-h-0 overflow-y-auto bg-slate-50 focus:outline-none ${
          activeTab === 'control-board'
            ? 'p-2 md:p-4'
            : activeTab === 'machine-nvl-report'
              ? 'overflow-hidden p-0'
              : 'p-4 md:p-6 pb-4'
        }`} id="applet-viewport">
          <div className={activeTab === 'machine-nvl-report' ? 'w-full' : 'mx-auto w-full max-w-[1280px]'}>
            <div className="min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === 'control-board' ? (
              <motion.div
                key="control-board"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ControlBoardPanel
                  onNavigate={navigateToTab}
                  onEditWeighing={pending => {
                    setWeighingPendingAdd(pending);
                    navigateToTab('weighing-summary');
                  }}
                  onMachineReport={(machine, type) => {
                    if (type === 'mixing') {
                      setMixingReportMachinePrefill({
                        id: machine.id,
                        code: machine.code,
                        name: machine.name
                      });
                      navigateToTab('mixing-report');
                      return;
                    }
                    setMachineNvlReportPrefill({
                      code: machine.code,
                      name: machine.name
                    });
                    navigateToTab('machine-nvl-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'menu' ? (
              <motion.div
                key="main-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <MenuCardGrid items={MAIN_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'production-reports' ? (
              <motion.div
                key="production-reports-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Báo cáo sản xuất" desc="Chọn loại báo cáo cần mở." />
                <MenuCardGrid items={PRODUCTION_REPORT_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'report-forms' ? (
              <motion.div
                key="report-forms-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Phiếu báo cáo" desc="Chọn phiếu báo cáo cần lập hoặc mở." />
                <MenuCardGrid items={REPORT_FORM_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'report-lists' ? (
              <motion.div
                key="report-lists-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Danh sách báo cáo" desc="Chọn danh sách báo cáo cần mở." />
                <MenuCardGrid items={REPORT_LIST_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'acceptance-report-list' ? (
              <motion.div
                key="acceptance-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <AcceptanceReportListView
                  onBack={() => navigateToTab('report-lists')}
                  onCreate={() => {
                    setAcceptanceEditReport(null);
                    navigateToTab('acceptance-report');
                  }}
                  onEdit={report => {
                    setAcceptanceEditReport(report);
                    navigateToTab('acceptance-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'facility-management' ? (
              <motion.div
                key="facility-management-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Quản lý CSVC" desc="Cơ sở vật chất, kho hàng và thiết bị sản xuất." />
                <MenuCardGrid items={FACILITY_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'hcns' ? (
              <motion.div
                key="hcns-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="HCNS" desc="Nhân sự và cấu hình hệ thống." />
                <MenuCardGrid items={HCNS_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'business' ? (
              <motion.div
                key="business-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Kinh doanh" desc="Đơn hàng và khách hàng." />
                <MenuCardGrid items={BUSINESS_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'factory' ? (
              <motion.div
                key="factory-menu"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <MenuPageHeader title="Nhà máy" desc="Lệnh sản xuất và điều phối nhà máy." />
                <MenuCardGrid items={FACTORY_MENU_ITEMS} onNavigate={navigateToTab} />
              </motion.div>
            ) : activeTab === 'form' ? (
              <motion.div
                key="form-stepper"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                {/* Visual Wizard Stepper Indicator — industrial compact */}
                <div className="px-3 py-2 bg-white border border-ink-200 rounded-md flex items-center justify-between" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase text-ink-400 block tracking-wider leading-none">Bước</span>
                    <span className="text-[15px] font-semibold text-ink-900 num leading-none">{currentStep}/3</span>
                  </div>

                  {/* Visual segment progress lines */}
                  <div className="flex-1 mx-3 flex gap-0.5 h-0.5 bg-ink-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 1 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 2 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                    <div className={`h-full rounded-full transition-all duration-300 ${currentStep >= 3 ? 'bg-accent-600 w-1/3' : 'w-0'}`} />
                  </div>

                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500 shrink-0">
                    {currentStep === 1 ? 'Ca & Mã hàng' : currentStep === 2 ? 'Phối trộn' : 'Phế phẩm & Lưu'}
                  </span>
                </div>

                {/* Stepper Card Frame */}
                <div className="form-card min-h-[260px]">
                  {currentStep === 1 && (
                    <div className="form-section stagger-field">
                      <ShiftInfoForm data={reportForm.shiftInfo} onChange={updateShiftInfo} />
                      <ProductEntryForm data={reportForm.productEntry} onChange={updateProductEntry} />
                    </div>
                  )}

                  {currentStep === 2 && (
                    <MaterialsForm data={reportForm.materials} onChange={updateMaterials} />
                  )}

                  {currentStep === 3 && (
                    <div className="form-section stagger-field">
                      <WasteForm
                        wasteWeight={reportForm.wasteWeight}
                        notes={reportForm.notes || ''}
                        onChange={updateWasteAndNotes}
                      />

                      {/* Final layout summary review before submission */}
                      <div className="rounded-md bg-ink-900 border border-ink-800 p-3 space-y-2.5 text-ink-100">
                        <h4 className="text-[10px] font-mono uppercase tracking-wider text-ink-400 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-warning-500 animate-pulse" />
                          Tổng hợp kết quả
                        </h4>

                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px] font-semibold pb-1.5 border-b border-ink-800">
                          <div>Ca máy: <span className="text-ink-300 block">{reportForm.shiftInfo.machineId.split(' ')[0] || '--'}</span></div>
                          <div>Mã hàng: <span className="text-ink-300 block">{reportForm.productEntry.productCode || '--'}</span></div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] pb-1.5 border-b border-ink-800">
                          <div>Polymer phối: <strong className="text-brand-400 num block text-[13px]">{formatNumber(activeMetrics.totalPlastic)} kg</strong></div>
                          <div>Thành phẩm: <strong className="text-accent-300 num block text-[13px]">{formatNumber(activeMetrics.actualProductWeight)} kg</strong></div>
                        </div>

                        {/* Variance result */}
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span>Phế phẩm: <strong className="text-rose-400 num">{formatNumber(reportForm.wasteWeight)} kg</strong></span>
                          <span>Tỉ lệ hao hụt: <strong className={`num ${
                            activeMetrics.status === 'optimal' ? 'text-accent-300' : activeMetrics.status === 'warning' ? 'text-warning-400' : 'text-rose-400'
                          }`}>{formatNumber(activeMetrics.variancePercent)}%</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitting / Loader overlay */}
                {isSubmitLoading && (
                  <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="p-5 bg-white rounded-2xl shadow-xl flex items-center gap-3.5 text-slate-800 font-bold max-w-sm">
                      <Loader2 className="w-6 h-6 text-emerald-600 animate-spin shrink-0" />
                  <span>Đang mã hóa & đồng bộ dữ liệu HCM...</span>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : resolvedTab === 'weighing-summary-list' ? (
              <motion.div
                key="weighing-summary-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingShiftSummary onBackToMenu={() => navigateToTab('report-lists')} />
              </motion.div>
            ) : resolvedTab === 'weighing-summary' ? (
              <motion.div
                key="weighing-summary"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingReportForm
                  autoOpenNewSlip={!weighingPendingAdd}
                  pendingAdd={weighingPendingAdd}
                  onPendingAddHandled={() => setWeighingPendingAdd(null)}
                  onBack={() => navigateToTab('report-forms')}
                  onOpenList={() => navigateToTab('weighing-summary-list')}
                />
              </motion.div>
            ) : activeTab === 'damaged-goods-report' ? (
              <motion.div
                key="damaged-goods-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WeighingShiftSummary
                  config={DAMAGED_GOODS_SLIP_CONFIG}
                  onBackToMenu={() => navigateToTab('report-forms')}
                />
              </motion.div>
            ) : activeTab === 'mixing-report' ? (
              <motion.div
                key="mixing-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MixingReportForm
                  onBack={() => navigateToTab('report-forms')}
                  onOpenList={() => navigateToTab('mixing-report-list')}
                  initialMachine={mixingReportMachinePrefill}
                  onInitialMachineConsumed={() => setMixingReportMachinePrefill(null)}
                />
              </motion.div>
            ) : activeTab === 'mixing-report-list' ? (
              <motion.div
                key="mixing-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MixingReportListView
                  onBack={() => navigateToTab('report-lists')}
                />
              </motion.div>
            ) : activeTab === 'machine-nvl-report-list' ? (
              <motion.div
                key="machine-nvl-report-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineNvlReportListView
                  onBack={() => navigateToTab('report-lists')}
                  onCreate={() => {
                    setMachineNvlEditReport(null);
                    navigateToTab('machine-nvl-report');
                  }}
                  onEdit={report => {
                    setMachineNvlEditReport(report);
                    navigateToTab('machine-nvl-report');
                  }}
                />
              </motion.div>
            ) : activeTab === 'machine-nvl-report' ? (
              <motion.div
                key="machine-nvl-report"
                className="h-full min-h-0"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineNvlReportPanel
                  onBack={() => navigateToTab('report-forms')}
                  onOpenList={() => navigateToTab('machine-nvl-report-list')}
                  initialMachine={machineNvlReportPrefill}
                  onInitialMachineConsumed={() => setMachineNvlReportPrefill(null)}
                  editReport={machineNvlEditReport}
                  onEditConsumed={() => setMachineNvlEditReport(null)}
                />
              </motion.div>
            ) : activeTab === 'acceptance-report' ? (
              <motion.div
                key="acceptance-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <AcceptanceReportForm
                  onBack={() => navigateToTab('report-forms')}
                  onOpenList={() => navigateToTab('acceptance-report-list')}
                  editReport={acceptanceEditReport}
                  onEditConsumed={() => setAcceptanceEditReport(null)}
                />
              </motion.div>
            ) : activeTab === 'machine-downtime-report' ? (
              <motion.div
                key="machine-downtime-report"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineDowntimeReportPanel onBack={() => navigateToTab('report-forms')} />
              </motion.div>
            ) : activeTab === 'machine-downtime-list' ? (
              <motion.div
                key="machine-downtime-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachineDowntimeReportPanel onBack={() => navigateToTab('report-lists')} />
              </motion.div>
            ) : activeTab === 'hr' ? (
              <motion.div
                key="human-resources"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <HumanResourcesPanel onBack={() => navigateToTab('hcns')} />
              </motion.div>
            ) : activeTab === 'products' ? (
              <motion.div
                key="products"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductsPanel onBack={() => navigateToTab('facility-management')} />
              </motion.div>
            ) : activeTab === 'machines' ? (
              <motion.div
                key="machines"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MachinesPanel onBack={() => navigateToTab('facility-management')} />
              </motion.div>
            ) : activeTab === 'materials' ? (
              <motion.div
                key="materials"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <MaterialsInventoryPanel onBack={() => navigateToTab('facility-management')} />
              </motion.div>
            ) : activeTab === 'warehouse-slip' ? (
              <motion.div
                key="warehouse-slip"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WarehouseSlipPanel
                  onBack={() => navigateToTab('facility-management')}
                  onOpenHistory={() => navigateToTab('warehouse-history')}
                />
              </motion.div>
            ) : activeTab === 'warehouse-history' ? (
              <motion.div
                key="warehouse-history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <WarehouseHistoryPanel
                  onBack={() => navigateToTab('facility-management')}
                  onOpenSlip={() => navigateToTab('warehouse-slip')}
                />
              </motion.div>
            ) : activeTab === 'orders' ? (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <OrdersPanel onBack={() => navigateToTab('business')} />
              </motion.div>
            ) : activeTab === 'customers' ? (
              <motion.div
                key="customers"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <CustomersPanel onBack={() => navigateToTab('business')} />
              </motion.div>
            ) : activeTab === 'production-orders' ? (
              <motion.div
                key="production-orders"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductionOrdersPanel onBack={() => navigateToTab('factory')} />
              </motion.div>
            ) : activeTab === 'production-plan-history' ? (
              <motion.div
                key="production-plan-history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <ProductionPlanHistoryPanel onBack={() => navigateToTab('production-reports')} />
              </motion.div>
            ) : activeTab === 'settings' ? (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <SettingsPanel onBack={() => navigateToTab('hcns')} />
              </motion.div>
            ) : (
              <motion.div
                key="dashboard-charts"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <AnalyticsDashboard 
                  reports={reports} 
                  onResetDb={handleResetDb} 
                  isLoading={isFetchLoading} 
                />
              </motion.div>
            )}
          </AnimatePresence>
            </div>
          </div>
        </main>

        {/* Dynamic STICKY Wizard Footer Bar for Form Inputs - locked at bottom, min height 44px layout */}
        {activeTab === 'form' && (
          <footer className="z-30 shrink-0 border-t border-slate-200/80 bg-white/85 backdrop-blur-xl px-4 py-3 shadow-elevated flex items-center justify-end" id="sticky-wizard-footer">
            <div className="flex gap-3 justify-end">
              <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Khôi phục bản ghi nháp hiện tại?')) {
                      setReportForm(DEFAULT_REPORT);
                      localStorage.removeItem(STORAGE_DRAFT_KEY);
                      addNotification('Đã xóa trắng nháp báo cáo!', 'success');
                    }
                  }}
                  className="h-12 px-4 rounded-xl border border-slate-200 hover:bg-rose-50 hover:text-rose-600 transition font-bold text-xs text-slate-500 shrink-0 active:scale-95"
                  style={{ minHeight: '44px' }}
                >
                  Reset Nháp
                </button>

              {currentStep < 3 ? (
                <button
                  type="button"
                  id="wizard-next-btn"
                  onClick={() => {
                    // Quick validation for Step 1
                    if (currentStep === 1) {
                      const { machineId, shiftName, operatorName, assistantName } = reportForm.shiftInfo;
                      const { productCode, rolls, actualWeight } = reportForm.productEntry;
                      if (!machineId || !shiftName || !operatorName || !assistantName) {
                        addNotification('Thiếu! Hãy nhập đầy đủ thông tin Ca máy và thợ máy.', 'warning');
                        return;
                      }
                      if (!productCode || !rolls || !actualWeight) {
                        addNotification('Thiếu! Hãy chọn Mã SP, Số lượng cuộn đạt và Cân nặng.', 'warning');
                        return;
                      }
                    }
                    setCurrentStep(prev => prev + 1);
                  }}
                  className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-slate-850 text-white font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow"
                  style={{ minHeight: '44px' }}
                >
                  <span>Tiếp tục</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  id="save-report-submit-btn"
                  onClick={() => handleSubmitReport()}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-lg shadow-brand-500/25"
                  style={{ minHeight: '44px' }}
                >
                  <Save className="w-4.5 h-4.5" />
                  <span>Nộp & Lưu báo cáo</span>
                </button>
              )}
            </div>
          </footer>
        )}

        <nav className="z-40 shrink-0 px-2 pb-2 pb-safe sm:hidden">
          <div className="mx-auto flex max-w-sm items-stretch rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-elevated px-1.5 py-1">
            {BACK_TAB_MAP[activeTab] && (
              <MobileBackNavButton
                onClick={() => navigateToTab(BACK_TAB_MAP[activeTab])}
                variant="bottom"
              />
            )}
            <HomeNavButton
              active={activeTab === 'menu'}
              onClick={event => handleNavClick(event, 'menu')}
              variant="bottom"
            />
          </div>
        </nav>

        <nav
          className="hidden"
          id="tab-navigation"
        >
          <a
            href={pathFromTab('menu')}
            id="tab-btn-menu"
            onClick={event => handleNavClick(event, 'menu')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'menu'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Menu className="h-4 w-4" />
            Menu
          </a>

          <a
            href={pathFromTab('form')}
            id="tab-btn-form"
            onClick={event => handleNavClick(event, 'form')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'form'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <FilePlus2 className="h-4 w-4" />
            Nhập Báo Cáo
          </a>

          <a
            href={pathFromTab('weighing-summary')}
            id="tab-btn-weighing-summary"
            onClick={event => handleNavClick(event, 'weighing-summary')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'weighing-summary'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Layers className="h-4 w-4" />
            Phiếu Cân Ca
          </a>

          <a
            href={pathFromTab('dashboard')}
            id="tab-btn-dashboard"
            onClick={event => handleNavClick(event, 'dashboard')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'dashboard'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <BarChart3 className="h-4 w-4" />
            Phân Tích
          </a>

          <a
            href={pathFromTab('products')}
            id="tab-btn-products"
            onClick={event => handleNavClick(event, 'products')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'products'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Package className="h-4 w-4" />
            Sản Phẩm
          </a>

          <a
            href={pathFromTab('machines')}
            id="tab-btn-machines"
            onClick={event => handleNavClick(event, 'machines')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'machines'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Cpu className="h-4 w-4" />
            Máy
          </a>

          <a
            href={pathFromTab('materials')}
            id="tab-btn-materials"
            onClick={event => handleNavClick(event, 'materials')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'materials'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <Boxes className="h-4 w-4" />
            Kho NVL
          </a>

          <a
            href={pathFromTab('orders')}
            id="tab-btn-orders"
            onClick={event => handleNavClick(event, 'orders')}
            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-bold uppercase tracking-wider transition sm:text-xs ${
              activeTab === 'orders'
                ? 'border-t-2 border-[#ef1b2d] bg-red-50/70 text-[#ef1b2d]'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
            style={{ minHeight: '52px' }}
          >
            <ClipboardList className="h-4 w-4" />
            Đơn Hàng
          </a>
        </nav>
      </div>
      </div>
    </div>
  );
}
