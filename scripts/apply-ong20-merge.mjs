import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import dotenv from 'dotenv';
import {transform,mergeQuantities,TARGET} from './ong20-merge-transform.mjs';
dotenv.config({quiet:true});
const config={main:['SUPABASE_URL','SUPABASE_SERVICE_KEY'],weighing:['SUPABASE_WEIGHING_URL','SUPABASE_WEIGHING_SERVICE_KEY'],stock:['SUPABASE_KIEM_KHO_URL','SUPABASE_KIEM_KHO_SERVICE_KEY'],pending:['SUPABASE_KHO_CHO_URL','SUPABASE_KHO_CHO_SERVICE_KEY'],warehouse:['SUPABASE_KHO_URL','SUPABASE_KHO_KEY']};
const apply=process.argv.includes('--apply');
const scan=JSON.parse(fs.readFileSync('backups/ong20-merge-scan.json'));
const plan=[];
const backup='backups/ong20-merge-write-backup.jsonl';
async function request(db,table,params={},method='GET',body) {
  const [u,k]=config[db],key=process.env[k];
  const url=new URL(`${process.env[u]}/rest/v1/${table}`);
  for(const [name,value]of Object.entries(params)) url.searchParams.set(name,value);
  const response=await fetch(url,{method,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`} : {}),'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw Error(`${db}/${table} ${method}: ${response.status} ${await response.text()}`);
  return response.json();
}
for(const match of scan) {
  const {db,table,pk}=match;
  const [row]=await request(db,table,{[pk]:`eq.${match.row[pk]}`,select:'*'});
  if(!row || !/ONG-20CM/i.test(JSON.stringify(row)))continue;
  const renamed=transform(row);
  let target;
  const codeCol=['ma_nvl','ma_npl'].find(k=>/^ONG-20CM$/i.test(row[k]||''));
  if(codeCol && (table==='kho_nvl'||table==='kho'||table==='bao_cao_tieu_hao_nguyen_vat_lieu'||table==='du_lieu_trong_bao_cao_hang_loi_hong')) {
    const filters={[codeCol]:`eq.${TARGET}`,select:'*'};
    const scopes=table==='kho_nvl'?['ten_kho']:['khoa_on_dinh','ngay','ca','may','ma_lenh','group_key','nhom','don_vi','ten_kho'];
    for(const col of scopes)if(col in row)filters[col]=row[col]==null?'is.null':`eq.${row[col]}`;
    const targets=await request(db,table,filters);
    if(targets.length>1)throw Error(`Multiple canonical targets ${db}/${table}`);
    target=targets[0];
  }
  const result=target ? mergeQuantities(target,renamed) : renamed;
  const base=target||row;
  const patch=Object.fromEntries(Object.entries(result).filter(([key,value])=>![pk,'created_at','updated_at'].includes(key)&&!isDeepStrictEqual(value,base[key])));
  plan.push({db,table,pk,oldId:row[pk],targetId:target?.[pk],patch});
  if(apply) {
    fs.appendFileSync(backup,JSON.stringify({db,table,pk,source:row,target:target||null})+'\n');
    const filter={[pk]:`eq.${base[pk]}`};
    if(base.updated_at)filter.updated_at=`eq.${base.updated_at}`;
    const updated=await request(db,table,filter,'PATCH',patch);
    if(updated.length!==1)throw Error(`Concurrent change ${db}/${table}/${base[pk]}`);
    if(target) {
      const removeFilter={[pk]:`eq.${row[pk]}`};
      if(row.updated_at)removeFilter.updated_at=`eq.${row.updated_at}`;
      const deleted=await request(db,table,removeFilter,'DELETE');
      if(deleted.length!==1)throw Error('Concurrent source change');
    }
    const [saved]=await request(db,table,{[pk]:`eq.${base[pk]}`,select:'*'});
    for(const [key,value]of Object.entries(patch))if(!isDeepStrictEqual(value,saved[key]))throw Error(`Verification failed ${db}/${table}/${key}`);
  }
}
fs.writeFileSync(`backups/ong20-merge-${apply?'applied':'plan'}.json`,JSON.stringify(plan,null,2));
console.log(JSON.stringify(plan.reduce((o,x)=>{const key=`${x.db}/${x.table}`;o[key]??={updated:0,merged:0};o[key].updated++;if(x.targetId)o[key].merged++;return o;},{}),null,2));
console.log(apply?'Applied and verified':'Read-only plan');
