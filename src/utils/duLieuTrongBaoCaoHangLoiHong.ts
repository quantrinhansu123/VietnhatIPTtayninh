/**
 * du_lieu_trong_bao_cao_hang_loi_hong — snapshot tab «Dữ liệu trong báo cáo hàng lỗi hỏng».
 * Khác bao_cao_hang_hong / bao_cao_nghiem_thu. Ghi khi Tính toán.
 */
import {
  isInsulationMachineText,
  resolveBbDamagedPlasticLoiHongKg,
  splitBbLoiHongMaterialLinesByMixing,
  sumBbDamagedFilmScrapKg,
  type BbDamagedGoodsGroup,
  type BbDamagedMixingChildRow
} from './controlBoardBbMachineReport';

export type DuLieuTrongBaoCaoHangLoiHongRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  stt: number;
  nhom: 'tron' | 'con_lai' | null;
  ma_nvl: string | null;
  ten_nvl: string | null;
  don_vi: string | null;
  ti_le_tron_percent: number | null;
  ti_le_dinh_muc_percent: number | null;
  trong_luong_loi_kg: number | null;
  so_dong_nvl: number | null;
  tong_nhua_loi_kg: number | null;
  tong_loi_hong_kg: number | null;
  rac_mang_xi_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function numOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round4(value);
}

function resolveLoiHongTiLe(row: BbDamagedMixingChildRow): number | null {
  if (row.tiLeTronPercent != null && row.tiLeTronPercent > 0) return row.tiLeTronPercent;
  if (row.tiLeDinhMucPercent != null && row.tiLeDinhMucPercent > 0) return row.tiLeDinhMucPercent;
  return null;
}

function resolveLoiHongWeightKg(tiLe: number | null, plasticLoiHongKg: number): number | null {
  if (tiLe === null || !(tiLe > 0) || !(plasticLoiHongKg > 0)) return null;
  return Math.round(((plasticLoiHongKg * tiLe) / 100) * 100) / 100;
}

function pushNvlRows(input: {
  khoa: string;
  group: BbDamagedGoodsGroup;
  nhom: 'tron' | 'con_lai';
  lines: BbDamagedMixingChildRow[];
  plasticLoiHongKg: number;
  racMangXiKg: number;
  tongLoiHongKg: number;
  soDongNvl: number;
  sttStart: number;
  rows: DuLieuTrongBaoCaoHangLoiHongRow[];
}): number {
  let stt = input.sttStart;
  for (const line of input.lines) {
    const tiLe = resolveLoiHongTiLe(line);
    const trongLuongLoi =
      input.nhom === 'tron' ? resolveLoiHongWeightKg(tiLe, input.plasticLoiHongKg) : null;
    input.rows.push({
      khoa_on_dinh: input.khoa,
      ngay: input.group.ngay || '',
      ca: input.group.shift || '',
      ca_label: input.group.shiftLabel || null,
      may: input.group.machine || '',
      ma_lenh: input.group.orderCode || '',
      group_key: input.group.groupKey || input.group.orderCode || '',
      stt: stt++,
      nhom: input.nhom,
      ma_nvl: line.materialCode || null,
      ten_nvl: line.materialName || null,
      don_vi: line.unit || null,
      ti_le_tron_percent: numOrNull(line.tiLeTronPercent),
      ti_le_dinh_muc_percent: numOrNull(line.tiLeDinhMucPercent),
      trong_luong_loi_kg: trongLuongLoi,
      so_dong_nvl: input.soDongNvl,
      tong_nhua_loi_kg: input.plasticLoiHongKg > 0 ? round4(input.plasticLoiHongKg) : null,
      tong_loi_hong_kg: input.tongLoiHongKg > 0 ? round4(input.tongLoiHongKg) : null,
      rac_mang_xi_kg: input.racMangXiKg > 0 ? round4(input.racMangXiKg) : null
    });
  }
  return stt;
}

/** Map damagedGroups (có mixingLines) → dòng du_lieu_trong_bao_cao_hang_loi_hong. */
export function buildDuLieuTrongBaoCaoHangLoiHongRowsFromGroups(input: {
  khoaOnDinh: string;
  damagedGroups: BbDamagedGoodsGroup[];
  isInsulationMachine?: boolean;
}): DuLieuTrongBaoCaoHangLoiHongRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: DuLieuTrongBaoCaoHangLoiHongRow[] = [];
  for (const group of input.damagedGroups || []) {
    const groupIsInsulation =
      Boolean(input.isInsulationMachine) || isInsulationMachineText(group.machine);
    const plasticLoiHongKg = resolveBbDamagedPlasticLoiHongKg(group.lines || [], {
      isInsulationMachine: groupIsInsulation
    });
    const racMangXiKg = groupIsInsulation ? sumBbDamagedFilmScrapKg(group.lines || []) : 0;
    const tongLoiHongKg =
      group.totalWeightKg > 0
        ? group.totalWeightKg
        : plasticLoiHongKg + (racMangXiKg > 0 ? racMangXiKg : 0);
    const mixingLines = group.mixingLines || [];
    const { mixingKgLines, otherMaterialLines } = splitBbLoiHongMaterialLinesByMixing(mixingLines);
    const soDongNvl = group.mixingLineCount ?? mixingLines.length;
    let stt = 1;

    if (mixingKgLines.length === 0 && otherMaterialLines.length === 0) {
      rows.push({
        khoa_on_dinh: khoa,
        ngay: group.ngay || '',
        ca: group.shift || '',
        ca_label: group.shiftLabel || null,
        may: group.machine || '',
        ma_lenh: group.orderCode || '',
        group_key: group.groupKey || group.orderCode || '',
        stt: stt++,
        nhom: null,
        ma_nvl: null,
        ten_nvl: null,
        don_vi: null,
        ti_le_tron_percent: null,
        ti_le_dinh_muc_percent: null,
        trong_luong_loi_kg: null,
        so_dong_nvl: soDongNvl,
        tong_nhua_loi_kg: plasticLoiHongKg > 0 ? round4(plasticLoiHongKg) : null,
        tong_loi_hong_kg: tongLoiHongKg > 0 ? round4(tongLoiHongKg) : null,
        rac_mang_xi_kg: racMangXiKg > 0 ? round4(racMangXiKg) : null
      });
      continue;
    }

    stt = pushNvlRows({
      khoa,
      group,
      nhom: 'tron',
      lines: mixingKgLines,
      plasticLoiHongKg,
      racMangXiKg,
      tongLoiHongKg,
      soDongNvl,
      sttStart: stt,
      rows
    });
    stt = pushNvlRows({
      khoa,
      group,
      nhom: 'con_lai',
      lines: otherMaterialLines,
      plasticLoiHongKg,
      racMangXiKg,
      tongLoiHongKg,
      soDongNvl,
      sttStart: stt,
      rows
    });
  }
  return rows;
}
