-- bao_cao_san_luong — snapshot tab «Báo cáo sản lượng» trên /phan-tich-tu-dong
-- Tên = tên tab không dấu, khoảng trắng → _.
-- KHÔNG trùng:
--   bao_cao_nghiem_thu              (phiếu nguồn /bao-cao-san-luong)
--   bao_cao_san_luong_nvl_dinh_muc  (snapshot NVL theo từng phiếu nghiệm thu)
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.bao_cao_san_luong (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bao_cao_san_luong
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists ca_label text,
  add column if not exists may text not null default '',
  add column if not exists ma_lenh text not null default '',
  add column if not exists group_key text not null default '',
  -- SP
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists don_vi_sp text,
  add column if not exists sl_sp numeric,
  add column if not exists tl_sp_kg numeric,
  add column if not exists ti_le_sp_percent numeric,
  -- NVL
  add column if not exists stt integer not null default 1,
  add column if not exists ma_nvl text,
  add column if not exists ten_nvl text,
  add column if not exists don_vi text,
  add column if not exists loai_dinh_muc text,
  add column if not exists dinh_muc_rate numeric,
  add column if not exists dinh_muc_unit text,
  add column if not exists ti_le_dinh_muc_percent numeric,
  add column if not exists sl_nvl numeric,
  add column if not exists tl_nvl_dinh_muc_kg numeric,
  add column if not exists tl_nvl_thuc_te_kg numeric,
  -- Tổng lệnh / SP (denormalized)
  add column if not exists so_dong_nvl_sp integer,
  add column if not exists so_sp_lenh integer,
  add column if not exists tong_tl_dinh_muc_lenh_kg numeric,
  add column if not exists tong_tl_thuc_te_lenh_kg numeric;

create index if not exists bao_cao_san_luong_khoa_idx
  on public.bao_cao_san_luong (khoa_on_dinh);

create index if not exists bao_cao_san_luong_ngay_ma_lenh_idx
  on public.bao_cao_san_luong (ngay desc, ma_lenh);

create unique index if not exists bao_cao_san_luong_khoa_stt_uidx
  on public.bao_cao_san_luong (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_bao_cao_san_luong_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_san_luong_updated_at on public.bao_cao_san_luong;
create trigger trg_bao_cao_san_luong_updated_at
before update on public.bao_cao_san_luong
for each row
execute function public.set_bao_cao_san_luong_updated_at();

alter table public.bao_cao_san_luong enable row level security;

drop policy if exists "bao_cao_san_luong_select_all" on public.bao_cao_san_luong;
create policy "bao_cao_san_luong_select_all"
  on public.bao_cao_san_luong for select using (true);

drop policy if exists "bao_cao_san_luong_insert_all" on public.bao_cao_san_luong;
create policy "bao_cao_san_luong_insert_all"
  on public.bao_cao_san_luong for insert with check (true);

drop policy if exists "bao_cao_san_luong_update_all" on public.bao_cao_san_luong;
create policy "bao_cao_san_luong_update_all"
  on public.bao_cao_san_luong for update using (true) with check (true);

drop policy if exists "bao_cao_san_luong_delete_all" on public.bao_cao_san_luong;
create policy "bao_cao_san_luong_delete_all"
  on public.bao_cao_san_luong for delete using (true);

comment on table public.bao_cao_san_luong is
  'Snapshot tab Bao cao san luong (/phan-tich-tu-dong). Khac bao_cao_nghiem_thu va bao_cao_san_luong_nvl_dinh_muc. Ghi khi Tinh toan.';
comment on column public.bao_cao_san_luong.khoa_on_dinh is
  'Khoa bo loc — trung khoa bb_bao_cao_tinh_toan / bc_lsx / …';
comment on column public.bao_cao_san_luong.tl_nvl_thuc_te_kg is
  'TL NVL thuc te (kg) tren UI — cot TL NVL.';
