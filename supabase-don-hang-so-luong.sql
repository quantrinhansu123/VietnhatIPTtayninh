-- Chay trong Supabase SQL Editor (an toan khi chay lai)

do $$
begin
  if to_regclass('public.don_hang') is null then
    raise notice 'Chưa có public.don_hang — bỏ qua so_luong.';
    return;
  end if;
  alter table public.don_hang
    add column if not exists so_luong numeric,
    add column if not exists so_luong_ton numeric;
  comment on column public.don_hang.so_luong is 'So luong dat hang.';
  comment on column public.don_hang.so_luong_ton is 'So luong ton kho lien quan don hang.';
end $$;
