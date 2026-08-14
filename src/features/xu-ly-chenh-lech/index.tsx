import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, BarChart3, ArrowDownToLine, Check, Search, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge
} from '../../components/shared/table';

type DotGroup = {
  dot_kiem_kho: string;
  ngay_bat_dau: string | null;
  thoi_gian_xac_nhan: string | null;
  da_xac_nhan: boolean;
  so_dong: number;
  thu_tu_trong_ngay: number;
  tong_dot_trong_ngay: number;
};

type TrangThaiChenhLech = 'khop' | 'thua' | 'thieu' | 'khong_xac_dinh';
type DetailPresenceFilter = 'all' | 'he-thong' | 'kiem-ke' | 'ca-hai';

const DETAIL_PRESENCE_OPTIONS: Exclude<DetailPresenceFilter, 'all'>[] = ['he-thong', 'kiem-ke', 'ca-hai'];

function formatDetailPresenceFilter(value: string) {
  if (value === 'he-thong') return 'Có trên hệ thống';
  if (value === 'kiem-ke') return 'Có trên kiểm kê';
  return 'Có trên cả 2';
}

/** 1 dòng = 1 mã (ma_nvl) đã gộp — chỉ dùng cho tab "Bảng tổng hợp". */
type ChenhLechRow = {
  ma_nvl: string;
  ten_sp: string;
  loai_sp: string | null;
  loai_kho: 'san_pham' | null;
  don_vi: string | null;
  ten_kho: string | null;
  ton_thuc_te: number;
  ton_he_thong: number | null;
  chenh_lech: number | null;
  trang_thai: TrangThaiChenhLech;
  da_xu_ly: boolean;
  trang_thai_xu_ly: 'chua_xu_ly' | 'dang_xu_ly' | 'da_xu_ly' | 'khong_can_xu_ly';
  ma_phieu_dieu_chinh: string | null;
};

/** 1 dòng = 1 lượt quét thực tế — dùng cho tab "Danh sách chi tiết". */
type KiemKhoDetailRow = {
  id: number | string;
  ma_nvl: string;
  ma_sp: string;
  ten_sp: string;
  loai_sp: string | null;
  ten_kho: string | null;
  ngay_gio_kiem_kho: string | null;
  nguoi_kiem_kho: string | null;
};

type WarehouseCatalogItem = { id: string | number; ten_kho: string };

/** 1 dòng hệ thống CHƯA gộp theo tiền tố mã (từng lô/hậu tố riêng) — dùng để giải thích số chênh lệch đã gộp. */
type HeThongChiTietRow = {
  ma: string;
  ma_goc: string;
  ten: string;
  loai_kho: 'san_pham';
  don_vi: string | null;
  ten_kho: string | null;
  ton_cuoi_ky: number;
};

/**
 * 1 dòng ở tab "Phiếu điều chỉnh" = 1 mã sản phẩm nguyên bản, gồm đầy đủ hậu tố lô/serial.
 * Bảng tổng hợp vẫn gom theo tiền tố; chỉ tab này và phiếu kho dùng mã nguyên bản.
 */
type PendingRow = {
  ma_sp: string;
  ma_goc: string;
  ten_sp: string;
  ten_kho: string | null;
  loai_kho: 'san_pham';
  ton_he_thong: number;
  ton_kiem_ke: number;
  chenh_lech: number;
  loai_phieu: 'nhap' | 'xuat' | null;
  so_luong: number;
  da_xu_ly: boolean;
  ma_phieu_dieu_chinh: string | null;
};

type XuLyChiTietRow = {
  ma_sp: string;
  loai_phieu: 'nhap' | 'xuat' | null;
  ma_phieu_dieu_chinh: string | null;
};

/** 1 dòng đối chiếu — mỗi lượt kiểm kê thực tế (không gộp), có khớp được danh mục tồn kho hệ thống hay không. */
type ReconciliationRow = {
  key: string;
  ma_hang: string;
  ma_da_kiem: string;
  ten: string;
  loai: string | null;
  ten_kho: string | null;
  co_he_thong: boolean;
  co_kiem_ke: boolean;
};

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function formatDotLabel(
  startIso: string | null,
  confirmIso?: string | null,
  dayOrdinal?: number,
  sameDayCount?: number
) {
  const start = startIso ? new Date(startIso) : null;
  if (!start || Number.isNaN(start.getTime())) return startIso || '—';
  const startDay = `${start.getDate()}/${start.getMonth() + 1}`;
  const yy = String(start.getFullYear()).slice(-2);
  const confirm = confirmIso ? new Date(confirmIso) : null;
  const endDay = confirm && !Number.isNaN(confirm.getTime()) ? `${confirm.getDate()}/${confirm.getMonth() + 1}` : '...';
  const ordinalSuffix = Number(sameDayCount) > 1 ? ` - ${Math.max(1, Number(dayOrdinal) || 1)}` : '';
  return `T${start.getMonth() + 1}/${yy} (${startDay}-${endDay})${ordinalSuffix}`;
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
    minute: '2-digit'
  });
}

