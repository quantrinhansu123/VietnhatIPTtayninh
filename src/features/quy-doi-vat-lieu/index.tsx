import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import {
  FilterCombobox,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination
} from '../../components/shared/table';
import { getProductionShiftOptions, normalizeShiftSettings, type ShiftSetting } from '../../utils/shiftSettings';
import { parseMaterialConversionBatch, type MaterialConversionInput } from './validation';
import {
  buildConversionMaterialOptions,
  calcConversionWeight,
  calcDestQuantity,
  calcKichThuocTong,
  formatConversionMaterial,
  formatDraftNumber,
  materialSpecs,
  parseDraftQuantity,
  resolveDestUnitWeight,
  type ConversionMaterialOption
} from './materials';

type ConversionRow = MaterialConversionInput & { id: string; nhom_id?: string | null };
type HubFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  shift?: string;
  machineCode?: string;
};

type MachineOption = { code: string; name: string };

/** Nguồn lấy (vật tư gốc). */
const NGUON_LAY_OPTIONS = ['Tồn đầu ca', 'Lấy trong kho'] as const;
/** Nguồn tới (vật tư quy đổi) — mặc định Dùng trong ca. */
const NGUON_TOI_OPTIONS = ['Dùng trong ca', 'Tồn ngoài', 'Lấy từ kho'] as const;
const DEFAULT_NGUON_TOI = 'Dùng trong ca';

type DestinationDraft = {
  key: string;
  id?: string;
  vat_tu_quy_doi: string;
  chieu_dai_quy_doi: string;
  dinh_muc: string;
  so_luong_quy_doi: string;
  ghi_chu_quy_doi: string;
  nguon_toi: string;
};

type FormDraft = {
  ngay: string;
  ca: string;
  ma_may: string;
  vat_tu_goc: string;
  so_luong_goc: string;
  chieu_dai_goc: string;
  trong_luong_tren_cai_goc: string;
  ghi_chu_goc: string;
  nguon_lay: string;
  nhom_id: string | null;
  destinations: DestinationDraft[];
};

