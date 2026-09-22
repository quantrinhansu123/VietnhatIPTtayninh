import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

const VIEWPORT_GAP = 8;

/**
 * Ô lọc dạng dropdown chọn 1 giá trị, có tìm kiếm.
 * Menu render qua portal (fixed) để không bị cắt bởi overflow của section cha.
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
  dropdownWidth = 'w-max min-w-[12rem] max-w-[min(24rem,calc(100vw-1rem))]',
  matchButtonWidth = false,
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
  matchButtonWidth?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    minWidth: number;
    width?: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const positionMenu = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 280;
    const menuWidth = matchButtonWidth
      ? Math.min(rect.width, window.innerWidth - VIEWPORT_GAP * 2)
      : Math.max(rect.width, menuRef.current?.offsetWidth ?? 192);
    const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - menuWidth - VIEWPORT_GAP);
    const fitsBelow = rect.bottom + 6 + menuHeight <= window.innerHeight - VIEWPORT_GAP;
    const top = fitsBelow
      ? rect.bottom + 6
      : Math.max(VIEWPORT_GAP, rect.top - menuHeight - 6);
    const left =
      alignDropdown === 'right'
        ? Math.min(
            Math.max(VIEWPORT_GAP, rect.right - menuWidth),
            maxLeft
          )
        : Math.min(
            Math.max(VIEWPORT_GAP, rect.left),
            maxLeft
          );
    setMenuStyle({
      top,
      left,
      minWidth: rect.width,
      ...(matchButtonWidth ? { width: menuWidth } : {})
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    positionMenu();
  }, [open, options.length, query, alignDropdown, matchButtonWidth]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleViewportChange = () => positionMenu();
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, alignDropdown]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option =>
        `${option} ${formatOption(option)}`.toLowerCase().includes(normalizedQuery)
      )
    : options;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
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

      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              className={`fixed z-[200] ${dropdownWidth} rounded-xl border border-zinc-200 bg-white p-2 shadow-lg`}
              style={{ top: menuStyle.top, left: menuStyle.left, minWidth: menuStyle.minWidth, width: menuStyle.width }}
            >
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
                {includeAll ? (
                  <button
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
                  </button>
                ) : null}
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
                {filteredOptions.length === 0 ? (
                  <div className="px-2.5 py-2 text-sm font-medium text-zinc-400">
                    Không tìm thấy kết quả
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
