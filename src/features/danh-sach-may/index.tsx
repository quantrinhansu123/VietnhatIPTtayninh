import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { useTabAccess } from '../../app/useTabAccess';
import { Cpu, Eye, ImagePlus, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import {
  cloudinaryPreviewUrl,
  fileToOptimizedImageDataUrl,
  pickText,
  uploadImage
} from '../_shared/recordHelpers';
import { CAMERA_IMAGE_INPUT_PROPS } from '../../utils/cameraCapture';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { sanitizeDecimalTyping } from '../../lib/mixingReportModel';
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
  RowActionsMenu,
  type StatusBadgeColor
} from '../../components/shared/table';

export interface MachineRow {
  id: string;
  code: string;
  name: string;
  type: string;
  branch: string;
  location: string;
  status: string;
  note: string;
  dinhLuong: string;
  mixingRatios: MachineMixingRatio[];
  imageUrl?: string;
  imagePublicId?: string;
}

export type MachineMixingRatio = {
  materialCode: string;
  materialName: string;
  percent: string;
};

type MachineMaterialOption = {
  code: string;
  name: string;
};

export function normalizeMachineMixingRatios(value: unknown): MachineMixingRatio[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const materialCode = String(record.ma_nvl ?? record.materialCode ?? record.code ?? '').trim();
      const materialName = String(record.ten_nvl ?? record.materialName ?? record.name ?? '').trim();
      const rawPercent = record.phan_tram ?? record.percent ?? '';
      const percent = String(rawPercent).trim();
      if (!materialCode && !materialName) return null;
      return { materialCode, materialName, percent };
    })
    .filter((item): item is MachineMixingRatio => Boolean(item));
}

export function parseMachineDinhLuong(value: string) {
  if (!value || value === '-') return null;
  const num = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

export function formatMachineDinhLuong(value: string) {
  const num = parseMachineDinhLuong(value);
  return num === null ? '-' : formatNumber(num, 2);
}

export function normalizeMachines(data: unknown): MachineRow[] {
  if (!data || typeof data !== 'object') return [];
  const machines = (data as { machines?: unknown }).machines;
  if (!Array.isArray(machines)) return [];

  return machines
    .map((item): MachineRow | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'id'], '');
      const name = pickText(record, ['ten_may', 'may', 'machine_name', 'name'], '');
      if (!code && !name) return null;

      return {
        id: pickText(record, ['id'], code || name),
        code,
        name,
        type: pickText(record, ['loai_may', 'nhom_may', 'type', 'category'], 'Chưa phân loại'),
        branch: pickText(record, ['chi_nhanh', 'co_so', 'branch'], '-'),
        location: pickText(record, ['vi_tri', 'khu_vuc', 'location', 'line'], '-'),
        status: pickText(record, ['trang_thai', 'status', 'tinh_trang'], 'Đang dùng'),
        note: pickText(record, ['ghi_chu', 'mo_ta', 'note', 'description'], ''),
        dinhLuong: pickText(record, ['dinh_luong', 'dinhLuong'], ''),
        mixingRatios: normalizeMachineMixingRatios(record.ty_le_tron ?? record.mixingRatios),
        imageUrl: pickText(record, ['anh_url', 'hinh_anh_url', 'image_url', 'imageUrl'], ''),
        imagePublicId: pickText(record, ['anh_public_id', 'image_public_id', 'imagePublicId'], '')
      };
    })
    .filter((machine): machine is MachineRow => Boolean(machine));
}

export function findMachineByRef(machines: MachineRow[], ref: string): MachineRow | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  return (
    machines.find(machine => machine.code === trimmed) ??
    machines.find(machine => machine.name === trimmed) ??
    machines.find(machine => `${machine.code} · ${machine.name}` === trimmed) ??
    null
  );
}

export function machineSelectLabel(machine: MachineRow): string {
  const name = machine.name?.trim();
  if (name && name !== '-') return name;
  const code = machine.code?.trim();
  if (code && code !== '-') return code;
  return '';
}

export function machineSelectValue(machine: MachineRow): string {
  return machineSelectLabel(machine);
}

