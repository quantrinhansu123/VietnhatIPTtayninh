# bao_cao_tieu_hao_nguyen_vat_lieu

| | |
|---|---|
| **Bảng** | `bao_cao_tieu_hao_nguyen_vat_lieu` |
| **Tab** | `/phan-tich-tu-dong` · **Báo cáo tiêu hao nguyên vật liệu** |
| **SQL** | `supabase-bao-cao-tieu-hao-nguyen-vat-lieu.sql` |

Snapshot riêng. 1 dòng = 1 NVL (`nhom` = `nhua` \| `khac`). Ghi khi **Tính toán**.

**Cột Nhập thành phẩm (`kl_thuc_te_kg` / finishedKg):** **y đúc** cột TL «Tổng vật tư trộn» / NVL trên tab Báo cáo sản lượng (`nvlTotals.actualWeightKg`) khớp ngày·ca·máy — **không** × lại tỉ lệ trộn, **không** giới hạn mã LSX. Builder: `bbTieuHaoNvlPrintRows.ts`.

**Cột `loi_hong_kg` (Trọng lượng vật tư lỗi hỏng):** lấy từ tab Hàng lỗi hỏng trên BC sản lượng, gom theo **ngày · ca · máy** (`filterBbDamagedLinesForShiftBucket`) — không bắt buộc phiếu SP lỗi đã gắn mã lệnh SX; **bắt buộc khớp ca/máy** (không lấy dòng trống ca để tránh cộng trùng / lẫn ca). Phân bổ vào NVL trộn giống tab «Báo cáo lỗi hỏng» (Σ NHUAKM+NC+RMN hoặc Σ SP lỗi × tỉ lệ %). Sau sửa logic cần **Tính toán** lại.

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/bao-cao-tieu-hao-nguyen-vat-lieu` |

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-tieu-hao-nguyen-vat-lieu.sql
```
