# Test case kiểm kho, tồn kho và xử lý chênh lệch

## 1. Mục tiêu

Kiểm tra toàn bộ luồng:

1. Tạo danh mục sản phẩm thử nghiệm.
2. Tạo và tiếp tục một đợt kiểm kho.
3. Quét mã gốc, mã có hậu tố và mã không có trong danh mục.
4. Kiểm tra dữ liệu chi tiết và dữ liệu tổng hợp.
5. Xác nhận đợt kiểm kho.
6. Đối chiếu tồn hệ thống với tồn kiểm kê.
7. Tạo phiếu nhập/xuất điều chỉnh.
8. Kiểm tra tồn kho sau điều chỉnh.

## 2. Điều kiện chuẩn bị

- Sử dụng một kho vật lý có tên `Kho TP Test`.
- Nếu chưa có kho này, tạo tại trang **Quản lý kho** trước.
- Các mã thử nghiệm bên dưới chưa có trong danh mục và chưa phát sinh phiếu xuất/nhập cũ.
- Khi tạo sản phẩm, điền `Kho = Kho TP Test`.
- Chỉ nhập giá trị **Tồn đầu**; để trống các ô **Nhập**, **Xuất** và **Tồn kho**.
- Không dùng dấu `_` trong mã sản phẩm gốc vì hệ thống lấy phần trước `_` làm mã gốc.

## 3. Danh sách 10 sản phẩm cần tạo

| STT | Mã SP | Tên sản phẩm | Nhóm VTHH | ĐVT | Kho | Tồn đầu |
|---:|---|---|---|---|---|---:|
| 1 | `KK-TP-001` | Túi kiểm kho 001 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 2 | `KK-TP-002` | Túi kiểm kho 002 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 3 | `KK-TP-003` | Túi kiểm kho 003 | TP TEST KIỂM KHO | Cái | Kho TP Test | 0 |
| 4 | `KK-TP-004` | Túi kiểm kho 004 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 5 | `KK-TP-005` | Túi kiểm kho 005 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 6 | `KK-TP-006` | Túi kiểm kho 006 | TP TEST KIỂM KHO | Cái | Kho TP Test | 0 |
| 7 | `KK-TP-007` | Túi kiểm kho 007 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 8 | `KK-TP-008` | Túi kiểm kho 008 | TP TEST KIỂM KHO | Cái | Kho TP Test | 2 |
| 9 | `KK-TP-009` | Túi kiểm kho 009 | TP TEST KIỂM KHO | Cái | Kho TP Test | 1 |
| 10 | `KK-TP-010` | Túi kiểm kho 010 | TP TEST KIỂM KHO | Cái | Kho TP Test | 0 |

## 4. Dữ liệu quét kiểm kho

### 4.1. Lần lưu thứ nhất

Tạo đợt kiểm kho mới và quét:

```text
KK-TP-001
KK-TP-003
KK-TP-004
KK-TP-006
```

Trước khi lưu, quét lại `KK-TP-001`.

Kết quả mong đợi:

- Hệ thống báo mã đã có trên form.
- Không thêm dòng `KK-TP-001` thứ hai.
- Lưu thành công 4 dòng.

### 4.2. Lần lưu thứ hai

Chọn tiếp đúng đợt kiểm kho đang mở và quét:

```text
KK-TP-001
KK-TP-007_A01
KK-TP-008
KK-TP-008_A01
KK-TP-009
KK-UNKNOWN-01_X01
```

Kết quả mong đợi:

- `KK-TP-001` đã có trong đợt nên server bỏ qua.
- Có 5 dòng mới được lưu.
- Thông báo thể hiện 5 mã đã lưu và 1 mã bị bỏ qua.
- Tổng số dòng chi tiết của đợt là 9.

Không quét các mã:

```text
KK-TP-002
KK-TP-005
KK-TP-010
```

## 5. Kết quả tổng hợp trước khi xác nhận

