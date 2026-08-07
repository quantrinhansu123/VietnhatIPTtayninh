# cai_dat_thoi_gian

| **Bảng** | `cai_dat_thoi_gian` |
| **Tab** | `settings` → `/cai-dat` |
| **SQL** | `supabase-cai-dat-thoi-gian.sql` |

**API:** `server.ts` — `/api/cai-dat` (xem `registry.ts` / grep route)  
**UI:** `src/features/cai-dat-thoi-gian/index.tsx` — `SettingsPanel`  
**Utils:** `src/utils/shiftSettings.ts`, `permissionKeys.ts`, `staffAssignments.ts`, `RolePermissionsMatrix.tsx`, `StaffRoleAssignmentPanel.tsx`, `src/features/nhan-su/menuViews.ts`

Cấu hình ca, khung giờ — ảnh hưởng phiếu cân và báo cáo. Lưu vào bảng Supabase **`cai_dat_thoi_gian`**.

Form **Thêm/Sửa** mục Thời gian: **Giờ bắt đầu / Giờ kết thúc** dùng sổ xuống `SETTING_TIME_OPTIONS` (bước 15 phút + `23:59`). Giờ lẻ cũ vẫn hiện trong list khi sửa.

Nếu F5 mất dữ liệu / danh sách trống: chạy `supabase-cai-dat-thoi-gian.sql` hoặc `supabase-migrate-2026-08-05-hom-nay.sql` trên đúng project Supabase (`.env`), rồi reload. Dòng `PERM_KEY_*` không hiện ở tab hệ thống — xem tab **Phân quyền**.

## Quyền giao diện

Đăng nhập lấy quyền menu từ ma trận **Phân quyền**:

1. Ưu tiên các vị trí trong `nhan_su.vi_tri_gan` (tab Gán quyền nhân sự) → gộp (union) Xem/Sửa/Xóa
2. Không có gán → theo phòng ban + chức vụ HR (KEY như `SAN_XUAT__QUAN_DOC`)
3. Có PERM trên hệ thống mà KEY không khớp → **không** dùng `quyen_xem` cũ (tránh full menu sai bảng)
4. Mỗi lần mở app: `refreshAuthUserPermissions` nạp lại ma trận (không kẹt localStorage)

| Cột ma trận | Hiệu lực UI |
|-------------|-------------|
| **Xem** | Hiện mục menu / vào tab (`App.tsx`, drawer, alias form→list). Hub `report-forms` / `report-lists` / `production-reports` tự mở các card con bên trong. |
| **Sửa** | Hiện nút Thêm + Sửa (`useTabAccess` → `canCreate`/`canEdit`) |
| **Xóa** | Hiện nút Xóa (`canDelete`) |

Helper: `src/app/useTabAccess.ts`, `src/app/tabAccess.ts` (`HUB_IMPLIED_TABS`, `expandImpliedHubTabs`), `src/app/refreshAuthPermissions.ts`, `src/app/accessControl.tsx`.

## Các tab

| Tab | Lưu DB | Chi tiết |
|-----|--------|----------|
| Cài đặt hệ thống | `cai_dat_thoi_gian` | Thời gian / Ca máy / … |
| Phân quyền + Vai trò | `cai_dat_thoi_gian` · `PERM_KEY_…` | JSON: department, position, view/edit/delete |
| **Gán quyền nhân sự** | **`nhan_su.vi_tri_gan`** theo `ma_nhan_su` | Không ghi STAFF_ASSIGN vào cai_dat |

Xem thêm: [nhan_su.md](./nhan_su.md)
