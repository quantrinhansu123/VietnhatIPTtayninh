# Test 3 chức năng kho

**Ngày tạo:** 12/08/2026  
**Phạm vi:** Báo cáo hàng hỏng, danh mục kho mới, phân quyền phiếu xuất nhập kho.

## Chuẩn bị chung

- Dùng môi trường production hoặc môi trường test có dữ liệu kho đầy đủ.
- Không dùng mã phiếu, ghi chú hoặc mã báo cáo đang phục vụ nghiệp vụ thật.
- Khi cần tạo dữ liệu, dùng hậu tố dễ tìm, ví dụ: `TEST-KHO-YYYYMMDD-01`.
- Sau mỗi test tạo phiếu/báo cáo, thực hiện mục **Dọn dữ liệu test** ở cuối tài liệu.

## 1. Báo cáo hàng hỏng tự động nhập Kho hàng hỏng

### TC-01 — Tạo báo cáo và tự sinh phiếu nhập kho

1. Vào menu **QC** → **Kiểm soát hàng hỏng**.
2. Tạo mới một báo cáo hàng hỏng.
3. Nhập các thông tin có thể truy vết:

   - Số/chứng từ: `TEST-KHO-YYYYMMDD-01`
   - Ngày sản xuất: ngày hiện tại
   - Trạng thái vật tư: `Nhựa không màng`
   - Số lượng: `1,25`
   - Đơn vị: `kg`
   - Ghi chú: `TEST-KHO-YYYYMMDD-01`

4. Lưu báo cáo.
5. Vào **Kho** → **Lịch sử xuất nhập** → tab **Kho hàng hỏng**.
6. Tìm theo số chứng từ hoặc ghi chú test.

Kết quả mong đợi:

- Có đúng một phiếu **Nhập kho** được sinh tự động.
- Phiếu có kho `Kho hàng hỏng`, loại kho `hang_hong`.
- Mã vật tư là `HH-NHUA-KHONG-MANG`, tên là `Nhựa không màng`.
- Số lượng là `1,25 kg`.
- Lý do thể hiện là tự động nhập từ báo cáo hàng hỏng.

### TC-02 — Sửa báo cáo đồng bộ phiếu kho

1. Mở lại báo cáo vừa tạo ở TC-01.
2. Đổi số lượng từ `1,25` thành `2,5`.
3. Đổi ghi chú thành `TEST-KHO-YYYYMMDD-01-UPDATED`.
4. Lưu lại.
5. Quay lại tab **Kho hàng hỏng** trong Lịch sử xuất nhập và tìm phiếu đó.

Kết quả mong đợi:

- Vẫn chỉ có **một** phiếu tự động tương ứng, không sinh phiếu trùng.
- Số lượng trên phiếu đổi thành `2,5 kg`.
- Ghi chú trên phiếu được cập nhật theo báo cáo.

### TC-03 — Xóa báo cáo xóa phiếu kho nguồn

1. Xóa báo cáo test ở TC-01.
2. Vào lại **Kho hàng hỏng** → **Lịch sử xuất nhập**.
3. Tìm theo `TEST-KHO-YYYYMMDD-01`.

Kết quả mong đợi:

- Không còn phiếu kho được sinh từ báo cáo test.

## 2. Kho hàng hóa, công cụ dụng cụ và gia công

### TC-04 — Có đủ kho trong danh mục

1. Vào **Kho** → **Danh mục kho**.
2. Tìm lần lượt các kho sau:

   - `Kho hàng hóa`
   - `Kho công cụ dụng cụ`
   - `Kho gia công`

Kết quả mong đợi:

- Mỗi tên kho xuất hiện đúng một lần.
- Không có bản ghi trùng tên.

### TC-05 — Có đủ kho trên phiếu và lịch sử

1. Vào **Kho** → **Phiếu xuất nhập kho**.
2. Mở danh sách **Tên kho**.
3. Kiểm tra có ba kho ở TC-04.
4. Vào **Kho** → **Lịch sử xuất nhập**.
5. Kiểm tra có ba tab: **Kho hàng hóa**, **Kho công cụ dụng cụ**, **Kho gia công**.

Kết quả mong đợi:

- Ba kho hiển thị ở dropdown lập phiếu.
- Ba tab lịch sử hiển thị và có thể mở.
- Khi chọn từng kho trong form, loại kho được nhận diện đúng và dòng hàng dùng danh mục NVL.

### TC-06 — Lập thử một phiếu cho mỗi kho mới

Lặp lại cho từng kho: Hàng hóa, Công cụ dụng cụ, Gia công.

