/**
 * bao_cao_tieu_hao_nguyen_vat_lieu — snapshot tab tiêu hao NVL.
 * Ghi khi Tính toán từ thucDungGroups.
 */
import type { BbThucDungGroup } from './controlBoardBbMachineReport';

export type BaoCaoTieuHaoNguyenVatLieuRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  stt: number;
  nhom: 'nhua' | 'khac' | null;
  ma_nvl: string | null;
  ten_nvl: string | null;
  don_vi: string | null;
  ti_le_dinh_muc_percent: number | null;
  ti_le_thuc_te_tb_percent: number | null;
  thuc_tron_kg: number | null;
  xuat_kho_kg: number | null;
  ton_dau_kg: number | null;
  nhap_thanh_pham_kg: number | null;
  loi_hong_kg: number | null;
  ton_cuoi_kg: number | null;
  xuat_thuc_te_kg: number | null;
  chenh_lech_kg: number | null;
  so_dong_nvl: number | null;
  tong_thuc_tron_lenh_kg: number | null;
  tong_xuat_lenh_kg: number | null;
  tong_ton_dau_lenh_kg: number | null;
  tong_ton_cuoi_lenh_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round4(value);
}

export function buildBaoCaoTieuHaoNguyenVatLieuRowsFromGroups(input: {
  khoaOnDinh: string;
  thucDungGroups: BbThucDungGroup[];
}): BaoCaoTieuHaoNguyenVatLieuRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: BaoCaoTieuHaoNguyenVatLieuRow[] = [];
  for (const group of input.thucDungGroups || []) {
    const lines = group.lines || [];
    const soDong = group.lineCount || lines.length;
    const tongThucTron = group.thucTronTotal > 0 ? round4(group.thucTronTotal) : null;
    const tongXuat = group.xuatCaTotal > 0 ? round4(group.xuatCaTotal) : null;
    const tongTonDau = group.tonDauCaTotal > 0 ? round4(group.tonDauCaTotal) : null;
    const tongTonCuoi = group.tonCuoiCaTotal > 0 ? round4(group.tonCuoiCaTotal) : null;

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
        nhom: null,
        ma_nvl: null,
        ten_nvl: null,
        don_vi: null,
        ti_le_dinh_muc_percent: null,
        ti_le_thuc_te_tb_percent: null,
        thuc_tron_kg: null,
        xuat_kho_kg: null,
        ton_dau_kg: null,
        nhap_thanh_pham_kg: null,
        loi_hong_kg: null,
        ton_cuoi_kg: null,
        xuat_thuc_te_kg: null,
        chenh_lech_kg: null,
        so_dong_nvl: soDong,
        tong_thuc_tron_lenh_kg: tongThucTron,
        tong_xuat_lenh_kg: tongXuat,
        tong_ton_dau_lenh_kg: tongTonDau,
        tong_ton_cuoi_lenh_kg: tongTonCuoi
      });
      continue;
    }

    lines.forEach((line, index) => {
      const isNhua = Boolean(line.isPlasticNvl ?? line.inMixingRatioTable);
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || line.ngay || '',
        ca: group.shift || line.shift || '',
        ca_label: group.shiftLabel || line.shiftLabel || null,
        may: group.machine || line.machine || '',
        ma_lenh: group.orderCode || line.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: index + 1,
        nhom: isNhua ? 'nhua' : 'khac',
        ma_nvl: line.materialCode || null,
        ten_nvl: line.materialName || null,
        don_vi: line.unit || null,
        ti_le_dinh_muc_percent: numOrNull(line.tiLeDinhMucPercent),
        ti_le_thuc_te_tb_percent: numOrNull(line.tiLeThucTeTbPercent),
        thuc_tron_kg: numOrNull(line.mixingShiftMaterialKg),
        xuat_kho_kg: numOrNull(line.xuatTrongCaKg),
        ton_dau_kg: numOrNull(line.tonDauKg),
        nhap_thanh_pham_kg: numOrNull(line.klThucTeKg),
        loi_hong_kg: numOrNull(line.loiHongKg),
        ton_cuoi_kg: numOrNull(line.tonCuoiKg),
        xuat_thuc_te_kg: numOrNull(line.weightKg),
        chenh_lech_kg: numOrNull(line.chenhLechKg),
        so_dong_nvl: soDong,
        tong_thuc_tron_lenh_kg: tongThucTron,
        tong_xuat_lenh_kg: tongXuat,
        tong_ton_dau_lenh_kg: tongTonDau,
        tong_ton_cuoi_lenh_kg: tongTonCuoi
      });
    });
  }
  return rows;
}
