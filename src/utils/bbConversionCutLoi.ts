/**
 * Cột 3.2 «Trọng lượng cắt lõi dùng trong ca» theo phiếu cắt lõi khớp ngày·ca·máy:
 * - Mã nguồn (vat_tu_goc): −khoi_luong_goc (số âm), kèm −so_luong_goc
 * - Mã đích (vat_tu_quy_doi): +khoi_luong_quy_doi (số dương), kèm +so_luong_quy_doi
 * Phiếu quy đổi không đổ vào Tồn đầu / Xuất kho.
 *
 * «Thực tế sử dụng» (3.2) = Tồn đầu + Xuất kho − Tồn cuối + cắt lõi dùng trong ca.
 * Chênh lệch = Thực tế sử dụng − Nhập TP − Lỗi hỏng. Giữ cột lỗi hỏng riêng. Không đụng NVL nhựa 3.1.
 */
import { normalizeProductCodeKey } from '../features/san-pham/types';
import { matchesNgayCaMay, type BbMaterialConversionRecord } from './bbMaterialConversion';
import type { BbThucDungLineRow } from './controlBoardBbMachineReport';
import { computeMaterialUsageKg } from './controlBoardShiftSummary';
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

export type BbCutLoiAgg = { kg: number; qty: number };

/** Tổng có dấu theo mã NVL: nguồn âm, đích dương (kg và số lượng). */
export function aggregateMaterialConversionCutByNgayCaMay(input: {
  conversions: BbMaterialConversionRecord[];
  ngay: string;
  shift: string;
  machine: string;
}): Map<string, BbCutLoiAgg> {
  const map = new Map<string, BbCutLoiAgg>();
  const add = (code: string, kg: number, qty: number) => {
    const key = materialKey(code);
    if (!key || (kg === 0 && qty === 0)) return;
    const existing = map.get(key) || { kg: 0, qty: 0 };
    existing.kg = round4(existing.kg + kg);
    existing.qty = round4(existing.qty + qty);
    map.set(key, existing);
  };
  const positive = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) && value > 0 ? value : 0;
  // 1 nguồn → nhiều đích: khối lượng gốc lặp trên mỗi dòng → chỉ trừ nguồn 1 lần / nhóm.
  // Cùng nhom_id; bản ghi cũ (nhom_id null) → cùng ngày·ca·máy·nguồn·SL gốc·KL gốc coi là 1 nguồn.
  const seenSource = new Set<string>();
  for (const row of input.conversions || []) {
    if (!matchesNgayCaMay(row, input.ngay, input.shift, input.machine)) continue;
    const goc = positive(row.khoi_luong_goc);
    if (goc > 0) {
      const sourceKey = row.nhom_id
        ? `nhom:${row.nhom_id}|${materialKey(row.vat_tu_goc)}`
        : `legacy:${row.ngay}|${row.ca}|${row.ma_may}|${materialKey(row.vat_tu_goc)}|${row.so_luong_goc ?? ''}|${goc}`;
      if (!seenSource.has(sourceKey)) {
        seenSource.add(sourceKey);
        add(row.vat_tu_goc, -goc, -positive(row.so_luong_goc));
      }
    }
    const dich = positive(row.khoi_luong_quy_doi);
    if (dich > 0) add(row.vat_tu_quy_doi, dich, positive(row.so_luong_quy_doi));
  }
  return map;
}

export function syncBbThucDungRowsCutLoiFromMaterialConversions(input: {
  rows: BbThucDungLineRow[];
  conversions: BbMaterialConversionRecord[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0) return input.rows;
  // Chưa tải phiếu quy đổi: giữ cutLoi đã có trên snapshot, không đè về 0.
  if (!input.conversions?.length) {
    return input.rows.map(row => {
      if (row.inMixingRatioTable || row.isPlasticNvl) return row;
      const cutLoiKg = Number.isFinite(row.cutLoiKg) ? Number(row.cutLoiKg) : 0;
      if (cutLoiKg === 0) return row;
      const finishedKg = Number.isFinite(row.klThucTeKg) ? row.klThucTeKg : 0;
      const damagedKg = Number.isFinite(row.loiHongKg) ? row.loiHongKg : 0;
      const baseUsageKg = computeMaterialUsageKg(
        Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0,
        Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0,
        Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0
      );
      const weightKg = round4(baseUsageKg + cutLoiKg);
      return {
        ...row,
        weightKg,
        klThucTePlusLoiKg: round4(finishedKg + damagedKg),
        chenhLechKg: round4(weightKg - finishedKg - damagedKg)
      };
    });
  }
  const cache = new Map<string, Map<string, BbCutLoiAgg>>();
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
    const agg = byCode.get(materialKey(row.materialCode, row.materialName));
    const cutLoiKg = agg ? agg.kg : 0;
    const cutLoiQty = agg ? agg.qty : 0;
    const finishedKg = Number.isFinite(row.klThucTeKg) ? row.klThucTeKg : 0;
    const damagedKg = Number.isFinite(row.loiHongKg) ? row.loiHongKg : 0;
    // Thực tế sử dụng = Tồn đầu + Xuất − Tồn cuối + cắt lõi (tính lại từ 3 cột gốc → idempotent).
    const baseUsageKg = computeMaterialUsageKg(
      Number.isFinite(row.xuatTrongCaKg) ? row.xuatTrongCaKg : 0,
      Number.isFinite(row.tonDauKg) ? row.tonDauKg : 0,
      Number.isFinite(row.tonCuoiKg) ? row.tonCuoiKg : 0
    );
    const weightKg = round4(baseUsageKg + cutLoiKg);
    return {
      ...row,
      cutLoiKg,
      cutLoiQty,
      weightKg,
      klThucTePlusLoiKg: round4(finishedKg + damagedKg),
      chenhLechKg: round4(weightKg - finishedKg - damagedKg)
    };
  });
}
