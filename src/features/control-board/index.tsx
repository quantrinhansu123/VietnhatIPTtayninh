import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatNumber } from '../../utils';
import type { AppTab } from '../../routes';
import { useTabAccess } from '../../app/useTabAccess';
import ControlBoardBbMachineReportTable from '../../components/ControlBoardBbMachineReportTable';
import {
  ControlBoardCommonFilters,
  type ControlBoardDateScope
} from '../../components/ControlBoardCommonFilters';
import ReportListsHubModal from '../../components/ReportListsHubModal';
import { RowActionsMenu } from '../../components/shared/table';
import { ClipboardList } from 'lucide-react';
import {
  buildControlBoardShiftSummary,
  defaultShiftSummaryDateRange,
  matchesControlBoardDateRange,
  matchesShiftSummaryBucket,
  machineValueMatchesFilter,
  resolveWarehouseMovementMachineCandidates,
  movementHasLinkedProductionOrderCodes,
  movementLinksProductionOrderCode
} from '../../utils/controlBoardShiftSummary';
import {
  getProductionShiftOptions,
  resolvePreviousProductionShift,
  shiftIsoDateByDays,
  shiftNamesMatch
} from '../../utils/shiftSettings';
import { waitForPrintImagesReady } from '../../utils/printReady';
import { normalizeAcceptanceReports, type AcceptanceReport } from '../../components/AcceptanceReportForm';
import { normalizeMixingReport } from '../../lib/mixingReportModel';
import type { MixingReport } from '../../components/MixingReportForm';
import {
  normalizeWeighingRecords,
  type WeighingPendingAdd,
  type WeighingRecord
} from '../../utils/weighingRecords';
import {
  normalizeMachineNvlReports,
  type MachineNvlSavedReport
} from '../../utils/machineNvlReports';
import { DashboardWindow } from '../dashboard';
import { findMachineByRef, normalizeMachines, type MachineRow } from '../danh-sach-may';
import { normalizeOrders, type OrderRow } from '../don-hang';
import { normalizeProducts } from '../san-pham';
import type { ProductRow } from '../san-pham/types';
import { normalizeMaterialsInventory, type MaterialRow } from '../kho-nvl';
import {
  normalizeWarehouseMovements,
  mapWarehouseMovementsForShiftSummary,
  type WarehouseMovementRow
} from '../phieu-xuat-nhap-kho';
import {
  splitProductionOrderStaffNames,
  parseProductionOrderFilterDate
} from '../cai-dat-thoi-gian';
import {
  normalizeProductionOrders,
  mapProductionOrderSettings,
  resolveProductionOrderMachine,
  formatProductionOrderShiftLabel,
  compareProductionOrderPriority,
  useProductionOrderPrint,
  AddProductionOrderModal,
  ProductionOrderViewModal,
  EditProductionOrderModal,
  ProductionPlanModal,
  ProductionOrderPrintSheet,
  ProductionOrderBatchPrintSheets,
  loadProductionOrderPrintMaterials,
  loadProductionOrderProductCatalog,
  resolveProductionOrderMachineLabel,
  type ProductionOrderRow,
  type ProductionOrderLookupSetting,
  type PrintableProductionOrder
} from '../ke-hoach-san-xuat';
import {
  Factory,
  Eye,
  Pencil,
  Trash2,
  Printer,
  Loader2,
  ChevronLeft
} from 'lucide-react';

function formatProductionOrderPanelDate(value: string): string {
  const iso = parseProductionOrderFilterDate(value);
  if (!iso) return value && value !== '-' ? value : '-';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function compareProductionOrderByRecentDate(a: ProductionOrderRow, b: ProductionOrderRow): number {
  const dateA = parseProductionOrderFilterDate(a.startDate);
  const dateB = parseProductionOrderFilterDate(b.startDate);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  return compareProductionOrderPriority(a, b);
}

function buildPanelProductionOrderOptionLabel(
  order: ProductionOrderRow,
  machines: MachineRow[],
  productionOrderSettings: ProductionOrderLookupSetting[]
): { code: string; label: string; ngay: string } {
  const code = String(order.code || '').trim();
  const ngay = parseProductionOrderFilterDate(order.startDate);
  const shiftLabel = formatProductionOrderShiftLabel(order.shift, productionOrderSettings);
  const machineLabel = resolveProductionOrderMachine(order, machines);
  const parts = [code];
  if (ngay) parts.push(formatProductionOrderPanelDate(ngay));
  else if (order.startDate && order.startDate !== '-') parts.push(String(order.startDate));
  if (shiftLabel && shiftLabel !== '-') parts.push(shiftLabel);
  if (machineLabel && machineLabel !== '-') parts.push(machineLabel);
  return { code, label: parts.join(' · '), ngay: ngay || '' };
}

/** Mã máy từ lệnh SX (khớp danh sách máy). */
function resolveMachineCodeFromProductionOrder(
  order: ProductionOrderRow,
  machines: MachineRow[]
): string {
  const candidates = [
    resolveProductionOrderMachine(order, machines),
    order.machine,
    order.position
  ];
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text || text === '-') continue;
    const found = findMachineByRef(machines, text);
    if (found?.code) return found.code;
  }
  return '';
}

/** Máy ưu tiên từ lệnh SX mới nhất trong Ngày + Ca (chỉ trong danh sách máy được phép). */
function pickPreferredMachineCodeFromOrders(input: {
  orders: ProductionOrderRow[];
  machines: MachineRow[];
  dateFrom: string;
  dateTo: string;
  shift: string;
  allowed: MachineRow[];
}): string {
  if (input.allowed.length === 0) return '';
  const allowedCodes = new Set(input.allowed.map(machine => machine.code));
  const matching = input.orders
    .filter(order => {
      const orderDate = parseProductionOrderFilterDate(order.startDate) || order.startDate;
      if (!matchesControlBoardDateRange(orderDate || undefined, input.dateFrom, input.dateTo)) {
        return false;
      }
      if (!shiftNamesMatch(order.shift, input.shift)) return false;
      return true;
    })
    .sort(compareProductionOrderByRecentDate);

  for (const order of matching) {
    const code = resolveMachineCodeFromProductionOrder(order, input.machines);
    if (code && allowedCodes.has(code)) return code;
  }
  return input.allowed[0]?.code || '';
}

