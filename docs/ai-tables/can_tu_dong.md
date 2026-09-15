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
| Trọng lượng tiêu chuẩn | (UI, từ `san_pham`) | `tong_trong_luong` khớp **tiền tố** Mã SP từ QR (trước `_` / trước `+`) | 7,5 kg |
| Nhựa thực tế | (UI tính) | `weight − tare_weight − bì` | 6,62 kg |
| Nhựa định mức | (UI, từ `san_pham`) | `trong_luong_nhua`; không có thì TL tiêu chuẩn − lõi LT − bì | 6,28 kg |
| Chênh lệch nhựa (TT−ĐM) | (UI tính) | **Nhựa thực tế − Nhựa định mức** | +0,34 kg |
| Phần trăm | (UI tính) | (Chênh lệch nhựa ÷ Nhựa thực tế) × 100% | +5,1% |
| Nhựa tiêu chuẩn | (UI tổng) | Σ cột **Trọng lượng tiêu chuẩn** (`san_pham.tong_trong_luong` theo Mã SP) | |
| Trọng lượng TT | (UI) | = cột **Cân sản phẩm**; tổng thanh trên = Σ Cân sản phẩm | |
| Lõi lý thuyết | (UI, từ `san_pham`) | `trong_luong_loi` khớp Mã SP từ QR; tổng thanh = **Tổng trọng lượng lõi lý thuyết** | 1,06 kg |
| Tổng trọng lượng lõi | (UI tổng) | Σ cột **Cân lõi** (`tare_weight`) | |
| Chênh lệch lõi | (UI tính) | **Cân lõi − Lõi lý thuyết** (cùng kiểu công thức Chênh lệch TT−LT) | +0,02 kg |
| Ca | `ca` (API) | Từ `metadata` (`SOURCE_SHIFT=…`) hoặc suy theo giờ `captured_at` + khung giờ `cai_dat_thoi_gian` | HC1 |
| Ngày | `metadata.SOURCE_DATE` / `work_date` (UI) | Ngày nghiệp vụ — **không** lấy từ `captured_at` (Ngày cân / Thời điểm) | 20/08/2026 |
| Ngày giờ | `captured_at` (UI) | Thời điểm cân thực tế — theo dõi khi nào ghi nhận | 20/08/2026, 14:32:05 |
| Máy | `metadata.machine` / `SOURCE_MACHINE` (UI) | Máy sản xuất | Máy 01 |
| Lệnh SX | `metadata.production_order` (UI) | `SOURCE_PRODUCTION_ORDER` trong `weight_raw` | LSX100 |
| Ảnh lõi | `core_image_*` | Ảnh chụp bước cân lõi | Cloudinary |
| Ảnh sản phẩm | `product_image_*` | Ảnh chụp bước cân sản phẩm | Cloudinary |

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/cloudinary/proxy?url=` | Proxy ảnh `res.cloudinary.com/.../image/upload/` (tránh ERR_CERT_VERIFIER_CHANGED trên Chrome) |
| `GET /api/can-tu-dong` | `core_preview_url` ← `core_image_*`; `product_preview_url`/`preview_url` ← `product_image_*`; bổ sung `ngay`/`can_loi`/`can_san_pham`/`khoi_luong_thuc`/`ca`/`lenh_sx`. `from`+`to` mặc định lọc `captured_at`; **`dateBy=ngay`** lọc cột **Ngày** (`SOURCE_DATE`) và vẫn cắt `captured_at` ±3 ngày. **`images=0`** bỏ ký URL ảnh (dùng khi Tính toán) |
| `POST /api/can-tu-dong/bulk-delete` | Body `{ ids }` — xóa nhiều dòng |
| `POST /api/can-tu-dong/bulk-autofill` | Body `{ ids, ngay?, lenh_sx?, ca?, may? }` hoặc `{ all: true, ngay?, ca?, may? }` — ghi `metadata.shift` + `SOURCE_SHIFT` + `SOURCE_MACHINE`. Không gửi `lenh_sx` thì giữ lệnh cũ. |
| `POST /api/can-tu-dong/bulk-set-ca` | Body `{ ids, ca? }` — **chỉ** điền Ca (mặc định `12C2`). UI nút **Chọn Ca · điền hàng loạt** mở modal chọn ca rồi gửi id các dòng **đang hiện theo bộ lọc** |
| `POST /api/can-tu-dong/bulk-set-ngay` | Body `{ ids, ngay? }` — **chỉ** đổi cột **Ngày** (`SOURCE_DATE` / `work_date`). Không gửi `ngay` thì dùng hôm nay (Asia/Ho_Chi_Minh). UI `/can-tu-dong`: tick dòng → nút **Sửa ngày** mở modal rồi gửi id các dòng **đã chọn** |
| `POST /api/can-tu-dong/bulk-set-tare` | Body `{ ids, tare_weight }` — đổi cột **Cân lõi** (`tare_weight`); `net_weight` do DB generated tự tính |
| `POST /api/can-tu-dong/bulk-set-ma-sp` | Body `{ ids, ma_sp }` — đổi phần **Mã SP** trong `qr_code` (giữ `_hậuTố` / serial / `+LSX…`); cột TL tiêu chuẩn / lõi LT / chênh lệch trên UI tự theo mã mới. UI `/can-tu-dong` nút **Đồng bộ theo Mã SP**: mặc định lấy **tiền tố QR**, hoặc chọn một mã danh mục rồi điền hàng loạt |
| `POST /api/can-tu-dong/:id/duplicate` | Nhân bản y nguyên 1 dòng (QR, cân, metadata, ảnh, ngày, ca, …). UI: nút **Nhân bản** trên cột Thao tác |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/can-tu-dong/index.tsx` | UI `/can-tu-dong`: **Phân tích** · **Bộ lọc** · **Đồng bộ theo Mã SP** (tiền tố QR) · Excel · In |
| `src/components/CanTuDongPrintSheet.tsx` | Mẫu in: danh sách SP · khối **Tổng hợp nhựa** |
| `src/utils/canTuDongExcel.ts` | Xuất Excel theo bộ lọc đang chọn |
| `src/features/can-tu-dong/pilot.tsx` | UI `/tram-can-qr` · `/can-kiem-kho` |
| `src/utils/canTuDongWeights.ts` | `parseCanTuDongQrProductCode` = tiền tố trước `_`/`+`; công thức bì/nhựa + tổng cột |
| `src/components/BbCanTuDongSanLuongPanel.tsx` | Panel từng phiếu cân AI — giữ cho `/can-tu-dong`; **không** còn dùng trên `/phan-tich-tu-dong` |
| `src/components/BbCanTuDongTongHopPanel.tsx` | Tab **Dữ liệu cân thực tế** trên `/phan-tich-tu-dong`: đọc `can_tu_dong_tong_hop` (Số cuộn thực tế + Tổng trọng lượng thực tế), không load từng phiếu |
| `src/components/WeighingImagePreviewModal.tsx` | Thumbnail + modal |
| `src/App.tsx` | Import + route tab |

## Rule Cursor

`.cursor/rules/weighing-image-preview.mdc` — ảnh mở modal trong app.

## Liên quan

[can_tu_dong_tong_hop.md](./can_tu_dong_tong_hop.md) — tổng hợp số cuộn / trọng lượng cho `/phan-tich-tu-dong`.
