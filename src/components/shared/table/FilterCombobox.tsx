import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * Ô lọc dạng dropdown chọn 1 giá trị, có tìm kiếm.
 * Mẫu dùng chung được trích xuất từ trang Lệnh sản xuất (src/features/lenh-sx).
 */
export function FilterCombobox({
  label,
  options,
  value,
  onChange,
  searchPlaceholder = 'Tìm kiếm...',
  includeAll = true,
  compact = false,
  formatOption = (option: string) => option,
  searchable = true,
  alignDropdown = 'left',
  dropdownWidth = 'w-max min-w-full max-w-[calc(100vw-1rem)]',
  className = '',
  buttonClassName = ''
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  includeAll?: boolean;
  /** Chỉ hiển thị giá trị đang chọn trong ô, không thêm nhãn phía trước. */
  compact?: boolean;
  formatOption?: (option: string) => string;
  searchable?: boolean;
  alignDropdown?: 'left' | 'right';
  dropdownWidth?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option => option.toLowerCase().includes(normalizedQuery))
    : options;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${buttonClassName} ${
          value !== 'all'
            ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
        }`}
      >
        <span className="whitespace-nowrap">
          {value === 'all' ? label : compact ? formatOption(value) : `${label}: ${formatOption(value)}`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute top-[calc(100%+6px)] z-20 ${dropdownWidth} rounded-xl border border-zinc-200 bg-white p-2 shadow-lg ${
          alignDropdown === 'right' ? 'right-0' : 'left-0'
        }`}>
          {searchable && (
            <label className="flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
            </label>
          )}

          <div className={`${searchable ? 'mt-2' : ''} max-h-60 overflow-y-auto`}>
            {includeAll && <button
              type="button"
              onClick={() => {
                onChange('all');
                setOpen(false);
              }}
              className={`block w-full whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-red-50 ${
                value === 'all' ? 'font-black text-[#ef1b2d]' : 'font-semibold text-zinc-700'
              }`}
            >
              Tất cả
            </button>}
            {filteredOptions.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`block w-full whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-red-50 ${
                  value === option ? 'font-black text-[#ef1b2d]' : 'font-semibold text-zinc-700'
                }`}
              >
                {formatOption(option)}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-2.5 py-2 text-sm font-medium text-zinc-400">Không tìm thấy kết quả</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
