# yeu_cau_xuat_kho + nvl_yeu_cau

| | |
|---|---|
| **Bảng** | `yeu_cau_xuat_kho` (ngày, ca, máy, `nguoi_yc`, `trang_thai` `cho_xu_ly`/`da_xuat`, `ma_phieu_xuat`), `nvl_yeu_cau` (`ma_yeu_cau`, `ma_nvl`, `ten_nvl`, `don_vi`, `so_luong`) |
| **DB** | DB kho (`SUPABASE_KHO_*`, project `djdwfzxdyjgikppvnknc`) |
| **SQL** | `supabase-yeu-cau-xuat-kho.sql` |
| **Tab** | `/phieu-bao-cao` → **Nhận vật tư về máy** (`material-request`); `/danh-sach-bao-cao` → **Danh sách phiếu nhận NVL** (`material-request-list`). Dùng quyền Báo cáo tồn. |

## API (`server.ts`, trước `/api/kho/lo-ton`)

- `GET /api/yeu-cau-xuat-kho?trang_thai=cho_xu_ly&tu_ngay=&den_ngay=` — yêu cầu kèm `lines`
- `POST /api/yeu-cau-xuat-kho` — công nhân gửi yêu cầu
- `PUT /api/yeu-cau-xuat-kho/:ma` — sửa phiếu `cho_xu_ly` (đầu phiếu + dòng NVL)
- `DELETE /api/yeu-cau-xuat-kho/:ma` — xóa yêu cầu
- `POST /api/yeu-cau-xuat-kho/:ma/xac-nhan` — đánh dấu `da_xuat` sau khi thủ kho lưu phiếu

## Frontend

- `src/features/yeu-cau-xuat-vat-tu/index.tsx` — form thêm/sửa (`/yeu-cau-xuat-vat-tu`)
- `src/features/yeu-cau-xuat-vat-tu/MaterialRequestListView.tsx` — danh sách + lọc ngày/ca/máy + Thêm/Sửa/Xóa
- `src/features/phieu-xuat-nhap-kho/index.tsx` — Xuất kho NVL: danh sách yêu cầu chờ xử lý (bấm để đổ ngày/ca/máy/dòng NVL vào phiếu, sửa được); đã bỏ **Tự điền theo lệnh SX** (`showOrderFields = false`)
