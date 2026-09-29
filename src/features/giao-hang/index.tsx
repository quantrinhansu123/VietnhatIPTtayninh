import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { formatNumber } from '../../utils';
import { SearchableSelect } from '../../components/shared/SearchableSelect';
import { RepeatableLineRow, RepeatableLinesBlock } from '../../components/RepeatableLinesBlock';
import { pickText } from '../_shared/recordHelpers';
import {
  findOrderProductByCode,
  normalizeOrderProducts,
  orderFieldClass,
  type OrderProductOption
} from '../_shared/orderHelpers';
import { showAppToast, showSaveFailure, readApiErrorMessage } from '../../lib/appToast';
import {
  FilterCombobox,
  TableToolbar,
  TableSearchInput,
  TableShell,
  TableHead,
  TableHeadCell,
  TableBody,
  TableRow,
  TableEmptyRow,
  RowActionsMenu
} from '../../components/shared/table';

export type GiaoHangRow = {
  id: string;
  ngay: string;
  bsx: string;
  so_phieu: string;
  tt: number | null;
  ma_kh: string;
  dia_chi: string;
  sdt_kh: string;
  nvql: string;
  ma_san_pham: string;
  ten_san_pham: string;
  sl: number;
  gia_ban: number;
  thanh_toan: string;
  tong_gia_tri: number;
  ghi_chu: string;
};

type CustomerDetail = {
  id: string;
  name: string;
  code: string;
  dia_chi: string;
  so_dien_thoai: string;
};

type VehicleOption = {
  id: string;
  plate: string;
  label: string;
};

type FormLine = {
  key: string;
  tt: string;
  ma_kh: string;
  dia_chi: string;
  sdt_kh: string;
  nvql: string;
  ma_san_pham: string;
  ten_san_pham: string;
  sl: string;
  gia_ban: string;
  thanh_toan: string;
  tong_gia_tri: string;
  ghi_chu: string;
};

type FormState = {
  ngay: string;
  bsx: string;
  so_phieu: string;
  lines: FormLine[];
};

const PAYMENT_OPTIONS = ['Tiền mặt', 'Chuyển khoản', 'Công nợ', 'Đã thanh toán', 'Chưa thanh toán'] as const;

const lineGridClass =
  'grid-cols-2 md:grid-cols-[3.5rem_minmax(7rem,0.9fr)_minmax(10rem,1.4fr)_7rem_minmax(7rem,0.9fr)_minmax(8rem,1fr)_minmax(10rem,1.4fr)_5rem_7rem_7rem_7rem_minmax(0,1fr)_2.5rem]';

function todayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateVi(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function newFormLine(partial?: Partial<FormLine>, tt = 1): FormLine {
  return {
    key: partial?.key || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tt: partial?.tt ?? String(tt),
    ma_kh: partial?.ma_kh || '',
    dia_chi: partial?.dia_chi || '',
    sdt_kh: partial?.sdt_kh || '',
    nvql: partial?.nvql || '',
    ma_san_pham: partial?.ma_san_pham || '',
    ten_san_pham: partial?.ten_san_pham || '',
    sl: partial?.sl ?? '',
    gia_ban: partial?.gia_ban ?? '',
    thanh_toan: partial?.thanh_toan || '',
    tong_gia_tri: partial?.tong_gia_tri ?? '',
    ghi_chu: partial?.ghi_chu || ''
  };
}

function emptyForm(soPhieu = '', nvql = ''): FormState {
  return {
    ngay: todayIso(),
    bsx: '',
    so_phieu: soPhieu,
    lines: [newFormLine({ nvql }, 1)]
  };
}

function normalizeGiaoHangRows(data: unknown): GiaoHangRow[] {
  if (!data || typeof data !== 'object') return [];
  const rows = (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => {
      const sl = Number(row.sl ?? 0) || 0;
      const giaBan = Number(row.gia_ban ?? 0) || 0;
      const tong = Number(row.tong_gia_tri ?? 0);
      return {
        id: String(row.id ?? '').trim(),
        ngay: pickText(row, ['ngay'], todayIso()).slice(0, 10),
        bsx: pickText(row, ['bsx', 'bien_so_xe'], ''),
        so_phieu: pickText(row, ['so_phieu'], ''),
        tt: row.tt === null || row.tt === undefined || String(row.tt).trim() === '' ? null : Number(row.tt),
        ma_kh: pickText(row, ['ma_kh', 'ma_khach_hang'], ''),
        dia_chi: pickText(row, ['dia_chi'], ''),
        sdt_kh: pickText(row, ['sdt_kh', 'so_dien_thoai'], ''),
        nvql: pickText(row, ['nvql', 'nhan_vien'], ''),
        ma_san_pham: pickText(row, ['ma_san_pham', 'ma_sp'], ''),
        ten_san_pham: pickText(row, ['ten_san_pham', 'ten_sp'], ''),
        sl,
        gia_ban: giaBan,
        thanh_toan: pickText(row, ['thanh_toan'], ''),
        tong_gia_tri: Number.isFinite(tong) && tong > 0 ? tong : sl * giaBan,
        ghi_chu: pickText(row, ['ghi_chu'], '')
      };
    })
    .filter(row => row.id || row.so_phieu);
}

function normalizeCustomerDetails(data: unknown): CustomerDetail[] {
  if (!data || typeof data !== 'object') return [];
  const customers = (data as { customers?: unknown }).customers;
  if (!Array.isArray(customers)) return [];
  return customers
    .map((item): CustomerDetail | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['ten_khach_hang', 'khach_hang', 'ten', 'name', 'ten_cong_ty'], '');
      const code = pickText(record, ['ma_khach_hang', 'ma_kh', 'code', 'id'], '');
      if (!name && !code) return null;
      return {
        id: code || name,
        name: name || code,
        code,
        dia_chi: pickText(record, ['dia_chi', 'dia_chi_giao', 'address'], ''),
        so_dien_thoai: pickText(record, ['so_dien_thoai', 'dien_thoai', 'phone', 'sdt'], '')
      };
    })
    .filter((item): item is CustomerDetail => Boolean(item));
}

function normalizeVehicles(data: unknown): VehicleOption[] {
  if (!data || typeof data !== 'object') return [];
  const vehicles = (data as { vehicles?: unknown }).vehicles;
  if (!Array.isArray(vehicles)) return [];
  return vehicles
    .map((item): VehicleOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const plate = pickText(record, ['bien_so_xe', 'bsx', 'plateNumber'], '').toUpperCase();
      if (!plate) return null;
      const driver = pickText(record, ['tai_xe_phu_trach', 'tai_xe'], '');
      return {
        id: String(record.id ?? plate),
        plate,
        label: driver ? `${plate} · ${driver}` : plate
      };
    })
    .filter((item): item is VehicleOption => Boolean(item));
}

function generateNextSoPhieu(existing: Iterable<string>) {
  let max = 0;
  for (const raw of existing) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^GH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  return `GH${String(next).padStart(Math.max(3, String(next).length), '0')}`;
}

function lineAmount(sl: string, giaBan: string, tong?: string) {
  const manual = Number(tong);
  if (Number.isFinite(manual) && manual > 0 && tong?.trim()) return manual;
  return (Number(sl) || 0) * (Number(giaBan) || 0);
}

