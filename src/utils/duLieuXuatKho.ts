/**
 * du_lieu_xuat_kho — snapshot tab «Dữ liệu xuất kho» trên /phan-tich-tu-dong.
 * Ghi khi bấm Tính toán; khóa cùng bb_bao_cao_tinh_toan / bc_lsx.
 */
import type {
  BbWarehouseExportGroup,
  BbWarehouseExportLineRow,
  BbWarehouseExportProductGroup
} from './controlBoardBbMachineReport';

export type DuLieuXuatKhoRow = {
  khoa_on_dinh: string;
  ngay: string;
  ca: string;
  ca_label: string | null;
  may: string;
  ma_lenh: string;
  group_key: string;
  ma_sp: string | null;
  ten_sp: string | null;
  don_vi_sp: string | null;
  sl_sp: number | null;
  dinh_muc_sp_kg: number | null;
  tong_dinh_muc_sp_kg: number | null;
  stt: number;
  ma_phieu: string | null;
  slip_line_key: string | null;
  ma_nvl: string | null;
  ten_nvl: string | null;
  don_vi: string | null;
  sl_dinh_muc: number | null;
  trong_luong_dinh_muc_kg: number | null;
  sl_xuat: number | null;
  trong_luong_xuat_kg: number | null;
  ti_le_percent: number | null;
  khop_lenh: boolean | null;
  so_dong_nvl_lenh: number | null;
  tong_tl_dinh_muc_lenh_kg: number | null;
  tong_tl_xuat_lenh_kg: number | null;
};

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function materialRatioKey(code: string | null | undefined) {
  return String(code || '')
    .trim()
    .toUpperCase();
}

/** Trọng lượng định mức = SL SP × KL thành phần × allocationRatio. */
function computeTrongLuongDinhMucKg(line: BbWarehouseExportLineRow): number | null {
  const productQuantity = line.materialNorm?.productQuantity;
  const kgPerUnit = line.materialNorm?.componentWeightKg;
  const ratio = line.materialNorm?.allocationRatio;
  if (productQuantity === undefined || productQuantity === null || !(productQuantity > 0)) return null;
  if (kgPerUnit === null || kgPerUnit === undefined || !(kgPerUnit > 0)) return null;
  if (ratio === undefined || ratio === null || !(ratio > 0)) return null;
  return round4(productQuantity * kgPerUnit * ratio);
}

function sumTrongLuongDinhMucKgByMaterial(lines: BbWarehouseExportLineRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    const kg = computeTrongLuongDinhMucKg(line);
    if (kg === null) continue;
    const key = materialRatioKey(line.itemCode);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + kg);
  }
  return map;
}

function computeTrongLuongDinhMucPercent(
  line: BbWarehouseExportLineRow,
  groupTotalsByMaterial: Map<string, number>
): number | null {
  const ownKg = computeTrongLuongDinhMucKg(line);
  if (ownKg === null) return null;
  const total = groupTotalsByMaterial.get(materialRatioKey(line.itemCode));
  if (!total || total <= 0) return null;
  return round4((ownKg / total) * 100);
}

function sumTrongLuongDinhMucKg(lines: BbWarehouseExportLineRow[]) {
  return lines.reduce((sum, line) => {
    const kg = computeTrongLuongDinhMucKg(line);
    return sum + (kg != null ? kg : 0);
  }, 0);
}

