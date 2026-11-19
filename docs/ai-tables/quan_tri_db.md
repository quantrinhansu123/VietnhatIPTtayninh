# quan_tri_db

Màn **Quản trị DB** — admin duyệt bảng / chạy SQL trên mọi project Supabase đã cấu hình trong `.env`.

| | |
|--|--|
| **Tab** | `db-admin` → `/quan-tri-db` |
| **Menu** | Quản trị → Quản trị DB |
| **SQL** | *(không có migration riêng — dùng REST/pg tới các DB hiện có)* |

## API (`src/features/quan-tri-db/server.ts`)

Mount: `app.use('/api/db-admin', …)` trong `server.ts`.

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/db-admin/targets` | Danh sách DB (label, host, `hasRest`, `hasSql`) |
| GET | `/api/db-admin/tables?db=` | List bảng `public` |
| GET | `/api/db-admin/rows?db=&table=&limit=&offset=` | Đọc dòng + PK |
| PATCH | `/api/db-admin/rows` | Update theo PK `{ db, table, match, values }` |
| DELETE | `/api/db-admin/rows` | Delete theo PK `{ db, table, match }` |
| POST | `/api/db-admin/sql` | Chạy SQL (chỉ DB có `hasSql`) |

## Targets

`he-thong`, `phieu-can`, `kiem-kho`, `kho`, `kho-cho`, `ton` — map từ client env hiện có. SQL bật khi có `SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD` (he-thong) hoặc `SUPABASE_<PREFIX>_DB_URL` / `_DB_PASSWORD`.

## UI / files

| File | Vai trò |
|------|---------|
| `src/features/quan-tri-db/index.tsx` | Panel (chọn DB, tab Bảng + SQL), chỉ `isAdmin` |
| `src/features/quan-tri-db/server.ts` | Router Express |
| `src/app/menus.tsx` | Card `ADMIN_MENU_ITEMS` + nav |
| `src/routes.ts` | `db-admin` → `/quan-tri-db` |

## Liên quan

`cai_dat_thoi_gian` (phân quyền), hub `quan-tri`
