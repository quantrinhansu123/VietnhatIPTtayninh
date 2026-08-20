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
| `ten_kho` | `text` | Bắt buộc — mỗi đợt (`dot_kiem_kho`) luôn thuộc đúng 1 kho, FE bắt chọn kho trước khi lưu dòng đầu tiên. |
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

## RPC gộp/chốt theo mã NVL (`supabase-kiem-kho-tong-hop-rpc.sql`)

Việc `GROUP BY ma_nvl` chạy hẳn trong Postgres (không kéo dòng thô về Node rồi gộp bằng JS) để chịu tải tốt khi dữ liệu lớn dần — chi phí truy vấn chỉ tỉ lệ với số dòng của **1 đợt** (nhờ index `kiem_kho_dot_kiem_kho_idx`), không tỉ lệ với tổng dữ liệu lịch sử.

- `kiem_kho_gop_theo_ma_nvl(p_dot text)` — trả `(ma_nvl, ten_sp, loai_sp, tong_so_luong)` đã gộp cho 1 đợt, chỉ đọc, không ghi DB. Dùng để tổng hợp "live" cho đợt **chưa chốt**, và làm nguồn dữ liệu bên trong `kiem_kho_chot_dot`.
- `kiem_kho_chot_dot(p_dot text, p_nguoi text)` — set `thoi_gian_xac_nhan` cho mọi dòng chi tiết + gộp + upsert `kiem_kho_tong_hop`, tất cả trong 1 transaction/1 round-trip DB. Raise `DOT_NOT_FOUND` nếu đợt không tồn tại, `ALREADY_CONFIRMED` nếu đã chốt trước đó (server.ts map thành 404/409).

## Quy tắc đợt kiểm kho

- Mỗi đợt (`dot_kiem_kho`) luôn thuộc **đúng 1 kho** — mọi dòng chi tiết của đợt cùng `ten_kho`. FE bắt chọn kho trước, mọi API liệt kê/lọc đợt đều nhận `tenKho` để chỉ trả đợt của kho đang chọn.
- 1 tháng có thể có nhiều đợt — đợt không gắn với tháng, chỉ là khoảng thời gian từ lúc "Lưu phiếu" đầu tiên tới lúc "Xác nhận kiểm kho".
- Tab "Thực hiện kiểm kho" **chặn tạo đợt mới của cùng 1 kho** khi kho đó còn bất kỳ đợt nào chưa xác nhận (`GET /api/kiem-kho/dot-mo?tenKho=...` trả về ≥1 bản ghi) — bắt buộc phải qua tab "Danh sách chi tiết" xác nhận hết các đợt cũ của kho đó trước. Kho khác không bị ảnh hưởng.
- Xác nhận (`POST /api/kiem-kho/dot-xac-nhan`) gọi RPC `kiem_kho_chot_dot` — xem mục trên. Không thể xác nhận lại đợt đã xác nhận (409).

## API (`server.ts`)

