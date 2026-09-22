# kho (DB kho mới)

| | |
|---|---|
| **Bảng** | `kho` (+ `phieu_xuat`, `phieu_nhap`, `xuat_kho`, `nhap_kho`) |
| **DB** | Project riêng — `SUPABASE_KHO_URL` / `SUPABASE_KHO_SERVICE_KEY` |
| **SQL** | `supabase-db-kho.sql` |

## API (`server.ts`)

| Method | Path | Nội dung |
|--------|------|----------|
| POST | `/api/kho/quet` | Mỗi lần quét máy → insert 1 dòng `nhap_kho` hoặc `xuat_kho` (`so_luong=1`), upsert header `phieu_nhap`/`phieu_xuat`, cập nhật tồn `kho` |

Body: `loai_phieu` (`nhap`\|`xuat`), `ma_sp` (mã đầy đủ vừa quét), `ma_phieu?`, `loai?`, `ten_sp?`, `nhan_su?`, `ngay?`, `so_luong?` (mặc định 1).

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | `addLineFromScan` — **không** cộng dồn SL; gọi `/api/kho/quet` rồi thêm dòng form SL=1 |
| `src/components/ProductQrScanner.tsx` | Hỗ trợ `onScan` async; feedback “Đã ghi nhận” |

## Ghi chú

- Tồn `kho.ma_sp` gộp theo tiền tố trước `_`; dòng `nhap_kho`/`xuat_kho` lưu mã quét đầy đủ.
- Chưa cấu hình `SUPABASE_KHO_*` → API trả 503; `/api/health` báo `databases.kho.connected=false`.
