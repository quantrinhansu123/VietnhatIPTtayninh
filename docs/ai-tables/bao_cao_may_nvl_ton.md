# bao_cao_may_nvl_ton

| **Bảng** | `bao_cao_may_nvl_ton` |
| **Tab** | `machine-nvl-report`, `machine-nvl-report-list` |
| **DB** | Riêng — label `ton` (`SUPABASE_TON_*`). Fallback DB chính nếu chưa cấu hình. |
| **SQL** | **`supabase-db-ton-kho.sql`** (bootstrap full DB tồn) · alias `supabase-full-ton.sql` · lẻ: `supabase-bao-cao-may-nvl-ton.sql`, `supabase-bao-cao-may-nvl-ton-loai.sql` |

**API:** `server.ts` — `/api/bao-cao-may-nvl-ton`  
**Feature:** `src/features/bao-cao-may-nvl-ton/index.tsx` — `MachineNvlReportPanel`  
**Hub:** `/phieu-bao-cao` → `src/features/report-forms/ReportFormsHub.tsx` (lazy tab; mặc định tồn máy-NVL)  
**Components:** `MachineNvlPrintSheet.tsx`, `MachineNvlReportListView.tsx`  
**Utils:** `utils/machineNvlReports.ts`  
**App:** `src/App.tsx` — import + route tab (shell, không đọc logic)

**Tải form (nhanh):** mở UI sau máy + ca; song song `GET /api/kho-nvl?light=1` (cache 60s), `GET /api/lenh-sx?light=1`, sổ đầu/cuối `limit=100`.

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

**Tự điền đầu ca (logic cũ, giữ nguyên):** Nút **Tự điền tồn đầu ca** → chọn phiếu **tồn cuối ca** trước → kế thừa mã NVL / SL sang form đầu ca.

**Tự điền cuối ca:** Nút **Tự điền tồn cuối ca** → lấy danh sách NVL từ **phiếu tồn đầu ca** cùng **Ngày · Ca** (**không** lọc máy; gộp mọi máy) — SL đầu ca làm tham chiếu, SL vị trí để trống để kiểm kê. Ảnh từng dòng tùy chọn ở cả hai loại; không có ảnh vẫn lưu được.

**Chống trùng:** không lưu 2 phiếu cùng **ngày + ca + máy + loại** (đầu/cuối ca). Form và API (`409`) báo đỏ: «Đã lưu … Không lưu bản trùng.»

**NVL trộn:** ĐVT **kg** hoặc **Lít** (và mã `NHUA*` / `NVLK*`) → nhóm trộn; Cái/Cuộn/m2 → không trộn. Cùng quy tắc trên báo cáo máy BB (tồn đầu/cuối, lỗi hỏng, phiếu in 3.1).
