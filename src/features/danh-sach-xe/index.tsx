import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon as IconifyIcon } from '@iconify/react';
import vehicle3d from '@iconify-icons/fluent-emoji/delivery-truck';
import delivery3d from '@iconify-icons/fluent-emoji/package';
import expense3d from '@iconify-icons/fluent-emoji/receipt';
import mileage3d from '@iconify-icons/fluent-emoji/motorway';
import payment3d from '@iconify-icons/fluent-emoji/money-bag';
import route3d from '@iconify-icons/fluent-emoji/world-map';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  FolderOpen,
  ImagePlus,
  Info,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { BackButton } from '../../components/layout/NavButtons';
import { normalizeHrBranches } from '../_shared/hr';
import {
  cloudinaryPreviewUrl,
  fileToOptimizedImageDataUrl,
  uploadImage
} from '../_shared/recordHelpers';
import { useTabAccess } from '../../app/useTabAccess';
import {
  FilterCombobox,
  StatusBadge,
  TableBody,
  TableEmptyRow,
  TableHead,
  TableHeadCell,
  TableRow,
  TableSearchInput,
  TableShell,
  TableToolbar,
  RowActionsMenu,
  type StatusBadgeColor
} from '../../components/shared/table';
import {
  CustomerPaymentsView,
  VehicleDeliveryRequestsView,
  VehicleDeliveryRouteView,
  VehicleExpensesView,
  VehicleKmLogsView,
  VehicleLogsView
} from './VehicleOperations';
type Vehicle = {
  id: string;
  loai_xe: string;
  bien_so_xe: string;
  ma_tai_xe: string;
  tai_xe_phu_trach: string;
  giay_to: VehicleDocument[];
  trang_thai: string;
  ghi_chu: string;
};

type VehicleDocumentImage = {
  url: string;
  public_id: string;
};

type VehicleDocument = {
  stt: number;
  ten_giay_to: string;
  anh: VehicleDocumentImage[];
};

type DriverOption = {
  code: string;
  name: string;
};

type DriverReconciliation = {
  id: string;
  nam: number;
  thang: number;
  ma_nhan_su: string;
  ten_tai_xe: string;
  xe_id: string;
  loai_xe_di: string;
  bien_so_xe: string;
  tong_cong_quy_doi: number;
  so_chuyen_di: number;
  tong_km_thuc_te: number;
  tien_thuong_luat: number;
  tien_thuong_chuyen: number;
  thuong_doanh_so: number;
  doanh_so: number;
  ghi_chu: string;
};

type VehicleForm = Omit<Vehicle, 'id'>;

type VehicleView = 'vehicles' | 'reconciliation' | 'delivery' | 'route' | 'expenses' | 'logs' | 'km_log' | 'payments';

const VEHICLE_VIEW_CARDS = [
  {
    view: 'vehicles',
    title: 'Danh sách xe',
    desc: 'Quản lý phương tiện và tài xế phụ trách.',
    icon3d: vehicle3d
  },
  {
    view: 'delivery',
    title: 'Yêu cầu xuất hàng',
    desc: 'Theo dõi yêu cầu giao và xuất hàng theo xe.',
    icon3d: delivery3d
  },
  {
    view: 'route',
    title: 'Tuyến',
    desc: 'Sắp thứ tự giao hàng từng khách theo ngày và xe.',
    icon3d: route3d
  },
  {
    view: 'expenses',
    title: 'Chi phí xe',
    desc: 'Ghi nhận nhiên liệu, sửa chữa và chi phí vận hành.',
    icon3d: expense3d
  },
  {
    view: 'logs',
    title: 'Nhật ký KM xe',
    desc: 'Theo dõi số KM đi, về và hành trình xe.',
    icon3d: mileage3d
  },
  {
    view: 'payments',
    title: 'Thu tiền khách hàng',
    desc: 'Ghi nhận các khoản tiền thu theo chuyến giao hàng.',
    icon3d: payment3d
  }
] as const;
type ReconciliationForm = Omit<DriverReconciliation, 'id'>;

const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = currentDate.getMonth() + 1;

const emptyVehicleForm = (): VehicleForm => ({
  loai_xe: '',
  bien_so_xe: '',
  ma_tai_xe: '',
  tai_xe_phu_trach: '',
  giay_to: [
    { stt: 1, ten_giay_to: 'Đăng kiểm', anh: [] },
    { stt: 2, ten_giay_to: 'Bằng lái', anh: [] }
  ],
  trang_thai: 'Đang sử dụng',
  ghi_chu: ''
});

const emptyReconciliationForm = (): ReconciliationForm => ({
  nam: currentYear,
  thang: currentMonth,
  ma_nhan_su: '',
  ten_tai_xe: '',
  xe_id: '',
  loai_xe_di: '',
  bien_so_xe: '',
  tong_cong_quy_doi: 0,
  so_chuyen_di: 0,
  tong_km_thuc_te: 0,
  tien_thuong_luat: 0,
  tien_thuong_chuyen: 0,
  thuong_doanh_so: 0,
  doanh_so: 0,
  ghi_chu: ''
});

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeVehicleDocuments(value: unknown): VehicleDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => {
      const rawImages = Array.isArray(item.anh) ? item.anh : Array.isArray(item.images) ? item.images : [];
      return {
        stt: index + 1,
        ten_giay_to: text(item.ten_giay_to ?? item.name),
        anh: rawImages
          .filter((image): image is Record<string, unknown> => Boolean(image && typeof image === 'object'))
          .map(image => ({
            url: text(image.url ?? image.imageUrl),
            public_id: text(image.public_id ?? image.imagePublicId)
          }))
          .filter(image => image.url)
      };
    });
}

function normalizeVehicles(data: unknown): Vehicle[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { vehicles?: unknown }).vehicles)
    ? (data as { vehicles: unknown[] }).vehicles
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      loai_xe: text(row.loai_xe),
      bien_so_xe: text(row.bien_so_xe),
      ma_tai_xe: text(row.ma_tai_xe),
      tai_xe_phu_trach: text(row.tai_xe_phu_trach),
      giay_to: normalizeVehicleDocuments(row.giay_to),
      trang_thai: text(row.trang_thai) || 'Đang sử dụng',
      ghi_chu: text(row.ghi_chu)
    }));
}

