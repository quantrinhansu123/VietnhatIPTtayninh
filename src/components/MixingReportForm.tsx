import React, { useEffect, useMemo, useRef, useState } from 'react';
import { openCameraImagePicker, compressImageDataUrl } from '../utils/cameraCapture';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardList,
  Clock3,
  Cpu,
  ImagePlus,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { COMPANY_BRANCH_NAME } from './layout/constants';
import { formatNumber, parseMoneyInput } from '../utils';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import SearchableMultiSelect from './SearchableMultiSelect';
import { RowActionsMenu } from './shared/table';
import {
  normalizeMixingProductionOrders,
  type MixingProductionOrder
} from '../utils/mixingOrderAutofill';
import {
  calcNormQuantityFromPercent,
  computeNextMixingSessionStart,
  deriveLineUnit,
  formatNormWeight,
  formatMixingReasonsExplanation,
  getRoundBatchWeightFromLines,
  listRoundMaterialEntries,
  MAX_MIXING_SESSIONS_PER_SHIFT,
  mixingSessionColumnLabel,
  mixingSessionLabel,
  normalizeChiTietLines,
  normalizeMixingReport,
  prepareMixingChiTietForSave,
  parseBatchWeightInput,
  parseDecimalWeightInput,
  recalcRoundItems,
  sanitizeDecimalTyping,
  clearRoundFromLines,
  removeMaterialFromRound,
  setRoundBatchWeightOnLines,
  sumMixingRounds,
  sumMixingRoundsActual,
  sumRoundQuantity,
  hasMixingActualWeights,
  updateMaterialActualWeightInRound,
  upsertMaterialInRound
} from '../lib/mixingReportModel';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  resolveShiftName,
  type ShiftSetting
} from '../utils/shiftSettings';
import {
  filterMixingNormSuggestionsByDateShift,
  mixingNormToRoundItems,
  normalizeMixingNormSuggestions,
  type MixingNormSuggestion
} from '../utils/mixingNormSuggestion';

const MIXING_MAX_ROUNDS = 20;

function normalizeMixingCaInput(value: unknown) {
  const ca = String(value ?? '').trim();
  if (!ca || ca === '-' || ca === '—') return '';
  return ca;
}
type RoundKey = `lan_${number}`;
const ROUND_KEYS: readonly RoundKey[] = Array.from(
  { length: MIXING_MAX_ROUNDS },
  (_, index) => `lan_${index + 1}` as RoundKey
);

export type MixingRoundItem = {
  ma_nvl: string;
  ten_vat_tu: string;
  don_vi: string;
  so_luong: number | null;
  kl_thuc_te: number | null;
  ti_le_phan_tram: number | null;
};

export type MixingRoundPhoto = {
  url: string;
  public_id?: string;
};

export type MixingPhoiTron = {
  so_lan?: number;
  khoi_luong_me?: Partial<Record<RoundKey, number | null>>;
} & {
  [K in RoundKey]?: MixingRoundItem[];
};

export type MixingReportLine = {
  stt: number;
  ma_nvl: string;
  ten_vat_tu: string;
  don_vi?: string;
  lan_su_dung: MixingPhoiTron;
  tong_nhua_tron: number | null;
  /** KL thực tế tổng theo dòng — lưu kèm để xem/lịch sử khi cần */
  kl_thuc_te?: number | null;
  hinh_anh?: string;
  hinh_anh_public_id?: string;
};

export type MixingReport = {
  id: string;
  ca: string;
  ngay: string;
  gio: string;
  chi_nhanh: string;
  ma_may: string;
  ten_may: string;
  nhan_su: string;
  so_phieu: string;
  ky_hieu: string;
  lan_thu?: number;
  so_lan: number;
  thuc_te_su_dung: number | null;
  ghi_chu: string;
  hinh_anh_theo_lan?: Partial<Record<RoundKey, MixingRoundPhoto[]>>;
  ly_do_theo_lan?: Partial<Record<RoundKey, string[]>>;
  giai_trinh_theo_lan?: Partial<Record<RoundKey, string>>;
  chi_tiet: MixingReportLine[];
  created_at?: string;
};

interface MachineOption {
  id: string;
  code: string;
  name: string;
  branch: string;
}

