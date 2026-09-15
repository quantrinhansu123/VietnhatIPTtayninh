import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DateYmd,
  formatIsoToDdMmYyyy,
  formatYmd,
  maskDdMmYyyyInput,
  parseDateToYmd,
  parseDdMmYyyyToIso
} from '../../utils/dateFormat';

const MONTH_NAMES = [
  'Một',
  'Hai',
  'Ba',
  'Tư',
  'Năm',
  'Sáu',
  'Bảy',
  'Tám',
  'Chín',
  'Mười',
  'Mười một',
  'Mười hai'
];
const WEEKDAY_LABELS = ['H', 'B', 'T', 'N', 'S', 'B', 'C'];
const CALENDAR_HEIGHT = 320;

const getToday = (): DateYmd => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

/** Ô ngày luôn hiện/nhập dd/mm/yyyy; value onChange vẫn là YYYY-MM-DD. */
export function DateInput({
  value,
  onChange,
  className = '',
  wrapperClassName = 'relative block w-full',
  disabled,
  required,
  id,
  name,
  'aria-label': ariaLabel
}: {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
}) {
  const selectedDate = parseDateToYmd(value);
  const [text, setText] = useState(() => formatIsoToDdMmYyyy(value));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initialDate = selectedDate ?? getToday();
    return { year: initialDate.year, month: initialDate.month };
  });
  const [calendarStyle, setCalendarStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(formatIsoToDdMmYyyy(value));
  }, [value]);

  useEffect(() => {
    if (!calendarOpen) {
      setCalendarStyle(null);
      return;
    }

    const updatePosition = () => {
      const anchor = wrapperRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      let boundary = anchor.parentElement;
      let boundaryRect: DOMRect | null = null;
      while (boundary && boundary !== document.body) {
        const styles = window.getComputedStyle(boundary);
        const clipsContent = [styles.overflow, styles.overflowX, styles.overflowY].some(value =>
          ['hidden', 'auto', 'scroll', 'clip'].includes(value)
        );
        if (clipsContent) {
          boundaryRect = boundary.getBoundingClientRect();
          break;
        }
        boundary = boundary.parentElement;
      }

      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const bounds = boundaryRect ?? new DOMRect(viewportLeft, viewportTop, viewportRight - viewportLeft, viewportBottom - viewportTop);
      const width = Math.min(rect.width, Math.max(0, bounds.width - 16));
      const minLeft = bounds.left + 8;
      const maxLeft = Math.max(minLeft, bounds.right - width - 8);
      const left = Math.max(minLeft, Math.min(rect.left, maxLeft));
      const height = calendarRef.current?.offsetHeight || CALENDAR_HEIGHT;
      const below = rect.bottom + 4;
      const top = below + height <= bounds.bottom - 8
        ? below
        : Math.max(bounds.top + 8, rect.top - height - 4);

      setCalendarStyle({ top, left, width });
    };

    updatePosition();
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !calendarRef.current?.contains(target)) {
        setCalendarOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCalendarOpen(false);
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [calendarOpen, visibleMonth]);

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange('');
      setText('');
      return;
    }
    const iso = parseDdMmYyyyToIso(trimmed);
    if (iso) {
      onChange(iso);
      setText(formatIsoToDdMmYyyy(iso));
      return;
    }
    setText(formatIsoToDdMmYyyy(value));
  };

  const toggleCalendar = () => {
    if (disabled) return;
    const date = selectedDate ?? getToday();
    setVisibleMonth({ year: date.year, month: date.month });
    setCalendarOpen(open => !open);
  };

  const moveMonth = (offset: number) => {
    setVisibleMonth(current => {
      const next = new Date(Date.UTC(current.year, current.month - 1 + offset, 1));
      const year = next.getUTCFullYear();
      if (year < 1900 || year > 2100) return current;
      return { year, month: next.getUTCMonth() + 1 };
    });
  };

  const selectDate = (date: DateYmd) => {
    const iso = formatYmd(date);
    onChange(iso);
    setText(formatIsoToDdMmYyyy(iso));
    setCalendarOpen(false);
  };

  const clearDate = () => {
    onChange('');
    setText('');
    setCalendarOpen(false);
  };

  const monthStart = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1));
  const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 0)).getUTCDate();
  const selectedIso = selectedDate ? formatYmd(selectedDate) : '';
  const todayIso = formatYmd(getToday());
  const calendarDates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(visibleMonth.year, visibleMonth.month - 1, index - firstWeekday + 1));
    return {
      date: {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
      },
      inCurrentMonth: index >= firstWeekday && index < firstWeekday + daysInMonth
    };
  });

  const calendarPopup = calendarOpen && calendarStyle
    ? createPortal(
        <div
          ref={calendarRef}
          role="dialog"
          aria-label="Chọn ngày"
          className="fixed z-[300] overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-300 bg-white text-zinc-900 shadow-xl"
          style={{ ...calendarStyle, maxHeight: 'calc(100vh - 16px)' }}
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-2 py-1.5">
            <span className="truncate px-1 text-sm font-bold">
              Tháng {MONTH_NAMES[visibleMonth.month - 1]} {visibleMonth.year}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="Tháng trước"
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-100"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="Tháng sau"
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-100"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-0.5 px-2 pt-2">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={`${label}-${index}`} className="flex h-7 items-center justify-center text-xs font-semibold text-zinc-500">
                {label}
              </span>
            ))}
            {calendarDates.map(({ date, inCurrentMonth }) => {
              const iso = formatYmd(date);
              const isSelected = iso === selectedIso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-label={`${date.day}/${date.month}/${date.year}`}
                  aria-pressed={isSelected}
                  className={`flex aspect-square min-w-0 items-center justify-center rounded-md text-sm transition ${
                    isSelected
                      ? 'bg-sky-500 font-bold text-white'
                      : isToday
                        ? 'border border-sky-400 text-sky-700'
                        : inCurrentMonth
                          ? 'text-zinc-800 hover:bg-sky-50'
                          : 'text-zinc-400 hover:bg-zinc-50'
                  }`}
                >
                  {date.day}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 text-sm">
            <button type="button" onClick={clearDate} className="text-sky-600 hover:text-sky-800">
              Xóa
            </button>
            <button type="button" onClick={() => selectDate(getToday())} className="text-sky-600 hover:text-sky-800">
              Hôm nay
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span ref={wrapperRef} className={wrapperClassName}>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          lang="vi-VN"
          aria-label={ariaLabel}
          disabled={disabled}
          required={required}
          value={text}
          onChange={event => setText(maskDdMmYyyyInput(event.target.value))}
          onBlur={event => commitText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className={className}
        />
        <span className="pointer-events-none absolute inset-0">
          <button
            type="button"
            onClick={toggleCalendar}
            disabled={disabled}
            aria-label={ariaLabel || 'Chọn ngày trên lịch'}
            className="pointer-events-auto absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </span>
      {calendarPopup}
    </>
  );
}
