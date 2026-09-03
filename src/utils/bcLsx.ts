/**
 * bc_lsx (UI: bc_Lsx) — snapshot tab «Dữ liệu trong lệnh sản xuất» trên /phan-tich-tu-dong.
 * Ghi khi bấm Tính toán; khóa cùng bb_bao_cao_tinh_toan.
 */
import type { BbProductionOrderGroup, BbProductionOrderLineRow } from './controlBoardBbMachineReport';
import { findProductByCode, resolveProductNplItemWeightKg } from '../features/san-pham';
import type { MaterialOption, ProductNplItem, ProductRow } from '../features/san-pham/types';

/** 1 dòng NVL trong định mức SP (dm_nvl.nvl[]). */
export type BcLsxDmNvlItem = {
  ma_nvl: string;
  ten_nvl: string;
  don_vi: string;
  loai: 'percent' | 'quantity';
  phan_tram: number | null;
  so_luong: number | null;
  /** kg / 1 ĐVT SP */
  dinh_luong_kg: number | null;
  /** kg × SL dòng lệnh */
  tong_dinh_luong_kg: number | null;
};

/**
 * Định mức NVL của SP.
 * `trong_luong_tron_kg` = cột Trọng lượng nhựa + phụ gia (kg) / 1 ĐVT.
 */
export type BcLsxDmNvl = {
  trong_luong_tron_kg: number | null;
  tong_trong_luong_tron_kg: number | null;
  nvl: BcLsxDmNvlItem[];
};

export type BcLsxRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  may: string;
  ma_lenh: string;
  group_key: string;
  ca_label: string | null;
  tho_chinh: string | null;
  phu_may: string | null;
  ho_tro: string | null;
  stt: number;
  ma_sp: string | null;
  ten_sp: string | null;
  don_vi: string | null;
  dinh_muc_kg: number | null;
  trong_luong_nhua_kg: number | null;
  so_luong: number | null;
  tong_kg: number | null;
  ti_le_kl_nhua_percent: number | null;
  dm_nvl: BcLsxDmNvl | null;
  so_dong_lenh: number | null;
  tong_sl_lenh: number | null;
  tong_tl_lenh_kg: number | null;
  ti_le_kl_nhua_lenh_percent: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function linePlasticSharePercent(
  line: BbProductionOrderLineRow,
  groupTotalNormKg: number
): number | null {
  const lineKg =
    line.totalNormKg != null && Number.isFinite(line.totalNormKg) && line.totalNormKg > 0
      ? line.totalNormKg
      : 0;
  if (!(groupTotalNormKg > 0) || !(lineKg > 0)) return null;
  return round4((lineKg / groupTotalNormKg) * 100);
}

function toMaterialOptions(
  materials?: Array<Pick<MaterialOption, 'code' | 'name' | 'unit' | 'totalWeight'>> | null
): MaterialOption[] {
  return (materials || []).map(m => ({
    code: m.code || '',
    name: m.name || '',
    unit: m.unit || '',
    totalWeight: m.totalWeight
  }));
}

/** Định lượng kg / 1 SP từ thành phần + trọng lượng trộn (cột nhựa+phụ gia). */
function resolveDmNvlItemKg(
  item: ProductNplItem,
  product: ProductRow | null,
  trongLuongTronKg: number | null,
  materialOptions: MaterialOption[]
): number | null {
  if (item.amountType === 'percent') {
    const pct =
      item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)
        ? item.percent
        : null;
    if (pct !== null && trongLuongTronKg != null && trongLuongTronKg > 0) {
      return round4((pct / 100) * trongLuongTronKg);
    }
  }

  if (product) {
    const fromCatalog = resolveProductNplItemWeightKg(product, item, materialOptions);
    if (fromCatalog !== null && Number.isFinite(fromCatalog) && fromCatalog >= 0) {
      return round4(fromCatalog);
    }
  }

  if (item.weightKg != null && Number.isFinite(item.weightKg) && item.weightKg >= 0) {
    return round4(item.weightKg);
  }
  if (item.quantity != null && Number.isFinite(item.quantity) && item.quantity >= 0) {
    const unit = String(item.unit || '')
      .trim()
      .toLowerCase();
    if (unit === 'kg' || unit.startsWith('kg')) return round4(item.quantity);
  }
  return null;
}

