# bao_cao_may_nvl_ton

| **Bảng** | `bao_cao_may_nvl_ton` |
| **Tab** | `machine-nvl-report`, `machine-nvl-report-list` |
| **DB** | Riêng — label `ton` (`SUPABASE_TON_*`). Fallback DB chính nếu chưa cấu hình. |
| **SQL** | **`supabase-db-ton-kho.sql`** (bootstrap full DB tồn) · alias `supabase-full-ton.sql` · lẻ: `supabase-bao-cao-may-nvl-ton.sql`, `supabase-bao-cao-may-nvl-ton-loai.sql` |

**API:** `server.ts` — `/api/bao-cao-may-nvl-ton`  
**Feature:** `src/features/bao-cao-may-nvl-ton/index.tsx` — `MachineNvlReportPanel`  
**Components:** `MachineNvlPrintSheet.tsx`, `MachineNvlReportListView.tsx`  
**Utils:** `utils/machineNvlReports.ts`  
**App:** `src/App.tsx` — import + route tab (shell, không đọc logic)

Loại báo cáo: tồn đầu ca, tồn cuối ca.

**Env DB tồn:**
```
SUPABASE_TON_URL=...
SUPABASE_TON_SERVICE_KEY=...
SUPABASE_MACHINE_NVL_REPORTS_TABLE=bao_cao_may_nvl_ton
```

**Danh sách:** `/danh-sach-bao-cao-may-nvl-ton` (`MachineNvlReportListView`) có **2 tab**:
- Báo cáo tồn đầu ca
- Báo cáo tồn cuối ca

**Tự điền đầu ca:** Nút **Tự điền tồn đầu ca** mở modal lọc Ngày/Ca/Máy (mặc định trống) → chọn phiếu tồn cuối ca trong sổ xuống → **Điền vào form**.

**Chống trùng:** không lưu 2 phiếu cùng **ngày + ca + máy + loại** (đầu/cuối ca). Form và API (`409`) báo đỏ: «Đã lưu … Không lưu bản trùng.»
