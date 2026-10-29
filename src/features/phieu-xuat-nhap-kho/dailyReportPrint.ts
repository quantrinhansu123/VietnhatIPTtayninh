import { PRINT_COMPANY_NAME, COMPANY_BRANCH_NAME } from '../../components/layout/constants';

export type DailyReportBalanceRow = {
  ma: string;
  ten: string;
  don_vi: string;
  ton_dau_ky: number;
  nhap_trong_ky: number;
  xuat_trong_ky: number;
  ton_cuoi_ky: number;
};

export type DailyReportSlip = {
  slipCode: string;
  lineCount: number;
  quantity: number;
  createdBy: string;
};

export type WarehouseDailyReportData = {
  /** yyyy-MM-dd */
  date: string;
  warehouseName: string;
  balances: DailyReportBalanceRow[];
  inboundSlips: DailyReportSlip[];
  outboundSlips: DailyReportSlip[];
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatQty = (value: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0);

function formatDateVi(value: string) {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function slipTable(title: string, slips: DailyReportSlip[]) {
  const total = slips.reduce((sum, slip) => sum + slip.quantity, 0);
  const rows = slips.length
    ? slips
        .map(
          (slip, index) => `<tr>
        <td class="c">${index + 1}</td><td>${escapeHtml(slip.slipCode)}</td>
        <td class="c">${slip.lineCount}</td><td class="r">${formatQty(slip.quantity)}</td>
        <td>${escapeHtml(slip.createdBy)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="c muted">Không phát sinh phiếu</td></tr>';
  return `<h3>${title} (${slips.length} phiếu)</h3>
    <table><thead><tr><th style="width:36px">STT</th><th>Mã phiếu</th><th style="width:70px">Số dòng</th>
    <th style="width:100px">Tổng SL</th><th>Người lập</th></tr></thead><tbody>${rows}
    <tr class="total"><td colspan="3" class="r">Tổng</td><td class="r">${formatQty(total)}</td><td></td></tr></tbody></table>`;
}

export function buildWarehouseDailyReportHtml(data: WarehouseDailyReportData) {
  const balanceRows = data.balances.length
    ? data.balances
        .map(
          (row, index) => `<tr>
        <td class="c">${index + 1}</td><td>${escapeHtml(row.ma)}</td><td>${escapeHtml(row.ten)}</td>
        <td class="c">${escapeHtml(row.don_vi)}</td>
        <td class="r">${formatQty(row.ton_dau_ky)}</td><td class="r">${formatQty(row.nhap_trong_ky)}</td>
        <td class="r">${formatQty(row.xuat_trong_ky)}</td><td class="r b">${formatQty(row.ton_cuoi_ky)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="8" class="c muted">Không có mặt hàng phát sinh hoặc còn tồn</td></tr>';
  const sum = (key: keyof DailyReportBalanceRow) =>
    data.balances.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  const [d, m, y] = formatDateVi(data.date).split('/');

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Biên bản cuối ngày ${escapeHtml(
    formatDateVi(data.date)
  )}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", serif; font-size: 12px; color: #000; margin: 0; }
  .head { display: flex; justify-content: space-between; font-size: 11px; }
  h1 { text-align: center; font-size: 17px; margin: 12px 0 2px; }
  .sub { text-align: center; margin-bottom: 10px; }
  h3 { font-size: 13px; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
  th { background: #eee; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
  .muted { color: #666; font-style: italic; }
  .total td { font-weight: bold; background: #f6f6f6; }
  .sign { display: flex; justify-content: space-around; text-align: center; margin-top: 22px; page-break-inside: avoid; }
  .sign div { width: 30%; } .sign .gap { height: 64px; }
  .date { text-align: right; font-style: italic; margin-top: 14px; }
</style></head><body>
<div class="head"><div><b>${escapeHtml(PRINT_COMPANY_NAME)}</b><br>${escapeHtml(COMPANY_BRANCH_NAME)}</div><div></div></div>
<h1>BIÊN BẢN XUẤT NHẬP KHO CUỐI NGÀY</h1>
<div class="sub">Ngày ${escapeHtml(formatDateVi(data.date))} · Kho: <b>${escapeHtml(data.warehouseName || 'Tất cả kho')}</b></div>
<h3>I. Tổng hợp tồn kho trong ngày</h3>
<table><thead><tr><th style="width:36px">STT</th><th style="width:110px">Mã</th><th>Tên</th><th style="width:50px">ĐVT</th>
<th style="width:70px">Tồn đầu</th><th style="width:70px">Nhập</th><th style="width:70px">Xuất</th><th style="width:70px">Tồn cuối</th></tr></thead>
<tbody>${balanceRows}
<tr class="total"><td colspan="4" class="r">Tổng cộng</td><td class="r">${formatQty(sum('ton_dau_ky'))}</td>
<td class="r">${formatQty(sum('nhap_trong_ky'))}</td><td class="r">${formatQty(sum('xuat_trong_ky'))}</td>
<td class="r">${formatQty(sum('ton_cuoi_ky'))}</td></tr></tbody></table>
<h3>II. Phiếu phát sinh trong ngày</h3>
${slipTable('Phiếu nhập kho', data.inboundSlips)}
${slipTable('Phiếu xuất kho', data.outboundSlips)}
<div class="date">Ngày ${d || '...'} tháng ${m || '...'} năm ${y || '...'}</div>
<div class="sign">
  <div><b>Thủ kho</b><br><i>(Ký, ghi rõ họ tên)</i><div class="gap"></div></div>
  <div><b>Kế toán</b><br><i>(Ký, ghi rõ họ tên)</i><div class="gap"></div></div>
  <div><b>Quản đốc / Phụ trách</b><br><i>(Ký, ghi rõ họ tên)</i><div class="gap"></div></div>
</div>
</body></html>`;
}

/** In biên bản qua iframe ẩn — không phụ thuộc CSS của app. */
export function printWarehouseDailyReport(data: WarehouseDailyReportData) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error('Không mở được cửa sổ in.');
  }
  doc.open();
  doc.write(buildWarehouseDailyReportHtml(data));
  doc.close();
  const cleanup = () => window.setTimeout(() => iframe.remove(), 1000);
  win.addEventListener('afterprint', cleanup);
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 150);
}
