# kho (DB kho mới)

| | |
|---|---|
| **Bảng** | `kho` (+ `phieu_xuat`, `phieu_nhap`, `xuat_kho`, `nhap_kho`) |
| **DB** | Project riêng — `SUPABASE_KHO_URL` / `SUPABASE_KHO_SERVICE_KEY` |
| **SQL** | `supabase-db-kho.sql` |
| **Migration** | `supabase-nhap-kho-ma-qr-columns.sql` — cột QR cho `nhap_kho`; `supabase-phieu-nhap-xuat-metadata.sql` — cột tùy chọn `kho`, `ca`, `may`, `ghi_chu` cho hai bảng phiếu |

## API (`server.ts`)

| Method | Path | Nội dung |
|--------|------|----------|
| GET | `/api/kho/chi-tiet?loai_phieu=nhap|xuat&ma_phieu=...&limit=50&offset=0` | Phân trang chi tiết `nhap_kho`/`xuat_kho`; `summary=true` trả tổng hợp theo mã gốc. Đọc theo từng đoạn `.range()` để vượt giới hạn mặc định 1.000 dòng của Supabase |
| GET | `/api/kho/lich-su` | Ghép header `phieu_nhap`/`phieu_xuat` với dòng `nhap_kho`/`xuat_kho` theo `ma_phieu` cho trang lịch sử |
| POST | `/api/kho/quet` | Mỗi lần quét máy → insert 1 dòng `nhap_kho` hoặc `xuat_kho` (`so_luong=1`), upsert header `phieu_nhap`/`phieu_xuat`, cập nhật tồn `kho`; cả hai bảng dòng lưu `ma_sp` gốc, `ma_sp_quet` đầy đủ và `ten_sp` |
| POST | `/api/kho/phieu` | Cập nhật metadata tùy chọn lên header phiếu nhập/xuất sau khi lưu phiếu |
| DELETE | `/api/kho/phieu/:ma_phieu` | Xóa dòng và header của phiếu trong hai bảng chi tiết/header tương ứng |

Body `/api/kho/quet`: `loai_phieu` (`nhap`\|`xuat`), `ma_sp` (mã đầy đủ vừa quét), `ma_phieu?`, `loai?`, `ten_sp?`, `nhan_su?`, `ngay?`, `so_luong?` (mặc định 1). `/api/kho/phieu` nhận `loai_phieu`, `ma_phieu`, `ngay`, `nhan_su`, `kho`, `ca`, `may`, `ghi_chu`.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | `addLineFromScan` giữ mã thành phẩm trong phiếu nháp; nút **Lưu đợt** mới ghi từng QR vào `/api/kho/quet` (`nhap_kho`/`xuat_kho`) và gộp SL trên form |
| `src/components/ProductQrScanner.tsx` | Hỗ trợ `onScan` async; feedback “Đã ghi nhận” |

## Ghi chú

- Tồn `kho.ma_sp` gộp theo tiền tố trước `_`; `nhap_kho`/`xuat_kho` lưu mã gốc trong `ma_sp` và QR đầy đủ trong `ma_sp_quet` cho phiếu thành phẩm.
- Chưa cấu hình `SUPABASE_KHO_*` → API trả 503; `/api/health` báo `databases.kho.connected=false`.

## Lưu phiếu thành phẩm hai bước

- **Lưu đợt** gọi `POST /api/kho/quet` với `chi_tiet_only=true`: chỉ ghi dòng vào `nhap_kho` hoặc `xuat_kho`, không tạo header `phieu_nhap` / `phieu_xuat` và không cập nhật bảng `kho`.
- **Lưu phiếu** mới upsert header qua `POST /api/kho/phieu`; FE yêu cầu lưu hết mã đã quét trước khi lập phiếu.
- Dòng đã lưu trong đợt nhưng chưa có header có thể xóa riêng qua `DELETE /api/kho/chi-tiet`.
- DB kho cần chạy `supabase-kho-stage-lines.sql` một lần để bỏ FK từ bảng dòng sang header, cho phép lưu đợt trước khi lập phiếu.