import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Plus, Save, Trash2, Warehouse, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import {
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  RowActionsMenu
} from '../../components/shared/table';

export type QuanLyKhoRecord = {
  id: number | string;
  ten_kho?: string | null;
  vi_tri?: string | null;
  ten_vi_tri?: string | null;
  nguoi_phu_trach?: string | null;
  created_at?: string | null;
};

type KhoForm = {
  tenKho: string;
  viTri: string;
  tenViTri: string;
  nguoiPhuTrach: string;
};

const emptyForm = (): KhoForm => ({
  tenKho: '',
  viTri: '',
  tenViTri: '',
  nguoiPhuTrach: ''
});

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

export function normalizeQuanLyKhoRecords(data: unknown): QuanLyKhoRecord[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];
  return rows.filter((item): item is QuanLyKhoRecord => Boolean(item && typeof item === 'object'));
}

export function QuanLyKhoPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('quan-ly-kho');
  const [records, setRecords] = useState<QuanLyKhoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<KhoForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/quan-ly-kho');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách kho.'));
      setRecords(normalizeQuanLyKhoRecords(data));
    } catch (err: any) {
      setRecords([]);
      setError(err?.message || 'Không tải được danh sách kho.');
      showAppToast(err?.message || 'Không tải được danh sách kho.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId('');
    setShowForm(false);
    setError('');
  };

  useEffect(() => {
    if (!showForm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resetForm();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(row =>
      [row.ten_kho, row.vi_tri, row.ten_vi_tri, row.nguoi_phu_trach]
        .map(v => String(v ?? '').toLowerCase())
        .some(v => v.includes(q))
    );
  }, [records, query]);

  const openCreateForm = () => {
    setForm(emptyForm());
    setEditingId('');
    setShowForm(true);
    setError('');
  };

  const startEdit = (row: QuanLyKhoRecord) => {
    setEditingId(String(row.id));
    setShowForm(true);
    setForm({
      tenKho: String(row.ten_kho ?? ''),
      viTri: String(row.vi_tri ?? ''),
      tenViTri: String(row.ten_vi_tri ?? ''),
      nguoiPhuTrach: String(row.nguoi_phu_trach ?? '')
    });
    setError('');
  };

  const handleSave = async () => {
    if (!form.tenKho.trim()) {
      setError('Nhập tên kho.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        ten_kho: form.tenKho.trim(),
        vi_tri: form.viTri.trim(),
        ten_vi_tri: form.tenViTri.trim(),
        nguoi_phu_trach: form.nguoiPhuTrach.trim()
      };
      const res = await fetch(editingId ? `/api/quan-ly-kho/${editingId}` : '/api/quan-ly-kho', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, editingId ? 'Không cập nhật được kho.' : 'Không thêm được kho.'));
      }
      showAppToast(editingId ? 'Đã cập nhật kho.' : 'Đã thêm kho.', 'success');
      resetForm();
      await loadRecords();
    } catch (err: any) {
      setError(err?.message || 'Không lưu được kho.');
      showSaveFailure(err, 'Không lưu được kho.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('Xóa kho này?')) return;
    try {
      const res = await fetch(`/api/quan-ly-kho/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không xóa được kho.'));
      showAppToast('Đã xóa kho.', 'success');
      if (String(editingId) === String(id)) resetForm();
      await loadRecords();
    } catch (err: any) {
      showAppToast(err?.message || 'Không xóa được kho.', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4">
      <BackButton onClick={onBack} />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#ef1b2d]/10 text-[#ef1b2d]">
                <Warehouse className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-black text-zinc-900 sm:text-xl">Quản lý kho</h1>
                <p className="text-xs font-semibold text-zinc-500">
                  Bảng <span className="font-mono">quan_ly_kho</span> · tên kho, vị trí, người phụ trách
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {canCreate ? (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <TableToolbar isLoading={loading} loadError={error && !showForm ? error : undefined}>
        <TableSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Tìm tên kho / vị trí / phụ trách"
          disabled={loading}
        />
      </TableToolbar>

      <TableShell minWidthClassName="min-w-[720px]">
        <TableHead>
          <TableHeadCell>ID</TableHeadCell>
          <TableHeadCell>Tên kho</TableHeadCell>
          <TableHeadCell>Vị trí</TableHeadCell>
          <TableHeadCell>Tên vị trí</TableHeadCell>
          <TableHeadCell>Người phụ trách</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableEmptyRow colSpan={6}>
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải…
              </span>
            </TableEmptyRow>
          ) : filtered.length === 0 ? (
            <TableEmptyRow colSpan={6}>
              Chưa có kho nào. Bấm <span className="text-[#ef1b2d]">Thêm</span> để tạo.
            </TableEmptyRow>
          ) : (
            filtered.map(row => (
              <React.Fragment key={String(row.id)}>
                <TableRow>
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-500">{row.id}</td>
                  <td className="px-4 py-3 font-bold text-zinc-900">{row.ten_kho || '—'}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.vi_tri || '—'}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.ten_vi_tri || '—'}</td>
                  <td className="px-4 py-3 text-zinc-700">{row.nguoi_phu_trach || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <RowActionsMenu label={`Thao tác kho ${row.ten_kho || row.id}`}>
                    <div className="inline-flex items-center justify-center gap-1.5">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-[#ef1b2d]/40 hover:bg-red-50 hover:text-[#ef1b2d]"
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          title="Xóa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </TableRow>
              </React.Fragment>
            ))
          )}
        </TableBody>
      </TableShell>

      {showForm
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/45 p-0 sm:items-center sm:p-4">
              <button type="button" className="absolute inset-0 cursor-default" aria-label="Đóng" onClick={resetForm} />
              <div className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ef1b2d]">Quản lý kho</p>
                    <h3 className="mt-0.5 text-base font-black text-zinc-900 sm:text-lg">
                      {editingId ? 'Sửa kho' : 'Thêm kho'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-800"
                    title="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:col-span-2">
                      Tên kho *
                      <input
                        value={form.tenKho}
                        onChange={e => setForm(prev => ({ ...prev, tenKho: e.target.value }))}
                        className={`mt-1 ${inputClass}`}
                        placeholder="VD: Kho thành phẩm"
                        autoFocus
                      />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Người phụ trách
                      <input
                        value={form.nguoiPhuTrach}
                        onChange={e => setForm(prev => ({ ...prev, nguoiPhuTrach: e.target.value }))}
                        className={`mt-1 ${inputClass}`}
                        placeholder="Họ tên"
                      />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Vị trí
                      <input
                        value={form.viTri}
                        onChange={e => setForm(prev => ({ ...prev, viTri: e.target.value }))}
                        className={`mt-1 ${inputClass}`}
                        placeholder="VD: A-01"
                      />
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-400 sm:col-span-2">
                      Tên vị trí
                      <input
                        value={form.tenViTri}
                        onChange={e => setForm(prev => ({ ...prev, tenViTri: e.target.value }))}
                        className={`mt-1 ${inputClass}`}
                        placeholder="VD: Kệ thành phẩm tầng 1"
                      />
                    </label>
                  </div>
                  {error ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                      {error}
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-2 border-t border-zinc-200 bg-white px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingId ? 'Cập nhật' : 'Lưu kho'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

export default QuanLyKhoPanel;
