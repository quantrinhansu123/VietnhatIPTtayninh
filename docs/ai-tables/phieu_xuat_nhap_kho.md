# Phiếu xuất nhập kho

| | |
|---|---|
| **Bảng** | Header: `phieu_nhap`, `phieu_xuat`; dòng sản phẩm: `nhap_kho`, `xuat_kho` |
| **Tab** | `warehouse-slip`, `warehouse-history` |
| **SQL** | `supabase-db-kho.sql` (header + dòng); QR thành phẩm: `supabase-phieu-nhap-san-pham-ma-chi-tiet.sql`; QR NVL: `supabase-ma-qr-nvl.sql` |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/kho/luu-phieu` | Danh sách phiếu; lọc `loai`, `loai_kho`, `ma_sp` |
| GET | `/api/kho/lich-su` | Trang `/lich-su-xuat-nhap-kho` ghép header và chi tiết từ DB kho mới theo `ma_phieu`. Trang gửi `status=all` để hiện cả phiếu `chua_chot` đã có dòng (phiếu nhập từ máy) |
| GET / DELETE | `/api/kho/chi-tiet` | Đọc danh sách mã QR đã quét hoặc xóa mã trong phiếu nháp |
| GET | `/api/san-pham/:id/phieu-kho?loai=nhap\|xuat` | Nhật ký theo SP — dùng tab Nhập kho / Xuất kho trong Xem sản phẩm |
| GET | `/api/kho/lo-ton` | (lô tồn theo `ma_npl`, loại trừ xuất treo chưa xác nhận) |
| GET | `/api/kho/gia-tb-nhap` | (giá BQ nhập theo mã NVL + tháng) |
| GET | `/api/bao-cao-hang-hong/cho-nhap-kho` | danh sách báo cáo hàng hỏng chờ thủ kho (dùng chung cho tab Nhập kho lẫn tab Xuất kho treo) |
| POST | `/api/kho/luu-phieu` | Lưu header + dòng trên DB kho mới; body có thể kèm `treo: true` |
| POST | `/api/kho/phieu/:slipCode/xac-nhan-treo` | Chốt phiếu xuất treo |
| PUT | `/api/kho/luu-phieu/:slipCode` | Cập nhật phiếu chưa in; phiếu xuất chỉ hỗ trợ NVL và hàng hỏng |
| DELETE | `/api/kho/phieu/:slipCode` hoặc `/api/kho/dong/:id` | Xóa phiếu hoặc một dòng |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | Panel / logic chính. Header trang có nút **Làm mới** (chỉ tab này): tải lại danh mục kho, máy, lệnh SX và danh sách phiếu, không xóa phiếu đang nhập. Phiếu nhập thành phẩm đã chọn có nút **Nhập từ máy**: hiện dòng `kho_cho` của phiếu, **Xác nhận nhập kho** ghi sang `nhap_kho` |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |

**Tự động điền:** Nút **Tự động điền theo lệnh SX** trên form phiếu — lọc lệnh SX theo **Ngày phiếu + Ca**, chọn các lệnh khớp, điền máy / lý do / ghi chú và dòng hàng (`san_pham` = SP trên lệnh; `nvl` = NVL định mức BOM theo SP × SL lệnh). Nút **Điền ĐM · KG cân thực tế** (xuất NVL) — cùng danh sách NVL theo BOM, nhưng **kg nhựa %** lấy từ tổng **Nhựa thực tế** trên `/can-tu-dong` (ngày · ca · máy); NVL chỉ có kg/SP (vd BDT) lấy `khoi_luong_kg × số lần cân`.

Loại kho lịch sử: `nvl` · `san_pham` · `tai_che` · `hang_hong` · `hang_hoa` · `cong_cu_dung_cu` · `gia_cong`. Màn `/lich-su-xuat-nhap-kho` chia 2 tab **Xuất kho** / **Nhập kho** (lọc `loai`), dropdown **Chọn kho** giữ các loại kho. Phía trên danh sách có **số cuộn theo bộ lọc** (kho, loại phiếu, ngày, ca, ô tìm). Phía dưới có bảng **Tổng hợp theo Mã SP** (STT, Mã SP, Tên SP, Số cuộn). Danh sách phiếu hiển thị giờ lưu theo `created_at` của header, đổi sang giờ Việt Nam. Với kho thành phẩm (`san_pham`), danh sách lịch sử ẩn Ca và Máy trên cả desktop và mobile. Mỗi phiếu có nút **Xem** mở chi tiết (điện thoại mở popup, máy tính mở tab mới). Bảng phụ **Chi tiết từng dòng** đã bỏ; modal xem phiếu vẫn xếp **ĐVT kg lên đầu** (`sortWarehouseLinesKgFirst`). Link `/kho-hang-hong` mở nhóm tab Kho hàng hỏng / Kho hàng hóa / Kho công cụ dụng cụ / Kho gia công. Form phiếu không còn card **Báo cáo sản lượng chờ nhập kho** phía trên.

**Loại phiếu** trên form có 3 lựa chọn: **Nhập kho** · **Xuất kho treo** · **Xuất kho**.
- **Xuất kho treo** lưu ngay `treo=false` thành phiếu xuất chính thức, cập nhật tồn kho, lịch sử và mở mẫu in.
- Không còn card **Phiếu xuất kho treo chờ xác nhận** và không có bước Xác nhận riêng.

- Form **Xuất kho**: trước các dòng hàng phải chọn **Ngày** và **Phiếu xuất hàng**. Danh sách phiếu lấy từ `/api/lenh-xuat-hang` theo đúng ngày (`ngay_xuat`), rồi hiện **Mã**, **Mặt hàng**, **Số lượng**.
- Form phiếu: **một dropdown Tên kho** từ `/api/quan-ly-kho` (`ten_kho`); tự suy `loai_kho` theo tên (thành phẩm / tái chế / còn lại = NVL).
- **Người lập** tự điền theo tên tài khoản đang đăng nhập (`currentUser.name`).
- Form phiếu lưu **Ca** (`ca`) và **Máy** (`may`). Dữ liệu XK trên `/phan-tich-tu-dong` khớp theo **ngày** (bộ lọc ngày, không lọc ca) + máy (phiếu cũ không có `may` suy máy từ lệnh SX gắn trên lý do/ghi chú, giống `/lich-su-xuat-nhap-kho`). **Ca không bắt buộc** trên form (Nhập / Xuất).

## Phân quyền theo loại kho (Vật tư / Thành phẩm)

Kho vật tư và Kho thành phẩm do 2 người khác nhau phụ trách → tách quyền Thêm/Sửa/Xóa theo `loai_kho`, không dùng chung 1 quyền `warehouse-slip` nữa (xem `docs/phan-quyen-phieu-xuat-nhap-kho.md`):

- **`warehouse-slip-vat-tu`** ("Phiếu xuất nhập kho - Vật tư"): `nvl` · `tai_che` · `hang_hong` · `hang_hoa` · `cong_cu_dung_cu` · `gia_cong`.
- **`warehouse-slip-thanh-pham`** ("Phiếu xuất nhập kho - Thành phẩm"): `san_pham`.
- 2 dòng này thay cho dòng `warehouse-slip` cũ trong `STAFF_MENU_VIEW_TREE` (`src/features/nhan-su/menuViews.ts`, nhóm `factory-kho` và `facility-management`) — hiện trong ma trận Phân quyền tại `/cai-dat`.
- `src/app/tabAccess.ts` → `hubHasAllowedChild()` cho phép vào hai route dùng chung nếu có 1 trong 2 quyền con; quyền cũ `warehouse-slip` không được suy rộng thành cả hai quyền mới.
- `src/features/phieu-xuat-nhap-kho/index.tsx` → `useWarehouseSlipAccess()` + `pickWarehouseSlipAccess(access, kind)` chọn đúng bộ quyền theo `warehouseKind` (form tạo/sửa) hoặc `warehouseTab` (Lịch sử xuất nhập) đang thao tác; phiếu chưa in được sửa, phiếu xuất chỉ hỗ trợ Kho NVL và Kho hàng hỏng. Bấm **In phiếu** sẽ khóa sửa phiếu. Khi sửa phiếu nhập thành phẩm, **Thực hiện** chỉ hiện mã quét mới; **Lập phiếu** hiển thị và chỉnh sửa các dòng đã gộp theo mã TP gốc. Không còn tab **Chi tiết**.
- Dropdown **Tên kho**, các tab lịch sử và Thêm/Sửa/Xóa chỉ hiện đúng nhóm kho được cấp; các handler kiểm tra quyền lại trước khi gọi API.
- Migration `scripts/migrate-warehouse-slip-permissions.mjs`: quyền xem cũ chuyển sang xem hai nhóm; riêng `Thủ kho vật tư, kế toán sản xuất` chỉ nhận quyền Vật tư và `Thủ kho thành phẩm` chỉ nhận quyền Thành phẩm. Chỉ hai vai trò này nhận Thêm/Sửa/Xóa.
- Tài khoản vận hành đã gán trực tiếp qua `nhan_su.vi_tri_gan`: `NV003-3` → Vật tư, `NV006-4` → Thành phẩm. Đã kiểm thử đăng nhập thực tế ngày 2026-08-12; mỗi tài khoản chỉ thấy dropdown và tab lịch sử thuộc kho phụ trách.

- Phiếu **Nhập** chỉ có một trường **Số lượng**, lưu tại `so_luong`; `so_luong_chung_tu` luôn `NULL`.
- Phiếu **Nhập** tự lưu các phiếu đang quét vào trình duyệt (gồm cả mã tem đầy đủ để tiếp tục chống quét trùng). Người dùng có thể chọn lại **Phiếu đang quét**, bấm **Lưu tạm phiếu**, xóa phiếu tạm hoặc **In tạm phiếu**. Không có nút tạo phiếu mới thủ công; chỉ sau khi **Lưu & in phiếu nhập kho** thành công, form mới được làm trống để lập phiếu tiếp theo. Bản lưu/in tạm không gọi API, không ghi lịch sử và không cập nhật tồn kho.
- Modal quét máy/QR: mỗi lần quét thành công **ghi thẳng** 1 dòng vào DB kho mới (`nhap_kho`/`xuat_kho` qua `POST /api/kho/quet`, `so_luong=1`) — **không** cộng dồn SL trên dòng đã có. Tem serial trùng tuyệt đối → bỏ qua. Xem [kho.md](./kho.md).
- Phiếu **Xuất** có **SL CT** (`so_luong_chung_tu`) và **SL THỰC** (`so_luong`). Tồn kho và thành tiền vẫn tính theo `so_luong`.
- Form **Xuất kho** có **Chụp ảnh số cân thực tế** — upload Cloudinary (`/api/cloudinary/upload`), lưu URL vào `link_anh_can_thuc_te` trên mỗi dòng `xuat_kho`. Xem ảnh trong modal Chi tiết phiếu (Lịch sử) qua `WeighingImagePreviewModal`.
- Dòng NVL **thêm thủ công** hiển thị trường ảnh số cân ở giữa; dòng được **quét mã** đặt cờ `isScanned` và không yêu cầu/hiển thị trường ảnh này.
- Phiếu **Nhập kho thành phẩm** nhận mã gốc + số lượng nguyên. API sinh từng mã đầy đủ, ghi mỗi serial thành một dòng `nhap_kho` số lượng 1 và đồng bộ mã QR sau khi chốt phiếu.
- Sau khi lưu, UI lần lượt mở file phiếu nhập và file tem QR. Có thể in lại đúng bộ tem tại **Lịch sử xuất nhập kho → Kho sản phẩm → Xem chi tiết → In mã QR**.


## Script

`scripts/sync-kho-nvl-from-phieu.mjs` — đồng bộ tồn kho từ phiếu.
