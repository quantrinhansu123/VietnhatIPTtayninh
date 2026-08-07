import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { useTabAccess } from '../../app/useTabAccess';
import { BackButton } from '../../components/layout/NavButtons';
import { pickText, fileToDataUrl, uploadImage, formatCell, formatTimeCell } from '../_shared/recordHelpers';
import { orderFieldClass } from '../_shared/orderHelpers';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { normalizeHrBranches, type HrBranch, type HrMember } from '../_shared/hr';
import type { StaffViewPermissions } from '../nhan-su/menuViews';
import { summarizeStaffViewPermissions } from '../nhan-su/menuViews';
import { buildPermissionKey, parsePermissionSettings } from './permissionKeys';
import { RolePermissionsMatrix } from './RolePermissionsMatrix';
import {
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  RowActionsMenu
} from '../../components/shared/table';
import {
  StaffRoleAssignmentPanel,
  collectPositionsFromHrTree,
  collectPositionsFromPermissionRoles
} from './StaffRoleAssignmentPanel';
import { isSpecialSettingsRow } from './staffAssignments';
import {
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound
} from 'lucide-react';

export interface SettingRow {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  timeFrame: string;
  startTime: string;
  endTime: string;
  group: string;
  note: string;
}

export function normalizeSettings(data: unknown): SettingRow[] {
  if (!data || typeof data !== 'object') return [];
  const settings = (data as { settings?: unknown }).settings;
  if (!Array.isArray(settings)) return [];

  return settings
    .map((item): SettingRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_cai_dat', 'ma', 'key', 'code'], '');
      const name = pickText(record, ['ten_cai_dat', 'hang_muc', 'ten', 'name', 'tieu_de'], '');
      const startTime = formatTimeCell(
        record.gio_bat_dau ?? record.thoi_gian_bat_dau ?? record.start_time ?? record.gio_bd
      );
      let endTime = formatTimeCell(
        record.gio_ket_thuc ?? record.thoi_gian_ket_thuc ?? record.end_time ?? record.gio_kt
      );
      if (startTime === '-' || endTime === '-') {
        const legacyValue = formatCell(record.gia_tri);
        if (legacyValue !== '-') {
          const parts = legacyValue.split(/\s*[-–—]\s*|\s+đến\s+/i).map(part => part.trim()).filter(Boolean);
          if (parts[0]) {
            const parsedStart = formatTimeCell(parts[0]);
            if (parsedStart !== '-') {
              const parsedEnd = parts[1] ? formatTimeCell(parts[1]) : '-';
              return {
                id: pickText(record, ['id'], code || name),
                code,
                name,
                loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
                timeFrame: pickText(record, ['khung_gio'], '-'),
                startTime: startTime === '-' ? parsedStart : startTime,
                endTime: endTime === '-' ? parsedEnd : endTime,
                group: pickText(record, ['nhom', 'group', 'phan_loai'], '-'),
                note: pickText(record, ['mo_ta', 'ghi_chu', 'note', 'description'], '')
              };
            }
          }
        }
      }
      if (!code && !name && startTime === '-' && endTime === '-') return null;

      return {
        id: pickText(record, ['id'], code || name),
        code,
        name,
        loaiCaiDat: pickText(record, ['loai_cai_dat', 'loai'], '-'),
        timeFrame: pickText(record, ['khung_gio'], '-'),
        startTime,
        endTime,
        group: pickText(record, ['nhom', 'group', 'phan_loai'], '-'),
        note: pickText(record, ['mo_ta', 'ghi_chu', 'note', 'description'], '')
      };
    })
    .filter((setting): setting is SettingRow => Boolean(setting));
}

export const SETTING_TYPE_OPTIONS = ['Thời gian', 'Ca máy', 'Sản xuất', 'Chung'] as const;

/** Sổ xuống giờ bắt đầu / kết thúc — bước 15 phút + 23:59 */
export const SETTING_TIME_OPTIONS: string[] = (() => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  if (!options.includes('23:59')) options.push('23:59');
  return options;
})();

export type SettingFormState = {
  code: string;
  name: string;
  loaiCaiDat: string;
  startTime: string;
  endTime: string;
  group: string;
  note: string;
};

function isValid24HourTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function timeSelectOptions(currentValue: string) {
  const value = currentValue.trim();
  if (value && isValid24HourTime(value) && !SETTING_TIME_OPTIONS.includes(value)) {
    return [...SETTING_TIME_OPTIONS, value].sort();
  }
  return SETTING_TIME_OPTIONS;
}

