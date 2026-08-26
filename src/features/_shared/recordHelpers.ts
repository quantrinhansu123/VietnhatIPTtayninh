import { sameOriginCloudinaryUrl } from '../../utils/cloudinaryUrl';

export function formatCell(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);
}

export function formatTimeCell(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '-';
  const text = String(value).trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function pickText(record: Record<string, unknown>, keys: string[], fallback = '-') {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function fileToOptimizedImageDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number }
): Promise<string> {
  const rawDataUrl = await fileToDataUrl(file);
  const maxEdge = options?.maxEdge ?? 1400;
  const quality = options?.quality ?? 0.78;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const longestEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
        const scale = Math.min(1, maxEdge / longestEdge);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(rawDataUrl);
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', quality));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('Không thể đọc ảnh để tối ưu.'));
    image.src = rawDataUrl;
  });
}

export function cloudinaryPreviewUrl(url: string, width = 480) {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/res\.cloudinary\.com/i.test(trimmed) || !trimmed.includes('/image/upload/')) {
    return trimmed;
  }
  const transformed = trimmed.replace(
    '/image/upload/',
    `/image/upload/f_auto,q_auto,w_${Math.max(64, Math.round(width))},c_limit/`
  );
  return sameOriginCloudinaryUrl(transformed);
}

export async function uploadImage(imageDataUrl: string, folder?: string) {
  const res = await fetch('/api/cloudinary/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, folder })
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Không thể upload ảnh.');
  }

  return {
    imageUrl: String(data.url ?? data.imageUrl ?? ''),
    imagePublicId: String(data.publicId ?? data.imagePublicId ?? '')
  };
}
