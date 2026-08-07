# bao_cao_phoi_tron

| **Bảng** | `bao_cao_phoi_tron` |
| **Tab** | `mixing-report`, `mixing-report-list` |
| **SQL** | `supabase-bao-cao-phoi-tron.sql` |

**API:** `server.ts` 5284–5476  
**Components (đã tách):**
- `MixingReportForm.tsx` — nhập báo cáo
- `MixingReportListView.tsx` — danh sách + tab định mức
- `MixingNormMaterialsTab.tsx` — bảng trộn vật tư định mức (nhập tay)
- `MixingReportPrintSheet.tsx` — in
- `MixingOrderAutofillModal.tsx` — autofill

**Utils:** `lib/mixingReportModel.ts`, `utils/mixingOrderAutofill.ts`, `utils/mixingNormSuggestion.ts`

**Gợi ý định mức QC:** Form `/bao-cao-phoi-tron` khi chọn Ngày + Ca sẽ tải `/api/bang-tron-vat-tu-dinh-muc?ngay&ca` và hiện phiếu định mức QC để **Áp dụng** (đổ NVL gộp theo mã vào lần 1).

**Danh sách gộp:** Tab `mixing-report-list` → «Danh sách phiếu phối trộn» hiện cả `bao_cao_phoi_tron` + định mức + thực tế (badge loại), cùng lọc ngày/ca.

**Update ca:** Form sửa chuẩn hóa `ca` (bỏ `-`), khớp với sổ ca / cài đặt thời gian trước khi PATCH. API từ chối lưu nếu `ca` trống hoặc chỉ là `-`.
