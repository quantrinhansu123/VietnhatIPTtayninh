# nhat_ky_chay_may

| **Bảng** | `nhat_ky_chay_may` |
| **Tab** | `machine-run-log`, `machine-run-log-list` |
| **SQL** | `supabase-nhat-ky-chay-may.sql` · migrate: `supabase-nhat-ky-chay-may-simplify.sql` |

**API:** `server.ts` — `/api/nhat-ky-chay-may`  
**UI:** `src/components/MachineRunLogPanel.tsx`, `MachineRunLogPrintSheet.tsx`  
**Hub:** `/phieu-bao-cao` tab Nhật ký chạy máy

## Form (gọn)

Ngày · Giờ · Ca chạy · Giờ dừng · Nhân sự phụ trách · Ghi chú · Ảnh thông số.

- `thoi_gian_chay_thuc_te_phut` = phút giữa `gio` → `gio_dung` (qua đêm nếu dừng &lt; bắt đầu).
- `chi_tiet` có thể `[]` (phiếu cũ vẫn giữ dòng JSON).
- Cột mới: `gio`, `gio_dung`, `anh_thong_so`.
