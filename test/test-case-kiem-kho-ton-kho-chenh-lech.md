# Test case mã QR sản phẩm, tồn kho, kiểm kho và xử lý chênh lệch

## 1. Mục tiêu

Kiểm tra xuyên suốt luồng mới:

1. Tạo sản phẩm kèm số lượng khởi tạo.
2. Sinh và lưu từng mã QR/serial trong `ma_san_pham_chi_tiet`.
3. In các mã QR được chọn và ghi nhận số lần in.
4. Hiển thị tồn kho chi tiết theo mã đầy đủ và tổng hợp theo mã gốc.
5. Quét mã QR thực tế trong một đợt kiểm kho.
6. Chốt đợt, đối chiếu từng serial và tạo phiếu điều chỉnh.
7. Lọc phiếu điều chỉnh theo mã QR, mã gốc hoặc tên sản phẩm.
8. Kiểm tra tồn kho và trạng thái serial sau điều chỉnh.

## 2. Điều kiện chuẩn bị

### 2.1. Migration

Trên Supabase DB chính `he-thong`, đã chạy:

- `supabase-san-pham.sql`
- `supabase-phieu-xuat-nhap-kho.sql` và các migration bổ sung cột kho
- `supabase-san-pham-ma-chi-tiet.sql`
- `supabase-ton-kho-rpc.sql`

Trên Supabase DB `kiem-kho`, đã chạy:

- `supabase-kiem-kho.sql`
- `supabase-kiem-kho-tong-hop.sql`
- `supabase-kiem-kho-tong-hop-rpc.sql`
- `supabase-kiem-kho-chenh-lech-xu-ly.sql`

### 2.2. Dữ liệu nền

- Tạo kho vật lý `Kho TP Test` tại trang **Quản lý kho** nếu chưa có.
- Xóa dữ liệu test cũ mang mã `KK-TP-001` đến `KK-TP-010`, hoặc đổi tiền tố cho lần test mới.
- Các mã test chưa có phiếu nhập/xuất hoặc lịch sử xử lý chênh lệch cũ.
- Không dùng dấu `_` trong mã sản phẩm gốc. Phần trước `_` được hệ thống xem là mã gốc.
- Khởi động lại server sau khi cập nhật code.

## 3. Danh sách sản phẩm cần tạo

Tại trang **Sản phẩm**, tạo lần lượt:

| STT | Mã SP | Tên sản phẩm | Nhóm VTHH | ĐVT | Kho | Số lượng khởi tạo |
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

Khi **Số lượng khởi tạo > 0**:

- Không nhập đồng thời **Tồn đầu**, **Nhập**, **Xuất** hoặc **Tồn kho**.
- Hệ thống tự đặt tồn đầu mã gốc bằng 0.
- Mỗi mã chi tiết tạo một dòng phiếu nhập số lượng 1.
- Tổng số mã chi tiết được tạo trong bộ dữ liệu này là **8**.

## 4. Ghi lại mã QR thực tế

Hậu tố QR chứa thời gian và ký tự ngẫu nhiên nên không cố định. Sau khi tạo sản phẩm, mở **Xem → Mã chi tiết** và ghi lại mã thực tế:

| Biến dùng trong tài liệu | Mã QR thực tế cần ghi lại |
|---|---|
| `QR001` | Mã đầy đủ của `KK-TP-001` |
| `QR002` | Mã đầy đủ của `KK-TP-002` |
| `QR004` | Mã đầy đủ của `KK-TP-004` |
| `QR005` | Mã đầy đủ của `KK-TP-005` |
| `QR007` | Mã đầy đủ của `KK-TP-007` |
| `QR008-A` | Mã đầy đủ thứ nhất của `KK-TP-008` |
| `QR008-B` | Mã đầy đủ thứ hai của `KK-TP-008` |
| `QR009` | Mã đầy đủ của `KK-TP-009` |

Ví dụ một giá trị thực tế:

```text
QR001 = KK-TP-001_38201011081
```

Không dùng nguyên ví dụ trên nếu mã được hệ thống sinh ra khác.

Tạo thêm ba mã chỉ dùng để mô phỏng hàng kiểm thấy nhưng chưa có trên hệ thống:

```text
QR003-THUA = KK-TP-003_TEST01
QR006-THUA = KK-TP-006_TEST01
QR-UNKNOWN = KK-UNKNOWN-01_TEST01
```

## 5. Kiểm tra tạo mã và in QR

### 5.1. Danh sách mã chi tiết

