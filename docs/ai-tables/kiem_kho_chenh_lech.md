# kiem_kho_chenh_lech (màn "Xử lý chênh lệch")

| | |
|---|---|
| **Bảng** | `kiem_kho_chenh_lech_xu_ly` |
| **Tab** | `kiem-kho-chenh-lech` → `/xu-ly-chenh-lech` |
| **DB** | Riêng — label `kiem-kho` (project `grlcgkzotqishzxwpddc`), cùng chỗ với `kiem_kho`/`kiem_kho_tong_hop` |
| **SQL** | `supabase-kiem-kho-chenh-lech-xu-ly.sql`; cập nhật sổ QR bằng `supabase-chi-tiet-san-pham-dieu-chinh.sql` trên DB chính |

## Mục đích

Đối chiếu số lượng đã kiểm kê của 1 đợt kiểm kho ([kiem_kho](./kiem_kho.md)) với tồn cuối kỳ sổ sách ([ton_kho](./ton_kho.md)), rồi cho phép tạo phiếu nhập/xuất điều chỉnh tồn kho cho phần chênh lệch. 3 tab:

- **Danh sách chi tiết chênh lệch**: hiển thị hợp của các mã QR còn trong kho tại thời điểm chốt và các mã đã quét trong đợt; so khớp nguyên mã đầy đủ (cả tiền tố và hậu tố lô/serial). Tab tổng hợp mới gom theo tiền tố.
## Vì sao không JOIN SQL

`kiem_kho` và các bảng kho thành phẩm nằm trên hai Supabase project khác nhau; API đọc cả hai nguồn rồi đối chiếu tại Node.

- `GET /api/kiem-kho/chenh-lech` tải toàn bộ dòng kiểm kê theo trang; tab chi tiết tải đủ các trang của `/api/kiem-kho` (500 dòng/trang), không cắt ở 500 mã.
- Tồn hệ thống thành phẩm được dựng theo từng `ma_sp_qr` từ `chi_tiet_san_pham` và `bien_dong_chi_tiet_san_pham`; dùng `created_at` để lấy trạng thái đúng tại `thoi_gian_xac_nhan` của đợt đã chốt. Nếu mã chưa có lịch sử biến động thì dựa vào `created_at`/`updated_at` của snapshot.
- Tab chi tiết so khớp nguyên mã QR đầy đủ giữa tồn tại thời điểm chốt và các dòng đã quét. Tab tổng hợp đếm kiểm kê theo `ma_nvl` (tiền tố sản phẩm) và cộng tồn hệ thống theo `ma_sp_goc`.

`ton_he_thong` là số QR còn trong kho tại đúng thời điểm chốt đợt (hoặc thời điểm hiện tại nếu đợt chưa chốt). `loai_kho` là `san_pham` khi tiền tố khớp danh mục thành phẩm; nếu không khớp thì `null` và không tạo được phiếu điều chỉnh cho dòng này.

## Bảng `kiem_kho_chenh_lech_xu_ly`

Không phải "trạng thái" tính toán được — chỉ là **lịch sử các lần đã tạo phiếu điều chỉnh**, để giao diện hiển thị "Đã xử lý" mà không phải suy luận lại. `ma_sp` lưu mã nguyên bản, gồm hậu tố lô/serial nếu có. Cột: `dot_kiem_kho`, `ma_sp`, `loai_phieu` (`nhap`/`xuat`), `so_luong_dieu_chinh`, `ma_phieu_dieu_chinh` (mã phiếu ở `phieu_xuat_nhap_kho`, DB chính), `ghi_chu`, `nguoi_xu_ly`, `xu_ly_luc`. Không có ràng buộc unique — 1 mã có thể được xử lý nhiều lần (mỗi lần thêm 1 dòng lịch sử); route GET chỉ lấy dòng mới nhất theo `ma_sp`.

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/kiem-kho/chenh-lech` | Query `dotKiemKho` (bắt buộc), `tenKho` (tuỳ chọn). Trả bảng tổng hợp `records[]`, tồn nguyên bản `he_thong_chi_tiet[]` và lịch sử theo mã nguyên bản `xu_ly_chi_tiet[]`. Record tổng hợp có thêm `trang_thai_xu_ly`: `chua_xu_ly`, `dang_xu_ly`, `da_xu_ly` hoặc `khong_can_xu_ly`. |
| POST | `/api/kiem-kho/chenh-lech-xu-ly` | Body `{ dot_kiem_kho, ma_sp, loai_phieu, so_luong_dieu_chinh, ma_phieu_dieu_chinh, ghi_chu?, nguoi_xu_ly? }` — `ma_sp` là mã nguyên bản; insert 1 dòng lịch sử sau khi tạo phiếu kho thành công. |
| POST | `/api/phieu-xuat-nhap-kho` | Phiếu điều chỉnh gửi `laDieuChinh: true`; tạo header `phieu_nhap`/`phieu_xuat` và từng dòng QR trong `nhap_kho`/`xuat_kho` trên DB kho; đồng thời ghi sổ QR và cập nhật snapshot qua RPC transaction trên DB chính. |

## Frontend

`src/features/xu-ly-chenh-lech/index.tsx` (`XuLyChenhLechPanel`) — tab "Phiếu Nhập/Xuất điều chỉnh" đối chiếu từng mã nguyên bản, hiển thị riêng tồn hệ thống, số lần kiểm, chênh lệch, loại phiếu và số lượng. Các dòng được chọn gộp theo `(loaiPhieu, kho vật lý)` thành phiếu, nhưng mỗi item và mỗi dòng lịch sử vẫn giữ nguyên mã đầy đủ.

Tab phiếu điều chỉnh có bộ lọc combobox theo mã QR đầy đủ, mã gốc hoặc tên sản phẩm. Gợi ý **Mã gốc** lọc toàn bộ serial của sản phẩm; gợi ý **Mã QR** lọc đúng một mã. Chọn tất cả và thống kê chỉ áp dụng trên các dòng đang hiển thị.

## Thêm bảng trên DB đã có

Chạy `supabase-kiem-kho-chenh-lech-xu-ly.sql` trên:
https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new
