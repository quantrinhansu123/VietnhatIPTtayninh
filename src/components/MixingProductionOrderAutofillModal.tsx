import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Search } from 'lucide-react';
import type { MixingRoundItem } from './MixingReportForm';
import {
  buildMixingProductionOrderProductCandidates,
  buildMixingRoundItemsFromProductCandidates,
  filterMixingProductionOrders,
  type MixingCatalogProduct,
  type MixingProductionOrder
} from '../utils/mixingOrderAutofill';

export default function MixingProductionOrderAutofillModal({
  open,
  roundLabel,
  orders,
  catalogProducts,
  materials,
  filters,
  machines,
  onClose,
  onApply
}: {
  open: boolean;
  roundLabel: string;
  orders: MixingProductionOrder[];
  catalogProducts: MixingCatalogProduct[];
  materials: Array<{ code: string; name: string; unit: string }>;
  filters: { ngay: string; ca: string; maMay: string; tenMay: string };
  machines: Array<{ code: string; name: string }>;
  onClose: () => void;
  onApply: (items: MixingRoundItem[]) => void;
}) {
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderCodes, setSelectedOrderCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setOrderSearch('');
      setSelectedOrderCodes([]);
    }
  }, [open]);

  const matchedOrders = useMemo(
    () => filterMixingProductionOrders(orders, filters, machines),
    [orders, filters, machines]
  );

  const filtersReady = Boolean(filters.ca.trim() && (filters.maMay.trim() || filters.tenMay.trim()));

  const orderOptions = useMemo(() => {
    const normalized = orderSearch.trim().toLowerCase();
    return matchedOrders
      .filter(order => order.productLines.some(line => line.productCode.trim()))
      .filter(order => {
        if (!normalized) return true;
        const products = order.productLines.map(line => `${line.productCode} ${line.productName}`).join(' ');
        return `${order.orderCode} ${order.machine} ${products}`.toLowerCase().includes(normalized);
      })
      .sort((a, b) => a.orderCode.localeCompare(b.orderCode, 'vi'));
  }, [matchedOrders, orderSearch]);

  const productCandidates = useMemo(
    () => buildMixingProductionOrderProductCandidates(matchedOrders, selectedOrderCodes, catalogProducts),
    [matchedOrders, selectedOrderCodes, catalogProducts]
  );

  const toggleOrderCode = (orderCode: string) => {
    setSelectedOrderCodes(prev => {
      const isSelected = prev.includes(orderCode);
      if (isSelected) {
        return prev.filter(code => code !== orderCode);
      }
      return [...prev, orderCode];
    });
  };

  const visibleOrderCodes = orderOptions.map(order => order.orderCode);
  const allVisibleOrdersSelected =
    visibleOrderCodes.length > 0 && visibleOrderCodes.every(code => selectedOrderCodes.includes(code));

  const toggleAllVisibleOrders = () => {
    if (allVisibleOrdersSelected) {
      const visibleCodeSet = new Set(visibleOrderCodes);
      setSelectedOrderCodes(prev => prev.filter(code => !visibleCodeSet.has(code)));
      return;
    }

    setSelectedOrderCodes(Array.from(new Set([...selectedOrderCodes, ...visibleOrderCodes])));
  };

  const handleApply = () => {
    if (productCandidates.length === 0) return;
    const items = buildMixingRoundItemsFromProductCandidates(
      productCandidates,
      productCandidates.map(item => item.key),
      materials
    );
    onApply(items);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h4 className="text-sm font-black uppercase tracking-wider text-zinc-950">
              Nguyên liệu theo Lệnh sản xuất · {roundLabel}
            </h4>
            <p className="mt-0.5 text-xs font-semibold text-zinc-500">
              Chỉ gợi ý lệnh SX trùng ngày · ca · máy đang nhập
              {filters.ca.trim() && (filters.maMay.trim() || filters.tenMay.trim())
                ? ` (${filters.ca}${filters.maMay ? ` · ${filters.maMay}` : filters.tenMay ? ` · ${filters.tenMay}` : ''})`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            Đóng
          </button>
        </div>

        {!filtersReady ? (
          <div className="p-6 text-center text-sm font-bold text-zinc-500">
            Vui lòng chọn đủ ca và máy ở phần thông tin phía trên trước khi lấy NVL theo Lệnh sản xuất.
          </div>
        ) : matchedOrders.length === 0 ? (
          <div className="p-6 text-center text-sm font-bold text-zinc-500">
            Không có lệnh sản xuất phù hợp ngày · ca · máy đang chọn.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
                  <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                  <input
                    value={orderSearch}
                    onChange={event => setOrderSearch(event.target.value)}
                    placeholder="Tìm mã lệnh SX, máy, mã SP..."
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                  />
              </label>
              <button
                type="button"
                onClick={toggleAllVisibleOrders}
                disabled={orderOptions.length === 0}
                className="h-8 shrink-0 rounded-lg border border-[#ef1b2d]/25 bg-red-50 px-2.5 text-[11px] font-black text-[#ef1b2d] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {allVisibleOrdersSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>

            <div className="max-h-[28vh] overflow-y-auto p-4">
              {orderOptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm font-bold text-zinc-400">
                  Không có lệnh SX phù hợp.
                </div>
              ) : (
                <div className="space-y-2">
                  {orderOptions.map(order => {
                    const checked = selectedOrderCodes.includes(order.orderCode);
                    return (
                      <label
                        key={order.id}
                        className={`block cursor-pointer rounded-xl border p-3 transition ${
                          checked ? 'border-[#ef1b2d]/35 bg-red-50' : 'border-zinc-200 bg-white hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOrderCode(order.orderCode)}
                            className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#ef1b2d] focus:ring-[#ef1b2d]/20"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-zinc-950">{order.orderCode || '-'}</span>
                              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-black text-zinc-600">
                                {order.productLines.length} SP
                              </span>
                              <span className="text-xs font-semibold text-zinc-500">{order.machine || '-'}</span>
                            </div>
                            <p className="mt-1 text-xs font-semibold leading-5 text-zinc-600">
                              {order.productLines
                                .map(line => `${line.productCode}${line.productName ? ` · ${line.productName}` : ''}`)
                                .join(' | ')}
                            </p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3">
          <span className="text-xs font-bold text-zinc-500">
            Đã chọn {selectedOrderCodes.length} lệnh · {productCandidates.length} SP
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={productCandidates.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ClipboardCheck className="h-4 w-4" />
              Điền vào {roundLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
