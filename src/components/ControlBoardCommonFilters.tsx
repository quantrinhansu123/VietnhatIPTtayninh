import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { MachineRow } from '../features/danh-sach-may';

const inputClass =
  'h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-800 outline-none transition focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 sm:text-xs';

export type ControlBoardProductionOrderOption = {
  code: string;
  label: string;
};

function ProductionOrderSearchFilter({
  value,
  query,
  onValueChange,
  onQueryChange,
  options,
  disabled
}: {
  value: string;
  query: string;
  onValueChange: (value: string) => void;
  onQueryChange: (query: string) => void;
  options: ControlBoardProductionOrderOption[];
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => (value && value !== 'all' ? options.find(option => option.code === value) ?? null : null),
    [options, value]
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, '');
    return options.filter(option => {
      const haystack = `${option.code} ${option.label}`.toLowerCase();
      if (haystack.includes(normalizedQuery)) return true;
      if (!compactQuery) return false;
      return haystack.replace(/[^a-z0-9]/g, '').includes(compactQuery);
    });
  }, [options, normalizedQuery]);

  const clearSelection = () => {
    onQueryChange('');
    onValueChange('all');
    setOpen(false);
  };

  const pickOption = (code: string, label: string) => {
    onQueryChange(label);
    onValueChange(code);
    setOpen(false);
  };

  const displayValue = selected && !open ? selected.label : query;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={displayValue}
          disabled={disabled}
          placeholder="Gõ mã / tìm lệnh SX..."
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            setOpen(true);
            if (selected) onQueryChange(selected.code);
          }}
          onChange={event => {
            const next = event.target.value;
            onQueryChange(next);
            setOpen(true);
            if (!next.trim()) {
              onValueChange('all');
              return;
            }
            const exact = options.find(option => option.code.toLowerCase() === next.trim().toLowerCase());
            onValueChange(exact ? exact.code : 'all');
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const first = filtered[0];
              if (first) pickOption(first.code, first.label);
            }
          }}
          className={`${inputClass} w-full pl-7 pr-8`}
        />
        {query || (value && value !== 'all') ? (
          <button
            type="button"
            disabled={disabled}
            onClick={clearSelection}
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            title="Xóa lọc lệnh SX"
            aria-label="Xóa lọc lệnh SX"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={clearSelection}
            className={`flex w-full px-3 py-2 text-left text-xs font-bold transition hover:bg-zinc-50 ${
              value === 'all' && !query.trim() ? 'bg-sky-50 text-sky-800' : 'text-zinc-600'
            }`}
          >
            Tất cả lệnh SX
            {filtered.length > 0 && query.trim() ? (
              <span className="ml-auto font-semibold text-zinc-400">{filtered.length} kết quả</span>
            ) : null}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs font-semibold text-zinc-400">Không tìm thấy lệnh SX.</p>
          ) : (
            filtered.map(option => (
              <button
                key={option.code}
                type="button"
                onClick={() => pickOption(option.code, option.label)}
                className={`flex w-full px-3 py-2 text-left text-xs font-semibold transition hover:bg-sky-50 ${
                  value === option.code ? 'bg-sky-50 font-black text-sky-900' : 'text-zinc-800'
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export type ControlBoardDateScope = 'all' | 'range';

export function ControlBoardCommonFilters({
  dateScope = 'range',
  onDateScopeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  shift,
  onShiftChange,
  shiftOptions,
  formatShiftLabel,
  machine,
  onMachineChange,
  machines,
  productionOrder,
  productionOrderQuery,
  onProductionOrderChange,
  onProductionOrderQueryChange,
  productionOrderOptions,
  onClear,
  isLoading
}: {
  dateScope?: ControlBoardDateScope;
  onDateScopeChange?: (value: ControlBoardDateScope) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  shift: string;
  onShiftChange: (value: string) => void;
  shiftOptions: string[];
  formatShiftLabel?: (shift: string) => string;
  machine: string;
  onMachineChange: (value: string) => void;
  machines: MachineRow[];
  productionOrder: string;
  productionOrderQuery: string;
  onProductionOrderChange: (value: string) => void;
  onProductionOrderQueryChange: (value: string) => void;
  productionOrderOptions: ControlBoardProductionOrderOption[];
  onClear: () => void;
  isLoading?: boolean;
}) {
  const dateInputsDisabled = isLoading || dateScope === 'all';
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-2.5 shadow-sm sm:p-3">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-end">
        <div className="flex min-w-0 items-center justify-between gap-3 xl:w-44 xl:shrink-0 xl:items-end">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">Phạm vi dữ liệu</p>
            <p className="truncate text-sm font-black text-zinc-950">Bộ lọc chung</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={isLoading}
            className="h-8 shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-[11px] font-black text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Xóa lọc
          </button>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 lg:grid-cols-3 xl:grid-cols-[minmax(118px,0.7fr)_minmax(126px,0.8fr)_minmax(126px,0.8fr)_minmax(110px,0.7fr)_minmax(150px,1fr)_minmax(230px,1.35fr)]">
        <label className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Ngày</span>
          <select
            value={dateScope}
            onChange={event => onDateScopeChange?.(event.target.value as ControlBoardDateScope)}
            disabled={isLoading}
            className={`${inputClass} w-full`}
            title="Tất cả: lấy mọi dòng kể cả không có Ngày / không chênh lệch"
          >
            <option value="all">Tất cả</option>
            <option value="range">Theo khoảng</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Từ ngày</span>
          <input
            type="date"
            value={dateFrom}
            onChange={event => onDateFromChange(event.target.value)}
            disabled={dateInputsDisabled}
            className={`${inputClass} w-full disabled:bg-zinc-50 disabled:text-zinc-400`}
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Đến ngày</span>
          <input
            type="date"
            value={dateTo}
            onChange={event => onDateToChange(event.target.value)}
            disabled={dateInputsDisabled}
            className={`${inputClass} w-full disabled:bg-zinc-50 disabled:text-zinc-400`}
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Ca</span>
          <select
            value={shift}
            onChange={event => onShiftChange(event.target.value)}
            disabled={isLoading}
            className={`${inputClass} w-full`}
          >
            <option value="all">Tất cả ca</option>
            {shiftOptions.map(shiftName => (
              <option key={shiftName} value={shiftName}>
                {formatShiftLabel ? formatShiftLabel(shiftName) : shiftName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Máy</span>
          <select
            value={machine}
            onChange={event => onMachineChange(event.target.value)}
            disabled={isLoading}
            className={`${inputClass} w-full`}
          >
            <option value="all">Tất cả máy</option>
            {machines
              .filter(row => row.code && row.code !== '-')
              .sort((a, b) => a.code.localeCompare(b.code, 'vi'))
              .map(row => (
                <option key={row.id || row.code} value={row.code}>
                  {row.code}
                  {row.name && row.name !== '-' ? ` · ${row.name}` : ''}
                </option>
              ))}
          </select>
        </label>
        <div className="col-span-2 space-y-0.5 lg:col-span-1 xl:col-span-1">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Lệnh sản xuất</span>
          <ProductionOrderSearchFilter
            value={productionOrder}
            query={productionOrderQuery}
            onValueChange={onProductionOrderChange}
            onQueryChange={onProductionOrderQueryChange}
            options={productionOrderOptions}
            disabled={isLoading}
          />
        </div>
        </div>
      </div>
    </section>
  );
}
