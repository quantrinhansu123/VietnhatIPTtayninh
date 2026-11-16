# quy_doi_vat_lieu

| | |
|---|---|
| **DB** | DB chính hệ thống (`SUPABASE_URL`), bảng `quy_doi_vat_lieu` |
| **SQL** | `supabase-quy-doi-vat-lieu.sql` — RLS, chỉ service role; cột `ngay` · `ca` · `ma_may` |
| **Tab** | `/danh-sach-bao-cao` → **Quy đổi vật liệu** (`material-conversion`, tab nội bộ hub) |
| **UI** | `src/features/quy-doi-vat-lieu/index.tsx` |
| **API** | `src/features/quy-doi-vat-lieu/server.ts`, mount trong `server.ts` |
| **Validation** | `src/features/quy-doi-vat-lieu/validation.ts` |

- GET/POST `/api/quy-doi-vat-lieu`; PUT/DELETE `/api/quy-doi-vat-lieu/:id`.
- Cột nghiệp vụ: `ngay`, `ca`, `ma_may`, `vat_tu_goc`, `so_luong_goc`, `vat_tu_quy_doi`, `so_luong_quy_doi`; kèm UUID và timestamp.
- Ngày · Ca · Máy bắt buộc khi lưu — dùng để khớp quy đổi theo bộ lọc hub (Từ ngày / Đến ngày / Ca / Máy).
- GET lọc: `tu_ngay`/`den_ngay` (hoặc `dateFrom`/`dateTo`), `ca`, `ma_may`, `search` (mã vật tư / ca / máy). Phân trang 50 dòng.
- Hai số lượng phải hữu hạn và > 0. Hai ô vật tư dùng `FilterCombobox`, danh mục từ `/api/kho-nvl?light=1`, gõ tìm mã/tên/ĐVT; lưu mã NVL, hiển thị mã · tên · ĐVT. Gộp mã trùng giữa các kho bằng `materials.ts`; vật tư cũ không còn trong danh mục phải chọn lại trước khi lưu UI.
- Form thêm mới điền sẵn Ngày · Ca · Máy từ bộ lọc hub khi có.
- UI dùng quyền thêm/sửa/xóa `report-lists`, cùng cơ chế phân quyền hiện có; API theo mô hình API hiện tại của repo.
- Không ghi xuất/nhập, không cập nhật tồn kho. Không tự tạo bảng qua PostgREST; cần chạy SQL trên DB chính.
