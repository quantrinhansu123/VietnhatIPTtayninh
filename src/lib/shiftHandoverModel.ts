export const SHIFT_HANDOVER_FORM_CODE = 'QT-16-BM02';
export const SHIFT_HANDOVER_FORM_ISSUE = '03';
export const SHIFT_HANDOVER_FORM_EFFECTIVE = '03/08/2022';
export const SHIFT_HANDOVER_MIXING_FORM_EFFECTIVE = '01/04/2023';

export type HandoverFormTab = 'bao_cao';

export type MaterialCatalogOption = {
  code: string;
  name: string;
  unit: string;
};

export type ProductOption = {
  code: string;
  name: string;
  unit: string;
  totalWeightKg: number | null;
};

export type ProductLine = {
  key: string;
  productCode: string;
  productName: string;
  plannedReturn: string;
  quantity: string;
  rollWeight: string;
  resinNorm: string;
  defect20: string;
  defect30: string;
};

export type ScrapLine = {
  key: string;
  name: string;
  quantity: string;
};

/** Dòng tồn cuối ca NVL trên phiếu giao ca. */
export type ClosingStockLine = {
  key: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: string;
  weightKg: string;
};

export type KpiLine = {
  key: string;
  criteria: string;
  norm: string;
  actual: string;
};

export type SavedProductLine = {
  stt: number;
  productCode: string;
  productName: string;
  plannedReturn: number | null;
  quantity: number | null;
  rollWeight: number | null;
  resinNorm: number | null;
  totalNormWeight: number | null;
  defect20: string;
  defect30: string;
};

export type SavedScrapLine = {
  stt: number;
  name: string;
  quantity: number | null;
};

export type SavedClosingStockLine = {
  stt: number;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number | null;
  weightKg: number | null;
};

export type SavedKpiLine = {
  stt: number;
  criteria: string;
  norm: number | null;
  actual: number | null;
  variance: number | null;
};

export type SavedHandoverTask = {
  stt: number;
  content: string;
  priority: string;
  assignee: string;
  status: string;
  note: string;
};

