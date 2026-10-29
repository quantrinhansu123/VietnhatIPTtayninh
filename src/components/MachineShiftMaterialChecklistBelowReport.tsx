import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer } from 'lucide-react';
import {
  AcceptanceReportPrintBatch,
  buildAcceptancePrintSlips
} from './AcceptanceReportPrintSheet';
import { MachineShiftMaterialChecklistPrintSheet } from './MachineShiftMaterialChecklistPrintSheet';
import {
  loadMachineShiftChecklistPrintData,
  type ProductionPlanRelatedReports
} from '../features/ke-hoach-san-xuat/relatedReportsPrint';
import {
  disableLandscapePrintPage,
  enableLandscapePrintPage,
  waitForPrintImagesReady
} from '../utils/printReady';

type Props = {
  dateFrom?: string;
  dateTo?: string;
  shift?: string;
  machineCode?: string;
  machineName?: string;
  /** Nút gọn cạnh «In báo cáo» — không hiện preview dưới trang. */
  variant?: 'button' | 'section';
};

function specificFilter(value?: string) {
  const text = String(value || '').trim();
  if (!text || text === 'all') return '';
  return text;
}

function resolveShiftLead(data: ProductionPlanRelatedReports | null) {
  if (!data) return '';
  const clean = (value: string) => {
    const text = String(value || '').trim();
    return !text || text === '-' ? '' : text;
  };
  for (const item of data.productionOrders || []) {
    const name = clean(item.order?.shiftLead || '');
    if (name) return name;
  }
  for (const plan of data.productionPlans || []) {
    for (const line of plan.lines || []) {
      const name = clean(line.shiftLead || '');
      if (name) return name;
    }
  }
  for (const slip of data.shiftHandovers || []) {
    const name = clean(slip.operators || '');
    if (name) return name;
  }
  return '';
}