Mở sản phẩm `KK-TP-008` → tab **Mã chi tiết**.

Kết quả mong đợi:

- Có đúng 2 mã đầy đủ khác nhau.
- Cả hai có trạng thái **Trong kho**.
- Tên kho là `Kho TP Test`.
- Cùng một mã phiếu nhập khởi tạo.
- Số lần in ban đầu bằng 0.

### 5.2. In theo checkbox

1. Chọn checkbox của `QR008-A`.
2. Bấm **In mã QR đã chọn**.
3. Đóng hoặc hoàn tất hộp thoại in.

Kết quả mong đợi:

- Bản in chứa đúng `QR008-A`, không sinh mã mới.
- `QR008-B` không xuất hiện trên bản in.
- Số lần in của `QR008-A` tăng lên 1.
- Số lần in của `QR008-B` vẫn bằng 0.

Tiếp tục chọn checkbox ở tiêu đề để chọn tất cả và in:

- Bản in có đủ 2 mã.
- Số lần in của cả hai mã tăng thêm 1.
- Mã trạng thái **Đã hủy** nếu có phải bị khóa checkbox.

## 6. Kiểm tra tồn kho trước kiểm kê

### 6.1. Tab chi tiết

Trang **Tồn kho → Chi tiết** phải có 8 dòng serial, mỗi dòng số lượng 1.

Với từng dòng:

- **Mã SP** là mã đầy đủ, ví dụ `KK-TP-001_...`.
- **Tên sản phẩm** phải là tên của mã gốc, ví dụ `Túi kiểm kho 001`; không được lặp lại mã QR.
- **Kho** phải là `Kho TP Test`.
- **Loại sản phẩm** là `Thành phẩm`.

### 6.2. Tab tổng hợp

| Mã gốc | Tên sản phẩm | Tồn tổng hợp |
|---|---|---:|
| `KK-TP-001` | Túi kiểm kho 001 | 1 |
| `KK-TP-002` | Túi kiểm kho 002 | 1 |
| `KK-TP-004` | Túi kiểm kho 004 | 1 |
| `KK-TP-005` | Túi kiểm kho 005 | 1 |
| `KK-TP-007` | Túi kiểm kho 007 | 1 |
| `KK-TP-008` | Túi kiểm kho 008 | 2 |
| `KK-TP-009` | Túi kiểm kho 009 | 1 |

Các sản phẩm có số lượng khởi tạo 0 không xuất hiện nếu chưa phát sinh nhập kho.

## 7. Dữ liệu quét kiểm kho

### 7.1. Lần lưu thứ nhất

Tạo đợt kiểm kho mới và quét:

```text
QR001
QR003-THUA
QR004
QR006-THUA
```

Trước khi lưu, quét lại `QR001`.

Kết quả mong đợi:

- Hệ thống báo mã đã có trên form.
- Không thêm dòng `QR001` thứ hai.
- Lưu thành công 4 dòng.
- Tên sản phẩm tự điền theo mã gốc.

### 7.2. Lần lưu thứ hai

Chọn tiếp đúng đợt đang mở và quét:

```text
QR001
QR007
QR008-A
QR008-B
QR009
QR-UNKNOWN
```

Kết quả mong đợi:

- `QR001` đã có trong đợt nên server bỏ qua.
- Có 5 dòng mới được lưu.
- Thông báo ghi 5 mã đã lưu và 1 mã bị bỏ qua.
- Tổng số dòng chi tiết của đợt là 9.

Không quét:

```text
QR002
QR005
```

## 8. Kết quả tổng hợp trước khi xác nhận

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

- Tổng mã gốc đã kiểm: **8**.
- Khớp: **5**.
- Thừa: **2**.
- Thiếu trong bảng tổng hợp: **0**.
- Không xác định: **1**.
- Tổng số lượng thừa: **2**.

`KK-TP-002` và `KK-TP-005` không xuất hiện ở bảng tổng hợp nếu bảng này chỉ lấy phạm vi mã đã quét. Hai serial `QR002` và `QR005` vẫn phải xuất hiện trong tab **Phiếu điều chỉnh** vì đang tồn trên hệ thống nhưng không được kiểm thấy.

## 9. Kiểm tra bộ lọc phiếu điều chỉnh

Sau khi xác nhận đợt, mở **Xử lý chênh lệch → Phiếu Nhập/Xuất điều chỉnh**.

### 9.1. Tìm theo mã gốc

Nhập:

```text
KK-TP-008
```

Kết quả mong đợi:

