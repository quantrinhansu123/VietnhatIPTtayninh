export interface OrderProductLine {
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  /** Ghi chú theo dòng sản phẩm (lưu trong san_pham jsonb). */
  note?: string;
  orderRef?: string;
}

export function splitProductionProductCodes(raw: string): string[] {
  return raw
    .split(',')
    .map(code => code.trim())
    .filter(code => code && code !== '-');
}

export function splitProductionProductNames(raw: string, expectedCount: number): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || expectedCount <= 1) {
    return trimmed && trimmed !== '-' ? [trimmed] : [];
  }

  const matchCount = (parts: string[]) =>
    parts.length === expectedCount ? parts : null;

  const byPlus = matchCount(trimmed.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean));
  if (byPlus) return byPlus;

  const byComma = matchCount(trimmed.split(/,\s+/).map(part => part.trim()).filter(Boolean));
  if (byComma) return byComma;

  const byProductPrefix = matchCount(
    trimmed.split(/,\s*(?=Màng\s)/u).map(part => part.trim()).filter(Boolean)
  );
  if (byProductPrefix) return byProductPrefix;

  return [trimmed];
}

export function splitProductionFieldValues(
  raw: string,
  expectedCount: number,
  options?: { duplicateSingle?: boolean }
): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || expectedCount <= 1) {
    return [trimmed || '-'];
  }

  const parts = trimmed.split(/,\s+/).map(part => part.trim()).filter(Boolean);
  if (parts.length === expectedCount) return parts;
  if (parts.length === 1) {
    if (options?.duplicateSingle) {
      return Array(expectedCount).fill(parts[0]);
    }
    return [parts[0], ...Array(expectedCount - 1).fill('-')];
  }

  return [trimmed, ...Array(expectedCount - 1).fill('-')];
}

export function expandMergedProductionProducts(
  productCode: string,
  productName: string,
  unit: string,
  quantity: string,
  orderRef?: string,
  note?: string
): OrderProductLine[] {
  const codes = splitProductionProductCodes(productCode);
  if (codes.length <= 1) {
    if (!productCode && !productName) return [];
    return [{ productCode, productName, unit, quantity, orderRef, note }];
  }

  const names = splitProductionProductNames(productName, codes.length);
  const units = splitProductionFieldValues(unit, codes.length, { duplicateSingle: true });
  const quantities = splitProductionFieldValues(quantity, codes.length);

  return codes.map((code, index) => ({
    productCode: code,
    productName: names[index] ?? names[0] ?? '',
    unit: units[index] ?? units[0] ?? unit,
    quantity: quantities[index] ?? quantities[0] ?? quantity,
    orderRef,
    note: index === 0 ? note : undefined
  }));
}

export function expandProductionOrderProductLines(lines: OrderProductLine[]): OrderProductLine[] {
  return lines.flatMap(line => {
    if (splitProductionProductCodes(line.productCode).length <= 1) return [line];
    return expandMergedProductionProducts(
      line.productCode,
      line.productName,
      line.unit,
      line.quantity,
      line.orderRef,
      line.note
    );
  });
}
