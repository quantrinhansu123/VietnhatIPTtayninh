import React from 'react';
import { sameOriginCloudinaryUrl } from '../utils/cloudinaryUrl';

export type WeighingPreviewImage = {
  url: string;
  title: string;
};

export function WeighingImageThumbnail({
  url,
  alt,
  title,
  onView,
  className = 'block h-12 w-16 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]'
}: {
  url: string;
  alt: string;
  title: string;
  onView: () => void;
  className?: string;
}) {
  const src = sameOriginCloudinaryUrl(url);
  return (
    <button
      type="button"
      onClick={onView}
      title={title}
      className={className}
    >
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </button>
  );
}

export default function WeighingImagePreviewModal({
  image,
  onClose
}: {
  image: WeighingPreviewImage | null;
  onClose: () => void;
}) {
  if (!image) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">{image.title}</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">Xem ảnh trong ứng dụng — không mở tab mới</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
        <div className="flex max-h-[calc(90vh-58px)] items-center justify-center bg-zinc-50 p-3">
          <img
            src={sameOriginCloudinaryUrl(image.url)}
            alt={image.title}
            referrerPolicy="no-referrer"
            className="max-h-[calc(90vh-82px)] max-w-full rounded-lg object-contain"
          />
        </div>
      </div>
    </div>
  );
}
