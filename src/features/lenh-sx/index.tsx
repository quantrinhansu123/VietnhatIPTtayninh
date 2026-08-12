import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { formatNumber, formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import { pickText, fileToDataUrl, uploadImage } from '../_shared/recordHelpers';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { getProductionShiftOptions, shiftNamesMatch } from '../../utils/shiftSettings';
import {
  FilterCombobox,
  MultiSelectFilter,
  TableToolbar,
  TableSearchInput,
  TableDateFilter,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge
} from '../../components/shared/table';
import {
  AddProductionOrderModal,
  EditProductionOrderModal,
  getProductionOrderProductLines,
  loadProductionOrderPrintMaterials,
  loadProductionOrderProductCatalog,
  normalizeProductionOrders,
  PRODUCTION_ORDER_STATUS_OPTIONS,
  ProductionOrderBatchPrintSheets,
  ProductionOrderPrintSheet,
  ProductionOrderViewModal,
  resolveProductionOrderMachineLabel,
  useProductionOrderPrint,
  type PrintableProductionOrder,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { normalizeOrders } from '../don-hang';
import { normalizeProducts } from '../san-pham';
import type { ProductRow } from '../san-pham/types';
import { normalizeMachines, type MachineRow } from '../danh-sach-may';
import type { OrderRow } from '../_shared/orderRecordHelpers';
import { useTabAccess } from '../../app/useTabAccess';
import type { AuthUser } from '../../app/authUser';
import { waitForPrintImagesReady } from '../../utils/printReady';
import {
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Trash2
} from 'lucide-react';

function normalizeStaffMatchKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function isNhanVienRole(role: string) {
  return normalizeStaffMatchKey(role) === normalizeStaffMatchKey('Nhân Viên');
}

/** Tách chuỗi phân công (có thể nhiều tên ngăn bởi , ; / |) rồi khớp đúng tên đăng nhập. */
function productionOrderAssignedToPerson(row: ProductionOrderRow, personName: string) {
  const target = normalizeStaffMatchKey(personName);
  if (!target) return false;

  const fields = [row.staff, row.shiftLead, row.mainStaff, row.assistantStaff, row.traineeStaff];
  for (const field of fields) {
    const raw = String(field || '').trim();
    if (!raw || raw === '-' || /^chưa phân công$/i.test(raw)) continue;
    const tokens = raw
      .split(/[,;/|]+|\s+[-–—]\s+/)
      .map(part => normalizeStaffMatchKey(part))
      .filter(Boolean);
    if (tokens.some(token => token === target || token.includes(target) || target.includes(token))) {
      return true;
    }
  }
  return false;
}

function productionOrderStaffDisplay(row: ProductionOrderRow) {
  if (row.staff && row.staff !== '-') return row.staff;
  return [...new Set(
    [row.shiftLead, row.mainStaff, row.assistantStaff, row.traineeStaff]
      .filter(value => value && value !== '-')
  )].join(', ') || '-';
}

export function ProductionOrdersPanel({
  onBack,
  currentUser,
  canCreate: canCreateOverride,
  canEdit: canEditOverride,
  canDelete: canDeleteOverride
}: {
  onBack: () => void;
  currentUser?: AuthUser | null;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const tabAccess = useTabAccess('production-orders');
  const canCreate = canCreateOverride ?? tabAccess.canCreate;
  const canEdit = canEditOverride ?? tabAccess.canEdit;
  const canDelete = canDeleteOverride ?? tabAccess.canDelete;
  const [rows, setRows] = useState<ProductionOrderRow[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);
  const [selectedOrderCodes, setSelectedOrderCodes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewingRow, setViewingRow] = useState<ProductionOrderRow | null>(null);
  const [editingRow, setEditingRow] = useState<ProductionOrderRow | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionMenu, setActionMenu] = useState<{
    row: ProductionOrderRow;
    x: number;
    y: number;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printingBatchOrders, setPrintingBatchOrders] = useState<PrintableProductionOrder[]>([]);
  const [printingBatchProductCatalog, setPrintingBatchProductCatalog] = useState<ProductRow[]>([]);
  const [pendingBatchPrint, setPendingBatchPrint] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const { printingOrder, printingMaterials, printingProduct, printingProductCatalog, printingMachineLabel, shiftSettings, isLoadingPrint, printProductionOrder } = useProductionOrderPrint();

  const loadProductionOrders = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const [res, orderRes] = await Promise.all([
        fetch('/api/lenh-sx'),
        fetch('/api/don-hang')
      ]);
      const [data, orderData] = await Promise.all([
        res.json().catch(() => ({})),
        orderRes.json().catch(() => ({}))
      ]);

      if (!res.ok) {
        throw new Error(data.error || 'Không thể tải lệnh sản xuất từ Supabase.');
      }

      const orderRows = orderRes.ok ? normalizeOrders(orderData) : [];
      const customerByOrderCode = new Map(
        orderRows
          .filter(order => order.orderCode && order.orderCode !== '-')
          .map(order => [order.orderCode.trim().toLowerCase(), order.customer] as const)
      );
      const productionRows = normalizeProductionOrders(data).map(row => {
        if (row.customer && row.customer !== '-') return row;
        const customers = String(row.orderRef || '')
          .split(/[,;|]+/)
          .map(code => customerByOrderCode.get(code.trim().toLowerCase()))
          .filter((customer): customer is string => Boolean(customer && customer !== '-'));
        return { ...row, customer: [...new Set(customers)].join(', ') || '-' };
      });
      setOrders(orderRows);
      setRows(productionRows);
    } catch (error: any) {
      setRows([]);
      setLoadError(error.message || 'Không thể tải lệnh sản xuất từ Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionOrders();
  }, []);

  const openEditModal = async (row: ProductionOrderRow) => {
    if (!canEdit) return;
    setIsLoadingEdit(true);
    setActionMessage('');
    try {
      const [orderRes, productRes, machineRes] = await Promise.all([
        fetch('/api/don-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-may')
      ]);
      const [orderData, productData, machineData] = await Promise.all([
        orderRes.json().catch(() => ({})),
        productRes.json().catch(() => ({})),
        machineRes.json().catch(() => ({}))
      ]);
      if (!orderRes.ok || !productRes.ok || !machineRes.ok) {
        throw new Error('Không thể tải dữ liệu để sửa lệnh sản xuất.');
      }
      setOrders(normalizeOrders(orderData));
      setCatalogProducts(normalizeProducts(productData));
      setMachines(normalizeMachines(machineData));
      setEditingRow(row);
    } catch (error: any) {
      setActionMessage(error.message || 'Không thể mở form sửa lệnh sản xuất.');
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const deleteProductionOrder = async (row: ProductionOrderRow) => {
    if (!window.confirm(`Bạn có chắc muốn xóa lệnh sản xuất ${row.code || row.name}?`)) return;

    setDeletingId(row.id);
    setActionMessage('');
    try {
      const res = await fetch(`/api/lenh-sx/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể xóa lệnh sản xuất.');
      await loadProductionOrders();
      setActionMessage(data.warning || 'Đã xóa lệnh sản xuất.');
    } catch (error: any) {
      setActionMessage(error.message || 'Không thể xóa lệnh sản xuất.');
    } finally {
      setDeletingId(null);
    }
  };

  const machineFilters = useMemo(() => {
    const machines = rows
      .map(row => row.machine)
      .filter((machine): machine is string => Boolean(machine) && machine !== '-');
    return [...new Set(machines)].sort((a, b) => String(a).localeCompare(String(b), 'vi'));
  }, [rows]);

  const shiftFilters = useMemo(() => {
    const fromRows = rows
      .map(row => row.shift)
      .filter((shift): shift is string => Boolean(shift) && shift !== '-');
    const fromSettings = getProductionShiftOptions(shiftSettings).map(option => option.value);
    return [...new Set([...fromSettings, ...fromRows])].sort((a, b) =>
      String(a).localeCompare(String(b), 'vi', { numeric: true })
    );
  }, [rows, shiftSettings]);

  const orderCodeFilters = useMemo(() => {
    const codes = rows
      .map(row => row.code)
      .filter((code): code is string => Boolean(code) && code !== '-');
    return [...new Set(codes)].sort((a, b) => String(a).localeCompare(String(b), 'vi', { numeric: true }));
  }, [rows]);

  // Định dạng dd/mm/yyyy hiển thị trên bảng -> mốc thời gian để so sánh khoảng ngày.
  const parseDisplayDate = (value: string): number | null => {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const time = new Date(Number(year), Number(month) - 1, Number(day)).getTime();
    return Number.isFinite(time) ? time : null;
  };

  const parseDateInput = (value: string): number | null => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    const time = new Date(Number(year), Number(month) - 1, Number(day)).getTime();
    return Number.isFinite(time) ? time : null;
  };

  const hasActiveFilters =
    selectedStatus !== 'all' ||
    selectedMachines.length > 0 ||
    selectedShifts.length > 0 ||
    selectedOrderCodes.length > 0 ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(searchText);

  const resetFilters = () => {
    setSelectedStatus('all');
    setSelectedMachines([]);
    setSelectedShifts([]);
    setSelectedOrderCodes([]);
    setDateFrom('');
    setDateTo('');
    setSearchText('');
  };

  const restrictToOwnAssignments =
    Boolean(currentUser) &&
    !currentUser?.fullAccess &&
    isNhanVienRole(currentUser?.role || '');

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    const fromTime = dateFrom ? parseDateInput(dateFrom) : null;
    const toTime = dateTo ? parseDateInput(dateTo) : null;
    const personName = currentUser?.name || '';

    return rows
      .filter(row => {
        if (restrictToOwnAssignments && !productionOrderAssignedToPerson(row, personName)) {
          return false;
        }
        const matchesStatus = selectedStatus === 'all' || row.status === selectedStatus;
        const matchesMachine = selectedMachines.length === 0 || selectedMachines.includes(row.machine);
        const matchesShift =
          selectedShifts.length === 0 ||
          selectedShifts.some(shift => shiftNamesMatch(shift, row.shift) || shift === row.shift);
        const matchesOrderCode =
          selectedOrderCodes.length === 0 || selectedOrderCodes.includes(row.code);
        const rowStartTime = parseDisplayDate(row.startDate);
        const matchesFrom = !fromTime || (rowStartTime !== null && rowStartTime >= fromTime);
        const matchesTo = !toTime || (rowStartTime !== null && rowStartTime <= toTime);
        const matchesSearch =
          !normalizedSearch ||
          `${row.code} ${row.name} ${row.productCode} ${row.productName} ${formatProductionOrderProductsSummary(row)} ${row.customer} ${row.orderRef} ${row.machine} ${row.status} ${row.note} ${row.staff} ${row.shiftLead} ${row.mainStaff} ${row.assistantStaff} ${row.traineeStaff}`
            .toLowerCase()
            .includes(normalizedSearch);
        return (
          matchesStatus &&
          matchesMachine &&
          matchesShift &&
          matchesOrderCode &&
          matchesFrom &&
          matchesTo &&
          matchesSearch
        );
      })
      // Bản ghi tạo mới nhất đứng trước; dữ liệu không có created_at được đặt sau cùng.
      .sort((left, right) => {
        const leftTime = Date.parse(left.createdAt);
        const rightTime = Date.parse(right.createdAt);
        const leftValid = Number.isFinite(leftTime);
        const rightValid = Number.isFinite(rightTime);
        if (leftValid && rightValid) {
          return sortOrder === 'newest' ? rightTime - leftTime : leftTime - rightTime;
        }
        if (leftValid) return -1;
        if (rightValid) return 1;
        return left.id.localeCompare(right.id, 'vi');
      });
  }, [
    currentUser?.name,
    normalizedSearch,
    restrictToOwnAssignments,
    rows,
    selectedStatus,
    selectedMachines,
    selectedShifts,
    selectedOrderCodes,
    dateFrom,
    dateTo,
    sortOrder
  ]);

  const activeCount = filteredRows.filter(row => /đang|cho|chờ|active|sx/i.test(row.status)).length;
  const totalQuantity = filteredRows.reduce((sum, row) => {
    const value = Number(row.quantity);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

  const dateGroups = useMemo(() => {
    const map = new Map<string, ProductionOrderRow[]>();
    filteredRows.forEach(row => {
      const date = row.startDate && row.startDate !== '-' ? row.startDate : 'Chưa có ngày bắt đầu';
      const list = map.get(date) ?? [];
      list.push(row);
      map.set(date, list);
    });
    return [...map.entries()].map(([date, groupRows]) => ({
      date,
      rows: groupRows,
      totalQuantity: groupRows.reduce((sum, row) => {
        const value = Number(row.quantity);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0)
    }));
  }, [filteredRows]);

  const visibleIds = useMemo(() => filteredRows.map(row => row.id), [filteredRows]);
  const selectedVisibleIds = useMemo(
    () => visibleIds.filter(id => selectedIds.includes(id)),
    [visibleIds, selectedIds]
  );
  const hasSelectedVisible = selectedVisibleIds.length > 0;

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => rows.some(row => row.id === id)));
  }, [rows]);

  const toggleRowSelected = (orderId: string) => {
    setSelectedIds(prev => (prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]));
  };

  const handlePrintSelected = async () => {
    const rowsToPrint = filteredRows.filter(row => selectedIds.includes(row.id));
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
          return { order, materials, machineLabel, product };
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
    <div className="mx-auto w-full max-w-none space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="bg-white p-3 text-slate-700 border-b border-slate-200">
          <div className="flex items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Kế hoạch & điều phối</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Lệnh sản xuất</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase lenh_sx.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={!hasSelectedVisible || isBatchPrinting}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                title={hasSelectedVisible ? `In ${selectedVisibleIds.length} lệnh đã chọn` : 'Chọn lệnh bằng tickbox để in'}
              >
                {isBatchPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                In lệnh{selectedVisibleIds.length > 0 ? ` (${selectedVisibleIds.length})` : ''}
              </button>
              {canCreate ? (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm mới
                </button>
              ) : null}

            </div>
          </div>

          {restrictToOwnAssignments ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              Tài khoản chức vụ Nhân Viên: chỉ hiện lệnh SX có phân công cho{' '}
              <span className="font-black">{currentUser?.name || 'bạn'}</span>.
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
            {[
              ['Lệnh SX', restrictToOwnAssignments ? filteredRows.length : rows.length],
              ['Đang / chờ SX', activeCount],
              ['Tổng SL', formatNumber(totalQuantity)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <span className="block font-bold text-zinc-500">{label}</span>
                <span className="mt-1 block text-xl font-black text-zinc-950">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={loadError}
        actionMessage={actionMessage}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm mã lệnh, hàng, khách, đơn hàng..."
          disabled={isLoading}
        />

        <TableDateFilter label="Từ ngày" value={dateFrom} onChange={setDateFrom} />
        <TableDateFilter label="Đến ngày" value={dateTo} onChange={setDateTo} />

        <MultiSelectFilter
          label="Ca"
          allLabel="Tất cả ca"
          searchPlaceholder="Tìm ca..."
          emptyLabel="Không tìm thấy ca"
          options={shiftFilters}
          values={selectedShifts}
          onChange={setSelectedShifts}
        />

        <MultiSelectFilter
          label="Lệnh SX"
          allLabel="Tất cả lệnh SX"
          searchPlaceholder="Tìm mã lệnh SX..."
          emptyLabel="Không tìm thấy lệnh SX"
          options={orderCodeFilters}
          values={selectedOrderCodes}
          onChange={setSelectedOrderCodes}
        />

        <FilterCombobox
          label="Trạng thái"
          options={PRODUCTION_ORDER_STATUS_OPTIONS}
          value={selectedStatus}
          onChange={setSelectedStatus}
          searchPlaceholder="Tìm trạng thái..."
          compact
        />

        <MultiSelectFilter
          label="Máy"
          allLabel="Tất cả máy"
          searchPlaceholder="Tìm máy..."
          emptyLabel="Không tìm thấy máy"
          options={machineFilters}
          values={selectedMachines}
          onChange={setSelectedMachines}
        />

        <FilterCombobox
          label="Sắp xếp"
          options={['newest', 'oldest']}
          value={sortOrder}
          onChange={value => setSortOrder(value as 'newest' | 'oldest')}
          searchPlaceholder="Tìm kiểu sắp xếp..."
          includeAll={false}
          compact
          searchable={false}
          alignDropdown="right"
          dropdownWidth="w-full"
          formatOption={value => (value === 'newest' ? 'Mới nhất' : 'Cũ nhất')}
        />
      </TableToolbar>

      <AddProductionOrderModal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onCreated={loadProductionOrders}
      />

      <ProductionOrderViewModal row={viewingRow} onClose={() => setViewingRow(null)} />

      <EditProductionOrderModal
        open={Boolean(editingRow)}
        row={editingRow}
        orders={orders}
        productionOrders={rows}
        catalogProducts={catalogProducts}
        machines={machines}
        onClose={() => setEditingRow(null)}
        onSaved={loadProductionOrders}
      />

      {!isLoading && dateGroups.length === 0 ? (
        <TableShell minWidthClassName="min-w-0">
          <TableBody>
            <TableEmptyRow colSpan={12}>
              Bảng lenh_sx chưa có dữ liệu hoặc không có lệnh phù hợp bộ lọc.
            </TableEmptyRow>
          </TableBody>
        </TableShell>
      ) : (
        <div className="space-y-3">
          {dateGroups.map(group => {
            const groupIds = group.rows.map(row => row.id);
            const selectedInGroup = groupIds.filter(id => selectedIds.includes(id));
            const allGroupSelected = groupIds.length > 0 && selectedInGroup.length === groupIds.length;
            return (
            <div key={group.date} className="overflow-hidden rounded-2xl border-2 border-zinc-900/10 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 sm:px-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Ngày</span>
                  <span className="font-mono text-sm font-black text-zinc-900">{group.date}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-500 ring-1 ring-zinc-200">
                    {group.rows.length} lệnh
                  </span>
                  {selectedInGroup.length > 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                      Đã chọn {selectedInGroup.length}
                    </span>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Tổng SL ngày</p>
                  <p className="font-mono text-sm font-black text-emerald-800">{formatNumber(group.totalQuantity)}</p>
                </div>
              </div>
              <div className="hover-scrollbar overflow-x-auto">
                <table className="w-full min-w-[1780px] table-fixed border-collapse text-left text-[11px]">
                  <colgroup>
                    <col style={{ width: 44 }} /><col style={{ width: 110 }} /><col style={{ width: 70 }} /><col style={{ width: 460 }} />
                    <col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} />
                    <col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 220 }} />
                    <col style={{ width: 160 }} /><col style={{ width: 80 }} />
                  </colgroup>
                  <TableHead>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-center text-[10px]">
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        onChange={() => {
                          setSelectedIds(prev => {
                            if (allGroupSelected) return prev.filter(id => !groupIds.includes(id));
                            return [...new Set([...prev, ...groupIds])];
                          });
                        }}
                        aria-label={`Chọn tất cả lệnh ngày ${group.date}`}
                        className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                      />
                    </TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Mã lệnh</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Ca</TableHeadCell>
                    <TableHeadCell className="min-w-[320px] px-2 py-2 text-[10px]">
                      <div className="grid grid-cols-[120px_minmax(0,1fr)_86px] gap-0">
                        <span>Mã hàng</span>
                        <span>Tên hàng</span>
                        <span className="text-right">Số lượng</span>
                      </div>
                    </TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Trạng thái</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Khách hàng</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Đơn hàng</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Bắt đầu</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Kết thúc</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Nhân sự phụ trách</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Máy</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]" align="center">Thao tác</TableHeadCell>
                  </TableHead>
                  <TableBody>
                    {group.rows.map(row => {
                      const productLines = getProductionOrderProductLines(row);
                      return (
                      <React.Fragment key={row.id}>
                      <TableRow>
                        <td className="px-2 py-2 text-center align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleRowSelected(row.id)}
                            aria-label={`Chọn ${row.code || row.name || 'lệnh sản xuất'}`}
                            className="h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top font-black text-zinc-950">{row.code || '-'}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-700">{row.shift || '-'}</td>
                        <td className="px-2 py-2 align-top">
                          {productLines.length > 0 ? (
                            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                              <table className="w-full table-fixed border-collapse text-left text-[10px]">
                                <colgroup>
                                  <col style={{ width: 120 }} />
                                  <col />
                                  <col style={{ width: 86 }} />
                                </colgroup>
                                <tbody className="divide-y divide-zinc-100">
                                  {productLines.map((product, index) => (
                                    <tr key={`${row.id}-${product.productCode}-${index}`}>
                                      <td className="whitespace-nowrap px-2 py-1.5 align-top font-black text-zinc-950">
                                        {product.productCode || '-'}
                                      </td>
                                      <td className="break-words px-2 py-1.5 align-top font-semibold leading-4 text-zinc-700">
                                        {product.productName || '-'}
                                      </td>
                                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right align-top font-mono font-bold text-zinc-900">
                                        {product.quantity || '-'}
                                        {product.unit && product.unit !== '-' ? (
                                          <span className="ml-1 font-sans text-[10px] font-semibold text-zinc-500">
                                            {product.unit}
                                          </span>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top">
                          <StatusBadge label={row.status} color="amber" />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-700">{row.customer}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-600">{row.orderRef}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-600">{row.startDate}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-600">{row.endDate}</td>
                        <td className="break-words px-2 py-2 align-top font-semibold leading-4 text-zinc-700">
                          {productionOrderStaffDisplay(row)}
                        </td>
                        <td className="break-words px-2 py-2 align-top leading-4 text-zinc-600">{row.machine}</td>
                        <td className="px-2 py-2 align-top text-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setActionMenu(current => current?.row.id === row.id
                                ? null
                                : { row, x: rect.right, y: rect.bottom });
                            }}
                            title="Thao tác"
                            aria-label={`Thao tác cho ${row.code || 'lệnh sản xuất'}`}
                            aria-expanded={actionMenu?.row.id === row.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </TableRow>
                      </React.Fragment>
                      );
                    })}
                  </TableBody>
                </table>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {actionMenu && createPortal(
        <div
          className="fixed z-50 w-44 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl"
          style={{ left: Math.max(8, actionMenu.x - 176), top: actionMenu.y + 6 }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => { setViewingRow(actionMenu.row); setActionMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">
            <Eye className="h-4 w-4" /> Xem chi tiết
          </button>
          <button type="button" role="menuitem" onClick={() => { printProductionOrder(actionMenu.row); setActionMenu(null); }} disabled={isLoadingPrint} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-4 w-4" /> In lệnh SX
          </button>
          {canEdit && <button type="button" role="menuitem" onClick={() => { openEditModal(actionMenu.row); setActionMenu(null); }} disabled={isLoadingEdit} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Pencil className="h-4 w-4" /> Sửa lệnh SX
          </button>}
          {canDelete && <button type="button" role="menuitem" onClick={() => { deleteProductionOrder(actionMenu.row); setActionMenu(null); }} disabled={deletingId === actionMenu.row.id} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Xóa lệnh SX
          </button>}
        </div>,
        document.body
      )}

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
          shiftSettings={shiftSettings}
          productCatalog={printingBatchProductCatalog}
        />
      )}
    </div>
  );
}
