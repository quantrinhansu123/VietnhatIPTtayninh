# ton_kho

| | |
|---|---|
| **Nguồn dữ liệu** | Thành phẩm từ `san_pham` và `phieu_xuat_nhap_kho` |
| **Tab** | `ton-kho` → `/ton-kho` |
| **SQL** | `supabase-kho-nvl-ten-kho.sql`, `supabase-san-pham-ten-kho.sql`, `supabase-phieu-xuat-nhap-kho-ten-kho.sql`, `supabase-ton-kho-rpc.sql` |

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/ton-kho/chi-tiet` | Trả từng mã thành phẩm còn tồn dương ở cuối khoảng ngày; giữ nguyên hậu tố và không gộp mã |
| GET | `/api/ton-kho/tong-hop` | Trả số liệu tồn đến ngày; nhận `loai_kho` cho NVL, thành phẩm và các kho vật tư khác; tự tính từ bảng nếu RPC chưa được cài |

## Frontend

| File | Nội dung |
|---|---|
| `src/features/ton-kho/index.tsx` | Chi tiết hiển thị mã SP, số lượng tồn, tên SP, loại SP và kho; tổng hợp gộp theo tiền tố trước `_`; **Tổng hợp kỳ**: tồn đầu theo ngày đầu kỳ, nhập/xuất/tồn cuối từ `phieu_xuat_nhap_kho` từ ngày đó trở đi (cập nhật kỳ gần nhất sẽ bổ sung sau) |
| `src/App.tsx` | Shell routing, import `TonKhoPanel` |
| `src/app/menus.tsx` | Menu và tiêu đề tab |

Kho vật lý lấy từ `quan_ly_kho`. Trang này chỉ xử lý `san_pham`.

## Mã hậu tố lô/serial

Phiếu xuất/nhập kho ([src/features/phieu-xuat-nhap-kho/index.tsx](../../src/features/phieu-xuat-nhap-kho/index.tsx)) cho phép quét QR để thêm dòng với mã mang hậu tố lô/serial sau dấu `_` (VD `L30cm_3701190208G`), lưu nguyên vào `ma_npl`/`ma_sp`. Tên/ĐVT được tra theo tiền tố trước `_` trong danh mục (`kho_nvl`/`san_pham`) nếu mã hậu tố chưa có sẵn.

- **Chi tiết**: mỗi mã (kể cả từng hậu tố) là một dòng riêng — không đổi so với trước.
- **Tổng hợp**: gộp các dòng cùng tiền tố lại (server.ts, `groupTonKhoRowsByPrefix`), cộng dồn tồn đầu/nhập/xuất rồi tính `tồn cuối = tồn đầu + nhập - xuất`. Áp dụng cho cả khi RPC đã cài lẫn khi tính fallback từ bảng.
