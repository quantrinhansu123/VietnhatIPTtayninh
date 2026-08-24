/**
 * Chờ toàn bộ ảnh trong trang (logo, ảnh chụp, QR...) tải/giải mã xong trước khi in.
 * Trên điện thoại (mạng/CPU chậm hơn desktop) một khoảng setTimeout cố định thường
 * không đủ, khiến window.print() chạy trước khi ảnh load xong và bản in bị trắng/thiếu ảnh.
 */
export function waitForPrintImagesReady(maxWaitMs = 4000): Promise<void> {
  return new Promise(resolve => {
    const images = Array.from(document.images).filter(img => !img.complete);
    if (images.length === 0) {
      resolve();
      return;
    }

    let remaining = images.length;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      resolve();
    };

    const onImageSettled = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    images.forEach(img => {
      img.addEventListener('load', onImageSettled, { once: true });
      img.addEventListener('error', onImageSettled, { once: true });
    });

    const fallbackTimer = window.setTimeout(finish, maxWaitMs);
  });
}

const PORTRAIT_PRINT_PAGE_STYLE_ID = 'app-print-page-portrait-override';

/**
 * Chrome hay giữ @page landscape toàn cục — inject @page A4 dọc trước khi in.
 */
export function enablePortraitPrintPage(styleId = PORTRAIT_PRINT_PAGE_STYLE_ID) {
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.media = 'print';
  style.textContent = '@page { size: 210mm 297mm; margin: 8mm; }';
  document.head.appendChild(style);
}

export function disablePortraitPrintPage(styleId = PORTRAIT_PRINT_PAGE_STYLE_ID) {
  document.getElementById(styleId)?.remove();
}

const LANDSCAPE_PRINT_PAGE_STYLE_ID = 'app-print-page-landscape-override';

/** Inject @page A4 ngang — dùng cho phiếu bảng rộng (QT-16-BM02). */
export function enableLandscapePrintPage(styleId = LANDSCAPE_PRINT_PAGE_STYLE_ID) {
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.media = 'print';
  style.textContent = '@page { size: 297mm 210mm; margin: 5mm; }';
  document.head.appendChild(style);
}

export function disableLandscapePrintPage(styleId = LANDSCAPE_PRINT_PAGE_STYLE_ID) {
  document.getElementById(styleId)?.remove();
}
