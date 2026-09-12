import { parsePercentInput } from '../utils';
import { shiftNamesMatch } from './shiftSettings';
import { isWarehouseKgUnit } from './warehouseWeight';
import type { MixingPhoiTron, MixingReportLine, MixingRoundItem } from '../components/MixingReportForm';

export type MixingBomItem = {
  code: string;
  name: string;
  unit: string;
  amountType: 'percent' | 'quantity';
  percent: number | null;
  quantity: number | null;
};

export type MixingCatalogProduct = {
  code: string;
  name: string;
  altCodes: string[];
  nplItems: MixingBomItem[];
};

export type MixingSalesOrder = {
  id: string;
  orderCode: string;
  customer: string;
  productLines: Array<{
    productCode: string;
    productName: string;
    unit: string;
  }>;
};

export type MixingProductionOrder = {
  id: string;
  orderCode: string;
  shift: string;
  machine: string;
  startDate: string;
  staff: string;
  productLines: Array<{
    productCode: string;
    productName: string;
    unit: string;
  }>;
};

export type MixingOrderProductCandidate = {
  key: string;
  orderCode: string;
  productCode: string;
  productName: string;
  unit: string;
  bomItems: MixingBomItem[];
};

function pickText(record: Record<string, unknown>, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return fallback;
}

function normalizeKey(value: string) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function roundNplNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveBomAmountType(record: Record<string, unknown>): 'percent' | 'quantity' {
  const loai = String(record.loai ?? record.amountType ?? record.dinh_luong_loai ?? '').trim().toLowerCase();
  if (loai === 'so_luong' || loai === 'quantity') return 'quantity';
  if (loai === 'phan_tram' || loai === 'percent') return 'percent';

  const quantityRaw = record.so_luong ?? record.quantity;
  const percentRaw = record.phan_tram ?? record.percent ?? record.ty_le;
  const quantity = parsePercentInput(String(quantityRaw ?? ''));
  const percent = parsePercentInput(String(percentRaw ?? ''));

  if (
    quantityRaw !== undefined &&
    quantityRaw !== null &&
    quantityRaw !== '' &&
    (percentRaw === undefined || percentRaw === null || percentRaw === '')
  ) {
    return 'quantity';
  }

  if (Number.isFinite(quantity) && !Number.isFinite(percent)) return 'quantity';
  return 'percent';
}

export function parseMixingProductBom(raw: unknown): MixingBomItem[] {
  let source = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(source)
    ? source
    : source && typeof source === 'object' && Array.isArray((source as { items?: unknown }).items)
      ? (source as { items: unknown[] }).items
      : [];

  return list
    .map((entry): MixingBomItem | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.code ?? record.ma ?? '').trim();
      const name = String(record.ten_npl ?? record.name ?? record.ten ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim() || 'kg';
      const amountType = resolveBomAmountType(record);
      if (!code) return null;

      if (amountType === 'quantity') {
        const quantity = parsePercentInput(String(record.so_luong ?? record.quantity ?? ''));
        if (!Number.isFinite(quantity) || quantity < 0) return null;
        return {
          code,
          name,
          unit,
          amountType: 'quantity',
          percent: null,
          quantity: roundNplNumber(quantity)
        };
      }

      const percent = parsePercentInput(String(record.phan_tram ?? record.percent ?? record.ty_le ?? ''));
      if (!Number.isFinite(percent) || percent <= 0) return null;
      return {
        code,
        name,
        unit,
        amountType: 'percent',
        percent: roundNplNumber(percent),
        quantity: null
      };
    })
    .filter((item): item is MixingBomItem => Boolean(item));
}

function splitProductionProductCodes(raw: string): string[] {
  return raw
    .split(',')
    .map(code => code.trim())
    .filter(code => code && code !== '-');
}

function splitProductionProductNames(raw: string, expectedCount: number): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || expectedCount <= 1) {
    return trimmed && trimmed !== '-' ? [trimmed] : [];
  }

  const matchCount = (parts: string[]) => (parts.length === expectedCount ? parts : null);
  const byPlus = matchCount(trimmed.split(/\s+\+\s+/).map(part => part.trim()).filter(Boolean));
  if (byPlus) return byPlus;

  const byComma = matchCount(trimmed.split(/,\s+/).map(part => part.trim()).filter(Boolean));
  if (byComma) return byComma;

  return [trimmed];
}

