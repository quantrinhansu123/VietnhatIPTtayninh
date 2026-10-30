/**
 * Token giao diện bảng «Hàng tiền» — dùng cho TableShell và bảng custom.
 * Màu logo #ef1b2d giữ cho nút / phân trang / hover — không phủ header.
 */

/** Khung ngoài bảng / section chứa bảng. */
export const TABLE_SHELL_CLASS =
  'overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm';

/** <thead> sticky — xám xanh nhạt. */
export const TABLE_HEAD_CLASS =
  'sticky top-0 z-10 border-b border-zinc-200 bg-[#e8f0ed] text-[11px] font-semibold tracking-wide text-zinc-700';

/** <thead> không sticky (bảng trong modal / khối nhỏ). */
export const TABLE_HEAD_STATIC_CLASS =
  'border-b border-zinc-200 bg-[#e8f0ed] text-[11px] font-semibold tracking-wide text-zinc-700';

/** <th> chuẩn. */
export const TABLE_TH_CLASS =
  'border-r border-zinc-200/80 px-3 py-2.5 font-semibold text-zinc-700 last:border-r-0';

/** <th> căn giữa / phải. */
export const TABLE_TH_CENTER_CLASS = `${TABLE_TH_CLASS} text-center`;
export const TABLE_TH_RIGHT_CLASS = `${TABLE_TH_CLASS} text-right`;

/** <tr> thân — zebra + hover logo nhạt. */
export const TABLE_ROW_CLASS =
  'border-b border-zinc-100 odd:bg-white even:bg-zinc-50/70 transition hover:bg-[#ef1b2d]/[0.04]';

/** <td> chuẩn. */
export const TABLE_TD_CLASS = 'border-r border-zinc-100 px-3 py-2 text-[13px] text-zinc-800 last:border-r-0';

/** Header lưới form nhập dòng (thay bg đỏ logo cũ). */
export const TABLE_FORM_HEADER_GRID_CLASS =
  'rounded-lg border border-zinc-200 bg-[#e8f0ed] px-2 py-2 text-[11px] font-semibold text-zinc-700';

/**
 * Chrome bảng tab BB / phân tích — thống nhất theo mẫu «Kiểm tồn cuối ca».
 * Dùng chung mọi tab dữ liệu (lệnh SX, xuất kho, tồn đầu/cuối, lỗi hỏng, …).
 */
export const BB_TABLE_CLASS =
  'min-w-[1100px] w-full table-fixed whitespace-nowrap text-left text-[15px] font-semibold';
export const BB_TABLE_THEAD_CLASS = `${TABLE_HEAD_STATIC_CLASS} text-[13px] uppercase tracking-wide`;
export const BB_TABLE_GROUP_ROW_CLASS =
  'border-y border-violet-200 bg-violet-50/70 text-[15px] font-bold transition hover:bg-violet-100/60';
export const BB_TABLE_EXPAND_BTN_CLASS =
  'inline-flex h-9 w-9 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm transition hover:bg-violet-50';
export const BB_TABLE_CHILD_WRAP_CLASS = 'bb-row-child-wrap bg-violet-50/30';
export const BB_TABLE_CHILD_PANEL_CLASS =
  'bb-child-panel overflow-x-auto border-y border-violet-200 bg-white';
export const BB_TABLE_METRIC_CLASS = 'font-mono text-[16px] font-black text-violet-900';
export const BB_TABLE_TFOOT_CLASS =
  'border-t-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-900';
export const BB_TABLE_TFOOT_METRIC_CLASS = 'font-mono text-violet-800';
export const BB_TABLE_ORDER_CODE_CLASS = 'font-mono font-black text-sky-950';
