import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { DateInput } from '../../components/shared/DateInput';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { formatDateDdMmYyyy } from '../../utils/dateFormat';
import { normalizeHrBranches } from '../_shared/hr';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  type ShiftOption
} from '../../utils/shiftSettings';

function todayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeBranchKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isHcmBranch(name: string) {
  const key = normalizeBranchKey(name);
  return key.includes('hcm') || key.includes('ho chi minh') || key.includes('sai gon');
}

export type PhanCongCvRow = {
  key: string;
  id?: number | string;
  ngay: string;
  ca: string;
  congViec: string;
  nhanSuPhuTrach: string;
  thanhPham: string;
  dmThanhPhamTT: string;
  ghiChu: string;
};

type StaffOption = { id: string; name: string; role: string };
type JobOption = { value: string; label: string };
type PlanGroup = { key: string; ngay: string; ca: string; rowCount: number };

function emptyRow(ngay = '', ca = ''): PhanCongCvRow {
  return {
    key: `pcv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ngay,
    ca,
    congViec: '',
    nhanSuPhuTrach: '',
    thanhPham: '',
    dmThanhPhamTT: '',
    ghiChu: ''
  };
}

function normalizeRows(data: unknown): PhanCongCvRow[] {
  const rows = Array.isArray((data as { rows?: unknown })?.rows)
    ? ((data as { rows: unknown[] }).rows)
    : Array.isArray(data)
      ? data
      : [];
  return rows
    .map((item, index): PhanCongCvRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      return {
        key: `pcv-${record.id ?? index}-${index}`,
        id: (record.id as number | string | undefined) ?? undefined,
        ngay: String(record.ngay ?? '').slice(0, 10),
        ca: String(record.ca ?? '').trim(),
        congViec: String(record.cong_viec ?? record.congViec ?? '').trim(),
        nhanSuPhuTrach: String(record.nhan_su_phu_trach ?? record.nhanSuPhuTrach ?? '').trim(),
        thanhPham: String(record.thanh_pham ?? record.thanhPham ?? '').trim(),
        dmThanhPhamTT: String(
          record.dm_thanh_pham_TT ?? record.dm_thanh_pham_tt ?? record.dmThanhPhamTT ?? ''
        ).trim(),
        ghiChu: String(record.ghi_chu ?? record.ghiChu ?? '').trim()
      };
    })
    .filter((row): row is PhanCongCvRow => Boolean(row));
}

function collectHcmStaff(data: unknown): StaffOption[] {
  const branches = normalizeHrBranches(data);
  const hcmBranch =
    branches.find(branch => isHcmBranch(branch.name)) ||
    branches.find(branch => isHcmBranch(branch.shortName)) ||
    null;
  const source = hcmBranch ? [hcmBranch] : branches;
  const members: StaffOption[] = [];
  const seen = new Set<string>();

  source.forEach(branch => {
    branch.departments.forEach(department => {
      department.members.forEach(member => {
        const name = member.name.trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        members.push({
          id: member.id || member.code || name,
          name,
          role: String(member.role || member.position || '').trim()
        });
      });
    });
  });

  return members.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function uniqueJobOptions(values: string[]): JobOption[] {
  const seen = new Set<string>();
  const options: JobOption[] = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ value, label: value });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

function buildPlanGroups(rows: PhanCongCvRow[]): PlanGroup[] {
  const map = new Map<string, PlanGroup>();
  for (const row of rows) {
    if (!row.ngay || !row.ca) continue;
    const key = `${row.ngay}|${row.ca}`;
    const existing = map.get(key);
    if (existing) {
      existing.rowCount += 1;
      continue;
    }
    map.set(key, { key, ngay: row.ngay, ca: row.ca, rowCount: 1 });
  }
  return [...map.values()].sort((a, b) => {
    const byDate = b.ngay.localeCompare(a.ngay);
    if (byDate !== 0) return byDate;
    return a.ca.localeCompare(b.ca, 'vi');
  });
}

const fieldClass =
  'h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const cellClass =
  'h-9 w-full min-w-0 border-0 bg-transparent px-1.5 text-sm font-semibold text-zinc-800 outline-none focus:bg-red-50';

const DEFAULT_JOB_SUGGESTIONS = [
  'Phụ kho',
  'Bảo trì máy bao bì',
  'Bảo trì máy cách nhiệt',
  'Xử lý hàng rác màng xi',
  'Xử lý lựa nối cách nhiệt lỗi'
];

function PhanCongCvPrintSheet({
  ngay,
  ca,
  rows
}: {
  ngay: string;
  ca: string;
  rows: PhanCongCvRow[];
}) {
  const printDate = formatDateDdMmYyyy(ngay) || formatDateDdMmYyyy(new Date());
  const filled = rows.filter(
    row =>
      row.congViec.trim() ||
      row.nhanSuPhuTrach.trim() ||
      row.thanhPham.trim() ||
      row.dmThanhPhamTT.trim() ||
      row.ghiChu.trim()
  );

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
            <h1>KẾ HOẠCH CV — PHÂN CÔNG CÔNG VIỆC</h1>
          </div>
          <p className="production-plan-print-date">
            Ngày: {printDate} · Ca: {ca || '—'}
          </p>
        </header>

        <table className="production-plan-print-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Công việc (task)</th>
              <th>Nhân sự phụ trách</th>
              <th>Thành phẩm</th>
              <th>ĐM thành phẩm TT</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {filled.map((row, index) => (
              <tr key={row.key}>
                <td className="production-plan-print-center">{index + 1}</td>
                <td>{row.congViec || '—'}</td>
                <td>{row.nhanSuPhuTrach || '—'}</td>
                <td>{row.thanhPham || '—'}</td>
                <td className="production-plan-print-center">{row.dmThanhPhamTT || '—'}</td>
                <td>{row.ghiChu || '—'}</td>
              </tr>
            ))}
            {filled.length === 0 ? (
              <tr>
                <td className="production-plan-print-center" colSpan={6}>
                  Không có dữ liệu phân công công việc.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="production-plan-print-signatures">
          <div>
            <p>Người lập</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
          <div>
            <p>Quản đốc</p>
            <span>(Ký, ghi rõ họ tên)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PhanCongCvPanel({
  defaultDate = '',
  canEdit = true,
  addRowTick = 0
}: {
  defaultDate?: string;
  canEdit?: boolean;
  addRowTick?: number;
}) {
  const [ngay, setNgay] = useState(defaultDate || todayDateInputValue());
  const [ca, setCa] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [knownJobs, setKnownJobs] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<PhanCongCvRow[]>([]);
  const [rows, setRows] = useState<PhanCongCvRow[]>([emptyRow()]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(true);
  const [printSheet, setPrintSheet] = useState<{ ngay: string; ca: string; rows: PhanCongCvRow[] } | null>(
    null
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const planGroups = useMemo(() => buildPlanGroups(allRows), [allRows]);
  const plansByDate = useMemo(() => {
    const map = new Map<string, PlanGroup[]>();
    for (const plan of planGroups) {
      const list = map.get(plan.ngay) || [];
      list.push(plan);
      map.set(plan.ngay, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [planGroups]);

  const jobOptions = useMemo(() => {
    const fromRows = rows.map(row => row.congViec);
    return uniqueJobOptions([...DEFAULT_JOB_SUGGESTIONS, ...knownJobs, ...fromRows]);
  }, [knownJobs, rows]);

  const filledCount = useMemo(
    () =>
      rows.filter(
        row =>
          row.congViec.trim() ||
          row.nhanSuPhuTrach.trim() ||
          row.thanhPham.trim() ||
          row.dmThanhPhamTT.trim() ||
          row.ghiChu.trim()
      ).length,
    [rows]
  );

  const loadAllPlans = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch('/api/phan-cong-cv?limit=2000');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách kế hoạch CV.'));
      const next = normalizeRows(data);
      setAllRows(next);
      setKnownJobs(next.map(row => row.congViec));
      return next;
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không tải được danh sách kế hoạch CV.'));
      return [] as PhanCongCvRow[];
    } finally {
      setIsLoadingList(false);
    }
  };

  const loadDetail = async (nextNgay: string, nextCa: string, options?: { quiet?: boolean }) => {
    if (!nextNgay || !nextCa) return;
    setIsLoadingDetail(true);
    if (!options?.quiet) {
      setError('');
      setMessage('');
    }
    try {
      const params = new URLSearchParams({ ngay: nextNgay, ca: nextCa, limit: '500' });
      const res = await fetch(`/api/phan-cong-cv?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được kế hoạch CV.'));
      const next = normalizeRows(data);
      setNgay(nextNgay);
      setCa(nextCa);
      setSelectedKey(`${nextNgay}|${nextCa}`);
      setRows(next.length > 0 ? next : [emptyRow(nextNgay, nextCa)]);
      setKnownJobs(prev => [...prev, ...next.map(row => row.congViec)]);
      if (!options?.quiet) {
        setMessage(next.length > 0 ? `Đã tải ${next.length} dòng.` : 'Chưa có dữ liệu — có thể thêm dòng mới.');
      }
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không tải được kế hoạch CV.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (defaultDate) setNgay(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    if (!addRowTick || !canEdit) return;
    setRows(prev => [...prev, emptyRow(ngay, ca)]);
  }, [addRowTick, canEdit, ngay, ca]);

  useEffect(() => {
    let alive = true;
    setIsLoadingLookups(true);

    Promise.all([
      fetch('/api/cai-dat').then(res => res.json().catch(() => ({}))),
      fetch('/api/nhan-su?format=groups&scope=all').then(res => res.json().catch(() => ({}))),
      loadAllPlans()
    ])
      .then(([settingData, staffData, plans]) => {
        if (!alive) return;
        const options = getProductionShiftOptions(normalizeShiftSettings(settingData));
        setShiftOptions(options);
        const staff = collectHcmStaff(staffData);
        setStaffOptions(staff);

        const firstCa = String(options[0]?.value || '');
        const preferredNgay = defaultDate || todayDateInputValue();
        const preferred =
          plans.find(row => row.ngay === preferredNgay) ||
          plans[0] ||
          null;
        const nextNgay = preferred?.ngay || preferredNgay;
        const nextCa = preferred?.ca || firstCa;
        if (nextCa) {
          setCa(nextCa);
          void loadDetail(nextNgay, nextCa, { quiet: true });
        }
      })
      .catch(() => {
        if (!alive) return;
        setShiftOptions([]);
        setStaffOptions([]);
      })
      .finally(() => {
        if (alive) setIsLoadingLookups(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!printSheet) return;
    document.body.classList.add('production-plan-modal-print-active');
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } finally {
        setPrintSheet(null);
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove('production-plan-modal-print-active');
    };
  }, [printSheet]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('production-plan-modal-print-active');
      setPrintSheet(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const updateRow = (key: string, patch: Partial<PhanCongCvRow>) => {
    setRows(prev => prev.map(row => (row.key === key ? { ...row, ...patch } : row)));
    if (typeof patch.congViec === 'string' && patch.congViec.trim()) {
      setKnownJobs(prev => [...prev, patch.congViec!.trim()]);
    }
  };

  const saveRows = async () => {
    if (!ngay || !ca) {
      setError(showSaveFailure('Vui lòng chọn ngày và ca.'));
      return;
    }
    setIsSaving(true);
    setError('');
    setMessage('');
    try {
      const items = rows
        .filter(
          row =>
            row.congViec.trim() ||
            row.nhanSuPhuTrach.trim() ||
            row.thanhPham.trim() ||
            row.dmThanhPhamTT.trim() ||
            row.ghiChu.trim()
        )
        .map(row => ({
          cong_viec: row.congViec.trim(),
          nhan_su_phu_trach: row.nhanSuPhuTrach.trim(),
          thanh_pham: row.thanhPham.trim(),
          dm_thanh_pham_TT: row.dmThanhPhamTT.trim(),
          ghi_chu: row.ghiChu.trim()
        }));

      const res = await fetch('/api/phan-cong-cv', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ngay, ca, items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu kế hoạch CV.'));

      const next = normalizeRows(data).map(row => ({ ...row, ngay, ca }));
      setRows(next.length > 0 ? next : [emptyRow(ngay, ca)]);
      setSelectedKey(`${ngay}|${ca}`);
      setKnownJobs(prev => [...prev, ...next.map(row => row.congViec)]);
      await loadAllPlans();
      const okMsg = `Đã lưu ${next.length} dòng kế hoạch CV (${ngay} · ${ca}).`;
      setMessage(okMsg);
      showAppToast(okMsg);
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể lưu kế hoạch CV.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deletePlan = async (plan: PlanGroup) => {
    if (!window.confirm(`Xóa toàn bộ kế hoạch CV ${plan.ngay} · ${plan.ca}?`)) return;
    try {
      const res = await fetch('/api/phan-cong-cv', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ngay: plan.ngay, ca: plan.ca, items: [] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể xóa kế hoạch CV.'));
      const nextAll = await loadAllPlans();
      if (selectedKey === plan.key) {
        const first = nextAll[0];
        if (first) {
          await loadDetail(first.ngay, first.ca, { quiet: true });
        } else {
          setRows([emptyRow(ngay, ca)]);
          setSelectedKey('');
        }
      }
      showAppToast(`Đã xóa kế hoạch CV ${plan.ngay} · ${plan.ca}.`);
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể xóa kế hoạch CV.'));
    }
  };

  const printRows = (nextNgay: string, nextCa: string, nextRows: PhanCongCvRow[]) => {
    const filled = nextRows.filter(
      row =>
        row.congViec.trim() ||
        row.nhanSuPhuTrach.trim() ||
        row.thanhPham.trim() ||
        row.dmThanhPhamTT.trim() ||
        row.ghiChu.trim()
    );
    if (filled.length === 0) {
      setError('Chưa có dòng để in.');
      return;
    }
    setPrintSheet({ ngay: nextNgay, ca: nextCa, rows: filled });
  };

  const printCurrent = () => printRows(ngay, ca, rows);

  const printPlan = async (plan: PlanGroup) => {
    try {
      const params = new URLSearchParams({ ngay: plan.ngay, ca: plan.ca, limit: '500' });
      const res = await fetch(`/api/phan-cong-cv?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được kế hoạch CV để in.'));
      const next = normalizeRows(data);
      await loadDetail(plan.ngay, plan.ca, { quiet: true });
      printRows(plan.ngay, plan.ca, next);
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không in được kế hoạch CV.'));
    }
  };

  return (
    <div className="space-y-4">
      {printSheet
        ? createPortal(
            <PhanCongCvPrintSheet ngay={printSheet.ngay} ca={printSheet.ca} rows={printSheet.rows} />,
            document.body
          )
        : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <h3 className="text-sm font-black text-zinc-950">Danh sách kế hoạch CV</h3>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
              {planGroups.length} bản ghi · task việc + NV HCM
            </p>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            {isLoadingList ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải...
              </p>
            ) : planGroups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm font-semibold text-zinc-500">
                Chưa có kế hoạch CV đã lưu. Chọn Ngày + Ca bên phải rồi Lưu.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {plansByDate.map(([date, datePlans]) => {
                  const dateRowTotal = datePlans.reduce((sum, plan) => sum + plan.rowCount, 0);
                  return (
                    <div key={date}>
                      <div className="sticky top-0 flex items-center justify-between gap-2 bg-[#ef1b2d] px-4 py-2">
                        <span className="text-xs font-black uppercase tracking-wider text-white">{date}</span>
                        <span className="font-mono text-xs font-black text-white">{dateRowTotal} dòng</span>
                      </div>
                      {datePlans.map(plan => (
                        <div
                          key={plan.key}
                          className={`px-4 py-3 transition hover:bg-red-50/50 ${
                            selectedKey === plan.key ? 'bg-emerald-50' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void loadDetail(plan.ngay, plan.ca)}
                            className="flex w-full items-start justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-black text-zinc-950">{plan.ca}</p>
                              <p className="mt-0.5 text-xs font-semibold text-zinc-600">
                                {plan.rowCount} task · {plan.ngay}
                              </p>
                            </div>
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-200/70 pt-2">
                            <button
                              type="button"
                              onClick={() => void loadDetail(plan.ngay, plan.ca)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[11px] font-bold text-sky-700"
                            >
                              Xem
                            </button>
                            <button
                              type="button"
                              onClick={() => void printPlan(plan)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-[11px] font-bold text-red-700"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              In
                            </button>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => void deletePlan(plan)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ef1b2d]">Kế hoạch CV</p>
              <h3 className="text-sm font-black text-zinc-950">Chi tiết phân công công việc</h3>
              <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                Công việc = task việc · Nhân sự HCM
                {isLoadingLookups ? ' · Đang tải danh mục...' : ` · ${jobOptions.length} task · ${staffOptions.length} NV`}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                <DateInput
                  value={ngay}
                  onChange={next => {
                    setNgay(next);
                    if (ca) void loadDetail(next, ca);
                  }}
                  className="h-10 w-full min-w-[9rem] rounded-lg border border-zinc-200 px-3 pr-10 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
                <div className="min-w-[11rem]">
                  <SearchableSelect
                    value={ca}
                    onChange={next => {
                      setCa(next);
                      if (ngay) void loadDetail(ngay, next);
                    }}
                    options={shiftOptions}
                    placeholder="Chọn ca"
                    searchPlaceholder="Tìm ca..."
                    inputClassName={fieldClass}
                    comboboxMode
                    getValue={item => String((item as ShiftOption).value ?? item)}
                    getLabel={item => String((item as ShiftOption).label ?? item)}
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={printCurrent}
                disabled={filledCount === 0 || isLoadingDetail}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                In kế hoạch CV
              </button>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRows(prev => [...prev, emptyRow(ngay, ca)])}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-extrabold text-zinc-700 hover:bg-zinc-50"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm dòng
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveRows()}
                    disabled={isSaving || isLoadingDetail}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? 'Đang lưu...' : 'Lưu'}
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 p-4">
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {message}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-[1080px] w-full border-collapse text-xs">
                <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                  <tr>
                    <th className="w-12 border border-zinc-200 px-2 py-1.5">STT</th>
                    <th className="min-w-[180px] border border-zinc-200 px-2 py-1.5 text-left">Công việc (task)</th>
                    <th className="min-w-[200px] border border-zinc-200 px-2 py-1.5 text-left">Nhân sự phụ trách</th>
                    <th className="border border-zinc-200 px-2 py-1.5 text-left">Thành phẩm</th>
                    <th className="border border-zinc-200 px-2 py-1.5 text-left">ĐM thành phẩm TT</th>
                    <th className="border border-zinc-200 px-2 py-1.5 text-left">Ghi chú</th>
                    {canEdit ? <th className="w-10 border border-zinc-200" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {isLoadingDetail ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="border border-zinc-200 px-3 py-8 text-center text-zinc-500">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Đang tải...
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr key={row.key} className="odd:bg-white even:bg-zinc-50/70">
                        <td className="border border-zinc-200 px-2 py-1 text-center font-bold text-zinc-500">
                          {index + 1}
                        </td>
                        <td className="border border-zinc-200 p-0.5 align-middle">
                          {canEdit ? (
                            <SearchableSelect
                              value={row.congViec}
                              onChange={value => updateRow(row.key, { congViec: value })}
                              options={jobOptions}
                              placeholder="Chọn hoặc thêm task"
                              searchPlaceholder="Tìm / nhập task việc..."
                              inputClassName={fieldClass}
                              comboboxMode
                              allowCustomValue
                              isLoading={isLoadingLookups}
                              getValue={item => String((item as JobOption).value ?? item)}
                              getLabel={item => String((item as JobOption).label ?? item)}
                            />
                          ) : (
                            <span className={`${cellClass} inline-flex items-center`}>{row.congViec || '—'}</span>
                          )}
                        </td>
                        <td className="border border-zinc-200 p-0.5 align-middle">
                          {canEdit ? (
                            <SearchableSelect
                              value={row.nhanSuPhuTrach}
                              onChange={value => updateRow(row.key, { nhanSuPhuTrach: value })}
                              options={staffOptions}
                              placeholder="Chọn NV HCM"
                              searchPlaceholder="Tìm nhân sự HCM..."
                              inputClassName={fieldClass}
                              comboboxMode
                              allowCustomValue
                              isLoading={isLoadingLookups}
                              getValue={item => String((item as StaffOption).name ?? item)}
                              getLabel={item => String((item as StaffOption).name ?? item)}
                              getSearchText={item => String((item as StaffOption).name ?? item)}
                            />
                          ) : (
                            <span className={`${cellClass} inline-flex items-center`}>
                              {row.nhanSuPhuTrach || '—'}
                            </span>
                          )}
                        </td>
                        <td className="border border-zinc-200 p-0.5">
                          <input
                            value={row.thanhPham}
                            onChange={e => updateRow(row.key, { thanhPham: e.target.value })}
                            className={cellClass}
                            disabled={!canEdit}
                            placeholder="Thành phẩm"
                          />
                        </td>
                        <td className="border border-zinc-200 p-0.5">
                          <input
                            value={row.dmThanhPhamTT}
                            onChange={e => updateRow(row.key, { dmThanhPhamTT: e.target.value })}
                            className={cellClass}
                            disabled={!canEdit}
                            placeholder="Định mức TT"
                          />
                        </td>
                        <td className="border border-zinc-200 p-0.5">
                          <input
                            value={row.ghiChu}
                            onChange={e => updateRow(row.key, { ghiChu: e.target.value })}
                            className={cellClass}
                            disabled={!canEdit}
                            placeholder="Ghi chú"
                          />
                        </td>
                        {canEdit ? (
                          <td className="border border-zinc-200 text-center">
                            {rows.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => setRows(prev => prev.filter(item => item.key !== row.key))}
                                className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                                title="Xóa dòng"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] font-semibold text-zinc-500">
              {filledCount} dòng có dữ liệu · Lưu sẽ ghi đè toàn bộ phân công của Ngày + Ca đang chọn.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
