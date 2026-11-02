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

## Tab (theo quyền menu)

Báo cáo tồn · Phiếu nhận NVL · Trộn NVL · Danh sách cân · Hàng hỏng · Sản lượng · Nhập kho TP · Nhật ký chạy máy · Phiếu giao ca · Dừng máy

**Keep-alive:** tab đã mở giữ mounted (`hidden` khi không active) — đổi tab không mất dữ liệu đã tải (đổi bộ lọc chung vẫn remount panel).

URL riêng từng danh sách (`/danh-sach-bao-cao-san-luong`, …) vẫn mở trang độc lập khi vào từ link/menu khác.
