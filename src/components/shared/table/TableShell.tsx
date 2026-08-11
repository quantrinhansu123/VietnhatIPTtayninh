import type { ReactNode } from 'react';

/**
 * Khung bảng dùng chung: viền bo tròn, header đỏ chữ trắng dính (sticky), thân cuộn dọc.
 * Mẫu dùng chung được trích xuất từ trang Lệnh sản xuất (src/features/lenh-sx).
 *
 * Dùng cùng <TablePagination> ở footer để có bộ đôi bảng + phân trang thống nhất.
 */
export function TableShell({
  children,
  footer,
  minWidthClassName = 'min-w-[1024px]',
  maxHeightClassName = 'max-h-[70vh]'
}: {
  children: ReactNode;
  /** Phân trang/chân bảng nằm chung trong khung bo tròn, bên ngoài vùng cuộn. */
  footer?: ReactNode;
  /** vd. 'min-w-[1540px]' nếu bảng có nhiều cột */
  minWidthClassName?: string;
  maxHeightClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
      <div className={`hover-scrollbar ${maxHeightClassName} overflow-auto`}>
        <table className={`${minWidthClassName} w-full text-left text-sm`}>
          {children}
        </table>
      </div>
      {footer}
    </section>
  );
}

/** <thead> đỏ chữ trắng, dính khi cuộn — dùng bên trong TableShell. */
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-[#ef1b2d] text-xs uppercase tracking-wider text-white">
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
  align?: 'left' | 'center';
  title?: string;
}) {
  return (
    <th title={title} className={`px-4 py-3 font-black ${align === 'center' ? 'text-center' : ''} ${className}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-zinc-100">{children}</tbody>;
}

export function TableRow({ children, className = '' }: { children: ReactNode; className?: string; key?: string }) {
  return <tr className={`transition hover:bg-red-50/40 ${className}`}>{children}</tr>;
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
