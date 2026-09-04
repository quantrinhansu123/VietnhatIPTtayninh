# bb_bao_cao_tinh_toan

Snapshot báo cáo tổng hợp máy BB sau khi bấm **Tính toán** — `/phan-tich-tu-dong` · `/phan-tich` · bảng điều khiển.

Vào trang **không** tự tính lại; chỉ đọc bản đã lưu `bb_bao_cao_tinh_toan`. Bấm **Tính toán** mới build + upsert DB.

KPI header (sản lượng cân AI, lỗi hỏng, màng cách nhiệt, …) cũng **chỉ** lấy từ `payload.summary` — không cộng live từ `can_tu_dong` / phiếu.

Tab **Báo cáo sản lượng**: danh sách NVL lấy đủ từ `san_pham.npl_phan_tram`; số `SL NVL` lấy từ snapshot `bao_cao_san_luong_nvl_dinh_muc`. **TL NVL %** = Σ **Nhựa thực tế** (Thành phẩm) trên `can_tu_dong` (ngày·ca·máy·mã SP) × tỉ lệ %; không có lần cân thì fallback `trong_luong_nhua × SL`. Tính toán **không** tự ghi Thành phần SP.

**Phiếu in = mirror tab:** mục 3.1/3.2 lấy `thucDungGroups` (builder `buildBbTieuHaoNvlThucDungRows`); mục 4.1 lấy `danhGiaGroups.summaryRows`. Không tính độc lập trên `ControlBoardBbMachineReportPrintSheet`. Snapshot cũ thiếu field → bấm **Tính toán** lại.

## SQL

`supabase-bb-bao-cao-tinh-toan.sql` — chạy trên Supabase (DB hệ thống).

```bash
node scripts/run-sql-file.mjs supabase-bb-bao-cao-tinh-toan.sql
```

(Cần `SUPABASE_DB_PASSWORD` hoặc `SUPABASE_DB_URL` trong `.env`.)

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bb-bao-cao-tinh-toan?khoa_on_dinh=` | Tải 1 bản theo khóa |
| PUT | `/api/bb-bao-cao-tinh-toan` | Upsert `{ khoa_on_dinh, ngay_tu, ngay_den, ca, may, nguon_san_luong, include_all_machines, ma_lenh_filter, payload }` |

Khóa ổn định: `ngay_tu|ngay_den|ca|may|nguon_san_luong|include_all|ma_lenh(*)`.

`payload` (jsonb): toàn bộ groups/rows + summary KPI đã tính — gồm `thucDungRows`/`thucDungGroups` và `danhGiaGroups[].summaryRows` (mẫu Excel Báo cáo tổng hợp: STT=mã NVL · tỉ lệ hao hụt · ĐM vật tư · thực xuất · chênh lệch · đơn giá · thành tiền · đánh giá; tách **Vật tư trộn** / **Các vật tư còn lại** + dòng **Tổng**).

Tab **Dữ liệu trong lệnh sản xuất** còn ghi bảng riêng **`bc_lsx`** (cùng `khoa_on_dinh`) — xem [bc_lsx.md](./bc_lsx.md).

## UI / utils

| File | Vai trò |
|------|---------|
| `ControlBoardBbMachineReportTable.tsx` | Nút **Tính toán** + load snapshot; tab tiêu hao / đánh giá / thành phẩm |
| `src/utils/bbBaoCaoTinhToan.ts` | Key + `buildBbMachineReportSnapshot` |
| `src/utils/bbTieuHaoNvlPrintRows.ts` | Builder tiêu hao khớp phiếu in (nguồn tab + in) |

## Liên quan

`control_board`, `bb_phan_tich_danh_gia`, `bb_bao_cao_ly_do`
