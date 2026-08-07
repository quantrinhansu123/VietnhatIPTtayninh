import React, { useState, useEffect, useMemo } from 'react';
import { formatNumber } from '../../utils';
import type { AppTab } from '../../routes';
import { useTabAccess } from '../../app/useTabAccess';
import ControlBoardBbMachineReportTable from '../../components/ControlBoardBbMachineReportTable';
import { ControlBoardCommonFilters } from '../../components/ControlBoardCommonFilters';
import {
  buildControlBoardShiftSummary,
  defaultShiftSummaryDateRange,
  matchesControlBoardDateRange,
  matchesShiftSummaryBucket,
  machineValueMatchesFilter
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
import { normalizeMachines, type MachineRow } from '../danh-sach-may';
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
  MoreHorizontal,
  Pencil,
  Trash2,
  Printer,
  Loader2
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

export function ControlBoardPanel({
  onNavigate,
  onMachineReport,
  onEditWeighing
}: {
  onNavigate: (tab: AppTab) => void;
  onMachineReport: (machine: MachineRow, type: 'mixing' | 'nvl') => void;
  onEditWeighing?: (pending: WeighingPendingAdd) => void;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('control-board');
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
  const [shiftSummaryDateFrom, setShiftSummaryDateFrom] = useState(defaultShiftSummaryRange.from);
  const [shiftSummaryDateTo, setShiftSummaryDateTo] = useState(defaultShiftSummaryRange.to);
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

  const loadBoard = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const summaryFrom = shiftSummaryDateFrom || defaultShiftSummaryRange.from;
      const summaryTo = shiftSummaryDateTo || defaultShiftSummaryRange.to;
      // Tỉ lệ TB thực tế lấy phiếu trộn ca liền trước (12C1 → 12C2 ngày hôm trước) → tải thêm 1 ngày trước.
      const mixingFrom = shiftIsoDateByDays(summaryFrom, -1) || summaryFrom;
      const [orderRes, productRes, machineRes, materialRes, productionRes, settingRes, acceptanceRes, shiftSummaryAcceptanceRes, mixingRes, weighingRes, damagedRes, machineNvlRes, warehouseMovementRes] =
        await Promise.all([
        fetch('/api/don-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-may'),
        fetch('/api/kho-nvl'),
        fetch('/api/lenh-sx'),
        fetch('/api/cai-dat'),
        fetch('/api/bao-cao-nghiem-thu?limit=30'),
        fetch(
          `/api/bao-cao-nghiem-thu?tu_ngay=${encodeURIComponent(summaryFrom)}&den_ngay=${encodeURIComponent(summaryTo)}`
        ),
        fetch(`/api/bao-cao-phoi-tron?tu_ngay=${encodeURIComponent(mixingFrom)}&den_ngay=${encodeURIComponent(summaryTo)}`),
        fetch(`/api/phieu-can-dinh-ki?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`),
        fetch(`/api/bao-cao-hang-hong?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`),
        fetch(
          `/api/bao-cao-may-nvl-ton?limit=300&tu_ngay=${encodeURIComponent(summaryFrom)}&den_ngay=${encodeURIComponent(summaryTo)}`
        ),
        fetch(
          `/api/phieu-xuat-nhap-kho?from=${encodeURIComponent(summaryFrom)}&to=${encodeURIComponent(summaryTo)}`
        )
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

      setOrders(normalizeOrders(orderData));
      setProducts(normalizeProducts(productData));
      setMachines(normalizeMachines(machineData));
      setMaterials(normalizeMaterialsInventory(materialData));
      setProductionOrders(normalizeProductionOrders(productionData));
      setProductionOrderSettings(settingRes.ok ? mapProductionOrderSettings(settingData) : []);
      if (acceptanceRes.ok) {
        setAcceptanceReports(normalizeAcceptanceReports(acceptanceData));
      } else {
        setAcceptanceReports([]);
      }

      if (shiftSummaryAcceptanceRes.ok) {
        setShiftSummaryAcceptanceReports(normalizeAcceptanceReports(shiftSummaryAcceptanceData));
      } else {
        setShiftSummaryAcceptanceReports([]);
      }

      if (mixingRes.ok) {
        const mixingList = Array.isArray(mixingData.reports) ? mixingData.reports : [];
        setMixingReports(mixingList.map((item: Record<string, unknown>) => normalizeMixingReport(item)));
      } else {
        setMixingReports([]);
      }

      if (weighingRes.ok) {
        setWeighingRecords(normalizeWeighingRecords(weighingData));
      } else {
        setWeighingRecords([]);
      }

      if (damagedRes.ok) {
        setDamagedRecords(normalizeWeighingRecords(damagedData));
      } else {
        setDamagedRecords([]);
      }

      if (machineNvlRes.ok) {
        setMachineNvlReports(normalizeMachineNvlReports(machineNvlData));
      } else {
        setMachineNvlReports([]);
      }

      if (warehouseMovementRes.ok) {
        setShiftSummaryWarehouseMovements(normalizeWarehouseMovements(warehouseMovementData));
      } else {
        setShiftSummaryWarehouseMovements([]);
      }

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

  useEffect(() => {
    loadBoard();
  }, [shiftSummaryDateFrom, shiftSummaryDateTo]);

  const shiftSummaryWarehouseMovementRefs = useMemo(
    () => mapWarehouseMovementsForShiftSummary(shiftSummaryWarehouseMovements),
    [shiftSummaryWarehouseMovements]
  );

  const selectedBoardMachine = useMemo(() => {
    if (!boardFilterMachine || boardFilterMachine === 'all') return null;
    return machines.find(machine => machine.code === boardFilterMachine) ?? { code: boardFilterMachine };
  }, [boardFilterMachine, machines]);

  const boardShiftOptions = useMemo(
    () => getProductionShiftOptions(productionOrderSettings),
    [productionOrderSettings]
  );

  const matchesBoardDateRange = (value?: string) =>
    matchesControlBoardDateRange(value, shiftSummaryDateFrom, shiftSummaryDateTo);

  const matchesBoardShift = (value?: string) => {
    if (!boardFilterShift || boardFilterShift === 'all') return true;
    const shift = String(value ?? '').trim();
    if (!shift) return false;
    return shiftNamesMatch(shift, boardFilterShift);
  };

  const matchesBoardMachine = (...candidates: Array<string | undefined | null>) =>
    machineValueMatchesFilter(boardFilterMachine, selectedBoardMachine, ...candidates);

  /** Lệnh SX khớp bộ lọc: chọn đúng mã, hoặc gõ tìm (vd 0086 / LSX) — tìm trên mọi lệnh đã tải. */
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
    return shiftSummaryAcceptanceReports.filter(report =>
      matchesBoardProductionOrderBucket(report.ngay, report.ca, report.ma_may, report.ten_may)
    );
  }, [
    shiftSummaryAcceptanceReports,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders,
    boardShiftOptions,
    machines
  ]);

  const boardScopedWarehouseMovements = useMemo(() => {
    if (!hasBoardProductionOrderFilter) return shiftSummaryWarehouseMovementRefs;
    return shiftSummaryWarehouseMovementRefs.filter(movement =>
      matchesBoardProductionOrderBucket(movement.slipDate, movement.shift)
    );
  }, [
    shiftSummaryWarehouseMovementRefs,
    hasBoardProductionOrderFilter,
    boardMatchedProductionOrders,
    boardShiftOptions
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
        materials: materials.map(material => ({ code: material.code, totalWeight: material.totalWeight })),
        acceptanceReports: boardScopedAcceptanceReports,
        warehouseMovements: boardScopedWarehouseMovements,
        weighingRecords: boardScopedWeighingRecords,
        damagedRecords: boardScopedDamagedRecords,
        machineNvlReports: boardScopedMachineNvlReports,
        dateFrom: shiftSummaryDateFrom,
        dateTo: shiftSummaryDateTo
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
      shiftSummaryDateFrom,
      shiftSummaryDateTo
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

  const clearBoardFilters = () => {
    const defaultRange = defaultShiftSummaryDateRange(14);
    setShiftSummaryDateFrom(defaultRange.from);
    setShiftSummaryDateTo(defaultRange.to);
    setBoardFilterShift('all');
    setBoardFilterMachine('all');
    setBoardFilterProductionOrder('all');
    setBoardFilterProductionOrderQuery('');
    setProductionOrderStaffFilters(new Set());
  };

  const panelProductionOrderOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ code: string; label: string; ngay: string; inRange: boolean }> = [];

    for (const order of productionOrders) {
      const code = String(order.code || '').trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const ngay = parseProductionOrderFilterDate(order.startDate);
      const shiftLabel = formatProductionOrderShiftLabel(order.shift, productionOrderSettings);
      const machineLabel = resolveProductionOrderMachine(order, machines);
      const parts = [code];
      if (ngay) parts.push(ngay);
      else if (order.startDate && order.startDate !== '-') parts.push(String(order.startDate));
      if (shiftLabel && shiftLabel !== '-') parts.push(shiftLabel);
      if (machineLabel && machineLabel !== '-') parts.push(machineLabel);
      options.push({
        code,
        label: parts.join(' · '),
        ngay: ngay || '',
        inRange: matchesBoardDateRange(ngay || order.startDate)
      });
    }

    return options.sort((a, b) => {
      if (a.inRange !== b.inRange) return a.inRange ? -1 : 1;
      const dateCmp = (b.ngay || '').localeCompare(a.ngay || '');
      if (dateCmp !== 0) return dateCmp;
      return a.code.localeCompare(b.code, 'vi', { numeric: true });
    });
  }, [productionOrders, machines, productionOrderSettings, shiftSummaryDateFrom, shiftSummaryDateTo]);

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
    shiftSummaryDateFrom,
    shiftSummaryDateTo,
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
    };
  }, [pendingBatchPrint, printingBatchOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
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

      <div className="order-[-30]">
        <ControlBoardCommonFilters
          dateFrom={shiftSummaryDateFrom}
          dateTo={shiftSummaryDateTo}
          onDateFromChange={setShiftSummaryDateFrom}
          onDateToChange={setShiftSummaryDateTo}
          shift={boardFilterShift}
          onShiftChange={setBoardFilterShift}
          shiftOptions={panelShiftOptions}
          formatShiftLabel={formatPanelShiftLabel}
          machine={boardFilterMachine}
          onMachineChange={setBoardFilterMachine}
          machines={machines}
          productionOrder={boardFilterProductionOrder}
          productionOrderQuery={boardFilterProductionOrderQuery}
          onProductionOrderChange={setBoardFilterProductionOrder}
          onProductionOrderQueryChange={setBoardFilterProductionOrderQuery}
          productionOrderOptions={panelProductionOrderOptions}
          onClear={clearBoardFilters}
          isLoading={isLoading}
        />
      </div>

      <ControlBoardBbMachineReportTable
        productionOrders={boardScopedProductionOrders}
        products={products}
        materials={materials}
        machines={machines}
        warehouseMovements={boardScopedWarehouseMovements}
        damagedRecords={boardScopedDamagedRecords}
        machineNvlReports={boardScopedMachineNvlReports}
        mixingReports={boardScopedMixingReports}
        acceptanceReports={boardScopedAcceptanceReports}
        shiftSettings={productionOrderSettings}
        isLoading={isLoading}
        dateFrom={shiftSummaryDateFrom}
        dateTo={shiftSummaryDateTo}
        shiftFilter={boardFilterShift}
        machineFilter={boardFilterMachine}
        selectedMachine={selectedBoardMachine}
      />

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
            <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-wider text-white">
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
                    <details className="relative inline-block text-left">
                      <summary
                        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                        title="Mở thao tác"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </summary>
                      <div className="absolute right-0 top-9 z-20 min-w-[132px] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
                        <button
                          type="button"
                          onClick={() => setViewingProductionOrder(row)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                        >
                          <Eye className="h-4 w-4" />
                          Xem
                        </button>
                        {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditingProductionOrder(row)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#ef1b2d] transition hover:bg-red-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Sửa
                        </button>
                        ) : null}
                        {canDelete ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteProductionOrder(row)}
                          disabled={deletingProductionOrderId === row.id}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingProductionOrderId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Xóa
                        </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => printProductionOrder(row)}
                          disabled={isLoadingPrint}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Printer className="h-4 w-4" />
                          In
                        </button>
                      </div>
                    </details>
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
        productionOrders={selectedProductionOrdersForPlan}
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
    </div>
  );
}

