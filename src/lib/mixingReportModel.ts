import { formatNumber } from '../utils';
import type { MixingPhoiTron, MixingReport, MixingReportLine, MixingRoundItem, MixingRoundPhoto } from '../components/MixingReportForm';

export const MIXING_MAX_ROUNDS = 20;
export type MixingRoundKey = `lan_${number}`;
export const MIXING_ROUND_KEYS: readonly MixingRoundKey[] = Array.from(
  { length: MIXING_MAX_ROUNDS },
  (_, index) => `lan_${index + 1}` as MixingRoundKey
);

const NORM_WEIGHT_DECIMALS = 3;
const NORM_WEIGHT_SCALE = 10 ** NORM_WEIGHT_DECIMALS;

export function roundNormWeight(value: number) {
  return Math.round(value * NORM_WEIGHT_SCALE) / NORM_WEIGHT_SCALE;
}

function parseOptionalNumber(value: string) {
  if (!value || !String(value).trim()) return null;
  const normalized = String(value).replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}


function parseStoredNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  return parseOptionalNumber(String(value));
}

function parseStoredKlThucTe(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  return parseDecimalWeightInput(String(value));
}

function isMeaningfulRoundItem(item: MixingRoundItem) {
  return Boolean(
    item.ma_nvl.trim() || item.ten_vat_tu.trim() || item.so_luong !== null || item.kl_thuc_te !== null
  );
}

function hasMaterialRoundItems(phoiTron: MixingPhoiTron) {
  return MIXING_ROUND_KEYS.some(key => getRoundItems(phoiTron, key).some(isMeaningfulRoundItem));
}

function backfillLegacyLinePhoiTron(
  line: Record<string, unknown>,
  lan_su_dung: MixingPhoiTron,
  ma_nvl: string,
  ten_vat_tu: string
): MixingPhoiTron {
  if (hasMaterialRoundItems(lan_su_dung)) return lan_su_dung;

  const don_vi = String(line.don_vi ?? line.unit ?? 'kg').trim() || 'kg';
  const tong_nhua_tron = parseStoredNumber(line.tong_nhua_tron);
  const ti_le_phan_tram = parseStoredNumber(line.ti_le_phan_tram ?? line.phan_tram);

  if (!ma_nvl && !ten_vat_tu && tong_nhua_tron === null) return lan_su_dung;

  return {
    ...lan_su_dung,
    lan_1: [
      {
        ma_nvl,
        ten_vat_tu,
        don_vi,
        so_luong: tong_nhua_tron,
        ti_le_phan_tram,
        kl_thuc_te: null
      }
    ]
  };
}

function normalizeRoundItems(value: unknown): MixingRoundItem[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'number') {
    return [{ ma_nvl: '', ten_vat_tu: '', don_vi: 'kg', so_luong: value, kl_thuc_te: null, ti_le_phan_tram: null }];
  }
  if (!Array.isArray(value)) {
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return [
        {
          ma_nvl: String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim(),
          ten_vat_tu: String(record.ten_vat_tu ?? record.ten_npl ?? '').trim(),
          don_vi: String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg',
          so_luong: parseStoredNumber(record.so_luong ?? record.so_luong_kg),
          kl_thuc_te: parseStoredKlThucTe(record.kl_thuc_te ?? record.so_luong_thuc_te),
          ti_le_phan_tram: parseStoredNumber(record.ti_le_phan_tram ?? record.phan_tram)
        }
      ];
    }
    return [];
  }
  return value
    .map((item): MixingRoundItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      return {
        ma_nvl: String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim(),
        ten_vat_tu: String(record.ten_vat_tu ?? record.ten_npl ?? '').trim(),
        don_vi: String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg',
        so_luong: parseStoredNumber(record.so_luong ?? record.so_luong_kg),
        kl_thuc_te: parseStoredKlThucTe(record.kl_thuc_te ?? record.so_luong_thuc_te),
        ti_le_phan_tram: parseStoredNumber(record.ti_le_phan_tram ?? record.phan_tram)
      };
    })
    .filter((item): item is MixingRoundItem => Boolean(item))
    .filter(isMeaningfulRoundItem);
}

export function normalizePhoiTron(source: unknown): MixingPhoiTron {
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const phoiTron: MixingPhoiTron = {};
  MIXING_ROUND_KEYS.forEach(key => {
    const items = normalizeRoundItems(record[key]);
    if (items.length > 0) phoiTron[key] = items;
  });
  const rawBatch = record.khoi_luong_me;
  if (rawBatch && typeof rawBatch === 'object') {
    const khoi_luong_me: Partial<Record<MixingRoundKey, number | null>> = {};
    MIXING_ROUND_KEYS.forEach(key => {
      const val = parseStoredNumber((rawBatch as Record<string, unknown>)[key]);
      if (val !== null && val > 0) khoi_luong_me[key] = val;
    });
    if (Object.keys(khoi_luong_me).length > 0) phoiTron.khoi_luong_me = khoi_luong_me;
  }
  if (!phoiTron.lan_1) phoiTron.lan_1 = [];
  return phoiTron;
}

export function getRoundItems(phoiTron: MixingPhoiTron, key: MixingRoundKey) {
  return phoiTron[key] ?? [];
}

export function visibleRoundCount(phoiTron: MixingPhoiTron) {
  for (let index = MIXING_ROUND_KEYS.length - 1; index >= 0; index -= 1) {
    if (phoiTron[MIXING_ROUND_KEYS[index]] !== undefined) return index + 1;
  }
  return 1;
}

