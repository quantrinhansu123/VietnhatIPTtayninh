# khach_hang

| **Bảng** | `khach_hang` |
| **Tab** | `customers` → `/khach-hang` |

**API:** `server.ts` — CRUD `/api/khach-hang`; `POST /api/khach-hang/replace`; `GET /api/address-lookup`; `PATCH /api/khach-hang/:id/dia-chi-moi`
**UI:** `src/features/khach-hang/index.tsx` — `CustomersPanel`
**Utils:** `src/utils/customerExcel.ts` — tải mẫu và đọc dữ liệu khách hàng từ Excel

### Excel

- **Tải mẫu Excel** — luôn tải được (không cần sẵn danh sách)
- **Xuất Excel** — xuất danh sách hiện tại
- **Tải Excel lên** — upsert theo `ma_khach_hang` (thiếu mã → tự sinh `KHxxx`); ô trống vẫn được; chỉ bắt buộc tên
- Không còn phụ thuộc RPC `replace_khach_hang_from_json` khi nhập thường

Liên kết: `don_hang`, `lenh_xuat_hang`
