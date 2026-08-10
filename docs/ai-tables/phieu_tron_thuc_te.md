# phieu_tron_thuc_te

| **Bảng** | `phieu_tron_thuc_te` |
| **Tab** | *(không gắn UI danh sách phối trộn — component còn, API còn)* |
| **SQL** | `supabase-phieu-tron-thuc-te.sql` |

**API:** `/api/phieu-tron-thuc-te`  
**UI:** `src/components/ActualMixingSheetTab.tsx`

> `/danh-sach-bao-cao-phoi-tron` đã bỏ tab định mức/thực tế; chỉ còn danh sách `bao_cao_phoi_tron`.

Mỗi phiếu tham chiếu một `dinh_muc_id` của đúng `ngay` + `ca`. `chi_tiet` sao chép cấu trúc sản phẩm/NVL của phiếu định mức và bổ sung `phan_tram_thuc_te`, `trong_luong_thuc_te`.

`trong_luong_thuc_te = tong_trong_luong sản phẩm × phan_tram_thuc_te / 100`.

**Load sau F5:** form gắn `% thực tế` từ phiếu đã lưu lên khung NVL định mức (merge theo `ma_sp`/`ma_nvl`); nhớ Ngày/Ca/phiếu trong `sessionStorage`.
