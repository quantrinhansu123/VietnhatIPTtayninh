-- =============================================================================
-- DB TỒN KHO (project riêng — SUPABASE_TON_URL)
-- =============================================================================
-- Cách chạy:
--   1. Mở Supabase project TỒN (không phải DB he-thong)
--   2. SQL Editor → New query → dán toàn bộ file này → Run
--   3. Trong .env app:
--        SUPABASE_TON_URL=https://<project-ref>.supabase.co
--        SUPABASE_TON_SERVICE_KEY=<service_role key>
--        SUPABASE_TON_DB_LABEL=ton
--        SUPABASE_MACHINE_NVL_REPORTS_TABLE=bao_cao_may_nvl_ton
--
-- Bảng chính trên DB này:
--   • bao_cao_may_nvl_ton  — phiếu tồn NVL theo máy (đầu ca / cuối ca)
--     API: /api/bao-cao-may-nvl-ton · UI: /bao-cao-may-nvl-ton
--
-- Lưu ý phân tách DB:
--   • Tính tồn kho sổ cái (/ton-kho, /kho-hang) nằm trên DB he-thong
--     (kho_nvl + san_pham + phieu_xuat_nhap_kho + RPC supabase-ton-kho-rpc.sql).
--   • Kiểm kho (/kiem-kho) thường nằm DB riêng SUPABASE_KIEM_KHO_* —
--     xem supabase-kiem-kho.sql + supabase-kiem-kho-tong-hop.sql.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Bảng báo cáo tồn NVL theo máy
-- -----------------------------------------------------------------------------
create table if not exists public.bao_cao_may_nvl_ton (
  id uuid primary key default gen_random_uuid(),
  ngay date not null,
  ca text not null,
  gio text,
  ma_may text,
  ten_may text,
  nhan_su text,
  tong_so_luong_ton numeric(14, 2) not null default 0,
  ghi_chu text,
  chi_tiet jsonb not null default '[]'::jsonb,
  loai_bao_cao text not null default 'dau_ca'
    check (loai_bao_cao in ('dau_ca', 'cuoi_ca')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bao_cao_may_nvl_ton
  add column if not exists ngay date,
  add column if not exists ca text,
  add column if not exists gio text,
  add column if not exists ma_may text,
  add column if not exists ten_may text,
  add column if not exists nhan_su text,
  add column if not exists tong_so_luong_ton numeric(14, 2) not null default 0,
  add column if not exists ghi_chu text,
  add column if not exists chi_tiet jsonb not null default '[]'::jsonb,
  add column if not exists loai_bao_cao text not null default 'dau_ca',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Chống trùng: cùng ngày + ca + máy + loại (đầu/cuối ca)
create unique index if not exists uq_bao_cao_may_nvl_ton_ngay_ca_may_loai
  on public.bao_cao_may_nvl_ton (
    ngay,
    ca,
    coalesce(ma_may, ''),
    loai_bao_cao
  );

create index if not exists idx_bao_cao_may_nvl_ton_ngay
  on public.bao_cao_may_nvl_ton (ngay desc);

create index if not exists idx_bao_cao_may_nvl_ton_ma_may
  on public.bao_cao_may_nvl_ton (ma_may);

create index if not exists idx_bao_cao_may_nvl_ton_loai
  on public.bao_cao_may_nvl_ton (loai_bao_cao);

create index if not exists idx_bao_cao_may_nvl_ton_chi_tiet
  on public.bao_cao_may_nvl_ton using gin (chi_tiet);

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

comment on table public.bao_cao_may_nvl_ton is
  'Bao cao ton NVL theo tung may — dau_ca / cuoi_ca. DB ton (SUPABASE_TON_*).';
comment on column public.bao_cao_may_nvl_ton.chi_tiet is
  'JSON mang NVL: stt, ma_nvl, ten_nvl, don_vi, so_luong_ton_dinh_muc, so_luong_ton, so_luong_ton_ca_truoc, ghi_chu.';
comment on column public.bao_cao_may_nvl_ton.loai_bao_cao is
  'dau_ca | cuoi_ca';

-- -----------------------------------------------------------------------------
-- 2) RLS + quyền (service_role / anon dùng từ Node)
-- -----------------------------------------------------------------------------
alter table public.bao_cao_may_nvl_ton enable row level security;

drop policy if exists "bao_cao_may_nvl_ton_select_all" on public.bao_cao_may_nvl_ton;
create policy "bao_cao_may_nvl_ton_select_all"
  on public.bao_cao_may_nvl_ton for select
  using (true);

drop policy if exists "bao_cao_may_nvl_ton_insert_all" on public.bao_cao_may_nvl_ton;
create policy "bao_cao_may_nvl_ton_insert_all"
  on public.bao_cao_may_nvl_ton for insert
  with check (true);

drop policy if exists "bao_cao_may_nvl_ton_update_all" on public.bao_cao_may_nvl_ton;
create policy "bao_cao_may_nvl_ton_update_all"
  on public.bao_cao_may_nvl_ton for update
  using (true)
  with check (true);

drop policy if exists "bao_cao_may_nvl_ton_delete_all" on public.bao_cao_may_nvl_ton;
create policy "bao_cao_may_nvl_ton_delete_all"
  on public.bao_cao_may_nvl_ton for delete
  using (true);

grant select, insert, update, delete on table public.bao_cao_may_nvl_ton
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Kiểm tra nhanh sau khi Run
-- -----------------------------------------------------------------------------
-- select count(*) from public.bao_cao_may_nvl_ton;
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'bao_cao_may_nvl_ton'
-- order by ordinal_position;
