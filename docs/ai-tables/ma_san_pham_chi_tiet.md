# ma_san_pham_chi_tiet

| | |
|---|---|
| **Bảng** | `ma_san_pham_chi_tiet` |
| **Tab** | Chi tiết sản phẩm trong `/san-pham` |
| **DB** | Chính — label `he-thong` |
| **SQL** | `supabase-san-pham-ma-chi-tiet.sql` |

## API

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/san-pham/:id/ma-chi-tiet` | Danh sách mã đầy đủ của sản phẩm |
| POST | `/api/ma-san-pham/danh-dau-in` | Tăng số lần in các mã đã chọn |
| POST | `/api/san-pham` | Khi có `initialQuantity`, gọi RPC tạo sản phẩm + mã + phiếu nhập |

## Frontend

`src/features/san-pham/index.tsx` — trường số lượng khởi tạo, tab Mã chi tiết và in QR từ mã đã lưu.

## Quy tắc tồn kho

- Mỗi mã đầy đủ có một dòng nhập kho số lượng 1 trong `phieu_xuat_nhap_kho`.
- Chi tiết tồn kho giữ nguyên hậu tố; tổng hợp gom theo tiền tố trước `_`.
- Thêm/sửa/xóa phiếu kho thành phẩm sẽ đồng bộ `trang_thai` của mã thành `trong_kho` hoặc `da_xuat`.
