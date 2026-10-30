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
- `src/features/bieu-do-th/ProductionComparison.tsx` — KPI, so sánh máy/ngày/tháng, tỷ trọng, ngày chạy, bảng màu và hao hụt theo ca.
- `src/features/bieu-do-th/comparisonData.ts` — loại snapshot tổng/khoảng ngày, chọn bản mới nhất theo ngày·ca·máy, tính tỷ lệ từ tổng khối lượng.

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-tong-hop.sql
```
