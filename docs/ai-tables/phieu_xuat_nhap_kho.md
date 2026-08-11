# phieu_xuat_nhap_kho

| | |
|---|---|
| **Bảng** | `phieu_xuat_nhap_kho` |
| **Tab** | `warehouse-slip`, `warehouse-history` |
| **SQL** | `supabase-phieu-xuat-nhap-kho.sql` + migrate `supabase-phieu-xuat-nhap-kho-*.sql` (QR thành phẩm: `supabase-phieu-nhap-san-pham-ma-chi-tiet.sql`) |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/phieu-xuat-nhap-kho` | ~5212 |
| GET | `/api/phieu-xuat-nhap-kho/lo-ton` | (lô tồn theo `ma_npl`) |
| GET | `/api/phieu-xuat-nhap-kho/gia-tb-nhap` | (giá BQ nhập theo mã NVL + tháng) |
| POST | `/api/phieu-xuat-nhap-kho` | ~5263 |
| PUT | `/api/phieu-xuat-nhap-kho/:slipCode` | ~5377 |
| DELETE | slip / id | ~5495+ |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/phieu-xuat-nhap-kho/index.tsx` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |

**Tự động điền:** Nút **Tự động điền theo lệnh SX** trên form phiếu — lọc lệnh SX theo **Ngày phiếu + Ca**, chọn các lệnh khớp, điền máy / lý do / ghi chú và dòng hàng (`san_pham` = SP trên lệnh; `nvl` = NVL định mức BOM theo SP).

Loại kho lịch sử: `nvl` · `san_pham` · `tai_che` (tab **Kho tái chế** — gồm `loai_kho=tai_che` hoặc `ten_kho` chứa «tái chế»).

Form phiếu: **một dropdown Tên kho** từ `/api/quan-ly-kho` (`ten_kho`); tự suy `loai_kho` theo tên (thành phẩm / tái chế / còn lại = NVL).

- Phiếu **Nhập** chỉ có một trường **Số lượng**, lưu tại `so_luong`; `so_luong_chung_tu` luôn `NULL`.
- Phiếu **Xuất** có **SL CT** (`so_luong_chung_tu`) và **SL THỰC** (`so_luong`). Tồn kho và thành tiền vẫn tính theo `so_luong`.
- Phiếu **Nhập kho thành phẩm** nhận mã gốc + số lượng nguyên. API dùng thuật toán serial cũ để sinh từng mã đầy đủ, rồi RPC `tao_phieu_nhap_san_pham_voi_ma_chi_tiet` đăng ký mã và ghi mỗi serial thành một dòng phiếu số lượng 1 trong cùng transaction.
- Sau khi lưu, UI lần lượt mở file phiếu nhập và file tem QR. Có thể in lại đúng bộ tem tại **Lịch sử xuất nhập kho → Kho sản phẩm → Xem chi tiết → In mã QR**.


## Script

`scripts/sync-kho-nvl-from-phieu.mjs` — đồng bộ tồn kho từ phiếu.
