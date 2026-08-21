import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer } from 'lucide-react';
import type { AcceptanceReport } from './AcceptanceReportForm';
import type { MixingReport } from './MixingReportForm';
import type { WeighingRecord } from '../utils/weighingRecords';
import ControlBoardShiftDetailModal from './ControlBoardShiftDetailModal';
import {
  ControlBoardShiftSummaryPrintBatch,
  type ShiftSummaryPrintFilters
} from './ControlBoardShiftSummaryPrintSheet';
import {
  filterControlBoardShiftSummaryRows,
  formatShiftSummaryNumber,
  formatShiftSummaryKg,
  formatShiftSummaryPercent,
  computeShiftSummarySanLuongMetrics,
  computeSoTienLoLaiNhua,
  resolveShiftSummaryGiaNhuaFromWarehouse,
  resolveShiftSummaryTlDinhMucKgCuon,
  sumShiftSummaryColumn,
  TI_LE_LOI_HONG_DINH_MUC_PERCENT,
  type ControlBoardShiftSummaryRow,
  type ShiftSummaryFilterSources
} from '../utils/controlBoardShiftSummary';
import {
  isShiftSummaryMetricClickable,
  type ShiftSummaryMetric
} from '../utils/controlBoardShiftSummaryDetails';
import type { ShiftSetting } from '../utils/shiftSettings';
import { waitForPrintImagesReady, enablePortraitPrintPage, disablePortraitPrintPage } from '../utils/printReady';
import { formatMoney } from '../utils';

const inputClass =
  'h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const SHIFT_SUMMARY_PHAN_TICH_STORAGE_KEY = 'control-board-shift-summary-phan-tich-v1';

function loadPhanTichDanhGiaMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHIFT_SUMMARY_PHAN_TICH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function persistPhanTichDanhGiaMap(map: Record<string, string>) {
  try {
    localStorage.setItem(SHIFT_SUMMARY_PHAN_TICH_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

type ShiftSummaryTabId =
  | 'lenh_sx'
  | 'phieu_xuat_kho'
  | 'ton_dau_ca'
  | 'ton_cuoi_ca'
  | 'phieu_nhap_kho'
  | 'bao_cao_loi_hong'
  | 'tong_vat_tu_thuc_dung'
  | 'san_luong';

const SHIFT_SUMMARY_TABS: Array<{ id: ShiftSummaryTabId; label: string }> = [
  { id: 'lenh_sx', label: 'Dữ liệu trong lệnh sản xuất' },
  { id: 'phieu_xuat_kho', label: 'Dữ liệu trong phiếu xuất kho' },
  { id: 'ton_dau_ca', label: 'Báo cáo dữ liệu tồn đầu ca' },
  { id: 'ton_cuoi_ca', label: 'Dữ liệu trong báo cáo kiểm tồn cuối ca' },
  { id: 'phieu_nhap_kho', label: 'Phiếu nhập kho' },
  { id: 'bao_cao_loi_hong', label: 'Báo cáo lỗi hỏng' },
  { id: 'tong_vat_tu_thuc_dung', label: 'Tổng vật tư thực xuất dùng' },
  { id: 'san_luong', label: 'Sản lượng & chênh lệch' }
];

type DetailSources = {
  shiftSettings: ShiftSetting[];
  productionOrders: Array<{
    code: string;
    startDate: string;
    shift: string;
    productCode: string;
    productName: string;
    quantity: string;
    unit: string;
    products: Array<{ productCode: string; productName: string; quantity: string; unit: string }>;
  }>;
  products: Array<{ code: string; totalWeight: string }>;
  acceptanceReports: AcceptanceReport[];
  mixingReports: MixingReport[];
  warehouseMovements?: import('../utils/controlBoardShiftSummary').ShiftSummaryWarehouseMovement[];
  weighingRecords: WeighingRecord[];
  damagedRecords?: WeighingRecord[];
  machineNvlReports?: import('../utils/machineNvlReports').MachineNvlSavedReport[];
};

function SummaryValueCell({
  row,
  metric,
  formatted,
  className,
  onOpen
}: {
  row: ControlBoardShiftSummaryRow;
  metric: ShiftSummaryMetric;
  formatted: string;
  className: string;
  onOpen: (row: ControlBoardShiftSummaryRow, metric: ShiftSummaryMetric) => void;
}) {
  const clickable = isShiftSummaryMetricClickable(row, metric);

  if (!clickable) {
    return <td className={className}>{formatted}</td>;
  }

  return (
    <td className={className}>
      <button
        type="button"
        onClick={() => onOpen(row, metric)}
        className="rounded px-1 py-0.5 font-inherit underline decoration-dotted underline-offset-2 transition hover:bg-white/80 hover:decoration-solid"
        title="Xem chi tiết dòng số liệu"
      >
        {formatted}
      </button>
    </td>
  );
}

export default function ControlBoardShiftSummaryTable({
  rows,
  isLoading,
  dateFrom,
  dateTo,
  shiftFilter,
  machineFilter,
  onStaffFilterChange,
  detailSources,
  filterSources,
  staffOptions,
  selectedMachine,
  onEditWeighingRecord,
  onDeleteWeighingRecord,
  onDeleteWeighingRecords,
  onDeleteWarehouseSlip,
  onDeleteWarehouseSlips,
  onDeleteMachineNvlReport,
  onDeleteMachineNvlReports
}: {
  rows: ControlBoardShiftSummaryRow[];
  isLoading: boolean;
  dateFrom: string;
  dateTo: string;
  shiftFilter: string;
  machineFilter: string;
  onStaffFilterChange?: (value: string) => void;
  detailSources: DetailSources;
  filterSources: ShiftSummaryFilterSources;
  staffOptions: string[];
  selectedMachine?: { code?: string; name?: string } | null;
  onEditWeighingRecord?: (recordId: string | number) => void;
  onDeleteWeighingRecord?: (recordId: string | number) => Promise<void>;
  onDeleteWeighingRecords?: (recordIds: Array<string | number>) => Promise<void>;
  onDeleteWarehouseSlip?: (slipCode: string) => Promise<void>;
  onDeleteWarehouseSlips?: (slipCodes: string[]) => Promise<void>;
  onDeleteMachineNvlReport?: (reportId: string) => Promise<void>;
  onDeleteMachineNvlReports?: (reportIds: string[]) => Promise<void>;
}) {
  const [detailContext, setDetailContext] = useState<{
    ngay: string;
    ca: string;
    metric: ShiftSummaryMetric;
    summaryRow?: ControlBoardShiftSummaryRow;
  } | null>(null);
  const [staffFilter, setStaffFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<ShiftSummaryTabId>('lenh_sx');
  const [printPayload, setPrintPayload] = useState<{
    rows: ControlBoardShiftSummaryRow[];
    filters: ShiftSummaryPrintFilters;
    phanTichDanhGiaMap: Record<string, string>;
  } | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const [phanTichDanhGiaMap, setPhanTichDanhGiaMap] = useState<Record<string, string>>(() =>
    typeof window !== 'undefined' ? loadPhanTichDanhGiaMap() : {}
  );

  const updatePhanTichDanhGia = (rowKey: string, value: string) => {
    setPhanTichDanhGiaMap(prev => {
      const next = { ...prev, [rowKey]: value };
      persistPhanTichDanhGiaMap(next);
      return next;
    });
  };

  const resolveRowGiaNhua = (row: Pick<ControlBoardShiftSummaryRow, 'ngay' | 'ca'>) =>
    resolveShiftSummaryGiaNhuaFromWarehouse(
      row.ngay,
      row.ca,
      detailSources.warehouseMovements,
      detailSources.shiftSettings
    );

  const filteredRows = useMemo(
    () =>
      filterControlBoardShiftSummaryRows(
        rows,
        {
          shiftFilter,
          staffFilter,
          machineFilter
        },
        filterSources,
        selectedMachine
      ),
    [rows, shiftFilter, staffFilter, machineFilter, filterSources, selectedMachine]
  );

  const totals = {
    slHang: sumShiftSummaryColumn(filteredRows, 'slHang'),
    khoiLuongHang: sumShiftSummaryColumn(filteredRows, 'khoiLuongHang'),
    slHangThucTe: sumShiftSummaryColumn(filteredRows, 'slHangThucTe'),
    khoiLuongHangThucTe: sumShiftSummaryColumn(filteredRows, 'khoiLuongHangThucTe'),
    khoiLuongNhuaTp: sumShiftSummaryColumn(filteredRows, 'khoiLuongNhuaTp'),
    hangHongNhua: sumShiftSummaryColumn(filteredRows, 'hangHongNhua'),
    hangHongMang: sumShiftSummaryColumn(filteredRows, 'hangHongMang'),
    khoiLuongNpl: sumShiftSummaryColumn(filteredRows, 'khoiLuongNpl'),
    khoiLuongMangXuat: sumShiftSummaryColumn(filteredRows, 'khoiLuongMangXuat'),
    khoiLuongLoiXuatKho: sumShiftSummaryColumn(filteredRows, 'khoiLuongLoiXuatKho'),
    khoiLuongTuiXuatKho: sumShiftSummaryColumn(filteredRows, 'khoiLuongTuiXuatKho'),
    tongTrongLuongXuatKho: sumShiftSummaryColumn(filteredRows, 'tongTrongLuongXuatKho'),
    tonDauCaNhua: sumShiftSummaryColumn(filteredRows, 'tonDauCaNhua'),
    tonDauCaMang: sumShiftSummaryColumn(filteredRows, 'tonDauCaMang'),
    tonDauCaLoi: sumShiftSummaryColumn(filteredRows, 'tonDauCaLoi'),
    tonDauCaTui: sumShiftSummaryColumn(filteredRows, 'tonDauCaTui'),
    tongTrongLuongTonDauCa: sumShiftSummaryColumn(filteredRows, 'tongTrongLuongTonDauCa'),
    tonCuoiCaNhua: sumShiftSummaryColumn(filteredRows, 'tonCuoiCaNhua'),
    tonCuoiCaMang: sumShiftSummaryColumn(filteredRows, 'tonCuoiCaMang'),
    tonCuoiCaLoi: sumShiftSummaryColumn(filteredRows, 'tonCuoiCaLoi'),
    tonCuoiCaTui: sumShiftSummaryColumn(filteredRows, 'tonCuoiCaTui'),
    tongTrongLuongTonCuoiCa: sumShiftSummaryColumn(filteredRows, 'tongTrongLuongTonCuoiCa'),
    slDatThucTeNhapKho: sumShiftSummaryColumn(filteredRows, 'slDatThucTeNhapKho'),
    tlNhuaTpNhapKho: sumShiftSummaryColumn(filteredRows, 'tlNhuaTpNhapKho'),
    tlMangTpNhapKho: sumShiftSummaryColumn(filteredRows, 'tlMangTpNhapKho'),
    tlTuiBaoBiNhapKho: sumShiftSummaryColumn(filteredRows, 'tlTuiBaoBiNhapKho'),
    tlLoiTpNhapKho: sumShiftSummaryColumn(filteredRows, 'tlLoiTpNhapKho'),
    tongTpNhapKho: sumShiftSummaryColumn(filteredRows, 'tongTpNhapKho'),
    tlNhuaKhongMangLoiHong: sumShiftSummaryColumn(filteredRows, 'tlNhuaKhongMangLoiHong'),
    tlNhuaCucDauNongLoiHong: sumShiftSummaryColumn(filteredRows, 'tlNhuaCucDauNongLoiHong'),
    tlNhuaDinhMangLoiHong: sumShiftSummaryColumn(filteredRows, 'tlNhuaDinhMangLoiHong'),
    tlMangLoiHong: sumShiftSummaryColumn(filteredRows, 'tlMangLoiHong'),
    soCuonLoiDinhHangHong: sumShiftSummaryColumn(filteredRows, 'soCuonLoiDinhHangHong'),
    tongTrongLuongLoiHong: sumShiftSummaryColumn(filteredRows, 'tongTrongLuongLoiHong'),
    khoiLuongLoi: sumShiftSummaryColumn(filteredRows, 'khoiLuongLoi'),
    khoiLuongMang: sumShiftSummaryColumn(filteredRows, 'khoiLuongMang'),
    tonDauCa: sumShiftSummaryColumn(filteredRows, 'tonDauCa'),
    tonCuoiCa: sumShiftSummaryColumn(filteredRows, 'tonCuoiCa'),
    tongNhuaThucDung: sumShiftSummaryColumn(filteredRows, 'tongNhuaThucDung'),
    tongMangThucDung: sumShiftSummaryColumn(filteredRows, 'tongMangThucDung'),
    loiThucDung: sumShiftSummaryColumn(filteredRows, 'loiThucDung'),
    tuiThucDung: sumShiftSummaryColumn(filteredRows, 'tuiThucDung'),
    tongThucDung: sumShiftSummaryColumn(filteredRows, 'tongThucDung'),
    tongVatLieu: sumShiftSummaryColumn(filteredRows, 'tongVatLieu'),
    chenhLech: sumShiftSummaryColumn(filteredRows, 'chenhLech'),
    tongTrongLuongNhapKho: sumShiftSummaryColumn(filteredRows, 'tongTrongLuongNhapKho'),
    chenhLechTrongLuongNhapXuat: sumShiftSummaryColumn(filteredRows, 'chenhLechTrongLuongNhapXuat'),
    giaTriLoLaiNhua: sumShiftSummaryColumn(filteredRows, 'giaTriLoLaiNhua'),
    giaTriLoLaiMang: sumShiftSummaryColumn(filteredRows, 'giaTriLoLaiMang')
  };

  const sanLuongTotals = computeShiftSummarySanLuongMetrics({
    tongTpNhapKho: totals.tongTpNhapKho,
    tongTrongLuongLoiHong: totals.tongTrongLuongLoiHong,
    tongThucDung: totals.tongThucDung,
    chenhLechNhua: totals.chenhLech,
    tongMangThucDung: totals.tongMangThucDung,
    tlMangTpNhapKho: totals.tlMangTpNhapKho,
    hangHongMang: totals.hangHongMang,
    tiLeLoiHongDinhMuc: TI_LE_LOI_HONG_DINH_MUC_PERCENT
  });

  const tongSoTienLoLaiNhua = filteredRows.reduce(
    (sum, row) => sum + computeSoTienLoLaiNhua(row.giaTriLoLaiNhua, resolveRowGiaNhua(row)),
    0
  );

  const shiftFilterLabel = shiftFilter === 'all' ? 'Tất cả ca' : shiftFilter;
  const machineFilterLabel = machineFilter === 'all' ? 'Tất cả máy' : machineFilter;
  const staffFilterLabel = staffFilter === 'all' ? 'Tất cả nhân viên' : staffFilter;

  const openDetail = (row: ControlBoardShiftSummaryRow, metric: ShiftSummaryMetric) => {
    setDetailContext({ ngay: row.ngay, ca: row.ca, metric, summaryRow: row });
  };

  const handlePrint = () => {
    setPrintPayload({
      rows: filteredRows,
      filters: {
        dateFrom,
        dateTo,
        shiftLabel: shiftFilterLabel,
        staffLabel: staffFilterLabel,
        machineLabel: machineFilterLabel
      },
      phanTichDanhGiaMap
    });
    setPendingPrint(true);
  };

  useEffect(() => {
    if (!pendingPrint || !printPayload) return;
    let cancelled = false;
    document.body.classList.add('shift-summary-print-active');
    enablePortraitPrintPage('shift-summary-page-portrait');
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPendingPrint(false);
          disablePortraitPrintPage('shift-summary-page-portrait');
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      disablePortraitPrintPage('shift-summary-page-portrait');
      document.body.classList.remove('shift-summary-print-active');
    };
  }, [pendingPrint, printPayload]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('shift-summary-print-active');
      setPrintPayload(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const detailModal = detailContext ? (
    <ControlBoardShiftDetailModal
      ngay={detailContext.ngay}
      ca={detailContext.ca}
      metric={detailContext.metric}
      sources={detailSources}
      summaryRow={detailContext.summaryRow}
      onClose={() => setDetailContext(null)}
      onEditWeighingRecord={onEditWeighingRecord}
      onDeleteWeighingRecord={onDeleteWeighingRecord}
      onDeleteWeighingRecords={onDeleteWeighingRecords}
      onDeleteWarehouseSlip={onDeleteWarehouseSlip}
      onDeleteWarehouseSlips={onDeleteWarehouseSlips}
      onDeleteMachineNvlReport={onDeleteMachineNvlReport}
      onDeleteMachineNvlReports={onDeleteMachineNvlReports}
    />
  ) : null;

  return (
    <>
      <section className="control-board-report-theme min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-red-800 bg-gradient-to-r from-[#b30d1c] to-[#ef1b2d] px-3 py-2 text-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200/90">Tổng hợp sản xuất</p>
              <h3 className="text-sm font-black sm:text-base">Tổng hợp máy cách nhiệt</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <label className="col-span-1 flex min-w-0 flex-col gap-1 text-[10px] font-bold text-sky-100 sm:flex-row sm:items-center sm:gap-1.5 sm:text-xs">
                <span className="shrink-0">NV</span>
                <select
                  value={staffFilter}
                  onChange={event => {
                    setStaffFilter(event.target.value);
                    onStaffFilterChange?.(event.target.value);
                  }}
                  className={`${inputClass} w-full min-w-0 sm:max-w-[180px]`}
                >
                  <option value="all">Tất cả</option>
                  {staffOptions.map(staff => (
                    <option key={staff} value={staff}>
                      {staff}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handlePrint}
                disabled={isLoading}
                className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/80 bg-white px-3 text-[11px] font-black text-sky-950 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-1 sm:w-auto"
              >
                <Printer className="h-4 w-4" />
                In báo cáo
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-zinc-100 bg-zinc-50/80 px-2 py-1">
          {SHIFT_SUMMARY_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide transition ${
                activeTab === tab.id
                  ? 'bg-[#ef1b2d] text-white shadow-sm'
                  : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile: thẻ gọn theo từng ca */}
        <div className="space-y-2 p-2 md:hidden">
          {isLoading ? (
            <div className="py-8 text-center text-xs font-bold text-zinc-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Đang tải dữ liệu tổng hợp...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-xs font-bold text-zinc-400">Chưa có dữ liệu theo bộ lọc đã chọn.</div>
          ) : (
            <>
              {filteredRows.map(row => {
                const tlDinhMuc = resolveShiftSummaryTlDinhMucKgCuon(row);
                return (
                <article key={row.key} className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-200/80 pb-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-bold text-zinc-700">{row.ngay}</p>
                      <p className="truncate text-xs font-black text-zinc-900">{row.ca}</p>
                    </div>
                    {activeTab === 'tong_vat_tu_thuc_dung' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-teal-800">
                        Tổng thực dùng
                        <span className="mt-0.5 block font-mono text-sm">
                          {formatShiftSummaryKg(row.tongThucDung, 3)}
                        </span>
                      </p>
                    ) : activeTab === 'lenh_sx' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        Tổng TL đặt SX
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryNumber(row.khoiLuongHang, 3)} kg</span>
                      </p>
                    ) : activeTab === 'phieu_xuat_kho' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-amber-800">
                        Tổng xuất kho
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.tongTrongLuongXuatKho, 3)}</span>
                      </p>
                    ) : activeTab === 'ton_dau_ca' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-indigo-800">
                        Tổng tồn đầu ca
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.tongTrongLuongTonDauCa, 3)}</span>
                      </p>
                    ) : activeTab === 'ton_cuoi_ca' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-violet-800">
                        Tổng tồn cuối ca
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.tongTrongLuongTonCuoiCa, 3)}</span>
                      </p>
                    ) : activeTab === 'phieu_nhap_kho' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        Tổng TP nhập kho
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.tongTpNhapKho, 3)}</span>
                      </p>
                    ) : activeTab === 'bao_cao_loi_hong' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-rose-800">
                        Tổng lỗi hỏng
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.tongTrongLuongLoiHong, 3)}</span>
                      </p>
                    ) : activeTab === 'san_luong' ? (
                      <p className="text-right text-[10px] font-black uppercase tracking-wider text-orange-800">
                        CL nhập−xuất
                        <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryKg(row.chenhLechTrongLuongNhapXuat, 3)}</span>
                      </p>
                    ) : (
                      <div className="flex shrink-0 items-start gap-3">
                        <p className="text-right text-[10px] font-black uppercase tracking-wider text-teal-800">
                          TN sử dụng
                          <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryNumber(row.tongVatLieu, 3)}</span>
                        </p>
                        <p className="text-right text-[10px] font-black uppercase tracking-wider text-orange-700">
                          CL nhựa
                          <span className="mt-0.5 block font-mono text-sm">{formatShiftSummaryNumber(row.chenhLech, 3)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  {activeTab === 'tong_vat_tu_thuc_dung' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Tổng Nhựa thực dùng</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.tongNhuaThucDung, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Tổng Màng thực dùng</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.tongMangThucDung, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Lõi thực dùng</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.loiThucDung, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Túi thực dùng</dt>
                        <dd className="font-mono font-bold text-cyan-700">{formatShiftSummaryKg(row.tuiThucDung, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'lenh_sx' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">SL đặt SX</dt>
                        <dd className="font-mono font-bold text-zinc-800">{formatShiftSummaryNumber(row.slHang, 0)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">TL định mức kg/cuộn</dt>
                        <dd className="font-mono font-bold text-indigo-700">{formatShiftSummaryNumber(tlDinhMuc, 3)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Tổng TL đặt SX (kg)</dt>
                        <dd className="font-mono font-bold text-emerald-700">{formatShiftSummaryNumber(row.khoiLuongHang, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'phieu_xuat_kho' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa xuất dùng</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.khoiLuongNpl, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Màng xuất dùng</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.khoiLuongMangXuat, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Lõi xuất kho</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.khoiLuongLoiXuatKho, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Túi xuất kho</dt>
                        <dd className="font-mono font-bold text-cyan-700">{formatShiftSummaryKg(row.khoiLuongTuiXuatKho, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'ton_dau_ca' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa tồn đầu ca</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.tonDauCaNhua, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Màng tồn đầu ca</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.tonDauCaMang, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Lõi tồn đầu ca</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.tonDauCaLoi, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Túi tồn đầu ca</dt>
                        <dd className="font-mono font-bold text-cyan-700">{formatShiftSummaryKg(row.tonDauCaTui, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'ton_cuoi_ca' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa tồn cuối ca</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.tonCuoiCaNhua, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Màng tồn cuối ca</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.tonCuoiCaMang, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Lõi tồn cuối ca</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.tonCuoiCaLoi, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Túi tồn cuối ca</dt>
                        <dd className="font-mono font-bold text-cyan-700">{formatShiftSummaryKg(row.tonCuoiCaTui, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'phieu_nhap_kho' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">SL đạt thực tế</dt>
                        <dd className="font-mono font-bold text-sky-700">{formatShiftSummaryNumber(row.slDatThucTeNhapKho, 0)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">TL nhựa TP</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.tlNhuaTpNhapKho, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">TL màng TP</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.tlMangTpNhapKho, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">TL túi bao bì</dt>
                        <dd className="font-mono font-bold text-cyan-700">{formatShiftSummaryKg(row.tlTuiBaoBiNhapKho, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">TL lõi TP</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.tlLoiTpNhapKho, 3)}</dd>
                      </div>
                    </dl>
                  ) : activeTab === 'bao_cao_loi_hong' ? (
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa không mảng</dt>
                        <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryKg(row.tlNhuaKhongMangLoiHong, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa cục đầu nòng</dt>
                        <dd className="font-mono font-bold text-orange-700">{formatShiftSummaryKg(row.tlNhuaCucDauNongLoiHong, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Nhựa dính màng</dt>
                        <dd className="font-mono font-bold text-rose-700">{formatShiftSummaryKg(row.tlNhuaDinhMangLoiHong, 3)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Màng lỗi hỏng</dt>
                        <dd className="font-mono font-bold text-fuchsia-700">{formatShiftSummaryKg(row.tlMangLoiHong, 3)}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-bold uppercase tracking-wider text-zinc-400">Số cuộn lõi dính hàng hỏng</dt>
                        <dd className="font-mono font-bold text-stone-700">{formatShiftSummaryKg(row.soCuonLoiDinhHangHong, 3)}</dd>
                      </div>
                    </dl>
                  ) : (
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Tổng TL nhập kho</dt>
                      <dd className="font-mono font-bold text-emerald-700">{formatShiftSummaryKg(row.tongTrongLuongNhapKho, 3)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">CL nhập − xuất</dt>
                      <dd className="font-mono font-bold text-orange-700">{formatShiftSummaryKg(row.chenhLechTrongLuongNhapXuat, 3)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Tỉ lệ CL TL</dt>
                      <dd className="font-mono font-bold text-sky-700">{formatShiftSummaryPercent(row.tiLeChenhLechTrongLuong)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Tỉ lệ LH ĐM</dt>
                      <dd className="font-mono font-bold text-zinc-700">{formatShiftSummaryPercent(row.tiLeLoiHongDinhMuc)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Tỉ lệ lỗi hỏng</dt>
                      <dd className="font-mono font-bold text-rose-700">{formatShiftSummaryPercent(row.tiLeLoiHong)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Lệch LH vs ĐM</dt>
                      <dd className="font-mono font-bold text-amber-700">{formatShiftSummaryPercent(row.lechLoiHongVsDinhMuc)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Lỗ/lãi nhựa</dt>
                      <dd className="font-mono font-bold text-amber-800">{formatShiftSummaryKg(row.giaTriLoLaiNhua, 3)}</dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Giá (từ phiếu kho)</dt>
                      <dd className="font-mono font-bold text-zinc-800">
                        {(() => {
                          const gia = resolveRowGiaNhua(row);
                          return gia > 0 ? `${formatMoney(gia, 0)} đ` : '—';
                        })()}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Số tiền lỗ lãi nhựa</dt>
                      <dd className="font-mono font-bold text-emerald-800">
                        {formatMoney(
                          computeSoTienLoLaiNhua(row.giaTriLoLaiNhua, resolveRowGiaNhua(row)),
                          0
                        )}{' '}
                        đ
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Lỗ/lãi màng</dt>
                      <dd className="font-mono font-bold text-fuchsia-800">{formatShiftSummaryKg(row.giaTriLoLaiMang, 3)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="font-bold uppercase tracking-wider text-zinc-400">Phân tích đánh giá</dt>
                      <dd className="mt-0.5">
                        <textarea
                          value={phanTichDanhGiaMap[row.key] || ''}
                          onChange={event => updatePhanTichDanhGia(row.key, event.target.value)}
                          rows={2}
                          placeholder="Gõ tay phân tích đánh giá..."
                          className="w-full resize-y rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
                        />
                      </dd>
                    </div>
                  </dl>
                  )}
                </article>
              );
              })}
              <div className="rounded-lg border border-zinc-300 bg-zinc-100 px-2.5 py-2 text-[10px] font-black text-zinc-800">
                <p className="mb-1 uppercase tracking-wider text-zinc-500">Tổng cộng</p>
                {activeTab === 'tong_vat_tu_thuc_dung' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-amber-700">Tổng Nhựa: {formatShiftSummaryKg(totals.tongNhuaThucDung, 3)}</span>
                    <span className="text-fuchsia-700">Tổng Màng: {formatShiftSummaryKg(totals.tongMangThucDung, 3)}</span>
                    <span className="text-stone-700">Lõi: {formatShiftSummaryKg(totals.loiThucDung, 3)}</span>
                    <span className="text-cyan-700">Túi: {formatShiftSummaryKg(totals.tuiThucDung, 3)}</span>
                    <span className="col-span-2 text-teal-800">Tổng thực dùng: {formatShiftSummaryKg(totals.tongThucDung, 3)}</span>
                  </div>
                ) : activeTab === 'lenh_sx' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span>SL đặt SX: {formatShiftSummaryNumber(totals.slHang, 0)}</span>
                    <span className="text-indigo-700">
                      TL định mức: {totals.slHang > 0 ? formatShiftSummaryNumber(totals.khoiLuongHang / totals.slHang, 3) : '-'}
                    </span>
                    <span className="col-span-2 text-emerald-700">Tổng TL đặt SX: {formatShiftSummaryNumber(totals.khoiLuongHang, 3)} kg</span>
                  </div>
                ) : activeTab === 'phieu_xuat_kho' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-amber-700">Nhựa: {formatShiftSummaryKg(totals.khoiLuongNpl, 3)}</span>
                    <span className="text-fuchsia-700">Màng: {formatShiftSummaryKg(totals.khoiLuongMangXuat, 3)}</span>
                    <span className="text-stone-700">Lõi: {formatShiftSummaryKg(totals.khoiLuongLoiXuatKho, 3)}</span>
                    <span className="text-cyan-700">Túi: {formatShiftSummaryKg(totals.khoiLuongTuiXuatKho, 3)}</span>
                    <span className="col-span-2">Tổng xuất kho: {formatShiftSummaryKg(totals.tongTrongLuongXuatKho, 3)}</span>
                  </div>
                ) : activeTab === 'ton_dau_ca' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-amber-700">Nhựa: {formatShiftSummaryKg(totals.tonDauCaNhua, 3)}</span>
                    <span className="text-fuchsia-700">Màng: {formatShiftSummaryKg(totals.tonDauCaMang, 3)}</span>
                    <span className="text-stone-700">Lõi: {formatShiftSummaryKg(totals.tonDauCaLoi, 3)}</span>
                    <span className="text-cyan-700">Túi: {formatShiftSummaryKg(totals.tonDauCaTui, 3)}</span>
                    <span className="col-span-2 text-indigo-800">Tổng tồn đầu ca: {formatShiftSummaryKg(totals.tongTrongLuongTonDauCa, 3)}</span>
                  </div>
                ) : activeTab === 'ton_cuoi_ca' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-amber-700">Nhựa: {formatShiftSummaryKg(totals.tonCuoiCaNhua, 3)}</span>
                    <span className="text-fuchsia-700">Màng: {formatShiftSummaryKg(totals.tonCuoiCaMang, 3)}</span>
                    <span className="text-stone-700">Lõi: {formatShiftSummaryKg(totals.tonCuoiCaLoi, 3)}</span>
                    <span className="text-cyan-700">Túi: {formatShiftSummaryKg(totals.tonCuoiCaTui, 3)}</span>
                    <span className="col-span-2 text-violet-800">Tổng tồn cuối ca: {formatShiftSummaryKg(totals.tongTrongLuongTonCuoiCa, 3)}</span>
                  </div>
                ) : activeTab === 'phieu_nhap_kho' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-sky-700">SL đạt TT: {formatShiftSummaryNumber(totals.slDatThucTeNhapKho, 0)}</span>
                    <span className="text-amber-700">Nhựa TP: {formatShiftSummaryKg(totals.tlNhuaTpNhapKho, 3)}</span>
                    <span className="text-fuchsia-700">Màng TP: {formatShiftSummaryKg(totals.tlMangTpNhapKho, 3)}</span>
                    <span className="text-cyan-700">Túi: {formatShiftSummaryKg(totals.tlTuiBaoBiNhapKho, 3)}</span>
                    <span className="text-stone-700">Lõi TP: {formatShiftSummaryKg(totals.tlLoiTpNhapKho, 3)}</span>
                    <span className="col-span-2 text-emerald-800">Tổng TP nhập kho: {formatShiftSummaryKg(totals.tongTpNhapKho, 3)}</span>
                  </div>
                ) : activeTab === 'bao_cao_loi_hong' ? (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <span className="text-amber-700">Nhựa không mảng: {formatShiftSummaryKg(totals.tlNhuaKhongMangLoiHong, 3)}</span>
                    <span className="text-orange-700">Cục đầu nòng: {formatShiftSummaryKg(totals.tlNhuaCucDauNongLoiHong, 3)}</span>
                    <span className="text-rose-700">Dính màng: {formatShiftSummaryKg(totals.tlNhuaDinhMangLoiHong, 3)}</span>
                    <span className="text-fuchsia-700">Màng: {formatShiftSummaryKg(totals.tlMangLoiHong, 3)}</span>
                    <span className="text-stone-700">Lõi dính HH: {formatShiftSummaryKg(totals.soCuonLoiDinhHangHong, 3)}</span>
                    <span className="col-span-2">Tổng lỗi hỏng: {formatShiftSummaryKg(totals.tongTrongLuongLoiHong, 3)}</span>
                  </div>
                ) : (
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <span className="text-emerald-700">TL nhập kho: {formatShiftSummaryKg(sanLuongTotals.tongTrongLuongNhapKho, 3)}</span>
                  <span className="text-orange-700">CL nhập−xuất: {formatShiftSummaryKg(sanLuongTotals.chenhLechTrongLuongNhapXuat, 3)}</span>
                  <span className="text-sky-700">Tỉ lệ CL: {formatShiftSummaryPercent(sanLuongTotals.tiLeChenhLechTrongLuong)}</span>
                  <span className="text-rose-700">Tỉ lệ LH: {formatShiftSummaryPercent(sanLuongTotals.tiLeLoiHong)}</span>
                  <span className="text-amber-800">Lỗ/lãi nhựa: {formatShiftSummaryKg(sanLuongTotals.giaTriLoLaiNhua, 3)}</span>
                  <span className="text-emerald-800">Số tiền LL nhựa: {formatMoney(tongSoTienLoLaiNhua, 0)} đ</span>
                  <span className="text-fuchsia-800">Lỗ/lãi màng: {formatShiftSummaryKg(sanLuongTotals.giaTriLoLaiMang, 3)}</span>
                </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          {activeTab === 'lenh_sx' ? (
          <table className="min-w-[720px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">SL đặt SX</th>
                <th className="px-3 py-2.5 text-right font-black">TL định mức kg/cuộn</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng TL đặt SX (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="slHang" formatted={formatShiftSummaryNumber(row.slHang, 0)} className="px-3 py-2 text-right font-mono font-bold text-zinc-800" onOpen={openDetail} />
                    <td className="px-3 py-2 text-right font-mono font-bold text-indigo-700">
                      {formatShiftSummaryNumber(resolveShiftSummaryTlDinhMucKgCuon(row), 3)}
                    </td>
                    <SummaryValueCell row={row} metric="khoiLuongHang" formatted={formatShiftSummaryNumber(row.khoiLuongHang, 3)} className="px-3 py-2 text-right font-mono font-bold text-emerald-700" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatShiftSummaryNumber(totals.slHang, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-indigo-700">
                    {totals.slHang > 0 ? formatShiftSummaryNumber(totals.khoiLuongHang / totals.slHang, 3) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{formatShiftSummaryNumber(totals.khoiLuongHang, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'phieu_xuat_kho' ? (
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng nhựa thực tế xuất dùng (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng màng thực tế xuất dùng (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng lõi xuất kho (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng túi xuất kho (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng trọng lượng xuất kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="khoiLuongNpl" formatted={formatShiftSummaryKg(row.khoiLuongNpl, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="khoiLuongMangXuat" formatted={formatShiftSummaryKg(row.khoiLuongMangXuat, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="khoiLuongLoiXuatKho" formatted={formatShiftSummaryKg(row.khoiLuongLoiXuatKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="khoiLuongTuiXuatKho" formatted={formatShiftSummaryKg(row.khoiLuongTuiXuatKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-cyan-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongTrongLuongXuatKho" formatted={formatShiftSummaryKg(row.tongTrongLuongXuatKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-zinc-900" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.khoiLuongNpl, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.khoiLuongMangXuat, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.khoiLuongLoiXuatKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700">{formatShiftSummaryKg(totals.khoiLuongTuiXuatKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatShiftSummaryKg(totals.tongTrongLuongXuatKho, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'ton_dau_ca' ? (
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng nhựa tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng màng tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng lõi tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng túi tồn đầu ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng trọng lượng tồn đầu ca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="tonDauCaNhua" formatted={formatShiftSummaryKg(row.tonDauCaNhua, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonDauCaMang" formatted={formatShiftSummaryKg(row.tonDauCaMang, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonDauCaLoi" formatted={formatShiftSummaryKg(row.tonDauCaLoi, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonDauCaTui" formatted={formatShiftSummaryKg(row.tonDauCaTui, 3)} className="px-3 py-2 text-right font-mono font-bold text-cyan-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongTrongLuongTonDauCa" formatted={formatShiftSummaryKg(row.tongTrongLuongTonDauCa, 3)} className="px-3 py-2 text-right font-mono font-bold text-indigo-900" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.tonDauCaNhua, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.tonDauCaMang, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.tonDauCaLoi, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700">{formatShiftSummaryKg(totals.tonDauCaTui, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-indigo-900">{formatShiftSummaryKg(totals.tongTrongLuongTonDauCa, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'ton_cuoi_ca' ? (
          <table className="min-w-[960px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng nhựa tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng màng tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng lõi tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Trọng lượng túi tồn cuối ca (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng trọng lượng tồn cuối ca</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="tonCuoiCaNhua" formatted={formatShiftSummaryKg(row.tonCuoiCaNhua, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonCuoiCaMang" formatted={formatShiftSummaryKg(row.tonCuoiCaMang, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonCuoiCaLoi" formatted={formatShiftSummaryKg(row.tonCuoiCaLoi, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tonCuoiCaTui" formatted={formatShiftSummaryKg(row.tonCuoiCaTui, 3)} className="px-3 py-2 text-right font-mono font-bold text-cyan-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongTrongLuongTonCuoiCa" formatted={formatShiftSummaryKg(row.tongTrongLuongTonCuoiCa, 3)} className="px-3 py-2 text-right font-mono font-bold text-violet-900" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.tonCuoiCaNhua, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.tonCuoiCaMang, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.tonCuoiCaLoi, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700">{formatShiftSummaryKg(totals.tonCuoiCaTui, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-violet-900">{formatShiftSummaryKg(totals.tongTrongLuongTonCuoiCa, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'phieu_nhap_kho' ? (
          <table className="min-w-[1080px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Số lượng đạt thực tế</th>
                <th className="px-3 py-2.5 text-right font-black">TL nhựa thành phẩm (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL màng thành phẩm (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL túi bao bì nhập kho (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL lõi thành phẩm (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng TP nhập kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="slDatThucTeNhapKho" formatted={formatShiftSummaryNumber(row.slDatThucTeNhapKho, 0)} className="px-3 py-2 text-right font-mono font-bold text-sky-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlNhuaTpNhapKho" formatted={formatShiftSummaryKg(row.tlNhuaTpNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlMangTpNhapKho" formatted={formatShiftSummaryKg(row.tlMangTpNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlTuiBaoBiNhapKho" formatted={formatShiftSummaryKg(row.tlTuiBaoBiNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-cyan-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlLoiTpNhapKho" formatted={formatShiftSummaryKg(row.tlLoiTpNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongTpNhapKho" formatted={formatShiftSummaryKg(row.tongTpNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-emerald-900" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-700">{formatShiftSummaryNumber(totals.slDatThucTeNhapKho, 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.tlNhuaTpNhapKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.tlMangTpNhapKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700">{formatShiftSummaryKg(totals.tlTuiBaoBiNhapKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.tlLoiTpNhapKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-900">{formatShiftSummaryKg(totals.tongTpNhapKho, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'bao_cao_loi_hong' ? (
          <table className="min-w-[1280px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">TL Nhựa không mảng lỗi hỏng (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL Nhựa cục đầu nòng lỗi hỏng (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL Nhựa lỗi dính màng lỗi hỏng (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">TL Màng lỗi hỏng (kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Số cuộn lõi dính trong hàng hỏng (Kg)</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng trọng lượng lỗi hỏng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="tlNhuaKhongMangLoiHong" formatted={formatShiftSummaryKg(row.tlNhuaKhongMangLoiHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlNhuaCucDauNongLoiHong" formatted={formatShiftSummaryKg(row.tlNhuaCucDauNongLoiHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-orange-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlNhuaDinhMangLoiHong" formatted={formatShiftSummaryKg(row.tlNhuaDinhMangLoiHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-rose-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tlMangLoiHong" formatted={formatShiftSummaryKg(row.tlMangLoiHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="soCuonLoiDinhHangHong" formatted={formatShiftSummaryKg(row.soCuonLoiDinhHangHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongTrongLuongLoiHong" formatted={formatShiftSummaryKg(row.tongTrongLuongLoiHong, 3)} className="px-3 py-2 text-right font-mono font-bold text-zinc-900" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.tlNhuaKhongMangLoiHong, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-700">{formatShiftSummaryKg(totals.tlNhuaCucDauNongLoiHong, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-700">{formatShiftSummaryKg(totals.tlNhuaDinhMangLoiHong, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.tlMangLoiHong, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.soCuonLoiDinhHangHong, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{formatShiftSummaryKg(totals.tongTrongLuongLoiHong, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'tong_vat_tu_thuc_dung' ? (
          <table className="min-w-[900px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng Nhựa thực dùng</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng Màng thực dùng</th>
                <th className="px-3 py-2.5 text-right font-black">Lõi thực dùng</th>
                <th className="px-3 py-2.5 text-right font-black">Túi thực dùng</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng thực dùng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="tongNhuaThucDung" formatted={formatShiftSummaryKg(row.tongNhuaThucDung, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongMangThucDung" formatted={formatShiftSummaryKg(row.tongMangThucDung, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="loiThucDung" formatted={formatShiftSummaryKg(row.loiThucDung, 3)} className="px-3 py-2 text-right font-mono font-bold text-stone-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tuiThucDung" formatted={formatShiftSummaryKg(row.tuiThucDung, 3)} className="px-3 py-2 text-right font-mono font-bold text-cyan-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tongThucDung" formatted={formatShiftSummaryKg(row.tongThucDung, 3)} className="px-3 py-2 text-right font-mono font-bold text-teal-800" onOpen={openDetail} />
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryKg(totals.tongNhuaThucDung, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-700">{formatShiftSummaryKg(totals.tongMangThucDung, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-stone-700">{formatShiftSummaryKg(totals.loiThucDung, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-cyan-700">{formatShiftSummaryKg(totals.tuiThucDung, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-teal-800">{formatShiftSummaryKg(totals.tongThucDung, 3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          ) : activeTab === 'san_luong' ? (
          <table className="min-w-[1680px] w-full text-left text-xs">
            <thead className="bg-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
              <tr>
                <th className="px-3 py-2.5 font-black">Ngày</th>
                <th className="px-3 py-2.5 font-black">Ca</th>
                <th className="px-3 py-2.5 text-right font-black">Tổng trọng lượng nhập kho</th>
                <th className="px-3 py-2.5 text-right font-black">Chênh lệch TL nhập − xuất kho</th>
                <th className="px-3 py-2.5 text-right font-black">Tỉ lệ chênh lệch trọng lượng</th>
                <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng định mức</th>
                <th className="px-3 py-2.5 text-right font-black">Tỉ lệ lỗi hỏng</th>
                <th className="px-3 py-2.5 text-right font-black">Lệch lỗi hỏng so với định mức</th>
                <th className="px-3 py-2.5 text-right font-black">Giá trị lỗ/lãi nhựa</th>
                <th className="px-3 py-2.5 text-right font-black">Giá (từ phiếu kho)</th>
                <th className="px-3 py-2.5 text-right font-black">Số tiền lỗ lãi nhựa</th>
                <th className="px-3 py-2.5 text-right font-black">Giá trị lỗ/lãi màng</th>
                <th className="px-3 py-2.5 font-black">Phân tích đánh giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="px-3 py-10 text-center font-bold text-zinc-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Đang tải dữ liệu tổng hợp...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-10 text-center font-bold text-zinc-400">
                    Chưa có dữ liệu theo bộ lọc đã chọn.
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => {
                  const giaNhua = resolveRowGiaNhua(row);
                  const soTienLoLaiNhua = computeSoTienLoLaiNhua(row.giaTriLoLaiNhua, giaNhua);
                  return (
                  <tr key={row.key} className="hover:bg-sky-50/50">
                    <td className="px-3 py-2 font-mono font-bold text-zinc-700">{row.ngay}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-800">{row.ca}</td>
                    <SummaryValueCell row={row} metric="tongTrongLuongNhapKho" formatted={formatShiftSummaryKg(row.tongTrongLuongNhapKho, 3)} className="px-3 py-2 text-right font-mono font-bold text-emerald-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="chenhLechTrongLuongNhapXuat" formatted={formatShiftSummaryKg(row.chenhLechTrongLuongNhapXuat, 3)} className="px-3 py-2 text-right font-mono font-bold text-orange-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tiLeChenhLechTrongLuong" formatted={formatShiftSummaryPercent(row.tiLeChenhLechTrongLuong)} className="px-3 py-2 text-right font-mono font-bold text-sky-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tiLeLoiHongDinhMuc" formatted={formatShiftSummaryPercent(row.tiLeLoiHongDinhMuc)} className="px-3 py-2 text-right font-mono font-bold text-zinc-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="tiLeLoiHong" formatted={formatShiftSummaryPercent(row.tiLeLoiHong)} className="px-3 py-2 text-right font-mono font-bold text-rose-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="lechLoiHongVsDinhMuc" formatted={formatShiftSummaryPercent(row.lechLoiHongVsDinhMuc)} className="px-3 py-2 text-right font-mono font-bold text-amber-700" onOpen={openDetail} />
                    <SummaryValueCell row={row} metric="giaTriLoLaiNhua" formatted={formatShiftSummaryKg(row.giaTriLoLaiNhua, 3)} className="px-3 py-2 text-right font-mono font-bold text-amber-800" onOpen={openDetail} />
                    <td className="px-3 py-2 text-right font-mono font-bold text-zinc-800" title="Giá NVL nhựa từ phiếu xuất/nhập kho cùng ngày + ca">
                      {giaNhua > 0 ? `${formatMoney(giaNhua, 0)} đ` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                      {formatMoney(soTienLoLaiNhua, 0)} đ
                    </td>
                    <SummaryValueCell row={row} metric="giaTriLoLaiMang" formatted={formatShiftSummaryKg(row.giaTriLoLaiMang, 3)} className="px-3 py-2 text-right font-mono font-bold text-fuchsia-800" onOpen={openDetail} />
                    <td className="px-3 py-2 min-w-[180px]">
                      <textarea
                        value={phanTichDanhGiaMap[row.key] || ''}
                        onChange={event => updatePhanTichDanhGia(row.key, event.target.value)}
                        rows={2}
                        placeholder="Gõ tay phân tích đánh giá..."
                        className="w-full min-w-[160px] resize-y rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-zinc-800 outline-none focus:border-[#ef1b2d]"
                      />
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && filteredRows.length > 0 && (
              <tfoot className="border-t border-zinc-200 bg-zinc-50 text-xs font-black text-zinc-800">
                <tr>
                  <td colSpan={2} className="px-3 py-2.5 text-right uppercase tracking-wider">Tổng cộng</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{formatShiftSummaryKg(sanLuongTotals.tongTrongLuongNhapKho, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-orange-700">{formatShiftSummaryKg(sanLuongTotals.chenhLechTrongLuongNhapXuat, 3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-700">{formatShiftSummaryPercent(sanLuongTotals.tiLeChenhLechTrongLuong)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-zinc-700">{formatShiftSummaryPercent(sanLuongTotals.tiLeLoiHongDinhMuc)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-700">{formatShiftSummaryPercent(sanLuongTotals.tiLeLoiHong)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-700">{formatShiftSummaryPercent(sanLuongTotals.lechLoiHongVsDinhMuc)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-amber-800">{formatShiftSummaryKg(sanLuongTotals.giaTriLoLaiNhua, 3)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-800">{formatMoney(tongSoTienLoLaiNhua, 0)} đ</td>
                  <td className="px-3 py-2.5 text-right font-mono text-fuchsia-800">{formatShiftSummaryKg(sanLuongTotals.giaTriLoLaiMang, 3)}</td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            )}
          </table>
          ) : null}
        </div>
      </section>

      {detailModal}
      {printPayload
        ? createPortal(
            <ControlBoardShiftSummaryPrintBatch
              rows={printPayload.rows}
              filters={printPayload.filters}
              phanTichDanhGiaMap={printPayload.phanTichDanhGiaMap}
              warehouseMovements={detailSources.warehouseMovements}
              shiftSettings={detailSources.shiftSettings}
            />,
            document.body
          )
        : null}
    </>
  );
}