- Combobox gợi ý một mục **Mã gốc – KK-TP-008 – Túi kiểm kho 008**.
- Có thể có thêm các gợi ý **Mã QR** cho `QR008-A` và `QR008-B`.
- Chọn gợi ý mã gốc chỉ hiển thị hai serial của `KK-TP-008`.

### 9.2. Tìm theo mã QR đầy đủ

Nhập hoặc chọn gợi ý `QR002`.

- Bảng chỉ hiển thị đúng dòng `QR002`.
- Dòng có đề xuất **Phiếu Xuất**, số lượng 1.

### 9.3. Tìm theo tên sản phẩm

Nhập:

```text
Túi kiểm kho 005
```

- Combobox hiển thị gợi ý đúng mã gốc và tên hàng.
- Bảng chỉ hiển thị các mã thuộc sản phẩm `KK-TP-005`.

### 9.4. Xóa và chọn theo kết quả lọc

- Bấm `X` trong ô tìm kiếm: bảng hiển thị lại toàn bộ dữ liệu.
- Khi đang lọc, **Chọn tất cả** chỉ chọn các dòng đang hiển thị.
- Đổi bộ lọc phải tự bỏ chọn các dòng không còn hiển thị.
- Dòng đã xử lý hoặc không cần lập phiếu không được chọn.

## 10. Phiếu điều chỉnh mong đợi

Chọn ngày lập phiếu phù hợp. Chưa xử lý `QR-UNKNOWN` để giữ trường hợp kiểm tra mã không xác định.

### 10.1. Phiếu Xuất

| Mã nguyên bản | Số lượng | Nguyên nhân |
|---|---:|---|
| `QR002` | 1 | Hệ thống có serial nhưng kiểm kê không thấy |
| `QR005` | 1 | Hệ thống có serial nhưng kiểm kê không thấy |

### 10.2. Phiếu Nhập

| Mã nguyên bản | Số lượng | Nguyên nhân |
|---|---:|---|
| `QR003-THUA` | 1 | Kiểm kê thấy mã mới, hệ thống chưa có tồn |
| `QR006-THUA` | 1 | Kiểm kê thấy mã mới, hệ thống chưa có tồn |

Nếu tất cả dùng `Kho TP Test`, kết quả mong đợi:

- 1 phiếu Xuất gồm 2 dòng.
- 1 phiếu Nhập gồm 2 dòng.
- Mỗi dòng phiếu và lịch sử xử lý giữ nguyên mã đầy đủ.
- `QR002` và `QR005` chuyển trạng thái thành **Đã xuất** trong danh sách mã chi tiết.

## 11. Tồn kho mong đợi sau điều chỉnh

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

Ở tab chi tiết:

- `QR002` và `QR005` không còn tồn dương nên không còn xuất hiện.
- `QR003-THUA` và `QR006-THUA` xuất hiện với tên đúng theo mã gốc.
- Mọi mã chi tiết còn tồn đều hiển thị đúng tên sản phẩm và `Kho TP Test`.

## 12. Danh sách test case rút gọn

