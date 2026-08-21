/**
 * Thu nhỏ vừa đủ các phiếu chỉ bị tràn sang trang thứ hai vài dòng.
 *
 * Trình duyệt không có API cho biết chính xác vị trí ngắt trang. Vì vậy ta
 * tính đúng chiều cao vùng in từ khổ giấy + margin thật của @page mỗi mẫu
 * (không đoán theo tỉ lệ chiều rộng — ước lượng theo tỉ lệ từng sai lệch đủ
 * để phần đuôi phiếu vẫn tràn sang trang 2 dù chỉ còn vài dòng), rồi chỉ áp
 * dụng khi phần tràn nhỏ. Những mẫu đã chia trang/tem QR chủ động không nằm
 * trong danh sách này.
 */

// 96 CSS px = 1in = 25.4mm — quy đổi chuẩn CSS, không phụ thuộc độ phân giải màn hình.
const PX_PER_MM = 96 / 25.4;

// Chiều cao vùng in thật (mm) = chiều cao khổ giấy trừ margin trên+dưới của
// @page tương ứng mỗi mẫu (khai báo trong index.css). Fallback dùng mặc định
// A4 ngang, margin 8mm (@page mặc định) cho mẫu chưa có @page riêng.
const PRINT_DOCUMENT_CONTENT_HEIGHT_MM: Record<string, number> = {
  // Các selector chuyên biệt phải đứng trước class dùng chung
  // .production-order-print-doc để lấy đúng margin @page của từng mẫu.
  '.kiem-kho-print-doc': 297 - 5 * 2, // A4 dọc, @page sinh động khi in
  '.machine-nvl-print-doc': 297 - 5 * 2, // @page machine-nvl-report-page: A4 dọc, margin 5mm
  '.bb-machine-report-print-doc': 297 - 5 * 2, // @page bb-machine-report-page: A4 dọc, margin 5mm
  '.shift-summary-print-doc': 297 - 5 * 2, // @page shift-summary-page: A4 dọc, margin 5mm
  '.warehouse-slip-print-doc': 210 - 5 * 2,
  '.production-plan-print-doc': 297 - 5 * 2, // @page production-plan-page: A4 dọc, margin 5mm
  '.mixing-report-print-doc': 297 - 5 * 2, // @page mixing-report-page: A4 dọc, margin 5mm
  '.weighing-slip-print-doc': 297 - 5 * 2, // @page weighing-slip-page: A4 dọc, margin 5mm
  '.shift-handover-print-doc': 297 - 5 * 2, // @page shift-handover-page: A4 dọc, margin 5mm
  '.mixing-norm-ratio-print-doc': 297 - 8 * 2, // @page mặc định: A4 dọc, margin 8mm
  '.order-print-doc': 297 - 8 * 2, // @page mặc định: A4 dọc, margin 8mm
  '.production-order-print-doc': 210 - 8 * 2,
  '.kiem-kho-print-sheet': 297 - 5 * 2,
};
const DEFAULT_CONTENT_HEIGHT_MM = 297 - 8 * 2; // @page mặc định: A4 dọc, margin 8mm

function pageContentHeightPx(element: HTMLElement) {
  const matchedSelector = Object.keys(PRINT_DOCUMENT_CONTENT_HEIGHT_MM).find(selector =>
    element.matches(selector),
  );
  const heightMm = matchedSelector
    ? PRINT_DOCUMENT_CONTENT_HEIGHT_MM[matchedSelector]
    : DEFAULT_CONTENT_HEIGHT_MM;
  return heightMm * PX_PER_MM;
}

const PRINT_DOCUMENT_SELECTOR = Object.keys(PRINT_DOCUMENT_CONTENT_HEIGHT_MM).join(', ');

const MAX_SPILLED_ROWS = 2;
// Một–hai dòng có thể cao do tên vật tư xuống dòng; cho phép co tối đa 25%
// để vẫn gom được chúng về trang trước. Phiếu tràn nhiều hơn ngưỡng vẫn không
// đi vào nhánh này nên không làm chữ của tài liệu dài quá nhỏ.
const MIN_SCALE = 0.75;
// Trừ hao thêm ~3% khi tính tỉ lệ co — nếu chỉ co vừa khít điểm biên, sai số
// đo lường nhỏ (font, bo tròn khi in) có thể lại đẩy phiếu về 2 trang.
const PRINT_SAFETY_MARGIN = 0.97;
// Trần cho phần đuôi (ghi chú/chữ ký) được phép tràn riêng sang trang 2 —
// tính theo tỉ lệ chiều cao trang, tránh co những phiếu thật sự dài hai trang.
const MAX_TAIL_OVERFLOW_RATIO = 0.3;

