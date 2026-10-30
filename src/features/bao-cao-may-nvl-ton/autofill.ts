import { normalizeProductCodeKey } from '../san-pham/types';
import type { MachineNvlReportLine } from './index';

const quantityFields = [
  'previousQuantity', 'inMachineQuantity', 'inMixerQuantity', 'unblendedQuantity',
  'outsideQuantity', 'standardQuantity', 'quantity'
] as const;

export function mergeMachineNvlAutofillLines(
  defaults: MachineNvlReportLine[],
  source: MachineNvlReportLine[]
): MachineNvlReportLine[] {
  const byCode = new Map(source.filter(line => line.code.trim()).map(line => [normalizeProductCodeKey(line.code), line]));
  const result = defaults.filter(line => line.code.trim()).map(line => {
    const key = normalizeProductCodeKey(line.code);
    const previous = byCode.get(key);
    byCode.delete(key);
    return {
      ...line,
      ...Object.fromEntries(quantityFields.map(field => [field, previous?.[field] ?? '']))
    };
  });
  return [...result, ...Array.from(byCode.values(), line => ({
    ...line, note: '', imageUrl: '', imagePublicId: '', imagePreview: ''
  }))];
}
