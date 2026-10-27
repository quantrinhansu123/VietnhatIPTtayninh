import React, { useMemo } from 'react';
import { formatNumber } from '../utils';
import { normalizeProductCodeKey } from '../features/san-pham/types';
import {
  sumMachineNvlCuoiCaLineTotal,
  sumMachineNvlDauCaLineTotal,
  type MachineNvlSavedReport
} from '../utils/machineNvlReports';
import {
  getRoundItems,
  mixingSessionLabel,
  MIXING_ROUND_KEYS,
  visibleRoundCount
} from '../lib/mixingReportModel';
import type { MixingReport } from './MixingReportForm';
import type { ProductionPlanRelatedReports } from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import type { ProductionOrderMaterialLine } from '../features/ke-hoach-san-xuat';
import type { WarehouseSlipPrintData } from './WarehouseSlipPrintModal';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from './layout/constants';

export type MachineShiftMaterialChecklistLine = {
  key: string;
  maVatTu: string;
  tenVatTu: string;
  donVi: string;
  dinhMucKg: number | null;
  tiLePercent: number | null;
  tonDauCaKg: number | null;
  layTrongKhoKg: number | null;
  /** Tổng thực trộn mọi lần (dùng tính TT SD). */
  thucTronKg: number | null;
  /** KL thực trộn theo số lần tuyệt đối (lan_thu + index). */
  thucTronByLan: Record<number, number>;
  tonCuoiCaKg: number | null;
  thucTeSuDungKg: number | null;
};

export type MachineShiftMaterialChecklistBuild = {
  lines: MachineShiftMaterialChecklistLine[];
  /** Các lần trộn có dữ liệu, sắp tăng dần — dùng làm cột in. */
  mixingSessions: number[];
};

/** Mẫu giấy QT 11-BM04: cố định Lần 1–5; nếu phiếu có nhiều hơn thì mở rộng. */
const FORM_MIXING_ROUND_COUNT = 5;
const MIN_BODY_ROWS = 20;

function formatPrintDateParts(iso: string) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { day: '...', month: '...', year: '...' };
  return { day: match[3], month: match[2], year: match[1] };
}

/** Cột lần trên mẫu: ít nhất 1→5; thêm nếu dữ liệu có lần > 5. */
function buildDisplayMixingSessions(sessions: number[]) {
  const maxFromData = sessions.length > 0 ? Math.max(...sessions) : FORM_MIXING_ROUND_COUNT;
  const count = Math.max(FORM_MIXING_ROUND_COUNT, maxFromData);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function formatQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return '';
  return formatNumber(value, 2);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '';
  return `${formatNumber(value, 2)}%`;
}

