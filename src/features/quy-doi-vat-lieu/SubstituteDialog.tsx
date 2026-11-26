import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  normalizeProductCodeKey,
  parseProductNplItems,
  productNplItemsToJson,
  type ProductNplItem
} from '../san-pham/types';
import { formatConversionMaterial, type ConversionMaterialOption } from './materials';

type ProductOption = {
  id: string;
  code: string;
  name: string;
  items: ProductNplItem[];
};

function toNumber(value: string): number {
  return Number(String(value ?? '').trim().replace(',', '.'));
}

/**
 * Từ phiếu Cắt Lõi: gắn vật tư đích (vd ONG-30CM) làm «Vật tư thay thế» của một thành phần sản phẩm,
 * hoặc thêm mới thành phần vào sản phẩm khi sản phẩm chưa có.
 */
export function SubstituteDialog({
  materialCode,
  material,
  onClose
}: {
  materialCode: string;
  material: ConversionMaterialOption | undefined;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState<'substitute' | 'new'>('substitute');
  const [componentKey, setComponentKey] = useState('');
  const [subQty, setSubQty] = useState('2');
  const [componentQty, setComponentQty] = useState('1');
  const [newQty, setNewQty] = useState('1');

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/san-pham?format=table', { signal: controller.signal });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Không tải được danh sách sản phẩm.');
        const list: ProductOption[] = (Array.isArray(data.products) ? data.products : [])
          .filter((row: any) => row && !String(row.id ?? '').startsWith('nvl-'))
          .map((row: any) => ({
            id: String(row.id),
            code: String(row.ma_sp ?? '').trim(),
            name: String(row.ten_sp ?? '').trim(),
            items: parseProductNplItems(row.npl_phan_tram)
          }))
          .filter((row: ProductOption) => row.code);
        if (!controller.signal.aborted) setProducts(list);
      } catch (e: any) {
        if (!controller.signal.aborted) setError(e?.message || 'Không tải được danh sách sản phẩm.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? products.filter(p => `${p.code} ${p.name}`.toLowerCase().includes(q))
      : products;
    return list.slice(0, 100);
  }, [products, productSearch]);

  const product = products.find(p => p.id === productId);
  const components = product?.items ?? [];
  const alreadyComponent = product?.items.some(
    item => normalizeProductCodeKey(item.code) === normalizeProductCodeKey(materialCode)
  );
  const selectedComponent = components.find((item, index) => `${index}|${item.code}` === componentKey);

  const save = async () => {
    if (!product) {
      setError('Chọn sản phẩm.');
      return;
    }
    let next: ProductNplItem[];
    if (mode === 'substitute') {
      if (!selectedComponent) {
        setError('Chọn thành phần cần thay thế.');
        return;
      }
      const a = toNumber(subQty);
      const b = toNumber(componentQty);
      if (!(a > 0) || !(b > 0)) {
        setError('Số lượng quy đổi phải > 0.');
        return;
      }
      if (normalizeProductCodeKey(selectedComponent.code) === normalizeProductCodeKey(materialCode)) {
        setError('Vật tư thay thế trùng chính thành phần.');
        return;
      }
      next = product.items.map(item => {
        if (item !== selectedComponent) return item;
        const others = (item.substitutes ?? []).filter(
          sub => normalizeProductCodeKey(sub.code) !== normalizeProductCodeKey(materialCode)
        );
        return {
          ...item,
          substitutes: [
            ...others,
            {
              code: materialCode,
              name: material?.name ?? '',
              unit: material?.unit ?? '',
              quantity: a,
              componentQuantity: b
            }
          ]
        };
      });
    } else {
      if (alreadyComponent) {
        setError('Sản phẩm đã có thành phần này.');
        return;
      }
      const q = toNumber(newQty);
      if (!(q >= 0) || !Number.isFinite(q)) {
        setError('Số lượng phải ≥ 0.');
        return;
      }
      next = [
        ...product.items,
        {
          code: materialCode,
          name: material?.name ?? '',
          amountType: 'quantity',
          percent: null,
          quantity: q,
          unit: material?.unit || 'Cái',
          weightKg: null,
          substitutes: []
        }
      ];
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/san-pham/${encodeURIComponent(product.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npl_phan_tram: productNplItemsToJson(next) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Không lưu được thành phần.');
      setProducts(list => list.map(p => (p.id === product.id ? { ...p, items: next } : p)));
      setMessage(
        mode === 'substitute'
          ? `Đã gắn ${materialCode} làm vật tư thay thế cho ${selectedComponent?.code}.`
          : `Đã thêm ${materialCode} vào thành phần của ${product.code}.`
      );
    } catch (e: any) {
      setError(e?.message || 'Không lưu được thành phần.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-3">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Vật tư thay thế / thêm thành phần</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Vật tư: <b>{material ? formatConversionMaterial(material) : materialCode}</b>
          </p>
        </div>
        <div className="space-y-3 p-4 text-sm">
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
          {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{message}</p>}
          <label className="block space-y-1">
            <span className="text-xs font-bold uppercase text-slate-500">Sản phẩm</span>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder={loading ? 'Đang tải…' : 'Gõ mã hoặc tên sản phẩm…'}
              className={field}
            />
            <select
              value={productId}
              onChange={e => {
                setProductId(e.target.value);
                setComponentKey('');
                setMessage('');
              }}
              size={5}
              className="w-full rounded-md border border-slate-200 bg-white text-sm"
            >
              {filtered.map(p => (
                <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
              ))}
            </select>
          </label>
          {product && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['substitute', 'Thay thế thành phần có sẵn'],
                  ['new', 'Thêm mới thành phần']
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setMode(value); setMessage(''); setError(''); }}
                    className={`h-9 rounded-md border px-2 text-xs font-bold ${
                      mode === value ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-200 text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'substitute' ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs font-bold uppercase text-slate-500">Thành phần của {product.code}</span>
                    <select value={componentKey} onChange={e => setComponentKey(e.target.value)} className={field}>
                      <option value="">— chọn thành phần —</option>
                      {components.map((item, index) => (
                        <option key={`${index}|${item.code}`} value={`${index}|${item.code}`}>
                          {item.code}{item.name ? ` · ${item.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {components.length === 0 && (
                    <p className="text-xs text-amber-700">Sản phẩm chưa có thành phần — dùng «Thêm mới thành phần».</p>
                  )}
                  <div className="flex items-center gap-2">
                    <input value={subQty} onChange={e => setSubQty(e.target.value)} inputMode="decimal" className={`${field} w-20 text-right`} />
                    <span className="text-xs font-semibold">{materialCode} =</span>
                    <input value={componentQty} onChange={e => setComponentQty(e.target.value)} inputMode="decimal" className={`${field} w-20 text-right`} />
                    <span className="text-xs font-semibold">{selectedComponent?.code || 'thành phần'}</span>
                  </div>
                </>
              ) : (
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase text-slate-500">Số lượng {materialCode} / 1 SP</span>
                  <input value={newQty} onChange={e => setNewQty(e.target.value)} inputMode="decimal" className={field} />
                  {alreadyComponent && <p className="text-xs text-amber-700">Sản phẩm đã có thành phần này.</p>}
                </label>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
            Đóng
          </button>
          <button
            type="button"
            disabled={saving || !product}
            onClick={() => void save()}
            className="h-9 rounded-md bg-red-600 px-4 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
