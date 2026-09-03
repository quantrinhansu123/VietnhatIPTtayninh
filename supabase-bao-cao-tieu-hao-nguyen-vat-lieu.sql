-- bao_cao_tieu_hao_nguyen_vat_lieu — snapshot tab «Báo cáo tiêu hao nguyên vật liệu»
-- trên /phan-tich-tu-dong. Tên = tên tab không dấu, khoảng trắng → _.
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.bao_cao_tieu_hao_nguyen_vat_lieu (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bao_cao_tieu_hao_nguyen_vat_lieu
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists ca_label text,
  add column if not exists may text not null default '',
  add column if not exists ma_lenh text not null default '',
  add column if not exists group_key text not null default '',
  add column if not exists stt integer not null default 1,
  add column if not exists nhom text,
  add column if not exists ma_nvl text,
  add column if not exists ten_nvl text,
  add column if not exists don_vi text,
  add column if not exists ti_le_dinh_muc_percent numeric,
  add column if not exists ti_le_thuc_te_tb_percent numeric,
  add column if not exists thuc_tron_kg numeric,
  add column if not exists xuat_kho_kg numeric,
  add column if not exists ton_dau_kg numeric,
  add column if not exists nhap_thanh_pham_kg numeric,
  add column if not exists loi_hong_kg numeric,
  add column if not exists ton_cuoi_kg numeric,
  add column if not exists xuat_thuc_te_kg numeric,
  add column if not exists chenh_lech_kg numeric,
  add column if not exists so_dong_nvl integer,
  add column if not exists tong_thuc_tron_lenh_kg numeric,
  add column if not exists tong_xuat_lenh_kg numeric,
  add column if not exists tong_ton_dau_lenh_kg numeric,
  add column if not exists tong_ton_cuoi_lenh_kg numeric;

create index if not exists bao_cao_tieu_hao_nguyen_vat_lieu_khoa_idx
  on public.bao_cao_tieu_hao_nguyen_vat_lieu (khoa_on_dinh);

create unique index if not exists bao_cao_tieu_hao_nguyen_vat_lieu_khoa_stt_uidx
  on public.bao_cao_tieu_hao_nguyen_vat_lieu (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_bao_cao_tieu_hao_nguyen_vat_lieu_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_tieu_hao_nguyen_vat_lieu_updated_at
  on public.bao_cao_tieu_hao_nguyen_vat_lieu;
create trigger trg_bao_cao_tieu_hao_nguyen_vat_lieu_updated_at
before update on public.bao_cao_tieu_hao_nguyen_vat_lieu
for each row execute function public.set_bao_cao_tieu_hao_nguyen_vat_lieu_updated_at();

alter table public.bao_cao_tieu_hao_nguyen_vat_lieu enable row level security;

drop policy if exists "bao_cao_tieu_hao_nguyen_vat_lieu_select_all" on public.bao_cao_tieu_hao_nguyen_vat_lieu;
create policy "bao_cao_tieu_hao_nguyen_vat_lieu_select_all"
  on public.bao_cao_tieu_hao_nguyen_vat_lieu for select using (true);

drop policy if exists "bao_cao_tieu_hao_nguyen_vat_lieu_insert_all" on public.bao_cao_tieu_hao_nguyen_vat_lieu;
create policy "bao_cao_tieu_hao_nguyen_vat_lieu_insert_all"
  on public.bao_cao_tieu_hao_nguyen_vat_lieu for insert with check (true);

drop policy if exists "bao_cao_tieu_hao_nguyen_vat_lieu_update_all" on public.bao_cao_tieu_hao_nguyen_vat_lieu;
create policy "bao_cao_tieu_hao_nguyen_vat_lieu_update_all"
  on public.bao_cao_tieu_hao_nguyen_vat_lieu for update using (true) with check (true);

drop policy if exists "bao_cao_tieu_hao_nguyen_vat_lieu_delete_all" on public.bao_cao_tieu_hao_nguyen_vat_lieu;
create policy "bao_cao_tieu_hao_nguyen_vat_lieu_delete_all"
  on public.bao_cao_tieu_hao_nguyen_vat_lieu for delete using (true);

comment on table public.bao_cao_tieu_hao_nguyen_vat_lieu is
  'Snapshot tab Bao cao tieu hao NVL (/phan-tich-tu-dong). Ghi khi Tinh toan.';
comment on column public.bao_cao_tieu_hao_nguyen_vat_lieu.nhom is
  'nhua | khac — khop UI NVL nhua/phu gia tron vs NVL khac.';
