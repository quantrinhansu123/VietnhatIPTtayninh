# bao_cao_thanh_pham_dat_nhap_kho

| | |
|---|---|
| **Bảng** | `bao_cao_thanh_pham_dat_nhap_kho` |
| **Tab** | `/phan-tich-tu-dong` · **Báo cáo thành phẩm đạt nhập kho** |
| **SQL** | `supabase-bao-cao-thanh-pham-dat-nhap-kho.sql` |

Snapshot riêng. 1 dòng = 1 SP. Ghi khi **Tính toán**.

**Nguồn UI:** lấy **hết SP** từ tab **Báo cáo sản lượng** (`productGroups`) — không giới hạn theo dòng LSX, không lấy Cân AI, không lấy `phieu_nhap`.

**Hạch toán NVL** (khi mở lệnh): 2 bảng song song **NVL trộn** | **NVL khác** từ `nvlTotals` / dòng NVL Báo cáo sản lượng.

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/bao-cao-thanh-pham-dat-nhap-kho` |

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-thanh-pham-dat-nhap-kho.sql
```
