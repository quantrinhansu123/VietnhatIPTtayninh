import { machineMatchesFilter } from '../bao-cao-lech/extractLechRows';
import { shiftNamesMatch, type ShiftSetting } from '../../utils/shiftSettings';

export type CpCostRow = {
  rowKey: string;
  snapshotKey: string;
  ngay: string;
  shift: string;
  shiftLabel: string;
  machineCode: string;
  machine: string;
  orderCode: string;
  materialCode: string;
  materialName: string;
  section: 'tron' | 'con_lai' | '';
  /** KL lỗi hỏng phân bổ (kg) */
  loiKg: number;
  /** Chênh lệch TX − ĐM (kg) — lỗ vận hành */
  chenhLechKg: number;
  donGia: number;
  /** Tiền lỗ do hàng lỗi = loiKg × donGia */
  tienLoHangLoi: number;
  /** Thành tiền lỗ vận hành = chenhLechKg × donGia */
  tienLoVanHanh: number;
};

export type CpProductivityRow = CpCostRow & {
  staff: string;
  planned: number;
  actual: number;
  shiftMinutes: number | null;
  standardMinutes: number | null;
  balanceMinutes: number | null;
};

/** Gộp toàn bộ LSX cùng ngày/ca/máy trước khi chia thời gian, không nhân số giờ ca theo số SP. */
export function extractProductivityRows(payload: unknown, meta: SnapshotCpMeta, settings: ShiftSetting[]): CpProductivityRow[] {
  const root = asRecord(payload);
  const groups = Array.isArray(root?.orderGroups) ? root.orderGroups : [];
  const result = new Map<string, CpProductivityRow>();
  const seen = new Set<string>();
  for (const raw of groups) {
    const group = asRecord(raw);
    for (const rawLine of Array.isArray(group?.lines) ? group.lines : []) {
      const line = asRecord(rawLine);
      if (!line) continue;
      const ngay = asText(line.ngay) || asText(group?.ngay) || asText(meta.ngayTu);
      const shift = asText(line.shift) || asText(group?.shift) || asText(meta.ca);
      const machine = asText(line.machine) || asText(group?.machine) || asText(meta.may);
      const key = JSON.stringify([ngay, shift, machine]);
      const lineKey = JSON.stringify([key, line.orderCode, line.productCode]);
      if (seen.has(lineKey)) continue;
      seen.add(lineKey);
      let row = result.get(key);
      if (!row) {
        const setting = settings.find(s => s.loaiCaiDat === 'Thời gian' &&
          (shiftNamesMatch(shift, s.code) || shiftNamesMatch(shift, s.name)));
        const range = setting?.timeFrame?.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
        const parse = (v: string) => {
          const m = v.match(/^(\d{1,2}):(\d{2})/);
          return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
        };
        const start = parse(setting?.startTime || range?.[1] || '');
        const end = parse(setting?.endTime || range?.[2] || '');
        const duration = start !== null && end !== null ? (end - start + 1440) % 1440 : 0;
        row = {
          rowKey: key, snapshotKey: meta.snapshotKey || '', ngay, shift,
          shiftLabel: asText(line.shiftLabel) || shift, machine, machineCode: machine,
          orderCode: '', materialCode: '', materialName: '', section: '', loiKg: 0,
          chenhLechKg: 0, donGia: 0, tienLoHangLoi: 0, tienLoVanHanh: 0,
          staff: '', planned: 0, actual: 0, shiftMinutes: duration > 0 ? duration : null,
          standardMinutes: null, balanceMinutes: null
        };
        result.set(key, row);
      }
      const order = asText(line.orderCode);
      if (order && !row.orderCode.split(', ').includes(order)) row.orderCode = [row.orderCode, order].filter(Boolean).join(', ');
      for (const field of ['staffMain', 'staffAssistant', 'staffSupport']) {
        const staff = asText(line[field]);
        if (staff && !row.staff.split(', ').includes(staff)) row.staff = [row.staff, staff].filter(Boolean).join(', ');
      }
      row.planned += asNumber(line.quantity);
      row.actual += asNumber(line.actualQuantity);
    }
  }
  for (const row of result.values()) {
    if (row.planned > 0 && row.shiftMinutes !== null) {
      row.standardMinutes = row.shiftMinutes / row.planned;
      row.balanceMinutes = (row.actual - row.planned) * row.standardMinutes;
    }
  }
  return [...result.values()];
}

