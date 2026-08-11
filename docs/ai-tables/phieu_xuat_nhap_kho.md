# phieu_xuat_nhap_kho

| | |
|---|---|
| **Bảng** | `phieu_xuat_nhap_kho` |
| **Tab** | `warehouse-slip`, `warehouse-history` |
| **SQL** | `supabase-phieu-xuat-nhap-kho.sql` + migrate `supabase-phieu-xuat-nhap-kho-*.sql` (gồm `supabase-phieu-xuat-nhap-kho-lo-ton.sql`, `supabase-phieu-xuat-nhap-kho-ten-kho.sql`, `supabase-phieu-xuat-nhap-kho-mot-so-luong.sql`) |

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

Mỗi dòng phiếu chỉ có một trường **Số lượng**, lưu tại `so_luong`. Migration `supabase-phieu-xuat-nhap-kho-mot-so-luong.sql` sao lưu giá trị cũ còn thiếu từ `so_luong_chung_tu` rồi xóa cột phụ này.


## Script

`scripts/sync-kho-nvl-from-phieu.mjs` — đồng bộ tồn kho từ phiếu.
