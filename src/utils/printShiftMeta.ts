/** Header máy / ca / giờ ca dùng chung phiếu in (tránh circular import giữa các print sheet). */

/** «Máy Bao bì Số: 16» nếu nhận diện được; không thì hiện tên/mã máy. */
export function formatChecklistMachineHeader(code = '', name = '') {
  const rawCode = String(code || '').trim();
  const rawName = String(name || '').trim();
  const hay = `${rawName} ${rawCode}`.trim();
  const isBaoBi = /bao\s*b[iì]|mbb/i.test(hay);
  const numMatch = hay.match(/(?:s[oố]|so|#)?\s*(\d+)\s*$/i) || rawCode.match(/(\d+)/);
  if (isBaoBi && numMatch?.[1]) return `Máy Bao bì Số: ${numMatch[1]}`;
  if (rawName && rawName !== '-' && rawName !== rawCode) return rawName;
  return rawCode || '—';
}

/** Ca trên form giấy thường ghi 1 / 2; map 12C1→1, HC1→1 khi khớp. */
export function formatChecklistShiftLabel(shift = '') {
  const raw = String(shift || '').trim();
  if (!raw) return '—';
  const twelve = raw.match(/^12\s*C\s*(\d+)$/i);
  if (twelve) return twelve[1];
  const hc = raw.match(/^HC\s*(\d+)$/i);
  if (hc) return hc[1];
  const caNum = raw.match(/^ca\s*(\d+)$/i);
  if (caNum) return caNum[1];
  return raw;
}

function formatShiftClock(time: string) {
  const match = String(time || '').match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return '';
  const hour = String(Math.min(23, Math.max(0, Number(match[1])))).padStart(2, '0');
  const minute = match[2] != null ? match[2] : '00';
  return `${hour}:${minute}`;
}

export function formatAcceptanceShiftLabel(shift = '') {
  const label = formatChecklistShiftLabel(shift);
  return label === '—' ? '' : label;
}

export function resolveAcceptanceShiftHours(
  ca: string,
  shiftSettings?: Array<{
    code?: string;
    name?: string;
    value?: string;
    label?: string;
    startTime?: string;
    endTime?: string;
    timeFrame?: string;
  }>
): { from: string; to: string } {
  const raw = String(ca || '').trim();
  const settings = shiftSettings || [];
  const matched = settings.find(setting => {
    const code = String(setting.code || setting.value || '').trim();
    const name = String(setting.name || setting.label || '').trim();
    return (
      (code && code.toLowerCase() === raw.toLowerCase()) ||
      (name && name.toLowerCase() === raw.toLowerCase()) ||
      (name && raw && name.toLowerCase().includes(raw.toLowerCase())) ||
      (code && raw && raw.toLowerCase().includes(code.toLowerCase()))
    );
  });
  if (matched) {
    const label = String(matched.label || matched.name || '').trim();
    const parenMatch = label.match(/\(([^)]+)\)/);
    const frameSource = parenMatch?.[1] || String(matched.timeFrame || '').trim();
    const frameMatch = frameSource.match(/(\d{1,2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}(?::\d{2})?)/);
    if (frameMatch) {
      return { from: formatShiftClock(frameMatch[1]), to: formatShiftClock(frameMatch[2]) };
    }
    return {
      from: formatShiftClock(matched.startTime || ''),
      to: formatShiftClock(matched.endTime || '')
    };
  }
  if (/12\s*c\s*2|hc\s*[23]|c\s*2|ca\s*2|đêm|dem/i.test(raw)) return { from: '18:00', to: '06:00' };
  if (/12\s*c\s*1|hc\s*1|c\s*1|ca\s*1|ngày|ngay/i.test(raw)) return { from: '06:00', to: '18:00' };
  return { from: '', to: '' };
}
