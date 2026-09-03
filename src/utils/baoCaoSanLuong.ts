/**
 * bao_cao_san_luong — snapshot tab «Báo cáo sản lượng» (/phan-tich-tu-dong).
 * Khác bao_cao_nghiem_thu và bao_cao_san_luong_nvl_dinh_muc. Ghi khi Tính toán.
 */
import type { BbSanLuongGroup } from './controlBoardBbMachineReport';

export type BaoCaoSanLuongRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  ma_sp: string | null;
  ten_sp: string | null;
  don_vi_sp: string | null;
  sl_sp: number | null;
  tl_sp_kg: number | null;
  ti_le_sp_percent: number | null;
  stt: number;
  ma_nvl: string | null;
  ten_nvl: string | null;
  don_vi: string | null;
  loai_dinh_muc: string | null;
  dinh_muc_rate: number | null;
  dinh_muc_unit: string | null;
  ti_le_dinh_muc_percent: number | null;
  sl_nvl: number | null;
  tl_nvl_dinh_muc_kg: number | null;
  tl_nvl_thuc_te_kg: number | null;
  so_dong_nvl_sp: number | null;
  so_sp_lenh: number | null;
  tong_tl_dinh_muc_lenh_kg: number | null;
  tong_tl_thuc_te_lenh_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round4(value);
}

/** Map sanLuongGroups → dòng bao_cao_san_luong (1 NVL / SP / lệnh). */
export function buildBaoCaoSanLuongRowsFromGroups(input: {
  khoaOnDinh: string;
  sanLuongGroups: BbSanLuongGroup[];
}): BaoCaoSanLuongRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: BaoCaoSanLuongRow[] = [];
  for (const group of input.sanLuongGroups || []) {
    const productGroups = group.productGroups || [];
    const tongDm =
      group.totalNormWeightKg > 0 ? round4(group.totalNormWeightKg) : null;
    const tongTt =
      group.totalActualWeightKg > 0 ? round4(group.totalActualWeightKg) : null;
    const soSp = group.productCount || productGroups.length;
    let stt = 1;

    if (productGroups.length === 0) {
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        ca_label: group.shiftLabel || null,
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        ma_sp: null,
        ten_sp: null,
        don_vi_sp: null,
        sl_sp: null,
        tl_sp_kg: null,
        ti_le_sp_percent: null,
        stt: stt++,
        ma_nvl: null,
        ten_nvl: null,
        don_vi: null,
        loai_dinh_muc: null,
        dinh_muc_rate: null,
        dinh_muc_unit: null,
        ti_le_dinh_muc_percent: null,
        sl_nvl: null,
        tl_nvl_dinh_muc_kg: null,
        tl_nvl_thuc_te_kg: null,
        so_dong_nvl_sp: 0,
        so_sp_lenh: soSp,
        tong_tl_dinh_muc_lenh_kg: tongDm,
        tong_tl_thuc_te_lenh_kg: tongTt
      });
      continue;
    }

    for (const product of productGroups) {
      const lines = product.lines || [];
      const soDong = product.lineCount || lines.length;
      if (lines.length === 0) {
        rows.push({
          khoa_on_dinh: khoa,
          ngay: group.ngay || '',
          ca: group.shift || '',
          ca_label: group.shiftLabel || null,
          may: group.machine || '',
          ma_lenh: group.orderCode || '',
          group_key: group.groupKey || group.orderCode || '',
          ma_sp: product.productCode || null,
          ten_sp: product.productName || null,
          don_vi_sp: product.unit || null,
          sl_sp: product.quantity > 0 ? numOrNull(product.quantity) : null,
          tl_sp_kg: product.weightKg > 0 ? numOrNull(product.weightKg) : null,
          ti_le_sp_percent: numOrNull(product.productSharePercent),
          stt: stt++,
          ma_nvl: null,
          ten_nvl: null,
          don_vi: null,
          loai_dinh_muc: null,
          dinh_muc_rate: null,
          dinh_muc_unit: null,
          ti_le_dinh_muc_percent: null,
          sl_nvl: null,
          tl_nvl_dinh_muc_kg: null,
          tl_nvl_thuc_te_kg: null,
          so_dong_nvl_sp: soDong,
          so_sp_lenh: soSp,
          tong_tl_dinh_muc_lenh_kg: tongDm,
          tong_tl_thuc_te_lenh_kg: tongTt
        });
        continue;
      }

      for (const line of lines) {
        rows.push({
          khoa_on_dinh: khoa,
          ngay: group.ngay || '',
          ca: group.shift || '',
          ca_label: group.shiftLabel || null,
          may: group.machine || '',
          ma_lenh: group.orderCode || '',
          group_key: group.groupKey || group.orderCode || '',
          ma_sp: product.productCode || null,
          ten_sp: product.productName || null,
          don_vi_sp: product.unit || null,
          sl_sp: product.quantity > 0 ? numOrNull(product.quantity) : null,
          tl_sp_kg: product.weightKg > 0 ? numOrNull(product.weightKg) : null,
          ti_le_sp_percent: numOrNull(product.productSharePercent),
          stt: stt++,
          ma_nvl: line.itemCode || null,
          ten_nvl: line.itemName || null,
          don_vi: line.unit || null,
          loai_dinh_muc: line.amountType || null,
          dinh_muc_rate: numOrNull(line.dinhMucRate),
          dinh_muc_unit: line.dinhMucUnit || null,
          ti_le_dinh_muc_percent: numOrNull(line.tiLeDinhMucPercent),
          sl_nvl: numOrNull(line.quantity),
          tl_nvl_dinh_muc_kg:
            line.normWeightKg > 0 ? numOrNull(line.normWeightKg) : null,
          tl_nvl_thuc_te_kg:
            line.actualWeightKg > 0 ? numOrNull(line.actualWeightKg) : null,
          so_dong_nvl_sp: soDong,
          so_sp_lenh: soSp,
          tong_tl_dinh_muc_lenh_kg: tongDm,
          tong_tl_thuc_te_lenh_kg: tongTt
        });
      }
    }
  }
  return rows;
}