export function getRoundBatchWeight(phoiTron: MixingPhoiTron, key: MixingRoundKey): number | null {
  const weight = phoiTron.khoi_luong_me?.[key];
  if (weight === null || weight === undefined || weight <= 0) return null;
  return roundNormWeight(weight);
}

/** Tổng KL định mức 1 mẻ = KL mẻ (không cộng từng dòng NVL). */
export function sumRoundQuantity(phoiTron: MixingPhoiTron, key: MixingRoundKey) {
  const batchWeight = getRoundBatchWeight(phoiTron, key);
  if (batchWeight !== null) return batchWeight;
  return sumRoundItemQuantity(phoiTron, key);
}

/** Cộng KL định mức từng dòng NVL trong 1 mẻ (dùng hiển thị theo vật tư). */
export function sumRoundItemQuantity(phoiTron: MixingPhoiTron, key: MixingRoundKey) {
  return roundNormWeight(
    getRoundItems(phoiTron, key).reduce((sum, item) => sum + (item.so_luong ?? 0), 0)
  );
}

export function sumLineRoundNormQuantity(line: MixingReportLine, roundKey: MixingRoundKey) {
  return sumRoundItemQuantity(line.lan_su_dung, roundKey);
}

export function sumLineNormQuantity(line: MixingReportLine) {
  const roundCount = visibleRoundCount(line.lan_su_dung);
  return roundNormWeight(
    MIXING_ROUND_KEYS.slice(0, roundCount).reduce(
      (sum, key) => sum + sumLineRoundNormQuantity(line, key),
      0
    )
  );
}

export function sumRoundActualQuantity(phoiTron: MixingPhoiTron, key: MixingRoundKey) {
  return roundNormWeight(
    getRoundItems(phoiTron, key).reduce((sum, item) => sum + (item.kl_thuc_te ?? 0), 0)
  );
}

export function hasMixingActualWeights(phoiTron: MixingPhoiTron) {
  return MIXING_ROUND_KEYS.some(key =>
    getRoundItems(phoiTron, key).some(
      item => item.kl_thuc_te !== null && item.kl_thuc_te !== undefined && !Number.isNaN(item.kl_thuc_te)
    )
  );
}

export function sumMixingRounds(phoiTron: MixingPhoiTron) {
  const roundCount = visibleRoundCount(phoiTron);
  return roundNormWeight(
    MIXING_ROUND_KEYS.slice(0, roundCount).reduce((sum, key) => sum + sumRoundQuantity(phoiTron, key), 0)
  );
}

/** Tổng KL định mức cả phiếu — lấy KL mẻ các lần (mỗi dòng NVL dùng chung cấu hình mẻ). */
export function sumReportNormTotal(chi_tiet: MixingReportLine[]) {
  for (const line of chi_tiet) {
    const total = sumMixingRounds(line.lan_su_dung);
    if (total > 0) return total;
  }
  return 0;
}

export function sumMixingRoundsActual(phoiTron: MixingPhoiTron) {
  return roundNormWeight(
    MIXING_ROUND_KEYS.reduce((sum, key) => sum + sumRoundActualQuantity(phoiTron, key), 0)
  );
}

export function resolveLineKlThucTe(line: Pick<MixingReportLine, 'lan_su_dung' | 'kl_thuc_te'>): number | null {
  if (hasMixingActualWeights(line.lan_su_dung)) {
    return sumMixingRoundsActual(line.lan_su_dung);
  }
  const raw = line.kl_thuc_te;
  if (raw !== null && raw !== undefined && Number.isFinite(raw)) {
    return roundNormWeight(raw);
  }
  return null;
}

function backfillItemKlFromLineRecord(
  lan_su_dung: MixingPhoiTron,
  ma_nvl: string,
  ten_vat_tu: string,
  kl: number
): MixingPhoiTron {
  if (hasMixingActualWeights(lan_su_dung)) return lan_su_dung;

  for (const key of MIXING_ROUND_KEYS) {
    const items = getRoundItems(lan_su_dung, key);
    if (items.length === 0) continue;

    const codeKey = normalizeMaterialKey(ma_nvl || ten_vat_tu);
    const updated = items.map(item => {
      const itemKey = normalizeMaterialKey(item.ma_nvl || item.ten_vat_tu);
      const matches = !codeKey || !itemKey || codeKey === itemKey || items.length === 1;
      return matches ? { ...item, kl_thuc_te: kl } : item;
    });
    return { ...lan_su_dung, [key]: updated };
  }

  return lan_su_dung;
}

export function resolveLineTotalWeight(line: MixingReportLine) {
  const actual = sumMixingRoundsActual(line.lan_su_dung);
  if (hasMixingActualWeights(line.lan_su_dung)) return actual;
  return line.tong_nhua_tron ?? sumMixingRounds(line.lan_su_dung);
}

export function updateMaterialActualWeightInRound(
  lines: MixingReportLine[],
  roundKey: MixingRoundKey,
  lineIndex: number,
  itemIndex: number,
  value: string
): MixingReportLine[] {
  const parsed = parseBatchWeightInput(value);
  return lines.map((line, index) => {
    if (index !== lineIndex) return line;
    const items = [...getRoundItems(line.lan_su_dung, roundKey)];
    if (!items[itemIndex]) return line;
    items[itemIndex] = { ...items[itemIndex], kl_thuc_te: parsed };
    const lan_su_dung = { ...line.lan_su_dung, [roundKey]: items };
    const hasActual = hasMixingActualWeights(lan_su_dung);
    return {
      ...line,
      lan_su_dung,
      tong_nhua_tron: hasActual ? sumMixingRoundsActual(lan_su_dung) : sumMixingRounds(lan_su_dung)
    };
  });
}

function normalizeMaterialKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function materialItemKey(item: MixingRoundItem) {
  const code = item.ma_nvl.trim();
  return code ? normalizeMaterialKey(code) : normalizeMaterialKey(item.ten_vat_tu);
}

function deriveLineMaterial(phoiTron: MixingPhoiTron) {
  for (const key of MIXING_ROUND_KEYS) {
    for (const item of getRoundItems(phoiTron, key)) {
      if (item.ma_nvl.trim() || item.ten_vat_tu.trim()) {
        return { ma_nvl: item.ma_nvl, ten_vat_tu: item.ten_vat_tu };
      }
    }
  }
  return { ma_nvl: '', ten_vat_tu: '' };
}

export function deriveLineUnit(phoiTron: MixingPhoiTron) {
  for (const key of MIXING_ROUND_KEYS) {
    for (const item of getRoundItems(phoiTron, key)) {
      if (item.don_vi.trim()) return item.don_vi.trim();
    }
  }
  return 'kg';
}

export function mixingRoundColumnLabel(roundIndex: number) {
  return `Lần ${roundIndex + 1} (kg)`;
}

export function mixingSessionLabel(sessionNumber: number) {
  return `Lần ${sessionNumber}`;
}

export function mixingSessionColumnLabel(sessionStart: number, roundIndex: number) {
  return mixingSessionLabel(sessionStart + roundIndex);
}

export const MAX_MIXING_SESSIONS_PER_SHIFT = MIXING_MAX_ROUNDS;

export function getMixingReportSessionEnd(report: Pick<MixingReport, 'lan_thu' | 'so_lan'>) {
  const start = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
  const count = Math.max(report.so_lan || 1, 1);
  return start + count - 1;
}

export function formatMixingReportSessionLabel(report: Pick<MixingReport, 'lan_thu' | 'so_lan'>) {
  const start = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
  const end = getMixingReportSessionEnd({ ...report, lan_thu: start });
  return start === end ? mixingSessionLabel(start) : `${mixingSessionLabel(start)}–${end}`;
}

export function computeNextMixingSessionStart(
  reports: Array<Pick<MixingReport, 'id' | 'lan_thu' | 'so_lan' | 'created_at'>>
) {
  if (reports.length === 0) return 1;

  const ordered = [...reports].sort((left, right) => {
    const byCreated = String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''));
    if (byCreated !== 0) return byCreated;
    return (left.lan_thu ?? 1) - (right.lan_thu ?? 1);
  });

  let nextStart = 1;
  ordered.forEach(report => {
    const start = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : nextStart;
    const end = getMixingReportSessionEnd({ ...report, lan_thu: start });
    nextStart = Math.max(nextStart, end + 1);
  });

  return Math.min(MAX_MIXING_SESSIONS_PER_SHIFT, nextStart);
}

export function extractMixingReportLanThu(record: Record<string, unknown>, chiTietRaw: unknown) {
  const fromColumn = Number(record.lan_thu);
  if (Number.isFinite(fromColumn) && fromColumn > 0) return fromColumn;

  if (Array.isArray(chiTietRaw)) {
    for (const line of chiTietRaw) {
      if (!line || typeof line !== 'object') continue;
      const embedded = Number((line as Record<string, unknown>)._lan_thu);
      if (Number.isFinite(embedded) && embedded > 0) return embedded;
    }
  }

  return 1;
}

export function mixingRoundQuantityColumnLabel(roundIndex: number, roundCount: number) {
  if (roundCount <= 1) return 'KL (kg)';
  return `${roundIndex + 1} (kg)`;
}

export function splitMixingLineByMaterial(line: MixingReportLine): MixingReportLine[] {
  const keys = new Set<string>();
  MIXING_ROUND_KEYS.forEach(key => {
    getRoundItems(line.lan_su_dung, key).forEach(item => {
      if (item.ma_nvl.trim() || item.ten_vat_tu.trim()) keys.add(materialItemKey(item));
    });
  });

  if (keys.size <= 1) {
    const { ma_nvl, ten_vat_tu } = deriveLineMaterial(line.lan_su_dung);
    return [
      {
        ...line,
        ma_nvl,
        ten_vat_tu,
        tong_nhua_tron: sumMixingRounds(line.lan_su_dung)
      }
    ];
  }

  return Array.from(keys).map(key => {
    const lan_su_dung: MixingPhoiTron = {};
    MIXING_ROUND_KEYS.forEach(roundKey => {
      const items = getRoundItems(line.lan_su_dung, roundKey).filter(
        item => (item.ma_nvl.trim() || item.ten_vat_tu.trim()) && materialItemKey(item) === key
      );
      if (items.length > 0) lan_su_dung[roundKey] = items;
    });
    const { ma_nvl, ten_vat_tu } = deriveLineMaterial(lan_su_dung);
    return {
      ...line,
      ma_nvl,
      ten_vat_tu,
      lan_su_dung,
      tong_nhua_tron: sumMixingRounds(lan_su_dung),
      hinh_anh: '',
      hinh_anh_public_id: ''
    };
  });
}

