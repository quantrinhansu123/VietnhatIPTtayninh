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
| `ControlBoardBbMachineReportTable.tsx` | Báo cáo tổng hợp máy BB (lệnh SX, xuất kho, tồn đầu ca, **tab lỗi hỏng từ Báo cáo sản lượng · Hàng hỏng + Hàng rác**, tồn cuối ca, phiếu nhập kho, thực dùng, tổng, tỉ lệ trộn, **tab 4.1. Tổng hợp** (`summaryRows`), đánh giá hao hụt). `/phan-tich-tu-dong`: tab **Dữ liệu cân thực tế** = bảng `can_tu_dong_tong_hop` (Số cuộn + Tổng TL, không load từng phiếu `can_tu_dong`); tab **Báo cáo sản lượng** = phiếu `bao_cao_nghiem_thu` (`sanLuongGroups`) |
| `ReportListsHubModal.tsx` | Modal lớn trên `/phan-tich`: tab = mục `/danh-sach-bao-cao`, bên dưới = list view tương ứng |
| `ControlBoardBbMachineReportPrintSheet.tsx` | Mẫu in BB — **chỉ mirror** tab thành phẩm / tiêu hao NVL / đánh giá (`thucDungGroups`, `summaryRows`); không tính lại mục 3–4.1 |
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
- [bc_lsx.md](./bc_lsx.md) — bảng riêng tab **Dữ liệu trong lệnh sản xuất** (`bc_lsx` / UI `bc_Lsx`), ghi cùng lúc Tính toán
- [du_lieu_xuat_kho.md](./du_lieu_xuat_kho.md) — bảng riêng tab **Dữ liệu xuất kho**, ghi cùng lúc Tính toán
- [bao_cao_du_lieu_ton_dau_ca.md](./bao_cao_du_lieu_ton_dau_ca.md) — bảng riêng tab **Báo cáo dữ liệu tồn đầu ca** (khác `bao_cao_may_nvl_ton`), ghi cùng lúc Tính toán
- [bao_cao_san_luong.md](./bao_cao_san_luong.md) — bảng riêng tab **Báo cáo sản lượng** (khác `bao_cao_nghiem_thu` / `bao_cao_san_luong_nvl_dinh_muc`)
- [du_lieu_trong_bao_cao_hang_loi_hong.md](./du_lieu_trong_bao_cao_hang_loi_hong.md) — bảng riêng tab **Dữ liệu trong báo cáo hàng lỗi hỏng** (khác `bao_cao_hang_hong`)
- [du_lieu_trong_bao_cao_kiem_ton_cuoi_ca.md](./du_lieu_trong_bao_cao_kiem_ton_cuoi_ca.md) — bảng riêng tab **Kiểm tồn cuối ca** (khác `bao_cao_may_nvl_ton`)
- [bao_cao_thanh_pham_dat_nhap_kho.md](./bao_cao_thanh_pham_dat_nhap_kho.md) — bảng riêng tab **Thành phẩm đạt nhập kho**
- [bao_cao_tieu_hao_nguyen_vat_lieu.md](./bao_cao_tieu_hao_nguyen_vat_lieu.md) — bảng riêng tab **Tiêu hao nguyên vật liệu**
- [bao_cao_tong_hop.md](./bao_cao_tong_hop.md) — snapshot khối KPI **Báo cáo tổng hợp** + **Tổng hợp nhựa** (1 dòng / khóa)

## Utils

| File | Vai trò |
|------|---------|
| `controlBoardShiftSummary.ts` | Tổng hợp theo ca từ phiếu cân, kho, NVL |
| `controlBoardBbMachineReport.ts` | Dòng lệnh SX máy BB + xuất kho NVL theo **ngày + ca** (tab xuất kho); cột Xuất trong ngày vẫn theo ngày. Tab lệnh SX: cột **Trọng lượng nhựa + phụ gia (kg)** = thẳng `san_pham.trong_luong_nhua` trên `/kho-hang` |
| `bbTieuHaoNvlPrintRows.ts` | Tiêu hao NVL (nhập TP + lỗi + chênh lệch) lưu vào snapshot tab `bao_cao_tieu_hao_nvl` |

## Bảng liên quan

`bao_cao_nghiem_thu`, `phieu_can_dinh_ki`, `kho_nvl`, `phieu_xuat_nhap_kho`, `ke_hoach_san_xuat`, `lenh_sx`, `nhan_su`, `don_hang`, `san_pham`, `danh_sach_may`

Khi sửa bảng điều khiển: đọc manifest từng bảng con trước.