export type ShiftHandoverSlip = {
  id: string;
  slipCode: string;
  date: string;
  shift: string;
  nextShift: string;
  timeFrom: string;
  timeTo: string;
  machineCode: string;
  machineName: string;
  operators: string;
  receivedBy: string;
  productionStatus: string;
  output: string;
  machineStatus: string;
  endingStock: string;
  note: string;
  products: SavedProductLine[];
  scraps: SavedScrapLine[];
  closingStockLines: SavedClosingStockLine[];
  materials: SavedMixingMaterialLine[];
  kpis: SavedKpiLine[];
  lines: SavedHandoverTask[];
  createdAt: string;
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyProductLine(): ProductLine {
  return {
    key: newKey(),
    productCode: '',
    productName: '',
    plannedReturn: '',
    quantity: '',
    rollWeight: '',
    resinNorm: '',
    defect20: '',
    defect30: ''
  };
}

export function emptyScrapLine(): ScrapLine {
  return { key: newKey(), name: '', quantity: '' };
}

export function emptyClosingStockLine(): ClosingStockLine {
  return {
    key: newKey(),
    itemCode: '',
    itemName: '',
    unit: '',
    quantity: '',
    weightKg: ''
  };
}

export type MixingMaterialLine = {
  key: string;
  materialCode: string;
  materialName: string;
  unit: string;
  normKg: string;
  percent: string;
  opening: string;
  takenFromWh: string;
  use1: string;
  use2: string;
  use3: string;
  use4: string;
  use5: string;
  closing: string;
};

export type SavedMixingMaterialLine = {
  stt: number;
  materialCode: string;
  materialName: string;
  unit: string;
  normKg: number | null;
  percent: number | null;
  opening: number | null;
  takenFromWh: number | null;
  use1: number | null;
  use2: number | null;
  use3: number | null;
  use4: number | null;
  use5: number | null;
  mixedTotal: number | null;
  closing: number | null;
  actualUsage: number | null;
};

export const DEFAULT_MIXING_MATERIALS: Array<{ name: string; unit: string }> = [
  { name: 'Nhựa nguyên sinh 1 lớp', unit: 'kg' },
  { name: 'Nhựa nguyên sinh 2 lớp', unit: 'kg' },
  { name: 'Nhựa tái chế mua ngoài', unit: 'kg' },
  { name: 'Nhựa tái chế Việt Nhật', unit: 'kg' },
  { name: 'Bột tăng trắng', unit: 'kg' },
  { name: 'Phụ gia đùn nhanh', unit: 'kg' },
  { name: 'Dầu phân tán', unit: 'kg' },
  { name: 'Băng dính trắng', unit: 'Cuộn' },
  { name: 'Túi nilon', unit: 'Cái' },
  { name: 'Lõi 20cm', unit: 'Cái' },
  { name: 'Lõi 30cm', unit: 'Cái' },
  { name: 'Ống phế', unit: 'Cái' },
  { name: '', unit: 'kg' },
  { name: '', unit: 'kg' },
  { name: '', unit: 'kg' },
  { name: '', unit: 'kg' },
  { name: '', unit: 'kg' },
  { name: '', unit: 'kg' },
  { name: 'Nhựa trộn còn lại ca trước', unit: 'kg' },
  { name: 'Nhựa trộn còn lại trong thùng', unit: 'kg' }
];

export function emptyMixingMaterialLine(name = '', unit = 'kg'): MixingMaterialLine {
  return {
    key: newKey(),
    materialCode: '',
    materialName: name,
    unit,
    normKg: '',
    percent: '',
    opening: '',
    takenFromWh: '',
    use1: '',
    use2: '',
    use3: '',
    use4: '',
    use5: '',
    closing: ''
  };
}

export function defaultMixingMaterialLines(): MixingMaterialLine[] {
  return [];
}

export const DEFAULT_KPI_CRITERIA = [
  '1. Định mức số lượng thành phẩm sản xuất 1h(cuộn)',
  '2. Định mức nhựa không màng. Nhựa đầu keo ca 12h(kg)',
  '3. Định mức hàng rác *0,75. ca 12h(kg)',
  '4. Định mức nhựa thực dùng. ca 12h(kg)'
] as const;

export function emptyKpiLine(criteria = ''): KpiLine {
  return { key: newKey(), criteria, norm: '', actual: '' };
}

export function defaultKpiLines(): KpiLine[] {
  return DEFAULT_KPI_CRITERIA.map(criteria => emptyKpiLine(criteria));
}

export function parseQty(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function formatQty(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return String(rounded);
}

export function totalNormWeight(quantity: string, resinNorm: string): number | null {
  const qty = parseQty(quantity);
  const norm = parseQty(resinNorm);
  if (qty === null || norm === null) return null;
  return Math.round(qty * norm * 1000) / 1000;
}

export function kpiVariance(norm: string, actual: string): number | null {
  const n = parseQty(norm);
  const a = parseQty(actual);
  if (n === null || a === null) return null;
  // Phiếu giấy: Chênh lệch mức = SL ĐM − Thực tế
  return Math.round((n - a) * 1000) / 1000;
}

export function mixedTotalFromUses(
  use1: string | number | null | undefined,
  use2: string | number | null | undefined,
  use3: string | number | null | undefined,
  use4: string | number | null | undefined,
  use5: string | number | null | undefined
): number | null {
  const values = [use1, use2, use3, use4, use5].map(parseQty);
  if (values.every(value => value === null)) return null;
  return Math.round(values.reduce((sum, value) => sum + (value ?? 0), 0) * 1000) / 1000;
}

/** Thực tế sử dụng = tồn đầu ca + thực tế trộn trong ca − tồn cuối ca */
export function mixingActualUsage(
  opening: string | number | null | undefined,
  mixedTotal: number | null,
  closing: string | number | null | undefined
): number | null {
  const open = parseQty(opening);
  const close = parseQty(closing);
  if (open === null && mixedTotal === null && close === null) return null;
  return Math.round(((open ?? 0) + (mixedTotal ?? 0) - (close ?? 0)) * 1000) / 1000;
}

export function isMixingKgUnit(unit: string) {
  return ['kg', 'kilogram', 'kilograms', ''].includes(String(unit ?? '').trim().toLowerCase());
}

function isNkSxDetail(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function mapProduct(line: unknown, index: number): SavedProductLine | null {
  const record = asRecord(line);
  if (!record) return null;
  const productCode = pickText(record, ['ma_hang', 'productCode', 'ma_sp']);
  const productName = pickText(record, ['thanh_pham', 'productName', 'ten_sp']);
  const plannedReturn = parseQty(record.du_kien_tra_kho as string | number);
  const quantity = parseQty(record.so_luong as string | number);
  const rollWeight = parseQty(record.trong_luong_cuon as string | number);
  const resinNorm = parseQty(record.dinh_muc_nhua as string | number);
  const totalFromRecord = parseQty(record.tong_tl_dm as string | number);
  const defect20 = pickText(record, ['loi_20cm', 'defect20']);
  const defect30 = pickText(record, ['loi_30cm', 'defect30']);
  if (
    !productCode &&
    !productName &&
    plannedReturn === null &&
    quantity === null &&
    rollWeight === null &&
    resinNorm === null &&
    !defect20 &&
    !defect30
  ) {
    return null;
  }
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    productCode,
    productName,
    plannedReturn,
    quantity,
    rollWeight,
    resinNorm,
    totalNormWeight:
      totalFromRecord ??
      (quantity !== null && resinNorm !== null ? Math.round(quantity * resinNorm * 1000) / 1000 : null),
    defect20,
    defect30
  };
}

function mapScrap(line: unknown, index: number): SavedScrapLine | null {
  const record = asRecord(line);
  if (!record) return null;
  const name = pickText(record, ['ten', 'name', 'ten_loi']);
  const quantity = parseQty(record.so_luong as string | number);
  if (!name && quantity === null) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    name,
    quantity
  };
}

function mapClosingStock(line: unknown, index: number): SavedClosingStockLine | null {
  const record = asRecord(line);
  if (!record) return null;
  const itemCode = pickText(record, ['ma_nvl', 'itemCode', 'ma']);
  const itemName = pickText(record, ['ten_nvl', 'itemName', 'ten']);
  const unit = pickText(record, ['dvt', 'don_vi', 'unit']);
  const quantity = parseQty(record.so_luong as string | number);
  const weightKg = parseQty(
    (record.trong_luong_kg ?? record.trong_luong ?? record.weightKg) as string | number
  );
  if (!itemCode && !itemName && quantity === null && weightKg === null) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    itemCode,
    itemName,
    unit,
    quantity,
    weightKg
  };
}