function splitProductionFieldValues(
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

function expandMergedProductionProducts(
  productCode: string,
  productName: string,
  unit: string
): Array<{ productCode: string; productName: string; unit: string }> {
  const codes = splitProductionProductCodes(productCode);
  if (codes.length <= 1) {
    if (!productCode && !productName) return [];
    return [{ productCode, productName, unit }];
  }

  const names = splitProductionProductNames(productName, codes.length);
  const units = splitProductionFieldValues(unit, codes.length, { duplicateSingle: true });

  return codes.map((code, index) => ({
    productCode: code,
    productName: names[index] ?? names[0] ?? '',
    unit: units[index] ?? units[0] ?? unit
  }));
}

function expandProductionOrderProductLines(
  lines: Array<{ productCode: string; productName: string; unit: string }>
): Array<{ productCode: string; productName: string; unit: string }> {
  return lines.flatMap(line => {
    if (splitProductionProductCodes(line.productCode).length <= 1) return [line];
    return expandMergedProductionProducts(line.productCode, line.productName, line.unit);
  });
}

function parseOrderProductLines(record: Record<string, unknown>) {
  let raw = record.san_pham ?? record.products;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        raw = trimmed;
      }
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nested =
      (raw as { items?: unknown }).items ??
      (raw as { products?: unknown }).products ??
      (raw as { san_pham?: unknown }).san_pham;
    if (Array.isArray(nested)) {
      raw = nested;
    }
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return expandProductionOrderProductLines(
      raw
        .map((item): { productCode: string; productName: string; unit: string } | null => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const productCode = pickText(row, ['ma_sp', 'ma_hang', 'product_code', 'code'], '');
          const productName = pickText(row, ['ten_sp', 'ten_hang', 'product_name', 'name'], '');
          if (!productCode && !productName) return null;
          return {
            productCode,
            productName,
            unit: pickText(row, ['don_vi', 'unit'], '-')
          };
        })
        .filter((line): line is { productCode: string; productName: string; unit: string } => Boolean(line))
    );
  }

  const productCode = pickText(record, ['ma_hang', 'ma_sp', 'product_code'], '');
  const productName = pickText(record, ['ten_hang', 'ten_sp', 'product_name'], '');
  if (!productCode && !productName) return [];

  return expandMergedProductionProducts(
    productCode,
    productName,
    pickText(record, ['don_vi', 'unit'], '-')
  );
}

export function normalizeMixingSalesOrders(data: unknown): MixingSalesOrder[] {
  if (!data || typeof data !== 'object') return [];
  const orders = (data as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];

  return orders
    .map((item): MixingSalesOrder | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const orderCode = pickText(record, ['ma_don_hang', 'order_code', 'code'], '');
      const productLines = parseOrderProductLines(record);
      if (!orderCode && productLines.length === 0) return null;

      return {
        id: String(record.id ?? '').trim() || orderCode,
        orderCode,
        customer: pickText(record, ['khach_hang', 'customer'], '-'),
        productLines
      };
    })
    .filter((order): order is MixingSalesOrder => Boolean(order));
}

export function normalizeMixingProductionOrders(data: unknown): MixingProductionOrder[] {
  if (!data || typeof data !== 'object') return [];
  const orders = (data as { productionOrders?: unknown }).productionOrders;
  if (!Array.isArray(orders)) return [];

  return orders
    .map((item): MixingProductionOrder | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const orderCode = pickText(record, ['ma_lenh_sx', 'code', 'so_lenh'], '');
      const productLines = parseOrderProductLines(record);
      if (!orderCode && productLines.length === 0) return null;

      return {
        id: String(record.id ?? '').trim() || orderCode,
        orderCode,
        shift: pickText(record, ['ca', 'shift'], ''),
        machine: pickText(record, ['may', 'ma_may', 'ten_may', 'machine'], ''),
        startDate: pickText(
          record,
          ['ngay_gio_bat_dau', 'ngay_bat_dau', 'start_date', 'ngay_san_xuat', 'ngay_sx', 'ngay'],
          ''
        ).slice(0, 10),
        staff: pickText(record, ['nhan_su', 'staff', 'cong_nhan'], ''),
        productLines
      };
    })
    .filter((order): order is MixingProductionOrder => Boolean(order));
}

