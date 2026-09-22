-- =============================================================================
-- DB kho mới (djdwfzxdyjgikppvnknc) — tạo phieu_xuat_nhap_kho + cột báo cáo
-- SQL Editor project djdwfzx… → Run toàn bộ file này
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.phieu_xuat_nhap_kho (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.phieu_xuat_nhap_kho
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ma_phieu text,
  add column if not exists loai_phieu text,
  add column if not exists ngay_phieu date,
  add column if not exists ca text,
  add column if not exists may text,
  add column if not exists ma_npl text,
  add column if not exists ten_npl text,
  add column if not exists don_vi text,
  add column if not exists so_luong numeric,
  add column if not exists don_gia numeric,
  add column if not exists thanh_tien numeric,
  add column if not exists ly_do text,
  add column if not exists ghi_chu text,
  add column if not exists nguoi_lap text,
  add column if not exists nhan_su text,
  add column if not exists loai_kho text default 'nvl',
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists so_luong_chung_tu numeric,
  add column if not exists id_dong_nhap_nguon uuid,
  add column if not exists ma_phieu_nhap_nguon text,
  add column if not exists can_cu_bao_cao text,
  add column if not exists ten_kho text,
  add column if not exists treo boolean default false,
  add column if not exists link_anh_can_thuc_te text,
  add column if not exists id_bao_cao_nghiem_thu uuid,
  add column if not exists id_bao_cao_hang_hong bigint;

create index if not exists phieu_xuat_nhap_kho_ma_phieu_idx on public.phieu_xuat_nhap_kho (ma_phieu);
create index if not exists phieu_xuat_nhap_kho_ngay_phieu_idx on public.phieu_xuat_nhap_kho (ngay_phieu desc);
create index if not exists phieu_xuat_nhap_kho_loai_phieu_idx on public.phieu_xuat_nhap_kho (loai_phieu);
create index if not exists phieu_xuat_nhap_kho_loai_kho_idx on public.phieu_xuat_nhap_kho (loai_kho);

create unique index if not exists phieu_xuat_nhap_kho_bao_cao_nghiem_thu_uidx
  on public.phieu_xuat_nhap_kho (id_bao_cao_nghiem_thu)
  where id_bao_cao_nghiem_thu is not null;

create unique index if not exists phieu_xuat_nhap_kho_bao_cao_hang_hong_uidx
  on public.phieu_xuat_nhap_kho (id_bao_cao_hang_hong)
  where id_bao_cao_hang_hong is not null;

alter table public.phieu_xuat_nhap_kho enable row level security;

drop policy if exists "phieu_xuat_nhap_kho_select_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_select_all"
  on public.phieu_xuat_nhap_kho for select using (true);

drop policy if exists "phieu_xuat_nhap_kho_insert_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_insert_all"
  on public.phieu_xuat_nhap_kho for insert with check (true);

drop policy if exists "phieu_xuat_nhap_kho_update_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_update_all"
  on public.phieu_xuat_nhap_kho for update using (true) with check (true);

drop policy if exists "phieu_xuat_nhap_kho_delete_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_delete_all"
  on public.phieu_xuat_nhap_kho for delete using (true);

grant select, insert, update, delete on table public.phieu_xuat_nhap_kho to anon, authenticated, service_role;
