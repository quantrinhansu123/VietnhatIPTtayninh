-- Chay lai an toan trong Supabase SQL Editor
-- Bao cao nghiem thu san pham

create table if not exists public.bao_cao_nghiem_thu (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.bao_cao_nghiem_thu
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ngay date,
  add column if not exists ca text,
  add column if not exists lan text,
  add column if not exists gio time,
  add column if not exists ma_may text,
  add column if not exists ten_may text,
  add column if not exists loai_vat_tu text default 'Thành phẩm',
  add column if not exists mat_hang text,
  add column if not exists don_vi text,
  add column if not exists so_luong numeric,
  add column if not exists hinh_anh text,
  add column if not exists hinh_anh_public_id text;

alter table public.bao_cao_nghiem_thu enable row level security;

drop policy if exists "bao_cao_nghiem_thu_select_all" on public.bao_cao_nghiem_thu;
create policy "bao_cao_nghiem_thu_select_all"
  on public.bao_cao_nghiem_thu for select using (true);

drop policy if exists "bao_cao_nghiem_thu_insert_all" on public.bao_cao_nghiem_thu;
create policy "bao_cao_nghiem_thu_insert_all"
  on public.bao_cao_nghiem_thu for insert with check (true);

drop policy if exists "bao_cao_nghiem_thu_update_all" on public.bao_cao_nghiem_thu;
create policy "bao_cao_nghiem_thu_update_all"
  on public.bao_cao_nghiem_thu for update using (true) with check (true);

drop policy if exists "bao_cao_nghiem_thu_delete_all" on public.bao_cao_nghiem_thu;
create policy "bao_cao_nghiem_thu_delete_all"
  on public.bao_cao_nghiem_thu for delete using (true);

comment on table public.bao_cao_nghiem_thu is 'Bao cao nghiem thu san pham theo ca / lan.';
comment on column public.bao_cao_nghiem_thu.hinh_anh is 'URL anh tren Cloudinary.';
comment on column public.bao_cao_nghiem_thu.loai_vat_tu is 'Loai vat tu: Thanh pham, SP loi, SP rac.';
