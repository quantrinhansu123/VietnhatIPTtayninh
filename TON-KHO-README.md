# Tính năng "Tồn kho" — trạng thái triển khai

Phần code của tính năng đã hoàn tất và đã qua typecheck/build. Trang `/ton-kho` hỗ trợ hai loại **NVL** và **Thành phẩm**, lọc theo kho vật lý trong danh mục `quan_ly_kho`.

## Đã hoàn tất

- Thêm `ten_kho` cho `kho_nvl`, `san_pham`, `phieu_xuat_nhap_kho` qua ba migration riêng.
- Thêm RPC tính tồn đầu kỳ, nhập, xuất và tồn cuối kỳ trong `supabase-ton-kho-rpc.sql`.
- Backend tự chuyển sang tính trực tiếp từ ba bảng nguồn khi RPC chưa được cài (`PGRST202`); chạy RPC vẫn được khuyến nghị để tối ưu hiệu năng.
- Hai tab tồn kho dùng chung một tập mã theo bộ lọc: **Danh sách chi tiết** hiển thị mỗi mã QR/SKU thành một dòng; **Bảng tổng hợp** hiển thị tồn đầu, nhập, xuất và tồn cuối của chính các mã đó.
- Thêm API `GET /api/ton-kho/chi-tiet` và `GET /api/ton-kho/tong-hop`.
- Thêm trang `src/features/ton-kho/index.tsx`, routing, menu và phân quyền.
- Danh mục NVL và Sản phẩm đều có dropdown kho lấy từ `/api/quan-ly-kho`, có cột Kho trong danh sách và thông tin chi tiết.
- Form Phiếu xuất/nhập kho bắt buộc chọn kho, gửi `tenKho` lên backend và khôi phục đúng kho khi sửa phiếu từ lịch sử.
- Đã cập nhật `src/features/registry.ts` và các manifest trong `docs/ai-tables/`.
- `npm run lint` (`tsc --noEmit`) đã chạy thành công.
- `npm run build` đã chạy thành công; chỉ còn cảnh báo kích thước chunk Vite, không làm build thất bại.

## Cần thực hiện trên môi trường Supabase

Code local không tự chạy migration lên cơ sở dữ liệu. Trong Supabase SQL Editor, chạy đúng thứ tự:

1. `supabase-kho-nvl-ten-kho.sql`
2. `supabase-san-pham-ten-kho.sql`
3. `supabase-phieu-xuat-nhap-kho-ten-kho.sql`
4. `supabase-ton-kho-rpc.sql`

Sau đó chạy ứng dụng và kiểm tra thực tế hai tab của `/ton-kho` với dữ liệu Supabase.

## Dữ liệu cũ cần gán kho

Sau migration, các bản ghi cũ sẽ có `ten_kho = NULL`. Cần gán kho cho NVL, sản phẩm và các phiếu cũ nếu muốn chúng xuất hiện chính xác khi lọc theo từng kho. Nên thử trước với vài mã mẫu và đối chiếu công thức:

`Tồn đầu + Nhập - Xuất = Tồn cuối`
