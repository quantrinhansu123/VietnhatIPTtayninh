import { normalizeProductCodeKey } from '../features/san-pham/types';
import type { BbBaoCaoTinhToanPayload } from './bbBaoCaoTinhToan';
import type { AcceptancePrintSlip } from '../components/AcceptanceReportPrintSheet';

type Snapshot = { payload?: BbBaoCaoTinhToanPayload | null };

function sameShift(a: string, b: string) {
  const normalize = (value: string) => String(value || '').toLowerCase().replace(/^ca\s*/, '').trim();
  return Boolean(normalize(a)) && normalize(a) === normalize(b);
}

function sameMachine(a: string, b: string) {
  const normalize = (value: string) => String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const bbNumber = (value: string) =>
    value.match(/(?:mbb|baobi|bb)(\d+)$/)?.[1]?.replace(/^0+/, '') || '';
  return Boolean(bbNumber(left) && bbNumber(left) === bbNumber(right));
}

/** Chia đúng tổng cột Nhập thành phẩm 3.1 theo TL SP của cùng nhóm LSX, không lấy ĐM nhựa. */
export function acceptanceMixedKgByProduct(
  payload: BbBaoCaoTinhToanPayload | null | undefined,
  slip: AcceptancePrintSlip
): Map<string, number> | null {
  if (!payload || !slip.ngay || !slip.ca || !(slip.ma_may || slip.ten_may)) return null;
  const result = new Map<string, number>();
  let matched = false;
  for (const group of payload.thucDungGroups || []) {
    if (
      group.ngay !== slip.ngay ||
      !sameShift(group.shift || group.shiftLabel, slip.ca) ||
      !(sameMachine(slip.ma_may, group.machine) || sameMachine(slip.ten_may, group.machine))
    ) continue;
    const sanLuong = (payload.sanLuongGroups || []).find(item =>
      item.groupKey === group.groupKey ||
      (item.orderCode === group.orderCode && item.ngay === group.ngay &&
        sameShift(item.shift || item.shiftLabel, group.shift || group.shiftLabel) &&
        sameMachine(group.machine, item.machine))
    );
    const products = (sanLuong?.productGroups || []).filter(item => item.weightKg > 0);
    const weight = products.reduce((sum, item) => sum + item.weightKg, 0);
    if (!(weight > 0)) continue;
    const finishedKg = group.lines
      .filter(line => line.isPlasticNvl === true ||
        (line.isPlasticNvl == null && line.inMixingRatioTable === true))
      .reduce((sum, line) => sum + (Number.isFinite(line.klThucTeKg) ? line.klThucTeKg : 0), 0);
    // Phân bổ theo cùng TL SP mà bảng 3.1 dùng; dòng cuối nhận phần dư làm tròn.
    const totalCents = Math.round(finishedKg * 100);
    let allocatedCents = 0;
    products.forEach((product, index) => {
      const cents = index === products.length - 1
        ? totalCents - allocatedCents
        : Math.round(totalCents * product.weightKg / weight);
      allocatedCents += cents;
      const key = normalizeProductCodeKey(product.productCode);
      if (key) result.set(key, (result.get(key) || 0) + cents / 100);
    });
    matched = true;
  }
  return matched ? result : null;
}

/** Chọn bản tính mới nhất có dữ liệu ngày·ca·máy cho phiếu in. */
export function findAcceptanceMixedWeight(
  snapshots: Snapshot[],
  slip: AcceptancePrintSlip
): Map<string, number> | null {
  for (const snapshot of snapshots) {
    const weights = acceptanceMixedKgByProduct(snapshot.payload, slip);
    if (weights) return weights;
  }
  return null;
}

export async function loadAcceptanceMixedWeight(slip: AcceptancePrintSlip) {
  const params = new URLSearchParams({
    dateFrom: slip.ngay,
    dateTo: slip.ngay,
    limit: '100'
  });
  const response = await fetch(`/api/bb-bao-cao-tinh-toan?${params}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Không tải được bảng 3.1.');
  return findAcceptanceMixedWeight(Array.isArray(data.items) ? data.items : [], slip);
}
