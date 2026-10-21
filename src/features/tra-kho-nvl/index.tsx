import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import { getProductionShiftOptions, normalizeShiftSettings } from '../../utils/shiftSettings';
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

export type TraKhoNvlHeader = {
  id?: string;
  ma_phieu: string;
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  ten_kho?: string | null;
  nguoi_lap?: string | null;
  ghi_chu?: string | null;
  ly_do?: string | null;
  status?: string | null;
  ma_phieu_nhap?: string | null;
  created_at?: string | null;
};

export type TraKhoNvlLine = {
  id?: string;
  ma_phieu?: string;
  ma_npl: string;
  ten_npl?: string | null;
  don_vi?: string | null;
  so_luong: number | string;
};

type DraftLine = {
  key: string;
  ma_npl: string;
  ten_npl: string;
  don_vi: string;
  so_luong: string;
};

type MaterialOption = {
  ma_npl: string;
  ten_npl: string;
  don_vi: string;
};

function localIsoDateToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function formatIsoDateVi(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const [y, m, d] = raw.slice(0, 10).split('-');
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function newDraftLine(): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ma_npl: '',
    ten_npl: '',
    don_vi: '',
    so_luong: ''
  };
}

/** Ưu tiên đúng «Kho NVL», rồi tên chứa NVL / nguyên vật liệu. */
function pickDefaultNvlWarehouse(names: string[]) {
  if (names.length === 0) return '';
  const exact = names.find(name => name.trim().toLocaleLowerCase('vi') === 'kho nvl');
  if (exact) return exact;
  const soft = names.find(name => {
    const key = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return key.includes('kho nvl') || key.includes('nguyen vat lieu') || /(^|\s)nvl(\s|$)/i.test(name);
  });
  return soft || names[0] || '';
}

const inputClass =
  'h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-red-500/10';