function positiveOrNull(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** «Máy Bao bì Số: 16» nếu nhận diện được; không thì hiện tên/mã máy. */
export function formatChecklistMachineHeader(code = '', name = '') {
  const rawCode = String(code || '').trim();
  const rawName = String(name || '').trim();
  const hay = `${rawName} ${rawCode}`.trim();
  const isBaoBi = /bao\s*b[iì]|mbb/i.test(hay);
  const numMatch = hay.match(/(?:s[oố]|so|#)?\s*(\d+)\s*$/i) || rawCode.match(/(\d+)/);
  if (isBaoBi && numMatch?.[1]) return `Máy Bao bì Số: ${numMatch[1]}`;
  if (rawName && rawName !== '-' && rawName !== rawCode) return rawName;
  return rawCode || '—';
}

/** Ca trên form giấy thường ghi 1 / 2; map 12C1→1, HC1→1 khi khớp. */
export function formatChecklistShiftLabel(shift = '') {
  const raw = String(shift || '').trim();
  if (!raw) return '—';
  const twelve = raw.match(/^12\s*C\s*(\d+)$/i);
  if (twelve) return twelve[1];
  const hc = raw.match(/^HC\s*(\d+)$/i);
  if (hc) return hc[1];
  const caNum = raw.match(/^ca\s*(\d+)$/i);
  if (caNum) return caNum[1];
  return raw;
}

function materialMergeKey(code: string, unit: string) {
  return `${normalizeProductCodeKey(code)}__${String(unit || '').trim().toUpperCase() || '-'}`;
}

function addToQtyMap(map: Map<string, number>, code: string, qty: number) {
  const key = normalizeProductCodeKey(code);
  if (!key || !Number.isFinite(qty) || qty === 0) return;
  map.set(key, (map.get(key) || 0) + qty);
}

function openingStockByCode(reports: MachineNvlSavedReport[]) {
  const map = new Map<string, number>();
  for (const report of reports) {
    if (report.reportKind !== 'dau_ca') continue;
    for (const line of report.lines || []) {
      const code = String(line.maNvl || '').trim();
      if (!code) continue;
      // Ưu tiên tổng kg (máy+bồn+chưa trộn+ngoài); nếu 0 thì lấy soLuongTon thô.
      const kg = sumMachineNvlDauCaLineTotal(line);
      const raw = Number(line.soLuongTon);
      addToQtyMap(map, code, kg > 0 ? kg : Number.isFinite(raw) && raw > 0 ? raw : 0);
    }
  }
  return map;
}

/** Tồn đầu từ snapshot BB (tab tồn đầu ca) — nguồn đã khớp ngày·ca·máy khi Tính toán. */
function openingStockFromTotalReport(data: ProductionPlanRelatedReports) {
  const map = new Map<string, number>();
  const groups = data.totalReport?.dauCaGroups || [];
  for (const group of groups) {
    for (const line of group.materialLines || []) {
      const code = String(line.itemCode || '').trim();
      if (!code) continue;
      const kg = Number(line.tonDauWeightKg);
      const qty = Number(line.tonDauQuantity);
      addToQtyMap(map, code, kg > 0 ? kg : qty > 0 ? qty : 0);
    }
    for (const row of group.lines || []) {
      const code = String(row.itemCode || '').trim();
      if (!code) continue;
      const kg = Number(row.weightKg);
      const qty = Number(row.quantity);
      // Chỉ bổ sung nếu mã chưa có từ materialLines.
      if (map.has(normalizeProductCodeKey(code))) continue;
      addToQtyMap(map, code, kg > 0 ? kg : qty > 0 ? qty : 0);
    }
  }
  const rows = data.totalReport?.dauCaRows || [];
  for (const row of rows) {
    const code = String(row.itemCode || '').trim();
    if (!code) continue;
    if (map.has(normalizeProductCodeKey(code))) continue;
    const kg = Number(row.weightKg);
    const qty = Number(row.quantity);
    addToQtyMap(map, code, kg > 0 ? kg : qty > 0 ? qty : 0);
  }
  return map;
}

function closingStockByCode(reports: MachineNvlSavedReport[]) {
  const map = new Map<string, number>();
  for (const report of reports) {
    if (report.reportKind !== 'cuoi_ca') continue;
    for (const line of report.lines || []) {
      const code = String(line.maNvl || '').trim();
      if (!code) continue;
      addToQtyMap(map, code, sumMachineNvlCuoiCaLineTotal(line));
    }
  }
  return map;
}

function warehouseExportByCode(slips: WarehouseSlipPrintData[]) {
  const map = new Map<string, number>();
  for (const slip of slips || []) {
    if (slip.slipType !== 'xuat') continue;
    for (const line of slip.lines || []) {
      const code = String(line.code || '').trim();
      if (!code) continue;
      const qty =
        line.weightKg != null && Number.isFinite(line.weightKg)
          ? Number(line.weightKg)
          : Number(line.quantity) || 0;
      addToQtyMap(map, code, qty);
    }
  }
  return map;
}

function roundItemActualQty(item: { kl_thuc_te?: number | null; so_luong?: number | null }) {
  if (item.kl_thuc_te != null && Number.isFinite(item.kl_thuc_te)) return Number(item.kl_thuc_te);
  if (item.so_luong != null && Number.isFinite(item.so_luong)) return Number(item.so_luong);
  return 0;
}

/** Gom thực trộn theo mã NVL + số lần tuyệt đối (giữ từng lần, không gộp mất). */
function mixingActualBySessions(reports: MixingReport[]) {
  const totals = new Map<string, number>();
  const byCodeSession = new Map<string, Map<number, number>>();
  const sessionSet = new Set<number>();
  const materials: Array<{ code: string; name: string; unit: string }> = [];

  const addQty = (code: string, session: number, qty: number) => {
    const key = normalizeProductCodeKey(code);
    if (!key || !Number.isFinite(qty) || qty === 0) return;
    sessionSet.add(session);
    totals.set(key, (totals.get(key) || 0) + qty);
    let perSession = byCodeSession.get(key);
    if (!perSession) {
      perSession = new Map();
      byCodeSession.set(key, perSession);
    }
    perSession.set(session, (perSession.get(session) || 0) + qty);
  };

  const rememberMaterial = (code: string, name: string, unit: string) => {
    if (!code) return;
    materials.push({ code, name, unit: unit || 'kg' });
  };

  for (const report of reports || []) {
    const sessionStart = report.lan_thu && report.lan_thu > 0 ? report.lan_thu : 1;
    const declaredRounds = Math.max(
      Number(report.so_lan) || 0,
      ...(report.chi_tiet || []).map(line => visibleRoundCount(line.lan_su_dung || {})),
      1
    );
    // Hiện đủ cột lần theo phiếu (kể cả lần chưa nhập KL).
    for (let i = 0; i < declaredRounds; i += 1) {
      sessionSet.add(sessionStart + i);
    }

    for (const line of report.chi_tiet || []) {
      const lineCode = String(line.ma_nvl || '').trim();
      const lineName = String(line.ten_vat_tu || '').trim();
      const lineUnit = String(line.don_vi || '').trim() || 'kg';
      if (lineCode) rememberMaterial(lineCode, lineName, lineUnit);

      let hasRoundQty = false;
      MIXING_ROUND_KEYS.forEach((roundKey, roundIndex) => {
        const session = sessionStart + roundIndex;
        for (const item of getRoundItems(line.lan_su_dung || {}, roundKey)) {
          const code = String(item.ma_nvl || lineCode || '').trim();
          if (!code) continue;
          const qty = roundItemActualQty(item);
          if (!qty) continue;
          hasRoundQty = true;
          rememberMaterial(code, String(item.ten_vat_tu || lineName || '').trim(), String(item.don_vi || lineUnit).trim());
          addQty(code, session, qty);
        }
      });

      if (hasRoundQty || !lineCode) continue;
      if (line.tong_nhua_tron != null && Number.isFinite(line.tong_nhua_tron) && Number(line.tong_nhua_tron) !== 0) {
        addQty(lineCode, sessionStart, Number(line.tong_nhua_tron));
      } else if (line.kl_thuc_te != null && Number.isFinite(line.kl_thuc_te) && Number(line.kl_thuc_te) !== 0) {
        addQty(lineCode, sessionStart, Number(line.kl_thuc_te));
      }
    }
  }

  const sessions = Array.from(sessionSet).sort((a, b) => a - b);
  return { totals, byCodeSession, sessions, materials };
}

function aggregateMaterialsFromOrders(
  orders: ProductionPlanRelatedReports['productionOrders']
): MachineShiftMaterialChecklistLine[] {
  type Acc = {
    maVatTu: string;
    tenVatTu: string;
    donVi: string;
    dinhMucKg: number;
    percentWeightSum: number;
    percentWeightBase: number;
  };
  const map = new Map<string, Acc>();

  for (const item of orders) {
    const materials: ProductionOrderMaterialLine[] = item.materials || [];
    for (const line of materials) {
      const code = String(line.code || '').trim();
      if (!code) continue;
      const unit = String(line.unit || '').trim() || 'kg';
      const key = materialMergeKey(code, unit);
      const dinhMuc =
        line.weightKg != null && Number.isFinite(line.weightKg)
          ? Number(line.weightKg)
          : Number.isFinite(line.proposedQuantity)
            ? Number(line.proposedQuantity)
            : 0;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          maVatTu: code,
          tenVatTu: String(line.name || '').trim(),
          donVi: unit,
          dinhMucKg: dinhMuc,
          percentWeightSum:
            line.percent != null && Number.isFinite(line.percent) ? Number(line.percent) * Math.max(dinhMuc, 0) : 0,
          percentWeightBase:
            line.percent != null && Number.isFinite(line.percent) ? Math.max(dinhMuc, 0) : 0
        });
        continue;
      }
      existing.dinhMucKg += dinhMuc;
      if (!existing.tenVatTu && line.name) existing.tenVatTu = String(line.name).trim();
      if (line.percent != null && Number.isFinite(line.percent)) {
        existing.percentWeightSum += Number(line.percent) * Math.max(dinhMuc, 0);
        existing.percentWeightBase += Math.max(dinhMuc, 0);
      }
    }
  }

  return [...map.entries()].map(([key, row]) => ({
    key,
    maVatTu: row.maVatTu,
    tenVatTu: row.tenVatTu,
    donVi: row.donVi,
    dinhMucKg: row.dinhMucKg > 0 ? row.dinhMucKg : null,
    tiLePercent: row.percentWeightBase > 0 ? row.percentWeightSum / row.percentWeightBase : null,
    tonDauCaKg: null,
    layTrongKhoKg: null,
    thucTronKg: null,
    thucTronByLan: {},
    tonCuoiCaKg: null,
    thucTeSuDungKg: null
  }));
}