interface MaterialOption {
  code: string;
  name: string;
  unit: string;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function extractIsoDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-') return '';
  const match = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function shiftMatches(orderShift: string, selectedShift: string) {
  if (!orderShift || !selectedShift) return false;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
}

function machineMatches(
  orderMachine: string,
  machineCode: string,
  machineName: string,
  machines: MachineOption[]
) {
  const ref = orderMachine.trim();
  if (!ref || ref === '-') return false;

  const candidates = new Set<string>();
  if (machineCode) candidates.add(normalizeKey(machineCode));
  if (machineName) candidates.add(normalizeKey(machineName));
  if (machineCode && machineName) candidates.add(normalizeKey(`${machineCode} · ${machineName}`));

  machines.forEach(machine => {
    candidates.add(normalizeKey(machine.code));
    candidates.add(normalizeKey(machine.name));
  });

  const refKey = normalizeKey(ref);
  return [...candidates].some(key => key && (key === refKey || key.includes(refKey) || refKey.includes(key)));
}

function resolveStaffFromProductionOrders(
  orders: MixingProductionOrder[],
  ngay: string,
  ca: string,
  maMay: string,
  tenMay: string,
  machines: MachineOption[]
) {
  const matched = orders.filter(order => {
    const orderDate = extractIsoDate(order.startDate);
    if (ngay && orderDate && orderDate !== ngay) return false;
    if (ca && !shiftMatches(order.shift, ca)) return false;
    return machineMatches(order.machine, maMay, tenMay, machines);
  });

  const staffValues = matched
    .map(order => order.staff)
    .filter(staff => staff && staff !== '-');

  return [...new Set(staffValues)].join(', ');
}

const inputClass =
  'h-9 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function parseOptionalNumber(value: string) {
  if (!value || !String(value).trim()) return null;
  const num = parseMoneyInput(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function quantityInputText(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return String(value).replace('.', ',');
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return formatNumber(value, 2);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function emptyRoundItem(): MixingRoundItem {
  return { ma_nvl: '', ten_vat_tu: '', don_vi: 'kg', so_luong: null, kl_thuc_te: null, ti_le_phan_tram: null };
}

function normalizeRoundItems(value: unknown): MixingRoundItem[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'number') {
    return [{ ma_nvl: '', ten_vat_tu: '', don_vi: 'kg', so_luong: value, kl_thuc_te: null, ti_le_phan_tram: null }];
  }
  if (!Array.isArray(value)) {
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return [parseRoundItemRecord(record)];
    }
    return [];
  }
  return value
    .map((item): MixingRoundItem | null => {
      if (!item || typeof item !== 'object') return null;
      return parseRoundItemRecord(item as Record<string, unknown>);
    })
    .filter((item): item is MixingRoundItem => Boolean(item));
}

function parseRoundItemRecord(record: Record<string, unknown>): MixingRoundItem {
  return {
    ma_nvl: String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim(),
    ten_vat_tu: String(record.ten_vat_tu ?? record.ten_npl ?? '').trim(),
    don_vi: String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg',
    so_luong: parseOptionalNumber(String(record.so_luong ?? record.so_luong_kg ?? '')),
    kl_thuc_te: parseDecimalWeightInput(String(record.kl_thuc_te ?? record.so_luong_thuc_te ?? '')),
    ti_le_phan_tram: parseOptionalNumber(String(record.ti_le_phan_tram ?? record.phan_tram ?? ''))
  };
}

function deriveLineMaterial(phoiTron: MixingPhoiTron) {
  for (const key of ROUND_KEYS) {
    for (const item of getRoundItems(phoiTron, key)) {
      if (item.ma_nvl.trim() || item.ten_vat_tu.trim()) {
        return { ma_nvl: item.ma_nvl, ten_vat_tu: item.ten_vat_tu };
      }
    }
  }
  return { ma_nvl: '', ten_vat_tu: '' };
}

function hasPhoiTronMaterial(phoiTron: MixingPhoiTron) {
  return ROUND_KEYS.some(key =>
    getRoundItems(phoiTron, key).some(item => item.ma_nvl.trim() || item.ten_vat_tu.trim())
  );
}

function getRoundBatchWeight(phoiTron: MixingPhoiTron, key: RoundKey) {
  const value = phoiTron.khoi_luong_me?.[key];
  return value === null || value === undefined ? null : value;
}

function setRoundBatchWeight(phoiTron: MixingPhoiTron, key: RoundKey, value: string): MixingPhoiTron {
  const parsed = parseOptionalNumber(value);
  const next: MixingPhoiTron = {
    ...phoiTron,
    khoi_luong_me: { ...phoiTron.khoi_luong_me, [key]: parsed }
  };
  return recalcRoundItems(next, key);
}

function normalizePhoiTron(source: unknown): MixingPhoiTron {
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const phoiTron: MixingPhoiTron = {};
  ROUND_KEYS.forEach(key => {
    const items = normalizeRoundItems(record[key]);
    if (items.length > 0) phoiTron[key] = items;
  });
  const rawBatch = record.khoi_luong_me;
  if (rawBatch && typeof rawBatch === 'object') {
    const khoi_luong_me: Partial<Record<RoundKey, number | null>> = {};
    ROUND_KEYS.forEach(key => {
      const val = parseOptionalNumber(String((rawBatch as Record<string, unknown>)[key] ?? ''));
      if (val !== null && val > 0) khoi_luong_me[key] = val;
    });
    if (Object.keys(khoi_luong_me).length > 0) phoiTron.khoi_luong_me = khoi_luong_me;
  }
  if (!phoiTron.lan_1) phoiTron.lan_1 = [];
  return phoiTron;
}

function buildEmptyPhoiTron(): MixingPhoiTron {
  return { lan_1: [] };
}

function visibleRoundCount(phoiTron: MixingPhoiTron) {
  for (let index = ROUND_KEYS.length - 1; index >= 0; index -= 1) {
    if (phoiTron[ROUND_KEYS[index]] !== undefined) return index + 1;
  }
  return 1;
}

function addNextRound(phoiTron: MixingPhoiTron): MixingPhoiTron | null {
  const current = visibleRoundCount(phoiTron);
  if (current >= MIXING_MAX_ROUNDS) return null;
  const nextKey = ROUND_KEYS[current];
  return { ...phoiTron, [nextKey]: [] };
}

function getRoundItems(phoiTron: MixingPhoiTron, key: RoundKey): MixingRoundItem[] {
  return phoiTron[key] ?? [];
}

function emptyLine(stt: number): MixingReportLine {
  return {
    stt,
    ma_nvl: '',
    ten_vat_tu: '',
    lan_su_dung: buildEmptyPhoiTron(),
    tong_nhua_tron: null,
    hinh_anh: '',
    hinh_anh_public_id: ''
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
}

async function uploadMixingLineImage(imageDataUrl: string) {
  const res = await fetch('/api/cloudinary/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl, folder: 'bao_cao_phoi_tron' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không thể upload ảnh lên Cloudinary.');
  return { imageUrl: data.url as string, imagePublicId: data.publicId as string };
}

function isDataUrlPhoto(url: string) {
  return String(url || '').trim().toLowerCase().startsWith('data:');
}

async function resolveMixingPhotosForSave(
  photosByRound: Partial<Record<RoundKey, MixingRoundPhoto[]>>
): Promise<Partial<Record<RoundKey, MixingRoundPhoto[]>>> {
  const result: Partial<Record<RoundKey, MixingRoundPhoto[]>> = {};
  for (const roundKey of ROUND_KEYS) {
    const photos = photosByRound[roundKey] ?? [];
    if (photos.length === 0) continue;
    const resolved: MixingRoundPhoto[] = [];
    for (const photo of photos) {
      const url = String(photo.url || '').trim();
      if (!url) continue;
      if (!isDataUrlPhoto(url)) {
        resolved.push({ url, public_id: photo.public_id });
        continue;
      }
      const uploaded = await uploadMixingLineImage(url);
      if (!uploaded.imageUrl) {
        throw new Error('Upload ảnh không trả về URL. Không thể lưu ảnh dạng tạm trên máy.');
      }
      resolved.push({ url: uploaded.imageUrl, public_id: uploaded.imagePublicId });
    }
    if (resolved.length > 0) result[roundKey] = resolved;
  }
  return result;
}

function parseActualWeightDraftKey(key: string): {
  roundKey: RoundKey;
  lineIndex: number;
  itemIndex: number;
} | null {
  const match = /^((?:lan_\d+))-(\d+)-(\d+)$/.exec(String(key || ''));
  if (!match) return null;
  const roundKey = match[1] as RoundKey;
  if (!ROUND_KEYS.includes(roundKey)) return null;
  return {
    roundKey,
    lineIndex: Number(match[2]),
    itemIndex: Number(match[3])
  };
}

const modalInputClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

function newReportForm(): Omit<MixingReport, 'id' | 'created_at'> {
  return {
    ca: '',
    ngay: todayIso(),
    gio: nowTimeValue(),
    chi_nhanh: COMPANY_BRANCH_NAME,
    ma_may: '',
    ten_may: '',
    nhan_su: '',
    so_phieu: '',
    ky_hieu: 'QT-16-BM02',
    lan_thu: 1,
    so_lan: 1,
    thuc_te_su_dung: null,
    ghi_chu: '',
    hinh_anh_theo_lan: {},
    ly_do_theo_lan: {},
    giai_trinh_theo_lan: {},
    chi_tiet: []
  };
}

function roundColumnLabel(sessionStart: number, roundIndex: number) {
  return mixingSessionColumnLabel(sessionStart, roundIndex);
}

function roundSectionLabel(roundIndex: number, totalRounds: number) {
  if (totalRounds === 1) return 'KL mẻ';
  return `KL mẻ ${roundIndex + 1}`;
}

function MixingRoundItemFormModal({
  open,
  roundLabel,
  draft,
  materials,
  batchWeight,
  isEditing,
  errorMessage,
  onClose,
  onChange,
  onSave
}: {
  open: boolean;
  roundLabel: string;
  draft: MixingRoundItem;
  materials: MaterialOption[];
  batchWeight: number | null;
  isEditing: boolean;
  errorMessage?: string;
  onClose: () => void;
  onChange: (patch: Partial<MixingRoundItem>) => void;
  onSave: (item: MixingRoundItem) => void;
}) {
  const [soLuongText, setSoLuongText] = useState('');
  const [klThucTeText, setKlThucTeText] = useState('');
  const [percentText, setPercentText] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialSuggestionsOpen, setMaterialSuggestionsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setPercentText(quantityInputText(draft.ti_le_phan_tram));
      setSoLuongText(quantityInputText(draft.so_luong));
      setKlThucTeText(quantityInputText(draft.kl_thuc_te));
      setMaterialSearch([draft.ma_nvl, draft.ten_vat_tu].filter(Boolean).join(' · '));
      setMaterialSuggestionsOpen(false);
    }
  }, [open, draft.so_luong, draft.kl_thuc_te, draft.ti_le_phan_tram]);

  useEffect(() => {
    if (!open) return;
    const pct = parseOptionalNumber(percentText);
    const kg = calcNormQuantityFromPercent(batchWeight, pct);
    if (kg !== null) setSoLuongText(String(kg));
  }, [open, percentText, batchWeight]);

  const materialSuggestions = useMemo(() => {
    const keyword = materialSearch.trim().toLocaleLowerCase('vi');
    if (!keyword) return materials.slice(0, 12);
    return materials
      .filter(material =>
        `${material.code} ${material.name}`.toLocaleLowerCase('vi').includes(keyword)
      )
      .slice(0, 12);
  }, [materialSearch, materials]);

  const pickMaterial = (material: MaterialOption) => {
    onChange({
      ma_nvl: material.code,
      ten_vat_tu: material.name,
      don_vi: material.unit || 'kg'
    });
    setMaterialSearch(`${material.code} · ${material.name}`);
    setMaterialSuggestionsOpen(false);
  };

  const handleSave = () => {
    const ti_le_phan_tram = parseOptionalNumber(percentText);
    const autoKg = calcNormQuantityFromPercent(batchWeight, ti_le_phan_tram);
    onSave({
      ...draft,
      ti_le_phan_tram,
      so_luong: autoKg ?? parseOptionalNumber(soLuongText),
      kl_thuc_te: parseDecimalWeightInput(klThucTeText)
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h4 className="text-base font-black text-zinc-950">
              {isEditing ? 'Sửa vật tư' : 'Thêm vật tư'} · {roundLabel}
            </h4>
            <p className="mt-1 text-sm font-medium text-zinc-500">Nhập mã NVL, % và khối lượng 1 mẻ để tự tính KL</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {errorMessage && (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tìm nguyên vật liệu</span>
              <div className="relative">
                <input
                  value={materialSearch}
                  onFocus={() => setMaterialSuggestionsOpen(true)}
                  onChange={event => {
                    setMaterialSearch(event.target.value);
                    setMaterialSuggestionsOpen(true);
                    onChange({ ma_nvl: '', ten_vat_tu: '', don_vi: 'kg' });
                  }}
                  className={modalInputClass}
                  placeholder="Gõ mã hoặc tên NVL..."
                  autoComplete="off"
                />
                {materialSuggestionsOpen ? (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                    {materialSuggestions.length > 0 ? materialSuggestions.map(material => (
                      <button
                        key={`${material.code}-${material.name}`}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => pickMaterial(material)}
                        className="block w-full px-3 py-2 text-left text-sm transition hover:bg-red-50"
                      >
                        <span className="font-mono font-bold text-zinc-800">{material.code}</span>
                        <span className="ml-2 font-medium text-zinc-600">{material.name}</span>
                        <span className="ml-2 text-xs text-zinc-400">{material.unit}</span>
                      </button>
                    )) : (
                      <p className="px-3 py-2 text-sm font-medium text-zinc-500">Không tìm thấy nguyên vật liệu phù hợp.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <p className="text-[11px] font-medium text-zinc-400">Gõ mã hoặc tên, rồi chọn nguyên vật liệu từ danh sách gợi ý.</p>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tên vật tư</span>
              <input
                value={draft.ten_vat_tu}
                readOnly={Boolean(draft.ma_nvl)}
                onChange={e => onChange({ ten_vat_tu: e.target.value })}
                className={`${modalInputClass}${draft.ma_nvl ? ' bg-zinc-50 text-zinc-600' : ''}`}
                placeholder={draft.ma_nvl ? '' : 'Tự điền theo mã NVL'}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">ĐVT</span>
              <input
                value={draft.don_vi}
                onChange={e => onChange({ don_vi: e.target.value })}
                className={modalInputClass}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tỷ lệ %</span>
              <input
                value={percentText}
                onChange={e => setPercentText(e.target.value)}
                className={modalInputClass}
                inputMode="decimal"
                placeholder="VD: 60"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">KL định mức (kg)</span>
              <input
                value={soLuongText}
                readOnly
                className={`${modalInputClass} bg-emerald-50/80 font-black text-emerald-800`}
                inputMode="decimal"
                placeholder={batchWeight ? 'Tự tính theo %' : '-'}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">KL thực tế (kg)</span>
              <input
                value={klThucTeText}
                onChange={e => setKlThucTeText(sanitizeDecimalTyping(e.target.value))}
                className={modalInputClass}
                inputMode="decimal"
                placeholder="VD: 12,5"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c]"
          >
            <Save className="h-4 w-4" />
            {isEditing ? 'Cập nhật' : 'Thêm dòng'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MixingLineFormModal({
  open,
  draft,
  materials,
  isEditing,
  errorMessage,
  onClose,
  onChange,
  onSave
}: {
  open: boolean;
  draft: MixingReportLine;
  materials: MaterialOption[];
  isEditing: boolean;
  errorMessage?: string;
  onClose: () => void;
  onChange: (patch: Partial<MixingReportLine>) => void;
  onSave: (patch?: Partial<MixingReportLine>) => void;
}) {
  const [roundItemModalOpen, setRoundItemModalOpen] = useState(false);
  const [roundItemDraft, setRoundItemDraft] = useState<MixingRoundItem>(emptyRoundItem());
  const [roundItemModalError, setRoundItemModalError] = useState('');
  const [editingRoundKey, setEditingRoundKey] = useState<RoundKey | null>(null);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const tongTron = sumMixingRounds(draft.lan_su_dung);
  const roundCount = visibleRoundCount(draft.lan_su_dung);
  const activeRounds = ROUND_KEYS.slice(0, roundCount);

  const closeRoundItemModal = () => {
    setRoundItemModalOpen(false);
    setEditingRoundKey(null);
    setEditingRowIndex(null);
    setRoundItemModalError('');
  };

  const openAddRoundItem = (roundKey: RoundKey) => {
    setEditingRoundKey(roundKey);
    setEditingRowIndex(null);
    setRoundItemDraft(emptyRoundItem());
    setRoundItemModalError('');
    setRoundItemModalOpen(true);
  };

  const openEditRoundItem = (roundKey: RoundKey, rowIndex: number) => {
    const item = getRoundItems(draft.lan_su_dung, roundKey)[rowIndex];
    if (!item) return;
    setEditingRoundKey(roundKey);
    setEditingRowIndex(rowIndex);
    setRoundItemDraft({ ...item });
    setRoundItemModalError('');
    setRoundItemModalOpen(true);
  };

  const saveRoundItemDraft = (item: MixingRoundItem) => {
    if (!editingRoundKey) return;
    if (!item.ma_nvl.trim() && !item.ten_vat_tu.trim()) {
      setRoundItemModalError('Vui lòng chọn mã NVL.');
      return;
    }

    const batchWeight = getRoundBatchWeight(draft.lan_su_dung, editingRoundKey);
    const items = [...getRoundItems(draft.lan_su_dung, editingRoundKey)];
    if (editingRowIndex === null) {
      items.push({ ...item });
    } else {
      items[editingRowIndex] = { ...item };
    }

    let lan_su_dung: MixingPhoiTron = { ...draft.lan_su_dung, [editingRoundKey]: items };
    if (batchWeight) {
      lan_su_dung = recalcRoundItems(lan_su_dung, editingRoundKey);
    }
    onChange({ lan_su_dung, tong_nhua_tron: sumMixingRounds(lan_su_dung) });
    closeRoundItemModal();
  };

  const removeRoundItem = (roundKey: RoundKey, rowIndex: number) => {
    const items = getRoundItems(draft.lan_su_dung, roundKey).filter((_, index) => index !== rowIndex);
    const lan_su_dung = { ...draft.lan_su_dung, [roundKey]: items };
    onChange({ lan_su_dung, tong_nhua_tron: sumMixingRounds(lan_su_dung) });
  };

  const addNextRoundSection = () => {
    const next = addNextRound(draft.lan_su_dung);
    if (!next) return;
    onChange({ lan_su_dung: next });
  };

  if (!open) return null;

  const editingRoundLabel =
    editingRoundKey !== null
      ? roundSectionLabel(ROUND_KEYS.indexOf(editingRoundKey), roundCount)
      : '';

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="text-lg font-black text-zinc-950">
              {isEditing ? 'Sửa dòng vật tư' : 'Thêm dòng vật tư'}
            </h3>
            <p className="mt-1 text-sm font-medium text-zinc-500">
              Nhập định mức từng lần: mã NVL, %, khối lượng 1 mẻ — hệ thống tự tính KL
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {errorMessage && (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}

          <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Phối trộn</p>
          <div className="space-y-4">
            {activeRounds.map((roundKey, roundIndex) => {
              const items = getRoundItems(draft.lan_su_dung, roundKey);
              const batchWeight = getRoundBatchWeight(draft.lan_su_dung, roundKey);
              const batchWeightText =
                batchWeight !== null && batchWeight !== undefined ? String(batchWeight) : '';
              return (
                <div key={roundKey} className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                    <p className="text-xs font-black uppercase tracking-wider text-zinc-700">
                      {roundSectionLabel(roundIndex, roundCount)}
                    </p>
                    <label className="flex items-center gap-2 text-xs font-bold text-zinc-700">
                      <span>
                        KL 1 mẻ (kg) <span className="text-[#ef1b2d]">*</span>
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={batchWeightText}
                        onChange={e => {
                          const lan_su_dung = setRoundBatchWeight(draft.lan_su_dung, roundKey, e.target.value);
                          onChange({ lan_su_dung, tong_nhua_tron: sumMixingRounds(lan_su_dung) });
                        }}
                        className="h-8 w-28 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-black outline-none focus:border-[#ef1b2d]"
                        placeholder="Nhập kg"
                      />
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                        <tr>
                          <th className="px-2 py-2 font-black">Mã NVL</th>
                          <th className="px-2 py-2 font-black">%</th>
                          <th className="px-2 py-2 font-black">KL định mức</th>
                          <th className="px-2 py-2 font-black">KL thực tế</th>
                          <th className="px-2 py-2 text-center font-black">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center font-semibold text-zinc-400">
                              Chưa có định mức. Bấm &quot;Thêm dòng&quot; để nhập mã NVL và %.
                            </td>
                          </tr>
                        ) : (
                          items.map((item, rowIndex) => (
                          <tr key={`${roundKey}-${rowIndex}`}>
                            <td className="px-2 py-2 font-mono font-semibold text-zinc-700">{item.ma_nvl || '-'}</td>
                            <td className="px-2 py-2 font-mono font-semibold text-zinc-700">
                              {formatOptionalNumber(item.ti_le_phan_tram) || '-'}
                            </td>
                            <td className="px-2 py-2 font-mono font-bold text-emerald-800">
                              {formatNormWeight(item.so_luong) || '-'}
                            </td>
                            <td className="px-2 py-2 font-mono font-bold text-[#ef1b2d]">
                              {formatOptionalNumber(item.kl_thuc_te) || '-'}
                            </td>
                            <td className="px-2 py-2 text-center">
                              <RowActionsMenu label={`Thao tác NVL ${item.ma_nvl || rowIndex + 1}`}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditRoundItem(roundKey, rowIndex)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                                  title="Sửa dòng"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRoundItem(roundKey, rowIndex)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                  title="Xóa dòng"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              </RowActionsMenu>
                            </td>
                          </tr>
                        )))}
                        <tr>
                          <td colSpan={5} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => openAddRoundItem(roundKey)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-[#ef1b2d]/40 bg-red-50/50 px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-50"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Thêm dòng
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {roundCount < 5 && (
              <button
                type="button"
                onClick={addNextRoundSection}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs font-extrabold text-zinc-700 transition hover:border-[#ef1b2d]/40 hover:bg-red-50/40 hover:text-[#ef1b2d]"
              >
                <Plus className="h-4 w-4" />
                Thêm KL mẻ ({roundSectionLabel(roundCount, roundCount + 1)})
              </button>
            )}
          </div>

          <div className="mt-4">
            <label className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Tổng trộn</span>
              <input
                value={formatOptionalNumber(tongTron)}
                readOnly
                className={`${modalInputClass} bg-emerald-50 font-black text-emerald-700`}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onSave()}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c]"
          >
            <Save className="h-4 w-4" />
            {isEditing ? 'Cập nhật dòng' : 'Thêm vào bảng'}
          </button>
        </div>
      </div>
    </div>

    <MixingRoundItemFormModal
      open={roundItemModalOpen}
      roundLabel={editingRoundLabel}
      draft={roundItemDraft}
      materials={materials}
      batchWeight={editingRoundKey ? getRoundBatchWeight(draft.lan_su_dung, editingRoundKey) : null}
      isEditing={editingRowIndex !== null}
      errorMessage={roundItemModalError}
      onClose={closeRoundItemModal}
      onChange={patch => {
        setRoundItemModalError('');
        setRoundItemDraft(prev => ({ ...prev, ...patch }));
      }}
      onSave={saveRoundItemDraft}
    />
    </>
  );
}

export default function MixingReportForm({
  onBack,
  onOpenList,
  modalMode = false,
  open = true,
  onClose,
  onSaved,
  initialMachine,
  onInitialMachineConsumed,
  editReport,
  onEditConsumed
}: {
  onBack?: () => void;
  onOpenList?: () => void;
  modalMode?: boolean;
  open?: boolean;
  onClose?: () => void;
  onSaved?: () => void | Promise<void>;
  initialMachine?: { id: string; code: string; name: string } | null;
  onInitialMachineConsumed?: () => void;
  editReport?: MixingReport | null;
  onEditConsumed?: () => void;
}) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<MixingProductionOrder[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [activeRoundCount, setActiveRoundCount] = useState(1);
  const [sessionRoundStart, setSessionRoundStart] = useState(1);
  const [roundBatchWeightDrafts, setRoundBatchWeightDrafts] = useState<Partial<Record<RoundKey, string>>>({});
  const [roundItemModal, setRoundItemModal] = useState<{
    roundKey: RoundKey;
    edit?: { lineIndex: number; itemIndex: number };
    draft: MixingRoundItem;
    error: string;
  } | null>(null);
  const [form, setForm] = useState(newReportForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nhanSuManual, setNhanSuManual] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineDraft, setLineDraft] = useState<MixingReportLine>(emptyLine(1));
  const [lineModalError, setLineModalError] = useState('');
  const [uploadingRoundKey, setUploadingRoundKey] = useState<RoundKey | null>(null);
  const [actualWeightDrafts, setActualWeightDrafts] = useState<Record<string, string>>({});
  const [reasonOptions, setReasonOptions] = useState<string[]>([]);
  const [collapsedRounds, setCollapsedRounds] = useState<Set<RoundKey>>(() => new Set());
  const [normSuggestions, setNormSuggestions] = useState<MixingNormSuggestion[]>([]);
  const [normSuggestionsLoading, setNormSuggestionsLoading] = useState(false);
  const [applyingNormId, setApplyingNormId] = useState<string | null>(null);
  const autoCollapsedRoundsRef = useRef<Set<RoundKey>>(new Set());

  const allReasonOptions = useMemo(() => {
    const merged = new Set<string>(reasonOptions);
    ROUND_KEYS.forEach(key => {
      form.ly_do_theo_lan?.[key]?.forEach(item => {
        const normalized = item.trim();
        if (normalized) merged.add(normalized);
      });
    });
    return [...merged].sort((left, right) => left.localeCompare(right, 'vi'));
  }, [reasonOptions, form.ly_do_theo_lan]);

  const loadReferenceData = async () => {
    const [machineRes, materialRes, productionRes, settingRes] = await Promise.all([
      fetch('/api/danh-sach-may'),
      fetch('/api/kho-nvl'),
      fetch('/api/lenh-sx'),
      fetch('/api/cai-dat')
    ]);
    const machineData = await machineRes.json().catch(() => ({}));
    const materialData = await materialRes.json().catch(() => ({}));
    const productionData = await productionRes.json().catch(() => ({}));
    const settingData = await settingRes.json().catch(() => ({}));
    if (!machineRes.ok) throw new Error(machineData.error || 'Không thể tải danh sách máy.');
    if (!materialRes.ok) throw new Error(materialData.error || 'Không thể tải kho NVL.');
    if (!productionRes.ok) throw new Error(productionData.error || 'Không thể tải lệnh sản xuất.');

    const machineRows = Array.isArray(machineData.machines) ? machineData.machines : [];
    setMachines(
      machineRows.map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ''),
        code: String(row.ma_may ?? row.code ?? '').trim(),
        name: String(row.ten_may ?? row.name ?? '').trim(),
        branch: String(row.chi_nhanh ?? row.branch ?? '').trim()
      }))
    );

    const materialRows = Array.isArray(materialData.materials) ? materialData.materials : [];
    setMaterials(
      materialRows
        .map((row: Record<string, unknown>) => ({
          code: String(row.ma_npl ?? '').trim(),
          name: String(row.ten_npl ?? '').trim(),
          unit: String(row.don_vi ?? 'kg').trim() || 'kg'
        }))
        .filter(item => item.code || item.name)
    );

    setProductionOrders(normalizeMixingProductionOrders(productionData));
    if (settingRes.ok) setShiftSettings(normalizeShiftSettings(settingData));
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError('');
      try {
        await loadReferenceData();
        if (cancelled) return;
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không thể tải dữ liệu.');
      }
    })();

    void fetch('/api/bao-cao-phoi-tron/ly-do-goi-y')
      .then(res => res.json().catch(() => ({})))
      .then(data => {
        if (cancelled) return;
        const reasons = Array.isArray(data.reasons) ? data.reasons : [];
        setReasonOptions(
          reasons
            .map((item: unknown) => String(item ?? '').trim())
            .filter(Boolean)
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const shiftSelectOptions = useMemo(() => {
    const options = [...shiftOptions];
    const current = normalizeMixingCaInput(form.ca);
    if (current && !options.some(option => option.value === current || option.label === current)) {
      options.unshift({ value: current, label: current });
    }
    return options;
  }, [form.ca, shiftOptions]);

  useEffect(() => {
    const current = normalizeMixingCaInput(form.ca);
    if (!current || shiftOptions.length === 0) return;
    const resolved = resolveShiftName(current, shiftOptions);
    if (resolved && resolved !== form.ca) {
      setForm(prev => (prev.ca === resolved ? prev : { ...prev, ca: resolved }));
    }
  }, [form.ca, shiftOptions]);

  useEffect(() => {
    if (nhanSuManual || !form.ca.trim()) return;
    if (!form.ma_may.trim() && !form.ten_may.trim()) return;

    const staff = resolveStaffFromProductionOrders(
      productionOrders,
      form.ngay,
      form.ca,
      form.ma_may,
      form.ten_may,
      machines
    );
    if (!staff) return;

    setForm(prev => (prev.nhan_su === staff ? prev : { ...prev, nhan_su: staff }));
  }, [form.ca, form.ma_may, form.ten_may, form.ngay, productionOrders, machines, nhanSuManual]);

  const computedLines = useMemo(
    () =>
      form.chi_tiet.map(line => ({
        ...line,
        tong_nhua_tron: sumMixingRounds(line.lan_su_dung)
      })),
    [form.chi_tiet]
  );

  const expandedLineCount = useMemo(
    () => normalizeChiTietLines(form.chi_tiet).length,
    [form.chi_tiet]
  );

  useEffect(() => {
    if (expandedLineCount === form.chi_tiet.length) return;
    setForm(prev => ({
      ...prev,
      chi_tiet: normalizeChiTietLines(prev.chi_tiet)
    }));
  }, [expandedLineCount, form.chi_tiet.length]);

  const computedActualUsage = useMemo(
    () =>
      round2(
        computedLines.reduce((sum, line) => {
          const actual = sumMixingRoundsActual(line.lan_su_dung);
          const hasActual = hasMixingActualWeights(line.lan_su_dung);
          const lineTotal = hasActual
            ? actual
            : line.tong_nhua_tron ?? sumMixingRounds(line.lan_su_dung);
          return sum + lineTotal;
        }, 0)
      ),
    [computedLines]
  );

  const pickMachine = (machineId: string) => {
    const machine = machines.find(item => item.id === machineId);
    if (!machine) return;
    setNhanSuManual(false);
    setForm(prev => ({
      ...prev,
      ma_may: machine.code,
      ten_may: machine.name,
      chi_nhanh: machine.branch || prev.chi_nhanh
    }));
  };

  useEffect(() => {
    if (!initialMachine || machines.length === 0) return;
    const machine =
      machines.find(item => item.id === initialMachine.id) ??
      machines.find(item => item.code === initialMachine.code) ??
      machines.find(item => item.name === initialMachine.name);
    if (!machine) return;
    pickMachine(machine.id);
    onInitialMachineConsumed?.();
  }, [initialMachine, machines, onInitialMachineConsumed]);

  const pickShift = (ca: string) => {
    setNhanSuManual(false);
    setForm(prev => ({ ...prev, ca }));
  };

  const handleDateChange = (ngay: string) => {
    setNhanSuManual(false);
    setForm(prev => ({
      ...prev,
      ngay,
      nhan_su: ''
    }));
  };

  useEffect(() => {
    const ngay = form.ngay.trim();
    const ca = normalizeMixingCaInput(form.ca);
    if (!ngay || !ca) {
      setNormSuggestions([]);
      setNormSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setNormSuggestionsLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ ngay, ca });
        const res = await fetch(`/api/bang-tron-vat-tu-dinh-muc?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setNormSuggestions([]);
          return;
        }
        const all = normalizeMixingNormSuggestions(data);
        setNormSuggestions(filterMixingNormSuggestionsByDateShift(all, ngay, ca));
      } catch {
        if (!cancelled) setNormSuggestions([]);
      } finally {
        if (!cancelled) setNormSuggestionsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [form.ngay, form.ca]);

  const applyNormSuggestion = (norm: MixingNormSuggestion) => {
    const items = mixingNormToRoundItems(norm);
    if (items.length === 0) {
      setError('Phiếu định mức này chưa có NVL để áp dụng.');
      return;
    }

    const hasExisting = form.chi_tiet.length > 0;
    if (hasExisting) {
      const ok = window.confirm(
        'Form đã có NVL. Áp dụng phiếu định mức sẽ thay danh sách NVL hiện tại bằng định mức QC. Tiếp tục?'
      );
      if (!ok) return;
    }

    setApplyingNormId(norm.id);
    const roundKey = ROUND_KEYS[0];
    let nextLines: MixingReportLine[] = [];
    for (const item of items) {
      nextLines = upsertMaterialInRound(nextLines, roundKey, item);
    }

    setForm(prev => ({
      ...prev,
      chi_tiet: normalizeChiTietLines(nextLines)
    }));
    setActiveRoundCount(prev => Math.max(prev, 1));
    setMessage(
      `Đã áp dụng ${items.length} NVL từ định mức QC${norm.ma_lenh_sx ? ` (${norm.ma_lenh_sx})` : ''}.`
    );
    setError('');
    setApplyingNormId(null);
  };

  useEffect(() => {
    if (editingId) return;
    if (!form.ca.trim() || !form.ngay.trim() || !form.ma_may.trim()) {
      setSessionRoundStart(1);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          tu_ngay: form.ngay,
          den_ngay: form.ngay,
          ca: form.ca,
          ma_may: form.ma_may
        });
        const res = await fetch(`/api/bao-cao-phoi-tron?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const reports = Array.isArray(data.reports)
          ? data.reports.map((item: Record<string, unknown>) => normalizeMixingReport(item))
          : [];
        const nextStart = computeNextMixingSessionStart(reports);
        setSessionRoundStart(nextStart);
        setActiveRoundCount(prev => Math.max(prev, 1));
      } catch {
        if (!cancelled) setSessionRoundStart(1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [form.ca, form.ngay, form.ma_may, editingId]);

  const startEdit = (report: MixingReport) => {
    const roundCount = Math.min(
      5,
      Math.max(
        report.so_lan || 1,
        report.chi_tiet.reduce((max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)), 0)
      )
    );
    const batchDrafts: Partial<Record<RoundKey, string>> = {};
    report.chi_tiet.forEach(line => {
      ROUND_KEYS.forEach(key => {
        const weight = line.lan_su_dung.khoi_luong_me?.[key];
        if (weight !== null && weight !== undefined && weight > 0 && batchDrafts[key] === undefined) {
          batchDrafts[key] = String(weight);
        }
      });
    });

    setNhanSuManual(true);
    setEditingId(report.id);
    setActiveRoundCount(roundCount);
    setSessionRoundStart(report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1);
    setRoundBatchWeightDrafts(batchDrafts);
    setActualWeightDrafts({});
    setCollapsedRounds(new Set());
    autoCollapsedRoundsRef.current = new Set();
    setForm({
      ca: resolveShiftName(normalizeMixingCaInput(report.ca), shiftOptions) || normalizeMixingCaInput(report.ca),
      ngay: report.ngay || todayIso(),
      gio: report.gio || nowTimeValue(),
      chi_nhanh: report.chi_nhanh || COMPANY_BRANCH_NAME,
      ma_may: report.ma_may,
      ten_may: report.ten_may,
      nhan_su: report.nhan_su,
      so_phieu: report.so_phieu,
      ky_hieu: report.ky_hieu || 'QT-16-BM02',
      lan_thu: report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1,
      so_lan: roundCount,
      thuc_te_su_dung: report.thuc_te_su_dung,
      ghi_chu: report.ghi_chu,
      hinh_anh_theo_lan: report.hinh_anh_theo_lan ?? {},
      ly_do_theo_lan: report.ly_do_theo_lan ?? {},
      giai_trinh_theo_lan: report.giai_trinh_theo_lan ?? {},
      chi_tiet: report.chi_tiet
    });
    setMessage('');
    setError('');
  };

  useEffect(() => {
    if (!editReport) return;
    startEdit(editReport);
    onEditConsumed?.();
  }, [editReport, onEditConsumed]);

  const sessionRoundEnd = sessionRoundStart + Math.max(activeRoundCount, 1) - 1;
  const canAddSessionRound = sessionRoundEnd < MAX_MIXING_SESSIONS_PER_SHIFT;

  const displayedRoundCount = useMemo(() => {
    const fromLines = computedLines.reduce(
      (max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)),
      0
    );
    return Math.min(MIXING_MAX_ROUNDS, Math.max(activeRoundCount, fromLines));
  }, [activeRoundCount, computedLines]);

  useEffect(() => {
    const fromLines = form.chi_tiet.reduce(
      (max, line) => Math.max(max, visibleRoundCount(line.lan_su_dung)),
      0
    );
    if (fromLines > activeRoundCount) {
      setActiveRoundCount(fromLines);
    }
  }, [form.chi_tiet, activeRoundCount]);

  /** Lần đã nhập xong (có NVL + ảnh) không còn là lần cuối thì tự thu gọn, đỡ phải lướt qua dữ liệu cũ. */
  useEffect(() => {
    ROUND_KEYS.slice(0, displayedRoundCount).forEach((roundKey, index) => {
      const isLast = index === displayedRoundCount - 1;
      if (isLast) return;
      if (autoCollapsedRoundsRef.current.has(roundKey)) return;
      if (!isRoundComplete(roundKey)) return;
      autoCollapsedRoundsRef.current.add(roundKey);
      setCollapsedRounds(prev => {
        if (prev.has(roundKey)) return prev;
        const next = new Set(prev);
        next.add(roundKey);
        return next;
      });
    });
  }, [displayedRoundCount, form.chi_tiet, form.hinh_anh_theo_lan]);

  const removeSessionRound = (roundKey: RoundKey, roundIndex: number) => {
    const lastRoundKey = ROUND_KEYS[displayedRoundCount - 1];
    if (displayedRoundCount <= 1 || roundKey !== lastRoundKey) return;

    const label = roundColumnLabel(sessionRoundStart, roundIndex);
    if (!window.confirm(`Xóa ${label}? Dữ liệu NVL, ảnh và lý do của lần này sẽ bị xóa.`)) return;

    const nextCount = displayedRoundCount - 1;
    setForm(prev => {
      const hinh_anh_theo_lan = { ...prev.hinh_anh_theo_lan };
      delete hinh_anh_theo_lan[roundKey];
      const ly_do_theo_lan = { ...prev.ly_do_theo_lan };
      delete ly_do_theo_lan[roundKey];
      const giai_trinh_theo_lan = { ...prev.giai_trinh_theo_lan };
      delete giai_trinh_theo_lan[roundKey];
      return {
        ...prev,
        chi_tiet: clearRoundFromLines(prev.chi_tiet, roundKey),
        hinh_anh_theo_lan,
        ly_do_theo_lan,
        giai_trinh_theo_lan,
        so_lan: Math.max(1, nextCount)
      };
    });
    setActiveRoundCount(nextCount);
    setRoundBatchWeightDrafts(prev => {
      const next = { ...prev };
      delete next[roundKey];
      return next;
    });
    setActualWeightDrafts(prev => {
      const prefix = `${roundKey}-`;
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (key.startsWith(prefix)) delete next[key];
      });
      return next;
    });
    setMessage(`Đã xóa ${label}.`);
    setError('');
  };

  const applySessionRoundStart = (nextStart: number) => {
    const maxStart = Math.max(1, MAX_MIXING_SESSIONS_PER_SHIFT - displayedRoundCount + 1);
    const target = Math.max(1, Math.min(maxStart, Math.round(nextStart || 1)));
    setSessionRoundStart(target);
    setForm(prev => ({ ...prev, lan_thu: target }));
    setError('');
  };

  const applyRoundCount = (nextCount: number) => {
    const maxAllowed = Math.min(MIXING_MAX_ROUNDS, MAX_MIXING_SESSIONS_PER_SHIFT - sessionRoundStart + 1);
    const target = Math.max(1, Math.min(maxAllowed, Math.round(nextCount || 1)));
    if (target === displayedRoundCount) return;

    if (target > displayedRoundCount) {
      setActiveRoundCount(target);
      setForm(prev => ({ ...prev, so_lan: Math.max(prev.so_lan, target) }));
      setError('');
      return;
    }

    const removedKeys = ROUND_KEYS.slice(target, displayedRoundCount);
    const hasData = removedKeys.some(
      key =>
        listRoundMaterialEntries(form.chi_tiet, key).length > 0 ||
        (form.hinh_anh_theo_lan[key]?.length ?? 0) > 0 ||
        (form.ly_do_theo_lan[key]?.length ?? 0) > 0 ||
        Boolean(form.giai_trinh_theo_lan[key]?.trim())
    );
    if (hasData && !window.confirm(`Giảm còn ${target} lần? Dữ liệu các lần bị bỏ sẽ bị xóa.`)) {
      return;
    }

    setForm(prev => {
      let chi_tiet = prev.chi_tiet;
      const hinh_anh_theo_lan = { ...prev.hinh_anh_theo_lan };
      const ly_do_theo_lan = { ...prev.ly_do_theo_lan };
      const giai_trinh_theo_lan = { ...prev.giai_trinh_theo_lan };
      removedKeys.forEach(key => {
        chi_tiet = clearRoundFromLines(chi_tiet, key);
        delete hinh_anh_theo_lan[key];
        delete ly_do_theo_lan[key];
        delete giai_trinh_theo_lan[key];
      });
      return { ...prev, chi_tiet, hinh_anh_theo_lan, ly_do_theo_lan, giai_trinh_theo_lan, so_lan: target };
    });
    setActiveRoundCount(target);
    setRoundBatchWeightDrafts(prev => {
      const next = { ...prev };
      removedKeys.forEach(key => delete next[key]);
      return next;
    });
    setActualWeightDrafts(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(draftKey => {
        if (removedKeys.some(key => draftKey.startsWith(`${key}-`))) delete next[draftKey];
      });
      return next;
    });
    setMessage(`Đã đặt ${target} lần trộn.`);
    setError('');
  };

  const resolveRoundBatchWeight = (
    chi_tiet: MixingReportLine[],
    roundKey: RoundKey,
    drafts: Partial<Record<RoundKey, string>> = roundBatchWeightDrafts
  ) => {
    const fromLines = getRoundBatchWeightFromLines(chi_tiet, roundKey);
    if (fromLines !== null) return fromLines;
    const draft = drafts[roundKey];
    if (draft !== undefined && draft.trim()) {
      return parseBatchWeightInput(draft);
    }
    return null;
  };

  const getRoundBatchWeightInputValue = (roundKey: RoundKey) => {
    if (roundBatchWeightDrafts[roundKey] !== undefined) {
      return roundBatchWeightDrafts[roundKey] ?? '';
    }
    const fromLines = getRoundBatchWeightFromLines(form.chi_tiet, roundKey);
    return fromLines !== null ? String(fromLines) : '';
  };

  const handleRoundBatchWeightChange = (roundKey: RoundKey, value: string) => {
    setRoundBatchWeightDrafts(prev => ({ ...prev, [roundKey]: value }));
    setForm(prev => ({
      ...prev,
      chi_tiet:
        prev.chi_tiet.length > 0
          ? setRoundBatchWeightOnLines(prev.chi_tiet, roundKey, value)
          : prev.chi_tiet
    }));
  };

  const handleMaterialActualWeightChange = (
    roundKey: RoundKey,
    lineIndex: number,
    itemIndex: number,
    value: string
  ) => {
    setForm(prev => ({
      ...prev,
      chi_tiet: updateMaterialActualWeightInRound(prev.chi_tiet, roundKey, lineIndex, itemIndex, value)
    }));
  };

  const actualWeightDraftKey = (roundKey: RoundKey, lineIndex: number, itemIndex: number) =>
    `${roundKey}-${lineIndex}-${itemIndex}`;

  const applyActualWeightDrafts = (lines: MixingReportLine[]) =>
    Object.entries(actualWeightDrafts).reduce((current, [key, text]) => {
      const parsed = parseActualWeightDraftKey(key);
      if (!parsed) return current;
      return updateMaterialActualWeightInRound(
        current,
        parsed.roundKey,
        parsed.lineIndex,
        parsed.itemIndex,
        String(text)
      );
    }, lines);

  const openRoundMaterialModal = (roundKey: RoundKey, edit?: { lineIndex: number; itemIndex: number }) => {
    const existing =
      edit &&
      form.chi_tiet[edit.lineIndex] &&
      getRoundItems(form.chi_tiet[edit.lineIndex].lan_su_dung, roundKey)[edit.itemIndex];
    setRoundItemModal({
      roundKey,
      edit,
      draft: existing ? { ...existing } : emptyRoundItem(),
      error: ''
    });
  };

  const saveRoundMaterialModal = (item: MixingRoundItem) => {
    if (!roundItemModal) return;
    if (!item.ma_nvl.trim() && !item.ten_vat_tu.trim()) {
      setRoundItemModal(prev => (prev ? { ...prev, error: 'Vui lòng chọn mã NVL.' } : prev));
      return;
    }
    setForm(prev => ({
      ...prev,
      chi_tiet: upsertMaterialInRound(
        prev.chi_tiet,
        roundItemModal.roundKey,
        item,
        roundItemModal.edit,
        resolveRoundBatchWeight(prev.chi_tiet, roundItemModal.roundKey)
      )
    }));
    setRoundItemModal(null);
  };

  const openEditLineModal = (index: number) => {
    const line = computedLines[index];
    if (!line) return;
    setEditingLineIndex(index);
    setLineDraft({
      ...line,
      lan_su_dung: normalizePhoiTron(line.lan_su_dung),
      tong_nhua_tron: sumMixingRounds(line.lan_su_dung)
    });
    setLineModalError('');
    setLineModalOpen(true);
  };

  const closeLineModal = () => {
    setLineModalOpen(false);
    setEditingLineIndex(null);
    setLineModalError('');
  };

  const saveLineDraft = (patch?: Partial<MixingReportLine>) => {
    const current = { ...lineDraft, ...patch };
    if (!hasPhoiTronMaterial(current.lan_su_dung)) {
      setLineModalError('Vui lòng chọn mã NVL trong bảng phối trộn.');
      return;
    }

    // Bắt buộc nhập KL 1 mẻ (kg) cho từng lần phối trộn đang hiển thị.
    // Nếu thiếu (null/undefined/<=0) thì không cho lưu dòng.
    const roundCount = visibleRoundCount(current.lan_su_dung);
    for (let i = 0; i < roundCount; i += 1) {
      const roundKey = ROUND_KEYS[i];
      const batchWeight = current.lan_su_dung.khoi_luong_me?.[roundKey];
      if (!Number.isFinite(batchWeight ?? NaN) || (batchWeight ?? 0) <= 0) {
        setLineModalError(`Vui lòng nhập KL 1 mẻ (kg) cho ${roundSectionLabel(i, roundCount)} trước khi lưu.`);
        return;
      }
    }

    const { ma_nvl, ten_vat_tu } = deriveLineMaterial(current.lan_su_dung);
    const savedLine: MixingReportLine = {
      ...current,
      ma_nvl,
      ten_vat_tu,
      tong_nhua_tron: sumMixingRounds(current.lan_su_dung)
    };
    const normalizedLines = normalizeChiTietLines(
      editingLineIndex === null
        ? [...form.chi_tiet, savedLine]
        : form.chi_tiet.map((line, index) => (index === editingLineIndex ? savedLine : line))
    );
    const nextSoLan = Math.max(
      form.so_lan || 1,
      visibleRoundCount(savedLine.lan_su_dung),
      ...normalizedLines.map(line => visibleRoundCount(line.lan_su_dung))
    );

    setForm(prev => ({
      ...prev,
      so_lan: Math.min(MIXING_MAX_ROUNDS, nextSoLan),
      chi_tiet: normalizedLines
    }));

    closeLineModal();
  };

  const removeLine = (index: number) => {
    setForm(prev => ({
      ...prev,
      chi_tiet: prev.chi_tiet
        .filter((_, lineIndex) => lineIndex !== index)
        .map((line, lineIndex) => ({ ...line, stt: lineIndex + 1 }))
    }));
  };

  const getRoundPhotos = (roundKey: RoundKey) => form.hinh_anh_theo_lan?.[roundKey] ?? [];

  const isRoundComplete = (roundKey: RoundKey) =>
    listRoundMaterialEntries(form.chi_tiet, roundKey).length > 0 && getRoundPhotos(roundKey).length > 0;

  const toggleRoundCollapsed = (roundKey: RoundKey) => {
    setCollapsedRounds(prev => {
      const next = new Set(prev);
      if (next.has(roundKey)) next.delete(roundKey);
      else next.add(roundKey);
      return next;
    });
  };

  const getRoundReasons = (roundKey: RoundKey) => form.ly_do_theo_lan?.[roundKey] ?? [];

  const handleRoundReasonsChange = (roundKey: RoundKey, reasons: string[]) => {
    setForm(prev => ({
      ...prev,
      ly_do_theo_lan: { ...prev.ly_do_theo_lan, [roundKey]: reasons },
      giai_trinh_theo_lan: {
        ...prev.giai_trinh_theo_lan,
        [roundKey]: formatMixingReasonsExplanation(reasons)
      }
    }));
  };

  const handleRoundExplanationChange = (roundKey: RoundKey, value: string) => {
    setForm(prev => ({
      ...prev,
      giai_trinh_theo_lan: { ...prev.giai_trinh_theo_lan, [roundKey]: value }
    }));
  };

  const removeRoundPhoto = (roundKey: RoundKey, photoIndex: number) => {
    setForm(prev => ({
      ...prev,
      hinh_anh_theo_lan: {
        ...prev.hinh_anh_theo_lan,
        [roundKey]: (prev.hinh_anh_theo_lan?.[roundKey] ?? []).filter((_, index) => index !== photoIndex)
      }
    }));
  };

  const processRoundPhotoFiles = async (files: FileList | File[], roundKey: RoundKey) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploadingRoundKey(roundKey);
    setError('');
    try {
      const uploadedPhotos: MixingRoundPhoto[] = [];
      for (const file of fileList) {
        const rawDataUrl = await fileToDataUrl(file);
        const dataUrl = await compressImageDataUrl(rawDataUrl);
        const uploaded = await uploadMixingLineImage(dataUrl);
        if (!uploaded.imageUrl) {
          throw new Error('Upload ảnh không trả về URL.');
        }
        uploadedPhotos.push({ url: uploaded.imageUrl, public_id: uploaded.imagePublicId });
      }
      setForm(prev => ({
        ...prev,
        hinh_anh_theo_lan: {
          ...prev.hinh_anh_theo_lan,
          [roundKey]: [...(prev.hinh_anh_theo_lan?.[roundKey] ?? []), ...uploadedPhotos]
        }
      }));
      setMessage(
        `Đã thêm ${uploadedPhotos.length} ảnh vào ${roundColumnLabel(sessionRoundStart, ROUND_KEYS.indexOf(roundKey))}.`
      );
    } catch (err: any) {
      setError(err.message || 'Không thể upload ảnh. Kiểm tra Cloudinary rồi thử lại.');
    } finally {
      setUploadingRoundKey(null);
    }
  };

  const pickRoundPhotos = (roundKey: RoundKey) => {
    if (uploadingRoundKey === roundKey) return;
    openCameraImagePicker(file => {
      void processRoundPhotoFiles([file], roundKey);
    });
  };

  const resetForm = () => {
    setNhanSuManual(false);
    setEditingId(null);
    setActiveRoundCount(1);
    setSessionRoundStart(1);
    setRoundBatchWeightDrafts({});
    setActualWeightDrafts({});
    setForm(newReportForm());
    setMessage('');
    setError('');
    setCollapsedRounds(new Set());
    autoCollapsedRoundsRef.current = new Set();
  };

  const handleSave = async () => {
    const resolvedCa =
      resolveShiftName(normalizeMixingCaInput(form.ca), shiftOptions) || normalizeMixingCaInput(form.ca);
    if (!resolvedCa) {
      setError(showSaveFailure('Vui lòng chọn ca sản xuất.'));
      return;
    }
    if (!form.ngay.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày.'));
      return;
    }
    if (!form.ma_may.trim() && !form.ten_may.trim()) {
      setError(showSaveFailure('Vui lòng chọn máy.'));
      return;
    }

    if (!editingId) {
      if (sessionRoundStart > MAX_MIXING_SESSIONS_PER_SHIFT) {
        setError(
          showSaveFailure(`Ca · ngày · máy này đã đủ ${MAX_MIXING_SESSIONS_PER_SHIFT} lần trộn.`)
        );
        return;
      }

      if (sessionRoundEnd > MAX_MIXING_SESSIONS_PER_SHIFT) {
        setError(
          showSaveFailure(
            `Chỉ còn tối đa ${MAX_MIXING_SESSIONS_PER_SHIFT - sessionRoundStart + 1} lần trộn cho ca · ngày · máy này.`
          )
        );
        return;
      }
    }

    let chiTietReady = applyActualWeightDrafts(form.chi_tiet);
    chiTietReady = ROUND_KEYS.slice(0, displayedRoundCount).reduce((lines, roundKey) => {
      if (roundBatchWeightDrafts[roundKey] === undefined) return lines;
      return setRoundBatchWeightOnLines(lines, roundKey, roundBatchWeightDrafts[roundKey] ?? '');
    }, chiTietReady);
    const linesToSave = chiTietReady
      .filter(line => line.ma_nvl.trim() || line.ten_vat_tu.trim())
      .map(line => ({
        ...line,
        tong_nhua_tron: sumMixingRounds(line.lan_su_dung)
      }));
    let chi_tiet: MixingReportLine[] = prepareMixingChiTietForSave(linesToSave);
    if (chi_tiet.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một lần trộn và nhập NVL.'));
      return;
    }

    const missingBatchRound = ROUND_KEYS.slice(0, displayedRoundCount).find(roundKey => {
      const hasNvl = listRoundMaterialEntries(chiTietReady, roundKey).length > 0;
      if (!hasNvl) return false;
      const batchWeight = resolveRoundBatchWeight(chiTietReady, roundKey);
      return !Number.isFinite(batchWeight ?? NaN) || (batchWeight ?? 0) <= 0;
    });
    if (missingBatchRound) {
      const roundIndex = ROUND_KEYS.indexOf(missingBatchRound);
      setError(
        showSaveFailure(`Vui lòng nhập KL 1 mẻ (kg) cho ${roundColumnLabel(sessionRoundStart, roundIndex)}.`)
      );
      return;
    }

    const missingPhotoRound = ROUND_KEYS.slice(0, displayedRoundCount).find(roundKey => {
      const hasNvl = listRoundMaterialEntries(chiTietReady, roundKey).length > 0;
      const hasPhoto = (form.hinh_anh_theo_lan?.[roundKey]?.length ?? 0) > 0;
      return hasNvl && !hasPhoto;
    });
    if (missingPhotoRound) {
      const roundIndex = ROUND_KEYS.indexOf(missingPhotoRound);
      setError(
        showSaveFailure(`Vui lòng chụp ít nhất một ảnh cho ${roundColumnLabel(sessionRoundStart, roundIndex)}.`)
      );
      return;
    }

    setIsSaving(true);
    setError('');
    setMessage('');
    const wasEditing = Boolean(editingId);

    try {
      const hinh_anh_theo_lan = await resolveMixingPhotosForSave(form.hinh_anh_theo_lan ?? {});
      setForm(prev => ({ ...prev, hinh_anh_theo_lan }));

      chi_tiet = chi_tiet.map((line, index) =>
        index === 0
          ? ({
              ...line,
              _ly_do_theo_lan: form.ly_do_theo_lan ?? {},
              _giai_trinh_theo_lan: form.giai_trinh_theo_lan ?? {}
            } as MixingReportLine)
          : line
      );

      const thucTeSuDung = round2(
        linesToSave.reduce((sum, line) => {
          const actual = sumMixingRoundsActual(line.lan_su_dung);
          const hasActual = hasMixingActualWeights(line.lan_su_dung);
          const lineTotal = hasActual
            ? actual
            : line.tong_nhua_tron ?? sumMixingRounds(line.lan_su_dung);
          return sum + lineTotal;
        }, 0)
      );

      const payload = {
        ca: resolvedCa,
        ngay: form.ngay.trim(),
        gio: form.gio.trim(),
        chi_nhanh: form.chi_nhanh.trim(),
        ma_may: form.ma_may.trim(),
        ten_may: form.ten_may.trim(),
        nhan_su: form.nhan_su.trim(),
        so_phieu: form.so_phieu.trim(),
        ky_hieu: form.ky_hieu.trim() || 'QT-16-BM02',
        ghi_chu: form.ghi_chu.trim(),
        lan_thu: sessionRoundStart,
        so_lan: displayedRoundCount || 1,
        thuc_te_su_dung: thucTeSuDung,
        ly_do_theo_lan: form.ly_do_theo_lan ?? {},
        giai_trinh_theo_lan: form.giai_trinh_theo_lan ?? {},
        hinh_anh_theo_lan,
        chi_tiet
      };

      const res = await fetch(
        editingId ? `/api/bao-cao-phoi-tron/${editingId}` : '/api/bao-cao-phoi-tron',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không thể lưu báo cáo phối trộn.'));
      }

      setActualWeightDrafts({});
      resetForm();
      const okMsg = wasEditing ? 'Đã cập nhật báo cáo phối trộn.' : 'Đã lưu báo cáo phối trộn.';
      showAppToast(okMsg);
      if (modalMode) {
        await onSaved?.();
        onClose?.();
      } else {
        setMessage(okMsg);
      }
    } catch (err: any) {
      setError(showSaveFailure(err, 'Không thể lưu báo cáo phối trộn.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (modalMode && !open) return null;

  const headerFields = (
    <div
      className={`grid grid-cols-2 gap-3 bg-zinc-50 p-4 md:grid-cols-4 lg:grid-cols-8${modalMode ? '' : ' border-t border-zinc-100'}`}
    >
      <label className="space-y-1">
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
          <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" /> Ngày
        </span>
        <input type="date" value={form.ngay} onChange={e => handleDateChange(e.target.value)} className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
          <Clock3 className="h-3.5 w-3.5 text-[#ef1b2d]" /> Giờ
        </span>
        <input type="time" value={form.gio} onChange={e => setForm(prev => ({ ...prev, gio: e.target.value }))} className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Ca sản xuất</span>
        <select value={form.ca} onChange={e => pickShift(e.target.value)} className={inputClass}>
          <option value="">Chọn ca sản xuất...</option>
          {shiftSelectOptions.map(shift => (
            <option key={shift.value} value={shift.value}>
              {shift.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Chi nhánh</span>
        <input value={form.chi_nhanh} onChange={e => setForm(prev => ({ ...prev, chi_nhanh: e.target.value }))} className={inputClass} />
      </label>
      <label className="space-y-1 lg:col-span-2">
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
          <Cpu className="h-3.5 w-3.5 text-[#ef1b2d]" /> Máy
        </span>
        <select
          value={machines.find(machine => machine.code === form.ma_may)?.id ?? ''}
          onChange={e => pickMachine(e.target.value)}
          className={inputClass}
        >
          <option value="">Chọn máy...</option>
          {machines.map(machine => (
            <option key={machine.id} value={machine.id}>
              {machine.code} · {machine.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 lg:col-span-2">
        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-500">
          <Users className="h-3.5 w-3.5 text-[#ef1b2d]" /> Nhân sự
        </span>
        <input
          value={form.nhan_su}
          onChange={e => {
            setNhanSuManual(true);
            setForm(prev => ({ ...prev, nhan_su: e.target.value }));
          }}
          className={inputClass}
          placeholder="Tự điền theo Ca + Máy từ lệnh SX"
        />
      </label>
    </div>
  );

  const formBody = (
    <>
      {!modalMode && (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b-4 border-[#ef1b2d] bg-white px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">Bảng trộn vật tư</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {onOpenList && (
                  <button
                    type="button"
                    onClick={onOpenList}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Danh sách
                  </button>
                )}
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Quay lại
                  </button>
                )}
              </div>
            </div>
          </div>
          {headerFields}
        </section>
      )}

      {modalMode && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {headerFields}
        </div>
      )}

      {form.ngay.trim() && normalizeMixingCaInput(form.ca) ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-3 shadow-sm sm:px-4">
          <div className="mb-2 flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-sm font-black text-zinc-900">Gợi ý từ phiếu trộn định mức QC</p>
              <p className="text-[11px] font-medium text-zinc-600">
                Theo ngày {form.ngay} · ca {form.ca}. Bấm Áp dụng để đổ NVL vào bảng trộn.
              </p>
            </div>
          </div>
          {normSuggestionsLoading ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang tìm phiếu định mức...
            </p>
          ) : normSuggestions.length === 0 ? (
            <p className="text-xs font-semibold text-zinc-500">
              Không có phiếu định mức QC khớp ngày/ca này.
            </p>
          ) : (
            <ul className="space-y-2">
              {normSuggestions.map(norm => {
                const productLabels = norm.products
                  .map(product => product.ma_sp || product.ten_sp)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(', ');
                return (
                  <li
                    key={norm.id}
                    className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-zinc-900">
                        {norm.ma_lenh_sx || 'Không có mã lệnh'} · {norm.nvlCount} NVL
                        {norm.products.length > 1 ? ` · ${norm.products.length} SP` : ''}
                      </p>
                      <p className="truncate text-[11px] font-medium text-zinc-500">
                        {productLabels || '—'}
                        {norm.ghi_chu ? ` · ${norm.ghi_chu}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyNormSuggestion(norm)}
                      disabled={applyingNormId === norm.id}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                    >
                      {applyingNormId === norm.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Áp dụng
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      {message && !modalMode && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-zinc-100 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-sm font-black text-zinc-950">Bảng trộn vật tư</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[104px] space-y-1">
              <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">Lần bắt đầu</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, MAX_MIXING_SESSIONS_PER_SHIFT - displayedRoundCount + 1)}
                value={sessionRoundStart}
                onChange={e => applySessionRoundStart(Number(e.target.value || 1))}
                className={`${inputClass} h-8 text-center`}
              />
            </label>
            <label className="min-w-[104px] space-y-1">
              <span className="block text-[10px] font-black uppercase tracking-wider text-zinc-500">Số lần</span>
              <input
                type="number"
                min={1}
                max={Math.min(MIXING_MAX_ROUNDS, MAX_MIXING_SESSIONS_PER_SHIFT - sessionRoundStart + 1)}
                value={displayedRoundCount}
                onChange={e => applyRoundCount(Number(e.target.value || 1))}
                className={`${inputClass} h-8 text-center`}
              />
            </label>
            <button
              type="button"
              onClick={() => applyRoundCount(displayedRoundCount + 1)}
              disabled={!canAddSessionRound || displayedRoundCount >= MIXING_MAX_ROUNDS}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
              title="Thêm một lần trộn mới"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm lần
            </button>
          </div>
        </div>

        {displayedRoundCount > 0 ? (
          <>
            <div className="relative z-10 space-y-2 p-2 sm:space-y-3 sm:p-4">
            {ROUND_KEYS.slice(0, displayedRoundCount).map((roundKey, roundIndex) => {
              const entries = listRoundMaterialEntries(form.chi_tiet, roundKey);
              const isLastRound = roundIndex === displayedRoundCount - 1;
              const canRemoveRound = displayedRoundCount > 1 && isLastRound;
              const roundComplete = isRoundComplete(roundKey);
              const isCollapsed = collapsedRounds.has(roundKey);
              const roundPhotos = getRoundPhotos(roundKey);
              return (
                <React.Fragment key={roundKey}>
                <div className="mixing-round-card relative rounded-lg border border-zinc-200 sm:rounded-xl">
                  <div className="border-b border-zinc-100 bg-zinc-50 px-2 py-1.5 sm:px-3 sm:py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-700 sm:text-xs">
                        {roundColumnLabel(sessionRoundStart, roundIndex)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {roundComplete ? (
                          <span className="hidden items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-700 sm:inline-flex">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã xong
                          </span>
                        ) : null}
                        {canRemoveRound ? (
                          <button
                            type="button"
                            onClick={() => removeSessionRound(roundKey, roundIndex)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 sm:h-8 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-[11px] sm:font-extrabold"
                            title={`Xóa ${roundColumnLabel(sessionRoundStart, roundIndex)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Xóa lần</span>
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleRoundCollapsed(roundKey)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 sm:h-8 sm:w-8"
                          title={isCollapsed ? 'Mở rộng lần này' : 'Thu gọn lần này'}
                        >
                          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                        </button>
                        <label className="flex items-center gap-1 text-[9px] font-bold text-zinc-700 sm:gap-2 sm:text-xs">
                          <span className="whitespace-nowrap">
                            KL 1 mẻ (kg) <span className="text-[#ef1b2d]">*</span>
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            required
                            value={getRoundBatchWeightInputValue(roundKey)}
                            onChange={event => handleRoundBatchWeightChange(roundKey, event.target.value)}
                            className="mixing-round-batch-input h-7 w-14 rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] font-black outline-none focus:border-[#ef1b2d] sm:h-8 sm:w-28 sm:rounded-lg sm:px-2 sm:text-sm"
                            placeholder="Nhập kg"
                          />
                        </label>
                      </div>
                    </div>
                    {!isCollapsed ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-2">
                        <button
                          type="button"
                          onClick={() => openRoundMaterialModal(roundKey)}
                          className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-dashed border-[#ef1b2d]/40 bg-red-50/50 px-1.5 text-[9px] font-extrabold text-[#ef1b2d] transition hover:bg-red-50 sm:h-8 sm:justify-start sm:rounded-lg sm:px-3 sm:text-[11px]"
                        >
                          <Plus className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                          Thêm NVL
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => toggleRoundCollapsed(roundKey)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-2 text-left transition hover:bg-zinc-50 sm:px-3"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold text-zinc-600 sm:text-xs">
                        {entries.length} NVL · {roundPhotos.length} ảnh đã chụp
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-[#ef1b2d] sm:text-[11px]">
                        Mở rộng
                        <ChevronDown className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ) : entries.length === 0 ? (
                    <p className="px-2 py-2 text-center text-[10px] font-semibold text-zinc-400 sm:px-3 sm:py-3 sm:text-xs">
                      Chưa có NVL trong {roundColumnLabel(sessionRoundStart, roundIndex).toLowerCase()}.
                    </p>
                  ) : (
                    <>
                      <div className="divide-y divide-zinc-100 md:hidden">
                        {entries.map(entry => (
                          <div
                            key={`${roundKey}-${entry.lineIndex}-${entry.itemIndex}-mobile`}
                            className="mixing-round-item-mobile px-2 py-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="truncate font-mono text-[11px] font-bold text-zinc-800">
                                  {entry.item.ma_nvl || '-'}
                                </span>
                                <p className="line-clamp-1 text-[10px] font-semibold leading-tight text-zinc-600">
                                  {entry.item.ten_vat_tu || '-'}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openRoundMaterialModal(roundKey, {
                                      lineIndex: entry.lineIndex,
                                      itemIndex: entry.itemIndex
                                    })
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                                  title="Sửa NVL"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm(prev => ({
                                      ...prev,
                                      chi_tiet: removeMaterialFromRound(
                                        prev.chi_tiet,
                                        roundKey,
                                        entry.lineIndex,
                                        entry.itemIndex
                                      )
                                    }))
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                  title="Xóa NVL"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="mt-1 grid grid-cols-3 gap-1">
                              <div className="text-center">
                                <span className="block text-[11px] font-black leading-none text-zinc-800">
                                  %
                                </span>
                                <p className="mt-0.5 font-mono text-[11px] font-bold text-zinc-800">
                                  {formatOptionalNumber(entry.item.ti_le_phan_tram) || '-'}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="block text-[11px] font-black leading-none text-zinc-800">
                                  KL ĐM
                                </span>
                                <p className="mt-0.5 font-mono text-[11px] font-bold text-emerald-800">
                                  {formatNormWeight(entry.item.so_luong) || '-'}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="block text-[11px] font-black leading-none text-zinc-800">
                                  KL TT
                                </span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    actualWeightDrafts[
                                      actualWeightDraftKey(roundKey, entry.lineIndex, entry.itemIndex)
                                    ] ??
                                    (entry.item.kl_thuc_te === null || entry.item.kl_thuc_te === undefined
                                      ? ''
                                      : quantityInputText(entry.item.kl_thuc_te))
                                  }
                                  onFocus={() => {
                                    const key = actualWeightDraftKey(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex
                                    );
                                    setActualWeightDrafts(prev => {
                                      if (prev[key] !== undefined) return prev;
                                      return {
                                        ...prev,
                                        [key]:
                                          entry.item.kl_thuc_te === null || entry.item.kl_thuc_te === undefined
                                            ? ''
                                            : quantityInputText(entry.item.kl_thuc_te)
                                      };
                                    });
                                  }}
                                  onChange={event => {
                                    const text = sanitizeDecimalTyping(event.target.value);
                                    const key = actualWeightDraftKey(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex
                                    );
                                    setActualWeightDrafts(prev => ({ ...prev, [key]: text }));
                                  }}
                                  onBlur={() => {
                                    const key = actualWeightDraftKey(roundKey, entry.lineIndex, entry.itemIndex);
                                    const draft = actualWeightDrafts[key];
                                    if (draft === undefined) return;
                                    handleMaterialActualWeightChange(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex,
                                      draft
                                    );
                                    setActualWeightDrafts(prev => {
                                      const next = { ...prev };
                                      delete next[key];
                                      return next;
                                    });
                                  }}
                                  className="mixing-round-item-mobile-input mt-0.5 h-7 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-1 text-right font-mono text-[11px] font-bold text-[#ef1b2d] outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-bold text-zinc-700">
                          <span>Tổng</span>
                          <span className="font-mono text-emerald-800">
                            {formatNormWeight(
                              sumRoundQuantity(
                                form.chi_tiet[0]?.lan_su_dung ?? { lan_1: [] },
                                roundKey
                              )
                            ) || formatNormWeight(resolveRoundBatchWeight(form.chi_tiet, roundKey)) || '-'}
                          </span>
                          <span className="font-mono text-[#ef1b2d]">
                            {formatNormWeight(
                              entries.reduce((sum, entry) => sum + (entry.item.kl_thuc_te ?? 0), 0)
                            ) || '-'}
                          </span>
                        </div>
                      </div>
                      <div className="hidden overflow-x-auto md:block">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
                          <tr>
                            <th className="px-2 py-2 font-black">Mã NVL</th>
                            <th className="px-2 py-2 font-black">Tên vật tư</th>
                            <th className="px-2 py-2 font-black">%</th>
                            <th className="px-2 py-2 font-black">KL định mức</th>
                            <th className="px-2 py-2 font-black">KL thực tế</th>
                            <th className="px-2 py-2 text-center font-black">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {entries.map(entry => (
                            <tr key={`${roundKey}-${entry.lineIndex}-${entry.itemIndex}`}>
                              <td className="px-2 py-2 font-mono font-semibold text-zinc-700">
                                {entry.item.ma_nvl || '-'}
                              </td>
                              <td className="px-2 py-2 text-zinc-800">{entry.item.ten_vat_tu || '-'}</td>
                              <td className="px-2 py-2 font-mono font-semibold text-zinc-700">
                                {formatOptionalNumber(entry.item.ti_le_phan_tram) || '-'}
                              </td>
                              <td className="px-2 py-2 font-mono font-bold text-emerald-800">
                                {formatNormWeight(entry.item.so_luong) || '-'}
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    actualWeightDrafts[
                                      actualWeightDraftKey(roundKey, entry.lineIndex, entry.itemIndex)
                                    ] ??
                                    (entry.item.kl_thuc_te === null || entry.item.kl_thuc_te === undefined
                                      ? ''
                                      : quantityInputText(entry.item.kl_thuc_te))
                                  }
                                  onFocus={() => {
                                    const key = actualWeightDraftKey(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex
                                    );
                                    setActualWeightDrafts(prev => {
                                      if (prev[key] !== undefined) return prev;
                                      return {
                                        ...prev,
                                        [key]:
                                          entry.item.kl_thuc_te === null || entry.item.kl_thuc_te === undefined
                                            ? ''
                                            : quantityInputText(entry.item.kl_thuc_te)
                                      };
                                    });
                                  }}
                                  onChange={event => {
                                    const text = sanitizeDecimalTyping(event.target.value);
                                    const key = actualWeightDraftKey(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex
                                    );
                                    setActualWeightDrafts(prev => ({ ...prev, [key]: text }));
                                  }}
                                  onBlur={() => {
                                    const key = actualWeightDraftKey(roundKey, entry.lineIndex, entry.itemIndex);
                                    const draft = actualWeightDrafts[key];
                                    if (draft === undefined) return;
                                    handleMaterialActualWeightChange(
                                      roundKey,
                                      entry.lineIndex,
                                      entry.itemIndex,
                                      draft
                                    );
                                    setActualWeightDrafts(prev => {
                                      const next = { ...prev };
                                      delete next[key];
                                      return next;
                                    });
                                  }}
                                  className="h-8 w-24 rounded-lg border border-zinc-200 bg-white px-2 text-right font-mono text-xs font-bold text-[#ef1b2d] outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-2 py-2 text-center">
                                <RowActionsMenu label={`Thao tác NVL ${entry.item.ma_nvl || entry.itemIndex + 1}`}>
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openRoundMaterialModal(roundKey, {
                                        lineIndex: entry.lineIndex,
                                        itemIndex: entry.itemIndex
                                      })
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                                    title="Sửa NVL"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setForm(prev => ({
                                        ...prev,
                                        chi_tiet: removeMaterialFromRound(
                                          prev.chi_tiet,
                                          roundKey,
                                          entry.lineIndex,
                                          entry.itemIndex
                                        )
                                      }))
                                    }
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50"
                                    title="Xóa NVL"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                </RowActionsMenu>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {entries.length > 0 ? (
                          <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-700">
                            <tr>
                              <td colSpan={3} className="px-2 py-2 text-right">
                                Tổng
                              </td>
                              <td className="px-2 py-2 text-right font-mono font-bold text-emerald-800">
                                {formatNormWeight(
                                  sumRoundQuantity(
                                    form.chi_tiet[0]?.lan_su_dung ?? { lan_1: [] },
                                    roundKey
                                  )
                                ) || formatNormWeight(resolveRoundBatchWeight(form.chi_tiet, roundKey)) || '-'}
                              </td>
                              <td className="px-2 py-2 text-right font-mono font-bold text-[#ef1b2d]">
                                {formatNormWeight(
                                  entries.reduce((sum, entry) => sum + (entry.item.kl_thuc_te ?? 0), 0)
                                ) || '-'}
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        ) : null}
                      </table>
                      </div>
                    </>
                  )}
                  {!isCollapsed ? (
                    <>
                      <div className="relative z-20 border-t border-zinc-100 bg-white px-2 py-2 sm:px-3 sm:py-3">
                        <div className="mixing-round-meta-grid grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-2">
                          <label className="space-y-0.5">
                            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600 sm:text-[10px]">
                              Lý do
                            </span>
                            <SearchableMultiSelect
                              values={getRoundReasons(roundKey)}
                              onChange={reasons => handleRoundReasonsChange(roundKey, reasons)}
                              options={allReasonOptions}
                              placeholder="Gõ để tìm hoặc chọn lý do..."
                              inputClassName="mixing-round-reason-input min-h-8 w-full rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 sm:min-h-9 sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-xs"
                            />
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-600 sm:text-[10px]">
                              Giải trình
                            </span>
                            <textarea
                              value={form.giai_trinh_theo_lan?.[roundKey] ?? ''}
                              onChange={event => handleRoundExplanationChange(roundKey, event.target.value)}
                              rows={2}
                              placeholder="Tự điền theo lý do đã chọn"
                              className="mixing-round-explain-input min-h-[52px] w-full resize-y rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 sm:min-h-[72px] sm:rounded-lg sm:px-2 sm:py-2 sm:text-xs"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="relative z-20 border-t border-zinc-100 bg-zinc-50/50 px-2 py-2 sm:px-3 sm:py-2.5">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600 sm:text-[10px]">
                          Ảnh xác nhận {roundColumnLabel(sessionRoundStart, roundIndex).toLowerCase()}
                        </p>
                        <div className="mt-1.5 flex flex-col gap-1.5 sm:mt-2 sm:flex-row sm:items-center sm:gap-2">
                          <button
                            type="button"
                            onClick={() => pickRoundPhotos(roundKey)}
                            disabled={uploadingRoundKey === roundKey}
                            className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#ef1b2d]/30 bg-red-50 px-3 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-100 disabled:opacity-60 sm:h-10 sm:text-xs"
                          >
                            {uploadingRoundKey === roundKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImagePlus className="h-3.5 w-3.5" />
                            )}
                            {uploadingRoundKey === roundKey ? 'Đang chụp...' : 'Chụp ảnh'}
                          </button>
                        </div>
                        {roundPhotos.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
                            {roundPhotos.map((photo, photoIndex) => (
                              <div
                                key={`${roundKey}-photo-${photoIndex}`}
                                className="group relative h-12 w-12 overflow-hidden rounded-md border border-zinc-200 bg-white sm:h-14 sm:w-14 sm:rounded-lg"
                              >
                                <a href={photo.url} target="_blank" rel="noreferrer" title="Xem ảnh">
                                  <img src={photo.url} alt={`Ảnh ${roundIndex + 1}`} className="h-full w-full object-cover" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removeRoundPhoto(roundKey, photoIndex)}
                                  className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950/75 text-white opacity-0 transition group-hover:opacity-100"
                                  title="Xóa ảnh"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 hidden text-[10px] font-semibold text-zinc-400 sm:block sm:text-[11px]">
                            Bấm Chụp ảnh để mở camera · có thể chụp nhiều lần.
                          </p>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
                {isLastRound && roundComplete && canAddSessionRound ? (
                  <button
                    type="button"
                    onClick={() => applyRoundCount(displayedRoundCount + 1)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#ef1b2d]/40 bg-red-50/40 px-3 py-2.5 text-[11px] font-extrabold text-[#ef1b2d] transition hover:bg-red-50 sm:text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Đã xong {roundColumnLabel(sessionRoundStart, roundIndex)} · Thêm{' '}
                    {roundColumnLabel(sessionRoundStart, roundIndex + 1)}?
                  </button>
                ) : null}
                </React.Fragment>
              );
            })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-4 py-3">
              <div className="text-sm font-bold text-zinc-700">
                Thực tế sử dụng:{' '}
                <span className="font-black text-[#ef1b2d]">{formatNumber(computedActualUsage, 2)} kg</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700"
                >
                  Làm mới
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingId ? 'Cập nhật' : 'Lưu báo cáo'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <MixingLineFormModal
        open={lineModalOpen}
        draft={lineDraft}
        materials={materials}
        isEditing={editingLineIndex !== null}
        errorMessage={lineModalError}
        onClose={closeLineModal}
        onChange={patch => {
          setLineModalError('');
          setLineDraft(prev => ({ ...prev, ...patch }));
        }}
        onSave={saveLineDraft}
      />

      <MixingRoundItemFormModal
        open={Boolean(roundItemModal)}
        roundLabel={
          roundItemModal
            ? roundColumnLabel(sessionRoundStart, ROUND_KEYS.indexOf(roundItemModal.roundKey))
            : ''
        }
        draft={roundItemModal?.draft ?? emptyRoundItem()}
        materials={materials}
        batchWeight={
          roundItemModal ? resolveRoundBatchWeight(form.chi_tiet, roundItemModal.roundKey) : null
        }
        isEditing={Boolean(roundItemModal?.edit)}
        errorMessage={roundItemModal?.error}
        onClose={() => setRoundItemModal(null)}
        onChange={patch => {
          setRoundItemModal(prev =>
            prev ? { ...prev, error: '', draft: { ...prev.draft, ...patch } } : prev
          );
        }}
        onSave={saveRoundMaterialModal}
      />

    </>
  );

  if (modalMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-zinc-100 shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">
                {editingId ? 'Sửa báo cáo phối trộn' : 'Thêm báo cáo phối trộn'}
              </h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">
                Nhật ký sản xuất kiêm phiếu giao ca · QT-16-BM02
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{formBody}</div>
        </div>
      </div>
    );
  }

  return <div className="space-y-4 pb-24">{formBody}</div>;
}
