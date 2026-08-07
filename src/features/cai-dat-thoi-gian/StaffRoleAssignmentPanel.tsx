import React, { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Search, Trash2, UserCog } from 'lucide-react';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import type { HrMember } from '../_shared/hr';
import { buildPermissionKey } from './permissionKeys';
import type { StaffAssignablePosition } from './staffAssignments';

type StaffOption = {
  code: string;
  name: string;
};

type StaffAssignmentRow = {
  maNhanSu: string;
  tenHienThi: string;
  positions: StaffAssignablePosition[];
};

type Props = {
  availablePositions: StaffAssignablePosition[];
  staffMembers: HrMember[];
  isLoadingStaff: boolean;
  staffError: string;
  onReloadStaff: () => Promise<void>;
  canEdit?: boolean;
  canDelete?: boolean;
};

function assignmentsFromStaff(members: HrMember[]): StaffAssignmentRow[] {
  const byCode = new Map<string, StaffAssignmentRow>();
  for (const member of members) {
    const code = String(member.code || '').trim();
    if (!code) continue;
    const positions = member.assignedPositions || [];
    if (positions.length === 0) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        maNhanSu: code,
        tenHienThi: member.name,
        positions
      });
    }
  }
  return [...byCode.values()].sort((a, b) => a.maNhanSu.localeCompare(b.maNhanSu, 'vi'));
}

