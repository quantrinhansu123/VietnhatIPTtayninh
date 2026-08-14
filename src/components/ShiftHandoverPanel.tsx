import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  Loader2,
  Printer,
  Save,
  Trash2
} from 'lucide-react';
import {
  ShiftHandoverPrintBatch,
  buildShiftHandoverPrintSlip,
  type ShiftHandoverPrintSlip
} from './ShiftHandoverPrintSheet';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { RepeatableLineRow, RepeatableLinesBlock } from './RepeatableLinesBlock';
import { waitForPrintImagesReady } from '../utils/printReady';

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const PRIORITY_OPTIONS = ['Thường', 'Khẩn cấp'];
const STATUS_OPTIONS = ['Chưa xử lý', 'Đã xử lý'];

type MachineOption = { id: string; code: string; name: string };
type SettingOption = { name: string; code: string; loaiCaiDat: string };
type StaffOption = { id: string; name: string; shift: string };

type HandoverLine = {
  key: string;
  content: string;
  priority: string;
  assignee: string;
  status: string;
  note: string;
};

type SavedHandoverLine = {
  stt: number;
  content: string;
  priority: string;
  assignee: string;
  status: string;
  note: string;
};

export type ShiftHandoverSlip = {
  id: string;
  slipCode: string;
  date: string;
  shift: string;
  nextShift: string;
  machineCode: string;
  machineName: string;
  handoverBy: string;
  receivedBy: string;
  productionStatus: string;
  output: string;
  machineStatus: string;
  endingStock: string;
  note: string;
  lines: SavedHandoverLine[];
  createdAt: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): HandoverLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    content: '',
    priority: 'Thường',
    assignee: '',
    status: 'Chưa xử lý',
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

function shiftMatches(orderShift: string, selectedShift: string) {
  if (!orderShift || !selectedShift) return false;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
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

export function normalizeShiftHandoverSlips(data: unknown): ShiftHandoverSlip[] {
  const slips = (data as { slips?: unknown })?.slips;
  if (!Array.isArray(slips)) return [];

  return slips
    .map((item): ShiftHandoverSlip | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawLines = Array.isArray(record.chi_tiet) ? record.chi_tiet : [];
      const lines = rawLines
        .map((line, index): SavedHandoverLine | null => {
          if (!line || typeof line !== 'object') return null;
          const detail = line as Record<string, unknown>;
          return {
            stt: Number(detail.stt ?? index + 1) || index + 1,
            content: String(detail.noi_dung ?? '').trim(),
            priority: String(detail.muc_do ?? '').trim(),
            assignee: String(detail.nguoi_phu_trach ?? '').trim(),
            status: String(detail.trang_thai ?? '').trim(),
            note: String(detail.ghi_chu ?? '').trim()
          };
        })
        .filter((line): line is SavedHandoverLine => Boolean(line));

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.so_phieu ?? '').trim(),
        date: String(record.ngay ?? '').slice(0, 10),
        shift: String(record.ca_giao ?? '').trim(),
        nextShift: String(record.ca_nhan ?? '').trim(),
        machineCode: String(record.ma_may ?? '').trim(),
        machineName: String(record.ten_may ?? '').trim(),
        handoverBy: String(record.nguoi_giao_ca ?? '').trim(),
        receivedBy: String(record.nguoi_nhan_ca ?? '').trim(),
        productionStatus: String(record.tinh_hinh_san_xuat ?? '').trim(),
        output: String(record.san_luong_dat_duoc ?? '').trim(),
        machineStatus: String(record.tinh_trang_may_moc ?? '').trim(),
        endingStock: String(record.ton_kho_cuoi_ca ?? '').trim(),
        note: String(record.ghi_chu_chung ?? '').trim(),
        lines,
        createdAt: String(record.created_at ?? '').trim()
      };
    })
    .filter((slip): slip is ShiftHandoverSlip => Boolean(slip));
}

function slipToPrintSlip(slip: ShiftHandoverSlip): ShiftHandoverPrintSlip {
  return buildShiftHandoverPrintSlip({
    slipCode: slip.slipCode,
    date: slip.date,
    shift: slip.shift,
    nextShift: slip.nextShift,
    machineCode: slip.machineCode,
    machineName: slip.machineName,
    handoverBy: slip.handoverBy,
    receivedBy: slip.receivedBy,
    productionStatus: slip.productionStatus,
    output: slip.output,
    machineStatus: slip.machineStatus,
    endingStock: slip.endingStock,
    note: slip.note,
    lines: slip.lines.map(line => ({
      content: line.content,
      priority: line.priority,
      assignee: line.assignee,
      status: line.status,
      note: line.note
    }))
  });
}

