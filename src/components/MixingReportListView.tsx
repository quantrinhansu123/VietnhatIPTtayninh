import React, { useEffect, useMemo, useState } from 'react';
import { useTabAccess } from '../app/useTabAccess';
import { ChevronDown, ChevronLeft, ClipboardList, Eye, Loader2, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { vietNhatLogoUrl } from './layout/constants';
import { MixingReportPrintBatch } from './MixingReportPrintSheet';
import {
  MIXING_MAX_ROUNDS,
  MIXING_ROUND_KEYS,
  compareMixingReportsBySession,
  deriveLineUnit,
  formatNormWeight,
  formatOptionalNumber,
  formatMixingReportSessionLabel,
  getRoundItems,
  mixingSessionLabel,
  mixingSessionColumnLabel,
  resolveMixingReportRoundPhotos,
  resolveMixingReportRoundReasons,
  resolveMixingReportRoundExplanations,
  resolveLineKlThucTe,
  sumLineNormQuantity,
  sumLineRoundNormQuantity,
  sumMixingRounds,
  sumRoundActualQuantity,
  sumRoundQuantity,
  sumReportNormTotal,
  visibleRoundCount,
  normalizeMixingReport
} from '../lib/mixingReportModel';
import type { MixingRoundPhoto } from './MixingReportForm';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../utils/printReady';
import type { MixingReport, MixingReportLine } from './MixingReportForm';
import MixingReportForm from './MixingReportForm';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
import { RowActionsMenu } from './shared/table';
import { isWarehouseKgUnit } from '../utils/warehouseWeight';

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

type MachineOption = {
  id: string;
  code: string;
  name: string;
};

type MixingReportFilters = {
  tuNgay: string;
  denNgay: string;
  ca: string;
  machineId: string;
};

function compareMixingReportsForList(
  left: MixingReport,
  right: MixingReport,
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
  const byCreated = String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
  if (byCreated !== 0) return byCreated;
  const shiftOrder = (ca: string) => {
    const index = shiftOptions.findIndex(
      option => option.value === ca || shiftNamesMatch(option.value, ca) || shiftNamesMatch(option.label, ca)
    );
    return index >= 0 ? index : 999;
  };
  const byShift = shiftOrder(left.ca || '') - shiftOrder(right.ca || '');
  if (byShift !== 0) return byShift;
  const byShiftName = String(left.ca || '').localeCompare(String(right.ca || ''), 'vi', { numeric: true });
  if (byShiftName !== 0) return byShiftName;
  return compareMixingReportsBySession(left, right);
}

function emptyFilters(): MixingReportFilters {
  return {
    tuNgay: '',
    denNgay: '',
    ca: '',
    machineId: ''
  };
}

function buildFilterQuery(filters: MixingReportFilters, machines: MachineOption[]) {
  const params = new URLSearchParams();
  let tuNgay = filters.tuNgay;
  let denNgay = filters.denNgay;
  if (tuNgay && denNgay && tuNgay > denNgay) {
    [tuNgay, denNgay] = [denNgay, tuNgay];
  }
  if (tuNgay) params.set('tu_ngay', tuNgay);
  if (denNgay) params.set('den_ngay', denNgay);
  if (filters.ca) params.set('ca', filters.ca);
  const machine = machines.find(item => item.id === filters.machineId);
  if (machine?.code) params.set('ma_may', machine.code);
  return params.toString();
}

function formatFilterSummary(filters: MixingReportFilters, machines: MachineOption[]) {
  const parts: string[] = [];
  if (filters.tuNgay || filters.denNgay) {
    parts.push(
      filters.tuNgay && filters.denNgay
        ? `${filters.tuNgay} → ${filters.denNgay}`
        : filters.tuNgay
          ? `từ ${filters.tuNgay}`
          : `đến ${filters.denNgay}`
    );
  }
  if (filters.ca) parts.push(filters.ca);
  const machine = machines.find(item => item.id === filters.machineId);
  if (machine) parts.push(`${machine.code} · ${machine.name}`);
  return parts.length > 0 ? parts.join(' · ') : 'tất cả';
}

/** Tỉ lệ trộn định mức (%) — trung bình `ti_le_phan_tram` trên các lần của dòng NVL. */
function resolveLineTiLeDinhMucPercent(line: MixingReportLine): number | null {
  const values: number[] = [];
  for (const roundKey of MIXING_ROUND_KEYS) {
    for (const item of getRoundItems(line.lan_su_dung, roundKey)) {
      const pct = item.ti_le_phan_tram;
      if (pct !== null && pct !== undefined && Number.isFinite(pct)) values.push(pct);
    }
  }
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Tỉ lệ trộn thực tế (%) = KL thực tế dòng ÷ tổng KL thực tế phiếu × 100.
 * Chỉ chia trên vật tư ĐVT = kg (bỏ Cái / đơn vị khác).
 */
function resolveLineTiLeThucTePercent(
  lineKlThucTe: number | null,
  reportTotalKlThucTe: number
): number | null {
  if (
    lineKlThucTe === null ||
    !Number.isFinite(lineKlThucTe) ||
    !Number.isFinite(reportTotalKlThucTe) ||
    reportTotalKlThucTe <= 0
  ) {
    return null;
  }
  return (lineKlThucTe / reportTotalKlThucTe) * 100;
}

function isMixingListKgUnit(unit: string) {
  const normalized = String(unit || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === '-' || normalized === '%') return true;
  return isWarehouseKgUnit(unit);
}

function resolveMixingLineKgForRatio(line: MixingReportLine): number | null {
  if (!isMixingListKgUnit(deriveLineUnit(line.lan_su_dung))) return null;
  return resolveLineKlThucTe(line);
}

function formatPercentCell(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${formatOptionalNumber(value)}%`;
}

type MixingRoundRow = {
  session: number;
  label: string;
  lineCount: number;
  normTotal: number;
  actualTotal: number | null;
};

/** Tách 1 phiếu thành từng lần (Lần 1, Lần 2, ...) — mỗi lần 1 dòng. */
function expandReportRounds(report: MixingReport): MixingRoundRow[] {
  const start = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
  const count = Math.min(Math.max(report.so_lan || 1, 1), MIXING_ROUND_KEYS.length);
  const rows: MixingRoundRow[] = [];

  for (let index = 0; index < count; index += 1) {
    const roundKey = MIXING_ROUND_KEYS[index];
    if (!roundKey) break;

    const normTotal = report.chi_tiet.reduce(
      (sum, line) => sum + sumLineRoundNormQuantity(line, roundKey),
      0
    );
    const actualTotalRaw = report.chi_tiet.reduce(
      (sum, line) => sum + sumRoundActualQuantity(line.lan_su_dung, roundKey),
      0
    );
    const roundHasActual = report.chi_tiet.some(line =>
      getRoundItems(line.lan_su_dung, roundKey).some(
        item => item.kl_thuc_te !== null && item.kl_thuc_te !== undefined && !Number.isNaN(item.kl_thuc_te)
      )
    );
    const lineCount = report.chi_tiet.filter(
      line => getRoundItems(line.lan_su_dung, roundKey).length > 0
    ).length;

    rows.push({
      session: start + index,
      label: mixingSessionLabel(start + index),
      lineCount: lineCount || report.chi_tiet.length,
      normTotal,
      actualTotal: roundHasActual ? actualTotalRaw : null
    });
  }

  return rows.length > 0 ? rows : [
    {
      session: start,
      label: mixingSessionLabel(start),
      lineCount: report.chi_tiet.length,
      normTotal: sumReportNormTotal(report.chi_tiet),
      actualTotal: report.thuc_te_su_dung ?? null
    }
  ];
}

function renderReasonList(reasons: string[] | undefined) {
  if (!reasons?.length) {
    return <span className="font-semibold text-zinc-400">—</span>;
  }
  return (
    <ul className="list-inside list-disc space-y-0.5 text-xs font-semibold text-zinc-800">
      {reasons.map(reason => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}

function renderExplanationText(text: string | undefined) {
  const value = text?.trim();
  if (!value) {
    return <span className="font-semibold text-zinc-400">—</span>;
  }
  return <p className="whitespace-pre-line text-xs font-medium leading-relaxed text-zinc-700">{value}</p>;
}

export default function MixingReportListView({
  onBack,
  initialFilters
}: {
  onBack: () => void;
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    shift?: string;
    machineCode?: string;
  };
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('mixing-report-list');
  const [filters, setFilters] = useState<MixingReportFilters>(() => {
    const shift = initialFilters?.shift?.trim() || '';
    return {
      tuNgay: initialFilters?.dateFrom?.trim() || '',
      denNgay: initialFilters?.dateTo?.trim() || '',
      ca: !shift || shift === 'all' ? '' : shift,
      machineId: ''
    };
  });
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const initialMachineCode = (initialFilters?.machineCode || '').trim();
  useEffect(() => {
    if (!initialMachineCode || initialMachineCode === 'all' || machines.length === 0) return;
    const matched = machines.find(
      item =>
        item.code.trim().toLowerCase() === initialMachineCode.toLowerCase() ||
        item.id === initialMachineCode
    );
    if (!matched) return;
    setFilters(prev => (prev.machineId === matched.id ? prev : { ...prev, machineId: matched.id }));
  }, [initialMachineCode, machines]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [reports, setReports] = useState<MixingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
  const toggleExpandedReport = (reportId: string) => {
    setViewingReportId(prev => (prev === reportId ? null : reportId));
    setPreviewPhoto(null);
  };
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; label: string } | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formModalMode, setFormModalMode] = useState<'create' | 'edit'>('create');
  const [pendingEditReport, setPendingEditReport] = useState<MixingReport | null>(null);
  const [deletingId, setDeletingId] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reloadTick, setReloadTick] = useState(0);
  const [printReports, setPrintReports] = useState<MixingReport[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const sortedReports = useMemo(
    () => [...reports].sort((left, right) => compareMixingReportsForList(left, right, shiftOptions)),
    [reports, shiftOptions]
  );
  const dateGroups = useMemo(() => {
    const map = new Map<string, MixingReport[]>();
    for (const report of sortedReports) {
      const key = report.ngay || '-';
      const list = map.get(key) ?? [];
      list.push(report);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([ngay, groupReports]) => ({ ngay, reports: groupReports }))
      .sort((left, right) =>
        String(right.reports[0]?.created_at ?? '').localeCompare(String(left.reports[0]?.created_at ?? ''))
      );
  }, [sortedReports]);

  const loadReferenceData = async () => {
    const [machineRes, settingRes] = await Promise.all([
      fetch('/api/danh-sach-may'),
      fetch('/api/cai-dat')
    ]);
    const machineData = await machineRes.json().catch(() => ({}));
    const settingData = await settingRes.json().catch(() => ({}));
    if (machineRes.ok) {
      const machineRows = Array.isArray(machineData.machines) ? machineData.machines : [];
      setMachines(
        machineRows.map((row: Record<string, unknown>) => ({
          id: String(row.id ?? ''),
          code: String(row.ma_may ?? row.code ?? '').trim(),
          name: String(row.ten_may ?? row.name ?? '').trim()
        }))
      );
    }
    if (settingRes.ok) {
      setShiftSettings(normalizeShiftSettings(settingData));
    }
  };

  const loadReports = async (nextFilters = filters, machineList = machines) => {
    const query = buildFilterQuery(nextFilters, machineList);
    const reportRes = await fetch(`/api/bao-cao-phoi-tron${query ? `?${query}` : ''}`);
    const reportData = await reportRes.json().catch(() => ({}));
    if (!reportRes.ok) throw new Error(reportData.error || 'Không thể tải báo cáo phối trộn.');

    const list = Array.isArray(reportData.reports) ? reportData.reports : [];
    setReports(list.map((item: Record<string, unknown>) => normalizeMixingReport(item)));
  };

  useEffect(() => {
    void loadReferenceData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        await loadReports(filters, machines);
        if (!cancelled) {
          setViewingReportId(null);
          setSelectedIds(new Set());
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải báo cáo.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, machines, reloadTick]);

  useEffect(() => {
    if (!viewingReportId) setPreviewPhoto(null);
  }, [viewingReportId]);

  useEffect(() => {
    if (printReports.length === 0) return;
    document.body.classList.add('mixing-report-print-active');
    return () => {
      document.body.classList.remove('mixing-report-print-active');
    };
  }, [printReports]);

  useEffect(() => {
    if (!pendingPrint || printReports.length === 0) return;
    let cancelled = false;
    enablePortraitPrintPage('mixing-report-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          document.body.classList.remove('mixing-report-print-active');
          setPrintReports([]);
          setPendingPrint(false);
          disablePortraitPrintPage('mixing-report-page-portrait');
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disablePortraitPrintPage('mixing-report-page-portrait');
    };
  }, [pendingPrint, printReports]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('mixing-report-print-active');
      setPrintReports([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('mixing-report-print-active');
    };
  }, []);

  const handlePrintFilteredReports = () => {
    const selectedReports = sortedReports.filter(report => selectedIds.has(report.id));
    if (selectedReports.length === 0) {
      setError('Chưa chọn phiếu phối trộn để in.');
      setMessage('');
      return;
    }
    if (!window.confirm('In phiếu sẽ khóa việc sửa các báo cáo này. Bạn có chắc chắn muốn in?')) {
      return;
    }
    const ids = selectedReports.map(report => report.id);
    setReports(prev => prev.map(report => (ids.includes(report.id) ? { ...report, da_in: true } : report)));
    fetch('/api/bao-cao-phoi-tron/danh-dau-da-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    }).catch(() => {});
    setError('');
    setMessage('');
    // Tạo snapshot mới từ selection hiện tại cho mỗi lần mở preview.
    setPrintReports(selectedReports);
    setPendingPrint(true);
  };

  const renderPhotoGallery = (
    photos: MixingRoundPhoto[],
    emptyLabel = 'Chưa có ảnh xác nhận',
    variant: 'thumb' | 'detail' = 'thumb',
    photoLabel = 'Ảnh xác nhận'
  ) => {
    if (photos.length === 0) {
      return (
        <p
          className={`rounded-lg border border-dashed border-zinc-200 bg-white text-center text-xs font-semibold text-zinc-400 ${
            variant === 'detail' ? 'px-3 py-8' : 'px-3 py-4'
          }`}
        >
          {emptyLabel}
        </p>
      );
    }
    if (variant === 'detail') {
      return (
        <div className="flex flex-col gap-2.5">
          {photos.map((photo, photoIndex) => (
            <button
              key={`${photo.url}-${photoIndex}`}
              type="button"
              onClick={() =>
                setPreviewPhoto({
                  url: photo.url,
                  label: photos.length > 1 ? `${photoLabel} · ${photoIndex + 1}/${photos.length}` : photoLabel
                })
              }
              className="block h-36 w-full shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:ring-2 hover:ring-[#ef1b2d]/30 focus:outline-none focus:ring-2 focus:ring-[#ef1b2d]/40"
              title="Xem ảnh"
            >
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, photoIndex) => (
          <a
            key={`${photo.url}-${photoIndex}`}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="block h-20 w-20 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:ring-2 hover:ring-[#ef1b2d]/30"
            title="Xem ảnh"
          >
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa báo cáo phối trộn này?')) return;
    setError('');
    setMessage('');
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bao-cao-phoi-tron/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa báo cáo.');
      if (viewingReportId === id) setViewingReportId(null);
      setMessage('Đã xóa báo cáo phối trộn.');
      await loadReports(filters, machines);
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      setError(err.message || 'Không thể xóa báo cáo.');
    } finally {
      setDeletingId('');
    }
  };

  const selectedCount = selectedIds.size;

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (reportIds: string[]) => {
    const validIds = reportIds.filter(Boolean);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const isGroupSelected = validIds.length > 0 && validIds.every(id => next.has(id));
      validIds.forEach(id => {
        if (isGroupSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Xóa ${ids.length} báo cáo phối trộn đã chọn?`)) return;
    setError('');
    setMessage('');
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/bao-cao-phoi-tron/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa nhiều báo cáo.');
      const deleted = Number(data.deleted ?? ids.length);
      setMessage(deleted > 0 ? `Đã xóa ${deleted} báo cáo phối trộn.` : 'Không có báo cáo nào được xóa.');
      setSelectedIds(new Set());
      await loadReports(filters, machines);
    } catch (err: any) {
      setError(err.message || 'Không thể xóa nhiều báo cáo.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const openEditReport = (report: MixingReport) => {
    if (!canEdit) return;
    if (report.da_in) {
      setError('Báo cáo đã in, không thể sửa nữa.');
      return;
    }
    setFormModalMode('edit');
    setPendingEditReport(report);
    setCreateModalOpen(true);
  };

  const renderReportActions = (report: MixingReport) => (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          toggleExpandedReport(report.id);
        }}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-[11px] font-bold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
        title={viewingReportId === report.id ? 'Thu gọn chi tiết' : 'Xem chi tiết'}
      >
        <Eye className="h-3.5 w-3.5" />
        {viewingReportId === report.id ? 'Thu gọn' : 'Xem'}
      </button>
      {canEdit && !report.da_in ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            openEditReport(report);
          }}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
          title="Sửa báo cáo"
        >
          <Pencil className="h-3.5 w-3.5" />
          Sửa
        </button>
      ) : null}
      {canDelete ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            void handleDelete(report.id);
          }}
          disabled={deletingId === report.id}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          title="Xóa báo cáo"
        >
          {deletingId === report.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Xoá
        </button>
      ) : null}
    </div>
  );

  const renderExpandedReportDetail = (report: MixingReport) => {
    const roundCount = (() => {
      const fromLines = report.chi_tiet.reduce(
        (max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)),
        1
      );
      return Math.min(MIXING_MAX_ROUNDS, Math.max(report.so_lan || 1, fromLines));
    })();
    const sessionStart = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
    const roundPhotos = resolveMixingReportRoundPhotos(report);
    const roundReasons = resolveMixingReportRoundReasons(report);
    const roundExplanations = resolveMixingReportRoundExplanations(report);
    const showQtyColumns = roundCount > 1;

    if (report.chi_tiet.length === 0) {
      return (
        <p className="py-6 text-center text-sm font-bold text-zinc-400">Phiếu này chưa có dòng vật tư.</p>
      );
    }

    return (
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[min(100%,280px)]">
          <div className="max-h-[min(48vh,420px)] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            {showQtyColumns ? (
              <div className="space-y-4">
                {MIXING_ROUND_KEYS.slice(0, roundCount).map((roundKey, roundIndex) => {
                  const roundLabel = `Ảnh · ${mixingSessionColumnLabel(sessionStart, roundIndex)}`;
                  return (
                    <div key={`expand-photos-${report.id}-${roundKey}`}>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {roundLabel}
                      </p>
                      {renderPhotoGallery(
                        roundPhotos[roundKey] ?? [],
                        'Chưa có ảnh xác nhận',
                        'detail',
                        roundLabel
                      )}
                      <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lý do</p>
                          <div className="mt-1">{renderReasonList(roundReasons[roundKey])}</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Giải trình
                          </p>
                          <div className="mt-1">{renderExplanationText(roundExplanations[roundKey])}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Ảnh · {mixingSessionColumnLabel(sessionStart, 0)}
                </p>
                {renderPhotoGallery(
                  MIXING_ROUND_KEYS.slice(0, roundCount).flatMap(roundKey => roundPhotos[roundKey] ?? []),
                  'Chưa có ảnh xác nhận',
                  'detail',
                  `Ảnh · ${mixingSessionColumnLabel(sessionStart, 0)}`
                )}
                <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lý do</p>
                    <div className="mt-1">{renderReasonList(roundReasons[MIXING_ROUND_KEYS[0]])}</div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Giải trình</p>
                    <div className="mt-1">
                      {renderExplanationText(roundExplanations[MIXING_ROUND_KEYS[0]])}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-900 text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="w-10 px-2 py-2 font-black">STT</th>
                <th className="px-2 py-2 font-black">Mã NVL</th>
                <th className="px-2 py-2 font-black">Tên vật tư</th>
                <th className="px-2 py-2 font-black">ĐVT</th>
                <th
                  className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black"
                  title="Tỉ lệ trộn định mức (%) từ phiếu phối trộn"
                >
                  Tỉ lệ trộn<br />Định mức
                </th>
                <th
                  className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black"
                  title="Tỉ lệ trộn thực tế (%) = KL thực tế NVL ÷ tổng KL thực tế phiếu × 100"
                >
                  Tỉ lệ trộn<br />Thực tế
                </th>
                {showQtyColumns
                  ? MIXING_ROUND_KEYS.slice(0, roundCount).map((_, roundIndex) => (
                      <th
                        key={`expand-head-${report.id}-${roundIndex}`}
                        className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black"
                      >
                        {mixingSessionColumnLabel(sessionStart, roundIndex)}
                      </th>
                    ))
                  : null}
                <th className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black">
                  KL định mức
                </th>
                <th className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black">
                  KL thực tế
                </th>
                {MIXING_ROUND_KEYS.slice(0, roundCount).flatMap((roundKey, roundIndex) => {
                  const roundLabel = mixingSessionColumnLabel(sessionStart, roundIndex);
                  const suffix = roundCount > 1 ? ` · ${roundLabel}` : '';
                  return [
                    <th
                      key={`expand-reason-head-${report.id}-${roundKey}`}
                      className="min-w-[120px] px-2 py-2 font-black"
                    >
                      Lý do{suffix}
                    </th>,
                    <th
                      key={`expand-explain-head-${report.id}-${roundKey}`}
                      className="min-w-[160px] px-2 py-2 font-black"
                    >
                      Giải trình{suffix}
                    </th>
                  ];
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(() => {
                const reportActualTotal = report.chi_tiet.reduce(
                  (sum, line) => sum + (resolveMixingLineKgForRatio(line) ?? 0),
                  0
                );
                const hasReportActual = report.chi_tiet.some(
                  line => resolveMixingLineKgForRatio(line) !== null
                );
                return report.chi_tiet.map((line, index) => {
                  const klDinhMuc = sumLineNormQuantity(line);
                  const klThucTe = resolveLineKlThucTe(line);
                  const tiLeDinhMuc = resolveLineTiLeDinhMucPercent(line);
                  const lineKgForRatio = resolveMixingLineKgForRatio(line);
                  const tiLeThucTe =
                    hasReportActual && lineKgForRatio !== null
                      ? resolveLineTiLeThucTePercent(lineKgForRatio, reportActualTotal)
                      : null;
                  return (
                    <tr key={`expand-row-${report.id}-${line.stt}-${index}`} className="hover:bg-red-50/20">
                      <td className="whitespace-nowrap px-2 py-2 font-bold text-zinc-600">{index + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono font-semibold text-zinc-700">
                        {line.ma_nvl || '-'}
                      </td>
                      <td className="px-2 py-2 text-zinc-800">{line.ten_vat_tu || '-'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-zinc-600">
                        {deriveLineUnit(line.lan_su_dung)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-bold text-sky-800">
                        {formatPercentCell(tiLeDinhMuc)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-black text-orange-800">
                        {formatPercentCell(tiLeThucTe)}
                      </td>
                      {showQtyColumns
                        ? MIXING_ROUND_KEYS.slice(0, roundCount).map(roundKey => (
                            <td
                              key={`${line.stt}-${roundKey}`}
                              className="whitespace-nowrap px-2 py-2 text-right font-mono text-zinc-700"
                            >
                              {formatNormWeight(sumLineRoundNormQuantity(line, roundKey)) || '-'}
                            </td>
                          ))
                        : null}
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-bold text-emerald-800">
                        {formatNormWeight(klDinhMuc) || '-'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-black text-[#ef1b2d]">
                        {klThucTe !== null ? formatOptionalNumber(klThucTe) : '-'}
                      </td>
                      {index === 0
                        ? MIXING_ROUND_KEYS.slice(0, roundCount).flatMap(roundKey => [
                            <td
                              key={`expand-reason-${report.id}-${roundKey}`}
                              rowSpan={report.chi_tiet.length}
                              className="min-w-[120px] max-w-[220px] align-top px-2 py-2"
                            >
                              {renderReasonList(roundReasons[roundKey])}
                            </td>,
                            <td
                              key={`expand-explain-${report.id}-${roundKey}`}
                              rowSpan={report.chi_tiet.length}
                              className="min-w-[160px] max-w-[280px] align-top px-2 py-2"
                            >
                              {renderExplanationText(roundExplanations[roundKey])}
                            </td>
                          ])
                        : null}
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-700">
              <tr>
                <td colSpan={4} className="px-2 py-2 text-right">
                  Thực tế sử dụng
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-zinc-400">—</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-black text-orange-800">
                  {report.chi_tiet.some(line => resolveMixingLineKgForRatio(line) !== null)
                    ? '100%'
                    : '-'}
                </td>
                {showQtyColumns
                  ? MIXING_ROUND_KEYS.slice(0, roundCount).map(roundKey => (
                      <td key={`expand-foot-round-${report.id}-${roundKey}`} className="px-2 py-2" />
                    ))
                  : null}
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-bold text-emerald-800">
                  {formatNormWeight(sumReportNormTotal(report.chi_tiet)) || '-'}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-black text-[#ef1b2d]">
                  {(() => {
                    const fromLines = report.chi_tiet.reduce(
                      (sum, line) => sum + (resolveLineKlThucTe(line) ?? 0),
                      0
                    );
                    const hasLineActual = report.chi_tiet.some(
                      line => resolveLineKlThucTe(line) !== null
                    );
                    const total = hasLineActual ? fromLines : report.thuc_te_su_dung;
                    return total !== null && total !== undefined
                      ? `${formatOptionalNumber(total)} kg`
                      : '-';
                  })()}
                </td>
                <td colSpan={2 * roundCount} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b-4 border-[#ef1b2d] bg-white p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <img src={vietNhatLogoUrl} alt="Viet Nhat IPT" className="h-14 w-auto max-w-[190px] object-contain" />
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#ef1b2d]">Bảng trộn vật tư</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrintFilteredReports}
                disabled={selectedCount === 0 || pendingPrint}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                In phiếu ({selectedCount})
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormModalMode('create');
                    setPendingEditReport(null);
                    setCreateModalOpen(true);
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Quay lại
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-black text-zinc-950">
                {sortedReports.length} phiếu phối trộn
              </p>
            </div>
            <p className="text-[11px] font-semibold text-zinc-500">
              Đang lọc: {formatFilterSummary(filters, machines)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Từ ngày</span>
              <input
                type="date"
                value={filters.tuNgay}
                onChange={e => setFilters(prev => ({ ...prev, tuNgay: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Đến ngày</span>
              <input
                type="date"
                value={filters.denNgay}
                onChange={e => setFilters(prev => ({ ...prev, denNgay: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
              <select
                value={filters.ca}
                onChange={e => setFilters(prev => ({ ...prev, ca: e.target.value }))}
                className={inputClass}
              >
                <option value="">Tất cả ca</option>
                {shiftOptions.map(shift => (
                  <option key={shift.value} value={shift.value}>
                    {shift.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 space-y-1 lg:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
              <select
                value={filters.machineId}
                onChange={e => setFilters(prev => ({ ...prev, machineId: e.target.value }))}
                className={inputClass}
              >
                <option value="">Tất cả máy</option>
                {machines.map(machine => (
                  <option key={machine.id} value={machine.id}>
                    {machine.code} · {machine.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-2 flex items-end gap-2 lg:col-span-1">
              <button
                type="button"
                onClick={() => setFilters(emptyFilters())}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[10px] font-black text-zinc-600 transition hover:bg-zinc-100"
              >
                Xóa lọc
              </button>
              <button
                type="button"
                onClick={() => setReloadTick(tick => tick + 1)}
                className="inline-flex h-9 flex-[2] items-center justify-center gap-1 rounded-lg bg-[#ef1b2d] px-2 text-[10px] font-extrabold text-white transition hover:bg-[#b30d1c]"
              >
                <Search className="h-3.5 w-3.5" />
                Lọc
              </button>
            </div>
          </div>
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

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-zinc-950">Danh sách phiếu phối trộn</p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Theo ngày · ca · máy / lần (`bao_cao_phoi_tron`)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canDelete ? (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0 || bulkDeleting || isLoading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Xoá đã chọn ({selectedCount})
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedCount === 0 || bulkDeleting || isLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bỏ chọn
              </button>
            </div>
          </div>
        </div>
        {isLoading ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : dateGroups.length === 0 ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            Chưa có phiếu phối trộn phù hợp bộ lọc.
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            {dateGroups.map(group => {
              const groupReportIds = group.reports.map(report => report.id).filter(Boolean);
              const isGroupSelected =
                groupReportIds.length > 0 && groupReportIds.every(id => selectedIds.has(id));
              return (
              <div key={group.ngay} className="overflow-hidden rounded-xl border border-zinc-200">
                <div className="flex items-baseline justify-between gap-1.5 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                    <span className="font-mono text-xs font-black text-zinc-900">{group.ngay}</span>
                  </div>
                  <span className="text-[11px] font-black text-emerald-800">{group.reports.length} phiếu</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
                      <tr>
                        <th className="w-10 px-3 py-2 text-center font-black">
                          <input
                            type="checkbox"
                            checked={isGroupSelected}
                            onChange={() => toggleSelectAll(groupReportIds)}
                            aria-label={`Chọn tất cả phiếu ngày ${group.ngay}`}
                            className="h-4 w-4 accent-[#ef1b2d]"
                          />
                        </th>
                        <th className="px-3 py-2 font-black">Ca</th>
                        <th className="px-3 py-2 font-black">Lần</th>
                        <th className="px-3 py-2 font-black">Giờ</th>
                        <th className="px-3 py-2 font-black">Máy</th>
                        <th className="px-3 py-2 font-black">Nhân sự</th>
                        <th className="px-3 py-2 font-black">Dòng VT</th>
                        <th className="px-3 py-2 text-right font-black">KL định mức</th>
                        <th className="px-3 py-2 text-right font-black">KL thực tế</th>
                        <th className="px-3 py-2 text-center font-black">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {group.reports.flatMap(report => {
                        const rounds = expandReportRounds(report);
                        const isExpanded = viewingReportId === report.id;
                        const roundRows = rounds.map(round => (
                          <tr
                            key={`${report.id}-${round.session}`}
                            onClick={() => toggleExpandedReport(report.id)}
                            className={`cursor-pointer transition ${
                              isExpanded ? 'bg-emerald-50/70' : 'hover:bg-emerald-50/40'
                            }`}
                            title={isExpanded ? 'Thu gọn chi tiết' : 'Bấm để xem đầy đủ dòng vật tư'}
                          >
                            {round.session === rounds[0].session ? (
                              <td
                                className="whitespace-nowrap px-3 py-2 text-center"
                                rowSpan={rounds.length}
                                onClick={event => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(report.id)}
                                  onChange={() => toggleSelected(report.id)}
                                  aria-label="Chọn phiếu"
                                  className="h-4 w-4 accent-[#ef1b2d]"
                                />
                              </td>
                            ) : null}
                            <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-800">
                              <span className="inline-flex items-center gap-1">
                                {round.session === rounds[0].session ? (
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                                      isExpanded ? 'rotate-180 text-emerald-700' : ''
                                    }`}
                                  />
                                ) : (
                                  <span className="inline-block w-3.5" />
                                )}
                                {report.ca || '-'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-800">
                              {round.label}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-600">
                              {report.gio || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                              {report.ten_may || report.ma_may || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                              {report.nhan_su || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-700">
                              {round.lineCount}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold text-emerald-700">
                              {formatNormWeight(round.normTotal) || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold text-[#ef1b2d]">
                              {round.actualTotal !== null ? formatOptionalNumber(round.actualTotal) : '-'}
                            </td>
                            {round.session === rounds[0].session ? (
                              <td
                                className="whitespace-nowrap px-3 py-2 text-center"
                                rowSpan={rounds.length}
                                onClick={event => event.stopPropagation()}
                              >
                                <RowActionsMenu label="Thao tác báo cáo phối trộn">
                                  {renderReportActions(report)}
                                </RowActionsMenu>
                              </td>
                            ) : null}
                          </tr>
                        ));

                        if (!isExpanded) return roundRows;

                        return [
                          ...roundRows,
                          <tr key={`${report.id}-detail`} className="bg-slate-50/80">
                            <td colSpan={10} className="px-3 py-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wider text-emerald-800">
                                    Chi tiết dòng vật tư
                                  </p>
                                  <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                                    {report.ngay || '-'} · {report.ca || '-'} · {report.gio || '-'} ·{' '}
                                    {report.ten_may || report.ma_may || '-'} ·{' '}
                                    {formatMixingReportSessionLabel(report)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleExpandedReport(report.id)}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-bold text-zinc-600 transition hover:bg-zinc-50"
                                >
                                  <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                                  Thu gọn
                                </button>
                              </div>
                              {renderExpandedReportDetail(report)}
                            </td>
                          </tr>
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {previewPhoto ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950/95">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">{previewPhoto.label}</p>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-bold text-white transition hover:bg-[#b30d1c]"
            >
              <X className="h-3.5 w-3.5" />
              Đóng ảnh
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <img
              src={previewPhoto.url}
              alt={previewPhoto.label}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      ) : null}

      {createModalOpen && (canCreate || (canEdit && pendingEditReport)) ? (
        <MixingReportForm
          modalMode
          open
          editReport={pendingEditReport}
          onEditConsumed={() => setPendingEditReport(null)}
          onClose={() => {
            setCreateModalOpen(false);
            setPendingEditReport(null);
            setFormModalMode('create');
          }}
          onSaved={async () => {
            setMessage(
              formModalMode === 'edit' ? 'Đã cập nhật báo cáo phối trộn.' : 'Đã lưu báo cáo phối trộn.'
            );
            await loadReports(filters, machines);
          }}
        />
      ) : null}

      {printReports.length > 0 ? <MixingReportPrintBatch reports={printReports} /> : null}
    </div>
  );
}
