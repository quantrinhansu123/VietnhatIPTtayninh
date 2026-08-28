# phieu_giao_ca

| **Bảng** | `phieu_giao_ca` |
| **Tab** | `shift-handover-report`, `shift-handover-list` |
| **SQL** | `supabase-phieu-giao-ca.sql` |

**API:** `server.ts` — `GET/POST/DELETE /api/phieu-giao-ca` (sau `/api/phieu-bao-dung-may`)

**Components:**

- `ShiftHandoverPanel.tsx` — form nhật ký sản xuất kiêm phiếu giao ca (QT-16-BM02)
- `ShiftHandoverListView.tsx` — danh sách `/danh-sach-phieu-giao-ca`
- `ShiftHandoverPrintSheetV2.tsx` — bản in A4 dọc (cấu trúc in mới)
- `src/lib/shiftHandoverModel.ts` — kiểu dữ liệu, `ton_cuoi_ca`, bảng trộn vật tư
- `src/utils/shiftHandoverAutofill.ts` — map autofill từ `bao_cao_phoi_tron` + `bao_cao_may_nvl_ton`

**`chi_tiet` JSON:** `{ loai: "nk_sx", gio_tu, gio_den, thanh_pham[], hang_loi[], ton_cuoi_ca[], vat_tu[], bao_cao_cuoi_ca[] }`

Form hiện chỉ nhập:

| Mục | Nguồn |
|-----|--------|
| Số lượng tồn cuối ca | `GET /api/bao-cao-may-nvl-ton?loai_bao_cao=cuoi_ca` |
| Bảng trộn vật tư | `GET /api/bao-cao-phoi-tron` theo Ngày + Ca + **Máy** — Lần 1–5 từ phiếu trộn; **Tỉ lệ ĐM** từ `ty_le_tron` máy |

Tự động điền **Máy** và **Người thực hiện** theo Ngày + Ca từ `GET /api/lenh-sx`. Tự động điền bảng chi tiết cần Ngày + Ca + Máy.

`ton_cuoi_ca[]`: `{ ma_nvl, ten_nvl, dvt, so_luong, trong_luong_kg }`

Phiếu cũ (thành phẩm / hàng lỗi / KPI / việc bàn giao) vẫn đọc được. Bản in A4 dọc gồm **cả 2 mục trên 1 trang**: tồn cuối ca + bảng trộn vật tư (nút **Lưu phiếu** không in; in từ lịch sử). Khi in nhiều phiếu, chỉ ngắt trang giữa các phiếu, không tạo trang trắng cuối.
