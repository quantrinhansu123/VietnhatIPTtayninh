# bao_cao_hang_hong

| **Bảng** | `bao_cao_hang_hong` |
| **Tab** | `damaged-goods-report` |
| **SQL** | `supabase-bao-cao-hang-hong.sql` |

**API:** `server.ts` 5276–5282 — `registerWeighingSlipRoutes` với `/api/bao-cao-hang-hong`  
**UI:** Dùng chung `WeighingShiftSummary` + `WeighingReportForm` với config `DAMAGED_GOODS_SLIP_CONFIG` trong `weighingSlipConfig.ts`

**Chờ thủ kho duyệt:** `supabase-bao-cao-hang-hong-cho-thu-kho-duyet.sql` — tắt trigger nhập kho tự động. `GET /api/bao-cao-hang-hong/cho-nhap-kho` trả danh sách báo cáo chưa có phiếu nhập; chỉ khi thủ kho kiểm tra và lưu phiếu thì mới ghi `phieu_xuat_nhap_kho`, liên kết bằng `id_bao_cao_hang_hong`.

Cấu trúc giống phiếu cân ca.

**Form dòng (từ 2026-08):** không còn 5 ô kg cố định — dùng **Trạng thái vật tư** (sổ xuống) + **Đơn vị** + **Số lượng**. Khi ĐVT = kg vẫn ghi vào cột kg tương ứng để báo cáo BB.
