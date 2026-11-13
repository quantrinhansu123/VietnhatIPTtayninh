import type { BaoCaoTongHopListRow } from '../bieu-do-th';
export default function BaoCaoNgaySummary({ rows }: { rows: BaoCaoTongHopListRow[] }) {
  const sum = (field: keyof BaoCaoTongHopListRow) => rows.length && rows.every(row => row[field] != null) ? rows.reduce((total, row) => total + Number(row[field]), 0) : null;
  const format = (value: number | null) => value == null ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const actual = sum('sl_san_luong'), target = sum('sl_yeu_cau'), product = sum('tl_nhua_thanh_pham_kg'), waste = sum('loi_hong_tong_kg');
  const metrics: [string, number | null][] = [
    ['Sản lượng thực tế', actual], ['Sản lượng yêu cầu', target],
    ['Hoàn thành (%)', actual != null && target != null && target > 0 ? actual / target * 100 : null],
    ['Nhựa thành phẩm (kg)', product], ['Lỗi hỏng (kg)', waste],
    ['Lỗi hỏng / thành phẩm (%)', waste != null && product != null && product > 0 ? waste / product * 100 : null]
  ];
  return <section aria-label="KPI báo cáo ngày" className="space-y-3">
    <p className="text-sm text-zinc-600">{new Set(rows.map(row => row.ngay_tu)).size} ngày · {rows.length} bản ghi ca/máy. Dữ liệu từ kết quả Tính toán đã lưu; lấy bản mới nhất theo ngày, ca và máy.</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-zinc-600">{label}</p><p className="mt-2 text-2xl font-black tabular-nums text-zinc-950">{format(value)}</p></div>)}</div>
  </section>;
}
