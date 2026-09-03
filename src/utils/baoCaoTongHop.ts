/**
 * bao_cao_tong_hop — snapshot khối KPI «Báo cáo tổng hợp» + «Tổng hợp nhựa».
 * 1 dòng / khoa_on_dinh. Ghi khi Tính toán.
 */
import type { BbBaoCaoTinhToanPayload } from './bbBaoCaoTinhToan';

export type BaoCaoTongHopRow = {
  khoa_on_dinh: string;
  ngay_tu: string;
  ngay_den: string;
  ca: string;
  may: string;
  nguon_san_luong: string;
  sl_yeu_cau: number | null;
  tl_nhua_yeu_cau_kg: number | null;
  tl_xuat_tong_kg: number | null;
  tl_xuat_nhua_kg: number | null;
  tl_xuat_khac_kg: number | null;
  ton_dau_tong_kg: number | null;
  ton_dau_nhua_kg: number | null;
  ton_dau_khac_kg: number | null;
  ton_cuoi_tong_kg: number | null;
  ton_cuoi_nhua_kg: number | null;
  ton_cuoi_khac_kg: number | null;
  sl_san_luong: number | null;
  tl_san_luong_kg: number | null;
  tl_mang_kg: number | null;
  tl_nhua_thanh_pham_kg: number | null;
  tl_nhua_dinh_muc_kg: number | null;
  loi_hong_tong_kg: number | null;
  loi_hong_nhua_kg: number | null;
  loi_hong_khac_kg: number | null;
  xuat_thuc_dung_kg: number | null;
  chenh_lech_nhua_kg: number | null;
  chenh_lech_dinh_muc_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round4(value);
}

export function buildBaoCaoTongHopRowFromSummary(input: {
  khoaOnDinh: string;
  ngayTu?: string;
  ngayDen?: string;
  ca?: string;
  may?: string;
  nguonSanLuong?: string;
  isInsulationMachine?: boolean;
  summary: BbBaoCaoTinhToanPayload['summary'];
}): BaoCaoTongHopRow | null {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return null;

  const summary = input.summary;
  const exportByKind = summary.exportWeightByKind || { plasticKg: 0, otherKg: 0, totalKg: 0 };
  const dauCa = summary.dauCaWeightByKind || { plasticKg: 0, otherKg: 0, totalKg: 0 };
  const cuoiCa = summary.cuoiCaWeightByKind || { plasticKg: 0, otherKg: 0, totalKg: 0 };
  const damaged = summary.damagedWeightByKind || { plasticKg: 0, otherKg: 0 };
  const displaySl =
    summary.displaySanLuongTotals ||
    summary.sanLuongTotals || { quantity: 0, weightKg: 0 };
  const canTuDong = summary.canTuDongTongHopTotals;
  const filmKg = canTuDong
    ? canTuDong.khoi_luong_mang_kg
    : summary.insulationFilmWeightKg || 0;
  const dinhMucKg = canTuDong
    ? canTuDong.nhua_dm_kg
    : summary.insulationPlasticNorm?.weightKg || 0;
  const finishedKg = canTuDong
    ? canTuDong.nhua_tt_kg
    : input.isInsulationMachine
      ? displaySl.weightKg - filmKg
      : displaySl.weightKg;
  const xuatThucDung = exportByKind.plasticKg + dauCa.plasticKg - cuoiCa.plasticKg;
  const loiHongNhua = damaged.plasticKg || 0;
  const loiHongKhac = damaged.otherKg || 0;
  const chenhLech = finishedKg - xuatThucDung + loiHongNhua;
  const chenhLechDm = dinhMucKg - finishedKg;

  return {
    khoa_on_dinh: khoa,
    ngay_tu: String(input.ngayTu || '').trim(),
    ngay_den: String(input.ngayDen || '').trim(),
    ca: String(input.ca || '').trim(),
    may: String(input.may || '').trim(),
    nguon_san_luong: String(input.nguonSanLuong || '').trim(),
    sl_yeu_cau: numOrNull(summary.orderTotals?.quantity),
    tl_nhua_yeu_cau_kg: numOrNull(summary.plasticRequiredWeightKg),
    tl_xuat_tong_kg: numOrNull(exportByKind.totalKg ?? summary.exportTotalKg),
    tl_xuat_nhua_kg: numOrNull(exportByKind.plasticKg),
    tl_xuat_khac_kg: numOrNull(exportByKind.otherKg),
    ton_dau_tong_kg: numOrNull(dauCa.totalKg ?? summary.dauCaTotalKg),
    ton_dau_nhua_kg: numOrNull(dauCa.plasticKg),
    ton_dau_khac_kg: numOrNull(dauCa.otherKg),
    ton_cuoi_tong_kg: numOrNull(cuoiCa.totalKg ?? summary.cuoiCaTotalKg),
    ton_cuoi_nhua_kg: numOrNull(cuoiCa.plasticKg),
    ton_cuoi_khac_kg: numOrNull(cuoiCa.otherKg),
    sl_san_luong: numOrNull(displaySl.quantity),
    tl_san_luong_kg: numOrNull(displaySl.weightKg),
    tl_mang_kg: numOrNull(filmKg),
    tl_nhua_thanh_pham_kg: numOrNull(finishedKg),
    tl_nhua_dinh_muc_kg: numOrNull(dinhMucKg),
    loi_hong_tong_kg: numOrNull(loiHongNhua + loiHongKhac),
    loi_hong_nhua_kg: numOrNull(loiHongNhua),
    loi_hong_khac_kg: numOrNull(loiHongKhac),
    xuat_thuc_dung_kg: numOrNull(xuatThucDung),
    chenh_lech_nhua_kg: numOrNull(chenhLech),
    chenh_lech_dinh_muc_kg: numOrNull(chenhLechDm)
  };
}