function ensureMaterialRow(
  lines: MachineShiftMaterialChecklistLine[],
  code: string,
  name: string,
  unit: string
) {
  const key = materialMergeKey(code, unit);
  if (lines.some(row => row.key === key || normalizeProductCodeKey(row.maVatTu) === normalizeProductCodeKey(code))) {
    return;
  }
  lines.push({
    key,
    maVatTu: code,
    tenVatTu: name,
    donVi: unit || 'kg',
    dinhMucKg: null,
    tiLePercent: null,
    tonDauCaKg: null,
    layTrongKhoKg: null,
    thucTronKg: null,
    thucTronByLan: {},
    tonCuoiCaKg: null,
    thucTeSuDungKg: null
  });
}

export function buildMachineShiftMaterialChecklist(
  data: ProductionPlanRelatedReports
): MachineShiftMaterialChecklistBuild {
  const lines = aggregateMaterialsFromOrders(data.productionOrders || []);
  const tonDauFromReports = openingStockByCode(data.machineNvl || []);
  const tonDauFromSnapshot = openingStockFromTotalReport(data);
  // Ưu tiên phiếu tồn đầu ca; mã còn trống mới lấy snapshot BB (sau Tính toán).
  const tonDauMap = new Map<string, number>(tonDauFromReports);
  for (const [key, value] of tonDauFromSnapshot) {
    if ((tonDauMap.get(key) || 0) > 0) continue;
    tonDauMap.set(key, value);
  }
  const tonCuoiMap = closingStockByCode(data.machineNvl || []);
  const xuatMap = warehouseExportByCode(data.warehouseExportSlips || []);
  const mixingAgg = mixingActualBySessions(data.mixing || []);

  for (const report of data.machineNvl || []) {
    for (const line of report.lines || []) {
      const code = String(line.maNvl || '').trim();
      if (!code) continue;
      ensureMaterialRow(lines, code, String(line.tenNvl || '').trim(), String(line.donVi || '').trim() || 'kg');
    }
  }
  for (const group of data.totalReport?.dauCaGroups || []) {
    for (const line of group.materialLines || []) {
      const code = String(line.itemCode || '').trim();
      if (!code) continue;
      ensureMaterialRow(lines, code, String(line.itemName || '').trim(), String(line.unit || '').trim() || 'kg');
    }
    for (const row of group.lines || []) {
      const code = String(row.itemCode || '').trim();
      if (!code) continue;
      ensureMaterialRow(lines, code, String(row.itemName || '').trim(), String(row.unit || '').trim() || 'kg');
    }
  }
  for (const slip of data.warehouseExportSlips || []) {
    for (const line of slip.lines || []) {
      const code = String(line.code || '').trim();
      if (!code) continue;
      ensureMaterialRow(lines, code, String(line.name || '').trim(), String(line.unit || '').trim() || 'kg');
    }
  }
  for (const material of mixingAgg.materials) {
    ensureMaterialRow(lines, material.code, material.name, material.unit);
  }

  for (const row of lines) {
    const codeKey = normalizeProductCodeKey(row.maVatTu);
    row.tonDauCaKg = positiveOrNull(tonDauMap.get(codeKey));
    row.tonCuoiCaKg = positiveOrNull(tonCuoiMap.get(codeKey));
    row.layTrongKhoKg = positiveOrNull(xuatMap.get(codeKey));
    row.thucTronKg = positiveOrNull(mixingAgg.totals.get(codeKey));
    const perSession = mixingAgg.byCodeSession.get(codeKey);
    row.thucTronByLan = {};
    if (perSession) {
      for (const [session, qty] of perSession) {
        if (qty > 0) row.thucTronByLan[session] = qty;
      }
    }

    // Công thức form: TT SD = Tồn đầu + Thực trộn − Tồn cuối (ưu tiên);
    // nếu không có thực trộn thì dùng Lấy kho thay thế.
    const dau = row.tonDauCaKg ?? 0;
    const cuoi = row.tonCuoiCaKg;
    const tron = row.thucTronKg;
    const lay = row.layTrongKhoKg;
    if (cuoi != null && (tron != null || lay != null || row.tonDauCaKg != null)) {
      const mid = tron != null ? tron : lay ?? 0;
      row.thucTeSuDungKg = positiveOrNull(dau + mid - cuoi);
    } else {
      row.thucTeSuDungKg = null;
    }
  }

  return {
    lines: lines.sort((a, b) => a.maVatTu.localeCompare(b.maVatTu, 'vi')),
    mixingSessions: mixingAgg.sessions.length > 0 ? mixingAgg.sessions : [1]
  };
}

