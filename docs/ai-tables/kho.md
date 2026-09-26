# kho (DB kho mới)

| | |
|---|---|
| **Bảng** | `kho` (+ `phieu_xuat`, `phieu_nhap`, `xuat_kho`, `nhap_kho`) |
| **DB** | Project riêng — `SUPABASE_KHO_URL` / `SUPABASE_KHO_SERVICE_KEY` |
| **SQL** | `supabase-db-kho.sql` |
| **Migration** | `supabase-nhap-kho-ma-qr-columns.sql` — cột QR cho `nhap_kho`; `supabase-phieu-nhap-xuat-metadata.sql` — metadata phiếu; `supabase-kho-slip-status.sql` — trạng thái `status`; `supabase-kho-qr-san-pham-unique.sql` — chống trùng QR thành phẩm; `supabase-kho-qr-don-vi.sql` — lưu ĐVT trên dòng nhập/xuất |

## API (`server.ts`)

| Method | Path | Nội dung |
|--------|------|----------|
| GET | `/api/kho/chi-tiet?loai_phieu=nhap|xuat&ma_phieu=...&limit=50&offset=0` | Phân trang chi tiết `nhap_kho`/`xuat_kho`; `summary=true` trả tổng hợp theo mã gốc. Đọc theo từng đoạn `.range()` để vượt giới hạn mặc định 1.000 dòng của Supabase |
| GET | `/api/kho/phieu?loai_phieu=nhap|xuat&kho=...` | Danh sách tối đa 20 phiếu chưa chốt mới nhất theo kho |
| GET | `/api/kho/lich-su` | Ghép header `phieu_nhap`/`phieu_xuat` với dòng `nhap_kho`/`xuat_kho` theo `ma_phieu` cho trang lịch sử |
| POST | `/api/kho/kiem-tra-ma-quet` | Kiểm tra QR đã có trong bảng chi tiết cùng chiều nhập/xuất trước khi lưu đợt |
| POST | `/api/kho/quet-dot` | Lưu cả đợt QR thành phẩm bằng một lệnh insert nhiều dòng, kèm ĐVT; kiểm tra mã trùng và cho bổ sung phiếu nhập thành phẩm đã chốt nhưng chưa in |
| POST | `/api/kho/quet` | Mỗi lần quét máy → insert 1 dòng `nhap_kho` hoặc `xuat_kho` (`so_luong=1`), upsert header `phieu_nhap`/`phieu_xuat`, cập nhật tồn `kho`; cả hai bảng dòng lưu `ma_sp` gốc, `ma_sp_quet` đầy đủ, `ten_sp`, `don_vi` |
| POST | `/api/kho/phieu` | Tạo/cập nhật header `phieu_nhap`/`phieu_xuat`, gồm `status` (`chua_chot`/`da_chot`) |
| DELETE | `/api/kho/phieu/:ma_phieu` | Xóa dòng và header của phiếu trong hai bảng chi tiết/header tương ứng |

Body `/api/kho/quet`: `loai_phieu` (`nhap`\|`xuat`), `ma_sp` (mã đầy đủ vừa quét), `ma_phieu?`, `loai?`, `ten_sp?`, `don_vi?`, `nhan_su?`, `ngay?`, `so_luong?` (mặc định 1). `/api/kho/phieu` nhận `loai_phieu`, `ma_phieu`, `ngay`, `nhan_su`, `kho`, `ca`, `may`, `ghi_chu`.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | Phiếu thành phẩm nhập/xuất tự chọn phiếu chưa chốt mới nhất; **Lưu đợt** ghi dòng quét và tạo header `chua_chot`; **Lưu phiếu** chuyển thành `da_chot` |
| `src/components/ProductQrScanner.tsx` | Hỗ trợ `onScan` async; feedback “Đã ghi nhận” |

## Ghi chú

- Tồn `kho.ma_sp` gộp theo tiền tố trước `_`; `nhap_kho`/`xuat_kho` lưu mã gốc trong `ma_sp` và QR đầy đủ trong `ma_sp_quet` cho phiếu thành phẩm.
- Chưa cấu hình `SUPABASE_KHO_*` → API trả 503; `/api/health` báo `databases.kho.connected=false`.

## Lưu phiếu thành phẩm hai bước

- **Lưu đợt** gửi cả danh sách QR qua `/api/kho/quet-dot`; API ghi nhiều dòng cùng lúc vào `nhap_kho`/`xuat_kho` và tạo/cập nhật header. Phiếu nhập thành phẩm đã chốt vẫn nhận mã bổ sung nếu phiếu chưa in.
- Khi mở lại trang nhập/xuất thành phẩm, FE tự chọn phiếu `chua_chot` mới nhất theo kho; có thể đổi phiếu hoặc chọn **+ Tạo phiếu**.
- **Lưu phiếu** lập chứng từ chính thức rồi chuyển header sang `status='da_chot'`.
- DB kho cần chạy `supabase-kho-stage-lines.sql` một lần để bỏ FK từ bảng dòng sang header, cho phép lưu đợt trước khi lập phiếu.
