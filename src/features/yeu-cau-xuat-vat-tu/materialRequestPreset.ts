/**
 * Mẫu phiếu đề xuất nhận NVL về máy (thứ tự giấy QT).
 * Chỉ cần điền số lượng; mã/tên/ĐVT lấy từ kho NVL khi có.
 */

export type MaterialRequestPresetKind = 'bb' | 'cn';

export function hasEnteredQuantity(...values: Array<string | number | null | undefined>): boolean {
  return values.some(value => value != null && String(value).trim() !== '');
}

export function resolveMaterialPresetKind(...machineText: Array<string | undefined | null>): MaterialRequestPresetKind | null {
  const text = machineText.filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/cach\s*nhiet|\b(?:mcn|cn)\s*\d*\b/.test(text)) return 'cn';
  if (/bao\s*bi|bb/.test(text)) return 'bb';
  return null;
}

/** Đổi mẫu giữ các dòng đã nhập, chỉ bỏ dòng mẫu cũ còn trống. */
export function mergeMaterialPreset<T>(current: T[], preset: T[], code: (line: T) => string, hasInput: (line: T) => boolean): T[] {
  const key = (line: T) => code(line).trim().toLowerCase();
  const existing = new Map(current.map(line => [key(line), line]));
  const presetCodes = new Set(preset.map(key));
  return [
    ...preset.map(line => existing.get(key(line)) ?? line),
    ...current.filter(line => !presetCodes.has(key(line)) && hasInput(line))
  ];
}

export type MaterialRequestPresetItem = {
  /** Mã ưu tiên ghi trên phiếu / khớp kho. */
  code: string;
  /** Mã thay thế khi kho chưa có `code` (vd NHUA-1L → NHUA-1L-CN). */
  altCodes?: string[];
  fallbackName: string;
  fallbackUnit: string;
};

/** Order máy BB (bao bì) — mẫu đề xuất đã dùng. */
export const MATERIAL_REQUEST_PRESET_BB: MaterialRequestPresetItem[] = [
  { code: 'NHUA-1L-CN', fallbackName: 'Nguyên sinh LDPE 1L :25KG/b', fallbackUnit: 'kg' },
  { code: 'NHUA-2L', fallbackName: 'Nguyên sinh LLDPE 2L 25kg/b', fallbackUnit: 'kg' },
  { code: 'NHUA-TCMN 25kg', fallbackName: 'Nhựa tái chế mua ngoài 25kg/b', fallbackUnit: 'kg' },
  { code: 'NHUA-TC-VN', fallbackName: 'Nhựa tái chế Việt Nhật 20kg/b', fallbackUnit: 'kg' },
  { code: 'TUI KHI 65*215', fallbackName: 'Túi khí 65+15+15*215', fallbackUnit: 'kg' },
  { code: 'BK-BKT2cm', fallbackName: 'Băng keo trong 2cm', fallbackUnit: 'Cuộn' },
  { code: 'BK-BKT5cm', fallbackName: 'Băng keo trong 5cm', fallbackUnit: 'Cuộn' },
  { code: 'DAU BONG PA350', fallbackName: 'Dầu bóng phân tán', fallbackUnit: 'Lít' },
  { code: 'NVLK-BOT TANG TRANG', fallbackName: 'Bột tẩy OB1', fallbackUnit: 'kg' },
  { code: 'NHUA A1', fallbackName: 'Hạt tăng dai', fallbackUnit: 'kg' },
  { code: 'NVLK-PPA', fallbackName: 'PPA', fallbackUnit: 'kg' },
  { code: 'ONG-20CM', fallbackName: 'Ống giấy 76*2ly*20CM', fallbackUnit: 'Cái' },
  { code: 'ONG-30CM', fallbackName: 'Ống giấy 76*2ly*30CM', fallbackUnit: 'Cái' },
  { code: 'ONG-35CM', fallbackName: 'Ống giấy 76*2ly*35CM', fallbackUnit: 'Cái' },
  { code: 'ONG-40CM', fallbackName: 'Ống giấy 76*2ly*40CM', fallbackUnit: 'Cái' },
  { code: 'ONG-46CM', fallbackName: 'Ống giấy 76*2ly*46CM', fallbackUnit: 'Cái' },
  { code: 'ONG-50CM', fallbackName: 'Ống giấy 76*2ly*50CM', fallbackUnit: 'Cái' },
  { code: 'ONG-70CM', fallbackName: 'Ống giấy 76*2ly*70CM', fallbackUnit: 'Cái' },
  { code: 'NHUA-TRON', fallbackName: 'Nhựa trộn Nguyên Sinh + Tái Chế', fallbackUnit: 'kg' }
];