function pushProductLines(input: {
  khoa: string;
  group: BbWarehouseExportGroup;
  productGroup: BbWarehouseExportProductGroup;
  groupTotalsByMaterial: Map<string, number>;
  tongTlDinhMucLenhKg: number;
  tongTlXuatLenhKg: number;
  soDongNvlLenh: number;
  sttStart: number;
  rows: DuLieuXuatKhoRow[];
}): number {
  const { khoa, group, productGroup, groupTotalsByMaterial } = input;
  const lines = productGroup.lines || [];
  let stt = input.sttStart;

  if (lines.length === 0) {
    input.rows.push({
      khoa_on_dinh: khoa,
      ngay: group.ngay || '',
      ca: group.shift || '',
      ca_label: group.shiftLabel || null,
      may: group.machine || '',
      ma_lenh: group.orderCode || '',
      group_key: group.groupKey || group.orderCode || '',
      ma_sp: productGroup.productCode || null,
      ten_sp: productGroup.productName || null,
      don_vi_sp: productGroup.unit || null,
      sl_sp: productGroup.orderQuantity > 0 ? productGroup.orderQuantity : null,
      dinh_muc_sp_kg:
        productGroup.normKgPerUnit != null && productGroup.normKgPerUnit > 0
          ? round4(productGroup.normKgPerUnit)
          : null,
      tong_dinh_muc_sp_kg:
        productGroup.normWeightKg > 0 ? round4(productGroup.normWeightKg) : null,
      stt: stt++,
      ma_phieu: null,
      slip_line_key: null,
      ma_nvl: null,
      ten_nvl: null,
      don_vi: null,
      sl_dinh_muc: null,
      trong_luong_dinh_muc_kg: null,
      sl_xuat: null,
      trong_luong_xuat_kg: null,
      ti_le_percent: null,
      khop_lenh: null,
      so_dong_nvl_lenh: input.soDongNvlLenh,
      tong_tl_dinh_muc_lenh_kg:
        input.tongTlDinhMucLenhKg > 0 ? round4(input.tongTlDinhMucLenhKg) : null,
      tong_tl_xuat_lenh_kg: input.tongTlXuatLenhKg > 0 ? round4(input.tongTlXuatLenhKg) : null
    });
    return stt;
  }

  for (const line of lines) {
    const tlDm = computeTrongLuongDinhMucKg(line);
    input.rows.push({
      khoa_on_dinh: khoa,
      ngay: line.ngay || group.ngay || '',
      ca: line.shift || group.shift || '',
      ca_label: line.shiftLabel || group.shiftLabel || null,
      may: line.machine || group.machine || '',
      ma_lenh: line.orderCode || group.orderCode || '',
      group_key: group.groupKey || group.orderCode || '',
      ma_sp: productGroup.productCode || null,
      ten_sp: productGroup.productName || null,
      don_vi_sp: productGroup.unit || null,
      sl_sp: productGroup.orderQuantity > 0 ? productGroup.orderQuantity : null,
      dinh_muc_sp_kg:
        productGroup.normKgPerUnit != null && productGroup.normKgPerUnit > 0
          ? round4(productGroup.normKgPerUnit)
          : null,
      tong_dinh_muc_sp_kg:
        productGroup.normWeightKg > 0 ? round4(productGroup.normWeightKg) : null,
      stt: stt++,
      ma_phieu: line.slipCode || null,
      slip_line_key: line.slipLineKey || line.key || null,
      ma_nvl: line.itemCode || null,
      ten_nvl: line.itemName || null,
      don_vi: line.unit || null,
      sl_dinh_muc:
        line.normQuantity != null && Number.isFinite(line.normQuantity)
          ? round4(line.normQuantity)
          : null,
      trong_luong_dinh_muc_kg: tlDm,
      sl_xuat: line.quantity > 0 ? round4(line.quantity) : null,
      trong_luong_xuat_kg:
        line.weightKg != null && line.weightKg > 0 ? round4(line.weightKg) : null,
      ti_le_percent: computeTrongLuongDinhMucPercent(line, groupTotalsByMaterial),
      khop_lenh: Boolean(line.matchedByOrder),
      so_dong_nvl_lenh: input.soDongNvlLenh,
      tong_tl_dinh_muc_lenh_kg:
        input.tongTlDinhMucLenhKg > 0 ? round4(input.tongTlDinhMucLenhKg) : null,
      tong_tl_xuat_lenh_kg: input.tongTlXuatLenhKg > 0 ? round4(input.tongTlXuatLenhKg) : null
    });
  }
  return stt;
}

/** Map exportGroups (tab Dữ liệu xuất kho) → dòng du_lieu_xuat_kho. */
export function buildDuLieuXuatKhoRowsFromExportGroups(input: {
  khoaOnDinh: string;
  exportGroups: BbWarehouseExportGroup[];
}): DuLieuXuatKhoRow[] {
  const khoa = String(input.khoaOnDinh || '').trim();
  if (!khoa) return [];

  const rows: DuLieuXuatKhoRow[] = [];
  for (const group of input.exportGroups || []) {
    const groupLines = (group.productGroups || []).flatMap(pg => pg.lines || []);
    const groupTotalsByMaterial = sumTrongLuongDinhMucKgByMaterial(groupLines);
    const tongTlDinhMucLenhKg = sumTrongLuongDinhMucKg(groupLines);
    const tongTlXuatLenhKg = group.totalWeightKg > 0 ? group.totalWeightKg : 0;
    const soDongNvlLenh = group.lineCount || groupLines.length;
    let stt = 1;

    const productGroups = group.productGroups || [];
    if (productGroups.length === 0) {
      // Lệnh có phiếu XK nhưng chưa gắn SP — vẫn lưu dòng NVL thô từ group.lines
      const fallbackProduct: BbWarehouseExportProductGroup = {
        productKey: '__unassigned__',
        productCode: '',
        productName: '',
        unit: '',
        orderQuantity: 0,
        normKgPerUnit: null,
        normWeightKg: 0,
        lineCount: group.lines?.length || 0,
        quantity: 0,
        totalWeightKg: group.totalWeightKg || 0,
        allocationMode: 'unassigned',
        lines: group.lines || []
      };
      stt = pushProductLines({
        khoa,
        group,
        productGroup: fallbackProduct,
        groupTotalsByMaterial,
        tongTlDinhMucLenhKg,
        tongTlXuatLenhKg,
        soDongNvlLenh,
        sttStart: stt,
        rows
      });
      continue;
    }

    for (const productGroup of productGroups) {
      stt = pushProductLines({
        khoa,
        group,
        productGroup,
        groupTotalsByMaterial,
        tongTlDinhMucLenhKg,
        tongTlXuatLenhKg,
        soDongNvlLenh,
        sttStart: stt,
        rows
      });
    }
  }
  return rows;
}
