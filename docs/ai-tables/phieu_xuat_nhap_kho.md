# phieu_xuat_nhap_kho

| | |
|---|---|
| **Bảng** | `phieu_xuat_nhap_kho` |
| **Tab** | `warehouse-slip`, `warehouse-history` |
| **SQL** | `supabase-phieu-xuat-nhap-kho.sql` + migrate `supabase-phieu-xuat-nhap-kho-*.sql` (gồm `supabase-phieu-xuat-nhap-kho-lo-ton.sql`, `supabase-phieu-xuat-nhap-kho-ten-kho.sql`) |

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

Form tạo/sửa phiếu bắt buộc chọn kho vật lý từ `/api/quan-ly-kho` và gửi `tenKho` cho mọi dòng của phiếu.


## Script

`scripts/sync-kho-nvl-from-phieu.mjs` — đồng bộ tồn kho từ phiếu.
