import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Send, Trash2 } from 'lucide-react';
import type { AuthUser } from '../../components/LoginPage';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../../lib/appToast';
import { formatNumber } from '../../utils';
import { convertWarehouseQuantityToKg, mapMaterialToWeightCatalogItem } from '../../utils/warehouseWeight';
import { normalizeMachines, machineSelectValue, type MachineRow } from '../danh-sach-may';
import { normalizeMaterialsInventory, type MaterialRow } from '../kho-nvl';
import {
  formatProductionOrderShiftLabel,
  mapProductionOrderSettings,
  type ProductionOrderLookupSetting
} from '../ke-hoach-san-xuat';

type Line = { key: string; code: string; name: string; unit: string; qty: string };

const newLine = (): Line => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, code: '', name: '', unit: '', qty: '' });
const fieldClass =
  'mt-1 h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]';
const gridClass = 'grid grid-cols-[44px_minmax(150px,1.2fr)_minmax(160px,2fr)_70px_110px_110px_40px] items-center gap-2';
const readonlyClass = 'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-sm font-semibold text-zinc-700 outline-none';
const labelClass = 'block min-w-0 text-[11px] font-black uppercase tracking-wider text-zinc-500';

export function YeuCauXuatVatTuPanel({ currentUser }: { currentUser: AuthUser | null }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('');
  const [machine, setMachine] = useState('');
  const [requester, setRequester] = useState('');
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [settings, setSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const get = (url: string) => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
    void get('/api/danh-sach-may').then(d => d && setMachines(normalizeMachines(d)));
    void get('/api/cai-dat').then(d => d && setSettings(mapProductionOrderSettings(d)));
    void get('/api/kho-nvl?light=1').then(d => d && setMaterials(normalizeMaterialsInventory(d)));
  }, []);

  const shiftOptions = useMemo(
    () =>
      settings
        .filter(s => s.loaiCaiDat === 'Thời gian' || s.loaiCaiDat === 'Ca máy' || s.loaiCaiDat === 'Sản xuất' || /ca/i.test(s.name) || /ca/i.test(s.code))
        .map(s => s.name || s.code)
        .filter((name, i, arr) => name && arr.indexOf(name) === i),
    [settings]
  );

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const weightCatalog = useMemo(() => materials.map(mapMaterialToWeightCatalogItem), [materials]);

  const submit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/yeu-cau-xuat-kho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca: shift,
          may: machine,
          nguoi_yc: requester,
          lines: lines.map(l => ({ ma_nvl: l.code, ten_nvl: l.name, don_vi: l.unit, so_luong: Number(l.qty.replace(',', '.')) }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không gửi được yêu cầu.'));
      showAppToast(`Đã gửi yêu cầu ${data.ma_yeu_cau}. Thủ kho sẽ xác nhận ở Phiếu xuất nhập kho.`);
      setLines([newLine()]);
    } catch (error: any) {
      showSaveFailure(error, 'Không gửi được yêu cầu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-card sm:p-4">
      <h3 className="text-lg font-black text-zinc-900">Yêu cầu xuất vật tư</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      </div>
      <label className={labelClass}>
        Người yêu cầu *
        <input value={requester} onChange={e => setRequester(e.target.value)} placeholder="Nhập tên người yêu cầu" className={fieldClass} />
      </label>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] space-y-2">
          <div className={`${gridClass} rounded-lg bg-[#ef1b2d] py-2 text-[11px] font-black uppercase tracking-wider text-white`}>
            <span className="pl-2">STT</span>
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
                <span className="pl-2 text-lg font-black text-zinc-950">{index + 1}</span>
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
                  inputClassName="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-bold outline-none focus:border-[#ef1b2d]"
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
                  className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 px-2 text-right font-mono text-sm font-bold outline-none focus:border-[#ef1b2d]"
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
                  className="flex h-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-[#ef1b2d]"
                  aria-label="Xóa dòng"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setLines(prev => [...prev, newLine()])}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <Plus className="h-4 w-4" /> Thêm NVL
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSaving}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-black text-white hover:bg-[#b30d1c] disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Gửi yêu cầu
        </button>
      </div>
    </section>
  );
}

export default YeuCauXuatVatTuPanel;
