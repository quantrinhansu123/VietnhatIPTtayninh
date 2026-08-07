import type { AuthUser } from './authUser';
import { buildAllowedTabSet, hasFullMenuAccess } from '../features/nhan-su/menuViews';
import { expandImpliedHubTabs, resolveAccessTab } from './tabAccess';
import type { AppTab } from '../routes';
import React, { createContext, useContext, useMemo } from 'react';

export type AppAccessControl = {
  isAdmin: boolean;
  canView: (tab: AppTab | string) => boolean;
  canCreate: (tab: AppTab | string) => boolean;
  canEdit: (tab: AppTab | string) => boolean;
  canDelete: (tab: AppTab | string) => boolean;
};

const allowNothing = () => false;
const AccessControlContext = createContext<AppAccessControl>({
  isAdmin: false,
  canView: allowNothing,
  canCreate: allowNothing,
  canEdit: allowNothing,
  canDelete: allowNothing
});

export function AccessControlProvider({
  user,
  children
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const value = useMemo<AppAccessControl>(() => {
    const isAdmin = Boolean(user.fullAccess) || hasFullMenuAccess(user.role, user.username);
    const viewTabs = expandImpliedHubTabs(buildAllowedTabSet(user.viewPermissions ?? []));
    const editTabs = expandImpliedHubTabs(buildAllowedTabSet(user.editPermissions ?? []));
    const deleteTabs = expandImpliedHubTabs(buildAllowedTabSet(user.deletePermissions ?? []));
    const canView = (tab: AppTab | string) =>
      isAdmin || viewTabs.has(tab) || viewTabs.has(resolveAccessTab(tab));
    const canEdit = (tab: AppTab | string) =>
      isAdmin || editTabs.has(tab) || editTabs.has(resolveAccessTab(tab));
    const canDelete = (tab: AppTab | string) =>
      isAdmin || deleteTabs.has(tab) || deleteTabs.has(resolveAccessTab(tab));

    return {
      isAdmin,
      canView,
      // Cấu hình hiện chưa có cột Thêm riêng; quyền Sửa đồng thời cho phép tạo mới.
      canCreate: canEdit,
      canEdit,
      canDelete
    };
  }, [user]);

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

export function useAccessControl(): AppAccessControl {
  return useContext(AccessControlContext);
}
