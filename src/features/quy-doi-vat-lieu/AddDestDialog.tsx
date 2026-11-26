import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, X } from 'lucide-react';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { parsePercentInput } from '../../utils';
import { productFieldClass } from '../san-pham/productFieldClass';
import {
  findMaterialOptionByCode,
  normalizeProductCodeKey,
  parseProductNplItems,
  productNplItemsToJson,
  type MaterialOption,
  type ProductNplItem
} from '../san-pham/types';
import {
  formatConversionMaterial,
  formatDraftNumber,
  inferUnitLengthCm,
  materialSpecs,
  type ConversionMaterialOption
} from './materials';

type ProductOption = {
  id: string;
  code: string;
  name: string;
  items: ProductNplItem[];
};

type TubeMode = 'existing' | 'create';

export type AddDestResult = {
  code: string;
  dinhMuc: string;
  /** Chiều dài đích (cm) — gợi ý, user có thể sửa. */
  chieuDai: string;
  productCode: string;
  productName: string;
  /** Đã POST tạo mới vào Kho NVL trong lần này. */
  createdInKho: boolean;
};

/**
 * Modal «Thêm đích»:
 * - Chọn ống đã có trong Kho NVL, hoặc **tạo mã ống mới** (chưa có Kho NVL)
 * - Gắn thành phần vào SP (chưa có trong BOM)
 * - Đổ mã/ĐM vào phiếu cắt lõi
 */
