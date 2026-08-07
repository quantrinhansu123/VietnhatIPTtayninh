# danh_sach_xe / doi_chieu_lai_xe / chi_phi_xe / nhat_ky_xe / yeu_cau_xuat_hang_xe / tuyen_giao_hang_xe

| **Bảng** | `danh_sach_xe`, `doi_chieu_lai_xe`, `chi_phi_xe`, `nhat_ky_xe`, `yeu_cau_xuat_hang_xe`, `tuyen_giao_hang_xe` |
| **Tab** | `vehicles` → `/danh-sach-xe` |
| **SQL** | `supabase-danh-sach-xe.sql`, `supabase-danh-sach-xe-giay-to.sql` |

**API:**
- `server.ts` — `/api/danh-sach-xe`
- `server.ts` — `/api/doi-chieu-lai-xe`
- `server.ts` — `/api/chi-phi-xe`
- `server.ts` — `/api/nhat-ky-xe`
- `server.ts` — `/api/yeu-cau-xuat-hang-xe`
- `server.ts` — `PUT /api/yeu-cau-xuat-hang-xe/thu-tu` (lưu thứ tự tuyến)
- `server.ts` — `GET/PUT /api/tuyen-giao-hang-xe` (điểm đầu/cuối, tổng KM và điều chỉnh)
- `server.ts` — `/api/vietmap/config|autocomplete|place|route` (proxy Vietmap)

**UI:** `src/features/danh-sach-xe/index.tsx`, `src/features/danh-sach-xe/VehicleOperations.tsx`, `src/features/danh-sach-xe/VietmapRoutePlanner.tsx`, `src/features/danh-sach-xe/DriverPolicy.tsx`

Tab `Quy chế lái xe` (`DriverPolicy.tsx`) là nội dung tĩnh, không có bảng/API — QĐ 220222 CN/QĐ (22/02/2022) để nhân sự & lái xe đọc lại.

Dữ liệu gốc `danh_sach_xe`: loại xe (sổ xuống: `1,5 tấn`, `6 tấn` + loại đã có trong DB), biển số, tài xế phụ trách.
Hồ sơ `giay_to` (JSONB): STT, tên giấy tờ (ví dụ Đăng kiểm, Bằng lái), nhiều ảnh Cloudinary.
Dữ liệu tháng `doi_chieu_lai_xe`: công quy đổi, chuyến, km, các khoản thưởng và doanh số.
Chi phí `chi_phi_xe`: ngày giờ, loại/tên chi phí, số tiền, BSX, nhân viên và ảnh hóa đơn.
Nhật ký `nhat_ky_xe`: ngày giờ, ca, BSX, nhân viên, tổng mặt hàng, doanh thu và chi phí.
Nhật ký KM `nhat_ky_km_xe`: loại KM, số KM đi/về, tổng KM, ảnh xác nhận.
API: `/api/nhat-ky-km-xe`

Thẻ **Tuyến**: xếp `thu_tu_giao` cho các phiếu `yeu_cau_xuat_hang_xe` cùng ngày + BSX (điểm giao từng khách hàng lấy từ Yêu cầu xuất hàng / lệnh xuất hàng).
Vietmap trong thẻ **Tuyến**: gợi ý/lấy tọa độ địa chỉ, vẽ hành trình, tính KM từng chặng + lũy kế + tổng; lưu riêng KM Vietmap, KM nhập tay và KM chốt trong `tuyen_giao_hang_xe`.
