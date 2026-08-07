# can_tu_dong

| | |
|---|---|
| **Bảng** | `can_tu_dong` |
| **Tab** | `can-tu-dong` → `/can-tu-dong` |
| **DB** | Riêng — label `can-tu-dong` (`SUPABASE_WEIGHING_*`) |
| **SQL** | (bảng đã có trên project cân; không migration local) |

## Env

| Biến | Mặc định |
|------|----------|
| `SUPABASE_CAN_TU_DONG_TABLE` | `can_tu_dong` |
| `SUPABASE_CAN_TU_DONG_STORAGE_BUCKET` | `roll-captures` |

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/can-tu-dong` | Chuẩn hoá: ảnh `core-weight` → `core_preview_url` (không nhân đôi sang Ảnh cuộn); cuộn từ `PRODUCT_WEIGHT`/`HUMAN_CONFIRMED_PRODUCT`; lõi từ `HUMAN_CONFIRMED_CORE` hoặc cột `weight` khi path lõi |
| `POST /api/can-tu-dong/bulk-delete` | Body `{ ids: string[]\|number[] }` — xóa nhiều dòng trên DB `can-tu-dong` |

## Cột lõi / cuộn (thực tế gateway)

| Nguồn | UI |
|------|----|
| Ảnh cuộn | `product_image_url` / `product_image_path` / `product_image_public_id` → `preview_url` |
| Ảnh lõi | `core_image_*` (fallback `image_*` nếu path `core-weight`) → `core_preview_url` |
| Net/Gross cuộn | `HUMAN_CONFIRMED_PRODUCT` / `PRODUCT_WEIGHT` trong `metadata.weight_raw` |
| TL/Net lõi | `HUMAN_CONFIRMED_CORE` hoặc cột `weight` khi ảnh lõi |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/can-tu-dong/index.tsx` | Bảng danh sách + checkbox chọn nhiều + xóa hàng loạt + modal ảnh |
| `src/components/WeighingImagePreviewModal.tsx` | Thumbnail + modal (không `target="_blank"`) |
| `src/App.tsx` | Import + route tab |

## Rule Cursor

`.cursor/rules/weighing-image-preview.mdc` — ảnh mở modal trong app.
