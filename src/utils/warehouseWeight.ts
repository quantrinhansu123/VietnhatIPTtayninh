import { formatNumber } from '../utils';

export type WarehouseWeightKind = 'nvl' | 'san_pham';

export type WarehouseWeightCatalogItem = {
  code: string;
  name?: string;
  unit?: string;
  /** Cột "Tổng kg" trong kho NVL / Tổng TL SP — hệ số kg / 1 đơn vị. */
  totalWeight?: string;
  coreWeight?: string;
  bagWeight?: string;
  plasticWeight?: string;
};

function normalizeWarehouseText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeWarehouseUnit(unit: string) {
  return normalizeWarehouseText(unit);
}

/** Chuẩn hóa mã để khớp BOM ↔ kho NVL (bỏ khoảng trắng, không phân biệt hoa thường). */
export function normalizeWarehouseCodeKey(code: string) {
  return String(code || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function isWarehouseKgUnit(unit: string) {
  const normalized = normalizeWarehouseUnit(unit);
  if (!normalized) return false;
  if (
    normalized === 'kg' ||
    normalized === 'kgs' ||
    normalized === 'kg.' ||
    normalized === 'kilogram' ||
    normalized === 'kilograms' ||
    normalized === 'kilogam' ||
    normalized === 'kilogramo'
  ) {
    return true;
  }
  // "kg/sp", "kg/cuon", "kg / cái" — đơn vị gốc đã là kg
  return normalized.startsWith('kg/') || normalized.startsWith('kg ');
}

/** ĐVT Lít / liter (dầu bóng, phụ gia lỏng…). */
export function isWarehouseLiterUnit(unit: string) {
  const normalized = normalizeWarehouseUnit(unit);
  if (!normalized) return false;
  if (
    normalized === 'l' ||
    normalized === 'l.' ||
    normalized === 'lit' ||
    normalized === 'liter' ||
    normalized === 'litre' ||
    normalized === 'liters' ||
    normalized === 'litres' ||
    normalized === 'lit.'
  ) {
    return true;
  }
  return (
    normalized.startsWith('lit/') ||
    normalized.startsWith('lit ') ||
    normalized.startsWith('l/') ||
    normalized.startsWith('l ')
  );
}

/**
 * ĐVT thuộc «NVL nhựa và phụ gia trộn»: kg hoặc Lít.
 * Cái / Cuộn / m2 / đơn vị khác → không.
 */
export function isWarehouseMixingUnit(unit: string) {
  return isWarehouseKgUnit(unit) || isWarehouseLiterUnit(unit);
}

function parseWeightNumber(value: string | number | undefined | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;

  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** Suy luận kg/đơn vị từ tên hoặc mã NVL (vd. "1kg = 7.5 cái", "Lõi 1.5m - 1kg"). */
export function inferWarehouseWeightPerUnitFromLabel(name: string, code = ''): number | null {
  const hay = normalizeWarehouseText(`${name} ${code}`);

  const kgPerCount = hay.match(/(\d+(?:[.,]\d+)?)\s*kg\s*=\s*(\d+(?:[.,]\d+)?)\s*cai/);
  if (kgPerCount) {
    const kg = parseWeightNumber(kgPerCount[1]);
    const count = parseWeightNumber(kgPerCount[2]);
    if (kg !== null && count !== null) return kg / count;
  }

  const countPerKg = hay.match(/(\d+(?:[.,]\d+)?)\s*cai\s*=\s*(\d+(?:[.,]\d+)?)\s*kg/);
  if (countPerKg) {
    const count = parseWeightNumber(countPerKg[1]);
    const kg = parseWeightNumber(countPerKg[2]);
    if (kg !== null && count !== null) return kg / count;
  }

  const codeKg = hay.match(/-(\d+(?:[.,]\d+)?)kg\b/);
  if (codeKg) {
    const fromCode = parseWeightNumber(codeKg[1]);
    if (fromCode !== null) return fromCode;
  }

  const loiKg = hay.match(/\bloi\b[^0-9]{0,24}(\d+(?:[.,]\d+)?)\s*kg\b/);
  if (loiKg) {
    const fromLoi = parseWeightNumber(loiKg[1]);
    if (fromLoi !== null) return fromLoi;
  }

  const trailingKg = hay.match(/\b(\d+(?:[.,]\d+)?)\s*kg\s*$/);
  if (trailingKg) {
    const fromTrailing = parseWeightNumber(trailingKg[1]);
    if (fromTrailing !== null) return fromTrailing;
  }

  return null;
}

/**
 * Hệ số kg/đơn vị từ cột "Tổng kg" (kho NVL) — ưu tiên tuyệt đối.
 * Không suy từ tên / cột kg túi / kg lõi khi đã có catalog NVL.
 */
export function resolveMaterialTongKgPerUnit(
  item: WarehouseWeightCatalogItem | null | undefined
): number | null {
  if (!item) return null;
  return parseWeightNumber(item.totalWeight);
}

function resolveCatalogWeightPerUnit(
  item: WarehouseWeightCatalogItem | null | undefined,
  options?: { preferTongKgOnly?: boolean }
): number | null {
  if (!item) return null;

  const fromTotal = parseWeightNumber(item.totalWeight);
  if (fromTotal !== null) return fromTotal;

  // NVL trên bảng điều khiển: chỉ lấy cột Tổng kg — thiếu thì không quy đổi.
  if (options?.preferTongKgOnly) return null;

  const hay = normalizeWarehouseText(`${item.name ?? ''} ${item.code ?? ''}`);

  if (hay.includes('loi')) {
    const fromCore = parseWeightNumber(item.coreWeight);
    if (fromCore !== null) return fromCore;
  }

  if (hay.includes('tui') || hay.includes('tai nilon') || hay.includes('bao bi')) {
    const fromBag = parseWeightNumber(item.bagWeight);
    if (fromBag !== null) return fromBag;
  }

  const fromCore = parseWeightNumber(item.coreWeight);
  if (fromCore !== null) return fromCore;

  const fromBag = parseWeightNumber(item.bagWeight);
  if (fromBag !== null) return fromBag;

  const fromPlastic = parseWeightNumber(item.plasticWeight);
  if (fromPlastic !== null) return fromPlastic;

  return inferWarehouseWeightPerUnitFromLabel(item.name ?? '', item.code ?? '');
}

function findCatalogItem(
  itemCode: string,
  materials: WarehouseWeightCatalogItem[],
  products: WarehouseWeightCatalogItem[]
) {
  const codeKey = normalizeWarehouseCodeKey(itemCode);
  if (!codeKey) return null;

  return (
    materials.find(item => normalizeWarehouseCodeKey(item.code) === codeKey) ??
    products.find(item => normalizeWarehouseCodeKey(item.code) === codeKey) ??
    null
  );
}

function findCatalogWeightPerUnit(
  itemCode: string,
  warehouseKind: WarehouseWeightKind | undefined,
  materials: WarehouseWeightCatalogItem[],
  products: WarehouseWeightCatalogItem[],
  options?: { preferTongKgOnly?: boolean }
): number | null {
  const codeKey = normalizeWarehouseCodeKey(itemCode);
  if (!codeKey) return null;

  if (warehouseKind === 'san_pham') {
    const product = products.find(item => normalizeWarehouseCodeKey(item.code) === codeKey);
    const fromProduct = resolveCatalogWeightPerUnit(product, options);
    if (fromProduct !== null) return fromProduct;
  } else if (warehouseKind === 'nvl') {
    const material = materials.find(item => normalizeWarehouseCodeKey(item.code) === codeKey);
    const fromMaterial = resolveCatalogWeightPerUnit(material, {
      preferTongKgOnly: options?.preferTongKgOnly !== false
    });
    if (fromMaterial !== null) return fromMaterial;
    if (options?.preferTongKgOnly !== false) return null;
  }

  return resolveCatalogWeightPerUnit(findCatalogItem(itemCode, materials, products), options);
}

/** Tra cứu hệ số kg/đvt từ cột Tổng kg kho NVL theo mã. */
export function findMaterialTongKgPerUnit(
  itemCode: string,
  materials: WarehouseWeightCatalogItem[]
): number | null {
  const codeKey = normalizeWarehouseCodeKey(itemCode);
  if (!codeKey) return null;
  const material = materials.find(item => normalizeWarehouseCodeKey(item.code) === codeKey);
  return resolveMaterialTongKgPerUnit(material);
}

/** Quy đổi SL + ĐVT về kg: ĐVT kg → giữ nguyên SL (không nhân Tổng kg/định mức); còn lại = SL × Tổng kg. */
export function convertWarehouseQuantityToKg(input: {
  quantity: number;
  unit: string;
  itemCode?: string;
  warehouseKind?: WarehouseWeightKind;
  materials?: WarehouseWeightCatalogItem[];
  products?: WarehouseWeightCatalogItem[];
  /** Mặc định true với kho NVL: chỉ dùng cột Tổng kg, không suy từ tên. */
  preferTongKgOnly?: boolean;
}): number | null {
  const quantity = input.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unitRaw = String(input.unit || '').trim();
  if (!unitRaw || unitRaw === '-') return null;

  // ĐVT đã là kg → KL = SL, không nhân hệ số Tổng kg / định mức
  if (isWarehouseKgUnit(unitRaw)) return quantity;

  const unit = normalizeWarehouseUnit(unitRaw);

  if (unit === 't' || unit === 'tan' || unit === 'ton' || unit === 'tonne' || unit === 'mt') {
    return quantity * 1000;
  }

  if (unit === 'g' || unit === 'gr' || unit === 'gram' || unit === 'gam') {
    return quantity / 1000;
  }

  const preferTongKgOnly = input.preferTongKgOnly ?? input.warehouseKind === 'nvl';

  const perUnit = findCatalogWeightPerUnit(
    input.itemCode ?? '',
    input.warehouseKind,
    input.materials ?? [],
    input.products ?? [],
    { preferTongKgOnly }
  );
  if (perUnit === null) return null;

  return quantity * perUnit;
}

export function formatWarehouseWeightKg(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${formatNumber(value, 3)} kg`;
}

export function mapMaterialToWeightCatalogItem(material: {
  code: string;
  name?: string;
  unit?: string;
  totalWeight?: string;
  coreWeight?: string;
  bagWeight?: string;
  plasticWeight?: string;
}): WarehouseWeightCatalogItem {
  return {
    code: material.code,
    name: material.name,
    unit: material.unit,
    totalWeight: material.totalWeight,
    coreWeight: material.coreWeight,
    bagWeight: material.bagWeight,
    plasticWeight: material.plasticWeight
  };
}

export function mapProductToWeightCatalogItem(product: {
  code: string;
  name?: string;
  unit?: string;
  totalWeight?: string;
  coreWeight?: string;
  bagWeight?: string;
  plasticWeight?: string;
}): WarehouseWeightCatalogItem {
  return mapMaterialToWeightCatalogItem(product);
}
