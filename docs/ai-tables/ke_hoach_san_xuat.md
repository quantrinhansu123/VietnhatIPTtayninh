# ke_hoach_san_xuat

| **Bảng** | `ke_hoach_san_xuat` + `ke_hoach_san_xuat_dong` |
| **Tab** | `production-plan-history` → `/ke-hoach-san-xuat` |
| **SQL** | `supabase-ke-hoach-sx.sql`, `supabase-ke-hoach-san-xuat.sql` |

**API:** `server.ts` — `GET/PUT /api/ke-hoach-sx` · `GET ?with_lines=1` gom dòng kế hoạch 1 lần (KHCV, tránh N+1 `?id=`)
**UI:** `src/features/ke-hoach-san-xuat/` (+ lịch sử/shell trong `src/App.tsx` nếu còn)  
**Components:** `ProductionPlanNvlPrintSheet.tsx`, `ControlBoardShiftSummaryTable.tsx`, `ProductionPlanBoardSheet.tsx` (bảng KHSX theo máy + in A3 ngang)  
**Utils:** `controlBoardShiftSummary.ts`, `controlBoardShiftSummaryDetails.ts`, `productionPlanBoard.ts` (dựng ma trận cột máy × dòng ca)

**Modal tạo kế hoạch:** tick chọn lệnh SX (không tự lấy tất cả); chỉ hiện lệnh đúng **Ngày kế hoạch** khớp cột `lenh_sx.ngay` (không dùng `ngay_bat_dau`) và chưa nằm trong KH đã lưu (`GET /api/ke-hoach-sx?usedLenhSx=1`).

**UI chung:** `/ke-hoach-san-xuat` hiện **cùng lúc** Kế hoạch SX (trên) + Kế hoạch CV (dưới), lọc ngày dùng chung.

**Chọn ca lẻ:** modal lập KH SX cho phép nhiều dòng **Ngày · Ca** (vd. 12C2 hôm nay + 12C1 ngày mai); lệnh SX hiện theo khớp từng ô.

**Kế hoạch CV:** section `PhanCongCvPanel` (`phan_cong_cv`, `GET/PUT /api/phan-cong-cv` theo Ngày + Ca).

**Bảng theo máy / KHCV (mẫu Excel nhà máy):** section "Kế hoạch SX theo máy (KHCV)" trên `/ke-hoach-san-xuat` — cột = máy, khối I = lao động, khối II = lệnh SX theo ca; nội dung ô ghép tự động từ lệnh SX + SP. **Chọn nhiều lệnh / nhiều ngày:** theo bộ lọc Ngày hoặc Từ–Đến, tick lệnh đưa vào bảng rồi xem / **In bảng A3** (420×297mm landscape).

**In chi tiết kế hoạch:** tick lệnh + tùy chọn **In kèm KHCV** (sau khi in phiếu lệnh sẽ in bảng máy từ các dòng đang in).

**Nghiệm thu:** nút trên từng dòng chi tiết (và thao tác trong modal) mở `/bao-cao-san-luong` với prefill ngày · ca · máy của lệnh.
