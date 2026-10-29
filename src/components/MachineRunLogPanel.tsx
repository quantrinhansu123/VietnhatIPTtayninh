import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Camera,
  ChevronLeft,
  ImagePlus,
  Loader2,
  Printer,
  Save,
  Trash2,
  X
} from 'lucide-react';
import {
  MachineRunLogPrintBatch,
  buildMachineRunLogPrintSlip,
  type MachineRunLogPrintSlip
} from './MachineRunLogPrintSheet';
import { formatNumber } from '../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { waitForPrintImagesReady } from '../utils/printReady';
import { shiftNamesMatch } from '../utils/shiftSettings';
import { useReportFormsSharedOptional } from '../features/report-forms/ReportFormsSharedContext';
import { uploadImage } from '../features/_shared/recordHelpers';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import waitScreenBgUrl from '../assets/kaizen-app-bg.png';

const fieldClass =
  'h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-red-500/10';

function MachineRunLogWaitScreen({ label }: { label: string }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${waitScreenBgUrl})` }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <img
          src={vietNhatLogoUrl}
          alt={PRINT_COMPANY_NAME}
          className="h-16 w-16 rounded-xl bg-white object-contain p-1.5 shadow-md sm:h-20 sm:w-20"
        />
        <p
          className="text-2xl font-extrabold italic text-white sm:text-3xl md:text-4xl"
          style={{
            fontFamily: '"Playfair Display", "Be Vietnam Pro", Georgia, serif',
            textShadow: '0 1px 8px rgba(0,0,0,0.65)'
          }}
        >
          {label}
        </p>
        <Loader2 className="h-7 w-7 animate-spin text-[#e30613]" aria-hidden />
      </div>
    </div>,
    document.body
  );
}

type MachineOption = { id: string; code: string; name: string };
type StaffOption = { id: string; name: string; shift: string };
type SettingOption = { name: string; code: string; loaiCaiDat: string };

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
  startTime: string;
  endTime: string;
  parameterImageUrl: string;
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

function nowTimeHm() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(11, 16);
}

function shiftMatches(orderShift: string, selectedShift: string) {
  return shiftNamesMatch(orderShift, selectedShift);
}

function minutesBetween(start: string, end: string): number | null {
  const startMatch = String(start || '').trim().match(/^(\d{1,2}):(\d{2})/);
  const endMatch = String(end || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!startMatch || !endMatch) return null;
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  const diff = endMinutes - startMinutes;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : [];
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
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
        startTime: String(record.gio ?? '').trim(),
        endTime: String(record.gio_dung ?? '').trim(),
        parameterImageUrl: String(record.anh_thong_so ?? '').trim(),
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
    mainOperator: log.mainOperator,
    startTime: log.startTime,
    endTime: log.endTime,
    parameterImageUrl: log.parameterImageUrl,
    note: log.note,
    actualRunMinutes: log.actualRunMinutes,
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

export default function MachineRunLogPanel({
  onBack,
  showSavedList = false
}: {
  onBack: () => void;
  /** Chỉ hiện danh sách phiếu đã lưu trên route/list hub — phiếu nhập không cần. */
  showSavedList?: boolean;
}) {
  const hubShared = useReportFormsSharedOptional();
  const hideLocalHeader = Boolean(hubShared);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRootRef = useRef<HTMLDivElement | null>(null);

  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [settings, setSettings] = useState<SettingOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [logs, setLogs] = useState<MachineRunLog[]>([]);
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState(nowTimeHm());
  const [endTime, setEndTime] = useState('');
  const [shift, setShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [responsibleStaff, setResponsibleStaff] = useState('');
  const [note, setNote] = useState('');
  const [parameterImageUrl, setParameterImageUrl] = useState('');
  const [parameterPreview, setParameterPreview] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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
    const hubNames = hubShared?.staffOptions || [];
    if (hubNames.length > 0) {
      return hubNames.map(name => ({ id: name, name, shift: '' }));
    }
    if (!shift) return staffOptions;
    const filtered = staffOptions.filter(member => shiftMatches(member.shift, shift));
    return filtered.length > 0 ? filtered : staffOptions;
  }, [staffOptions, shift, hubShared?.staffOptions]);

  const actualRunMinutes = useMemo(() => minutesBetween(startTime, endTime), [startTime, endTime]);

  useEffect(() => {
    if (!hubShared) return;
    setDate(hubShared.ngay);
    setShift(hubShared.ca);
    setMachineRef(hubShared.selectedMachine?.code || hubShared.machine?.code || '');
    setResponsibleStaff(hubShared.staffNames[0] || '');
    setNote(hubShared.ghiChu);
    if (hubShared.gio) setStartTime(hubShared.gio);
  }, [
    hubShared,
    hubShared?.ngay,
    hubShared?.ca,
    hubShared?.gio,
    hubShared?.selectedMachine,
    hubShared?.machine,
    hubShared?.staffNames,
    hubShared?.ghiChu
  ]);

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
        const requests: Promise<Response>[] = [
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups')
        ];
        if (showSavedList) requests.push(fetch('/api/nhat-ky-chay-may?limit=50'));
        const responses = await Promise.all(requests);
        const payloads = await Promise.all(responses.map(res => res.json().catch(() => ({}))));
        if (!alive) return;
        const [machineRes, settingRes, staffRes, logRes] = responses;
        const [machineData, settingData, staffData, logData] = payloads;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(normalizeSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (showSavedList && logRes?.ok) setLogs(normalizeMachineRunLogs(logData));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [showSavedList]);

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

  const buildCurrentPrintSlip = (slipCode = '') =>
    buildMachineRunLogPrintSlip({
      slipCode,
      date,
      shift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      mainOperator: responsibleStaff,
      startTime,
      endTime,
      parameterImageUrl: parameterImageUrl || parameterPreview,
      note,
      actualRunMinutes: actualRunMinutes ?? 0,
      lines: []
    });

  const handlePrint = (slip: MachineRunLogPrintSlip) => {
    setError('');
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const handlePickImage = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(showSaveFailure('Clipboard / file không phải ảnh.'));
      return;
    }
    setError('');
    setIsUploadingImage(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setParameterPreview(dataUrl);
      const uploaded = await uploadImage(dataUrl, 'nhat_ky_chay_may');
      if (!uploaded.imageUrl) throw new Error('Upload ảnh thất bại.');
      setParameterImageUrl(uploaded.imageUrl);
      setParameterPreview(uploaded.imageUrl);
      showAppToast('Đã gắn ảnh thông số.');
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể tải ảnh thông số.'));
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const imageFromClipboard = (clipboardData: DataTransfer | null): File | null => {
    if (!clipboardData) return null;
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    const files = Array.from(clipboardData.files || []);
    return files.find(file => file.type.startsWith('image/')) || null;
  };

  const handlePasteImage = (event: React.ClipboardEvent | ClipboardEvent) => {
    const file = imageFromClipboard(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void handlePickImage(file);
  };

  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      const root = panelRootRef.current;
      // Tab hub keep-alive: chỉ nhận dán khi panel đang hiện.
      if (!root || root.closest('[hidden]') || root.classList.contains('hidden')) return;
      const style = window.getComputedStyle(root);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void handlePickImage(file);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearImage = () => {
    setParameterImageUrl('');
    setParameterPreview('');
  };

  const saveLog = async () => {
    setError('');
    setMessage('');

    if (!date || !shift || !machineRef.trim() || !startTime || !endTime || !responsibleStaff.trim()) {
      setError(
        showSaveFailure('Vui lòng điền Ngày, Giờ, Ca chạy, Giờ dừng, Máy và Nhân sự phụ trách.')
      );
      return;
    }
    if (actualRunMinutes === null) {
      setError(showSaveFailure('Giờ / Giờ dừng không hợp lệ.'));
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
          gio: startTime,
          gio_dung: endTime,
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          tho_chinh: responsibleStaff.trim(),
          nhan_su: responsibleStaff.trim(),
          ghi_chu: note.trim(),
          anh_thong_so: parameterImageUrl.trim() || null,
          chi_tiet: []
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu nhật ký chạy máy.'));

      const slipCode = String(data.log?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu nhật ký ${slipCode}.` : 'Đã lưu nhật ký chạy máy.';
      setMessage(okMsg);
      showAppToast(okMsg);
      setEndTime('');
      setNote(hubShared ? hubShared.ghiChu : '');
      clearImage();
      if (showSavedList) await loadLogs();
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

  const imageSrc = parameterPreview || parameterImageUrl;
  const waitLabel = isSaving
    ? 'Đang lưu biểu mẫu…'
    : isUploadingImage
      ? 'Đang tải ảnh…'
      : isLoading
        ? 'Đang tải biểu mẫu…'
        : '';

  return (
    <div ref={panelRootRef} className="flex h-full flex-col bg-transparent">
      {waitLabel && typeof document !== 'undefined' ? <MachineRunLogWaitScreen label={waitLabel} /> : null}
      {printSlip && typeof document !== 'undefined'
        ? createPortal(<MachineRunLogPrintBatch slips={[printSlip]} />, document.body)
        : null}

      <div className="border-b border-white/20 bg-white/90 px-2 py-1.5 backdrop-blur-sm sm:px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Quay lại
            </button>
            <img
              src={vietNhatLogoUrl}
              alt={PRINT_COMPANY_NAME}
              className="h-8 w-8 shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm sm:h-9 sm:w-9"
            />
            <div className="min-w-0">
              <h1 className="text-sm font-black text-zinc-900 sm:text-base">Nhật ký chạy máy</h1>
              <p className="text-[10px] font-semibold text-zinc-500">
                Ngày · Giờ · Ca chạy · Giờ dừng · Nhân sự · Ghi chú · Ảnh thông số
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-right">
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Giờ chạy</span>
            <span className="text-sm font-black tabular-nums text-emerald-900">
              {actualRunMinutes !== null ? `${formatNumber(actualRunMinutes, 0)} phút` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 sm:p-2.5">
        <div className={`grid gap-2 ${showSavedList ? 'xl:grid-cols-[1.35fr_0.65fr]' : ''}`}>
          <section className="rounded-xl border border-white/40 bg-white/95 p-2.5 shadow-lg backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-1.5 border-b border-zinc-100 pb-1.5">
              <img src={vietNhatLogoUrl} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
              <Activity className="h-4 w-4 text-[#ef1b2d]" />
              <h2 className="text-[11px] font-black uppercase tracking-wider text-zinc-950">Nhập nhật ký</h2>
            </div>

            {error ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {message}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              {!hideLocalHeader ? (
                <>
                  <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Ngày *
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className={`${fieldClass} mt-1`}
                    />
                  </label>
                  <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Ca chạy *
                    <select
                      value={shift}
                      onChange={e => setShift(e.target.value)}
                      className={`${fieldClass} mt-1`}
                      disabled={isLoading}
                    >
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
                    <select
                      value={machineRef}
                      onChange={e => setMachineRef(e.target.value)}
                      className={`${fieldClass} mt-1`}
                      disabled={isLoading}
                    >
                      <option value="">Chọn máy</option>
                      {machines.map(machine => (
                        <option key={machine.id} value={machine.code}>
                          {machine.code ? `${machine.code} · ${machine.name}` : machine.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Nhân sự phụ trách *
                    <select
                      value={responsibleStaff}
                      onChange={e => setResponsibleStaff(e.target.value)}
                      className={`${fieldClass} mt-1`}
                      disabled={isLoading}
                    >
                      <option value="">Chọn nhân sự</option>
                      {filteredStaffOptions.map(staff => (
                        <option key={staff.id} value={staff.name}>
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Giờ *
                <input
                  type="time"
                  value={startTime}
                  onChange={e => {
                    setStartTime(e.target.value);
                    if (hubShared) hubShared.setGio(e.target.value);
                  }}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Giờ dừng *
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>

              {!hideLocalHeader ? (
                <label className="col-span-2 text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ghi chú
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className={`${fieldClass} mt-1`}
                    placeholder="Ghi chú (tuỳ chọn)"
                  />
                </label>
              ) : null}

              <div className="col-span-2 text-xs font-black uppercase tracking-wider text-zinc-500">
                Ảnh thông số
                <div
                  tabIndex={0}
                  onPaste={handlePasteImage}
                  onDragOver={event => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    const file =
                      Array.from(event.dataTransfer.files || []).find(item =>
                        item.type.startsWith('image/')
                      ) || null;
                    void handlePickImage(file);
                  }}
                  className="mt-1 flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-2.5 py-2 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-100"
                  title="Ctrl+V để dán ảnh, hoặc kéo thả ảnh vào đây"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => void handlePickImage(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : imageSrc ? (
                      <Camera className="h-4 w-4" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {isUploadingImage ? 'Đang tải...' : imageSrc ? 'Đổi ảnh' : 'Chụp / chọn ảnh'}
                  </button>
                  {imageSrc ? (
                    <div className="relative">
                      <img
                        src={imageSrc}
                        alt="Ảnh thông số"
                        className="h-16 w-24 rounded-lg border border-zinc-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-rose-600"
                        title="Xóa ảnh"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] font-semibold normal-case tracking-normal text-zinc-400">
                      Tuỳ chọn — chụp, chọn, kéo thả hoặc Ctrl+V dán ảnh.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-zinc-500">
                Giờ chạy thực tế = Giờ → Giờ dừng
                {actualRunMinutes !== null ? ` (${formatNumber(actualRunMinutes, 0)} phút).` : '.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrint(buildCurrentPrintSlip())}
                  disabled={isLoading || !startTime || !endTime}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:border-zinc-400 disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  In nhật ký
                </button>
                <button
                  type="button"
                  onClick={() => void saveLog()}
                  disabled={isSaving || isLoading || isUploadingImage}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu nhật ký
                </button>
              </div>
            </div>
          </section>

          {showSavedList ? (
            <section className="rounded-xl border border-white/40 bg-white/95 p-2.5 shadow-lg backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-black text-zinc-900">Danh sách nhật ký</h2>
                <Activity className="h-5 w-5 text-[#ef1b2d]" />
              </div>
              <div className="space-y-3">
                {isLoading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải...
                  </div>
                ) : null}
                {!isLoading && runLogGroups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs font-semibold text-zinc-400">
                    Chưa có nhật ký nào.
                  </p>
                ) : null}
                {!isLoading &&
                  runLogGroups.map(dateGroup => {
                    const dateRunMinutes = dateGroup.logs.reduce((sum, log) => sum + log.actualRunMinutes, 0);
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
                            <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng chạy</p>
                            <p className="font-mono text-xs font-black text-emerald-800">
                              {formatNumber(dateRunMinutes, 0)} phút
                            </p>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-100 bg-white">
                          {dateGroup.shifts.map(shiftGroup => (
                            <div key={shiftGroup.shift} className="p-2">
                              <div className="mb-1.5 flex items-center gap-2 px-1">
                                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                                  Ca chạy
                                </span>
                                <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-black text-zinc-800">
                                  {shiftGroup.shift}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {shiftGroup.logs.map(log => (
                                  <div key={log.id} className="rounded-xl border border-zinc-200 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-black text-zinc-900">
                                          {log.slipCode || log.machineName || log.machineCode}
                                        </p>
                                        <p className="text-xs font-semibold text-zinc-500">
                                          {(log.machineName || log.machineCode || '-') +
                                            (log.mainOperator ? ` · ${log.mainOperator}` : '')}
                                        </p>
                                        <p className="mt-1 text-xs font-bold text-emerald-800">
                                          {log.startTime || '—'} → {log.endTime || '—'} ·{' '}
                                          {formatNumber(log.actualRunMinutes, 0)} phút
                                        </p>
                                        {log.note ? (
                                          <p className="mt-1 truncate text-[11px] font-semibold text-zinc-500">
                                            {log.note}
                                          </p>
                                        ) : null}
                                        {log.parameterImageUrl ? (
                                          <img
                                            src={log.parameterImageUrl}
                                            alt="Ảnh thông số"
                                            className="mt-2 h-14 w-20 rounded-md border border-zinc-200 object-cover"
                                          />
                                        ) : null}
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
                                          onClick={() => void deleteLog(log.id)}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
