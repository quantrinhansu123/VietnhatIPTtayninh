# danh_sach_bao_cao (hub xem báo cáo)

| | |
|---|---|
| **Tab** | `report-lists` → `/danh-sach-bao-cao` |
| **UI** | **Tab ngang** chọn danh sách (không còn lưới thẻ) |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/report-lists/ReportListsHub.tsx` | Tab strip + nhúng từng danh sách (keep-alive) |
| `src/features/report-lists/ReportListsSharedFilters.tsx` | Bộ lọc chung phía **trên** tab (tìm · ca · máy · từ/đến ngày) |
| `src/features/report-lists/index.tsx` | Export hub |
| `src/app/menus.tsx` | `REPORT_LIST_MENU_ITEMS` (nguồn tab) |
| `src/App.tsx` | `activeTab === 'report-lists'` → `<ReportListsHub />` |
| `src/components/ReportListsHubModal.tsx` | Modal tương tự trên `/phan-tich` (in báo cáo) |

## Bộ lọc chung

- Nằm **phía trên** tab strip; áp dụng mọi danh sách qua `initialFilters` + remount khi đổi lọc.
- Mặc định **Hôm qua** (Từ ngày = Đến ngày = ngày hôm qua).
- Tìm kiếm debounce ~350ms; ngày · ca · máy áp dụng ngay.
- Panel trong hub dùng `hideLocalFilters` để không hiện toolbar lọc trùng.
- Bộ lọc Máy của hub cho chọn **Tất cả máy** hoặc máy cụ thể và áp dụng chung cho các tab; trang Sản lượng độc lập có bộ lọc máy riêng theo các máy trong dữ liệu đã tải của khoảng ngày.
- Tab theo LSX cũng remount theo `filtersKey`; `ControlBoardPanel` khởi tạo đúng bộ lọc cha ngay từ lần render đầu. Khi ẩn bộ lọc riêng, không tự đổi máy/lệnh SX để tránh lệch phạm vi bộ lọc chung.
- Tab theo LSX dùng `savedReportView`: đọc snapshot `bb_bao_cao_tinh_toan` để hiển thị, chỉ tải danh mục máy/ca cho nhãn và dialog; không tự tải 13 nguồn phiếu, cân AI hoặc tải lại kho khi trở về tab trình duyệt. Xuất/tồn đầu/tồn cuối/sản lượng lấy trực tiếp snapshot. **Tính toán/Đồng bộ** vẫn tải nguồn mới rồi ghi DB.

## Tab (theo quyền menu)

Tab **Quy đổi vật liệu** (`material-conversion`) nhúng `src/features/quy-doi-vat-lieu/index.tsx`, lưu bảng `quy_doi_vat_lieu` trên DB chính. Chỉ áp dụng tìm kiếm (danh mục chung, không theo ngày/ca/máy), giữ mounted khi đổi bộ lọc. Quyền thêm/sửa/xóa theo `report-lists`. Xem [quy_doi_vat_lieu.md](./quy_doi_vat_lieu.md).

Tab **Báo cáo** (`bao-cao-lech`) nhúng `src/features/bao-cao-lech/index.tsx`: lấy toàn bộ cột **lệch** (`chenhLechKg`) từ snapshot `bb_bao_cao_tinh_toan`, có ô **ghi chú bất thường** (API `/api/bao-cao-lech-ghi-chu`). Xem [bao_cao_lech_ghi_chu.md](./bao_cao_lech_ghi_chu.md).

Tab **Báo cáo CP** (`bao-cao-cp`) nhúng `src/features/bao-cao-cp/index.tsx`: hai bảng **Lỗ hàng lỗi hỏng** và **Lỗ vận hành** từ `danhGiaGroups.summaryRows` (đơn giá × kg). Xem [bao_cao_cp.md](./bao_cao_cp.md).

Báo cáo tồn · Phiếu nhận NVL · Trộn NVL · Danh sách cân · Hàng hỏng · Sản lượng · Nhập kho TP · Nhật ký chạy máy · Phiếu giao ca · Dừng máy

**Keep-alive:** tab đã mở giữ mounted (`hidden` khi không active) — đổi tab không mất dữ liệu đã tải (đổi bộ lọc chung vẫn remount panel).

URL riêng từng danh sách (`/danh-sach-bao-cao-san-luong`, …) vẫn mở trang độc lập khi vào từ link/menu khác.

Tab **Lệnh sản xuất** nhúng `ProductionOrdersPanel` từ `src/features/lenh-sx/index.tsx`, dùng bộ lọc chung và quyền `production-orders`; giữ mounted khi đổi tab.

Tab **Nhật ký công việc** (`work-diary`, đứng ngay sau Lệnh SX) nhúng `src/features/nhat-ky-cong-viec/index.tsx`: gộp dòng từ **Lệnh SX** (nhân sự theo vai trò · công việc = lệnh/máy/mã hàng · giờ `ngay_gio_bat_dau`→`ngay_gio_ket_thuc`) và **Phân công CV** (`phan_cong_cv` · giờ theo khung ca `cai_dat_thoi_gian`). Cột **Sản lượng** / **Lỗi hỏng** lấy tổng `so_luong` từ `bao_cao_nghiem_thu` khớp **ngày · ca · máy** (Thành phẩm/Gia công vs SP lỗi/SP rác). Bộ lọc chung: ngày/ca/tìm; máy chỉ lọc dòng nguồn Lệnh SX. Route riêng `/nhat-ky-cong-viec` mở hub với tab này.
