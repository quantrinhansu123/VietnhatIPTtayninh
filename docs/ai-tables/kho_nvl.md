# kho_nvl

| | |
|---|---|
| **Bảng** | `kho_nvl` |
| **Tab** | `inventory-catalog` → `/kho-hang` (route cũ: `materials` → `/kho-nvl`) |
| **SQL** | `supabase-kho-nvl.sql`, `supabase-kho-nvl-ten-kho.sql` |
| **Fix precision** | `supabase-kho-nvl-precision.sql` (giữ số lẻ, không bị làm tròn) |

## API (`server.ts`)

| Method | Path | Dòng |
|--------|------|------|
| GET | `/api/kho-nvl` | 4605 |
| POST | `/api/kho-nvl` | 4633 |
| POST | `/api/kho-nvl/fill-total-kg` | 4661 |
| PATCH | `/api/kho-nvl/:id` | 4713 |
| DELETE | `/api/kho-nvl/:id` | 4752 |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kho-nvl/index.tsx` | Panel / logic chính |
| `src/features/kho-hang/index.tsx` | Màn hình gộp Kho hàng, chọn Nguyên vật liệu / Thành phẩm |
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |

UI danh sách không hiển thị các cột Tồn đầu / Nhập / Xuất / Tồn cuối; thay bằng một cột **Tổng SL** lấy từ `ton_cuoi_ky` đã tính theo phiếu kho đến ngày đang chọn. Form thêm và sửa không hiển thị Tồn đầu kỳ / Nhập trong kỳ / Xuất trong kỳ; các cột DB cũ vẫn được giữ để tương thích dữ liệu và nghiệp vụ tồn kho.


## Liên kết

Phiếu xuất nhập (`phieu_xuat_nhap_kho`) cập nhật tồn kho NVL.

### Excel danh mục NVL

- **Tải mẫu Excel** / **Tải Excel lên** — `src/utils/materialCatalogExcel.ts`
- Cột khớp bảng + form: Mã NPL, Tên, ĐV, Tổng kg, Tồn đầu, Nhập, Xuất, Kg nhựa/túi/lõi, Khổ cuộn, Chiều dài ĐV
- Ô trống vẫn đẩy lên (null); tạo mới cần Mã + Tên; cập nhật thiếu tên thì giữ tên cũ
- Upsert theo `ma_npl`
- Mẫu 2 cột cũ tách riêng: **Mẫu cập nhật Tổng kg** / **Nhập Tổng kg**