export function resolveMachineDisplayValue(machineRef: string, machines: MachineRow[] = []): string {
  const trimmed = machineRef.trim();
  if (!trimmed || trimmed === '-') return '';
  const match = findMachineByRef(machines, trimmed);
  return match ? machineSelectValue(match) : trimmed;
}

export function buildMachineSelectOptions(machines: MachineRow[], currentValue = ''): MachineRow[] {
  const normalized = resolveMachineDisplayValue(currentValue, machines) || currentValue.trim();
  if (!normalized) return machines;

  if (findMachineByRef(machines, normalized) || findMachineByRef(machines, currentValue)) {
    return machines;
  }

  return [
    {
      id: `custom-${normalized}`,
      code: normalized,
      name: normalized,
      type: '-',
      branch: '-',
      location: '-',
      status: '-',
      note: '',
      dinhLuong: '',
      mixingRatios: []
    },
    ...machines
  ];
}

export function renderMachineSelect(
  value: string,
  onChange: (machine: string) => void,
  machines: MachineRow[],
  options?: { disabled?: boolean; placeholder?: string; isLoading?: boolean; inputClassName?: string }
) {
  const machineOptions = buildMachineSelectOptions(machines, value);
  const displayValue = resolveMachineDisplayValue(value, machines) || value;

  return (
    <SearchableSelect
      value={displayValue}
      onChange={onChange}
      options={machineOptions}
      placeholder={options?.placeholder ?? 'Gõ để tìm máy'}
      disabled={options?.disabled}
      isLoading={options?.isLoading}
      inputClassName={options?.inputClassName}
      getLabel={item => machineSelectLabel(item as MachineRow)}
      getValue={item => machineSelectValue(item as MachineRow)}
      resolveSelectedItem={(opts, val) => findMachineByRef(opts as MachineRow[], val)}
    />
  );
}

export type MachineFormState = {
  code: string;
  name: string;
  type: string;
  branch: string;
  location: string;
  status: string;
  note: string;
  dinhLuong: string;
  mixingRatios: MachineMixingRatio[];
};

const emptyMachineForm = (): MachineFormState => ({
  code: '',
  name: '',
  type: '',
  branch: 'Phú Thọ',
  location: '',
  status: 'Đang dùng',
  note: '',
  dinhLuong: '',
  mixingRatios: []
});

export function machineCellToInput(value: string) {
  return value === '-' ? '' : value;
}

export function machineToForm(machine: MachineRow): MachineFormState {
  return {
    code: machineCellToInput(machine.code),
    name: machineCellToInput(machine.name),
    type: machineCellToInput(machine.type === 'Chưa phân loại' ? '' : machine.type),
    branch: machineCellToInput(machine.branch),
    location: machineCellToInput(machine.location),
    status: machineCellToInput(machine.status) || 'Đang dùng',
    note: machineCellToInput(machine.note),
    dinhLuong: machineCellToInput(machine.dinhLuong),
    mixingRatios: machine.mixingRatios.map(item => ({ ...item }))
  };
}

const machineFieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

export function machineStatusColor(status: string): StatusBadgeColor {
  if (/đang|hoạt|active|dung|dùng/i.test(status)) return 'emerald';
  if (/bảo trì|maintenance|sửa/i.test(status)) return 'amber';
  if (/ngừng|hỏng|dừng|stop/i.test(status)) return 'rose';
  return 'zinc';
}

