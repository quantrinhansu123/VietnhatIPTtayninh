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

function foldMachineText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .trim();
}
