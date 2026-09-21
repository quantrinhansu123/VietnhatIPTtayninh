-- Chay trong Supabase SQL Editor (an toan khi chay lai)
-- Them cot danh dau "da in" — bo qua bang chua ton tai (DB he-thong / ton / can khac nhau).

do $$
declare
  t text;
begin
  foreach t in array array[
    'phieu_xuat_nhap_kho',
    'phieu_can_dinh_ki',
    'bao_cao_hang_hong',
    'lenh_sx',
    'ke_hoach_san_xuat',
    'bao_cao_phoi_tron',
    'bao_cao_nghiem_thu',
    'bao_cao_may_nvl_ton',
    'don_hang'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Bo qua % (chua co bang)', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists da_in boolean not null default false',
      t
    );
    execute format(
      'comment on column public.%I.da_in is %L',
      t,
      'Da duoc in, khong con sua duoc nua.'
    );
  end loop;
end $$;
