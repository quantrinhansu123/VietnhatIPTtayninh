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

- Trong từng Lần, sổ **Sao chép NVL từ lần...** lấy các lần trước cùng ngày · ca · máy (phiếu đã lưu và các lần đang nhập). Sao chép mã/tên NVL, ĐVT, %, KL ĐM, KL TT và KL 1 mẻ; thay NVL của lần đích sau khi xác nhận nếu đã có dữ liệu. Lý do, giải trình và ảnh xác nhận không sao chép. Logic/test: `lib/mixingReportModel.ts`, `lib/mixingReportModel.test.ts`.



**Utils:** `lib/mixingReportModel.ts`, `utils/mixingOrderAutofill.ts` (`resolveMixingMaterialDisplayName` — nếu BOM để tên = mã thì lấy `ten_npl` từ kho NVL), `utils/mixingNormSuggestion.ts`



**Gợi ý định mức QC:** Form `/bao-cao-phoi-tron` khi chọn Ngày + Ca sẽ tải `/api/bang-tron-vat-tu-dinh-muc?ngay&ca` và hiện phiếu định mức QC để **Áp dụng** (đổ NVL gộp theo mã vào lần 1).

**Sổ Máy:** hiện đủ máy từ `/api/danh-sach-may` (không chỉ máy có lệnh SX đúng ngày+ca). Máy có lệnh SX ngày+ca được xếp lên đầu danh sách.



**Một trang nhiều tab:** Cả `mixing-report` và `mixing-report-list` đều mở `MixingReportListView` với 4 tab:
1. **Nhập báo cáo trộn** (`bao_cao_phoi_tron` form)
2. **Bảng trộn định mức** (`bang_tron_vat_tu_dinh_muc`)
3. **Phiếu trộn thực tế**
4. **Danh sách phiếu** (`bao_cao_phoi_tron`)

Menu Sản xuất → Trộn NVL mở tab nhập; QC → BOM mở tab định mức. Khi mở chi tiết phiếu hiện **Tỉ lệ trộn Định mức** / **Thực tế**.



**Update ca:** Form sửa chuẩn hóa `ca` (bỏ `-`), khớp với sổ ca / cài đặt thời gian trước khi PATCH. API từ chối lưu nếu `ca` trống hoặc chỉ là `-`.


