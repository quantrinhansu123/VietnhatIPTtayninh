# bao_cao_hang_hong

| **Bảng** | `bao_cao_hang_hong` |
| **Tab** | `damaged-goods-report` |
| **SQL** | `supabase-bao-cao-hang-hong.sql` |

**API:** `server.ts` 5276–5282 — `registerWeighingSlipRoutes` với `/api/bao-cao-hang-hong`  
**UI:** Dùng chung `WeighingShiftSummary` + `WeighingReportForm` với config `DAMAGED_GOODS_SLIP_CONFIG` trong `weighingSlipConfig.ts`

**Chờ thủ kho duyệt:** `supabase-bao-cao-hang-hong-cho-thu-kho-duyet.sql` — tắt trigger nhập kho tự động. `GET /api/bao-cao-hang-hong/cho-nhap-kho` trả danh sách báo cáo chưa có phiếu nhập; chỉ khi thủ kho kiểm tra và lưu phiếu thì mới ghi `phieu_nhap`/`nhap_kho`.

Cấu trúc giống phiếu cân ca.

**Form dòng (từ 2026-08):** không còn 5 ô kg cố định — dùng **Trạng thái vật tư** (sổ xuống) + **Đơn vị** + **Số lượng**. Khi ĐVT = kg vẫn ghi vào cột kg tương ứng để báo cáo BB.

**Tổng hợp trên `/danh-sach-bao-cao-hang-hong`:** ngoài phiếu `bao_cao_hang_hong`, danh sách gộp thêm dòng **Hàng lỗi hỏng nhập kho** từ Báo cáo sản lượng (`bao_cao_nghiem_thu`, `loai_vat_tu` = SP lỗi / SP rác) theo ngày·ca·máy. Dòng tổng hợp (id `sl-hh-…`) chỉ xem/in — sửa/xóa tại `/danh-sach-bao-cao-san-luong`.