export function normalizeChiTietLines(lines: MixingReportLine[]): MixingReportLine[] {
  return lines
    .flatMap(splitMixingLineByMaterial)
    .map((line, index) => ({ ...line, stt: index + 1 }));
}

/** Chuẩn hóa chi_tiet trước khi gửi API — luôn ghi rõ kl_thuc_te trên từng NVL và từng dòng */
export function prepareMixingChiTietForSave(lines: MixingReportLine[]) {
  return normalizeChiTietLines(lines).map(line => {
    const lan_su_dung: MixingPhoiTron = {};
    MIXING_ROUND_KEYS.forEach(key => {
      const items = getRoundItems(line.lan_su_dung, key).map(item => ({
        ma_nvl: item.ma_nvl,
        ten_vat_tu: item.ten_vat_tu,
        don_vi: item.don_vi || 'kg',
        so_luong: item.so_luong,
        ti_le_phan_tram: item.ti_le_phan_tram,
        kl_thuc_te: item.kl_thuc_te ?? null
      }));
      if (items.length > 0) lan_su_dung[key] = items;
    });
    if (line.lan_su_dung.khoi_luong_me) {
      lan_su_dung.khoi_luong_me = line.lan_su_dung.khoi_luong_me;
    }
    const normalizedLine: MixingReportLine = { ...line, lan_su_dung };
    const kl_thuc_te = resolveLineKlThucTe(normalizedLine);
    return {
      stt: normalizedLine.stt,
      ma_nvl: normalizedLine.ma_nvl,
      ten_vat_tu: normalizedLine.ten_vat_tu,
      lan_su_dung,
      tong_nhua_tron: normalizedLine.tong_nhua_tron ?? sumMixingRounds(lan_su_dung),
      kl_thuc_te,
      hinh_anh: normalizedLine.hinh_anh ?? null,
      hinh_anh_public_id: normalizedLine.hinh_anh_public_id ?? null
    };
  });
}

export function normalizeMixingReportLine(line: Record<string, unknown>, index: number): MixingReportLine {
  let lan_su_dung = normalizePhoiTron(line.lan_su_dung);
  const derived = deriveLineMaterial(lan_su_dung);
  const ma_nvl = String(line.ma_npl ?? line.ma_nvl ?? derived.ma_nvl).trim();
  const ten_vat_tu = String(line.ten_vat_tu ?? line.ten_npl ?? derived.ten_vat_tu).trim();
  lan_su_dung = backfillLegacyLinePhoiTron(line, lan_su_dung, ma_nvl, ten_vat_tu);
  const lineKl = parseStoredKlThucTe(line.kl_thuc_te ?? line.so_luong_thuc_te);
  if (lineKl !== null) {
    lan_su_dung = backfillItemKlFromLineRecord(lan_su_dung, ma_nvl, ten_vat_tu, lineKl);
  }
  const tongFromRounds = sumMixingRounds(lan_su_dung);
  const tong_nhua_tron = parseStoredNumber(line.tong_nhua_tron) ?? (tongFromRounds > 0 ? tongFromRounds : null);
  const kl_thuc_te = resolveLineKlThucTe({ lan_su_dung, kl_thuc_te: lineKl });

  return {
    stt: Number(line.stt ?? index + 1) || index + 1,
    ma_nvl,
    ten_vat_tu,
    lan_su_dung,
    tong_nhua_tron,
    kl_thuc_te,
    hinh_anh: String(line.hinh_anh ?? '').trim(),
    hinh_anh_public_id: String(line.hinh_anh_public_id ?? '').trim()
  };
}

export function normalizeMixingRoundPhotos(source: unknown): Partial<Record<MixingRoundKey, MixingRoundPhoto[]>> {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<MixingRoundKey, MixingRoundPhoto[]>> = {};

  MIXING_ROUND_KEYS.forEach(key => {
    const raw = record[key];
    if (!Array.isArray(raw)) return;
    const photos = raw
      .map((item): MixingRoundPhoto | null => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const url = String(row.url ?? row.hinh_anh ?? row.imageUrl ?? '').trim();
        if (!url) return null;
        const public_id = String(row.public_id ?? row.hinh_anh_public_id ?? row.imagePublicId ?? '').trim();
        return { url, ...(public_id ? { public_id } : {}) };
      })
      .filter((item): item is MixingRoundPhoto => Boolean(item));
    if (photos.length > 0) result[key] = photos;
  });

  return result;
}

export function formatMixingReasonsExplanation(reasons: string[]) {
  return reasons.map(item => item.trim()).filter(Boolean).join('; ');
}

