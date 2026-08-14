# Test case: Phiếu giao ca

## 1. Mục tiêu

Kiểm tra tính năng **Phiếu giao ca** (bàn giao ca ngày/đêm) mới thêm vào:

- Trang lập phiếu: `/phieu-giao-ca` (menu **Công nhân → Nhập báo cáo → Phiếu
  giao ca**).
- Trang danh sách: `/danh-sach-phieu-giao-ca` (menu **Xem báo cáo → Danh sách
  phiếu giao ca**).

Phạm vi kiểm tra: tạo phiếu, validate bắt buộc, danh sách công việc/sự cố bàn
giao (thêm/xoá dòng, mức độ, trạng thái), in phiếu, xem danh sách, lọc/tìm
kiếm, xem chi tiết, đếm số việc chưa xử lý, xoá phiếu.

## 2. Điều kiện chuẩn bị

- **Bắt buộc chạy trước**: file `supabase-phieu-giao-ca.sql` (ở thư mục gốc
  repo) trên Supabase SQL editor để tạo bảng `phieu_giao_ca`. Nếu chưa chạy,
  trang sẽ báo lỗi đỏ "Bảng phieu_giao_ca chưa tồn tại..." và không lưu được
  phiếu (giao diện vẫn load bình thường, không crash).
- Server dev đang chạy (`npm run dev`, cổng mặc định `3001`) hoặc dùng bản
  đang deploy.
- Đăng nhập tài khoản quản trị có sẵn trong code:
  - Tài khoản: `itvietnhat2026@gmail.com`
  - Mật khẩu: `123456`
- Không bắt buộc tạo máy test riêng vì ô **Máy / Chuyền** trên phiếu giao ca
  là **tuỳ chọn** (có thể để trống — dùng cho bàn giao chung cả chuyền, không
  gắn với 1 máy cụ thể). Nếu muốn test kèm máy, có thể chọn bất kỳ máy có sẵn
  trong **Danh mục → Danh sách máy** mà không cần tạo mới.
- Người giao ca lấy từ danh sách nhân sự phòng **Sản xuất** có sẵn trong hệ
  thống (ô "Người giao ca" là select). Người nhận ca là ô nhập tự do (text),
  nên dùng tên rõ ràng có thể nhận diện là dữ liệu test, ví dụ
  `TEST-BGC Người nhận`.

## 3. Dữ liệu test dùng chung

| Biến | Giá trị |
|---|---|
| Ngày D | Ngày hiện tại |
| Ca giao | Ca hiện có đầu tiên trong danh sách Ca (ví dụ `Ca ngày`) |
| Ca nhận | Ca hiện có kế tiếp trong danh sách Ca (ví dụ `Ca đêm`) |
| Người giao ca | Chọn bất kỳ nhân sự có sẵn trong select "Người giao ca" |
| Người nhận ca | `TEST-BGC Người nhận` (nhập tay) |
| Sản lượng đạt được | `1.200 kg / 800 cuộn` |
| Tình trạng máy móc | `Bình thường, không có sự cố` |
| Tồn kho cuối ca | `NVL còn 50kg, thành phẩm 20 cuộn` |
| Nội dung bàn giao 1 | `TEST-BGC: Kiểm tra lại cuộn số 5 bị lệch mép` |
| Nội dung bàn giao 2 | `TEST-BGC: Bổ sung NVL cho ca sau` |

## 4. Các bước thực hiện chung (tạo 1 phiếu cơ bản)

1. Vào **Công nhân → Nhập báo cáo → Phiếu giao ca** (hoặc mở thẳng
   `/phieu-giao-ca`).
2. Điền:
   - Ngày = D (mặc định sẵn ngày hôm nay).
   - Ca giao = Ca giao ở mục 3.
   - Ca nhận = Ca nhận ở mục 3.
   - Máy / Chuyền = để trống (hoặc chọn 1 máy bất kỳ nếu muốn test kèm máy).
   - Người giao ca = chọn theo mục 3.
   - Người nhận ca = nhập theo mục 3.
3. Điền các ô mô tả: Tình hình sản xuất trong ca, Tình trạng máy móc, Sản
   lượng đạt được, Tồn kho cuối ca (theo mục 3, có thể để trống tuỳ test
   case).
4. Ở bảng **Công việc / sự cố bàn giao**, dòng số 1 nhập
   "Nội dung bàn giao 1" ở mục 3, Mức độ = `Thường`, Trạng thái =
   `Chưa xử lý`.
5. Bấm **Lưu phiếu**.

## 5. Danh sách test case

