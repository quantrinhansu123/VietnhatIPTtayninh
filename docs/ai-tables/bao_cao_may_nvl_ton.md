# bao_cao_may_nvl_ton

| **Bảng** | `bao_cao_may_nvl_ton` |
| **Tab** | `machine-nvl-report`, `machine-nvl-report-list` |
| **SQL** | `supabase-bao-cao-may-nvl-ton.sql`, `supabase-bao-cao-may-nvl-ton-loai.sql` |

**API:** `server.ts` 5478–5600  
**Feature:** `src/features/bao-cao-may-nvl-ton/index.tsx` — `MachineNvlReportPanel`  
**Components:** `MachineNvlPrintSheet.tsx`, `MachineNvlReportListView.tsx`  
**Utils:** `utils/machineNvlReports.ts`  
**App:** `src/App.tsx` — import + route tab (shell, không đọc logic)

Loại báo cáo: tồn đầu ca, tồn cuối ca.

**Danh sách:** `/danh-sach-bao-cao-may-nvl-ton` (`MachineNvlReportListView`) có **2 tab**:
- Báo cáo tồn đầu ca
- Báo cáo tồn cuối ca

**Tự điền đầu ca:** Nút **Tự điền tồn đầu ca** mở modal lọc Ngày/Ca/Máy (mặc định trống) → chọn phiếu tồn cuối ca trong sổ xuống → **Điền vào form**.
