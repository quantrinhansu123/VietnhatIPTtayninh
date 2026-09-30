# khach_hang

| **Bảng** | `khach_hang` |
| **Tab** | `customers` → `/khach-hang` |

**API:** `server.ts` — CRUD `/api/khach-hang` (GET phân trang PostgREST `range` 1000 để lấy hết); `POST /api/khach-hang/replace`; `GET /api/address-lookup`; `PATCH /api/khach-hang/:id/dia-chi-moi`
**UI:** `src/features/khach-hang/index.tsx` — `CustomersPanel` + `TablePagination` (25/50/100/200)
**Utils:** `src/utils/customerExcel.ts` — tải mẫu và đọc dữ liệu khách hàng từ Excel
**SQL:** `supabase-khach-hang.sql`

### Excel

- **Tải mẫu Excel** — luôn tải được (không cần sẵn danh sách)
- **Tải mẫu SĐT** — file 2 cột `Mã KH` + `SĐT` (ô text `@`, số dài không bị Excel đổi thành số). Mẫu điền sẵn mã và SĐT hiện có.
- **Tải SĐT lên** — khớp cột `Mã KH` / `SĐT`, chỉ cập nhật điện thoại của mã đã có. Mã lạ hoặc trùng trong file bị bỏ qua.
- **Xuất Excel** — xuất danh sách hiện tại
- **Tải Excel lên** — upsert theo `ma_khach_hang` (thiếu mã → tự sinh `KHxxx`); ô trống vẫn được; chỉ bắt buộc tên
- Không còn phụ thuộc RPC `replace_khach_hang_from_json` khi nhập thường

Liên kết: `don_hang`, `lenh_xuat_hang`
