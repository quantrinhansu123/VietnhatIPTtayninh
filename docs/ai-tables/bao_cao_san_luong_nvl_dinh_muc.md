# bao_cao_san_luong_nvl_dinh_muc

| **Bảng** | `bao_cao_san_luong_nvl_dinh_muc` |
| **Tab** | `acceptance-report-list` (modal NVL theo định mức) |
| **SQL** | `supabase-bao-cao-san-luong-nvl-dinh-muc.sql` |

Snapshot NVL định mức gắn **từng dòng** `bao_cao_nghiem_thu`. Khi bấm **Đồng bộ** trên modal: lấy Thành phần từ Kho sản phẩm (`san_pham.npl_phan_tram`) × SL phiếu, rồi **ghi DB**.

Modal **NVL theo định mức** — công thức nguồn chính (không ước ĐM):

| Ô / cột | Công thức | Nguồn |
|---------|-----------|--------|
| **Trọng lượng tổng** | Σ Cân SP | `can_tu_dong` hoặc `trong_luong` phiếu |
| **Trọng lượng thực tế** | Nhựa = Cân SP − lõi − bì − màng | cân AI snapshot / `trong_luong_nhua` |
| **Vật tư trộn · TL dòng** | Nhựa × **% trộn thực tế** | `bao_cao_phoi_tron` (ngày·ca·máy) — **không** fallback ĐM BOM |
| **Túi / ống · TL** | `(ĐM cái/SP × SL) × kg/cái` | Thành phần `khoi_luong_kg` hoặc Tổng kg kho NVL |
| **Băng keo · TL** | `SL × khoi_luong_kg` nếu kg BOM ≪ kg/cuộn kho | Thành phần |
| **Bảng phẳng · TL vật tư trộn** | = **nhựa thực tế** | `trong_luong_nhua` |

**Không** cộng túi/ống vào Cân SP: `Trọng lượng tổng ≈ Nhựa + lõi + bì (+ màng trong cuộn)`.

Tab **Báo cáo sản lượng** (`/phan-tich-tu-dong`) khi **Tính toán** / **Áp dụng**:

- Danh sách dòng luôn lấy đủ từ `san_pham.npl_phan_tram` của từng mã SP.
- Khi chọn Ngày/Ca và bấm **Áp dụng**, UI phủ danh sách này lên cả snapshot bản tính cũ; không cần bấm **Tính toán** lại chỉ để thấy NVL mới.
- NVL phụ ĐVT Cái: `SL NVL = số cái trên 1 thành phẩm × SL SP`. ĐVT Cuộn mà `khoi_luong_kg` nhỏ hơn Tổng kg/cuộn (băng keo): `khoi_luong_kg` là kg trên 1 thành phẩm, số cuộn làm tròn ở tiêu hao.
- `TL NVL` Cái = `SL NVL × kg/cái`. Cuộn kg/thành phẩm = `SL SP × khoi_luong_kg`.
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
| `AcceptanceReportListView.tsx` | Modal Xem / Đồng bộ → load DB, lưu snapshot; tính TL trộn / không trộn cho bảng phẳng |
| `AcceptanceReportFlatTable.tsx` | Cột **TL vật tư trộn** · **TL VT không trộn** |
| `ControlBoardBbMachineReportTable.tsx` | Tab Báo cáo sản lượng — Tính toán đọc snapshot |

## Liên quan

[bao_cao_nghiem_thu.md](./bao_cao_nghiem_thu.md), [san_pham.md](./san_pham.md)
