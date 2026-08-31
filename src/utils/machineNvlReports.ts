import { normalizeProductCodeKey } from '../features/san-pham/types';

export type MachineNvlReportKind = 'dau_ca' | 'cuoi_ca';

export type MachineNvlMaterialType = 'nhua' | 'mang' | 'loi' | 'bao_bi';

export const MACHINE_NVL_MATERIAL_TYPE_OPTIONS: Array<{ value: MachineNvlMaterialType; label: string }> = [
  { value: 'nhua', label: 'Nhựa' },
  { value: 'mang', label: 'Màng' },
  { value: 'loi', label: 'Lõi' },
  { value: 'bao_bi', label: 'Bao Bì' }
];

export function normalizeMachineNvlMaterialType(value: unknown): MachineNvlMaterialType | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (MACHINE_NVL_MATERIAL_TYPE_OPTIONS.some(option => option.value === raw)) {
    return raw as MachineNvlMaterialType;
  }
  return null;
}

/** Đoán loại vật tư từ mã/tên/ĐVT khi người dùng chưa chọn tay — chỉ dùng để gợi ý điền sẵn. */
export function guessMachineNvlMaterialType(code: string, name: string, unit: string): MachineNvlMaterialType {
  const hay = `${code} ${name}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (hay.includes('loi') || /\bloi\b/.test(hay) || hay.startsWith('loi')) return 'loi';
  if (hay.includes('tui') || hay.includes('bao bi') || hay.includes('tai nilon') || hay.includes('bi nilon')) {
    return 'bao_bi';
  }
  const unitNormalized = unit.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (unitNormalized === 'm2' || unitNormalized === 'm^2' || unitNormalized === 'm 2' || unitNormalized === 'm²') {
    return 'mang';
  }
  if (hay.includes('mang') || hay.includes('film')) return 'mang';
  return 'nhua';
}

/** NVL Trộn = Nhựa; còn lại (Màng, Lõi, Bao Bì) = Vật tư khác. */
export function isMachineNvlTronMaterial(
  loaiVatTu: MachineNvlMaterialType | null | undefined,
  code = '',
  name = '',
  unit = ''
) {
  if (loaiVatTu === 'nhua') return true;
  if (loaiVatTu === 'mang' || loaiVatTu === 'loi' || loaiVatTu === 'bao_bi') return false;
  return guessMachineNvlMaterialType(code, name, unit) === 'nhua';
}

export function splitMachineNvlLinesByMaterialGroup<
  T extends {
    loaiVatTu?: MachineNvlMaterialType | null;
    maNvl?: string;
    tenNvl?: string;
    donVi?: string;
  }
>(lines: T[]) {
  const nvlTron: T[] = [];
  const vatTuKhac: T[] = [];
  for (const line of lines) {
    if (
      isMachineNvlTronMaterial(
        line.loaiVatTu,
        String(line.maNvl ?? ''),
        String(line.tenNvl ?? ''),
        String(line.donVi ?? '')
      )
    ) {
      nvlTron.push(line);
    } else {
      vatTuKhac.push(line);
    }
  }
  return { nvlTron, vatTuKhac };
}

export type MachineNvlSavedLine = {
  stt: number;
  maNvl: string;
  tenNvl: string;
  donVi: string;
  /** Kg quy đổi cho 1 đơn vị (vd m2 → kg/m2). Nếu null thì chỉ tính khi đơn vị là kg. */
  trongLuongQuyDoiKg: number | null;
  /** Loại vật tư do người dùng chọn tay (Nhựa/Màng/Lõi/Bao Bì) — ưu tiên hơn suy đoán tự động. */
  loaiVatTu: MachineNvlMaterialType | null;
  soLuongTonCaTruoc: number | null;
  soLuongTrongMay: number | null;
  soLuongTrongBonTron: number | null;
  soLuongNlChuaTron: number | null;
  /** Tồn ngoài máy (kho tạm gần máy, chưa nạp vào máy/bồn). */
  soLuongTonNgoai: number | null;
  soLuongTonDinhMuc: number | null;
  soLuongTon: number;
  ghiChu: string;
  hinhAnh: string;
  hinhAnhPublicId: string;
};

export type MachineNvlSavedReport = {
  id: string;
  ngay: string;
  ca: string;
  gio: string;
  maMay: string;
  tenMay: string;
  nhanSu: string;
  total: number;
  note: string;
  reportKind: MachineNvlReportKind;
  lines: MachineNvlSavedLine[];
  createdAt: string;
};

export function normalizeMachineNvlReportKind(value: unknown): MachineNvlReportKind {
  const raw = String(value ?? 'dau_ca').trim().toLowerCase();
  if (raw === 'cuoi_ca' || raw === 'cuoi' || raw === 'cuoi-ca') return 'cuoi_ca';
  return 'dau_ca';
}

export function normalizeMachineNvlReports(data: unknown): MachineNvlSavedReport[] {
  if (!data || typeof data !== 'object') return [];
  const reports = (data as { reports?: unknown }).reports;
  if (!Array.isArray(reports)) return [];

  return reports
    .map((item): MachineNvlSavedReport | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawLines = Array.isArray(record.chi_tiet) ? record.chi_tiet : [];
      const lines = rawLines
        .map((line, index): MachineNvlSavedLine | null => {
          if (!line || typeof line !== 'object') return null;
          const detail = line as Record<string, unknown>;
          const maNvl = String(detail.ma_nvl ?? detail.ma_npl ?? detail.code ?? '').trim();
          const tenNvl = String(detail.ten_nvl ?? detail.ten_npl ?? detail.name ?? '').trim();
          if (!maNvl && !tenNvl) return null;
          const amount = Number(String(detail.so_luong_ton ?? detail.so_luong ?? detail.quantity ?? 0).replace(',', '.'));
          const standardRaw =
            detail.so_luong_ton_dinh_muc ?? detail.so_luong_dinh_muc ?? detail.standardQuantity;
          const standardParsed =
            standardRaw === null || standardRaw === undefined || standardRaw === ''
              ? null
              : Number(String(standardRaw).replace(',', '.'));
          const prevRaw = detail.so_luong_ton_ca_truoc ?? detail.so_luong_ca_truoc ?? detail.previousQuantity;
          const prevParsed =
            prevRaw === null || prevRaw === undefined || prevRaw === ''
              ? null
              : Number(String(prevRaw).replace(',', '.'));
          const inMachineRaw = detail.so_luong_trong_may ?? detail.ton_trong_may ?? detail.inMachineQuantity;
          const inMachineParsed =
            inMachineRaw === null || inMachineRaw === undefined || inMachineRaw === ''
              ? null
              : Number(String(inMachineRaw).replace(',', '.'));
          const inMixerRaw = detail.so_luong_trong_bon_tron ?? detail.ton_trong_bon_tron ?? detail.inMixerQuantity;
          const inMixerParsed =
            inMixerRaw === null || inMixerRaw === undefined || inMixerRaw === ''
              ? null
              : Number(String(inMixerRaw).replace(',', '.'));
          const unblendedRaw = detail.so_luong_nl_chua_tron ?? detail.nl_chua_tron ?? detail.unblendedQuantity;
          const unblendedParsed =
            unblendedRaw === null || unblendedRaw === undefined || unblendedRaw === ''
              ? null
              : Number(String(unblendedRaw).replace(',', '.'));
          const outsideRaw = detail.so_luong_ton_ngoai ?? detail.ton_ngoai ?? detail.outsideQuantity;
          const outsideParsed =
            outsideRaw === null || outsideRaw === undefined || outsideRaw === ''
              ? null
              : Number(String(outsideRaw).replace(',', '.'));
          const unitWeightRaw =
            detail.trong_luong_quy_doi_kg ??
            detail.trong_luong_quy_doi ??
            detail.trong_luong ??
            detail.kg_per_unit ??
            detail.unitWeightKg;
          const unitWeightParsed =
            unitWeightRaw === null || unitWeightRaw === undefined || unitWeightRaw === ''
              ? null
              : Number(String(unitWeightRaw).replace(',', '.'));
          return {
            stt: Number(detail.stt ?? index + 1) || index + 1,
            maNvl,
            tenNvl,
            donVi: String(detail.don_vi ?? detail.unit ?? 'kg').trim() || 'kg',
            trongLuongQuyDoiKg: Number.isFinite(unitWeightParsed) && unitWeightParsed! > 0 ? unitWeightParsed! : null,
            loaiVatTu: normalizeMachineNvlMaterialType(detail.loai_vat_tu ?? detail.materialType),
            soLuongTonCaTruoc: Number.isFinite(prevParsed) ? prevParsed : null,
            soLuongTrongMay: Number.isFinite(inMachineParsed) ? inMachineParsed : null,
            soLuongTrongBonTron: Number.isFinite(inMixerParsed) ? inMixerParsed : null,
            soLuongNlChuaTron: Number.isFinite(unblendedParsed) ? unblendedParsed : null,
            soLuongTonNgoai: Number.isFinite(outsideParsed) ? outsideParsed : null,
            soLuongTonDinhMuc: Number.isFinite(standardParsed) ? standardParsed : null,
            soLuongTon: Number.isFinite(amount) ? amount : 0,
            ghiChu: String(detail.ghi_chu ?? detail.note ?? '').trim(),
            hinhAnh: String(detail.hinh_anh ?? detail.imageUrl ?? detail.anh_url ?? '').trim(),
            hinhAnhPublicId: String(detail.hinh_anh_public_id ?? detail.imagePublicId ?? detail.anh_public_id ?? '').trim()
          };
        })
        .filter((line): line is MachineNvlSavedLine => Boolean(line));

      return {
        id: String(record.id ?? '').trim(),
        ngay: String(record.ngay ?? '').slice(0, 10),
        ca: String(record.ca ?? '').trim(),
        gio: String(record.gio ?? '').trim(),
        maMay: String(record.ma_may ?? '').trim(),
        tenMay: String(record.ten_may ?? '').trim(),
        nhanSu: String(record.nhan_su ?? '').trim(),
        total: Number(record.tong_so_luong_ton ?? 0) || 0,
        note: String(record.ghi_chu ?? '').trim(),
        reportKind: normalizeMachineNvlReportKind(record.loai_bao_cao ?? record.loai ?? record.reportKind),
        lines,
        createdAt: String(record.created_at ?? '').trim()
      };
    })
    .filter((report): report is MachineNvlSavedReport => Boolean(report));
}

export function isKgUnit(unit: unknown) {
  const normalized = String(unit ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilogam';
}

export function resolveMachineNvlLineKgFactor(
  line: Pick<MachineNvlSavedLine, 'donVi' | 'trongLuongQuyDoiKg'>
): number | null {
  if (isKgUnit(line.donVi)) return 1;
  const factor = line.trongLuongQuyDoiKg;
  return Number.isFinite(factor as number) && (factor as number) > 0 ? (factor as number) : null;
}

export function machineNvlQtyToKg(
  qty: number | null | undefined,
  line: Pick<MachineNvlSavedLine, 'donVi' | 'trongLuongQuyDoiKg'>
): number | null {
  if (qty === null || qty === undefined || !Number.isFinite(qty)) return null;
  const factor = resolveMachineNvlLineKgFactor(line);
  if (factor === null) return null;
  return qty * factor;
}

/** Tổng tồn đầu ca 1 dòng NVL = tồn máy + bồn trộn + NL chưa trộn + tồn ngoài (hoặc soLuongTon đã lưu). */
export function sumMachineNvlDauCaLineTotal(
  line: Pick<
    MachineNvlSavedLine,
    | 'donVi'
    | 'trongLuongQuyDoiKg'
    | 'soLuongTon'
    | 'loaiVatTu'
    | 'maNvl'
    | 'tenNvl'
    | 'soLuongTrongMay'
    | 'soLuongTrongBonTron'
    | 'soLuongNlChuaTron'
    | 'soLuongTonNgoai'
  >
) {
  let factor = resolveMachineNvlLineKgFactor(line);
  const hay = `${line.maNvl || ''} ${line.tenNvl || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const isLoi =
    line.loaiVatTu === 'loi' || hay.includes('loi') || /\bloi\b/.test(hay) || hay.startsWith('loi');
  const isBaoBi =
    line.loaiVatTu === 'bao_bi' ||
    hay.includes('tui') ||
    hay.includes('bao bi') ||
    hay.includes('tai nilon') ||
    hay.includes('bi nilon');
  if ((factor === null || factor <= 0) && (isLoi || isBaoBi)) factor = 1;
  if (factor === null || factor <= 0) {
    // Vẫn lấy SL thô khi chưa có hệ số quy đổi — hiển thị trên báo cáo BB
    const rawQty =
      line.soLuongTon > 0
        ? line.soLuongTon
        : (line.soLuongTrongMay ?? 0) +
          (line.soLuongTrongBonTron ?? 0) +
          (line.soLuongNlChuaTron ?? 0) +
          (line.soLuongTonNgoai ?? 0);
    return rawQty > 0 ? rawQty : 0;
  }
  const base =
    line.soLuongTon > 0
      ? line.soLuongTon
      : (line.soLuongTrongMay ?? 0) +
        (line.soLuongTrongBonTron ?? 0) +
        (line.soLuongNlChuaTron ?? 0) +
        (line.soLuongTonNgoai ?? 0);
  return base > 0 ? base * factor : 0;
}

/** Tổng tồn đầu ca của 1 báo cáo = tổng SL tồn các dòng (trong máy + bồn trộn + NL chưa trộn). */
export function sumMachineNvlDauCaReportTotal(report: Pick<MachineNvlSavedReport, 'reportKind' | 'total' | 'lines'>) {
  if (report.reportKind !== 'dau_ca') return 0;
  const fromLines = report.lines.reduce((sum, line) => sum + sumMachineNvlDauCaLineTotal(line), 0);
  if (fromLines > 0) return fromLines;
  return report.total > 0 ? report.total : 0;
}

/** Tổng tồn cuối ca 1 dòng NVL = SL tồn đã lưu (lõi thiếu hệ số → 1 kg/đơn vị). */
export function sumMachineNvlCuoiCaLineTotal(
  line: Pick<
    MachineNvlSavedLine,
    'donVi' | 'trongLuongQuyDoiKg' | 'soLuongTon' | 'loaiVatTu' | 'maNvl' | 'tenNvl' | 'soLuongTrongMay' | 'soLuongTrongBonTron' | 'soLuongNlChuaTron'
  >
) {
  let factor = resolveMachineNvlLineKgFactor(line);
  const hay = `${line.maNvl || ''} ${line.tenNvl || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const isLoi =
    line.loaiVatTu === 'loi' || hay.includes('loi') || /\bloi\b/.test(hay) || hay.startsWith('loi');
  const isBaoBi =
    line.loaiVatTu === 'bao_bi' ||
    hay.includes('tui') ||
    hay.includes('bao bi') ||
    hay.includes('tai nilon') ||
    hay.includes('bi nilon');
  // Lõi / bao bì thiếu hệ số quy đổi → mặc định 1 kg/đơn vị (khối lượng = SL tồn)
  if ((factor === null || factor <= 0) && (isLoi || isBaoBi)) factor = 1;
  if (factor === null || factor <= 0) return 0;
  const componentQty =
    (line.soLuongTrongMay ?? 0) + (line.soLuongTrongBonTron ?? 0) + (line.soLuongNlChuaTron ?? 0);
  const base =
    Number.isFinite(line.soLuongTon) && line.soLuongTon > 0 ? line.soLuongTon : componentQty;
  return base > 0 ? base * factor : 0;
}

/** Tổng tồn cuối ca của 1 báo cáo = tổng SL tồn các dòng. */
export function sumMachineNvlCuoiCaReportTotal(report: Pick<MachineNvlSavedReport, 'reportKind' | 'total' | 'lines'>) {
  if (report.reportKind !== 'cuoi_ca') return 0;
  const fromLines = report.lines.reduce((sum, line) => sum + sumMachineNvlCuoiCaLineTotal(line), 0);
  if (fromLines > 0) return fromLines;
  return report.total > 0 ? report.total : 0;
}

export type MachineNvlReportMachineGroup = {
  key: string;
  maMay: string;
  tenMay: string;
  reports: MachineNvlSavedReport[];
};

export type MachineNvlReportShiftGroup = {
  ca: string;
  machines: MachineNvlReportMachineGroup[];
};

export type MachineNvlReportDateGroup = {
  ngay: string;
  shifts: MachineNvlReportShiftGroup[];
};

export function machineNvlReportMachineKey(report: MachineNvlSavedReport) {
  const maMay = report.maMay.trim();
  const tenMay = report.tenMay.trim();
  return maMay || tenMay || '-';
}

function normalizeMachineNvlToken(value: string) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function machineNvlTokensMatch(left: string, right: string) {
  const a = normalizeMachineNvlToken(left);
  const b = normalizeMachineNvlToken(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function machineNvlCaMatches(left: string, right: string) {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Tìm phiếu tồn ca trùng khóa nghiệp vụ: ngày + ca + máy + loại (đầu/cuối ca). */
export function findDuplicateMachineNvlTonReport(
  reports: MachineNvlSavedReport[],
  opts: {
    ngay: string;
    ca: string;
    reportKind: MachineNvlReportKind;
    maMay?: string;
    tenMay?: string;
    excludeId?: string | null;
  }
): MachineNvlSavedReport | null {
  const ngay = String(opts.ngay || '').trim();
  const ca = String(opts.ca || '').trim();
  const maMay = String(opts.maMay || '').trim();
  const tenMay = String(opts.tenMay || '').trim();
  const excludeId = String(opts.excludeId || '').trim();
  if (!ngay || !ca || (!maMay && !tenMay)) return null;

  for (const report of reports) {
    if (excludeId && String(report.id) === excludeId) continue;
    if (report.reportKind !== opts.reportKind) continue;
    if (report.ngay !== ngay) continue;
    if (!machineNvlCaMatches(report.ca, ca)) continue;
    const sameMachine =
      machineNvlTokensMatch(report.maMay, maMay) ||
      machineNvlTokensMatch(report.tenMay, tenMay) ||
      machineNvlTokensMatch(report.maMay, tenMay) ||
      machineNvlTokensMatch(report.tenMay, maMay);
    if (sameMachine) return report;
  }
  return null;
}

export function formatMachineNvlDuplicateSaveMessage(
  reportKind: MachineNvlReportKind,
  ngay: string,
  ca: string,
  machineLabel: string
) {
  const kindLabel = reportKind === 'cuoi_ca' ? 'tồn cuối ca' : 'tồn đầu ca';
  const machine = String(machineLabel || '').trim() || 'máy đã chọn';
  return `Đã lưu báo cáo ${kindLabel} này rồi (${ngay} · ca ${ca} · ${machine}). Không lưu bản trùng.`;
}

export function buildMachineNvlReportGroups(
  reports: MachineNvlSavedReport[],
  shiftOrder: (ca: string) => number = () => 999
): MachineNvlReportDateGroup[] {
  const byDate = new Map<string, Map<string, Map<string, MachineNvlSavedReport[]>>>();

  for (const report of reports) {
    const ngay = report.ngay || '-';
    const ca = report.ca || '-';
    const machineKey = machineNvlReportMachineKey(report);

    if (!byDate.has(ngay)) byDate.set(ngay, new Map());
    const byShift = byDate.get(ngay)!;
    if (!byShift.has(ca)) byShift.set(ca, new Map());
    const byMachine = byShift.get(ca)!;
    const list = byMachine.get(machineKey) ?? [];
    list.push(report);
    byMachine.set(machineKey, list);
  }

  return [...byDate.entries()]
    .map(([ngay, byShift]) => ({
      ngay,
      shifts: [...byShift.entries()]
        .map(([ca, byMachine]) => ({
          ca,
          machines: [...byMachine.entries()]
            .map(([machineKey, groupReports]) => ({
              key: `${ngay}|${ca}|${machineKey}`,
              maMay: groupReports[0]?.maMay ?? '',
              tenMay: groupReports[0]?.tenMay ?? '',
              reports: [...groupReports].sort(
                (left, right) =>
                  (right.createdAt || '').localeCompare(left.createdAt || '') ||
                  (right.gio || '').localeCompare(left.gio || '')
              )
            }))
            .sort((left, right) =>
              (right.reports[0]?.createdAt || '').localeCompare(left.reports[0]?.createdAt || '')
            )
        }))
        .sort((left, right) =>
          (right.machines[0]?.reports[0]?.createdAt || '').localeCompare(
            left.machines[0]?.reports[0]?.createdAt || ''
          ) || shiftOrder(left.ca) - shiftOrder(right.ca)
        )
    }))
    .sort((left, right) =>
      (right.shifts[0]?.machines[0]?.reports[0]?.createdAt || '').localeCompare(
        left.shifts[0]?.machines[0]?.reports[0]?.createdAt || ''
      )
    );
}

export function machineNvlReportMatchesMachine(
  report: Pick<MachineNvlSavedReport, 'maMay' | 'tenMay'>,
  machineCode: string,
  machineName: string,
  machineRef: string
) {
  const ref = machineRef.trim().toLowerCase();
  const code = machineCode.trim().toLowerCase();
  const name = machineName.trim().toLowerCase();
  const reportCode = report.maMay.trim().toLowerCase();
  const reportName = report.tenMay.trim().toLowerCase();
  if (!ref && !code && !name) return false;
  if (ref && (ref === reportCode || ref === reportName || reportCode.includes(ref) || reportName.includes(ref))) {
    return true;
  }
  if (code && (code === reportCode || reportCode.includes(code) || code.includes(reportCode))) return true;
  if (name && (name === reportName || reportName.includes(name) || name.includes(reportName))) return true;
  return false;
}

export function findLatestPreviousCuoiCaReport(
  reports: MachineNvlSavedReport[],
  machineCode: string,
  machineName: string,
  machineRef: string,
  ngay: string,
  ca: string
) {
  const shiftKey = ca.trim().toLowerCase();
  return (
    reports
      .filter(report => report.reportKind === 'cuoi_ca')
      .filter(report => machineNvlReportMatchesMachine(report, machineCode, machineName, machineRef))
      .filter(report => !(report.ngay === ngay && report.ca.trim().toLowerCase() === shiftKey))
      .sort((a, b) => {
        const dateCompare = b.ngay.localeCompare(a.ngay);
        if (dateCompare !== 0) return dateCompare;
        return b.createdAt.localeCompare(a.createdAt);
      })[0] ?? null
  );
}

export function buildPreviousShiftQuantityMap(report: MachineNvlSavedReport | null) {
  const map = new Map<string, number>();
  if (!report) return map;
  report.lines.forEach(line => {
    const codeKey = normalizeProductCodeKey(line.maNvl);
    if (!codeKey) return;
    map.set(codeKey, line.soLuongTon);
  });
  return map;
}

const MACHINE_NVL_DISCREPANCY_TOLERANCE = 0.01;

export type MachineNvlDiscrepancyDiff = {
  code: string;
  name: string;
  unit: string;
  /** Tồn cuối ca trước (ca liền kề gần nhất cùng máy). */
  expected: number;
  /** Tồn đầu ca hiện tại đã nhập. */
  actual: number;
};

export type MachineNvlDiscrepancy = {
  previous: MachineNvlSavedReport;
  diffs: MachineNvlDiscrepancyDiff[];
};

/**
 * So khớp tồn đầu ca với tồn cuối ca của phiên gần nhất trước đó cùng máy (theo mã NVL).
 * Lệch quá ngưỡng (kể cả NVL có ở ca trước nhưng không được kê ở đầu ca này) → coi là chênh lệch.
 *
 * `findLatestPreviousCuoiCaReport` chỉ chọn theo ngày/giờ tạo mới nhất trong toàn bộ danh sách —
 * đúng cho form tạo mới (mọi phiếu cuối ca sẵn có đều nghiễm nhiên ở quá khứ), nhưng khi rà soát lại
 * danh sách đã lưu (có cả phiếu tương lai so với phiếu đầu ca đang xét) thì phải tự lọc bỏ trước
 * các phiếu cuối ca được tạo SAU phiếu đầu ca này, nếu không sẽ so sánh nhầm với dữ liệu tương lai.
 */
export function computeMachineNvlDauCaDiscrepancy(
  report: MachineNvlSavedReport,
  cuoiCaReports: MachineNvlSavedReport[]
): MachineNvlDiscrepancy | null {
  if (!report.createdAt) return null;
  const priorCuoiCaReports = cuoiCaReports.filter(
    candidate => Boolean(candidate.createdAt) && candidate.createdAt < report.createdAt
  );
  const previous = findLatestPreviousCuoiCaReport(
    priorCuoiCaReports,
    report.maMay,
    report.tenMay,
    report.maMay || report.tenMay,
    report.ngay,
    report.ca
  );
  if (!previous) return null;

  const prevMap = new Map<string, { qty: number; name: string; unit: string }>();
  previous.lines.forEach(line => {
    const key = normalizeProductCodeKey(line.maNvl);
    if (!key) return;
    prevMap.set(key, { qty: line.soLuongTon, name: line.tenNvl || line.maNvl, unit: line.donVi });
  });

  const diffs: MachineNvlDiscrepancyDiff[] = [];
  const seen = new Set<string>();
  report.lines.forEach(line => {
    const key = normalizeProductCodeKey(line.maNvl);
    if (!key) return;
    seen.add(key);
    const prev = prevMap.get(key);
    if (!prev) return;
    if (Math.abs(prev.qty - line.soLuongTon) > MACHINE_NVL_DISCREPANCY_TOLERANCE) {
      diffs.push({
        code: line.maNvl || key,
        name: line.tenNvl || prev.name,
        unit: line.donVi || prev.unit,
        expected: prev.qty,
        actual: line.soLuongTon
      });
    }
  });
  prevMap.forEach((info, key) => {
    if (seen.has(key)) return;
    if (info.qty > MACHINE_NVL_DISCREPANCY_TOLERANCE) {
      diffs.push({ code: key, name: info.name, unit: info.unit, expected: info.qty, actual: 0 });
    }
  });

  return { previous, diffs };
}
