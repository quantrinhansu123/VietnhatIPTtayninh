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
import {
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../utils/shiftSettings';
import { useReportFormsSharedOptional } from '../features/report-forms/ReportFormsSharedContext';
import { uploadImage } from '../features/_shared/recordHelpers';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';
import waitScreenBgUrl from '../assets/kaizen-app-bg.png';
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';

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

export type MachineRunLogIncident = {
  stt: number;
  name: string;
  occurredAt: string;
  resolvedAt: string;
  downtimeMinutes: number;
};

type IncidentDraft = {
  key: string;
  name: string;
  customName: string;
  occurredAt: string;
  resolvedAt: string;
};

type ParameterImageDraft = {
  key: string;
  url: string;
  preview: string;
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
  parameterImageUrls: string[];
  plannedRunHours: number;
  totalRollsProduced: number;
  totalDowntimeMinutes: number;
  actualRunMinutes: number;
  timeEfficiencyPct: number | null;
  note: string;
  incidents: MachineRunLogIncident[];
  lines: SavedRunLogLine[];
  createdAt: string;
};

const DEFAULT_INCIDENT_OPTIONS = [
  'Hỏng máy',
  'Mất điện',
  'Hết NVL',
  'Chờ QC / kiểm tra',
  'Setup / thay khuôn',
  'Vệ sinh máy',
  'Chờ lệnh / chờ NVL',
  'Khác'
] as const;

const INCIDENT_OTHER = 'Khác';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function emptyIncidentDraft(): IncidentDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    customName: '',
    occurredAt: '',
    resolvedAt: ''
  };
}

function resolveIncidentName(draft: IncidentDraft) {
  if (draft.name === INCIDENT_OTHER) return draft.customName.trim();
  return draft.name.trim() || draft.customName.trim();
}

function findShiftClockRange(settings: ShiftSetting[], shiftName: string) {
  const target = String(shiftName || '').trim();
  if (!target) return null;
  const match = settings.find(
    setting =>
      shiftNamesMatch(setting.name, target) ||
      shiftNamesMatch(setting.code, target) ||
      setting.name === target ||
      setting.code === target
  );
  if (!match?.startTime || !match?.endTime) return null;
  return { start: match.startTime, end: match.endTime };
}