function mixingLineHasValues(record: Record<string, unknown>) {
  return [
    record.dinh_muc_kg,
    record.ti_le,
    record.ton_dau,
    record.lay_kho,
    record.lan1,
    record.lan2,
    record.lan3,
    record.lan4,
    record.lan5,
    record.tong_nhua_tron,
    record.ton_cuoi,
    record.thuc_te_sd
  ].some(value => parseQty(value as string | number) !== null);
}

function mapMixingMaterial(line: unknown, index: number): SavedMixingMaterialLine | null {
  const record = asRecord(line);
  if (!record) return null;
  const materialCode = pickText(record, ['ma_nvl', 'materialCode']);
  const materialName = pickText(record, ['ten_nvl', 'materialName', 'ten']);
  const unit = pickText(record, ['don_vi', 'dvt', 'unit']);
  const use1 = parseQty(record.lan1 as string | number);
  const use2 = parseQty(record.lan2 as string | number);
  const use3 = parseQty(record.lan3 as string | number);
  const use4 = parseQty(record.lan4 as string | number);
  const use5 = parseQty(record.lan5 as string | number);
  const mixedTotal =
    parseQty(record.tong_nhua_tron as string | number) ??
    mixedTotalFromUses(use1, use2, use3, use4, use5);
  const opening = parseQty(record.ton_dau as string | number);
  const closing = parseQty(record.ton_cuoi as string | number);
  if (!materialCode && !materialName && !mixingLineHasValues(record)) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    materialCode,
    materialName,
    unit,
    normKg: parseQty(record.dinh_muc_kg as string | number),
    percent: parseQty(record.ti_le as string | number),
    opening,
    takenFromWh: parseQty(record.lay_kho as string | number),
    use1,
    use2,
    use3,
    use4,
    use5,
    mixedTotal,
    closing,
    actualUsage:
      parseQty(record.thuc_te_sd as string | number) ?? mixingActualUsage(opening, mixedTotal, closing)
  };
}

function mapKpi(line: unknown, index: number): SavedKpiLine | null {
  const record = asRecord(line);
  if (!record) return null;
  const criteria = pickText(record, ['chi_tieu', 'criteria']);
  const norm = parseQty(record.sl_dm as string | number);
  const actual = parseQty(record.thuc_te as string | number);
  const varianceFromRecord = parseQty(record.chenh_lech as string | number);
  if (!criteria && norm === null && actual === null) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    criteria,
    norm,
    actual,
    variance:
      varianceFromRecord ??
      (norm !== null && actual !== null ? Math.round((actual - norm) * 1000) / 1000 : null)
  };
}

