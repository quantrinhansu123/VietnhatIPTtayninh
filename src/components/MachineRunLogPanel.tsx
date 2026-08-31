import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  ChevronLeft,
  Loader2,
  Printer,
  Save,
  Trash2
} from 'lucide-react';
import {
  MachineRunLogPrintBatch,
  buildMachineRunLogPrintSlip,
  type MachineRunLogPrintSlip
} from './MachineRunLogPrintSheet';
import { formatNumber } from '../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';
import { waitForPrintImagesReady } from '../utils/printReady';

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

type MachineOption = { id: string; code: string; name: string };
type StaffOption = { id: string; name: string; shift: string };
type SettingOption = { name: string; code: string; loaiCaiDat: string };
type ProductOption = { code: string; name: string };
type ProductionOrderOption = {
  code: string;
  name: string;
  machine: string;
  shift: string;
  startDate: string;
};

type RunLogLine = {
  key: string;
  logTime: string;
  temperature: string;
  actualSpeed: string;
  standardSpeed: string;
  rollsProduced: string;
  downtimeMinutes: string;
  reason: string;
  recordedBy: string;
};

type SavedRunLogLine = {
  stt: number;
  logTime: string;
  temperature: number | null;
  actualSpeed: number | null;
  standardSpeed: number | null;
  rollsProduced: number;
  downtimeMinutes: number;
  reason: string;
  recordedBy: string;
};

export type MachineRunLog = {
  id: string;
  slipCode: string;
  date: string;
  shift: string;
  machineCode: string;
  machineName: string;
  productionOrder: string;
  productCode: string;
  mainOperator: string;
  assistantOperator: string;
  plannedRunHours: number;
  totalRollsProduced: number;
  totalDowntimeMinutes: number;
  actualRunMinutes: number;
  timeEfficiencyPct: number | null;
  note: string;
  lines: SavedRunLogLine[];
  createdAt: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseLineNumber(value: string): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function shiftMatches(orderShift: string, selectedShift: string) {
  if (!orderShift || !selectedShift) return false;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
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

function emptyLine(): RunLogLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    logTime: '',
    temperature: '',
    actualSpeed: '',
    standardSpeed: '',
    rollsProduced: '',
    downtimeMinutes: '',
    reason: '',
    recordedBy: ''
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

function normalizeProducts(data: unknown): ProductOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  return rows
    .map((item): ProductOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.ma_san_pham ?? row.ma_sp ?? '').trim();
      const name = String(row.name ?? row.ten_san_pham ?? row.ten_sp ?? '').trim();
      if (!code) return null;
      return { code, name };
    })
    .filter((item): item is ProductOption => Boolean(item));
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

