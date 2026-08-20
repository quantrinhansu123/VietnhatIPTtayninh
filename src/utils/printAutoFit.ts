/**
 * Thu nhỏ vừa đủ các phiếu chỉ bị tràn sang trang thứ hai vài dòng.
 *
 * Trình duyệt không có API cho biết chính xác vị trí ngắt trang. Vì vậy ta
 * ước lượng vùng in từ tỉ lệ khổ A4 ngang, rồi chỉ áp dụng khi phần tràn nhỏ
 * hơn hoặc bằng hai hàng của bảng. Những mẫu đã chia trang/tem QR chủ động
 * không nằm trong danh sách này.
 */

const PRINT_DOCUMENT_SELECTOR = [
  '.order-print-doc',
  '.production-order-print-doc',
  '.production-plan-print-doc',
  '.mixing-report-print-doc',
  '.weighing-slip-print-doc',
  '.warehouse-slip-print-doc',
  '.shift-handover-print-doc',
  '.kiem-kho-print-sheet',
].join(', ');

const A4_LANDSCAPE_CONTENT_HEIGHT_RATIO = 0.68;
const MAX_SPILLED_ROWS = 2;
const MIN_SCALE = 0.9;

function isDeliberatelyPaged(element: HTMLElement) {
  return Boolean(element.closest(
    '.qr-print-sheet, .production-plan-qr-print-sheet, .mixing-norm-ratio-print-sheet',
  ));
}

function averageTableRowHeight(element: HTMLElement) {
  const rows = Array.from(element.querySelectorAll('tbody > tr')) as HTMLElement[];
  if (rows.length === 0) return 0;

  const visibleHeights = rows
    .map(row => row.getBoundingClientRect().height)
    .filter(height => height > 0);
  if (visibleHeights.length === 0) return 0;

  return visibleHeights.reduce((total, height) => total + height, 0) / visibleHeights.length;
}

function fitSparseOverflow() {
  document.querySelectorAll<HTMLElement>(PRINT_DOCUMENT_SELECTOR).forEach(documentElement => {
    documentElement.classList.remove('print-auto-fit-one-page');
    documentElement.style.removeProperty('--print-auto-fit-scale');

    if (isDeliberatelyPaged(documentElement)) return;

    const bounds = documentElement.getBoundingClientRect();
    const rowHeight = averageTableRowHeight(documentElement);
    if (bounds.width <= 0 || bounds.height <= 0 || rowHeight <= 0) return;

    const pageHeight = bounds.width * A4_LANDSCAPE_CONTENT_HEIGHT_RATIO;
    const overflow = bounds.height - pageHeight;

    // Chỉ can thiệp đúng tình huống trang 2 còn tối đa 1–2 hàng. Phiếu dài
    // hơn vẫn giữ cỡ chữ chuẩn và được chia trang bình thường để dễ đọc.
    if (overflow <= 0 || overflow > rowHeight * MAX_SPILLED_ROWS) return;

    const scale = Math.max(MIN_SCALE, pageHeight / bounds.height);
    if (scale >= 0.995) return;

    documentElement.style.setProperty('--print-auto-fit-scale', scale.toFixed(3));
    documentElement.classList.add('print-auto-fit-one-page');
  });
}

/** Khởi tạo một lần ở entry point; chạy cho mọi lệnh window.print(). */
export function enablePrintAutoFit() {
  window.addEventListener('beforeprint', fitSparseOverflow);
  window.addEventListener('afterprint', () => {
    document.querySelectorAll<HTMLElement>('.print-auto-fit-one-page').forEach(element => {
      element.classList.remove('print-auto-fit-one-page');
      element.style.removeProperty('--print-auto-fit-scale');
    });
  });
}
