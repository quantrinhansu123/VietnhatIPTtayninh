import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { DateInput } from '../DateInput';

/**
 * Khung bộ lọc dùng chung phía trên bảng: viền bo tròn, các control cùng hàng, nút "Xóa lọc".
 * Mẫu dùng chung được trích xuất từ trang Lệnh sản xuất (src/features/lenh-sx).
 */
export function TableToolbar({
  children,
  hasActiveFilters,
  onResetFilters,
  isLoading,
  loadError,
  actionMessage
}: {
  children: ReactNode;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  isLoading?: boolean;
  loadError?: string;
  actionMessage?: string;
}) {
  return (
    <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm overflow-visible">
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
        {children}

        {isLoading && (
          <div className="flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-bold text-zinc-500">
            Đang tải...
          </div>
        )}

        {hasActiveFilters && onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-black text-zinc-600 transition hover:border-[#ef1b2d] hover:text-[#ef1b2d]"
          >
            Xóa lọc
          </button>
        )}
      </div>

      {loadError && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {loadError}
        </p>
      )}
      {actionMessage && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          {actionMessage}
        </p>
      )}
    </section>
  );
}

/** Ô tìm kiếm dạng pill dùng chung, đặt đầu tiên trong TableToolbar. */
export function TableSearchInput({
  value,
  onChange,
  placeholder = 'Tìm kiếm...',
  disabled,
  fullWidthOnMobile = true
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  fullWidthOnMobile?: boolean;
}) {
  return (
    <label className={`flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10 ${fullWidthOnMobile ? 'w-full basis-full lg:basis-0' : 'w-auto basis-0'}`}>
      <Search className="h-4 w-4 text-zinc-400" />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
      />
    </label>
  );
}

/** Ô lọc khoảng ngày dùng chung ("Từ ngày" / "Đến ngày"). */
export function TableDateFilter({
  label,
  value,
  onChange,
  className = 'shrink-0',
  inputMinWidthClassName = 'min-w-[8.5rem]'
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Bề rộng tối thiểu của riêng ô ngày (không tính nhãn) — lịch chọn ngày rộng bằng ô này. */
  inputMinWidthClassName?: string;
}) {
  return (
    <label className={`flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 ${className}`}>
      <span className="shrink-0 text-xs font-bold uppercase text-zinc-400">{label}</span>
      <DateInput
        value={value}
        onChange={onChange}
        aria-label={label}
        wrapperClassName={`relative inline-flex flex-1 items-center ${inputMinWidthClassName}`}
        className="min-w-0 flex-1 bg-transparent pr-8 font-mono text-sm font-semibold text-zinc-900 placeholder:font-sans placeholder:text-zinc-400 focus:outline-none"
      />
    </label>
  );
}
