-- bc_lsx — snapshot tab «Dữ liệu trong lệnh sản xuất» trên /phan-tich-tu-dong
-- Ghi khi bấm «Tính toán». Tên bảng: bc_lsx (Postgres lowercase; UI gọi bc_Lsx).
-- Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.bc_lsx (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bc_lsx
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  -- Cùng khóa bộ lọc với bb_bao_cao_tinh_toan
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists may text not null default '',
  add column if not exists ma_lenh text not null default '',
  add column if not exists group_key text not null default '',
  add column if not exists ca_label text,
  add column if not exists tho_chinh text,
  add column if not exists phu_may text,
  add column if not exists ho_tro text,
  -- Dòng SP
  add column if not exists stt integer not null default 1,
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists don_vi text,
  add column if not exists dinh_muc_kg numeric,
  add column if not exists trong_luong_nhua_kg numeric,
  add column if not exists so_luong numeric,
  add column if not exists tong_kg numeric,
  add column if not exists ti_le_kl_nhua_percent numeric,
  -- Định mức NVL của SP (jsonb): trọng lượng trộn + danh sách NVL + định lượng kg
  add column if not exists dm_nvl jsonb,
  -- Tổng lệnh (denormalized trên mỗi dòng để dễ đọc)
  add column if not exists so_dong_lenh integer,
  add column if not exists tong_sl_lenh numeric,
  add column if not exists tong_tl_lenh_kg numeric,
  add column if not exists ti_le_kl_nhua_lenh_percent numeric;

create index if not exists bc_lsx_khoa_idx
  on public.bc_lsx (khoa_on_dinh);

create index if not exists bc_lsx_ngay_ma_lenh_idx
  on public.bc_lsx (ngay desc, ma_lenh);

create unique index if not exists bc_lsx_khoa_lenh_stt_uidx
  on public.bc_lsx (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_bc_lsx_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bc_lsx_updated_at on public.bc_lsx;
create trigger trg_bc_lsx_updated_at
before update on public.bc_lsx
for each row
execute function public.set_bc_lsx_updated_at();

alter table public.bc_lsx enable row level security;

drop policy if exists "bc_lsx_select_all" on public.bc_lsx;
create policy "bc_lsx_select_all"
  on public.bc_lsx for select using (true);

drop policy if exists "bc_lsx_insert_all" on public.bc_lsx;
create policy "bc_lsx_insert_all"
  on public.bc_lsx for insert with check (true);

drop policy if exists "bc_lsx_update_all" on public.bc_lsx;
create policy "bc_lsx_update_all"
  on public.bc_lsx for update using (true) with check (true);

drop policy if exists "bc_lsx_delete_all" on public.bc_lsx;
create policy "bc_lsx_delete_all"
  on public.bc_lsx for delete using (true);

comment on table public.bc_lsx is
  'Snapshot tab Du lieu trong lenh SX (/phan-tich-tu-dong). Ghi khi bam Tinh toan. Ten UI: bc_Lsx.';
comment on column public.bc_lsx.khoa_on_dinh is
  'Khoa bo loc — trung khoa bb_bao_cao_tinh_toan.';
comment on column public.bc_lsx.trong_luong_nhua_kg is
  'Trong luong nhua + phu gia (kg) / 1 DVT.';
comment on column public.bc_lsx.tong_kg is
  'Tong TL dong = dinh_muc_kg x so_luong.';
comment on column public.bc_lsx.dm_nvl is
  'JSONB dinh muc NVL: { trong_luong_tron_kg, nvl: [{ ma_nvl, ten_nvl, don_vi, loai, phan_tram, so_luong, dinh_luong_kg, tong_dinh_luong_kg }] }. trong_luong_tron_kg = trong_luong_nhua_kg.';