/**
 * Order máy CN (cách nhiệt) — mã theo mẫu đề xuất CN.
 * `code` = mã trên giấy; `altCodes` = mã đang có trong kho NVL.
 */
export const MATERIAL_REQUEST_PRESET_CN: MaterialRequestPresetItem[] = [
  {
    code: 'NHUA-1L',
    altCodes: ['NHUA-1L-CN'],
    fallbackName: 'Hạt nhựa LDPE (1L) - CÁCH NHIỆT',
    fallbackUnit: 'kg'
  },
  { code: 'NHUA-2L', fallbackName: 'Hạt nhựa LLDPE (2L)', fallbackUnit: 'kg' },
  { code: 'NHUA-TCMN 25kg', fallbackName: 'Nhựa tái chế mua ngoài 25kg', fallbackUnit: 'kg' },
  {
    code: 'NHUA-TC-VN 20kg',
    altCodes: ['NHUA-TC-VN'],
    fallbackName: 'Hạt nhựa tái chế Việt Nhật 20kg',
    fallbackUnit: 'kg'
  },
  {
    code: 'TUI-5dem',
    altCodes: ['VT-TUI05'],
    fallbackName: 'Túi 5 dem 42 x 215',
    fallbackUnit: 'kg'
  },
  { code: 'BK-BKT5cm', fallbackName: 'Băng keo trong 5cm', fallbackUnit: 'Cuộn' },
  {
    code: 'ỐNG',
    altCodes: ['ONG-1.55m', 'ONG-1.05m'],
    fallbackName: 'Ống giấy phi 76 x 3li',
    fallbackUnit: 'Cái'
  },
  { code: 'NVLK-Hat OB1', fallbackName: 'Hạt Tẩy Trắng OB1', fallbackUnit: 'kg' },
  {
    code: 'MANG19mic-1.54m',
    fallbackName: 'Màng xi 19 mic khổ 1540x3000',
    fallbackUnit: 'kg'
  },
  {
    code: 'DUNGMOI',
    altCodes: ['NVLK-DUNGMOI'],
    fallbackName: 'Dung môi V706-Dmakeup',
    fallbackUnit: 'Chai'
  },
  {
    code: 'MUCIN',
    altCodes: ['NVLK-MUCIN'],
    fallbackName: 'Mực in',
    fallbackUnit: 'Chai'
  },
  {
    code: 'TEM',
    altCodes: ['TEMRK-P2'],
    fallbackName: 'TEM RANKO',
    fallbackUnit: 'Cái'
  },
  { code: 'NHUA-TRON', fallbackName: 'Nhựa trộn Nguyên Sinh + Tái Chế', fallbackUnit: 'kg' }
];

export const MATERIAL_REQUEST_PRESET_TABS: Array<{
  id: MaterialRequestPresetKind;
  label: string;
  items: MaterialRequestPresetItem[];
}> = [
  { id: 'bb', label: 'Order máy BB', items: MATERIAL_REQUEST_PRESET_BB },
  { id: 'cn', label: 'Order máy CN', items: MATERIAL_REQUEST_PRESET_CN }
];

/** @deprecated dùng MATERIAL_REQUEST_PRESET_BB */
export const MATERIAL_REQUEST_PRESET = MATERIAL_REQUEST_PRESET_BB;

function resolveCatalogMaterial<T extends { code: string; name: string; unit: string }>(
  item: MaterialRequestPresetItem,
  byCode: Map<string, T>
): { code: string; catalog: T | undefined } {
  const primary = item.code.trim();
  const candidates = [primary, ...(item.altCodes || [])];
  for (const candidate of candidates) {
    const catalog = byCode.get(candidate.trim().toLowerCase());
    if (catalog) {
      // Có trong kho → dùng đúng mã kho để thủ kho xuất khớp.
      return { code: catalog.code || candidate, catalog };
    }
  }
  return { code: primary, catalog: undefined };
}

export function buildMaterialRequestPresetLines<T extends { code: string; name: string; unit: string }>(
  materials: T[],
  makeKey: () => string,
  kind: MaterialRequestPresetKind = 'bb'
): Array<{ key: string; code: string; name: string; unit: string; qty: string }> {
  const items =
    MATERIAL_REQUEST_PRESET_TABS.find(tab => tab.id === kind)?.items || MATERIAL_REQUEST_PRESET_BB;
  const byCode = new Map(materials.map(m => [String(m.code || '').trim().toLowerCase(), m]));
  return items.map(item => {
    const { code, catalog } = resolveCatalogMaterial(item, byCode);
    return {
      key: makeKey(),
      code,
      name: catalog?.name?.trim() || item.fallbackName,
      unit: catalog?.unit?.trim() || item.fallbackUnit,
      qty: ''
    };
  });
}
