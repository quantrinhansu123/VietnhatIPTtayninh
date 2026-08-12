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

## Ý nghĩa cột DB

| Nhãn UI | Cột DB | Ý nghĩa | Ví dụ |
|---------|--------|---------|-------|
| Cân lõi | `tare_weight` | Số đọc ở bước cân lõi | 1,06 kg |
| Cân sản phẩm | `weight` | Tổng KL sản phẩm còn lõi | 7,84 kg |
| Trọng lượng bì | (UI, mặc định) | Mặc định **0,16 kg** — chưa lưu DB | 0,16 kg |
| Trọng lượng nhựa | (UI tính) | `weight − tare_weight − bì` | 6,62 kg |
| Ca | `ca` (API) | Từ `metadata` (`SOURCE_SHIFT=…`) hoặc suy theo giờ `captured_at` + khung giờ `cai_dat_thoi_gian` | HC1 |
| Ảnh lõi | `core_image_*` | Ảnh chụp bước cân lõi | Cloudinary |
| Ảnh sản phẩm | `product_image_*` | Ảnh chụp bước cân sản phẩm | Cloudinary |

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/can-tu-dong` | `core_preview_url` ← `core_image_*`; `product_preview_url`/`preview_url` ← `product_image_*`; bổ sung `can_loi`/`can_san_pham`/`khoi_luong_thuc`/`ca`; tự tính `net_weight` nếu thiếu |
| `POST /api/can-tu-dong/bulk-delete` | Body `{ ids }` — xóa nhiều dòng |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/can-tu-dong/index.tsx` | UI `/can-tu-dong`: **danh sách Cân AI cũ** (`can_tu_dong`) — bảng lọc/ảnh/tổng kg; Type `CanTuDongRecord` dùng chung `/phan-tich-tu-dong` |
| `src/features/can-tu-dong/pilot.tsx` | UI `/tram-can-qr`: nhúng iframe `https://tram-can-qr-pilot.onrender.com/` |
| `src/utils/canTuDongWeights.ts` | Công thức bì/nhựa + `sumCanTuDongSanLuongTotals`; `/phan-tich-tu-dong` lọc cân theo ngày+ca lệnh SX |
| `src/components/BbCanTuDongSanLuongPanel.tsx` | Tab «Báo cáo sản lượng» trên `/phan-tich-tu-dong` — cùng công thức; **Tổng nhựa thành phẩm** = tổng cột Trọng lượng nhựa |
| `src/components/WeighingImagePreviewModal.tsx` | Thumbnail + modal |
| `src/App.tsx` | Import + route tab |

## Rule Cursor

`.cursor/rules/weighing-image-preview.mdc` — ảnh mở modal trong app.
