/**
 * Mục 3.2 — «Nhập thành phẩm» NVL khác = đúng cột «TL thực tế» bảng NVL trên tab Báo cáo sản lượng
 * (cùng `buildBbThanhPhamHachToanNvlSplit` với tab «Thành phẩm đạt nhập kho»). Không nhân lại ĐM.
 */
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  buildBbThanhPhamHachToanNvlSplit,
  type BbSanLuongGroup,
  type BbSanLuongNvlTotal,
  type BbThucDungLineRow
} from './controlBoardBbMachineReport';
import { normalizeWarehouseCodeKey } from './warehouseWeight';


function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function materialKey(code: string, name: string) {
  return (
    normalizeWarehouseCodeKey(code) ||
    normalizeProductCodeKey(name) ||
    String(name || '').trim().toUpperCase()
  );
}

export function syncBbThucDungRowsOtherFinishedFromSanLuongTab(input: {
  rows: BbThucDungLineRow[];
  sanLuongGroups: BbSanLuongGroup[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0 || !input.sanLuongGroups?.length) return input.rows;
  const cache = new Map<string, Map<string, BbSanLuongNvlTotal>>();
  return input.rows.map(row => {
    if (row.inMixingRatioTable || row.isPlasticNvl) return row;
    const headerKey = `${row.orderCode}|${row.ngay}|${row.shift}|${row.machine}`;
    let byMaterial = cache.get(headerKey);
    if (!byMaterial) {
      byMaterial = new Map();
      const { other } = buildBbThanhPhamHachToanNvlSplit(
        {
          orderCode: row.orderCode,
          ngay: row.ngay,
          shift: row.shift,
          machine: row.machine,
          groupKey: ''
        },
        input.sanLuongGroups
      );
      for (const total of other) {
        if (total.amountType === 'percent') continue;
        const key = materialKey(total.itemCode, total.itemName);
        if (key && !byMaterial.has(key)) byMaterial.set(key, total);
      }
      cache.set(headerKey, byMaterial);
    }
    const total = byMaterial.get(materialKey(row.materialCode, row.materialName));
    const kg = total && total.actualWeightKg > 0 ? total.actualWeightKg : 0;
    if (!(kg > 0)) return row;
    const damagedKg = Number.isFinite(row.loiHongKg) ? row.loiHongKg : 0;
    const weightKg = Number.isFinite(row.weightKg) ? row.weightKg : 0;
    return {
      ...row,
      klThucTeKg: round4(kg),
      klThucTePlusLoiKg: round4(kg + damagedKg),
      chenhLechKg: round4(weightKg - kg - damagedKg)
    };
  });
}
