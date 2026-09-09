# don_hang

| | |
|---|---|
| **Bảng** | `don_hang` |
| **Tab** | `orders` → `/don-hang` |
| **SQL** | `supabase-don-hang-*.sql` |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET/POST/PATCH/DELETE | `/api/don-hang` | 3872–3999 |

Helper tự sinh mã: `generateNextOrderCodeFromDb()` ~2924.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/don-hang/index.tsx` | Panel / logic chính |
| `src/features/don-hang/OrderFormModal.tsx` | Modal thêm/sửa đơn (dùng chung với lệnh SX) |
| `src/features/_shared/orderHelpers.ts` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |


## Liên kết

Tạo lệnh SX: `POST /api/lenh-sx/from-don-hang/:id`

### Form đơn hàng

- **Khách hàng**: sổ xuống (`<select>`) lấy từ `/api/khach-hang` (bảng danh mục Khách hàng), bắt buộc chọn.
- Modal dùng chung: `src/features/don-hang/OrderFormModal.tsx` — mở từ trang Đơn hàng và từ **Thêm lệnh SX** (nút **Thêm đơn mới**).
- **Ghi chú từng dòng SP**: lưu trong jsonb `san_pham[].ghi_chu` (không cần cột DB mới). Form + danh sách + phiếu in đọc/ghi field này.

### Liên kết lệnh SX

Trong `AddProductionOrderModal` (`ke-hoach-san-xuat` / `lenh-sx`): nút **Thêm đơn mới** luôn hiện → mở `OrderFormModal`; sau khi lưu sẽ nạp đơn vào danh sách và tự điền dòng mã hàng.
