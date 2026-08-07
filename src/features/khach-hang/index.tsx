import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Eye, FileUp, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useTabAccess } from '../../app/useTabAccess';
import { pickText } from '../_shared/recordHelpers';
import { normalizeHrBranches } from '../_shared/hr';
import { orderFieldClass } from '../_shared/orderHelpers';
import { showAppToast, showSaveFailure, readApiErrorMessage } from '../../lib/appToast';
import { downloadCustomerExcel, downloadCustomerExcelTemplate, parseCustomerExcel } from '../../utils/customerExcel';
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

export interface StaffOption {
  name: string;
}

export interface CustomerOption {
  id: string;
  dbId: string;
  name: string;
  code: string;
  address: string;
  newAddress: string;
  debt: number;
  taxCode: string;
  phone: string;
  mobilePhoneNlh: string;
  isInternal: boolean;
  managingUnit: string;
  note: string;
}

export interface OrderProductOption {
  code: string;
  name: string;
  unit: string;
  newCode: string;
}

export function normalizeLookupText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function normalizeStaffOptions(data: unknown): StaffOption[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item): StaffOption | null => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name } : null;
      }
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['name', 'nhan_su', 'ho_ten', 'ten'], '');
      return name ? { name } : null;
    })
    .filter((item): item is StaffOption => Boolean(item));
}

