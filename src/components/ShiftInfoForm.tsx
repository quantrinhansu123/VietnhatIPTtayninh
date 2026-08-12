import React, { useEffect, useMemo, useState } from 'react';
import { ShiftInfo, STANDARD_MACHINES } from '../types';
import { Cpu, Users, CalendarDays, UserCheck } from 'lucide-react';
import { getProductionShiftOptions, normalizeShiftSettings } from '../utils/shiftSettings';

interface ShiftInfoFormProps {
  data: ShiftInfo;
  onChange: (updated: Partial<ShiftInfo>) => void;
}

export default function ShiftInfoForm({ data, onChange }: ShiftInfoFormProps) {
  const [shiftSettings, setShiftSettings] = useState<ReturnType<typeof normalizeShiftSettings>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/cai-dat')
      .then(response => response.json())
      .then(payload => { if (!cancelled) setShiftSettings(normalizeShiftSettings(payload)); })
      .catch(() => { if (!cancelled) setShiftSettings([]); });
    return () => { cancelled = true; };
  }, []);
  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  return (
    <div className="space-y-6" id="shift-info-section">
      <div className="border-b border-slate-100 pb-3">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-emerald-600" />
          Thông tin Ca & Kíp Sản Xuất
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">Vui lòng cung cấp chi tiết ca máy và nhân lực vận hành chính</p>
      </div>

      {/* Máy Sản Xuất */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5" htmlFor="machineId">
          <Cpu className="w-4 h-4 text-slate-400" />
          Máy Sản Xuất <span className="text-rose-500">*</span>
        </label>
        <div className="relative">
          <select
            id="machineId"
            className="w-full h-12 px-3.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 text-sm font-medium transition cursor-pointer appearance-none"
            value={data.machineId}
            onChange={(e) => onChange({ machineId: e.target.value })}
            style={{ minHeight: '44px' }}
          >
            <option value="">-- Chọn máy đùn / dệt sọi --</option>
            {STANDARD_MACHINES.map((machine) => (
              <option key={machine} value={machine}>
                {machine}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Ca Làm Việc */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5" htmlFor="shiftName">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          Ca Trực <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
          {shiftOptions.map((shift) => {
            const isSelected = data.shiftName === shift.value;
            return (
              <button
                key={shift.value}
                type="button"
                id={`shift-opt-${shift.value.replace(/\s+/g, '-')}`}
                className={`flex text-left items-center p-3.5 rounded-xl border transition-all text-sm font-medium ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-800 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
                style={{ minHeight: '44px' }}
                onClick={() => onChange({ shiftName: shift.value })}
              >
                <span className={`w-4 h-4 rounded-full border mr-3 flex items-center justify-center transition-all ${
                  isSelected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
                {shift.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thợ Chính & Thợ Phụ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5" htmlFor="operatorName">
            <UserCheck className="w-4 h-4 text-slate-400" />
            Thợ Chính (Operator) <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="operatorName"
            className="w-full h-12 px-3.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 text-sm font-medium transition placeholder:text-slate-400"
            placeholder="Nhập họ tên thợ chính"
            style={{ minHeight: '44px' }}
            value={data.operatorName}
            onChange={(e) => onChange({ operatorName: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5" htmlFor="assistantName">
            <Users className="w-4 h-4 text-slate-400" />
            Thợ Phụ (Assistant) <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="assistantName"
            className="w-full h-12 px-3.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 text-sm font-medium transition placeholder:text-slate-400"
            placeholder="Nhập họ tên thợ phụ"
            style={{ minHeight: '44px' }}
            value={data.assistantName}
            onChange={(e) => onChange({ assistantName: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
