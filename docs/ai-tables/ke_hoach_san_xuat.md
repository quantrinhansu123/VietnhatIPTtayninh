# ke_hoach_san_xuat

| **Bảng** | `ke_hoach_san_xuat` + `ke_hoach_san_xuat_dong` |
| **Tab** | `production-plan-history` → `/ke-hoach-san-xuat` |
| **SQL** | `supabase-ke-hoach-sx.sql`, `supabase-ke-hoach-san-xuat.sql` |

**API:** `server.ts` 6842–7070 — `GET/PUT /api/ke-hoach-sx`
**UI:** `src/features/ke-hoach-san-xuat/` (+ lịch sử/shell trong `src/App.tsx` nếu còn)  
**Components:** `ProductionPlanNvlPrintSheet.tsx`, `ControlBoardShiftSummaryTable.tsx`  
**Utils:** `controlBoardShiftSummary.ts`, `controlBoardShiftSummaryDetails.ts`

**Modal tạo kế hoạch:** tick chọn lệnh SX (không tự lấy tất cả); chỉ hiện lệnh đúng **Ngày kế hoạch** và chưa nằm trong KH đã lưu (`GET /api/ke-hoach-sx?usedLenhSx=1`).