function mapTask(line: unknown, index: number): SavedHandoverTask | null {
  const record = asRecord(line);
  if (!record) return null;
  const content = pickText(record, ['noi_dung', 'content']);
  const priority = pickText(record, ['muc_do', 'priority']);
  const assignee = pickText(record, ['nguoi_phu_trach', 'assignee']);
  const status = pickText(record, ['trang_thai', 'status']);
  const note = pickText(record, ['ghi_chu', 'note']);
  if (!content && !priority && !assignee && !status && !note) return null;
  return {
    stt: Number(record.stt ?? index + 1) || index + 1,
    content,
    priority,
    assignee,
    status,
    note
  };
}

export function sumProductTotals(products: SavedProductLine[]) {
  return products.reduce(
    (acc, line) => ({
      plannedReturn: acc.plannedReturn + (line.plannedReturn ?? 0),
      quantity: acc.quantity + (line.quantity ?? 0),
      totalNormWeight: acc.totalNormWeight + (line.totalNormWeight ?? 0)
    }),
    { plannedReturn: 0, quantity: 0, totalNormWeight: 0 }
  );
}

export function sumScrapQuantity(scraps: SavedScrapLine[]) {
  return scraps.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
}

export function sumClosingStockTotals(lines: SavedClosingStockLine[]) {
  return lines.reduce(
    (acc, line) => ({
      quantity: acc.quantity + (line.quantity ?? 0),
      weightKg: acc.weightKg + (line.weightKg ?? 0)
    }),
    { quantity: 0, weightKg: 0 }
  );
}

export function productLinesToForm(products: SavedProductLine[]): ProductLine[] {
  const lines = products.map(line => ({
    key: newKey(),
    productCode: line.productCode,
    productName: line.productName,
    plannedReturn: formatQty(line.plannedReturn),
    quantity: formatQty(line.quantity),
    rollWeight: formatQty(line.rollWeight),
    resinNorm: formatQty(line.resinNorm),
    defect20: line.defect20,
    defect30: line.defect30
  }));
  return lines.length > 0 ? lines : [emptyProductLine()];
}

export function scrapLinesToForm(scraps: SavedScrapLine[]): ScrapLine[] {
  const lines = scraps.map(line => ({
    key: newKey(),
    name: line.name,
    quantity: formatQty(line.quantity)
  }));
  return lines.length > 0 ? lines : [emptyScrapLine(), emptyScrapLine(), emptyScrapLine()];
}

export function closingStockLinesToForm(lines: SavedClosingStockLine[]): ClosingStockLine[] {
  const mapped = lines.map(line => ({
    key: newKey(),
    itemCode: line.itemCode,
    itemName: line.itemName,
    unit: line.unit,
    quantity: formatQty(line.quantity),
    weightKg: formatQty(line.weightKg)
  }));
  return mapped.length > 0 ? mapped : [emptyClosingStockLine()];
}

export function mixingMaterialLinesToForm(lines: SavedMixingMaterialLine[]): MixingMaterialLine[] {
  return lines.map(line => ({
    key: newKey(),
    materialCode: line.materialCode,
    materialName: line.materialName,
    unit: line.unit,
    normKg: formatQty(line.normKg),
    percent: formatQty(line.percent),
    opening: formatQty(line.opening),
    takenFromWh: formatQty(line.takenFromWh),
    use1: formatQty(line.use1),
    use2: formatQty(line.use2),
    use3: formatQty(line.use3),
    use4: formatQty(line.use4),
    use5: formatQty(line.use5),
    closing: formatQty(line.closing)
  }));
}

export function mixingLineHasData(line: MixingMaterialLine | SavedMixingMaterialLine) {
  if ('use1' in line && typeof (line as MixingMaterialLine).use1 === 'string') {
    const form = line as MixingMaterialLine;
    return Boolean(
      form.materialCode.trim() ||
        (form.materialName.trim() &&
          (parseQty(form.normKg) !== null ||
            parseQty(form.percent) !== null ||
            parseQty(form.opening) !== null ||
            parseQty(form.takenFromWh) !== null ||
            parseQty(form.use1) !== null ||
            parseQty(form.use2) !== null ||
            parseQty(form.use3) !== null ||
            parseQty(form.use4) !== null ||
            parseQty(form.use5) !== null ||
            parseQty(form.closing) !== null))
    );
  }
  const saved = line as SavedMixingMaterialLine;
  return [
    saved.normKg,
    saved.percent,
    saved.opening,
    saved.takenFromWh,
    saved.use1,
    saved.use2,
    saved.use3,
    saved.use4,
    saved.use5,
    saved.mixedTotal,
    saved.closing,
    saved.actualUsage
  ].some(value => value !== null);
}

