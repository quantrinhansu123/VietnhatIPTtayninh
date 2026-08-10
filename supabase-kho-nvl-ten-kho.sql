-- Chay trong Supabase SQL Editor
-- Them cot ten_kho cho kho_nvl de gan NVL vao 1 kho cu the (quan_ly_kho.ten_kho)

alter table public.kho_nvl
  add column if not exists ten_kho text;

create index if not exists kho_nvl_ten_kho_idx on public.kho_nvl (ten_kho);

comment on column public.kho_nvl.ten_kho is 'Ten kho (theo danh muc quan_ly_kho.ten_kho). NULL = chua gan kho.';
