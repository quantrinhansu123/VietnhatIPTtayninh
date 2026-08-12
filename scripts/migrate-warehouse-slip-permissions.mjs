import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const SETTINGS_TABLE = process.env.SUPABASE_SETTINGS_TABLE || 'cai_dat_thoi_gian';
const LEGACY_TABS = new Set(['warehouse-slip', 'warehouse-history']);
const MATERIAL_TAB = {
  tab: 'warehouse-slip-vat-tu',
  label: 'Phiếu xuất nhập kho - Vật tư'
};
const FINISHED_GOODS_TAB = {
  tab: 'warehouse-slip-thanh-pham',
  label: 'Phiếu xuất nhập kho - Thành phẩm'
};

const RESPONSIBLE_ROLES = new Map([
  ['VAN_PHONG__THU_KHO_VAT_TU_KE_TOAN_SAN_XUAT', [MATERIAL_TAB]],
  ['VAN_PHONG__THU_KHO_THANH_PHAM', [FINISHED_GOODS_TAB]]
]);

function replaceWarehouseTabs(groups, replacements) {
  if (!Array.isArray(groups)) return [];
  let hadLegacyPermission = false;
  const next = groups.map(group => {
    const children = Array.isArray(group?.children) ? group.children : [];
    if (children.some(child => LEGACY_TABS.has(String(child?.tab || '')))) {
      hadLegacyPermission = true;
    }
    return {
      ...group,
      children: children.filter(child => !LEGACY_TABS.has(String(child?.tab || '')))
    };
  });

  if (!hadLegacyPermission || replacements.length === 0) return next;
  const warehouseGroup = next.find(group => group?.menu === 'factory-kho')
    || next.find(group => group?.menu === 'facility-management');
  if (!warehouseGroup) {
    next.push({ menu: 'factory-kho', label: 'Kho', children: replacements.map(item => ({ ...item })) });
    return next;
  }
  const existing = new Set(warehouseGroup.children.map(child => String(child?.tab || '')));
  for (const item of replacements) {
    if (!existing.has(item.tab)) warehouseGroup.children.push({ ...item });
  }
  return next;
}

function migratePermissionNote(rawNote) {
  let note;
  try {
    note = JSON.parse(String(rawNote || '{}'));
  } catch {
    return null;
  }
  const permissionKey = String(note.permissionKey || '').trim().toUpperCase();
  const responsibleTabs = RESPONSIBLE_ROLES.get(permissionKey) || [];

  // Người từng có quyền xem tiếp tục xem được cả hai kho; riêng hai thủ kho chỉ xem đúng kho phụ trách.
  const viewTabs = responsibleTabs.length > 0 ? responsibleTabs : [MATERIAL_TAB, FINISHED_GOODS_TAB];
  note.viewPermissions = replaceWarehouseTabs(note.viewPermissions, viewTabs);

  // Chỉ hai vai trò thủ kho được tạo/sửa/xóa phiếu, mỗi vai trò đúng một nhóm kho.
  note.editPermissions = replaceWarehouseTabs(
    note.editPermissions ?? note.quyen_sua,
    responsibleTabs
  );
  note.deletePermissions = replaceWarehouseTabs(
    note.deletePermissions ?? note.quyen_xoa,
    responsibleTabs
  );
  delete note.quyen_sua;
  delete note.quyen_xoa;
  return note;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY/SUPABASE_KEY.');

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: rows, error } = await supabase.from(SETTINGS_TABLE).select('*');
if (error) throw error;

const changes = [];
for (const row of rows || []) {
  const code = String(row.ma_cai_dat ?? row.code ?? '');
  if (!code.startsWith('PERM_KEY_')) continue;
  const nextNote = migratePermissionNote(row.ghi_chu ?? row.note);
  if (!nextNote) continue;
  const serialized = JSON.stringify(nextNote);
  if (serialized === String(row.ghi_chu ?? row.note ?? '')) continue;
  changes.push({ id: row.id, code, note: serialized });
}

console.log(`${APPLY ? 'Áp dụng' : 'Dry-run'}: ${changes.length} vai trò cần cập nhật.`);
for (const change of changes) console.log(`- ${change.code}`);

if (!APPLY) {
  console.log('Chạy lại với --apply để ghi thay đổi.');
  process.exit(0);
}

for (const change of changes) {
  const { error: updateError } = await supabase
    .from(SETTINGS_TABLE)
    .update({ ghi_chu: change.note })
    .eq('id', change.id);
  if (updateError) throw new Error(`${change.code}: ${updateError.message}`);
}
console.log('Đã migrate phân quyền phiếu xuất nhập kho thành công.');
