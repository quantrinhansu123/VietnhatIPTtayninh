export type ConversionMaterialOption = { code: string; name: string; unit: string };

/** Danh mục Kho NVL, gộp cùng mã để không lặp lựa chọn giữa các kho. */
export function buildConversionMaterialOptions(data: unknown): ConversionMaterialOption[] {
  if (!data || typeof data !== 'object') return [];
  const materials = (data as { materials?: unknown }).materials;
  if (!Array.isArray(materials)) return [];
  const byCode = new Map<string, ConversionMaterialOption>();
  for (const item of materials) {
    if (!item || typeof item !== 'object') continue;
    const code = String(item.ma_npl ?? '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, { code, name: String(item.ten_npl ?? '').trim(), unit: String(item.don_vi ?? '').trim() });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi', { numeric: true }));
}

export function formatConversionMaterial(option: ConversionMaterialOption): string {
  return [option.code, option.name, option.unit].filter(Boolean).join(' · ');
}
