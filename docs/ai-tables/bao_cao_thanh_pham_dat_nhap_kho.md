# bao_cao_thanh_pham_dat_nhap_kho

| | |
|---|---|
| **Bảng** | `bao_cao_thanh_pham_dat_nhap_kho` |
| **Tab** | `/phan-tich-tu-dong` · **Báo cáo thành phẩm đạt nhập kho** |
| **SQL** | `supabase-bao-cao-thanh-pham-dat-nhap-kho.sql` |

Snapshot riêng. 1 dòng = 1 SP trong lệnh. Ghi khi **Tính toán**.

**In mục 2** · SL đạt: ưu tiên Báo cáo sản lượng / Cân AI (số cuộn). **Trọng lượng thực tế** = trọng lượng SP (`Σ Cân sản phẩm`), không lấy Nhựa TT. Không lấy `phieu_nhap`.

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/bao-cao-thanh-pham-dat-nhap-kho` |

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-thanh-pham-dat-nhap-kho.sql
```
