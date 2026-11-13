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

- `src/features/bieu-do-th/index.tsx` — menu **Quản trị → Biểu đồ TH** · lọc → **bảng tổng hợp** → tab **Lỗi hỏng / Sản lượng / Biểu đồ**
- `src/features/bieu-do-th/TongHopTreeTable.tsx` — bảng drill-down **Ngày → Ca → Máy**
- `src/features/bieu-do-th/staffEnrichment.ts` — ghép `cong_nhan_phu_trach` = trưởng ca (`truong_ca` → fallback `nhan_su_chinh` → người đầu `nhan_su`) theo ngày·ca·máy
- `src/features/bieu-do-th/chartUi.tsx` — card / KPI / tooltip / gradient dùng chung cho biểu đồ TH
- `src/features/bieu-do-th/LoiHongPanel.tsx` — tab Lỗi hỏng (KPI + biểu đồ + bảng theo Ngày·Ca·Máy · trưởng ca)
- `src/features/bieu-do-th/SanLuongPanel.tsx` — tab Sản lượng (KPI + biểu đồ + bảng theo Ngày·Ca·Máy · trưởng ca)
- `src/features/bieu-do-th/BieuDoThCharts.tsx` — tab Biểu đồ · biến thiên theo Ngày · Ca + theo trưởng ca
- `src/features/bieu-do-th/ProductionComparison.tsx` — tab Biểu đồ · KPI, so sánh máy/ngày/tháng/trưởng ca, tỷ trọng và hao hụt theo ca.
- `src/features/bieu-do-th/comparisonData.ts` — loại snapshot tổng/khoảng ngày, chọn bản mới nhất theo ngày·ca·máy, tính tỷ lệ từ tổng khối lượng.

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-tong-hop.sql
```

## Báo cáo ngày

Quản trị → /bao-cao-ngay: xem [bao_cao_tong_hop_ngay.md](./bao_cao_tong_hop_ngay.md). Dùng chung API, không tạo bảng mới.
