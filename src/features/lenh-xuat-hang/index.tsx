import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, Truck } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import { BackButton } from '../../components/layout/NavButtons';
import { SearchableSelect, SimpleSelect } from '../../components/shared/SearchableSelect';
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
};

export type ShippingOrder = {
  id: string;
  ma_lenh: string;
  ngay_xuat: string;
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi_giao: string;
  so_dien_thoai: string;
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
  so_dien_thoai: string;
};

const STATUS_OPTIONS = ['Chờ xuất', 'Đang giao', 'Đã giao', 'Hủy'] as const;

const lineGridClass =
  'grid-cols-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.3fr)_5.5rem_6rem_7.5rem_8rem_2.5rem]';

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
  return {
    id: partial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ma_sp: partial?.ma_sp || '',
    ten_sp: partial?.ten_sp || '',
    don_vi: partial?.don_vi || '',
    so_luong: soLuong,
    don_gia: donGia,
    tong_tien: tongTien
  };
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
        tong_tien: Number(row.tong_tien ?? row.total_amount ?? row.thanh_tien ?? 0)
      })
    );
}

function normalizeShippingOrders(data: unknown): ShippingOrder[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { orders?: unknown; rows?: unknown }).orders
    ?? (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: String(row.id ?? '').trim(),
      ma_lenh: pickText(row, ['ma_lenh', 'code'], ''),
      ngay_xuat: pickText(row, ['ngay_xuat', 'ship_date'], todayIso()).slice(0, 10),
      ma_khach_hang: pickText(row, ['ma_khach_hang', 'customer_code'], ''),
      ten_khach_hang: pickText(row, ['ten_khach_hang', 'customer_name', 'khach_hang'], ''),
      dia_chi_giao: pickText(row, ['dia_chi_giao', 'dia_chi', 'address'], ''),
      so_dien_thoai: pickText(row, ['so_dien_thoai', 'dien_thoai', 'phone'], ''),
      nhan_vien: pickText(row, ['nhan_vien', 'staff'], ''),
      trang_thai: pickText(row, ['trang_thai', 'status'], 'Chờ xuất'),
      ghi_chu: pickText(row, ['ghi_chu', 'note'], ''),
      chi_tiet: parseLines(row.chi_tiet)
    }))
    .filter(row => row.id || row.ma_lenh);
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

