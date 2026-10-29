# nhat_ky_chay_may

| **Bảng** | `nhat_ky_chay_may` |
| **Tab** | `machine-run-log`, `machine-run-log-list` |
| **SQL** | `supabase-nhat-ky-chay-may.sql` · migrate: `supabase-nhat-ky-chay-may-simplify.sql` · `supabase-nhat-ky-chay-may-su-co-anh.sql` |

**API:** `server.ts` — `/api/nhat-ky-chay-may`  
**UI:** `src/components/MachineRunLogPanel.tsx`, `MachineRunLogPrintSheet.tsx`  
**Hub:** `/phieu-bao-cao` tab Nhật ký chạy máy

## Form

Ngày · **Giờ bắt đầu** · Ca chạy · **Giờ kết thúc** · Nhân sự phụ trách · **Sự cố** · Ghi chú · **Ảnh thông số (nhiều ảnh)**.

- Giờ bắt đầu / kết thúc **tự điền theo ca** (Cài đặt · `gio_bat_dau` / `gio_ket_thuc`), vẫn chỉnh tay được.
- `thoi_gian_chay_thuc_te_phut` = phút giữa `gio` → `gio_dung` (qua đêm nếu kết thúc &lt; bắt đầu).
- **Sự cố** (tuỳ chọn, nhiều dòng): tên sự cố · thời gian xảy ra · thời gian khắc phục → cộng vào `tong_thoi_gian_dung_phut`.
- Lưu `su_co` jsonb (nếu có cột) + mirror trong `chi_tiet` (`loai: su_co`).
- **Ảnh:** nhiều URL trong `anh_urls` jsonb; `anh_thong_so` = ảnh đầu (tương thích phiếu cũ).

## Cột

| Cột | Ý nghĩa |
|-----|---------|
| `gio` | Giờ bắt đầu (HH:MM) |
| `gio_dung` | Giờ kết thúc (HH:MM) |
| `anh_thong_so` | URL ảnh đầu |
| `anh_urls` | Mảng URL ảnh (migrate `su-co-anh`) |
| `su_co` | Mảng sự cố (migrate `su-co-anh`) |
| `chi_tiet` | Phiếu cũ / mirror sự cố |

```bash
node scripts/run-sql-file.mjs supabase-nhat-ky-chay-may-su-co-anh.sql
```
