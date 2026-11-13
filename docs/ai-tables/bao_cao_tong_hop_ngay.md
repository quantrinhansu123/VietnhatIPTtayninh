# bao_cao_tong_hop_ngay

| | |
|---|---|
| Nguồn | bao_cao_tong_hop — tổng hợp khi đọc, không tạo bảng mới |
| UI | Quản trị / Quản Đốc → Báo cáo ngày · /bao-cao-ngay |
| SQL | supabase-bao-cao-tong-hop.sql |
| API | GET /api/bao-cao-tong-hop · ngay_tu, ngay_den, limit=1000 |

## Feature

- src/features/bao-cao-ngay/index.tsx — trang báo cáo ngày.
- src/features/bao-cao-ngay/Summary.tsx — KPI; tỷ lệ tính từ tổng, thiếu dữ liệu hiển thị dấu —.
- src/features/bieu-do-th/index.tsx — tải dữ liệu, lọc ngày/ca/máy/trưởng ca, chế độ daily.
- src/features/bieu-do-th/comparisonData.ts — comparisonRows: chỉ ngày đơn, ca/máy cụ thể; chọn updated_at mới nhất.
- src/features/bieu-do-th/TongHopTreeTable.tsx — mở rộng Ngày → Ca → Máy, mở chi tiết tính toán.
- src/features/bieu-do-th/staffEnrichment.ts — bổ sung trưởng ca từ lệnh SX.

Chỉ đọc snapshot đã lưu khi Tính toán. Cảnh báo khi chạm giới hạn 1.000 bản ghi; thu hẹp bộ lọc để xem đầy đủ.
