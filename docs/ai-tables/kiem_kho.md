# kiem_kho

| | |
|---|---|
| **Bảng** | `kiem_kho` |
| **Tab** | `kiem-kho` → `/kiem-kho` |
| **DB** | Riêng — label `kiem-kho` (project `grlcgkzotqishzxwpddc`), cấu hình qua `SUPABASE_KIEM_KHO_*` |
| **SQL** | `supabase-kiem-kho.sql` |

## Cột

| Cột | Kiểu | Ghi chú |
|-----|------|--------|
| `id` | `bigint` identity PK | |
| `ten_kho` | `text` | |
| `dot_kiem_kho` | `text` | Đợt kiểm kho — phân biệt các lần kiểm |
| `ma_nvl` | `text` | Auto = tiền tố trước `_` của mã quét |
| `ma_sp` | `text` | Nguyên mã vừa quét (tiền tố + hậu tố) |
| `ten_sp` | `text` | autofill từ `san_pham` theo `ma_nvl` |
| `loai_sp` | `text` | autofill `nhom_vthh` |
| `ngay_gio_kiem_kho` | `timestamptz` | |
| `nguoi_kiem_kho` | `text` | |
| `thoi_gian_xac_nhan` | `timestamptz` | Thời điểm xác nhận kiểm kê — set khi bấm "Xác nhận kiểm kho" ở tab "Danh sách chi tiết" (`POST /api/kiem-kho/dot-xac-nhan`). Đợt "chưa chốt" = còn ≥1 dòng `thoi_gian_xac_nhan is null`. |
| `created_at` | `timestamptz` | |

`dot_kiem_kho` là khóa đợt ổn định: nếu tạo đợt mới thì FE gán = ISO timestamp lúc bấm "Lưu phiếu" đầu tiên; nếu chọn tiếp đợt chưa chốt đang có thì tái sử dụng đúng giá trị đó. Nhãn hiển thị `T{tháng}/{năm 2 số} (dd/mm-dd/mm|...)` được tính lại ở FE từ `MIN(ngay_gio_kiem_kho)` (ngày bắt đầu) và `thoi_gian_xac_nhan` (dấu `...` nếu chưa xác nhận) — không lưu label sẵn trong DB.

## Bảng liên quan: `kiem_kho_tong_hop`

Kết quả *chốt kiểm* của một đợt — gộp các dòng `kiem_kho` cùng `ma_nvl` (bỏ hậu tố) thành 1 dòng + tổng số lượng. SQL: `supabase-kiem-kho-tong-hop.sql` (cùng DB `kiem-kho`). Cột: `dot_kiem_kho`, `ma_nvl`, `ten_sp`, `loai_sp`, `tong_so_luong`, `chot_luc`, `nguoi_chot`. Unique theo `(dot_kiem_kho, ma_nvl)`. Được ghi tự động bởi `POST /api/kiem-kho/dot-xac-nhan` (nút "Xác nhận kiểm kho" ở tab "Danh sách chi tiết").

## Quy tắc đợt kiểm kho