export function buildBcLsxDmNvl(input: {
  productCode: string | null | undefined;
  plasticNormKgPerUnit: number | null | undefined;
  quantity: number | null | undefined;
  products?: ProductRow[] | null;
  materials?: Array<Pick<MaterialOption, 'code' | 'name' | 'unit' | 'totalWeight'>> | null;
}): BcLsxDmNvl | null {
  const code = String(input.productCode || '').trim();
  const trongLuongTronKg =
    input.plasticNormKgPerUnit != null &&
    Number.isFinite(input.plasticNormKgPerUnit) &&
    input.plasticNormKgPerUnit > 0
      ? round4(input.plasticNormKgPerUnit)
      : null;
  const qty =
    input.quantity != null && Number.isFinite(input.quantity) && input.quantity > 0
      ? input.quantity
      : null;
  const tongTrongLuongTronKg =
    trongLuongTronKg != null && qty != null ? round4(trongLuongTronKg * qty) : null;

  if (!code) {
    return {
      trong_luong_tron_kg: trongLuongTronKg,
      tong_trong_luong_tron_kg: tongTrongLuongTronKg,
      nvl: []
    };
  }

  const product = findProductByCode(input.products || [], code);
  const materialOptions = toMaterialOptions(input.materials);
  const nplItems = product?.nplItems || [];
  const nvl: BcLsxDmNvlItem[] = nplItems.map(item => {
    const loai: 'percent' | 'quantity' = item.amountType === 'percent' ? 'percent' : 'quantity';
    const dinhLuongKg = resolveDmNvlItemKg(item, product, trongLuongTronKg, materialOptions);
    return {
      ma_nvl: String(item.code || '').trim(),
      ten_nvl: String(item.name || '').trim(),
      don_vi: String(item.unit || '').trim() || (loai === 'percent' ? '%' : ''),
      loai,
      phan_tram:
        item.percent !== null && item.percent !== undefined && Number.isFinite(item.percent)
          ? round4(item.percent)
          : null,
      so_luong:
        item.quantity !== null && item.quantity !== undefined && Number.isFinite(item.quantity)
          ? round4(item.quantity)
          : null,
      dinh_luong_kg: dinhLuongKg,
      tong_dinh_luong_kg:
        dinhLuongKg != null && qty != null ? round4(dinhLuongKg * qty) : null
    };
  });

  return {
    trong_luong_tron_kg: trongLuongTronKg,
    tong_trong_luong_tron_kg: tongTrongLuongTronKg,
    nvl
  };
}

/** Map orderGroups sau Tính toán → dòng bc_lsx (1 SP = 1 row). */
export function buildBcLsxRowsFromOrderGroups(input: {
  khoaOnDinh: string;
  orderGroups: BbProductionOrderGroup[];
  products?: ProductRow[] | null;
  materials?: Array<Pick<MaterialOption, 'code' | 'name' | 'unit' | 'totalWeight'>> | null;
}): BcLsxRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: BcLsxRow[] = [];
  for (const group of input.orderGroups || []) {
    const groupTotalNormKg =
      group.totalNormKg > 0
        ? group.totalNormKg
        : (group.lines || []).reduce(
            (sum, line) =>
              sum + (line.totalNormKg != null && line.totalNormKg > 0 ? line.totalNormKg : 0),
            0
          );
    const lines = group.lines || [];
    if (lines.length === 0) {
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        ca_label: group.shiftLabel || null,
        tho_chinh: group.staffMain || null,
        phu_may: group.staffAssistant || null,
        ho_tro: group.staffSupport || null,
        stt: 1,
        ma_sp: null,
        ten_sp: null,
        don_vi: null,
        dinh_muc_kg: null,
        trong_luong_nhua_kg: null,
        so_luong: null,
        tong_kg: null,
        ti_le_kl_nhua_percent: null,
        dm_nvl: null,
        so_dong_lenh: group.lineCount || 0,
        tong_sl_lenh: group.quantity || 0,
        tong_tl_lenh_kg: groupTotalNormKg > 0 ? round4(groupTotalNormKg) : null,
        ti_le_kl_nhua_lenh_percent: groupTotalNormKg > 0 ? 100 : null
      });
      continue;
    }

    lines.forEach((line, index) => {
      const plasticNorm =
        line.plasticNormKgPerUnit != null && line.plasticNormKgPerUnit > 0
          ? round4(line.plasticNormKgPerUnit)
          : null;
      const soLuong = line.quantity > 0 ? line.quantity : null;
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || line.ngay || '',
        ca: group.shift || line.shift || '',
        may: group.machine || line.machine || '',
        ma_lenh: group.orderCode || line.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        ca_label: group.shiftLabel || line.shiftLabel || null,
        tho_chinh: group.staffMain || line.staffMain || null,
        phu_may: group.staffAssistant || line.staffAssistant || null,
        ho_tro: group.staffSupport || line.staffSupport || null,
        stt: index + 1,
        ma_sp: line.productCode || null,
        ten_sp: line.productName || null,
        don_vi: line.unit || null,
        dinh_muc_kg:
          line.normKgPerUnit != null && line.normKgPerUnit > 0 ? round4(line.normKgPerUnit) : null,
        trong_luong_nhua_kg: plasticNorm,
        so_luong: soLuong,
        tong_kg:
          line.totalNormKg != null && line.totalNormKg > 0 ? round4(line.totalNormKg) : null,
        ti_le_kl_nhua_percent: linePlasticSharePercent(line, groupTotalNormKg),
        dm_nvl: buildBcLsxDmNvl({
          productCode: line.productCode,
          plasticNormKgPerUnit: plasticNorm,
          quantity: soLuong,
          products: input.products,
          materials: input.materials
        }),
        so_dong_lenh: group.lineCount || lines.length,
        tong_sl_lenh: group.quantity > 0 ? group.quantity : null,
        tong_tl_lenh_kg: groupTotalNormKg > 0 ? round4(groupTotalNormKg) : null,
        ti_le_kl_nhua_lenh_percent: groupTotalNormKg > 0 ? 100 : null
      });
    });
  }
  return rows;
}
