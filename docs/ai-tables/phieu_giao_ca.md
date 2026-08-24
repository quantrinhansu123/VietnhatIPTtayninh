# phieu_giao_ca



| **Bảng** | `phieu_giao_ca` |

| **Tab** | `shift-handover-report`, `shift-handover-list` |

| **SQL** | `supabase-phieu-giao-ca.sql` |



**API:** `server.ts` — `GET/POST/DELETE /api/phieu-giao-ca` (sau `/api/phieu-bao-dung-may`)



**Components:**

- `ShiftHandoverPanel.tsx` — form nhật ký sản xuất kiêm phiếu giao ca (QT-16-BM02)

- `ShiftHandoverListView.tsx` — danh sách `/danh-sach-phieu-giao-ca`

- `ShiftHandoverPrintSheet.tsx` — bản in A4 ngang

- `src/lib/shiftHandoverModel.ts` — kiểu dữ liệu, tổng cột (6)=(3)×(5), chênh lệch KPI, `ton_cuoi_ca`

- `src/utils/shiftHandoverAutofill.ts` — map autofill từ `can_tu_dong` / `bao_cao_hang_hong` / `bao_cao_may_nvl_ton`



**`chi_tiet` JSON:** `{ loai: "nk_sx", gio_tu, gio_den, thanh_pham[], hang_loi[], ton_cuoi_ca[], bao_cao_cuoi_ca[] }`



**Tự động điền** (cần Ngày + Ca; xác nhận nếu form đã có dữ liệu):

| Mục | Nguồn |

|-----|--------|

| II. Thành phẩm | `GET /api/can-tu-dong?dateBy=ngay` — gom theo mã SP |

| III. Hàng lỗi | `GET /api/bao-cao-hang-hong?ngay=` |

| IV. Tồn cuối ca | `GET /api/bao-cao-may-nvl-ton?loai_bao_cao=cuoi_ca` |

| III. Báo cáo SX cuối ca (KPI) | không autofill |

| Lõi 20/30cm | để trống |



`ton_cuoi_ca[]`: `{ ma_nvl, ten_nvl, dvt, so_luong, trong_luong_kg }` — lưu trong JSON, không đổi schema SQL.



Phiếu cũ (mảng việc bàn giao) vẫn đọc được; bản in mới hiện bảng công việc khi không có thành phẩm.


