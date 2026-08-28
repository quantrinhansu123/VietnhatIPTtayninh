import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Loader2, Plus, Printer, Save, Trash2, Wand2, X } from 'lucide-react';
import {
  ShiftHandoverPrintBatchV2 as ShiftHandoverPrintBatch,
  slipToPrintSlip,
  type ShiftHandoverPrintSlip
} from './ShiftHandoverPrintSheetV2';
import ShiftHandoverMixingTable from './ShiftHandoverMixingTable';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { SearchableSelect } from './shared/SearchableSelect';
import {
  waitForPrintImagesReady,
  enablePortraitPrintPage,
  disablePortraitPrintPage
} from '../utils/printReady';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  type ShiftSetting
} from '../utils/shiftSettings';
import {
  buildClosingStockLinesFromMachineNvl,
  buildMixingMaterialLinesFromPhoiTron,
  parseMachineMixingRatios,
  pickHandoverMachineAndOperators
} from '../utils/shiftHandoverAutofill';
import { formatNumber } from '../utils';
import {
  SHIFT_HANDOVER_FORM_CODE,
  SHIFT_HANDOVER_FORM_EFFECTIVE,
  SHIFT_HANDOVER_FORM_ISSUE,
  buildChiTietPayload,
  defaultMixingMaterialLines,
  emptyClosingStockLine,
  emptyMixingMaterialLine,
  mixingLineHasData,
  normalizeShiftHandoverSlips,
  parseQty,
  sumClosingStockTotals,
  type ClosingStockLine,
  type HandoverFormTab,
  type MaterialCatalogOption,
  type MixingMaterialLine,
  type ShiftHandoverSlip
} from '../lib/shiftHandoverModel';
import { normalizeProductionOrders, type ProductionOrderRow } from '../features/ke-hoach-san-xuat';

export type { ShiftHandoverSlip } from '../lib/shiftHandoverModel';
export { normalizeShiftHandoverSlips } from '../lib/shiftHandoverModel';

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const cellClass =
  'h-9 w-full min-w-0 border-0 bg-transparent px-1.5 text-sm font-semibold text-zinc-800 outline-none focus:bg-red-50';

const cellCenterClass = `${cellClass} text-center`;

type MachineOption = { id: string; code: string; name: string; mixingRatios: unknown };
type StaffOption = { id: string; name: string; shift: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function displayNum(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '';
  return formatNumber(value, digits);
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
      return {
        id: String(row.id ?? code),
        code,
        name,
        mixingRatios: row.ty_le_tron ?? row.mixingRatios ?? []
      };
    })
    .filter((item): item is MachineOption => Boolean(item));
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

function normalizeCatalogMaterials(data: unknown): MaterialCatalogOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
      ? (data as { materials: unknown[] }).materials
      : [];
  const mapped = rows
    .map((item): MaterialCatalogOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim();
      const name = String(record.ten_npl ?? record.ten_nvl ?? record.name ?? '').trim();
      if (!code && !name) return null;
      return { code, name, unit: String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg' };
    })
    .filter((item): item is MaterialCatalogOption => Boolean(item));
  return mapped.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'vi'));
}

