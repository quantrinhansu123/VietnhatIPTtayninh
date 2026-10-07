# kho_cho

| | |
|---|---|
| **Bảng** | `kho_cho` |
| **Tab** | Không còn dùng cho nút **Nhập kho** trên `/can-tu-dong` (QR ghi thẳng `nhap_kho`) |
| **DB** | Project `grlcgkzotqishzxwpddc` — `SUPABASE_KHO_CHO_URL` / `SUPABASE_KHO_CHO_SERVICE_KEY`. Không dùng DB kiểm kho `yyddiuaankcrqfgbzusf` |
| **SQL** | `supabase-kho-cho.sql` — [SQL Editor](https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new) |

## Cột

Cùng cột dòng với `nhap_kho`: `id`, `ma_sp`, `ma_sp_quet`, `ten_sp`, `don_vi`, `loai`, `so_luong`, `ma_phieu`, `so_luong_chung_tu`, `don_gia`, `thanh_tien`, `ly_do`, `can_cu_bao_cao`, `id_dong_nhap_nguon`, `ma_phieu_nhap_nguon`, ảnh cân/bao, `id_bao_cao_nghiem_thu`, `id_bao_cao_hang_hong`, `created_at`, `updated_at`.

`ma_phieu` bắt buộc — phiếu đang chọn trên popup Nhập kho (phiếu chưa chốt trong ngày, hoặc tạo phiếu mới). Nút Nhập kho chưa ghi `phieu_nhap` / `nhap_kho`.

## API

| Method | Path | Nội dung |
|--------|------|----------|
| GET | `/api/kho-cho?ma_phieu=` | Dòng `kho_cho` của phiếu đang chọn |
| POST | `/api/kho-cho` | Ghi danh sách QR vào `kho_cho`. Mã đã có trong `kho_cho` trả về `duplicateCodes` |
| POST | `/api/kho-cho/xac-nhan` | Body `{ ma_phieu }` — đổ dòng `kho_cho` của phiếu vào `nhap_kho` (DB kho), rồi xóa khỏi `kho_cho` |

Nút **Nhập kho** trên `/can-tu-dong` không dùng bảng này nữa.

## Frontend

`src/features/can-tu-dong/index.tsx` — xác nhận Nhập kho không gọi `kho_cho`. Chọn ca + máy, tạo phiếu mới chưa chốt, ghi QR qua `POST /api/kho/quet-dot` vào `nhap_kho`.

`src/features/phieu-xuat-nhap-kho/index.tsx` — phiếu nhập thành phẩm đã chọn: **Nhập từ máy** hiện dòng `kho_cho`, **Xác nhận nhập kho** ghi sang `nhap_kho`.
