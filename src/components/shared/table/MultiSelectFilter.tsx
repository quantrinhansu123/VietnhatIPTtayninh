import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * Ô lọc dạng dropdown chọn nhiều giá trị (checkbox), có tìm kiếm.
 * Mẫu dùng chung được trích xuất từ bộ lọc "Máy" của trang Lệnh sản xuất (src/features/lenh-sx).
 */
export function MultiSelectFilter({
  label,
  allLabel,
  searchPlaceholder = 'Tìm kiếm...',
  emptyLabel = 'Không tìm thấy kết quả',
  options,
  values,
  onChange,
  alignDropdown = 'left',
  className = '',
  buttonClassName = '',
  dropdownWidth = 'w-max min-w-full max-w-[calc(100vw-1rem)]'
}: {
  /** Nhãn hiển thị khi chưa chọn gì, vd. "Máy" */
  label: string;
  /** Nhãn dòng "chọn tất cả", vd. "Tất cả máy" */
  allLabel?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  /** Canh menu xổ sang cạnh trái hoặc phải của nút lọc. */
  alignDropdown?: 'left' | 'right';
  /** Class bố cục cho vùng chứa combobox. */
  className?: string;
  /** Class bố cục cho nút mở combobox. */
  buttonClassName?: string;
  /** Chiều rộng menu xổ, mặc định tự co theo nội dung. */
  dropdownWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
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
  const triggerLabel = values.length === 0 ? label : values.length === 1 ? values[0] : `${values.length} ${label.toLowerCase()}`;

  const toggleValue = (item: string) => {
    onChange(values.includes(item) ? values.filter(existing => existing !== item) : [...values, item]);
  };

  return (
    <div ref={containerRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${buttonClassName} ${
          values.length > 0
            ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
        }`}
      >
        <span className="max-w-40 truncate whitespace-nowrap">{triggerLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute top-[calc(100%+6px)] z-30 ${dropdownWidth} rounded-xl border border-zinc-200 bg-white p-2 shadow-lg ${
          alignDropdown === 'right' ? 'right-0' : 'left-0'
        }`}>
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

          <div className="mt-2 max-h-64 overflow-y-auto">
            <label className="flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-red-50">
              <input
                type="checkbox"
                checked={values.length === 0}
                onChange={() => onChange([])}
                className="h-4 w-4 accent-[#ef1b2d]"
              />
              {allLabel ?? `Tất cả ${label.toLowerCase()}`}
            </label>
            {filteredOptions.map(item => (
              <label
                key={item}
                className="flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-red-50"
              >
                <input
                  type="checkbox"
                  checked={values.includes(item)}
                  onChange={() => toggleValue(item)}
                  className="h-4 w-4 accent-[#ef1b2d]"
                />
                <span>{item}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-2.5 py-2 text-sm font-medium text-zinc-400">{emptyLabel}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
