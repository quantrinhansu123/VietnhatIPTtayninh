import React, { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanBarcode,
  Search,
  Trash2,
  XCircle
} from 'lucide-react';
import ProductQrScanner from '../../components/ProductQrScanner';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';

type NhapKhoHit = {
  id?: string | number;
  ma_sp?: string | null;
  ma_sp_quet?: string | null;
  ten_sp?: string | null;
  don_vi?: string | null;
  so_luong?: number | null;
  ma_phieu?: string | null;
  created_at?: string | null;
  ca?: string | null;
  may?: string | null;
  ngay?: string | null;
  trang_thai?: string | null;
};

type LookupResult = {
  code: string;
  found: boolean;
  rows: NhapKhoHit[];
  checkedAt: number;
  error?: string;
};

function looksLikeBadCode(code: string) {
  const key = code
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return (
    key === 'loi' ||
    key === 'error' ||
    key === 'err' ||
    key === 'null' ||
    key === 'undefined' ||
    key === 'fail' ||
    key === 'failed' ||
    (key.includes('loi') && !key.includes('_'))
  );
}

function formatCheckedAt(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

function formatCreatedAt(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return raw;
  }
}

export function TimMaLoiPanel({ onBack }: { onBack: () => void }) {
  const [manualCode, setManualCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'hardware-v2'>('hardware-v2');
  const [results, setResults] = useState<LookupResult[]>([]);
  const [lastResult, setLastResult] = useState<LookupResult | null>(null);
  const checkingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookupCode = useCallback(async (raw: string): Promise<boolean> => {
    const code = String(raw || '').trim();
    if (!code) {
      showAppToast('Nhập hoặc quét mã QR trước.', 'error');
      return false;
    }
    if (checkingRef.current) return false;
    checkingRef.current = true;
    setChecking(true);
    try {
      const res = await fetch('/api/kho/tra-cuu-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_sp_quet: code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(readApiErrorMessage(res, data, 'Không tra cứu được mã QR.'));
      }
      const found = Boolean(data?.found);
      const rows = Array.isArray(data?.rows) ? (data.rows as NhapKhoHit[]) : [];
      const entry: LookupResult = {
        code: String(data?.ma_sp_quet || code).trim() || code,
        found,
        rows,
        checkedAt: Date.now()
      };
      setLastResult(entry);
      setResults(prev => [entry, ...prev.filter(item => item.code !== entry.code)].slice(0, 100));

      if (!found) {
        const bad = looksLikeBadCode(entry.code);
        showAppToast(
          bad
            ? `Cảnh báo: mã "${entry.code}" giống mã lỗi đọc QR — không có trong nhap_kho.`
            : `Cảnh báo: mã "${entry.code}" chưa có trong nhap_kho.`,
          'error'
        );
        return false;
      }

      const phieu = rows.map(r => String(r.ma_phieu || '').trim()).filter(Boolean);
      const uniquePhieu = [...new Set(phieu)];
      showAppToast(
        uniquePhieu.length
          ? `OK — đã có trong nhap_kho (${uniquePhieu.join(', ')}).`
          : 'OK — đã có trong nhap_kho.'
      );
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không tra cứu được mã QR.';
      const entry: LookupResult = {
        code,
        found: false,
        rows: [],
        checkedAt: Date.now(),
        error: message
      };
      setLastResult(entry);
      setResults(prev => [entry, ...prev].slice(0, 100));
      showAppToast(message, 'error');
      return false;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await lookupCode(manualCode);
    if (ok) setManualCode('');
    inputRef.current?.focus();
  };

  const missingCount = results.filter(r => !r.found).length;
  const okCount = results.filter(r => r.found).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">Tìm mã lỗi</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Quét QR rồi đối chiếu với <span className="font-semibold">nhap_kho</span>. Nếu chưa có dòng nhập → cảnh báo.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Quay lại
        </button>
      </div>

      <form
        onSubmit={handleManualSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Mã QR / mã SP quét</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            placeholder="Dán hoặc gõ mã, Enter để tra cứu…"
            autoComplete="off"
            className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 font-mono text-sm font-semibold text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={checking || !manualCode.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ef1b2d] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Tra cứu
            </button>
            <button
              type="button"
              onClick={() => {
                setScannerMode('hardware-v2');
                setScannerOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
            >
              <ScanBarcode className="h-4 w-4" /> Quét máy
            </button>
            <button
              type="button"
              onClick={() => {
                setScannerMode('camera');
                setScannerOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
            >
              <ScanBarcode className="h-4 w-4" /> Quét ĐT
            </button>
          </div>
        </div>
      </form>

      {lastResult && (
        <div
          className={`rounded-2xl border-2 p-4 ${
            lastResult.found
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-amber-400 bg-amber-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {lastResult.found ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-black ${lastResult.found ? 'text-emerald-900' : 'text-amber-950'}`}>
                {lastResult.found
                  ? 'Mã đã có trong nhap_kho'
                  : looksLikeBadCode(lastResult.code)
                    ? 'Cảnh báo — mã giống lỗi đọc QR / chưa nhập kho'
                    : 'Cảnh báo — mã chưa có trong nhap_kho'}
              </p>
              <p className="mt-1 break-all font-mono text-base font-bold text-zinc-900">{lastResult.code}</p>
              {lastResult.error ? (
                <p className="mt-1 text-sm text-red-700">{lastResult.error}</p>
              ) : null}
              {lastResult.found && lastResult.rows.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {lastResult.rows.slice(0, 5).map((row, idx) => (
                    <li
                      key={`${row.id ?? idx}-${row.ma_phieu}`}
                      className="rounded-xl border border-emerald-200 bg-white/80 px-3 py-2 text-sm text-zinc-800"
                    >
                      <div className="font-semibold">Phiếu: {row.ma_phieu || '—'}</div>
                      <div className="text-zinc-600">
                        {row.ten_sp || row.ma_sp || '—'}
                        {row.don_vi ? ` · ${row.don_vi}` : ''}
                        {row.so_luong != null ? ` · SL ${row.so_luong}` : ''}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {[row.ngay, row.ca, row.may].filter(Boolean).join(' · ') || formatCreatedAt(row.created_at)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-3 sm:px-4">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Phiên tra cứu</h2>
            <p className="text-xs text-zinc-500">
              OK: {okCount} · Thiếu / lỗi: {missingCount} · Tổng: {results.length}
            </p>
          </div>
          <button
            type="button"
            disabled={results.length === 0}
            onClick={() => {
              setResults([]);
              setLastResult(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Xóa danh sách
          </button>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">
            Chưa quét mã nào. Dùng máy quét hoặc camera để kiểm tra từng tem.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {results.map(item => (
              <li key={`${item.code}-${item.checkedAt}`} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                {item.found ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="break-all font-mono text-sm font-bold text-zinc-900">{item.code}</div>
                  <div className={`text-xs font-semibold ${item.found ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {item.found
                      ? `Có trong nhap_kho${
                          item.rows[0]?.ma_phieu ? ` · ${item.rows.map(r => r.ma_phieu).filter(Boolean).slice(0, 3).join(', ')}` : ''
                        }`
                      : item.error || 'Không có trong nhap_kho'}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-zinc-400">{formatCheckedAt(item.checkedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={lookupCode}
        hardwareOnly={scannerMode === 'hardware-v2'}
        hardwareV2={scannerMode === 'hardware-v2'}
        requireConfirm={false}
        closeAfterScan={false}
        scannedCount={results.length}
      />
    </div>
  );
}
