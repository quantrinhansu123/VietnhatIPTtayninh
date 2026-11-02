import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionPlanRelatedReports } from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import { normalizeMachineNvlReports } from '../utils/machineNvlReports';
import { buildMachineShiftMaterialChecklist, formatChecklistStock } from './MachineShiftMaterialChecklistPrintSheet';

function checklist(catalog = true, overrides: Partial<ProductionPlanRelatedReports> = {}) {
  const materials = [
    { code: 'BK-BKT2cm', unit: 'Cuộn', totalWeight: '0.076', oldFactor: 0.000844, opening: 7, closing: 18, exported: 1.14, exportedQty: 15 },
    { code: 'BK-BKT5cm', unit: 'Cuộn', totalWeight: '0.158', oldFactor: 0.001756, opening: 1, closing: 6, exported: 0.948, exportedQty: 6 },
    { code: 'ONG-35CM', unit: 'Cái', totalWeight: '0.1', oldFactor: 0.09, opening: 40, closing: 0, exported: 0, exportedQty: 0 },
    { code: 'NHUA', unit: 'kg', totalWeight: '25', oldFactor: 1, opening: 10, closing: 2, exported: 0, exportedQty: 0 }
  ];
  const data = {
    productionOrders: [],
    materialCatalog: catalog ? materials : [],
    machineNvl: normalizeMachineNvlReports({ reports: ['dau_ca', 'cuoi_ca'].map(kind => ({
      loai_bao_cao: kind,
      chi_tiet: materials.map(item => ({
        ma_nvl: item.code,
        don_vi: item.unit,
        trong_luong_quy_doi_kg: item.oldFactor,
        so_luong_ton: kind === 'dau_ca' ? item.opening : item.closing
      }))
    })) }),
    warehouseExportSlips: [{ slipType: 'xuat', lines: materials.map(item => ({ code: item.code, unit: item.unit, quantity: item.exportedQty, weightKg: item.exported })) }],
    ...overrides
  } as unknown as ProductionPlanRelatedReports;
  return buildMachineShiftMaterialChecklist(data).lines;
}

test('tồn đầu/cuối và thực dùng lấy Tổng kg danh mục cho Cuộn/Cái, kg không nhân lại', () => {
  const rows = checklist();
  for (const [code, opening, closing, used] of [
    ['BK-BKT2cm', 0.532, 1.368, 0.304],
    ['BK-BKT5cm', 0.158, 0.948, 0.158],
    ['ONG-35CM', 4, null, null],
    ['NHUA', 10, 2, 8]
  ] as const) {
    const row = rows.find(item => item.maVatTu === code)!;
    assert.ok(Math.abs(row.tonDauCaKg! - opening) < 1e-9);
    if (closing == null) assert.equal(row.tonCuoiCaKg, null);
    else assert.ok(Math.abs(row.tonCuoiCaKg! - closing) < 1e-9);
    if (used != null) assert.ok(Math.abs(row.thucTeSuDungKg! - used) < 1e-9);
  }
});

test('lấy trong kho hiển thị kg và SL cùng nguồn phiếu xuất, không cộng thêm phiếu nhận', () => {
  const rows = checklist(true, {
    materialRequests: [{ lines: [{ ma_nvl: 'BK-BKT2cm', don_vi: 'Cuộn', so_luong: 2 }] }]
  } as unknown as Partial<ProductionPlanRelatedReports>);
  const tape = rows.find(row => row.maVatTu === 'BK-BKT2cm')!;
  assert.equal(tape.layTrongKhoQuantity, 15);
  assert.equal(formatChecklistStock(tape.layTrongKhoKg, tape.layTrongKhoQuantity, tape.donVi), '1,14(15)');
  assert.equal(rows.find(row => row.maVatTu === 'NHUA')!.layTrongKhoQuantity, undefined);
});

test('thiếu xuất kho thì lấy kg và SL từ phiếu nhận NVL, cộng đủ các dòng cùng mã', () => {
  const rows = checklist(true, {
    warehouseExportSlips: [],
    materialRequests: [{ lines: [
      { ma_nvl: 'BK-BKT2cm', don_vi: 'Cuộn', so_luong: 2 },
      { ma_nvl: 'BK-BKT2cm', don_vi: 'Cuộn', so_luong: 5 }
    ] }]
  } as unknown as Partial<ProductionPlanRelatedReports>);
  const tape = rows.find(row => row.maVatTu === 'BK-BKT2cm')!;
  assert.equal(tape.layTrongKhoQuantity, 7);
  assert.equal(formatChecklistStock(tape.layTrongKhoKg, tape.layTrongKhoQuantity, tape.donVi), '0,532(7)');
});

test('chưa tải được danh mục vẫn dùng hệ số đã lưu trên phiếu', () => {
  const row = checklist(false).find(item => item.maVatTu === 'BK-BKT2cm')!;
  assert.equal(row.tonDauCaKg, 7 * 0.000844);
  assert.equal(row.tonCuoiCaKg, 18 * 0.000844);
});

test('hiện kg kèm số cuộn/cái gốc trong ngoặc; dòng kg và ô trống giữ định dạng cũ', () => {
  const rows = checklist();
  const tape = rows.find(row => row.maVatTu === 'BK-BKT2cm')!;
  assert.equal(tape.tonDauCaQuantity, 7);
  assert.equal(tape.tonCuoiCaQuantity, 18);
  assert.equal(formatChecklistStock(tape.tonDauCaKg, tape.tonDauCaQuantity, tape.donVi), '0,532(7)');
  assert.equal(formatChecklistStock(tape.tonCuoiCaKg, tape.tonCuoiCaQuantity, tape.donVi), '1,368(18)');
  const core = rows.find(row => row.maVatTu === 'ONG-35CM')!;
  assert.equal(formatChecklistStock(core.tonDauCaKg, core.tonDauCaQuantity, core.donVi), '4(40)');
  const plastic = rows.find(row => row.maVatTu === 'NHUA')!;
  assert.equal(plastic.tonDauCaQuantity, undefined);
  assert.equal(formatChecklistStock(plastic.tonDauCaKg, plastic.tonDauCaQuantity, plastic.donVi), '10');
  assert.equal(formatChecklistStock(null, undefined, undefined), '');
});

test('dòng hiển thị kg không có ngoặc dù phiếu nguồn lưu số lượng theo Lít', () => {
  for (const unit of ['kg', ' KG ', 'kilogram', 'kg/sp']) {
    assert.equal(formatChecklistStock(14, 14, unit), '14');
  }
  assert.equal(formatChecklistStock(0.532, 7, 'Cuộn'), '0,532(7)');
  assert.equal(formatChecklistStock(14, 14, undefined), '14');
});
