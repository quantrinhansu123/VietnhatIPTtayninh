# bb_phan_tich_danh_gia

Phân tích đánh giá (gõ tay) trên tab **Đánh giá hiệu quả lỗi hỏng & hao hụt NVL** — `/phan-tich-tu-dong` · `/phan-tich` · bảng điều khiển.

## SQL

`supabase-bb-phan-tich-danh-gia.sql` — chạy trên Supabase (DB hệ thống).

```bash
node scripts/run-sql-file.mjs supabase-bb-phan-tich-danh-gia.sql
```

(Cần `SUPABASE_DB_PASSWORD` hoặc `SUPABASE_DB_URL` trong `.env`.)

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bb-phan-tich-danh-gia?dateFrom=&dateTo=` | Tải theo khoảng ngày |
| PUT | `/api/bb-phan-tich-danh-gia` | Upsert `{ items: [...] }` theo `khoa_on_dinh` |

Khóa ổn định: `ngay|ca|may|ma_lenh`.

## UI

| File | Vai trò |
|------|---------|
| `ControlBoardBbMachineReportTable.tsx` | Tab đánh giá → gõ phân tích → **Lưu phân tích DB** |
| `src/utils/bbPhanTichDanhGia.ts` | Key ổn định + type |

localStorage `control-board-bb-phan-tich-v1` vẫn dùng làm cache tạm; khi tải trang, DB ghi đè nếu có nội dung.

## Liên quan

`control_board`, `bb_bao_cao_ly_do`, `lenh_sx`
