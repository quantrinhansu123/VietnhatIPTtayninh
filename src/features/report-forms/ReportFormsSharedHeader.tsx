import React from 'react';
import { renderMachineSelect } from '../danh-sach-may';
import { useReportFormsShared } from './ReportFormsSharedContext';

const fieldClass =
  'mt-0.5 h-8 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-red-500/10';
const labelClass = 'block min-w-0 text-[10px] font-black uppercase tracking-wider text-zinc-500';

export function ReportFormsSharedHeader() {
  const shared = useReportFormsShared();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-2 shadow-card sm:p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
        <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">
          Thông tin chung · áp dụng mọi tab
        </p>
        {shared.isLoadingOptions ? (
          <span className="text-[10px] font-semibold text-slate-400">Đang tải ca / máy...</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-8">
        <label className={labelClass}>
          Ngày
          <input
            type="date"
            value={shared.ngay}
            onChange={event => shared.setNgay(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Giờ
          <input
            type="time"
            value={shared.gio}
            onChange={event => shared.setGio(event.target.value)}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Ca
          <select
            value={shared.ca}
            onChange={event => shared.setCa(event.target.value)}
            className={fieldClass}
          >
            <option value="">Chọn ca</option>
            {shared.shiftOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Chi nhánh
          <input
            value={shared.chiNhanh}
            onChange={event => shared.setChiNhanh(event.target.value)}
            className={fieldClass}
            placeholder="HCM"
          />
        </label>
        <label className={`${labelClass} col-span-2 sm:col-span-1 lg:col-span-1`}>
          Máy
          <div className="mt-0.5 min-w-0">
            {renderMachineSelect(shared.machineRef, shared.setMachineRef, shared.machines, {
              placeholder: 'Chọn máy',
              isLoading: shared.isLoadingOptions,
              inputClassName: fieldClass.replace(/^mt-0\.5\s+/, '')
            })}
          </div>
        </label>
        <div className={`${labelClass} col-span-2 sm:col-span-2 lg:col-span-2`}>
          Nhân sự
          <div className="mt-0.5 flex max-h-20 min-h-8 min-w-0 flex-wrap content-start gap-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-1">
            {!shared.ngay || !shared.ca || !shared.machineRef.trim() ? (
              <p className="flex items-center px-1 text-[10px] font-semibold leading-tight text-zinc-400">
                Chọn ngày, ca và máy trước
              </p>
            ) : shared.staffOptions.length === 0 ? (
              <p className="flex items-center px-1 text-[10px] font-semibold leading-tight text-zinc-400">
                Không có nhân sự theo máy/ca/ngày
              </p>
            ) : (
              shared.staffOptions.map(option => {
                const checked = shared.staffNames.includes(option);
                return (
                  <label
                    key={option}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                      checked
                        ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                        : 'border-zinc-200 bg-white text-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => shared.toggleStaffName(option)}
                      className="h-3 w-3 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                    <span className="font-bold">{option}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <label className={`${labelClass} col-span-2 sm:col-span-1 lg:col-span-1`}>
          Ghi chú
          <input
            value={shared.ghiChu}
            onChange={event => shared.setGhiChu(event.target.value)}
            placeholder="Ghi chú chung"
            className={fieldClass}
          />
        </label>
      </div>
    </section>
  );
}