function normalizeReasonList(source: unknown): string[] {
  if (!Array.isArray(source)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  source.forEach(item => {
    const value = String(item ?? '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  });
  return result;
}

export function normalizeMixingRoundReasons(source: unknown): Partial<Record<MixingRoundKey, string[]>> {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<MixingRoundKey, string[]>> = {};
  MIXING_ROUND_KEYS.forEach(key => {
    const reasons = normalizeReasonList(record[key]);
    if (reasons.length > 0) result[key] = reasons;
  });
  return result;
}

export function normalizeMixingRoundExplanations(
  source: unknown
): Partial<Record<MixingRoundKey, string>> {
  let value = source;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<MixingRoundKey, string>> = {};
  MIXING_ROUND_KEYS.forEach(key => {
    const text = String(record[key] ?? '').trim();
    if (text) result[key] = text;
  });
  return result;
}

function extractEmbeddedMixingRoundReasons(chiTietRaw: unknown): Partial<Record<MixingRoundKey, string[]>> {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._ly_do_theo_lan;
    const reasons = normalizeMixingRoundReasons(embedded);
    if (MIXING_ROUND_KEYS.some(key => (reasons[key]?.length ?? 0) > 0)) return reasons;
  }
  return {};
}

function extractEmbeddedMixingRoundExplanations(
  chiTietRaw: unknown
): Partial<Record<MixingRoundKey, string>> {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._giai_trinh_theo_lan;
    const explanations = normalizeMixingRoundExplanations(embedded);
    if (MIXING_ROUND_KEYS.some(key => Boolean(explanations[key]?.trim()))) return explanations;
  }
  return {};
}

export function resolveMixingReportRoundReasons(
  report: Pick<MixingReport, 'ly_do_theo_lan' | 'chi_tiet'> & {
    embeddedReasons?: Partial<Record<MixingRoundKey, string[]>>;
  }
): Partial<Record<MixingRoundKey, string[]>> {
  const fromColumn = normalizeMixingRoundReasons(report.ly_do_theo_lan);
  if (MIXING_ROUND_KEYS.some(key => (fromColumn[key]?.length ?? 0) > 0)) return fromColumn;

  const fromEmbedded = normalizeMixingRoundReasons(report.embeddedReasons);
  if (MIXING_ROUND_KEYS.some(key => (fromEmbedded[key]?.length ?? 0) > 0)) return fromEmbedded;

  return extractEmbeddedMixingRoundReasons(report.chi_tiet);
}

export function resolveMixingReportRoundExplanations(
  report: Pick<MixingReport, 'giai_trinh_theo_lan' | 'chi_tiet' | 'ly_do_theo_lan'> & {
    embeddedExplanations?: Partial<Record<MixingRoundKey, string>>;
  }
): Partial<Record<MixingRoundKey, string>> {
  const fromColumn = normalizeMixingRoundExplanations(report.giai_trinh_theo_lan);
  if (MIXING_ROUND_KEYS.some(key => Boolean(fromColumn[key]?.trim()))) return fromColumn;

  const fromEmbedded = normalizeMixingRoundExplanations(report.embeddedExplanations);
  if (MIXING_ROUND_KEYS.some(key => Boolean(fromEmbedded[key]?.trim()))) return fromEmbedded;

  const fromEmbeddedChiTiet = extractEmbeddedMixingRoundExplanations(report.chi_tiet);
  if (MIXING_ROUND_KEYS.some(key => Boolean(fromEmbeddedChiTiet[key]?.trim()))) {
    return fromEmbeddedChiTiet;
  }

  const reasons = resolveMixingReportRoundReasons(report);
  const derived: Partial<Record<MixingRoundKey, string>> = {};
  MIXING_ROUND_KEYS.forEach(key => {
    const list = reasons[key];
    if (list && list.length > 0) derived[key] = formatMixingReasonsExplanation(list);
  });
  return derived;
}

function dedupeMixingRoundPhotos(photos: MixingRoundPhoto[]) {
  const seen = new Set<string>();
  return photos.filter(photo => {
    if (!photo.url || seen.has(photo.url)) return false;
    seen.add(photo.url);
    return true;
  });
}

function extractEmbeddedMixingRoundPhotos(chiTietRaw: unknown): Partial<Record<MixingRoundKey, MixingRoundPhoto[]>> {
  if (!Array.isArray(chiTietRaw)) return {};
  for (const line of chiTietRaw) {
    if (!line || typeof line !== 'object') continue;
    const embedded = (line as Record<string, unknown>)._hinh_anh_theo_lan;
    const photos = normalizeMixingRoundPhotos(embedded);
    if (MIXING_ROUND_KEYS.some(key => (photos[key]?.length ?? 0) > 0)) return photos;
  }
  return {};
}

export function resolveMixingReportRoundPhotos(
  report: Pick<MixingReport, 'hinh_anh_theo_lan' | 'chi_tiet'> & {
    embeddedPhotos?: Partial<Record<MixingRoundKey, MixingRoundPhoto[]>>;
  }
): Partial<Record<MixingRoundKey, MixingRoundPhoto[]>> {
  const fromRounds = normalizeMixingRoundPhotos(report.hinh_anh_theo_lan);
  if (MIXING_ROUND_KEYS.some(key => (fromRounds[key]?.length ?? 0) > 0)) {
    return fromRounds;
  }

  const fromEmbedded = normalizeMixingRoundPhotos(report.embeddedPhotos);
  if (MIXING_ROUND_KEYS.some(key => (fromEmbedded[key]?.length ?? 0) > 0)) {
    return fromEmbedded;
  }

  const legacy: Partial<Record<MixingRoundKey, MixingRoundPhoto[]>> = {};
  report.chi_tiet.forEach(line => {
    const url = String(line.hinh_anh ?? '').trim();
    if (!url) return;
    const photo: MixingRoundPhoto = {
      url,
      ...(line.hinh_anh_public_id ? { public_id: line.hinh_anh_public_id } : {})
    };
    legacy.lan_1 = dedupeMixingRoundPhotos([...(legacy.lan_1 ?? []), photo]);
  });

  return Object.keys(legacy).length > 0 ? legacy : fromRounds;
}

export function normalizeMixingReport(record: Record<string, unknown>): MixingReport {
  const chiTietRaw = record.chi_tiet;
  const embeddedPhotos = extractEmbeddedMixingRoundPhotos(chiTietRaw);
  const lan_thu = extractMixingReportLanThu(record, chiTietRaw);
  const chi_tiet = normalizeChiTietLines(
    Array.isArray(chiTietRaw)
      ? chiTietRaw.map((line, index) => normalizeMixingReportLine(line as Record<string, unknown>, index))
      : []
  );
  const so_lan_from_lines = chi_tiet.reduce(
    (max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)),
    1
  );

  return {
    id: String(record.id ?? ''),
    ca: (() => {
      const raw = String(record.ca ?? '').trim();
      return !raw || raw === '-' || raw === '—' ? '' : raw;
    })(),
    ngay: String(record.ngay ?? '').slice(0, 10),
    gio: String(record.gio ?? '').slice(0, 5),
    chi_nhanh: String(record.chi_nhanh ?? ''),
    ma_may: String(record.ma_may ?? ''),
    ten_may: String(record.ten_may ?? ''),
    nhan_su: String(record.nhan_su ?? ''),
    so_phieu: String(record.so_phieu ?? ''),
    ky_hieu: String(record.ky_hieu ?? 'QT-16-BM02'),
    lan_thu,
    so_lan: Math.max(Number(record.so_lan) || 0, so_lan_from_lines, 1),
    thuc_te_su_dung:
      record.thuc_te_su_dung === null || record.thuc_te_su_dung === undefined
        ? null
        : Number(record.thuc_te_su_dung),
    ghi_chu: String(record.ghi_chu ?? ''),
    hinh_anh_theo_lan: resolveMixingReportRoundPhotos({
      hinh_anh_theo_lan: normalizeMixingRoundPhotos(record.hinh_anh_theo_lan),
      chi_tiet,
      embeddedPhotos
    }),
    ly_do_theo_lan: resolveMixingReportRoundReasons({
      ly_do_theo_lan: normalizeMixingRoundReasons(record.ly_do_theo_lan),
      chi_tiet,
      embeddedReasons: extractEmbeddedMixingRoundReasons(chiTietRaw)
    }),
    giai_trinh_theo_lan: resolveMixingReportRoundExplanations({
      ly_do_theo_lan: normalizeMixingRoundReasons(record.ly_do_theo_lan),
      giai_trinh_theo_lan: normalizeMixingRoundExplanations(record.giai_trinh_theo_lan),
      chi_tiet,
      embeddedExplanations: extractEmbeddedMixingRoundExplanations(chiTietRaw)
    }),
    chi_tiet,
    created_at: String(record.created_at ?? '')
  };
}

export function formatOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return formatNumber(value, 2);
}

