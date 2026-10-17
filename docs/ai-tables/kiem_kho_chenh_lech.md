# kiem_kho_chenh_lech (màn "Xử lý chênh lệch")

| | |
|---|---|
| **Bảng** | Không còn bảng riêng; phiếu điều chỉnh chỉ ghi `nhap_kho`, `xuat_kho`, `phieu_nhap`, `phieu_xuat` (DB kho) |
| **Tab** | `kiem-kho-chenh-lech` → `/xu-ly-chenh-lech` |
| **DB** | Riêng — label `kiem-kho` (project `grlcgkzotqishzxwpddc`), cùng chỗ với `kiem_kho`/`kiem_kho_tong_hop` |
| **SQL** | Không cần (bảng `kiem_kho_chenh_lech_xu_ly` cũ không còn được ghi) |

## Mục đích

Đối chiếu số lượng đã kiểm kê của 1 đợt kiểm kho ([kiem_kho](./kiem_kho.md)) với tồn cuối kỳ sổ sách ([ton_kho](./ton_kho.md)), rồi cho phép tạo phiếu nhập/xuất điều chỉnh tồn kho cho phần chênh lệch. 3 tab:

- **Danh sách chi tiết chênh lệch**: hiển thị hợp của các mã QR còn trong kho tại thời điểm chốt và các mã đã quét trong đợt; so khớp nguyên mã đầy đủ (cả tiền tố và hậu tố lô/serial). Tab tổng hợp mới gom theo tiền tố.
## Vì sao không JOIN SQL

`kiem_kho` và các bảng kho thành phẩm nằm trên hai Supabase project khác nhau; API đọc cả hai nguồn rồi đối chiếu tại Node.

- `GET /api/kiem-kho/chenh-lech` tải toàn bộ dòng kiểm kê theo trang; tab chi tiết tải đủ các trang của `/api/kiem-kho` (500 dòng/trang), không cắt ở 500 mã.
- Tồn hệ thống thành phẩm lấy từ nhập/xuất kho theo từng mã QR (`loadTonKhoSanPhamFromKho`) tại ngày xác nhận của đợt đã chốt.
- Tab chi tiết so khớp nguyên mã QR đầy đủ giữa tồn tại thời điểm chốt và các dòng đã quét. Tab tổng hợp đếm kiểm kê theo `ma_nvl` (tiền tố sản phẩm) và cộng tồn hệ thống theo `ma_sp_goc`.

`ton_he_thong` là số QR còn trong kho tại đúng thời điểm chốt đợt (hoặc thời điểm hiện tại nếu đợt chưa chốt). `loai_kho` là `san_pham` khi tiền tố khớp danh mục thành phẩm; nếu không khớp thì `null` và không tạo được phiếu điều chỉnh cho dòng này.

## Bảng `kiem_kho_chenh_lech_xu_ly`

**Đã không còn dùng.** Trạng thái "Đã xử lý" suy ra từ phiếu điều chỉnh có `ly_do` = `Điều chỉnh tồn kho sau kiểm kê - đợt <dot>` trong `phieu_nhap`/`phieu_xuat` (mã SP lấy từ dòng `nhap_kho`/`xuat_kho`). Xóa phiếu điều chỉnh thì dòng quay lại "chưa xử lý".

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/kiem-kho/chenh-lech` | Query `dotKiemKho` (bắt buộc), `tenKho` (tuỳ chọn). Trả bảng tổng hợp `records[]`, tồn nguyên bản `he_thong_chi_tiet[]` và lịch sử theo mã nguyên bản `xu_ly_chi_tiet[]`. Record tổng hợp có thêm `trang_thai_xu_ly`: `chua_xu_ly`, `dang_xu_ly`, `da_xu_ly` hoặc `khong_can_xu_ly`. |
| POST | `/api/kho/luu-phieu` | Phiếu điều chỉnh gửi `laDieuChinh: true`; tạo header `phieu_nhap`/`phieu_xuat` và từng dòng QR trong `nhap_kho`/`xuat_kho` trên DB kho. |

## Frontend

`src/features/xu-ly-chenh-lech/index.tsx` (`XuLyChenhLechPanel`) — tab "Phiếu Nhập/Xuất điều chỉnh" đối chiếu từng mã nguyên bản, hiển thị riêng tồn hệ thống, số lần kiểm, chênh lệch, loại phiếu và số lượng. Các dòng được chọn gộp theo `(loaiPhieu, kho vật lý)` thành phiếu, nhưng mỗi item và mỗi dòng lịch sử vẫn giữ nguyên mã đầy đủ.

Tab phiếu điều chỉnh có bộ lọc combobox theo mã QR đầy đủ, mã gốc hoặc tên sản phẩm. Gợi ý **Mã gốc** lọc toàn bộ serial của sản phẩm; gợi ý **Mã QR** lọc đúng một mã. Chọn tất cả và thống kê chỉ áp dụng trên các dòng đang hiển thị.

## Thêm bảng trên DB đã có

Chạy `supabase-kiem-kho-chenh-lech-xu-ly.sql` trên:
https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new
