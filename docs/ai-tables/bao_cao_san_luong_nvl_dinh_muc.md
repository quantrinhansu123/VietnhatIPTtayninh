# bao_cao_san_luong_nvl_dinh_muc

| **Bảng** | `bao_cao_san_luong_nvl_dinh_muc` |
| **Tab** | `acceptance-report-list` (modal NVL theo định mức) |
| **SQL** | `supabase-bao-cao-san-luong-nvl-dinh-muc.sql` |

Snapshot NVL định mức gắn **từng dòng** `bao_cao_nghiem_thu`. Khi bấm **Đồng bộ** trên modal: lấy Thành phần từ Kho sản phẩm (`san_pham.npl_phan_tram`) × SL phiếu, rồi **ghi DB**.

Modal **NVL theo định mức**: cột **Trọng lượng**
- ĐVT `%` = trọng lượng cuộn (**Cân sản phẩm**) × %; không cân thì SL × kg/cuộn định mức
- ĐVT `Cái` = định lượng Thành phần × SL sản lượng, quy kg (Tổng kg kho NVL / `khoi_luong_kg` / kg trong tên)

Tab **Báo cáo sản lượng** (`/phan-tich-tu-dong`) khi **Tính toán** / **Áp dụng**:

- Danh sách dòng luôn lấy đủ từ `san_pham.npl_phan_tram` của từng mã SP.
- Khi chọn Ngày/Ca và bấm **Áp dụng**, UI phủ danh sách này lên cả snapshot bản tính cũ; không cần bấm **Tính toán** lại chỉ để thấy NVL mới.
- NVL phụ (Cái/m²/…): `SL NVL = SL SP` (kể cả không có snapshot/BOM phiếu).
- `TL NVL = SL NVL × khoi_luong_kg`; không có `khoi_luong_kg` → `SL NVL × tong_trong_luong` kho NVL.
- NVL `%` / kg: `SL NVL` / `TL NVL` lấy từ snapshot theo id phiếu; không snapshot thì 0.
- **Tính toán không tự ghi** lại snapshot từ Thành phần SP; chỉ nút **Đồng bộ** trên danh sách phiếu mới ghi bảng này.

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-san-luong-nvl-dinh-muc.sql
```

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bao-cao-san-luong-nvl-dinh-muc?id_bao_cao=` | Tải snapshot theo 1 ID phiếu |
| GET | `/api/bao-cao-san-luong-nvl-dinh-muc?ids=a,b,c` | Tải nhiều phiếu → `{ by_id, items }` |
| PUT | `/api/bao-cao-san-luong-nvl-dinh-muc` | Thay toàn bộ dòng: `{ id_bao_cao, ma_sp, ten_sp, so_luong_sp, don_vi_sp, items: [...] }` |

## UI

| File | Vai trò |
|------|---------|
| `AcceptanceReportListView.tsx` | Modal Xem / Đồng bộ → load DB, lưu snapshot |
| `ControlBoardBbMachineReportTable.tsx` | Tab Báo cáo sản lượng — Tính toán đọc snapshot |

## Liên quan

[bao_cao_nghiem_thu.md](./bao_cao_nghiem_thu.md), [san_pham.md](./san_pham.md)