export function sumMixingActualUsage(lines: SavedMixingMaterialLine[]) {
  return lines.reduce((sum, line) => {
    if (!isMixingKgUnit(line.unit)) return sum;
    return sum + (line.actualUsage ?? 0);
  }, 0);
}

export function kpiLinesToForm(kpis: SavedKpiLine[]): KpiLine[] {
  if (kpis.length === 0) return defaultKpiLines();
  return kpis.map(line => ({
    key: newKey(),
    criteria: line.criteria,
    norm: formatQty(line.norm),
    actual: formatQty(line.actual)
  }));
}

export function buildChiTietPayload(input: {
  timeFrom: string;
  timeTo: string;
  products: ProductLine[];
  scraps: ScrapLine[];
  closingStockLines?: ClosingStockLine[];
  materials?: MixingMaterialLine[];
  kpis: KpiLine[];
}) {
  const thanh_pham = input.products
    .map((line, index) => {
      const quantity = parseQty(line.quantity);
      const resinNorm = parseQty(line.resinNorm);
      if (
        !line.productCode.trim() &&
        !line.productName.trim() &&
        parseQty(line.plannedReturn) === null &&
        quantity === null &&
        parseQty(line.rollWeight) === null &&
        resinNorm === null &&
        !line.defect20.trim() &&
        !line.defect30.trim()
      ) {
        return null;
      }
      return {
        stt: index + 1,
        ma_hang: line.productCode.trim(),
        thanh_pham: line.productName.trim(),
        du_kien_tra_kho: parseQty(line.plannedReturn),
        so_luong: quantity,
        trong_luong_cuon: parseQty(line.rollWeight),
        dinh_muc_nhua: resinNorm,
        tong_tl_dm: totalNormWeight(line.quantity, line.resinNorm),
        loi_20cm: line.defect20.trim(),
        loi_30cm: line.defect30.trim()
      };
    })
    .filter(Boolean);

  const hang_loi = input.scraps
    .map((line, index) => {
      if (!line.name.trim() && parseQty(line.quantity) === null) return null;
      return {
        stt: index + 1,
        ten: line.name.trim(),
        so_luong: parseQty(line.quantity)
      };
    })
    .filter(Boolean);

  const ton_cuoi_ca = (input.closingStockLines || [])
    .map((line, index) => {
      if (
        !line.itemCode.trim() &&
        !line.itemName.trim() &&
        parseQty(line.quantity) === null &&
        parseQty(line.weightKg) === null
      ) {
        return null;
      }
      return {
        stt: index + 1,
        ma_nvl: line.itemCode.trim(),
        ten_nvl: line.itemName.trim(),
        dvt: line.unit.trim(),
        so_luong: parseQty(line.quantity),
        trong_luong_kg: parseQty(line.weightKg)
      };
    })
    .filter(Boolean);

  const vat_tu = (input.materials || [])
    .map((line, index) => {
      const mixed = mixedTotalFromUses(line.use1, line.use2, line.use3, line.use4, line.use5);
      if (
        !line.materialCode.trim() &&
        !line.materialName.trim() &&
        parseQty(line.normKg) === null &&
        parseQty(line.percent) === null &&
        parseQty(line.opening) === null &&
        parseQty(line.takenFromWh) === null &&
        mixed === null &&
        parseQty(line.closing) === null
      ) {
        return null;
      }
      if (!mixingLineHasData(line) && !line.materialCode.trim()) return null;
      return {
        stt: index + 1,
        ma_nvl: line.materialCode.trim(),
        ten_nvl: line.materialName.trim(),
        don_vi: line.unit.trim() || 'kg',
        dinh_muc_kg: parseQty(line.normKg),
        ti_le: parseQty(line.percent),
        ton_dau: parseQty(line.opening),
        lay_kho: parseQty(line.takenFromWh),
        lan1: parseQty(line.use1),
        lan2: parseQty(line.use2),
        lan3: parseQty(line.use3),
        lan4: parseQty(line.use4),
        lan5: parseQty(line.use5),
        tong_nhua_tron: mixed,
        ton_cuoi: parseQty(line.closing),
        thuc_te_sd: mixingActualUsage(line.opening, mixed, line.closing)
      };
    })
    .filter(Boolean);

  const bao_cao_cuoi_ca = input.kpis
    .map((line, index) => {
      if (!line.criteria.trim() && parseQty(line.norm) === null && parseQty(line.actual) === null) {
        return null;
      }
      return {
        stt: index + 1,
        chi_tieu: line.criteria.trim(),
        sl_dm: parseQty(line.norm),
        thuc_te: parseQty(line.actual),
        chenh_lech: kpiVariance(line.norm, line.actual)
      };
    })
    .filter(Boolean);

  return {
    loai: 'nk_sx',
    gio_tu: input.timeFrom.trim(),
    gio_den: input.timeTo.trim(),
    thanh_pham,
    hang_loi,
    ton_cuoi_ca,
    vat_tu,
    bao_cao_cuoi_ca
  };
}

