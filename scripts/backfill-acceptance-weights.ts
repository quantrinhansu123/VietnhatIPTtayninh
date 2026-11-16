import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { calculateAcceptanceWeightSnapshot } from '../src/utils/acceptanceWeightSnapshot';
import { buildCanTuDongFilmKgByProductCode, type CanTuDongWeightRow } from '../src/utils/canTuDongWeights';
import { normalizeProductCodeKey, parseProductNplItems } from '../src/features/san-pham/types';

dotenv.config({ quiet: true });
const apply = process.argv.includes('--apply');
const base = process.env.LOCAL_API_URL || 'http://127.0.0.1:3001';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
const table = process.env.SUPABASE_ACCEPTANCE_REPORTS_TABLE || 'bao_cao_nghiem_thu';
async function getJson(url: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(120000) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      if (attempt >= 2) throw error;
      await delay(1500);
    }
  }
}

async function main() {
  const products = (await getJson('/api/san-pham?format=table')).products;
  if (!Array.isArray(products) || !products.length) throw new Error('Thiếu danh mục SP, không tính màng.');
  const catalog = products.map((p: Record<string, unknown>) => ({
    code: String(p.ma_sp || ''), newCode: String(p.ma_sp_moi || ''), amisCode: String(p.ma_amis || ''),
    name: String(p.ten_sp || ''), nplItems: parseProductNplItems(p.npl_phan_tram)
  }));
  const films = buildCanTuDongFilmKgByProductCode(catalog);
  const byCode = new Map(catalog.flatMap(p => [p.code, p.newCode, p.amisCode].filter(Boolean).map(code => [normalizeProductCodeKey(code), p] as const)));
  const reports: Record<string, any>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(from, from + 999);
    if (error) throw error;
    reports.push(...data);
    if (data.length < 1000) break;
  }
  const eligible = reports.filter(r => ['Thành phẩm', 'Gia công'].includes(r.loai_vat_tu || 'Thành phẩm'));
  const groupKey = (r: Record<string, any>) => [r.ngay, r.ca, r.ma_may || r.ten_may, normalizeProductCodeKey(r.mat_hang)].join('|');
  const groups = new Map<string, number>();
  eligible.forEach(r => groups.set(groupKey(r), (groups.get(groupKey(r)) || 0) + 1));
  const recordsByDay = new Map<string, CanTuDongWeightRow[]>();
  const failures: string[] = [];
  let updated = 0, alreadySaved = 0, missing = 0, ambiguous = 0;
  const backup = path.join('backups', `acceptance-weights-${Date.now()}.jsonl`);
  if (apply) fs.mkdirSync('backups', { recursive: true });
  for (const report of eligible) {
    if (report.trong_luong_dong_bo_luc && report.trong_luong_nhua != null && report.trong_luong_mang != null) { alreadySaved++; continue; }
    if ((groups.get(groupKey(report)) || 0) > 1) { ambiguous++; continue; }
    try {
      if (!recordsByDay.has(report.ngay)) {
        const params = new URLSearchParams({ from: report.ngay, to: report.ngay, dateBy: 'ngay', all: '1', images: '0' });
        const payload = await getJson(`/api/can-tu-dong?${params}`);
        if (!Array.isArray(payload.records)) throw new Error('Thiếu dữ liệu cân AI.');
        recordsByDay.set(report.ngay, payload.records);
      }
      const product = byCode.get(normalizeProductCodeKey(report.mat_hang));
      if (!product) { missing++; continue; }
      const snapshot = calculateAcceptanceWeightSnapshot(recordsByDay.get(report.ngay)!, report as any, films,
        [report.mat_hang, product.code, product.newCode, product.amisCode, product.name].filter(Boolean));
      if (!snapshot.so_lan_can) { missing++; continue; }
      if (apply) {
        fs.appendFileSync(backup, JSON.stringify({ id: report.id, before: report, snapshot }) + '\n');
        // Ghi trực tiếp đúng các cột snapshot để không phụ thuộc dev server khởi động lại.
        const { data: saved, error } = await db.from(table)
          .update({ ...snapshot, trong_luong_dong_bo_luc: new Date().toISOString() })
          .eq('id', report.id).select('id,trong_luong,so_luong').single();
        if (error) throw error;
        if (Number(saved.trong_luong) !== Number(report.trong_luong) || Number(saved.so_luong) !== Number(report.so_luong)) {
          throw new Error('Trọng lượng tổng / SL đã thay đổi ngoài quá trình đồng bộ.');
        }
      }
      updated++;
    } catch (error: any) { failures.push(`${report.id}: ${error.message}`); }
  }
  console.log(JSON.stringify({ apply, total: reports.length, eligible: eligible.length, updated, alreadySaved, missing, ambiguous, failures, backup: apply ? backup : null }, null, 2));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
