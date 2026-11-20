# bao_cao_lech_ghi_chu

Ghi chú bất thường theo dòng **cột lệch** (mục 3.1 báo cáo BB) trên hub `/danh-sach-bao-cao` → tab **Báo cáo**.

## SQL

`supabase-bao-cao-lech-ghi-chu.sql` — DB hệ thống. Nếu chưa chạy SQL, API fallback file `bao-cao-lech-ghi-chu-db.json`.

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-lech-ghi-chu.sql
```

## API (`server.ts` ~23104–23195)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bao-cao-lech-ghi-chu?dateFrom=&dateTo=` | Danh sách ghi chú |
| PUT | `/api/bao-cao-lech-ghi-chu` | Upsert theo `note_key` |

`note_key` = `ngay|ca|may|ma_lenh|ma_nvl`.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/bao-cao-lech/index.tsx` | Tab Báo cáo — bảng lệch + ô ghi chú · nút **Lưu** / **In** |
| `src/features/bao-cao-lech/BaoCaoLechPrintSheet.tsx` | Mẫu in A4 (chênh lệch + ghi chú + chữ ký) |
| `src/features/bao-cao-lech/extractLechRows.ts` | Trích `chenhLechKg` từ `bb_bao_cao_tinh_toan.payload` |
| `src/features/report-lists/ReportListsHub.tsx` | Tab id `bao-cao-lech` |

Nguồn số lệch: snapshot `bb_bao_cao_tinh_toan` (cần **Tính toán** trên Báo cáo theo LSX trước). Bộ lọc chung hub (ngày · ca · máy · tìm) áp dụng cho bảng.

- **Lưu**: ghi chắc toàn bộ dòng đang xem (lệch + ghi chú) qua `PUT /api/bao-cao-lech-ghi-chu`.
- **In**: mở hộp thoại in mẫu báo cáo lệch theo bộ lọc hiện tại.