- 1 tháng có thể có nhiều đợt — đợt không gắn với tháng, chỉ là khoảng thời gian từ lúc "Lưu phiếu" đầu tiên tới lúc "Xác nhận kiểm kho".
- Tab "Thực hiện kiểm kho" **chặn tạo đợt mới** khi còn bất kỳ đợt nào chưa xác nhận (`GET /api/kiem-kho/dot-mo` trả về ≥1 bản ghi) — bắt buộc phải qua tab "Danh sách chi tiết" xác nhận hết các đợt cũ trước.
- Xác nhận (`POST /api/kiem-kho/dot-xac-nhan`) sẽ: (1) set `thoi_gian_xac_nhan` cho mọi dòng chi tiết của đợt, (2) gộp theo `ma_nvl` và upsert vào `kiem_kho_tong_hop`. Không thể xác nhận lại đợt đã xác nhận (409).

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/kiem-kho` | Query: `tenKho`, `dotKiemKho`, `maSp`, `from`, `to` |
| `POST /api/kiem-kho` | Body: `dot_kiem_kho`, `nguoi_kiem_kho` (tự động), `ngay_gio_kiem_kho` (tự động), `lines[]`; `ten_kho` không bắt buộc |
| `DELETE /api/kiem-kho/:id` | Xóa một dòng |
| `GET /api/kiem-kho/dot-mo` | Chỉ đợt **chưa chốt** — dùng cho combobox tab "Thực hiện kiểm kho": `{ dot_kiem_kho, ngay_bat_dau }[]` |
| `GET /api/kiem-kho/dot` | **Toàn bộ** đợt (đã chốt lẫn chưa) — dùng cho combobox tìm kiếm tab "Danh sách chi tiết": `{ dot_kiem_kho, ngay_bat_dau, thoi_gian_xac_nhan, da_xac_nhan, so_dong }[]`, sắp xếp mới nhất trước |
| `POST /api/kiem-kho/dot-xac-nhan` | Body: `dot_kiem_kho`, `nguoi_xac_nhan`. Chốt đợt — xem "Quy tắc đợt kiểm kho" |
| `GET /api/kiem-kho-tong-hop` | Query: `dotKiemKho`. Đọc bảng tổng hợp |
| `POST /api/kiem-kho-tong-hop` | Body: `dot_kiem_kho`, `nguoi_chot`, `chot_luc` (tự động), `lines[]` (`ma_nvl`, `ten_sp`, `loai_sp`, `tong_so_luong`) — upsert theo `(dot_kiem_kho, ma_nvl)`. Dùng nội bộ bởi `dot-xac-nhan`, cũng gọi được trực tiếp |
| `DELETE /api/kiem-kho-tong-hop/:id` | Xóa một dòng tổng hợp |

Cả 3 route `dot-mo`, `dot`, `dot-xac-nhan` dùng chung helper `computeKiemKhoDotGroups()` (gộp theo `dot_kiem_kho` ở Node vì Supabase-js không hỗ trợ group-by).

### Quy tắc chống trùng khi lưu

`POST /api/kiem-kho` chuẩn hóa và bỏ qua `ma_sp` trùng trong payload hoặc đã có trong cùng `dot_kiem_kho`. Response trả `saved_count` và `skipped_count`; frontend dùng hai số này để thông báo chính xác, không lấy tổng số dòng trên form.

### Tên đợt trong cùng ngày

`GET /api/kiem-kho/dot` và `GET /api/kiem-kho/dot-mo` trả thêm `thu_tu_trong_ngay`, `tong_dot_trong_ngay`. Nếu có nhiều đợt bắt đầu trong cùng một ngày (múi giờ Việt Nam), nhãn hiển thị thêm `- 1`, `- 2`, `- 3`... theo thứ tự bắt đầu; ngày chỉ có một đợt thì giữ nguyên nhãn cũ.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kiem-kho/index.tsx` | 3 tab: **Thực hiện kiểm kho** (đợt lấy động từ `GET /api/kiem-kho/dot-mo`; còn đợt chưa xác nhận thì ẩn lựa chọn "Tạo đợt mới", bắt tiếp tục đợt đó; `ma_nvl` auto từ tiền tố; trùng mã = trùng cả tiền tố+hậu tố, chỉ chống trùng trong phiên đang nhập); **Danh sách chi tiết** (combobox tìm kiếm `SearchableSelect` liệt kê mọi đợt từ `GET /api/kiem-kho/dot`, mặc định chọn đợt gần nhất; bảng hiển thị toàn bộ sản phẩm đã quét của đợt; nút "Xác nhận kiểm kho" chỉ hiện khi đợt chưa xác nhận); **Bảng tổng hợp** (đọc `GET /api/kiem-kho-tong-hop`, tức chỉ các đợt **đã xác nhận**; bộ lọc `MultiSelectFilter` theo Đợt + Loại SP + ô tìm kiếm mã/tên; nhãn "Đợt" hiển thị dùng chung `formatDotLabel` với dữ liệu đợt lấy từ `GET /api/kiem-kho/dot`). |
| `src/components/shared/SearchableSelect.tsx` | Combobox có ô tìm kiếm — dùng cho dropdown chọn đợt ở tab "Danh sách chi tiết" |
| `src/components/ProductQrScanner.tsx` | INPUT_CONNECTION + KEY_EVENT |

## Thêm cột trên DB đã có

Chạy lại `supabase-kiem-kho.sql` (có `add column if not exists dot_kiem_kho`, `thoi_gian_xac_nhan`, và `drop column if exists da_dong_bo/dong_bo_luc`) và `supabase-kiem-kho-tong-hop.sql` (bảng mới) trên:
https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new

> Tính năng "Đồng bộ" cột `da_dong_bo`/`dong_bo_luc` (cộng số liệu kiểm kho vào `san_pham.ton_dau_ky`) đã bị **gỡ bỏ hoàn toàn** — không còn route `POST /api/kiem-kho/dong-bo-ton-dau`, không còn nút "Đồng bộ" ở trang Sản phẩm, không còn RPC/bảng so cái trên DB chính. Xem `supabase-san-pham-kiem-kho-dong-bo.sql` để dọn phần còn sót trên DB cũ.
