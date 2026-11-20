import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Loader2, Printer, RefreshCw, Save } from 'lucide-react';
import type { ReportListsHubFilters } from '../report-lists/ReportListsSharedFilters';
import { waitForPrintImagesReady } from '../../utils/printReady';
import {
  BaoCaoLechPrintBatch,
  type BaoCaoLechPrintModel
} from './BaoCaoLechPrintSheet';
import {
  extractLechRowsFromSnapshotPayload,
  formatLechKg,
  machineMatchesFilter,
  type LechReportRow
} from './extractLechRows';

type Props = {
  filters: Pick<ReportListsHubFilters, 'search' | 'shift' | 'machineCode' | 'dateFrom' | 'dateTo'>;
};

type NoteMap = Record<string, string>;

type SnapshotItem = {
  khoa_on_dinh?: string;
  ngay_tu?: string;
  ngay_den?: string;
  ca?: string;
  may?: string;
  payload?: unknown;
};

function matchesHubFilters(row: LechReportRow, filters: Props['filters']): boolean {
  if (filters.dateFrom && row.ngay && row.ngay < filters.dateFrom) return false;
  if (filters.dateTo && row.ngay && row.ngay > filters.dateTo) return false;
  if (filters.shift && row.shift && row.shift !== filters.shift) return false;
  if (filters.machineCode && !machineMatchesFilter(filters.machineCode, row)) return false;
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.orderCode,
    row.machineCode,
    row.machine,
    row.materialCode,
    row.materialName,
    row.shiftLabel,
    row.ngay
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function nowPrintStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BaoCaoLechPanel({ filters }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<LechReportRow[]>([]);
  const [notes, setNotes] = useState<NoteMap>({});
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [onlyNonZero, setOnlyNonZero] = useState(true);
  const [printModel, setPrintModel] = useState<BaoCaoLechPrintModel | null>(null);
  const [pendingPrint, setPendingPrint] = useState(false);
  const draftNotesRef = useRef<NoteMap>({});
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Chỉ lọc ngày trên API; ca/máy lọc client vì dòng snapshot thường lưu tên máy («MÁY BAO BÌ 16»)
      // trong khi bộ lọc hub dùng mã («MBB_16»), và bản tính có thể lưu may=all.
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      params.set('limit', '100');

      const noteParams = new URLSearchParams();
      if (filters.dateFrom) noteParams.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) noteParams.set('dateTo', filters.dateTo);

      const [snapRes, noteRes] = await Promise.all([
        fetch(`/api/bb-bao-cao-tinh-toan?${params.toString()}`),
        fetch(`/api/bao-cao-lech-ghi-chu?${noteParams.toString()}`)
      ]);

      const snapJson = await snapRes.json().catch(() => ({}));
      if (!snapRes.ok) {
        throw new Error(
          (snapJson && typeof snapJson.error === 'string' && snapJson.error) ||
            'Không tải được bản tính toán BB.'
        );
      }

      const items: SnapshotItem[] = Array.isArray(snapJson.items)
        ? snapJson.items
        : snapJson.item
          ? [snapJson.item]
          : [];

      const extracted: LechReportRow[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        const key = String(item.khoa_on_dinh || '');
        const part = extractLechRowsFromSnapshotPayload(item.payload, {
          snapshotKey: key,
          may: String(item.may || ''),
          ca: String(item.ca || ''),
          ngayTu: String(item.ngay_tu || '')
        });
        for (const row of part) {
          if (seen.has(row.noteKey)) continue;
          seen.add(row.noteKey);
          extracted.push(row);
        }
      }
      extracted.sort((a, b) => {
        const byAbs = Math.abs(b.chenhLechKg) - Math.abs(a.chenhLechKg);
        if (byAbs !== 0) return byAbs;
        return a.ngay.localeCompare(b.ngay) || a.machine.localeCompare(b.machine, 'vi');
      });
      setRows(extracted);

      if (noteRes.ok) {
        const noteJson = await noteRes.json().catch(() => ({}));
        const map: NoteMap = {};
        const list = Array.isArray(noteJson.items) ? noteJson.items : [];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const k = String((item as { note_key?: unknown }).note_key || '').trim();
          const note = String((item as { ghi_chu?: unknown }).ghi_chu || '');
          if (k) map[k] = note;
        }
        setNotes(map);
        draftNotesRef.current = { ...map };
      } else {
        setNotes({});
        draftNotesRef.current = {};
      }
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Lỗi tải báo cáo lệch.');
    } finally {
      setLoading(false);
    }
  }, [filters.dateFrom, filters.dateTo, filters.shift, filters.machineCode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      saveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!pendingPrint || !printModel) return;
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
  }, [pendingPrint, printModel]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintModel(null);
      setPendingPrint(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const visibleRows = useMemo(() => {
    return rows.filter(row => {
      if (!matchesHubFilters(row, filters)) return false;
      if (onlyNonZero && Math.abs(row.chenhLechKg) < 0.0005) return false;
      return true;
    });
  }, [rows, filters, onlyNonZero]);

  const anomalyCount = useMemo(
    () => visibleRows.filter(r => Math.abs(r.chenhLechKg) >= 0.0005).length,
    [visibleRows]
  );

  const persistNote = useCallback(async (row: LechReportRow, ghiChu: string) => {
    setSavingKeys(prev => new Set([...prev, row.noteKey]));
    try {
      const res = await fetch('/api/bao-cao-lech-ghi-chu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_key: row.noteKey,
          ngay: row.ngay,
          ca: row.shift,
          may: row.machineCode || row.machine,
          ma_lenh: row.orderCode,
          ma_nvl: row.materialCode,
          ten_nvl: row.materialName,
          chenh_lech_kg: row.chenhLechKg,
          ghi_chu: ghiChu
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (json && typeof json.error === 'string' && json.error) || 'Không lưu được ghi chú.'
        );
      }
      setNotes(prev => ({ ...prev, [row.noteKey]: ghiChu }));
      draftNotesRef.current[row.noteKey] = ghiChu;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu ghi chú.');
      return false;
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(row.noteKey);
        return next;
      });
    }
  }, []);

  const onNoteChange = (row: LechReportRow, value: string) => {
    draftNotesRef.current[row.noteKey] = value;
    setNotes(prev => ({ ...prev, [row.noteKey]: value }));
    setMessage('');
    const existing = saveTimersRef.current.get(row.noteKey);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      saveTimersRef.current.delete(row.noteKey);
      void persistNote(row, value);
    }, 600);
    saveTimersRef.current.set(row.noteKey, timer);
  };

  const handleSaveAll = async () => {
    setError('');
    setMessage('');
    for (const timer of saveTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    saveTimersRef.current.clear();

    const targets = visibleRows.length > 0 ? visibleRows : rows;
    if (targets.length === 0) {
      setError('Không có dòng để lưu.');
      return;
    }

    setSavingAll(true);
    try {
      const results = await Promise.all(
        targets.map(row => {
          const ghiChu = draftNotesRef.current[row.noteKey] ?? notes[row.noteKey] ?? '';
          return persistNote(row, ghiChu);
        })
      );
      const ok = results.filter(Boolean).length;
      const fail = results.length - ok;
      if (fail > 0) {
        setError(`Lưu xong ${ok}/${results.length} dòng · ${fail} dòng lỗi.`);
      } else {
        setMessage(`Đã lưu chắc chắn ${ok} dòng (lệch + ghi chú) lên hệ thống.`);
      }
    } finally {
      setSavingAll(false);
    }
  };

  const handlePrint = () => {
    setError('');
    setMessage('');
    const targets = visibleRows;
    if (targets.length === 0) {
      setError('Không có dòng lệch để in. Bỏ tick «Chỉ lệch ≠ 0» hoặc đổi bộ lọc.');
      return;
    }
    setPrintModel({
      dateFrom: filters.dateFrom || '',
      dateTo: filters.dateTo || '',
      shift: filters.shift || '',
      machineCode: filters.machineCode || '',
      printedAt: nowPrintStamp(),
      rows: targets.map(row => ({
        ...row,
        ghiChu: draftNotesRef.current[row.noteKey] ?? notes[row.noteKey] ?? ''
      }))
    });
    setPendingPrint(true);
  };

  return (
    <div className="space-y-2 px-0.5 py-1">
      {printModel && typeof document !== 'undefined'
        ? createPortal(<BaoCaoLechPrintBatch model={printModel} />, document.body)
        : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800">
            Kết quả cột lệch (3.1) · {visibleRows.length} dòng
            {anomalyCount > 0 ? (
              <span className="ml-1 font-bold text-amber-700">· {anomalyCount} lệch ≠ 0</span>
            ) : null}
          </p>
          <p className="text-[10px] text-slate-500">
            Bấm <strong>Lưu</strong> để ghi chắc ghi chú · <strong>In</strong> để in mẫu báo cáo lệch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={onlyNonZero}
              onChange={e => setOnlyNonZero(e.target.checked)}
              className="rounded border-slate-300"
            />
            Chỉ lệch ≠ 0
          </label>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={savingAll || loading || visibleRows.length === 0}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#ef1b2d] px-3 text-[11px] font-bold text-white hover:bg-[#d41526] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lưu
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || visibleRows.length === 0}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            In
          </button>
        </div>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[28vh] items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải kết quả lệch...
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Không có dòng lệch trong khoảng lọc.
          <div className="mt-1 text-[11px] text-slate-400">
            Cần bấm <strong>Tính toán</strong> trên Báo cáo theo LSX trước khi xem tab này.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[960px] w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-black text-left text-white">
                <th className="px-2 py-2 font-bold">Ngày</th>
                <th className="px-2 py-2 font-bold">Ca</th>
                <th className="px-2 py-2 font-bold">Máy</th>
                <th className="px-2 py-2 font-bold">LSX</th>
                <th className="px-2 py-2 font-bold">Mã NVL</th>
                <th className="px-2 py-2 font-bold">Tên NVL</th>
                <th className="px-2 py-2 text-right font-bold">TT sử dụng</th>
                <th className="px-2 py-2 text-right font-bold">Nhập TP</th>
                <th className="px-2 py-2 text-right font-bold">Lỗi</th>
                <th className="px-2 py-2 text-right font-bold">Lệch</th>
                <th className="min-w-[220px] px-2 py-2 font-bold">Ghi chú bất thường</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const lech = row.chenhLechKg;
                const hasLech = Math.abs(lech) >= 0.0005;
                const note = notes[row.noteKey] ?? '';
                const saving = savingKeys.has(row.noteKey);
                return (
                  <tr
                    key={row.noteKey}
                    className={`border-t border-slate-100 ${
                      hasLech ? 'bg-amber-50/70' : 'bg-white'
                    } hover:bg-slate-50`}
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-slate-700">
                      {row.ngay || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                      {row.shiftLabel || row.shift || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-slate-800">
                      {row.machineCode && row.machine && row.machineCode !== row.machine
                        ? `${row.machineCode}`
                        : row.machineCode || row.machine || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">
                      {row.orderCode || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[10px] font-bold text-slate-800">
                      {row.materialCode}
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-1.5 text-slate-600" title={row.materialName}>
                      {row.materialName || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {formatLechKg(row.thucTeSuDungKg)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {formatLechKg(row.nhapTpKg)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-700">
                      {formatLechKg(row.loiHongKg)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right font-bold tabular-nums ${
                        hasLech
                          ? lech > 0
                            ? 'text-emerald-700'
                            : 'text-red-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {lech > 0 ? '+' : ''}
                      {formatLechKg(lech)}
                    </td>
                    <td className="px-2 py-1">
                      <div className="relative">
                        <textarea
                          value={note}
                          rows={2}
                          placeholder={hasLech ? 'Ghi điểm bất thường…' : 'Ghi chú (tuỳ chọn)'}
                          onChange={e => onNoteChange(row, e.target.value)}
                          className={`w-full resize-y rounded border px-2 py-1 text-[11px] leading-snug text-slate-800 outline-none focus:border-[#ef1b2d] focus:ring-1 focus:ring-[#ef1b2d]/40 ${
                            hasLech && !note.trim()
                              ? 'border-amber-300 bg-amber-50/80'
                              : 'border-slate-200 bg-white'
                          }`}
                        />
                        {saving ? (
                          <span className="pointer-events-none absolute bottom-1 right-1 text-[9px] font-semibold text-slate-400">
                            Đang lưu…
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BaoCaoLechPanel;
