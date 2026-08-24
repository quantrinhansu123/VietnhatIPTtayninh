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
| Trọng lượng tiêu chuẩn | (UI, từ `san_pham`) | `tong_trong_luong` (Tổng TL / Khối lượng) khớp Mã SP từ QR | 7,5 kg |
| Chênh lệch | (UI tính) | **Trọng lượng TT − Trọng lượng tiêu chuẩn** (thực tế − LT) | +0,12 kg |
| Phần trăm | (UI tính) | (Chênh lệch ÷ Tiêu chuẩn) × 100% | +1,6% |
| Trọng lượng nhựa | (UI tính) | `weight − tare_weight − bì` | 6,62 kg |
| Nhựa tiêu chuẩn | (UI tổng) | Σ cột **Trọng lượng tiêu chuẩn** (`san_pham.tong_trong_luong` theo Mã SP) | |
| Trọng lượng TT | (UI) | = cột **Cân sản phẩm**; tổng thanh trên = Σ Cân sản phẩm | |
| Lõi lý thuyết | (UI, từ `san_pham`) | `trong_luong_loi` khớp Mã SP từ QR; tổng thanh = **Tổng trọng lượng lõi lý thuyết** | 1,06 kg |
| Tổng trọng lượng lõi | (UI tổng) | Σ cột **Cân lõi** (`tare_weight`) | |
| Chênh lệch lõi | (UI tính) | **Cân lõi − Lõi lý thuyết** (cùng kiểu công thức Chênh lệch TT−LT) | +0,02 kg |
| Ca | `ca` (API) | Từ `metadata` (`SOURCE_SHIFT=…`) hoặc suy theo giờ `captured_at` + khung giờ `cai_dat_thoi_gian` | HC1 |
| Ngày | `metadata.SOURCE_DATE` / `work_date` (UI) | Ngày nghiệp vụ — **không** lấy từ `captured_at` (Ngày cân / Thời điểm) | 20/08/2026 |
| Máy | `metadata.machine` / `SOURCE_MACHINE` (UI) | Máy sản xuất | Máy 01 |
| Lệnh SX | `metadata.production_order` (UI) | `SOURCE_PRODUCTION_ORDER` trong `weight_raw` | LSX100 |
| Ảnh lõi | `core_image_*` | Ảnh chụp bước cân lõi | Cloudinary |
| Ảnh sản phẩm | `product_image_*` | Ảnh chụp bước cân sản phẩm | Cloudinary |

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/can-tu-dong` | `core_preview_url` ← `core_image_*`; `product_preview_url`/`preview_url` ← `product_image_*`; bổ sung `ngay`/`can_loi`/`can_san_pham`/`khoi_luong_thuc`/`ca`/`lenh_sx`. `from`+`to` mặc định lọc `captured_at`; **`dateBy=ngay`** lọc cột **Ngày** (`SOURCE_DATE`), không lọc ngày cân |
| `POST /api/can-tu-dong/bulk-delete` | Body `{ ids }` — xóa nhiều dòng |
| `POST /api/can-tu-dong/bulk-autofill` | Body `{ ids, ngay?, lenh_sx?, ca?, may? }` hoặc `{ all: true, ngay?, ca?, may? }` — ghi `metadata.shift` + `SOURCE_SHIFT` + `SOURCE_MACHINE`. Không gửi `lenh_sx` thì giữ lệnh cũ. |
| `POST /api/can-tu-dong/bulk-set-ca` | Body `{ ids, ca? }` — **chỉ** điền Ca (mặc định `12C2`) |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/can-tu-dong/index.tsx` | UI `/can-tu-dong`: **Phân tích** (Kém/Hơn cân) · **Bộ lọc** (Mã SP · Tất cả chênh lệch / So sánh với 2%) · cột Mã SP · Chênh lệch · Phần trăm · **Quy hết 20/08 · 12C2 · Máy Bao Bì** (mọi dòng) · Tự động điền (dòng đã chọn) · Excel · In |
| `src/components/CanTuDongPrintSheet.tsx` | Mẫu in tổng hợp: STT · Mã SP · Tên SP · Số lượng · Tổng TL (Cân SP) · Tổng TL lõi · Tổng TL bì · TL nhựa + dòng Tổng cộng |
| `src/utils/canTuDongExcel.ts` | Xuất Excel theo bộ lọc đang chọn |
| `src/features/can-tu-dong/pilot.tsx` | UI `/tram-can-qr`: iframe `https://tram-can-qr-pilot.onrender.com/` · UI `/can-kiem-kho`: iframe `.../kiem-kho` (**Cân kiểm kho**) |
| `src/utils/canTuDongWeights.ts` | Công thức bì/nhựa + `sumCanTuDongSanLuongTotals` + `sumCanTuDongNhuaTieuChuanKg` + `sumCanTuDongLoiTieuChuanKg` |
| `src/components/BbCanTuDongSanLuongPanel.tsx` | Panel sản lượng từ cân AI trên `/phan-tich-tu-dong` (`sanLuongSource='can-tu-dong'`) — ô **Báo cáo sản lượng** = tổng cột **Trọng lượng nhựa** (`SP − lõi − bì 0,16`) trên `/can-tu-dong`, lọc **Ngày · Ca · Máy**. **Ngày = Tất cả** không cắt cột Ngày (kể cả trống / không chênh lệch) |
| `src/components/WeighingImagePreviewModal.tsx` | Thumbnail + modal |
| `src/App.tsx` | Import + route tab |

## Rule Cursor

`.cursor/rules/weighing-image-preview.mdc` — ảnh mở modal trong app.
