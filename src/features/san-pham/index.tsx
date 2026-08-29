import React, { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber, formatMoney, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import { pickText, fileToDataUrl, uploadImage, formatCell } from '../_shared/recordHelpers';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { normalizeMaterialsInventory } from '../kho-nvl';
import {
  FilterCombobox,
  MultiSelectFilter,
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge,
  RowActionsMenu
} from '../../components/shared/table';
import { Loader2, Save, FlaskConical, Download, Upload, Plus, Eye, Pencil, Trash2, QrCode, X, Warehouse, ClipboardList, RefreshCw } from 'lucide-react';
import { productFieldClass } from './productFieldClass';
import type { ProductRow, ProductNplItem, MaterialOption, ProductNplAmountType } from './types';
import { downloadBulkProductNplComponentsTemplate, downloadProductNplComponentsTemplate, parseThanhPhanLongFormatExcel, parseBulkProductNplComponentsExcel, parseImportSpExcelRows } from '../../utils/productNplComponentsExcel';
import type { ImportSpExcelRow } from '../../utils/productNplComponentsExcel';
import { parseProductNplItems, productNplItemsToJson, formatProductNplSummary, findMaterialOptionByCode, formatProductNplAmount, roundNplNumber, formatNplDecimal, formatNplWeightKg, bulkExcelRowsToProductMap } from './types';
import {
  downloadProductCatalogExcelTemplate,
  parseProductCatalogExcel,
  productCatalogRowToPayload
} from '../../utils/productCatalogExcel';
import { showAppToast } from '../../lib/appToast';
import { matchesWarehouseFilter, normalizeWarehouseName, type InventoryBalanceRow } from '../kho-hang';
import { waitForPrintImagesReady } from '../../utils/printReady';
import ProductQrPrintModal, {
  type ProductQrPrintLabel as WarehouseProductQrPrintLabel
} from '../../components/ProductQrPrintModal';

type ProductQrPrintLabel = {
  key: string;
  product: ProductRow;
  qrPayload: string;
};

type ProductDetailCode = {
  id: string;
  ma_sp_day_du: string;
  ma_sp_goc: string;
  ten_kho: string;
  trang_thai: string;
  so_lan_in: number;
  ma_phieu_nhap: string;
  ma_phieu_xuat: string;
  created_at: string;
};

type ProductIssuedQrCode = {
  id: string;
  ma_qr: string;
  ma_sp_goc: string;
  ten_kho: string;
  so_lan_in: number;
  ngay_in_gan_nhat: string;
  nguoi_tao: string;
  trang_thai: string;
  created_at: string;
};

function parsePrintCopyCount(raw: string) {
  const value = Math.floor(Number(String(raw ?? '').trim().replace(',', '.')));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 999);
}

async function createQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 340,
    color: {
      dark: '#111111',
      light: '#ffffff'
    }
  });
}

export type ProductViewTab = 'info' | 'codes' | 'issued-qr' | 'components' | 'kiem-kho' | 'nhap-kho' | 'xuat-kho';

type ProductWarehouseSlipRow = {
  id: string;
  ma_phieu: string;
  ngay_phieu: string;
  ca: string;
  may: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
  so_luong_chung_tu: number | null;
  ten_kho: string;
  ly_do: string;
  ghi_chu: string;
  nguoi_lap: string;
};

type ProductKiemKhoRow = {
  id: string;
  ten_kho: string;
  dot_kiem_kho: string;
  ma_nvl: string;
  ma_sp: string;
  ten_sp: string;
  loai_sp: string;
  ngay_gio_kiem_kho: string;
  nguoi_kiem_kho: string;
  thoi_gian_xac_nhan: string;
};

/** Tiền tố mã kiểm kho trước `_` hoặc trước hậu tố serial `-000001XX`. */
function extractKiemKhoPrefix(raw: string) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const us = trimmed.indexOf('_');
  if (us > 0) return trimmed.slice(0, us).trim();
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

function productCodeCandidates(product: { code?: string; amisCode?: string; newCode?: string }) {
  return [
    ...new Set(
      [product.code, product.amisCode, product.newCode]
        .map(code => String(code ?? '').trim())
        .filter(Boolean)
    )
  ];
}

export function ProductNplItemFormModal({
  mode,
  initialItem,
  materialOptions,
  isLoadingMaterials,
  isSaving,
  existingItems,
  onClose,
  onSave
}: {
  mode: 'add' | 'edit';
  initialItem?: ProductNplItem;
  materialOptions: MaterialOption[];
  isLoadingMaterials: boolean;
  isSaving: boolean;
  /** Thành phần hiện có (trừ dòng đang sửa) — cho phép trùng mã nếu khác loại ĐVT. */
  existingItems: ProductNplItem[];
  onClose: () => void;
  onSave: (item: ProductNplItem) => Promise<void>;
}) {
  const [code, setCode] = useState(initialItem?.code ?? '');
  const [name, setName] = useState(initialItem?.name ?? '');
  const [amountType, setAmountType] = useState<ProductNplAmountType>(initialItem?.amountType ?? 'percent');
  const [amountValue, setAmountValue] = useState(() => {
    if (!initialItem) return '';
    if (initialItem.amountType === 'quantity') {
      return formatNplDecimal(initialItem.quantity ?? 0);
    }
    return formatNplDecimal(initialItem.percent ?? 0);
  });
  const [unit, setUnit] = useState(initialItem?.unit && initialItem.unit !== '-' ? initialItem.unit : '');
  const [formError, setFormError] = useState('');

  const pickMaterial = (nextCode: string) => {
    setCode(nextCode);
    const material = findMaterialOptionByCode(materialOptions, nextCode);
    if (material) {
      setName(material.name);
      if (material.unit && material.unit !== '-') {
        setUnit(material.unit);
      }
    }
  };

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    const material = findMaterialOptionByCode(materialOptions, trimmedCode);
    if (!material) return;
    if (material.unit && material.unit !== '-') {
      setUnit(current => (current && current !== '-' ? current : material.unit));
    }
    setName(current => current.trim() || material.name);
  }, [code, materialOptions]);

  const handleSave = async () => {
    const trimmedCode = code.trim();
    const numericValue = parsePercentInput(amountValue);

    if (!trimmedCode) {
      setFormError('Vui lòng chọn mã NPL.');
      return;
    }

    const material = materialOptions.find(option => option.code === trimmedCode);
    const resolvedUnit =
      amountType === 'percent' ? '%' : unit.trim() || material?.unit || '-';

    if (amountType === 'percent') {
      if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
        setFormError('Phần trăm phải từ 0 đến 100.');
        return;
      }
    } else if (!Number.isFinite(numericValue) || numericValue < 0) {
      setFormError('Số lượng phải lớn hơn hoặc bằng 0.');
      return;
    }

    const draft: ProductNplItem = {
      code: trimmedCode,
      name: name.trim() || material?.name || '',
      amountType,
      percent: amountType === 'percent' ? numericValue : null,
      quantity: amountType === 'quantity' ? numericValue : null,
      unit: resolvedUnit,
      weightKg:
        amountType === 'quantity' && isProductNplKgUnit(resolvedUnit)
          ? numericValue
          : initialItem?.weightKg ?? null
    };
    const draftKind = resolveProductNplUnitKind(draft);
    const sameCode = existingItems.filter(
      item => normalizeProductCodeKey(item.code) === normalizeProductCodeKey(trimmedCode)
    );
    const sameKind = sameCode.find(item => resolveProductNplUnitKind(item) === draftKind);
    if (sameKind) {
      setFormError(
        `Mã NPL ${trimmedCode} đã có loại ${productNplUnitKindLabel(draftKind)}. ` +
          `Có thể thêm cùng mã với loại đơn vị khác (vd Cái + kg).`
      );
      return;
    }

    setFormError('');
    try {
      await onSave(draft);
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
              disabled={isLoadingMaterials}
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
                placeholder="VD: 40,5432"
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
                  placeholder="VD: 0,5432"
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
          <p className="text-[11px] font-medium leading-relaxed text-zinc-500">
            Cùng mã NPL nhưng khác đơn vị (vd Cái rồi kg) sẽ gộp thành một thành phần có cả hai loại.
          </p>
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

export function parseProductSpecNumber(value: string) {
  if (!value || value === '-') return null;
  const num = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function formatProductSpecDisplay(value: string) {
  const num = parseProductSpecNumber(value);
  if (num === null) return '-';
  return formatNumber(num, 2);
}

export function resolveProductPlasticWeight(
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

export function resolveProductMaterialBaseKg(
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

/**
 * Cột Trọng lượng (kg) — tối đa 4 chữ số thập phân.
 * Thứ tự:
 * 1) Excel: weightKg (dòng Loại=Số lượng, ĐVT=Kg)
 * 2) Định lượng chính đang là Kg
 * 3) Có % → % × KL nhựa+phụ gia của SP
 * 4) Có số lượng Cái/… → × TL/ĐVT kho NVL hoặc kg ghi trong tên
 */
export function resolveProductNplItemWeightKg(
  product: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'>,
  item: ProductNplItem,
  materialOptions: MaterialOption[]
): number | null {
  if (item.weightKg !== null && item.weightKg !== undefined && Number.isFinite(item.weightKg) && item.weightKg >= 0) {
    return roundNplNumber(item.weightKg);
  }

  if (
    item.quantity !== null &&
    item.quantity !== undefined &&
    Number.isFinite(item.quantity) &&
    item.quantity >= 0 &&
    isProductNplKgUnit(item.unit)
  ) {
    return roundNplNumber(item.quantity);
  }

  if (item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent) && item.percent >= 0) {
    const materialBaseKg = resolveProductMaterialBaseKg(product);
    if (materialBaseKg > 0) {
      return roundNplNumber((item.percent / 100) * materialBaseKg);
    }
  }

  if (item.quantity === null || item.quantity === undefined || !Number.isFinite(item.quantity)) {
    return null;
  }

  const key = normalizeProductCodeKey(item.code);
  const material = materialOptions.find(option => normalizeProductCodeKey(option.code) === key);
  const totalWeightPerUnit = parseProductSpecNumber(material?.totalWeight ?? '');
  if (totalWeightPerUnit !== null && totalWeightPerUnit > 0) {
    return roundNplNumber(item.quantity * totalWeightPerUnit);
  }

  const fromName = parseWeightKgFromLabel(material?.name || item.name || '');
  if (fromName !== null && fromName > 0) {
    return roundNplNumber(item.quantity * fromName);
  }

  return null;
}

function isProductNplKgUnit(unit: string) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '');
  return (
    normalized === 'kg' ||
    normalized === 'kgs' ||
    normalized === 'kilogram' ||
    normalized === 'kilograms' ||
    normalized.startsWith('kg')
  );
}

/** Phân loại đơn vị thành phần: % / kg / số lượng (Cái, Cuộn…). */
export type ProductNplUnitKind = 'percent' | 'kg' | 'qty';

export function resolveProductNplUnitKind(
  item: Pick<ProductNplItem, 'amountType' | 'unit'>
): ProductNplUnitKind {
  if (item.amountType === 'percent') return 'percent';
  if (isProductNplKgUnit(item.unit || '')) return 'kg';
  return 'qty';
}

function productNplUnitKindLabel(kind: ProductNplUnitKind) {
  if (kind === 'percent') return 'phần trăm (%)';
  if (kind === 'kg') return 'kg';
  return 'số lượng (Cái/Cuộn…)';
}

/**
 * Gộp hai dòng cùng mã NVL khác loại đơn vị → 1 thành phần
 * (vd Cái + kg, hoặc % + Cái) — khớp 2 loại đơn vị trên cùng mã.
 */
export function mergeProductNplItemsByUnitKinds(
  existing: ProductNplItem,
  incoming: ProductNplItem
): ProductNplItem {
  const exKind = resolveProductNplUnitKind(existing);
  const inKind = resolveProductNplUnitKind(incoming);

  let percent = existing.percent;
  let quantity = existing.quantity;
  let unit = existing.unit;
  let weightKg = existing.weightKg ?? null;
  let amountType: ProductNplAmountType = existing.amountType;

  const apply = (item: ProductNplItem, kind: ProductNplUnitKind) => {
    if (kind === 'percent') {
      if (item.percent != null && Number.isFinite(item.percent)) percent = item.percent;
      return;
    }
    if (kind === 'kg') {
      const kg =
        item.weightKg != null && Number.isFinite(item.weightKg)
          ? item.weightKg
          : item.quantity != null && Number.isFinite(item.quantity)
            ? item.quantity
            : null;
      if (kg != null) weightKg = kg;
      return;
    }
    if (item.quantity != null && Number.isFinite(item.quantity)) {
      quantity = item.quantity;
      unit = item.unit && item.unit !== '-' ? item.unit : unit;
    }
  };

  apply(existing, exKind);
  apply(incoming, inKind);

  if (quantity != null && Number.isFinite(quantity)) amountType = 'quantity';
  else if (percent != null && Number.isFinite(percent)) amountType = 'percent';
  else if (weightKg != null && Number.isFinite(weightKg)) {
    amountType = 'quantity';
    if (!unit || unit === '-' || unit === '%') unit = 'kg';
  }

  return {
    code: incoming.code || existing.code,
    name: incoming.name || existing.name,
    amountType,
    percent: percent ?? null,
    quantity: quantity ?? null,
    unit: unit || (amountType === 'percent' ? '%' : '-'),
    weightKg: weightKg ?? null
  };
}

function parseWeightKgFromLabel(label: string): number | null {
  const match = String(label)
    .trim()
    .match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!match) return null;
  const value = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Khớp mã: `MT- MN001` ≡ `MT-MN001` (bỏ mọi khoảng trắng, kể cả NBSP). */
export function normalizeProductCodeKey(code: string) {
  return String(code ?? '')
    .trim()
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, '')
    .toUpperCase();
}

export function findProductByCode(products: ProductRow[], code: string) {
  const key = normalizeProductCodeKey(code);
  if (!key) return undefined;
  return products.find(
    product =>
      normalizeProductCodeKey(product.code) === key ||
      (product.amisCode && normalizeProductCodeKey(product.amisCode) === key) ||
      (product.newCode && normalizeProductCodeKey(product.newCode) === key)
  );
}

