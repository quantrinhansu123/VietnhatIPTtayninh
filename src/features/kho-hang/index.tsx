import { useEffect, useMemo, useState } from 'react';
import { useTabAccess } from '../../app/useTabAccess';
import { FilterCombobox } from '../../components/shared/table';
import { MaterialsInventoryPanel } from '../kho-nvl';
import { ProductsPanel } from '../san-pham';

export type InventoryCatalogKind = 'materials' | 'products';
type InventoryMovementKind = 'nvl' | 'san_pham' | 'tai_che' | 'hang_hong' | 'hang_hoa' | 'cong_cu_dung_cu' | 'gia_cong';

export type InventoryBalanceRow = {
  ma: string;
  ten: string;
  don_vi: string;
  ten_kho: string;
  ton_dau_ky: number;
  nhap_trong_ky: number;
  xuat_trong_ky: number;
  ton_cuoi_ky: number;
};

export function normalizeWarehouseName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function warehouseCatalogKind(name: string): InventoryCatalogKind {
  const normalized = normalizeWarehouseName(name);
  return normalized.includes('san pham') || normalized.includes('thanh pham') || normalized.includes('hang hoa')
    ? 'products'
    : 'materials';
}

function warehouseMovementKind(name: string): InventoryMovementKind {
  const normalized = normalizeWarehouseName(name);
  if (normalized.includes('san pham') || normalized.includes('thanh pham')) return 'san_pham';
  if (normalized.includes('tai che')) return 'tai_che';
  if (normalized.includes('hang hong')) return 'hang_hong';
  if (normalized.includes('hang hoa')) return 'hang_hoa';
  if (normalized.includes('cong cu') || normalized.includes('dung cu')) return 'cong_cu_dung_cu';
  if (normalized.includes('gia cong')) return 'gia_cong';
  return 'nvl';
}

export function isDefaultWarehouse(name: string, kind: InventoryCatalogKind) {
  const normalized = normalizeWarehouseName(name);
  return kind === 'products'
    ? normalized === 'kho san pham' || normalized === 'kho thanh pham'
    : normalized === 'kho nvl' || normalized === 'kho nguyen vat lieu';
}

/** Kho chuẩn luôn có trong dropdown (kể cả khi chưa có dòng trong quan_ly_kho). */
export const STANDARD_WAREHOUSE_NAMES = [
  'Kho NVL',
  'Kho thành phẩm',
  'Kho sản phẩm',
  'Kho hàng hóa',
  'Kho tái chế',
  'Kho hàng hỏng',
  'Kho công cụ dụng cụ',
  'Kho gia công'
] as const;

/** Gộp kho từ API + kho chuẩn; giữ tên đã có trên DB, bổ sung thiếu. */
export function ensureStandardWarehouses(names: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const name = String(raw ?? '').trim();
    if (!name) return;
    const key = normalizeWarehouseName(name);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(name);
  };

  for (const name of names) push(name);
  for (const name of STANDARD_WAREHOUSE_NAMES) push(name);
  return result;
}

/** Khớp tên kho khi lọc danh mục: alias kho mặc định (SP↔thành phẩm, NVL↔nguyên vật liệu) + chưa gán kho. */
export function matchesWarehouseFilter(
  warehouse: string,
  warehouseFilter: string,
  options: { includeUnassigned?: boolean; skipFilter?: boolean } = {}
) {
  if (!warehouseFilter || options.skipFilter) return true;
  const value = String(warehouse ?? '').trim();
  const filter = String(warehouseFilter ?? '').trim();
  const isUnassigned = !value || value === '-';
  if (value === filter) return true;
  // So khớp không phân biệt hoa thường / dấu (tránh lệch Unicode tên kho).
  if (normalizeWarehouseName(value) === normalizeWarehouseName(filter)) return true;
  if (options.includeUnassigned && isUnassigned) return true;
  if (options.includeUnassigned) {
    const kind = warehouseCatalogKind(filter);
    if (isDefaultWarehouse(filter, kind) && isDefaultWarehouse(value, kind)) return true;
  }
  return false;
}

function mapBalanceRecords(
  records: unknown[],
  fallbackWarehouse = ''
): InventoryBalanceRow[] {
  return records
    .map((record: unknown) => {
      const row = (record && typeof record === 'object' ? record : {}) as Record<string, unknown>;
      return {
        ma: String(row.ma ?? '').trim(),
        ten: String(row.ten ?? '').trim(),
        don_vi: String(row.don_vi ?? '').trim(),
        ten_kho: String(row.ten_kho ?? '').trim() || fallbackWarehouse,
        ton_dau_ky: Number(row.ton_dau_ky) || 0,
        nhap_trong_ky: Number(row.nhap_trong_ky) || 0,
        xuat_trong_ky: Number(row.xuat_trong_ky) || 0,
        ton_cuoi_ky: Number(row.ton_cuoi_ky) || 0
      };
    })
    .filter(record => Boolean(record.ma));
}

