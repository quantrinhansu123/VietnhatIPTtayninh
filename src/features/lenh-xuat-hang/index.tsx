import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Pencil, Plus, Printer, Save, Trash2, Truck } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { RepeatableLineRow, RepeatableLinesBlock } from '../../components/RepeatableLinesBlock';
import { ShippingDeliveryPrintSheet } from '../../components/ShippingDeliveryPrintSheet';
import {
  waitForPrintImagesReady,
  enablePortraitPrintPage,
  disablePortraitPrintPage
} from '../../utils/printReady';
import { pickText } from '../_shared/recordHelpers';
import { parseOrderProductsFromRecord } from '../_shared/orderRecordHelpers';
import {
  findOrderProductByCode,
  normalizeOrderProducts,
  orderFieldClass,
  type OrderProductOption
} from '../_shared/orderHelpers';
import { showAppToast, showSaveFailure, readApiErrorMessage } from '../../lib/appToast';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  StatusBadge,
  RowActionsMenu,
  type StatusBadgeColor
} from '../../components/shared/table';

export type ShippingOrderLine = {
  id: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
  don_gia: number;
  tong_tien: number;
  thanh_toan: string;
  ma_khach_hang?: string;
  ten_khach_hang?: string;
  dia_chi_giao?: string;
  so_dien_thoai?: string;
  ghi_chu?: string;
};

type ShippingCustomerGroup = {
  id: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi_giao: string;
  so_dien_thoai: string;
  ghi_chu: string;
  chi_tiet: ShippingOrderLine[];
};

type ShippingOrderFormState = Omit<ShippingOrder, 'id'> & {
  khach: ShippingCustomerGroup[];
};

export type ShippingOrder = {
  id: string;
  ma_lenh: string;
  ngay_xuat: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi_giao: string;
  so_dien_thoai: string;
  bsx: string;
  so_km: number | null;
  thanh_toan: string;
  nhan_vien: string;
  trang_thai: string;
  ghi_chu: string;
  chi_tiet: ShippingOrderLine[];
};

type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  dia_chi: string;
  dia_chi_moi: string;
  so_dien_thoai: string;
};

type SalesOrderPick = {
  id: string;
  code: string;
  date: string;
  customer: string;
  products: { code: string; name: string; unit: string; qty: number }[];
};

type VehicleOption = {
  id: string;
  plate: string;
  label: string;
};

const STATUS_OPTIONS = ['Chờ xuất', 'Đang giao', 'Đã giao', 'Hủy'] as const;
const PAYMENT_OPTIONS = ['Tiền mặt', 'CK'] as const;

const compactFieldClass =
  'h-9 w-full rounded-lg border border-zinc-200 px-2.5 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const lineGridClass =
  'grid-cols-2 md:grid-cols-[minmax(9rem,1.1fr)_minmax(12rem,1.6fr)_5.5rem_6rem_7.5rem_8rem_2.5rem]';

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateVi(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function createLine(partial?: Partial<ShippingOrderLine>): ShippingOrderLine {
  const soLuong = Number.isFinite(partial?.so_luong) ? Number(partial?.so_luong) : 0;
  const donGia = Number.isFinite(partial?.don_gia) ? Number(partial?.don_gia) : 0;
  const tongTien = Number.isFinite(partial?.tong_tien) ? Number(partial?.tong_tien) : soLuong * donGia;
  const line: ShippingOrderLine = {
    id: partial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ma_sp: partial?.ma_sp || '',
    ten_sp: partial?.ten_sp || '',
    don_vi: partial?.don_vi || '',
    so_luong: soLuong,
    don_gia: donGia,
    tong_tien: tongTien,
    thanh_toan: partial?.thanh_toan || '',
    ma_khach_hang: partial?.ma_khach_hang || '',
    ten_khach_hang: partial?.ten_khach_hang || '',
    dia_chi_giao: partial?.dia_chi_giao || '',
    so_dien_thoai: partial?.so_dien_thoai || ''
  };
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'ghi_chu')) {
    line.ghi_chu = String(partial.ghi_chu ?? '');
  }
  return line;
}

