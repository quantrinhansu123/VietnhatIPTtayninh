import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import {
  cloudinaryPreviewUrl,
  fileToOptimizedImageDataUrl,
  uploadImage
} from '../_shared/recordHelpers';
import type { HrBranch, HrMember } from '../_shared/hr';
import { normalizeHrBranches } from '../_shared/hr';
import { STANDARD_SHIFTS } from '../../types';
import {
  STAFF_MENU_VIEW_TREE,
  defaultStaffViewPermissions,
  clearStaffViewPermissions,
  formatStaffViewPermissionsJson,
  isStaffChildViewSelected,
  summarizeStaffViewPermissions,
  toggleStaffChildView,
  type StaffViewPermissions
} from './menuViews';
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
  StatusBadge,
  RowActionsMenu
} from '../../components/shared/table';
import {
  RefreshCw,
  Download,
  Eye,
  ExternalLink,
  FileUp,
  ImageUp,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2
} from 'lucide-react';
import { downloadStaffExcel, downloadStaffExcelTemplate, parseStaffExcel } from '../../utils/staffExcel';
import { showAppToast } from '../../lib/appToast';

export function HumanResourcesPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('hr');
  const [branches, setBranches] = useState<HrBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [viewPermissionsMember, setViewPermissionsMember] = useState<HrMember | null>(null);
  const [viewMember, setViewMember] = useState<{ member: HrMember; departmentName: string } | null>(null);
  const [editTarget, setEditTarget] = useState<
    { member: HrMember; departmentName: string; branchName: string } | null
  >(null);
  const [deletingCode, setDeletingCode] = useState('');
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [showAddStaffForm, setShowAddStaffForm] = useState(false);
  const [isSyncingViTri, setIsSyncingViTri] = useState(false);
  const [syncViTriMessage, setSyncViTriMessage] = useState('');
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [selectedStaffCodes, setSelectedStaffCodes] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [addStaffDefaults, setAddStaffDefaults] = useState<{ branchId: string; department: string }>({
    branchId: '',
    department: ''
  });
  const loadStaffGroups = async () => {
    setIsLoadingStaff(true);
    setStaffError('');

    try {
      const res = await fetch('/api/nhan-su?format=groups&scope=all');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải nhân sự từ Supabase.');
      }

      const nextBranches = normalizeHrBranches(data);
      setBranches(nextBranches);
      setSelectedBranchId(prev => prev || nextBranches[0]?.id || '');
    } catch (error: any) {
      setBranches([]);
      setStaffError(error.message || 'Không thể tải nhân sự từ Supabase.');
    } finally {
      setIsLoadingStaff(false);
    }
  };

  useEffect(() => {
    void loadStaffGroups();
  }, []);

  useEffect(() => {
    setDepartmentFilter('');
  }, [selectedBranchId]);

  const handleDeleteMember = async (member: HrMember) => {
    if (!member.code) {
      window.alert('Nhân sự này chưa có mã (ma_nhan_su) nên không thể xóa tự động.');
      return;
    }
    if (!window.confirm(`Xóa nhân sự "${member.name}" (${member.code})?`)) return;

    setDeletingCode(member.code);
    try {
      const res = await fetch(`/api/nhan-su/${encodeURIComponent(member.code)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa nhân sự.');
      }
      setSelectedStaffCodes(prev => {
        const next = new Set(prev);
        next.delete(member.code);
        return next;
      });
      await loadStaffGroups();
      showAppToast(`Đã xóa nhân sự ${member.code}.`);
    } catch (error: any) {
      window.alert(error.message || 'Không thể xóa nhân sự.');
    } finally {
      setDeletingCode('');
    }
  };

  const toggleStaffCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    setSelectedStaffCodes(prev => {
      const next = new Set(prev);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  };

  const buildStaffViTri = (department: string, role: string) =>
    `${department.trim()}_${role.trim()}`.replace(/\s+/g, '_').replace(/_+/g, '_');

  const handleDownloadStaffTemplate = () => {
    downloadStaffExcelTemplate();
  };

  const handleDownloadStaffExcel = () => {
    const rows = branches.flatMap(branch =>
      branch.departments.flatMap(department =>
        department.members.map(member => ({
          code: member.code || '',
          name: member.name || '',
          branch: branch.name || '',
          department: department.name || '',
          role: member.role || '',
          shift: member.shift || '',
          status: member.status || '',
          username: member.username || ''
        }))
      )
    );
    if (rows.length === 0) {
      downloadStaffExcelTemplate();
      return;
    }
    downloadStaffExcel(rows);
  };

  const handleImportStaffExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);
    setSyncViTriMessage('');
    try {
      const rows = await parseStaffExcel(file);
      if (rows.length === 0) {
        throw new Error('File Excel không có dòng dữ liệu nhân sự.');
      }

      const existingCodes = new Set(
        collectStaffCodes(branches).map(code => code.trim().toUpperCase()).filter(Boolean)
      );
      const generatedCodes = [...existingCodes];
      let created = 0;
      let updated = 0;
      const failures: string[] = [];

      for (const row of rows) {
        const name = row.name.trim();
        const department = row.department.trim();
        if (!name) {
          failures.push(`dòng ${row.rowNumber}: thiếu họ tên`);
          continue;
        }
        if (!department) {
          failures.push(`dòng ${row.rowNumber}: thiếu phòng ban`);
          continue;
        }

        let code = row.code.trim();
        if (!code) {
          code = generateNextStaffCode(generatedCodes);
          generatedCodes.push(code);
        }

        const role = row.role.trim();
        const payload: Record<string, unknown> = {
          nhan_su: name,
          ma_nhan_su: code,
          chi_nhanh: row.branch.trim(),
          phong_ban: department,
          cong_viec: role,
          vi_tri: buildStaffViTri(department, role),
          ca_lam: row.shift.trim() || 'Ca 1',
          trang_thai: row.status.trim() || 'Đang làm',
          ten_dang_nhap: row.username.trim()
        };
        if (row.password.trim()) {
          payload.mat_khau = row.password.trim();
        }

        const codeKey = code.toUpperCase();
        const isExisting = existingCodes.has(codeKey);
        const res = await fetch(
          isExisting ? `/api/nhan-su/${encodeURIComponent(code)}` : '/api/nhan-su',
          {
            method: isExisting ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`dòng ${row.rowNumber}: ${data.error || 'Không lưu được'}`);
          continue;
        }

        existingCodes.add(codeKey);
        if (!generatedCodes.some(item => item.toUpperCase() === codeKey)) {
          generatedCodes.push(code);
        }
        if (isExisting) updated += 1;
        else created += 1;
      }

      if (created > 0 || updated > 0) {
        await loadStaffGroups();
      }

      const summary = [
        created || updated ? `Đã nhập Excel: thêm ${created}, cập nhật ${updated}.` : 'Không nhập được dòng nào.',
        failures.length ? `${failures.length} dòng lỗi (${failures.slice(0, 3).join('; ')}).` : ''
      ]
        .filter(Boolean)
        .join(' ');
      setSyncViTriMessage(summary);
      if (created > 0 || updated > 0) {
        showAppToast(`Đã nhập Excel: thêm ${created}, cập nhật ${updated}.`);
      } else if (failures.length > 0) {
        showAppToast(failures[0], 'error');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể đọc hoặc nhập file Excel.';
      setSyncViTriMessage(message);
      showAppToast(message, 'error');
    } finally {
      setIsImportingExcel(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  const handleSyncViTri = async () => {
    if (
      !window.confirm(
        'Cập nhật cột vi_tri = Phòng_ban_Chức_vụ (dấu cách → _) cho toàn bộ nhân sự?\n\nVí dụ: Phòng_Kinh_Doanh_Giám_đốc_kinh_doanh'
      )
    ) {
      return;
    }

    setIsSyncingViTri(true);
    setSyncViTriMessage('');
    try {
      const res = await fetch('/api/nhan-su/sync-vi-tri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyEmpty: false, force: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể cập nhật vi_tri.');
      }
      setSyncViTriMessage(
        String(data.message || `Đã cập nhật ${data.updated ?? 0} nhân sự.`)
      );
      await loadStaffGroups();
    } catch (error: any) {
      setSyncViTriMessage(error.message || 'Không thể cập nhật vi_tri.');
    } finally {
      setIsSyncingViTri(false);
    }
  };

  const openAddStaffForm = (defaults?: { branchId?: string; department?: string }) => {
    setAddStaffDefaults({
      branchId: defaults?.branchId || selectedBranchId || branches[0]?.id || '',
      department: defaults?.department || ''
    });
    setShowAddStaffForm(true);
  };

  const selectedBranch = branches.find(branch => branch.id === selectedBranchId) ?? branches[0];
  const normalizedSearch = searchText.trim().toLowerCase();
  const branchDepartmentOptions = useMemo(() => {
    if (!selectedBranch) return [];
    return [...selectedBranch.departments.map(department => department.name)].sort((a, b) =>
      a.localeCompare(b, 'vi')
    );
  }, [selectedBranch]);
  const filteredDepartments = useMemo(() => {
    if (!selectedBranch) return [];

    const scopedDepartments = departmentFilter
      ? selectedBranch.departments.filter(department => department.name === departmentFilter)
      : selectedBranch.departments;

    if (!normalizedSearch) return scopedDepartments;

    return scopedDepartments
      .map(department => ({
        ...department,
        members: department.members.filter(member =>
          `${member.name} ${member.role} ${member.shift} ${member.username ?? ''}`.toLowerCase().includes(normalizedSearch)
        )
      }))
      .filter(department =>
        department.name.toLowerCase().includes(normalizedSearch) ||
        department.lead.toLowerCase().includes(normalizedSearch) ||
        department.members.length > 0
      );
  }, [departmentFilter, normalizedSearch, selectedBranch]);

  const totalDepartments = selectedBranch?.departments.length ?? 0;
  const totalMembers = selectedBranch?.departments.reduce((sum, department) => sum + department.members.length, 0) ?? 0;
  const activeMembers = selectedBranch?.departments.reduce(
    (sum, department) => sum + department.members.filter(member => member.status === 'Đang làm').length,
    0
  ) ?? 0;
  const tableRows = useMemo(
    () =>
      filteredDepartments.flatMap(department =>
        department.members.map(member => ({
          key: `${department.id}-${member.id || member.name}`,
          departmentName: department.name,
          member
        }))
      ),
    [filteredDepartments]
  );

  const visibleStaffCodes = useMemo(
    () =>
      tableRows
        .map(({ member }) => String(member.code || '').trim())
        .filter(Boolean),
    [tableRows]
  );

  const allStaffCodes = useMemo(() => collectStaffCodes(branches).map(code => code.trim()).filter(Boolean), [branches]);

  const allVisibleSelected =
    visibleStaffCodes.length > 0 && visibleStaffCodes.every(code => selectedStaffCodes.has(code));

  const selectedCount = selectedStaffCodes.size;

  const toggleSelectAllVisible = () => {
    setSelectedStaffCodes(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleStaffCodes.forEach(code => next.delete(code));
      } else {
        visibleStaffCodes.forEach(code => next.add(code));
      }
      return next;
    });
  };

  const selectAllStaff = () => {
    setSelectedStaffCodes(new Set(allStaffCodes));
  };

  const clearStaffSelection = () => {
    setSelectedStaffCodes(new Set());
  };

  const handleBulkDeleteSelected = async () => {
    const codes = [...selectedStaffCodes].map(code => code.trim()).filter(Boolean);
    if (codes.length === 0) return;

    const deletingAll = allStaffCodes.length > 0 && codes.length >= allStaffCodes.length;
    const label = deletingAll
      ? `TOÀN BỘ ${codes.length} nhân sự`
      : codes.length === 1
        ? `nhân sự "${codes[0]}"`
        : `${codes.length} nhân sự đã chọn`;

    if (
      !window.confirm(
        deletingAll
          ? `Bạn sắp XÓA HẾT ${codes.length} nhân sự trong hệ thống.\n\nHành động này không thể hoàn tác. Tiếp tục?`
          : `Xóa ${label}?\n\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    if (
      deletingAll &&
      !window.confirm(`Xác nhận lần cuối: xóa hết ${codes.length} nhân sự?`)
    ) {
      return;
    }

    setIsBulkDeleting(true);
    setSyncViTriMessage('');
    try {
      const res = await fetch('/api/nhan-su/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa nhân sự đã chọn.');
      }

      const deleted = Number(data.deleted) || codes.length;
      setSelectedStaffCodes(new Set());
      await loadStaffGroups();
      const message = `Đã xóa ${deleted} nhân sự.`;
      setSyncViTriMessage(message);
      showAppToast(message);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không thể xóa nhân sự đã chọn.';
      setSyncViTriMessage(message);
      showAppToast(message, 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  useEffect(() => {
    setSelectedStaffCodes(new Set());
  }, [selectedBranchId]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    branches.forEach(branch => branch.departments.forEach(department => names.add(department.name)));
    if (names.size === 0) names.add('Sản xuất');
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [branches]);

  const hasActiveFilters = Boolean(searchText) || Boolean(departmentFilter);
  const resetFilters = () => {
    setSearchText('');
    setDepartmentFilter('');
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1680px] space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Quản lý nhân sự</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Chi nhánh & Phòng ban</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Phòng ban Sản xuất · Chi nhánh Phú Thọ.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={handleDownloadStaffTemplate}
                disabled={isImportingExcel || isLoadingStaff}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Tải file mẫu cột nhập nhân sự"
              >
                <Download className="h-4 w-4" />
                Tải mẫu Excel
              </button>
              <button
                type="button"
                onClick={handleDownloadStaffExcel}
                disabled={isImportingExcel || isLoadingStaff}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                title="Xuất danh sách nhân sự hiện tại ra Excel"
              >
                <Download className="h-4 w-4" />
                Xuất Excel
              </button>
              {canCreate || canEdit ? (
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={isImportingExcel || isLoadingStaff}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImportingExcel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  {isImportingExcel ? 'Đang nhập...' : 'Tải Excel lên'}
                </button>
              ) : null}
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={event => void handleImportStaffExcel(event)}
              />
              <button
                type="button"
                onClick={() => void handleSyncViTri()}
                disabled={isSyncingViTri || isLoadingStaff || isImportingExcel}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:border-[#ef1b2d] hover:bg-red-50 hover:text-[#ef1b2d] disabled:cursor-not-allowed disabled:opacity-60"
                title="Ghi cột vi_tri = Phòng_ban_Chức_vụ (dấu cách → _)"
              >
                {isSyncingViTri ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {isSyncingViTri ? 'Đang cập nhật...' : 'Cập nhật vị trí'}
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => openAddStaffForm()}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}
            </div>
          </div>

          {syncViTriMessage && (
            <p
              className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${
                /không thể|lỗi|thiếu/i.test(syncViTriMessage)
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {syncViTriMessage}
            </p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Phòng ban', totalDepartments],
              ['Nhân sự', totalMembers],
              ['Đang làm', activeMembers]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <span className="block font-bold text-zinc-500">{label}</span>
                <span className="mt-1 block text-xl font-black text-zinc-950">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {branches.map(branch => (
            <button
              key={branch.id}
              type="button"
              onClick={() => setSelectedBranchId(branch.id)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedBranchId === branch.id
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {branch.shortName}
            </button>
          ))}
          {isLoadingStaff && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>
      </section>

      <TableToolbar
        isLoading={isLoadingStaff}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={staffError}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm tên, chức vụ, ca làm..."
          disabled={isLoadingStaff || branches.length === 0}
        />

        <FilterCombobox
          label="Phòng ban"
          options={branchDepartmentOptions}
          value={departmentFilter || 'all'}
          onChange={value => setDepartmentFilter(value === 'all' ? '' : value)}
          searchPlaceholder="Tìm phòng ban..."
          compact
        />
      </TableToolbar>

      {canDelete ? (
        <section className="grid gap-3 rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-black text-zinc-950">Xóa theo lựa chọn</p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Đã tick {selectedCount} dòng. Có thể chọn hết danh sách đang xem hoặc toàn bộ nhân sự rồi xóa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={isLoadingStaff || visibleStaffCodes.length === 0 || isBulkDeleting}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allVisibleSelected ? 'Bỏ chọn đang xem' : 'Chọn đang xem'}
            </button>
            <button
              type="button"
              onClick={selectAllStaff}
              disabled={isLoadingStaff || allStaffCodes.length === 0 || isBulkDeleting}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Chọn hết ({allStaffCodes.length})
            </button>
            <button
              type="button"
              onClick={clearStaffSelection}
              disabled={selectedCount === 0 || isBulkDeleting}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Bỏ chọn
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDeleteSelected()}
              disabled={selectedCount === 0 || isBulkDeleting}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {isBulkDeleting ? 'Đang xóa...' : `Xóa đã chọn${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
        {!isLoadingStaff && !staffError && branches.length === 0 && (
          <div className="px-4 py-8 text-center text-sm font-bold text-zinc-500">
            Supabase chưa có dữ liệu nhân sự để hiển thị.
          </div>
        )}

        {filteredDepartments.length > 0 && (
          <>
            <TableShell minWidthClassName="min-w-[1320px]">
              <TableHead>
                {canDelete ? (
                  <TableHeadCell align="center" className="w-12">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      disabled={visibleStaffCodes.length === 0 || isBulkDeleting}
                      className="h-4 w-4 accent-[#ef1b2d]"
                      aria-label="Chọn tất cả nhân sự đang xem"
                    />
                  </TableHeadCell>
                ) : null}
                <TableHeadCell>Họ tên</TableHeadCell>
                <TableHeadCell>Mã NV</TableHeadCell>
                <TableHeadCell>Phòng ban</TableHeadCell>
                <TableHeadCell>Chức vụ</TableHeadCell>
                <TableHeadCell>Vị trí</TableHeadCell>
                <TableHeadCell>Ca</TableHeadCell>
                <TableHeadCell>Tên đăng nhập</TableHeadCell>
                <TableHeadCell>Mật khẩu</TableHeadCell>
                <TableHeadCell>Chữ ký</TableHeadCell>
                <TableHeadCell className="min-w-[220px]">Quyền xem (JSON)</TableHeadCell>
                <TableHeadCell>Trạng thái</TableHeadCell>
                <TableHeadCell align="center">Thao tác</TableHeadCell>
              </TableHead>
              <TableBody>
                {tableRows.map(({ key, departmentName, member }) => {
                  const code = String(member.code || '').trim();
                  const canTick = Boolean(code);
                  return (
                  <React.Fragment key={key}>
                    <TableRow>
                      {canDelete ? (
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={canTick && selectedStaffCodes.has(code)}
                            onChange={() => toggleStaffCode(code)}
                            disabled={!canTick || isBulkDeleting}
                            className="h-4 w-4 accent-[#ef1b2d] disabled:opacity-40"
                            aria-label={canTick ? `Chọn ${member.name}` : `${member.name} chưa có mã`}
                            title={canTick ? undefined : 'Chưa có mã nhân sự — không thể xóa hàng loạt'}
                          />
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-4 py-3 font-black text-zinc-950">{member.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-zinc-700">
                        {member.code || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{departmentName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{member.role || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{member.position || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700">{member.shift || '—'}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 font-mono text-zinc-700" title={member.username}>
                        {member.username || '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 font-mono text-zinc-700" title={member.password}>
                        {member.password || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {member.signatureUrl ? (
                          <a
                            href={member.signatureUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:underline"
                          >
                            <ImageUp className="h-3.5 w-3.5" />
                            Xem chữ ký
                          </a>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setViewPermissionsMember(member)}
                          className="max-w-[280px] truncate text-left text-[11px] font-semibold text-[#ef1b2d] underline decoration-dotted underline-offset-2 hover:text-[#b30d1c]"
                          title={formatStaffViewPermissionsJson(member.viewPermissions)}
                        >
                          {summarizeStaffViewPermissions(member.viewPermissions)}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge
                          label={member.status}
                          color={member.status === 'Đang làm' ? 'rose' : 'zinc'}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <RowActionsMenu label={`Thao tác ${member.name}`}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewMember({ member, departmentName })}
                            aria-label={`Xem ${member.name}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-[11px] font-bold text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditTarget({
                                  member,
                                  departmentName,
                                  branchName: selectedBranch?.name || ''
                                })
                              }
                              aria-label={`Sửa ${member.name}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Sửa
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteMember(member)}
                              disabled={deletingCode === member.code || isBulkDeleting}
                              aria-label={`Xóa ${member.name}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingCode === member.code ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Xoá
                            </button>
                          ) : null}
                        </div>
                        </RowActionsMenu>
                      </td>
                    </TableRow>
                  </React.Fragment>
                  );
                })}
                {tableRows.length === 0 && !isLoadingStaff && (
                  <TableEmptyRow colSpan={canDelete ? 13 : 12}>Không có nhân sự phù hợp bộ lọc.</TableEmptyRow>
                )}
              </TableBody>
            </TableShell>
          </>
        )}

        {isLoadingStaff && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-bold text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải nhân sự...
          </div>
        )}
      </section>

      <AddStaffModal
        open={showAddStaffForm || Boolean(editTarget)}
        editTarget={editTarget}
        branches={branches}
        departmentOptions={departmentOptions}
        defaultBranchId={addStaffDefaults.branchId}
        defaultDepartment={addStaffDefaults.department}
        onClose={() => {
          setShowAddStaffForm(false);
          setEditTarget(null);
        }}
        onCreated={loadStaffGroups}
      />

      {viewMember && (
        <StaffDetailModal
          member={viewMember.member}
          departmentName={viewMember.departmentName}
          branchName={selectedBranch?.name || ''}
          onClose={() => setViewMember(null)}
          canEdit={canEdit}
          onEdit={() => {
            setEditTarget({
              member: viewMember.member,
              departmentName: viewMember.departmentName,
              branchName: selectedBranch?.name || ''
            });
            setViewMember(null);
          }}
        />
      )}

      {viewPermissionsMember && (
        <StaffViewPermissionsModal
          member={viewPermissionsMember}
          onClose={() => setViewPermissionsMember(null)}
        />
      )}
    </div>
  );
}

