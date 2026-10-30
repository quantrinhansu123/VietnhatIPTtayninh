import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import {
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  TablePagination,
  usePagination
} from '../../components/shared/table';
import { normalizeMaterialsInventory, type MaterialRow } from '../kho-nvl';

function formatUnitPrice(value: string) {
  if (!value || value === '-') return '—';
  const num = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(num)) return value;
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function hasUnitPrice(value: string) {
  if (!value || value === '-') return false;
  const num = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) && num >= 0;
}

function parsePriceInput(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '').replace(/,/g, '.');
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

const fieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

type PriceFormState = {
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  unitPrice: string;
};

const emptyPriceForm = (): PriceFormState => ({
  code: '',
  name: '',
  unit: '',
  warehouse: '',
  unitPrice: ''
});

function materialToPriceForm(material: MaterialRow): PriceFormState {
  return {
    code: material.code === '-' ? '' : material.code,
    name: material.name === '-' ? '' : material.name,
    unit: material.unit === '-' ? '' : material.unit,
    warehouse: material.warehouse === '-' ? '' : material.warehouse,
    unitPrice: material.unitPrice === '-' ? '' : material.unitPrice
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function BangGiaNvlPanel({ onBack: _onBack }: { onBack?: () => void }) {
  const { canCreate, canEdit } = useTabAccess('nvl-price-list');
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PriceFormState>(emptyPriceForm);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadRows = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [materialsRes, warehousesRes] = await Promise.all([
        fetch('/api/kho-nvl'),
        fetch('/api/quan-ly-kho')
      ]);
      const materialsData = await materialsRes.json().catch(() => ({}));
      if (!materialsRes.ok) {
        throw new Error(materialsData.error || 'Không tải được bảng giá NVL.');
      }
      setRows(normalizeMaterialsInventory(materialsData));

      if (warehousesRes.ok) {
        const warehousesData = await warehousesRes.json().catch(() => ({}));
        const records: Array<{ ten_kho?: string }> = Array.isArray(warehousesData?.records)
          ? warehousesData.records
          : [];
        setWarehouseOptions(
          Array.from(
            new Set(records.map(r => String(r.ten_kho ?? '').trim()).filter(Boolean))
          ).sort((a, b) => a.localeCompare(b, 'vi'))
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Không tải được bảng giá NVL.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter(row =>
          `${row.code} ${row.name} ${row.unit} ${row.warehouse} ${row.unitPrice}`
            .toLowerCase()
            .includes(q)
        )
      : rows;

    return [...list].sort((a, b) => {
      const byCode = a.code.localeCompare(b.code, 'vi');
      if (byCode !== 0) return byCode;
      return a.warehouse.localeCompare(b.warehouse, 'vi');
    });
  }, [rows, search]);

  const { totalPages, paginatedItems: pagedRows } = usePagination(filtered, currentPage, pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pricedCount = useMemo(() => filtered.filter(row => hasUnitPrice(row.unitPrice)).length, [filtered]);

  const warehouseSelectOptions = useMemo(() => {
    const fromRows = rows.map(row => row.warehouse).filter(w => w && w !== '-');
    return Array.from(new Set([...warehouseOptions, ...fromRows])).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rows, warehouseOptions]);

  const closeForm = () => {
    setFormOpen(false);
    setFormMode('add');
    setEditingId(null);
    setForm(emptyPriceForm());
    setFormError('');
  };

  const openAddForm = () => {
    if (!canCreate) return;
    setFormMode('add');
    setEditingId(null);
    setForm(emptyPriceForm());
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (row: MaterialRow) => {
    if (!canEdit) return;
    setFormMode('edit');
    setEditingId(isUuid(row.id) ? row.id : null);
    setForm(materialToPriceForm(row));
    setFormError('');
    setFormOpen(true);
  };

  const findExistingMaterial = (code: string, warehouse: string) => {
    const codeKey = code.trim().replace(/\s+/g, '').toUpperCase();
    const warehouseKey = warehouse.trim().toLowerCase();
    return rows.find(row => {
      const rowCode = row.code.trim().replace(/\s+/g, '').toUpperCase();
      const rowWarehouse = (row.warehouse === '-' ? '' : row.warehouse).trim().toLowerCase();
      return rowCode === codeKey && rowWarehouse === warehouseKey && isUuid(row.id);
    });
  };

  const handleSave = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    const warehouse = form.warehouse.trim();
    const unit = form.unit.trim();
    const unitPrice = parsePriceInput(form.unitPrice);

    if (!code) {
      setFormError('Vui lòng nhập mã hàng.');
      return;
    }
    if (!name) {
      setFormError('Vui lòng nhập tên hàng.');
      return;
    }
    if (!warehouse) {
      setFormError('Vui lòng chọn kho.');
      return;
    }
    if (unitPrice === null || unitPrice < 0) {
      setFormError('Vui lòng nhập đơn giá hợp lệ (≥ 0).');
      return;
    }

    setIsSaving(true);
    setFormError('');

    try {
      const existing =
        formMode === 'edit' && editingId
          ? rows.find(row => row.id === editingId)
          : findExistingMaterial(code, warehouse);

      const payload = {
        code,
        name,
        unit,
        warehouse,
        unitPrice
      };

      const res = existing && isUuid(existing.id)
        ? await fetch(`/api/kho-nvl/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/kho-nvl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || (existing ? 'Không cập nhật được đơn giá.' : 'Không thêm được dòng giá.'));
      }

      closeForm();
      await loadRows();
    } catch (err: any) {
      setFormError(err?.message || 'Không lưu được đơn giá.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <TableToolbar>
        <TableSearchInput
          value={search}
          onChange={value => {
            setSearch(value);
            setCurrentPage(1);
          }}
          placeholder="Tìm mã hàng, tên, kho, đơn giá..."
        />
        <span className="inline-flex h-11 shrink-0 items-center rounded-xl border border-zinc-200 bg-[#e8f0ed] px-3 text-[11px] font-semibold text-zinc-700">
          {pricedCount}/{filtered.length} có giá
        </span>
        <button
          type="button"
          onClick={() => void loadRows()}
          disabled={isLoading}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[#ef1b2d]/25 bg-white px-3 text-xs font-bold text-[#ef1b2d] transition hover:bg-red-50 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Tải lại
        </button>
        {canCreate ? (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-3 text-xs font-extrabold text-white transition hover:bg-[#b30d1c]"
          >
            <Plus className="h-4 w-4" />
            Thêm mới
          </button>
        ) : null}
      </TableToolbar>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <TableShell
        minWidthClassName="min-w-[720px]"
        title={
          <div className="flex w-full items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-zinc-900">Bảng giá NVL</h3>
            <span className="text-[11px] font-semibold text-zinc-500">Nguồn kho_nvl.don_gia</span>
          </div>
        }
        footer={
          <TablePagination
            totalRecords={filtered.length}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={size => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
        }
      >
        <TableHead>
          <TableHeadCell align="center" className="whitespace-nowrap">
            #
          </TableHeadCell>
          <TableHeadCell className="whitespace-nowrap">Mã hàng</TableHeadCell>
          <TableHeadCell>Tên hàng</TableHeadCell>
          <TableHeadCell align="center" className="whitespace-nowrap">
            Kho
          </TableHeadCell>
          <TableHeadCell align="center" className="whitespace-nowrap">
            ĐVT
          </TableHeadCell>
          <TableHeadCell align="right" className="whitespace-nowrap">
            Đơn giá
          </TableHeadCell>
          {canEdit ? (
            <TableHeadCell align="center" className="whitespace-nowrap">
              Thao tác
            </TableHeadCell>
          ) : null}
        </TableHead>
        <TableBody>
          {isLoading && rows.length === 0 ? (
            <TableEmptyRow colSpan={canEdit ? 7 : 6}>
              <span className="inline-flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải bảng giá...
              </span>
            </TableEmptyRow>
          ) : pagedRows.length === 0 ? (
            <TableEmptyRow colSpan={canEdit ? 7 : 6}>Không có NVL khớp bộ lọc.</TableEmptyRow>
          ) : (
            pagedRows.map((row, index) => (
              <TableRow key={`${row.id}-${row.code}-${row.warehouse}`}>
                <td className="border-r border-zinc-100 px-3 py-2 text-center tabular-nums text-zinc-500">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td className="border-r border-zinc-100 px-3 py-2 font-mono text-[13px] font-semibold text-zinc-900">
                  {row.code || '—'}
                </td>
                <td className="border-r border-zinc-100 break-words px-3 py-2 text-[13px] text-zinc-800">
                  {row.name || '—'}
                </td>
                <td className="border-r border-zinc-100 break-words px-3 py-2 text-center text-[13px] text-zinc-700">
                  {row.warehouse || '—'}
                </td>
                <td className="border-r border-zinc-100 whitespace-nowrap px-3 py-2 text-center text-[13px] text-zinc-700">
                  {row.unit || '—'}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums text-zinc-900 ${
                    canEdit ? 'border-r border-zinc-100' : ''
                  }`}
                >
                  {formatUnitPrice(row.unitPrice)}
                </td>
                {canEdit ? (
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => openEditForm(row)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-[#ef1b2d] transition hover:bg-[#ef1b2d]/[0.04]"
                      title="Sửa đơn giá"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </td>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </TableShell>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
              <h3 className="text-sm font-bold text-zinc-900">
                {formMode === 'edit' ? 'Sửa đơn giá NVL' : 'Thêm đơn giá NVL'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formError ? (
              <div className="mx-4 mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">
                {formError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mã hàng *</span>
                <input
                  value={form.code}
                  onChange={e => setForm(prev => ({ ...prev, code: e.target.value }))}
                  className={fieldClass}
                  placeholder="VD: NPL-001"
                  disabled={formMode === 'edit'}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">ĐVT</span>
                <input
                  value={form.unit}
                  onChange={e => setForm(prev => ({ ...prev, unit: e.target.value }))}
                  className={fieldClass}
                  placeholder="kg, cây..."
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tên hàng *</span>
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className={fieldClass}
                  placeholder="Tên nguyên phụ liệu"
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kho *</span>
                <SearchableSelect
                  value={form.warehouse}
                  onChange={value => setForm(prev => ({ ...prev, warehouse: value }))}
                  options={warehouseSelectOptions}
                  placeholder="Chọn kho"
                  searchPlaceholder="Tìm kho..."
                  getLabel={item => String(item)}
                  getValue={item => String(item)}
                  inputClassName={fieldClass}
                  allowEmpty={false}
                  comboboxMode
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Đơn giá *</span>
                <input
                  value={form.unitPrice}
                  onChange={e => setForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                  className={fieldClass}
                  placeholder="VD: 25000"
                  inputMode="decimal"
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-xs font-extrabold text-white transition hover:bg-[#b30d1c] disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Đang lưu...' : formMode === 'edit' ? 'Cập nhật' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
