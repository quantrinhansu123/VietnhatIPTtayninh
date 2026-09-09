-- nhap_kho — nhat ky quet ma khi NHAP kho.
-- Moi lan quet 1 NVL / thanh pham = 1 dong.
-- Chay an toan khi chay lai.

create extension if not exists pgcrypto;

create table if not exists public.nhap_kho (
  id uuid primary key default gen_random_uuid(),
  loai text not null default '',                 -- vi du: NVL, thanh pham
  ma_sp text not null default '',                -- ma NVL / ma thanh pham vua quet
  ngay_gio timestamptz not null default now(),   -- thoi diem quet
  nguoi_thuc_hien text not null default '',
  ngay text not null default '',                 -- ngay lam viec (yyyy-mm-dd)
  ca text not null default '',                   -- ca lam viec
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nhap_kho
  add column if not exists loai text not null default '',
  add column if not exists ma_sp text not null default '',
  add column if not exists ngay_gio timestamptz not null default now(),
  add column if not exists nguoi_thuc_hien text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists nhap_kho_ngay_ca_idx on public.nhap_kho (ngay desc, ca);
create index if not exists nhap_kho_ma_sp_idx on public.nhap_kho (ma_sp, ngay_gio desc);
create index if not exists nhap_kho_loai_idx on public.nhap_kho (loai, ngay_gio desc);

create or replace function public.set_nhap_kho_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nhap_kho_updated_at on public.nhap_kho;
create trigger trg_nhap_kho_updated_at
before update on public.nhap_kho
for each row execute function public.set_nhap_kho_updated_at();

alter table public.nhap_kho enable row level security;

drop policy if exists "nhap_kho_select_all" on public.nhap_kho;
create policy "nhap_kho_select_all" on public.nhap_kho for select using (true);
drop policy if exists "nhap_kho_insert_all" on public.nhap_kho;
create policy "nhap_kho_insert_all" on public.nhap_kho for insert with check (true);
drop policy if exists "nhap_kho_update_all" on public.nhap_kho;
create policy "nhap_kho_update_all" on public.nhap_kho for update using (true) with check (true);
drop policy if exists "nhap_kho_delete_all" on public.nhap_kho;
create policy "nhap_kho_delete_all" on public.nhap_kho for delete using (true);

grant select, insert, update, delete on public.nhap_kho to anon, authenticated, service_role;

comment on table public.nhap_kho is
  'Nhat ky quet ma khi nhap kho. 1 lan quet 1 NVL/thanh pham = 1 dong.';
comment on column public.nhap_kho.loai is 'Loai hang: NVL, thanh pham, ...';
comment on column public.nhap_kho.ma_sp is 'Ma NVL / ma thanh pham vua quet.';
comment on column public.nhap_kho.ngay_gio is 'Thoi diem quet ma.';
