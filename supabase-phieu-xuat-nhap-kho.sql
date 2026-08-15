-- Chay trong Supabase SQL Editor
-- Bang luu tung dong chi tiet xuat/nhap kho NVL (gom theo ma_phieu)

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
  add column if not exists can_cu_bao_cao text;

create index if not exists phieu_xuat_nhap_kho_ma_phieu_idx on public.phieu_xuat_nhap_kho (ma_phieu);
create index if not exists phieu_xuat_nhap_kho_ngay_phieu_idx on public.phieu_xuat_nhap_kho (ngay_phieu desc);
create index if not exists phieu_xuat_nhap_kho_may_idx on public.phieu_xuat_nhap_kho (may);
create index if not exists phieu_xuat_nhap_kho_loai_phieu_idx on public.phieu_xuat_nhap_kho (loai_phieu);
create index if not exists phieu_xuat_nhap_kho_loai_kho_idx on public.phieu_xuat_nhap_kho (loai_kho);
create index if not exists phieu_xuat_nhap_kho_ma_npl_loai_idx on public.phieu_xuat_nhap_kho (ma_npl, loai_phieu);
create index if not exists phieu_xuat_nhap_kho_id_dong_nhap_nguon_idx on public.phieu_xuat_nhap_kho (id_dong_nhap_nguon);

alter table public.phieu_xuat_nhap_kho enable row level security;

drop policy if exists "phieu_xuat_nhap_kho_select_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_select_all"
  on public.phieu_xuat_nhap_kho for select
  using (true);

drop policy if exists "phieu_xuat_nhap_kho_insert_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_insert_all"
  on public.phieu_xuat_nhap_kho for insert
  with check (true);

drop policy if exists "phieu_xuat_nhap_kho_delete_all" on public.phieu_xuat_nhap_kho;
create policy "phieu_xuat_nhap_kho_delete_all"
  on public.phieu_xuat_nhap_kho for delete
  using (true);

comment on table public.phieu_xuat_nhap_kho is 'Phieu xuat nhap kho NVL — moi dong la mot mat hang trong phieu.';
comment on column public.phieu_xuat_nhap_kho.ma_phieu is 'Ma phieu gom nhieu dong chi tiet.';
comment on column public.phieu_xuat_nhap_kho.loai_phieu is 'nhap hoac xuat.';
comment on column public.phieu_xuat_nhap_kho.ca is 'Ca san xuat / ca xuat nhap kho.';
comment on column public.phieu_xuat_nhap_kho.may is 'May san xuat / may xuat nhap kho.';
comment on column public.phieu_xuat_nhap_kho.loai_kho is 'nvl hoac san_pham.';
comment on column public.phieu_xuat_nhap_kho.ma_sp is 'Ma san pham khi loai_kho = san_pham.';
comment on column public.phieu_xuat_nhap_kho.ten_sp is 'Ten san pham khi loai_kho = san_pham.';
comment on column public.phieu_xuat_nhap_kho.don_gia is 'Don gia tung dong.';
comment on column public.phieu_xuat_nhap_kho.thanh_tien is 'Thanh tien = don_gia * so_luong.';
comment on column public.phieu_xuat_nhap_kho.so_luong_chung_tu is
  'Số lượng chứng từ của phiếu xuất; phiếu nhập để null.';
comment on column public.phieu_xuat_nhap_kho.id_dong_nhap_nguon is
  'Id dong phieu nhap NVL ma dong xuat nay tru ton. Null voi nhap hoac xuat cu.';
comment on column public.phieu_xuat_nhap_kho.ma_phieu_nhap_nguon is
  'Ma phieu nhap nguon (de in/hien thi nhanh).';
comment on column public.phieu_xuat_nhap_kho.can_cu_bao_cao is
  'Ma/so bao cao nguon dung lam can cu lap phieu xuat nhap kho.';