export function MachinesPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('machines');
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [machineError, setMachineError] = useState('');
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingMachine, setViewingMachine] = useState<MachineRow | null>(null);
  const [deletingMachineId, setDeletingMachineId] = useState<string | null>(null);
  const [isSavingMachine, setIsSavingMachine] = useState(false);
  const [uploadingMachineIds, setUploadingMachineIds] = useState<Set<string>>(() => new Set());
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [machineForm, setMachineForm] = useState<MachineFormState>(emptyMachineForm);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState('');
  const [isUploadingFormImage, setIsUploadingFormImage] = useState(false);
  const [materialOptions, setMaterialOptions] = useState<MachineMaterialOption[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(false);

  const resetFormImage = () => {
    setFormImageFile(null);
    setFormImagePreview('');
  };

  const saveMachineImage = async (machineId: string, file: File) => {
    const uploaded = await uploadImage(
      await fileToOptimizedImageDataUrl(file, { maxEdge: 1400, quality: 0.76 }),
      'danh_sach_may'
    );
    const res = await fetch(`/api/danh-sach-may/${encodeURIComponent(machineId)}/image`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploaded)
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Không thể lưu ảnh cho máy.');
    }

    return uploaded;
  };

  const loadMachines = async () => {
    setIsLoadingMachines(true);
    setMachineError('');

    try {
      const res = await fetch('/api/danh-sach-may');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải danh sách máy từ Supabase.');
      }

      setMachines(normalizeMachines(data));
    } catch (error: any) {
      setMachines([]);
      setMachineError(error.message || 'Không thể tải danh sách máy từ Supabase.');
    } finally {
      setIsLoadingMachines(false);
    }
  };

  useEffect(() => {
    loadMachines();
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoadingMaterials(true);
    fetch('/api/kho-nvl')
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active || !ok || !Array.isArray(data?.materials)) return;
        const options = data.materials
          .map((item: unknown): MachineMaterialOption | null => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const code = String(record.ma_npl ?? '').trim();
            const name = String(record.ten_npl ?? '').trim();
            return code || name ? { code, name } : null;
          })
          .filter((item: MachineMaterialOption | null): item is MachineMaterialOption => Boolean(item));
        setMaterialOptions(options);
      })
      .catch(() => {
        if (active) setMaterialOptions([]);
      })
      .finally(() => {
        if (active) setIsLoadingMaterials(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openAddForm = () => {
    if (!canCreate) return;
    setFormError('');
    setActionMessage('');
    setEditingId(null);
    setMachineForm(emptyMachineForm());
    resetFormImage();
    setFormMode('add');
  };

  const openEditForm = (machine: MachineRow) => {
    if (!canEdit) return;
    setFormError('');
    setActionMessage('');
    setEditingId(machine.id);
    setMachineForm(machineToForm(machine));
    setFormImageFile(null);
    setFormImagePreview(machine.imageUrl || '');
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormError('');
    resetFormImage();
  };

  const openMixingView = (machine: MachineRow) => {
    setViewingMachine(machine);
  };

  const closeMixingView = () => {
    setViewingMachine(null);
  };

  const viewingMixingTotal = viewingMachine
    ? viewingMachine.mixingRatios.reduce((sum, item) => {
        const num = Number(String(item.percent || '').replace(',', '.'));
        return sum + (Number.isFinite(num) ? num : 0);
      }, 0)
    : 0;

  const handleFormImageChange = (file?: File | null) => {
    if (!file) return;
    setFormImageFile(file);
    setFormImagePreview(URL.createObjectURL(file));
  };

  const handleSaveMachine = async () => {
    if (!machineForm.code.trim() || !machineForm.name.trim()) {
      setFormError('Vui lòng nhập mã máy và tên máy.');
      return;
    }

    const invalidMixingRatio = machineForm.mixingRatios.find(item => {
      const percent = Number(item.percent.replace(',', '.'));
      return (!item.materialCode && !item.materialName) || !Number.isFinite(percent) || percent < 0 || percent > 100;
    });
    if (invalidMixingRatio) {
      setFormError('Vui lòng chọn NVL và nhập phần trăm từ 0 đến 100 cho từng dòng tỷ lệ trộn.');
      return;
    }

    setIsSavingMachine(true);
    setFormError('');

    try {
      const isEdit = formMode === 'edit' && editingId;
      const res = await fetch(isEdit ? `/api/danh-sach-may/${editingId}` : '/api/danh-sach-may', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(machineForm)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật máy.' : 'Không thể thêm máy mới.'));
      }

      const savedId = isEdit
        ? String(editingId)
        : String((data.machine as { id?: string | number } | undefined)?.id ?? '');

      if (formImageFile && savedId) {
        setIsUploadingFormImage(true);
        try {
          await saveMachineImage(savedId, formImageFile);
        } catch (error: any) {
          closeForm();
          setMachineError(error.message || 'Đã lưu máy nhưng không thể tải ảnh.');
          await loadMachines();
          return;
        } finally {
          setIsUploadingFormImage(false);
        }
      }

      closeForm();
      setActionMessage(
        formImageFile
          ? isEdit
            ? 'Đã cập nhật máy và tải ảnh.'
            : 'Đã thêm máy mới và tải ảnh.'
          : isEdit
            ? 'Đã cập nhật máy.'
            : 'Đã thêm máy mới.'
      );
      await loadMachines();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu máy.');
    } finally {
      setIsSavingMachine(false);
    }
  };

  const handleDeleteMachine = async (machine: MachineRow) => {
    if (!machine.id) {
      setMachineError('Không tìm thấy ID để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa máy "${machine.code || machine.name}"?`)) return;

    setDeletingMachineId(machine.id);
    setActionMessage('');

    try {
      const res = await fetch(`/api/danh-sach-may/${machine.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa máy.');
      }

      setActionMessage('Đã xóa máy.');
      await loadMachines();
    } catch (error: any) {
      setMachineError(error.message || 'Không thể xóa máy.');
    } finally {
      setDeletingMachineId(null);
    }
  };

  const handleMachineImageUpload = async (machine: MachineRow, file?: File | null) => {
    if (!canEdit || !file) return;

    setMachineError('');
    setUploadingMachineIds(prev => {
      const next = new Set(prev);
      next.add(machine.id);
      return next;
    });

    try {
      const uploaded = await saveMachineImage(machine.id, file);

      setMachines(prev =>
        prev.map(item =>
          item.id === machine.id
            ? {
                ...item,
                imageUrl: uploaded.imageUrl,
                imagePublicId: uploaded.imagePublicId
              }
            : item
        )
      );
      setActionMessage(`Đã tải ảnh cho máy ${machine.code || machine.name}.`);
    } catch (error: any) {
      setMachineError(error.message || 'Không thể upload ảnh cho máy.');
    } finally {
      setUploadingMachineIds(prev => {
        const next = new Set(prev);
        next.delete(machine.id);
        return next;
      });
    }
  };

  const machineTypes = useMemo(
    () => Array.from(new Set(machines.map(machine => machine.type))).sort((a, b) => String(a).localeCompare(String(b), 'vi')),
    [machines]
  );
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredMachines = useMemo(() => {
    return machines.filter(machine => {
      const matchesType = selectedType === 'all' || machine.type === selectedType;
      const matchesSearch =
        !normalizedSearch ||
        `${machine.code} ${machine.name} ${machine.type} ${machine.branch} ${machine.location} ${machine.status} ${machine.mixingRatios.map(item => `${item.materialCode} ${item.materialName}`).join(' ')}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [machines, normalizedSearch, selectedType]);

  const hasActiveFilters = selectedType !== 'all' || Boolean(searchText);
  const resetMachineFilters = () => {
    setSelectedType('all');
    setSearchText('');
  };

  const branchCount = new Set(machines.map(machine => machine.branch).filter(branch => branch && branch !== '-')).size;
  const activeCount = machines.filter(machine => /đang|hoạt|active|dung|dùng/i.test(machine.status)).length;
  const mixingPercentTotal = machineForm.mixingRatios.reduce((sum, item) => {
    const value = Number(item.percent.replace(',', '.'));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const addMixingRatio = () => {
    setMachineForm(prev => ({
      ...prev,
      mixingRatios: [...prev.mixingRatios, { materialCode: '', materialName: '', percent: '' }]
    }));
  };

  const updateMixingRatio = (index: number, patch: Partial<MachineMixingRatio>) => {
    setMachineForm(prev => ({
      ...prev,
      mixingRatios: prev.mixingRatios.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  };

  const removeMixingRatio = (index: number) => {
    setMachineForm(prev => ({
      ...prev,
      mixingRatios: prev.mixingRatios.filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  return (
    <div className="w-full space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Thiết bị sản xuất</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Danh sách máy</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase danh_sach_may.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {canCreate ? (
                <button
                  type="button"
                  onClick={openAddForm}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}

            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Máy', machines.length],
              ['Đang dùng', activeCount],
              ['Chi nhánh', branchCount]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="block font-bold text-zinc-400">{label}</span>
                <span className="mt-1 block text-xl font-black text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {formMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                  {formMode === 'edit' ? 'Sửa máy' : 'Thêm máy mới'}
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
            <div className="grid grid-cols-2 gap-3 p-4">
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã máy *</span>
                <input
                  value={machineForm.code}
                  onChange={e => setMachineForm(prev => ({ ...prev, code: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: MAY-01"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên máy *</span>
                <input
                  value={machineForm.name}
                  onChange={e => setMachineForm(prev => ({ ...prev, name: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Máy đùn PE 01"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại/Nhóm</span>
                <input
                  value={machineForm.type}
                  onChange={e => setMachineForm(prev => ({ ...prev, type: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Đùn PE"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Định lượng</span>
                <input
                  value={machineForm.dinhLuong}
                  onChange={e => setMachineForm(prev => ({ ...prev, dinhLuong: sanitizeDecimalTyping(e.target.value) }))}
                  className={machineFieldClass}
                  inputMode="decimal"
                  placeholder="VD: 12,50"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Chi nhánh</span>
                <input
                  value={machineForm.branch}
                  onChange={e => setMachineForm(prev => ({ ...prev, branch: e.target.value }))}
                  className={machineFieldClass}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Vị trí</span>
                <input
                  value={machineForm.location}
                  onChange={e => setMachineForm(prev => ({ ...prev, location: e.target.value }))}
                  className={machineFieldClass}
                  placeholder="VD: Khu A"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
                <SearchableSelect
                  value={machineForm.status}
                  onChange={status => setMachineForm(prev => ({ ...prev, status }))}
                  options={['Đang dùng', 'Bảo trì', 'Ngừng']}
                  placeholder="Gõ để tìm trạng thái"
                  inputClassName={machineFieldClass}
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              </label>
              <div className="col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-zinc-600">Tỷ lệ trộn</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">
                      Chọn NVL và nhập phần trăm. Dữ liệu được lưu dạng JSONB.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addMixingRatio}
                    className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-[#ef1b2d] transition hover:border-[#ef1b2d]"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm NVL
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {machineForm.mixingRatios.map((item, index) => (
                    <div key={`${index}-${item.materialCode}`} className="grid grid-cols-[minmax(0,1fr)_110px_36px] gap-2">
                      <SearchableSelect
                        value={item.materialCode}
                        onChange={materialCode => {
                          const material = materialOptions.find(option => option.code === materialCode);
                          updateMixingRatio(index, {
                            materialCode,
                            materialName: material?.name || item.materialName
                          });
                        }}
                        options={materialOptions}
                        placeholder="Chọn mã NVL"
                        isLoading={isLoadingMaterials}
                        inputClassName={machineFieldClass}
                        getLabel={option => {
                          const material = option as MachineMaterialOption;
                          return material.name ? `${material.code} · ${material.name}` : material.code;
                        }}
                        getValue={option => (option as MachineMaterialOption).code}
                        getSearchText={option => {
                          const material = option as MachineMaterialOption;
                          return `${material.code} ${material.name}`;
                        }}
                      />
                      <div className="relative">
                        <input
                          value={item.percent}
                          onChange={event => updateMixingRatio(index, {
                            percent: sanitizeDecimalTyping(event.target.value)
                          })}
                          className={`${machineFieldClass} pr-8 text-right`}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label={`Phần trăm NVL dòng ${index + 1}`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-400">%</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMixingRatio(index)}
                        title="Xóa NVL"
                        className="flex h-11 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {machineForm.mixingRatios.length === 0 && (
                    <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-4 text-center text-xs font-semibold text-zinc-400">
                      Chưa thiết lập tỷ lệ trộn.
                    </p>
                  )}
                </div>

                <div className="mt-2 flex justify-end text-xs font-black">
                  <span className={Math.abs(mixingPercentTotal - 100) < 0.001 ? 'text-emerald-600' : 'text-amber-600'}>
                    Tổng: {formatNumber(mixingPercentTotal, 2)}%
                  </span>
                </div>
              </div>
              <label className="col-span-2 space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
                <input
                  value={machineForm.note}
                  onChange={e => setMachineForm(prev => ({ ...prev, note: e.target.value }))}
                  className={machineFieldClass}
                />
              </label>

              <div className="col-span-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Hình ảnh máy</p>
                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                  Chụp ảnh bằng camera để upload lên Cloudinary và lưu vào cột anh_url trên Supabase.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {formImagePreview ? (
                    <a
                      href={formImagePreview}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-24 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white"
                    >
                      <img
                        src={cloudinaryPreviewUrl(formImagePreview, 480)}
                        alt="Xem trước ảnh máy"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-24 w-36 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Chưa chụp ảnh
                    </div>
                  )}

                  <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]">
                    <ImagePlus className="h-4 w-4" />
                    {formImageFile ? 'Chụp lại' : formImagePreview ? 'Chụp lại' : 'Chụp ảnh'}
                    <input
                      {...CAMERA_IMAGE_INPUT_PROPS}
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        handleFormImageChange(file);
                      }}
                    />
                  </label>

                  {formImageFile && (
                    <p className="text-xs font-semibold text-zinc-600">{formImageFile.name}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {formError && (
                <p className="mr-auto text-xs font-bold text-rose-600">{formError}</p>
              )}
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveMachine}
                disabled={isSavingMachine || isUploadingFormImage}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMachine || isUploadingFormImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingMachine || isUploadingFormImage
                  ? isUploadingFormImage
                    ? 'Đang tải ảnh...'
                    : 'Đang lưu...'
                  : formMode === 'edit'
                    ? 'Cập nhật'
                    : 'Lưu máy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <TableToolbar
        isLoading={isLoadingMachines}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetMachineFilters}
        loadError={machineError}
        actionMessage={actionMessage}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm mã máy, tên máy, vị trí..."
          disabled={isLoadingMachines}
        />

        <FilterCombobox
          label="Loại/Nhóm"
          options={machineTypes}
          value={selectedType}
          onChange={setSelectedType}
          searchPlaceholder="Tìm loại/nhóm..."
          compact
        />
      </TableToolbar>

      <TableShell minWidthClassName="min-w-[1320px]">
        <TableHead>
          <TableHeadCell>Mã máy</TableHeadCell>
          <TableHeadCell>Tên máy</TableHeadCell>
          <TableHeadCell>Hình ảnh</TableHeadCell>
          <TableHeadCell>Loại/Nhóm</TableHeadCell>
          <TableHeadCell className="text-right">Định lượng</TableHeadCell>
          <TableHeadCell>Tỷ lệ trộn</TableHeadCell>
          <TableHeadCell>Chi nhánh</TableHeadCell>
          <TableHeadCell>Vị trí</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell>Ghi chú</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredMachines.map(machine => (
            <React.Fragment key={machine.id}>
            <TableRow>
                  <td className="px-4 py-3 font-black text-zinc-950">{machine.code || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-black text-zinc-950">
                      <Cpu className="h-4 w-4 text-[#ef1b2d]" />
                      {machine.name || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[220px] flex-col gap-2">
                      <div className="flex items-center gap-3">
                        {machine.imageUrl ? (
                          <a
                            href={machine.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50"
                          >
                            <img
                              src={cloudinaryPreviewUrl(machine.imageUrl, 240)}
                              alt={`Ảnh ${machine.name || machine.code}`}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            Chưa có
                          </div>
                        )}

                        {canEdit ? (
                          <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-black text-zinc-700 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]">
                            {uploadingMachineIds.has(machine.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="h-4 w-4" />
                            )}
                            {uploadingMachineIds.has(machine.id) ? 'Đang chụp...' : machine.imageUrl ? 'Chụp lại' : 'Chụp ảnh'}
                            <input
                              {...CAMERA_IMAGE_INPUT_PROPS}
                              className="hidden"
                              disabled={uploadingMachineIds.has(machine.id)}
                              onChange={event => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                handleMachineImageUpload(machine, file);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                      <p className="text-[10px] font-semibold text-zinc-400">JPG, PNG · lưu Cloudinary</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-zinc-700">{machine.type}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-zinc-700">{formatMachineDinhLuong(machine.dinhLuong)}</td>
                  <td className="px-4 py-3">
                    {machine.mixingRatios.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => openMixingView(machine)}
                        className="inline-flex min-w-[160px] flex-col items-start gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:border-amber-400 hover:bg-amber-100"
                        title="Xem định mức tỉ lệ trộn"
                      >
                        <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                          {machine.mixingRatios.length} NVL · Xem
                        </span>
                        <span className="line-clamp-2 text-[11px] font-bold text-amber-900">
                          {machine.mixingRatios
                            .slice(0, 3)
                            .map(item => `${item.materialCode || item.materialName} ${formatMachineDinhLuong(item.percent)}%`)
                            .join(' · ')}
                          {machine.mixingRatios.length > 3 ? '…' : ''}
                        </span>
                      </button>
                    ) : (
                      <span className="text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{machine.branch}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{machine.location}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={machine.status} color={machineStatusColor(machine.status)} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-500">{machine.note || '-'}</td>
                  <td className="px-4 py-3">
                    <RowActionsMenu label={`Thao tác ${machine.code || machine.name}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => openMixingView(machine)}
                        title="Xem định mức tỉ lệ trộn"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-amber-700 transition hover:bg-amber-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEditForm(machine)}
                          title="Sửa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteMachine(machine)}
                          disabled={deletingMachineId === machine.id}
                          title="Xóa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingMachineId === machine.id ? (
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

          {!isLoadingMachines && filteredMachines.length === 0 && (
            <TableEmptyRow colSpan={11}>
              Bảng danh_sach_may chưa có dữ liệu hoặc không có máy phù hợp bộ lọc.
            </TableEmptyRow>
          )}
        </TableBody>
      </TableShell>

      {viewingMachine ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Định mức tỉ lệ trộn"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeMixingView();
          }}
        >
          <div className="max-h-[94vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-amber-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-amber-100 bg-gradient-to-r from-amber-700 to-amber-500 px-4 py-3 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
                  Định mức tỉ lệ trộn
                </p>
                <h3 className="mt-1 text-base font-black">
                  {viewingMachine.code || '—'} · {viewingMachine.name || '—'}
                </h3>
                <p className="mt-1 text-xs font-semibold text-amber-50">
                  Định lượng máy:{' '}
                  <span className="font-black">{formatMachineDinhLuong(viewingMachine.dinhLuong)}</span>
                  {viewingMachine.type && viewingMachine.type !== 'Chưa phân loại'
                    ? ` · ${viewingMachine.type}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeMixingView}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {viewingMachine.mixingRatios.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm font-bold text-zinc-400">
                  Máy này chưa thiết lập định mức tỉ lệ trộn.
                </p>
              ) : (
                <TableShell minWidthClassName="min-w-full" maxHeightClassName="max-h-[50vh]">
                  <TableHead>
                    <TableHeadCell>STT</TableHeadCell>
                    <TableHeadCell>Mã NVL</TableHeadCell>
                    <TableHeadCell>Tên NVL</TableHeadCell>
                    <TableHeadCell className="text-right">Tỉ lệ (%)</TableHeadCell>
                  </TableHead>
                  <TableBody>
                    {viewingMachine.mixingRatios.map((item, index) => (
                      <React.Fragment key={`${item.materialCode}-${index}`}>
                      <TableRow>
                          <td className="px-3 py-2.5 font-mono font-bold text-zinc-500">{index + 1}</td>
                          <td className="px-3 py-2.5 font-mono font-black text-zinc-900">
                            {item.materialCode || '—'}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-zinc-700">
                            {item.materialName || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-amber-800">
                            {formatMachineDinhLuong(item.percent)}%
                          </td>
                      </TableRow>
                      </React.Fragment>
                    ))}
                  </TableBody>
                  <tfoot className="border-t-2 border-zinc-200 bg-amber-50 text-sm font-black">
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-right uppercase tracking-wider text-zinc-600">
                          Tổng tỉ lệ
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono ${
                            Math.abs(viewingMixingTotal - 100) < 0.001
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {formatNumber(viewingMixingTotal, 2)}%
                        </td>
                      </tr>
                  </tfoot>
                </TableShell>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    const machine = viewingMachine;
                    closeMixingView();
                    openEditForm(machine);
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-[#ef1b2d] transition hover:border-[#ef1b2d]"
                >
                  <Pencil className="h-4 w-4" />
                  Sửa định mức
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeMixingView}
                className="h-10 rounded-xl bg-zinc-900 px-4 text-xs font-black text-white transition hover:bg-zinc-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

