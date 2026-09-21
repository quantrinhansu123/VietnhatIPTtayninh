-- Chay trong Supabase SQL Editor (an toan khi chay lai)

do $$
begin
  if to_regclass('public.don_hang') is null then
    raise notice 'Chưa có public.don_hang — bỏ qua trang_thai.';
    return;
  end if;
  alter table public.don_hang
    add column if not exists trang_thai text default 'Chờ sx';
  comment on column public.don_hang.trang_thai is 'Trang thai don hang: Cho sx, Dang sx, Hoan thanh, Huy.';
end $$;
