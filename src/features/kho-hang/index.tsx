import { useEffect, useState } from 'react';
import { useTabAccess } from '../../app/useTabAccess';
import { MaterialsInventoryPanel } from '../kho-nvl';
import { ProductsPanel } from '../san-pham';

export type InventoryCatalogKind = 'materials' | 'products';

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

async function fetchTonKhoBalances(
  loaiKho: string,
  asOfDate: string,
  signal: AbortSignal
): Promise<InventoryBalanceRow[]> {
  const params = new URLSearchParams({ loai_kho: loaiKho, to: asOfDate });
  const response = await fetch(`/api/ton-kho/tong-hop?${params.toString()}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể tính tồn kho đến ngày đã chọn.');
  return mapBalanceRecords(Array.isArray(data?.records) ? data.records : []);
}

/** /kho-hang: hiện full NVL + SP, không lọc theo kho. */
export function InventoryCatalogPanel({ onBack }: { onBack: () => void }) {
  const materialsAccess = useTabAccess('materials');
  const productsAccess = useTabAccess('products');
  const [asOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [materialBalances, setMaterialBalances] = useState<InventoryBalanceRow[]>([]);
  const [productBalances, setProductBalances] = useState<InventoryBalanceRow[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    if (!asOfDate) {
      setMaterialBalances([]);
      setProductBalances([]);
      setBalanceError('');
      setIsLoadingBalances(false);
      return;
    }

    const controller = new AbortController();
    const loadBalances = async () => {
      setBalanceError('');
      setIsLoadingBalances(true);
      try {
        const tasks: Array<Promise<void>> = [];
        if (materialsAccess.canView) {
          tasks.push(
            fetchTonKhoBalances('nvl', asOfDate, controller.signal).then(rows => {
              setMaterialBalances(rows);
            })
          );
        } else {
          setMaterialBalances([]);
        }
        if (productsAccess.canView) {
          tasks.push(
            fetchTonKhoBalances('san_pham', asOfDate, controller.signal).then(rows => {
              setProductBalances(rows);
            })
          );
        } else {
          setProductBalances([]);
        }
        await Promise.all(tasks);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMaterialBalances([]);
        setProductBalances([]);
        setBalanceError(error instanceof Error ? error.message : 'Không thể tính tồn kho đến ngày đã chọn.');
      } finally {
        setIsLoadingBalances(false);
      }
    };
    void loadBalances();
    return () => controller.abort();
  }, [asOfDate, materialsAccess.canView, productsAccess.canView]);

  if (!materialsAccess.canView && !productsAccess.canView) return null;

  const loadingHint = isLoadingBalances ? (
    <span className="shrink-0 text-xs font-bold text-zinc-500">Đang tính tồn...</span>
  ) : null;

  return (
    <div className="space-y-6">
      {balanceError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {balanceError}
        </p>
      ) : null}

      {materialsAccess.canView ? (
        <MaterialsInventoryPanel
          onBack={onBack}
          warehouseFilter=""
          includeUnassigned
          asOfDate={asOfDate}
          balanceRows={materialBalances}
          topControls={loadingHint}
        />
      ) : null}

      {productsAccess.canView ? (
        <ProductsPanel
          onBack={onBack}
          warehouseFilter=""
          includeUnassigned
          asOfDate={asOfDate}
          balanceRows={productBalances}
          topControls={loadingHint}
        />
      ) : null}
    </div>
  );
}
