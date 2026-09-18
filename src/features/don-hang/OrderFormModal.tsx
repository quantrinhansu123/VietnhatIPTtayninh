import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { RepeatableLineRow, RepeatableLinesBlock } from '../../components/RepeatableLinesBlock';
import { DateInput } from '../../components/shared/DateInput';
import { SearchableSelect, SimpleSelect } from '../../components/shared/SearchableSelect';
import {
  ORDER_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_DEFAULT,
  orderFieldClass,
  normalizeOrderProducts,
  findOrderProductByCode,
  resolveOrderProductFields,
  readUnitSuggestions,
  saveUnitSuggestion,
  type OrderProductOption,
  type StaffOption,
  type CustomerOption
} from '../_shared/orderHelpers';
import { type OrderRow } from '../_shared/orderRecordHelpers';
import { normalizeDaNangBusinessStaffOptions, normalizeCustomerOptions } from '../khach-hang';
import {
  emptyOrderForm,
  generateNextOrderCode,
  newOrderProductFormLine,
  normalizeOrders,
  orderProductLinesToPayload,
  orderToForm,
  type OrderFormState,
  type OrderProductFormLine
} from './index';

const orderProductGridClass =
  'grid-cols-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_5rem_5rem_minmax(0,1.1fr)_2.5rem]';

