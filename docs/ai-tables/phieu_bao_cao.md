# phieu_bao_cao (hub nhập báo cáo)

| | |
|---|---|
| **Tab** | `report-forms` → `/phieu-bao-cao` |
| **UI** | Luôn dạng **tab** (không còn lưới thẻ) |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/report-forms/ReportFormsHub.tsx` | Tab strip + nhúng từng phiếu + Provider header chung |
| `src/features/report-forms/ReportFormsSharedContext.tsx` | State chung: ngày, giờ, ca, chi nhánh, máy, nhân sự (multi-tick LSX), ghi chú |
| `src/features/report-forms/ReportFormsSharedHeader.tsx` | Thanh điền trên tablist |
| `src/features/report-forms/index.tsx` | Export hub + shared hooks |
| `src/app/menus.tsx` | `REPORT_FORM_MENU_ITEMS` (nguồn tab) |
| `src/App.tsx` | `activeTab === 'report-forms'` → `<ReportFormsHub />` |

## Header chung

- Nằm **phía trên** tab strip; áp dụng khi đổi tab phiếu.
- **Ẩn** với 2 tab cân AI: `can-tu-dong` (Danh sách cân AI), `can-tu-dong-entry` (Trạm cân AI).
- Hợp field: Ngày · Giờ · Ca · Chi nhánh · Máy · Nhân sự (tick nhiều theo ngày+ca+máy / LSX) · Ghi chú.
- Form trong hub: `useReportFormsSharedOptional()` → sync state + ẩn header local trùng; route độc lập giữ header riêng.
- **Keep-alive tab:** tab đã mở giữ mounted (`hidden` khi không active) — đổi tab **không** mất draft chưa lưu; chỉ tải lazy lần đầu mở từng tab.

## Tab (theo quyền menu)

Báo cáo tồn · Nhận VT · Bảng trộn · Báo cáo sản lượng · Phiếu giao ca · Dừng máy · Nhật ký chạy máy · Đối soát · Danh sách cân AI · Trạm cân AI · Cân kiểm kho · Trả kho NVL

URL riêng từng phiếu (`/bao-cao-phoi-tron`, …) vẫn mở trang độc lập khi vào từ link/menu khác.
