-- Chay trong Supabase SQL Editor
-- Them cot ten_kho cho phieu_xuat_nhap_kho de moi dong phieu co the gan vao 1 kho cu the
-- (quan_ly_kho.ten_kho). Cac dong cu gia tri NULL nghia la chua gan kho.

alter table public.phieu_xuat_nhap_kho
  add column if not exists ten_kho text;

create index if not exists phieu_xuat_nhap_kho_ten_kho_idx on public.phieu_xuat_nhap_kho (ten_kho);

comment on column public.phieu_xuat_nhap_kho.ten_kho is 'Ten kho (theo danh muc quan_ly_kho.ten_kho). NULL = chua gan kho.';
