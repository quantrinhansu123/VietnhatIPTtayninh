import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';

function normalizeOption(value: string) {
  return String(value ?? '').trim();
}

export default function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Gõ để tìm hoặc chọn...',
  disabled,
  inputClassName
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const fieldClass =
    inputClassName ||
    'min-h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedSet = useMemo(() => new Set(values.map(normalizeOption).filter(Boolean)), [values]);

  const allOptions = useMemo(() => {
    const merged = new Set<string>();
    options.forEach(item => {
      const normalized = normalizeOption(item);
      if (normalized) merged.add(normalized);
    });
    values.forEach(item => {
      const normalized = normalizeOption(item);
      if (normalized) merged.add(normalized);
    });
    return [...merged].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [options, values]);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = normalized
      ? allOptions.filter(item => item.toLowerCase().includes(normalized))
      : allOptions;
    return list.slice(0, 50);
  }, [allOptions, query]);

  const trimmedQuery = normalizeOption(query);
  const canCreate =
    Boolean(trimmedQuery) &&
    !allOptions.some(item => item.toLowerCase() === trimmedQuery.toLowerCase());

  const updateMenuPosition = () => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width
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
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, query, filteredOptions.length, values.length]);

  const toggleValue = (value: string) => {
    const normalized = normalizeOption(value);
    if (!normalized) return;
    if (selectedSet.has(normalized)) {
      onChange(values.filter(item => normalizeOption(item) !== normalized));
      return;
    }
    onChange([...values, normalized]);
    setQuery('');
  };

  const removeValue = (value: string) => {
    const normalized = normalizeOption(value);
    onChange(values.filter(item => normalizeOption(item) !== normalized));
  };

  const addNewValue = () => {
    if (!trimmedQuery) return;
    if (!selectedSet.has(trimmedQuery)) {
      onChange([...values, trimmedQuery]);
    }
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const handleBlur = (event: React.FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    window.setTimeout(() => setOpen(false), 120);
  };

  const renderDropdown = () => {
    if (!open || disabled || !menuStyle) return null;

    return createPortal(
      <div
        className="fixed z-[120] max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
        style={menuStyle}
        onMouseDown={event => event.preventDefault()}
      >
        {filteredOptions.length === 0 && !canCreate ? (
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500">Không có lựa chọn phù hợp</div>
        ) : null}
        {filteredOptions.map(option => {
          const checked = selectedSet.has(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggleValue(option)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-red-50 ${
                checked ? 'bg-red-50/70 font-bold text-[#ef1b2d]' : 'font-semibold text-zinc-800'
              }`}
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checked ? 'border-[#ef1b2d] bg-[#ef1b2d] text-white' : 'border-zinc-300 bg-white'
                }`}
              >
                {checked ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          );
        })}
        {canCreate ? (
          <button
            type="button"
            onClick={addNewValue}
            className="block w-full border-t border-zinc-100 px-3 py-2 text-left text-sm font-bold text-[#ef1b2d] transition hover:bg-red-50"
          >
            Thêm &quot;{trimmedQuery}&quot;
          </button>
        ) : null}
      </div>,
      document.body
    );
  };

  return (
    <div ref={containerRef} className="relative space-y-2" onBlur={handleBlur}>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map(value => (
            <span
              key={value}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-[#ef1b2d]"
            >
              <span className="truncate">{value}</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => removeValue(value)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#ef1b2d] transition hover:bg-red-100"
                  title="Bỏ chọn"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter' && canCreate) {
            event.preventDefault();
            addNewValue();
          }
        }}
        disabled={disabled}
        placeholder={values.length > 0 ? 'Gõ thêm lý do...' : placeholder}
        className={fieldClass}
      />
      {renderDropdown()}
    </div>
  );
}
