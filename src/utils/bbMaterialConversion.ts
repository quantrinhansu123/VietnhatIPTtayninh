/**
 * Phiếu quy đổi / cắt ống — khớp ngày · ca · máy với dòng BB 3.2.
 * Chỉ dùng cho cột «Trọng lượng cắt lõi» (xem bbConversionCutLoi.ts); không đổ vào Tồn đầu / Xuất kho.
 */
import { parseProductionOrderFilterDate } from '../features/cai-dat-thoi-gian';
import { machineValueMatchesFilter } from './controlBoardShiftSummary';
import { shiftNamesMatch } from './shiftSettings';
import { extractBbMachineNumber, isBbMachineText } from './controlBoardBbMachineReport';

export type BbMaterialConversionRecord = {
  ngay: string;
  ca: string;
  ma_may: string;
  vat_tu_goc: string;
  vat_tu_quy_doi: string;
  so_luong_goc?: number | null;
  so_luong_quy_doi?: number | null;
  khoi_luong_goc?: number | null;
  khoi_luong_quy_doi?: number | null;
  nguon_lay?: string | null;
  nguon_toi?: string | null;
  /** Cùng nhom_id = 1 nguồn quy ra nhiều đích (khối lượng gốc lặp trên mỗi dòng). */
  nhom_id?: string | null;
};

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Map bản ghi API `quy_doi_vat_lieu` → record dùng trong BB 3.2. */
export function mapApiRowsToBbMaterialConversions(
  rows: unknown[] | null | undefined
): BbMaterialConversionRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(raw => {
    const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      ngay: String(row.ngay || '').trim(),
      ca: String(row.ca || '').trim(),
      ma_may: String(row.ma_may || '').trim(),
      vat_tu_goc: String(row.vat_tu_goc || '').trim(),
      vat_tu_quy_doi: String(row.vat_tu_quy_doi || '').trim(),
      so_luong_goc: numOrNull(row.so_luong_goc),
      so_luong_quy_doi: numOrNull(row.so_luong_quy_doi),
      khoi_luong_goc: numOrNull(row.khoi_luong_goc),
      khoi_luong_quy_doi: numOrNull(row.khoi_luong_quy_doi),
      nguon_lay: row.nguon_lay == null || row.nguon_lay === '' ? null : String(row.nguon_lay).trim(),
      nguon_toi: row.nguon_toi == null || row.nguon_toi === '' ? null : String(row.nguon_toi).trim(),
      nhom_id: row.nhom_id == null || row.nhom_id === '' ? null : String(row.nhom_id).trim()
    };
  });
}

function normalizeNgayKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return parseProductionOrderFilterDate(raw) || raw;
}

/** Khớp máy phiếu quy đổi ↔ máy trên dòng BB (mã MBB_16 ↔ tên MÁY BAO BÌ 16). */
export function machinesMatchForConversion(conversionMachine: string, rowMachine: string) {
  const left = String(conversionMachine || '').trim();
  const right = String(rowMachine || '').trim();
  if (!left) return true;
  if (!right) return false;
  if (isBbMachineText(left) && isBbMachineText(right)) {
    const a = extractBbMachineNumber(left);
    const b = extractBbMachineNumber(right);
    if (a && b) return a === b;
  }
  if (machineValueMatchesFilter(right, null, left)) return true;
  if (machineValueMatchesFilter(left, null, right)) return true;
  return false;
}

export function matchesNgayCaMay(
  conversion: BbMaterialConversionRecord,
  ngay: string,
  shift: string,
  machine: string
) {
  const conversionNgay = normalizeNgayKey(conversion.ngay);
  const rowNgay = normalizeNgayKey(ngay);
  if (!conversionNgay || !rowNgay || conversionNgay !== rowNgay) return false;
  if (!shiftNamesMatch(String(conversion.ca || ''), String(shift || ''))) return false;
  return machinesMatchForConversion(String(conversion.ma_may || ''), String(machine || ''));
}
