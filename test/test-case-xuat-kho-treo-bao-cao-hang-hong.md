# Test case: Xuất kho treo từ Báo cáo hàng hỏng

**Ngày tạo:** 14/08/2026  
**Trang kiểm thử:** `http://127.0.0.1:3001/phieu-xuat-nhap-kho`  
**Phạm vi:** Báo cáo hàng hỏng chờ xuất kho → điền phiếu → lưu thành phiếu xuất chính thức → cập nhật tồn kho, lịch sử và in ngang A4.

## 1. Luồng đúng cần kiểm tra

1. **Xuất kho treo** chỉ là form chờ lấy dữ liệu từ **Báo cáo hàng hỏng chờ xuất kho**.
2. Bấm **Kiểm tra** sẽ điền dữ liệu báo cáo xuống form.
3. Trước khi bấm Lưu, chưa có phiếu xuất và tồn kho chưa thay đổi.
4. Bấm **Lưu phiếu xuất kho treo** sẽ tạo ngay phiếu **Xuất kho chính thức**.
5. Phiếu vừa lưu xuất hiện trong **Lịch sử xuất nhập kho**, tồn kho được cập nhật và mẫu in tự mở.
6. Không có danh sách **Phiếu xuất kho treo chờ xác nhận** và không có bước **Xác nhận** riêng.

## 2. Chuẩn bị trước khi test

### Bước 1 — Khởi động lại server

Do API và logic lưu nằm trong `server.ts`, phải khởi động lại server trước khi test:

1. Dừng cửa sổ terminal đang chạy server cũ bằng `Ctrl + C`.
2. Tại thư mục dự án, chạy:

   ```powershell
   npm run dev
   ```

3. Chờ terminal hiện:

   ```text
   Server running on http://127.0.0.1:3001
   ```

4. Mở lại `http://127.0.0.1:3001/phieu-xuat-nhap-kho`.
5. Nhấn `Ctrl + Shift + R` để tải lại hoàn toàn.

### Bước 2 — Chuẩn bị tài khoản

- Dùng tài khoản Quản trị viên hoặc tài khoản có quyền **Thêm/Sửa/Xóa Phiếu xuất nhập kho - Vật tư**.
- Không ghi mật khẩu vào tài liệu test.

### Bước 3 — Chuẩn bị dữ liệu test

Dùng một báo cáo hàng hỏng riêng cho test, có thể nhận biết bằng ghi chú:

| Trường | Giá trị đề xuất |
|---|---|
| Ngày | Ngày hiện tại |
| Máy | Chọn một máy đang có |
| Ca | Chọn một ca đang có |
| Loại hàng hỏng | Nhựa không màng |
| Số lượng | `0,5 kg` |
| Ghi chú | `TEST-XKT-YYYYMMDD-01` |

Nếu danh sách đã có một báo cáo test phù hợp thì có thể dùng báo cáo đó, không cần tạo mới.

### Bước 4 — Ghi nhận tồn kho ban đầu

1. Vào màn hình tồn kho NVL hoặc màn hình đang hiển thị tồn của mã vật tư tương ứng.
2. Tìm mã `HH-NHUA-KHONG-MANG` hoặc mã được sinh từ loại hàng hỏng đã chọn.
3. Ghi lại số tồn trước khi lưu vào ô dưới đây:

| Mã vật tư | Tồn trước test | Số lượng xuất test | Tồn dự kiến sau test |
|---|---:|---:|---:|
| | | `0,5` | Tồn trước − `0,5` |

## 3. Test case chi tiết

### TC-XKT-01 — Trang không còn lỗi API và không có khối chờ xác nhận

1. Mở `/phieu-xuat-nhap-kho`.
2. Chọn tab **Xuất kho treo**.
3. Quan sát phần trên của trang.

Kết quả mong đợi:

- Có khối **Báo cáo hàng hỏng chờ xuất kho**.
- Không có khối **Phiếu xuất kho treo chờ xác nhận**.
- Không có thông báo đỏ `API route không tồn tại`.
- Không có nút **Xác nhận** phiếu treo.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-02 — Bấm Kiểm tra điền đúng dữ liệu xuống form

1. Trong **Báo cáo hàng hỏng chờ xuất kho**, tìm báo cáo `TEST-XKT-YYYYMMDD-01`.
2. Ghi lại số báo cáo hiển thị trên card.
3. Bấm **Kiểm tra**.
4. Cuộn xuống form phiếu.
5. Đối chiếu từng trường.

Kết quả mong đợi:

- Loại phiếu vẫn là **Xuất kho treo**.
- Tên kho là **Kho hàng hỏng**.
- Ngày, Ca và Máy đúng với báo cáo.
- Lý do có số báo cáo hàng hỏng vừa chọn.
- Dòng vật tư có đúng mã, tên, đơn vị và số lượng `0,5 kg`.
- **SL CT** và **SL THỰC** được điền đúng theo báo cáo.
- Hiện thông báo hướng dẫn bấm **Lưu phiếu xuất kho treo để tạo phiếu xuất chính thức**.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-03 — Chưa bấm Lưu thì chưa phát sinh phiếu và chưa đổi tồn