export function AddDestDialog({
  materials,
  materialsLoading,
  sourceCode,
  sourceLengthCm,
  suggestedDinhMucFor,
  onClose,
  onAdded
}: {
  materials: ConversionMaterialOption[];
  materialsLoading: boolean;
  sourceCode?: string;
  sourceLengthCm?: number | null;
  suggestedDinhMucFor?: (code: string) => number | null;
  onClose: () => void;
  onAdded: (result: AddDestResult) => void;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [tubeMode, setTubeMode] = useState<TubeMode>('create');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [amountValue, setAmountValue] = useState('1');
  const [unit, setUnit] = useState('Cái');
  const [unitLength, setUnitLength] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [dinhMuc, setDinhMuc] = useState('');

  const materialOptions: MaterialOption[] = useMemo(
    () =>
      materials
        .filter(item => /^ong[-_\s.]/i.test(item.code.trim()))
        .map(item => ({
          code: item.code,
          name: item.name,
          unit: item.unit,
          totalWeight: item.unitWeight != null ? String(item.unitWeight) : undefined
        })),
    [materials]
  );
  const materialByCode = useMemo(() => new Map(materials.map(item => [item.code, item])), [materials]);
  const codeInCatalog = Boolean(
    code.trim() &&
      (materialByCode.has(code.trim()) || findMaterialOptionByCode(materialOptions, code.trim()))
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [spRes, khoRes] = await Promise.all([
          fetch('/api/san-pham?format=table', { signal: controller.signal }),
          fetch('/api/quan-ly-kho', { signal: controller.signal })
        ]);
        const [spData, khoData] = await Promise.all([
          spRes.json().catch(() => ({})),
          khoRes.json().catch(() => ({}))
        ]);
        if (controller.signal.aborted) return;
        if (!spRes.ok || spData.error) throw new Error(spData.error || 'Không tải được danh sách sản phẩm.');
        const list: ProductOption[] = (Array.isArray(spData.products) ? spData.products : [])
          .filter((row: { id?: unknown }) => row && !String(row.id ?? '').startsWith('nvl-'))
          .map((row: { id?: unknown; ma_sp?: unknown; ten_sp?: unknown; npl_phan_tram?: unknown }) => ({
            id: String(row.id ?? ''),
            code: String(row.ma_sp ?? '').trim(),
            name: String(row.ten_sp ?? '').trim(),
            items: parseProductNplItems(row.npl_phan_tram)
          }))
          .filter((row: ProductOption) => row.code);
        setProducts(list);

        const records: Array<{ ten_kho?: string }> = Array.isArray(khoData?.records) ? khoData.records : [];
        const khoNames = Array.from(
          new Set(records.map(r => String(r.ten_kho ?? '').trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, 'vi'));
        setWarehouses(khoNames);
        const preferred =
          khoNames.find(name => /nvl/i.test(name)) ||
          khoNames.find(name => /nguyên/i.test(name)) ||
          khoNames[0] ||
          '';
        setWarehouse(prev => prev || preferred);
      } catch (e: unknown) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Không tải được danh sách sản phẩm.');
        }
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
  const destMaterial = materialByCode.get(code.trim()) || materialByCode.get(
    findMaterialOptionByCode(materialOptions, code.trim())?.code || ''
  );
  const destSpecs = materialSpecs(destMaterial);
  const alreadyComponent = product?.items.some(
    item => normalizeProductCodeKey(item.code) === normalizeProductCodeKey(code)
  );

  const applySuggestedDinhMuc = (nextCode: string, lengthCm: number | null) => {
    const suggested = suggestedDinhMucFor?.(nextCode);
    if (suggested != null && suggested > 0) {
      setDinhMuc(formatDraftNumber(suggested));
      return;
    }
    if (sourceLengthCm != null && sourceLengthCm > 0 && lengthCm != null && lengthCm > 0) {
      const dm = Math.floor(sourceLengthCm / lengthCm + 1e-9);
      if (dm >= 1) setDinhMuc(formatDraftNumber(dm));
    }
  };

  const pickMaterial = (nextCode: string) => {
    setCode(nextCode);
    const material = findMaterialOptionByCode(materialOptions, nextCode);
    if (material) {
      setName(material.name);
      if (material.unit && material.unit !== '-') setUnit(material.unit);
      const specs = materialSpecs(materialByCode.get(material.code));
      setUnitLength(specs.unitLength != null ? formatDraftNumber(specs.unitLength) : '');
      setTotalWeight(specs.unitWeight != null ? formatDraftNumber(specs.unitWeight) : '');
      applySuggestedDinhMuc(material.code, specs.unitLength);
    } else {
      applySuggestedDinhMuc(nextCode, inferUnitLengthCm(nextCode));
    }
  };

  const onCreateCodeChange = (raw: string) => {
    setCode(raw);
    setName(raw.trim());
    const inferred = inferUnitLengthCm(raw);
    if (inferred != null && !unitLength.trim()) {
      setUnitLength(formatDraftNumber(inferred));
    }
    applySuggestedDinhMuc(raw, inferred ?? parsePercentInput(unitLength));
  };

  const save = async () => {
    if (!product) {
      setError('Chọn sản phẩm (SP) mà ống đích thuộc về.');
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError(tubeMode === 'create' ? 'Nhập mã ống đích mới.' : 'Chọn mã ống đích.');
      return;
    }
    if (!/^ong/i.test(trimmedCode)) {
      setError('Mã ống đích phải bắt đầu bằng ONG…');
      return;
    }
    const trimmedName = name.trim() || trimmedCode;
    const qty = parsePercentInput(amountValue);
    if (!Number.isFinite(qty) || qty < 0) {
      setError('Số lượng thành phần phải ≥ 0.');
      return;
    }
    const dm = Number(String(dinhMuc).trim().replace(',', '.'));
    if (!(dm > 0) || !Number.isFinite(dm)) {
      setError('ĐM cắt (SL đích / 1 cái gốc) phải > 0.');
      return;
    }

    const needCreateKho = tubeMode === 'create' || !codeInCatalog;
    let lengthForCreate = parsePercentInput(unitLength);
    if (lengthForCreate == null || !(lengthForCreate > 0)) {
      lengthForCreate = inferUnitLengthCm(trimmedCode, trimmedName);
    }
    if (needCreateKho) {
      if (lengthForCreate == null || !(lengthForCreate > 0)) {
        setError('Nhập chiều dài đơn vị (cm) cho ống mới.');
        return;
      }
      const weight = parsePercentInput(totalWeight);
      if (weight == null || !(weight >= 0)) {
        setError('Nhập TL / cái (kg) cho ống mới.');
        return;
      }
      if (!warehouse.trim()) {
        setError('Chọn kho lưu trữ cho ống mới.');
        return;
      }
    }

    if (alreadyComponent && !needCreateKho) {
      setError(
        `SP ${product.code} đã có thành phần ${trimmedCode}. Có thể đóng và chọn mã này trên bảng, hoặc chọn mã khác.`
      );
      return;
    }

    const resolvedUnit = unit.trim() || 'Cái';
    let createdInKho = false;
    let savedCode = trimmedCode;

    setSaving(true);
    setError('');
    try {
      if (needCreateKho) {
        const khoRes = await fetch('/api/kho-nvl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: trimmedCode,
            name: trimmedName,
            unit: resolvedUnit,
            warehouse: warehouse.trim(),
            totalWeight: String(parsePercentInput(totalWeight) ?? ''),
            unitLength: String(lengthForCreate)
          })
        });
        const khoData = await khoRes.json().catch(() => ({}));
        if (!khoRes.ok || khoData.error) {
          const msg = String(khoData.error || 'Không tạo được mã trong Kho NVL.');
          // Trùng mã → coi như đã có, tiếp tục gắn SP.
          if (!/duplicate|unique|đã tồn tại|trùng/i.test(msg)) {
            throw new Error(msg);
          }
        } else {
          createdInKho = true;
          const createdMa = String(khoData.material?.ma_npl ?? '').trim();
          if (createdMa) savedCode = createdMa;
        }
      }

      if (!alreadyComponent) {
        const nextItem: ProductNplItem = {
          code: savedCode,
          name: trimmedName,
          amountType: 'quantity',
          percent: null,
          quantity: qty,
          unit: resolvedUnit,
          weightKg: null,
          substitutes: []
        };
        const nextItems = [...product.items, nextItem];
        const res = await fetch(`/api/san-pham/${encodeURIComponent(product.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ npl_phan_tram: productNplItemsToJson(nextItems) })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không lưu được thành phần SP.');
      }

      onAdded({
        code: savedCode,
        dinhMuc: formatDraftNumber(dm),
        chieuDai: unitLength.trim() || formatDraftNumber(destSpecs.unitLength) || '',
        productCode: product.code,
        productName: product.name,
        createdInKho
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Không lưu được ống đích.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-950">Thêm ống đích · SP</h3>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Tạo mã mới vào Kho NVL (nếu chưa có) + gắn thành phần SP + đổ vào phiếu.
              {sourceCode ? ` Gốc: ${sourceCode}.` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mx-4 mt-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Sản phẩm (SP) *</span>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder={loading ? 'Đang tải…' : 'Gõ mã hoặc tên sản phẩm…'}
              className={productFieldClass}
            />
            <select
              value={productId}
              onChange={e => {
                setProductId(e.target.value);
                setError('');
              }}
              size={5}
              className="w-full rounded-lg border border-slate-200 bg-white text-sm"
            >
              {filtered.map(p => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
            {product ? (
              <p className="text-[11px] text-slate-600">
                Đã chọn: <b>{product.code}</b>
                {product.name ? ` · ${product.name}` : ''} · {product.items.length} thành phần
              </p>
            ) : null}
          </label>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['create', 'Thêm mã mới (chưa có Kho NVL)'],
                ['existing', 'Chọn mã đã có trong Kho NVL']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTubeMode(value);
                  setError('');
                  if (value === 'create') {
                    setCode('');
                    setName('');
                    setUnitLength('');
                    setTotalWeight('');
                  }
                }}
                className={`h-10 rounded-lg border px-2 text-[11px] font-extrabold transition ${
                  tubeMode === value
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tubeMode === 'existing' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã ống đích *</span>
              <SearchableSelect
                value={code}
                onChange={pickMaterial}
                options={materialOptions}
                placeholder={materialsLoading ? 'Đang tải Kho NVL…' : 'Gõ mã ONG-…'}
                preferValueMatch
                isLoading={materialsLoading}
                disabled={materialsLoading}
                inputClassName={productFieldClass}
                getLabel={item => {
                  const material = item as MaterialOption;
                  return `${material.code} · ${material.name}`;
                }}
                getValue={item => (item as MaterialOption).code}
              />
              {destMaterial?.name ? (
                <p className="text-[11px] text-slate-500">Tên: {destMaterial.name}</p>
              ) : null}
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Mã / tên ống đích *</span>
              <input
                value={code}
                onChange={e => onCreateCodeChange(e.target.value)}
                className={productFieldClass}
                placeholder="VD: ONG-35CM"
              />
              {codeInCatalog ? (
                <p className="text-[11px] text-amber-700">Mã này đã có trong Kho NVL — sẽ chỉ gắn vào SP (không tạo trùng).</p>
              ) : (
                <p className="text-[11px] text-slate-500">Một ô: dùng làm mã và tên khi tạo Kho NVL + thành phần SP.</p>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Số lượng / 1 SP *</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountValue}
                onChange={e => setAmountValue(e.target.value)}
                className={productFieldClass}
                placeholder="VD: 1"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Đơn vị</span>
              <input
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className={productFieldClass}
                placeholder="Cái"
              />
            </label>
          </div>

          {(tubeMode === 'create' || !codeInCatalog) && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">
                Thông số tạo Kho NVL
              </p>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">TL / cái (kg) *</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalWeight}
                  onChange={e => setTotalWeight(e.target.value)}
                  className={productFieldClass}
                  placeholder="VD: 0,096"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Kho lưu trữ *</span>
                {warehouses.length > 0 ? (
                  <select
                    value={warehouse}
                    onChange={e => setWarehouse(e.target.value)}
                    className={productFieldClass}
                  >
                    <option value="">— chọn kho —</option>
                    {warehouses.map(item => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={warehouse}
                    onChange={e => setWarehouse(e.target.value)}
                    className={productFieldClass}
                    placeholder="VD: Kho NVL"
                  />
                )}
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500" title="SL đích cắt từ 1 cái gốc">
                ĐM cắt * (gợi ý)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={dinhMuc}
                onChange={e => setDinhMuc(e.target.value)}
                className={productFieldClass}
                placeholder="VD: 4"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Chiều dài (cm) (gợi ý)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={unitLength}
                onChange={e => {
                  setUnitLength(e.target.value);
                  applySuggestedDinhMuc(code, parsePercentInput(e.target.value));
                }}
                className={productFieldClass}
                placeholder="VD: 30"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            ĐM và chiều dài chỉ là gợi ý — sửa được vì một SP có thể có nhiều ống đích khác nhau.
          </p>

          {destMaterial && tubeMode === 'existing' ? (
            <p className="text-[11px] text-slate-500">
              Ống: <b>{formatConversionMaterial(destMaterial)}</b>
            </p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void save()}
            className="inline-flex h-10 min-w-[12rem] items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Đang lưu…' : loading ? 'Đang tải…' : 'Tạo NVL + gắn SP + phiếu'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
