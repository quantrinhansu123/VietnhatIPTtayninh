# quy_doi_vat_lieu

| | |
|---|---|
| **DB** | DB chính hệ thống (`SUPABASE_URL`), bảng `quy_doi_vat_lieu` |
| **SQL** | `supabase-quy-doi-vat-lieu.sql` — RLS, chỉ service role; cột `ngay` · `ca` · `ma_may`. Bổ sung: `khoi-luong.sql`, `nhom.sql` (`nhom_id`), `nguon.sql` (`nguon_lay`/`nguon_toi`), **`cat-loi.sql`** (chiều dài · ĐM · TL/cái · ghi chú) |
| **Tab** | `/danh-sach-bao-cao` → **Quy đổi vật liệu** (`material-conversion`, tab nội bộ hub) |
| **UI** | `src/features/quy-doi-vat-lieu/index.tsx` |
| **API** | `src/features/quy-doi-vat-lieu/server.ts`, mount trong `server.ts` |
| **Validation** | `src/features/quy-doi-vat-lieu/validation.ts` |

- GET/POST `/api/quy-doi-vat-lieu`; PUT/DELETE `/api/quy-doi-vat-lieu/:id`; PUT/DELETE nhóm `/api/quy-doi-vat-lieu/nhom/:nhomId`.
- Cột nghiệp vụ: `ngay`, `ca`, `ma_may`, `vat_tu_goc`, `so_luong_goc`, `khoi_luong_goc`, `chieu_dai_goc`, `trong_luong_tren_cai_goc`, `ghi_chu_goc`, `nguon_lay`, `vat_tu_quy_doi`, `so_luong_quy_doi`, `khoi_luong_quy_doi`, `chieu_dai_quy_doi`, `dinh_muc`, `kich_thuoc_tong`, `trong_luong_tren_cai_quy_doi`, `ghi_chu_quy_doi`, `nguon_toi`, `nhom_id`.
- **1 nguồn → nhiều đích** (phiếu cắt lõi): form 2 bảng; đích có **ĐM** (SL/1 gốc), **KT tổng** (= dài × ĐM), chiều dài, TL/cái, ghi chú. SL đích tự = SL gốc × ĐM (vẫn sửa tay được). TL/cái đích: Kho NVL, không có thì tỷ lệ theo chiều dài.
- Khi **Lưu**: tổng TL = SL × TL/cái; snapshot chiều dài/ĐM/ghi chú vào DB.
- Ngày · Ca · Máy bắt buộc khi lưu — dùng để khớp quy đổi theo bộ lọc hub (Từ ngày / Đến ngày / Ca / Máy). Form hiện gợi ý đỏ nếu thiếu Ca/Máy; nút **Lưu** vẫn bấm được để báo lỗi rõ (không khóa im lặng).
- GET lọc: `tu_ngay`/`den_ngay` (hoặc `dateFrom`/`dateTo`), `ca`, `ma_may`, `nhom_id`, `search` (mã vật tư / ca / máy). Phân trang 50 dòng. `all=1` trả đủ bản ghi trong khoảng (tối đa 10 000) — dùng khi BB đổ Nhập TP 3.2.
- **BB mục 3.2:** phiếu cắt/quy đổi khớp **Ngày · Ca · Máy** → `khoi_luong_quy_doi` của **mã đích**. Routing: **Nguồn tới** (ưu tiên) hoặc **Nguồn lấy** nếu tới trống — `Tồn ngoài` → cộng «Tồn đầu ca»; `Lấy từ kho` / `Hiện` / `Đề xuất kho` → «Xuất kho». Bắt buộc chọn Nguồn tới khi lưu phiếu. Sau khi sửa phiếu phải **Tính toán** lại BB. Utils: `src/utils/bbMaterialConversion.ts`.
- Số lượng phải hữu hạn và > 0; mã đích trong một nhóm không trùng. Form: **Gốc** / **Đích**. **Nguồn tới:** Tồn ngoài · Lấy từ kho. **Nguồn lấy:** Hiện · Tồn ngoài · Đề xuất kho.
- Form thêm mới điền sẵn Ngày · Ca · Máy từ bộ lọc hub khi có.
- UI dùng quyền thêm/sửa/xóa `report-lists`, cùng cơ chế phân quyền hiện có; API theo mô hình API hiện tại của repo.
- Không ghi xuất/nhập, không cập nhật tồn kho. Không tự tạo bảng qua PostgREST; cần chạy SQL trên DB chính.
