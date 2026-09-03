-- du_lieu_trong_bao_cao_hang_loi_hong — snapshot tab «Dữ liệu trong báo cáo hàng lỗi hỏng»
-- trên /phan-tich-tu-dong. Tên = tên tab không dấu, khoảng trắng → _.
-- KHÔNG trùng bao_cao_hang_hong (phiếu nguồn /bao-cao-hang-hong) hay bao_cao_nghiem_thu.
-- Ghi khi bấm «Tính toán». Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.du_lieu_trong_bao_cao_hang_loi_hong (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.du_lieu_trong_bao_cao_hang_loi_hong
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists ca_label text,
  add column if not exists may text not null default '',
  add column if not exists ma_lenh text not null default '',
  add column if not exists group_key text not null default '',
  -- Dòng NVL (mixingLines trên UI)
  add column if not exists stt integer not null default 1,
  add column if not exists nhom text,
  add column if not exists ma_nvl text,
  add column if not exists ten_nvl text,
  add column if not exists don_vi text,
  add column if not exists ti_le_tron_percent numeric,
  add column if not exists ti_le_dinh_muc_percent numeric,
  add column if not exists trong_luong_loi_kg numeric,
  -- Tổng lệnh
  add column if not exists so_dong_nvl integer,
  add column if not exists tong_nhua_loi_kg numeric,
  add column if not exists tong_loi_hong_kg numeric,
  add column if not exists rac_mang_xi_kg numeric;

create index if not exists du_lieu_trong_bao_cao_hang_loi_hong_khoa_idx
  on public.du_lieu_trong_bao_cao_hang_loi_hong (khoa_on_dinh);

create index if not exists du_lieu_trong_bao_cao_hang_loi_hong_ngay_ma_lenh_idx
  on public.du_lieu_trong_bao_cao_hang_loi_hong (ngay desc, ma_lenh);

create unique index if not exists du_lieu_trong_bao_cao_hang_loi_hong_khoa_stt_uidx
  on public.du_lieu_trong_bao_cao_hang_loi_hong (khoa_on_dinh, group_key, stt)
  where khoa_on_dinh <> '' and group_key <> '';

create or replace function public.set_du_lieu_trong_bao_cao_hang_loi_hong_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_du_lieu_trong_bao_cao_hang_loi_hong_updated_at
  on public.du_lieu_trong_bao_cao_hang_loi_hong;
create trigger trg_du_lieu_trong_bao_cao_hang_loi_hong_updated_at
before update on public.du_lieu_trong_bao_cao_hang_loi_hong
for each row
execute function public.set_du_lieu_trong_bao_cao_hang_loi_hong_updated_at();

alter table public.du_lieu_trong_bao_cao_hang_loi_hong enable row level security;

drop policy if exists "du_lieu_trong_bao_cao_hang_loi_hong_select_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong;
create policy "du_lieu_trong_bao_cao_hang_loi_hong_select_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong for select using (true);

drop policy if exists "du_lieu_trong_bao_cao_hang_loi_hong_insert_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong;
create policy "du_lieu_trong_bao_cao_hang_loi_hong_insert_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong for insert with check (true);

drop policy if exists "du_lieu_trong_bao_cao_hang_loi_hong_update_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong;
create policy "du_lieu_trong_bao_cao_hang_loi_hong_update_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong for update using (true) with check (true);

drop policy if exists "du_lieu_trong_bao_cao_hang_loi_hong_delete_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong;
create policy "du_lieu_trong_bao_cao_hang_loi_hong_delete_all"
  on public.du_lieu_trong_bao_cao_hang_loi_hong for delete using (true);

comment on table public.du_lieu_trong_bao_cao_hang_loi_hong is
  'Snapshot tab Du lieu trong bao cao hang loi hong (/phan-tich-tu-dong). Khac bao_cao_hang_hong. Ghi khi Tinh toan.';
comment on column public.du_lieu_trong_bao_cao_hang_loi_hong.nhom is
  'tron | con_lai — khop UI NVL tron / NVL con lai.';
comment on column public.du_lieu_trong_bao_cao_hang_loi_hong.trong_luong_loi_kg is
  'Trong luong loi = tong nhua loi × ti le % (NVL tron); NVL con lai thuong null.';
