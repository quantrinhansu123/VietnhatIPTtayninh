import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import {
  FilterCombobox,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination
} from '../../components/shared/table';
import { getProductionShiftOptions, normalizeShiftSettings, type ShiftSetting } from '../../utils/shiftSettings';
import { parseMaterialConversion, type MaterialConversionInput } from './validation';
import { buildConversionMaterialOptions, formatConversionMaterial, type ConversionMaterialOption } from './materials';

type ConversionRow = MaterialConversionInput & { id: string };
type HubFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  shift?: string;
  machineCode?: string;
};

type MachineOption = { code: string; name: string };

const emptyDraft = {
  ngay: '',
  ca: '',
  ma_may: '',
  vat_tu_goc: '',
  so_luong_goc: '',
  vat_tu_quy_doi: '',
  so_luong_quy_doi: ''
};

function localIsoDateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function pickMachineField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-') return text;
  }
  return '';
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
        ? (data as { records: unknown[] }).records
        : [];
  const seen = new Set<string>();
  const out: MachineOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const code = pickMachineField(rec, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'ma', 'id']);
    const name = pickMachineField(rec, ['ten_may', 'may', 'machine_name', 'name', 'ten']);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: name || code });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

function draftFromFilters(filters: HubFilters) {
  return {
    ...emptyDraft,
    ngay: filters.dateFrom || filters.dateTo || localIsoDateToday(),
    ca: filters.shift && filters.shift !== 'all' ? filters.shift : '',
    ma_may: filters.machineCode && filters.machineCode !== 'all' ? filters.machineCode : ''
  };
}

function formatDisplayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function MaterialConversionPanel({
  search = '',
  initialFilters
}: {
  search?: string;
  initialFilters?: HubFilters;
}) {
  const filters = useMemo<HubFilters>(
    () => ({
      search: initialFilters?.search ?? search,
      dateFrom: initialFilters?.dateFrom || '',
      dateTo: initialFilters?.dateTo || '',
      shift: initialFilters?.shift || '',
      machineCode: initialFilters?.machineCode || ''
    }),
    [initialFilters, search]
  );
  const { canCreate, canEdit, canDelete } = useTabAccess('report-lists');
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(() => draftFromFilters(filters));
  const [materials, setMaterials] = useState<ConversionMaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState('');
  const [materialsRevision, setMaterialsRevision] = useState(0);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const materialByCode = useMemo(() => new Map(materials.map(item => [item.code, item])), [materials]);
  const materialCodes = useMemo(() => materials.map(item => item.code), [materials]);
  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const machineCodes = useMemo(() => machines.map(item => item.code), [machines]);
  const materialLabel = (code: string) => {
    const option = materialByCode.get(code);
    return option ? formatConversionMaterial(option) : code;
  };
  const machineLabel = (code: string) => {
    const found = machines.find(item => item.code === code);
    if (!found) return code;
    return found.name && found.name !== found.code ? `${found.code} · ${found.name}` : found.code;
  };
  const shiftLabel = (code: string) => shiftOptions.find(item => item.value === code)?.label || code;

  useEffect(() => {
    const controller = new AbortController();
    setMaterialsLoading(true);
    setMaterialsError('');
    void (async () => {
      try {
        const res = await fetch('/api/kho-nvl?light=1', { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Không thể tải danh mục Kho NVL.');
        if (!Array.isArray(data.materials)) throw new Error('Dữ liệu danh mục Kho NVL không hợp lệ.');
        if (!controller.signal.aborted) setMaterials(buildConversionMaterialOptions(data));
      } catch (err) {
        if (!controller.signal.aborted) {
          setMaterials([]);
          setMaterialsError(err instanceof Error ? err.message : 'Không thể tải danh mục Kho NVL.');
        }
      } finally {
        if (!controller.signal.aborted) setMaterialsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [materialsRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    void (async () => {
      try {
        const [settingsRes, machinesRes] = await Promise.all([
          fetch('/api/cai-dat', { signal: controller.signal }),
          fetch('/api/danh-sach-may', { signal: controller.signal })
        ]);
        const [settingsData, machinesData] = await Promise.all([
          settingsRes.json().catch(() => ({})),
          machinesRes.json().catch(() => ({}))
        ]);
        if (controller.signal.aborted) return;
        if (settingsRes.ok) setShiftSettings(normalizeShiftSettings(settingsData));
        if (machinesRes.ok) setMachines(normalizeMachines(machinesData));
      } catch {
        if (!controller.signal.aborted) {
          setShiftSettings([]);
          setMachines([]);
        }
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => { setPage(1); }, [filters.search, filters.dateFrom, filters.dateTo, filters.shift, filters.machineCode]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const params = new URLSearchParams({ search: filters.search || '', page: String(page) });
        if (filters.dateFrom) params.set('tu_ngay', filters.dateFrom);
        if (filters.dateTo) params.set('den_ngay', filters.dateTo);
        if (filters.shift && filters.shift !== 'all') params.set('ca', filters.shift);
        if (filters.machineCode && filters.machineCode !== 'all') params.set('ma_may', filters.machineCode);
        const res = await fetch(`/api/quy-doi-vat-lieu?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể tải quy đổi vật liệu.');
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(data.total / 50));
        if (page > lastPage) { setPage(lastPage); return; }
        setRows(data.records);
        setTotal(data.total);
      } catch (err) {
        if (!controller.signal.aborted) { setRows([]); setTotal(0); setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [filters, page, revision]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || (editing ? !canEdit : !canCreate)) return;
    const input = parseMaterialConversion(draft);
    if (!input) { setError('Nhập đủ Ngày · Ca · Máy, hai vật tư và số lượng lớn hơn 0.'); return; }
    if (materialsLoading || materialsError || !materialByCode.has(input.vat_tu_goc) || !materialByCode.has(input.vat_tu_quy_doi)) {
      setError('Vui lòng chọn Vật tư gốc và Vật tư quy đổi từ danh mục Kho NVL.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/quy-doi-vat-lieu${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu quy đổi.');
      setShowForm(false); setEditing(null); setDraft(draftFromFilters(filters));
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi lưu dữ liệu.'); }
    finally { setBusy(false); }
  };

  const remove = async (row: ConversionRow) => {
    if (busy || !canDelete || !window.confirm(`Xóa quy đổi ${row.vat_tu_goc} → ${row.vat_tu_quy_doi} (${formatDisplayDate(row.ngay)} · ${row.ca} · ${row.ma_may})?`)) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/quy-doi-vat-lieu/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể xóa quy đổi.');
      if (editing === row.id) { setShowForm(false); setEditing(null); setDraft(draftFromFilters(filters)); }
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi xóa dữ liệu.'); }
    finally { setBusy(false); }
  };

  const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-50';
  const canSave =
    Boolean(draft.ngay && draft.ca && draft.ma_may) &&
    materialByCode.has(draft.vat_tu_goc) &&
    materialByCode.has(draft.vat_tu_quy_doi);

  return <section className="space-y-3 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><ArrowLeftRight className="h-5 w-5" />Quy đổi vật liệu</h3>
        <p className="mt-1 text-xs text-slate-500">Mỗi dòng gắn Ngày · Ca · Máy để khớp quy đổi theo bộ lọc hub; không tự thay đổi tồn kho.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={loading || busy} className={buttonClass} onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-4 w-4" />Tải lại</button>
        {canCreate && <button type="button" disabled={busy} className={`${buttonClass} bg-emerald-600 text-white`} onClick={() => { setDraft(draftFromFilters(filters)); setEditing(null); setShowForm(true); setError(''); }}><Plus className="h-4 w-4" />Thêm quy đổi</button>}
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {materialsError && <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {materialsError}<button type="button" className={buttonClass} onClick={() => setMaterialsRevision(value => value + 1)}>Tải lại Kho NVL</button>
    </div>}
    {showForm && <form onSubmit={save} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h4 className="mb-3 text-sm font-bold">{editing ? 'Sửa quy đổi' : 'Thêm quy đổi'}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TableDateFilter
          label="Ngày"
          value={draft.ngay}
          onChange={ngay => setDraft(prev => ({ ...prev, ngay }))}
          className="h-10 rounded-lg"
        />
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span>Ca</span>
          <fieldset disabled={busy || optionsLoading} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox
              label={optionsLoading ? 'Đang tải ca…' : 'Chọn ca'}
              value={draft.ca || 'all'}
              options={shiftOptions.map(item => item.value)}
              includeAll={false}
              compact
              formatOption={shiftLabel}
              className="w-full"
              buttonClassName="!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate"
              onChange={value => { if (!busy && !optionsLoading) setDraft(prev => ({ ...prev, ca: value })); }}
            />
          </fieldset>
        </div>
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span>Máy</span>
          <fieldset disabled={busy || optionsLoading} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox
              label={optionsLoading ? 'Đang tải máy…' : 'Chọn máy'}
              value={draft.ma_may || 'all'}
              options={machineCodes}
              includeAll={false}
              compact
              formatOption={machineLabel}
              searchPlaceholder="Gõ mã hoặc tên máy…"
              className="w-full"
              buttonClassName="!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate"
              dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
              onChange={value => { if (!busy && !optionsLoading) setDraft(prev => ({ ...prev, ma_may: value })); }}
            />
          </fieldset>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span>Vật tư gốc</span>
          <fieldset disabled={busy || materialsLoading || Boolean(materialsError)} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox label={materialsLoading ? 'Đang tải Kho NVL…' : 'Chọn vật tư gốc'}
              value={draft.vat_tu_goc || 'all'} options={materialCodes} includeAll={false} compact
              formatOption={materialLabel} searchPlaceholder="Gõ mã hoặc tên vật tư…"
              className="w-full" buttonClassName="!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate"
              dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
              onChange={value => { if (!busy && !materialsLoading && !materialsError) setDraft(prev => ({ ...prev, vat_tu_goc: value })); }} />
          </fieldset>
          {draft.vat_tu_goc && !materialsLoading && !materialsError && !materialByCode.has(draft.vat_tu_goc) && <p className="mt-1 text-amber-700">Mã cũ không còn trong Kho NVL. Vui lòng chọn lại.</p>}
        </div>
        <label className="text-xs font-semibold text-slate-700">
          Số lượng gốc
          <input required disabled={busy} inputMode="decimal" value={draft.so_luong_goc}
            onChange={event => setDraft(prev => ({ ...prev, so_luong_goc: event.target.value }))}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span>Vật tư quy đổi</span>
          <fieldset disabled={busy || materialsLoading || Boolean(materialsError)} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox label={materialsLoading ? 'Đang tải Kho NVL…' : 'Chọn vật tư quy đổi'}
              value={draft.vat_tu_quy_doi || 'all'} options={materialCodes} includeAll={false} compact
              formatOption={materialLabel} searchPlaceholder="Gõ mã hoặc tên vật tư…"
              className="w-full" buttonClassName="!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate"
              dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
              onChange={value => { if (!busy && !materialsLoading && !materialsError) setDraft(prev => ({ ...prev, vat_tu_quy_doi: value })); }} />
          </fieldset>
          {draft.vat_tu_quy_doi && !materialsLoading && !materialsError && !materialByCode.has(draft.vat_tu_quy_doi) && <p className="mt-1 text-amber-700">Mã cũ không còn trong Kho NVL. Vui lòng chọn lại.</p>}
        </div>
        <label className="text-xs font-semibold text-slate-700">
          Số lượng quy đổi
          <input required disabled={busy} inputMode="decimal" value={draft.so_luong_quy_doi}
            onChange={event => setDraft(prev => ({ ...prev, so_luong_quy_doi: event.target.value }))}
            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
      </div>
      {!materialsLoading && !materialsError && materials.length === 0 && <p className="mt-2 text-amber-700 text-xs">Kho NVL chưa có vật tư.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={busy} className={buttonClass} onClick={() => setShowForm(false)}><X className="h-4 w-4" />Hủy</button>
        <button type="submit" disabled={busy || materialsLoading || Boolean(materialsError) || optionsLoading || !canSave} className={`${buttonClass} bg-emerald-600 text-white`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Lưu</button>
      </div>
    </form>}
    <TableShell minWidthClassName="min-w-[980px]" footer={<TablePagination totalRecords={total} currentPage={page} totalPages={Math.max(1, Math.ceil(total / 50))} pageSize={50} pageSizeOptions={[50]} onPageSizeChange={() => {}} onPageChange={setPage} />}>
      <TableHead>
        <TableHeadCell>Ngày</TableHeadCell>
        <TableHeadCell>Ca</TableHeadCell>
        <TableHeadCell>Máy</TableHeadCell>
        <TableHeadCell>Vật tư gốc</TableHeadCell>
        <TableHeadCell align="right">Số lượng</TableHeadCell>
        <TableHeadCell>Vật tư quy đổi</TableHeadCell>
        <TableHeadCell align="right">Số lượng</TableHeadCell>
        <TableHeadCell align="center">Thao tác</TableHeadCell>
      </TableHead>
      <TableBody>{loading ? <TableEmptyRow colSpan={8}>Đang tải…</TableEmptyRow> : rows.length === 0 ? <TableEmptyRow colSpan={8}>Chưa có quy đổi khớp bộ lọc Ngày · Ca · Máy.</TableEmptyRow> : rows.map(row => <TableRow key={row.id}>
        <td className="px-3 py-3 text-sm whitespace-nowrap">{formatDisplayDate(row.ngay)}</td>
        <td className="px-3 py-3 text-sm whitespace-nowrap">{shiftLabel(row.ca)}</td>
        <td className="px-3 py-3 text-sm whitespace-nowrap">{machineLabel(row.ma_may)}</td>
        <td className="px-3 py-3 text-sm">{materialLabel(row.vat_tu_goc)}</td>
        <td className="px-3 py-3 text-right font-mono text-sm">{formatNumber(row.so_luong_goc, 6)}</td>
        <td className="px-3 py-3 text-sm">{materialLabel(row.vat_tu_quy_doi)}</td>
        <td className="px-3 py-3 text-right font-mono text-sm">{formatNumber(row.so_luong_quy_doi, 6)}</td>
        <td className="px-3 py-3 text-center"><div className="inline-flex gap-2">
          {canEdit && <button type="button" disabled={busy} className={buttonClass} onClick={() => {
            setEditing(row.id);
            setDraft({
              ngay: row.ngay,
              ca: row.ca,
              ma_may: row.ma_may,
              vat_tu_goc: row.vat_tu_goc,
              so_luong_goc: String(row.so_luong_goc),
              vat_tu_quy_doi: row.vat_tu_quy_doi,
              so_luong_quy_doi: String(row.so_luong_quy_doi)
            });
            setShowForm(true);
            setError('');
          }}><Pencil className="h-3 w-3" />Sửa</button>}
          {canDelete && <button type="button" disabled={busy} className={`${buttonClass} text-red-600`} onClick={() => void remove(row)}><Trash2 className="h-3 w-3" />Xóa</button>}
        </div></td>
      </TableRow>)}</TableBody>
    </TableShell>
  </section>;
}
