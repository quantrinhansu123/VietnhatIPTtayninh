import 'dotenv/config';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const khoUrl = process.env.SUPABASE_KHO_URL;
const khoKey = process.env.SUPABASE_KHO_KEY;
if (!khoUrl || !khoKey) throw new Error('Thiếu SUPABASE_KHO_URL hoặc SUPABASE_KHO_KEY.');

const headers = { apikey: khoKey, Authorization: `Bearer ${khoKey}` };
const created = new Set();
const suffix = String(Date.now()).slice(-6);
const inbound = `PN-20991231-${suffix}`;
const outbound = `PX-20991231-${suffix}`;
const hanging = `PX-20991231-${String(Number(suffix) + 1).padStart(6, '0').slice(-6)}`;
const qrBatch = `PN-20991231-${String(Number(suffix) + 2).padStart(6, '0').slice(-6)}`;
const qrOutboundBatch = `PX-20991231-${String(Number(suffix) + 3).padStart(6, '0').slice(-6)}`;
const shiftFrom = `TEST-${suffix}`;
const shiftTo = `DONE-${suffix}`;

async function dbRows(table, query) {
  const response = await fetch(`${khoUrl}/rest/v1/${table}?${query}`, { headers });
  if (!response.ok) throw new Error(`${table}: ${await response.text()}`);
  return response.json();
}

