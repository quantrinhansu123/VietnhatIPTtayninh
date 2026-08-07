import {
  mergeStaffViewPermissions,
  normalizeStaffViewPermissions,
  type StaffViewPermissions
} from '../nhan-su/menuViews';
import type { StaffAssignablePosition } from './staffAssignments';

export type PermissionSettingLike = {
  id: string;
  code: string;
  name: string;
  loaiCaiDat: string;
  group: string;
  note: string;
};

export type PermissionKeySetting = {
  id: string;
  code: string;
  name: string;
  department: string;
  position: string;
  permissionKey: string;
  viewPermissions: StaffViewPermissions;
  editPermissions: StaffViewPermissions;
  deletePermissions: StaffViewPermissions;
  note: string;
};

function slugKeyPart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function buildPermissionKey(department: string, position: string) {
  const dept = slugKeyPart(department || 'khong_phong_ban');
  const pos = slugKeyPart(position || 'khong_vi_tri');
  return `${dept}__${pos}`.toUpperCase();
}

export function parsePermissionSettings(settings: PermissionSettingLike[]): PermissionKeySetting[] {
  return settings
    .map((setting): PermissionKeySetting | null => {
      const groupText = `${setting.group || ''} ${setting.loaiCaiDat || ''}`.toLowerCase();
      const looksLikePermission =
        groupText.includes('phân quyền') ||
        groupText.includes('phan quyen') ||
        setting.code.startsWith('PERM_KEY_');
      if (!looksLikePermission) return null;

      let parsedNote: Record<string, unknown> = {};
      try {
        parsedNote = setting.note ? (JSON.parse(setting.note) as Record<string, unknown>) : {};
      } catch {
        parsedNote = {};
      }

      const department = String(parsedNote.department ?? '').trim();
      const position = String(parsedNote.position ?? '').trim();
      const permissionKey =
        String(parsedNote.permissionKey ?? '').trim() || buildPermissionKey(department, position);
      if (!department || !position) return null;

      return {
        id: setting.id,
        code: setting.code,
        name: setting.name,
        department,
        position,
        permissionKey,
        viewPermissions: normalizeStaffViewPermissions(parsedNote.viewPermissions),
        editPermissions: normalizeStaffViewPermissions(
          parsedNote.editPermissions ?? parsedNote.quyen_sua
        ),
        deletePermissions: normalizeStaffViewPermissions(
          parsedNote.deletePermissions ?? parsedNote.quyen_xoa
        ),
        note: setting.note || ''
      };
    })
    .filter((item): item is PermissionKeySetting => Boolean(item));
}

function findPermissionSettingByKey(
  settings: PermissionKeySetting[],
  permissionKey: string
): PermissionKeySetting | undefined {
  const key = permissionKey.trim().toUpperCase();
  if (!key) return undefined;
  return settings.find(item => item.permissionKey.trim().toUpperCase() === key);
}

/**
 * Quyền hiệu lực khi đăng nhập:
 * 1) Ưu tiên các vị trí trong `nhan_su.vi_tri_gan`
 * 2) Không có → phòng ban + chức vụ HR
 * 3) Khớp thêm theo department/position (slug) nếu KEY lệch chữ hoa
 * 4) Có intent vai trò + đã có PERM trên hệ thống mà không khớp → rỗng (không dùng quyen_xem cũ)
 * 5) Không có PERM nào trên hệ thống → fallback `quyen_xem` hồ sơ (chỉ Xem)
 */
export function resolveLoginPermissions(input: {
  permissionSettings: PermissionKeySetting[];
  assignedPositions?: StaffAssignablePosition[];
  departmentName: string;
  hrRoleOrPosition: string;
  memberViewPermissions?: StaffViewPermissions;
}): {
  viewPermissions: StaffViewPermissions;
  editPermissions: StaffViewPermissions;
  deletePermissions: StaffViewPermissions;
} {
  const {
    permissionSettings,
    assignedPositions = [],
    departmentName,
    hrRoleOrPosition,
    memberViewPermissions = []
  } = input;

  const keys: string[] = [];
  const pushKey = (key: string) => {
    const normalized = key.trim().toUpperCase();
    if (normalized && !keys.includes(normalized)) keys.push(normalized);
  };

  for (const position of assignedPositions) {
    pushKey(String(position.permissionKey || ''));
    pushKey(buildPermissionKey(position.department, position.position));
  }
  if (keys.length === 0) {
    pushKey(buildPermissionKey(departmentName, hrRoleOrPosition));
  }

  const matched = new Map<string, PermissionKeySetting>();
  for (const key of keys) {
    const byKey = findPermissionSettingByKey(permissionSettings, key);
    if (byKey) matched.set(byKey.permissionKey.toUpperCase(), byKey);
  }

  // Khớp phụ: slug phòng+vị trí trong ma trận == key đã thử
  for (const setting of permissionSettings) {
    const settingKey = buildPermissionKey(setting.department, setting.position).toUpperCase();
    if (keys.includes(settingKey) || keys.includes(setting.permissionKey.trim().toUpperCase())) {
      matched.set(setting.permissionKey.toUpperCase(), setting);
    }
  }

  const matchedList = [...matched.values()];
  if (matchedList.length > 0) {
    return {
      viewPermissions: mergeStaffViewPermissions(...matchedList.map(item => item.viewPermissions)),
      editPermissions: mergeStaffViewPermissions(...matchedList.map(item => item.editPermissions)),
      deletePermissions: mergeStaffViewPermissions(...matchedList.map(item => item.deletePermissions))
    };
  }

  const hasRoleIntent =
    assignedPositions.length > 0 ||
    Boolean(String(departmentName || '').trim() && String(hrRoleOrPosition || '').trim());

  // Đã cấu hình Phân quyền mà không khớp vai trò → không lấy quyen_xem legacy (dễ full menu sai bảng).
  if (hasRoleIntent && permissionSettings.length > 0) {
    return {
      viewPermissions: [],
      editPermissions: [],
      deletePermissions: []
    };
  }

  return {
    viewPermissions: memberViewPermissions,
    editPermissions: [],
    deletePermissions: []
  };
}
