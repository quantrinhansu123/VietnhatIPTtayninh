# lenh_xuat_hang

| **Bảng** | `lenh_xuat_hang` |
| **Tab** | `shipping-orders` → `/lenh-xuat-hang` |

**SQL:** `supabase-lenh-xuat-hang.sql` · thêm cột BSX + Số Km: `supabase-lenh-xuat-hang-bsx.sql`  
**API:** `server.ts` — `GET/POST/PUT/DELETE /api/lenh-xuat-hang`  
**UI:** `src/features/lenh-xuat-hang/index.tsx` — `ShippingOrdersPanel`  
**Menu:** Kinh doanh → Lệnh xuất hàng (`src/app/menus.tsx`)

Một lệnh có nhiều khách (`khach` trên form). Mỗi khách chọn nhiều mặt hàng. Nút **Điền từ đơn hàng** lấy đơn theo ngày từ `GET /api/don-hang`, tick đơn rồi đổ khách và SP vào form. Khách + địa chỉ + SĐT + ghi chú lưu trong từng dòng `chi_tiet` (mỗi khách một ghi chú). Dropdown khách: `GET /api/khach-hang`  
BSX: sổ xuống từ `GET /api/danh-sach-xe` (`danh_sach_xe.bsx`), gõ biển số mới rồi chọn **Thêm** để ghi vào lệnh (không tạo xe trong danh sách xe)  
Số Km: cột `so_km`  
In biên bản giao xe: A4 dọc, xem trước 3 lệnh/trang, tiêu đề lặp khi sang trang (`ShippingDeliveryPrintSheet`)