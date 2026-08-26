import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Copy,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Scale,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from '../../components/WeighingImagePreviewModal';
import {
  buildCanTuDongPrintData,
  CanTuDongPrintBatch,
  type CanTuDongPrintData
} from '../../components/CanTuDongPrintSheet';
import { formatNumber } from '../../utils';
import { waitForPrintImagesReady } from '../../utils/printReady';
import { downloadCanTuDongExcel } from '../../utils/canTuDongExcel';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import { normalizeProductCodeKey } from '../san-pham/types';
import {
  canTuDongShiftMatches,
  DEFAULT_CAN_TU_DONG_BI_KG,
  parseCanTuDongQrProductCode,
  resolveCanSpKg,
  resolveCanTuDongBusinessDate,
  resolveCanTuDongMachine,
  resolveCanTuDongProductionOrder,
  resolveTrongLuongBiKg,
  resolveTrongLuongNhuaKg,
  resolveNhuaDinhMucKg,
  sumCanTuDongNhuaTieuChuanKg,
  sumCanTuDongNhuaDinhMucKg,
  sumCanTuDongChenhLechNhuaKg,
  sumCanTuDongCanSanPhamKg,
  sumCanTuDongLoiTieuChuanKg,
  sumCanTuDongCanLoiKg,
  sumCanTuDongChenhLechLoiKg,
  sumCanTuDongSanLuongTotals
} from '../../utils/canTuDongWeights';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow
} from '../../components/shared/table';

const CAN_TU_DONG_PORTRAIT_STYLE_ID = 'can-tu-dong-print-page-portrait';

function enableCanTuDongPortraitPrintPage() {
  document.getElementById(CAN_TU_DONG_PORTRAIT_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = CAN_TU_DONG_PORTRAIT_STYLE_ID;
  style.media = 'print';
  style.textContent = '@page { size: 210mm 297mm; margin: 8mm; }';
  document.head.appendChild(style);
}

function disableCanTuDongPortraitPrintPage() {
  document.getElementById(CAN_TU_DONG_PORTRAIT_STYLE_ID)?.remove();
}

/**
 * Ý nghĩa cột DB / hiển thị:
 * - tare_weight      = Cân lõi
 * - weight           = Cân sản phẩm (còn lõi)
 * - Trọng lượng bì   = mặc định 0,16 kg
 * - Nhựa thực tế = SP − lõi − bì
 * - Nhựa định mức = san_pham.trong_luong_nhua (hoặc TL − lõi − bì)
 * - core_image_*     = Ảnh cân lõi
 * - product_image_*  = Ảnh cân sản phẩm
 */
export type CanTuDongRecord = {
  id: number | string;
  event_id?: string | null;
  qr_code?: string | null;
  /** Ca sản xuất (SOURCE_SHIFT metadata hoặc suy từ giờ captured_at). */
  ca?: string | null;
  /** Cột Ngày (SOURCE_DATE / work_date) — không phải ngày cân. */
  ngay?: string | null;
  /** Lệnh SX (metadata.production_order / SOURCE_PRODUCTION_ORDER). */
  lenh_sx?: string | null;
  ma_lenh_sx?: string | null;
  /** Máy (metadata.machine / SOURCE_MACHINE). */
  may?: string | null;
  machine?: string | null;
  /** Cân sản phẩm (còn lõi) */
  weight?: number | string | null;
  /** Cân lõi */
  tare_weight?: number | string | null;
  /** Khối lượng thực */
  net_weight?: number | string | null;
  unit?: string | null;
  captured_at?: string | null;
  product_image_path?: string | null;
  product_image_url?: string | null;
  product_image_public_id?: string | null;
  product_preview_url?: string | null;
  preview_url?: string | null;
  core_image_path?: string | null;
  core_image_url?: string | null;
  core_image_public_id?: string | null;
  core_preview_url?: string | null;
  can_loi?: number | string | null;
  can_san_pham?: number | string | null;
  khoi_luong_thuc?: number | string | null;
  device_id?: string | null;
  weight_source?: string | null;
  status?: string | null;
  created_at?: string | null;
  metadata?: unknown;
};

/** Ngưỡng phân tích kém/hơn cân theo |% chênh lệch|. */
const PHAN_TICH_NGUONG_PCT = 2;

/** Bộ lọc danh sách theo chênh lệch nhựa (TT−ĐM). */
type CanTuDongDiffFilter = 'all' | 'all-diff' | 'gt-2pct';

type CanTuDongPhanTichBucket = {
  /** Tổng số dòng kém/hơn cân (không lọc 2%). */
  rowCount: number;
  /** Σ |Chênh lệch nhựa| mọi dòng trong nhóm. */
  weightDiffAllKg: number;
  rowsLe2Pct: number;
  rowsGt2Pct: number;
  /** Σ |Chênh lệch nhựa| của các dòng có |%| > 2%. */
  weightDiffGt2Kg: number;
};

function emptyPhanTichBucket(): CanTuDongPhanTichBucket {
  return {
    rowCount: 0,
    weightDiffAllKg: 0,
    rowsLe2Pct: 0,
    rowsGt2Pct: 0,
    weightDiffGt2Kg: 0
  };
}

function accumulatePhanTichBucket(
  bucket: CanTuDongPhanTichBucket,
  absPhanTram: number,
  absChenhLechKg: number
) {
  bucket.rowCount += 1;
  bucket.weightDiffAllKg += absChenhLechKg;
  if (absPhanTram <= PHAN_TICH_NGUONG_PCT) {
    bucket.rowsLe2Pct += 1;
  } else {
    bucket.rowsGt2Pct += 1;
    bucket.weightDiffGt2Kg += absChenhLechKg;
  }
}

/** Giá trị nút «Tự động điền». */
const AUTO_FILL_NGAY = '2026-08-20';
const AUTO_FILL_LENH_SX = 'LSX-DH056';
const AUTO_FILL_CA = '12C2';
const AUTO_FILL_MAY = 'Máy Bao Bì';
const AUTO_FILL_CHUNK = 80;
/** Tải full danh sách (không lọc ngày). */
const CAN_TU_DONG_FETCH_LIMIT = '10000';

async function postCanTuDongBulkAutofill(
  ids: Array<string | number>,
  payload: { ngay: string; ca: string; may: string; lenh_sx?: string; all?: boolean }
) {
  if (payload.all) {
    const res = await fetch('/api/can-tu-dong/bulk-autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        all: true,
        ngay: payload.ngay,
        ca: payload.ca,
        may: payload.may,
        ...(payload.lenh_sx ? { lenh_sx: payload.lenh_sx } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể tự động điền các dòng cân tự động.');
    }
    return Number(data.updated) || 0;
  }

  let updated = 0;
  for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
    const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
    const res = await fetch('/api/can-tu-dong/bulk-autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk, ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể tự động điền các dòng cân tự động.');
    }
    updated += Number(data.updated) || chunk.length;
  }
  return updated;
}

async function postCanTuDongBulkSetNgay(ids: Array<string | number>, ngay: string) {
  let updated = 0;
  for (let i = 0; i < ids.length; i += AUTO_FILL_CHUNK) {
    const chunk = ids.slice(i, i + AUTO_FILL_CHUNK);
    const res = await fetch('/api/can-tu-dong/bulk-set-ngay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: chunk, ngay })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể đổi Ngày các dòng cân tự động.');
    }
    updated += Number(data.updated) || chunk.length;
  }
  return updated;
}

