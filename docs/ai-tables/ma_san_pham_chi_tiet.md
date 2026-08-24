# ma_san_pham_chi_tiet

| | |
|---|---|
| **Bảng** | `ma_san_pham_chi_tiet` |
| **Tab** | Chi tiết phiếu nhập tại `/lich-su-xuat-nhap-kho` |
| **DB** | Chính — label `he-thong` |
| **SQL** | `supabase-san-pham-ma-chi-tiet.sql`, `supabase-ma-san-pham-chi-tiet-delete.sql` |

## API

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/san-pham/:id/ma-chi-tiet` | Danh sách mã đầy đủ của sản phẩm |
| POST | `/api/ma-san-pham/danh-dau-in` | Tăng số lần in các mã đã chọn |
| GET | `/api/phieu-xuat-nhap-kho/:slipCode/ma-qr` | Danh sách QR được sinh bởi một phiếu nhập |
| POST | `/api/phieu-xuat-nhap-kho` | Phiếu nhập thành phẩm sinh serial + mã + tồn kho trong một transaction |

## Frontend

`src/features/phieu-xuat-nhap-kho/index.tsx` — sinh QR khi nhập kho và in lại từ chi tiết lịch sử phiếu.

## Quy tắc tồn kho

- Mỗi mã đầy đủ có một dòng nhập kho số lượng 1 trong `phieu_xuat_nhap_kho`.
- Chi tiết tồn kho giữ nguyên hậu tố; tổng hợp gom theo tiền tố trước `_`.
- Thêm/sửa/xóa phiếu kho thành phẩm sẽ đồng bộ `trang_thai` của mã thành `trong_kho` hoặc `da_xuat`.
