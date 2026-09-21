-- =============================================================================
-- FULL schema DB tồn (ton) — paste trên project SUPABASE_TON_URL
-- Project: yyddiuaankcrqfgbzusf
-- =============================================================================

create extension if not exists pgcrypto;

-- >>> supabase-bao-cao-may-nvl-ton.sql
-- Bang bao cao NVL ton theo tung may
create extension if not exists pgcrypto;

create table if not exists public.bao_cao_may_nvl_ton (
  id uuid primary key default gen_random_uuid(),
  ngay date not null,
  ca text not null,
  gio text,
  ma_may text,
  ten_may text,
  nhan_su text,
  tong_so_luong_ton numeric(14,2) not null default 0,
  ghi_chu text,
  chi_tiet jsonb not null default '[]'::jsonb,
  loai_bao_cao text not null default 'dau_ca',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bao_cao_may_nvl_ton_ngay
  on public.bao_cao_may_nvl_ton (ngay desc);

create index if not exists idx_bao_cao_may_nvl_ton_ma_may
  on public.bao_cao_may_nvl_ton (ma_may);

create index if not exists idx_bao_cao_may_nvl_ton_chi_tiet
  on public.bao_cao_may_nvl_ton using gin (chi_tiet);

create index if not exists idx_bao_cao_may_nvl_ton_loai
  on public.bao_cao_may_nvl_ton (loai_bao_cao);

create or replace function public.set_bao_cao_may_nvl_ton_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_may_nvl_ton_updated_at
  on public.bao_cao_may_nvl_ton;

create trigger trg_bao_cao_may_nvl_ton_updated_at
before update on public.bao_cao_may_nvl_ton
for each row
execute function public.set_bao_cao_may_nvl_ton_updated_at();

comment on table public.bao_cao_may_nvl_ton is 'Bao cao NVL ton theo tung may.';
comment on column public.bao_cao_may_nvl_ton.chi_tiet is 'Danh sach NVL ton: stt, ma_nvl, ten_nvl, don_vi, so_luong_ton_dinh_muc, so_luong_ton, so_luong_ton_ca_truoc, ghi_chu.';
comment on column public.bao_cao_may_nvl_ton.loai_bao_cao is 'Loai bao cao: dau_ca hoac cuoi_ca.';

-- >>> supabase-bao-cao-may-nvl-ton-loai.sql
-- Them loai bao cao dau ca / cuoi ca cho NVL ton theo may
alter table public.bao_cao_may_nvl_ton
  add column if not exists loai_bao_cao text not null default 'dau_ca';

create index if not exists idx_bao_cao_may_nvl_ton_loai
  on public.bao_cao_may_nvl_ton (loai_bao_cao);

comment on column public.bao_cao_may_nvl_ton.loai_bao_cao is 'Loai bao cao: dau_ca hoac cuoi_ca.';
