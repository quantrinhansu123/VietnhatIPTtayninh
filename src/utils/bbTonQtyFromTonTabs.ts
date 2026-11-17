/**
 * 3.2 — số lượng đi kèm «Trọng lượng tồn đầu ca» / «Trọng lượng vật tư tồn cuối ca»
 * (hiện trong ngoặc cạnh kg, vd. 4,56( 2 )): lấy `tonDauQuantity` trên tab Tồn đầu ca / Kiểm tồn cuối ca.
 */
import {
  findBbDauCaMaterialLine,
  findBbThucDungHeaderGroup,
  type BbCuoiCaGroup,
  type BbDauCaGroup,
  type BbThucDungLineRow
} from './controlBoardBbMachineReport';

function positive(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

export function syncBbThucDungRowsTonQtyFromTonTabs(input: {
  rows: BbThucDungLineRow[];
  dauCaGroups: BbDauCaGroup[];
  cuoiCaGroups: BbCuoiCaGroup[];
}): BbThucDungLineRow[] {
  if (input.rows.length === 0) return input.rows;
  return input.rows.map(row => {
    if (row.inMixingRatioTable || row.isPlasticNvl) return row;
    const header = {
      ngay: row.ngay,
      shift: row.shift,
      orderCode: row.orderCode,
      machine: row.machine
    };
    const dauGroup = findBbThucDungHeaderGroup(input.dauCaGroups, header);
    const cuoiGroup = findBbThucDungHeaderGroup(input.cuoiCaGroups, header);
    const dauLine = findBbDauCaMaterialLine(dauGroup?.materialLines, row.materialCode, row.materialName);
    const cuoiLine = findBbDauCaMaterialLine(cuoiGroup?.materialLines, row.materialCode, row.materialName);
    return {
      ...row,
      tonDauQty: positive(dauLine?.tonDauQuantity),
      tonCuoiQty: positive(cuoiLine?.tonDauQuantity)
    };
  });
}
