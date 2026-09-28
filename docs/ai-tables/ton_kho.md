# ton_kho

| | |
|---|---|
| **Nguồn dữ liệu** | Danh sách QR trong kho từ `chi_tiet_san_pham`; biến động kỳ từ `bien_dong_chi_tiet_san_pham`; tên/đơn vị từ `san_pham` |
| **Tab** | `ton-kho` → `/ton-kho` |
| **SQL** | `supabase-chi-tiet-san-pham.sql`, `supabase-bien-dong-chi-tiet-san-pham.sql` |

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/ton-kho-qr-data` | Trả danh sách QR đang trong kho từ snapshot và số đầu kỳ/nhập/xuất/điều chỉnh/cuối kỳ từ sổ biến động QR |
| GET | `/api/ton-kho/chi-tiet` | API tồn kho cũ, không còn được feature `/ton-kho` gọi |
| GET | `/api/ton-kho/tong-hop` | API tồn kho dùng chung, hiện vẫn được `/kho-hang` gọi |

## Frontend

| File | Nội dung |
|---|---|
| `src/features/ton-kho/index.tsx` | Mặc định mở Bảng tổng hợp; danh sách chi tiết đọc từng QR đang trong kho từ `chi_tiet_san_pham`, tổng hợp tồn đầu/nhập/xuất/điều chỉnh/tồn cuối từ `bien_dong_chi_tiet_san_pham` |
| `src/App.tsx` | Shell routing, import `TonKhoPanel` |
| `src/app/menus.tsx` | Menu và tiêu đề tab |

Kho vật lý lấy từ `quan_ly_kho`. Trang này chỉ xử lý thành phẩm QR. Tồn cuối ở kỳ hiện tại đối chiếu snapshot `chi_tiet_san_pham`; các kỳ lịch sử tính từ sổ biến động. Cột điều chỉnh là số nhập điều chỉnh trừ số xuất điều chỉnh; số dương tăng tồn, số âm giảm tồn.

## Mã hậu tố lô/serial

Phiếu xuất/nhập kho ([src/features/phieu-xuat-nhap-kho/index.tsx](../../src/features/phieu-xuat-nhap-kho/index.tsx)) cho phép quét QR để thêm dòng với mã mang hậu tố lô/serial sau dấu `_` (VD `L30cm_3701190208G`), lưu nguyên vào `ma_npl`/`ma_sp`. Tên/ĐVT được tra theo tiền tố trước `_` trong danh mục (`kho_nvl`/`san_pham`) nếu mã hậu tố chưa có sẵn.

- **Chi tiết**: mỗi QR có `trang_thai='trong_kho'` trong `chi_tiet_san_pham` là một dòng; giữ nguyên mã QR đầy đủ.
- **Tổng hợp**: gộp theo `ma_sp_goc`, đếm biến động QR nhập/xuất theo ngày. Tồn cuối hiện tại đối chiếu snapshot; kỳ đã qua được tính lùi theo các biến động sau ngày kết thúc, rồi suy ra tồn đầu để giữ công thức `tồn đầu + nhập - xuất = tồn cuối`.
