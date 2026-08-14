# Kho: rà soát việc 1-2 và kế hoạch + triển khai việc 3 (phân quyền Phiếu xuất nhập kho)

## 0. Bối cảnh 3 việc được giao

1. Kho hàng hỏng tự động nhảy khi nhập báo cáo hàng hỏng.
2. Thêm Kho hàng hóa + Kho công cụ dụng cụ + Kho gia công.
3. Phân quyền Phiếu xuất nhập kho — Kho vật tư và Kho thành phẩm do 2 người khác nhau phụ trách theo đúng luồng nghiệp vụ.

## 1. Rà soát việc 1 — Kho hàng hỏng tự động nhập

**Đã làm, đúng yêu cầu.**

- `supabase-bao-cao-hang-hong-tu-dong-nhap-kho.sql`: thêm kho **"Kho hàng hỏng"** vào `quan_ly_kho` (idempotent), thêm cột `phieu_xuat_nhap_kho.id_bao_cao_hang_hong` (khóa liên kết 1‑1, có unique index), và trigger `bao_cao_hang_hong_tu_dong_nhap_kho` chạy sau **insert/update/delete** trên `bao_cao_hang_hong`:
  - Insert/update báo cáo → upsert đúng 1 dòng phiếu **nhập** vào `phieu_xuat_nhap_kho` (`loai_kho='hang_hong'`, `loai_phieu='nhap'`), map loại hàng hỏng → mã/tên NVL, số lượng, đơn vị.
  - Báo cáo cũ không có số lượng (chỉ ghi chú) → không sinh dòng tồn kho rác.
  - Xóa báo cáo → xóa đúng dòng phiếu đã sinh.
- Frontend: thêm `WarehouseKind = 'hang_hong'`, tab riêng **"Kho hàng hỏng"** trong Lịch sử xuất nhập kho, menu card riêng (`damaged-goods-warehouse` → `/kho-hang-hong`), filter API `khoFilter === 'hang_hong'` (server.ts), nhãn in phiếu.
- **Việc còn thiếu để chạy được trên production:** file SQL nằm ở gốc repo dạng chưa track (`git status` báo `??`) — cần **chạy trong Supabase SQL Editor** (DB chính) nếu chưa chạy. Nếu đã chạy tay rồi thì chỉ cần dọn file (hoặc giữ lại làm lịch sử migration).

## 2. Rà soát việc 2 — Kho hàng hóa / Công cụ dụng cụ / Gia công

**Đã làm, đúng yêu cầu.**

- `supabase-bo-sung-kho-hang-hoa-cong-cu-gia-cong.sql`: insert idempotent 3 kho **"Kho hàng hóa"**, **"Kho công cụ dụng cụ"**, **"Kho gia công"** vào `quan_ly_kho`.
- Frontend (`src/features/phieu-xuat-nhap-kho/index.tsx`, `server.ts`, `WarehouseSlipPrintModal.tsx`, `controlBoardShiftSummary.ts`): `WarehouseKind` mở rộng đủ `hang_hoa` / `cong_cu_dung_cu` / `gia_cong`, tự suy loại kho theo tên, tab riêng trong Lịch sử xuất nhập kho, filter API riêng từng loại, nhãn in phiếu riêng.
- Cả 3 kho mới dùng chung danh mục vật tư (`/api/kho-nvl`) khi lập phiếu — giống NVL/tái chế, không phải danh mục thành phẩm.
- **Việc còn thiếu:** cũng cần **chạy file SQL này trong Supabase** nếu chưa chạy, để 3 tên kho thật sự xuất hiện trong dropdown "Tên kho" (nếu chưa chạy, dropdown sẽ không có 3 kho này dù code đã hỗ trợ).

## 3. Việc 3 — Phân quyền Phiếu xuất nhập kho theo Vật tư / Thành phẩm

### 3.1 Hiện trạng trước khi sửa

