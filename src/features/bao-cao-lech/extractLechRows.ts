import {
  extractBbMachineNumber,
  type BbThucDungGroup,
  type BbThucDungLineRow
} from '../../utils/controlBoardBbMachineReport';

export type LechReportRow = {
  noteKey: string;
  snapshotKey: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  /** Mã máy (ưu tiên từ snapshot.may — dùng để lọc hub). */
  machineCode: string;
  /** Nhãn máy hiển thị (tên hoặc mã). */
  machine: string;
  orderCode: string;
  materialCode: string;
  materialName: string;
  unit: string;
  /** Thực tế sử dụng (kg) — cột 3.1 */
  thucTeSuDungKg: number;
  /** Nhập TP / nhựa TT (kg) */
  nhapTpKg: number;
  /** Lỗi hỏng (kg) */
  loiHongKg: number;
  /** Chênh lệch (kg) */
  chenhLechKg: number;
  isPlasticNvl: boolean;
};

export type SnapshotLechMeta = {
  snapshotKey?: string;
  may?: string;
  ca?: string;
  ngayTu?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asText(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeToken(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Khớp mã máy hub (MBB_16) với mã snapshot hoặc tên dòng (MÁY BAO BÌ 16). */
export function machineMatchesFilter(
  filterCode: string,
  row: Pick<LechReportRow, 'machineCode' | 'machine'>
): boolean {
  const filter = asText(filterCode);
  if (!filter) return true;
  const candidates = [row.machineCode, row.machine].map(asText).filter(Boolean);
  if (candidates.length === 0) return true;

  const filterNorm = normalizeToken(filter);
  if (candidates.some(c => normalizeToken(c) === filterNorm)) return true;
  if (candidates.some(c => normalizeToken(c).includes(filterNorm) || filterNorm.includes(normalizeToken(c)))) {
    return true;
  }

  const filterNo = extractBbMachineNumber(filter);
  if (filterNo) {
    return candidates.some(c => extractBbMachineNumber(c) === filterNo);
  }
  return false;
}

export function buildLechNoteKey(parts: {
  ngay: string;
  shift: string;
  machine: string;
  orderCode: string;
  materialCode: string;
}): string {
  return [
    parts.ngay || '',
    parts.shift || '',
    parts.machine || '',
    parts.orderCode || '',
    parts.materialCode || ''
  ].join('|');
}

function lineToLechRow(
  line: BbThucDungLineRow | Record<string, unknown>,
  meta: SnapshotLechMeta
): LechReportRow | null {
  const materialCode = asText(
    (line as BbThucDungLineRow).materialCode ?? (line as { materialCode?: unknown }).materialCode
  );
  if (!materialCode) return null;

  const ngay = asText((line as BbThucDungLineRow).ngay) || asText(meta.ngayTu);
  const shift = asText((line as BbThucDungLineRow).shift) || asText(meta.ca);
  const machineLabel = asText((line as BbThucDungLineRow).machine);
  const snapshotMay = asText(meta.may);
  const machineCode =
    snapshotMay && snapshotMay.toLowerCase() !== 'all' ? snapshotMay : machineLabel;
  const machine = machineLabel || machineCode;
  const orderCode = asText((line as BbThucDungLineRow).orderCode);
  const chenhLechKg = asNumber((line as BbThucDungLineRow).chenhLechKg);

  return {
    noteKey: buildLechNoteKey({
      ngay,
      shift,
      machine: machineCode || machine,
      orderCode,
      materialCode
    }),
    snapshotKey: asText(meta.snapshotKey),
    ngay,
    shift,
    shiftLabel: asText((line as BbThucDungLineRow).shiftLabel) || shift,
    machineCode,
    machine,
    orderCode,
    materialCode,
    materialName: asText((line as BbThucDungLineRow).materialName),
    unit: asText((line as BbThucDungLineRow).unit),
    thucTeSuDungKg: asNumber((line as BbThucDungLineRow).weightKg),
    nhapTpKg: asNumber((line as BbThucDungLineRow).klThucTeKg),
    loiHongKg: asNumber((line as BbThucDungLineRow).loiHongKg),
    chenhLechKg,
    isPlasticNvl: Boolean(
      (line as BbThucDungLineRow).isPlasticNvl ?? (line as BbThucDungLineRow).inMixingRatioTable
    )
  };
}

/** Lấy toàn bộ dòng có cột lệch từ snapshot `bb_bao_cao_tinh_toan.payload`. */
export function extractLechRowsFromSnapshotPayload(
  payload: unknown,
  meta: SnapshotLechMeta | string = ''
): LechReportRow[] {
  const resolvedMeta: SnapshotLechMeta =
    typeof meta === 'string' ? { snapshotKey: meta } : meta || {};
  const root = asRecord(payload);
  if (!root) return [];

  const out: LechReportRow[] = [];
  const seen = new Set<string>();

  const pushLine = (line: unknown) => {
    if (!line || typeof line !== 'object') return;
    const row = lineToLechRow(line as BbThucDungLineRow, resolvedMeta);
    if (!row) return;
    if (seen.has(row.noteKey)) return;
    seen.add(row.noteKey);
    out.push(row);
  };

  const groups = Array.isArray(root.thucDungGroups) ? (root.thucDungGroups as BbThucDungGroup[]) : [];
  for (const group of groups) {
    const lines = Array.isArray(group?.lines) ? group.lines : [];
    for (const line of lines) pushLine(line);
  }

  if (out.length === 0 && Array.isArray(root.thucDungRows)) {
    for (const line of root.thucDungRows) pushLine(line);
  }

  return sortLechRowsByNgayCaMay(out);
}

/** Ngày mới → đầu; cùng ngày theo ca → máy → |lệch| lớn → mã NVL. */
export function sortLechRowsByNgayCaMay(rows: LechReportRow[]): LechReportRow[] {
  return [...rows].sort((a, b) => {
    const byDate = b.ngay.localeCompare(a.ngay);
    if (byDate !== 0) return byDate;
    const byShift = a.shift.localeCompare(b.shift, 'vi');
    if (byShift !== 0) return byShift;
    const byMachine = (a.machineCode || a.machine).localeCompare(b.machineCode || b.machine, 'vi');
    if (byMachine !== 0) return byMachine;
    const byAbs = Math.abs(b.chenhLechKg) - Math.abs(a.chenhLechKg);
    if (byAbs !== 0) return byAbs;
    return a.materialCode.localeCompare(b.materialCode, 'vi');
  });
}

export function formatLechKg(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}