| ID | Chức năng | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| TC01 | Tạo sản phẩm kèm số lượng | Tạo `KK-TP-008` với số lượng 2 | Một sản phẩm gốc, hai mã chi tiết, một phiếu nhập 2 dòng |
| TC02 | Chống trùng mã gốc | Tạo lại `KK-TP-001` | Bị từ chối do trùng mã |
| TC03 | Chống trùng serial | Thử chèn lại một `ma_sp_day_du` | Bị ràng buộc UNIQUE từ chối |
| TC04 | Xem mã chi tiết | Mở tab Mã chi tiết | Đúng số mã, kho, trạng thái và phiếu nhập |
| TC05 | In một mã | Chọn một checkbox rồi in | Chỉ in mã đã chọn, không sinh mã mới, số lần in tăng |
| TC06 | In tất cả | Chọn checkbox tiêu đề rồi in | In đủ các mã hợp lệ |
| TC07 | Tồn kho chi tiết | Mở trang Tồn kho | Mỗi serial một dòng, số lượng 1, tên lấy từ mã gốc |
| TC08 | Tồn kho tổng hợp | Mở tab tổng hợp | Serial được gom đúng theo phần trước `_` |
| TC09 | Trùng trên form kiểm kho | Quét cùng một QR hai lần | Không thêm dòng trùng |
| TC10 | Trùng trong đợt | Lưu QR rồi quét lại ở lần lưu sau | Server bỏ qua mã đã có |
| TC11 | Đợt đang mở | Thử tạo đợt mới khi còn đợt chưa chốt | Bắt tiếp tục đợt đang mở |
| TC12 | Chi tiết kiểm kho | Mở danh sách chi tiết | Có 9 dòng, giữ nguyên mã đầy đủ |
| TC13 | Tổng hợp trước chốt | Mở bảng tổng hợp | Có 8 mã gốc và trạng thái Chưa chốt |
| TC14 | Chốt kiểm kho | Xác nhận đợt | Ghi thời gian/người xác nhận, không cho chốt lại |
| TC15 | Đối chiếu serial | Mở phiếu điều chỉnh | `QR002`, `QR005` thiếu; `QR003-THUA`, `QR006-THUA` thừa |
| TC16 | Gợi ý mã gốc | Gõ `KK-TP-008` | Gợi ý mã gốc và hiển thị các serial tương ứng |
| TC17 | Gợi ý mã QR | Gõ mã đầy đủ `QR002` | Gợi ý và lọc đúng một dòng |
| TC18 | Gợi ý tên | Gõ `Túi kiểm kho 005` | Gợi ý đúng sản phẩm và lọc đúng dữ liệu |
| TC19 | Chọn tất cả khi lọc | Lọc rồi bấm Chọn tất cả | Chỉ chọn các dòng đang hiển thị |
| TC20 | Tạo phiếu điều chỉnh | Tạo phiếu nhập/xuất | Phiếu giữ nguyên mã đầy đủ và xuất hiện trong lịch sử kho |
| TC21 | Đồng bộ trạng thái | Kiểm tra mã sau phiếu Xuất | Serial đã xuất có trạng thái `da_xuat` |
| TC22 | Không sửa tồn đầu | Kiểm tra danh mục sản phẩm | Xử lý chênh lệch không ghi đè tồn đầu |
| TC23 | Tồn cuối | Kiểm tra tồn kho sau điều chỉnh | Tồn cuối khớp số lượng kiểm kê |
| TC24 | Chống xử lý lại | Quay lại dòng đã xử lý | Hiển thị mã phiếu và không cho chọn lại |

## 13. Tiêu chí hoàn thành

Bộ test đạt khi:

- Số lượng khởi tạo sinh đúng số mã QR duy nhất và lưu được vào CSDL.
- In QR chỉ dùng mã đã lưu và cập nhật số lần in.
- Tồn kho chi tiết giữ nguyên serial; tổng hợp gom đúng mã gốc.
- Tên sản phẩm, đơn vị và kho của serial lấy đúng từ danh mục mã gốc.
- Không lưu trùng mã trong cùng đợt kiểm kho.
- Không cho mở đợt mới khi còn đợt chưa xác nhận.
- Không cho xác nhận lại đợt đã chốt.
- Bộ lọc phiếu điều chỉnh gợi ý và lọc đúng theo mã QR, mã gốc và tên.
- Chênh lệch dương tạo phiếu Nhập; chênh lệch âm tạo phiếu Xuất.
- Phiếu điều chỉnh giữ nguyên mã đầy đủ và xuất hiện trong lịch sử kho.
- Trạng thái serial đồng bộ với phiếu nhập/xuất.
- Tồn đầu không bị sửa trực tiếp.
- Tồn cuối sau điều chỉnh khớp số lượng kiểm kê.

## 14. Test case sinh mã QR từ Phiếu nhập kho thành phẩm

> Luồng hiện tại: trang **Sản phẩm** chỉ tạo danh mục mã gốc. Serial QR chỉ được sinh khi lưu **Phiếu nhập kho thành phẩm**.

### 14.1. Dữ liệu test riêng

Tạo trước hai sản phẩm tại trang **Sản phẩm**. Không tạo tồn đầu và không phát sinh nhập/xuất trước khi test.

| Mã SP | Tên sản phẩm | ĐVT | Kho |
|---|---|---|---|
| `QR-NHAP-TP-001` | Sản phẩm test sinh QR 001 | Cái | Kho TP Test |
| `QR-NHAP-TP-002` | Sản phẩm test sinh QR 002 | Cái | Kho TP Test |

Nếu `Kho TP Test` chưa tồn tại, tạo kho này tại trang **Quản lý kho** và cấu hình là kho thành phẩm.

### 14.2. TC-QR01 — Nhập một sản phẩm, số lượng 3

Tại **Phiếu xuất nhập kho**:

