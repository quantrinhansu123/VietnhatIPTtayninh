-- ============================================================
-- CHẠY TRÊN ĐÚNG PROJECT: he-thong
-- URL dashboard:
--   https://supabase.com/dashboard/project/bfnsopyvgvhaegqijpum/sql/new
-- Project ref phải là: bfnsopyvgvhaegqijpum
-- (App .env: SUPABASE_URL=https://bfnsopyvgvhaegqijpum.supabase.co)
-- ============================================================

alter table public.lenh_xuat_hang
  add column if not exists bsx text;

alter table public.lenh_xuat_hang
  add column if not exists so_km numeric(18, 2);

create index if not exists lenh_xuat_hang_bsx_idx
  on public.lenh_xuat_hang (bsx);

comment on column public.lenh_xuat_hang.bsx is 'Bien so xe giao hang';
comment on column public.lenh_xuat_hang.so_km is 'So km giao hang';

-- Làm mới schema cache PostgREST
notify pgrst, 'reload schema';

-- Phải trả về 2 dòng: bsx, so_km
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lenh_xuat_hang'
  and column_name in ('bsx', 'so_km')
order by column_name;
