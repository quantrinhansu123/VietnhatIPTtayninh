import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Eye, Loader2, Pencil, Plus, Printer, RefreshCw, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { vietNhatLogoUrl } from './layout/constants';
import { waitForPrintImagesReady } from '../utils/printReady';
import {
  AcceptanceReportPrintBatch,
  buildAcceptancePrintSlips,
  buildAcceptanceScreenSlips,
  AcceptanceReportSlipStack
} from './AcceptanceReportPrintSheet';
import type { AcceptanceReport } from './AcceptanceReportForm';
import { normalizeReportFromApi } from './AcceptanceReportForm';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter
} from './shared/table';
import {
  formatNplDecimal,
  formatNplWeightKg,
  formatProductNplAmount,
  normalizeProductCodeKey,
  parseProductNplItems,
  type ProductNplItem
} from '../features/san-pham/types';
import { normalizeMaterialsInventory } from '../features/kho-nvl';
import {
  convertWarehouseQuantityToKg,
  isWarehouseKgUnit,
  mapMaterialToWeightCatalogItem,
  type WarehouseWeightCatalogItem
} from '../utils/warehouseWeight';
import {
  filterCanTuDongRecordsForBoard,
  sumCanTuDongCanSanPhamKg,
  type CanTuDongWeightRow
} from '../utils/canTuDongWeights';

type ProductNameOption = {
  code: string;
  name: string;
};

type ProductCatalogEntry = {
  code: string;
  name: string;
  unit: string;
  totalWeightKg: number | null;
  nplItems: ProductNplItem[];
};

