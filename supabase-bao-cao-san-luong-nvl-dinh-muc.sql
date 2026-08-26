-- Snapshot NVL theo định mức gắn từng dòng Báo cáo sản lượng (bao_cao_nghiem_thu).
-- Nguồn khi đồng bộ: bảng Thành phần Kho sản phẩm (san_pham.npl_phan_tram).
-- Chạy an toàn trong Supabase SQL Editor hoặc: node scripts/run-sql-file.mjs supabase-bao-cao-san-luong-nvl-dinh-muc.sql

create extension if not exists pgcrypto;

create table if not exists public.bao_cao_san_luong_nvl_dinh_muc (
  id uuid primary key default gen_random_uuid(),
  id_bao_cao_nghiem_thu uuid not null
    references public.bao_cao_nghiem_thu (id) on delete cascade,
  ma_sp text not null default '',
  ten_sp text not null default '',
  so_luong_sp numeric,
  don_vi_sp text,
  stt integer not null default 0,
  ma_nvl text not null default '',
  ten_nvl text not null default '',
  don_vi text not null default '',
  -- percent | quantity
  loai_dinh_muc text not null default 'quantity',
  -- ĐM / 1 SP (% hoặc số lượng theo ĐVT)
  dinh_muc numeric,
  -- Theo SL: quantity = dinh_muc × so_luong_sp; percent = giữ % định mức
  so_luong_theo_sl numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bao_cao_sl_nvl_dm_bao_cao
  on public.bao_cao_san_luong_nvl_dinh_muc (id_bao_cao_nghiem_thu);

create index if not exists idx_bao_cao_sl_nvl_dm_ma_sp
  on public.bao_cao_san_luong_nvl_dinh_muc (ma_sp);

create or replace function public.set_bao_cao_sl_nvl_dm_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_sl_nvl_dm_updated_at on public.bao_cao_san_luong_nvl_dinh_muc;

create trigger trg_bao_cao_sl_nvl_dm_updated_at
before update on public.bao_cao_san_luong_nvl_dinh_muc
for each row
execute function public.set_bao_cao_sl_nvl_dm_updated_at();

alter table public.bao_cao_san_luong_nvl_dinh_muc enable row level security;

drop policy if exists "bao_cao_sl_nvl_dm_select_all" on public.bao_cao_san_luong_nvl_dinh_muc;
create policy "bao_cao_sl_nvl_dm_select_all"
  on public.bao_cao_san_luong_nvl_dinh_muc for select using (true);

drop policy if exists "bao_cao_sl_nvl_dm_insert_all" on public.bao_cao_san_luong_nvl_dinh_muc;
create policy "bao_cao_sl_nvl_dm_insert_all"
  on public.bao_cao_san_luong_nvl_dinh_muc for insert with check (true);

drop policy if exists "bao_cao_sl_nvl_dm_update_all" on public.bao_cao_san_luong_nvl_dinh_muc;
create policy "bao_cao_sl_nvl_dm_update_all"
  on public.bao_cao_san_luong_nvl_dinh_muc for update using (true) with check (true);

drop policy if exists "bao_cao_sl_nvl_dm_delete_all" on public.bao_cao_san_luong_nvl_dinh_muc;
create policy "bao_cao_sl_nvl_dm_delete_all"
  on public.bao_cao_san_luong_nvl_dinh_muc for delete using (true);

comment on table public.bao_cao_san_luong_nvl_dinh_muc is
  'Snapshot NVL định mức theo dòng báo cáo sản lượng; đồng bộ từ Thành phần Kho sản phẩm.';
comment on column public.bao_cao_san_luong_nvl_dinh_muc.loai_dinh_muc is
  'percent = tỉ lệ %; quantity = số lượng / 1 SP.';
comment on column public.bao_cao_san_luong_nvl_dinh_muc.so_luong_theo_sl is
  'quantity: ĐM × SL SP; percent: giữ đúng % định mức.';
