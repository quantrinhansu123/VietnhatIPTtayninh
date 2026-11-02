# kiem_soat_ton

| | |
|---|---|
| **Nguồn** | Tính từ tồn kho (`ton_kho_nvl_gop` / nhập-xuất DB kho) + ngưỡng `so_luong_ton_toi_thieu` trên `kho_nvl` / `san_pham` + phiếu treo `phieu_nhap`/`phieu_xuat` |
| **Tab** | `kiem-soat-ton` → `/kiem-soat-ton` (card trong /nha-may/kho) |
| **SQL** | `supabase-kho-nvl-ton-toi-thieu.sql` (thêm cột cho `kho_nvl`; `san_pham` đã có) |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/kiem-soat-ton?loai_kho=nvl\|san_pham&ten_kho=` | ~19996 |
| PUT | `/api/kiem-soat-ton/nguong` (`{ loai_kho, ma, min }`) | ~20086 |
| GET | `/api/kiem-soat-ton/chi-tiet?loai_kho=&ma=&loai=nhap\|xuat&ten_kho=` | sau `/nguong` — gộp ngày → phiếu → dòng |

Trạng thái: `am` (tồn < 0) · `duoi_toi_thieu` · `sap_het` (≤ 120% tối thiểu) · `chua_dat_nguong` · `on_dinh`. Phiếu treo ≥ 3 ngày hiện thành cảnh báo.

Cột bảng: **Tồn đầu** (`ton_dau_ky` danh mục + điều chỉnh trước kỳ nếu có lọc ngày) · **Nhập** · **Xuất** · **Tồn hiện tại**.

**Công thức (bắt buộc):** `Tồn hiện tại = Tồn đầu + Nhập − Xuất` — API `/api/kiem-soat-ton` luôn tính lại cột `ton` theo công thức này (không tin `ton_cuoi_ky` nguồn khác). Bấm số Nhập/Xuất → modal chi tiết theo ngày / phiếu / dòng.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kiem-soat-ton/index.tsx` | Thẻ tổng hợp, bảng 50/trang (đầu/nhập/xuất/tồn), modal chi tiết nhập/xuất, sửa tồn tối thiểu tại chỗ |