export function GiaoHangPanel({
  onBack: _onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('giao-hang');
  const [rows, setRows] = useState<GiaoHangRow[]>([]);
  const [customers, setCustomers] = useState<CustomerDetail[]>([]);
  const [products, setProducts] = useState<OrderProductOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedBsx, setSelectedBsx] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm('', currentUser?.name || ''));

  const loadAll = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rowRes, customerRes, productRes, vehicleRes] = await Promise.all([
        fetch('/api/giao-hang'),
        fetch('/api/khach-hang'),
        fetch('/api/san-pham?format=table'),
        fetch('/api/danh-sach-xe')
      ]);
      const rowData = await rowRes.json().catch(() => ({}));
      const customerData = await customerRes.json().catch(() => ({}));
      const productData = await productRes.json().catch(() => ({}));
      const vehicleData = await vehicleRes.json().catch(() => ({}));
      if (!rowRes.ok) throw new Error(rowData.error || 'Không thể tải phiếu giao hàng.');
      setRows(normalizeGiaoHangRows(rowData));
      setCustomers(normalizeCustomerDetails(customerData));
      setProducts(normalizeOrderProducts(productData));
      setVehicles(normalizeVehicles(vehicleData));
    } catch (loadError: unknown) {
      setRows([]);
      setError(showSaveFailure(loadError, 'Không thể tải dữ liệu giao hàng.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const bsxOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.bsx) set.add(row.bsx);
    }
    for (const vehicle of vehicles) set.add(vehicle.plate);
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rows, vehicles]);

  const hasActiveFilters = selectedBsx !== 'all' || Boolean(searchText);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter(row => {
      const matchesBsx = selectedBsx === 'all' || row.bsx === selectedBsx;
      const matchesSearch =
        !q ||
        `${row.so_phieu} ${row.bsx} ${row.ma_kh} ${row.dia_chi} ${row.sdt_kh} ${row.nvql} ${row.ma_san_pham} ${row.ten_san_pham} ${row.thanh_toan} ${row.ghi_chu}`
          .toLowerCase()
          .includes(q);
      return matchesBsx && matchesSearch;
    });
  }, [rows, searchText, selectedBsx]);

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId(null);
    setForm(
      emptyForm(
        generateNextSoPhieu(rows.map(row => row.so_phieu)),
        currentUser?.name || ''
      )
    );
    setFormOpen(true);
    setError('');
  };

  const openEdit = (row: GiaoHangRow) => {
    if (!canEdit) return;
    setEditingId(row.id);
    setForm({
      ngay: row.ngay,
      bsx: row.bsx,
      so_phieu: row.so_phieu,
      lines: [
        newFormLine(
          {
            tt: row.tt == null ? '' : String(row.tt),
            ma_kh: row.ma_kh,
            dia_chi: row.dia_chi,
            sdt_kh: row.sdt_kh,
            nvql: row.nvql,
            ma_san_pham: row.ma_san_pham,
            ten_san_pham: row.ten_san_pham,
            sl: row.sl ? String(row.sl) : '',
            gia_ban: row.gia_ban ? String(row.gia_ban) : '',
            thanh_toan: row.thanh_toan,
            tong_gia_tri: row.tong_gia_tri ? String(row.tong_gia_tri) : '',
            ghi_chu: row.ghi_chu
          },
          row.tt || 1
        )
      ]
    });
    setFormOpen(true);
    setError('');
  };

  const updateLine = (key: string, patch: Partial<FormLine>) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map(line => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if ('sl' in patch || 'gia_ban' in patch) {
          const amount = (Number(next.sl) || 0) * (Number(next.gia_ban) || 0);
          next.tong_gia_tri = amount > 0 ? String(amount) : '';
        }
        return next;
      })
    }));
  };

  const selectCustomer = (lineKey: string, customerValue: string) => {
    const customer =
      customers.find(
        item => item.name === customerValue || item.code === customerValue || item.id === customerValue
      ) || null;
    updateLine(lineKey, {
      ma_kh: customer?.code || customerValue,
      dia_chi: customer?.dia_chi || '',
      sdt_kh: customer?.so_dien_thoai || ''
    });
  };

  const selectProduct = (lineKey: string, code: string) => {
    const found = findOrderProductByCode(products, code);
    updateLine(lineKey, {
      ma_san_pham: code,
      ten_san_pham: found?.name || ''
    });
  };

  const handleSave = async () => {
    if (!form.ngay.trim()) {
      setError(showSaveFailure('Vui lòng chọn ngày giao.'));
      return;
    }
    if (!form.so_phieu.trim()) {
      setError(showSaveFailure('Vui lòng nhập số phiếu.'));
      return;
    }

    const lines = form.lines.filter(
      line =>
        line.ma_kh.trim() ||
        line.ma_san_pham.trim() ||
        line.ten_san_pham.trim() ||
        Number(line.sl) > 0
    );
    if (lines.length === 0) {
      setError(showSaveFailure('Vui lòng thêm ít nhất một dòng giao hàng.'));
      return;
    }
    for (const line of lines) {
      if (!line.ma_san_pham.trim() && !line.ten_san_pham.trim()) {
        setError(showSaveFailure('Mỗi dòng cần có mã SP hoặc tên SP.'));
        return;
      }
      if (!(Number(line.sl) > 0)) {
        setError(showSaveFailure(`Số lượng phải lớn hơn 0 (${line.ma_san_pham || line.ten_san_pham}).`));
        return;
      }
    }

    setIsSaving(true);
    setError('');
    try {
      const payloadLines = lines.map((line, index) => ({
        tt: line.tt.trim() ? Number(line.tt) : index + 1,
        ma_kh: line.ma_kh.trim(),
        dia_chi: line.dia_chi.trim(),
        sdt_kh: line.sdt_kh.trim(),
        nvql: line.nvql.trim() || currentUser?.name || '',
        ma_san_pham: line.ma_san_pham.trim(),
        ten_san_pham: line.ten_san_pham.trim(),
        sl: Number(line.sl) || 0,
        gia_ban: Number(line.gia_ban) || 0,
        thanh_toan: line.thanh_toan.trim(),
        tong_gia_tri: lineAmount(line.sl, line.gia_ban, line.tong_gia_tri),
        ghi_chu: line.ghi_chu.trim()
      }));

      const body = {
        ngay: form.ngay,
        bsx: form.bsx.trim().toUpperCase(),
        so_phieu: form.so_phieu.trim(),
        ...(editingId ? payloadLines[0] : { lines: payloadLines })
      };

      const res = await fetch(
        editingId ? `/api/giao-hang/${encodeURIComponent(editingId)}` : '/api/giao-hang',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không thể lưu phiếu giao hàng.'));
      }
      showAppToast(editingId ? 'Đã cập nhật dòng giao hàng.' : 'Đã tạo phiếu giao hàng.');
      setFormOpen(false);
      setEditingId(null);
      await loadAll();
    } catch (saveError: unknown) {
      setError(showSaveFailure(saveError, 'Không thể lưu phiếu giao hàng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: GiaoHangRow) => {
    if (!row.id || !canDelete) return;
    if (!window.confirm(`Xóa dòng giao hàng ${row.so_phieu} · ${row.ma_san_pham || row.ten_san_pham}?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/giao-hang/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không thể xóa dòng giao hàng.'));
      showAppToast('Đã xóa dòng giao hàng.');
      await loadAll();
    } catch (deleteError: unknown) {
      setError(showSaveFailure(deleteError, 'Không thể xóa dòng giao hàng.'));
    }
  };

  return (
    <div className="space-y-3 pb-8">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Package className="h-4 w-4 text-brand-500" />
            Giao hàng
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            Phiếu giao theo xe · {filteredRows.length} dòng
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white hover:bg-brand-600"
          >
            <Plus className="h-4 w-4" />
            Thêm phiếu giao
          </button>
        ) : null}
      </section>

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={() => {
          setSelectedBsx('all');
          setSearchText('');
        }}
        loadError={error}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm số phiếu, BSX, mã KH, SP..."
          disabled={isLoading}
        />
        <FilterCombobox
          label="BSX"
          options={bsxOptions}
          value={selectedBsx}
          onChange={setSelectedBsx}
          compact
        />
      </TableToolbar>

      <TableShell minWidthClassName="min-w-[1280px]">
        <TableHead>
          <TableHeadCell>Ngày</TableHeadCell>
          <TableHeadCell>BSX</TableHeadCell>
          <TableHeadCell>Số phiếu</TableHeadCell>
          <TableHeadCell align="center">TT</TableHeadCell>
          <TableHeadCell>Mã KH</TableHeadCell>
          <TableHeadCell>Địa chỉ</TableHeadCell>
          <TableHeadCell>SĐT KH</TableHeadCell>
          <TableHeadCell>NVQL</TableHeadCell>
          <TableHeadCell>Mã SP</TableHeadCell>
          <TableHeadCell>Tên SP</TableHeadCell>
          <TableHeadCell align="right">SL</TableHeadCell>
          <TableHeadCell align="right">Giá bán</TableHeadCell>
          <TableHeadCell>Thanh toán</TableHeadCell>
          <TableHeadCell align="right">Tổng GT</TableHeadCell>
          <TableHeadCell>Ghi chú</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {filteredRows.map(row => (
            <TableRow key={row.id || `${row.so_phieu}-${row.tt}-${row.ma_san_pham}`}>
              <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-700">
                {formatDateVi(row.ngay)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-sky-800">
                {row.bsx || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono font-black text-zinc-900">
                {row.so_phieu || '—'}
              </td>
              <td className="px-3 py-2.5 text-center font-semibold text-zinc-700">
                {row.tt ?? '—'}
              </td>
              <td className="px-3 py-2.5 font-semibold text-zinc-800">{row.ma_kh || '—'}</td>
              <td className="max-w-[14rem] px-3 py-2.5 text-zinc-700">{row.dia_chi || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">{row.sdt_kh || '—'}</td>
              <td className="px-3 py-2.5 text-zinc-700">{row.nvql || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-zinc-800">
                {row.ma_san_pham || '—'}
              </td>
              <td className="max-w-[16rem] px-3 py-2.5 font-semibold text-zinc-800">
                {row.ten_san_pham || '—'}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-zinc-800">
                {formatNumber(row.sl, 2)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-zinc-700">
                {formatNumber(row.gia_ban, 0)}
              </td>
              <td className="px-3 py-2.5 text-zinc-700">{row.thanh_toan || '—'}</td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                {formatNumber(row.tong_gia_tri, 0)}
              </td>
              <td className="max-w-[12rem] px-3 py-2.5 text-zinc-600">{row.ghi_chu || '—'}</td>
              <td className="px-3 py-2.5 text-center">
                <RowActionsMenu label={`Thao tác ${row.so_phieu}`}>
                  <div className="inline-flex items-center justify-center gap-1.5">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        title="Sửa"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        title="Xóa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </RowActionsMenu>
              </td>
            </TableRow>
          ))}
          {!isLoading && filteredRows.length === 0 ? (
            <TableEmptyRow colSpan={16}>Chưa có phiếu giao hàng.</TableEmptyRow>
          ) : null}
        </TableBody>
      </TableShell>

      {formOpen ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="flex h-[96dvh] max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                  {editingId ? 'Sửa dòng giao hàng' : 'Thêm phiếu giao hàng'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  Ngày · BSX · Số phiếu + chi tiết khách / sản phẩm
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
              >
                Đóng
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Ngày *
                  </span>
                  <input
                    type="date"
                    value={form.ngay}
                    onChange={event => setForm(prev => ({ ...prev, ngay: event.target.value }))}
                    className={orderFieldClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    BSX
                  </span>
                  <SearchableSelect
                    value={form.bsx}
                    options={vehicles}
                    allowCustomValue
                    onChange={value => setForm(prev => ({ ...prev, bsx: value.toUpperCase() }))}
                    placeholder="Chọn hoặc nhập biển số"
                    getValue={item => (item as VehicleOption).plate}
                    getLabel={item => (item as VehicleOption).label}
                    getSearchText={item => (item as VehicleOption).label}
                    inputClassName={orderFieldClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Số phiếu *
                  </span>
                  <input
                    value={form.so_phieu}
                    onChange={event => setForm(prev => ({ ...prev, so_phieu: event.target.value }))}
                    className={orderFieldClass}
                    placeholder="GH001"
                  />
                </label>
              </div>

              <RepeatableLinesBlock
                title="Chi tiết giao hàng"
                required
                showColumnHeaders
                horizontalScroll
                gridTemplateClass={lineGridClass}
                onAdd={() => {
                  if (editingId) return;
                  setForm(prev => ({
                    ...prev,
                    lines: [
                      ...prev.lines,
                      newFormLine({ nvql: currentUser?.name || '' }, prev.lines.length + 1)
                    ]
                  }));
                }}
                hideAddButton={Boolean(editingId)}
                columns={[
                  { key: 'tt', label: 'TT' },
                  { key: 'ma_kh', label: 'Mã KH' },
                  { key: 'dia_chi', label: 'Địa chỉ' },
                  { key: 'sdt', label: 'SĐT KH' },
                  { key: 'nvql', label: 'NVQL' },
                  { key: 'ma_sp', label: 'Mã SP', required: true },
                  { key: 'ten_sp', label: 'Tên SP' },
                  { key: 'sl', label: 'SL', required: true },
                  { key: 'gia', label: 'Giá bán' },
                  { key: 'ttien', label: 'Thanh toán' },
                  { key: 'tong', label: 'Tổng GT' },
                  { key: 'note', label: 'Ghi chú' },
                  { key: 'actions', label: '' }
                ]}
              >
                {form.lines.map(line => {
                  const matched = findOrderProductByCode(products, line.ma_san_pham);
                  return (
                    <RepeatableLineRow key={line.key} gridTemplateClass={lineGridClass} className="!items-start">
                      <div className="min-w-0">
                        <input
                          value={line.tt}
                          onChange={event => updateLine(line.key, { tt: event.target.value })}
                          className={`${orderFieldClass} text-center`}
                          placeholder="1"
                        />
                      </div>
                      <div className="min-w-0">
                        <SearchableSelect
                          value={line.ma_kh}
                          options={customers}
                          allowCustomValue
                          onChange={value => selectCustomer(line.key, value)}
                          placeholder="Mã KH"
                          getValue={item => (item as CustomerDetail).code || (item as CustomerDetail).name}
                          getLabel={item => {
                            const customer = item as CustomerDetail;
                            return customer.code ? `${customer.code} · ${customer.name}` : customer.name;
                          }}
                          getSearchText={item => {
                            const customer = item as CustomerDetail;
                            return `${customer.code} ${customer.name} ${customer.so_dien_thoai}`;
                          }}
                          displaySelectedAsValue
                          inputClassName={orderFieldClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <textarea
                          value={line.dia_chi}
                          rows={2}
                          onChange={event => updateLine(line.key, { dia_chi: event.target.value })}
                          className={`${orderFieldClass} h-auto min-h-11 resize-y py-2.5 leading-snug`}
                          placeholder="Địa chỉ"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.sdt_kh}
                          onChange={event => updateLine(line.key, { sdt_kh: event.target.value })}
                          className={orderFieldClass}
                          placeholder="SĐT"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.nvql}
                          onChange={event => updateLine(line.key, { nvql: event.target.value })}
                          className={orderFieldClass}
                          placeholder="NVQL"
                        />
                      </div>
                      <div className="min-w-0">
                        <SearchableSelect
                          value={line.ma_san_pham}
                          options={products}
                          onChange={value => selectProduct(line.key, value)}
                          placeholder="Mã SP"
                          getValue={item => (item as OrderProductOption).code}
                          getLabel={item => {
                            const product = item as OrderProductOption;
                            return `${product.code} · ${product.name}`;
                          }}
                          getSearchText={item => {
                            const product = item as OrderProductOption;
                            return `${product.code} ${product.newCode} ${product.name}`;
                          }}
                          displaySelectedAsValue
                          dropdownMinWidth={420}
                          inputClassName={orderFieldClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <textarea
                          value={matched ? matched.name : line.ten_san_pham}
                          readOnly={Boolean(matched)}
                          rows={2}
                          onChange={event => updateLine(line.key, { ten_san_pham: event.target.value })}
                          className={`${orderFieldClass} h-auto min-h-11 resize-y py-2.5 leading-snug ${matched ? 'bg-slate-50' : ''}`}
                          placeholder="Tên SP"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.sl}
                          onChange={event => updateLine(line.key, { sl: event.target.value })}
                          className={`${orderFieldClass} text-right`}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.gia_ban}
                          onChange={event => updateLine(line.key, { gia_ban: event.target.value })}
                          className={`${orderFieldClass} text-right`}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0">
                        <SearchableSelect
                          value={line.thanh_toan}
                          options={[...PAYMENT_OPTIONS]}
                          allowCustomValue
                          onChange={value => updateLine(line.key, { thanh_toan: value })}
                          placeholder="Thanh toán"
                          getValue={item => String(item)}
                          getLabel={item => String(item)}
                          inputClassName={orderFieldClass}
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={
                            line.tong_gia_tri ||
                            (lineAmount(line.sl, line.gia_ban) > 0
                              ? String(lineAmount(line.sl, line.gia_ban))
                              : '')
                          }
                          readOnly
                          className={`${orderFieldClass} bg-slate-50 text-right`}
                          placeholder="0"
                        />
                      </div>
                      <div className="min-w-0">
                        <input
                          value={line.ghi_chu}
                          onChange={event => updateLine(line.key, { ghi_chu: event.target.value })}
                          className={orderFieldClass}
                          placeholder="Ghi chú"
                        />
                      </div>
                      {!editingId && form.lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm(prev => ({
                              ...prev,
                              lines: prev.lines.filter(item => item.key !== line.key)
                            }))
                          }
                          title="Xóa dòng"
                          className="flex h-10 w-full items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 md:w-10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="hidden md:block" />
                      )}
                    </RepeatableLineRow>
                  );
                })}
              </RepeatableLinesBlock>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                disabled={isSaving}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Đang lưu...' : 'Lưu phiếu'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
