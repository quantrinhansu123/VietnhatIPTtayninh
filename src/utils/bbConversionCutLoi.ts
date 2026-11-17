/**
 * Cột 3.2 «Trọng lượng cắt lõi» (thay «Trọng lượng vật tư lỗi hỏng») theo phiếu quy đổi khớp ngày·ca·máy:
 * - Mã nguồn (vat_tu_goc): −khoi_luong_goc (số âm)
 * - Mã đích (vat_tu_quy_doi): +khoi_luong_quy_doi (số dương)
 * Phiếu quy đổi không còn đổ vào Tồn đầu / Xuất kho.
 *
 * Lưu qua `loiHongKg = −cắt lõi` để công thức chênh lệch dùng chung:
 *   Chênh lệch = Thực tế sử dụng − Nhập TP + cắt lõi.
 * Dòng 3.2 không có phiếu → 0 (cột này không còn mang «lỗi hỏng»). Không đụng NVL nhựa 3.1.
 */
import { normalizeProductCodeKey } from '../features/san-pham/types';
import { matchesNgayCaMay, type BbMaterialConversionRecord } from './bbMaterialConversion';
import type { BbThucDungLineRow } from './controlBoardBbMachineReport';
import { normalizeWarehouseCodeKey } from './warehouseWeight';

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function materialKey(code: string, name = '') {
  return (
    normalizeWarehouseCodeKey(code) ||
    normalizeProductCodeKey(name) ||
    String(code || name || '')
      .trim()
      .toUpperCase()
  );
}

/** Tổng có dấu theo mã NVL: nguồn âm, đích dương. */
export function aggregateMaterialConversionCutByNgayCaMay(input: {
  conversions: BbMaterialConversionRecord[];
  ngay: string;
  shift: string;
  machine: string;
}): Map<string, number> {
  const map = new Map<string, number>();
  const add = (code: string, kg: number) => {
    const key = materialKey(code);
    if (!key || kg === 0) return;
    map.set(key, round4((map.get(key) || 0) + kg));
  };
  // 1 nguồn → nhiều đích: khối lượng gốc lặp trên mỗi dòng → chỉ trừ nguồn 1 lần / nhóm.
  // Cùng nhom_id; bản ghi cũ (nhom_id null) → cùng ngày·ca·máy·nguồn·SL gốc·KL gốc coi là 1 nguồn.
  const seenSource = new Set<string>();
  for (const row of input.conversions || []) {
    if (!matchesNgayCaMay(row, input.ngay, input.shift, input.machine)) continue;
    const goc = row.khoi_luong_goc;
    if (goc != null && Number.isFinite(goc) && goc > 0) {
      const sourceKey = row.nhom_id
        ? `nhom:${row.nhom_id}|${materialKey(row.vat_tu_goc)}`
        : `legacy:${row.ngay}|${row.ca}|${row.ma_may}|${materialKey(row.vat_tu_goc)}|${row.so_luong_goc ?? ''}|${goc}`;
      if (!seenSource.has(sourceKey)) {
        seenSource.add(sourceKey);
        add(row.vat_tu_goc, -goc);
      }
    }
    const dich = row.khoi_luong_quy_doi;
    if (dich != null && Number.isFinite(dich) && dich > 0) add(row.vat_tu_quy_doi, dich);
  }
  return map;
}

export function syncBbThucDungRowsCutLoiFromMaterialConversions(input: {
  rows: BbThucDungLineRow[];
  conversions: BbMaterialConversionRecord[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0) return input.rows;
  const cache = new Map<string, Map<string, number>>();
  return input.rows.map(row => {
    if (row.inMixingRatioTable || row.isPlasticNvl) return row;
    const hk = `${row.ngay}|${row.shift}|${row.machine}`;
    let byCode = cache.get(hk);
    if (!byCode) {
      byCode = aggregateMaterialConversionCutByNgayCaMay({
        conversions: input.conversions || [],
        ngay: row.ngay,
        shift: row.shift,
        machine: row.machine
      });
      cache.set(hk, byCode);
    }
    const cutKg = byCode.get(materialKey(row.materialCode, row.materialName)) || 0;
    const loiHongKg = cutKg === 0 ? 0 : round4(0 - cutKg);
    const finishedKg = Number.isFinite(row.klThucTeKg) ? row.klThucTeKg : 0;
    const weightKg = Number.isFinite(row.weightKg) ? row.weightKg : 0;
    return {
      ...row,
      loiHongKg,
      klThucTePlusLoiKg: round4(finishedKg + loiHongKg),
      chenhLechKg: round4(weightKg - finishedKg - loiHongKg)
    };
  });
}
