/**
 * Mẫu phiếu đề xuất nhận NVL về máy (thứ tự giấy QT).
 * Chỉ cần điền số lượng; mã/tên/ĐVT lấy từ kho NVL khi có.
 */
export type MaterialRequestPresetItem = {
  code: string;
  fallbackName: string;
  fallbackUnit: string;
};

export const MATERIAL_REQUEST_PRESET: MaterialRequestPresetItem[] = [
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
  { code: 'ONG-70CM', fallbackName: 'Ống giấy 76*2ly*70CM', fallbackUnit: 'Cái' }
];

export function buildMaterialRequestPresetLines<T extends { code: string; name: string; unit: string }>(
  materials: T[],
  makeKey: () => string
): Array<{ key: string; code: string; name: string; unit: string; qty: string }> {
  const byCode = new Map(materials.map(m => [String(m.code || '').trim().toLowerCase(), m]));
  return MATERIAL_REQUEST_PRESET.map(item => {
    const catalog = byCode.get(item.code.trim().toLowerCase());
    return {
      key: makeKey(),
      code: item.code,
      name: catalog?.name?.trim() || item.fallbackName,
      unit: catalog?.unit?.trim() || item.fallbackUnit,
      qty: ''
    };
  });
}
