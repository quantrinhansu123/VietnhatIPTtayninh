import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ClipboardList, Loader2, Plus, Printer, Save, Trash2, Wand2, X } from 'lucide-react';
import {
  ShiftHandoverPrintBatch,
  buildShiftHandoverPrintSlip,
  slipToPrintSlip,
  type ShiftHandoverPrintSlip
} from './ShiftHandoverPrintSheet';
import ShiftHandoverMixingTable from './ShiftHandoverMixingTable';
import { readApiErrorMessage, showAppToast, showSaveFailure } from '../lib/appToast';
import { SearchableSelect } from './shared/SearchableSelect';
import {
  waitForPrintImagesReady,
  enableLandscapePrintPage,
  disableLandscapePrintPage
} from '../utils/printReady';
import {
  getProductionShiftOptions,
  normalizeShiftSettings,
  type ShiftSetting
} from '../utils/shiftSettings';
import {
  buildClosingStockLinesFromMachineNvl,
  buildProductLinesFromCanTuDong,
  buildScrapLinesFromDamagedGoods
} from '../utils/shiftHandoverAutofill';
import { formatNumber } from '../utils';
import {
  SHIFT_HANDOVER_FORM_CODE,
  SHIFT_HANDOVER_FORM_EFFECTIVE,
  SHIFT_HANDOVER_FORM_ISSUE,
  buildChiTietPayload,
  defaultKpiLines,
  defaultMixingMaterialLines,
  emptyClosingStockLine,
  emptyKpiLine,
  emptyMixingMaterialLine,
  emptyProductLine,
  emptyScrapLine,
  kpiVariance,
  normalizeShiftHandoverSlips,
  parseQty,
  sumClosingStockTotals,
  totalNormWeight,
  type ClosingStockLine,
  type HandoverFormTab,
  type KpiLine,
  type MaterialCatalogOption,
  type MixingMaterialLine,
  type ProductLine,
  type ProductOption,
  type ScrapLine,
  type ShiftHandoverSlip
} from '../lib/shiftHandoverModel';

export type { ShiftHandoverSlip } from '../lib/shiftHandoverModel';
export { normalizeShiftHandoverSlips } from '../lib/shiftHandoverModel';

const fieldClass =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const cellClass =
  'h-9 w-full min-w-0 border-0 bg-transparent px-1.5 text-sm font-semibold text-zinc-800 outline-none focus:bg-red-50';

const cellCenterClass = `${cellClass} text-center`;

type MachineOption = { id: string; code: string; name: string };
type StaffOption = { id: string; name: string; shift: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function displayNum(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return '';
  return formatNumber(value, digits);
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : [];
  return rows
    .map((item): MachineOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.ma_may ?? '').trim();
      const name = String(row.name ?? row.ten_may ?? '').trim();
      if (!code && !name) return null;
      return { id: String(row.id ?? code), code, name };
    })
    .filter((item): item is MachineOption => Boolean(item));
}

function normalizeCatalogProducts(data: unknown): ProductOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  return rows
    .map((item): ProductOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_sp ?? record.ma_san_pham ?? record.productCode ?? record.code ?? '').trim();
      const name = String(record.ten_sp ?? record.ten_san_pham ?? record.productName ?? record.name ?? '').trim();
      const unit = String(record.don_vi ?? record.unit ?? '').trim();
      const totalWeightRaw = record.tong_trong_luong ?? record.totalWeight;
      const totalWeightText = String(totalWeightRaw ?? '').trim();
      const totalWeightNumber = Number(totalWeightText.replace(',', '.'));
      const totalWeightKg = totalWeightText && Number.isFinite(totalWeightNumber) ? totalWeightNumber : null;
      if (!code) return null;
      return { code, name, unit, totalWeightKg };
    })
    .filter((item): item is ProductOption => Boolean(item));
}

function shiftMatches(orderShift: string, selectedShift: string) {
  if (!orderShift || !selectedShift) return false;
  const left = orderShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  const right = selectedShift.replace(/^ca\s*/i, '').trim().toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeProductionStaff(data: unknown): StaffOption[] {
  const branches = Array.isArray(data)
    ? data
    : Array.isArray((data as { branches?: unknown }).branches)
      ? (data as { branches: unknown[] }).branches
      : [];
  const members: StaffOption[] = [];
  const seen = new Set<string>();

  branches.forEach(branch => {
    if (!branch || typeof branch !== 'object') return;
    const departments = Array.isArray((branch as { departments?: unknown }).departments)
      ? (branch as { departments: unknown[] }).departments
      : [];
    departments.forEach(department => {
      if (!department || typeof department !== 'object') return;
      const deptName = String((department as { name?: string }).name ?? '').toLowerCase();
      if (!deptName.includes('sản xuất') && !deptName.includes('san xuat')) return;
      const deptMembers = Array.isArray((department as { members?: unknown }).members)
        ? (department as { members: unknown[] }).members
        : [];
      deptMembers.forEach(member => {
        if (!member || typeof member !== 'object') return;
        const name = String((member as { name?: string }).name ?? '').trim();
        if (!name || seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase());
        members.push({
          id: String((member as { id?: string }).id ?? name),
          name,
          shift: String((member as { shift?: string }).shift ?? '').trim()
        });
      });
    });
  });

  return members.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function normalizeCatalogMaterials(data: unknown): MaterialCatalogOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
      ? (data as { materials: unknown[] }).materials
      : [];
  const mapped = rows
    .map((item): MaterialCatalogOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const code = String(record.ma_npl ?? record.ma_nvl ?? record.code ?? '').trim();
      const name = String(record.ten_npl ?? record.ten_nvl ?? record.name ?? '').trim();
      if (!code && !name) return null;
      return { code, name, unit: String(record.don_vi ?? record.unit ?? 'kg').trim() || 'kg' };
    })
    .filter((item): item is MaterialCatalogOption => Boolean(item));
  return mapped.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'vi'));
}