/** YYYY-MM-DD theo lịch máy (hôm nay). */
function localIsoDateToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Hiển thị YYYY-MM-DD → dd/MM/yyyy. */
function formatIsoDateVi(iso?: string | null) {
  const raw = String(iso ?? '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return raw || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatWeight(
  value?: number | string | null,
  unit?: string | null,
  fractionDigits: number = 1
) {
  if (value == null || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return String(value);
  const unitLabel = String(unit ?? 'kg').trim() || 'kg';
  return `${formatNumber(num, fractionDigits)} ${unitLabel}`;
}

function asWeightNumber(value?: number | string | null): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

/** Chênh lệch nhựa = Nhựa thực tế − Nhựa định mức; % = chênh lệch ÷ Nhựa thực tế × 100. */
function resolveNhuaChenhLechVaPhanTram(
  nhuaThucTe: number | null,
  nhuaDinhMuc: number | null
) {
  if (nhuaThucTe === null || nhuaDinhMuc === null) {
    return { chenhLech: null as number | null, phanTram: null as number | null };
  }
  const chenhLech = nhuaThucTe - nhuaDinhMuc;
  const phanTram = nhuaThucTe !== 0 ? (chenhLech / nhuaThucTe) * 100 : null;
  return { chenhLech, phanTram };
}

function resolveRowStandardDiff(
  row: CanTuDongRecord,
  productStandardWeightByCode: Map<string, number>,
  productCoreWeightByCode: Map<string, number>,
  productPlasticWeightByCode: Map<string, number>
) {
  const maSp = parseCanTuDongQrProductCode(row.qr_code);
  const maSpKey = normalizeProductCodeKey(maSp);
  const standardKg = maSpKey ? productStandardWeightByCode.get(maSpKey) : undefined;
  const coreKg = maSpKey ? productCoreWeightByCode.get(maSpKey) : undefined;
  const plasticKg = maSpKey ? productPlasticWeightByCode.get(maSpKey) : undefined;
  const nhuaThucTe = resolveTrongLuongNhuaKg(row);
  const nhuaDinhMuc = resolveNhuaDinhMucKg(standardKg, coreKg, plasticKg);
  const { chenhLech, phanTram } = resolveNhuaChenhLechVaPhanTram(nhuaThucTe, nhuaDinhMuc);
  if (chenhLech === null || phanTram === null || chenhLech === 0) return null;
  return {
    chenhLech,
    phanTram,
    absPhanTram: Math.abs(phanTram),
    absChenhLech: Math.abs(chenhLech),
    standardKg: nhuaDinhMuc,
    canSpKg: nhuaThucTe
  };
}

function formatSignedPercent(value: number | null, fractionDigits = 2) {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, fractionDigits)}%`;
}

function statusClass(status?: string | null) {
  const key = String(status ?? '')
    .trim()
    .toLowerCase();
  if (key === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (key === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (key === 'rejected' || key === 'error') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

function resolveProductImageUrl(row: CanTuDongRecord) {
  return String(row.product_preview_url || row.preview_url || row.product_image_url || '').trim();
}

function resolveCoreImageUrl(row: CanTuDongRecord) {
  return String(row.core_preview_url || row.core_image_url || '').trim();
}

function ImageCell({
  url,
  title,
  emptyLabel,
  onView
}: {
  url: string;
  title: string;
  emptyLabel: string;
  onView: () => void;
}) {
  if (!url) {
    return (
      <span className="inline-flex h-12 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-[10px] font-bold text-zinc-400">
        {emptyLabel}
      </span>
    );
  }
  return <WeighingImageThumbnail url={url} alt={title} title={title} onView={onView} />;
}

function rowIdKey(id: number | string) {
  return String(id);
}

function resolveRowMaSp(row: CanTuDongRecord): string {
  return parseCanTuDongQrProductCode(row.qr_code);
}

function normalizeQrKey(qr?: string | null): string {
  return String(qr ?? '').trim();
}

export function CanTuDongPanel({
  onBack
}: {
  onBack: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
  };
}) {
  const [records, setRecords] = useState<CanTuDongRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSettingNgay, setIsSettingNgay] = useState(false);
  const [showAutoFillModal, setShowAutoFillModal] = useState(false);
  const [diffFilter, setDiffFilter] = useState<CanTuDongDiffFilter>('all');
  /** Dropdown chọn đúng 1 mã (`all` = không chọn). */
  const [maSpFilter, setMaSpFilter] = useState('all');
  /** Ô tìm — lọc chứa chuỗi trong Mã SP / QR / tên SP. */
  const [maSpQuery, setMaSpQuery] = useState('');
  /** Lọc cột Ngày (SOURCE_DATE / work_date) — không phải ngày cân. */
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  /** Lọc cột Ca (`all` = tất cả). */
  const [caFilter, setCaFilter] = useState('all');
  /** Chỉ hiện dòng có mã QR trùng trong phạm vi bộ lọc ngày/ca/Mã SP. */
  const [onlyDuplicateQr, setOnlyDuplicateQr] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CanTuDongRecord | null>(null);
  const [editForm, setEditForm] = useState({ qr_code: '', ca: '', tare_weight: '', weight: '', unit: 'kg', device_id: '', status: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [productNameByCode, setProductNameByCode] = useState<Map<string, string>>(() => new Map());
  const [productStandardWeightByCode, setProductStandardWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [productCoreWeightByCode, setProductCoreWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [productPlasticWeightByCode, setProductPlasticWeightByCode] = useState<Map<string, number>>(
    () => new Map()
  );
  const [printData, setPrintData] = useState<CanTuDongPrintData | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: CAN_TU_DONG_FETCH_LIMIT });
      const res = await fetch(`/api/can-tu-dong?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(readApiErrorMessage(res, errorData, 'Không tải được cân tự động.'));
      }
      const payload = await res.json();
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setSelectedIds(new Set());
    } catch (err: any) {
      const message = err?.message || 'Không tải được cân tự động.';
      setError(message);
      setRecords([]);
      setSelectedIds(new Set());
      showAppToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load lần đầu; lọc bằng nút Tải lại
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const rows: Array<Record<string, unknown>> = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
            ? data
            : [];
        const nameMap = new Map<string, string>();
        const weightMap = new Map<string, number>();
        const coreMap = new Map<string, number>();
        const plasticMap = new Map<string, number>();
        for (const row of rows) {
          const code = String(row.ma_sp ?? row.code ?? '').trim();
          const newCode = String(row.ma_sp_moi ?? row.newCode ?? '').trim();
          const name = String(row.ten_sp ?? row.name ?? '').trim();
          const weightRaw = row.tong_trong_luong ?? row.khoi_luong ?? row.totalWeight;
          const weightNum =
            typeof weightRaw === 'number'
              ? weightRaw
              : Number(String(weightRaw ?? '').trim().replace(',', '.'));
          const hasWeight = Number.isFinite(weightNum) && weightNum > 0;
          const coreRaw = row.trong_luong_loi ?? row.coreWeight;
          const coreNum =
            typeof coreRaw === 'number'
              ? coreRaw
              : Number(String(coreRaw ?? '').trim().replace(',', '.'));
          const hasCore = Number.isFinite(coreNum) && coreNum > 0;
          const plasticRaw = row.trong_luong_nhua ?? row.plasticWeight;
          const plasticNum =
            typeof plasticRaw === 'number'
              ? plasticRaw
              : Number(String(plasticRaw ?? '').trim().replace(',', '.'));
          const hasPlastic = Number.isFinite(plasticNum) && plasticNum > 0;
          for (const c of [code, newCode]) {
            const key = normalizeProductCodeKey(c);
            if (!key) continue;
            if (name) nameMap.set(key, name);
            if (hasWeight) weightMap.set(key, weightNum);
            if (hasCore) coreMap.set(key, coreNum);
            if (hasPlastic) plasticMap.set(key, plasticNum);
          }
        }
        if (!cancelled) {
          setProductNameByCode(nameMap);
          setProductStandardWeightByCode(weightMap);
          setProductCoreWeightByCode(coreMap);
          setProductPlasticWeightByCode(plasticMap);
        }
      } catch {
        if (!cancelled) {
          setProductNameByCode(new Map());
          setProductStandardWeightByCode(new Map());
          setProductCoreWeightByCode(new Map());
          setProductPlasticWeightByCode(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingPrint || !printData) return;
    let cancelled = false;
    document.body.classList.add('can-tu-dong-print-active');
    enableCanTuDongPortraitPrintPage();
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('can-tu-dong-print-active');
          disableCanTuDongPortraitPrintPage();
          setPendingPrint(false);
          setPrintData(null);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('can-tu-dong-print-active');
      disableCanTuDongPortraitPrintPage();
    };
  }, [pendingPrint, printData]);

  const recordsByDate = useMemo(() => {
    if (!fromDate && !toDate) return records;
    return records.filter(row => {
      const ngay = resolveCanTuDongBusinessDate(row);
      if (!ngay) return false;
      if (fromDate && ngay < fromDate) return false;
      if (toDate && ngay > toDate) return false;
      return true;
    });
  }, [records, fromDate, toDate]);

  const caOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of recordsByDate) {
      const ca = String(row.ca ?? '').trim();
      if (ca) set.add(ca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByDate]);

  const recordsByCa = useMemo(() => {
    if (caFilter === 'all') return recordsByDate;
    return recordsByDate.filter(row => canTuDongShiftMatches(String(row.ca ?? ''), caFilter));
  }, [recordsByDate, caFilter]);

  const maSpOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of recordsByCa) {
      const maSp = resolveRowMaSp(row);
      const key = normalizeProductCodeKey(maSp);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, maSp);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [recordsByCa]);

  const recordsByMaSp = useMemo(() => {
    const queryKey = normalizeProductCodeKey(maSpQuery);
    const pickKey = maSpFilter === 'all' ? '' : normalizeProductCodeKey(maSpFilter);
    if (!queryKey && !pickKey) return recordsByCa;
    return recordsByCa.filter(row => {
      const maSp = resolveRowMaSp(row);
      const maSpKey = normalizeProductCodeKey(maSp);
      if (pickKey && maSpKey !== pickKey) return false;
      if (!queryKey) return true;
      if (maSpKey.includes(queryKey)) return true;
      const qrKey = normalizeProductCodeKey(String(row.qr_code || ''));
      if (qrKey.includes(queryKey)) return true;
      const name = maSpKey ? productNameByCode.get(maSpKey) : '';
      if (name && normalizeProductCodeKey(name).includes(queryKey)) return true;
      return false;
    });
  }, [recordsByCa, maSpFilter, maSpQuery, productNameByCode]);

  const qrDuplicateInfo = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of recordsByMaSp) {
      const key = normalizeQrKey(row.qr_code);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const duplicateKeys = new Set<string>();
    const duplicateList: Array<{ qr: string; count: number }> = [];
    let duplicateRowCount = 0;
    for (const [qr, count] of counts) {
      if (count <= 1) continue;
      duplicateKeys.add(qr);
      duplicateList.push({ qr, count });
      duplicateRowCount += count;
    }
    duplicateList.sort((a, b) => b.count - a.count || a.qr.localeCompare(b.qr, 'vi'));
    return { duplicateKeys, duplicateList, duplicateRowCount };
  }, [recordsByMaSp]);

  const visibleRecords = useMemo(() => {
    let rows = recordsByMaSp;
    if (diffFilter !== 'all') {
      rows = rows.filter(row => {
        const diff = resolveRowStandardDiff(
          row,
          productStandardWeightByCode,
          productCoreWeightByCode,
          productPlasticWeightByCode
        );
        if (!diff) return false;
        if (diffFilter === 'gt-2pct') return diff.absPhanTram > PHAN_TICH_NGUONG_PCT;
        return true;
      });
    }
    if (onlyDuplicateQr) {
      rows = rows.filter(row => {
        const key = normalizeQrKey(row.qr_code);
        return Boolean(key && qrDuplicateInfo.duplicateKeys.has(key));
      });
    }
    return rows;
  }, [
    recordsByMaSp,
    productStandardWeightByCode,
    productCoreWeightByCode,
    productPlasticWeightByCode,
    diffFilter,
    onlyDuplicateQr,
    qrDuplicateInfo.duplicateKeys
  ]);

  const visibleIds = useMemo(
    () => visibleRecords.map(row => rowIdKey(row.id)).filter(Boolean),
    [visibleRecords]
  );

  const trongLuongNhuaTotals = useMemo(
    () => sumCanTuDongSanLuongTotals(visibleRecords),
    [visibleRecords]
  );
  const nhuaTieuChuanTotals = useMemo(
    () => sumCanTuDongNhuaTieuChuanKg(visibleRecords, productStandardWeightByCode),
    [visibleRecords, productStandardWeightByCode]
  );
  const nhuaDinhMucTotals = useMemo(
    () =>
      sumCanTuDongNhuaDinhMucKg(
        visibleRecords,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      ),
    [visibleRecords, productStandardWeightByCode, productCoreWeightByCode, productPlasticWeightByCode]
  );
  const chenhLechNhuaTotals = useMemo(
    () =>
      sumCanTuDongChenhLechNhuaKg(
        visibleRecords,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      ),
    [visibleRecords, productStandardWeightByCode, productCoreWeightByCode, productPlasticWeightByCode]
  );
  const trongLuongTtTotals = useMemo(
    () => sumCanTuDongCanSanPhamKg(visibleRecords),
    [visibleRecords]
  );
  const loiTieuChuanTotals = useMemo(
    () => sumCanTuDongLoiTieuChuanKg(visibleRecords, productCoreWeightByCode),
    [visibleRecords, productCoreWeightByCode]
  );
  const tongTrongLuongLoiTotals = useMemo(
    () => sumCanTuDongCanLoiKg(visibleRecords),
    [visibleRecords]
  );
  const chenhLechLoiTotals = useMemo(
    () => sumCanTuDongChenhLechLoiKg(visibleRecords, productCoreWeightByCode),
    [visibleRecords, productCoreWeightByCode]
  );

  const hasDateFilters = Boolean(fromDate || toDate);
  const hasCaFilter = caFilter !== 'all';
  const hasMaSpFilters = maSpFilter !== 'all' || Boolean(maSpQuery.trim());
  const hasActiveFilters = hasDateFilters || hasCaFilter || hasMaSpFilters || onlyDuplicateQr;

  /** Phân tích kém cân / hơn cân theo |%| chênh lệch nhựa ÷ Nhựa thực tế (ngưỡng 2%). */
  const phanTichCan = useMemo(() => {
    const kem = emptyPhanTichBucket();
    const hon = emptyPhanTichBucket();
    let comparedRows = 0;
    for (const row of recordsByMaSp) {
      const diff = resolveRowStandardDiff(
        row,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      );
      if (!diff) continue;
      comparedRows += 1;
      if (diff.chenhLech < 0) {
        accumulatePhanTichBucket(kem, diff.absPhanTram, diff.absChenhLech);
      } else {
        accumulatePhanTichBucket(hon, diff.absPhanTram, diff.absChenhLech);
      }
    }
    return { kem, hon, comparedRows };
  }, [
    recordsByMaSp,
    productStandardWeightByCode,
    productCoreWeightByCode,
    productPlasticWeightByCode
  ]);

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelected = (id: string) => {
    if (!id) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    if (
      !window.confirm(
        `Xóa ${ids.length} dòng cân tự động đã chọn?\n\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/can-tu-dong/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa các dòng đã chọn.');
      }
      const deleted = Number(data.deleted) || ids.length;
      showAppToast(`Đã xóa ${deleted} dòng cân tự động.`);
      await loadRecords();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể xóa các dòng đã chọn.';
      showAppToast(message, 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const openAutoFillModal = () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      showAppToast('Hãy tick chọn các dòng cần tự động điền.', 'error');
      return;
    }
    setShowAutoFillModal(true);
  };

  const handleAutoFillSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      showAppToast('Hãy tick chọn các dòng cần tự động điền.', 'error');
      return;
    }

    setIsAutoFilling(true);
    try {
      const updated = await postCanTuDongBulkAutofill(ids, {
        ngay: AUTO_FILL_NGAY,
        lenh_sx: AUTO_FILL_LENH_SX,
        ca: AUTO_FILL_CA,
        may: AUTO_FILL_MAY
      });
      showAppToast(`Đã điền Ngày + Ca + Lệnh SX + Máy cho ${updated} dòng.`);
      setShowAutoFillModal(false);
      await loadRecords();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Không thể tự động điền các dòng đã chọn.';
      showAppToast(message, 'error');
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleBulkSetNgayToday = async () => {
    const ids = visibleRecords.map(row => row.id).filter(id => id != null && String(id).trim() !== '');
    if (ids.length === 0) {
      showAppToast('Không có dòng nào trong bộ lọc hiện tại.', 'error');
      return;
    }
    const ngay = localIsoDateToday();
    const ngayLabel = formatIsoDateVi(ngay);
    if (
      !window.confirm(
        `Đổi cột Ngày thành ${ngayLabel} cho ${formatNumber(ids.length, 0)} dòng đang hiện (theo bộ lọc)?\n\nKhông đổi ngày cân / thời điểm.`
      )
    ) {
      return;
    }

    setIsSettingNgay(true);
    try {
      const updated = await postCanTuDongBulkSetNgay(ids, ngay);
      setFromDate(ngay);
      setToDate(ngay);
      showAppToast(`Đã đổi Ngày thành ${ngayLabel} cho ${formatNumber(updated, 0)} dòng.`);
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể đổi Ngày các dòng đang lọc.', 'error');
    } finally {
      setIsSettingNgay(false);
    }
  };

  const openEdit = (row: CanTuDongRecord) => {
    setEditingRecord(row);
    setEditForm({
      qr_code: String(row.qr_code ?? ''),
      ca: String(row.ca ?? ''),
      tare_weight: String(row.tare_weight ?? row.can_loi ?? ''),
      weight: String(row.weight ?? row.can_san_pham ?? ''),
      unit: String(row.unit ?? 'kg'),
      device_id: String(row.device_id ?? ''),
      status: String(row.status ?? '')
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/can-tu-dong/${encodeURIComponent(String(editingRecord.id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể cập nhật dòng cân tự động.');
      showAppToast('Đã cập nhật dòng cân tự động.');
      setEditingRecord(null);
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể cập nhật dòng cân tự động.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRow = async (row: CanTuDongRecord) => {
    if (!window.confirm(`Xóa dòng ${row.qr_code || row.id}?\n\nHành động này không thể hoàn tác.`)) return;
    try {
      const res = await fetch('/api/can-tu-dong/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa dòng cân tự động.');
      showAppToast('Đã xóa dòng cân tự động.');
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể xóa dòng cân tự động.', 'error');
    }
  };

  const handlePrintAll = () => {
    if (visibleRecords.length === 0) {
      showAppToast('Không có dữ liệu để in theo bộ lọc hiện tại.', 'error');
      return;
    }
    setPrintData(
      buildCanTuDongPrintData(visibleRecords, {
        fromDate,
        toDate,
        ca: 'all',
        productNameByCode
      })
    );
    setPendingPrint(true);
  };

  const handleDownloadExcel = () => {
    if (visibleRecords.length === 0) {
      showAppToast('Không có dữ liệu để tải Excel theo bộ lọc hiện tại.', 'error');
      return;
    }
    try {
      downloadCanTuDongExcel(visibleRecords, {
        fromDate,
        toDate,
        productNameByCode,
        productStandardWeightByCode,
        productCoreWeightByCode,
        productPlasticWeightByCode
      });
      showAppToast(`Đã tải Excel (${visibleRecords.length} dòng).`);
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không thể tải Excel.', 'error');
    }
  };

  const clearFilters = () => {
    setMaSpFilter('all');
    setMaSpQuery('');
    setFromDate('');
    setToDate('');
    setCaFilter('all');
    setOnlyDuplicateQr(false);
  };

  const handleToggleDuplicateQrFilter = () => {
    if (onlyDuplicateQr) {
      setOnlyDuplicateQr(false);
      return;
    }
    if (qrDuplicateInfo.duplicateList.length === 0) {
      showAppToast('Không có mã QR trùng trong bộ lọc hiện tại.', 'error');
      return;
    }
    setOnlyDuplicateQr(true);
    showAppToast(
      `Có ${formatNumber(qrDuplicateInfo.duplicateList.length, 0)} mã QR trùng (${formatNumber(qrDuplicateInfo.duplicateRowCount, 0)} dòng).`
    );
  };

  const handleCopyDuplicateQrCodes = async () => {
    const text = qrDuplicateInfo.duplicateList.map(item => item.qr).join('\n');
    if (!text) {
      showAppToast('Không có mã QR trùng để sao chép.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showAppToast(`Đã sao chép ${qrDuplicateInfo.duplicateList.length} mã QR trùng.`);
    } catch {
      showAppToast('Không sao chép được. Hãy bôi đen mã rồi Ctrl+C.', 'error');
    }
  };

  return (
    <div className="w-full max-w-none space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ef1b2d]/10 text-[#ef1b2d]">
              <Scale className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-black text-zinc-900 sm:text-xl">Cân tự động</h1>
              <p className="text-xs font-semibold text-zinc-500">
                Cân lõi · Cân sản phẩm · Nhựa thực tế · Nhựa định mức · Chênh lệch nhựa ( TT-ĐM) · Phần trăm (= CL ÷ Nhựa TT)
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAutoFillModal}
            disabled={loading || isAutoFilling || isSettingNgay || isBulkDeleting || selectedCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 text-xs font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"
            title={`Điền Ngày = 20/08/2026 · Ca = ${AUTO_FILL_CA} · Lệnh SX = ${AUTO_FILL_LENH_SX} · Máy = ${AUTO_FILL_MAY}`}
          >
            {isAutoFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isAutoFilling ? 'Đang điền...' : 'Tự động điền'}
          </button>
          <button
            type="button"
            onClick={() => void handleBulkSetNgayToday()}
            disabled={
              loading || isSettingNgay || isAutoFilling || isBulkDeleting || visibleRecords.length === 0
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-bold text-sky-900 transition hover:bg-sky-100 disabled:opacity-60"
            title="Đổi cột Ngày của mọi dòng đang hiện (theo bộ lọc Từ/Đến ngày · Ca · Mã SP · QR trùng) thành hôm nay"
          >
            {isSettingNgay ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
            {isSettingNgay ? 'Đang sửa Ngày...' : 'Ngày = hôm nay'}
          </button>
          <button
            type="button"
            onClick={handleDownloadExcel}
            disabled={loading || visibleRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
            title="Tải Excel toàn bộ danh sách"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Tải Excel
          </button>
          <button
            type="button"
            onClick={handlePrintAll}
            disabled={loading || pendingPrint || visibleRecords.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ef1b2d]/30 bg-red-50 px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-100 disabled:opacity-60"
            title="In bảng tổng hợp toàn bộ danh sách"
          >
            {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            In
          </button>
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ef1b2d] px-3 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tải lại
          </button>
        </div>
      </div>

      <TableToolbar
        isLoading={loading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={clearFilters}
      >
        <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} />
        <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
        <FilterCombobox
          label="Ca"
          options={caOptions}
          value={caFilter}
          onChange={setCaFilter}
          searchPlaceholder="Tìm ca..."
          compact
        />
        <TableSearchInput
          value={maSpQuery}
          onChange={value => {
            setMaSpQuery(value);
            if (value.trim()) setMaSpFilter('all');
          }}
          placeholder="Lọc theo Mã SP, QR hoặc tên SP..."
          disabled={loading}
        />
        <FilterCombobox
          label="Mã SP"
          options={maSpOptions}
          value={maSpFilter}
          onChange={value => {
            setMaSpFilter(value);
            if (value !== 'all') setMaSpQuery('');
          }}
          searchPlaceholder="Tìm mã SP..."
          formatOption={code => {
            const name = productNameByCode.get(normalizeProductCodeKey(code));
            return name ? `${code} · ${name}` : code;
          }}
          dropdownWidth="w-max min-w-[16rem] max-w-[min(28rem,calc(100vw-1rem))]"
        />
        <button
          type="button"
          onClick={handleToggleDuplicateQrFilter}
          disabled={loading}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-60 ${
            onlyDuplicateQr
              ? 'border-amber-400 bg-amber-500 text-white hover:bg-amber-600'
              : 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
          }`}
          title={
            qrDuplicateInfo.duplicateList.length > 0
              ? `Có ${qrDuplicateInfo.duplicateList.length} mã QR trùng · ${qrDuplicateInfo.duplicateRowCount} dòng`
              : 'Lọc các dòng có mã QR trùng trong bộ lọc hiện tại'
          }
        >
          {onlyDuplicateQr ? 'Đang lọc QR trùng' : 'Lọc QR trùng'}
          {!loading && qrDuplicateInfo.duplicateList.length > 0 ? (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                onlyDuplicateQr ? 'bg-white/25 text-white' : 'bg-amber-200/80 text-amber-950'
              }`}
            >
              {formatNumber(qrDuplicateInfo.duplicateList.length, 0)}
            </span>
          ) : null}
        </button>
        <span className="text-[11px] font-semibold text-zinc-500">
          {loading
            ? '…'
            : hasActiveFilters
              ? `${formatNumber(visibleRecords.length, 0)} / ${formatNumber(records.length, 0)} dòng`
              : `${formatNumber(records.length, 0)} dòng`}
        </span>
      </TableToolbar>

      {onlyDuplicateQr && qrDuplicateInfo.duplicateList.length > 0 ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 px-3 py-3 shadow-sm sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-amber-950">
                Mã QR trùng · {formatNumber(qrDuplicateInfo.duplicateList.length, 0)} mã ·{' '}
                {formatNumber(qrDuplicateInfo.duplicateRowCount, 0)} dòng
              </p>
              <p className="text-[11px] font-semibold text-amber-800/80">
                Bôi đen mã bên dưới rồi Ctrl+C, hoặc bấm Sao chép tất cả.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyDuplicateQrCodes()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-400 bg-white px-3 text-xs font-bold text-amber-950 transition hover:bg-amber-100"
            >
              <Copy className="h-3.5 w-3.5" />
              Sao chép tất cả
            </button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-white px-2 py-1.5">
            <ul className="space-y-1">
              {qrDuplicateInfo.duplicateList.map(item => (
                <li
                  key={item.qr}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-amber-50 py-1 last:border-0"
                >
                  <code
                    className="select-all break-all font-mono text-xs font-bold text-amber-950"
                    title="Click để bôi đen cả mã, rồi Ctrl+C"
                  >
                    {item.qr}
                  </code>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    ×{item.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-emerald-200 bg-emerald-50/70 shadow-sm">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-emerald-200 bg-emerald-100/80 text-[10px] font-black uppercase tracking-wider text-emerald-900">
              <th className="whitespace-nowrap px-3 py-2.5" title="Số dòng = số lần cân">
                Số lượng
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5"
                title="Tổng cột «Nhựa thực tế» = SP − lõi − bì 0,16"
              >
                Nhựa thực tế
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-teal-900"
                title="Tổng cột «Nhựa định mức» = san_pham.trong_luong_nhua (hoặc TL − lõi − bì)"
              >
                Nhựa định mức
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-rose-900"
                title="Chênh lệch nhựa (TT−ĐM) = Nhựa thực tế − Nhựa định mức"
              >
                Chênh lệch nhựa ( TT-ĐM)
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-sky-900"
                title="Tổng cột «Trọng lượng tiêu chuẩn» = Σ san_pham.tong_trong_luong theo Mã SP từ QR"
              >
                Trọng lượng tiêu chuẩn
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-violet-900"
                title="Tổng cột «Cân sản phẩm» (Trọng lượng TT)"
              >
                Trọng lượng TT
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-sky-900"
                title="Tổng cột «Cân lõi» (trọng lượng lõi thực tế)"
              >
                Tổng trọng lượng lõi
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-amber-900"
                title="Tổng cột «Lõi lý thuyết» = Σ san_pham.trong_luong_loi theo Mã SP từ QR"
              >
                Tổng trọng lượng lõi lý thuyết
              </th>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-orange-900"
                title="Chênh lệch lõi = Tổng trọng lượng lõi − Tổng trọng lượng lõi lý thuyết (thực tế − LT)"
              >
                Chênh lệch lõi
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-mono text-sm font-black text-emerald-950">
              <td className="whitespace-nowrap px-3 py-3">
                {loading ? '…' : formatNumber(trongLuongNhuaTotals.quantity, 0)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-emerald-800">
                {loading ? '…' : `${formatNumber(trongLuongNhuaTotals.weightKg, 2)} kg`}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-teal-900">
                {loading ? '…' : `${formatNumber(nhuaDinhMucTotals.weightKg, 2)} kg`}
              </td>
              <td
                className={`whitespace-nowrap px-3 py-3 ${
                  loading
                    ? 'text-zinc-500'
                    : chenhLechNhuaTotals.weightKg > 0
                      ? 'text-emerald-800'
                      : chenhLechNhuaTotals.weightKg < 0
                        ? 'text-rose-700'
                        : 'text-zinc-800'
                }`}
              >
                {loading
                  ? '…'
                  : `${chenhLechNhuaTotals.weightKg > 0 ? '+' : ''}${formatNumber(chenhLechNhuaTotals.weightKg, 2)} kg`}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-sky-900">
                {loading ? '…' : `${formatNumber(nhuaTieuChuanTotals.weightKg, 2)} kg`}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-violet-900">
                {loading ? '…' : `${formatNumber(trongLuongTtTotals.weightKg, 2)} kg`}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-sky-900">
                {loading ? '…' : `${formatNumber(tongTrongLuongLoiTotals.weightKg, 2)} kg`}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-amber-900">
                {loading ? '…' : `${formatNumber(loiTieuChuanTotals.weightKg, 2)} kg`}
              </td>
              <td
                className={`whitespace-nowrap px-3 py-3 ${
                  loading
                    ? 'text-zinc-500'
                    : chenhLechLoiTotals.weightKg > 0
                      ? 'text-emerald-800'
                      : chenhLechLoiTotals.weightKg < 0
                        ? 'text-rose-700'
                        : 'text-zinc-800'
                }`}
              >
                {loading
                  ? '…'
                  : `${chenhLechLoiTotals.weightKg > 0 ? '+' : ''}${formatNumber(chenhLechLoiTotals.weightKg, 2)} kg`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-800">
            Phân tích
          </h2>
          <p className="text-[11px] font-semibold text-zinc-500">
            {diffFilter === 'gt-2pct'
              ? `So Nhựa thực tế với Nhựa định mức · % = CL ÷ Nhựa TT · ngưỡng ${PHAN_TICH_NGUONG_PCT}%`
              : diffFilter === 'all-diff'
                ? 'So Nhựa thực tế với Nhựa định mức · tất cả chênh lệch (không lọc 2%)'
                : 'Hiển thị toàn bộ dòng cân tự động'}
            {maSpFilter !== 'all' ? ` · Mã SP ${maSpFilter}` : ''}
            {maSpQuery.trim() ? ` · tìm «${maSpQuery.trim()}»` : ''}
            {fromDate || toDate
              ? ` · Ngày ${fromDate ? formatIsoDateVi(fromDate) : '…'} → ${toDate ? formatIsoDateVi(toDate) : '…'}`
              : ''}
            {!loading && phanTichCan.comparedRows > 0
              ? ` · ${formatNumber(phanTichCan.comparedRows, 0)} dòng có chênh lệch nhựa`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
            Bộ lọc danh sách
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setDiffFilter('all')}
              className={`h-9 rounded-xl border px-3 text-xs font-bold transition ${
                diffFilter === 'all'
                  ? 'border-violet-300 bg-violet-600 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
              }`}
              title="Hiện toàn bộ dòng cân tự động"
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setDiffFilter('all-diff')}
              className={`h-9 rounded-xl border px-3 text-xs font-bold transition ${
                diffFilter === 'all-diff'
                  ? 'border-violet-300 bg-violet-600 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
              }`}
              title="Hiện mọi dòng có chênh lệch; bảng Phân tích không tách theo 2%"
            >
              Tất cả chênh lệch
            </button>
            <button
              type="button"
              onClick={() => setDiffFilter('gt-2pct')}
              className={`h-9 rounded-xl border px-3 text-xs font-bold transition ${
                diffFilter === 'gt-2pct'
                  ? 'border-violet-300 bg-violet-600 text-white'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
              }`}
              title={`Chỉ hiện dòng |%| > ${PHAN_TICH_NGUONG_PCT}%; bảng Phân tích tách theo ngưỡng ${PHAN_TICH_NGUONG_PCT}%`}
            >
              So sánh với {PHAN_TICH_NGUONG_PCT}%
            </button>
          </div>
          <span className="ml-auto text-[11px] font-semibold text-zinc-500">
            {loading
              ? '…'
              : `Đang xem ${formatNumber(visibleRecords.length, 0)} / ${formatNumber(records.length, 0)} dòng`}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              {
                key: 'kem',
                title: 'Kém cân',
                hint: 'Nhựa thực tế < Nhựa định mức',
                tone: 'rose' as const,
                stats: phanTichCan.kem
              },
              {
                key: 'hon',
                title: 'Hơn cân',
                hint: 'Nhựa thực tế > Nhựa định mức',
                tone: 'emerald' as const,
                stats: phanTichCan.hon
              }
            ] as const
          ).map(card => {
            const border =
              card.tone === 'rose' ? 'border-rose-200 bg-rose-50/60' : 'border-emerald-200 bg-emerald-50/60';
            const titleColor = card.tone === 'rose' ? 'text-rose-900' : 'text-emerald-900';
            const muted = card.tone === 'rose' ? 'text-rose-700/80' : 'text-emerald-700/80';
            const value = card.tone === 'rose' ? 'text-rose-950' : 'text-emerald-950';
            const showBy2Pct = diffFilter === 'gt-2pct';
            return (
              <div key={card.key} className={`overflow-hidden rounded-2xl border ${border}`}>
                <div className="border-b border-black/5 px-4 py-2.5">
                  <p className={`text-sm font-black ${titleColor}`}>{card.title}</p>
                  <p className={`text-[10px] font-semibold ${muted}`}>{card.hint}</p>
                </div>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-black/5 bg-white/50 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-2 font-black">Chỉ số</th>
                      <th className="px-4 py-2 text-right font-black">Giá trị</th>
                    </tr>
                  </thead>
                  <tbody className={`font-bold ${value}`}>
                    {showBy2Pct ? (
                      <>
                        <tr className="border-b border-black/5 bg-white/40">
                          <td className="px-4 py-2.5" title={`|Phần trăm| ≤ ${PHAN_TICH_NGUONG_PCT}%`}>
                            Số dòng ≤{PHAN_TICH_NGUONG_PCT}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {loading ? '…' : formatNumber(card.stats.rowsLe2Pct, 0)}
                          </td>
                        </tr>
                        <tr className="border-b border-black/5 bg-white/40">
                          <td className="px-4 py-2.5" title={`|Phần trăm| > ${PHAN_TICH_NGUONG_PCT}%`}>
                            Số dòng &gt;{PHAN_TICH_NGUONG_PCT}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {loading ? '…' : formatNumber(card.stats.rowsGt2Pct, 0)}
                          </td>
                        </tr>
                        <tr className="bg-white/40">
                          <td
                            className="px-4 py-2.5"
                            title={`Tổng |Chênh lệch nhựa| (cột Chênh lệch nhựa TT−ĐM) của dòng |%| > ${PHAN_TICH_NGUONG_PCT}%`}
                          >
                            Chênh lệch nhựa &gt;{PHAN_TICH_NGUONG_PCT}%
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {loading
                              ? '…'
                              : card.stats.weightDiffGt2Kg > 0
                                ? `${formatNumber(card.stats.weightDiffGt2Kg, 3)} kg`
                                : '0 kg'}
                          </td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b border-black/5 bg-white/40">
                          <td className="px-4 py-2.5" title="Tổng số dòng có chênh lệch nhựa trong nhóm">
                            Số dòng
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {loading ? '…' : formatNumber(card.stats.rowCount, 0)}
                          </td>
                        </tr>
                        <tr className="bg-white/40">
                          <td
                            className="px-4 py-2.5"
                            title="Tổng |Chênh lệch nhựa| = Σ |Nhựa thực tế − Nhựa định mức| (cột Chênh lệch nhựa TT−ĐM)"
                          >
                            Chênh lệch nhựa
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {loading
                              ? '…'
                              : card.stats.weightDiffAllKg > 0
                                ? `${formatNumber(card.stats.weightDiffAllKg, 3)} kg`
                                : '0 kg'}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
          <p className="mr-auto text-xs font-bold text-rose-800">Đã chọn {selectedCount} dòng</p>
          <button
            type="button"
            onClick={openAutoFillModal}
            disabled={isAutoFilling || isSettingNgay || isBulkDeleting}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-600 px-3 text-xs font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
            title={`Ngày = 20/08/2026 · Ca = ${AUTO_FILL_CA} · Lệnh SX = ${AUTO_FILL_LENH_SX} · Máy = ${AUTO_FILL_MAY}`}
          >
            {isAutoFilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isAutoFilling ? 'Đang điền...' : 'Tự động điền'}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={isBulkDeleting || isAutoFilling || isSettingNgay}
            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={() => void handleBulkDelete()}
            disabled={isBulkDeleting || isAutoFilling || isSettingNgay}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {isBulkDeleting ? 'Đang xóa...' : `Xóa đã chọn (${selectedCount})`}
          </button>
        </div>
      ) : null}

      <TableShell minWidthClassName="min-w-[2360px]">
        <TableHead>
          <TableHeadCell className="w-10 text-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={loading || visibleIds.length === 0 || isBulkDeleting}
              aria-label="Chọn tất cả dòng đang xem"
              className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
            />
          </TableHeadCell>
          <TableHeadCell>Ảnh lõi</TableHeadCell>
          <TableHeadCell>Ảnh sản phẩm</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Ngày nghiệp vụ (SOURCE_DATE / work_date), không dùng ngày cân"
          >
            Ngày
          </TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Ca</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="metadata.machine / SOURCE_MACHINE"
          >
            Máy
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="metadata.production_order / SOURCE_PRODUCTION_ORDER"
          >
            Lệnh SX
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Mã sản phẩm lấy từ QR"
          >
            Mã SP
          </TableHeadCell>
          <TableHeadCell>QR</TableHeadCell>
          <TableHeadCell title="weight — còn lõi" className="whitespace-nowrap">
            Cân sản phẩm
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.tong_trong_luong (Tổng TL / Khối lượng) theo Mã SP từ QR"
          >
            Trọng lượng tiêu chuẩn
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Trọng lượng TT = cột Cân sản phẩm (weight / can_san_pham)"
          >
            Trọng lượng TT
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Nhựa thực tế = Cân SP − Cân lõi − Trọng lượng bì"
          >
            Nhựa thực tế
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.trong_luong_nhua; không có thì TL tiêu chuẩn − lõi LT − bì"
          >
            Nhựa định mức
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Chênh lệch nhựa (TT−ĐM) = Nhựa thực tế − Nhựa định mức"
          >
            Chênh lệch nhựa ( TT-ĐM)
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Phần trăm = (Chênh lệch nhựa ÷ Nhựa thực tế) × 100%"
          >
            Phần trăm
          </TableHeadCell>
          <TableHeadCell title="tare_weight">Cân lõi</TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="san_pham.trong_luong_loi (Trọng lượng lõi lý thuyết) theo Mã SP từ QR"
          >
            Lõi lý thuyết
          </TableHeadCell>
          <TableHeadCell
            className="whitespace-nowrap"
            title="Chênh lệch lõi = Cân lõi − Lõi lý thuyết (thực tế − LT)"
          >
            Chênh lệch lõi
          </TableHeadCell>
          <TableHeadCell title={`Mặc định ${DEFAULT_CAN_TU_DONG_BI_KG} kg`}>
            Trọng lượng bì
          </TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell>Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={22}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải cân tự động…
              </span>
            </TableEmptyRow>
          ) : visibleRecords.length === 0 ? (
            <TableEmptyRow colSpan={22}>
              {records.length === 0
                ? 'Không có bản ghi cân tự động.'
                : hasDateFilters && recordsByDate.length === 0
                  ? `Không có dòng nào trong khoảng ngày${fromDate ? ` từ ${formatIsoDateVi(fromDate)}` : ''}${toDate ? ` đến ${formatIsoDateVi(toDate)}` : ''}.`
                  : hasCaFilter && recordsByCa.length === 0
                    ? `Không có dòng nào với Ca ${caFilter}.`
                    : onlyDuplicateQr
                      ? 'Không có mã QR trùng trong bộ lọc hiện tại.'
                      : hasMaSpFilters && recordsByMaSp.length === 0
                        ? maSpFilter !== 'all'
                          ? `Không có dòng nào với Mã SP ${maSpFilter}.`
                          : `Không có dòng khớp «${maSpQuery.trim()}».`
                        : diffFilter === 'gt-2pct'
                          ? `Không có dòng nào có |Phần trăm| > ${PHAN_TICH_NGUONG_PCT}%.`
                          : diffFilter === 'all-diff'
                            ? 'Không có dòng nào có chênh lệch nhựa (TT−ĐM).'
                            : 'Không có bản ghi cân tự động.'}
            </TableEmptyRow>
          ) : (
            visibleRecords.map(row => {
              const idKey = rowIdKey(row.id);
              const coreUrl = resolveCoreImageUrl(row);
              const productUrl = resolveProductImageUrl(row);
              const coreTitle = `Ảnh cân lõi · ${row.qr_code || row.event_id || row.id}`;
              const productTitle = `Ảnh cân sản phẩm · ${row.qr_code || row.event_id || row.id}`;
              const canLoi = row.can_loi ?? row.tare_weight;
              const canSp = row.can_san_pham ?? row.weight;
              const trongLuongBi = resolveTrongLuongBiKg(row);
              const trongLuongNhua = resolveTrongLuongNhuaKg(row);
              const ngay = resolveCanTuDongBusinessDate(row);
              const may =
                String(row.may ?? row.machine ?? '').trim() || resolveCanTuDongMachine(row) || '';
              const lenhSx =
                String(row.lenh_sx ?? row.ma_lenh_sx ?? '').trim() ||
                resolveCanTuDongProductionOrder(row) ||
                '';
              const maSp = parseCanTuDongQrProductCode(row.qr_code);
              const maSpKey = normalizeProductCodeKey(maSp);
              const qrKey = normalizeQrKey(row.qr_code);
              const isDuplicateQr = Boolean(qrKey && qrDuplicateInfo.duplicateKeys.has(qrKey));
              const trongLuongTieuChuan =
                (maSpKey && productStandardWeightByCode.get(maSpKey)) || null;
              const loiTieuChuan =
                (maSpKey && productCoreWeightByCode.get(maSpKey)) || null;
              const nhuaDinhMuc = resolveNhuaDinhMucKg(
                trongLuongTieuChuan,
                loiTieuChuan,
                maSpKey ? productPlasticWeightByCode.get(maSpKey) : null
              );
              const chenhLechNhua =
                trongLuongNhua !== null && nhuaDinhMuc != null ? trongLuongNhua - nhuaDinhMuc : null;
              const { phanTram } = resolveNhuaChenhLechVaPhanTram(trongLuongNhua, nhuaDinhMuc);
              const canLoiNum = asWeightNumber(canLoi);
              const chenhLechLoi =
                canLoiNum != null && loiTieuChuan != null ? canLoiNum - loiTieuChuan : null;
              return (
                <TableRow key={idKey}>
                  <td className="px-4 py-3 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(idKey)}
                      onChange={() => toggleSelected(idKey)}
                      disabled={isBulkDeleting}
                      aria-label={`Chọn dòng ${idKey}`}
                      className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={coreUrl}
                      title={coreTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: coreUrl, title: coreTitle })}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ImageCell
                      url={productUrl}
                      title={productTitle}
                      emptyLabel="Chưa có"
                      onView={() => setViewingImage({ url: productUrl, title: productTitle })}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-900">
                    {formatIsoDateVi(ngay)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-sky-900">
                    {row.ca || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-amber-900">
                    {may || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-violet-900">
                    {lenhSx || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-sky-950">
                    {maSp || '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-mono font-bold ${
                      isDuplicateQr
                        ? 'bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-300'
                        : 'text-zinc-900'
                    }`}
                    title={isDuplicateQr ? 'Mã QR trùng — click để bôi đen, Ctrl+C để copy' : undefined}
                  >
                    {qrKey ? (
                      <code className="select-all break-all">{row.qr_code}</code>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-800">
                    {formatWeight(canSp, row.unit, 6)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-indigo-900"
                    title={maSp ? `Mã SP: ${maSp}` : undefined}
                  >
                    {trongLuongTieuChuan != null
                      ? formatWeight(trongLuongTieuChuan, 'kg', 3)
                      : '—'}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-violet-900"
                    title="Trọng lượng TT = Cân sản phẩm"
                  >
                    {formatWeight(canSp, row.unit, 6)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-black text-emerald-800"
                    title="Nhựa thực tế = Cân SP − Cân lõi − Bì"
                  >
                    {trongLuongNhua !== null ? formatWeight(trongLuongNhua, row.unit, 2) : '—'}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-teal-900"
                    title={maSp ? `Nhựa định mức · Mã SP: ${maSp}` : 'Nhựa định mức từ sản phẩm'}
                  >
                    {nhuaDinhMuc != null ? formatWeight(nhuaDinhMuc, 'kg', 3) : '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      chenhLechNhua == null
                        ? 'text-zinc-400'
                        : chenhLechNhua > 0
                          ? 'text-emerald-800'
                          : chenhLechNhua < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Chênh lệch nhựa (TT−ĐM) = Nhựa thực tế − Nhựa định mức"
                  >
                    {chenhLechNhua == null
                      ? '—'
                      : `${chenhLechNhua > 0 ? '+' : ''}${formatWeight(chenhLechNhua, row.unit, 3)}`}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      phanTram == null
                        ? 'text-zinc-400'
                        : phanTram > 0
                          ? 'text-emerald-800'
                          : phanTram < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Phần trăm = (Chênh lệch nhựa ÷ Nhựa thực tế) × 100%"
                  >
                    {formatSignedPercent(phanTram)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-sky-800">
                    {formatWeight(canLoi, row.unit, 6)}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-3 font-semibold text-amber-900"
                    title={maSp ? `Lõi lý thuyết · Mã SP: ${maSp}` : 'Lõi lý thuyết từ sản phẩm'}
                  >
                    {loiTieuChuan != null ? formatWeight(loiTieuChuan, 'kg', 3) : '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 font-bold tabular-nums ${
                      chenhLechLoi == null
                        ? 'text-zinc-400'
                        : chenhLechLoi > 0
                          ? 'text-emerald-800'
                          : chenhLechLoi < 0
                            ? 'text-rose-700'
                            : 'text-zinc-800'
                    }`}
                    title="Chênh lệch lõi = Cân lõi − Lõi lý thuyết"
                  >
                    {chenhLechLoi == null
                      ? '—'
                      : `${chenhLechLoi > 0 ? '+' : ''}${formatWeight(chenhLechLoi, row.unit, 3)}`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatWeight(trongLuongBi, row.unit, 2)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {row.status || '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-bold text-sky-700 hover:bg-sky-100"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRow(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Xóa
                      </button>
                    </div>
                  </td>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableShell>

      {showAutoFillModal ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="can-tu-dong-autofill-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 id="can-tu-dong-autofill-title" className="text-base font-black text-zinc-950">
                  Tự động điền
                </h3>
                <p className="text-xs font-semibold text-zinc-500">
                  Điền cho {selectedCount} dòng đã chọn
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoFillModal(false)}
                disabled={isAutoFilling}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
                <p>• Ngày = 20/08/2026</p>
                <p>• Ca = {AUTO_FILL_CA}</p>
                <p>• Lệnh SX = {AUTO_FILL_LENH_SX}</p>
                <p>• Máy = {AUTO_FILL_MAY}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowAutoFillModal(false)}
                disabled={isAutoFilling}
                className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700 disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleAutoFillSelected()}
                disabled={isAutoFilling}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-extrabold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {isAutoFilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isAutoFilling ? 'Đang điền...' : 'Điền tất cả đã chọn'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingRecord ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <h3 className="text-base font-black text-zinc-950">Sửa dòng cân tự động</h3>
                <p className="text-xs font-semibold text-zinc-500">ID: {editingRecord.id}</p>
              </div>
              <button type="button" onClick={() => setEditingRecord(null)} disabled={isSavingEdit} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {([
                ['qr_code', 'Mã QR'], ['ca', 'Ca'], ['tare_weight', 'Cân lõi'],
                ['weight', 'Cân sản phẩm'], ['unit', 'Đơn vị'], ['device_id', 'Thiết bị'], ['status', 'Trạng thái']
              ] as const).map(([key, label]) => (
                <label key={key} className={key === 'qr_code' ? 'sm:col-span-2' : ''}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</span>
                  <input
                    value={editForm[key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [key]: e.target.value }))}
                    inputMode={key === 'tare_weight' || key === 'weight' ? 'decimal' : undefined}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold outline-none focus:border-[#ef1b2d]"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
              <button type="button" onClick={() => setEditingRecord(null)} disabled={isSavingEdit} className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-bold text-zinc-700">Hủy</button>
              <button type="button" onClick={() => void handleSaveEdit()} disabled={isSavingEdit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white disabled:opacity-60">
                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />

      {pendingPrint && printData
        ? createPortal(<CanTuDongPrintBatch data={printData} />, document.body)
        : null}
    </div>
  );
}

export default CanTuDongPanel;