type NvlViewState = {
  report: AcceptanceReport;
  productCode: string;
  productName: string;
  productUnit: string;
  quantity: number;
  items: ProductNplItem[];
  /** true = đang hiển thị snapshot đã lưu DB. */
  fromDb: boolean;
  savedAt?: string;
  /** Tổng Cân sản phẩm từ phiếu cân AI khớp ngày·ca·máy·mã SP. */
  actualWeightKg: number | null;
  actualWeightCount: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProductKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Mã SP từ mặt hàng phiếu (bỏ phần sau dấu + nếu có). */
function resolveReportProductCode(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  return (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
}

function isKgUnit(value: string) {
  return ['kg', 'kilogram', 'kilograms'].includes(String(value || '').trim().toLowerCase());
}

function parseWeightKgFromLabel(label: string): number | null {
  const text = String(label || '').trim();
  const withParens = text.match(/\((\d+(?:[.,]\d+)?)\s*kg\)/i);
  const anyKg = withParens || text.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (!anyKg) return null;
  const value = Number(String(anyKg[1]).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mergeNplItemsWithCatalog(
  items: ProductNplItem[],
  catalogItems: ProductNplItem[]
): ProductNplItem[] {
  if (catalogItems.length === 0) return items;
  return items.map(item => {
    const key = normalizeProductCodeKey(item.code);
    if (!key) return item;
    const match = catalogItems.find(row => normalizeProductCodeKey(row.code) === key);
    if (!match) return item;
    return {
      ...item,
      name: item.name || match.name,
      unit: item.unit && item.unit !== '-' ? item.unit : match.unit,
      weightKg:
        item.weightKg != null && Number.isFinite(item.weightKg)
          ? item.weightKg
          : match.weightKg ?? null
    };
  });
}

/**
 * Trọng lượng cuộn dùng cho NVL %:
 * 1) Tổng Cân sản phẩm (cân AI, cả lõi)
 * 2) SL × kg/cuộn định mức (Tổng TL SP / kg trong tên)
 * 3) Trọng lượng đã lưu trên phiếu
 */
function resolveSlipKhoiLuongKg(
  report: Pick<AcceptanceReport, 'trong_luong'>,
  catalog: ProductCatalogEntry | null | undefined,
  quantity: number,
  actualCanSpKg?: number | null
): number | null {
  if (actualCanSpKg != null && Number.isFinite(actualCanSpKg) && actualCanSpKg > 0) {
    return actualCanSpKg;
  }
  if (catalog?.totalWeightKg != null && catalog.totalWeightKg > 0 && quantity > 0) {
    return Math.round(catalog.totalWeightKg * quantity * 1000) / 1000;
  }
  const fromReport = Number(report.trong_luong);
  if (Number.isFinite(fromReport) && fromReport > 0) return fromReport;
  return null;
}

/**
 * Trọng lượng NVL:
 * - %: trọng lượng cuộn (Cân sản phẩm) × %
 * - Cái/ĐVT khác: định lượng Thành phần × SL sản lượng, quy kg
 */
function resolveNvlTrongLuongKg(
  item: ProductNplItem,
  productQty: number,
  slipKhoiLuongKg: number | null,
  materials: WarehouseWeightCatalogItem[]
): number | null {
  if (item.amountType === 'percent') {
    if (item.percent == null || !Number.isFinite(item.percent) || slipKhoiLuongKg == null || !(slipKhoiLuongKg > 0)) {
      return null;
    }
    return Math.round(slipKhoiLuongKg * (item.percent / 100) * 10000) / 10000;
  }

  if (item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg >= 0 && productQty > 0) {
    return Math.round(item.weightKg * productQty * 10000) / 10000;
  }

  const qtyPerSp =
    item.quantity != null && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null;
  if (qtyPerSp == null || !(productQty > 0)) return null;
  const totalQty = qtyPerSp * productQty;
  const unit = String(item.unit || '').trim();
  if (isKgUnit(unit) || isWarehouseKgUnit(unit)) {
    return Math.round(totalQty * 10000) / 10000;
  }

  const converted = convertWarehouseQuantityToKg({
    quantity: totalQty,
    unit: unit || 'Cái',
    itemCode: item.code,
    warehouseKind: 'nvl',
    materials,
    preferTongKgOnly: false
  });
  if (converted != null && Number.isFinite(converted) && converted > 0) {
    return Math.round(converted * 10000) / 10000;
  }

  const fromName = parseWeightKgFromLabel(item.name || item.code || '');
  if (fromName != null) return Math.round(totalQty * fromName * 10000) / 10000;
  return null;
}

function formatNvlTrongLuongKg(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  return `${formatNplWeightKg(value)} kg`;
}

function resolveProductTotalWeightKg(unit: string, totalWeightRaw: unknown, name: string): number | null {
  const totalWeightText = String(totalWeightRaw ?? '').trim();
  const totalWeightNumber = Number(totalWeightText.replace(',', '.'));
  if (totalWeightText && Number.isFinite(totalWeightNumber) && totalWeightNumber > 0) {
    return totalWeightNumber;
  }
  const fromName = parseWeightKgFromLabel(name);
  if (fromName != null) return fromName;
  if (isKgUnit(unit)) return 1;
  return null;
}

function normalizeProductNames(data: unknown): ProductNameOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  return rows
    .map((item): ProductNameOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(
        record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
      ).trim();
      const name = String(
        record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
      ).trim();
      if (!code || !name) return null;
      return { code, name };
    })
    .filter((item): item is ProductNameOption => Boolean(item));
}

function normalizeProductCatalog(data: unknown): Map<string, ProductCatalogEntry> {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  const map = new Map<string, ProductCatalogEntry>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const code = String(
      record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? ''
    ).trim();
    if (!code) continue;
    const unit = String(record.don_vi ?? record.unit ?? '').trim();
    const name = String(
      record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? ''
    ).trim();
    const nplItems = parseProductNplItems(
      record.npl_phan_tram ?? record.nplPhanTram ?? record.nplItems ?? record.thanh_phan ?? record.dinh_muc
    );
    const entry: ProductCatalogEntry = {
      code,
      name: name || code,
      unit,
      totalWeightKg: resolveProductTotalWeightKg(
        unit,
        record.tong_trong_luong ?? record.totalWeight,
        name
      ),
      nplItems
    };
    const key = normalizeProductKey(code);
    if (key) map.set(key, entry);
    const nameKey = normalizeProductKey(name);
    if (nameKey && !map.has(nameKey)) map.set(nameKey, entry);
  }
  return map;
}

function formatDinhMucPerUnit(item: ProductNplItem) {
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return `${formatNplDecimal(item.percent)}%`;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    const unit = String(item.unit || '').trim();
    const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
    return `${formatNplDecimal(item.quantity)}${unitSuffix}`;
  }
  return formatProductNplAmount(item);
}

function formatNvlTheoSanLuong(item: ProductNplItem, productQty: number) {
  if (!(productQty > 0)) return '—';
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return `${formatNplDecimal(item.percent)}%`;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    const total = item.quantity * productQty;
    const unit = String(item.unit || '').trim();
    const unitSuffix = unit && unit !== '-' && unit !== '%' ? ` ${unit}` : '';
    return `${formatNplDecimal(total)}${unitSuffix}`;
  }
  return '—';
}

function formatActualCanWeightKg(weightKg: number | null) {
  if (weightKg == null || !Number.isFinite(weightKg) || !(weightKg > 0)) return '—';
  return `${formatNplDecimal(weightKg)} Kg`;
}

async function fetchCanTuDongByNgay(ngay: string): Promise<CanTuDongWeightRow[]> {
  const day = String(ngay || '').trim();
  if (!day) return [];
  const params = new URLSearchParams({
    from: day,
    to: day,
    limit: '5000',
    dateBy: 'ngay'
  });
  const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || 'Không thể tải phiếu cân AI.'));
  }
  return Array.isArray(data.records) ? (data.records as CanTuDongWeightRow[]) : [];
}

