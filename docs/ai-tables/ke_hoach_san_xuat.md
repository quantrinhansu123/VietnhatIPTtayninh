# ke_hoach_san_xuat

| **Bảng** | `ke_hoach_san_xuat` + `ke_hoach_san_xuat_dong` |
| **Tab** | `production-plan-history` → `/ke-hoach-san-xuat` |
| **SQL** | `supabase-ke-hoach-sx.sql`, `supabase-ke-hoach-san-xuat.sql` |

**API:** `server.ts` 4200–4360 — `GET/PUT /api/ke-hoach-sx`  
**UI:** `src/features/ke-hoach-san-xuat/` (+ lịch sử/shell trong `src/App.tsx` nếu còn)  
**Components:** `ProductionPlanNvlPrintSheet.tsx`, `ControlBoardShiftSummaryTable.tsx`  
**Utils:** `controlBoardShiftSummary.ts`, `controlBoardShiftSummaryDetails.ts`

**Modal tạo kế hoạch:** bảng lệnh chỉ hiện lệnh SX có `startDate` trùng **Ngày kế hoạch**; đổi ngày → danh sách cập nhật theo ngày.
