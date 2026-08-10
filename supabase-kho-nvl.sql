-- Chay lai an toan trong Supabase SQL Editor

create table if not exists public.kho_nvl (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Tự vá cho bảng đã tồn tại nhưng thiếu cột id (VD tạo thủ công/import trước đó) —
-- create table if not exists ở trên bị bỏ qua trong trường hợp này nên phải thêm riêng.
alter table public.kho_nvl
  add column if not exists id uuid default gen_random_uuid();
update public.kho_nvl set id = gen_random_uuid() where id is null;
alter table public.kho_nvl
  alter column id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kho_nvl_pkey'
  ) then
    alter table public.kho_nvl add constraint kho_nvl_pkey primary key (id);
  end if;
end $$;

alter table public.kho_nvl
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ma_npl text,
  add column if not exists ten_npl text,
  add column if not exists don_vi text,
  add column if not exists tong_trong_luong numeric,
  add column if not exists trong_luong_nhua numeric,
  add column if not exists trong_luong_tui numeric,
  add column if not exists trong_luong_loi numeric,
  add column if not exists kho_cuon numeric,
  add column if not exists chieu_dai_don_vi numeric,
  add column if not exists ton_dau_ky numeric,
  add column if not exists nhap_trong_ky numeric,
  add column if not exists xuat_trong_ky numeric;

create unique index if not exists kho_nvl_ma_npl_key on public.kho_nvl (ma_npl);

alter table public.kho_nvl enable row level security;

drop policy if exists "kho_nvl_select_all" on public.kho_nvl;
create policy "kho_nvl_select_all"
  on public.kho_nvl for select
  using (true);

drop policy if exists "kho_nvl_insert_all" on public.kho_nvl;
create policy "kho_nvl_insert_all"
  on public.kho_nvl for insert
  with check (true);

drop policy if exists "kho_nvl_update_all" on public.kho_nvl;
create policy "kho_nvl_update_all"
  on public.kho_nvl for update
  using (true)
  with check (true);

drop policy if exists "kho_nvl_delete_all" on public.kho_nvl;
create policy "kho_nvl_delete_all"
  on public.kho_nvl for delete
  using (true);

comment on table public.kho_nvl is 'Kho nguyen vat lieu (NPL).';
comment on column public.kho_nvl.ma_npl is 'Ma nguyen phu lieu.';
comment on column public.kho_nvl.ten_npl is 'Ten nguyen phu lieu.';
