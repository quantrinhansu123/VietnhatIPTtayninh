# Test case: Cảnh báo chênh lệch tồn đầu ca / tồn cuối ca (Báo cáo tồn máy)

## 1. Mục tiêu

Kiểm tra tính năng cảnh báo chênh lệch tại trang **Kho → Báo cáo tồn máy**
(`/danh-sach-bao-cao-may-nvl-ton`, tab **Báo cáo tồn đầu ca**):

- Khi số lượng NVL nhập ở "tồn đầu ca" không khớp với "tồn cuối ca" của ca
  liền trước (cùng máy), hệ thống phải hiện badge **⚠ Chênh lệch** ở dòng đó
  và liệt kê chi tiết từng mã NVL lệch trong modal xem chi tiết.
- Khi số liệu khớp, hoặc không có ca trước để so sánh, hoặc khác máy — **không**
  được hiện cảnh báo.
- Không được so sánh nhầm với phiếu tồn cuối ca được tạo **sau** phiếu tồn đầu
  ca đang xét (lỗi đã từng gặp và đã sửa — xem mục 6, TC07).

## 2. Điều kiện chuẩn bị

- Server dev đang chạy (`npx tsx server.ts`, cổng mặc định `3001`) hoặc dùng
  bản đang deploy.
- Đăng nhập tài khoản quản trị có sẵn trong code (dùng khi chưa có tài khoản
  nhân sự cấu hình riêng):
  - Tài khoản: `itvietnhattn2026@gmail.com`
  - Mật khẩu: `123456`
- **Tạo riêng một máy chỉ dùng để test**, tránh làm nhiễu số liệu của máy thật
  đang sản xuất:
  1. Vào **Danh mục → Danh sách máy** → **Thêm mới**.
  2. Mã máy: `TEST-CLCA`, Tên máy: `Máy Test Cảnh Báo Chênh Lệch`.
  3. Lưu lại.
- Toàn bộ mã NVL dùng trong test đều đặt tiền tố `TEST-CLCA-` để không trùng
  với mã NVL thật và dễ dàng xoá sạch sau khi test (ô nhập mã NVL trên form
  cho phép gõ tự do, không bắt buộc chọn từ danh mục Kho NVL).
- Ghi lại **ngày hiện tại của hệ thống** (test dùng ngày tương đối, ví dụ hôm
  nay = D). Nếu server/máy test đang set ngày hệ thống khác thực tế (ví dụ môi
  trường demo), cứ dùng đúng ngày hệ thống hiển thị trên form.

## 3. Dữ liệu test dùng chung

| Biến | Giá trị |
|---|---|
| Máy | `TEST-CLCA` — Máy Test Cảnh Báo Chênh Lệch |
| Mã NVL 1 | `TEST-CLCA-001` (ĐVT: kg) |
| Mã NVL 2 | `TEST-CLCA-002` (ĐVT: kg) |
| Ca 1 | Ca hiện có đầu tiên trong danh sách Ca (ví dụ `Ca 1`) |
| Ca 2 | Ca hiện có kế tiếp trong danh sách Ca (ví dụ `Ca 2`) |
| Ngày D | Ngày hiện tại |
| Ngày D+1 | Ngày hôm sau |

## 4. Các bước thực hiện chung

### 4.1. Tạo phiếu tồn cuối ca (mốc để so sánh)

1. Vào **Kho → Báo cáo NVL tồn theo máy** → tab **Báo cáo cuối ca**.
2. Ngày = D, Ca = Ca 1, Máy = `TEST-CLCA`.
3. Thêm 2 dòng NVL:
   - `TEST-CLCA-001`, Tồn máy = `100`, các ô khác để trống (Tổng tự tính = 100).
   - `TEST-CLCA-002`, Tồn máy = `50`.
4. Bấm **Lưu báo cáo** (hoặc **Lưu và in báo cáo**).

### 4.2. Tạo phiếu tồn đầu ca để so sánh

1. Chuyển tab **Báo cáo đầu ca**.
2. Ngày = D, Ca = Ca 2, Máy = `TEST-CLCA`.
3. Bấm **Tự điền tồn đầu ca** → lọc theo đúng Ngày D / Máy `TEST-CLCA` → chọn
   phiếu cuối ca vừa tạo ở bước 4.1 → **Điền vào form** (2 dòng NVL tự điền
   đúng 100 và 50).
4. Tùy theo test case, giữ nguyên số liệu hoặc sửa tay số lượng trước khi Lưu
   (xem bảng test case ở mục 5).
5. Lưu báo cáo.
6. Vào **Kho → Báo cáo tồn máy**, đặt khoảng ngày bao trùm ngày D (và D+1 nếu
   test case cần), tab **Báo cáo tồn đầu ca**, kiểm tra kết quả.

## 5. Danh sách test case