/** Tổng Cân sản phẩm (trọng lượng thực tế) khớp ngày · ca · máy · mã SP. */
function sumTrongLuongCanThucTeForReport(
  records: CanTuDongWeightRow[],
  report: AcceptanceReport,
  productCode: string,
  productName: string
) {
  const machineToken = String(report.ma_may || report.ten_may || '').trim();
  const productKeys = [productCode, productName, report.mat_hang, resolveReportProductCode(report.mat_hang)]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const filtered = filterCanTuDongRecordsForBoard(records, {
    shiftFilter: report.ca || 'all',
    dateFrom: report.ngay,
    dateTo: report.ngay,
    machineFilter: machineToken || 'all',
    selectedMachine: {
      code: report.ma_may,
      name: report.ten_may
    },
    productCodeKeys: productKeys
  });
  return sumCanTuDongCanSanPhamKg(filtered);
}

function resolveNvlRate(item: ProductNplItem): number | null {
  if (item.amountType === 'percent' && item.percent != null && Number.isFinite(item.percent)) {
    return item.percent;
  }
  if (item.amountType === 'quantity' && item.quantity != null && Number.isFinite(item.quantity)) {
    return item.quantity;
  }
  return null;
}

function resolveNvlTheoSl(item: ProductNplItem, productQty: number): number | null {
  const rate = resolveNvlRate(item);
  if (rate == null) return null;
  if (item.amountType === 'percent') return rate;
  if (!(productQty > 0)) return null;
  return Math.round(rate * productQty * 10000) / 10000;
}

function nplItemsToDbPayload(items: ProductNplItem[], productQty: number) {
  return items.map((item, index) => ({
    stt: index,
    ma_nvl: item.code || '',
    ten_nvl: item.name || item.code || '',
    don_vi: item.amountType === 'percent' ? '%' : item.unit || '',
    loai_dinh_muc: item.amountType,
    dinh_muc: resolveNvlRate(item),
    so_luong_theo_sl: resolveNvlTheoSl(item, productQty)
  }));
}

function dbRowsToNplItems(rows: unknown[]): ProductNplItem[] {
  return rows
    .map((raw): ProductNplItem | null => {
      if (!raw || typeof raw !== 'object') return null;
      const row = raw as Record<string, unknown>;
      const loai = String(row.loai_dinh_muc ?? '').trim().toLowerCase();
      const amountType: ProductNplItem['amountType'] =
        loai === 'percent' || loai === 'phan_tram' || loai === '%' ? 'percent' : 'quantity';
      const dinhMuc = Number(row.dinh_muc);
      const rate = Number.isFinite(dinhMuc) ? dinhMuc : null;
      return {
        code: String(row.ma_nvl ?? '').trim(),
        name: String(row.ten_nvl ?? '').trim(),
        amountType,
        percent: amountType === 'percent' ? rate : null,
        quantity: amountType === 'quantity' ? rate : null,
        unit: String(row.don_vi ?? (amountType === 'percent' ? '%' : '')).trim()
      };
    })
    .filter((item): item is ProductNplItem => Boolean(item && (item.code || item.name)));
}