function extractIsoDate(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '-') return '';
  const match = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function shiftMatches(orderShift: string, selectedShift: string) {
  if (!orderShift || !selectedShift) return false;
  if (shiftNamesMatch(orderShift, selectedShift)) return true;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right;
}

function machineMatches(
  orderMachine: string,
  machineCode: string,
  machineName: string,
  machines: Array<{ code: string; name: string }> = []
) {
  const ref = orderMachine.trim();
  if (!ref || ref === '-') return false;

  const candidates = new Set<string>();
  if (machineCode) candidates.add(normalizeKey(machineCode));
  if (machineName) candidates.add(normalizeKey(machineName));
  if (machineCode && machineName) candidates.add(normalizeKey(`${machineCode} · ${machineName}`));

  const selectedMachine = machines.find(machine => {
    const codeKey = normalizeKey(machine.code);
    const nameKey = normalizeKey(machine.name);
    return candidates.has(codeKey) || candidates.has(nameKey);
  });
  if (selectedMachine) {
    candidates.add(normalizeKey(selectedMachine.code));
    candidates.add(normalizeKey(selectedMachine.name));
    candidates.add(normalizeKey(`${selectedMachine.code} · ${selectedMachine.name}`));
  }

  const refKey = normalizeKey(ref);
  return [...candidates].some(key => key && (key === refKey || key.includes(refKey) || refKey.includes(key)));
}

export function filterMixingProductionOrders(
  orders: MixingProductionOrder[],
  filters: { ngay: string; ca: string; maMay: string; tenMay: string },
  machines: Array<{ code: string; name: string }> = []
) {
  const selectedCa = filters.ca.trim();
  const hasMachine = Boolean(filters.maMay.trim() || filters.tenMay.trim());
  if (!selectedCa || !hasMachine) return [];

  return orders.filter(order => {
    const orderDate = extractIsoDate(order.startDate);
    if (filters.ngay && orderDate !== filters.ngay) return false;
    if (!shiftMatches(order.shift, selectedCa)) return false;
    if (!machineMatches(order.machine, filters.maMay, filters.tenMay, machines)) return false;
    return order.productLines.some(line => line.productCode.trim());
  });
}

export function findMatchedMachineForShift(
  orders: MixingProductionOrder[],
  filters: { ngay: string; ca: string },
  machines: Array<{ code: string; name: string }> = []
): string {
  const ngay = filters.ngay.trim();
  const ca = filters.ca.trim();
  if (!ngay || !ca) return '';

  const match = orders.find(order => {
    if (!order.machine.trim()) return false;
    const orderDate = extractIsoDate(order.startDate);
    if (orderDate !== ngay) return false;
    return shiftMatches(order.shift, ca);
  });
  if (!match) return '';

  const machineRef = match.machine.trim();
  const known = machines.find(
    machine =>
      (machine.code && normalizeKey(machine.code) === normalizeKey(machineRef)) ||
      (machine.name && normalizeKey(machine.name) === normalizeKey(machineRef))
  );
  return known?.name || machineRef;
}

export type WeighingOrderProductOption = {
  productCode: string;
  productName: string;
  newCode?: string;
};