export function ControlBoardPanel({
  onNavigate,
  onMachineReport,
  onEditWeighing,
  onEditMachineNvlReport,
  onEditAcceptanceReport,
  mode = 'full'
}: {
  onNavigate: (tab: AppTab) => void;
  onMachineReport: (machine: MachineRow, type: 'mixing' | 'nvl') => void;
  onEditWeighing?: (pending: WeighingPendingAdd) => void;
  onEditMachineNvlReport?: (report: MachineNvlSavedReport) => void;
  onEditAcceptanceReport?: (report: AcceptanceReport) => void;
  /** `report-only`: `/phan-tich`. `report-only-auto`: `/phan-tich-tu-dong` (mọi máy; sản lượng = cột Trọng lượng nhựa `can_tu_dong` / `/can-tu-dong`). */
  mode?: 'full' | 'report-only' | 'report-only-auto';
}) {
  const reportOnly = mode === 'report-only' || mode === 'report-only-auto';
  const isAutoReport = mode === 'report-only-auto';
  const { canCreate, canEdit, canDelete } = useTabAccess(reportOnly ? 'dashboard' : 'control-board');
  const [showReportListsModal, setShowReportListsModal] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([]);
  const [productionOrderSettings, setProductionOrderSettings] = useState<ProductionOrderLookupSetting[]>([]);
  const [acceptanceReports, setAcceptanceReports] = useState<AcceptanceReport[]>([]);
  const [shiftSummaryAcceptanceReports, setShiftSummaryAcceptanceReports] = useState<AcceptanceReport[]>([]);
  const [mixingReports, setMixingReports] = useState<MixingReport[]>([]);
  const [weighingRecords, setWeighingRecords] = useState<WeighingRecord[]>([]);
  const [damagedRecords, setDamagedRecords] = useState<WeighingRecord[]>([]);
  const [machineNvlReports, setMachineNvlReports] = useState<MachineNvlSavedReport[]>([]);
  const [shiftSummaryWarehouseMovements, setShiftSummaryWarehouseMovements] = useState<WarehouseMovementRow[]>([]);
  const defaultShiftSummaryRange = defaultShiftSummaryDateRange(14);
  const [boardDateScope, setBoardDateScope] = useState<ControlBoardDateScope>('range');
  const [shiftSummaryDateFrom, setShiftSummaryDateFrom] = useState(defaultShiftSummaryRange.from);
  const [shiftSummaryDateTo, setShiftSummaryDateTo] = useState(defaultShiftSummaryRange.to);
  const dateScopeAll = boardDateScope === 'all';
  const effectiveDateFrom = dateScopeAll ? '' : shiftSummaryDateFrom;
  const effectiveDateTo = dateScopeAll ? '' : shiftSummaryDateTo;
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [productionOrderSearch, setProductionOrderSearch] = useState('');
  const [productionOrderStaffFilters, setProductionOrderStaffFilters] = useState<Set<string>>(() => new Set());
  const [boardFilterShift, setBoardFilterShift] = useState('all');
  const [boardFilterMachine, setBoardFilterMachine] = useState('all');
  const [boardFilterProductionOrder, setBoardFilterProductionOrder] = useState('all');
  const [boardFilterProductionOrderQuery, setBoardFilterProductionOrderQuery] = useState('');
  const [draftBoardDateScope, setDraftBoardDateScope] = useState<ControlBoardDateScope>('range');
  const [draftShiftSummaryDateFrom, setDraftShiftSummaryDateFrom] = useState(defaultShiftSummaryRange.from);
  const [draftShiftSummaryDateTo, setDraftShiftSummaryDateTo] = useState(defaultShiftSummaryRange.to);
  const [draftBoardFilterShift, setDraftBoardFilterShift] = useState('all');
  const [draftBoardFilterMachine, setDraftBoardFilterMachine] = useState('all');
  const [draftBoardFilterProductionOrder, setDraftBoardFilterProductionOrder] = useState('all');
  const [draftBoardFilterProductionOrderQuery, setDraftBoardFilterProductionOrderQuery] = useState('');
  const [filterReloadToken, setFilterReloadToken] = useState(0);
  // Mở từ Biểu đồ TH (?ngay=...): ẩn bộ lọc, chỉ hiển thị tóm tắt — dữ liệu đã nạp sẵn, không cần bấm Áp dụng.
  const [lockedByUrlFilters] = useState(() => {
    if (mode !== 'report-only-auto' || typeof window === 'undefined') return false;
    return Boolean(new URLSearchParams(window.location.search).get('ngay'));
  });
  const showFilterBar = !lockedByUrlFilters;
  const uiBoardDateScope = isAutoReport ? draftBoardDateScope : boardDateScope;
  const uiShiftSummaryDateFrom = isAutoReport ? draftShiftSummaryDateFrom : shiftSummaryDateFrom;
  const uiShiftSummaryDateTo = isAutoReport ? draftShiftSummaryDateTo : shiftSummaryDateTo;
  const uiBoardFilterShift = isAutoReport ? draftBoardFilterShift : boardFilterShift;
  const uiBoardFilterMachine = isAutoReport ? draftBoardFilterMachine : boardFilterMachine;
  const uiBoardFilterProductionOrder = isAutoReport ? draftBoardFilterProductionOrder : boardFilterProductionOrder;
  const uiBoardFilterProductionOrderQuery = isAutoReport
    ? draftBoardFilterProductionOrderQuery
    : boardFilterProductionOrderQuery;
  const uiDateScopeAll = uiBoardDateScope === 'all';
  const uiEffectiveDateFrom = uiDateScopeAll ? '' : uiShiftSummaryDateFrom;
  const uiEffectiveDateTo = uiDateScopeAll ? '' : uiShiftSummaryDateTo;
  const [showAddProductionOrder, setShowAddProductionOrder] = useState(false);
  const [showProductionPlan, setShowProductionPlan] = useState(false);
  const [viewingProductionOrder, setViewingProductionOrder] = useState<ProductionOrderRow | null>(null);
  const [editingProductionOrder, setEditingProductionOrder] = useState<ProductionOrderRow | null>(null);
  const [deletingProductionOrderId, setDeletingProductionOrderId] = useState('');
  const [selectedProductionOrderIds, setSelectedProductionOrderIds] = useState<string[]>([]);
  const [printingBatchOrders, setPrintingBatchOrders] = useState<PrintableProductionOrder[]>([]);
  const [printingBatchProductCatalog, setPrintingBatchProductCatalog] = useState<ProductRow[]>([]);
  const [pendingBatchPrint, setPendingBatchPrint] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const {
    printingOrder,
    printingMaterials,
    printingProduct,
    printingProductCatalog,
    printingMachineLabel,
    shiftSettings,
    isLoadingPrint,
    printProductionOrder
  } = useProductionOrderPrint();

  useEffect(() => {
    if (!isAutoReport) return;
    const defaultRange = defaultShiftSummaryDateRange(14);
    // Mở từ Biểu đồ TH (/bieu-do-th?ngay=...&ca=...&may=...): nạp sẵn bộ lọc theo dòng đã bấm.
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlNgay = urlParams?.get('ngay')?.trim() || '';
    const urlCa = urlParams?.get('ca')?.trim() || '';
    const urlMay = urlParams?.get('may')?.trim() || '';
    const initFrom = urlNgay || defaultRange.from;
    const initTo = urlNgay || defaultRange.to;
    const initShift = urlCa || 'all';
    const initMachine = urlMay || 'all';
    setShiftSummaryDateFrom(initFrom);
    setShiftSummaryDateTo(initTo);
    setBoardDateScope('range');
    setBoardFilterShift(initShift);
    setBoardFilterMachine(initMachine);
    setBoardFilterProductionOrder('all');
    setBoardFilterProductionOrderQuery('');
    setDraftShiftSummaryDateFrom(initFrom);
    setDraftShiftSummaryDateTo(initTo);
    setDraftBoardDateScope('range');
    setDraftBoardFilterShift(initShift);
    setDraftBoardFilterMachine(initMachine);
    setDraftBoardFilterProductionOrder('all');
    setDraftBoardFilterProductionOrderQuery('');
  }, [isAutoReport]);

  const loadBoard = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const summaryFrom = dateScopeAll ? '' : shiftSummaryDateFrom || defaultShiftSummaryRange.from;
      const summaryTo = dateScopeAll ? '' : shiftSummaryDateTo || defaultShiftSummaryRange.to;
      const withQuery = (base: string, params: Record<string, string>) => {
        const search = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
          if (value) search.set(key, value);
        }
        const qs = search.toString();
        return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
      };
      // Tỉ lệ TB thực tế lấy phiếu trộn ca liền trước (12C1 → 12C2 ngày hôm trước) → tải thêm 1 ngày trước.
      const mixingFrom = summaryFrom ? shiftIsoDateByDays(summaryFrom, -1) || summaryFrom : '';
      const [
        orderRes,
        productRes,
        machineRes,
        materialRes,
        productionRes,
        settingRes,
        acceptanceRes,
        shiftSummaryAcceptanceRes,
        mixingRes,
        weighingRes,
        damagedRes,
        machineNvlRes,
        warehouseMovementRes
      ] = await Promise.all([
        fetch('/api/don-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-may'),
        fetch('/api/kho-nvl'),
        fetch('/api/lenh-sx'),
        fetch('/api/cai-dat'),
        fetch('/api/bao-cao-nghiem-thu?limit=30'),
        fetch(withQuery('/api/bao-cao-nghiem-thu', { tu_ngay: summaryFrom, den_ngay: summaryTo })),
        fetch(withQuery('/api/bao-cao-phoi-tron', { tu_ngay: mixingFrom, den_ngay: summaryTo })),
        fetch(withQuery('/api/phieu-can-dinh-ki', { from: summaryFrom, to: summaryTo })),
        fetch(withQuery('/api/bao-cao-hang-hong', { from: summaryFrom, to: summaryTo })),
        fetch(withQuery('/api/bao-cao-may-nvl-ton?limit=300', { tu_ngay: summaryFrom, den_ngay: summaryTo })),
        fetch(withQuery('/api/phieu-xuat-nhap-kho', { from: summaryFrom, to: summaryTo }))
      ]);

      const orderData = await orderRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const machineData = await machineRes.json().catch(() => ({}));
      const materialData = await materialRes.json().catch(() => ({}));
      const productionData = await productionRes.json().catch(() => ({}));
      const settingData = await settingRes.json().catch(() => ({}));
      const acceptanceData = await acceptanceRes.json().catch(() => ({}));
      const shiftSummaryAcceptanceData = await shiftSummaryAcceptanceRes.json().catch(() => ({}));
      const mixingData = await mixingRes.json().catch(() => ({}));
      const weighingData = await weighingRes.json().catch(() => ([]));
      const damagedData = await damagedRes.json().catch(() => ([]));
      const machineNvlData = await machineNvlRes.json().catch(() => ({}));
      const warehouseMovementData = await warehouseMovementRes.json().catch(() => ({}));

      if (!orderRes.ok) throw new Error(orderData.error || 'Không thể tải đơn hàng.');
      if (!productRes.ok) throw new Error(productData.error || 'Không thể tải sản phẩm.');
      if (!machineRes.ok) throw new Error(machineData.error || 'Không thể tải danh sách máy.');
      if (!materialRes.ok) throw new Error(materialData.error || 'Không thể tải kho NVL.');
      if (!productionRes.ok) throw new Error(productionData.error || 'Không thể tải lệnh sản xuất.');

      const nextProducts = normalizeProducts(productData);
      const nextMaterials = normalizeMaterialsInventory(materialData);
      const nextProductionOrders = normalizeProductionOrders(productionData);
      const nextAcceptanceReports = acceptanceRes.ok
        ? normalizeAcceptanceReports(acceptanceData)
        : [];
      const nextShiftSummaryAcceptanceReports = shiftSummaryAcceptanceRes.ok
        ? normalizeAcceptanceReports(shiftSummaryAcceptanceData)
        : [];
      const nextMixingReports = mixingRes.ok
        ? (Array.isArray(mixingData.reports) ? mixingData.reports : []).map(
            (item: Record<string, unknown>) => normalizeMixingReport(item)
          )
        : [];
      const nextWeighingRecords = weighingRes.ok ? normalizeWeighingRecords(weighingData) : [];
      const nextDamagedRecords = damagedRes.ok ? normalizeWeighingRecords(damagedData) : [];
      const nextMachineNvlReports = machineNvlRes.ok
        ? normalizeMachineNvlReports(machineNvlData)
        : [];
      const nextWarehouseMovements = warehouseMovementRes.ok
        ? normalizeWarehouseMovements(warehouseMovementData)
        : [];

      setOrders(normalizeOrders(orderData));
      setProducts(nextProducts);
      setMachines(normalizeMachines(machineData));
      setMaterials(nextMaterials);
      setProductionOrders(nextProductionOrders);
      setProductionOrderSettings(settingRes.ok ? mapProductionOrderSettings(settingData) : []);
      setAcceptanceReports(nextAcceptanceReports);
      setShiftSummaryAcceptanceReports(nextShiftSummaryAcceptanceReports);
      setMixingReports(nextMixingReports);
      setWeighingRecords(nextWeighingRecords);
      setDamagedRecords(nextDamagedRecords);
      setMachineNvlReports(nextMachineNvlReports);
      setShiftSummaryWarehouseMovements(nextWarehouseMovements);

      const localPayloads = [machineData, orderData, materialData, productionData].filter(
        payload => payload && typeof payload === 'object' && (payload as { source?: string }).source === 'local'
      ) as Array<{ source?: string; warning?: string }>;

      if (localPayloads.length > 0) {
        const warnings = localPayloads
          .map(payload => String(payload.warning || '').trim())
          .filter(Boolean);
        setLoadError(
          warnings.length > 0
            ? warnings.join(' ')
            : 'Chưa kết nối Supabase — dữ liệu đang rỗng. Trên Vercel: Project Settings → Environment Variables cần SUPABASE_URL và SUPABASE_SERVICE_KEY, rồi Redeploy. Local: kiểm tra .env rồi npm run dev.'
        );
      }

      return {
        products: nextProducts,
        materials: nextMaterials,
        productionOrders: nextProductionOrders,
        acceptanceReports: nextShiftSummaryAcceptanceReports,
        warehouseMovements: nextWarehouseMovements,
        mixingReports: nextMixingReports,
        damagedRecords: nextDamagedRecords,
        machineNvlReports: nextMachineNvlReports
      };
    } catch (error: any) {
      setOrders([]);
      setProducts([]);
      setMachines([]);
      setMaterials([]);
      setProductionOrders([]);
      setProductionOrderSettings([]);
      setAcceptanceReports([]);
      setShiftSummaryAcceptanceReports([]);
      setMixingReports([]);
      setWeighingRecords([]);
      setDamagedRecords([]);
      setMachineNvlReports([]);
      setShiftSummaryWarehouseMovements([]);
      setLoadError(error.message || 'Không thể tải dữ liệu bảng điều khiển.');
    } finally {
      setIsLoading(false);
    }
  };

  /** Tải lại kho NVL (Tổng kg), Thành phần SP + phiếu xuất — không bật loading toàn trang. */
  const reloadWarehouseSourceData = useCallback(async () => {
    const summaryFrom = dateScopeAll ? '' : shiftSummaryDateFrom || defaultShiftSummaryRange.from;
    const summaryTo = dateScopeAll ? '' : shiftSummaryDateTo || defaultShiftSummaryRange.to;
    const withQuery = (base: string, params: Record<string, string>) => {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
      }
      const qs = search.toString();
      return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
    };
    try {
      const [materialRes, productRes, warehouseMovementRes] = await Promise.all([
        fetch('/api/kho-nvl'),
        fetch('/api/san-pham?format=table'),
        fetch(withQuery('/api/phieu-xuat-nhap-kho', { from: summaryFrom, to: summaryTo }))
      ]);
      const materialData = await materialRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const warehouseMovementData = await warehouseMovementRes.json().catch(() => ({}));
      if (materialRes.ok) {
        setMaterials(normalizeMaterialsInventory(materialData));
      }
      if (productRes.ok) {
        setProducts(normalizeProducts(productData));
      }
      if (warehouseMovementRes.ok) {
        setShiftSummaryWarehouseMovements(normalizeWarehouseMovements(warehouseMovementData));
      }
      const nextProducts = productRes.ok ? normalizeProducts(productData) : null;
      const nextMaterials = materialRes.ok ? normalizeMaterialsInventory(materialData) : null;
      const nextWarehouseMovements = warehouseMovementRes.ok
        ? normalizeWarehouseMovements(warehouseMovementData)
        : null;
      if (nextProducts || nextMaterials || nextWarehouseMovements) {
        return {
          products: nextProducts ?? undefined,
          materials: nextMaterials ?? undefined,
          warehouseMovements: nextWarehouseMovements ?? undefined
        };
      }
    } catch {
      /* giữ dữ liệu hiện tại */
    }
    return undefined;
  }, [dateScopeAll, shiftSummaryDateFrom, shiftSummaryDateTo, defaultShiftSummaryRange.from, defaultShiftSummaryRange.to]);

  const reloadWarehouseSourceDataRef = useRef(reloadWarehouseSourceData);
  reloadWarehouseSourceDataRef.current = reloadWarehouseSourceData;

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void reloadWarehouseSourceDataRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    loadBoard();
  }, [boardDateScope, shiftSummaryDateFrom, shiftSummaryDateTo, filterReloadToken, isAutoReport]);

  const shiftSummaryWarehouseMovementRefs = useMemo(() => {
    const mapped = mapWarehouseMovementsForShiftSummary(shiftSummaryWarehouseMovements);
    return mapped.map(movement => {
      const candidates = resolveWarehouseMovementMachineCandidates(
        movement,
        productionOrders,
        order => resolveProductionOrderMachine(order as ProductionOrderRow, machines)
      );
      if (!candidates.length) return movement;
      return {
        ...movement,
        machine: String(movement.machine || '').trim() || candidates.join(', ')
      };
    });
  }, [shiftSummaryWarehouseMovements, productionOrders, machines]);

  const selectedBoardMachine = useMemo(() => {
    if (!boardFilterMachine || boardFilterMachine === 'all') return null;
    return machines.find(machine => machine.code === boardFilterMachine) ?? { code: boardFilterMachine };
  }, [boardFilterMachine, machines]);

  const boardShiftOptions = useMemo(
    () => getProductionShiftOptions(productionOrderSettings),
    [productionOrderSettings]
  );

  const matchesBoardDateRange = (value?: string) =>
    matchesControlBoardDateRange(value, effectiveDateFrom, effectiveDateTo);

  const matchesBoardShift = (value?: string) => {
    if (!boardFilterShift || boardFilterShift === 'all') return true;
    const shift = String(value ?? '').trim();
    if (!shift) return false;
    return shiftNamesMatch(shift, boardFilterShift);
  };

  const matchesBoardMachine = (...candidates: Array<string | undefined | null>) =>
    machineValueMatchesFilter(boardFilterMachine, selectedBoardMachine, ...candidates);

  /** Lệnh SX khớp bộ lọc: chọn đúng mã, hoặc gõ tìm (vd 0086 / LSX) — tìm trên mọi lệnh đã tải. */
  /** Danh sách máy phụ thuộc ca (và khoảng ngày) được phân công trong lệnh SX. */
  const shiftScopedMachines = useMemo(() => {
    if (!uiBoardFilterShift || uiBoardFilterShift === 'all') return machines;

    const matchesUiDateRange = (value?: string) =>
      matchesControlBoardDateRange(value, uiEffectiveDateFrom, uiEffectiveDateTo);

    return machines.filter(machine =>
      productionOrders.some(order => {
        const orderDate = parseProductionOrderFilterDate(order.startDate) || order.startDate;
        if (!matchesUiDateRange(orderDate || undefined)) return false;
        if (!shiftNamesMatch(order.shift, uiBoardFilterShift)) return false;

        return machineValueMatchesFilter(
          machine.code,
          machine,
          order.machine,
          order.position,
          resolveProductionOrderMachine(order, machines)
        );
      })
    );
  }, [machines, productionOrders, uiBoardFilterShift, uiEffectiveDateFrom, uiEffectiveDateTo]);

  const panelMachines = shiftScopedMachines;

  // `/phan-tich-tu-dong`: tự điền Máy theo lệnh SX của Ngày + Ca.
  // Trang thường: chỉ auto khi ca/ngày có đúng 1 máy.
  const lastMachineAutoKeyRef = useRef('');
  useEffect(() => {
    if (!isAutoReport) {
      if (uiBoardFilterShift === 'all' || panelMachines.length !== 1) return;
      if (uiBoardFilterMachine !== panelMachines[0].code) {
        setBoardFilterMachine(panelMachines[0].code);
      }
      return;
    }

    if (uiDateScopeAll || !uiBoardFilterShift || uiBoardFilterShift === 'all') {
      lastMachineAutoKeyRef.current = '';
      return;
    }
    if (panelMachines.length === 0) return;

    const preferred = pickPreferredMachineCodeFromOrders({
      orders: productionOrders,
      machines,
      dateFrom: uiEffectiveDateFrom,
      dateTo: uiEffectiveDateTo,
      shift: uiBoardFilterShift,
      allowed: panelMachines
    });
    if (!preferred) return;

    const key = `${uiEffectiveDateFrom}|${uiEffectiveDateTo}|${uiBoardFilterShift}`;
    const keyChanged = lastMachineAutoKeyRef.current !== key;
    lastMachineAutoKeyRef.current = key;

    const currentValid = panelMachines.some(machine => machine.code === uiBoardFilterMachine);
    if (keyChanged || uiBoardFilterMachine === 'all' || !currentValid) {
      if (uiBoardFilterMachine !== preferred) {
        setDraftBoardFilterMachine(preferred);
      }
    }
  }, [
    isAutoReport,
    uiDateScopeAll,
    uiBoardFilterShift,
    uiBoardFilterMachine,
    uiEffectiveDateFrom,
    uiEffectiveDateTo,
    panelMachines,
    productionOrders,
    machines
  ]);

  const syncMachineFilterToPanelMachines = (
    machineList: MachineRow[],
    currentMachine: string,
    setMachine: (value: string) => void
  ) => {
    if (currentMachine === 'all') return;
    if (machineList.some(machine => machine.code === currentMachine)) return;
    setMachine(machineList[0]?.code || 'all');
  };

  useEffect(() => {
    if (!isAutoReport) return;
    syncMachineFilterToPanelMachines(panelMachines, uiBoardFilterMachine, value => {
      setDraftBoardFilterMachine(value);
    });
  }, [isAutoReport, panelMachines, uiBoardFilterMachine]);

  /** Lệnh SX khớp ngày + ca (+ máy) đang chọn trên bộ lọc (draft khi `/phan-tich-tu-dong`). */
  const uiBucketProductionOrders = useMemo(() => {
    if (uiDateScopeAll || !uiBoardFilterShift || uiBoardFilterShift === 'all') return [];

    const matchesUiDateRange = (value?: string) =>
      matchesControlBoardDateRange(value, uiEffectiveDateFrom, uiEffectiveDateTo);
    const selectedUiMachine =
      uiBoardFilterMachine !== 'all'
        ? machines.find(machine => machine.code === uiBoardFilterMachine) ?? { code: uiBoardFilterMachine }
        : null;

    return productionOrders.filter(order => {
      const orderDate = parseProductionOrderFilterDate(order.startDate) || order.startDate;
      if (!matchesUiDateRange(orderDate || undefined)) return false;
      if (!shiftNamesMatch(order.shift, uiBoardFilterShift)) return false;
      if (uiBoardFilterMachine === 'all') return true;
      return machineValueMatchesFilter(
        uiBoardFilterMachine,
        selectedUiMachine,
        order.machine,
        order.position,
        resolveProductionOrderMachine(order, machines)
      );
    });
  }, [
    productionOrders,
    machines,
    uiDateScopeAll,
    uiBoardFilterShift,
    uiBoardFilterMachine,
    uiEffectiveDateFrom,
    uiEffectiveDateTo
  ]);

  // `/phan-tich-tu-dong`: đổi ngày/ca (và máy nếu có) thì tự chọn lệnh SX khớp bucket.
  useEffect(() => {
    if (!isAutoReport) return;

    const resetProductionOrderFilter = () => {
      if (draftBoardFilterProductionOrder !== 'all' || draftBoardFilterProductionOrderQuery) {
        setDraftBoardFilterProductionOrder('all');
        setDraftBoardFilterProductionOrderQuery('');
      }
    };

    if (uiDateScopeAll || uiBoardFilterShift === 'all') {
      resetProductionOrderFilter();
      return;
    }

    const matched = [...uiBucketProductionOrders].sort(compareProductionOrderByRecentDate);
    if (matched.length === 0) {
      resetProductionOrderFilter();
      return;
    }

    const { code, label } = buildPanelProductionOrderOptionLabel(
      matched[0],
      machines,
      productionOrderSettings
    );
    if (draftBoardFilterProductionOrder !== code || draftBoardFilterProductionOrderQuery !== label) {
      setDraftBoardFilterProductionOrder(code);
      setDraftBoardFilterProductionOrderQuery(label);
    }
  }, [
    isAutoReport,
    uiDateScopeAll,
    uiBoardFilterShift,
    uiBoardFilterMachine,
    uiEffectiveDateFrom,
    uiEffectiveDateTo,
    uiBucketProductionOrders,
    machines,
    productionOrderSettings,
    draftBoardFilterProductionOrder,
    draftBoardFilterProductionOrderQuery
  ]);

  // Bộ lọc bị khóa theo URL: không có nút Áp dụng, nên đồng bộ ngay Máy/Lệnh SX tự chọn (draft) sang state hiển thị.
  useEffect(() => {
    if (!lockedByUrlFilters) return;
    if (boardFilterMachine !== draftBoardFilterMachine) setBoardFilterMachine(draftBoardFilterMachine);
    if (boardFilterProductionOrder !== draftBoardFilterProductionOrder) {
      setBoardFilterProductionOrder(draftBoardFilterProductionOrder);
    }
    if (boardFilterProductionOrderQuery !== draftBoardFilterProductionOrderQuery) {
      setBoardFilterProductionOrderQuery(draftBoardFilterProductionOrderQuery);
    }
  }, [
    lockedByUrlFilters,
    draftBoardFilterMachine,
    draftBoardFilterProductionOrder,
    draftBoardFilterProductionOrderQuery,
    boardFilterMachine,
    boardFilterProductionOrder,
    boardFilterProductionOrderQuery
  ]);

  const handleUiBoardShiftChange = (shift: string) => {
    if (isAutoReport) setDraftBoardFilterShift(shift);
    else setBoardFilterShift(shift);

    const currentMachine = isAutoReport ? draftBoardFilterMachine : boardFilterMachine;
    const matchesUiDateRange = (value?: string) =>
      matchesControlBoardDateRange(value, uiEffectiveDateFrom, uiEffectiveDateTo);

    // Không giữ máy của ca trước nếu máy đó không có lệnh SX ở ca vừa chọn.
    if (
      currentMachine !== 'all' &&
      shift !== 'all' &&
      !machines.some(machine =>
        machine.code === currentMachine &&
        productionOrders.some(order => {
          const orderDate = parseProductionOrderFilterDate(order.startDate) || order.startDate;
          return (
            matchesUiDateRange(orderDate || undefined) &&
            shiftNamesMatch(order.shift, shift) &&
            machineValueMatchesFilter(
              machine.code,
              machine,
              order.machine,
              order.position,
              resolveProductionOrderMachine(order, machines)
            )
          );
        })
      )
    ) {
      if (isAutoReport) setDraftBoardFilterMachine('all');
      else setBoardFilterMachine('all');
    }
  };

  const boardMatchedProductionOrders = useMemo(() => {
    const exactCode =
      boardFilterProductionOrder && boardFilterProductionOrder !== 'all'
        ? boardFilterProductionOrder
        : '';
    const query = boardFilterProductionOrderQuery.trim().toLowerCase();

    if (exactCode) {
      return productionOrders.filter(order => order.code === exactCode);
    }
    if (!query) return null;

    const compactQuery = query.replace(/[^a-z0-9]/g, '');

    return productionOrders.filter(order => {
      const ngay = parseProductionOrderFilterDate(order.startDate);
      const machineLabel = resolveProductionOrderMachine(order, machines);
      const shiftLabel = formatProductionOrderShiftLabel(order.shift, productionOrderSettings);
      const haystack = `${order.code} ${order.name} ${order.id} ${ngay} ${order.shift} ${shiftLabel} ${order.machine} ${order.position} ${machineLabel} ${order.orderRef} ${order.productCode}`
        .toLowerCase();
      if (haystack.includes(query)) return true;
      if (!compactQuery) return false;
      const compactHaystack = haystack.replace(/[^a-z0-9]/g, '');
      return compactHaystack.includes(compactQuery);
    });
  }, [
    productionOrders,
    boardFilterProductionOrder,
    boardFilterProductionOrderQuery,
    machines,
    productionOrderSettings
  ]);

  const hasBoardProductionOrderFilter = boardMatchedProductionOrders !== null;

  const orderMatchesBucket = (
    order: ProductionOrderRow,
    ngay?: string,
    ca?: string,
    ...machineCandidates: Array<string | undefined | null>
  ) => {
    const orderNgay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
    if (!matchesShiftSummaryBucket(orderNgay, order.shift, ngay || '', ca || '', boardShiftOptions)) {
      return false;
    }
    const hasMachineHint = machineCandidates.some(value => {
      const raw = String(value || '').trim();
      return Boolean(raw && raw !== '-');
    });
    if (!hasMachineHint) return true;
    return machineValueMatchesFilter(
      order.machine || 'all',
      {
        code: order.machine,
        name: resolveProductionOrderMachine(order, machines)
      },
      ...machineCandidates,
      order.machine,
      order.position,
      resolveProductionOrderMachine(order, machines)
    );
  };

  /** Khi lọc lệnh SX: khớp ngày + ca (+ máy) của một trong các lệnh đang khớp. */
  const matchesBoardProductionOrderBucket = (
    ngay?: string,
    ca?: string,
    ...machineCandidates: Array<string | undefined | null>
  ) => {
    if (!hasBoardProductionOrderFilter || !boardMatchedProductionOrders) return true;
    if (boardMatchedProductionOrders.length === 0) return false;
    return boardMatchedProductionOrders.some(order =>
      orderMatchesBucket(order, ngay, ca, ...machineCandidates)
    );
  };

  const boardScopedProductionOrders = useMemo(() => {
    if (!hasBoardProductionOrderFilter || !boardMatchedProductionOrders) return productionOrders;
    return boardMatchedProductionOrders;
  }, [productionOrders, hasBoardProductionOrderFilter, boardMatchedProductionOrders]);

  const boardScopedAcceptanceReports = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return shiftSummaryAcceptanceReports;
    return shiftSummaryAcceptanceReports.filter(report => {
      const ngay = parseProductionOrderFilterDate(report.ngay) || report.ngay;
      return matchesBoardProductionOrderBucket(ngay, report.ca, report.ma_may, report.ten_may);
    });
  }, [
    shiftSummaryAcceptanceReports,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders,
    boardShiftOptions,
    machines
  ]);

  const boardScopedWarehouseMovements = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return shiftSummaryWarehouseMovementRefs;
    return shiftSummaryWarehouseMovementRefs.filter(movement => {
      const machineCandidates = resolveWarehouseMovementMachineCandidates(
        movement,
        productionOrders,
        order => resolveProductionOrderMachine(order as ProductionOrderRow, machines)
      );
      if (movement.slipType === 'xuat') {
        const movementNgay = parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate;
        const hasLinkedCodes = movementHasLinkedProductionOrderCodes(movement);
        return boardMatchedProductionOrders!.some(order => {
          const orderNgay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
          if (orderNgay && movementNgay && orderNgay !== movementNgay) return false;

          const hasMachineHint = machineCandidates.some(value => {
            const raw = String(value || '').trim();
            return Boolean(raw && raw !== '-');
          });
          if (hasMachineHint) {
            if (
              !machineValueMatchesFilter(
                order.machine || 'all',
                {
                  code: order.machine,
                  name: resolveProductionOrderMachine(order, machines)
                },
                ...machineCandidates,
                order.machine,
                order.position,
                resolveProductionOrderMachine(order, machines)
              )
            ) {
              return false;
            }
          }

          if (hasLinkedCodes) {
            return movementLinksProductionOrderCode(movement, order.code);
          }
          return true;
        });
      }
      return matchesBoardProductionOrderBucket(
        movement.slipDate,
        movement.shift,
        ...machineCandidates
      );
    });
  }, [
    shiftSummaryWarehouseMovementRefs,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders,
    boardShiftOptions,
    productionOrders,
    machines
  ]);

  /** Phiếu xuất NVL cùng ngày lệnh (mọi ca) — cột «Xuất trong ngày» & in phiếu mục 3.1/3.2. */
  const boardWarehouseMovementsByDate = useMemo(() => {
    return shiftSummaryWarehouseMovementRefs.filter(movement => {
      if (movement.slipType !== 'xuat' || movement.warehouseKind !== 'nvl') return false;

      const movementNgay = parseProductionOrderFilterDate(movement.slipDate) || movement.slipDate;
      if (!matchesBoardDateRange(movementNgay)) return false;

      const machineCandidates = resolveWarehouseMovementMachineCandidates(
        movement,
        productionOrders,
        order => resolveProductionOrderMachine(order as ProductionOrderRow, machines)
      );

      if (boardFilterMachine && boardFilterMachine !== 'all') {
        if (
          !machineValueMatchesFilter(
            boardFilterMachine,
            selectedBoardMachine,
            ...machineCandidates,
            movement.machine
          )
        ) {
          return false;
        }
      }

      if (!hasBoardProductionOrderFilter || !boardMatchedProductionOrders) {
        return true;
      }
      if (boardMatchedProductionOrders.length === 0) return false;

      const hasLinkedCodes = movementHasLinkedProductionOrderCodes(movement);

      return boardMatchedProductionOrders.some(order => {
        const orderNgay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
        if (orderNgay && movementNgay && orderNgay !== movementNgay) return false;

        const hasMachineHint = machineCandidates.some(value => {
          const raw = String(value || '').trim();
          return Boolean(raw && raw !== '-');
        });
        if (hasMachineHint) {
          if (
            !machineValueMatchesFilter(
              order.machine || 'all',
              {
                code: order.machine,
                name: resolveProductionOrderMachine(order, machines)
              },
              ...machineCandidates,
              order.machine,
              order.position,
              resolveProductionOrderMachine(order, machines)
            )
          ) {
            return false;
          }
        }

        if (hasLinkedCodes) {
          return movementLinksProductionOrderCode(movement, order.code);
        }
        return true;
      });
    });
  }, [
    shiftSummaryWarehouseMovementRefs,
    matchesBoardDateRange,
    boardFilterMachine,
    selectedBoardMachine,
    productionOrders,
    machines,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders
  ]);

  const boardScopedWeighingRecords = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return weighingRecords;
    return weighingRecords.filter(record =>
      matchesBoardProductionOrderBucket(
        record.productionDate || record.reportDate,
        record.shiftName,
        record.machineName
      )
    );
  }, [weighingRecords, hasBoardProductionOrderFilter, boardMatchedProductionOrders, boardShiftOptions, machines]);

  const boardScopedDamagedRecords = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return damagedRecords;
    return damagedRecords.filter(record =>
      matchesBoardProductionOrderBucket(
        record.productionDate || record.reportDate,
        record.shiftName,
        record.machineName
      )
    );
  }, [damagedRecords, hasBoardProductionOrderFilter, boardMatchedProductionOrders, boardShiftOptions, machines]);

  const boardScopedMachineNvlReports = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return machineNvlReports;
    return machineNvlReports.filter(report =>
      // Phiếu tồn ca: khớp ngày + ca lệnh; máy có thể ghi "Bao Bì" khác mã máy lệnh
      matchesBoardProductionOrderBucket(report.ngay, report.ca)
    );
  }, [machineNvlReports, hasBoardProductionOrderFilter, boardMatchedProductionOrders, boardShiftOptions, machines]);

  const boardScopedMixingReports = useMemo(() => {
    if (!hasBoardProductionOrderFilter || !boardMatchedProductionOrders) return mixingReports;
    if (boardMatchedProductionOrders.length === 0) return [];
    // Giữ phiếu trộn ca lệnh + ca liền trước (nguồn Tỉ lệ TB thực tế trên tab thực dùng).
    return mixingReports.filter(report => {
      if (matchesBoardProductionOrderBucket(report.ngay, report.ca, report.ma_may, report.ten_may)) {
        return true;
      }
      return boardMatchedProductionOrders.some(order => {
        const orderNgay = parseProductionOrderFilterDate(order.startDate) || order.startDate;
        const previous = resolvePreviousProductionShift(String(orderNgay || ''), order.shift, boardShiftOptions);
        if (!previous) return false;
        if (
          !matchesShiftSummaryBucket(
            previous.ngay,
            previous.shift,
            report.ngay,
            report.ca,
            boardShiftOptions
          )
        ) {
          return false;
        }
        const hasMachineHint = [report.ma_may, report.ten_may].some(value => {
          const raw = String(value || '').trim();
          return Boolean(raw && raw !== '-');
        });
        if (!hasMachineHint) return true;
        return machineValueMatchesFilter(
          order.machine || 'all',
          {
            code: order.machine,
            name: resolveProductionOrderMachine(order, machines)
          },
          report.ma_may,
          report.ten_may,
          order.machine,
          order.position,
          resolveProductionOrderMachine(order, machines)
        );
      });
    });
  }, [
    mixingReports,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders,
    boardShiftOptions,
    machines
  ]);

  const shiftSummaryRows = useMemo(
    () =>
      buildControlBoardShiftSummary({
        shiftSettings: productionOrderSettings,
        productionOrders: boardScopedProductionOrders,
        products: products.map(product => ({ code: product.code, totalWeight: product.totalWeight })),
        materials: materials.map(material => ({
          code: material.code,
          name: material.name,
          warehouse: material.warehouse,
          totalWeight: material.totalWeight
        })),
        acceptanceReports: boardScopedAcceptanceReports,
        warehouseMovements: boardScopedWarehouseMovements,
        weighingRecords: boardScopedWeighingRecords,
        damagedRecords: boardScopedDamagedRecords,
        machineNvlReports: boardScopedMachineNvlReports,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo
      }),
    [
      productionOrderSettings,
      boardScopedProductionOrders,
      products,
      materials,
      boardScopedAcceptanceReports,
      boardScopedWarehouseMovements,
      boardScopedWeighingRecords,
      boardScopedDamagedRecords,
      boardScopedMachineNvlReports,
      effectiveDateFrom,
      effectiveDateTo
    ]
  );

  const panelShiftOptions = useMemo(() => {
    const fromSettings = productionOrderSettings
      .filter(setting => setting.loaiCaiDat === 'Thời gian')
      .map(setting => setting.name || setting.code)
      .filter(value => value && value !== '-');

    const fromData = [
      ...shiftSummaryRows.map(row => row.ca),
      ...acceptanceReports.map(report => report.ca),
      ...weighingRecords.map(record => record.shiftName),
      ...machineNvlReports.map(report => report.ca),
      ...productionOrders.map(row => (row.shift && row.shift !== '-' ? row.shift : ''))
    ].filter(Boolean);

    return [...new Set(fromSettings.length > 0 ? fromSettings : fromData)].sort((a, b) =>
      String(a).localeCompare(String(b), 'vi', { numeric: true })
    );
  }, [
    productionOrderSettings,
    shiftSummaryRows,
    acceptanceReports,
    weighingRecords,
    machineNvlReports,
    productionOrders
  ]);

  const formatPanelShiftLabel = (shift: string) => formatProductionOrderShiftLabel(shift, productionOrderSettings);

  const hasPendingFilterChanges = useMemo(() => {
    if (!isAutoReport) return false;
    return (
      draftBoardDateScope !== boardDateScope ||
      draftShiftSummaryDateFrom !== shiftSummaryDateFrom ||
      draftShiftSummaryDateTo !== shiftSummaryDateTo ||
      draftBoardFilterShift !== boardFilterShift ||
      draftBoardFilterMachine !== boardFilterMachine ||
      draftBoardFilterProductionOrder !== boardFilterProductionOrder ||
      draftBoardFilterProductionOrderQuery !== boardFilterProductionOrderQuery
    );
  }, [
    isAutoReport,
    draftBoardDateScope,
    boardDateScope,
    draftShiftSummaryDateFrom,
    shiftSummaryDateFrom,
    draftShiftSummaryDateTo,
    shiftSummaryDateTo,
    draftBoardFilterShift,
    boardFilterShift,
    draftBoardFilterMachine,
    boardFilterMachine,
    draftBoardFilterProductionOrder,
    boardFilterProductionOrder,
    draftBoardFilterProductionOrderQuery,
    boardFilterProductionOrderQuery
  ]);

  const applyBoardFilters = () => {
    if (!isAutoReport) return;
    const dateChanged =
      draftBoardDateScope !== boardDateScope ||
      draftShiftSummaryDateFrom !== shiftSummaryDateFrom ||
      draftShiftSummaryDateTo !== shiftSummaryDateTo;
    setBoardDateScope(draftBoardDateScope);
    setShiftSummaryDateFrom(draftShiftSummaryDateFrom);
    setShiftSummaryDateTo(draftShiftSummaryDateTo);
    setBoardFilterShift(draftBoardFilterShift);
    setBoardFilterMachine(draftBoardFilterMachine);
    setBoardFilterProductionOrder(draftBoardFilterProductionOrder);
    setBoardFilterProductionOrderQuery(draftBoardFilterProductionOrderQuery);
    if (dateChanged) setFilterReloadToken(token => token + 1);
  };

  const clearBoardFilters = () => {
    const defaultRange = defaultShiftSummaryDateRange(14);
    setBoardDateScope('range');
    setShiftSummaryDateFrom(defaultRange.from);
    setShiftSummaryDateTo(defaultRange.to);
    setBoardFilterShift('all');
    setBoardFilterMachine('all');
    setBoardFilterProductionOrder('all');
    setBoardFilterProductionOrderQuery('');
    if (isAutoReport) {
      setDraftBoardDateScope('range');
      setDraftShiftSummaryDateFrom(defaultRange.from);
      setDraftShiftSummaryDateTo(defaultRange.to);
      setDraftBoardFilterShift('all');
      setDraftBoardFilterMachine('all');
      setDraftBoardFilterProductionOrder('all');
      setDraftBoardFilterProductionOrderQuery('');
      setFilterReloadToken(token => token + 1);
    }
    setProductionOrderStaffFilters(new Set());
  };

  const panelProductionOrderOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ code: string; label: string; ngay: string; inRange: boolean }> = [];
    const optionDateFrom = isAutoReport ? uiEffectiveDateFrom : effectiveDateFrom;
    const optionDateTo = isAutoReport ? uiEffectiveDateTo : effectiveDateTo;
    const optionDateScopeAll = isAutoReport ? uiDateScopeAll : dateScopeAll;
    const matchesOptionDateRange = (value?: string) =>
      matchesControlBoardDateRange(value, optionDateFrom, optionDateTo);
    const bucketCodes =
      isAutoReport && !uiDateScopeAll && uiBoardFilterShift !== 'all'
        ? new Set(uiBucketProductionOrders.map(order => order.code))
        : null;

    for (const order of productionOrders) {
      const { code, label, ngay } = buildPanelProductionOrderOptionLabel(
        order,
        machines,
        productionOrderSettings
      );
      if (!code || seen.has(code)) continue;
      if (bucketCodes && !bucketCodes.has(code)) continue;
      seen.add(code);
      options.push({
        code,
        label,
        ngay,
        inRange: optionDateScopeAll ? true : matchesOptionDateRange(ngay || order.startDate)
      });
    }

    return options.sort((a, b) => {
      if (a.inRange !== b.inRange) return a.inRange ? -1 : 1;
      const dateCmp = (b.ngay || '').localeCompare(a.ngay || '');
      if (dateCmp !== 0) return dateCmp;
      return a.code.localeCompare(b.code, 'vi', { numeric: true });
    });
  }, [
    productionOrders,
    machines,
    productionOrderSettings,
    effectiveDateFrom,
    effectiveDateTo,
    isAutoReport,
    uiEffectiveDateFrom,
    uiEffectiveDateTo,
    uiDateScopeAll,
    dateScopeAll,
    uiBoardFilterShift,
    uiBucketProductionOrders
  ]);

  useEffect(() => {
    if (boardFilterProductionOrder === 'all') return;
    if (!productionOrders.some(order => order.code === boardFilterProductionOrder)) {
      setBoardFilterProductionOrder('all');
    }
  }, [boardFilterProductionOrder, productionOrders]);

  const handleDeleteMixingReport = async (reportId: string) => {
    const res = await fetch(`/api/bao-cao-phoi-tron/${reportId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Không thể xóa báo cáo phối trộn.');
    }
    await loadBoard();
  };

  const handleDeleteMixingReports = async (reportIds: string[]) => {
    const uniqueIds = Array.from(new Set(reportIds.filter(Boolean)));
    for (const reportId of uniqueIds) {
      const res = await fetch(`/api/bao-cao-phoi-tron/${reportId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa báo cáo phối trộn.');
      }
    }
    await loadBoard();
  };

  const productQuery = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!productQuery) return products;
    return products.filter(product =>
      `${product.code} ${product.name} ${product.group} ${product.nature}`.toLowerCase().includes(productQuery)
    );
  }, [products, productQuery]);

  const materialQuery = materialSearch.trim().toLowerCase();
  const filteredMaterials = useMemo(() => {
    if (!materialQuery) return materials;
    return materials.filter(material =>
      `${material.code} ${material.name} ${material.unit}`.toLowerCase().includes(materialQuery)
    );
  }, [materials, materialQuery]);

  const productionOrderQuery = productionOrderSearch.trim().toLowerCase();
  const productionOrderStaffOptions = useMemo(() => {
    return [
      ...new Set(productionOrders.flatMap(row => splitProductionOrderStaffNames(row.staff)))
    ].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  }, [productionOrders]);
  const recentProductionOrders = useMemo(() => {
    const sorted = [...productionOrders].sort(compareProductionOrderByRecentDate);

    return sorted.filter(row =>
      {
        const matchesSearch =
          !productionOrderQuery ||
          `${row.code} ${row.name} ${row.productCode} ${row.productName} ${row.customer} ${row.orderRef} ${row.status} ${row.machine} ${row.position} ${resolveProductionOrderMachine(row, machines)} ${row.shift} ${row.staff} ${row.note}`
            .toLowerCase()
            .includes(productionOrderQuery);
        const rowDate = parseProductionOrderFilterDate(row.startDate);
        const matchesDate = matchesBoardDateRange(rowDate || undefined);
        const rowShift = row.shift && row.shift !== '-' ? row.shift : 'Chưa phân ca';
        const matchesShift = matchesBoardShift(rowShift === 'Chưa phân ca' ? '' : rowShift);
        const matchesMachine = matchesBoardMachine(row.machine, row.position, resolveProductionOrderMachine(row, machines));
        const matchesProductionOrder =
          !hasBoardProductionOrderFilter ||
          Boolean(boardMatchedProductionOrders?.some(order => order.code === row.code));
        const rowStaff = splitProductionOrderStaffNames(row.staff);
        const matchesStaff =
          productionOrderStaffFilters.size === 0 ||
          rowStaff.some(name => productionOrderStaffFilters.has(name));

        if (hasBoardProductionOrderFilter) {
          return matchesSearch && matchesProductionOrder && matchesStaff;
        }

        return matchesSearch && matchesDate && matchesShift && matchesMachine && matchesStaff;
      }
    );
  }, [
    productionOrders,
    productionOrderQuery,
    effectiveDateFrom,
    effectiveDateTo,
    boardFilterShift,
    boardFilterMachine,
    productionOrderStaffFilters,
    machines,
    selectedBoardMachine,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders
  ]);

  const previewLimit = 12;
  const productionPreviewLimit = 20;
  const visibleProductionOrders = recentProductionOrders.slice(0, productionPreviewLimit);
  const selectedProductionOrdersForPlan = useMemo(
    () => productionOrders.filter(row => selectedProductionOrderIds.includes(row.id)),
    [productionOrders, selectedProductionOrderIds]
  );
  const selectedVisibleProductionOrderIds = visibleProductionOrders
    .map(row => row.id)
    .filter(id => selectedProductionOrderIds.includes(id));
  const allVisibleProductionOrdersSelected =
    visibleProductionOrders.length > 0 && selectedVisibleProductionOrderIds.length === visibleProductionOrders.length;
  const hasAnyVisibleProductionOrderSelected = selectedVisibleProductionOrderIds.length > 0;

  useEffect(() => {
    setSelectedProductionOrderIds(prev => prev.filter(id => productionOrders.some(row => row.id === id)));
  }, [productionOrders]);

  const handleDeleteProductionOrder = async (row: ProductionOrderRow) => {
    if (!canDelete) return;
    const label = row.code || row.name || 'lệnh SX';
    if (
      !window.confirm(
        `Xóa ${label}?\n\nToàn bộ dữ liệu liên quan sẽ bị xóa theo: đơn hàng liên kết, dòng kế hoạch SX và phiếu báo dừng máy của lệnh này.`
      )
    )
      return;

    setDeletingProductionOrderId(row.id);
    try {
      const res = await fetch(`/api/lenh-sx/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa lệnh sản xuất.');
      }
      if (data.warning) {
        window.alert(String(data.warning));
      }
      if (viewingProductionOrder?.id === row.id) setViewingProductionOrder(null);
      if (editingProductionOrder?.id === row.id) setEditingProductionOrder(null);
      await loadBoard();
    } catch (error: any) {
      window.alert(error.message || 'Không thể xóa lệnh sản xuất.');
    } finally {
      setDeletingProductionOrderId('');
    }
  };

  const toggleProductionOrderSelection = (orderId: string) => {
    setSelectedProductionOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const toggleSelectAllVisibleProductionOrders = () => {
    setSelectedProductionOrderIds(prev => {
      const visibleIds = visibleProductionOrders.map(row => row.id);
      if (visibleIds.length === 0) return prev;
      if (allVisibleProductionOrdersSelected) {
        return prev.filter(id => !visibleIds.includes(id));
      }
      return [...new Set([...prev, ...visibleIds])];
    });
  };

  const toggleProductionOrderStaffFilter = (staffName: string) => {
    setProductionOrderStaffFilters(prev => {
      const next = new Set(prev);
      if (next.has(staffName)) {
        next.delete(staffName);
      } else {
        next.add(staffName);
      }
      return next;
    });
  };

  const clearProductionOrderFilters = () => {
    setProductionOrderStaffFilters(new Set());
  };

  const handlePrintSelectedProductionOrders = async () => {
    const rowsToPrint = visibleProductionOrders.filter(row => selectedProductionOrderIds.includes(row.id));
    if (rowsToPrint.length === 0) return;

    setIsBatchPrinting(true);
    try {
      const productCatalog = await loadProductionOrderProductCatalog();
      const printableItems = await Promise.all(
        rowsToPrint.map(async order => {
          const [{ materials, product }, machineLabel] = await Promise.all([
            loadProductionOrderPrintMaterials(order),
            resolveProductionOrderMachineLabel(order.machine)
          ]);
          return {
            order,
            materials,
            machineLabel,
            product
          };
        })
      );
      setPrintingBatchProductCatalog(productCatalog);
      setPrintingBatchOrders(printableItems);
      setPendingBatchPrint(true);
    } catch (error) {
      console.error('Không thể in nhiều lệnh SX:', error);
      window.alert('Không thể tải dữ liệu để in các lệnh SX đã chọn.');
    } finally {
      setIsBatchPrinting(false);
    }
  };

  useEffect(() => {
    if (!pendingBatchPrint || printingBatchOrders.length === 0) return;

    let cancelled = false;
    document.body.classList.add('production-order-print-active');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingBatchPrint(false);
      });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('production-order-print-active');
    };
  }, [pendingBatchPrint, printingBatchOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('production-order-print-active');
      setPrintingBatchOrders([]);
      setPrintingBatchProductCatalog([]);
      setPendingBatchPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1880px] flex-col gap-2.5 sm:gap-3">
      {loadError && (
        <p className="order-[-40] rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {loadError}
        </p>
      )}

      <div className="order-[-30] flex flex-col gap-2">
        {!showFilterBar ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-700">
            <button
              type="button"
              onClick={() => {
                window.location.href = '/bieu-do-th';
              }}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-100"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Quay lại
            </button>
            <span>
              Ngày:{' '}
              <span className="text-zinc-900">
                {shiftSummaryDateFrom ? formatProductionOrderPanelDate(shiftSummaryDateFrom) : '—'}
              </span>
            </span>
            <span>
              Ca: <span className="text-zinc-900">{boardFilterShift === 'all' ? 'Tất cả' : formatPanelShiftLabel(boardFilterShift)}</span>
            </span>
            <span>
              Máy:{' '}
              <span className="text-zinc-900">
                {selectedBoardMachine?.name ||
                  selectedBoardMachine?.code ||
                  (boardFilterMachine === 'all' ? 'Tất cả' : boardFilterMachine)}
              </span>
            </span>
            <span>
              Lệnh SX:{' '}
              <span className="text-zinc-900">
                {boardFilterProductionOrderQuery || (boardFilterProductionOrder !== 'all' ? boardFilterProductionOrder : '—')}
              </span>
            </span>
          </div>
        ) : (
        <ControlBoardCommonFilters
          dateScope={uiBoardDateScope}
          onDateScopeChange={isAutoReport ? setDraftBoardDateScope : setBoardDateScope}
          dateFrom={uiShiftSummaryDateFrom}
          dateTo={uiShiftSummaryDateTo}
          onDateFromChange={isAutoReport ? setDraftShiftSummaryDateFrom : setShiftSummaryDateFrom}
          onDateToChange={isAutoReport ? setDraftShiftSummaryDateTo : setShiftSummaryDateTo}
          shift={uiBoardFilterShift}
          onShiftChange={handleUiBoardShiftChange}
          shiftOptions={panelShiftOptions}
          formatShiftLabel={formatPanelShiftLabel}
          machine={uiBoardFilterMachine}
          onMachineChange={isAutoReport ? setDraftBoardFilterMachine : setBoardFilterMachine}
          machines={panelMachines}
          productionOrder={uiBoardFilterProductionOrder}
          productionOrderQuery={uiBoardFilterProductionOrderQuery}
          onProductionOrderChange={isAutoReport ? setDraftBoardFilterProductionOrder : setBoardFilterProductionOrder}
          onProductionOrderQueryChange={
            isAutoReport ? setDraftBoardFilterProductionOrderQuery : setBoardFilterProductionOrderQuery
          }
          productionOrderOptions={panelProductionOrderOptions}
          onClear={clearBoardFilters}
          isLoading={isLoading}
          deferApply={isAutoReport}
          onApply={applyBoardFilters}
          hasPendingChanges={hasPendingFilterChanges}
        />
        )}
        {reportOnly ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowReportListsModal(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-black text-red-700 shadow-xs transition hover:border-red-300 hover:bg-red-50"
              title="Mở danh sách báo cáo như trang /danh-sach-bao-cao"
            >
              <ClipboardList className="h-4 w-4 text-[#ef1b2d]" />
              Danh sách báo cáo
            </button>
          </div>
        ) : null}
      </div>

      <ControlBoardBbMachineReportTable
        productionOrders={boardScopedProductionOrders}
        products={products}
        materials={materials}
        machines={machines}
        warehouseMovements={boardScopedWarehouseMovements}
        warehouseMovementsByDate={boardWarehouseMovementsByDate}
        damagedRecords={boardScopedDamagedRecords}
        machineNvlReports={boardScopedMachineNvlReports}
        mixingReports={boardScopedMixingReports}
        acceptanceReports={boardScopedAcceptanceReports}
        canTuDongRecords={[]}
        sanLuongSource={isAutoReport ? 'can-tu-dong' : 'acceptance'}
        includeAllMachines={isAutoReport}
        shiftSettings={productionOrderSettings}
        isLoading={isLoading}
        dateFrom={effectiveDateFrom}
        dateTo={effectiveDateTo}
        shiftFilter={boardFilterShift}
        machineFilter={boardFilterMachine}
        selectedMachine={selectedBoardMachine}
        onApplyCalcScope={scope => {
          setBoardDateScope('range');
          setShiftSummaryDateFrom(scope.dateFrom);
          setShiftSummaryDateTo(scope.dateTo);
          setBoardFilterShift(scope.shiftFilter);
          setBoardFilterMachine(scope.machineFilter);
          if (isAutoReport) {
            setDraftBoardDateScope('range');
            setDraftShiftSummaryDateFrom(scope.dateFrom);
            setDraftShiftSummaryDateTo(scope.dateTo);
            setDraftBoardFilterShift(scope.shiftFilter);
            setDraftBoardFilterMachine(scope.machineFilter);
            setFilterReloadToken(token => token + 1);
          }
        }}
        onReloadSourceData={loadBoard}
        onReloadWarehouseData={reloadWarehouseSourceData}
      />

      {reportOnly ? (
        <ReportListsHubModal
          open={showReportListsModal}
          onClose={() => setShowReportListsModal(false)}
          onNavigate={tab => {
            setShowReportListsModal(false);
            onNavigate(tab);
          }}
          filters={{
            dateFrom: effectiveDateFrom,
            dateTo: effectiveDateTo,
            shift: boardFilterShift,
            machineCode: boardFilterMachine
          }}
          filterSummary={
            [
              dateScopeAll
                ? 'Tất cả ngày'
                : shiftSummaryDateFrom && shiftSummaryDateTo
                ? shiftSummaryDateFrom === shiftSummaryDateTo
                  ? shiftSummaryDateFrom
                  : `${shiftSummaryDateFrom} → ${shiftSummaryDateTo}`
                : '',
              !boardFilterShift || boardFilterShift === 'all' ? 'Tất cả ca' : `Ca ${boardFilterShift}`,
              selectedBoardMachine?.name ||
                selectedBoardMachine?.code ||
                (!boardFilterMachine || boardFilterMachine === 'all' ? 'Tất cả máy' : boardFilterMachine)
            ]
              .filter(Boolean)
              .join(' · ')
          }
          onEditMachineNvlReport={onEditMachineNvlReport}
          onEditAcceptanceReport={onEditAcceptanceReport}
        />
      ) : null}

      {!reportOnly && (
      <>
      <div className="order-[-20] grid grid-cols-1 gap-3">
        <DashboardWindow
          title="Lệnh sản xuất"
          icon={Factory}
          accentClass="bg-gradient-to-r from-emerald-900 to-emerald-700"
          count={recentProductionOrders.length}
          countLabel="Lệnh"
          search={productionOrderSearch}
          onSearchChange={setProductionOrderSearch}
          isLoading={isLoading}
          error=""
          onOpen={async () => {
            if (selectedProductionOrdersForPlan.length === 0) return;
            await loadBoard();
            setShowProductionPlan(true);
          }}
          openLabel={`Tạo Kế hoạch SX${selectedProductionOrdersForPlan.length > 0 ? ` (${selectedProductionOrdersForPlan.length})` : ''}`}
          disabled={selectedProductionOrdersForPlan.length === 0}
          secondaryAction={
            canCreate
              ? {
                  label: 'Thêm mới',
                  onClick: () => setShowAddProductionOrder(true)
                }
              : undefined
          }
          tertiaryAction={{
            label: `In lệnh${selectedProductionOrderIds.length > 0 ? ` (${selectedProductionOrderIds.length})` : ''}`,
            onClick: handlePrintSelectedProductionOrders,
            disabled: !hasAnyVisibleProductionOrderSelected,
            loading: isBatchPrinting
          }}
        >
          <div className="border-b border-zinc-100 bg-white p-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={clearProductionOrderFilters}
                className="h-7 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-[11px] font-black text-zinc-700 transition hover:bg-zinc-100"
              >
                Xóa lọc
              </button>
            </div>

            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Nhân sự</span>
                <span className="text-[10px] font-bold text-zinc-400">
                  Hiển thị {recentProductionOrders.length}/{productionOrders.length} lệnh
                </span>
              </div>
              {productionOrderStaffOptions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-400">
                  Chưa có nhân sự trong lệnh SX.
                </p>
              ) : (
                <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-1.5">
                  {productionOrderStaffOptions.map(staffName => {
                    const checked = productionOrderStaffFilters.has(staffName);
                    return (
                      <label
                        key={staffName}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                          checked
                            ? 'border-[#ef1b2d]/30 bg-red-50 text-[#b30d1c]'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProductionOrderStaffFilter(staffName)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        />
                        {staffName}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 overflow-x-auto">
          <table className="control-board-report-table w-full min-w-[880px] text-left text-[11px]">
            <thead className="sticky top-0 bg-[#ef1b2d] text-[10px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-2 py-1.5 text-center font-black">
                  <input
                    type="checkbox"
                    checked={allVisibleProductionOrdersSelected}
                    onChange={toggleSelectAllVisibleProductionOrders}
                    aria-label="Chọn tất cả lệnh SX đang hiển thị"
                    className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                  />
                </th>
                <th className="px-2 py-1.5 font-black">Ngày</th>
                <th className="px-2 py-1.5 font-black">Ưu tiên</th>
                <th className="px-2 py-1.5 font-black">Mã lệnh</th>
                <th className="px-2 py-1.5 font-black">Mã hàng</th>
                <th className="px-2 py-1.5 font-black">SL</th>
                <th className="px-2 py-1.5 font-black">Trạng thái</th>
                <th className="px-2 py-1.5 font-black">Máy</th>
                <th className="px-2 py-1.5 font-black">Đơn hàng</th>
                <th className="min-w-[120px] px-2 py-1.5 font-black">Ghi chú</th>
                <th className="px-2 py-1.5 text-center font-black">Thao tác</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleProductionOrders.map(row => (
                  <tr key={row.id} className="hover:bg-emerald-50/50">
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedProductionOrderIds.includes(row.id)}
                      onChange={() => toggleProductionOrderSelection(row.id)}
                      aria-label={`Chọn ${row.code || row.name}`}
                      className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px] font-bold text-zinc-700">
                    {formatProductionOrderPanelDate(row.startDate)}
                  </td>
                  <td className="px-2 py-1.5 font-black text-emerald-700">{row.priority > 0 ? row.priority : '-'}</td>
                  <td className="px-2 py-1.5 font-black text-zinc-950">{row.code || '-'}</td>
                  <td className="px-2 py-1.5 font-semibold text-zinc-700">{row.productCode || '-'}</td>
                  <td className="px-2 py-1.5 font-mono font-bold text-zinc-700">{row.quantity}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800 md:inline md:whitespace-normal">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-semibold text-zinc-700">{resolveProductionOrderMachine(row, machines)}</td>
                  <td className="px-2 py-1.5 font-semibold text-zinc-600">{row.orderRef}</td>
                  <td
                    className="max-w-[180px] truncate px-2 py-1.5 text-zinc-600"
                    title={row.note && row.note !== '-' ? row.note : undefined}
                  >
                    {row.note && row.note !== '-' ? row.note : '-'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <RowActionsMenu label={`Thao tác ${row.code || row.name}`}>
                      <button type="button" title="Xem" onClick={() => setViewingProductionOrder(row)}>
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit ? (
                        <button type="button" title="Sửa" onClick={() => setEditingProductionOrder(row)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          title="Xóa"
                          onClick={() => handleDeleteProductionOrder(row)}
                          disabled={deletingProductionOrderId === row.id}
                        >
                          {deletingProductionOrderId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                      <button type="button" title="In" onClick={() => printProductionOrder(row)} disabled={isLoadingPrint}>
                        <Printer className="h-4 w-4" />
                      </button>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
              {!isLoading && recentProductionOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center font-bold text-zinc-400">
                    Chưa có lệnh SX. Tạo lệnh từ trang Đơn hàng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </DashboardWindow>
      </div>

      <AddProductionOrderModal
        open={showAddProductionOrder}
        onClose={() => setShowAddProductionOrder(false)}
        onCreated={loadBoard}
      />

      <ProductionOrderViewModal
        row={viewingProductionOrder}
        onClose={() => setViewingProductionOrder(null)}
      />

      <EditProductionOrderModal
        open={Boolean(editingProductionOrder)}
        row={editingProductionOrder}
        orders={orders}
        productionOrders={productionOrders}
        catalogProducts={products}
        machines={machines}
        onClose={() => setEditingProductionOrder(null)}
        onSaved={loadBoard}
      />

      <ProductionPlanModal
        open={showProductionPlan}
        onClose={() => setShowProductionPlan(false)}
        onSaved={loadBoard}
        onOpenWarehouseSlip={() => onNavigate('warehouse-slip')}
        productionOrders={productionOrders}
        seedOrderIds={selectedProductionOrderIds}
        machines={machines}
      />

      {printingOrder && (
        <ProductionOrderPrintSheet
          order={printingOrder}
          materials={printingMaterials}
          machineLabel={printingMachineLabel}
          product={printingProduct}
          productCatalog={printingProductCatalog}
          shiftSettings={shiftSettings}
        />
      )}

      {printingBatchOrders.length > 0 && (
        <ProductionOrderBatchPrintSheets
          items={printingBatchOrders}
          shiftSettings={productionOrderSettings}
          productCatalog={printingBatchProductCatalog}
        />
      )}
      </>
      )}
    </div>
  );
}