| ID | Mục tiêu | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Tạo phiếu đầy đủ thông tin | Làm đúng theo mục 4 | Hiện thông báo "Đã lưu phiếu BGC-..."; form reset về trạng thái trống (còn lại 1 dòng công việc rỗng); cửa sổ in tự động mở với đúng nội dung vừa nhập (xem TC08); phiếu xuất hiện ngay trong khối **Lịch sử phiếu** bên phải với đúng ngày/ca/người giao → người nhận |
| TC02 | Validate thiếu Ngày | Từ form trống, xoá giá trị ô Ngày, điền các ô còn lại hợp lệ, bấm **Lưu phiếu** | Hiện lỗi màu đỏ yêu cầu chọn ngày/ca/người giao/người nhận; **không** gọi lưu thành công, không có thông báo "Đã lưu phiếu" |
| TC03 | Validate thiếu Ca giao | Điền đủ trừ Ca giao (để "Chọn ca"), bấm **Lưu phiếu** | Hiện lỗi validate tương tự TC02, không lưu được |
| TC04 | Validate thiếu Người giao ca | Điền đủ trừ Người giao ca, bấm **Lưu phiếu** | Hiện lỗi validate, không lưu được |
| TC05 | Validate thiếu Người nhận ca | Điền đủ trừ Người nhận ca (để trống), bấm **Lưu phiếu** | Hiện lỗi validate, không lưu được |
| TC06 | Lưu phiếu không có dòng công việc bàn giao nào | Làm theo mục 4 nhưng xoá hết nội dung ở dòng công việc (để trống nội dung), bấm **Lưu phiếu** | Lưu thành công bình thường (bảng công việc không bắt buộc phải có dòng); phiếu lưu xong không có việc bàn giao nào |
| TC07 | Thêm nhiều dòng công việc bàn giao | Từ form, bấm **+ Thêm dòng** 1 lần để có 2 dòng; dòng 1 nhập "Nội dung bàn giao 1", Mức độ = `Thường`; dòng 2 nhập "Nội dung bàn giao 2", Mức độ = `Khẩn cấp`, Trạng thái = `Đã xử lý`; Lưu phiếu | Lưu thành công với đúng 2 dòng công việc; ở lịch sử phiếu ghi đúng "2 việc bàn giao" |
| TC08 | Xoá bớt 1 dòng công việc trước khi lưu | Từ form có 2 dòng (như TC07), bấm icon thùng rác ở 1 dòng bất kỳ trước khi lưu | Dòng bị xoá khỏi bảng ngay lập tức; nếu chỉ còn 1 dòng thì nút xoá dòng biến mất (không cho xoá dòng cuối cùng) |
| TC09 | Nội dung phiếu in đúng | Sau khi lưu phiếu ở TC07, kiểm tra cửa sổ in (hoặc bấm nút **In phiếu** trên form/lịch sử) | Bản in hiện đúng: số phiếu, ngày, Ca giao → Ca nhận, Máy/Chuyền, Người giao ca, Người nhận ca, 4 ô mô tả (tình hình SX, sản lượng, tình trạng máy, tồn kho cuối ca), bảng công việc bàn giao đủ 2 dòng đúng nội dung/mức độ/trạng thái, và 2 ô ký tên "Người giao ca" / "Người nhận ca" |
| TC10 | Xoá phiếu từ khối Lịch sử phiếu (trang lập phiếu) | Ở khối **Lịch sử phiếu** bên phải, bấm icon thùng rác trên 1 phiếu vừa tạo → xác nhận | Hộp thoại xác nhận "Xóa phiếu giao ca này?" hiện ra; sau khi đồng ý, phiếu biến mất khỏi danh sách lịch sử, hiện thông báo "Đã xóa phiếu." |
| TC11 | Xem danh sách phiếu giao ca | Tạo lại 1-2 phiếu (TC01/TC07), sau đó vào **Xem báo cáo → Danh sách phiếu giao ca** (`/danh-sach-phieu-giao-ca`) | Trang danh sách hiện đúng số liệu tổng quan (X ngày · Y phiếu · Z việc chưa xử lý); các phiếu vừa tạo được nhóm theo ngày D, hiện đúng cột Số phiếu, Ca giao → nhận, Máy/Chuyền, Người giao ca, Người nhận ca, số việc bàn giao (kèm badge đỏ "N chưa xử lý" nếu có việc chưa xử lý) |
| TC12 | Lọc theo Ca ở trang danh sách | Ở trang danh sách, dùng bộ lọc **Ca** chọn đúng Ca giao đã dùng để tạo phiếu | Chỉ còn hiện các phiếu có Ca giao trùng khớp; đổi lại "Tất cả" thì hiện lại đầy đủ |
| TC13 | Tìm kiếm theo từ khoá | Gõ vào ô tìm kiếm một phần Người nhận ca (`TEST-BGC`) | Danh sách chỉ còn hiện đúng các phiếu test đã tạo (khớp tên người nhận ca) |
| TC14 | Lọc theo khoảng ngày | Đặt "Từ ngày"/"Đến ngày" không bao trùm ngày D (ví dụ 1 khoảng ngày trong quá khứ xa) | Danh sách hiện "Chưa có phiếu giao ca trong khoảng ngày đã chọn."; đặt lại khoảng ngày bao trùm ngày D thì phiếu hiện lại |
| TC15 | Xem chi tiết phiếu (modal) | Từ danh sách, bấm **Xem** trên phiếu TC07 (có 2 dòng, 1 khẩn cấp) | Modal "Chi tiết phiếu giao ca" hiện đủ: người giao ca, người nhận ca, sản lượng đạt được, tình hình sản xuất, tình trạng máy móc, tồn kho cuối ca, và bảng công việc bàn giao đủ 2 dòng; dòng Mức độ = `Khẩn cấp` hiện badge nền đỏ |
| TC16 | In 1 phiếu từ danh sách | Từ danh sách hoặc từ modal chi tiết, bấm **In** / **In phiếu** | Cửa sổ in mở, nội dung khớp với phiếu đã chọn (đối chiếu như TC09) |
| TC17 | In nhiều phiếu cùng lúc | Ở trang danh sách, để bộ lọc đang hiện ≥ 2 phiếu, bấm **In danh sách** | Cửa sổ in mở với nhiều trang, mỗi trang là 1 phiếu tương ứng đúng thứ tự đang hiển thị trên danh sách |
| TC18 | Xoá phiếu từ trang danh sách | Bấm icon thùng rác trên 1 dòng phiếu → xác nhận | Hộp thoại xác nhận hiện ra; sau khi đồng ý, phiếu biến mất khỏi danh sách, tổng số phiếu/ngày cập nhật lại đúng |
| TC19 | Nút "Thêm mới" trên trang danh sách | Từ trang danh sách, bấm **Thêm mới** | Điều hướng sang trang lập phiếu `/phieu-giao-ca`, form ở trạng thái trống sẵn sàng nhập phiếu mới |
| TC20 | Không có lỗi console | Trong suốt quá trình thực hiện TC01–TC19 | Mở DevTools (F12) → tab Console: không phát sinh lỗi đỏ (error) liên quan đến `phieu-giao-ca` hoặc các component `ShiftHandover*` |