function createCustomerGroup(partial?: Partial<ShippingCustomerGroup>): ShippingCustomerGroup {
  const lines = partial?.chi_tiet?.length ? partial.chi_tiet.map(line => createLine(line)) : [createLine()];
  return {
    id: partial?.id || `kh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ma_khach_hang: partial?.ma_khach_hang || '',
    ten_khach_hang: partial?.ten_khach_hang || '',
    dia_chi_giao: partial?.dia_chi_giao || '',
    so_dien_thoai: partial?.so_dien_thoai || '',
    ghi_chu: partial?.ghi_chu || '',
    chi_tiet: lines
  };
}

function parseOrderQty(value: string) {
  const raw = String(value || '').trim().replace(/\s/g, '').replace(',', '.');
  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeSalesOrders(data: unknown): SalesOrderPick[] {
  if (!data || typeof data !== 'object') return [];
  const orders = (data as { orders?: unknown }).orders;
  if (!Array.isArray(orders)) return [];
  return orders.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const code = pickText(record, ['ma_don_hang', 'order_code', 'code'], '');
    const customer = pickText(record, ['khach_hang', 'customer'], '');
    const rawDate =
      pickText(record, ['ngay_don_hang', 'ngay_dat_hang', 'order_date', 'ngay'], '') ||
      (record.created_at == null ? '' : String(record.created_at));
    const iso = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    let date = iso?.[1] || '';
    if (!date && rawDate) {
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
    }
    const products = parseOrderProductsFromRecord(record)
      .map(line => ({
        code: line.productCode.trim(),
        name: line.productName.trim(),
        unit: line.unit === '—' ? '' : line.unit.trim(),
        qty: parseOrderQty(line.quantity)
      }))
      .filter(line => line.code || line.name);
    if (!code && products.length === 0) return [];
    return [{ id: String(record.id ?? '').trim() || code, code: code || '—', date, customer, products }];
  });
}

function groupsFromOrder(order: Pick<ShippingOrder, 'ma_khach_hang' | 'ten_khach_hang' | 'dia_chi_giao' | 'so_dien_thoai' | 'ghi_chu' | 'chi_tiet'>): ShippingCustomerGroup[] {
  const lines = order.chi_tiet.length > 0 ? order.chi_tiet : [createLine()];
  const groups: ShippingCustomerGroup[] = [];
  for (const line of lines) {
    const code = String(line.ma_khach_hang || order.ma_khach_hang || '').trim();
    const name = String(line.ten_khach_hang || order.ten_khach_hang || '').trim();
    const address = String(line.dia_chi_giao || order.dia_chi_giao || '').trim();
    const phone = String(line.so_dien_thoai || order.so_dien_thoai || '').trim();
    const key = `${code}|${name}|${address}|${phone}`;
    let group = groups.find(
      item => `${item.ma_khach_hang}|${item.ten_khach_hang}|${item.dia_chi_giao}|${item.so_dien_thoai}` === key
    );
    if (!group) {
      group = createCustomerGroup({
        ma_khach_hang: code,
        ten_khach_hang: name,
        dia_chi_giao: address,
        so_dien_thoai: phone,
        chi_tiet: []
      });
      group.chi_tiet = [];
      groups.push(group);
    }
    group.chi_tiet.push(createLine(line));
  }
  const anyStoredNote = groups.some(group => group.chi_tiet.some(item => item.ghi_chu != null));
  return groups.map(group => {
    const stored = group.chi_tiet.find(item => item.ghi_chu != null);
    const ghi_chu = anyStoredNote ? String(stored?.ghi_chu || '') : String(order.ghi_chu || '');
    return group.chi_tiet.length > 0 ? { ...group, ghi_chu } : { ...group, ghi_chu, chi_tiet: [createLine()] };
  });
}

function composeHeaderNote(groups: ShippingCustomerGroup[]) {
  const noted = groups
    .map(group => ({
      name: group.ten_khach_hang.trim() || group.ma_khach_hang.trim(),
      note: group.ghi_chu.trim()
    }))
    .filter(item => item.note);
  if (noted.length === 0) return '';
  const unique = [...new Set(noted.map(item => item.note))];
  if (unique.length === 1) return unique[0];
  return noted.map(item => `${item.name || 'Khách'}: ${item.note}`).join('\n');
}

function parseLines(value: unknown): ShippingOrderLine[] {
  if (typeof value === 'string') {
    try {
      return parseLines(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row =>
      createLine({
        id: pickText(row, ['id'], '') || undefined,
        ma_sp: pickText(row, ['ma_sp', 'ma_san_pham', 'code'], ''),
        ten_sp: pickText(row, ['ten_sp', 'ten_san_pham', 'name'], ''),
        don_vi: pickText(row, ['don_vi', 'unit'], ''),
        so_luong: Number(row.so_luong ?? row.quantity ?? 0),
        don_gia: Number(row.don_gia ?? row.unit_price ?? 0),
        tong_tien: Number(row.tong_tien ?? row.total_amount ?? row.thanh_tien ?? 0),
        thanh_toan: pickText(row, ['thanh_toan', 'hinh_thuc_tt', 'payment'], ''),
        ma_khach_hang: pickText(row, ['ma_khach_hang', 'customer_code'], ''),
        ten_khach_hang: pickText(row, ['ten_khach_hang', 'customer_name', 'khach_hang'], ''),
        dia_chi_giao: pickText(row, ['dia_chi_giao', 'dia_chi', 'address'], ''),
        so_dien_thoai: pickText(row, ['so_dien_thoai', 'dien_thoai', 'phone'], ''),
        ...('ghi_chu' in row || 'note' in row ? { ghi_chu: pickText(row, ['ghi_chu', 'note'], '') } : {})
      })
    );
}

export function normalizeShippingOrders(data: unknown): ShippingOrder[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { orders?: unknown; rows?: unknown }).orders
    ?? (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => {
      const chiTiet = parseLines(row.chi_tiet);
      const thanhToan =
        pickText(row, ['thanh_toan', 'hinh_thuc_tt', 'payment'], '') ||
        chiTiet.find(line => line.thanh_toan.trim())?.thanh_toan ||
        '';
      return {
      id: String(row.id ?? '').trim(),
      ma_lenh: pickText(row, ['ma_lenh', 'code'], ''),
      ngay_xuat: pickText(row, ['ngay_xuat', 'ship_date'], todayIso()).slice(0, 10),
      ma_khach_hang: pickText(row, ['ma_khach_hang', 'customer_code'], ''),
      ten_khach_hang: pickText(row, ['ten_khach_hang', 'customer_name', 'khach_hang'], ''),
      dia_chi_giao: pickText(row, ['dia_chi_giao', 'dia_chi', 'address'], ''),
      so_dien_thoai: pickText(row, ['so_dien_thoai', 'dien_thoai', 'phone'], ''),
      bsx: pickText(row, ['bsx', 'bien_so_xe'], '').toUpperCase(),
      so_km: (() => {
        const km = Number(row.so_km ?? row.soKm ?? 0);
        return Number.isFinite(km) && km > 0 ? km : null;
      })(),
      thanh_toan: thanhToan,
      nhan_vien: pickText(row, ['nhan_vien', 'staff'], ''),
      trang_thai: pickText(row, ['trang_thai', 'status'], 'Chờ xuất'),
      ghi_chu: pickText(row, ['ghi_chu', 'note'], ''),
      chi_tiet: chiTiet.map(line =>
        createLine({
          ...line,
          thanh_toan: line.thanh_toan || thanhToan
        })
      )
    };
    })
    .filter(row => row.id || row.ma_lenh);
}

function normalizeVehicles(data: unknown): VehicleOption[] {
  if (!data || typeof data !== 'object') return [];
  const vehicles = (data as { vehicles?: unknown }).vehicles;
  if (!Array.isArray(vehicles)) return [];
  const byPlate = new Map<string, VehicleOption>();
  for (const item of vehicles) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const plate = pickText(record, ['bien_so_xe', 'bsx', 'plateNumber'], '').toUpperCase();
    if (!plate) continue;
    const status = pickText(record, ['trang_thai', 'status'], 'Đang sử dụng');
    // Ưu tiên xe đang sử dụng; vẫn giữ xe khác nếu chưa có biển đó
    if (byPlate.has(plate) && status !== 'Đang sử dụng') continue;
    const kind = pickText(record, ['loai_xe', 'vehicle_type'], '');
    const driver = pickText(record, ['tai_xe_phu_trach', 'tai_xe'], '');
    const parts = [plate, kind, driver].filter(Boolean);
    byPlate.set(plate, {
      id: String(record.id ?? plate),
      plate,
      label: parts.join(' · ')
    });
  }
  return [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate, 'vi'));
}

function normalizeCustomerDetails(data: unknown): CustomerDetail[] {
  if (!data || typeof data !== 'object') return [];
  const customers = (data as { customers?: unknown }).customers;
  if (!Array.isArray(customers)) return [];
  return customers
    .map((item): CustomerDetail | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['ten_khach_hang', 'khach_hang', 'ten', 'name', 'ten_cong_ty'], '');
      const code = pickText(record, ['ma_khach_hang', 'ma_kh', 'code', 'id'], '');
      if (!name && !code) return null;
      return {
        id: code || name,
        name: name || code,
        code,
        dia_chi: pickText(record, ['dia_chi', 'dia_chi_giao', 'address', 'dia_chi_giao_hang'], ''),
        dia_chi_moi: pickText(record, ['dia_chi_moi', 'new_address', 'newAddress'], ''),
        so_dien_thoai: pickText(record, ['so_dien_thoai', 'dien_thoai', 'phone', 'sdt'], '')
      };
    })
    .filter((item): item is CustomerDetail => Boolean(item));
}

function generateNextShippingCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^LXH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `LXH${String(next).padStart(width, '0')}`;
}

function emptyForm(code = '', staffName = ''): ShippingOrderFormState {
  const khach = [createCustomerGroup()];
  return {
    ma_lenh: code,
    ngay_xuat: todayIso(),
    ma_khach_hang: '',
    ten_khach_hang: '',
    dia_chi_giao: '',
    so_dien_thoai: '',
    bsx: '',
    so_km: null,
    thanh_toan: '',
    nhan_vien: staffName,
    trang_thai: 'Chờ xuất',
    ghi_chu: '',
    chi_tiet: khach[0].chi_tiet,
    khach
  };
}

function statusBadgeColor(status: string): StatusBadgeColor {
  if (status === 'Đã giao') return 'emerald';
  if (status === 'Đang giao') return 'sky';
  if (status === 'Hủy') return 'rose';
  return 'amber';
}

export function ShippingOrdersPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('shipping-orders');
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerDetail[]>([]);
  const [products, setProducts] = useState<OrderProductOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillDate, setFillDate] = useState(todayIso());
  const [fillOrders, setFillOrders] = useState<SalesOrderPick[]>([]);
  const [fillLoading, setFillLoading] = useState(false);
  const [fillSelected, setFillSelected] = useState<string[]>([]);
  const [fillError, setFillError] = useState('');
  const [form, setForm] = useState<ShippingOrderFormState>(emptyForm('', currentUser?.name || ''));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewOrders, setPreviewOrders] = useState<ShippingOrder[]>([]);
  const [printGeneralNote, setPrintGeneralNote] = useState('');
  const [printTotalKm, setPrintTotalKm] = useState('');
  const [printingOrders, setPrintingOrders] = useState<ShippingOrder[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);
  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [orderRes, customerRes, productRes, vehicleRes] = await Promise.all([
        fetch('/api/lenh-xuat-hang'),
        fetch('/api/khach-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-xe')
      ]);
      const orderData = await orderRes.json().catch(() => ({}));
      const customerData = await customerRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const vehicleData = await vehicleRes.json().catch(() => ({}));
      if (!orderRes.ok) throw new Error(orderData.error || 'Không thể tải lệnh xuất hàng.');
      if (!customerRes.ok) throw new Error(customerData.error || 'Không thể tải khách hàng.');
      if (!vehicleRes.ok) {
        console.warn('Không tải được danh sách xe:', vehicleData.error || vehicleRes.status);
      }
      setOrders(normalizeShippingOrders(orderData));
      setCustomers(normalizeCustomerDetails(customerData));
      setProducts(normalizeOrderProducts(productData));
      setVehicles(normalizeVehicles(vehicleData));
    } catch (loadError: unknown) {
      setOrders([]);
      setError(showSaveFailure(loadError, 'Không thể tải dữ liệu lệnh xuất hàng.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const hasActiveFilters = selectedStatus !== 'all' || Boolean(searchText);

  const resetFilters = () => {
    setSelectedStatus('all');
    setSearchText('');
  };

  const filteredOrders = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return orders.filter(order => {
      const matchesStatus = selectedStatus === 'all' || order.trang_thai === selectedStatus;
      const matchesSearch =
        !q ||
        `${order.ma_lenh} ${order.ten_khach_hang} ${order.ma_khach_hang} ${order.bsx} ${order.dia_chi_giao} ${order.trang_thai}`
          .toLowerCase()
          .includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orders, searchText, selectedStatus]);

  const visibleIds = useMemo(
    () => filteredOrders.map(order => order.id).filter(Boolean),
    [filteredOrders]
  );
  const selectedVisibleIds = useMemo(
    () => visibleIds.filter(id => selectedIds.includes(id)),
    [visibleIds, selectedIds]
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => orders.some(order => order.id === id)));
  }, [orders]);

  const toggleRowSelected = (orderId: string) => {
    if (!orderId) return;
    setSelectedIds(prev => (prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds(prev => [...new Set([...prev, ...visibleIds])]);
  };

  const handlePrintSelected = () => {
    const rowsToPrint = filteredOrders.filter(order => selectedIds.includes(order.id));
    if (rowsToPrint.length === 0) {
      showAppToast('Chọn ít nhất một lệnh xuất hàng để in.');
      return;
    }
    const kmSum = rowsToPrint.reduce(
      (sum, order) => sum + (order.so_km != null && order.so_km > 0 ? order.so_km : 0),
      0
    );
    setPrintTotalKm(kmSum > 0 ? String(kmSum) : '');
    setPreviewOrders(rowsToPrint);
    setPreviewOpen(true);
  };

  const closePrintPreview = () => {
    if (pendingPrint) return;
    setPreviewOpen(false);
    setPreviewOrders([]);
  };

  const confirmPrintFromPreview = () => {
    if (previewOrders.length === 0) return;
    setPrintingOrders(previewOrders);
    setPendingPrint(true);
  };

  useEffect(() => {
    if (!pendingPrint || printingOrders.length === 0) return;
    let cancelled = false;
    document.body.classList.add('shipping-delivery-print-active');
    enablePortraitPrintPage('shipping-delivery-print-page-a4', 4);
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('shipping-delivery-print-page-a4');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('shipping-delivery-print-active');
      disablePortraitPrintPage('shipping-delivery-print-page-a4');
    };
  }, [pendingPrint, printingOrders]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shipping-delivery-print-active');
      disablePortraitPrintPage('shipping-delivery-print-page-a4');
      setPrintingOrders([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId(null);
    setForm(emptyForm(generateNextShippingCode(orders.map(order => order.ma_lenh)), currentUser?.name || ''));
    setFormOpen(true);
    setError('');
  };

  const openEdit = (order: ShippingOrder) => {
    if (!canEdit) return;
    setEditingId(order.id);
    const khach = groupsFromOrder(order);
    setForm({
      ma_lenh: order.ma_lenh,
      ngay_xuat: order.ngay_xuat,
      ma_khach_hang: order.ma_khach_hang,
      ten_khach_hang: order.ten_khach_hang,
      dia_chi_giao: order.dia_chi_giao,
      so_dien_thoai: order.so_dien_thoai,
      bsx: order.bsx || '',
      so_km: order.so_km,
      thanh_toan: order.thanh_toan || '',
      nhan_vien: order.nhan_vien,
      trang_thai: order.trang_thai || 'Chờ xuất',
      ghi_chu: order.ghi_chu,
      chi_tiet: khach.flatMap(group => group.chi_tiet),
      khach
    });
    setFormOpen(true);
    setError('');
  };

  useEffect(() => {
    if (!formOpen || editingId || form.nhan_vien.trim() || !currentUser?.name?.trim()) return;
    setForm(prev => ({ ...prev, nhan_vien: currentUser.name.trim() }));
  }, [currentUser?.name, editingId, form.nhan_vien, formOpen]);

  const openFillFromOrders = () => {
    setFillDate(form.ngay_xuat || todayIso());
    setFillSelected([]);
    setFillError('');
    setFillOpen(true);
    setFillLoading(true);
    void fetch('/api/don-hang')
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(readApiErrorMessage(response, data, 'Không tải được đơn hàng.'));
        setFillOrders(normalizeSalesOrders(data));
      })
      .catch((loadError: unknown) => {
        setFillError(loadError instanceof Error ? loadError.message : 'Không tải được đơn hàng.');
      })
      .finally(() => setFillLoading(false));
  };

  const fillOrdersOnDate = fillOrders.filter(order => order.date === fillDate && order.customer.trim() && order.customer !== '-');

  const applyOrdersToForm = () => {
    const picked = fillOrdersOnDate.filter(order => fillSelected.includes(order.id));
    if (picked.length === 0) {
      setFillError('Chọn ít nhất một đơn hàng.');
      return;
    }
    const buckets = new Map<string, ShippingCustomerGroup>();
    for (const order of picked) {
      const customerName = order.customer.trim();
      const key = customerName.toLocaleLowerCase('vi');
      let group = buckets.get(key);
      if (!group) {
        const catalog =
          customers.find(item => item.name.trim().toLocaleLowerCase('vi') === key) ||
          customers.find(item => item.code.trim().toLocaleLowerCase('vi') === key) ||
          null;
        group = createCustomerGroup({
          ma_khach_hang: catalog?.code || '',
          ten_khach_hang: catalog?.name || customerName,
          dia_chi_giao: catalog ? catalog.dia_chi_moi?.trim() || catalog.dia_chi.trim() : '',
          so_dien_thoai: catalog?.so_dien_thoai || '',
          chi_tiet: []
        });
        group.chi_tiet = [];
        buckets.set(key, group);
      }
      for (const product of order.products) {
        const found = group.chi_tiet.find(
          line => line.ma_sp === product.code && line.ten_sp === product.name
        );
        if (found) {
          found.so_luong += product.qty;
          found.tong_tien = found.so_luong * found.don_gia;
          continue;
        }
        const catalogProduct = findOrderProductByCode(products, product.code);
        group.chi_tiet.push(
          createLine({
            ma_sp: product.code,
            ten_sp: catalogProduct?.name || product.name,
            don_vi: product.unit || catalogProduct?.unit || '',
            so_luong: product.qty
          })
        );
      }
    }
    const khach = [...buckets.values()].map(group =>
      group.chi_tiet.length > 0 ? group : { ...group, chi_tiet: [createLine()] }
    );
    if (khach.length === 0) {
      setFillError('Các đơn đã chọn chưa có khách hàng.');
      return;
    }
    setForm(prev => ({ ...prev, khach, chi_tiet: khach.flatMap(group => group.chi_tiet) }));
    setFillOpen(false);
    showAppToast(`Đã điền ${khach.length} khách từ ${picked.length} đơn hàng.`);
  };

  const selectCustomer = (groupId: string, customerName: string) => {
    const customer =
      customers.find(item => item.name === customerName || item.code === customerName || item.id === customerName) ||
      null;
    const deliveryAddress = customer
      ? customer.dia_chi_moi?.trim() || customer.dia_chi.trim() || ''
      : '';
    setForm(prev => ({
      ...prev,
      khach: prev.khach.map(group =>
        group.id === groupId
          ? {
              ...group,
              ma_khach_hang: customer?.code || '',
              ten_khach_hang: customer?.name || customerName,
              dia_chi_giao: customer ? deliveryAddress : group.dia_chi_giao,
              so_dien_thoai: customer ? customer.so_dien_thoai || '' : group.so_dien_thoai
            }
          : group
      )
    }));
  };

  const updateLine = (groupId: string, lineId: string, patch: Partial<ShippingOrderLine>) => {
    setForm(prev => ({
      ...prev,
      khach: prev.khach.map(group => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          chi_tiet: group.chi_tiet.map(line => {
            if (line.id !== lineId) return line;
            const next = { ...line, ...patch };
            next.tong_tien = (next.so_luong || 0) * (next.don_gia || 0);
            return next;
          })
        };
      })
    }));
  };

  const selectProduct = (groupId: string, lineId: string, code: string) => {
    const found = findOrderProductByCode(products, code);
    updateLine(groupId, lineId, {
      ma_sp: code,
      ten_sp: found?.name || '',
      don_vi: found?.unit || ''
    });
  };

  const handleSave = async () => {
    const unnamedWithGoods = form.khach.find(
      group =>
        !group.ten_khach_hang.trim() &&
        group.chi_tiet.some(line => line.ma_sp.trim() || line.ten_sp.trim() || line.so_luong > 0)
    );
    if (unnamedWithGoods) {
      setError(showSaveFailure('Mỗi nhóm mặt hàng cần chọn khách hàng.'));
      return;
    }
    const groups = form.khach.filter(group => group.ten_khach_hang.trim());
    if (groups.length === 0) {
      setError(showSaveFailure('Vui lòng chọn ít nhất một khách hàng.'));
      return;
    }
    if (!form.ngay_xuat.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày xuất.'));
      return;
    }
    const lines = groups.flatMap(group =>
      group.chi_tiet
        .filter(line => line.ma_sp.trim() || line.ten_sp.trim() || line.so_luong > 0)
        .map(line => ({ line, group }))
    );
    if (lines.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một mặt hàng.'));
      return;
    }
    for (const { line, group } of lines) {
      if (!line.ma_sp.trim() && !line.ten_sp.trim()) {
        setError(showSaveFailure(`Mỗi mặt hàng của ${group.ten_khach_hang} cần có mã SP hoặc tên SP.`));
        return;
      }
      if (!(line.so_luong > 0)) {
        setError(showSaveFailure(`Số lượng phải lớn hơn 0 (${line.ma_sp || line.ten_sp}).`));
        return;
      }
    }

    setIsSaving(true);
    setError('');
    try {
      const payment = form.thanh_toan.trim();
      const names = [...new Set(groups.map(group => group.ten_khach_hang.trim()).filter(Boolean))];
      const codes = [...new Set(groups.map(group => group.ma_khach_hang.trim()).filter(Boolean))];
      const payload = {
        ...form,
        ma_lenh: form.ma_lenh.trim() || generateNextShippingCode(orders.map(order => order.ma_lenh)),
        ma_khach_hang: codes.join(', '),
        ten_khach_hang: names.join(', '),
        dia_chi_giao: groups.map(group => group.dia_chi_giao.trim()).filter(Boolean).join('\n'),
        so_dien_thoai: groups.map(group => group.so_dien_thoai.trim()).filter(Boolean).join(', '),
        ghi_chu: composeHeaderNote(groups),
        thanh_toan: payment,
        chi_tiet: lines.map(({ line, group }) => ({
          ma_sp: line.ma_sp.trim(),
          ten_sp: line.ten_sp.trim(),
          don_vi: line.don_vi.trim(),
          so_luong: line.so_luong,
          don_gia: line.don_gia,
          tong_tien: line.tong_tien,
          thanh_toan: payment || line.thanh_toan.trim(),
          ma_khach_hang: group.ma_khach_hang.trim(),
          ten_khach_hang: group.ten_khach_hang.trim(),
          dia_chi_giao: group.dia_chi_giao.trim(),
          so_dien_thoai: group.so_dien_thoai.trim(),
          ghi_chu: group.ghi_chu.trim()
        }))
      };
      const res = await fetch(
        editingId ? `/api/lenh-xuat-hang/${encodeURIComponent(editingId)}` : '/api/lenh-xuat-hang',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không thể lưu lệnh xuất hàng.'));
      }
      if (typeof data.warning === 'string' && data.warning.trim()) {
        showAppToast(data.warning.trim());
      } else {
        showAppToast(editingId ? 'Đã cập nhật lệnh xuất hàng.' : 'Đã tạo lệnh xuất hàng.');
      }
      setFormOpen(false);
      setEditingId(null);
      await loadAll();
    } catch (saveError: unknown) {
      setError(showSaveFailure(saveError, 'Không thể lưu lệnh xuất hàng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (order: ShippingOrder) => {
    if (!order.id) return;
    if (!window.confirm(`Xóa lệnh xuất hàng ${order.ma_lenh}?`)) return;
    try {
      const res = await fetch(`/api/lenh-xuat-hang/${encodeURIComponent(order.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể xóa lệnh xuất hàng.'));
      showAppToast(`Đã xóa ${order.ma_lenh}.`);
      await loadAll();
    } catch (deleteError: unknown) {
      setError(showSaveFailure(deleteError, 'Không thể xóa lệnh xuất hàng.'));
    }
  };

  return (
    <div className="space-y-3 pb-8">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Truck className="h-4 w-4 text-brand-500" />
              Lệnh xuất hàng
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
              Xuất hàng cho khách hàng · {filteredOrders.length} phiếu
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={selectedVisibleIds.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              selectedVisibleIds.length > 0
                ? `In ${selectedVisibleIds.length} biên bản giao xe đã chọn`
                : 'Tick chọn lệnh xuất hàng rồi bấm in'
            }
          >
            <Printer className="h-4 w-4" />
            In biên bản{selectedVisibleIds.length > 0 ? ` (${selectedVisibleIds.length})` : ''}
          </button>
          {canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              Thêm lệnh xuất
            </button>
          ) : null}
        </div>
      </section>

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        loadError={error}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm mã lệnh, BSX, khách hàng, địa chỉ..."
          disabled={isLoading}
        />

        <FilterCombobox
          label="Trạng thái"
          options={[...STATUS_OPTIONS]}
          value={selectedStatus}
          onChange={setSelectedStatus}
          compact
          searchable={false}
        />
      </TableToolbar>

      <TableShell
        minWidthClassName="min-w-[1000px]"
      >
        <TableHead>
          <TableHeadCell align="center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              disabled={visibleIds.length === 0}
              className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
              title="Chọn tất cả trên trang"
              aria-label="Chọn tất cả lệnh xuất hàng"
            />
          </TableHeadCell>
          <TableHeadCell>Mã lệnh</TableHeadCell>
          <TableHeadCell>Ngày xuất</TableHeadCell>
          <TableHeadCell>BSX</TableHeadCell>
          <TableHeadCell align="right">Số Km</TableHeadCell>
          <TableHeadCell>Khách hàng</TableHeadCell>
          <TableHeadCell>Địa chỉ giao</TableHeadCell>
          <TableHeadCell align="center">SL SP</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredOrders.map(order => {
            const qty = order.chi_tiet.reduce((sum, line) => sum + (line.so_luong || 0), 0);
            const isSelected = Boolean(order.id) && selectedIds.includes(order.id);
            return (
              <React.Fragment key={order.id || order.ma_lenh}>
                <TableRow>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelected(order.id)}
                      disabled={!order.id}
                      className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                      aria-label={`Chọn in ${order.ma_lenh || 'lệnh xuất'}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono font-black text-sky-800">{order.ma_lenh || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateVi(order.ngay_xuat)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-brand-700">
                    {order.bsx || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-zinc-800">
                    {order.so_km != null && order.so_km > 0 ? formatNumber(order.so_km, 1) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-900">{order.ten_khach_hang || '—'}</div>
                    {order.ma_khach_hang ? (
                      <div className="text-[11px] font-semibold text-zinc-500">{order.ma_khach_hang}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{order.dia_chi_giao || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono font-bold text-zinc-800">
                    {formatNumber(qty, 2)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={order.trang_thai || 'Chờ xuất'} color={statusBadgeColor(order.trang_thai)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RowActionsMenu label={`Thao tác ${order.ma_lenh}`}>
                    <div className="inline-flex items-center justify-center gap-1.5">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(order)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(order)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </TableRow>
              </React.Fragment>
            );
          })}

          {!isLoading && filteredOrders.length === 0 && (
            <TableEmptyRow colSpan={10}>Chưa có lệnh xuất hàng.</TableEmptyRow>
          )}
        </TableBody>
      </TableShell>

      {previewOpen && previewOrders.length > 0
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex bg-slate-950/55">
              <div className="flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden bg-white">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                      Xem trước · Biên bản giao xe
                    </h3>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {previewOrders.length} lệnh đã chọn · 3 lệnh/trang · A4 dọc
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={confirmPrintFromPreview}
                      disabled={pendingPrint}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {pendingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                      In / Xuất PDF
                    </button>
                    <button
                      type="button"
                      onClick={closePrintPreview}
                      disabled={pendingPrint}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Đóng
                    </button>
                  </div>
                </div>

                <div className="shrink-0 border-b border-slate-200 px-3 py-2.5 space-y-2.5">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                        TỔNG CỘNG (KM)
                      </span>
                      <input
                        value={printTotalKm}
                        onChange={event => setPrintTotalKm(event.target.value)}
                        placeholder="Điền tay số km, vd: 50"
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                      />
                    </label>
                    <label className="block space-y-1.5 sm:col-span-1">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Ghi chú chung
                      </span>
                      <textarea
                        value={printGeneralNote}
                        onChange={event => setPrintGeneralNote(event.target.value)}
                        rows={2}
                        placeholder="Gõ ghi chú chung — sẽ hiện ở cuối mẫu in..."
                        className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
                      />
                    </label>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
                  <div className="bb-gx-print-preview-wrap w-full max-w-none">
                    <ShippingDeliveryPrintSheet
                      orders={previewOrders}
                      generalNote={printGeneralNote}
                      totalKmText={printTotalKm}
                    />
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {printingOrders.length > 0
        ? createPortal(
            <ShippingDeliveryPrintSheet
              orders={printingOrders}
              generalNote={printGeneralNote}
              totalKmText={printTotalKm}
            />,
            document.body
          )
        : null}

      {formOpen ? (
        <div className="fixed inset-0 z-[75] flex items-stretch justify-center bg-slate-950/50 p-0 sm:items-center sm:p-2 md:p-3">
          <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[98vw] flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[96dvh] sm:max-h-[96dvh] sm:max-w-[96vw] sm:rounded-2xl xl:max-w-[1600px]">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                  {editingId ? 'Sửa lệnh xuất hàng' : 'Thêm lệnh xuất hàng'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600"
              >
                Đóng
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
              <div className="shrink-0 grid gap-x-2 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Mã lệnh</span>
                  <input value={form.ma_lenh} readOnly className={`${compactFieldClass} bg-slate-50`} />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày xuất *</span>
                  <input
                    type="date"
                    value={form.ngay_xuat}
                    onChange={event => setForm(prev => ({ ...prev, ngay_xuat: event.target.value }))}
                    className={compactFieldClass}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">BSX</span>
                  <SearchableSelect
                    value={form.bsx}
                    options={vehicles}
                    isLoading={isLoading}
                    allowCustomValue
                    onChange={value => setForm(prev => ({ ...prev, bsx: value.toUpperCase() }))}
                    placeholder={isLoading ? 'Đang tải xe...' : 'Chọn hoặc gõ biển số mới'}
                    getValue={item => (item as VehicleOption).plate}
                    getLabel={item => (item as VehicleOption).plate}
                    getSearchText={item => (item as VehicleOption).label}
                    displaySelectedAsValue
                    inputClassName={compactFieldClass}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Số Km</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.so_km ?? ''}
                    onChange={event => {
                      const raw = event.target.value;
                      setForm(prev => ({
                        ...prev,
                        so_km: raw.trim() === '' ? null : Number(raw) || 0
                      }));
                    }}
                    className={`${compactFieldClass} text-right`}
                    placeholder="0"
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Thanh toán
                  </span>
                  <SearchableSelect
                    value={form.thanh_toan}
                    options={[...PAYMENT_OPTIONS]}
                    onChange={value => setForm(prev => ({ ...prev, thanh_toan: value }))}
                    placeholder="Tiền mặt / CK"
                    getValue={item => String(item)}
                    getLabel={item => String(item)}
                    inputClassName={compactFieldClass}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Trạng thái
                  </span>
                  <SearchableSelect
                    value={form.trang_thai}
                    options={[...STATUS_OPTIONS]}
                    onChange={status => setForm(prev => ({ ...prev, trang_thai: status }))}
                    placeholder="Trạng thái"
                    getValue={item => String(item)}
                    getLabel={item => String(item)}
                    inputClassName={compactFieldClass}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Nhân viên
                  </span>
                  <input
                    value={form.nhan_vien}
                    onChange={event => setForm(prev => ({ ...prev, nhan_vien: event.target.value }))}
                    className={compactFieldClass}
                    placeholder="Người lập"
                  />
                </label>
              </div>

              <div className="flex shrink-0 justify-end">
                <button
                  type="button"
                  onClick={openFillFromOrders}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-xs font-extrabold text-white hover:bg-[#d41626]"
                >
                  Điền từ đơn hàng
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden">
                {form.khach.map((group, groupIndex) => (
                  <section key={group.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Khách {groupIndex + 1}
                      </h4>
                      {form.khach.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm(prev => ({ ...prev, khach: prev.khach.filter(item => item.id !== group.id) }))
                          }
                          className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                        >
                          Xóa khách
                        </button>
                      ) : null}
                    </div>
                    <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block space-y-0.5 sm:col-span-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Khách hàng *
                        </span>
                        <SearchableSelect
                          value={group.ten_khach_hang}
                          options={customers}
                          onChange={value => selectCustomer(group.id, value)}
                          placeholder="Chọn khách"
                          getValue={item => (item as CustomerDetail).name}
                          getLabel={item => {
                            const customer = item as CustomerDetail;
                            return customer.code ? `${customer.code} · ${customer.name}` : customer.name;
                          }}
                          getSearchText={item => {
                            const customer = item as CustomerDetail;
                            return `${customer.code} ${customer.name} ${customer.so_dien_thoai}`;
                          }}
                          inputClassName={compactFieldClass}
                        />
                      </label>
                      <label className="block space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Địa chỉ</span>
                        <input
                          value={group.dia_chi_giao}
                          onChange={event =>
                            setForm(prev => ({
                              ...prev,
                              khach: prev.khach.map(item =>
                                item.id === group.id ? { ...item, dia_chi_giao: event.target.value } : item
                              )
                            }))
                          }
                          className={compactFieldClass}
                          placeholder="Địa chỉ giao"
                        />
                      </label>
                      <label className="block space-y-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">SĐT</span>
                        <input
                          value={group.so_dien_thoai}
                          onChange={event =>
                            setForm(prev => ({
                              ...prev,
                              khach: prev.khach.map(item =>
                                item.id === group.id ? { ...item, so_dien_thoai: event.target.value } : item
                              )
                            }))
                          }
                          className={compactFieldClass}
                          placeholder="Số điện thoại"
                        />
                      </label>
                      <label className="block space-y-0.5 sm:col-span-2 lg:col-span-4">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                          Ghi chú khách này
                        </span>
                        <input
                          value={group.ghi_chu}
                          onChange={event =>
                            setForm(prev => ({
                              ...prev,
                              khach: prev.khach.map(item =>
                                item.id === group.id ? { ...item, ghi_chu: event.target.value } : item
                              )
                            }))
                          }
                          className={compactFieldClass}
                          placeholder="Ghi chú riêng cho khách này"
                        />
                      </label>
                    </div>
                    <RepeatableLinesBlock
                      title="Mặt hàng"
                      required
                      showColumnHeaders
                      horizontalScroll
                      gridTemplateClass={lineGridClass}
                      addLabel="Thêm mặt hàng"
                      addButtonClassName="flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#d41626]"
                      onAdd={() =>
                        setForm(prev => ({
                          ...prev,
                          khach: prev.khach.map(item =>
                            item.id === group.id ? { ...item, chi_tiet: [...item.chi_tiet, createLine()] } : item
                          )
                        }))
                      }
                      columns={[
                        { key: 'code', label: 'Mã SP', required: true },
                        { key: 'name', label: 'Tên SP' },
                        { key: 'unit', label: 'ĐVT' },
                        { key: 'qty', label: 'SL', required: true },
                        { key: 'price', label: 'Đơn giá' },
                        { key: 'amount', label: 'Tổng tiền' },
                        { key: 'actions', label: '' }
                      ]}
                    >
                      {group.chi_tiet.map(line => {
                        const matched = findOrderProductByCode(products, line.ma_sp);
                        return (
                          <RepeatableLineRow key={line.id} gridTemplateClass={lineGridClass}>
                            <div className="col-span-2 min-w-0 md:col-span-1">
                              <SearchableSelect
                                value={line.ma_sp}
                                options={products}
                                onChange={value => selectProduct(group.id, line.id, value)}
                                placeholder="Gõ để tìm mã SP"
                                displaySelectedAsValue
                                dropdownMinWidth={420}
                                getValue={item => (item as OrderProductOption).code}
                                getLabel={item => {
                                  const product = item as OrderProductOption;
                                  return `${product.code} · ${product.name}`;
                                }}
                                getSearchText={item => {
                                  const product = item as OrderProductOption;
                                  return `${product.code} ${product.newCode} ${product.name}`;
                                }}
                                inputClassName={orderFieldClass}
                              />
                            </div>
                            <div className="col-span-2 min-w-0 md:col-span-1">
                              <input
                                value={line.ten_sp}
                                readOnly={Boolean(matched)}
                                onChange={event => updateLine(group.id, line.id, { ten_sp: event.target.value })}
                                className={`${orderFieldClass} ${matched ? 'bg-slate-50' : ''}`}
                                placeholder="Tên SP"
                              />
                            </div>
                            <div className="col-span-1 min-w-0">
                              <input
                                value={line.don_vi}
                                onChange={event => updateLine(group.id, line.id, { don_vi: event.target.value })}
                                className={orderFieldClass}
                                placeholder="ĐVT"
                              />
                            </div>
                            <div className="col-span-1 min-w-0">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={line.so_luong || ''}
                                onChange={event =>
                                  updateLine(group.id, line.id, { so_luong: Number(event.target.value) || 0 })
                                }
                                className={`${orderFieldClass} text-right`}
                                placeholder="0"
                              />
                            </div>
                            <div className="col-span-1 min-w-0">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={line.don_gia || ''}
                                onChange={event =>
                                  updateLine(group.id, line.id, { don_gia: Number(event.target.value) || 0 })
                                }
                                className={`${orderFieldClass} text-right`}
                                placeholder="0"
                              />
                            </div>
                            <div className="col-span-1 min-w-0">
                              <input
                                value={line.tong_tien > 0 ? formatNumber(line.tong_tien, 0) : ''}
                                readOnly
                                className={`${orderFieldClass} bg-slate-50 text-right`}
                                placeholder="0"
                              />
                            </div>
                            {group.chi_tiet.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setForm(prev => ({
                                    ...prev,
                                    khach: prev.khach.map(item =>
                                      item.id === group.id
                                        ? { ...item, chi_tiet: item.chi_tiet.filter(row => row.id !== line.id) }
                                        : item
                                    )
                                  }))
                                }
                                title="Xóa mặt hàng"
                                className="col-span-2 flex h-10 w-full items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 md:col-span-1 md:w-10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <div className="hidden md:block" />
                            )}
                          </RepeatableLineRow>
                        );
                      })}
                    </RepeatableLinesBlock>
                  </section>
                ))}
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, khach: [...prev.khach, createCustomerGroup()] }))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-xs font-extrabold text-white hover:bg-[#d41626]"
                >
                  <Plus className="h-4 w-4" />
                  Thêm khách
                </button>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-3 py-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                disabled={isSaving}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Đang lưu...' : 'Lưu lệnh'}
              </button>
            </div>
          </div>
          {fillOpen ? (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3">
              <div className="flex max-h-[min(80dvh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Điền từ đơn hàng</h3>
                  <button
                    type="button"
                    onClick={() => setFillOpen(false)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600"
                  >
                    Đóng
                  </button>
                </div>
                <div className="space-y-3 px-4 py-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày đơn hàng</span>
                    <input
                      type="date"
                      value={fillDate}
                      onChange={event => {
                        setFillDate(event.target.value);
                        setFillSelected([]);
                        setFillError('');
                      }}
                      className={compactFieldClass}
                    />
                  </label>
                  {fillError ? <p className="text-xs font-bold text-rose-600">{fillError}</p> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                  {fillLoading ? (
                    <div className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang tải đơn hàng...
                    </div>
                  ) : fillOrdersOnDate.length === 0 ? (
                    <p className="py-6 text-sm font-semibold text-slate-500">Ngày này chưa có đơn hàng.</p>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <input
                          type="checkbox"
                          checked={
                            fillOrdersOnDate.length > 0 &&
                            fillOrdersOnDate.every(order => fillSelected.includes(order.id))
                          }
                          onChange={event =>
                            setFillSelected(event.target.checked ? fillOrdersOnDate.map(order => order.id) : [])
                          }
                        />
                        Chọn tất cả ({fillOrdersOnDate.length})
                      </label>
                      {fillOrdersOnDate.map(order => {
                        const summary = order.products
                          .map(product => {
                            const label = product.name || product.code;
                            return product.qty > 0 ? `${label} × ${formatNumber(product.qty)}` : label;
                          })
                          .join(', ');
                        return (
                          <label
                            key={order.id}
                            className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={fillSelected.includes(order.id)}
                              onChange={event =>
                                setFillSelected(prev =>
                                  event.target.checked ? [...prev, order.id] : prev.filter(id => id !== order.id)
                                )
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-extrabold text-slate-900">
                                {order.code} · {order.customer}
                              </span>
                              <span className="block text-xs font-semibold text-slate-500">
                                {summary || 'Chưa có sản phẩm'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setFillOpen(false)}
                    className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={applyOrdersToForm}
                    disabled={fillLoading || fillSelected.length === 0}
                    className="h-10 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    Điền vào lệnh
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
