# phieu_giao_ca

| **Bảng** | `phieu_giao_ca` |
| **Tab** | `shift-handover-report`, `shift-handover-list` |
| **SQL** | `supabase-phieu-giao-ca.sql` |

**API:** `server.ts` — `GET/POST/DELETE /api/phieu-giao-ca` (sau `/api/phieu-bao-dung-may`)

**Components:**

- `ShiftHandoverPanel.tsx` — form nhật ký sản xuất kiêm phiếu giao ca (QT-16-BM02)
- `ShiftHandoverListView.tsx` — danh sách `/danh-sach-phieu-giao-ca`
- `ShiftHandoverPrintSheetV2.tsx` — bản in A4 dọc (cấu trúc in mới)
- `src/lib/shiftHandoverModel.ts` — kiểu dữ liệu, `ton_cuoi_ca`, bảng trộn vật tư (đọc phiếu cũ)
- `src/utils/shiftHandoverAutofill.ts` — gợi ý NVL tồn cuối từ **BOM LSX theo máy**

**`chi_tiet` JSON:** `{ loai: "nk_sx", gio_tu, gio_den, thanh_pham[], hang_loi[], ton_cuoi_ca[], vat_tu[], bao_cao_cuoi_ca[] }`

Form hiện chỉ nhập:

| Mục | Nguồn |
|-----|--------|
| Tồn cuối ca | Nút **Tự động điền** → NVL từ BOM SP trên **LSX của máy** (Ngày + Ca + Máy). **Chỉ gợi ý mã/tên/ĐVT — không điền số lượng/TL** |

Không còn tab **Bảng trộn vật tư** trên form (phiếu cũ vẫn đọc/in được `vat_tu`).

Tự động điền **Máy** và **Người thực hiện** theo Ngày + Ca từ `GET /api/lenh-sx`.

**Lưu ý API:** `parseShiftHandoverNkSxDetail` phải giữ `ton_cuoi_ca` + `vat_tu` trong `chi_tiet` khi POST — nếu thiếu thì lịch sử luôn trống NVL.

Lịch sử phiếu (sidebar): hiện số dòng NVL + tổng SL/TL; bấm vào phiếu để nạp lại form.

`ton_cuoi_ca[]`: `{ ma_nvl, ten_nvl, dvt, so_luong, trong_luong_kg }`

Phiếu cũ (thành phẩm / hàng lỗi / KPI / việc bàn giao / bảng trộn) vẫn đọc được. Bản in A4 dọc chỉ còn **tồn cuối ca** (không in bảng trộn vật tư). Nút **Lưu phiếu** không in; in từ lịch sử. Khi in nhiều phiếu, chỉ ngắt trang giữa các phiếu, không tạo trang trắng cuối.