export function normalizeShiftHandoverSlips(data: unknown): ShiftHandoverSlip[] {
  const slips = (data as { slips?: unknown })?.slips;
  if (!Array.isArray(slips)) return [];

  return slips
    .map((item): ShiftHandoverSlip | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const rawDetail = record.chi_tiet;
      const detail = isNkSxDetail(rawDetail) ? rawDetail : null;
      const productSource = Array.isArray(detail?.thanh_pham)
        ? detail.thanh_pham
        : Array.isArray(record.thanh_pham)
          ? record.thanh_pham
          : [];
      const scrapSource = Array.isArray(detail?.hang_loi)
        ? detail.hang_loi
        : Array.isArray(record.hang_loi)
          ? record.hang_loi
          : [];
      const closingStockSource = Array.isArray(detail?.ton_cuoi_ca)
        ? detail.ton_cuoi_ca
        : Array.isArray(record.ton_cuoi_ca)
          ? record.ton_cuoi_ca
          : [];
      const materialSource = Array.isArray(detail?.vat_tu)
        ? detail.vat_tu
        : Array.isArray(record.vat_tu)
          ? record.vat_tu
          : [];
      const kpiSource = Array.isArray(detail?.bao_cao_cuoi_ca)
        ? detail.bao_cao_cuoi_ca
        : Array.isArray(record.bao_cao_cuoi_ca)
          ? record.bao_cao_cuoi_ca
          : [];
      const taskSource = Array.isArray(rawDetail)
        ? rawDetail
        : Array.isArray(detail?.viec_ban_giao)
          ? detail.viec_ban_giao
          : [];

      return {
        id: String(record.id ?? '').trim(),
        slipCode: String(record.so_phieu ?? '').trim(),
        date: String(record.ngay ?? '').slice(0, 10),
        shift: String(record.ca_giao ?? '').trim(),
        nextShift: String(record.ca_nhan ?? '').trim(),
        timeFrom: String(detail?.gio_tu ?? record.gio_tu ?? '').trim(),
        timeTo: String(detail?.gio_den ?? record.gio_den ?? '').trim(),
        machineCode: String(record.ma_may ?? '').trim(),
        machineName: String(record.ten_may ?? '').trim(),
        operators: String(record.nguoi_giao_ca ?? record.nguoi_thuc_hien ?? '').trim(),
        receivedBy: String(record.nguoi_nhan_ca ?? '').trim(),
        productionStatus: String(record.tinh_hinh_san_xuat ?? '').trim(),
        output: String(record.san_luong_dat_duoc ?? '').trim(),
        machineStatus: String(record.tinh_trang_may_moc ?? '').trim(),
        endingStock: String(record.ton_kho_cuoi_ca ?? '').trim(),
        note: String(record.ghi_chu_chung ?? '').trim(),
        products: productSource.map(mapProduct).filter((line): line is SavedProductLine => Boolean(line)),
        scraps: scrapSource.map(mapScrap).filter((line): line is SavedScrapLine => Boolean(line)),
        closingStockLines: closingStockSource
          .map(mapClosingStock)
          .filter((line): line is SavedClosingStockLine => Boolean(line)),
        materials: materialSource
          .map(mapMixingMaterial)
          .filter((line): line is SavedMixingMaterialLine => Boolean(line)),
        kpis: kpiSource.map(mapKpi).filter((line): line is SavedKpiLine => Boolean(line)),
        lines: taskSource.map(mapTask).filter((line): line is SavedHandoverTask => Boolean(line)),
        createdAt: String(record.created_at ?? '').trim()
      };
    })
    .filter((slip): slip is ShiftHandoverSlip => Boolean(slip));
}
