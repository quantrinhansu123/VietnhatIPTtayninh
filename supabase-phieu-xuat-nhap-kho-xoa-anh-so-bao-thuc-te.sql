-- Bỏ ảnh số bao thực tế: phiếu xuất kho NVL chỉ giữ ảnh số cân thực tế.
alter table public.phieu_xuat_nhap_kho
  drop column if exists link_anh_bao_thuc_te,
  drop column if exists link_anh_bao_thuc_te_public_id;
