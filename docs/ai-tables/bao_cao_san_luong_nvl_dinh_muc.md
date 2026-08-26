# bao_cao_san_luong_nvl_dinh_muc

| **Bảng** | `bao_cao_san_luong_nvl_dinh_muc` |
| **Tab** | `acceptance-report-list` (modal NVL theo định mức) |
| **SQL** | `supabase-bao-cao-san-luong-nvl-dinh-muc.sql` |

Snapshot NVL định mức gắn **từng dòng** `bao_cao_nghiem_thu`. Khi bấm **Đồng bộ** trên modal: lấy Thành phần từ Kho sản phẩm (`san_pham.npl_phan_tram`) × SL phiếu, rồi **ghi DB**.

Tab **Báo cáo sản lượng** (`/phan-tich-tu-dong`) khi **Tính toán** **chỉ đọc** snapshot này theo id phiếu; **không** tự tính/ghi từ Thành phần SP, máy hay trộn. Chưa Đồng bộ trên danh sách phiếu → tab không có dòng NVL.

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-san-luong-nvl-dinh-muc.sql
```

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bao-cao-san-luong-nvl-dinh-muc?id_bao_cao=` | Tải snapshot theo 1 ID phiếu |
| GET | `/api/bao-cao-san-luong-nvl-dinh-muc?ids=a,b,c` | Tải nhiều phiếu → `{ by_id, items }` |
| PUT | `/api/bao-cao-san-luong-nvl-dinh-muc` | Thay toàn bộ dòng: `{ id_bao_cao, ma_sp, ten_sp, so_luong_sp, don_vi_sp, items: [...] }` |

## UI

| File | Vai trò |
|------|---------|
| `AcceptanceReportListView.tsx` | Modal Xem / Đồng bộ → load DB, lưu snapshot |
| `ControlBoardBbMachineReportTable.tsx` | Tab Báo cáo sản lượng — Tính toán đọc snapshot |

## Liên quan

[bao_cao_nghiem_thu.md](./bao_cao_nghiem_thu.md), [san_pham.md](./san_pham.md)
