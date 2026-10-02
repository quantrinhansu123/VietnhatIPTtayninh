# phieu_ban_hang

| | |
|---|---|
| **Bảng** | `phieu_ban_hang` |
| **Tab** | `sales-invoices` → `/phieu-ban-hang` |

**SQL:** `supabase-phieu-ban-hang.sql`  
**API:** `server.ts` 11707–11791 — `GET/POST/PUT/DELETE /api/phieu-ban-hang`  
**UI:** `src/features/phieu-ban-hang/index.tsx` — `SalesInvoicesPanel`  
**Menu:** Kinh doanh → Phiếu bán hàng (`src/app/menus.tsx`)

Nút **Thêm phiếu** mở form. Trong form, chọn lệnh từ `GET /api/lenh-xuat-hang`, chọn khách trên lệnh nếu lệnh có nhiều khách, rồi bấm **Thêm nội dung lệnh** để đổ khách hàng và mặt hàng vào phiếu. Có thể sửa số lượng, đơn giá và thêm mặt hàng thủ công.
