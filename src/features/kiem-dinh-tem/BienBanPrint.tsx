import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Printer, X } from 'lucide-react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';
import { enablePortraitPrintPage, disablePortraitPrintPage, waitForPrintImagesReady } from '../../utils/printReady';

export type BienBanRecord = {
  ma_bien_ban: string;
  ngay_lap?: string | null;
  ma_qr: string;
  ma_sp?: string | null;
  ngay_sx?: string | null;
  ca?: string | null;
  may?: string | null;
  lenh_sx?: string | null;
  nguoi_san_xuat?: string | null;
  da_len_tram_can?: boolean | null;
  thoi_diem_can?: string | null;
  du_lieu_can?: { can_loi?: number | null; can_san_pham?: number | null; khoi_luong_thuc?: number | null } | null;
  ket_luan?: string | null;
  noi_dung?: string | null;
  ghi_chu?: string | null;
  nguoi_lap?: string | null;
};

export function formatBbDate(value?: string | null) {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value || '-';
}

function formatBbDateTime(value?: string | null) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return value;
  }
}

export function BienBanSheet({ data }: { data: BienBanRecord }) {
  const can = data.du_lieu_can;
  const rows: Array<[string, React.ReactNode]> = [
    ['Mã QR tem', <span className="break-all font-mono">{data.ma_qr}</span>],
    ['Mã sản phẩm', data.ma_sp || '-'],
    ['Ngày sản xuất', formatBbDate(data.ngay_sx)],
    ['Ca', data.ca || '-'],
    ['Máy', data.may || '-'],
    ['Lệnh SX', data.lenh_sx || '-'],
    ['Người sản xuất', data.nguoi_san_xuat || '-'],
    [
      'Trạm cân AI',
      data.da_len_tram_can
        ? `Đã lên trạm cân (${formatBbDateTime(data.thoi_diem_can)})`
        : 'Chưa có dữ liệu trên trạm cân'
    ],
    ...(data.da_len_tram_can
      ? ([
          [
            'Cân lõi / Cân SP / KL thực',
            `${can?.can_loi ?? '-'} / ${can?.can_san_pham ?? '-'} / ${can?.khoi_luong_thuc ?? '-'} kg`
          ]
        ] as Array<[string, React.ReactNode]>)
      : []),
    ['Kết luận', data.ket_luan === 'khong_dat' ? 'KHÔNG ĐẠT' : 'ĐẠT'],
    ['Nội dung', data.noi_dung || '-'],
    ['Ghi chú', data.ghi_chu || '-']
  ];
  return (
    <div className="warehouse-slip-print-sheet warehouse-slip-print-sheet--xuat">
      <div className="warehouse-slip-print-doc">
        <header className="warehouse-slip-print-header">
          <div className="warehouse-slip-print-brand">
            <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="warehouse-slip-print-logo" />
            <div className="warehouse-slip-print-company">
              <p className="warehouse-slip-print-company-name">{PRINT_COMPANY_NAME}</p>
            </div>
          </div>
          <h1 className="warehouse-slip-print-title">BIÊN BẢN KIỂM ĐỊNH TEM</h1>
        </header>
        <div className="warehouse-slip-print-meta">
          <p>
            <strong>Số biên bản:</strong> {data.ma_bien_ban}
          </p>
          <p>
            <strong>Ngày lập:</strong> {formatBbDate(data.ngay_lap)}
          </p>
          <p>
            <strong>Người lập:</strong> {data.nguoi_lap || '-'}
          </p>
        </div>
        <table className="warehouse-slip-print-table warehouse-slip-print-table--xuat">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ width: '32%', fontWeight: 700 }}>{label}</td>
                <td className="warehouse-slip-print-name">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="warehouse-slip-print-signatures">
          {['Người lập biên bản', 'Trưởng ca', 'QC', 'Giám đốc'].map(role => (
            <div key={role}>
              <p>{role}</p>
              <span>(Ký, ghi rõ họ tên)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BienBanPrintModal({ data, onClose }: { data: BienBanRecord | null; onClose: () => void }) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing || !data) return;
    document.body.classList.add('warehouse-slip-print-active');
    enablePortraitPrintPage();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      waitForPrintImagesReady().then(() => {
        if (cancelled) return;
        try {
          window.print();
        } finally {
          setPrinting(false);
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.body.classList.remove('warehouse-slip-print-active');
      disablePortraitPrintPage();
    };
  }, [printing, data]);

  if (!data) return null;
  return (
    <>
      {printing
        ? createPortal(
            <div className="warehouse-slip-print-batch">
              <BienBanSheet data={data} />
            </div>,
            document.body
          )
        : null}
      <div className="warehouse-slip-print-modal fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-lg font-black text-zinc-950">Mẫu biên bản kiểm định tem</h3>
              <p className="mt-1 text-sm font-medium text-zinc-500">{data.ma_bien_ban}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-100 px-4 py-4 sm:px-5">
            <div className="warehouse-slip-print-preview mx-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <BienBanSheet data={data} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => setPrinting(true)}
              disabled={printing}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#ef1b2d] px-4 text-sm font-extrabold text-white hover:bg-[#b30d1c] disabled:opacity-60"
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              In biên bản
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
