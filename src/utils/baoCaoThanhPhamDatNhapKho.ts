/**
 * bao_cao_thanh_pham_dat_nhap_kho — snapshot tab thành phẩm đạt nhập kho.
 * Ghi khi Tính toán từ orderGroups (đã gắn SL/TL thực tế).
 */
import type { BbProductionOrderGroup } from './controlBoardBbMachineReport';

export type BaoCaoThanhPhamDatNhapKhoRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  stt: number;
  ma_sp: string | null;
  ten_sp: string | null;
  don_vi: string | null;
  sl_yeu_cau: number | null;
  tl_yeu_cau_kg: number | null;
  sl_thuc_te: number | null;
  tl_thuc_te_kg: number | null;
  tl_nhua_kg: number | null;
  tl_mang_kg: number | null;
  ti_le_sl_dat_percent: number | null;
  ti_le_kl_nhua_percent: number | null;
  so_dong_sp: number | null;
  tong_sl_yeu_cau: number | null;
  tong_tl_yeu_cau_kg: number | null;
  tong_sl_thuc_te: number | null;
  tong_tl_thuc_te_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round4(value);
}

export function buildBaoCaoThanhPhamDatNhapKhoRowsFromGroups(input: {
  khoaOnDinh: string;
  orderGroups: BbProductionOrderGroup[];
}): BaoCaoThanhPhamDatNhapKhoRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: BaoCaoThanhPhamDatNhapKhoRow[] = [];
  for (const group of input.orderGroups || []) {
    const lines = group.lines || [];
    const tongSlYc = group.quantity > 0 ? round4(group.quantity) : null;
    const tongTlYc = group.totalNormKg > 0 ? round4(group.totalNormKg) : null;
    const tongSlTt = group.actualQuantity > 0 ? round4(group.actualQuantity) : null;
    const tongTlTt = group.actualWeightKg > 0 ? round4(group.actualWeightKg) : null;
    const soDong = group.lineCount || lines.length;

    if (lines.length === 0) {
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        ca_label: group.shiftLabel || null,
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: 1,
        ma_sp: null,
        ten_sp: null,
        don_vi: null,
        sl_yeu_cau: null,
        tl_yeu_cau_kg: null,
        sl_thuc_te: null,
        tl_thuc_te_kg: null,
        tl_nhua_kg: null,
        tl_mang_kg: null,
        ti_le_sl_dat_percent: null,
        ti_le_kl_nhua_percent: null,
        so_dong_sp: soDong,
        tong_sl_yeu_cau: tongSlYc,
        tong_tl_yeu_cau_kg: tongTlYc,
        tong_sl_thuc_te: tongSlTt,
        tong_tl_thuc_te_kg: tongTlTt
      });
      continue;
    }

    lines.forEach((line, index) => {
      const plasticShare =
        group.totalNormKg > 0 && line.totalNormKg != null && line.totalNormKg > 0
          ? (line.totalNormKg / group.totalNormKg) * 100
          : null;
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || line.ngay || '',
        ca: group.shift || line.shift || '',
        ca_label: group.shiftLabel || line.shiftLabel || null,
        may: group.machine || line.machine || '',
        ma_lenh: group.orderCode || line.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: index + 1,
        ma_sp: line.productCode || null,
        ten_sp: line.productName || null,
        don_vi: line.unit || null,
        sl_yeu_cau: line.quantity > 0 ? numOrNull(line.quantity) : null,
        tl_yeu_cau_kg: numOrNull(line.totalNormKg),
        sl_thuc_te: line.actualQuantity > 0 ? numOrNull(line.actualQuantity) : null,
        tl_thuc_te_kg: numOrNull(line.actualWeightKg),
        tl_nhua_kg: numOrNull(line.actualPlasticWeightKg),
        tl_mang_kg: numOrNull(line.actualFilmWeightKg),
        ti_le_sl_dat_percent: numOrNull(line.planQtyRatioPercent),
        ti_le_kl_nhua_percent: numOrNull(plasticShare),
        so_dong_sp: soDong,
        tong_sl_yeu_cau: tongSlYc,
        tong_tl_yeu_cau_kg: tongTlYc,
        tong_sl_thuc_te: tongSlTt,
        tong_tl_thuc_te_kg: tongTlTt
      });
    });
  }
  return rows;
}
