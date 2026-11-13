/** Mã cũ tương đương đã được gộp vào danh mục, giữ nguyên số lượng khi chuẩn hóa. */
export function canonicalizeMaterialCodePayload(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/ONG-20CM(?=$|[^A-Z0-9])/gi, 'ONG-19.5CM');
  }
  if (Array.isArray(value)) return value.map(canonicalizeMaterialCodePayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key.replace(/ONG-20CM(?=$|[^A-Z0-9])/gi, 'ONG-19.5CM'),
      canonicalizeMaterialCodePayload(item)
    ]));
  }
  return value;
}