function emptyForm(code = '', staffName = ''): Omit<ShippingOrder, 'id'> {
  return {
    ma_lenh: code,
    ngay_xuat: todayIso(),
    ma_khach_hang: '',
    ten_khach_hang: '',
    dia_chi_giao: '',
    so_dien_thoai: '',
    nhan_vien: staffName,
    trang_thai: 'Chờ xuất',
    ghi_chu: '',
    chi_tiet: [createLine()]
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
  const [searchText, setSearchText] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Omit<ShippingOrder, 'id'>>(emptyForm('', currentUser?.name || ''));

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [orderRes, customerRes, productRes] = await Promise.all([
        fetch('/api/lenh-xuat-hang'),
        fetch('/api/khach-hang'),
        fetch('/api/san-pham?format=table')
      ]);
      const orderData = await orderRes.json().catch(() => ({}));
      const customerData = await customerRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      if (!orderRes.ok) throw new Error(orderData.error || 'Không thể tải lệnh xuất hàng.');
      if (!customerRes.ok) throw new Error(customerData.error || 'Không thể tải khách hàng.');
      setOrders(normalizeShippingOrders(orderData));
      setCustomers(normalizeCustomerDetails(customerData));
      setProducts(normalizeOrderProducts(productData));
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
        `${order.ma_lenh} ${order.ten_khach_hang} ${order.ma_khach_hang} ${order.dia_chi_giao} ${order.trang_thai}`
          .toLowerCase()
          .includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [orders, searchText, selectedStatus]);

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
    setForm({
      ma_lenh: order.ma_lenh,
      ngay_xuat: order.ngay_xuat,
      ma_khach_hang: order.ma_khach_hang,
      ten_khach_hang: order.ten_khach_hang,
      dia_chi_giao: order.dia_chi_giao,
      so_dien_thoai: order.so_dien_thoai,
      nhan_vien: order.nhan_vien,
      trang_thai: order.trang_thai || 'Chờ xuất',
      ghi_chu: order.ghi_chu,
      chi_tiet: order.chi_tiet.length > 0 ? order.chi_tiet.map(line => createLine(line)) : [createLine()]
    });
    setFormOpen(true);
    setError('');
  };

  useEffect(() => {
    if (!formOpen || editingId || form.nhan_vien.trim() || !currentUser?.name?.trim()) return;
    setForm(prev => ({ ...prev, nhan_vien: currentUser.name.trim() }));
  }, [currentUser?.name, editingId, form.nhan_vien, formOpen]);

  const selectCustomer = (customerName: string) => {
    const customer =
      customers.find(item => item.name === customerName || item.code === customerName || item.id === customerName) ||
      null;
    setForm(prev => ({
      ...prev,
      ma_khach_hang: customer?.code || '',
      ten_khach_hang: customer?.name || customerName,
      dia_chi_giao: customer?.dia_chi || prev.dia_chi_giao,
      so_dien_thoai: customer?.so_dien_thoai || prev.so_dien_thoai
    }));
  };

  const updateLine = (lineId: string, patch: Partial<ShippingOrderLine>) => {
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
    if (!form.ngay_xuat.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày xuất.'));
      return;
    }
    const lines = form.chi_tiet.filter(line => line.ma_sp.trim() || line.ten_sp.trim() || line.so_luong > 0);
    if (lines.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một dòng hàng xuất.'));
      return;
    }
    for (const line of lines) {
      if (!line.ma_sp.trim() && !line.ten_sp.trim()) {
        setError(showSaveFailure('Mỗi dòng cần có mã SP hoặc tên SP.'));
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
        ...form,
        ma_lenh: form.ma_lenh.trim() || generateNextShippingCode(orders.map(order => order.ma_lenh)),
        chi_tiet: lines.map(line => ({
          ma_sp: line.ma_sp.trim(),
          ten_sp: line.ten_sp.trim(),
          don_vi: line.don_vi.trim(),
          so_luong: line.so_luong,
          don_gia: line.don_gia,
          tong_tien: line.tong_tien
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
      showAppToast(editingId ? 'Đã cập nhật lệnh xuất hàng.' : 'Đã tạo lệnh xuất hàng.');
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
          <BackButton onClick={onBack} />
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
          placeholder="Tìm mã lệnh, khách hàng, địa chỉ..."
          disabled={isLoading}
        />

        <FilterCombobox
          label="Trạng thái"
          options={[...STATUS_OPTIONS]}
          value={selectedStatus}
          onChange={setSelectedStatus}
          compact
          searchable={false}
          dropdownWidth="w-full"
        />
      </TableToolbar>

      <TableShell
        minWidthClassName="min-w-[920px]"
      >
        <TableHead>
          <TableHeadCell>Mã lệnh</TableHeadCell>
          <TableHeadCell>Ngày xuất</TableHeadCell>
          <TableHeadCell>Khách hàng</TableHeadCell>
          <TableHeadCell>Địa chỉ giao</TableHeadCell>
          <TableHeadCell align="center">SL SP</TableHeadCell>
          <TableHeadCell>Trạng thái</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredOrders.map(order => {
            const qty = order.chi_tiet.reduce((sum, line) => sum + (line.so_luong || 0), 0);
            return (
              <React.Fragment key={order.id || order.ma_lenh}>
                <TableRow>
                  <td className="px-4 py-3 font-mono font-black text-sky-800">{order.ma_lenh || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-700">
                    {formatDateVi(order.ngay_xuat)}
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
            <TableEmptyRow colSpan={7}>Chưa có lệnh xuất hàng.</TableEmptyRow>
          )}
        </TableBody>
      </TableShell>

      {formOpen ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="flex h-[96dvh] max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                  {editingId ? 'Sửa lệnh xuất hàng' : 'Thêm lệnh xuất hàng'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Khách hàng lấy từ danh mục /khach-hang
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
              >
                Đóng
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Mã lệnh</span>
                  <input value={form.ma_lenh} readOnly className={`${orderFieldClass} bg-slate-50`} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ngày xuất *</span>
                  <input
                    type="date"
                    value={form.ngay_xuat}
                    onChange={event => setForm(prev => ({ ...prev, ngay_xuat: event.target.value }))}
                    className={orderFieldClass}
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Khách hàng *
                  </span>
                  <SimpleSelect
                    value={form.ten_khach_hang}
                    options={customers}
                    onChange={selectCustomer}
                    placeholder="Chọn khách hàng"
                    getValue={item => (item as CustomerDetail).name}
                    getLabel={item => {
                      const customer = item as CustomerDetail;
                      return customer.code ? `${customer.code} · ${customer.name}` : customer.name;
                    }}
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Địa chỉ giao
                  </span>
                  <input
                    value={form.dia_chi_giao}
                    onChange={event => setForm(prev => ({ ...prev, dia_chi_giao: event.target.value }))}
                    className={orderFieldClass}
                    placeholder="Địa chỉ giao hàng"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Số điện thoại
                  </span>
                  <input
                    value={form.so_dien_thoai}
                    onChange={event => setForm(prev => ({ ...prev, so_dien_thoai: event.target.value }))}
                    className={orderFieldClass}
                    placeholder="SĐT liên hệ"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Trạng thái
                  </span>
                  <SimpleSelect
                    value={form.trang_thai}
                    options={[...STATUS_OPTIONS]}
                    onChange={status => setForm(prev => ({ ...prev, trang_thai: status }))}
                    placeholder="Chọn trạng thái"
                    getValue={item => String(item)}
                    getLabel={item => String(item)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Nhân viên
                  </span>
                  <input
                    value={form.nhan_vien}
                    onChange={event => setForm(prev => ({ ...prev, nhan_vien: event.target.value }))}
                    className={orderFieldClass}
                    placeholder="Người lập / phụ trách"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ghi chú</span>
                  <input
                    value={form.ghi_chu}
                    onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))}
                    className={orderFieldClass}
                    placeholder="Ghi chú thêm"
                  />
                </label>
              </div>

              <RepeatableLinesBlock
                title="Chi tiết hàng xuất"
                required
                showColumnHeaders
                gridTemplateClass={lineGridClass}
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
                          onChange={event =>
                            updateLine(line.id, { so_luong: Number(event.target.value) || 0 })
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
                            updateLine(line.id, { don_gia: Number(event.target.value) || 0 })
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
                      {form.chi_tiet.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm(prev => ({
                              ...prev,
                              chi_tiet: prev.chi_tiet.filter(item => item.id !== line.id)
                            }))
                          }
                          title="Xóa dòng"
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
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
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
        </div>
      ) : null}
    </div>
  );
}
