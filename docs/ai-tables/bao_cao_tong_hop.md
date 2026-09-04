# bao_cao_tong_hop

| | |
|---|---|
| **Bảng** | `bao_cao_tong_hop` |
| **UI** | `/phan-tich-tu-dong` · KPI tổng hợp · **`/bieu-do-th`** (Biểu đồ TH) |
| **SQL** | `supabase-bao-cao-tong-hop.sql` |

Snapshot riêng — **1 dòng / `khoa_on_dinh`**. Ghi khi **Tính toán**.

## API

| Method | Path | Query |
|--------|------|-------|
| GET/PUT | `/api/bao-cao-tong-hop` | `khoa_on_dinh`, `ngay_tu`, `ngay_den`, `limit` |

## Feature

- `src/features/bieu-do-th/index.tsx` — menu **Quản trị → Biểu đồ TH** (bảng theo ngày)
- `src/features/bieu-do-th/BieuDoThCharts.tsx` — biểu đồ biến thiên theo Ngày · Ca (12C1 trước 12C2)

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-tong-hop.sql
```