export function normalizeMachineRunLogs(data: unknown): MachineRunLog[] {
  const logs = (data as { logs?: unknown })?.logs;
  if (!Array.isArray(logs)) return [];

  return logs
    .map((item): MachineRunLog | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawLines = Array.isArray(record.chi_tiet) ? record.chi_tiet : [];
      const lines = rawLines
        .map((line, index): SavedRunLogLine | null => {
          if (!line || typeof line !== 'object') return null;
          const detail = line as Record<string, unknown>;
          const numOrNull = (value: unknown) => {
            if (value === null || value === undefined || value === '') return null;
            const num = Number(value);
            return Number.isFinite(num) ? num : null;
          };
          return {
            stt: Number(detail.stt ?? index + 1) || index + 1,
            logTime: String(detail.thoi_diem_ghi ?? '').trim(),
            temperature: numOrNull(detail.nhiet_do_gia_nhiet),
            actualSpeed: numOrNull(detail.toc_do_thuc),
            standardSpeed: numOrNull(detail.toc_do_dinh_muc),
            rollsProduced: Number(detail.so_cuon_ra ?? 0) || 0,
            downtimeMinutes: Number(detail.thoi_gian_dung_phut ?? 0) || 0,
            reason: String(detail.ly_do ?? '').trim(),
            recordedBy: String(detail.nguoi_ghi ?? '').trim()
          };
        })
        .filter((line): line is SavedRunLogLine => Boolean(line));

      const numOrNull = (value: unknown) => {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.so_phieu ?? '').trim(),
        date: String(record.ngay ?? '').slice(0, 10),
        shift: String(record.ca ?? '').trim(),
        machineCode: String(record.ma_may ?? '').trim(),
        machineName: String(record.ten_may ?? '').trim(),
        productionOrder: String(record.lenh_sx ?? '').trim(),
        productCode: String(record.ma_san_pham ?? '').trim(),
        mainOperator: String(record.tho_chinh ?? '').trim(),
        assistantOperator: String(record.tho_phu ?? '').trim(),
        plannedRunHours: Number(record.gio_chay_kh ?? 0) || 0,
        totalRollsProduced: Number(record.tong_cuon_ra ?? 0) || 0,
        totalDowntimeMinutes: Number(record.tong_thoi_gian_dung_phut ?? 0) || 0,
        actualRunMinutes: Number(record.thoi_gian_chay_thuc_te_phut ?? 0) || 0,
        timeEfficiencyPct: numOrNull(record.hieu_suat_thoi_gian_pct),
        note: String(record.ghi_chu ?? '').trim(),
        lines,
        createdAt: String(record.created_at ?? '').trim()
      };
    })
    .filter((log): log is MachineRunLog => Boolean(log));
}

type MachineRunLogShiftGroup = {
  shift: string;
  logs: MachineRunLog[];
};

type MachineRunLogDateGroup = {
  date: string;
  logs: MachineRunLog[];
  shifts: MachineRunLogShiftGroup[];
};

function groupRunLogsByDateAndShift(logs: MachineRunLog[]): MachineRunLogDateGroup[] {
  const dateMap = new Map<string, Map<string, MachineRunLog[]>>();

  logs.forEach(log => {
    const dateKey = log.date || '—';
    if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map());
    const shiftMap = dateMap.get(dateKey)!;
    const shiftKey = log.shift || '—';
    if (!shiftMap.has(shiftKey)) shiftMap.set(shiftKey, []);
    shiftMap.get(shiftKey)!.push(log);
  });

  return [...dateMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, shiftMap]) => {
      const shifts = [...shiftMap.entries()].map(([shift, shiftLogs]) => ({ shift, logs: shiftLogs }));
      const dateLogs = shifts.flatMap(group => group.logs);
      return { date, logs: dateLogs, shifts };
    });
}

function logToPrintSlip(log: MachineRunLog): MachineRunLogPrintSlip {
  return buildMachineRunLogPrintSlip({
    slipCode: log.slipCode,
    date: log.date,
    shift: log.shift,
    machineCode: log.machineCode,
    machineName: log.machineName,
    productionOrder: log.productionOrder,
    productCode: log.productCode,
    mainOperator: log.mainOperator,
    assistantOperator: log.assistantOperator,
    plannedRunHours: log.plannedRunHours,
    note: log.note,
    lines: log.lines.map(line => ({
      logTime: line.logTime,
      temperature: line.temperature,
      actualSpeed: line.actualSpeed,
      standardSpeed: line.standardSpeed,
      rollsProduced: line.rollsProduced,
      downtimeMinutes: line.downtimeMinutes,
      reason: line.reason,
      recordedBy: line.recordedBy
    }))
  });
}

