import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Printer, ScanBarcode, Search, Trash2, X } from 'lucide-react';
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
  const [detail, setDetail] = useState<BienBanRecord | null>(null);

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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-zinc-900">
                {tem.da_len_tram_can ? 'Tem đã được đưa lên trạm cân AI' : 'Tem CHƯA có dữ liệu trên trạm cân AI'}
              </p>
              <p className="mt-1 break-all font-mono text-base font-bold text-zinc-900">{tem.ma_qr}</p>
              {tem.da_len_tram_can && (
                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {previewRows.map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0 sm:flex-row sm:gap-2">
                      <dt className="text-xs font-semibold text-zinc-500 sm:w-36 sm:shrink-0 sm:text-sm">{k}</dt>
                      <dd className="min-w-0 break-words font-semibold text-zinc-900">{v}</dd>
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
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setTem(null)}
              className="h-11 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 sm:h-10"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white disabled:opacity-60 sm:h-10"
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
              <li
                key={r.ma_bien_ban}
                onClick={() => setDetail(r)}
                className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 hover:bg-zinc-50 sm:px-4"
              >
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <div className="break-words text-sm font-bold text-zinc-900">
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
                  onClick={e => {
                    e.stopPropagation();
                    setPrinting(r);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Printer className="h-3.5 w-3.5" /> In
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    void remove(r);
                  }}
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
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-base font-black text-zinc-950">Chi tiết biên bản</h3>
                <p className="break-all text-xs font-medium text-zinc-500">{detail.ma_bien_ban}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Đóng"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
              {(
                [
                  ['Ngày lập', formatBbDate(detail.ngay_lap)],
                  ['Mã QR tem', detail.ma_qr],
                  ['Mã SP', detail.ma_sp],
                  ['Ngày sản xuất', formatBbDate(detail.ngay_sx)],
                  ['Ca', detail.ca],
                  ['Máy', detail.may],
                  ['Lệnh SX', detail.lenh_sx],
                  ['Người sản xuất', detail.nguoi_san_xuat],
                  [
                    'Trạm cân AI',
                    detail.da_len_tram_can
                      ? `Đã lên trạm cân${
                          detail.thoi_diem_can
                            ? ` (${new Date(detail.thoi_diem_can).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })})`
                            : ''
                        }`
                      : 'Chưa có dữ liệu trên trạm cân'
                  ],
                  [
                    'Cân lõi / SP / thực',
                    detail.da_len_tram_can
                      ? `${detail.du_lieu_can?.can_loi ?? '—'} / ${detail.du_lieu_can?.can_san_pham ?? '—'} / ${detail.du_lieu_can?.khoi_luong_thuc ?? '—'} kg`
                      : ''
                  ],
                  ['Kết luận', detail.ket_luan === 'khong_dat' ? 'Không đạt' : 'Đạt'],
                  ['Nội dung', detail.noi_dung],
                  ['Ghi chú', detail.ghi_chu],
                  ['Người lập', detail.nguoi_lap]
                ] as Array<[string, string | null | undefined]>
              ).map(([k, v]) => (
                <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
                  <dt className="text-xs font-semibold text-zinc-500 sm:w-36 sm:shrink-0 sm:text-sm">{k}</dt>
                  <dd className="min-w-0 break-words font-semibold text-zinc-900">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="flex gap-2 border-t border-zinc-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 sm:flex-none"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrinting(detail);
                  setDetail(null);
                }}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white sm:flex-none"
              >
                <Printer className="h-4 w-4" /> In biên bản
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
