import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the server's actual pure functions without starting Express or connecting to a DB.
const source = fs.readFileSync('server.ts', 'utf8');
const ast = ts.createSourceFile('server.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['parseWarehouseSlipLines', 'parseOptionalMaterialNumber', 'parseMaterialText', 'roundWarehouseMoney', 'mapKhoLineToMovement', 'parseWarehouseStorageType', 'inferWarehouseKindFromKhoName']);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
const context = vm.createContext({});
vm.runInContext(ts.transpile(functions), context);
for (const type of ['nhap', 'xuat']) {
  const parsed = context.parseWarehouseSlipLines([
    { code: 'NVL-1', quantity: 2, unitPrice: 100, lineNote: '  Lot A  ' },
    { code: 'NVL-2', quantity: 3, unitPrice: 200, lineNote: 'Lot B' },
    { code: 'NVL-3', quantity: 1 }
  ], 'nvl', type);
  assert.equal(parsed.items[0].lineNote, 'Lot A');
  assert.equal(parsed.items[1].lineNote, 'Lot B');
  assert.equal(parsed.items[2].lineNote, '');
  const movement = context.mapKhoLineToMovement({ loai: 'nvl', ghi_chu_dong: parsed.items[0].lineNote }, { kho: 'nvl', ghi_chu: 'Header note' }, type);
  assert.equal(movement.ghi_chu_dong, 'Lot A');
  assert.equal(movement.ghi_chu, 'Header note');
}
console.log('PASS: inbound/outbound line notes, empty notes, separate header notes');