function isDeliberatelyPaged(element: HTMLElement) {
  return Boolean(element.closest(
    // Tem QR có kích thước/lưới cố định, tuyệt đối không được co theo nội dung.
    '.qr-print-sheet, .production-plan-qr-print-sheet',
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

/**
 * Chiều cao khối cuối cùng (ghi chú/chữ ký) — đây thường là phần lẻ loi bị
 * đẩy sang trang 2 dù bản thân bảng dữ liệu đã in vừa hết trang 1.
 */
function trailingBlockHeight(element: HTMLElement) {
  const children = Array.from(element.children) as HTMLElement[];
  if (children.length === 0) return 0;
  const last = children[children.length - 1];
  const secondLast = children[children.length - 2];
  const lastHeight = last.getBoundingClientRect().height;
  const secondLastHeight = secondLast ? secondLast.getBoundingClientRect().height : 0;
  // Chỉ gộp khối áp chót nếu nó cũng nhỏ (kiểu ghi chú), không phải bảng dữ liệu.
  const secondLastIsTable = Boolean(secondLast?.querySelector('table')) || secondLast?.tagName === 'TABLE';
  return lastHeight + (secondLastIsTable ? 0 : secondLastHeight);
}

/**
 * Khi Chrome cắt một grid/chữ ký qua trang sau, chiều cao của phần tử cha đôi
 * lúc không phản ánh hết phần fragment ở trang 2. Lấy đáy xa nhất của các
 * phần tử con để không bỏ sót đúng tình huống còn 1–2 dòng cuối trang.
 */
function renderedContentHeight(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const bottom = Array.from(element.querySelectorAll<HTMLElement>('*')).reduce(
    (furthestBottom, child) => Math.max(furthestBottom, child.getBoundingClientRect().bottom),
    bounds.bottom,
  );
  return Math.max(bounds.height, element.offsetHeight, element.scrollHeight, bottom - bounds.top);
}

function fitSparseOverflow() {
  document.querySelectorAll<HTMLElement>(PRINT_DOCUMENT_SELECTOR).forEach(documentElement => {
    documentElement.classList.remove('print-auto-fit-one-page');
    documentElement.style.removeProperty('--print-auto-fit-scale');

    if (isDeliberatelyPaged(documentElement)) return;

    const bounds = documentElement.getBoundingClientRect();
    const rowHeight = averageTableRowHeight(documentElement);
    const contentHeight = renderedContentHeight(documentElement);
    if (bounds.width <= 0 || contentHeight <= 0 || rowHeight <= 0) return;

    const pageHeight = pageContentHeightPx(documentElement);
    const overflow = contentHeight - pageHeight;

    // Chỉ can thiệp đúng tình huống trang 2 còn lại một phần nhỏ: hoặc vài
    // hàng bảng cuối, hoặc khối ghi chú/chữ ký lẻ loi bị đẩy xuống. Phiếu
    // dài hơn vẫn giữ cỡ chữ chuẩn và được chia trang bình thường để dễ đọc.
    const tailHeight = trailingBlockHeight(documentElement);
    const overflowBudget = Math.max(
      rowHeight * MAX_SPILLED_ROWS,
      Math.min(tailHeight, pageHeight * MAX_TAIL_OVERFLOW_RATIO),
    );
    if (overflow <= 0 || overflow > overflowBudget) return;

    const scale = Math.max(MIN_SCALE, (pageHeight * PRINT_SAFETY_MARGIN) / contentHeight);
    if (scale >= 0.995) return;

    documentElement.style.setProperty('--print-auto-fit-scale', scale.toFixed(3));
    documentElement.classList.add('print-auto-fit-one-page');

    // Ép Chrome cập nhật layout ngay trong chế độ print. Nếu không, một số bản
    // Chrome chỉ nhận zoom sau khi đã chụp layout cho trang xem trước đầu tiên.
    void documentElement.offsetHeight;
  });
}

/** Khởi tạo một lần ở entry point; chạy cho mọi lệnh window.print(). */
export function enablePrintAutoFit() {
  window.addEventListener('beforeprint', fitSparseOverflow);
  const printMedia = window.matchMedia('print');
  printMedia.addEventListener('change', event => {
    if (!event.matches) return;

    // matchMedia(print) xảy ra khi Chrome vừa chuyển sang print layout, sớm
    // hơn bản xem trước. Chạy lại ở frame kế tiếp để bắt được cả ảnh/logo vừa
    // hoàn tất layout và các grid/chữ ký có thể bị phân mảnh qua trang 2.
    fitSparseOverflow();
    window.requestAnimationFrame(fitSparseOverflow);
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll<HTMLElement>('.print-auto-fit-one-page').forEach(element => {
      element.classList.remove('print-auto-fit-one-page');
      element.style.removeProperty('--print-auto-fit-scale');
    });
  });
}