export function productAmisDisplayCode(product: Pick<ProductRow, 'amisCode' | 'code'>) {
  return product.amisCode && product.amisCode !== '-' ? product.amisCode : product.code || '-';
}

export function ProductViewModal({
  product,
  initialTab = 'info',
  materialOptions,
  isLoadingMaterials,
  isSaving,
  onClose,
  onSaveItems,
  onEdit,
  onDelete,
  isDeleting,
  onPrintCodes,
  onPrintIssuedQrCodes,
  canEditComponents: canEditComponentsProp,
  canEditQrCodes = false
}: {
  product: ProductRow;
  initialTab?: ProductViewTab;
  materialOptions: MaterialOption[];
  isLoadingMaterials: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSaveItems: (items: ProductNplItem[]) => Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
  onPrintCodes?: (codes: ProductDetailCode[]) => Promise<void>;
  onPrintIssuedQrCodes?: (codes: ProductIssuedQrCode[]) => Promise<void>;
  canEditComponents?: boolean;
  canEditQrCodes?: boolean;
}) {
  const canEditComponents = canEditComponentsProp ?? Boolean(onEdit);
  const [tab, setTab] = useState<ProductViewTab>(initialTab);
  const [items, setItems] = useState<ProductNplItem[]>(product.nplItems);
  const [detailItem, setDetailItem] = useState<ProductNplItem | null>(null);
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [formIndex, setFormIndex] = useState<number | null>(null);
  const componentsFileInputRef = useRef<HTMLInputElement>(null);
  const [isReadingComponentsExcel, setIsReadingComponentsExcel] = useState(false);
  const [componentsExcelMessage, setComponentsExcelMessage] = useState('');
  const [componentsExcelError, setComponentsExcelError] = useState('');
  const [detailCodes, setDetailCodes] = useState<ProductDetailCode[]>([]);
  const [isLoadingDetailCodes, setIsLoadingDetailCodes] = useState(false);
  const [detailCodesError, setDetailCodesError] = useState('');
  const [selectedDetailCodeIds, setSelectedDetailCodeIds] = useState<Set<string>>(() => new Set());
  const [isPrintingDetailCodes, setIsPrintingDetailCodes] = useState(false);
  const [issuedQrCodes, setIssuedQrCodes] = useState<ProductIssuedQrCode[]>([]);
  const [isLoadingIssuedQrCodes, setIsLoadingIssuedQrCodes] = useState(false);
  const [issuedQrCodesError, setIssuedQrCodesError] = useState('');
  const [selectedIssuedQrIds, setSelectedIssuedQrIds] = useState<Set<string>>(() => new Set());
  const [isPrintingIssuedQrCodes, setIsPrintingIssuedQrCodes] = useState(false);
  const [issuedQrStatusFilter, setIssuedQrStatusFilter] = useState<'all' | 'dang_dung' | 'da_huy'>('all');
  const [updatingIssuedQrId, setUpdatingIssuedQrId] = useState('');
  const [kiemKhoRows, setKiemKhoRows] = useState<ProductKiemKhoRow[]>([]);
  const [isLoadingKiemKho, setIsLoadingKiemKho] = useState(false);
  const [kiemKhoError, setKiemKhoError] = useState('');
  const [warehouseSlipRows, setWarehouseSlipRows] = useState<ProductWarehouseSlipRow[]>([]);
  const [isLoadingWarehouseSlips, setIsLoadingWarehouseSlips] = useState(false);
  const [warehouseSlipError, setWarehouseSlipError] = useState('');
  const [stockFromKiem, setStockFromKiem] = useState<{
    opening: number | null;
    inbound: number | null;
    outbound: number | null;
    closing: number | null;
    chotAt: string;
    dot: string;
    confirmed: boolean;
  }>({
    opening: null,
    inbound: null,
    outbound: null,
    closing: null,
    chotAt: '',
    dot: '',
    confirmed: false
  });
  const [isLoadingStockFromKiem, setIsLoadingStockFromKiem] = useState(false);
  const [stockFromKiemError, setStockFromKiemError] = useState('');

  useEffect(() => {
    setItems(product.nplItems);
  }, [product.id]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, product.id]);

  useEffect(() => {
    if (tab !== 'codes') return;
    const controller = new AbortController();
    setIsLoadingDetailCodes(true);
    setDetailCodesError('');

    void fetch(`/api/san-pham/${encodeURIComponent(product.id)}/ma-chi-tiet`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể tải danh sách mã chi tiết.');
        const records = Array.isArray(data.records) ? data.records : [];
        const normalizedRecords = records.map((record: Record<string, unknown>) => ({
          id: String(record.id ?? ''),
          ma_sp_day_du: String(record.ma_sp_day_du ?? ''),
          ma_sp_goc: String(record.ma_sp_goc ?? ''),
          ten_kho: String(record.ten_kho ?? ''),
          trang_thai: String(record.trang_thai ?? ''),
          so_lan_in: Number(record.so_lan_in) || 0,
          ma_phieu_nhap: String(record.ma_phieu_nhap ?? ''),
          ma_phieu_xuat: String(record.ma_phieu_xuat ?? ''),
          created_at: String(record.created_at ?? '')
        }));
        setDetailCodes(normalizedRecords);
        const availableIds = new Set(normalizedRecords.map((record: ProductDetailCode) => record.id));
        setSelectedDetailCodeIds(previous => new Set([...previous].filter(id => availableIds.has(id))));
      })
      .catch(error => {
        if (error?.name !== 'AbortError') {
          setDetailCodes([]);
          setDetailCodesError(error?.message || 'Không thể tải danh sách mã chi tiết.');
        }
      })
      .finally(() => setIsLoadingDetailCodes(false));

    return () => controller.abort();
  }, [product.id, tab]);

  useEffect(() => {
    if (tab !== 'issued-qr') return;
    const controller = new AbortController();
    setIsLoadingIssuedQrCodes(true);
    setIssuedQrCodesError('');

    void fetch(`/api/san-pham/${encodeURIComponent(product.id)}/ma-qr-hang-hoa`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể tải danh sách QR đã cấp.');
        const records = Array.isArray(data.records) ? data.records : [];
        const normalizedRecords: ProductIssuedQrCode[] = records.map((record: Record<string, unknown>) => ({
          id: String(record.id ?? ''),
          ma_qr: String(record.ma_qr ?? ''),
          ma_sp_goc: String(record.ma_sp_goc ?? ''),
          ten_kho: String(record.ten_kho ?? ''),
          so_lan_in: Number(record.so_lan_in) || 0,
          ngay_in_gan_nhat: String(record.ngay_in_gan_nhat ?? ''),
          nguoi_tao: String(record.nguoi_tao ?? ''),
          trang_thai: String(record.trang_thai ?? ''),
          created_at: String(record.created_at ?? '')
        }));
        setIssuedQrCodes(normalizedRecords);
        const availableIds = new Set(normalizedRecords.map(record => record.id));
        setSelectedIssuedQrIds(previous => new Set([...previous].filter(id => availableIds.has(id))));
      })
      .catch(error => {
        if (error?.name !== 'AbortError') {
          setIssuedQrCodes([]);
          setIssuedQrCodesError(error?.message || 'Không thể tải danh sách QR đã cấp.');
        }
      })
      .finally(() => setIsLoadingIssuedQrCodes(false));

    return () => controller.abort();
  }, [product.id, tab]);

  useEffect(() => {
    if (tab !== 'kiem-kho') return;
    const controller = new AbortController();
    setIsLoadingKiemKho(true);
    setKiemKhoError('');

    const candidateCodes = [
      product.code,
      product.amisCode,
      product.newCode
    ]
      .map(code => String(code ?? '').trim())
      .filter(Boolean);

    const uniqueCodes = [...new Set(candidateCodes)];
    if (uniqueCodes.length === 0) {
      setKiemKhoRows([]);
      setIsLoadingKiemKho(false);
      return;
    }

    void (async () => {
      try {
        const batches = await Promise.all(
          uniqueCodes.map(async code => {
            const params = new URLSearchParams({
              maGoc: code,
              limit: '500'
            });
            const response = await fetch(`/api/kiem-kho?${params.toString()}`, {
              signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.error || 'Không thể tải dữ liệu kiểm kho.');
            }
            return Array.isArray(data.records) ? data.records : [];
          })
        );

        const seen = new Set<string>();
        const normalized: ProductKiemKhoRow[] = [];
        for (const record of batches.flat()) {
          if (!record || typeof record !== 'object') continue;
          const row = record as Record<string, unknown>;
          const id = String(row.id ?? '').trim();
          const key = id || `${row.ma_sp}-${row.ngay_gio_kiem_kho}-${row.dot_kiem_kho}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const maSp = String(row.ma_sp ?? '').trim();
          const maNvl = String(row.ma_nvl ?? '').trim();
          // Chỉ giữ dòng khớp mã SP: ma_nvl = mã gốc, hoặc tiền tố ma_sp trước _ / - serial.
          const matchesProduct = uniqueCodes.some(code => {
            const normCode = normalizeProductCodeKey(code);
            if (!normCode) return false;
            if (normalizeProductCodeKey(maNvl) === normCode) return true;
            if (normalizeProductCodeKey(maSp) === normCode) return true;
            const prefix = extractKiemKhoPrefix(maSp);
            return normalizeProductCodeKey(prefix) === normCode;
          });
          if (!matchesProduct) continue;

          normalized.push({
            id: id || key,
            ten_kho: String(row.ten_kho ?? '').trim(),
            dot_kiem_kho: String(row.dot_kiem_kho ?? '').trim(),
            ma_nvl: maNvl,
            ma_sp: maSp,
            ten_sp: String(row.ten_sp ?? '').trim(),
            loai_sp: String(row.loai_sp ?? '').trim(),
            ngay_gio_kiem_kho: String(row.ngay_gio_kiem_kho ?? '').trim(),
            nguoi_kiem_kho: String(row.nguoi_kiem_kho ?? '').trim(),
            thoi_gian_xac_nhan: String(row.thoi_gian_xac_nhan ?? '').trim()
          });
        }

        normalized.sort((a, b) => {
          const ta = Date.parse(a.ngay_gio_kiem_kho) || 0;
          const tb = Date.parse(b.ngay_gio_kiem_kho) || 0;
          return tb - ta;
        });
        setKiemKhoRows(normalized);
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          setKiemKhoRows([]);
          setKiemKhoError(error?.message || 'Không thể tải dữ liệu kiểm kho.');
        }
      } finally {
        setIsLoadingKiemKho(false);
      }
    })();

    return () => controller.abort();
  }, [product.amisCode, product.code, product.id, product.newCode, tab]);

  useEffect(() => {
    if (tab !== 'nhap-kho' && tab !== 'xuat-kho') return;
    const loai = tab === 'xuat-kho' ? 'xuat' : 'nhap';
    const controller = new AbortController();
    setIsLoadingWarehouseSlips(true);
    setWarehouseSlipError('');
    setWarehouseSlipRows([]);

    void fetch(`/api/san-pham/${encodeURIComponent(product.id)}/phieu-kho?loai=${loai}`, {
      signal: controller.signal
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể tải nhật ký xuất nhập kho.');
        const list = Array.isArray(data.movements) ? data.movements : [];
        const normalized: ProductWarehouseSlipRow[] = list.map((entry: Record<string, unknown>) => {
          const quantity = Number(entry.so_luong ?? entry.quantity);
          const docQty = Number(entry.so_luong_chung_tu ?? entry.documentQuantity);
          return {
            id: String(entry.id ?? ''),
            ma_phieu: String(entry.ma_phieu ?? '').trim(),
            ngay_phieu: String(entry.ngay_phieu ?? '').trim(),
            ca: String(entry.ca ?? '').trim(),
            may: String(entry.may ?? '').trim(),
            ma_sp: String(entry.ma_sp ?? '').trim(),
            ten_sp: String(entry.ten_sp ?? '').trim(),
            don_vi: String(entry.don_vi ?? '').trim() || '-',
            so_luong: Number.isFinite(quantity) ? quantity : 0,
            so_luong_chung_tu: Number.isFinite(docQty) ? docQty : null,
            ten_kho: String(entry.ten_kho ?? '').trim(),
            ly_do: String(entry.ly_do ?? '').trim(),
            ghi_chu: String(entry.ghi_chu ?? '').trim(),
            nguoi_lap: String(entry.nguoi_lap ?? entry.nhan_su ?? '').trim()
          };
        });
        setWarehouseSlipRows(normalized);
      })
      .catch(error => {
        if (error?.name !== 'AbortError') {
          setWarehouseSlipRows([]);
          setWarehouseSlipError(error?.message || 'Không thể tải nhật ký xuất nhập kho.');
        }
      })
      .finally(() => setIsLoadingWarehouseSlips(false));

    return () => controller.abort();
  }, [product.id, tab]);

  useEffect(() => {
    if (tab !== 'info') return;
    const controller = new AbortController();
    setIsLoadingStockFromKiem(true);
    setStockFromKiemError('');

    const uniqueCodes = productCodeCandidates(product);

    void (async () => {
      let opening: number | null = null;
      let chotAt = '';
      let dot = '';
      let confirmed = false;
      let openingError = '';

      try {
        if (uniqueCodes.length > 0) {
          const warehouse =
            product.warehouse && product.warehouse !== '-' ? String(product.warehouse).trim() : '';

          // Tồn đầu = tong_so_luong trên Bảng tổng hợp kiểm kho (không đếm dòng chi tiết).
          let best: {
            ton_dau_ky: number;
            chot_luc: string;
            dot_kiem_kho: string;
            confirmed: boolean;
          } | null = null;

          for (const code of uniqueCodes) {
            const params = new URLSearchParams({ maGoc: code });
            if (warehouse) params.set('tenKho', warehouse);
            const response = await fetch(`/api/kiem-kho/ton-dau-ky?${params.toString()}`, {
              signal: controller.signal
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.error || 'Không thể tải tồn đầu từ kiểm kho.');
            }
            const qty = Number(data.ton_dau_ky ?? data.tong_so_luong);
            if (!Number.isFinite(qty)) continue;
            best = {
              ton_dau_ky: qty,
              chot_luc: String(data.chot_luc ?? '').trim(),
              dot_kiem_kho: String(data.dot_kiem_kho ?? '').trim(),
              confirmed: Boolean(data.confirmed)
            };
            break;
          }

          if (best) {
            opening = best.ton_dau_ky;
            chotAt = best.chot_luc;
            dot = best.dot_kiem_kho;
            confirmed = best.confirmed;
          }
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        openingError = error?.message || 'Không thể tải tồn đầu từ kiểm kho.';
      }

      let inbound = 0;
      let outbound = 0;
      try {
        const [nhapRes, xuatRes] = await Promise.all([
          fetch(`/api/san-pham/${encodeURIComponent(product.id)}/phieu-kho?loai=nhap`, {
            signal: controller.signal
          }),
          fetch(`/api/san-pham/${encodeURIComponent(product.id)}/phieu-kho?loai=xuat`, {
            signal: controller.signal
          })
        ]);
        const [nhapData, xuatData] = await Promise.all([
          nhapRes.json().catch(() => ({})),
          xuatRes.json().catch(() => ({}))
        ]);
        if (!nhapRes.ok) throw new Error(nhapData.error || 'Không thể tải phiếu nhập kho.');
        if (!xuatRes.ok) throw new Error(xuatData.error || 'Không thể tải phiếu xuất kho.');

        const sumMovements = (movements: unknown[]) =>
          movements.reduce((sum, entry) => {
            if (!entry || typeof entry !== 'object') return sum;
            const qty = Number((entry as Record<string, unknown>).so_luong ?? 0);
            return sum + (Number.isFinite(qty) ? qty : 0);
          }, 0);

        // Tổng hợp đúng như tab Nhập kho / Xuất kho (cộng toàn bộ SL phiếu).
        inbound = sumMovements(Array.isArray(nhapData.movements) ? nhapData.movements : []);
        outbound = sumMovements(Array.isArray(xuatData.movements) ? xuatData.movements : []);
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setStockFromKiemError(
          [openingError, error?.message || 'Không thể tải tổng hợp nhập/xuất kho.']
            .filter(Boolean)
            .join(' · ')
        );
        setStockFromKiem({
          opening,
          inbound: null,
          outbound: null,
          closing: null,
          chotAt,
          dot,
          confirmed
        });
        setIsLoadingStockFromKiem(false);
        return;
      }

      const closing = opening !== null ? opening + inbound - outbound : null;
      setStockFromKiem({
        opening,
        inbound,
        outbound,
        closing,
        chotAt,
        dot,
        confirmed
      });
      setStockFromKiemError(openingError);
      setIsLoadingStockFromKiem(false);
    })();

    return () => controller.abort();
  }, [product.amisCode, product.code, product.id, product.newCode, product.warehouse, tab]);

  useEffect(() => {
    setSelectedDetailCodeIds(new Set());
    setSelectedIssuedQrIds(new Set());
  }, [product.id]);

  const printableDetailCodes = detailCodes.filter(code => code.trang_thai !== 'da_huy');
  const selectedDetailCodes = detailCodes.filter(
    code => code.trang_thai !== 'da_huy' && selectedDetailCodeIds.has(code.id)
  );
  const allDetailCodesSelected = printableDetailCodes.length > 0
    && printableDetailCodes.every(code => selectedDetailCodeIds.has(code.id));

  const toggleAllDetailCodes = () => {
    setSelectedDetailCodeIds(previous => {
      const next = new Set(previous);
      if (allDetailCodesSelected) {
        printableDetailCodes.forEach(code => next.delete(code.id));
      } else {
        printableDetailCodes.forEach(code => next.add(code.id));
      }
      return next;
    });
  };

  const handlePrintSelectedDetailCodes = async () => {
    if (!onPrintCodes || selectedDetailCodes.length === 0) return;
    setIsPrintingDetailCodes(true);
    setDetailCodesError('');
    try {
      await onPrintCodes(selectedDetailCodes);
      const selectedIds = new Set(selectedDetailCodes.map(code => code.id));
      setDetailCodes(previous => previous.map(code =>
        selectedIds.has(code.id) ? { ...code, so_lan_in: code.so_lan_in + 1 } : code
      ));
    } catch (error: any) {
      setDetailCodesError(error?.message || 'Không thể in các mã QR đã chọn.');
    } finally {
      setIsPrintingDetailCodes(false);
    }
  };

  const filteredIssuedQrCodes = issuedQrCodes.filter(code =>
    issuedQrStatusFilter === 'all' || code.trang_thai === issuedQrStatusFilter
  );
  const printableIssuedQrCodes = filteredIssuedQrCodes.filter(code => code.trang_thai !== 'da_huy');
  const selectedIssuedQrCodes = filteredIssuedQrCodes.filter(
    code => code.trang_thai !== 'da_huy' && selectedIssuedQrIds.has(code.id)
  );
  const allIssuedQrCodesSelected = printableIssuedQrCodes.length > 0
    && printableIssuedQrCodes.every(code => selectedIssuedQrIds.has(code.id));

  const toggleAllIssuedQrCodes = () => {
    setSelectedIssuedQrIds(previous => {
      const next = new Set(previous);
      if (allIssuedQrCodesSelected) printableIssuedQrCodes.forEach(code => next.delete(code.id));
      else printableIssuedQrCodes.forEach(code => next.add(code.id));
      return next;
    });
  };

  const handlePrintSelectedIssuedQrCodes = async () => {
    if (!onPrintIssuedQrCodes || selectedIssuedQrCodes.length === 0) return;
    setIsPrintingIssuedQrCodes(true);
    setIssuedQrCodesError('');
    try {
      await onPrintIssuedQrCodes(selectedIssuedQrCodes);
    } catch (error: any) {
      setIssuedQrCodesError(error?.message || 'Không thể in lại các mã QR đã chọn.');
    } finally {
      setIsPrintingIssuedQrCodes(false);
    }
  };

  const handleUpdateIssuedQrStatus = async (code: ProductIssuedQrCode, trangThai: 'dang_dung' | 'da_huy') => {
    if (code.trang_thai === trangThai) return;
    setUpdatingIssuedQrId(code.id);
    setIssuedQrCodesError('');
    try {
      const response = await fetch(`/api/ma-qr-hang-hoa/${encodeURIComponent(code.id)}/trang-thai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trang_thai: trangThai })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể cập nhật trạng thái QR.');
      setIssuedQrCodes(previous => previous.map(item => item.id === code.id ? { ...item, trang_thai: trangThai } : item));
      if (trangThai === 'da_huy') {
        setSelectedIssuedQrIds(previous => {
          const next = new Set(previous);
          next.delete(code.id);
          return next;
        });
      }
    } catch (error: any) {
      setIssuedQrCodesError(error?.message || 'Không thể cập nhật trạng thái QR.');
    } finally {
      setUpdatingIssuedQrId('');
    }
  };

  const formatDinhLuong = (item: ProductNplItem) => {
    const parts: string[] = [];
    if (item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)) {
      parts.push(`${formatNplDecimal(item.percent)}%`);
    }
    // Không đưa Kg vào Định lượng — Kg chỉ hiện ở cột Trọng lượng.
    if (
      item.quantity !== null &&
      item.quantity !== undefined &&
      Number.isFinite(item.quantity) &&
      !isProductNplKgUnit(item.unit)
    ) {
      const unit = String(item.unit ?? '').trim();
      const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
      parts.push(`${formatNplDecimal(item.quantity)}${unitSuffix}`);
    }
    if (parts.length > 0) return parts.join(' · ');
    if (isProductNplKgUnit(item.unit) && item.quantity !== null && Number.isFinite(item.quantity)) {
      return '—';
    }
    return formatProductNplAmount(item, { resolvedWeightKg: null });
  };

  /** Cột Trọng lượng: CHỈ số từ Excel (weightKg hoặc dòng Định lượng ĐVT=Kg). Không nhân %. */
  const formatTrongLuong = (item: ProductNplItem) => {
    let weight: number | null = null;
    if (item.weightKg !== null && item.weightKg !== undefined && Number.isFinite(item.weightKg) && item.weightKg >= 0) {
      weight = item.weightKg;
    } else if (
      item.quantity !== null &&
      item.quantity !== undefined &&
      Number.isFinite(item.quantity) &&
      item.quantity >= 0 &&
      isProductNplKgUnit(item.unit)
    ) {
      weight = item.quantity;
    }
    if (weight === null) return '—';
    return `${formatNplWeightKg(weight)} kg`;
  };

  const openAddForm = () => {
    if (!canEditComponents) return;
    setFormIndex(null);
    setFormMode('add');
  };

  const openEditForm = (index: number) => {
    if (!canEditComponents) return;
    setFormIndex(index);
    setFormMode('edit');
  };

  const handleDeleteItem = async (index: number) => {
    if (!canEditComponents) return;
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
      // Gộp với dòng cũ để giữ loại ĐVT còn lại khi chỉ sửa một loại.
      nextItems = items.map((existing, index) =>
        index === formIndex ? mergeProductNplItemsByUnitKinds(existing, item) : existing
      );
    } else {
      const codeKey = normalizeProductCodeKey(item.code);
      const existingIndex = items.findIndex(
        row => normalizeProductCodeKey(row.code) === codeKey
      );
      if (existingIndex >= 0) {
        // Trùng mã + khác loại ĐVT → gộp 2 loại đơn vị trên cùng dòng thành phần.
        nextItems = items.map((row, index) =>
          index === existingIndex ? mergeProductNplItemsByUnitKinds(row, item) : row
        );
      } else {
        nextItems = [...items, item];
      }
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
        unit: item.unit,
        weightKg: item.weightKg
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
      const candidateKeys = [
        normalizeProductCodeKey(product.code),
        normalizeProductCodeKey(product.newCode),
        normalizeProductCodeKey(product.amisCode)
      ].filter(Boolean);

      const bulkRows = await parseBulkProductNplComponentsExcel(file);
      const bulkMap = bulkExcelRowsToProductMap(bulkRows, materialOptions);
      const longMap = await parseThanhPhanLongFormatExcel(file);

      const pickList = (map: Map<string, ProductNplItem[]>): ProductNplItem[] => {
        for (const key of candidateKeys) {
          const list = map.get(key);
          if (list && list.length > 0) return list;
        }
        if (map.size === 1) return [...map.values()][0];
        return [];
      };

      const pickLongRows = () => {
        for (const key of candidateKeys) {
          const list = longMap.get(key);
          if (list && list.length > 0) return list;
        }
        if (longMap.size === 1) return [...longMap.values()][0];
        return [];
      };

      const fromLong: ProductNplItem[] = pickLongRows().map(row => {
        const material = findMaterialOptionByCode(materialOptions, row.code);
        return {
          code: (material?.code || row.code).trim(),
          name: material?.name || row.code,
          amountType: row.amountType,
          percent: row.percent,
          quantity: row.quantity,
          unit: row.unit || (row.amountType === 'percent' ? '%' : '-'),
          weightKg: row.weightKg
        };
      });

      const mergeByCode = (primary: ProductNplItem[], secondary: ProductNplItem[]): ProductNplItem[] => {
        const map = new Map<string, ProductNplItem>();
        const upsert = (item: ProductNplItem) => {
          const key = normalizeProductCodeKey(item.code);
          const prev = map.get(key);
          const weightFromItem =
            item.weightKg !== null && item.weightKg !== undefined && Number.isFinite(item.weightKg)
              ? item.weightKg
              : item.quantity !== null &&
                  Number.isFinite(item.quantity) &&
                  isProductNplKgUnit(item.unit)
                ? item.quantity
                : null;
          if (!prev) {
            map.set(key, {
              ...item,
              weightKg: weightFromItem,
              quantity:
                item.quantity !== null && !isProductNplKgUnit(item.unit) ? item.quantity : null,
              unit: isProductNplKgUnit(item.unit)
                ? item.percent !== null && item.percent !== undefined
                  ? '%'
                  : item.unit
                : item.unit
            });
            return;
          }
          const nextPercent = item.percent ?? prev.percent;
          const nextQty =
            item.quantity !== null && !isProductNplKgUnit(item.unit)
              ? item.quantity
              : prev.quantity !== null && !isProductNplKgUnit(prev.unit)
                ? prev.quantity
                : null;
          const nextUnit =
            nextQty !== null ? item.unit || prev.unit : nextPercent !== null ? '%' : item.unit || prev.unit;
          map.set(key, {
            code: item.code || prev.code,
            name: item.name || prev.name,
            amountType:
              nextQty !== null && nextPercent === null
                ? 'quantity'
                : nextPercent !== null
                  ? 'percent'
                  : item.amountType,
            percent: nextPercent,
            quantity: nextQty,
            unit: nextUnit,
            weightKg: weightFromItem ?? prev.weightKg ?? null
          });
        };

        primary.forEach(upsert);
        secondary.forEach(upsert);
        return [...map.values()];
      };

      const parsed = mergeByCode(pickList(bulkMap), fromLong);

      if (parsed.length === 0 && (bulkMap.size > 0 || longMap.size > 0)) {
        const sampleSp = [...new Set([...bulkMap.keys(), ...longMap.keys()])].slice(0, 5).join(', ');
        throw new Error(
          `File không có thành phần cho mã SP "${product.code}". Các mã trong file: ${sampleSp}.`
        );
      }

      if (parsed.length === 0) {
        throw new Error(
          'File Excel không đọc được. Cần đúng cột: Mã SP, Mã NVL, Loại, Giá trị, ĐVT.'
        );
      }

      const importedItems = parsed.map(item => {
        const weightKg =
          item.weightKg !== null && item.weightKg !== undefined && Number.isFinite(item.weightKg)
            ? item.weightKg
            : item.quantity !== null &&
                Number.isFinite(item.quantity) &&
                isProductNplKgUnit(item.unit)
              ? item.quantity
              : null;
        const hasPercent = item.percent !== null && item.percent !== undefined;
        const hasQty = item.quantity !== null && !isProductNplKgUnit(item.unit);
        return {
          code: item.code,
          name: item.name,
          amountType: (hasQty && !hasPercent ? 'quantity' : hasPercent ? 'percent' : item.amountType) as ProductNplAmountType,
          percent: hasPercent ? item.percent : null,
          quantity: hasQty ? item.quantity : null,
          unit: hasQty ? item.unit : hasPercent ? '%' : item.unit,
          weightKg
        };
      });

      const withWeight = importedItems.filter(
        item => item.weightKg !== null && item.weightKg !== undefined
      ).length;
      const weightSamples = importedItems
        .filter(item => item.weightKg !== null && item.weightKg !== undefined)
        .slice(0, 4)
        .map(item => `${item.code}=${formatNplWeightKg(item.weightKg!)}`)
        .join(', ');

      const summary = [
        `ghi ${importedItems.length} NVL`,
        `Trọng lượng Kg: ${withWeight}/${importedItems.length}`,
        weightSamples ? `vd ${weightSamples}` : ''
      ]
        .filter(Boolean)
        .join(' · ');

      if (withWeight === 0) {
        throw new Error(
          `Không đọc được dòng Trọng lượng (Loại=Số lượng, ĐVT=Kg).\n` +
            `Mã SP đang mở: "${product.code}" (khớp Excel bỏ khoảng trắng → ${normalizeProductCodeKey(product.code) || '—'}).\n` +
            `Mã trong file: ${[...new Set([...bulkMap.keys(), ...longMap.keys()])].slice(0, 8).join(', ') || '(không có)'}.`
        );
      }

      if (!window.confirm(`Excel: ${summary}.\nLưu vào sản phẩm (ghi đè thành phần)?`)) {
        return;
      }

      setItems(importedItems);
      await onSaveItems(importedItems);
      setItems(importedItems);
      setComponentsExcelMessage(`Đã lưu (${summary}).`);
    } catch (error: any) {
      setComponentsExcelError(error.message || 'Không thể đọc file Excel.');
    } finally {
      setIsReadingComponentsExcel(false);
      if (componentsFileInputRef.current) {
        componentsFileInputRef.current.value = '';
      }
    }
  };

  const compactInfoRows = ([
    ['Mã SP', product.code || '-'],
    ['Mã AMIS', productAmisDisplayCode(product)],
    ...(product.newCode && product.newCode !== '-' && product.newCode !== product.code
      ? [['Mã mới', product.newCode] as [string, string]]
      : []),
    ['Nhóm', product.group],
    ['Tính chất', product.nature],
    ['Kho', product.warehouse],
    ['Tồn TT', product.minStock],
    ['Nguồn gốc', product.origin]
  ] as [string, string][]).filter(([, value]) => value && value !== '-');

  // Tồn đầu kỳ ← Kiểm kho; Nhập/Xuất ← tổng SL tab Nhập kho / Xuất kho.
  const openingStockNum = stockFromKiem.opening;
  const inboundNum = stockFromKiem.inbound;
  const outboundNum = stockFromKiem.outbound;
  const closingStockNum =
    stockFromKiem.closing !== null
      ? stockFromKiem.closing
      : openingStockNum !== null && inboundNum !== null && outboundNum !== null
        ? openingStockNum + inboundNum - outboundNum
        : null;

  const formatStockCell = (value: number | null) => {
    if (value !== null && Number.isFinite(value)) return formatNplDecimal(value);
    return '—';
  };

  const stockPeriodNote = (() => {
    if (isLoadingStockFromKiem) return 'Đang tải tồn kho…';
    if (stockFromKiemError) return stockFromKiemError;
    const parts: string[] = [];
    if (stockFromKiem.opening === null) {
      parts.push('Chưa có dữ liệu kiểm kho');
    } else {
      const chotLabel = stockFromKiem.chotAt
        ? new Date(stockFromKiem.chotAt).toLocaleString('vi-VN')
        : '';
      parts.push(
        [
          'Tồn đầu = Tổng SL Bảng tổng hợp Kiểm kho',
          stockFromKiem.confirmed ? 'đã chốt' : 'chưa chốt',
          stockFromKiem.dot ? `đợt ${stockFromKiem.dot}` : '',
          chotLabel ? `· ${chotLabel}` : ''
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
    parts.push('Nhập/Xuất = tổng SL tab Nhập kho / Xuất kho');
    return parts.join(' · ');
  })();

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-3">
      <div className="flex h-full max-h-[98vh] min-h-[85vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl xl:max-w-7xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-red-500">Xem sản phẩm</p>
            <h3 className="mt-1 text-lg font-black text-zinc-950">{product.name || product.code}</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{product.code}{product.newCode ? ` · ${product.newCode}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                title="Sửa"
                className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-50"
              >
                <Pencil className="h-4 w-4" />
                Sửa
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                title="Xóa"
                className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xóa
              </button>
            )}
            <BackButton onClick={onClose} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-zinc-200 px-4">
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
          <button
            type="button"
            onClick={() => setTab('nhap-kho')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'nhap-kho' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Download className="h-4 w-4" />
            Nhập kho
          </button>
          <button
            type="button"
            onClick={() => setTab('xuat-kho')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'xuat-kho' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <Upload className="h-4 w-4" />
            Xuất kho
          </button>
          <button
            type="button"
            onClick={() => setTab('issued-qr')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${
              tab === 'issued-qr' ? 'border-[#ef1b2d] text-[#ef1b2d]' : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            <QrCode className="h-4 w-4" />
            Mã QR đã cấp
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

              <section className="overflow-hidden rounded-xl border-2 border-sky-200 bg-sky-50/30">
                <div className="border-b border-sky-200 bg-sky-50 px-3 py-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-sky-800">Tồn kho</p>
                  <p className="text-[10px] font-semibold text-sky-700/80">
                    Mã SP · {product.code || '—'}
                    {product.unit && product.unit !== '-' ? ` · ${product.unit}` : ''}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-sky-600/90">{stockPeriodNote}</p>
                </div>
                <div className="overflow-x-auto p-2">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-[#ef1b2d] text-[9px] uppercase tracking-wider text-white">
                        <th className="whitespace-nowrap px-2 py-2 font-black">Mã SP</th>
                        <th className="whitespace-nowrap px-2 py-2 font-black text-right">Tồn đầu kỳ</th>
                        <th className="whitespace-nowrap px-2 py-2 font-black text-right">Nhập trong kỳ</th>
                        <th className="whitespace-nowrap px-2 py-2 font-black text-right">Xuất trong kỳ</th>
                        <th className="whitespace-nowrap px-2 py-2 font-black text-right">Tồn cuối kỳ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td className="whitespace-pre border border-zinc-200 px-2 py-2 font-black text-zinc-950">
                          {product.code || '—'}
                        </td>
                        <td className="whitespace-nowrap border border-zinc-200 px-2 py-2 text-right font-bold text-zinc-900">
                          {isLoadingStockFromKiem ? '…' : formatStockCell(openingStockNum)}
                        </td>
                        <td className="whitespace-nowrap border border-zinc-200 px-2 py-2 text-right font-bold text-emerald-700">
                          {isLoadingStockFromKiem ? '…' : formatStockCell(inboundNum)}
                        </td>
                        <td className="whitespace-nowrap border border-zinc-200 px-2 py-2 text-right font-bold text-rose-700">
                          {isLoadingStockFromKiem ? '…' : formatStockCell(outboundNum)}
                        </td>
                        <td className="whitespace-nowrap border border-zinc-200 bg-sky-50 px-2 py-2 text-right font-black text-sky-900">
                          {isLoadingStockFromKiem ? '…' : formatStockCell(closingStockNum)}
                        </td>
                      </tr>
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
                        <tr className="bg-[#ef1b2d] text-[9px] uppercase tracking-wider text-white">
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
          ) : tab === 'issued-qr' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-zinc-950">Danh sách QR đã cấp</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    Mỗi mã đã được lưu duy nhất trong CSDL; chọn mã để in lại mà không sinh mã mới.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterCombobox
                    label="Trạng thái"
                    options={['dang_dung', 'da_huy']}
                    value={issuedQrStatusFilter}
                    onChange={value => {
                      setIssuedQrStatusFilter(value as 'all' | 'dang_dung' | 'da_huy');
                      setSelectedIssuedQrIds(new Set());
                    }}
                    formatOption={value => value === 'dang_dung' ? 'Đang dùng' : 'Đã hủy'}
                    searchPlaceholder="Tìm trạng thái..."
                    searchable={false}
                    compact
                    buttonClassName="h-9 text-xs font-bold"
                  />
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#ef1b2d]">
                    {selectedIssuedQrCodes.length > 0
                      ? `Đã chọn ${selectedIssuedQrCodes.length}/${printableIssuedQrCodes.length}`
                      : `${filteredIssuedQrCodes.length} mã`}
                  </span>
                  {onPrintIssuedQrCodes ? (
                    <button
                      type="button"
                      onClick={() => void handlePrintSelectedIssuedQrCodes()}
                      disabled={selectedIssuedQrCodes.length === 0 || isPrintingIssuedQrCodes}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-black text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPrintingIssuedQrCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      {isPrintingIssuedQrCodes ? 'Đang chuẩn bị...' : 'In lại mã đã chọn'}
                    </button>
                  ) : null}
                </div>
              </div>

              {issuedQrCodesError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {issuedQrCodesError}
                </p>
              ) : null}

              <TableShell minWidthClassName="min-w-[980px]" maxHeightClassName="max-h-[58vh]">
                <TableHead>
                  <TableHeadCell align="center" className="w-12">
                    <input
                      type="checkbox"
                      checked={allIssuedQrCodesSelected}
                      onChange={toggleAllIssuedQrCodes}
                      disabled={printableIssuedQrCodes.length === 0}
                      aria-label="Chọn tất cả QR đã cấp"
                      className="h-4 w-4 cursor-pointer accent-[#ef1b2d] disabled:cursor-not-allowed"
                    />
                  </TableHeadCell>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã QR đầy đủ</TableHeadCell>
                  <TableHeadCell>Trạng thái</TableHeadCell>
                  <TableHeadCell>Kho</TableHeadCell>
                  <TableHeadCell align="center">Số lần in</TableHeadCell>
                  <TableHeadCell>Ngày in gần nhất</TableHeadCell>
                  <TableHeadCell>Ngày cấp</TableHeadCell>
                </TableHead>
                <TableBody>
                  {filteredIssuedQrCodes.map((code, index) => (
                    <TableRow key={code.id || code.ma_qr}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIssuedQrIds.has(code.id)}
                          disabled={code.trang_thai === 'da_huy'}
                          onChange={() => setSelectedIssuedQrIds(previous => {
                            const next = new Set(previous);
                            if (next.has(code.id)) next.delete(code.id);
                            else next.add(code.id);
                            return next;
                          })}
                          aria-label={`Chọn in ${code.ma_qr}`}
                          className="h-4 w-4 cursor-pointer accent-[#ef1b2d] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                      <td className="px-4 py-3 font-mono font-black text-zinc-950">{code.ma_qr}</td>
                      <td className="px-4 py-3">
                        {canEditQrCodes ? (
                          <select
                            value={code.trang_thai}
                            disabled={updatingIssuedQrId === code.id}
                            onChange={event => void handleUpdateIssuedQrStatus(code, event.target.value as 'dang_dung' | 'da_huy')}
                            className="h-8 cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 text-xs font-bold text-zinc-700 outline-none transition focus:border-[#ef1b2d] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Đổi trạng thái ${code.ma_qr}`}
                          >
                            <option value="dang_dung">Đang dùng</option>
                            <option value="da_huy">Đã hủy</option>
                          </select>
                        ) : (
                          <StatusBadge label={code.trang_thai === 'dang_dung' ? 'Đang dùng' : code.trang_thai === 'da_huy' ? 'Đã hủy' : code.trang_thai || '-'} color={code.trang_thai === 'dang_dung' ? 'emerald' : 'rose'} />
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-700">{code.ten_kho || '-'}</td>
                      <td className="px-4 py-3 text-center font-bold text-zinc-700">{code.so_lan_in}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-zinc-600">{code.ngay_in_gan_nhat ? new Date(code.ngay_in_gan_nhat).toLocaleString('vi-VN') : '-'}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-zinc-600">{code.created_at ? new Date(code.created_at).toLocaleString('vi-VN') : '-'}</td>
                    </TableRow>
                  ))}
                  {!isLoadingIssuedQrCodes && filteredIssuedQrCodes.length === 0 ? <TableEmptyRow colSpan={8}>{issuedQrCodes.length === 0 ? 'Sản phẩm này chưa có mã QR đã cấp.' : 'Không có mã QR theo trạng thái đã chọn.'}</TableEmptyRow> : null}
                  {isLoadingIssuedQrCodes ? <TableEmptyRow colSpan={8}>Đang tải danh sách QR đã cấp...</TableEmptyRow> : null}
                </TableBody>
              </TableShell>
            </div>
          ) : tab === 'codes' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-zinc-950">Danh sách mã sản phẩm chi tiết</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    Mỗi mã QR là một đơn vị tồn kho; danh sách chính vẫn dùng mã gốc {product.code}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-[#ef1b2d]">
                    {selectedDetailCodes.length > 0
                      ? `Đã chọn ${selectedDetailCodes.length}/${printableDetailCodes.length}`
                      : `${detailCodes.length} mã`}
                  </span>
                  {onPrintCodes ? (
                    <button
                      type="button"
                      onClick={() => void handlePrintSelectedDetailCodes()}
                      disabled={selectedDetailCodes.length === 0 || isPrintingDetailCodes}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-black text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPrintingDetailCodes ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <QrCode className="h-4 w-4" />
                      )}
                      {isPrintingDetailCodes ? 'Đang tạo QR...' : 'In mã QR đã chọn'}
                    </button>
                  ) : null}
                </div>
              </div>

              {detailCodesError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {detailCodesError}
                </p>
              ) : null}

              <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[58vh]">
                <TableHead>
                  <TableHeadCell align="center" className="w-12">
                    <input
                      type="checkbox"
                      checked={allDetailCodesSelected}
                      onChange={toggleAllDetailCodes}
                      disabled={printableDetailCodes.length === 0}
                      aria-label="Chọn tất cả mã QR"
                      className="h-4 w-4 cursor-pointer accent-[#ef1b2d] disabled:cursor-not-allowed"
                    />
                  </TableHeadCell>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã sản phẩm đầy đủ</TableHeadCell>
                  <TableHeadCell>Trạng thái</TableHeadCell>
                  <TableHeadCell>Kho</TableHeadCell>
                  <TableHeadCell>Phiếu nhập</TableHeadCell>
                  <TableHeadCell align="center">Số lần in</TableHeadCell>
                  <TableHeadCell>Ngày tạo</TableHeadCell>
                </TableHead>
                <TableBody>
                  {detailCodes.map((code, index) => (
                    <TableRow key={code.id || code.ma_sp_day_du}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedDetailCodeIds.has(code.id)}
                          disabled={code.trang_thai === 'da_huy'}
                          onChange={() => setSelectedDetailCodeIds(previous => {
                            const next = new Set(previous);
                            if (next.has(code.id)) next.delete(code.id);
                            else next.add(code.id);
                            return next;
                          })}
                          aria-label={`Chọn in ${code.ma_sp_day_du}`}
                          className="h-4 w-4 cursor-pointer accent-[#ef1b2d] disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                      <td className="px-4 py-3 font-mono font-black text-zinc-950">{code.ma_sp_day_du}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={
                            code.trang_thai === 'trong_kho' ? 'Trong kho'
                              : code.trang_thai === 'da_xuat' ? 'Đã xuất'
                                : code.trang_thai === 'that_lac' ? 'Thất lạc'
                                  : code.trang_thai === 'da_huy' ? 'Đã hủy'
                                    : code.trang_thai || '-'
                          }
                          color={code.trang_thai === 'trong_kho' ? 'emerald' : code.trang_thai === 'da_xuat' ? 'zinc' : 'rose'}
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-zinc-700">{code.ten_kho || '-'}</td>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-700">{code.ma_phieu_nhap || '-'}</td>
                      <td className="px-4 py-3 text-center font-bold text-zinc-700">{code.so_lan_in}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-zinc-600">
                        {code.created_at ? new Date(code.created_at).toLocaleString('vi-VN') : '-'}
                      </td>
                    </TableRow>
                  ))}
                  {!isLoadingDetailCodes && detailCodes.length === 0 ? (
                    <TableEmptyRow colSpan={8}>Sản phẩm này chưa có mã QR chi tiết được lưu.</TableEmptyRow>
                  ) : null}
                  {isLoadingDetailCodes ? (
                    <TableEmptyRow colSpan={8}>Đang tải danh sách mã chi tiết...</TableEmptyRow>
                  ) : null}
                </TableBody>
              </TableShell>
            </div>
          ) : tab === 'components' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-zinc-950">Bảng thành phần NVL</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEditComponents ? (
                    <>
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
                    </>
                  ) : null}
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

              <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="">
                <TableHead>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã NPL</TableHeadCell>
                  <TableHeadCell>Tên NVL</TableHeadCell>
                  <TableHeadCell>Định lượng</TableHeadCell>
                  <TableHeadCell>Trọng lượng</TableHeadCell>
                  <TableHeadCell align="center">Hành động</TableHeadCell>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <React.Fragment key={`${item.code}-${index}`}>
                      <TableRow>
                        <td className="px-4 py-3 font-bold text-zinc-600">{index + 1}</td>
                        <td className="px-4 py-3 font-black text-zinc-950">{item.code}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-800">{item.name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                            {formatDinhLuong(item)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          {formatTrongLuong(item)}
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
                            {canEditComponents ? (
                              <>
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
                              </>
                            ) : null}
                          </div>
                        </td>
                      </TableRow>
                    </React.Fragment>
                  ))}
                  {items.length === 0 && (
                    <TableEmptyRow colSpan={6}>Chưa khai báo thành phần NVL.</TableEmptyRow>
                  )}
                </TableBody>
              </TableShell>
            </div>
          ) : tab === 'nhap-kho' || tab === 'xuat-kho' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-zinc-950">
                    {tab === 'xuat-kho' ? 'Nhật ký xuất kho' : 'Nhật ký nhập kho'}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    Theo mã SP {product.code} · bảng phieu_xuat_nhap_kho
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-800">
                  {warehouseSlipRows.length} dòng
                </span>
              </div>

              {warehouseSlipError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {warehouseSlipError}
                </p>
              ) : null}

              <TableShell minWidthClassName="min-w-[1100px]" maxHeightClassName="max-h-[58vh]">
                <TableHead>
                  <TableHeadCell className="whitespace-nowrap">STT</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Ngày</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Mã phiếu</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Kho</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Ca</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Máy</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Mã SP dòng</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap text-right">SL</TableHeadCell>
                  {tab === 'xuat-kho' ? (
                    <TableHeadCell className="whitespace-nowrap text-right">SL CT</TableHeadCell>
                  ) : null}
                  <TableHeadCell className="whitespace-nowrap">ĐVT</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Người lập</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Lý do / Ghi chú</TableHeadCell>
                </TableHead>
                <TableBody>
                  {warehouseSlipRows.map((row, index) => (
                    <TableRow key={row.id || `${row.ma_phieu}-${index}`}>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-600">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-800">
                        {row.ngay_phieu || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-zinc-950">
                        {row.ma_phieu || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                        {row.ten_kho || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{row.ca || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{row.may || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-zinc-800">
                        {row.ma_sp || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-black text-zinc-950">
                        {formatNplDecimal(row.so_luong)}
                      </td>
                      {tab === 'xuat-kho' ? (
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-zinc-700">
                          {row.so_luong_chung_tu === null ? '—' : formatNplDecimal(row.so_luong_chung_tu)}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{row.don_vi}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{row.nguoi_lap || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-600">
                        {[row.ly_do, row.ghi_chu].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </TableRow>
                  ))}
                  {isLoadingWarehouseSlips ? (
                    <TableEmptyRow colSpan={tab === 'xuat-kho' ? 12 : 11}>Đang tải nhật ký…</TableEmptyRow>
                  ) : null}
                  {!isLoadingWarehouseSlips && warehouseSlipRows.length === 0 ? (
                    <TableEmptyRow colSpan={tab === 'xuat-kho' ? 12 : 11}>
                      {tab === 'xuat-kho'
                        ? 'Chưa có phiếu xuất kho cho sản phẩm này.'
                        : 'Chưa có phiếu nhập kho cho sản phẩm này.'}
                    </TableEmptyRow>
                  ) : null}
                </TableBody>
              </TableShell>
            </div>
          ) : null}
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
                ['Định lượng', formatDinhLuong(detailItem)],
                ['Trọng lượng', formatTrongLuong(detailItem)],
                ['Sản phẩm', product.code]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className={`rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 ${label === 'Định lượng' ? 'col-span-2' : ''}`}
                >
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
          existingItems={items.filter((_, index) => formMode !== 'edit' || index !== formIndex)}
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

const GOODS_WAREHOUSE_NAME = 'Kho hàng hóa';

function resolveGoodsWarehouseName(warehouseOptions: string[]) {
  const target = normalizeWarehouseName(GOODS_WAREHOUSE_NAME);
  return warehouseOptions.find(name => normalizeWarehouseName(name) === target) || GOODS_WAREHOUSE_NAME;
}

export function normalizeProducts(data: unknown): ProductRow[] {
  const products = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  if (!Array.isArray(products)) return [];

  return products
    .map((item): ProductRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? '').trim();
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
        warehouse: String(record.ten_kho ?? '').trim(),
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

export type ProductFormState = {
  code: string;
  newCode: string;
  amisCode: string;
  name: string;
  nature: string;
  group: string;
  unit: string;
  warehouse: string;
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

export function productCellToInput(value: string) {
  return value === '-' ? '' : value;
}

export function productToForm(product: ProductRow): ProductFormState {
  return {
    code: productCellToInput(product.code),
    newCode: productCellToInput(product.newCode),
    amisCode: productCellToInput(product.amisCode),
    name: productCellToInput(product.name),
    nature: productCellToInput(product.nature),
    group: productCellToInput(product.group),
    unit: productCellToInput(product.unit),
    warehouse: productCellToInput(product.warehouse),
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

export function emptyProductForm(): ProductFormState {
  return {
    code: '',
    newCode: '',
    amisCode: '',
    name: '',
    nature: '',
    group: '',
    unit: '',
    warehouse: '',
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

export function productFormToPayload(form: ProductFormState) {
  return {
    code: form.code.trim(),
    newCode: form.newCode.trim(),
    amisCode: form.amisCode.trim(),
    name: form.name.trim(),
    nature: form.nature.trim(),
    group: form.group.trim(),
    unit: form.unit.trim(),
    warehouse: form.warehouse.trim(),
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

export function ProductEditModal({
  mode,
  product,
  warehouseOptions,
  defaultWarehouse,
  isSaving,
  formError,
  onClose,
  onSave
}: {
  mode: 'add' | 'edit';
  product: ProductRow | null;
  warehouseOptions: string[];
  defaultWarehouse?: string;
  isSaving: boolean;
  formError: string;
  onClose: () => void;
  onSave: (form: ProductFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<ProductFormState>(() =>
    mode === 'edit' && product ? productToForm(product) : { ...emptyProductForm(), warehouse: defaultWarehouse || '' }
  );

  useEffect(() => {
    setForm(mode === 'edit' && product ? productToForm(product) : { ...emptyProductForm(), warehouse: defaultWarehouse || '' });
  }, [defaultWarehouse, mode, product?.id]);

  const fields: Array<{ key: keyof ProductFormState; label: string; required?: boolean; span?: boolean }> = [
    { key: 'code', label: 'Mã SP', required: true },
    { key: 'amisCode', label: 'Mã AMIS' },
    { key: 'newCode', label: 'Mã mới' },
    { key: 'name', label: 'Tên sản phẩm', required: true },
    { key: 'nature', label: 'Tính chất' },
    { key: 'group', label: 'Nhóm VTHH' },
    { key: 'unit', label: 'Đơn vị tính' },
    { key: 'warehouse', label: 'Kho lưu trữ', required: true },
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
            {mode !== 'add' && (
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">{product?.code || '-'}</p>
            )}
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
              {field.key === 'warehouse' ? (
                <SearchableSelect
                  value={form.warehouse}
                  onChange={value => setForm(prev => ({ ...prev, warehouse: value }))}
                  options={warehouseOptions}
                  placeholder="Chọn kho lưu trữ"
                  searchPlaceholder="Tìm kho..."
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  inputClassName={productFieldClass}
                  allowEmpty={false}
                  comboboxMode
                />
              ) : (
                <input
                  type="text"
                  value={form[field.key]}
                  onChange={event => setForm(prev => ({ ...prev, [field.key]: event.target.value }))}
                  className={productFieldClass}
                />
              )}
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

export function ProductsPanel({
  onBack,
  warehouseFilter = '',
  includeUnassigned = false,
  asOfDate = '',
  balanceRows = [],
  topControls = null
}: {
  onBack: () => void;
  warehouseFilter?: string;
  includeUnassigned?: boolean;
  asOfDate?: string;
  balanceRows?: InventoryBalanceRow[];
  topControls?: ReactNode;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('products');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedNatures, setSelectedNatures] = useState<Set<string>>(() => new Set());
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [catalogQrPrintLabels, setCatalogQrPrintLabels] = useState<WarehouseProductQrPrintLabel[]>([]);
  const [catalogQrPrintOpen, setCatalogQrPrintOpen] = useState(false);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [printQrLabels, setPrintQrLabels] = useState<ProductQrPrintLabel[]>([]);
  const [printQrImages, setPrintQrImages] = useState<Record<string, string>>({});
  const [isGeneratingPrintQr, setIsGeneratingPrintQr] = useState(false);
  const [showPrintQtyModal, setShowPrintQtyModal] = useState(false);
  const [printQtyById, setPrintQtyById] = useState<Record<string, string>>({});
  const [printQtyError, setPrintQtyError] = useState('');
  const [bulkPrintQty, setBulkPrintQty] = useState('1');
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  const [isReassigningWarehouse, setIsReassigningWarehouse] = useState(false);
  const [isWarehouseReassignOpen, setIsWarehouseReassignOpen] = useState(false);
  const [reassignWarehouseName, setReassignWarehouseName] = useState('');
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
  const catalogFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingBulkProductComponents, setIsImportingBulkProductComponents] = useState(false);
  const [isImportingProductCatalog, setIsImportingProductCatalog] = useState(false);
  const [isImportSpViewOpen, setIsImportSpViewOpen] = useState(false);
  const [isLoadingImportSp, setIsLoadingImportSp] = useState(false);
  const [isSyncingImportSp, setIsSyncingImportSp] = useState(false);
  const [importSpRows, setImportSpRows] = useState<
    Array<{
      id: string;
      ma_sp: string;
      ma_nvl: string;
      ten_nvl: string | null;
      loai: string | null;
      gia_tri: number | null;
      dvt: string | null;
      phan_tram: number | null;
      so_luong: number | null;
      khoi_luong_kg: number | null;
      batch_id: string;
      file_name: string | null;
      so_dong_excel: number | null;
      trang_thai: string;
      imported_at: string | null;
    }>
  >([]);
  const [importSpError, setImportSpError] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);

  useEffect(() => {
    if (printQrLabels.length === 0) return;
    document.body.classList.add('product-qr-print-active');
    return () => document.body.classList.remove('product-qr-print-active');
  }, [printQrLabels.length]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintQrLabels([]);
      setPrintQrImages({});
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/quan-ly-kho');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const records: Array<{ ten_kho?: string }> = Array.isArray(data?.records) ? data.records : [];
        setWarehouseOptions(
          Array.from(new Set(records.map(record => String(record.ten_kho ?? '').trim()).filter(Boolean)))
        );
      } catch {
        setWarehouseOptions([]);
      }
    };
    void loadWarehouses();
  }, []);

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
        unit: material.unit && material.unit !== '-' ? material.unit : '',
        totalWeight: material.totalWeight
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
    if (!canCreate) return;
    setProductActionMessage('');
    setProductError('');
    setProductFormError('');
    setViewingProduct(null);
    setEditingProduct(null);
    setProductFormMode('add');
  };

  const openProductEdit = (product: ProductRow) => {
    if (!canEdit) return;
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
    if (!form.warehouse.trim()) {
      setProductFormError('Vui lòng chọn kho lưu trữ.');
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
      setProductActionMessage('Đã thêm sản phẩm mới. Hãy lập phiếu nhập kho thành phẩm để sinh serial và mã QR.');
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
    if (!form.warehouse.trim()) {
      setProductFormError('Vui lòng chọn kho lưu trữ.');
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

      const savedFromApi = parseProductNplItems(
        data?.product?.npl_phan_tram ?? data?.product?.nplPhanTram
      );
      // Ưu tiên bản vừa gửi (có weightKg); nếu API trả về đủ khoi_luong_kg thì dùng bản API.
      const savedItems =
        savedFromApi.length > 0 &&
        savedFromApi.some(item => item.weightKg !== null && item.weightKg !== undefined)
          ? savedFromApi
          : items;

      setViewingProduct(prev =>
        prev && prev.id === productId ? { ...prev, nplItems: savedItems } : prev
      );
      setProducts(prev =>
        prev.map(product => (product.id === productId ? { ...product, nplItems: savedItems } : product))
      );
      setProductActionMessage('Đã cập nhật thành phần sản phẩm.');
      await loadProducts();
      // Giữ weightKg sau reload (tránh mất khoi_luong_kg nếu API/list lệch).
      setViewingProduct(prev =>
        prev && prev.id === productId ? { ...prev, nplItems: savedItems } : prev
      );
      setProducts(prev =>
        prev.map(product => (product.id === productId ? { ...product, nplItems: savedItems } : product))
      );
    } catch (error: any) {
      setProductError(error.message || 'Không thể lưu thành phần sản phẩm.');
      throw error;
    } finally {
      setIsSavingProductNpl(false);
    }
  };

  const handleDownloadProductCatalogTemplate = () => {
    downloadProductCatalogExcelTemplate();
  };

  const handleImportProductCatalog = async (file?: File | null) => {
    if ((!canCreate && !canEdit) || !file) return;

    setIsImportingProductCatalog(true);
    setProductError('');
    setProductActionMessage('');

    try {
      const rows = await parseProductCatalogExcel(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dòng sản phẩm hợp lệ.');
      }

      const byCode = new Map<string, ProductRow>(
        products
          .map(product => [normalizeProductCodeKey(product.code), product] as const)
          .filter(([key]) => Boolean(key))
      );

      let created = 0;
      let updated = 0;
      const failures: string[] = [];

      for (const row of rows) {
        const code = row.code.trim();
        const name = row.name.trim();
        if (!code && !name) {
          failures.push(`dòng ${row.rowNumber}: thiếu mã SP và tên`);
          continue;
        }

        const payload = productCatalogRowToPayload(row);
        const existing = code ? byCode.get(normalizeProductCodeKey(code)) : undefined;

        const res = existing
          ? await fetch(`/api/san-pham/${existing.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          : await fetch('/api/san-pham', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`dòng ${row.rowNumber}: ${data.error || 'Không lưu được'}`);
          continue;
        }
        if (existing) updated += 1;
        else created += 1;
      }

      if (created > 0 || updated > 0) {
        await loadProducts();
      }

      const summary = [
        created || updated ? `Đã nhập Excel SP: thêm ${created}, cập nhật ${updated}.` : 'Không nhập được dòng nào.',
        failures.length ? `${failures.length} dòng lỗi (${failures.slice(0, 3).join('; ')}).` : ''
      ]
        .filter(Boolean)
        .join(' ');
      setProductActionMessage(summary);
      if (created > 0 || updated > 0) showAppToast(summary);
      else if (failures.length > 0) {
        setProductError(summary);
        showAppToast(failures[0], 'error');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể đọc hoặc nhập Excel danh mục sản phẩm.';
      setProductError(message);
      showAppToast(message, 'error');
    } finally {
      setIsImportingProductCatalog(false);
      if (catalogFileInputRef.current) catalogFileInputRef.current.value = '';
    }
  };

  const handleDownloadBulkProductComponentsTemplate = () => {
    downloadBulkProductNplComponentsTemplate(
      products.flatMap(product =>
        product.nplItems.map(item => ({
          productCode: product.code,
          componentCode: item.code,
          componentName: item.name,
          amountType: item.amountType,
          percent: item.percent,
          quantity: item.quantity,
          unit: item.unit,
          weightKg: item.weightKg
        }))
      )
    );
  };

  const handleImportBulkProductComponents = async (file?: File | null) => {
    if (!canEdit || !file) return;

    setIsImportingBulkProductComponents(true);
    setProductError('');
    setProductActionMessage('');

    try {
      const rows = await parseImportSpExcelRows(file);
      if (rows.length === 0) {
        throw new Error(
          'File Excel không có dòng hợp lệ. Cần cột: Mã SP, Mã NVL, Loại, Giá trị, ĐVT.'
        );
      }

      const confirmMessage = [
        `Ghi ${rows.length} dòng vào bảng import_sp?`,
        `File: ${file.name}`,
        `Ví dụ: ${rows
          .slice(0, 3)
          .map(r => `${r.ma_sp}/${r.ma_nvl}=${r.gia_tri}${r.dvt ? ` ${r.dvt}` : ''}`)
          .join(' · ')}`
      ].join('\n');
      if (!window.confirm(confirmMessage)) return;

      const res = await fetch('/api/import-sp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          rows: rows as ImportSpExcelRow[]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể ghi Excel vào import_sp.');
      }

      setProductActionMessage(
        `Đã đổ ${data.inserted ?? rows.length} dòng vào import_sp` +
          (data.batch_id ? ` (batch ${String(data.batch_id).slice(0, 8)}…)` : '') +
          '. Bấm «Xem import_sp» để kiểm tra.'
      );
      showAppToast(`Đã ghi ${data.inserted ?? rows.length} dòng → import_sp`);
    } catch (error: any) {
      setProductError(error.message || 'Không thể tải Excel vào import_sp.');
    } finally {
      setIsImportingBulkProductComponents(false);
      if (bulkComponentsFileInputRef.current) {
        bulkComponentsFileInputRef.current.value = '';
      }
    }
  };

  const loadImportSpRows = async () => {
    setIsLoadingImportSp(true);
    setImportSpError('');
    try {
      const res = await fetch('/api/import-sp?limit=1000');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải import_sp.');
      }
      setImportSpRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (error: any) {
      setImportSpError(error.message || 'Không thể tải import_sp.');
      setImportSpRows([]);
    } finally {
      setIsLoadingImportSp(false);
    }
  };

  const openImportSpView = () => {
    setIsImportSpViewOpen(true);
    void loadImportSpRows();
  };

  const handleSyncImportSp = async () => {
    if (!canEdit) return;
    if (
      !window.confirm(
        'Đồng bộ từ import_sp → Thành phần NVL theo mã SP?\n' +
          'Chỉ áp dòng trạng thái «moi», ghi đè thành phần của SP khớp mã.'
      )
    ) {
      return;
    }

    setIsSyncingImportSp(true);
    setProductError('');
    setProductActionMessage('');
    try {
      const res = await fetch('/api/import-sp/dong-bo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ only_moi: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể đồng bộ import_sp.');
      }

      const parts = [
        `Đã đồng bộ ${data.updated_products ?? 0} SP (${data.updated_lines ?? 0} dòng NVL)`,
        data.applied_rows ? `· đánh dấu ${data.applied_rows} dòng import_sp` : null
      ].filter(Boolean);

      const missing = Array.isArray(data.missing_product_codes) ? data.missing_product_codes : [];
      if (missing.length > 0) {
        parts.push(`· bỏ qua ${missing.length} mã SP chưa có trong danh mục`);
      }
      const failures = Array.isArray(data.failures) ? data.failures : [];
      if (failures.length > 0) {
        setProductError(failures.slice(0, 3).join('\n'));
      }

      setProductActionMessage(parts.join(' '));
      showAppToast(parts.join(' '));
      await loadProducts();
      if (isImportSpViewOpen) await loadImportSpRows();
    } catch (error: any) {
      setProductError(error.message || 'Không thể đồng bộ import_sp.');
    } finally {
      setIsSyncingImportSp(false);
    }
  };

  // Không có ngày = danh mục từ bảng san_pham (QC /san-pham). Có ngày = tồn theo phiếu kho (Kho hàng).
  const isCatalogMode = !asOfDate;

  const displayProducts = useMemo(() => {
    if (isCatalogMode) return products;
    const balanceByCode = new Map<string, InventoryBalanceRow>();
    for (const balance of balanceRows) {
      const key = normalizeProductCodeKey(balance.ma);
      if (!key || key === '-') continue;
      balanceByCode.set(key, balance);
    }
    const seenKeys = new Set<string>();

    // Hiện hết danh mục thuộc kho (kể cả tồn 0 / chưa có phiếu).
    const fromCatalog = products.flatMap(product => {
      if (
        !matchesWarehouseFilter(product.warehouse, warehouseFilter, {
          includeUnassigned
        })
      ) {
        return [];
      }
      const key = normalizeProductCodeKey(product.code);
      if (!key || key === '-') return [];
      seenKeys.add(key);
      const balance = balanceByCode.get(key);
      return [{
        ...product,
        // Cột Kho luôn theo bộ lọc đang chọn trên /kho-hang.
        warehouse: warehouseFilter || balance?.ten_kho || product.warehouse,
        openingStock: balance
          ? String(balance.ton_dau_ky)
          : product.openingStock && product.openingStock !== '-'
            ? product.openingStock
            : '0',
        inbound: balance ? String(balance.nhap_trong_ky) : '0',
        outbound: balance ? String(balance.xuat_trong_ky) : '0',
        stock: balance ? String(balance.ton_cuoi_ky) : '0'
      }];
    });

    const fromBalancesOnly = balanceRows.flatMap(balance => {
      const key = normalizeProductCodeKey(balance.ma);
      if (!key || key === '-' || seenKeys.has(key)) return [];
      return [{
        id: `inventory-balance:${key}`,
        code: balance.ma,
        newCode: '',
        amisCode: '',
        name: balance.ten || balance.ma,
        nature: 'Chưa phân loại',
        group: 'Chưa nhóm',
        unit: balance.don_vi || '-',
        warehouse: warehouseFilter || balance.ten_kho,
        totalWeight: '-',
        rollWidth: '-',
        rollLength: '-',
        coreWeight: '-',
        bagWeight: '-',
        plasticWeight: '-',
        openingStock: String(balance.ton_dau_ky),
        inbound: String(balance.nhap_trong_ky),
        outbound: String(balance.xuat_trong_ky),
        stock: String(balance.ton_cuoi_ky),
        minStock: '-',
        origin: '-',
        description: '',
        nplItems: [],
        inventoryBalanceOnly: true
      }];
    });

    return [...fromCatalog, ...fromBalancesOnly];
  }, [balanceRows, includeUnassigned, isCatalogMode, products, warehouseFilter]);

  const productGroups = useMemo(
    () => ['all', ...Array.from(new Set(displayProducts.map(product => product.group))).sort((a, b) => String(a).localeCompare(String(b), 'vi'))],
    [displayProducts]
  );
  const productNatures = useMemo(
    () => Array.from(new Set(displayProducts.map(product => product.nature))).sort((a, b) => String(a).localeCompare(String(b), 'vi')),
    [displayProducts]
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    return displayProducts.filter(product => {
      const matchesWarehouse = matchesWarehouseFilter(product.warehouse, warehouseFilter, {
        includeUnassigned
      });
      const matchesGroup = selectedGroup === 'all' || product.group === selectedGroup;
      const matchesNature = selectedNatures.size === 0 || selectedNatures.has(product.nature);
      const matchesSearch =
        !normalizedSearch ||
        `${product.code} ${product.newCode} ${product.name} ${product.nature} ${product.group} ${product.origin} ${formatProductNplSummary(product.nplItems)}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesWarehouse && matchesGroup && matchesNature && matchesSearch;
    });
  }, [displayProducts, includeUnassigned, isCatalogMode, normalizedSearch, selectedGroup, selectedNatures, warehouseFilter]);

  const totalProductQuantity = useMemo(
    () => displayProducts.reduce((sum, product) => sum + (parseProductSpecNumber(product.stock) ?? 0), 0),
    [displayProducts]
  );
  const productUnitCount = useMemo(
    () => new Set(displayProducts.map(product => product.unit).filter(unit => unit && unit !== '-')).size,
    [displayProducts]
  );
  const productNatureCount = useMemo(
    () => new Set(displayProducts.map(product => product.nature).filter(Boolean)).size,
    [displayProducts]
  );

  const selectedProducts = useMemo(
    () => products.filter(product => selectedProductIds.has(product.id)),
    [products, selectedProductIds]
  );
  // Ở màn hình tồn theo ngày có thể có dòng chỉ phát sinh từ phiếu kho, chưa có
  // bản ghi danh mục. In QR phải dùng đúng các dòng đang hiển thị để checkbox,
  // ảnh xem trước và nút in luôn đồng nhất.
  const selectedPrintProducts = useMemo(
    () => displayProducts.filter(product => selectedProductIds.has(product.id)),
    [displayProducts, selectedProductIds]
  );
  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(product => selectedProductIds.has(product.id));

  const hasActiveFilters = selectedGroup !== 'all' || selectedNatures.size > 0 || Boolean(searchText);

  const resetFilters = () => {
    setSelectedGroup('all');
    setSelectedNatures(new Set());
    setSearchText('');
  };

  useEffect(() => {
    let cancelled = false;

    const generateQrImages = async () => {
      const nextEntries = await Promise.all(
        displayProducts
          .filter(product => product.code)
          .map(async product => {
            try {
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
            } catch {
              // Một mã dữ liệu lỗi không được chặn việc tạo QR cho các dòng còn lại.
              return null;
            }
          })
      );

      if (!cancelled) {
        setQrImages(Object.fromEntries(nextEntries.filter((entry): entry is readonly [string, string] => entry !== null)));
      }
    };

    if (displayProducts.length > 0) {
      generateQrImages();
    } else {
      setQrImages({});
    }

    return () => {
      cancelled = true;
    };
  }, [displayProducts]);

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

  const handlePrintSelectedProductQr = () => {
    const printable = selectedPrintProducts.filter(product => String(product.code || '').trim());
    if (printable.length === 0) {
      setProductActionMessage('Vui lòng tích chọn ít nhất một sản phẩm có mã SP để in QR.');
      return;
    }

    const next: Record<string, string> = {};
    printable.forEach(product => {
      next[product.id] = printQtyById[product.id] || '1';
    });
    setProductActionMessage('');
    setPrintQtyById(next);
    setBulkPrintQty('1');
    setPrintQtyError('');
    setShowPrintQtyModal(true);
  };

  const handleApplyBulkPrintQty = () => {
    const qty = String(Math.max(1, parsePrintCopyCount(bulkPrintQty) || 1));
    setBulkPrintQty(qty);
    setPrintQtyById(prev => {
      const next = { ...prev };
      selectedPrintProducts.forEach(product => {
        if (!String(product.code || '').trim()) return;
        next[product.id] = qty;
      });
      return next;
    });
  };

  const executePrintQrLabels = async (labels: ProductQrPrintLabel[]) => {
    if (labels.length === 0) throw new Error('Chưa chọn mã QR để in.');

    const imageEntries = await Promise.all(
      labels.map(async label => [label.qrPayload, await createQrDataUrl(label.qrPayload)] as const)
    );
    const markPrintedResponse = await fetch('/api/ma-san-pham/danh-dau-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: labels.map(label => label.qrPayload) })
    });
    const markPrintedData = await markPrintedResponse.json().catch(() => ({}));
    if (!markPrintedResponse.ok) {
      throw new Error(markPrintedData.error || 'Không thể lưu lịch sử in QR.');
    }

    setPrintQrImages(Object.fromEntries(imageEntries));
    setPrintQrLabels(labels);
    window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => window.print());
    }, 80);
  };

  const handlePrintProductDetailCodes = async (product: ProductRow, codes: ProductDetailCode[]) => {
    setIsGeneratingPrintQr(true);
    try {
      await executePrintQrLabels(codes.map((record, index) => ({
        key: `${product.id}-${index}-${record.ma_sp_day_du}`,
        product,
        qrPayload: record.ma_sp_day_du
      })));
    } finally {
      setIsGeneratingPrintQr(false);
    }
  };

  const handleConfirmPrintQrLabels = async () => {
    setPrintQtyError('');
    const items = selectedPrintProducts
      .map(product => ({
        sanPhamId: product.id,
        soLuongTem: parsePrintCopyCount(printQtyById[product.id] ?? '0')
      }))
      .filter(item => item.sanPhamId && item.soLuongTem > 0);
    if (items.length === 0) {
      setPrintQtyError('Nhập số lượng (> 0) cho ít nhất một mã SP.');
      return;
    }
    setIsGeneratingPrintQr(true);
    try {
      const response = await fetch('/api/ma-qr-hang-hoa/cap-moi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể cấp mã QR mới.');
      const records: Array<Record<string, unknown>> = Array.isArray(data.records) ? data.records : [];
      const labels: WarehouseProductQrPrintLabel[] = records.map(record => ({
        key: String(record.id ?? record.ma_qr ?? ''),
        payload: String(record.ma_qr ?? '').trim(),
        productCode: String(record.ma_sp_goc ?? '').trim(),
        productName: String(record.ten_sp ?? '').trim() || '-'
      })).filter(label => Boolean(label.key && label.payload && label.productCode));
      if (labels.length !== totalPrintCopies) {
        throw new Error('CSDL trả về thiếu mã QR. Chưa thể mở tem để in.');
      }
      setCatalogQrPrintLabels(labels);
      setShowPrintQtyModal(false);
      setCatalogQrPrintOpen(true);
    } catch (reason: unknown) {
      setPrintQtyError(reason instanceof Error ? reason.message : 'Không thể cấp mã QR mới.');
    } finally {
      setIsGeneratingPrintQr(false);
    }
  };

  const handlePrintIssuedGoodsQrCodes = async (codes: ProductIssuedQrCode[]) => {
    const labels: WarehouseProductQrPrintLabel[] = codes
      .map(code => ({
        key: code.id || code.ma_qr,
        payload: code.ma_qr,
        productCode: code.ma_sp_goc,
        productName: viewingProduct?.name || '-'
      }))
      .filter(label => Boolean(label.key && label.payload && label.productCode));
    if (labels.length !== codes.length) throw new Error('Có mã QR không hợp lệ, không thể in lại.');
    setCatalogQrPrintLabels(labels);
    setCatalogQrPrintOpen(true);
  };

  const totalPrintCopies = useMemo(
    () =>
      selectedPrintProducts.reduce((sum, product) => {
        if (!String(product.code || '').trim()) return sum;
        return sum + parsePrintCopyCount(printQtyById[product.id] ?? '0');
      }, 0),
    [printQtyById, selectedPrintProducts]
  );

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

  const defaultReassignWarehouseName = useMemo(
    () => resolveGoodsWarehouseName(warehouseOptions),
    [warehouseOptions]
  );
  const filteredCatalogProducts = useMemo(
    () => filteredProducts.filter(product => !product.inventoryBalanceOnly),
    [filteredProducts]
  );

  const openWarehouseReassignModal = () => {
    if (!canEdit || filteredCatalogProducts.length === 0) return;
    setReassignWarehouseName(prev => prev || defaultReassignWarehouseName || warehouseOptions[0] || '');
    setProductError('');
    setIsWarehouseReassignOpen(true);
  };

  const handleReassignFilteredWarehouse = async () => {
    if (!canEdit || filteredCatalogProducts.length === 0) return;

    const warehouseName = reassignWarehouseName.trim();
    if (!warehouseName) {
      setProductError('Vui lòng chọn tên kho để sửa cột Kho.');
      return;
    }

    const targetKey = normalizeWarehouseName(warehouseName);
    const productsToUpdate = filteredCatalogProducts.filter(
      product => normalizeWarehouseName(product.warehouse) !== targetKey
    );

    if (productsToUpdate.length === 0) {
      setProductActionMessage(`Tất cả ${filteredCatalogProducts.length} sản phẩm đang lọc đã ở "${warehouseName}".`);
      setIsWarehouseReassignOpen(false);
      return;
    }

    if (
      !window.confirm(
        `Đổi cột Kho của ${productsToUpdate.length} sản phẩm đang lọc thành "${warehouseName}"?`
      )
    ) {
      return;
    }

    setIsReassigningWarehouse(true);
    setProductActionMessage('');
    setProductError('');

    try {
      const res = await fetch('/api/san-pham', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: productsToUpdate.map(product => product.id),
          warehouse: warehouseName
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể đổi kho theo bộ lọc.');
      }
      setProductActionMessage(
        data.updated
          ? `Đã đổi cột Kho của ${data.updated} sản phẩm đang lọc sang ${data.ten_kho || warehouseName}.`
          : `Không còn sản phẩm đang lọc cần đổi kho.`
      );
      setIsWarehouseReassignOpen(false);
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể đổi kho theo bộ lọc.');
    } finally {
      setIsReassigningWarehouse(false);
    }
  };

  const isInventoryHeader = Boolean(warehouseFilter);
  const summaryStats = isCatalogMode
    ? [
        ['Sản phẩm', displayProducts.length],
        ['Nhóm VTHH', productGroups.length > 0 ? productGroups.length - 1 : 0],
        ['Đơn vị', productUnitCount || productNatureCount]
      ]
    : [
        ['Mã SP', displayProducts.length],
        ['Tổng SL', formatNumber(totalProductQuantity, 2)],
        ['Đơn vị', productUnitCount]
      ];

  return (
    <div className="w-full space-y-4">
      {isInventoryHeader ? (
        <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {topControls}
            {topControls ? <div className="hidden h-8 w-px shrink-0 bg-zinc-200 lg:block" aria-hidden /> : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadProductCatalogTemplate}
                disabled={isImportingProductCatalog || isLoadingProducts}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Mẫu Excel danh mục SP khớp cột bảng / form / DB san_pham"
              >
                <Download className="h-4 w-4" />
                Tải mẫu Excel SP
              </button>
              {canCreate || canEdit ? (
                <button
                  type="button"
                  onClick={() => catalogFileInputRef.current?.click()}
                  disabled={isImportingProductCatalog || isLoadingProducts}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImportingProductCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isImportingProductCatalog ? 'Đang nhập...' : 'Tải Excel SP lên'}
                </button>
              ) : null}
              <input
                ref={catalogFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={event => void handleImportProductCatalog(event.target.files?.[0])}
              />
              {canCreate ? (
                <button
                  type="button"
                  onClick={openProductCreate}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TableSearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Tìm mã, tên, nhóm..."
              disabled={isLoadingProducts || products.length === 0}
            />

            <FilterCombobox
              label="Nhóm"
              options={productGroups.filter(group => group !== 'all')}
              value={selectedGroup}
              onChange={setSelectedGroup}
              searchPlaceholder="Tìm nhóm..."
              compact
            />

            <MultiSelectFilter
              label="Tính chất"
              allLabel="Tất cả tính chất"
              searchPlaceholder="Tìm tính chất..."
              emptyLabel="Không tìm thấy tính chất"
              options={productNatures}
              values={[...selectedNatures]}
              onChange={values => setSelectedNatures(new Set(values))}
            />

            {isLoadingProducts ? (
              <div className="flex h-10 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-500">
                Đang tải...
              </div>
            ) : null}

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="flex h-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-black text-zinc-600 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
              >
                Xóa lọc
              </button>
            ) : null}
          </div>

          {productError ? (
            <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {productError}
            </p>
          ) : null}
          {productActionMessage ? (
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              {productActionMessage}
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadProductCatalogTemplate}
                disabled={isImportingProductCatalog || isLoadingProducts}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Mẫu Excel danh mục SP khớp cột bảng / form / DB san_pham"
              >
                <Download className="h-4 w-4" />
                Tải mẫu Excel SP
              </button>
              {canCreate || canEdit ? (
                <button
                  type="button"
                  onClick={() => catalogFileInputRef.current?.click()}
                  disabled={isImportingProductCatalog || isLoadingProducts}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImportingProductCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isImportingProductCatalog ? 'Đang nhập...' : 'Tải Excel SP lên'}
                </button>
              ) : null}
              <input
                ref={catalogFileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={event => void handleImportProductCatalog(event.target.files?.[0])}
              />
              {canCreate ? (
                <button
                  type="button"
                  onClick={openProductCreate}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              {summaryStats.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <span className="block font-bold text-slate-500">{label}</span>
                  <span className="mt-1 block text-xl font-black text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <TableToolbar
            isLoading={isLoadingProducts}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetFilters}
            loadError={productError}
            actionMessage={productActionMessage}
          >
            <FilterCombobox
              label="Nhóm"
              options={productGroups.filter(group => group !== 'all')}
              value={selectedGroup}
              onChange={setSelectedGroup}
              searchPlaceholder="Tìm nhóm..."
              compact
            />

            <MultiSelectFilter
              label="Tính chất"
              allLabel="Tất cả tính chất"
              searchPlaceholder="Tìm tính chất..."
              emptyLabel="Không tìm thấy tính chất"
              options={productNatures}
              values={[...selectedNatures]}
              onChange={values => setSelectedNatures(new Set(values))}
            />
          </TableToolbar>
        </>
      )}

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
        {isInventoryHeader ? null : (
          <TableSearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Tìm mã, tên, nhóm..."
            disabled={isLoadingProducts || products.length === 0}
          />
        )}
        <button
          type="button"
          onClick={handlePrintSelectedProductQr}
          disabled={selectedPrintProducts.length === 0 || isLoadingProducts}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Nhập số tem QR cần in cho các sản phẩm đã chọn; không thay đổi dữ liệu"
        >
          <QrCode className="h-4 w-4" />
          In mã QR
        </button>
        <button
          type="button"
          onClick={handleDownloadProductCatalogTemplate}
          disabled={isLoadingProducts || isImportingProductCatalog}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          title="Mẫu cột bảng /san-pham — ô trống vẫn đẩy lên được"
        >
          <Download className="h-4 w-4" />
          Tải mẫu Excel
        </button>
        {canCreate || canEdit ? (
          <button
            type="button"
            onClick={() => catalogFileInputRef.current?.click()}
            disabled={isLoadingProducts || isImportingProductCatalog}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImportingProductCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isImportingProductCatalog ? 'Đang nhập...' : 'Tải Excel lên'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDownloadBulkProductComponentsTemplate}
          disabled={isLoadingProducts}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          title="Mẫu định mức theo Mã SP + Mã NVL (tên NVL tự khớp từ kho)"
        >
          <Download className="h-4 w-4" />
          Mẫu định mức NVL
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => bulkComponentsFileInputRef.current?.click()}
            disabled={isLoadingProducts || isImportingBulkProductComponents}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Đổ Excel định mức NVL vào bảng import_sp"
          >
            {isImportingBulkProductComponents ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isImportingBulkProductComponents ? 'Đang nhập...' : 'Nhập định mức NVL'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={openImportSpView}
          disabled={isLoadingImportSp}
          className="flex h-10 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Xem dữ liệu đã đổ vào bảng import_sp"
        >
          {isLoadingImportSp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Xem import_sp
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => void handleSyncImportSp()}
            disabled={isLoadingProducts || isSyncingImportSp || isImportingBulkProductComponents}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Đồng bộ import_sp → Thành phần NVL theo mã SP"
          >
            {isSyncingImportSp ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isSyncingImportSp ? 'Đang đồng bộ...' : 'Đồng bộ Thành phần'}
          </button>
        ) : null}
        <input
          ref={bulkComponentsFileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={event => handleImportBulkProductComponents(event.target.files?.[0])}
        />
        {canEdit && filteredCatalogProducts.length > 0 ? (
          <button
            type="button"
            onClick={openWarehouseReassignModal}
            disabled={isReassigningWarehouse || isLoadingProducts || warehouseOptions.length === 0}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={`Đổi cột Kho của ${filteredCatalogProducts.length} sản phẩm đang lọc`}
          >
            {isReassigningWarehouse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Warehouse className="h-4 w-4" />}
            {isReassigningWarehouse ? 'Đang đổi kho...' : 'Đổi kho theo bộ lọc'}
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={handleBulkDeleteProducts}
            disabled={selectedProducts.length === 0 || isDeletingProducts}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeletingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {isDeletingProducts ? 'Đang xóa...' : 'Xóa đã chọn'}
          </button>
        ) : null}
      </section>

      <TableShell minWidthClassName={isCatalogMode ? 'min-w-[1400px]' : 'min-w-[1250px]'}>
        <TableHead>
          <TableHeadCell align="center" className="w-14">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleFilteredProducts}
              className="h-4 w-4 accent-[#ef1b2d]"
              aria-label="Chọn tất cả sản phẩm đang lọc"
            />
          </TableHeadCell>
          <TableHeadCell>Mã SP</TableHeadCell>
          <TableHeadCell align="center">Mã QR</TableHeadCell>
          <TableHeadCell>Tên sản phẩm</TableHeadCell>
          <TableHeadCell>Tính chất</TableHeadCell>
          <TableHeadCell align="center">Nhóm</TableHeadCell>
          <TableHeadCell align="center">Đơn vị</TableHeadCell>
          <TableHeadCell align="center">Kho</TableHeadCell>
          <TableHeadCell align="center">Tổng TL (kg)</TableHeadCell>
          {isCatalogMode ? (
            <>
              <TableHeadCell align="center">Tồn đầu</TableHeadCell>
              <TableHeadCell align="center">Nhập</TableHeadCell>
              <TableHeadCell align="center">Xuất</TableHeadCell>
              <TableHeadCell align="center">Tồn</TableHeadCell>
              <TableHeadCell align="center">Tồn tối thiểu</TableHeadCell>
            </>
          ) : (
            <TableHeadCell align="center">Tổng SL</TableHeadCell>
          )}
          <TableHeadCell align="center" className="sticky right-0 z-10 bg-[#ef1b2d]">
            Thao tác
          </TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredProducts.map(product => (
            <React.Fragment key={`${product.code}-${product.name}`}>
              <TableRow className="group">
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
                  <StatusBadge label={product.nature} color="rose" />
                </td>
                <td className="px-4 py-3.5 text-center font-bold text-zinc-700">{product.group}</td>
                <td className="px-4 py-3.5 text-center font-bold text-zinc-700">{product.unit}</td>
                <td className="px-4 py-3.5 text-center font-bold text-zinc-700">{product.warehouse || '—'}</td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-emerald-800">
                  {formatProductSpecDisplay(product.totalWeight)}
                </td>
                {isCatalogMode ? (
                  <>
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.openingStock}</td>
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.inbound}</td>
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.outbound}</td>
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.stock}</td>
                    <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.minStock}</td>
                  </>
                ) : (
                  <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.stock}</td>
                )}
                <td className="sticky right-0 z-[1] bg-white px-3 py-3.5 transition group-hover:bg-red-50/40">
                  <RowActionsMenu label={`Thao tác ${product.code || product.name}`}>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => openProductView(product)}
                      title="Xem"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canEdit && !product.inventoryBalanceOnly ? (
                      <button
                        type="button"
                        onClick={() => openProductEdit(product)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {canDelete && !product.inventoryBalanceOnly ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(product)}
                        disabled={deletingProductId === product.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingProductId === product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    ) : null}
                  </div>
                  </RowActionsMenu>
                </td>
              </TableRow>
            </React.Fragment>
          ))}

          {!isLoadingProducts && filteredProducts.length === 0 && (
            <TableEmptyRow colSpan={isCatalogMode ? 15 : 11}>
              {isCatalogMode
                ? 'Không có sản phẩm phù hợp bộ lọc.'
                : asOfDate
                  ? 'Không có thành phẩm còn tồn đến ngày đã chọn.'
                  : 'Vui lòng chọn ngày để xem hàng còn trong kho.'}
            </TableEmptyRow>
          )}
        </TableBody>
      </TableShell>


      {productFormMode && (
        <ProductEditModal
          mode={productFormMode}
          product={editingProduct}
          warehouseOptions={warehouseOptions}
          defaultWarehouse={warehouseFilter}
          isSaving={isSavingProduct}
          formError={productFormError}
          onClose={closeProductForm}
          onSave={productFormMode === 'add' ? handleCreateProduct : handleSaveProduct}
        />
      )}

      {isWarehouseReassignOpen
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Đóng"
                onClick={() => !isReassigningWarehouse && setIsWarehouseReassignOpen(false)}
              />
              <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Đổi kho</p>
                    <h3 className="mt-0.5 text-base font-black text-zinc-900">Chọn tên kho</h3>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                      Áp dụng cột Kho cho {filteredCatalogProducts.length} sản phẩm đang lọc
                      {hasActiveFilters ? ' (theo bộ lọc hiện tại)' : ''}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWarehouseReassignOpen(false)}
                    disabled={isReassigningWarehouse}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50"
                    title="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên kho *</span>
                    <SearchableSelect
                      value={reassignWarehouseName}
                      onChange={setReassignWarehouseName}
                      options={warehouseOptions}
                      placeholder="Chọn kho lưu trữ"
                      searchPlaceholder="Tìm kho..."
                      getLabel={item => String(item)}
                      getValue={item => String(item)}
                      inputClassName={productFieldClass}
                      allowEmpty={false}
                      comboboxMode
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setIsWarehouseReassignOpen(false)}
                    disabled={isReassigningWarehouse}
                    className="flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReassignFilteredWarehouse()}
                    disabled={isReassigningWarehouse || !reassignWarehouseName.trim()}
                    className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReassigningWarehouse ? <Loader2 className="h-4 w-4 animate-spin" /> : <Warehouse className="h-4 w-4" />}
                    {isReassigningWarehouse ? 'Đang đổi...' : 'Đổi cột Kho'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {viewingProduct && (
        <ProductViewModal
          product={viewingProduct}
          initialTab={productViewTab}
          materialOptions={materialOptions}
          isLoadingMaterials={isLoadingMaterialOptions}
          isSaving={isSavingProductNpl}
          onClose={() => setViewingProduct(null)}
          onSaveItems={items => saveProductNplItems(viewingProduct.id, items)}
          onEdit={canEdit ? () => openProductEdit(viewingProduct) : undefined}
          onDelete={canDelete ? () => handleDeleteProduct(viewingProduct) : undefined}
          onPrintIssuedQrCodes={handlePrintIssuedGoodsQrCodes}
          canEditComponents={canEdit}
          canEditQrCodes={canEdit}
          isDeleting={deletingProductId === viewingProduct.id}
        />
      )}

      {showPrintQtyModal
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Đóng"
                onClick={() => setShowPrintQtyModal(false)}
              />
              <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">In tem QR</p>
                    <h3 className="mt-0.5 text-base font-black text-zinc-900">Số bản theo mã SP</h3>
                    <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                      Nhập số tem cần in cho từng sản phẩm · không lưu vào CSDL
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPrintQtyModal(false)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50"
                    title="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto px-4 py-4">
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <label className="min-w-[120px] flex-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Áp dụng tất cả
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={bulkPrintQty}
                        onChange={e => setBulkPrintQty(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleApplyBulkPrintQty}
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950"
                    >
                      Áp dụng
                    </button>
                  </div>

                  <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-72">
                    <TableHead>
                      <TableHeadCell>Mã SP</TableHeadCell>
                      <TableHeadCell align="center" className="w-28">Số bản</TableHeadCell>
                    </TableHead>
                    <TableBody>
                      {selectedPrintProducts
                        .filter(product => String(product.code || '').trim())
                        .map(product => (
                          <React.Fragment key={product.id}>
                            <TableRow>
                              <td className="px-3 py-2.5">
                                <p className="font-black text-zinc-900">{product.code}</p>
                                <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-zinc-500">
                                  {product.name || '—'}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={printQtyById[product.id] ?? '1'}
                                  onChange={e =>
                                    setPrintQtyById(prev => ({
                                      ...prev,
                                      [product.id]: e.target.value
                                    }))
                                  }
                                  className="mx-auto h-10 w-20 rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm font-black text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                                />
                              </td>
                            </TableRow>
                          </React.Fragment>
                        ))}
                    </TableBody>
                  </TableShell>

                  {printQtyError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      {printQtyError}
                    </div>
                  ) : null}

                  <p className="text-xs font-semibold text-zinc-500">
                    Tổng sẽ in: <span className="font-black text-[#ef1b2d]">{totalPrintCopies}</span> tem
                  </p>
                </div>

                <div className="flex gap-2 border-t border-zinc-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowPrintQtyModal(false)}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmPrintQrLabels()}
                    disabled={totalPrintCopies <= 0 || isGeneratingPrintQr}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <QrCode className="h-4 w-4" />
                    {isGeneratingPrintQr ? 'Đang cấp QR...' : `Xem trước ${totalPrintCopies > 0 ? `${totalPrintCopies} tem` : 'QR'}`}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isImportSpViewOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/50 p-4">
              <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-black text-zinc-900">Bảng import_sp</h3>
                    <p className="text-xs font-semibold text-zinc-500">
                      {importSpRows.length} dòng gần nhất · dữ liệu Excel định mức NVL
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadImportSpRows()}
                      disabled={isLoadingImportSp}
                      className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 hover:border-zinc-950 disabled:opacity-50"
                    >
                      {isLoadingImportSp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Tải lại
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => void handleSyncImportSp()}
                        disabled={isSyncingImportSp}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                      >
                        {isSyncingImportSp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Đồng bộ
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setIsImportSpViewOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 hover:border-zinc-950"
                      aria-label="Đóng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {importSpError ? (
                  <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700">
                    {importSpError}
                  </p>
                ) : null}
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="min-w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-50 text-[10px] font-black uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="border-b border-zinc-200 px-3 py-2">Dòng</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Mã SP</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Mã NVL</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Loại</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Giá trị</th>
                        <th className="border-b border-zinc-200 px-3 py-2">ĐVT</th>
                        <th className="border-b border-zinc-200 px-3 py-2">%</th>
                        <th className="border-b border-zinc-200 px-3 py-2">SL</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Kg</th>
                        <th className="border-b border-zinc-200 px-3 py-2">File</th>
                        <th className="border-b border-zinc-200 px-3 py-2">TT</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Batch</th>
                        <th className="border-b border-zinc-200 px-3 py-2">Lúc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingImportSp ? (
                        <tr>
                          <td colSpan={13} className="px-3 py-8 text-center font-bold text-zinc-500">
                            Đang tải…
                          </td>
                        </tr>
                      ) : importSpRows.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="px-3 py-8 text-center font-bold text-zinc-500">
                            Chưa có dữ liệu. Bấm «Nhập định mức NVL» để đổ Excel vào đây.
                          </td>
                        </tr>
                      ) : (
                        importSpRows.map(row => (
                          <tr key={row.id} className="border-b border-zinc-100 hover:bg-amber-50/40">
                            <td className="px-3 py-1.5 font-semibold text-zinc-500">{row.so_dong_excel ?? '—'}</td>
                            <td className="px-3 py-1.5 font-black text-zinc-900 whitespace-pre">{row.ma_sp}</td>
                            <td className="px-3 py-1.5 font-bold text-zinc-800">{row.ma_nvl}</td>
                            <td className="px-3 py-1.5 text-zinc-600">{row.loai || '—'}</td>
                            <td className="px-3 py-1.5 font-bold text-zinc-900">
                              {row.gia_tri === null || row.gia_tri === undefined
                                ? '—'
                                : formatNplDecimal(row.gia_tri)}
                            </td>
                            <td className="px-3 py-1.5 text-zinc-600">{row.dvt || '—'}</td>
                            <td className="px-3 py-1.5">
                              {row.phan_tram === null || row.phan_tram === undefined
                                ? '—'
                                : formatNplDecimal(row.phan_tram)}
                            </td>
                            <td className="px-3 py-1.5">
                              {row.so_luong === null || row.so_luong === undefined
                                ? '—'
                                : formatNplDecimal(row.so_luong)}
                            </td>
                            <td className="px-3 py-1.5 font-bold text-amber-800">
                              {row.khoi_luong_kg === null || row.khoi_luong_kg === undefined
                                ? '—'
                                : formatNplDecimal(row.khoi_luong_kg)}
                            </td>
                            <td className="max-w-[140px] truncate px-3 py-1.5 text-zinc-500" title={row.file_name || ''}>
                              {row.file_name || '—'}
                            </td>
                            <td className="px-3 py-1.5">
                              <span
                                className={
                                  row.trang_thai === 'da_ap_dung'
                                    ? 'rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700'
                                    : 'rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-800'
                                }
                              >
                                {row.trang_thai || 'moi'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[10px] text-zinc-400" title={row.batch_id}>
                              {row.batch_id ? `${row.batch_id.slice(0, 8)}…` : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-zinc-500">
                              {row.imported_at
                                ? new Date(row.imported_at).toLocaleString('vi-VN')
                                : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {printQrLabels.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div className="qr-print-sheet">
              <div className="qr-print-page">
                {printQrLabels.map(label => (
                  <div key={label.key} className="qr-print-card">
                    <div className="qr-print-code">
                      {printQrImages[label.qrPayload] && (
                        <img src={printQrImages[label.qrPayload]} alt={`QR ${label.qrPayload}`} />
                      )}
                    </div>
                    <div className="qr-print-tag-info">
                      <p className="qr-print-tag-label">Tên sản phẩm</p>
                      <p className="qr-print-tag-name">{label.product.name || '-'}</p>
                      <p className="qr-print-tag-code">{label.product.code || '-'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}

      <ProductQrPrintModal
        open={catalogQrPrintOpen}
        labels={catalogQrPrintLabels}
        trackProductPrint={false}
        trackGoodsCatalogPrint
        showPayload={false}
        title="Mã QR sản phẩm"
        description={`${catalogQrPrintLabels.length} tem có mã QR duy nhất, đã được lưu trong CSDL`}
        onClose={() => {
          setCatalogQrPrintOpen(false);
          setCatalogQrPrintLabels([]);
        }}
      />
    </div>
  );
}