export function StaffRoleAssignmentPanel({
  availablePositions,
  staffMembers,
  isLoadingStaff,
  staffError,
  onReloadStaff,
  canEdit = false,
  canDelete = false
}: Props) {
  const [query, setQuery] = useState('');
  const [editingCode, setEditingCode] = useState('');
  const [maNhanSu, setMaNhanSu] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState('');

  const assignments = useMemo(() => assignmentsFromStaff(staffMembers), [staffMembers]);

  const staffOptions = useMemo((): StaffOption[] => {
    const byCode = new Map<string, StaffOption>();
    for (const member of staffMembers) {
      const code = String(member.code || '').trim();
      if (!code || byCode.has(code)) continue;
      byCode.set(code, { code, name: member.name });
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  }, [staffMembers]);

  const selectedStaff = useMemo(
    () => staffOptions.find(item => item.code === maNhanSu) || null,
    [maNhanSu, staffOptions]
  );

  const filteredAssignments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter(item => {
      const positionsText = item.positions
        .map(pos => `${pos.department} ${pos.position} ${pos.permissionKey}`)
        .join(' ');
      return `${item.maNhanSu} ${item.tenHienThi} ${positionsText}`.toLowerCase().includes(q);
    });
  }, [assignments, query]);

  const positionByKey = useMemo(() => {
    const map = new Map<string, StaffAssignablePosition>();
    for (const item of availablePositions) map.set(item.permissionKey, item);
    return map;
  }, [availablePositions]);

  const resetForm = () => {
    setEditingCode('');
    setMaNhanSu('');
    setSelectedKeys([]);
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setMessage('');
  };

  const openEdit = (row: StaffAssignmentRow) => {
    setEditingCode(row.maNhanSu);
    setMaNhanSu(row.maNhanSu);
    setSelectedKeys(row.positions.map(item => item.permissionKey));
    setError('');
    setMessage('');
  };

  const toggleKey = (permissionKey: string) => {
    setSelectedKeys(prev =>
      prev.includes(permissionKey) ? prev.filter(item => item !== permissionKey) : [...prev, permissionKey]
    );
  };

  const toggleAll = (checked: boolean) => {
    setSelectedKeys(checked ? availablePositions.map(item => item.permissionKey) : []);
  };

  const handleSave = async () => {
    const code = String(maNhanSu || '').trim();
    if (!code) {
      setError('Vui lòng chọn nhân sự theo mã NV.');
      return;
    }

    const positions = selectedKeys
      .map(key => positionByKey.get(key))
      .filter((item): item is StaffAssignablePosition => Boolean(item));

    if (positions.length === 0) {
      setError('Chọn ít nhất 1 vị trí.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/nhan-su/${encodeURIComponent(code)}/vi-tri-gan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vi_tri_gan: positions })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể lưu gán vị trí vào nhân sự.');

      setMessage(editingCode ? 'Đã cập nhật vị trí trên nhân sự.' : 'Đã gán vị trí vào nhân sự.');
      resetForm();
      await onReloadStaff();
    } catch (err: any) {
      setError(err?.message || 'Không thể lưu gán vị trí vào nhân sự.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`Xóa toàn bộ vị trí đã gán của mã NV ${code}?`)) return;
    setDeletingCode(code);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/nhan-su/${encodeURIComponent(code)}/vi-tri-gan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vi_tri_gan: [] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa gán vị trí.');
      if (editingCode === code) resetForm();
      setMessage('Đã xóa vị trí đã gán trên nhân sự.');
      await onReloadStaff();
    } catch (err: any) {
      setError(err?.message || 'Không thể xóa gán vị trí.');
    } finally {
      setDeletingCode('');
    }
  };

  const allChecked =
    availablePositions.length > 0 && selectedKeys.length === availablePositions.length;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#ef1b2d]">
              <UserCog className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                Gán quyền nhân sự
              </h3>
              <p className="text-xs font-semibold text-zinc-500">
                Lưu vào bảng <span className="font-mono">nhan_su.vi_tri_gan</span> theo mã NV · tick nhiều vị trí.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#ef1b2d]/20 bg-red-50 px-3 text-xs font-extrabold text-[#ef1b2d] hover:bg-red-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Gán mới
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,0.9fr)_1.4fr]">
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã nhân viên</span>
            <SearchableSelect
              value={maNhanSu}
              onChange={setMaNhanSu}
              options={staffOptions}
              placeholder={isLoadingStaff ? 'Đang tải nhân sự...' : 'Chọn mã NV...'}
              isLoading={isLoadingStaff}
              disabled={Boolean(editingCode) || isLoadingStaff}
              getValue={item => (item as StaffOption).code}
              getLabel={item => {
                const row = item as StaffOption;
                return `${row.code}${row.name ? ` — ${row.name}` : ''}`;
              }}
              getSearchText={item => {
                const row = item as StaffOption;
                return `${row.code} ${row.name}`;
              }}
              displaySelectedAsValue
              maxResults={80}
            />
            {selectedStaff?.name ? (
              <p className="text-xs font-semibold text-zinc-500">
                Tên hiển thị: <span className="font-bold text-zinc-800">{selectedStaff.name}</span>
              </p>
            ) : null}
            {editingCode ? (
              <p className="text-[11px] font-semibold text-amber-700">
                Đang sửa mã NV {editingCode} — muốn đổi mã thì gán mới.
              </p>
            ) : null}
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Vị trí (tick nhiều)
              </span>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-zinc-600">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={event => toggleAll(event.target.checked)}
                  disabled={availablePositions.length === 0}
                />
                Chọn tất cả
              </label>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
              {availablePositions.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs font-bold text-zinc-500">
                  Chưa có vị trí. Tạo vai trò ở tab Phân quyền hoặc bổ sung chức vụ trên nhân sự.
                </p>
              ) : (
                <div className="space-y-1">
                  {availablePositions.map(item => {
                    const checked = selectedKeys.includes(item.permissionKey);
                    return (
                      <label
                        key={item.permissionKey}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition ${
                          checked
                            ? 'border-[#ef1b2d]/30 bg-red-50'
                            : 'border-transparent bg-white hover:border-zinc-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleKey(item.permissionKey)}
                        />
                        <span className="min-w-0">
                          <span className="block font-bold text-zinc-900">
                            {item.department} · {item.position}
                          </span>
                          <span className="block font-mono text-[10px] font-semibold text-zinc-400">
                            {item.permissionKey}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {(error || staffError) && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {error || staffError}
          </p>
        )}
        {message && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            {message}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {editingCode ? (
            <button
              type="button"
              onClick={resetForm}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
            >
              Hủy sửa
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white hover:bg-[#b30d1c] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Đang lưu...' : editingCode ? 'Cập nhật trên nhân sự' : 'Lưu vào nhân sự'}
            </button>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-3">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm mã NV, tên, vị trí..."
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-black">Mã NV</th>
                <th className="whitespace-nowrap px-3 py-3 font-black">Tên hiển thị</th>
                <th className="px-3 py-3 font-black">Vị trí được gán</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredAssignments.map(row => (
                <tr key={row.maNhanSu} className="hover:bg-red-50/40">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono font-black text-zinc-900">
                    {row.maNhanSu}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-700">
                    {row.tenHienThi || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {row.positions.map(pos => (
                        <span
                          key={`${row.maNhanSu}-${pos.permissionKey}`}
                          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-bold text-zinc-700"
                          title={pos.permissionKey}
                        >
                          {pos.department} · {pos.position}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.maNhanSu)}
                          disabled={deletingCode === row.maNhanSu}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {deletingCode === row.maNhanSu ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Xóa
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center font-bold text-zinc-500">
                    Chưa có nhân sự nào được gán vị trí trên bảng nhan_su.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Vị trí có trong cài đặt = key Phân quyền đã lưu. */
export function collectPositionsFromPermissionRoles(
  permissionRoles: Array<{ department: string; position: string; permissionKey?: string }>
): StaffAssignablePosition[] {
  const map = new Map<string, StaffAssignablePosition>();
  for (const role of permissionRoles) {
    const department = String(role.department || '').trim();
    const position = String(role.position || '').trim();
    if (!department || !position) continue;
    const permissionKey = String(role.permissionKey || '').trim() || buildPermissionKey(department, position);
    if (!map.has(permissionKey)) {
      map.set(permissionKey, { department, position, permissionKey });
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.department} ${a.position}`.localeCompare(`${b.department} ${b.position}`, 'vi')
  );
}

/** Fallback: cặp phòng ban · chức vụ từ cây nhân sự khi chưa có key Phân quyền. */
export function collectPositionsFromHrTree(
  membersByDepartment: Array<{ department: string; members: HrMember[] }>
): StaffAssignablePosition[] {
  const map = new Map<string, StaffAssignablePosition>();
  for (const group of membersByDepartment) {
    const department = group.department.trim();
    if (!department || department === 'Chưa phân phòng ban') continue;
    for (const member of group.members) {
      const position = String(member.role || member.position || '').trim();
      if (!position) continue;
      const permissionKey = buildPermissionKey(department, position);
      if (!map.has(permissionKey)) {
        map.set(permissionKey, { department, position, permissionKey });
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    `${a.department} ${a.position}`.localeCompare(`${b.department} ${b.position}`, 'vi')
  );
}
