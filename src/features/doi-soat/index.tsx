import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Trash2
} from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import {
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow
} from '../../components/shared/table';

type CatalogProduct = {
  code: string;
  name: string;
  productType: string;
  unit: string;
  totalWeight: string;
  warehouse: string;
};

type WarehouseCatalogItem = { id: string | number; ten_kho: string };

const KHO_ABBREVIATION_MAP: Record<string, string> = {
  'Kho thành phẩm': 'TP',
  'Kho NVL': 'NVL',
  'Kho hàng hóa': 'HH',
  'Kho gia công': 'GC',
  'Kho công cụ dụng cụ': 'CCDC',
  'Kho hàng hỏng': 'HHỎNG',
  'Kho hàng rác': 'HR',
  'Kho tái chế': 'TC'
};

function khoAbbreviation(tenKho: string) {
  const key = tenKho.trim();
  if (!key) return 'SP';
  if (KHO_ABBREVIATION_MAP[key]) return KHO_ABBREVIATION_MAP[key];
  const rest = key.replace(/^Kho\s+/i, '').trim();
  return (rest || key).toUpperCase();
}

function isNvlKho(tenKho: string) {
  return khoAbbreviation(tenKho) === 'NVL';
}

type DoiSoatLine = {
  key: string;
  maNvl: string;
  maSp: string;
  tenSp: string;
  loaiSp: string;
  donVi: string;
  soLuong: string;
  trongLuong: string;
  rawQr: string;
  allowDuplicateScan?: boolean;
};

type OpenBatch = {
  dot_doi_soat: string;
  ten_kho: string | null;
  ngay_bat_dau: string | null;
  so_dong?: number;
  thu_tu_trong_ngay: number;
  tong_dot_trong_ngay: number;
};

type DotGroup = OpenBatch;

type DoiSoatDetailRow = {
  id: number | string;
  ma_nvl?: string | null;
  ma_sp?: string | null;
  ten_sp?: string | null;
  loai_sp?: string | null;
  ngay_gio_doi_soat?: string | null;
  nguoi_doi_soat?: string | null;
};

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function normalizeKey(value: string) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseQrProductCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx > 0) return trimmed.slice(0, plusIdx).trim();
  const serialMatch = trimmed.match(/^(.+)[_-](\d{6})([0-9A-Za-z]{2,})$/);
  if (serialMatch?.[1]) return serialMatch[1].trim();
  return trimmed;
}

function productPrefixBeforeUnderscore(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const us = trimmed.indexOf('_');
  if (us > 0) return trimmed.slice(0, us).trim();
  return parseQrProductCode(trimmed);
}

function newLineKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowLocalDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toIsoFromLocalDateTime(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function formatDotLabel(
  startIso: string | null,
  dayOrdinal?: number,
  sameDayCount?: number
) {
  const start = startIso ? new Date(startIso) : null;
  if (!start || Number.isNaN(start.getTime())) return startIso || '—';
  const startDay = `${start.getDate()}/${start.getMonth() + 1}`;
  const yy = String(start.getFullYear()).slice(-2);
  const ordinalSuffix = Number(sameDayCount) > 1 ? ` - ${Math.max(1, Number(dayOrdinal) || 1)}` : '';
  return `T${start.getMonth() + 1}/${yy} (${startDay}-...)${ordinalSuffix}`;
}

function newDotDoiSoatKey() {
  return new Date().toISOString();
}

function formatDateTime(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizeCatalogProducts(data: unknown): CatalogProduct[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
        ? (data as { materials: unknown[] }).materials
        : [];

  return rows
    .map((item): CatalogProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.ma_npl ?? record.ma_san_pham ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.ten_npl ?? record.ten_san_pham ?? record.name ?? '').trim();
      const productType = String(record.nhom_vthh ?? record.loai_sp ?? record.loai ?? record.nhom ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim();
      const totalWeight = String(record.tong_trong_luong ?? record.totalWeight ?? '').trim();
      const warehouse = String(record.ten_kho ?? record.warehouse ?? '').trim();
      if (!code) return null;
      return { code, name, productType, unit, totalWeight, warehouse };
    })
    .filter((item): item is CatalogProduct => Boolean(item));
}

function normalizeWarehouseCatalog(data: unknown): WarehouseCatalogItem[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return records
    .map((item): WarehouseCatalogItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const tenKho = String(record.ten_kho ?? '').trim();
      if (!tenKho) return null;
      return { id: (record.id as string | number) ?? tenKho, ten_kho: tenKho };
    })
    .filter((item): item is WarehouseCatalogItem => Boolean(item));
}

