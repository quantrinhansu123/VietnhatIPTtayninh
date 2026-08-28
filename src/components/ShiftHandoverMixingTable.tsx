import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SearchableSelect } from './shared/SearchableSelect';
import { formatNumber } from '../utils';
import {
  mixedTotalFromUses,
  formatQty,
  type MaterialCatalogOption,
  type MixingMaterialLine
} from '../lib/shiftHandoverModel';
import { lookupMachineMixingPercent } from '../utils/shiftHandoverAutofill';

const cellClass =
  'h-9 w-full min-w-0 border-0 bg-transparent px-1.5 text-sm font-semibold text-zinc-800 outline-none focus:bg-red-50';
const cellCenterClass = `${cellClass} text-center`;

function displayNum(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '';
  return formatNumber(value, digits);
}

export default function ShiftHandoverMixingTable({
  lines,
  materials,
  mixingRatios = [],
  isLoading,
  onChange,
  onAdd,
  onRemove
}: {
  lines: MixingMaterialLine[];
  materials: MaterialCatalogOption[];
  mixingRatios?: Array<{ materialCode: string; materialName: string; percent: number }>;
  isLoading?: boolean;
  onChange: (key: string, patch: Partial<MixingMaterialLine>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const mixedTotal = lines.reduce((sum, line) => {
    const mixed = mixedTotalFromUses(line.use1, line.use2, line.use3, line.use4, line.use5);
    return sum + (mixed ?? 0);
  }, 0);

  const selectMaterial = (key: string, item: MaterialCatalogOption | null, code: string) => {
    if (item) {
      const percent = lookupMachineMixingPercent(mixingRatios, item.code, item.name);
      onChange(key, {
        materialCode: item.code,
        materialName: item.name || '',
        unit: item.unit || 'kg',
        ...(percent !== null ? { percent: formatQty(percent) } : {})
      });
      return;
    }
    onChange(key, { materialCode: code });
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">I. Vật tư</h3>
          <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">
            Nguồn: phiếu trộn của máy đã chọn · Tỉ lệ ĐM lấy từ tỉ lệ trộn máy
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm vật tư
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-[880px] w-full border-collapse text-xs">
          <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
            <tr>
              <th rowSpan={2} className="w-10 border border-zinc-200 px-1 py-1.5">
                STT
              </th>
              <th rowSpan={2} className="border border-zinc-200 px-2 py-1.5">
                Tên vật tư
              </th>
              <th rowSpan={2} className="w-16 border border-zinc-200 px-1 py-1.5">
                ĐVT
              </th>
              <th rowSpan={2} className="w-24 border border-zinc-200 px-1 py-1.5">
                Tỉ lệ ĐM (%)
              </th>
              <th colSpan={5} className="border border-zinc-200 px-1 py-1.5">
                Sử dụng (kg)
              </th>
              <th rowSpan={2} className="w-28 border border-zinc-200 px-1 py-1.5">
                Tổng nhựa trộn
              </th>
              <th rowSpan={2} className="w-9 border border-zinc-200" />
            </tr>
            <tr>
              {['Lần 1', 'Lần 2', 'Lần 3', 'Lần 4', 'Lần 5'].map(label => (
                <th key={label} className="w-[4.5rem] border border-zinc-200 px-1 py-1">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={11} className="border border-zinc-200 px-3 py-6 text-center text-xs font-semibold text-zinc-400">
                  Chưa có dòng. Chọn Ngày + Ca + Máy rồi bấm Tự động điền, hoặc Thêm vật tư.
                </td>
              </tr>
            ) : null}
            {lines.map((line, index) => {
              const mixed = mixedTotalFromUses(line.use1, line.use2, line.use3, line.use4, line.use5);
              return (
                <tr key={line.key} className="odd:bg-white even:bg-zinc-50/70">
                  <td className="border border-zinc-200 text-center font-black text-[#ef1b2d]">{index + 1}</td>
                  <td className="min-w-[220px] border border-zinc-200 p-0.5">
                    <SearchableSelect
                      value={line.materialCode || line.materialName}
                      onChange={value => {
                        const found = materials.find(item => item.code === value);
                        if (found) {
                          selectMaterial(line.key, found, found.code);
                        } else {
                          onChange(line.key, { materialCode: '', materialName: value });
                        }
                      }}
                      onSelectOption={item => {
                        const material = item as MaterialCatalogOption | null;
                        if (material) selectMaterial(line.key, material, material.code);
                      }}
                      options={materials}
                      placeholder="Chọn hoặc nhập tên vật tư"
                      searchPlaceholder="Tìm mã / tên NVL..."
                      isLoading={isLoading}
                      inputClassName={cellClass}
                      comboboxMode
                      allowCustomValue
                      getValue={item => (item as MaterialCatalogOption).code}
                      getLabel={item => {
                        const material = item as MaterialCatalogOption;
                        return material.code ? `${material.code} · ${material.name}` : material.name;
                      }}
                      getSearchText={item => {
                        const material = item as MaterialCatalogOption;
                        return `${material.code} ${material.name}`.trim();
                      }}
                    />
                  </td>
                  <td className="border border-zinc-200 p-0.5">
                    <input
                      value={line.unit}
                      onChange={e => onChange(line.key, { unit: e.target.value })}
                      className={cellCenterClass}
                    />
                  </td>
                  {(
                    [
                      ['percent', line.percent],
                      ['use1', line.use1],
                      ['use2', line.use2],
                      ['use3', line.use3],
                      ['use4', line.use4],
                      ['use5', line.use5]
                    ] as Array<[keyof MixingMaterialLine, string]>
                  ).map(([field, value]) => (
                    <td key={field} className="border border-zinc-200 p-0.5">
                      <input
                        value={value}
                        onChange={e => onChange(line.key, { [field]: e.target.value })}
                        className={cellCenterClass}
                        inputMode="decimal"
                      />
                    </td>
                  ))}
                  <td className="border border-zinc-200 bg-zinc-50 px-1.5 text-center font-black text-zinc-800">
                    {displayNum(mixed)}
                  </td>
                  <td className="border border-zinc-200 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(line.key)}
                      className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-zinc-100 font-black text-zinc-800">
              <td colSpan={9} className="border border-zinc-200 px-2 py-2 text-right uppercase">
                Tổng nhựa trộn
              </td>
              <td className="border border-zinc-200 px-2 py-2 text-center text-base">
                {displayNum(mixedTotal)}
              </td>
              <td className="border border-zinc-200" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] font-semibold text-amber-800">
        Cần kiểm tra nhựa tái chế trước khi sử dụng.
      </p>
    </div>
  );
}