export function buildWeighingProductOptionsFromOrders(
  orders: MixingProductionOrder[],
  filters: { ngay: string; ca: string; machineName: string },
  machines: Array<{ code: string; name: string }> = [],
  catalogProducts: Array<{ productCode: string; productName: string; newCode?: string }> = []
): WeighingOrderProductOption[] {
  const machineName = filters.machineName.trim();
  if (!filters.ngay.trim() || !filters.ca.trim() || !machineName) return [];

  const selectedMachine = machines.find(
    machine => machine.name === machineName || machine.code === machineName
  );
  const maMay = selectedMachine?.code ?? '';
  const tenMay = selectedMachine?.name || machineName;

  const matchedOrders = filterMixingProductionOrders(
    orders,
    { ngay: filters.ngay.trim(), ca: filters.ca.trim(), maMay, tenMay },
    machines
  );

  const byCode = new Map<string, WeighingOrderProductOption>();

  const findCatalog = (code: string) =>
    catalogProducts.find(
      product =>
        product.productCode.toLowerCase() === code.toLowerCase() ||
        product.newCode?.toLowerCase() === code.toLowerCase()
    );

  matchedOrders.forEach(order => {
    order.productLines.forEach(line => {
      const productCode = line.productCode.trim();
      if (!productCode) return;
      const key = productCode.toLowerCase();
      const catalog = findCatalog(productCode);
      byCode.set(key, {
        productCode,
        productName: line.productName || catalog?.productName || productCode,
        newCode: catalog?.newCode
      });
    });
  });

  return [...byCode.values()].sort((a, b) => a.productCode.localeCompare(b.productCode, 'vi'));
}

export function buildMixingProductionOrderProductCandidates(
  orders: MixingProductionOrder[],
  selectedOrderCodes: string[],
  catalogProducts: MixingCatalogProduct[]
): MixingOrderProductCandidate[] {
  const selected = new Set(selectedOrderCodes.map(code => code.trim()).filter(Boolean));
  const map = new Map<string, MixingOrderProductCandidate>();

  orders
    .filter(order => selected.has(order.orderCode))
    .forEach(order => {
      order.productLines.forEach(line => {
        const productCode = line.productCode.trim();
        if (!productCode) return;

        const key = mixingOrderProductKey(order.orderCode, productCode);
        const catalog = findCatalogProduct(catalogProducts, productCode);
        const bomItems = catalog?.nplItems ?? [];

        map.set(key, {
          key,
          orderCode: order.orderCode,
          productCode,
          productName: line.productName || catalog?.name || productCode,
          unit: line.unit && line.unit !== '-' ? line.unit : 'kg',
          bomItems
        });
      });
    });

  return [...map.values()].sort((a, b) =>
    `${a.orderCode} ${a.productCode}`.localeCompare(`${b.orderCode} ${b.productCode}`, 'vi')
  );
}

export function buildMixingRoundItemsFromProductCandidates(
  candidates: MixingOrderProductCandidate[],
  selectedKeys: string[],
  materials: Array<{ code: string; name: string; unit: string }>
) {
  const materialLookup = new Map(
    materials.map(material => [
      normalizeKey(material.code),
      { name: material.name, unit: material.unit || 'kg' }
    ])
  );

  const keySet = new Set(selectedKeys);
  const items: MixingRoundItem[] = [];

  candidates
    .filter(candidate => keySet.has(candidate.key))
    .forEach(candidate => {
      items.push(...bomToRoundItems(candidate.bomItems, materialLookup));
    });

  return items;
}

export function normalizeMixingCatalogProducts(data: unknown): MixingCatalogProduct[] {
  if (!data || typeof data !== 'object') return [];
  const products = (data as { products?: unknown }).products;
  if (!Array.isArray(products)) return [];

  return products
    .map((item): MixingCatalogProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = pickText(record, ['ma_sp', 'code'], '');
      const name = pickText(record, ['ten_sp', 'name'], '');
      if (!code && !name) return null;

      return {
        code,
        name,
        altCodes: [
          pickText(record, ['ma_sp_moi', 'newCode'], ''),
          pickText(record, ['ma_amis', 'amisCode'], '')
        ].filter(Boolean),
        nplItems: parseMixingProductBom(
          record.npl_phan_tram ??
            record.nplPhanTram ??
            record.nplItems ??
            record.thanh_phan ??
            record.dinh_muc
        )
      };
    })
    .filter((product): product is MixingCatalogProduct => Boolean(product));
}

export function mixingOrderProductKey(orderCode: string, productCode: string) {
  return `${orderCode}::${productCode}`;
}

function findCatalogProduct(catalog: MixingCatalogProduct[], productCode: string) {
  const key = normalizeKey(productCode);
  return catalog.find(product => {
    const codes = [product.code, ...product.altCodes].map(normalizeKey).filter(Boolean);
    return codes.includes(key) || (product.name && normalizeKey(product.name) === key);
  });
}

