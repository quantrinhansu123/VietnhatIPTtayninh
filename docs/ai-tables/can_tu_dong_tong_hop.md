# can_tu_dong_tong_hop

| | |
|---|---|
| **Bảng** | `can_tu_dong_tong_hop` |
| **Tab** | `/phan-tich-tu-dong` · tab **Dữ liệu cân thực tế** |
| **SQL** | `supabase-can-tu-dong-tong-hop.sql` (DB hệ thống) |

Tổng hợp **Số cuộn thực tế** + **Tổng trọng lượng thực tế** theo Ngày · Ca · Máy. Trang không còn tải từng phiếu `can_tu_dong` (ảnh, 10k dòng).

Nguồn gốc: `can_tu_dong` (DB cân). Đồng bộ bằng `POST /api/can-tu-dong-tong-hop/dong-bo` hoặc nút **Tính toán**.

```bash
node scripts/run-sql-file.mjs supabase-can-tu-dong-tong-hop.sql
```

## Cột

| Cột | Ý nghĩa |
|-----|---------|
| `ngay` / `ca` / `may` | Khóa nghiệp vụ |
| `so_cuon` | Số cuộn thực tế = số lần cân |
| `tong_trong_luong_kg` | Σ Cân sản phẩm (`weight`) |
| `tong_trong_luong_nhua_kg` | Σ nhựa = SP − lõi − bì 0,16 |

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/can-tu-dong-tong-hop?from=&to=` | Đọc bản đã tổng hợp |
| POST | `/api/can-tu-dong-tong-hop/dong-bo` | Gộp từ `can_tu_dong` (không ký URL ảnh) rồi upsert |

## UI

| File | Vai trò |
|------|---------|
| `BbCanTuDongTongHopPanel.tsx` | Tab Dữ liệu cân thực tế — 2 số tổng + bảng Ngày/Ca/Máy |
| `ControlBoardBbMachineReportTable.tsx` | Gọi panel; Tính toán đồng bộ thêm |

## Liên quan

[can_tu_dong.md](./can_tu_dong.md), [control_board.md](./control_board.md)
