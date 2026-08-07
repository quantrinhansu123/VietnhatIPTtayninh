# kho_nvl

| | |
|---|---|
| **Bảng** | `kho_nvl` |
| **Tab** | `materials` → `/kho-nvl` |
| **SQL** | `supabase-kho-nvl.sql` |
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
| `src/App.tsx` | Shell routing — import panel, không chứa logic bảng |
| `src/features/_shared/` | Helper dùng chung (storage, hr, recordHelpers) |


## Liên kết

Phiếu xuất nhập (`phieu_xuat_nhap_kho`) cập nhật tồn kho NVL.

### Excel danh mục NVL

- **Tải mẫu Excel** / **Tải Excel lên** — `src/utils/materialCatalogExcel.ts`
- Cột khớp bảng + form: Mã NPL, Tên, ĐV, Tổng kg, Tồn đầu, Nhập, Xuất, Kg nhựa/túi/lõi, Khổ cuộn, Chiều dài ĐV
- Ô trống vẫn đẩy lên (null); tạo mới cần Mã + Tên; cập nhật thiếu tên thì giữ tên cũ
- Upsert theo `ma_npl`
- Mẫu 2 cột cũ tách riêng: **Mẫu cập nhật Tổng kg** / **Nhập Tổng kg**
