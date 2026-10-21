# yeu_cau_xuat_kho + nvl_yeu_cau

| | |
|---|---|
| **Bảng** | `yeu_cau_xuat_kho` (ngày, ca, máy, `nguoi_yc`, `trang_thai` `cho_xu_ly`/`da_xuat`, `ma_phieu_xuat`), `nvl_yeu_cau` (`ma_yeu_cau`, `ma_nvl`, `ten_nvl`, `don_vi`, `so_luong`) |
| **DB** | DB kho (`SUPABASE_KHO_*`, project `djdwfzxdyjgikppvnknc`) |
| **SQL** | `supabase-yeu-cau-xuat-kho.sql` |
| **Tab** | `/phieu-bao-cao` → tab **Yêu cầu xuất vật tư** (`material-request`, dùng quyền Báo cáo tồn) |

## API (`server.ts`, trước `/api/kho/lo-ton`)

- `GET /api/yeu-cau-xuat-kho?trang_thai=cho_xu_ly` — yêu cầu kèm `lines`
- `POST /api/yeu-cau-xuat-kho` — công nhân gửi yêu cầu
- `POST /api/yeu-cau-xuat-kho/:ma/xac-nhan` — đánh dấu `da_xuat` sau khi thủ kho lưu phiếu

## Frontend

- `src/features/yeu-cau-xuat-vat-tu/index.tsx` — form công nhân
- `src/features/phieu-xuat-nhap-kho/index.tsx` — Xuất kho NVL: danh sách yêu cầu chờ xử lý (bấm để đổ ngày/ca/máy/dòng NVL vào phiếu, sửa được); đã bỏ **Tự điền theo lệnh SX** (`showOrderFields = false`)
