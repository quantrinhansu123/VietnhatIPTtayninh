# ton_kho

| | |
|---|---|
| **Nguồn dữ liệu** | Thành phẩm: `nhap_kho`/`xuat_kho` + header `phieu_nhap`/`phieu_xuat` (DB kho) tính trong `loadTonKhoSanPhamFromKho` (server.ts); NVL: RPC `ton_kho_nvl_gop` |
| **Tab** | `ton-kho` → `/ton-kho` |
| **SQL** | `supabase-ton-kho-rpc.sql` (NVL); xóa bảng QR cũ: `supabase-drop-chi-tiet-san-pham.sql` |

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/ton-kho/chi-tiet` | Từng mã QR/lô còn tồn cuối kỳ |
| GET | `/api/ton-kho/tong-hop` | Gộp theo mã gốc; tồn đầu kỳ ngày sau = tồn cuối kỳ ngày trước |
| GET | `/api/chi-tiet-san-pham/ton-kho` | Tổng tồn 1 mã gốc (đơn hàng, kế hoạch SX) |

Frontend: `src/features/ton-kho/index.tsx`. Không còn dùng bảng `chi_tiet_san_pham` / `bien_dong_chi_tiet_san_pham`.
