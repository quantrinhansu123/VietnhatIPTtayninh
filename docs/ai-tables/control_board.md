# control_board (bảng điều khiển)

Tab `control-board` → `/bang-dieu-khien` — **đọc nhiều bảng**, không có bảng riêng.

Tab `dashboard` → `/phan-tich` — cùng **Báo cáo tổng hợp máy BB** (`ControlBoardPanel` `mode="report-only"`), không dùng `AnalyticsDashboard` / bảng `reports` legacy.

Tab `dashboard-auto` → `/phan-tich-tu-dong` — thẻ **Báo cáo mới** trên `/quan-tri`. Ô **Trọng lượng xuất** khớp footer phiếu xuất kho NVL: **Tổng nhựa** = Σ cột Quy về kg mọi dòng ĐVT = kg (kể cả túi); **vật tư khác** = Σ Quy về kg dòng ĐVT ≠ kg (lõi); dòng không quy được kg không cộng. Tab phiếu xuất lấy `phieu_xuat_nhap_kho` (xuất NVL) khớp **ngày + ca + máy**. `/phan-tich-tu-dong` lấy lệnh/xuất của **mọi máy**. Bộ lọc **Ngày = Tất cả** tải mọi bản ghi (kể cả không có Ngày / không chênh lệch); **Theo khoảng** lọc Từ ngày → Đến ngày.

## UI

| File | Vai trò |
|------|---------|
| `src/features/control-board/index.tsx` | Panel bảng điều khiển (+ `mode="report-only"` cho `/phan-tich`) |
| `src/components/ControlBoardCommonFilters.tsx` | Bộ lọc chung: **Ngày** (Tất cả / Theo khoảng) · Ca · Máy · Lệnh SX |
| `src/features/dashboard/index.tsx` | Re-export; routing `/phan-tich` qua `App.tsx` |
| `ControlBoardShiftSummaryTable.tsx` | Bảng tổng hợp ca |
| `ControlBoardBbMachineReportTable.tsx` | Báo cáo tổng hợp máy BB (lệnh SX, xuất kho, tồn đầu ca, lỗi hỏng, tồn cuối ca, phiếu nhập kho, thực dùng, tổng, tỉ lệ trộn, đánh giá hao hụt) |
| `ReportListsHubModal.tsx` | Modal lớn trên `/phan-tich`: tab = mục `/danh-sach-bao-cao`, bên dưới = list view tương ứng |
| `ControlBoardBbMachineReportPrintSheet.tsx` | Mẫu in báo cáo tổng hợp máy BB (gồm mục 2 thành phẩm đạt nhập kho + lý do từng dòng) |
| `ControlBoardShiftSummaryChart.tsx` | Biểu đồ tổng hợp ca |
| `ControlBoardShiftDetailModal.tsx` | Chi tiết ca |
| `ControlBoardShiftSummaryPrintSheet.tsx` | In tổng hợp |

## Bảng liên quan thêm

- [bao_cao_may_nvl_ton.md](./bao_cao_may_nvl_ton.md) — tồn đầu/cuối ca; `/phan-tich-tu-dong` (`includeAllMachines`) khớp phiếu tồn theo ngày + ca + máy **mọi máy** (vd Máy cách nhiệt), không chỉ Bao Bì.
- [bb_bao_cao_ly_do.md](./bb_bao_cao_ly_do.md) — lý do giải trình in BB
- [bb_phan_tich_danh_gia.md](./bb_phan_tich_danh_gia.md) — phân tích đánh giá (tab Đánh giá) lưu Supabase
- [bb_bao_cao_tinh_toan.md](./bb_bao_cao_tinh_toan.md) — snapshot báo cáo sau nút **Tính toán** (không tự tính mỗi lần mở trang)

## Utils

| File | Vai trò |
|------|---------|
| `controlBoardShiftSummary.ts` | Tổng hợp theo ca từ phiếu cân, kho, NVL |
| `controlBoardBbMachineReport.ts` | Dòng lệnh SX máy BB + xuất kho NVL theo ngày/ca |

## Bảng liên quan

`bao_cao_nghiem_thu`, `phieu_can_dinh_ki`, `kho_nvl`, `phieu_xuat_nhap_kho`, `ke_hoach_san_xuat`, `lenh_sx`, `nhan_su`, `don_hang`, `san_pham`, `danh_sach_may`

Khi sửa bảng điều khiển: đọc manifest từng bảng con trước.
