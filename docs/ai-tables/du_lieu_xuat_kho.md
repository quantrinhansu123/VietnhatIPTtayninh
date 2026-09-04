# du_lieu_xuat_kho

| | |
|---|---|
| **Bảng** | `du_lieu_xuat_kho` |
| **Tab** | `/phan-tich-tu-dong` · **Dữ liệu xuất kho** |
| **SQL** | `supabase-du-lieu-xuat-kho.sql` |

## Vai trò

Snapshot **riêng** cho tab xuất kho trên báo cáo BB — **không** thay `phieu_xuat_nhap_kho` (nguồn live vẫn đọc phiếu XK).

Ghi khi bấm **Tính toán** (cùng khóa `khoa_on_dinh` với `bb_bao_cao_tinh_toan` / `bc_lsx`).

1 dòng = 1 NVL trong 1 SP của 1 lệnh (khớp UI sổ xuống SP → NVL).

## Cột chính

| Cột | UI |
|-----|-----|
| `ngay` / `ca` / `ca_label` / `may` / `ma_lenh` | Ngày · Ca · Máy · Lệnh SX |
| `ma_sp` / `ten_sp` / `sl_sp` / `dinh_muc_sp_kg` | Nhóm sản phẩm |
| `ma_nvl` / `ten_nvl` / `don_vi` | Mã · Tên · ĐVT NVL |
| `sl_dinh_muc` / `trong_luong_dinh_muc_kg` | SL định mức · Trọng lượng định mức |
| `sl_xuat` / `trong_luong_xuat_kg` | SL / kg thực xuất từ phiếu — **nguồn thẳng** cột «Trọng lượng vật tư xuất kho» mục 3.1/3.2 (không quy đổi lại) |
| `ti_le_percent` | Tỉ lệ % trong lệnh |
| `ma_phieu` / `khop_lenh` | Mã phiếu XK · khớp lệnh? |

## API

| Method | Path |
|--------|------|
| GET | `/api/du-lieu-xuat-kho?khoa_on_dinh=` |
| PUT | `/api/du-lieu-xuat-kho` `{ khoa_on_dinh, items: [...] }` — xóa theo khóa rồi insert |

## Chạy SQL

```bash
node scripts/run-sql-file.mjs supabase-du-lieu-xuat-kho.sql
```

Hoặc paste `supabase-du-lieu-xuat-kho.sql` vào Supabase SQL Editor.

## Liên quan

`phieu_xuat_nhap_kho`, `lenh_sx`, `san_pham`, `kho_nvl`, `bc_lsx`, `bb_bao_cao_tinh_toan`, `control_board`
