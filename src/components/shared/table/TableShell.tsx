import type { ReactNode } from 'react';
import {
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TABLE_TH_CENTER_CLASS,
  TABLE_TH_CLASS,
  TABLE_TH_RIGHT_CLASS
} from './tableTokens';

/**
 * Khung bảng dùng chung — layout kiểu «Hàng tiền».
 * Token: `tableTokens.ts`. Màu logo (#ef1b2d) cho nút / phân trang / hover.
 */
export function TableShell({
  children,
  footer,
  minWidthClassName = 'min-w-[1024px]',
  maxHeightClassName = 'max-h-[70vh]',
  className = '',
  title
}: {
  children: ReactNode;
  footer?: ReactNode;
  minWidthClassName?: string;
  maxHeightClassName?: string;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <section className={`${TABLE_SHELL_CLASS} ${className}`.trim()}>
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5">
          {typeof title === 'string' ? (
            <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
          ) : (
            title
          )}
        </div>
      ) : null}
      <div className={`hover-scrollbar ${maxHeightClassName} overflow-auto`}>
        <table className={`${minWidthClassName} w-full border-collapse text-left text-sm`}>
          {children}
        </table>
      </div>
      {footer}
    </section>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className={TABLE_HEAD_CLASS}>
      <tr>{children}</tr>
    </thead>
  );
}

export function TableHeadCell({
  children,
  className = '',
  align = 'left',
  title
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  title?: string;
}) {
  const base =
    align === 'center' ? TABLE_TH_CENTER_CLASS : align === 'right' ? TABLE_TH_RIGHT_CLASS : TABLE_TH_CLASS;
  return (
    <th title={title} className={`${base} ${className}`.trim()}>
      {children}
    </th>
  );
}

export function TableBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tbody className={className.trim()}>{children}</tbody>;
}

export function TableRow({ children, className = '' }: { children: ReactNode; className?: string; key?: string }) {
  return <tr className={`${TABLE_ROW_CLASS} ${className}`.trim()}>{children}</tr>;
}

export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-500">
        {children}
      </td>
    </tr>
  );
}