function findCatalogProduct(code: string, products: CatalogProduct[], warehouse = '') {
  const key = normalizeKey(code);
  if (!key) return null;
  const matches = products.filter(item => normalizeKey(item.code) === key);
  const warehouseKey = normalizeKey(warehouse);
  return matches.find(item => warehouseKey && normalizeKey(item.warehouse) === warehouseKey) ?? matches[0] ?? null;
}

export function DoiSoatPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { name?: string | null } | null;
}) {
  const { canCreate, canDelete } = useTabAccess('doi-soat');
  const loginName = String(currentUser?.name ?? '').trim();
  const [view, setView] = useState<'thuc-hien' | 'danh-sach'>('thuc-hien');
  const [warehouses, setWarehouses] = useState<WarehouseCatalogItem[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [selectedKho, setSelectedKho] = useState('');
  const [dotDoiSoat, setDotDoiSoat] = useState('');
  const [openBatches, setOpenBatches] = useState<OpenBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const [allBatches, setAllBatches] = useState<DotGroup[]>([]);
  const [loadingAllBatches, setLoadingAllBatches] = useState(false);
  const [selectedDot, setSelectedDot] = useState('');
  const [dotDetailLines, setDotDetailLines] = useState<DoiSoatDetailRow[]>([]);
  const [loadingDotDetail, setLoadingDotDetail] = useState(false);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  const [lines, setLines] = useState<DoiSoatLine[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const performBatchOptions = useMemo<OpenBatch[]>(
    () => [
      {
        dot_doi_soat: '',
        ten_kho: null,
        ngay_bat_dau: null,
        thu_tu_trong_ngay: 1,
        tong_dot_trong_ngay: 1
      },
      ...openBatches
    ],
    [openBatches]
  );

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const [productRes, materialRes] = await Promise.all([
        fetch('/api/san-pham?format=table'),
        fetch('/api/kho-nvl')
      ]);
      const [productData, materialData] = await Promise.all([
        productRes.json().catch(() => ({})),
        materialRes.json().catch(() => ({}))
      ]);
      const merged = [
        ...normalizeCatalogProducts(productData),
        ...normalizeCatalogProducts(materialData)
      ];
      const seen = new Set<string>();
      setProducts(
        merged.filter(item => {
          const key = `${normalizeKey(item.code)}|${normalizeKey(item.warehouse)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
    } catch {
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    setLoadingWarehouses(true);
    try {
      const res = await fetch('/api/quan-ly-kho');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh mục kho.'));
      setWarehouses(normalizeWarehouseCatalog(data));
    } catch (err: any) {
      setWarehouses([]);
      showAppToast(err?.message || 'Không tải được danh mục kho.', 'error');
    } finally {
      setLoadingWarehouses(false);
    }
  }, []);

  const loadOpenBatches = useCallback(async (kho: string) => {
    if (!kho) {
      setOpenBatches([]);
      setDotDoiSoat('');
      return;
    }
    setLoadingBatches(true);
    try {
      const res = await fetch(`/api/doi-soat/dot-mo?tenKho=${encodeURIComponent(kho)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt đối soát.'));
      const records: OpenBatch[] = Array.isArray(data?.records) ? data.records : [];
      setOpenBatches(records);
      setDotDoiSoat(prev => {
        if (prev === '') return '';
        if (prev && records.some(b => b.dot_doi_soat === prev)) return prev;
        return '';
      });
    } catch (err: any) {
      setOpenBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt đối soát.', 'error');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const loadAllBatches = useCallback(async (kho: string) => {
    if (!kho) {
      setAllBatches([]);
      return;
    }
    setLoadingAllBatches(true);
    try {
      const res = await fetch(`/api/doi-soat/dot?tenKho=${encodeURIComponent(kho)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt đối soát.'));
      const records: DotGroup[] = Array.isArray(data?.records) ? data.records : [];
      setAllBatches(records);
      setSelectedDot(prev =>
        prev && records.some(b => b.dot_doi_soat === prev) ? prev : records[0]?.dot_doi_soat ?? ''
      );
    } catch (err: any) {
      setAllBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt đối soát.', 'error');
    } finally {
      setLoadingAllBatches(false);
    }
  }, []);

  const loadDotDetail = useCallback(async (dot: string) => {
    if (!dot) {
      setDotDetailLines([]);
      return;
    }
    setLoadingDotDetail(true);
    try {
      const res = await fetch(`/api/doi-soat?dotDoiSoat=${encodeURIComponent(dot)}&limit=2000`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách sản phẩm của đợt.'));
      setDotDetailLines(Array.isArray(data?.records) ? data.records : []);
    } catch (err: any) {
      setDotDetailLines([]);
      showAppToast(err?.message || 'Không tải được danh sách sản phẩm của đợt.', 'error');
    } finally {
      setLoadingDotDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadWarehouses();
  }, [loadProducts, loadWarehouses]);

  useEffect(() => {
    if (view === 'thuc-hien') void loadOpenBatches(selectedKho);
  }, [selectedKho, view, loadOpenBatches]);

  useEffect(() => {
    if (view === 'danh-sach') void loadAllBatches(selectedKho);
  }, [selectedKho, view, loadAllBatches]);

  useEffect(() => {
    if (view === 'danh-sach') void loadDotDetail(selectedDot);
  }, [selectedDot, view, loadDotDetail]);

  const selectedDotGroup = useMemo(
    () => allBatches.find(b => b.dot_doi_soat === selectedDot) ?? null,
    [allBatches, selectedDot]
  );

  const handleDeleteDetailLine = async (line: DoiSoatDetailRow) => {
    const id = String(line.id ?? '').trim();
    if (!id) return;
    setDeletingDetailId(id);
    try {
      const res = await fetch(`/api/doi-soat/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được dòng đối soát.'));
      setDotDetailLines(prev => prev.filter(item => String(item.id) !== id));
      showAppToast('Đã xóa dòng đối soát.', 'success');
      void loadAllBatches(selectedKho);
    } catch (err: any) {
      showAppToast(err?.message || 'Không xóa được dòng đối soát.', 'error');
    } finally {
      setDeletingDetailId(null);
    }
  };

  const openManualRow = () => {
    const nextLine: DoiSoatLine = {
      key: newLineKey(),
      maNvl: '',
      maSp: '',
      tenSp: '',
      loaiSp: '',
      donVi: '',
      soLuong: '',
      trongLuong: '',
      rawQr: ''
    };
    const nextLines = [...linesRef.current, nextLine];
    linesRef.current = nextLines;
    setLines(nextLines);
  };

  const manualProductOptions = useMemo(() => {
    const warehouseKey = normalizeKey(selectedKho);
    if (!warehouseKey) return [];
    return products.filter(product => normalizeKey(product.warehouse) === warehouseKey);
  }, [products, selectedKho]);

  const updateLine = useCallback((key: string, patch: Partial<DoiSoatLine>) => {
    setLines(previous => {
      const next = previous.map(line => (line.key === key ? { ...line, ...patch } : line));
      linesRef.current = next;
      return next;
    });
  }, []);

  const updateLineCode = useCallback(
    (key: string, value: string) => {
      const matched = findCatalogProduct(value, manualProductOptions, selectedKho);
      const isMaterialLine = isNvlKho(selectedKho);
      updateLine(key, {
        maNvl: value,
        ...(isMaterialLine ? { maSp: value, rawQr: value } : {}),
        ...(matched
          ? {
              tenSp: matched.name,
              loaiSp: matched.productType,
              donVi: matched.unit,
              trongLuong: matched.totalWeight
            }
          : {})
      });
    },
    [manualProductOptions, selectedKho, updateLine]
  );

  const removeLine = (key: string) => {
    setLines(prev => {
      const next = prev.filter(line => line.key !== key);
      linesRef.current = next;
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    setMessage('');
    const savableLines = lines.filter(line => line.maSp.trim() || line.maNvl.trim());
    if (!selectedKho.trim()) {
      setError('Chọn kho trước khi lưu phiếu.');
      return;
    }
    const nguoiDoiSoat = loginName || '—';
    if (!savableLines.length) {
      setError('Nhập ít nhất một mã sản phẩm.');
      return;
    }

    setSaving(true);
    try {
      const thoiDiemLuu = nowLocalDateTimeValue();
      const finalDot = dotDoiSoat.trim() || newDotDoiSoatKey();
      const res = await fetch('/api/doi-soat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ten_kho: selectedKho.trim(),
          dot_doi_soat: finalDot,
          nguoi_doi_soat: nguoiDoiSoat,
          ngay_gio_doi_soat: toIsoFromLocalDateTime(thoiDiemLuu),
          lines: savableLines.map(line => ({
            ma_nvl: line.maNvl || productPrefixBeforeUnderscore(line.maSp) || line.maSp,
            ma_sp: line.maSp || line.maNvl,
            ten_sp: line.tenSp,
            loai_sp: line.loaiSp,
            allow_duplicate_scan: line.allowDuplicateScan === true
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không lưu được đối soát.'));
      }
      const savedCount = Number(data?.saved_count ?? data?.total ?? 0);
      const skippedCount = Number(data?.skipped_count ?? 0);
      const resultMessage =
        skippedCount > 0
          ? `Đã lưu ${savedCount} sản phẩm. ${skippedCount} sản phẩm đã có trong đợt nên không lưu lại.`
          : `Đã lưu ${savedCount} sản phẩm.`;
      setLines([]);
      linesRef.current = [];
      setDotDoiSoat(finalDot);
      setMessage(resultMessage);
      showAppToast(resultMessage, 'success');
      void loadOpenBatches(selectedKho);
    } catch (err: any) {
      const text = err?.message || 'Không lưu được đối soát.';
      setError(text);
      showSaveFailure(err, text);
    } finally {
      setSaving(false);
    }
  };

  const scannedQrCount = lines.filter(line => line.maSp.trim() || line.maNvl.trim()).length;
  const khoAbbr = khoAbbreviation(selectedKho);
  const hideMaQuet = isNvlKho(selectedKho);

  return (
    <div className="mx-auto w-full max-w-none space-y-4 py-2 md:py-3">
      <nav
        aria-label="Chức năng đối soát"
        className="grid grid-cols-2 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2 lg:p-3"
      >
        <button
          type="button"
          aria-current={view === 'thuc-hien' ? 'page' : undefined}
          onClick={() => setView('thuc-hien')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'thuc-hien'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
              view === 'thuc-hien' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            <ClipboardCheck className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Thực hiện</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Thực hiện đối soát</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Quét QR và lưu phiếu đối soát
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'danh-sach' ? 'page' : undefined}
          onClick={() => setView('danh-sach')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'danh-sach'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${
              view === 'danh-sach' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Đã quét</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Danh sách đã quét</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Xem và xóa dòng đã lưu theo đợt
            </span>
          </span>
        </button>
      </nav>

      {view === 'thuc-hien' ? (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-black text-zinc-900">Thông tin phiếu</h2>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-sm font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60 sm:h-10 sm:w-auto sm:text-xs"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu phiếu
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Kho
                <div className="mt-1">
                  <SearchableSelect
                    value={selectedKho}
                    onChange={setSelectedKho}
                    options={warehouses}
                    getValue={item => (item as WarehouseCatalogItem).ten_kho}
                    getLabel={item => (item as WarehouseCatalogItem).ten_kho}
                    placeholder="Chọn kho..."
                    isLoading={loadingWarehouses}
                    allowEmpty={false}
                    inputClassName={inputClass}
                    comboboxMode
                  />
                </div>
              </label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Đợt đối soát
                <div className="mt-1">
                  <SearchableSelect
                    value={dotDoiSoat}
                    onChange={setDotDoiSoat}
                    options={performBatchOptions}
                    getValue={item => (item as OpenBatch).dot_doi_soat}
                    getLabel={item => {
                      const batch = item as OpenBatch;
                      return batch.dot_doi_soat
                        ? formatDotLabel(
                            batch.ngay_bat_dau,
                            batch.thu_tu_trong_ngay,
                            batch.tong_dot_trong_ngay
                          )
                        : '+ Tạo đợt mới';
                    }}
                    placeholder="+ Tạo đợt mới"
                    isLoading={loadingBatches}
                    allowEmpty={false}
                    disabled={!selectedKho}
                    inputClassName={inputClass}
                    comboboxMode
                    comboboxSearchable={false}
                  />
                </div>
              </label>
            </div>
          </section>

          {!selectedKho ? (
            <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
              Chọn kho ở trên để bắt đầu thêm mã sản phẩm.
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-zinc-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:px-4 sm:py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="text-sm font-black text-zinc-900">Danh sách mã SP</h2>
                    <p className="w-full rounded-lg bg-zinc-100 px-2.5 py-1.5 text-lg font-black leading-tight text-black sm:w-auto sm:bg-transparent sm:px-0 sm:py-0">
                      SL mã: {scannedQrCount}
                    </p>
                  </div>
                </div>
                <div className="flex w-full sm:w-auto sm:items-center">
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={openManualRow}
                      onMouseDown={event => event.preventDefault()}
                      className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-[11px] font-extrabold text-zinc-800 transition-none hover:bg-white active:bg-white focus:bg-white focus:outline-none sm:h-9 sm:w-auto"
                      title="Thêm dòng mã SP"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm
                    </button>
                  ) : null}
                </div>
              </div>

              <TableShell minWidthClassName="min-w-[720px]" maxHeightClassName="max-h-[480px]">
                <TableHead>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã {khoAbbr} gốc</TableHeadCell>
                  {!hideMaQuet ? <TableHeadCell>Mã quét</TableHeadCell> : null}
                  <TableHeadCell>Tên {khoAbbr}</TableHeadCell>
                  <TableHeadCell>ĐV</TableHeadCell>
                  {canCreate ? <TableHeadCell align="center">Thao tác</TableHeadCell> : null}
                </TableHead>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.key} className="transition-none hover:bg-transparent">
                      <td className="px-4 py-2.5 font-bold text-zinc-500">{index + 1}</td>
                      <td className="px-4 py-2.5">
                        <SearchableSelect
                          value={line.maNvl}
                          onChange={value => updateLineCode(line.key, value)}
                          options={manualProductOptions}
                          placeholder={`Mã ${khoAbbr}`}
                          isLoading={isLoadingProducts}
                          inputClassName={`${inputClass} font-mono transition-none`}
                          getValue={item => (item as CatalogProduct).code}
                          getLabel={item => {
                            const p = item as CatalogProduct;
                            return `${p.code} · ${p.name}`;
                          }}
                          displaySelectedAsValue
                        />
                      </td>
                      {!hideMaQuet ? (
                        <td className="px-4 py-2.5">
                          <input
                            value={line.maSp}
                            onChange={event =>
                              updateLine(line.key, { maSp: event.target.value, rawQr: event.target.value })
                            }
                            className={`${inputClass} font-mono transition-none`}
                            placeholder="Mã quét"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-2.5">
                        <input
                          value={line.tenSp}
                          onChange={event => updateLine(line.key, { tenSp: event.target.value })}
                          className={`${inputClass} transition-none`}
                          placeholder="Tên SP"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          value={line.donVi}
                          onChange={event => updateLine(line.key, { donVi: event.target.value })}
                          className={`${inputClass} transition-none`}
                          placeholder="ĐV"
                        />
                      </td>
                      {canCreate ? (
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                            title="Xóa dòng"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                    </TableRow>
                  ))}
                  {lines.length === 0 ? (
                    <TableEmptyRow colSpan={(hideMaQuet ? 4 : 5) + (canCreate ? 1 : 0)}>
                      Chưa có mã. Bấm <span className="text-[#ef1b2d]">Thêm</span>.
                    </TableEmptyRow>
                  ) : null}
                </TableBody>
              </TableShell>
            </section>
          )}

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
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 className="mb-3 text-sm font-black text-zinc-900">Chọn kho và đợt đối soát</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Kho
                <div className="mt-1">
                  <SearchableSelect
                    value={selectedKho}
                    onChange={setSelectedKho}
                    options={warehouses}
                    getValue={item => (item as WarehouseCatalogItem).ten_kho}
                    getLabel={item => (item as WarehouseCatalogItem).ten_kho}
                    placeholder="Chọn kho..."
                    isLoading={loadingWarehouses}
                    allowEmpty={false}
                    inputClassName={inputClass}
                    comboboxMode
                  />
                </div>
              </label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Đợt đối soát
                <div className="mt-1">
                  <SearchableSelect
                    value={selectedDot}
                    onChange={setSelectedDot}
                    options={allBatches}
                    getValue={item => (item as DotGroup).dot_doi_soat}
                    getLabel={item => {
                      const b = item as DotGroup;
                      return `${formatDotLabel(
                        b.ngay_bat_dau,
                        b.thu_tu_trong_ngay,
                        b.tong_dot_trong_ngay
                      )} · ${b.so_dong ?? 0} mã`;
                    }}
                    placeholder={selectedKho ? 'Tìm đợt đối soát...' : 'Chọn kho trước'}
                    isLoading={loadingAllBatches}
                    allowEmpty={false}
                    disabled={!selectedKho}
                    inputClassName={inputClass}
                    comboboxMode
                  />
                </div>
              </label>
            </div>
            {selectedDotGroup ? (
              <p className="mt-3 text-[11px] font-semibold text-zinc-500">
                Bắt đầu: {formatDateTime(selectedDotGroup.ngay_bat_dau)} · {selectedDotGroup.so_dong ?? 0} mã
              </p>
            ) : null}
          </section>

          {!selectedKho ? (
            <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
              Chọn kho ở trên để xem đợt đối soát.
            </section>
          ) : !selectedDot ? (
            <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm font-semibold text-zinc-500">
              Chọn đợt đối soát ở trên để xem danh sách sản phẩm đã quét.
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
                <div>
                  <h2 className="text-sm font-black text-zinc-900">Danh sách sản phẩm đã quét</h2>
                  <p className="text-[11px] font-semibold text-zinc-500">{dotDetailLines.length} mã SP</p>
                </div>
              </div>

              <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[480px]">
                <TableHead>
                  <TableHeadCell>STT</TableHeadCell>
                  <TableHeadCell>Mã {khoAbbr} gốc</TableHeadCell>
                  {!hideMaQuet ? <TableHeadCell>Mã quét</TableHeadCell> : null}
                  <TableHeadCell>Tên {khoAbbr}</TableHeadCell>
                  <TableHeadCell>ĐV</TableHeadCell>
                  <TableHeadCell>Kho</TableHeadCell>
                  <TableHeadCell>Người đối soát</TableHeadCell>
                  <TableHeadCell>Thời điểm lưu</TableHeadCell>
                  {canDelete ? <TableHeadCell align="center">Thao tác</TableHeadCell> : null}
                </TableHead>
                <TableBody>
                  {dotDetailLines.map((line, index) => {
                    const matched = findCatalogProduct(String(line.ma_nvl ?? ''), products, selectedKho);
                    return (
                      <TableRow key={String(line.id)}>
                        <td className="px-4 py-3 font-bold text-zinc-500">{index + 1}</td>
                        <td className="px-4 py-3 font-mono font-bold text-zinc-800">{line.ma_nvl || '—'}</td>
                        {!hideMaQuet ? (
                          <td className="px-4 py-3 font-mono font-bold text-zinc-900">{line.ma_sp || '—'}</td>
                        ) : null}
                        <td className="px-4 py-3 font-semibold text-zinc-700">{line.ten_sp || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-600">{matched?.unit || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-600">
                          {selectedDotGroup?.ten_kho || selectedKho || '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-zinc-700">{line.nguoi_doi_soat || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                          {formatDateTime(line.ngay_gio_doi_soat)}
                        </td>
                        {canDelete ? (
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleDeleteDetailLine(line)}
                              disabled={deletingDetailId !== null}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              title={`Xóa ${line.ma_sp || line.ma_nvl || ''}`}
                            >
                              {deletingDetailId === String(line.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                        ) : null}
                      </TableRow>
                    );
                  })}
                  {dotDetailLines.length === 0 ? (
                    <TableEmptyRow colSpan={(hideMaQuet ? 7 : 8) + (canDelete ? 1 : 0)}>
                      {loadingDotDetail ? 'Đang tải dữ liệu...' : 'Đợt này chưa có sản phẩm nào được quét.'}
                    </TableEmptyRow>
                  ) : null}
                </TableBody>
              </TableShell>
            </section>
          )}
        </>
      )}

      {/* giữ onBack để shell App không cảnh báo unused nếu truyền prop */}
      <span className="sr-only">{onBack ? 'doi-soat' : ''}</span>
    </div>
  );
}

export default DoiSoatPanel;