1. Chọn kho `Kho TP Test`.
2. Chọn loại phiếu **Nhập kho**.
3. Thêm một dòng `QR-NHAP-TP-001`.
4. Nhập **Số lượng = 3**, giá tùy chọn `12.000`.
5. Bấm **Lưu & in phiếu nhập kho**.

Kết quả mong đợi:

- Lưu đúng một mã phiếu nhập, ví dụ `PN-...`.
- Hệ thống sinh đúng 3 serial khác nhau theo dạng:

```text
QR-NHAP-TP-001_<10 chữ số thời gian><ký tự ngẫu nhiên>
```

- CSDL có 3 dòng trong `ma_san_pham_chi_tiet`, cùng `ma_sp_goc`, `ma_phieu_nhap`, kho và trạng thái `trong_kho`.
- CSDL có 3 dòng trong `phieu_xuat_nhap_kho`; mỗi dòng giữ một serial đầy đủ và có `so_luong = 1`.
- Tổng số lượng của phiếu bằng 3; `so_luong_chung_tu` của phiếu nhập bằng `NULL`.
- Tên sản phẩm trên cả 3 dòng là `Sản phẩm test sinh QR 001`, không phải chuỗi serial.
- Hộp thoại in thứ nhất là **Phiếu nhập kho**, hiển thị mã gốc và số lượng 3.
- Sau khi đóng/in phiếu nhập, hộp thoại thứ hai tự mở và chứa đúng 3 tem QR.
- Quét từng tem trả về đúng serial được in dưới tem.
- Không sinh thêm serial khi chỉ bấm in lại.

### 14.3. Truy vấn xác nhận TC-QR01

Thay `<MA_PHIEU>` bằng mã phiếu vừa tạo.

```sql
select
  ma_sp_goc,
  ma_sp_day_du,
  ten_kho,
  trang_thai,
  ma_phieu_nhap,
  so_lan_in
from public.ma_san_pham_chi_tiet
where ma_phieu_nhap = '<MA_PHIEU>'
order by created_at;
```

Mong đợi: đúng 3 dòng, 3 `ma_sp_day_du` duy nhất, `trang_thai = 'trong_kho'`.

```sql
select
  ma_phieu,
  ma_sp,
  ten_sp,
  so_luong,
  so_luong_chung_tu,
  don_gia,
  thanh_tien,
  loai_phieu,
  loai_kho,
  ten_kho
from public.phieu_xuat_nhap_kho
where ma_phieu = '<MA_PHIEU>'
order by created_at;
```

Mong đợi:

- Đúng 3 dòng.
- `count(distinct ma_sp) = 3`.
- Mỗi dòng `so_luong = 1`.
- `sum(so_luong) = 3`.
- Mỗi dòng `thanh_tien = 12.000`; tổng thành tiền bằng `36.000`.
- `loai_phieu = 'nhap'`, `loai_kho = 'san_pham'` và `so_luong_chung_tu is null`.

Truy vấn tổng hợp nhanh:

```sql
select
  count(*) as so_dong,
  count(distinct ma_sp) as so_serial,
  sum(so_luong) as tong_so_luong,
  sum(thanh_tien) as tong_tien,
  count(*) filter (where so_luong_chung_tu is not null) as dong_sai_sl_ct
from public.phieu_xuat_nhap_kho
where ma_phieu = '<MA_PHIEU>';
```

Mong đợi: `so_dong = 3`, `so_serial = 3`, `tong_so_luong = 3`, `tong_tien = 36000`, `dong_sai_sl_ct = 0`.

### 14.4. TC-QR02 — In lại từ lịch sử

1. Mở **Lịch sử xuất nhập kho → Kho sản phẩm**.
2. Tìm `<MA_PHIEU>` vừa tạo.
3. Chọn **Xem chi tiết**.
4. Bấm **In mã QR**.

Kết quả mong đợi:

- Nút chỉ xuất hiện với phiếu **Nhập kho thành phẩm**.
- Hệ thống tải đúng 3 serial thuộc `<MA_PHIEU>`.
- Bản in có đúng 3 tem, không tạo mã mới.
- `so_lan_in` của 3 serial tăng thêm 1 sau khi mở lệnh in.
- Số dòng trong hai bảng CSDL vẫn giữ nguyên.

### 14.5. TC-QR03 — Một phiếu có nhiều sản phẩm

Tạo phiếu nhập gồm:

| Mã SP | Số lượng | Giá |
|---|---:|---:|
| `QR-NHAP-TP-001` | 2 | 12.000 |
| `QR-NHAP-TP-002` | 1 | 20.000 |

