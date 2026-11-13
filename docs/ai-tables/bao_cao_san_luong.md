# bao_cao_san_luong

| | |
|---|---|
| **Bảng** | `bao_cao_san_luong` |
| **Tab** | `/phan-tich-tu-dong` · **Báo cáo sản lượng** |
| **SQL** | `supabase-bao-cao-san-luong.sql` |

## Vai trò

Snapshot **riêng** cho tab Báo cáo sản lượng trên báo cáo BB.

**Không** trùng:

| Bảng | Vai trò |
|------|---------|
| `bao_cao_nghiem_thu` | Phiếu nguồn `/bao-cao-san-luong` |
| `bao_cao_san_luong_nvl_dinh_muc` | Snapshot NVL theo từng phiếu nghiệm thu |

Ghi khi bấm **Tính toán** (cùng `khoa_on_dinh`).

1 dòng = 1 NVL trong 1 SP của 1 lệnh (khớp UI bảng SP → NVL).

## Cột chính

| Cột | UI |
|-----|-----|
| `ngay` / `ca` / `may` / `ma_lenh` | Header lệnh |
| `ma_sp` / `ten_sp` / `sl_sp` / `tl_sp_kg` | Mã SP · SL · TL SP |
| `ma_nvl` / `ten_nvl` / `don_vi` | Mã · Tên · ĐVT NVL |
| `sl_nvl` / `tl_nvl_dinh_muc_kg` / `tl_nvl_thuc_te_kg` | SL NVL · TL ĐM · TL thực tế |

## UI `BbSanLuongReportPanel`

- Hai bảng tách **NVL trộn** / **Vật tư khác**; SP không có dòng vẫn hiện kèm cảnh báo.
- Cột **Định mức** (trước `SL NVL`): đọc **live** từ `san_pham.npl_phan_tram` (Thành phần SP) — `quantity`/1 SP hoặc `percent`. Snapshot cũ thiếu `dinhMucRate` thì lùi về `SL NVL ÷ SL SP`; không có dữ liệu → `—`, không tự bịa.
- Cột `SL NVL` = số lượng/1 SP × SL SP; `TL NVL` = SL NVL × kg/đơn vị (`khoi_luong_kg` BOM, thiếu thì `kho_nvl.tong_trong_luong`). Nhựa `%` lấy `Σ Nhựa TT Cân AI (hoặc trong_luong_nhua × SL) × %`.

## API

| Method | Path |
|--------|------|
| GET | `/api/bao-cao-san-luong?khoa_on_dinh=` |
| PUT | `/api/bao-cao-san-luong` `{ khoa_on_dinh, items: [...] }` |

## Chạy SQL

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-san-luong.sql
```

## Liên quan

`bao_cao_nghiem_thu`, `bao_cao_san_luong_nvl_dinh_muc`, `san_pham`, `bb_bao_cao_tinh_toan`, `control_board`
