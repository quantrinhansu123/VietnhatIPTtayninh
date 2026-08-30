# control_board (bảng điều khiển)

Tab `control-board` → `/bang-dieu-khien` — **đọc nhiều bảng**, không có bảng riêng.

Tab `dashboard` / `dashboard-auto` → `/phan-tich-tu-dong` — thẻ **Báo cáo mới** trên `/quan-tri`. Route cũ `/phan-tich` đã bỏ, mở sẽ chuyển sang `/phan-tich-tu-dong`. Ô **Trọng lượng xuất** khớp footer phiếu xuất kho NVL: **Tổng nhựa** = Σ cột Quy về kg mọi dòng ĐVT = kg (kể cả túi); **vật tư khác** = Σ Quy về kg dòng ĐVT ≠ kg (lõi); dòng không quy được kg không cộng. Tab **Dữ liệu trong phiếu xuất kho** đã **bỏ khỏi UI** (dữ liệu xuất vẫn tính trong snapshot/KPI). Cột **Xuất trong ngày** (mục in) vẫn gom phiếu xuất NVL theo ngày, không theo ca. `/phan-tich-tu-dong` lấy lệnh/xuất của **mọi máy**. Bộ lọc **Ngày = Tất cả** tải mọi bản ghi (kể cả không có Ngày / không chênh lệch); **Theo khoảng** lọc Từ ngày → Đến ngày. Trên `/phan-tich-tu-dong`, **Lệnh SX** tự chọn theo **Ngày + Ca** (+ **Máy** nếu đã chọn); dropdown chỉ liệt kê lệnh khớp bucket.

## UI

| File | Vai trò |
|------|---------|
| `src/features/control-board/index.tsx` | Panel bảng điều khiển (+ `mode="report-only"` cho `/phan-tich`) |
| `src/components/ControlBoardCommonFilters.tsx` | Bộ lọc chung: **Ngày** (Tất cả / Theo khoảng) · Ca · Máy · Lệnh SX |
| `src/features/dashboard/index.tsx` | Re-export; routing `/phan-tich` qua `App.tsx` |
| `ControlBoardShiftSummaryTable.tsx` | Bảng tổng hợp ca |
| `ControlBoardBbMachineReportTable.tsx` | Báo cáo tổng hợp máy BB (lệnh SX, xuất kho, tồn đầu ca, **tab lỗi hỏng từ Báo cáo sản lượng · Hàng hỏng + Hàng rác**, tồn cuối ca, phiếu nhập kho, thực dùng, tổng, tỉ lệ trộn, đánh giá hao hụt). `/phan-tich-tu-dong`: tab **Dữ liệu cân thực tế** = bảng `can_tu_dong_tong_hop` (Số cuộn + Tổng TL, không load từng phiếu `can_tu_dong`); tab **Báo cáo sản lượng** = phiếu `bao_cao_nghiem_thu` (`sanLuongGroups`) |
| `ReportListsHubModal.tsx` | Modal lớn trên `/phan-tich`: tab = mục `/danh-sach-bao-cao`, bên dưới = list view tương ứng |
| `ControlBoardBbMachineReportPrintSheet.tsx` | Mẫu in báo cáo tổng hợp máy BB (gồm mục 2 thành phẩm đạt nhập kho + lý do từng dòng) |
| `ControlBoardShiftSummaryChart.tsx` | Biểu đồ tổng hợp ca |
| `ControlBoardShiftDetailModal.tsx` | Chi tiết ca |
| `ControlBoardShiftSummaryPrintSheet.tsx` | In tổng hợp |

## Bảng liên quan thêm

- [bao_cao_may_nvl_ton.md](./bao_cao_may_nvl_ton.md) — tồn đầu/cuối ca; `/phan-tich-tu-dong` (`includeAllMachines`) khớp phiếu tồn theo ngày + ca + máy **mọi máy** (vd Máy cách nhiệt), không chỉ Bao Bì.
- [can_tu_dong_tong_hop.md](./can_tu_dong_tong_hop.md) — tab **Dữ liệu cân thực tế**: số cuộn + tổng trọng lượng, không load từng phiếu cân.
- [bb_bao_cao_ly_do.md](./bb_bao_cao_ly_do.md) — lý do giải trình in BB
- [bb_phan_tich_danh_gia.md](./bb_phan_tich_danh_gia.md) — phân tích đánh giá (tab Đánh giá) lưu Supabase
- [bb_giai_trinh.md](./bb_giai_trinh.md) — giải trình (tab Giải trình) lưu Supabase
- [bb_bao_cao_tinh_toan.md](./bb_bao_cao_tinh_toan.md) — snapshot báo cáo sau nút **Tính toán** (không tự tính mỗi lần mở trang)

## Utils

| File | Vai trò |
|------|---------|
| `controlBoardShiftSummary.ts` | Tổng hợp theo ca từ phiếu cân, kho, NVL |
| `controlBoardBbMachineReport.ts` | Dòng lệnh SX máy BB + xuất kho NVL theo **ngày + ca** (tab xuất kho); cột Xuất trong ngày vẫn theo ngày. Tab lệnh SX: cột **Trọng lượng nhựa + phụ gia (kg)** = thẳng `san_pham.trong_luong_nhua` trên `/kho-hang` |

## Bảng liên quan

`bao_cao_nghiem_thu`, `phieu_can_dinh_ki`, `kho_nvl`, `phieu_xuat_nhap_kho`, `ke_hoach_san_xuat`, `lenh_sx`, `nhan_su`, `don_hang`, `san_pham`, `danh_sach_may`

Khi sửa bảng điều khiển: đọc manifest từng bảng con trước.