| Mã gốc | Tồn hệ thống | SL kiểm kê | Chênh lệch | Trạng thái |
|---|---:|---:|---:|---|
| `KK-TP-001` | 1 | 1 | 0 | Khớp |
| `KK-TP-003` | 0 | 1 | +1 | Thừa |
| `KK-TP-004` | 1 | 1 | 0 | Khớp |
| `KK-TP-006` | 0 | 1 | +1 | Thừa |
| `KK-TP-007` | 1 | 1 | 0 | Khớp |
| `KK-TP-008` | 2 | 2 | 0 | Khớp |
| `KK-TP-009` | 1 | 1 | 0 | Khớp |
| `KK-UNKNOWN-01` | Không xác định | 1 | Không xác định | Không xác định |

Thống kê mong đợi:

- Tổng mã đã kiểm: **8**.
- Khớp: **5**.
- Thừa: **2**.
- Thiếu trong bảng tổng hợp: **0**.
- Không xác định: **1**.
- Tổng số lượng thừa: **2**.

> `KK-TP-002` và `KK-TP-005` không xuất hiện trong bảng tổng hợp chênh lệch vì bảng này chỉ tổng hợp các mã đã được quét. Hai mã này vẫn phải xuất hiện trong tab Phiếu điều chỉnh vì có tồn hệ thống nhưng không được kiểm thấy.

## 6. Danh sách test case

| ID | Chức năng | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Tạo sản phẩm | Tạo đủ 10 sản phẩm theo danh sách | Lưu thành công, đúng kho và tồn đầu |
| TC02 | Chống trùng mã SP | Tạo lại `KK-TP-001` | Bị từ chối do trùng mã |
| TC03 | Kiểm tra người kiểm | Lưu kiểm kho khi chưa nhập người kiểm | Báo phải nhập người kiểm kho |
| TC04 | Kiểm tra dòng quét | Lưu khi chưa quét mã | Báo phải quét ít nhất một mã |
| TC05 | Tra danh mục | Quét `KK-TP-001` | Tự điền đúng tên và nhóm sản phẩm |
| TC06 | Tách mã gốc | Quét `KK-TP-007_A01` | Nhận mã gốc là `KK-TP-007`, giữ mã đầy đủ ở chi tiết |
| TC07 | Trùng trên form | Quét `KK-TP-001` hai lần trước khi lưu | Không thêm dòng trùng |
| TC08 | Trùng trong đợt | Lưu `KK-TP-001`, sau đó quét lại ở lần lưu tiếp theo | Server bỏ qua và tăng số lượng bị bỏ qua |
| TC09 | Đợt đang mở | Khi còn đợt chưa xác nhận, thử tạo đợt mới | Không cho tạo đợt mới; bắt tiếp tục đợt đang mở |
| TC10 | Danh sách chi tiết | Mở tab Danh sách chi tiết | Có đúng 9 dòng và giữ nguyên hậu tố `_A01`, `_X01` |
| TC11 | Tổng hợp trực tiếp | Mở Bảng tổng hợp khi đợt chưa chốt | Có 8 mã gốc và hiển thị trạng thái Chưa chốt |
| TC12 | Xác nhận đợt | Bấm Xác nhận kiểm kho | Chốt thành công, ghi thời gian và người xác nhận |
| TC13 | Chống xác nhận lại | Gửi xác nhận lại cùng đợt | Bị từ chối, không tạo dữ liệu tổng hợp trùng |
| TC14 | Tổng hợp sau chốt | Mở lại Bảng tổng hợp | Số liệu giống trước khi chốt và có thông tin chốt |
| TC15 | Đối chiếu chênh lệch | Mở màn Xử lý chênh lệch và chọn đợt vừa chốt | Hiển thị đúng mã khớp, thừa và không xác định |
| TC16 | Mã không được quét | Kiểm tra `KK-TP-002`, `KK-TP-005` ở tab Phiếu điều chỉnh | Có đề xuất phiếu Xuất số lượng 1 cho mỗi mã |
| TC17 | Mã có hậu tố | Kiểm tra `KK-TP-007_A01`, `KK-TP-008_A01` | Mã hậu tố được giữ nguyên, không bị thay bằng mã gốc |
| TC18 | Tạo phiếu điều chỉnh | Chọn các dòng xác định và tạo phiếu | Tạo phiếu Nhập/Xuất, ghi vào lịch sử kho |
| TC19 | Không sửa tồn đầu | Kiểm tra lại danh mục sản phẩm | Tồn đầu không bị ghi đè bởi xử lý chênh lệch |
| TC20 | Tính lại tồn cuối | Kiểm tra trang Tồn kho sau điều chỉnh | Tồn cuối bằng tồn đầu + nhập - xuất |
| TC21 | Lịch sử xử lý | Quay lại đợt đã xử lý | Dòng hiển thị Đã xử lý và mã phiếu điều chỉnh |
| TC22 | Chống xử lý lại | Thử chọn lại dòng đã xử lý | Không cho chọn để tạo phiếu lần nữa |

