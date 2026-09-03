# `phan_cong_cv`

| **Bảng** | `phan_cong_cv` |
| **Tab** | `/ke-hoach-san-xuat` (Loại: **Kế hoạch CV**) |
| **SQL** | `supabase-phan-cong-cv.sql` |

**API:** `server.ts` — `GET/PUT/DELETE /api/phan-cong-cv` (sau `/api/phieu-giao-ca`)

**UI:** `src/features/ke-hoach-san-xuat/PhanCongCvPanel.tsx` (trên `ProductionPlanHistoryPanel`)

## Layout (giống Kế hoạch SX)

- Trái: **Danh sách kế hoạch CV** (gộp theo Ngày + Ca) — Xem / In / Xóa
- Phải: chi tiết bảng + **In kế hoạch CV** (đỏ, icon Printer) + Thêm dòng / Lưu
- In: `PhanCongCvPrintSheet` + `body.production-plan-modal-print-active` (CSS `production-plan-print-*`)

## Cột

`id`, `ngay`, `ca`, `cong_viec`, `nhan_su_phu_trach`, `ghi_chu`, `thanh_pham`, `dm_thanh_pham_TT`

## API

- `GET /api/phan-cong-cv?ngay=&ca=` → `{ rows, total }`
- `PUT /api/phan-cong-cv` body `{ ngay, ca, items[] }` — xóa rồi ghi lại theo Ngày + Ca
- `DELETE /api/phan-cong-cv/:id`

**UI chọn:**
- **Công việc:** task việc — sổ xuống các task đã lưu trong `phan_cong_cv.cong_viec`, hoặc nhập task mới
- **Nhân sự phụ trách:** sổ xuống nhân sự chi nhánh **Đà Nẵng** (`GET /api/nhan-su?format=groups`)
