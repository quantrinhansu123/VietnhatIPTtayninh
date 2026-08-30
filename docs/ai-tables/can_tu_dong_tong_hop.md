# can_tu_dong_tong_hop

| | |
|---|---|
| **Bảng** | `can_tu_dong_tong_hop` |
| **Tab** | `/phan-tich-tu-dong` · tab **Dữ liệu cân thực tế** |
| **SQL** | `supabase-can-tu-dong-tong-hop.sql` (DB hệ thống) |

Tổng hợp theo Ngày · Ca · Máy. Nút **Đồng bộ từ cân AI** ghi `can_tu_dong_tong_hop` (số cuộn + TL SP). Tab UI tính thêm đủ tiêu chí từ phiếu `can_tu_dong` (slim, không ảnh) + danh mục `/kho-hang` (`san_pham`).

```bash
node scripts/run-sql-file.mjs supabase-can-tu-dong-tong-hop.sql
```

## Cột bảng DB

| Cột | Ý nghĩa |
|-----|---------|
| `ngay` / `ca` / `may` | Khóa nghiệp vụ |
| `so_cuon` | Số cuộn thực tế = số lần cân |
| `tong_trong_luong_kg` | Σ Cân sản phẩm (`weight`) |
| `tong_trong_luong_nhua_kg` | Σ nhựa = SP − lõi − bì 0,16 |

## Cột UI tab Dữ liệu cân thực tế

| Cột | Nguồn |
|-----|--------|
| Số cuộn / Tổng TL thực tế | Σ phiếu cân |
| **Trọng lượng Nhựa ĐM** | `san_pham.trong_luong_nhua` (cột Kho hàng) × 1 cuộn theo Mã SP từ QR |
| **Khối lượng màng** | Khối lượng màng BOM Thành phần SP × 1 cuộn |
| **Trọng lượng Nhựa TT** | Cân SP − Cân lõi − bì 0,16 − màng BOM |
| **Chênh lệch nhựa** | Nhựa TT − Nhựa ĐM |
| **Phần trăm chênh** | CL ÷ Nhựa TT × 100 |
| **Trọng lượng Lõi ĐM** | `san_pham.trong_luong_loi` |
| **Trọng lượng Lõi TT** | Σ `tare_weight` / `can_loi` |
| **Trọng lượng bì** | Σ 0,16 kg / cuộn |

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/can-tu-dong-tong-hop?from=&to=` | Đọc bản đã tổng hợp |
| POST | `/api/can-tu-dong-tong-hop/dong-bo` | Gộp từ `can_tu_dong` (không ký URL ảnh) rồi upsert |
| GET | `/api/can-tu-dong?images=0&dateBy=ngay` | Phiếu slim để tính đủ tiêu chí trên UI |

## UI

| File | Vai trò |
|------|---------|
| `BbCanTuDongTongHopPanel.tsx` | Tab Dữ liệu cân thực tế — KPI + bảng đủ tiêu chí |
| `canTuDongTongHop.ts` | `buildCanTuDongTongHopDetailRows` |
| `ControlBoardBbMachineReportTable.tsx` | Truyền `products` vào panel |

## Liên quan

[can_tu_dong.md](./can_tu_dong.md), [control_board.md](./control_board.md), [san_pham.md](./san_pham.md)
