# lenh_xuat_hang

| **Bảng** | `lenh_xuat_hang` |
| **Tab** | `shipping-orders` → `/lenh-xuat-hang` |

**SQL:** `supabase-lenh-xuat-hang.sql` · thêm cột BSX + Số Km: `supabase-lenh-xuat-hang-bsx.sql`  
**API:** `server.ts` — `GET/POST/PUT/DELETE /api/lenh-xuat-hang`  
**UI:** `src/features/lenh-xuat-hang/index.tsx` — `ShippingOrdersPanel`  
**Menu:** Kinh doanh → Lệnh xuất hàng (`src/app/menus.tsx`)

Khách hàng dropdown: `GET /api/khach-hang` (`khach_hang`)  
BSX: sổ xuống từ `GET /api/danh-sach-xe` (`danh_sach_xe.bsx`), gõ biển số mới rồi chọn **Thêm** để ghi vào lệnh (không tạo xe trong danh sách xe)  
Số Km: cột `so_km`  
In biên bản giao xe: A4 dọc, xem trước 3 lệnh/trang, tiêu đề lặp khi sang trang (`ShippingDeliveryPrintSheet`)