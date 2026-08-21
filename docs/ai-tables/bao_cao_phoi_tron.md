# bao_cao_phoi_tron



| **Bảng** | `bao_cao_phoi_tron` |

| **Tab** | `mixing-report`, `mixing-report-list` |

| **SQL** | `supabase-bao-cao-phoi-tron.sql` |



**API:** `server.ts` 5284–5476  

**Components (đã tách):**

- `MixingReportForm.tsx` — nhập báo cáo

- `MixingReportListView.tsx` — danh sách phiếu phối trộn theo ngày · ca · máy / lần

- `MixingReportPrintSheet.tsx` — in (gộp phiếu cùng ngày · ca · máy thành **1 bảng / 1 nhật ký**)

- `MixingOrderAutofillModal.tsx` — autofill theo đơn hàng

- `MixingProductionOrderAutofillModal.tsx` — nút **Tự động điền** NVL theo Lệnh SX (ngày · ca · máy) trong từng Lần



**Utils:** `lib/mixingReportModel.ts`, `utils/mixingOrderAutofill.ts`, `utils/mixingNormSuggestion.ts`



**Gợi ý định mức QC:** Form `/bao-cao-phoi-tron` khi chọn Ngày + Ca sẽ tải `/api/bang-tron-vat-tu-dinh-muc?ngay&ca` và hiện phiếu định mức QC để **Áp dụng** (đổ NVL gộp theo mã vào lần 1).



**Danh sách:** Tab `mixing-report-list` → chỉ phiếu `bao_cao_phoi_tron` (không gộp định mức / thực tế).



**Update ca:** Form sửa chuẩn hóa `ca` (bỏ `-`), khớp với sổ ca / cài đặt thời gian trước khi PATCH. API từ chối lưu nếu `ca` trống hoặc chỉ là `-`.


