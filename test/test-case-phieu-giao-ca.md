# Test case: Phiếu giao ca (QT-16-BM02)

## 1. Mục tiêu

Kiểm tra **Nhật ký sản xuất kiêm phiếu giao ca** theo mẫu QT-16-BM02:

- Trang lập phiếu: `/phieu-giao-ca` (menu **Công nhân → Nhập báo cáo → Phiếu giao ca**).
- Trang danh sách: `/danh-sach-phieu-giao-ca` (menu **Xem báo cáo → Danh sách phiếu giao ca**).

Phạm vi: header ca/ngày/máy/người thực hiện, bảng thành phẩm (cột 6 tự tính), hàng lỗi, báo cáo cuối ca (chênh lệch tự tính), lưu, in A4 ngang, danh sách, lọc, xem chi tiết, xoá.

## 2. Điều kiện chuẩn bị

- **Bắt buộc chạy trước**: `supabase-phieu-giao-ca.sql` trên Supabase SQL editor để có bảng `phieu_giao_ca`. Nếu chưa chạy, trang báo "Bảng phieu_giao_ca chưa tồn tại..." và không lưu được.
- Server dev đang chạy (`npm run dev`, cổng mặc định `3001`) hoặc bản đang deploy.
- Đăng nhập tài khoản quản trị có sẵn.
- Máy và mã hàng lấy từ danh mục đang có. Ô Máy không bắt buộc; Người thực hiện bắt buộc (chọn nhân sự hoặc nhập tay).

## 3. Dữ liệu test dùng chung

| Biến | Giá trị |
|---|---|
| Ngày D | Ngày hiện tại |
| Ca | Ca hiện có đầu tiên (ví dụ `Ca ngày`) — giờ từ/đến tự điền nếu ca có khung giờ |
| Người thực hiện | `TEST-BGC Người thực hiện` (nhập tay) |
| Mã hàng 1 | Một mã thành phẩm có sẵn, hoặc `TEST-BGC-MH01` |
| Thành phẩm 1 | `TEST-BGC màng nhựa 1.50m` |
| SL cuộn (3) | `2` |
| ĐM nhựa (5) | `7.8` |
| Tổng TL ĐM (6) kỳ vọng | `15.6` |
| Lỗi đầu ca | `TEST-BGC: Kéo màng đầu ca` / `39.58` kg |
| SL ĐM chỉ tiêu 1 | `10` |
| Thực tế chỉ tiêu 1 | `9` |
| Chênh lệch kỳ vọng | `-1` |

## 4. Các bước tạo 1 phiếu cơ bản

1. Vào **Công nhân → Nhập báo cáo → Phiếu giao ca** (`/phieu-giao-ca`).
2. Điền Ngày = D, Ca sản xuất, Người thực hiện theo mục 3. Chọn máy nếu muốn.
3. Dòng thành phẩm 1: mã hàng + tên, SL cuộn = 2, ĐM nhựa = 7.8. Kiểm tra cột Tổng TL ĐM hiện `15,6`.
4. Bảng hàng lỗi: nhập "Lỗi đầu ca" và số kg theo mục 3.
5. Báo cáo cuối ca: dòng 1 điền SL ĐM = 10, Thực tế = 9 — cột Chênh lệch hiện `-1`.
6. Bấm **Lưu và in phiếu**.

## 5. Danh sách test case