- Toàn bộ màn hình **Phiếu xuất nhập kho** (`warehouse-slip`) và **Lịch sử xuất nhập** (thao tác Sửa/Xóa dòng) dùng chung **1 quyền duy nhất**: `useTabAccess('warehouse-slip')` — bất kỳ ai có quyền Sửa/Xóa/Thêm này đều thao tác được **tất cả loại kho** (NVL, thành phẩm, tái chế, hàng hỏng, hàng hóa, công cụ dụng cụ, gia công) trên cùng 1 màn hình.
- Không có ranh giới nào giữa "người phụ trách kho vật tư" và "người phụ trách kho thành phẩm" — sai với luồng nghiệp vụ thực tế (2 người khác nhau).
- Hệ thống phân quyền là **theo vai trò** (phòng ban + chức vụ, bảng `cai_dat_thoi_gian` code `PERM_KEY_*`), không phải theo từng cá nhân; ma trận quyền (`RolePermissionsMatrix.tsx`) tự sinh từ `STAFF_MENU_VIEW_TREE` — thêm 1 dòng vào cây là tự có ô tick Xem/Sửa/Xóa, không cần sửa UI ma trận.
- Quyền hiện chỉ enforce ở **client** (ẩn/hiện nút, chặn điều hướng) — không có middleware phân quyền ở `server.ts` cho route nào (không riêng gì phiếu kho). Việc 3 giữ nguyên quy ước này để nhất quán với toàn bộ app; không mở rộng phạm vi sang việc thêm kiểm tra phía server.

### 3.2 Quyết định nghiệp vụ (đã xác nhận với người yêu cầu)

4 kho mới (hàng hỏng, hàng hóa, công cụ dụng cụ, gia công) gộp vào nhóm **Vật tư** — đúng 2 người phụ trách như yêu cầu, không phát sinh vai trò thứ 3:

| Nhóm quyền | Loại kho (`loai_kho`) |
|---|---|
| **Vật tư** (`warehouse-slip-vat-tu`) | `nvl`, `tai_che`, `hang_hong`, `hang_hoa`, `cong_cu_dung_cu`, `gia_cong` |
| **Thành phẩm** (`warehouse-slip-thanh-pham`) | `san_pham` |

Quyền **Xem/Thêm/Sửa/Xóa** đều tách theo loại kho. Hai route `/phieu-xuat-nhap-kho` và `/lich-su-xuat-nhap-kho` vẫn dùng chung, nhưng người dùng chỉ thấy dropdown/tab lịch sử thuộc nhóm kho được cấp.

### 3.3 Thiết kế & triển khai (đã code xong)

1. **`src/features/nhan-su/menuViews.ts`** — `STAFF_MENU_VIEW_TREE`: thay dòng `{ tab: 'warehouse-slip', ... }` (ở cả nhóm `factory-kho` và `facility-management`) bằng 2 dòng:
   - `{ tab: 'warehouse-slip-vat-tu', label: 'Phiếu xuất nhập kho - Vật tư' }`
   - `{ tab: 'warehouse-slip-thanh-pham', label: 'Phiếu xuất nhập kho - Thành phẩm' }`

   → Tự động xuất hiện thành 2 dòng riêng trong ma trận Phân quyền tại `/cai-dat`.

2. **`src/app/tabAccess.ts`** — `hubHasAllowedChild()` coi hai quyền con là điều kiện mở route dùng chung.
   Màn hình `/phieu-xuat-nhap-kho` và `/lich-su-xuat-nhap-kho` vẫn dùng route cũ — chỉ cần có **1 trong 2** quyền con là vào được. Không đặt phép suy này trong `HUB_IMPLIED_TABS`, vì quyền `warehouse-slip` cũ không được phép tự cấp cả hai quyền nghiệp vụ mới.

