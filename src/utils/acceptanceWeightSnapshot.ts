import {
  filterCanTuDongRecordsForBoard, parseCanTuDongQrProductCode, resolveCanSpKg,
  resolveCanLoiKg, resolveTrongLuongBiKg, type CanTuDongWeightRow
} from './canTuDongWeights';
import { normalizeProductCodeKey } from '../features/san-pham/types';

export type AcceptanceWeightSnapshot = {
  trong_luong_loi: number | null;
  trong_luong_bi: number | null;
  trong_luong_mang: number | null;
  trong_luong_nhua: number | null;
  so_lan_can: number;
};
export const emptyAcceptanceWeights: AcceptanceWeightSnapshot = {
  trong_luong_loi: null, trong_luong_bi: null, trong_luong_mang: null, trong_luong_nhua: null, so_lan_can: 0
};

export function calculateAcceptanceWeightSnapshot(
  records: CanTuDongWeightRow[],
  report: { ngay: string; ca: string; ma_may?: string; ten_may?: string; mat_hang: string },
  filmKgByProductCode: Map<string, number>,
  productKeys: string[] = [report.mat_hang]
): AcceptanceWeightSnapshot {
  // Không cộng tất cả máy / ca khi phiếu thiếu khóa ghép.
  if (!report.ngay || !report.ca || (!report.ma_may && !report.ten_may) || !productKeys.some(Boolean)) return { ...emptyAcceptanceWeights };
  const rows = filterCanTuDongRecordsForBoard(records, {
    dateFrom: report.ngay, dateTo: report.ngay, shiftFilter: report.ca,
    machineFilter: report.ma_may || report.ten_may, selectedMachine: { code: report.ma_may, name: report.ten_may },
    productCodeKeys: productKeys
  });
  if (!rows.length) return { ...emptyAcceptanceWeights };
  let core = 0, bag = 0, film = 0, plastic = 0;
  for (const row of rows) {
    const sp = resolveCanSpKg(row), loi = resolveCanLoiKg(row);
    if (sp == null || loi == null || sp <= 0 || loi < 0) return { ...emptyAcceptanceWeights };
    const bi = resolveTrongLuongBiKg(row);
    const mang = filmKgByProductCode.get(normalizeProductCodeKey(parseCanTuDongQrProductCode(row.qr_code))) ?? 0;
    core += loi; bag += bi; film += mang; plastic += sp - loi - bi - mang;
  }
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return { trong_luong_loi: round(core), trong_luong_bi: round(bag), trong_luong_mang: round(film), trong_luong_nhua: round(plastic), so_lan_can: rows.length };
}

export function parseAcceptanceWeightSnapshot(body: unknown): AcceptanceWeightSnapshot | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const keys = ['trong_luong_loi', 'trong_luong_bi', 'trong_luong_mang', 'trong_luong_nhua'] as const;
  if (!keys.every(key => typeof raw[key] === 'number' && Number.isFinite(raw[key]))) return null;
  if (keys.slice(0, 3).some(key => Number(raw[key]) < 0)) return null;
  if (typeof raw.so_lan_can !== 'number' || !Number.isSafeInteger(raw.so_lan_can) || raw.so_lan_can <= 0) return null;
  return {
    trong_luong_loi: Number(raw.trong_luong_loi), trong_luong_bi: Number(raw.trong_luong_bi),
    trong_luong_mang: Number(raw.trong_luong_mang), trong_luong_nhua: Number(raw.trong_luong_nhua), so_lan_can: raw.so_lan_can
  };
}
