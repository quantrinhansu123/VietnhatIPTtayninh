# doi_soat

| | |
|---|---|
| **Bảng** | `doi_soat` |
| **Tab** | `doi-soat` → `/doi-soat` (card trên `/phieu-bao-cao`) |
| **DB** | Cân tự động — project `njdlkyxdieefeebcyaov` (`SUPABASE_WEIGHING_*`) |
| **SQL** | `supabase-doi-soat.sql` |

## Cột chính

| Cột | Ý nghĩa |
|-----|---------|
| `ten_kho` | Kho đối soát |
| `dot_doi_soat` | Khóa đợt (ISO khi tạo mới) |
| `ma_nvl` | Tiền tố trước `_` |
| `ma_sp` | Mã quét đầy đủ |
| `ten_sp` / `loai_sp` | Tên / loại |
| `ngay_gio_doi_soat` | Thời điểm lưu |
| `nguoi_doi_soat` | Người đối soát |

Không có chốt đợt / bảng tổng hợp / chênh lệch (bản gọn so với Kiểm kho).

## API (`server.ts`)

| Method | Path |
|--------|------|
| GET | `/api/doi-soat` — query `tenKho`, `dotDoiSoat`, `from`, `to`, `limit` |
| POST | `/api/doi-soat` — body `ten_kho`, `dot_doi_soat`, `nguoi_doi_soat`, `lines[]` (+ `allow_duplicate_scan`) |
| DELETE | `/api/doi-soat/:id` |
| GET | `/api/doi-soat/dot-mo?tenKho=` |
| GET | `/api/doi-soat/dot?tenKho=` |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/doi-soat/index.tsx` | 2 tab: Thực hiện đối soát · Danh sách đã quét |
| `src/components/ProductQrScanner.tsx` | Quét máy V2 / Quét ĐT |

Hub: `REPORT_FORM_MENU_ITEMS` card **Đối soát** → `report-forms`.