export default function AcceptanceReportListView({
  onBack,
  onCreate,
  onEdit,
  initialFilters
}: {
  onBack: () => void;
  onCreate: (prefill?: { ngay: string; ca: string }) => void;
  onEdit: (report: AcceptanceReport) => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('acceptance-report-list');
  const [filterFromDate, setFilterFromDate] = useState(
    () => initialFilters?.dateFrom?.trim() || todayIso()
  );
  const [filterToDate, setFilterToDate] = useState(() => initialFilters?.dateTo?.trim() || todayIso());
  const [filterShift, setFilterShift] = useState(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return !shift || shift === 'all' ? '' : shift;
  });
  const [searchText, setSearchText] = useState('');
  const [reports, setReports] = useState<AcceptanceReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingPrint, setPendingPrint] = useState(false);
  const [activePrintSlips, setActivePrintSlips] = useState<ReturnType<typeof buildAcceptancePrintSlips>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isSyncingWeight, setIsSyncingWeight] = useState(false);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [productCatalogByKey, setProductCatalogByKey] = useState<Map<string, ProductCatalogEntry>>(
    () => new Map()
  );
  const [materialWeightCatalog, setMaterialWeightCatalog] = useState<WarehouseWeightCatalogItem[]>([]);
  const [nvlView, setNvlView] = useState<NvlViewState | null>(null);
  const [isSyncingNvl, setIsSyncingNvl] = useState(false);
  const [nvlSyncMessage, setNvlSyncMessage] = useState('');

  const shiftOptions = useMemo<string[]>(() => {
    const shifts = reports.reduce<string[]>((result, report) => {
      const shift = report.ca.trim();
      if (shift) result.push(shift);
      return result;
    }, []);
    return Array.from(new Set<string>(shifts)).sort((a, b) =>
      a.localeCompare(b, 'vi', { numeric: true })
    );
  }, [reports]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const matchesShift = !filterShift || report.ca?.trim() === filterShift;
      const matchesSearch =
        !normalizedSearch ||
        `${report.mat_hang} ${report.ten_may} ${report.ma_may} ${report.ca} ${report.don_vi}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesShift && matchesSearch;
    });
  }, [filterShift, normalizedSearch, reports]);

  const hasActiveFilters = Boolean(filterShift) || Boolean(searchText);
  const resetFilters = () => {
    setFilterShift('');
    setSearchText('');
  };

  const reportsWithNames = useMemo(
    () =>
      filteredReports.map(report => ({
        ...report,
        ten_sp: productNameByCode.get(normalizeProductKey(report.mat_hang)) || ''
      })),
    [filteredReports, productNameByCode]
  );

  const screenSlips = useMemo(
    () => buildAcceptanceScreenSlips(reportsWithNames),
    [reportsWithNames]
  );

  const printSlipCount = useMemo(
    () => buildAcceptancePrintSlips(reportsWithNames).length,
    [reportsWithNames]
  );

  useEffect(() => {
    if (!pendingPrint || activePrintSlips.length === 0) return;
    let cancelled = false;
    document.body.classList.add('acceptance-report-print-active');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('acceptance-report-print-active');
          setActivePrintSlips([]);
          setPendingPrint(false);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('acceptance-report-print-active');
    };
  }, [pendingPrint, activePrintSlips]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('acceptance-report-print-active');
      setActivePrintSlips([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('acceptance-report-print-active');
    };
  }, []);

  const applyProductCatalogData = (data: unknown) => {
    const nextNames = new Map<string, string>();
    normalizeProductNames(data).forEach(product => {
      const key = normalizeProductKey(product.code);
      if (key) nextNames.set(key, product.name);
    });
    const nextCatalog = normalizeProductCatalog(data);
    setProductNameByCode(nextNames);
    setProductCatalogByKey(nextCatalog);
    return nextCatalog;
  };

  const resolveCatalogEntry = (
    catalog: Map<string, ProductCatalogEntry>,
    matHang: string,
    names?: Map<string, string>
  ) => {
    const productCode = resolveReportProductCode(matHang);
    return (
      catalog.get(normalizeProductKey(productCode)) ||
      catalog.get(normalizeProductKey(matHang)) ||
      (names
        ? catalog.get(normalizeProductKey(names.get(normalizeProductKey(productCode)) || ''))
        : null) ||
      null
    );
  };

  const buildNvlViewState = (
    report: AcceptanceReport,
    catalog: Map<string, ProductCatalogEntry>,
    names: Map<string, string>,
    options?: {
      items?: ProductNplItem[];
      fromDb?: boolean;
      savedAt?: string;
      actualWeightKg?: number | null;
      actualWeightCount?: number;
    }
  ): NvlViewState => {
    const productCode = resolveReportProductCode(report.mat_hang);
    const entry = resolveCatalogEntry(catalog, report.mat_hang, names);
    const qtyRaw = Number(report.so_luong);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;
    return {
      report,
      productCode: entry?.code || productCode || report.mat_hang,
      productName:
        entry?.name ||
        report.ten_sp ||
        names.get(normalizeProductKey(productCode)) ||
        productCode ||
        '—',
      productUnit: entry?.unit || report.don_vi || '',
      quantity,
      items: mergeNplItemsWithCatalog(
        options?.items ?? entry?.nplItems ?? [],
        entry?.nplItems ?? []
      ),
      fromDb: Boolean(options?.fromDb),
      savedAt: options?.savedAt,
      actualWeightKg:
        options?.actualWeightKg !== undefined ? options.actualWeightKg : null,
      actualWeightCount:
        options?.actualWeightCount !== undefined ? options.actualWeightCount : 0
    };
  };

  const nvlLineWeightsKg = useMemo(() => {
    if (!nvlView) return [] as Array<number | null>;
    const entry = resolveCatalogEntry(
      productCatalogByKey,
      nvlView.report.mat_hang,
      productNameByCode
    );
    const slipKg = resolveSlipKhoiLuongKg(
      nvlView.report,
      entry,
      nvlView.quantity,
      nvlView.actualWeightKg
    );
    return nvlView.items.map(item =>
      resolveNvlTrongLuongKg(item, nvlView.quantity, slipKg, materialWeightCatalog)
    );
  }, [materialWeightCatalog, nvlView, productCatalogByKey, productNameByCode]);

  const nvlTrongLuongTotalKg = useMemo(
    () => nvlLineWeightsKg.reduce((sum, value) => sum + (value != null && value > 0 ? value : 0), 0),
    [nvlLineWeightsKg]
  );

  const loadProductCatalog = async () => {
    const res = await fetch('/api/san-pham?format=table');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không thể tải danh mục sản phẩm.');
    return applyProductCatalogData(data);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catalog, materialRes] = await Promise.all([
          loadProductCatalog(),
          fetch('/api/kho-nvl')
        ]);
        if (cancelled) return;
        void catalog;
        const materialData = await materialRes.json().catch(() => ({}));
        if (materialRes.ok) {
          setMaterialWeightCatalog(
            normalizeMaterialsInventory(materialData).map(mapMaterialToWeightCatalogItem)
          );
        }
      } catch {
        if (!cancelled) {
          setProductNameByCode(new Map());
          setProductCatalogByKey(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReports = async (tuNgay = filterFromDate, denNgay = filterToDate) => {
    const params = new URLSearchParams();
    if (tuNgay) params.set('tu_ngay', tuNgay);
    if (denNgay) params.set('den_ngay', denNgay);
    const res = await fetch(`/api/bao-cao-nghiem-thu?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Không thể tải báo cáo sản lượng.');
    const list = Array.isArray(data.reports) ? data.reports : [];
    setReports(list.map((item: Record<string, unknown>) => normalizeReportFromApi(item)));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        await loadReports(filterFromDate, filterToDate);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải báo cáo.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterFromDate, filterToDate]);

  const handlePrint = () => {
    const slips = buildAcceptancePrintSlips(reportsWithNames);
    if (slips.length === 0) {
      setError('Chưa có báo cáo sản lượng để in.');
      return;
    }
    setError('');
    setActivePrintSlips(slips);
    setPendingPrint(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa dòng báo cáo sản lượng này?')) return;
    setDeletingId(id);
    setError('');
    try {
      const res = await fetch(`/api/bao-cao-nghiem-thu/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      setMessage('Đã xóa dòng báo cáo sản lượng.');
      await loadReports(filterFromDate, filterToDate);
    } catch (err: any) {
      setError(err.message || 'Không thể xóa báo cáo.');
    } finally {
      setDeletingId(null);
    }
  };

  const findCatalogForReport = (report: AcceptanceReport) => {
    const productCode = resolveReportProductCode(report.mat_hang);
    return (
      productCatalogByKey.get(normalizeProductKey(productCode)) ||
      productCatalogByKey.get(normalizeProductKey(report.mat_hang)) ||
      null
    );
  };

  /** Đồng bộ trọng lượng từ phiếu cân AI (Cân sản phẩm), ghi vào DB. */
  const handleSyncTrongLuong = async () => {
    if (filteredReports.length === 0) {
      setError('Không có dòng nào trong bộ lọc để đồng bộ.');
      return;
    }
    if (
      !window.confirm(
        `Đồng bộ trọng lượng cho ${filteredReports.length} dòng đang lọc từ phiếu cân thực tế (tổng Cân sản phẩm theo ngày·ca·máy·mã SP)?`
      )
    ) {
      return;
    }

    setIsSyncingWeight(true);
    setError('');
    setMessage('');
    let updated = 0;
    let skipped = 0;
    const failures: string[] = [];

    try {
      const recordsByNgay = new Map<string, CanTuDongWeightRow[]>();
      for (const report of filteredReports) {
        const ngay = String(report.ngay || '').trim();
        if (!ngay || recordsByNgay.has(ngay)) continue;
        try {
          recordsByNgay.set(ngay, await fetchCanTuDongByNgay(ngay));
        } catch (err: any) {
          failures.push(`${ngay}: ${err.message || 'không tải được cân AI'}`);
          recordsByNgay.set(ngay, []);
        }
      }

      for (const report of filteredReports) {
        const catalog = findCatalogForReport(report);
        const productCode =
          catalog?.code || resolveReportProductCode(report.mat_hang) || report.mat_hang;
        const productName = catalog?.name || report.ten_sp || productCode;
        const canRows = recordsByNgay.get(String(report.ngay || '').trim()) || [];
        const { weightKg, counted } = sumTrongLuongCanThucTeForReport(
          canRows,
          report,
          productCode,
          productName
        );
        const nextWeight =
          counted > 0 && weightKg > 0 ? Math.round(weightKg * 1000) / 1000 : null;
        if (nextWeight == null || !(nextWeight > 0)) {
          skipped += 1;
          continue;
        }
        const current =
          report.trong_luong !== null &&
          report.trong_luong !== undefined &&
          Number.isFinite(Number(report.trong_luong))
            ? Number(report.trong_luong)
            : null;
        if (current !== null && Math.abs(current - nextWeight) < 0.0005) {
          skipped += 1;
          continue;
        }
        if (!report.hinh_anh) {
          failures.push(`${report.mat_hang}: thiếu ảnh, không cập nhật được`);
          continue;
        }

        const res = await fetch(`/api/bao-cao-nghiem-thu/${encodeURIComponent(report.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ngay: report.ngay,
            ca: report.ca,
            lan: report.lan,
            gio: report.gio,
            ma_may: report.ma_may,
            ten_may: report.ten_may,
            loai_vat_tu: report.loai_vat_tu || 'Thành phẩm',
            mat_hang: report.mat_hang,
            don_vi: report.don_vi,
            so_luong: report.so_luong,
            trong_luong: nextWeight,
            don_vi_trong_luong: report.don_vi_trong_luong || 'Kg',
            hinh_anh: report.hinh_anh,
            hinh_anh_public_id: report.hinh_anh_public_id || ''
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`${report.mat_hang}: ${data.error || 'lỗi cập nhật'}`);
          continue;
        }
        updated += 1;
      }

      await loadReports(filterFromDate, filterToDate);
      if (failures.length > 0) {
        setError(
          `Đồng bộ xong: ${updated} cập nhật, ${skipped} bỏ qua. Lỗi: ${failures.slice(0, 3).join('; ')}${
            failures.length > 3 ? '…' : ''
          }`
        );
      } else {
        setMessage(
          `Đã đồng bộ trọng lượng từ cân AI: ${updated} dòng cập nhật, ${skipped} dòng bỏ qua.`
        );
      }
    } catch (err: any) {
      setError(err.message || 'Không thể đồng bộ trọng lượng.');
    } finally {
      setIsSyncingWeight(false);
    }
  };

  const reportById = useMemo(() => {
    const map = new Map<string, AcceptanceReport>();
    for (const report of filteredReports) map.set(report.id, report);
    return map;
  }, [filteredReports]);

  const openNvlView = async (report: AcceptanceReport) => {
    setNvlSyncMessage('');
    const fallback = buildNvlViewState(report, productCatalogByKey, productNameByCode, {
      fromDb: false
    });
    setNvlView(fallback);

    const loadActualWeight = async (): Promise<{
      actualWeightKg: number | null;
      actualWeightCount: number;
    }> => {
      try {
        const canRows = await fetchCanTuDongByNgay(report.ngay);
        const { weightKg, counted } = sumTrongLuongCanThucTeForReport(
          canRows,
          report,
          fallback.productCode,
          fallback.productName
        );
        return {
          actualWeightKg: counted > 0 && weightKg > 0 ? Math.round(weightKg * 1000) / 1000 : null,
          actualWeightCount: counted
        };
      } catch {
        return { actualWeightKg: null, actualWeightCount: 0 };
      }
    };

    try {
      const [weightResult, res] = await Promise.all([
        loadActualWeight(),
        fetch(`/api/bao-cao-san-luong-nvl-dinh-muc?id_bao_cao=${encodeURIComponent(report.id)}`)
      ]);
      const data = await res.json().catch(() => ({}));

      const applyWeight = <T extends NvlViewState>(state: T): T => ({
        ...state,
        actualWeightKg: weightResult.actualWeightKg,
        actualWeightCount: weightResult.actualWeightCount
      });

      if (!res.ok) {
        const err = String(data.error || '').trim();
        if (err) {
          setNvlSyncMessage(
            err.includes('chưa tồn tại') || /PGRST205|schema cache/i.test(err)
              ? 'Bảng snapshot chưa tạo — đang hiện Thành phần Kho sản phẩm. Chạy supabase-bao-cao-san-luong-nvl-dinh-muc.sql rồi Đồng bộ.'
              : `Không đọc snapshot DB: ${err}`
          );
        }
        setNvlView(applyWeight(fallback));
        return;
      }
      const rows = Array.isArray(data.items) ? data.items : [];
      if (rows.length === 0) {
        setNvlView(applyWeight(fallback));
        setNvlSyncMessage(
          fallback.items.length > 0
            ? `Đã có ${fallback.items.length} NVL từ Thành phần — chưa lưu snapshot phiếu. Bấm Đồng bộ & lưu DB.`
            : 'Phiếu chưa có snapshot và sản phẩm chưa có Thành phần NVL.'
        );
        return;
      }
      const items = dbRowsToNplItems(rows);
      const savedAt = String(rows[0]?.updated_at || rows[0]?.created_at || '').trim();
      setNvlView(
        applyWeight(
          buildNvlViewState(report, productCatalogByKey, productNameByCode, {
            items,
            fromDb: true,
            savedAt: savedAt || undefined
          })
        )
      );
      setNvlSyncMessage(`Đã tải ${items.length} NVL từ DB (snapshot đã lưu).`);
    } catch {
      setNvlView(fallback);
      setNvlSyncMessage('Không kết nối được API snapshot — đang hiện Thành phần Kho sản phẩm.');
    }
  };

  /** Đồng bộ từ Thành phần Kho sản phẩm → lưu snapshot DB. */
  const handleSyncNvlFromProduct = async () => {
    if (!nvlView) return;
    setIsSyncingNvl(true);
    setNvlSyncMessage('');
    try {
      const catalog = await loadProductCatalog();
      const names = new Map<string, string>();
      for (const entry of catalog.values()) {
        const key = normalizeProductKey(entry.code);
        if (key && entry.name) names.set(key, entry.name);
      }
      setProductNameByCode(names);
      const withNames = buildNvlViewState(nvlView.report, catalog, names, {
        fromDb: false,
        actualWeightKg: nvlView.actualWeightKg,
        actualWeightCount: nvlView.actualWeightCount
      });
      setNvlView(withNames);

      const saveRes = await fetch('/api/bao-cao-san-luong-nvl-dinh-muc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_bao_cao: nvlView.report.id,
          ma_sp: withNames.productCode,
          ten_sp: withNames.productName,
          so_luong_sp: withNames.quantity,
          don_vi_sp: withNames.productUnit,
          items: nplItemsToDbPayload(withNames.items, withNames.quantity)
        })
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Không thể lưu NVL định mức vào DB.');
      }
      const savedItems = dbRowsToNplItems(Array.isArray(saveData.items) ? saveData.items : []);
      setNvlView({
        ...withNames,
        items: savedItems.length > 0 ? savedItems : withNames.items,
        fromDb: true,
        savedAt: new Date().toISOString()
      });
      setNvlSyncMessage(
        withNames.items.length > 0
          ? `Đã đồng bộ và lưu ${withNames.items.length} NVL vào DB.`
          : 'Đã đồng bộ — sản phẩm chưa có Thành phần; snapshot DB trống.'
      );
    } catch (err: any) {
      setNvlSyncMessage(err.message || 'Không thể đồng bộ / lưu Thành phần vào DB.');
    } finally {
      setIsSyncingNvl(false);
    }
  };

  const renderLineActions = (line: { id: string }) => {
    const report = reportById.get(line.id);
    if (!report) return null;
    return (
      <div className="inline-flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => void openNvlView(report)}
          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800 transition hover:bg-violet-100"
          title="Xem NVL định mức"
        >
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            Xem
          </span>
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(report)}
            className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-black text-zinc-700 transition hover:bg-zinc-50"
            title="Sửa"
          >
            <span className="inline-flex items-center gap-1">
              <Pencil className="h-3.5 w-3.5" />
              Sửa
            </span>
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => void handleDelete(report.id)}
            disabled={deletingId === report.id}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Xóa"
          >
            {deletingId === report.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img
                src={vietNhatLogoUrl}
                alt="Viet Nhat IPT"
                className="h-14 w-auto max-w-[190px] object-contain"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">
                  Báo cáo sản lượng
                </p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Mỗi phiếu một bảng — vuốt xuống xem, không cần chọn
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => onCreate()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#d91628]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-600">
            <ClipboardList className="h-4 w-4 text-zinc-400" />
            <span>
              {filteredReports.length} dòng
              {hasActiveFilters ? ' (đã lọc)' : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => void handleSyncTrongLuong()}
                disabled={filteredReports.length === 0 || isSyncingWeight || isLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-extrabold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                title="Đồng bộ trọng lượng từ phiếu cân AI (tổng Cân sản phẩm theo ngày·ca·máy·mã SP)"
              >
                {isSyncingWeight ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isSyncingWeight ? 'Đang đồng bộ...' : 'Đồng bộ trọng lượng'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handlePrint}
              disabled={printSlipCount === 0 || pendingPrint || isLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {pendingPrint ? 'Đang in...' : `In tất cả (${printSlipCount})`}
            </button>
          </div>
        </div>

        <div className="border-b border-zinc-100 bg-white px-4 py-3">
          <TableToolbar isLoading={isLoading} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters}>
            <TableSearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder="Tìm mặt hàng, tổ/máy, ca..."
              disabled={isLoading}
            />
            <FilterCombobox
              label="Ca"
              options={shiftOptions}
              value={filterShift || 'all'}
              onChange={value => setFilterShift(value === 'all' ? '' : value)}
              searchPlaceholder="Tìm ca..."
              compact
            />
            <TableDateFilter label="Từ ngày" value={filterFromDate} onChange={setFilterFromDate} />
            <TableDateFilter label="Đến ngày" value={filterToDate} onChange={setFilterToDate} />
          </TableToolbar>
        </div>

        <div className="p-3 sm:p-4">
          {isLoading ? (
            <div className="px-3 py-8 text-center font-bold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải...
            </div>
          ) : (
            <AcceptanceReportSlipStack
              slips={screenSlips}
              emptyText="Chưa có báo cáo phù hợp với bộ lọc."
              renderLineActions={renderLineActions}
            />
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {nvlView
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
              onClick={() => setNvlView(null)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-violet-100 bg-violet-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">
                      NVL theo định mức
                    </p>
                    <p className="mt-1 font-mono text-sm font-black text-zinc-900">
                      {nvlView.productCode}
                    </p>
                    <p className="text-xs font-semibold text-zinc-600">{nvlView.productName}</p>
                    <div className="mt-2 grid max-w-sm grid-cols-2 gap-2">
                      <div
                        className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5"
                        title="Tổng Cân sản phẩm từ phiếu cân AI (ngày · ca · máy · mã SP)"
                      >
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                          Trọng lượng
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">
                          {formatActualCanWeightKg(nvlView.actualWeightKg)}
                        </p>
                        <p className="mt-0.5 text-[9px] font-semibold text-zinc-400">
                          {nvlView.actualWeightCount > 0
                            ? `${nvlView.actualWeightCount} lần cân AI`
                            : 'Chưa khớp phiếu cân AI'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                          Số lượng
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-black text-emerald-700">
                          {nvlView.quantity > 0
                            ? `${formatNplDecimal(nvlView.quantity)}${
                                nvlView.productUnit ? ` ${nvlView.productUnit}` : ''
                              }`
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                      {nvlView.report.ngay} · {nvlView.report.ca}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-violet-600/80">
                      {nvlView.fromDb
                        ? 'Nguồn: snapshot đã lưu DB · Đồng bộ để cập nhật từ Thành phần Kho sản phẩm'
                        : 'Nguồn: bảng Thành phần · Kho sản phẩm (chưa lưu DB — bấm Đồng bộ để lưu)'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSyncNvlFromProduct()}
                      disabled={isSyncingNvl}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 text-[11px] font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Đồng bộ từ Thành phần Kho sản phẩm và lưu vào DB"
                    >
                      {isSyncingNvl ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      {isSyncingNvl ? 'Đang đồng bộ...' : 'Đồng bộ & lưu DB'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNvlView(null);
                        setNvlSyncMessage('');
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50"
                      title="Đóng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {nvlSyncMessage ? (
                  <div
                    className={`border-b px-4 py-2 text-[11px] font-semibold ${
                      nvlSyncMessage.includes('Không thể')
                        ? 'border-rose-100 bg-rose-50 text-rose-700'
                        : 'border-emerald-100 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    {nvlSyncMessage}
                  </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-auto">
                  {isSyncingNvl ? (
                    <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Đang lấy Thành phần từ Kho sản phẩm...
                    </p>
                  ) : nvlView.items.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm font-semibold text-zinc-400">
                      Sản phẩm chưa có thành phần / định mức NVL trên Kho sản phẩm.
                      <br />
                      <span className="mt-2 inline-block text-[11px] font-bold text-violet-700">
                        Bấm Đồng bộ sau khi cập nhật bảng Thành phần.
                      </span>
                    </p>
                  ) : (
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-zinc-50 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                        <tr>
                          <th className="px-3 py-2.5">Mã NVL</th>
                          <th className="px-3 py-2.5">Tên NVL</th>
                          <th className="px-3 py-2.5 text-right">ĐVT</th>
                          <th className="px-3 py-2.5 text-right" title="Định mức trên 1 SP">
                            ĐM / 1 SP
                          </th>
                          <th
                            className="px-3 py-2.5 text-right"
                            title="Số lượng: ĐM × SL sản lượng. %: giữ tỉ lệ định mức"
                          >
                            Theo SL
                          </th>
                          <th
                            className="px-3 py-2.5 text-right"
                            title="% = Khối lượng phiếu × %. Cái = định lượng Thành phần × SL (quy kg)"
                          >
                            Trọng lượng
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {nvlView.items.map((item, index) => (
                          <tr key={`${item.code}|${index}`} className="hover:bg-violet-50/40">
                            <td className="px-3 py-2 font-mono text-xs font-bold text-zinc-800">
                              {item.code || '—'}
                            </td>
                            <td className="px-3 py-2 text-xs font-semibold text-zinc-700">
                              {item.name || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-zinc-600">
                              {item.amountType === 'percent' ? '%' : item.unit || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-bold text-violet-800">
                              {formatDinhMucPerUnit(item)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-black text-emerald-700">
                              {formatNvlTheoSanLuong(item, nvlView.quantity)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-black text-amber-800">
                              {formatNvlTrongLuongKg(nvlLineWeightsKg[index] ?? null)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold text-zinc-500">
                  <span>{nvlView.items.length} NVL định mức</span>
                  <span className="font-mono font-black text-amber-800">
                    Tổng trọng lượng: {nvlTrongLuongTotalKg > 0 ? formatNvlTrongLuongKg(nvlTrongLuongTotalKg) : '—'}
                  </span>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {pendingPrint &&
        activePrintSlips.length > 0 &&
        createPortal(<AcceptanceReportPrintBatch slips={activePrintSlips} />, document.body)}
    </div>
  );
}
