import { useAccessControl } from './accessControl';
import { resolveAccessTab } from './tabAccess';
import type { AppTab } from '../routes';

/** Quyền Xem / Thêm / Sửa / Xóa theo tab trong ma trận Phân quyền. */
export function useTabAccess(tab: AppTab | string) {
  const access = useAccessControl();
  const accessTab = resolveAccessTab(tab);
  return {
    isAdmin: access.isAdmin,
    canView: access.canView(accessTab),
    canCreate: access.canCreate(accessTab),
    canEdit: access.canEdit(accessTab),
    canDelete: access.canDelete(accessTab)
  };
}
