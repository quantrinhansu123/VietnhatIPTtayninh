-- du_lieu_trong_bao_cao_kiem_ton_cuoi_ca — snapshot tab «Dữ liệu trong báo cáo kiểm tồn cuối ca»
-- trên /phan-tich-tu-dong. Tên = tên tab không dấu, khoảng trắng → _.
-- KHÔNG trùng bao_cao_may_nvl_ton (phiếu nguồn tồn đầu/cuối ca).
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca
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
  add column if not exists ma_nvl text,
  add column if not exists ten_nvl text,
  add column if not exists don_vi text,
  add column if not exists loai_dinh_muc text,
  add column if not exists dinh_muc_rate numeric,
  add column if not exists dinh_muc_unit text,
  add column if not exists ti_le_dinh_muc_percent numeric,
  add column if not exists ti_le_thuc_te_tb_percent numeric,
  add column if not exists ton_cuoi_sl numeric,
  add column if not exists ton_cuoi_kg numeric,
  add column if not exists tu_nns_tron boolean,
  add column if not exists nns_tron_ton_cuoi_kg numeric,
  add column if not exists ton_cuoi_truc_tiep_kg numeric,
  add column if not exists so_dong_nvl integer,
  add column if not exists so_sp integer,
  add column if not exists tong_ton_cuoi_lenh_kg numeric;

create index if not exists du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_khoa_idx
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca (khoa_on_dinh);

create index if not exists du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_ngay_ma_lenh_idx
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca (ngay desc, ma_lenh);

create unique index if not exists du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_khoa_stt_uidx
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_updated_at
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca;
create trigger trg_du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_updated_at
before update on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca
for each row execute function public.set_du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_updated_at();

alter table public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca enable row level security;

drop policy if exists "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_select_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca;
create policy "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_select_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca for select using (true);

drop policy if exists "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_insert_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca;
create policy "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_insert_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca for insert with check (true);

drop policy if exists "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_update_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca;
create policy "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_update_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca for update using (true) with check (true);

drop policy if exists "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_delete_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca;
create policy "du_lieu_trong_bao_cao_kiem_ton_cuoi_ca_delete_all"
  on public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca for delete using (true);

comment on table public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca is
  'Snapshot tab Kiem ton cuoi ca (/phan-tich-tu-dong). Khac bao_cao_may_nvl_ton. Ghi khi Tinh toan.';
