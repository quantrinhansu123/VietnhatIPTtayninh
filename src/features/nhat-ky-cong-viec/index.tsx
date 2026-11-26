import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, NotebookPen } from 'lucide-react';
import {
  TableBody,
  TableEmptyRow,
  TableHead,
  TableHeadCell,
  TablePagination,
  TableRow,
  TableShell,
  StatusBadge
} from '../../components/shared/table';
import {
  normalizeAcceptanceReports,
  type AcceptanceReport
} from '../../components/AcceptanceReportForm';
import { parseDateToIso } from '../../utils/dateFormat';
import { machineValueMatchesFilter } from '../../utils/controlBoardShiftSummary';
import {
  normalizeShiftSettings,
  shiftNamesMatch,
  type ShiftSetting
} from '../../utils/shiftSettings';
import { splitProductionOrderStaffNames } from '../cai-dat-thoi-gian';
import { normalizeMachines, type MachineRow } from '../danh-sach-may';
import {
  formatProductionOrderDate,
  formatProductionOrderProductsSummary,
  normalizeProductionOrders,
  resolveProductionOrderMachine,
  toDatetimeLocalInputValue,
  type ProductionOrderRow
} from '../ke-hoach-san-xuat';
import { productionOrderMachineMatches } from '../lenh-sx/machineFilter';

export type WorkDiarySource = 'lenh_sx' | 'phan_cong_cv';

export type WorkDiaryRow = {
  key: string;
  ngayIso: string;
  ngayLabel: string;
  ca: string;
  staff: string;
  role: string;
  task: string;
  timeFrom: string;
  timeTo: string;
  source: WorkDiarySource;
  sourceLabel: string;
  machine: string;
  note: string;
  /** Tổng SL Thành phẩm/Gia công (ngày·ca·máy). */
  sanLuong: number | null;
  sanLuongUnit: string;
  /** Tổng SL SP lỗi/SP rác (ngày·ca·máy). */
  loiHong: number | null;
  loiHongUnit: string;
};

type HubFilters = {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  shift?: string;
  machineCode?: string;
};

type Props = {
  initialFilters?: HubFilters;
  hideLocalFilters?: boolean;
};

type PhanCongCvRecord = {
  id?: string | number;
  ngay?: string;
  ca?: string;
  cong_viec?: string;
  congViec?: string;
  nhan_su_phu_trach?: string;
  nhanSuPhuTrach?: string;
  ghi_chu?: string;
  ghiChu?: string;
};

const ROLE_FIELDS: Array<{ key: keyof ProductionOrderRow; label: string }> = [
  { key: 'shiftLead', label: 'Trưởng ca' },
  { key: 'mainStaff', label: 'Nhân sự chính' },
  { key: 'assistantStaff', label: 'Thợ phụ' },
  { key: 'traineeStaff', label: 'Học việc' }
];

const SAN_LUONG_EXCLUDED_CODES = new Set(['RAC', 'RAC MANG', 'MT-HANG RAC', 'NHUAKM']);

function isoDateFromDisplay(value: string) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return '';
  return parseDateToIso(raw) || (/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '');
}

