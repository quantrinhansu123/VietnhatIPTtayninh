-- Chạy trong Supabase SQL Editor
-- Ảnh số cân / số bao thực tế gắn theo phiếu xuất kho (mỗi dòng phiếu lưu cùng URL header)

alter table public.phieu_xuat_nhap_kho
  add column if not exists link_anh_can_thuc_te text,
  add column if not exists link_anh_can_thuc_te_public_id text,
  add column if not exists link_anh_bao_thuc_te text,
  add column if not exists link_anh_bao_thuc_te_public_id text;

comment on column public.phieu_xuat_nhap_kho.link_anh_can_thuc_te is 'URL ảnh chụp số cân thực tế khi xuất kho (Cloudinary).';
comment on column public.phieu_xuat_nhap_kho.link_anh_can_thuc_te_public_id is 'Cloudinary public_id ảnh số cân thực tế.';
comment on column public.phieu_xuat_nhap_kho.link_anh_bao_thuc_te is 'URL ảnh chụp số bao thực tế khi xuất kho (Cloudinary).';
comment on column public.phieu_xuat_nhap_kho.link_anh_bao_thuc_te_public_id is 'Cloudinary public_id ảnh số bao thực tế.';
