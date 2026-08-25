import React from 'react';
import { Plus } from 'lucide-react';

export type RepeatableLineColumn = {
  key: string;
  label: string;
  className?: string;
  required?: boolean;
};

type RepeatableLinesBlockProps = {
  title: string;
  required?: boolean;
  onAdd: () => void;
  addLabel?: string;
  hideAddButton?: boolean;
  extraHeaderButtons?: React.ReactNode;
  mobileHeader?: React.ReactNode;
  noWrapHeader?: boolean;
  horizontalScroll?: boolean;
  showColumnHeaders?: boolean;
  actionsAtBottom?: boolean;
  gridTemplateClass?: string;
  columns: RepeatableLineColumn[];
  children: React.ReactNode;
  addButtonClassName?: string;
  className?: string;
};

export function RepeatableLinesBlock({
  title,
  required,
  onAdd,
  addLabel = 'Thêm dòng',
  hideAddButton = false,
  extraHeaderButtons,
  mobileHeader,
  noWrapHeader = false,
  horizontalScroll = false,
  showColumnHeaders = false,
  actionsAtBottom = false,
  gridTemplateClass,
  columns,
  children,
  addButtonClassName,
  className = ''
}: RepeatableLinesBlockProps) {
  const defaultAddClass =
    'flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 transition hover:bg-zinc-100';

  const actionButtons = !hideAddButton ? (
    <div className="flex flex-wrap items-center gap-2">
      {extraHeaderButtons}
      <button type="button" onClick={onAdd} className={addButtonClassName || defaultAddClass}>
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden min-[380px]:inline">{addLabel}</span>
      </button>
    </div>
  ) : extraHeaderButtons ? (
    <div className="flex flex-wrap items-center gap-2">{extraHeaderButtons}</div>
  ) : null;

  const headerLayout = gridTemplateClass
    ? `grid ${gridTemplateClass}`
    : 'flex flex-wrap';
  const headerVisibility = showColumnHeaders
    ? gridTemplateClass
      ? 'hidden sm:grid'
      : ''
      : gridTemplateClass
      ? 'hidden sm:grid'
      : 'hidden sm:flex';

  const lineContent = (
    <>
      {columns.length > 0 && (
        <div
          className={`items-end gap-2 border-b border-zinc-200/80 pb-1.5 ${headerLayout} ${headerVisibility}`}
        >
          {columns.map(column => (
            <span
              key={column.key}
              className={`shrink-0 text-[10px] font-black uppercase tracking-wider text-zinc-500 ${column.className || ''}`}
            >
              {column.label}
              {column.required ? ' *' : ''}
            </span>
          ))}
        </div>
      )}

      {mobileHeader ? <div className="sm:hidden">{mobileHeader}</div> : null}

      <div className="divide-y divide-zinc-200/80">{children}</div>
    </>
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
        <div
          className={
            actionsAtBottom
              ? 'border-b border-zinc-200/80 pb-2'
              : noWrapHeader
                ? 'flex min-w-0 flex-nowrap items-center justify-between gap-2'
                : 'flex flex-wrap items-center justify-between gap-2'
          }
        >
          <span className={`${noWrapHeader ? 'min-w-0 flex-1' : ''} whitespace-nowrap text-xs font-black uppercase tracking-wider text-zinc-700`}>
            {title}
            {required ? ' *' : ''}
          </span>
          {!actionsAtBottom ? actionButtons : null}
        </div>

        {horizontalScroll ? <div className="overflow-x-auto scrollbar-hidden">{lineContent}</div> : lineContent}

        {actionsAtBottom && actionButtons ? (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200/80 pt-2">
            {actionButtons}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RepeatableLineRow({
  children,
  className = '',
  gridTemplateClass
}: {
  children: React.ReactNode;
  className?: string;
  gridTemplateClass?: string;
  key?: React.Key;
}) {
  const layout = gridTemplateClass
    ? `grid ${gridTemplateClass} items-end gap-x-2 gap-y-1.5 sm:gap-2`
    : 'flex flex-wrap items-end gap-2';
  return <div className={`${layout} py-2.5 first:pt-0 last:pb-0 ${className}`}>{children}</div>;
}