| Path | Ghi chú |
|------|---------|
| `GET /api/kiem-kho` | Query: `tenKho`, `dotKiemKho`, `maSp`, `from`, `to` |
| `POST /api/kiem-kho` | Body: `ten_kho` (bắt buộc), `dot_kiem_kho`, `nguoi_kiem_kho` (tự động), `ngay_gio_kiem_kho` (tự động), `lines[]` |
| `DELETE /api/kiem-kho/:id` | Xóa một dòng, chỉ khi đợt kiểm kho chưa chốt (`thoi_gian_xac_nhan is null`) |
| `GET /api/kiem-kho/dot-mo` | Query: `tenKho` (lọc theo kho, FE luôn truyền). Chỉ đợt **chưa chốt** — dùng cho combobox tab "Thực hiện kiểm kho": `{ dot_kiem_kho, ten_kho, ngay_bat_dau }[]` |
| `GET /api/kiem-kho/dot` | Query: `tenKho` (lọc theo kho, FE luôn truyền). **Toàn bộ** đợt (đã chốt lẫn chưa) của kho đó — dùng cho combobox tìm kiếm tab "Danh sách chi tiết" và tab "Bảng tổng hợp": `{ dot_kiem_kho, ten_kho, ngay_bat_dau, thoi_gian_xac_nhan, da_xac_nhan, so_dong }[]`, sắp xếp mới nhất trước |
| `POST /api/kiem-kho/dot-xac-nhan` | Body: `dot_kiem_kho`, `nguoi_xac_nhan`. Chốt đợt — gọi RPC `kiem_kho_chot_dot` |
| `GET /api/kiem-kho/dot-tong-hop-live` | Query: `dotKiemKho` (bắt buộc). Tổng hợp "live" theo mã NVL cho đợt **chưa chốt** — gọi RPC `kiem_kho_gop_theo_ma_nvl`, không ghi DB. Response `{ records: [{ ma_nvl, ten_sp, loai_sp, tong_so_luong, dot_kiem_kho, da_chot: false }] }` |
| `GET /api/kiem-kho-tong-hop` | Query: `dotKiemKho`. Đọc bảng tổng hợp (chỉ có dữ liệu của đợt **đã chốt**) |
| `POST /api/kiem-kho-tong-hop` | Body: `dot_kiem_kho`, `nguoi_chot`, `chot_luc` (tự động), `lines[]` (`ma_nvl`, `ten_sp`, `loai_sp`, `tong_so_luong`) — upsert theo `(dot_kiem_kho, ma_nvl)`. Gọi trực tiếp nếu cần, không còn dùng nội bộ bởi `dot-xac-nhan` (route đó nay gọi RPC thẳng) |
| `DELETE /api/kiem-kho-tong-hop/:id` | Xóa một dòng tổng hợp |

Route `dot-mo` và `dot` dùng chung helper `computeKiemKhoDotGroups()` (gộp theo `dot_kiem_kho` ở Node vì Supabase-js không hỗ trợ group-by — số dòng đọc bị giới hạn `limit`, xem mục "Rủi ro/scale" trong `docs/de-xuat-tong-hop-hien-thi-dot-chua-chot.md` nếu cần tối ưu tiếp). Route `dot-xac-nhan` và `dot-tong-hop-live` không còn gộp bằng JS — gộp thẳng trong Postgres qua RPC (xem mục trên).

### Quy tắc chống trùng khi lưu

`POST /api/kiem-kho` chuẩn hóa và bỏ qua `ma_sp` trùng trong payload hoặc đã có trong cùng `dot_kiem_kho`. Response trả `saved_count` và `skipped_count`; frontend dùng hai số này để thông báo chính xác, không lấy tổng số dòng trên form.

### Tên đợt trong cùng ngày

`GET /api/kiem-kho/dot` và `GET /api/kiem-kho/dot-mo` trả thêm `thu_tu_trong_ngay`, `tong_dot_trong_ngay`. Nếu có nhiều đợt bắt đầu trong cùng một ngày (múi giờ Việt Nam), nhãn hiển thị thêm `- 1`, `- 2`, `- 3`... theo thứ tự bắt đầu; ngày chỉ có một đợt thì giữ nguyên nhãn cũ.