1. Vào **Phiếu xuất nhập kho**.
2. Chọn **Nhập kho**.
3. Chọn đúng tên kho.
4. Chọn một mã NVL có sẵn, nhập số lượng `1` và đơn giá hợp lệ.
5. Điền ghi chú `TEST-KHO-YYYYMMDD-<TEN-KHO>`.
6. Lưu phiếu.
7. Mở tab lịch sử tương ứng, tìm phiếu vừa tạo.

Kết quả mong đợi:

- Phiếu lưu thành công và chỉ nằm tại tab kho tương ứng.
- Kho/loại kho không bị nhầm sang NVL, thành phẩm hoặc kho khác.

## 3. Phân quyền phiếu kho: Vật tư và Thành phẩm

### Tài khoản kiểm thử

| Vai trò | Tên đăng nhập | Kỳ vọng |
|---|---|---|
| Thủ kho vật tư, kế toán sản xuất | `nv003-3` | Chỉ thao tác kho Vật tư |
| Thủ kho thành phẩm | `nv006-4` | Chỉ thao tác kho Thành phẩm |

Mật khẩu sử dụng mật khẩu đã được quản trị hệ thống cấp cho hai tài khoản này. Không lưu mật khẩu trong tài liệu test hoặc gửi qua nhóm chat.

Nhóm kho Vật tư gồm: Kho NVL, Kho tái chế, Kho hàng hỏng, Kho hàng hóa, Kho công cụ dụng cụ, Kho gia công.

### TC-07 — Tài khoản thủ kho vật tư

1. Đăng xuất tài khoản hiện tại.
2. Đăng nhập bằng tài khoản `nv003-3`.
3. Vào **Kho** → **Lịch sử xuất nhập**.

Kết quả mong đợi ở lịch sử:

- Thấy các tab: Kho NVL, Kho tái chế, Kho hàng hỏng, Kho hàng hóa, Kho công cụ dụng cụ, Kho gia công.
- **Không thấy** tab Kho Sản phẩm.
- Có nút **Lập phiếu** tại các kho Vật tư.

4. Vào **Phiếu xuất nhập kho** → mở dropdown **Tên kho**.

Kết quả mong đợi ở form:

- Thấy các kho Vật tư.
- **Không thấy** `Kho thành phẩm`.
- Có thể lập/sửa/xóa phiếu thuộc nhóm Vật tư theo quyền được cấp.

### TC-08 — Tài khoản thủ kho thành phẩm

1. Đăng xuất và đăng nhập bằng tài khoản `nv006-4`.
2. Vào **Kho** → **Lịch sử xuất nhập**.

Kết quả mong đợi ở lịch sử:

- Chỉ thấy tab **Kho Sản phẩm**.
- Không thấy các tab kho Vật tư.
- Có nút **Lập phiếu**.

3. Vào **Phiếu xuất nhập kho** → mở dropdown **Tên kho**.

Kết quả mong đợi ở form:

- Chỉ thấy `Kho thành phẩm`.
- Chọn kho này sẽ hiện loại `Kho Sản phẩm`, dòng hàng là mã/tên sản phẩm.
- Có thể lập/sửa/xóa phiếu thành phẩm theo quyền được cấp.

### TC-09 — Chặn sai phạm vi kho

1. Với tài khoản vật tư, thử truy cập URL `/lich-su-xuat-nhap-kho` và kiểm tra không có tab Kho Sản phẩm.
2. Với tài khoản thành phẩm, thử truy cập URL `/lich-su-xuat-nhap-kho` và kiểm tra không có các tab kho Vật tư.
3. Với mỗi tài khoản, vào form lập phiếu và kiểm tra dropdown không có kho ngoài phạm vi.

Kết quả mong đợi:

- Không có cách thao tác nhầm kho khác thông qua menu, tab lịch sử hoặc dropdown tên kho.

## Dọn dữ liệu test

Sau khi hoàn thành, đăng nhập bằng tài khoản quản trị và xóa toàn bộ dữ liệu có ghi chú bắt đầu bằng `TEST-KHO-`:

1. Xóa các **báo cáo hàng hỏng** test tại màn hình Kiểm soát hàng hỏng.
2. Kiểm tra tab **Kho hàng hỏng**: phiếu tự động nguồn phải tự mất theo báo cáo.
3. Xóa các **phiếu nhập kho** test đã tạo ở TC-06 tại từng tab kho tương ứng.
4. Tìm lại theo `TEST-KHO-` trong Lịch sử xuất nhập để xác nhận không còn phiếu test.

## Bảng ghi nhận kết quả

| Mã test | Đạt / Không đạt | Người test | Thời gian | Ghi chú / ảnh chụp |
|---|---|---|---|---|
| TC-01 | | | | |
| TC-02 | | | | |
| TC-03 | | | | |
| TC-04 | | | | |
| TC-05 | | | | |
| TC-06 | | | | |
| TC-07 | | | | |
| TC-08 | | | | |
| TC-09 | | | | |
