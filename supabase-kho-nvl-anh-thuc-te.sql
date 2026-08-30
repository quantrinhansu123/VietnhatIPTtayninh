-- Ảnh chụp số cân thực tế / số bao thực tế (Cloudinary URL lưu trên kho_nvl)
-- Chạy trong Supabase SQL Editor

alter table public.kho_nvl
  add column if not exists link_anh_can_thuc_te text,
  add column if not exists link_anh_can_thuc_te_public_id text,
  add column if not exists link_anh_bao_thuc_te text,
  add column if not exists link_anh_bao_thuc_te_public_id text;

comment on column public.kho_nvl.link_anh_can_thuc_te is 'URL ảnh chụp số cân thực tế (Cloudinary).';
comment on column public.kho_nvl.link_anh_can_thuc_te_public_id is 'Cloudinary public_id ảnh số cân thực tế.';
comment on column public.kho_nvl.link_anh_bao_thuc_te is 'URL ảnh chụp số bao thực tế (Cloudinary).';
comment on column public.kho_nvl.link_anh_bao_thuc_te_public_id is 'Cloudinary public_id ảnh số bao thực tế.';
