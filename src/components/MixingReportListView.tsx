import React, { useEffect, useMemo, useState } from 'react';
import { useTabAccess } from '../app/useTabAccess';
import { ChevronLeft, ClipboardList, Eye, Loader2, Pencil, Plus, Printer, Search, Trash2, X } from 'lucide-react';
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
import { waitForPrintImagesReady } from '../utils/printReady';
import type { MixingReport } from './MixingReportForm';
import MixingReportForm from './MixingReportForm';
import MixingNormMaterialsTab from './MixingNormMaterialsTab';
import ActualMixingSheetTab from './ActualMixingSheetTab';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
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
  TableEmptyRow,
  RowActionsMenu
} from './shared/table';

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

type RelatedMixingSlipKind = 'report' | 'norm' | 'actual';

type RelatedMixingSlip = {
  kind: RelatedMixingSlipKind;
  id: string;
  ngay: string;
  ca: string;
  title: string;
  detail: string;
  meta: string;
};

function inFilterDateRange(ngay: string, tuNgay: string, denNgay: string) {
  const date = String(ngay || '').slice(0, 10);
  if (!date || date === '-') return !tuNgay && !denNgay;
  if (tuNgay && date < tuNgay) return false;
  if (denNgay && date > denNgay) return false;
  return true;
}

function relatedKindLabel(kind: RelatedMixingSlipKind) {
  if (kind === 'norm') return 'Định mức';
  if (kind === 'actual') return 'Thực tế';
  return 'Phối trộn';
}

function relatedKindClass(kind: RelatedMixingSlipKind) {
  if (kind === 'norm') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (kind === 'actual') return 'bg-sky-50 text-sky-800 border-sky-200';
  return 'bg-emerald-50 text-emerald-800 border-emerald-200';
}

