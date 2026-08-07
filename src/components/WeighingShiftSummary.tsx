import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Trash2
} from 'lucide-react';
import WeighingReportForm from './WeighingReportForm';
import WeighingImagePreviewModal, {
  WeighingImageThumbnail,
  type WeighingPreviewImage
} from './WeighingImagePreviewModal';
import { FACTORY_PLACEHOLDER } from './layout/constants';
import { WeighingSlipPrintBatch, type WeighingSlipPrintData } from './WeighingSlipPrintSheet';
import { RowActionsMenu } from './shared/table';
import { DEFAULT_WEIGHING_SLIP_CONFIG, type WeighingSlipConfig } from '../lib/weighingSlipConfig';
import { useTabAccess } from '../app/useTabAccess';
import { waitForPrintImagesReady } from '../utils/printReady';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  resolveShiftName,
  type ShiftOption,
  type ShiftSetting
} from '../utils/shiftSettings';
import {
  countWeighingRounds,
  damagedGoodsMaterialTypeLabel,
  formatDamagedGoodsRowTotalWeight,
  formatWeighingRowTotalWeight,
  formatWeighingNetWeight,
  formatWeighingWeightField,
  getWeighingDataRows,
  isDamagedOtherMaterial,
  normalizeWeighingRecords,
  parseWeighRoundNumber,
  slipKey,
  type WeighingPendingAdd,
  type WeighingRecord
} from '../utils/weighingRecords';

function isRealMachineName(name?: string) {
  const value = String(name ?? '').trim();
  return Boolean(value) && value !== FACTORY_PLACEHOLDER;
}

function resolveMachineName(...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (isRealMachineName(candidate)) {
      return String(candidate).trim();
    }
  }
  return '—';
}

interface WeighingSlip {
  key: string;
  documentNo: string;
  reportDate: string;
  productionDate: string;
  shiftName: string;
  worker1: string;
  worker2: string;
  machineName: string;
  rows: WeighingRecord[];
}

function formatDateVi(value: string) {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

interface ShiftDateGroup {
  shiftKey: string;
  shiftLabel: string;
  slips: WeighingSlip[];
  slipCount: number;
  totalWeighRounds: number;
}

interface DateGroup {
  date: string;
  shiftGroups: ShiftDateGroup[];
  slipCount: number;
  totalWeighRounds: number;
}

interface WeighingRoundEntry {
  slip: WeighingSlip;
  row: WeighingRecord;
}

interface WeighingRoundGroup {
  roundKey: string;
  date: string;
  weighNo: string;
  entries: WeighingRoundEntry[];
}

function groupShiftRowsByRound(slips: WeighingSlip[]): WeighingRoundGroup[] {
  const roundMap = new Map<string, { date: string; weighNo: string; entries: WeighingRoundEntry[] }>();

  slips.forEach(slip => {
    const date = slip.productionDate || slip.reportDate || '';
    getWeighingDataRows(slip.rows).forEach(row => {
      const weighNo = String(row.weighNo ?? '').trim() || '1';
      const key = `${date}__${weighNo}`;
      const bucket = roundMap.get(key) ?? { date, weighNo, entries: [] };
      bucket.entries.push({ slip, row });
      roundMap.set(key, bucket);
    });
  });

  return [...roundMap.entries()]
    .sort(([, a], [, b]) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return parseWeighRoundNumber(a.weighNo) - parseWeighRoundNumber(b.weighNo);
    })
    .map(([key, group]) => ({
      roundKey: key,
      date: group.date,
      weighNo: group.weighNo,
      entries: group.entries
    }));
}

function formatWeighingProductLabel(row: WeighingRecord, slip?: WeighingSlip) {
  const code = row.productCode?.trim();
  const name = row.productName?.trim();
  if (code || name) return code && name ? `${code} · ${name}` : name || code || '—';

  const fallbackRow = slip?.rows.find(r => r.productCode?.trim() || r.productName?.trim());
  const fallbackCode = fallbackRow?.productCode?.trim();
  const fallbackName = fallbackRow?.productName?.trim();
  if (fallbackCode || fallbackName) {
    return fallbackCode && fallbackName ? `${fallbackCode} · ${fallbackName}` : fallbackName || fallbackCode || '—';
  }
  return '—';
}

