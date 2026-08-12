# bao_cao_hang_hong

| **Bảng** | `bao_cao_hang_hong` |
| **Tab** | `damaged-goods-report` |
| **SQL** | `supabase-bao-cao-hang-hong.sql` |

**API:** `server.ts` 5276–5282 — `registerWeighingSlipRoutes` với `/api/bao-cao-hang-hong`  
**UI:** Dùng chung `WeighingShiftSummary` + `WeighingReportForm` với config `DAMAGED_GOODS_SLIP_CONFIG` trong `weighingSlipConfig.ts`

**Tự động nhập kho:** `supabase-bao-cao-hang-hong-tu-dong-nhap-kho.sql` — trigger đồng bộ từng dòng báo cáo sang phiếu nhập `Kho hàng hỏng` (`loai_kho=hang_hong`); sửa/xóa báo cáo cũng sửa/xóa dòng kho nguồn.

Cấu trúc giống phiếu cân ca.

**Form dòng (từ 2026-08):** không còn 5 ô kg cố định — dùng **Trạng thái vật tư** (sổ xuống) + **Đơn vị** + **Số lượng**. Khi ĐVT = kg vẫn ghi vào cột kg tương ứng để báo cáo BB.