async function fetchTonKhoBalances(options: {
  loaiKho: string;
  asOfDate: string;
  tenKho?: string;
  signal: AbortSignal;
}): Promise<InventoryBalanceRow[]> {
  const params = new URLSearchParams({
    loai_kho: options.loaiKho,
    to: options.asOfDate
  });
  if (options.tenKho) params.set('ten_kho', options.tenKho);
  const response = await fetch(`/api/ton-kho/tong-hop?${params.toString()}`, {
    signal: options.signal
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể tính tồn kho đến ngày đã chọn.');
  return mapBalanceRecords(
    Array.isArray(data?.records) ? data.records : [],
    options.tenKho || ''
  );
}

/** /kho-hang: một danh mục theo kho đang chọn (không chồng NVL + SP). */
export function InventoryCatalogPanel({ onBack }: { onBack: () => void }) {
  const materialsAccess = useTabAccess('materials');
  const productsAccess = useTabAccess('products');
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [asOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balanceRows, setBalanceRows] = useState<InventoryBalanceRow[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const response = await fetch('/api/quan-ly-kho');
        const data = await response.json().catch(() => ({}));
        const records: Array<{ ten_kho?: string }> =
          response.ok && Array.isArray(data?.records) ? data.records : [];
        setWarehouses(
          ensureStandardWarehouses(
            Array.from(new Set(records.map(record => String(record.ten_kho ?? '').trim()).filter(Boolean)))
          )
        );
      } catch {
        setWarehouses(ensureStandardWarehouses([]));
      }
    };
    void loadWarehouses();
  }, []);

  const accessibleWarehouses = useMemo(() => {
    if (!materialsAccess.canView && !productsAccess.canView) return [];
    if (materialsAccess.canView && productsAccess.canView) return warehouses;
    return warehouses.filter(name => {
      const catalogKind = warehouseCatalogKind(name);
      return catalogKind === 'products' ? productsAccess.canView : materialsAccess.canView;
    });
  }, [materialsAccess.canView, productsAccess.canView, warehouses]);

  const selectedWarehouseName = String(selectedWarehouse ?? '').trim();

  const kind: InventoryCatalogKind = selectedWarehouseName
    ? warehouseCatalogKind(selectedWarehouseName)
    : materialsAccess.canView
      ? 'materials'
      : 'products';

  const handleWarehouseChange = (name: string) => {
    const next = String(name ?? '').trim();
    // Không dùng "Tất cả" — luôn chọn một kho cụ thể.
    if (!next || next === 'all') return;
    setSelectedWarehouse(next);
  };

  const handleProductsWarehouseReassigned = (name: string) => {
    const next = String(name ?? '').trim();
    if (!next) return;
    setSelectedWarehouse(next);
  };

  useEffect(() => {
    if (!accessibleWarehouses.length) {
      setSelectedWarehouse('');
      return;
    }
    if (!selectedWarehouseName || !accessibleWarehouses.includes(selectedWarehouseName)) {
      setSelectedWarehouse(accessibleWarehouses[0]);
    }
  }, [accessibleWarehouses, selectedWarehouseName]);

  useEffect(() => {
    if (!asOfDate || !selectedWarehouseName) {
      setBalanceRows([]);
      setBalanceError('');
      setIsLoadingBalances(false);
      return;
    }

    const controller = new AbortController();
    const loadBalances = async () => {
      setBalanceError('');
      setIsLoadingBalances(true);
      try {
        const loaiKho =
          kind === 'products' ? 'san_pham' : warehouseMovementKind(selectedWarehouseName);
        // Không siết ten_kho: danh mục vẫn hiện dù cột Kho chưa khớp tên đang chọn.
        const rows = await fetchTonKhoBalances({
          loaiKho,
          asOfDate,
          signal: controller.signal
        });
        setBalanceRows(rows);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setBalanceRows([]);
        setBalanceError(error instanceof Error ? error.message : 'Không thể tính tồn kho đến ngày đã chọn.');
      } finally {
        setIsLoadingBalances(false);
      }
    };
    void loadBalances();
    return () => controller.abort();
  }, [asOfDate, kind, selectedWarehouseName]);

  if (!materialsAccess.canView && !productsAccess.canView) return null;

  if (!selectedWarehouseName) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <FilterCombobox
          label="Kho"
          options={accessibleWarehouses}
          value={selectedWarehouse}
          onChange={handleWarehouseChange}
          formatOption={value => value}
          includeAll={false}
          searchPlaceholder="Tìm kho..."
        />
      </div>
    );
  }

  const warehouseControls = (
    <>
      <FilterCombobox
        label="Kho"
        options={accessibleWarehouses}
        value={selectedWarehouse}
        onChange={handleWarehouseChange}
        formatOption={value => value}
        includeAll={false}
        searchPlaceholder="Tìm kho..."
      />
      {isLoadingBalances ? (
        <span className="shrink-0 text-xs font-bold text-zinc-500">Đang tính tồn...</span>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      {balanceError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {balanceError}
        </p>
      ) : null}

      {kind === 'materials' ? (
        materialsAccess.canView ? (
          <MaterialsInventoryPanel
            onBack={onBack}
            warehouseFilter=""
            includeUnassigned
            asOfDate={asOfDate}
            balanceRows={balanceRows}
            topControls={warehouseControls}
          />
        ) : null
      ) : productsAccess.canView ? (
        <ProductsPanel
          onBack={onBack}
          hideQrColumn
          warehouseFilter=""
          includeUnassigned
          asOfDate={asOfDate}
          balanceRows={balanceRows}
          topControls={warehouseControls}
          onWarehouseReassigned={handleProductsWarehouseReassigned}
        />
      ) : null}
    </div>
  );
}