function groupSlipsByDateAndShift(records: WeighingRecord[], shiftOptions: ShiftOption[]): DateGroup[] {
  const slipMap = new Map<string, WeighingSlip>();

  records.forEach(record => {
    const key = slipKey(record);
    const existing = slipMap.get(key);
    if (existing) {
      existing.rows.push(record);
      const machineName = resolveMachineName(record.machineName, existing.machineName);
      if (machineName !== '—') {
        existing.machineName = machineName;
      }
      return;
    }

    slipMap.set(key, {
      key,
      documentNo: record.documentNo,
      reportDate: record.reportDate,
      productionDate: record.productionDate,
      shiftName: record.shiftName,
      worker1: record.worker1,
      worker2: record.worker2,
      machineName: resolveMachineName(record.machineName),
      rows: [record]
    });
  });

  const slips = [...slipMap.values()].map(slip => ({
    ...slip,
    rows: [...slip.rows].sort((a, b) => Number(a.weighNo) - Number(b.weighNo))
  }));

  const dateMap = new Map<string, WeighingSlip[]>();
  slips.forEach(slip => {
    const date = slip.productionDate || slip.reportDate || '';
    const bucket = dateMap.get(date) ?? [];
    bucket.push(slip);
    dateMap.set(date, bucket);
  });

  return [...dateMap.entries()]
    .map(([date, dateSlips]) => {
      const shiftGroups: ShiftDateGroup[] = shiftOptions
        .map(option => {
          const shiftSlips = dateSlips
            .filter(slip => resolveShiftName(slip.shiftName, shiftOptions) === option.value)
            .sort((a, b) => b.reportDate.localeCompare(a.reportDate));

          return {
            shiftKey: option.value,
            shiftLabel: option.label,
            slips: shiftSlips,
            slipCount: shiftSlips.length,
            totalWeighRounds: shiftSlips.reduce((sum, slip) => sum + countWeighingRounds(slip.rows), 0)
          };
        })
        .filter(group => group.slipCount > 0);

      return {
        date,
        shiftGroups,
        slipCount: dateSlips.length,
        totalWeighRounds: dateSlips.reduce((sum, slip) => sum + countWeighingRounds(slip.rows), 0)
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function findWeighingSlipInGroups(groups: DateGroup[], record: WeighingRecord): WeighingSlip | null {
  const key = slipKey(record);
  for (const dateGroup of groups) {
    for (const shift of dateGroup.shiftGroups) {
      const slip = shift.slips.find(item => item.key === key);
      if (slip) return slip;
    }
  }
  return null;
}

function ShiftSlipCard({
  shift,
  productionDate,
  config,
  splitDamagedPlasticDefectWeights,
  splitPlasticFilmWeights,
  hideProductFields,
  canCreate,
  canEdit,
  canDelete,
  onOpenSlipSetup,
  onPrintSlip,
  onEditSlip,
  onDeleteSlip,
  deletingSlipKey,
  onEditRow,
  onDeleteRow,
  deletingRowId,
  onViewRow,
  onViewImage
}: {
  key?: string;
  shift: ShiftDateGroup;
  productionDate: string;
  config: WeighingSlipConfig;
  splitDamagedPlasticDefectWeights: boolean;
  splitPlasticFilmWeights: boolean;
  hideProductFields: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpenSlipSetup: (options: { productionDate: string; shiftName?: string }) => void;
  onPrintSlip: (slip: WeighingSlip) => void;
  onEditSlip: (slip: WeighingSlip) => void;
  onDeleteSlip: (slip: WeighingSlip) => void;
  deletingSlipKey: string | null;
  onEditRow: (slip: WeighingSlip, row: WeighingRecord) => void;
  onDeleteRow: (row: WeighingRecord) => void;
  deletingRowId: string | number | null;
  onViewRow: (row: WeighingRecord) => void;
  onViewImage: (image: WeighingPreviewImage) => void;
}) {
  const roundGroups = groupShiftRowsByRound(shift.slips);
  const primarySlip = shift.slips.length === 1 ? shift.slips[0] : null;
  const primaryMachine = primarySlip
    ? resolveMachineName(primarySlip.machineName, ...primarySlip.rows.map(row => row.machineName))
    : '—';
  const tableColSpan = splitDamagedPlasticDefectWeights
    ? 13 - (hideProductFields ? 1 : 0) - (config.hideAcceptanceStatus ? 1 : 0)
    : splitPlasticFilmWeights
      ? 7
      : 12;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{shift.shiftLabel}</h3>
          <p className="text-[10px] font-semibold text-zinc-400">
            {primarySlip ? (
              <>
                {primarySlip.worker1 || '—'}
                {primarySlip.worker2 ? ` · ${primarySlip.worker2}` : ''}
                {primaryMachine !== '—' ? ` · ${primaryMachine}` : ''}
              </>
            ) : (
              <>
                {shift.slipCount} phiếu · {shift.totalWeighRounds} lần cân
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {primarySlip && (
            <>
              <button
                type="button"
                onClick={() => onPrintSlip(primarySlip)}
                title="In phiếu cân ca"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onEditSlip(primarySlip)}
                  title="Sửa phiếu"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => onDeleteSlip(primarySlip)}
                  disabled={deletingSlipKey === primarySlip.key}
                  title="Xóa phiếu"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingSlipKey === primarySlip.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
            </>
          )}
          {canCreate ? (
            <button
              type="button"
              onClick={() =>
                onOpenSlipSetup({
                  productionDate,
                  shiftName: shift.shiftKey
                })
              }
              className="flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 text-[10px] font-bold text-[#ef1b2d] transition hover:bg-red-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </button>
          ) : null}
        </div>
      </div>

      {shift.slips.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs font-semibold text-zinc-400">Chưa có phiếu cho ca này.</p>
      ) : (
        <div className="p-3">
          <div className="overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-zinc-950 text-[10px] font-black uppercase tracking-wider text-white">
                  {!hideProductFields && <th className="px-3 py-2">Sản phẩm</th>}
                  <th className="px-3 py-2">Người cân</th>
                  {splitDamagedPlasticDefectWeights ? (
                    <>
                      <th className="px-3 py-2">Loại</th>
                      <th className="px-3 py-2">Mã VT</th>
                      <th className="px-3 py-2">SL</th>
                      <th className="px-3 py-2">NVL khác</th>
                      <th className="px-3 py-2">Nhựa KM</th>
                      <th className="px-3 py-2">Nhựa ĐN</th>
                      <th className="px-3 py-2">Nhựa DM</th>
                      <th className="px-3 py-2">Màng</th>
                      <th className="px-3 py-2">Lõi</th>
                      <th className="px-3 py-2">Tổng</th>
                    </>
                  ) : splitPlasticFilmWeights ? (
                    <>
                      <th className="px-3 py-2">KL nhựa</th>
                      <th className="px-3 py-2">KL màng</th>
                      <th className="px-3 py-2">Tổng</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2">TL lõi</th>
                      <th className="px-3 py-2">TL bì</th>
                      <th className="px-3 py-2">TL nhựa</th>
                      <th className="px-3 py-2">Tổng trọng lượng</th>
                    </>
                  )}
                  <th className="px-3 py-2">Giờ</th>
                  {!config.hideAcceptanceStatus && <th className="px-3 py-2">Nghiệm thu</th>}
                  <th className="px-3 py-2">Ghi chú</th>
                  {!config.hideCoreWeightImage && <th className="px-3 py-2">Ảnh TL lõi</th>}
                  {!config.hideWeightImage && <th className="px-3 py-2">Ảnh</th>}
                  <th className="px-3 py-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {roundGroups.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} className="px-4 py-8 text-center text-xs font-semibold text-zinc-400">
                      Chưa có lần cân.
                    </td>
                  </tr>
                ) : (
                  roundGroups.map(group => {
                    const metaWeigher = group.entries.find(entry => entry.row.weigherName?.trim())?.row.weigherName;
                    const metaTime = group.entries.find(entry => entry.row.weighTime?.trim())?.row.weighTime;

                    return (
                      <React.Fragment key={group.roundKey}>
                        <tr className="bg-red-50/60">
                          <td colSpan={tableColSpan} className="px-3 py-1.5">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">
                              Lần {group.weighNo}
                              {metaWeigher ? ` · ${metaWeigher}` : ''}
                              {metaTime ? ` · ${metaTime}` : ''}
                            </span>
                          </td>
                        </tr>
                        {group.entries.map((entry, index) => (
                          <tr key={entry.row.id ?? `${group.roundKey}-${entry.slip.key}-${index}`}>
                            {!hideProductFields && (
                            <td className="px-3 py-2 font-semibold text-zinc-800">
                              <p>{formatWeighingProductLabel(entry.row, entry.slip)}</p>
                              {shift.slips.length > 1 ? (
                                <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">
                                  Phiếu {entry.slip.documentNo || '—'}
                                </p>
                              ) : null}
                            </td>
                            )}
                            <td className="px-3 py-2 font-semibold text-zinc-600">{entry.row.weigherName || '—'}</td>
                            {splitDamagedPlasticDefectWeights ? (
                              (() => {
                                const isOther = isDamagedOtherMaterial(entry.row);
                                return (
                                  <>
                                    <td className="px-3 py-2 font-semibold text-zinc-800">
                                      {damagedGoodsMaterialTypeLabel(entry.row.materialType)}
                                    </td>
                                    <td className="px-3 py-2 font-mono font-bold text-zinc-900">
                                      {isOther ? entry.row.materialCode || '—' : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-zinc-900">
                                      {isOther ? entry.row.materialQuantity || '—' : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-zinc-900">
                                      {isOther ? formatWeighingWeightField(entry.row.weight) : '—'}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-zinc-900">
                                      {isOther ? '—' : formatWeighingWeightField(entry.row.plasticNoFilmWeight)}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-zinc-900">
                                      {isOther ? '—' : formatWeighingWeightField(entry.row.plasticNozzleWeight)}
                                    </td>
                                    <td className="px-3 py-2 font-bold text-zinc-900">
                                      {isOther
                                        ? '—'
                                        : formatWeighingWeightField(entry.row.plasticFilmAdhesionWeight)}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-zinc-700">
                                      {isOther ? '—' : formatWeighingWeightField(entry.row.shellWeight)}
                                    </td>
                                    <td className="px-3 py-2 font-semibold text-zinc-700">
                                      {isOther
                                        ? formatWeighingWeightField(entry.row.weight)
                                        : formatWeighingWeightField(entry.row.coreWeight)}
                                    </td>
                                    <td className="px-3 py-2 font-black text-[#ef1b2d]">
                                      {formatDamagedGoodsRowTotalWeight(entry.row)}
                                    </td>
                                  </>
                                );
                              })()
                            ) : splitPlasticFilmWeights ? (
                              <>
                                <td className="px-3 py-2 font-bold text-zinc-900">
                                  {formatWeighingWeightField(entry.row.weight)}
                                </td>
                                <td className="px-3 py-2 font-semibold text-zinc-700">
                                  {formatWeighingWeightField(entry.row.shellWeight)}
                                </td>
                                <td className="px-3 py-2 font-black text-[#ef1b2d]">
                                  {formatDamagedGoodsRowTotalWeight(entry.row)}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2 font-semibold text-zinc-700">{entry.row.coreWeight || '—'}</td>
                                <td className="px-3 py-2 font-semibold text-zinc-700">{entry.row.shellWeight || '—'}</td>
                                <td className="px-3 py-2 font-bold text-zinc-900">{formatWeighingNetWeight(entry.row)}</td>
                                <td className="px-3 py-2 font-black text-[#ef1b2d]">
                                  {formatWeighingRowTotalWeight(entry.row)}
                                </td>
                              </>
                            )}
                            <td className="px-3 py-2 font-semibold text-zinc-600">{entry.row.weighTime || '—'}</td>
                            {!config.hideAcceptanceStatus && (
                            <td className="px-3 py-2">
                              {entry.row.acceptanceStatus ? (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                    entry.row.acceptanceStatus === 'Đạt'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {entry.row.acceptanceStatus}
                                </span>
                              ) : (
                                <span className="text-zinc-300">—</span>
                              )}
                            </td>
                            )}
                            <td
                              className="max-w-[140px] truncate px-3 py-2 font-semibold text-zinc-600"
                              title={entry.row.note || undefined}
                            >
                              {entry.row.note || '—'}
                            </td>
                            {!config.hideCoreWeightImage && (
                            <td className="px-3 py-2">
                              {entry.row.coreWeightImageUrl ? (
                                <WeighingImageThumbnail
                                  url={entry.row.coreWeightImageUrl}
                                  alt="Ảnh trọng lượng lõi"
                                  title="Ảnh trọng lượng lõi"
                                  onView={() =>
                                    onViewImage({ url: entry.row.coreWeightImageUrl!, title: 'Ảnh trọng lượng lõi' })
                                  }
                                />
                              ) : (
                                <span className="text-xs font-semibold text-zinc-300">Chưa có</span>
                              )}
                            </td>
                            )}
                            {!config.hideWeightImage && (
                            <td className="px-3 py-2">
                              {entry.row.imageUrl ? (
                                <WeighingImageThumbnail
                                  url={entry.row.imageUrl}
                                  alt="Ảnh cân"
                                  title="Ảnh cân"
                                  onView={() => onViewImage({ url: entry.row.imageUrl!, title: 'Ảnh cân' })}
                                />
                              ) : (
                                <span className="text-xs font-semibold text-zinc-300">Chưa có</span>
                              )}
                            </td>
                            )}
                            <td className="px-3 py-2">
                              <RowActionsMenu label="Thao tác dòng cân">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onViewRow(entry.row)}
                                  title="Xem"
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => onEditRow(entry.slip, entry.row)}
                                    title="Sửa"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-red-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteRow(entry.row)}
                                    disabled={deletingRowId === entry.row.id}
                                    title="Xóa"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {deletingRowId === entry.row.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                ) : null}
                              </div>
                              </RowActionsMenu>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function DateGroupSection({
  group,
  shiftOptions,
  config,
  splitDamagedPlasticDefectWeights,
  splitPlasticFilmWeights,
  hideProductFields,
  canCreate,
  canEdit,
  canDelete,
  onOpenSlipSetup,
  onPrintSlip,
  onEditSlip,
  onDeleteSlip,
  deletingSlipKey,
  onEditRow,
  onDeleteRow,
  deletingRowId,
  onViewRow,
  onViewImage
}: {
  key?: string;
  group: DateGroup;
  shiftOptions: ShiftOption[];
  config: WeighingSlipConfig;
  splitDamagedPlasticDefectWeights: boolean;
  splitPlasticFilmWeights: boolean;
  hideProductFields: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpenSlipSetup: (options: { productionDate: string; shiftName?: string }) => void;
  onPrintSlip: (slip: WeighingSlip) => void;
  onEditSlip: (slip: WeighingSlip) => void;
  onDeleteSlip: (slip: WeighingSlip) => void;
  deletingSlipKey: string | null;
  onEditRow: (slip: WeighingSlip, row: WeighingRecord) => void;
  onDeleteRow: (row: WeighingRecord) => void;
  deletingRowId: string | number | null;
  onViewRow: (row: WeighingRecord) => void;
  onViewImage: (image: WeighingPreviewImage) => void;
}) {
  const [addShiftKey, setAddShiftKey] = useState(shiftOptions[0]?.value ?? '');

  useEffect(() => {
    if (!shiftOptions.some(option => option.value === addShiftKey)) {
      setAddShiftKey(shiftOptions[0]?.value ?? '');
    }
  }, [shiftOptions, addShiftKey]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 sm:px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</span>
          <span className="font-mono text-sm font-black text-zinc-900">{formatDateVi(group.date)}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 ring-1 ring-zinc-200">
            {group.slipCount} phiếu · {group.totalWeighRounds} lần cân
          </span>
        </div>
        {canCreate && shiftOptions.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <select
              value={addShiftKey}
              onChange={e => setAddShiftKey(e.target.value)}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-bold text-zinc-700 outline-none focus:border-[#ef1b2d]"
            >
              {shiftOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOpenSlipSetup({ productionDate: group.date, shiftName: addShiftKey })}
              className="flex h-8 items-center gap-1 rounded-lg bg-red-50 px-2 text-[10px] font-bold text-[#ef1b2d] transition hover:bg-red-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm theo ca
            </button>
          </div>
        )}
      </div>
      <div className="space-y-3 p-3">
        {group.shiftGroups.map(shift => (
          <ShiftSlipCard
            key={shift.shiftKey}
            shift={shift}
            productionDate={group.date}
            config={config}
            splitDamagedPlasticDefectWeights={splitDamagedPlasticDefectWeights}
            splitPlasticFilmWeights={splitPlasticFilmWeights}
            hideProductFields={hideProductFields}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onOpenSlipSetup={onOpenSlipSetup}
            onPrintSlip={onPrintSlip}
            onEditSlip={onEditSlip}
            onDeleteSlip={onDeleteSlip}
            deletingSlipKey={deletingSlipKey}
            onEditRow={onEditRow}
            onDeleteRow={onDeleteRow}
            deletingRowId={deletingRowId}
            onViewRow={onViewRow}
            onViewImage={onViewImage}
          />
        ))}
      </div>
    </div>
  );
}

export default function WeighingShiftSummary({
  config = DEFAULT_WEIGHING_SLIP_CONFIG,
  onBackToMenu,
  initialPendingAdd = null,
  onInitialPendingConsumed,
  defaultShowForm = false
}: {
  config?: WeighingSlipConfig;
  onBackToMenu?: () => void;
  initialPendingAdd?: WeighingPendingAdd | null;
  onInitialPendingConsumed?: () => void;
  defaultShowForm?: boolean;
} = {}) {
  const splitPlasticFilmWeights = Boolean(config.splitPlasticFilmWeights);
  const splitDamagedPlasticDefectWeights = Boolean(config.splitDamagedPlasticDefectWeights);
  const hideProductFields = Boolean(config.hideProductFields);
  const { canCreate, canEdit, canDelete } = useTabAccess(config.accessTab || 'weighing-summary-list');
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [records, setRecords] = useState<WeighingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingRow, setViewingRow] = useState<WeighingRecord | null>(null);
  const [viewingImage, setViewingImage] = useState<WeighingPreviewImage | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | number | null>(null);
  const [deletingSlipKey, setDeletingSlipKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [showReportForm, setShowReportForm] = useState(defaultShowForm);
  const [pendingAdd, setPendingAdd] = useState<WeighingPendingAdd | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [printSlip, setPrintSlip] = useState<WeighingSlipPrintData | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  useEffect(() => {
    if (!initialPendingAdd) return;
    if (initialPendingAdd.productionDate) {
      setDateFrom(initialPendingAdd.productionDate);
      setDateTo(initialPendingAdd.productionDate);
    }
    setPendingAdd(initialPendingAdd);
    setShowReportForm(true);
    onInitialPendingConsumed?.();
  }, [initialPendingAdd, onInitialPendingConsumed]);

  const handleOpenSlipSetup = (options: { productionDate: string; shiftName?: string }) => {
    if (!canCreate) return;
    handleOpenReportForm({
      productionDate: options.productionDate || dateTo,
      shiftName: options.shiftName || '',
      worker1: '',
      worker2: '',
      machineName: '',
      productCode: '',
      productName: '',
      createNewSlip: true,
      newWeighRound: true
    });
  };

  const handleOpenReportForm = (options: WeighingPendingAdd) => {
    setPendingAdd(options);
    setShowReportForm(true);
  };

  const handleCloseReportForm = async () => {
    setShowReportForm(false);
    setPendingAdd(null);
    await loadReports();
  };

  const dateGroups = useMemo(() => groupSlipsByDateAndShift(records, shiftOptions), [records, shiftOptions]);
  const viewingRowSlip = useMemo(
    () => (viewingRow ? findWeighingSlipInGroups(dateGroups, viewingRow) : null),
    [viewingRow, dateGroups]
  );
  const loadReports = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params =
        dateFrom === dateTo
          ? new URLSearchParams({ ngay: dateFrom })
          : new URLSearchParams({ from: dateFrom, to: dateTo });
      const res = await fetch(`${config.apiBasePath}?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải báo cáo cân.');
      }

      setRecords(normalizeWeighingRecords(data));
    } catch (err: any) {
      setError(err.message || 'Không thể tải báo cáo cân.');
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    setViewingRow(null);
    setActionMessage('');
  }, [dateFrom, dateTo, config.apiBasePath]);

  useEffect(() => {
    let cancelled = false;

    const loadShiftSettings = async () => {
      try {
        const res = await fetch('/api/cai-dat');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setShiftSettings(normalizeShiftSettings(data));
        }
      } catch {
        if (!cancelled) setShiftSettings([]);
      }
    };

    loadShiftSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!printSlip) return;
    document.body.classList.add('weighing-slip-print-active');
    return () => {
      document.body.classList.remove('weighing-slip-print-active');
    };
  }, [printSlip]);

  useEffect(() => {
    if (!pendingPrint || !printSlip) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printSlip]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintSlip(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const handlePrintSlip = (slip: WeighingSlip) => {
    const machineName = resolveMachineName(slip.machineName, ...slip.rows.map(row => row.machineName));
    setPrintSlip({
      documentNo: slip.documentNo,
      reportDate: slip.reportDate,
      productionDate: slip.productionDate,
      shiftName: slip.shiftName,
      worker1: slip.worker1,
      worker2: slip.worker2,
      machineName: machineName !== '—' ? machineName : '',
      rows: slip.rows
    });
    setPendingPrint(true);
  };

  const handleDeleteRow = async (row: WeighingRecord) => {
    if (!canDelete) return;
    if (!row.id) {
      setActionMessage('Không tìm thấy ID dòng để xóa.');
      return;
    }

    if (!window.confirm('Bạn có chắc muốn xóa dòng cân này?')) return;

    setDeletingRowId(row.id);
    setActionMessage('');

    try {
      const res = await fetch(`${config.apiBasePath}/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa dòng cân.');
      }

      setActionMessage('Đã xóa dòng cân.');
      if (viewingRow?.id === row.id) setViewingRow(null);
      await loadReports();
    } catch (err: any) {
      setActionMessage(err.message || 'Không thể xóa dòng cân.');
    } finally {
      setDeletingRowId(null);
    }
  };

  const handleEditRow = (slip: WeighingSlip, row: WeighingRecord) => {
    if (!canEdit) return;
    handleOpenReportForm({
      productionDate: slip.productionDate,
      shiftName: slip.shiftName,
      worker1: slip.worker1,
      worker2: slip.worker2,
      documentNo: slip.documentNo,
      reportDate: slip.reportDate,
      productName: row.productName,
      existingRows: slip.rows,
      editingRow: row
    });
  };

  const handleEditSlip = (slip: WeighingSlip) => {
    if (!canEdit) return;
    handleOpenReportForm({
      productionDate: slip.productionDate,
      shiftName: slip.shiftName,
      worker1: slip.worker1,
      worker2: slip.worker2,
      documentNo: slip.documentNo,
      reportDate: slip.reportDate,
      productCode: slip.rows[0]?.productCode,
      productName: slip.rows[0]?.productName,
      machineName: (() => {
        const name = resolveMachineName(slip.machineName, ...slip.rows.map(row => row.machineName));
        return name !== '—' ? name : undefined;
      })(),
      existingRows: slip.rows
    });
  };

  const handleDeleteSlip = async (slip: WeighingSlip) => {
    if (!canDelete) return;
    const deletableRows = slip.rows.filter(row => row.id);
    if (deletableRows.length === 0) {
      setActionMessage('Không tìm thấy ID dòng trong phiếu để xóa.');
      return;
    }

    if (!window.confirm(`Bạn có chắc muốn xóa phiếu ${slip.documentNo || '—'} và toàn bộ ${deletableRows.length} dòng liên quan?`)) {
      return;
    }

    setDeletingSlipKey(slip.key);
    setActionMessage('');

    try {
      for (const row of deletableRows) {
        const res = await fetch(`${config.apiBasePath}/${row.id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Không thể xóa phiếu.');
        }
      }

      setActionMessage('Đã xóa phiếu.');
      await loadReports();
    } catch (err: any) {
      setActionMessage(err.message || 'Không thể xóa phiếu.');
    } finally {
      setDeletingSlipKey(null);
    }
  };

  if (showReportForm) {
    return (
      <div className="relative space-y-3 pb-28">
        <button
          type="button"
          onClick={handleCloseReportForm}
          className="flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-600 shadow-sm transition hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
          {config.backLabel}
        </button>
        <WeighingReportForm
          pendingAdd={pendingAdd}
          onPendingAddHandled={() => setPendingAdd(null)}
          config={config}
        />
      </div>
    );
  }

  return (
    <div className="relative space-y-4 pb-28">
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100 bg-zinc-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[140px] flex-1 space-y-1 sm:max-w-[180px]">
              <span className="flex items-center gap-1 text-xs font-bold text-zinc-600">
                <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" />
                Từ ngày
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
              />
            </label>
            <label className="min-w-[140px] flex-1 space-y-1 sm:max-w-[180px]">
              <span className="flex items-center gap-1 text-xs font-bold text-zinc-600">
                <CalendarDays className="h-3.5 w-3.5 text-[#ef1b2d]" />
                Đến ngày
              </span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={e => setDateTo(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadReports}
              disabled={isLoading}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Làm mới
            </button>
            {canCreate ? (
            <button
              type="button"
              onClick={() => handleOpenSlipSetup({ productionDate: dateTo })}
              className="hidden h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#b30d1c] sm:flex"
            >
              <Plus className="h-4 w-4" />
              Thêm báo cáo
            </button>
            ) : null}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-16 text-sm font-bold text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#ef1b2d]" />
          Đang tải báo cáo các ca...
        </div>
      ) : (
        <div className="space-y-3">
          {actionMessage && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-[#ef1b2d]">
              {actionMessage}
            </div>
          )}

          {dateGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-xs font-semibold text-zinc-400">
              Chưa có phiếu cân nào trong khoảng ngày đã chọn.
            </div>
          ) : (
            dateGroups.map(dateGroup => (
              <DateGroupSection
                key={dateGroup.date}
                group={dateGroup}
                shiftOptions={shiftOptions}
                config={config}
                splitDamagedPlasticDefectWeights={splitDamagedPlasticDefectWeights}
                splitPlasticFilmWeights={splitPlasticFilmWeights}
                hideProductFields={hideProductFields}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete}
                onOpenSlipSetup={handleOpenSlipSetup}
                onPrintSlip={handlePrintSlip}
                onEditSlip={handleEditSlip}
                onDeleteSlip={handleDeleteSlip}
                deletingSlipKey={deletingSlipKey}
                onEditRow={handleEditRow}
                onDeleteRow={handleDeleteRow}
                deletingRowId={deletingRowId}
                onViewRow={setViewingRow}
                onViewImage={setViewingImage}
              />
            ))
          )}
        </div>
      )}

      {canCreate ? (
      <button
        type="button"
        onClick={() => handleOpenSlipSetup({ productionDate: dateTo })}
        className="fixed bottom-24 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-[#ef1b2d] px-5 text-sm font-extrabold text-white shadow-lg shadow-red-500/30 transition hover:bg-[#b30d1c] sm:hidden"
      >
        <Plus className="h-5 w-5" />
        Thêm báo cáo
      </button>
      ) : null}

      <WeighingImagePreviewModal image={viewingImage} onClose={() => setViewingImage(null)} />

      {viewingRow && (        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết dòng cân</h3>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                  Lần {viewingRow.weighNo || '—'} · {viewingRow.weighTime || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingRow(null)}
                className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 text-xs">
              {splitDamagedPlasticDefectWeights ? (
                isDamagedOtherMaterial(viewingRow) ? (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Loại hàng hỏng</span>
                    <p className="mt-1 font-bold text-zinc-800">
                      {damagedGoodsMaterialTypeLabel(viewingRow.materialType)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Mã vật tư</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.materialCode || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Số lượng</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.materialQuantity || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">NVL khác (kg)</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Lõi (kg)</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
                ) : (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Loại hàng hỏng</span>
                    <p className="mt-1 font-bold text-zinc-800">
                      {damagedGoodsMaterialTypeLabel(viewingRow.materialType)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa không mảng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticNoFilmWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa đầu nòng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticNozzleWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">Nhựa dính màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.plasticFilmAdhesionWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.shellWeight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">TL lõi</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.coreWeight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
                )
              ) : splitPlasticFilmWeights ? (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL nhựa</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.weight)}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">KL màng</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingWeightField(viewingRow.shellWeight)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatDamagedGoodsRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">TL lõi</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.coreWeight || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">TL bì</span>
                    <p className="mt-1 font-bold text-zinc-800">{viewingRow.shellWeight || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-zinc-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-zinc-400">TL nhựa</span>
                    <p className="mt-1 font-bold text-zinc-800">{formatWeighingNetWeight(viewingRow)}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 px-3 py-2">
                    <span className="font-black uppercase tracking-wider text-red-400">Tổng trọng lượng</span>
                    <p className="mt-1 font-black text-[#ef1b2d]">{formatWeighingRowTotalWeight(viewingRow)}</p>
                  </div>
                </>
              )}
              {!hideProductFields && (
              <>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Mã SP</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.productCode || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Sản phẩm</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.productName || '—'}</p>
              </div>
              </>
              )}
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Người cân</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.weigherName || '—'}</p>
              </div>
              {!config.hideAcceptanceStatus && (
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Nghiệm thu</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.acceptanceStatus || '—'}</p>
              </div>
              )}
              <div className="col-span-2 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ghi chú</span>
                <p className="mt-1 font-bold text-zinc-800">{viewingRow.note || '—'}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ảnh TL lõi</span>
                {viewingRow.coreWeightImageUrl ? (
                  <WeighingImageThumbnail
                    url={viewingRow.coreWeightImageUrl}
                    alt="Ảnh TL lõi"
                    title="Ảnh trọng lượng lõi"
                    onView={() =>
                      setViewingImage({ url: viewingRow.coreWeightImageUrl!, title: 'Ảnh trọng lượng lõi' })
                    }
                    className="mt-2 block h-24 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                  />
                ) : (
                  <p className="mt-1 font-semibold text-zinc-400">Chưa có</p>
                )}
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <span className="font-black uppercase tracking-wider text-zinc-400">Ảnh cân</span>
                {viewingRow.imageUrl ? (
                  <WeighingImageThumbnail
                    url={viewingRow.imageUrl}
                    alt="Ảnh cân"
                    title="Ảnh cân"
                    onView={() => setViewingImage({ url: viewingRow.imageUrl!, title: 'Ảnh cân' })}
                    className="mt-2 block h-24 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-[#ef1b2d]"
                  />
                ) : (
                  <p className="mt-1 font-semibold text-zinc-400">Chưa có</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              {viewingRowSlip && canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    setViewingRow(null);
                    handleEditRow(viewingRowSlip, viewingRow);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Sửa
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setViewingRow(null)}
                className="h-9 rounded-lg bg-zinc-900 px-3 text-xs font-bold text-white transition hover:bg-zinc-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <WeighingSlipPrintBatch
        slip={printSlip}
        title={config.printTitle}
        layout={{
          hideProductFields: config.hideProductFields,
          splitPlasticFilmWeights: config.splitPlasticFilmWeights
        }}
      />
    </div>
  );
}
