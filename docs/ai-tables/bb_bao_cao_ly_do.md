# bb_bao_cao_ly_do

Lý do giải trình **từng dòng SP** trên phiếu in Báo cáo tổng hợp máy BB.

## SQL

`supabase-bb-bao-cao-ly-do.sql` — chạy trên Supabase (DB hệ thống).

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bb-bao-cao-ly-do?dateFrom=&dateTo=` | Tải lý do theo khoảng ngày |
| PUT | `/api/bb-bao-cao-ly-do` | Upsert `{ items: [...] }` theo `khoa_on_dinh` |

Khóa ổn định: `ngay|ca|may|ma_lenh|ma_sp`.

## UI

| File | Vai trò |
|------|---------|
| `ControlBoardBbMachineReportTable.tsx` | Xem trước in → gõ lý do từng dòng → **Lưu lý do DB** |
| `ControlBoardBbMachineReportPrintSheet.tsx` | Cột Lý do trên phiếu in |
| `src/utils/bbBaoCaoLyDo.ts` | Key ổn định + type |

## Liên quan

`control_board`, `lenh_sx`