export default function ShiftHandoverPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogOption[]>([]);
  const [slips, setSlips] = useState<ShiftHandoverSlip[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [formTab, setFormTab] = useState<HandoverFormTab>('bao_cao');
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [operators, setOperators] = useState('');
  const [closingStockLines, setClosingStockLines] = useState<ClosingStockLine[]>([emptyClosingStockLine()]);
  const [materialLines, setMaterialLines] = useState<MixingMaterialLine[]>(defaultMixingMaterialLines());
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<ShiftHandoverPrintSlip | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const lastDateShiftKey = useRef('');

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 7000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const selectedMachine = useMemo(() => {
    const ref = machineRef.trim();
    if (!ref) return null;
    return (
      machines.find(m => m.code === ref) ??
      machines.find(m => m.name === ref) ??
      machines.find(m => `${m.code} · ${m.name}` === ref) ??
      null
    );
  }, [machineRef, machines]);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const filteredStaffOptions = useMemo(() => {
    if (!shift) return staffOptions;
    const filtered = staffOptions.filter(member => shiftMatches(member.shift, shift));
    return filtered.length > 0 ? filtered : staffOptions;
  }, [staffOptions, shift]);

  const closingStockTotals = useMemo(() => {
    const saved = closingStockLines.map((line, index) => ({
      stt: index + 1,
      itemCode: line.itemCode.trim(),
      itemName: line.itemName.trim(),
      unit: line.unit.trim(),
      quantity: parseQty(line.quantity),
      weightKg: parseQty(line.weightKg)
    }));
    return sumClosingStockTotals(saved);
  }, [closingStockLines]);

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
        const [machineRes, settingRes, staffRes, materialRes, slipRes, orderRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/kho-nvl'),
          fetch('/api/phieu-giao-ca?limit=50'),
          fetch('/api/lenh-sx')
        ]);
        const [machineData, settingData, staffData, materialData, slipData, orderData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          settingRes.json().catch(() => ({})),
          staffRes.json().catch(() => ({})),
          materialRes.json().catch(() => ({})),
          slipRes.json().catch(() => ({})),
          orderRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setShiftSettings(normalizeShiftSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (materialRes.ok) setMaterials(normalizeCatalogMaterials(materialData));
        if (slipRes.ok) setSlips(normalizeShiftHandoverSlips(slipData));
        if (orderRes.ok) setProductionOrders(normalizeProductionOrders(orderData));
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
    document.body.classList.add('shift-handover-print-active');
    enablePortraitPrintPage('shift-handover-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } catch {
          setPendingPrint(false);
          disablePortraitPrintPage('shift-handover-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('shift-handover-print-active');
      disablePortraitPrintPage('shift-handover-page-portrait');
    };
  }, [pendingPrint, printSlip]);

  useEffect(() => {
    if (!date || !shift || productionOrders.length === 0 || machines.length === 0) return;
    const key = `${date}|${shift}`;
    const dateShiftChanged = lastDateShiftKey.current !== key;
    lastDateShiftKey.current = key;

    const picked = pickHandoverMachineAndOperators({
      orders: productionOrders,
      date,
      shift,
      machines,
      machineCode: dateShiftChanged ? undefined : machineRef.trim() || undefined
    });

    if (dateShiftChanged && picked.machineCode) {
      setMachineRef(picked.machineCode);
    }
    if (picked.operators) setOperators(picked.operators);
  }, [date, shift, machineRef, productionOrders, machines]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shift-handover-print-active');
      setPrintSlip(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      document.body.classList.remove('shift-handover-print-active');
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const applyShiftTimes = (nextShift: string) => {
    setShift(nextShift);
    const setting = shiftSettings.find(
      item => item.name === nextShift || item.code === nextShift
    );
    if (setting?.startTime) setTimeFrom(setting.startTime);
    if (setting?.endTime) setTimeTo(setting.endTime);
  };

  const updateClosingStock = (key: string, patch: Partial<ClosingStockLine>) => {
    setClosingStockLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const formHasDetailData = () => {
    const hasClosing = closingStockLines.some(
      line =>
        line.itemCode.trim() ||
        line.itemName.trim() ||
        parseQty(line.quantity) !== null ||
        parseQty(line.weightKg) !== null
    );
    const hasMixing = materialLines.some(mixingLineHasData);
    return hasClosing || hasMixing;
  };

  const handleAutofill = async () => {
    setError('');
    setMessage('');
    if (!date || !shift) {
      setError('Chọn Ngày và Ca sản xuất trước khi tự động điền.');
      return;
    }
    const machineCode = selectedMachine?.code || machineRef.trim();
    const machineName = selectedMachine?.name || '';
    if (!machineCode && !machineName) {
      setError('Chọn Máy trước khi tự động điền bảng trộn vật tư.');
      return;
    }
    if (
      formHasDetailData() &&
      !window.confirm('Đã có dữ liệu trên form. Tự động điền sẽ ghi đè Tồn cuối ca và Bảng trộn vật tư. Tiếp tục?')
    ) {
      return;
    }

    setIsAutofilling(true);
    try {
      const nvlParams = new URLSearchParams({
        limit: '200',
        loai_bao_cao: 'cuoi_ca',
        ngay: date
      });
      if (machineCode) nvlParams.set('ma_may', machineCode);
      const mixingParams = new URLSearchParams({
        tu_ngay: date,
        den_ngay: date
      });
      if (machineCode) mixingParams.set('ma_may', machineCode);

      const [nvlRes, mixingRes] = await Promise.all([
        fetch(`/api/bao-cao-may-nvl-ton?${nvlParams.toString()}`),
        fetch(`/api/bao-cao-phoi-tron?${mixingParams.toString()}`)
      ]);
      const [nvlData, mixingData] = await Promise.all([
        nvlRes.json().catch(() => ({})),
        mixingRes.json().catch(() => ({}))
      ]);

      if (!nvlRes.ok) {
        throw new Error(readApiErrorMessage(nvlRes, nvlData, 'Không tải được tồn cuối ca.'));
      }
      if (!mixingRes.ok) {
        throw new Error(readApiErrorMessage(mixingRes, mixingData, 'Không tải được phiếu trộn.'));
      }

      const nextClosing = buildClosingStockLinesFromMachineNvl({
        reports: nvlData,
        date,
        shift,
        machineCode,
        machineName
      });
      const nextMixing = buildMixingMaterialLinesFromPhoiTron({
        reports: mixingData,
        date,
        shift,
        machineCode,
        machineName,
        mixingRatios: selectedMachine?.mixingRatios
      });

      setClosingStockLines(nextClosing);
      setMaterialLines(nextMixing);

      const filledClosing = nextClosing.filter(
        line => line.itemCode.trim() || line.itemName.trim() || parseQty(line.quantity) !== null
      ).length;
      const filledMixing = nextMixing.filter(mixingLineHasData).length;
      const okMsg =
        filledMixing > 0
          ? `Đã điền: ${filledClosing} dòng tồn cuối ca · ${filledMixing} NVL từ phiếu trộn.`
          : `Đã điền: ${filledClosing} dòng tồn cuối ca. Không có phiếu trộn cho Ngày + Ca + Máy này.`;
      setMessage(okMsg);
      showAppToast(okMsg);
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể tự động điền.'));
    } finally {
      setIsAutofilling(false);
    }
  };

  const handlePrint = (slip: ShiftHandoverPrintSlip) => {
    setError('');
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const resetForm = () => {
    setClosingStockLines([emptyClosingStockLine()]);
    setMaterialLines(defaultMixingMaterialLines());
    setNote('');
  };

  const saveSlip = async () => {
    setError('');
    setMessage('');

    if (!date || !shift || !operators.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày, ca sản xuất và người thực hiện.'));
      return;
    }

    const chiTiet = buildChiTietPayload({
      timeFrom,
      timeTo,
      products: [],
      scraps: [],
      closingStockLines,
      materials: materialLines,
      kpis: []
    });
    setIsSaving(true);
    try {
      const res = await fetch('/api/phieu-giao-ca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca_giao: shift,
          gio_tu: timeFrom.trim(),
          gio_den: timeTo.trim(),
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          nguoi_giao_ca: operators.trim(),
          nguoi_thuc_hien: operators.trim(),
          ghi_chu_chung: note.trim(),
          chi_tiet: chiTiet,
          thanh_pham: chiTiet.thanh_pham,
          hang_loi: chiTiet.hang_loi,
          ton_cuoi_ca: chiTiet.ton_cuoi_ca,
          vat_tu: chiTiet.vat_tu,
          bao_cao_cuoi_ca: chiTiet.bao_cao_cuoi_ca
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
      setMessage('');
      setError(data.error || 'Không thể xóa phiếu.');
      return;
    }
    setSlips(prev => prev.filter(slip => slip.id !== id));
    setError('');
    setMessage('Đã xóa phiếu.');
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {printSlip && typeof document !== 'undefined'
        ? createPortal(<ShiftHandoverPrintBatch slips={[printSlip]} />, document.body)
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
              <h1 className="text-xl font-black text-zinc-900">Phiếu giao ca</h1>
              <p className="text-xs font-semibold text-zinc-500">
                Nhật ký sản xuất kiêm phiếu giao ca · {SHIFT_HANDOVER_FORM_CODE}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-[#ef1b2d] bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ef1b2d]">
                  Nhật ký sản xuất
                </p>
                <h2 className="text-base font-black uppercase text-zinc-950 sm:text-lg">
                  Nhật ký sản xuất kiêm phiếu giao ca
                </h2>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-bold text-zinc-600">
                <p>Ký hiệu: {SHIFT_HANDOVER_FORM_CODE}</p>
                <p>Lần BH: {SHIFT_HANDOVER_FORM_ISSUE} · Ngày HL: {SHIFT_HANDOVER_FORM_EFFECTIVE}</p>
              </div>
            </div>

            <div className="p-4">
              {error && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  <span className="min-w-0">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
                    title="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {message && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <span className="min-w-0">{message}</span>
                  <button
                    type="button"
                    onClick={() => setMessage('')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
                    title="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ngày *
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ca sản xuất *
                  <div className="mt-1">
                    <SearchableSelect
                      value={shift}
                      onChange={applyShiftTimes}
                      options={shiftOptions}
                      placeholder="Chọn ca"
                      searchPlaceholder="Tìm ca..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      getValue={item => String((item as { value?: string }).value ?? item)}
                      getLabel={item => String((item as { label?: string }).label ?? item)}
                    />
                  </div>
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Từ giờ
                  <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Đến giờ
                  <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Máy
                  <div className="mt-1">
                    <SearchableSelect
                      value={machineRef}
                      onChange={setMachineRef}
                      options={machines}
                      placeholder="Chọn máy"
                      searchPlaceholder="Tìm mã hoặc tên máy..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      getValue={item => (item as MachineOption).code}
                      getLabel={item => {
                        const machine = item as MachineOption;
                        return machine.code ? `${machine.code} · ${machine.name}` : machine.name;
                      }}
                      getSearchText={item => {
                        const machine = item as MachineOption;
                        return `${machine.code} ${machine.name}`.trim();
                      }}
                    />
                  </div>
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Người thực hiện *
                  <div className="mt-1">
                    <SearchableSelect
                      value={operators}
                      onChange={setOperators}
                      options={filteredStaffOptions}
                      placeholder="Chọn hoặc nhập tên"
                      searchPlaceholder="Tìm người thực hiện..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      allowCustomValue
                      getValue={item => (item as StaffOption).name}
                      getLabel={item => (item as StaffOption).name}
                      getSearchText={item => {
                        const staff = item as StaffOption;
                        return `${staff.name} ${staff.shift}`.trim();
                      }}
                    />
                  </div>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleAutofill()}
                  disabled={isAutofilling || isLoading || isSaving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
                  title="Điền Tồn cuối ca và Bảng trộn vật tư theo Ngày + Ca + Máy"
                >
                  {isAutofilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-[#ef1b2d]" />}
                  {isAutofilling ? 'Đang điền...' : 'Tự động điền'}
                </button>
              </div>

              <div className="mt-4 flex gap-1 border-b border-zinc-200">
                {(
                  [
                    { id: 'bao_cao' as const, label: 'Tồn cuối ca' },
                    { id: 'vat_tu' as const, label: 'Bảng trộn vật tư' }
                  ]
                ).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFormTab(tab.id)}
                    className={`-mb-px rounded-t-lg border px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
                      formTab === tab.id
                        ? 'border-zinc-200 border-b-white bg-white text-[#ef1b2d]'
                        : 'border-transparent text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {formTab === 'bao_cao' ? (
                <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">
                    Số lượng tồn cuối ca
                  </h3>
                  <button
                    type="button"
                    onClick={() => setClosingStockLines(prev => [...prev, emptyClosingStockLine()])}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm dòng
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-[720px] w-full border-collapse text-xs">
                    <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="border border-zinc-200 px-2 py-1.5 text-left">Mã NVL</th>
                        <th className="border border-zinc-200 px-2 py-1.5 text-left">Tên NVL</th>
                        <th className="w-20 border border-zinc-200 px-2 py-1.5">ĐVT</th>
                        <th className="w-28 border border-zinc-200 px-2 py-1.5">Số lượng</th>
                        <th className="w-28 border border-zinc-200 px-2 py-1.5">TL (kg)</th>
                        <th className="w-9 border border-zinc-200" />
                      </tr>
                    </thead>
                    <tbody>
                      {closingStockLines.map(line => (
                        <tr key={line.key} className="odd:bg-white even:bg-zinc-50/70">
                          <td className="min-w-[120px] border border-zinc-200 p-0.5">
                            <input
                              value={line.itemCode}
                              onChange={e => updateClosingStock(line.key, { itemCode: e.target.value })}
                              className={cellClass}
                              placeholder="Mã"
                            />
                          </td>
                          <td className="min-w-[180px] border border-zinc-200 p-0.5">
                            <input
                              value={line.itemName}
                              onChange={e => updateClosingStock(line.key, { itemName: e.target.value })}
                              className={cellClass}
                              placeholder="Tên vật tư"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.unit}
                              onChange={e => updateClosingStock(line.key, { unit: e.target.value })}
                              className={cellCenterClass}
                              placeholder="kg"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.quantity}
                              onChange={e => updateClosingStock(line.key, { quantity: e.target.value })}
                              className={cellCenterClass}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.weightKg}
                              onChange={e => updateClosingStock(line.key, { weightKg: e.target.value })}
                              className={cellCenterClass}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border border-zinc-200 text-center">
                            {closingStockLines.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setClosingStockLines(prev => prev.filter(item => item.key !== line.key))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                                title="Xóa dòng"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-zinc-100 font-black text-zinc-800">
                        <td colSpan={3} className="border border-zinc-200 px-2 py-2 text-right uppercase">
                          Tổng cộng
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(closingStockTotals.quantity)}
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(closingStockTotals.weightKg)}
                        </td>
                        <td className="border border-zinc-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              ) : (
                <div className="mt-5">
                  <ShiftHandoverMixingTable
                    lines={materialLines}
                    materials={materials}
                    mixingRatios={parseMachineMixingRatios(selectedMachine?.mixingRatios)}
                    isLoading={isLoading}
                    onChange={(key, patch) =>
                      setMaterialLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)))
                    }
                    onAdd={() => setMaterialLines(prev => [...prev, emptyMixingMaterialLine()])}
                    onRemove={key => setMaterialLines(prev => prev.filter(line => line.key !== key))}
                  />
                </div>
              )}

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ghi chú
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className={`${fieldClass} mt-1`}
                    placeholder="Ghi chú thêm (tuỳ chọn)"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={saveSlip}
                  disabled={isSaving || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Đang lưu phiếu...' : 'Lưu phiếu'}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-zinc-900">Lịch sử phiếu</h2>
              <ClipboardList className="h-5 w-5 text-[#ef1b2d]" />
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
                      <p className="font-black text-zinc-900">{slip.slipCode || slip.shift || 'Phiếu giao ca'}</p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {slip.date} · {slip.shift}
                        {slip.timeFrom || slip.timeTo ? ` (${slip.timeFrom || '?'}–${slip.timeTo || '?'})` : ''} ·{' '}
                        {slip.machineName || slip.machineCode || 'Chung'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-zinc-600">
                        {slip.operators || '—'} · {slip.products.length} mã hàng ·{' '}
                        {displayNum(slip.products.reduce((sum, line) => sum + (line.quantity ?? 0), 0))} cuộn
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
