# giao_hang

| | |
|---|---|
| **Bảng** | `giao_hang` |
| **DB** | Chính — label `he-thong` (`SUPABASE_URL`) |
| **SQL** | `supabase-giao-hang.sql` |
| **UI** | **Đã bỏ** — không còn tab/route `/giao-hang` |
| **API** | Vẫn giữ `/api/giao-hang` (nếu cần dùng lại) |

## API (`server.ts`)

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/giao-hang` | Danh sách dòng |
| POST | `/api/giao-hang` | 1 dòng hoặc `{ ngay, bsx, so_phieu, lines: [...] }` |
| PUT | `/api/giao-hang/:id` | Cập nhật 1 dòng |
| DELETE | `/api/giao-hang/:id` | Xóa 1 dòng |

## Frontend

Đã gỡ khỏi menu Kinh doanh, `routes.ts`, `App.tsx`.  
Code cũ còn tại `src/features/giao-hang/index.tsx` nhưng không mount.
