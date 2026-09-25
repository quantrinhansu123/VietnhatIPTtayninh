import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { formatMoney, formatPercent, parseMoneyInput, parsePercentInput, sanitizeMoneyInput } from '../../utils';
import { parseDateToIso } from '../../utils/dateFormat';
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
  StatusBadge,
  RowActionsMenu
} from '../../components/shared/table';
import {
  AddProductionOrderModal,
  EditProductionOrderModal,
  formatProductionOrderProductsSummary,
  loadProductionOrderPrintMaterials,
  loadProductionOrderProductCatalog,
  normalizeProductionOrders,
  PRODUCTION_ORDER_STATUS_OPTIONS,
  ProductionOrderBatchPrintSheets,
  ProductionOrderPrintSheet,
  ProductionOrderDetailBody,
  ProductionOrderViewModal,
  getProductionOrderProductLines,
  parseProductionOrderQuantity,
  resolveProductionOrderMachineLabel,
  useProductionOrderPrint,
  type PrintableProductionOrder,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { normalizeOrders } from '../don-hang';
import { OrderFormModal } from '../don-hang/OrderFormModal';
import { normalizeProducts } from '../san-pham';
import { normalizeProductCodeKey, type ProductRow } from '../san-pham/types';
import { normalizeMachines, type MachineRow } from '../danh-sach-may';
import type { OrderRow } from '../_shared/orderRecordHelpers';
import ProductQrPrintModal, { type ProductQrPrintLabel } from '../../components/ProductQrPrintModal';
import { useTabAccess } from '../../app/useTabAccess';
import type { AuthUser } from '../../app/authUser';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../../utils/printReady';
import {
  Loader2,
  Pencil,
  Plus,
  Printer,
  QrCode,
  X,
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

function productionOrderStaffNames(row: ProductionOrderRow) {
  const staff = productionOrderStaffDisplay(row);
  if (staff === '-') return [];

  return [...new Set(
    staff
      .split(/[,;|/\n]+/)
      .map(name => name.trim())
      .filter(Boolean)
  )];
}

/** Tải danh sách lệnh SX + bù cột Khách hàng từ đơn hàng (dùng chung cho panel & trang chi tiết). */
export async function fetchProductionOrderRows(): Promise<{ rows: ProductionOrderRow[]; orders: OrderRow[] }> {
  const [res, orderRes] = await Promise.all([fetch('/api/lenh-sx'), fetch('/api/don-hang')]);
  const [data, orderData] = await Promise.all([
    res.json().catch(() => ({})),
    orderRes.json().catch(() => ({}))
  ]);
  if (!res.ok) {
    throw new Error((data as any)?.error || 'Không thể tải lệnh sản xuất từ Supabase.');
  }
  const orderRows = orderRes.ok ? normalizeOrders(orderData) : [];
  const customerByOrderCode = new Map(
    orderRows
      .filter(order => order.orderCode && order.orderCode !== '-')
      .map(order => [order.orderCode.trim().toLowerCase(), order.customer] as const)
  );
  const rows = normalizeProductionOrders(data).map(row => {
    if (row.customer && row.customer !== '-') return row;
    const customers = String(row.orderRef || '')
      .split(/[,;|]+/)
      .map(code => customerByOrderCode.get(code.trim().toLowerCase()))
      .filter((customer): customer is string => Boolean(customer && customer !== '-'));
    return { ...row, customer: [...new Set(customers)].join(', ') || '-' };
  });
  return { rows, orders: orderRows };
}

/** Trang chi tiết lệnh SX mở ở tab mới (URL: /lenh-san-xuat/chi-tiet?id=...). */
export function ProductionOrderDetailPage() {
  const orderId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('id') || '';
    } catch {
      return '';
    }
  }, []);
  const tabAccess = useTabAccess('production-orders');
  const canEdit = tabAccess.canEdit;
  const [rows, setRows] = useState<ProductionOrderRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [editingRow, setEditingRow] = useState<ProductionOrderRow | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [isPreparingQr, setIsPreparingQr] = useState(false);
  const [showQrQuantityModal, setShowQrQuantityModal] = useState(false);
  const [qrQuantityLines, setQrQuantityLines] = useState<Array<{ productId: string; code: string; name: string; quantity: string }>>([]);
  const [bulkQrQuantity, setBulkQrQuantity] = useState('1');
  const [qrQuantityError, setQrQuantityError] = useState('');
  const [qrPrintLabels, setQrPrintLabels] = useState<ProductQrPrintLabel[]>([]);
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

  const row = useMemo(() => rows.find(item => item.id === orderId) || null, [rows, orderId]);

  const reload = () => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetchProductionOrderRows()
      .then(({ rows: nextRows, orders: nextOrders }) => {
        if (cancelled) return;
        setRows(nextRows);
        setOrders(nextOrders);
        if (!nextRows.some(item => item.id === orderId)) setError('Không tìm thấy lệnh sản xuất.');
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Không thể tải lệnh sản xuất.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(reload, [orderId]);

  useEffect(() => {
    if (row) document.title = `Chi tiết lệnh SX · ${row.code || row.name}`;
  }, [row]);

  const openEditModal = async () => {
    if (!row || !canEdit) return;
    if (row.daIn) {
      setActionMessage('Lệnh sản xuất đã in, không thể sửa nữa.');
      return;
    }
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
    } catch (err: any) {
      setActionMessage(err?.message || 'Không thể mở form sửa lệnh sản xuất.');
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handlePrintFinishedGoodsQr = async () => {
    if (!row || isPreparingQr) return;
    setIsPreparingQr(true);
    setActionMessage('');
    try {
      const productResponse = await fetch('/api/san-pham?format=table');
      const productData = await productResponse.json().catch(() => ({}));
      if (!productResponse.ok) throw new Error((productData as any)?.error || 'Không thể tải danh mục thành phẩm.');
      const productByCode = new Map(
        normalizeProducts(productData).map(product => [normalizeProductCodeKey(product.code), product])
      );
      const quantityByProductId = new Map<string, number>();
      const productById = new Map<string, ProductRow>();
      for (const line of getProductionOrderProductLines(row)) {
        const quantity = Math.floor(parseProductionOrderQuantity(line.quantity));
        if (quantity <= 0) continue;
        const product = productByCode.get(normalizeProductCodeKey(line.productCode));
        if (!product) throw new Error(`Không tìm thấy thành phẩm ${line.productCode || line.productName} trong Kho hàng.`);
        quantityByProductId.set(product.id, (quantityByProductId.get(product.id) || 0) + quantity);
        productById.set(product.id, product);
      }
      const lines = [...quantityByProductId].map(([productId, quantity]) => ({
        productId,
        code: productById.get(productId)?.code || '',
        name: productById.get(productId)?.name || '',
        quantity: String(quantity)
      }));
      if (lines.length === 0) throw new Error('Lệnh sản xuất không có thành phẩm hợp lệ hoặc số lượng lớn hơn 0.');
      setQrQuantityLines(lines);
      setBulkQrQuantity('1');
      setQrQuantityError('');
      setShowQrQuantityModal(true);
    } catch (reason: unknown) {
      setActionMessage(reason instanceof Error ? reason.message : 'Không thể tải thành phẩm của lệnh.');
    } finally {
      setIsPreparingQr(false);
    }
  };

  const totalQrCopies = qrQuantityLines.reduce((sum, line) => sum + Math.max(0, Math.floor(Number(line.quantity) || 0)), 0);

  const handleConfirmPrintFinishedGoodsQr = async () => {
    setQrQuantityError('');
    if (totalQrCopies > 999) {
      setQrQuantityError('Tổng số tem mỗi lần in không được vượt quá 999.');
      return;
    }
    const items = qrQuantityLines
      .map(line => ({
        sanPhamId: line.productId,
        soLuongTem: Math.max(0, Math.floor(Number(line.quantity.replace(',', '.')) || 0))
      }))
      .filter(item => item.soLuongTem > 0);
    if (items.length === 0) {
      setQrQuantityError('Nhập số lượng (> 0) cho ít nhất một mã SP.');
      return;
    }
    setIsPreparingQr(true);
    try {
      const response = await fetch('/api/ma-qr-hang-hoa/cap-moi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Không thể cấp mã QR mới.');
      const records: Array<Record<string, unknown>> = Array.isArray(data.records) ? data.records : [];
      const labels = records.map(record => ({
        key: String(record.id ?? record.ma_qr ?? ''),
        payload: String(record.ma_qr ?? '').trim(),
        productCode: String(record.ma_sp_goc ?? '').trim(),
        productName: String(record.ten_sp ?? '').trim() || '-'
      })).filter(label => Boolean(label.key && label.payload && label.productCode));
      const expectedCount = items.reduce((sum, item) => sum + item.soLuongTem, 0);
      if (labels.length !== expectedCount) throw new Error('CSDL trả về thiếu mã QR. Chưa thể mở tem để in.');
      setShowQrQuantityModal(false);
      setQrPrintLabels(labels);
    } catch (reason: unknown) {
      setQrQuantityError(reason instanceof Error ? reason.message : 'Không thể tạo mã QR thành phẩm.');
    } finally {
      setIsPreparingQr(false);
    }
  };

  const applyBulkQrQuantity = () => {
    const quantity = String(Math.min(999, Math.max(1, Math.floor(Number(bulkQrQuantity.replace(',', '.')) || 1))));
    setBulkQrQuantity(quantity);
    setQrQuantityLines(lines => lines.map(line => ({ ...line, quantity })));
  };

  return (
    <div className="w-full space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">Chi tiết lệnh SX</h3>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              {row ? row.code || row.name : isLoading ? 'Đang tải…' : '-'}
            </p>
          </div>
          {row ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handlePrintFinishedGoodsQr()}
                disabled={isPreparingQr}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-extrabold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
              >
                {isPreparingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                In mã QR
              </button>
              <button
                type="button"
                onClick={() =>
                  printProductionOrder(row, () =>
                    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, daIn: true } : r)))
                  )
                }
                disabled={isLoadingPrint}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-extrabold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
              >
                {isLoadingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                In lệnh sản xuất
              </button>
              {canEdit && !row.daIn ? (
                <button
                  type="button"
                  onClick={openEditModal}
                  disabled={isLoadingEdit}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-extrabold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  {isLoadingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                  Sửa lệnh sản xuất
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {actionMessage ? (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 sm:px-6">
            {actionMessage}
          </p>
        ) : null}
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm font-bold text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải lệnh sản xuất…
          </div>
        ) : error ? (
          <p className="p-6 text-sm font-bold text-red-600">{error}</p>
        ) : row ? (
          <div className="sm:px-2 sm:py-1">
            <ProductionOrderDetailBody row={row} gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" />
          </div>
        ) : null}
      </div>

      <EditProductionOrderModal
        open={Boolean(editingRow)}
        row={editingRow}
        orders={orders}
        productionOrders={rows}
        catalogProducts={catalogProducts}
        machines={machines}
        onClose={() => setEditingRow(null)}
        onSaved={() => {
          reload();
        }}
      />

      {showQrQuantityModal && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/50 p-4">
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#ef1b2d]">In tem QR</p>
                    <h3 className="mt-1 text-lg font-black text-zinc-950">Số bản theo mã SP</h3>
                    <p className="mt-1 text-sm font-medium text-zinc-500">Nhập số tem cần in cho từng sản phẩm · không lưu vào CSDL</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQrQuantityModal(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                    aria-label="Đóng"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-3 overflow-y-auto px-5 py-4">
                  <div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <label className="min-w-[120px] flex-1 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Áp dụng tất cả
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={bulkQrQuantity}
                        onChange={event => setBulkQrQuantity(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyBulkQrQuantity}
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-black text-zinc-700 transition hover:border-zinc-950"
                    >
                      Áp dụng
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <div className="grid grid-cols-[1fr_7rem] bg-[#ef1b2d] px-4 py-3 text-xs font-black uppercase tracking-wide text-white">
                      <span>Mã SP</span><span className="text-center">Số bản</span>
                    </div>
                    {qrQuantityLines.map(line => (
                      <div key={line.productId} className="grid grid-cols-[1fr_7rem] items-center gap-3 border-t border-zinc-100 px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-black text-zinc-900">{line.code}</p>
                          <p className="line-clamp-1 text-xs font-semibold text-zinc-500">{line.name || '—'}</p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={line.quantity}
                          onChange={event => setQrQuantityLines(lines => lines.map(item => item.productId === line.productId ? { ...item, quantity: event.target.value } : item))}
                          className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm font-black text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                        />
                      </div>
                    ))}
                  </div>
                  {qrQuantityError ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{qrQuantityError}</p> : null}
                  <p className="text-xs font-semibold text-zinc-500">Tổng sẽ in: <span className="font-black text-[#ef1b2d]">{totalQrCopies}</span> tem</p>
                </div>
                <div className="flex gap-2 border-t border-zinc-100 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setShowQrQuantityModal(false)}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmPrintFinishedGoodsQr()}
                    disabled={totalQrCopies <= 0 || isPreparingQr}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] text-xs font-bold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPreparingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    {isPreparingQr ? 'Đang cấp QR...' : `Xem trước ${totalQrCopies > 0 ? `${totalQrCopies} tem` : 'QR'}`}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

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
      <ProductQrPrintModal
        open={qrPrintLabels.length > 0}
        labels={qrPrintLabels}
        trackProductPrint={false}
        trackGoodsCatalogPrint
        showPayload={false}
        title="Mã QR thành phẩm"
        description={`${qrPrintLabels.length} tem theo số lượng thành phẩm của lệnh sản xuất`}
        onClose={() => setQrPrintLabels([])}
      />
    </div>
  );
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewingRow, setViewingRow] = useState<ProductionOrderRow | null>(null);
  const [editingRow, setEditingRow] = useState<ProductionOrderRow | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [seedOrderForAdd, setSeedOrderForAdd] = useState<OrderRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductRow[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printingBatchOrders, setPrintingBatchOrders] = useState<PrintableProductionOrder[]>([]);
  const [printingBatchProductCatalog, setPrintingBatchProductCatalog] = useState<ProductRow[]>([]);
  const [pendingBatchPrint, setPendingBatchPrint] = useState(false);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);
  const { printingOrder, printingMaterials, printingProduct, printingProductCatalog, printingMachineLabel, shiftSettings, isLoadingPrint, printProductionOrder } = useProductionOrderPrint();

  const openOrderDetail = (row: ProductionOrderRow) => {
    // Điện thoại: mở popup như cũ. Máy tính: mở trang chi tiết ở tab mới.
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      setViewingRow(row);
      return;
    }
    window.open(`/lenh-san-xuat/chi-tiet?id=${encodeURIComponent(row.id)}`, '_blank', 'noopener');
  };

  const loadProductionOrders = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const result = await fetchProductionOrderRows();
      const { rows: productionRows, orders: orderRows } = result;
      setOrders(orderRows);
      setRows(productionRows);
      return result;
    } catch (error: any) {
      setRows([]);
      setLoadError(error.message || 'Không thể tải lệnh sản xuất từ Supabase.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionOrders();
  }, []);

  const openEditModal = async (row: ProductionOrderRow) => {
    if (!canEdit) return;
    if (row.daIn) {
      setActionMessage('Lệnh sản xuất đã in, không thể sửa nữa.');
      return;
    }
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
      const refreshed = await loadProductionOrders();
      if (refreshed.rows.some(item => item.id === row.id)) {
        throw new Error('Lệnh vẫn còn trong dữ liệu; chưa khôi phục được số lượng đơn hàng. Hãy thử xóa lại.');
      }
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

  const parseDisplayDate = (value: string): number | null => {
    const iso = parseDateToIso(value);
    if (!iso) return null;
    const [year, month, day] = iso.split('-').map(Number);
    const time = new Date(year, month - 1, day).getTime();
    return Number.isFinite(time) ? time : null;
  };

  const parseDateInput = (value: string): number | null => parseDisplayDate(value);

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
      // Nhóm theo cột Ngày lệnh SX (không dùng ngày tạo).
      .sort((left, right) => {
        const leftDate = parseDisplayDate(left.startDate);
        const rightDate = parseDisplayDate(right.startDate);
        if (leftDate !== null && rightDate !== null && leftDate !== rightDate) return rightDate - leftDate;
        const leftTime = Date.parse(left.createdAt);
        const rightTime = Date.parse(right.createdAt);
        const leftValid = Number.isFinite(leftTime);
        const rightValid = Number.isFinite(rightTime);
        if (leftValid && rightValid) return rightTime - leftTime;
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
    dateTo
  ]);

  const activeCount = filteredRows.filter(row => /đang|cho|chờ|active|sx/i.test(row.status)).length;
  const dateGroups = useMemo(() => {
    const map = new Map<string, ProductionOrderRow[]>();
    filteredRows.forEach(row => {
      const date = row.startDate && row.startDate !== '-' ? row.startDate : 'Chưa có ngày';
      const list = map.get(date) ?? [];
      list.push(row);
      map.set(date, list);
    });
    return [...map.entries()].map(([date, groupRows]) => ({
      date,
      rows: groupRows
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

    const unprintedIds = rowsToPrint.filter(row => !row.daIn).map(row => row.id);
    if (unprintedIds.length > 0) {
      if (!window.confirm('In phiếu sẽ khóa việc sửa các lệnh sản xuất này. Bạn có chắc chắn muốn in?')) {
        return;
      }
      setRows(prev => prev.map(r => (unprintedIds.includes(r.id) ? { ...r, daIn: true } : r)));
      fetch('/api/lenh-sx/danh-dau-da-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unprintedIds })
      }).catch(() => {});
    }

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
    enablePortraitPrintPage('production-order-print-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingBatchPrint(false);
          disablePortraitPrintPage('production-order-print-page-portrait');
        }
      });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('production-order-print-active');
      disablePortraitPrintPage('production-order-print-page-portrait');
    };
  }, [pendingBatchPrint, printingBatchOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('production-order-print-active');
      disablePortraitPrintPage('production-order-print-page-portrait');
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
          <div className="flex w-full items-start justify-end gap-3">
            <div className="hidden">
              <p className="text-xs font-black uppercase tracking-wider text-red-300">Kế hoạch & điều phối</p>
              <h2 className="mt-1 text-2xl font-black leading-tight">Lệnh sản xuất</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-zinc-300">
                Dữ liệu được tải trực tiếp từ bảng Supabase lenh_sx.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={handlePrintSelected}
                disabled={!hasSelectedVisible || isBatchPrinting}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                title={hasSelectedVisible ? `In ${selectedVisibleIds.length} lệnh đã chọn` : 'Chọn lệnh bằng tickbox để in'}
              >
                {isBatchPrinting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                In lệnh{selectedVisibleIds.length > 0 ? ` (${selectedVisibleIds.length})` : ''}
              </button>
              {canCreate ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCreateOrderModal(true)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm đơn hàng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSeedOrderForAdd(null);
                      setShowAddForm(true);
                    }}
                    className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm lệnh SX
                  </button>
                </>
              ) : null}

            </div>
          </div>

          {restrictToOwnAssignments ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              Tài khoản chức vụ Nhân Viên: chỉ hiện lệnh SX có phân công cho{' '}
              <span className="font-black">{currentUser?.name || 'bạn'}</span>.
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            {[
              ['Lệnh SX', restrictToOwnAssignments ? filteredRows.length : rows.length],
              ['Đang / chờ SX', activeCount]
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
        <div className="w-full lg:flex-1">
          <TableSearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Tìm mã lệnh, hàng, khách, đơn hàng..."
            disabled={isLoading}
          />
        </div>

        <div className="w-full sm:w-auto">
          <TableDateFilter label="Từ ngày" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="w-full sm:w-auto">
          <TableDateFilter label="Đến ngày" value={dateTo} onChange={setDateTo} />
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:contents">
          <div className="[&>div]:w-full [&>div>button]:w-full sm:[&>div]:w-auto sm:[&>div>button]:w-auto">
            <MultiSelectFilter
              label="Ca"
              allLabel="Tất cả ca"
              searchPlaceholder="Tìm ca..."
              emptyLabel="Không tìm thấy ca"
              options={shiftFilters}
              values={selectedShifts}
              onChange={setSelectedShifts}
              className="w-full sm:w-auto"
              buttonClassName="w-full justify-between sm:w-auto"
              dropdownWidth="w-full sm:w-max sm:min-w-full sm:max-w-[calc(100vw-1rem)]"
            />
          </div>

          <div className="[&>div]:w-full [&>div>button]:w-full sm:[&>div]:w-auto sm:[&>div>button]:w-auto">
            <MultiSelectFilter
              label="Lệnh SX"
              allLabel="Tất cả lệnh SX"
              searchPlaceholder="Tìm mã lệnh SX..."
              emptyLabel="Không tìm thấy lệnh SX"
              options={orderCodeFilters}
              values={selectedOrderCodes}
              onChange={setSelectedOrderCodes}
              className="w-full sm:w-auto"
              buttonClassName="w-full justify-between sm:w-auto"
              dropdownWidth="w-full sm:w-max sm:min-w-full sm:max-w-[calc(100vw-1rem)]"
            />
          </div>

          <div className="[&>div]:w-full [&>div>button]:w-full sm:[&>div]:w-auto sm:[&>div>button]:w-auto">
            <FilterCombobox
              label="Trạng thái"
              options={PRODUCTION_ORDER_STATUS_OPTIONS}
              value={selectedStatus}
              onChange={setSelectedStatus}
              searchPlaceholder="Tìm trạng thái..."
              compact
              className="w-full sm:w-auto"
              buttonClassName="w-full justify-between sm:w-auto"
              dropdownWidth="w-full sm:w-max sm:min-w-full sm:max-w-[calc(100vw-1rem)]"
            />
          </div>

          <div className="[&>div]:w-full [&>div>button]:w-full sm:[&>div]:w-auto sm:[&>div>button]:w-auto">
            <MultiSelectFilter
              label="Máy"
              allLabel="Tất cả máy"
              searchPlaceholder="Tìm máy..."
              emptyLabel="Không tìm thấy máy"
              options={machineFilters}
              values={selectedMachines}
              onChange={setSelectedMachines}
              alignDropdown="right"
              className="w-full sm:w-auto"
              buttonClassName="w-full justify-between sm:w-auto"
              dropdownWidth="w-full sm:w-max sm:min-w-full sm:max-w-[calc(100vw-1rem)]"
            />
          </div>
        </div>

      </TableToolbar>

      <AddProductionOrderModal
        open={showAddForm}
        seedOrder={seedOrderForAdd}
        onClose={() => {
          setShowAddForm(false);
          setSeedOrderForAdd(null);
        }}
        onCreated={loadProductionOrders}
      />

      <OrderFormModal
        open={showCreateOrderModal}
        mode="add"
        existingOrderCodes={orders.map(order => order.orderCode)}
        currentUser={currentUser}
        onClose={() => setShowCreateOrderModal(false)}
        onSaved={createdOrder => {
          setShowCreateOrderModal(false);
          setOrders(prev => [createdOrder, ...prev.filter(item => item.id !== createdOrder.id)]);
          setSeedOrderForAdd(createdOrder);
          setShowAddForm(true);
        }}
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
            <TableEmptyRow colSpan={9}>
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
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2 sm:px-4">
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
              </div>
              <div className="space-y-2 p-2 md:hidden">
                {group.rows.map(row => {
                  const staffNames = productionOrderStaffNames(row);
                  return (
                    <article key={row.id} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleRowSelected(row.id)}
                          aria-label={`Chọn ${row.code || row.name || 'lệnh sản xuất'}`}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => openOrderDetail(row)}
                                className="break-words text-left text-sm font-black text-[#ef1b2d] transition hover:text-[#b30d1c]"
                              >
                                {row.code || '-'}
                              </button>
                              <p className="mt-0.5 text-xs font-semibold text-zinc-500">Ca: {row.shift || '-'}</p>
                            </div>
                            <StatusBadge label={row.status} color="amber" />
                          </div>

                          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                            <div><dt className="font-bold text-zinc-400">Khách hàng</dt><dd className="mt-0.5 break-words font-semibold text-zinc-700">{row.customer || '-'}</dd></div>
                            <div><dt className="font-bold text-zinc-400">Đơn hàng</dt><dd className="mt-0.5 break-words font-semibold text-zinc-700">{row.orderRef || '-'}</dd></div>
                            <div className="col-span-2"><dt className="font-bold text-zinc-400">Nhân sự · Máy</dt><dd className="mt-0.5 break-words font-semibold text-zinc-700">{staffNames.length > 0 ? staffNames.join(', ') : '-'} · {row.machine || '-'}</dd></div>
                          </dl>

                          <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                            <button type="button" onClick={() => printProductionOrder(row, () => setRows(prev => prev.map(r => (r.id === row.id ? { ...r, daIn: true } : r))))} disabled={isLoadingPrint} className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-bold text-zinc-700 disabled:opacity-50"><Printer className="h-3.5 w-3.5" />In</button>
                            {canEdit && !row.daIn && <button type="button" onClick={() => openEditModal(row)} disabled={isLoadingEdit} className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 px-2 text-xs font-bold text-amber-800 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Sửa</button>}
                            {canDelete && <button type="button" onClick={() => deleteProductionOrder(row)} disabled={deletingId === row.id} className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Xóa</button>}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hover-scrollbar hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1134px] table-fixed border-collapse text-left text-[11px]">
                  <colgroup>
                    <col style={{ width: 44 }} /><col style={{ width: 150 }} /><col style={{ width: 70 }} />
                    <col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} />
                    <col style={{ width: 220 }} /><col style={{ width: 160 }} /><col style={{ width: 100 }} />
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
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Trạng thái</TableHeadCell>
                    <TableHeadCell className="min-w-[160px] max-w-[240px] px-2 py-2 text-[10px]">Khách hàng</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Đơn hàng</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Nhân sự phụ trách</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]">Máy</TableHeadCell>
                    <TableHeadCell className="whitespace-nowrap px-2 py-2 text-[10px]" align="center">Thao tác</TableHeadCell>
                  </TableHead>
                  <TableBody>
                    {group.rows.map(row => {
                      const staffNames = productionOrderStaffNames(row);
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
                        <td className="min-w-0 px-2 py-2 align-top font-black">
                          <button
                            type="button"
                            onClick={() => openOrderDetail(row)}
                            className="block min-w-0 max-w-full break-words text-left [overflow-wrap:anywhere] text-[#ef1b2d] transition hover:text-[#b30d1c]"
                          >
                            {row.code || '-'}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-zinc-700">{row.shift || '-'}</td>
                        <td className="whitespace-nowrap px-2 py-2 align-top">
                          <StatusBadge label={row.status} color="amber" />
                        </td>
                        <td className="min-w-[160px] max-w-[240px] break-words px-2 py-2 align-top leading-4 text-zinc-700">{row.customer}</td>
                        <td className="min-w-0 break-words px-2 py-2 align-top text-zinc-600 [overflow-wrap:anywhere]">{row.orderRef}</td>
                        <td className="px-2 py-2 align-top font-semibold text-zinc-700">
                          {staffNames.length > 0 ? (
                            <div className="space-y-1 leading-tight">
                              {staffNames.map(name => (
                                <div key={name} className="whitespace-nowrap">{name}</div>
                              ))}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="break-words px-2 py-2 align-top leading-4 text-zinc-600">{row.machine}</td>
                        <td className="px-2 py-2 align-top text-center">
                          <RowActionsMenu label={`Thao tác cho ${row.code || 'lệnh sản xuất'}`} colorful>
                            <button type="button" title="In lệnh SX" onClick={() => printProductionOrder(row, () => setRows(prev => prev.map(r => (r.id === row.id ? { ...r, daIn: true } : r))))} disabled={isLoadingPrint}>
                              <Printer className="h-4 w-4" />
                            </button>
                            {canEdit && !row.daIn && (
                              <button type="button" title="Sửa lệnh SX" onClick={() => openEditModal(row)} disabled={isLoadingEdit}>
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" title="Xóa lệnh SX" onClick={() => deleteProductionOrder(row)} disabled={deletingId === row.id}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </RowActionsMenu>
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
