# phieu_bao_cao (hub nhập báo cáo)

| | |
|---|---|
| **Tab** | `report-forms` → `/phieu-bao-cao` |
| **UI** | Luôn dạng **tab** (không còn lưới thẻ) |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/report-forms/ReportFormsHub.tsx` | Tab strip + nhúng từng phiếu |
| `src/features/report-forms/index.tsx` | Export hub |
| `src/app/menus.tsx` | `REPORT_FORM_MENU_ITEMS` (nguồn tab) |
| `src/App.tsx` | `activeTab === 'report-forms'` → `<ReportFormsHub />` |

## Tab (theo quyền menu)

Báo cáo tồn · Bảng trộn · Báo cáo sản lượng · Phiếu giao ca · Dừng máy · Nhật ký chạy máy · Đối soát · Danh sách cân AI · Trạm cân AI · Cân kiểm kho

URL riêng từng phiếu (`/bao-cao-phoi-tron`, …) vẫn mở trang độc lập khi vào từ link/menu khác.