1. Sau TC-XKT-02, chưa bấm nút Lưu.
2. Mở **Lịch sử xuất nhập kho** ở một tab trình duyệt khác.
3. Tìm theo số báo cáo hoặc ghi chú `TEST-XKT-YYYYMMDD-01`.
4. Kiểm tra lại tồn kho đã ghi ở phần chuẩn bị.

Kết quả mong đợi:

- Chưa có phiếu xuất mới trong lịch sử.
- Tồn kho chưa thay đổi.
- Báo cáo vẫn còn trong **Báo cáo hàng hỏng chờ xuất kho** nếu tải lại trang trước khi lưu.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-04 — Lưu phiếu treo tạo ngay phiếu xuất chính thức

1. Quay lại form đã được điền ở TC-XKT-02.
2. Kiểm tra lần cuối Tên kho, Ngày, Ca, Máy và số lượng.
3. Bấm **Lưu phiếu xuất kho treo** đúng một lần.
4. Chờ thông báo lưu thành công.
5. Ghi lại mã phiếu `PX-...` được hệ thống tạo.

Kết quả mong đợi:

- Lưu thành công ngay, không yêu cầu bước Xác nhận thứ hai.
- Thông báo có nội dung tương tự: `Đã lưu phiếu xuất PX-... từ báo cáo hàng hỏng và cập nhật tồn kho.`
- Không xuất hiện card phiếu chờ xác nhận.
- Mẫu in phiếu xuất tự động mở.
- Dù người dùng bấm **Hủy** trong hộp thoại in, phiếu vẫn đã được lưu.

Mã phiếu thực tế: `____________________________`

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-05 — Phiếu xuất xuất hiện đúng trong Lịch sử

1. Đóng hoặc hủy hộp thoại in.
2. Vào **Kho → Lịch sử xuất nhập kho**.
3. Chọn tab **Kho hàng hỏng**.
4. Tìm theo mã phiếu `PX-...` ghi ở TC-XKT-04.
5. Mở chi tiết phiếu.

Kết quả mong đợi:

- Có đúng một phiếu **Xuất kho** với mã vừa lưu.
- Không hiển thị trạng thái chờ xác nhận.
- Ngày, Kho, Ca, Máy, Người lập, Lý do và Ghi chú đúng.
- Có đúng số dòng vật tư từ báo cáo.
- Số lượng thực xuất đúng `0,5 kg`.
- Mã báo cáo/nguồn báo cáo được giữ trong lý do hoặc dữ liệu liên kết.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-06 — Báo cáo biến mất khỏi danh sách chờ và không lưu trùng

1. Quay lại `/phieu-xuat-nhap-kho`.
2. Chọn **Xuất kho treo**.
3. Bấm **Tải lại** tại khối Báo cáo hàng hỏng chờ xuất kho.
4. Tìm lại số báo cáo đã dùng ở TC-XKT-02.
5. Nhấn `Ctrl + Shift + R` và tìm lại lần nữa.

Kết quả mong đợi:

- Báo cáo đã lưu không còn trong danh sách chờ.
- Không thể bấm Kiểm tra/lưu lần thứ hai cho cùng báo cáo.
- Trong lịch sử chỉ có một phiếu xuất tương ứng.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-07 — Tồn kho giảm đúng theo số lượng xuất

1. Mở lại màn hình tồn kho đã dùng ở phần chuẩn bị.
2. Tải lại dữ liệu.
3. Tìm đúng mã vật tư của báo cáo.
4. So sánh tồn trước và tồn sau.

Kết quả mong đợi:

- Tồn sau = Tồn trước − số lượng thực xuất.
- Với dữ liệu đề xuất: tồn giảm đúng `0,5 kg`.
- Không bị trừ hai lần sau khi tải lại trang.

| Tồn trước | Số lượng xuất | Tồn sau thực tế | Đạt/Không đạt |
|---:|---:|---:|---|
| | `0,5` | | |

### TC-XKT-08 — Phiếu in trải đầy khổ A4 ngang

1. Tại Lịch sử xuất nhập kho, mở phiếu test.
2. Bấm **In phiếu**.
3. Trong cửa sổ in Chrome, chọn **Lưu dưới dạng PDF**.
4. Đặt **Số trang mỗi trang in ra = 1**.
5. Quan sát bản xem trước.

Kết quả mong đợi:

- Trang giấy là **A4 ngang (landscape)**.
- Nội dung và bảng trải gần hết chiều ngang trang.
- Lề xung quanh nhỏ, khoảng `5 mm`; không còn co cụm ở nửa trái trang.
- Không mất cột, không tràn chữ ra ngoài giấy.
- Các cột số lượng và tổng kg dễ đọc.
- Phần chữ ký nằm cân đối theo chiều ngang.
- Phiếu một dòng vẫn nằm gọn trên một trang.

