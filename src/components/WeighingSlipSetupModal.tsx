import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Factory, FileText, Loader2, Users } from 'lucide-react';
import { getProductionShiftOptions, normalizeShiftSettings, type ShiftSetting } from '../utils/shiftSettings';
const inputClass =
  'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none transition focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

interface StaffOption {
  name: string;
}

interface MachineOption {
  id: string;
  code: string;
  name: string;
}

export interface SlipSetupPayload {
  productionDate: string;
  shiftName: string;
  worker1: string;
  worker2: string;
  machineName: string;
  documentNo: string;
  reportDate: string;
}

interface WeighingSlipSetupModalProps {
  open: boolean;
  initialProductionDate: string;
  initialShiftName?: string;
  onClose: () => void;
  onCreate: (payload: SlipSetupPayload) => Promise<void>;
}

function normalizeStaff(data: unknown): StaffOption[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(item => {
      if (typeof item === 'string') return { name: item.trim() };
      if (item && typeof item === 'object' && 'name' in item) {
        return { name: String((item as StaffOption).name ?? '').trim() };
      }
      return null;
    })
    .filter((item): item is StaffOption => Boolean(item?.name));
}

function normalizeMachines(data: unknown): MachineOption[] {
  if (!data || typeof data !== 'object') return [];
  const machines = (data as { machines?: unknown }).machines;
  if (!Array.isArray(machines)) return [];

  return machines
    .map((item): MachineOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = String(record.ten_may ?? record.name ?? '').trim();
      const code = String(record.ma_may ?? record.code ?? '').trim();
      if (!name) return null;
      return { id: String(record.id ?? code ?? name), code, name };
    })
    .filter((item): item is MachineOption => Boolean(item));
}

export default function WeighingSlipSetupModal({
  open,
  initialProductionDate,
  initialShiftName = '',
  onClose,
  onCreate
}: WeighingSlipSetupModalProps) {
  const [productionDate, setProductionDate] = useState(initialProductionDate);
  const [shiftName, setShiftName] = useState(initialShiftName);
  const [worker1, setWorker1] = useState('');
  const [worker2, setWorker2] = useState('');
  const [machineName, setMachineName] = useState('');
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  useEffect(() => {
    if (!open) return;
    setProductionDate(initialProductionDate);
    setShiftName(initialShiftName);
    setWorker1('');
    setWorker2('');
    setMachineName('');
    setError('');
  }, [open, initialProductionDate, initialShiftName]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const res = await fetch('/api/nhan-su');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải nhân sự.');
        if (!cancelled) setStaff(normalizeStaff(data));
      } catch {
        if (!cancelled) setStaff([]);
      } finally {
        if (!cancelled) setIsLoadingStaff(false);
      }
    };

    const loadMachines = async () => {
      setIsLoadingMachines(true);
      try {
        const res = await fetch('/api/danh-sach-may');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách máy.');
        if (!cancelled) setMachines(normalizeMachines(data));
      } catch {
        if (!cancelled) setMachines([]);
      } finally {
        if (!cancelled) setIsLoadingMachines(false);
      }
    };

    loadStaff();
    loadMachines();

    const loadShiftSettings = async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setShiftSettings(normalizeShiftSettings(data));
        }
      } catch {
        if (!cancelled) setShiftSettings([]);
      }
    };

    loadShiftSettings();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSubmit = async () => {
    if (!productionDate || !shiftName.trim()) {
      setError('Vui lòng chọn ngày sản xuất và ca.');
      return;
    }
    if (!machineName.trim()) {
      setError('Vui lòng chọn tên máy.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onCreate({
        productionDate,
        shiftName: shiftName.trim(),
        worker1: worker1.trim(),
        worker2: worker2.trim(),
        machineName: machineName.trim(),
        documentNo: '',
        reportDate: productionDate
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Không thể tạo phiếu.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Thêm phiếu mới</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Chỉ nhập tiêu đề phiếu — vào trong phiếu để thêm lần cân
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Đóng
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4">
          {error && (
            <p className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {error}
            </p>
          )}

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
              <CalendarDays className="h-4 w-4 text-[#ef1b2d]" />
              Ngày sản xuất
            </span>
            <input
              type="date"
              value={productionDate}
              onChange={e => setProductionDate(e.target.value)}
              className={inputClass}
            />
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
              <FileText className="h-4 w-4 text-[#ef1b2d]" />
              Ca sản xuất
            </span>
            <select value={shiftName} onChange={e => setShiftName(e.target.value)} className={inputClass}>
              <option value="">Chọn ca</option>
              {shiftOptions.map(shift => (
                <option key={shift.value} value={shift.value}>
                  {shift.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
              <Users className="h-4 w-4 text-[#ef1b2d]" />
              Sản xuất 1
            </span>
            <div className="relative">
              <select
                value={worker1}
                onChange={e => setWorker1(e.target.value)}
                disabled={isLoadingStaff}
                className={`${inputClass} appearance-none pr-9`}
              >
                <option value="">{isLoadingStaff ? 'Đang tải...' : 'Chọn CN 1'}</option>
                {staff.map(person => (
                  <option key={person.name} value={person.name}>
                    {person.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
              <Users className="h-4 w-4 text-[#ef1b2d]" />
              Sản xuất 2
            </span>
            <div className="relative">
              <select
                value={worker2}
                onChange={e => setWorker2(e.target.value)}
                disabled={isLoadingStaff}
                className={`${inputClass} appearance-none pr-9`}
              >
                <option value="">{isLoadingStaff ? 'Đang tải...' : 'Chọn CN 2'}</option>
                {staff.map(person => (
                  <option key={person.name} value={person.name}>
                    {person.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </label>

          <label className="col-span-2 space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-500">
              <Factory className="h-4 w-4 text-[#ef1b2d]" />
              Tên máy
            </span>
            <div className="relative">
              <select
                value={machineName}
                onChange={e => setMachineName(e.target.value)}
                disabled={isLoadingMachines || machines.length === 0}
                className={`${inputClass} appearance-none pr-9`}
              >
                <option value="">
                  {isLoadingMachines
                    ? 'Đang tải máy...'
                    : machines.length === 0
                      ? 'Chưa có máy'
                      : 'Chọn tên máy'}
                </option>
                {machines.map(machine => (
                  <option key={machine.id} value={machine.name}>
                    {machine.code ? `${machine.code} · ${machine.name}` : machine.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tạo phiếu
          </button>
        </div>
      </div>
    </div>
  );
}
