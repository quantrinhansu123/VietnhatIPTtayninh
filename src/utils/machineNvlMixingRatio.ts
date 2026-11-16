import type { MixingReport } from '../components/MixingReportForm';
import {
  getRoundItems,
  MIXING_ROUND_KEYS,
  resolveLineKlThucTe,
  resolveMixingTiLeThucTePercent
} from '../lib/mixingReportModel';
import { shiftNamesMatch } from './shiftSettings';
import {
  isMachineNvlTronMaterial,
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal,
  type MachineNvlSavedLine,
  type MachineNvlSavedReport
} from './machineNvlReports';
import type { WarehouseWeightCatalogItem } from './warehouseWeight';

export type MachineNvlMixingRatioRow = {
  maNvl: string;
  tenNvl: string;
  donVi: string;
  tiLeDinhMucPercent: number | null;
  tiLeThucTePercent: number | null;
  klThucTe: number;
};

export type MachineNvlAllocatedMixingRow = {
  maNvl: string;
  tenNvl: string;
  donVi: string;
  slTon: number;
  tiLePercent: number | null;
  daTronKg: number;
  tonNgoaiKg: number;
  tongKg: number;
};

function normalizeMachineKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');
}

function extractMachineNumber(value: string) {
  const match = String(value || '').match(/(\d{1,3})/);
  return match ? Number(match[1]) : null;
}

export function machineNvlMachinesMatch(
  leftCode: string,
  leftName: string,
  rightCode: string,
  rightName: string
) {
  const lc = normalizeMachineKey(leftCode);
  const ln = normalizeMachineKey(leftName);
  const rc = normalizeMachineKey(rightCode);
  const rn = normalizeMachineKey(rightName);
  if (lc && rc && lc === rc) return true;
  if (ln && rn && ln === rn) return true;
  if (lc && (lc === rn || lc === normalizeMachineKey(rightName))) return true;
  if (rc && (rc === ln || rc === normalizeMachineKey(leftName))) return true;
  const leftNo = extractMachineNumber(leftCode || leftName);
  const rightNo = extractMachineNumber(rightCode || rightName);
  if (leftNo != null && rightNo != null && leftNo === rightNo) {
    const leftText = `${leftCode} ${leftName}`.toLowerCase();
    const rightText = `${rightCode} ${rightName}`.toLowerCase();
    const bothBb =
      (leftText.includes('bao bi') || leftText.includes('mbb') || /\bbb\b/.test(leftText)) &&
      (rightText.includes('bao bi') || rightText.includes('mbb') || /\bbb\b/.test(rightText));
    if (bothBb) return true;
  }
  return false;
}

function materialKey(code: string, name: string) {
  const codeKey = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
  if (codeKey) return `c:${codeKey}`;
  const nameKey = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return nameKey ? `n:${nameKey}` : '';
}

export function isMachineNvlNhuaTronMaterial(code: string, name = '') {
  const key = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
  if (key === 'NHUA-TRON' || key === 'NHUATRON' || key.startsWith('NHUA-TRON')) return true;
  const nameKey = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (/\bnhua[- ]?tron\b/.test(nameKey) || nameKey.includes('nhua tron')) return true;
  if (nameKey.includes('da tron') && (nameKey.includes('nhua') || nameKey.includes('nguyen lieu'))) {
    return true;
  }
  return nameKey.includes('nguyen sinh') && nameKey.includes('tai che') && nameKey.includes('tron');
}

