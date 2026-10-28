import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ClipboardList, Loader2, Plus, Save, Trash2, Wand2 } from 'lucide-react';
import type { AuthUser } from '../../components/LoginPage';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { formatNumber } from '../../utils';
import { shiftNamesMatch } from '../../utils/shiftSettings';
import { convertWarehouseQuantityToKg, mapMaterialToWeightCatalogItem } from '../../utils/warehouseWeight';
import { parseProductionOrderFilterDate, splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import { normalizeMachines, machineSelectValue, type MachineRow } from '../danh-sach-may';
import { normalizeMaterialsInventory, type MaterialRow } from '../kho-nvl';
import {
  formatProductionOrderShiftLabel,
  mapProductionOrderSettings,
  normalizeProductionOrders,
  resolveProductionOrderMachine,
  type ProductionOrderLookupSetting,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { normalizeWarehouseMovements } from '../phieu-xuat-nhap-kho';
import { useReportFormsSharedOptional } from '../report-forms/ReportFormsSharedContext';
import type { MaterialRequestRow } from './MaterialRequestListView';
import {
  buildMaterialRequestPresetLines,
  MATERIAL_REQUEST_PRESET_TABS,
  type MaterialRequestPresetKind
} from './materialRequestPreset';

type Line = { key: string; code: string; name: string; unit: string; qty: string };

const lineKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const newLine = (): Line => ({ key: lineKey(), code: '', name: '', unit: '', qty: '' });
const presetLines = (materials: MaterialRow[], kind: MaterialRequestPresetKind): Line[] =>
  buildMaterialRequestPresetLines(materials, lineKey, kind);
const fieldClass =
  'mt-0.5 h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-red-500/10';
const gridClass = 'grid grid-cols-[36px_minmax(130px,1.2fr)_minmax(140px,2fr)_60px_96px_96px_36px] items-center gap-1.5';
const readonlyClass = 'h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold text-zinc-700 outline-none';
const labelClass = 'block min-w-0 text-[10px] font-black uppercase tracking-wider text-zinc-500';

function collectOrderStaffNames(order: ProductionOrderRow): string[] {
  return [
    ...splitProductionOrderStaffNames(order.staff),
    ...splitProductionOrderStaffNames(order.shiftLead),
    ...splitProductionOrderStaffNames(order.mainStaff),
    ...splitProductionOrderStaffNames(order.assistantStaff),
    ...splitProductionOrderStaffNames(order.traineeStaff)
  ];
}

function rowDateKey(ngay: string | null | undefined) {
  const match = String(ngay || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function YeuCauXuatVatTuPanel({
  currentUser,
  editRequest,
  onEditConsumed,
  onBack,
  onOpenList
}: {
  currentUser: AuthUser | null;
  editRequest?: MaterialRequestRow | null;
  onEditConsumed?: () => void;
  onBack?: () => void;
  onOpenList?: () => void;
}) {
  const hubShared = useReportFormsSharedOptional();
  const hideLocalHeader = Boolean(hubShared);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('');
  const [machine, setMachine] = useState('');
  const [requester, setRequester] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [settings, setSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [presetApplied, setPresetApplied] = useState(false);
  const [presetKind, setPresetKind] = useState<MaterialRequestPresetKind>('bb');

  useEffect(() => {
    const get = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    void get('/api/danh-sach-may').then(d => d && setMachines(normalizeMachines(d)));
    void get('/api/cai-dat').then(d => d && setSettings(mapProductionOrderSettings(d)));
    void get('/api/kho-nvl?light=1').then(d => d && setMaterials(normalizeMaterialsInventory(d)));
    void get('/api/lenh-sx?light=1').then(d => d && setProductionOrders(normalizeProductionOrders(d)));
  }, []);

  /** Phiếu mới: tự sổ mẫu mã đề xuất theo tab Order máy (chỉ điền SL). */
  useEffect(() => {
    if (editingCode || editRequest || presetApplied || materials.length === 0) return;
    setLines(presetLines(materials, presetKind));
    setPresetApplied(true);
  }, [editingCode, editRequest, materials, presetApplied, presetKind]);

  const shiftOptions = useMemo(
    () =>
      settings
        .filter(s => s.loaiCaiDat === 'Thời gian' || s.loaiCaiDat === 'Ca máy' || s.loaiCaiDat === 'Sản xuất' || /ca/i.test(s.name) || /ca/i.test(s.code))
        .map(s => s.name || s.code)
        .filter((name, i, arr) => name && arr.indexOf(name) === i),
    [settings]
  );

  const staffOptions = useMemo(() => {
    if (!date) return [];
    const matched = productionOrders.filter(order => {
      const orderDate = parseProductionOrderFilterDate(order.startDate);
      if (orderDate && orderDate !== date) return false;
      if (shift && order.shift && order.shift !== '-' && !shiftNamesMatch(order.shift, shift)) return false;
      if (machine.trim()) {
        const orderMachine = resolveProductionOrderMachine(order, machines);
        if (orderMachine && orderMachine !== '-' && orderMachine !== machine.trim()) return false;
      }
      return true;
    });
    return Array.from(new Set(matched.flatMap(collectOrderStaffNames))).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [date, machine, machines, productionOrders, shift]);

  useEffect(() => {
    if (hubShared || editingCode) return;
    if (!date) {
      setRequester('');
      return;
    }
    if (staffOptions.length === 1) {
      setRequester(staffOptions[0]);
      return;
    }
    setRequester(prev => (prev && staffOptions.includes(prev) ? prev : ''));
  }, [date, editingCode, hubShared, staffOptions]);

  useEffect(() => {
    if (!hubShared || editingCode) return;
    setDate(hubShared.ngay);
    setShift(hubShared.ca);
    setMachine(hubShared.machineRef);
    setRequester(hubShared.staffNames[0] || hubShared.staffText || '');
  }, [
    editingCode,
    hubShared,
    hubShared?.ngay,
    hubShared?.ca,
    hubShared?.machineRef,
    hubShared?.staffNames,
    hubShared?.staffText
  ]);

  useEffect(() => {
    if (!editRequest) return;
    const code = String(editRequest.ma_yeu_cau || '').trim();
    if (!code) return;
    setEditingCode(code);
    setDate(rowDateKey(editRequest.ngay) || new Date().toISOString().slice(0, 10));
    setShift(String(editRequest.ca || '').trim());
    setMachine(String(editRequest.may || '').trim());
    setRequester(String(editRequest.nguoi_yc || '').trim());
    const nextLines = (Array.isArray(editRequest.lines) ? editRequest.lines : [])
      .map(line => ({
        key: `${code}-${line.ma_nvl}-${Math.random().toString(36).slice(2, 7)}`,
        code: String(line.ma_nvl || '').trim(),
        name: String(line.ten_nvl || '').trim(),
        unit: String(line.don_vi || '').trim(),
        qty: line.so_luong != null && Number.isFinite(Number(line.so_luong)) ? String(line.so_luong) : ''
      }))
      .filter(line => line.code);
    setLines(nextLines.length > 0 ? nextLines : [newLine()]);
    onEditConsumed?.();
  }, [editRequest, onEditConsumed]);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const weightCatalog = useMemo(() => materials.map(mapMaterialToWeightCatalogItem), [materials]);

  const applyPreset = (kind: MaterialRequestPresetKind = presetKind) => {
    setPresetKind(kind);
    setLines(presetLines(materials, kind));
    setPresetApplied(true);
    const tabLabel = MATERIAL_REQUEST_PRESET_TABS.find(tab => tab.id === kind)?.label || kind;
    showAppToast(`Đã sổ mẫu «${tabLabel}» — chỉ cần điền số lượng.`);
  };

  const resetForm = () => {
    setEditingCode(null);
    setLines(materials.length > 0 ? presetLines(materials, presetKind) : [newLine()]);
    setPresetApplied(materials.length > 0);
  };

  const submit = async () => {
    setIsSaving(true);
    try {
      const filledLines = lines
        .map(l => ({
          ma_nvl: l.code.trim(),
          ten_nvl: l.name.trim(),
          don_vi: l.unit.trim(),
          so_luong: Number(String(l.qty).replace(',', '.'))
        }))
        .filter(l => l.ma_nvl && Number.isFinite(l.so_luong) && l.so_luong > 0);
      if (filledLines.length === 0) {
        showAppToast('Nhập số lượng lớn hơn 0 cho ít nhất một mã NVL.', 'error');
        return;
      }
      const payload = {
        ngay: date,
        ca: shift,
        may: machine,
        nguoi_yc: requester,
        lines: filledLines
      };
      const res = await fetch(
        editingCode
          ? `/api/yeu-cau-xuat-kho/${encodeURIComponent(editingCode)}`
          : '/api/yeu-cau-xuat-kho',
        {
          method: editingCode ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không lưu được yêu cầu.'));
      const wasEditing = Boolean(editingCode);
      const code = String(data.ma_yeu_cau || editingCode || '').trim();
      showAppToast(
        wasEditing
          ? `Đã cập nhật yêu cầu ${code}.`
          : `Đã lưu yêu cầu ${code}. Thủ kho sẽ xác nhận ở Phiếu xuất nhập kho.`
      );
      resetForm();
      if (wasEditing && onOpenList) onOpenList();
    } catch (error: unknown) {
      showSaveFailure(error, 'Không lưu được yêu cầu.');
    } finally {
      setIsSaving(false);
    }
  };

  const autofillFromWarehouseExport = async () => {
    if (!date || !shift || !machine.trim()) {
      showAppToast('Chọn đủ Ngày · Ca · Máy trước khi tự động điền.', 'error');
      return;
    }
    const machineRef = machine.trim();
    setIsAutofilling(true);
    try {
      const params = new URLSearchParams({
        loai: 'xuat',
        loai_kho: 'nvl',
        from: date,
        to: date
      });
      const res = await fetch(`/api/kho/lich-su?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được phiếu xuất kho NVL.'));

      const movements = normalizeWarehouseMovements(data).filter(row => {
        if (row.slipType !== 'xuat' || row.warehouseKind !== 'nvl') return false;
        if (!row.itemCode || !(row.quantity > 0)) return false;
        if (!row.shift || !shiftNamesMatch(row.shift, shift)) return false;
        const slipMachine = String(row.machine || '').trim();
        if (!slipMachine || slipMachine !== machineRef) return false;
        return true;
      });

      if (movements.length === 0) {
        showAppToast(`Không có phiếu xuất kho NVL ngày ${date} · ca ${shift} · máy ${machineRef}.`, 'error');
        return;
      }

      const byCode = new Map<string, { code: string; name: string; unit: string; qty: number }>();
      for (const row of movements) {
        const code = row.itemCode.trim();
        const catalog = materials.find(m => m.code === code);
        const prev = byCode.get(code);
        const qty = Number(row.quantity) || 0;
        if (prev) {
          prev.qty += qty;
          if (!prev.name && (row.itemName || catalog?.name)) prev.name = row.itemName || catalog?.name || '';
          if ((!prev.unit || prev.unit === '-') && (row.unit || catalog?.unit)) {
            prev.unit = row.unit !== '-' ? row.unit : catalog?.unit || prev.unit;
          }
        } else {
          byCode.set(code, {
            code,
            name: row.itemName || catalog?.name || '',
            unit: (row.unit && row.unit !== '-' ? row.unit : '') || catalog?.unit || '',
            qty
          });
        }
      }

      const nextLines = [...byCode.values()]
        .sort((a, b) => a.code.localeCompare(b.code, 'vi'))
        .map(item => ({
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          code: item.code,
          name: item.name,
          unit: item.unit,
          qty: String(item.qty)
        }));

      setLines(nextLines.length > 0 ? nextLines : [newLine()]);
      const slipCount = new Set(movements.map(m => m.slipCode).filter(Boolean)).size;
      showAppToast(`Đã điền ${nextLines.length} NVL từ ${slipCount} phiếu xuất kho NVL.`);
    } catch (error: any) {
      showSaveFailure(error, 'Không tự động điền từ phiếu xuất kho NVL.');
    } finally {
      setIsAutofilling(false);
    }
  };

  const saveButton = (
    <button
      type="button"
      onClick={() => void submit()}
      disabled={isSaving || isAutofilling}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-black text-white shadow-sm hover:bg-[#b30d1c] disabled:opacity-50"
    >
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {isSaving ? 'Đang lưu...' : editingCode ? 'Cập nhật' : 'Lưu'}
    </button>
  );

  return (
    <section className="space-y-2 rounded-md border border-slate-200 bg-white p-2 shadow-card sm:p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-zinc-900">
            {editingCode ? `Sửa phiếu nhận NVL · ${editingCode}` : 'Nhận vật tư về máy'}
          </h3>
          {editingCode ? (
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">Chỉ sửa được phiếu còn chờ xử lý.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenList ? (
            <button
              type="button"
              onClick={onOpenList}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Danh sách
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Quay lại
            </button>
          ) : null}
          {saveButton}
        </div>
      </div>
      {!hideLocalHeader ? (
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <label className={labelClass}>
          Ngày
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Ca
          <select value={shift} onChange={e => setShift(e.target.value)} className={fieldClass}>
            <option value="">Chọn ca</option>
            {shiftOptions.map(o => (
              <option key={o} value={o}>
                {formatProductionOrderShiftLabel(o, settings)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Máy
          <select value={machine} onChange={e => setMachine(e.target.value)} className={fieldClass}>
            <option value="">Chọn máy</option>
            {machines.map(m => (
              <option key={machineSelectValue(m)} value={machineSelectValue(m)}>
                {machineSelectValue(m)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Người yêu cầu *
          <select
            value={requester}
            onChange={e => setRequester(e.target.value)}
            className={fieldClass}
            disabled={!date}
          >
            <option value="">
              {!date
                ? 'Chọn ngày trước'
                : staffOptions.length === 0 && !requester
                  ? 'Không có nhân sự theo ngày'
                  : 'Chọn người yêu cầu...'}
            </option>
            {requester && !staffOptions.includes(requester) ? (
              <option value={requester}>{requester}</option>
            ) : null}
            {staffOptions.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      ) : (
        <p className="text-[11px] font-semibold text-zinc-500">
          Người yêu cầu: <span className="font-bold text-zinc-800">{requester || '—'}</span>
          <span className="text-zinc-400"> · lấy từ thông tin chung</span>
        </p>
      )}

      {!editingCode ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Mẫu mã</span>
          {MATERIAL_REQUEST_PRESET_TABS.map(tab => {
            const active = presetKind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => applyPreset(tab.id)}
                disabled={isAutofilling || isSaving}
                className={`inline-flex h-8 items-center rounded-md border px-3 text-[11px] font-bold transition disabled:opacity-50 ${
                  active
                    ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[700px] space-y-1.5">
          <div className={`${gridClass} rounded-md bg-[#ef1b2d] py-1.5 text-[10px] font-black uppercase tracking-wider text-white`}>
            <span className="pl-1.5">STT</span>
            <span>Mã NVL</span>
            <span>Tên NVL</span>
            <span>ĐVT</span>
            <span className="text-right">Số lượng</span>
            <span className="text-right">Quy đổi kg</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const kg = convertWarehouseQuantityToKg({
              quantity: Number(line.qty.replace(',', '.')),
              unit: line.unit,
              itemCode: line.code,
              warehouseKind: 'nvl',
              materials: weightCatalog
            });
            return (
              <div key={line.key} className={gridClass}>
                <span className="pl-1.5 text-sm font-black text-zinc-950">{index + 1}</span>
                <div className="min-w-0">
                <SearchableSelect
                  value={line.code}
                  onChange={value => updateLine(line.key, { code: value, name: '', unit: '' })}
                  options={materials}
                  placeholder="Chọn mã NVL"
                  preferValueMatch
                  displaySelectedAsValue
                  matchDropdownWidth
                  autoFlip
                  inputClassName="h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-bold outline-none focus:border-[#ef1b2d]"
                  getLabel={item => (item as MaterialRow).code}
                  getSearchText={item => `${(item as MaterialRow).code} ${(item as MaterialRow).name}`}
                  getOptionLabel={item => `${(item as MaterialRow).code} — ${(item as MaterialRow).name}`}
                  getValue={item => (item as MaterialRow).code}
                  onSelectOption={item => {
                    const m = item as MaterialRow | null;
                    if (m) updateLine(line.key, { code: m.code, name: m.name, unit: m.unit });
                  }}
                />
                </div>
                <input readOnly value={line.name} placeholder="Tên NVL" className={`${readonlyClass} truncate`} title={line.name} />
                <input readOnly value={line.unit} placeholder="ĐVT" className={`${readonlyClass}`} />
                <input
                  inputMode="decimal"
                  value={line.qty}
                  onChange={e => updateLine(line.key, { qty: e.target.value })}
                  placeholder="Số lượng"
                  className="h-8 w-full min-w-0 rounded-md border border-zinc-200 px-2 text-right font-mono text-xs font-bold outline-none focus:border-[#ef1b2d]"
                />
                <input
                  readOnly
                  placeholder="Quy đổi kg"
                  value={kg === null ? '' : formatNumber(kg, 3)}
                  title={line.unit && line.qty && kg === null ? 'Chưa có Tổng kg trong kho NVL cho mã này' : undefined}
                  className={`${readonlyClass} text-right font-mono font-black`}
                />
                <button
                  type="button"
                  onClick={() => setLines(prev => (prev.length > 1 ? prev.filter(l => l.key !== line.key) : prev))}
                  className="flex h-8 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-[#ef1b2d]"
                  aria-label="Xóa dòng"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setLines(prev => [...prev, newLine()])}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 px-2.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm NVL
        </button>
        <button
          type="button"
          onClick={() => applyPreset(presetKind)}
          disabled={isAutofilling || isSaving || Boolean(editingCode)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Sổ lại mẫu đang chọn
        </button>
        <button
          type="button"
          onClick={() => void autofillFromWarehouseExport()}
          disabled={isAutofilling || isSaving}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {isAutofilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          Tự động điền từ Phiếu xuất kho NVL
        </button>
        {saveButton}
      </div>
    </section>
  );
}

export default YeuCauXuatVatTuPanel;
