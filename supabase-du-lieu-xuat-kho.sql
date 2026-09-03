-- du_lieu_xuat_kho — snapshot tab «Dữ liệu xuất kho» trên /phan-tich-tu-dong
-- Tên bảng = tên tab không dấu, khoảng trắng → _.
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.du_lieu_xuat_kho (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.du_lieu_xuat_kho
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  -- Cùng khóa bộ lọc với bb_bao_cao_tinh_toan / bc_lsx
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists ca_label text,
  add column if not exists may text not null default '',
  add column if not exists ma_lenh text not null default '',
  add column if not exists group_key text not null default '',
  -- Sản phẩm (nhóm con)
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists don_vi_sp text,
  add column if not exists sl_sp numeric,
  add column if not exists dinh_muc_sp_kg numeric,
  add column if not exists tong_dinh_muc_sp_kg numeric,
  -- Dòng NVL
  add column if not exists stt integer not null default 1,
  add column if not exists ma_phieu text,
  add column if not exists slip_line_key text,
  add column if not exists ma_nvl text,
  add column if not exists ten_nvl text,
  add column if not exists don_vi text,
  add column if not exists sl_dinh_muc numeric,
  add column if not exists trong_luong_dinh_muc_kg numeric,
  add column if not exists sl_xuat numeric,
  add column if not exists trong_luong_xuat_kg numeric,
  add column if not exists ti_le_percent numeric,
  add column if not exists khop_lenh boolean,
  -- Tổng lệnh (denormalized)
  add column if not exists so_dong_nvl_lenh integer,
  add column if not exists tong_tl_dinh_muc_lenh_kg numeric,
  add column if not exists tong_tl_xuat_lenh_kg numeric;

create index if not exists du_lieu_xuat_kho_khoa_idx
  on public.du_lieu_xuat_kho (khoa_on_dinh);

create index if not exists du_lieu_xuat_kho_ngay_ma_lenh_idx
  on public.du_lieu_xuat_kho (ngay desc, ma_lenh);

create unique index if not exists du_lieu_xuat_kho_khoa_stt_uidx
  on public.du_lieu_xuat_kho (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_du_lieu_xuat_kho_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_du_lieu_xuat_kho_updated_at on public.du_lieu_xuat_kho;
create trigger trg_du_lieu_xuat_kho_updated_at
before update on public.du_lieu_xuat_kho
for each row
execute function public.set_du_lieu_xuat_kho_updated_at();

alter table public.du_lieu_xuat_kho enable row level security;

drop policy if exists "du_lieu_xuat_kho_select_all" on public.du_lieu_xuat_kho;
create policy "du_lieu_xuat_kho_select_all"
  on public.du_lieu_xuat_kho for select using (true);

drop policy if exists "du_lieu_xuat_kho_insert_all" on public.du_lieu_xuat_kho;
create policy "du_lieu_xuat_kho_insert_all"
  on public.du_lieu_xuat_kho for insert with check (true);

drop policy if exists "du_lieu_xuat_kho_update_all" on public.du_lieu_xuat_kho;
create policy "du_lieu_xuat_kho_update_all"
  on public.du_lieu_xuat_kho for update using (true) with check (true);

drop policy if exists "du_lieu_xuat_kho_delete_all" on public.du_lieu_xuat_kho;
create policy "du_lieu_xuat_kho_delete_all"
  on public.du_lieu_xuat_kho for delete using (true);

comment on table public.du_lieu_xuat_kho is
  'Snapshot tab Du lieu xuat kho (/phan-tich-tu-dong). Ghi khi bam Tinh toan. 1 dong = 1 NVL trong SP/lenh.';
comment on column public.du_lieu_xuat_kho.khoa_on_dinh is
  'Khoa bo loc — trung khoa bb_bao_cao_tinh_toan / bc_lsx.';
comment on column public.du_lieu_xuat_kho.trong_luong_dinh_muc_kg is
  'Trong luong dinh muc = SL SP x KL (kg) thanh phan NVL x allocationRatio.';
comment on column public.du_lieu_xuat_kho.ti_le_percent is
  'Ti le % = TL dinh muc ma NVL trong SP / tong TL dinh muc ma NVL ca lenh.';
