import { useEffect, useMemo, useState } from 'react';
import { useTabAccess } from '../../app/useTabAccess';
import { FilterCombobox, TableDateFilter } from '../../components/shared/table';
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

export function InventoryCatalogPanel({ onBack }: { onBack: () => void }) {
  const materialsAccess = useTabAccess('materials');
  const productsAccess = useTabAccess('products');
  const [warehouses, setWarehouses] = useState<string[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balanceRows, setBalanceRows] = useState<InventoryBalanceRow[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const response = await fetch('/api/quan-ly-kho');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const records: Array<{ ten_kho?: string }> = Array.isArray(data?.records) ? data.records : [];
        setWarehouses(Array.from(new Set(records.map(record => String(record.ten_kho ?? '').trim()).filter(Boolean))));
      } catch {
        setWarehouses([]);
      }
    };
    void loadWarehouses();
  }, []);

  const accessibleWarehouses = useMemo(
    () => warehouses.filter(name => {
      const kind = warehouseCatalogKind(name);
      return kind === 'products' ? productsAccess.canView : materialsAccess.canView;
    }),
    [materialsAccess.canView, productsAccess.canView, warehouses]
  );

  const kind = selectedWarehouse
    ? warehouseCatalogKind(selectedWarehouse)
    : materialsAccess.canView
      ? 'materials'
      : 'products';

  useEffect(() => {
    if (!accessibleWarehouses.includes(selectedWarehouse)) {
      setSelectedWarehouse(accessibleWarehouses[0] || '');
    }
  }, [accessibleWarehouses, selectedWarehouse]);

  useEffect(() => {
    if (!selectedWarehouse || !asOfDate) {
      setBalanceRows([]);
      setBalanceError('');
      setIsLoadingBalances(false);
      return;
    }

    const controller = new AbortController();
    const loadBalances = async () => {
      setBalanceRows([]);
      setBalanceError('');
      setIsLoadingBalances(true);
      try {
        const params = new URLSearchParams({
          loai_kho: warehouseMovementKind(selectedWarehouse),
          to: asOfDate
        });
        // Luôn lọc tại database theo đúng kho đang chọn. Không gộp dữ liệu
        // không gán kho hoặc kho alias vào kho hiện tại.
        params.set('ten_kho', selectedWarehouse);
        const response = await fetch(`/api/ton-kho/tong-hop?${params.toString()}`, {
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Không thể tính tồn kho đến ngày đã chọn.');
        const records = Array.isArray(data?.records) ? data.records : [];
        setBalanceRows(records.map((record: Record<string, unknown>) => ({
          ma: String(record.ma ?? '').trim(),
          ten: String(record.ten ?? '').trim(),
          don_vi: String(record.don_vi ?? '').trim(),
          ten_kho: String(record.ten_kho ?? '').trim() || selectedWarehouse,
          ton_dau_ky: Number(record.ton_dau_ky) || 0,
          nhap_trong_ky: Number(record.nhap_trong_ky) || 0,
          xuat_trong_ky: Number(record.xuat_trong_ky) || 0,
          ton_cuoi_ky: Number(record.ton_cuoi_ky) || 0
        })).filter((record: InventoryBalanceRow) => Boolean(record.ma)));
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
  }, [asOfDate, kind, selectedWarehouse]);

  if (!materialsAccess.canView && !productsAccess.canView) return null;

  return (
    <div className="space-y-4">
      {balanceError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {balanceError}
        </p>
      ) : null}

      {!selectedWarehouse ? (
        <div className="flex flex-wrap items-center gap-3">
          <FilterCombobox
            label="Kho"
            options={accessibleWarehouses}
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
            formatOption={value => value}
            includeAll={false}
            searchPlaceholder="Tìm kho..."
          />
        </div>
      ) : kind === 'materials' ? (
        <MaterialsInventoryPanel
          onBack={onBack}
          warehouseFilter={selectedWarehouse}
          includeUnassigned
          asOfDate={asOfDate}
          balanceRows={balanceRows}
          topControls={
            <>
              <FilterCombobox
                label="Kho"
                options={accessibleWarehouses}
                value={selectedWarehouse}
                onChange={setSelectedWarehouse}
                formatOption={value => value}
                includeAll={false}
                searchPlaceholder="Tìm kho..."
              />
              <TableDateFilter label="Chọn ngày" value={asOfDate} onChange={setAsOfDate} />
              {isLoadingBalances ? (
                <span className="shrink-0 text-xs font-bold text-zinc-500">Đang tính tồn...</span>
              ) : null}
            </>
          }
        />
      ) : (
        <ProductsPanel
          onBack={onBack}
          warehouseFilter={selectedWarehouse}
          includeUnassigned
          asOfDate={asOfDate}
          balanceRows={balanceRows}
          topControls={
            <>
              <FilterCombobox
                label="Kho"
                options={accessibleWarehouses}
                value={selectedWarehouse}
                onChange={setSelectedWarehouse}
                formatOption={value => value}
                includeAll={false}
                searchPlaceholder="Tìm kho..."
              />
              <TableDateFilter label="Chọn ngày" value={asOfDate} onChange={setAsOfDate} />
              {isLoadingBalances ? (
                <span className="shrink-0 text-xs font-bold text-zinc-500">Đang tính tồn...</span>
              ) : null}
            </>
          }
        />
      )}
    </div>
  );
}
