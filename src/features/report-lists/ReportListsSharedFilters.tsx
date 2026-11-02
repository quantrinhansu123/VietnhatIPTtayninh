import React, { useEffect, useMemo, useState } from 'react';
import {
  FilterCombobox,
  TableDateFilter,
  TableSearchInput,
  TableToolbar
} from '../../components/shared/table';
import { getProductionShiftOptions, normalizeShiftSettings, type ShiftSetting } from '../../utils/shiftSettings';

export type ReportListsHubFilters = {
  search: string;
  shift: string;
  machineCode: string;
  dateFrom: string;
  dateTo: string;
};

export function localIsoDateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/** Mặc định ngày hôm qua (cả Từ ngày và Đến ngày). */
export function defaultHubYesterdayIso() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
}

export function createDefaultReportListsHubFilters(): ReportListsHubFilters {
  const yesterday = defaultHubYesterdayIso();
  return {
    search: '',
    shift: '',
    machineCode: '',
    dateFrom: yesterday,
    dateTo: yesterday
  };
}

type MachineOption = { code: string; name: string };

function pickMachineField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && text !== '-') return text;
  }
  return '';
}

function normalizeMachines(data: unknown): MachineOption[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { machines?: unknown }).machines)
      ? (data as { machines: unknown[] }).machines
      : data && typeof data === 'object' && Array.isArray((data as { records?: unknown }).records)
        ? (data as { records: unknown[] }).records
        : [];
  const seen = new Set<string>();
  const out: MachineOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const code = pickMachineField(rec, ['ma_may', 'ma_so_may', 'machine_code', 'code', 'ma', 'id']);
    const name = pickMachineField(rec, ['ten_may', 'may', 'machine_name', 'name', 'ten']);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: name || code });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code, 'vi'));
}

type Props = {
  value: ReportListsHubFilters;
  onChange: (next: ReportListsHubFilters) => void;
};

export function ReportListsSharedFiltersBar({ value, onChange }: Props) {
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoadingOptions(true);
      try {
        const [settingsRes, machinesRes] = await Promise.all([
          fetch('/api/cai-dat'),
          fetch('/api/danh-sach-may')
        ]);
        const [settingsData, machinesData] = await Promise.all([
          settingsRes.json().catch(() => ({})),
          machinesRes.json().catch(() => ({}))
        ]);
        if (cancelled) return;
        if (settingsRes.ok) setShiftSettings(normalizeShiftSettings(settingsData));
        if (machinesRes.ok) setMachines(normalizeMachines(machinesData));
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shiftOptions = useMemo(() => getProductionShiftOptions(shiftSettings), [shiftSettings]);
  const hasActiveFilters = Boolean(
    value.search.trim() || value.shift || value.machineCode || value.dateFrom || value.dateTo
  );

  const patch = (partial: Partial<ReportListsHubFilters>) => onChange({ ...value, ...partial });

  return (
    <TableToolbar
      isLoading={isLoadingOptions}
      hasActiveFilters={hasActiveFilters}
      onResetFilters={() => onChange(createDefaultReportListsHubFilters())}
    >
      <TableSearchInput
        value={value.search}
        onChange={search => patch({ search })}
        placeholder="Tìm mã NVL, tên NVL, máy, nhân sự..."
        disabled={isLoadingOptions}
      />
      <FilterCombobox
        label="Ca"
        options={shiftOptions.map(option => option.value)}
        value={value.shift || 'all'}
        onChange={next => patch({ shift: next === 'all' ? '' : next })}
        formatOption={code => shiftOptions.find(option => option.value === code)?.label || code}
        compact
      />
      <FilterCombobox
        label="Máy"
        options={machines.map(machine => machine.code)}
        value={value.machineCode || 'all'}
        onChange={next => patch({ machineCode: next === 'all' ? '' : next })}
        formatOption={code => {
          const found = machines.find(machine => machine.code === code);
          if (!found) return code;
          return found.name && found.name !== found.code ? `${found.code} · ${found.name}` : found.code;
        }}
        compact
      />
      <TableDateFilter
        label="Từ ngày"
        value={value.dateFrom}
        onChange={dateFrom => {
          const next = { dateFrom };
          if (dateFrom && value.dateTo && dateFrom > value.dateTo) {
            Object.assign(next, { dateTo: dateFrom });
          }
          patch(next);
        }}
      />
      <TableDateFilter
        label="Đến ngày"
        value={value.dateTo}
        onChange={dateTo => {
          const next = { dateTo };
          if (dateTo && value.dateFrom && dateTo < value.dateFrom) {
            Object.assign(next, { dateFrom: dateTo });
          }
          patch(next);
        }}
      />
    </TableToolbar>
  );
}