> Ghi chú thực hiện: mỗi test case tạo phiếu mới nên đổi Ca giao hoặc Máy/Chuyền
> khác nhau một chút nếu muốn tránh nhầm lẫn khi đối chiếu ở bước xem danh sách
> — hệ thống **không** chặn trùng ngày/ca/người như phiếu tồn máy, vẫn lưu được
> nhiều phiếu giao ca cùng ngày/ca khác máy hoặc khác nội dung.

## 6. Tiêu chí hoàn thành

- TC01, TC06, TC07 lưu phiếu thành công đúng dữ liệu.
- TC02–TC05 chặn đúng khi thiếu trường bắt buộc (Ngày, Ca giao, Người giao ca,
  Người nhận ca), không tạo được bản ghi rác.
- TC08 thao tác thêm/xoá dòng công việc hoạt động đúng, không xoá được dòng
  cuối cùng.
- TC09, TC16, TC17 bản in đúng nội dung, đúng bố cục, đủ chữ ký.
- TC11–TC15 trang danh sách lọc/tìm kiếm/nhóm theo ngày hoạt động chính xác;
  đếm "việc chưa xử lý" đúng số liệu.
- TC18 xoá phiếu hoạt động đúng, cập nhật lại danh sách ngay không cần tải lại
  trang.
- TC20 không có lỗi console trong toàn bộ quá trình test.

## 7. Dọn dẹp dữ liệu sau khi test

**Bắt buộc thực hiện** sau khi test xong để không để lại phiếu rác trong hệ
thống thật:

1. Vào **Xem báo cáo → Danh sách phiếu giao ca** (`/danh-sach-phieu-giao-ca`).
2. Đặt lại khoảng ngày "Từ ngày"/"Đến ngày" đủ rộng để thấy hết các phiếu test
   đã tạo trong ngày D (và các ngày khác nếu có test thêm).
3. Dùng ô tìm kiếm gõ `TEST-BGC` để lọc nhanh đúng các phiếu test (vì Người
   nhận ca dùng tên test đã đặt ở mục 3).
4. Với từng phiếu còn sót lại trong danh sách lọc được, bấm icon thùng rác ở
   cột **Thao tác** → xác nhận xoá, lặp lại cho đến khi danh sách trống.
5. Xác nhận lại: gõ `TEST-BGC` ở ô tìm kiếm không còn kết quả nào; xoá từ khoá
   tìm kiếm và kiểm tra danh sách chung không còn phiếu lạ nào phát sinh từ
   quá trình test.
6. Nếu có test kèm máy thật (Máy / Chuyền) ở một vài test case — chỉ cần xoá
   phiếu giao ca test, **không** xoá máy đó vì đây là máy thật đang dùng chung
   cho các báo cáo khác.

Vì phiếu giao ca không sinh dữ liệu phụ ở danh mục nào khác (không tạo mã NVL,
không tạo máy mới bắt buộc), nên xoá xong các phiếu ở bước 4 là đã sạch hoàn
toàn.