Gợi ý: có thể bỏ chọn **Đầu trang và chân trang** trong tùy chọn Chrome để PDF sạch hơn; thao tác này không ảnh hưởng bố cục phiếu.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-09 — Hủy in không làm mất phiếu đã lưu

1. Khi hộp thoại in đang mở, bấm **Hủy**.
2. Vào lại Lịch sử xuất nhập kho.
3. Tìm mã phiếu test.

Kết quả mong đợi:

- Phiếu vẫn tồn tại trong lịch sử.
- Tồn kho vẫn đã giảm đúng.
- Báo cáo không quay lại danh sách chờ.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-10 — Sửa phiếu chính thức tại Lịch sử

1. Trong Lịch sử xuất nhập kho, mở menu thao tác của phiếu test.
2. Bấm **Sửa**.
3. Đổi Ghi chú thành `TEST-XKT-YYYYMMDD-01-UPDATED`.
4. Không thay đổi số lượng.
5. Bấm cập nhật phiếu.
6. Quay lại lịch sử và mở chi tiết.

Kết quả mong đợi:

- Cập nhật thành công.
- Ghi chú mới được lưu.
- Phiếu vẫn là phiếu Xuất kho chính thức.
- Không sinh thêm phiếu trùng.
- Tồn kho không bị trừ thêm vì số lượng không đổi.

Đánh giá: [ ] Đạt  [ ] Không đạt

### TC-XKT-11 — Không có lỗi Console hoặc Network

1. Nhấn `F12` mở DevTools.
2. Chọn tab **Console** và **Network**.
3. Thực hiện lại các thao tác: mở tab Xuất kho treo, tải báo cáo, mở lịch sử và in phiếu.

Kết quả mong đợi:

- Không có lỗi đỏ liên quan đến `phieu-xuat-nhap-kho`.
- Không còn request danh sách `?treo=true&loai=xuat` từ giao diện.
- Không có lỗi `API route không tồn tại`.
- Request lưu phiếu trả mã HTTP `200` hoặc `201`.

Đánh giá: [ ] Đạt  [ ] Không đạt

## 4. Test phân quyền nhanh

### TC-XKT-12 — Tài khoản không có quyền Thêm

1. Đăng nhập tài khoản chỉ có quyền Xem phiếu kho vật tư.
2. Vào tab **Xuất kho treo**.
3. Chọn một báo cáo và bấm **Kiểm tra** nếu nút được phép hiển thị.

Kết quả mong đợi:

- Tài khoản không có quyền Thêm không thể lưu phiếu xuất.
- Không tạo dữ liệu kho ngoài quyền được cấp.

Đánh giá: [ ] Đạt  [ ] Không đạt

## 5. Dọn dữ liệu test

Thực hiện sau khi hoàn tất toàn bộ test:

1. Vào **Lịch sử xuất nhập kho → Kho hàng hỏng**.
2. Tìm phiếu theo mã `PX-...` đã ghi ở TC-XKT-04 hoặc ghi chú `TEST-XKT-`.
3. Bấm **Xóa** phiếu và xác nhận.
4. Tải lại tồn kho, kiểm tra số tồn đã quay về giá trị trước test.
5. Vào màn hình Báo cáo hàng hỏng và xóa báo cáo `TEST-XKT-YYYYMMDD-01` nếu báo cáo vẫn còn.
6. Tìm lại `TEST-XKT-` trong lịch sử để chắc chắn không còn phiếu test.

Lưu ý: xóa **phiếu xuất test trước**, sau đó mới xóa báo cáo hàng hỏng nguồn.

## 6. Bảng ghi nhận kết quả

| Mã test | Đạt / Không đạt | Người test | Thời gian | Mã phiếu / Ghi chú / Ảnh chụp |
|---|---|---|---|---|
| TC-XKT-01 | | | | |
| TC-XKT-02 | | | | |
| TC-XKT-03 | | | | |
| TC-XKT-04 | | | | |
| TC-XKT-05 | | | | |
| TC-XKT-06 | | | | |
| TC-XKT-07 | | | | |
| TC-XKT-08 | | | | |
| TC-XKT-09 | | | | |
| TC-XKT-10 | | | | |
| TC-XKT-11 | | | | |
| TC-XKT-12 | | | | |

## 7. Tiêu chí nghiệm thu

- TC-XKT-01 đến TC-XKT-09 bắt buộc đạt.
- Phiếu được lưu trực tiếp thành phiếu xuất chính thức, không có bước xác nhận riêng.
- Báo cáo không lưu trùng và tồn kho chỉ bị trừ một lần.
- Hủy in không ảnh hưởng dữ liệu đã lưu.
- Phiếu in A4 ngang, trải gần hết chiều rộng và có lề nhỏ.
- Không có lỗi đỏ trên giao diện, Console hoặc Network.