| ID | Mục tiêu | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Tạo phiếu đầy đủ | Làm đúng mục 4 | Thông báo "Đã lưu phiếu BGC-..."; form reset; cửa sổ in mở (A4 ngang) với tiêu đề **NHẬT KÝ SẢN XUẤT KIÊM PHIẾU GIAO CA**, ký hiệu QT-16-BM02; phiếu xuất hiện ở **Lịch sử phiếu** |
| TC02 | Validate thiếu Ngày | Xoá Ngày, điền các ô khác, lưu | Lỗi đỏ, không lưu |
| TC03 | Validate thiếu Ca | Để trống Ca, lưu | Lỗi đỏ, không lưu |
| TC04 | Validate thiếu Người thực hiện | Để trống Người thực hiện, lưu | Lỗi đỏ, không lưu |
| TC05 | Tự tính cột (6)=(3)×(5) | SL cuộn = 2, ĐM nhựa = 7.8 | Cột Tổng TL ĐM hiện 15,6 ngay trên form và trên bản in |
| TC06 | Chọn mã hàng từ danh mục | Chọn 1 SP có sẵn | Tên thành phẩm và ĐM nhựa (nếu có tổng TL) tự điền, vẫn sửa được |
| TC07 | Tự tính chênh lệch KPI | SL ĐM = 10, Thực tế = 9 | Cột Chênh lệch = -1 (màu đỏ nếu âm) |
| TC08 | Thêm/xoá dòng thành phẩm | Bấm **Thêm mã hàng**, nhập dòng 2, xoá dòng 2 | Dòng thêm/xoá đúng; không xoá được khi chỉ còn 1 dòng |
| TC09 | Lưu không có thành phẩm | Xoá hết mã/số liệu các dòng TP, vẫn đủ Ngày/Ca/Người thực hiện, lưu | Lưu thành công; phiếu có 0 mã hàng |
| TC10 | Nội dung bản in | Sau TC01, đối chiếu cửa sổ in | Header: logo, QT-16-BM02 / lần 03 / 03/08/2022; ca từ–đến; ngày/tháng/năm; người thực hiện; số phiếu; máy. Bảng II thành phẩm đủ cột và dòng tổng. Bảng III hàng lỗi. Bảng III báo cáo cuối ca. 3 ô ký: Trưởng ca sản xuất, Thủ kho thành phẩm, Quản lý sản xuất |
| TC11 | Xoá từ lịch sử trên form | Icon thùng rác → xác nhận | Phiếu biến mất, thông báo "Đã xóa phiếu." |
| TC12 | Danh sách phiếu | Tạo lại 1-2 phiếu, vào `/danh-sach-phieu-giao-ca` | Nhóm theo ngày; cột Số phiếu, Ca, Máy, Người thực hiện, số mã hàng, SL cuộn, Tổng TL ĐM |
| TC13 | Lọc ca / tìm kiếm | Lọc đúng Ca; tìm `TEST-BGC` | Chỉ còn phiếu test |
| TC14 | Lọc khoảng ngày | Đặt khoảng ngày không gồm D | Thông báo chưa có phiếu; đặt lại khoảng gồm D thì hiện lại |
| TC15 | Modal chi tiết | Bấm **Xem** | Hiện người thực hiện, bảng thành phẩm, hàng lỗi, KPI |
| TC16 | In 1 phiếu / in danh sách | **In** hoặc **In danh sách** | Cửa sổ in đúng nội dung, nhiều phiếu thì nhiều trang |
| TC17 | Xoá từ danh sách | Thùng rác → xác nhận | Phiếu biến mất, tổng số cập nhật |
| TC18 | Nút Thêm mới | Từ danh sách bấm **Thêm mới** | Về `/phieu-giao-ca`, form trống |
| TC19 | Không lỗi console | TC01–TC18 | DevTools Console không có lỗi đỏ liên quan `phieu-giao-ca` / `ShiftHandover*` |

## 6. Tiêu chí hoàn thành

- TC01, TC05, TC07, TC09 lưu đúng và tính đúng.
- TC02–TC04 chặn thiếu Ngày / Ca / Người thực hiện.
- TC10, TC16 bản in A4 ngang đúng mẫu QT-16-BM02.
- TC12–TC15 danh sách/lọc/chi tiết đúng.
- TC19 không lỗi console.

## 7. Dọn dẹp

1. Vào `/danh-sach-phieu-giao-ca`.
2. Tìm `TEST-BGC`.
3. Xoá từng phiếu test.
4. Không xoá máy / mã hàng danh mục dùng chung.
