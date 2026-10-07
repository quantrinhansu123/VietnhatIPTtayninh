import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  isLoading,
  disabled,
  getLabel,
  getValue,
  getDisplayLabel,
  getSearchText,
  inputClassName,
  maxResults = 50,
  allowEmpty = true,
  onSelectOption,
  resolveSelectedItem,
  renderOption
}: {
  value: string;
  onChange: (value: string) => void;
  options: unknown[];
  placeholder: string;
  isLoading?: boolean;
  disabled?: boolean;
  getLabel: (item: unknown) => string;
  getValue: (item: unknown) => string;
  /** Nhãn hiển thị trong ô nhập (mặc định = getLabel). */
  getDisplayLabel?: (item: unknown) => string;
  /** Chuỗi dùng khi lọc gõ tìm (mặc định = getLabel). */
  getSearchText?: (item: unknown) => string;
  inputClassName?: string;
  maxResults?: number;
  allowEmpty?: boolean;
  onSelectOption?: (item: unknown | null) => void;
  resolveSelectedItem?: (options: unknown[], value: string) => unknown | null;
  /** Tùy biến cách hiển thị 1 dòng trong menu (mặc định dùng getLabel). */
  renderOption?: (item: unknown) => React.ReactNode;
}) {
  const fieldClass =
    inputClassName ||
    'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const displayLabel = getDisplayLabel ?? getLabel;
  const searchText = getSearchText ?? getLabel;

  const selectedItem = useMemo(() => {
    if (!value) return null;
    if (resolveSelectedItem) {
      return resolveSelectedItem(options, value);
    }
    return options.find(item => getValue(item) === value) ?? null;
  }, [options, value, getValue, resolveSelectedItem]);
  const selectedLabel = selectedItem ? displayLabel(selectedItem) : value;

  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery(selectedLabel);
    }
  }, [selectedLabel, open]);

  const filteredOptions = useMemo(() => {
    const normalized = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    if (!normalized) return options.slice(0, maxResults);
    const fold = (value: string) =>
      value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const valueMatches = options.filter(item => fold(getValue(item)).includes(normalized));
    const valueSet = new Set(valueMatches);
    const nameMatches = options.filter(item => !valueSet.has(item) && fold(searchText(item)).includes(normalized));
    return [...valueMatches, ...nameMatches].slice(0, maxResults);
  }, [options, query, searchText, getValue, maxResults]);

  const commitValue = (nextValue: string, item: unknown | null = null) => {
    const trimmed = nextValue.trim();
    onChange(trimmed);
    onSelectOption?.(item);
    if (item) {
      setQuery(displayLabel(item));
    } else if (trimmed) {
      const match = options.find(opt => getValue(opt) === trimmed);
      setQuery(match ? displayLabel(match) : trimmed);
    } else {
      setQuery('');
    }
    setOpen(false);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        if (allowEmpty) {
          commitValue('', null);
        } else {
          setQuery(selectedLabel);
          setOpen(false);
        }
        return;
      }

      const exactValue = options.find(item => getValue(item).toLowerCase() === normalized);
      if (exactValue) {
        commitValue(getValue(exactValue), exactValue);
        return;
      }

      const exactLabel = options.find(item => searchText(item).toLowerCase() === normalized);
      if (exactLabel) {
        commitValue(getValue(exactLabel), exactLabel);
        return;
      }

      if (resolveSelectedItem) {
        const resolved = resolveSelectedItem(options, normalized);
        if (resolved) {
          commitValue(getValue(resolved), resolved);
          return;
        }
      }

      if (filteredOptions.length === 1) {
        commitValue(getValue(filteredOptions[0]), filteredOptions[0]);
        return;
      }

      setQuery(selectedLabel);
      setOpen(false);
    }, 120);
  };

  const isDisabled = Boolean(disabled || isLoading);
  const emptyText = isLoading ? 'Đang tải...' : options.length === 0 ? 'Không có dữ liệu' : placeholder;

  const updateMenuPosition = () => {
    const element = inputRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    // Dùng visual viewport để menu bám đúng ô nhập khi bàn phím điện thoại mở.
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportWidth = visualViewport?.width ?? document.documentElement.clientWidth;
    const margin = 8;
    const width = Math.max(rect.width, Math.min(340, viewportWidth - margin * 2));
    const minLeft = viewportLeft + margin;
    const maxLeft = viewportLeft + viewportWidth - width - margin;
    const left = Math.min(Math.max(minLeft, rect.left), Math.max(minLeft, maxLeft));
    setMenuStyle({
      top: rect.bottom + 4,
      left,
      width
    });
  };

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('scroll', handleReposition, true);
    window.visualViewport?.addEventListener('resize', handleReposition);
    window.visualViewport?.addEventListener('scroll', handleReposition);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('scroll', handleReposition, true);
      window.visualViewport?.removeEventListener('resize', handleReposition);
      window.visualViewport?.removeEventListener('scroll', handleReposition);
    };
  }, [open, query, filteredOptions.length]);

  const dropdownPanelClass =
    'fixed z-[120] max-h-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg';

  const renderDropdown = () => {
    if (!open || isDisabled || !menuStyle) return null;

    if (filteredOptions.length > 0) {
      return createPortal(
        <div className={dropdownPanelClass} style={menuStyle}>
          {allowEmpty && !query.trim() && (
            <button
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => commitValue('', null)}
              className="block w-full px-3 py-2 text-left text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50"
            >
              {placeholder}
            </button>
          )}
          {filteredOptions.map((item, index) => {
            const optionValue = getValue(item);
            const optionLabel = getLabel(item);
            return (
              <button
                key={`${optionValue}-${index}`}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onClick={() => commitValue(optionValue, item)}
                className={`block w-full border-b border-zinc-100 px-3 py-2 text-left text-sm leading-snug transition last:border-b-0 hover:bg-red-50 ${
                  optionValue === value ? 'bg-red-50 font-black text-[#ef1b2d]' : 'font-semibold text-zinc-800'
                }`}
              >
                {renderOption ? renderOption(item) : optionLabel}
              </button>
            );
          })}
        </div>,
        document.body
      );
    }

    if (query.trim()) {
      return createPortal(
        <div className={dropdownPanelClass} style={menuStyle}>
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500">Không tìm thấy kết quả</div>
        </div>,
        document.body
      );
    }

    return null;
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!isDisabled) setOpen(true);
        }}
        onBlur={handleBlur}
        disabled={isDisabled}
        placeholder={emptyText}
        className={fieldClass}
      />
      {renderDropdown()}
    </div>
  );
}