export default function MachineRunLogPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [settings, setSettings] = useState<SettingOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderOption[]>([]);
  const [logs, setLogs] = useState<MachineRunLog[]>([]);
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [productionOrder, setProductionOrder] = useState('');
  const [productCode, setProductCode] = useState('');
  const [mainOperator, setMainOperator] = useState('');
  const [assistantOperator, setAssistantOperator] = useState('');
  const [plannedRunHours, setPlannedRunHours] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<RunLogLine[]>([emptyLine()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<MachineRunLogPrintSlip | null>(null);
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

  const summary = useMemo(() => {
    const totalRolls = lines.reduce((sum, line) => sum + (parseLineNumber(line.rollsProduced) ?? 0), 0);
    const totalDowntime = lines.reduce((sum, line) => sum + (parseLineNumber(line.downtimeMinutes) ?? 0), 0);
    const plannedHours = parseLineNumber(plannedRunHours) ?? 0;
    const plannedMinutes = plannedHours * 60;
    const actualRunMinutes = Math.max(0, plannedMinutes - totalDowntime);
    const timeEfficiencyPct = plannedMinutes > 0 ? (actualRunMinutes / plannedMinutes) * 100 : null;

    const speedRatios = lines
      .map(line => {
        const actual = parseLineNumber(line.actualSpeed);
        const standard = parseLineNumber(line.standardSpeed);
        return actual !== null && standard !== null && standard > 0 && actual > 0 ? actual / standard : null;
      })
      .filter((ratio): ratio is number => ratio !== null);
    const speedAttainmentPct =
      speedRatios.length > 0
        ? (speedRatios.reduce((sum, ratio) => sum + ratio, 0) / speedRatios.length) * 100
        : null;

    const productivityRollsPerHour = actualRunMinutes > 0 ? totalRolls / (actualRunMinutes / 60) : null;

    return { totalRolls, totalDowntime, actualRunMinutes, timeEfficiencyPct, speedAttainmentPct, productivityRollsPerHour };
  }, [lines, plannedRunHours]);

  const runLogGroups = useMemo(() => groupRunLogsByDateAndShift(logs), [logs]);

  const loadLogs = async () => {
    const res = await fetch('/api/nhat-ky-chay-may?limit=50');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setLogs(normalizeMachineRunLogs(data));
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
        const [machineRes, settingRes, staffRes, productRes, orderRes, logRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/san-pham?format=table'),
          fetch('/api/lenh-sx'),
          fetch('/api/nhat-ky-chay-may?limit=50')
        ]);
        const [machineData, settingData, staffData, productData, orderData, logData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          settingRes.json().catch(() => ({})),
          staffRes.json().catch(() => ({})),
          productRes.json().catch(() => ({})),
          orderRes.json().catch(() => ({})),
          logRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(normalizeSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (productRes.ok) setProducts(normalizeProducts(productData));
        if (orderRes.ok) setProductionOrders(normalizeProductionOrders(orderData));
        if (logRes.ok) setLogs(normalizeMachineRunLogs(logData));
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

  const updateLine = (key: string, patch: Partial<RunLogLine>) => {
    setLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const buildCurrentPrintSlip = (slipCode = '') =>
    buildMachineRunLogPrintSlip({
      slipCode,
      date,
      shift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      productionOrder,
      productCode,
      mainOperator,
      assistantOperator,
      plannedRunHours,
      note,
      lines: lines.map(line => ({
        logTime: line.logTime,
        temperature: line.temperature,
        actualSpeed: line.actualSpeed,
        standardSpeed: line.standardSpeed,
        rollsProduced: line.rollsProduced,
        downtimeMinutes: line.downtimeMinutes,
        reason: line.reason,
        recordedBy: line.recordedBy
      }))
    });

  const handlePrint = (slip: MachineRunLogPrintSlip) => {
    setError('');
    if (slip.lines.length === 0) {
      setError('Chưa có dòng nhật ký để in.');
      return;
    }
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const saveLog = async () => {
    setError('');
    setMessage('');

    const payloadLines = lines
      .map((line, index) => ({
        stt: index + 1,
        thoi_diem_ghi: line.logTime.trim(),
        nhiet_do_gia_nhiet: parseLineNumber(line.temperature),
        toc_do_thuc: parseLineNumber(line.actualSpeed),
        toc_do_dinh_muc: parseLineNumber(line.standardSpeed),
        so_cuon_ra: parseLineNumber(line.rollsProduced) ?? 0,
        thoi_gian_dung_phut: parseLineNumber(line.downtimeMinutes) ?? 0,
        ly_do: line.reason.trim(),
        nguoi_ghi: line.recordedBy.trim()
      }))
      .filter(line => line.thoi_diem_ghi || line.so_cuon_ra || line.ly_do || line.nhiet_do_gia_nhiet !== null);

    if (!date || !shift || !machineRef.trim() || payloadLines.length === 0) {
      setError(showSaveFailure('Vui lòng chọn ngày, ca, máy và nhập ít nhất một dòng nhật ký.'));
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/nhat-ky-chay-may', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca: shift,
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          lenh_sx: productionOrder.trim(),
          ma_san_pham: productCode.trim(),
          tho_chinh: mainOperator.trim(),
          tho_phu: assistantOperator.trim(),
          gio_chay_kh: parseLineNumber(plannedRunHours) ?? 0,
          ghi_chu: note.trim(),
          chi_tiet: payloadLines
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu nhật ký chạy máy.'));

      const slipCode = String(data.log?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu nhật ký ${slipCode}.` : 'Đã lưu nhật ký chạy máy.';
      setMessage(okMsg);
      showAppToast(okMsg);
      setLines([emptyLine()]);
      setNote('');
      await loadLogs();
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể lưu nhật ký.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLog = async (id: string) => {
    if (!id || !window.confirm('Xóa nhật ký chạy máy này?')) return;
    const res = await fetch(`/api/nhat-ky-chay-may/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Không thể xóa nhật ký.');
      return;
    }
    setLogs(prev => prev.filter(log => log.id !== id));
    setMessage('Đã xóa nhật ký.');
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {printSlip && typeof document !== 'undefined'
        ? createPortal(<MachineRunLogPrintBatch slips={[printSlip]} />, document.body)
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
              <h1 className="text-xl font-black text-zinc-900">Nhật ký chạy máy</h1>
              <p className="text-xs font-semibold text-zinc-500">BM-SX-11 · Thợ chính máy điền mỗi 2 giờ/lần</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Hiệu suất thời gian</p>
            <p className="text-lg font-black text-emerald-900">
              {summary.timeEfficiencyPct !== null ? `${formatNumber(summary.timeEfficiencyPct, 1)}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-zinc-100 pb-3">
              <Activity className="h-5 w-5 text-[#ef1b2d]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-950">NHẬT KÝ CHẠY MÁY</h2>
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

            <div className="grid gap-3 md:grid-cols-4">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Ngày sản xuất *
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
                Lệnh sản xuất số
                <select
                  value={productionOrder}
                  onChange={e => setProductionOrder(e.target.value)}
                  className={`${fieldClass} mt-1`}
                  disabled={isLoading || !date || !shift}
                >
                  <option value="">{date && shift ? 'Chọn lệnh SX' : 'Chọn ngày và ca trước'}</option>
                  {productionOrderOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Mã sản phẩm
                <select value={productCode} onChange={e => setProductCode(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn mã SP</option>
                  {products.map(product => (
                    <option key={product.code} value={product.code}>
                      {product.name ? `${product.code} · ${product.name}` : product.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Thợ chính máy
                <select value={mainOperator} onChange={e => setMainOperator(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn nhân sự</option>
                  {filteredStaffOptions.map(staff => (
                    <option key={staff.id} value={staff.name}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Thợ phụ máy
                <select value={assistantOperator} onChange={e => setAssistantOperator(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn nhân sự</option>
                  {filteredStaffOptions.map(staff => (
                    <option key={staff.id} value={staff.name}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Giờ chạy KH (giờ)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={plannedRunHours}
                  onChange={e => setPlannedRunHours(e.target.value)}
                  className={`${fieldClass} mt-1`}
                  placeholder="VD: 8"
                />
              </label>
            </div>

            <div className="mt-4">
              <RepeatableLinesBlock
                title="Nhật ký ghi nhận (mỗi 2 giờ)"
                required
                onAdd={() => setLines(prev => [...prev, emptyLine()])}
                columns={[
                  { key: 'stt', label: 'STT', className: 'w-10 shrink-0 text-center' },
                  { key: 'time', label: 'Thời điểm ghi', className: 'w-28 shrink-0', required: true },
                  { key: 'temp', label: 'Nhiệt độ (°C)', className: 'w-24 shrink-0' },
                  { key: 'actual', label: 'Tốc độ thực', className: 'w-24 shrink-0' },
                  { key: 'standard', label: 'TĐ định mức', className: 'w-24 shrink-0' },
                  { key: 'rolls', label: 'Cuộn ra', className: 'w-20 shrink-0' },
                  { key: 'downtime', label: 'Dừng (phút)', className: 'w-24 shrink-0' },
                  { key: 'reason', label: 'Lý do dừng / bất thường', className: 'min-w-0 flex-[1.2]' },
                  { key: 'recorder', label: 'Người ghi', className: 'min-w-0 flex-[0.8]' },
                  { key: 'actions', label: '', className: 'w-9 shrink-0' }
                ]}
              >
                {lines.map((line, index) => (
                  <RepeatableLineRow key={line.key}>
                    <div className="flex w-10 shrink-0 items-center justify-center text-sm font-black text-[#ef1b2d]">
                      {index + 1}
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="time" value={line.logTime} onChange={e => updateLine(line.key, { logTime: e.target.value })} className={fieldClass} />
                    </div>
                    <div className="w-24 shrink-0">
                      <input type="number" step="any" value={line.temperature} onChange={e => updateLine(line.key, { temperature: e.target.value })} className={fieldClass} placeholder="°C" />
                    </div>
                    <div className="w-24 shrink-0">
                      <input type="number" min="0" step="any" value={line.actualSpeed} onChange={e => updateLine(line.key, { actualSpeed: e.target.value })} className={fieldClass} placeholder="m/phút" />
                    </div>
                    <div className="w-24 shrink-0">
                      <input type="number" min="0" step="any" value={line.standardSpeed} onChange={e => updateLine(line.key, { standardSpeed: e.target.value })} className={fieldClass} placeholder="m/phút" />
                    </div>
                    <div className="w-20 shrink-0">
                      <input type="number" min="0" step="any" value={line.rollsProduced} onChange={e => updateLine(line.key, { rollsProduced: e.target.value })} className={fieldClass} placeholder="0" />
                    </div>
                    <div className="w-24 shrink-0">
                      <input type="number" min="0" step="any" value={line.downtimeMinutes} onChange={e => updateLine(line.key, { downtimeMinutes: e.target.value })} className={fieldClass} placeholder="0" />
                    </div>
                    <div className="min-w-0 flex-[1.2]">
                      <input value={line.reason} onChange={e => updateLine(line.key, { reason: e.target.value })} className={fieldClass} placeholder="Lý do dừng / bất thường" />
                    </div>
                    <div className="min-w-0 flex-[0.8]">
                      <input value={line.recordedBy} onChange={e => updateLine(line.key, { recordedBy: e.target.value })} className={fieldClass} placeholder="Người ghi" />
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
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">
                Tổng kết hiệu suất máy trong ca (tự động tính)
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Tổng thời gian dừng máy', `${formatNumber(summary.totalDowntime, 0)} phút`],
                  ['Thời gian chạy thực tế', `${formatNumber(summary.actualRunMinutes, 0)} phút`],
                  [
                    'Hiệu suất thời gian chạy máy',
                    summary.timeEfficiencyPct !== null ? `${formatNumber(summary.timeEfficiencyPct, 1)}% (mục tiêu ≥85%)` : '—'
                  ],
                  [
                    'Tốc độ bình quân đạt định mức',
                    summary.speedAttainmentPct !== null ? `${formatNumber(summary.speedAttainmentPct, 1)}% (mục tiêu 95%)` : '—'
                  ],
                  ['Tổng số cuộn ra trong ca', formatNumber(summary.totalRolls, 0)],
                  [
                    'Năng suất máy',
                    summary.productivityRollsPerHour !== null
                      ? `${formatNumber(summary.productivityRollsPerHour, 2)} cuộn/giờ chạy thực`
                      : '—'
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                    <p className="mt-0.5 text-sm font-black text-zinc-900">{value}</p>
                  </div>
                ))}
              </div>
              <label className="mt-3 block text-xs font-black uppercase tracking-wider text-zinc-500">
                Ghi chú chung
                <input value={note} onChange={e => setNote(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Ghi chú thêm (tuỳ chọn)" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-zinc-500">
                Thời gian dừng phải khớp Phiếu báo dừng máy (BM-SX-10). Số cuộn ra khớp Báo cáo sản lượng (BM-SX-08).
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrint(buildCurrentPrintSlip())}
                  disabled={isLoading || lines.every(line => !line.logTime && !line.rollsProduced)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-zinc-400 disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  In nhật ký
                </button>
                <button
                  type="button"
                  onClick={saveLog}
                  disabled={isSaving || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu nhật ký
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-zinc-900">Danh sách nhật ký</h2>
              </div>
              <Activity className="h-5 w-5 text-[#ef1b2d]" />
            </div>
            <div className="space-y-3">
              {isLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải...
                </div>
              )}
              {!isLoading && runLogGroups.length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs font-semibold text-zinc-400">
                  Chưa có nhật ký nào.
                </p>
              )}
              {!isLoading &&
                runLogGroups.map(dateGroup => {
                  const dateTotalRolls = dateGroup.logs.reduce((sum, log) => sum + log.totalRollsProduced, 0);
                  const dateTotalDowntime = dateGroup.logs.reduce((sum, log) => sum + log.totalDowntimeMinutes, 0);

                  return (
                    <div key={dateGroup.date} className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
                      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</span>
                          <span className="font-mono text-sm font-black text-zinc-900">{dateGroup.date}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 ring-1 ring-zinc-200">
                            {dateGroup.logs.length} nhật ký
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng ngày</p>
                          <p className="font-mono text-xs font-black text-emerald-800">
                            {formatNumber(dateTotalRolls, 0)} cuộn · dừng {formatNumber(dateTotalDowntime, 0)} phút
                          </p>
                        </div>
                      </div>
                      <div className="divide-y divide-zinc-100 bg-white">
                        {dateGroup.shifts.map(shiftGroup => (
                          <div key={shiftGroup.shift} className="p-2">
                            <div className="mb-1.5 flex items-center gap-2 px-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ca</span>
                              <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-black text-zinc-800">
                                {shiftGroup.shift}
                              </span>
                              <span className="text-[10px] font-bold text-zinc-400">{shiftGroup.logs.length} nhật ký</span>
                            </div>
                            <div className="space-y-2">
                              {shiftGroup.logs.map(log => (
                                <div key={log.id} className="rounded-xl border border-zinc-200 p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="font-black text-zinc-900">{log.slipCode || log.machineName || log.machineCode}</p>
                                      <p className="text-xs font-semibold text-zinc-500">
                                        {log.machineName || log.machineCode || '-'}
                                      </p>
                                      <p className="mt-1 text-xs font-bold text-emerald-800">
                                        {formatNumber(log.totalRollsProduced, 0)} cuộn · dừng {formatNumber(log.totalDowntimeMinutes, 0)} phút
                                        {log.timeEfficiencyPct !== null ? ` · HS ${formatNumber(log.timeEfficiencyPct, 1)}%` : ''}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handlePrint(logToPrintSlip(log))}
                                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"
                                        title="In nhật ký"
                                      >
                                        <Printer className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteLog(log.id)}
                                        className="rounded-lg border border-zinc-200 p-2 text-[#ef1b2d]"
                                        title="Xóa nhật ký"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
