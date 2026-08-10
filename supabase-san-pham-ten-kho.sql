-- Chay trong Supabase SQL Editor
-- Them cot ten_kho cho san_pham de gan thanh pham vao 1 kho cu the (quan_ly_kho.ten_kho)

alter table public.san_pham
  add column if not exists ten_kho text;

create index if not exists san_pham_ten_kho_idx on public.san_pham (ten_kho);

comment on column public.san_pham.ten_kho is 'Ten kho (theo danh muc quan_ly_kho.ten_kho). NULL = chua gan kho.';
