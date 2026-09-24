# import_sp

| | |
|---|---|
| **Bảng** | `import_sp` |
| **Tab** | `/kho-hang` / `/san-pham` — **Nhập định mức NVL** · **Xem import_sp** · **Đồng bộ Thành phần** |
| **SQL** | `supabase-import-sp.sql` |

## API (`server.ts`)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/import-sp?limit=&batch_id=` | Xem dòng đã import |
| POST | `/api/import-sp` | Body `{ file_name, rows[] }` — ghi Excel vào bảng |
| POST | `/api/import-sp/dong-bo` | Đồng bộ `trang_thai=moi` → `san_pham.npl_phan_tram` theo mã SP |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/san-pham/index.tsx` | Nút nhập / xem / đồng bộ + modal |
| `src/utils/productNplComponentsExcel.ts` | `parseImportSpExcelRows` |

## Luồng

1. **Nhập định mức NVL** → Excel → `import_sp` (`trang_thai=moi`). **Nhập thêm**: luôn ghi thêm dòng mới (không xóa/ghi đè bản cũ cùng mã SP).
2. **Xem import_sp** → kiểm tra
3. **Đồng bộ Thành phần** → gộp theo `ma_sp` + `ma_nvl` → ghi đè Thành phần SP → đánh dấu `da_ap_dung`

Khớp mã: bỏ khoảng trắng (`MT- MN001` ≡ `MT-MN001`). BDT chỉ Kg → `so_luong=0` + `khoi_luong_kg`.

## Cột chính

Excel: `ma_sp`, `ma_nvl`, `ten_nvl`, `loai`, `gia_tri`, `dvt`  
Chuẩn hóa: `phan_tram`, `so_luong`, `khoi_luong_kg`, `don_vi`  
Meta: `batch_id`, `file_name`, `trang_thai` (`moi` \| `da_ap_dung` \| `loi` \| `huy`), `imported_at`

## Tạo bảng

Chạy `supabase-import-sp.sql` trong **Supabase SQL Editor** (DB hệ thống).
