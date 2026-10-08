# chi_tiet_san_pham

| | |
|---|---|
| **Bảng** | `chi_tiet_san_pham` |
| **DB** | DB chính (`bfnsopyvgvhaegqijpum`) |
| **SQL** | `supabase-chi-tiet-san-pham.sql` |
| **Lịch sử** | `bien_dong_chi_tiet_san_pham` — mỗi QR / mỗi phiếu nhập-xuất một dòng; lưu `ma_phieu`, `ngay_phieu`, kho, ca |
| **Migration** | `supabase-bien-dong-chi-tiet-san-pham.sql` tạo sổ biến động; `supabase-chi-tiet-san-pham-transaction.sql` ghi sổ biến động và cập nhật snapshot trong cùng RPC transaction; `supabase-chi-tiet-san-pham-dieu-chinh.sql` bổ sung cờ điều chỉnh cho phiếu kiểm kê |
| **Mục đích** | Lưu từng mã QR thành phẩm theo mã sản phẩm gốc, kho và trạng thái; nhập đặt trạng thái `trong_kho`, xuất đặt trạng thái `da_xuat`. |
| **Khóa liên kết** | `ma_sp_goc` → `san_pham.ma_sp`; `ma_sp_qr` là khóa chính duy nhất. |
| **API** | `POST /api/kho/phieu` sau khi lưu phiếu thành công chỉ đồng bộ snapshot nhập/xuất trong `chi_tiet_san_pham`. Không ghi `bien_dong_chi_tiet_san_pham`. `POST /api/kho/quet-dot` chỉ lưu đợt QR vào DB kho. |
| **Tồn hiện tại** | `GET /api/chi-tiet-san-pham/ton-kho?ma_sp_goc=...` đếm QR có trạng thái `trong_kho`; form đơn hàng tự làm mới số đếm khi đang mở. |
| **Feature** | `src/features/phieu-xuat-nhap-kho/index.tsx` gửi yêu cầu cập nhật chi tiết sau khi lưu phiếu thành công. |

`so_luong` trong snapshot mặc định và giới hạn bằng `1`, vì một dòng biểu diễn một mã QR. RPC khi lưu phiếu chỉ cập nhật snapshot `chi_tiet_san_pham`; xuất đặt `trang_thai='da_xuat'` và không ghi `bien_dong_chi_tiet_san_pham`. Xuất không từ chối mã khi snapshot thiếu hoặc khác `trong_kho`.

DB phiếu kho và DB chính là hai Supabase project riêng. RPC bảo đảm toàn bộ thay đổi trong `chi_tiet_san_pham` cùng commit hoặc rollback; không thể mở một transaction PostgreSQL duy nhất bao trùm cả hai project. Khi đồng bộ chi tiết lỗi, header phiếu được giữ `chua_chot` để có thể lưu lại.

Repo hiện có bảng `ma_san_pham_chi_tiet` đang phục vụ luồng QR/serial khác. Phiếu thành phẩm mới đồng bộ QR đã lưu trong DB kho sang bảng này; chưa chuyển dữ liệu cũ hoặc thay thế luồng cũ.