3. **`src/features/phieu-xuat-nhap-kho/index.tsx`**:
   - Thêm `warehouseKindPermissionTab(kind)`, `useWarehouseSlipAccess()` (gọi `useTabAccess` cho cả 2 tab quyền), `pickWarehouseSlipAccess(access, kind)` chọn đúng bộ quyền theo loại kho.
   - `WarehouseSlipPanel` (form tạo/sửa phiếu): `canCreate/canEdit/canDelete` giờ phụ thuộc `warehouseKind` hiện tại của form (đổi theo "Tên kho" đang chọn).
   - `WarehouseHistoryPanel` (lịch sử xuất nhập): `canCreate/canEdit/canDelete` phụ thuộc `warehouseTab` (tab loại kho đang xem) — nút Sửa/Xóa từng dòng, nút "+ Thêm phiếu", bulk-delete đều theo đúng tab đang mở.
   - Dropdown **Tên kho** khi tạo phiếu chỉ hiện các kho mà người dùng có quyền **Thêm** tương ứng (vật tư/thành phẩm) — nhân viên vật tư sẽ không thấy/tạo nhầm phiếu kho thành phẩm và ngược lại. Có thông báo riêng khi danh sách rỗng vì thiếu quyền (khác với thông báo "chưa có tên kho" khi danh mục kho trống).
   - Tab **Xuất kho treo** dùng quyền **Thêm** của nhóm kho tương ứng. Bấm Lưu tạo ngay phiếu xuất chính thức; thao tác Sửa/Xóa sau đó thực hiện tại Lịch sử xuất nhập kho theo quyền hiện có.

4. **`docs/ai-tables/phieu_xuat_nhap_kho.md`** — đã bổ sung mục "Phân quyền theo loại kho" mô tả lại thiết kế này.

### 3.4 Việc cần làm (checklist)

- [x] Tách quyền `warehouse-slip` → `warehouse-slip-vat-tu` / `warehouse-slip-thanh-pham` trong cây phân quyền.
- [x] `hubHasAllowedChild()` giữ khả năng vào màn hình khi có 1 trong 2 quyền con mà không suy rộng quyền cũ sang hai quyền mới.
- [x] Gate Thêm/Sửa/Xóa theo loại kho tại `WarehouseSlipPanel` và `WarehouseHistoryPanel`.
- [x] Lọc dropdown "Tên kho" theo quyền Thêm.
- [x] Cập nhật `docs/ai-tables/phieu_xuat_nhap_kho.md`.
- [ ] **Chạy 2 file SQL của việc 1 và việc 2** trên Supabase (DB chính) nếu chưa chạy — nếu không, kho hàng hỏng/hàng hóa/công cụ dụng cụ/gia công sẽ không có trong danh mục dù code đã sẵn sàng.
- [x] **Đã migrate quyền trên DB chính (2026-08-12):** `Thủ kho vật tư, kế toán sản xuất` nhận Xem/Sửa/Xóa Vật tư; `Thủ kho thành phẩm` nhận Xem/Sửa/Xóa Thành phẩm. Các vai trò từng có quyền xem tiếp tục xem cả hai, nhưng không còn quyền sửa/xóa phiếu kho.
- [x] Kiểm thử tay ngày 2026-08-12: đăng nhập `NV003-3` chỉ thấy các kho Vật tư và `NV006-4` chỉ thấy Kho thành phẩm trong dropdown/lịch sử; cả hai đều có nút lập phiếu đúng phạm vi.

## 4. Lưu ý / rủi ro khi triển khai

- Migration quyền đã chạy trên DB chính ngày 2026-08-12 và có thể chạy lại an toàn. Script mặc định là dry-run; chỉ ghi khi truyền `--apply`.
- Việc gộp 4 kho mới (hàng hỏng/hàng hóa/công cụ dụng cụ/gia công) vào nhóm Vật tư là quyết định nghiệp vụ đã chốt cùng người yêu cầu — nếu sau này có người phụ trách riêng cho 1 trong 4 kho này, chỉ cần thêm 1 tab quyền mới tương tự (`warehouse-slip-<kho>`) và sửa `warehouseKindPermissionTab()` map đúng kho đó, không cần đổi kiến trúc.
- Phân quyền hiện tại (toàn hệ thống, không riêng việc này) chỉ enforce ở client. Nếu sau này cần chặn cứng ở API (ví dụ nhân viên gọi thẳng `POST /api/phieu-xuat-nhap-kho` với `loai_kho=san_pham` dù không có quyền), sẽ cần thêm 1 lớp middleware đọc quyền theo user ở `server.ts` — đây là thay đổi lớn hơn nhiều, ảnh hưởng mọi route, nên tách thành việc riêng nếu được yêu cầu.
