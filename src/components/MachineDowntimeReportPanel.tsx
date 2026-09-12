import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  Loader2,
  Printer,
  Save,
  Trash2
} from 'lucide-react';
import MachineDowntimeIcon from './icons/MachineDowntimeIcon';
import {
  MachineDowntimePrintBatch,
  buildMachineDowntimePrintSlip,
  type MachineDowntimePrintSlip
} from './MachineDowntimePrintSheet';
import { formatNumber } from '../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';
import { waitForPrintImagesReady } from '../utils/printReady';
import { shiftNamesMatch } from '../utils/shiftSettings';

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

type MachineOption = { id: string; code: string; name: string };
type StaffOption = { id: string; name: string; shift: string };
type SettingOption = { name: string; code: string; loaiCaiDat: string };
type ProductionOrderOption = {
  code: string;
  name: string;
  machine: string;
  shift: string;
  startDate: string;
};

type DowntimeLine = {
  key: string;
  startTime: string;
  restartTime: string;
  reason: string;
  rollsAffected: string;
  confirmedBy: string;
  note: string;
};

type SavedDowntimeLine = {
  stt: number;
  startTime: string;
  restartTime: string;
  downtimeMinutes: number;
  reason: string;
  rollsAffected: number;
  confirmedBy: string;
  note: string;
};

export type MachineDowntimeSlip = {
  id: string;
  slipCode: string;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  preparedBy: string;
  productionOrder: string;
  totalDowntimeMinutes: number;
  totalRollsAffected: number;
  note: string;
  lines: SavedDowntimeLine[];
  createdAt: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function calcDowntimeMinutes(start: string, end: string) {
  if (!start || !end) return null;
  const startMatch = start.match(/^(\d{1,2}):(\d{2})/);
  const endMatch = end.match(/^(\d{1,2}):(\d{2})/);
  if (!startMatch || !endMatch) return null;
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const diff = endMinutes - startMinutes;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function shiftMatches(orderShift: string, selectedShift: string) {
  return shiftNamesMatch(orderShift, selectedShift);
}

function parseOrderDate(value: string) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function emptyLine(): DowntimeLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: '',
    restartTime: '',
    reason: '',
    rollsAffected: '',
    confirmedBy: '',
    note: ''
  };
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data) ? data : Array.isArray((data as { machines?: unknown }).machines) ? (data as { machines: unknown[] }).machines : [];
  return rows
    .map((item): MachineOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.ma_may ?? '').trim();
      const name = String(row.name ?? row.ten_may ?? '').trim();
      if (!code && !name) return null;
      return { id: String(row.id ?? code), code, name };
    })
    .filter((item): item is MachineOption => Boolean(item));
}

function normalizeSettings(data: unknown): SettingOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { settings?: unknown }).settings)
      ? (data as { settings: unknown[] }).settings
      : [];
  return rows
    .map((item): SettingOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = String(row.ten_cai_dat ?? row.hang_muc ?? row.name ?? '').trim();
      const code = String(row.ma_cai_dat ?? row.ma ?? row.code ?? '').trim();
      const loaiCaiDat = String(row.loai_cai_dat ?? row.loai ?? '').trim();
      if (!name && !code) return null;
      return { name: name || code, code: code || name, loaiCaiDat };
    })
    .filter((item): item is SettingOption => Boolean(item));
}

