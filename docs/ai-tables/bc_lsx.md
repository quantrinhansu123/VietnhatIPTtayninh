# bc_lsx (UI: bc_Lsx)

| | |
|---|---|
| **Bảng** | `bc_lsx` |
| **Tab** | `/phan-tich-tu-dong` · **Dữ liệu trong lệnh sản xuất** |
| **SQL** | `supabase-bc-lsx.sql` |

## Vai trò

Snapshot **riêng** cho tab lệnh SX trên báo cáo BB — **không** dùng `lenh_sx` / `lenh_sx_dong` làm bảng lưu tab này.

Ghi khi bấm **Tính toán** (cùng khóa `khoa_on_dinh` với `bb_bao_cao_tinh_toan`).

## Cột chính

| Cột | UI |
|-----|-----|
| `ngay` / `ma_lenh` / `ca` / `ca_label` | Ngày · Lệnh SX · Ca |
| `tho_chinh` / `phu_may` / `ho_tro` | Thợ chính · Phụ máy · Hỗ trợ |
| `ma_sp` / `ten_sp` / `don_vi` | Mã hàng · Tên · ĐVT |
| `dinh_muc_kg` | Định mức (kg) / 1 ĐVT |
| `trong_luong_nhua_kg` | Trọng lượng nhựa + phụ gia (kg) |
| `so_luong` / `tong_kg` | SL · Tổng (kg) |
| `ti_le_kl_nhua_percent` | % KL nhựa (dòng) |
| `dm_nvl` (jsonb) | Định mức NVL SP: `trong_luong_tron_kg` (= TL nhựa+phụ gia) + `nvl[]` (mã/tên/%/kg từ Thành phần) |
| `so_dong_lenh` / `tong_sl_lenh` / `tong_tl_lenh_kg` | Tổng lệnh |

### `dm_nvl` mẫu

```json
{
  "trong_luong_tron_kg": 10.86,
  "tong_trong_luong_tron_kg": 434.4,
  "nvl": [
    {
      "ma_nvl": "PE-…",
      "ten_nvl": "…",
      "don_vi": "%",
      "loai": "percent",
      "phan_tram": 82.5,
      "so_luong": null,
      "dinh_luong_kg": 8.9595,
      "tong_dinh_luong_kg": 358.38
    }
  ]
}
```

## UI tab lệnh SX

Mỗi dòng SP có nút sổ xuống → bảng **Định mức NVL** (TL trộn + danh sách NVL từ Thành phần). Dữ liệu hiển thị live từ catalog; khi Tính toán ghi vào `bc_lsx.dm_nvl`.

| Method | Path |
|--------|------|
| GET | `/api/bc-lsx?khoa_on_dinh=` |
| PUT | `/api/bc-lsx` `{ khoa_on_dinh, items: [...] }` — xóa theo khóa rồi insert |

## Chạy SQL

```bash
node scripts/run-sql-file.mjs supabase-bc-lsx.sql
```

Hoặc paste `supabase-bc-lsx.sql` vào Supabase SQL Editor.

## Liên quan

`bb_bao_cao_tinh_toan`, `control_board`, `lenh_sx` (nguồn đọc khi Tính toán)
