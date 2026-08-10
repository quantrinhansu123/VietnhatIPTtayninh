# control_board (bảng điều khiển)

Tab `control-board` → `/bang-dieu-khien` — **đọc nhiều bảng**, không có bảng riêng.

Tab `dashboard` → `/phan-tich` — cùng **Báo cáo tổng hợp máy BB** (`ControlBoardPanel` `mode="report-only"`), không dùng `AnalyticsDashboard` / bảng `reports` legacy.

## UI

| File | Vai trò |
|------|---------|
| `src/features/control-board/index.tsx` | Panel bảng điều khiển (+ `mode="report-only"` cho `/phan-tich`) |
| `src/features/dashboard/index.tsx` | Re-export; routing `/phan-tich` qua `App.tsx` |
| `ControlBoardShiftSummaryTable.tsx` | Bảng tổng hợp ca |
| `ControlBoardBbMachineReportTable.tsx` | Báo cáo tổng hợp máy BB (lệnh SX, xuất kho, tồn đầu ca, lỗi hỏng, tồn cuối ca, phiếu nhập kho, thực dùng, tổng, tỉ lệ trộn, đánh giá hao hụt) |
| `ControlBoardBbMachineReportPrintSheet.tsx` | Mẫu in báo cáo tổng hợp máy BB (gồm mục 2 thành phẩm đạt nhập kho) |
| `ControlBoardShiftSummaryChart.tsx` | Biểu đồ tổng hợp ca |
| `ControlBoardShiftDetailModal.tsx` | Chi tiết ca |
| `ControlBoardShiftSummaryPrintSheet.tsx` | In tổng hợp |

## Utils

| File | Vai trò |
|------|---------|
| `controlBoardShiftSummary.ts` | Tổng hợp theo ca từ phiếu cân, kho, NVL |
| `controlBoardBbMachineReport.ts` | Dòng lệnh SX máy BB + xuất kho NVL theo ngày/ca |

## Bảng liên quan

`phieu_can_dinh_ki`, `kho_nvl`, `phieu_xuat_nhap_kho`, `ke_hoach_san_xuat`, `lenh_sx`, `nhan_su`, `don_hang`, `san_pham`, `danh_sach_may`

Khi sửa bảng điều khiển: đọc manifest từng bảng con trước.
