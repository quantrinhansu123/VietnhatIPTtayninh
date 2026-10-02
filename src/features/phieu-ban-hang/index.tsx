import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Receipt, Save, Trash2 } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { RepeatableLineRow, RepeatableLinesBlock } from '../../components/RepeatableLinesBlock';
import { pickText } from '../_shared/recordHelpers';
import {
  findOrderProductByCode,
  normalizeOrderProducts,
  orderFieldClass,
  type OrderProductOption
} from '../_shared/orderHelpers';
import { showAppToast, showSaveFailure, readApiErrorMessage } from '../../lib/appToast';
import {
  normalizeShippingOrders,
  type ShippingOrder,
  type ShippingOrderLine
} from '../lenh-xuat-hang';
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

type SalesInvoiceLine = {
  id: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
  don_gia: number;
  tong_tien: number;
  ma_lenh_xuat: string;
};

type SalesInvoice = {
  id: string;
  ma_phieu: string;
  ngay_ban: string;
  ma_lenh_xuat: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi: string;
  so_dien_thoai: string;
  thanh_toan: string;
  nhan_vien: string;
  trang_thai: string;
  ghi_chu: string;
  chi_tiet: SalesInvoiceLine[];
};

type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  dia_chi: string;
  dia_chi_moi: string;
  so_dien_thoai: string;
};

type ShippingCustomerSlice = {
  key: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi_giao: string;
  so_dien_thoai: string;
  lines: ShippingOrderLine[];
};

const STATUS_OPTIONS = ['Nháp', 'Đã bán', 'Hủy'] as const;
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

function createLine(partial?: Partial<SalesInvoiceLine>): SalesInvoiceLine {
  const soLuong = Number.isFinite(partial?.so_luong) ? Number(partial?.so_luong) : 0;
  const donGia = Number.isFinite(partial?.don_gia) ? Number(partial?.don_gia) : 0;
  const tongTien = Number.isFinite(partial?.tong_tien) ? Number(partial?.tong_tien) : soLuong * donGia;
  return {
    id: partial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ma_sp: partial?.ma_sp || '',
    ten_sp: partial?.ten_sp || '',
    don_vi: partial?.don_vi || '',
    so_luong: soLuong,
    don_gia: donGia,
    tong_tien: tongTien,
    ma_lenh_xuat: partial?.ma_lenh_xuat || ''
  };
}

function parseLines(value: unknown): SalesInvoiceLine[] {
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
        ma_lenh_xuat: pickText(row, ['ma_lenh_xuat', 'shipping_code'], '')
      })
    );
}

function normalizeInvoices(data: unknown): SalesInvoice[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { invoices?: unknown; rows?: unknown }).invoices
    ?? (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: String(row.id ?? '').trim(),
      ma_phieu: pickText(row, ['ma_phieu', 'code'], ''),
      ngay_ban: pickText(row, ['ngay_ban', 'sale_date'], todayIso()).slice(0, 10),
      ma_lenh_xuat: pickText(row, ['ma_lenh_xuat', 'shipping_code'], ''),
      ma_khach_hang: pickText(row, ['ma_khach_hang', 'customer_code'], ''),
      ten_khach_hang: pickText(row, ['ten_khach_hang', 'customer_name', 'khach_hang'], ''),
      dia_chi: pickText(row, ['dia_chi', 'dia_chi_giao', 'address'], ''),
      so_dien_thoai: pickText(row, ['so_dien_thoai', 'dien_thoai', 'phone'], ''),
      thanh_toan: pickText(row, ['thanh_toan', 'hinh_thuc_tt', 'payment'], ''),
      nhan_vien: pickText(row, ['nhan_vien', 'staff'], ''),
      trang_thai: pickText(row, ['trang_thai', 'status'], 'Nháp'),
      ghi_chu: pickText(row, ['ghi_chu', 'note'], ''),
      chi_tiet: parseLines(row.chi_tiet)
    }))
    .filter(row => row.id || row.ma_phieu);
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

function generateNextInvoiceCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^PBH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  const width = Math.max(3, String(next).length);
  return `PBH${String(next).padStart(width, '0')}`;
}

function emptyForm(code = '', staffName = ''): Omit<SalesInvoice, 'id'> {
  return {
    ma_phieu: code,
    ngay_ban: todayIso(),
    ma_lenh_xuat: '',
    ma_khach_hang: '',
    ten_khach_hang: '',
    dia_chi: '',
    so_dien_thoai: '',
    thanh_toan: '',
    nhan_vien: staffName,
    trang_thai: 'Nháp',
    ghi_chu: '',
    chi_tiet: [createLine()]
  };
}

