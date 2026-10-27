import { normalizeProductCodeKey } from '../features/san-pham/types';

/**
 * Thứ tự mã vật tư trên mẫu QT (Bảng trộn vật tư).
 * Có thì xếp đúng vị trí; không có thì bỏ qua; mã khác xếp sau theo alphabet.
 */
export const MATERIAL_MISA_SORT_ORDER = [
  'NHUA-1L',
  'NHUA-2L',
  'NHUA-TCMN 25kg',
  'NHUA-TCVN 25kg',
  'TUI KHI 65*215',
  'BK-BKT2cm',
  'BK-BKT5cm',
  'DAU BONG',
  'NVLK-BOT TANG TRANG',
  'NHUA A1',
  'NVLK-PPA',
  'ONG GIAY',
  'NHUA-TRON (PHỄU)',
  'NHUA-TRON (BỒN)'
] as const;

const AFTER_PRIORITY_RANK = MATERIAL_MISA_SORT_ORDER.length;

function stripDiacritics(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Khóa so khớp: bỏ khoảng trắng / dấu / ký tự không chữ-số (giữ *). */
export function materialMisaCompactKey(code: string) {
  return stripDiacritics(normalizeProductCodeKey(code)).replace(/[^A-Z0-9*]/g, '');
}

const ORDER_COMPACT = MATERIAL_MISA_SORT_ORDER.map(code => materialMisaCompactKey(code));
const ONG_GIAY_RANK = ORDER_COMPACT.indexOf(materialMisaCompactKey('ONG GIAY'));
const TRON_PHEU_RANK = ORDER_COMPACT.findIndex(key => key.includes('NHUATRON') && key.includes('PHEU'));
const TRON_BON_RANK = ORDER_COMPACT.findIndex(key => key.includes('NHUATRON') && key.includes('BON'));

function exactOrderRank(compact: string) {
  const exact = ORDER_COMPACT.indexOf(compact);
  if (exact >= 0) return exact;
  // NHUA A1 / NHUA-A1 / NHUA_A1
  if (compact === 'NHUAA1' || compact === 'NHUA1A') {
    const idx = ORDER_COMPACT.findIndex(key => key === 'NHUAA1' || key === materialMisaCompactKey('NHUA A1'));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Hạng sắp xếp (nhỏ hơn = trên). Mã ngoài mẫu → AFTER_PRIORITY_RANK. */
export function materialMisaSortRank(code: string) {
  const compact = materialMisaCompactKey(code);
  if (!compact) return AFTER_PRIORITY_RANK + 1;

  const exact = exactOrderRank(compact);
  if (exact >= 0) return exact;

  if (compact.startsWith('ONGGIAY') || compact.includes('ONGGIAY')) {
    return ONG_GIAY_RANK >= 0 ? ONG_GIAY_RANK : AFTER_PRIORITY_RANK;
  }

  if (compact.includes('NHUATRON')) {
    if (compact.includes('PHEU') || compact.includes('PHIEU') || compact.includes('PHE')) {
      return TRON_PHEU_RANK >= 0 ? TRON_PHEU_RANK : AFTER_PRIORITY_RANK;
    }
    if (compact.includes('BON')) {
      return TRON_BON_RANK >= 0 ? TRON_BON_RANK : AFTER_PRIORITY_RANK;
    }
  }

  // Khớp gần: mã bắt đầu bằng mục trong mẫu (vd. NHUA-1L-... / TUIKHI65*)
  for (let index = 0; index < ORDER_COMPACT.length; index += 1) {
    const token = ORDER_COMPACT[index];
    if (!token || token === 'ONGGIAY') continue;
    if (compact === token || compact.startsWith(token) || token.startsWith(compact)) {
      return index;
    }
  }

  return AFTER_PRIORITY_RANK;
}

/** So sánh hai mã theo thứ tự mẫu QT; mã ngoài mẫu xếp sau, rồi alphabet. */
export function compareMaterialMisaCode(leftCode: string, rightCode: string) {
  const leftRank = materialMisaSortRank(leftCode);
  const rightRank = materialMisaSortRank(rightCode);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return String(leftCode || '').localeCompare(String(rightCode || ''), 'vi', { numeric: true });
}

export function sortByMaterialMisaCode<T>(items: T[], getCode: (item: T) => string) {
  return [...items].sort((left, right) => compareMaterialMisaCode(getCode(left), getCode(right)));
}
