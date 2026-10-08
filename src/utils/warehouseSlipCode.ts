/** Viết tắt máy cho mã phiếu: "Máy bao bì 15" → MBB15, "MBB15 - Máy bao bì 15" → MBB15. */
export function machineSlipCodeToken(machineName: string): string {
  const raw = machineName.trim();
  if (!raw) return '';
  const labeled = raw.split(/\s+-\s+/);
  if (labeled.length > 1) {
    const head = foldMachineText(labeled[0]).replace(/[^A-Z0-9]/g, '');
    if (head) return head;
  }
  const folded = foldMachineText(raw);
  if (/^[A-Z0-9]+$/.test(folded)) return folded;
  const tokens = folded.match(/[A-Z]+|\d+/g) ?? [];
  return tokens.map(token => (/^\d+$/.test(token) ? token : token[0])).join('');
}

/** PN-MBB5-20261008-081716 → PN-MBB5; PN-20261008-081716 → PN. */
export function warehouseSlipCodeGroupPrefix(slipCode: string): string {
  const code = slipCode.trim().toUpperCase();
  const withToken = code.match(/^(P[NX])-([A-Z0-9]+)-\d{8}-\d{6}$/);
  if (withToken) return `${withToken[1]}-${withToken[2]}`;
  const plain = code.match(/^(P[NX])-\d{8}-\d{6}$/);
  if (plain) return plain[1];
  const loose = code.match(/^(.*)-\d{8}-\d{6}$/);
  return loose?.[1] || code || '—';
}

function foldMachineText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .trim();
}