function sumCol(lines: MachineShiftMaterialChecklistLine[], pick: (row: MachineShiftMaterialChecklistLine) => number | null) {
  return lines.reduce((sum, row) => sum + (pick(row) ?? 0), 0);
}

export function MachineShiftMaterialChecklistPrintSheet({
  data,
  date,
  shift,
  machineCode,
  machineName
}: {
  data: ProductionPlanRelatedReports;
  date: string;
  shift: string;
  machineCode?: string;
  machineName?: string;
}) {
  const { lines, mixingSessions } = useMemo(() => buildMachineShiftMaterialChecklist(data), [data]);
  const displaySessions = useMemo(() => buildDisplayMixingSessions(mixingSessions), [mixingSessions]);
  const bodyRows = useMemo(() => {
    const rows: Array<MachineShiftMaterialChecklistLine | null> = [...lines];
    while (rows.length < MIN_BODY_ROWS) rows.push(null);
    return rows;
  }, [lines]);

  const machineHeader = formatChecklistMachineHeader(machineCode, machineName);
  const shiftLabel = formatChecklistShiftLabel(shift);
  const dateParts = formatPrintDateParts(date);
  const tronColCount = displaySessions.length;
  const totalDinhMuc = sumCol(lines, row => row.dinhMucKg);
  const totalTonDau = sumCol(lines, row => row.tonDauCaKg);
  const totalXuat = sumCol(lines, row => row.layTrongKhoKg);
  const totalTron = sumCol(lines, row => row.thucTronKg);
  const totalTonCuoi = sumCol(lines, row => row.tonCuoiCaKg);
  const totalSuDung = sumCol(lines, row => row.thucTeSuDungKg);
  const totalTronByLan = displaySessions.map(session =>
    lines.reduce((sum, row) => sum + (row.thucTronByLan[session] || 0), 0)
  );
  const tronColWidth = Math.max(3.5, Math.min(5.5, 30 / (tronColCount + 1)));

  return (
    <div className="bb-nvl-checklist-print-batch" aria-hidden>
      <div className="bb-nvl-checklist-print-page">
        <div className="bb-nvl-checklist-sheet bb-nvl-checklist-sheet-landscape">
          <header className="bb-nvl-checklist-header">
            <div className="bb-nvl-checklist-header-left">
              <img
                src={vietNhatLogoUrl}
                alt={PRINT_COMPANY_NAME}
                className="bb-nvl-checklist-logo"
              />
              <div className="bb-nvl-checklist-brand-block">
                <div className="bb-nvl-checklist-brand">{PRINT_COMPANY_NAME}</div>
                <div className="bb-nvl-checklist-brand-sub">VIETNHATIPT</div>
              </div>
            </div>
            <div className="bb-nvl-checklist-header-center">
              <div className="bb-nvl-checklist-title">NHẬT KÝ SẢN XUẤT KIÊM PHIẾU GIAO CA</div>
              <div className="bb-nvl-checklist-subtitle">(BẢNG TRỘN VẬT TƯ)</div>
              <div className="bb-nvl-checklist-date">
                Ca sản xuất từ ..... Đến ..... ngày {dateParts.day} tháng {dateParts.month} năm{' '}
                {dateParts.year}
              </div>
              <div className="bb-nvl-checklist-date">Người thực hiện: ....................</div>
            </div>
            <div className="bb-nvl-checklist-header-right">
              <div className="bb-nvl-checklist-doc-meta">
                <div>Ký hiệu: QT 11-BM04</div>
                <div>Lần ban hành: 04</div>
                <div>Ngày hiệu lực: 01/04/2023</div>
              </div>
              <div className="bb-nvl-checklist-meta-line">
                <span className="bb-nvl-checklist-meta-label">{machineHeader}</span>
              </div>
              <div className="bb-nvl-checklist-meta-line">
                <span className="bb-nvl-checklist-meta-label">Ca:</span>
                <span className="bb-nvl-checklist-meta-value">{shiftLabel}</span>
              </div>
              <div className="bb-nvl-checklist-meta-codes">CK &nbsp; XK &nbsp; NK</div>
            </div>
          </header>

          <table className="bb-nvl-checklist-table">
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '4%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              {displaySessions.map(session => (
                <col key={`tron-col-${session}`} style={{ width: `${tronColWidth}%` }} />
              ))}
              <col style={{ width: '7%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>STT</th>
                <th rowSpan={2}>
                  MÃ VẬT TƯ
                  <br />
                  MISA
                </th>
                <th rowSpan={2}>TÊN VẬT TƯ</th>
                <th rowSpan={2}>ĐVT</th>
                <th rowSpan={2}>
                  ĐỊNH MỨC
                  <br />
                  VẬT TƯ
                </th>
                <th rowSpan={2}>
                  TỈ LỆ
                  <br />
                  %
                </th>
                <th rowSpan={2}>
                  TỒN ĐẦU CA
                  <br />
                  (kg)
                </th>
                <th rowSpan={2}>
                  LẤY TRONG
                  <br />
                  KHO (kg)
                </th>
                <th colSpan={tronColCount}>
                  SỬ DỤNG
                  <br />
                  (ĐƠN VỊ TÍNH KG)
                </th>
                <th rowSpan={2}>
                  TỔNG NHỰA
                  <br />
                  TRỘN (KG)
                </th>
                <th rowSpan={2}>
                  TỒN CUỐI CA
                  <br />
                  (KG)
                </th>
              </tr>
              <tr>
                {displaySessions.map(session => (
                  <th key={`tron-h-${session}`}>{mixingSessionLabel(session)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, index) => (
                <tr key={row?.key || `blank-${index}`}>
                  <td className="bb-nvl-checklist-center">{index + 1}</td>
                  <td className="bb-nvl-checklist-code">{row?.maVatTu || ''}</td>
                  <td className="bb-nvl-checklist-left">{row?.tenVatTu || ''}</td>
                  <td className="bb-nvl-checklist-center">{row?.donVi || ''}</td>
                  <td className="bb-nvl-checklist-num">{formatQty(row?.dinhMucKg)}</td>
                  <td className="bb-nvl-checklist-num">{formatPercent(row?.tiLePercent)}</td>
                  <td className="bb-nvl-checklist-num">{formatQty(row?.tonDauCaKg)}</td>
                  <td className="bb-nvl-checklist-num">{formatQty(row?.layTrongKhoKg)}</td>
                  {displaySessions.map(session => (
                    <td key={`tron-${row?.key || index}-${session}`} className="bb-nvl-checklist-num">
                      {formatQty(row?.thucTronByLan?.[session] ?? null)}
                    </td>
                  ))}
                  <td className="bb-nvl-checklist-num">{formatQty(row?.thucTronKg)}</td>
                  <td className="bb-nvl-checklist-num">{formatQty(row?.tonCuoiCaKg)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="bb-nvl-checklist-total-label">
                  TỔNG
                </td>
                <td className="bb-nvl-checklist-num">{formatQty(totalDinhMuc || null)}</td>
                <td />
                <td className="bb-nvl-checklist-num">{formatQty(totalTonDau || null)}</td>
                <td className="bb-nvl-checklist-num">{formatQty(totalXuat || null)}</td>
                {totalTronByLan.map((qty, idx) => (
                  <td key={`tron-total-${displaySessions[idx]}`} className="bb-nvl-checklist-num">
                    {formatQty(qty || null)}
                  </td>
                ))}
                <td className="bb-nvl-checklist-num">{formatQty(totalTron || null)}</td>
                <td className="bb-nvl-checklist-num">{formatQty(totalTonCuoi || null)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="bb-nvl-checklist-usage">
            <span className="bb-nvl-checklist-usage-label">THỰC TẾ SỬ DỤNG:</span>
            <span className="bb-nvl-checklist-usage-value">
              {totalSuDung > 0 ? formatNumber(totalSuDung, 2) : ''}
            </span>
            <span className="bb-nvl-checklist-usage-line" />
          </div>

          <div className="bb-nvl-checklist-notes">
            <p>
              <b>LƯU Ý:</b> Chỉ nhân sự được phân công mới được lấy vật tư đúng theo kế hoạch / định mức.
              Phân chia pallet: 1L = 25 kg/bao; 2L = 25 kg/bao.
            </p>
            <p>
              <b>Ghi chú:</b> Thực tế sử dụng = Vật tư tồn đầu ca + Thực tế trộn trong ca − Tồn cuối ca.
            </p>
          </div>

          <section className="bb-nvl-checklist-signatures">
            {['Thủ kho vật tư', 'Trưởng ca sản xuất', 'Thợ máy', 'Quản lý sản xuất'].map(label => (
              <div key={label} className="bb-nvl-checklist-sign">
                <div className="bb-nvl-checklist-sign-head">{label}</div>
                <div className="bb-nvl-checklist-sign-hint">(Ký, ghi rõ họ tên)</div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

export default MachineShiftMaterialChecklistPrintSheet;