function normalizeReconciliationRows(data: unknown): DriverReconciliation[] {
  const rows = data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)
    ? (data as { rows: unknown[] }).rows
    : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(row => ({
      id: text(row.id),
      nam: numberValue(row.nam),
      thang: numberValue(row.thang),
      ma_nhan_su: text(row.ma_nhan_su),
      ten_tai_xe: text(row.ten_tai_xe),
      xe_id: text(row.xe_id),
      loai_xe_di: text(row.loai_xe_di),
      bien_so_xe: text(row.bien_so_xe),
      tong_cong_quy_doi: numberValue(row.tong_cong_quy_doi),
      so_chuyen_di: numberValue(row.so_chuyen_di),
      tong_km_thuc_te: numberValue(row.tong_km_thuc_te),
      tien_thuong_luat: numberValue(row.tien_thuong_luat),
      tien_thuong_chuyen: numberValue(row.tien_thuong_chuyen),
      thuong_doanh_so: numberValue(row.thuong_doanh_so),
      doanh_so: numberValue(row.doanh_so),
      ghi_chu: text(row.ghi_chu)
    }));
}

const VEHICLE_STATUS_OPTIONS = ['Đang sử dụng', 'Bảo dưỡng', 'Tạm ngưng', 'Thanh lý'];

function vehicleStatusColor(status: string): StatusBadgeColor {
  if (status === 'Đang sử dụng') return 'emerald';
  if (status === 'Bảo dưỡng') return 'amber';
  if (status === 'Thanh lý') return 'rose';
  return 'zinc';
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0)} đ`;
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Không thể xử lý yêu cầu.');
  }
  return data;
}

export function VehiclesPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { id: string; name: string } | null;
}) {
  const { canCreate, canEdit, canDelete } = useTabAccess('vehicles');
  const [activeView, setActiveView] = useState<VehicleView | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rows, setRows] = useState<DriverReconciliation[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [staff, setStaff] = useState<DriverOption[]>([]);
  const [search, setSearch] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('all');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [error, setError] = useState('');
  const [vehicleWarning, setVehicleWarning] = useState('');
  const [rowWarning, setRowWarning] = useState('');
  const [viewingVehicle, setViewingVehicle] = useState<Vehicle | null>(null);
  const [vehicleModal, setVehicleModal] = useState<{ mode: 'create' | 'edit'; vehicle?: Vehicle } | null>(null);
  const [rowModal, setRowModal] = useState<{ mode: 'create' | 'edit'; row?: DriverReconciliation } | null>(null);

  const loadVehicles = useCallback(async () => {
    setIsLoadingVehicles(true);
    setError('');
    try {
      const data = await readJsonResponse(await fetch('/api/danh-sach-xe'));
      setVehicles(normalizeVehicles(data));
      setVehicleWarning(text(data.warning));
    } catch (loadError: any) {
      setVehicles([]);
      setError(loadError.message || 'Không thể tải danh sách xe.');
    } finally {
      setIsLoadingVehicles(false);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setIsLoadingRows(true);
    setError('');
    try {
      const params = new URLSearchParams({ nam: String(year), thang: String(month) });
      const data = await readJsonResponse(await fetch(`/api/doi-chieu-lai-xe?${params.toString()}`));
      setRows(normalizeReconciliationRows(data));
      setRowWarning(text(data.warning));
    } catch (loadError: any) {
      setRows([]);
      setError(loadError.message || 'Không thể tải bảng đối chiếu lái xe.');
    } finally {
      setIsLoadingRows(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadVehicles();
    void (async () => {
      try {
        const data = await readJsonResponse(await fetch('/api/nhan-su?format=groups&scope=all'));
        const people = normalizeHrBranches(data)
          .flatMap(branch =>
            branch.departments.flatMap(department =>
              department.members.map(member => ({ member, departmentName: department.name }))
            )
          );
        const allOptions = people.map(({ member }) => ({ code: member.code || '', name: member.name }));
        setStaff(
          [...new Map(allOptions.map(person => [`${person.code}|${person.name}`, person])).values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        );
        const options = people
          .filter(({ member, departmentName }) =>
            /lái xe|tài xế|lai xe|tai xe/i.test(`${departmentName} ${member.role} ${member.position || ''}`)
          )
          .map(({ member }) => ({ code: member.code || '', name: member.name }));
        setDrivers(
          [...new Map(options.map(driver => [`${driver.code}|${driver.name}`, driver])).values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        );
      } catch {
        setDrivers([]);
        setStaff([]);
      }
    })();
  }, [loadVehicles]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const vehicleTypeFilterOptions = useMemo(() => {
    const types = new Set<string>();
    vehicles.forEach(vehicle => {
      if (vehicle.loai_xe.trim()) types.add(vehicle.loai_xe.trim());
    });
    return [...types].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vehicles.filter(vehicle => {
      if (vehicleStatusFilter !== 'all' && vehicle.trang_thai !== vehicleStatusFilter) return false;
      if (vehicleTypeFilter !== 'all' && vehicle.loai_xe !== vehicleTypeFilter) return false;
      if (!query) return true;
      return `${vehicle.id} ${vehicle.loai_xe} ${vehicle.bien_so_xe} ${vehicle.tai_xe_phu_trach} ${vehicle.trang_thai} ${vehicle.giay_to.map(document => document.ten_giay_to).join(' ')}`
        .toLowerCase()
        .includes(query);
    });
  }, [search, vehicles, vehicleStatusFilter, vehicleTypeFilter]);

  const hasActiveVehicleFilters = Boolean(search.trim()) || vehicleStatusFilter !== 'all' || vehicleTypeFilter !== 'all';

  const resetVehicleFilters = () => {
    setSearch('');
    setVehicleStatusFilter('all');
    setVehicleTypeFilter('all');
  };

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          tong_cong_quy_doi: sum.tong_cong_quy_doi + row.tong_cong_quy_doi,
          so_chuyen_di: sum.so_chuyen_di + row.so_chuyen_di,
          tong_km_thuc_te: sum.tong_km_thuc_te + row.tong_km_thuc_te,
          tien_thuong_luat: sum.tien_thuong_luat + row.tien_thuong_luat,
          tien_thuong_chuyen: sum.tien_thuong_chuyen + row.tien_thuong_chuyen,
          thuong_doanh_so: sum.thuong_doanh_so + row.thuong_doanh_so,
          doanh_so: sum.doanh_so + row.doanh_so
        }),
        {
          tong_cong_quy_doi: 0,
          so_chuyen_di: 0,
          tong_km_thuc_te: 0,
          tien_thuong_luat: 0,
          tien_thuong_chuyen: 0,
          thuong_doanh_so: 0,
          doanh_so: 0
        }
      ),
    [rows]
  );

  const deleteVehicle = async (vehicle: Vehicle) => {
    if (!window.confirm(`Xóa xe ${vehicle.bien_so_xe}?`)) return;
    try {
      await readJsonResponse(await fetch(`/api/danh-sach-xe/${encodeURIComponent(vehicle.id)}`, { method: 'DELETE' }));
      await loadVehicles();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa xe.');
    }
  };

  const deleteRow = async (row: DriverReconciliation) => {
    if (!window.confirm(`Xóa dòng đối chiếu của ${row.ten_tai_xe}?`)) return;
    try {
      await readJsonResponse(await fetch(`/api/doi-chieu-lai-xe/${encodeURIComponent(row.id)}`, { method: 'DELETE' }));
      await loadRows();
    } catch (deleteError: any) {
      setError(deleteError.message || 'Không thể xóa dòng đối chiếu.');
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1680px] space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BackButton
              onClick={() => {
                if (activeView) {
                  setActiveView(null);
                  setError('');
                  return;
                }
                onBack();
              }}
            />
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-bold text-slate-900">Quản lý xe & lái xe</h2>
              <p className="text-[11px] font-medium text-slate-500">Danh mục, chi phí, nhật ký và đối chiếu lái xe</p>
            </div>
          </div>
          {activeView === 'vehicles' && canCreate ? (
            <button
              type="button"
              onClick={() => setVehicleModal({ mode: 'create' })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white transition hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              Thêm xe
            </button>
          ) : null}
        </div>
        {!activeView && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {VEHICLE_VIEW_CARDS.map(card => (
                <button
                  key={card.view}
                  type="button"
                  onClick={() => setActiveView(card.view)}
                  className="group flex min-h-[92px] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm ring-1 ring-slate-200/80 transition group-hover:scale-105">
                    <IconifyIcon icon={card.icon3d} className="h-10 w-10 drop-shadow-sm" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold text-slate-900">
                      {card.title}
                    </span>
                    <span className="mt-1 block text-[10.5px] font-medium leading-snug text-slate-500">
                      {card.desc}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        )}
      </section>

      {activeView && error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      {(activeView === 'vehicles' ? vehicleWarning : activeView === 'reconciliation' ? rowWarning : '') && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          {activeView === 'vehicles' ? vehicleWarning : rowWarning}
        </p>
      )}

      {activeView && (activeView === 'vehicles' ? (
        <>
          <TableToolbar
            hasActiveFilters={hasActiveVehicleFilters}
            onResetFilters={resetVehicleFilters}
            isLoading={isLoadingVehicles}
          >
            <TableSearchInput
              value={search}
              onChange={setSearch}
              placeholder="Tìm biển số, loại xe, tài xế..."
            />
            <FilterCombobox
              label="Trạng thái"
              options={VEHICLE_STATUS_OPTIONS}
              value={vehicleStatusFilter}
              onChange={setVehicleStatusFilter}
              compact
            />
            <FilterCombobox
              label="Loại xe"
              options={vehicleTypeFilterOptions}
              value={vehicleTypeFilter}
              onChange={setVehicleTypeFilter}
              compact
            />
          </TableToolbar>

          <div className="hidden md:block">
            <TableShell minWidthClassName="min-w-[1080px]">
              <TableHead>
                <TableHeadCell>ID</TableHeadCell>
                <TableHeadCell>Loại xe</TableHeadCell>
                <TableHeadCell>BSX</TableHeadCell>
                <TableHeadCell>Tài xế phụ trách</TableHeadCell>
                <TableHeadCell>Giấy tờ</TableHeadCell>
                <TableHeadCell>Trạng thái</TableHeadCell>
                <TableHeadCell>Ghi chú</TableHeadCell>
                <TableHeadCell align="center">Thao tác</TableHeadCell>
              </TableHead>
              <TableBody>
                {filteredVehicles.map(vehicle => (
                  <React.Fragment key={vehicle.id}>
                    <TableRow>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{vehicle.id}</td>
                      <td className="px-4 py-2.5 font-bold text-zinc-800">{vehicle.loai_xe || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-sm font-black text-brand-700">{vehicle.bien_so_xe}</td>
                      <td className="px-4 py-2.5 font-semibold text-zinc-700">
                        {vehicle.tai_xe_phu_trach || 'Chưa phân công'}
                        {vehicle.ma_tai_xe && <span className="ml-1 text-[10px] text-zinc-400">({vehicle.ma_tai_xe})</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {vehicle.giay_to.length > 0 ? (
                          <div className="flex max-w-[240px] flex-wrap gap-1">
                            {vehicle.giay_to.map(document => (
                              <span key={`${document.stt}-${document.ten_giay_to}`} className="rounded-md bg-sky-50 px-1.5 py-1 text-[9px] font-bold text-sky-700">
                                {document.ten_giay_to || `Giấy tờ ${document.stt}`} · {document.anh.length} ảnh
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={vehicle.trang_thai} color={vehicleStatusColor(vehicle.trang_thai)} />
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-2.5 text-zinc-500" title={vehicle.ghi_chu}>
                        {vehicle.ghi_chu || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <RowActionsMenu label={`Thao tác ${vehicle.bien_so_xe}`}>
                        <div className="flex justify-center gap-1">
                          <IconButton label="Xem chi tiết" onClick={() => setViewingVehicle(vehicle)}>
                            <Eye className="h-3.5 w-3.5" />
                          </IconButton>
                          {canEdit ? (
                            <IconButton label="Sửa" onClick={() => setVehicleModal({ mode: 'edit', vehicle })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </IconButton>
                          ) : null}
                          {canDelete ? (
                            <IconButton label="Xóa" danger onClick={() => void deleteVehicle(vehicle)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          ) : null}
                        </div>
                        </RowActionsMenu>
                      </td>
                    </TableRow>
                  </React.Fragment>
                ))}
                {!isLoadingVehicles && filteredVehicles.length === 0 && (
                  <TableEmptyRow colSpan={8}>Chưa có xe phù hợp bộ lọc.</TableEmptyRow>
                )}
              </TableBody>
            </TableShell>
          </div>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:hidden">
            <div className="divide-y divide-slate-100">
              {filteredVehicles.map(vehicle => (
                <article key={vehicle.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-base font-black text-brand-700">{vehicle.bien_so_xe}</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-700">{vehicle.loai_xe}</p>
                    </div>
                    <RowActionsMenu label={`Thao tác ${vehicle.bien_so_xe}`}>
                    <div className="flex gap-1">
                      <IconButton label="Xem chi tiết" onClick={() => setViewingVehicle(vehicle)}>
                        <Eye className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Sửa" onClick={() => setVehicleModal({ mode: 'edit', vehicle })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label="Xóa" danger onClick={() => void deleteVehicle(vehicle)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                    </RowActionsMenu>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">Tài xế: {vehicle.tai_xe_phu_trach || 'Chưa phân công'}</p>
                  {vehicle.giay_to.length > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-sky-700">
                      Giấy tờ: {vehicle.giay_to.map(document => `${document.ten_giay_to} (${document.anh.length} ảnh)`).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">{vehicle.trang_thai} · ID {vehicle.id}</p>
                </article>
              ))}
            </div>
            {!isLoadingVehicles && filteredVehicles.length === 0 && <EmptyState text="Chưa có xe phù hợp bộ lọc." />}
            {isLoadingVehicles && <LoadingState text="Đang tải danh sách xe..." />}
          </section>
        </>
      ) : activeView === 'reconciliation' ? (
        <>
          <section className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Năm</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={event => setYear(Number(event.target.value) || currentYear)}
                className="block h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-brand-400"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Tháng</span>
              <select
                value={month}
                onChange={event => setMonth(Number(event.target.value))}
                className="block h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-brand-400"
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map(value => (
                  <option key={value} value={value}>Tháng {value}</option>
                ))}
              </select>
            </label>
            <span className="ml-auto text-xs font-bold text-slate-500">{rows.length} dòng đối chiếu</span>
          </section>

          <p className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[10px] font-bold text-sky-700 md:hidden">
            Vuốt ngang bảng để xem đầy đủ các chỉ tiêu.
          </p>

          <TableShell minWidthClassName="min-w-[1540px]">
            <TableHead>
              <TableHeadCell>Năm</TableHeadCell>
              <TableHeadCell>Tháng</TableHeadCell>
              <TableHeadCell>Tên NV</TableHeadCell>
              <TableHeadCell>Loại xe đi</TableHeadCell>
              <TableHeadCell align="center">Công quy đổi</TableHeadCell>
              <TableHeadCell align="center">Số chuyến</TableHeadCell>
              <TableHeadCell align="center">KM thực tế</TableHeadCell>
              <TableHeadCell align="center">Thưởng luật</TableHeadCell>
              <TableHeadCell align="center">Thưởng chuyến</TableHeadCell>
              <TableHeadCell align="center">Thưởng doanh số</TableHeadCell>
              <TableHeadCell align="center">Doanh số</TableHeadCell>
              <TableHeadCell align="center">Thao tác</TableHeadCell>
            </TableHead>
            <TableBody>
              {rows.map(row => (
                <React.Fragment key={row.id}>
                  <TableRow>
                    <td className="px-2.5 py-2.5 text-[11px]">{row.nam}</td>
                    <td className="px-2.5 py-2.5 text-[11px]">Tháng {row.thang}</td>
                    <td className="px-2.5 py-2.5 text-[11px] font-bold text-zinc-800">
                      {row.ten_tai_xe}
                      {row.ma_nhan_su && <span className="ml-1 text-[9px] text-zinc-400">({row.ma_nhan_su})</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-[11px] font-semibold">
                      {row.loai_xe_di || '—'}
                      {row.bien_so_xe && <span className="ml-1 font-mono text-brand-700">· {row.bien_so_xe}</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-right text-[11px]">{formatNumber(row.tong_cong_quy_doi)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px]">{formatNumber(row.so_chuyen_di)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px]">{formatNumber(row.tong_km_thuc_te)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px] text-violet-700">{formatMoney(row.tien_thuong_luat)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px] text-violet-700">{formatMoney(row.tien_thuong_chuyen)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px] text-violet-700">{formatMoney(row.thuong_doanh_so)}</td>
                    <td className="px-2.5 py-2.5 text-right text-[11px] font-bold text-emerald-700">{formatMoney(row.doanh_so)}</td>
                    <td className="px-2.5 py-2.5">
                      <RowActionsMenu label={`Thao tác ${row.ten_tai_xe}`}>
                      <div className="flex justify-center gap-1">
                        {canEdit ? (
                          <IconButton label="Sửa" onClick={() => setRowModal({ mode: 'edit', row })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                        ) : null}
                        {canDelete ? (
                          <IconButton label="Xóa" danger onClick={() => void deleteRow(row)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        ) : null}
                      </div>
                      </RowActionsMenu>
                    </td>
                  </TableRow>
                </React.Fragment>
              ))}
              {!isLoadingRows && rows.length === 0 && (
                <TableEmptyRow colSpan={12}>{`Chưa có dữ liệu đối chiếu tháng ${month}/${year}.`}</TableEmptyRow>
              )}
            </TableBody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50 text-[11px] font-black text-zinc-800">
                <tr>
                  <td colSpan={4} className="px-2.5 py-3 text-right uppercase">Tổng</td>
                  <td className="px-2.5 py-3 text-right">{formatNumber(totals.tong_cong_quy_doi)}</td>
                  <td className="px-2.5 py-3 text-right">{formatNumber(totals.so_chuyen_di)}</td>
                  <td className="px-2.5 py-3 text-right">{formatNumber(totals.tong_km_thuc_te)}</td>
                  <td className="px-2.5 py-3 text-right">{formatMoney(totals.tien_thuong_luat)}</td>
                  <td className="px-2.5 py-3 text-right">{formatMoney(totals.tien_thuong_chuyen)}</td>
                  <td className="px-2.5 py-3 text-right">{formatMoney(totals.thuong_doanh_so)}</td>
                  <td className="px-2.5 py-3 text-right text-emerald-700">{formatMoney(totals.doanh_so)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </TableShell>
          {isLoadingRows && <LoadingState text="Đang tải bảng đối chiếu..." />}
        </>
      ) : activeView === 'delivery' ? (
        <VehicleDeliveryRequestsView vehicles={vehicles} staff={staff} />
      ) : activeView === 'route' ? (
        <VehicleDeliveryRouteView />
      ) : activeView === 'expenses' ? (
        <VehicleExpensesView vehicles={vehicles} staff={staff} currentUser={currentUser} />
      ) : activeView === 'km_log' ? (
        <VehicleKmLogsView vehicles={vehicles} staff={staff} />
      ) : activeView === 'payments' ? (
        <CustomerPaymentsView vehicles={vehicles} staff={staff} />
      ) : (
        <VehicleLogsView vehicles={vehicles} staff={staff} />
      ))}

      {viewingVehicle && (
        <VehicleDetailModal
          vehicle={viewingVehicle}
          canEdit={canEdit}
          onClose={() => setViewingVehicle(null)}
          onDocumentsChanged={loadVehicles}
          onEdit={() => {
            setVehicleModal({ mode: 'edit', vehicle: viewingVehicle });
            setViewingVehicle(null);
          }}
        />
      )}

      {vehicleModal && (
        <VehicleModal
          initial={vehicleModal.vehicle}
          drivers={drivers}
          vehicleTypeOptions={vehicles.map(vehicle => vehicle.loai_xe)}
          onClose={() => setVehicleModal(null)}
          onSaved={async () => {
            setVehicleModal(null);
            await loadVehicles();
          }}
        />
      )}
      {rowModal && (
        <ReconciliationModal
          initial={rowModal.row}
          vehicles={vehicles}
          drivers={drivers}
          defaultYear={year}
          defaultMonth={month}
          onClose={() => setRowModal(null)}
          onSaved={async () => {
            setRowModal(null);
            await loadRows();
          }}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        danger
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function LoadingState({ text: label }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-bold text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ text: label }: { text: string }) {
  return <div className="px-4 py-10 text-center text-sm font-bold text-slate-400">{label}</div>;
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
      <div className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="shrink-0 border-t border-slate-200 px-4 py-3">{footer}</div>
      </div>
    </div>
  );
}

function VehicleDetailModal({
  vehicle,
  onClose,
  onEdit,
  onDocumentsChanged,
  canEdit = false
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onEdit: () => void;
  onDocumentsChanged: () => void | Promise<void>;
  canEdit?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'documents'>('info');
  const [documents, setDocuments] = useState<VehicleDocument[]>(vehicle.giay_to);
  const [isAddingDocument, setIsAddingDocument] = useState(false);
  const [newDocumentName, setNewDocumentName] = useState('');
  const [newDocumentImages, setNewDocumentImages] = useState<VehicleDocumentImage[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [documentError, setDocumentError] = useState('');
  const [viewingImage, setViewingImage] = useState<{
    documentName: string;
    images: VehicleDocumentImage[];
    index: number;
  } | null>(null);
  const details = [
    ['ID', vehicle.id],
    ['Loại xe', vehicle.loai_xe],
    ['Biển số xe', vehicle.bien_so_xe],
    ['Mã tài xế', vehicle.ma_tai_xe],
    ['Tài xế phụ trách', vehicle.tai_xe_phu_trach],
    ['Trạng thái', vehicle.trang_thai]
  ];

  return (
    <ModalShell
      title={`Chi tiết xe ${vehicle.bien_so_xe}`}
      subtitle="Thông tin phương tiện, tài xế và hồ sơ giấy tờ"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">
            Đóng
          </button>
          {canEdit ? (
            <button type="button" onClick={onEdit} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white hover:bg-brand-600">
              <Pencil className="h-4 w-4" />
              Sửa thông tin
            </button>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-extrabold transition ${
            activeTab === 'info' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Info className="h-4 w-4" />
          Thông tin
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-extrabold transition ${
            activeTab === 'documents' ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          Giấy tờ
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px]">{documents.length}</span>
        </button>
      </div>

      <div className={activeTab === 'info' ? 'block' : 'hidden'}>
      <div className="grid gap-2 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`mt-1 text-sm font-bold text-slate-800 ${label === 'Biển số xe' ? 'font-mono text-brand-700' : ''}`}>
              {value || '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2.5">
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Ghi chú</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-700">{vehicle.ghi_chu || '—'}</p>
      </div>
      </div>

      <section className={activeTab === 'documents' ? 'block' : 'hidden'}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Hồ sơ giấy tờ</h4>
            <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">{documents.length} loại giấy tờ</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setIsAddingDocument(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-extrabold text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              Thêm giấy tờ
            </button>
          ) : null}
        </div>

        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((document, documentIndex) => (
              <article key={`${document.stt}-${document.ten_giay_to}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-800">
                    {documentIndex + 1}. {document.ten_giay_to || 'Chưa đặt tên'}
                  </p>
                  <span className="text-[10px] font-bold text-slate-400">{document.anh.length} ảnh</span>
                </div>
                {document.anh.length > 0 ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {document.anh.map((image, imageIndex) => (
                      <button
                        type="button"
                        key={`${image.url}-${imageIndex}`}
                        onClick={() => setViewingImage({
                          documentName: document.ten_giay_to || 'Giấy tờ',
                          images: document.anh,
                          index: imageIndex
                        })}
                        className="group overflow-hidden rounded-lg border border-slate-200 bg-white"
                        title="Xem ảnh"
                      >
                        <img
                          src={cloudinaryPreviewUrl(image.url, 480)}
                          alt={`${document.ten_giay_to || 'Giấy tờ'} ${imageIndex + 1}`}
                          className="aspect-[4/3] w-full object-cover transition group-hover:scale-105"
                        />
                        <span className="block px-2 py-1.5 text-center text-[9px] font-bold text-slate-500">Ảnh {imageIndex + 1}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-semibold text-slate-400">
                    Chưa có ảnh
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[190px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <FolderOpen className="h-6 w-6" />
            </span>
            <p className="mt-3 max-w-sm text-sm font-bold leading-relaxed text-slate-500">
              Chưa có thông tin đăng kiểm, bằng lái hoặc giấy tờ khác.
            </p>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setIsAddingDocument(true)}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 text-xs font-extrabold text-brand-700 shadow-sm hover:bg-brand-50"
              >
                <Plus className="h-4 w-4" />
                Thêm giấy tờ đầu tiên
              </button>
            ) : null}
          </div>
        )}
      </section>

      {isAddingDocument && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wide text-slate-900">Thêm giấy tờ</h4>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">Nhập tên và tải nhiều ảnh lên Cloudinary</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingDocument(false)}
                disabled={isUploadingDocument || isSavingDocument}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {documentError && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {documentError}
                </p>
              )}
              <Field label="Tên giấy tờ *">
                <input
                  autoFocus
                  value={newDocumentName}
                  onChange={event => setNewDocumentName(event.target.value)}
                  className={inputClass}
                  placeholder="Ví dụ: Đăng kiểm, Bằng lái..."
                />
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ảnh giấy tờ</p>
                  <span className="text-[10px] font-bold text-slate-400">{newDocumentImages.length} ảnh</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {newDocumentImages.map((image, imageIndex) => (
                    <div key={`${image.url}-${imageIndex}`} className="group/image relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img
                        src={cloudinaryPreviewUrl(image.url, 320)}
                        alt={`Ảnh giấy tờ ${imageIndex + 1}`}
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setNewDocumentImages(images => images.filter((_, index) => index !== imageIndex))}
                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow"
                        aria-label="Xóa ảnh"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100">
                    {isUploadingDocument ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                    <span className="mt-1.5 text-[10px] font-black">{isUploadingDocument ? 'Đang tải...' : 'Chọn nhiều ảnh'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isUploadingDocument || isSavingDocument}
                      className="sr-only"
                      onChange={async event => {
                        const files = Array.from(event.target.files || []) as File[];
                        event.target.value = '';
                        if (!files.length) return;
                        if (files.some(file => !file.type.startsWith('image/'))) {
                          setDocumentError('Giấy tờ chỉ nhận file ảnh.');
                          return;
                        }
                        if (files.some(file => file.size > 12 * 1024 * 1024)) {
                          setDocumentError('Mỗi ảnh không được vượt quá 12 MB.');
                          return;
                        }
                        setIsUploadingDocument(true);
                        setDocumentError('');
                        try {
                          const uploadedImages: VehicleDocumentImage[] = [];
                          for (const file of files) {
                            const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1800, quality: 0.8 });
                            const uploaded = await uploadImage(dataUrl, 'xe/giay_to');
                            if (uploaded.imageUrl) {
                              uploadedImages.push({ url: uploaded.imageUrl, public_id: uploaded.imagePublicId });
                            }
                          }
                          setNewDocumentImages(images => [...images, ...uploadedImages]);
                        } catch (uploadError: any) {
                          setDocumentError(uploadError.message || 'Không thể tải ảnh lên Cloudinary.');
                        } finally {
                          setIsUploadingDocument(false);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setIsAddingDocument(false)}
                disabled={isUploadingDocument || isSavingDocument}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={isUploadingDocument || isSavingDocument}
                onClick={async () => {
                  if (!newDocumentName.trim()) {
                    setDocumentError('Vui lòng nhập tên giấy tờ.');
                    return;
                  }
                  setIsSavingDocument(true);
                  setDocumentError('');
                  try {
                    const nextDocuments = [
                      ...documents,
                      {
                        stt: documents.length + 1,
                        ten_giay_to: newDocumentName.trim(),
                        anh: newDocumentImages
                      }
                    ];
                    await readJsonResponse(await fetch(`/api/danh-sach-xe/${encodeURIComponent(vehicle.id)}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...vehicle, giay_to: nextDocuments })
                    }));
                    setDocuments(nextDocuments);
                    setNewDocumentName('');
                    setNewDocumentImages([]);
                    setIsAddingDocument(false);
                    await onDocumentsChanged();
                  } catch (saveError: any) {
                    setDocumentError(saveError.message || 'Không thể lưu giấy tờ.');
                  } finally {
                    setIsSavingDocument(false);
                  }
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60"
              >
                {isSavingDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSavingDocument ? 'Đang lưu...' : 'Lưu giấy tờ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingImage && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
          onClick={() => setViewingImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Xem ảnh ${viewingImage.documentName}`}
        >
          <div
            className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-sm font-black text-slate-900">{viewingImage.documentName}</p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                  Ảnh {viewingImage.index + 1}/{viewingImage.images.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingImage(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Đóng ảnh"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-2 sm:p-4">
              <img
                src={viewingImage.images[viewingImage.index]?.url}
                alt={`${viewingImage.documentName} ${viewingImage.index + 1}`}
                className="max-h-[75dvh] max-w-full object-contain"
              />
              {viewingImage.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setViewingImage(current => current ? ({
                      ...current,
                      index: (current.index - 1 + current.images.length) % current.images.length
                    }) : null)}
                    className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg hover:bg-white"
                    aria-label="Ảnh trước"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewingImage(current => current ? ({
                      ...current,
                      index: (current.index + 1) % current.images.length
                    }) : null)}
                    className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-lg hover:bg-white"
                    aria-label="Ảnh tiếp theo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

const DEFAULT_VEHICLE_TYPE_OPTIONS = [
  '1,5 tấn',
  '6 tấn'
];

const splitAssignedDrivers = (value: string) =>
  value.split(/\s*[,;\n]\s*/).map(item => item.trim()).filter(Boolean);

function MultiDriverSelect({ drivers, selectedCodes, selectedNames, onChange }: {
  drivers: DriverOption[];
  selectedCodes: string;
  selectedNames: string;
  onChange: (drivers: DriverOption[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const codes = splitAssignedDrivers(selectedCodes);
  const names = splitAssignedDrivers(selectedNames);
  const options = useMemo(() => {
    const result = [...drivers];
    names.forEach((name, index) => {
      const code = codes[index] || '';
      if (!result.some(driver => (code && driver.code === code) || (!code && driver.name === name))) result.push({ code, name });
    });
    return result;
  }, [drivers, selectedCodes, selectedNames]);
  const selected = options.filter(driver => (driver.code && codes.includes(driver.code)) || names.includes(driver.name));
  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const filtered = options.filter(driver => `${driver.code} ${driver.name}`.toLocaleLowerCase('vi').includes(normalizedQuery));

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const toggle = (driver: DriverOption) => {
    const isSelected = selected.some(item => driver.code ? item.code === driver.code : item.name === driver.name);
    onChange(isSelected
      ? selected.filter(item => driver.code ? item.code !== driver.code : item.name !== driver.name)
      : [...selected, driver]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setIsOpen(open => !open)} className={`${inputClass} flex items-center justify-between gap-2 text-left`} aria-haspopup="listbox" aria-expanded={isOpen}>
        <span className={selected.length ? 'truncate text-slate-900' : 'text-slate-400'}>{selected.length ? selected.map(driver => driver.name).join(', ') : 'Chưa phân công'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 p-2"><div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 pl-8 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Gõ mã hoặc tên tài xế..." />
        </div></div>
        <div className="max-h-52 overflow-y-auto p-1" role="listbox" aria-multiselectable="true">
          {filtered.length ? filtered.map(driver => {
            const checked = selected.some(item => driver.code ? item.code === driver.code : item.name === driver.name);
            return <button type="button" key={`${driver.code}-${driver.name}`} onClick={() => toggle(driver)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50" role="option" aria-selected={checked}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              <span className="min-w-0 truncate">{driver.code && <span className="mr-1.5 font-bold text-slate-500">{driver.code}</span>}{driver.name}</span>
            </button>;
          }) : <p className="px-3 py-4 text-center text-xs text-slate-500">Không tìm thấy tài xế</p>}
        </div>
        {selected.length > 0 && <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-500">Đã chọn {selected.length} tài xế</span>
          <button type="button" onClick={() => onChange([])} className="font-bold text-rose-600 hover:text-rose-700">Bỏ chọn tất cả</button>
        </div>}
      </div>}
    </div>
  );
}

function VehicleModal({
  initial,
  drivers,
  vehicleTypeOptions = [],
  onClose,
  onSaved
}: {
  initial?: Vehicle;
  drivers: DriverOption[];
  vehicleTypeOptions?: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<VehicleForm>(
    initial
      ? {
          ...initial,
          giay_to: initial.giay_to.map(document => ({
            ...document,
            anh: document.anh.map(image => ({ ...image }))
          }))
        }
      : emptyVehicleForm()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingDocumentIndex, setUploadingDocumentIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  const loaiXeSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const value of [...DEFAULT_VEHICLE_TYPE_OPTIONS, ...vehicleTypeOptions, form.loai_xe]) {
      const trimmed = String(value || '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(trimmed);
    }
    return options.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [form.loai_xe, vehicleTypeOptions]);

  const updateDocuments = (documents: VehicleDocument[]) => {
    setForm(prev => ({
      ...prev,
      giay_to: documents.map((document, index) => ({ ...document, stt: index + 1 }))
    }));
  };

  const uploadDocumentImages = async (documentIndex: number, files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    if (selectedFiles.some(file => !file.type.startsWith('image/'))) {
      setError('Giấy tờ chỉ nhận file ảnh.');
      return;
    }
    if (selectedFiles.some(file => file.size > 12 * 1024 * 1024)) {
      setError('Mỗi ảnh giấy tờ không được vượt quá 12 MB.');
      return;
    }

    setUploadingDocumentIndex(documentIndex);
    setError('');
    try {
      const uploadedImages: VehicleDocumentImage[] = [];
      for (const file of selectedFiles) {
        const dataUrl = await fileToOptimizedImageDataUrl(file, { maxEdge: 1800, quality: 0.8 });
        const uploaded = await uploadImage(dataUrl, 'xe/giay_to');
        if (uploaded.imageUrl) {
          uploadedImages.push({
            url: uploaded.imageUrl,
            public_id: uploaded.imagePublicId
          });
        }
      }
      setForm(prev => ({
        ...prev,
        giay_to: prev.giay_to.map((document, index) =>
          index === documentIndex
            ? { ...document, anh: [...document.anh, ...uploadedImages] }
            : document
        )
      }));
    } catch (uploadError: any) {
      setError(uploadError.message || 'Không thể tải ảnh giấy tờ lên Cloudinary.');
    } finally {
      setUploadingDocumentIndex(null);
    }
  };

  const save = async () => {
    if (!form.loai_xe.trim() || !form.bien_so_xe.trim()) {
      setError('Vui lòng nhập loại xe và biển số xe.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const endpoint = initial ? `/api/danh-sach-xe/${encodeURIComponent(initial.id)}` : '/api/danh-sach-xe';
      await readJsonResponse(await fetch(endpoint, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu xe.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={initial ? 'Sửa thông tin xe' : 'Thêm xe mới'}
      subtitle="Dữ liệu gốc dùng cho phân công và đối chiếu lái xe"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSaving || uploadingDocumentIndex !== null} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Huỷ</button>
          <button type="button" onClick={() => void save()} disabled={isSaving || uploadingDocumentIndex !== null} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Lưu xe'}
          </button>
        </div>
      }
    >
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Loại xe *">
          <select
            value={form.loai_xe}
            onChange={event => setForm(prev => ({ ...prev, loai_xe: event.target.value }))}
            className={inputClass}
          >
            <option value="">Chọn loại xe</option>
            {loaiXeSuggestions.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Biển số xe (BSX) *">
          <input value={form.bien_so_xe} onChange={event => setForm(prev => ({ ...prev, bien_so_xe: event.target.value.toUpperCase() }))} className={`${inputClass} font-mono`} placeholder="VD: 51D-251.05" />
        </Field>
        <Field label="Tài xế phụ trách">
          <MultiDriverSelect
            drivers={drivers}
            selectedCodes={form.ma_tai_xe}
            selectedNames={form.tai_xe_phu_trach}
            onChange={selected => setForm(prev => ({
              ...prev,
              ma_tai_xe: selected.map(driver => driver.code).join(', '),
              tai_xe_phu_trach: selected.map(driver => driver.name).join(', ')
            }))}
          />
        </Field>
        <Field label="Trạng thái">
          <select value={form.trang_thai} onChange={event => setForm(prev => ({ ...prev, trang_thai: event.target.value }))} className={inputClass}>
            {['Đang sử dụng', 'Bảo dưỡng', 'Tạm ngưng', 'Thanh lý'].map(status => <option key={status}>{status}</option>)}
          </select>
        </Field>
        <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Đăng kiểm, bằng lái và giấy tờ</h3>
              <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">Mỗi giấy tờ có thể lưu nhiều ảnh trên Cloudinary.</p>
            </div>
            <button
              type="button"
              onClick={() => updateDocuments([
                ...form.giay_to,
                { stt: form.giay_to.length + 1, ten_giay_to: '', anh: [] }
              ])}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-brand-200 bg-white px-2.5 text-[11px] font-extrabold text-brand-700 hover:bg-brand-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm giấy tờ
            </button>
          </div>

          <div className="space-y-2">
            {form.giay_to.map((document, documentIndex) => (
              <div key={documentIndex} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-center text-xs font-black text-slate-500">{documentIndex + 1}</span>
                  <input
                    value={document.ten_giay_to}
                    onChange={event => {
                      const documents = [...form.giay_to];
                      documents[documentIndex] = { ...document, ten_giay_to: event.target.value };
                      updateDocuments(documents);
                    }}
                    className={inputClass}
                    placeholder="Tên giấy tờ, ví dụ: Đăng kiểm"
                  />
                  <button
                    type="button"
                    onClick={() => updateDocuments(form.giay_to.filter((_, index) => index !== documentIndex))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                    aria-label={`Xóa giấy tờ ${documentIndex + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {document.anh.map((image, imageIndex) => (
                    <div key={`${image.url}-${imageIndex}`} className="group/image relative h-20 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      <a href={image.url} target="_blank" rel="noreferrer" title="Mở ảnh gốc">
                        <img
                          src={cloudinaryPreviewUrl(image.url, 240)}
                          alt={`${document.ten_giay_to || 'Giấy tờ'} ${imageIndex + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const documents = [...form.giay_to];
                          documents[documentIndex] = {
                            ...document,
                            anh: document.anh.filter((_, index) => index !== imageIndex)
                          };
                          updateDocuments(documents);
                        }}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow opacity-100 sm:opacity-0 sm:group-hover/image:opacity-100"
                        aria-label="Xóa ảnh"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-300 bg-brand-50 text-brand-700 transition hover:bg-brand-100">
                    {uploadingDocumentIndex === documentIndex ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" />
                    )}
                    <span className="mt-1 text-[9px] font-black">
                      {uploadingDocumentIndex === documentIndex ? 'Đang tải...' : 'Thêm ảnh'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploadingDocumentIndex !== null}
                      onChange={event => {
                        void uploadDocumentImages(documentIndex, event.target.files);
                        event.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div className="sm:col-span-2">
          <Field label="Ghi chú">
            <textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}

const numericFields: Array<{ key: keyof ReconciliationForm; label: string; money?: boolean }> = [
  { key: 'tong_cong_quy_doi', label: 'Tổng số công quy đổi' },
  { key: 'so_chuyen_di', label: 'Số chuyến đi' },
  { key: 'tong_km_thuc_te', label: 'Tổng KM thực tế' },
  { key: 'tien_thuong_luat', label: 'Thưởng luật (250đ/km)', money: true },
  { key: 'tien_thuong_chuyen', label: 'Tiền thưởng chuyến', money: true },
  { key: 'thuong_doanh_so', label: 'Thưởng doanh số', money: true },
  { key: 'doanh_so', label: 'Doanh số', money: true }
];

function ReconciliationModal({
  initial,
  vehicles,
  drivers,
  defaultYear,
  defaultMonth,
  onClose,
  onSaved
}: {
  initial?: DriverReconciliation;
  vehicles: Vehicle[];
  drivers: DriverOption[];
  defaultYear: number;
  defaultMonth: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<ReconciliationForm>(
    initial ? { ...initial } : { ...emptyReconciliationForm(), nam: defaultYear, thang: defaultMonth }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.ten_tai_xe.trim()) {
      setError('Vui lòng chọn tài xế.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const endpoint = initial ? `/api/doi-chieu-lai-xe/${encodeURIComponent(initial.id)}` : '/api/doi-chieu-lai-xe';
      await readJsonResponse(await fetch(endpoint, {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      }));
      await onSaved();
    } catch (saveError: any) {
      setError(saveError.message || 'Không thể lưu dòng đối chiếu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell
      title={initial ? 'Sửa dòng đối chiếu' : 'Thêm dòng đối chiếu'}
      subtitle="Theo cấu trúc BẢNG ĐỐI CHIẾU LÁI XE của khách"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSaving} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Huỷ</button>
          <button type="button" onClick={() => void save()} disabled={isSaving} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-500 px-4 text-sm font-extrabold text-white disabled:opacity-60">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Đang lưu...' : 'Lưu đối chiếu'}
          </button>
        </div>
      }
    >
      {error && <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Năm">
          <input type="number" min={2000} max={2100} value={form.nam} onChange={event => setForm(prev => ({ ...prev, nam: Number(event.target.value) }))} className={inputClass} />
        </Field>
        <Field label="Tháng">
          <select value={form.thang} onChange={event => setForm(prev => ({ ...prev, thang: Number(event.target.value) }))} className={inputClass}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>Tháng {value}</option>)}
          </select>
        </Field>
        <Field label="Tên tài xế *">
          <select
            value={`${form.ma_nhan_su}|${form.ten_tai_xe}`}
            onChange={event => {
              const selected = drivers.find(driver => `${driver.code}|${driver.name}` === event.target.value);
              setForm(prev => ({ ...prev, ma_nhan_su: selected?.code || '', ten_tai_xe: selected?.name || '' }));
            }}
            className={inputClass}
          >
            <option value="|">Chọn tài xế</option>
            {drivers.map(driver => <option key={`${driver.code}-${driver.name}`} value={`${driver.code}|${driver.name}`}>{driver.code ? `${driver.code} · ` : ''}{driver.name}</option>)}
          </select>
        </Field>
        <Field label="Loại xe đi">
          <select
            value={form.xe_id}
            onChange={event => {
              const vehicle = vehicles.find(item => item.id === event.target.value);
              setForm(prev => ({
                ...prev,
                xe_id: vehicle?.id || '',
                loai_xe_di: vehicle?.loai_xe || '',
                bien_so_xe: vehicle?.bien_so_xe || ''
              }));
            }}
            className={inputClass}
          >
            <option value="">Chọn xe</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.loai_xe} · {vehicle.bien_so_xe}</option>)}
          </select>
        </Field>
        {numericFields.map(field => (
          <label key={field.key} className="block space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{field.label}</span>
            <input
              type="number"
              min={0}
              step={field.money ? 1000 : 0.5}
              value={Number(form[field.key]) || 0}
              onChange={event => setForm(prev => ({ ...prev, [field.key]: Number(event.target.value) || 0 }))}
              className={`${inputClass} text-right`}
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <Field label="Ghi chú">
            <textarea value={form.ghi_chu} onChange={event => setForm(prev => ({ ...prev, ghi_chu: event.target.value }))} className={`${inputClass} min-h-20 py-2`} />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}

const inputClass =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