export function formatNormWeight(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return formatNumber(roundNormWeight(value), NORM_WEIGHT_DECIMALS);
}

export type MixingReportLineRow = {
  reportId: string;
  ngay: string;
  ca: string;
  gio: string;
  ma_may: string;
  ten_may: string;
  nhan_su: string;
  line: MixingReportLine;
};

export function flattenMixingReportLines(reports: MixingReport[]): MixingReportLineRow[] {
  return reports.flatMap(report =>
    report.chi_tiet.map(line => ({
      reportId: report.id,
      ngay: report.ngay,
      ca: report.ca,
      gio: report.gio,
      ma_may: report.ma_may,
      ten_may: report.ten_may,
      nhan_su: report.nhan_su,
      line
    }))
  );
}

function mixingReportMachineKey(report: Pick<MixingReport, 'ma_may' | 'ten_may'>) {
  return (report.ma_may || report.ten_may || '').trim().toLowerCase();
}

function compareMixingReportsForPrint(left: MixingReport, right: MixingReport) {
  const byDate = String(left.ngay || '').localeCompare(String(right.ngay || ''));
  if (byDate !== 0) return byDate;
  const byShift = String(left.ca || '').localeCompare(String(right.ca || ''), 'vi');
  if (byShift !== 0) return byShift;
  const byMachine = mixingReportMachineKey(left).localeCompare(mixingReportMachineKey(right), 'vi');
  if (byMachine !== 0) return byMachine;
  return compareMixingReportsBySession(left, right);
}

export function getMixingReportSessionStart(report: Pick<MixingReport, 'lan_thu'>) {
  return report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
}

/** Sắp xếp phiếu theo lần trộn (tăng dần), rồi giờ và máy. */
export function compareMixingReportsBySession(left: MixingReport, right: MixingReport) {
  const bySession = getMixingReportSessionStart(left) - getMixingReportSessionStart(right);
  if (bySession !== 0) return bySession;
  const byTime = String(left.gio || '').localeCompare(String(right.gio || ''));
  if (byTime !== 0) return byTime;
  const byMachine = mixingReportMachineKey(left).localeCompare(mixingReportMachineKey(right), 'vi');
  if (byMachine !== 0) return byMachine;
  return String(left.created_at ?? '').localeCompare(String(right.created_at ?? ''));
}

export function splitMixingStaffNames(value: string): string[] {
  return String(value || '')
    .split(/[,;+]/)
    .map(name => name.trim())
    .filter(name => name && name !== '-');
}