const emptySettingForm = (): SettingFormState => ({
  code: '',
  name: '',
  loaiCaiDat: SETTING_TYPE_OPTIONS[0],
  startTime: '',
  endTime: '',
  group: 'Chung',
  note: ''
});

export function settingToForm(setting: SettingRow): SettingFormState {
  const loaiCaiDat = (SETTING_TYPE_OPTIONS as readonly string[]).includes(setting.loaiCaiDat)
    ? setting.loaiCaiDat
    : SETTING_TYPE_OPTIONS[0];

  return {
    code: setting.code === '-' ? '' : setting.code,
    name: setting.name === '-' ? '' : setting.name,
    loaiCaiDat,
    startTime: setting.startTime === '-' ? '' : setting.startTime,
    endTime: setting.endTime === '-' ? '' : setting.endTime,
    group: setting.group === '-' ? 'Chung' : setting.group,
    note: setting.note === '-' ? '' : setting.note
  };
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('settings');
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [branches, setBranches] = useState<HrBranch[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [activeSection, setActiveSection] = useState<
    'settings' | 'permissions' | 'role-permissions' | 'staff-assignments'
  >('settings');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingSetting, setViewingSetting] = useState<SettingRow | null>(null);
  const [deletingSettingId, setDeletingSettingId] = useState<string | null>(null);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [settingForm, setSettingForm] = useState<SettingFormState>(emptySettingForm);
  const [permissionForm, setPermissionForm] = useState<{
    id: string;
    department: string;
    position: string;
    viewPermissions: StaffViewPermissions;
    editPermissions: StaffViewPermissions;
    deletePermissions: StaffViewPermissions;
  }>({
    id: '',
    department: '',
    position: '',
    viewPermissions: [],
    editPermissions: [],
    deletePermissions: []
  });
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const [deletingPermissionId, setDeletingPermissionId] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [isLoadingStaffOptions, setIsLoadingStaffOptions] = useState(true);
  const [staffOptionsError, setStaffOptionsError] = useState('');

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    setSettingsError('');

    try {
      const res = await fetch('/api/cai-dat');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải cài đặt từ Supabase.');
      }

      const next = normalizeSettings(data);
      setSettings(next);

      const warning = typeof data.warning === 'string' ? data.warning.trim() : '';
      if (warning) {
        setSettingsError(warning);
      } else if (data.source === 'local') {
        setSettingsError(
          'Chưa kết nối được bảng cai_dat_thoi_gian trên Supabase. Chạy file supabase-cai-dat-thoi-gian.sql rồi tải lại trang.'
        );
      }
    } catch (error: any) {
      setSettings([]);
      setSettingsError(error.message || 'Không thể tải cài đặt từ Supabase.');
    } finally {
      setIsLoadingSettings(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadStaffGroups = useCallback(async () => {
    setIsLoadingStaffOptions(true);
    setStaffOptionsError('');
    try {
      const res = await fetch('/api/nhan-su?format=groups&scope=all');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải phòng ban / vị trí từ nhan_su.');
      }
      setBranches(normalizeHrBranches(data));
    } catch (error: any) {
      setBranches([]);
      setStaffOptionsError(error.message || 'Không thể tải phòng ban / vị trí từ nhan_su.');
    } finally {
      setIsLoadingStaffOptions(false);
    }
  }, []);

  useEffect(() => {
    void loadStaffGroups();
  }, [loadStaffGroups]);

  const openAddForm = () => {
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setSettingForm(emptySettingForm());
    setFormMode('add');
  };

  const openEditForm = (setting: SettingRow) => {
    setFormError('');
    setActionMessage('');
    setViewingSetting(null);
    setEditingId(setting.id);
    setSettingForm(settingToForm(setting));
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
  };

  const validateSettingForm = () => {
    if (!settingForm.code.trim()) {
      setFormError('Vui lòng nhập mã cài đặt.');
      return false;
    }
    if (!settingForm.name.trim()) {
      setFormError('Vui lòng nhập hạng mục / tên cài đặt.');
      return false;
    }
    if (!settingForm.loaiCaiDat.trim()) {
      setFormError('Vui lòng chọn loại cài đặt (loai_cai_dat).');
      return false;
    }
    if (!isValid24HourTime(settingForm.startTime)) {
      setFormError('Giờ bắt đầu phải đúng định dạng 24 giờ HH:mm (00:00–23:59).');
      return false;
    }
    if (!isValid24HourTime(settingForm.endTime)) {
      setFormError('Giờ kết thúc phải đúng định dạng 24 giờ HH:mm (00:00–23:59).');
      return false;
    }
    return true;
  };

  const handleSaveSetting = async () => {
    if (!validateSettingForm()) return;

    setIsSavingSetting(true);
    setFormError('');

    try {
      const payload = {
        ...settingForm,
        khungGio: `${settingForm.startTime} - ${settingForm.endTime}`
      };
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/cai-dat/${editingId}` : '/api/cai-dat', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật cài đặt.' : 'Không thể thêm cài đặt mới.'));
      }

      closeForm();
      setSelectedGroup('all');
      setSearchText('');
      setActionMessage(isEdit ? 'Đã cập nhật cài đặt (đã ghi Supabase bảng cai_dat_thoi_gian).' : 'Đã thêm cài đặt mới vào Supabase (cai_dat_thoi_gian).');
      await loadSettings();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu cài đặt.');
    } finally {
      setIsSavingSetting(false);
    }
  };

  const handleDeleteSetting = async (setting: SettingRow) => {
    if (!setting.id) {
      setActionMessage('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa cài đặt "${setting.name || setting.code}"?`)) return;

    setDeletingSettingId(setting.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/cai-dat/${setting.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa cài đặt.');
      }

      if (viewingSetting?.id === setting.id) setViewingSetting(null);
      setActionMessage('Đã xóa cài đặt.');
      await loadSettings();
    } catch (error: any) {
      setActionMessage(error.message || 'Không thể xóa cài đặt.');
    } finally {
      setDeletingSettingId(null);
    }
  };

  const settingGroups = useMemo(() => {
    const groups = settings
      .filter(setting => !isSpecialSettingsRow(setting))
      .map(setting => setting.group)
      .filter((group): group is string => group !== '-' && group.length > 0);
    return ['all', ...[...new Set(groups)].sort((a, b) => String(a).localeCompare(String(b), 'vi'))];
  }, [settings]);

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredSettings = useMemo(() => {
    return settings.filter(setting => {
      if (isSpecialSettingsRow(setting)) return false;
      const matchesGroup = selectedGroup === 'all' || setting.group === selectedGroup;
      const matchesSearch =
        !normalizedSearch ||
        `${setting.code} ${setting.name} ${setting.loaiCaiDat} ${setting.timeFrame} ${setting.startTime} ${setting.endTime} ${setting.group} ${setting.note}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesGroup && matchesSearch;
    });
  }, [normalizedSearch, selectedGroup, settings]);

  const permissionSettings = useMemo(
    () =>
      parsePermissionSettings(
        settings.map(setting => ({
          id: setting.id,
          code: setting.code,
          name: setting.name,
          loaiCaiDat: setting.loaiCaiDat,
          group: setting.group,
          note: setting.note
        }))
      ),
    [settings]
  );

  const availableAssignablePositions = useMemo(() => {
    const fromRoles = collectPositionsFromPermissionRoles(permissionSettings);
    if (fromRoles.length > 0) return fromRoles;
    return collectPositionsFromHrTree(
      branches.flatMap(branch =>
        branch.departments.map(department => ({
          department: department.name,
          members: department.members
        }))
      )
    );
  }, [branches, permissionSettings]);


  // Phòng ban = distinct phong_ban từ bảng nhan_su
  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    branches.forEach(branch =>
      branch.departments.forEach(department => {
        const name = department.name.trim();
        if (name && name !== 'Chưa phân phòng ban') names.add(name);
      })
    );
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [branches]);

  // Vị trí = distinct cong_viec (role) từ nhan_su, theo phòng ban đang chọn
  const positionOptions = useMemo(() => {
    const names = new Set<string>();
    branches.forEach(branch =>
      branch.departments.forEach(department => {
        if (permissionForm.department && department.name !== permissionForm.department) return;
        department.members.forEach(member => {
          const position = (member.role || member.position || '').trim();
          if (position) names.add(position);
        });
      })
    );
    if (names.size === 0) {
      branches.forEach(branch =>
        branch.departments.forEach(department => {
          department.members.forEach(member => {
            const position = (member.role || member.position || '').trim();
            if (position) names.add(position);
          });
        })
      );
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [branches, permissionForm.department]);

  useEffect(() => {
    if (!permissionForm.department && departmentOptions[0]) {
      setPermissionForm(prev => ({ ...prev, department: departmentOptions[0] }));
    }
  }, [departmentOptions, permissionForm.department]);

  useEffect(() => {
    if (!permissionForm.position) {
      if (positionOptions[0]) {
        setPermissionForm(prev => ({ ...prev, position: positionOptions[0] }));
      }
      return;
    }
    if (positionOptions.length > 0 && !positionOptions.includes(permissionForm.position)) {
      setPermissionForm(prev => ({ ...prev, position: positionOptions[0] || '' }));
    }
  }, [positionOptions, permissionForm.position]);

  const currentPermissionKey = buildPermissionKey(permissionForm.department, permissionForm.position);

  const handleSelectPermission = (permissionId: string) => {
    const selected = permissionSettings.find(item => item.id === permissionId);
    if (!selected) return;
    setPermissionForm({
      id: selected.id,
      department: selected.department,
      position: selected.position,
      viewPermissions: selected.viewPermissions,
      editPermissions: selected.editPermissions,
      deletePermissions: selected.deletePermissions
    });
    setPermissionError('');
    setPermissionMessage('');
  };

  const resetPermissionForm = () => {
    setPermissionForm({
      id: '',
      department: departmentOptions[0] || '',
      position: '',
      viewPermissions: [],
      editPermissions: [],
      deletePermissions: []
    });
    setPermissionError('');
    setPermissionMessage('');
  };

  const handleSavePermission = async () => {
    if (!permissionForm.department.trim()) {
      setPermissionError('Vui lòng chọn phòng ban.');
      return;
    }
    if (!permissionForm.position.trim()) {
      setPermissionError('Vui lòng chọn vị trí.');
      return;
    }

    setIsSavingPermission(true);
    setPermissionError('');
    setPermissionMessage('');

    try {
      const existed = permissionSettings.find(
        item =>
          item.permissionKey === currentPermissionKey &&
          (!permissionForm.id || permissionForm.id !== item.id)
      );
      const targetId = permissionForm.id || existed?.id || '';
      const payload = {
        code: `PERM_KEY_${currentPermissionKey}`,
        name: `${permissionForm.department} - ${permissionForm.position}`,
        loaiCaiDat: 'Phân quyền',
        startTime: '00:00',
        endTime: '00:00',
        group: 'Phân quyền',
        note: JSON.stringify({
          department: permissionForm.department,
          position: permissionForm.position,
          permissionKey: currentPermissionKey,
          viewPermissions: permissionForm.viewPermissions,
          editPermissions: permissionForm.editPermissions,
          deletePermissions: permissionForm.deletePermissions
        })
      };
      const res = await fetch(targetId ? `/api/cai-dat/${targetId}` : '/api/cai-dat', {
        method: targetId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể lưu key phân quyền.');
      }
      setPermissionMessage(targetId ? 'Đã cập nhật key phân quyền.' : 'Đã tạo key phân quyền.');
      await loadSettings();
      if (!targetId) {
        setPermissionForm(prev => ({ ...prev, id: '' }));
      }
    } catch (error: any) {
      setPermissionError(error.message || 'Không thể lưu key phân quyền.');
    } finally {
      setIsSavingPermission(false);
    }
  };

  const handleDeletePermission = async (permissionId: string) => {
    if (!window.confirm('Bạn có chắc muốn xóa key phân quyền này?')) return;
    setDeletingPermissionId(permissionId);
    setPermissionError('');
    setPermissionMessage('');
    try {
      const res = await fetch(`/api/cai-dat/${permissionId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa key phân quyền.');
      }
      if (permissionForm.id === permissionId) resetPermissionForm();
      setPermissionMessage('Đã xóa key phân quyền.');
      await loadSettings();
    } catch (error: any) {
      setPermissionError(error.message || 'Không thể xóa key phân quyền.');
    } finally {
      setDeletingPermissionId('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4">
      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa cài đặt' : 'Thêm cài đặt mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
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
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã cài đặt *</span>
                <input
                  value={settingForm.code}
                  onChange={e => setSettingForm(prev => ({ ...prev, code: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: TG_CA_SANG"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Hạng mục *</span>
                <input
                  value={settingForm.name}
                  onChange={e => setSettingForm(prev => ({ ...prev, name: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: Ca sáng"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại cài đặt *</span>
                <SearchableSelect
                  value={settingForm.loaiCaiDat}
                  onChange={loaiCaiDat => setSettingForm(prev => ({ ...prev, loaiCaiDat }))}
                  options={[...SETTING_TYPE_OPTIONS]}
                  placeholder="Gõ để tìm loại cài đặt"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ bắt đầu *</span>
                <select
                  value={settingForm.startTime}
                  onChange={e => setSettingForm(prev => ({ ...prev, startTime: e.target.value }))}
                  className={orderFieldClass}
                >
                  <option value="">Chọn giờ bắt đầu</option>
                  {timeSelectOptions(settingForm.startTime).map(time => (
                    <option key={`start-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Giờ kết thúc *</span>
                <select
                  value={settingForm.endTime}
                  onChange={e => setSettingForm(prev => ({ ...prev, endTime: e.target.value }))}
                  className={orderFieldClass}
                >
                  <option value="">Chọn giờ kết thúc</option>
                  {timeSelectOptions(settingForm.endTime).map(time => (
                    <option key={`end-${time}`} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhóm</span>
                <input
                  value={settingForm.group}
                  onChange={e => setSettingForm(prev => ({ ...prev, group: e.target.value }))}
                  className={orderFieldClass}
                  placeholder="VD: Thời gian"
                />
              </label>
              <label className="col-span-2 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input
                  value={settingForm.note}
                  onChange={e => setSettingForm(prev => ({ ...prev, note: e.target.value }))}
                  className={orderFieldClass}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveSetting}
                disabled={isSavingSetting}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingSetting ? 'Đang lưu...' : formMode === 'edit' ? 'Cập nhật' : 'Lưu cài đặt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingSetting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết cài đặt</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">{viewingSetting.code || viewingSetting.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingSetting(null)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              {[
                ['Mã cài đặt', viewingSetting.code],
                ['Hạng mục', viewingSetting.name],
                ['Loại cài đặt', viewingSetting.loaiCaiDat],
                ['Khung giờ', viewingSetting.timeFrame !== '-' ? viewingSetting.timeFrame : `${viewingSetting.startTime} - ${viewingSetting.endTime}`],
                ['Giờ bắt đầu', viewingSetting.startTime],
                ['Giờ kết thúc', viewingSetting.endTime],
                ['Nhóm', viewingSetting.group],
                ['Ghi chú', viewingSetting.note || '-']
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-bold text-zinc-900">{value || '-'}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => openEditForm(viewingSetting)}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-4 text-xs font-extrabold text-[#ef1b2d] transition hover:bg-red-100"
                >
                  <Pencil className="h-4 w-4" />
                  Sửa
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => handleDeleteSetting(viewingSetting)}
                  disabled={deletingSettingId === viewingSetting.id}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-extrabold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingSettingId === viewingSetting.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Xóa
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveSection('settings')}
          aria-pressed={activeSection === 'settings'}
          className={`group flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-sm transition ${
            activeSection === 'settings'
              ? 'border-[#ef1b2d] bg-red-50 shadow-red-100'
              : 'border-zinc-900/10 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md'
          }`}
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            activeSection === 'settings' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-700'
          }`}>
            <Clock3 className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-zinc-950">Cài đặt hệ thống</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">
              Quản lý ca máy, thời gian và các tham số vận hành.
            </span>
          </span>
          <ChevronRight className={`h-5 w-5 shrink-0 transition ${
            activeSection === 'settings' ? 'text-[#ef1b2d]' : 'text-zinc-300 group-hover:text-zinc-600'
          }`} />
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('permissions')}
          aria-pressed={activeSection === 'permissions'}
          className={`group flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-sm transition ${
            activeSection === 'permissions'
              ? 'border-[#ef1b2d] bg-red-50 shadow-red-100'
              : 'border-zinc-900/10 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md'
          }`}
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            activeSection === 'permissions' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-700'
          }`}>
            <ShieldCheck className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-zinc-950">Phân quyền</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">
              Tạo key và cấp quyền truy cập menu theo phòng ban, vị trí.
            </span>
          </span>
          <ChevronRight className={`h-5 w-5 shrink-0 transition ${
            activeSection === 'permissions' ? 'text-[#ef1b2d]' : 'text-zinc-300 group-hover:text-zinc-600'
          }`} />
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('role-permissions')}
          aria-pressed={activeSection === 'role-permissions'}
          className={`group flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-sm transition ${
            activeSection === 'role-permissions'
              ? 'border-[#ef1b2d] bg-red-50 shadow-red-100'
              : 'border-zinc-900/10 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md'
          }`}
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            activeSection === 'role-permissions' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-700'
          }`}>
            <UsersRound className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-zinc-950">Phân quyền các Vai trò</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">
              Tick quyền xem / sửa / xóa theo menu cha và menu con.
            </span>
          </span>
          <ChevronRight className={`h-5 w-5 shrink-0 transition ${
            activeSection === 'role-permissions' ? 'text-[#ef1b2d]' : 'text-zinc-300 group-hover:text-zinc-600'
          }`} />
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('staff-assignments')}
          aria-pressed={activeSection === 'staff-assignments'}
          className={`group flex min-h-28 items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-sm transition ${
            activeSection === 'staff-assignments'
              ? 'border-[#ef1b2d] bg-red-50 shadow-red-100'
              : 'border-zinc-900/10 bg-white hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md'
          }`}
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            activeSection === 'staff-assignments' ? 'bg-[#ef1b2d] text-white' : 'bg-zinc-100 text-zinc-700'
          }`}>
            <UserCog className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-zinc-950">Gán quyền nhân sự</span>
            <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">
              Gán nhiều vị trí theo mã NV (tên chỉ hiển thị).
            </span>
          </span>
          <ChevronRight className={`h-5 w-5 shrink-0 transition ${
            activeSection === 'staff-assignments' ? 'text-[#ef1b2d]' : 'text-zinc-300 group-hover:text-zinc-600'
          }`} />
        </button>
      </section>

      {activeSection === 'settings' ? (
        <>
      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-1 lg:pb-0">
          {settingGroups.map(group => (
            <button
              key={group}
              type="button"
              onClick={() => setSelectedGroup(group)}
              className={`h-11 shrink-0 rounded-xl border px-4 text-sm font-black transition ${
                selectedGroup === group
                  ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white shadow-sm'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
              }`}
            >
              {group === 'all' ? 'Tất cả' : group}
            </button>
          ))}
          {isLoadingSettings && (
            <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
              Đang tải Supabase...
            </div>
          )}
        </div>

        <div className="mt-3 lg:mt-0 lg:w-[420px]">
          <TableSearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Tìm mã, tên, giá trị cài đặt..."
            disabled={isLoadingSettings}
          />
        </div>

        {canCreate ? (
          <button
            type="button"
            onClick={openAddForm}
            className="mt-3 flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] lg:mt-0"
          >
            <Plus className="h-4 w-4" />
            Thêm mới
          </button>
        ) : null}

        {settingsError && (
          <p
            className={`mt-3 w-full rounded-xl border px-3 py-2 text-xs font-bold lg:basis-full ${
              /supabase-cai-dat|chưa có|chưa kết nối|thiếu cột/i.test(settingsError)
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {settingsError}
          </p>
        )}

        {actionMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 lg:mt-0">
            {actionMessage}
          </p>
        )}
      </section>

      <TableShell minWidthClassName="min-w-[1080px]">
        <TableHead>
          <TableHeadCell>Mã</TableHeadCell>
          <TableHeadCell>Tên cài đặt</TableHeadCell>
          <TableHeadCell>Loại</TableHeadCell>
          <TableHeadCell>Giờ bắt đầu</TableHeadCell>
          <TableHeadCell>Giờ kết thúc</TableHeadCell>
          <TableHeadCell>Nhóm</TableHeadCell>
          <TableHeadCell>Ghi chú</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredSettings.map(setting => (
            <React.Fragment key={setting.id}>
              <TableRow>
                <td className="px-4 py-3 font-black text-zinc-950">{setting.code || '-'}</td>
                <td className="px-4 py-3 font-black text-zinc-950">{setting.name || '-'}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-black text-zinc-800">
                    {setting.loaiCaiDat}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-[#ef1b2d]/20 bg-red-50 px-2.5 py-1 text-xs font-black text-[#ef1b2d]">
                    {setting.startTime}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-black text-zinc-800">
                    {setting.endTime}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-zinc-700">{setting.group}</td>
                <td className="px-4 py-3 font-semibold text-zinc-500">{setting.note || '-'}</td>
                <td className="px-4 py-3">
                  <RowActionsMenu label={`Thao tác ${setting.name}`}>
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingSetting(setting)}
                      title="Xem"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEditForm(setting)}
                        title="Sửa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSetting(setting)}
                        disabled={deletingSettingId === setting.id}
                        title="Xóa"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingSettingId === setting.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  </RowActionsMenu>
                </td>
              </TableRow>
            </React.Fragment>
          ))}

          {!isLoadingSettings && filteredSettings.length === 0 && (
            <TableEmptyRow colSpan={8}>
              Bảng cai_dat_thoi_gian chưa có dữ liệu hoặc không có mục phù hợp bộ lọc.
            </TableEmptyRow>
          )}
        </TableBody>
      </TableShell>
        </>
      ) : activeSection === 'permissions' ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Key phân quyền</h3>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">Ghép `Phòng ban + Vị trí` thành 1 key.</p>
                </div>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={resetPermissionForm}
                    className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                  >
                    Tạo mới
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phòng ban</span>
                  <select
                    value={permissionForm.department}
                    onChange={event =>
                      setPermissionForm(prev => ({
                        ...prev,
                        id: '',
                        department: event.target.value,
                        position: '',
                        viewPermissions: prev.id ? [] : prev.viewPermissions,
                        editPermissions: prev.id ? [] : prev.editPermissions,
                        deletePermissions: prev.id ? [] : prev.deletePermissions
                      }))
                    }
                    disabled={isLoadingStaffOptions || departmentOptions.length === 0}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10 disabled:bg-zinc-50 disabled:text-zinc-400"
                  >
                    {departmentOptions.length === 0 ? (
                      <option value="">
                        {isLoadingStaffOptions ? 'Đang tải từ nhan_su...' : 'Chưa có phòng ban'}
                      </option>
                    ) : (
                      departmentOptions.map(department => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Vị trí</span>
                  <select
                    value={permissionForm.position}
                    onChange={event =>
                      setPermissionForm(prev => ({ ...prev, id: '', position: event.target.value }))
                    }
                    disabled={isLoadingStaffOptions || positionOptions.length === 0}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10 disabled:bg-zinc-50 disabled:text-zinc-400"
                  >
                    {positionOptions.length === 0 ? (
                      <option value="">
                        {isLoadingStaffOptions ? 'Đang tải từ nhan_su...' : 'Chưa có vị trí / chức vụ'}
                      </option>
                    ) : (
                      positionOptions.map(position => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {staffOptionsError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    {staffOptionsError}
                  </p>
                )}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Key tạo ra</p>
                  <p className="mt-1 break-all text-sm font-black text-[#ef1b2d]">{currentPermissionKey || '-'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                    Nguồn: `phong_ban` + `cong_viec` từ bảng nhan_su
                  </p>
                </div>
                {permissionError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    {permissionError}
                  </p>
                )}
                {permissionMessage && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    {permissionMessage}
                  </p>
                )}
                {(permissionForm.id ? canEdit : canCreate) ? (
                  <button
                    type="button"
                    onClick={handleSavePermission}
                    disabled={isSavingPermission}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                  >
                    {isSavingPermission ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSavingPermission ? 'Đang lưu...' : permissionForm.id ? 'Cập nhật key' : 'Lưu key'}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <TableShell minWidthClassName="min-w-max">
                <TableHead>
                  <TableHeadCell className="whitespace-nowrap">Phòng ban</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Vị trí</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Key</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap">Menu đã cấp</TableHeadCell>
                  <TableHeadCell className="whitespace-nowrap" align="center">Thao tác</TableHeadCell>
                </TableHead>
                <TableBody>
                  {permissionSettings.map(item => (
                    <React.Fragment key={item.id}>
                      <tr className={`transition ${permissionForm.id === item.id ? 'bg-red-50/70' : 'hover:bg-red-50/40'}`}>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900">{item.department}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">{item.position}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-black text-[#ef1b2d]">{item.permissionKey}</td>
                        <td
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-zinc-600"
                          title={summarizeStaffViewPermissions(item.viewPermissions)}
                        >
                          {summarizeStaffViewPermissions(item.viewPermissions)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <RowActionsMenu label={`Thao tác ${item.permissionKey}`}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSelectPermission(item.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                              title="Chọn"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => handleDeletePermission(item.id)}
                                disabled={deletingPermissionId === item.id}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                title="Xóa"
                              >
                                {deletingPermissionId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            ) : null}
                          </div>
                          </RowActionsMenu>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {!isLoadingSettings && permissionSettings.length === 0 && (
                    <TableEmptyRow colSpan={5}>Chưa có key phân quyền nào.</TableEmptyRow>
                  )}
                </TableBody>
              </TableShell>
            </div>
          </section>
        </>
      ) : activeSection === 'role-permissions' ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Vai trò</h3>
                  <p className="mt-1 text-xs font-semibold text-zinc-500">
                    Mỗi vai trò = Phòng ban + Vị trí (cùng key phân quyền).
                  </p>
                </div>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={resetPermissionForm}
                    className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                  >
                    Tạo mới
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Phòng ban</span>
                  <select
                    value={permissionForm.department}
                    onChange={event =>
                      setPermissionForm(prev => ({
                        ...prev,
                        id: '',
                        department: event.target.value,
                        position: '',
                        viewPermissions: [],
                        editPermissions: [],
                        deletePermissions: []
                      }))
                    }
                    disabled={isLoadingStaffOptions || departmentOptions.length === 0}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10 disabled:bg-zinc-50 disabled:text-zinc-400"
                  >
                    {departmentOptions.length === 0 ? (
                      <option value="">
                        {isLoadingStaffOptions ? 'Đang tải từ nhan_su...' : 'Chưa có phòng ban'}
                      </option>
                    ) : (
                      departmentOptions.map(department => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Vị trí / chức vụ</span>
                  <select
                    value={permissionForm.position}
                    onChange={event => {
                      const position = event.target.value;
                      const existed = permissionSettings.find(
                        item =>
                          item.department === permissionForm.department && item.position === position
                      );
                      if (existed) {
                        handleSelectPermission(existed.id);
                        return;
                      }
                      setPermissionForm(prev => ({
                        ...prev,
                        id: '',
                        position,
                        viewPermissions: [],
                        editPermissions: [],
                        deletePermissions: []
                      }));
                    }}
                    disabled={isLoadingStaffOptions || positionOptions.length === 0}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-[#ef1b2d]/10 disabled:bg-zinc-50 disabled:text-zinc-400"
                  >
                    {positionOptions.length === 0 ? (
                      <option value="">
                        {isLoadingStaffOptions ? 'Đang tải từ nhan_su...' : 'Chưa có vị trí / chức vụ'}
                      </option>
                    ) : (
                      positionOptions.map(position => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Key vai trò</p>
                  <p className="mt-1 break-all text-sm font-black text-[#ef1b2d]">{currentPermissionKey || '-'}</p>
                </div>

                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-2">
                  {permissionSettings.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs font-semibold text-zinc-500">
                      Chưa có vai trò nào được lưu.
                    </p>
                  ) : (
                    permissionSettings.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectPermission(item.id)}
                        className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition ${
                          permissionForm.id === item.id
                            ? 'bg-red-50 ring-1 ring-[#ef1b2d]/40'
                            : 'hover:bg-zinc-50'
                        }`}
                      >
                        <span className="text-sm font-black text-zinc-900">
                          {item.department} · {item.position}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                {permissionError && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                    {permissionError}
                  </p>
                )}
                {permissionMessage && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    {permissionMessage}
                  </p>
                )}

                {(permissionForm.id ? canEdit : canCreate) ? (
                  <button
                    type="button"
                    onClick={handleSavePermission}
                    disabled={isSavingPermission}
                    className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                  >
                    {isSavingPermission ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSavingPermission ? 'Đang lưu...' : permissionForm.id ? 'Cập nhật quyền vai trò' : 'Lưu quyền vai trò'}
                  </button>
                ) : null}
              </div>
            </div>

            <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-4 shadow-sm">
              <RolePermissionsMatrix
                value={{
                  viewPermissions: permissionForm.viewPermissions,
                  editPermissions: permissionForm.editPermissions,
                  deletePermissions: permissionForm.deletePermissions
                }}
                onChange={next =>
                  setPermissionForm(prev => ({
                    ...prev,
                    viewPermissions: next.viewPermissions,
                    editPermissions: next.editPermissions,
                    deletePermissions: next.deletePermissions
                  }))
                }
              />
            </section>
          </section>
        </>
      ) : null}

      {activeSection === 'staff-assignments' && (
        <StaffRoleAssignmentPanel
          availablePositions={availableAssignablePositions}
          staffMembers={flattenHrMembers(branches)}
          isLoadingStaff={isLoadingStaffOptions}
          staffError={staffOptionsError}
          onReloadStaff={loadStaffGroups}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}

export function flattenHrMembers(branches: HrBranch[]): HrMember[] {
  return branches.flatMap(branch => branch.departments.flatMap(department => department.members));
}

export function getHrDepartmentMembers(branches: HrBranch[], departmentName: string): HrMember[] {
  const needle = departmentName.trim().toLowerCase();
  if (!needle) return [];

  const members: HrMember[] = [];
  const seen = new Set<string>();

  branches.forEach(branch => {
    branch.departments.forEach(department => {
      if (!department.name.toLowerCase().includes(needle)) return;
      department.members.forEach(member => {
        const key = member.name.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        members.push(member);
      });
    });
  });

  return members.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function parseProductionOrderFilterDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function splitProductionOrderStaffNames(value: string): string[] {
  return String(value || '')
    .split(/[,;+]/)
    .map(name => name.trim())
    .filter(name => name && name !== '-');
}

