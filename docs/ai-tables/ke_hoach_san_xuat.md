# ke_hoach_san_xuat

| **Bảng** | `ke_hoach_san_xuat` + `ke_hoach_san_xuat_dong` |
| **Tab** | `production-plan-history` → `/ke-hoach-san-xuat` |
| **SQL** | `supabase-ke-hoach-sx.sql`, `supabase-ke-hoach-san-xuat.sql` |

**API:** `server.ts` 6842–7070 — `GET/PUT /api/ke-hoach-sx`
**UI:** `src/features/ke-hoach-san-xuat/` (+ lịch sử/shell trong `src/App.tsx` nếu còn)  
**Components:** `ProductionPlanNvlPrintSheet.tsx`, `ControlBoardShiftSummaryTable.tsx`  
**Utils:** `controlBoardShiftSummary.ts`, `controlBoardShiftSummaryDetails.ts`

**Modal tạo kế hoạch:** tick chọn lệnh SX (không tự lấy tất cả); chỉ hiện lệnh đúng **Ngày kế hoạch** khớp cột `lenh_sx.ngay` (không dùng `ngay_bat_dau`) và chưa nằm trong KH đã lưu (`GET /api/ke-hoach-sx?usedLenhSx=1`).

**Kế hoạch CV:** chọn Loại = **Kế hoạch CV** → section `PhanCongCvPanel` (`phan_cong_cv`, `GET/PUT /api/phan-cong-cv` theo Ngày + Ca).
