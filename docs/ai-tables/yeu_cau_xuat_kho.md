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
- `src/features/yeu-cau-xuat-vat-tu/materialRequestPreset.ts` — mẫu mã đề xuất theo tab **Order máy BB** / **Order máy CN**; phiếu mới **tự sổ** danh sách, chỉ điền SL; lưu chỉ gửi dòng có SL > 0. CN map mã giấy → mã kho (vd `NHUA-1L`→`NHUA-1L-CN`, `TUI-5dem`→`VT-TUI05`, `DUNGMOI`→`NVLK-DUNGMOI`).
- `src/features/yeu-cau-xuat-vat-tu/MaterialRequestListView.tsx` — danh sách + lọc ngày/ca/máy + Thêm/Sửa/Xóa. Modal: chọn Ngày·Ca·Máy lấy %; **Bảng 1 ảo** (TRON × %); **Bảng 2 thật** = phiếu cũ + cộng Bảng 1 (ẩn TRON) — nút **Lưu Bảng 2 vào phiếu** → `PUT /api/yeu-cau-xuat-kho/:ma` (`materialRequestTronSplit.ts`).
- `src/features/phieu-xuat-nhap-kho/index.tsx` — Xuất kho NVL: yêu cầu chờ xử lý theo **ngày phiếu**; ưu tiên khớp Ca/Máy (`warehouseMachineMatchesFilter` mã↔tên). Nếu form Ca/Máy khác phiếu vẫn **hiện đủ yêu cầu trong ngày** (chọn phiếu tự điền Ca/Máy). Phiếu đã `da_xuat` không còn trong list. Đã bỏ **Tự điền theo lệnh SX**.