/** Gom phiếu theo ngày + ca + máy để in một NHẬT KÝ cho mỗi nhóm bộ lọc. */
export function groupMixingReportsForPrint(reports: MixingReport[]): MixingReport[][] {
  const grouped = new Map<string, MixingReport[]>();

  for (const report of reports) {
    const key = `${report.ngay || ''}|${report.ca || ''}|${mixingReportMachineKey(report)}`;
    const list = grouped.get(key) ?? [];
    list.push(report);
    grouped.set(key, list);
  }

  return [...grouped.values()]
    .map(group => [...group].sort(compareMixingReportsBySession))
    .sort((left, right) => compareMixingReportsForPrint(left[0], right[0]));
}

export type MixingReportPrintContext = {
  ngay: string;
  ca: string;
  maMay: string;
  tenMay: string;
  nhanSu: string;
};

export function buildMixingReportPrintContext(reports: MixingReport[]): MixingReportPrintContext {
  const first = reports[0];
  const staffNames = [
    ...new Set(reports.flatMap(report => splitMixingStaffNames(report.nhan_su)))
  ].sort((a, b) => a.localeCompare(b, 'vi'));

  return {
    ngay: first?.ngay || '',
    ca: first?.ca || '',
    maMay: first?.ma_may || '',
    tenMay: first?.ten_may || '',
    nhanSu: staffNames.join(', ')
  };
}

export function maxRoundCountFromReports(reports: MixingReport[]) {
  return reports.reduce((max, report) => {
    const reportMax = report.chi_tiet.reduce(
      (inner, line) => Math.max(inner, visibleRoundCount(line.lan_su_dung)),
      1
    );
    return Math.max(max, report.so_lan || 0, reportMax);
  }, 1);
}

export function sanitizeDecimalTyping(value: string): string {
  let result = '';
  let hasSeparator = false;
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if ((ch === '.' || ch === ',') && !hasSeparator) {
      result += ch;
      hasSeparator = true;
    }
  }
  return result;
}

/** Nhập khối lượng (kg): 12.5, 12,5, 1.250,5 */
export function parseDecimalWeightInput(value: string): number | null {
  if (!value || !String(value).trim()) return null;
  const trimmed = String(value).trim().replace(/\s/g, '');
  if (!trimmed || trimmed === '.' || trimmed === ',') return null;

  let normalized: string;
  if (trimmed.includes(',')) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    const lastPart = parts[parts.length - 1] ?? '';
    if (parts.length === 2 && lastPart.length <= 2) {
      normalized = trimmed;
    } else {
      normalized = trimmed.replace(/\./g, '');
    }
  } else {
    normalized = trimmed;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? roundNormWeight(num) : null;
}

export function parseBatchWeightInput(value: string) {
  return parseDecimalWeightInput(value);
}

/** KL định mức 1 dòng = % × KL mẻ (làm tròn từng dòng). */
export function calcNormQuantityFromPercent(batchWeight: number | null, percent: number | null) {
  if (!batchWeight || batchWeight <= 0 || !percent || percent <= 0) return null;
  return roundNormWeight((batchWeight * percent) / 100);
}

function applyPercentToRoundItem(item: MixingRoundItem, batchWeight: number | null): MixingRoundItem {
  const kg = calcNormQuantityFromPercent(batchWeight, item.ti_le_phan_tram);
  return kg !== null ? { ...item, so_luong: kg } : item;
}

export function recalcRoundItems(phoiTron: MixingPhoiTron, key: MixingRoundKey): MixingPhoiTron {
  const batchWeight = phoiTron.khoi_luong_me?.[key] ?? null;
  if (!batchWeight || batchWeight <= 0) return phoiTron;

  return {
    ...phoiTron,
    [key]: getRoundItems(phoiTron, key).map(item => applyPercentToRoundItem(item, batchWeight))
  };
}

export function getRoundBatchWeightFromLines(chi_tiet: MixingReportLine[], roundKey: MixingRoundKey) {
  for (const line of chi_tiet) {
    const weight = line.lan_su_dung.khoi_luong_me?.[roundKey];
    if (weight !== null && weight !== undefined && weight > 0) return weight;
  }
  return null;
}

export function setRoundBatchWeightOnLines(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey,
  value: string
): MixingReportLine[] {
  const parsed = parseBatchWeightInput(value);
  if (chi_tiet.length === 0) return chi_tiet;

  return chi_tiet.map(line => {
    const lan_su_dung: MixingPhoiTron = {
      ...line.lan_su_dung,
      khoi_luong_me: { ...line.lan_su_dung.khoi_luong_me, [roundKey]: parsed }
    };
    const updated = recalcRoundItems(lan_su_dung, roundKey);
    return {
      ...line,
      lan_su_dung: updated,
      tong_nhua_tron: sumMixingRounds(updated)
    };
  });
}

export type MixingRoundMaterialEntry = {
  lineIndex: number;
  itemIndex: number;
  item: MixingRoundItem;
};

export function listRoundMaterialEntries(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey
): MixingRoundMaterialEntry[] {
  const entries: MixingRoundMaterialEntry[] = [];
  chi_tiet.forEach((line, lineIndex) => {
    getRoundItems(line.lan_su_dung, roundKey).forEach((item, itemIndex) => {
      if (item.ma_nvl.trim() || item.ten_vat_tu.trim()) {
        entries.push({ lineIndex, itemIndex, item });
      }
    });
  });
  return entries;
}

function updateLineRoundItems(
  line: MixingReportLine,
  roundKey: MixingRoundKey,
  items: MixingRoundItem[]
): MixingReportLine {
  const lan_su_dung: MixingPhoiTron = { ...line.lan_su_dung, [roundKey]: items };
  const batchWeight = lan_su_dung.khoi_luong_me?.[roundKey] ?? null;
  const recalculated = batchWeight ? recalcRoundItems(lan_su_dung, roundKey) : lan_su_dung;
  return {
    ...line,
    lan_su_dung: recalculated,
    tong_nhua_tron: sumMixingRounds(recalculated)
  };
}

