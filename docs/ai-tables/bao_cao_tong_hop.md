# bao_cao_tong_hop

| | |
|---|---|
| **Bảng** | `bao_cao_tong_hop` |
| **UI** | `/phan-tich-tu-dong` · khối KPI **Báo cáo tổng hợp** + **Tổng hợp nhựa** |
| **SQL** | `supabase-bao-cao-tong-hop.sql` |

Snapshot riêng — **1 dòng / `khoa_on_dinh`**. Ghi khi **Tính toán**. Không trùng `bb_bao_cao_tinh_toan` (JSON tổng).

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/bao-cao-tong-hop` |

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-tong-hop.sql
```
