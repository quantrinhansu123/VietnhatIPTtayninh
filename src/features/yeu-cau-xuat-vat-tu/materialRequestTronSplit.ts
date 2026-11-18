/**
 * NHUA-TRON:
 * - Bảng 1 (ảo): NVL + % từ phiếu phối trộn → kg = TRON × %
 * - Bảng 2 (thật): bảng cũ trên phiếu (ẩn TRON) + cộng kg Bảng 1 vào đúng mã → lưu DB / tính toán
 */
import type { MixingReport } from '../../components/MixingReportForm';
import {
  buildBbMixingMaterialLinesForShift,
  isNhuaTronMaterial
} from '../../utils/controlBoardBbMachineReport';
import type { ShiftSetting } from '../../utils/shiftSettings';
import type { ProductionOrderLookupSetting } from '../ke-hoach-san-xuat';
import type { MaterialRequestLine } from './MaterialRequestListView';

export type MaterialRequestTronSourceLine = {
  ma_nvl: string;
  ten_nvl: string;
  don_vi: string;
  so_luong: number;
};

export type MaterialRequestSplitRow = {
  key: string;
  ma_nvl: string;
  ten_nvl: string;
  don_vi: string;
  /** SL trên phiếu (chưa cộng TRON). */
  so_luongPhieu: number;
  /** TRON × % (từ Bảng 1). */
  daTronKg: number;
  tiLePercent: number | null;
  /** SL lưu DB = phiếu + phân bổ TRON. */
  so_luong: number;
};

function lineQty(line: MaterialRequestLine): number {
  const qty = Number(line.so_luong);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function materialKey(code: string, name: string): string {
  const c = String(code || '').trim().toUpperCase();
  const n = String(name || '').trim().toUpperCase();
  return c || (n ? `name:${n}` : '') || code || name;
}

function round4(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function splitMaterialRequestLinesByTron(input: {
  lines: MaterialRequestLine[];
  mixingReports?: MixingReport[];
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  shiftSettings?: (ShiftSetting | ProductionOrderLookupSetting)[];
}): {
  tronSource: MaterialRequestTronSourceLine[];
  tronKg: number;
  /** Bảng 1 — ảo, chỉ để xem phân bổ. */
  mixingRows: MaterialRequestSplitRow[];
  /** Bảng 2 — bảng cũ + cộng Bảng 1; dùng lưu DB. */
  otherRows: MaterialRequestSplitRow[];
  allocatedFromTron: boolean;
} {
  const tronSource: MaterialRequestTronSourceLine[] = [];
  const baseMap = new Map<string, MaterialRequestSplitRow>();

  for (const line of input.lines || []) {
    const code = String(line.ma_nvl || '').trim();
    const name = String(line.ten_nvl || '').trim();
    const unit = String(line.don_vi || '').trim() || 'kg';
    const qty = lineQty(line);
    if (!code && !name) continue;

    if (isNhuaTronMaterial(code, name)) {
      if (qty > 0) {
        tronSource.push({
          ma_nvl: code || 'NHUA-TRON',
          ten_nvl: name || 'Nhựa trộn Nguyên Sinh + Tái Chế',
          don_vi: unit,
          so_luong: qty
        });
      }
      continue;
    }

    const key = materialKey(code, name);
    if (!key) continue;
    const existing = baseMap.get(key);
    if (!existing) {
      baseMap.set(key, {
        key,
        ma_nvl: code,
        ten_nvl: name || code,
        don_vi: unit,
        so_luongPhieu: qty,
        daTronKg: 0,
        tiLePercent: null,
        so_luong: qty
      });
    } else {
      existing.so_luongPhieu = round4(existing.so_luongPhieu + qty);
      existing.so_luong = round4(existing.so_luong + qty);
      if (!existing.ma_nvl && code) existing.ma_nvl = code;
      if (!existing.ten_nvl && name) existing.ten_nvl = name;
    }
  }

  const tronKg = round4(tronSource.reduce((sum, row) => sum + row.so_luong, 0));
  const ngay = String(input.ngay || '').trim().slice(0, 10);
  const ca = String(input.ca || '').trim();
  const may = String(input.may || '').trim();

  const ratioLines =
    tronKg > 0 && ngay && ca && (input.mixingReports?.length || 0) > 0
      ? buildBbMixingMaterialLinesForShift({
          mixingReports: input.mixingReports || [],
          ngay,
          shift: ca,
          machine: may,
          shiftSettings: input.shiftSettings
        })
      : [];

  const mixingRows: MaterialRequestSplitRow[] = [];
  let allocatedFromTron = false;

  for (const ratio of ratioLines) {
    const code = String(ratio.materialCode || '').trim();
    const name = String(ratio.materialName || '').trim();
    if (isNhuaTronMaterial(code, name)) continue;
    const tiLe =
      ratio.tiLeTronPercent != null &&
      Number.isFinite(ratio.tiLeTronPercent) &&
      ratio.tiLeTronPercent > 0
        ? ratio.tiLeTronPercent
        : null;
    if (tiLe == null) continue;
    const daTronKg = round4(tronKg * (tiLe / 100));
    if (!(daTronKg > 0)) continue;
    allocatedFromTron = true;
    const key = materialKey(code, name) || `mix-${mixingRows.length}`;
    mixingRows.push({
      key,
      ma_nvl: code,
      ten_nvl: name || code,
      don_vi: String(ratio.unit || '').trim() || 'kg',
      so_luongPhieu: 0,
      daTronKg,
      tiLePercent: tiLe,
      so_luong: daTronKg
    });

    // Cộng vào Bảng 2 (bảng thật).
    const existing = baseMap.get(key);
    if (!existing) {
      baseMap.set(key, {
        key,
        ma_nvl: code,
        ten_nvl: name || code,
        don_vi: String(ratio.unit || '').trim() || 'kg',
        so_luongPhieu: 0,
        daTronKg,
        tiLePercent: tiLe,
        so_luong: daTronKg
      });
    } else {
      existing.daTronKg = round4(existing.daTronKg + daTronKg);
      existing.tiLePercent = tiLe;
      existing.so_luong = round4(existing.so_luongPhieu + existing.daTronKg);
      if (!existing.ma_nvl && code) existing.ma_nvl = code;
      if (!existing.ten_nvl && name) existing.ten_nvl = name;
    }
  }

  mixingRows.sort((a, b) => (b.tiLePercent || 0) - (a.tiLePercent || 0));

  const otherRows = [...baseMap.values()]
    .filter(row => row.so_luong > 0)
    .sort((a, b) => a.ten_nvl.localeCompare(b.ten_nvl, 'vi'));

  return {
    tronSource,
    tronKg,
    mixingRows,
    otherRows,
    allocatedFromTron
  };
}

/** Payload dòng NVL lưu DB từ Bảng 2 (đã gộp TRON, không còn mã TRON). */
export function buildMaterialRequestTable2SaveLines(
  rows: MaterialRequestSplitRow[]
): MaterialRequestLine[] {
  return rows
    .filter(row => row.so_luong > 0 && (row.ma_nvl || row.ten_nvl))
    .map(row => ({
      ma_nvl: row.ma_nvl || row.ten_nvl,
      ten_nvl: row.ten_nvl || row.ma_nvl,
      don_vi: row.don_vi || 'kg',
      so_luong: row.so_luong
    }));
}
