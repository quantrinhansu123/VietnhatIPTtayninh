import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Printer, Save, XCircle } from 'lucide-react';
import { MixingNormRatioPrintBatch, type MixingNormRatioPrintDoc } from './MixingNormRatioPrintSheet';
import { waitForPrintImagesReady } from '../utils/printReady';

type ActualLine = {
  ma_nvl: string;
  ten_nvl: string;
  gia_tri: number | null;
  khoi_luong: number | null;
  phan_tram_thuc_te: number | null;
  trong_luong_thuc_te: number | null;
};
type ActualProduct = {
  ma_sp: string;
  ten_sp: string;
  tong_trong_luong: number | null;
  nvl: ActualLine[];
};
type NormRecord = { id: string; ngay: string; ca: string; ma_lenh_sx: string; chi_tiet: unknown };
type ActualRecord = {
  id: string;
  dinh_muc_id: string;
  ngay?: string;
  ca?: string;
  chi_tiet: unknown;
  ghi_chu?: string | null;
};

const STORAGE_KEY = 'actual-mixing-sheet-v1';

const fieldClass =
  'h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';

const numberValue = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatNumber = (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);

function lineKey(maNvl: string, tenNvl: string) {
  return `${maNvl.trim().toLowerCase()}|${tenNvl.trim().toLowerCase()}`;
}

function normalizeProducts(raw: unknown): ActualProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): ActualProduct | null => {
      if (!item || typeof item !== 'object') return null;
      const product = item as Record<string, unknown>;
      const total = numberValue(product.tong_trong_luong);
      const rawLines = Array.isArray(product.nvl)
        ? product.nvl
        : Array.isArray(product.chi_tiet)
          ? product.chi_tiet
          : [];
      const nvl = rawLines
        .map((entry): ActualLine | null => {
          if (!entry || typeof entry !== 'object') return null;
          const line = entry as Record<string, unknown>;
          const ma_nvl = String(line.ma_nvl ?? '').trim();
          const ten_nvl = String(line.ten_nvl ?? '').trim();
          if (!ma_nvl && !ten_nvl) return null;
          const actualPercent = numberValue(line.phan_tram_thuc_te);
          const actualWeight = numberValue(line.trong_luong_thuc_te);
          return {
            ma_nvl,
            ten_nvl,
            gia_tri: numberValue(line.gia_tri ?? line.dinh_muc),
            khoi_luong: numberValue(line.khoi_luong),
            phan_tram_thuc_te: actualPercent,
            trong_luong_thuc_te:
              actualWeight ??
              (total !== null && actualPercent !== null ? (total * actualPercent) / 100 : null)
          };
        })
        .filter((line): line is ActualLine => Boolean(line));

      const ma_sp = String(product.ma_sp ?? '').trim();
      const ten_sp = String(product.ten_sp ?? '').trim();
      if (!ma_sp && !ten_sp && nvl.length === 0) return null;
      return { ma_sp, ten_sp, tong_trong_luong: total, nvl };
    })
    .filter((product): product is ActualProduct => Boolean(product));
}

/** Luôn lấy khung SP/NVL từ định mức; gắn % / KL thực tế từ phiếu đã lưu (khớp mã). */
function mergeActualOntoNorm(normChiTiet: unknown, savedChiTiet: unknown): ActualProduct[] {
  const base = normalizeProducts(normChiTiet);
  const saved = normalizeProducts(savedChiTiet);
  if (base.length === 0) return saved;
  if (saved.length === 0) return base;

  const savedByProduct = new Map<string, ActualProduct>();
  for (const product of saved) {
    savedByProduct.set(`${product.ma_sp}|${product.ten_sp}`.toLowerCase(), product);
  }

  return base.map(product => {
    const matched =
      savedByProduct.get(`${product.ma_sp}|${product.ten_sp}`.toLowerCase()) ||
      saved.find(item => item.ma_sp && item.ma_sp === product.ma_sp) ||
      null;
    if (!matched) return product;

    const savedLines = new Map(
      matched.nvl.map(line => [lineKey(line.ma_nvl, line.ten_nvl), line] as const)
    );

    return {
      ...product,
      nvl: product.nvl.map(line => {
        const savedLine =
          savedLines.get(lineKey(line.ma_nvl, line.ten_nvl)) ||
          matched.nvl.find(item => item.ma_nvl && item.ma_nvl === line.ma_nvl) ||
          null;
        if (!savedLine) return line;
        const percent = savedLine.phan_tram_thuc_te;
        return {
          ...line,
          phan_tram_thuc_te: percent,
          trong_luong_thuc_te:
            savedLine.trong_luong_thuc_te ??
            (product.tong_trong_luong !== null && percent !== null
              ? (product.tong_trong_luong * percent) / 100
              : null)
        };
      })
    };
  });
}

