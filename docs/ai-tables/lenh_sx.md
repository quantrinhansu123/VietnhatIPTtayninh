# lenh_sx

| | |
|---|---|
| **Bảng** | `lenh_sx` |
| **Tab** | `production-orders` → `/lenh-san-xuat` |
| **SQL** | `supabase-lenh-sx.sql` |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/lenh-sx` | 4001 |
| POST | `/api/lenh-sx` | 4138 |
| POST | `/api/lenh-sx/from-don-hang/:id` | 4044 |
| PATCH/DELETE | `/api/lenh-sx/:id` | 4362–4434 |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/lenh-sx/index.tsx` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |


## Liên kết

`ke_hoach_san_xuat`, `don_hang`, `san_pham`

### Nhân sự theo vai trò

Các cột `truong_ca`, `nhan_su_chinh`, `tho_phu`, `hoc_viec` được nhập trong form thêm/sửa lệnh.
Cột `nhan_su` vẫn giữ chuỗi tổng hợp để tương thích báo cáo và dữ liệu cũ.

Form **Thêm / Sửa lệnh SX**: Trưởng ca / Nhân sự chính / Thợ phụ / Học việc là sổ xuống
từ nhân sự phòng **PHÂN XƯỞNG SẢN XUẤT** (nhận thêm biến thể tên `Sản xuất` / có chữ Phân xưởng).
API tải ` /api/nhan-su?format=groups&scope=all` rồi lọc phòng trên client (tránh mất NV vì filter chi nhánh mặc định).
Cột «Nhân sự» tự tổng hợp theo các vai trò đã chọn.

### Lọc theo đăng nhập

- Nếu `cong_viec` / chức vụ đăng nhập đúng **Nhân Viên** (không phân biệt hoa thường, bỏ dấu khi so):
  chỉ hiện lệnh SX có tên người đó trong bất kỳ cột phân công nào (`nhan_su`, `truong_ca`, `nhan_su_chinh`, `tho_phu`, `hoc_viec`).
- Admin / fullAccess vẫn xem tất cả.

### Danh sách lệnh SX

Mỗi dòng lệnh: cột **Mã hàng / Tên hàng / Số lượng** trình bày bảng con (mỗi SP một dòng), không ghép bằng `|`.