export function upsertMaterialInRound(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey,
  item: MixingRoundItem,
  edit?: { lineIndex: number; itemIndex: number },
  batchWeightFallback?: number | null
): MixingReportLine[] {
  const batchWeight = getRoundBatchWeightFromLines(chi_tiet, roundKey) ?? batchWeightFallback ?? null;
  const savedItem = item;
  let lines = [...chi_tiet];

  if (edit) {
    const line = lines[edit.lineIndex];
    if (!line) return normalizeChiTietLines(lines);
    const items = [...getRoundItems(line.lan_su_dung, roundKey)];
    items[edit.itemIndex] = savedItem;
    lines[edit.lineIndex] = {
      ...updateLineRoundItems(line, roundKey, items),
      ma_nvl: savedItem.ma_nvl || line.ma_nvl,
      ten_vat_tu: savedItem.ten_vat_tu || line.ten_vat_tu
    };
    return normalizeChiTietLines(lines);
  }

  const codeKey = normalizeMaterialKey(savedItem.ma_nvl || savedItem.ten_vat_tu);
  const existingIndex = lines.findIndex(line => normalizeMaterialKey(line.ma_nvl || line.ten_vat_tu) === codeKey);

  if (existingIndex >= 0) {
    const line = lines[existingIndex];
    const items = [...getRoundItems(line.lan_su_dung, roundKey)];
    const itemKey = normalizeMaterialKey(savedItem.ma_nvl || savedItem.ten_vat_tu);
    const existingItemIndex = items.findIndex(
      item => normalizeMaterialKey(item.ma_nvl || item.ten_vat_tu) === itemKey
    );
    if (existingItemIndex >= 0) {
      items[existingItemIndex] = savedItem;
    } else {
      items.push(savedItem);
    }
    lines[existingIndex] = updateLineRoundItems(line, roundKey, items);
  } else {
    let lan_su_dung: MixingPhoiTron = { lan_1: [], [roundKey]: [savedItem] };
    if (batchWeight) {
      lan_su_dung.khoi_luong_me = { [roundKey]: batchWeight };
      lan_su_dung = recalcRoundItems(lan_su_dung, roundKey);
    }
    lines.push({
      stt: lines.length + 1,
      ma_nvl: savedItem.ma_nvl,
      ten_vat_tu: savedItem.ten_vat_tu,
      lan_su_dung,
      tong_nhua_tron: sumMixingRounds(lan_su_dung),
      hinh_anh: '',
      hinh_anh_public_id: ''
    });
  }

  return normalizeChiTietLines(lines);
}

function clearRoundFromLine(
  line: MixingReportLine,
  roundKey: MixingRoundKey
): MixingReportLine | null {
  const lan_su_dung: MixingPhoiTron = { ...line.lan_su_dung };
  delete lan_su_dung[roundKey];

  if (lan_su_dung.khoi_luong_me) {
    const khoi_luong_me = { ...lan_su_dung.khoi_luong_me };
    delete khoi_luong_me[roundKey];
    if (Object.keys(khoi_luong_me).length === 0) {
      delete lan_su_dung.khoi_luong_me;
    } else {
      lan_su_dung.khoi_luong_me = khoi_luong_me;
    }
  }

  const hasRoundData = MIXING_ROUND_KEYS.some(
    key =>
      lan_su_dung[key] !== undefined ||
      getRoundBatchWeight(lan_su_dung, key) !== null
  );
  if (!hasRoundData) return null;

  return {
    ...line,
    lan_su_dung,
    tong_nhua_tron: sumMixingRounds(lan_su_dung)
  };
}

export function clearRoundFromLines(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey
): MixingReportLine[] {
  const lines = chi_tiet
    .map(line => clearRoundFromLine(line, roundKey))
    .filter((line): line is MixingReportLine => line !== null);
  return normalizeChiTietLines(lines.map((row, index) => ({ ...row, stt: index + 1 })));
}

export function removeMaterialFromRound(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey,
  lineIndex: number,
  itemIndex: number
): MixingReportLine[] {
  const line = chi_tiet[lineIndex];
  if (!line) return chi_tiet;

  const items = getRoundItems(line.lan_su_dung, roundKey).filter((_, index) => index !== itemIndex);
  let lines = [...chi_tiet];
  lines[lineIndex] = updateLineRoundItems(line, roundKey, items);

  const hasAnyRoundData = MIXING_ROUND_KEYS.some(key =>
    getRoundItems(lines[lineIndex].lan_su_dung, key).some(isMeaningfulRoundItem)
  );
  if (!hasAnyRoundData) {
    lines = lines.filter((_, index) => index !== lineIndex);
  }

  return normalizeChiTietLines(lines.map((row, index) => ({ ...row, stt: index + 1 })));
}

export function applyMixingRoundAutofill(
  chi_tiet: MixingReportLine[],
  roundKey: MixingRoundKey,
  items: MixingRoundItem[],
  batchWeightFallback?: number | null
): MixingReportLine[] {
  return items.reduce(
    (lines, item) => upsertMaterialInRound(lines, roundKey, item, undefined, batchWeightFallback),
    [...chi_tiet]
  );
}