async function apiRaw(path, method = 'GET', body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

async function api(path, method = 'GET', body) {
  const { response, data } = await apiRaw(path, method, body);
  if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function addCreated(code) { created.add(code); return code; }

const productLine = (quantity = 2) => ({
  code: 'TEST-KHO-ROUTING',
  name: 'San pham test routing',
  unit: 'cai',
  quantity,
  unitPrice: 7
});

try {
  addCreated(inbound);
  await api('/api/kho/luu-phieu', 'POST', {
    loaiPhieu: 'nhap', maPhieu: inbound, loaiKho: 'san_pham', ngayPhieu: '2099-12-31',
    tenKho: 'Kho test routing', nguoiLap: 'Codex test', ca: shiftFrom,
    items: [productLine(2), { ...productLine(1), code: 'TEST-KHO-DELETE' }]
  });

  let inboundLines = await dbRows('nhap_kho', `ma_phieu=eq.${inbound}&select=id,ma_phieu,ma_sp,so_luong`);
  assert.equal(inboundLines.length, 2);
  const deletableLine = inboundLines.find(row => row.ma_sp === 'TEST-KHO-DELETE');
  assert.ok(deletableLine, 'phải tạo được dòng để kiểm tra xóa dòng');
  await api(`/api/kho/dong/${deletableLine.id}`, 'DELETE');
  inboundLines = await dbRows('nhap_kho', `ma_phieu=eq.${inbound}&select=id,ma_sp,so_luong`);
  assert.equal(inboundLines.length, 1);

  await api(`/api/kho/luu-phieu/${inbound}`, 'PUT', {
    loaiPhieu: 'nhap', loaiKho: 'san_pham', ngayPhieu: '2099-12-31',
    tenKho: 'Kho test routing', nguoiLap: 'Codex test', ca: shiftFrom,
    items: [productLine(3)]
  });
  inboundLines = await dbRows('nhap_kho', `ma_phieu=eq.${inbound}&select=so_luong`);
  assert.equal(inboundLines.length, 1);
  assert.equal(Number(inboundLines[0].so_luong), 3);

  const history = await api(`/api/kho/lich-su?ma_phieu=${inbound}`);
  assert.ok(JSON.stringify(history).includes(inbound), 'lịch sử phải đọc từ bảng mới');

  await api('/api/kho/remap-shift', 'POST', { from: shiftFrom, to: shiftTo });
  const remapped = await dbRows('phieu_nhap', `ma_phieu=eq.${inbound}&select=ca`);
  assert.equal(remapped[0]?.ca, shiftTo);

  await api(`/api/kho/phieu/${inbound}/danh-dau-da-in`, 'POST');
  const printed = await dbRows('phieu_nhap', `ma_phieu=eq.${inbound}&select=da_in`);
  assert.equal(printed[0]?.da_in, true);

  addCreated(outbound);
  await api('/api/kho/luu-phieu', 'POST', {
    loaiPhieu: 'xuat', maPhieu: outbound, loaiKho: 'san_pham', ngayPhieu: '2099-12-31',
    tenKho: 'Kho test routing', nguoiLap: 'Codex test', items: [productLine(1)]
  });
  const outboundLines = await dbRows('xuat_kho', `ma_phieu=eq.${outbound}&select=ma_phieu,ma_sp,so_luong`);
  assert.equal(outboundLines.length, 1);

  addCreated(hanging);
  await api('/api/kho/luu-phieu', 'POST', {
    loaiPhieu: 'xuat', maPhieu: hanging, loaiKho: 'nvl', ngayPhieu: '2099-12-31',
    tenKho: 'Kho test routing', nguoiLap: 'Codex test', treo: true,
    items: [{ code: 'TEST-KHO-NVL', name: 'NVL test routing', unit: 'kg', quantity: 1, unitPrice: 2 }]
  });
  const hangingBefore = await dbRows('phieu_xuat', `ma_phieu=eq.${hanging}&select=treo,status`);
  assert.equal(hangingBefore[0]?.treo, true);
  await api(`/api/kho/phieu/${hanging}/xac-nhan-treo`, 'POST');
  const hangingAfter = await dbRows('phieu_xuat', `ma_phieu=eq.${hanging}&select=treo,status`);
  assert.equal(hangingAfter[0]?.treo, false);
  assert.equal(hangingAfter[0]?.status, 'da_chot');

  addCreated(qrBatch);
  const qrCodes = [`TEST-KHO-QR_${suffix}_1`, `TEST-KHO-QR_${suffix}_2`];
  await api('/api/kho/quet-dot', 'POST', {
    loai_phieu: 'nhap', ma_phieu: qrBatch, ngay: '2099-12-31', nhan_su: 'Codex test',
    kho: 'Kho test routing', items: qrCodes.map(ma_sp_quet => ({ ma_sp_quet, ten_sp: 'SP QR test', don_vi: 'cai' }))
  });
  const qrLines = await dbRows('nhap_kho', `ma_phieu=eq.${qrBatch}&select=ma_sp,ma_sp_quet,so_luong`);
  assert.equal(qrLines.length, 2);
  assert.deepEqual(qrLines.map(row => row.ma_sp_quet).sort(), qrCodes.sort());
  assert.ok(qrLines.every(row => row.ma_sp === 'TEST-KHO-QR'), 'nhập thành phẩm phải giữ mã gốc và mã QR đầy đủ');
  const qrHistory = await api(`/api/kho/phieu/${qrBatch}/ma-qr`);
  assert.equal(qrHistory.records.length, 2);

  addCreated(qrOutboundBatch);
  const qrOutboundCodes = [
    `TP-${suffix}_PREFIX_OUT_${suffix}`,
    `TP-${suffix}+PREFIX_OUT_${suffix}`
  ];
  await api('/api/kho/quet-dot', 'POST', {
    loai_phieu: 'xuat', ma_phieu: qrOutboundBatch, ngay: '2099-12-31', nhan_su: 'Codex test',
    kho: 'Kho test routing', items: qrOutboundCodes.map(ma_sp_quet => ({ ma_sp_quet, ten_sp: 'Thanh pham QR test', don_vi: 'cai' }))
  });
  const qrOutboundLines = await dbRows('xuat_kho', `ma_phieu=eq.${qrOutboundBatch}&select=ma_sp,ma_sp_quet,loai,so_luong`);
  assert.equal(qrOutboundLines.length, 2);
  assert.ok(qrOutboundLines.every(row => row.loai === 'san_pham' && Number(row.so_luong) === 1));
  assert.deepEqual(qrOutboundLines.map(row => row.ma_sp_quet).sort(), qrOutboundCodes.sort());
  assert.ok(qrOutboundLines.every(row => row.ma_sp === `TP-${suffix}`), 'mã gốc phải tách khỏi mã QR đầy đủ');
  const qrOutboundHistory = await api(`/api/kho/phieu/${qrOutboundBatch}/ma-qr`);
  assert.deepEqual(qrOutboundHistory.records.map(row => row.ma_sp_day_du).sort(), qrOutboundCodes.sort());

  const price = await api('/api/kho/gia-tb-nhap?ma_npl=TEST-KHO-NVL&thang=2099-12');
  assert.equal(typeof price.don_gia, 'number');
  const lots = await api('/api/kho/lo-ton?ma_npl=TEST-KHO-NVL');
  assert.ok(Array.isArray(lots.lots));

  for (const code of created) await api(`/api/kho/phieu/${code}`, 'DELETE');
  const [inboundAfter, outboundAfter, hangingAfterDelete, qrAfter, qrOutboundAfter] = await Promise.all([
    dbRows('nhap_kho', `ma_phieu=eq.${inbound}&select=id`),
    dbRows('xuat_kho', `ma_phieu=eq.${outbound}&select=id`),
    dbRows('xuat_kho', `ma_phieu=eq.${hanging}&select=id`),
    dbRows('nhap_kho', `ma_phieu=eq.${qrBatch}&select=id`),
    dbRows('xuat_kho', `ma_phieu=eq.${qrOutboundBatch}&select=id`)
  ]);
  assert.equal(inboundAfter.length, 0);
  assert.equal(outboundAfter.length, 0);
  assert.equal(hangingAfterDelete.length, 0);
  assert.equal(qrAfter.length, 0);
  assert.equal(qrOutboundAfter.length, 0);
  console.log(JSON.stringify({ ok: true, tested: ['save', 'update', 'history', 'remap-shift', 'print', 'treo', 'qr-batch-in', 'qr-batch-out-full-code', 'qr-history', 'price', 'lots', 'delete-line', 'delete-slip'], created: [...created] }));
} finally {
  for (const code of created) {
    try { await api(`/api/kho/phieu/${code}`, 'DELETE'); } catch {}
  }
}