function newDestinationDraft(partial?: Partial<DestinationDraft>): DestinationDraft {
  return {
    key: partial?.key || `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: partial?.id,
    vat_tu_quy_doi: partial?.vat_tu_quy_doi || '',
    chieu_dai_quy_doi: partial?.chieu_dai_quy_doi || '',
    dinh_muc: partial?.dinh_muc || '',
    so_luong_quy_doi: partial?.so_luong_quy_doi || '',
    ghi_chu_quy_doi: partial?.ghi_chu_quy_doi || '',
    nguon_toi: partial?.nguon_toi || DEFAULT_NGUON_TOI
  };
}

const emptyDraft = (): FormDraft => ({
  ngay: '',
  ca: '',
  ma_may: '',
  vat_tu_goc: '',
  so_luong_goc: '',
  chieu_dai_goc: '',
  trong_luong_tren_cai_goc: '',
  ghi_chu_goc: '',
  nguon_lay: '',
  nhom_id: null,
  destinations: [newDestinationDraft()]
});

function localIsoDateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function pickMachineField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-') return text;
  }
  return '';
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
        ? (data as { records: unknown[] }).records
        : [];
  const seen = new Set<string>();
  const out: MachineOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const code = pickMachineField(rec, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'ma', 'id']);
    const name = pickMachineField(rec, ['ten_may', 'may', 'machine_name', 'name', 'ten']);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: name || code });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

function draftFromFilters(filters: HubFilters): FormDraft {
  return {
    ...emptyDraft(),
    ngay: filters.dateFrom || filters.dateTo || localIsoDateToday(),
    ca: filters.shift && filters.shift !== 'all' ? filters.shift : '',
    ma_may: filters.machineCode && filters.machineCode !== 'all' ? filters.machineCode : ''
  };
}

function formatDisplayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatWeightCell(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return formatNumber(value, 6);
}

function siblingRowsFor(row: ConversionRow, all: ConversionRow[]) {
  if (row.nhom_id) return all.filter(item => item.nhom_id === row.nhom_id);
  return all.filter(
    item =>
      item.ngay === row.ngay &&
      item.ca === row.ca &&
      item.ma_may === row.ma_may &&
      item.vat_tu_goc === row.vat_tu_goc &&
      item.so_luong_goc === row.so_luong_goc
  );
}

function draftFromGroup(rows: ConversionRow[]): FormDraft {
  const first = rows[0];
  return {
    ngay: first.ngay,
    ca: first.ca,
    ma_may: first.ma_may,
    vat_tu_goc: first.vat_tu_goc,
    so_luong_goc: String(first.so_luong_goc),
    chieu_dai_goc: formatDraftNumber(first.chieu_dai_goc),
    trong_luong_tren_cai_goc: formatDraftNumber(first.trong_luong_tren_cai_goc),
    ghi_chu_goc: first.ghi_chu_goc || '',
    nguon_lay: first.nguon_lay || '',
    nhom_id: first.nhom_id || null,
    destinations: rows.map(row =>
      newDestinationDraft({
        id: row.id,
        vat_tu_quy_doi: row.vat_tu_quy_doi,
        chieu_dai_quy_doi: formatDraftNumber(row.chieu_dai_quy_doi),
        dinh_muc: formatDraftNumber(row.dinh_muc),
        so_luong_quy_doi: String(row.so_luong_quy_doi),
        ghi_chu_quy_doi: row.ghi_chu_quy_doi || '',
        nguon_toi: row.nguon_toi || DEFAULT_NGUON_TOI
      })
    )
  };
}

function recomputeDestQty(sourceQty: string, dinhMuc: string, fallbackQty: string) {
  const computed = calcDestQuantity(parseDraftQuantity(sourceQty), parseDraftQuantity(dinhMuc));
  return computed != null ? formatDraftNumber(computed) : fallbackQty;
}

function SourceMaterialTable({
  selectLabel,
  code,
  quantity,
  chieuDai,
  trongLuongTrenCai,
  ghiChu,
  nguonLay,
  material,
  materialCodes,
  materialLabel,
  disabled,
  missingInCatalog,
  onCodeChange,
  onQuantityChange,
  onChieuDaiChange,
  onTrongLuongTrenCaiChange,
  onGhiChuChange,
  onNguonLayChange
}: {
  selectLabel: string;
  code: string;
  quantity: string;
  chieuDai: string;
  trongLuongTrenCai: string;
  ghiChu: string;
  nguonLay: string;
  material: ConversionMaterialOption | undefined;
  materialCodes: string[];
  materialLabel: (code: string) => string;
  disabled: boolean;
  missingInCatalog: boolean;
  onCodeChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onChieuDaiChange: (value: string) => void;
  onTrongLuongTrenCaiChange: (value: string) => void;
  onGhiChuChange: (value: string) => void;
  onNguonLayChange: (value: string) => void;
}) {
  const qty = parseDraftQuantity(quantity);
  const specs = materialSpecs(material);
  const unitLength = parseDraftQuantity(chieuDai) ?? specs.unitLength;
  const unitWeight = parseDraftQuantity(trongLuongTrenCai) ?? specs.unitWeight;
  const totalWeight = calcConversionWeight(unitWeight, qty);
  const lengthFromCatalog = specs.unitLength != null;
  const weightFromCatalog = specs.unitWeight != null;

  return (
    <div className="min-w-0">
      <h5 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Vật tư gốc (hàng chưa cắt)</h5>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[980px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-2.5 py-2 font-semibold">Mã</th>
              <th className="px-2.5 py-2 font-semibold">Tên</th>
              <th className="px-2.5 py-2 text-right font-semibold" title="Từ Thông số Kho NVL (Chiều dài ĐV)">Chiều dài (cm)</th>
              <th className="px-2.5 py-2 text-right font-semibold" title="Từ Thông số Kho NVL (Tổng kg)">TL / cái (kg)</th>
              <th className="px-2.5 py-2 text-right font-semibold">Số lượng</th>
              <th className="px-2.5 py-2 text-right font-semibold">Tổng TL (kg)</th>
              <th className="px-2.5 py-2 font-semibold">Ghi chú</th>
              <th className="px-2.5 py-2 font-semibold">Nguồn lấy</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 align-top">
              <td className="min-w-[11rem] px-2 py-2">
                <fieldset disabled={disabled} className="min-w-0 disabled:opacity-50">
                  <FilterCombobox
                    label={selectLabel}
                    value={code || 'all'}
                    options={materialCodes}
                    includeAll={false}
                    compact
                    formatOption={materialLabel}
                    searchPlaceholder="Gõ mã hoặc tên vật tư…"
                    className="w-full"
                    buttonClassName="!h-9 w-full justify-between !rounded-md [&>span]:min-w-0 [&>span]:truncate"
                    dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
                    onChange={value => { if (!disabled) onCodeChange(value); }}
                  />
                </fieldset>
              </td>
              <td className="max-w-[12rem] px-2.5 py-2.5 text-sm text-slate-800">
                {material?.name || (code ? code : '—')}
              </td>
              <td className="w-24 px-2 py-2">
                {lengthFromCatalog ? (
                  <div
                    className="flex h-9 items-center justify-end rounded-md border border-slate-100 bg-slate-50 px-2 font-mono text-sm text-slate-800"
                    title="Tự lấy từ Chiều dài ĐV · Kho NVL"
                  >
                    {formatWeightCell(unitLength)}
                  </div>
                ) : (
                  <input
                    disabled={disabled}
                    inputMode="decimal"
                    value={chieuDai}
                    onChange={event => onChieuDaiChange(event.target.value)}
                    placeholder="—"
                    className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                  />
                )}
              </td>
              <td className="w-28 px-2 py-2">
                {weightFromCatalog ? (
                  <div
                    className="flex h-9 items-center justify-end rounded-md border border-slate-100 bg-slate-50 px-2 font-mono text-sm text-slate-800"
                    title="Tự lấy từ Tổng kg · Kho NVL"
                  >
                    {formatWeightCell(unitWeight)}
                  </div>
                ) : (
                  <input
                    disabled={disabled}
                    inputMode="decimal"
                    value={trongLuongTrenCai}
                    onChange={event => onTrongLuongTrenCaiChange(event.target.value)}
                    placeholder="—"
                    className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                  />
                )}
              </td>
              <td className="w-24 px-2 py-2">
                <input
                  required
                  disabled={disabled}
                  inputMode="decimal"
                  value={quantity}
                  onChange={event => onQuantityChange(event.target.value)}
                  className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                />
              </td>
              <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm font-semibold text-slate-900">
                {formatWeightCell(totalWeight)}
              </td>
              <td className="min-w-[8rem] px-2 py-2">
                <input
                  disabled={disabled}
                  value={ghiChu}
                  onChange={event => onGhiChuChange(event.target.value)}
                  placeholder="Ống nguyên…"
                  className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:opacity-50"
                />
              </td>
              <td className="min-w-[8rem] px-2 py-2">
                <select
                  disabled={disabled}
                  value={nguonLay}
                  onChange={event => onNguonLayChange(event.target.value)}
                  className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:opacity-50"
                >
                  <option value="">—</option>
                  {NGUON_LAY_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {missingInCatalog && (
        <p className="mt-1 text-xs text-amber-700">Mã cũ không còn trong Kho NVL. Vui lòng chọn lại.</p>
      )}
    </div>
  );
}

function DestinationMaterialTable({
  selectLabel,
  destinations,
  sourceQty,
  sourceLength,
  sourceUnitWeight,
  materialByCode,
  materialCodes,
  materialLabel,
  disabled,
  canAdd,
  onAdd,
  onRemove,
  onCodeChange,
  onChieuDaiChange,
  onDinhMucChange,
  onQuantityChange,
  onGhiChuChange,
  onNguonToiChange
}: {
  selectLabel: string;
  destinations: DestinationDraft[];
  sourceQty: string;
  sourceLength: string;
  sourceUnitWeight: string;
  materialByCode: Map<string, ConversionMaterialOption>;
  materialCodes: string[];
  materialLabel: (code: string) => string;
  disabled: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onCodeChange: (key: string, value: string) => void;
  onChieuDaiChange: (key: string, value: string) => void;
  onDinhMucChange: (key: string, value: string) => void;
  onQuantityChange: (key: string, value: string) => void;
  onGhiChuChange: (key: string, value: string) => void;
  onNguonToiChange: (key: string, value: string) => void;
}) {
  const srcLen = parseDraftQuantity(sourceLength);
  const srcWeight = parseDraftQuantity(sourceUnitWeight);
  const sumKichThuoc = destinations.reduce((sum, item) => {
    const kt = calcKichThuocTong(parseDraftQuantity(item.chieu_dai_quy_doi), parseDraftQuantity(item.dinh_muc));
    return sum + (kt ?? 0);
  }, 0);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-xs font-bold uppercase tracking-wide text-slate-700">Vật tư quy đổi (hàng sau cắt)</h5>
        {canAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm đích
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="px-2.5 py-2 font-semibold">Mã</th>
              <th className="px-2.5 py-2 font-semibold">Tên</th>
              <th className="px-2.5 py-2 text-right font-semibold">Chiều dài (cm)</th>
              <th className="px-2.5 py-2 text-right font-semibold" title="Số lượng đích cắt từ 1 cái gốc">ĐM</th>
              <th className="px-2.5 py-2 text-right font-semibold" title="Chiều dài × ĐM">KT tổng</th>
              <th className="px-2.5 py-2 text-right font-semibold">TL / cái</th>
              <th className="px-2.5 py-2 text-right font-semibold">Số lượng</th>
              <th className="px-2.5 py-2 text-right font-semibold">Tổng TL</th>
              <th className="px-2.5 py-2 font-semibold">Ghi chú</th>
              <th className="px-2.5 py-2 font-semibold">Nguồn tới</th>
              <th className="px-2.5 py-2 text-center font-semibold"> </th>
            </tr>
          </thead>
          <tbody>
            {destinations.map(destination => {
              const material = materialByCode.get(destination.vat_tu_quy_doi);
              const specs = materialSpecs(material);
              const destLen = parseDraftQuantity(destination.chieu_dai_quy_doi) ?? specs.unitLength;
              const dinhMuc = parseDraftQuantity(destination.dinh_muc);
              const qty = parseDraftQuantity(destination.so_luong_quy_doi);
              const unitWeight = resolveDestUnitWeight({
                catalogWeight: specs.unitWeight,
                sourceWeight: srcWeight,
                sourceLength: srcLen,
                destLength: destLen
              });
              const kichThuocTong = calcKichThuocTong(destLen, dinhMuc);
              const totalWeight = calcConversionWeight(unitWeight, qty);
              const lengthFromCatalog = specs.unitLength != null;
              const missing =
                Boolean(destination.vat_tu_quy_doi) && !materialByCode.has(destination.vat_tu_quy_doi);
              return (
                <tr key={destination.key} className="border-t border-slate-100 align-top">
                  <td className="min-w-[10rem] px-2 py-2">
                    <fieldset disabled={disabled} className="min-w-0 disabled:opacity-50">
                      <FilterCombobox
                        label={selectLabel}
                        value={destination.vat_tu_quy_doi || 'all'}
                        options={materialCodes}
                        includeAll={false}
                        compact
                        formatOption={materialLabel}
                        searchPlaceholder="Gõ mã hoặc tên vật tư…"
                        className="w-full"
                        buttonClassName="!h-9 w-full justify-between !rounded-md [&>span]:min-w-0 [&>span]:truncate"
                        dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
                        onChange={value => { if (!disabled) onCodeChange(destination.key, value); }}
                      />
                    </fieldset>
                    {missing && (
                      <p className="mt-1 text-[11px] text-amber-700">Mã cũ không còn trong Kho NVL.</p>
                    )}
                  </td>
                  <td className="max-w-[10rem] px-2.5 py-2.5 text-sm text-slate-800">
                    {material?.name || (destination.vat_tu_quy_doi ? destination.vat_tu_quy_doi : '—')}
                  </td>
                  <td className="w-20 px-2 py-2">
                    {lengthFromCatalog ? (
                      <div
                        className="flex h-9 items-center justify-end rounded-md border border-slate-100 bg-slate-50 px-2 font-mono text-sm text-slate-800"
                        title="Tự lấy từ Chiều dài ĐV · Kho NVL"
                      >
                        {formatWeightCell(destLen)}
                      </div>
                    ) : (
                      <input
                        disabled={disabled}
                        inputMode="decimal"
                        value={destination.chieu_dai_quy_doi}
                        onChange={event => onChieuDaiChange(destination.key, event.target.value)}
                        placeholder="—"
                        className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                      />
                    )}
                  </td>
                  <td className="w-16 px-2 py-2">
                    <input
                      disabled={disabled}
                      inputMode="decimal"
                      value={destination.dinh_muc}
                      onChange={event => onDinhMucChange(destination.key, event.target.value)}
                      title={`SL = ${sourceQty || '?'} × ĐM`}
                      className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm text-slate-800">
                    {formatWeightCell(kichThuocTong)}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm text-slate-800">
                    {formatWeightCell(unitWeight)}
                  </td>
                  <td className="w-24 px-2 py-2">
                    <input
                      required
                      disabled={disabled}
                      inputMode="decimal"
                      value={destination.so_luong_quy_doi}
                      onChange={event => onQuantityChange(destination.key, event.target.value)}
                      className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-sm font-semibold text-slate-900">
                    {formatWeightCell(totalWeight)}
                  </td>
                  <td className="min-w-[7rem] px-2 py-2">
                    <input
                      disabled={disabled}
                      value={destination.ghi_chu_quy_doi}
                      onChange={event => onGhiChuChange(destination.key, event.target.value)}
                      placeholder="Lõi tận dụng…"
                      className="block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm disabled:opacity-50"
                    />
                  </td>
                  <td className="min-w-[7rem] px-2 py-2">
                    <select
                      required
                      disabled={disabled}
                      value={destination.nguon_toi}
                      onChange={event => onNguonToiChange(destination.key, event.target.value)}
                      className={`block h-9 w-full rounded-md border bg-white px-2 text-sm disabled:opacity-50 ${
                        destination.nguon_toi ? 'border-slate-200' : 'border-amber-400'
                      }`}
                      title="Mặc định: Dùng trong ca"
                    >
                      {NGUON_TOI_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      disabled={disabled || destinations.length <= 1}
                      onClick={() => onRemove(destination.key)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-red-600 disabled:opacity-40"
                      title="Xóa dòng đích"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        ĐM = SL đích / 1 cái gốc · SL đích tự = SL gốc × ĐM · KT tổng = chiều dài × ĐM.
        {srcLen != null && srcLen > 0 ? (
          <span className={Math.abs(sumKichThuoc - srcLen) > 0.01 ? ' ml-1 font-semibold text-amber-700' : ' ml-1'}>
            Σ KT tổng = {formatNumber(sumKichThuoc, 4)} cm {Math.abs(sumKichThuoc - srcLen) > 0.01 ? `(khác chiều dài gốc ${formatNumber(srcLen, 4)} cm)` : '(khớp chiều dài gốc)'}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export default function MaterialConversionPanel({
  search = '',
  initialFilters
}: {
  search?: string;
  initialFilters?: HubFilters;
}) {
  const filters = useMemo<HubFilters>(
    () => ({
      search: initialFilters?.search ?? search,
      dateFrom: initialFilters?.dateFrom || '',
      dateTo: initialFilters?.dateTo || '',
      shift: initialFilters?.shift || '',
      machineCode: initialFilters?.machineCode || ''
    }),
    [initialFilters, search]
  );
  const { canCreate, canEdit, canDelete } = useTabAccess('report-lists');
  const [rows, setRows] = useState<ConversionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [editingNhomId, setEditingNhomId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<FormDraft>(() => draftFromFilters(filters));
  const [materials, setMaterials] = useState<ConversionMaterialOption[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState('');
  const [materialsRevision, setMaterialsRevision] = useState(0);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const materialByCode = useMemo(() => new Map(materials.map(item => [item.code, item])), [materials]);
  // Chỉ cho chọn mã ống (ONG-…) ở cả vật tư gốc và vật tư quy đổi; materialByCode vẫn giữ đủ để hiển thị phiếu cũ.
  const materialCodes = useMemo(
    () => materials.filter(item => /^ong[-_\s.]/i.test(item.code.trim())).map(item => item.code),
    [materials]
  );
  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const machineCodes = useMemo(() => machines.map(item => item.code), [machines]);
  const materialLabel = (code: string) => {
    const option = materialByCode.get(code);
    return option ? formatConversionMaterial(option) : code;
  };
  const machineLabel = (code: string) => {
    const found = machines.find(item => item.code === code);
    if (!found) return code;
    return found.name && found.name !== found.code ? `${found.code} · ${found.name}` : found.code;
  };
  const shiftLabel = (code: string) => shiftOptions.find(item => item.value === code)?.label || code;

  useEffect(() => {
    const controller = new AbortController();
    setMaterialsLoading(true);
    setMaterialsError('');
    void (async () => {
      try {
        const res = await fetch('/api/kho-nvl?light=1', { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Không thể tải danh mục Kho NVL.');
        if (!Array.isArray(data.materials)) throw new Error('Dữ liệu danh mục Kho NVL không hợp lệ.');
        if (!controller.signal.aborted) setMaterials(buildConversionMaterialOptions(data));
      } catch (err) {
        if (!controller.signal.aborted) {
          setMaterials([]);
          setMaterialsError(err instanceof Error ? err.message : 'Không thể tải danh mục Kho NVL.');
        }
      } finally {
        if (!controller.signal.aborted) setMaterialsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [materialsRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    void (async () => {
      try {
        const [settingsRes, machinesRes] = await Promise.all([
          fetch('/api/cai-dat', { signal: controller.signal }),
          fetch('/api/danh-sach-may', { signal: controller.signal })
        ]);
        const [settingsData, machinesData] = await Promise.all([
          settingsRes.json().catch(() => ({})),
          machinesRes.json().catch(() => ({}))
        ]);
        if (controller.signal.aborted) return;
        if (settingsRes.ok) setShiftSettings(normalizeShiftSettings(settingsData));
        if (machinesRes.ok) setMachines(normalizeMachines(machinesData));
      } catch {
        if (!controller.signal.aborted) {
          setShiftSettings([]);
          setMachines([]);
        }
      } finally {
        if (!controller.signal.aborted) setOptionsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => { setPage(1); }, [filters.search, filters.dateFrom, filters.dateTo, filters.shift, filters.machineCode]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const params = new URLSearchParams({ search: filters.search || '', page: String(page) });
        if (filters.dateFrom) params.set('tu_ngay', filters.dateFrom);
        if (filters.dateTo) params.set('den_ngay', filters.dateTo);
        if (filters.shift && filters.shift !== 'all') params.set('ca', filters.shift);
        if (filters.machineCode && filters.machineCode !== 'all') params.set('ma_may', filters.machineCode);
        const res = await fetch(`/api/quy-doi-vat-lieu?${params}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể tải quy đổi vật liệu.');
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(data.total / 50));
        if (page > lastPage) { setPage(lastPage); return; }
        setRows(data.records);
        setTotal(data.total);
      } catch (err) {
        if (!controller.signal.aborted) { setRows([]); setTotal(0); setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu.'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [filters, page, revision]);

  const resetForm = () => {
    setShowForm(false);
    setEditingNhomId(null);
    setEditingIds([]);
    setDraft(draftFromFilters(filters));
  };

  const openEdit = async (row: ConversionRow) => {
    setError('');
    let group = siblingRowsFor(row, rows);
    if (row.nhom_id) {
      try {
        const res = await fetch(`/api/quy-doi-vat-lieu?nhom_id=${encodeURIComponent(row.nhom_id)}&page=1`);
        const data = await res.json();
        if (res.ok && Array.isArray(data.records) && data.records.length > 0) {
          group = data.records as ConversionRow[];
        }
      } catch {
        // Giữ nhóm từ trang hiện tại nếu tải theo nhom_id thất bại.
      }
    }
    setEditingNhomId(row.nhom_id || null);
    setEditingIds(group.map(item => item.id));
    setDraft(draftFromGroup(group));
    setShowForm(true);
  };

  const applySourceCode = (code: string) => {
    const specs = materialSpecs(materialByCode.get(code));
    setDraft(prev => ({
      ...prev,
      vat_tu_goc: code,
      chieu_dai_goc: formatDraftNumber(specs.unitLength),
      trong_luong_tren_cai_goc: formatDraftNumber(specs.unitWeight),
      destinations: prev.destinations.map(item => ({
        ...item,
        so_luong_quy_doi: recomputeDestQty(prev.so_luong_goc, item.dinh_muc, item.so_luong_quy_doi)
      }))
    }));
  };

  const applySourceQuantity = (value: string) => {
    setDraft(prev => ({
      ...prev,
      so_luong_goc: value,
      destinations: prev.destinations.map(item => ({
        ...item,
        so_luong_quy_doi: recomputeDestQty(value, item.dinh_muc, item.so_luong_quy_doi)
      }))
    }));
  };

  const applyDestCode = (key: string, code: string) => {
    const specs = materialSpecs(materialByCode.get(code));
    setDraft(prev => ({
      ...prev,
      destinations: prev.destinations.map(item => {
        if (item.key !== key) return item;
        return {
          ...item,
          vat_tu_quy_doi: code,
          chieu_dai_quy_doi: formatDraftNumber(specs.unitLength)
        };
      })
    }));
  };

  const applyDinhMuc = (key: string, value: string) => {
    setDraft(prev => ({
      ...prev,
      destinations: prev.destinations.map(item => {
        if (item.key !== key) return item;
        return {
          ...item,
          dinh_muc: value,
          so_luong_quy_doi: recomputeDestQty(prev.so_luong_goc, value, item.so_luong_quy_doi)
        };
      })
    }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || (editingIds.length > 0 ? !canEdit : !canCreate)) return;
    if (!draft.ngay) {
      setError('Chọn Ngày trước khi lưu.');
      return;
    }
    if (!draft.ca || draft.ca === 'all') {
      setError('Chọn Ca trước khi lưu.');
      return;
    }
    if (!draft.ma_may || draft.ma_may === 'all') {
      setError('Chọn Máy trước khi lưu.');
      return;
    }
    if (materialsLoading || materialsError || !materialByCode.has(draft.vat_tu_goc)) {
      setError('Vui lòng chọn Vật tư gốc từ danh mục Kho NVL.');
      return;
    }
    if (draft.destinations.some(item => !materialByCode.has(item.vat_tu_quy_doi))) {
      setError('Vui lòng chọn đủ Vật tư quy đổi từ danh mục Kho NVL.');
      return;
    }
    if (draft.destinations.some(item => !item.nguon_toi)) {
      setError('Chọn Nguồn tới cho từng mã đích (mặc định: Dùng trong ca).');
      return;
    }
    const sourceSpecs = materialSpecs(materialByCode.get(draft.vat_tu_goc));
    const srcLen = parseDraftQuantity(draft.chieu_dai_goc) ?? sourceSpecs.unitLength;
    const srcUnitWeight = parseDraftQuantity(draft.trong_luong_tren_cai_goc) ?? sourceSpecs.unitWeight;
    const srcQty = parseDraftQuantity(draft.so_luong_goc);
    const payload = {
      ngay: draft.ngay,
      ca: draft.ca,
      ma_may: draft.ma_may,
      vat_tu_goc: draft.vat_tu_goc,
      so_luong_goc: draft.so_luong_goc,
      chieu_dai_goc: srcLen,
      trong_luong_tren_cai_goc: srcUnitWeight,
      ghi_chu_goc: draft.ghi_chu_goc || null,
      khoi_luong_goc: calcConversionWeight(srcUnitWeight, srcQty),
      nguon_lay: draft.nguon_lay || null,
      nhom_id: editingNhomId || draft.nhom_id || undefined,
      destinations: draft.destinations.map(item => {
        const destSpecs = materialSpecs(materialByCode.get(item.vat_tu_quy_doi));
        const destLen = parseDraftQuantity(item.chieu_dai_quy_doi) ?? destSpecs.unitLength;
        const dinhMuc = parseDraftQuantity(item.dinh_muc);
        const qty = parseDraftQuantity(item.so_luong_quy_doi);
        const unitWeight = resolveDestUnitWeight({
          catalogWeight: destSpecs.unitWeight,
          sourceWeight: srcUnitWeight,
          sourceLength: srcLen,
          destLength: destLen
        });
        return {
          id: item.id,
          vat_tu_quy_doi: item.vat_tu_quy_doi,
          chieu_dai_quy_doi: destLen,
          dinh_muc: item.dinh_muc || null,
          kich_thuoc_tong: calcKichThuocTong(destLen, dinhMuc),
          trong_luong_tren_cai_quy_doi: unitWeight,
          so_luong_quy_doi: item.so_luong_quy_doi,
          khoi_luong_quy_doi: calcConversionWeight(unitWeight, qty),
          ghi_chu_quy_doi: item.ghi_chu_quy_doi || null,
          nguon_toi: item.nguon_toi || null
        };
      })
    };
    const input = parseMaterialConversionBatch(payload);
    if (!input) {
      setError('Nhập đủ Ngày · Ca · Máy, vật tư gốc và ít nhất một đích (số lượng > 0, không trùng mã).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const isEdit = Boolean(editingNhomId) || editingIds.length > 0;
      let res: Response;
      if (editingNhomId) {
        res = await fetch(`/api/quy-doi-vat-lieu/nhom/${editingNhomId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
      } else if (isEdit && editingIds.length === 1 && input.destinations.length === 1) {
        const first = input.destinations[0];
        res = await fetch(`/api/quy-doi-vat-lieu/${editingIds[0]}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ngay: input.ngay,
            ca: input.ca,
            ma_may: input.ma_may,
            vat_tu_goc: input.vat_tu_goc,
            so_luong_goc: input.so_luong_goc,
            khoi_luong_goc: input.khoi_luong_goc,
            chieu_dai_goc: input.chieu_dai_goc,
            trong_luong_tren_cai_goc: input.trong_luong_tren_cai_goc,
            ghi_chu_goc: input.ghi_chu_goc,
            nguon_lay: input.nguon_lay,
            vat_tu_quy_doi: first.vat_tu_quy_doi,
            so_luong_quy_doi: first.so_luong_quy_doi,
            khoi_luong_quy_doi: first.khoi_luong_quy_doi,
            chieu_dai_quy_doi: first.chieu_dai_quy_doi,
            dinh_muc: first.dinh_muc,
            kich_thuoc_tong: first.kich_thuoc_tong,
            trong_luong_tren_cai_quy_doi: first.trong_luong_tren_cai_quy_doi,
            ghi_chu_quy_doi: first.ghi_chu_quy_doi,
            nguon_toi: first.nguon_toi
          })
        });
      } else if (isEdit) {
        for (const id of editingIds) {
          const del = await fetch(`/api/quy-doi-vat-lieu/${id}`, { method: 'DELETE' });
          const delData = await del.json().catch(() => ({}));
          if (!del.ok) throw new Error(delData.error || 'Không thể cập nhật nhóm quy đổi cũ.');
        }
        res = await fetch('/api/quy-doi-vat-lieu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
      } else {
        res = await fetch('/api/quy-doi-vat-lieu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể lưu quy đổi.');
      resetForm();
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi lưu dữ liệu.'); }
    finally { setBusy(false); }
  };

  const removeRow = async (row: ConversionRow) => {
    const group = siblingRowsFor(row, rows);
    const label =
      group.length > 1
        ? `Xóa cả nhóm ${row.vat_tu_goc} → ${group.length} đích (${formatDisplayDate(row.ngay)} · ${row.ca} · ${row.ma_may})?`
        : `Xóa quy đổi ${row.vat_tu_goc} → ${row.vat_tu_quy_doi} (${formatDisplayDate(row.ngay)} · ${row.ca} · ${row.ma_may})?`;
    if (busy || !canDelete || !window.confirm(label)) return;
    setBusy(true); setError('');
    try {
      if (row.nhom_id && group.length > 1) {
        const res = await fetch(`/api/quy-doi-vat-lieu/nhom/${row.nhom_id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể xóa nhóm quy đổi.');
      } else {
        const res = await fetch(`/api/quy-doi-vat-lieu/${row.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không thể xóa quy đổi.');
      }
      if (editingIds.includes(row.id) || (row.nhom_id && editingNhomId === row.nhom_id)) resetForm();
      setRevision(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Lỗi xóa dữ liệu.'); }
    finally { setBusy(false); }
  };

  const buttonClass = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-50';
  const missingCa = !draft.ca || draft.ca === 'all';
  const missingMay = !draft.ma_may || draft.ma_may === 'all';
  const missingSource = !materialByCode.has(draft.vat_tu_goc);
  const missingDest = draft.destinations.some(item => !materialByCode.has(item.vat_tu_quy_doi));
  const missingNguonToi = draft.destinations.some(item => !item.nguon_toi);
  const saveHint = missingCa
    ? 'Thiếu Ca — chọn Ca ở hàng trên rồi bấm Lưu.'
    : missingMay
      ? 'Thiếu Máy — chọn Máy ở hàng trên rồi bấm Lưu.'
      : !draft.ngay
        ? 'Thiếu Ngày — chọn Ngày rồi bấm Lưu.'
        : missingSource
          ? 'Chọn Vật tư gốc từ danh mục Kho NVL.'
          : missingDest
            ? 'Chọn đủ Vật tư quy đổi từ danh mục Kho NVL.'
            : missingNguonToi
              ? 'Chọn Nguồn tới từng dòng đích (mặc định: Dùng trong ca).'
              : '';

  const groupedList = useMemo(() => {
    const map = new Map<string, ConversionRow[]>();
    for (const row of rows) {
      const key = row.nhom_id || `solo:${row.id}`;
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.values()];
  }, [rows]);

  return <section className="space-y-3 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><ArrowLeftRight className="h-5 w-5" />Cắt Lõi</h3>
        <p className="mt-1 text-xs text-slate-500">Phiếu cắt lõi 1 nguồn → nhiều đích: chiều dài · ĐM · TL/cái · ghi chú; gắn Ngày · Ca · Máy; không tự đổi tồn kho.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={loading || busy} className={buttonClass} onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-4 w-4" />Tải lại</button>
        {canCreate && <button type="button" disabled={busy} className={`${buttonClass} bg-emerald-600 text-white`} onClick={() => { setDraft(draftFromFilters(filters)); setEditingNhomId(null); setEditingIds([]); setShowForm(true); setError(''); }}><Plus className="h-4 w-4" />Thêm cắt lõi</button>}
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {materialsError && <div role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {materialsError}<button type="button" className={buttonClass} onClick={() => setMaterialsRevision(value => value + 1)}>Tải lại Kho NVL</button>
    </div>}
    {showForm && <form onSubmit={save} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h4 className="mb-3 text-sm font-bold">{editingIds.length > 0 ? 'Sửa quy đổi' : 'Thêm quy đổi'}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TableDateFilter
          label="Ngày"
          value={draft.ngay}
          onChange={ngay => setDraft(prev => ({ ...prev, ngay }))}
          className="h-10 rounded-lg"
        />
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span className={missingCa ? 'text-rose-700' : undefined}>Ca *</span>
          <fieldset disabled={busy || optionsLoading} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox
              label={optionsLoading ? 'Đang tải ca…' : 'Chọn ca'}
              value={draft.ca || 'all'}
              options={shiftOptions.map(item => item.value)}
              includeAll={false}
              compact
              formatOption={shiftLabel}
              className="w-full"
              buttonClassName={`!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate ${missingCa ? '!border-rose-400 !bg-rose-50' : ''}`}
              onChange={value => { if (!busy && !optionsLoading) setDraft(prev => ({ ...prev, ca: value })); }}
            />
          </fieldset>
        </div>
        <div className="min-w-0 text-xs font-semibold text-slate-700">
          <span className={missingMay ? 'text-rose-700' : undefined}>Máy *</span>
          <fieldset disabled={busy || optionsLoading} className="mt-1 min-w-0 disabled:opacity-50">
            <FilterCombobox
              label={optionsLoading ? 'Đang tải máy…' : 'Chọn máy'}
              value={draft.ma_may || 'all'}
              options={machineCodes}
              includeAll={false}
              compact
              formatOption={machineLabel}
              searchPlaceholder="Gõ mã hoặc tên máy…"
              className="w-full"
              buttonClassName={`!h-10 w-full justify-between !rounded-lg [&>span]:min-w-0 [&>span]:truncate ${missingMay ? '!border-rose-400 !bg-rose-50' : ''}`}
              dropdownWidth="w-max max-w-[min(36rem,calc(100vw-1rem))]"
              onChange={value => { if (!busy && !optionsLoading) setDraft(prev => ({ ...prev, ma_may: value })); }}
            />
          </fieldset>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <SourceMaterialTable
          selectLabel={materialsLoading ? 'Đang tải Kho NVL…' : 'Chọn vật tư gốc'}
          code={draft.vat_tu_goc}
          quantity={draft.so_luong_goc}
          chieuDai={draft.chieu_dai_goc}
          trongLuongTrenCai={draft.trong_luong_tren_cai_goc}
          ghiChu={draft.ghi_chu_goc}
          nguonLay={draft.nguon_lay}
          material={materialByCode.get(draft.vat_tu_goc)}
          materialCodes={materialCodes}
          materialLabel={materialLabel}
          disabled={busy || materialsLoading || Boolean(materialsError)}
          missingInCatalog={Boolean(draft.vat_tu_goc && !materialsLoading && !materialsError && !materialByCode.has(draft.vat_tu_goc))}
          onCodeChange={value => { if (!busy && !materialsLoading && !materialsError) applySourceCode(value); }}
          onQuantityChange={applySourceQuantity}
          onChieuDaiChange={value => setDraft(prev => ({ ...prev, chieu_dai_goc: value }))}
          onTrongLuongTrenCaiChange={value => setDraft(prev => ({ ...prev, trong_luong_tren_cai_goc: value }))}
          onGhiChuChange={value => setDraft(prev => ({ ...prev, ghi_chu_goc: value }))}
          onNguonLayChange={value => setDraft(prev => ({ ...prev, nguon_lay: value }))}
        />
        <DestinationMaterialTable
          selectLabel={materialsLoading ? 'Đang tải Kho NVL…' : 'Chọn vật tư quy đổi'}
          destinations={draft.destinations}
          sourceQty={draft.so_luong_goc}
          sourceLength={draft.chieu_dai_goc}
          sourceUnitWeight={draft.trong_luong_tren_cai_goc}
          materialByCode={materialByCode}
          materialCodes={materialCodes}
          materialLabel={materialLabel}
          disabled={busy || materialsLoading || Boolean(materialsError)}
          canAdd={canCreate || canEdit}
          onAdd={() => setDraft(prev => ({ ...prev, destinations: [...prev.destinations, newDestinationDraft()] }))}
          onRemove={key => setDraft(prev => ({
            ...prev,
            destinations: prev.destinations.length <= 1
              ? prev.destinations
              : prev.destinations.filter(item => item.key !== key)
          }))}
          onCodeChange={applyDestCode}
          onChieuDaiChange={(key, value) => setDraft(prev => ({
            ...prev,
            destinations: prev.destinations.map(item => item.key === key ? { ...item, chieu_dai_quy_doi: value } : item)
          }))}
          onDinhMucChange={applyDinhMuc}
          onQuantityChange={(key, value) => setDraft(prev => ({
            ...prev,
            destinations: prev.destinations.map(item => item.key === key ? { ...item, so_luong_quy_doi: value } : item)
          }))}
          onGhiChuChange={(key, value) => setDraft(prev => ({
            ...prev,
            destinations: prev.destinations.map(item => item.key === key ? { ...item, ghi_chu_quy_doi: value } : item)
          }))}
          onNguonToiChange={(key, value) => setDraft(prev => ({
            ...prev,
            destinations: prev.destinations.map(item => item.key === key ? { ...item, nguon_toi: value } : item)
          }))}
        />
      </div>
      {!materialsLoading && !materialsError && materials.length === 0 && <p className="mt-2 text-amber-700 text-xs">Kho NVL chưa có vật tư.</p>}
      {saveHint ? <p className="mt-2 text-xs font-semibold text-rose-700">{saveHint}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={busy} className={buttonClass} onClick={resetForm}><X className="h-4 w-4" />Hủy</button>
        <button
          type="submit"
          disabled={busy || materialsLoading || Boolean(materialsError) || optionsLoading}
          className={`${buttonClass} bg-emerald-600 text-white`}
          title={saveHint || 'Lưu quy đổi'}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Lưu
        </button>
      </div>
    </form>}
    <TableShell minWidthClassName="min-w-[1480px]" footer={<TablePagination totalRecords={total} currentPage={page} totalPages={Math.max(1, Math.ceil(total / 50))} pageSize={50} pageSizeOptions={[50]} onPageSizeChange={() => {}} onPageChange={setPage} />}>
      <TableHead>
        <TableHeadCell>Ngày</TableHeadCell>
        <TableHeadCell>Ca</TableHeadCell>
        <TableHeadCell>Máy</TableHeadCell>
        <TableHeadCell>Vật tư gốc</TableHeadCell>
        <TableHeadCell align="right">Dài gốc</TableHeadCell>
        <TableHeadCell>Nguồn lấy</TableHeadCell>
        <TableHeadCell align="right">SL gốc</TableHeadCell>
        <TableHeadCell align="right">TL gốc</TableHeadCell>
        <TableHeadCell>Vật tư quy đổi</TableHeadCell>
        <TableHeadCell align="right">ĐM</TableHeadCell>
        <TableHeadCell align="right">Dài đích</TableHeadCell>
        <TableHeadCell>Nguồn tới</TableHeadCell>
        <TableHeadCell align="right">SL đích</TableHeadCell>
        <TableHeadCell align="right">TL đích</TableHeadCell>
        <TableHeadCell align="center">Thao tác</TableHeadCell>
      </TableHead>
      <TableBody>{loading ? <TableEmptyRow colSpan={15}>Đang tải…</TableEmptyRow> : groupedList.length === 0 ? <TableEmptyRow colSpan={15}>Chưa có quy đổi khớp bộ lọc Ngày · Ca · Máy.</TableEmptyRow> : groupedList.flatMap(group => {
        const first = group[0];
        return group.map((row, index) => (
          <TableRow key={row.id}>
            <td className="px-3 py-3 text-sm whitespace-nowrap">{index === 0 ? formatDisplayDate(row.ngay) : ''}</td>
            <td className="px-3 py-3 text-sm whitespace-nowrap">{index === 0 ? shiftLabel(row.ca) : ''}</td>
            <td className="px-3 py-3 text-sm whitespace-nowrap">{index === 0 ? machineLabel(row.ma_may) : ''}</td>
            <td className="px-3 py-3 text-sm">{index === 0 ? materialLabel(row.vat_tu_goc) : ''}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">
              {index === 0 ? formatWeightCell(row.chieu_dai_goc) : ''}
            </td>
            <td className="px-3 py-3 text-sm whitespace-nowrap">{index === 0 ? (row.nguon_lay || '—') : ''}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">{index === 0 ? formatNumber(row.so_luong_goc, 6) : ''}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">
              {index === 0
                ? (row.khoi_luong_goc != null && Number.isFinite(row.khoi_luong_goc)
                  ? formatNumber(row.khoi_luong_goc, 6)
                  : '—')
                : ''}
            </td>
            <td className="px-3 py-3 text-sm">{materialLabel(row.vat_tu_quy_doi)}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">{formatWeightCell(row.dinh_muc)}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">{formatWeightCell(row.chieu_dai_quy_doi)}</td>
            <td className="px-3 py-3 text-sm whitespace-nowrap">{row.nguon_toi || '—'}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">{formatNumber(row.so_luong_quy_doi, 6)}</td>
            <td className="px-3 py-3 text-right font-mono text-sm">
              {row.khoi_luong_quy_doi != null && Number.isFinite(row.khoi_luong_quy_doi)
                ? formatNumber(row.khoi_luong_quy_doi, 6)
                : '—'}
            </td>
            <td className="px-3 py-3 text-center">
              {index === 0 ? (
                <div className="inline-flex gap-2">
                  {canEdit && <button type="button" disabled={busy} className={buttonClass} onClick={() => void openEdit(first)}><Pencil className="h-3 w-3" />Sửa</button>}
                  {canDelete && <button type="button" disabled={busy} className={`${buttonClass} text-red-600`} onClick={() => void removeRow(first)}><Trash2 className="h-3 w-3" />Xóa</button>}
                </div>
              ) : null}
            </td>
          </TableRow>
        ));
      })}</TableBody>
    </TableShell>
  </section>;
}