function formatWeightHint(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '';
  return String(Math.round(value * 1000) / 1000);
}

export default function ShiftHandoverPanel({ onBack }: { onBack: () => void }) {
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [materials, setMaterials] = useState<MaterialCatalogOption[]>([]);
  const [slips, setSlips] = useState<ShiftHandoverSlip[]>([]);
  const [formTab, setFormTab] = useState<HandoverFormTab>('thanh_pham');
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [machineRef, setMachineRef] = useState('');
  const [operators, setOperators] = useState('');
  const [productLines, setProductLines] = useState<ProductLine[]>([
    emptyProductLine(),
    emptyProductLine(),
    emptyProductLine()
  ]);
  const [scrapLines, setScrapLines] = useState<ScrapLine[]>([
    emptyScrapLine(),
    emptyScrapLine(),
    emptyScrapLine()
  ]);
  const [closingStockLines, setClosingStockLines] = useState<ClosingStockLine[]>([emptyClosingStockLine()]);
  const [kpiLines, setKpiLines] = useState<KpiLine[]>(defaultKpiLines());
  const [materialLines, setMaterialLines] = useState<MixingMaterialLine[]>(defaultMixingMaterialLines());
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printSlip, setPrintSlip] = useState<ShiftHandoverPrintSlip | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(''), 7000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const selectedMachine = useMemo(() => {
    const ref = machineRef.trim();
    if (!ref) return null;
    return machines.find(m => m.code === ref) ?? null;
  }, [machineRef, machines]);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);

  const filteredStaffOptions = useMemo(() => {
    if (!shift) return staffOptions;
    const filtered = staffOptions.filter(member => shiftMatches(member.shift, shift));
    return filtered.length > 0 ? filtered : staffOptions;
  }, [staffOptions, shift]);

  const productTotals = useMemo(() => {
    return productLines.reduce(
      (acc, line) => ({
        plannedReturn: acc.plannedReturn + (parseQty(line.plannedReturn) ?? 0),
        quantity: acc.quantity + (parseQty(line.quantity) ?? 0),
        totalNormWeight: acc.totalNormWeight + (totalNormWeight(line.quantity, line.resinNorm) ?? 0)
      }),
      { plannedReturn: 0, quantity: 0, totalNormWeight: 0 }
    );
  }, [productLines]);

  const closingStockTotals = useMemo(() => {
    const saved = closingStockLines.map((line, index) => ({
      stt: index + 1,
      itemCode: line.itemCode.trim(),
      itemName: line.itemName.trim(),
      unit: line.unit.trim(),
      quantity: parseQty(line.quantity),
      weightKg: parseQty(line.weightKg)
    }));
    return sumClosingStockTotals(saved);
  }, [closingStockLines]);

  const loadSlips = async () => {
    const res = await fetch('/api/phieu-giao-ca?limit=50');
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSlips(normalizeShiftHandoverSlips(data));
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [machineRes, settingRes, staffRes, productRes, materialRes, slipRes] = await Promise.all([
          fetch('/api/danh-sach-may'),
          fetch('/api/cai-dat'),
          fetch('/api/nhan-su?format=groups'),
          fetch('/api/san-pham?format=table'),
          fetch('/api/kho-nvl'),
          fetch('/api/phieu-giao-ca?limit=50')
        ]);
        const [machineData, settingData, staffData, productData, materialData, slipData] = await Promise.all([
          machineRes.json().catch(() => ({})),
          settingRes.json().catch(() => ({})),
          staffRes.json().catch(() => ({})),
          productRes.json().catch(() => ({})),
          materialRes.json().catch(() => ({})),
          slipRes.json().catch(() => ({}))
        ]);

        if (!alive) return;
        if (machineRes.ok) setMachines(normalizeMachines(machineData));
        if (settingRes.ok) setShiftSettings(normalizeShiftSettings(settingData));
        if (staffRes.ok) setStaffOptions(normalizeProductionStaff(staffData));
        if (productRes.ok) setProducts(normalizeCatalogProducts(productData));
        if (materialRes.ok) setMaterials(normalizeCatalogMaterials(materialData));
        if (slipRes.ok) setSlips(normalizeShiftHandoverSlips(slipData));
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!pendingPrint || !printSlip) return;
    let cancelled = false;
    document.body.classList.add('shift-handover-print-active');
    enableLandscapePrintPage('shift-handover-page-landscape');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disableLandscapePrintPage('shift-handover-page-landscape');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('shift-handover-print-active');
      disableLandscapePrintPage('shift-handover-page-landscape');
    };
  }, [pendingPrint, printSlip]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shift-handover-print-active');
      setPrintSlip(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      document.body.classList.remove('shift-handover-print-active');
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const applyShiftTimes = (nextShift: string) => {
    setShift(nextShift);
    const setting = shiftSettings.find(
      item => item.name === nextShift || item.code === nextShift
    );
    if (setting?.startTime) setTimeFrom(setting.startTime);
    if (setting?.endTime) setTimeTo(setting.endTime);
  };

  const updateProduct = (key: string, patch: Partial<ProductLine>) => {
    setProductLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const selectProduct = (key: string, code: string) => {
    const product = products.find(item => item.code === code);
    updateProduct(key, {
      productCode: code,
      productName: product?.name || '',
      resinNorm: product?.totalWeightKg != null ? formatWeightHint(product.totalWeightKg) : '',
      rollWeight: product?.totalWeightKg != null ? formatWeightHint(product.totalWeightKg) : ''
    });
  };

  const updateClosingStock = (key: string, patch: Partial<ClosingStockLine>) => {
    setClosingStockLines(prev => prev.map(line => (line.key === key ? { ...line, ...patch } : line)));
  };

  const formHasDetailData = () => {
    const hasProducts = productLines.some(
      line =>
        line.productCode.trim() ||
        line.productName.trim() ||
        parseQty(line.quantity) !== null ||
        parseQty(line.plannedReturn) !== null
    );
    const hasScraps = scrapLines.some(line => line.name.trim() || parseQty(line.quantity) !== null);
    const hasClosing = closingStockLines.some(
      line =>
        line.itemCode.trim() ||
        line.itemName.trim() ||
        parseQty(line.quantity) !== null ||
        parseQty(line.weightKg) !== null
    );
    return hasProducts || hasScraps || hasClosing;
  };

  const handleAutofill = async () => {
    setError('');
    setMessage('');
    if (!date || !shift) {
      setError('Chọn Ngày và Ca sản xuất trước khi tự động điền.');
      return;
    }
    if (
      formHasDetailData() &&
      !window.confirm('Đã có dữ liệu trên form. Tự động điền sẽ ghi đè Thành phẩm, Hàng lỗi và Tồn cuối ca. Tiếp tục?')
    ) {
      return;
    }

    const machineCode = selectedMachine?.code || machineRef.trim();
    const machineName = selectedMachine?.name || '';
    setIsAutofilling(true);
    try {
      const canParams = new URLSearchParams({
        limit: '5000',
        from: date,
        to: date,
        dateBy: 'ngay'
      });
      const nvlParams = new URLSearchParams({
        limit: '200',
        loai_bao_cao: 'cuoi_ca',
        ngay: date
      });
      if (machineCode) nvlParams.set('ma_may', machineCode);

      const [canRes, scrapRes, nvlRes] = await Promise.all([
        fetch(`/api/can-tu-dong?${canParams.toString()}`),
        fetch(`/api/bao-cao-hang-hong?ngay=${encodeURIComponent(date)}`),
        fetch(`/api/bao-cao-may-nvl-ton?${nvlParams.toString()}`)
      ]);
      const [canData, scrapData, nvlData] = await Promise.all([
        canRes.json().catch(() => ({})),
        scrapRes.json().catch(() => []),
        nvlRes.json().catch(() => ({}))
      ]);

      if (!canRes.ok) {
        throw new Error(readApiErrorMessage(canRes, canData, 'Không tải được cân tự động.'));
      }
      if (!scrapRes.ok) {
        throw new Error(readApiErrorMessage(scrapRes, scrapData, 'Không tải được báo cáo hàng hỏng.'));
      }
      if (!nvlRes.ok) {
        throw new Error(readApiErrorMessage(nvlRes, nvlData, 'Không tải được tồn cuối ca.'));
      }

      const canRecords = Array.isArray(canData?.records) ? canData.records : [];
      const nextProducts = buildProductLinesFromCanTuDong({
        records: canRecords,
        date,
        shift,
        machineCode,
        machineName,
        products
      });
      const nextScraps = buildScrapLinesFromDamagedGoods({
        records: Array.isArray(scrapData) ? scrapData : [],
        date,
        shift,
        machineCode,
        machineName
      });
      const nextClosing = buildClosingStockLinesFromMachineNvl({
        reports: nvlData,
        date,
        shift,
        machineCode,
        machineName
      });

      setProductLines(nextProducts);
      setScrapLines(nextScraps);
      setClosingStockLines(nextClosing);

      const filledProducts = nextProducts.filter(line => line.productCode.trim() || parseQty(line.quantity) !== null).length;
      const filledScraps = nextScraps.filter(line => line.name.trim() || parseQty(line.quantity) !== null).length;
      const filledClosing = nextClosing.filter(
        line => line.itemCode.trim() || line.itemName.trim() || parseQty(line.quantity) !== null
      ).length;
      const okMsg = `Đã điền: ${filledProducts} mã TP · ${filledScraps} dòng hàng lỗi · ${filledClosing} dòng tồn cuối ca.`;
      setMessage(okMsg);
      showAppToast(okMsg);
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể tự động điền.'));
    } finally {
      setIsAutofilling(false);
    }
  };

  const buildCurrentPrintSlip = (slipCode = '') => {
    const payload = buildChiTietPayload({
      timeFrom,
      timeTo,
      products: productLines,
      scraps: scrapLines,
      closingStockLines,
      kpis: kpiLines
    });
    return buildShiftHandoverPrintSlip({
      slipCode,
      date,
      shift,
      timeFrom,
      timeTo,
      machineCode: selectedMachine?.code || machineRef.trim(),
      machineName: selectedMachine?.name || machineRef.trim(),
      operators,
      products: (payload.thanh_pham || []).map((line, index) => ({
        stt: index + 1,
        productCode: String(line?.ma_hang ?? ''),
        productName: String(line?.thanh_pham ?? ''),
        plannedReturn: line?.du_kien_tra_kho ?? null,
        quantity: line?.so_luong ?? null,
        rollWeight: line?.trong_luong_cuon ?? null,
        resinNorm: line?.dinh_muc_nhua ?? null,
        totalNormWeight: line?.tong_tl_dm ?? null,
        defect20: String(line?.loi_20cm ?? ''),
        defect30: String(line?.loi_30cm ?? '')
      })),
      scraps: (payload.hang_loi || []).map((line, index) => ({
        stt: index + 1,
        name: String(line?.ten ?? ''),
        quantity: line?.so_luong ?? null
      })),
      closingStockLines: (payload.ton_cuoi_ca || []).map((line, index) => ({
        stt: index + 1,
        itemCode: String(line?.ma_nvl ?? ''),
        itemName: String(line?.ten_nvl ?? ''),
        unit: String(line?.dvt ?? ''),
        quantity: line?.so_luong ?? null,
        weightKg: line?.trong_luong_kg ?? null
      })),
      kpis: (payload.bao_cao_cuoi_ca || []).map((line, index) => ({
        stt: index + 1,
        criteria: String(line?.chi_tieu ?? ''),
        norm: line?.sl_dm ?? null,
        actual: line?.thuc_te ?? null,
        variance: line?.chenh_lech ?? null
      })),
      materials: (payload.vat_tu || []).map((line, index) => ({
        stt: index + 1,
        materialCode: String(line?.ma_nvl ?? ''),
        materialName: String(line?.ten_nvl ?? ''),
        unit: String(line?.don_vi ?? ''),
        normKg: line?.dinh_muc_kg ?? null,
        percent: line?.ti_le ?? null,
        opening: line?.ton_dau ?? null,
        takenFromWh: line?.lay_kho ?? null,
        use1: line?.lan1 ?? null,
        use2: line?.lan2 ?? null,
        use3: line?.lan3 ?? null,
        use4: line?.lan4 ?? null,
        use5: line?.lan5 ?? null,
        mixedTotal: line?.tong_nhua_tron ?? null,
        closing: line?.ton_cuoi ?? null,
        actualUsage: line?.thuc_te_sd ?? null
      })),
      note
    });
  };

  const handlePrint = (slip: ShiftHandoverPrintSlip) => {
    setError('');
    setPrintSlip(slip);
    setPendingPrint(true);
  };

  const resetForm = () => {
    setProductLines([emptyProductLine(), emptyProductLine(), emptyProductLine()]);
    setScrapLines([emptyScrapLine(), emptyScrapLine(), emptyScrapLine()]);
    setClosingStockLines([emptyClosingStockLine()]);
    setKpiLines(defaultKpiLines());
    setMaterialLines(defaultMixingMaterialLines());
    setNote('');
  };

  const saveSlip = async () => {
    setError('');
    setMessage('');

    if (!date || !shift || !operators.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày, ca sản xuất và người thực hiện.'));
      return;
    }

    const chiTiet = buildChiTietPayload({
      timeFrom,
      timeTo,
      products: productLines,
      scraps: scrapLines,
      closingStockLines,
      kpis: kpiLines
    });
    const printPayload = buildCurrentPrintSlip();

    setIsSaving(true);
    try {
      const res = await fetch('/api/phieu-giao-ca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ngay: date,
          ca_giao: shift,
          gio_tu: timeFrom.trim(),
          gio_den: timeTo.trim(),
          ma_may: selectedMachine?.code || machineRef.trim(),
          ten_may: selectedMachine?.name || machineRef.trim(),
          nguoi_giao_ca: operators.trim(),
          nguoi_thuc_hien: operators.trim(),
          ghi_chu_chung: note.trim(),
          chi_tiet: chiTiet,
          thanh_pham: chiTiet.thanh_pham,
          hang_loi: chiTiet.hang_loi,
          ton_cuoi_ca: chiTiet.ton_cuoi_ca,
          vat_tu: chiTiet.vat_tu,
          bao_cao_cuoi_ca: chiTiet.bao_cao_cuoi_ca
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu giao ca.'));

      const slipCode = String(data.slip?.so_phieu ?? '').trim();
      const okMsg = slipCode ? `Đã lưu phiếu ${slipCode}.` : 'Đã lưu phiếu giao ca.';
      setMessage(okMsg);
      showAppToast(okMsg);
      resetForm();
      await loadSlips();
      handlePrint({ ...printPayload, slipCode: slipCode || printPayload.slipCode });
    } catch (err: unknown) {
      setError(showSaveFailure(err, 'Không thể lưu phiếu.'));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSlip = async (id: string) => {
    if (!id || !window.confirm('Xóa phiếu giao ca này?')) return;
    const res = await fetch(`/api/phieu-giao-ca/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage('');
      setError(data.error || 'Không thể xóa phiếu.');
      return;
    }
    setSlips(prev => prev.filter(slip => slip.id !== id));
    setError('');
    setMessage('Đã xóa phiếu.');
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50">
      {printSlip && typeof document !== 'undefined'
        ? createPortal(<ShiftHandoverPrintBatch slips={[printSlip]} />, document.body)
        : null}

      <div className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Quay lại
            </button>
            <div>
              <h1 className="text-xl font-black text-zinc-900">Phiếu giao ca</h1>
              <p className="text-xs font-semibold text-zinc-500">
                Nhật ký sản xuất kiêm phiếu giao ca · {SHIFT_HANDOVER_FORM_CODE}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.55fr)]">
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-[#ef1b2d] bg-white px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ef1b2d]">
                  Nhật ký sản xuất
                </p>
                <h2 className="text-base font-black uppercase text-zinc-950 sm:text-lg">
                  Nhật ký sản xuất kiêm phiếu giao ca
                </h2>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-bold text-zinc-600">
                <p>Ký hiệu: {SHIFT_HANDOVER_FORM_CODE}</p>
                <p>Lần BH: {SHIFT_HANDOVER_FORM_ISSUE} · Ngày HL: {SHIFT_HANDOVER_FORM_EFFECTIVE}</p>
              </div>
            </div>

            <div className="p-4">
              {error && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  <span className="min-w-0">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError('')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
                    title="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {message && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <span className="min-w-0">{message}</span>
                  <button
                    type="button"
                    onClick={() => setMessage('')}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
                    title="Đóng thông báo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ngày *
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ca sản xuất *
                  <div className="mt-1">
                    <SearchableSelect
                      value={shift}
                      onChange={applyShiftTimes}
                      options={shiftOptions}
                      placeholder="Chọn ca"
                      searchPlaceholder="Tìm ca..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      getValue={item => String((item as { value?: string }).value ?? item)}
                      getLabel={item => String((item as { label?: string }).label ?? item)}
                    />
                  </div>
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Từ giờ
                  <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Đến giờ
                  <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} className={`${fieldClass} mt-1`} />
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Máy
                  <div className="mt-1">
                    <SearchableSelect
                      value={machineRef}
                      onChange={setMachineRef}
                      options={machines}
                      placeholder="Chọn máy"
                      searchPlaceholder="Tìm mã hoặc tên máy..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      getValue={item => (item as MachineOption).code}
                      getLabel={item => {
                        const machine = item as MachineOption;
                        return machine.code ? `${machine.code} · ${machine.name}` : machine.name;
                      }}
                      getSearchText={item => {
                        const machine = item as MachineOption;
                        return `${machine.code} ${machine.name}`.trim();
                      }}
                    />
                  </div>
                </label>
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Người thực hiện *
                  <div className="mt-1">
                    <SearchableSelect
                      value={operators}
                      onChange={setOperators}
                      options={filteredStaffOptions}
                      placeholder="Chọn hoặc nhập tên"
                      searchPlaceholder="Tìm người thực hiện..."
                      isLoading={isLoading}
                      inputClassName={fieldClass}
                      comboboxMode
                      allowCustomValue
                      getValue={item => (item as StaffOption).name}
                      getLabel={item => (item as StaffOption).name}
                      getSearchText={item => {
                        const staff = item as StaffOption;
                        return `${staff.name} ${staff.shift}`.trim();
                      }}
                    />
                  </div>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleAutofill()}
                  disabled={isAutofilling || isLoading || isSaving}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-extrabold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
                  title="Điền Thành phẩm (cân tự động), Hàng lỗi, Tồn cuối ca theo Ngày + Ca (+ Máy)"
                >
                  {isAutofilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4 text-[#ef1b2d]" />}
                  {isAutofilling ? 'Đang điền...' : 'Tự động điền'}
                </button>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">II. Thành phẩm</h3>
                  <button
                    type="button"
                    onClick={() => setProductLines(prev => [...prev, emptyProductLine()])}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm mã hàng
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-[1080px] w-full border-collapse text-xs">
                    <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th rowSpan={2} className="border border-zinc-200 px-2 py-1.5">
                          Mã hàng
                        </th>
                        <th rowSpan={2} className="border border-zinc-200 px-2 py-1.5">
                          Thành phẩm (2)
                        </th>
                        <th rowSpan={2} className="border border-zinc-200 px-2 py-1.5">
                          Dự kiến trả kho
                          <span className="block font-semibold normal-case text-zinc-400">(cuộn)</span>
                        </th>
                        <th colSpan={3} className="border border-zinc-200 px-2 py-1.5">
                          Thành phẩm thực tế nhập kho
                        </th>
                        <th rowSpan={2} className="border border-zinc-200 px-2 py-1.5">
                          Tổng TL theo ĐM
                          <span className="block font-semibold normal-case text-zinc-400">(6)=(3)×(5)</span>
                        </th>
                        <th colSpan={2} className="border border-zinc-200 px-2 py-1.5">
                          Lõi / cuộn
                        </th>
                        <th rowSpan={2} className="w-9 border border-zinc-200" />
                      </tr>
                      <tr>
                        <th className="border border-zinc-200 px-2 py-1">SL cuộn (3)</th>
                        <th className="border border-zinc-200 px-2 py-1">TL cuộn gồm túi, lõi (4)</th>
                        <th className="border border-zinc-200 px-2 py-1">ĐM nhựa (5)</th>
                        <th className="border border-zinc-200 px-2 py-1">20cm</th>
                        <th className="border border-zinc-200 px-2 py-1">30cm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productLines.map(line => {
                        const total = totalNormWeight(line.quantity, line.resinNorm);
                        return (
                          <tr key={line.key} className="odd:bg-white even:bg-zinc-50/70">
                            <td className="min-w-[160px] border border-zinc-200 p-0.5">
                              <SearchableSelect
                                value={line.productCode}
                                onChange={code => updateProduct(line.key, { productCode: code })}
                                onSelectOption={item => {
                                  const product = item as ProductOption | null;
                                  if (product?.code) selectProduct(line.key, product.code);
                                }}
                                options={products}
                                placeholder="Mã hàng"
                                searchPlaceholder="Tìm mã / tên SP..."
                                isLoading={isLoading}
                                inputClassName={cellClass}
                                comboboxMode
                                allowCustomValue
                                displaySelectedAsValue
                                getValue={item => (item as ProductOption).code}
                                getLabel={item => {
                                  const product = item as ProductOption;
                                  return product.name ? `${product.code} · ${product.name}` : product.code;
                                }}
                                getSearchText={item => {
                                  const product = item as ProductOption;
                                  return `${product.code} ${product.name}`.trim();
                                }}
                              />
                            </td>
                            <td className="min-w-[180px] border border-zinc-200 p-0.5">
                              <input
                                value={line.productName}
                                onChange={e => updateProduct(line.key, { productName: e.target.value })}
                                className={cellClass}
                                placeholder="Mô tả thành phẩm"
                              />
                            </td>
                            <td className="w-24 border border-zinc-200 p-0.5">
                              <input
                                value={line.plannedReturn}
                                onChange={e => updateProduct(line.key, { plannedReturn: e.target.value })}
                                className={cellCenterClass}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="w-24 border border-zinc-200 p-0.5">
                              <input
                                value={line.quantity}
                                onChange={e => updateProduct(line.key, { quantity: e.target.value })}
                                className={cellCenterClass}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="w-28 border border-zinc-200 p-0.5">
                              <input
                                value={line.rollWeight}
                                onChange={e => updateProduct(line.key, { rollWeight: e.target.value })}
                                className={cellCenterClass}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="w-24 border border-zinc-200 p-0.5">
                              <input
                                value={line.resinNorm}
                                onChange={e => updateProduct(line.key, { resinNorm: e.target.value })}
                                className={cellCenterClass}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="w-28 border border-zinc-200 bg-zinc-50 px-1.5 text-center font-black text-zinc-800">
                              {displayNum(total)}
                            </td>
                            <td className="w-20 border border-zinc-200 p-0.5">
                              <input
                                value={line.defect20}
                                onChange={e => updateProduct(line.key, { defect20: e.target.value })}
                                className={cellCenterClass}
                              />
                            </td>
                            <td className="w-20 border border-zinc-200 p-0.5">
                              <input
                                value={line.defect30}
                                onChange={e => updateProduct(line.key, { defect30: e.target.value })}
                                className={cellCenterClass}
                              />
                            </td>
                            <td className="border border-zinc-200 p-0.5 text-center">
                              {productLines.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setProductLines(prev => prev.filter(item => item.key !== line.key))}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                                  title="Xóa dòng"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-zinc-100 font-black text-zinc-800">
                        <td colSpan={2} className="border border-zinc-200 px-2 py-2 text-right uppercase">
                          Tổng cộng
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(productTotals.plannedReturn)}
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(productTotals.quantity)}
                        </td>
                        <td className="border border-zinc-200" />
                        <td className="border border-zinc-200" />
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(productTotals.totalNormWeight)}
                        </td>
                        <td className="border border-zinc-200" />
                        <td className="border border-zinc-200" />
                        <td className="border border-zinc-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">
                      III. Hàng lỗi hỏng / phế / sự cố SX
                    </h3>
                    <button
                      type="button"
                      onClick={() => setScrapLines(prev => [...prev, emptyScrapLine()])}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                        <tr>
                          <th className="border border-zinc-200 px-2 py-1.5 text-left">Tên lỗi / phế / sự cố</th>
                          <th className="w-28 border border-zinc-200 px-2 py-1.5">SL (kg)</th>
                          <th className="w-9 border border-zinc-200" />
                        </tr>
                      </thead>
                      <tbody>
                        {scrapLines.map(line => (
                          <tr key={line.key}>
                            <td className="border border-zinc-200 p-0.5">
                              <input
                                value={line.name}
                                onChange={e =>
                                  setScrapLines(prev =>
                                    prev.map(item => (item.key === line.key ? { ...item, name: e.target.value } : item))
                                  )
                                }
                                className={cellClass}
                                placeholder="VD: Kéo màng đầu ca"
                              />
                            </td>
                            <td className="border border-zinc-200 p-0.5">
                              <input
                                value={line.quantity}
                                onChange={e =>
                                  setScrapLines(prev =>
                                    prev.map(item =>
                                      item.key === line.key ? { ...item, quantity: e.target.value } : item
                                    )
                                  )
                                }
                                className={cellCenterClass}
                                inputMode="decimal"
                              />
                            </td>
                            <td className="border border-zinc-200 text-center">
                              {scrapLines.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setScrapLines(prev => prev.filter(item => item.key !== line.key))}
                                  className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                                  title="Xóa dòng"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">
                      III. Báo cáo SX cuối ca
                    </h3>
                    <button
                      type="button"
                      onClick={() => setKpiLines(prev => [...prev, emptyKpiLine()])}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Thêm
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                        <tr>
                          <th className="border border-zinc-200 px-2 py-1.5 text-left">Chỉ tiêu</th>
                          <th className="w-20 border border-zinc-200 px-2 py-1.5">SL ĐM</th>
                          <th className="w-20 border border-zinc-200 px-2 py-1.5">Thực tế</th>
                          <th className="w-24 border border-zinc-200 px-2 py-1.5">Chênh lệch</th>
                          <th className="w-9 border border-zinc-200" />
                        </tr>
                      </thead>
                      <tbody>
                        {kpiLines.map(line => {
                          const variance = kpiVariance(line.norm, line.actual);
                          return (
                            <tr key={line.key}>
                              <td className="border border-zinc-200 p-0.5">
                                <input
                                  value={line.criteria}
                                  onChange={e =>
                                    setKpiLines(prev =>
                                      prev.map(item =>
                                        item.key === line.key ? { ...item, criteria: e.target.value } : item
                                      )
                                    )
                                  }
                                  className={cellClass}
                                />
                              </td>
                              <td className="border border-zinc-200 p-0.5">
                                <input
                                  value={line.norm}
                                  onChange={e =>
                                    setKpiLines(prev =>
                                      prev.map(item => (item.key === line.key ? { ...item, norm: e.target.value } : item))
                                    )
                                  }
                                  className={cellCenterClass}
                                  inputMode="decimal"
                                />
                              </td>
                              <td className="border border-zinc-200 p-0.5">
                                <input
                                  value={line.actual}
                                  onChange={e =>
                                    setKpiLines(prev =>
                                      prev.map(item =>
                                        item.key === line.key ? { ...item, actual: e.target.value } : item
                                      )
                                    )
                                  }
                                  className={cellCenterClass}
                                  inputMode="decimal"
                                />
                              </td>
                              <td
                                className={`border border-zinc-200 px-1.5 text-center font-black ${
                                  variance !== null && variance < 0
                                    ? 'text-rose-600'
                                    : variance !== null && variance > 0
                                      ? 'text-emerald-700'
                                      : 'text-zinc-700'
                                }`}
                              >
                                {displayNum(variance)}
                              </td>
                              <td className="border border-zinc-200 text-center">
                                {kpiLines.length > 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => setKpiLines(prev => prev.filter(item => item.key !== line.key))}
                                    className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                                    title="Xóa dòng"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-800">
                    IV. Số lượng tồn cuối ca
                  </h3>
                  <button
                    type="button"
                    onClick={() => setClosingStockLines(prev => [...prev, emptyClosingStockLine()])}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-extrabold text-zinc-700 hover:bg-zinc-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm dòng
                  </button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="min-w-[720px] w-full border-collapse text-xs">
                    <thead className="bg-zinc-100 text-[10px] font-black uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="border border-zinc-200 px-2 py-1.5 text-left">Mã NVL</th>
                        <th className="border border-zinc-200 px-2 py-1.5 text-left">Tên NVL</th>
                        <th className="w-20 border border-zinc-200 px-2 py-1.5">ĐVT</th>
                        <th className="w-28 border border-zinc-200 px-2 py-1.5">Số lượng</th>
                        <th className="w-28 border border-zinc-200 px-2 py-1.5">TL (kg)</th>
                        <th className="w-9 border border-zinc-200" />
                      </tr>
                    </thead>
                    <tbody>
                      {closingStockLines.map(line => (
                        <tr key={line.key} className="odd:bg-white even:bg-zinc-50/70">
                          <td className="min-w-[120px] border border-zinc-200 p-0.5">
                            <input
                              value={line.itemCode}
                              onChange={e => updateClosingStock(line.key, { itemCode: e.target.value })}
                              className={cellClass}
                              placeholder="Mã"
                            />
                          </td>
                          <td className="min-w-[180px] border border-zinc-200 p-0.5">
                            <input
                              value={line.itemName}
                              onChange={e => updateClosingStock(line.key, { itemName: e.target.value })}
                              className={cellClass}
                              placeholder="Tên vật tư"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.unit}
                              onChange={e => updateClosingStock(line.key, { unit: e.target.value })}
                              className={cellCenterClass}
                              placeholder="kg"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.quantity}
                              onChange={e => updateClosingStock(line.key, { quantity: e.target.value })}
                              className={cellCenterClass}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border border-zinc-200 p-0.5">
                            <input
                              value={line.weightKg}
                              onChange={e => updateClosingStock(line.key, { weightKg: e.target.value })}
                              className={cellCenterClass}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="border border-zinc-200 text-center">
                            {closingStockLines.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setClosingStockLines(prev => prev.filter(item => item.key !== line.key))
                                }
                                className="inline-flex h-8 w-8 items-center justify-center text-zinc-400 hover:text-rose-600"
                                title="Xóa dòng"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-zinc-100 font-black text-zinc-800">
                        <td colSpan={3} className="border border-zinc-200 px-2 py-2 text-right uppercase">
                          Tổng cộng
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(closingStockTotals.quantity)}
                        </td>
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          {displayNum(closingStockTotals.weightKg)}
                        </td>
                        <td className="border border-zinc-200" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Ghi chú
                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className={`${fieldClass} mt-1`}
                    placeholder="Ghi chú thêm (tuỳ chọn)"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={saveSlip}
                  disabled={isSaving || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#ef1b2d] px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Đang lưu phiếu...' : 'Lưu và in phiếu'}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-zinc-900">Lịch sử phiếu</h2>
              <ClipboardList className="h-5 w-5 text-[#ef1b2d]" />
            </div>
            <div className="space-y-2">
              {isLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải...
                </div>
              )}
              {!isLoading && slips.length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-xs font-semibold text-zinc-400">
                  Chưa có phiếu nào.
                </p>
              )}
              {slips.map(slip => (
                <div key={slip.id} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-zinc-900">{slip.slipCode || slip.shift || 'Phiếu giao ca'}</p>
                      <p className="text-xs font-semibold text-zinc-500">
                        {slip.date} · {slip.shift}
                        {slip.timeFrom || slip.timeTo ? ` (${slip.timeFrom || '?'}–${slip.timeTo || '?'})` : ''} ·{' '}
                        {slip.machineName || slip.machineCode || 'Chung'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-zinc-600">
                        {slip.operators || '—'} · {slip.products.length} mã hàng ·{' '}
                        {displayNum(slip.products.reduce((sum, line) => sum + (line.quantity ?? 0), 0))} cuộn
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePrint(slipToPrintSlip(slip))}
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"
                        title="In phiếu"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSlip(slip.id)}
                        className="rounded-lg border border-zinc-200 p-2 text-[#ef1b2d] hover:bg-red-50"
                        title="Xóa phiếu"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