export type SnapshotCpMeta = {
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

function resolveSection(raw: unknown, legacyId: string): 'tron' | 'con_lai' | '' {
  const s = asText(raw);
  if (s === 'tron' || s === 'con_lai') return s;
  if (legacyId === 'hao_hut_mang') return 'con_lai';
  if (legacyId === 'nvl' || legacyId === 'tong') return 'tron';
  return '';
}

function buildRowKey(parts: {
  ngay: string;
  shift: string;
  machine: string;
  orderCode: string;
  materialCode: string;
  section: string;
}): string {
  return [
    parts.ngay || '',
    parts.shift || '',
    parts.machine || '',
    parts.orderCode || '',
    parts.materialCode || '',
    parts.section || ''
  ].join('|');
}

function summaryLineToCpRow(
  line: Record<string, unknown>,
  group: Record<string, unknown>,
  meta: SnapshotCpMeta
): CpCostRow | null {
  const id = asText(line.id);
  // Chỉ lấy dòng NVL chi tiết — bỏ tỉ lệ % và dòng Tổng.
  if (id && id !== 'nvl') return null;

  const materialCode =
    asText(line.materialCode) || asText(line.sttCode) || asText(line.label);
  if (!materialCode) return null;

  const ngay = asText(group.ngay) || asText(meta.ngayTu);
  const shift = asText(group.shift) || asText(meta.ca);
  const shiftLabel = asText(group.shiftLabel) || shift;
  const machineLabel = asText(group.machine);
  const snapshotMay = asText(meta.may);
  const machineCode =
    snapshotMay && snapshotMay.toLowerCase() !== 'all' ? snapshotMay : machineLabel;
  const machine = machineLabel || machineCode;
  const orderCode = asText(group.orderCode);
  const section = resolveSection(line.section, id);

  const loiKg = asNumber(line.loiKg);
  const chenhLechKg = asNumber(line.chenhLechKg);
  const donGia = asNumber(line.donGia);

  const tienLoHangLoiRaw = asNumber(line.tienLoDoHangLoi);
  const thanhTienRaw = asNumber(line.thanhTien);
  const tienLoHangLoi =
    tienLoHangLoiRaw !== 0
      ? Math.round(tienLoHangLoiRaw)
      : donGia > 0 && loiKg > 0
        ? Math.round(loiKg * donGia)
        : 0;
  const tienLoVanHanh =
    thanhTienRaw !== 0
      ? Math.round(thanhTienRaw)
      : donGia > 0 && chenhLechKg !== 0
        ? Math.round(chenhLechKg * donGia)
        : 0;

  return {
    rowKey: buildRowKey({
      ngay,
      shift,
      machine: machineCode || machine,
      orderCode,
      materialCode,
      section
    }),
    snapshotKey: asText(meta.snapshotKey),
    ngay,
    shift,
    shiftLabel,
    machineCode,
    machine,
    orderCode,
    materialCode,
    materialName: asText(line.materialName) || asText(line.label),
    section,
    loiKg,
    chenhLechKg,
    donGia,
    tienLoHangLoi,
    tienLoVanHanh
  };
}

/** Trích dòng chi phí từ snapshot `bb_bao_cao_tinh_toan.payload.danhGiaGroups`. */
export function extractCpRowsFromSnapshotPayload(
  payload: unknown,
  meta: SnapshotCpMeta | string = ''
): CpCostRow[] {
  const resolvedMeta: SnapshotCpMeta =
    typeof meta === 'string' ? { snapshotKey: meta } : meta || {};
  const root = asRecord(payload);
  if (!root) return [];

  const out: CpCostRow[] = [];
  const seen = new Set<string>();

  const groups = Array.isArray(root.danhGiaGroups) ? root.danhGiaGroups : [];
  for (const groupRaw of groups) {
    const group = asRecord(groupRaw);
    if (!group) continue;
    const rows = Array.isArray(group.summaryRows) ? group.summaryRows : [];
    for (const lineRaw of rows) {
      const line = asRecord(lineRaw);
      if (!line) continue;
      const row = summaryLineToCpRow(line, group, resolvedMeta);
      if (!row) continue;
      if (seen.has(row.rowKey)) continue;
      seen.add(row.rowKey);
      out.push(row);
    }
  }

  return sortCpRowsByNgayCaMay(out);
}

export function sortCpRowsByNgayCaMay(rows: CpCostRow[]): CpCostRow[] {
  return [...rows].sort((a, b) => {
    const byDate = b.ngay.localeCompare(a.ngay);
    if (byDate !== 0) return byDate;
    const byShift = a.shift.localeCompare(b.shift, 'vi');
    if (byShift !== 0) return byShift;
    const byMachine = (a.machineCode || a.machine).localeCompare(b.machineCode || b.machine, 'vi');
    if (byMachine !== 0) return byMachine;
    const byAbs =
      Math.max(Math.abs(b.tienLoHangLoi), Math.abs(b.tienLoVanHanh)) -
      Math.max(Math.abs(a.tienLoHangLoi), Math.abs(a.tienLoVanHanh));
    if (byAbs !== 0) return byAbs;
    return a.materialCode.localeCompare(b.materialCode, 'vi');
  });
}

export function matchesCpHubFilters(
  row: CpCostRow,
  filters: {
    search?: string;
    shift?: string;
    machineCode?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): boolean {
  if (filters.dateFrom && row.ngay && row.ngay < filters.dateFrom) return false;
  if (filters.dateTo && row.ngay && row.ngay > filters.dateTo) return false;
  if (filters.shift && row.shift && row.shift !== filters.shift) return false;
  if (
    filters.machineCode &&
    !machineMatchesFilter(filters.machineCode, {
      machineCode: row.machineCode,
      machine: row.machine
    })
  ) {
    return false;
  }
  const q = String(filters.search || '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = [
    row.orderCode,
    row.machineCode,
    row.machine,
    row.materialCode,
    row.materialName,
    row.shiftLabel,
    row.ngay
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function formatCpKg(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.0005) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}