| ID | Mục tiêu | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Số liệu khớp hoàn toàn | Làm theo 4.1 + 4.2, **không sửa** số liệu tự điền | Không có badge "Chênh lệch" ở dòng đầu ca này; nhóm ngày D cũng không có pill "X chênh lệch" |
| TC02 | Một mã NVL bị sửa số lượng | Làm theo 4.1 + 4.2, sau khi tự điền thì sửa `TEST-CLCA-001` từ 100 → 80 | Dòng đầu ca có badge "Chênh lệch"; tooltip/khối cảnh báo trong modal hiện đúng: `TEST-CLCA-001: cuối ca trước 100 → đầu ca này 80`; `TEST-CLCA-002` không bị nêu (vì khớp) |
| TC03 | Thiếu hẳn 1 mã NVL | Làm theo 4.1 + 4.2, sau khi tự điền thì **xoá** dòng `TEST-CLCA-002` khỏi phiếu đầu ca trước khi lưu | Badge "Chênh lệch" xuất hiện; modal hiện `TEST-CLCA-002: cuối ca trước 50 → đầu ca này 0` |
| TC04 | Thêm mã NVL mới không có ở ca trước | Làm theo 4.1 + 4.2 (giữ nguyên số liệu), rồi tự thêm dòng NVL mới `TEST-CLCA-999` = 30 vào phiếu đầu ca | Badge "Chênh lệch" **không** xuất hiện — mã mới hoàn toàn không có gì để so sánh nên không bị coi là lệch |
| TC05 | Không có ca trước để so sánh | Tạo phiếu đầu ca mới cho máy `TEST-CLCA`, ngày D+1, Ca 1 — **không** dùng nút tự điền, tự nhập tay 1 dòng NVL bất kỳ | Không có badge "Chênh lệch" (vì không có phiếu cuối ca nào trước đó để đối chiếu) |
| TC06 | Khác máy không bị so nhầm | Tạo phiếu cuối ca cho **một máy thật khác** (ví dụ máy đang có sẵn) ngày D, số liệu tuỳ ý; sau đó vào phiếu đầu ca của `TEST-CLCA` (TC01) | Phiếu đầu ca của `TEST-CLCA` không đổi kết quả — vẫn theo đúng TC01, không bị ảnh hưởng bởi phiếu của máy khác |
| TC07 (hồi quy) | Không so sánh với phiếu tồn cuối ca **tạo sau** | 1) Tạo phiếu cuối ca ngày D+2 cho `TEST-CLCA` với số liệu bất kỳ, khác hẳn TC01 (ví dụ 999). 2) Mở lại phiếu đầu ca ngày D (TC01) đã lưu trước đó | Phiếu đầu ca ngày D **không được** so với phiếu cuối ca ngày D+2 (vì D+2 là tương lai so với ngày D) — kết quả badge của phiếu ngày D giữ nguyên như TC01/TC02, không đổi thành lệch với số 999 |
| TC08 | Xem chi tiết modal | Từ dòng có badge (TC02 hoặc TC03) → bấm **Xem** | Modal hiện khung cảnh báo màu vàng ở đầu, liệt kê đúng từng mã NVL lệch với "cuối ca trước" và "đầu ca này" |
| TC09 | Sai số làm tròn nhỏ không bị báo | Làm theo 4.1 + 4.2, sửa `TEST-CLCA-001` từ 100 → 100.005 (lệch 0.005, nhỏ hơn ngưỡng 0.01) | Không có badge "Chênh lệch" cho dòng này |
| TC10 | Pill tổng theo ngày | Sau khi có ít nhất 1 phiếu lệch (TC02) trong ngày D | Header nhóm ngày D hiện thêm pill vàng "1 chênh lệch" (hoặc đúng số phiếu lệch trong ngày) cạnh số phiếu |

> Ghi chú thực hiện TC02–TC04, TC09: mỗi test case nên tạo **phiếu đầu ca
> riêng** (Ca khác nhau hoặc xoá phiếu cũ trước khi tạo lại) để không ghi đè
> lẫn nhau, vì hệ thống chặn lưu trùng ngày + ca + máy.

## 6. Tiêu chí hoàn thành

- TC01, TC04, TC05, TC06 không hiện cảnh báo (đúng như kỳ vọng).
- TC02, TC03, TC10 hiện cảnh báo đúng mã NVL, đúng số liệu, đúng vị trí (badge
  dòng + pill nhóm ngày).
- TC07 xác nhận không bị lỗi so sánh với phiếu tương lai (lỗi hồi quy đã sửa).
- TC08 modal chi tiết hiển thị đầy đủ, đúng nội dung.
- TC09 xác nhận ngưỡng sai số 0.01 hoạt động đúng.
- Không có lỗi console khi thao tác (F12 → tab Console).

## 7. Dọn dẹp dữ liệu sau khi test

**Bắt buộc thực hiện** sau khi test xong để không để lại dữ liệu rác trong hệ
thống thật:

1. Vào **Kho → Báo cáo tồn máy**.
2. Ở ô lọc **Máy**, chọn `TEST-CLCA` (hoặc gõ tìm `TEST-CLCA` ở ô tìm kiếm) để
   chỉ hiển thị các phiếu vừa tạo cho máy test.
3. Lần lượt ở cả 2 tab **Báo cáo tồn đầu ca** và **Báo cáo tồn cuối ca**:
   - Đặt lại khoảng ngày đủ rộng để thấy hết phiếu đã tạo (kể cả ngày D+1, D+2
     nếu có làm TC05/TC07).
   - Tick chọn tất cả các dòng liên quan đến `TEST-CLCA` (checkbox ở đầu mỗi
     nhóm ngày hoặc từng dòng).
   - Bấm **Xoá đã chọn (N)** → xác nhận xoá.
4. Nếu ở TC06 có tạo thêm phiếu cuối ca cho một **máy thật khác** để test —
   xoá đúng phiếu đó (chỉ xoá phiếu vừa tạo cho mục đích test, không xoá dữ
   liệu thật khác của máy đó).
5. Vào lại **Danh mục → Danh sách máy**, tìm `TEST-CLCA` → xoá máy test này.
6. Xác nhận lại: lọc theo `TEST-CLCA` ở trang Báo cáo tồn máy không còn phiếu
   nào; máy `TEST-CLCA` không còn trong Danh sách máy.

Vì mã NVL test (`TEST-CLCA-001`, `TEST-CLCA-002`, `TEST-CLCA-999`) chỉ được
gõ tự do vào phiếu (không tạo trong danh mục **Kho NVL**), nên xoá xong các
phiếu ở bước 3–4 là đã sạch hoàn toàn, không cần dọn thêm ở danh mục vật tư.
