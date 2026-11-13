import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transform} from './ong20-merge-transform.mjs';
test('merges alias balances without adding kg per piece or losing unrelated materials',()=>{
  const rows=[{ma_nvl:'ONG-20cm',so_luong_ton:20,trong_luong_quy_doi_kg:0.053},{ma_nvl:'ONG-19.5CM',so_luong_ton:19,trong_luong_quy_doi_kg:0.053},{ma_nvl:'ONG-30CM',so_luong_ton:4}];
  const result=transform(rows);
  assert.equal(result.length,2);assert.equal(result[0].so_luong_ton,39);assert.equal(result[0].trong_luong_quy_doi_kg,0.053);assert.equal(result[1].so_luong_ton,4);
  assert.equal(rows[0].ma_nvl,'ONG-20cm');
});
test('report rows sum exports and finished kg, keeping separate source slips',()=>{
  const result=transform([{materialCode:'ONG-20cm',orderCode:'LSX079',weightKg:3.71,klThucTeKg:0,chenhLechKg:3.71},{materialCode:'ONG-19.5CM',orderCode:'LSX079',weightKg:1.01,klThucTeKg:10.97,chenhLechKg:-9.96}]);
  assert.equal(result.length,1);assert.equal(result[0].weightKg,4.72);assert.equal(result[0].klThucTeKg,10.97);assert.equal(result[0].chenhLechKg,-6.25);
  assert.equal(transform([{itemCode:'ONG-20cm',slipCode:'A',quantity:2},{itemCode:'ONG-19.5CM',slipCode:'B',quantity:3}]).length,2);
});