function normalizeProductionStaff(data: unknown): StaffOption[] {
  const branches = Array.isArray(data)
    ? data
    : Array.isArray((data as { branches?: unknown }).branches)
      ? (data as { branches: unknown[] }).branches
      : [];
  const members: StaffOption[] = [];
  const seen = new Set<string>();

  branches.forEach(branch => {
    if (!branch || typeof branch !== 'object') return;
    const departments = Array.isArray((branch as { departments?: unknown }).departments)
      ? (branch as { departments: unknown[] }).departments
      : [];
    departments.forEach(department => {
      if (!department || typeof department !== 'object') return;
      const deptName = String((department as { name?: string }).name ?? '').toLowerCase();
      if (!deptName.includes('sản xuất') && !deptName.includes('san xuat')) return;
      const deptMembers = Array.isArray((department as { members?: unknown }).members)
        ? (department as { members: unknown[] }).members
        : [];
      deptMembers.forEach(member => {
        if (!member || typeof member !== 'object') return;
        const name = String((member as { name?: string }).name ?? '').trim();
        if (!name || seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase());
        members.push({
          id: String((member as { id?: string }).id ?? name),
          name,
          shift: String((member as { shift?: string }).shift ?? '').trim()
        });
      });
    });
  });

  return members.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function normalizeProductionOrders(data: unknown): ProductionOrderOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { productionOrders?: unknown }).productionOrders)
      ? (data as { productionOrders: unknown[] }).productionOrders
      : [];
  return rows
    .map((item): ProductionOrderOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.ma_lenh_sx ?? '').trim();
      const name = String(row.name ?? row.ten_lenh_sx ?? '').trim();
      if (!code && !name) return null;
      return {
        code: code || name,
        name: name || code,
        machine: String(row.machine ?? row.may ?? row.ma_may ?? row.ten_may ?? '').trim(),
        shift: String(row.shift ?? row.ca ?? '').trim(),
        startDate: parseOrderDate(
          String(row.startDate ?? row.ngay_gio_bat_dau ?? row.ngay_bat_dau ?? row.ngay_san_xuat ?? '')
        )
      };
    })
    .filter((item): item is ProductionOrderOption => Boolean(item));
}

export function normalizeMachineDowntimeSlips(data: unknown): MachineDowntimeSlip[] {
  const slips = (data as { slips?: unknown })?.slips;
  if (!Array.isArray(slips)) return [];

  return slips
    .map((item): MachineDowntimeSlip | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawLines = Array.isArray(record.chi_tiet) ? record.chi_tiet : [];
      const lines = rawLines
        .map((line, index): SavedDowntimeLine | null => {
          if (!line || typeof line !== 'object') return null;
          const detail = line as Record<string, unknown>;
          return {
            stt: Number(detail.stt ?? index + 1) || index + 1,
            startTime: String(detail.thoi_gian_bat_dau ?? '').trim(),
            restartTime: String(detail.thoi_gian_chay_lai ?? '').trim(),
            downtimeMinutes: Number(detail.tong_thoi_gian_dung_phut ?? 0) || 0,
            reason: String(detail.ly_do_dung_may ?? '').trim(),
            rollsAffected: Number(detail.so_cuon_anh_huong ?? 0) || 0,
            confirmedBy: String(detail.nguoi_xac_nhan ?? '').trim(),
            note: String(detail.ghi_chu ?? '').trim()
          };
        })
        .filter((line): line is SavedDowntimeLine => Boolean(line));

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.so_phieu ?? '').trim(),
        date: String(record.ngay ?? '').slice(0, 10),
        shift: String(record.ca ?? '').trim(),
        machineCode: String(record.ma_may ?? '').trim(),
        machineName: String(record.ten_may ?? '').trim(),
        preparedBy: String(record.nguoi_lap ?? '').trim(),
        productionOrder: String(record.lenh_sx_lien_quan ?? '').trim(),
        totalDowntimeMinutes: Number(record.tong_thoi_gian_dung_phut ?? 0) || 0,
        totalRollsAffected: Number(record.tong_cuon_anh_huong ?? 0) || 0,
        note: String(record.ghi_chu_chung ?? '').trim(),
        lines,
        createdAt: String(record.created_at ?? '').trim()
      };
    })
    .filter((slip): slip is MachineDowntimeSlip => Boolean(slip));
}

function slipToPrintSlip(slip: MachineDowntimeSlip): MachineDowntimePrintSlip {
  return buildMachineDowntimePrintSlip({
    slipCode: slip.slipCode,
    date: slip.date,
    shift: slip.shift,
    machineCode: slip.machineCode,
    machineName: slip.machineName,
    preparedBy: slip.preparedBy,
    productionOrder: slip.productionOrder,
    note: slip.note,
    lines: slip.lines.map(line => ({
      startTime: line.startTime,
      restartTime: line.restartTime,
      reason: line.reason,
      rollsAffected: line.rollsAffected,
      confirmedBy: line.confirmedBy,
      note: line.note
    }))
  });
}

