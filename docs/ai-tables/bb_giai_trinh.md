# bb_giai_trinh

Giải trình (gõ tay) trên tab **Giải trình** — `/phan-tich-tu-dong` · bảng điều khiển.

## SQL

`supabase-bb-giai-trinh.sql` — chạy trên Supabase (DB hệ thống).

```bash
node scripts/run-sql-file.mjs supabase-bb-giai-trinh.sql
```

(Cần `SUPABASE_DB_PASSWORD` hoặc `SUPABASE_DB_URL` trong `.env`.)

## Cột

| Cột DB | Nhãn UI |
|--------|---------|
| `van_de` | Vấn đề |
| `giai_quyet` | Giải quyết |
| `lan_lap_lai` | Lần lặp lại |
| `nguoi_chiu_trach_nhiem` | Người chịu trách nhiệm |

Khóa ổn định: `ngay|ca|may|ma_lenh`.

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bb-giai-trinh?dateFrom=&dateTo=` | Tải theo khoảng ngày |
| PUT | `/api/bb-giai-trinh` | Upsert `{ items: [...] }` theo `khoa_on_dinh` |

## UI

| File | Vai trò |
|------|---------|
| `ControlBoardBbMachineReportTable.tsx` | Tab Giải trình → gõ theo lệnh → **Lưu giải trình DB** |
| `src/utils/bbGiaiTrinh.ts` | Key ổn định + type |

**Không** dùng localStorage — chỉ đọc/ghi Supabase (`GET`/`PUT` API).

## Liên quan

`control_board`, `bb_phan_tich_danh_gia`, `lenh_sx`
