import { normalizeHrBranches } from '../features/_shared/hr';
import {
  parsePermissionSettings,
  resolveLoginPermissions
} from '../features/cai-dat-thoi-gian/permissionKeys';
import { grantResolvedAccess, type AuthUser } from './authUser';

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function mapSettingsRows(raw: unknown) {
  const settings = Array.isArray((raw as { settings?: unknown })?.settings)
    ? ((raw as { settings: unknown[] }).settings as Record<string, unknown>[])
    : [];
  return settings.map(item => ({
    id: String(item?.id ?? ''),
    code: String(item?.ma_cai_dat ?? item?.code ?? ''),
    name: String(item?.ten_cai_dat ?? item?.ten ?? item?.name ?? ''),
    loaiCaiDat: String(item?.loai_cai_dat ?? item?.loai ?? ''),
    group: String(item?.nhom ?? item?.group ?? ''),
    note: String(item?.ghi_chu ?? item?.note ?? '')
  }));
}

/**
 * Nạp lại quyền từ ma trận Phân quyền + vi_tri_gan theo username phiên hiện tại.
 * Không cần mật khẩu (đã đăng nhập). Trả null nếu không tìm thấy / lỗi mạng.
 */
export async function refreshAuthUserPermissions(username: string): Promise<AuthUser | null> {
  const user = normalizeUsername(username);
  if (!user) return null;

  try {
    const [staffRes, settingsRes] = await Promise.all([
      fetch('/api/nhan-su?format=groups&scope=all'),
      fetch('/api/cai-dat')
    ]);
    const staffData = await staffRes.json().catch(() => ({}));
    const settingsData = await settingsRes.json().catch(() => ({}));
    if (!staffRes.ok) return null;

    const members = normalizeHrBranches(staffData).flatMap(branch =>
      branch.departments.flatMap(department =>
        department.members.map(member => ({
          member,
          departmentName: department.name
        }))
      )
    );

    const matched = members.find(
      ({ member }) => member.username && normalizeUsername(member.username) === user
    );
    if (!matched) return null;

    const permissionSettings = settingsRes.ok
      ? parsePermissionSettings(mapSettingsRows(settingsData))
      : [];

    const resolved = resolveLoginPermissions({
      permissionSettings,
      assignedPositions: matched.member.assignedPositions,
      departmentName: matched.departmentName,
      hrRoleOrPosition: matched.member.role || matched.member.position || '',
      memberViewPermissions: matched.member.viewPermissions || []
    });

    return grantResolvedAccess({
      id: matched.member.id,
      name: matched.member.name,
      username: matched.member.username || user,
      role: matched.member.role || 'Nhân sự',
      viewPermissions: resolved.viewPermissions,
      editPermissions: resolved.editPermissions,
      deletePermissions: resolved.deletePermissions
    });
  } catch {
    return null;
  }
}