export default function MachineDowntimeReportPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [settings, setSettings] = useState<SettingOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderOption[]>([]);
  const [slips, setSlips] = useState<MachineDowntimeSlip[]>([]);
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [productionOrder, setProductionOrder] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DowntimeLine[]>([emptyLine()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<MachineDowntimePrintSlip | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  const selectedMachine = useMemo(() => {
    const ref = machineRef.trim();
    if (!ref) return null;
    return machines.find(m => m.code === ref) ?? null;
  }, [machineRef, machines]);

  const shiftOptions = useMemo(() => {
    const fromSettings = settings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Thời gian' ||
          setting.loaiCaiDat === 'Sản xuất' ||
          /ca/i.test(setting.name) ||
          /ca/i.test(setting.code)
      )
      .map(setting => setting.name || setting.code)
      .filter((name, index, arr) => name && arr.indexOf(name) === index);
    return fromSettings;
  }, [settings]);

  const filteredStaffOptions = useMemo(() => {
    if (!shift) return staffOptions;
    const filtered = staffOptions.filter(member => shiftMatches(member.shift, shift));
    return filtered.length > 0 ? filtered : staffOptions;
  }, [staffOptions, shift]);

  const productionOrderOptions = useMemo(() => {
    return productionOrders
      .filter(order => {
        if (date && order.startDate && order.startDate !== date) return false;
        if (shift && order.shift && !shiftMatches(order.shift, shift)) return false;
        return true;
      })
      .map(order => ({
        value: order.code,
        label: order.name !== order.code ? `${order.code} · ${order.name}` : order.code
      }));
  }, [productionOrders, date, shift]);

  const lineStats = useMemo(() => {
    return lines.map(line => {
      const minutes = calcDowntimeMinutes(line.startTime, line.restartTime);
      const rolls = Number(line.rollsAffected.replace(',', '.'));
      return {
        minutes: minutes ?? 0,
        rolls: Number.isFinite(rolls) ? rolls : 0
      };
    });
  }, [lines]);

  const totalDowntimeMinutes = lineStats.reduce((sum, item) => sum + item.minutes, 0);
  const totalRollsAffected = lineStats.reduce((sum, item) => sum + item.rolls, 0);

  const loadSlips = async () => {
    const res = await fetch('/api/phieu-bao-dung-may?limit=50');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSlips(normalizeMachineDowntimeSlips(data));
  };

  useEffect(() => {
    if (!printSlip) return;
    document.body.classList.add('production-order-print-active');
    return () => document.body.classList.remove('production-order-print-active');
  }, [printSlip]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [machineRes, settingRes, staffRes, orderRes, slipRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/lenh-sx'),
          fetch('/api/phieu-bao-dung-may?limit=50')
        ]);
        const [machineData, settingData, staffData, orderData, slipData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          settingRes.json().catch(() => ({})),
          staffRes.json().catch(() => ({})),
          orderRes.json().catch(() => ({})),
          slipRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(normalizeSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (orderRes.ok) setProductionOrders(normalizeProductionOrders(orderData));
        if (slipRes.ok) setSlips(normalizeMachineDowntimeSlips(slipData));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (productionOrder && !productionOrderOptions.some(option => option.value === productionOrder)) {
      setProductionOrder('');
    }
  }, [productionOrder, productionOrderOptions]);

  useEffect(() => {
    if (!pendingPrint || !printSlip) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printSlip]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintSlip(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const updateLine = (key: string, patch: Partial<DowntimeLine>) => {
    setLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const buildCurrentPrintSlip = (slipCode = '') =>
    buildMachineDowntimePrintSlip({
      slipCode,
      date,
      shift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      preparedBy,
      productionOrder,
      note,
      lines
    });

  const handlePrint = (slip: MachineDowntimePrintSlip) => {
    setError('');
    if (slip.lines.length === 0) {
      setError('Chưa có dòng dừng máy để in.');
      return;
    }
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const saveSlip = async () => {
    setError('');
    setMessage('');

    const payloadLines = lines
      .map((line, index) => ({
        stt: index + 1,
        thoi_gian_bat_dau: line.startTime.trim(),
        thoi_gian_chay_lai: line.restartTime.trim(),
        tong_thoi_gian_dung_phut: calcDowntimeMinutes(line.startTime, line.restartTime) ?? 0,
        ly_do_dung_may: line.reason.trim(),
        so_cuon_anh_huong: Number(line.rollsAffected.replace(',', '.')) || 0,
        nguoi_xac_nhan: line.confirmedBy.trim(),
        ghi_chu: line.note.trim()
      }))
      .filter(line => line.thoi_gian_bat_dau || line.thoi_gian_chay_lai || line.ly_do_dung_may);

    if (!date || !shift || !machineRef.trim() || payloadLines.length === 0) {
      setError(showSaveFailure('Vui lòng chọn ngày, ca, máy và nhập ít nhất một dòng dừng máy.'));
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/phieu-bao-dung-may', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca: shift,
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          nguoi_lap: preparedBy.trim(),
          lenh_sx_lien_quan: productionOrder.trim(),
          ghi_chu_chung: note.trim(),
          chi_tiet: payloadLines
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu báo dừng máy.'));

      const slipCode = String(data.slip?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu phiếu ${slipCode}.` : 'Đã lưu phiếu báo dừng máy.';
      setMessage(okMsg);
      showAppToast(okMsg);
      setLines([emptyLine()]);
      setNote('');
      await loadSlips();
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể lưu phiếu.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSlip = async (id: string) => {
    if (!id || !window.confirm('Xóa phiếu báo dừng máy này?')) return;
    const res = await fetch(`/api/phieu-bao-dung-may/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Không thể xóa phiếu.');
      return;
    }
    setSlips(prev => prev.filter(slip => slip.id !== id));
    setMessage('Đã xóa phiếu.');
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {printSlip && typeof document !== 'undefined'
        ? createPortal(<MachineDowntimePrintBatch slips={[printSlip]} />, document.body)
        : null}

      <div className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Quay lại
            </button>
            <div>
              <h1 className="text-xl font-black text-zinc-900">Phiếu báo dừng máy</h1>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Tổng dừng</p>
            <p className="text-lg font-black text-amber-900">{formatNumber(totalDowntimeMinutes, 0)} phút</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-zinc-100 pb-3">
              <MachineDowntimeIcon className="h-5 w-5" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-950">PHIẾU BÁO DỪNG MÁY</h2>
              </div>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}
            {message && (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {message}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Ngày *
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${fieldClass} mt-1`} />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Ca *
                <select value={shift} onChange={e => setShift(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn ca</option>
                  {shiftOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Máy *
                <select value={machineRef} onChange={e => setMachineRef(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn máy</option>
                  {machines.map(machine => (
                    <option key={machine.id} value={machine.code}>
                      {machine.code ? `${machine.code} · ${machine.name}` : machine.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Người lập
                <select value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn nhân sự sản xuất</option>
                  {filteredStaffOptions.map(staff => (
                    <option key={staff.id} value={staff.name}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500 md:col-span-2">
                Lệnh SX liên quan
                <select
                  value={productionOrder}
                  onChange={e => setProductionOrder(e.target.value)}
                  className={`${fieldClass} mt-1`}
                  disabled={isLoading || !date || !shift}
                >
                  <option value="">{date && shift ? 'Chọn lệnh SX theo ngày và ca' : 'Chọn ngày và ca trước'}</option>
                  {productionOrderOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <RepeatableLinesBlock
                title="Chi tiết dừng máy"
                required
                onAdd={() => setLines(prev => [...prev, emptyLine()])}
                columns={[
                  { key: 'stt', label: 'STT', className: 'w-10 shrink-0 text-center' },
                  { key: 'start', label: 'Bắt đầu dừng', className: 'w-28 shrink-0', required: true },
                  { key: 'restart', label: 'Chạy lại', className: 'w-28 shrink-0', required: true },
                  { key: 'minutes', label: 'Tổng (phút)', className: 'w-24 shrink-0' },
                  { key: 'reason', label: 'Lý do dừng', className: 'min-w-0 flex-[1.2]', required: true },
                  { key: 'rolls', label: 'Số cuộn', className: 'w-20 shrink-0' },
                  { key: 'confirm', label: 'Xác nhận', className: 'min-w-0 flex-[0.9]' },
                  { key: 'note', label: 'Ghi chú', className: 'min-w-0 flex-[0.9]' },
                  { key: 'actions', label: '', className: 'w-9 shrink-0' }
                ]}
              >
                {lines.map((line, index) => (
                  <RepeatableLineRow key={line.key}>
                    <div className="flex w-10 shrink-0 items-center justify-center text-sm font-black text-[#ef1b2d]">
                      {index + 1}
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="time" value={line.startTime} onChange={e => updateLine(line.key, { startTime: e.target.value })} className={fieldClass} />
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="time" value={line.restartTime} onChange={e => updateLine(line.key, { restartTime: e.target.value })} className={fieldClass} />
                    </div>
                    <div className="w-24 shrink-0">
                      <input value={lineStats[index]?.minutes ? String(lineStats[index].minutes) : ''} readOnly className={`${fieldClass} bg-zinc-50 font-mono font-bold`} placeholder="0" />
                    </div>
                    <div className="min-w-0 flex-[1.2]">
                      <input value={line.reason} onChange={e => updateLine(line.key, { reason: e.target.value })} className={fieldClass} placeholder="Lý do dừng máy" />
                    </div>
                    <div className="w-20 shrink-0">
                      <input type="number" min="0" step="any" value={line.rollsAffected} onChange={e => updateLine(line.key, { rollsAffected: e.target.value })} className={fieldClass} placeholder="0" />
                    </div>
                    <div className="min-w-0 flex-[0.9]">
                      <input value={line.confirmedBy} onChange={e => updateLine(line.key, { confirmedBy: e.target.value })} className={fieldClass} placeholder="Người xác nhận" />
                    </div>
                    <div className="min-w-0 flex-[0.9]">
                      <input value={line.note} onChange={e => updateLine(line.key, { note: e.target.value })} className={fieldClass} placeholder="Ghi chú" />
                    </div>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines(prev => prev.filter(item => item.key !== line.key))} className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" title="Xóa dòng">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </RepeatableLineRow>
                ))}
              </RepeatableLinesBlock>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="mb-2 text-xs font-semibold leading-5 text-zinc-600">
                Ghi chú: Ghi nhận ngay khi phát sinh. Hệ thống tự trừ định mức thời gian và số cuộn sản phẩm để đo lường hiệu suất máy.
              </p>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Ghi chú chung
                <input value={note} onChange={e => setNote(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Ghi chú thêm (tuỳ chọn)" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-bold text-zinc-600">
                Tổng dừng: <span className="font-black text-zinc-900">{formatNumber(totalDowntimeMinutes, 0)} phút</span>
                {' · '}
                Tổng cuộn ảnh hưởng: <span className="font-black text-zinc-900">{formatNumber(totalRollsAffected, 0)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrint(buildCurrentPrintSlip())}
                  disabled={isLoading || lines.every(line => !line.startTime && !line.reason)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-zinc-400 disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  In phiếu
                </button>
                <button
                  type="button"
                  onClick={saveSlip}
                  disabled={isSaving || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu phiếu
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-zinc-900">Lịch sử phiếu</h2>
              </div>
              <MachineDowntimeIcon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              {isLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải...
                </div>
              )}
              {!isLoading && slips.length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs font-semibold text-zinc-400">
                  Chưa có phiếu nào.
                </p>
              )}
              {slips.map(slip => (
                <div key={slip.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-zinc-900">{slip.slipCode || slip.machineName || slip.machineCode}</p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {slip.date} · {slip.shift} · {slip.machineName || slip.machineCode || '-'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-amber-800">
                        {formatNumber(slip.totalDowntimeMinutes, 0)} phút · {slip.lines.length} lần dừng · {formatNumber(slip.totalRollsAffected, 0)} cuộn
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePrint(slipToPrintSlip(slip))}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"
                        title="In phiếu"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSlip(slip.id)}
                        className="rounded-lg border border-zinc-200 p-2 text-[#ef1b2d] hover:bg-red-50"
                        title="Xóa phiếu"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
