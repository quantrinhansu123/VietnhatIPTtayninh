# Kế hoạch hoàn thiện: Tab "Xuất kho treo" (`/phieu-xuat-nhap-kho`)

Trạng thái: **đã chốt lại nghiệp vụ và hoàn thiện code ngày 2026-08-14.**

## Luồng nghiệp vụ chính thức

1. Tab **Xuất kho treo** hiển thị **Báo cáo hàng hỏng chờ xuất kho**.
2. Thủ kho bấm **Kiểm tra** để nạp ngày, ca, máy, lý do và các dòng vật tư xuống form.
3. Khi chưa bấm Lưu, chưa có phiếu kho và tồn kho chưa thay đổi.
4. Bấm **Lưu phiếu xuất kho treo** sẽ tạo ngay phiếu **xuất kho chính thức** (`treo=false`), cập nhật tồn kho, xuất hiện trong Lịch sử xuất nhập kho và mở mẫu in.
5. Báo cáo hàng hỏng được gắn `id_bao_cao_hang_hong`, biến mất khỏi danh sách chờ và không thể lưu trùng.

Không có danh sách phiếu treo đã lưu, không có bước **Xác nhận**, và không có nút Sửa/Hủy riêng trong tab này. Phiếu đã lưu được Sửa/Xóa tại Lịch sử xuất nhập kho theo quyền hiện có.

## File liên quan

- `src/features/phieu-xuat-nhap-kho/index.tsx`: tab, card báo cáo, điền form và lưu phiếu chính thức.
- `server.ts`: lưu liên kết `id_bao_cao_hang_hong` cho cả phiếu nhập lẫn phiếu xuất kho hàng hỏng.
- `docs/ai-tables/phieu_xuat_nhap_kho.md`: manifest luồng hiện tại.
- `supabase-phieu-xuat-nhap-kho-treo.sql`: migration tương thích đã chạy; cột `treo` vẫn giữ cho dữ liệu cũ nhưng giao diện mới luôn lưu `false`.

## Kiểm tra

- [x] Migration cột `treo` đã chạy trên Supabase DB chính.
- [x] `npm run build` thành công ngày 2026-08-14.
- [x] Đã bỏ card "Phiếu xuất kho treo chờ xác nhận" và request tải danh sách treo.
- [x] Nút Lưu ở tab Xuất kho treo gửi `treo=false`, tạo phiếu xuất chính thức và mở mẫu in.
- [x] API lưu liên kết báo cáo hàng hỏng cho phiếu xuất để danh sách chờ không hiện lại.
- [ ] Restart/deploy server cổng `3001`, sau đó click-test bằng tài khoản thủ kho thật.
