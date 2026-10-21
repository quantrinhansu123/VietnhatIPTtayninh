-- =============================================================================
-- Trả kho NVL — phiếu trả nguyên vật liệu từ sản xuất về kho
-- Chạy trên DB chính (SUPABASE_URL) trong SQL Editor → Run
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Header phiếu trả kho NVL
-- -----------------------------------------------------------------------------
create table if not exists public.tra_kho_nvl (
  id uuid primary key default gen_random_uuid(),
  ma_phieu text not null,
  ngay date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  ca text,
  may text,
  ten_kho text,
  nguoi_lap text,
  ghi_chu text,
  ly_do text not null default 'Trả kho NVL',
  status text not null default 'chua_chot',
  ma_phieu_nhap text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_tra_kho_nvl_ma_phieu unique (ma_phieu),
  constraint chk_tra_kho_nvl_status check (status in ('chua_chot', 'da_chot'))
);

create index if not exists idx_tra_kho_nvl_ngay on public.tra_kho_nvl (ngay desc);
create index if not exists idx_tra_kho_nvl_status on public.tra_kho_nvl (status);
create index if not exists idx_tra_kho_nvl_ca_may on public.tra_kho_nvl (ca, may);

comment on table public.tra_kho_nvl is 'Header phieu tra kho NVL (tu san xuat ve kho).';
comment on column public.tra_kho_nvl.ma_phieu is 'Ma phieu tra kho (TK-NVL-...).';
comment on column public.tra_kho_nvl.status is 'chua_chot | da_chot. Khi chot ghi phieu_nhap/nhap_kho.';
comment on column public.tra_kho_nvl.ma_phieu_nhap is 'Ma phieu nhap kho (DB kho) sau khi chot.';

alter table public.tra_kho_nvl enable row level security;

drop policy if exists "tra_kho_nvl_select_all" on public.tra_kho_nvl;
create policy "tra_kho_nvl_select_all"
  on public.tra_kho_nvl for select using (true);

drop policy if exists "tra_kho_nvl_insert_all" on public.tra_kho_nvl;
create policy "tra_kho_nvl_insert_all"
  on public.tra_kho_nvl for insert with check (true);

drop policy if exists "tra_kho_nvl_update_all" on public.tra_kho_nvl;
create policy "tra_kho_nvl_update_all"
  on public.tra_kho_nvl for update using (true) with check (true);

drop policy if exists "tra_kho_nvl_delete_all" on public.tra_kho_nvl;
create policy "tra_kho_nvl_delete_all"
  on public.tra_kho_nvl for delete using (true);

-- -----------------------------------------------------------------------------
-- 2) Dòng phiếu trả kho NVL
-- -----------------------------------------------------------------------------
create table if not exists public.tra_kho_nvl_dong (
  id uuid primary key default gen_random_uuid(),
  ma_phieu text not null,
  ma_npl text not null,
  ten_npl text,
  don_vi text,
  so_luong numeric(18, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_tra_kho_nvl_dong_ma_phieu on public.tra_kho_nvl_dong (ma_phieu);
create index if not exists idx_tra_kho_nvl_dong_ma_npl on public.tra_kho_nvl_dong (ma_npl);

comment on table public.tra_kho_nvl_dong is 'Dong NVL trong phieu tra kho.';
comment on column public.tra_kho_nvl_dong.ma_phieu is 'Khop tra_kho_nvl.ma_phieu.';
comment on column public.tra_kho_nvl_dong.ma_npl is 'Ma nguyen phu lieu (kho_nvl.ma_npl).';
comment on column public.tra_kho_nvl_dong.so_luong is 'So luong tra ve kho.';

alter table public.tra_kho_nvl_dong enable row level security;

drop policy if exists "tra_kho_nvl_dong_select_all" on public.tra_kho_nvl_dong;
create policy "tra_kho_nvl_dong_select_all"
  on public.tra_kho_nvl_dong for select using (true);

drop policy if exists "tra_kho_nvl_dong_insert_all" on public.tra_kho_nvl_dong;
create policy "tra_kho_nvl_dong_insert_all"
  on public.tra_kho_nvl_dong for insert with check (true);

drop policy if exists "tra_kho_nvl_dong_update_all" on public.tra_kho_nvl_dong;
create policy "tra_kho_nvl_dong_update_all"
  on public.tra_kho_nvl_dong for update using (true) with check (true);

drop policy if exists "tra_kho_nvl_dong_delete_all" on public.tra_kho_nvl_dong;
create policy "tra_kho_nvl_dong_delete_all"
  on public.tra_kho_nvl_dong for delete using (true);
