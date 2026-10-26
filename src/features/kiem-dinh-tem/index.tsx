import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Printer, ScanBarcode, Search, Trash2, XCircle } from 'lucide-react';
import ProductQrScanner from '../../components/ProductQrScanner';
import { readApiErrorMessage, showAppToast } from '../../lib/appToast';
import { BienBanPrintModal, formatBbDate, type BienBanRecord } from './BienBanPrint';

type TemInfo = {
  ma_qr: string;
  ma_sp?: string | null;
  da_len_tram_can: boolean;
  ngay?: string | null;
  ca?: string | null;
  may?: string | null;
  lenh_sx?: string | null;
  nguoi_san_xuat?: string | null;
  captured_at?: string | null;
  device_id?: string | null;
  can_loi?: number | null;
  can_san_pham?: number | null;
  khoi_luong_thuc?: number | null;
};

const fieldCls =
  'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10';
const scanBtn =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50';

export function KiemDinhTemPanel({
  onBack,
  currentUser
}: {
  onBack: () => void;
  currentUser?: { name?: string | null } | null;
}) {
  const [manualCode, setManualCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'hardware-v2'>('hardware-v2');
  const [tem, setTem] = useState<TemInfo | null>(null);
  const [ketLuan, setKetLuan] = useState<'dat' | 'khong_dat'>('dat');
  const [noiDung, setNoiDung] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<BienBanRecord[]>([]);
  const [printing, setPrinting] = useState<BienBanRecord | null>(null);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/bien-ban');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tải được danh sách biên bản.'));
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Không tải được danh sách biên bản.', 'error');
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const lookup = useCallback(async (raw: string): Promise<boolean> => {
    const code = String(raw || '').trim();
    if (!code) {
      showAppToast('Nhập hoặc quét mã QR trước.', 'error');
      return false;
    }
    setChecking(true);
    try {
      const res = await fetch('/api/kiem-dinh-tem/tra-cuu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_qr: code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không tra cứu được tem.'));
      setTem(data as TemInfo);
      setKetLuan((data as TemInfo).da_len_tram_can ? 'dat' : 'khong_dat');
      setNoiDung('');
      setGhiChu('');
      return true;
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Không tra cứu được tem.', 'error');
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const save = async () => {
    if (!tem) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bien-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_qr: tem.ma_qr,
          ma_sp: tem.ma_sp,
          ngay_sx: tem.ngay,
          ca: tem.ca,
          may: tem.may,
          lenh_sx: tem.lenh_sx,
          nguoi_san_xuat: tem.nguoi_san_xuat,
          da_len_tram_can: tem.da_len_tram_can,
          thoi_diem_can: tem.captured_at,
          du_lieu_can: tem.da_len_tram_can
            ? { can_loi: tem.can_loi, can_san_pham: tem.can_san_pham, khoi_luong_thuc: tem.khoi_luong_thuc }
            : null,
          ket_luan: ketLuan,
          noi_dung: noiDung,
          ghi_chu: ghiChu,
          nguoi_lap: currentUser?.name
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readApiErrorMessage(res, data, 'Không lưu được biên bản.'));
      showAppToast(`Đã lập biên bản ${data.record?.ma_bien_ban || ''}`);
      setTem(null);
      setManualCode('');
      setRecords(prev => [data.record, ...prev]);
      setPrinting(data.record);
    } catch (err) {
      showAppToast(err instanceof Error ? err.message : 'Không lưu được biên bản.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: BienBanRecord) => {
    if (!window.confirm(`Xóa biên bản ${r.ma_bien_ban}?`)) return;
    const res = await fetch(`/api/bien-ban/${encodeURIComponent(r.ma_bien_ban)}`, { method: 'DELETE' });
    if (!res.ok) {
      showAppToast('Không xóa được biên bản.', 'error');
      return;
    }
    setRecords(prev => prev.filter(x => x.ma_bien_ban !== r.ma_bien_ban));
  };

  const previewRows: Array<[string, string]> = tem
    ? [
        ['Mã SP', tem.ma_sp || '—'],
        ['Ngày sản xuất', formatBbDate(tem.ngay)],
        ['Ca', tem.ca || '—'],
        ['Máy', tem.may || '—'],
        ['Lệnh SX', tem.lenh_sx || '—'],
        ['Người sản xuất', tem.nguoi_san_xuat || '—'],
        [
          'Giờ cân',
          tem.captured_at
            ? new Date(tem.captured_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
            : '—'
        ],
        ['Cân lõi / SP / thực', `${tem.can_loi ?? '—'} / ${tem.can_san_pham ?? '—'} / ${tem.khoi_luong_thuc ?? '—'} kg`]
      ]
    : [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">Kiểm định tem</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Quét QR tem → xem ngày, ca, người sản xuất và dữ liệu trạm cân AI → lập biên bản.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:block"
        >
          Quay lại
        </button>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          void lookup(manualCode);
        }}
        className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
      >
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-500">Mã QR tem</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            placeholder="Dán hoặc gõ mã, Enter để tra cứu…"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-zinc-200 px-3 font-mono text-sm font-semibold outline-none focus:border-[#ef1b2d] focus:ring-2 focus:ring-red-500/10 sm:flex-1"
          />
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
            className={scanBtn}
            onClick={() => {
              setScannerMode('hardware-v2');
              setScannerOpen(true);
            }}
          >
            <ScanBarcode className="h-4 w-4" /> Quét máy
          </button>
          <button
            type="button"
            className={scanBtn}
            onClick={() => {
              setScannerMode('camera');
              setScannerOpen(true);
            }}
          >
            <ScanBarcode className="h-4 w-4" /> Quét ĐT
          </button>
        </div>
      </form>

      {tem && (
        <div
          className={`rounded-2xl border-2 p-4 ${
            tem.da_len_tram_can ? 'border-emerald-300 bg-emerald-50' : 'border-rose-400 bg-rose-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {tem.da_len_tram_can ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-zinc-900">
                {tem.da_len_tram_can ? 'Tem đã được đưa lên trạm cân AI' : 'Tem CHƯA có dữ liệu trên trạm cân AI'}
              </p>
              <p className="mt-1 break-all font-mono text-base font-bold text-zinc-900">{tem.ma_qr}</p>
              {tem.da_len_tram_can && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {previewRows.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="w-36 shrink-0 font-semibold text-zinc-500">{k}</dt>
                      <dd className="font-semibold text-zinc-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 border-t border-zinc-200/70 pt-4 sm:grid-cols-3">
            <label className="text-xs font-bold uppercase text-zinc-500">
              Kết luận
              <select
                className={`${fieldCls} mt-1`}
                value={ketLuan}
                onChange={e => setKetLuan(e.target.value as 'dat' | 'khong_dat')}
              >
                <option value="dat">Đạt</option>
                <option value="khong_dat">Không đạt</option>
              </select>
            </label>
            <label className="text-xs font-bold uppercase text-zinc-500 sm:col-span-2">
              Nội dung kiểm định
              <input
                className={`${fieldCls} mt-1`}
                value={noiDung}
                onChange={e => setNoiDung(e.target.value)}
                placeholder="VD: Tem mờ, sai ngày in…"
              />
            </label>
            <label className="text-xs font-bold uppercase text-zinc-500 sm:col-span-3">
              Ghi chú
              <input className={`${fieldCls} mt-1`} value={ghiChu} onChange={e => setGhiChu(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTem(null)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Lập biên bản
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-3 py-3 sm:px-4">
          <h2 className="text-sm font-bold text-zinc-900">Biên bản đã lập ({records.length})</h2>
        </div>
        {records.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-500">Chưa có biên bản nào.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {records.map(r => (
              <li key={r.ma_bien_ban} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-zinc-900">
                    {r.ma_bien_ban}{' '}
                    <span className={r.ket_luan === 'khong_dat' ? 'text-rose-600' : 'text-emerald-600'}>
                      · {r.ket_luan === 'khong_dat' ? 'Không đạt' : 'Đạt'}
                    </span>
                  </div>
                  <div className="break-all font-mono text-xs text-zinc-600">{r.ma_qr}</div>
                  <div className="text-xs text-zinc-500">
                    {[formatBbDate(r.ngay_lap), r.ca, r.may, r.nguoi_san_xuat].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrinting(r)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Printer className="h-3.5 w-3.5" /> In
                </button>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  className="inline-flex items-center rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
                  aria-label="Xóa biên bản"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductQrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={async code => {
          const ok = await lookup(code);
          if (ok) setScannerOpen(false);
          return ok;
        }}
        hardwareOnly={scannerMode === 'hardware-v2'}
        hardwareV2={scannerMode === 'hardware-v2'}
        requireConfirm={false}
        closeAfterScan
        scannedCount={tem ? 1 : 0}
      />
      <BienBanPrintModal data={printing} onClose={() => setPrinting(null)} />
    </div>
  );
}
