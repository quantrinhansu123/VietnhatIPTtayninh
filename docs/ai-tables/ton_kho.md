# ton_kho

| | |
|---|---|
| **Nguồn dữ liệu** | `kho_nvl`, `san_pham`, `phieu_xuat_nhap_kho` |
| **Tab** | `ton-kho` → `/ton-kho` |
| **SQL** | `supabase-kho-nvl-ten-kho.sql`, `supabase-san-pham-ten-kho.sql`, `supabase-phieu-xuat-nhap-kho-ten-kho.sql`, `supabase-ton-kho-rpc.sql` |

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/ton-kho/chi-tiet` | Gọi RPC theo `loai_kho`, kho và khoảng ngày; tự tính từ bảng nếu RPC chưa được cài |
| GET | `/api/ton-kho/tong-hop` | Gọi RPC và trả số liệu tổng hợp tồn; tự tính từ bảng nếu RPC chưa được cài |

## Frontend

| File | Nội dung |
|---|---|
| `src/features/ton-kho/index.tsx` | Hai tab dùng chung một tập mã: chi tiết hiển thị từng QR/SKU, tổng hợp hiển thị tồn đầu/nhập/xuất/tồn cuối; cùng bộ lọc loại, kho, ngày |
| `src/App.tsx` | Shell routing, import `TonKhoPanel` |
| `src/app/menus.tsx` | Menu và tiêu đề tab |

Kho vật lý lấy từ `quan_ly_kho`. Loại tồn chỉ gồm `nvl` và `san_pham`.
