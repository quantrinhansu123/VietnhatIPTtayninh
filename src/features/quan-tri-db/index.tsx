import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Database,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Trash2,
  Table2,
  TerminalSquare
} from 'lucide-react';
import { useAccessControl } from '../../app/accessControl';

type DbTarget = {
  id: string;
  label: string;
  host: string;
  hasRest: boolean;
  hasSql: boolean;
};

type RowsResponse = {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  primaryKeys: string[];
};

type SqlResponse = {
  success: boolean;
  command?: string;
  rowCount?: number;
  fields?: string[];
  rows?: Record<string, unknown>[];
  truncated?: boolean;
  error?: string;
};

type PanelMode = 'tables' | 'sql';

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function cellPreview(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function QuanTriDbPanel({ onBack }: { onBack: () => void }) {
  const { isAdmin } = useAccessControl();
  const [targets, setTargets] = useState<DbTarget[]>([]);
  const [dbId, setDbId] = useState('');
  const [mode, setMode] = useState<PanelMode>('tables');
  const [tables, setTables] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [rowsData, setRowsData] = useState<RowsResponse | null>(null);
  const [page, setPage] = useState(0);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [sqlText, setSqlText] = useState('select now();');
  const [sqlResult, setSqlResult] = useState<SqlResponse | null>(null);
  const [runningSql, setRunningSql] = useState(false);

  const selectedTarget = useMemo(
    () => targets.find(t => t.id === dbId) || null,
    [targets, dbId]
  );

  const filteredTables = useMemo(() => {
    const q = tableFilter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter(name => name.toLowerCase().includes(q));
  }, [tables, tableFilter]);

  useEffect(() => {
    if (!isAdmin) {
      onBack();
    }
  }, [isAdmin, onBack]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTargets(true);
      setError('');
      try {
        const data = await readJson<{ targets: DbTarget[] }>(await fetch('/api/db-admin/targets'));
        if (cancelled) return;
        const list = data.targets || [];
        setTargets(list);
        setDbId(current => current || list[0]?.id || '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được danh sách DB.');
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dbId || !selectedTarget?.hasRest) {
      setTables([]);
      setSelectedTable('');
      setRowsData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingTables(true);
      setError('');
      setSelectedTable('');
      setRowsData(null);
      setPage(0);
      try {
        const data = await readJson<{ tables: string[] }>(
          await fetch(`/api/db-admin/tables?db=${encodeURIComponent(dbId)}`)
        );
        if (cancelled) return;
        setTables(data.tables || []);
      } catch (err) {
        if (!cancelled) {
          setTables([]);
          setError(err instanceof Error ? err.message : 'Không tải được bảng.');
        }
      } finally {
        if (!cancelled) setLoadingTables(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbId, selectedTarget?.hasRest]);

  const loadRows = async (table: string, nextPage: number) => {
    if (!dbId || !table) return;
    setLoadingRows(true);
    setError('');
    try {
      const limit = 100;
      const offset = nextPage * limit;
      const data = await readJson<RowsResponse>(
        await fetch(
          `/api/db-admin/rows?db=${encodeURIComponent(dbId)}&table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}`
        )
      );
      setRowsData(data);
      setPage(nextPage);
      setEditDraft({});
    } catch (err) {
      setRowsData(null);
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu bảng.');
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (selectedTable) void loadRows(selectedTable, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đổi khi chọn bảng
  }, [selectedTable]);

  const columns = useMemo(() => {
    const sample = rowsData?.rows?.[0];
    return sample ? Object.keys(sample) : [];
  }, [rowsData]);

  const primaryKeys = rowsData?.primaryKeys || ['id'];

  const rowKeyOf = (row: Record<string, unknown>, index: number) => {
    const parts = primaryKeys.map(k => `${k}=${JSON.stringify(row[k])}`);
    return parts.length ? parts.join('|') : `row-${index}`;
  };

  const matchOf = (row: Record<string, unknown>) => {
    const match: Record<string, unknown> = {};
    for (const key of primaryKeys) {
      if (key in row) match[key] = row[key];
    }
    return match;
  };

  const startEdit = (row: Record<string, unknown>, index: number) => {
    const key = rowKeyOf(row, index);
    const draft: Record<string, string> = {};
    for (const col of columns) {
      if (primaryKeys.includes(col)) continue;
      if (row[col] != null && typeof row[col] === 'object') {
        draft[col] = JSON.stringify(row[col]);
      } else if (row[col] == null) {
        draft[col] = '';
      } else {
        draft[col] = String(row[col]);
      }
    }
    setEditDraft({ __key: key, ...draft });
  };

  const parseEditedValue = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return raw;
      }
    }
    return raw;
  };

  const saveEdit = async (row: Record<string, unknown>, index: number) => {
    if (!dbId || !selectedTable) return;
    const key = rowKeyOf(row, index);
    if (editDraft.__key !== key) return;
    const values: Record<string, unknown> = {};
    for (const col of columns) {
      if (primaryKeys.includes(col)) continue;
      if (!(col in editDraft)) continue;
      values[col] = parseEditedValue(editDraft[col] ?? '');
    }
    setBusyRowKey(key);
    setError('');
    try {
      await readJson(
        await fetch('/api/db-admin/rows', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            db: dbId,
            table: selectedTable,
            match: matchOf(row),
            values
          })
        })
      );
      setEditDraft({});
      await loadRows(selectedTable, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setBusyRowKey(null);
    }
  };

  const deleteRow = async (row: Record<string, unknown>, index: number) => {
    if (!dbId || !selectedTable) return;
    if (!window.confirm('Xóa dòng này?')) return;
    const key = rowKeyOf(row, index);
    setBusyRowKey(key);
    setError('');
    try {
      await readJson(
        await fetch('/api/db-admin/rows', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            db: dbId,
            table: selectedTable,
            match: matchOf(row)
          })
        })
      );
      await loadRows(selectedTable, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xóa thất bại.');
    } finally {
      setBusyRowKey(null);
    }
  };

  const runSql = async () => {
    if (!dbId || !selectedTarget?.hasSql) return;
    setRunningSql(true);
    setError('');
    setSqlResult(null);
    try {
      const data = await readJson<SqlResponse>(
        await fetch('/api/db-admin/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db: dbId, sql: sqlText })
        })
      );
      setSqlResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chạy SQL thất bại.');
    } finally {
      setRunningSql(false);
    }
  };

  if (!isAdmin) return null;

  const totalPages = rowsData ? Math.max(1, Math.ceil((rowsData.total || 0) / (rowsData.limit || 100))) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Quản trị
        </button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-black text-zinc-950">
            <Database className="h-5 w-5 text-slate-600" />
            Quản trị DB
          </h2>
          <p className="text-xs font-semibold text-zinc-500">
            Duyệt bảng / chạy SQL trên các project Supabase đã cấu hình (chỉ admin).
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {loadingTargets ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải DB…
          </span>
        ) : (
          targets.map(target => (
            <button
              key={target.id}
              type="button"
              onClick={() => setDbId(target.id)}
              className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                dbId === target.id
                  ? 'border-[#ef1b2d] bg-red-50 text-[#ef1b2d]'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <div>{target.label}</div>
              <div className="font-mono text-[10px] font-semibold text-zinc-400">{target.host}</div>
              <div className="mt-0.5 flex gap-1 text-[10px] font-semibold">
                {target.hasRest ? (
                  <span className="rounded bg-emerald-50 px-1 text-emerald-700">REST</span>
                ) : null}
                {target.hasSql ? (
                  <span className="rounded bg-sky-50 px-1 text-sky-700">SQL</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('tables')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${
            mode === 'tables' ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700'
          }`}
        >
          <Table2 className="h-4 w-4" />
          Bảng
        </button>
        <button
          type="button"
          onClick={() => setMode('sql')}
          disabled={!selectedTarget?.hasSql}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === 'sql' ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-700'
          }`}
          title={selectedTarget?.hasSql ? 'Chạy SQL' : 'DB này chưa có SUPABASE_*_DB_URL / password'}
        >
          <TerminalSquare className="h-4 w-4" />
          SQL
        </button>
      </div>

      {mode === 'tables' ? (
        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Bảng public</p>
              {loadingTables ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" /> : null}
            </div>
            <input
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              placeholder="Lọc tên bảng…"
              className="mb-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs font-semibold"
            />
            <div className="max-h-[60vh] space-y-0.5 overflow-auto">
              {filteredTables.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedTable(name)}
                  className={`block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-[11px] font-bold ${
                    selectedTable === name
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {name}
                </button>
              ))}
              {!loadingTables && filteredTables.length === 0 ? (
                <p className="px-1 py-2 text-xs font-semibold text-zinc-400">Không có bảng.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-zinc-900">
                {selectedTable || 'Chọn một bảng'}
                {rowsData ? (
                  <span className="ml-2 text-xs font-semibold text-zinc-500">
                    {rowsData.total} dòng · PK: {primaryKeys.join(', ')}
                  </span>
                ) : null}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!selectedTable || loadingRows}
                  onClick={() => void loadRows(selectedTable, page)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-bold text-zinc-700 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingRows ? 'animate-spin' : ''}`} />
                  Tải lại
                </button>
                <button
                  type="button"
                  disabled={!selectedTable || page <= 0 || loadingRows}
                  onClick={() => void loadRows(selectedTable, page - 1)}
                  className="h-8 rounded-lg border border-zinc-200 px-2 text-xs font-bold disabled:opacity-40"
                >
                  Trước
                </button>
                <span className="text-xs font-semibold text-zinc-500">
                  {page + 1}/{totalPages}
                </span>
                <button
                  type="button"
                  disabled={!selectedTable || page + 1 >= totalPages || loadingRows}
                  onClick={() => void loadRows(selectedTable, page + 1)}
                  className="h-8 rounded-lg border border-zinc-200 px-2 text-xs font-bold disabled:opacity-40"
                >
                  Sau
                </button>
              </div>
            </div>

            {!selectedTable ? (
              <p className="py-10 text-center text-sm font-semibold text-zinc-400">
                Chọn bảng bên trái để xem dữ liệu.
              </p>
            ) : loadingRows && !rowsData ? (
              <p className="inline-flex items-center gap-2 py-10 text-sm font-semibold text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
              </p>
            ) : (
              <div className="max-h-[62vh] overflow-auto rounded-xl border border-zinc-100">
                <table className="min-w-full border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 bg-[#e8f0ed]">
                    <tr>
                      <th className="border-b border-zinc-200 px-2 py-2 font-semibold text-zinc-700">Thao tác</th>
                      {columns.map(col => (
                        <th
                          key={col}
                          className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 font-semibold text-zinc-700"
                        >
                          {col}
                          {primaryKeys.includes(col) ? ' *' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rowsData?.rows || []).map((row, index) => {
                      const key = rowKeyOf(row, index);
                      const editing = editDraft.__key === key;
                      const busy = busyRowKey === key;
                      return (
                        <tr key={key} className="odd:bg-white even:bg-zinc-50/80">
                          <td className="whitespace-nowrap border-b border-zinc-100 px-2 py-1.5">
                            {editing ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveEdit(row, index)}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 font-bold text-emerald-700"
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Lưu
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => startEdit(row, index)}
                                className="mr-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-1 font-bold text-amber-700"
                              >
                                Sửa
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deleteRow(row, index)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-1 font-bold text-rose-700"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Xóa
                            </button>
                          </td>
                          {columns.map(col => (
                            <td
                              key={col}
                              className="max-w-[240px] truncate border-b border-zinc-100 px-2 py-1.5 font-mono text-zinc-800"
                              title={cellPreview(row[col])}
                            >
                              {editing && !primaryKeys.includes(col) ? (
                                <input
                                  value={editDraft[col] ?? ''}
                                  onChange={e =>
                                    setEditDraft(prev => ({ ...prev, [col]: e.target.value }))
                                  }
                                  className="w-full min-w-[120px] rounded border border-zinc-200 px-1 py-0.5 text-[11px]"
                                />
                              ) : (
                                cellPreview(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {(rowsData?.rows || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={Math.max(1, columns.length + 1)}
                          className="px-3 py-8 text-center text-sm font-semibold text-zinc-400"
                        >
                          Bảng trống.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3">
          <textarea
            value={sqlText}
            onChange={e => setSqlText(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 outline-none focus:border-zinc-400"
            placeholder="select * from don_hang limit 20;"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={runningSql || !sqlText.trim()}
              onClick={() => void runSql()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {runningSql ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Chạy SQL
            </button>
            {sqlResult ? (
              <span className="text-xs font-semibold text-zinc-500">
                {sqlResult.command || 'OK'} · {sqlResult.rowCount ?? 0} dòng
                {sqlResult.truncated ? ' (đã cắt 500)' : ''}
              </span>
            ) : null}
          </div>
          {sqlResult?.rows && sqlResult.rows.length > 0 ? (
            <div className="max-h-[50vh] overflow-auto rounded-xl border border-zinc-100">
              <table className="min-w-full border-collapse text-left text-[11px]">
                <thead className="sticky top-0 bg-[#e8f0ed]">
                  <tr>
                    {(sqlResult.fields || Object.keys(sqlResult.rows[0] || {})).map(field => (
                      <th
                        key={field}
                        className="whitespace-nowrap border-b border-zinc-200 px-2 py-2 font-semibold text-zinc-700"
                      >
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sqlResult.rows.map((row, idx) => (
                    <tr key={idx} className="odd:bg-white even:bg-zinc-50/80">
                      {(sqlResult.fields || Object.keys(row)).map(field => (
                        <td
                          key={field}
                          className="max-w-[280px] truncate border-b border-zinc-100 px-2 py-1.5 font-mono text-zinc-800"
                          title={cellPreview(row[field])}
                        >
                          {cellPreview(row[field])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default QuanTriDbPanel;