function normalizeActualRecords(raw: unknown): ActualRecord[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { records?: unknown }).records)
      ? ((raw as { records: unknown[] }).records)
      : [];
  return rows
    .map((item): ActualRecord | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? '').trim();
      const dinh_muc_id = String(row.dinh_muc_id ?? '').trim();
      if (!id || !dinh_muc_id) return null;
      return {
        id,
        dinh_muc_id,
        ngay: String(row.ngay ?? '').slice(0, 10),
        ca: String(row.ca ?? '').trim(),
        chi_tiet: row.chi_tiet,
        ghi_chu: row.ghi_chu == null ? '' : String(row.ghi_chu)
      };
    })
    .filter((row): row is ActualRecord => Boolean(row));
}

function readStoredSelection() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: string; shift?: string; normId?: string };
    return {
      date: String(parsed.date ?? '').slice(0, 10),
      shift: String(parsed.shift ?? '').trim(),
      normId: String(parsed.normId ?? '').trim()
    };
  } catch {
    return null;
  }
}

function writeStoredSelection(date: string, shift: string, normId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ date, shift, normId }));
  } catch {
    /* ignore */
  }
}

export default function ActualMixingSheetTab() {
  const stored = readStoredSelection();
  const [date, setDate] = useState(stored?.date || new Date().toISOString().slice(0, 10));
  const [norms, setNorms] = useState<NormRecord[]>([]);
  const [actuals, setActuals] = useState<ActualRecord[]>([]);
  const [selectedNormId, setSelectedNormId] = useState(stored?.normId || '');
  const [products, setProducts] = useState<ActualProduct[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [printDoc, setPrintDoc] = useState<MixingNormRatioPrintDoc | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/bang-tron-vat-tu-dinh-muc').then(res => res.json()),
      fetch('/api/phieu-tron-thuc-te').then(res => res.json())
    ])
      .then(([normData, actualData]) => {
        const rows = Array.isArray(normData.records) ? normData.records : [];
        setNorms(
          rows.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ''),
            ngay: String(row.ngay ?? '').slice(0, 10),
            ca: String(row.ca ?? '').trim(),
            ma_lenh_sx: String(row.ma_lenh_sx ?? ''),
            chi_tiet: row.chi_tiet
          }))
        );
        setActuals(normalizeActualRecords(actualData));
      })
      .catch(() => setError('Không thể tải dữ liệu phiếu trộn.'))
      .finally(() => setLoading(false));
  }, []);

  // Chỉ lọc theo ngày — ca lấy từ đúng phiếu định mức đang chọn.
  const matchingNorms = useMemo(() => {
    const dayNorms = norms.filter(row => !date || row.ngay === date);
    return [...dayNorms].sort((left, right) => {
      const byCa = left.ca.localeCompare(right.ca, 'vi');
      if (byCa !== 0) return byCa;
      return left.ma_lenh_sx.localeCompare(right.ma_lenh_sx, 'vi');
    });
  }, [norms, date]);

  const matchingNormIds = matchingNorms.map(row => row.id).join('|');
  const selectedNorm = useMemo(
    () => norms.find(row => row.id === selectedNormId) || null,
    [norms, selectedNormId]
  );

  useEffect(() => {
    setError('');
    setMessage('');
    if (matchingNorms.length === 0) {
      setSelectedNormId('');
      setProducts([]);
      setNote('');
      return;
    }
    setSelectedNormId(prev => {
      if (prev && matchingNorms.some(row => row.id === prev)) return prev;
      return matchingNorms.length === 1 ? matchingNorms[0].id : '';
    });
  }, [date, matchingNormIds]);

  useEffect(() => {
    if (!selectedNorm) {
      if (!selectedNormId) {
        setProducts([]);
        setNote('');
      }
      return;
    }
    const saved = actuals.find(row => String(row.dinh_muc_id) === String(selectedNorm.id));
    setProducts(mergeActualOntoNorm(selectedNorm.chi_tiet, saved?.chi_tiet));
    setNote(saved?.ghi_chu ?? '');
  }, [selectedNorm, selectedNormId, actuals]);

  useEffect(() => {
    writeStoredSelection(date, selectedNorm?.ca || '', selectedNormId);
  }, [date, selectedNorm?.ca, selectedNormId]);

  const changePercent = (productIndex: number, lineIndex: number, text: string) => {
    const percent = numberValue(text);
    setProducts(current =>
      current.map((product, pi) =>
        pi !== productIndex
          ? product
          : {
              ...product,
              nvl: product.nvl.map((line, li) =>
                li !== lineIndex
                  ? line
                  : {
                      ...line,
                      phan_tram_thuc_te: percent,
                      trong_luong_thuc_te:
                        product.tong_trong_luong !== null && percent !== null
                          ? (product.tong_trong_luong * percent) / 100
                          : null
                    }
              )
            }
      )
    );
  };

  const save = async () => {
    const norm = selectedNorm || norms.find(row => row.id === selectedNormId);
    if (!norm) return setError('Vui lòng chọn đúng dòng phiếu định mức.');
    if (!norm.ngay) return setError('Phiếu định mức thiếu ngày.');
    if (!norm.ca) return setError('Phiếu định mức thiếu ca — sửa phiếu định mức rồi lưu lại.');
    if (products.length === 0 || products.every(product => product.nvl.length === 0)) {
      return setError('Phiếu không có dòng NVL để lưu.');
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const existing = actuals.find(row => String(row.dinh_muc_id) === String(norm.id));
      const payloadChiTiet = products.map(product => ({
        ma_sp: product.ma_sp,
        ten_sp: product.ten_sp,
        tong_trong_luong: product.tong_trong_luong,
        nvl: product.nvl.map(line => ({
          ma_nvl: line.ma_nvl,
          ten_nvl: line.ten_nvl,
          gia_tri: line.gia_tri,
          khoi_luong: line.khoi_luong,
          phan_tram_thuc_te: line.phan_tram_thuc_te,
          trong_luong_thuc_te: line.trong_luong_thuc_te
        }))
      }));

      const res = await fetch('/api/phieu-tron-thuc-te', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existing?.id,
          ngay: norm.ngay,
          ca: norm.ca,
          dinh_muc_id: norm.id,
          ma_lenh_sx: norm.ma_lenh_sx,
          ghi_chu: note,
          chi_tiet: payloadChiTiet
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không thể lưu phiếu.');
      const record = normalizeActualRecords({ records: data.record ? [data.record] : [] })[0];
      if (!record) throw new Error('Máy chủ không trả về phiếu vừa lưu. Vui lòng thử lại.');

      setActuals(current => [
        ...current.filter(row => String(row.dinh_muc_id) !== String(norm.id)),
        record
      ]);
      setProducts(mergeActualOntoNorm(norm.chi_tiet, record.chi_tiet));
      setMessage(
        existing
          ? `Đã cập nhật đúng dòng ${norm.ma_lenh_sx || norm.id} · ca ${norm.ca}.`
          : `Đã lưu đúng dòng ${norm.ma_lenh_sx || norm.id} · ca ${norm.ca}.`
      );
    } catch (err: any) {
      setError(err.message || 'Không thể lưu phiếu.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!printDoc) return;
    document.body.classList.add('mixing-norm-ratio-print-active');
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (!cancelled) window.print();
      });
    }, 120);
    const close = () => setPrintDoc(null);
    window.addEventListener('afterprint', close);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', close);
      document.body.classList.remove('mixing-norm-ratio-print-active');
    };
  }, [printDoc]);

  const print = () => {
    if (!selectedNorm) return;
    setPrintDoc({
      maLenhSx: selectedNorm.ma_lenh_sx,
      ngay: selectedNorm.ngay,
      ca: selectedNorm.ca,
      isActual: true,
      intro: 'Tỷ lệ trộn định mức và kết quả trộn thực tế như sau',
      products: products.map(product => ({
        ma_sp: product.ma_sp,
        ten_sp: product.ten_sp,
        tong_trong_luong: product.tong_trong_luong,
        ghi_chu: '',
        chi_tiet: product.nvl.map(line => ({
          ma_nvl: line.ma_nvl,
          ten_nvl: line.ten_nvl,
          gia_tri: line.gia_tri,
          don_vi: '%',
          khoi_luong: line.khoi_luong
        }))
      })),
      actualValues: products.map(product =>
        product.nvl.map(line => ({
          percent: line.phan_tram_thuc_te,
          weight: line.trong_luong_thuc_te
        }))
      )
    });
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-sm font-bold text-zinc-500">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Đang tải...
      </div>
    );
  }

  const savedForSelected = selectedNorm
    ? actuals.find(row => String(row.dinh_muc_id) === String(selectedNorm.id))
    : null;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-black text-zinc-950">Phiếu trộn thực tế</h2>
        <p className="text-xs font-semibold text-zinc-500">
          Chọn đúng dòng phiếu định mức — ca lấy sẵn từ phiếu đó, không cần chọn ca riêng.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-black text-zinc-600">
          Ngày
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs font-black text-zinc-600">
          Dòng phiếu định mức
          <select
            value={selectedNormId}
            onChange={e => {
              setSelectedNormId(e.target.value);
              setError('');
              setMessage('');
            }}
            disabled={matchingNorms.length === 0}
            className={fieldClass}
          >
            <option value="">
              {matchingNorms.length ? 'Chọn đúng dòng để nhập / lưu' : 'Không có phiếu định mức ngày này'}
            </option>
            {matchingNorms.map(row => {
              const hasActual = actuals.some(item => String(item.dinh_muc_id) === String(row.id));
              return (
                <option key={row.id} value={row.id}>
                  {(row.ma_lenh_sx || 'Không có mã lệnh') +
                    (row.ca ? ` · Ca ${row.ca}` : '') +
                    (hasActual ? ' · đã có thực tế' : '')}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      {selectedNorm ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
          Đang mở dòng:{' '}
          <span className="font-black text-zinc-950">{selectedNorm.ma_lenh_sx || selectedNorm.id}</span>
          {' · '}Ngày <span className="font-mono font-black">{selectedNorm.ngay}</span>
          {' · '}Ca <span className="font-black">{selectedNorm.ca || '—'}</span>
          {savedForSelected ? (
            <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
              Đã có phiếu thực tế
            </span>
          ) : null}
        </div>
      ) : null}
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700"
        >
          <XCircle className="h-5 w-5 shrink-0" />
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {message}
        </p>
      )}
      {selectedNormId &&
        products.map((product, pi) => (
          <div key={`${product.ma_sp}-${pi}`} className="overflow-hidden rounded-xl border border-zinc-200">
            <div className="bg-zinc-100 px-3 py-2 text-sm font-black">
              {product.ma_sp} · {product.ten_sp}{' '}
              <span className="ml-2 text-zinc-500">Tổng TL: {formatNumber(product.tong_trong_luong)} kg</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-zinc-950 text-white">
                  <tr>
                    <th className="px-3 py-2">Mã NVL</th>
                    <th className="px-3 py-2">Tên NVL</th>
                    <th className="px-3 py-2 text-right">% định mức</th>
                    <th className="px-3 py-2 text-right">Trọng lượng định mức</th>
                    <th className="px-3 py-2 text-right">% thực tế</th>
                    <th className="px-3 py-2 text-right">Trọng lượng thực tế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {product.nvl.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-center font-semibold text-zinc-400">
                        Phiếu định mức chưa có dòng NVL.
                      </td>
                    </tr>
                  ) : (
                    product.nvl.map((line, li) => (
                      <tr key={`${line.ma_nvl}-${li}`}>
                        <td className="px-3 py-2 font-mono font-bold">{line.ma_nvl}</td>
                        <td className="px-3 py-2">{line.ten_nvl}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(line.gia_tri)}%</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(line.khoi_luong)} kg</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.phan_tram_thuc_te ?? ''}
                            onChange={e => changePercent(pi, li, e.target.value)}
                            className={`${fieldClass} ml-auto block w-28 text-right`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-black text-[#ef1b2d]">
                          {formatNumber(line.trong_luong_thuc_te)} kg
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      {selectedNormId && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="grid flex-1 gap-1 text-xs font-black text-zinc-600">
            Ghi chú
            <input value={note} onChange={e => setNote(e.target.value)} className={fieldClass} />
          </label>
          <button
            type="button"
            onClick={print}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-black text-zinc-800"
          >
            <Printer className="h-4 w-4" />
            In phiếu
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ef1b2d] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Đang lưu...' : 'Lưu đúng dòng này'}
          </button>
        </div>
      )}
      {printDoc ? <MixingNormRatioPrintBatch docs={[printDoc]} /> : null}
    </section>
  );
}