function customerSlices(order: ShippingOrder): ShippingCustomerSlice[] {
  const slices: ShippingCustomerSlice[] = [];
  for (const line of order.chi_tiet) {
    const code = String(line.ma_khach_hang || order.ma_khach_hang || '').trim();
    const name = String(line.ten_khach_hang || order.ten_khach_hang || '').trim();
    const address = String(line.dia_chi_giao || order.dia_chi_giao || '').trim();
    const phone = String(line.so_dien_thoai || order.so_dien_thoai || '').trim();
    const key = `${code}|${name}|${address}|${phone}`;
    let slice = slices.find(item => item.key === key);
    if (!slice) {
      slice = {
        key,
        ma_khach_hang: code,
        ten_khach_hang: name,
        dia_chi_giao: address,
        so_dien_thoai: phone,
        lines: []
      };
      slices.push(slice);
    }
    slice.lines.push(line);
  }
  if (slices.length === 0 && (order.ten_khach_hang || order.ma_khach_hang)) {
    slices.push({
      key: 'header',
      ma_khach_hang: order.ma_khach_hang,
      ten_khach_hang: order.ten_khach_hang,
      dia_chi_giao: order.dia_chi_giao,
      so_dien_thoai: order.so_dien_thoai,
      lines: []
    });
  }
  return slices;
}

function lineHasContent(line: SalesInvoiceLine) {
  return Boolean(line.ma_sp.trim() || line.ten_sp.trim() || line.so_luong > 0 || line.don_gia > 0);
}

function invoiceTotal(lines: SalesInvoiceLine[]) {
  return lines.reduce((sum, line) => sum + (line.tong_tien || 0), 0);
}

function statusBadgeColor(status: string): StatusBadgeColor {
  if (status === 'Đã bán') return 'emerald';
  if (status === 'Hủy') return 'rose';
  return 'amber';
}

function joinCodes(current: string, next: string) {
  const codes = [...new Set(`${current},${next}`.split(',').map(item => item.trim()).filter(Boolean))];
  return codes.join(', ');
}

