# kho (DB kho mới)

| | |
|---|---|
| **Bảng** | `kho` (+ `phieu_xuat`, `phieu_nhap`, `xuat_kho`, `nhap_kho`) |
| **DB** | Project riêng — `SUPABASE_KHO_URL` / `SUPABASE_KHO_SERVICE_KEY` |
| **SQL** | `supabase-db-kho.sql` |
| **Migration** | `supabase-nhap-kho-ma-qr-columns.sql` — cột QR cho `nhap_kho`; `supabase-nhap-kho-ca-may.sql` — cột `ca`, `may`, `ngay`, `nguoi_thao_tac`, `trang_thai` (mặc định `Đang chờ`) trên `nhap_kho`; `supabase-phieu-nhap-xuat-metadata.sql` — metadata phiếu; `supabase-kho-slip-status.sql` — trạng thái `status`; `supabase-kho-qr-san-pham-unique.sql` — bỏ unique index QR thành phẩm trên `nhap_kho`/`xuat_kho` (chạy trên DB kho); `supabase-kho-qr-don-vi.sql` — lưu ĐVT trên dòng nhập/xuất; `supabase-kho-qr-sync-performance.sql` — index tăng tốc đọc QR theo phiếu |

## API (`server.ts`)

| Method | Path | Nội dung |
|--------|------|----------|
| GET | `/api/kho/chi-tiet?loai_phieu=nhap|xuat&ma_phieu=...&limit=50&offset=0` | Phân trang chi tiết `nhap_kho`/`xuat_kho`; `summary=true` trả tổng hợp theo mã gốc. Đọc theo từng đoạn `.range()` để vượt giới hạn mặc định 1.000 dòng của Supabase |
| GET | `/api/kho/phieu?loai_phieu=nhap|xuat&kho=...&ngay=&status=` | Mặc định phiếu `chua_chot`. `ngay` lọc đúng ngày. `status=all` lấy cả chưa chốt và đã chốt |
| GET | `/api/kho/lich-su` | Ghép header `phieu_nhap`/`phieu_xuat` với dòng `nhap_kho`/`xuat_kho` theo `ma_phieu`. Mặc định chỉ `da_chot` hoặc `status` null. `status=all` (trang lịch sử) gồm cả phiếu `chua_chot` đã có dòng, nên phiếu nhập từ máy hiện ở Kho thành phẩm |
| POST | `/api/kho/kiem-tra-ma-quet` | Trả `matches` (`ma_sp_quet`, `ma_phieu`) nếu mã đã có dòng. `duplicateCodes` luôn rỗng: cùng một QR được ghi thêm dòng mới. Không chặn theo `chi_tiet_san_pham.trang_thai` |
| POST | `/api/kho/quet-dot` | Lưu cả đợt QR thành phẩm bằng một lệnh insert nhiều dòng, kèm ĐVT. Mã đã có trên phiếu khác vẫn được ghi thêm. Chỉ bỏ mã đã có đúng trên phiếu đang lưu. `cho_phep_trung` (nút Nhập kho của cân AI) ghi từng dòng kể cả mã lặp trong đợt. Cho bổ sung phiếu nhập đã chốt nhưng chưa in |
| POST | `/api/kho/quet` | Mỗi lần quét máy → insert 1 dòng `nhap_kho` hoặc `xuat_kho` (`so_luong=1`), upsert header `phieu_nhap`/`phieu_xuat`, cập nhật tồn `kho`; cả hai bảng dòng lưu `ma_sp` gốc, `ma_sp_quet` đầy đủ, `ten_sp`, `don_vi` |
| POST | `/api/kho/phieu` | Tạo/cập nhật header (`status` `chua_chot`/`da_chot`); nhận thêm `items` NVL hoặc hàng hỏng nhập tay để ghi `nhap_kho`/`xuat_kho` không cần `ma_sp_quet`; tính lại tồn NVL; khi bấm **Lưu phiếu** nhập, đồng bộ QR sang `chi_tiet_san_pham` ở DB chính với `trang_thai='trong_kho'`; khi bấm **Lưu phiếu** xuất, cập nhật QR từ `xuat_kho` thành `da_xuat` |
| DELETE | `/api/kho/phieu/:ma_phieu` | Xóa dòng và header của phiếu trong hai bảng chi tiết/header tương ứng |

