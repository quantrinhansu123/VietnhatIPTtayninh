import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
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
import { Loader2, Save, FlaskConical, Download, Upload, Plus, Eye, Pencil, Trash2, QrCode, RefreshCw, X } from 'lucide-react';
import { productFieldClass } from './productFieldClass';
import type { ProductRow, ProductNplItem, MaterialOption, ProductNplAmountType } from './types';
import { parseProductNplItems, productNplItemsToJson, formatProductNplSummary, excelRowsToProductNplItems, bulkExcelRowsToProductMap, productNplAmountTypeLabel, formatProductNplAmount, roundNplNumber } from './types';
import { downloadBulkProductNplComponentsTemplate, downloadProductNplComponentsTemplate, parseBulkProductNplComponentsExcel, parseProductNplComponentsExcel } from '../../utils/productNplComponentsExcel';
import {
  downloadProductCatalogExcelTemplate,
  parseProductCatalogExcel,
  productCatalogRowToPayload
} from '../../utils/productCatalogExcel';
import { showAppToast } from '../../lib/appToast';
import { waitForPrintImagesReady } from '../../utils/printReady';

const PRODUCT_QR_LABEL_FOOTER_ROWS = ['Cơ sở sản xuất', 'Công nhân sx', 'Ngày sản xuất'] as const;

type ProductQrPrintLabel = {
  key: string;
  product: ProductRow;
  qrPayload: string;
};

function parsePrintCopyCount(raw: string) {
  const value = Math.floor(Number(String(raw ?? '').trim().replace(',', '.')));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, 999);
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** Phần thời gian QR: ssmmhhddmm (giây-phút-giờ-ngày-tháng). */
function buildProductQrTimeSerial(date = new Date()) {
  return `${pad2(date.getSeconds())}${pad2(date.getMinutes())}${pad2(date.getHours())}${pad2(date.getDate())}${pad2(date.getMonth() + 1)}`;
}

function randomProductQrCode(length = 1) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Nội dung QR: MãSP_ssmmhhddmm + 1 mã random (vd MT-MN009_3045150107K). */
function buildProductLabelQrPayload(productCode: string, usedPayloads: Set<string>) {
  const maSp = String(productCode ?? '').trim();
  if (!maSp) return '';

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const randomLen = attempt < 24 ? 1 : 2;
    const payload = `${maSp}_${buildProductQrTimeSerial()}${randomProductQrCode(randomLen)}`;
    if (!usedPayloads.has(payload)) {
      usedPayloads.add(payload);
      return payload;
    }
  }

  const fallback = `${maSp}_${buildProductQrTimeSerial()}${randomProductQrCode(1)}${Date.now().toString(36).slice(-3).toUpperCase()}`;
  usedPayloads.add(fallback);
  return fallback;
}

async function createQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 220,
    color: {
      dark: '#111111',
      light: '#ffffff'
    }
  });
}

export type ProductViewTab = 'info' | 'components';

/** Hiển thị số lượng giữ nguyên giá trị nhập (không làm tròn, bỏ số 0 thừa). */
function formatQuantityFull(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(value);
}