export default function MachineShiftMaterialChecklistBelowReport({
  dateFrom,
  dateTo,
  shift,
  machineCode,
  machineName,
  variant = 'button'
}: Props) {
  const date = specificFilter(dateFrom);
  const sameDay = Boolean(date && (!dateTo || dateTo === dateFrom));
  const shiftCode = specificFilter(shift);
  const machine = specificFilter(machineCode);
  const machineLabel = String(machineName || '').trim() || machine;
  const canLoad = Boolean(sameDay && date && shiftCode && machine);

  const [data, setData] = useState<ProductionPlanRelatedReports | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);

  const loadData = async () => {
    if (!canLoad) {
      setError('Chọn đúng một ngày, một ca và một máy trên bộ lọc trước khi in.');
      return null;
    }
    setLoading(true);
    setError('');
    try {
      const next = await loadMachineShiftChecklistPrintData(date, [shiftCode], [], {
        code: machine,
        name: machineLabel
      });
      setData(next);
      return next;
    } catch (err) {
      setData(null);
      const message = err instanceof Error ? err.message : 'Không tải được bảng theo dõi vật tư.';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (variant !== 'section') return;
    if (!canLoad) {
      setData(null);
      setError('');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    void loadMachineShiftChecklistPrintData(date, [shiftCode], [], {
      code: machine,
      name: machineLabel
    })
      .then(next => {
        if (!cancelled) setData(next);
      })
      .catch(err => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Không tải được bảng theo dõi vật tư.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant, canLoad, date, shiftCode, machine, machineLabel]);

  const acceptanceSlips = useMemo(() => {
    if (!data) return [];
    const built = buildAcceptancePrintSlips(data.acceptance || []);
    if (built.length > 0) return built;
    if (!date || !shiftCode) return [];
    return [
      {
        id: `blank-san-luong-${date}-${shiftCode}-${machine || 'may'}`,
        ngay: date,
        ca: shiftCode,
        lan: '-',
        gio: '-',
        ma_may: machine,
        ten_may: machineLabel,
        machineLabel:
          machineLabel && machine && machineLabel !== machine
            ? `${machine} · ${machineLabel}`
            : machineLabel || machine || '-',
        thanhPhamLines: [],
        hangLoiHongLines: []
      }
    ];
  }, [data, date, shiftCode, machine, machineLabel]);

  const performedBy = useMemo(() => resolveShiftLead(data), [data]);

  useEffect(() => {
    if (!printing || !data) return;
    const previousTitle = document.title;
    const [year, month, day] = date.split('-');
    document.title = `Bang theo doi vat tu ${day}-${month}-${year}, ca ${shiftCode}, may ${machineLabel || machine}`;
    document.body.classList.add('machine-shift-nvl-checklist-print-active');
    enableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
    const timer = window.setTimeout(() => {
      void waitForPrintImagesReady().then(() => window.print());
    }, 350);
    const cleanup = () => {
      window.clearTimeout(timer);
      document.title = previousTitle;
      document.body.classList.remove('machine-shift-nvl-checklist-print-active');
      disableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
      setPrinting(false);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', cleanup);
      document.title = previousTitle;
      document.body.classList.remove('machine-shift-nvl-checklist-print-active');
      disableLandscapePrintPage('machine-shift-nvl-checklist-page-a4-landscape');
    };
  }, [printing, data, date, shiftCode, machine, machineLabel]);

  const handlePrintClick = async () => {
    if (printing || loading) return;
    const ready = data && canLoad ? data : await loadData();
    if (!ready) return;
    setPrinting(true);
  };

  const printPortal =
    printing && data
      ? createPortal(
          <>
            <MachineShiftMaterialChecklistPrintSheet
              data={data}
              date={date}
              shift={shiftCode}
              machineCode={machine}
              machineName={machineLabel}
            />
            <AcceptanceReportPrintBatch
              slips={acceptanceSlips}
              filmKgByProductCode={data.acceptanceFilmKgByProductCode}
              productNormByCode={data.acceptanceProductNormByCode}
              shiftSettings={data.shiftOptions}
              performedBy={performedBy}
              machineCode={machine}
              machineName={machineLabel}
              shift={shiftCode}
            />
          </>,
          document.body
        )
      : null;

  if (variant === 'button') {
    return (
      <>
        <button
          type="button"
          onClick={() => void handlePrintClick()}
          disabled={!canLoad || loading || printing}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            error ||
            (!canLoad
              ? 'Chọn đúng một ngày, một ca và một máy trên bộ lọc rồi in bảng theo dõi vật tư'
              : 'In bảng theo dõi vật tư theo máy (A4 ngang)')
          }
        >
          {printing || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          {printing ? 'Đang chuẩn bị...' : loading ? 'Đang tải...' : 'In bảng vật tư'}
        </button>
        {printPortal}
      </>
    );
  }

  const scopeLabel = [date, shiftCode ? `Ca ${shiftCode}` : '', machineLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Biểu mẫu</p>
          <h3 className="mt-0.5 text-base font-bold tracking-tight text-slate-900 sm:text-lg">
            Bảng theo dõi vật tư theo máy
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            {scopeLabel || 'Chọn một ngày, một ca và một máy trên bộ lọc báo cáo.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handlePrintClick()}
          disabled={!canLoad || !data || loading || printing}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#c8102e]/80 bg-[#c8102e] px-3.5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-[#a80e26] disabled:cursor-not-allowed disabled:opacity-50"
          title="In bảng trộn vật tư (A4 ngang). Trang sau là phiếu sản lượng cùng ngày · ca · máy."
        >
          {printing || loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          {printing ? 'Đang chuẩn bị...' : 'In'}
        </button>
      </div>

      {!canLoad ? (
        <p className="px-4 py-6 text-sm font-semibold text-zinc-500 sm:px-5">
          Chọn đúng một ngày, một ca và một máy ở bộ lọc phía trên để hiện bảng theo dõi vật tư.
        </p>
      ) : loading && !data ? (
        <p className="inline-flex items-center gap-2 px-4 py-6 text-sm font-semibold text-zinc-500 sm:px-5">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải biểu mẫu...
        </p>
      ) : error ? (
        <p className="px-4 py-6 text-sm font-bold text-rose-600 sm:px-5">{error}</p>
      ) : data ? (
        <div className="bb-nvl-checklist-screen">
          <MachineShiftMaterialChecklistPrintSheet
            preview
            data={data}
            date={date}
            shift={shiftCode}
            machineCode={machine}
            machineName={machineLabel}
          />
        </div>
      ) : null}

      {printPortal}
    </section>
  );
}