Body `/api/kho/quet`: `loai_phieu` (`nhap`\|`xuat`), `ma_sp` (mã đầy đủ vừa quét), `ma_phieu?`, `loai?`, `ten_sp?`, `don_vi?`, `nhan_su?`, `ngay?`, `so_luong?` (mặc định 1). `/api/kho/phieu` nhận metadata phiếu; gửi `loai: 'nvl'` hoặc `'hang_hong'` cùng `items` để lưu các dòng nhập tay không có `ma_sp_quet`.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | Phiếu thành phẩm nhập/xuất QR (**Lưu đợt** tạo `chua_chot`, **Lưu phiếu** chốt `da_chot`) và phiếu NVL/hàng hỏng nhập tay lưu sang DB kho |
| `src/components/ProductQrScanner.tsx` | Hỗ trợ `onScan` async; feedback “Đã ghi nhận” |

## Ghi chú

- Với QR thành phẩm, tồn `kho.ma_sp` gộp theo tiền tố trước `_`; `nhap_kho`/`xuat_kho` lưu mã gốc trong `ma_sp` và QR đầy đủ trong `ma_sp_quet`. Dòng NVL nhập tay dùng nguyên mã NVL và không có `ma_sp_quet`.
- Phiếu NVL nhập tay cũng lưu header và dòng vào DB kho (`phieu_nhap`/`phieu_xuat`, `nhap_kho`/`xuat_kho`); dòng NVL không có `ma_sp_quet` và tồn `kho` được tính lại theo các dòng NVL.
- Phiếu hàng hỏng nhập tay cũng lưu header và dòng vào bốn bảng phiếu kho; `ma_sp_quet` để trống.
- Chưa cấu hình `SUPABASE_KHO_*` → API trả 503; `/api/health` báo `databases.kho.connected=false`.

## Lưu phiếu thành phẩm hai bước

- **Lưu đợt** gửi cả danh sách QR qua `/api/kho/quet-dot`; API ghi nhiều dòng cùng lúc vào `nhap_kho`/`xuat_kho` và tạo/cập nhật header. Phiếu nhập thành phẩm đã chốt vẫn nhận mã bổ sung nếu phiếu chưa in.
- **Lưu đợt xuất** không kiểm tra `chi_tiet_san_pham.trang_thai`. Cùng một QR được ghi thêm dòng mới trên phiếu khác. Mã đã có đúng trên phiếu đang lưu thì không ghi lần nữa.
- **Lưu đợt** chỉ ghi các mã QR vào DB kho. Chỉ thao tác **Lưu phiếu** cuối cùng mới đồng bộ nhập/xuất sang `chi_tiet_san_pham`.
- Đồng bộ QR chạy qua RPC PostgreSQL trong DB chính và chỉ cập nhật snapshot `chi_tiet_san_pham`. Không ghi `bien_dong_chi_tiet_san_pham`. Header chỉ chuyển `da_chot` sau khi transaction thành công; nếu lỗi, giữ `chua_chot` để thử lưu lại.
- Khi chốt phiếu xuất thành phẩm mới, các QR đầy đủ của phiếu trong `xuat_kho` được cập nhật hoặc tạo trong `chi_tiet_san_pham` với `trang_thai='da_xuat'`.
- Khi mở lại trang nhập/xuất thành phẩm, FE tự chọn phiếu `chua_chot` mới nhất theo kho và điền **Ca**, **Máy** từ header phiếu; có thể đổi phiếu hoặc chọn **+ Tạo phiếu**.
- Mã phiếu tự tạo: `PN-YYYYMMDD-HHMMSS`. Khi đã chọn máy thì chèn viết tắt ngay sau `PN`, ví dụ Máy bao bì 15 → `PN-MBB15-YYYYMMDD-HHMMSS`. Nhập kho từ cân tự động dùng cùng quy tắc.
- **Lưu phiếu** lập chứng từ chính thức rồi chuyển header sang `status='da_chot'`.
- DB kho cần chạy `supabase-kho-stage-lines.sql` một lần để bỏ FK từ bảng dòng sang header, cho phép lưu đợt trước khi lập phiếu.