export function ProductNplItemFormModal({
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
      return String(initialItem.quantity ?? 0).replace('.', ',');
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

  useEffect(() => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    const material = materialOptions.find(option => option.code === trimmedCode);
    if (material?.unit && material.unit !== '-') {
      setUnit(material.unit);
    }
  }, [code, materialOptions]);

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
        quantity: amountType === 'quantity' ? numericValue : null,
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

/** Giá trị hiển thị tại cột “Khối lượng (kg)” trong bảng Thành phần NVL. */
export function resolveProductNplItemWeightKg(
  product: Pick<ProductRow, 'plasticWeight' | 'totalWeight' | 'coreWeight' | 'bagWeight'>,
  item: ProductNplItem,
  materialOptions: MaterialOption[]
): number | null {
  const roundWeightKg = (value: number) => Math.round(value * 10000) / 10000;
  if (item.amountType === 'percent') {
    const materialBaseKg = resolveProductMaterialBaseKg(product);
    if (item.percent === null || materialBaseKg <= 0) return null;
    return roundWeightKg((item.percent / 100) * materialBaseKg);
  }
  if (item.quantity === null) return null;
  const unit = (item.unit || '').trim().toLowerCase();
  if (unit === '' || unit === 'kg' || unit === '-') return roundWeightKg(item.quantity);
  const key = normalizeProductCodeKey(item.code);
  const material = materialOptions.find(option => normalizeProductCodeKey(option.code) === key);
  const totalWeightPerUnit = parseProductSpecNumber(material?.totalWeight ?? '');
  if (totalWeightPerUnit !== null && totalWeightPerUnit > 0) {
    return roundWeightKg(item.quantity * totalWeightPerUnit);
  }
  return null;
}

export function normalizeProductCodeKey(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
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
  canEditComponents: canEditComponentsProp
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
  canEditComponents?: boolean;
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
  const materialBaseKg = resolveProductMaterialBaseKg(product);

  const formatItemWeight = (item: ProductNplItem): string => {
    const weight = resolveProductNplItemWeightKg(product, item, materialOptions);
    if (weight === null) return '-';
    return `${formatNumber(weight, 4)} kg`;
  };

  const resolveItemUnit = (item: ProductNplItem): string => {
    const key = normalizeProductCodeKey(item.code);
    const material = materialOptions.find(option => normalizeProductCodeKey(option.code) === key);
    if (material && material.unit && material.unit !== '-') return material.unit;
    if (item.unit && item.unit !== '-') return item.unit;
    return '-';
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

      const importedItems = excelRowsToProductNplItems(rows, materialOptions);
      const mergedItems = [...items];
      let addedCount = 0;
      let updatedCount = 0;

      importedItems.forEach(importedItem => {
        const key = normalizeProductCodeKey(importedItem.code);
        const existingIndex = mergedItems.findIndex(existing => normalizeProductCodeKey(existing.code) === key);
        if (existingIndex >= 0) {
          mergedItems[existingIndex] = importedItem;
          updatedCount += 1;
        } else {
          mergedItems.push(importedItem);
          addedCount += 1;
        }
      });

      const summaryParts = [
        addedCount > 0 ? `thêm ${addedCount} mới` : '',
        updatedCount > 0 ? `cập nhật ${updatedCount}` : ''
      ].filter(Boolean);
      const summary = summaryParts.join(', ');

      if (!window.confirm(`Excel có ${importedItems.length} dòng (${summary}). Thêm vào danh sách thành phần hiện tại?`)) {
        return;
      }

      await onSaveItems(mergedItems);
      setItems(mergedItems);
      setComponentsExcelMessage(`Đã ${summary} thành phần từ Excel.`);
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
    ['Tồn đầu', product.openingStock],
    ['Nhập', product.inbound],
    ['Xuất', product.outbound],
    ['Tồn kho', product.stock],
    ['Tồn TT', product.minStock],
    ['Nguồn gốc', product.origin]
  ] as [string, string][]).filter(([, value]) => value && value !== '-');

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
      <div className="flex h-full max-h-[98vh] min-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
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
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    Nguyên vật liệu · phần trăm hoặc số lượng
                    {materialBaseKg > 0
                      ? ` · Quy đổi % theo ${formatNumber(materialBaseKg, 3)} kg nhựa+phụ gia`
                      : ' · Chưa có KL nhựa+phụ gia để quy đổi %'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {percentItemCount > 0 && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${Math.abs(totalPercent - 100) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                      Tổng %: {formatPercent(totalPercent)}%
                    </span>
                  )}
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

              <p className="text-[11px] font-semibold text-zinc-500">
                Excel gồm các cột: <strong>Mã NPL</strong>, <strong>Tên NVL</strong>, <strong>Loại</strong> (Phần trăm / Số lượng), <strong>Giá trị</strong>, <strong>ĐVT</strong> (bắt buộc nếu Số lượng). Tải lên sẽ thêm mới vào danh sách hiện tại, dòng trùng Mã NPL sẽ được cập nhật.
              </p>

              <TableShell minWidthClassName="min-w-[880px]" maxHeightClassName="">
                <TableHead>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã NPL</TableHeadCell>
                  <TableHeadCell>Tên NVL</TableHeadCell>
                  <TableHeadCell>Loại</TableHeadCell>
                  <TableHeadCell>Giá trị</TableHeadCell>
                  <TableHeadCell>Khối lượng (kg)</TableHeadCell>
                  <TableHeadCell>ĐVT</TableHeadCell>
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
                          <StatusBadge label={productNplAmountTypeLabel(item.amountType)} color="zinc" />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={`${
                              item.amountType === 'percent'
                                ? formatPercent(item.percent ?? 0)
                                : formatQuantityFull(item.quantity ?? 0)
                            }${item.amountType === 'percent' ? '%' : ''}`}
                            color="amber"
                          />
                        </td>
                        <td className="px-4 py-3 font-bold text-emerald-700">
                          {formatItemWeight(item)}
                        </td>
                        <td className="px-4 py-3 font-bold text-zinc-700">
                          {resolveItemUnit(item)}
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
                    <TableEmptyRow colSpan={8}>Chưa khai báo thành phần NVL.</TableEmptyRow>
                  )}
                </TableBody>
              </TableShell>
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
                ['Khối lượng', formatItemWeight(detailItem)],
                ['Đơn vị', resolveItemUnit(detailItem)],
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

