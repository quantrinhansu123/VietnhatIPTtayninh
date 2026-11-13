import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const configs = [
  ['main', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
  ['weighing', 'SUPABASE_WEIGHING_URL', 'SUPABASE_WEIGHING_SERVICE_KEY'],
  ['stock', 'SUPABASE_KIEM_KHO_URL', 'SUPABASE_KIEM_KHO_SERVICE_KEY'],
  ['pending', 'SUPABASE_KHO_CHO_URL', 'SUPABASE_KHO_CHO_SERVICE_KEY'],
  ['warehouse', 'SUPABASE_KHO_URL', 'SUPABASE_KHO_KEY']
];
const oldPattern = /ONG-20CM/i;
const results = process.argv.includes('--warehouse-only') ? JSON.parse(fs.readFileSync('backups/ong20-merge-scan.json')) : [];
for (const [db, urlEnv, keyEnv] of configs) {
  if (process.argv.includes('--warehouse-only') && db !== 'warehouse') continue;
  const key = process.env[keyEnv];
  const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  async function get(table, params) {
    const url = new URL(`${process.env[urlEnv]}/rest/v1/${table}`);
    for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
    const response = await fetch(url, {headers});
    if (!response.ok) throw new Error(`${db}/${table}: ${response.status} ${await response.text()}`);
    return response.json();
  }
  let definitions;
  if (db === 'warehouse') {
    definitions = {};
    for (const table of ['kho','nhap_kho','xuat_kho','phieu_nhap','phieu_xuat']) {
      const sample = await get(table, {select:'*', limit:'1'});
      definitions[table] = {properties:Object.fromEntries(Object.entries(sample[0] || {}).map(([k,v]) => [k,{format: typeof v === 'object' && v !== null ? 'jsonb' : /^(ma_|ten_|ghi_chu|ly_do|qr_code)/.test(k) ? 'text' : 'other'}]))};
    }
  } else definitions = JSON.parse(fs.readFileSync(`backups/material-merge-schema-${db}.json`)).definitions;
  for (const [table, def] of Object.entries(definitions)) {
    if (/^(nhan_su|khach_hang|roll_scale_secrets|devices|measurements|anh_can_cho_ai|ca_can|rolls|danh_sach_xe|nhat_ky_xe|nhat_ky_km_xe|doi_chieu_lai_xe|thu_tien_khach_hang|chi_phi_xe|tuyen_giao_hang_xe)$/.test(table)) continue;
    const props = def.properties || {};
    const pk = Object.keys(props).find(k=>props[k].description?.includes('<pk/>')) || ('id' in props ? 'id' : null);
    if (!pk) continue;
    const textCols = Object.keys(props).filter(k=> /^(text|character varying)$/.test(props[k].format || ''));
    const jsonCols = Object.keys(props).filter(k=> /json/.test(props[k].format || ''));
    const ids = new Set();
    if (textCols.length) {
      for(let offset=0;;offset+=500) {
        const rows = await get(table,{select:'*',or:`(${textCols.map(c=>`${c}.ilike.*ONG-20CM*`).join(',')})`,order:`${pk}.asc`,offset:String(offset),limit:'500'});
        for(const row of rows) {ids.add(String(row[pk]));results.push({db,table,pk,row});}
        if(rows.length<500)break;
      }
    }
    if (jsonCols.length) {
      for(let offset=0;;offset+=200) {
        const rows = await get(table,{select:[pk,...jsonCols].join(','),order:`${pk}.asc`,offset:String(offset),limit:'200'});
        for(const row of rows) if(!ids.has(String(row[pk])) && oldPattern.test(JSON.stringify(row))) {
          const full = await get(table,{select:'*',[pk]:`eq.${row[pk]}`});
          results.push({db,table,pk,row:full[0]}); ids.add(String(row[pk]));
        }
        if(rows.length<200)break;
      }
    }
    if(ids.size)console.log(`${db}/${table}: ${ids.size}`);
    fs.writeFileSync('backups/ong20-merge-scan.json',JSON.stringify(results,null,2));
  }
  console.log(`${db}: scan complete`);
}
console.log(`Matched ${results.length} records`);
