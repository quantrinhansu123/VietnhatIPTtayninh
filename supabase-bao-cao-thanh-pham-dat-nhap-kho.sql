-- bao_cao_thanh_pham_dat_nhap_kho — snapshot tab «Báo cáo thành phẩm đạt nhập kho»
-- trên /phan-tich-tu-dong. Tên = tên tab không dấu, khoảng trắng → _.
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.bao_cao_thanh_pham_dat_nhap_kho (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bao_cao_thanh_pham_dat_nhap_kho
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
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists don_vi text,
  add column if not exists sl_yeu_cau numeric,
  add column if not exists tl_yeu_cau_kg numeric,
  add column if not exists sl_thuc_te numeric,
  add column if not exists tl_thuc_te_kg numeric,
  add column if not exists tl_nhua_kg numeric,
  add column if not exists tl_mang_kg numeric,
  add column if not exists ti_le_sl_dat_percent numeric,
  add column if not exists ti_le_kl_nhua_percent numeric,
  add column if not exists so_dong_sp integer,
  add column if not exists tong_sl_yeu_cau numeric,
  add column if not exists tong_tl_yeu_cau_kg numeric,
  add column if not exists tong_sl_thuc_te numeric,
  add column if not exists tong_tl_thuc_te_kg numeric;

create index if not exists bao_cao_thanh_pham_dat_nhap_kho_khoa_idx
  on public.bao_cao_thanh_pham_dat_nhap_kho (khoa_on_dinh);

create unique index if not exists bao_cao_thanh_pham_dat_nhap_kho_khoa_stt_uidx
  on public.bao_cao_thanh_pham_dat_nhap_kho (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_bao_cao_thanh_pham_dat_nhap_kho_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_thanh_pham_dat_nhap_kho_updated_at
  on public.bao_cao_thanh_pham_dat_nhap_kho;
create trigger trg_bao_cao_thanh_pham_dat_nhap_kho_updated_at
before update on public.bao_cao_thanh_pham_dat_nhap_kho
for each row execute function public.set_bao_cao_thanh_pham_dat_nhap_kho_updated_at();

alter table public.bao_cao_thanh_pham_dat_nhap_kho enable row level security;

drop policy if exists "bao_cao_thanh_pham_dat_nhap_kho_select_all" on public.bao_cao_thanh_pham_dat_nhap_kho;
create policy "bao_cao_thanh_pham_dat_nhap_kho_select_all"
  on public.bao_cao_thanh_pham_dat_nhap_kho for select using (true);

drop policy if exists "bao_cao_thanh_pham_dat_nhap_kho_insert_all" on public.bao_cao_thanh_pham_dat_nhap_kho;
create policy "bao_cao_thanh_pham_dat_nhap_kho_insert_all"
  on public.bao_cao_thanh_pham_dat_nhap_kho for insert with check (true);

drop policy if exists "bao_cao_thanh_pham_dat_nhap_kho_update_all" on public.bao_cao_thanh_pham_dat_nhap_kho;
create policy "bao_cao_thanh_pham_dat_nhap_kho_update_all"
  on public.bao_cao_thanh_pham_dat_nhap_kho for update using (true) with check (true);

drop policy if exists "bao_cao_thanh_pham_dat_nhap_kho_delete_all" on public.bao_cao_thanh_pham_dat_nhap_kho;
create policy "bao_cao_thanh_pham_dat_nhap_kho_delete_all"
  on public.bao_cao_thanh_pham_dat_nhap_kho for delete using (true);

comment on table public.bao_cao_thanh_pham_dat_nhap_kho is
  'Snapshot tab Bao cao thanh pham dat nhap kho (/phan-tich-tu-dong). Ghi khi Tinh toan.';
