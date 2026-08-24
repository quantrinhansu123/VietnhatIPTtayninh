import React, { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatIsoToDdMmYyyy, maskDdMmYyyyInput, parseDdMmYyyyToIso } from '../../utils/dateFormat';

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
  const [text, setText] = useState(() => formatIsoToDdMmYyyy(value));

  useEffect(() => {
    setText(formatIsoToDdMmYyyy(value));
  }, [value]);

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

  return (
    <span className={wrapperClassName}>
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
      <span className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2">
        <CalendarDays className="pointer-events-none absolute inset-0 m-auto h-4 w-4 text-zinc-400" />
        <input
          type="date"
          lang="vi-VN"
          tabIndex={-1}
          disabled={disabled}
          title="Chọn ngày"
          aria-label="Chọn ngày trên lịch"
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
          onChange={event => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </span>
    </span>
  );
}