Cả ba tab **Thực hiện kiểm kho**, **Danh sách chi tiết** và **Bảng tổng hợp** đều dùng `SearchableSelect` với `comboboxMode`. Riêng tab **Thực hiện kiểm kho** đặt `comboboxSearchable={false}` để menu chỉ hiện danh sách lựa chọn; hai tab còn lại vẫn có ô tìm kiếm.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/kiem-kho/index.tsx` | Cả 3 tab đều bắt **chọn kho trước** (combobox `SearchableSelect` nạp từ `GET /api/quan-ly-kho`, cùng state `selectedKho` dùng chung toàn trang) — chưa chọn kho thì ẩn phần đợt/danh sách sản phẩm, chỉ hiện gợi ý "Chọn kho ở trên...". **Thực hiện kiểm kho** (đợt lấy động từ `GET /api/kiem-kho/dot-mo?tenKho=...`; còn đợt chưa xác nhận của kho đó thì ẩn lựa chọn "Tạo đợt mới", bắt tiếp tục đợt đó; nút **Thêm** không có hiệu ứng hover/bấm/focus và chèn ngay một dòng dữ liệu thật ở cuối danh sách; các hàng của bảng cũng tắt transition/hover để không nháy khi DOM thêm dòng; mã có gợi ý theo kho nhưng vẫn nhận mã ngoài danh mục, tên/ĐVT/số lượng/trọng lượng đều nhập sửa tự do, chỉ ô kho bị khóa theo kho của phiếu; STT tiếp nối từ 1, không đổi màu/hiện thông báo gây dịch chuyển màn hình; cột thao tác dùng nút thùng rác để xóa; `ma_nvl` auto từ tiền tố; trùng mã = trùng cả tiền tố+hậu tố, chỉ chống trùng trong phiên đang nhập; "Lưu phiếu" gửi kèm `ten_kho`); **Danh sách chi tiết** (combobox tìm kiếm `SearchableSelect` liệt kê đợt của kho đang chọn từ `GET /api/kiem-kho/dot?tenKho=...`, mặc định chọn đợt gần nhất; bảng hiển thị toàn bộ sản phẩm đã quét của đợt; nút "Xác nhận kiểm kho" chỉ hiện khi đợt chưa xác nhận); **Bảng tổng hợp** (combobox liệt kê **mọi đợt của kho đang chọn** — đã chốt lẫn chưa — từ `GET /api/kiem-kho/dot?tenKho=...`; chỉ tải tổng hợp của **đúng đợt đang chọn**, không tải cả lịch sử: đợt đã chốt gọi `GET /api/kiem-kho-tong-hop?dotKiemKho=...`, đợt chưa chốt gọi `GET /api/kiem-kho/dot-tong-hop-live?dotKiemKho=...`; cột "Chốt lúc"/"Người chốt" hiện badge "Chưa chốt" khi `da_chot === false`). Đổi kho sẽ bỏ chọn đợt/đợt tổng hợp đang xem của kho trước. |
| `src/features/kiem-kho/KiemKhoPrintSheet.tsx` | Phiếu tổng hợp kiểm kho A4 ngang: thông tin đợt, trạng thái/chốt và danh sách sản phẩm đã kiểm theo mã gốc. |
| `src/components/shared/SearchableSelect.tsx` | Combobox/tìm kiếm dùng chung; hỗ trợ `allowCustomValue` để ô mã kiểm kho vừa có menu gợi ý đồng bộ giao diện, vừa nhận mã ngoài danh mục. |
| `src/components/ProductQrScanner.tsx` | INPUT_CONNECTION + KEY_EVENT |

Modal quét máy/QR hiển thị **Tổng SL** màu đỏ ở góc phải dòng trạng thái đầu đọc, lấy từ số dòng mã đang có trên phiếu kiểm kho; đóng/mở lại modal vẫn giữ đúng tổng, mã trùng/lỗi không làm tăng.

## Thêm cột trên DB đã có

Chạy lại `supabase-kiem-kho.sql` (có `add column if not exists dot_kiem_kho`, `thoi_gian_xac_nhan`, và `drop column if exists da_dong_bo/dong_bo_luc`), `supabase-kiem-kho-tong-hop.sql` (bảng mới) và `supabase-kiem-kho-tong-hop-rpc.sql` (2 RPC function `kiem_kho_gop_theo_ma_nvl`, `kiem_kho_chot_dot`) trên:
https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new

> Tính năng "Đồng bộ" cột `da_dong_bo`/`dong_bo_luc` (cộng số liệu kiểm kho vào `san_pham.ton_dau_ky`) đã bị **gỡ bỏ hoàn toàn** — không còn route `POST /api/kiem-kho/dong-bo-ton-dau`, không còn nút "Đồng bộ" ở trang Sản phẩm, không còn RPC/bảng so cái trên DB chính. Xem `supabase-san-pham-kiem-kho-dong-bo.sql` để dọn phần còn sót trên DB cũ.
