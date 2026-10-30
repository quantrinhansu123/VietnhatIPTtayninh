import type { BaoCaoTongHopListRow } from './index';

export function comparisonRows(rows: BaoCaoTongHopListRow[]) {
  const unique = new Map<string, BaoCaoTongHopListRow>();
  for (const row of rows) {
    if (!row.ngay_tu || row.ngay_tu !== row.ngay_den || row.may === 'all' || row.ca === 'all') continue;
    const key = JSON.stringify([row.ngay_tu, row.may, row.ca]);
    const previous = unique.get(key);
    if (!previous || row.updated_at > previous.updated_at) unique.set(key, row);
  }
  return [...unique.values()];
}

export function summarize(rows: BaoCaoTongHopListRow[], key: (row: BaoCaoTongHopListRow) => string) {
  const groups = new Map<string, BaoCaoTongHopListRow[]>();
  rows.forEach(row => { const label = key(row); groups.set(label, [...(groups.get(label) ?? []), row]); });
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true })).map(([label, items]) => {
    const sum = (field: keyof BaoCaoTongHopListRow) => items.every(r => r[field] != null)
      ? items.reduce((total, r) => total + Number(r[field]), 0) : null;
    const tp = sum('tl_nhua_thanh_pham_kg');
    const loi = sum('loi_hong_tong_kg');
    const chenh = sum('chenh_lech_nhua_kg');
    const dm = sum('tl_nhua_dinh_muc_kg');
    return { label, tp, loi, chenh, dm,
      rate: tp != null && tp > 0 && loi != null ? loi / tp * 100 : null,
      loss: dm != null && dm > 0 && chenh != null ? -chenh / dm * 100 : null,
      days: new Set(items.filter(r => (r.tl_nhua_thanh_pham_kg ?? 0) > 0).map(r => r.ngay_tu)).size };
  });
}