export function SalesInvoicesPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('sales-invoices');
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [shippingOrders, setShippingOrders] = useState<ShippingOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerDetail[]>([]);
  const [products, setProducts] = useState<OrderProductOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Omit<SalesInvoice, 'id'>>(emptyForm('', currentUser?.name || ''));
  const [sourceOrderId, setSourceOrderId] = useState('');
  const [sourceSliceKey, setSourceSliceKey] = useState('');

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [invoiceRes, shippingRes, customerRes, productRes] = await Promise.all([
        fetch('/api/phieu-ban-hang'),
        fetch('/api/lenh-xuat-hang'),
        fetch('/api/khach-hang'),
        fetch('/api/san-pham?format=table')
      ]);
      const invoiceData = await invoiceRes.json().catch(() => ({}));
      const shippingData = await shippingRes.json().catch(() => ({}));
      const customerData = await customerRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      if (!invoiceRes.ok) throw new Error(readApiErrorMessage(invoiceRes, invoiceData, 'Không thể tải phiếu bán hàng.'));
      if (!shippingRes.ok) {
        console.warn('Không tải được lệnh xuất hàng:', shippingData.error || shippingRes.status);
      }
      const warning = typeof invoiceData.warning === 'string' ? invoiceData.warning.trim() : '';
      if (warning) setError(warning);
      setInvoices(normalizeInvoices(invoiceData));
      setShippingOrders(normalizeShippingOrders(shippingData));
      setCustomers(normalizeCustomerDetails(customerData));
      setProducts(normalizeOrderProducts(productData));
    } catch (loadError: unknown) {
      setInvoices([]);
      setError(showSaveFailure(loadError, 'Không thể tải phiếu bán hàng.'));
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

  const filteredInvoices = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return invoices.filter(invoice => {
      const matchesStatus = selectedStatus === 'all' || invoice.trang_thai === selectedStatus;
      const matchesSearch =
        !q ||
        `${invoice.ma_phieu} ${invoice.ma_lenh_xuat} ${invoice.ten_khach_hang} ${invoice.ma_khach_hang} ${invoice.dia_chi}`
          .toLowerCase()
          .includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [invoices, searchText, selectedStatus]);

  const sourceOrder = shippingOrders.find(order => order.id === sourceOrderId) || null;
  const sourceSlices = sourceOrder ? customerSlices(sourceOrder) : [];

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId(null);
    setSourceOrderId('');
    setSourceSliceKey('');
    setForm(emptyForm(generateNextInvoiceCode(invoices.map(invoice => invoice.ma_phieu)), currentUser?.name || ''));
    setFormOpen(true);
    setError('');
  };

  const openEdit = (invoice: SalesInvoice) => {
    if (!canEdit) return;
    setEditingId(invoice.id);
    setForm({
      ...invoice,
      chi_tiet: invoice.chi_tiet.length > 0 ? invoice.chi_tiet.map(line => createLine(line)) : [createLine()]
    });
    const linked = shippingOrders.find(order => order.ma_lenh === invoice.ma_lenh_xuat.split(',')[0]?.trim());
    setSourceOrderId(linked?.id || '');
    setSourceSliceKey('');
    setFormOpen(true);
    setError('');
  };

  const selectSourceOrder = (orderId: string) => {
    setSourceOrderId(orderId);
    const order = shippingOrders.find(item => item.id === orderId);
    const slices = order ? customerSlices(order) : [];
    setSourceSliceKey(slices.length === 1 ? slices[0].key : '');
  };

  const applyShippingContent = () => {
    if (!sourceOrder) {
      setError(showSaveFailure('Chọn lệnh xuất hàng để lấy nội dung.'));
      return;
    }
    const slice = sourceSlices.find(item => item.key === sourceSliceKey) || (sourceSlices.length === 1 ? sourceSlices[0] : null);
    if (!slice) {
      setError(showSaveFailure('Lệnh có nhiều khách. Chọn khách cần lấy nội dung.'));
      return;
    }
    const goods = slice.lines.filter(line => line.ma_sp.trim() || line.ten_sp.trim() || line.so_luong > 0);
    if (goods.length === 0) {
      setError(showSaveFailure(`Lệnh ${sourceOrder.ma_lenh} chưa có mặt hàng cho khách này.`));
      return;
    }

    const meaningful = form.chi_tiet.filter(lineHasContent);
    const sameCustomer =
      !form.ten_khach_hang.trim() || form.ten_khach_hang.trim() === slice.ten_khach_hang.trim();
    if (!sameCustomer && meaningful.length > 0) {
      const ok = window.confirm(
        `Phiếu đang của khách "${form.ten_khach_hang}". Thay bằng nội dung của "${slice.ten_khach_hang || 'khách trên lệnh'}" từ lệnh ${sourceOrder.ma_lenh}?`
      );
      if (!ok) return;
    }

    const incoming = goods.map(line =>
      createLine({
        ma_sp: line.ma_sp,
        ten_sp: line.ten_sp,
        don_vi: line.don_vi,
        so_luong: line.so_luong,
        don_gia: line.don_gia,
        tong_tien: line.tong_tien > 0 ? line.tong_tien : line.so_luong * line.don_gia,
        ma_lenh_xuat: sourceOrder.ma_lenh
      })
    );

    setForm(prev => {
      const current = prev.chi_tiet.filter(lineHasContent);
      let nextLines = incoming;
      if (sameCustomer && current.length > 0) {
        const keys = new Set(current.map(line => `${line.ma_sp}|${line.ten_sp}|${line.so_luong}|${line.don_gia}`));
        const extra = incoming.filter(line => !keys.has(`${line.ma_sp}|${line.ten_sp}|${line.so_luong}|${line.don_gia}`));
        nextLines = [...current, ...extra];
      }
      return {
        ...prev,
        ma_lenh_xuat: sameCustomer ? joinCodes(prev.ma_lenh_xuat, sourceOrder.ma_lenh) : sourceOrder.ma_lenh,
        ngay_ban: prev.ngay_ban || sourceOrder.ngay_xuat,
        ma_khach_hang: slice.ma_khach_hang,
        ten_khach_hang: slice.ten_khach_hang,
        dia_chi: slice.dia_chi_giao,
        so_dien_thoai: slice.so_dien_thoai,
        thanh_toan: prev.thanh_toan || sourceOrder.thanh_toan,
        chi_tiet: nextLines.length > 0 ? nextLines : [createLine()]
      };
    });
    setError('');
    showAppToast(`Đã lấy ${goods.length} mặt hàng từ lệnh ${sourceOrder.ma_lenh}.`);
  };

  const selectCustomer = (customerName: string) => {
    const customer =
      customers.find(item => item.name === customerName || item.code === customerName || item.id === customerName) ||
      null;
    const address = customer ? customer.dia_chi_moi?.trim() || customer.dia_chi.trim() || '' : '';
    setForm(prev => ({
      ...prev,
      ma_khach_hang: customer?.code || '',
      ten_khach_hang: customer?.name || customerName,
      dia_chi: customer ? address : prev.dia_chi,
      so_dien_thoai: customer ? customer.so_dien_thoai || '' : prev.so_dien_thoai
    }));
  };

  const updateLine = (lineId: string, patch: Partial<SalesInvoiceLine>) => {
    setForm(prev => ({
      ...prev,
      chi_tiet: prev.chi_tiet.map(line => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        next.tong_tien = (next.so_luong || 0) * (next.don_gia || 0);
        return next;
      })
    }));
  };

  const selectProduct = (lineId: string, code: string) => {
    const found = findOrderProductByCode(products, code);
    updateLine(lineId, {
      ma_sp: code,
      ten_sp: found?.name || '',
      don_vi: found?.unit || ''
    });
  };

  const handleSave = async () => {
    if (!form.ten_khach_hang.trim()) {
      setError(showSaveFailure('Vui lòng chọn khách hàng.'));
      return;
    }
    if (!form.ngay_ban.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày bán.'));
      return;
    }
    const lines = form.chi_tiet.filter(lineHasContent);
    if (lines.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một mặt hàng.'));
      return;
    }
    for (const line of lines) {
      if (!line.ma_sp.trim() && !line.ten_sp.trim()) {
        setError(showSaveFailure('Mỗi mặt hàng cần có mã SP hoặc tên SP.'));
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
      const payload = {
        ma_phieu: form.ma_phieu.trim() || generateNextInvoiceCode(invoices.map(invoice => invoice.ma_phieu)),
        ngay_ban: form.ngay_ban,
        ma_lenh_xuat: form.ma_lenh_xuat.trim(),
        ma_khach_hang: form.ma_khach_hang.trim(),
        ten_khach_hang: form.ten_khach_hang.trim(),
        dia_chi: form.dia_chi.trim(),
        so_dien_thoai: form.so_dien_thoai.trim(),
        thanh_toan: form.thanh_toan.trim(),
        nhan_vien: form.nhan_vien.trim(),
        trang_thai: form.trang_thai.trim() || 'Nháp',
        ghi_chu: form.ghi_chu.trim(),
        chi_tiet: lines.map(line => ({
          ma_sp: line.ma_sp.trim(),
          ten_sp: line.ten_sp.trim(),
          don_vi: line.don_vi.trim(),
          so_luong: line.so_luong,
          don_gia: line.don_gia,
          tong_tien: line.tong_tien,
          ma_lenh_xuat: line.ma_lenh_xuat.trim() || form.ma_lenh_xuat.trim()
        }))
      };
      const res = await fetch(
        editingId ? `/api/phieu-ban-hang/${encodeURIComponent(editingId)}` : '/api/phieu-ban-hang',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu bán hàng.'));
      }
      showAppToast(editingId ? 'Đã cập nhật phiếu bán hàng.' : 'Đã tạo phiếu bán hàng.');
      setFormOpen(false);
      setEditingId(null);
      await loadAll();
    } catch (saveError: unknown) {
      setError(showSaveFailure(saveError, 'Không thể lưu phiếu bán hàng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (invoice: SalesInvoice) => {
    if (!invoice.id) return;
    if (!window.confirm(`Xóa phiếu bán hàng ${invoice.ma_phieu}?`)) return;
    try {
      const res = await fetch(`/api/phieu-ban-hang/${encodeURIComponent(invoice.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể xóa phiếu bán hàng.'));
      showAppToast(`Đã xóa ${invoice.ma_phieu}.`);
      await loadAll();
    } catch (deleteError: unknown) {
      setError(showSaveFailure(deleteError, 'Không thể xóa phiếu bán hàng.'));
    }
  };

  const formTotal = invoiceTotal(form.chi_tiet);

  return (
    <div className="space-y-3 pb-8">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Receipt className="h-4 w-4 text-brand-500" />
            Phiếu bán hàng
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            Lập phiếu bán từ lệnh xuất hàng · {filteredInvoices.length} phiếu
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            Thêm phiếu
          </button>
        ) : null}
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
          placeholder="Tìm mã phiếu, lệnh xuất, khách hàng..."
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

      <TableShell minWidthClassName="min-w-[980px]">
        <TableHead>
          <TableHeadCell>Mã phiếu</TableHeadCell>
          <TableHeadCell>Ngày bán</TableHeadCell>
          <TableHeadCell>Lệnh xuất</TableHeadCell>
          <TableHeadCell>Khách hàng</TableHeadCell>
          <TableHeadCell align="center">SL</TableHeadCell>
          <TableHeadCell>Thành tiền</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredInvoices.map(invoice => {
            const qty = invoice.chi_tiet.reduce((sum, line) => sum + (line.so_luong || 0), 0);
            return (
              <TableRow key={invoice.id || invoice.ma_phieu}>
                <td className="px-4 py-3 font-mono font-black text-sky-800">{invoice.ma_phieu || '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                  {formatDateVi(invoice.ngay_ban)}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-zinc-700">{invoice.ma_lenh_xuat || '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-bold text-zinc-900">{invoice.ten_khach_hang || '—'}</div>
                  {invoice.ma_khach_hang ? (
                    <div className="text-[11px] font-semibold text-zinc-500">{invoice.ma_khach_hang}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-center font-mono font-bold text-zinc-800">{formatNumber(qty, 2)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900">
                  {formatNumber(invoiceTotal(invoice.chi_tiet), 0)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={invoice.trang_thai || 'Nháp'} color={statusBadgeColor(invoice.trang_thai)} />
                </td>
                <td className="px-4 py-3 text-center">
                  <RowActionsMenu label={`Thao tác ${invoice.ma_phieu}`}>
                    <div className="inline-flex items-center justify-center gap-1.5">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(invoice)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(invoice)}
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
            );
          })}
          {!isLoading && filteredInvoices.length === 0 && (
            <TableEmptyRow colSpan={8}>Chưa có phiếu bán hàng.</TableEmptyRow>
          )}
        </TableBody>
      </TableShell>

      {formOpen ? (
        <div className="fixed inset-0 z-[75] flex items-stretch justify-center bg-slate-950/50 p-0 sm:items-center sm:p-2 md:p-3">
          <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-[98vw] flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[96dvh] sm:max-h-[96dvh] sm:max-w-[96vw] sm:rounded-2xl xl:max-w-[1600px]">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                {editingId ? 'Sửa phiếu bán hàng' : 'Thêm phiếu bán hàng'}
              </h3>
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
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Mã phiếu</span>
                  <input value={form.ma_phieu} readOnly className={`${compactFieldClass} bg-slate-50`} />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày bán *</span>
                  <input
                    type="date"
                    value={form.ngay_ban}
                    onChange={event => setForm(prev => ({ ...prev, ngay_ban: event.target.value }))}
                    className={compactFieldClass}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Thanh toán</span>
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
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Trạng thái</span>
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
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Nhân viên</span>
                  <input
                    value={form.nhan_vien}
                    onChange={event => setForm(prev => ({ ...prev, nhan_vien: event.target.value }))}
                    className={compactFieldClass}
                    placeholder="Người lập"
                  />
                </label>
                <label className="block space-y-0.5 sm:col-span-2 lg:col-span-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ghi chú</span>
                  <input
                    value={form.ghi_chu}
                    onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))}
                    className={compactFieldClass}
                    placeholder="Ghi chú thêm"
                  />
                </label>
              </div>

              <section className="shrink-0 rounded-xl border border-sky-200 bg-sky-50/70 p-2.5">
                <h4 className="text-xs font-black uppercase tracking-wide text-sky-900">
                  Lấy nội dung từ lệnh xuất hàng
                </h4>
                <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] lg:items-end">
                  <label className="block space-y-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Lệnh xuất</span>
                    <SearchableSelect
                      value={sourceOrderId}
                      options={shippingOrders}
                      isLoading={isLoading}
                      onChange={selectSourceOrder}
                      placeholder={isLoading ? 'Đang tải lệnh xuất...' : 'Chọn lệnh xuất hàng'}
                      getValue={item => (item as ShippingOrder).id}
                      getLabel={item => {
                        const order = item as ShippingOrder;
                        const slices = customerSlices(order);
                        const names = slices.map(slice => slice.ten_khach_hang).filter(Boolean).join(', ');
                        return `${order.ma_lenh} · ${formatDateVi(order.ngay_xuat)}${names ? ` · ${names}` : ''}`;
                      }}
                      getSearchText={item => {
                        const order = item as ShippingOrder;
                        return `${order.ma_lenh} ${order.ten_khach_hang} ${order.bsx} ${order.dia_chi_giao}`;
                      }}
                      inputClassName={compactFieldClass}
                    />
                  </label>
                  {sourceSlices.length > 1 ? (
                    <label className="block space-y-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Khách trên lệnh
                      </span>
                      <SearchableSelect
                        value={sourceSliceKey}
                        options={sourceSlices}
                        onChange={setSourceSliceKey}
                        placeholder="Chọn khách cần lấy"
                        getValue={item => (item as ShippingCustomerSlice).key}
                        getLabel={item => {
                          const slice = item as ShippingCustomerSlice;
                          const qty = slice.lines.reduce((sum, line) => sum + (line.so_luong || 0), 0);
                          return `${slice.ten_khach_hang || 'Khách'} · ${slice.lines.length} mặt hàng · SL ${formatNumber(qty, 2)}`;
                        }}
                        getSearchText={item => {
                          const slice = item as ShippingCustomerSlice;
                          return `${slice.ma_khach_hang} ${slice.ten_khach_hang} ${slice.dia_chi_giao} ${slice.so_dien_thoai}`;
                        }}
                        inputClassName={compactFieldClass}
                      />
                    </label>
                  ) : (
                    <p className="text-[11px] font-semibold text-slate-600 lg:pb-2">
                      {sourceOrder
                        ? `${sourceSlices[0]?.lines.length || 0} mặt hàng · ${sourceSlices[0]?.ten_khach_hang || sourceOrder.ten_khach_hang || 'chưa có khách'}`
                        : 'Chọn lệnh rồi bấm thêm nội dung. Có thể bấm lại để lấy thêm mặt hàng.'}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={applyShippingContent}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#ef1b2d] bg-[#ef1b2d] px-3 text-xs font-extrabold text-white hover:bg-[#d41626]"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm nội dung lệnh
                  </button>
                </div>
              </section>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden">
                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="block space-y-0.5 sm:col-span-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Khách hàng *
                      </span>
                      <SearchableSelect
                        value={form.ten_khach_hang}
                        options={customers}
                        onChange={selectCustomer}
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
                        value={form.dia_chi}
                        onChange={event => setForm(prev => ({ ...prev, dia_chi: event.target.value }))}
                        className={compactFieldClass}
                        placeholder="Địa chỉ"
                      />
                    </label>
                    <label className="block space-y-0.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">SĐT</span>
                      <input
                        value={form.so_dien_thoai}
                        onChange={event => setForm(prev => ({ ...prev, so_dien_thoai: event.target.value }))}
                        className={compactFieldClass}
                        placeholder="Số điện thoại"
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
                    onAdd={() => setForm(prev => ({ ...prev, chi_tiet: [...prev.chi_tiet, createLine()] }))}
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
                    {form.chi_tiet.map(line => {
                      const matched = findOrderProductByCode(products, line.ma_sp);
                      return (
                        <RepeatableLineRow key={line.id} gridTemplateClass={lineGridClass}>
                          <div className="col-span-2 min-w-0 md:col-span-1">
                            <SearchableSelect
                              value={line.ma_sp}
                              options={products}
                              onChange={value => selectProduct(line.id, value)}
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
                              onChange={event => updateLine(line.id, { ten_sp: event.target.value })}
                              className={`${orderFieldClass} ${matched ? 'bg-slate-50' : ''}`}
                              placeholder="Tên SP"
                            />
                          </div>
                          <div className="col-span-1 min-w-0">
                            <input
                              value={line.don_vi}
                              onChange={event => updateLine(line.id, { don_vi: event.target.value })}
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
                              onChange={event => updateLine(line.id, { so_luong: Number(event.target.value) || 0 })}
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
                              onChange={event => updateLine(line.id, { don_gia: Number(event.target.value) || 0 })}
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
                          {form.chi_tiet.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setForm(prev => ({
                                  ...prev,
                                  chi_tiet: prev.chi_tiet.filter(row => row.id !== line.id)
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
                  <div className="mt-2 text-right text-sm font-black text-slate-800">
                    Tổng cộng: {formatNumber(formTotal, 0)}
                  </div>
                </section>
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
                {isSaving ? 'Đang lưu...' : 'Lưu phiếu'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