function StaffDetailModal({
  member,
  departmentName,
  branchName,
  onClose,
  onEdit,
  canEdit = false
}: {
  member: HrMember;
  departmentName: string;
  branchName: string;
  onClose: () => void;
  onEdit: () => void;
  canEdit?: boolean;
}) {
  const rows: [string, string][] = [
    ['Họ tên', member.name],
    ['Mã NV', member.code || '—'],
    ['Chi nhánh', branchName || '—'],
    ['Phòng ban', departmentName || '—'],
    ['Chức vụ', member.role || '—'],
    ['Vị trí', member.position || '—'],
    ['Ca làm', member.shift || '—'],
    ['Tên đăng nhập', member.username || '—'],
    ['Mật khẩu', member.password || '—'],
    ['Trạng thái', member.status || '—']
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết nhân sự</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{member.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>
        <div className="space-y-2 p-4">
          <dl className="grid grid-cols-1 gap-1.5">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <dt className="text-xs font-black uppercase tracking-wider text-zinc-500">{label}</dt>
                <dd className="text-right text-sm font-semibold text-zinc-800">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Chữ ký</p>
            {member.signatureUrl ? (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white p-1">
                  <img
                    src={cloudinaryPreviewUrl(member.signatureUrl, 320)}
                    alt={`Chữ ký ${member.name}`}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <a
                  href={member.signatureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline"
                >
                  Mở ảnh gốc
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : (
              <p className="mt-1 text-sm font-semibold text-zinc-500">Chưa có chữ ký.</p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Quyền xem menu</p>
            <p className="mt-1 text-sm font-semibold text-zinc-800">
              {summarizeStaffViewPermissions(member.viewPermissions)}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c]"
            >
              <Pencil className="h-4 w-4" />
              Sửa
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StaffViewPermissionsModal({ member, onClose }: { member: HrMember; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Quyền xem menu</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">{member.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>
        <div className="space-y-3 p-4">
          {member.viewPermissions.length === 0 ? (
            <p className="text-sm font-semibold text-zinc-500">Chưa cấu hình quyền xem.</p>
          ) : (
            member.viewPermissions.map(group => (
              <div key={group.menu} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-700">{group.label}</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-400">{group.menu}</p>
                {group.children.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {group.children.map(child => (
                      <li key={`${group.menu}-${child.tab}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-zinc-800">{child.label}</span>
                        <span className="font-mono text-[10px] text-zinc-400">{child.tab}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-zinc-500">Không có menu con.</p>
                )}
              </div>
            ))
          )}
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-3 text-[11px] leading-5 text-emerald-300">
            {formatStaffViewPermissionsJson(member.viewPermissions)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function StaffViewPermissionsPicker({
  value,
  onChange
}: {
  value: StaffViewPermissions;
  onChange: (next: StaffViewPermissions) => void;
}) {
  return (
    <div className="col-span-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Quyền xem menu</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(defaultStaffViewPermissions())}
            className="text-[10px] font-bold uppercase tracking-wider text-[#ef1b2d] hover:underline"
          >
            Chọn tất cả
          </button>
          <span className="text-zinc-300">|</span>
          <button
            type="button"
            onClick={() => onChange(clearStaffViewPermissions())}
            className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:underline"
          >
            Bỏ chọn tất cả
          </button>
        </div>
      </div>
      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {STAFF_MENU_VIEW_TREE.map(group => (
          <div key={group.menu} className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <p className="text-xs font-black text-zinc-800">{group.label}</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {group.children.map(child => {
                const checked = isStaffChildViewSelected(value, group.menu, child.tab);
                return (
                  <label key={`${group.menu}-${child.tab}`} className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={event =>
                        onChange(
                          toggleStaffChildView(value, group.menu, group.label, child, event.target.checked)
                        )
                      }
                      className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                    <span>{child.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function generateNextStaffCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^NV(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `NV${String(next).padStart(width, '0')}`;
}

export function collectStaffCodes(branches: HrBranch[]): string[] {
  return branches.flatMap(branch =>
    branch.departments.flatMap(department =>
      department.members.map(member => member.code).filter((code): code is string => Boolean(code))
    )
  );
}

export type StaffFormState = {
  name: string;
  code: string;
  branch: string;
  department: string;
  role: string;
  shift: string;
  status: string;
  username: string;
  password: string;
  signatureUrl: string;
  viewPermissions: StaffViewPermissions;
};

export function emptyStaffForm(defaults?: { branch?: string; department?: string }): StaffFormState {
  return {
    name: '',
    code: '',
    branch: defaults?.branch || 'Phú Thọ',
    department: defaults?.department || 'Sản xuất',
    role: 'Nhân sự',
    shift: STANDARD_SHIFTS[0] || 'Ca 1',
    status: 'Đang làm',
    username: '',
    password: '',
    signatureUrl: '',
    viewPermissions: []
  };
}

export function AddStaffModal({
  open,
  onClose,
  onCreated,
  branches,
  departmentOptions,
  defaultBranchId,
  defaultDepartment,
  editTarget
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  branches: HrBranch[];
  departmentOptions: string[];
  defaultBranchId: string;
  defaultDepartment: string;
  editTarget?: { member: HrMember; departmentName: string; branchName: string } | null;
}) {
  const [form, setForm] = useState<StaffFormState>(emptyStaffForm());
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);

  const isEditing = Boolean(editTarget);

  const branchOptions = useMemo(() => {
    const names = branches.map(branch => branch.name).filter(Boolean);
    return names.length > 0 ? names : ['Phú Thọ'];
  }, [branches]);

  useEffect(() => {
    if (!open) return;

    if (editTarget) {
      const { member, departmentName, branchName } = editTarget;
      setForm({
        name: member.name,
        code: member.code || '',
        branch: branchName || branchOptions[0] || 'Phú Thọ',
        department: departmentName || departmentOptions[0] || 'Sản xuất',
        role: member.role || 'Nhân sự',
        shift: member.shift || STANDARD_SHIFTS[0] || 'Ca 1',
        status: member.status || 'Đang làm',
        username: member.username || '',
        password: member.password || '',
        signatureUrl: member.signatureUrl || '',
        viewPermissions: member.viewPermissions || []
      });
      setFormError('');
      return;
    }

    const branchName = branches.find(branch => branch.id === defaultBranchId)?.name || branchOptions[0] || 'Phú Thọ';
    const nextCode = generateNextStaffCode(collectStaffCodes(branches));
    setForm({
      ...emptyStaffForm({ branch: branchName, department: defaultDepartment || departmentOptions[0] || 'Sản xuất' }),
      code: nextCode
    });
    setFormError('');
  }, [open, editTarget, defaultBranchId, defaultDepartment, branches, branchOptions, departmentOptions]);

  if (!open) return null;

  const handleSignatureFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Chữ ký phải là file ảnh JPG, PNG hoặc WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Ảnh chữ ký không được vượt quá 5 MB.');
      return;
    }

    setIsUploadingSignature(true);
    setFormError('');
    try {
      const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1200, quality: 0.82 });
      const uploaded = await uploadImage(dataUrl, 'nhan_su/chu_ky');
      if (!uploaded.imageUrl) throw new Error('Cloudinary không trả về URL ảnh.');
      setForm(prev => ({ ...prev, signatureUrl: uploaded.imageUrl }));
    } catch (error: any) {
      setFormError(error.message || 'Không thể upload chữ ký lên Cloudinary.');
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('Vui lòng nhập tên nhân sự.');
      return;
    }
    if (!form.department.trim()) {
      setFormError('Vui lòng chọn phòng ban.');
      return;
    }
    if (isEditing && !form.code.trim()) {
      setFormError('Nhân sự này chưa có mã (ma_nhan_su) nên không thể cập nhật.');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const payload = {
        nhan_su: form.name.trim(),
        ma_nhan_su: form.code.trim(),
        chi_nhanh: form.branch.trim(),
        phong_ban: form.department.trim(),
        cong_viec: form.role.trim(),
        vi_tri: `${form.department.trim()}_${form.role.trim()}`.replace(/\s+/g, '_').replace(/_+/g, '_'),
        ca_lam: form.shift.trim(),
        trang_thai: form.status.trim(),
        ten_dang_nhap: form.username.trim(),
        mat_khau: form.password.trim(),
        link_chu_ky: form.signatureUrl.trim(),
        quyen_xem: form.viewPermissions
      };

      const res = isEditing
        ? await fetch(`/api/nhan-su/${encodeURIComponent(form.code.trim())}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/nhan-su', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || (isEditing ? 'Không thể cập nhật nhân sự.' : 'Không thể thêm nhân sự.'));
      }

      await onCreated();
      onClose();
    } catch (error: any) {
      setFormError(error.message || (isEditing ? 'Không thể cập nhật nhân sự.' : 'Không thể thêm nhân sự.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              {isEditing ? 'Sửa nhân sự' : 'Thêm nhân sự mới'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Đóng
          </button>
        </div>

        {formError && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Họ và tên *</span>
            <input
              value={form.name}
              onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              placeholder="Nhập tên nhân sự"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã NV</span>
            <input
              value={form.code}
              readOnly
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 font-mono text-sm font-semibold text-zinc-800 outline-none"
              placeholder="Tự sinh"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chi nhánh</span>
            <select
              value={form.branch}
              onChange={event => setForm(prev => ({ ...prev, branch: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {branchOptions.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phòng ban *</span>
            <select
              value={form.department}
              onChange={event => setForm(prev => ({ ...prev, department: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {departmentOptions.map(department => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chức vụ</span>
            <input
              value={form.role}
              onChange={event => setForm(prev => ({ ...prev, role: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca làm</span>
            <select
              value={form.shift}
              onChange={event => setForm(prev => ({ ...prev, shift: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {STANDARD_SHIFTS.map(shift => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên đăng nhập</span>
            <input
              value={form.username}
              onChange={event => setForm(prev => ({ ...prev, username: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              placeholder="Tài khoản đăng nhập"
              autoComplete="username"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Password</span>
            <input
              type="text"
              value={form.password}
              onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 px-3 font-mono text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              placeholder="Mật khẩu"
              autoComplete="new-password"
            />
          </label>
          <label className="col-span-2 space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
            <select
              value={form.status}
              onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              {['Đang làm', 'Nghỉ phép', 'Nghỉ việc'].map(status => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div className="col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Link chữ ký</span>
              <span className="text-[10px] font-semibold text-zinc-400">Lưu ảnh trên Cloudinary</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="url"
                value={form.signatureUrl}
                onChange={event => setForm(prev => ({ ...prev, signatureUrl: event.target.value }))}
                className="h-10 min-w-0 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                placeholder="https://res.cloudinary.com/..."
              />
              <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-extrabold text-sky-700 transition hover:bg-sky-100 ${isUploadingSignature ? 'pointer-events-none opacity-60' : ''}`}>
                {isUploadingSignature ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {isUploadingSignature ? 'Đang tải...' : 'Chọn ảnh'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={isUploadingSignature}
                  onChange={event => {
                    void handleSignatureFile(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {form.signatureUrl && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
                <div className="flex h-16 w-36 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white p-1">
                  <img
                    src={cloudinaryPreviewUrl(form.signatureUrl, 360)}
                    alt="Xem trước chữ ký"
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, signatureUrl: '' }))}
                  className="h-9 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50"
                >
                  Xóa ảnh
                </button>
              </div>
            )}
          </div>

          <StaffViewPermissionsPicker
            value={form.viewPermissions}
            onChange={viewPermissions => setForm(prev => ({ ...prev, viewPermissions }))}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isUploadingSignature}
            className="h-10 rounded-xl border border-zinc-200 px-4 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving || isUploadingSignature}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : isEditing ? 'Cập nhật' : 'Lưu nhân sự'}
          </button>
        </div>
      </div>
    </div>
  );
}

