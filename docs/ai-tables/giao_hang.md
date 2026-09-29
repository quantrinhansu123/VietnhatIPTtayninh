# giao_hang

| | |
|---|---|
| **Bảng** | `giao_hang` |
| **DB** | Chính — label `he-thong` (`SUPABASE_URL`) |
| **SQL** | `supabase-giao-hang.sql` |
| **Tab** | `giao-hang` → `/giao-hang` |
| **Menu** | Kinh doanh → Giao hàng |

## API (`server.ts`)

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/giao-hang` | Danh sách dòng |
| POST | `/api/giao-hang` | 1 dòng hoặc `{ ngay, bsx, so_phieu, lines: [...] }` |
| PUT | `/api/giao-hang/:id` | Cập nhật 1 dòng |
| DELETE | `/api/giao-hang/:id` | Xóa 1 dòng |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/giao-hang/index.tsx` | `GiaoHangPanel` — danh sách + form thêm/sửa |
| `src/App.tsx` | Shell routing — import panel |
| `src/app/menus.tsx` | Card + sidebar Kinh doanh |

## Cột

| Cột | Ý nghĩa |
|-----|---------|
| `id` | PK |
| `ngay` | Ngày giao |
| `bsx` | Biển số xe |
| `so_phieu` | Số phiếu |
| `tt` | Thứ tự dòng |
| `ma_kh` | Mã khách hàng |
| `dia_chi` | Địa chỉ |
| `sdt_kh` | SĐT khách hàng |
| `nvql` | Nhân viên quản lý |
| `ma_san_pham` | Mã sản phẩm |
| `ten_san_pham` | Tên sản phẩm |
| `sl` | Số lượng |
| `gia_ban` | Giá bán |
| `thanh_toan` | Thanh toán |
| `tong_gia_tri` | Tổng giá trị |
| `ghi_chu` | Ghi chú |

## Liên kết

`khach_hang`, `san_pham`, `danh_sach_xe`, `lenh_xuat_hang`