function formatClockHm(value: string) {
  const local = toDatetimeLocalInputValue(value);
  if (!local) return '';
  const match = local.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function normalizeLoaiKey(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Thành phẩm / Gia công trên BC sản lượng. */
function isSanLuongLoai(loaiVatTu?: string | null) {
  const key = normalizeLoaiKey(loaiVatTu);
  if (!key) return false;
  if (key.includes('sp loi') || key.includes('sp rac') || key.includes('hang loi') || key.includes('hang hong') || key.includes('hang rac')) {
    return false;
  }
  return key.includes('thanh pham') || key.includes('gia cong');
}

/** SP lỗi / SP rác — lỗi hỏng trên BC sản lượng. */
function isLoiHongLoai(loaiVatTu?: string | null) {
  const key = normalizeLoaiKey(loaiVatTu);
  if (!key) return false;
  return (
    key.includes('sp loi') ||
    key.includes('sp rac') ||
    key.includes('hang loi') ||
    key.includes('hang hong') ||
    key.includes('hang rac') ||
    key.includes('kho rac')
  );
}

function resolveReportProductCode(matHang: string) {
  const trimmed = String(matHang || '').trim();
  if (!trimmed) return '';
  const plusIdx = trimmed.indexOf('+');
  return (plusIdx > 0 ? trimmed.slice(0, plusIdx) : trimmed).trim();
}

function isSanLuongExcludedCode(matHang: string) {
  const code = resolveReportProductCode(matHang).replace(/\s+/g, ' ').trim().toUpperCase();
  return SAN_LUONG_EXCLUDED_CODES.has(code);
}

function reportQty(report: AcceptanceReport): number {
  if (report.so_luong !== null && report.so_luong !== undefined && Number.isFinite(report.so_luong)) {
    return report.so_luong;
  }
  if (report.trong_luong !== null && report.trong_luong !== undefined && Number.isFinite(report.trong_luong)) {
    return report.trong_luong;
  }
  return 0;
}

function reportUnit(report: AcceptanceReport): string {
  if (report.so_luong !== null && report.so_luong !== undefined && Number.isFinite(report.so_luong)) {
    return String(report.don_vi || '').trim();
  }
  if (report.trong_luong !== null && report.trong_luong !== undefined && Number.isFinite(report.trong_luong)) {
    return String(report.don_vi_trong_luong || 'Kg').trim() || 'Kg';
  }
  return String(report.don_vi || '').trim();
}

function formatQtyCell(value: number | null, unit: string) {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/\.?0+$/, '').replace('.', ',');
  return unit ? `${text} ${unit}` : text;
}

function resolveShiftTimes(ca: string, settings: ShiftSetting[]) {
  const trimmed = String(ca || '').trim();
  if (!trimmed || trimmed === '-') return { timeFrom: '', timeTo: '' };
  const hit =
    settings.find(
      setting =>
        shiftNamesMatch(trimmed, setting.name) ||
        shiftNamesMatch(trimmed, setting.code) ||
        String(setting.name || '').trim() === trimmed ||
        String(setting.code || '').trim() === trimmed
    ) || null;
  return {
    timeFrom: hit?.startTime || '',
    timeTo: hit?.endTime || ''
  };
}

function emptyMetrics() {
  return {
    sanLuong: null as number | null,
    sanLuongUnit: '',
    loiHong: null as number | null,
    loiHongUnit: ''
  };
}

function expandProductionOrderRows(
  orders: ProductionOrderRow[],
  machines: MachineRow[]
): WorkDiaryRow[] {
  const rows: WorkDiaryRow[] = [];

  for (const order of orders) {
    const ngayIso = isoDateFromDisplay(order.startDate);
    const ngayLabel = formatProductionOrderDate(order.startDate) || order.startDate || '—';
    const ca = order.shift && order.shift !== '-' ? order.shift : '—';
    const machine = resolveProductionOrderMachine(order, machines);
    const products = formatProductionOrderProductsSummary(order);
    const taskParts = [
      `Lệnh SX ${order.code || '—'}`,
      machine && machine !== '-' ? `Máy ${machine}` : '',
      products && products !== '-' ? products : ''
    ].filter(Boolean);
    const task = taskParts.join(' · ');
    const timeFrom = formatClockHm(order.startAt);
    const timeTo = formatClockHm(order.endAt);
    const metrics = emptyMetrics();

    const named: Array<{ staff: string; role: string }> = [];
    for (const field of ROLE_FIELDS) {
      const names = splitProductionOrderStaffNames(String(order[field.key] || ''));
      for (const staff of names) {
        named.push({ staff, role: field.label });
      }
    }
    if (named.length === 0) {
      for (const staff of splitProductionOrderStaffNames(order.staff)) {
        named.push({ staff, role: 'Nhân sự' });
      }
    }
    if (named.length === 0) continue;

    named.forEach((entry, index) => {
      rows.push({
        key: `lsx:${order.id}:${entry.role}:${entry.staff}:${index}`,
        ngayIso,
        ngayLabel,
        ca,
        staff: entry.staff,
        role: entry.role,
        task,
        timeFrom,
        timeTo,
        source: 'lenh_sx',
        sourceLabel: 'Lệnh SX',
        machine: machine && machine !== '-' ? machine : '',
        note: order.note && order.note !== '-' ? order.note : '',
        ...metrics
      });
    });
  }

  return rows;
}

function expandPhanCongRows(records: PhanCongCvRecord[], settings: ShiftSetting[]): WorkDiaryRow[] {
  const rows: WorkDiaryRow[] = [];

  for (const record of records) {
    const ngayRaw = String(record.ngay || '').trim();
    const ngayIso = isoDateFromDisplay(ngayRaw) || (/^\d{4}-\d{2}-\d{2}/.test(ngayRaw) ? ngayRaw.slice(0, 10) : '');
    const ngayLabel = formatProductionOrderDate(ngayRaw) || ngayRaw || '—';
    const ca = String(record.ca || '').trim() || '—';
    const task = String(record.cong_viec ?? record.congViec ?? '').trim();
    const note = String(record.ghi_chu ?? record.ghiChu ?? '').trim();
    const staffField = String(record.nhan_su_phu_trach ?? record.nhanSuPhuTrach ?? '').trim();
    const names = splitProductionOrderStaffNames(staffField);
    if (names.length === 0 && !task) continue;
    const { timeFrom, timeTo } = resolveShiftTimes(ca, settings);
    const people = names.length > 0 ? names : ['—'];
    const metrics = emptyMetrics();

    people.forEach((staff, index) => {
      rows.push({
        key: `cv:${record.id ?? ngayIso}:${ca}:${staff}:${index}`,
        ngayIso,
        ngayLabel,
        ca,
        staff,
        role: 'Phụ trách',
        task: task || '—',
        timeFrom,
        timeTo,
        source: 'phan_cong_cv',
        sourceLabel: 'Phân công CV',
        machine: '',
        note,
        ...metrics
      });
    });
  }

  return rows;
}

function sortWorkDiaryRows(a: WorkDiaryRow, b: WorkDiaryRow) {
  const dateCmp = String(b.ngayIso || '').localeCompare(String(a.ngayIso || ''));
  if (dateCmp !== 0) return dateCmp;
  const caCmp = a.ca.localeCompare(b.ca, 'vi', { numeric: true });
  if (caCmp !== 0) return caCmp;
  const fromCmp = String(a.timeFrom || '99:99').localeCompare(String(b.timeFrom || '99:99'));
  if (fromCmp !== 0) return fromCmp;
  return a.staff.localeCompare(b.staff, 'vi');
}

function reportMatchesContext(
  report: AcceptanceReport,
  ngayIso: string,
  ca: string,
  machine: string,
  machines: MachineRow[]
) {
  const reportNgay = String(report.ngay || '').slice(0, 10);
  if (ngayIso && reportNgay && reportNgay !== ngayIso) return false;
  if (ca && ca !== '—' && report.ca && !shiftNamesMatch(report.ca, ca)) return false;
  if (!machine) return true;
  if (machineValueMatchesFilter(machine, null, report.ma_may, report.ten_may)) return true;
  if (productionOrderMachineMatches(machine, report.ma_may, machines)) return true;
  if (productionOrderMachineMatches(machine, report.ten_may, machines)) return true;
  return false;
}

function aggregateMetrics(
  reports: AcceptanceReport[],
  ngayIso: string,
  ca: string,
  machine: string,
  machines: MachineRow[]
) {
  let sanLuong = 0;
  let loiHong = 0;
  let sanLuongUnit = '';
  let loiHongUnit = '';
  let sanLuongUnitConflict = false;
  let loiHongUnitConflict = false;
  let hasSanLuong = false;
  let hasLoiHong = false;

  for (const report of reports) {
    if (!reportMatchesContext(report, ngayIso, ca, machine, machines)) continue;
    const qty = reportQty(report);
    if (!(qty > 0)) continue;
    const unit = reportUnit(report);

    if (isSanLuongLoai(report.loai_vat_tu) && !isSanLuongExcludedCode(report.mat_hang)) {
      hasSanLuong = true;
      sanLuong += qty;
      if (!sanLuongUnit) sanLuongUnit = unit;
      else if (unit && sanLuongUnit && unit.toLowerCase() !== sanLuongUnit.toLowerCase()) {
        sanLuongUnitConflict = true;
      }
      continue;
    }

    if (isLoiHongLoai(report.loai_vat_tu)) {
      hasLoiHong = true;
      loiHong += qty;
      if (!loiHongUnit) loiHongUnit = unit;
      else if (unit && loiHongUnit && unit.toLowerCase() !== loiHongUnit.toLowerCase()) {
        loiHongUnitConflict = true;
      }
    }
  }

  return {
    sanLuong: hasSanLuong ? sanLuong : null,
    sanLuongUnit: sanLuongUnitConflict ? '' : sanLuongUnit,
    loiHong: hasLoiHong ? loiHong : null,
    loiHongUnit: loiHongUnitConflict ? '' : loiHongUnit
  };
}

function enrichRowsWithAcceptanceMetrics(
  rows: WorkDiaryRow[],
  reports: AcceptanceReport[],
  machines: MachineRow[]
): WorkDiaryRow[] {
  if (rows.length === 0) return rows;
  const cache = new Map<string, ReturnType<typeof aggregateMetrics>>();

  return rows.map(row => {
    const cacheKey = `${row.ngayIso}|${row.ca}|${row.machine || '*'}`;
    let metrics = cache.get(cacheKey);
    if (!metrics) {
      metrics = aggregateMetrics(reports, row.ngayIso, row.ca, row.machine, machines);
      cache.set(cacheKey, metrics);
    }
    return { ...row, ...metrics };
  });
}

export function NhatKyCongViecPanel({ initialFilters }: Props) {
  const [orders, setOrders] = useState<ProductionOrderRow[]>([]);
  const [cvRows, setCvRows] = useState<PhanCongCvRecord[]>([]);
  const [acceptanceReports, setAcceptanceReports] = useState<AcceptanceReport[]>([]);
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const dateFrom = initialFilters?.dateFrom || '';
  const dateTo = initialFilters?.dateTo || '';
  const shiftFilter = initialFilters?.shift && initialFilters.shift !== 'all' ? initialFilters.shift : '';
  const machineFilter =
    initialFilters?.machineCode && initialFilters.machineCode !== 'all' ? initialFilters.machineCode : '';
  const search = String(initialFilters?.search || '').trim().toLowerCase();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const cvParams = new URLSearchParams();
      if (dateFrom) cvParams.set('from', dateFrom);
      if (dateTo) cvParams.set('to', dateTo);
      if (shiftFilter) cvParams.set('ca', shiftFilter);
      cvParams.set('limit', '2000');

      const acceptanceParams = new URLSearchParams();
      if (dateFrom) acceptanceParams.set('tu_ngay', dateFrom);
      if (dateTo) acceptanceParams.set('den_ngay', dateTo);

      const [lenhRes, cvRes, acceptanceRes, machineRes, settingRes] = await Promise.all([
        fetch('/api/lenh-sx'),
        fetch(`/api/phan-cong-cv?${cvParams.toString()}`),
        fetch(`/api/bao-cao-nghiem-thu?${acceptanceParams.toString()}`),
        fetch('/api/danh-sach-may'),
        fetch('/api/cai-dat')
      ]);

      const errors: string[] = [];
      if (!lenhRes.ok) errors.push('lệnh SX');
      if (!cvRes.ok) errors.push('phân công CV');
      if (!acceptanceRes.ok) errors.push('sản lượng / lỗi hỏng');
      if (!machineRes.ok) errors.push('danh sách máy');
      if (!settingRes.ok) errors.push('cài đặt ca');

      const [lenhData, cvData, acceptanceData, machineData, settingData] = await Promise.all([
        lenhRes.ok ? lenhRes.json().catch(() => null) : null,
        cvRes.ok ? cvRes.json().catch(() => null) : null,
        acceptanceRes.ok ? acceptanceRes.json().catch(() => null) : null,
        machineRes.ok ? machineRes.json().catch(() => null) : null,
        settingRes.ok ? settingRes.json().catch(() => null) : null
      ]);

      setOrders(normalizeProductionOrders(lenhData));
      setCvRows(Array.isArray(cvData?.rows) ? (cvData.rows as PhanCongCvRecord[]) : []);
      setAcceptanceReports(normalizeAcceptanceReports(acceptanceData));
      setMachines(normalizeMachines(machineData));
      setShiftSettings(normalizeShiftSettings(settingData));

      if (errors.length > 0) {
        setLoadError(`Không tải được: ${errors.join(', ')}.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Không tải được nhật ký công việc.';
      setLoadError(message);
      setOrders([]);
      setCvRows([]);
      setAcceptanceReports([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, shiftFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allRows = useMemo(() => {
    const fromOrders = expandProductionOrderRows(orders, machines);
    const fromCv = expandPhanCongRows(cvRows, shiftSettings);
    const merged = [...fromOrders, ...fromCv].sort(sortWorkDiaryRows);
    return enrichRowsWithAcceptanceMetrics(merged, acceptanceReports, machines);
  }, [orders, cvRows, machines, shiftSettings, acceptanceReports]);

  const filteredRows = useMemo(() => {
    return allRows.filter(row => {
      if (dateFrom && row.ngayIso && row.ngayIso < dateFrom) return false;
      if (dateTo && row.ngayIso && row.ngayIso > dateTo) return false;
      if (shiftFilter && row.ca !== '—' && !shiftNamesMatch(row.ca, shiftFilter)) return false;
      if (machineFilter) {
        if (row.source === 'lenh_sx') {
          if (!productionOrderMachineMatches(machineFilter, row.machine, machines)) return false;
        }
      }
      if (!search) return true;
      const hay = [
        row.ngayLabel,
        row.ca,
        row.staff,
        row.role,
        row.task,
        row.timeFrom,
        row.timeTo,
        row.sourceLabel,
        row.note,
        row.machine,
        formatQtyCell(row.sanLuong, row.sanLuongUnit),
        formatQtyCell(row.loiHong, row.loiHongUnit)
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  }, [allRows, dateFrom, dateTo, shiftFilter, machineFilter, machines, search]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, shiftFilter, machineFilter, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
              <NotebookPen className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-zinc-900">Nhật ký công việc</h3>
              <p className="text-[11px] font-semibold text-zinc-500">
                Lệnh SX + Phân công CV · kèm sản lượng / lỗi hỏng theo ngày · ca · máy.
              </p>
            </div>
          </div>
        </div>
        <div className="text-xs font-bold text-zinc-500">
          {isLoading ? 'Đang tải...' : `${filteredRows.length} dòng`}
        </div>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
          {loadError}
        </p>
      ) : null}

      <TableShell minWidthClassName="min-w-[1280px]">
        <TableHead>
          <TableHeadCell>Ngày</TableHeadCell>
          <TableHeadCell align="center">Ca</TableHeadCell>
          <TableHeadCell>Nhân sự</TableHeadCell>
          <TableHeadCell>Vai trò</TableHeadCell>
          <TableHeadCell>Công việc</TableHeadCell>
          <TableHeadCell align="center">Từ giờ</TableHeadCell>
          <TableHeadCell align="center">Đến giờ</TableHeadCell>
          <TableHeadCell align="center">Sản lượng</TableHeadCell>
          <TableHeadCell align="center">Lỗi hỏng</TableHeadCell>
          <TableHeadCell align="center">Nguồn</TableHeadCell>
        </TableHead>
        <TableBody>
          {isLoading ? (
            <TableEmptyRow colSpan={10}>
              <span className="inline-flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang tải nhật ký công việc...
              </span>
            </TableEmptyRow>
          ) : null}

          {!isLoading &&
            pagedRows.map(row => (
              <TableRow key={row.key} className="group">
                <td className="px-3 py-3 text-sm font-bold text-zinc-800">{row.ngayLabel || '—'}</td>
                <td className="px-3 py-3 text-center text-sm font-bold text-zinc-700">{row.ca || '—'}</td>
                <td className="px-3 py-3 text-sm font-black text-zinc-950">{row.staff || '—'}</td>
                <td className="px-3 py-3 text-sm font-semibold text-zinc-600">{row.role || '—'}</td>
                <td className="px-3 py-3 text-sm font-semibold text-zinc-800">
                  <div>{row.task || '—'}</div>
                  {row.note ? <div className="mt-0.5 text-xs font-medium text-zinc-400">{row.note}</div> : null}
                </td>
                <td className="px-3 py-3 text-center font-mono text-sm font-bold text-emerald-800">
                  {row.timeFrom || '—'}
                </td>
                <td className="px-3 py-3 text-center font-mono text-sm font-bold text-rose-700">
                  {row.timeTo || '—'}
                </td>
                <td className="px-3 py-3 text-center font-mono text-sm font-bold text-sky-800">
                  {formatQtyCell(row.sanLuong, row.sanLuongUnit)}
                </td>
                <td className="px-3 py-3 text-center font-mono text-sm font-bold text-amber-800">
                  {formatQtyCell(row.loiHong, row.loiHongUnit)}
                </td>
                <td className="px-3 py-3 text-center">
                  <StatusBadge
                    label={row.sourceLabel}
                    color={row.source === 'lenh_sx' ? 'sky' : 'amber'}
                  />
                </td>
              </TableRow>
            ))}

          {!isLoading && filteredRows.length === 0 ? (
            <TableEmptyRow colSpan={10}>Không có nhật ký công việc theo bộ lọc.</TableEmptyRow>
          ) : null}
        </TableBody>
      </TableShell>

      {filteredRows.length > 0 ? (
        <TablePagination
          totalRecords={filteredRows.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}

export default NhatKyCongViecPanel;
