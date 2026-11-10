import React, { useState } from 'react';
import { Loader2, Printer, ExternalLink, ChevronDown } from 'lucide-react';
import MachineShiftMaterialChecklistBelowReport from '../../components/MachineShiftMaterialChecklistBelowReport';
import type { ReportListsHubFilters } from './ReportListsSharedFilters';
import type { AppTab } from '../../routes';

type Props = {
  filters: ReportListsHubFilters;
  onNavigate: (tab: AppTab) => void;
  onOpenAutoReportTab: () => void;
};

export default function ReportListsPrintActions({ filters, onNavigate, onOpenAutoReportTab }: Props) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      {/* Nút 1: In bảng vật tư (A4 ngang - Mẫu QT 11-BM04 kèm phiếu nghiệm thu sản lượng) */}
      <MachineShiftMaterialChecklistBelowReport
        variant="button"
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        shift={filters.shift}
        machineCode={filters.machineCode}
        machineName={filters.machineCode}
      />

      {/* Nút 2: Mở trực tiếp tab Báo cáo kết quả theo LSX tại đây (có sẵn nút Tính toán & nút In báo cáo) */}
      <button
        type="button"
        onClick={onOpenAutoReportTab}
        title="Xem Báo cáo kết quả theo từng LSX, tính toán và in báo cáo trực tiếp tại đây"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
      >
        <Printer className="h-4 w-4" />
        <span>Báo cáo theo LSX (Tính toán & In)</span>
      </button>
    </div>
  );
}
