/**
 * bao_cao_du_lieu_ton_dau_ca — snapshot tab «Báo cáo dữ liệu tồn đầu ca» (/phan-tich-tu-dong).
 * Khác bảng nguồn bao_cao_may_nvl_ton. Ghi khi Tính toán.
 */
import type { BbDauCaGroup } from './controlBoardBbMachineReport';

export type BaoCaoDuLieuTonDauCaRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  stt: number;
  ma_nvl: string | null;
  ten_nvl: string | null;
  don_vi: string | null;
  loai_dinh_muc: string | null;
  dinh_muc_rate: number | null;
  dinh_muc_unit: string | null;
  ti_le_dinh_muc_percent: number | null;
  ti_le_thuc_te_tb_percent: number | null;
  ton_dau_sl: number | null;
  ton_dau_kg: number | null;
  tu_nns_tron: boolean | null;
  nns_tron_ton_dau_kg: number | null;
  ton_dau_truc_tiep_kg: number | null;
  so_dong_nvl: number | null;
  so_sp: number | null;
  tong_ton_dau_lenh_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined, requirePositive = false): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (requirePositive && !(value > 0)) return null;
  return round4(value);
}

/** Map dauCaGroups (sau Tính toán) → dòng bao_cao_du_lieu_ton_dau_ca. */
export function buildBaoCaoDuLieuTonDauCaRowsFromGroups(input: {
  khoaOnDinh: string;
  dauCaGroups: BbDauCaGroup[];
}): BaoCaoDuLieuTonDauCaRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: BaoCaoDuLieuTonDauCaRow[] = [];
  for (const group of input.dauCaGroups || []) {
    const materialLines = group.materialLines || [];
    const soDong = group.lineCount || materialLines.length;
    const soSp = group.productCount || 0;
    const tongTon =
      group.totalWeightKg > 0
        ? round4(group.totalWeightKg)
        : round4(materialLines.reduce((sum, line) => sum + (line.tonDauWeightKg > 0 ? line.tonDauWeightKg : 0), 0));

    if (materialLines.length === 0) {
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        ca_label: group.shiftLabel || null,
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: 1,
        ma_nvl: null,
        ten_nvl: null,
        don_vi: null,
        loai_dinh_muc: null,
        dinh_muc_rate: null,
        dinh_muc_unit: null,
        ti_le_dinh_muc_percent: null,
        ti_le_thuc_te_tb_percent: null,
        ton_dau_sl: null,
        ton_dau_kg: null,
        tu_nns_tron: null,
        nns_tron_ton_dau_kg: null,
        ton_dau_truc_tiep_kg: null,
        so_dong_nvl: soDong,
        so_sp: soSp,
        tong_ton_dau_lenh_kg: tongTon > 0 ? tongTon : null
      });
      continue;
    }

    materialLines.forEach((line, index) => {
      const formula = line.tonDauFormula;
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        ca_label: group.shiftLabel || null,
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: index + 1,
        ma_nvl: line.itemCode || null,
        ten_nvl: line.itemName || null,
        don_vi: line.unit || null,
        loai_dinh_muc: line.amountType || null,
        dinh_muc_rate: numOrNull(line.dinhMucRate),
        dinh_muc_unit: line.dinhMucUnit || null,
        ti_le_dinh_muc_percent: numOrNull(line.tiLeDinhMucPercent),
        ti_le_thuc_te_tb_percent: numOrNull(line.tiLeThucTeTbPercent),
        ton_dau_sl: numOrNull(line.tonDauQuantity),
        ton_dau_kg: numOrNull(line.tonDauWeightKg),
        tu_nns_tron: formula ? Boolean(formula.fromNnsTron) : null,
        nns_tron_ton_dau_kg: formula ? numOrNull(formula.nnsTronTonDauKg) : null,
        ton_dau_truc_tiep_kg: formula ? numOrNull(formula.directTonDauKg) : null,
        so_dong_nvl: soDong,
        so_sp: soSp,
        tong_ton_dau_lenh_kg: tongTon > 0 ? tongTon : null
      });
    });
  }
  return rows;
}
