import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MachineNvlReportLine } from './index';
import { mergeMachineNvlAutofillLines } from './autofill';

const line = (code: string, quantity = ''): MachineNvlReportLine => ({
  key: code, code, name: `Tên ${code}`, unit: 'kg', unitWeightKg: '1', materialType: 'nhua',
  previousQuantity: '', inMachineQuantity: '', inMixerQuantity: '', unblendedQuantity: '',
  outsideQuantity: '', standardQuantity: '', quantity, note: '',
  imageUrl: '', imagePublicId: '', imagePreview: ''
});

test('autofill keeps preset order and metadata, fills matching quantities, appends extra materials', () => {
  const defaults = [line('A'), line('B'), line('C')];
  const source = [
    { ...line(' c ', '12'), inMachineQuantity: '2', inMixerQuantity: '10', name: 'Tên cũ', unit: 'bao', note: 'Ghi chú cũ', imageUrl: 'old-photo' },
    line('D', '8'), line('a', '0')
  ];
  const original = structuredClone({ defaults, source });
  const result = mergeMachineNvlAutofillLines(defaults, source);
  assert.deepEqual(result.map(row => row.code), ['A', 'B', 'C', 'D']);
  assert.equal(result[0].quantity, '0');
  assert.equal(result[1].quantity, '');
  assert.equal(result[2].quantity, '12');
  assert.equal(result[2].inMachineQuantity, '2');
  assert.equal(result[2].inMixerQuantity, '10');
  assert.equal(result[2].name, 'Tên C');
  assert.equal(result[2].unit, 'kg');
  assert.equal(result[2].note, '');
  assert.equal(result[2].imageUrl, '');
  assert.equal(result[3].quantity, '8');
  assert.deepEqual({ defaults, source }, original);
});

test('material missing from source stays visible with all numeric fields blank', () => {
  const current = { ...line('A', '99'), previousQuantity: '50', inMachineQuantity: '99' };
  const result = mergeMachineNvlAutofillLines([current], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].code, 'A');
  assert.equal(result[0].quantity, '');
  assert.equal(result[0].previousQuantity, '');
  assert.equal(result[0].inMachineQuantity, '');
});

test('end-of-shift reference quantities follow the same default layout without duplicate extras', () => {
  const source = [
    { ...line('B'), previousQuantity: '15' },
    { ...line('D'), previousQuantity: '5' },
    { ...line(' d '), previousQuantity: '5' }
  ];
  const result = mergeMachineNvlAutofillLines([line('A'), line('B')], source);
  assert.equal(result.length, 3);
  assert.equal(result[0].previousQuantity, '');
  assert.equal(result[1].previousQuantity, '15');
  assert.equal(result[1].quantity, '');
  assert.equal(result[2].previousQuantity, '5');
});
