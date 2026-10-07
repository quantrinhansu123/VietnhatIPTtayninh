import React, { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  findOrderProductByCode,
  orderFieldClass,
  type OrderProductOption
} from '../../features/_shared/orderHelpers';

export function SearchableProductCodeField({
  value,
  onChange,
  products,
  isLoading,
  onSelectProduct
}: {
  value: string;
  onChange: (value: string) => void;
  products: OrderProductOption[];
  isLoading?: boolean;
  onSelectProduct: (product: OrderProductOption | null) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filteredProducts = useMemo(() => {
    const normalized = query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
    if (!normalized) return products.slice(0, 40);
    const fold = (value: string) =>
      value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const codeMatches = products.filter(product =>
      fold(`${product.code} ${product.newCode}`).includes(normalized)
    );
    const codeSet = new Set(codeMatches);
    const nameMatches = products.filter(
      product => !codeSet.has(product) && fold(product.name).includes(normalized)
    );
    return [...codeMatches, ...nameMatches].slice(0, 40);
  }, [products, query]);

  const commitCode = (nextCode: string) => {
    const trimmed = nextCode.trim();
    onChange(trimmed);
    onSelectProduct(findOrderProductByCode(products, trimmed));
    setQuery(trimmed);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 w-full">
      <input
        value={query}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            commitCode(query);
          }, 120);
        }}
        disabled={isLoading}
        placeholder={isLoading ? 'Đang tải hàng hóa...' : 'Gõ để tìm mã hàng'}
        className={orderFieldClass}
      />
      {open && !isLoading && filteredProducts.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {filteredProducts.map(product => (
            <button
              key={`${product.code}-${product.name}`}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => commitCode(product.code || product.newCode)}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-red-50"
            >
              <span className="text-sm font-black text-zinc-900">
                {product.code || product.newCode || '—'}
              </span>
              <span className="text-xs font-semibold text-zinc-500">{product.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

