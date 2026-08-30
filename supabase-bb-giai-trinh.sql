-- Giải trình trên /phan-tich-tu-dong (tab Giải trình).
create extension if not exists pgcrypto;

create table if not exists public.bb_giai_trinh (
  id uuid primary key default gen_random_uuid(),
  -- Khoa ổn định: ngay|ca|may|ma_lenh
  khoa_on_dinh text not null unique,
  ngay text not null,
  ca text not null default '',
  may text not null default '',
  ma_lenh text not null default '',
  group_key text,
  van_de text not null default '',
  giai_quyet text not null default '',
  lan_lap_lai text not null default '',
  nguoi_chiu_trach_nhiem text not null default '',
  nguoi_lap text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bb_giai_trinh_khoa
  on public.bb_giai_trinh (khoa_on_dinh);

create index if not exists idx_bb_giai_trinh_ngay
  on public.bb_giai_trinh (ngay desc);

create index if not exists idx_bb_giai_trinh_ma_lenh
  on public.bb_giai_trinh (ma_lenh);

create or replace function public.set_bb_giai_trinh_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bb_giai_trinh_updated_at on public.bb_giai_trinh;

create trigger trg_bb_giai_trinh_updated_at
before update on public.bb_giai_trinh
for each row
execute function public.set_bb_giai_trinh_updated_at();

comment on table public.bb_giai_trinh is
  'Giải trình (gõ tay) trên tab Giải trình /phan-tich-tu-dong.';

comment on column public.bb_giai_trinh.van_de is 'Vấn đề';
comment on column public.bb_giai_trinh.giai_quyet is 'Giải quyết';
comment on column public.bb_giai_trinh.lan_lap_lai is 'Lần lặp lại';
comment on column public.bb_giai_trinh.nguoi_chiu_trach_nhiem is 'Người chịu trách nhiệm';
