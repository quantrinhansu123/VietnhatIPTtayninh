import React from 'react';
import { PRINT_COMPANY_NAME, vietNhatLogoUrl } from '../../components/layout/constants';

export type TonThanhPhamRow = {
  ma: string;
  ten: string;
  ton_dau_ky: number;
  nhap_trong_ky: number;
  xuat_trong_ky: number;
  ton_cuoi_ky: number;
};

export type TonThanhPhamReport = { from: string; to: string; rows: TonThanhPhamRow[] };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

/** Tồn thành phẩm theo 1 ngày (from = to) hoặc khoảng ngày; tồn đầu/nhập/xuất/tồn cuối do server tính. */
export async function loadTonThanhPhamReport(from: string, to: string): Promise<TonThanhPhamReport> {
  const params = new URLSearchParams({ loai_kho: 'san_pham', ten_kho: 'Kho thành phẩm', from, to, gom_het: '1' });
  const res = await fetch(`/api/ton-kho/tong-hop?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Không tải được báo cáo tồn thành phẩm.');
  const records: Record<string, unknown>[] = Array.isArray(data.records) ? data.records : [];
  const rows = records
    .map(r => ({
      ma: String(r.ma ?? '').trim(),
      ten: String(r.ten ?? '').trim(),
      ton_dau_ky: num(r.ton_dau_ky),
      nhap_trong_ky: num(r.nhap_trong_ky),
      xuat_trong_ky: num(r.xuat_trong_ky),
      ton_cuoi_ky: num(r.ton_cuoi_ky)
    }))
    .filter(r => r.ma)
    .sort((a, b) => a.ma.localeCompare(b.ma, 'vi', { numeric: true }));
  return { from, to, rows };
}

export function TonThanhPhamPrintSheet({ report }: { report: TonThanhPhamReport }) {
  const { from, to, rows } = report;
  const total = (k: keyof TonThanhPhamRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const cell = { border: '1px solid #000', padding: '3px 6px', fontSize: '11px' } as const;
  const right = { ...cell, textAlign: 'right' } as const;
  return (
    <div style={{ padding: '10mm', background: '#fff', color: '#000', pageBreakBefore: 'always' }}>
      <header className="production-order-print-letterhead">
        <img src={vietNhatLogoUrl} alt={PRINT_COMPANY_NAME} className="production-order-print-logo" />
        <div className="production-order-print-company">
          <p className="production-order-print-company-name">{PRINT_COMPANY_NAME}</p>
        </div>
      </header>
      <h1 className="production-order-print-title">BÁO CÁO TỒN THÀNH PHẨM</h1>
      <p style={{ textAlign: 'center', fontSize: '12px', margin: '2px 0 8px' }}>
        {from === to ? `Ngày ${fmtDate(from)}` : `Từ ngày ${fmtDate(from)} đến ngày ${fmtDate(to)}`}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f1f1f1' }}>
            {['STT', 'Mã thành phẩm', 'Tên thành phẩm', 'Tồn đầu', 'Nhập', 'Xuất', 'Tồn cuối'].map(h => (
              <th key={h} style={{ ...cell, textAlign: 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ma}>
              <td style={{ ...cell, textAlign: 'center' }}>{i + 1}</td>
              <td style={cell}>{r.ma}</td>
              <td style={cell}>{r.ten}</td>
              <td style={right}>{fmt(r.ton_dau_ky)}</td>
              <td style={right}>{fmt(r.nhap_trong_ky)}</td>
              <td style={right}>{fmt(r.xuat_trong_ky)}</td>
              <td style={right}>{fmt(r.ton_cuoi_ky)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800 }}>
            <td style={{ ...cell, textAlign: 'center' }} colSpan={3}>Tổng</td>
            <td style={right}>{fmt(total('ton_dau_ky'))}</td>
            <td style={right}>{fmt(total('nhap_trong_ky'))}</td>
            <td style={right}>{fmt(total('xuat_trong_ky'))}</td>
            <td style={right}>{fmt(total('ton_cuoi_ky'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
