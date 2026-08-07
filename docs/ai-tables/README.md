# Bản đồ code theo bảng Supabase

**Mục đích:** AI chỉ đọc file bảng liên quan — không cần mở `App.monolith.backup.tsx` hay toàn bộ `server.ts`.

## Cách dùng

1. Xác định bảng Supabase (hoặc tab/route).
2. Mở **`docs/ai-tables/<ten-bang>.md`** tương ứng (~20 dòng).
3. Chỉ đọc các file được liệt kê — **ưu tiên `src/features/<bang>/`**, không mở `App.monolith.backup.tsx`.
4. Tra cứu nhanh: `src/features/registry.ts`.

### Vì sao ít token hơn nhiều

- Monolith: `App.tsx` backup ~18k dòng → AI dễ đọc quá tay.
- Manifest + feature: ~20 dòng manifest + 1 file feature ~500–1.100 dòng + vài component + ~100 dòng API.

Khi tách feature mới: cập nhật manifest (`appLines` → `src/features/...`) và `registry.ts` ngay.

## Danh sách bảng

| Bảng | Tab / Route | Manifest |
|------|-------------|----------|
| `reports` | `/nhap-bao-cao` | [reports.md](./reports.md) |
| `phieu_can_dinh_ki` | `/tong-hop-ca` | [phieu_can_dinh_ki.md](./phieu_can_dinh_ki.md) |
| `can_tu_dong` | `/can-tu-dong` | [can_tu_dong.md](./can_tu_dong.md) |
| `kiem_kho` | `/kiem-kho` | [kiem_kho.md](./kiem_kho.md) |
| `quan_ly_kho` | `/quan-ly-kho` | [quan_ly_kho.md](./quan_ly_kho.md) |
| `bao_cao_hang_hong` | `/bao-cao-hang-hong` | [bao_cao_hang_hong.md](./bao_cao_hang_hong.md) |
| `san_pham` | `/san-pham` | [san_pham.md](./san_pham.md) |
| `danh_sach_may` | `/danh-sach-may` | [danh_sach_may.md](./danh_sach_may.md) |
| `kho_nvl` | `/kho-nvl` | [kho_nvl.md](./kho_nvl.md) |
| `phieu_xuat_nhap_kho` | `/phieu-xuat-nhap-kho` | [phieu_xuat_nhap_kho.md](./phieu_xuat_nhap_kho.md) |
| `don_hang` | `/don-hang` | [don_hang.md](./don_hang.md) |
| `khach_hang` | `/khach-hang` | [khach_hang.md](./khach_hang.md) |
| `lenh_xuat_hang` | `/lenh-xuat-hang` | [lenh_xuat_hang.md](./lenh_xuat_hang.md) |
| `lenh_sx` | `/lenh-san-xuat` | [lenh_sx.md](./lenh_sx.md) |
| `ke_hoach_san_xuat` | `/ke-hoach-san-xuat` | [ke_hoach_san_xuat.md](./ke_hoach_san_xuat.md) |
| `nhan_su` | `/nhan-su` | [nhan_su.md](./nhan_su.md) |
| `danh_sach_xe` | `/danh-sach-xe` | [danh_sach_xe.md](./danh_sach_xe.md) |
| `doi_chieu_lai_xe` | `/danh-sach-xe` | [danh_sach_xe.md](./danh_sach_xe.md) |
| `chi_phi_xe` | `/danh-sach-xe` | [chi_phi_xe.md](./chi_phi_xe.md) |
| `nhat_ky_xe` | `/danh-sach-xe` | [nhat_ky_xe.md](./nhat_ky_xe.md) |
| `tuyen_giao_hang_xe` | `/danh-sach-xe` | [danh_sach_xe.md](./danh_sach_xe.md) |
| `thu_tien_khach_hang` | `/danh-sach-xe` | [thu_tien_khach_hang.md](./thu_tien_khach_hang.md) |
| `cai_dat_thoi_gian` | `/cai-dat` | [cai_dat_thoi_gian.md](./cai_dat_thoi_gian.md) |
| `bao_cao_phoi_tron` | `/bao-cao-phoi-tron` | [bao_cao_phoi_tron.md](./bao_cao_phoi_tron.md) |
| `bang_tron_vat_tu_dinh_muc` | `/danh-sach-bao-cao-phoi-tron` (tab định mức) | [bang_tron_vat_tu_dinh_muc.md](./bang_tron_vat_tu_dinh_muc.md) |
| `phieu_tron_thuc_te` | `/danh-sach-bao-cao-phoi-tron` (tab thực tế) | [phieu_tron_thuc_te.md](./phieu_tron_thuc_te.md) |
| `bao_cao_nghiem_thu` | `/bao-cao-san-luong` | [bao_cao_nghiem_thu.md](./bao_cao_nghiem_thu.md) |
| `bao_cao_may_nvl_ton` | `/bao-cao-may-nvl-ton` | [bao_cao_may_nvl_ton.md](./bao_cao_may_nvl_ton.md) |
| `phieu_bao_dung_may` | `/phieu-bao-dung-may` | [phieu_bao_dung_may.md](./phieu_bao_dung_may.md) |
| *(tổng hợp)* | `/bang-dieu-khien` | [control_board.md](./control_board.md) |

## File dùng chung (chỉ khi cần)

| File | Khi nào đọc |
|------|-------------|
| `src/routes.ts` | Đổi tab, URL, điều hướng |
| `src/types.ts` | Kiểu báo cáo sản xuất ca |
| `src/utils.ts` | Format số, tiền, parse input |
| `src/App.tsx` (~1.3k dòng) | Shell layout, menu, routing — logic từng bảng ở `src/features/` |
| `server.ts` (đầu file) | Supabase client, hằng số bảng — **dòng 1–120** |