export function OrderFormModal({
  open,
  mode,
  editingOrder = null,
  existingOrderCodes = [],
  defaultCreatedAt = '',
  zIndexClassName = 'z-[70]',
  onClose,
  onSaved
}: {
  open: boolean;
  mode: 'add' | 'edit';
  editingOrder?: OrderRow | null;
  existingOrderCodes?: string[];
  /** Prefill ngày tạo (dùng khi mở từ lệnh SX). */
  defaultCreatedAt?: string;
  zIndexClassName?: string;
  onClose: () => void;
  onSaved: (order: OrderRow) => void | Promise<void>;
}) {
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrderForm);
  const [formError, setFormError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [productOptions, setProductOptions] = useState<OrderProductOption[]>([]);

  useEffect(() => {
    if (!open) return;

    setFormError('');
    setLookupError('');
    if (mode === 'edit' && editingOrder) {
      setOrderForm(orderToForm(editingOrder));
    } else {
      const createdAt = defaultCreatedAt.trim() || new Date().toISOString().slice(0, 10);
      setOrderForm({
        ...emptyOrderForm(),
        orderCode: generateNextOrderCode(existingOrderCodes),
        createdAt
      });
    }
  }, [defaultCreatedAt, editingOrder, existingOrderCodes, mode, open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadLookups = async () => {
      setIsLoadingLookups(true);
      setLookupError('');

      try {
        const [staffRes, customerRes, productRes] = await Promise.all([
          fetch('/api/nhan-su?format=groups&scope=all'),
          fetch('/api/khach-hang'),
          fetch('/api/san-pham?format=table')
        ]);

        const staffData = await staffRes.json().catch(() => ({}));
        const customerData = await customerRes.json().catch(() => ({}));
        const productData = await productRes.json().catch(() => ({}));

        if (!staffRes.ok) throw new Error(staffData.error || 'Không thể tải nhân sự.');
        if (!customerRes.ok) throw new Error(customerData.error || 'Không thể tải khách hàng.');
        if (!productRes.ok) throw new Error(productData.error || 'Không thể tải hàng hóa.');

        if (!cancelled) {
          setStaffOptions(normalizeDaNangBusinessStaffOptions(staffData));
          setCustomerOptions(normalizeCustomerOptions(customerData));
          setProductOptions(normalizeOrderProducts(productData));
        }
      } catch (error: any) {
        if (!cancelled) {
          setStaffOptions([]);
          setCustomerOptions([]);
          setProductOptions([]);
          setLookupError(error.message || 'Không thể tải dữ liệu tham chiếu.');
        }
      } finally {
        if (!cancelled) setIsLoadingLookups(false);
      }
    };

    void loadLookups();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const unitSuggestions = useMemo(() => {
    const fromProducts = productOptions.map(product => product.unit).filter(Boolean);
    return [...new Set([...fromProducts, ...readUnitSuggestions()])].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [productOptions]);

  const updateProductLine = (key: string, patch: Partial<OrderProductFormLine>) => {
    setOrderForm(prev => ({
      ...prev,
      productLines: prev.productLines.map(line => (line.key === key ? { ...line, ...patch } : line))
    }));
  };

  const pickOrderProduct = (key: string, productCode: string) => {
    const resolved = resolveOrderProductFields(productOptions, productCode, {});
    const match = findOrderProductByCode(productOptions, productCode);
    updateProductLine(key, {
      productCode,
      productName: resolved.productName,
      unit: resolved.unit || match?.unit || ''
    });
  };

  const handleSaveOrder = async () => {
    if (!orderForm.orderCode.trim()) {
      setFormError('Vui lòng nhập mã đơn hàng.');
      return;
    }
    if (!orderForm.createdAt.trim()) {
      setFormError('Vui lòng chọn ngày tạo.');
      return;
    }
    if (!orderForm.customer.trim()) {
      setFormError('Vui lòng chọn khách hàng từ danh mục.');
      return;
    }

    const products = orderProductLinesToPayload(orderForm.productLines, productOptions);
    if (products.length === 0) {
      setFormError('Vui lòng thêm ít nhất một sản phẩm.');
      return;
    }

    for (const product of products) {
      if (!product.ma_sp && !product.ten_sp) {
        setFormError('Mỗi dòng sản phẩm cần có mã SP hoặc tên SP.');
        return;
      }
      if (!product.so_luong || product.so_luong <= 0) {
        setFormError(`Số lượng phải lớn hơn 0 cho sản phẩm ${product.ma_sp || product.ten_sp}.`);
        return;
      }
    }

    const payload = {
      orderCode: orderForm.orderCode.trim(),
      orderType: orderForm.orderType,
      staffName: orderForm.staffName,
      customer: orderForm.customer,
      products,
      note: orderForm.note,
      status: orderForm.status,
      createdAt: orderForm.createdAt
    };

    setIsSavingOrder(true);
    setFormError('');

    try {
      const isEdit = mode === 'edit' && editingOrder?.id;
      const res = await fetch(isEdit ? `/api/don-hang/${editingOrder.id}` : '/api/don-hang', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || (isEdit ? 'Không thể cập nhật đơn hàng.' : 'Không thể thêm đơn hàng mới.'));
      }

      orderForm.productLines.forEach(line => {
        if (line.unit.trim()) saveUnitSuggestion(line.unit.trim());
      });

      const savedOrder = normalizeOrders({ orders: data.order ? [data.order] : [] })[0];
      if (!savedOrder) {
        throw new Error('Đã lưu đơn nhưng không đọc lại được dữ liệu vừa tạo.');
      }

      await onSaved(savedOrder);
      onClose();
    } catch (error: any) {
      setFormError(error.message || 'Không thể lưu đơn hàng.');
    } finally {
      setIsSavingOrder(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-zinc-950/40 p-3 backdrop-blur-sm sm:p-4`}
    >
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              {mode === 'edit' ? 'Sửa đơn hàng' : 'Thêm đơn hàng mới'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>
        {(formError || lookupError) && (
          <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
            {formError || lookupError}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 p-4">
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã đơn *</span>
              <input
                value={orderForm.orderCode}
                onChange={e => setOrderForm(prev => ({ ...prev, orderCode: e.target.value }))}
                className={orderFieldClass}
                placeholder="DH001"
              />
              {mode === 'add' ? (
                <p className="text-[11px] font-semibold text-zinc-400">
                  Mã tự tăng theo thứ tự DH001, DH002, DH003...
                </p>
              ) : null}
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày tạo *</span>
              <DateInput
                value={orderForm.createdAt}
                onChange={createdAt => setOrderForm(prev => ({ ...prev, createdAt }))}
                required
                className={orderFieldClass}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Loại đơn</span>
              <SearchableSelect
                value={orderForm.orderType}
                onChange={orderType => setOrderForm(prev => ({ ...prev, orderType }))}
                options={[...ORDER_TYPE_OPTIONS]}
                placeholder="Gõ để tìm loại đơn"
                getLabel={item => String(item)}
                getValue={item => String(item)}
                allowEmpty={false}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Trạng thái</span>
              {mode === 'add' ? (
                <input
                  value={ORDER_STATUS_DEFAULT}
                  readOnly
                  className={`${orderFieldClass} bg-amber-50 font-black text-amber-800`}
                />
              ) : (
                <SearchableSelect
                  value={orderForm.status}
                  onChange={status => setOrderForm(prev => ({ ...prev, status }))}
                  options={[...ORDER_STATUS_OPTIONS]}
                  placeholder="Gõ để tìm trạng thái"
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  allowEmpty={false}
                />
              )}
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Nhân viên</span>
              <SearchableSelect
                value={orderForm.staffName}
                onChange={staffName => setOrderForm(prev => ({ ...prev, staffName }))}
                options={staffOptions}
                placeholder="Chọn hoặc nhập tên nhân viên"
                searchPlaceholder="Tìm / nhập nhân viên..."
                isLoading={isLoadingLookups}
                allowCustomValue
                getValue={item => (item as StaffOption).name}
                getLabel={item => (item as StaffOption).name}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Khách hàng *</span>
              <SimpleSelect
                value={orderForm.customer}
                onChange={customer => setOrderForm(prev => ({ ...prev, customer }))}
                options={customerOptions}
                placeholder="Gõ mã hoặc tên khách hàng"
                isLoading={isLoadingLookups}
                getValue={item => (item as CustomerOption).name}
                getLabel={item => {
                  const customer = item as CustomerOption;
                  return customer.code ? `${customer.code} · ${customer.name}` : customer.name;
                }}
              />
              {!isLoadingLookups && customerOptions.length === 0 ? (
                <span className="block text-[11px] font-semibold text-amber-700">
                  Chưa có khách hàng trong danh mục /khach-hang.
                </span>
              ) : null}
            </label>
            <label className="col-span-2 space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ghi chú</span>
              <textarea
                value={orderForm.note}
                onChange={e => setOrderForm(prev => ({ ...prev, note: e.target.value }))}
                className={`${orderFieldClass} min-h-24 resize-y py-2.5`}
                placeholder="Nhập ghi chú cho đơn hàng"
              />
            </label>

            <RepeatableLinesBlock
              className="col-span-2"
              title="Sản phẩm"
              required
              showColumnHeaders
              gridTemplateClass={orderProductGridClass}
              onAdd={() =>
                setOrderForm(prev => ({
                  ...prev,
                  productLines: [...prev.productLines, newOrderProductFormLine()]
                }))
              }
              addButtonClassName="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-100"
              columns={[
                { key: 'code', label: 'Mã SP', required: true },
                { key: 'name', label: 'Tên SP' },
                { key: 'unit', label: 'ĐVT' },
                { key: 'qty', label: 'SL', required: true },
                { key: 'note', label: 'Ghi chú' },
                { key: 'actions', label: '' }
              ]}
            >
              {orderForm.productLines.map(line => {
                const matchedLineProduct = findOrderProductByCode(productOptions, line.productCode);
                return (
                  <RepeatableLineRow key={line.key} gridTemplateClass={orderProductGridClass}>
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <SearchableSelect
                        value={line.productCode}
                        onChange={productCode => pickOrderProduct(line.key, productCode)}
                        options={productOptions}
                        placeholder="Gõ để tìm mã SP"
                        isLoading={isLoadingLookups}
                        inputClassName={orderFieldClass}
                        openUpward
                        matchDropdownWidth
                        getValue={item => (item as OrderProductOption).code}
                        getSearchText={item => {
                          const product = item as OrderProductOption;
                          return `${product.code} ${product.newCode} ${product.name}`;
                        }}
                        getLabel={item => {
                          const product = item as OrderProductOption;
                          return `${product.code} · ${product.name}`;
                        }}
                        resolveSelectedItem={(options, value) =>
                          findOrderProductByCode(options as OrderProductOption[], value)
                        }
                      />
                    </div>
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <input
                        value={matchedLineProduct ? matchedLineProduct.name : line.productName}
                        readOnly={Boolean(matchedLineProduct)}
                        onChange={e => updateProductLine(line.key, { productName: e.target.value })}
                        className={`${orderFieldClass} ${matchedLineProduct ? 'bg-zinc-50 text-zinc-800' : 'bg-white'}`}
                        placeholder={matchedLineProduct ? '' : 'Tự động theo mã SP'}
                      />
                    </div>
                    <div className="col-span-1 min-w-0">
                      <input
                        list="order-form-modal-unit-suggestions"
                        value={line.unit}
                        onChange={e => updateProductLine(line.key, { unit: e.target.value })}
                        onBlur={e => {
                          const trimmed = e.target.value.trim();
                          if (trimmed) saveUnitSuggestion(trimmed);
                        }}
                        className={`${orderFieldClass} bg-white`}
                        placeholder="ĐVT"
                      />
                    </div>
                    <div className="col-span-1 min-w-0">
                      <input
                        type="number"
                        value={line.quantity}
                        onChange={e => updateProductLine(line.key, { quantity: e.target.value })}
                        className={`${orderFieldClass} bg-white`}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <input
                        value={line.note}
                        onChange={e => updateProductLine(line.key, { note: e.target.value })}
                        className={`${orderFieldClass} bg-white`}
                        placeholder="Ghi chú dòng"
                      />
                    </div>
                    {orderForm.productLines.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setOrderForm(prev => ({
                            ...prev,
                            productLines: prev.productLines.filter(item => item.key !== line.key)
                          }))
                        }
                        title="Xóa dòng"
                        className="col-span-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 md:col-span-1 md:h-10 md:w-10"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="text-xs font-bold md:hidden">Xóa dòng này</span>
                      </button>
                    ) : null}
                  </RepeatableLineRow>
                );
              })}
            </RepeatableLinesBlock>

            <datalist id="order-form-modal-unit-suggestions">
              {unitSuggestions.map(unit => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void handleSaveOrder()}
            disabled={isSavingOrder}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSavingOrder ? 'Đang lưu...' : mode === 'edit' ? 'Cập nhật' : 'Lưu đơn'}
          </button>
        </div>
      </div>
    </div>
  );
}
