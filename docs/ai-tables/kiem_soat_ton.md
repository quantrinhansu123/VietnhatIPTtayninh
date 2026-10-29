# kiem_soat_ton

| | |
|---|---|
| **Nguồn** | Tính từ tồn kho (`ton_kho_nvl_gop` / nhập-xuất DB kho) + ngưỡng `so_luong_ton_toi_thieu` trên `kho_nvl` / `san_pham` + phiếu treo `phieu_nhap`/`phieu_xuat` |
| **Tab** | `kiem-soat-ton` → `/kiem-soat-ton` (card trong /nha-may/kho) |
| **SQL** | `supabase-kho-nvl-ton-toi-thieu.sql` (thêm cột cho `kho_nvl`; `san_pham` đã có) |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/kiem-soat-ton?loai_kho=nvl\|san_pham&ten_kho=` | ~19842 |
| PUT | `/api/kiem-soat-ton/nguong` (`{ loai_kho, ma, min }`) | ~19917 |

Trạng thái: `am` (tồn < 0) · `duoi_toi_thieu` · `sap_het` (≤ 120% tối thiểu) · `chua_dat_nguong` · `on_dinh`. Phiếu treo ≥ 3 ngày hiện thành cảnh báo.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kiem-soat-ton/index.tsx` | Thẻ tổng hợp, bảng 50/trang, sửa tồn tối thiểu tại chỗ |
