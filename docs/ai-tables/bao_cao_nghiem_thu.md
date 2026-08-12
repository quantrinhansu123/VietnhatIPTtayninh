# bao_cao_nghiem_thu

| **Bảng** | `bao_cao_nghiem_thu` |
| **Tab** | `acceptance-report`, `acceptance-report-list` |
| **SQL** | `supabase-bao-cao-nghiem-thu.sql` |

**API:** `server.ts` 5708–5833  
**Components (đã tách):**
- `AcceptanceReportForm.tsx`
- `AcceptanceReportListView.tsx`
- `AcceptanceReportPrintSheet.tsx`

Route alias: `/bao-cao-nghiem-thu` → tab `acceptance-report`

Tab **Báo cáo sản lượng** trên `/phan-tich` và `/phan-tich-tu-dong` lấy phiếu này theo **ngày + ca + máy** (`buildBbSanLuongGroups`).

## Menu

- QC `/nha-may/qc` → card **Kiểm tra kho thành phẩm** → `acceptance-report-list`
- Công nhân → Nhập báo cáo ca → `acceptance-report` / danh sách → `acceptance-report-list`
