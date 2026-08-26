/** Chỉ nhận URL delivery `res.cloudinary.com/.../image/upload/` (không fetch SSRF). */
export function isCloudinaryUploadUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname.toLowerCase() !== 'res.cloudinary.com') return false;
    if (parsed.username || parsed.password) return false;
    return parsed.pathname.includes('/image/upload/');
  } catch {
    return false;
  }
}

/**
 * Trình duyệt load ảnh cùng origin để tránh ERR_CERT_VERIFIER_CHANGED
 * khi Chrome/AV kiểm tra chứng chỉ `res.cloudinary.com`.
 */
export function sameOriginCloudinaryUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/api/cloudinary/proxy')) return trimmed;
  if (!isCloudinaryUploadUrl(trimmed)) return trimmed;
  return `/api/cloudinary/proxy?url=${encodeURIComponent(trimmed)}`;
}
