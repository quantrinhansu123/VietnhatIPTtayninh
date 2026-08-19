import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, QrCode, X } from 'lucide-react';
import QRCode from 'qrcode';
import { waitForPrintImagesReady } from '../utils/printReady';

const QR_PRINT_PAGE_STYLE_ID = 'product-qr-print-page-portrait';

function enablePortraitQrPrintPage() {
  document.getElementById(QR_PRINT_PAGE_STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = QR_PRINT_PAGE_STYLE_ID;
  style.media = 'print';
  style.textContent = '@page { size: 210mm 297mm; margin: 5mm; }';
  document.head.appendChild(style);
}

function disablePortraitQrPrintPage() {
  document.getElementById(QR_PRINT_PAGE_STYLE_ID)?.remove();
}

export type ProductQrPrintLabel = {
  key: string;
  payload: string;
  productCode: string;
  productName?: string;
  itemLabel?: string;
  quantity?: number;
  unit?: string;
};

async function createQrDataUrl(payload: string) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 340,
    color: { dark: '#111111', light: '#ffffff' }
  });
}

function ProductQrCards({
  labels,
  images,
  printLayout = false
}: {
  labels: ProductQrPrintLabel[];
  images: Record<string, string>;
  printLayout?: boolean;
}) {
  if (printLayout) {
    return (
      <div className="qr-print-page">
        {labels.map(label => (
          <div key={label.key} className="qr-print-card">
            <div className="qr-print-code">
              {images[label.payload] ? <img src={images[label.payload]} alt={`QR ${label.payload}`} /> : null}
            </div>
            <div className="qr-print-tag-info">
              <p className="qr-print-tag-label">{label.itemLabel || 'Tên sản phẩm'}</p>
              <p className="qr-print-tag-name">{label.productName || '-'}</p>
              {label.quantity !== undefined ? (
                <p className="qr-print-tag-quantity">Số lượng: {label.quantity}{label.unit ? ` ${label.unit}` : ''}</p>
              ) : null}
              <p className="qr-print-tag-code">{label.productCode || '-'}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {labels.map(label => (
        <div key={label.key} className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="h-28 w-28 shrink-0 rounded-lg border border-zinc-200 bg-white p-1">
            {images[label.payload] ? <img src={images[label.payload]} alt={`QR ${label.payload}`} className="h-full w-full" /> : null}
          </div>
          <div className="min-w-0 self-center">
            <p className="font-black text-zinc-950">{label.productCode}</p>
            <p className="mt-1 text-xs font-semibold text-zinc-500">{label.productName || '-'}</p>
            <p className="mt-2 break-all font-mono text-[11px] font-bold text-[#ef1b2d]">{label.payload}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProductQrPrintModal({
  open,
  labels,
  autoPrint = false,
  trackProductPrint = true,
  title = 'Mã QR sản phẩm nhập kho',
  description,
  onClose
}: {
  open: boolean;
  labels: ProductQrPrintLabel[];
  autoPrint?: boolean;
  /** QR NVL không phải serial thành phẩm nên không ghi lịch sử in ở bảng mã sản phẩm. */
  trackProductPrint?: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState('');
  const autoPrintKeyRef = useRef('');
  const labelKey = useMemo(() => labels.map(label => label.payload).join('|'), [labels]);

  useEffect(() => {
    if (!open || labels.length === 0) {
      setImages({});
      setError('');
      autoPrintKeyRef.current = '';
      return;
    }

    let cancelled = false;
    setIsPreparing(true);
    setError('');
    void Promise.all(labels.map(async label => [label.payload, await createQrDataUrl(label.payload)] as const))
      .then(entries => {
        if (!cancelled) setImages(Object.fromEntries(entries));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Không thể tạo ảnh QR.');
      })
      .finally(() => {
        if (!cancelled) setIsPreparing(false);
      });

    return () => { cancelled = true; };
  }, [open, labelKey]);

  const printQr = async () => {
    if (labels.length === 0 || isPreparing) return;
    setIsPreparing(true);
    setError('');
    try {
      if (trackProductPrint) {
        const response = await fetch('/api/ma-san-pham/danh-dau-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: labels.map(label => label.payload) })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể lưu lịch sử in QR.');
      }

      enablePortraitQrPrintPage();
      document.body.classList.add('product-qr-print-active');
      await waitForPrintImagesReady();
      window.print();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Không thể in mã QR.');
    } finally {
      document.body.classList.remove('product-qr-print-active');
      disablePortraitQrPrintPage();
      setIsPreparing(false);
    }
  };

  useEffect(() => {
    if (!open || !autoPrint || isPreparing || Object.keys(images).length !== labels.length || !labelKey) return;
    if (autoPrintKeyRef.current === labelKey) return;
    autoPrintKeyRef.current = labelKey;
    const timer = window.setTimeout(() => { void printQr(); }, 150);
    return () => window.clearTimeout(timer);
  }, [open, autoPrint, isPreparing, images, labels.length, labelKey]);

  if (!open || labels.length === 0) return null;

  return createPortal(
    <>
      <div className="qr-print-sheet">
        <ProductQrCards labels={labels} images={images} printLayout />
      </div>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">File 2/2</p>
              <h3 className="text-lg font-black text-zinc-950">{title}</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                {description || (trackProductPrint
                  ? `${labels.length} tem · mỗi tem là một serial đã lưu trong CSDL`
                  : `${labels.length} tem · mỗi mã NVL in một lần`)}
              </p>
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 p-4">
            {error ? <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
            {isPreparing && Object.keys(images).length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" />Đang tạo ảnh QR...</div>
            ) : <ProductQrCards labels={labels} images={images} />}
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700">Đóng</button>
            <button type="button" onClick={() => void printQr()} disabled={isPreparing} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white hover:bg-[#b30d1c] disabled:opacity-60">
              {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              <Printer className="h-4 w-4" /> In mã QR
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
