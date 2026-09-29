# lenh_xuat_hang

| **Bảng** | `lenh_xuat_hang` |
| **Tab** | `shipping-orders` → `/lenh-xuat-hang` |

**SQL:** `supabase-lenh-xuat-hang.sql` · thêm cột BSX + Số Km: `supabase-lenh-xuat-hang-bsx.sql`  
**API:** `server.ts` — `GET/POST/PUT/DELETE /api/lenh-xuat-hang`  
**UI:** `src/features/lenh-xuat-hang/index.tsx` — `ShippingOrdersPanel`  
**Menu:** Kinh doanh → Lệnh xuất hàng (`src/app/menus.tsx`)

Khách hàng dropdown: `GET /api/khach-hang` (`khach_hang`)  
BSX dropdown: `GET /api/danh-sach-xe` (`danh_sach_xe`) — cột `bsx`  
Số Km: cột `so_km`