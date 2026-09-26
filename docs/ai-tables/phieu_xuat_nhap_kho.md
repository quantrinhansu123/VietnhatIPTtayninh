# phieu_xuat_nhap_kho

| | |
|---|---|
| **Bảng** | Lịch sử kho mới: `phieu_nhap`, `phieu_xuat`, `nhap_kho`, `xuat_kho`; các phiếu cũ vẫn nằm trong `phieu_xuat_nhap_kho` |
| **Tab** | `warehouse-slip`, `warehouse-history` |
| **SQL** | `supabase-phieu-xuat-nhap-kho.sql` + migrate `supabase-phieu-xuat-nhap-kho-*.sql` (căn cứ báo cáo: `supabase-phieu-xuat-nhap-kho-can-cu-bao-cao.sql`; QR thành phẩm: `supabase-phieu-nhap-san-pham-ma-chi-tiet.sql`; QR NVL: `supabase-ma-qr-nvl.sql`; máy: `supabase-phieu-xuat-nhap-kho-may.sql`; treo: `supabase-phieu-xuat-nhap-kho-treo.sql`; ảnh thực tế: `supabase-phieu-xuat-nhap-kho-anh-thuc-te.sql`; bỏ ảnh số bao: `supabase-phieu-xuat-nhap-kho-xoa-anh-so-bao-thuc-te.sql`) |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/phieu-xuat-nhap-kho` | Danh sách phiếu; lọc `loai`, `loai_kho`, `ma_sp` (khớp cả bản không dấu cách) |
| GET | `/api/kho/lich-su` | Trang `/lich-su-xuat-nhap-kho` ghép header và chi tiết từ DB kho mới theo `ma_phieu` |
| GET / PATCH / DELETE | `/api/kho/chi-tiet` | Đọc mã QR đã quét, sửa tên/ĐVT cho nhóm cùng mã TP gốc khi sửa phiếu nhập thành phẩm, hoặc xóa mã trong phiếu nháp |
| GET | `/api/san-pham/:id/phieu-kho?loai=nhap\|xuat` | Nhật ký theo SP — dùng tab Nhập kho / Xuất kho trong Xem sản phẩm |
| GET | `/api/phieu-xuat-nhap-kho/lo-ton` | (lô tồn theo `ma_npl`, loại trừ xuất treo chưa xác nhận) |
| GET | `/api/phieu-xuat-nhap-kho/gia-tb-nhap` | (giá BQ nhập theo mã NVL + tháng) |
| GET | `/api/bao-cao-hang-hong/cho-nhap-kho` | danh sách báo cáo hàng hỏng chờ thủ kho (dùng chung cho tab Nhập kho lẫn tab Xuất kho treo) |
| POST | `/api/phieu-xuat-nhap-kho` | ~5263 (body có thể kèm `treo: true` khi lưu phiếu xuất kho treo) |
| POST | `/api/phieu-xuat-nhap-kho/:slipCode/xac-nhan-treo` | Endpoint tương thích cho phiếu treo cũ; giao diện mới không còn tạo phiếu chờ xác nhận |
| PUT | `/api/phieu-xuat-nhap-kho/:slipCode` | ~5377 |
| DELETE | slip / id | ~5495+ |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |

**Tự động điền:** Nút **Tự động điền theo lệnh SX** trên form phiếu — lọc lệnh SX theo **Ngày phiếu + Ca**, chọn các lệnh khớp, điền máy / lý do / ghi chú và dòng hàng (`san_pham` = SP trên lệnh; `nvl` = NVL định mức BOM theo SP × SL lệnh). Nút **Điền ĐM · KG cân thực tế** (xuất NVL) — cùng danh sách NVL theo BOM, nhưng **kg nhựa %** lấy từ tổng **Nhựa thực tế** trên `/can-tu-dong` (ngày · ca · máy); NVL chỉ có kg/SP (vd BDT) lấy `khoi_luong_kg × số lần cân`.

Loại kho lịch sử: `nvl` · `san_pham` · `tai_che` · `hang_hong` · `hang_hoa` · `cong_cu_dung_cu` · `gia_cong`. Màn `/lich-su-xuat-nhap-kho` chia 2 tab **Xuất kho** / **Nhập kho** (lọc `loai`), dropdown **Chọn kho** giữ các loại kho; danh sách phiếu hiển thị giờ lưu theo `created_at` của header, đổi sang giờ Việt Nam. Với kho thành phẩm (`san_pham`), danh sách lịch sử ẩn Ca và Máy trên cả desktop và mobile. Bảng phụ **Chi tiết từng dòng** đã bỏ; modal xem phiếu vẫn xếp **ĐVT kg lên đầu** (`sortWarehouseLinesKgFirst`). Link `/kho-hang-hong` mở nhóm tab Kho hàng hỏng / Kho hàng hóa / Kho công cụ dụng cụ / Kho gia công. Báo cáo hàng hỏng xuất hiện ở hàng chờ trên `/phieu-xuat-nhap-kho`; bấm **Kiểm tra** để điền phiếu và chỉ phát sinh tồn kho khi bấm **Lưu & in**.

**Loại phiếu** trên form có 3 lựa chọn: **Nhập kho** · **Xuất kho treo** · **Xuất kho**.
- **Xuất kho treo** là form chờ lấy dữ liệu từ **Báo cáo hàng hỏng chờ xuất kho**, không phải một trạng thái phiếu đã lưu. Bấm **Kiểm tra** để điền báo cáo xuống form; bấm **Lưu phiếu xuất kho treo** sẽ lưu ngay `treo=false` thành phiếu xuất chính thức, cập nhật tồn kho, lịch sử và mở mẫu in.
- Card **Báo cáo hàng hỏng chờ nhập kho** chỉ hiện ở tab Nhập kho; card **Báo cáo hàng hỏng chờ xuất kho** (cùng nguồn dữ liệu `/api/bao-cao-hang-hong/cho-nhap-kho`) chỉ hiện ở tab Xuất kho treo — báo cáo nào được **Kiểm tra** ở tab nào thì biến mất khỏi cả hai (đã gắn `id_bao_cao_hang_hong`).
- Không còn card **Phiếu xuất kho treo chờ xác nhận** và không có bước Xác nhận riêng.

- Form phiếu: **một dropdown Tên kho** từ `/api/quan-ly-kho` (`ten_kho`); tự suy `loai_kho` theo tên (thành phẩm / tái chế / còn lại = NVL).
- **Người lập** tự điền theo tên tài khoản đang đăng nhập (`currentUser.name`).
- Form phiếu lưu **Ca** (`ca`) và **Máy** (`may`). Dữ liệu XK trên `/phan-tich-tu-dong` khớp theo **ngày** (bộ lọc ngày, không lọc ca) + máy (phiếu cũ không có `may` suy máy từ lệnh SX gắn trên lý do/ghi chú, giống `/lich-su-xuat-nhap-kho`). **Ca không bắt buộc** trên form (Nhập / Xuất).

## Phân quyền theo loại kho (Vật tư / Thành phẩm)

Kho vật tư và Kho thành phẩm do 2 người khác nhau phụ trách → tách quyền Thêm/Sửa/Xóa theo `loai_kho`, không dùng chung 1 quyền `warehouse-slip` nữa (xem `docs/phan-quyen-phieu-xuat-nhap-kho.md`):

- **`warehouse-slip-vat-tu`** ("Phiếu xuất nhập kho - Vật tư"): `nvl` · `tai_che` · `hang_hong` · `hang_hoa` · `cong_cu_dung_cu` · `gia_cong`.
- **`warehouse-slip-thanh-pham`** ("Phiếu xuất nhập kho - Thành phẩm"): `san_pham`.
- 2 dòng này thay cho dòng `warehouse-slip` cũ trong `STAFF_MENU_VIEW_TREE` (`src/features/nhan-su/menuViews.ts`, nhóm `factory-kho` và `facility-management`) — hiện trong ma trận Phân quyền tại `/cai-dat`.
- `src/app/tabAccess.ts` → `hubHasAllowedChild()` cho phép vào hai route dùng chung nếu có 1 trong 2 quyền con; quyền cũ `warehouse-slip` không được suy rộng thành cả hai quyền mới.
- `src/features/phieu-xuat-nhap-kho/index.tsx` → `useWarehouseSlipAccess()` + `pickWarehouseSlipAccess(access, kind)` chọn đúng bộ quyền theo `warehouseKind` (form tạo/sửa) hoặc `warehouseTab` (Lịch sử xuất nhập) đang thao tác; chỉ phiếu nhập có thể sửa, phiếu xuất bị khóa ở giao diện và API. Khi sửa phiếu nhập thành phẩm, tab **Thực hiện** hiển thị các QR đã lưu để sửa tên/ĐVT (áp dụng cho cùng mã TP gốc) và vẫn cho quét bổ sung.
- Dropdown **Tên kho**, các tab lịch sử và Thêm/Sửa/Xóa chỉ hiện đúng nhóm kho được cấp; các handler kiểm tra quyền lại trước khi gọi API.
- Migration `scripts/migrate-warehouse-slip-permissions.mjs`: quyền xem cũ chuyển sang xem hai nhóm; riêng `Thủ kho vật tư, kế toán sản xuất` chỉ nhận quyền Vật tư và `Thủ kho thành phẩm` chỉ nhận quyền Thành phẩm. Chỉ hai vai trò này nhận Thêm/Sửa/Xóa.
- Tài khoản vận hành đã gán trực tiếp qua `nhan_su.vi_tri_gan`: `NV003-3` → Vật tư, `NV006-4` → Thành phẩm. Đã kiểm thử đăng nhập thực tế ngày 2026-08-12; mỗi tài khoản chỉ thấy dropdown và tab lịch sử thuộc kho phụ trách.

- Phiếu **Nhập** chỉ có một trường **Số lượng**, lưu tại `so_luong`; `so_luong_chung_tu` luôn `NULL`.
- Phiếu **Nhập** tự lưu các phiếu đang quét vào trình duyệt (gồm cả mã tem đầy đủ để tiếp tục chống quét trùng). Người dùng có thể chọn lại **Phiếu đang quét**, bấm **Lưu tạm phiếu**, xóa phiếu tạm hoặc **In tạm phiếu**. Không có nút tạo phiếu mới thủ công; chỉ sau khi **Lưu & in phiếu nhập kho** thành công, form mới được làm trống để lập phiếu tiếp theo. Bản lưu/in tạm không gọi API, không ghi lịch sử và không cập nhật tồn kho.
- Modal quét máy/QR: mỗi lần quét thành công **ghi thẳng** 1 dòng vào DB kho mới (`nhap_kho`/`xuat_kho` qua `POST /api/kho/quet`, `so_luong=1`) — **không** cộng dồn SL trên dòng đã có. Tem serial trùng tuyệt đối → bỏ qua. Xem [kho.md](./kho.md).
- Phiếu **Xuất** có **SL CT** (`so_luong_chung_tu`) và **SL THỰC** (`so_luong`). Tồn kho và thành tiền vẫn tính theo `so_luong`.
- Form **Xuất kho** có **Chụp ảnh số cân thực tế** — upload Cloudinary (`/api/cloudinary/upload`, folder `phieu_xuat_nhap_kho`), lưu URL vào `link_anh_can_thuc_te` trên mỗi dòng `phieu_xuat_nhap_kho` (cùng giá trị header phiếu). Xem ảnh trong modal Chi tiết phiếu (Lịch sử) qua `WeighingImagePreviewModal`.
- Dòng NVL **thêm thủ công** hiển thị trường ảnh số cân ở giữa; dòng được **quét mã** đặt cờ `isScanned` và không yêu cầu/hiển thị trường ảnh này.
- Phiếu **Nhập kho thành phẩm** nhận mã gốc + số lượng nguyên. API dùng thuật toán serial cũ để sinh từng mã đầy đủ, rồi RPC `tao_phieu_nhap_san_pham_voi_ma_chi_tiet` đăng ký mã và ghi mỗi serial thành một dòng phiếu số lượng 1 trong cùng transaction.
- Sau khi lưu, UI lần lượt mở file phiếu nhập và file tem QR. Có thể in lại đúng bộ tem tại **Lịch sử xuất nhập kho → Kho sản phẩm → Xem chi tiết → In mã QR**.


## Script

`scripts/sync-kho-nvl-from-phieu.mjs` — đồng bộ tồn kho từ phiếu.