function isNnsTronMaterial(code: string, name = '') {
  const key = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-');
  if (key === 'NNS-TRON' || key === 'NNSTRON') return true;
  const nameKey = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return nameKey.includes('nns') && nameKey.includes('tron');
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Gom tỉ lệ trộn từ báo cáo phối trộn đúng ngày · ca · máy.
 * Tỉ lệ thực tế = KL NVL ÷ tổng KL × 100 (cùng công thức danh sách phối trộn).
 */
export function buildMachineNvlMixingRatioRows(
  mixingReports: MixingReport[],
  opts: { ngay: string; ca: string; maMay: string; tenMay: string }
): MachineNvlMixingRatioRow[] {
  const ngay = String(opts.ngay || '').trim();
  const ca = String(opts.ca || '').trim();
  if (!ngay || !ca) return [];

  const byMaterial = new Map<
    string,
    {
      maNvl: string;
      tenNvl: string;
      donVi: string;
      klSum: number;
      tiLeDinhMucSum: number;
      tiLeDinhMucCount: number;
    }
  >();

  for (const report of mixingReports) {
    if (String(report.ngay || '').trim() !== ngay) continue;
    if (!shiftNamesMatch(ca, String(report.ca || '').trim())) continue;
    if (!machineNvlMachinesMatch(opts.maMay, opts.tenMay, report.ma_may || '', report.ten_may || '')) {
      continue;
    }

    for (const line of report.chi_tiet || []) {
      const lineCode = String(line.ma_nvl || '').trim();
      const lineName = String(line.ten_vat_tu || '').trim();
      let countedItemWeight = false;

      for (const roundKey of MIXING_ROUND_KEYS) {
        const items = getRoundItems(line.lan_su_dung, roundKey);
        for (const item of items) {
          const code = String(item.ma_nvl || lineCode || '').trim();
          const name = String(item.ten_vat_tu || lineName || '').trim();
          const key = materialKey(code, name);
          if (!key) continue;
          const unit = String(item.don_vi || line.don_vi || 'kg').trim() || 'kg';
          let stat = byMaterial.get(key);
          if (!stat) {
            stat = {
              maNvl: code,
              tenNvl: name,
              donVi: unit,
              klSum: 0,
              tiLeDinhMucSum: 0,
              tiLeDinhMucCount: 0
            };
            byMaterial.set(key, stat);
          } else {
            if (!stat.maNvl && code) stat.maNvl = code;
            if (!stat.tenNvl && name) stat.tenNvl = name;
            if (!stat.donVi && unit) stat.donVi = unit;
          }

          const dinhMuc = item.ti_le_phan_tram;
          if (dinhMuc != null && Number.isFinite(dinhMuc)) {
            stat.tiLeDinhMucSum += dinhMuc;
            stat.tiLeDinhMucCount += 1;
          }

          const kl = item.kl_thuc_te;
          if (kl != null && Number.isFinite(kl) && kl > 0) {
            countedItemWeight = true;
            stat.klSum += kl;
          }
        }
      }

      if (countedItemWeight) continue;
      const lineKl = resolveLineKlThucTe(line);
      if (lineKl == null || !(lineKl > 0)) continue;
      const key = materialKey(lineCode, lineName);
      if (!key) continue;
      let stat = byMaterial.get(key);
      if (!stat) {
        stat = {
          maNvl: lineCode,
          tenNvl: lineName,
          donVi: String(line.don_vi || 'kg').trim() || 'kg',
          klSum: 0,
          tiLeDinhMucSum: 0,
          tiLeDinhMucCount: 0
        };
        byMaterial.set(key, stat);
      }
      stat.klSum += lineKl;
    }
  }

  const totalKl = [...byMaterial.values()].reduce((sum, row) => sum + (row.klSum > 0 ? row.klSum : 0), 0);
  const rows = [...byMaterial.values()]
    .map(row => {
      const tiLeThucTePercent =
        row.klSum > 0 && totalKl > 0 ? resolveMixingTiLeThucTePercent(row.klSum, totalKl) : null;
      const tiLeDinhMucPercent =
        row.tiLeDinhMucCount > 0 ? row.tiLeDinhMucSum / row.tiLeDinhMucCount : null;
      return {
        maNvl: row.maNvl,
        tenNvl: row.tenNvl,
        donVi: row.donVi,
        tiLeDinhMucPercent:
          tiLeDinhMucPercent != null && Number.isFinite(tiLeDinhMucPercent) ? tiLeDinhMucPercent : null,
        tiLeThucTePercent:
          tiLeThucTePercent != null && Number.isFinite(tiLeThucTePercent) ? tiLeThucTePercent : null,
        klThucTe: round4(row.klSum)
      } satisfies MachineNvlMixingRatioRow;
    })
    .filter(row => row.maNvl || row.tenNvl)
    .sort((a, b) => (a.maNvl || a.tenNvl).localeCompare(b.maNvl || b.tenNvl, 'vi'));

  return rows;
}

function lineTonKg(
  line: MachineNvlSavedLine,
  isDauCa: boolean,
  catalog?: WarehouseWeightCatalogItem[] | null
) {
  return isDauCa
    ? sumMachineNvlDauCaLineTotal(line, catalog)
    : sumMachineNvlCuoiCaLineTotal(line, catalog);
}

/**
 * Bảng phân bổ tồn theo Excel: Đã trộn = NHUA-TRON × tỉ lệ thực tế; Tồn ngoài = SL TỒN từng mã.
 * Ẩn dòng NHUA-TRON / NNS-TRON.
 */
export function buildMachineNvlAllocatedMixingTable(
  report: MachineNvlSavedReport,
  ratioRows: MachineNvlMixingRatioRow[],
  catalog?: WarehouseWeightCatalogItem[] | null
): {
  rows: MachineNvlAllocatedMixingRow[];
  nhuaTronKg: number;
  totalDaTronKg: number;
  totalTonNgoaiKg: number;
  totalKg: number;
  allocatedFromNhuaTron: boolean;
} {
  const isDauCa = report.reportKind === 'dau_ca';
  const mixingLines = report.lines.filter(line =>
    isMachineNvlTronMaterial(line.maNvl, line.donVi)
  );

  let nhuaTronKg = 0;
  const baseLines: MachineNvlSavedLine[] = [];
  for (const line of mixingLines) {
    if (isMachineNvlNhuaTronMaterial(line.maNvl, line.tenNvl)) {
      const kg = lineTonKg(line, isDauCa, catalog);
      if (kg > 0) nhuaTronKg += kg;
      continue;
    }
    if (isNnsTronMaterial(line.maNvl, line.tenNvl)) continue;
    baseLines.push(line);
  }
  nhuaTronKg = round4(nhuaTronKg);

  const ratioByCode = new Map<string, number>();
  const ratioByName = new Map<string, number>();
  for (const row of ratioRows) {
    if (row.tiLeThucTePercent == null || !(row.tiLeThucTePercent > 0)) continue;
    const codeKey = materialKey(row.maNvl, '');
    const nameKey = materialKey('', row.tenNvl);
    if (codeKey) ratioByCode.set(codeKey, row.tiLeThucTePercent);
    if (nameKey) ratioByName.set(nameKey, row.tiLeThucTePercent);
  }

  const lookupTiLe = (code: string, name: string) => {
    const byCode = ratioByCode.get(materialKey(code, ''));
    if (byCode != null) return byCode;
    return ratioByName.get(materialKey('', name)) ?? null;
  };

  // Seed thêm mã có tỉ lệ nhưng chưa có trên phiếu tồn (tồn ngoài = 0).
  const seen = new Set(baseLines.map(line => materialKey(line.maNvl, line.tenNvl)).filter(Boolean));
  const seeded = [...baseLines];
  if (nhuaTronKg > 0) {
    for (const ratio of ratioRows) {
      if (ratio.tiLeThucTePercent == null || !(ratio.tiLeThucTePercent > 0)) continue;
      if (isMachineNvlNhuaTronMaterial(ratio.maNvl, ratio.tenNvl)) continue;
      if (isNnsTronMaterial(ratio.maNvl, ratio.tenNvl)) continue;
      const key = materialKey(ratio.maNvl, ratio.tenNvl);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      seeded.push({
        stt: seeded.length + 1,
        maNvl: ratio.maNvl,
        tenNvl: ratio.tenNvl,
        donVi: ratio.donVi || 'kg',
        trongLuongQuyDoiKg: null,
        loaiVatTu: 'nhua',
        soLuongTonCaTruoc: null,
        soLuongTrongMay: null,
        soLuongTrongBonTron: null,
        soLuongNlChuaTron: null,
        soLuongTonNgoai: null,
        soLuongTonDinhMuc: null,
        soLuongTon: 0,
        ghiChu: '',
        hinhAnh: '',
        hinhAnhPublicId: ''
      });
    }
  }

  const allocatedFromNhuaTron = nhuaTronKg > 0;
  const rows = seeded
    .map(line => {
      const tonNgoaiKg = round4(Math.max(0, lineTonKg(line, isDauCa, catalog)));
      const tiLe = lookupTiLe(line.maNvl, line.tenNvl);
      const daTronKg =
        allocatedFromNhuaTron && tiLe != null ? round4(nhuaTronKg * (tiLe / 100)) : 0;
      const tongKg = round4(daTronKg + tonNgoaiKg);
      return {
        maNvl: line.maNvl,
        tenNvl: line.tenNvl,
        donVi: line.donVi || 'kg',
        slTon: line.soLuongTon,
        tiLePercent: tiLe,
        daTronKg,
        tonNgoaiKg,
        tongKg
      } satisfies MachineNvlAllocatedMixingRow;
    })
    .filter(row => row.tongKg > 0 || row.tiLePercent != null || row.slTon > 0)
    .sort((a, b) => (a.maNvl || a.tenNvl).localeCompare(b.maNvl || b.tenNvl, 'vi'));

  const totalDaTronKg = allocatedFromNhuaTron
    ? nhuaTronKg
    : round4(rows.reduce((sum, row) => sum + row.daTronKg, 0));
  const totalTonNgoaiKg = round4(rows.reduce((sum, row) => sum + row.tonNgoaiKg, 0));
  const totalKg = round4(rows.reduce((sum, row) => sum + row.tongKg, 0));

  return {
    rows,
    nhuaTronKg,
    totalDaTronKg,
    totalTonNgoaiKg,
    totalKg,
    allocatedFromNhuaTron
  };
}