export function normalizeProducts(data: unknown): ProductRow[] {
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

export type ProductFormState = {
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

export function ProductsPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('products');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedNatures, setSelectedNatures] = useState<Set<string>>(() => new Set());
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productError, setProductError] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [printQrLabels, setPrintQrLabels] = useState<ProductQrPrintLabel[]>([]);
  const [printQrImages, setPrintQrImages] = useState<Record<string, string>>({});
  const [isGeneratingPrintQr, setIsGeneratingPrintQr] = useState(false);
  const [showPrintQtyModal, setShowPrintQtyModal] = useState(false);
  const [printQtyById, setPrintQtyById] = useState<Record<string, string>>({});
  const [printQtyError, setPrintQtyError] = useState('');
  const [bulkPrintQty, setBulkPrintQty] = useState('1');
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  const [isSyncingOpeningStock, setIsSyncingOpeningStock] = useState(false);
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

      const byCode = new Map(
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
    if (!canEdit || !file) return;

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
        .map(product => {
          const key = normalizeProductCodeKey(product.code || product.amisCode || product.newCode || '');
          const importedItems = productMap.get(key) || [];
          if (!key || importedItems.length === 0) return null;

          const mergedItems = [...product.nplItems];
          importedItems.forEach(importedItem => {
            const importKey = normalizeProductCodeKey(importedItem.code);
            const existingIndex = mergedItems.findIndex(
              existing => normalizeProductCodeKey(existing.code) === importKey
            );
            if (existingIndex >= 0) {
              mergedItems[existingIndex] = importedItem;
            } else {
              mergedItems.push(importedItem);
            }
          });

          return { product, key, items: mergedItems };
        })
        .filter((entry): entry is { product: ProductRow; key: string; items: ProductNplItem[] } => Boolean(entry));

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
    () => ['all', ...Array.from(new Set(products.map(product => product.group))).sort((a, b) => String(a).localeCompare(String(b), 'vi'))],
    [products]
  );
  const productNatures = useMemo(
    () => Array.from(new Set(products.map(product => product.nature))).sort((a, b) => String(a).localeCompare(String(b), 'vi')),
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

  const selectedProducts = useMemo(
    () => products.filter(product => selectedProductIds.has(product.id)),
    [products, selectedProductIds]
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

  const handleOpenPrintQtyModal = () => {
    const printable = selectedProducts.filter(product => String(product.code || '').trim());
    if (printable.length === 0) return;
    const next: Record<string, string> = {};
    printable.forEach(product => {
      next[product.id] = printQtyById[product.id] || '1';
    });
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
      selectedProducts.forEach(product => {
        if (!String(product.code || '').trim()) return;
        next[product.id] = qty;
      });
      return next;
    });
  };

  const handleConfirmPrintQrLabels = async () => {
    const usedPayloads = new Set<string>();
    const labels: ProductQrPrintLabel[] = [];

    selectedProducts.forEach(product => {
      const code = String(product.code || '').trim();
      if (!code) return;
      const copies = parsePrintCopyCount(printQtyById[product.id] ?? '0');
      for (let index = 0; index < copies; index += 1) {
        const qrPayload = buildProductLabelQrPayload(code, usedPayloads);
        if (!qrPayload) continue;
        labels.push({
          key: `${product.id}-${index}-${qrPayload}`,
          product,
          qrPayload
        });
      }
    });

    if (labels.length === 0) {
      setPrintQtyError('Nhập số bản (> 0) cho ít nhất một mã SP.');
      return;
    }

    setPrintQtyError('');
    setIsGeneratingPrintQr(true);
    try {
      const imageEntries = await Promise.all(
        labels.map(async label => [label.qrPayload, await createQrDataUrl(label.qrPayload)] as const)
      );
      setPrintQrImages(Object.fromEntries(imageEntries));
      setPrintQrLabels(labels);
      setShowPrintQtyModal(false);
      window.setTimeout(() => {
        void waitForPrintImagesReady().then(() => window.print());
      }, 80);
    } catch (error: any) {
      setPrintQtyError(error?.message || 'Không tạo được mã QR để in.');
    } finally {
      setIsGeneratingPrintQr(false);
    }
  };

  const totalPrintCopies = useMemo(
    () =>
      selectedProducts.reduce((sum, product) => {
        if (!String(product.code || '').trim()) return sum;
        return sum + parsePrintCopyCount(printQtyById[product.id] ?? '0');
      }, 0),
    [printQtyById, selectedProducts]
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

  const handleSyncOpeningStock = async () => {
    setIsSyncingOpeningStock(true);
    setProductActionMessage('');
    setProductError('');

    try {
      const res = await fetch('/api/kiem-kho/dong-bo-ton-dau', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể đồng bộ dữ liệu kiểm kho vào tồn đầu.');
      }

      const updated = Number(data.updated) || 0;
      const unmatched = Number(data.unmatched) || 0;
      const unmatchedCodes = Array.isArray(data.unmatched_codes) ? data.unmatched_codes.join(', ') : '';
      const parts = [
        updated > 0
          ? `Đã đồng bộ ${updated} sản phẩm kiểm kho vào Tồn đầu.`
          : 'Không có sản phẩm kiểm kho mới cần đồng bộ.'
      ];
      if (unmatched > 0) {
        parts.push(`Chưa tìm thấy ${unmatched} mã trong danh mục${unmatchedCodes ? `: ${unmatchedCodes}` : ''}.`);
      }
      if (data.has_more) parts.push('Vẫn còn dữ liệu; bấm Đồng bộ thêm lần nữa để xử lý tiếp.');
      if (data.warning) parts.push(String(data.warning));
      setProductActionMessage(parts.join(' '));
      await loadProducts();
    } catch (error: any) {
      setProductError(error.message || 'Không thể đồng bộ dữ liệu kiểm kho vào tồn đầu.');
    } finally {
      setIsSyncingOpeningStock(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <section className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
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
      </section>

      <TableToolbar
        isLoading={isLoadingProducts}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={productError}
        actionMessage={productActionMessage}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm mã, tên, nhóm, nguồn gốc..."
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
      </TableToolbar>

      <section className="grid gap-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <p className="text-sm font-black text-zinc-950">Thao tác hàng loạt</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            Đã tick {selectedProducts.length} dòng. Excel danh mục SP khớp cột bảng (ô trống vẫn nhập được). Excel định mức NVL riêng.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canEdit ? (
            <button
              type="button"
              onClick={() => void handleSyncOpeningStock()}
              disabled={isSyncingOpeningStock}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSyncingOpeningStock ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isSyncingOpeningStock ? 'Đang đồng bộ...' : 'Đồng bộ'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDownloadProductCatalogTemplate}
            disabled={isLoadingProducts || isImportingProductCatalog}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex h-11 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImportingProductCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isImportingProductCatalog ? 'Đang nhập...' : 'Tải Excel lên'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDownloadBulkProductComponentsTemplate}
            disabled={isLoadingProducts}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            title="Mẫu định mức thành phần NVL (không phải danh mục SP)"
          >
            <Download className="h-4 w-4" />
            Mẫu định mức NVL
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => bulkComponentsFileInputRef.current?.click()}
              disabled={isLoadingProducts || isImportingBulkProductComponents}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImportingBulkProductComponents ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isImportingBulkProductComponents ? 'Đang nhập...' : 'Nhập định mức NVL'}
            </button>
          ) : null}
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
          {canDelete ? (
            <button
              type="button"
              onClick={handleBulkDeleteProducts}
              disabled={selectedProducts.length === 0 || isDeletingProducts}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeletingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {isDeletingProducts ? 'Đang xóa...' : 'Xóa đã chọn'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleOpenPrintQtyModal}
            disabled={selectedProducts.length === 0}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-5 text-xs font-black text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <QrCode className="h-4 w-4" />
            In QR đã chọn
          </button>
        </div>
      </section>

      <TableShell minWidthClassName="min-w-[1400px]">
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
          <TableHeadCell align="center">Tổng TL (kg)</TableHeadCell>
          <TableHeadCell align="center">Tồn đầu</TableHeadCell>
          <TableHeadCell align="center">Nhập</TableHeadCell>
          <TableHeadCell align="center">Xuất</TableHeadCell>
          <TableHeadCell align="center">Tồn</TableHeadCell>
          <TableHeadCell align="center">Tồn tối thiểu</TableHeadCell>
          <TableHeadCell align="center" className="sticky right-0 z-10 border-l border-zinc-800 bg-zinc-950">
            Thao tác
          </TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredProducts.map(product => (
            <React.Fragment key={`${product.code}-${product.name}`}>
              <TableRow>
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
                <td className="px-3 py-3.5 text-center font-mono font-bold text-emerald-800">
                  {formatProductSpecDisplay(product.totalWeight)}
                </td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.openingStock}</td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.inbound}</td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.outbound}</td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.stock}</td>
                <td className="px-3 py-3.5 text-center font-mono font-bold text-zinc-700">{product.minStock}</td>
                <td className="sticky right-0 z-10 border-l border-zinc-100 bg-white px-3 py-3.5">
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
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openProductEdit(product)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {canDelete ? (
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
            <TableEmptyRow colSpan={14}>Không có sản phẩm phù hợp bộ lọc.</TableEmptyRow>
          )}
        </TableBody>
      </TableShell>


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
          onEdit={canEdit ? () => openProductEdit(viewingProduct) : undefined}
          onDelete={canDelete ? () => handleDeleteProduct(viewingProduct) : undefined}
          canEditComponents={canEdit}
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
                      Mỗi tem: MãSP_ssmmhhddmm + 1 mã random · nhập số bản từng mã
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
                      {selectedProducts
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
                    {isGeneratingPrintQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {isGeneratingPrintQr
                      ? 'Đang tạo QR...'
                      : `In ${totalPrintCopies > 0 ? `${totalPrintCopies} tem` : 'QR'}`}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <div className="qr-print-sheet">
        <div className="qr-print-page">
          {printQrLabels.map(label => (
            <div key={label.key} className="qr-print-card">
              <div className="qr-print-left">
                <div className="qr-print-code">
                  {printQrImages[label.qrPayload] && (
                    <img src={printQrImages[label.qrPayload]} alt={`QR ${label.qrPayload}`} />
                  )}
                </div>
                <p className="qr-print-payload">{label.qrPayload}</p>
              </div>
              <div className="qr-print-right">
                <p className="qr-print-product-code">{label.product.code || '-'}</p>
                <table className="qr-print-footer">
                  <tbody>
                    {PRODUCT_QR_LABEL_FOOTER_ROWS.map(rowLabel => (
                      <tr key={rowLabel}>
                        <th>{rowLabel}</th>
                        <td>
                          <span className="qr-print-footer-field" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

