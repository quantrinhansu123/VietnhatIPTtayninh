import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../app/useTabAccess';
import { RowActionsMenu } from './shared/table';
import { SearchableSelect } from './shared/SearchableSelect';
import {
  normalizeMixingProductionOrders,
  type MixingProductionOrder
} from '../utils/mixingOrderAutofill';
import { waitForPrintImagesReady } from '../utils/printReady';
import {
  MixingNormRatioPrintBatch,
  toPrintDoc,
  type MixingNormRatioPrintDoc
} from './MixingNormRatioPrintSheet';
import { getProductionShiftOptions, normalizeShiftSettings, resolveShiftName } from '../utils/shiftSettings';

export type MixingNormLine = {
  ma_nvl: string;
  ten_nvl: string;
  gia_tri: number | null;
  don_vi: string;
  /** kg — %: tong_tl × giá trị / 100; đơn vị kg: = giá trị */
  khoi_luong: number | null;
};

export type MixingNormProduct = {
  ma_sp: string;
  ten_sp: string;
  tong_trong_luong: number | null;
  ghi_chu: string;
  chi_tiet: MixingNormLine[];
};

export type MixingNormRow = {
  id: string;
  ngay: string;
  ca: string;
  ma_lenh_sx: string;
  ghi_chu: string;
  products: MixingNormProduct[];
  created_at?: string;
};

type MaterialOption = {
  code: string;
  name: string;
  unit: string;
};

type ProductOption = {
  code: string;
  name: string;
};

type LineForm = {
  key: string;
  maNvl: string;
  tenNvl: string;
  giaTri: string;
  donVi: 'kg' | '%';
};

type ProductForm = {
  key: string;
  maSp: string;
  tenSp: string;
  tongTrongLuong: string;
  ghiChu: string;
  lines: LineForm[];
};

type NormForm = {
  ngay: string;
  ca: string;
  maLenhSx: string;
  ghiChu: string;
  products: ProductForm[];
};

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const emptyLine = (): LineForm => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  maNvl: '',
  tenNvl: '',
  giaTri: '',
  donVi: 'kg'
});

const emptyProduct = (): ProductForm => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  maSp: '',
  tenSp: '',
  tongTrongLuong: '',
  ghiChu: '',
  lines: [emptyLine()]
});

const emptyForm = (): NormForm => ({
  ngay: new Date().toISOString().slice(0, 10),
  ca: '',
  maLenhSx: '',
  ghiChu: '',
  products: [emptyProduct()]
});

function productToForm(product: MixingNormProduct, idHint = ''): ProductForm {
  return {
    key: `${idHint}-${product.ma_sp}-${Math.random().toString(36).slice(2, 6)}`,
    maSp: product.ma_sp,
    tenSp: product.ten_sp,
    tongTrongLuong:
      product.tong_trong_luong === null || product.tong_trong_luong === undefined
        ? ''
        : String(product.tong_trong_luong),
    ghiChu: product.ghi_chu,
    lines:
      product.chi_tiet.length > 0
        ? product.chi_tiet.map(line => ({
            key: `${idHint}-${line.ma_nvl}-${Math.random().toString(36).slice(2, 6)}`,
            maNvl: line.ma_nvl,
            tenNvl: line.ten_nvl,
            giaTri: line.gia_tri === null || line.gia_tri === undefined ? '' : String(line.gia_tri),
            donVi: line.don_vi === '%' ? '%' : 'kg'
          }))
        : [emptyLine()]
  };
}

function normalizeMaterials(data: unknown): MaterialOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { materials?: unknown }).materials)
      ? (data as { materials: unknown[] }).materials
      : [];

  const mapped = rows
    .map((item): MaterialOption | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.ma_npl ?? row.ma_nvl ?? row.code ?? '').trim();
      const name = String(row.ten_npl ?? row.ten_nvl ?? row.name ?? '').trim();
      if (!code && !name) return null;
      const unitRaw = String(row.don_vi ?? 'kg').trim();
      return {
        code,
        name,
        unit: unitRaw === '%' ? '%' : 'kg'
      };
    })
    .filter((item): item is MaterialOption => Boolean(item));

  const byCode = new Map<string, MaterialOption>();
  for (const item of mapped) {
    if (!item.code) continue;
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

function normalizeCatalogProducts(data: unknown): ProductOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];

  const byCode = new Map<string, ProductOption>();
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const code = String(
      row.ma_sp ?? row.productCode ?? row.code ?? row.ma_hang ?? ''
    ).trim();
    const name = String(
      row.ten_sp ?? row.productName ?? row.name ?? row.ten_hang ?? ''
    ).trim();
    if (!code && !name) continue;
    const key = code || name;
    if (!byCode.has(key)) byCode.set(key, { code: code || name, name: name || code });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

function parseNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Khối lượng (kg): % → tổng TL × % / 100; kg → = giá trị. */
export function calcNvlKhoiLuong(
  tongTrongLuong: number | null,
  giaTri: number | null,
  donVi: string
): number | null {
  if (giaTri === null || !Number.isFinite(giaTri)) return null;
  if (String(donVi || '').trim() === '%') {
    if (tongTrongLuong === null || !Number.isFinite(tongTrongLuong)) return null;
    return (tongTrongLuong * giaTri) / 100;
  }
  return giaTri;
}

function formatKhoiLuongDisplay(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value)} kg`;
}

function normalizeLines(raw: unknown, tongTrongLuong: number | null = null): MixingNormLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): MixingNormLine | null => {
      if (!item || typeof item !== 'object') return null;
      const line = item as Record<string, unknown>;
      const ma_nvl = String(line.ma_nvl ?? '').trim();
      const ten_nvl = String(line.ten_nvl ?? '').trim();
      if (!ma_nvl && !ten_nvl) return null;
      const gia_tri = parseNumberOrNull(line.gia_tri ?? line.dinh_muc);
      const don_vi = String(line.don_vi ?? 'kg').trim() === '%' ? '%' : 'kg';
      const saved = parseNumberOrNull(line.khoi_luong ?? line.khoiLuong);
      return {
        ma_nvl,
        ten_nvl,
        gia_tri,
        don_vi,
        khoi_luong: saved ?? calcNvlKhoiLuong(tongTrongLuong, gia_tri, don_vi)
      };
    })
    .filter((line): line is MixingNormLine => Boolean(line));
}

/** NEW product block in chi_tiet: { ma_sp, nvl|chi_tiet } — not a flat NVL line. */
function looksLikeProductBlock(item: Record<string, unknown>): boolean {
  if (Array.isArray(item.nvl)) return true;
  if (Array.isArray(item.chi_tiet) && (item.ma_sp || item.ten_sp)) return true;
  const maSp = String(item.ma_sp ?? '').trim();
  const maNvl = String(item.ma_nvl ?? '').trim();
  return Boolean(maSp) && !maNvl;
}

function normalizeProductBlock(item: Record<string, unknown>): MixingNormProduct | null {
  const ma_sp = String(item.ma_sp ?? '').trim();
  const ten_sp = String(item.ten_sp ?? '').trim();
  const tong_trong_luong = parseNumberOrNull(item.tong_trong_luong);
  const nvlRaw = item.nvl ?? item.chi_tiet;
  const chi_tiet = normalizeLines(nvlRaw, tong_trong_luong);
  if (!ma_sp && !ten_sp && chi_tiet.length === 0) return null;
  return {
    ma_sp,
    ten_sp,
    tong_trong_luong,
    ghi_chu: String(item.ghi_chu ?? '').trim(),
    chi_tiet
  };
}

function normalizeRows(data: unknown): MixingNormRow[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
      ? (data as { records: unknown[] }).records
      : [];

  return rows
    .map((item): MixingNormRow | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').trim();
      if (!id) return null;

      const rawChiTiet = row.chi_tiet;
      let products: MixingNormProduct[] = [];

      if (Array.isArray(rawChiTiet) && rawChiTiet.length > 0) {
        const first = rawChiTiet[0];
        const isNewFormat =
          first && typeof first === 'object' && looksLikeProductBlock(first as Record<string, unknown>);

        if (isNewFormat) {
          products = rawChiTiet
            .map(entry =>
              entry && typeof entry === 'object'
                ? normalizeProductBlock(entry as Record<string, unknown>)
                : null
            )
            .filter((p): p is MixingNormProduct => Boolean(p));
        } else {
          // LEGACY: chi_tiet = flat NVL lines + row-level SP fields
          const tong_trong_luong = parseNumberOrNull(row.tong_trong_luong);
          let chi_tiet = normalizeLines(rawChiTiet, tong_trong_luong);
          if (chi_tiet.length === 0) {
            const ma = String(row.ma_nvl ?? '').trim();
            const ten = String(row.ten_nvl ?? '').trim();
            if (ma || ten) {
              const gia_tri = parseNumberOrNull(row.dinh_muc);
              const don_vi =
                String(row.don_vi_dinh_muc ?? 'kg').trim() === '%' ? '%' : 'kg';
              chi_tiet = [
                {
                  ma_nvl: ma,
                  ten_nvl: ten,
                  gia_tri,
                  don_vi,
                  khoi_luong: calcNvlKhoiLuong(tong_trong_luong, gia_tri, don_vi)
                }
              ];
            }
          }
          products = [
            {
              ma_sp: String(row.ma_sp ?? '').trim(),
              ten_sp: String(row.ten_sp ?? '').trim(),
              tong_trong_luong,
              ghi_chu: String(row.ghi_chu ?? '').trim(),
              chi_tiet
            }
          ];
        }
      } else {
        // Empty chi_tiet — still wrap legacy SP columns if present
        const ma_sp = String(row.ma_sp ?? '').trim();
        const ten_sp = String(row.ten_sp ?? '').trim();
        const tong_trong_luong = parseNumberOrNull(row.tong_trong_luong);
        const ma = String(row.ma_nvl ?? '').trim();
        const ten = String(row.ten_nvl ?? '').trim();
        const chi_tiet: MixingNormLine[] =
          ma || ten
            ? (() => {
                const gia_tri = parseNumberOrNull(row.dinh_muc);
                const don_vi =
                  String(row.don_vi_dinh_muc ?? 'kg').trim() === '%' ? '%' : 'kg';
                return [
                  {
                    ma_nvl: ma,
                    ten_nvl: ten,
                    gia_tri,
                    don_vi,
                    khoi_luong: calcNvlKhoiLuong(tong_trong_luong, gia_tri, don_vi)
                  }
                ];
              })()
            : [];
        if (ma_sp || ten_sp || chi_tiet.length > 0) {
          products = [
            {
              ma_sp,
              ten_sp,
              tong_trong_luong,
              ghi_chu: String(row.ghi_chu ?? '').trim(),
              chi_tiet
            }
          ];
        }
      }

      return {
        id,
        ngay: String(row.ngay ?? '').trim(),
        ca: String(row.ca ?? '').trim(),
        ma_lenh_sx: String(row.ma_lenh_sx ?? '').trim(),
        ghi_chu: String(row.ghi_chu ?? '').trim(),
        products,
        created_at: row.created_at ? String(row.created_at) : undefined
      };
    })
    .filter((row): row is MixingNormRow => Boolean(row));
}

function summarizeLines(lines: MixingNormLine[]) {
  if (lines.length === 0) return 'Chưa có NVL';
  return lines
    .map(line => {
      const name = line.ten_nvl || line.ma_nvl || 'NVL';
      const value =
        line.gia_tri === null || line.gia_tri === undefined ? '—' : `${line.gia_tri}${line.don_vi || ''}`;
      return `${name}: ${value}`;
    })
    .join(' · ');
}

function summarizeProductsNvl(products: MixingNormProduct[]) {
  if (products.length === 0) return '—';
  return products
    .map(product => {
      const label = product.ma_sp || product.ten_sp || 'SP';
      return `${label}: ${summarizeLines(product.chi_tiet)}`;
    })
    .join(' | ');
}

export default function MixingNormMaterialsTab() {
  const { canCreate, canEdit, canDelete } = useTabAccess('mixing-report-list');
  const [rows, setRows] = useState<MixingNormRow[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [productionOrders, setProductionOrders] = useState<MixingProductionOrder[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductOption[]>([]);
  const [shiftOptions, setShiftOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<NormForm>(emptyForm);
  const [printDocs, setPrintDocs] = useState<MixingNormRatioPrintDoc[]>([]);
  const [pendingPrint, setPendingPrint] = useState(false);

  const materialsByCode = useMemo(() => {
    const map = new Map<string, MaterialOption>();
    for (const item of materials) map.set(item.code, item);
    return map;
  }, [materials]);

  const selectedOrder = useMemo(() => {
    const needle = form.maLenhSx.trim().toLowerCase();
    if (!needle) return null;
    return (
      productionOrders.find(order => order.orderCode.trim().toLowerCase() === needle) ||
      productionOrders.find(order => order.orderCode.trim().toLowerCase().includes(needle)) ||
      null
    );
  }, [form.maLenhSx, productionOrders]);

  const productOptions = useMemo((): ProductOption[] => {
    const byCode = new Map<string, ProductOption>();
    const add = (code: string, name: string) => {
      const trimmedCode = code.trim();
      if (!trimmedCode) return;
      if (!byCode.has(trimmedCode)) {
        byCode.set(trimmedCode, { code: trimmedCode, name: name.trim() });
      }
    };

    if (selectedOrder) {
      for (const line of selectedOrder.productLines) {
        add(line.productCode, line.productName);
      }
    }

    if (byCode.size === 0) {
      for (const order of productionOrders) {
        for (const line of order.productLines) {
          add(line.productCode, line.productName);
        }
      }
      for (const product of catalogProducts) {
        add(product.code, product.name);
      }
    }

    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  }, [catalogProducts, productionOrders, selectedOrder]);

  const hasAnyProduct = form.products.some(product => product.maSp.trim());

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bang-tron-vat-tu-dinh-muc');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không tải được phiếu trộn định mức.');
      setRows(normalizeRows(data));
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Không tải được phiếu trộn định mức.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [materialRes, orderRes, productRes, settingRes] = await Promise.all([
        fetch('/api/kho-nvl'),
        fetch('/api/lenh-sx'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/cai-dat')
      ]);
      const materialData = await materialRes.json().catch(() => ({}));
      const orderData = await orderRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const settingData = await settingRes.json().catch(() => ({}));
      if (materialRes.ok) setMaterials(normalizeMaterials(materialData));
      if (orderRes.ok) setProductionOrders(normalizeMixingProductionOrders(orderData));
      if (productRes.ok) setCatalogProducts(normalizeCatalogProducts(productData));
      if (settingRes.ok) setShiftOptions(getProductionShiftOptions(normalizeShiftSettings(settingData)));
    } catch {
      // giữ partial data nếu một nguồn lỗi
    }
  }, []);

  useEffect(() => {
    void loadRows();
    void loadReferenceData();
  }, [loadRows, loadReferenceData]);

  useEffect(() => {
    if (printDocs.length === 0) return;
    document.body.classList.add('mixing-norm-ratio-print-active');
    return () => {
      document.body.classList.remove('mixing-norm-ratio-print-active');
    };
  }, [printDocs]);

  useEffect(() => {
    if (!pendingPrint || printDocs.length === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        window.print();
        setPendingPrint(false);
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingPrint, printDocs]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintDocs([]);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const spText = row.products
        .map(p => `${p.ma_sp} ${p.ten_sp} ${p.tong_trong_luong ?? ''} ${p.ghi_chu} ${summarizeLines(p.chi_tiet)}`)
        .join(' ');
      return `${row.ngay} ${row.ca} ${row.ma_lenh_sx} ${row.ghi_chu} ${spText}`.toLowerCase().includes(q);
    });
  }, [query, rows]);

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId('');
    setForm(emptyForm());
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const openEdit = (row: MixingNormRow) => {
    if (!canEdit) return;
    setEditingId(row.id);
    setForm({
      ngay: row.ngay || new Date().toISOString().slice(0, 10),
      ca: row.ca,
      maLenhSx: row.ma_lenh_sx,
      ghiChu: row.ghi_chu,
      products:
        row.products.length > 0
          ? row.products.map(product => productToForm(product, row.id))
          : [emptyProduct()]
    });
    setShowForm(true);
    setError('');
    setMessage('');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId('');
    setForm(emptyForm());
  };

  const selectOrder = (orderCode: string) => {
    setForm(prev => ({
      ...prev,
      maLenhSx: orderCode,
      // Tạo mới: đổi lệnh → reset SP. Đang sửa: giữ SP đã có.
      products: editingId
        ? prev.products
        : prev.products.map(product =>
            product.maSp.trim()
              ? product
              : { ...emptyProduct(), key: product.key }
          )
    }));
  };

  const updateProduct = (productKey: string, patch: Partial<ProductForm>) => {
    setForm(prev => ({
      ...prev,
      products: prev.products.map(product =>
        product.key === productKey ? { ...product, ...patch } : product
      )
    }));
  };

  const selectProductCode = (productKey: string, code: string) => {
    const catalog = productOptions.find(item => item.code === code);
    setForm(prev => ({
      ...prev,
      products: prev.products.map(product => {
        if (product.key !== productKey) return product;
        const keepLines = product.maSp === code;
        return {
          ...product,
          maSp: code,
          tenSp: catalog?.name ?? '',
          lines: keepLines ? product.lines : [emptyLine()]
        };
      })
    }));
  };

  const addProduct = () => {
    setForm(prev => ({ ...prev, products: [...prev.products, emptyProduct()] }));
  };

  const removeProduct = (productKey: string) => {
    setForm(prev => {
      const next = prev.products.filter(item => item.key !== productKey);
      return { ...prev, products: next.length > 0 ? next : [emptyProduct()] };
    });
  };

  const updateLine = (productKey: string, lineKey: string, patch: Partial<LineForm>) => {
    setForm(prev => ({
      ...prev,
      products: prev.products.map(product =>
        product.key !== productKey
          ? product
          : {
              ...product,
              lines: product.lines.map(line => (line.key === lineKey ? { ...line, ...patch } : line))
            }
      )
    }));
  };

  const selectMaterialCode = (productKey: string, lineKey: string, code: string) => {
    const material = materialsByCode.get(code);
    updateLine(productKey, lineKey, {
      maNvl: code,
      tenNvl: material?.name ?? ''
    });
  };

  const addLine = (productKey: string) => {
    setForm(prev => ({
      ...prev,
      products: prev.products.map(product =>
        product.key === productKey
          ? { ...product, lines: [...product.lines, emptyLine()] }
          : product
      )
    }));
  };

  const removeLine = (productKey: string, lineKey: string) => {
    setForm(prev => ({
      ...prev,
      products: prev.products.map(product => {
        if (product.key !== productKey) return product;
        const lines =
          product.lines.length <= 1 ? product.lines : product.lines.filter(line => line.key !== lineKey);
        return { ...product, lines };
      })
    }));
  };

  const handleSave = async () => {
    const resolvedCa = resolveShiftName(form.ca.trim(), shiftOptions) || form.ca.trim();
    if (!resolvedCa || resolvedCa === '-' || resolvedCa === '—') {
      setError('Vui lòng chọn ca.');
      return;
    }
    if (!form.maLenhSx.trim()) {
      setError('Vui lòng chọn lệnh SX.');
      return;
    }

    const products = form.products.filter(product => product.maSp.trim());
    if (products.length === 0) {
      setError('Vui lòng thêm ít nhất 1 sản phẩm.');
      return;
    }

    const codes = products.map(p => p.maSp.trim());
    if (new Set(codes).size !== codes.length) {
      setError('Các sản phẩm trong cùng phiếu không được trùng mã SP.');
      return;
    }

    for (const [pIndex, product] of products.entries()) {
      const validLines = product.lines.filter(line => line.maNvl.trim() || line.tenNvl.trim());
      if (validLines.length === 0) {
        setError(`Sản phẩm #${pIndex + 1} (${product.maSp}) cần ít nhất 1 dòng NVL.`);
        return;
      }
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payloadProducts = products.map((product, pIndex) => {
        const validLines = product.lines.filter(line => line.maNvl.trim() || line.tenNvl.trim());
        const tong =
          product.tongTrongLuong.trim() === ''
            ? null
            : Number(product.tongTrongLuong.replace(',', '.'));
        if (tong !== null && !Number.isFinite(tong)) {
          throw new Error(`Tổng trọng lượng SP #${pIndex + 1} phải là số.`);
        }
        const nvl = validLines.map((line, index) => {
          const gia_tri =
            line.giaTri.trim() === '' ? null : Number(line.giaTri.replace(',', '.'));
          if (gia_tri !== null && !Number.isFinite(gia_tri)) {
            throw new Error(`Giá trị NVL #${index + 1} của SP ${product.maSp} không hợp lệ.`);
          }
          return {
            ma_nvl: line.maNvl.trim(),
            ten_nvl: line.tenNvl.trim(),
            gia_tri,
            don_vi: line.donVi,
            khoi_luong: calcNvlKhoiLuong(tong, gia_tri, line.donVi)
          };
        });
        return {
          ma_sp: product.maSp.trim(),
          ten_sp: product.tenSp.trim(),
          tong_trong_luong: tong,
          ghi_chu: product.ghiChu.trim(),
          nvl
        };
      });

      const payload = {
        ngay: form.ngay.trim() || null,
        ca: resolvedCa,
        ma_lenh_sx: form.maLenhSx.trim(),
        ghi_chu: form.ghiChu.trim(),
        products: payloadProducts
      };

      const res = await fetch(
        editingId
          ? `/api/bang-tron-vat-tu-dinh-muc/${encodeURIComponent(editingId)}`
          : '/api/bang-tron-vat-tu-dinh-muc',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không lưu được phiếu trộn định mức.');

      setMessage(
        editingId
          ? `Đã cập nhật phiếu định mức (${products.length} SP).`
          : `Đã thêm phiếu định mức (${products.length} SP).`
      );
      closeForm();
      await loadRows();
    } catch (err: any) {
      setError(err?.message || 'Không lưu được phiếu trộn định mức.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa phiếu trộn định mức này?')) return;
    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/bang-tron-vat-tu-dinh-muc/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không xóa được phiếu.');
      setMessage('Đã xóa phiếu trộn định mức.');
      await loadRows();
    } catch (err: any) {
      setError(err?.message || 'Không xóa được phiếu.');
    } finally {
      setDeletingId('');
    }
  };

  const handlePrintRow = (row: MixingNormRow) => {
    setError('');
    setMessage('');
    setPrintDocs([toPrintDoc(row)]);
    setPendingPrint(true);
  };

  const handlePrintFiltered = () => {
    if (filtered.length === 0) {
      setError('Không có phiếu nào để in.');
      setMessage('');
      return;
    }
    setError('');
    setMessage('');
    setPrintDocs(filtered.map(toPrintDoc));
    setPendingPrint(true);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm lg:flex lg:items-center lg:gap-3">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#ef1b2d] focus-within:ring-2 focus-within:ring-[#ef1b2d]/10">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Tìm ngày, lệnh SX, SP, NVL..."
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={handlePrintFiltered}
          className="mt-3 flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-extrabold text-zinc-800 transition hover:border-zinc-950 lg:mt-0"
        >
          <Printer className="h-4 w-4" />
          In danh sách
        </button>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="mt-3 flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] lg:mt-0"
          >
            <Plus className="h-4 w-4" />
            Thêm phiếu định mức
          </button>
        ) : null}
      </section>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>
      )}
      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          {message}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-white">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-black">Ngày</th>
                <th className="whitespace-nowrap px-3 py-3 font-black">Ca</th>
                <th className="whitespace-nowrap px-3 py-3 font-black">Lệnh SX</th>
                <th className="whitespace-nowrap px-3 py-3 font-black">Sản phẩm</th>
                <th className="px-3 py-3 font-black">NVL / giá trị theo SP</th>
                <th className="whitespace-nowrap px-3 py-3 text-center font-black">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-red-50/40">
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-800">
                    {row.ngay || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-black text-zinc-800">{row.ca || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-bold text-zinc-700">
                    {row.ma_lenh_sx || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-zinc-700">
                    {row.products.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <div className="space-y-1">
                        {row.products.map((product, index) => (
                          <div key={`${row.id}-sp-${index}`}>
                            <span className="font-mono text-zinc-500">{product.ma_sp || '—'}</span>
                            {product.ten_sp ? <span className="ml-1">{product.ten_sp}</span> : null}
                            {product.tong_trong_luong !== null &&
                            product.tong_trong_luong !== undefined ? (
                              <span className="ml-1 font-black text-[#ef1b2d]">
                                ({product.tong_trong_luong} kg)
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-xs font-semibold text-zinc-700"
                    title={summarizeProductsNvl(row.products)}
                  >
                    {row.products.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <div className="space-y-2">
                        {row.products.map((product, pIndex) => (
                          <div key={`${row.id}-nvl-${pIndex}`}>
                            <p className="mb-0.5 font-black text-zinc-800">
                              {product.ma_sp || product.ten_sp || `SP #${pIndex + 1}`}
                            </p>
                            {product.chi_tiet.length === 0 ? (
                              <span className="text-zinc-400">Chưa có NVL</span>
                            ) : (
                              <div className="space-y-0.5">
                                {product.chi_tiet.map((line, index) => (
                                  <div
                                    key={`${row.id}-${pIndex}-${index}`}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                                  >
                                    <span className="font-mono text-zinc-500">
                                      {line.ma_nvl || '—'}
                                    </span>
                                    <span>{line.ten_nvl || '—'}</span>
                                    <span className="font-black text-[#ef1b2d]">
                                      {line.gia_tri === null || line.gia_tri === undefined
                                        ? '—'
                                        : `${line.gia_tri} ${line.don_vi || 'kg'}`}
                                    </span>
                                    {line.khoi_luong !== null && line.khoi_luong !== undefined ? (
                                      <span className="text-zinc-500">
                                        → {formatKhoiLuongDisplay(line.khoi_luong)}
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <RowActionsMenu label={`Thao tác định mức ${row.ngay || row.id}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handlePrintRow(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                        title="In phiếu này"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        In
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(row.id)}
                          disabled={deletingId === row.id}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Xóa
                        </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center font-bold text-zinc-500">
                    Chưa có phiếu trộn định mức. Bấm “Thêm phiếu định mức”.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center font-bold text-zinc-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang tải...
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (canCreate || (canEdit && editingId)) ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950">
                {editingId ? 'Sửa phiếu trộn định mức' : 'Thêm phiếu trộn định mức'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ngày</span>
                  <input
                    type="date"
                    value={form.ngay}
                    onChange={event => setForm(prev => ({ ...prev, ngay: event.target.value }))}
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">Ca <span className="text-[#ef1b2d]">*</span></span>
                  <select value={form.ca} onChange={event => setForm(prev => ({ ...prev, ca: event.target.value }))} className={inputClass}>
                    <option value="">Chọn ca</option>
                    {form.ca && !shiftOptions.some(option => option.value === form.ca) ? (
                      <option value={form.ca}>{form.ca}</option>
                    ) : null}
                    {shiftOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Lệnh SX <span className="text-[#ef1b2d]">*</span>
                  </span>
                  <SearchableSelect
                    value={form.maLenhSx}
                    onChange={selectOrder}
                    options={productionOrders}
                    placeholder="Chọn lệnh SX..."
                    getValue={item => (item as MixingProductionOrder).orderCode}
                    getLabel={item => {
                      const order = item as MixingProductionOrder;
                      const first = order.productLines[0];
                      return `${order.orderCode}${first ? ` — ${first.productCode}` : ''}`;
                    }}
                    getSearchText={item => {
                      const order = item as MixingProductionOrder;
                      return `${order.orderCode} ${order.productLines.map(l => `${l.productCode} ${l.productName}`).join(' ')}`;
                    }}
                    displaySelectedAsValue
                    maxResults={60}
                  />
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Ghi chú phiếu
                  </span>
                  <input
                    value={form.ghiChu}
                    onChange={event => setForm(prev => ({ ...prev, ghiChu: event.target.value }))}
                    className={inputClass}
                    placeholder="Ghi chú chung (tuỳ chọn)"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Sản phẩm ({form.products.length})
                  {selectedOrder ? ` · theo ${selectedOrder.orderCode}` : ''}
                </p>
                <button
                  type="button"
                  onClick={addProduct}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#ef1b2d]/20 bg-red-50 px-2.5 text-[11px] font-extrabold text-[#ef1b2d] hover:bg-red-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm sản phẩm
                </button>
              </div>

              {!hasAnyProduct ? (
                <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs font-bold text-zinc-500">
                  Thêm sản phẩm → chọn mã SP → mới sổ NVL trong từng SP.
                </p>
              ) : null}

              <div className="space-y-3">
                {form.products.map((product, productIndex) => {
                  const productSelected = Boolean(product.maSp.trim());
                  return (
                    <div
                      key={product.key}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 shadow-sm"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
                          SP #{productIndex + 1}
                          {product.maSp ? ` · ${product.maSp}` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeProduct(product.key)}
                          disabled={form.products.length <= 1}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Xóa SP
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="space-y-1 sm:col-span-2">
                          <span className="text-[11px] font-bold text-zinc-500">Mã sản phẩm</span>
                          <select
                            value={product.maSp}
                            onChange={event => selectProductCode(product.key, event.target.value)}
                            className={inputClass}
                          >
                            <option value="">
                              {productOptions.length === 0
                                ? 'Chưa có sản phẩm — kiểm tra lệnh SX'
                                : 'Chọn mã SP...'}
                            </option>
                            {product.maSp &&
                              !productOptions.some(item => item.code === product.maSp) && (
                                <option value={product.maSp}>
                                  {product.maSp}
                                  {product.tenSp ? ` — ${product.tenSp}` : ''} (đã lưu)
                                </option>
                              )}
                            {productOptions.map(option => (
                              <option key={option.code} value={option.code}>
                                {option.code}
                                {option.name ? ` — ${option.name}` : ''}
                              </option>
                            ))}
                          </select>
                          {product.tenSp ? (
                            <p className="text-[11px] font-semibold text-zinc-500">
                              Tên SP: <span className="font-bold text-zinc-800">{product.tenSp}</span>
                            </p>
                          ) : null}
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-zinc-500">Tổng TL (kg)</span>
                          <input
                            value={product.tongTrongLuong}
                            onChange={event =>
                              updateProduct(product.key, { tongTrongLuong: event.target.value })
                            }
                            className={inputClass}
                            placeholder="VD: 1000"
                            inputMode="decimal"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] font-bold text-zinc-500">Ghi chú SP</span>
                          <input
                            value={product.ghiChu}
                            onChange={event =>
                              updateProduct(product.key, { ghiChu: event.target.value })
                            }
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {productSelected ? (
                        <div className="mt-3 rounded-lg border border-[#ef1b2d]/20 bg-red-50/50 p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                              NVL trong {product.maSp}
                            </p>
                            <button
                              type="button"
                              onClick={() => addLine(product.key)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#ef1b2d]/20 bg-white px-2 text-[10px] font-extrabold text-[#ef1b2d] hover:bg-red-100"
                            >
                              <Plus className="h-3 w-3" />
                              Thêm NVL
                            </button>
                          </div>
                          <p className="mb-1.5 hidden text-[10px] font-bold text-zinc-400 sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_0.7fr_0.5fr_0.75fr_auto] sm:gap-2 sm:px-2">
                            <span>Mã NVL</span>
                            <span>Tên NVL</span>
                            <span>Giá trị</span>
                            <span>ĐV</span>
                            <span>Khối lượng</span>
                            <span />
                          </p>
                          <div className="space-y-2">
                            {product.lines.map((line, index) => {
                              const codeInCatalog = Boolean(line.maNvl && materialsByCode.has(line.maNvl));
                              const tong = parseNumberOrNull(product.tongTrongLuong);
                              const gia = parseNumberOrNull(line.giaTri);
                              const khoiLuong = calcNvlKhoiLuong(tong, gia, line.donVi);
                              return (
                                <div
                                  key={line.key}
                                  className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_0.7fr_0.5fr_0.75fr_auto]"
                                >
                                  <select
                                    value={line.maNvl}
                                    onChange={event =>
                                      selectMaterialCode(product.key, line.key, event.target.value)
                                    }
                                    className={inputClass}
                                  >
                                    <option value="">{`Chọn mã NVL #${index + 1}`}</option>
                                    {line.maNvl && !codeInCatalog && (
                                      <option value={line.maNvl}>
                                        {line.maNvl} (không còn trong kho)
                                      </option>
                                    )}
                                    {materials.map(material => (
                                      <option key={material.code} value={material.code}>
                                        {material.code}
                                        {material.name ? ` — ${material.name}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={line.tenNvl}
                                    readOnly
                                    className={`${inputClass} bg-zinc-50 text-zinc-600`}
                                    placeholder="Tên NVL (tự điền)"
                                  />
                                  <input
                                    value={line.giaTri}
                                    onChange={event =>
                                      updateLine(product.key, line.key, {
                                        giaTri: event.target.value
                                      })
                                    }
                                    className={inputClass}
                                    placeholder={line.donVi === '%' ? '%' : 'kg'}
                                    inputMode="decimal"
                                    title="Giá trị định mức"
                                  />
                                  <select
                                    value={line.donVi}
                                    onChange={event =>
                                      updateLine(product.key, line.key, {
                                        donVi: event.target.value === '%' ? '%' : 'kg'
                                      })
                                    }
                                    className={inputClass}
                                  >
                                    <option value="kg">kg</option>
                                    <option value="%">%</option>
                                  </select>
                                  <input
                                    value={
                                      khoiLuong === null
                                        ? ''
                                        : formatKhoiLuongDisplay(khoiLuong)
                                    }
                                    readOnly
                                    className={`${inputClass} bg-zinc-50 font-black text-[#ef1b2d]`}
                                    placeholder={
                                      line.donVi === '%' && tong === null
                                        ? 'Nhập Tổng TL'
                                        : 'Khối lượng'
                                    }
                                    title={
                                      line.donVi === '%'
                                        ? 'Khối lượng = Tổng TL × % ÷ 100'
                                        : 'Khối lượng = giá trị (kg)'
                                    }
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeLine(product.key, line.key)}
                                    disabled={product.lines.length <= 1}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                                    title="Xóa dòng NVL"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-3 text-center text-[11px] font-bold text-zinc-500">
                          Chọn mã SP ở trên để sổ danh sách NVL.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white hover:bg-[#b30d1c] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving
                  ? 'Đang lưu...'
                  : editingId
                    ? 'Cập nhật phiếu'
                    : `Lưu phiếu (${form.products.filter(p => p.maSp.trim()).length || 0} SP)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printDocs.length > 0 ? <MixingNormRatioPrintBatch docs={printDocs} /> : null}
    </div>
  );
}