Kết quả mong đợi:

- Một mã phiếu duy nhất.
- Tổng cộng 3 serial: 2 mã có tiền tố `QR-NHAP-TP-001_` và 1 mã có tiền tố `QR-NHAP-TP-002_`.
- Phiếu in thứ nhất có 2 dòng mã gốc với số lượng lần lượt 2 và 1.
- File tem QR thứ hai có 3 tem.
- Lịch sử chi tiết có 3 dòng serial, mỗi dòng số lượng 1.
- Tổng tiền bằng `2 × 12.000 + 1 × 20.000 = 44.000`.

### 14.6. TC-QR04 — Số lượng thập phân

Nhập `1,5` hoặc `1.5` cho sản phẩm thành phẩm rồi lưu.

Kết quả mong đợi:

- Server từ chối với thông báo số lượng phải là số nguyên để sinh từng mã QR.
- Không tạo phiếu, không tạo serial và không có dữ liệu dở dang trong CSDL.

### 14.7. TC-QR05 — Vượt giới hạn một phiếu

Nhập tổng số lượng lớn hơn 999 rồi lưu.

Kết quả mong đợi:

- Server từ chối với thông báo tổng số lượng sinh QR phải từ 1 đến 999.
- Không tạo phiếu và không tạo bất kỳ serial nào.

### 14.8. TC-QR06 — Mã chưa có trong danh mục

Nhập/quét mã `QR-NHAP-TP-KHONG-TON-TAI` rồi lưu phiếu nhập thành phẩm.

Kết quả mong đợi:

- Server báo mã chưa có trong danh mục sản phẩm.
- Không tạo phiếu, serial hoặc tồn kho.

### 14.9. TC-QR07 — Tính nguyên tử của transaction

Mục tiêu là xác nhận không có trường hợp đã tạo phiếu nhưng thiếu serial, hoặc có serial nhưng thiếu dòng phiếu.

Sau mỗi lần test thành công, chạy:

```sql
select
  receipt.ma_phieu,
  receipt.so_dong_phieu,
  detail.so_ma_chi_tiet
from (
  select ma_phieu, count(*) as so_dong_phieu
  from public.phieu_xuat_nhap_kho
  where ma_phieu = '<MA_PHIEU>'
  group by ma_phieu
) receipt
left join (
  select ma_phieu_nhap, count(*) as so_ma_chi_tiet
  from public.ma_san_pham_chi_tiet
  where ma_phieu_nhap = '<MA_PHIEU>'
  group by ma_phieu_nhap
) detail on detail.ma_phieu_nhap = receipt.ma_phieu;
```

Mong đợi: `so_dong_phieu = so_ma_chi_tiet` và cả hai bằng tổng số lượng nhập.

### 14.10. TC-QR08 — Đồng bộ trang Tồn kho

Sau TC-QR01, mở trang **Tồn kho**.

Kết quả mong đợi:

- Tab chi tiết có 3 dòng serial `QR-NHAP-TP-001_...`, mỗi dòng số lượng 1.
- Tên cả 3 dòng là `Sản phẩm test sinh QR 001`.
- Kho là `Kho TP Test`.
- Tab tổng hợp gom về mã gốc `QR-NHAP-TP-001` với tồn bằng 3.

### 14.11. Bảng test rút gọn

| ID | Chức năng | Dữ liệu | Kết quả mong đợi |
|---|---|---|---|
| TC-QR01 | Sinh QR khi nhập kho | 1 mã gốc × SL 3 | 3 serial, 3 dòng phiếu SL 1, mở 2 bản in |
| TC-QR02 | In lại từ lịch sử | Phiếu của TC-QR01 | Đúng 3 tem, không sinh mã mới, tăng số lần in |
| TC-QR03 | Nhiều sản phẩm | SL 2 + SL 1 | Một phiếu, 3 serial đúng tiền tố, tổng tiền 44.000 |
| TC-QR04 | Chặn số thập phân | SL 1,5 | Từ chối và rollback toàn bộ |
| TC-QR05 | Chặn vượt giới hạn | Tổng SL 1000 | Từ chối và không tạo dữ liệu |
| TC-QR06 | Mã không tồn tại | Mã ngoài danh mục | Từ chối và không tạo dữ liệu |
| TC-QR07 | Transaction | Đối chiếu hai bảng | Số dòng phiếu bằng số serial |
| TC-QR08 | Đồng bộ tồn kho | Phiếu SL 3 | Chi tiết 3 dòng; tổng hợp mã gốc tồn 3 |