export default function ShiftHandoverPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [settings, setSettings] = useState<SettingOption[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [slips, setSlips] = useState<ShiftHandoverSlip[]>([]);
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState('');
  const [nextShift, setNextShift] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [handoverBy, setHandoverBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [productionStatus, setProductionStatus] = useState('');
  const [output, setOutput] = useState('');
  const [machineStatus, setMachineStatus] = useState('');
  const [endingStock, setEndingStock] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<HandoverLine[]>([emptyLine()]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<ShiftHandoverPrintSlip | null>(null);
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

  const loadSlips = async () => {
    const res = await fetch('/api/phieu-giao-ca?limit=50');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSlips(normalizeShiftHandoverSlips(data));
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [machineRes, settingRes, staffRes, slipRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/phieu-giao-ca?limit=50')
        ]);
        const [machineData, settingData, staffData, slipData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          settingRes.json().catch(() => ({})),
          staffRes.json().catch(() => ({})),
          slipRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setSettings(normalizeSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (slipRes.ok) setSlips(normalizeShiftHandoverSlips(slipData));
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

  const updateLine = (key: string, patch: Partial<HandoverLine>) => {
    setLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const buildCurrentPrintSlip = (slipCode = '') =>
    buildShiftHandoverPrintSlip({
      slipCode,
      date,
      shift,
      nextShift,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      handoverBy,
      receivedBy,
      productionStatus,
      output,
      machineStatus,
      endingStock,
      note,
      lines
    });

  const handlePrint = (slip: ShiftHandoverPrintSlip) => {
    setError('');
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const resetForm = () => {
    setLines([emptyLine()]);
    setProductionStatus('');
    setOutput('');
    setMachineStatus('');
    setEndingStock('');
    setNote('');
  };

  const saveSlip = async () => {
    setError('');
    setMessage('');

    const payloadLines = lines
      .map((line, index) => ({
        stt: index + 1,
        noi_dung: line.content.trim(),
        muc_do: line.priority.trim(),
        nguoi_phu_trach: line.assignee.trim(),
        trang_thai: line.status.trim(),
        ghi_chu: line.note.trim()
      }))
      .filter(line => line.noi_dung);

    if (!date || !shift || !handoverBy.trim() || !receivedBy.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày, ca giao, người giao ca và người nhận ca.'));
      return;
    }

    const printPayload = buildCurrentPrintSlip();

    setIsSaving(true);
    try {
      const res = await fetch('/api/phieu-giao-ca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca_giao: shift,
          ca_nhan: nextShift.trim(),
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          nguoi_giao_ca: handoverBy.trim(),
          nguoi_nhan_ca: receivedBy.trim(),
          tinh_hinh_san_xuat: productionStatus.trim(),
          san_luong_dat_duoc: output.trim(),
          tinh_trang_may_moc: machineStatus.trim(),
          ton_kho_cuoi_ca: endingStock.trim(),
          ghi_chu_chung: note.trim(),
          chi_tiet: payloadLines
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu giao ca.'));

      const slipCode = String(data.slip?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu phiếu ${slipCode}.` : 'Đã lưu phiếu giao ca.';
      setMessage(okMsg);
      showAppToast(okMsg);
      resetForm();
      await loadSlips();
      handlePrint({ ...printPayload, slipCode: slipCode || printPayload.slipCode });
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể lưu phiếu.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSlip = async (id: string) => {
    if (!id || !window.confirm('Xóa phiếu giao ca này?')) return;
    const res = await fetch(`/api/phieu-giao-ca/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
      {printSlip && <ShiftHandoverPrintBatch slips={[printSlip]} />}

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
              <h1 className="text-xl font-black text-zinc-900">Phiếu giao ca</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 border-b border-zinc-100 pb-3">
              <ArrowLeftRight className="h-5 w-5 text-[#ef1b2d]" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-950">PHIẾU GIAO CA</h2>
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
                Ca giao *
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
                Ca nhận
                <select value={nextShift} onChange={e => setNextShift(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn ca nhận</option>
                  {shiftOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Máy / Chuyền
                <select value={machineRef} onChange={e => setMachineRef(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn máy (tuỳ chọn)</option>
                  {machines.map(machine => (
                    <option key={machine.id} value={machine.code}>
                      {machine.code ? `${machine.code} · ${machine.name}` : machine.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Người giao ca *
                <select value={handoverBy} onChange={e => setHandoverBy(e.target.value)} className={`${fieldClass} mt-1`} disabled={isLoading}>
                  <option value="">Chọn nhân sự</option>
                  {filteredStaffOptions.map(staff => (
                    <option key={staff.id} value={staff.name}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Người nhận ca *
                <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Tên người nhận ca" />
              </label>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Tình hình sản xuất trong ca
                <textarea
                  value={productionStatus}
                  onChange={e => setProductionStatus(e.target.value)}
                  rows={2}
                  className="mt-1 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                  placeholder="Mô tả tiến độ, sản lượng, sự cố chính..."
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Tình trạng máy móc / thiết bị
                <textarea
                  value={machineStatus}
                  onChange={e => setMachineStatus(e.target.value)}
                  rows={2}
                  className="mt-1 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                  placeholder="Bình thường / có vấn đề cần lưu ý..."
                />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Sản lượng đạt được
                <input value={output} onChange={e => setOutput(e.target.value)} className={`${fieldClass} mt-1`} placeholder="VD: 1.200 kg / 800 cuộn" />
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Tồn kho NVL / thành phẩm cuối ca
                <input value={endingStock} onChange={e => setEndingStock(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Ghi chú tồn kho bàn giao" />
              </label>
            </div>

            <div className="mt-4">
              <RepeatableLinesBlock
                title="Công việc / sự cố bàn giao"
                onAdd={() => setLines(prev => [...prev, emptyLine()])}
                columns={[
                  { key: 'stt', label: 'STT', className: 'w-10 shrink-0 text-center' },
                  { key: 'content', label: 'Nội dung bàn giao', className: 'min-w-0 flex-[1.4]' },
                  { key: 'priority', label: 'Mức độ', className: 'w-32 shrink-0' },
                  { key: 'assignee', label: 'Người phụ trách', className: 'min-w-0 flex-[0.9]' },
                  { key: 'status', label: 'Trạng thái', className: 'w-32 shrink-0' },
                  { key: 'note', label: 'Ghi chú', className: 'min-w-0 flex-[0.9]' },
                  { key: 'actions', label: '', className: 'w-9 shrink-0' }
                ]}
              >
                {lines.map((line, index) => (
                  <RepeatableLineRow key={line.key}>
                    <div className="flex w-10 shrink-0 items-center justify-center text-sm font-black text-[#ef1b2d]">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-[1.4]">
                      <input value={line.content} onChange={e => updateLine(line.key, { content: e.target.value })} className={fieldClass} placeholder="Việc cần bàn giao / sự cố tồn đọng" />
                    </div>
                    <div className="w-32 shrink-0">
                      <select value={line.priority} onChange={e => updateLine(line.key, { priority: e.target.value })} className={fieldClass}>
                        {PRIORITY_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 flex-[0.9]">
                      <input value={line.assignee} onChange={e => updateLine(line.key, { assignee: e.target.value })} className={fieldClass} placeholder="Người phụ trách" />
                    </div>
                    <div className="w-32 shrink-0">
                      <select value={line.status} onChange={e => updateLine(line.key, { status: e.target.value })} className={fieldClass}>
                        {STATUS_OPTIONS.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
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
              <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Ghi chú chung
                <input value={note} onChange={e => setNote(e.target.value)} className={`${fieldClass} mt-1`} placeholder="Ghi chú thêm (tuỳ chọn)" />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePrint(buildCurrentPrintSlip())}
                disabled={isLoading}
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
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-zinc-900">Lịch sử phiếu</h2>
              </div>
              <ArrowLeftRight className="h-5 w-5 text-[#ef1b2d]" />
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
                      <p className="font-black text-zinc-900">{slip.slipCode || `${slip.shift} → ${slip.nextShift || '?'}`}</p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {slip.date} · {slip.shift}
                        {slip.nextShift ? ` → ${slip.nextShift}` : ''} · {slip.machineName || slip.machineCode || 'Chung'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-zinc-600">
                        {slip.handoverBy || '—'} → {slip.receivedBy || '—'} · {slip.lines.length} việc bàn giao
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
