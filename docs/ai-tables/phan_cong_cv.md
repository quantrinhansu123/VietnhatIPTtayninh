# `phan_cong_cv`

| **Bảng** | `phan_cong_cv` |
| **Tab** | `/ke-hoach-san-xuat` (cùng màn với Kế hoạch SX) |
| **SQL** | `supabase-phan-cong-cv.sql`, sau đó `supabase-phan-cong-cv-gio.sql` |

**API:** `server.ts` — `GET/PUT/DELETE /api/phan-cong-cv` (sau `/api/phieu-giao-ca`)

**UI:** `src/features/ke-hoach-san-xuat/PhanCongCvPanel.tsx` (trên `ProductionPlanHistoryPanel`)

## Layout (giống Kế hoạch SX)

- Trái: **Danh sách kế hoạch CV** (gộp theo Ngày + Ca) — Xem / In / Xóa
- Phải: chi tiết bảng + **In kế hoạch CV** (đỏ, icon Printer) + Thêm dòng / Lưu
- In: `PhanCongCvPrintSheet` + `body.production-plan-modal-print-active` (CSS `production-plan-print-*`)

## Cột

`id`, `ngay`, `ca`, `gio`, `cong_viec`, `nhan_su_phu_trach`, `ghi_chu`, `thanh_pham`, `dm_thanh_pham_TT`

Ngày và ca áp dụng cho cả kế hoạch. Mỗi dòng cần giờ, nhân sự phụ trách và công việc khi lưu. Dòng cũ có thể chưa có giờ.

## API

- `GET /api/phan-cong-cv?ngay=&ca=` → `{ rows, total }`
- `PUT /api/phan-cong-cv` nhận `{ ngay, ca, items: [...] }` và thay các dòng của ngày + ca trong một giao dịch qua `phan_cong_cv_replace`. Mảng rỗng xóa kế hoạch của ngày + ca đó.
- `DELETE /api/phan-cong-cv/:id`

**UI chọn:**
- **Công việc:** task việc — sổ xuống các task đã lưu trong `phan_cong_cv.cong_viec`, hoặc nhập task mới
- **Nhân sự phụ trách:** sổ xuống nhân sự chi nhánh **HCM** (`GET /api/nhan-su?format=groups`)