export function buildMixingOrderProductCandidates(
  orders: MixingSalesOrder[],
  selectedOrderCodes: string[],
  catalogProducts: MixingCatalogProduct[]
): MixingOrderProductCandidate[] {
  const selected = new Set(selectedOrderCodes.map(code => code.trim()).filter(Boolean));
  const map = new Map<string, MixingOrderProductCandidate>();

  orders
    .filter(order => selected.has(order.orderCode))
    .forEach(order => {
      order.productLines.forEach(line => {
        const productCode = line.productCode.trim();
        if (!productCode) return;

        const key = mixingOrderProductKey(order.orderCode, productCode);
        const catalog = findCatalogProduct(catalogProducts, productCode);
        const bomItems = catalog?.nplItems ?? [];

        map.set(key, {
          key,
          orderCode: order.orderCode,
          productCode,
          productName: line.productName || catalog?.name || productCode,
          unit: line.unit && line.unit !== '-' ? line.unit : 'kg',
          bomItems
        });
      });
    });

  return [...map.values()].sort((a, b) =>
    `${a.orderCode} ${a.productCode}`.localeCompare(`${b.orderCode} ${b.productCode}`, 'vi')
  );
}

function isMixingKgItem(item: MixingBomItem): boolean {
  // Chỉ lấy NVL tính theo % (loại percent) hoặc đơn vị kg.
  // Bỏ qua NVL loại số lượng đơn vị khác kg (Cái, Cuộn, m...).
  if (item.amountType === 'percent') return true;
  const unit = (item.unit || '').trim();
  return !unit || unit === '-' || isWarehouseKgUnit(unit);
}

function bomToRoundItems(
  bomItems: MixingBomItem[],
  materialLookup: Map<string, { name: string; unit: string }>
): MixingRoundItem[] {
  return bomItems
    .filter(isMixingKgItem)
    .map(item => {
      const matched = materialLookup.get(normalizeKey(item.code));
      return {
        ma_nvl: item.code,
        ten_vat_tu: item.name || matched?.name || item.code,
        don_vi: item.unit && item.unit !== '-' ? item.unit : matched?.unit || 'kg',
        ti_le_phan_tram: item.amountType === 'percent' ? item.percent : null,
        so_luong: item.amountType === 'quantity' ? item.quantity : null,
        kl_thuc_te: null
      };
    });
}

export function buildMixingLinesFromOrderProducts(
  candidates: MixingOrderProductCandidate[],
  selectedKeys: string[],
  materials: Array<{ code: string; name: string; unit: string }>,
  startStt = 1
): MixingReportLine[] {
  const materialLookup = new Map(
    materials.map(material => [
      normalizeKey(material.code),
      { name: material.name, unit: material.unit || 'kg' }
    ])
  );

  const keySet = new Set(selectedKeys);
  const lines: MixingReportLine[] = [];

  candidates
    .filter(candidate => keySet.has(candidate.key))
    .forEach(candidate => {
      const roundItems = bomToRoundItems(candidate.bomItems, materialLookup);

      if (roundItems.length === 0) {
        lines.push({
          stt: startStt + lines.length,
          ma_nvl: candidate.productCode,
          ten_vat_tu: candidate.productName
            ? `${candidate.productCode} · ${candidate.productName}`
            : candidate.productCode,
          lan_su_dung: { lan_1: [] },
          tong_nhua_tron: null,
          hinh_anh: '',
          hinh_anh_public_id: ''
        });
        return;
      }

      roundItems.forEach(roundItem => {
        lines.push({
          stt: startStt + lines.length,
          ma_nvl: roundItem.ma_nvl,
          ten_vat_tu: roundItem.ten_vat_tu,
          lan_su_dung: { lan_1: [roundItem] },
          tong_nhua_tron: null,
          hinh_anh: '',
          hinh_anh_public_id: ''
        });
      });
    });

  return lines;
}

export function formatMixingBomSummary(items: MixingBomItem[]) {
  if (items.length === 0) return 'Chưa có định mức NPL';
  return items
    .map(item =>
      item.amountType === 'percent'
        ? `${item.code} ${item.percent ?? 0}%`
        : `${item.code} ${item.quantity ?? 0}${item.unit ? ` ${item.unit}` : ''}`
    )
    .join(' · ');
}
