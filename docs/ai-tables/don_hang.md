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

### Danh sách / tìm kiếm

- Ô tìm trên `/don-hang` khớp **mã đơn, khách, mã SP, tên SP** (không dấu). Nếu dòng đơn chỉ lưu mã SP, tên lấy từ danh mục `/api/san-pham` để vẫn tìm được theo tên.
- Logic khớp dùng chung: **`src/features/_shared/productSearchMatch.ts`** (`tokenizeSearchQuery` + `matchSearchTokens`). Ba điểm quan trọng:
  - **Bỏ mọi ký tự phân cách** ở cả từ khoá và dữ liệu → `bb453`, `BB-453`, `1.4m 95m` đều khớp `MN-BB453`, `1.4m*95m`.
  - **Mã hàng (`kind: 'code'`) chỉ khớp khít / đầu chuỗi / trọn một từ** — không khớp chuỗi con, nên `bb453` **không** dính `MN-BB4530`. Tên/khách/ghi chú (`kind: 'name'`) mới cho khớp chuỗi con.
  - **Nhiều từ khoá phải cùng khớp trong MỘT dòng SP** (mỗi dòng là 1 nhóm) → tránh khớp chéo dòng (`BB453` dòng 1 + `6.28kg` dòng 2 không còn bị coi là khớp).
- Kết quả được **chấm điểm** và xếp hạng: mã khớp khít lên đầu; điểm bằng nhau giữ nguyên thứ tự gốc. Dòng SP khớp được làm nổi bật, dòng không khớp bị mờ.
- Cùng logic dùng cho `/lenh-san-xuat` và ô tìm "Tự điền theo lệnh SX" trong modal Kế hoạch SX.

### Form đơn hàng

- **Khách hàng**: sổ xuống lấy từ `/api/khach-hang`; bắt buộc với **Đơn bán**, không bắt buộc với **Đơn sản xuất**.
- **Nhân viên**: chọn từ `/api/nhan-su` — chi nhánh **HCM**, Phòng kinh doanh + Quản đốc — hoặc **nhập tay** (`allowCustomValue`). Form thêm mới **tự điền** theo `authUser.name` (khớp tên trong danh sách HCM nếu có).
- Modal dùng chung: `src/features/don-hang/OrderFormModal.tsx` — mở từ trang Đơn hàng và từ **Thêm lệnh SX** (nút **Thêm đơn mới**).
- **Ghi chú từng dòng SP**: lưu trong jsonb `san_pham[].ghi_chu` (không cần cột DB mới). Form + danh sách + phiếu in đọc/ghi field này.
- **Tồn kho theo dòng**: form thêm/sửa trong `OrdersPanel` hiển thị tồn thành phẩm tính từ nhập/xuất kho (`/api/chi-tiet-san-pham/ton-kho`) và tự làm mới khi form còn mở.

### Liên kết lệnh SX

Trong `AddProductionOrderModal` (`ke-hoach-san-xuat` / `lenh-sx`): nút **Thêm đơn mới** luôn hiện → mở `OrderFormModal`; sau khi lưu sẽ nạp đơn vào danh sách và tự điền dòng mã hàng.