export function TraKhoNvlPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('tra-kho-nvl');
  const [records, setRecords] = useState<TraKhoNvlHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chotting, setChotting] = useState(false);
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(localIsoDateToday());
  const [toDate, setToDate] = useState(localIsoDateToday());
  const [statusFilter, setStatusFilter] = useState<'all' | 'chua_chot' | 'da_chot'>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingMaPhieu, setEditingMaPhieu] = useState('');
  const [formLocked, setFormLocked] = useState(false);
  const [ngay, setNgay] = useState(localIsoDateToday());
  const [ca, setCa] = useState('');
  const [may, setMay] = useState('');
  const [tenKho, setTenKho] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);

  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [machines, setMachines] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState(() => normalizeShiftSettings(null));

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const materialByCode = useMemo(() => {
    const map = new Map<string, MaterialOption>();
    for (const row of materials) {
      const key = row.ma_npl.trim().toUpperCase();
      if (key) map.set(key, row);
    }
    return map;
  }, [materials]);

  const loadLookups = useCallback(async () => {
    try {
      const [khoRes, mayRes, nvlRes, settingsRes] = await Promise.all([
        fetch('/api/quan-ly-kho'),
        fetch('/api/danh-sach-may'),
        fetch('/api/kho-nvl?light=1'),
        fetch('/api/cai-dat')
      ]);
      const [khoData, mayData, nvlData, settingsData] = await Promise.all([
        khoRes.json().catch(() => ({})),
        mayRes.json().catch(() => ({})),
        nvlRes.json().catch(() => ({})),
        settingsRes.json().catch(() => ({}))
      ]);

      const khoNames = [
        ...new Set(
          (Array.isArray(khoData?.records) ? khoData.records : [])
            .map((row: { ten_kho?: unknown }) => String(row.ten_kho || '').trim())
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b, 'vi'));
      setWarehouses(khoNames);
      setTenKho(current => current || pickDefaultNvlWarehouse(khoNames));

      const machineRows = Array.isArray(mayData?.records)
        ? mayData.records
        : Array.isArray(mayData?.machines)
          ? mayData.machines
          : Array.isArray(mayData)
            ? mayData
            : [];
      const machineNames = [
        ...new Set(
          machineRows
            .map((row: { ten_may?: unknown; ma_may?: unknown; name?: unknown; code?: unknown }) =>
              String(row.ten_may || row.ma_may || row.name || row.code || '').trim()
            )
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
      setMachines(machineNames);

      const materialRows = Array.isArray(nvlData?.materials)
        ? nvlData.materials
        : Array.isArray(nvlData?.records)
          ? nvlData.records
          : [];
      setMaterials(
        materialRows
          .map((row: { ma_npl?: unknown; ten_npl?: unknown; don_vi?: unknown; code?: unknown; name?: unknown; unit?: unknown }) => ({
            ma_npl: String(row.ma_npl || row.code || '').trim(),
            ten_npl: String(row.ten_npl || row.name || '').trim(),
            don_vi: String(row.don_vi || row.unit || '').trim()
          }))
          .filter((row: MaterialOption) => row.ma_npl)
          .sort((a: MaterialOption, b: MaterialOption) => a.ma_npl.localeCompare(b.ma_npl, 'vi', { numeric: true }))
      );

      // Cùng nguồn /api/cai-dat như phiếu xuất nhập kho & yêu cầu xuất VT.
      setShiftSettings(normalizeShiftSettings(settingsData));
    } catch {
      // Lookups optional — form vẫn dùng được với nhập tay.
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/tra-kho-nvl?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được phiếu trả kho NVL.'));
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (err: unknown) {
      setRecords([]);
      showAppToast(err instanceof Error ? err.message : 'Không tải được phiếu trả kho NVL.', 'error');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, statusFilter]);

  useEffect(() => {
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(row =>
      [row.ma_phieu, row.ca, row.may, row.ten_kho, row.nguoi_lap, row.ma_phieu_nhap, row.status]
        .map(v => String(v ?? '').toLowerCase())
        .some(v => v.includes(q))
    );
  }, [records, query]);

  const resetForm = () => {
    setShowForm(false);
    setEditingMaPhieu('');
    setFormLocked(false);
    setNgay(localIsoDateToday());
    setCa('');
    setMay('');
    setTenKho(pickDefaultNvlWarehouse(warehouses));
    setGhiChu('');
    setLines([newDraftLine()]);
  };

  const openCreate = () => {
    setEditingMaPhieu('');
    setFormLocked(false);
    setNgay(localIsoDateToday());
    setCa('');
    setMay('');
    setTenKho(pickDefaultNvlWarehouse(warehouses));
    setGhiChu('');
    setLines([newDraftLine()]);
    setShowForm(true);
  };

  const openEdit = async (row: TraKhoNvlHeader) => {
    const maPhieu = String(row.ma_phieu || '').trim();
    if (!maPhieu) return;
    try {
      const res = await fetch(`/api/tra-kho-nvl/${encodeURIComponent(maPhieu)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được chi tiết phiếu.'));
      const header = (data?.header || row) as TraKhoNvlHeader;
      const detailLines: TraKhoNvlLine[] = Array.isArray(data?.lines) ? data.lines : [];
      setEditingMaPhieu(maPhieu);
      setFormLocked(String(header.status || '') === 'da_chot');
      setNgay(String(header.ngay || localIsoDateToday()).slice(0, 10));
      setCa(String(header.ca || '').trim());
      setMay(String(header.may || '').trim());
      setTenKho(String(header.ten_kho || '').trim());
      setGhiChu(String(header.ghi_chu || '').trim());
      setLines(
        detailLines.length
          ? detailLines.map(line => ({
              key: String(line.id || `${line.ma_npl}-${Math.random()}`),
              ma_npl: String(line.ma_npl || ''),
              ten_npl: String(line.ten_npl || ''),
              don_vi: String(line.don_vi || ''),
              so_luong: String(line.so_luong ?? '')
            }))
          : [newDraftLine()]
      );
      setShowForm(true);
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không tải được chi tiết phiếu.', 'error');
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const pickMaterial = (key: string, maNpl: string) => {
    const found = materialByCode.get(maNpl.trim().toUpperCase());
    updateLine(key, {
      ma_npl: found?.ma_npl || maNpl,
      ten_npl: found?.ten_npl || '',
      don_vi: found?.don_vi || ''
    });
  };

  const buildPayloadLines = () => {
    const payload = lines
      .map(line => ({
        ma_npl: line.ma_npl.trim(),
        ten_npl: line.ten_npl.trim(),
        don_vi: line.don_vi.trim(),
        so_luong: Number(line.so_luong)
      }))
      .filter(line => line.ma_npl && Number.isFinite(line.so_luong) && line.so_luong > 0);
    if (payload.length === 0) throw new Error('Thêm ít nhất một dòng NVL có số lượng > 0.');
    return payload;
  };

  const handleSave = async () => {
    if (!canCreate && !canEdit) {
      showAppToast('Bạn không có quyền lưu phiếu trả kho.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payloadLines = buildPayloadLines();
      const res = await fetch('/api/tra-kho-nvl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_phieu: editingMaPhieu || undefined,
          ngay,
          ca,
          may,
          ten_kho: tenKho,
          nguoi_lap: currentUser?.name || '',
          ghi_chu: ghiChu,
          ly_do: 'Trả kho NVL',
          lines: payloadLines
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không lưu được phiếu trả kho.'));
      const savedMa = String(data?.header?.ma_phieu || editingMaPhieu || '');
      showAppToast(savedMa ? `Đã lưu phiếu ${savedMa}.` : 'Đã lưu phiếu trả kho.');
      setEditingMaPhieu(savedMa);
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không lưu được phiếu trả kho.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChot = async (maPhieu: string) => {
    if (!canEdit && !canCreate) {
      showAppToast('Bạn không có quyền chốt phiếu trả kho.', 'error');
      return;
    }
    if (!window.confirm(`Chốt phiếu ${maPhieu}?\nSẽ tạo phiếu nhập kho NVL và tăng tồn.`)) return;
    setChotting(true);
    try {
      if (showForm && editingMaPhieu === maPhieu) {
        const payloadLines = buildPayloadLines();
        const saveRes = await fetch('/api/tra-kho-nvl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ma_phieu: maPhieu,
            ngay,
            ca,
            may,
            ten_kho: tenKho,
            nguoi_lap: currentUser?.name || '',
            ghi_chu: ghiChu,
            ly_do: 'Trả kho NVL',
            lines: payloadLines
          })
        });
        const saveData = await saveRes.json().catch(() => ({}));
        if (!saveRes.ok) {
          throw new Error(readApiErrorMessage(saveRes, saveData, 'Không lưu được trước khi chốt.'));
        }
      }
      const res = await fetch(`/api/tra-kho-nvl/${encodeURIComponent(maPhieu)}/chot`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không chốt được phiếu trả kho.'));
      const pn = String(data?.ma_phieu_nhap || data?.header?.ma_phieu_nhap || '');
      showAppToast(pn ? `Đã chốt — phiếu nhập ${pn}.` : 'Đã chốt phiếu trả kho.');
      resetForm();
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không chốt được phiếu trả kho.', 'error');
    } finally {
      setChotting(false);
    }
  };

  const handleDelete = async (maPhieu: string) => {
    if (!canDelete) {
      showAppToast('Bạn không có quyền xóa phiếu trả kho.', 'error');
      return;
    }
    if (!window.confirm(`Xóa phiếu nháp ${maPhieu}?`)) return;
    try {
      const res = await fetch(`/api/tra-kho-nvl/${encodeURIComponent(maPhieu)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được phiếu.'));
      showAppToast(`Đã xóa phiếu ${maPhieu}.`);
      if (editingMaPhieu === maPhieu) resetForm();
      await loadRecords();
    } catch (err: unknown) {
      showAppToast(err instanceof Error ? err.message : 'Không xóa được phiếu.', 'error');
    }
  };

  const materialCodes = useMemo(() => materials.map(row => row.ma_npl), [materials]);

  return (
    <div className="w-full max-w-none space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-sm font-black text-zinc-900 sm:text-base">Trả kho NVL</h1>
          <p className="text-[10px] font-semibold text-zinc-500">Trả NVL về kho · chốt tăng tồn</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void loadRecords()}
            disabled={loading}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Tải lại
          </button>
          {canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#ef1b2d] px-2 text-[10px] font-extrabold text-white hover:bg-red-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Phiếu mới
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-700 hover:bg-zinc-50"
          >
            Quay lại
          </button>
        </div>
      </div>

      <TableToolbar>
        <TableDateFilter label="Từ ngày" value={fromDate} onChange={setFromDate} />
        <TableDateFilter label="Đến ngày" value={toDate} onChange={setToDate} />
        <FilterCombobox
          label="Trạng thái"
          options={['chua_chot', 'da_chot']}
          value={statusFilter}
          onChange={value =>
            setStatusFilter(value === 'chua_chot' || value === 'da_chot' ? value : 'all')
          }
          formatOption={value => (value === 'da_chot' ? 'Đã chốt' : 'Chưa chốt')}
          searchable={false}
        />
        <TableSearchInput value={query} onChange={setQuery} placeholder="Tìm mã phiếu, ca, máy..." />
      </TableToolbar>

      {showForm ? (
        <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-2.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-black text-zinc-900">
              {formLocked
                ? `Xem ${editingMaPhieu}`
                : editingMaPhieu
                  ? `Sửa ${editingMaPhieu}`
                  : 'Phiếu trả kho mới'}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              className="grid h-7 w-7 place-items-center rounded-md hover:bg-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-0.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
              <input type="date" value={ngay} onChange={e => setNgay(e.target.value)} className={inputClass} />
            </label>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
              <FilterCombobox
                label="Chọn ca"
                options={shiftOptions.map(option => option.value)}
                value={ca || 'all'}
                includeAll={false}
                compact
                matchButtonWidth
                searchable={shiftOptions.length > 6}
                formatOption={value =>
                  shiftOptions.find(option => option.value === value)?.label || value
                }
                className="w-full"
                buttonClassName="h-8 w-full justify-between text-xs"
                onChange={value => setCa(value === 'all' ? '' : value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
              <FilterCombobox
                label="Chọn máy"
                options={machines}
                value={may || 'all'}
                includeAll={false}
                compact
                matchButtonWidth
                searchable
                className="w-full"
                buttonClassName="h-8 w-full justify-between text-xs"
                onChange={value => setMay(value === 'all' ? '' : value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Kho</span>
              <FilterCombobox
                label="Chọn kho"
                options={warehouses}
                value={tenKho || 'all'}
                includeAll={false}
                compact
                matchButtonWidth
                searchable
                className="w-full"
                buttonClassName="h-8 w-full justify-between text-xs"
                onChange={value => setTenKho(value === 'all' ? '' : value)}
              />
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
            <input
              value={ghiChu}
              onChange={e => setGhiChu(e.target.value)}
              className={inputClass}
              placeholder="Ghi chú (không bắt buộc)"
            />
          </label>

          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-[11px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Mã NPL</th>
                  <th className="px-3 py-2">Tên NPL</th>
                  <th className="px-3 py-2">ĐVT</th>
                  <th className="px-3 py-2">Số lượng</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.key} className="border-t border-zinc-100">
                    <td className="px-2 py-2 align-top">
                      <FilterCombobox
                        label="Chọn mã"
                        options={materialCodes}
                        value={line.ma_npl || 'all'}
                        includeAll={false}
                        compact
                        matchButtonWidth
                        searchable
                        searchPlaceholder="Tìm mã NPL..."
                        className="w-full min-w-[8rem]"
                        buttonClassName="h-9 w-full justify-between"
                        dropdownWidth="w-max min-w-[14rem] max-w-[min(28rem,calc(100vw-1rem))]"
                        onChange={value => pickMaterial(line.key, value === 'all' ? '' : value)}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        value={line.ten_npl}
                        onChange={e => updateLine(line.key, { ten_npl: e.target.value })}
                        className={`${inputClass} h-9`}
                        placeholder="Tên NPL"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        value={line.don_vi}
                        onChange={e => updateLine(line.key, { don_vi: e.target.value })}
                        className={`${inputClass} h-9 w-20`}
                        placeholder="ĐVT"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.so_luong}
                        onChange={e => updateLine(line.key, { so_luong: e.target.value })}
                        className={`${inputClass} h-9 w-28`}
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        onClick={() =>
                          setLines(prev => (prev.length <= 1 ? [newDraftLine()] : prev.filter(item => item.key !== line.key)))
                        }
                        className="grid h-9 w-9 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                        title="Xóa dòng"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!formLocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLines(prev => [...prev, newDraftLine()])}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm dòng
              </button>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || chotting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu nháp
                </button>
                {editingMaPhieu ? (
                  <button
                    type="button"
                    onClick={() => void handleChot(editingMaPhieu)}
                    disabled={saving || chotting}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {chotting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Chốt phiếu
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs font-semibold text-emerald-800">Phiếu đã chốt — chỉ xem.</p>
          )}
          <p className="text-[11px] font-semibold text-zinc-500">
            Người lập: {currentUser?.name || 'Không rõ'} · Lý do: Trả kho NVL
          </p>
        </div>
      ) : null}

      <TableShell>
        <TableHead>
          <TableHeadCell>Ngày</TableHeadCell>
          <TableHeadCell>Mã phiếu</TableHeadCell>
          <TableHeadCell>Ca</TableHeadCell>
          <TableHeadCell>Máy</TableHeadCell>
          <TableHeadCell>Kho</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell>Phiếu nhập</TableHeadCell>
          <TableHeadCell>Người lập</TableHeadCell>
          <TableHeadCell>Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={9}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải…
              </span>
            </TableEmptyRow>
          ) : filtered.length === 0 ? (
            <TableEmptyRow colSpan={9}>Chưa có phiếu trả kho NVL trong bộ lọc.</TableEmptyRow>
          ) : (
            filtered.map(row => {
              const status = String(row.status || 'chua_chot');
              const daChot = status === 'da_chot';
              return (
                <TableRow key={row.ma_phieu}>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-zinc-900">
                    {formatIsoDateVi(row.ngay)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-zinc-900">
                    {row.ma_phieu}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{row.ca || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{row.may || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{row.ten_kho || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        daChot
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      {daChot ? 'Đã chốt' : 'Chưa chốt'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-zinc-700">
                    {row.ma_phieu_nhap || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {row.nguoi_lap || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {!daChot ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void openEdit(row)}
                            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={chotting}
                            onClick={() => void handleChot(row.ma_phieu)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Chốt
                          </button>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(row.ma_phieu)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                            >
                              Xóa
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openEdit(row)}
                          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
                        >
                          Xem
                        </button>
                      )}
                    </div>
                  </td>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableShell>

      {!loading && filtered.length > 0 ? (
        <p className="text-xs font-semibold text-zinc-500">
          {formatNumber(filtered.length, 0)} phiếu · {formatNumber(filtered.filter(r => r.status === 'da_chot').length, 0)} đã chốt
        </p>
      ) : null}
    </div>
  );
}
