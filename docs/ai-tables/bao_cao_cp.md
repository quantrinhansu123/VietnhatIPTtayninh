# bao_cao_cp (hub Báo cáo CP)

| | |
|---|---|
| **Tab** | `/danh-sach-bao-cao` → **Báo cáo CP** (`bao-cao-cp`) |
| **Nguồn** | Snapshot `bb_bao_cao_tinh_toan.payload.danhGiaGroups[].summaryRows` |
| **SQL riêng** | Không — không tạo bảng mới |

Hai bảng chi phí (CP) theo NVL và bảng thời gian năng suất công nhân:

1. **Lỗ hàng lỗi hỏng** — `tienLoDoHangLoi` = Lỗi hỏng (kg) × Đơn giá  
2. **Lỗ vận hành** — `thanhTien` = Chênh lệch (TX − ĐM) × Đơn giá  

3. **Lỗ năng suất công nhân** — nguồn `payload.orderGroups[].lines`: gộp ngày · ca · máy, TG chuẩn/cuộn = phút ca / Σ SL LSX; lãi/lỗ phút = (Σ SL thực tế − Σ SL LSX) × TG chuẩn. Âm lỗ, dương lãi. Khung giờ từ `/api/cai-dat` (`cai_dat_thoi_gian`), hỗ trợ ca qua đêm; chưa trừ giờ nghỉ, không nhân số người. Thiếu giờ/SL kế hoạch → không tính, hiện cảnh báo. Không dùng khoảng cách giữa lần cân. Không tạo bảng DB mới.

Đơn giá từ Bảng giá NVL lúc **Tính toán** BB. Bộ lọc chung hub (ngày · ca · máy · tìm) áp dụng client.

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/bao-cao-cp/index.tsx` | Tab Báo cáo CP — 2 bảng + KPI tổng |
| `src/features/bao-cao-cp/extractCpRows.ts` | Trích `summaryRows` (id=`nvl`) từ snapshot |
| `src/features/report-lists/ReportListsHub.tsx` | Tab id `bao-cao-cp` |

Cần bấm **Tính toán** trên Báo cáo theo LSX trước khi có số.