function parseImageUrlList(...values: unknown[]): string[] {
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (typeof item === 'string' && item.trim()) urls.push(item.trim());
        else if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>;
          const url = String(row.url ?? row.anh ?? '').trim();
          if (url) urls.push(url);
        }
      });
      return;
    }
    const text = String(value).trim();
    if (!text) return;
    if (text.startsWith('[')) {
      try {
        push(JSON.parse(text));
      } catch {
        urls.push(text);
      }
      return;
    }
    urls.push(text);
  };
  values.forEach(push);
  return [...new Set(urls)];
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
      const linesFromChiTiet: SavedRunLogLine[] = [];
      const incidentsFromChiTiet: MachineRunLogIncident[] = [];

      rawLines.forEach((line, index) => {
        if (!line || typeof line !== 'object') return;
        const detail = line as Record<string, unknown>;
        const numOrNull = (value: unknown) => {
          if (value === null || value === undefined || value === '') return null;
          const num = Number(value);
          return Number.isFinite(num) ? num : null;
        };
        const loai = String(detail.loai ?? '').trim().toLowerCase();
        const tenSuCo = String(detail.ten_su_co ?? '').trim();
        if (loai === 'su_co' || tenSuCo || detail.thoi_gian_xay_ra) {
          const occurredAt = String(detail.thoi_gian_xay_ra ?? detail.thoi_diem_ghi ?? '').trim();
          const resolvedAt = String(detail.thoi_gian_khac_phuc ?? '').trim();
          incidentsFromChiTiet.push({
            stt: Number(detail.stt ?? index + 1) || index + 1,
            name: tenSuCo || String(detail.ly_do ?? '').trim(),
            occurredAt,
            resolvedAt,
            downtimeMinutes:
              Number(detail.thoi_gian_dung_phut ?? 0) ||
              minutesBetween(occurredAt, resolvedAt) ||
              0
          });
          return;
        }
        linesFromChiTiet.push({
          stt: Number(detail.stt ?? index + 1) || index + 1,
          logTime: String(detail.thoi_diem_ghi ?? '').trim(),
          temperature: numOrNull(detail.nhiet_do_gia_nhiet),
          actualSpeed: numOrNull(detail.toc_do_thuc),
          standardSpeed: numOrNull(detail.toc_do_dinh_muc),
          rollsProduced: Number(detail.so_cuon_ra ?? 0) || 0,
          downtimeMinutes: Number(detail.thoi_gian_dung_phut ?? 0) || 0,
          reason: String(detail.ly_do ?? '').trim(),
          recordedBy: String(detail.nguoi_ghi ?? '').trim()
        });
      });

      const rawIncidents = Array.isArray(record.su_co) ? record.su_co : [];
      const incidentsFromColumn = rawIncidents
        .map((line, index): MachineRunLogIncident | null => {
          if (!line || typeof line !== 'object') return null;
          const detail = line as Record<string, unknown>;
          const occurredAt = String(detail.thoi_gian_xay_ra ?? '').trim();
          const resolvedAt = String(detail.thoi_gian_khac_phuc ?? '').trim();
          const name = String(detail.ten_su_co ?? detail.ly_do ?? '').trim();
          if (!name && !occurredAt && !resolvedAt) return null;
          return {
            stt: Number(detail.stt ?? index + 1) || index + 1,
            name,
            occurredAt,
            resolvedAt,
            downtimeMinutes:
              Number(detail.thoi_gian_dung_phut ?? 0) || minutesBetween(occurredAt, resolvedAt) || 0
          };
        })
        .filter((line): line is MachineRunLogIncident => Boolean(line));

      const incidents = incidentsFromColumn.length > 0 ? incidentsFromColumn : incidentsFromChiTiet;
      const parameterImageUrls = parseImageUrlList(record.anh_urls, record.anh_thong_so);

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
        parameterImageUrl: parameterImageUrls[0] || '',
        parameterImageUrls,
        plannedRunHours: Number(record.gio_chay_kh ?? 0) || 0,
        totalRollsProduced: Number(record.tong_cuon_ra ?? 0) || 0,
        totalDowntimeMinutes: Number(record.tong_thoi_gian_dung_phut ?? 0) || 0,
        actualRunMinutes: Number(record.thoi_gian_chay_thuc_te_phut ?? 0) || 0,
        timeEfficiencyPct: numOrNull(record.hieu_suat_thoi_gian_pct),
        note: String(record.ghi_chu ?? '').trim(),
        incidents,
        lines: linesFromChiTiet,
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
    parameterImageUrls: log.parameterImageUrls,
    note: log.note,
    actualRunMinutes: log.actualRunMinutes,
    incidents: log.incidents,
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
  const lastAutoShiftRef = useRef('');

  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [logs, setLogs] = useState<MachineRunLog[]>([]);
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [shift, setShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [responsibleStaff, setResponsibleStaff] = useState('');
  const [note, setNote] = useState('');
  const [incidents, setIncidents] = useState<IncidentDraft[]>([]);
  const [parameterImages, setParameterImages] = useState<ParameterImageDraft[]>([]);
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
    const fromSettings = shiftSettings
      .filter(
        setting =>
          setting.loaiCaiDat === 'Thời gian' ||
          setting.loaiCaiDat === 'Sản xuất' ||
          setting.loaiCaiDat === 'Ca máy' ||
          /ca/i.test(setting.name) ||
          /ca/i.test(setting.code)
      )
      .map(setting => setting.name || setting.code)
      .filter((name, index, arr) => name && arr.indexOf(name) === index);
    return fromSettings;
  }, [shiftSettings]);

  const incidentOptions = useMemo(() => {
    const fromSettings = shiftSettings
      .filter(setting => /sự cố|su co|dừng|dung may|ly do/i.test(`${setting.loaiCaiDat} ${setting.name}`))
      .map(setting => setting.name || setting.code)
      .filter(Boolean);
    return [...new Set([...fromSettings, ...DEFAULT_INCIDENT_OPTIONS])];
  }, [shiftSettings]);

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

  const applyShiftClockTimes = (shiftName: string, force = false) => {
    const range = findShiftClockRange(shiftSettings, shiftName);
    if (!range) return false;
    if (!force && lastAutoShiftRef.current === shiftName) return true;
    lastAutoShiftRef.current = shiftName;
    setStartTime(range.start);
    setEndTime(range.end);
    if (hubShared) hubShared.setGio(range.start);
    return true;
  };

  useEffect(() => {
    if (!hubShared) return;
    setDate(hubShared.ngay);
    setShift(hubShared.ca);
    setMachineRef(hubShared.selectedMachine?.code || hubShared.machine?.code || '');
    setResponsibleStaff(hubShared.staffNames[0] || '');
    setNote(hubShared.ghiChu);
  }, [
    hubShared,
    hubShared?.ngay,
    hubShared?.ca,
    hubShared?.selectedMachine,
    hubShared?.machine,
    hubShared?.staffNames,
    hubShared?.ghiChu
  ]);

  useEffect(() => {
    if (!shift) return;
    const applied = applyShiftClockTimes(shift);
    if (!applied && hubShared?.gio && !startTime) {
      setStartTime(hubShared.gio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, shiftSettings]);

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
        if (settingRes.ok) setShiftSettings(normalizeShiftSettings(settingData));
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

  const buildCurrentPrintSlip = (slipCode = '') => {
    const imageUrls = parameterImages.map(image => image.url || image.preview).filter(Boolean);
    return buildMachineRunLogPrintSlip({
      slipCode,
      date,
      shift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      mainOperator: responsibleStaff,
      startTime,
      endTime,
      parameterImageUrl: imageUrls[0] || '',
      parameterImageUrls: imageUrls,
      note,
      actualRunMinutes: actualRunMinutes ?? 0,
      incidents: incidents
        .map((incident, index) => {
          const name = resolveIncidentName(incident);
          const downtimeMinutes = minutesBetween(incident.occurredAt, incident.resolvedAt) ?? 0;
          return {
            stt: index + 1,
            name,
            occurredAt: incident.occurredAt,
            resolvedAt: incident.resolvedAt,
            downtimeMinutes
          };
        })
        .filter(item => item.name || item.occurredAt || item.resolvedAt),
      lines: []
    });
  };

  const handlePrint = (slip: MachineRunLogPrintSlip) => {
    setError('');
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const handlePickImages = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    const imageFiles = list.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError(showSaveFailure('Clipboard / file không phải ảnh.'));
      return;
    }
    setError('');
    setIsUploadingImage(true);
    try {
      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataUrl(file);
        const uploaded = await uploadImage(dataUrl, 'nhat_ky_chay_may');
        if (!uploaded.imageUrl) throw new Error('Upload ảnh thất bại.');
        setParameterImages(prev => [
          ...prev,
          {
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url: uploaded.imageUrl,
            preview: uploaded.imageUrl
          }
        ]);
      }
      showAppToast(
        imageFiles.length > 1 ? `Đã gắn ${imageFiles.length} ảnh thông số.` : 'Đã gắn ảnh thông số.'
      );
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể tải ảnh thông số.'));
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const imageFilesFromClipboard = (clipboardData: DataTransfer | null): File[] => {
    if (!clipboardData) return [];
    const files: File[] = [];
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) return files;
    return Array.from(clipboardData.files || []).filter(file => file.type.startsWith('image/'));
  };

  const handlePasteImage = (event: React.ClipboardEvent | ClipboardEvent) => {
    const files = imageFilesFromClipboard(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void handlePickImages(files);
  };

  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      const root = panelRootRef.current;
      // Tab hub keep-alive: chỉ nhận dán khi panel đang hiện.
      if (!root || root.closest('[hidden]') || root.classList.contains('hidden')) return;
      const style = window.getComputedStyle(root);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const files = imageFilesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      void handlePickImages(files);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeImage = (key: string) => {
    setParameterImages(prev => prev.filter(image => image.key !== key));
  };

  const updateIncident = (key: string, patch: Partial<IncidentDraft>) => {
    setIncidents(prev => prev.map(item => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeIncident = (key: string) => {
    setIncidents(prev => prev.filter(item => item.key !== key));
  };

  const saveLog = async () => {
    setError('');
    setMessage('');

    if (!date || !shift || !machineRef.trim() || !startTime || !endTime || !responsibleStaff.trim()) {
      setError(
        showSaveFailure(
          'Vui lòng điền Ngày, Giờ bắt đầu, Giờ kết thúc, Ca chạy, Máy và Nhân sự phụ trách.'
        )
      );
      return;
    }
    if (actualRunMinutes === null) {
      setError(showSaveFailure('Giờ bắt đầu / Giờ kết thúc không hợp lệ.'));
      return;
    }

    const suCoPayload = [];
    for (const incident of incidents) {
      const name = resolveIncidentName(incident);
      if (!name && !incident.occurredAt && !incident.resolvedAt) continue;
      if (!name) {
        setError(showSaveFailure('Vui lòng chọn tên sự cố.'));
        return;
      }
      if (!incident.occurredAt) {
        setError(showSaveFailure('Vui lòng nhập thời gian xảy ra sự cố.'));
        return;
      }
      if (!incident.resolvedAt) {
        setError(showSaveFailure('Vui lòng nhập thời gian khắc phục sự cố.'));
        return;
      }
      const downtimeMinutes = minutesBetween(incident.occurredAt, incident.resolvedAt);
      if (downtimeMinutes === null) {
        setError(showSaveFailure('Thời gian xảy ra / khắc phục sự cố không hợp lệ.'));
        return;
      }
      suCoPayload.push({
        ten_su_co: name,
        thoi_gian_xay_ra: incident.occurredAt,
        thoi_gian_khac_phuc: incident.resolvedAt,
        thoi_gian_dung_phut: downtimeMinutes
      });
    }

    const imageUrls = parameterImages.map(image => image.url).filter(Boolean);

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
          anh_thong_so: imageUrls[0] || null,
          anh_urls: imageUrls,
          su_co: suCoPayload,
          chi_tiet: suCoPayload.map((item, index) => ({
            stt: index + 1,
            loai: 'su_co',
            ...item
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu nhật ký chạy máy.'));

      const slipCode = String(data.log?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu nhật ký ${slipCode}.` : 'Đã lưu nhật ký chạy máy.';
      setMessage(okMsg);
      showAppToast(okMsg);
      setIncidents([]);
      setNote(hubShared ? hubShared.ghiChu : '');
      setParameterImages([]);
      applyShiftClockTimes(shift, true);
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
                Giờ bắt đầu/kết thúc theo ca · Sự cố · Nhiều ảnh
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
                      onChange={e => {
                        const next = e.target.value;
                        setShift(next);
                        lastAutoShiftRef.current = '';
                        applyShiftClockTimes(next, true);
                      }}
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
                Giờ bắt đầu *
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
                Giờ kết thúc *
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <p className="col-span-2 text-[11px] font-semibold normal-case tracking-normal text-zinc-500">
                Giờ bắt đầu / kết thúc tự điền theo ca (Cài đặt), vẫn chỉnh tay được.
              </p>

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

              <div className="col-span-2">
                <RepeatableLinesBlock
                  title="Sự cố"
                  addLabel="Thêm sự cố"
                  onAdd={() => setIncidents(prev => [...prev, emptyIncidentDraft()])}
                  columns={[
                    { key: 'name', label: 'Sự cố', className: 'min-w-0 flex-[1.3]', required: true },
                    { key: 'occurredAt', label: 'TG xảy ra', className: 'w-[7.5rem]', required: true },
                    { key: 'resolvedAt', label: 'TG khắc phục', className: 'w-[7.5rem]', required: true },
                    { key: 'minutes', label: 'Phút', className: 'w-16' }
                  ]}
                >
                  {incidents.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-[11px] font-semibold text-zinc-400">
                      Chưa có sự cố — bấm «Thêm sự cố» nếu máy dừng trong ca.
                    </p>
                  ) : (
                    incidents.map(incident => {
                      const minutes = minutesBetween(incident.occurredAt, incident.resolvedAt);
                      return (
                        <RepeatableLineRow key={incident.key} className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[10rem] flex-[1.3]">
                            <select
                              value={incident.name}
                              onChange={e => updateIncident(incident.key, { name: e.target.value })}
                              className={fieldClass}
                            >
                              <option value="">Chọn sự cố</option>
                              {incidentOptions.map(option => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            {incident.name === INCIDENT_OTHER ? (
                              <input
                                value={incident.customName}
                                onChange={e => updateIncident(incident.key, { customName: e.target.value })}
                                className={`${fieldClass} mt-1`}
                                placeholder="Nhập tên sự cố"
                              />
                            ) : null}
                          </div>
                          <input
                            type="time"
                            value={incident.occurredAt}
                            onChange={e => updateIncident(incident.key, { occurredAt: e.target.value })}
                            className={`${fieldClass} w-[7.5rem]`}
                          />
                          <input
                            type="time"
                            value={incident.resolvedAt}
                            onChange={e => updateIncident(incident.key, { resolvedAt: e.target.value })}
                            className={`${fieldClass} w-[7.5rem]`}
                          />
                          <div className="flex h-8 w-16 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-xs font-black tabular-nums text-zinc-700">
                            {minutes !== null ? formatNumber(minutes, 0) : '—'}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeIncident(incident.key)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:text-rose-600"
                            title="Xóa sự cố"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </RepeatableLineRow>
                      );
                    })
                  )}
                </RepeatableLinesBlock>
              </div>

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
                    const files = Array.from(event.dataTransfer.files || []).filter(item =>
                      item.type.startsWith('image/')
                    );
                    void handlePickImages(files);
                  }}
                  className="mt-1 flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 px-2.5 py-2 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-100"
                  title="Ctrl+V để dán ảnh, hoặc kéo thả ảnh vào đây"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={e => void handlePickImages(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-[11px] font-black text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : parameterImages.length > 0 ? (
                      <Camera className="h-4 w-4" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {isUploadingImage
                      ? 'Đang tải...'
                      : parameterImages.length > 0
                        ? 'Thêm ảnh'
                        : 'Chụp / chọn ảnh'}
                  </button>
                  {parameterImages.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {parameterImages.map(image => (
                        <div key={image.key} className="relative">
                          <img
                            src={image.preview || image.url}
                            alt="Ảnh thông số"
                            className="h-16 w-24 rounded-lg border border-zinc-200 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(image.key)}
                            className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:text-rose-600"
                            title="Xóa ảnh"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-semibold normal-case tracking-normal text-zinc-400">
                      Có thể chụp / chọn nhiều ảnh — kéo thả hoặc Ctrl+V.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-zinc-500">
                Giờ chạy thực tế = Giờ bắt đầu → Giờ kết thúc
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
                                        {log.incidents.length > 0 ? (
                                          <p className="mt-1 text-[11px] font-semibold text-amber-700">
                                            {log.incidents.length} sự cố · dừng{' '}
                                            {formatNumber(log.totalDowntimeMinutes, 0)} phút
                                          </p>
                                        ) : null}
                                        {log.note ? (
                                          <p className="mt-1 truncate text-[11px] font-semibold text-zinc-500">
                                            {log.note}
                                          </p>
                                        ) : null}
                                        {log.parameterImageUrls.length > 0 ? (
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {log.parameterImageUrls.map(url => (
                                              <img
                                                key={url}
                                                src={url}
                                                alt="Ảnh thông số"
                                                className="h-14 w-20 rounded-md border border-zinc-200 object-cover"
                                              />
                                            ))}
                                          </div>
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