export function normalizeDaNangBusinessStaffOptions(data: unknown): StaffOption[] {
  const branches = normalizeHrBranches(data);
  const staff = branches.flatMap(branch =>
    branch.departments.flatMap(department => {
      const departmentText = normalizeLookupText(department.name);
      if (departmentText !== 'phong kinh doanh') return [];
      return department.members.map(member => ({ name: member.name }));
    })
  );

  const seen = new Set<string>();
  return staff
    .filter(item => {
      const key = normalizeLookupText(item.name.trim());
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function pickBoolean(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    return ['true', '1', 'co', 'có', 'x', 'yes'].includes(text);
  }
  return false;
}

function normalizePhoneList(value: string) {
  return value
    .split(/[,;\n]+/)
    .map(phone => phone.trim())
    .filter(Boolean)
    .join(', ');
}

export function normalizeCustomerOptions(data: unknown): CustomerOption[] {
  if (!data || typeof data !== 'object') return [];
  const customers = (data as { customers?: unknown }).customers;
  if (!Array.isArray(customers)) return [];

  return customers
    .map((item): CustomerOption | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = pickText(record, ['ten_khach_hang', 'khach_hang', 'ten', 'name', 'ten_cong_ty'], '');
      const code = pickText(record, ['ma_khach_hang', 'ma_kh', 'code', 'id'], '');
      if (!name && !code) return null;
      return {
        id: code || name,
        dbId: pickText(record, ['id'], ''),
        name: name || code,
        code,
        address: pickText(record, ['dia_chi', 'address'], ''),
        newAddress: pickText(record, ['dia_chi_moi', 'new_address'], ''),
        debt: pickNumber(record, ['cong_no', 'debt']),
        taxCode: pickText(record, ['ma_so_thue', 'ma_so_thue_cccd', 'tax_code'], ''),
        phone: pickText(record, ['so_dien_thoai', 'dien_thoai', 'phone'], ''),
        mobilePhoneNlh: pickText(record, ['dt_di_dong_nlh', 'di_dong_nlh', 'mobile_nlh'], ''),
        isInternal: pickBoolean(record, ['la_doi_tuong_noi_bo', 'is_internal']),
        managingUnit: pickText(record, ['don_vi_quan_ly', 'managing_unit'], ''),
        note: pickText(record, ['ghi_chu', 'note', 'notes'], '')
      };
    })
    .filter((item): item is CustomerOption => Boolean(item));
}

function generateNextCustomerCode(existingCodes: Iterable<string>) {
  let max = 0;
  for (const raw of existingCodes) {
    const code = String(raw || '').trim().toUpperCase();
    const match = code.match(/^KH(\d+)$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > max) max = num;
  }
  const next = max + 1;
  return `KH${String(next).padStart(Math.max(3, String(next).length), '0')}`;
}

type CustomerForm = {
  ma_khach_hang: string;
  ten_khach_hang: string;
  dia_chi: string;
  dia_chi_moi: string;
  cong_no: string;
  ma_so_thue: string;
  so_dien_thoai: string;
  dt_di_dong_nlh: string;
  la_doi_tuong_noi_bo: boolean;
  don_vi_quan_ly: string;
  ghi_chu: string;
};

function emptyForm(code = ''): CustomerForm {
  return {
    ma_khach_hang: code,
    ten_khach_hang: '',
    dia_chi: '',
    dia_chi_moi: '',
    cong_no: '',
    ma_so_thue: '',
    so_dien_thoai: '',
    dt_di_dong_nlh: '',
    la_doi_tuong_noi_bo: false,
    don_vi_quan_ly: '',
    ghi_chu: ''
  };
}

export function CustomersPanel({ onBack }: { onBack: () => void }) {
  const { canCreate, canEdit, canDelete } = useTabAccess('customers');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedCustomerType, setSelectedCustomerType] = useState('all');
  const [selectedManagingUnit, setSelectedManagingUnit] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<CustomerOption | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAddressLookingUp, setIsAddressLookingUp] = useState(false);
  const [addressLookupMessage, setAddressLookupMessage] = useState('');
  const [backfillingAddressIds, setBackfillingAddressIds] = useState<Set<string>>(() => new Set());
  const excelInputRef = useRef<HTMLInputElement>(null);
  const addressLookupSequenceRef = useRef(0);
  const addressBackfillRunRef = useRef(0);

  const backfillMissingCustomerAddresses = async (items: CustomerOption[], run: number) => {
    const candidates = items.filter(
      customer => customer.address.trim() && !customer.newAddress.trim() && (customer.dbId || customer.code)
    );
    if (candidates.length === 0 || run !== addressBackfillRunRef.current) return;

    setBackfillingAddressIds(new Set(candidates.map(customer => customer.dbId || customer.code)));
    let nextIndex = 0;
    let stopBecauseEngineUnavailable = false;

    const worker = async () => {
      while (
        run === addressBackfillRunRef.current &&
        !stopBecauseEngineUnavailable &&
        nextIndex < candidates.length
      ) {
        const customer = candidates[nextIndex++];
        const customerKey = customer.dbId || customer.code;
        try {
          const lookupResponse = await fetch(
            `/api/address-lookup?address=${encodeURIComponent(customer.address)}`
          );
          const lookupData = await lookupResponse.json().catch(() => ({}));
          if (!lookupResponse.ok) {
            if (lookupResponse.status >= 500) stopBecauseEngineUnavailable = true;
            continue;
          }
          if (run !== addressBackfillRunRef.current) return;

          const newAddress =
            lookupData.found && typeof lookupData.new_address === 'string'
              ? lookupData.new_address.trim()
              : '';
          if (!newAddress) continue;

          const saveResponse = await fetch(
            `/api/khach-hang/${encodeURIComponent(customerKey)}/dia-chi-moi`,
            {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dia_chi: customer.address,
              dia_chi_moi: newAddress
            })
            }
          );
          const saveData = await saveResponse.json().catch(() => ({}));
          if (!saveResponse.ok || run !== addressBackfillRunRef.current) continue;

          const savedNewAddress =
            typeof saveData.customer?.dia_chi_moi === 'string'
              ? saveData.customer.dia_chi_moi.trim()
              : newAddress;
          setCustomers(previous =>
            previous.map(current =>
              (current.dbId || current.code) === customerKey && !current.newAddress
                ? { ...current, newAddress: savedNewAddress }
                : current
            )
          );
        } finally {
          if (run === addressBackfillRunRef.current) {
            setBackfillingAddressIds(previous => {
              const next = new Set(previous);
              next.delete(customerKey);
              return next;
            });
          }
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(3, candidates.length) }, () => worker())
    );
    if (run === addressBackfillRunRef.current) {
      setBackfillingAddressIds(new Set());
    }
  };

  const loadCustomers = async () => {
    const run = ++addressBackfillRunRef.current;
    setIsLoading(true);
    setBackfillingAddressIds(new Set());
    setError('');

    try {
      const res = await fetch('/api/khach-hang');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể tải danh sách khách hàng.');
      const normalizedCustomers = normalizeCustomerOptions(data);
      setCustomers(normalizedCustomers);
      void backfillMissingCustomerAddresses(normalizedCustomers, run);
    } catch (loadError: any) {
      setCustomers([]);
      setError(loadError.message || 'Không thể tải danh sách khách hàng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (!formOpen) return;

    const address = form.dia_chi.trim();
    if (address.length < 5 || form.dia_chi_moi.trim()) {
      setIsAddressLookingUp(false);
      return;
    }

    const sequence = ++addressLookupSequenceRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsAddressLookingUp(true);
      setAddressLookupMessage('Đang tự động chuyển đổi địa chỉ...');
      try {
        const response = await fetch(`/api/address-lookup?address=${encodeURIComponent(address)}`, {
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Không thể chuyển đổi địa chỉ.');
        }
        if (sequence !== addressLookupSequenceRef.current) return;

        const newAddress = typeof data.new_address === 'string' ? data.new_address.trim() : '';
        if (data.found && newAddress) {
          setForm(previous =>
            previous.dia_chi.trim() === address
              ? { ...previous, dia_chi_moi: newAddress }
              : previous
          );
          setAddressLookupMessage('Đã tự động chuyển sang địa chỉ mới.');
        } else {
          setAddressLookupMessage(data.note || 'Không tìm thấy địa chỉ mới phù hợp. Bạn có thể nhập thủ công.');
        }
      } catch (lookupError: unknown) {
        if (lookupError instanceof Error && lookupError.name === 'AbortError') return;
        if (sequence !== addressLookupSequenceRef.current) return;
        setAddressLookupMessage(
          lookupError instanceof Error
            ? lookupError.message
            : 'Không thể chuyển đổi địa chỉ. Bạn có thể nhập thủ công.'
        );
      } finally {
        if (sequence === addressLookupSequenceRef.current) {
          setIsAddressLookingUp(false);
        }
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.dia_chi, form.dia_chi_moi, formOpen]);

  const managingUnitFilters = useMemo(
    () =>
      [...new Set<string>(customers.map(customer => customer.managingUnit.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'vi')),
    [customers]
  );

  const hasActiveFilters =
    Boolean(searchText) ||
    selectedCustomerType !== 'all' ||
    selectedManagingUnit !== 'all';

  const resetFilters = () => {
    setSearchText('');
    setSelectedCustomerType('all');
    setSelectedManagingUnit('all');
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredCustomers = useMemo(() => {
    return customers
      .filter(customer => {
        const matchesSearch =
          !normalizedSearch ||
          `${customer.code} ${customer.name} ${customer.address} ${customer.newAddress} ${customer.taxCode} ${customer.phone} ${customer.mobilePhoneNlh} ${customer.managingUnit}`
            .toLowerCase()
            .includes(normalizedSearch);
        const matchesCustomerType =
          selectedCustomerType === 'all' ||
          (selectedCustomerType === 'internal' ? customer.isInternal : !customer.isInternal);
        const matchesManagingUnit =
          selectedManagingUnit === 'all' || customer.managingUnit === selectedManagingUnit;
        return matchesSearch && matchesCustomerType && matchesManagingUnit;
      });
  }, [customers, normalizedSearch, selectedCustomerType, selectedManagingUnit]);

  const openCreate = () => {
    if (!canCreate) return;
    setEditingId(null);
    setForm(emptyForm(generateNextCustomerCode(customers.map(item => item.code))));
    setAddressLookupMessage('');
    setFormOpen(true);
    setError('');
  };

  const openEdit = (customer: CustomerOption) => {
    if (!canEdit) return;
    setEditingId(customer.dbId || customer.id);
    setForm({
      ma_khach_hang: customer.code,
      ten_khach_hang: customer.name,
      dia_chi: customer.address,
      dia_chi_moi: customer.newAddress,
      cong_no: customer.debt ? String(customer.debt) : '',
      ma_so_thue: customer.taxCode,
      so_dien_thoai: customer.phone,
      dt_di_dong_nlh: customer.mobilePhoneNlh,
      la_doi_tuong_noi_bo: customer.isInternal,
      don_vi_quan_ly: customer.managingUnit,
      ghi_chu: customer.note
    });
    setAddressLookupMessage('');
    setFormOpen(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.ten_khach_hang.trim()) {
      setError(showSaveFailure('Vui lòng nhập tên khách hàng.'));
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(
        editingId ? `/api/khach-hang/${encodeURIComponent(editingId)}` : '/api/khach-hang',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ma_khach_hang: form.ma_khach_hang.trim(),
            ten_khach_hang: form.ten_khach_hang.trim(),
            dia_chi: form.dia_chi.trim(),
            dia_chi_moi: form.dia_chi_moi.trim(),
            cong_no: form.cong_no.trim() ? Number(form.cong_no.trim()) : 0,
            ma_so_thue: form.ma_so_thue.trim(),
            so_dien_thoai: normalizePhoneList(form.so_dien_thoai),
            dt_di_dong_nlh: normalizePhoneList(form.dt_di_dong_nlh),
            la_doi_tuong_noi_bo: form.la_doi_tuong_noi_bo,
            don_vi_quan_ly: form.don_vi_quan_ly.trim(),
            ghi_chu: form.ghi_chu.trim()
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          readApiErrorMessage(res, data, editingId ? 'Không thể cập nhật khách hàng.' : 'Không thể thêm khách hàng.')
        );
      }
      showAppToast(editingId ? 'Đã cập nhật khách hàng.' : 'Đã thêm khách hàng.');
      setFormOpen(false);
      setEditingId(null);
      await loadCustomers();
    } catch (saveError: unknown) {
      setError(showSaveFailure(saveError, editingId ? 'Không thể cập nhật khách hàng.' : 'Không thể thêm khách hàng.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (customer: CustomerOption) => {
    const targetId = customer.dbId || customer.id;
    if (!window.confirm(`Xóa khách hàng ${customer.code ? `${customer.code} - ` : ''}${customer.name}?`)) return;

    setDeletingId(targetId);
    setError('');
    try {
      const res = await fetch(`/api/khach-hang/${encodeURIComponent(targetId)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không thể xóa khách hàng.'));
      }
      showAppToast('Đã xóa khách hàng.');
      await loadCustomers();
    } catch (deleteError: unknown) {
      setError(showSaveFailure(deleteError, 'Không thể xóa khách hàng.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleExcelImport = async (file?: File | null) => {
    if ((!canCreate && !canEdit) || !file) return;

    setIsImporting(true);
    setError('');
    try {
      const rows = await parseCustomerExcel(file);
      if (rows.length === 0) throw new Error('File Excel không có dòng dữ liệu khách hàng.');

      const byCode = new Map(
        customers
          .map(item => [item.code.trim().toUpperCase(), item] as const)
          .filter(([code]) => Boolean(code))
      );
      const generatedCodes = customers.map(item => item.code).filter(Boolean);

      let created = 0;
      let updated = 0;
      const failures: string[] = [];
      const seenFileCodes = new Set<string>();

      for (const row of rows) {
        const name = row.name.trim();
        if (!name) {
          failures.push(`dòng ${row.rowNumber}: thiếu tên khách hàng`);
          continue;
        }

        let code = row.code.trim();
        if (!code) {
          code = generateNextCustomerCode(generatedCodes);
          generatedCodes.push(code);
        }

        const codeKey = code.toUpperCase();
        if (seenFileCodes.has(codeKey)) {
          failures.push(`dòng ${row.rowNumber}: mã ${code} trùng trong file`);
          continue;
        }
        seenFileCodes.add(codeKey);

        const payload = {
          ma_khach_hang: code,
          ten_khach_hang: name,
          dia_chi: row.address.trim(),
          dia_chi_moi: row.newAddress.trim(),
          cong_no: row.debt.trim() ? Number(String(row.debt).trim().replace(',', '.')) || 0 : 0,
          ma_so_thue: row.taxCode.trim(),
          so_dien_thoai: normalizePhoneList(row.phone),
          dt_di_dong_nlh: normalizePhoneList(row.mobilePhoneNlh),
          la_doi_tuong_noi_bo: ['true', '1', 'co', 'có', 'x', 'yes'].includes(
            row.isInternal.trim().toLowerCase()
          ),
          don_vi_quan_ly: row.managingUnit.trim(),
          ghi_chu: row.note.trim()
        };

        const existing = byCode.get(codeKey);
        const res = existing
          ? await fetch(`/api/khach-hang/${encodeURIComponent(existing.code || existing.id)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
          : await fetch('/api/khach-hang', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failures.push(`dòng ${row.rowNumber}: ${readApiErrorMessage(res, data, 'Không lưu được')}`);
          continue;
        }

        if (existing) {
          updated += 1;
        } else {
          created += 1;
          byCode.set(codeKey, {
            id: code,
            dbId: '',
            code,
            name,
            address: payload.dia_chi,
            newAddress: payload.dia_chi_moi,
            debt: Number(payload.cong_no) || 0,
            taxCode: payload.ma_so_thue,
            phone: payload.so_dien_thoai,
            mobilePhoneNlh: payload.dt_di_dong_nlh,
            isInternal: payload.la_doi_tuong_noi_bo,
            managingUnit: payload.don_vi_quan_ly,
            note: payload.ghi_chu
          });
          if (!generatedCodes.some(item => item.toUpperCase() === codeKey)) {
            generatedCodes.push(code);
          }
        }
      }

      if (created > 0 || updated > 0) {
        await loadCustomers();
      }

      const summary = [
        created || updated ? `Đã nhập Excel: thêm ${created}, cập nhật ${updated}.` : 'Không nhập được dòng nào.',
        failures.length ? `${failures.length} dòng lỗi (${failures.slice(0, 3).join('; ')}).` : ''
      ]
        .filter(Boolean)
        .join(' ');

      if (created > 0 || updated > 0) showAppToast(summary);
      else setError(summary);
    } catch (importError: unknown) {
      setError(showSaveFailure(importError, 'Không thể đọc hoặc nhập file Excel.'));
    } finally {
      setIsImporting(false);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto w-full max-w-none space-y-4">
      <section className="rounded-2xl border-2 border-zinc-900/10 bg-white p-3 shadow-sm lg:flex lg:items-center lg:justify-end lg:gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadCustomerExcelTemplate()}
            disabled={isImporting || isLoading}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
            title="Tải file mẫu nhập khách hàng (ô trống vẫn được)"
          >
            <Download className="h-4 w-4" />
            Tải mẫu Excel
          </button>
          <button
            type="button"
            onClick={() => downloadCustomerExcel(customers)}
            disabled={isImporting || isLoading || customers.length === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
            title="Xuất danh sách khách hàng hiện tại"
          >
            <Download className="h-4 w-4" />
            Xuất Excel
          </button>
          {canCreate || canEdit ? (
            <button
              type="button"
              onClick={() => excelInputRef.current?.click()}
              disabled={isImporting || isLoading}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {isImporting ? 'Đang nhập...' : 'Tải Excel lên'}
            </button>
          ) : null}
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={event => void handleExcelImport(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={loadCustomers}
            disabled={isLoading}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Đang tải...' : 'Tải lại'}
          </button>
          {canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#ef1b2d] px-4 text-sm font-extrabold text-white transition hover:bg-[#b30d1c]"
            >
              <Plus className="h-4 w-4" />
              Thêm khách hàng
            </button>
          ) : null}
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </section>
      )}

      <TableToolbar
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
      >
        <TableSearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Tìm mã, tên, địa chỉ, MST, điện thoại..."
          disabled={isLoading}
        />

        <FilterCombobox
          label="Đối tượng"
          options={['internal', 'external']}
          value={selectedCustomerType}
          onChange={setSelectedCustomerType}
          searchPlaceholder="Tìm loại đối tượng..."
          compact
          searchable={false}
          formatOption={value => (value === 'internal' ? 'Nội bộ' : 'Khách hàng')}
        />

        <FilterCombobox
          label="Đơn vị quản lý"
          options={managingUnitFilters}
          value={selectedManagingUnit}
          onChange={setSelectedManagingUnit}
          searchPlaceholder="Tìm đơn vị quản lý..."
          compact
        />

      </TableToolbar>

      <TableShell
        minWidthClassName="min-w-[1320px]"
      >
        <TableHead>
          <TableHeadCell>STT</TableHeadCell>
          <TableHeadCell>Mã khách hàng</TableHeadCell>
          <TableHeadCell>Tên khách hàng</TableHeadCell>
          <TableHeadCell>Địa chỉ cũ</TableHeadCell>
          <TableHeadCell>Địa chỉ mới</TableHeadCell>
          <TableHeadCell>Công nợ</TableHeadCell>
          <TableHeadCell>Mã số thuế/CCCD chủ hộ</TableHeadCell>
          <TableHeadCell>Điện thoại</TableHeadCell>
          <TableHeadCell>ĐT di động NLH</TableHeadCell>
          <TableHeadCell>Là Đối tượng nội bộ</TableHeadCell>
          <TableHeadCell>Đơn vị Quản lý</TableHeadCell>
          <TableHeadCell align="center">Thao tác</TableHeadCell>
        </TableHead>
        <TableBody>
          {isLoading ? (
            <tr>
              <td colSpan={12} className="px-4 py-10 text-center font-bold text-zinc-400">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Đang tải khách hàng...
              </td>
            </tr>
          ) : filteredCustomers.length === 0 ? (
            <TableEmptyRow colSpan={12}>Chưa có khách hàng phù hợp.</TableEmptyRow>
          ) : (
            filteredCustomers.map((customer, index) => (
              <React.Fragment key={customer.id}>
                <TableRow>
                  <td className="px-4 py-3 font-black text-[#ef1b2d]">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-zinc-900">{customer.code || '-'}</td>
                  <td className="px-4 py-3 font-normal text-zinc-950">{customer.name}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{customer.address || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">
                    {customer.newAddress ? (
                      customer.newAddress
                    ) : backfillingAddressIds.has(customer.dbId || customer.code) ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-sky-600">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Đang chuyển...
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">
                    {customer.debt ? customer.debt.toLocaleString('vi-VN') : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-700">{customer.taxCode || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{customer.phone || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{customer.mobilePhoneNlh || '-'}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">
                    {customer.isInternal ? 'Có' : 'Không'}
                  </td>
                  <td className="px-4 py-3 font-semibold text-zinc-700">{customer.managingUnit || '-'}</td>
                  <td className="px-4 py-3">
                    <RowActionsMenu label={`Thao tác ${customer.name}`}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingCustomer(customer)}
                        title="Xem"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          title="Sửa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 text-sky-700 transition hover:bg-sky-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(customer)}
                          disabled={deletingId === (customer.dbId || customer.id)}
                          title="Xóa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deletingId === (customer.dbId || customer.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </div>
                    </RowActionsMenu>
                  </td>
                </TableRow>
              </React.Fragment>
            ))
          )}
        </TableBody>
      </TableShell>

      {formOpen ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                  {editingId ? 'Sửa khách hàng' : 'Thêm khách hàng'}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {editingId ? 'Cập nhật thông tin khách hàng' : 'Nhập thông tin khách hàng mới'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-x-4 gap-y-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-5">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Mã khách hàng</span>
                <input
                  value={form.ma_khach_hang}
                  onChange={event => setForm(prev => ({ ...prev, ma_khach_hang: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="KH001"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Tên khách hàng *
                </span>
                <input
                  value={form.ten_khach_hang}
                  onChange={event => setForm(prev => ({ ...prev, ten_khach_hang: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="Tên công ty / khách hàng"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Địa chỉ cũ</span>
                <input
                  value={form.dia_chi}
                  onChange={event => {
                    setAddressLookupMessage('');
                    setForm(prev => ({
                      ...prev,
                      dia_chi: event.target.value,
                      dia_chi_moi: ''
                    }));
                  }}
                  className={orderFieldClass}
                  placeholder="Địa chỉ cũ"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Địa chỉ mới</span>
                <input
                  value={form.dia_chi_moi}
                  onChange={event => setForm(prev => ({ ...prev, dia_chi_moi: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="Địa chỉ mới"
                />
                {(isAddressLookingUp || addressLookupMessage) && (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-semibold ${
                      isAddressLookingUp ? 'text-sky-600' : 'text-slate-500'
                    }`}
                  >
                    {isAddressLookingUp && <Loader2 className="h-3 w-3 animate-spin" />}
                    {addressLookupMessage}
                  </span>
                )}
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Công nợ</span>
                <input
                  type="number"
                  value={form.cong_no}
                  onChange={event => setForm(prev => ({ ...prev, cong_no: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="0"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Mã số thuế/CCCD chủ hộ
                </span>
                <input
                  value={form.ma_so_thue}
                  onChange={event => setForm(prev => ({ ...prev, ma_so_thue: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="Mã số thuế hoặc CCCD chủ hộ"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Điện thoại liên hệ
                </span>
                <input
                  value={form.so_dien_thoai}
                  onChange={event => setForm(prev => ({ ...prev, so_dien_thoai: event.target.value }))}
                  onBlur={() =>
                    setForm(prev => ({ ...prev, so_dien_thoai: normalizePhoneList(prev.so_dien_thoai) }))
                  }
                  className={orderFieldClass}
                  placeholder="0123456789, 0213456789"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  ĐT di động người liên hệ
                </span>
                <input
                  value={form.dt_di_dong_nlh}
                  onChange={event => setForm(prev => ({ ...prev, dt_di_dong_nlh: event.target.value }))}
                  onBlur={() =>
                    setForm(prev => ({ ...prev, dt_di_dong_nlh: normalizePhoneList(prev.dt_di_dong_nlh) }))
                  }
                  className={orderFieldClass}
                  placeholder="0901234567, 0912345678"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Đơn vị Quản lý
                </span>
                <input
                  value={form.don_vi_quan_ly}
                  onChange={event => setForm(prev => ({ ...prev, don_vi_quan_ly: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="Đơn vị / chi nhánh quản lý"
                />
              </label>
              <label className="flex min-h-[42px] items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50 px-3">
                <input
                  type="checkbox"
                  checked={form.la_doi_tuong_noi_bo}
                  onChange={event => setForm(prev => ({ ...prev, la_doi_tuong_noi_bo: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#ef1b2d] focus:ring-[#ef1b2d]"
                />
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Là Đối tượng nội bộ
                </span>
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ghi chú</span>
                <input
                  value={form.ghi_chu}
                  onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))}
                  className={orderFieldClass}
                  placeholder="Ghi chú thêm"
                />
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
                disabled={isSaving}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving || isAddressLookingUp}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {isSaving || isAddressLookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSaving ? 'Đang lưu...' : isAddressLookingUp ? 'Đang chuyển...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {viewingCustomer ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Thông tin khách hàng</h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">{viewingCustomer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              {[
                ['Mã khách hàng', viewingCustomer.code || '-'],
                ['Tên khách hàng', viewingCustomer.name || '-'],
                ['Địa chỉ cũ', viewingCustomer.address || '-'],
                ['Địa chỉ mới', viewingCustomer.newAddress || '-'],
                ['Công nợ', viewingCustomer.debt ? viewingCustomer.debt.toLocaleString('vi-VN') : '-'],
                ['Mã số thuế/CCCD chủ hộ', viewingCustomer.taxCode || '-'],
                ['Điện thoại', viewingCustomer.phone || '-'],
                ['ĐT di động NLH', viewingCustomer.mobilePhoneNlh || '-'],
                ['Là Đối tượng nội bộ', viewingCustomer.isInternal ? 'Có' : 'Không'],
                ['Đơn vị Quản lý', viewingCustomer.managingUnit || '-'],
                ['Ghi chú', viewingCustomer.note || '-']
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
                  <span className="text-right text-sm font-bold text-slate-900">{value}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    const customer = viewingCustomer;
                    setViewingCustomer(null);
                    if (customer) openEdit(customer);
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white"
                >
                  <Pencil className="h-4 w-4" />
                  Sửa
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
