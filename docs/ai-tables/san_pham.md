# san_pham

| | |
|---|---|
| **Bảng** | `san_pham` |
| **Tab** | `products` → `/san-pham` |
| **SQL** | `supabase-san-pham.sql`, `supabase-san-pham-dinh-muc.sql`, `supabase-san-pham-npl-phan-tram.sql`, `supabase-san-pham-ton-dau-ky.sql`, `supabase-san-pham-kiem-kho-dong-bo.sql` |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/san-pham` | 3507 |
| POST | `/api/san-pham` | 3564 |
| PATCH | `/api/san-pham/:id` | 3629 |
| DELETE | `/api/san-pham` | 3592 |
| POST | `/api/kiem-kho/dong-bo-ton-dau` | Đồng bộ phiếu kiểm kho vào `ton_dau_ky` |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/san-pham/index.tsx` | Panel / logic chính |
| `src/features/san-pham/types.ts` | Panel / logic chính |
| `src/features/san-pham/productFieldClass.ts` | Panel / logic chính |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |


## Cột quan trọng

`ma_sp`, `ten_sp`, `nhom_vthh`, `ton_dau_ky`, `dinh_muc_npl` (JSON NPL).

Đồng bộ kiểm kho dùng `supabase-san-pham-kiem-kho-dong-bo.sql` trên DB chính để bảo đảm mỗi `kiem_kho.id` chỉ cộng một lần.

### Excel danh mục SP

- Nút **Tải mẫu Excel** / **Tải Excel lên** (và **Tải mẫu Excel SP**) — `src/utils/productCatalogExcel.ts`
- Cột khớp bảng UI trước: Mã SP, Tên, Tính chất, Nhóm, Đơn vị, Tổng TL, Tồn đầu, Nhập, Xuất, Tồn, Tồn TT + thêm định mức (AMIS, khổ cuộn, TL lõi/túi/nhựa…)
- **Ô trống vẫn đẩy lên** (chỉ bắt buộc có Mã SP hoặc Tên)
- Upsert theo `ma_sp`
- File mẫu cũ kiểu Tên NVL/Loại/Giá trị → báo lỗi hướng dẫn dùng mẫu danh mục
- Định mức NVL riêng: **Mẫu định mức NVL** / **Nhập định mức NVL**

## Không đọc

Các file feature ở trên — không mở `App.monolith.backup.tsx` trừ khi cần tham chiếu lịch sử.
