# san_pham

| | |
|---|---|
| **Bảng** | `san_pham` |
| **Tab** | `inventory-catalog` → `/kho-hang` (route cũ: `products` → `/san-pham`) |
| **SQL** | `supabase-san-pham.sql`, `supabase-san-pham-dinh-muc.sql`, `supabase-san-pham-npl-phan-tram.sql`, `supabase-san-pham-ton-dau-ky.sql`, `supabase-san-pham-ten-kho.sql`, `supabase-san-pham-ma-chi-tiet.sql`, `supabase-ma-qr-hang-hoa.sql` |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/san-pham` | 3507 |
| POST | `/api/san-pham` | 3564 |
| GET | `/api/san-pham/:id/ma-chi-tiet` | danh sách mã QR/serial đã lưu |
| GET | `/api/san-pham/:id/phieu-kho?loai=nhap\|xuat` | nhật ký nhập/xuất từ `phieu_xuat_nhap_kho` theo mã SP |
| PATCH | `/api/san-pham` | bulk đổi `ten_kho` theo `ids` (ưu tiên bộ lọc UI) hoặc theo `nhom_vthh` |
| PATCH | `/api/san-pham/:id` | 3629 |
| POST | `/api/ma-qr-hang-hoa/cap-moi` | Cấp/lưu QR duy nhất khi in từ danh mục Kho hàng hóa |
| POST | `/api/ma-qr-hang-hoa/danh-dau-in` | Tăng số lần in QR đã cấp từ danh mục |
| GET | `/api/san-pham/:id/ma-qr-hang-hoa` | Danh sách QR đã cấp của sản phẩm, dùng tab Xem sản phẩm |
| PATCH | `/api/ma-qr-hang-hoa/:id/trang-thai` | Đổi trạng thái QR hàng hóa: `dang_dung` / `da_huy` |
| DELETE | `/api/san-pham` | bulk — xóa `ma_san_pham_chi_tiet` trước rồi `san_pham` |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/san-pham/index.tsx` | Panel / logic chính |
| `src/features/kho-hang/index.tsx` | Màn hình gộp Kho hàng, chọn Nguyên vật liệu / Thành phẩm |
| `src/features/san-pham/types.ts` | Panel / logic chính |
| `src/features/san-pham/productFieldClass.ts` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |

UI danh sách sản phẩm có **hai chế độ**:

- Modal **Xem sản phẩm**: tab Thông tin · Thành phần · **Nhập kho** · **Xuất kho** (hai tab sau lấy dòng từ `phieu_xuat_nhap_kho` theo mã SP). Bảng **Tồn kho** trên tab Thông tin: **Tồn đầu kỳ** = `tong_so_luong` từ Bảng tổng hợp Kiểm kho (`GET /api/kiem-kho/ton-dau-ky`); **Nhập/Xuất trong kỳ** = tổng `so_luong` toàn bộ phiếu ở tab Nhập kho / Xuất kho; Tồn cuối = đầu + nhập − xuất.
- **Danh mục** (`/san-pham`, QC): lấy trực tiếp từ bảng `san_pham` — cột Tồn đầu / Nhập / Xuất / Tồn / Tồn TT / Kho; thống kê Sản phẩm · Nhóm VTHH · Đơn vị. Nút **Đổi kho theo bộ lọc** mở chọn tên kho rồi cập nhật `ten_kho` cho các SP đang hiện theo bộ lọc.
- **Tồn theo ngày** (Kho hàng → Thành phẩm + chọn ngày): cột **Tổng SL** = `ton_cuoi_ky` tính từ phiếu kho đến ngày đang chọn; thống kê Mã SP / Tổng SL / Đơn vị. Bộ lọc **Kho** (dropdown từ `quan_ly_kho`) — cột **Kho** trên bảng luôn hiện đúng kho đang chọn.

## Menu

- QC `/nha-may/qc` → card **Danh sách sản phẩm** → `products` (`/san-pham`)
- Kho → **Kho hàng** → Thành phẩm (cùng panel)

## Cột quan trọng

`ma_sp`, `ten_sp`, `nhom_vthh`, `ten_kho`, `ton_dau_ky`, `dinh_muc_npl` (JSON NPL).

## Mã sản phẩm chi tiết

Trang Sản phẩm chỉ quản lý danh mục mã gốc và định mức. Việc sinh/lưu serial QR đã chuyển sang **Phiếu nhập kho thành phẩm**; xem manifest `phieu_xuat_nhap_kho.md` và `ma_san_pham_chi_tiet.md`.

Xóa SP: `DELETE /api/san-pham` gọi RPC `xoa_san_pham_hang_loat` (hoặc FK `ON DELETE CASCADE`). Chạy `supabase-ma-san-pham-chi-tiet-delete.sql` nếu chưa.

> Tính năng "Đồng bộ" (cộng số liệu kiểm kho vào `ton_dau_ky`) đã bị **gỡ bỏ**. File `supabase-san-pham-kiem-kho-dong-bo.sql` giờ chỉ còn migration `DROP` để dọn RPC/bảng so cái cũ trên DB đã từng chạy — không cần chạy lại nếu DB chưa từng có tính năng này.

### QR in từ danh mục Kho hàng hóa

- Nút **In mã QR** tại `/kho-hang` gọi RPC `cap_ma_qr_hang_hoa` để lưu mã vào `ma_qr_hang_hoa` trước khi xem trước/in.
- Dạng mã: `MãSP_` + hậu tố random **11 ký tự** từ `A-Z` và `0-9`; hậu tố luôn có cả chữ và số. `UNIQUE(ma_qr)` chống trùng khi nhiều người in cùng lúc.
- Bấm in cập nhật `so_lan_in` và `ngay_in_gan_nhat`.
- Trong **Xem sản phẩm** có tab **Mã QR đã cấp**: xem mã, trạng thái, ngày cấp, lịch sử in và chọn mã để in lại.

### Excel danh mục SP

- Nút **Tải mẫu Excel** / **Tải Excel lên** (và **Tải mẫu Excel SP**) — `src/utils/productCatalogExcel.ts`
- Cột khớp bảng UI trước: Mã SP, Tên, Tính chất, Nhóm, Đơn vị, Tổng TL, Tồn đầu, Nhập, Xuất, Tồn, Tồn TT + thêm định mức (AMIS, khổ cuộn, TL lõi/túi/nhựa…)
- **Ô trống vẫn đẩy lên** (chỉ bắt buộc có Mã SP hoặc Tên)
- Upsert theo `ma_sp`
- File mẫu cũ kiểu Tên NVL/Loại/Giá trị → báo lỗi hướng dẫn dùng mẫu danh mục
- Định mức NVL: **Nhập định mức NVL** → `import_sp` · **Xem import_sp** · **Đồng bộ Thành phần** (`POST /api/import-sp/dong-bo`) — xem `import_sp.md`.

## Không đọc

Các file feature ở trên — không mở `App.monolith.backup.tsx` trừ khi cần tham chiếu lịch sử.
