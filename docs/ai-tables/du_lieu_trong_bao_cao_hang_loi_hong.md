# du_lieu_trong_bao_cao_hang_loi_hong

| | |
|---|---|
| **Bảng** | `du_lieu_trong_bao_cao_hang_loi_hong` |
| **Tab** | `/phan-tich-tu-dong` · **Dữ liệu trong báo cáo hàng lỗi hỏng** |
| **SQL** | `supabase-du-lieu-trong-bao-cao-hang-loi-hong.sql` |

## Vai trò

Snapshot **riêng** cho tab lỗi hỏng trên báo cáo BB.

**Không** trùng [`bao_cao_hang_hong`](./bao_cao_hang_hong.md) (phiếu nguồn) hay `bao_cao_nghiem_thu` (SP lỗi/rác nguồn tab này).

Ghi khi bấm **Tính toán** (cùng `khoa_on_dinh`).

1 dòng = 1 NVL trong `mixingLines` (nhóm `tron` / `con_lai`).

**Ánh xạ đặc biệt (máy cách nhiệt · Bao bì — cùng công thức):**
- `MX1.54*3000m19m` (NVL màng xi trên BOM) ↔ mã SP rác `RAC MANG` · `MT-HANG RAC` — dòng «Rác màng xi»; không lặp lại ở NVL còn lại.
- **Cột Lỗi hỏng (kg)** chỉ từ tab **Hàng lỗi hỏng** trên Báo cáo sản lượng (`loai_vat_tu` = SP lỗi): ưu tiên Σ `NHUAKM`+`NC`+`RMN`; không có thì Σ trọng lượng mọi dòng SP lỗi (ĐVT kg lấy SL nếu thiếu TL). Không lấy phiếu `bao_cao_hang_hong`.
- **Cột Tổng rác màng** = Σ trọng lượng phiếu `/danh-sach-bao-cao-san-luong` (`bao_cao_nghiem_thu`) mã **RAC MANG** + **MT-HANG RAC** (SP rác), khớp bộ lọc ngày · ca · máy.
- **Tổng hàng lỗi hỏng** / banner **Báo cáo lỗi hỏng** = **Lỗi hỏng (kg)** + **Tổng rác màng** (TL nhựa + Vật tư khác).
- Các mã `NHUAKM` / `NC` / `RMN` **không** liệt kê dòng trong «NVL trộn» — chỉ cộng cột tổng.
- **Chia % / cột Tỉ lệ trộn (%)** = **cùng công thức tab Tồn đầu ca «Tỉ lệ thực tế»**: KL NVL ÷ tổng KL `bao_cao_phoi_tron` × 100 (ngày · ca · máy, `resolveBbMixingShiftStatsForOrderHeader`). Trọng lượng lỗi = `(NHUAKM+NC+RMN) × tỉ lệ TT`. Không dùng ĐM/BOM — mã TT = «-» → lỗi `0`.
- **Tổng nhựa lỗi hỏng** = NHUAKM + NC + RMN.
- Tab luôn tạo nhóm theo **lệnh SX** (kể cả khi chưa có phiếu Hàng hỏng) để gắn NHUAKM từ phiếu cân.
- Dòng nguồn SP lỗi/rác gom theo **ngày · ca · máy** (`filterBbDamagedLinesForShiftBucket`) — phiếu chưa gắn mã lệnh vẫn vào đúng ca/máy; dòng **thiếu ca/máy không** vào bucket đã chọn (tránh nhân đôi TL); tiêu hao NVL dùng cùng bucket khi ghi `loi_hong_kg`.

## Cột chính

| Cột | UI |
|-----|-----|
| `ngay` / `ca` / `may` / `ma_lenh` | Header lệnh |
| `nhom` | `tron` (NVL trộn) · `con_lai` (NVL còn lại) |
| `ma_nvl` / `ten_nvl` / `don_vi` | Mã · Tên · ĐVT |
| `ti_le_tron_percent` | Tỉ lệ trộn (%) |
| `trong_luong_loi_kg` | Trọng lượng lỗi |
| `tong_nhua_loi_kg` / `tong_loi_hong_kg` | Tổng lệnh |

## API

| Method | Path |
|--------|------|
| GET | `/api/du-lieu-trong-bao-cao-hang-loi-hong?khoa_on_dinh=` |
| PUT | `/api/du-lieu-trong-bao-cao-hang-loi-hong` `{ khoa_on_dinh, items: [...] }` |

## Chạy SQL

```bash
node scripts/run-sql-file.mjs supabase-du-lieu-trong-bao-cao-hang-loi-hong.sql
```

## Liên quan

`bao_cao_nghiem_thu`, `bao_cao_hang_hong`, `bb_bao_cao_tinh_toan`, `control_board`