function formatQty(value: number | null) {
  if (value === null) return '—';
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function formatLoaiKho(value: string | null) {
  if (value === 'san_pham') return 'Thành phẩm';
  return '—';
}

function xuLyChenhLechBadge(row: ChenhLechRow) {
  if (row.chenh_lech === 0) return <StatusBadge label="Không cần xử lý" color="zinc" />;
  if (row.trang_thai_xu_ly === 'dang_xu_ly') return <StatusBadge label="Đang xử lý" color="sky" />;
  if (row.da_xu_ly) return <StatusBadge label="Đã xử lý" color="emerald" />;
  return <StatusBadge label="Chưa xử lý" color="amber" />;
}

function normalizeDotGroups(data: unknown): DotGroup[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return records
    .map((item): DotGroup | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const dot = String(r.dot_kiem_kho ?? '').trim();
      if (!dot) return null;
      return {
        dot_kiem_kho: dot,
        ngay_bat_dau: r.ngay_bat_dau ? String(r.ngay_bat_dau) : null,
        thoi_gian_xac_nhan: r.thoi_gian_xac_nhan ? String(r.thoi_gian_xac_nhan) : null,
        da_xac_nhan: Boolean(r.da_xac_nhan),
        so_dong: Number(r.so_dong) || 0,
        thu_tu_trong_ngay: Number(r.thu_tu_trong_ngay) || 1,
        tong_dot_trong_ngay: Number(r.tong_dot_trong_ngay) || 1
      };
    })
    .filter((item): item is DotGroup => Boolean(item));
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

function normalizeChenhLechRows(data: unknown): ChenhLechRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return records
    .map((item): ChenhLechRow | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const ma = String(r.ma_nvl ?? '').trim();
      if (!ma) return null;
      const loaiKho = r.loai_kho === 'san_pham' ? 'san_pham' : null;
      const trangThai: TrangThaiChenhLech =
        r.trang_thai === 'thua' || r.trang_thai === 'thieu' || r.trang_thai === 'khong_xac_dinh'
          ? r.trang_thai
          : 'khop';
      return {
        ma_nvl: ma,
        ten_sp: String(r.ten_sp ?? '').trim() || ma,
        loai_sp: r.loai_sp ? String(r.loai_sp).trim() : null,
        loai_kho: loaiKho,
        don_vi: r.don_vi ? String(r.don_vi).trim() : null,
        ten_kho: r.ten_kho ? String(r.ten_kho).trim() : null,
        ton_thuc_te: Number(r.ton_thuc_te) || 0,
        ton_he_thong: r.ton_he_thong === null || r.ton_he_thong === undefined ? null : Number(r.ton_he_thong),
        chenh_lech: r.chenh_lech === null || r.chenh_lech === undefined ? null : Number(r.chenh_lech),
        trang_thai: trangThai,
        da_xu_ly: Boolean(r.da_xu_ly),
        trang_thai_xu_ly:
          r.trang_thai_xu_ly === 'dang_xu_ly' || r.trang_thai_xu_ly === 'da_xu_ly' || r.trang_thai_xu_ly === 'khong_can_xu_ly'
            ? r.trang_thai_xu_ly
            : 'chua_xu_ly',
        ma_phieu_dieu_chinh: r.ma_phieu_dieu_chinh ? String(r.ma_phieu_dieu_chinh) : null
      };
    })
    .filter((item): item is ChenhLechRow => Boolean(item));
}

function normalizeXuLyChiTiet(data: unknown): XuLyChiTietRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { xu_ly_chi_tiet?: unknown }).xu_ly_chi_tiet)
      ? (data as { xu_ly_chi_tiet: unknown[] }).xu_ly_chi_tiet
      : [];
  return records
    .map((item): XuLyChiTietRow | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const maSp = String(row.ma_sp ?? '').trim();
      if (!maSp) return null;
      return {
        ma_sp: maSp,
        loai_phieu: row.loai_phieu === 'nhap' || row.loai_phieu === 'xuat' ? row.loai_phieu : null,
        ma_phieu_dieu_chinh: row.ma_phieu_dieu_chinh ? String(row.ma_phieu_dieu_chinh) : null
      };
    })
    .filter((item): item is XuLyChiTietRow => Boolean(item));
}

function normalizeHeThongChiTiet(data: unknown): HeThongChiTietRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { he_thong_chi_tiet?: unknown }).he_thong_chi_tiet)
      ? (data as { he_thong_chi_tiet: unknown[] }).he_thong_chi_tiet
      : [];
  return records
    .map((item): HeThongChiTietRow | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const ma = String(r.ma ?? '').trim();
      if (!ma) return null;
      return {
        ma,
        ma_goc: String(r.ma_goc ?? ma).trim() || ma,
        ten: String(r.ten ?? '').trim() || ma,
        loai_kho: 'san_pham',
        don_vi: r.don_vi ? String(r.don_vi).trim() : null,
        ten_kho: r.ten_kho ? String(r.ten_kho).trim() : null,
        ton_cuoi_ky: Number(r.ton_cuoi_ky) || 0
      };
    })
    .filter((item): item is HeThongChiTietRow => Boolean(item));
}

function normalizeDetailLines(data: unknown): KiemKhoDetailRow[] {
  const records =
    data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return records
    .map((item): KiemKhoDetailRow | null => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const maSp = String(r.ma_sp ?? '').trim();
      if (!maSp) return null;
      return {
        id: (r.id as number | string) ?? maSp,
        ma_nvl: String(r.ma_nvl ?? '').trim(),
        ma_sp: maSp,
        ten_sp: String(r.ten_sp ?? '').trim() || maSp,
        loai_sp: r.loai_sp ? String(r.loai_sp).trim() : null,
        ten_kho: r.ten_kho ? String(r.ten_kho).trim() : null,
        ngay_gio_kiem_kho: r.ngay_gio_kiem_kho ? String(r.ngay_gio_kiem_kho) : null,
        nguoi_kiem_kho: r.nguoi_kiem_kho ? String(r.nguoi_kiem_kho) : null
      };
    })
    .filter((item): item is KiemKhoDetailRow => Boolean(item));
}