function compareMixingReportsForList(
  left: MixingReport,
  right: MixingReport,
  shiftOptions: ReturnType<typeof getProductionShiftOptions>
) {
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
  onBack
}: {
  onBack: () => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('mixing-report-list');
  const [filters, setFilters] = useState<MixingReportFilters>(emptyFilters);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [reports, setReports] = useState<MixingReport[]>([]);
  const [normSlips, setNormSlips] = useState<RelatedMixingSlip[]>([]);
  const [actualSlips, setActualSlips] = useState<RelatedMixingSlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);
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
  const [listTab, setListTab] = useState<'reports' | 'norms' | 'actual'>('reports');
  const [searchText, setSearchText] = useState('');

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const visibleReports = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter(report =>
      `${report.ca} ${report.gio} ${report.ma_may} ${report.ten_may} ${report.nhan_su} ${report.chi_tiet
        .map(line => `${line.ma_nvl} ${line.ten_vat_tu}`)
        .join(' ')}`
        .toLowerCase()
        .includes(query)
    );
  }, [reports, searchText]);
  const sortedReports = useMemo(
    () => [...visibleReports].sort((left, right) => compareMixingReportsForList(left, right, shiftOptions)),
    [visibleReports, shiftOptions]
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
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([ngay, groupReports]) => ({ ngay, reports: groupReports }));
  }, [sortedReports]);

  const relatedSlips = useMemo(() => {
    const machine = machines.find(item => item.id === filters.machineId);
    const query = searchText.trim().toLowerCase();

    const reportRows: RelatedMixingSlip[] = reports.map(report => ({
      kind: 'report' as const,
      id: report.id,
      ngay: report.ngay || '-',
      ca: report.ca || '-',
      title: report.ten_may || report.ma_may || 'Phiếu phối trộn',
      detail: report.nhan_su || report.gio || '—',
      meta: `${report.chi_tiet.length} dòng VT · ${formatMixingReportSessionLabel(report)}`
    }));

    const rows = [...reportRows, ...normSlips, ...actualSlips].filter(row => {
      if (!inFilterDateRange(row.ngay, filters.tuNgay, filters.denNgay)) return false;
      if (filters.ca && !shiftNamesMatch(row.ca, filters.ca) && row.ca !== filters.ca) return false;
      // Lọc máy chỉ áp dụng phiếu phối trộn (định mức/thực tế không gắn máy).
      if (machine && row.kind === 'report') {
        const report = reports.find(item => item.id === row.id);
        if (!report) return false;
        if (report.ma_may && machine.code && report.ma_may !== machine.code) return false;
      }
      if (!query) return true;
      return `${row.title} ${row.detail} ${row.meta} ${row.ca} ${row.ngay} ${relatedKindLabel(row.kind)}`
        .toLowerCase()
        .includes(query);
    });

    return rows.sort((left, right) => {
      const byDate = right.ngay.localeCompare(left.ngay);
      if (byDate !== 0) return byDate;
      const byCa = left.ca.localeCompare(right.ca, 'vi');
      if (byCa !== 0) return byCa;
      const order = { report: 0, norm: 1, actual: 2 } as const;
      return order[left.kind] - order[right.kind];
    });
  }, [reports, normSlips, actualSlips, filters, machines, searchText]);

  const relatedCounts = useMemo(() => {
    return {
      report: relatedSlips.filter(row => row.kind === 'report').length,
      norm: relatedSlips.filter(row => row.kind === 'norm').length,
      actual: relatedSlips.filter(row => row.kind === 'actual').length
    };
  }, [relatedSlips]);

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
    const [reportRes, normRes, actualRes] = await Promise.all([
      fetch(`/api/bao-cao-phoi-tron${query ? `?${query}` : ''}`),
      fetch('/api/bang-tron-vat-tu-dinh-muc'),
      fetch('/api/phieu-tron-thuc-te')
    ]);
    const reportData = await reportRes.json().catch(() => ({}));
    const normData = await normRes.json().catch(() => ({}));
    const actualData = await actualRes.json().catch(() => ({}));
    if (!reportRes.ok) throw new Error(reportData.error || 'Không thể tải báo cáo phối trộn.');

    const list = Array.isArray(reportData.reports) ? reportData.reports : [];
    setReports(list.map((item: Record<string, unknown>) => normalizeMixingReport(item)));

    const norms = Array.isArray(normData.records) ? normData.records : [];
    setNormSlips(
      norms
        .map((row: Record<string, unknown>): RelatedMixingSlip | null => {
          const id = String(row.id ?? '').trim();
          if (!id) return null;
          const chiTiet = Array.isArray(row.chi_tiet) ? row.chi_tiet : [];
          const maLenh = String(row.ma_lenh_sx ?? '').trim();
          return {
            kind: 'norm',
            id,
            ngay: String(row.ngay ?? '').slice(0, 10) || '-',
            ca: String(row.ca ?? '').trim() || '-',
            title: maLenh || 'Phiếu định mức',
            detail: `${chiTiet.length} SP`,
            meta: String(row.ghi_chu ?? '').trim() || 'Định mức QC'
          };
        })
        .filter((row): row is RelatedMixingSlip => Boolean(row))
    );

    const actuals = Array.isArray(actualData.records) ? actualData.records : [];
    setActualSlips(
      actuals
        .map((row: Record<string, unknown>): RelatedMixingSlip | null => {
          const id = String(row.id ?? '').trim();
          if (!id) return null;
          const chiTiet = Array.isArray(row.chi_tiet) ? row.chi_tiet : [];
          const maLenh = String(row.ma_lenh_sx ?? '').trim();
          return {
            kind: 'actual',
            id,
            ngay: String(row.ngay ?? '').slice(0, 10) || '-',
            ca: String(row.ca ?? '').trim() || '-',
            title: maLenh || 'Phiếu thực tế',
            detail: `${chiTiet.length} SP`,
            meta: String(row.ghi_chu ?? '').trim() || 'Theo định mức'
          };
        })
        .filter((row): row is RelatedMixingSlip => Boolean(row))
    );
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
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printReports]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintReports([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrintFilteredReports = () => {
    if (sortedReports.length === 0) {
      setError('Không có phiếu nào để in.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setPrintReports(sortedReports);
    setPendingPrint(true);
  };

  const viewingReport = useMemo(
    () => reports.find(report => report.id === viewingReportId) ?? null,
    [reports, viewingReportId]
  );

  const viewingRoundCount = useMemo(() => {
    if (!viewingReport) return 1;
    const fromLines = viewingReport.chi_tiet.reduce(
      (max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)),
      1
    );
    return Math.min(MIXING_MAX_ROUNDS, Math.max(viewingReport.so_lan || 1, fromLines));
  }, [viewingReport]);

  const detailSessionStart = viewingReport?.lan_thu && viewingReport.lan_thu > 0 ? viewingReport.lan_thu : 1;

  const viewingRoundPhotos = useMemo(() => {
    if (!viewingReport) return {} as Partial<Record<(typeof MIXING_ROUND_KEYS)[number], MixingRoundPhoto[]>>;
    return resolveMixingReportRoundPhotos(viewingReport);
  }, [viewingReport]);

  const viewingRoundReasons = useMemo(() => {
    if (!viewingReport) return {} as Partial<Record<(typeof MIXING_ROUND_KEYS)[number], string[]>>;
    return resolveMixingReportRoundReasons(viewingReport);
  }, [viewingReport]);

  const viewingRoundExplanations = useMemo(() => {
    if (!viewingReport) return {} as Partial<Record<(typeof MIXING_ROUND_KEYS)[number], string>>;
    return resolveMixingReportRoundExplanations(viewingReport);
  }, [viewingReport]);

  const showDetailQuantityColumns = viewingRoundCount > 1;

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

  const allReportIds = useMemo(() => reports.map(report => report.id).filter(Boolean), [reports]);
  const selectedCount = selectedIds.size;
  const allSelected = allReportIds.length > 0 && selectedIds.size === allReportIds.length;

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(() => (allSelected ? new Set() : new Set(allReportIds)));
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
    setFormModalMode('edit');
    setPendingEditReport(report);
    setCreateModalOpen(true);
  };

  const renderReportActions = (report: MixingReport) => (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => setViewingReportId(report.id)}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-[11px] font-bold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
        title="Xem chi tiết"
      >
        <Eye className="h-3.5 w-3.5" />
        Xem
      </button>
      {canEdit ? (
        <button
          type="button"
          onClick={() => openEditReport(report)}
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
          onClick={() => void handleDelete(report.id)}
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
              {listTab === 'reports' && (
                <>
                  <button
                    type="button"
                    onClick={handlePrintFilteredReports}
                    disabled={sortedReports.length === 0}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Printer className="h-4 w-4" />
                    In danh sách
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
                </>
              )}
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

        <div className="grid gap-2 border-b border-zinc-100 bg-white px-4 py-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setListTab('reports')}
            aria-pressed={listTab === 'reports'}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
              listTab === 'reports'
                ? 'border-[#ef1b2d] bg-red-50'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <span className="block text-sm font-black text-zinc-950">Danh sách phiếu phối trộn</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
              Gộp phiếu phối trộn · định mức · thực tế
            </span>
          </button>
          <button
            type="button"
            onClick={() => setListTab('norms')}
            aria-pressed={listTab === 'norms'}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
              listTab === 'norms'
                ? 'border-[#ef1b2d] bg-red-50'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <span className="block text-sm font-black text-zinc-950">Phiếu trộn định mức</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
              Lệnh SX → Sản phẩm → NVL, lưu bảng riêng
            </span>
          </button>
          <button
            type="button"
            onClick={() => setListTab('actual')}
            aria-pressed={listTab === 'actual'}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
              listTab === 'actual'
                ? 'border-[#ef1b2d] bg-red-50'
                : 'border-zinc-200 bg-white hover:border-zinc-300'
            }`}
          >
            <span className="block text-sm font-black text-zinc-950">Phiếu trộn thực tế</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-zinc-500">
              Chọn ngày + ca, nhập % thực tế
            </span>
          </button>
        </div>

        {listTab === 'reports' && (
        <div className="space-y-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-black text-zinc-950">
                {relatedCounts.report} phối trộn · {relatedCounts.norm} định mức · {relatedCounts.actual} thực tế
              </p>
            </div>
            <p className="text-[11px] font-semibold text-zinc-500">
              Đang lọc: {formatFilterSummary(filters, machines)}
            </p>
          </div>
          <div className="hidden">
          <TableToolbar
            isLoading={isLoading}
            hasActiveFilters={Boolean(searchText || filters.ca || filters.machineId || filters.tuNgay || filters.denNgay)}
            onResetFilters={() => {
              setSearchText('');
              setFilters(emptyFilters());
            }}
          >
            <TableSearchInput
              value={searchText}
              onChange={value => {
                setSearchText(value);
              }}
              placeholder="Tìm máy, nhân sự, mã hoặc tên vật tư..."
              disabled={isLoading}
            />
            <FilterCombobox
              label="Ca"
              options={shiftOptions.map(shift => shift.value)}
              value={filters.ca || 'all'}
              onChange={value => setFilters(prev => ({ ...prev, ca: value === 'all' ? '' : value }))}
              formatOption={value => shiftOptions.find(shift => shift.value === value)?.label || value}
              compact
            />
            <FilterCombobox
              label="Máy"
              options={machines.map(machine => machine.id)}
              value={filters.machineId || 'all'}
              onChange={value => setFilters(prev => ({ ...prev, machineId: value === 'all' ? '' : value }))}
              formatOption={value => {
                const machine = machines.find(item => item.id === value);
                return machine ? `${machine.code} · ${machine.name}` : value;
              }}
              compact
            />
            <TableDateFilter
              label="Từ ngày"
              value={filters.tuNgay}
              onChange={value => setFilters(prev => ({ ...prev, tuNgay: value }))}
            />
            <TableDateFilter
              label="Đến ngày"
              value={filters.denNgay}
              onChange={value => setFilters(prev => ({ ...prev, denNgay: value }))}
            />
          </TableToolbar>
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
        )}
      </section>

      {listTab === 'norms' ? (
        <MixingNormMaterialsTab />
      ) : listTab === 'actual' ? (
        <ActualMixingSheetTab />
      ) : (
        <>
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
              <p className="text-sm font-black text-zinc-950">Danh sách phiếu trộn</p>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Phối trộn / định mức QC / thực tế — cùng bộ lọc ngày · ca
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
                  Xoá phiếu phối trộn đã chọn ({selectedCount})
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
        ) : relatedSlips.length === 0 ? (
          <div className="px-3 py-8 text-center font-bold text-zinc-400">
            Chưa có phiếu trộn phù hợp bộ lọc (phối trộn / định mức / thực tế).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                <tr>
                  <th className="w-10 px-3 py-2 text-center font-black">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Chọn tất cả phiếu phối trộn"
                      className="h-4 w-4 accent-[#ef1b2d]"
                      title="Chỉ chọn phiếu phối trộn"
                    />
                  </th>
                  <th className="px-3 py-2 font-black">Loại</th>
                  <th className="px-3 py-2 font-black">Ngày</th>
                  <th className="px-3 py-2 font-black">Ca</th>
                  <th className="px-3 py-2 font-black">Nội dung</th>
                  <th className="px-3 py-2 font-black">Chi tiết</th>
                  <th className="px-3 py-2 text-center font-black">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {relatedSlips.map(row => {
                  const report = row.kind === 'report' ? reports.find(item => item.id === row.id) : null;
                  return (
                    <tr key={`${row.kind}-${row.id}`} className="transition hover:bg-emerald-50/40">
                      <td className="whitespace-nowrap px-3 py-2 text-center">
                        {row.kind === 'report' ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelected(row.id)}
                            aria-label="Chọn phiếu phối trộn"
                            className="h-4 w-4 accent-[#ef1b2d]"
                          />
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${relatedKindClass(row.kind)}`}
                        >
                          {relatedKindLabel(row.kind)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-zinc-800">{row.ngay}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-zinc-800">{row.ca || '-'}</td>
                      <td className="px-3 py-2 font-bold text-zinc-900">{row.title}</td>
                      <td className="px-3 py-2 text-zinc-600">
                        <span className="font-semibold text-zinc-800">{row.detail}</span>
                        {row.meta ? <span className="mt-0.5 block text-[11px] text-zinc-500">{row.meta}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center">
                        {row.kind === 'report' && report ? (
                          <RowActionsMenu label="Thao tác báo cáo phối trộn">
                            {renderReportActions(report)}
                          </RowActionsMenu>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setListTab(row.kind === 'norm' ? 'norms' : 'actual')}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-bold text-zinc-700 transition hover:bg-zinc-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Mở tab
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dateGroups.length > 0 ? (
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <p className="text-sm font-black text-zinc-950">Chi tiết phiếu phối trộn theo máy / lần</p>
          <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
            Chỉ các phiếu lưu ở form báo cáo phối trộn (`bao_cao_phoi_tron`)
          </p>
        </div>
          <div className="space-y-3 p-3 sm:p-4">
            {dateGroups.map(group => (
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
                    <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                      <tr>
                        <th className="w-10 px-3 py-2 text-center font-black">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            aria-label="Chọn tất cả"
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
                        return rounds.map(round => (
                          <tr
                            key={`${report.id}-${round.session}`}
                            className="transition hover:bg-emerald-50/40"
                          >
                            {round.session === rounds[0].session ? (
                              <td className="whitespace-nowrap px-3 py-2 text-center" rowSpan={rounds.length}>
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
                              {report.ca || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-800">{round.label}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-zinc-600">{report.gio || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-700">
                              {report.ten_may || report.ma_may || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{report.nhan_su || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-zinc-700">{round.lineCount}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold text-emerald-700">
                              {formatNormWeight(round.normTotal) || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold text-[#ef1b2d]">
                              {round.actualTotal !== null ? formatOptionalNumber(round.actualTotal) : '-'}
                            </td>
                            {round.session === rounds[0].session ? (
                              <td className="whitespace-nowrap px-3 py-2 text-center" rowSpan={rounds.length}>
                                <RowActionsMenu label="Thao tác báo cáo phối trộn">
                                  {renderReportActions(report)}
                                </RowActionsMenu>
                              </td>
                            ) : null}
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
      </section>
      ) : null}

      {viewingReport && (        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="relative flex max-h-[96vh] w-full max-w-[min(96vw,1280px)] flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
              <div>
                <h3 className="text-lg font-black text-zinc-950">Chi tiết các dòng vật tư</h3>
                <p className="mt-1 text-sm font-medium text-zinc-500">
                  {viewingReport.ngay || '-'} · {viewingReport.ca || '-'} · {viewingReport.gio || '-'} ·{' '}
                  {viewingReport.ten_may || viewingReport.ma_may || '-'}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-400">
                  Nhân sự: {viewingReport.nhan_su || '-'} · {formatMixingReportSessionLabel(viewingReport)} · Thực tế:{' '}
                  {formatOptionalNumber(viewingReport.thuc_te_su_dung) || '-'} kg
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingReportId(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {viewingReport.chi_tiet.length === 0 ? (
                <p className="py-8 text-center text-sm font-bold text-zinc-400">Phiếu này chưa có dòng vật tư.</p>
              ) : (
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-[min(100%,300px)]">
                    <div className="max-h-[min(58vh,520px)] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      {showDetailQuantityColumns ? (
                        <div className="space-y-4">
                          {MIXING_ROUND_KEYS.slice(0, viewingRoundCount).map((roundKey, roundIndex) => {
                            const roundLabel = `Ảnh · ${mixingSessionColumnLabel(detailSessionStart, roundIndex)}`;
                            return (
                            <div key={`detail-photos-${roundKey}`}>
                              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                {roundLabel}
                              </p>
                              {renderPhotoGallery(
                                viewingRoundPhotos[roundKey] ?? [],
                                'Chưa có ảnh xác nhận',
                                'detail',
                                roundLabel
                              )}
                              <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                    Lý do
                                  </p>
                                  <div className="mt-1">{renderReasonList(viewingRoundReasons[roundKey])}</div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                    Giải trình
                                  </p>
                                  <div className="mt-1">
                                    {renderExplanationText(viewingRoundExplanations[roundKey])}
                                  </div>
                                </div>
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Ảnh · {mixingSessionColumnLabel(detailSessionStart, 0)}
                          </p>
                          {renderPhotoGallery(
                            MIXING_ROUND_KEYS.slice(0, viewingRoundCount).flatMap(
                              roundKey => viewingRoundPhotos[roundKey] ?? []
                            ),
                            'Chưa có ảnh xác nhận',
                            'detail',
                            `Ảnh · ${mixingSessionColumnLabel(detailSessionStart, 0)}`
                          )}
                          <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-white p-2.5">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Lý do</p>
                              <div className="mt-1">
                                {renderReasonList(viewingRoundReasons[MIXING_ROUND_KEYS[0]])}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                                Giải trình
                              </p>
                              <div className="mt-1">
                                {renderExplanationText(viewingRoundExplanations[MIXING_ROUND_KEYS[0]])}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </aside>

                  <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                        <tr>
                          <th className="w-10 px-2 py-2 font-black">STT</th>
                          <th className="px-2 py-2 font-black">Mã NVL</th>
                          <th className="px-2 py-2 font-black">Tên vật tư</th>
                          <th className="px-2 py-2 font-black">ĐVT</th>
                          {showDetailQuantityColumns
                            ? MIXING_ROUND_KEYS.slice(0, viewingRoundCount).map((_, roundIndex) => (
                                <th
                                  key={`detail-head-${roundIndex}`}
                                  className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black"
                                >
                                  {mixingSessionColumnLabel(detailSessionStart, roundIndex)}
                                </th>
                              ))
                            : null}
                          <th className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black">
                            KL định mức
                          </th>
                          <th className="min-w-[72px] whitespace-nowrap px-2 py-2 text-right font-black">
                            KL thực tế
                          </th>
                          {MIXING_ROUND_KEYS.slice(0, viewingRoundCount).flatMap((roundKey, roundIndex) => {
                            const roundLabel = mixingSessionColumnLabel(detailSessionStart, roundIndex);
                            const suffix = viewingRoundCount > 1 ? ` · ${roundLabel}` : '';
                            return [
                              <th
                                key={`detail-reason-head-${roundKey}`}
                                className="min-w-[120px] px-2 py-2 font-black"
                              >
                                Lý do{suffix}
                              </th>,
                              <th
                                key={`detail-explain-head-${roundKey}`}
                                className="min-w-[160px] px-2 py-2 font-black"
                              >
                                Giải trình{suffix}
                              </th>
                            ];
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 bg-white">
                        {viewingReport.chi_tiet.map((line, index) => {
                          const klDinhMuc = sumLineNormQuantity(line);
                          const klThucTe = resolveLineKlThucTe(line);
                          return (
                            <tr key={`detail-row-${line.stt}-${index}`} className="hover:bg-red-50/20">
                              <td className="whitespace-nowrap px-2 py-2 font-bold text-zinc-600">{index + 1}</td>
                              <td className="whitespace-nowrap px-2 py-2 font-mono font-semibold text-zinc-700">
                                {line.ma_nvl || '-'}
                              </td>
                              <td className="px-2 py-2 text-zinc-800">{line.ten_vat_tu || '-'}</td>
                              <td className="whitespace-nowrap px-2 py-2 text-zinc-600">
                                {deriveLineUnit(line.lan_su_dung)}
                              </td>
                              {showDetailQuantityColumns
                                ? MIXING_ROUND_KEYS.slice(0, viewingRoundCount).map(roundKey => (
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
                                ? MIXING_ROUND_KEYS.slice(0, viewingRoundCount).flatMap(roundKey => [
                                    <td
                                      key={`detail-reason-${roundKey}`}
                                      rowSpan={viewingReport.chi_tiet.length}
                                      className="min-w-[120px] max-w-[220px] align-top px-2 py-2"
                                    >
                                      {renderReasonList(viewingRoundReasons[roundKey])}
                                    </td>,
                                    <td
                                      key={`detail-explain-${roundKey}`}
                                      rowSpan={viewingReport.chi_tiet.length}
                                      className="min-w-[160px] max-w-[280px] align-top px-2 py-2"
                                    >
                                      {renderExplanationText(viewingRoundExplanations[roundKey])}
                                    </td>
                                  ])
                                : null}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-700">
                        <tr>
                          <td colSpan={4 + (showDetailQuantityColumns ? viewingRoundCount : 0)} className="px-2 py-2 text-right">
                            Thực tế sử dụng
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono font-bold text-emerald-800">
                            {formatNormWeight(sumReportNormTotal(viewingReport.chi_tiet)) || '-'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-black text-[#ef1b2d]">
                            {(() => {
                              const fromLines = viewingReport.chi_tiet.reduce(
                                (sum, line) => sum + (resolveLineKlThucTe(line) ?? 0),
                                0
                              );
                              const hasLineActual = viewingReport.chi_tiet.some(
                                line => resolveLineKlThucTe(line) !== null
                              );
                              const total = hasLineActual ? fromLines : viewingReport.thuc_te_su_dung;
                              return total !== null && total !== undefined
                                ? `${formatOptionalNumber(total)} kg`
                                : '-';
                            })()}
                          </td>
                          <td colSpan={2 * viewingRoundCount}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-zinc-200 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setViewingReportId(null)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 sm:w-auto sm:px-4"
              >
                Đóng
              </button>
            </div>

            {previewPhoto ? (
              <div className="absolute inset-0 z-20 flex flex-col bg-zinc-950/95">
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
          </div>
        </div>
      )}
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
        </>
      )}
    </div>
  );
}
