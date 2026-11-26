import { normalizeProductCodeKey, type ProductNplItem } from '../san-pham/types';
import { materialSpecs, type ConversionMaterialOption } from './materials';

export type ProductHintRow = {
  id: string;
  code: string;
  name: string;
  items: ProductNplItem[];
};

export type DestProductHint = {
  /** Mã NVL đích (thường ống sau cắt) xuất hiện trong thành phần SP. */
  code: string;
  /** Chiều dài suy từ Kho NVL / mã. */
  lengthCm: number | null;
  /** ĐM gợi ý = floor(dài gốc / dài đích) khi cả hai có chiều dài. */
  suggestedDinhMuc: number | null;
  /** SP có thành phần / thay thế trùng mã này. */
  products: Array<{ code: string; name: string; role: 'thanh_phan' | 'thay_the'; ratioLabel: string }>;
};

function isOngCode(code: string) {
  return /^ong[-_\s.]/i.test(code.trim());
}

/**
 * Gom mã ống xuất hiện trong BOM SP (thành phần hoặc thay thế),
 * ưu tiên mã ngắn hơn vật tư gốc — dùng làm gợi ý đích cắt lõi + hiện SP nào dùng.
 */
export function buildDestHintsFromProducts(input: {
  products: ProductHintRow[];
  sourceCode: string;
  sourceLengthCm: number | null;
  materialByCode: Map<string, ConversionMaterialOption>;
}): DestProductHint[] {
  const sourceKey = normalizeProductCodeKey(input.sourceCode);
  if (!sourceKey) return [];

  const byCode = new Map<string, DestProductHint>();

  const ensure = (rawCode: string): DestProductHint | null => {
    const code = String(rawCode || '').trim();
    if (!code || !isOngCode(code)) return null;
    if (normalizeProductCodeKey(code) === sourceKey) return null;
    const existing = byCode.get(normalizeProductCodeKey(code));
    if (existing) return existing;
    const specs = materialSpecs(input.materialByCode.get(code));
    const lengthCm = specs.unitLength;
    // Chỉ gợi ý ống ngắn hơn gốc (cắt từ ống dài).
    if (
      input.sourceLengthCm != null &&
      lengthCm != null &&
      Number.isFinite(input.sourceLengthCm) &&
      Number.isFinite(lengthCm) &&
      !(lengthCm > 0 && lengthCm < input.sourceLengthCm)
    ) {
      return null;
    }
    let suggestedDinhMuc: number | null = null;
    if (
      input.sourceLengthCm != null &&
      lengthCm != null &&
      input.sourceLengthCm > 0 &&
      lengthCm > 0
    ) {
      const dm = Math.floor(input.sourceLengthCm / lengthCm + 1e-9);
      if (dm >= 1) suggestedDinhMuc = dm;
    }
    const hint: DestProductHint = { code, lengthCm, suggestedDinhMuc, products: [] };
    byCode.set(normalizeProductCodeKey(code), hint);
    return hint;
  };

  for (const product of input.products) {
    for (const item of product.items) {
      const componentCode = String(item.code || '').trim();
      if (componentCode) {
        const hint = ensure(componentCode);
        if (hint && !hint.products.some(p => p.code === product.code && p.role === 'thanh_phan')) {
          const qty = item.quantity ?? item.percent;
          hint.products.push({
            code: product.code,
            name: product.name,
            role: 'thanh_phan',
            ratioLabel: qty != null && Number.isFinite(qty) ? `ĐM SP ${qty}` : 'Thành phần'
          });
        }
      }
      for (const sub of item.substitutes ?? []) {
        const subCode = String(sub.code || '').trim();
        if (!subCode) continue;
        const hint = ensure(subCode);
        if (!hint) continue;
        if (hint.products.some(p => p.code === product.code && p.role === 'thay_the' && p.ratioLabel.includes(subCode))) {
          continue;
        }
        // Tránh trùng dòng cùng SP đã ghi thành phần cùng mã.
        if (
          normalizeProductCodeKey(subCode) === normalizeProductCodeKey(componentCode) &&
          hint.products.some(p => p.code === product.code && p.role === 'thanh_phan')
        ) {
          continue;
        }
        hint.products.push({
          code: product.code,
          name: product.name,
          role: 'thay_the',
          ratioLabel: `${sub.quantity} ${subCode} = ${sub.componentQuantity} ${componentCode || 'TP'}`
        });
      }
    }
  }

  return [...byCode.values()]
    .filter(hint => hint.products.length > 0)
    .sort((a, b) => {
      const la = a.lengthCm ?? Number.POSITIVE_INFINITY;
      const lb = b.lengthCm ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return a.code.localeCompare(b.code, 'vi', { numeric: true });
    });
}

/** SP dùng một mã NVL (thành phần hoặc thay thế). */
export function findProductsUsingMaterial(
  products: ProductHintRow[],
  materialCode: string
): Array<{ code: string; name: string; role: 'thanh_phan' | 'thay_the'; detail: string }> {
  const key = normalizeProductCodeKey(materialCode);
  if (!key) return [];
  const out: Array<{ code: string; name: string; role: 'thanh_phan' | 'thay_the'; detail: string }> = [];
  for (const product of products) {
    for (const item of product.items) {
      if (normalizeProductCodeKey(item.code) === key) {
        out.push({
          code: product.code,
          name: product.name,
          role: 'thanh_phan',
          detail: 'Thành phần'
        });
      }
      for (const sub of item.substitutes ?? []) {
        if (normalizeProductCodeKey(sub.code) === key) {
          out.push({
            code: product.code,
            name: product.name,
            role: 'thay_the',
            detail: `${sub.quantity} = ${sub.componentQuantity} ${item.code}`
          });
        }
      }
    }
  }
  return out;
}
