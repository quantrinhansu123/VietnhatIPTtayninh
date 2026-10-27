# phieu_can_dinh_ki

| | |
|---|---|
| **Bảng** | `phieu_can_dinh_ki` |
| **Tab** | `weighing-summary` → `/tong-hop-ca` |
| **SQL** | `supabase-phieu-can-dinh-ki.sql` |
| **DB** | `phieu-can` (`SUPABASE_WEIGHING_*`) — fallback `he-thong` / local nếu thiếu bảng. |

## Env

| Label | Biến | Dùng cho |
|-------|------|----------|
| `phieu-can` | `SUPABASE_WEIGHING_*` | `/api/phieu-can-dinh-ki`, `can_tu_dong`, … |
| `he-thong` | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Fallback nếu bảng chưa có trên `phieu-can` |

## API (`server.ts`)

| Path | Dòng |
|------|------|
| `/api/phieu-can-dinh-ki/*` | `registerWeighingSlipRoutes`, client `supabaseWeighing` (ưu tiên) |

## Frontend

| File | Nội dung |
|------|----------|
| `src/components/WeighingShiftSummary.tsx` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |


## Rule Cursor

`.cursor/rules/weighing-image-preview.mdc` — ảnh phải mở modal, không tab mới.