## 7. Phiếu điều chỉnh mong đợi

Trước khi tạo phiếu:

1. Chọn kho `Kho TP Test`.
2. Chọn ngày lập phiếu phù hợp.
3. Chưa chọn xử lý mã `KK-UNKNOWN-01_X01`; dùng mã này để kiểm tra trạng thái không xác định.

### 7.1. Phiếu Xuất

| Mã nguyên bản | Số lượng | Nguyên nhân |
|---|---:|---|
| `KK-TP-002` | 1 | Hệ thống có 1, kiểm kê không thấy |
| `KK-TP-005` | 1 | Hệ thống có 1, kiểm kê không thấy |
| `KK-TP-007` | 1 | Tồn nằm ở mã gốc nhưng kiểm kê thấy mã hậu tố |
| `KK-TP-008` | 1 | Mã gốc tồn 2 nhưng chỉ kiểm thấy mã gốc 1 lần |

### 7.2. Phiếu Nhập

| Mã nguyên bản | Số lượng | Nguyên nhân |
|---|---:|---|
| `KK-TP-003` | 1 | Tồn hệ thống 0, kiểm kê thấy 1 |
| `KK-TP-006` | 1 | Tồn hệ thống 0, kiểm kê thấy 1 |
| `KK-TP-007_A01` | 1 | Kiểm kê thấy mã hậu tố mới |
| `KK-TP-008_A01` | 1 | Kiểm kê thấy mã hậu tố mới |

Nếu tất cả các dòng dùng cùng một kho, kết quả mong đợi là:

- 1 phiếu Xuất gồm 4 dòng.
- 1 phiếu Nhập gồm 4 dòng.
- Mỗi dòng lịch sử giữ nguyên mã đầy đủ.

## 8. Tồn kho mong đợi sau điều chỉnh

| Mã gốc | Tồn tổng hợp mong đợi |
|---|---:|
| `KK-TP-001` | 1 |
| `KK-TP-002` | 0 |
| `KK-TP-003` | 1 |
| `KK-TP-004` | 1 |
| `KK-TP-005` | 0 |
| `KK-TP-006` | 1 |
| `KK-TP-007` | 1 |
| `KK-TP-008` | 2 |
| `KK-TP-009` | 1 |
| `KK-TP-010` | 0 |

## 9. Tiêu chí hoàn thành

Bộ test đạt khi:

- Không lưu trùng mã trong cùng đợt kiểm kho.
- Mã hậu tố được giữ nguyên ở danh sách chi tiết và phiếu điều chỉnh.
- Bảng tổng hợp gộp đúng theo mã trước dấu `_`.
- Không cho mở đợt mới khi còn đợt chưa xác nhận.
- Không cho xác nhận lại đợt đã chốt.
- Chênh lệch dương tạo phiếu Nhập.
- Chênh lệch âm tạo phiếu Xuất.
- Phiếu điều chỉnh xuất hiện trong lịch sử xuất nhập kho.
- Tồn đầu không bị sửa trực tiếp.
- Tồn cuối sau điều chỉnh khớp số lượng kiểm kê.
