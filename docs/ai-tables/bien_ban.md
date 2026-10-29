# bien_ban (Kiểm định tem)

| | |
|---|---|
| **Bảng** | `bien_ban` (DB chính) · tra cứu từ `can_tu_dong` (DB cân) + `lenh_sx` |
| **Tab / Route** | `kiem-dinh-tem` · `/kiem-dinh-tem` · Menu Kho → **Kiểm định tem** |
| **SQL** | `supabase-bien-ban.sql` |

## API (`server.ts`, cạnh `/api/kho/tra-cuu-qr`)

| Method | Path | Việc |
|--------|------|------|
| POST | `/api/kiem-dinh-tem/tra-cuu` | `{ ma_qr }` → `can_tu_dong.qr_code`: ngày, ca, máy, lệnh SX, người SX (từ `lenh_sx`: trưởng ca/nhân sự chính/thợ phụ/học việc), số cân |
| GET/POST | `/api/bien-ban` | Danh sách / lập biên bản (`BB-KDT-YYYYMMDD-HHMMSS`) |
| DELETE | `/api/bien-ban/:ma_bien_ban` | Xóa |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kiem-dinh-tem/index.tsx` | Quét → preview → lập biên bản; danh sách + In/Xóa |
| `src/features/kiem-dinh-tem/BienBanPrint.tsx` | Mẫu in (dùng CSS `warehouse-slip-print-*`) + modal xem trước |

Ảnh kiểm định: chụp/chọn một ảnh tùy chọn → nén bằng `fileToOptimizedImageDataUrl` → Cloudinary (`bien_ban`) → `bien_ban.anh_url`; hiển thị trong chi tiết và bản in. DB cũ chạy lại `supabase-bien-ban.sql` để thêm cột `anh_url`.