export function XuLyChenhLechPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { name?: string | null } | null;
}) {
  const { canCreate } = useTabAccess('kiem-kho-chenh-lech');
  const loginName = String(currentUser?.name ?? '').trim();

  const [view, setView] = useState<'chi-tiet' | 'tong-hop' | 'phieu-dieu-chinh'>('chi-tiet');

  const [allBatches, setAllBatches] = useState<DotGroup[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [selectedDot, setSelectedDot] = useState('');

  const [warehouses, setWarehouses] = useState<WarehouseCatalogItem[]>([]);
  const [tenKho, setTenKho] = useState('all');

  // Bảng tổng hợp (gộp theo mã) — nguồn đối chiếu kiểm kê vs tồn hệ thống.
  const [rows, setRows] = useState<ChenhLechRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState('');
  const [meta, setMeta] = useState<{ da_chot: boolean; ngay_bat_dau: string | null; chot_luc: string | null } | null>(
    null
  );
  const [heThongChiTiet, setHeThongChiTiet] = useState<HeThongChiTietRow[]>([]);
  const [xuLyChiTiet, setXuLyChiTiet] = useState<XuLyChiTietRow[]>([]);

  // Danh sách chi tiết — từng lượt quét thực tế của đợt.
  const [detailLines, setDetailLines] = useState<KiemKhoDetailRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [searchText, setSearchText] = useState('');
  const [detailPresenceFilter, setDetailPresenceFilter] = useState<DetailPresenceFilter>('all');
  const [chiHienChenhLech, setChiHienChenhLech] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [creatingSlips, setCreatingSlips] = useState(false);
  const [adjustmentDate, setAdjustmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adjustmentSearchText, setAdjustmentSearchText] = useState('');
  const [showAdjustmentSuggestions, setShowAdjustmentSuggestions] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch('/api/kiem-kho/dot');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách đợt kiểm kho.'));
      const records = normalizeDotGroups(data);
      const confirmedRecords = records.filter(batch => batch.da_xac_nhan);
      setAllBatches(records);
      setSelectedDot(prev =>
        prev && confirmedRecords.some(batch => batch.dot_kiem_kho === prev)
          ? prev
          : confirmedRecords[0]?.dot_kiem_kho ?? ''
      );
    } catch (err: any) {
      setAllBatches([]);
      showAppToast(err?.message || 'Không tải được danh sách đợt kiểm kho.', 'error');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch('/api/quan-ly-kho');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh mục kho.'));
      setWarehouses(normalizeWarehouseCatalog(data));
    } catch (err: any) {
      setWarehouses([]);
      showAppToast(err?.message || 'Không tải được danh mục kho.', 'error');
    }
  }, []);

  useEffect(() => {
    void loadBatches();
    void loadWarehouses();
  }, [loadBatches, loadWarehouses]);

  const loadRows = useCallback(async (dot: string, kho: string) => {
    if (!dot) {
      setRows([]);
      setMeta(null);
      return;
    }
    setLoadingRows(true);
    setRowsError('');
    try {
      const params = new URLSearchParams();
      params.set('dotKiemKho', dot);
      if (kho !== 'all') params.set('tenKho', kho);
      const res = await fetch(`/api/kiem-kho/chenh-lech?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được dữ liệu đối chiếu chênh lệch.'));
      setRows(normalizeChenhLechRows(data));
      setHeThongChiTiet(normalizeHeThongChiTiet(data));
      setXuLyChiTiet(normalizeXuLyChiTiet(data));
      setMeta({
        da_chot: Boolean((data as any)?.da_chot),
        ngay_bat_dau: (data as any)?.ngay_bat_dau ?? null,
        chot_luc: (data as any)?.chot_luc ?? null
      });
    } catch (err: any) {
      setRows([]);
      setHeThongChiTiet([]);
      setXuLyChiTiet([]);
      setMeta(null);
      const text = err?.message || 'Không tải được dữ liệu đối chiếu chênh lệch.';
      setRowsError(text);
      showAppToast(text, 'error');
    } finally {
      setLoadingRows(false);
    }
  }, []);

  const loadDetailLines = useCallback(async (dot: string, kho: string) => {
    if (!dot) {
      setDetailLines([]);
      return;
    }
    setLoadingDetail(true);
    setDetailError('');
    try {
      const params = new URLSearchParams();
      params.set('dotKiemKho', dot);
      params.set('limit', '500');
      if (kho !== 'all') params.set('tenKho', kho);
      const res = await fetch(`/api/kiem-kho?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách chi tiết đã kiểm kê.'));
      setDetailLines(normalizeDetailLines(data));
    } catch (err: any) {
      setDetailLines([]);
      const text = err?.message || 'Không tải được danh sách chi tiết đã kiểm kê.';
      setDetailError(text);
      showAppToast(text, 'error');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedDot) return;
    void loadRows(selectedDot, tenKho);
    void loadDetailLines(selectedDot, tenKho);
    setSelectedKeys(new Set());
  }, [selectedDot, tenKho, loadRows, loadDetailLines]);

  const selectedDotGroup = useMemo(
    () => allBatches.find(b => b.dot_kiem_kho === selectedDot) ?? null,
    [allBatches, selectedDot]
  );
  const confirmedBatches = useMemo(() => allBatches.filter(batch => batch.da_xac_nhan), [allBatches]);

  const warehouseOptions = useMemo(() => warehouses.map(w => w.ten_kho), [warehouses]);

  // "Có trên hệ thống" phải khớp đúng mã đã quét, gồm cả hậu tố lô/serial.
  // Chỉ coi là có khi mã đó còn tồn dương trong kho tại thời điểm đối chiếu.
  const heThongByFullCode = useMemo(() => {
    const result = new Map<string, HeThongChiTietRow[]>();
    for (const row of heThongChiTiet) {
      if (row.ton_cuoi_ky <= 0) continue;
      const matches = result.get(row.ma) || [];
      matches.push(row);
      result.set(row.ma, matches);
    }
    return result;
  }, [heThongChiTiet]);

  // Bảng đối chiếu là hợp của cả hai nguồn: toàn bộ mã còn tồn trên hệ thống
  // và mọi mã đã quét trong đợt. Hai bên chỉ khớp khi mã đầy đủ (kể cả hậu tố
  // lô/serial) trùng tuyệt đối; mã chỉ có ở một bên sẽ hiển thị dấu ✕ ở bên kia.
  const reconciliationRows = useMemo((): ReconciliationRow[] => {
    const isSameWarehouse = (scannedWarehouse: string | null, systemWarehouse: string | null) =>
      !scannedWarehouse || !systemWarehouse || scannedWarehouse === systemWarehouse;
    const rows: ReconciliationRow[] = [];

    for (const systemLine of heThongChiTiet) {
      if (systemLine.ton_cuoi_ky <= 0) continue;

      // Dòng mã danh mục gốc (không có hậu tố) chỉ là mã dùng để tổng hợp tồn.
      // Khi đợt kiểm đã quét các mã lô/serial cùng tiền tố, không hiển thị mã gốc
      // thành một sản phẩm chưa kiểm riêng biệt bên cạnh các mã hậu tố đó.
      const isBaseCatalogLine = systemLine.ma === systemLine.ma_goc;
      const hasScannedSuffixForBase = detailLines.some(
        line =>
          line.ma_nvl === systemLine.ma_goc &&
          line.ma_sp !== line.ma_nvl &&
          isSameWarehouse(line.ten_kho, systemLine.ten_kho)
      );
      if (isBaseCatalogLine && hasScannedSuffixForBase) continue;

      const scannedLine = detailLines.find(
        line => line.ma_sp === systemLine.ma && isSameWarehouse(line.ten_kho, systemLine.ten_kho)
      );
      rows.push({
        key: `system:${systemLine.loai_kho}:${systemLine.ma}:${systemLine.ten_kho ?? ''}`,
        // Cột kho phải giữ nguyên mã chi tiết (tiền tố + hậu tố serial), không rút về mã gốc.
        ma_hang: systemLine.ma,
        // Chỉ hiển thị mã ở cột "Mã hàng đã kiểm" khi đúng mã đó thực sự
        // xuất hiện trong đợt kiểm; mã chỉ có trong kho để trống.
        ma_da_kiem: scannedLine?.ma_sp ?? '',
        ten: systemLine.ten,
        loai: formatLoaiKho(systemLine.loai_kho),
        ten_kho: systemLine.ten_kho,
        co_he_thong: true,
        co_kiem_ke: Boolean(scannedLine)
      });
    }

    for (const line of detailLines) {
      const systemMatches = heThongByFullCode.get(line.ma_sp) || [];
      const coHeThong = systemMatches.some(systemLine => isSameWarehouse(line.ten_kho, systemLine.ten_kho));
      if (coHeThong) continue;
      rows.push({
        key: `kiem-ke:${line.id}`,
        ma_hang: line.ma_nvl,
        ma_da_kiem: line.ma_sp,
        ten: line.ten_sp,
        loai: line.loai_sp,
        ten_kho: line.ten_kho,
        co_he_thong: false,
        co_kiem_ke: true
      });
    }

    return rows.sort((a, b) => a.ma_hang.localeCompare(b.ma_hang, 'vi') || a.ma_da_kiem.localeCompare(b.ma_da_kiem, 'vi'));
  }, [detailLines, heThongChiTiet, heThongByFullCode]);

  const normalizedSearch = searchText.trim().toLowerCase();

  // Tab "Danh sách chi tiết" — 1 dòng/mã hàng đã kiểm kê trong đợt, đối chiếu xem có khớp
  // danh mục tồn kho hệ thống hay không ("Có trên kiểm kê" luôn ✓ vì đã lọc theo đợt).
  const searchedReconciliation = useMemo(() => {
    if (!normalizedSearch) return reconciliationRows;
    return reconciliationRows.filter(r => `${r.ma_hang} ${r.ma_da_kiem} ${r.ten}`.toLowerCase().includes(normalizedSearch));
  }, [reconciliationRows, normalizedSearch]);
  const filteredReconciliation = useMemo(() => {
    if (detailPresenceFilter === 'he-thong') {
      return searchedReconciliation.filter(row => row.co_he_thong && !row.co_kiem_ke);
    }
    if (detailPresenceFilter === 'kiem-ke') {
      return searchedReconciliation.filter(row => !row.co_he_thong && row.co_kiem_ke);
    }
    if (detailPresenceFilter === 'ca-hai') {
      return searchedReconciliation.filter(row => row.co_he_thong && row.co_kiem_ke);
    }
    return searchedReconciliation;
  }, [searchedReconciliation, detailPresenceFilter]);

  // Tab "Bảng tổng hợp" — 1 dòng/mã, so sánh kiểm kê vs hệ thống.
  const searchedRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter(row => `${row.ma_nvl} ${row.ten_sp}`.toLowerCase().includes(normalizedSearch));
  }, [rows, normalizedSearch]);
  const filteredRows = useMemo(
    () => (chiHienChenhLech ? searchedRows.filter(row => row.trang_thai !== 'khop') : searchedRows),
    [searchedRows, chiHienChenhLech]
  );

  const stats = useMemo(() => {
    const total = rows.length;
    const khop = rows.filter(r => r.trang_thai === 'khop').length;
    const thua = rows.filter(r => r.trang_thai === 'thua').length;
    const thieu = rows.filter(r => r.trang_thai === 'thieu').length;
    const khongXacDinh = rows.filter(r => r.trang_thai === 'khong_xac_dinh').length;
    const tongSlThua = rows.filter(r => r.trang_thai === 'thua').reduce((sum, r) => sum + (r.chenh_lech || 0), 0);
    const tongSlThieu = rows
      .filter(r => r.trang_thai === 'thieu')
      .reduce((sum, r) => sum + Math.abs(r.chenh_lech || 0), 0);
    return { total, khop, thua, thieu, khongXacDinh, tongSlThua, tongSlThieu };
  }, [rows]);

  // Tab phiếu điều chỉnh đối chiếu theo MÃ NGUYÊN BẢN (gồm hậu tố lô/serial),
  // không dùng dòng tổng hợp đã gộp theo tiền tố. Nhờ vậy phiếu kho trừ/cộng đúng
  // mã đang xuất hiện ở danh sách tồn kho chi tiết.
  const pendingRows = useMemo((): PendingRow[] => {
    type MutableOriginalRow = Omit<PendingRow, 'loai_phieu' | 'so_luong' | 'chenh_lech' | 'da_xu_ly' | 'ma_phieu_dieu_chinh'>;
    const byCode = new Map<string, MutableOriginalRow>();

    for (const line of heThongChiTiet) {
      if (line.ton_cuoi_ky <= 0) continue;
      const current = byCode.get(line.ma) || {
        ma_sp: line.ma,
        ma_goc: line.ma_goc,
        ten_sp: line.ten,
        ten_kho: line.ten_kho,
        loai_kho: 'san_pham' as const,
        ton_he_thong: 0,
        ton_kiem_ke: 0
      };
      current.ton_he_thong += line.ton_cuoi_ky;
      current.ten_kho = current.ten_kho || line.ten_kho;
      byCode.set(line.ma, current);
    }

    for (const line of detailLines) {
      const current = byCode.get(line.ma_sp) || {
        ma_sp: line.ma_sp,
        ma_goc: line.ma_nvl || line.ma_sp.split('_')[0] || line.ma_sp,
        ten_sp: line.ten_sp,
        ten_kho: line.ten_kho,
        loai_kho: 'san_pham' as const,
        ton_he_thong: 0,
        ton_kiem_ke: 0
      };
      current.ton_kiem_ke += 1;
      current.ten_sp = line.ten_sp || current.ten_sp;
      current.ten_kho = current.ten_kho || line.ten_kho;
      byCode.set(line.ma_sp, current);
    }

    const xuLyMap = new Map<string, XuLyChiTietRow>(xuLyChiTiet.map(row => [row.ma_sp, row]));
    return Array.from(byCode.values())
      .map(row => {
        const chenhLech = row.ton_kiem_ke - row.ton_he_thong;
        const loaiPhieu = chenhLech > 0 ? 'nhap' : chenhLech < 0 ? 'xuat' : null;
        const xuLy = xuLyMap.get(row.ma_sp) || xuLyMap.get(row.ma_goc) || null;
        return {
          ...row,
          chenh_lech: chenhLech,
          loai_phieu: loaiPhieu,
          so_luong: Math.abs(chenhLech),
          da_xu_ly: Boolean(xuLy),
          ma_phieu_dieu_chinh: xuLy?.ma_phieu_dieu_chinh || null
        } satisfies PendingRow;
      })
      // Tab phiếu điều chỉnh chỉ hiển thị các mã thực sự cần lập phiếu.
      // Dòng đã khớp (chênh lệch = 0, loai_phieu = null) vẫn còn nguyên ở các tab kiểm kho khác.
      .filter(row => row.loai_phieu !== null)
      .filter(row => !normalizedSearch || `${row.ma_sp} ${row.ten_sp}`.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => a.ma_sp.localeCompare(b.ma_sp, 'vi'));
  }, [detailLines, heThongChiTiet, normalizedSearch, xuLyChiTiet]);

  // Mã đã có lịch sử xử lý không được chọn tạo phiếu lần nữa.
  const normalizedAdjustmentSearch = adjustmentSearchText.trim().toLowerCase();
  const filteredPendingRows = useMemo(
    () => pendingRows.filter(row =>
      !normalizedAdjustmentSearch
      || `${row.ma_sp} ${row.ma_goc} ${row.ten_sp}`.toLowerCase().includes(normalizedAdjustmentSearch)
    ),
    [normalizedAdjustmentSearch, pendingRows]
  );

  const adjustmentSuggestions = useMemo(() => {
    if (!normalizedAdjustmentSearch) return [];
    const suggestions = new Map<string, { value: string; code: string; name: string; kind: 'product' | 'serial' }>();

    pendingRows.forEach(row => {
      const searchable = `${row.ma_sp} ${row.ma_goc} ${row.ten_sp}`.toLowerCase();
      if (!searchable.includes(normalizedAdjustmentSearch)) return;

      const productKey = `product:${row.ma_goc}`;
      if (!suggestions.has(productKey)) {
        suggestions.set(productKey, {
          value: row.ma_goc,
          code: row.ma_goc,
          name: row.ten_sp,
          kind: 'product'
        });
      }
      if (row.ma_sp !== row.ma_goc) {
        suggestions.set(`serial:${row.ma_sp}`, {
          value: row.ma_sp,
          code: row.ma_sp,
          name: row.ten_sp,
          kind: 'serial'
        });
      }
    });

    return [...suggestions.values()]
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'product' ? -1 : 1;
        return left.code.localeCompare(right.code, 'vi');
      })
      .slice(0, 10);
  }, [normalizedAdjustmentSearch, pendingRows]);

  const actionableRows = useMemo(
    () => filteredPendingRows.filter(row => row.loai_phieu !== null && !row.da_xu_ly),
    [filteredPendingRows]
  );
  const tongSoLuongDeXuat = useMemo(
    () => actionableRows.reduce((sum, row) => sum + row.so_luong, 0),
    [actionableRows]
  );

  useEffect(() => {
    const visibleKeys = new Set(actionableRows.map(row => row.ma_sp));
    setSelectedKeys(previous => new Set([...previous].filter(key => visibleKeys.has(key))));
  }, [actionableRows]);

  const toggleRowSelected = (ma: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(ma)) next.delete(ma);
      else next.add(ma);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    setSelectedKeys(prev => {
      const allSelected = actionableRows.length > 0 && actionableRows.every(row => prev.has(row.ma_sp));
      return allSelected ? new Set() : new Set(actionableRows.map(row => row.ma_sp));
    });
  };

  const handleCreateAdjustment = async () => {
    if (!selectedDotGroup?.da_xac_nhan) {
      showAppToast('Chỉ được xử lý chênh lệch sau khi đợt kiểm kho đã xác nhận.', 'error');
      return;
    }
    const selectedRows = actionableRows.filter(
      (row): row is PendingRow & { loai_kho: 'san_pham'; loai_phieu: 'nhap' | 'xuat' } =>
        selectedKeys.has(row.ma_sp) && row.loai_phieu !== null
    );
    if (selectedRows.length === 0) {
      showAppToast('Chọn ít nhất một dòng chênh lệch để tạo phiếu.', 'error');
      return;
    }
    if (!adjustmentDate) {
      showAppToast('Chọn ngày lập phiếu điều chỉnh.', 'error');
      return;
    }

    // Gộp theo (loại phiếu, kho vật lý); loại kho nội bộ luôn cố định là sản phẩm.
    const groups = new Map<
      string,
      { loaiPhieu: 'nhap' | 'xuat'; loaiKho: 'san_pham'; tenKhoNhom: string | null; rows: PendingRow[] }
    >();
    for (const row of selectedRows) {
      const tenKhoNhom = row.ten_kho || (tenKho !== 'all' ? tenKho : null);
      const key = `${row.loai_phieu}|${row.loai_kho}|${tenKhoNhom || ''}`;
      const g = groups.get(key) || { loaiPhieu: row.loai_phieu, loaiKho: row.loai_kho, tenKhoNhom, rows: [] };
      g.rows.push(row);
      groups.set(key, g);
    }

    setCreatingSlips(true);
    let createdCount = 0;
    const failures: string[] = [];
    try {
      for (const group of groups.values()) {
        try {
          const res = await fetch('/api/phieu-xuat-nhap-kho', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              loaiPhieu: group.loaiPhieu,
              loaiKho: group.loaiKho,
              ngayPhieu: adjustmentDate,
              tenKho: group.tenKhoNhom,
              lyDo: `Điều chỉnh tồn kho sau kiểm kê - đợt ${selectedDot}`,
              nguoiLap: loginName || null,
              items: group.rows.map(row => ({
                code: row.ma_sp,
                name: row.ten_sp,
                unit: '',
                quantity: row.so_luong,
                unitPrice: 0
              }))
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tạo được phiếu điều chỉnh.'));
          const slipCode = String((data as any)?.slipCode ?? '').trim();

          await Promise.all(
            group.rows.map(async row => {
              const historyRes = await fetch('/api/kiem-kho/chenh-lech-xu-ly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  dot_kiem_kho: selectedDot,
                  ma_sp: row.ma_sp,
                  loai_phieu: group.loaiPhieu,
                  so_luong_dieu_chinh: row.so_luong,
                  ma_phieu_dieu_chinh: slipCode,
                  nguoi_xu_ly: loginName || null
                })
              });
              const historyData = await historyRes.json().catch(() => ({}));
              if (!historyRes.ok) {
                throw new Error(readApiErrorMessage(historyRes, historyData, `Không lưu được lịch sử mã ${row.ma_sp}.`));
              }
            })
          );

          createdCount += 1;
        } catch (err: any) {
          failures.push(err?.message || `Lỗi khi tạo phiếu ${group.loaiPhieu} ${group.loaiKho}.`);
        }
      }
    } finally {
      setCreatingSlips(false);
    }

    if (createdCount > 0) {
      showAppToast(`Đã tạo ${createdCount} phiếu điều chỉnh tồn kho.`, 'success');
    }
    for (const message of failures) {
      showAppToast(message, 'error');
    }
    setSelectedKeys(new Set());
    void loadRows(selectedDot, tenKho);
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4 px-3 py-4 sm:px-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
        <h2 className="mb-3 text-sm font-black text-zinc-900">Đợt kiểm kho đối chiếu</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Đợt kiểm kho
            <div className="mt-1">
              <SearchableSelect
                value={selectedDot}
                onChange={setSelectedDot}
                options={confirmedBatches}
                getValue={item => (item as DotGroup).dot_kiem_kho}
                getLabel={item => {
                  const b = item as DotGroup;
                  return `${formatDotLabel(
                    b.ngay_bat_dau,
                    b.thoi_gian_xac_nhan,
                    b.thu_tu_trong_ngay,
                    b.tong_dot_trong_ngay
                  )} · ${b.so_dong} mã · ${b.da_xac_nhan ? 'Đã xác nhận' : 'Chưa xác nhận'}`;
                }}
                placeholder="Tìm đợt kiểm kho..."
                isLoading={loadingBatches}
                allowEmpty={false}
                inputClassName={inputClass}
                comboboxMode
              />
            </div>
          </label>

          <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Kho
            <div className="mt-1">
              <FilterCombobox
                label="Kho"
                options={warehouseOptions}
                value={tenKho}
                onChange={setTenKho}
                searchPlaceholder="Tìm kho..."
                compact
              />
            </div>
          </div>
        </div>

        {selectedDotGroup ? (
          <p className="mt-3 text-[11px] font-semibold text-zinc-500">
            Bắt đầu: {formatDateTime(selectedDotGroup.ngay_bat_dau)} ·{' '}
            <span className="text-emerald-600">
              Đã xác nhận kiểm kê lúc {formatDateTime(selectedDotGroup.thoi_gian_xac_nhan)} — tồn hệ thống lấy tại
              thời điểm này
            </span>
          </p>
        ) : allBatches.length > 0 ? (
          <p className="mt-3 text-[11px] font-semibold text-amber-600">
            Chưa có đợt kiểm kho nào được xác nhận để xử lý chênh lệch.
          </p>
        ) : null}
      </section>

      <nav
        aria-label="Chức năng xử lý chênh lệch"
        className="grid grid-cols-3 gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm sm:gap-2 sm:p-2 lg:p-3"
      >
        <button
          type="button"
          aria-current={view === 'chi-tiet' ? 'page' : undefined}
          onClick={() => setView('chi-tiet')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'chi-tiet'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'chi-tiet' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Chi tiết</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Danh sách chi tiết</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Từng mặt hàng đã quét trong đợt
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'tong-hop' ? 'page' : undefined}
          onClick={() => {
            setView('tong-hop');
            setChiHienChenhLech(true);
          }}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'tong-hop'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'tong-hop' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Tổng hợp</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">Bảng tổng hợp</span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Gộp theo mã, so sánh kiểm kê với tồn cuối
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-current={view === 'phieu-dieu-chinh' ? 'page' : undefined}
          onClick={() => setView('phieu-dieu-chinh')}
          className={`group flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center transition sm:min-h-[76px] sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left lg:min-h-[92px] lg:gap-3 lg:px-4 ${
            view === 'phieu-dieu-chinh'
              ? 'border-[#ef1b2d] bg-red-50 shadow-sm'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50'
          }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${view === 'phieu-dieu-chinh' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-500'}`}>
            <ArrowDownToLine className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black leading-tight text-zinc-900 sm:hidden">Điều chỉnh</span>
            <span className="hidden text-sm font-black leading-tight text-zinc-900 sm:block">
              Phiếu Nhập/Xuất điều chỉnh
            </span>
            <span className="mt-1 hidden text-xs font-semibold leading-snug text-zinc-500 lg:block">
              Tạo phiếu điều chỉnh tồn kho từ chênh lệch
            </span>
          </span>
        </button>
      </nav>

      {view === 'chi-tiet' ? (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-3 sm:p-4">
            <TableToolbar isLoading={loadingDetail || loadingRows} loadError={detailError || rowsError}>
              <TableSearchInput value={searchText} onChange={setSearchText} placeholder="Tìm mã, tên..." />
              <FilterCombobox
                label="Đối chiếu"
                options={DETAIL_PRESENCE_OPTIONS}
                value={detailPresenceFilter}
                onChange={value => setDetailPresenceFilter(value as DetailPresenceFilter)}
                formatOption={formatDetailPresenceFilter}
                searchable={false}
                alignDropdown="right"
              />
            </TableToolbar>
          </div>

          <div className="border-b border-zinc-100 px-3 py-2.5 sm:px-4">
            <p className="text-[11px] font-semibold text-zinc-500">
              {filteredReconciliation.length} / {reconciliationRows.length} mã đối chiếu
            </p>
          </div>

          <TableShell minWidthClassName="min-w-[900px]" maxHeightClassName="max-h-[560px]">
            <TableHead>
              <TableHeadCell>Mã hàng trong kho</TableHeadCell>
              <TableHeadCell>Mã hàng đã kiểm</TableHeadCell>
              <TableHeadCell>Tên</TableHeadCell>
              <TableHeadCell>Loại</TableHeadCell>
              <TableHeadCell>Kho</TableHeadCell>
              <TableHeadCell align="center">Có trên hệ thống</TableHeadCell>
              <TableHeadCell align="center">Có trên kiểm kê</TableHeadCell>
            </TableHead>
            <TableBody>
              {filteredReconciliation.map(row => (
                <TableRow key={row.key}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-sky-700">{row.ma_hang}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-violet-700">
                    {row.ma_da_kiem || '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.loai || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{row.ten_kho || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {row.co_he_thong ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={3} />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-rose-600" strokeWidth={3} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.co_kiem_ke ? (
                      <Check className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={3} />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-rose-600" strokeWidth={3} />
                    )}
                  </td>
                </TableRow>
              ))}
              {!(loadingDetail || loadingRows) && filteredReconciliation.length === 0 && (
                <TableEmptyRow colSpan={7}>Không có dữ liệu phù hợp bộ lọc.</TableEmptyRow>
              )}
            </TableBody>
          </TableShell>
        </section>
      ) : view === 'tong-hop' ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Tổng mã đối chiếu</p>
              <p className="mt-1 text-2xl font-black text-zinc-900">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Khớp</p>
              <p className="mt-1 text-2xl font-black text-zinc-600">{stats.khop}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Thừa</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">{stats.thua}</p>
              <p className="text-[11px] font-semibold text-zinc-500">+{formatQty(stats.tongSlThua)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Thiếu</p>
              <p className="mt-1 text-2xl font-black text-rose-700">{stats.thieu}</p>
              <p className="text-[11px] font-semibold text-zinc-500">-{formatQty(stats.tongSlThieu)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">Không xác định</p>
              <p className="mt-1 text-2xl font-black text-sky-700">{stats.khongXacDinh}</p>
              <p className="text-[11px] font-semibold text-zinc-500">Mã chưa khớp danh mục tồn kho</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 p-3 sm:p-4">
              <TableToolbar isLoading={loadingRows} loadError={rowsError}>
                <TableSearchInput value={searchText} onChange={setSearchText} placeholder="Tìm mã, tên..." />
                <label className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-600">
                  <input
                    type="checkbox"
                    checked={chiHienChenhLech}
                    onChange={event => setChiHienChenhLech(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]"
                  />
                  Chỉ hiện mã có chênh lệch
                </label>
              </TableToolbar>
            </div>

            <TableShell minWidthClassName="min-w-[1050px]" maxHeightClassName="max-h-[560px]">
              <TableHead>
                <TableHeadCell>Mã hàng</TableHeadCell>
                <TableHeadCell>Tên hàng</TableHeadCell>
                <TableHeadCell>Loại</TableHeadCell>
                <TableHeadCell>Kho</TableHeadCell>
                <TableHeadCell align="center">Tồn kiểm kê</TableHeadCell>
                <TableHeadCell align="center">Tồn hệ thống</TableHeadCell>
                <TableHeadCell align="center">Chênh lệch</TableHeadCell>
                <TableHeadCell align="center">Trạng thái</TableHeadCell>
              </TableHead>
              <TableBody>
                {filteredRows.map(row => (
                  <TableRow key={row.ma_nvl}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-zinc-900">{row.ma_nvl}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten_sp}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">
                      {row.loai_sp || formatLoaiKho(row.loai_kho)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">{row.ten_kho || '—'}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-zinc-700">{formatQty(row.ton_thuc_te)}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-zinc-700">{formatQty(row.ton_he_thong)}</td>
                    <td
                      className={`px-4 py-3 text-center font-mono font-black ${
                        row.chenh_lech === null
                          ? 'text-sky-600'
                          : row.chenh_lech > 0
                            ? 'text-emerald-700'
                            : row.chenh_lech < 0
                              ? 'text-rose-700'
                              : 'text-zinc-500'
                      }`}
                    >
                      {row.chenh_lech !== null && row.chenh_lech > 0 ? '+' : ''}
                      {formatQty(row.chenh_lech)}
                    </td>
                    <td className="px-4 py-3 text-center">{xuLyChenhLechBadge(row)}</td>
                  </TableRow>
                ))}
                {!loadingRows && filteredRows.length === 0 && (
                  <TableEmptyRow colSpan={8}>Không có dữ liệu phù hợp bộ lọc.</TableEmptyRow>
                )}
              </TableBody>
            </TableShell>
          </section>
        </>
      ) : (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            <h2 className="mb-3 text-sm font-black text-zinc-900">Thông tin phiếu điều chỉnh</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Thời gian lập phiếu
                <input
                  type="date"
                  value={adjustmentDate}
                  onChange={event => setAdjustmentDate(event.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Cho kho nào
                <p className="mt-1 flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700">
                  {tenKho !== 'all' ? tenKho : 'Theo từng mã (tách phiếu theo kho tương ứng)'}
                </p>
              </div>
              <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Cho đợt kiểm kê nào
                <p className="mt-1 flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-700">
                  {selectedDotGroup
                    ? formatDotLabel(
                        selectedDotGroup.ngay_bat_dau,
                        selectedDotGroup.thoi_gian_xac_nhan,
                        selectedDotGroup.thu_tu_trong_ngay,
                        selectedDotGroup.tong_dot_trong_ngay
                      )
                    : selectedDot || '—'}
                </p>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 sm:px-4">
              <div>
                <h2 className="text-sm font-black text-zinc-900">Phiếu Nhập/Xuất điều chỉnh tồn kho</h2>
                <p className="text-[11px] font-semibold text-zinc-500">
                  Mỗi dòng là một mã sản phẩm nguyên bản, gồm đầy đủ hậu tố lô/serial. Kiểm kê nhiều hơn hệ thống →
                  Phiếu Nhập; kiểm kê ít hơn hệ thống → Phiếu Xuất. Loại phiếu và số lượng được lưu riêng trong cơ sở dữ liệu.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="flex h-10 items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3">
                  <span className="text-[11px] font-bold text-zinc-500">
                    Cần điều chỉnh: <span className="font-black text-zinc-900">{actionableRows.length}</span>
                  </span>
                  <span className="h-4 w-px bg-zinc-300" />
                  <span className="text-[11px] font-bold text-zinc-500">
                    Tổng SL đề xuất: <span className="font-black text-[#ef1b2d]">{formatQty(tongSoLuongDeXuat)}</span>
                  </span>
                </div>
                {canCreate && selectedDotGroup?.da_xac_nhan ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAllPending}
                      disabled={actionableRows.length === 0}
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:border-zinc-300 disabled:opacity-50"
                    >
                      {actionableRows.length > 0 && actionableRows.every(row => selectedKeys.has(row.ma_sp))
                        ? 'Bỏ chọn tất cả'
                        : 'Chọn tất cả'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCreateAdjustment()}
                      disabled={creatingSlips || selectedKeys.size === 0}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                    >
                      {creatingSlips ? 'Đang tạo phiếu…' : `Tạo phiếu điều chỉnh (${selectedKeys.size})`}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="border-b border-zinc-100 bg-zinc-50/70 px-3 py-3 sm:px-4">
              <div className="relative max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={adjustmentSearchText}
                  onChange={event => {
                    setAdjustmentSearchText(event.target.value);
                    setShowAdjustmentSuggestions(true);
                  }}
                  onFocus={() => setShowAdjustmentSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowAdjustmentSuggestions(false), 120)}
                  placeholder="Nhập mã QR, mã sản phẩm hoặc tên sản phẩm..."
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-11 text-sm font-semibold text-zinc-800 outline-none transition focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                />
                {adjustmentSearchText ? (
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                      setAdjustmentSearchText('');
                      setShowAdjustmentSuggestions(false);
                    }}
                    title="Xóa bộ lọc"
                    className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}

                {showAdjustmentSuggestions && normalizedAdjustmentSearch && adjustmentSuggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 max-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl">
                    {adjustmentSuggestions.map(suggestion => (
                      <button
                        key={`${suggestion.kind}-${suggestion.code}`}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => {
                          setAdjustmentSearchText(suggestion.value);
                          setShowAdjustmentSuggestions(false);
                        }}
                        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-red-50"
                      >
                        <span className={`mt-0.5 rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                          suggestion.kind === 'product'
                            ? 'bg-[#ef1b2d] text-white'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {suggestion.kind === 'product' ? 'Mã gốc' : 'Mã QR'}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-xs font-black text-zinc-900">{suggestion.code}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-500">{suggestion.name || '—'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                {normalizedAdjustmentSearch
                  ? `Đang hiển thị ${filteredPendingRows.length}/${pendingRows.length} mã phù hợp.`
                  : 'Có thể tìm theo mã đầy đủ, mã gốc hoặc tên sản phẩm.'}
              </p>
            </div>

            <TableShell minWidthClassName="min-w-[1250px]" maxHeightClassName="max-h-[520px]">
              <TableHead>
                <TableHeadCell>{' '}</TableHeadCell>
                <TableHeadCell>Mã sản phẩm nguyên bản</TableHeadCell>
                <TableHeadCell>Tên hàng</TableHeadCell>
                <TableHeadCell>Kho</TableHeadCell>
                <TableHeadCell align="center">Tồn hệ thống</TableHeadCell>
                <TableHeadCell align="center">Số lần kiểm</TableHeadCell>
                <TableHeadCell align="center">Chênh lệch</TableHeadCell>
                <TableHeadCell align="center">Loại phiếu</TableHeadCell>
                <TableHeadCell align="center">SL đề xuất</TableHeadCell>
                <TableHeadCell align="center">Xử lý</TableHeadCell>
              </TableHead>
              <TableBody>
                {filteredPendingRows.map(row => (
                  <TableRow key={row.ma_sp} className={row.loai_phieu === null ? 'opacity-70' : ''}>
                    <td className="px-4 py-3">
                      {row.loai_phieu === null || row.da_xu_ly ? (
                        <span className="block h-4 w-4" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(row.ma_sp)}
                          onChange={() => toggleRowSelected(row.ma_sp)}
                          className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]"
                        />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-black text-zinc-900">{row.ma_sp}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-700">{row.ten_sp}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">{row.ten_kho || '—'}</td>
                    <td className="px-4 py-3 text-center font-mono font-black text-zinc-800">{formatQty(row.ton_he_thong)}</td>
                    <td className="px-4 py-3 text-center font-mono font-black text-zinc-800">{formatQty(row.ton_kiem_ke)}</td>
                    <td className={`px-4 py-3 text-center font-mono font-black ${row.chenh_lech < 0 ? 'text-rose-600' : row.chenh_lech > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                      {row.chenh_lech > 0 ? '+' : ''}{formatQty(row.chenh_lech)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.loai_phieu === 'nhap' ? (
                        <StatusBadge label="Phiếu Nhập" color="emerald" />
                      ) : row.loai_phieu === 'xuat' ? (
                        <StatusBadge label="Phiếu Xuất" color="rose" />
                      ) : (
                        <StatusBadge label="Không cần lập phiếu" color="zinc" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black text-zinc-900">
                      {row.loai_phieu === null ? '—' : formatQty(row.so_luong)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.loai_phieu === null ? (
                        <StatusBadge label="Không cần xử lý" color="zinc" />
                      ) : row.da_xu_ly ? (
                        <StatusBadge label={row.ma_phieu_dieu_chinh || 'Đã xử lý'} color="emerald" />
                      ) : (
                        <StatusBadge label="Chưa xử lý" color="amber" />
                      )}
                    </td>
                  </TableRow>
                ))}
                {filteredPendingRows.length === 0 && (
                  <TableEmptyRow colSpan={10}>
                    {loadingRows
                      ? 'Đang tải dữ liệu...'
                      : normalizedAdjustmentSearch
                        ? 'Không tìm thấy mã hoặc tên sản phẩm phù hợp.'
                        : 'Không có mã sản phẩm nào để đối chiếu.'}
                  </TableEmptyRow>
                )}
              </TableBody>
            </TableShell>
          </section>
        </>
      )}
    </div>
  );
}

export default XuLyChenhLechPanel;
