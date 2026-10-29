/** Số thứ tự của mã lệnh SX dạng LSX001 / LSX-001. Mã gắn đơn (LSX-DH029) không tính. */
export function productionOrderSequenceNumber(raw: string): number | null {
  const compact = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s,._-]+/g, '');
  const match = compact.match(/^LSX(\d+)$/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/** Mã lệnh kế tiếp, không gắn đơn hàng, không dấu phẩy hay gạch ngang. */
export function nextProductionOrderCode(existingCodes: Iterable<string>): string {
  let max = 0;
  for (const raw of existingCodes) {
    const num = productionOrderSequenceNumber(raw);
    if (num != null && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `LSX${String(next).padStart(width, '0')}`;
}
